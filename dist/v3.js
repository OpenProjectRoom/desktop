/* Project Room 0.4: English workspace, product hub, agent guide, persistent history. */
const pv = window.productView;
const pageNames = { dashboard: 'Overview', onboarding: 'Onboarding', product: 'Vision', vision: 'Vision', 'north-star': 'North Star', roadmap: 'Roadmap', docs: 'Documentation', overview: 'Project Map', runtime: 'Services', commands: 'CLI Explorer', tests: 'Test Explorer', data: 'Data Explorer', environment: 'Environment', files: 'Files', issues: 'Backlog', activity: 'Activity', agent: 'Agent Access' };
Object.assign(labels, pageNames);
document.querySelectorAll('#nav [data-page]').forEach(button => { button.querySelector('span').textContent = pageNames[button.dataset.page]; button.title = pageNames[button.dataset.page]; });
document.querySelector('#nav [data-page="overview"]').insertAdjacentHTML('beforebegin', `<button data-page="product" title="Product">${icon('doc')}<span>Product</span></button>`);
document.querySelector('#nav').insertAdjacentHTML('beforeend', `<button data-page="agent" title="Agent Guide">${icon('terminal')}<span>Agent Guide</span></button>`);
document.querySelector('.nav-label').textContent = 'PROJECT';
document.querySelectorAll('.nav-label')[1].textContent = 'MONITOR';
document.querySelector('.sidebar-bottom [id="settingsBtn"]')?.setAttribute('title', 'Configuration');
document.querySelector('.project-picker').title = 'Switch project';
document.querySelector('.chat-panel [data-panel-tab="chat"]').textContent = 'Product Chat';
document.querySelector('#chatInput').placeholder = 'Ask about this project…';
document.querySelector('#chatInput').setAttribute('aria-label', 'Message to Project Room');
document.querySelector('.chat-composer-footer span').textContent = 'Local configuration answer · demo';
document.querySelector('.panel-foot').innerHTML = `<span class="dot"></span> ${pv ? 'Local project context' : 'Demo chat · no model connected'}`;
document.querySelector('#chatToggle').title = 'Open chat and details';
document.querySelector('#panelClose').setAttribute('aria-label', 'Close panel');
document.querySelector('.sidebar-bottom').insertAdjacentHTML('beforeend', `<button data-v3="workspace" title="Projects">${icon('folder')}<span>Projects</span></button>`);

let pvHistory = [];
let pvContract = null;
let pvGuideTab = 'skill';
let pvWorkspaces = [];
let pvWorkspaceMenu = false;
let productContents = { vision: null, documents: {} };
let productSelectedDoc = null;
let productEditingPath = null;
let productDraft = '';
let commandDemoRunning = {};
let specEntries = [];
let specRoots = [];
let specKit = { detected: false, features: [], bugs: [], ideas: [] };
let specSelectedPath = null;
let specSelectedText = null;
let specLoading = true;
let specRaw = false;
let specSearch = '';
let specCollapsed = new Set();
let specLoadVersion = 0;
let docEntries = [];
let docSelectedPath = null;
let docSelectedText = null;
let docLoading = true;
let docRaw = false;
let docSearch = '';
let docCollapsed = new Set();
let docRootMissing = false;
let docLoadVersion = 0;
let localBacklog = { root: 'backlog', missing: true, issues: [] };
const demoBacklog = [
  { id: 'PV-035', title: 'Explore an offline mode', type: 'idea', status: 'inbox', priority: 'low', description: 'Assess whether local work should stay available without a network connection.', demo: true },
  { id: 'PV-038', title: 'Fix worker restart after a failed job', type: 'bug', status: 'in-progress', priority: 'high', description: 'The sample worker should recover cleanly and show its actual status.', demo: true },
  { id: 'PV-042', title: 'Improve onboarding for new users', type: 'feature', status: 'planned', priority: 'medium', description: 'Make the first project setup easier to follow.', demo: true }
];
let workFilter = 'all';
let selectedWork = null;
let selectedWorkArtifact = null;
let selectedWorkText = null;
const demoEvents = [
  { at: new Date().toISOString(), type: 'agent.connected', client: 'Codex', transport: 'stdio', demo: true },
  { at: new Date(Date.now() - 120000).toISOString(), type: 'test.finished', component: 'tests', exitCode: 0, demo: true },
  { at: new Date(Date.now() - 480000).toISOString(), type: 'service.started', component: 'web', demo: true }
];
let dashboardMetric = 'cpu';
let serviceMetricType = 'cpu';
let serviceMetricSelected = null;
const processMetricState = () => window.projectRoomMetrics || { services: {}, totals: [] };
const metricValue = (point, type) => type === 'memory' ? point.memoryBytes / 1048576 : point.cpu;
const metricLabel = (value, type) => type === 'memory' ? `${Math.round(value)} MB` : `${Number(value).toFixed(1)}%`;
function liveMetricChart(samples, type, emptyMessage) {
  if (!samples?.length) return `<div class="dashboard-empty-metric"><div class="dashboard-empty-symbol">${icon('activity')}</div><strong>No measurements yet</strong><p>${escapeHtml(emptyMessage)}</p></div>`;
  const stride = Math.max(1, Math.ceil(samples.length / 300));
  const display = samples.filter((_, index) => index % stride === 0 || index === samples.length - 1);
  const values = display.map(point => metricValue(point, type));
  const ceiling = Math.max(1, ...values) * 1.15;
  const points = values.map((value, index) => `${Math.round(index * 630 / Math.max(1, values.length - 1))},${Math.round(102 - value / ceiling * 88)}`).join(' ');
  const last = display.at(-1);
  const start = new Date(display[0].at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `<div class="live-metric-chart"><svg viewBox="0 0 630 110" preserveAspectRatio="none" role="img" aria-label="${type === 'cpu' ? 'CPU' : 'Memory'} trend"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${values.length === 1 ? `<circle cx="0" cy="${Math.round(102 - values[0] / ceiling * 88)}" r="4" fill="currentColor"/>` : ''}</svg></div><div class="live-metric-times"><span>${escapeHtml(start)}</span><span>${escapeHtml(end)}</span></div><div class="live-metric-current"><strong>${metricLabel(metricValue(last, type), type)}</strong><span>${samples.length} samples · 5-second interval · local session</span></div>`;
}
function metricTabs(type, action) {
  return `<div class="metric-tabs"><button class="${type === 'cpu' ? 'active' : ''}" data-v3="${action}:cpu">CPU</button><button class="${type === 'memory' ? 'active' : ''}" data-v3="${action}:memory">Memory</button></div>`;
}
let mapDisplay = 'map';
let mapSourceText = null;
let mapSourceError = null;
let mapSourceRequest = 0;
state.page = 'dashboard';
const pageHead = (title, subtitle, actions = '') => `<div class="page-head"><div><div class="eyebrow">PROJECT ROOM / ${projectRoot ? 'LOCAL PROJECT' : 'INTERACTIVE DEMO'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="head-actions">${actions}</div></div>`;
const v3Button = (label, action, primary = false) => `<button class="btn ${primary ? 'primary' : ''}" data-v3="${action}">${label}</button>`;
const v3Empty = message => `<div class="empty">${escapeHtml(message)}</div>`;
const v3Status = component => {
  if (component.kind === 'service') return pv && projectRoot ? (desktopStatus[component.id] === 'running' ? ['Running', ''] : component.runtime?.lifecycle === 'detached' && desktopStatus[component.id] !== 'stopped' ? ['Status unknown', 'off'] : ['Stopped', 'off']) : (state.services.find(x => x.id === component.id || (component.id === 'web' && x.id === 'app'))?.running ? ['Running · demo', ''] : ['Stopped · demo', 'off']);
  if (component.kind === 'commandTool') return pv && projectRoot ? (desktopStatus[component.id] === 'running' ? ['Running', ''] : [component.cli?.mode === 'task' ? 'Ready' : 'Stopped', 'off']) : (commandDemoRunning[component.id] ? ['Running · demo', ''] : [component.cli?.mode === 'task' ? 'Ready · demo' : 'Stopped · demo', 'off']);
  if (component.kind === 'testSuite') return ['Ready', 'off'];
  if (component.kind === 'database') return ['Configured', 'off'];
  if (component.kind === 'storage') return ['Declared', 'off'];
  if (component.kind === 'issues') return ['Source set', 'off'];
  return ['In repository', 'off'];
};
getNodeStatus = v3Status;
Object.assign(kindLabels, { commandTool: 'Command tool', database: 'Database', testSuite: 'Test suite', specification: 'Specification', issues: 'Issues', storage: 'Storage', external: 'External' });
const runtimeMapComponents = () => projectConfig.components.filter(c => ['service', 'database', 'storage'].includes(c.kind) || (c.kind === 'commandTool' && c.cli?.mode === 'server'));
const runtimeMapConnections = () => {
  const ids = new Set(runtimeMapComponents().map(c => c.id));
  return projectConfig.connections.filter(edge => ids.has(edge.from) && ids.has(edge.to));
};
mapNode = function (c) {
  const [status, statusKind] = v3Status(c);
  const x = Math.max(0, Math.min(72, Number(c.position?.x) || 0));
  const y = Math.max(0, Number(c.position?.y) || 0);
  const detail = c.kind === 'service' ? [c.runtime?.port && ':' + c.runtime.port, buildIdentityText(c.id, true)].filter(Boolean).join(' · ') : c.kind === 'commandTool' ? [c.cli?.mode || 'tool', buildIdentityText(c.id, true)].filter(Boolean).join(' · ') : c.path || c.data?.engine || c.integration?.provider || kindLabels[c.kind] || c.kind;
  return `<article class="map-node kind-${escapeHtml(c.kind)} ${selectedComponent === c.id ? 'selected' : ''}" data-map-node="${escapeHtml(c.id)}" style="left:${x}%;top:${y}px" tabindex="0" role="button" aria-label="Open ${escapeHtml(c.name)}"><div class="map-node-header"><div class="map-node-icon">${icon(c.icon || 'cube')}</div><div class="map-node-name">${escapeHtml(c.name)}</div></div><div class="map-node-kind" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div><div class="map-node-bottom">${badge(status, statusKind)}<span>${icon('arrow')}</span></div></article>`;
};
function projectMap() {
  const mapComponents = runtimeMapComponents();
  const mapConnections = runtimeMapConnections();
  const count = mapComponents.length;
  const componentList = mapComponents.map(c => { const [status, kind] = v3Status(c); return `<button class="map-list-item" data-v3="inspect:${escapeHtml(c.id)}"><span class="map-list-icon">${icon(c.icon || 'cube')}</span><span class="map-list-copy"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(kindLabels[c.kind] || c.kind)} · ${escapeHtml(c.id)}</small>${['service', 'commandTool'].includes(c.kind) ? `<small>${escapeHtml(buildIdentityText(c.id))}</small>` : ''}</span>${badge(status, kind)}${icon('arrow')}</button>`; }).join('') || v3Empty('No runtime components configured. Add a service, database or storage resource.');
  const source = mapSourceError ? `<div class="map-source-message" role="alert">${escapeHtml(mapSourceError)}</div>` : mapSourceText === null ? '<div class="map-source-message" role="status">Loading ${escapeHtml(activeConfigPath)}…</div>' : `<pre><code>${escapeHtml(mapSourceText)}</code></pre>`;
  return `<div class="workspace-head"><div><div class="eyebrow">PROJECT ROOM / ${projectRoot ? 'LOCAL PROJECT' : 'INTERACTIVE DEMO'}</div><h1>${escapeHtml(projectConfig.project?.name || 'Project Map')}</h1><p>Services, databases and storage used by this project. Specifications, tests and CLI tasks have their own views.</p></div><div class="workspace-head-actions">${v3Button(icon('folder') + ' Projects', 'workspace')}<button type="button" class="btn primary" data-v9="map:add">${icon('plus')} Add component</button></div></div>
  <div class="map-meta"><span class="dot"></span><strong>${projectRoot ? 'Local project' : 'Demo project'}</strong><span>·</span><span>${count} runtime components</span><span>·</span><span>${mapConnections.length} dependencies</span><span>·</span><span>${mapComponents.filter(x => x.kind === 'service').length} services</span><span>·</span><span>Statuses do not include Docker Compose</span></div>
  <section class="map-frame ${mapDisplay === 'list' ? 'map-list-mode' : mapDisplay === 'source' ? 'map-source-mode' : ''}"><div class="map-toolbar"><div class="map-toolbar-left"><span class="map-toolbar-title">Project Map</span><span class="toolbar-pill">${icon('git')} ${escapeHtml(projectConfig.project?.version || 'local')}</span><span class="toolbar-pill">${escapeHtml(activeConfigPath)}</span></div><div class="map-toolbar-right"><div class="map-view-switch" role="group" aria-label="Project map view"><button class="${mapDisplay === 'map' ? 'active' : ''}" data-v3="map-view:map" aria-pressed="${mapDisplay === 'map'}">Map</button><button class="${mapDisplay === 'list' ? 'active' : ''}" data-v3="map-view:list" aria-pressed="${mapDisplay === 'list'}">List</button><button class="${mapDisplay === 'source' ? 'active' : ''}" data-v3="map-view:source" aria-pressed="${mapDisplay === 'source'}">Source</button></div><button class="tool-button" data-v9="map:add" title="Add component">${icon('plus')}</button>${mapDisplay === 'map' ? '<button class="tool-button" data-v3="fit" title="Fit map">⌗</button>' : ''}</div></div><div class="map-canvas" style="height:${Math.max(520, ...mapComponents.map(c => (Number(c.position?.y) || 0) + 150))}px"><div class="map-content" id="mapContent" style="transform:scale(${mapZoom})"><svg class="map-links" id="mapLinks" aria-hidden="true"></svg>${mapComponents.map(mapNode).join('')}</div><div class="map-float-controls"><button data-v3="zoom-in" title="Zoom in">+</button><button data-v3="zoom-out" title="Zoom out">−</button><button data-v3="fit" title="Fit map">⌗</button></div><div class="map-legend"><span><i></i> Running</span><span><i></i> Ready</span><span><i></i> Attention</span></div></div><div class="map-component-list">${componentList}</div><div class="map-source-view"><div class="map-source-heading"><strong>${escapeHtml(activeConfigPath)}</strong><span>${projectRoot ? 'Repository file · read only' : 'Packaged demo file · read only'}</span></div>${source}</div></section>
  `;
}
function dashboardPage() {
  const demo = !projectRoot;
  if (!demo && dashboardMetric === 'latency') dashboardMetric = 'cpu';
  const services = projectConfig.components.filter(c => c.kind === 'service');
  const suites = projectConfig.components.filter(c => c.kind === 'testSuite');
  const issueSources = projectConfig.components.filter(c => c.kind === 'issues');
  const specs = projectConfig.components.filter(c => c.kind === 'specification');
  const running = services.filter(c => v3Status(c)[0].startsWith('Running')).length;
  const runs = pvHistory.filter(e => e.type === 'test.finished');
  const lastRun = runs[0];
  const metricData = {
    latency: { label: 'Latency', value: '186 ms', detail: 'P95 response time', path: 'M0 83 C30 80 31 62 58 65 S81 79 108 56 S134 46 164 65 S195 71 224 53 S261 44 291 59 S325 70 354 49 S389 40 417 58 S452 68 475 41 S512 60 541 49 S572 58 601 42 S620 49 630 39' },
    cpu: { label: 'CPU', value: '18.6 %', detail: 'Process utilization', path: 'M0 74 C37 65 53 72 82 55 S134 51 163 63 S210 80 241 53 S284 52 316 44 S356 70 387 58 S422 39 452 52 S500 67 530 45 S574 59 601 44 S621 50 630 43' },
    memory: { label: 'Memory', value: '384 MB', detail: 'Process memory', path: 'M0 82 C35 80 53 77 80 75 S128 73 160 70 S206 70 238 67 S284 65 315 62 S361 57 389 55 S430 55 458 50 S503 48 532 43 S581 42 607 39 S620 40 630 37' }
  };
  const activeMetric = metricData[dashboardMetric];
  const metricCard = demo ? `<div class="metric-wrap"><div class="metric-tabs">${Object.entries(metricData).map(([key, m]) => `<button class="${dashboardMetric === key ? 'active' : ''}" data-v3="metric:${key}">${m.label}</button>`).join('')}</div><div class="chart"><svg viewBox="0 0 630 100" preserveAspectRatio="none" aria-label="Sample ${activeMetric.label} trend"><defs><linearGradient id="dashboard-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7c6d7" stop-opacity=".23"/><stop offset="1" stop-color="#b7c6d7" stop-opacity="0"/></linearGradient></defs><path d="${activeMetric.path} L630 100 L0 100Z" fill="url(#dashboard-fill)"/><path d="${activeMetric.path}" stroke="#6c87a2" stroke-width="2.4" fill="none"/></svg></div><div class="chart-labels"><span>09:00</span><span>10:00</span><span>11:00</span><span>12:00</span><span>13:00</span><span>Now</span></div></div><div class="metric-summary"><div><span>${activeMetric.detail}</span><strong>${activeMetric.value}</strong></div><div><span>CPU</span><strong>18.6 %</strong></div><div><span>Memory</span><strong>384 MB</strong></div></div>` : `<div class="metric-wrap">${metricTabs(dashboardMetric, 'metric')}${liveMetricChart(processMetricState().totals, dashboardMetric, 'Start a service in Project Room to record its CPU and memory usage. Only processes started here are measured.')}</div>`;
  let issueRows = demo ? demoBacklog.map(issue => `<div class="queue-item"><span class="task-check" aria-hidden="true"></span><div class="queue-copy"><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.id)} · interactive sample</small></div><span class="tag">${escapeHtml(issue.type)}</span></div>`).join('') : issueSources.map(c => `<div class="queue-item"><div class="queue-copy"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.integration?.provider || 'External')} · live sync not connected</small></div>${badge('Configured', 'off')}</div>`).join('') || v3Empty('No issue source configured.');
  if (!demo) issueRows = productWorkItems().filter(issue => issue.status !== 'done').slice(0, 3).map(issue => `<button class="queue-item backlog-overview-issue" data-v3="page:issues"><div class="queue-copy"><strong>${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.local ? issue.id : issue.source)} · ${escapeHtml(issue.status)}</small></div><span class="tag">${escapeHtml(issue.type)}</span></button>`).join('') || v3Empty('No open work yet. Create an item in Backlog.');
  const testStatus = demo ? `<div class="test-progress"><div class="progress-head"><strong>87 %</strong><span>26 of 30 sample checks passed</span></div><div class="progress-track"><div class="progress-fill"></div></div><div class="progress-foot"><span>Sample test coverage</span><span>Demo</span></div></div><div class="test-latest">${icon('check')} Latest sample run <strong>passed</strong> · 1 min 24 s</div>` : lastRun ? `<div class="test-progress"><div class="progress-head"><strong>${lastRun.exitCode === 0 ? 'Passed' : 'Failed'}</strong><span>${escapeHtml(lastRun.component || 'Test suite')}</span></div><p class="dashboard-test-note">${escapeHtml(new Date(lastRun.at).toLocaleString('en-GB'))} · exit ${escapeHtml(lastRun.exitCode)}</p></div><div class="test-latest">${icon('flask')} ${runs.length} recorded run${runs.length === 1 ? '' : 's'} · see Activity for logs</div>` : `<div class="dashboard-empty-test">No test runs recorded in this project yet.</div>`;
  const serviceRows = services.map(c => { const [status, kind] = v3Status(c); const command = (c.runtime?.command || []).join(' '); return `<div class="env-row"><div class="service-icon ${c.id === 'api' ? 'blue' : ''}">${icon(c.icon || 'terminal')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)} ${badge(status, kind)}</div><div class="service-sub">${escapeHtml(command || c.kind)}${c.runtime?.port ? ' · :' + c.runtime.port : ''}</div>${buildIdentityLine(c.id)}</div><div class="dashboard-service-actions">${c.runtime?.url ? `<button class="mini-btn" data-v3="preview:${escapeHtml(c.id)}" title="Open preview">${icon('arrow')}</button>` : ''}<button class="mini-btn" data-v3="service:${escapeHtml(c.id)}" title="${status.startsWith('Running') ? 'Stop' : 'Start'} ${escapeHtml(c.name)}">${icon(status.startsWith('Running') ? 'stop' : 'play')}</button></div></div>`; }).join('') || v3Empty('No services configured.');
  const stat = (title, number, foot, symbol, page) => `<button class="card stat-card dashboard-stat" data-page="${page}"><div class="stat-top">${title} ${icon(symbol)}</div><div class="stat-number">${number}</div><div class="stat-foot">${foot}</div></button>`;
  return `<div class="dashboard-shell">${pageHead('Everything at a glance.', 'Development, quality and product progress in one place.', demo ? v3Button(icon('play') + ' Try working example', 'open-example', true) : suites.length ? v3Button(icon('flask') + ' Open tests', 'page:tests', true) : '')}
  <div class="grid summary-grid">${stat('Running services' + (demo ? ' · demo' : ''), `${running}<span class="stat-denominator">/${services.length}</span>`, demo ? '● Simulated local status' : '● Local process status', 'play', 'runtime')}${stat(demo ? 'Latest tests · demo' : 'Recorded test runs', demo ? '3<span class="stat-denominator">/4</span>' : String(runs.length), demo ? 'Sample result' : (lastRun ? (lastRun.exitCode === 0 ? 'Latest run passed' : 'Latest run failed') : 'No run yet'), 'flask', 'tests')}${stat(demo ? 'Backlog · demo' : 'Work items', demo ? '03' : String(productWorkItems().length).padStart(2, '0'), demo ? 'Ideas · features · bugs · sample' : 'Local issues and Spec Kit files', 'list', 'issues')}${stat(demo ? 'P95 response · demo' : (running ? 'Local CPU' : 'Last CPU sample'), demo ? '186<span class="stat-unit"> ms</span>' : (processMetricState().totals.length ? metricLabel(processMetricState().totals.at(-1).cpu, 'cpu') : '—'), demo ? 'Sample measurement' : (processMetricState().totals.length ? `${metricLabel(processMetricState().totals.at(-1).memoryBytes / 1048576, 'memory')} · Project Room services` : 'Start a service to measure'), 'activity', 'runtime')}</div>
  <div class="grid two-col"><div class="stack"><section class="card"><div class="card-head"><div><h2>Development environment</h2><p>Services and versions in this project</p></div><button class="link" data-page="runtime">All services ${icon('arrow')}</button></div>${serviceRows}</section><section class="card"><div class="card-head"><div><h2>Performance</h2><p>${demo ? 'Sample signal · last 4 hours' : 'Project Room services · this app session'}</p></div><button class="link" data-page="activity">Activity ${icon('arrow')}</button></div>${metricCard}</section></div><div class="stack"><section class="card"><div class="card-head"><div><h2>Product work</h2><p>${demo ? 'Ideas · features · bugs · sample' : 'Local backlog and Spec Kit'}</p></div><button class="link" data-page="issues">View backlog ${icon('arrow')}</button></div>${issueRows}</section>${projectConfig.components.some(c => c.kind === 'commandTool') ? `<section class="card command-summary"><div class="card-head"><div><h2>CLI Explorer</h2><p>Discover and inspect project commands</p></div><button class="link" data-page="commands">Open tools ${icon('arrow')}</button></div><div class="command-summary-body"><span class="command-summary-icon">${icon('terminal')}</span><div><strong>${projectConfig.components.filter(c => c.kind === 'commandTool').length} configured tool${projectConfig.components.filter(c => c.kind === 'commandTool').length === 1 ? '' : 's'}</strong><small>Usage · options · output · controls</small></div></div></section>` : ''}<section class="card"><div class="card-head"><div><h2>${demo ? 'Test coverage' : 'Latest test run'}</h2><p>${demo ? 'Sample result' : `${suites.length} configured suite${suites.length === 1 ? '' : 's'}`}</p></div><button class="link" data-page="tests">View tests ${icon('arrow')}</button></div>${testStatus}</section><section class="card spec-card"><div class="spec-symbol">${icon('doc')}</div><div><h2>Keep the product idea visible</h2><p>${projectConfig.product?.roadmap?.length || 0} roadmap items and ${projectConfig.product?.documentation?.length || 0} documents guide the code and tests.</p><button data-page="${window.productViewOptionalViewEnabled?.('vision') ? 'vision' : 'docs'}">${window.productViewOptionalViewEnabled?.('vision') ? 'Open Vision' : 'Open Documentation'} →</button></div></section></div></div><div class="footer-note">${icon('clock')} ${demo ? 'Interactive demo · sample data and simulated actions' : 'Project data from .projectroom/project.yaml · process metrics are local to this app session'}</div></div>`;
}
function productMarkdown(value) {
  if (value === null || value === undefined) return v3Empty('This Markdown file is not available in the current project.');
  const inline = line => line.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return `<div class="product-markdown">${escapeHtml(value).split(/\r?\n/).map(line => {
    if (!line.trim()) return '<div class="product-paragraph-gap"></div>';
    if (line.startsWith('### ')) return `<h4>${inline(line.slice(4))}</h4>`;
    if (line.startsWith('## ')) return `<h3>${inline(line.slice(3))}</h3>`;
    if (line.startsWith('# ')) return `<h2>${inline(line.slice(2))}</h2>`;
    if (line.startsWith('- ')) return `<p class="product-bullet">${inline(line.slice(2))}</p>`;
    return `<p>${inline(line)}</p>`;
  }).join('')}</div>`;
}
function productEditor(path, content) {
  return productEditingPath === path ? `<div class="product-editor"><textarea id="productEditor" spellcheck="true" aria-label="Edit Markdown document">${escapeHtml(productDraft)}</textarea><div class="product-editor-actions"><span>${projectRoot ? 'Saves to the repository' : 'Demo changes last only this session'}</span>${v3Button('Cancel', 'product-cancel')}${v3Button('Save Markdown', 'product-save', true)}</div></div>` : productMarkdown(content);
}
function northStarCard(metric) {
  if (!metric) return `<section class="card north-star-card north-star-empty"><div class="north-star-symbol" aria-hidden="true">✦</div><span class="north-star-kicker">YOUR PRODUCT SIGNAL</span><h2>Choose a North Star</h2><p>One number that shows whether people get value from this product. Define it now, then record the first measurement by hand.</p><div class="north-star-empty-steps"><span>01 · Define</span><span>02 · Record</span><span>03 · See progress</span></div><button class="btn primary" data-v3="north-star-define">Define metric ${icon('arrow')}</button></section><section class="card north-star-plot"><div class="north-star-plot-head"><h3>Historical progress</h3><span>Manual measurements in this repository</span></div><div class="north-star-chart-empty">Define your metric and record a first value to start the chart.</div></section>`;
  const measurements = [...(metric.measurements || [])].sort((a, b) => a.date.localeCompare(b.date));
  const latest = measurements.at(-1);
  const format = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  let chart = '<div class="north-star-chart-empty">No measurements yet. Record a baseline to begin the history.</div>';
  if (measurements.length) {
    const values = measurements.map(item => item.value);
    const low = Math.min(...values), high = Math.max(...values);
    const padding = Math.max((high - low) * .12, Math.abs(high) * .04, 1);
    const min = low - padding, max = high + padding;
    const points = measurements.map((item, index) => [55 + (measurements.length === 1 ? .5 : index / (measurements.length - 1)) * 620, 174 - ((item.value - min) / (max - min)) * 140]);
    const ticks = [max, (max + min) / 2, min].map((value, index) => `<g class="north-star-grid"><line x1="55" x2="675" y1="${34 + index * 70}" y2="${34 + index * 70}"/><text x="45" y="${38 + index * 70}" text-anchor="end">${escapeHtml(format(value))}</text></g>`).join('');
    chart = `<div class="north-star-chart"><svg viewBox="0 0 720 210" role="img" aria-label="${escapeHtml(metric.name)} history from ${escapeHtml(measurements[0].date)} to ${escapeHtml(latest.date)}">${ticks}${points.length > 1 ? `<polyline points="${points.map(([x, y]) => `${x},${y}`).join(' ')}" class="north-star-line"/>` : ''}${points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="4" class="north-star-point"><title>${escapeHtml(measurements[index].date)}: ${escapeHtml(format(measurements[index].value))} ${escapeHtml(metric.unit)}</title></circle>`).join('')}</svg><div><span>${escapeHtml(measurements[0].date)}</span><span>${escapeHtml(latest.date)}</span></div></div>`;
  }
  return `<section class="card north-star-card"><div class="north-star-head"><div><span class="north-star-kicker">NORTH STAR · ${escapeHtml(metric.cadence)}</span><h2>${escapeHtml(metric.name)}</h2><p>${escapeHtml(metric.description || 'One shared measure of product value.')}</p></div><button class="btn small" data-v3="north-star-define">Edit definition</button></div><div class="north-star-main"><div class="north-star-current"><span>LATEST VALUE</span><strong>${latest ? format(latest.value) : '—'}</strong><small>${escapeHtml(metric.unit)}${latest ? ` · ${escapeHtml(latest.date)}` : ''}</small>${typeof metric.target === 'number' ? `<p>Target: ${format(metric.target)} ${escapeHtml(metric.unit)}</p>` : ''}<button class="btn primary small" data-v3="north-star-record">${icon('plus')} Record value</button></div></div></section><section class="card north-star-plot"><div class="north-star-plot-head"><h3>Historical progress</h3><span>${measurements.length} manual measurement${measurements.length === 1 ? '' : 's'} · ${escapeHtml(metric.cadence)}</span></div>${chart}${measurements.length ? `<div class="north-star-history"><strong>Recorded values</strong>${measurements.slice().reverse().map(item => `<button type="button" data-v3="north-star-edit-record" data-metric-date="${escapeHtml(item.date)}"><span>${escapeHtml(item.date)}</span><b>${format(item.value)} ${escapeHtml(metric.unit)}</b><small>${escapeHtml(item.note || 'Edit entry')}</small></button>`).join('')}</div>` : ''}</section>`;
}
function productPage(section = 'vision') {
  const model = projectConfig.product;
  if (!model) return `${pageHead(pageNames[section] || 'Vision', 'Create shared product context in this repository.')}
    <section class="card product-setup"><div class="product-setup-icon">${icon('doc')}</div><h2>Give this project a product home</h2><p>Project Room can create a vision document, a documentation folder and a roadmap block in .projectroom/project.yaml.</p>${projectRoot ? v3Button('Set up Product Hub', 'product-setup', true) : '<span>Open a project folder to set up its product context.</span>'}</section>`;
  const lanes = [['draft', 'Draft'], ['planned', 'Planned'], ['in-progress', 'In progress'], ['done', 'Done']];
  const roadmap = model.roadmap || [];
  const contextNote = projectRoot ? 'Saved in this repository · visible to connected coding agents' : 'Interactive demo · changes in this session are not saved';
  const writingVision = productEditingPath === model.vision;
  const vision = `<div class="vision-workspace"><div class="vision-prompts"><strong>Start with the essentials</strong><span>What problem are we solving?</span><span>Who is it for?</span><span>What should be different?</span></div><div class="vision-main-column"><section class="card product-vision-card vision-document"><div class="vision-document-head"><div><span>VISION DOCUMENT</span><code>${escapeHtml(model.vision)}</code></div><button type="button" class="btn small" data-v3="product-edit-vision">${writingVision ? 'Close editor' : 'Edit Markdown'}</button></div>${productEditor(model.vision, productContents.vision)}</section></div></div>`;
  const roadmapView = `<section class="product-roadmap-section"><div class="product-roadmap-grid">${lanes.map(([status, label]) => { const items = roadmap.filter(item => item.status === status); return `<div class="product-lane"><div class="product-lane-head"><span class="product-status-dot ${status}"></span><strong>${label}</strong><span>${items.length}</span></div>${items.map(item => `<button class="product-roadmap-card" data-v3="product-roadmap" data-roadmap-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || 'No summary yet.')}</p>${item.relatedComponents?.length ? `<small>${escapeHtml(item.relatedComponents.join(' · '))}</small>` : ''}</button>`).join('') || '<div class="product-lane-empty">No items yet</div>'}</div>`; }).join('')}</div></section>`;
  const docsView = documentationBrowser();
  const pages = {
    vision: [pageHead('Vision', 'Describe what you are building and why.'), vision],
    'north-star': [pageHead('North Star', 'Define one product outcome and follow its progress over time.'), `<div class="north-star-page">${northStarCard(model.northStar)}</div>`],
    roadmap: [pageHead('Roadmap', 'Draft, planned, active and completed outcomes.', v3Button(icon('plus') + ' Add roadmap item', 'product-new-roadmap', true)), roadmapView],
    docs: [pageHead('Documentation', `Browse Markdown files in ${model.docsRoot}.`, `${v3Button(icon('activity') + ' Refresh folder', 'doc-refresh')}${v3Button(icon('plus') + ' New document', 'product-new-doc', true)}`), docsView]
  };
  const [header, body] = pages[section] || pages.vision;
  return `<div class="product-shell">${header}${body}<div class="footer-note">${icon('clock')} ${contextNote}</div></div>`;
}
async function refreshProductContents() {
  const model = projectConfig.product;
  if (!model) { productContents = { vision: null, documents: {} }; if (['product', 'vision', 'north-star', 'roadmap', 'docs'].includes(state.page)) render(); return; }
  if (pv && projectRoot) productContents = await pv.readProduct();
  else {
    const read = path => fetch('./' + path).then(response => response.ok ? response.text() : null).catch(() => null);
    const [vision, ...contents] = await Promise.all([read(model.vision), ...(model.documentation || []).map(item => read(item.path))]);
    productContents = { vision, documents: Object.fromEntries((model.documentation || []).map((item, index) => [item.path, contents[index]])) };
  }
  if (['product', 'vision', 'north-star', 'roadmap', 'docs', 'agent'].includes(state.page)) render();
}
function runtimePage() {
  const services = projectConfig.components.filter(x => x.kind === 'service');
  const selected = services.find(item => item.id === serviceMetricSelected && item.runtime?.lifecycle !== 'detached') || services.find(item => item.runtime?.lifecycle !== 'detached');
  const selectedMetrics = selected ? processMetricState().services[selected.id] : null;
  const latest = selectedMetrics?.samples?.at(-1);
  return `${pageHead('Services', 'Start and stop services defined in .projectroom/project.yaml.')}
  <section class="card"><div class="card-head"><div><h2>Services</h2><p>${services.length} configured · manual start</p></div></div>${services.map(c => { const [status, kind] = v3Status(c); const point = processMetricState().services[c.id]?.samples?.at(-1); const detached = c.runtime?.lifecycle === 'detached'; return `<div class="env-row"><div class="service-icon">${icon(c.icon || 'terminal')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)} ${badge(status, kind)}</div><div class="service-sub">${escapeHtml((c.runtime?.command || []).join(' '))}${c.runtime?.port ? ' · :' + c.runtime.port : ''} · ${detached ? 'detached service' : 'foreground process'}</div>${buildIdentityLine(c.id)}${point ? `<div class="service-metric-inline">CPU ${metricLabel(point.cpu, 'cpu')} · Memory ${metricLabel(point.memoryBytes / 1048576, 'memory')}</div>` : ''}</div>${detached ? `<button class="btn small" data-v3="service-status:${escapeHtml(c.id)}">Check status</button>` : `<button class="btn small" data-v3="service-metrics:${escapeHtml(c.id)}">Metrics</button>`}<button class="btn small" data-v3="service:${escapeHtml(c.id)}">${icon(status.startsWith('Running') ? 'stop' : 'play')} ${status.startsWith('Running') ? detached ? 'Stop service' : 'Stop process' : 'Start'}</button>${c.runtime?.url ? `<button class="btn small" data-v3="preview:${escapeHtml(c.id)}">Open</button>` : ''}</div>`; }).join('') || v3Empty('No services configured.')}<p class="footer-note">Foreground Stop ends the process Project Room launched. Containers started by that process may continue; use a detached lifecycle with verified status and stop commands for a whole stack.</p></section>${selected ? `<section class="card service-metric-card"><div class="card-head"><div><h2>${escapeHtml(selected.name)} · resource use</h2><p>${selectedMetrics?.running ? 'Recording while this service runs' : latest ? 'Last run in this app session' : 'Start this service to see resource use'} · CPU includes child processes</p></div></div><div class="metric-wrap">${metricTabs(serviceMetricType, 'service-metric')}${liveMetricChart(selectedMetrics?.samples, serviceMetricType, selectedMetrics?.error || 'Project Room samples this service and its child processes every five seconds while it runs.')}</div></section>` : ''}`;
}
function testsPage() {
  const suites = projectConfig.components.filter(x => x.kind === 'testSuite');
  return `${pageHead('Test Explorer', 'Run test suites configured in your repository.')}
  <section class="card"><div class="card-head"><div><h2>Test Suites</h2><p>Results and output are recorded in .productview/</p></div></div>${suites.map(c => `<div class="env-row"><div class="service-icon green">${icon('flask')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)}</div><div class="service-sub">${escapeHtml((c.tests?.command || []).join(' '))} · ${escapeHtml((c.tests?.categories || []).join(', '))}</div></div><button class="btn small" data-v3="test:${escapeHtml(c.id)}">${icon('play')} Run</button></div>`).join('') || v3Empty('No test suites configured.')}</section>`;
}
function specMarkdown(value) {
  const parts = [];
  let prose = [], code = [], fenced = false;
  const flushProse = () => { if (prose.length) { parts.push(productMarkdown(prose.join('\n'))); prose = []; } };
  const flushCode = () => { parts.push(`<pre class="spec-code"><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; };
  for (const line of value.split(/\r?\n/)) {
    if (line.startsWith('```')) { if (fenced) { flushCode(); fenced = false; } else { flushProse(); fenced = true; } }
    else if (fenced) code.push(line);
    else prose.push(line);
  }
  if (fenced) flushCode();
  flushProse();
  return `<div class="spec-markdown">${parts.join('')}</div>`;
}
function specsPage() {
  const documents = specEntries.filter(item => item.type === 'file');
  const selected = documents.find(item => item.path === specSelectedPath);
  const activeFeature = specKit.features.find(feature => specSelectedPath === feature.spec || specSelectedPath?.startsWith(feature.directory + '/'));
  const kitSummary = specKit.detected ? `<section class="spec-kit-summary"><div class="spec-kit-heading"><div><strong>Spec Kit project</strong><span>${specKit.features.length} feature${specKit.features.length === 1 ? '' : 's'} · ${specKit.constitution ? 'project rules found' : 'no constitution found'}</span></div>${specKit.constitution ? `<button class="btn small" data-v3="spec-open" data-spec-path="${escapeHtml(specKit.constitution)}">Project rules</button>` : ''}</div><div class="spec-kit-features">${specKit.features.map(feature => `<button class="spec-kit-feature ${activeFeature?.spec === feature.spec ? 'active' : ''}" data-v3="spec-open" data-spec-path="${escapeHtml(feature.spec)}"><strong>${escapeHtml(feature.title)}</strong><small>${feature.active ? 'Active feature · ' : ''}${escapeHtml(feature.stage)} · ${feature.tasks.done}/${feature.tasks.total} tasks</small></button>`).join('') || '<span class="spec-kit-empty">No feature folders with spec.md found.</span>'}</div></section>` : `<section class="spec-kit-summary spec-kit-generic"><div><strong>Specification folder</strong><span>Spec Kit feature folders were not detected. Existing files remain available below. Use Onboarding to map this project or plan a Spec Kit adoption with your coding agent.</span></div><button class="btn small" data-v3="page:onboarding">Onboarding</button></section>`;
  const featureDetail = activeFeature ? `<section class="spec-kit-detail"><div class="spec-kit-detail-head"><strong>${escapeHtml(activeFeature.title)}</strong><span>${activeFeature.tasks.total ? Math.round(activeFeature.tasks.done / activeFeature.tasks.total * 100) + '% tasks complete' : 'No implementation tasks registered'}</span></div><div class="spec-kit-stats"><span>${activeFeature.requirementIds.length} requirements</span><span>${activeFeature.successIds.length} success criteria</span><span>${activeFeature.clarifications} open clarifications</span><span>${activeFeature.checklists.done}/${activeFeature.checklists.total} checklist items</span></div><div class="spec-kit-artifacts">${activeFeature.artifacts.map(name => `<button data-v3="spec-open" data-spec-path="${escapeHtml(activeFeature.directory + '/' + name)}" class="${specSelectedPath === activeFeature.directory + '/' + name ? 'active' : ''}">${escapeHtml(name)}</button>`).join('')}</div><div class="spec-kit-trace"><div><strong>Built components</strong>${activeFeature.components.length ? activeFeature.components.map(item => `<div>${escapeHtml(item.name)} <small>${escapeHtml(item.status)}</small></div>`).join('') : '<p>No linked components</p>'}</div><div><strong>Test evidence</strong>${activeFeature.tests.length ? activeFeature.tests.map(item => `<div>${escapeHtml(item.name)} <small>${escapeHtml(item.result)}${item.at ? ' · ' + escapeHtml(new Date(item.at).toLocaleString('en-GB')) : ''}</small></div>`).join('') : '<p>No linked tests</p>'}</div></div>${activeFeature.checks.length ? `<div class="spec-kit-checks">${activeFeature.checks.map(item => `<div class="${escapeHtml(item.level)}">${escapeHtml(item.message)}</div>`).join('')}</div>` : '<div class="spec-kit-clear">No link or test-run discrepancies found. Implementation tasks may still be open.</div>'}<small class="spec-kit-evidence-note">Process state is local to this Project Room session. Test results come from recorded Project Room runs; they do not prove full requirement coverage.</small></section>` : '';
  const traceRows = activeFeature?.trace?.length ? `<section class="spec-kit-summary"><strong>Traceability</strong>${activeFeature.trace.map(link => `<div class="spec-kit-link"><span>${escapeHtml(link.requirements.join(', ') || 'Feature level')}</span><span>${escapeHtml(link.components.join(', ') || 'No component')}</span><span>${escapeHtml(link.tests.join(', ') || 'No test')}</span><small>${escapeHtml(link.source)}</small></div>`).join('')}</section>` : '';
  const visible = item => ![...specCollapsed].some(folder => item.path.startsWith(folder + '/')) && (!specSearch || item.path.toLowerCase().includes(specSearch) || item.type === 'directory' && documents.some(file => file.path.startsWith(item.path + '/') && file.path.toLowerCase().includes(specSearch)));
  const tree = specEntries.filter(visible).map(item => `<button type="button" class="spec-tree-item ${item.type === 'directory' ? 'directory' : ''} ${item.path === specSelectedPath ? 'active' : ''}" style="padding-left:${12 + item.depth * 16}px" data-v3="${item.type === 'directory' ? 'spec-folder' : 'spec-open'}" data-spec-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">${icon(item.type === 'directory' ? 'folder' : 'doc')}<span>${escapeHtml(item.path.split('/').pop())}</span>${item.type === 'directory' ? `<small>${specCollapsed.has(item.path) ? '▸' : '▾'}</small>` : ''}</button>`).join('');
  const content = !selected ? v3Empty(specLoading ? 'Loading specification folders…' : 'Choose a specification from the folder tree.') : !selected.previewable ? v3Empty('This file is listed, but a text preview is not available.') : specSelectedText === null ? v3Empty('Loading file…') : specRaw || !/\.mdx?$/i.test(selected.path) ? `<pre class="spec-source">${escapeHtml(specSelectedText)}</pre>` : specMarkdown(specSelectedText);
  return `<div class="spec-browser-shell">${pageHead('Requirements', 'Browse requirements, specifications and plans from the configured folders.', `<button class="btn" data-v3="spec-refresh">${icon('activity')} Refresh folders</button>`)}${kitSummary}${featureDetail}${traceRows}
  <section class="card spec-browser"><aside class="spec-browser-tree"><div class="spec-browser-title"><strong>SPECIFICATION FOLDERS</strong><span>${documents.length} files</span></div><input id="specSearch" type="search" value="${escapeHtml(specSearch)}" placeholder="Search specifications…" aria-label="Search specifications"><div class="spec-tree-list">${tree || v3Empty(specLoading ? 'Scanning folders…' : 'No specification files found.')}</div><div class="spec-roots">${specRoots.length ? `From ${escapeHtml(specRoots.join(' · '))}` : 'Set views.specifications.roots in .projectroom/project.yaml'}</div></aside><div class="spec-browser-reader"><div class="spec-reader-toolbar"><div><strong>${escapeHtml(selected?.path.split('/').pop() || 'Select a file')}</strong><small>${escapeHtml(selected?.path || 'The full folder is shown on the left.')}</small></div>${selected?.previewable ? `<button class="btn small" data-v3="spec-raw">${specRaw ? 'Preview' : 'Source'}</button>` : ''}</div><div class="spec-reader-content">${content}</div></div></section></div>`;
}
function documentationBrowser() {
  const root = projectConfig.product?.docsRoot || 'docs/product';
  const documents = docEntries.filter(item => item.type === 'file');
  const selected = documents.find(item => item.path === docSelectedPath);
  const visible = item => ![...docCollapsed].some(folder => item.path.startsWith(folder + '/')) && (!docSearch || item.path.toLowerCase().includes(docSearch) || item.type === 'directory' && documents.some(file => file.path.startsWith(item.path + '/') && file.path.toLowerCase().includes(docSearch)));
  const tree = docEntries.filter(visible).map(item => `<button type="button" class="spec-tree-item ${item.type === 'directory' ? 'directory' : ''} ${item.path === docSelectedPath ? 'active' : ''}" style="padding-left:${12 + item.depth * 16}px" data-v3="${item.type === 'directory' ? 'doc-folder' : 'doc-open'}" data-doc-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">${icon(item.type === 'directory' ? 'folder' : 'doc')}<span>${escapeHtml(item.path.split('/').pop())}</span>${item.type === 'directory' ? `<small>${docCollapsed.has(item.path) ? '▸' : '▾'}</small>` : ''}</button>`).join('');
  const emptyMessage = docRootMissing ? `The documentation folder ${root} does not exist yet.` : `There are no documents in ${root} yet.`;
  const content = !documents.length && !docLoading ? `<div class="docs-browser-empty"><strong>No documentation yet</strong><p>${escapeHtml(emptyMessage)}</p><button class="btn primary small" data-v3="product-new-doc">${icon('plus')} Create first document</button></div>` : !selected ? v3Empty(docLoading ? 'Loading documentation folder…' : 'Choose a document from the folder tree.') : docSelectedText === null ? v3Empty('Loading file…') : productEditingPath === selected.path ? productEditor(selected.path, docSelectedText) : docRaw ? `<pre class="spec-source">${escapeHtml(docSelectedText)}</pre>` : specMarkdown(docSelectedText);
  return `<section class="card spec-browser docs-browser"><aside class="spec-browser-tree"><div class="spec-browser-title"><strong>DOCUMENTATION FOLDER</strong><span>${documents.length} files</span></div><input id="docSearch" type="search" value="${escapeHtml(docSearch)}" placeholder="Search documentation…" aria-label="Search documentation"><div class="spec-tree-list">${tree || v3Empty(docLoading ? 'Scanning folder…' : docRootMissing ? 'Folder not found.' : 'No Markdown files found.')}</div><div class="spec-roots">From ${escapeHtml(root)}</div></aside><div class="spec-browser-reader"><div class="spec-reader-toolbar"><div><strong>${escapeHtml(selected?.path.split('/').pop() || 'Select a file')}</strong><small>${escapeHtml(selected?.path || 'The documentation folder is shown on the left.')}</small></div><div class="docs-reader-actions">${selected && productEditingPath !== selected.path ? `<button class="btn small" data-v3="doc-raw">${docRaw ? 'Preview' : 'Source'}</button>` : ''}${selected && /\.md$/i.test(selected.path) ? `<button class="btn small" data-v3="product-edit-doc">${productEditingPath === selected.path ? 'Close editor' : 'Edit Markdown'}</button>` : ''}</div></div><div class="spec-reader-content">${content}</div></div></section>`;
}
async function openDocumentation(relative, navigate = true) {
  docSelectedPath = relative;
  productSelectedDoc = relative;
  docSelectedText = null;
  docRaw = false;
  if (navigate) state.page = 'docs';
  if (state.page === 'docs') render();
  try {
    const content = pv && projectRoot ? await pv.readFile(relative) : await fetch('./' + relative.split('/').map(encodeURIComponent).join('/')).then(response => { if (!response.ok) throw new Error(`File unavailable (${response.status}).`); return response.text(); });
    if (docSelectedPath === relative) { docSelectedText = content; productContents.documents[relative] = content; if (state.page === 'docs') render(); }
  } catch (error) { if (docSelectedPath === relative) { docSelectedText = `Unable to read ${relative}: ${error.message}`; docRaw = true; if (state.page === 'docs') render(); } }
}
async function refreshDocumentation() {
  const version = ++docLoadVersion;
  docLoading = true;
  docEntries = [];
  if (state.page === 'docs') render();
  try {
    const result = pv && projectRoot ? await pv.listDocumentation() : await fetch('./docs-manifest.json').then(response => { if (!response.ok) throw new Error('Documentation manifest unavailable.'); return response.json(); });
    if (version !== docLoadVersion) return;
    docEntries = result.entries || [];
    window.updateProjectRoomNavCounts?.();
    docRootMissing = !!result.missing;
    docLoading = false;
    const first = docEntries.find(item => item.type === 'file');
    if (!docEntries.some(item => item.path === docSelectedPath && item.type === 'file')) docSelectedPath = first?.path || null;
    if (docSelectedPath) await openDocumentation(docSelectedPath, false);
    else if (state.page === 'docs') render();
  } catch (error) { if (version === docLoadVersion) { docLoading = false; if (state.page === 'docs') { render(); toast(error.message); } } }
}
async function openSpecification(relative, navigate = true) {
  specSelectedPath = relative;
  specSelectedText = null;
  specRaw = false;
  if (navigate) state.page = 'spec';
  if (state.page === 'spec') render();
  const item = specEntries.find(entry => entry.path === relative);
  if (!item?.previewable) return;
  try {
    const content = pv && projectRoot ? await pv.readFile(relative) : await fetch('./' + relative.split('/').map(encodeURIComponent).join('/')).then(response => { if (!response.ok) throw new Error(`File unavailable (${response.status}).`); return response.text(); });
    if (specSelectedPath === relative) { specSelectedText = content; if (state.page === 'spec') render(); }
  } catch (error) { if (specSelectedPath === relative) { specSelectedText = `Unable to read ${relative}: ${error.message}`; specRaw = true; if (state.page === 'spec') render(); } }
}
async function refreshSpecifications() {
  const version = ++specLoadVersion;
  specLoading = true;
  specEntries = [];
  specRoots = [];
  if (state.page === 'spec') render();
  try {
    const result = pv && projectRoot ? await pv.listSpecifications() : await fetch('./spec-manifest.json').then(response => { if (!response.ok) throw new Error('Specification manifest unavailable.'); return response.json(); });
    if (version !== specLoadVersion) return;
    specEntries = result.entries || [];
    specRoots = result.roots || [];
    specKit = result.specKit || { detected: false, features: [], bugs: [], ideas: [] };
    window.updateProjectRoomNavCounts?.();
    specLoading = false;
    const first = specEntries.find(item => item.type === 'file');
    if (!specEntries.some(item => item.path === specSelectedPath && item.type === 'file')) specSelectedPath = first?.path || null;
    if (specSelectedPath) await openSpecification(specSelectedPath, false);
    if (state.page === 'issues') render();
    else if (!specSelectedPath && state.page === 'spec') render();
  } catch (error) { if (version === specLoadVersion) { specLoading = false; if (state.page === 'spec') { render(); toast(error.message); } } }
}
function dataPage() {
  const sources = projectConfig.components.filter(x => ['database', 'storage', 'external'].includes(x.kind));
  return `${pageHead('Data Explorer', 'Configured databases, storage and external dependencies.')}
  <section class="card"><div class="card-head"><div><h2>Data Explorer</h2><p>Connection values come from environment variables; viewers are external</p></div></div>${sources.map(c => `<div class="env-row"><div class="service-icon blue">${icon(c.icon || 'database')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)} ${badge('Configured', 'off')}</div><div class="service-sub">${escapeHtml(c.data?.engine || c.data?.path || c.url || c.kind)} · ${escapeHtml(c.data?.connectionEnv || 'No credential variable')}</div></div><button class="btn small" data-v3="inspect:${escapeHtml(c.id)}">Details</button></div>`).join('') || v3Empty('No data sources configured.')}</section>`;
}
function filesPageV3() {
  return `${pageHead('Files', 'Browse the project configuration and source tree.', '<button type="button" class="btn" data-cursor-refresh-files>Refresh files</button><button type="button" class="btn" data-cursor-explorer-open>Show explorer</button>')}
  <section class="card file-layout"><div class="code-view"><div class="code-header"><span>${escapeHtml(selectedFilePath)}</span><span>${projectRoot ? 'Local file' : 'Demo'}</span></div><pre>${escapeHtml(selectedFileText ?? files[selectedFilePath] ?? '').split('\n').map((line, i) => `<span class="ln">${i + 1}</span>${line}`).join('\n')}</pre></div></section>`;
}
function productWorkItems() {
  const features = specKit.features || [];
  const bugs = specKit.bugs || [];
  const ideas = specKit.ideas || [];
  const records = [
    ...features.map(item => ({ key: item.spec, type: 'feature', title: item.title, status: item.stage, stage: item.stage, source: 'Spec Kit', directory: item.directory, main: item.spec, artifacts: item.artifacts.map(name => `${item.directory}/${name}`), feature: item })),
    ...bugs.map(item => ({ key: item.main, type: 'bug', title: item.title, status: item.artifacts.at(-1).replace('.md', '') + ' recorded', stage: item.artifacts.at(-1).replace('.md', ''), source: 'Spec Kit', directory: item.directory, main: item.main, artifacts: item.artifacts.map(name => `${item.directory}/${name}`) })),
    ...ideas.map(item => ({ key: item.main, type: 'idea', title: item.title, status: item.artifacts.at(-1).replace('.md', '') + ' recorded', stage: item.artifacts.at(-1).replace('.md', ''), source: 'Spec Kit', directory: item.directory, main: item.main, artifacts: item.artifacts.map(name => `${item.directory}/${name}`) }))
  ];
  const linked = new Set();
  const local = localBacklog.issues.map(issue => {
    const record = records.find(item => issue.spec && (issue.spec === item.main || issue.spec.startsWith(item.directory + '/')));
    if (record) linked.add(record.key);
    return { ...record, ...issue, key: issue.id, source: (issue.demo ? 'Demo sample' : 'Local backlog') + (record ? ' + Spec Kit' : ''), artifacts: record?.artifacts || [], feature: record?.feature || null, stage: record?.stage || '', main: record?.main || null, local: true };
  });
  return [...local, ...records.filter(item => !linked.has(item.key))];
}
function issuesPage() {
  const items = productWorkItems();
  const filtered = items.filter(item => workFilter === 'all' || item.type === workFilter);
  const selected = filtered.find(item => item.key === selectedWork) || filtered[0];
  const filters = [['all', 'All'], ['idea', 'Ideas'], ['feature', 'Features'], ['bug', 'Bugs']];
  const artifact = selected?.artifacts.includes(selectedWorkArtifact) ? selectedWorkArtifact : null;
  const detail = selected ? `<section class="card work-detail"><div class="work-detail-head"><div><span class="work-kind">${escapeHtml(selected.type)} · ${escapeHtml(selected.source)}</span><h2>${escapeHtml(selected.title)}</h2><p>${escapeHtml(selected.stage || selected.status)}${selected.local ? ' · ' + escapeHtml(selected.id) : ''}</p></div>${selected.local ? `<button class="btn small" data-v3="backlog-edit" data-issue-id="${escapeHtml(selected.id)}">Edit</button>` : ''}</div>${selected.feature ? `<div class="work-facts"><span>${selected.feature.tasks.done}/${selected.feature.tasks.total} tasks</span><span>${selected.feature.requirementIds.length} requirements</span><span>${selected.feature.successIds.length} success criteria</span><span>${selected.feature.checklists.done}/${selected.feature.checklists.total} checklist items</span></div><div class="work-evidence"><div><strong>Built components</strong>${selected.feature.components.map(item => `<span>${escapeHtml(item.name)} · ${escapeHtml(item.status)}</span>`).join('') || '<span>No linked components</span>'}</div><div><strong>Test evidence</strong>${selected.feature.tests.map(item => `<span>${escapeHtml(item.name)} · ${escapeHtml(item.result)}</span>`).join('') || '<span>No linked tests</span>'}</div></div>` : ''}${selected.local && selected.description ? `<div class="work-description">${specMarkdown(selected.description)}</div>` : ''}${selected.artifacts.length ? `<div class="work-artifacts"><strong>Repository files</strong><div>${selected.artifacts.map(file => `<button class="btn small ${artifact === file ? 'active' : ''}" data-v3="work-artifact" data-work-path="${escapeHtml(file)}">${escapeHtml(file.split('/').pop())}</button>`).join('')}</div></div>` : `<p class="work-file-note">${selected.demo ? "Sample item · edits stay in this session." : `No Spec Kit files linked. This entry stays in ${escapeHtml(localBacklog.root)}/.`}</p>`}${artifact ? `<div class="work-file"><div class="work-file-path">${escapeHtml(artifact)}</div>${selectedWorkText === null ? '<p>Loading file…</p>' : specMarkdown(selectedWorkText)}</div>` : !selected.local && selected.main ? `<button class="btn small" data-v3="work-artifact" data-work-path="${escapeHtml(selected.main)}">Read ${escapeHtml(selected.main.split('/').pop())}</button>` : ''}${selected.feature?.checks?.length ? `<div class="spec-kit-checks">${selected.feature.checks.map(check => `<div class="${escapeHtml(check.level)}">${escapeHtml(check.message)}</div>`).join('')}</div>` : ''}</section>` : `<section class="card work-detail work-detail-empty"><h2>No work yet</h2><p>Create a local entry or add Spec Kit files to this repository.</p></section>`;
  const list = filtered.map(item => `<button class="work-row ${item.key === selected?.key ? 'active' : ''}" data-v3="work-select" data-work-key="${escapeHtml(item.key)}"><span class="work-row-top"><span class="work-kind">${escapeHtml(item.type)}</span><span class="work-status">${escapeHtml(item.status)}</span></span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.local ? item.id + ' · ' + item.source : item.source + ' · ' + item.stage)}</small></button>`).join('') || '<p class="work-list-empty">No items in this filter.</p>';
  return `<div class="backlog-shell">${pageHead('Backlog', 'Ideas, features and bugs from this repository and Spec Kit.', v3Button(icon('plus') + ' New item', 'backlog-new', true))}<div class="work-filters" role="group" aria-label="Filter backlog by type">${filters.map(([value, label]) => `<button type="button" data-v3="work-filter" data-work-filter="${value}" class="${workFilter === value ? 'active' : ''}">${label}<span>${value === 'all' ? items.length : items.filter(item => item.type === value).length}</span></button>`).join('')}</div><div class="work-layout"><section class="card work-list" aria-label="Backlog items">${list}</section>${detail}</div><p class="work-footnote">${projectRoot ? `Spec Kit files stay in their original folders. Local entries are saved in ${escapeHtml(localBacklog.root)}/; link an existing artifact to show both as one item.` : 'Interactive sample · edits stay in this browser session.'}</p></div>`;
}
async function refreshBacklog() {
  localBacklog = pv && projectRoot ? await pv.listBacklog() : { root: projectConfig.product?.backlogRoot || 'backlog', missing: true, issues: localBacklog.issues };
  window.updateProjectRoomNavCounts?.();
  if (state.page === 'issues' || state.page === 'dashboard') render();
}
function backlogModal(item = null) {
  const selected = (name, value) => item?.[name] === value ? 'selected' : '';
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal product-modal backlog-modal" role="dialog" aria-modal="true" aria-label="${item ? 'Edit issue' : 'New issue'}"><div class="modal-head"><h2>${item ? `Edit ${escapeHtml(item.id)}` : 'New backlog issue'}</h2><button class="icon-btn" data-v3="product-close" aria-label="Close">×</button></div><form id="backlogForm"><div class="modal-body"><label for="backlogTitle">Title</label><input id="backlogTitle" name="title" required maxlength="120" value="${escapeHtml(item?.title || '')}" placeholder="What needs attention?"><div class="backlog-form-grid"><div><label for="backlogType">Type</label><select id="backlogType" name="type">${['feature', 'bug', 'task', 'idea'].map(value => `<option value="${value}" ${selected('type', value)}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></div><div><label for="backlogStatus">Status</label><select id="backlogStatus" name="status">${[['inbox', 'Inbox'], ['planned', 'Planned'], ['in-progress', 'In progress'], ['done', 'Done']].map(([value, label]) => `<option value="${value}" ${selected('status', value)}>${label}</option>`).join('')}</select></div><div><label for="backlogPriority">Priority</label><select id="backlogPriority" name="priority">${['low', 'medium', 'high'].map(value => `<option value="${value}" ${item ? selected('priority', value) : value === 'medium' ? 'selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></div></div><label for="backlogDescription">Description</label><textarea id="backlogDescription" name="description" placeholder="Describe the problem, desired outcome and acceptance criteria.">${escapeHtml(item?.description || '')}</textarea><label for="backlogSpec">Spec Kit file <small>optional</small></label><input id="backlogSpec" name="spec" value="${escapeHtml(item?.spec || '')}" placeholder="specs/feature-name/spec.md or .specify/bugs/name/assessment.md"><p class="product-modal-hint">Saved as one Markdown file per issue in ${escapeHtml(localBacklog.root)}/.</p></div><div class="modal-actions"><button type="button" class="btn" data-v3="product-close">Cancel</button><button type="submit" class="btn primary">Save issue</button></div></form></div></div>`;
  document.getElementById('backlogForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { ...(item ? { id: item.id } : {}), title: data.get('title'), type: data.get('type'), status: data.get('status'), priority: data.get('priority'), description: data.get('description'), spec: data.get('spec') };
    try {
      if (pv && projectRoot) { await pv.saveBacklogIssue(payload); await refreshBacklog(); await refreshHistory(); }
      else { const id = item?.id || `PV-${String(localBacklog.issues.reduce((max, issue) => Math.max(max, Number(issue.id.slice(3))), 0) + 1).padStart(3, '0')}`; localBacklog.issues = item ? localBacklog.issues.map(issue => issue.id === id ? { ...issue, ...payload } : issue) : [...localBacklog.issues, { id, ...payload }]; render(); }
      document.getElementById('modalRoot').innerHTML = '';
      toast(projectRoot ? 'Issue saved in the repository.' : 'Issue saved for this demo session.');
    } catch (cause) { toast(cause.message); }
  };
  document.getElementById('backlogTitle')?.focus();
}
function activityPage() {
  const events = projectRoot ? pvHistory : demoEvents;
  return `${pageHead('Activity', 'Project history, test runs, command output and external agent sessions.', v3Button(icon('activity') + ' Refresh', 'refresh-history'))}
  <section class="card"><div class="card-head"><div><h2>History</h2><p>${projectRoot ? 'Saved in .productview/events.jsonl · commit after reviewing private data' : 'Sample events for this interactive demo'}</p></div></div>${events.map(e => `<div class="env-row"><div class="service-icon ${e.type.startsWith('agent.') ? 'blue' : 'green'}">${icon(e.type.startsWith('agent.') ? 'terminal' : e.type.startsWith('test.') ? 'flask' : 'activity')}</div><div class="service-meta"><div class="service-title">${escapeHtml(e.type.replaceAll('.', ' · '))} ${e.demo ? badge('Demo', 'off') : ''}</div><div class="service-sub">${escapeHtml([e.client, e.component, e.path, e.tool, e.log, e.exitCode !== undefined ? 'exit ' + e.exitCode : null].filter(Boolean).join(' · '))}</div></div><div class="muted event-time">${escapeHtml(new Date(e.at).toLocaleString('en-GB'))}</div></div>`).join('') || v3Empty('No events yet. Start a service, run tests, or connect an agent.')}</section>`;
}
function guidePage(embedded = false) {
  const tabs = [['skill', 'Skill text'], ['product', 'Product context'], ['mcp', 'MCP connection'], ['schema', 'YAML schema'], ['example', 'Current YAML']];
  let content = 'Loading agent contract…';
  if (pvContract) {
    if (pvGuideTab === 'skill') content = pvContract.skill;
    if (pvGuideTab === 'schema') content = pvContract.schema;
    if (pvGuideTab === 'example') content = pvContract.example || 'Open a project folder to see its .projectroom/project.yaml.';
    if (pvGuideTab === 'product') content = JSON.stringify({ product: projectConfig.product || null, vision: productContents.vision, backlog: localBacklog, documentation: (projectConfig.product?.documentation || []).map(item => ({ ...item, content: productContents.documents[item.path] ?? null })) }, null, 2);
    if (pvGuideTab === 'mcp') content = pv ? JSON.stringify({ mcpServers: { 'product-view': pvContract.mcp } }, null, 2) : 'The local desktop app provides the MCP launch command for each project.\n\nTools: get_product_view, get_product_context, list_components, read_project_file, get_product_history.\n\nConnections and tool calls appear in Activity.';
  }
  return `${embedded ? '' : pageHead('Agent Access', 'Exactly what an external coding agent can read and how it should configure Project Room.')}
  <section class="card"><div class="card-head"><div><h2>Agent Access</h2><p>Shareable skill, read-only MCP tools, schema and project YAML</p></div></div><div class="guide-tabs">${tabs.map(([id, title]) => `<button class="${pvGuideTab === id ? 'active' : ''}" data-v3="guide:${id}">${title}</button>`).join('')}</div><pre class="guide-code">${escapeHtml(content)}</pre></section>`;
}
renderPanel = function () {
  const panel = document.getElementById('chatPanel');
  if (!panel) return;
  panel.querySelectorAll('[data-panel-tab]').forEach(b => b.classList.toggle('active', b.dataset.panelTab === panelTab));
  const body = panel.querySelector('#panelBody');
  if (panelTab === 'inspector') {
    const c = currentComponent(selectedComponent);
    if (!c) body.innerHTML = `<div class="panel-empty"><strong>Select a component</strong><p>Click a card to inspect its configuration.</p></div>`;
    else {
      const [status, kind] = v3Status(c);
      const fields = c.kind === 'service' ? [['Command', (c.runtime?.command || []).join(' ')], ['Port', c.runtime?.port ? ':' + c.runtime.port : '—'], ['Startup', c.runtime?.startup || 'manual'], ['Health', c.runtime?.health || '—']] : c.kind === 'commandTool' ? [['Command', (c.runtime?.command || []).join(' ')], ['Mode', c.cli?.mode || 'server'], ['Protocol', c.cli?.protocol || 'other'], ['Usage', c.cli?.usage || '—']] : c.kind === 'testSuite' ? [['Command', (c.tests?.command || []).join(' ')], ['Categories', (c.tests?.categories || []).join(', ') || '—']] : c.kind === 'database' ? [['Engine', c.data?.engine || '—'], ['Credential variable', c.data?.connectionEnv || '—'], ['Viewer', c.data?.viewer || '—']] : [['Path', c.path || c.data?.path || c.url || '—']];
      const edges = runtimeMapConnections().filter(e => e.from === c.id || e.to === c.id);
      body.innerHTML = `<div class="inspector-kind">${escapeHtml(kindLabels[c.kind] || c.kind)}</div><div class="inspector-title">${escapeHtml(c.name)}</div>${badge(status, kind)}<div class="inspector-actions">${c.kind === 'service' ? v3Button(icon(status.startsWith('Running') ? 'stop' : 'play') + (status.startsWith('Running') ? ' Stop' : ' Start'), 'service:' + c.id, true) : ''}${c.kind === 'commandTool' ? `<button class="btn primary small" data-v5="open:${escapeHtml(c.id)}">Open workbench</button>` : ''}${c.runtime?.url ? v3Button('Open Preview', 'preview:' + c.id) : ''}${c.kind === 'testSuite' ? v3Button(icon('play') + ' Run', 'test:' + c.id, true) : ''}</div><div class="inspector-block"><h3>Configuration</h3>${fields.map(([key, value]) => `<div class="inspector-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}<div class="inspector-row"><span>ID</span><strong>${escapeHtml(c.id)}</strong></div></div><div class="inspector-block"><h3>Connections · ${edges.length}</h3>${edges.map(e => { const other = currentComponent(e.from === c.id ? e.to : e.from); return `<div class="inspector-row"><span>${escapeHtml(e.label)}</span><strong>${escapeHtml(other?.name || '—')}</strong></div>`; }).join('') || '<p class="muted">No connections</p>'}</div>`;
    }
  } else body.innerHTML = `<div class="chat-messages">${chatMessages.length ? chatMessages.map(m => `<div class="chat-message ${m.role}">${escapeHtml(m.text)}</div>`).join('') : `<div class="panel-empty" style="min-height:220px;height:auto"><div class="panel-symbol">${icon('cube')}</div><strong>Talk to your product</strong><p>Ask about components, connections or next steps. Answers use the local configuration; no AI model is connected.</p></div>`}</div><div class="chat-suggestions"><button data-v3="ask:Which components exist?">Explain components</button><button data-v3="ask:Which tests are configured?">Show tests</button></div>`;
  panel.querySelector('.chat-composer').classList.toggle('hidden', panelTab !== 'chat');
};
answerChat = function (input) {
  const q = input.toLowerCase();
  if (/roadmap|milestone|vision|documentation|product direction/.test(q)) return `Vision: ${productContents.vision?.replace(/^#.*\n/, '').trim().slice(0, 240) || 'No vision document loaded.'} Roadmap: ${(projectConfig.product?.roadmap || []).map(item => `${item.title} (${item.status})`).join('; ') || 'no items yet'}. Documentation: ${(projectConfig.product?.documentation || []).map(item => item.title).join(', ') || 'none'}.`;
  if (/component|architecture|map/.test(q)) return `This project has ${projectConfig.components.length} components and ${projectConfig.connections.length} connections: ${projectConfig.components.map(c => c.name).join(', ')}. Click a card for details.`;
  if (/test|performance/.test(q)) return `${projectConfig.components.filter(c => c.kind === 'testSuite').length} test suite(s) are configured. Use the Test Explorer page to run them in the desktop app. Results are saved in .productview/.`;
  if (/spec|requirement|vision/.test(q)) return `Specification files: ${projectConfig.components.filter(c => c.kind === 'specification').map(c => c.path).join(', ') || 'none configured'}.`;
  return 'I can explain the components, connections, tests and specifications in .projectroom/project.yaml. This is a local demo response; no Codex or Claude model is connected.';
};
sendChat = function (input) { const message = input.trim(); if (!message) return; const reply = answerChat(message); chatMessages.push({ role: 'user', text: message }, { role: 'assistant', text: reply }); if (pv && projectRoot) pv.recordChat(message, reply).then(refreshHistory).catch(err => toast(err.message)); panelTab = 'chat'; renderPanel(); };

render = function () {
  if (state.page === 'spec') state.page = 'issues';
  document.body.classList.toggle('dashboard-page', ['dashboard', 'product', 'vision', 'north-star', 'roadmap', 'docs', 'commands'].includes(state.page));
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
  document.getElementById('crumb').textContent = pageNames[state.page];
  document.getElementById('runningCount').textContent = projectRoot ? Object.values(desktopStatus).filter(x => x === 'running').length : state.services.filter(s => s.running).length;
  document.getElementById('content').innerHTML = ({ dashboard: dashboardPage, onboarding: () => window.onboardingPage(), product: () => productPage('vision'), vision: () => productPage('vision'), 'north-star': () => productPage('north-star'), roadmap: () => productPage('roadmap'), docs: () => productPage('docs'), overview: projectMap, runtime: runtimePage, commands: () => commandToolsPage(), tests: testsPage, data: dataPage, environment: () => window.environmentPage(), files: filesPageV3, issues: issuesPage, activity: activityPage, agent: guidePage })[state.page]();
  document.querySelector('.breadcrumb').innerHTML = workspaceBreadcrumb(pageNames[state.page]);
  document.querySelector('.branch').innerHTML = `${icon('git')} main <span style="color:#bac3ce">·</span> ${escapeHtml(projectConfig.project?.version || 'local')}`;
  document.title = pageNames[state.page] + ' · Project Room';
  renderPanel();
  if (state.page === 'overview') requestAnimationFrame(drawConnections);
};
async function refreshHistory() { if (pv && projectRoot) { pvHistory = await pv.listHistory(); if (state.page === 'activity' || state.page === 'overview' || state.page === 'dashboard') render(); } }
async function refreshWorkspaces() { pvWorkspaces = pv ? await pv.listProjects() : [{ root: 'demo', name: 'Blackbox Agent B' }]; }
async function refreshContract() {
  pvContract = pv ? await pv.getAgentContract() : { skill: await fetch('./agent-skill.md').then(x => x.text()), schema: await fetch('./projectroom.schema.json').then(x => x.text()), example: await fetch('./.projectroom/project.yaml').then(x => x.text()) };
  if (state.page === 'agent' || state.page === 'settings') render();
}
function workspaceMenu() {
  document.getElementById('workspaceMenu')?.remove();
  document.getElementById('workspaceCrumb')?.setAttribute('aria-expanded', String(pvWorkspaceMenu));
  if (!pvWorkspaceMenu) return;
  document.body.insertAdjacentHTML('beforeend', `<div id="workspaceMenu" class="workspace-menu"><div class="workspace-menu-title">PROJECTS</div>${pvWorkspaces.map((x, i) => `<button data-v3="open-workspace:${i}"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.root === 'demo' ? 'Interactive demo' : x.root)}</small></button>`).join('')}<div class="workspace-menu-divider"></div><button data-v3="open-existing">${icon('folder')} Open project folder</button><button data-v3="open-example">${icon('play')} Try working example</button><details class="workspace-menu-more"><summary>More setup options</summary><button data-v3="find-workspaces">${icon('search')} Find projects in a folder</button><button data-v3="new-agent">${icon('plus')} Set up folder with a coding agent</button><button data-v3="new-auto">${icon('plus')} Create minimal config from folder</button><button data-v3="new-blank">${icon('plus')} Create blank project config</button></details></div>`);
  const anchor = document.getElementById('workspaceCrumb') || document.getElementById('projectPicker');
  const menu = document.getElementById('workspaceMenu');
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${rect.bottom + 7}px`;
}
function workspaceBreadcrumb(page) {
  const name = projectConfig.project?.name || 'Project';
  return `<button type="button" class="workspace-crumb" id="workspaceCrumb" data-v3="workspace" aria-label="Switch project, current ${escapeHtml(name)}" aria-haspopup="menu" aria-expanded="${pvWorkspaceMenu}" title="Switch project"><span>${escapeHtml(name)}</span>${icon('chevron')}</button><span class="breadcrumb-divider">/</span><strong id="crumb">${escapeHtml(page)}</strong>`;
}
async function loadWorkspace(data) { if (!data) return; if (data.onboarding) { pvWorkspaceMenu = false; workspaceMenu(); window.showAgentOnboarding(data); return; } setProject(data); await Promise.all([refreshHistory(), refreshWorkspaces(), refreshContract()]); pvWorkspaceMenu = false; workspaceMenu(); render(); }
async function applyProductProject(data, page = state.page) { setProject(data); state.page = page; await refreshProductContents(); render(); }
function northStarModal(mode, selectedDate = null) {
  const metric = projectConfig.product?.northStar;
  const defining = mode === 'define';
  const existing = metric?.measurements?.find(item => item.date === selectedDate);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const heading = defining ? (metric ? 'Edit North Star' : 'Define your North Star') : (existing ? 'Edit measurement' : 'Record a measurement');
  const fields = defining ? `<p class="north-star-form-intro">Choose one number that reflects the value people get from the product. Start with a manual measurement; you can connect a data source later.</p><label for="northStarName">Metric name</label><input id="northStarName" name="name" required maxlength="100" value="${escapeHtml(metric?.name || '')}" placeholder="e.g. Weekly active teams"><label for="northStarDescription">What does it count?</label><textarea id="northStarDescription" name="description" maxlength="240" placeholder="Define exactly when a team counts.">${escapeHtml(metric?.description || '')}</textarea><div class="north-star-form-row"><div><label for="northStarUnit">Unit</label><input id="northStarUnit" name="unit" required maxlength="24" value="${escapeHtml(metric?.unit || '')}" placeholder="teams"></div><div><label for="northStarCadence">Record it</label><select id="northStarCadence" name="cadence">${['daily', 'weekly', 'monthly'].map(value => `<option value="${value}" ${metric?.cadence === value || !metric && value === 'weekly' ? 'selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></div><div><label for="northStarTarget">Target <small>optional</small></label><input id="northStarTarget" name="target" type="number" step="any" value="${typeof metric?.target === 'number' ? metric.target : ''}" placeholder="—"></div></div>` : `<p class="north-star-form-intro">Enter the observed ${escapeHtml(metric?.name || 'North Star value')} in ${escapeHtml(metric?.unit || 'units')}. One value is kept for each date.</p><label for="northStarDate">Measurement date</label><input id="northStarDate" name="date" type="date" required max="${today}" value="${escapeHtml(existing?.date || today)}" ${existing ? 'readonly' : ''}><label for="northStarValue">Value · ${escapeHtml(metric?.unit || '')}</label><input id="northStarValue" name="value" type="number" step="any" required value="${existing ? existing.value : ''}" placeholder="0"><label for="northStarNote">Note <small>optional</small></label><textarea id="northStarNote" name="note" maxlength="240" placeholder="Where did this number come from?">${escapeHtml(existing?.note || '')}</textarea>`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal product-modal north-star-modal" role="dialog" aria-modal="true" aria-label="${heading}"><div class="modal-head"><h2>${heading}</h2><button class="icon-btn" data-v3="product-close" aria-label="Close">×</button></div><form id="northStarForm"><div class="modal-body">${fields}</div><div class="modal-actions"><button type="button" class="btn" data-v3="product-close">Cancel</button><button type="submit" class="btn primary">${defining ? 'Save metric' : 'Save measurement'}</button></div></form></div></div>`;
  document.getElementById('northStarForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      if (defining) {
        const rawTarget = String(form.get('target') || '').trim();
        const payload = { name: String(form.get('name') || '').trim(), description: String(form.get('description') || '').trim(), unit: String(form.get('unit') || '').trim(), cadence: String(form.get('cadence') || 'weekly'), ...(rawTarget ? { target: Number(rawTarget) } : {}) };
        if (pv && projectRoot) await applyProductProject(await pv.upsertNorthStar(payload), 'vision');
        else { projectConfig.product.northStar = { ...payload, measurements: metric?.measurements || [] }; render(); }
      } else {
        const payload = { date: String(form.get('date') || ''), value: Number(form.get('value')), note: String(form.get('note') || '').trim() };
        if (!Number.isFinite(payload.value)) throw new Error('Enter a valid number.');
        if (pv && projectRoot) await applyProductProject(await pv.recordNorthStar(payload), 'vision');
        else { const entries = projectConfig.product.northStar.measurements.filter(item => item.date !== payload.date); entries.push(payload); projectConfig.product.northStar.measurements = entries.sort((a, b) => a.date.localeCompare(b.date)); render(); }
      }
      document.getElementById('modalRoot').innerHTML = '';
      toast(projectRoot ? 'North Star saved in .projectroom/project.yaml.' : 'North Star saved for this demo session.');
    } catch (cause) { toast(cause.message); }
  };
  document.getElementById(defining ? 'northStarName' : 'northStarValue')?.focus();
}
function productModal(type, item = null) {
  const roadmap = type === 'roadmap';
  const fields = roadmap ? `<label for="productTitle">Title</label><input id="productTitle" name="title" required maxlength="120" value="${escapeHtml(item?.title || '')}" placeholder="What outcome should this deliver?"><label for="productSummary">Summary</label><textarea id="productSummary" name="summary" maxlength="500" placeholder="Why does this matter?">${escapeHtml(item?.summary || '')}</textarea><label for="productStatus">Status</label><select id="productStatus" name="status">${[['draft', 'Draft'], ['planned', 'Planned'], ['in-progress', 'In progress'], ['done', 'Done']].map(([value, label]) => `<option value="${value}" ${item?.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="product-related-label">Related components</div><div class="product-related">${projectConfig.components.map(c => `<label><input type="checkbox" name="related" value="${escapeHtml(c.id)}" ${(item?.relatedComponents || []).includes(c.id) ? 'checked' : ''}>${escapeHtml(c.name)}</label>`).join('')}</div>` : `<label for="productTitle">Document title</label><input id="productTitle" name="title" required maxlength="120" placeholder="e.g. User guide"><label for="productSummary">Summary</label><textarea id="productSummary" name="summary" maxlength="240" placeholder="What will readers find here?"></textarea><p class="product-modal-hint">Creates a Markdown file under ${escapeHtml(projectConfig.product?.docsRoot || 'docs/product')}.</p>`;
  document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal product-modal" role="dialog" aria-modal="true" aria-label="${roadmap ? 'Roadmap item' : 'New document'}"><div class="modal-head"><h2>${roadmap ? (item ? 'Edit roadmap item' : 'New roadmap item') : 'New documentation page'}</h2><button class="icon-btn" data-v3="product-close" aria-label="Close">×</button></div><form id="productForm"><div class="modal-body">${fields}</div><div class="modal-actions"><button type="button" class="btn" data-v3="product-close">Cancel</button><button type="submit" class="btn primary">${roadmap ? 'Save roadmap item' : 'Create document'}</button></div></form></div></div>`;
  document.getElementById('productForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = { title: String(form.get('title') || '').trim(), summary: String(form.get('summary') || '').trim() };
    try {
      if (roadmap) {
        payload.id = item?.id;
        payload.status = String(form.get('status') || 'draft');
        payload.relatedComponents = form.getAll('related').map(String);
        if (pv && projectRoot) await applyProductProject(await pv.upsertRoadmap(payload), 'roadmap');
        else { const entries = projectConfig.product.roadmap; const id = item?.id || payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; const next = { ...payload, id }; if (item) projectConfig.product.roadmap = entries.map(x => x.id === id ? next : x); else entries.push(next); render(); }
      } else if (pv && projectRoot) {
        const created = await pv.createProductDocument(payload);
        productSelectedDoc = created.path;
        docSelectedPath = created.path;
        await applyProductProject(created.project, 'docs');
      } else {
        const id = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
        const path = `${projectConfig.product.docsRoot}/${id}.md`;
        if (projectConfig.product.documentation.some(x => x.path === path)) throw new Error('A document with this title already exists.');
        projectConfig.product.documentation.push({ ...payload, id, path });
        productContents.documents[path] = `# ${payload.title}\n\nWrite the purpose, decisions and usage here.\n`;
        productSelectedDoc = path;
        docSelectedPath = path;
        docEntries.push({ path, type: 'file', depth: 1, previewable: true });
        docSelectedText = productContents.documents[path];
        render();
      }
      document.getElementById('modalRoot').innerHTML = '';
      toast(projectRoot ? 'Saved in the repository.' : 'Saved in this demo session.');
    } catch (cause) { toast(cause.message); }
  };
  document.getElementById('productTitle')?.focus();
}
document.addEventListener('input', event => {
  if (event.target.id === 'productEditor') productDraft = event.target.value;
  if (event.target.id === 'specSearch') {
    specSearch = event.target.value.toLowerCase();
    document.querySelectorAll('.spec-tree-item').forEach(button => {
      const item = button.dataset.specPath.toLowerCase();
      button.hidden = Boolean(specSearch) && !item.includes(specSearch) && !specEntries.some(entry => entry.type === 'file' && entry.path.toLowerCase().includes(specSearch) && entry.path.toLowerCase().startsWith(item + '/'));
    });
  }
  if (event.target.id === 'docSearch') {
    docSearch = event.target.value.toLowerCase();
    document.querySelectorAll('.docs-browser .spec-tree-item').forEach(button => {
      const item = button.dataset.docPath.toLowerCase();
      button.hidden = Boolean(docSearch) && !item.includes(docSearch) && !docEntries.some(entry => entry.type === 'file' && entry.path.toLowerCase().includes(docSearch) && entry.path.toLowerCase().startsWith(item + '/'));
    });
  }
});
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-v3]');
  if (!target) { if (pvWorkspaceMenu && !event.target.closest('#workspaceMenu')) { pvWorkspaceMenu = false; workspaceMenu(); } return; }
  event.preventDefault(); event.stopImmediatePropagation();
  const [action, arg] = target.dataset.v3.split(':');
  try {
    if (action === 'page') { state.page = arg; if (arg === 'files') { selectedFilePath = '.projectroom/project.yaml'; selectedFileText = files['.projectroom/project.yaml'] || ''; } render(); }
    else if (action === 'workspace') { await refreshWorkspaces(); pvWorkspaceMenu = !pvWorkspaceMenu; workspaceMenu(); }
    else if (action === 'open-workspace') { if (pv) await loadWorkspace(await pv.openProject(pvWorkspaces[Number(arg)].root)); else toast('Open a project in the desktop app.'); }
    else if (action === 'open-existing') { if (pv) await loadWorkspace(await pv.chooseProject()); else toast('Open a project folder in the desktop app.'); }
    else if (action === 'open-example') { if (pv) await loadWorkspace(await pv.openExampleProject()); else toast('The working example is available in the desktop app.'); }
    else if (action === 'new-agent') { if (pv) await loadWorkspace(await pv.prepareOnboarding()); else toast('Agent setup is available in the desktop app.'); }
    else if (action === 'find-workspaces') { if (!pv) return toast('Project discovery is available in the desktop app.'); const found = await pv.discoverProjects(); pvWorkspaces = [...found, ...pvWorkspaces.filter(x => !found.some(y => y.root === x.root))]; workspaceMenu(); toast(`${found.length} project(s) found.`); }
    else if (action === 'new-auto' || action === 'new-blank') { if (pv) await loadWorkspace(await pv.createProject(action === 'new-blank' ? 'blank' : 'auto')); else toast('Create a project config in the desktop app.'); }
    else if (action === 'guide') { pvGuideTab = arg; render(); }
    else if (action === 'product-setup') { if (!pv || !projectRoot) return toast('Open a project folder first.'); await applyProductProject(await pv.setupProduct()); toast('Product Hub added to this repository.'); }
    else if (action === 'product-edit-vision' || action === 'product-edit-doc') { const path = action === 'product-edit-vision' ? projectConfig.product?.vision : productSelectedDoc; if (!path) return; productEditingPath = productEditingPath === path ? null : path; productDraft = productEditingPath ? (path === projectConfig.product.vision ? productContents.vision : productContents.documents[path] ?? docSelectedText) || '' : ''; render(); if (action === 'product-edit-vision' && productEditingPath) document.getElementById('productEditor')?.focus(); }
    else if (action === 'product-doc') { const path = target.dataset.docPath; if (productEditingPath && productDraft !== (productEditingPath === projectConfig.product.vision ? productContents.vision : productContents.documents[productEditingPath])) return toast('Save or cancel your current edit before switching documents.'); productEditingPath = null; productSelectedDoc = path; render(); }
    else if (action === 'product-cancel') { productEditingPath = null; productDraft = ''; render(); }
    else if (action === 'product-save') { const path = productEditingPath; if (!path) return; if (pv && projectRoot) await pv.saveProductDocument(path, productDraft); if (path === projectConfig.product.vision) productContents.vision = productDraft; else { productContents.documents[path] = productDraft; if (docSelectedPath === path) docSelectedText = productDraft; } productEditingPath = null; productDraft = ''; render(); toast(projectRoot ? 'Markdown saved in the repository.' : 'Markdown saved in this demo session.'); }
    else if (action === 'backlog-new') backlogModal();
    else if (action === 'backlog-edit') backlogModal(localBacklog.issues.find(issue => issue.id === target.dataset.issueId));
    else if (action === 'work-filter') { workFilter = target.dataset.workFilter; selectedWork = productWorkItems().find(item => workFilter === 'all' || item.type === workFilter)?.key || null; selectedWorkArtifact = null; selectedWorkText = null; render(); }
    else if (action === 'work-select') { selectedWork = target.dataset.workKey; selectedWorkArtifact = null; selectedWorkText = null; render(); }
    else if (action === 'work-artifact') { const file = target.dataset.workPath; selectedWorkArtifact = file; selectedWorkText = null; render(); try { selectedWorkText = pv && projectRoot ? await pv.readFile(file) : await fetch('./' + file.split('/').map(encodeURIComponent).join('/')).then(response => { if (!response.ok) throw new Error(`File unavailable (${response.status}).`); return response.text(); }); } catch (error) { selectedWorkText = `Unable to read ${file}: ${error.message}`; } if (selectedWorkArtifact === file && state.page === 'issues') render(); }
    else if (action === 'product-new-doc') productModal('document');
    else if (action === 'product-new-roadmap') productModal('roadmap');
    else if (action === 'product-roadmap') productModal('roadmap', projectConfig.product?.roadmap?.find(x => x.id === target.dataset.roadmapId));
    else if (action === 'north-star-define') northStarModal('define');
    else if (action === 'north-star-record') northStarModal('record');
    else if (action === 'north-star-edit-record') northStarModal('record', target.dataset.metricDate);
    else if (action === 'product-close') document.getElementById('modalRoot').innerHTML = '';
    else if (action === 'spec-open') await openSpecification(target.dataset.specPath);
    else if (action === 'spec-folder') { const path = target.dataset.specPath; if (specCollapsed.has(path)) specCollapsed.delete(path); else specCollapsed.add(path); render(); }
    else if (action === 'spec-raw') { specRaw = !specRaw; render(); }
    else if (action === 'doc-open') { if (productEditingPath && productDraft !== (productContents.documents[productEditingPath] ?? docSelectedText)) return toast('Save or cancel your current edit before switching documents.'); productEditingPath = null; await openDocumentation(target.dataset.docPath); }
    else if (action === 'doc-folder') { const path = target.dataset.docPath; if (docCollapsed.has(path)) docCollapsed.delete(path); else docCollapsed.add(path); render(); }
    else if (action === 'doc-raw') { docRaw = !docRaw; render(); }
    else if (action === 'doc-refresh') await refreshDocumentation();
    else if (action === 'spec-refresh') await refreshSpecifications();
    else if (action === 'metric') { dashboardMetric = arg; render(); }
    else if (action === 'service-metric') { serviceMetricType = arg; render(); }
    else if (action === 'service-metrics') { serviceMetricSelected = arg; state.page = 'runtime'; render(); document.querySelector('.service-metric-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (action === 'map-view') {
      mapDisplay = ['map', 'list', 'source'].includes(arg) ? arg : 'map';
      if (mapDisplay !== 'source') { render(); return; }
      const request = ++mapSourceRequest;
      mapSourceText = null; mapSourceError = null; render();
      try {
        const source = pv && projectRoot ? await pv.readFile(activeConfigPath) : await fetch('./.projectroom/project.yaml').then(response => { if (!response.ok) throw new Error(`File unavailable (${response.status}).`); return response.text(); });
        if (request !== mapSourceRequest) return;
        mapSourceText = source;
        files[activeConfigPath] = source;
        if (selectedFilePath === activeConfigPath) selectedFileText = source;
      } catch (cause) { if (request !== mapSourceRequest) return; mapSourceError = `Could not read ${activeConfigPath}: ${cause.message}`; }
      if (state.page === 'overview') render();
    }
    else if (action === 'refresh-history') await refreshHistory();
    else if (action === 'service-status') { if (pv && projectRoot) { const result = await pv.checkComponentStatus(arg); desktopStatus[arg] = result.status; render(); } }
    else if (action === 'service') { const c = currentComponent(arg); if (!c) return; if (pv && projectRoot) { const running = desktopStatus[arg] === 'running'; const result = running ? await pv.stopComponent(arg) : await pv.startComponent(arg); desktopStatus[arg] = result.status; await refreshHistory(); } else { const s = state.services.find(x => x.id === arg || (arg === 'web' && x.id === 'app')); if (s) s.running = !s.running; toast('Service state simulated.'); } render(); }
    else if (action === 'test') { if (pv && projectRoot) { const result = await pv.runTestSuite(arg); await refreshHistory(); toast(result.exitCode === 0 ? 'Tests passed.' : `Tests failed · exit ${result.exitCode}`); } else toast('Test run simulated.'); }
    else if (action === 'preview') { const url = currentComponent(arg)?.runtime?.url; if (pv && projectRoot && url) await pv.openLocalUrl(url); else toast('Local previews open in a connected project.'); }
    else if (action === 'inspect') { selectedComponent = arg; panelTab = 'inspector'; renderPanel(); window.setProductChatOpen?.(true); }
    else if (action === 'file') { selectedFilePath = arg; selectedFileText = arg === activeConfigPath ? (files[activeConfigPath] || '') : pv ? await pv.readFile(arg) : (files[arg] || 'Open this file in a local project.'); state.page = 'files'; render(); }
    else if (action === 'ask') sendChat(arg);
    else if (action === 'fit' || action === 'zoom-in' || action === 'zoom-out') { mapZoom = action === 'fit' ? 1 : Math.max(.75, Math.min(1.25, mapZoom + (action === 'zoom-in' ? .1 : -.1))); render(); }
  } catch (cause) { toast(cause.message); }
}, true);
document.getElementById('projectPicker').dataset.v2 = '';
let metricRenderTimer = null;
if (pv?.onProcessEvent) pv.onProcessEvent(event => {
  if (event.type === 'status' && event.status === 'stopped') {
    const service = window.projectRoomMetrics?.services?.[event.id];
    if (service) service.running = false;
    return;
  }
  if (!projectRoot || !['metrics', 'metrics-total', 'metrics-error'].includes(event.type)) return;
  const model = window.projectRoomMetrics || (window.projectRoomMetrics = { services: {}, totals: [] });
  if (event.type === 'metrics') {
    const service = model.services[event.id] || (model.services[event.id] = { running: true, samples: [], error: null });
    service.samples.push(event.point);
    if (service.samples.length > 20000) service.samples.splice(0, 10000, ...service.samples.slice(0, 10000).filter((_, index) => index % 2 === 0));
    service.running = true;
    service.error = null;
  } else if (event.type === 'metrics-total') {
    model.totals.push(event.point);
    if (model.totals.length > 20000) model.totals.splice(0, 10000, ...model.totals.slice(0, 10000).filter((_, index) => index % 2 === 0));
  }
  if (state.page === 'dashboard' || state.page === 'runtime') {
    clearTimeout(metricRenderTimer);
    metricRenderTimer = setTimeout(() => render(), 180);
  }
});
document.getElementById('projectPicker').dataset.v3 = 'workspace';
document.getElementById('settingsBtn').dataset.v2 = '';
document.getElementById('settingsBtn').dataset.v3 = 'page:files';
document.querySelector('#nav [data-page="agent"]').addEventListener('click', () => { state.page = 'agent'; render(); });
document.querySelector('[data-page="activity"]').addEventListener('click', () => refreshHistory().catch(() => {}));
if (pv?.onProcessEvent) pv.onProcessEvent(event => { if (event.type === 'status' || event.type === 'log') refreshHistory().catch(() => {}); if (event.type === 'status') refreshSpecifications().catch(() => {}); });
const priorSetProject = setProject;
setProject = function (data) { const startPage = data?.config?.workspace?.startPage; ++mapSourceRequest; mapSourceText = typeof data?.raw === 'string' ? data.raw : null; mapSourceError = null; productContents = { vision: null, documents: {} }; productEditingPath = null; productDraft = ''; specSelectedPath = null; specSelectedText = null; specKit = { detected: false, features: [], bugs: [], ideas: [] }; specCollapsed.clear(); specSearch = ''; docSelectedText = null; docCollapsed.clear(); docSearch = ''; localBacklog = { root: data?.config?.product?.backlogRoot || 'backlog', missing: true, issues: data?.root ? [] : demoBacklog.map(item => ({ ...item })) }; workFilter = 'all'; selectedWork = null; selectedWorkArtifact = null; selectedWorkText = null; state.page = startPage === 'map' ? 'overview' : startPage === 'overview' ? 'dashboard' : pageNames[startPage] ? startPage : 'dashboard'; priorSetProject(data); refreshProductContents().catch(error => toast(error.message)); refreshSpecifications().catch(error => toast(error.message)); refreshDocumentation().catch(error => toast(error.message)); refreshBacklog().catch(error => toast(error.message)); refreshHistory().catch(() => {}); refreshContract().catch(() => {}); refreshWorkspaces().catch(() => {}); };
if (!pv && !projectRoot) { localBacklog.issues = demoBacklog.map(item => ({ ...item })); refreshSpecifications().catch(() => {}); }
document.getElementById('notifications').onclick = () => toast('No new notifications.');
document.getElementById('notifications').setAttribute('aria-label', 'Notifications');
refreshWorkspaces().catch(() => {});
refreshContract().catch(err => toast(err.message));
refreshProductContents().catch(() => {});
refreshDocumentation().catch(() => {});
render();
