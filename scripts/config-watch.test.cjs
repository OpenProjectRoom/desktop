const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { watchProjectFiles, describeConfigChange } = require('../desktop/config-watch.cjs');
const { loadConfig } = require('./config.cjs');

const VALID = 'schemaVersion: 1\nproject: { id: demo, name: Demo }\ncomponents: []\nconnections: []\n';

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-watch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.projectroom'));
  const configFile = path.join(root, '.projectroom', 'project.yaml');
  fs.writeFileSync(configFile, VALID);
  return { root, configFile };
}

// macOS FSEvents can deliver writes made just before a watch started; let them pass before measuring.
const settle = () => new Promise(resolve => setTimeout(resolve, 250));

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test('describeConfigChange ignores content the window already shows', t => {
  const { configFile } = project(t);
  assert.equal(describeConfigChange(configFile, VALID, loadConfig), null);
});

test('describeConfigChange reports a valid edit and an invalid edit without throwing', t => {
  const { configFile } = project(t);
  fs.writeFileSync(configFile, VALID.replace('Demo', 'Renamed'));
  assert.deepEqual(describeConfigChange(configFile, VALID, loadConfig), { valid: true });
  fs.writeFileSync(configFile, 'schemaVersion: 1\nproject: [');
  const broken = describeConfigChange(configFile, VALID, loadConfig);
  assert.equal(broken.valid, false);
  assert.ok(broken.message.length > 0);
  fs.rmSync(configFile);
  assert.deepEqual(describeConfigChange(configFile, VALID, loadConfig), { valid: false, message: 'The configuration file was removed.' });
});

test('watcher debounces bursts of config writes, including atomic renames, into one report', async t => {
  const { root, configFile } = project(t);
  let configEvents = 0;
  let envEvents = 0;
  const watcher = watchProjectFiles(root, { configFile, debounceMs: 80, onConfig: () => configEvents++, onEnv: () => envEvents++ });
  t.after(() => watcher.close());
  await settle();
  configEvents = 0;
  envEvents = 0;
  fs.writeFileSync(configFile, VALID.replace('Demo', 'One'));
  fs.writeFileSync(configFile, VALID.replace('Demo', 'Two'));
  const temporary = configFile + '.tmp';
  fs.writeFileSync(temporary, VALID.replace('Demo', 'Three'));
  fs.renameSync(temporary, configFile);
  await waitFor(() => configEvents > 0);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(configEvents, 1);
  assert.equal(envEvents, 0);
});

test('watcher reports .env changes separately and ignores other root files', async t => {
  const { root, configFile } = project(t);
  let configEvents = 0;
  let envEvents = 0;
  const watcher = watchProjectFiles(root, { configFile, debounceMs: 50, onConfig: () => configEvents++, onEnv: () => envEvents++ });
  t.after(() => watcher.close());
  await settle();
  configEvents = 0;
  envEvents = 0;
  fs.writeFileSync(path.join(root, 'README.md'), 'unrelated');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(envEvents, 0);
  fs.writeFileSync(path.join(root, '.env'), 'NAME=value\n');
  await waitFor(() => envEvents > 0);
  assert.equal(configEvents, 0);
});

test('closed watcher reports nothing and a missing .projectroom folder does not throw', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-watch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let events = 0;
  const watcher = watchProjectFiles(root, { configFile: path.join(root, '.projectroom', 'project.yaml'), debounceMs: 20, onConfig: () => events++, onEnv: () => events++ });
  watcher.close();
  fs.writeFileSync(path.join(root, '.env'), 'NAME=value\n');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(events, 0);
});
