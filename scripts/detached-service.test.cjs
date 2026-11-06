const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspect, change } = require('../desktop/detached-service.cjs');
const { parseConfig } = require('./config.cjs');
const { agentPrompt, reviewConfig, inspectFolder } = require('../desktop/onboarding.cjs');

test('detached service confirms real state across start and stop', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-detached-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const marker = path.join(root, 'running');
  const runtime = {
    command: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, '1')`],
    statusCommand: [process.execPath, '-e', `process.exit(require('fs').existsSync(${JSON.stringify(marker)}) ? 0 : 1)`],
    stopCommand: [process.execPath, '-e', `require('fs').unlinkSync(${JSON.stringify(marker)})`]
  };
  const options = { cwd: root, env: process.env };
  assert.equal(await inspect(runtime, options), 'stopped');
  assert.equal((await change(runtime, 'start', options)).status, 'running');
  assert.equal((await change(runtime, 'start', options)).already, true);
  assert.equal((await change(runtime, 'stop', options)).status, 'stopped');
  assert.equal(await inspect(runtime, options), 'stopped');
});

test('detached config requires real status and stop commands', () => {
  const base = 'schemaVersion: 1\nproject: {id: pilot, name: Pilot}\ncomponents:\n  - id: app\n    kind: service\n    name: App\n    position: {x: 1, y: 1}\n    runtime: {command: [node, app.js], startup: manual, lifecycle: detached}\nconnections: []\n';
  assert.throws(() => parseConfig(base), /statusCommand and stopCommand/);
  assert.equal(parseConfig(base.replace('lifecycle: detached', 'lifecycle: detached, statusCommand: [node, status.js], stopCommand: [node, stop.js]')).components[0].runtime.lifecycle, 'detached');
});

test('onboarding asks for inspection before edits and flags mismatched Compose lifecycle', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-onboarding-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.projectroom'));
  fs.writeFileSync(path.join(root, 'compose.yaml'), 'services:\n  web:\n    image: node:20\n');
  fs.writeFileSync(path.join(root, '.projectroom/project.yaml'), 'schemaVersion: 1\nproject: {id: pilot, name: Pilot}\ncomponents:\n  - id: app\n    kind: service\n    name: App\n    position: {x: 1, y: 1}\n    runtime: {command: [docker, compose, up, -d], startup: manual}\nconnections: []\n');
  const prompt = agentPrompt(inspectFolder(root), { skill: '/guide.md', schema: '/schema.json' });
  assert.match(prompt, /Phase 1 — inspect only/);
  assert.match(prompt, /Wait for my reply before writing files/);
  const review = reviewConfig(root);
  assert.equal(review.state, 'ready');
  assert.ok(review.warnings.some(message => message.includes('Compose startup needs detached lifecycle')));
});

test('setup prompt requires a source audit even when a stdio MCP CLI has no client config', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-source-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'blackbox'), '#!/bin/sh\nexec python3 scripts/host_cli.py "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'scripts/host_cli.py'), "if command == 'mcp':\n    run_stdio_server()\n");
  const inventory = inspectFolder(root);
  assert.equal(inventory.mcpServers.length, 0);
  assert.ok(inventory.cliTools.some(item => item.name === 'blackbox'));
  const prompt = agentPrompt(inventory, { skill: '/guide.md', schema: '/schema.json' });
  assert.match(prompt, /Trace wrappers into their delegated code/);
  assert.match(prompt, /MCP servers \(including stdio CLI subcommands without an MCP client file\)/);
  assert.match(prompt, /HTTP APIs \(including routes without OpenAPI\)/);
  assert.match(prompt, /source audit still required/);
  assert.match(prompt, /Register verified MCP servers in workspace\.mcpServers/);
  assert.match(prompt, /do not substitute an owner or admin key/);
});
