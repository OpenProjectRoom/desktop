const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { engine, inspect, preview } = require('../desktop/data-viewer.cjs');
const { inspectFolder } = require('../desktop/onboarding.cjs');

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
