const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnProject, stopProcessTree } = require('../desktop/platform-process.cjs');

test('project commands preserve arguments containing spaces', async () => {
  const child = spawnProject(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'two words'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0);
  assert.equal(output, 'two words');
});

test('Windows project commands resolve npm.cmd without a string shell', { skip: process.platform !== 'win32' }, async () => {
  const child = spawnProject('npm', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0);
  assert.match(output, /^\d+\.\d+\.\d+/);
});

test('Windows stop targets the whole process tree', () => {
  const child = { pid: 123, exitCode: null, kill() { throw new Error('parent only'); } };
  const calls = [];
  stopProcessTree(child, { platform: 'win32', killCommand: (command, args, options) => {
    calls.push({ command, args, options });
    return new EventEmitter();
  } });
  assert.deepEqual(calls[0].args, ['/PID', '123', '/T', '/F']);
  assert.equal(calls[0].command, 'taskkill.exe');
});
