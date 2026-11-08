const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('productView', {
  platform: process.platform,
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  loadProject: () => ipcRenderer.invoke('project:load'),
  leaveIntroDemo: () => ipcRenderer.invoke('project:leave-demo'),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  openExampleProject: () => ipcRenderer.invoke('project:example'),
  prepareOnboarding: () => ipcRenderer.invoke('onboarding:prepare'),
  currentOnboarding: () => ipcRenderer.invoke('onboarding:current'),
  reviewCurrentOnboarding: () => ipcRenderer.invoke('onboarding:review-current'),
  reviewOnboarding: () => ipcRenderer.invoke('onboarding:review'),
  copyOnboardingPrompt: (prompt, scope = 'pending') => ipcRenderer.invoke('onboarding:copy', String(prompt), scope),
  openOnboardedProject: () => ipcRenderer.invoke('onboarding:open'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  openProject: root => ipcRenderer.invoke('project:open', String(root)),
  registerProject: root => ipcRenderer.invoke('project:register', String(root)),
  createProject: mode => ipcRenderer.invoke('project:create', String(mode)),
  discoverProjects: () => ipcRenderer.invoke('project:discover'),
  listHistory: () => ipcRenderer.invoke('history:list'),
  listProcessMetrics: () => ipcRenderer.invoke('metrics:list'),
  listSpecifications: () => ipcRenderer.invoke('specifications:list'),
  listDocumentation: () => ipcRenderer.invoke('documentation:list'),
  readProduct: () => ipcRenderer.invoke('product:read'),
  listEnvironment: () => ipcRenderer.invoke('environment:list'),
  listMcpServers: () => ipcRenderer.invoke('mcp:list'),
  listApiSources: () => ipcRenderer.invoke('api:list'),
  loadApiSpec: id => ipcRenderer.invoke('api:load-spec', String(id)),
  addApiSource: input => ipcRenderer.invoke('api:add', input),
  removeApiSource: id => ipcRenderer.invoke('api:remove', String(id)),
  sendApiRequest: input => ipcRenderer.invoke('api:request', input),
  apiAuthStatus: id => ipcRenderer.invoke('api:auth-status', String(id)),
  signInApi: id => ipcRenderer.invoke('api:sign-in', String(id)),
  signOutApi: id => ipcRenderer.invoke('api:sign-out', String(id)),
  addMcpServer: input => ipcRenderer.invoke('mcp:add', input),
  linkMcpServer: id => ipcRenderer.invoke('mcp:link', String(id)),
  removeMcpServer: id => ipcRenderer.invoke('mcp:remove', String(id)),
  discoverCliTools: () => ipcRenderer.invoke('cli:discover'),
  inspectCliHelp: (id, helpArg) => ipcRenderer.invoke('cli:help', String(id), String(helpArg)),
  tryCliTool: (id, args) => ipcRenderer.invoke('cli:try', String(id), args),
  linkCliTool: (id, helpArg) => ipcRenderer.invoke('cli:link', String(id), String(helpArg)),
  addCliTool: input => ipcRenderer.invoke('cli:add-manual', input),
  removeComponent: id => ipcRenderer.invoke('component:remove', String(id)),
  connectMcpServer: id => ipcRenderer.invoke('mcp:connect', String(id)),
  disconnectMcpServer: id => ipcRenderer.invoke('mcp:disconnect', String(id)),
  rebuildMcpServer: id => ipcRenderer.invoke('mcp:rebuild', String(id)),
  forgetMcpAuth: id => ipcRenderer.invoke('mcp:forget-auth', String(id)),
  describeMcpServer: id => ipcRenderer.invoke('mcp:describe', String(id)),
  callMcpTool: (id, name, args) => ipcRenderer.invoke('mcp:call-tool', String(id), String(name), args),
  readMcpResource: (id, uri) => ipcRenderer.invoke('mcp:read-resource', String(id), String(uri)),
  getMcpPrompt: (id, name, args) => ipcRenderer.invoke('mcp:get-prompt', String(id), String(name), args),
  revealEnvironment: name => ipcRenderer.invoke('environment:reveal', String(name)),
  copyEnvironmentValue: name => ipcRenderer.invoke('environment:copy', String(name)),
  saveEnvironment: (name, value) => ipcRenderer.invoke('environment:save', String(name), String(value)),
  deleteEnvironment: name => ipcRenderer.invoke('environment:delete', String(name)),
  setAdditionalView: (page, enabled) => ipcRenderer.invoke('workspace:additional-view', String(page), enabled),
  setupProduct: () => ipcRenderer.invoke('product:setup'),
  upsertRoadmap: item => ipcRenderer.invoke('product:roadmap', item),
  upsertNorthStar: metric => ipcRenderer.invoke('product:north-star', metric),
  recordNorthStar: measurement => ipcRenderer.invoke('product:north-star-record', measurement),
  createProductDocument: item => ipcRenderer.invoke('product:create-document', item),
  saveProductDocument: (relativePath, content) => ipcRenderer.invoke('product:save-document', String(relativePath), String(content)),
  upsertIssueSource: input => ipcRenderer.invoke('issues:upsert-source', input),
  listBacklog: () => ipcRenderer.invoke('backlog:list'),
  saveBacklogIssue: input => ipcRenderer.invoke('backlog:save', input),
  addMapComponent: input => ipcRenderer.invoke('map:add-component', input),
  moveMapComponent: (id, position) => ipcRenderer.invoke('map:move-component', id, position),
  recordChat: (prompt, reply) => ipcRenderer.invoke('chat:record', String(prompt), String(reply)),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  saveChatSettings: input => ipcRenderer.invoke('chat:settings', input),
  sendAgentChat: messages => ipcRenderer.invoke('chat:send', messages),
  cancelAgentChat: () => ipcRenderer.invoke('chat:cancel'),
  startDictation: () => ipcRenderer.invoke('dictation:start'),
  stopDictation: () => ipcRenderer.invoke('dictation:stop'),
  onDictation: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('dictation:event', listener);
    return () => ipcRenderer.removeListener('dictation:event', listener);
  },
  getAgentContract: () => ipcRenderer.invoke('agent:contract'),
  startComponent: id => ipcRenderer.invoke('component:start', String(id)),
  checkComponentStatus: id => ipcRenderer.invoke('component:status', String(id)),
  stopComponent: id => ipcRenderer.invoke('component:stop', String(id)),
  rebuildComponent: id => ipcRenderer.invoke('component:rebuild', String(id)),
  runTestSuite: id => ipcRenderer.invoke('tests:run', String(id)),
  listTestCases: id => ipcRenderer.invoke('tests:cases', String(id)),
  discoverTestCases: id => ipcRenderer.invoke('tests:discover', String(id)),
  runTestCase: (id, caseId) => ipcRenderer.invoke('tests:run-case', String(id), String(caseId)),
  readTestLog: (id, caseId) => ipcRenderer.invoke('tests:log', String(id), caseId == null ? null : String(caseId)),
  inspectDataSource: id => ipcRenderer.invoke('data:inspect', String(id)),
  previewDataEntry: (id, entryId) => ipcRenderer.invoke('data:preview', String(id), String(entryId)),
  startCommandTool: id => ipcRenderer.invoke('command:start', String(id)),
  stopCommandTool: id => ipcRenderer.invoke('command:stop', String(id)),
  readCommandHelp: id => ipcRenderer.invoke('command:help', String(id)),
  readCommandLog: id => ipcRenderer.invoke('command:log', String(id)),
  listFiles: () => ipcRenderer.invoke('files:list'),
  readFile: relativePath => ipcRenderer.invoke('files:read', String(relativePath)),
  openLocalUrl: url => ipcRenderer.invoke('preview:open', String(url)),
  onProjectFilesChanged: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('project:files-changed', listener);
    return () => ipcRenderer.removeListener('project:files-changed', listener);
  },
  onProcessEvent: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('process:event', listener);
    return () => ipcRenderer.removeListener('process:event', listener);
  }
});
