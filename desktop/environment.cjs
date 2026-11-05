const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NAME = /^[A-Z][A-Z0-9_]*$/;

function declarations(config) {
  const byName = new Map();
  const add = (name, source, description = '') => {
    if (!NAME.test(name || '')) return;
    const item = byName.get(name) || { name, sources: [], description: '' };
    if (!item.sources.includes(source)) item.sources.push(source);
    if (description && !item.description) item.description = description;
    byName.set(name, item);
  };
  for (const item of config.workspace?.environment || []) add(item.name, 'Project', item.description);
  for (const item of config.workspace?.mcpServers || []) {
    for (const name of item.environment || []) add(name, item.name);
    if (item.authEnv) add(item.authEnv, item.name);
  }
  for (const item of config.workspace?.apiSources || []) if (item.authEnv) add(item.authEnv, item.name);
  for (const item of config.components || []) {
    for (const name of item.runtime?.environment || []) add(name, item.name);
    for (const name of item.tests?.environment || []) add(name, item.name);
    for (const name of item.cli?.environment || []) add(name, item.name);
    if (item.data?.connectionEnv) add(item.data.connectionEnv, item.name);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function vaultFile(userData, root) {
  const id = crypto.createHash('sha256').update(fs.realpathSync(root)).digest('hex');
  return path.join(userData, 'environment', `${id}.json`);
}
function readVault(userData, root) {
  const file = vaultFile(userData, root);
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing linked environment store.');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.version !== 1 || !data.values || typeof data.values !== 'object') throw new Error('Invalid local environment store.');
    return data.values;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
function writeVault(userData, root, values) {
  const file = vaultFile(userData, root);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, values }), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function assertName(config, name) {
  if (!NAME.test(name || '') || !declarations(config).some(item => item.name === name)) throw new Error('Unknown environment variable. Declare its name in productview.yaml first.');
}
function listEnvironment(userData, root, config, encryption) {
  const values = readVault(userData, root);
  return { storageAvailable: encryption.isEncryptionAvailable(), variables: declarations(config).map(item => ({ ...item, status: values[item.name] ? 'stored' : Object.hasOwn(process.env, item.name) ? 'inherited' : 'missing' })) };
}
function readEnvironment(userData, root, config, encryption, name) {
  assertName(config, name);
  const value = readVault(userData, root)[name];
  if (!value) return null;
  if (!encryption.isEncryptionAvailable()) throw new Error('Secure local storage is unavailable.');
  return encryption.decryptString(Buffer.from(value, 'base64'));
}
function saveEnvironment(userData, root, config, encryption, name, value) {
  assertName(config, name);
  if (typeof value !== 'string' || !value || value.length > 32_000 || value.includes('\0')) throw new Error('Enter a value of 1–32,000 characters without a NUL byte.');
  if (!encryption.isEncryptionAvailable()) throw new Error('Secure local storage is unavailable.');
  const values = readVault(userData, root);
  values[name] = encryption.encryptString(value).toString('base64');
  writeVault(userData, root, values);
  return listEnvironment(userData, root, config, encryption);
}
function deleteEnvironment(userData, root, config, encryption, name) {
  assertName(config, name);
  const values = readVault(userData, root);
  delete values[name];
  writeVault(userData, root, values);
  return listEnvironment(userData, root, config, encryption);
}
function runtimeEnvironment(userData, root, config, encryption, component = null) {
  const result = { ...process.env };
  const applicable = new Set((config.workspace?.environment || []).map(item => item.name));
  if (component) {
    for (const name of component.runtime?.environment || []) applicable.add(name);
    for (const name of component.tests?.environment || []) applicable.add(name);
    for (const name of component.cli?.environment || []) applicable.add(name);
    for (const edge of config.connections || []) {
      if (edge.from !== component.id && edge.to !== component.id) continue;
      const other = (config.components || []).find(item => item.id === (edge.from === component.id ? edge.to : edge.from));
      if (other?.data?.connectionEnv) applicable.add(other.data.connectionEnv);
    }
  }
  for (const item of declarations(config)) {
    delete result[item.name];
    if (!component || applicable.has(item.name)) {
      const value = readEnvironment(userData, root, config, encryption, item.name);
      if (value !== null) result[item.name] = value;
      else if (Object.hasOwn(process.env, item.name)) result[item.name] = process.env[item.name];
    }
  }
  return result;
}

function redactOutput(values, sink) {
  const secrets = [...new Set(values.filter(value => typeof value === 'string' && value.length))];
  const hold = Math.max(0, ...secrets.map(value => value.length - 1));
  let pending = '';
  let pendingMask = [];
  function flush(length) {
    if (!length) return;
    for (const secret of secrets) {
      let from = 0;
      while (true) {
        const at = pending.indexOf(secret, from);
        if (at < 0) break;
        pendingMask.fill(1, at, at + secret.length);
        from = at + 1;
      }
    }
    let output = '';
    for (let i = 0; i < length; i++) output += pendingMask[i] ? '•' : pending[i];
    pending = pending.slice(length);
    pendingMask = pendingMask.slice(length);
    sink(output);
  }
  return {
    write(chunk) { pending += String(chunk); pendingMask.length = pending.length; flush(Math.max(0, pending.length - hold)); },
    end() { flush(pending.length); }
  };
}

module.exports = { declarations, listEnvironment, readEnvironment, saveEnvironment, deleteEnvironment, runtimeEnvironment, redactOutput };
