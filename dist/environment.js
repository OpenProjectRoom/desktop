/* Project .env values for names declared in the shared configuration. */
(() => {
  let loadedRoot = null;
  let snapshot = null;
  let loading = false;
  let error = '';
  const modalRoot = document.getElementById('modalRoot');

  function demoVariables() {
    const names = new Map();
    const add = (name, source, description = '') => {
      if (!name) return;
      const item = names.get(name) || { name, sources: [], description, status: 'missing' };
      if (!item.sources.includes(source)) item.sources.push(source);
      names.set(name, item);
    };
    for (const entry of projectConfig.workspace?.environment || []) add(entry.name, 'Project', entry.description);
    for (const item of projectConfig.workspace?.mcpServers || []) {
      for (const name of item.environment || []) add(name, item.name);
      add(item.authEnv, item.name);
    }
    for (const item of projectConfig.workspace?.apiSources || []) { add(item.authEnv, item.name); add(item.auth?.env, item.name); }
    for (const item of projectConfig.components || []) {
      for (const name of item.runtime?.environment || []) add(name, item.name);
      for (const name of item.tests?.environment || []) add(name, item.name);
      for (const name of item.cli?.environment || []) add(name, item.name);
      add(item.data?.connectionEnv, item.name);
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  window.projectRoomEnvironmentCount = () => demoVariables().length;
  function load() {
    if (!pv || !projectRoot || loading) return;
    const root = projectRoot;
    loading = true;
    error = '';
    pv.listEnvironment().then(result => {
      if (projectRoot === root) snapshot = result;
    }).catch(cause => {
      if (projectRoot === root) error = cause.message;
    }).finally(() => {
      loading = false;
      if (projectRoot === root && state.page === 'environment') render();
    });
  }
  function refresh() { snapshot = null; load(); }
  window.environmentPage = () => {
    const root = projectRoot || 'demo';
    if (loadedRoot !== root) { loadedRoot = root; snapshot = null; error = ''; loading = false; }
    if (pv && projectRoot && !snapshot && !loading && !error) queueMicrotask(load);
    const variables = pv && projectRoot ? snapshot?.variables || [] : demoVariables();
    const canEdit = Boolean(pv && projectRoot && snapshot?.storageAvailable);
    const status = item => item.status === 'stored' ? '<span class="env-local-state stored">Set in .env</span>' : item.status === 'inherited' ? '<span class="env-local-state inherited">Inherited from app launch</span>' : '<span class="env-local-state missing">Not set</span>';
    const rows = variables.map(item => `<div class="environment-row"><div class="environment-variable"><strong><code>${escapeHtml(item.name)}</code></strong><span>${escapeHtml(item.description || item.sources.join(', '))}</span><small>Used by ${escapeHtml(item.sources.join(', '))}</small></div>${status(item)}<div class="environment-actions"><button type="button" class="btn small" data-env="edit:${escapeHtml(item.name)}" ${canEdit ? '' : 'disabled'}>${item.status === 'stored' ? 'Change' : 'Set value'}</button>${item.status === 'stored' && canEdit ? `<button type="button" class="btn small" data-env="remove:${escapeHtml(item.name)}">Remove</button>` : ''}</div></div>`).join('');
    return `<div class="environment-shell">${pageHead('Environment', 'Read and edit this project’s .env file. Variable names come from project configuration.')}
      <section class="card environment-intro"><div class="environment-intro-icon">${icon('settings')}</div><div><strong>One .env file for your local project.</strong><p>Project Room reads and updates the existing .env in the workspace root. It keeps the file out of Git and never adds values to project YAML, Product Chat or its MCP server. Local commands you start here receive the variables they need.</p></div></section>
      <section class="card environment-list"><div class="card-head"><div><h2>Project variables</h2><p>${variables.length} declared · ${variables.filter(item => item.status !== 'missing').length} available locally</p></div><button type="button" class="btn small" data-env="refresh" ${pv && projectRoot ? '' : 'disabled'}>Refresh</button></div>
      ${loading && !snapshot ? '<div class="environment-message">Checking local values…</div>' : error ? `<div class="environment-message">${escapeHtml(error)}</div>` : rows || '<div class="environment-message">No variable names are declared yet. Add names under <code>workspace.environment</code>, an MCP server, a service or test <code>environment</code> list, a CLI <code>environment</code> list, or <code>data.connectionEnv</code> in .projectroom/project.yaml.</div>'}</section>
      ${pv && projectRoot && snapshot?.envTracked ? '<p class="environment-note">This .env is tracked by Git. Remove it from the index before editing local values here.</p>' : ''}
      ${!projectRoot ? '<p class="environment-note">Open a local workspace to set values. This web preview never accepts secrets.</p>' : ''}
      <p class="environment-note">Values stay in the local .env file. Project Room does not include them in agent prompts or its MCP responses. Coding agents with direct filesystem access may read .env independently. Review logs before sharing them.</p>
    </div>`;
  };
  function openEdit(name) {
    const item = snapshot?.variables.find(variable => variable.name === name);
    if (!item || !snapshot.storageAvailable) return;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal environment-modal" role="dialog" aria-modal="true" aria-label="Set ${escapeHtml(name)}"><div class="modal-head"><h2>${item.status === 'stored' ? 'Change' : 'Set'} ${escapeHtml(name)}</h2><button type="button" class="icon-btn" data-env="close" aria-label="Close">×</button></div><form id="environmentForm"><div class="modal-body"><p>This value is saved in the project’s .env file, which Project Room keeps out of Git.</p><label for="environmentValue">Value</label><div class="environment-input-row"><input id="environmentValue" type="password" autocomplete="off" spellcheck="false" required maxlength="32000" placeholder="Enter a private value"><button type="button" class="btn small" id="environmentReveal" data-env="reveal:${escapeHtml(name)}" ${item.status === 'stored' ? '' : 'disabled'}>Show current</button></div><small>The current value is never prefilled. Use Show current only when you need to inspect it.</small></div><div class="modal-actions"><button type="button" class="btn" data-env="close">Cancel</button><button type="submit" class="btn primary">Save to .env</button></div></form></div></div>`;
    document.getElementById('environmentValue').focus();
  }
  function openRemove(name) {
    if (!snapshot?.variables.some(item => item.name === name && item.status === 'stored')) return;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal environment-modal" role="dialog" aria-modal="true" aria-label="Remove ${escapeHtml(name)}"><div class="modal-head"><h2>Remove local value</h2><button type="button" class="icon-btn" data-env="close" aria-label="Close">×</button></div><div class="modal-body"><p>Remove <code>${escapeHtml(name)}</code> from this project’s .env? The variable name stays in .projectroom/project.yaml.</p></div><div class="modal-actions"><button type="button" class="btn" data-env="close">Cancel</button><button type="button" class="btn primary" data-env="delete:${escapeHtml(name)}">Remove value</button></div></div></div>`;
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-env]');
    if (!target) return;
    const [action, name] = target.dataset.env.split(':');
    if (action === 'refresh') refresh();
    else if (action === 'edit') openEdit(name);
    else if (action === 'remove') openRemove(name);
    else if (action === 'close') modalRoot.innerHTML = '';
    else if (action === 'reveal') {
      try {
        const input = document.getElementById('environmentValue');
        if (input.type === 'text') { input.type = 'password'; target.textContent = 'Show current'; return; }
        const value = await pv.revealEnvironment(name);
        if (!document.getElementById('environmentForm')) return;
        input.value = value || '';
        input.type = 'text';
        target.textContent = 'Hide';
      } catch (cause) { toast(cause.message); }
    } else if (action === 'delete') {
      try { snapshot = await pv.deleteEnvironment(name); modalRoot.innerHTML = ''; render(); toast('Value removed from .env.'); }
      catch (cause) { toast(cause.message); }
    }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'environmentForm') return;
    event.preventDefault();
    const name = modalRoot.querySelector('[data-env^="reveal:"]')?.dataset.env.slice(7);
    const input = document.getElementById('environmentValue');
    if (!name || !input) return;
    const value = input.value;
    try {
      snapshot = await pv.saveEnvironment(name, value);
      input.value = '';
      modalRoot.innerHTML = '';
      render();
      toast('Value saved to .env.');
    } catch (cause) { toast(cause.message); }
  });
})();
