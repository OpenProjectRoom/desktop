const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('./config.cjs');
const { listSpecifications } = require('./specifications.cjs');
const { listDocumentation } = require('./documentation.cjs');
const { config } = loadConfig(path.resolve(__dirname, '../productview.yaml'));
fs.writeFileSync(path.resolve(__dirname, '../dist/productview.json'), JSON.stringify(config, null, 2) + '\n');
fs.copyFileSync(path.resolve(__dirname, '../agent/project-room/SKILL.md'), path.resolve(__dirname, '../dist/agent-skill.md'));
fs.copyFileSync(path.resolve(__dirname, '../schemas/productview.schema.json'), path.resolve(__dirname, '../dist/productview.schema.json'));
fs.copyFileSync(path.resolve(__dirname, '../productview.yaml'), path.resolve(__dirname, '../dist/productview.yaml'));
for (const relative of [config.product?.vision].filter(Boolean)) {
  const destination = path.resolve(__dirname, '../dist', relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '..', relative), destination);
}
const specs = listSpecifications(path.resolve(__dirname, '..'), config);
fs.writeFileSync(path.resolve(__dirname, '../dist/spec-manifest.json'), JSON.stringify(specs, null, 2) + '\n');
for (const item of specs.entries.filter(entry => entry.type === 'file' && entry.previewable)) {
  const destination = path.resolve(__dirname, '../dist', item.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '..', item.path), destination);
}
const docs = listDocumentation(path.resolve(__dirname, '..'), config);
fs.writeFileSync(path.resolve(__dirname, '../dist/docs-manifest.json'), JSON.stringify(docs, null, 2) + '\n');
for (const item of docs.entries.filter(entry => entry.type === 'file')) {
  const destination = path.resolve(__dirname, '../dist', item.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '..', item.path), destination);
}
process.stdout.write('Demo and agent contract updated\n');
