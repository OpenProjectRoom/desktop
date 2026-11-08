const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { FailureStore, cleanText, parseDiagnosis, diagnosisPrompt, fixPrompt } = require('../desktop/failure-assistant.cjs');

test('failed action context is bounded, redacted and scoped to its project', () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'room-failure-a-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'room-failure-b-'));
  try {
    const store = new FailureStore();
    const recorded = store.add(first, { action: 'cli-trial', componentId: 'build', command: ['pnpm', '--token=private-example'], cwd: '.', log: `Bearer private-example\n${'x'.repeat(7000)}`, retryArgs: ['--token=private-example'] }, ['private-example']);
    assert.equal(recorded.command.includes('private-example'), false);
    assert.equal(recorded.log.length <= 6000, true);
    assert.equal(store.list(second).length, 0);
    assert.throws(() => store.get(second, recorded.id), /no longer available/);
    assert.equal(JSON.stringify(recorded).includes('retryArgs'), false);
    assert.equal(store.resolveAction(first, 'cli-trial', 'build'), true);
    assert.equal(store.get(first, recorded.id).resolved, true);
  } finally { fs.rmSync(first, { recursive: true, force: true }); fs.rmSync(second, { recursive: true, force: true }); }
});

test('logs outside the project log directory are never read', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-failure-log-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=private-example');
    const entry = new FailureStore().add(root, { action: 'start', componentId: 'app', logPath: '.env' });
    assert.equal(entry.log, '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('diagnosis must be structured before a repair can be offered', () => {
  assert.throws(() => parseDiagnosis('Maybe install pnpm'), /reviewable diagnosis/);
  assert.throws(() => parseDiagnosis('{"cause":"unknown"}'), /incomplete/);
  const result = parseDiagnosis(JSON.stringify({ cause: 'PATH differs', changes: ['Update repository script'], commands: [], verification: 'Run the same action', confidence: 'medium' }));
  assert.deepEqual(result.changes, ['Update repository script']);
  assert.equal(result.confidence, 'medium');
  assert.equal(cleanText('Authorization: Bearer abc123'), 'Authorization=[redacted] [redacted]');
});

test('diagnosis and fix instructions preserve separate permissions', () => {
  const entry = { action: 'rebuild', componentId: 'app', command: 'pnpm build', cwd: '.', exitCode: 127, message: 'not found', log: 'pnpm: not found', plan: { cause: 'PATH differs', changes: ['Update script'], commands: [], verification: 'Retry' } };
  assert.match(diagnosisPrompt(entry), /Work READ-ONLY/);
  assert.match(diagnosisPrompt(entry), /missing executable from a PATH difference/);
  assert.match(fixPrompt(entry), /user approved/);
  assert.match(fixPrompt(entry), /Do not install software globally/);
});

test('investigation and approved repair show immediate progress until the agent returns', async () => {
  const modal = { innerHTML: '' };
  let clickHandler;
  let finishDiagnosis;
  let finishFix;
  const failed = { id: 'failed-1', action: 'test', command: 'pnpm test', cwd: '.', exitCode: 1, message: 'test failed', log: '' };
  const plan = { cause: 'Wrong assertion', changes: ['Fix the assertion'], commands: [], verification: 'Run the test', confidence: 'high' };
  const pv = {
    listFailures: async () => [failed],
    diagnoseFailure: () => new Promise(resolve => { finishDiagnosis = resolve; }),
    applyFailureFix: () => new Promise(resolve => { finishFix = resolve; }),
    onProcessEvent() {},
  };
  const context = {
    window: { productView: pv, addEventListener() {} },
    document: {
      addEventListener(_type, handler) { clickHandler = handler; },
      getElementById(id) { return id === 'modalRoot' ? modal : null; },
    },
    projectRoot: '/example',
    state: { page: 'tests' },
    render() {},
    escapeHtml: String,
    queueMicrotask,
    setInterval: () => 1,
    clearInterval() {},
    console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'failure-assistant.js'), 'utf8'), context);
  await new Promise(setImmediate);
  const click = (action, id) => clickHandler({ target: { closest: () => ({ dataset: { failure: action, failureId: id } }) } });
  await click('open', failed.id);
  const investigating = click('diagnose');
  assert.match(modal.innerHTML, /Investigating the problem/);
  assert.match(modal.innerHTML, /failure-spinner/);
  assert.match(modal.innerHTML, /will appear here automatically/);
  finishDiagnosis({ ...failed, plan });
  await investigating;
  assert.match(modal.innerHTML, /Wrong assertion/);
  const fixing = click('fix');
  assert.match(modal.innerHTML, /Applying the approved fix/);
  assert.match(modal.innerHTML, /Applying fix…/);
  finishFix({ ...failed, plan, fixed: true, fixResult: 'Assertion updated' });
  await fixing;
  assert.match(modal.innerHTML, /Fix attempt finished/);
  assert.match(modal.innerHTML, /Run again/);
});
