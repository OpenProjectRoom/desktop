const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../scripts/config.cjs');
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
      const next = path.join(relative, entry.name);
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
  try { config = loadConfig(path.join(canonical, 'productview.yaml')).config; } catch { /* An existing project can still be inspected without YAML. */ }
  if (has('package.json')) {
    try { scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(canonical, 'package.json'), 'utf8')).scripts || {}).slice(0, 30); }
    catch { /* The agent can inspect malformed package metadata. */ }
  }
  return {
    root: canonical,
    name: path.basename(canonical),
    hasConfig: has('productview.yaml'),
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
  const skill = path.join(directory, 'PRODUCT_VIEW_AGENT_GUIDE.md');
  const schema = path.join(directory, 'productview.schema.json');
  fs.copyFileSync(path.join(appPath, 'agent/project-room/SKILL.md'), skill);
  fs.copyFileSync(path.join(appPath, 'schemas/productview.schema.json'), schema);
  return { skill, schema };
}

function agentPrompt(inventory, contract) {
  return [
    'Set up this existing repository for Project Room. Work in ' + inventory.root + '.',
    '',
    'Read the repository\'s AGENTS.md or CLAUDE.md if present, its README, current specifications, documentation, package scripts, and runtime configuration. Read the Project Room agent guide at ' + contract.skill + ' and validate against ' + contract.schema + '.',
    '',
    'Create or improve productview.yaml at the repository root. Use the existing specification and documentation folders directly; do not duplicate their content or introduce a parallel Spec Kit structure. If Spec Kit feature folders exist, map verified feature requirements to real components and test suites with views.specifications.links; do not infer coverage or completion from file names alone. Represent only real components and commands supported by the repository. Set workspace.additionalViews only for useful optional pages supported by actual content: vision, roadmap, north-star, commands. The four pages stay hidden by default. If you choose one as workspace.startPage, include it in additionalViews too. Inspect project MCP configurations (.mcp.json, .cursor/mcp.json, .vscode/mcp.json, mcp.json). Register verified MCP endpoints in workspace.mcpServers only when no existing project config already describes them; use environment variable names and authEnv for credentials. Never connect to or invoke MCP tools during setup. For HTTP APIs, inspect code and OpenAPI 3.x files. Register only verified base URLs and optional local spec paths in workspace.apiSources; use authEnv as a variable name for Bearer authentication, never a token. Do not send API requests during setup. Detect real data sources from code, migrations, compose files and existing files: declare PostgreSQL/MySQL/MariaDB databases with data.engine and a data.connectionEnv name, SQLite with data.path, and local file stores with data.path. Do not invent a running database from a dependency name alone. Declare required environment variable names, and optional descriptions, in workspace.environment, component environment lists or data.connectionEnv. Never put values in YAML or ask the user to paste them into the agent chat; tell them to set values in Project Room\'s local Environment page. Distinguish foreground processes from detached Docker Compose stacks: a command that starts and exits does not prove the service is stopped, and Project Room\'s current service runner cannot monitor Compose state correctly. Do not invent metrics, test results, integration connections, roadmap completion, CLI parameters, or a working chat model. Keep credentials out of the YAML. Register commands as manual and do not start services or tests for this setup task.',
    '',
    'Inspect likely sources of truth, draft a small useful map, and validate the YAML against the schema and the files it references. For CLI programs, inspect package bin metadata and real executable entry files; add commandTool components only for verified tools. CLI Explorer can discover candidates without running them, read help after a user click, and link a candidate as a help-only commandTool for further documentation. Do not assume every package script is a user-facing CLI. Install the exported Project Room guide as a repository-local skill for the agent in use (Codex: .agents/skills/project-room/SKILL.md; Claude Code: .claude/skills/project-room/SKILL.md). If both agents are used, install it in both locations. Preserve any existing AGENTS.md or CLAUDE.md; add only a short Project Room pointer there if useful. Report any unsupported lifecycle behavior, missing prerequisites, and uncertain findings. Show me the final component list and validation result. Do not commit automatically.',
    '',
    'Read-only initial hints from Project Room:',
    '- Specification folders: ' + (inventory.specs.join(', ') || 'none found'),
    '- Documentation folders: ' + (inventory.docs.join(', ') || 'none found'),
    '- Compose files: ' + (inventory.compose.join(', ') || 'none found'),
    '- Data source candidates: ' + (inventory.dataCandidates.join(', ') || 'none found'),
    '- Package scripts: ' + (inventory.scripts.join(', ') || 'none found'),
    '- Repository guidance: ' + (inventory.instructions.join(', ') || 'none found'),
    '- MCP servers: ' + (inventory.mcpServers.map(item => `${item.name} (${item.source})`).join(', ') || 'none found'),
    '- CLI entry points: ' + (inventory.cliTools.map(item => `${item.name} (${item.path})`).join(', ') || 'none found'),
    '- OpenAPI files: ' + (inventory.apiSpecs.map(item => `${item.name} (${item.path}, ${item.endpoints} endpoints)`).join(', ') || 'none found'),
    'These hints are incomplete; inspect the repository before deciding.'
  ].join('\n');
}

function reviewConfig(root) {
  const file = path.join(root, 'productview.yaml');
  if (!fs.existsSync(file)) return { state: 'waiting', message: 'Waiting for productview.yaml in the project folder.' };
  try {
    const { config, raw } = loadConfig(file);
    const warnings = [];
    const check = (relative, label) => {
      if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) { warnings.push(label + ': invalid relative path'); return; }
      if (!fs.existsSync(path.join(root, relative))) warnings.push(label + ': ' + relative + ' does not exist');
    };
    if (config.product?.vision) check(config.product.vision, 'Vision');
    if (config.product?.docsRoot) check(config.product.docsRoot, 'Documentation folder');
    for (const folder of config.views?.specifications?.roots || []) check(folder, 'Specification folder');
    for (const item of config.components) if (item.kind === 'specification') check(item.path, item.name);
    for (const item of config.product?.documentation || []) check(item.path, item.title);
    for (const item of config.components) {
      if (item.kind !== 'service') continue;
      const command = item.runtime?.command || [];
      const joined = command.join(' ');
      if (/\b(?:docker\s+compose|docker-compose)\s+up\b/.test(joined) && /(?:\s-d\b|--detach\b)/.test(joined) || /^\.\/blackbox up\b/.test(joined)) {
        warnings.push(item.name + ': this may start a detached stack; Project Room currently tracks only the command process.');
      }
    }
    return { state: 'ready', root, raw, name: config.project.name, components: config.components.map(item => ({ name: item.name, kind: item.kind })), connections: config.connections.length, warnings };
  } catch (error) { return { state: 'invalid', message: String(error.message).slice(0, 3000) }; }
}

module.exports = { inspectFolder, exportContract, agentPrompt, reviewConfig };
