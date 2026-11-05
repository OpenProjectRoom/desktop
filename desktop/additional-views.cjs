const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');

const allowed = new Set(['vision', 'roadmap', 'north-star', 'commands']);

function setAdditionalView(root, page, enabled) {
  if (!allowed.has(page) || typeof enabled !== 'boolean') throw new Error('Invalid additional view.');
  const base = fs.realpathSync(root);
  const file = path.join(base, 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Project Room cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const views = new Set(current.config.workspace?.additionalViews || []);
  if (enabled) views.add(page);
  else views.delete(page);
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  if (!document.has('workspace')) document.set('workspace', {});
  const existing = document.getIn(['workspace', 'additionalViews'], true);
  if (YAML.isSeq(existing)) existing.items = document.createNode([...views]).items;
  else document.setIn(['workspace', 'additionalViews'], [...views]);
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(base, `.productview-views-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return loadConfig(file);
}

module.exports = { setAdditionalView };
