const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { appendEvent, ensureHistory, logPath, readEvents } = require('../desktop/history.cjs');
const { parseConfig } = require('./config.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('history rejects linked directories and event files before writing outside the workspace', t => {
  const root = fixture(t);
  const outside = path.join(root, 'outside');
  const project = path.join(root, 'project');
  fs.mkdirSync(outside);
  fs.mkdirSync(project);
  fs.symlinkSync(outside, path.join(project, '.productview'));
  assert.throws(() => appendEvent(project, 'workspace.opened'), /regular directory/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(project, '.productview'));

  const history = path.join(project, '.productview');
  fs.mkdirSync(history);
  const target = path.join(outside, 'target.txt');
  fs.writeFileSync(target, 'unchanged');
  fs.symlinkSync(target, path.join(history, 'events.jsonl'));
  assert.throws(() => appendEvent(project, 'workspace.opened'), /regular file/);
  assert.throws(() => readEvents(project), /regular file/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
  fs.unlinkSync(path.join(history, 'events.jsonl'));
  fs.rmdirSync(path.join(history, 'logs'));
  fs.symlinkSync(outside, path.join(history, 'logs'));
  assert.throws(() => logPath(project, 'service', 'test'), /regular directory/);
  assert.deepEqual(fs.readdirSync(outside), ['target.txt']);
});

test('new project history ignores event and service output by default', t => {
  const root = fixture(t);
  execFileSync('git', ['init', '-q', root]);
  ensureHistory(root);
  appendEvent(root, 'workspace.opened', { project: 'Example' });
  const log = logPath(root, 'web', 'service');
  fs.writeFileSync(log, 'private process output\n');
  const ignored = execFileSync('git', ['-C', root, 'check-ignore', '.productview/events.jsonl', '.productview/logs/' ], { encoding: 'utf8' });
  assert.match(ignored, /events\.jsonl/);
  assert.match(ignored, /logs\//);
});

test('oversized project YAML is rejected before parsing', () => {
  assert.throws(() => parseConfig('x'.repeat(5_000_001)), /5 MB limit/);
});

test('packaged UI has a restrictive script policy and no inline JavaScript', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy[^>]+script-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*[^\s<]/i);
  assert.match(html, /<script src="legacy-demo\.js"><\/script>/);
});
