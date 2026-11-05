const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');

function field(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function upsertIssueSource(root, input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid issue source.');
  const base = fs.realpathSync(root);
  const file = path.join(base, 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('BuildSteer cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const existing = input.id ? current.config.components.find(item => item.id === input.id && item.kind === 'issues') : null;
  if (input.id && !existing) throw new Error('Unknown issue source.');
  const name = field(input.name, 'Source name', 100);
  const provider = input.provider;
  if (!['github', 'linear'].includes(provider)) throw new Error('Choose GitHub or Linear.');
  const integration = { provider };
  if (provider === 'github') {
    const repository = field(input.repository, 'GitHub repository', 160);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Use owner/repository for GitHub.');
    integration.repository = repository;
  } else integration.teamId = field(input.teamId, 'Linear team ID', 120);
  if (input.url) {
    const url = new URL(field(input.url, 'Source URL', 500));
    if (url.protocol !== 'https:') throw new Error('Source URL must use HTTPS.');
    integration.url = url.toString();
  }
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const components = document.get('components', true);
  if (existing) {
    const index = current.config.components.findIndex(item => item.id === existing.id);
    document.setIn(['components', index, 'name'], name);
    document.setIn(['components', index, 'integration'], integration);
  } else {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'source';
    let id = `issues-${slug}`;
    for (let n = 2; current.config.components.some(item => item.id === id); n++) id = `issues-${slug}-${n}`;
    components.add({ id, kind: 'issues', name, icon: 'list', position: { x: 68, y: Math.min(1900, 650 + current.config.components.filter(item => item.kind === 'issues').length * 120) }, integration });
    const spec = current.config.components.find(item => item.kind === 'specification');
    if (spec) document.get('connections', true).add({ from: id, to: spec.id, label: 'informs' });
  }
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(base, `.productview-issues-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return loadConfig(file);
}

module.exports = { upsertIssueSource };
