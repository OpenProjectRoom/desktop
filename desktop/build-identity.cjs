const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MAX_BYTES = 16_384;

function safeFile(root, relative) {
  if (!relative || typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) return null;
  try {
    const base = fs.realpathSync(root);
    const file = fs.realpathSync(path.resolve(base, relative));
    if (!file.startsWith(base + path.sep)) return null;
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size <= MAX_BYTES ? file : null;
  } catch { return null; }
}

function sourceRevision(root) {
  try {
    const [top, revision] = execFileSync('git', ['rev-parse', '--show-toplevel', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/);
    if (fs.realpathSync(top) !== fs.realpathSync(root)) return null;
    return /^[a-f0-9]{40}$/i.test(revision) ? revision.slice(0, 12) : null;
  } catch { return null; }
}

function readBuildIdentity(root, item, revision = null) {
  if (!root || !item) return { builtAt: null, revision: null, version: null, source: null, sourceRevision: revision };
  const cwd = item.runtime?.cwd || item.cwd || '.';
  const candidates = item.build?.file ? [item.build.file] : [path.join(cwd, 'build-info.json'), path.join(cwd, 'dist/build-info.json')];
  for (const relative of candidates) {
    const file = safeFile(root, relative);
    if (!file) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const time = typeof data.builtAt === 'string' ? new Date(data.builtAt) : null;
      const builtAt = time && !Number.isNaN(time.getTime()) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.builtAt) ? time.toISOString() : null;
      const buildRevision = typeof data.revision === 'string' && /^[a-f0-9]{7,40}$/i.test(data.revision) ? data.revision : null;
      const version = typeof data.version === 'string' && data.version.length <= 80 && !/[\r\n<>]/.test(data.version) ? data.version : null;
      if (!builtAt && !buildRevision && !version) continue;
      return { builtAt, revision: buildRevision, version, source: path.relative(fs.realpathSync(root), file).split(path.sep).join('/'), sourceRevision: revision };
    } catch { /* An unreadable file is not build evidence. */ }
  }
  return { builtAt: null, revision: null, version: null, source: null, sourceRevision: revision };
}

function listBuildIdentities(root, components, snapshots = new Map()) {
  if (!root) return {};
  const revision = sourceRevision(root);
  return Object.fromEntries((components || []).filter(item => ['application', 'service', 'commandTool'].includes(item.kind)).map(item => {
    const snapshot = snapshots.get(item.id);
    return [item.id, snapshot || readBuildIdentity(root, item, revision)];
  }));
}

module.exports = { readBuildIdentity, listBuildIdentities, sourceRevision };
