const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const Ajv = require('ajv/dist/2020');
const schema = require('../schemas/productview.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

function parseConfig(raw) {
  const config = YAML.parse(raw, { uniqueKeys: true });
  if (!validate(config)) {
    throw new Error('productview.yaml is invalid:\n' + validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('\n'));
  }
  const ids = new Set();
  const environmentNames = new Set();
  for (const item of config.workspace?.environment || []) {
    if (environmentNames.has(item.name)) throw new Error(`Duplicate environment variable: ${item.name}`);
    environmentNames.add(item.name);
  }
  const mcpIds = new Set();
  for (const item of config.workspace?.mcpServers || []) {
    if (mcpIds.has(item.id)) throw new Error(`Duplicate MCP server ID: ${item.id}`);
    mcpIds.add(item.id);
    if ((item.transport === 'stdio' || (!item.transport && !item.url)) && !item.command) throw new Error(`MCP server ${item.id} needs a command.`);
    if ((item.transport === 'http' || item.transport === 'sse' || (!item.transport && item.url)) && !item.url) throw new Error(`MCP server ${item.id} needs a URL.`);
  }
  const apiIds = new Set();
  for (const item of config.workspace?.apiSources || []) {
    if (apiIds.has(item.id)) throw new Error(`Duplicate API source ID: ${item.id}`);
    apiIds.add(item.id);
    let url;
    try { url = new URL(item.baseUrl); } catch { throw new Error(`API source ${item.id} needs a valid base URL.`); }
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
      throw new Error(`API source ${item.id} must use HTTPS or local HTTP, with no credentials or query in the base URL.`);
    }
  }
  for (const component of config.components) {
    if (ids.has(component.id)) throw new Error(`Duplicate component ID: ${component.id}`);
    ids.add(component.id);
    if (component.kind === 'testSuite') {
      const caseIds = new Set();
      for (const testCase of component.tests.cases || []) {
        if (caseIds.has(testCase.id)) throw new Error(`Duplicate test case ID in ${component.id}: ${testCase.id}`);
        caseIds.add(testCase.id);
      }
    }
  }
  for (const edge of config.connections) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Connection ${edge.from} → ${edge.to} references an unknown component.`);
  }
  for (const link of config.views?.specifications?.links || []) {
    for (const id of link.components || []) if (!ids.has(id)) throw new Error(`Spec Kit link ${link.spec} references unknown component ${id}.`);
    for (const id of link.tests || []) if (!config.components.some(item => item.id === id && item.kind === 'testSuite')) throw new Error(`Spec Kit link ${link.spec} references unknown test suite ${id}.`);
  }
  if (config.product) {
    const roadmapIds = new Set();
    for (const item of config.product.roadmap) {
      if (roadmapIds.has(item.id)) throw new Error(`Duplicate roadmap ID: ${item.id}`);
      roadmapIds.add(item.id);
      for (const related of item.relatedComponents || []) if (!ids.has(related)) throw new Error(`Roadmap item ${item.id} references unknown component ${related}.`);
    }
    const documentIds = new Set();
    for (const document of config.product.documentation) {
      if (documentIds.has(document.id)) throw new Error(`Duplicate documentation ID: ${document.id}`);
      documentIds.add(document.id);
      if (!document.path.startsWith(config.product.docsRoot.replace(/\/$/, '') + '/')) throw new Error(`Documentation path ${document.path} must be inside ${config.product.docsRoot}.`);
    }
    const measurementDates = new Set();
    for (const item of config.product.northStar?.measurements || []) {
      const parsed = new Date(`${item.date}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== item.date) throw new Error(`Invalid North Star date: ${item.date}.`);
      if (measurementDates.has(item.date)) throw new Error(`Duplicate North Star date: ${item.date}.`);
      measurementDates.add(item.date);
    }
  }
  return config;
}
function loadConfig(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const config = parseConfig(raw);
  return { config, raw, root: path.dirname(filePath) };
}

module.exports = { loadConfig, parseConfig };
