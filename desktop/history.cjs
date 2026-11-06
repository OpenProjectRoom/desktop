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
function regularDirectory(directory) {
  try {
    if (!fs.lstatSync(directory).isDirectory()) throw new Error(`History path is not a regular directory: ${directory}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    fs.mkdirSync(directory);
  }
}
function regularFileOrMissing(file) {
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error(`History path is not a regular file: ${file}`);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}
function ensureHistory(root) {
  const dir = historyDir(root);
  regularDirectory(dir);
  regularDirectory(path.join(dir, 'logs'));
  const readme = path.join(dir, 'README.md');
  if (!regularFileOrMissing(readme)) fs.writeFileSync(readme, '# Project Room local history\n\n`events.jsonl` records app and agent activity. `logs/` contains service and test output. They are ignored by Git because commands and prompts may contain private data. Share selected evidence only after reviewing it.\n', { flag: 'wx' });
  const ignore = path.join(dir, '.gitignore');
  if (!regularFileOrMissing(ignore)) fs.writeFileSync(ignore, 'events.jsonl\nlogs/\n', { flag: 'wx' });
  else {
    const content = fs.readFileSync(ignore, 'utf8');
    const missing = ['events.jsonl', 'logs/'].filter(pattern => !content.split(/\r?\n/).includes(pattern));
    if (missing.length) fs.appendFileSync(ignore, `${content.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
  }
  regularFileOrMissing(path.join(dir, 'events.jsonl'));
  return dir;
}
function appendEvent(root, type, details = {}) {
  if (!root) return null;
  const dir = ensureHistory(root);
  const event = { at: new Date().toISOString(), type, ...clean(details) };
  const file = path.join(dir, 'events.jsonl');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.writeSync(fd, JSON.stringify(event) + '\n'); }
  finally { fs.closeSync(fd); }
  return event;
}
function logPath(root, id, kind) {
  const safe = String(id).replace(/[^a-z0-9-]/gi, '-');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(ensureHistory(root), 'logs', `${stamp}-${kind}-${safe}.log`);
}
function readEvents(root, limit = 100) {
  if (!root) return [];
  try { if (!fs.lstatSync(historyDir(root)).isDirectory()) throw new Error('History folder is not a regular directory.'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const file = path.join(historyDir(root), 'events.jsonl');
  if (!regularFileOrMissing(file)) return [];
  if (fs.statSync(file).size > 20_000_000) throw new Error('Local history is too large to read.');
  return fs.readFileSync(file, 'utf8').trim().split('\n').slice(-limit).reverse().flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}
module.exports = { appendEvent, ensureHistory, logPath, readEvents };
