const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listCases, parseCargoList } = require('../desktop/test-explorer.cjs');

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
