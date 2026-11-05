/* OpenAPI discovery and explicit HTTP request composer. */
(() => {
  pageNames.api = 'API Explorer';
  labels.api = 'API Explorer';
  let loadedRoot;
  let sources = [];
  let selectedId = null;
  let selectedOperation = null;
  let result = null;
  let busy = false;
  let error = '';
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const selected = () => sources.find(item => item.id === selectedId);
  const button = (label, action, primary = false, disabled = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-api="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;

  async function reload() {
    if (!pv || !projectRoot) { sources = []; render(); return; }
    busy = true; error = '';
    try {
      sources = await pv.listApiSources();
      if (!sources.some(item => item.id === selectedId)) selectedId = sources[0]?.id || null;
    } catch (cause) { error = cause.message; }
    finally { busy = false; if (state.page === 'api') render(); }
  }

  function operationList(item) {
    if (!item.operations?.length) return `<div class="api-empty-list">${item.spec ? 'No operations found in this OpenAPI file.' : 'No OpenAPI file linked. Enter any relative endpoint path below.'}</div>`;
    return item.operations.map((operation, index) => `<button type="button" class="api-operation${selectedOperation === index ? ' active' : ''}" data-api="operation:${index}"><span class="api-method ${safe(operation.method.toLowerCase())}">${safe(operation.method)}</span><span><strong>${safe(operation.path)}</strong><small>${safe(operation.summary || operation.description || 'No summary')}</small></span></button>`).join('');
  }

  function sourceList() {
    return sources.length ? sources.map(item => `<button type="button" class="api-source${selectedId === item.id ? ' selected' : ''}" data-api="select:${safe(item.id)}"><span class="api-source-icon">⌁</span><span><strong>${safe(item.name)}</strong><small>${safe(item.linked ? item.baseUrl : item.source)} · ${item.operations?.length || 0} endpoints</small></span>${item.linked ? '<i title="Registered in YAML"></i>' : ''}</button>`).join('') : '<p class="api-empty-list">No API sources found. Add one by URL, or keep an OpenAPI file in the project.</p>';
  }

  function main() {
    const item = selected();
    if (!item) return '<div class="api-welcome"><h2>Explore a project API</h2><p>Register an API base URL or discover a local OpenAPI 3.x file. Requests run only when you click Send.</p></div>';
    const op = item.operations?.[selectedOperation];
    return `<div class="api-main-head"><div><span class="api-kicker">${item.linked ? 'REGISTERED API' : 'DISCOVERED OPENAPI FILE'}</span><h2>${safe(item.name)}</h2><p>${safe(item.description || item.specTitle || item.source)}</p><code>${safe(item.baseUrl || item.source)}</code>${item.specVersion ? `<small>OpenAPI document version ${safe(item.specVersion)}</small>` : ''}</div><div class="api-head-actions">${item.linked ? button('Remove from YAML', 'remove') : button('Add to project YAML', 'link', true)}</div></div>
      ${item.error ? `<p class="api-alert">${safe(item.error)}</p>` : ''}
      <div class="api-explorer-body"><div class="api-operations"><div class="api-pane-title"><strong>Endpoints</strong><span>${item.operations?.length || 0}</span></div>${operationList(item)}</div>
      <div class="api-request"><div class="api-pane-title"><strong>Request</strong><span>Runs only when you click</span></div>
      ${item.linked ? `<form id="apiRequestForm"><div class="api-request-line"><select name="method" aria-label="HTTP method">${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(method => `<option${(op?.method || 'GET') === method ? ' selected' : ''}>${method}</option>`).join('')}</select><input name="path" aria-label="Request path" required value="${safe(op?.path || '/')}" placeholder="/users/123"><button class="btn primary" type="submit"${busy || !pv || !projectRoot ? ' disabled' : ''}>${busy ? 'Sending…' : 'Send'}</button></div><p class="api-request-hint">${safe(item.baseUrl)} · ${item.authEnv ? `Bearer token from local ${safe(item.authEnv)}` : 'No auth configured'}. Replace path placeholders before sending.</p><div class="api-editor-grid"><label>Headers <small>JSON object; no credentials</small><textarea name="headers" spellcheck="false" placeholder='{"Accept":"application/json"}'>{}</textarea></label><label>Body <small>optional; JSON by default</small><textarea name="body" spellcheck="false" placeholder='{"name":"Example"}'></textarea></label></div></form>` : `<div class="api-link-hint">Review the file, then register a base URL in the project YAML to send requests.</div>`}
      ${result ? `<div class="api-response"><div class="api-response-head"><strong>Response</strong><span class="${result.status >= 400 ? 'api-failed' : 'api-success'}">${safe(result.status)} ${safe(result.statusText)}</span><small>${safe(result.durationMs)} ms · ${safe(result.contentType || 'unknown type')}${result.truncated ? ' · preview truncated' : ''}</small></div><pre>${safe(formattedBody(result))}</pre></div>` : '<div class="api-response-empty">Response status, timing and body appear here after a request.</div>'}</div></div>`;
  }
  function formattedBody(value) {
    if (!value.body) return '(empty response)';
    if (/json/i.test(value.contentType)) try { return JSON.stringify(JSON.parse(value.body), null, 2); } catch { /* Show malformed JSON as received. */ }
    return value.body;
  }

  function page() {
    return `<div class="api-shell"><div class="page-head"><div><div class="eyebrow">PRODUCT VIEW / RUN & VERIFY</div><h1>API Explorer</h1><p>Browse project HTTP endpoints, compose a request, and inspect the real response.</p></div><div class="head-actions">${button('Refresh discovery', 'refresh', false, busy)}${button('Add API', 'add', true, !pv || !projectRoot)}</div></div><div class="api-layout"><section class="card api-sources"><div class="api-pane-title"><strong>Project APIs</strong><span>${sources.length} found</span></div>${sourceList()}<p class="api-discovery-note">OpenAPI 3.x files are discovered locally. Add a base URL to <code>productview.yaml</code> to make requests. Tokens stay in local Environment.</p></section><section class="card api-main">${main()}</section></div>${!projectRoot ? '<p class="api-preview-note">Open a local repository in the desktop app to discover files and send real requests. The browser preview cannot access local APIs.</p>' : ''}${error ? `<div class="api-alert" role="alert">${safe(error)}</div>` : ''}</div>`;
  }

  const modalRoot = document.getElementById('modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
  function openAdd(item = null) {
    let suggested = '';
    try { if (item?.suggestedUrl) { const url = new URL(item.suggestedUrl); if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) suggested = url.href; } } catch { /* Relative servers require manual input. */ }
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal api-editor-modal" role="dialog" aria-modal="true" aria-label="Add API"><div class="modal-head"><h2>Add API</h2><button type="button" class="icon-btn" data-api-modal="close" aria-label="Close">×</button></div><form id="apiAddForm"><div class="modal-body"><p>The URL and optional OpenAPI path are saved in this repository's <code>productview.yaml</code>. Set token values separately in local Environment.</p><label>Name<input name="name" required maxlength="100" value="${safe(item?.name || '')}" placeholder="Orders API"></label><label>Base URL<input name="baseUrl" type="url" required value="${safe(suggested)}" placeholder="http://localhost:4000"></label><label>OpenAPI file <small>optional, relative to project root</small><input name="spec" value="${safe(item?.spec || '')}" placeholder="docs/openapi.yaml"></label><label>Bearer token variable <small>optional, name only</small><input name="authEnv" pattern="[A-Z][A-Z0-9_]*" placeholder="ORDERS_API_TOKEN"></label><label>Description <small>optional</small><input name="description" maxlength="240" placeholder="Local order lookup endpoints"></label></div><div class="modal-actions"><button type="button" class="btn" data-api-modal="close">Cancel</button><button type="submit" class="btn primary">Add to repository</button></div></form></div></div>`;
    document.getElementById('apiAddForm').addEventListener('submit', async event => {
      event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
      try { const data = Object.fromEntries(new FormData(event.target)); const updated = await pv.addApiSource(data); closeModal(); setProject(updated); state.page = 'api'; selectedId = updated.addedId; selectedOperation = null; await reload(); toast('API added to productview.yaml.'); }
      catch (cause) { toast(String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); submit.disabled = false; }
    });
  }
  function openRemove() {
    const item = selected(); if (!item?.linked) return;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Remove API"><div class="modal-head"><h2>Remove ${safe(item.name)}?</h2><button type="button" class="icon-btn" data-api-modal="close" aria-label="Close">×</button></div><div class="modal-body"><p>This removes its entry from <code>workspace.apiSources</code> only. The OpenAPI file and API service remain in place.</p></div><div class="modal-actions"><button type="button" class="btn" data-api-modal="close">Cancel</button><button type="button" class="btn" data-api-modal="confirm-remove">Remove from YAML</button></div></div></div>`;
  }

  const previousRender = render;
  render = function () {
    if (state.page !== 'api') return previousRender();
    if (loadedRoot !== projectRoot) { loadedRoot = projectRoot; sources = []; selectedId = null; selectedOperation = null; result = null; queueMicrotask(reload); }
    document.body.classList.add('dashboard-page');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === 'api'));
    document.querySelector('.breadcrumb').innerHTML = workspaceBreadcrumb('API Explorer');
    document.getElementById('content').innerHTML = page();
    document.title = 'API Explorer · OpenBuildRoom';
    renderPanel();
  };
  document.addEventListener('click', async event => {
    const modalAction = event.target.closest('[data-api-modal]');
    if (modalAction) {
      if (modalAction.dataset.apiModal === 'close') closeModal();
      else if (modalAction.dataset.apiModal === 'confirm-remove') {
        modalAction.disabled = true;
        try { const updated = await pv.removeApiSource(selectedId); closeModal(); setProject(updated); state.page = 'api'; selectedId = null; result = null; await reload(); toast('API removed from productview.yaml.'); }
        catch (cause) { toast(cause.message); modalAction.disabled = false; }
      }
      return;
    }
    if (state.page !== 'api') return;
    const target = event.target.closest('[data-api]'); if (!target) return;
    const [action, ...rest] = target.dataset.api.split(':'); const value = rest.join(':');
    if (action === 'select') { selectedId = value; selectedOperation = null; result = null; render(); }
    if (action === 'operation') { selectedOperation = Number(value); result = null; render(); }
    if (action === 'refresh') await reload();
    if (action === 'add' && pv && projectRoot) openAdd();
    if (action === 'link' && pv && projectRoot) openAdd(selected());
    if (action === 'remove') openRemove();
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'apiRequestForm') return;
    event.preventDefault();
    const form = event.target; const data = new FormData(form);
    try {
      const headers = JSON.parse(String(data.get('headers') || '{}'));
      if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Headers must be a JSON object.');
      busy = true; error = ''; form.querySelector('[type=submit]').disabled = true;
      result = await pv.sendApiRequest({ sourceId: selectedId.slice(5), method: data.get('method'), path: data.get('path'), headers, body: data.get('body') });
    } catch (cause) { error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); result = null; }
    finally { busy = false; render(); }
  });
})();
