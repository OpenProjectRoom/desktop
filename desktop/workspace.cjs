const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig } = require('../scripts/config.cjs');

function registryPath(userData) { return path.join(userData, 'workspaces.json'); }
function readRegistry(userData) {
  try { return JSON.parse(fs.readFileSync(registryPath(userData), 'utf8')).filter(x => typeof x === 'string' && fs.existsSync(path.join(x, 'productview.yaml'))); }
  catch { return []; }
}
function addWorkspace(userData, root) {
  const canonical = fs.realpathSync(root);
  loadConfig(path.join(canonical, 'productview.yaml'));
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(registryPath(userData), JSON.stringify([canonical, ...readRegistry(userData).filter(x => x !== canonical)], null, 2));
  fs.writeFileSync(path.join(userData, 'last-project-v1.json'), JSON.stringify({ root: canonical }));
  return canonical;
}
function detect(root) {
  const findings = [];
  const packageFile = path.join(root, 'package.json');
  if (fs.existsSync(packageFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
      if (pkg.scripts?.dev || pkg.scripts?.start) findings.push({ id: 'app', kind: 'service', name: 'App', icon: 'cube', position: { x: 36, y: 160 }, runtime: { command: ['npm', 'run', pkg.scripts.dev ? 'dev' : 'start'], cwd: '.', startup: 'manual' } });
      if (pkg.scripts?.test) findings.push({ id: 'tests', kind: 'testSuite', name: 'Tests', icon: 'flask', position: { x: 65, y: 320 }, tests: { command: ['npm', 'test'], cwd: '.' } });
    } catch { /* ignore malformed package metadata */ }
  }
  const spec = ['specs/vision.md', 'specs/README.md', 'README.md'].find(rel => fs.existsSync(path.join(root, rel)));
  if (spec) findings.unshift({ id: 'spec', kind: 'specification', name: 'Product Spec', icon: 'doc', position: { x: 8, y: 80 }, path: spec });
  if (!findings.length) {
    fs.writeFileSync(path.join(root, 'PRODUCT_VISION.md'), '# Product vision\n\nDescribe the product here.\n');
    findings.push({ id: 'spec', kind: 'specification', name: 'Product Spec', icon: 'doc', position: { x: 8, y: 80 }, path: 'PRODUCT_VISION.md' });
  }
  const connections = findings.some(x => x.id === 'spec') && findings.some(x => x.id === 'app') ? [{ from: 'spec', to: 'app', label: 'defines' }] : [];
  return { components: findings, connections };
}
function createWorkspace(root, mode = 'auto') {
  if (fs.existsSync(path.join(root, 'productview.yaml'))) throw new Error('This folder already has a OpenBuildRoom workspace. Open it instead.');
  const name = path.basename(root).replace(/[-_]/g, ' ') || 'New Product';
  const discovered = mode === 'blank' ? { components: [], connections: [] } : detect(root);
  if (!discovered.components.length) {
    fs.writeFileSync(path.join(root, 'PRODUCT_VISION.md'), '# Product vision\n\nDescribe the product here.\n');
    discovered.components.push({ id: 'spec', kind: 'specification', name: 'Product Spec', position: { x: 8, y: 80 }, path: 'PRODUCT_VISION.md' });
  }
  const docsRoot = 'docs/product';
  for (const relative of ['docs', docsRoot]) {
    const candidate = path.join(root, relative);
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Documentation folder cannot be a symbolic link.');
  }
  fs.mkdirSync(path.join(root, docsRoot), { recursive: true });
  const existingVision = discovered.components.find(item => item.kind === 'specification' && /vision/i.test(item.path || ''))?.path;
  const vision = existingVision || `${docsRoot}/vision.md`;
  if (!fs.existsSync(path.join(root, vision))) fs.writeFileSync(path.join(root, vision), `# ${name} vision\n\nDescribe who this product serves, the problem it solves, and the desired outcome.\n`, { flag: 'wx' });
  const guidePath = `${docsRoot}/getting-started.md`;
  if (!fs.existsSync(path.join(root, guidePath))) fs.writeFileSync(path.join(root, guidePath), `# Getting started\n\nDescribe how a new contributor can understand and run ${name}.\n`, { flag: 'wx' });
  const config = { schemaVersion: 1, project: { id: path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-product', name }, product: { vision, docsRoot, backlogRoot: 'backlog', roadmap: [], documentation: [{ id: 'getting-started', title: 'Getting started', path: guidePath, summary: 'How to use this product workspace.' }] }, workspace: { startPage: 'overview', additionalViews: [], environment: [], layout: 'freeform', chat: { enabled: true, context: ['specs', 'components', 'tests', 'issues'], provider: 'none' } }, components: discovered.components, connections: discovered.connections, views: { ...(fs.existsSync(path.join(root, 'specs')) ? { specifications: { roots: ['specs'] } } : {}), timeline: { enabled: true } } };
  fs.writeFileSync(path.join(root, 'productview.yaml'), YAML.stringify(config));
  return loadConfig(path.join(root, 'productview.yaml'));
}
function discover(root) {
  const matches = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'Library', 'Applications'].includes(entry.name) || !entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (fs.existsSync(path.join(candidate, 'productview.yaml'))) matches.push(candidate);
  }
  if (fs.existsSync(path.join(root, 'productview.yaml'))) matches.unshift(root);
  return matches.slice(0, 100);
}
module.exports = { addWorkspace, createWorkspace, discover, readRegistry };
