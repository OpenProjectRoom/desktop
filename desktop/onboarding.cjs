const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { parseEnv } = require('node:util');
const { declarations } = require('./environment.cjs');
const { loadConfig, configPath, hasConfig, CONFIG_RELATIVE } = require('../scripts/config.cjs');
const { discoverMcpServers, publicCandidate } = require('./mcp-explorer.cjs');
const { discoverCliTools } = require('./cli-explorer.cjs');
const { discoverSpecs } = require('./api-explorer.cjs');

function dataCandidates(root, compose) {
  const found = new Set();
  let visited = 0;
  const walk = (relative, depth) => {
    if (depth > 3 || visited > 1200 || found.size >= 20) return;
    let entries;
    try { entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++visited > 1200 || found.size >= 20) break;
      if (entry.isSymbolicLink()) continue;
      const next = path.join(relative, entry.name).split(path.sep).join('/').replace(/^\.\//, '');
      if (entry.isFile() && /\.(?:sqlite|sqlite3|db)$/i.test(entry.name)) found.add(`SQLite file: ${next}`);
      if (!entry.isDirectory() || ['.git', '.productview', 'node_modules', 'target', 'build', 'dist', '.next'].includes(entry.name)) continue;
      if (/^(data|storage|uploads|evidence)$/i.test(entry.name)) found.add(`Local storage folder: ${next}`);
      walk(next, depth + 1);
    }
  };
  walk('.', 0);
  for (const relative of compose) {
    try {
      const text = fs.readFileSync(path.join(root, relative), 'utf8').slice(0, 100000);
      if (/image:\s*[\w./-]*postgres(?:[:@\s]|$)/im.test(text)) found.add(`PostgreSQL service in ${relative}`);
      if (/image:\s*[\w./-]*(?:mysql|mariadb)(?:[:@\s]|$)/im.test(text)) found.add(`MySQL/MariaDB service in ${relative}`);
    } catch { /* A candidate file can disappear during inspection. */ }
  }
  return [...found];
}

function inspectFolder(root) {
  const canonical = fs.realpathSync(root);
  if (!fs.statSync(canonical).isDirectory()) throw new Error('Choose a project folder.');
  const top = fs.readdirSync(canonical, { withFileTypes: true });
  const has = relative => fs.existsSync(path.join(canonical, relative));
  const specs = ['.specify', 'specs', 'specifications'].filter(has);
  const docs = ['docs', 'documentation'].filter(has);
  const compose = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'infra/compose/compose.yaml'].filter(has);
  let scripts = [];
  let config = {};
  try { config = loadConfig(configPath(canonical)).config; } catch { /* An existing project can still be inspected without YAML. */ }
  if (has('package.json')) {
    try { scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(canonical, 'package.json'), 'utf8')).scripts || {}).slice(0, 30); }
    catch { /* The agent can inspect malformed package metadata. */ }
  }
  return {
    root: canonical,
    name: path.basename(canonical),
    hasConfig: hasConfig(canonical),
    specs, docs, compose, scripts, dataCandidates: dataCandidates(canonical, compose),
    mcpServers: discoverMcpServers(canonical, config).map(item => publicCandidate(item)),
    cliTools: discoverCliTools(canonical, config).map(item => ({ name: item.name, path: item.path, source: item.source, linked: !!item.linkedId })),
    apiSpecs: discoverSpecs(canonical).map(item => ({ name: item.name, path: item.spec, endpoints: item.operations.length })),
    instructions: ['AGENTS.md', 'CLAUDE.md'].filter(has),
    entryFiles: top.filter(entry => entry.isFile() && /^(readme|makefile|justfile|cargo\.toml|pyproject\.toml|go\.mod|blackbox)$/i.test(entry.name)).map(entry => entry.name).slice(0, 12)
  };
}

function exportContract(appPath, userData) {
  const directory = path.join(userData, 'agent-onboarding');
  fs.mkdirSync(directory, { recursive: true });
  const skill = path.join(directory, 'PROJECT_ROOM_AGENT_GUIDE.md');
  const schema = path.join(directory, 'projectroom.schema.json');
  fs.copyFileSync(path.join(appPath, 'agent/project-room/SKILL.md'), skill);
  fs.copyFileSync(path.join(appPath, 'schemas/projectroom.schema.json'), schema);
  return { skill, schema };
}

function createProgressSession() {
  const id = randomUUID();
  return { id, file: path.join(os.tmpdir(), `project-room-onboarding-${id}.json`), copiedAt: null };
}

function readOnboardingProgress(session) {
  if (!session) return null;
  try {
    const stat = fs.lstatSync(session.file);
    if (!stat.isFile() || stat.size > 4096) return null;
    const value = JSON.parse(fs.readFileSync(session.file, 'utf8'));
    if (value.sessionId !== session.id || !['auditing', 'findings_ready', 'configuring', 'finished'].includes(value.phase)) return null;
    return { phase: value.phase, updatedAt: stat.mtime.toISOString() };
  } catch { return null; }
}

function agentPrompt(inventory, contract) {
  return [
    `Set up this existing repository for Project Room: ${inventory.root}`,
    `Read the Project Room guide at ${contract.skill} and validate against ${contract.schema}. Audit the repository source, not just its manifests or Project Room configuration. Follow actual entry points and call paths before deciding what belongs in the map.`,
    ...(contract.progress ? [
      '',
      `Local progress signal for Project Room: ${contract.progress.file}`,
      `Follow the guide's optional local setup progress protocol with session ID ${contract.progress.id}. Start with {"sessionId":"${contract.progress.id}","phase":"auditing"}; then report findings_ready, configuring and finished at the guide's milestones. If you cannot write this file, continue without it.`
    ] : []),
    '',
    'Phase 1 — inspect only. Complete every row of the Source audit table in the guide, including product context, Web/Desktop/Mobile applications, backend services, HTTP APIs, MCP servers, CLI tools, tests, data and runtime evidence. Trace scripts and wrappers into their delegated code; do a second source pass before reporting anything absent. For each launchable application, service, local stdio MCP server and CLI tool, determine whether a separate build is needed and identify its exact verified build command and working directory; distinguish a build from install, migration, packaging and deployment. HTTP routes need not have OpenAPI; a stdio MCP server may exist only as a CLI subcommand without a client file. Distinguish an MCP server from a client, dependency or documentation mention. For each finding, give source file/function evidence, the proposed Project Room entry, required environment variable NAMES, authentication scope and what still needs a manual check. Mark uncertain or unsupported findings explicitly. Reconcile any existing YAML against the source. For each application and service, identify foreground versus detached behavior and real start, status and stop operations. Distinguish a user-facing app from its backend API or worker. Summarize whether GitHub Spec Kit is present. Ask only decisions that cannot be inferred safely. Wait for my reply before writing files in the project, even if no question is needed.',
    '',
    'Phase 2 — after my reply, create or improve .projectroom/project.yaml from verified repository evidence. Reuse the existing specs and docs; reconcile every verified capability with its Project Room view and explain any intentional omission. Register verified MCP servers in workspace.mcpServers even when no client config exists; preserve the real stdio command or HTTP endpoint and declare only environment variable names. If the server requires a separate read-only or revocable credential, do not substitute an owner or admin key; explain how the user provisions it locally. Leave uncertain or unsafe candidates unregistered and report them. Never fabricate progress, service state, tests, APIs or environment values. For a detached application or service, configure lifecycle: detached only when start, status and stop commands are all real and safe: status exits 0 when running, 1 when stopped, and 2 or higher on error. Otherwise leave it as a manual CLI task, explain the limitation, and never use a foreground observer as a substitute for stop control. Keep startup manual, secrets outside YAML, and do not run services or tests just to initialize.',
    '',
    'Validate the YAML and referenced paths. Finish with the exact project folder to open in Project Room; list configured, uncertain, and unsupported items; tell me what to check in Onboarding, including the first real application or service, test and data source. Do not commit automatically.',
    '',
    'Read-only clues (verify them in the repository):',
    `- Specifications: ${inventory.specs.join(', ') || 'none found'}`,
    `- Documentation: ${inventory.docs.join(', ') || 'none found'}`,
    `- Compose: ${inventory.compose.join(', ') || 'none found'}`,
    `- Data candidates: ${inventory.dataCandidates.join(', ') || 'none found'}`,
    `- Package scripts: ${inventory.scripts.join(', ') || 'none found'}`,
    `- Likely entry files: ${inventory.entryFiles.join(', ') || 'none found in top-level names; inspect source tree'}`,
    `- Instructions: ${inventory.instructions.join(', ') || 'none found'}`,
    `- MCP registrations found in known config files: ${inventory.mcpServers.map(item => item.name).join(', ') || 'none; source audit still required'}`,
    `- Static CLI entry-point candidates: ${inventory.cliTools.map(item => item.name).join(', ') || 'none; source audit still required'}`,
    `- Named OpenAPI files: ${inventory.apiSpecs.map(item => item.path).join(', ') || 'none; inspect HTTP route source'}`
  ].join('\n');
}

function reviewConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return { state: 'waiting', message: `Waiting for ${CONFIG_RELATIVE} in the project folder.` };
  try {
    const { config, raw } = loadConfig(file);
    const warnings = [];
    const checked = { paths: 0, commands: 0, environment: 0 };
    const check = (relative, label) => {
      if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) { warnings.push(label + ': invalid relative path'); return; }
      checked.paths++;
      if (!fs.existsSync(path.join(root, relative))) warnings.push(label + ': ' + relative + ' does not exist');
    };
    if (config.product?.vision) check(config.product.vision, 'Vision');
    if (config.product?.docsRoot) check(config.product.docsRoot, 'Documentation folder');
    for (const folder of config.views?.specifications?.roots || []) check(folder, 'Specification folder');
    for (const item of config.components) if (item.kind === 'specification') check(item.path, item.name);
    for (const item of config.product?.documentation || []) check(item.path, item.title);
    const inspectCommand = (command, cwd, label) => {
      checked.commands++;
      const folder = path.resolve(root, cwd || '.');
      if ((!folder.startsWith(root + path.sep) && folder !== root) || !fs.existsSync(folder)) { warnings.push(label + ': working directory does not exist inside the project'); return; }
      const actualFolder = fs.realpathSync(folder);
      if (actualFolder !== root && !actualFolder.startsWith(root + path.sep)) { warnings.push(label + ': working directory resolves outside the project'); return; }
      const executable = command?.[0];
      if (executable?.includes('/')) {
        if (!fs.existsSync(path.resolve(folder, executable))) warnings.push(label + ': executable ' + executable + ' does not exist');
      } else if (executable && !(process.env.PATH || '').split(path.delimiter).some(directory => directory && fs.existsSync(path.join(directory, executable)))) {
        warnings.push(label + ': executable ' + executable + ' is not on Project Room’s PATH');
      }
      const script = command?.[1];
      if (script && /^(?:\.\/|scripts\/|src\/)/.test(script) && !fs.existsSync(path.resolve(folder, script))) warnings.push(label + ': script ' + script + ' does not exist');
    };
    for (const item of config.components) {
      if (item.runtime) {
        inspectCommand(item.runtime.command, item.runtime.cwd, item.name + ' start');
        if (item.runtime.buildCommand) inspectCommand(item.runtime.buildCommand, item.runtime.cwd, item.name + ' build');
        if (item.runtime.lifecycle === 'detached') {
          inspectCommand(item.runtime.statusCommand, item.runtime.cwd, item.name + ' status');
          inspectCommand(item.runtime.stopCommand, item.runtime.cwd, item.name + ' stop');
        } else if (['application', 'service'].includes(item.kind) && /\b(?:docker\s+compose|docker-compose)\s+up\b/.test(item.runtime.command.join(' '))) {
          warnings.push(item.name + ': Compose startup needs detached lifecycle with real status and stop commands.');
        }
      }
      if (item.tests) inspectCommand(item.tests.command, item.tests.cwd, item.name + ' tests');
    }
    for (const server of config.workspace?.mcpServers || []) if (server.buildCommand) inspectCommand(server.buildCommand, server.cwd, server.name + ' build');
    if (inspectFolder(root).compose.length) for (const item of config.components.filter(entry => entry.kind === 'service' && entry.runtime?.lifecycle !== 'detached')) {
      warnings.push(item.name + ': Compose detected; confirm Stop really stops this service.');
    }
    let env = {};
    try {
      const envPath = path.join(root, '.env');
      if (fs.existsSync(envPath)) {
        if (!fs.lstatSync(envPath).isFile()) throw new Error('The project .env is not a regular file.');
        env = parseEnv(fs.readFileSync(envPath, 'utf8'));
      }
    } catch { warnings.push('Environment: the project .env could not be inspected.'); }
    for (const item of declarations(config)) {
      checked.environment++;
      if (!Object.hasOwn(env, item.name) && !Object.hasOwn(process.env, item.name)) warnings.push('Environment: ' + item.name + ' is not set on this computer.');
    }
    return { state: 'ready', root, raw, name: config.project.name, components: config.components.map(item => ({ name: item.name, kind: item.kind })), connections: config.connections.length, checked, warnings };
  } catch (error) { return { state: 'invalid', message: String(error.message).slice(0, 3000) }; }
}

module.exports = { inspectFolder, exportContract, agentPrompt, reviewConfig, createProgressSession, readOnboardingProgress };
