const fs = require('node:fs');
const path = require('node:path');
const { Client, StreamableHTTPClientTransport, SSEClientTransport, UnauthorizedError } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { projectPath } = require('./platform-process.cjs');
const { readBuildIdentity, sourceRevision } = require('./build-identity.cjs');
const { LoopbackCallback, mcpOAuthProvider } = require('./oauth.cjs');

const CONFIG_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', 'mcp.json'];
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function readJson(root, relative) {
  const file = path.join(root, relative);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 1_000_000) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function discoverMcpServers(root, config = {}, options = {}) {
  if (!root) return [];
  const candidates = [];
  if (options.appPath && options.executable) candidates.push({
    id: 'product-view', name: 'Project Room', description: 'Read-only product, component, Spec Kit and activity context for this workspace.',
    source: 'Built into Project Room', transport: 'stdio', command: options.executable,
    args: [path.join(options.appPath, 'mcp/server.cjs'), root],
    cwd: root, env: options.isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}, builtIn: true
  });
  for (const item of config.workspace?.mcpServers || []) candidates.push({
    id: `yaml:${item.id}`, name: item.name, description: item.description || '', source: '.projectroom/project.yaml',
    transport: item.transport || (item.url ? 'http' : 'stdio'), command: item.command, args: item.args || [],
    cwd: item.cwd || '.', url: item.url, environment: item.environment || [], authEnv: item.authEnv, auth: item.auth, linkedFrom: item.linkedFrom, build: item.build
  });
  for (const relative of CONFIG_FILES) {
    const parsed = readJson(root, relative);
    const servers = parsed?.mcpServers || parsed?.servers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) continue;
    for (const [name, item] of Object.entries(servers)) {
      if (!item || typeof item !== 'object' || item.disabled === true) continue;
      candidates.push({ id: `${relative}:${name}`, name, description: item.description || '', source: relative,
        transport: item.type === 'sse' ? 'sse' : item.url ? 'http' : 'stdio', command: item.command,
        args: Array.isArray(item.args) ? item.args : [], cwd: '.', url: item.url,
        env: item.env && typeof item.env === 'object' && !Array.isArray(item.env) ? item.env : {},
        headers: item.headers && typeof item.headers === 'object' ? item.headers : {}
      });
    }
  }
  return candidates;
}

function referencedNames(item) {
  const values = [item.url || '', ...(item.args || []), ...Object.values(item.env || {}), ...Object.values(item.headers || {})];
  const placeholders = values.flatMap(value => typeof value === 'string' ? [...value.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map(match => match[1]) : []);
  return [...new Set([...(item.environment || []), ...(item.authEnv ? [item.authEnv] : []), ...Object.keys(item.env || {}), ...placeholders].filter(name => ENV_NAME.test(name)))];
}

function publicCandidate(item, hasEnvironment = () => false) {
  let endpoint = '';
  if (item.url) {
    try { const url = new URL(item.url); endpoint = url.origin + url.pathname; }
    catch { endpoint = 'Invalid URL'; }
  } else endpoint = item.builtIn ? 'Bundled local server' : item.command || 'Command missing';
  const names = item.builtIn ? [] : referencedNames(item);
  const origin = item.builtIn ? 'built-in' : item.source === '.projectroom/project.yaml' ? 'project-registration' : 'client-config';
  return { id: item.id, name: item.name, description: item.description, source: item.source, transport: item.transport,
    endpoint, builtIn: !!item.builtIn, origin, authType: item.auth?.type || (item.authEnv ? 'bearer' : 'none'), environment: names.map(name => ({ name, available: hasEnvironment(name) || !!item.env?.[name] })) };
}

function substitute(value, environment) {
  return String(value).replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_match, name) => environment[name] || '');
}

function serverTarget(root, item) {
  if (item.builtIn) return null;
  if (item.transport === 'stdio') {
    if (!item.command) return null;
    return JSON.stringify(['stdio', path.resolve(root, item.cwd || '.'), item.command, item.args || []]);
  }
  if (!item.url) return null;
  try { return JSON.stringify([item.transport, new URL(item.url).href]); }
  catch { return null; }
}

class McpExplorer {
  constructor(options) { this.options = options; this.active = new Map(); }
  discover() {
    const root = this.options.getRoot();
    return discoverMcpServers(root, this.options.getConfig(), {
      appPath: this.options.appPath, executable: this.options.executable, isElectron: this.options.isElectron
    });
  }
  list() {
    const linked = new Map((this.options.getConfig()?.workspace?.mcpServers || []).filter(item => item.linkedFrom).map(item => [item.linkedFrom, item.id]));
    const root = this.options.getRoot();
    const candidates = this.discover();
    const registered = new Map(candidates.filter(item => item.source === '.projectroom/project.yaml')
      .map(item => [serverTarget(root, item), item.id.slice(5)]).filter(([target]) => target));
    for (const item of candidates) {
      if (item.builtIn || item.source === '.projectroom/project.yaml' || linked.has(item.id)) continue;
      const match = registered.get(serverTarget(root, item));
      if (match) linked.set(item.id, match);
    }
    const revision = root ? sourceRevision(root) : null;
    return candidates.map(item => ({ ...publicCandidate(item, name => !!this.options.getEnvironment(name)),
      connected: this.active.has(item.id), linkedId: linked.get(item.id) || null,
      buildIdentity: this.active.get(item.id)?.buildIdentity || (item.transport === 'stdio' && !item.builtIn && item.build?.file ? readBuildIdentity(root, item, revision) : null) }));
  }
  async disconnect(id) {
    if (id === undefined) { await Promise.all([...this.active.keys()].map(key => this.disconnect(key))); return true; }
    const active = this.active.get(id);
    this.active.delete(id);
    if (active) try { await active.client.close(); } finally { this.options.record?.('mcp.disconnected', { server: id }); }
    return true;
  }
  async forgetAuth(id) {
    const item = this.discover().find(candidate => candidate.id === id);
    if (!item || item.auth?.type !== 'oauth2') throw new Error('This server has no Project Room OAuth session.');
    await this.disconnect(id);
    this.options.oauthStore(this.options.getRoot(), 'mcp', `${item.id}\0${item.url}\0${item.auth.clientId || ''}\0${(item.auth.scopes || []).join(' ')}`).clear();
    this.options.record?.('mcp.signed-out', { server: id });
    return true;
  }
  async connect(id) {
    const item = this.discover().find(candidate => candidate.id === id);
    if (!item) throw new Error('MCP server is no longer configured. Refresh the list.');
    if (this.active.has(id)) return this.describe(id);
    const root = this.options.getRoot();
    const names = referencedNames(item);
    const environment = {};
    for (const name of names) if (ENV_NAME.test(name)) environment[name] = this.options.getEnvironment(name) || process.env[name] || '';
    for (const [name, value] of Object.entries(item.env || {})) {
      if (ENV_NAME.test(name) && typeof value === 'string' && !environment[name]) environment[name] = substitute(value, { ...process.env, ...environment });
    }
    let transport;
    let callback;
    let retryTransport;
    if (item.transport === 'stdio') {
      if (typeof item.command !== 'string' || !item.command) throw new Error('This server needs a command in its project configuration.');
      const workspace = fs.realpathSync(root);
      const cwd = fs.realpathSync(path.resolve(workspace, item.cwd || '.'));
      if (cwd !== workspace && !cwd.startsWith(workspace + path.sep)) throw new Error('MCP working directory must stay inside the workspace.');
      if (!fs.statSync(cwd).isDirectory()) throw new Error('MCP working directory does not exist.');
      const effectivePath = projectPath({ ...process.env, ...environment }, cwd);
      transport = new StdioClientTransport({ command: item.command, args: item.args.map(arg => substitute(arg, environment)),
        cwd, env: { ...environment, PATH: effectivePath }, stderr: 'pipe' });
    } else {
      const raw = substitute(item.url || '', environment);
      let url;
      try { url = new URL(raw); } catch { throw new Error('This server needs a valid HTTP URL.'); }
      if (url.username || url.password) throw new Error('Put credentials in local Environment, not in the MCP URL.');
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Use HTTPS or a local HTTP endpoint.');
      const headers = {};
      for (const [key, value] of Object.entries(item.headers || {})) if (typeof value === 'string') headers[key] = substitute(value, environment);
      if (item.authEnv) {
        if (!environment[item.authEnv]) throw new Error(`Set ${item.authEnv} in Environment before connecting.`);
        headers.Authorization = `Bearer ${environment[item.authEnv]}`;
      }
      const opts = { requestInit: { headers, redirect: 'error' } };
      if (item.auth?.type === 'oauth2') {
        if (!this.options.oauthStore || !this.options.openExternal) throw new Error('OAuth is unavailable in this session.');
        const store = this.options.oauthStore(root, 'mcp', `${item.id}\0${item.url}\0${item.auth.clientId || ''}\0${(item.auth.scopes || []).join(' ')}`);
        if (!store.encryption?.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable; OAuth sign-in cannot start.');
        callback = new LoopbackCallback();
        await callback.start();
        opts.authProvider = mcpOAuthProvider(store, callback, item.auth, this.options.openExternal);
      }
      const makeTransport = () => item.transport === 'sse' ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts);
      transport = makeTransport();
      retryTransport = makeTransport;
    }
    const client = new Client({ name: 'project-room-explorer', version: require('../package.json').version },
      { versionNegotiation: item.builtIn ? { mode: 'legacy' } : { mode: 'auto', probe: { timeoutMs: 1000 } } });
    const connectWithTimeout = async candidate => {
      let timeout;
      try { return await Promise.race([client.connect(candidate), new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('MCP connection timed out after 15 seconds.')), 15000); })]); }
      finally { clearTimeout(timeout); }
    };
    try {
      try { await connectWithTimeout(transport); }
      catch (error) {
        if (!(error instanceof UnauthorizedError) || !callback) throw error;
        const params = await callback.wait();
        await transport.finishAuth(params);
        await connectWithTimeout(retryTransport());
      }
      this.active.set(id, { item, client, connectedAt: new Date().toISOString(),
        buildIdentity: item.transport === 'stdio' && !item.builtIn && item.build?.file ? readBuildIdentity(root, item, sourceRevision(root)) : null });
      this.options.record?.('mcp.connected', { server: item.id, transport: item.transport });
      return await this.describe(id);
    } catch (error) {
      await client.close().catch(() => {});
      this.active.delete(id);
      throw error;
    } finally { await callback?.close(); }
  }
  async describe(id) {
    const active = this.active.get(id);
    if (!active) throw new Error('Connect to this MCP server first.');
    const { client, item } = active;
    const capabilities = client.getServerCapabilities() || {};
    const results = await Promise.allSettled([
      capabilities.tools ? client.listTools() : Promise.resolve({ tools: [] }),
      capabilities.resources ? client.listResources() : Promise.resolve({ resources: [] }),
      capabilities.resources ? client.listResourceTemplates() : Promise.resolve({ resourceTemplates: [] }),
      capabilities.prompts ? client.listPrompts() : Promise.resolve({ prompts: [] })
    ]);
    const value = (index, key) => results[index].status === 'fulfilled' ? results[index].value[key] || [] : [];
    return { id: item.id, serverInfo: client.getServerVersion(), connectedAt: active.connectedAt, buildIdentity: active.buildIdentity, instructions: client.getInstructions() || '', capabilities,
      tools: value(0, 'tools'), resources: value(1, 'resources'), resourceTemplates: value(2, 'resourceTemplates'), prompts: value(3, 'prompts'),
      errors: results.map((result, index) => result.status === 'rejected' ? `${['Tools', 'Resources', 'Resource templates', 'Prompts'][index]}: ${result.reason.message}` : '').filter(Boolean) };
  }
  requireActive(id) { const active = this.active.get(id); if (!active) throw new Error('Connect to this MCP server first.'); return active.client; }
  async callTool(id, name, args) {
    const client = this.requireActive(id);
    if (typeof name !== 'string' || typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error('Provide a tool name and a JSON object.');
    if (!(await client.listTools()).tools.some(tool => tool.name === name)) throw new Error('Tool is not advertised by this server.');
    const result = await client.callTool({ name, arguments: args });
    this.options.record?.('mcp.tool-called', { server: id, tool: name, error: !!result.isError });
    return result;
  }
  async readResource(id, uri) {
    const result = await this.requireActive(id).readResource({ uri });
    this.options.record?.('mcp.resource-read', { server: id });
    return result;
  }
  async getPrompt(id, name, args) {
    const result = await this.requireActive(id).getPrompt({ name, arguments: args });
    this.options.record?.('mcp.prompt-read', { server: id, prompt: name });
    return result;
  }
}

module.exports = { McpExplorer, discoverMcpServers, publicCandidate, referencedNames };
