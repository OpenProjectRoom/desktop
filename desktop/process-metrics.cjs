const { execFile } = require('node:child_process');

const INTERVAL_MS = 5000;
const MAX_SAMPLES = 20000;

function compactHistory(points) {
  if (points.length <= MAX_SAMPLES) return;
  const older = points.slice(0, MAX_SAMPLES / 2).filter((_, index) => index % 2 === 0);
  points.splice(0, MAX_SAMPLES / 2, ...older);
}

function parseProcessTable(output) {
  return String(output).split(/\r?\n/).map(line => {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) return null;
    const [pid, parent, cpu, rss] = fields.map(Number);
    return [pid, parent, cpu, rss].every(Number.isFinite) && pid > 0
      ? { pid, parent, cpu: Math.max(0, cpu), rss: Math.max(0, rss) } : null;
  }).filter(Boolean);
}

function processTreeUsage(rows, rootPid) {
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (!descendants.has(row.pid) && descendants.has(row.parent)) {
      descendants.add(row.pid);
      changed = true;
    }
  }
  const selected = rows.filter(row => descendants.has(row.pid));
  if (!selected.some(row => row.pid === rootPid)) return null;
  return {
    cpu: Math.round(selected.reduce((sum, row) => sum + row.cpu, 0) * 10) / 10,
    memoryBytes: selected.reduce((sum, row) => sum + row.rss, 0) * 1024,
    processCount: selected.length
  };
}

const WINDOWS_PROCESS_QUERY = `$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process | ForEach-Object { if ($_.ProcessId -gt 0) { $ticks = [double]$_.KernelModeTime + [double]$_.UserModeTime; [Console]::Out.WriteLine('{0} {1} {2} {3}', $_.ProcessId, $_.ParentProcessId, $ticks, $_.WorkingSetSize) } }`;
let previousWindows = new Map();
let previousWindowsAt = 0;

function parseWindowsProcessTable(output) {
  return String(output).split(/\r?\n/).map(line => {
    const fields = line.trim().split(/\s+/).map(Number);
    if (fields.length !== 4 || !fields.every(Number.isFinite) || fields[0] <= 0) return null;
    const [pid, parent, cpuTicks, memoryBytes] = fields;
    return { pid, parent, cpuTicks, memoryBytes };
  }).filter(Boolean);
}

function windowsUsageRows(rows, previous, elapsedMs) {
  return rows.map(row => {
    const old = previous.get(row.pid);
    const ticks = old && old.cpuTicks <= row.cpuTicks ? row.cpuTicks - old.cpuTicks : 0;
    return { pid: row.pid, parent: row.parent,
      cpu: elapsedMs > 0 ? Math.max(0, ticks / 10000000 / (elapsedMs / 1000) * 100) : 0,
      rss: Math.max(0, row.memoryBytes / 1024) };
  });
}

function readProcessTable() {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROCESS_QUERY], { timeout: 8000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, output) => {
        if (error) return reject(error);
        const now = Date.now();
        const rows = parseWindowsProcessTable(output);
        const usage = windowsUsageRows(rows, previousWindows, now - previousWindowsAt);
        previousWindows = new Map(rows.map(row => [row.pid, row]));
        previousWindowsAt = now;
        resolve(usage);
      });
      return;
    }
    execFile('ps', ['-axo', 'pid=,ppid=,%cpu=,rss='], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (error, output) => {
      if (error) reject(error);
      else resolve(parseProcessTable(output));
    });
  });
}

class ProcessMetrics {
  constructor({ readTable = readProcessTable, onSample = () => {}, intervalMs = INTERVAL_MS } = {}) {
    this.readTable = readTable;
    this.onSample = onSample;
    this.intervalMs = intervalMs;
    this.services = new Map();
    this.totals = [];
    this.timer = null;
    this.sampling = false;
    this.generation = 0;
  }

  start(id, pid) {
    this.generation++;
    this.services.set(id, { pid, running: true, samples: [], error: null });
    if (!this.timer) {
      this.timer = setInterval(() => this.sample(), this.intervalMs);
      this.timer.unref?.();
    }
    this.sample();
  }

  stop(id) {
    const service = this.services.get(id);
    if (service) service.running = false;
    if (![...this.services.values()].some(item => item.running)) this.stopTimer();
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  reset() {
    this.generation++;
    this.stopTimer();
    this.services.clear();
    this.totals = [];
  }

  snapshot() {
    return { services: Object.fromEntries([...this.services].map(([id, item]) => [id, { running: item.running, samples: item.samples, error: item.error }])), totals: this.totals };
  }

  async sample() {
    if (this.sampling || ![...this.services.values()].some(item => item.running)) return;
    this.sampling = true;
    const generation = this.generation;
    try {
      const rows = await this.readTable();
      if (generation !== this.generation) return;
      const at = Date.now();
      let cpu = 0, memoryBytes = 0, measured = 0;
      for (const [id, item] of this.services) {
        if (!item.running || this.services.get(id) !== item) continue;
        const usage = processTreeUsage(rows, item.pid);
        if (!usage) continue;
        const point = { at, ...usage };
        item.samples.push(point);
        compactHistory(item.samples);
        item.error = null;
        cpu += usage.cpu;
        memoryBytes += usage.memoryBytes;
        measured++;
        this.onSample({ type: 'metrics', id, point });
      }
      if (measured) {
        const point = { at, cpu: Math.round(cpu * 10) / 10, memoryBytes, serviceCount: measured };
        this.totals.push(point);
        compactHistory(this.totals);
        this.onSample({ type: 'metrics-total', point });
      }
    } catch (error) {
      for (const item of this.services.values()) if (item.running) item.error = 'Process metrics unavailable on this computer.';
      this.onSample({ type: 'metrics-error' });
    } finally {
      this.sampling = false;
    }
  }
}

module.exports = { ProcessMetrics, parseProcessTable, parseWindowsProcessTable, windowsUsageRows, processTreeUsage, compactHistory };
