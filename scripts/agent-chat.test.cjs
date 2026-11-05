const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const chat = require('../desktop/agent-chat.cjs');

test('personal agent settings and MCP invocation stay outside the repository', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-chat-test-'));
  try {
    const userData = path.join(base, 'user-data');
    const root = path.join(base, 'project');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'productview.yaml'), 'schemaVersion: 1\n');
    const saved = chat.saveSettings(userData, { provider: 'codex', mode: 'inspect' });
    assert.deepEqual(saved, chat.readSettings(userData));
    assert.equal(fs.existsSync(path.join(root, 'agent-chat-settings.json')), false);
    const prompt = chat.promptFor([{ role: 'user', text: 'What tests are configured?' }], root);
    assert.match(prompt, /Project Room MCP/);
    const codex = chat.invocation(saved, root, '/path/to/electron', '/path/to/mcp/server.cjs', prompt, base);
    assert.ok(codex.args.includes('read-only'));
    assert.ok(codex.args.some(arg => arg.includes('mcp_servers.product_view.command')));
    assert.ok(codex.args.some(arg => arg.includes('/path/to/mcp/server.cjs')));
    const claude = chat.invocation({ provider: 'claude', mode: 'edit' }, root, '/path/to/electron', '/path/to/mcp/server.cjs', prompt, base);
    assert.ok(claude.args.includes('acceptEdits'));
    assert.ok(claude.args.some(arg => arg.includes('mcp__product_view__list_components')));
    const claudeInspect = chat.invocation({ provider: 'claude', mode: 'inspect' }, root, '/path/to/electron', '/path/to/mcp/server.cjs', prompt, base);
    assert.ok(claudeInspect.args.includes('dontAsk'));
    assert.equal(claude.stdin, prompt);
    assert.equal(claude.args.includes(prompt), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(base, 'mcp.json'))).mcpServers.product_view.args[1], root);
    assert.throws(() => chat.promptFor([{ role: 'assistant', text: 'No user message' }], root));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
