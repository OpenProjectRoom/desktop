const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { checkPrerequisites } = require('../desktop/prerequisites.cjs');

function fakeSpawn(result, calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.kill = () => true;
    process.nextTick(() => result instanceof Error ? child.emit('error', result) : child.emit('close', result));
    return child;
  };
}

test('Docker requirement checks the Engine before starting a configured command', async () => {
  const calls = [];
  await checkPrerequisites(['docker'], { spawn: fakeSpawn(0, calls), env: { PATH: '' } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['info', '--format', '{{.ServerVersion}}']);
  assert.equal(calls[0].options.shell, false);
});

test('an unavailable Docker Engine produces an actionable error', async () => {
  const calls = [];
  await assert.rejects(checkPrerequisites(['docker'], { spawn: fakeSpawn(1, calls), env: { PATH: '' } }), /Start Docker Desktop.*project command was not launched/i);
});

test('missing Docker CLI and undeclared requirements are distinct', async () => {
  const calls = [];
  await assert.rejects(checkPrerequisites(['docker'], { spawn: fakeSpawn(Object.assign(new Error('missing'), { code: 'ENOENT' }), calls), env: { PATH: '' } }), /Docker CLI was not found/);
  await checkPrerequisites([], { spawn: fakeSpawn(1, calls) });
  assert.equal(calls.length, 1);
});

test('a stalled Docker check times out without starting the project', async () => {
  let killed = false;
  const spawn = () => {
    const child = new EventEmitter();
    child.kill = () => { killed = true; return true; };
    return child;
  };
  await assert.rejects(checkPrerequisites(['docker'], { spawn, timeoutMs: 5 }), /Docker did not respond/);
  assert.equal(killed, true);
});
