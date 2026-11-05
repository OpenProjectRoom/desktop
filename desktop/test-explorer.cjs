const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ts = require('typescript');

const MAX_CASES = 500;
const SIMPLE_TOKEN = /^[A-Za-z0-9_./:@*+=,-]+$/;
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx|jsx)$/i;
const MAX_FILE_BYTES = 1_000_000;

function testNames(source, file) {
  const kind = /\.tsx$/i.test(file) ? ts.ScriptKind.TSX : /\.jsx$/i.test(file) ? ts.ScriptKind.JSX : /\.(?:[cm]?ts)$/i.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  if (tree.parseDiagnostics.length) return [];
  const names = [];
  const known = new Map([['test', 'test'], ['it', 'test'], ['describe', 'group'], ['suite', 'group']]);
  const namespaces = new Set();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'node:test') {
      const clause = statement.importClause;
      if (clause?.name) known.set(clause.name.text, 'test');
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaces.add(clause.namedBindings.name.text);
      for (const element of clause?.namedBindings?.elements || []) {
        const exported = element.propertyName?.text || element.name.text;
        if (['test', 'it'].includes(exported)) known.set(element.name.text, 'test');
        if (['describe', 'suite'].includes(exported)) known.set(element.name.text, 'group');
      }
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      const call = declaration.initializer;
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'require' || call.arguments[0]?.text !== 'node:test') continue;
      if (ts.isIdentifier(declaration.name)) known.set(declaration.name.text, 'test');
      if (ts.isObjectBindingPattern(declaration.name)) for (const element of declaration.name.elements) {
        const exported = element.propertyName?.text || element.name.text;
        if (['test', 'it'].includes(exported)) known.set(element.name.text, 'test');
        if (['describe', 'suite'].includes(exported)) known.set(element.name.text, 'group');
      }
    }
  }
  const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function role(expression) {
    if (ts.isIdentifier(expression)) return known.get(expression.text) || null;
    if (!ts.isPropertyAccessExpression(expression)) return null;
    if (ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text)) {
      if (['test', 'it'].includes(expression.name.text)) return 'test';
      if (['describe', 'suite'].includes(expression.name.text)) return 'group';
    }
    const parent = role(expression.expression);
    if (['skip', 'todo'].includes(expression.name.text) && parent) return 'disabled';
    if (expression.name.text === 'only') return parent;
    return null;
  }
  function walk(node, ancestors = []) {
    if (ts.isCallExpression(node)) {
      const callRole = role(node.expression);
      const first = node.arguments[0];
      const name = first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) ? first.text.trim() : '';
      if (callRole === 'group' && name) {
        const callback = node.arguments.find((arg, index) => index > 0 && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)));
        if (callback) walk(callback.body, [...ancestors, name]);
        return;
      }
      if (callRole === 'test') {
        const options = node.arguments[1];
        const disabled = options && ts.isObjectLiteralExpression(options) && options.properties.some(property => ts.isPropertyAssignment(property) && ['skip', 'todo'].includes(property.name.text) && property.initializer.kind !== ts.SyntaxKind.FalseKeyword);
        const fullName = [...ancestors, name].join(' ');
        if (!disabled && name && fullName.length <= 400) names.push({ name, fullName, pattern: `^${escapePattern(fullName)}$` });
        return;
      }
      if (callRole === 'disabled') return;
    }
    ts.forEachChild(node, child => walk(child, ancestors));
  }
  walk(tree);
  const counts = new Map();
  for (const item of names) counts.set(item.fullName, (counts.get(item.fullName) || 0) + 1);
  return names.filter(item => counts.get(item.fullName) === 1);
}

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
  const cwd = inside(root, suite.tests.cwd || '.');
  let steps;
  if (command[0] === 'node') steps = [command];
  else {
    if (!['npm', 'pnpm', 'yarn', 'bun'].includes(command[0])) return null;
    const scriptName = command[1] === 'run' ? command[2] : command[1];
    if (!scriptName || command.length > (command[1] === 'run' ? 3 : 2)) return null;
    const pkg = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkg)) return null;
    const script = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts?.[scriptName];
    if (!script || typeof script !== 'string') return null;
    steps = script.split(/\s*&&\s*/).map(commandParts);
  }
  if (steps.some(step => !step)) return null;
  const testStep = steps.at(-1);
  if (!testStep || testStep[0] !== 'node' || !testStep.includes('--test') || testStep.some(part => part.startsWith('--test-name-pattern'))) return null;
  const patterns = testStep.filter(part => TEST_FILE.test(part));
  if (!patterns.length) return null;
  const prefix = testStep.filter(part => !patterns.includes(part));
  const files = new Set();
  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      try { const candidate = inside(cwd, pattern); if (fs.statSync(candidate).isFile()) files.add(pattern); } catch { /* Missing or linked test file. */ }
      continue;
    }
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
  const cases = [];
  for (const file of [...files].sort()) {
    if (cases.length >= MAX_CASES) break;
    const command = [...prefix, file];
    cases.push({ id: file, name: file, kind: 'file', command, setup: steps.slice(0, -1) });
    try {
      const target = inside(cwd, file);
      if (fs.statSync(target).size > MAX_FILE_BYTES) continue;
      for (const item of testNames(fs.readFileSync(target, 'utf8'), file)) {
        if (cases.length >= MAX_CASES) break;
        cases.push({ id: `${file}::${item.fullName}`, name: item.fullName, kind: 'node', file,
          command: [...prefix, `--test-name-pattern=${item.pattern}`, file], setup: steps.slice(0, -1) });
      }
    } catch { /* Keep the verified file entry if names cannot be parsed. */ }
  }
  return { source: 'Node test script', cases };
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
  if (configured.length) return { source: '.projectroom/project.yaml', cases: configured, canDiscover: false };
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
