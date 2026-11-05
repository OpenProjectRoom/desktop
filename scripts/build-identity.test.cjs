const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBuildIdentity, listBuildIdentities } = require('../desktop/build-identity.cjs');
const { parseConfig } = require('./config.cjs');
const YAML = require('yaml');

test('a build timestamp comes from an actual metadata file and stays separate from source Git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obr-build-'));
  try {
    const item = { id: 'api', kind: 'service', runtime: { cwd: 'api' }, build: { file: 'api/dist/build-info.json' } };
    fs.mkdirSync(path.join(root, 'api/dist'), { recursive: true });
    assert.deepEqual(readBuildIdentity(root, item, 'aabbccddee11'), { builtAt: null, revision: null, version: null, source: null, sourceRevision: 'aabbccddee11' });
    fs.writeFileSync(path.join(root, 'api/dist/build-info.json'), JSON.stringify({ builtAt: '2026-11-05T12:34:56+01:00', revision: 'aabbccddeeff0011', version: '1.2.3' }));
    const result = readBuildIdentity(root, item, 'ffeeddccbbaa');
    assert.equal(result.builtAt, '2026-11-05T11:34:56.000Z');
    assert.equal(result.revision, 'aabbccddeeff0011');
    assert.equal(result.sourceRevision, 'ffeeddccbbaa');
    assert.equal(result.version, '1.2.3');
    const snapshot = { ...result, startedAt: '2026-11-05T13:00:00.000Z' };
    fs.writeFileSync(path.join(root, 'api/dist/build-info.json'), JSON.stringify({ builtAt: '2026-11-05T15:00:00Z' }));
    assert.deepEqual(listBuildIdentities(root, [item], new Map([['api', snapshot]])).api, snapshot);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('schema accepts a build file for a service and MCP server but rejects a path escape', () => {
  const config = YAML.parse(fs.readFileSync(path.join(__dirname, '../productview.yaml'), 'utf8'));
  config.components.find(item => item.kind === 'service').build = { file: 'dist/build-info.json' };
  config.workspace.mcpServers = [{ id: 'example', name: 'Example', command: 'node', build: { file: 'mcp/build-info.json' } }];
  assert.doesNotThrow(() => parseConfig(YAML.stringify(config)));
  config.workspace.mcpServers[0].build.file = '../outside.json';
  assert.throws(() => parseConfig(YAML.stringify(config)), /invalid/);
});

test('invalid timestamps and paths outside the workspace never become build evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obr-build-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'obr-outside-'));
  try {
    fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify({ builtAt: '2026-11-05', version: '<script>' }));
    assert.equal(readBuildIdentity(root, { build: { file: 'build-info.json' } }).builtAt, null);
    fs.writeFileSync(path.join(outside, 'private.json'), JSON.stringify({ builtAt: '2026-11-05T11:00:00Z' }));
    fs.symlinkSync(path.join(outside, 'private.json'), path.join(root, 'linked.json'));
    assert.equal(readBuildIdentity(root, { build: { file: 'linked.json' } }).builtAt, null);
    assert.equal(readBuildIdentity(root, { build: { file: '../private.json' } }).builtAt, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
