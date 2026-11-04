const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

test('project variables are declared by name and stored outside the repository', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-env-'));
  const userData = path.join(base, 'app-data');
  const project = path.join(base, 'project');
  fs.mkdirSync(project);
  try {
    assert.deepEqual(declarations(config).map(item => item.name), ['API_ONLY', 'API_TOKEN', 'DATABASE_URL']);
    const initial = listEnvironment(userData, project, config, encryption);
    assert.equal(initial.variables.find(item => item.name === 'API_TOKEN').status, 'missing');
    saveEnvironment(userData, project, config, encryption, 'API_TOKEN', 'test-private-value');
    saveEnvironment(userData, project, config, encryption, 'API_ONLY', 'only-for-api');
    saveEnvironment(userData, project, config, encryption, 'DATABASE_URL', 'postgres://local-test');
    assert.equal(readEnvironment(userData, project, config, encryption, 'API_TOKEN'), 'test-private-value');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).API_TOKEN, 'test-private-value');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).API_ONLY, 'only-for-api');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[0]).DATABASE_URL, 'postgres://local-test');
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[1]).API_ONLY, undefined);
    assert.equal(runtimeEnvironment(userData, project, config, encryption, config.components[1]).DATABASE_URL, undefined);
    assert.equal(listEnvironment(userData, project, config, encryption).variables.find(item => item.name === 'API_TOKEN').status, 'stored');
    const files = fs.readdirSync(path.join(userData, 'environment'));
    assert.equal(files.length, 1);
    const file = path.join(userData, 'environment', files[0]);
    assert.equal(fs.readFileSync(file, 'utf8').includes('test-private-value'), false);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(project).length, 0);
    assert.throws(() => saveEnvironment(userData, project, config, encryption, 'UNKNOWN', 'value'), /Unknown environment variable/);
    deleteEnvironment(userData, project, config, encryption, 'API_TOKEN');
    assert.equal(readEnvironment(userData, project, config, encryption, 'API_TOKEN'), null);
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
