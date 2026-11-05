#!/usr/bin/env node
// Local, read-only MCP stdio endpoint. stdout is reserved for JSON-RPC.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { loadConfig } = require('../scripts/config.cjs');
const { listDocumentation } = require('../scripts/documentation.cjs');
const { listSpecifications } = require('../scripts/specifications.cjs');
const { listIssues } = require('../desktop/backlog.cjs');
const { appendEvent, readEvents } = require('../desktop/history.cjs');

const root = process.argv[2] && fs.realpathSync(process.argv[2]);
if (!root || !fs.existsSync(path.join(root, 'productview.yaml'))) {
  console.error('Usage: server.cjs <project-folder-containing-productview.yaml>');
  process.exit(2);
}
const tools = [
  { name: 'get_product_view', description: 'Read the complete validated productview.yaml as structured data.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_product_context', description: 'Read the product vision, roadmap, local backlog, and Markdown documentation.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_components', description: 'List the project components and their connections.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'read_project_file', description: 'Read a UTF-8 project file such as a specification. Paths must stay inside the workspace.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } },
  { name: 'get_product_history', description: 'Read recent Project Room events, including agent sessions, commands, tests, prompts, and file changes.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'get_spec_kit', description: 'Detect Spec Kit feature artifacts and read their Project Room links and recorded test evidence. Runtime process state is not observed through this MCP server.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];
let client = 'unknown-client';
let connected = false;
function send(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
function result(id, value) { send({ jsonrpc: '2.0', id, result: value }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function text(value) { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }; }
function readFile(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..') || /(^|[\\/])(\.git|\.productview|node_modules)([\\/]|$)/.test(relative) || /(^|[\\/])\.env/.test(relative)) throw new Error('Invalid or private path.');
  const file = fs.realpathSync(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep)) throw new Error('Path leaves workspace.');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 200_000) throw new Error('File is too large or not a regular file.');
  const data = fs.readFileSync(file);
  if (data.includes(0)) throw new Error('Binary files are not supported.');
  return data.toString('utf8');
}
function callTool(name, args = {}) {
  if (!tools.some(tool => tool.name === name)) throw new Error('Unknown tool.');
  appendEvent(root, 'agent.tool-called', { client, tool: name });
  if (name === 'get_product_view') return text(loadConfig(path.join(root, 'productview.yaml')).config);
  if (name === 'get_product_context') {
    const product = loadConfig(path.join(root, 'productview.yaml')).config.product;
    if (!product) { const backlog = listIssues(root); return text({ configured: false, message: 'No product block is configured in productview.yaml.', backlogRoot: backlog.root, backlogCount: backlog.issues.length, backlog: backlog.issues.slice(0, 100).map(issue => ({ ...issue, description: issue.description.slice(0, 5000) })) }); }
    const readable = relative => { try { return readFile(relative).slice(0, 30_000); } catch (error) { return `[Unavailable: ${error.message}]`; } };
    const folder = listDocumentation(root, { product });
    const metadata = new Map(product.documentation.map(document => [document.path, document]));
    const files = folder.entries.filter(item => item.type === 'file');
    const backlog = listIssues(root);
    return text({ configured: true, vision: { path: product.vision, content: readable(product.vision) }, northStar: product.northStar || null, roadmap: product.roadmap, backlogRoot: backlog.root, backlogCount: backlog.issues.length, backlog: backlog.issues.slice(0, 100).map(issue => ({ ...issue, description: issue.description.slice(0, 5000) })), documentationRoot: product.docsRoot, documentationCount: files.length, documentation: files.slice(0, 30).map(file => ({ ...(metadata.get(file.path) || { title: path.basename(file.path, path.extname(file.path)) }), path: file.path, content: readable(file.path) })) });
  }
  if (name === 'list_components') { const config = loadConfig(path.join(root, 'productview.yaml')).config; return text({ components: config.components, connections: config.connections }); }
  if (name === 'get_spec_kit') { const config = loadConfig(path.join(root, 'productview.yaml')).config; return text(listSpecifications(root, config, { events: readEvents(root, 1000) }).specKit); }
  if (name === 'read_project_file') return text(readFile(args.path));
  return text(readEvents(root, Math.min(100, Math.max(1, Number(args.limit) || 50))));
}
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  let request;
  try { request = JSON.parse(line); } catch { error(null, -32700, 'Invalid JSON.'); return; }
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') { error(request?.id ?? null, -32600, 'Invalid request.'); return; }
  const { id, method, params = {} } = request;
  if (id === undefined) return;
  try {
    if (method === 'initialize') {
      client = String(params.clientInfo?.name || 'unknown-client').slice(0, 100);
      connected = true;
      appendEvent(root, 'agent.connected', { client, clientVersion: params.clientInfo?.version || null, transport: 'stdio' });
      result(id, { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'project-room', version: require('../package.json').version }, instructions: 'Read productview.yaml, get_product_context, and the Project Room skill before changing product behavior. This MCP endpoint is read-only; edit repository files with your coding tools, then validate.' });
    } else if (method === 'ping') result(id, {});
    else if (method === 'tools/list') result(id, { tools });
    else if (method === 'tools/call') result(id, callTool(params.name, params.arguments || {}));
    else error(id, -32601, 'Method not found.');
  } catch (cause) {
    if (method === 'tools/call') result(id, { isError: true, content: [{ type: 'text', text: cause.message }] });
    else error(id, -32603, cause.message);
  }
}).on('close', () => {
  if (connected) appendEvent(root, 'agent.disconnected', { client, transport: 'stdio' });
});
