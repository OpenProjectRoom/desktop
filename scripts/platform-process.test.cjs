const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnProject, stopProcessTree, projectEnvironment, resolveProjectExecutable, commandStartError } = require('../desktop/platform-process.cjs');

test('project commands preserve arguments containing spaces', async () => {
  const child = spawnProject(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'two words'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(code, 0);
  assert.equal(output, 'two words');
});

test('project commands find local tools from a nested working directory', { skip: process.platform === 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-path-'));
  try {
    const cwd = path.join(root, 'apps', 'api');
    const bin = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(path.join(root, '.projectroom'));
    fs.writeFileSync(path.join(root, '.projectroom', 'project.yaml'), 'schemaVersion: 1\n');
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(bin, { recursive: true });
    const tool = path.join(bin, 'project-room-test-tool');
    fs.writeFileSync(tool, '#!/bin/sh\nprintf "local tool found"\n', { mode: 0o755 });
    const env = { PATH: '/usr/bin' };
    const effective = projectEnvironment(env, cwd);
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(effective.PATH.split(path.delimiter)[0], '/usr/bin');
    assert.equal(effective.PATH.split(path.delimiter).filter(directory => directory === bin).length, 1);
    assert.equal(resolveProjectExecutable('project-room-test-tool', cwd, env), tool);
    const child = spawnProject('project-room-test-tool', [], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0);
    assert.equal(output, 'local tool found');
    assert.match(commandStartError({ code: 'ENOENT', message: 'spawn missing ENOENT' }, 'missing-tool', cwd, env), /Searched: \/usr\/bin/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
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
