const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { McpExplorer, discoverMcpServers, publicCandidate, referencedNames } = require('../desktop/mcp-explorer.cjs');

test('MCP discovery stays read-only and the built-in server can be inspected and called', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-mcp-'));
  const appPath = path.resolve(__dirname, '..');
  const events = [];
  try {
    fs.copyFileSync(path.join(appPath, '.projectroom/project.yaml'), path.join(root, 'productview.yaml'));
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: {
      local: { command: process.execPath, args: [path.join(appPath, 'mcp/server.cjs'), root], env: { LOCAL_TOKEN: 'private-value' } }
    } }));
    const explorer = new McpExplorer({ getRoot: () => root, getConfig: () => ({ workspace: {} }), appPath,
      executable: process.execPath, isElectron: false, getEnvironment: () => null,
      record: (type, details) => events.push({ type, details }) });
    const found = explorer.list();
    assert.equal(found.length, 2);
    assert.equal(found[1].source, '.mcp.json');
    assert.deepEqual(found[1].environment, [{ name: 'LOCAL_TOKEN', available: true }]);
    assert.equal(JSON.stringify(found).includes('private-value'), false);
    assert.deepEqual(events, []);
    const detail = await explorer.connect('product-view');
    assert.ok(detail.tools.some(tool => tool.name === 'list_components'));
    assert.deepEqual(detail.resources, []);
    const result = await explorer.callTool('product-view', 'list_components', {});
    assert.match(result.content[0].text, /product-spec/);
    assert.ok(events.some(event => event.type === 'mcp.tool-called' && event.details.tool === 'list_components'));
    await explorer.disconnect();
    assert.equal(explorer.list()[0].connected, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('YAML MCP metadata exposes connection targets and environment names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-mcp-discover-'));
  try {
    const config = { workspace: { mcpServers: [{ id: 'remote', name: 'Remote', transport: 'http', url: 'https://example.com/mcp?secret=hidden', authEnv: 'MCP_TOKEN' }] } };
    const found = discoverMcpServers(root, config);
    assert.equal(found.length, 1);
    const visible = publicCandidate(found[0]);
    assert.equal(visible.endpoint, 'https://example.com/mcp');
    assert.deepEqual(visible.environment, [{ name: 'MCP_TOKEN', available: false }]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('MCP configuration placeholders appear as local Environment variable names', () => {
  const names = referencedNames({ args: ['--token', '${MCP_TOKEN}'], headers: { Authorization: 'Bearer ${MCP_TOKEN}' }, env: { API_KEY: '${MCP_TOKEN}' } });
  assert.deepEqual(names.sort(), ['API_KEY', 'MCP_TOKEN']);
});
