const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { configPath, hasConfig, loadConfig, parseConfig, CONFIG_RELATIVE } = require('./config.cjs');
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

test('auto setup keeps an existing repository intact and does not model detached scripts as foreground', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-auto-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'docker compose up -d', test: 'node --test' } }));
  fs.writeFileSync(path.join(root, 'README.md'), '# Existing project\n');
  const before = fs.readdirSync(root).sort();
  const { config } = createWorkspace(root, 'auto');
  assert.deepEqual(config.components.map(item => item.kind), ['testSuite']);
  assert.equal(config.product, undefined);
  assert.deepEqual(fs.readdirSync(root).filter(name => name !== '.projectroom').sort(), before);
});

test('runtime prerequisites accept known checks and reject unknown ones', () => {
  const config = loadConfig(path.join(__dirname, '..', CONFIG_RELATIVE)).config;
  const service = config.components.find(item => item.kind === 'service');
  service.runtime.requires = ['docker'];
  assert.deepEqual(parseConfig(YAML.stringify(config)).components.find(item => item.id === service.id).runtime.requires, ['docker']);
  service.runtime.requires = ['unknown-engine'];
  assert.throws(() => parseConfig(YAML.stringify(config)), /invalid/);
});

test('auto setup distinguishes a web app from an unknown development process', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-app-auto-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite --host 127.0.0.1' } }));
  const { config } = createWorkspace(root, 'auto');
  assert.equal(config.components[0].kind, 'application');
  assert.equal(config.components[0].application.platform, 'web');
});
