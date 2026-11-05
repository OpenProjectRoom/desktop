const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');

const kinds = new Set(['service', 'database', 'storage', 'testSuite', 'specification', 'external']);
const icons = { service: 'terminal', database: 'database', storage: 'folder', testSuite: 'flask', specification: 'doc', external: 'cube' };

function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function addMapComponent(root, input) {
  if (!input || typeof input !== 'object' || !kinds.has(input.kind)) throw new Error('Choose a supported component type.');
  const base = fs.realpathSync(root);
  const file = path.join(base, 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('BuildSteer cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const name = text(input.name, 'Component name', 100);
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';
  const slug = /^[a-z]/.test(stem) ? stem : `component-${stem}`;
  let id = slug;
  for (let n = 2; current.config.components.some(item => item.id === id); n++) id = `${slug}-${n}`;
  let position;
  for (let row = 0; !position; row++) for (const x of [5, 36, 68]) {
    const candidate = { x, y: 70 + row * 130 };
    if (current.config.components.every(item => Math.abs(item.position.x - candidate.x) >= 25 || Math.abs(item.position.y - candidate.y) >= 118)) { position = candidate; break; }
  }
  const component = {
    id, kind: input.kind, name, icon: icons[input.kind],
    position
  };
  if (input.kind === 'service' || input.kind === 'testSuite') {
    const executable = text(input.executable, 'Executable', 120);
    const args = typeof input.args === 'string' ? input.args.split('\n').map(x => x.trim()).filter(Boolean) : [];
    if (args.some(x => x.length > 160) || args.length > 30) throw new Error('Use at most 30 arguments of 160 characters each.');
    const command = [executable, ...args];
    if (input.kind === 'service') {
      component.runtime = { command, cwd: '.', startup: 'manual' };
      if (input.port !== '' && input.port !== undefined) {
        const port = Number(input.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
        component.runtime.port = port;
      }
    } else component.tests = { command, cwd: '.' };
  } else if (input.kind === 'database') {
    component.data = { engine: text(input.engine, 'Database engine', 60) };
    if (/sqlite/i.test(component.data.engine)) component.data.path = text(input.path, 'SQLite path', 240);
    if (input.connectionEnv) {
      const env = text(input.connectionEnv, 'Environment variable', 100);
      if (!/^[A-Z][A-Z0-9_]*$/.test(env)) throw new Error('Use an environment variable name such as DATABASE_URL.');
      component.data.connectionEnv = env;
    }
  } else if (input.kind === 'storage') {
    component.data = { path: text(input.path, 'Storage path', 240) };
  } else if (input.kind === 'specification') {
    component.path = text(input.path, 'Specification path', 240);
  } else if (input.kind === 'external') {
    const url = new URL(text(input.url, 'External URL', 500));
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS URL.');
    component.url = url.toString();
  }
  const linkedTo = input.linkedTo ? text(input.linkedTo, 'Linked component ID', 120) : '';
  if (linkedTo && !current.config.components.some(item => item.id === linkedTo)) throw new Error('Linked component no longer exists.');
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  document.get('components', true).add(component);
  if (linkedTo) document.get('connections', true).add({ from: id, to: linkedTo, label: 'connected to' });
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(base, `.productview-map-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { ...loadConfig(file), id };
}

module.exports = { addMapComponent };
