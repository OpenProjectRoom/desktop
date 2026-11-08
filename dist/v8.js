/* Personal appearance and repository-scoped workspace settings. */
(() => {
  const themeKey = 'productview.appearance.v1';
  const optionalViews = [
    { page: 'vision', label: 'Vision', description: 'Read and edit the product vision when you need it.' },
    { page: 'roadmap', label: 'Roadmap', description: 'Plan product milestones and follow their status.' },
    { page: 'north-star', label: 'North Star', description: 'Track one product outcome and record its progress.' },
    { page: 'commands', label: 'CLI Explorer', description: 'Discover local command-line tools, inspect help and link them to this project.' }
  ];
  const viewEnabled = page => !optionalViews.some(view => view.page === page) || (projectConfig.workspace?.additionalViews || []).includes(page);
  const applyViewVisibility = () => {
    for (const view of optionalViews) {
      document.querySelectorAll(`#nav [data-page="${view.page}"], #cursorOpenMenu [data-page="${view.page}"], #content [data-page="${view.page}"]`).forEach(button => { button.hidden = !viewEnabled(view.page); });
    }
    const onboardingComplete = window.projectRoomOnboardingComplete?.() || false;
    document.querySelectorAll('#nav [data-page="onboarding"], #cursorOpenMenu [data-page="onboarding"]').forEach(button => { button.hidden = onboardingComplete; });
    document.body.classList.toggle('optional-commands-enabled', viewEnabled('commands'));
  };
  window.productViewOptionalViewEnabled = viewEnabled;
  const themeChoices = ['system', 'light', 'dark'];
  let theme = 'system';
  try { const saved = localStorage.getItem(themeKey); if (themeChoices.includes(saved)) theme = saved; } catch (_) {}
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => { document.body.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme; };
  applyTheme();
  media.addEventListener?.('change', () => { if (theme === 'system') applyTheme(); });

  const avatar = document.querySelector('.user-avatar');
  avatar.outerHTML = '<button class="user-avatar profile-trigger" id="profileButton" type="button" aria-label="Open personal menu" aria-haspopup="menu" aria-expanded="false" title="Personal settings">BS</button>';
  const profileButton = document.getElementById('profileButton');
  const profileMenu = document.createElement('div');
  profileMenu.id = 'profileMenu';
  profileMenu.className = 'profile-menu';
  profileMenu.hidden = true;
  profileMenu.innerHTML = '<div class="profile-menu-head"><strong>Personal</strong><span>Project Room</span></div><button type="button" data-v8="open:personal">Personal settings</button><button type="button" data-v8="open:project">Project connections</button>';
  document.body.append(profileMenu);
  const showMenu = open => { profileMenu.hidden = !open; profileButton.setAttribute('aria-expanded', String(open)); };
  profileButton.addEventListener('click', event => { event.stopPropagation(); showMenu(profileMenu.hidden); });

  const settingsButton = document.getElementById('settingsBtn');
  settingsButton.removeAttribute('data-v2');
  settingsButton.removeAttribute('data-v3');
  settingsButton.title = 'Settings';
  settingsButton.querySelector('span').textContent = 'Settings';
  settingsButton.addEventListener('click', () => openSettings('personal'));

  pageNames.settings = 'Settings';
  let tab = 'personal';
  let editorId = null;
  let versionStatus = null;
  const versionDetails = () => {
    if (!pv?.checkForUpdates) return '<p>Update checks are available in the installed desktop app.</p>';
    if (!versionStatus) return '<p>Loading version information…</p>';
    const checked = versionStatus.lastCheckedAt ? new Date(versionStatus.lastCheckedAt).toLocaleString() : null;
    const buildSource = versionStatus.buildType === 'official' ? 'Official GitHub release'
      : versionStatus.buildType === 'local' ? 'Built locally' : 'Development checkout';
    const status = versionStatus.buildType === 'local' ? 'Update checks are disabled for local builds.'
      : !versionStatus.enabled ? 'Update checks are unavailable in this development build.'
      : versionStatus.phase === 'checking' ? 'Checking for updates…'
      : versionStatus.phase === 'downloading' ? `Downloading v${value(versionStatus.version)} · ${Number(versionStatus.percent) || 0}%`
      : versionStatus.phase === 'ready' ? `Version ${value(versionStatus.version)} is ready to install.`
      : versionStatus.message ? `Could not check: ${value(versionStatus.message)}`
      : checked ? `Up to date · checked ${value(checked)}` : 'No update check completed yet.';
    return `<div class="settings-key-value"><span>Installed version</span><strong>${value(versionStatus.currentVersion || 'Unknown')}</strong></div><div class="settings-key-value"><span>Build source</span><strong>${buildSource}</strong></div><p role="status">${status}</p>${versionStatus.enabled ? `<div class="settings-version-actions"><button type="button" class="btn" data-v8="check-version" ${['checking', 'downloading', 'ready'].includes(versionStatus.phase) ? 'disabled' : ''}>Check now</button>${versionStatus.phase === 'ready' ? '<button type="button" class="btn primary" data-v8="install-version">Restart to update</button>' : ''}</div>` : ''}${versionStatus.phase === 'ready' ? '<small>Restarting stops local processes started by Project Room.</small>' : ''}`;
  };
  const updateVersionPanel = () => { const panel = document.getElementById('settingsVersionDetails'); if (panel) panel.innerHTML = versionDetails(); };
  pv?.onUpdateState?.(state => { versionStatus = { ...versionStatus, ...state }; updateVersionPanel(); });
  const loadVersionStatus = async () => { if (!pv?.updateStatus) return; try { versionStatus = await pv.updateStatus(); updateVersionPanel(); } catch (error) { versionStatus = { enabled: false, message: error.message }; updateVersionPanel(); } };
  const sourceList = () => projectConfig.components.filter(item => item.kind === 'issues');
  const sourceUrl = item => item.integration?.url || (item.integration?.provider === 'github' && item.integration?.repository ? `https://github.com/${item.integration.repository}` : '');
  const value = text => escapeHtml(text || '');
  const settingsButtonHtml = (label, action, active) => `<button type="button" data-v8="${action}" class="${active ? 'active' : ''}">${label}</button>`;
  const sourceEditor = () => {
    if (editorId === null) return '';
    const source = sourceList().find(item => item.id === editorId);
    const integration = source?.integration || {};
    const provider = integration.provider || 'github';
    return `<form class="card source-editor" id="issueSourceForm"><div class="card-head"><div><h2>${source ? 'Edit issue source' : 'Add issue source'}</h2><p>${projectRoot ? 'Saved in .projectroom/project.yaml in the selected repository.' : 'Previewed in this demo session only.'}</p></div></div><div class="source-editor-body"><label>Display name<input name="name" required maxlength="100" value="${value(source?.name)}" placeholder="Product Backlog"></label><label>Provider<select name="provider" id="sourceProvider"><option value="github" ${provider === 'github' ? 'selected' : ''}>GitHub Issues</option><option value="linear" ${provider === 'linear' ? 'selected' : ''}>Linear</option></select></label><label class="settings-field" data-provider-field="github" ${provider !== 'github' ? 'hidden' : ''}>Repository<input name="repository" value="${value(integration.repository)}" placeholder="owner/repository"></label><label class="settings-field" data-provider-field="linear" ${provider !== 'linear' ? 'hidden' : ''}>Linear team ID<input name="teamId" value="${value(integration.teamId)}" placeholder="Team ID from Linear"></label><label>Source URL <small>optional, for opening the source</small><input name="url" type="url" value="${value(integration.url)}" placeholder="https://…"></label><div class="source-editor-actions"><button type="button" class="btn" data-v8="cancel">Cancel</button><button type="submit" class="btn primary">${projectRoot ? 'Save to repository' : 'Save in demo'}</button></div></div></form>`;
  };
  const featureSettings = () => `<section class="card settings-card optional-views-card"><div class="settings-icon">${icon('grid')}</div><div><h2>Additional views</h2><p>Choose which specialist pages appear for this project.</p><div class="optional-views-list">${optionalViews.map(view => `<label class="optional-view-row"><span><strong>${view.label}</strong><small>${view.description}</small></span><input type="checkbox" data-optional-view="${view.page}" ${viewEnabled(view.page) ? 'checked' : ''} aria-label="Show ${view.label} in navigation"><i aria-hidden="true"></i></label>`).join('')}</div><small>${projectRoot ? 'Saved in .projectroom/project.yaml so coding agents and teammates see the same navigation.' : 'Demo changes last only in this session. A local project saves these choices in .projectroom/project.yaml.'}</small></div></section>`;
  const personal = () => `<div class="settings-grid"><section class="card settings-card"><div class="settings-icon">${icon('settings')}</div><div><h2>Appearance</h2><p>Choose how Project Room looks on this computer.</p><div class="settings-choice" role="group" aria-label="Appearance">${themeChoices.map(choice => settingsButtonHtml(choice[0].toUpperCase() + choice.slice(1), `theme:${choice}`, theme === choice)).join('')}</div><small>System follows this computer’s light or dark appearance setting.</small></div></section><section class="card settings-card"><div class="settings-icon">${icon('activity')}</div><div><h2>Version & updates</h2><div id="settingsVersionDetails">${versionDetails()}</div></div></section>${featureSettings()}</div><p class="settings-footnote">Appearance stays on this computer. Additional views are shared through the project YAML.</p>`;
  const onboardingSettings = () => `<section class="card settings-card"><div class="settings-icon">${icon('check')}</div><div><h2>Onboarding</h2><p>${window.projectRoomOnboardingComplete?.() ? 'Completed for this project on this computer.' : 'Review configured sections and verify the parts you use.'}</p><button type="button" class="btn" data-v8="open-onboarding">${window.projectRoomOnboardingComplete?.() ? 'Reopen onboarding' : 'Open onboarding'}</button><small>Your completion and verification checks stay on this computer.</small></div></section>`;
  const project = () => `<div class="settings-grid"><section class="card settings-card"><div class="settings-icon">${icon('folder')}</div><div><h2>Project configuration</h2><p>Shared settings that coding agents and teammates can read.</p><div class="settings-key-value"><span>Project</span><strong>${value(projectConfig.project?.name)}</strong></div><div class="settings-key-value"><span>Repository</span><strong>${value(projectConfig.project?.repository || 'Not set')}</strong></div><div class="settings-key-value"><span>Configuration file</span><code>${value(activeConfigPath)}</code></div></div></section>${onboardingSettings()}<section class="card settings-card settings-source-card"><div class="settings-icon">${icon('list')}</div><div><div class="settings-section-head"><div><h2>Issue sources</h2><p>GitHub and Linear locations for this project.</p></div><button type="button" class="btn" data-v8="add">${icon('plus')} Add source</button></div>${sourceList().map(item => `<div class="settings-source"><div><strong>${value(item.name)}</strong><span>${value(item.integration?.provider === 'github' ? 'GitHub Issues' : 'Linear')} · ${value(item.integration?.repository || item.integration?.teamId || 'Location missing')}</span>${sourceUrl(item) ? `<small>${value(sourceUrl(item))}</small>` : ''}</div><span class="settings-connection-state">Not connected</span><button type="button" class="btn small" data-v8="edit:${value(item.id)}">Edit</button></div>`).join('') || '<p>No issue sources configured.</p>'}<p class="settings-source-note">The desktop app saves these locations in the repository. The web demo keeps edits in this session only.</p></div></section>${sourceEditor()}<section class="card settings-card"><div class="settings-icon">${icon('git')}</div><div><h2>How access will work</h2><p>The repository stores provider, repository or team ID, and an optional display URL. Credentials must stay outside Git. A future connection flow will authorize access locally and a read-only adapter will fetch issues. No live issue synchronization or sign-in is available in this prototype.</p></div></section></div>`;
  const settingsPage = () => `<div class="settings-shell"><div class="page-head"><div><div class="eyebrow">PROJECT ROOM / SETTINGS</div><h1>Settings</h1><p>Preferences, project connections and agent access.</p></div></div><div class="settings-tabs" role="tablist" aria-label="Settings sections">${settingsButtonHtml('Preferences', 'tab:personal', tab === 'personal')}${settingsButtonHtml('Project & Connections', 'tab:project', tab === 'project')}${settingsButtonHtml('AI & Chat', 'tab:chat', tab === 'chat')}${settingsButtonHtml('Agent Access', 'tab:agent', tab === 'agent')}</div>${tab === 'personal' ? personal() : tab === 'agent' ? guidePage(true) : tab === 'chat' ? (window.productViewChatSettings?.() || '') : project()}</div>`;
  const baseRender = render;
  render = function () {
    if (state.page === 'onboarding' && window.projectRoomOnboardingComplete?.()) state.page = 'dashboard';
    if (!viewEnabled(state.page)) state.page = 'dashboard';
    applyViewVisibility();
    if (state.page === 'agent') { tab = 'agent'; state.page = 'settings'; }
    if (state.page !== 'settings') { settingsButton.classList.remove('active'); const result = baseRender(); applyViewVisibility(); return result; }
    document.body.classList.add('dashboard-page');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.remove('active'));
    settingsButton.classList.add('active');
    document.querySelector('.breadcrumb').innerHTML = workspaceBreadcrumb('Settings');
    document.getElementById('content').innerHTML = settingsPage();
    document.title = 'Settings · Project Room';
    renderPanel();
  };
  function openSettings(section) { tab = section; editorId = null; state.page = 'settings'; showMenu(false); render(); if (section === 'personal') loadVersionStatus(); window.scrollTo(0, 0); }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-v8]');
    if (!target) { if (!event.target.closest('#profileMenu, #profileButton')) showMenu(false); return; }
    const [action, arg] = target.dataset.v8.split(':');
    if (action === 'open') openSettings(arg);
    else if (action === 'tab') { tab = arg; editorId = null; render(); if (arg === 'personal') loadVersionStatus(); }
    else if (action === 'open-onboarding') { window.projectRoomReopenOnboarding?.(); state.page = 'onboarding'; render(); window.scrollTo(0, 0); }
    else if (action === 'check-version') { try { versionStatus = { ...versionStatus, phase: 'checking', message: null }; updateVersionPanel(); versionStatus = await pv.checkForUpdates(); updateVersionPanel(); } catch (error) { versionStatus = { ...versionStatus, phase: 'idle', message: error.message }; updateVersionPanel(); } }
    else if (action === 'install-version') { try { await pv.installUpdate(); } catch (error) { toast(error.message); } }
    else if (action === 'theme' && themeChoices.includes(arg)) { theme = arg; try { localStorage.setItem(themeKey, theme); } catch (_) {} applyTheme(); render(); }
    else if (action === 'add') { editorId = ''; render(); document.querySelector('[name="name"]')?.focus(); }
    else if (action === 'edit') { editorId = arg; render(); document.querySelector('[name="name"]')?.focus(); }
    else if (action === 'cancel') { editorId = null; render(); }
  });
  document.addEventListener('change', async event => {
    const optionalView = event.target.dataset?.optionalView;
    if (optionalView && optionalViews.some(view => view.page === optionalView)) {
      const enabled = event.target.checked;
      event.target.disabled = true;
      try {
        if (pv && projectRoot) { setProject(await pv.setAdditionalView(optionalView, enabled)); state.page = 'settings'; }
        else { const views = new Set(projectConfig.workspace?.additionalViews || []); if (enabled) views.add(optionalView); else views.delete(optionalView); projectConfig.workspace = { ...(projectConfig.workspace || {}), additionalViews: [...views] }; }
        render();
      } catch (error) { event.target.checked = !enabled; event.target.disabled = false; toast(error.message); }
      return;
    }
    if (event.target.id !== 'sourceProvider') return;
    document.querySelectorAll('[data-provider-field]').forEach(field => { field.hidden = field.dataset.providerField !== event.target.value; });
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'issueSourceForm') return;
    event.preventDefault();
    const data = new FormData(event.target);
    const input = { id: editorId || undefined, name: String(data.get('name') || '').trim(), provider: String(data.get('provider') || ''), repository: String(data.get('repository') || '').trim(), teamId: String(data.get('teamId') || '').trim(), url: String(data.get('url') || '').trim() };
    try {
      if (input.provider === 'github' && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) throw new Error('Use owner/repository for GitHub.');
      if (input.provider === 'linear' && !input.teamId) throw new Error('Enter the Linear team ID.');
      if (input.url && new URL(input.url).protocol !== 'https:') throw new Error('Source URL must use HTTPS.');
      if (pv && projectRoot) {
        const updated = await pv.upsertIssueSource(input);
        setProject(updated);
        state.page = 'settings';
      } else {
        const existing = sourceList().find(item => item.id === input.id);
        const integration = { provider: input.provider, ...(input.provider === 'github' ? { repository: input.repository } : { teamId: input.teamId }), ...(input.url ? { url: input.url } : {}) };
        if (existing) { existing.name = input.name; existing.integration = integration; }
        else { const id = 'issues-demo-' + (sourceList().length + 1); projectConfig.components.push({ id, kind: 'issues', name: input.name, icon: 'list', position: { x: 68, y: 650 }, integration }); projectConfig.connections.push({ from: id, to: 'product-spec', label: 'informs' }); }
      }
      editorId = null; tab = 'project'; render(); toast(projectRoot ? 'Issue source saved in .projectroom/project.yaml.' : 'Issue source saved for this demo session.');
    } catch (error) { toast(error.message); }
  });
})();

/* Workspace navigation and repository-backed map editing. */
(() => {
  const nav = document.getElementById('nav');
  const navButton = (page, symbol, label, extra = '') => `<button type="button" data-page="${page}" title="${label}">${icon(symbol)}<span>${label}</span>${extra}</button>`;
  nav.innerHTML = `
    <div class="nav-section-label">PROJECT</div>
    ${navButton('dashboard', 'grid', 'Overview')}
    ${navButton('overview', 'cube', 'Project Map')}
    ${navButton('files', 'folder', 'Files')}
    ${navButton('onboarding', 'check', 'Onboarding')}
    <div class="nav-section-label">PRODUCT</div>
    ${navButton('vision', 'doc', 'Vision')}
    ${navButton('north-star', 'clock', 'North Star')}
    ${navButton('roadmap', 'activity', 'Roadmap')}
    ${navButton('issues', 'list', 'Backlog')}
    ${navButton('docs', 'folder', 'Documentation')}
    <div class="nav-section-label">RUN & VERIFY</div>
    ${navButton('applications', 'grid', 'Applications')}
    ${navButton('runtime', 'play', 'Services', '<span class="count" id="runningCount">0</span>')}
    ${navButton('commands', 'terminal', 'CLI Explorer')}
    ${navButton('mcp', 'cube', 'MCP Explorer')}
    ${navButton('api', 'activity', 'API Explorer')}
    ${navButton('tests', 'flask', 'Test Explorer')}
    ${navButton('data', 'database', 'Data Explorer')}
    ${navButton('environment', 'settings', 'Environment')}
    <div class="nav-divider" aria-hidden="true"></div>
    ${navButton('activity', 'activity', 'Activity')}`;
  document.querySelectorAll('.sidebar > .nav-label, .sidebar > .nav:not(#nav)').forEach(element => element.remove());
  document.querySelector('.sidebar-bottom [data-v3="workspace"]')?.remove();
  pageNames.agent = 'Agent Access';

  const modalRoot = document.getElementById('modalRoot');
  const fields = {
    application: `<label>Platform<select name="platform" id="mapAppPlatform"><option value="web">Web</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label><label>Executable<input name="executable" required placeholder="npm"></label><label>Arguments <small>one argument per line</small><textarea name="args" rows="3" placeholder="run\ndev"></textarea></label><label>Target <small>optional, e.g. iOS Simulator</small><input name="target" maxlength="120"></label><label data-app-web>Local URL <small>optional, for web apps</small><input name="url" placeholder="http://127.0.0.1:3000"></label><label>Port <small>optional</small><input name="port" type="number" min="1" max="65535" placeholder="3000"></label>`,
    service: `<label>Executable<input name="executable" required placeholder="npm"></label><label>Arguments <small>one argument per line</small><textarea name="args" rows="3" placeholder="run\ndev"></textarea></label><label>Port <small>optional</small><input name="port" type="number" min="1" max="65535" placeholder="3000"></label>`,
    database: `<label>Engine<select name="engine" id="mapDatabaseEngine"><option value="PostgreSQL">PostgreSQL</option><option value="MySQL">MySQL</option><option value="MariaDB">MariaDB</option><option value="SQLite">SQLite</option></select></label><label data-db-config="remote">Connection variable <small>name only; never a secret</small><input name="connectionEnv" pattern="[A-Z][A-Z0-9_]*" placeholder="DATABASE_URL"></label><label data-db-config="sqlite" hidden>Relative database file<input name="path" placeholder="data/app.sqlite"></label>`,
    storage: `<label>Relative path<input name="path" required placeholder="data/uploads"></label>`,
    testSuite: `<label>Executable<input name="executable" required placeholder="npm"></label><label>Arguments <small>one argument per line</small><textarea name="args" rows="3" placeholder="test"></textarea></label>`,
    specification: `<label>Relative Markdown path<input name="path" required placeholder="specs/feature.md"></label>`,
    external: `<label>URL<input name="url" required type="url" placeholder="https://example.com"></label>`
  };
  function openAdd() {
    const links = runtimeMapComponents().map(component => `<option value="${escapeHtml(component.id)}">${escapeHtml(component.name)}</option>`).join('');
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal map-add-modal" role="dialog" aria-modal="true" aria-label="Add runtime component"><div class="modal-head"><h2>Add runtime component</h2><button type="button" class="icon-btn" data-v9="map:close" aria-label="Close">×</button></div><form id="mapAddForm"><div class="modal-body"><p class="map-add-note">${projectRoot ? 'Saved to .projectroom/project.yaml in this repository.' : 'Interactive demo · saved in this session only.'} The map shows applications, services, databases and storage. Add tests and CLI tools in their own views.</p><label>Name<input name="name" required maxlength="100" placeholder="e.g. Web app"></label><label>Type<select name="kind" id="mapAddKind"><option value="application">Application</option><option value="service">Service</option><option value="database">Database</option><option value="storage">Storage</option></select></label><div id="mapAddFields">${fields.application}</div><label>Connect to <small>optional</small><select name="linkedTo"><option value="">No connection yet</option>${links}</select></label></div><div class="modal-actions"><button type="button" class="btn" data-v9="map:close">Cancel</button><button type="submit" class="btn primary">${projectRoot ? 'Add to repository' : 'Add to demo'}</button></div></form></div></div>`;
    const updateDatabaseFields = () => {
      const sqlite = document.getElementById('mapDatabaseEngine')?.value === 'SQLite';
      for (const label of document.querySelectorAll('#mapAddFields [data-db-config]')) {
        label.hidden = label.dataset.dbConfig === 'sqlite' ? !sqlite : sqlite;
        const input = label.querySelector('input');
        input.disabled = label.hidden;
        input.required = !label.hidden;
      }
    };
    const updateApplicationFields = () => {
      const web = document.getElementById('mapAppPlatform')?.value === 'web';
      const label = document.querySelector('#mapAddFields [data-app-web]');
      if (label) { label.hidden = !web; label.querySelector('input').disabled = !web; }
    };
    document.getElementById('mapAddKind').addEventListener('change', event => { document.getElementById('mapAddFields').innerHTML = fields[event.target.value]; updateDatabaseFields(); updateApplicationFields(); });
    document.getElementById('mapAddFields').addEventListener('change', event => { if (event.target.id === 'mapDatabaseEngine') updateDatabaseFields(); if (event.target.id === 'mapAppPlatform') updateApplicationFields(); });
    updateDatabaseFields();
    updateApplicationFields();
    document.getElementById('mapAddForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = Object.fromEntries(new FormData(event.target));
      try {
        if (window.productView && projectRoot) {
          const updated = await window.productView.addMapComponent(form);
          setProject(updated);
          selectedComponent = updated.addedId;
        } else {
          const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';
          let id = slug;
          for (let n = 2; projectConfig.components.some(item => item.id === id); n++) id = `${slug}-${n}`;
          const position = [5, 36, 68].flatMap(x => [70, 200, 270, 340, 475, 600].map(y => ({ x, y }))).find(candidate => projectConfig.components.every(item => Math.abs(item.position.x - candidate.x) >= 25 || Math.abs(item.position.y - candidate.y) >= 118));
          if (!position) throw new Error('The map is full. Move existing components in .projectroom/project.yaml before adding another.');
          const component = { id, name: form.name.trim(), kind: form.kind, icon: { application: 'grid', database: 'database', service: 'terminal', storage: 'folder', testSuite: 'flask', specification: 'doc', external: 'cube' }[form.kind], position };
          if (form.kind === 'database') component.data = { engine: form.engine, ...(form.connectionEnv ? { connectionEnv: form.connectionEnv } : {}), ...(form.path ? { path: form.path } : {}) };
          if (form.kind === 'storage') component.data = { path: form.path };
          if (form.kind === 'specification') component.path = form.path;
          if (form.kind === 'external') component.url = form.url;
          if (['application', 'service', 'testSuite'].includes(form.kind)) {
            const command = [form.executable, ...(form.args || '').split('\n').map(x => x.trim()).filter(Boolean)];
            if (['application', 'service'].includes(form.kind)) {
              component.runtime = { command, cwd: '.', startup: 'manual', ...(form.port ? { port: Number(form.port) } : {}), ...(form.url ? { url: form.url } : {}) };
              if (form.kind === 'application') component.application = { platform: form.platform, ...(form.target ? { target: form.target } : {}) };
            }
            else component.tests = { command, cwd: '.' };
          }
          projectConfig.components.push(component);
          if (form.linkedTo) projectConfig.connections.push({ from: id, to: form.linkedTo, label: 'connected to' });
          selectedComponent = id;
        }
        modalRoot.innerHTML = '';
        state.page = 'overview';
        render();
        toast(projectRoot ? 'Component saved in .projectroom/project.yaml.' : 'Component added to this demo session.');
      } catch (error) { toast(error.message); }
    });
    document.querySelector('#mapAddForm [name="name"]').focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-v9]');
    if (!button) return;
    const action = button.dataset.v9;
    if (action === 'map:close') modalRoot.innerHTML = '';
    else if (action === 'map:add') openAdd();
  });
  render();
})();
