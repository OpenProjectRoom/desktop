const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listSpecifications } = require('./specifications.cjs');

test('Spec Kit features connect requirements, runtime components and recorded tests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-spec-kit-'));
  const write = (relative, content) => { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  try {
    write('.specify/memory/constitution.md', '# Project rules\n');
    write('.specify/feature.json', JSON.stringify({ feature_directory: 'specs/001-auth' }));
    write('specs/001-auth/spec.md', '# Authentication\n\n**FR-001** login\n**SC-001** success\n[NEEDS CLARIFICATION: recovery]\n');
    write('specs/001-auth/plan.md', '# Plan\n');
    write('specs/001-auth/tasks.md', '- [x] T001 [US1] Build login\n- [ ] T002 [US1] Test login\n');
    write('specs/001-auth/checklists/requirements.md', '- [x] Clear goal\n- [ ] Reviewed\n');
    const config = { components: [{ id: 'api', kind: 'service', name: 'API', runtime: { command: ['./missing'], cwd: '.' } }, { id: 'api-tests', kind: 'testSuite', name: 'API tests' }], connections: [], views: { specifications: { roots: ['specs'], links: [{ spec: 'specs/001-auth/spec.md', requirements: ['FR-001', 'FR-999'], components: ['api'], tests: ['api-tests'] }] } } };
    const found = listSpecifications(root, config, { status: { api: 'running' }, events: [{ type: 'test.finished', component: 'api-tests', exitCode: 0, at: '2020-01-01T00:00:00Z' }] });
    assert.equal(found.specKit.detected, true);
    assert.equal(found.specKit.constitution, '.specify/memory/constitution.md');
    assert.equal(found.entries[0].path, '.specify/memory/constitution.md');
    const feature = found.specKit.features[0];
    assert.equal(feature.active, true);
    assert.deepEqual(feature.tasks, { total: 2, done: 1 });
    assert.deepEqual(feature.checklists, { total: 2, done: 1 });
    assert.deepEqual(feature.requirementIds, ['FR-001']);
    assert.equal(feature.components[0].status, 'running');
    assert.equal(feature.tests[0].result, 'passed before spec changed');
    assert.match(feature.checks.map(item => item.message).join('\n'), /FR-999|missing/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ordinary flat specification folders remain ordinary folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-spec-flat-'));
  try {
    fs.mkdirSync(path.join(root, 'specs'));
    fs.writeFileSync(path.join(root, 'specs', 'PILOT.md'), '# Pilot\n');
    const found = listSpecifications(root, { components: [], connections: [], views: { specifications: { roots: ['specs'] } } });
    assert.equal(found.specKit.detected, false);
    assert.equal(found.specKit.features.length, 0);
    assert.ok(found.entries.some(item => item.path === 'specs/PILOT.md'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Spec Kit bug and idea artifacts are discovered without moving their files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-spec-work-'));
  const write = (relative, content) => { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  try {
    write('.specify/bugs/login-crash/assessment.md', '# Login crash\n');
    write('.specify/bugs/login-crash/fix.md', '# Fix\n');
    write('.specify/assessments/offline-mode/intake.md', '# Offline mode\n');
    write('.specify/assessments/offline-mode/decision.md', '# Decision\n');
    const found = listSpecifications(root, { components: [], connections: [], views: {} });
    assert.equal(found.specKit.detected, true);
    assert.deepEqual(found.specKit.bugs.map(item => [item.title, item.artifacts]), [['Login crash', ['assessment.md', 'fix.md']]]);
    assert.deepEqual(found.specKit.ideas.map(item => [item.title, item.artifacts]), [['Offline mode', ['intake.md', 'decision.md']]]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
