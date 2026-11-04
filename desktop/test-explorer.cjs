const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_CASES = 500;
const SIMPLE_TOKEN = /^[A-Za-z0-9_./:@*+=,-]+$/;

function inside(root, relative) {
  const base = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(base, relative));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Test path is outside the project.');
  return target;
}
function commandParts(value) {
  const parts = value.trim().split(/\s+/);
  return parts.length && parts.every(part => SIMPLE_TOKEN.test(part)) ? parts : null;
}
function nodeScript(root, suite) {
  const command = suite.tests.command;
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(command[0])) return null;
  const scriptName = command[1] === 'run' ? command[2] : command[1];
  if (!scriptName || command.length > (command[1] === 'run' ? 3 : 2)) return null;
  const cwd = inside(root, suite.tests.cwd || '.');
  const pkg = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkg)) return null;
  const script = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts?.[scriptName];
  if (!script || typeof script !== 'string') return null;
  const steps = script.split(/\s*&&\s*/).map(commandParts);
  if (steps.some(step => !step)) return null;
  const testStep = steps.at(-1);
  if (!testStep || testStep[0] !== 'node' || !testStep.includes('--test')) return null;
  const patterns = testStep.filter(part => /\*.*\.(?:test|spec)\.[a-z0-9]+$/i.test(part));
  if (!patterns.length) return null;
  const prefix = testStep.filter(part => !patterns.includes(part));
  const files = new Set();
  for (const pattern of patterns) {
    const dir = path.dirname(pattern);
    const base = path.basename(pattern);
    if (dir.includes('*')) continue;
    let folder;
    try { folder = inside(root, path.join(suite.tests.cwd || '.', dir)); } catch { continue; }
    const matcher = new RegExp('^' + base.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    for (const name of fs.readdirSync(folder)) {
      if (!matcher.test(name)) continue;
      const candidate = path.join(folder, name);
      try { inside(root, path.relative(fs.realpathSync(root), candidate)); if (fs.statSync(candidate).isFile()) files.add(path.posix.join(dir === '.' ? '' : dir, name)); }
      catch { /* Ignore links outside the workspace and files removed during discovery. */ }
    }
  }
  return { source: 'Node test script', cases: [...files].sort().slice(0, MAX_CASES).map(file => ({ id: file, name: file, kind: 'file', command: [...prefix, file], setup: steps.slice(0, -1) })) };
}
function isCargo(suite) {
  const command = suite.tests.command;
  return command[0] === 'cargo' && command[1] === 'test' && !command.includes('--');
}
function parseCargoList(stdout, suite) {
  const names = [...new Set(stdout.split(/\r?\n/).map(line => line.match(/^(.+): (?:test|benchmark)$/)?.[1]).filter(Boolean))];
  return names.slice(0, MAX_CASES).map(name => ({ id: name, name, kind: 'rust', command: [...suite.tests.command, name, '--', '--exact'], setup: [] }));
}
function listCases(root, suite, discovered = []) {
  const configured = (suite.tests.cases || []).map(item => ({ id: item.id, name: item.name, kind: 'configured', command: item.command, setup: [] }));
  if (configured.length) return { source: 'productview.yaml', cases: configured, canDiscover: false };
  const node = nodeScript(root, suite);
  if (node) return { ...node, canDiscover: false };
  if (isCargo(suite)) return { source: 'Cargo test list', cases: discovered, canDiscover: true };
  return { source: 'No case adapter', cases: [], canDiscover: false };
}
function discoverCargo(root, suite, env) {
  if (!isCargo(suite)) throw new Error('This suite does not use a supported Cargo test command.');
  const cwd = inside(root, suite.tests.cwd || '.');
  const command = [...suite.tests.command, '--', '--list'];
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const timer = setTimeout(() => { child.kill('SIGTERM'); fail(new Error('Test discovery timed out after 90 seconds.')); }, 90000);
    function fail(error) { if (finished) return; finished = true; clearTimeout(timer); reject(error); }
    child.stdout.on('data', chunk => { stdout += chunk.toString(); if (stdout.length > 2_000_000) { child.kill('SIGTERM'); fail(new Error('Test list is too large.')); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-5000); });
    child.once('error', error => fail(error));
    child.once('close', code => {
      if (finished) return;
      clearTimeout(timer);
      if (code !== 0) return fail(new Error(`Cargo test discovery failed (exit ${code}): ${stderr.slice(-500)}`));
      finished = true;
      resolve(parseCargoList(stdout, suite));
    });
  });
}

module.exports = { listCases, discoverCargo, isCargo, parseCargoList };
