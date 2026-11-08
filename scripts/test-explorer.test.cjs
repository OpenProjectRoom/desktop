const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { listCases, parseCargoList } = require('../desktop/test-explorer.cjs');

test('Test Explorer renders a configured suite when opened', () => {
  const context = {
    document: { addEventListener() {} },
    projectConfig: { components: [{ id: 'checks', kind: 'testSuite', name: 'Checks', tests: { command: ['node', '--test'] } }] },
    projectRoot: '/example',
    pv: null,
    pvHistory: [],
    desktopStatus: {},
    state: { page: 'tests' },
    escapeHtml: String,
    icon: () => '',
    pageHead: title => `<h1>${title}</h1>`,
    testsPage: () => '',
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'test-explorer.js'), 'utf8'), context);
  const html = context.testsPage();
  assert.match(html, /Test Explorer/);
  assert.match(html, /Checks/);
  assert.match(html, /Run suite/);
});

test('Node suite lists actual files and preserves build prerequisites for a single run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-tests-'));
  try {
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'tests', 'alpha.test.ts'), '');
    fs.writeFileSync(path.join(root, 'tests', 'beta.test.mjs'), '');
    fs.writeFileSync(path.join(root, 'tests', 'not-a-test.txt'), '');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'pnpm build && node --import tsx --test tests/*.test.ts tests/*.test.mjs' } }));
    const suite = { tests: { cwd: '.', command: ['pnpm', 'test'] } };
    const result = listCases(root, suite);
    assert.deepEqual(result.cases.map(entry => entry.id), ['tests/alpha.test.ts', 'tests/beta.test.mjs']);
    assert.deepEqual(result.cases[0].setup, [['pnpm', 'build']]);
    assert.deepEqual(result.cases[0].command, ['node', '--import', 'tsx', '--test', 'tests/alpha.test.ts']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Node test names appear without executing source, and a selected case runs alone', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-node-cases-'));
  try {
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'tests', 'orders.test.cjs'), `const { test } = require('node:test');\nconst fs = require('node:fs');\n// test('not a real test', () => {})\ntest('find order #1', () => fs.writeFileSync('first-ran', 'yes'));\ntest('create order', () => fs.writeFileSync('second-ran', 'yes'));\n`);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test tests/*.test.cjs' } }));
    const result = listCases(root, { tests: { cwd: '.', command: ['npm', 'test'] } });
    assert.deepEqual(result.cases.map(item => item.name), ['tests/orders.test.cjs', 'find order #1', 'create order']);
    assert.equal(fs.existsSync(path.join(root, 'first-ran')), false);
    assert.equal(fs.existsSync(path.join(root, 'second-ran')), false);
    const selected = result.cases.find(item => item.name === 'find order #1');
    assert.equal(selected.kind, 'node');
    assert.deepEqual(selected.command, ['node', '--test', '--test-name-pattern=^find order #1$', 'tests/orders.test.cjs']);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, selected.command.slice(1), { cwd: root, env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.existsSync(path.join(root, 'first-ran')), true, run.stdout + run.stderr);
    assert.equal(fs.existsSync(path.join(root, 'second-ran')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('TypeScript aliases and suites get exact case names; dynamic and duplicate names fall back to the file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-ts-cases-'));
  try {
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'tests', 'flow.test.ts'), `import { test as check, describe } from 'node:test';\nconst changing = 'runtime';\ndescribe('orders', () => {\n  check('creates (one)', () => {});\n  check('same', () => {});\n  check('same', () => {});\n  check(changing, () => {});\n  check.skip('disabled', () => {});\n  check('disabled option', { skip: true }, () => {});\n});\n`);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'pnpm build && node --import tsx --test tests/*.test.ts' } }));
    const result = listCases(root, { tests: { cwd: '.', command: ['pnpm', 'test'] } });
    assert.deepEqual(result.cases.map(item => item.name), ['tests/flow.test.ts', 'orders creates (one)']);
    assert.deepEqual(result.cases[1].command, ['node', '--import', 'tsx', '--test', '--test-name-pattern=^orders creates \\(one\\)$', 'tests/flow.test.ts']);
    assert.deepEqual(result.cases[1].setup, [['pnpm', 'build']]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('same test title in separate Node suites selects only its own branch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-node-groups-'));
  try {
    fs.writeFileSync(path.join(root, 'groups.test.cjs'), `const {describe, test} = require('node:test'); const fs = require('node:fs');\ndescribe('orders', () => test('loads', () => fs.writeFileSync('orders-ran', 'yes')));\ndescribe('customers', () => test('loads', () => fs.writeFileSync('customers-ran', 'yes')));`);
    const cases = listCases(root, { tests: { cwd: '.', command: ['node', '--test', 'groups.test.cjs'] } }).cases;
    assert.deepEqual(cases.map(item => item.name), ['groups.test.cjs', 'orders loads', 'customers loads']);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, cases[1].command.slice(1), { cwd: root, env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(fs.existsSync(path.join(root, 'orders-ran')), true);
    assert.equal(fs.existsSync(path.join(root, 'customers-ran')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Cargo list produces exact single-test commands without counting summaries', () => {
  const suite = { tests: { command: ['cargo', 'test', '--workspace'] } };
  const result = parseCargoList('Running unittests\nengine::works: test\nengine::fails: test\n2 tests, 0 benchmarks\n', suite);
  assert.deepEqual(result.map(entry => entry.id), ['engine::works', 'engine::fails']);
  assert.deepEqual(result[0].command, ['cargo', 'test', '--workspace', 'engine::works', '--', '--exact']);
});

test('Unrecognized runners show no invented individual tests; configured cases remain usable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-tests-'));
  try {
    assert.deepEqual(listCases(root, { tests: { command: ['pytest'] } }).cases, []);
    const result = listCases(root, { tests: { command: ['pytest'], cases: [{ id: 'smoke', name: 'Smoke', command: ['pytest', 'tests/test_smoke.py'] }] } });
    assert.equal(result.cases[0].name, 'Smoke');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
