const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverCliTools, inspectCliHelp, linkCliTool } = require('../desktop/cli-explorer.cjs');
const { runCliTrial } = require('../desktop/command-tools.cjs');
const { commandParsedHelp } = require('../dist/cli-help.js');

test('recognizes paired flags, value options and subcommands in common help output', () => {
  const help = commandParsedHelp('Usage: desk <COMMAND> [OPTIONS]\n\nCommands:\n  serve    Start the server\n  status   Show status\n\nOptions:\n  -h, --help          Print help\n      --format <TYPE>  Output format\n  -v, --verbose       Verbose output');
  assert.deepEqual(help.commands.map(item => item.name), ['serve', 'status']);
  assert.deepEqual(help.rows.map(row => row[1]), ['-h, --help', '--format <TYPE>', '-v, --verbose']);
});
const { loadConfig } = require('./config.cjs');

test('CLI discovery is read-only; linking writes a help-only tool to project YAML', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-cli-'));
  try {
    fs.mkdirSync(path.join(root, '.projectroom'));
    fs.copyFileSync(path.join(__dirname, '..', '.projectroom/project.yaml'), path.join(root, '.projectroom/project.yaml'));
    fs.mkdirSync(path.join(root, 'bin'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', bin: { pilot: './bin/pilot.cjs' } }));
    fs.writeFileSync(path.join(root, 'bin/pilot.cjs'), '#!/usr/bin/env node\nconst fs = require("node:fs");fs.writeFileSync("ran.txt", "yes");console.log("Usage: pilot [options]\\n  --help  Show help");\n');
    const initial = loadConfig(path.join(root, '.projectroom/project.yaml')).config;
    const found = discoverCliTools(root, initial);
    const pilot = found.find(item => item.name === 'pilot');
    assert.ok(pilot);
    assert.equal(pilot.source, 'package.json · bin');
    assert.equal(fs.existsSync(path.join(root, 'ran.txt')), false);
    const linked = linkCliTool(root, pilot.id, '--help');
    const component = linked.config.components.find(item => item.id === linked.id);
    assert.deepEqual(component.runtime.command, ['node', './bin/pilot.cjs', '--help']);
    assert.deepEqual(component.cli.helpCommand, component.runtime.command);
    assert.equal(component.cli.source, 'bin/pilot.cjs');
    assert.equal(linked.config.workspace.additionalViews.includes('commands'), true);
    assert.equal(fs.existsSync(path.join(root, 'ran.txt')), false);
    assert.equal(discoverCliTools(root, linked.config).find(item => item.id === pilot.id).linkedId, linked.id);
    const help = await inspectCliHelp(root, linked.config, pilot.id, '--help');
    assert.match(help.output, /Usage: pilot/);
    assert.equal(fs.existsSync(path.join(root, 'ran.txt')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI discovery ignores linked files and does not turn package scripts into tools', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-cli-safe-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node tests.js' } }));
    fs.symlinkSync(process.execPath, path.join(root, 'external-tool'));
    assert.deepEqual(discoverCliTools(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI discovery identifies Cargo and Python entry metadata without executing them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-cli-metadata-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "pilot-rs"\nversion = "0.1.0"\n');
    fs.writeFileSync(path.join(root, 'src/main.rs'), 'fn main() {}\n');
    fs.writeFileSync(path.join(root, 'pyproject.toml'), '[project.scripts]\npilot-py = "pilot:main"\n');
    fs.writeFileSync(path.join(root, 'pilot.py'), 'def main():\n    print("hello")\n');
    const found = discoverCliTools(root);
    assert.ok(found.some(item => item.name === 'pilot-rs' && item.command.includes('--manifest-path')));
    assert.ok(found.some(item => item.name === 'pilot-py' && item.command[1] === '-c'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI discovery keeps Go examples, shell wrappers and unbuilt package bins distinct', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-cli-audit-'));
  try {
    fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/pilot\n\ngo 1.23\n');
    fs.mkdirSync(path.join(root, 'examples', 'base'), { recursive: true });
    fs.writeFileSync(path.join(root, 'examples/base/main.go'), 'package main\nfunc main() {}\n');
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'scripts/pilot'), '#!/bin/sh\necho ready\n', { mode: 0o755 });
    fs.writeFileSync(path.join(root, 'scripts/build.sh'), '#!/bin/sh\necho build\n', { mode: 0o755 });
    fs.mkdirSync(path.join(root, 'packages', 'pilot', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/pilot/package.json'), JSON.stringify({ name: 'pilot', bin: 'dist/cli.cjs' }));
    fs.writeFileSync(path.join(root, 'packages/pilot/src/cli.ts'), 'export {};\n');
    const found = discoverCliTools(root);
    assert.ok(found.some(item => item.path === 'examples/base/main.go' && item.available));
    assert.ok(found.some(item => item.path === 'scripts/pilot' && item.available));
    assert.equal(found.some(item => item.path === 'scripts/build.sh'), false);
    const unbuilt = found.find(item => item.path === 'packages/pilot/dist/cli.cjs');
    assert.equal(unbuilt?.available, false);
    assert.throws(() => inspectCliHelp(root, {}, unbuilt.id, '--help'), /Build this CLI/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('CLI trial passes separate arguments, bounds input and redacts local secret output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-view-cli-trial-'));
  try {
    const command = [process.execPath, '-e', 'console.log(process.argv.slice(1).join("|"));console.log(process.env.LOCAL_TOKEN)'];
    const result = await runCliTrial(root, 'pilot', command, ['one', 'two words'], root, { ...process.env, LOCAL_TOKEN: 'secret-value' }, ['secret-value']);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /one\|two words/);
    assert.doesNotMatch(result.output, /secret-value/);
    assert.throws(() => runCliTrial(root, 'pilot', command, Array(21).fill('x'), root), /at most 20/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
