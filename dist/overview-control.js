/* Personal Overview controls. Project configuration stays in the repository. */
(() => {
  const sectionDefaults = { launch: true, explore: true, map: true, performance: true, work: false, cli: false, latest: false, idea: false };
  const shortcutDefaults = { mcp: true, api: true, data: true, tests: true, environment: true, commands: false };
  const sectionLabels = { launch: 'Launch controls', explore: 'Quick access', map: 'Project Map', performance: 'Performance', work: 'Product work', cli: 'CLI summary', latest: 'Latest test run', idea: 'Product idea' };
  const shortcutLabels = { mcp: 'MCP Explorer', api: 'API Explorer', data: 'Data Explorer', tests: 'Test Explorer', environment: 'Environment', commands: 'CLI Explorer' };
  const tileLabels = { mcp: 'MCP tools', api: 'APIs', data: 'Data', tests: 'Tests', environment: 'Environment', commands: 'CLI tools' };
  let editing = false;
  let loadedKey = null;
  let settings = null;
  const key = () => `project-room-overview-v1:${projectRoot || 'demo'}`;
  const defaults = () => ({ sections: { ...sectionDefaults }, shortcuts: { ...shortcutDefaults }, components: null });
  function preferences() {
    const current = key();
    if (loadedKey === current && settings) return settings;
    loadedKey = current;
    editing = false;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(current) || 'null'); } catch { /* Storage may be unavailable. */ }
    settings = defaults();
    if (saved && typeof saved === 'object') {
      for (const name of Object.keys(sectionDefaults)) if (typeof saved.sections?.[name] === 'boolean') settings.sections[name] = saved.sections[name];
      for (const name of Object.keys(shortcutDefaults)) if (typeof saved.shortcuts?.[name] === 'boolean') settings.shortcuts[name] = saved.shortcuts[name];
      if (Array.isArray(saved.components)) settings.components = [...new Set(saved.components.filter(id => typeof id === 'string'))];
    }
    return settings;
  }
  function save() {
    try { localStorage.setItem(key(), JSON.stringify(settings)); } catch { /* Preferences still work this session. */ }
  }
  const count = kind => projectConfig.components.filter(item => item.kind === kind).length;
  const availableRunnables = () => projectConfig.components.filter(item => ['application', 'service'].includes(item.kind));
  const selectedIds = () => preferences().components ?? [
    ...availableRunnables().filter(item => item.kind === 'application').slice(0, 2),
    ...availableRunnables().filter(item => item.kind === 'service').slice(0, 2)
  ].map(item => item.id);
  const choice = (action, id, title, enabled) => `<button type="button" class="overview-choice ${enabled ? 'selected' : ''}" data-overview="${action}:${escapeHtml(id)}" aria-pressed="${enabled}"><span aria-hidden="true">${enabled ? '✓' : '+'}</span>${escapeHtml(title)}</button>`;
  function editor() {
    const prefs = preferences();
    const chosen = selectedIds();
    return `<section class="card overview-editor" aria-label="Customize Overview"><div class="overview-editor-head"><div><h2>Customize Overview</h2><p>Only on this computer, for this project.</p></div><button class="btn small" data-overview="reset">Reset defaults</button></div><div class="overview-editor-grid"><div><h3>Sections</h3><div class="overview-choices">${Object.keys(sectionDefaults).filter(id => id !== 'cli' || window.productViewOptionalViewEnabled?.('commands')).map(id => choice('section', id, sectionLabels[id], prefs.sections[id])).join('')}</div></div><div><h3>Quick access</h3><div class="overview-choices">${Object.keys(shortcutDefaults).filter(id => id !== 'commands' || window.productViewOptionalViewEnabled?.('commands')).map(id => choice('shortcut', id, shortcutLabels[id], prefs.shortcuts[id])).join('')}</div>${window.productViewOptionalViewEnabled?.('commands') ? '' : '<p>Enable CLI Explorer in Settings → Additional views.</p>'}</div><div><h3>Launch controls</h3><p>Choose the apps and services you use most.</p><div class="overview-choices">${availableRunnables().map(item => choice('component', item.id, item.name, chosen.includes(item.id))).join('') || '<span class="overview-editor-empty">No applications or services configured.</span>'}</div></div></div></section>`;
  }
  function launchRow(item) {
    const [status, tone] = v3Status(item);
    const running = status.startsWith('Running');
    const busy = Boolean(buildBusy[item.id]);
    const unknown = status === 'Status unknown';
    const destination = item.kind === 'application' ? 'applications' : 'runtime';
    return `<div class="overview-launch-row"><span class="overview-launch-icon">${icon(item.icon || (item.kind === 'application' ? 'grid' : 'terminal'))}</span><div class="overview-launch-copy"><button class="overview-launch-name" data-page="${destination}">${escapeHtml(item.name)}</button><span>${badge(status, tone)}${item.runtime?.port ? `<small>:${item.runtime.port}</small>` : ''}</span><div class="overview-launch-build">${buildIdentityLine(item.id)}</div>${buildFeedback[item.id] ? `<small class="overview-launch-feedback" role="status">${escapeHtml(buildFeedback[item.id])}</small>` : ''}${serviceErrors[item.id] ? `<small class="overview-launch-error" role="alert">${escapeHtml(serviceErrors[item.id])}</small>` : ''}</div><div class="overview-launch-actions">${pv && projectRoot && item.runtime?.buildCommand ? `<button class="btn small" data-v3="rebuild:${escapeHtml(item.id)}" ${running || busy ? 'disabled' : ''} title="${running ? 'Stop before rebuilding' : 'Run the configured build command'}">${busy ? 'Building…' : 'Rebuild'}</button>` : ''}${item.runtime?.url ? `<button class="btn small" data-v3="preview:${escapeHtml(item.id)}" title="Open ${escapeHtml(item.name)}">Open</button>` : ''}${unknown ? `<button class="btn small" data-v3="service-status:${escapeHtml(item.id)}">Check</button>` : `<button class="btn small ${running ? '' : 'primary'}" data-v3="service:${escapeHtml(item.id)}" ${busy ? 'disabled' : ''}>${running ? 'Stop' : 'Start'}</button>`}</div></div>`;
  }
  function launchCard() {
    const all = availableRunnables();
    const chosen = new Set(selectedIds());
    const shown = all.filter(item => chosen.has(item.id));
    return `<section class="card overview-launch-card"><div class="card-head"><div><h2>Launch</h2><p>${all.length} applications and services · ${shown.length} shown here</p></div><button class="link" data-overview="edit">Choose →</button></div>${shown.map(launchRow).join('') || '<div class="overview-launch-empty">Choose an application or service to put its controls here.</div>'}<div class="overview-launch-foot"><button data-page="applications">Applications →</button><button data-page="runtime">Services →</button></div></section>`;
  }
  function shortcutCard() {
    const totals = { mcp: projectConfig.workspace?.mcpServers?.length || 0, api: projectConfig.workspace?.apiSources?.length || 0, data: projectConfig.components.filter(item => ['database', 'storage', 'external'].includes(item.kind)).length, tests: count('testSuite'), environment: window.projectRoomEnvironmentCount?.() || 0, commands: count('commandTool') };
    const symbols = { mcp: 'cube', api: 'activity', data: 'database', tests: 'flask', environment: 'settings', commands: 'terminal' };
    const visible = Object.keys(shortcutDefaults).filter(id => preferences().shortcuts[id] && (id !== 'commands' || window.productViewOptionalViewEnabled?.('commands')));
    return `<section class="card overview-shortcuts"><div class="card-head"><div><h2>Inspect</h2><p>Open a project tool</p></div></div><div class="overview-shortcut-grid">${visible.map(id => `<button class="overview-shortcut" data-page="${id}" aria-label="Open ${shortcutLabels[id]}"><span class="overview-shortcut-icon">${icon(symbols[id])}</span><span><strong>${tileLabels[id]}</strong><small>${totals[id]} configured</small></span><span class="overview-shortcut-arrow" aria-hidden="true">↗</span></button>`).join('') || '<p class="overview-editor-empty">Choose quick links in Customize Overview.</p>'}</div></section>`;
  }
  function optionalCards() {
    const prefs = preferences().sections;
    const runs = pvHistory.filter(event => event.type === 'test.finished');
    const latest = runs[0];
    const cards = [];
    if (prefs.work) cards.push(`<section class="card"><div class="card-head"><div><h2>Product work</h2><p>Backlog and Spec Kit</p></div><button class="link" data-page="issues">Open backlog →</button></div><div class="overview-optional-body">${productWorkItems().filter(item => item.status !== 'done').slice(0, 3).map(item => `<div>${escapeHtml(item.title)}</div>`).join('') || 'No open work.'}</div></section>`);
    if (prefs.cli && window.productViewOptionalViewEnabled?.('commands')) cards.push(`<section class="card"><div class="card-head"><div><h2>CLI Explorer</h2><p>${count('commandTool')} configured tools</p></div><button class="link" data-page="commands">Open tools →</button></div></section>`);
    if (prefs.latest) cards.push(`<section class="card"><div class="card-head"><div><h2>Latest test run</h2><p>${count('testSuite')} configured suites</p></div><button class="link" data-page="tests">Open tests →</button></div><div class="overview-optional-body">${latest ? `${latest.exitCode === 0 ? 'Passed' : 'Failed'} · ${escapeHtml(latest.component || 'Test suite')}` : 'No test runs recorded yet.'}</div></section>`);
    if (prefs.idea) cards.push(`<section class="card"><div class="card-head"><div><h2>Product idea</h2><p>Vision and documentation</p></div><button class="link" data-page="${window.productViewOptionalViewEnabled?.('vision') ? 'vision' : 'docs'}">Open →</button></div></section>`);
    return cards.length ? `<div class="overview-optional">${cards.join('')}</div>` : '';
  }
  dashboardPage = function () {
    const demo = !projectRoot;
    const prefs = preferences().sections;
    const runnables = availableRunnables();
    const running = runnables.filter(item => v3Status(item)[0].startsWith('Running')).length;
    const runs = pvHistory.filter(event => event.type === 'test.finished');
    const samples = processMetricState().totals;
    const latest = samples.at(-1);
    const stat = (title, value, note, symbol, page) => `<button class="card stat-card dashboard-stat" data-page="${page}"><div class="stat-top">${title} ${icon(symbol)}</div><div class="stat-number">${value}</div><div class="stat-foot">${note}</div></button>`;
    return `<div class="dashboard-shell overview-control">${pv && window.projectRoomIntroDemo ? `<div class="project-intro-banner"><div><strong>Interactive demo · sample data</strong><p>Explore Project Room, then open your own project folder to work with real data.</p></div><div class="project-intro-actions"><button class="btn primary" data-v3="open-existing">Open my project</button><button class="btn" data-v3="leave-demo">Done exploring</button></div></div>` : ''}${pageHead('Everything at a glance.', 'Start, inspect and check your local project from one window.', `<button class="btn small" data-overview="edit" aria-expanded="${editing}">${editing ? 'Done' : 'Customize Overview'}</button>`)}${editing ? editor() : ''}<div class="grid summary-grid overview-summary">${stat('Running', `${running}<span class="stat-denominator">/${runnables.length}</span>`, demo ? 'Sample local status' : 'Apps and services', 'play', 'applications')}${stat('Test runs', demo ? '3' : String(runs.length), demo ? 'Sample checks' : runs[0] ? `Latest ${runs[0].exitCode === 0 ? 'passed' : 'failed'}` : 'No run yet', 'flask', 'tests')}${stat('CPU · Memory', demo ? '18.6%<span class="stat-unit"> · 384 MB</span>' : latest ? `${metricLabel(latest.cpu, 'cpu')}<span class="stat-unit"> · ${metricLabel(latest.memoryBytes / 1048576, 'memory')}</span>` : '—', demo ? 'Sample measurement' : latest ? 'Project Room processes' : 'Start an app to measure', 'activity', 'activity')}</div><div class="overview-primary">${prefs.launch ? launchCard() : ''}${prefs.explore ? shortcutCard() : ''}</div><div class="overview-secondary">${prefs.map ? dashboardProjectMapPreview() : ''}${prefs.performance ? `<section class="card"><div class="card-head"><div><h2>Performance</h2><p>${demo ? 'Sample signal · last 4 hours' : 'Processes started here · this session'}</p></div><button class="link" data-page="activity">Activity →</button></div><div class="metric-wrap">${overviewMetricCharts(samples, demo)}</div></section>` : ''}</div>${optionalCards()}<div class="footer-note">${icon('clock')} ${demo ? 'Interactive demo · sample data and simulated actions' : 'Controls and integrations come from .projectroom/project.yaml · layout stays on this computer'}</div></div>`;
  };
  document.addEventListener('click', event => {
    const shortcut = event.target.closest('.overview-shortcut[data-page]');
    if (shortcut?.dataset.page === 'data') queueMicrotask(() => {
      if (state.page === 'data') window.projectRoomFocusFirstDataSource?.();
    });
    if (shortcut?.dataset.page === 'tests') queueMicrotask(() => {
      if (state.page === 'tests') window.projectRoomFocusFirstTestSuite?.();
    });
    const button = event.target.closest('[data-overview]');
    if (!button) return;
    event.preventDefault();
    const [action, id] = button.dataset.overview.split(':');
    const prefs = preferences();
    if (action === 'edit') editing = !editing;
    else if (action === 'reset') { settings = defaults(); save(); }
    else if (action === 'section' && Object.hasOwn(sectionDefaults, id)) { prefs.sections[id] = !prefs.sections[id]; save(); }
    else if (action === 'shortcut' && Object.hasOwn(shortcutDefaults, id)) { prefs.shortcuts[id] = !prefs.shortcuts[id]; save(); }
    else if (action === 'component' && availableRunnables().some(item => item.id === id)) {
      const chosen = new Set(selectedIds());
      if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
      prefs.components = [...chosen];
      save();
    }
    if (state.page === 'dashboard') render();
  });
  if (state.page === 'dashboard') render();
})();
