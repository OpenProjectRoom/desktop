const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates } = require('../desktop/updates.cjs');

test('packaged Mac downloads an update and waits for one explicit restart', async () => {
  const updater = new EventEmitter();
  let checks = 0;
  let installs = 0;
  let firstCheck;
  updater.checkForUpdates = async () => { checks += 1; };
  updater.quitAndInstall = () => { installs += 1; };
  const seen = [];
  const updates = createUpdates({
    app: { isPackaged: true }, updater, platform: 'darwin', send: state => seen.push(state),
    delay: callback => { firstCheck = callback; }, repeat: () => 1
  });
  updates.start();
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updates.install(), false);
  await firstCheck();
  assert.equal(checks, 1);
  updater.emit('update-available', { version: '0.9.67' });
  updater.emit('download-progress', { percent: 52.8 });
  assert.equal(updates.snapshot().percent, 53);
  await updates.check();
  assert.equal(checks, 1);
  updater.emit('update-downloaded', { version: '0.9.67' });
  assert.equal(seen.at(-1).phase, 'ready');
  assert.equal(updates.install(), true);
  assert.equal(installs, 1);
  updates.stop();
});

test('development and other platforms never check or install', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = () => { throw new Error('unexpected'); };
  updater.quitAndInstall = () => { throw new Error('unexpected'); };
  const updates = createUpdates({ app: { isPackaged: false }, updater, platform: 'darwin', send: () => {} });
  updates.start();
  await updates.check();
  assert.equal(updates.install(), false);
  assert.equal(updates.enabled, false);
});
