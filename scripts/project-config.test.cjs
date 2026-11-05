const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configPath, hasConfig, loadConfig, CONFIG_RELATIVE } = require('./config.cjs');
const { addWorkspace, createWorkspace, discover, readRegistry } = require('../desktop/workspace.cjs');

test('new workspaces use a hidden, Git-trackable project configuration', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-config-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'sample');
  const userData = path.join(base, 'app-data');
  fs.mkdirSync(root);
  const created = createWorkspace(root, 'blank');
  assert.equal(created.root, root);
  assert.equal(created.file, path.join(root, CONFIG_RELATIVE));
  assert.equal(hasConfig(root), true);
  assert.equal(fs.existsSync(path.join(root, 'productview.yaml')), false);
  assert.deepEqual(discover(base), [root]);
  addWorkspace(userData, root);
  assert.deepEqual(readRegistry(userData), [fs.realpathSync(root)]);
});

test('legacy project configuration still opens and remains the file being edited', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-legacy-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'legacy');
  const userData = path.join(base, 'app-data');
  fs.mkdirSync(root);
  fs.copyFileSync(path.join(__dirname, '..', CONFIG_RELATIVE), path.join(root, 'productview.yaml'));
  assert.equal(configPath(root), path.join(root, 'productview.yaml'));
  assert.equal(loadConfig(configPath(root)).root, root);
  addWorkspace(userData, root);
  assert.deepEqual(readRegistry(userData), [fs.realpathSync(root)]);
  assert.throws(() => createWorkspace(root), /already has/);
});
