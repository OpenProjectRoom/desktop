/* Minimal desktop shell around Project Room's workspace pages. */
(() => {
  document.body.classList.add('cursor-shell');
  const windows = window.productView?.platform === 'win32';
  if (windows) document.body.classList.add('platform-win32');
  const shortcut = windows ? 'Ctrl+' : '⌘';
  const app = document.querySelector('.app');
  const main = document.querySelector('.main');
  const sidebar = document.querySelector('.sidebar');
  app.insertAdjacentHTML('afterbegin', `<div class="cursor-titlebar" role="toolbar" aria-label="Project controls">
    <div class="cursor-traffic" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="cursor-title"></div>
    <div class="cursor-titlebar-spacer"></div>
    <div class="cursor-open-wrap"><button type="button" id="cursorOpenToggle" class="cursor-titlebar-action" title="Open a project view" aria-label="Open a project view" aria-haspopup="menu" aria-expanded="false">${icon('grid')}<span>Open</span>${icon('chevron')}</button>
      <div id="cursorOpenMenu" class="cursor-open-menu" role="menu" aria-label="Open project view" hidden>
        <div class="cursor-open-group">Project</div>
        <button type="button" role="menuitem" data-page="dashboard">${icon('grid')}<span>Overview</span></button>
        <button type="button" role="menuitem" data-page="files">${icon('folder')}<span>Files</span><kbd>${shortcut}B</kbd></button>
        <button type="button" role="menuitem" data-page="onboarding">${icon('check')}<span>Onboarding</span></button>
        <div class="cursor-open-group">Product</div>
        <button type="button" role="menuitem" data-page="vision">${icon('doc')}<span>Vision</span></button>
        <button type="button" role="menuitem" data-page="north-star">${icon('clock')}<span>North Star</span></button>
        <button type="button" role="menuitem" data-page="roadmap">${icon('activity')}<span>Roadmap</span></button>
        <button type="button" role="menuitem" data-page="issues">${icon('list')}<span>Backlog</span></button>
        <button type="button" role="menuitem" data-page="docs">${icon('folder')}<span>Documentation</span></button>
        <div class="cursor-open-group">Run &amp; Verify</div>
        <button type="button" role="menuitem" data-page="applications">${icon('grid')}<span>Applications</span></button>
        <button type="button" role="menuitem" data-page="runtime">${icon('play')}<span>Services</span></button>
        <button type="button" role="menuitem" data-page="commands">${icon('terminal')}<span>CLI Explorer</span></button>
        <button type="button" role="menuitem" data-page="mcp">${icon('cube')}<span>MCP Explorer</span></button>
        <button type="button" role="menuitem" data-page="api">${icon('activity')}<span>API Explorer</span></button>
        <button type="button" role="menuitem" data-page="tests">${icon('flask')}<span>Test Explorer</span></button>
        <button type="button" role="menuitem" data-page="data">${icon('database')}<span>Data Explorer</span></button>
        <button type="button" role="menuitem" data-page="environment">${icon('settings')}<span>Environment</span></button>
        <div class="cursor-open-group">Observe</div>
        <button type="button" role="menuitem" data-page="activity">${icon('activity')}<span>Activity</span></button>
        <button type="button" role="menuitemcheckbox" data-cursor-panel="activity" aria-checked="false">${icon('terminal')}<span>Event panel</span><kbd>${shortcut}J</kbd></button>
      </div></div>
    <button type="button" id="cursorChatToggle" class="cursor-titlebar-action" title="Show product chat" aria-label="Show product chat" aria-controls="chatPanel" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3.4A7.5 7.5 0 1 1 20 11.5Z"/></svg><span>Chat</span></button>
  </div>`);
  // Keep the existing sidebar control and its saved preference, but place it beside the macOS window controls.
  document.querySelector('.cursor-traffic').after(document.getElementById('sidebarToggle'));
  const titlebar = document.querySelector('.cursor-titlebar');
  const topbar = main.querySelector('.topbar');
  titlebar.querySelector('.cursor-title').replaceWith(topbar.querySelector('.breadcrumb'));
  const topActions = topbar.querySelector('.top-actions');
  topActions.querySelector('.desktop-chip')?.remove();
  topActions.querySelector('#chatToggle')?.remove();
  titlebar.append(topActions);
  topbar.remove();
  sidebar.insertAdjacentHTML('afterend', `<aside class="cursor-explorer" id="cursorExplorer" aria-label="Project files"><div class="cursor-explorer-head"><span>EXPLORER</span><button type="button" id="cursorExplorerClose" aria-label="Close file explorer">×</button></div><div class="cursor-explorer-project" id="cursorExplorerProject">PROJECT</div><div class="cursor-explorer-tree" id="cursorExplorerTree"></div><div class="cursor-explorer-foot">Repository files · select to inspect</div></aside>`);
  main.insertAdjacentHTML('beforeend', `<section class="cursor-bottom" id="cursorBottom" aria-label="Project event panel"><div class="cursor-bottom-head"><strong>Activity</strong><span id="cursorBottomContext">Project events</span><button type="button" id="cursorBottomClose" aria-label="Close event panel">×</button></div><div class="cursor-bottom-body" id="cursorBottomBody"></div></section>`);

  const openButton = document.getElementById('cursorOpenToggle');
  const openMenu = document.getElementById('cursorOpenMenu');
  const eventPanelItem = openMenu.querySelector('[data-cursor-panel="activity"]');
  const chatButton = document.getElementById('cursorChatToggle');
  const chatPanel = document.getElementById('chatPanel');
  const chatPreferenceKey = 'productview.chat.open.v1';
  const setChatOpen = (open, save = true) => {
    document.body.classList.toggle('product-chat-open', open);
    chatPanel.classList.toggle('open', open);
    chatPanel.setAttribute('aria-hidden', String(!open));
    chatPanel.inert = !open;
    chatButton.setAttribute('aria-pressed', String(open));
    const label = open ? 'Hide product chat' : 'Show product chat';
    chatButton.setAttribute('aria-label', label);
    chatButton.title = label;
    if (save) localStorage.setItem(chatPreferenceKey, String(open));
  };
  window.setProductChatOpen = setChatOpen;
  document.getElementById('panelClose').onclick = () => setChatOpen(false);
  const setOpenMenu = open => {
    openMenu.hidden = !open;
    openButton.setAttribute('aria-expanded', String(open));
  };
  const setExplorer = open => {
    document.body.classList.toggle('cursor-explorer-open', open);
  };
  const setOutput = open => {
    document.body.classList.toggle('cursor-bottom-open', open);
    eventPanelItem.setAttribute('aria-checked', String(open));
  };
  const expandedFolders = new Set();
  let explorerRoot = projectRoot || 'demo';
  function updateExplorer() {
    if (explorerRoot !== (projectRoot || 'demo')) { expandedFolders.clear(); explorerRoot = projectRoot || 'demo'; }
    document.getElementById('cursorExplorerProject').textContent = (projectConfig.project?.name || 'Project').toUpperCase();
    let items;
    if (projectRoot) items = typeof projectFiles === 'undefined' ? [] : projectFiles;
    else {
      const paths = ['.projectroom/project.yaml', ...Object.keys(files).filter(path => path !== '.projectroom/project.yaml').sort()];
      const seen = new Set();
      items = [];
      for (const path of paths) {
        const parts = path.split('/');
        for (let depth = 0; depth < parts.length - 1; depth++) {
          const directory = parts.slice(0, depth + 1).join('/');
          if (!seen.has(directory)) { items.push({ path: directory, type: 'directory', depth }); seen.add(directory); }
        }
        items.push({ path, type: 'file', depth: parts.length - 1 });
      }
    }
    const visible = item => item.path.split('/').slice(0, -1).every((_, index, parts) => expandedFolders.has(parts.slice(0, index + 1).join('/')));
    document.getElementById('cursorExplorerTree').innerHTML = items.filter(visible).map(item => {
      const folder = item.type === 'directory';
      return `<button type="button" ${folder ? `data-cursor-folder="${escapeHtml(item.path)}" aria-expanded="${expandedFolders.has(item.path)}"` : `data-cursor-file="${escapeHtml(item.path)}"`} class="${folder ? 'cursor-folder ' : ''}${selectedFilePath === item.path && state.page === 'files' ? 'active' : ''}" style="padding-left:${8 + Math.min(item.depth || 0, 6) * 14}px" title="${escapeHtml(item.path)}">${folder ? `<span class="cursor-folder-chevron">${icon('chevron')}</span>` : '<span class="cursor-folder-spacer"></span>'}${icon(folder ? 'folder' : 'doc')}<span>${escapeHtml(item.path.split('/').pop())}</span></button>`;
    }).join('');
    document.querySelector('.cursor-explorer-foot').textContent = projectRoot ? 'Repository files · select to inspect' : 'Demo source tree · sample files';
  }
  function updateOutput() {
    const live = typeof projectRoot !== 'undefined' && !!projectRoot;
    const history = live && typeof pvHistory !== 'undefined' ? pvHistory.slice(0, 8) : typeof demoEvents !== 'undefined' ? demoEvents.slice(0, 8) : [];
    document.getElementById('cursorBottomContext').textContent = live ? 'Recorded project events' : 'Interactive demo · sample events';
    document.getElementById('cursorBottomBody').innerHTML = history.length ? history.map(event => `<div class="cursor-output-row"><span>${escapeHtml(new Date(event.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))}</span><span>${escapeHtml(event.type)} ${escapeHtml(event.component || event.client || '')}${event.demo ? ' · demo' : ''}</span></div>`).join('') : '<div class="cursor-output-empty">No recorded events yet. Start a service, run a command tool or run tests to create a record.</div>';
  }
  const originalRender = render;
  let lastPage = state.page;
  render = function () {
    const enteringFiles = state.page === 'files' && lastPage !== 'files';
    originalRender();
    if (state.page !== 'files') setExplorer(false);
    else if (enteringFiles) setExplorer(true);
    lastPage = state.page;
    updateExplorer(); updateOutput();
  };
  const toggleExplorer = () => {
    if (state.page !== 'files') {
      state.page = 'files';
      render();
      window.scrollTo(0, 0);
    } else setExplorer(!document.body.classList.contains('cursor-explorer-open'));
  };
  document.addEventListener('click', event => {
    const folder = event.target.closest('[data-cursor-folder]');
    if (folder) {
      const path = folder.dataset.cursorFolder;
      if (expandedFolders.has(path)) expandedFolders.delete(path); else expandedFolders.add(path);
      updateExplorer();
    }
    if (event.target.closest('[data-cursor-explorer-open], [data-page="files"]')) setExplorer(true);
  });
  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-cursor-refresh-files]')) return;
    try {
      if (window.productView && projectRoot) {
        projectFiles = await window.productView.listFiles();
        selectedFileText = await window.productView.readFile(selectedFilePath);
      }
      render();
      setExplorer(true);
      toast('Files refreshed.');
    } catch (error) { toast(error.message); }
  });
  openButton.addEventListener('click', () => setOpenMenu(openMenu.hidden));
  openMenu.addEventListener('click', event => {
    if (event.target.closest('[data-page]')) setOpenMenu(false);
    if (event.target.closest('[data-cursor-panel="activity"]')) { setOutput(!document.body.classList.contains('cursor-bottom-open')); setOpenMenu(false); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.cursor-open-wrap')) setOpenMenu(false); });
  document.getElementById('cursorExplorerClose').addEventListener('click', () => setExplorer(false));
  document.getElementById('cursorBottomClose').addEventListener('click', () => setOutput(false));
  chatButton.addEventListener('click', () => {
    const open = !document.body.classList.contains('product-chat-open');
    if (open) { panelTab = 'chat'; renderPanel(); }
    setChatOpen(open);
  });
  document.addEventListener('click', async event => {
    const file = event.target.closest('[data-cursor-file]');
    if (!file) return;
    const relative = file.dataset.cursorFile;
    try {
      selectedFilePath = relative;
      selectedFileText = relative === activeConfigPath ? (files[relative] || '') : window.productView && projectRoot ? await window.productView.readFile(relative) : (files[relative] || 'Open this file in a local project.');
      state.page = 'files';
      render();
    } catch (error) { toast(error.message); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !openMenu.hidden) { setOpenMenu(false); openButton.focus(); return; }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b') { event.preventDefault(); toggleExplorer(); }
    if (key === 'j') { event.preventDefault(); setOutput(!document.body.classList.contains('cursor-bottom-open')); }
  });
  setExplorer(state.page === 'files');
  setChatOpen(localStorage.getItem(chatPreferenceKey) === 'true', false);
  render();
  if (!window.productView) fetch('./.projectroom/project.yaml').then(response => response.ok ? response.text() : null).then(content => {
    if (!content) return;
    files['.projectroom/project.yaml'] = content;
    if (selectedFilePath === '.projectroom/project.yaml') selectedFileText = content;
    if (state.page === 'files') render();
  }).catch(() => {});
})();
