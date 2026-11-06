/* OpenAPI discovery and explicit HTTP request composer. */
(() => {
  pageNames.api = 'API Explorer';
  labels.api = 'API Explorer';
  let loadedRoot;
  let sources = [];
  let remoteSpecs = {};
  let selectedId = null;
  let selectedOperation = null;
  let result = null;
  let requestDraft = null;
  let busy = false;
  let error = '';
  let authStatus = null;
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const selected = () => sources.find(item => item.id === selectedId);
  const button = (label, action, primary = false, disabled = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-api="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
  function schemaExample(schema, depth = 0) {
    if (!schema || depth > 3) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.const !== undefined) return schema.const;
    if (schema.enum?.length) return schema.enum[0];
    if (schema.allOf?.length) return Object.assign({}, ...schema.allOf.map(part => schemaExample(part, depth + 1)).filter(part => part && typeof part === 'object' && !Array.isArray(part)));
    if (schema.oneOf?.length || schema.anyOf?.length) return schemaExample((schema.oneOf || schema.anyOf)[0], depth + 1);
    if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties || {}).map(([name, child]) => [name, schemaExample(child, depth + 1)]));
    if (schema.type === 'array') return [schemaExample(schema.items, depth + 1)];
    if (schema.type === 'boolean') return false;
    if (['integer', 'number'].includes(schema.type)) return 0;
    return '';
  }
  function chosenMedia(operation) {
    const media = operation?.requestBody?.content || [];
    return media.find(entry => entry.type === 'application/json') || media.find(entry => entry.type.endsWith('+json')) || media[0];
  }
  function exampleBody(media) {
    if (!media) return '';
    const example = media.example ?? schemaExample(media.schema);
    if (example === undefined || example === null) return '';
    if (media.type === 'multipart/form-data') return '';
    if (media.type === 'application/x-www-form-urlencoded' && example && typeof example === 'object' && !Array.isArray(example)) return new URLSearchParams(Object.entries(example).map(([key, value]) => [key, String(value ?? '')])).toString();
    return typeof example === 'string' && !/json/i.test(media.type) ? example : JSON.stringify(example, null, 2);
  }
  function paramFields(operation, draft) {
    if (!operation?.parameters?.length) return '';
    return `<div class="api-param-section"><strong>Parameters from OpenAPI</strong><div class="api-param-grid">${operation.parameters.map(parameter => {
      const key = `${parameter.in}:${parameter.name}`;
      const schema = parameter.schema || {};
      const current = draft.params?.[key] ?? parameter.example ?? schema.default ?? '';
      const title = `${parameter.name} · ${parameter.in}${parameter.required ? ' *' : ''}`;
      const choices = schema.enum || (schema.type === 'boolean' ? [true, false] : null);
      const disabled = parameter.in === 'cookie' ? ' disabled title="Cookie authentication is not configured in this request composer"' : '';
      const control = choices ? `<select data-api-param="${safe(key)}"${disabled}><option value="">Select…</option>${choices.map(choice => `<option value="${safe(choice)}"${String(current) === String(choice) ? ' selected' : ''}>${safe(choice)}</option>`).join('')}</select>` :
        `<input data-api-param="${safe(key)}" value="${safe(current)}" placeholder="${safe(schema.type || 'value')}"${parameter.required && !disabled ? ' required' : ''}${disabled}>`;
      return `<label>${safe(title)}${control}<small>${safe(parameter.description || [schema.type, schema.format].filter(Boolean).join(' · '))}</small></label>`;
    }).join('')}</div>${operation.parameters.some(parameter => parameter.in === 'cookie') ? '<small>Cookie parameters are documented here; set authentication outside the request composer.</small>' : ''}</div>`;
  }
  function operationDetails(operation) {
    if (!operation) return '';
    const body = operation.requestBody;
    const security = operation.security.flat().map(entry => `${entry.name}${entry.scheme ? ` (${entry.scheme})` : ''}`).join(', ');
    return `<div class="api-operation-details"><strong>${safe(operation.summary || `${operation.method} ${operation.path}`)}</strong>${operation.deprecated ? '<span class="api-deprecated">Deprecated</span>' : ''}${operation.description ? `<p>${safe(operation.description)}</p>` : ''}${security ? `<p>Security declared: ${safe(security)}. Check the configured API authentication below.</p>` : ''}${body ? `<details><summary>Request schema${body.required ? ' · required' : ''}</summary><pre>${safe(JSON.stringify(body.content.map(media => ({ mediaType: media.type, schema: media.schema })), null, 2))}</pre></details>` : ''}${operation.responses.length ? `<details><summary>Documented responses · ${operation.responses.map(response => safe(response.status)).join(', ')}</summary><pre>${safe(JSON.stringify(operation.responses, null, 2))}</pre></details>` : ''}</div>`;
  }

  async function reload() {
    if (!pv || !projectRoot) { sources = []; render(); return; }
    busy = true; error = '';
    try {
      sources = (await pv.listApiSources()).map(item => remoteSpecs[item.id]?.path === item.specPath && remoteSpecs[item.id]?.baseUrl === item.baseUrl ? { ...item, ...remoteSpecs[item.id].detail } : item);
      if (!sources.some(item => item.id === selectedId)) {
        selectedId = sources[0]?.id || null;
        selectedOperation = null;
        requestDraft = null;
        result = null;
      }
      authStatus = selected()?.auth?.type === 'oauth2' && pv.apiAuthStatus ? await pv.apiAuthStatus(selectedId) : null;
    } catch (cause) { error = cause.message; }
    finally { busy = false; if (state.page === 'api') render(); }
  }

  function operationList(item) {
    if (!item.operations?.length) return `<div class="api-empty-list">${item.specPath ? 'Load the live OpenAPI document to browse its operations.' : item.spec ? 'No operations found in this OpenAPI file.' : 'No OpenAPI file linked. Enter any relative endpoint path below.'}</div>`;
    return item.operations.map((operation, index) => `<button type="button" class="api-operation${selectedOperation === index ? ' active' : ''}" data-api="operation:${index}"><span class="api-method ${safe(operation.method.toLowerCase())}">${safe(operation.method)}</span><span><strong>${safe(operation.path)}</strong><small>${safe(operation.summary || operation.description || 'No summary')}</small></span></button>`).join('');
  }

  function sourceList() {
    return sources.length ? sources.map(item => `<button type="button" class="api-source${selectedId === item.id ? ' selected' : ''}" data-api="select:${safe(item.id)}"><span class="api-source-icon">⌁</span><span><strong>${safe(item.name)}</strong><small>${safe(item.linked ? item.baseUrl : item.source)} · ${item.specPath && !item.operations?.length ? 'OpenAPI ready to load' : `${item.operations?.length || 0} endpoints`}</small></span>${item.linked ? '<i title="Registered in YAML"></i>' : ''}</button>`).join('') : '<p class="api-empty-list">No API sources found. Add one by URL, or keep an OpenAPI file in the project.</p>';
  }

  function main() {
    const item = selected();
    if (!item) return '<div class="api-welcome"><h2>Explore a project API</h2><p>Register an API base URL or discover a local OpenAPI 3.x file. Requests run only when you click Send.</p></div>';
    const op = item.operations?.[selectedOperation];
    const media = chosenMedia(op);
    const draft = requestDraft || { method: op?.method || 'GET', path: op?.path || '/', headers: '{}', body: exampleBody(media), contentType: media?.type || '', params: {} };
    const auth = item.auth || (item.authEnv ? { type: 'bearer', env: item.authEnv } : { type: 'none' });
    const authLabel = auth.type === 'apiKey' ? `API key in ${auth.in} from local ${auth.env}` : auth.type === 'bearer' ? `Bearer token from local ${auth.env}` : auth.type === 'oauth2' ? `OAuth · ${authStatus?.signedIn ? 'signed in' : 'sign in required'}` : 'No auth configured';
    return `<div class="api-main-head"><div><span class="api-kicker">${item.linked ? 'REGISTERED API' : 'DISCOVERED OPENAPI FILE'}</span><h2>${safe(item.name)}</h2><p>${safe(item.description || item.specTitle || item.source)}</p><code>${safe(item.baseUrl || item.source)}</code>${item.specVersion ? `<small>OpenAPI document version ${safe(item.specVersion)}</small>` : ''}</div><div class="api-head-actions">${item.linked && item.specPath ? button(busy ? 'Loading…' : 'Load OpenAPI', 'load-spec', false, busy) : ''}${item.linked && auth.type === 'oauth2' ? `${button(authStatus?.signedIn ? 'Sign in again' : 'Sign in with OAuth', 'sign-in', false, busy)}${authStatus?.signedIn ? button('Forget sign-in', 'sign-out', false, busy) : ''}` : ''}${item.linked ? button('Remove from YAML', 'remove') : button('Add to project YAML', 'link', true)}</div></div>
      ${item.error ? `<p class="api-alert">${safe(item.error)}</p>` : ''}
      <div class="api-explorer-body"><div class="api-operations"><div class="api-pane-title"><strong>Endpoints</strong><span>${item.operations?.length || 0}</span></div>${operationList(item)}</div>
      <div class="api-request"><div class="api-pane-title"><strong>Request</strong><span>Runs only when you click</span></div>
      ${item.linked ? `<form id="apiRequestForm"><div class="api-request-line"><select name="method" aria-label="HTTP method">${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(method => `<option${draft.method === method ? ' selected' : ''}>${method}</option>`).join('')}</select><input name="path" aria-label="Request path" required value="${safe(draft.path)}" placeholder="/users/123"><button class="btn primary" type="submit"${busy || !pv || !projectRoot ? ' disabled' : ''}>${busy ? 'Sending…' : 'Send'}</button></div><p class="api-request-hint">${safe(item.baseUrl)} · ${safe(authLabel)}. Requests run only when you click Send.</p>${operationDetails(op)}${paramFields(op, draft)}${op?.requestBody?.content?.length ? `<label class="api-media-label">Request content type<select name="contentType" id="apiContentType">${op.requestBody.content.map(entry => `<option value="${safe(entry.type)}"${draft.contentType === entry.type ? ' selected' : ''}>${safe(entry.type)}</option>`).join('')}</select></label>` : ''}<div class="api-editor-grid"><label>Headers <small>JSON object; no credentials</small><textarea name="headers" spellcheck="false" placeholder='{"Accept":"application/json"}'>${safe(draft.headers)}</textarea></label><label>Body <small>${op?.requestBody?.description ? safe(op.requestBody.description) : 'optional; OpenAPI example when available'}</small><textarea name="body" spellcheck="false" placeholder='{"name":"Example"}'>${safe(draft.body)}</textarea></label></div></form>` : `${operationDetails(op)}${paramFields(op, draft)}<div class="api-link-hint">Review the file, then register a base URL in the project YAML to send requests.</div>`}
      ${result ? `<div class="api-response"><div class="api-response-head"><strong>Response</strong><span class="${result.status >= 400 ? 'api-failed' : 'api-success'}">${safe(result.status)} ${safe(result.statusText)}</span><small>${safe(result.durationMs)} ms · ${safe(result.contentType || 'unknown type')}${result.truncated ? ' · preview truncated' : ''}</small></div><pre>${safe(formattedBody(result))}</pre></div>` : '<div class="api-response-empty">Response status, timing and body appear here after a request.</div>'}</div></div>`;
  }
  function formattedBody(value) {
    if (!value.body) return '(empty response)';
    if (/json/i.test(value.contentType)) try { return JSON.stringify(JSON.parse(value.body), null, 2); } catch { /* Show malformed JSON as received. */ }
    return value.body;
  }
  function captureDraft(form) {
    const data = new FormData(form);
    const params = Object.fromEntries([...form.querySelectorAll('[data-api-param]')].map(field => [field.dataset.apiParam, field.value]));
    return { method: String(data.get('method') || 'GET'), path: String(data.get('path') || '/'), headers: String(data.get('headers') || '{}'),
      body: String(data.get('body') || ''), contentType: String(data.get('contentType') || ''), params };
  }

  function page() {
    return `<div class="api-shell"><div class="page-head"><div><div class="eyebrow">PROJECT ROOM / RUN & VERIFY</div><h1>API Explorer</h1><p>Browse project HTTP endpoints, compose a request, and inspect the real response.</p></div><div class="head-actions">${button('Refresh discovery', 'refresh', false, busy)}${button('Add API', 'add', true, !pv || !projectRoot)}</div></div><div class="api-layout"><section class="card api-sources"><div class="api-pane-title"><strong>Project APIs</strong><span>${sources.length} found</span></div>${sourceList()}<p class="api-discovery-note">OpenAPI 3.x files are discovered locally. Add a base URL to <code>.projectroom/project.yaml</code> to make requests. Tokens stay in local Environment.</p></section><section class="card api-main">${main()}</section></div>${!projectRoot ? '<p class="api-preview-note">Open a local repository in the desktop app to discover files and send real requests. The browser preview cannot access local APIs.</p>' : ''}${error ? `<div class="api-alert" role="alert">${safe(error)}</div>` : ''}</div>`;
  }

  const modalRoot = document.getElementById('modalRoot');
  function closeModal() { modalRoot.innerHTML = ''; }
  function openAdd(item = null) {
    let suggested = '';
    try { if (item?.suggestedUrl) { const url = new URL(item.suggestedUrl); if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) suggested = url.href; } } catch { /* Relative servers require manual input. */ }
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal api-editor-modal" role="dialog" aria-modal="true" aria-label="Add API"><div class="modal-head"><h2>Add API</h2><button type="button" class="icon-btn" data-api-modal="close" aria-label="Close">×</button></div><form id="apiAddForm"><div class="modal-body"><p>The URL and optional OpenAPI source are saved in this repository's <code>.projectroom/project.yaml</code>. Set secret values in local Environment; OAuth tokens use macOS encryption.</p><label>Name<input name="name" required maxlength="100" value="${safe(item?.name || '')}" placeholder="Orders API"></label><label>Base URL<input name="baseUrl" type="url" required value="${safe(suggested)}" placeholder="http://localhost:4000"></label><label>OpenAPI file <small>optional, relative to project root</small><input name="spec" value="${safe(item?.spec || '')}" placeholder="docs/openapi.yaml"></label><label>Live OpenAPI path <small>optional, on this same API; use either file or path</small><input name="specPath" value="${safe(item?.specPath || '')}" placeholder="/open-api/core"></label><label>Authentication<select name="authType" id="apiAuthType"><option value="none">None</option><option value="bearer">Bearer token</option><option value="apiKey">API key</option><option value="oauth2">OAuth browser sign-in</option></select></label><div id="apiAuthFields"></div><label>Description <small>optional</small><input name="description" maxlength="240" placeholder="Local order lookup endpoints"></label></div><div class="modal-actions"><button type="button" class="btn" data-api-modal="close">Cancel</button><button type="submit" class="btn primary">Add to repository</button></div></form></div></div>`;
    const updateAuth = () => {
      const type = document.getElementById('apiAuthType').value;
      document.getElementById('apiAuthFields').innerHTML = type === 'bearer' ? `<label>Bearer token variable <small>name only</small><input name="authEnv" required pattern="[A-Z][A-Z0-9_]*" placeholder="ORDERS_API_TOKEN"></label>` :
        type === 'apiKey' ? `<label>API key variable <small>name only</small><input name="keyEnv" required pattern="[A-Z][A-Z0-9_]*" placeholder="ORDERS_API_KEY"></label><label>Placement<select name="keyIn"><option value="header">Header</option><option value="query">Query parameter</option></select></label><label>Header or parameter name<input name="keyName" required placeholder="X-API-Key"></label>` :
        type === 'oauth2' ? `<label>Authorization URL<input name="authorizationUrl" type="url" required placeholder="https://identity.example.com/authorize"></label><label>Token URL<input name="tokenUrl" type="url" required placeholder="https://identity.example.com/token"></label><label>Public client ID<input name="clientId" required maxlength="240" placeholder="Registered native client ID"></label><label>Issuer URL <small>optional; validates the OAuth callback when provided</small><input name="issuer" type="url" placeholder="https://identity.example.com/"></label><label>Scopes <small>space-separated</small><input name="scopes" placeholder="read write"></label><small>Register callback URL <code>http://127.0.0.1:48271/oauth/callback</code> with the provider. Public client + PKCE; no client secret.</small>` : '';
    };
    document.getElementById('apiAuthType').addEventListener('change', updateAuth); updateAuth();
    document.getElementById('apiAddForm').addEventListener('submit', async event => {
      event.preventDefault(); const submit = event.target.querySelector('[type=submit]'); submit.disabled = true;
      try { const data = Object.fromEntries(new FormData(event.target)); if (data.authType === 'apiKey') data.auth = { type: 'apiKey', env: data.keyEnv, in: data.keyIn, name: data.keyName }; if (data.authType === 'oauth2') data.auth = { type: 'oauth2', authorizationUrl: data.authorizationUrl, tokenUrl: data.tokenUrl, clientId: data.clientId, ...(data.issuer ? { issuer: data.issuer } : {}), scopes: data.scopes.split(/\s+/).filter(Boolean) }; const updated = await pv.addApiSource(data); closeModal(); setProject(updated); state.page = 'api'; selectedId = updated.addedId; selectedOperation = null; requestDraft = null; result = null; await reload(); toast('API added to .projectroom/project.yaml.'); }
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
    if (loadedRoot !== projectRoot) { loadedRoot = projectRoot; sources = []; remoteSpecs = {}; selectedId = null; selectedOperation = null; requestDraft = null; result = null; queueMicrotask(reload); }
    document.body.classList.add('dashboard-page');
    document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === 'api'));
    document.querySelector('.breadcrumb').innerHTML = workspaceBreadcrumb('API Explorer');
    document.getElementById('content').innerHTML = page();
    document.title = 'API Explorer · Project Room';
    renderPanel();
  };
  document.addEventListener('click', async event => {
    const modalAction = event.target.closest('[data-api-modal]');
    if (modalAction) {
      if (modalAction.dataset.apiModal === 'close') closeModal();
      else if (modalAction.dataset.apiModal === 'confirm-remove') {
        modalAction.disabled = true;
        try { const updated = await pv.removeApiSource(selectedId); closeModal(); setProject(updated); state.page = 'api'; selectedId = null; selectedOperation = null; requestDraft = null; result = null; await reload(); toast('API removed from .projectroom/project.yaml.'); }
        catch (cause) { toast(cause.message); modalAction.disabled = false; }
      }
      return;
    }
    if (state.page !== 'api') return;
    const target = event.target.closest('[data-api]'); if (!target) return;
    const [action, ...rest] = target.dataset.api.split(':'); const value = rest.join(':');
    if (action === 'select') { selectedId = value; selectedOperation = null; requestDraft = null; result = null; authStatus = null; if (selected()?.auth?.type === 'oauth2' && pv?.apiAuthStatus) pv.apiAuthStatus(selectedId).then(status => { authStatus = status; if (state.page === 'api') render(); }).catch(cause => { error = cause.message; render(); }); render(); }
    if (action === 'operation') { selectedOperation = Number(value); requestDraft = null; result = null; render(); }
    if (action === 'refresh') await reload();
    if (action === 'add' && pv && projectRoot) openAdd();
    if (action === 'link' && pv && projectRoot) openAdd(selected());
    if (action === 'remove') openRemove();
    if (action === 'load-spec' && pv?.loadApiSpec && selected()?.specPath) {
      const sourceId = selectedId;
      const specPath = selected().specPath;
      const baseUrl = selected().baseUrl;
      busy = true; error = ''; render();
      try {
        const detail = await pv.loadApiSpec(sourceId.slice(5));
        remoteSpecs[sourceId] = { path: specPath, baseUrl, detail: { operations: detail.operations, specTitle: detail.title, specVersion: detail.version } };
        if (selectedId === sourceId) { selectedOperation = null; requestDraft = null; result = null; }
        await reload();
      } catch (cause) { error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
      finally { busy = false; render(); }
    }
    if ((action === 'sign-in' || action === 'sign-out') && pv && selectedId) {
      busy = true; error = ''; render();
      try { authStatus = action === 'sign-in' ? await pv.signInApi(selectedId) : await pv.signOutApi(selectedId); toast(action === 'sign-in' ? 'API OAuth sign-in completed.' : 'API OAuth session removed.'); }
      catch (cause) { error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
      finally { busy = false; render(); }
    }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'apiRequestForm') return;
    event.preventDefault();
    const form = event.target;
    requestDraft = captureDraft(form);
    try {
      const request = apiRequestFromDraft(selected()?.operations?.[selectedOperation], requestDraft);
      busy = true; error = ''; form.querySelector('[type=submit]').disabled = true;
      result = await pv.sendApiRequest({ sourceId: selectedId.slice(5), ...request });
    } catch (cause) { error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); result = null; }
    finally { busy = false; render(); }
  });
  document.addEventListener('change', event => {
    if (event.target.id !== 'apiContentType') return;
    const form = event.target.closest('form');
    const operation = selected()?.operations?.[selectedOperation];
    if (!form || !operation) return;
    requestDraft = captureDraft(form);
    requestDraft.body = exampleBody(operation.requestBody?.content?.find(entry => entry.type === requestDraft.contentType));
    render();
  });
})();
