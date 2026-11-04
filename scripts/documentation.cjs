const fs = require('node:fs');
const path = require('node:path');
const { listSpecifications } = require('./specifications.cjs');

function listDocumentation(projectRoot, config) {
  const root = config.product?.docsRoot;
  if (!root) return { root: null, missing: true, entries: [] };
  const result = listSpecifications(projectRoot, { views: { specifications: { roots: [root] } }, components: [] });
  const entries = result.entries.filter(item => item.type === 'directory' || /\.mdx?$/i.test(item.path));
  return { root, missing: !entries.some(item => item.path === root && item.type === 'directory'), entries };
}

function ensureDocumentationRoot(projectRoot, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Invalid documentation folder.');
  const base = fs.realpathSync(projectRoot);
  let current = base;
  for (const part of relative.split(/[\\/]/).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      if (fs.lstatSync(current).isSymbolicLink() || !fs.statSync(current).isDirectory()) throw new Error('Documentation folder is not a regular folder.');
    } else fs.mkdirSync(current);
  }
  return current;
}

module.exports = { listDocumentation, ensureDocumentationRoot };
