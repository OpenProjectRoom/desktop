const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, configPath } = require('../scripts/config.cjs');

const statuses = new Set(['inbox', 'planned', 'in-progress', 'done']);
const priorities = new Set(['low', 'medium', 'high']);
const types = new Set(['feature', 'bug', 'task', 'idea']);

function backlogFolder(root, create = false) {
  const base = fs.realpathSync(root);
  const config = loadConfig(configPath(base)).config;
  const relative = config.product?.backlogRoot || 'backlog';
  if (path.isAbsolute(relative) || !relative.split(/[\\/]/).every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'))) throw new Error('Invalid backlog folder.');
  let current = base;
  for (const part of relative.split(/[\\/]/)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      if (fs.lstatSync(current).isSymbolicLink() || !fs.statSync(current).isDirectory()) throw new Error('Backlog folder must be a regular directory.');
    } else if (create) fs.mkdirSync(current);
    else return { folder: current, relative, missing: true };
  }
  return { folder: current, relative, missing: false };
}

function parseIssue(file, relative) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 200_000) throw new Error(`Backlog file is too large: ${relative}`);
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`Backlog file needs YAML frontmatter: ${relative}`);
  const meta = YAML.parse(match[1], { uniqueKeys: true });
  if (!meta || typeof meta !== 'object' || !/^PV-\d+$/.test(meta.id) || typeof meta.title !== 'string' || !statuses.has(meta.status) || !priorities.has(meta.priority) || !types.has(meta.type)) throw new Error(`Invalid backlog fields: ${relative}`);
  return { id: meta.id, title: meta.title, status: meta.status, priority: meta.priority, type: meta.type, created: meta.created || null, updated: meta.updated || null, spec: meta.spec || '', description: match[2].trim(), path: relative };
}

function listIssues(root) {
  const { folder, relative, missing } = backlogFolder(root);
  if (missing) return { root: relative, missing: true, issues: [] };
  const issues = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!/^pv-\d+.*\.md$/i.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Backlog entry must be a regular file: ${entry.name}`);
    issues.push(parseIssue(path.join(folder, entry.name), `${relative}/${entry.name}`));
  }
  const seen = new Set();
  for (const issue of issues) {
    if (seen.has(issue.id)) throw new Error(`Duplicate backlog ID: ${issue.id}`);
    seen.add(issue.id);
  }
  issues.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));
  return { root: relative, missing: false, issues };
}

function saveIssue(root, input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid issue.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 120) throw new Error('Issue title must contain 1–120 characters.');
  if (!statuses.has(input.status) || !priorities.has(input.priority) || !types.has(input.type)) throw new Error('Choose a valid status, priority and type.');
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (Buffer.byteLength(description) > 100_000) throw new Error('Issue description is too long.');
  const spec = typeof input.spec === 'string' ? input.spec.trim() : '';
  if (spec && (spec.length > 240 || path.isAbsolute(spec) || spec.split(/[\\/]/).includes('..') || !/^specs\//.test(spec))) throw new Error('Spec link must be a path below specs/.');
  const current = listIssues(root);
  const existing = input.id ? current.issues.find(issue => issue.id === input.id) : null;
  if (input.id && !existing) throw new Error('Unknown backlog issue.');
  const nextNumber = current.issues.reduce((max, issue) => Math.max(max, Number(issue.id.slice(3))), 0) + 1;
  const id = existing?.id || `PV-${String(nextNumber).padStart(3, '0')}`;
  const today = new Date().toISOString().slice(0, 10);
  const metadata = { id, title, status: input.status, priority: input.priority, type: input.type, created: existing?.created || today, updated: today, ...(spec ? { spec } : {}) };
  const content = `---\n${YAML.stringify(metadata).trimEnd()}\n---\n\n${description}\n`;
  const { folder, relative } = backlogFolder(root, true);
  const filename = existing ? path.basename(existing.path) : `${id.toLowerCase()}-${title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'issue'}.md`;
  const file = path.join(folder, filename);
  const temporary = path.join(folder, `.productview-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return parseIssue(file, `${relative}/${filename}`);
}

module.exports = { listIssues, saveIssue };
