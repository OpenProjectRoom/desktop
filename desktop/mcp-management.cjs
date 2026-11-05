const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig, configPath } = require('../scripts/config.cjs');
const { discoverMcpServers, referencedNames } = require('./mcp-explorer.cjs');

function documentFor(root) {
  const base = fs.realpathSync(root);
  const file = configPath(base);
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Project Room cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  return { base, file, current, document };
}

function save(record) {
  const raw = String(record.document);
  parseConfig(raw);
  const temporary = path.join(record.base, `.productview-mcp-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, record.file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return loadConfig(record.file);
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function names(value) {
  const values = typeof value === 'string' ? value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean) : Array.isArray(value) ? value : [];
  if (values.length > 30 || values.some(name => !/^[A-Z][A-Z0-9_]*$/.test(name))) throw new Error('Use at most 30 variable names such as API_TOKEN. Never enter values here.');
  return [...new Set(values)];
}

function relative(value) {
  const cwd = value ? text(value, 'Working directory', 240) : '.';
  if (path.isAbsolute(cwd) || cwd.includes('\\') || cwd.split('/').includes('..')) throw new Error('Working directory must be a relative project path.');
  return cwd;
}

function remoteUrl(value) {
  const raw = text(value, 'Endpoint URL', 500);
  let url;
  try { url = new URL(raw); } catch { throw new Error('Enter a valid MCP endpoint URL.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a clean endpoint URL. Put tokens in Environment, not in the URL.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Use HTTPS or a local HTTP endpoint.');
  return raw;
}

function uniqueId(config, name) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mcp-server';
  const slug = /^[a-z]/.test(stem) ? stem : `mcp-${stem}`;
  const taken = new Set((config.workspace?.mcpServers || []).map(item => item.id));
  let id = slug;
  for (let n = 2; taken.has(id); n++) id = `${slug}-${n}`;
  return id;
}

function insert(record, item) {
  if (!record.document.has('workspace')) record.document.set('workspace', {});
  const existing = record.document.getIn(['workspace', 'mcpServers'], true);
  if (YAML.isSeq(existing)) existing.add(item);
  else record.document.setIn(['workspace', 'mcpServers'], [item]);
  return { ...save(record), id: item.id };
}

function addMcpServer(root, input) {
  if (!input || typeof input !== 'object') throw new Error('Enter an MCP server.');
  const record = documentFor(root);
  const name = text(input.name, 'Server name', 100);
  const transport = input.transport;
  if (!['stdio', 'http', 'sse'].includes(transport)) throw new Error('Choose stdio, HTTP, or SSE transport.');
  const item = { id: uniqueId(record.current.config, name), name, transport };
  if (input.description?.trim()) item.description = text(input.description, 'Description', 240);
  if (transport === 'stdio') {
    item.command = text(input.command, 'Executable', 200);
    const args = typeof input.args === 'string' ? input.args.split(/\r?\n/).map(arg => arg.trim()).filter(Boolean) : [];
    if (args.length > 30 || args.some(arg => arg.length > 500)) throw new Error('Use at most 30 arguments of 500 characters each.');
    item.args = args;
    item.cwd = relative(input.cwd);
    item.environment = names(input.environment);
  } else {
    item.url = remoteUrl(input.url);
    if (input.authEnv?.trim()) {
      item.authEnv = text(input.authEnv, 'Authentication variable', 100);
      if (!/^[A-Z][A-Z0-9_]*$/.test(item.authEnv)) throw new Error('Use a variable name such as MCP_TOKEN.');
    }
  }
  return insert(record, item);
}

function linkMcpServer(root, sourceId) {
  const record = documentFor(root);
  const source = discoverMcpServers(record.base, record.current.config).find(item => item.id === sourceId && !item.builtIn && !item.id.startsWith('yaml:'));
  if (!source) throw new Error('Choose a discovered project MCP server.');
  if ((record.current.config.workspace?.mcpServers || []).some(item => item.linkedFrom === sourceId)) throw new Error('This server is already linked in .projectroom/project.yaml.');
  const item = { id: uniqueId(record.current.config, source.name), name: text(source.name, 'Server name', 100),
    transport: source.transport, linkedFrom: sourceId };
  if (source.description) item.description = text(source.description, 'Description', 240);
  if (source.transport === 'stdio') {
    item.command = text(source.command, 'Executable', 200);
    if (!Array.isArray(source.args) || source.args.length > 30 || source.args.some(arg => typeof arg !== 'string' || !arg || arg.length > 500)) throw new Error('This server has unsupported command arguments.');
    if (source.args.some((arg, index) => /^(--?(?:token|api[-_]?key|password|secret|authorization))$/i.test(arg) && source.args[index + 1] && !/^\$\{[A-Z][A-Z0-9_]*\}$/.test(source.args[index + 1]))) throw new Error('Replace literal credentials in command arguments with variable placeholders before linking.');
    item.args = source.args;
    item.cwd = relative(source.cwd);
    item.environment = referencedNames(source);
  } else {
    item.url = remoteUrl(source.url);
    const headers = source.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      const match = key.toLowerCase() === 'authorization' && /^Bearer \$\{([A-Z][A-Z0-9_]*)\}$/.exec(value);
      if (!match) throw new Error('This server uses custom headers. Configure a Bearer auth variable manually before linking.');
      item.authEnv = match[1];
    }
  }
  return insert(record, item);
}

function removeMcpServer(root, id) {
  const record = documentFor(root);
  const item = record.current.config.workspace?.mcpServers?.find(server => server.id === id);
  if (!item) throw new Error('This YAML MCP server no longer exists.');
  const servers = record.document.getIn(['workspace', 'mcpServers'], true);
  servers.items = servers.items.filter(server => server.get('id') !== id);
  return { ...save(record), removed: item };
}

module.exports = { addMcpServer, linkMcpServer, removeMcpServer };
