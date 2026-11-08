const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const { engine, inspect, preview } = require('../desktop/data-viewer.cjs');
const { inspectFolder } = require('../desktop/onboarding.cjs');

test('opening Data Explorer lists the first source without reading a table or file', async () => {
  const clicks = [];
  const calls = [];
  const config = { components: [{ id: 'evidence', kind: 'storage', name: 'Acceptance evidence', data: { path: 'reports/evidence' } }] };
  const context = {
    document: { getElementById() { return { innerHTML: '' }; }, addEventListener(name, callback) { if (name === 'click') clicks.push(callback); } },
    projectConfig: config, projectRoot: '/sample', state: { page: 'data' }, escapeHtml: String,
    icon: () => '', pageHead: () => '', render() {},
    pv: {
      async inspectDataSource(id) { calls.push(`inspect:${id}`); return { engine: 'files', tables: [{ id: 'reports/evidence/check.json', name: 'check.json', type: 'file' }] }; },
      async previewDataEntry(id, entry) { calls.push(`preview:${id}:${entry}`); return { kind: 'file', name: 'check.json', text: '{"passed":true}' }; }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/data-viewer.js'), 'utf8'), context);
  assert.match(context.dataPage(), /Select a source to inspect it/);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['inspect:evidence']);
  assert.match(context.dataPage(), /check\.json/);
  assert.doesNotMatch(context.dataPage(), /passed/);
  await clicks.at(-1)({ target: { closest(selector) { return selector === '[data-data-viewer]' ? { dataset: { dataViewer: 'entry:reports%2Fevidence%2Fcheck.json' } } : null; } } });
  assert.deepEqual(calls, ['inspect:evidence', 'preview:evidence:reports/evidence/check.json']);
  assert.match(context.dataPage(), /passed/);
});

test('read-only SQLite viewer lists tables, columns and at most 20 rows', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-data-'));
  try {
    const db = new DatabaseSync(path.join(root, 'sample.sqlite'));
    db.exec('CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT)');
    for (let i = 0; i < 25; i++) db.prepare('INSERT INTO people (name) VALUES (?)').run(`Person ${i}`);
    db.close();
    const item = { kind: 'database', data: { engine: 'SQLite', path: 'sample.sqlite' } };
    const catalog = await inspect(root, item);
    assert.equal(catalog.tables[0].name, 'people');
    const result = await preview(root, item, null, 'people');
    assert.equal(result.rows.length, 20);
    assert.deepEqual(result.columns, ['id', 'name']);
    assert.equal(result.fields[0].primaryKey, true);
    await assert.rejects(() => preview(root, item, null, 'missing'), /not available/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('local storage previews text but rejects paths outside its folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-data-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'sample.json'), '{"ready":true}');
    fs.writeFileSync(path.join(root, 'outside.json'), '{"secret":true}');
    const item = { kind: 'storage', data: { path: 'data' } };
    const catalog = await inspect(root, item);
    assert.equal(catalog.tables[0].id, 'data/sample.json');
    assert.equal((await preview(root, item, null, 'data/sample.json')).text, '{"ready":true}');
    await assert.rejects(() => preview(root, item, null, 'outside.json'), /outside this data source/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('database engine names recognize common project labels', () => {
  assert.equal(engine({ kind: 'database', data: { engine: 'PostgreSQL 17' } }), 'postgres');
  assert.equal(engine({ kind: 'database', data: { engine: 'MariaDB' } }), 'mysql');
  assert.equal(engine({ kind: 'database', data: { engine: 'MySQL' } }), 'mysql');
  assert.equal(engine({ kind: 'storage', data: { path: 'data' } }), 'files');
});

test('onboarding labels SQLite files and storage folders as unverified candidates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-data-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'app.sqlite'), '');
    const inventory = inspectFolder(root);
    assert.deepEqual(inventory.dataCandidates, ['Local storage folder: data', 'SQLite file: data/app.sqlite']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
