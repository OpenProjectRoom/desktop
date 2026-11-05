const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');
const { ensureDocumentationRoot } = require('../scripts/documentation.cjs');

const roadmapStatuses = new Set(['draft', 'planned', 'in-progress', 'done']);
function rootPath(root) { return fs.realpathSync(root); }
function inside(root, relative, mustExist = true) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid project path.');
  const base = rootPath(root);
  const absolute = path.resolve(base, relative);
  if (absolute !== base && !absolute.startsWith(base + path.sep)) throw new Error('Path leaves workspace.');
  const checked = fs.realpathSync(mustExist ? absolute : path.dirname(absolute));
  if (checked !== base && !checked.startsWith(base + path.sep)) throw new Error('Path leaves workspace.');
  return absolute;
}
function readText(root, relative) {
  try {
    const file = inside(root, relative);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 500_000) throw new Error('Document is too large.');
    const data = fs.readFileSync(file);
    if (data.includes(0)) throw new Error('Binary documents are not supported.');
    return data.toString('utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function textField(value, label, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${label} must contain 1–${limit} characters.`);
  return value.trim();
}
function slug(value) { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document'; }
function saveConfig(root, product) {
  const file = path.join(rootPath(root), 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('BuildSteer cannot edit a linked configuration file.');
  const current = fs.readFileSync(file, 'utf8');
  const document = YAML.parseDocument(current, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  document.set('product', product);
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(rootPath(root), `.productview-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return loadConfig(file);
}
function readProduct(root) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  if (!product) return { vision: null, documents: {} };
  const documents = {};
  for (const item of product.documentation) documents[item.path] = readText(root, item.path);
  return { vision: readText(root, product.vision), documents };
}
function setupProduct(root) {
  const config = loadConfig(path.join(rootPath(root), 'productview.yaml')).config;
  if (config.product) return loadConfig(path.join(rootPath(root), 'productview.yaml'));
  const docsRoot = 'docs/product';
  const docsFolder = rootPath(root);
  for (const relative of ['docs', docsRoot]) {
    const candidate = path.join(docsFolder, relative);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Documentation folder cannot be a symbolic link.');
  }
  fs.mkdirSync(path.join(docsFolder, 'docs'), { recursive: true });
  inside(root, 'docs');
  fs.mkdirSync(path.join(docsFolder, docsRoot), { recursive: true });
  inside(root, docsRoot);
  const existingVision = config.components.find(item => item.kind === 'specification' && /vision/i.test(item.path || '') && readText(root, item.path) !== null)?.path;
  const vision = existingVision || `${docsRoot}/vision.md`;
  if (readText(root, vision) === null) fs.writeFileSync(inside(root, vision, false), `# ${config.project.name} vision\n\nDescribe who this product serves, the problem it solves, and the outcome you want to create.\n`, { flag: 'wx' });
  const guide = `${docsRoot}/getting-started.md`;
  if (readText(root, guide) === null) fs.writeFileSync(inside(root, guide, false), `# Getting started\n\nDescribe how contributors can understand and run ${config.project.name}.\n`, { flag: 'wx' });
  return saveConfig(root, { vision, docsRoot, backlogRoot: 'backlog', roadmap: [], documentation: [{ id: 'getting-started', title: 'Getting started', path: guide, summary: 'First steps for this product workspace.' }] });
}
function upsertRoadmap(root, input) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  if (!product) throw new Error('Set up Product Hub first.');
  const title = textField(input?.title, 'Title', 120);
  const summary = typeof input?.summary === 'string' ? input.summary.trim().slice(0, 500) : '';
  const status = input?.status;
  if (!roadmapStatuses.has(status)) throw new Error('Invalid roadmap status.');
  const used = new Set(product.roadmap.map(item => item.id));
  const existing = typeof input?.id === 'string' ? product.roadmap.find(item => item.id === input.id) : null;
  let id = existing?.id || slug(title);
  if (!existing) { let suffix = 2; while (used.has(id)) id = `${slug(title)}-${suffix++}`; }
  const known = new Set(loadConfig(path.join(rootPath(root), 'productview.yaml')).config.components.map(item => item.id));
  const relatedComponents = Array.isArray(input?.relatedComponents) ? [...new Set(input.relatedComponents.filter(value => known.has(value)))].slice(0, 30) : [];
  const item = { id, title, summary, status, relatedComponents };
  product.roadmap = existing ? product.roadmap.map(value => value.id === id ? item : value) : [...product.roadmap, item];
  return saveConfig(root, product);
}
function upsertNorthStar(root, input) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  if (!product) throw new Error('Set up Product Hub first.');
  const name = textField(input?.name, 'Metric name', 100);
  const unit = textField(input?.unit, 'Unit', 24);
  const description = typeof input?.description === 'string' ? input.description.trim().slice(0, 240) : '';
  const cadence = input?.cadence;
  if (!['daily', 'weekly', 'monthly'].includes(cadence)) throw new Error('Choose a valid measurement cadence.');
  const target = input?.target;
  if (target !== undefined && (typeof target !== 'number' || !Number.isFinite(target))) throw new Error('Target must be a number.');
  product.northStar = { name, description, unit, cadence, ...(target === undefined ? {} : { target }), measurements: product.northStar?.measurements || [] };
  return saveConfig(root, product);
}
function recordNorthStar(root, input) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  if (!product?.northStar) throw new Error('Define a North Star metric first.');
  const date = input?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Choose a valid measurement date.');
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  if (date > today) throw new Error('A measurement date cannot be in the future.');
  const value = input?.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Measurement must be a number.');
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 240) : '';
  const measurements = product.northStar.measurements.filter(item => item.date !== date);
  measurements.push({ date, value, ...(note ? { note } : {}) });
  product.northStar.measurements = measurements.sort((a, b) => a.date.localeCompare(b.date));
  return saveConfig(root, product);
}
function createDocument(root, input) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  if (!product) throw new Error('Set up Product Hub first.');
  const title = textField(input?.title, 'Title', 120);
  const summary = typeof input?.summary === 'string' ? input.summary.trim().slice(0, 240) : '';
  const rootFolder = ensureDocumentationRoot(root, product.docsRoot);
  const baseId = slug(title);
  let id = baseId, index = 2;
  const used = new Set(product.documentation.map(item => item.id));
  while (used.has(id) || fs.existsSync(path.join(rootFolder, `${id}.md`))) id = `${baseId}-${index++}`;
  const relative = `${product.docsRoot.replace(/\/$/, '')}/${id}.md`;
  const file = inside(root, relative, false);
  const content = `# ${title}\n\nWrite the purpose, decisions and usage here.\n`;
  product.documentation.push({ id, title, path: relative, summary });
  let created = false;
  try { fs.writeFileSync(file, content, { flag: 'wx' }); created = true; return { ...saveConfig(root, product), path: relative, content }; }
  catch (error) { if (created && fs.existsSync(file)) fs.unlinkSync(file); throw error; }
}
function saveDocument(root, relative, content) {
  const product = loadConfig(path.join(rootPath(root), 'productview.yaml')).config.product;
  const docsPrefix = product?.docsRoot.replace(/\/$/, '') + '/';
  if (!product || (relative !== product.vision && !relative.startsWith(docsPrefix))) throw new Error('Document is outside the BuildSteer documentation folder.');
  if (typeof content !== 'string' || Buffer.byteLength(content) > 500_000) throw new Error('Document exceeds the 500 KB editor limit.');
  const file = inside(root, relative);
  if (!fs.statSync(file).isFile() || !file.endsWith('.md')) throw new Error('Only configured Markdown files can be edited.');
  fs.writeFileSync(file, content);
  return { path: relative, content };
}
module.exports = { readProduct, setupProduct, upsertRoadmap, upsertNorthStar, recordNorthStar, createDocument, saveDocument };
