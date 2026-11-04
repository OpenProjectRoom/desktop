const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const { addCliTool, removeComponent } = require('../desktop/component-management.cjs');
const { addMapComponent } = require('../desktop/map-components.cjs');
const { loadConfig } = require('./config.cjs');

test('manual CLI and data sources persist in YAML and removal clears references only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-component-management-'));
  try {
    const file = path.join(root, 'productview.yaml');
    fs.copyFileSync(path.join(__dirname, '..', 'productview.yaml'), file);
    const first = addCliTool(root, { name: 'Inspector', executable: 'node', args: 'tools/inspect.cjs\nscan', cwd: '.', mode: 'task', summary: 'Inspects project state', usage: 'node tools/inspect.cjs scan', helpArg: '--help' });
    const second = addCliTool(root, { name: 'Inspector', executable: 'node', args: 'tools/other.cjs', mode: 'server', summary: 'Runs another tool', usage: 'node tools/other.cjs' });
    assert.equal(first.id, 'inspector');
    assert.equal(second.id, 'inspector-2');
    assert.deepEqual(first.config.components.find(item => item.id === first.id).runtime.command, ['node', 'tools/inspect.cjs', 'scan']);
    assert.deepEqual(first.config.components.find(item => item.id === first.id).cli.helpCommand, ['node', 'tools/inspect.cjs', 'scan', '--help']);
    assert.ok(second.config.workspace.additionalViews.includes('commands'));
    const data = addMapComponent(root, { kind: 'database', name: 'Analytics', engine: 'PostgreSQL', connectionEnv: 'ANALYTICS_URL', linkedTo: 'api' });
    assert.equal(data.config.components.find(item => item.id === data.id).data.connectionEnv, 'ANALYTICS_URL');
    const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'));
    doc.setIn(['views', 'specifications', 'links'], [{ spec: 'specs/001-example/spec.md', components: [first.id, data.id] }]);
    doc.getIn(['product', 'roadmap'], true).items[0].set('relatedComponents', [first.id, data.id]);
    fs.writeFileSync(file, String(doc));
    removeComponent(root, first.id);
    const afterCli = removeComponent(root, data.id).config;
    assert.equal(afterCli.components.some(item => [first.id, data.id].includes(item.id)), false);
    assert.equal(afterCli.components.some(item => item.id === second.id), true);
    assert.equal(afterCli.connections.some(edge => edge.from === data.id || edge.to === data.id), false);
    assert.deepEqual(afterCli.views.specifications.links[0].components, []);
    assert.deepEqual(afterCli.product.roadmap[0].relatedComponents, []);
    assert.equal(fs.existsSync(path.join(root, 'tools', 'inspect.cjs')), false);
    assert.deepEqual(loadConfig(file).config, afterCli);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid CLI input never changes repository YAML', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-component-management-'));
  try {
    const file = path.join(root, 'productview.yaml');
    fs.copyFileSync(path.join(__dirname, '..', 'productview.yaml'), file);
    const original = fs.readFileSync(file, 'utf8');
    assert.throws(() => addCliTool(root, { name: 'Bad', executable: 'node', args: 'x', mode: 'task', summary: 'Bad', usage: 'bad', cwd: '../other' }), /relative project path/);
    assert.throws(() => removeComponent(root, 'missing'), /cannot be removed/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
