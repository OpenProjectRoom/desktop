const { spawnProject, stopProcessTree } = require('./platform-process.cjs');

function execute(command, { cwd, env, timeoutMs = 20000, onOutput = () => {} }) {
  if (!Array.isArray(command) || !command.length || command.some(value => typeof value !== 'string' || !value)) {
    throw new Error('Invalid detached service command.');
  }
  return new Promise((resolve, reject) => {
    const child = spawnProject(command[0], command.slice(1), {
      cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
    });
    let settled = false;
    let bytes = 0;
    const collect = chunk => {
      bytes += chunk.length;
      if (bytes <= 65536) onOutput(chunk.toString('utf8'));
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      stopProcessTree(child);
      setTimeout(() => {
        if (child.exitCode !== null) return;
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
        catch { /* Already exited. */ }
      }, 1000).unref();
      if (!settled) { settled = true; reject(new Error('Service command timed out.')); }
    }, timeoutMs);
    child.once('error', error => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(new Error(`Service command could not start: ${error.message}`)); }
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve({ exitCode: code ?? (signal ? 2 : 0) }); }
    });
  });
}

async function inspect(runtime, options) {
  const result = await execute(runtime.statusCommand, { ...options, timeoutMs: 20000, onOutput: () => {} });
  if (result.exitCode === 0) return 'running';
  if (result.exitCode === 1) return 'stopped';
  throw new Error(`Status command failed (exit ${result.exitCode}); expected 0 for running or 1 for stopped.`);
}

async function change(runtime, operation, options) {
  const before = await inspect(runtime, options);
  const expected = operation === 'start' ? 'running' : 'stopped';
  if (before === expected) return { status: expected, already: true };
  const command = operation === 'start' ? runtime.command : runtime.stopCommand;
  const result = await execute(command, { ...options, timeoutMs: operation === 'start' ? 180000 : 60000 });
  if (result.exitCode !== 0) throw new Error(`${operation} command failed (exit ${result.exitCode}). Check the project command directly.`);
  for (let attempt = 0; attempt < 10; attempt++) {
    const state = await inspect(runtime, options);
    if (state === expected) return { status: state };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${operation} command finished, but the status command did not confirm ${expected}.`);
}

module.exports = { execute, inspect, change };
