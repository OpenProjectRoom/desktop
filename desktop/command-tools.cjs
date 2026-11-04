const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { appendEvent, readEvents } = require('./history.cjs');
const { redactOutput } = require('./environment.cjs');

const OUTPUT_LIMIT = 64_000;
function readCommandLog(root, id) {
  const base = fs.realpathSync(root);
  const event = readEvents(base, 300).find(item => item.type === 'tool.started' && item.component === id && typeof item.log === 'string');
  if (!event) return null;
  const logs = path.join(base, '.productview', 'logs');
  const file = path.resolve(base, event.log);
  if (!file.startsWith(logs + path.sep) || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) return null;
  const stat = fs.statSync(file);
  if (!stat.isFile()) return null;
  const start = Math.max(0, stat.size - OUTPUT_LIMIT);
  const size = Math.min(stat.size, OUTPUT_LIMIT);
  const buffer = Buffer.alloc(size);
  const handle = fs.openSync(file, 'r');
  try { fs.readSync(handle, buffer, 0, size, start); } finally { fs.closeSync(handle); }
  return { text: (start ? '[Earlier output omitted]\n' : '') + buffer.toString('utf8'), at: event.at, path: event.log };
}
function runBoundedCommand(root, id, command, cwd, environment, sensitiveValues, timeoutMs, eventName) {
  if (!Array.isArray(command) || !command.length || command.some(arg => typeof arg !== 'string' || !arg || arg.includes('\0'))) throw new Error('No valid command is configured.');
  appendEvent(root, `${eventName}-requested`, { component: id, argumentCount: command.length - 1 });
  return new Promise((resolve, reject) => {
    let output = '', truncated = false, timedOut = false, settled = false;
    const child = spawn(command[0], command.slice(1), { cwd, env: environment, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = signal => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); }
      catch { /* The process may already have exited. */ }
    };
    const collect = chunk => {
      const remaining = OUTPUT_LIMIT - Buffer.byteLength(output);
      if (remaining <= 0) { truncated = true; return; }
      const text = chunk.toString('utf8');
      output += Buffer.from(text).subarray(0, remaining).toString('utf8');
      if (Buffer.byteLength(text) > remaining) truncated = true;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); setTimeout(() => { if (child.exitCode === null) stop('SIGKILL'); }, 1000).unref(); }, timeoutMs);
    child.once('error', error => { clearTimeout(timer); if (settled) return; settled = true; appendEvent(root, `${eventName}-error`, { component: id, message: error.message }); reject(new Error(`Command could not start: ${error.message}`)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (truncated) output += '\n[Output truncated at 64 KB]';
      let safeOutput = '';
      const redactor = redactOutput(sensitiveValues, text => { safeOutput += text; });
      redactor.write(output);
      redactor.end();
      const result = { output: safeOutput.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ''), exitCode: code, timedOut };
      appendEvent(root, `${eventName}-finished`, { component: id, exitCode: code, timedOut });
      resolve(result);
    });
  });
}
function readCommandHelp(root, id, command, cwd, environment = process.env, sensitiveValues = [], timeoutMs = 8000) {
  return runBoundedCommand(root, id, command, cwd, environment, sensitiveValues, timeoutMs, 'tool.help');
}
function runCliTrial(root, id, command, args, cwd, environment = process.env, sensitiveValues = []) {
  if (!Array.isArray(args) || args.length > 20 || args.some(arg => typeof arg !== 'string' || !arg.trim() || arg.length > 200 || arg.includes('\0'))) throw new Error('Enter at most 20 nonempty arguments of 200 characters each.');
  return runBoundedCommand(root, id, [...command, ...args], cwd, environment, sensitiveValues, 10000, 'tool.trial');
}
module.exports = { readCommandHelp, readCommandLog, runCliTrial };
