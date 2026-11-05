/* Human-readable MCP server browser. Discovery never starts a server. */
(() => {
  pageNames.mcp = 'MCP Explorer';
  labels.mcp = 'MCP Explorer';
  let loadedRoot = undefined;
  let servers = [];
  let selectedId = null;
  let detail = null;
  let selectedKind = 'tools';
  let selectedName = null;
  let draft = '{}';
  let fieldValues = {};
  let result = null;
  let busy = false;
  let message = '';
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const selected = () => servers.find(item => item.id === selectedId);
  const editable = item => !!item && item.id.startsWith('yaml:');
  const activeItems = () => detail ? ({ tools: detail.tools, resources: detail.resources, templates: detail.resourceTemplates, prompts: detail.prompts })[selectedKind] || [] : [];
  const activeItem = () => activeItems().find(item => (item.name || item.uri || item.uriTemplate) === selectedName);
  const simpleSchema = item => {
    const schema = item?.inputSchema;
    if (!schema || schema.type !== 'object' || !schema.properties) return null;
    const entries = Object.entries(schema.properties);
    return entries.length && entries.every(([, field]) => ['string', 'integer', 'number', 'boolean'].includes(field.type) && (!field.enum || Array.isArray(field.enum))) ? entries : null;
  };
  function fieldForm(item) {
    const entries = simpleSchema(item);
    if (!entries) return `<label for="mcpArgs">JSON arguments</label><textarea id="mcpArgs" spellcheck="false" aria-label="Tool arguments">${safe(draft)}</textarea>`;
    return `<div class="mcp-fields">${entries.map(([name, field]) => {
      const required = (item.inputSchema.required || []).includes(name);
      const label = `<label for="mcpField-${safe(name)}">${safe(field.title || name)}${required ? ' *' : ''}</label>`;
      const help = field.description ? `<small>${safe(field.description)}</small>` : '';
      const value = fieldValues[name] ?? field.default ?? '';
      if (field.enum) return `<div>${label}<select id="mcpField-${safe(name)}" data-mcp-field="${safe(name)}"><option value="">Select…</option>${field.enum.map(option => `<option value="${safe(option)}"${String(value) === String(option) ? ' selected' : ''}>${safe(option)}</option>`).join('')}</select>${help}</div>`;
      if (field.type === 'boolean') return `<div class="mcp-checkbox"><label><input type="checkbox" data-mcp-field="${safe(name)}"${value === true || value === 'true' ? ' checked' : ''}> ${safe(field.title || name)}</label>${help}</div>`;
      return `<div>${label}<input id="mcpField-${safe(name)}" data-mcp-field="${safe(name)}" type="${['integer', 'number'].includes(field.type) ? 'number' : 'text'}"${field.type === 'number' ? ' step="any"' : ''} value="${safe(value)}" placeholder="${safe(field.description || name)}">${help}</div>`;
    }).join('')}</div><details class="mcp-schema"><summary>Use JSON instead</summary><textarea id="mcpArgs" spellcheck="false" aria-label="Tool arguments as JSON">${safe(draft)}</textarea><small>When expanded, this JSON replaces the fields above.</small></details>`;
  }
  function toolArguments(item) {
    const entries = simpleSchema(item);
    const advanced = document.querySelector('.mcp-inspect details:has(#mcpArgs)');
    if (!entries || advanced?.open) return JSON.parse(draft || '{}');
    const args = {};
    for (const [name, field] of entries) {
      const value = fieldValues[name] ?? field.default ?? '';
      if (value === '' && !(item.inputSchema.required || []).includes(name)) continue;
      if (value === '' && field.type !== 'boolean') throw new Error(`${name} is required.`);
      args[name] = field.type === 'boolean' ? value === true || value === 'true' : ['integer', 'number'].includes(field.type) ? Number(value) : value;
      if (['integer', 'number'].includes(field.type) && !Number.isFinite(args[name])) throw new Error(`${name} must be a number.`);
    }
    return args;
  }
  function formatResult(output) {
    const blocks = output.content || output.contents;
    if (Array.isArray(blocks) && blocks.length) return blocks.map(block => {
      if (typeof block.text === 'string') {
        try { return JSON.stringify(JSON.parse(block.text), null, 2); } catch { return block.text; }
      }
      return `[${block.type || 'content'}${block.mimeType ? ' · ' + block.mimeType : ''}]`;
    }).join('\n\n').slice(0, 200000);
    return JSON.stringify(output, null, 2).slice(0, 200000);
  }

  async function reload() {
    if (!pv || !projectRoot) { servers = []; return; }
    busy = true; message = '';
    try {
      servers = await pv.listMcpServers();
      if (!servers.some(item => item.id === selectedId)) selectedId = servers[0]?.id || null;
      if (detail && !servers.some(item => item.id === detail.id && item.connected)) detail = null;
      if (selected()?.connected && detail?.id !== selectedId) detail = await pv.describeMcpServer(selectedId);
    } catch (error) { message = error.message; }
    finally { busy = false; if (state.page === 'mcp') render(); }
  }
  const button = (label, action, primary = false, disabled = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-mcp="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const pill = (label, kind = '') => `<span class="mcp-pill ${kind}">${safe(label)}</span>`;
  const buildLine = (item, active) => {
    const info = active?.buildIdentity || item?.buildIdentity || {};
    const when = value => { try { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }); } catch { return ''; } };
    const parts = [info.builtAt ? `Built ${when(info.builtAt)}` : 'Build time unavailable'];
    if (info.version) parts.push(`v${info.version}`);
    if (info.revision) parts.push(`build ${info.revision.slice(0, 12)}`);
    else if (info.sourceRevision) parts.push(`source ${info.sourceRevision}`);
    if (active?.serverInfo?.version) parts.push(`server v${active.serverInfo.version}`);
    if (active?.connectedAt) parts.push(`Connected ${when(active.connectedAt)}`);
    return `<div class="build-identity">${safe(parts.join(' · '))}</div>`;
  };
  const listing = () => servers.length ? servers.map(item => `<button type="button" class="mcp-server${selectedId === item.id ? ' selected' : ''}" data-mcp="select:${safe(item.id)}"><span class="mcp-server-mark">${icon('cube')}</span><span class="mcp-server-copy"><strong>${safe(item.name)}</strong><small>${safe(item.source)}${item.linkedId ? ' · Linked in YAML' : ''}</small></span>${item.connected ? '<i class="mcp-online" title="Connected"></i>' : ''}</button>`).join('') : '<p class="mcp-muted">No project MCP servers found. Add a server to <code>workspace.mcpServers</code> or a project MCP config file.</p>';
  function catalog() {
    if (!detail) return '';
    const counts = [['tools', 'Tools', detail.tools?.length || 0], ['resources', 'Resources', detail.resources?.length || 0], ['templates', 'Templates', detail.resourceTemplates?.length || 0], ['prompts', 'Prompts', detail.prompts?.length || 0]];
    const entries = activeItems();
    return `<div class="mcp-catalog"><div class="mcp-tabs">${counts.map(([kind, label, count]) => `<button type="button" data-mcp="tab:${kind}" class="${selectedKind === kind ? 'active' : ''}">${label} <span>${count}</span></button>`).join('')}</div><div class="mcp-catalog-body"><div class="mcp-items">${entries.length ? entries.map(item => { const name = item.name || item.uri || item.uriTemplate; return `<button type="button" data-mcp="item:${safe(name)}" class="${selectedName === name ? 'active' : ''}"><strong>${safe(name)}</strong><small>${safe(item.description || item.title || '')}</small></button>`; }).join('') : '<p class="mcp-muted">This server does not advertise items in this category.</p>'}</div><div class="mcp-inspect">${inspector()}</div></div></div>`;
  }
  function inspector() {
    const item = activeItem();
    if (!item) return '<div class="mcp-empty-detail">Select an item to see what it does and how to use it.</div>';
    let action = '';
    if (selectedKind === 'tools') action = `${simpleSchema(item) ? fieldForm(item) : Object.keys(item.inputSchema?.properties || {}).length ? fieldForm(item) : '<p class="mcp-no-input">No arguments required.</p>'}<div class="mcp-action-row">${button('Run tool', 'run-tool', true, busy)}<small>Runs only when you click. Review the inputs first.</small></div>`;
    if (selectedKind === 'resources') action = `<div class="mcp-action-row">${button('Read resource', 'read-resource', true, busy)}</div>`;
    if (selectedKind === 'templates') action = `<label for="mcpUri">Resource URI</label><input id="mcpUri" value="${safe(draft)}" placeholder="Fill in the template variables" aria-label="Resource URI"><div class="mcp-action-row">${button('Read URI', 'read-template', true, busy)}</div>`;
    if (selectedKind === 'prompts') action = `<label for="mcpArgs">Prompt arguments (JSON object)</label><textarea id="mcpArgs" spellcheck="false" aria-label="Prompt arguments">${safe(draft)}</textarea><div class="mcp-action-row">${button('Get prompt', 'get-prompt', true, busy)}</div>`;
    return `<div class="mcp-inspect-head"><span class="mcp-kicker">${safe(selectedKind.slice(0, -1).toUpperCase())}</span><h2>${safe(item.name || item.uri || item.uriTemplate)}</h2><p>${safe(item.description || item.title || 'No description supplied by this server.')}</p></div>${item.inputSchema ? `<details class="mcp-schema"><summary>Input schema</summary><pre>${safe(JSON.stringify(item.inputSchema, null, 2))}</pre></details>` : ''}${action}${result ? `<div class="mcp-result"><div><strong>${result.error ? 'Error' : 'Result'}</strong>${button('Clear', 'clear')}</div><pre>${safe(result.text)}</pre></div>` : ''}`;
  }
  function page() {
    const item = selected();
    return `<div class="mcp-shell"><div class="page-head"><div><div class="eyebrow">PROJECT ROOM / RUN & VERIFY</div><h1>MCP Explorer</h1><p>See what a project's MCP servers offer, then inspect tools, resources and prompts.</p></div><div class="head-actions">${button('Refresh discovery', 'refresh', false, busy)}${button('Add MCP server', 'add', true, !pv || !projectRoot || busy)}</div></div>
      <div class="mcp-layout"><section class="card mcp-server-list"><div class="mcp-section-head"><strong>Project servers</strong><span>${servers.length} found</span></div>${listing()}<div class="mcp-discovery-note">Found in <code>productview.yaml</code>, <code>.mcp.json</code>, Cursor and VS Code project settings. Discovery reads files only.</div></section>
      <section class="card mcp-main">${item ? `<div class="mcp-main-head"><div><div class="mcp-kicker">${safe(item.transport.toUpperCase())} · ${safe(item.source)}</div><h2>${safe(item.name)}</h2><p>${safe(item.description || 'No description in project configuration.')}</p>${buildLine(item, detail?.id === item.id ? detail : null)}</div><div class="mcp-head-actions">${pill(item.connected ? 'Connected' : 'Disconnected', item.connected ? 'connected' : '')}${editable(item) ? button('Remove', 'remove', false, busy) : !item.builtIn && !item.linkedId ? button('Add to project YAML', 'link', false, busy) : ''}</div></div><div class="mcp-connection"><div><strong>Connection</strong><code>${safe(item.endpoint)}</code><small>${item.transport === 'stdio' ? 'Connect starts this local command. Disconnect stops it.' : 'Connect contacts this endpoint. HTTPS or local HTTP is required.'}</small>${item.environment.length ? `<div class="mcp-env">${item.environment.map(entry => pill(entry.name + (entry.available ? ' · set' : ' · missing'), entry.available ? '' : 'missing')).join('')}</div>` : ''}</div>${item.connected ? button('Disconnect', 'disconnect', false, busy) : button('Connect', 'connect', true, busy)}</div>${detail?.id === item.id ? `<div class="mcp-server-info">${safe(detail.serverInfo?.name || item.name)}${detail.serverInfo?.version ? ' · v' + safe(detail.serverInfo.version) : ''}${detail.instructions ? `<p>${safe(detail.instructions)}</p>` : ''}${(detail.errors || []).map(error => `<p class="mcp-error">${safe(error)}</p>`).join('')}</div>${catalog()}` : `<div class="mcp-start"><h3>Inspect this server</h3><p>Connect to ask the server for its actual capabilities. You can review each item before running a tool or reading a resource.</p></div>`}` : `<div class="mcp-start"><h3>${projectRoot ? 'No server selected' : 'Open a local project'}</h3><p>${projectRoot ? 'Add an MCP server to the project configuration and refresh discovery.' : 'The desktop app discovers MCP servers in the selected repository. The browser preview does not connect to local processes.'}</p></div>`}</section></div>${message ? `<div class="mcp-alert" role="alert">${safe(message)}</div>` : ''}</div>`;
  }
  const modalRoot = document.getElementById('modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
  function openAdd() {
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal mcp-editor-modal" role="dialog" aria-modal="true" aria-label="Add MCP server"><div class="modal-head"><h2>Add MCP server</h2><button type="button" class="icon-btn" data-mcp-modal="close" aria-label="Close">×</button></div><form id="mcpServerForm"><div class="modal-body"><p>Register another server in this repository’s productview.yaml. Add variable names here; set their values in local Environment.</p><label>Name<input name="name" required maxlength="100" placeholder="Documentation MCP"></label><label>Description <small>optional</small><input name="description" maxlength="240" placeholder="Search project documentation"></label><label>Transport<select name="transport" id="mcpAddTransport"><option value="stdio">Local command (stdio)</option><option value="http">HTTP</option><option value="sse">Legacy SSE</option></select></label><div id="mcpAddFields"></div></div><div class="modal-actions"><button type="button" class="btn" data-mcp-modal="close">Cancel</button><button type="submit" class="btn primary">Add to repository</button></div></form></div></div>`;
    const fields = {
      stdio: `<label>Executable<input name="command" required maxlength="200" placeholder="node"></label><label>Arguments <small>one per line</small><textarea name="args" rows="3" placeholder="tools/server.js"></textarea></label><label>Working directory<input name="cwd" value="." placeholder="."></label><label>Environment names <small>one per line, no values</small><textarea name="environment" rows="2" placeholder="DOCS_API_TOKEN"></textarea></label>`,
      remote: `<label>Endpoint URL<input name="url" type="url" required placeholder="https://example.com/mcp"></label><label>Bearer token variable <small>optional; name only</small><input name="authEnv" pattern="[A-Z][A-Z0-9_]*" placeholder="MCP_TOKEN"></label>`
    };
    const update = () => { document.getElementById('mcpAddFields').innerHTML = fields[document.getElementById('mcpAddTransport').value === 'stdio' ? 'stdio' : 'remote']; };
    document.getElementById('mcpAddTransport').addEventListener('change', update); update();
    document.getElementById('mcpServerForm').addEventListener('submit', async event => {
      event.preventDefault(); const submit = event.target.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const updated = await pv.addMcpServer(Object.fromEntries(new FormData(event.target)));
        closeModal(); setProject(updated); state.page = 'mcp'; selectedId = updated.addedId; detail = null; await reload(); render();
        toast('MCP server added to productview.yaml.');
      } catch (error) { toast(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
      finally { submit.disabled = false; }
    });
  }
  function openRemove() {
    const item = selected(); if (!editable(item)) return;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Remove MCP server"><div class="modal-head"><h2>Remove ${safe(item.name)}?</h2><button type="button" class="icon-btn" data-mcp-modal="close" aria-label="Close">×</button></div><div class="modal-body"><p>This removes only this server’s entry from <code>workspace.mcpServers</code> in productview.yaml and closes its connection. External MCP config files, executables and logs stay in place.</p></div><div class="modal-actions"><button type="button" class="btn" data-mcp-modal="close">Cancel</button><button type="button" class="btn component-remove-button" data-mcp-modal="confirm-remove" data-id="${safe(item.id)}">Remove from YAML</button></div></div></div>`;
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-mcp-modal]'); if (!target) return;
    if (target.dataset.mcpModal === 'close') { closeModal(); return; }
    if (target.dataset.mcpModal !== 'confirm-remove') return;
    target.disabled = true;
    try {
      const updated = await pv.removeMcpServer(target.dataset.id);
      closeModal(); setProject(updated); state.page = 'mcp'; selectedId = null; detail = null; await reload(); render();
      toast('MCP server removed from productview.yaml.');
    } catch (error) { toast(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); target.disabled = false; }
  });
  const previousRender = render;
  render = function () {
    if (state.page !== 'mcp') return previousRender();
    if (loadedRoot !== projectRoot) { loadedRoot = projectRoot; servers = []; selectedId = null; detail = null; message = ''; queueMicrotask(reload); }
    document.body.classList.add('dashboard-page');
    document.body.classList.remove('cursor-explorer-open');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === 'mcp'));
    document.querySelector('.breadcrumb').innerHTML = workspaceBreadcrumb('MCP Explorer');
    document.getElementById('content').innerHTML = page();
    document.title = 'MCP Explorer · Project Room';
    renderPanel();
  };
  document.addEventListener('input', event => {
    if (state.page !== 'mcp') return;
    if (['mcpArgs', 'mcpUri'].includes(event.target.id)) draft = event.target.value;
    if (event.target.dataset?.mcpField) fieldValues[event.target.dataset.mcpField] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  });
  document.addEventListener('click', async event => {
    if (state.page !== 'mcp') return;
    const target = event.target.closest('[data-mcp]');
    if (!target) return;
    const [action, ...parts] = target.dataset.mcp.split(':');
    const value = parts.join(':');
    if (action === 'select') { selectedId = value; selectedName = null; result = null; detail = null; if (selected()?.connected) { try { detail = await pv.describeMcpServer(value); } catch (error) { message = error.message; } } render(); return; }
    if (action === 'tab') { selectedKind = value; selectedName = null; result = null; render(); return; }
    if (action === 'item') { selectedName = value; draft = selectedKind === 'templates' ? value : '{}'; fieldValues = {}; result = null; render(); return; }
    if (action === 'clear') { result = null; render(); return; }
    if (action === 'refresh') { await reload(); return; }
    if (action === 'add') { if (pv && projectRoot) openAdd(); return; }
    if (action === 'remove') { if (pv && projectRoot) openRemove(); return; }
    if (!pv || busy || !selectedId) return;
    busy = true; message = '';
    try {
      if (action === 'link') {
        const updated = await pv.linkMcpServer(selectedId);
        setProject(updated); state.page = 'mcp'; selectedId = updated.addedId; detail = null; await reload(); toast('MCP server linked in productview.yaml. Set any missing variables in Environment.');
      }
      if (action === 'connect') { detail = await pv.connectMcpServer(selectedId); servers = await pv.listMcpServers(); selectedKind = detail.tools.length ? 'tools' : detail.resources.length ? 'resources' : detail.prompts.length ? 'prompts' : 'tools'; selectedName = null; result = null; }
      if (action === 'disconnect') { await pv.disconnectMcpServer(selectedId); detail = null; servers = await pv.listMcpServers(); result = null; }
      if (['run-tool', 'read-resource', 'read-template', 'get-prompt'].includes(action)) {
        let output;
        if (action === 'run-tool' || action === 'get-prompt') {
          const args = action === 'run-tool' ? toolArguments(activeItem()) : JSON.parse(draft || '{}');
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be a JSON object.');
          output = action === 'run-tool' ? await pv.callMcpTool(selectedId, selectedName, args) : await pv.getMcpPrompt(selectedId, selectedName, args);
        } else output = await pv.readMcpResource(selectedId, action === 'read-template' ? draft : selectedName);
        result = { error: !!output.isError, text: formatResult(output) };
      }
    } catch (error) { message = error.message; }
    finally { busy = false; render(); }
  });
})();
