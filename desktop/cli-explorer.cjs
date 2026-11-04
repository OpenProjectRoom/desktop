const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig } = require('../scripts/config.cjs');
const { readCommandHelp } = require('./command-tools.cjs');

const SKIP = new Set(['.git', '.productview', 'node_modules', 'dist', 'build', 'target', '.next', 'reports', 'coverage']);
const HELP_ARGS = new Set(['--help', '-h', 'help']);

function discoverCliTools(root, config = {}) {
  if (!root) return [];
  const base = fs.realpathSync(root);
  const candidates = new Map();
  const seenMetadata = new Set();
  let visited = 0;

  function file(relative) {
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) return null;
    const location = path.resolve(base, relative);
    if (location !== base && !location.startsWith(base + path.sep)) return null;
    try {
      const stat = fs.lstatSync(location);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) return null;
      const canonical = fs.realpathSync(location);
      if (!canonical.startsWith(base + path.sep)) return null;
      return { location, stat };
    } catch { return null; }
  }

  function commandFor(relative, stat) {
    const ext = path.extname(relative).toLowerCase();
    const normalized = './' + relative.split(path.sep).join('/');
    if (['.js', '.cjs', '.mjs'].includes(ext)) return ['node', normalized];
    if (ext === '.py') return ['python3', normalized];
    if (ext === '.sh' || ext === '.bash') return ['sh', normalized];
    if (stat.mode & 0o111) return [normalized];
    return null;
  }

  function add(name, relative, source, kind, overrideCommand = null) {
    if (candidates.size >= 80) return;
    const entry = file(relative);
    if (!entry) return;
    const command = overrideCommand || commandFor(relative, entry.stat);
    if (!command) return;
    const id = `${kind}:${name}:${relative}`;
    if (candidates.has(id)) return;
    const linked = (config.components || []).find(item => item.kind === 'commandTool' &&
      (item.cli?.source === relative || command.every((part, index) => item.runtime?.command?.[index] === part)));
    candidates.set(id, { id, name, source, path: relative, command, cwd: '.', linkedId: linked?.id || null });
  }

  function inspectPackage(relative) {
    if (seenMetadata.has(relative)) return;
    seenMetadata.add(relative);
    const entry = file(relative);
    if (!entry) return;
    try {
      const pkg = JSON.parse(fs.readFileSync(entry.location, 'utf8'));
      const bins = typeof pkg.bin === 'string' ? { [pkg.name?.split('/').pop() || path.basename(path.dirname(relative))]: pkg.bin } : pkg.bin;
      if (!bins || typeof bins !== 'object' || Array.isArray(bins)) return;
      for (const [name, target] of Object.entries(bins)) {
        if (typeof target === 'string') add(name, path.normalize(path.join(path.dirname(relative), target)), `${relative} · bin`, 'package');
      }
    } catch { /* Invalid metadata is only a missing discovery hint. */ }
  }

  function inspectPython(relative) {
    const entry = file(relative);
    if (!entry) return;
    let scripts = false;
    for (const line of fs.readFileSync(entry.location, 'utf8').split('\n')) {
      const section = /^\s*\[([^\]]+)\]\s*$/.exec(line);
      if (section) { scripts = ['project.scripts', 'tool.poetry.scripts'].includes(section[1]); continue; }
      if (!scripts) continue;
      const match = /^\s*([A-Za-z][\w.-]*)\s*=\s*["']([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):([A-Za-z_]\w*)["']/.exec(line);
      if (!match) continue;
      const modulePath = match[2].replaceAll('.', path.sep) + '.py';
      let location = path.normalize(path.join(path.dirname(relative), modulePath));
      if (!file(location)) location = path.normalize(path.join(path.dirname(relative), 'src', modulePath));
      const importPaths = [path.dirname(relative), path.join(path.dirname(relative), 'src')].map(value => value === '.' ? '' : value.split(path.sep).join('/'));
      const code = `import sys; sys.path[:0] = ${JSON.stringify(importPaths)}; from ${match[2]} import ${match[3]}; sys.exit(${match[3]}())`;
      add(match[1], location, `${relative} · project.scripts`, 'python', ['python3', '-c', code]);
    }
  }

  function inspectCargo(relative) {
    const entry = file(relative);
    if (!entry) return;
    const text = fs.readFileSync(entry.location, 'utf8');
    const packageSection = /(?:^|\n)\[package\]([\s\S]*?)(?=\n\[|$)/.exec(text)?.[1] || '';
    const packageName = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(packageSection)?.[1];
    const manifestDir = path.dirname(relative);
    const manifest = './' + relative.split(path.sep).join('/');
    const bins = [...text.matchAll(/(?:^|\n)\[\[bin\]\]([\s\S]*?)(?=\n\[|$)/g)];
    for (const bin of bins) {
      const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(bin[1])?.[1];
      if (!name) continue;
      const source = /^\s*path\s*=\s*["']([^"']+)["']/m.exec(bin[1])?.[1] || `src/bin/${name}.rs`;
      add(name, path.normalize(path.join(manifestDir, source)), `${relative} · [[bin]]`, 'cargo', ['cargo', 'run', '--quiet', '--manifest-path', manifest, '--bin', name, '--']);
    }
    if (packageName && file(path.join(manifestDir, 'src/main.rs'))) {
      add(packageName, path.normalize(path.join(manifestDir, 'src/main.rs')), `${relative} · package`, 'cargo', ['cargo', 'run', '--quiet', '--manifest-path', manifest, '--bin', packageName, '--']);
    }
  }

  function walk(relative, depth) {
    if (depth > 3 || visited >= 700 || candidates.size >= 80) return;
    let entries;
    try { entries = fs.readdirSync(path.join(base, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++visited > 700 || candidates.size >= 80) break;
      if (entry.isSymbolicLink() || SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const next = path.normalize(path.join(relative, entry.name));
      if (entry.isDirectory()) {
        if (depth < 3 && (depth === 0 || ['bin', 'cli', 'cmd', 'scripts', 'packages', 'apps', 'crates', 'tools', 'src'].includes(entry.name) || /(^|[/\\])(packages|apps|crates|tools|cmd)$/.test(relative))) walk(next, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === 'package.json') inspectPackage(next);
      else if (entry.name === 'pyproject.toml') inspectPython(next);
      else if (entry.name === 'Cargo.toml') inspectCargo(next);
      else if (entry.name === 'main.go' && /(^|[/\\])cmd[/\\][^/\\]+$/.test(relative) && file('go.mod')) {
        const name = path.basename(relative);
        add(name, next, `${next} · Go command`, 'go', ['go', 'run', './' + relative.split(path.sep).join('/')]);
      }
      else if (relative === '.' || /(^|[/\\])(bin|cli)([/\\]|$)/.test(relative) || /(?:^|[-_])(cli|command|tool)(?:[-_.]|$)/i.test(entry.name)) {
        const found = file(next);
        if (!found || !(found.stat.mode & 0o111)) continue;
        const first = fs.readFileSync(found.location, { encoding: 'utf8', flag: 'r' }).slice(0, 180);
        if (!first.startsWith('#!')) continue;
        add(path.basename(entry.name, path.extname(entry.name)), next, `${next} · executable`, 'file');
      }
    }
  }
  walk('.', 0);
  return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

function candidate(root, config, id) {
  const found = discoverCliTools(root, config).find(item => item.id === id);
  if (!found) throw new Error('CLI entry point is no longer present. Refresh discovery.');
  return found;
}
function helpArgument(value) {
  if (!HELP_ARGS.has(value)) throw new Error('Choose --help, -h, or help.');
  return value;
}
function inspectCliHelp(root, config, id, helpArg) {
  const item = candidate(root, config, id);
  const environment = Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
  return readCommandHelp(root, id, [...item.command, helpArgument(helpArg)], fs.realpathSync(root), environment, [], ['cargo', 'go'].includes(item.command[0]) ? 45000 : 8000);
}

function linkCliTool(root, id, helpArg) {
  const base = fs.realpathSync(root);
  const file = path.join(base, 'productview.yaml');
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('OpenBuildRoom cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const item = candidate(base, current.config, id);
  if (item.linkedId) throw new Error('This CLI entry point is already linked in productview.yaml.');
  const argument = helpArgument(helpArg);
  const stem = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cli';
  const slug = /^[a-z]/.test(stem) ? stem : `cli-${stem}`;
  let componentId = slug;
  for (let n = 2; current.config.components.some(component => component.id === componentId); n++) componentId = `${slug}-${n}`;
  let position;
  for (let row = 0; !position; row++) for (const x of [5, 36, 68]) {
    const place = { x, y: 70 + row * 130 };
    if (current.config.components.every(component => Math.abs(component.position.x - place.x) >= 25 || Math.abs(component.position.y - place.y) >= 118)) { position = place; break; }
  }
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const component = {
    id: componentId, kind: 'commandTool', name: item.name, icon: 'terminal',
    position,
    runtime: { command: [...item.command, argument], cwd: '.', startup: 'manual' },
    cli: { mode: 'task', source: item.path, summary: `Local CLI entry point discovered in ${item.source}.`,
      description: 'Linked for exploration. Run currently opens help; set a specific action in productview.yaml before using this as an operational command.',
      usage: item.command.join(' '), helpCommand: [...item.command, argument] }
  };
  document.get('components', true).add(component);
  if (!((current.config.workspace?.additionalViews || []).includes('commands'))) {
    if (!document.has('workspace')) document.set('workspace', {});
    const views = document.getIn(['workspace', 'additionalViews'], true);
    if (YAML.isSeq(views)) views.add('commands');
    else document.setIn(['workspace', 'additionalViews'], ['commands']);
  }
  const raw = String(document);
  parseConfig(raw);
  const temporary = path.join(base, `.productview-cli-${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { ...loadConfig(file), id: componentId };
}

module.exports = { discoverCliTools, inspectCliHelp, linkCliTool };
