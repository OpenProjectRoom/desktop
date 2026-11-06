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
  assert.deepEqual(discover(base), [root]);
  addWorkspace(userData, root);
  assert.deepEqual(readRegistry(userData), [fs.realpathSync(root)]);
});

test('only the canonical project configuration opens as a workspace', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-config-only-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'project');
  fs.mkdirSync(root);
  fs.copyFileSync(path.join(__dirname, '..', CONFIG_RELATIVE), path.join(root, 'productview.yaml'));
  assert.equal(configPath(root), path.join(root, CONFIG_RELATIVE));
  assert.equal(hasConfig(root), false);
  assert.deepEqual(discover(base), []);
  const created = createWorkspace(root, 'blank');
  assert.equal(created.file, configPath(root));
  assert.equal(loadConfig(created.file).root, root);
});
