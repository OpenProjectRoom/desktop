const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseEnv } = require('node:util');

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
  for (const item of config.workspace?.apiSources || []) {
    if (item.authEnv) add(item.authEnv, item.name);
    if (item.auth?.env) add(item.auth.env, item.name);
  }
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
function envFile(root) { return path.join(fs.realpathSync(root), '.env'); }
function readProjectEnv(root) {
  const file = envFile(root);
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error('The project .env must be a regular file.');
    if (fs.statSync(file).size > 1_000_000) throw new Error('The project .env is too large to edit here.');
    return parseEnv(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
function git(root, args) {
  try { execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function ensureIgnored(root) {
  if (!git(root, ['rev-parse', '--is-inside-work-tree'])) return;
  if (git(root, ['ls-files', '--error-unmatch', '--', '.env'])) throw new Error('The project .env is tracked by Git. Remove it from the index before editing secrets here.');
  if (git(root, ['check-ignore', '-q', '--', '.env'])) return;
  const ignore = path.join(root, '.gitignore');
  try { if (fs.lstatSync(ignore).isSymbolicLink()) throw new Error('Refusing a linked .gitignore.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const existing = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  fs.writeFileSync(ignore, `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}/.env\n`, { flag: 'w' });
}
function encodedValue(value) {
  if (value.includes('\n') || value.includes('\r')) throw new Error('Multiline values must be edited in the .env file directly.');
  for (const quote of ["'", '"', '`']) if (!value.includes(quote)) return `${quote}${value}${quote}`;
  throw new Error('This value contains all supported quote characters. Edit it in the .env file directly.');
}
function writeProjectEnv(root, name, value) {
  const file = envFile(root);
  ensureIgnored(root);
  let source = '';
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error('The project .env must be a regular file.');
    if (fs.statSync(file).size > 1_000_000) throw new Error('The project .env is too large to edit here.');
    source = fs.readFileSync(file, 'utf8');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lines = source ? source.split('\n') : [];
  const assignment = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const matches = lines.flatMap((line, index) => assignment.test(line) ? [index] : []);
  if (matches.length > 1) throw new Error(`${name} appears more than once in .env. Resolve the duplicate in your editor.`);
  if (matches.length && /^[\s]*(?:export\s+)?[A-Z][A-Z0-9_]*\s*=\s*(['"`])[^]*$/.test(lines[matches[0]]) && !/(['"`])\s*(?:#.*)?$/.test(lines[matches[0]])) throw new Error(`Edit the multiline ${name} value in your editor.`);
  if (matches.length) {
    if (value === null) lines.splice(matches[0], 1);
    else lines[matches[0]] = `${name}=${encodedValue(value)}`;
  } else if (value !== null) {
    if (lines.length && lines.at(-1) === '') lines.pop();
    lines.push(`${name}=${encodedValue(value)}`);
  } else return;
  const output = lines.length ? `${lines.join('\n').replace(/\n+$/, '')}\n` : '';
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function migrateLegacy(userData, root, encryption) {
  const file = vaultFile(userData, root);
  const values = readVault(userData, root);
  const names = Object.keys(values).filter(name => NAME.test(name));
  if (!names.length) return;
  if (!encryption?.isEncryptionAvailable()) throw new Error('Open the older Project Room version to recover its encrypted environment values.');
  const existing = readProjectEnv(root);
  for (const name of names) {
    if (Object.hasOwn(existing, name)) continue;
    const value = encryption.decryptString(Buffer.from(values[name], 'base64'));
    writeProjectEnv(root, name, value);
  }
  fs.unlinkSync(file);
}
function assertName(config, name) {
  if (!NAME.test(name || '') || !declarations(config).some(item => item.name === name)) throw new Error('Unknown environment variable. Declare its name in .projectroom/project.yaml first.');
}
function listEnvironment(userData, root, config, encryption) {
  migrateLegacy(userData, root, encryption);
  const values = readProjectEnv(root);
  const tracked = git(root, ['ls-files', '--error-unmatch', '--', '.env']);
  return { storageAvailable: !tracked, envTracked: tracked, variables: declarations(config).map(item => ({ ...item, status: Object.hasOwn(values, item.name) ? 'stored' : Object.hasOwn(process.env, item.name) ? 'inherited' : 'missing' })) };
}
function readEnvironment(userData, root, config, encryption, name) {
  assertName(config, name);
  migrateLegacy(userData, root, encryption);
  const values = readProjectEnv(root);
  return Object.hasOwn(values, name) ? values[name] : null;
}
function saveEnvironment(userData, root, config, encryption, name, value) {
  assertName(config, name);
  if (typeof value !== 'string' || !value || value.length > 32_000 || value.includes('\0')) throw new Error('Enter a value of 1–32,000 characters without a NUL byte.');
  migrateLegacy(userData, root, encryption);
  writeProjectEnv(root, name, value);
  return listEnvironment(userData, root, config, encryption);
}
function deleteEnvironment(userData, root, config, encryption, name) {
  assertName(config, name);
  migrateLegacy(userData, root, encryption);
  writeProjectEnv(root, name, null);
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
