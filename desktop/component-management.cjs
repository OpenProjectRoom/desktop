const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');

function openDocument(root) {
  const base = fs.realpathSync(root);
  const file = path.join(base, 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('BuildSteer cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  return { base, file, current, document };
}

function save({ base, file, document }) {
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(base, `.productview-components-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return loadConfig(file);
}

function required(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function addCliTool(root, input) {
  if (!input || typeof input !== 'object') throw new Error('Enter a CLI tool.');
  const record = openDocument(root);
  const name = required(input.name, 'Tool name', 100);
  const executable = required(input.executable, 'Executable', 120);
  const summary = required(input.summary, 'Summary', 240);
  const usage = required(input.usage, 'Usage', 240);
  const mode = input.mode;
  if (!['task', 'server'].includes(mode)) throw new Error('Choose task or server mode.');
  const args = typeof input.args === 'string' ? input.args.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [];
  if (args.length > 30 || args.some(item => item.length > 160)) throw new Error('Use at most 30 arguments of 160 characters each.');
  const cwd = input.cwd ? required(input.cwd, 'Working directory', 240) : '.';
  if (path.isAbsolute(cwd) || cwd.split(/[\\/]/).includes('..') || cwd.includes('\\')) throw new Error('Working directory must be a relative project path.');
  let helpArg = '';
  if (input.helpArg) {
    helpArg = required(input.helpArg, 'Help argument', 20);
    if (!['--help', '-h', 'help'].includes(helpArg)) throw new Error('Choose --help, -h, help, or no help argument.');
  }
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cli';
  const slug = /^[a-z]/.test(stem) ? stem : `cli-${stem}`;
  let id = slug;
  for (let n = 2; record.current.config.components.some(item => item.id === id); n++) id = `${slug}-${n}`;
  let position;
  for (let row = 0; !position; row++) for (const x of [5, 36, 68]) {
    const place = { x, y: 70 + row * 130 };
    if (record.current.config.components.every(item => Math.abs(item.position.x - place.x) >= 25 || Math.abs(item.position.y - place.y) >= 118)) { position = place; break; }
  }
  const command = [executable, ...args];
  const component = {
    id, kind: 'commandTool', name, icon: 'terminal', position,
    runtime: { command, cwd, startup: 'manual' },
    cli: { mode, summary, usage, ...(helpArg ? { helpCommand: [...command, helpArg] } : {}) }
  };
  record.document.get('components', true).add(component);
  if (!(record.current.config.workspace?.additionalViews || []).includes('commands')) {
    if (!record.document.has('workspace')) record.document.set('workspace', {});
    const views = record.document.getIn(['workspace', 'additionalViews'], true);
    if (YAML.isSeq(views)) views.add('commands');
    else record.document.setIn(['workspace', 'additionalViews'], ['commands']);
  }
  return { ...save(record), id };
}

function removeComponent(root, id) {
  const record = openDocument(root);
  const component = record.current.config.components.find(item => item.id === id);
  if (!component || !['commandTool', 'database', 'storage', 'external'].includes(component.kind)) throw new Error('This component cannot be removed here.');
  if (record.current.config.components.length < 2) throw new Error('The project needs at least one component.');
  const components = record.document.get('components', true);
  components.items = components.items.filter(item => item.get('id') !== id);
  const connections = record.document.get('connections', true);
  connections.items = connections.items.filter(item => item.get('from') !== id && item.get('to') !== id);
  const links = record.document.getIn(['views', 'specifications', 'links'], true);
  if (YAML.isSeq(links)) for (const link of links.items) {
    const refs = link.get('components', true);
    if (YAML.isSeq(refs)) refs.items = refs.items.filter(item => item.value !== id);
    const tests = link.get('tests', true);
    if (YAML.isSeq(tests)) tests.items = tests.items.filter(item => item.value !== id);
  }
  const roadmap = record.document.getIn(['product', 'roadmap'], true);
  if (YAML.isSeq(roadmap)) for (const item of roadmap.items) {
    const refs = item.get('relatedComponents', true);
    if (YAML.isSeq(refs)) refs.items = refs.items.filter(ref => ref.value !== id);
  }
  return { ...save(record), removed: component };
}

module.exports = { addCliTool, removeComponent };
