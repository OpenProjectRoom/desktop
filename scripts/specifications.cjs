const fs = require('node:fs');
const path = require('node:path');
const { inspectSpecKit } = require('./spec-kit.cjs');

const previewable = new Set(['.md', '.mdx', '.txt', '.yaml', '.yml', '.json', '.toml', '.csv']);
const posix = value => value.split(path.sep).join('/');

function specificationRoots(config) {
  const configured = config.views?.specifications?.roots || [];
  if (configured.length) return [...new Set(configured)];
  return [...new Set(config.components.filter(item => item.kind === 'specification' && item.path).map(item => {
    const parent = posix(path.dirname(item.path));
    return parent === '.' ? item.path : parent;
  }))];
}

function listSpecifications(projectRoot, config, context = {}) {
  const base = fs.realpathSync(projectRoot);
  const roots = specificationRoots(config);
  const entries = [];
  const seen = new Set();
  const within = candidate => candidate === base || candidate.startsWith(base + path.sep);
  function visit(relative, depth) {
    if (entries.length >= 1000) throw new Error('Specification folder has more than 1000 entries. Narrow its configured roots.');
    if (depth > 12) throw new Error('Specification folder is nested more than 12 levels deep.');
    const absolute = path.resolve(base, relative);
    if (!within(absolute) || !fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink()) return;
    const canonical = fs.realpathSync(absolute);
    if (!within(canonical)) return;
    const stat = fs.statSync(canonical);
    const item = { path: posix(relative), type: stat.isDirectory() ? 'directory' : 'file', depth, previewable: stat.isFile() && previewable.has(path.extname(relative).toLowerCase()) };
    if (!seen.has(item.path)) { entries.push(item); seen.add(item.path); }
    if (!stat.isDirectory()) return;
    for (const child of fs.readdirSync(canonical, { withFileTypes: true }).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
      if (child.name === '.git' || child.name === 'node_modules' || child.isSymbolicLink()) continue;
      visit(path.join(relative, child.name), depth + 1);
    }
  }
  for (const root of roots) {
    if (root === '.' || path.isAbsolute(root) || root.split(/[\\/]/).includes('..')) throw new Error('Specification roots must be subfolders inside the repository.');
    visit(root, 0);
  }
  const specKit = inspectSpecKit(base, config, roots, context);
  if (specKit.constitution && !seen.has(specKit.constitution)) entries.unshift({ path: specKit.constitution, type: 'file', depth: 0, previewable: true });
  return { roots, entries, specKit };
}

module.exports = { listSpecifications, specificationRoots };
