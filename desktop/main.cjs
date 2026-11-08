const { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell, session } = require('electron');
const { spawn } = require('node:child_process');
const { spawnProject, stopProcessTree } = require('./platform-process.cjs');
const { StringDecoder } = require('node:string_decoder');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { loadConfig, configPath, CONFIG_RELATIVE } = require('../scripts/config.cjs');
const { listSpecifications } = require('../scripts/specifications.cjs');
const { listDocumentation } = require('../scripts/documentation.cjs');
const { appendEvent, ensureHistory, logPath, readEvents } = require('./history.cjs');
const { addWorkspace, createWorkspace, discover, readRegistry } = require('./workspace.cjs');
const { startupDestination } = require('./startup.cjs');
const { readProduct, setupProduct, upsertRoadmap, upsertNorthStar, recordNorthStar, createDocument, saveDocument } = require('./product.cjs');
const { readCommandHelp, readCommandLog, runCliTrial } = require('./command-tools.cjs');
const { discoverCliTools, inspectCliHelp, linkCliTool } = require('./cli-explorer.cjs');
const { upsertIssueSource } = require('./issue-sources.cjs');
const { listIssues, saveIssue } = require('./backlog.cjs');
const { addMapComponent, moveMapComponent } = require('./map-components.cjs');
const { addCliTool, removeComponent } = require('./component-management.cjs');
const { setAdditionalView } = require('./additional-views.cjs');
const { declarations, listEnvironment, readEnvironment, saveEnvironment, deleteEnvironment, runtimeEnvironment, redactOutput } = require('./environment.cjs');
const { inspectFolder, exportContract, agentPrompt, reviewConfig, createProgressSession, readOnboardingProgress } = require('./onboarding.cjs');
const { McpExplorer, referencedNames } = require('./mcp-explorer.cjs');
const { addMcpServer, linkMcpServer, removeMcpServer } = require('./mcp-management.cjs');
const { listApiSources, loadApiSpec, addApiSource, removeApiSource, sendApiRequest } = require('./api-explorer.cjs');
const { SecureOAuthStore, ApiOAuth } = require('./oauth.cjs');
const { listCases, discoverCargo } = require('./test-explorer.cjs');
const dataViewer = require('./data-viewer.cjs');
const agentChat = require('./agent-chat.cjs');
const { readBuildIdentity, listBuildIdentities, sourceRevision } = require('./build-identity.cjs');
const { ProcessMetrics } = require('./process-metrics.cjs');
const detachedService = require('./detached-service.cjs');
const { checkPrerequisites } = require('./prerequisites.cjs');
const { autoUpdater } = require('electron-updater');
const { createUpdates } = require('./updates.cjs');
const { watchProjectFiles, describeConfigChange } = require('./config-watch.cjs');

let windowRef;
let selectedRoot = null;
let selectedConfig = null;
let selectedRaw = null;
const processes = new Map();
const detachedStates = new Map();
const detachedPending = new Set();
const startPending = new Set();
const detachedTimers = new Map();
const launchedBuilds = new Map();
const processMetrics = new ProcessMetrics({ onSample: notify });
const updates = createUpdates({ app, updater: autoUpdater, distribution: require('../package.json').projectRoomDistribution, send: value => {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('updates:state', value);
} });
let pendingOnboardingRoot = null;
const onboardingSessions = new Map();
let chatChild = null;
let dictationChild = null;
let mcpExplorer;
const discoveredTestCases = new Map();
let projectWatcher = null;

function sendProjectFiles(value) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('project:files-changed', value);
}
// Reports edits made outside Project Room. In-app edits update selectedRaw first, so they match the disk
// and are not reported back.
function watchSelectedProject(root) {
  projectWatcher?.close();
  projectWatcher = null;
  if (!root) return;
  const file = configPath(root);
  projectWatcher = watchProjectFiles(root, {
    configFile: file,
    onConfig: () => {
      if (selectedRoot !== root) return;
      const change = describeConfigChange(file, selectedRaw, loadConfig);
      if (change) sendProjectFiles({ root, kind: 'config', ...change });
    },
    onEnv: () => { if (selectedRoot === root) sendProjectFiles({ root, kind: 'env' }); },
  });
}
function notify(value) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('process:event', value);
}
function assertSender(event) {
  if (!windowRef || event.sender !== windowRef.webContents || event.senderFrame !== windowRef.webContents.mainFrame) throw new Error('Unauthorized call.');
}
function status() {
  return {
    ...Object.fromEntries((selectedConfig?.components || []).filter(item => ['application', 'service'].includes(item.kind) && item.runtime?.lifecycle === 'detached').map(item => [item.id, detachedStates.get(item.id) || 'unknown'])),
    ...Object.fromEntries([...processes].map(([id, child]) => [id, child.exitCode === null ? 'running' : 'stopped']))
  };
}
function readSelected(root) {
  const loaded = loadConfig(configPath(root));
  mcpExplorer?.disconnect().catch(() => {});
  if (selectedRoot && selectedRoot !== root) { stopAll(); if (chatChild) stopChild(chatChild); }
  selectedRoot = root;
  for (const timer of detachedTimers.values()) clearInterval(timer);
  detachedTimers.clear();
  detachedStates.clear();
  discoveredTestCases.clear();
  selectedConfig = loaded.config;
  selectedRaw = loaded.raw;
  ensureHistory(root);
  watchSelectedProject(root);
  appendEvent(root, 'workspace.opened', { project: selectedConfig.project.name });
  return { config: selectedConfig, raw: selectedRaw, root: selectedRoot, configFile: path.relative(root, loaded.file), status: status(), buildIdentities: listBuildIdentities(root, selectedConfig.components, launchedBuilds) };
}
function loadInitial() {
  const userData = app.getPath('userData');
  const destination = startupDestination(userData, readRegistry(userData), root => fs.existsSync(configPath(root)));
  if (destination.mode === 'project') return readSelected(destination.root);
  if (destination.mode === 'empty') return emptyProject();
  const demo = loadConfig(configPath(app.getAppPath()));
  watchSelectedProject(null);
  selectedRoot = null;
  selectedConfig = demo.config;
  selectedRaw = demo.raw;
  return { config: selectedConfig, raw: selectedRaw, root: null, configFile: CONFIG_RELATIVE, status: {}, buildIdentities: {}, introDemo: true };
}
function emptyProject() {
  watchSelectedProject(null);
  selectedRoot = null;
  selectedConfig = { project: { name: 'Project Room' }, workspace: { startPage: 'overview' }, components: [], connections: [] };
  selectedRaw = null;
  return { config: selectedConfig, root: null, status: {}, buildIdentities: {}, empty: true };
}
function component(id, kind) {
  if (!selectedRoot) throw new Error('Open a repository with .projectroom/project.yaml first.');
  const found = selectedConfig?.components?.find(item => item.id === id && item.kind === kind);
  if (!found) throw new Error(`Unknown ${kind} component: ${id}`);
  return found;
}
function runnableComponent(id) {
  if (!selectedRoot) throw new Error('Open a repository with .projectroom/project.yaml first.');
  const found = selectedConfig?.components?.find(item => item.id === id && ['application', 'service'].includes(item.kind));
  if (!found) throw new Error(`Unknown runnable component: ${id}`);
  return found;
}
function requireProject() { if (!selectedRoot) throw new Error('Open a local repository to edit product content.'); return selectedRoot; }
function dataSource(id) {
  if (!selectedRoot) throw new Error('Open a local repository first.');
  const item = selectedConfig.components.find(entry => entry.id === id && ['database', 'storage'].includes(entry.kind));
  if (!item) throw new Error('Unknown data source.');
  return item;
}
function dataValue(item) {
  const name = item.data?.connectionEnv;
  if (!name) return null;
  return readEnvironment(app.getPath('userData'), selectedRoot, selectedConfig, safeStorage, name) || process.env[name] || null;
}
function dataError(error, value) {
  let message = String(error?.message || error);
  if (value) {
    message = message.replaceAll(value, '[redacted]');
    try { const password = decodeURIComponent(new URL(value).password); if (password) message = message.replaceAll(password, '[redacted]'); } catch { /* Non-URL values have no password field. */ }
  }
  return new Error(message.slice(0, 700));
}
function environmentConfig() {
  const discovered = (mcpExplorer?.discover() || []).filter(item => !item.builtIn && item.source !== '.projectroom/project.yaml')
    .map(item => ({ id: item.id, name: item.name, environment: referencedNames(item) }));
  return { ...selectedConfig, workspace: { ...selectedConfig.workspace,
    mcpServers: [...(selectedConfig.workspace?.mcpServers || []), ...discovered] } };
}
function updatedProject(loaded) { selectedConfig = loaded.config; selectedRaw = loaded.raw; return { config: selectedConfig, raw: selectedRaw, root: selectedRoot, configFile: path.relative(selectedRoot, loaded.file), status: status(), buildIdentities: listBuildIdentities(selectedRoot, selectedConfig.components, launchedBuilds) }; }
function cwdWithinProject(relative = '.') {
  const root = fs.realpathSync(selectedRoot);
  const cwd = fs.realpathSync(path.resolve(root, relative));
  if (cwd !== root && !cwd.startsWith(root + path.sep)) throw new Error('Working directory is outside the project.');
  return cwd;
}
function fileWithinProject(relative) {
  if (!selectedRoot || typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid file path.');
  const root = fs.realpathSync(selectedRoot);
  const file = fs.realpathSync(path.resolve(root, relative));
  if (file !== root && !file.startsWith(root + path.sep)) throw new Error('File is outside the project.');
  return file;
}
function stopChild(child) {
  stopProcessTree(child);
}
function stopAll() { for (const child of processes.values()) stopChild(child); processes.clear(); for (const timer of detachedTimers.values()) clearInterval(timer); detachedTimers.clear(); launchedBuilds.clear(); processMetrics.reset(); }
function observeDetached(item, root, options) {
  const id = item.id;
  if (detachedTimers.has(id)) clearInterval(detachedTimers.get(id));
  if (detachedStates.get(id) !== 'running') { detachedTimers.delete(id); return; }
  const timer = setInterval(async () => {
    if (selectedRoot !== root || detachedPending.has(id)) return;
    detachedPending.add(id);
    try {
      const next = await detachedService.inspect(item.runtime, options);
      if (selectedRoot === root && detachedStates.get(id) !== next) {
        detachedStates.set(id, next);
        notify({ type: 'status', id, status: next });
      }
      if (next !== 'running') { clearInterval(timer); detachedTimers.delete(id); }
    } catch {
      if (selectedRoot === root) { detachedStates.set(id, 'unknown'); notify({ type: 'status', id, status: 'unknown' }); }
      clearInterval(timer); detachedTimers.delete(id);
    } finally { detachedPending.delete(id); }
  }, 5000);
  timer.unref();
  detachedTimers.set(id, timer);
}
async function detachedAction(item, operation) {
  const id = item.id;
  if (detachedPending.has(id)) throw new Error('This runtime command is already running.');
  detachedPending.add(id);
  const root = selectedRoot;
  try {
    const env = runtimeEnvironment(app.getPath('userData'), root, selectedConfig, safeStorage, item);
    const options = { cwd: cwdWithinProject(item.runtime.cwd), env };
    const result = operation === 'status'
      ? { status: await detachedService.inspect(item.runtime, options) }
      : await detachedService.change(item.runtime, operation, options);
    if (selectedRoot === root) {
      detachedStates.set(id, result.status);
      notify({ type: 'status', id, status: result.status });
      observeDetached(item, root, options);
      appendEvent(root, `${item.kind}.${operation}-confirmed`, { component: id, status: result.status });
    }
    return result;
  } catch (error) {
    if (selectedRoot === root) {
      detachedStates.set(id, 'unknown');
      notify({ type: 'status', id, status: 'unknown' });
      appendEvent(root, `${item.kind}.${operation}-error`, { component: id, message: error.message });
    }
    throw error;
  } finally { detachedPending.delete(id); }
}
async function startWithPrerequisites(item, launch) {
  const root = selectedRoot;
  const key = `${root}\0${item.id}`;
  if (startPending.has(key)) throw new Error('This service is already starting.');
  startPending.add(key);
  try {
    await checkPrerequisites(item.runtime.requires);
    if (selectedRoot !== root) throw new Error('The project changed before Start. Select the service again.');
    return await launch();
  } finally { startPending.delete(key); }
}
function prepareOnboarding(root) {
  const inventory = inspectFolder(root);
  pendingOnboardingRoot = inventory.root;
  const contract = exportContract(app.getAppPath(), app.getPath('userData'));
  const progress = onboardingSession(inventory.root);
  return { onboarding: true, inventory, prompt: agentPrompt(inventory, { ...contract, progress }), review: onboardingReview(inventory.root) };
}
function onboardingSession(root) {
  if (!onboardingSessions.has(root)) onboardingSessions.set(root, createProgressSession());
  return onboardingSessions.get(root);
}
function onboardingReview(root) {
  const session = onboardingSession(root);
  return { ...reviewConfig(root), progress: readOnboardingProgress(session), copiedAt: session.copiedAt };
}
function runCommand(id, command, relativeCwd, kind = 'service', waitForExit = false, keepStdin = false, details = {}) {
  if (!Array.isArray(command) || !command.length || command.some(arg => typeof arg !== 'string' || !arg)) throw new Error('Invalid command in .projectroom/project.yaml.');
  const cwd = cwdWithinProject(relativeCwd);
  const runComponent = selectedConfig.components.find(item => item.id === id);
  const buildIdentity = runComponent && ['application', 'service', 'commandTool'].includes(runComponent.kind) ? readBuildIdentity(selectedRoot, runComponent, sourceRevision(selectedRoot)) : null;
  const startedAt = new Date().toISOString();
  const localEnv = runtimeEnvironment(app.getPath('userData'), selectedRoot, selectedConfig, safeStorage, runComponent);
  const sensitiveValues = declarations(selectedConfig).map(item => localEnv[item.name]).filter(Boolean);
  return new Promise((resolve, reject) => {
    const root = selectedRoot;
    const outputFile = logPath(root, id, kind);
    const output = fs.createWriteStream(outputFile, { fd: fs.openSync(outputFile, 'ax', 0o600), autoClose: true });
    const relativeLog = path.relative(root, outputFile);
    appendEvent(root, `${kind}.started`, { component: id, ...details, command, log: relativeLog, startedAt, ...(buildIdentity ? { buildIdentity } : {}) });
    const child = spawnProject(command[0], command.slice(1), { cwd, env: localEnv, shell: false, detached: process.platform !== 'win32', stdio: [keepStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let settled = false;
    let failed = false;
    let logBytes = 0;
    const sendLog = text => {
      output.write(text);
      logBytes += Buffer.byteLength(text);
      if (logBytes < 1_000_000) notify({ type: 'log', id, text: text.slice(0, 5000) });
    };
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const stdout = redactOutput(sensitiveValues, sendLog);
    const stderr = redactOutput(sensitiveValues, sendLog);
    child.stdout.on('data', data => stdout.write(stdoutDecoder.write(data)));
    child.stderr.on('data', data => stderr.write(stderrDecoder.write(data)));
    const flushOutput = () => { stdout.write(stdoutDecoder.end()); stderr.write(stderrDecoder.end()); stdout.end(); stderr.end(); output.end(); };
    child.once('error', error => { failed = true; flushOutput(); appendEvent(root, `${kind}.error`, { component: id, ...details, message: error.message, log: relativeLog }); if (!settled) { settled = true; reject(new Error(`Command could not start: ${error.message}`)); } if (processes.get(id) === child) { processes.delete(id); if (['service', 'application'].includes(kind)) processMetrics.stop(id); notify({ type: 'status', id, status: 'stopped' }); } });
    child.once('spawn', () => {
      if (buildIdentity) launchedBuilds.set(id, { ...buildIdentity, startedAt });
      if (['service', 'application'].includes(kind)) processMetrics.start(id, child.pid);
      if (!waitForExit) { processes.set(id, child); notify({ type: 'status', id, status: 'running', buildIdentity: launchedBuilds.get(id) }); settled = true; resolve({ status: 'running', pid: child.pid, buildIdentity: launchedBuilds.get(id) }); }
      else { processes.set(id, child); notify({ type: 'status', id, status: 'running', buildIdentity: launchedBuilds.get(id) }); }
    });
    child.once('close', (code, signal) => {
      if (failed) return;
      flushOutput();
      appendEvent(root, `${kind}.finished`, { component: id, ...details, exitCode: code, signal, log: relativeLog });
      if (processes.get(id) === child) { processes.delete(id); if (kind === 'service') processMetrics.stop(id); notify({ type: 'status', id, status: 'stopped' }); }
      if (waitForExit && !settled) { settled = true; resolve({ status: 'stopped', exitCode: code ?? (signal ? 1 : 0), log: relativeLog }); }
    });
  });
}
function registerIpc() {
  ipcMain.handle('updates:status', event => { assertSender(event); return { enabled: updates.enabled, currentVersion: app.getVersion(), ...updates.snapshot() }; });
  ipcMain.handle('updates:check', async event => { assertSender(event); await updates.check(); return { enabled: updates.enabled, currentVersion: app.getVersion(), ...updates.snapshot() }; });
  ipcMain.handle('updates:install', event => { assertSender(event); return updates.install(); });
  ipcMain.handle('metrics:list', event => { assertSender(event); return processMetrics.snapshot(); });
  const oauthStore = (root, kind, id) => new SecureOAuthStore(app.getPath('userData'), safeStorage, root, kind, id);
  const apiOAuth = source => new ApiOAuth(oauthStore(requireProject(), 'api', `${source.id}\0${source.baseUrl}\0${source.auth?.authorizationUrl}\0${source.auth?.tokenUrl}\0${source.auth?.clientId}\0${(source.auth?.scopes || []).join(' ')}`), url => shell.openExternal(url));
  const apiSource = id => {
    const source = selectedConfig?.workspace?.apiSources?.find(item => item.id === String(id).replace(/^yaml:/, ''));
    if (!source) throw new Error('API source is no longer configured.');
    return source;
  };
  mcpExplorer = new McpExplorer({
    getRoot: () => selectedRoot, getConfig: () => selectedConfig,
    appPath: app.getAppPath(), executable: process.execPath, isElectron: true,
    getEnvironment: name => {
      if (!selectedRoot || !selectedConfig) return process.env[name] || null;
      const config = environmentConfig();
      if (!declarations(config).some(item => item.name === name)) return process.env[name] || null;
      return readEnvironment(app.getPath('userData'), selectedRoot, config, safeStorage, name) || process.env[name] || null;
    },
    record: (type, details) => { if (selectedRoot) appendEvent(selectedRoot, type, details); },
    oauthStore, openExternal: url => shell.openExternal(url)
  });
  ipcMain.handle('mcp:list', event => { assertSender(event); return mcpExplorer.list(); });
  ipcMain.handle('mcp:connect', (event, id) => { assertSender(event); return mcpExplorer.connect(String(id)); });
  ipcMain.handle('mcp:disconnect', (event, id) => { assertSender(event); return mcpExplorer.disconnect(String(id)); });
  ipcMain.handle('mcp:forget-auth', (event, id) => { assertSender(event); return mcpExplorer.forgetAuth(String(id)); });
  ipcMain.handle('mcp:describe', (event, id) => { assertSender(event); return mcpExplorer.describe(String(id)); });
  ipcMain.handle('mcp:add', (event, input) => { assertSender(event); const added = addMcpServer(requireProject(), input); const updated = updatedProject(added); appendEvent(selectedRoot, 'mcp.registered', { server: added.id, transport: input.transport }); return { ...updated, addedId: `yaml:${added.id}` }; });
  ipcMain.handle('mcp:link', (event, sourceId) => { assertSender(event); const added = linkMcpServer(requireProject(), String(sourceId)); const updated = updatedProject(added); appendEvent(selectedRoot, 'mcp.linked', { server: added.id, source: String(sourceId) }); return { ...updated, addedId: `yaml:${added.id}` }; });
  ipcMain.handle('mcp:remove', async (event, id) => { assertSender(event); const key = String(id); if (!key.startsWith('yaml:')) throw new Error('Only YAML entries can be removed here.'); await mcpExplorer.disconnect(key); const removed = removeMcpServer(requireProject(), key.slice(5)); const updated = updatedProject(removed); appendEvent(selectedRoot, 'mcp.removed', { server: key }); return { ...updated, removedId: key }; });
  ipcMain.handle('mcp:call-tool', (event, id, name, args) => { assertSender(event); return mcpExplorer.callTool(String(id), String(name), args); });
  ipcMain.handle('mcp:read-resource', (event, id, uri) => { assertSender(event); return mcpExplorer.readResource(String(id), String(uri)); });
  ipcMain.handle('mcp:get-prompt', (event, id, name, args) => { assertSender(event); return mcpExplorer.getPrompt(String(id), String(name), args); });
  ipcMain.handle('api:list', event => { assertSender(event); return listApiSources(selectedRoot, selectedConfig); });
  ipcMain.handle('api:load-spec', (event, id) => { assertSender(event); requireProject(); return loadApiSpec(selectedConfig, String(id)); });
  ipcMain.handle('api:add', (event, input) => { assertSender(event); const added = addApiSource(requireProject(), input); const updated = updatedProject(added); appendEvent(selectedRoot, 'api.registered', { api: added.id, spec: input.spec || null }); return { ...updated, addedId: `yaml:${added.id}` }; });
  ipcMain.handle('api:remove', (event, id) => { assertSender(event); const key = String(id); if (!key.startsWith('yaml:')) throw new Error('Only YAML API sources can be removed.'); const removed = removeApiSource(requireProject(), key.slice(5)); const updated = updatedProject(removed); appendEvent(selectedRoot, 'api.removed', { api: key.slice(5) }); return updated; });
  ipcMain.handle('api:auth-status', (event, id) => { assertSender(event); const source = apiSource(String(id)); return source.auth?.type === 'oauth2' ? apiOAuth(source).status() : { signedIn: false }; });
  ipcMain.handle('api:sign-in', async (event, id) => { assertSender(event); const source = apiSource(String(id)); if (source.auth?.type !== 'oauth2') throw new Error('This API is not configured for OAuth.'); const status = await apiOAuth(source).signIn(source.auth); appendEvent(selectedRoot, 'api.signed-in', { api: source.id }); return status; });
  ipcMain.handle('api:sign-out', (event, id) => { assertSender(event); const source = apiSource(String(id)); apiOAuth(source).signOut(); appendEvent(selectedRoot, 'api.signed-out', { api: source.id }); return { signedIn: false }; });
  ipcMain.handle('api:request', async (event, input) => {
    assertSender(event); requireProject();
    try {
      const result = await sendApiRequest(selectedRoot, selectedConfig, input, name => readEnvironment(app.getPath('userData'), selectedRoot, selectedConfig, safeStorage, name) || process.env[name] || null, fetch, source => apiOAuth(source).token(source.auth));
      appendEvent(selectedRoot, 'api.requested', { api: input.sourceId, method: result.method, path: result.path, status: result.status, durationMs: result.durationMs });
      return result;
    } catch (error) { throw new Error(String(error?.message || error).slice(0, 500)); }
  });
  ipcMain.handle('project:load', event => { assertSender(event); return loadInitial(); });
  ipcMain.handle('project:leave-demo', event => { assertSender(event); return emptyProject(); });
  ipcMain.handle('project:example', event => {
    assertSender(event);
    const source = path.join(app.getAppPath(), 'examples', 'hello-workspace');
    const root = path.join(app.getPath('documents'), 'Project Room Examples', 'hello-workspace');
    if (!fs.existsSync(configPath(source))) throw new Error('The example workspace is missing from this build.');
    if (!fs.existsSync(root)) {
      fs.mkdirSync(path.dirname(root), { recursive: true });
      fs.cpSync(source, root, { recursive: true, force: false });
    }
    if (!fs.existsSync(configPath(root))) throw new Error('The example destination already exists without .projectroom/project.yaml. Move it before trying again.');
    const registered = addWorkspace(app.getPath('userData'), root);
    return readSelected(registered);
  });
  ipcMain.handle('project:choose', async event => {
    assertSender(event);
    const choice = await dialog.showOpenDialog(windowRef, { title: 'Open a project folder', properties: ['openDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const root = choice.filePaths[0];
    try {
      const registered = addWorkspace(app.getPath('userData'), root);
      return readSelected(registered);
    } catch {
      return prepareOnboarding(root);
    }
  });
  ipcMain.handle('onboarding:prepare', async event => {
    assertSender(event);
    const choice = await dialog.showOpenDialog(windowRef, { title: 'Choose a project folder to set up with an agent', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    return prepareOnboarding(choice.filePaths[0]);
  });
  ipcMain.handle('onboarding:current', event => {
    assertSender(event);
    if (!selectedRoot) throw new Error('Open a local project first.');
    const inventory = inspectFolder(selectedRoot);
    const contract = exportContract(app.getAppPath(), app.getPath('userData'));
    const progress = onboardingSession(selectedRoot);
    return { inventory, prompt: agentPrompt(inventory, { ...contract, progress }), review: onboardingReview(selectedRoot) };
  });
  ipcMain.handle('onboarding:review-current', event => {
    assertSender(event);
    if (!selectedRoot) throw new Error('Open a local project first.');
    return onboardingReview(selectedRoot);
  });
  ipcMain.handle('onboarding:review', event => {
    assertSender(event);
    if (!pendingOnboardingRoot) throw new Error('Choose a project folder first.');
    return onboardingReview(pendingOnboardingRoot);
  });
  ipcMain.handle('onboarding:copy', (event, prompt, scope) => {
    assertSender(event);
    const root = scope === 'current' ? selectedRoot : pendingOnboardingRoot;
    if (!root || typeof prompt !== 'string') throw new Error('Choose a project folder first.');
    clipboard.writeText(prompt);
    onboardingSession(root).copiedAt = new Date().toISOString();
    return true;
  });
  ipcMain.handle('onboarding:open', event => {
    assertSender(event);
    if (!pendingOnboardingRoot) throw new Error('Choose a project folder first.');
    const review = reviewConfig(pendingOnboardingRoot);
    if (review.state !== 'ready') throw new Error(review.message || 'The configuration is not ready.');
    const root = addWorkspace(app.getPath('userData'), pendingOnboardingRoot);
    pendingOnboardingRoot = null;
    return readSelected(root);
  });
  ipcMain.handle('project:list', event => { assertSender(event); return readRegistry(app.getPath('userData')).map(root => { try { return { root, name: loadConfig(configPath(root)).config.project.name }; } catch { return { root, name: path.basename(root) }; } }); });
  ipcMain.handle('project:open', (event, root) => { assertSender(event); if (!readRegistry(app.getPath('userData')).includes(root)) throw new Error('Unknown project.'); addWorkspace(app.getPath('userData'), root); return readSelected(root); });
  ipcMain.handle('project:create', async (event, mode) => {
    assertSender(event);
    const choice = await dialog.showOpenDialog(windowRef, { title: 'Choose a project folder', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const root = choice.filePaths[0];
    createWorkspace(root, mode === 'blank' ? 'blank' : 'auto');
    addWorkspace(app.getPath('userData'), root);
    appendEvent(root, 'workspace.created', { mode: mode === 'blank' ? 'blank' : 'auto' });
    return readSelected(root);
  });
  ipcMain.handle('project:discover', async event => {
    assertSender(event);
    const choice = await dialog.showOpenDialog(windowRef, { title: 'Find Project Room projects', properties: ['openDirectory'] });
    if (choice.canceled || !choice.filePaths[0]) return [];
    return discover(choice.filePaths[0]).map(root => ({ root, name: loadConfig(configPath(root)).config.project.name }));
  });
  ipcMain.handle('project:register', (event, root) => { assertSender(event); const registered = addWorkspace(app.getPath('userData'), root); return readSelected(registered); });
  ipcMain.handle('history:list', event => { assertSender(event); return readEvents(selectedRoot); });
  ipcMain.handle('specifications:list', event => { assertSender(event); return selectedRoot ? listSpecifications(selectedRoot, loadConfig(configPath(selectedRoot)).config, { status: status(), statusKnown: true, events: readEvents(selectedRoot, 1000) }) : { roots: [], entries: [], specKit: { detected: false, features: [] } }; });
  ipcMain.handle('documentation:list', event => { assertSender(event); return selectedRoot ? listDocumentation(selectedRoot, loadConfig(configPath(selectedRoot)).config) : { root: null, missing: true, entries: [] }; });
  ipcMain.handle('product:read', event => { assertSender(event); return readProduct(requireProject()); });
  ipcMain.handle('environment:list', event => { assertSender(event); return listEnvironment(app.getPath('userData'), requireProject(), environmentConfig(), safeStorage); });
  ipcMain.handle('environment:reveal', (event, name) => { assertSender(event); return readEnvironment(app.getPath('userData'), requireProject(), environmentConfig(), safeStorage, name); });
  ipcMain.handle('environment:copy', (event, name) => {
    assertSender(event);
    const value = readEnvironment(app.getPath('userData'), requireProject(), environmentConfig(), safeStorage, name);
    if (value === null) throw new Error('This variable has no value in the project .env file.');
    clipboard.writeText(value);
    return true;
  });
  ipcMain.handle('environment:save', (event, name, value) => { assertSender(event); return saveEnvironment(app.getPath('userData'), requireProject(), environmentConfig(), safeStorage, name, value); });
  ipcMain.handle('environment:delete', (event, name) => { assertSender(event); return deleteEnvironment(app.getPath('userData'), requireProject(), environmentConfig(), safeStorage, name); });
  ipcMain.handle('workspace:additional-view', (event, page, enabled) => { assertSender(event); const result = updatedProject(setAdditionalView(requireProject(), page, enabled)); appendEvent(selectedRoot, 'workspace.view-updated', { page, enabled }); return result; });
  ipcMain.handle('product:setup', event => { assertSender(event); const result = updatedProject(setupProduct(requireProject())); appendEvent(selectedRoot, 'product.setup', { path: result.configFile }); return result; });
  ipcMain.handle('product:roadmap', (event, item) => { assertSender(event); const result = updatedProject(upsertRoadmap(requireProject(), item)); appendEvent(selectedRoot, 'roadmap.updated', { item: item?.id || item?.title, status: item?.status }); return result; });
  ipcMain.handle('product:north-star', (event, metric) => { assertSender(event); const result = updatedProject(upsertNorthStar(requireProject(), metric)); appendEvent(selectedRoot, 'north-star.defined', { name: metric?.name, cadence: metric?.cadence }); return result; });
  ipcMain.handle('product:north-star-record', (event, measurement) => { assertSender(event); const result = updatedProject(recordNorthStar(requireProject(), measurement)); appendEvent(selectedRoot, 'north-star.recorded', { date: measurement?.date, value: measurement?.value }); return result; });
  ipcMain.handle('product:create-document', (event, item) => { assertSender(event); const created = createDocument(requireProject(), item); updatedProject(created); appendEvent(selectedRoot, 'documentation.created', { path: created.path }); return { project: updatedProject(created), path: created.path, content: created.content }; });
  ipcMain.handle('product:save-document', (event, relative, content) => { assertSender(event); const saved = saveDocument(requireProject(), relative, content); appendEvent(selectedRoot, 'documentation.updated', { path: saved.path }); return saved; });
  ipcMain.handle('issues:upsert-source', (event, input) => { assertSender(event); const updated = updatedProject(upsertIssueSource(requireProject(), input)); appendEvent(selectedRoot, 'issues.source-updated', { source: input?.id || input?.name, provider: input?.provider }); return updated; });
  ipcMain.handle('backlog:list', event => { assertSender(event); return listIssues(requireProject()); });
  ipcMain.handle('backlog:save', (event, input) => { assertSender(event); const issue = saveIssue(requireProject(), input); appendEvent(selectedRoot, input?.id ? 'backlog.updated' : 'backlog.created', { issue: issue.id, path: issue.path, status: issue.status }); return issue; });
  ipcMain.handle('map:add-component', (event, input) => { assertSender(event); const added = addMapComponent(requireProject(), input); const updated = updatedProject(added); appendEvent(selectedRoot, 'component.created', { component: added.id, kind: input.kind }); return { ...updated, addedId: added.id }; });
  ipcMain.handle('map:move-component', (event, id, position) => { assertSender(event); const moved = moveMapComponent(requireProject(), id, position); const updated = updatedProject(moved); appendEvent(selectedRoot, 'component.moved', { component: id, position: moved.config.components.find(item => item.id === id)?.position }); return updated; });
  ipcMain.handle('cli:add-manual', (event, input) => { assertSender(event); const added = addCliTool(requireProject(), input); const updated = updatedProject(added); appendEvent(selectedRoot, 'component.created', { component: added.id, kind: 'commandTool' }); return { ...updated, addedId: added.id }; });
  ipcMain.handle('component:remove', (event, id) => { assertSender(event); const key = String(id); if (processes.has(key)) throw new Error('Stop this tool before removing it.'); const removed = removeComponent(requireProject(), key); const updated = updatedProject(removed); appendEvent(selectedRoot, 'component.removed', { component: key, kind: removed.removed.kind }); return { ...updated, removedId: key }; });
  ipcMain.handle('chat:record', (event, prompt, reply) => { assertSender(event); return appendEvent(selectedRoot, 'chat.prompt', { prompt: String(prompt), reply: String(reply), provider: 'local-demo' }); });
  ipcMain.handle('chat:status', event => { assertSender(event); return agentChat.status(app.getPath('userData')); });
  ipcMain.handle('chat:settings', (event, input) => { assertSender(event); agentChat.saveSettings(app.getPath('userData'), input); return agentChat.status(app.getPath('userData')); });
  ipcMain.handle('chat:send', async (event, messages) => {
    assertSender(event);
    if (chatChild?.exitCode === null) throw new Error('A chat request is already running.');
    const root = requireProject();
    let result;
    try { result = await agentChat.runChat({ userData: app.getPath('userData'), root, messages, mcpCommand: process.execPath, mcpScript: path.join(app.getAppPath(), 'mcp/server.cjs'), onChild: child => { chatChild = child; } }); }
    finally { chatChild = null; }
    appendEvent(root, 'chat.prompt', { prompt: String(messages.at(-1).text).slice(0, 12000), reply: result.text.slice(0, 30000), provider: result.provider, mode: result.mode });
    return result;
  });
  ipcMain.handle('chat:cancel', event => { assertSender(event); if (chatChild?.exitCode === null) stopChild(chatChild); chatChild = null; return true; });
  ipcMain.handle('dictation:start', event => {
    assertSender(event);
    if (process.platform !== 'darwin') throw new Error('On-device dictation is available on macOS only.');
    if (dictationChild?.exitCode === null) return true;
    const binary = app.isPackaged ? path.join(process.resourcesPath, 'dictation/product-view-dictation') : path.join(__dirname, 'bin/product-view-dictation');
    if (!fs.existsSync(binary)) throw new Error('The local dictation helper is unavailable.');
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    dictationChild = child;
    readline.createInterface({ input: child.stdout }).on('line', line => {
      try { const value = JSON.parse(line); if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('dictation:event', value); } catch { /* Ignore non-JSON helper output. */ }
    });
    child.on('error', error => { if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('dictation:event', { type: 'error', message: error.message }); });
    child.on('close', () => { if (dictationChild === child) dictationChild = null; if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('dictation:event', { type: 'stopped' }); });
    return true;
  });
  ipcMain.handle('dictation:stop', event => { assertSender(event); if (dictationChild?.exitCode === null) dictationChild.stdin.write('stop\n'); return true; });
  ipcMain.handle('agent:contract', event => {
    assertSender(event);
    const skill = fs.readFileSync(path.join(app.getAppPath(), 'agent/project-room/SKILL.md'), 'utf8');
    const executable = process.execPath;
    const script = path.join(app.getAppPath(), 'mcp/server.cjs');
    return { skill, schema: fs.readFileSync(path.join(app.getAppPath(), 'schemas/projectroom.schema.json'), 'utf8'), example: selectedRaw, mcp: { command: executable, args: [script, selectedRoot || '<project-folder>'], env: { ELECTRON_RUN_AS_NODE: '1' } } };
  });
  ipcMain.handle('component:status', (event, id) => {
    assertSender(event);
    const item = runnableComponent(id);
    if (item.runtime.lifecycle !== 'detached') return { status: status()[id] || 'stopped' };
    return detachedAction(item, 'status');
  });
  ipcMain.handle('component:start', async (event, id) => {
    assertSender(event);
    const item = runnableComponent(id);
    if (item.runtime.lifecycle !== 'detached' && processes.has(id)) return { status: 'running', pid: processes.get(id).pid };
    return startWithPrerequisites(item, () => item.runtime.lifecycle === 'detached'
      ? detachedAction(item, 'start')
      : runCommand(id, item.runtime.command, item.runtime.cwd, item.kind));
  });
  ipcMain.handle('component:stop', (event, id) => {
    assertSender(event);
    const item = runnableComponent(id);
    if (item.runtime.lifecycle === 'detached') return detachedAction(item, 'stop');
    const child = processes.get(id);
    if (!child) return { status: 'stopped' };
    stopChild(child);
    appendEvent(selectedRoot, `${item.kind}.stop-requested`, { component: id });
    processes.delete(id);
    notify({ type: 'status', id, status: 'stopped' });
    return { status: 'stopped' };
  });
  ipcMain.handle('tests:run', (event, id) => {
    assertSender(event);
    const item = component(id, 'testSuite');
    if (processes.has(id)) throw new Error('This test suite is already running.');
    return runCommand(id, item.tests.command, item.tests.cwd, 'test', true);
  });
  ipcMain.handle('tests:cases', (event, id) => {
    assertSender(event);
    const item = component(id, 'testSuite');
    return { ...listCases(selectedRoot, item, discoveredTestCases.get(id) || []), discovered: discoveredTestCases.has(id) };
  });
  ipcMain.handle('tests:discover', async (event, id) => {
    assertSender(event);
    const item = component(id, 'testSuite');
    if (processes.has(id)) throw new Error('Wait for the current test run to finish.');
    const root = selectedRoot;
    const env = runtimeEnvironment(app.getPath('userData'), root, selectedConfig, safeStorage, item);
    let cases;
    try { cases = await discoverCargo(root, item, env); }
    catch (error) {
      const secrets = declarations(selectedConfig).map(entry => env[entry.name]).filter(Boolean);
      let message = error.message;
      for (const secret of secrets) message = message.replaceAll(secret, '[redacted]');
      throw new Error(message);
    }
    if (root !== selectedRoot) throw new Error('Workspace changed during discovery.');
    discoveredTestCases.set(id, cases);
    appendEvent(root, 'test.discovered', { component: id, count: cases.length });
    return { ...listCases(root, item, cases), discovered: true };
  });
  ipcMain.handle('tests:run-case', async (event, id, caseId) => {
    assertSender(event);
    const item = component(id, 'testSuite');
    if (processes.has(id)) throw new Error('This test suite is already running.');
    const testCase = listCases(selectedRoot, item, discoveredTestCases.get(id) || []).cases.find(entry => entry.id === caseId);
    if (!testCase) throw new Error('Select a listed test case first.');
    const root = selectedRoot;
    appendEvent(root, 'test.case.started', { component: id, caseId, name: testCase.name });
    let result;
    try {
      for (const command of [...testCase.setup, testCase.command]) {
        result = await runCommand(id, command, item.tests.cwd, 'test-step', true, false, { caseId });
        if (result.exitCode !== 0) break;
      }
      appendEvent(root, 'test.case.finished', { component: id, caseId, name: testCase.name, exitCode: result.exitCode, log: result.log });
      return result;
    } catch (error) {
      appendEvent(root, 'test.case.error', { component: id, caseId, name: testCase.name, message: error.message });
      throw error;
    }
  });
  ipcMain.handle('tests:log', (event, id, caseId) => {
    assertSender(event);
    component(id, 'testSuite');
    const latest = readEvents(selectedRoot, 500).find(entry => entry.component === id && (caseId ? entry.type === 'test.case.finished' && entry.caseId === caseId : entry.type === 'test.finished') && entry.log);
    if (!latest) return null;
    const file = fs.realpathSync(path.resolve(selectedRoot, latest.log));
    const logDir = fs.realpathSync(path.resolve(selectedRoot, '.productview', 'logs'));
    if (!file.startsWith(logDir + path.sep)) throw new Error('Invalid test log path.');
    const stat = fs.statSync(file);
    const fd = fs.openSync(file, 'r');
    try {
      const length = Math.min(stat.size, 200000);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, stat.size - length);
      return { text: buffer.toString('utf8'), truncated: stat.size > length, at: latest.at, exitCode: latest.exitCode };
    } finally { fs.closeSync(fd); }
  });
  ipcMain.handle('data:inspect', async (event, id) => {
    assertSender(event);
    const item = dataSource(id);
    const value = dataValue(item);
    try { return await dataViewer.inspect(selectedRoot, item, value); }
    catch (error) { throw dataError(error, value); }
  });
  ipcMain.handle('data:preview', async (event, id, entryId) => {
    assertSender(event);
    const item = dataSource(id);
    const value = dataValue(item);
    try { return await dataViewer.preview(selectedRoot, item, value, String(entryId)); }
    catch (error) { throw dataError(error, value); }
  });
  ipcMain.handle('command:start', async (event, id) => {
    assertSender(event);
    const item = component(id, 'commandTool');
    if (processes.has(id)) return { status: 'running', pid: processes.get(id).pid };
    return startWithPrerequisites(item, () => runCommand(id, item.runtime.command, item.runtime.cwd, 'tool', item.cli.mode === 'task', item.cli.protocol === 'stdio'));
  });
  ipcMain.handle('command:stop', (event, id) => {
    assertSender(event);
    const item = component(id, 'commandTool');
    if (item.cli.mode !== 'server') throw new Error('Only command servers can be stopped.');
    const child = processes.get(id);
    if (!child) return { status: 'stopped' };
    stopChild(child);
    appendEvent(selectedRoot, 'tool.stop-requested', { component: id });
    processes.delete(id);
    notify({ type: 'status', id, status: 'stopped' });
    return { status: 'stopped' };
  });
  ipcMain.handle('command:help', (event, id) => {
    assertSender(event);
    const item = component(id, 'commandTool');
    if (!item.cli.helpCommand) throw new Error('This tool has no help command configured.');
    const localEnv = runtimeEnvironment(app.getPath('userData'), selectedRoot, selectedConfig, safeStorage, item);
    const sensitiveValues = declarations(selectedConfig).map(entry => localEnv[entry.name]).filter(Boolean);
    return readCommandHelp(selectedRoot, id, item.cli.helpCommand, cwdWithinProject(item.runtime.cwd), localEnv, sensitiveValues);
  });
  ipcMain.handle('command:log', (event, id) => { assertSender(event); component(id, 'commandTool'); return readCommandLog(selectedRoot, id); });
  ipcMain.handle('cli:try', (event, id, args) => {
    assertSender(event);
    const key = String(id);
    const configured = selectedConfig.components.find(item => item.id === key && item.kind === 'commandTool');
    const candidate = configured ? null : discoverCliTools(requireProject(), selectedConfig).find(item => item.id === key);
    if (!configured && !candidate) throw new Error('Choose a configured or discovered CLI tool.');
    if (candidate && !candidate.available) throw new Error('Build this CLI before running it.');
    const command = configured ? configured.runtime.command : candidate.command;
    const cwd = cwdWithinProject(configured ? configured.runtime.cwd : candidate.cwd);
    const environment = runtimeEnvironment(app.getPath('userData'), selectedRoot, selectedConfig, safeStorage, configured);
    const sensitiveValues = declarations(selectedConfig).map(item => environment[item.name]).filter(Boolean);
    return runCliTrial(selectedRoot, key, command, args, cwd, environment, sensitiveValues);
  });
  ipcMain.handle('cli:discover', event => { assertSender(event); return discoverCliTools(requireProject(), selectedConfig); });
  ipcMain.handle('cli:help', (event, id, helpArg) => { assertSender(event); return inspectCliHelp(requireProject(), selectedConfig, String(id), String(helpArg)); });
  ipcMain.handle('cli:link', (event, id, helpArg) => {
    assertSender(event);
    const linked = linkCliTool(requireProject(), String(id), String(helpArg));
    const result = updatedProject(linked);
    appendEvent(selectedRoot, 'cli.linked', { component: linked.id, candidate: String(id) });
    return { ...result, linkedId: linked.id };
  });
  ipcMain.handle('files:list', event => {
    assertSender(event);
    if (!selectedRoot) return [];
    const result = [];
    const walk = (relative, depth) => {
      if (depth > 3 || result.length >= 400) return;
      const folder = fileWithinProject(relative);
      for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (['.git', 'node_modules', 'dist', 'build', 'outputs', '.next'].includes(entry.name) || entry.name.startsWith('.DS_Store') || /^\.env(?:\.|$)/.test(entry.name)) continue;
        const next = path.join(relative, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) { result.push({ path: next, type: 'directory', depth }); walk(next, depth + 1); }
        else if (entry.isFile()) result.push({ path: next, type: 'file', depth });
        if (result.length >= 400) break;
      }
    };
    walk('.', 0);
    return result;
  });
  ipcMain.handle('files:read', (event, relative) => {
    assertSender(event);
    if (typeof relative !== 'string' || /(^|[/\\])\.env(?:\.|$)/.test(relative)) throw new Error('Environment files are private. Use Environment for local values.');
    const file = fileWithinProject(relative);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error('File is too large or not a text file.');
    const data = fs.readFileSync(file);
    if (data.includes(0)) throw new Error('Binary files cannot be displayed here.');
    return data.toString('utf8');
  });
  ipcMain.handle('preview:open', async (event, url) => {
    assertSender(event);
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Only local HTTP previews can be opened.');
    await shell.openExternal(parsed.href);
    return true;
  });
}
function createWindow() {
  windowRef = new BrowserWindow({
    width: 1540, height: 980, minWidth: 950, minHeight: 650,
    title: 'Project Room', backgroundColor: '#f9f9fb',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : process.platform === 'win32' ? 'hidden' : 'default',
    ...(process.platform === 'win32' ? { titleBarOverlay: { height: 38 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowRef.webContents.on('will-navigate', event => event.preventDefault());
  windowRef.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  registerIpc(); createWindow(); updates.start();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { updates.stop(); projectWatcher?.close(); stopAll(); mcpExplorer?.disconnect().catch(() => {}); if (chatChild) stopChild(chatChild); if (dictationChild) stopChild(dictationChild); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
