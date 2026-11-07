const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { declarations, listEnvironment, readEnvironment, saveEnvironment, deleteEnvironment, runtimeEnvironment, redactOutput } = require('../desktop/environment.cjs');

const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: value => value.toString('utf8').slice('encrypted:'.length)
};
const config = {
  workspace: { environment: [{ name: 'API_TOKEN', description: 'Local API credential' }] },
  components: [
    { id: 'api', name: 'API', runtime: { environment: ['API_TOKEN', 'API_ONLY'] } },
    { id: 'worker', name: 'Worker', runtime: {} },
    { id: 'postgres', name: 'PostgreSQL', data: { connectionEnv: 'DATABASE_URL' } }
  ],
  connections: [{ from: 'api', to: 'postgres', label: 'uses' }]
};

test('project variables use the existing .env and are isolated to declared components', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-env-'));
  const userData = path.join(base, 'app-data');
  const project = path.join(base, 'project');
  fs.mkdirSync(project);
  try {
    execFileSync('git', ['init', '-q', project]);
    fs.writeFileSync(path.join(project, '.env'), '# Existing project values\nUNRELATED=keep-me\nDATABASE_URL=postgres://local-test\n');
    assert.deepEqual(declarations(config).map(item => item.name), ['API_ONLY', 'API_TOKEN', 'DATABASE_URL']);
    const initial = listEnvironment(userData, project, config, encryption);
    assert.equal(initial.variables.find(item => item.name === 'API_TOKEN').status, 'missing');
    assert.equal(initial.variables.find(item => item.name === 'DATABASE_URL').status, 'stored');
    saveEnvironment(userData, project, config, encryption, 'API_TOKEN', 'test-private-value');
    saveEnvironment(userData, project, config, encryption, 'API_ONLY', 'only-for-api');
    assert.equal(readEnvironment(userData, project, config, encryption, 'API_TOKEN'), 'test-private-value');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).API_TOKEN, 'test-private-value');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).API_ONLY, 'only-for-api');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).DATABASE_URL, 'postgres://local-test');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[1]).API_ONLY, undefined);
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[1]).DATABASE_URL, undefined);
    assert.equal(listEnvironment(userData, project, config, encryption).variables.find(item => item.name === 'API_TOKEN').status, 'stored');
    const file = path.join(project, '.env');
    assert.match(fs.readFileSync(file, 'utf8'), /^# Existing project values\nUNRELATED=keep-me/m);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(execFileSync('git', ['-C', project, 'check-ignore', '.env'], { encoding: 'utf8' }).trim(), '.env');
    assert.equal(fs.existsSync(path.join(userData, 'environment')), false);
    assert.throws(() => saveEnvironment(userData, project, config, encryption, 'UNKNOWN', 'value'), /Unknown environment variable/);
    deleteEnvironment(userData, project, config, encryption, 'API_TOKEN');
    assert.equal(readEnvironment(userData, project, config, encryption, 'API_TOKEN'), null);
    assert.match(fs.readFileSync(file, 'utf8'), /UNRELATED=keep-me/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('older encrypted values migrate once without replacing existing .env values', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-env-migrate-'));
  const project = path.join(base, 'project');
  const userData = path.join(base, 'app-data');
  fs.mkdirSync(project);
  try {
    fs.writeFileSync(path.join(project, '.env'), 'DATABASE_URL=postgres://new-value\n');
    const id = require('node:crypto').createHash('sha256').update(fs.realpathSync(project)).digest('hex');
    const legacy = path.join(userData, 'environment', `${id}.json`);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ version: 1, values: {
      API_TOKEN: encryption.encryptString('old-private-value').toString('base64'),
      DATABASE_URL: encryption.encryptString('postgres://old-value').toString('base64')
    } }));
    assert.equal(readEnvironment(userData, project, config, encryption, 'API_TOKEN'), 'old-private-value');
    assert.equal(readEnvironment(userData, project, config, encryption, 'DATABASE_URL'), 'postgres://new-value');
    assert.equal(fs.existsSync(legacy), false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('a stored value can be read exactly for explicit clipboard copying without appearing in the variable list', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-env-copy-'));
  try {
    const value = 'postgres://reader:p%40ss@localhost:5432/orders?sslmode=disable';
    fs.writeFileSync(path.join(project, '.env'), `DATABASE_URL="${value}"\n`);
    assert.equal(readEnvironment(project, project, config, encryption, 'DATABASE_URL'), value);
    const listed = listEnvironment(project, project, config, encryption);
    assert.equal(listed.variables.find(item => item.name === 'DATABASE_URL').status, 'stored');
    assert.equal(JSON.stringify(listed).includes(value), false);
    assert.equal(readEnvironment(project, project, config, encryption, 'API_TOKEN'), null);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('environment editor refuses a tracked or linked .env', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-env-safety-'));
  const project = path.join(base, 'project');
  fs.mkdirSync(project);
  try {
    execFileSync('git', ['init', '-q', project]);
    fs.writeFileSync(path.join(project, '.env'), 'API_TOKEN=existing\n');
    execFileSync('git', ['-C', project, 'add', '.env']);
    assert.equal(listEnvironment(base, project, config, encryption).storageAvailable, false);
    assert.throws(() => saveEnvironment(base, project, config, encryption, 'API_TOKEN', 'private'), /tracked by Git/);
    assert.equal(fs.readFileSync(path.join(project, '.env'), 'utf8'), 'API_TOKEN=existing\n');
    execFileSync('git', ['-C', project, 'rm', '--cached', '-q', '.env']);
    fs.unlinkSync(path.join(project, '.env'));
    const external = path.join(base, 'external');
    fs.writeFileSync(external, 'API_TOKEN=existing\n');
    fs.symlinkSync(external, path.join(project, '.env'));
    assert.throws(() => readEnvironment(base, project, config, encryption, 'API_TOKEN'), /regular file/);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('command output masks a value split across chunks', () => {
  let output = '';
  const redactor = redactOutput(['private-value'], text => { output += text; });
  redactor.write('start pri');
  redactor.write('vate-value end');
  redactor.end();
  assert.equal(output.includes('private-value'), false);
  assert.equal(output, 'start ' + '•'.repeat('private-value'.length) + ' end');
});
