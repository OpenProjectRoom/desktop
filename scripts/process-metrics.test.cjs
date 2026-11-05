const test = require('node:test');
const assert = require('node:assert/strict');
const { ProcessMetrics, parseProcessTable, processTreeUsage, compactHistory } = require('../desktop/process-metrics.cjs');

test('counts a service and its children, excluding unrelated processes', () => {
  const rows = parseProcessTable(' 11 1 2.5 1024\n 12 11 4.0 2048\n 13 12 1.0 512\n 14 1 99.0 8192\n');
  assert.deepEqual(processTreeUsage(rows, 11), { cpu: 7.5, memoryBytes: 3584 * 1024, processCount: 3 });
  assert.equal(processTreeUsage(rows, 999), null);
});

test('keeps samples in memory through stop, clears on new run and workspace reset', async () => {
  const events = [];
  let rows = parseProcessTable(' 20 1 10 1024\n 21 20 5 2048\n');
  const monitor = new ProcessMetrics({ readTable: async () => rows, onSample: item => events.push(item), intervalMs: 100000 });
  monitor.start('web', 20);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(monitor.snapshot().services.web.samples[0].cpu, 15);
  assert.equal(monitor.snapshot().services.web.samples[0].memoryBytes, 3 * 1048576);
  monitor.stop('web');
  assert.equal(monitor.snapshot().services.web.samples.length, 1);
  assert.equal(monitor.snapshot().services.web.running, false);
  assert.equal(events.filter(item => item.type === 'metrics-total').length, 1);
  rows = parseProcessTable(' 30 1 2 512\n');
  monitor.start('web', 30);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(monitor.snapshot().services.web.samples.length, 1);
  assert.equal(monitor.snapshot().services.web.samples[0].cpu, 2);
  monitor.reset();
  assert.deepEqual(monitor.snapshot(), { services: {}, totals: [] });
});

test('discards a process snapshot from a previous workspace', async () => {
  let release;
  const monitor = new ProcessMetrics({ readTable: () => new Promise(resolve => { release = resolve; }), intervalMs: 100000 });
  monitor.start('old', 42);
  monitor.reset();
  release(parseProcessTable(' 42 1 1 10\n'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(monitor.snapshot(), { services: {}, totals: [] });
});

test('older session measurements remain represented after memory compaction', () => {
  const points = Array.from({ length: 20001 }, (_, at) => ({ at }));
  compactHistory(points);
  assert.equal(points[0].at, 0);
  assert.equal(points.at(-1).at, 20000);
  assert.ok(points.length < 20001);
});
