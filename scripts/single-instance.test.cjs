const test = require('node:test');
const assert = require('node:assert/strict');
const { useSingleInstance } = require('../desktop/single-instance.cjs');

test('a second process quits without opening a window', () => {
  const calls = [];
  const app = {
    requestSingleInstanceLock: () => false,
    quit: () => calls.push('quit'),
    on: () => calls.push('listen'),
  };
  assert.equal(useSingleInstance(app, { currentWindow: () => null, createWindow: () => calls.push('create') }), false);
  assert.deepEqual(calls, ['quit']);
});

test('a second launch restores and focuses the existing window', () => {
  const calls = [];
  let onSecondInstance;
  const app = {
    requestSingleInstanceLock: () => true,
    on: (event, listener) => { assert.equal(event, 'second-instance'); onSecondInstance = listener; },
  };
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
  assert.equal(useSingleInstance(app, { currentWindow: () => window, createWindow: () => calls.push('create') }), true);
  onSecondInstance();
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
});

test('a second launch opens a window when the app has none', () => {
  const calls = [];
  let onSecondInstance;
  const app = {
    requestSingleInstanceLock: () => true,
    on: (_event, listener) => { onSecondInstance = listener; },
  };
  useSingleInstance(app, { currentWindow: () => null, createWindow: () => calls.push('create') });
  onSecondInstance();
  assert.deepEqual(calls, ['create']);
});
