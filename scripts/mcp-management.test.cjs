const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { addMcpServer, linkMcpServer, removeMcpServer } = require('../desktop/mcp-management.cjs');
const { McpExplorer } = require('../desktop/mcp-explorer.cjs');
const { loadConfig } = require('./config.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-mcp-management-'));
  fs.copyFileSync(path.join(__dirname, '..', '.projectroom/project.yaml'), path.join(root, 'productview.yaml'));
  return root;
}

test('multiple manual and discovered MCP servers persist independently in YAML', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: {
      alpha: { command: 'node', args: ['tools/alpha.js'], env: { PRIVATE_TOKEN: 'literal-secret' } },
      beta: { command: 'node', args: ['tools/beta.js'] }
    } }));
    const first = linkMcpServer(root, '.mcp.json:alpha');
    const second = linkMcpServer(root, '.mcp.json:beta');
    const manual = addMcpServer(root, { name: 'Local reporting', transport: 'stdio', command: 'node', args: 'tools/report.js', cwd: '.', environment: 'REPORT_TOKEN' });
    const remote = addMcpServer(root, { name: 'Remote search', transport: 'http', url: 'https://example.com/mcp', authEnv: 'SEARCH_TOKEN' });
    const configured = remote.config.workspace.mcpServers;
    assert.equal(configured.length, 4);
    assert.deepEqual(new Set(configured.map(item => item.id)), new Set([first.id, second.id, manual.id, remote.id]));
    assert.deepEqual(configured.find(item => item.id === first.id).environment, ['PRIVATE_TOKEN']);
    assert.equal(configured.find(item => item.id === first.id).linkedFrom, '.mcp.json:alpha');
    assert.equal(fs.readFileSync(path.join(root, 'productview.yaml'), 'utf8').includes('literal-secret'), false);
    assert.throws(() => linkMcpServer(root, '.mcp.json:alpha'), /already linked/);
    const explorer = new McpExplorer({ getRoot: () => root, getConfig: () => loadConfig(path.join(root, 'productview.yaml')).config,
      getEnvironment: () => null });
    assert.equal(explorer.list().find(item => item.id === '.mcp.json:alpha').linkedId, first.id);
    removeMcpServer(root, first.id);
    const after = loadConfig(path.join(root, 'productview.yaml')).config.workspace.mcpServers;
    assert.equal(after.length, 3);
    assert.equal(after.some(item => item.id === second.id), true);
    assert.equal(fs.existsSync(path.join(root, '.mcp.json')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('two MCP server sessions can stay connected and disconnect separately', async () => {
  const root = fixture();
  const appPath = path.resolve(__dirname, '..');
  try {
    for (const name of ['First test server', 'Second test server']) addMcpServer(root, { name, transport: 'stdio', command: process.execPath,
      args: `${path.join(appPath, 'mcp/server.cjs')}\n${root}`, cwd: '.' });
    const explorer = new McpExplorer({ getRoot: () => root, getConfig: () => loadConfig(path.join(root, 'productview.yaml')).config,
      getEnvironment: () => null, record: () => {} });
    try {
      const ids = explorer.list().filter(item => item.id.startsWith('yaml:')).map(item => item.id);
      assert.equal(ids.length, 2);
      await explorer.connect(ids[0]);
      await explorer.connect(ids[1]);
      assert.equal(explorer.list().filter(item => item.connected).length, 2);
      assert.ok((await explorer.describe(ids[0])).tools.some(item => item.name === 'list_components'));
      await explorer.disconnect(ids[0]);
      assert.equal(explorer.list().find(item => item.id === ids[1]).connected, true);
      await explorer.disconnect();
      assert.equal(explorer.list().filter(item => item.connected).length, 0);
    } finally { await explorer.disconnect(); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('invalid MCP registrations do not change YAML', () => {
  const root = fixture();
  try {
    const file = path.join(root, 'productview.yaml');
    const original = fs.readFileSync(file, 'utf8');
    assert.throws(() => addMcpServer(root, { name: 'Bad', transport: 'http', url: 'https://example.com/mcp?token=private' }), /clean endpoint/);
    assert.throws(() => addMcpServer(root, { name: 'Bad', transport: 'stdio', command: 'node', cwd: '../outside' }), /relative project path/);
    assert.throws(() => removeMcpServer(root, 'missing'), /no longer exists/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('remote MCP OAuth registration stores public metadata and no token', () => {
  const root = fixture();
  try {
    const saved = addMcpServer(root, { name: 'Protected tools', transport: 'http', url: 'https://example.com/mcp', authType: 'oauth2', scopes: 'read write' });
    const item = saved.config.workspace.mcpServers.find(entry => entry.id === saved.id);
    assert.deepEqual(item.auth, { type: 'oauth2', scopes: ['read', 'write'] });
    assert.equal(new McpExplorer({ getRoot: () => root, getConfig: () => saved.config, getEnvironment: () => null }).list().find(entry => entry.id === `yaml:${saved.id}`).authType, 'oauth2');
    assert.throws(() => addMcpServer(root, { name: 'Mixed', transport: 'http', url: 'https://example.com/mcp', authType: 'oauth2', authEnv: 'TOKEN' }), /Choose Bearer or OAuth/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
