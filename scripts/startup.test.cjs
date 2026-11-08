const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startupDestination } = require('../desktop/startup.cjs');

function userData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-startup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the demo appears only on the first launch without a project', t => {
  const dir = userData(t);
  assert.deepEqual(startupDestination(dir, [], () => false), { mode: 'intro-demo' });
  assert.deepEqual(startupDestination(dir, [], () => false), { mode: 'empty' });
});

test('a saved project opens directly and never detours through the demo', t => {
  const dir = userData(t);
  fs.writeFileSync(path.join(dir, 'last-project-v1.json'), JSON.stringify({ root: '/repo/current' }));
  assert.deepEqual(startupDestination(dir, ['/repo/other'], root => root === '/repo/current'), { mode: 'project', root: '/repo/current' });
});

test('an unavailable last project opens another registered project or an empty chooser', t => {
  const dir = userData(t);
  fs.writeFileSync(path.join(dir, 'last-project-v1.json'), JSON.stringify({ root: '/repo/missing' }));
  assert.deepEqual(startupDestination(dir, ['/repo/available'], root => root === '/repo/available'), { mode: 'project', root: '/repo/available' });
  assert.deepEqual(startupDestination(dir, [], () => false), { mode: 'empty' });
});
