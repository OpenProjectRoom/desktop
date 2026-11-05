const fs = require('node:fs');
const path = require('node:path');

const MAX_FIELD = 8000;
function clean(value) {
  if (typeof value === 'string') return value.slice(0, MAX_FIELD).replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  if (Array.isArray(value)) return value.slice(0, 100).map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|secret|api.?key/i.test(key)).map(([key, item]) => [key, clean(item)]));
  return value;
}
function historyDir(root) { return path.join(root, '.productview'); }
function ensureHistory(root) {
  const dir = historyDir(root);
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, '# Project Room history\n\n`events.jsonl` records app and agent activity. `logs/` contains service and test output. These files are part of this repository and can be committed for teammates. Review logs and prompts before committing; output from project commands may contain private data.\n');
  return dir;
}
function appendEvent(root, type, details = {}) {
  if (!root) return null;
  const dir = ensureHistory(root);
  const event = { at: new Date().toISOString(), type, ...clean(details) };
  fs.appendFileSync(path.join(dir, 'events.jsonl'), JSON.stringify(event) + '\n');
  return event;
}
function logPath(root, id, kind) {
  const safe = String(id).replace(/[^a-z0-9-]/gi, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(ensureHistory(root), 'logs', `${stamp}-${kind}-${safe}.log`);
}
function readEvents(root, limit = 100) {
  if (!root) return [];
  const file = path.join(historyDir(root), 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').slice(-limit).reverse().flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}
module.exports = { appendEvent, ensureHistory, logPath, readEvents };
