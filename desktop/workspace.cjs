const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, configPath, hasConfig, CONFIG_RELATIVE } = require('../scripts/config.cjs');

function registryPath(userData) { return path.join(userData, 'workspaces.json'); }
function readRegistry(userData) {
  try { return JSON.parse(fs.readFileSync(registryPath(userData), 'utf8')).filter(x => typeof x === 'string' && hasConfig(x)); }
  catch { return []; }
}
function addWorkspace(userData, root) {
  const canonical = fs.realpathSync(root);
  loadConfig(configPath(canonical));
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
      const start = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : null;
      const script = start ? pkg.scripts[start] : '';
      if (start && !/(?:\bdocker\s+compose\b.*(?:-d|--detach)\b|\bpm2\s+start\b|\bnohup\b|\s&\s*$)/.test(script)) {
        const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
        const platform = /\b(?:electron|tauri)\b/i.test(script) || dependencies.electron || dependencies['@tauri-apps/cli'] ? 'desktop'
          : /\b(?:expo|react-native|capacitor)\b/i.test(script) || dependencies.expo || dependencies['react-native'] ? 'mobile'
          : /\b(?:vite|next|nuxt|astro|svelte-kit|ng serve)\b/i.test(script) || ['vite', 'next', 'nuxt', 'astro', '@sveltejs/kit'].some(name => dependencies[name]) ? 'web' : null;
        findings.push({ id: 'app', kind: platform ? 'application' : 'service', name: platform ? 'App' : 'Development process', icon: platform ? 'grid' : 'terminal', position: { x: 36, y: 160 }, ...(platform ? { application: { platform } } : {}), runtime: { command: ['npm', 'run', start], cwd: '.', startup: 'manual' } });
      }
      if (pkg.scripts?.test) findings.push({ id: 'tests', kind: 'testSuite', name: 'Tests', icon: 'flask', position: { x: 65, y: 320 }, tests: { command: ['npm', 'test'], cwd: '.' } });
    } catch { /* ignore malformed package metadata */ }
  }
  return { components: findings, connections: [] };
}
function createWorkspace(root, mode = 'auto') {
  if (hasConfig(root)) throw new Error('This folder already has a Project Room configuration. Open it instead.');
  const name = path.basename(root).replace(/[-_]/g, ' ') || 'New Product';
  const discovered = mode === 'blank' ? { components: [], connections: [] } : detect(root);
  const config = { schemaVersion: 1, project: { id: path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-product', name }, workspace: { startPage: 'overview', additionalViews: [] }, components: discovered.components, connections: discovered.connections, views: { ...(fs.existsSync(path.join(root, 'specs')) ? { specifications: { roots: ['specs'] } } : {}) } };
  const file = path.join(root, CONFIG_RELATIVE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, YAML.stringify(config));
  return loadConfig(file);
}
function discover(root) {
  const matches = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'Library', 'Applications'].includes(entry.name) || !entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (hasConfig(candidate)) matches.push(candidate);
  }
  if (hasConfig(root)) matches.unshift(root);
  return matches.slice(0, 100);
}
module.exports = { addWorkspace, createWorkspace, discover, readRegistry };
