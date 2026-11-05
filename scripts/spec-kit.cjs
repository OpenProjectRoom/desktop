const fs = require('node:fs');
const path = require('node:path');

const slash = value => value.split(path.sep).join('/');
const artifacts = ['spec.md', 'plan.md', 'research.md', 'data-model.md', 'quickstart.md', 'tasks.md'];

function regularFile(root, relative) {
  const base = fs.realpathSync(root);
  const absolute = path.resolve(base, relative);
  if (absolute !== base && !absolute.startsWith(base + path.sep)) return false;
  try {
    if (fs.lstatSync(absolute).isSymbolicLink()) return false;
    const real = fs.realpathSync(absolute);
    return real.startsWith(base + path.sep) && fs.statSync(real).isFile();
  } catch { return false; }
}
function read(root, relative) {
  if (!regularFile(root, relative)) return '';
  if (fs.statSync(path.resolve(root, relative)).size > 500_000) return '';
  return fs.readFileSync(path.resolve(root, relative), 'utf8');
}
function extractIds(text, expression) { return [...new Set([...text.matchAll(expression)].map(match => match[1]))]; }
function taskCounts(text) {
  const tasks = [...text.matchAll(/^\s*-\s*\[([ xX])\]\s*(T\d+)\b/gm)];
  return { total: tasks.length, done: tasks.filter(match => /x/i.test(match[1])).length };
}
function checklistCounts(root, dir) {
  const folder = path.join(root, dir, 'checklists');
  try {
    if (!fs.statSync(folder).isDirectory()) return { total: 0, done: 0 };
    return fs.readdirSync(folder).filter(name => /\.md$/i.test(name)).reduce((sum, name) => {
      const checks = [...read(root, slash(path.join(dir, 'checklists', name))).matchAll(/^\s*-\s*\[([ xX])\]/gm)];
      sum.total += checks.length;
      sum.done += checks.filter(match => /x/i.test(match[1])).length;
      return sum;
    }, { total: 0, done: 0 });
  } catch { return { total: 0, done: 0 }; }
}
function activeFeature(root) {
  try {
    const state = JSON.parse(read(root, '.specify/feature.json'));
    const value = typeof state === 'string' ? state : state.feature_directory || state.feature || state.featureDirectory || state.directory || state.path;
    return typeof value === 'string' ? slash(value.replace(/\/$/, '')) : null;
  } catch { return null; }
}
function inspectSpecKit(root, config, roots, context = {}) {
  let initialized = false;
  try { initialized = fs.statSync(path.join(root, '.specify')).isDirectory() && !fs.lstatSync(path.join(root, '.specify')).isSymbolicLink(); } catch { /* Not initialized. */ }
  const constitution = regularFile(root, '.specify/memory/constitution.md') ? '.specify/memory/constitution.md' : null;
  const active = activeFeature(root);
  const componentById = new Map((config.components || []).map(item => [item.id, item]));
  const events = context.events || [];
  const runtime = context.status || {};
  const features = [];
  for (const source of roots) {
    const folder = path.resolve(root, source);
    if (!folder.startsWith(fs.realpathSync(root) + path.sep)) continue;
    let children;
    try { children = fs.readdirSync(folder, { withFileTypes: true }); } catch { continue; }
    for (const child of children.slice(0, 300)) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue;
      const dir = slash(path.join(source, child.name));
      const spec = `${dir}/spec.md`;
      if (!regularFile(root, spec)) continue;
      const text = read(root, spec);
      const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || child.name;
      const available = artifacts.filter(name => regularFile(root, `${dir}/${name}`));
      let contracts = false;
      try { contracts = fs.statSync(path.join(root, dir, 'contracts')).isDirectory(); } catch { /* Optional artifact. */ }
      const tasks = taskCounts(read(root, `${dir}/tasks.md`));
      const checklists = checklistCounts(root, dir);
      const requirementIds = extractIds(text, /\b(FR-\d+)\b/g);
      const successIds = extractIds(text, /\b(SC-\d+)\b/g);
      const clarifications = (text.match(/\[NEEDS CLARIFICATION(?::[^\]]*)?\]/gi) || []).length;
      const explicit = (config.views?.specifications?.links || []).filter(link => link.spec === spec);
      const mapSpecs = (config.components || []).filter(item => item.kind === 'specification' && item.path === spec);
      const mapIds = new Set(mapSpecs.map(item => item.id));
      const graphIds = (config.connections || []).flatMap(edge => mapIds.has(edge.from) ? [edge.to] : mapIds.has(edge.to) ? [edge.from] : []);
      const explicitIds = new Set(explicit.flatMap(link => [...(link.components || []), ...(link.tests || [])]));
      const graphOnly = [...new Set(graphIds.filter(id => !explicitIds.has(id)))];
      const linkedIds = [...new Set([...explicitIds, ...graphIds])];
      const components = linkedIds.filter(id => componentById.has(id) && componentById.get(id).kind !== 'testSuite').map(id => ({ id, name: componentById.get(id).name, kind: componentById.get(id).kind, status: runtime[id] || (context.statusKnown ? 'not running in Project Room' : 'runtime not observed') }));
      const tests = linkedIds.filter(id => componentById.get(id)?.kind === 'testSuite').map(id => {
        const last = events.find(event => event.type === 'test.finished' && event.component === id);
        const changed = fs.statSync(path.join(root, spec)).mtimeMs;
        return { id, name: componentById.get(id).name, result: !last ? 'never run in Project Room' : last.exitCode !== 0 ? 'failed' : Date.parse(last.at) < changed ? 'passed before spec changed' : 'passed', at: last?.at || null };
      });
      const linkedRequirements = [...new Set(explicit.flatMap(link => link.requirements || []))];
      const trace = explicit.map(link => ({ requirements: link.requirements || [], components: link.components || [], tests: link.tests || [], source: '.projectroom/project.yaml' }));
      if (graphOnly.length) trace.push({ requirements: [], components: graphOnly.filter(id => componentById.get(id)?.kind !== 'testSuite'), tests: graphOnly.filter(id => componentById.get(id)?.kind === 'testSuite'), source: 'Project Map' });
      const stage = tasks.total && tasks.done === tasks.total ? 'All tasks checked' : tasks.done ? 'Implementation underway' : available.includes('tasks.md') ? 'Tasks available' : available.includes('plan.md') ? 'Plan available' : 'Specification available';
      const checks = [];
      for (const id of linkedRequirements) if (!requirementIds.includes(id)) checks.push({ level: 'warning', message: `${id} is linked in .projectroom/project.yaml but is absent from spec.md.` });
      for (const test of tests) if (test.result !== 'passed') checks.push({ level: test.result === 'failed' ? 'error' : 'info', message: `${test.name}: ${test.result}.` });
      if (clarifications) checks.push({ level: 'info', message: `${clarifications} clarification marker${clarifications === 1 ? '' : 's'} remain.` });
      if (!linkedIds.length) checks.push({ level: 'info', message: 'No components or tests are linked to this feature yet.' });
      for (const item of components) {
        const command = componentById.get(item.id).runtime?.command?.[0];
        const cwd = componentById.get(item.id).runtime?.cwd || '.';
        if (command?.startsWith('.') && !regularFile(root, slash(path.join(cwd, command)))) checks.push({ level: 'warning', message: `${item.name}: configured executable ${command} is missing.` });
      }
      features.push({ directory: dir, spec, title, active: active === dir || active?.endsWith(`/${child.name}`), stage, artifacts: available, contracts, tasks, checklists, requirementIds, successIds, clarifications, components, tests, linkedRequirements, trace, checks });
    }
  }
  return { detected: Boolean(initialized || features.length || active), constitution, activeFeature: active, features: features.sort((a, b) => a.directory.localeCompare(b.directory)) };
}

module.exports = { inspectSpecKit };
