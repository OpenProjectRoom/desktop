/* Local, read-only source inspection. No contents are sent to Product Chat. */
(() => {
  let loadedConfig = null;
  let selectedId = null;
  let catalog = null;
  let selectedEntry = null;
  let preview = null;
  let busy = false;
  let error = '';
  let requestVersion = 0;
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const sources = () => projectConfig.components.filter(item => ['database', 'storage', 'external'].includes(item.kind));
  const selected = () => sources().find(item => item.id === selectedId);
  const typeLabel = item => item.kind === 'storage' ? 'Local files' : item.kind === 'external' ? 'External source' : item.data?.engine || 'Database';
  const button = (label, action, disabled = false) => `<button type="button" class="btn small" data-data-viewer="${safe(action)}"${disabled ? ' disabled' : ''}>${label}</button>`;
  function sourceList() {
    return sources().map(item => `<button type="button" class="data-source-row ${selectedId === item.id ? 'active' : ''}" data-data-viewer="source:${safe(item.id)}"><span class="data-source-icon">${icon(item.kind === 'storage' ? 'folder' : 'database')}</span><span><strong>${safe(item.name)}</strong><small>${safe(typeLabel(item))}</small></span></button>`).join('') || '<p class="data-viewer-empty">No data sources configured in .projectroom/project.yaml.</p>';
  }
  function table() {
    if (!preview) return '<div class="data-preview-empty">Choose a table or file to see its structure and a small preview.</div>';
    if (preview.kind === 'file') {
      let text = preview.text || '';
      if (/\.json$/i.test(preview.name)) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Show the original text. */ } }
      return `<div class="data-preview-head"><strong>${safe(preview.name)}</strong><span>${preview.truncated ? 'First 64 KB' : 'Read-only file preview'}</span></div><pre class="data-file-preview">${safe(text)}</pre>`;
    }
    return `<div class="data-preview-head"><strong>${safe(selectedEntry?.name || 'Table')}</strong><span>First ${preview.limit} rows · read only</span></div>${preview.fields?.length ? `<div class="data-fields">${preview.fields.map(field => `<span><strong>${safe(field.name)}</strong> ${safe(field.type || '')}${field.primaryKey ? ' · key' : ''}</span>`).join('')}</div>` : ''}<div class="data-table-scroll"><table class="data-preview-table"><thead><tr>${preview.columns.map(name => `<th>${safe(name)}</th>`).join('')}</tr></thead><tbody>${preview.rows.length ? preview.rows.map(row => `<tr>${row.map(value => `<td title="${safe(value ?? 'NULL')}">${value == null ? '<em>NULL</em>' : safe(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${preview.columns.length || 1}">No rows returned.</td></tr>`}</tbody></table></div>`;
  }
  function workspace() {
    const item = selected();
    if (!item) return '<div class="data-preview-empty">Select a source to inspect it.</div>';
    const location = item.kind === 'storage' || /sqlite/i.test(item.data?.engine || '') ? item.data?.path : item.data?.connectionEnv;
    const header = `<div class="data-viewer-head"><div><span class="data-viewer-kicker">${safe(typeLabel(item))}</span><h2>${safe(item.name)}</h2><p>${safe(location || (item.kind === 'external' ? item.url : 'No connection configured'))}</p></div><div class="data-viewer-actions">${item.kind === 'external' || (!catalog && !error) ? '' : button(catalog ? 'Refresh' : 'Retry', 'inspect', busy)}${button('Remove', 'remove', !pv || !projectRoot || busy)}</div></div>`;
    if (item.kind === 'external') return `${header}<div class="data-preview-empty">This external source has no built-in data viewer. Open its configured URL from Project Map.</div>`;
    if (!catalog) return `${header}<div class="data-preview-empty"><strong>${busy ? 'Loading source…' : error ? 'Source could not be loaded' : 'Select a source'}</strong><p>${projectRoot ? 'Tables and files appear here. Select an entry to load its limited preview.' : 'Open a local project in the desktop app to inspect real data.'}</p>${item.data?.connectionEnv ? `<p>Connection variable: <code>${safe(item.data.connectionEnv)}</code> · <button type="button" data-page="environment">Open Environment</button></p>` : ''}</div>`;
    if (catalog.engine === 'unsupported') return `${header}<div class="data-preview-empty">${safe(catalog.message)}</div>`;
    return `${header}<div class="data-viewer-meta"><span>${catalog.tables.length} ${catalog.engine === 'files' ? 'files and folders' : 'tables and views'}${catalog.truncated ? ' · first 250' : ''}</span><span>Contents load only when selected</span></div>${catalog.message ? `<p class="data-viewer-empty">${safe(catalog.message)}</p>` : ''}<div class="data-viewer-browser"><div class="data-entry-list">${catalog.tables.length ? catalog.tables.map(entry => `<button type="button" class="data-entry ${selectedEntry?.id === entry.id ? 'active' : ''}" data-data-viewer="entry:${safe(encodeURIComponent(entry.id))}" ${entry.type === 'folder' ? 'disabled' : ''}><strong>${safe(entry.name)}</strong><small>${safe(entry.type)}${entry.bytes != null ? ' · ' + Math.round(entry.bytes / 1024) + ' KB' : ''}</small></button>`).join('') : '<p class="data-viewer-empty">No entries found.</p>'}</div><div class="data-entry-preview">${table()}</div></div>`;
  }
  dataPage = function () {
    if (loadedConfig !== projectConfig) { loadedConfig = projectConfig; ++requestVersion; selectedId = null; catalog = null; selectedEntry = null; preview = null; error = ''; busy = false; }
    return `${pageHead('Data Explorer', 'Inspect database structures and a small, read-only data preview.', `<button type="button" class="btn primary" data-data-viewer="add" ${!pv || !projectRoot ? 'disabled title="Open a local project to edit .projectroom/project.yaml"' : ''}>Add data source</button>`)}<div class="data-viewer-shell">${error ? `<div class="data-viewer-error" role="alert">${safe(error)}</div>` : ''}<div class="data-viewer-layout"><section class="card data-source-list"><div class="data-source-title"><strong>Project sources</strong><span>${sources().length}</span></div>${sourceList()}<p class="data-source-note">PostgreSQL · MySQL/MariaDB · SQLite · local files. Connections come from local Environment values.</p></section><section class="card data-viewer-main">${workspace()}</section></div></div>`;
  };
  const modalRoot = document.getElementById('modalRoot');
  async function inspectSource(id) {
    const request = ++requestVersion;
    selectedId = id; catalog = null; selectedEntry = null; preview = null; error = '';
    busy = !!pv && !!projectRoot;
    render();
    if (!busy) return;
    try { const result = await pv.inspectDataSource(id); if (request === requestVersion) catalog = result; }
    catch (cause) { if (request === requestVersion) error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally { if (request === requestVersion) { busy = false; render(); } }
  }
  const fields = {
    database: `<label>Engine<select name="engine" id="dataAddEngine"><option>PostgreSQL</option><option>MySQL</option><option>MariaDB</option><option>SQLite</option></select></label><label data-data-config="remote">Connection variable <small>name only; set its value in Environment</small><input name="connectionEnv" required pattern="[A-Z][A-Z0-9_]*" placeholder="DATABASE_URL"></label><label data-data-config="sqlite" hidden>Relative database file<input name="path" placeholder="data/app.sqlite"></label>`,
    storage: `<label>Relative folder<input name="path" required placeholder="data/uploads"></label>`,
    external: `<label>URL<input name="url" type="url" required placeholder="https://example.com"></label>`
  };
  function closeModal() { modalRoot.innerHTML = ''; }
  function openAdd() {
    const links = projectConfig.components.map(item => `<option value="${safe(item.id)}">${safe(item.name)}</option>`).join('');
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Add data source"><div class="modal-head"><h2>Add data source</h2><button type="button" class="icon-btn" data-data-modal="close" aria-label="Close">×</button></div><form id="dataSourceForm"><div class="modal-body"><p>Save a source in this repository’s .projectroom/project.yaml. Connection values remain in local Environment.</p><label>Name<input name="name" required maxlength="100" placeholder="Analytics database"></label><label>Source type<select name="kind" id="dataAddKind"><option value="database">Database</option><option value="storage">Local files</option><option value="external">External source</option></select></label><div id="dataAddFields">${fields.database}</div><label>Connect to <small>optional</small><select name="linkedTo"><option value="">No connection yet</option>${links}</select></label></div><div class="modal-actions"><button type="button" class="btn" data-data-modal="close">Cancel</button><button type="submit" class="btn primary">Add to repository</button></div></form></div></div>`;
    const update = () => {
      const sqlite = document.getElementById('dataAddEngine')?.value === 'SQLite';
      for (const label of modalRoot.querySelectorAll('[data-data-config]')) {
        label.hidden = label.dataset.dataConfig === 'sqlite' ? !sqlite : sqlite;
        label.querySelector('input').disabled = label.hidden;
        label.querySelector('input').required = !label.hidden;
      }
    };
    document.getElementById('dataAddKind').addEventListener('change', event => { document.getElementById('dataAddFields').innerHTML = fields[event.target.value]; update(); });
    document.getElementById('dataAddFields').addEventListener('change', update);
    update();
    document.getElementById('dataSourceForm').addEventListener('submit', async event => {
      event.preventDefault();
      const submit = event.target.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const updated = await pv.addMapComponent(Object.fromEntries(new FormData(event.target)));
        closeModal(); setProject(updated); state.page = 'data'; selectedId = updated.addedId; loadedConfig = projectConfig;
        await inspectSource(updated.addedId);
        toast('Data source added to .projectroom/project.yaml.');
      } catch (cause) { toast(String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
      finally { submit.disabled = false; }
    });
  }
  function openRemove() {
    const item = selected(); if (!item) return;
    const edges = (projectConfig.connections || []).filter(edge => edge.from === item.id || edge.to === item.id).length;
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Remove data source"><div class="modal-head"><h2>Remove ${safe(item.name)}?</h2><button type="button" class="icon-btn" data-data-modal="close" aria-label="Close">×</button></div><div class="modal-body"><p>This removes the data source from .projectroom/project.yaml${edges ? ` and its ${edges} map connection${edges === 1 ? '' : 's'}` : ''}. Related Spec Kit and roadmap links are updated. Your data and files stay in place.</p></div><div class="modal-actions"><button type="button" class="btn" data-data-modal="close">Cancel</button><button type="button" class="btn component-remove-button" data-data-modal="confirm-remove" data-id="${safe(item.id)}">Remove from YAML</button></div></div></div>`;
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-data-modal]'); if (!target) return;
    if (target.dataset.dataModal === 'close') { closeModal(); return; }
    if (target.dataset.dataModal !== 'confirm-remove') return;
    target.disabled = true;
    try {
      const updated = await pv.removeComponent(target.dataset.id);
      closeModal(); setProject(updated); state.page = 'data'; loadedConfig = projectConfig;
      ++requestVersion; selectedId = null; catalog = null; preview = null; selectedEntry = null; error = ''; busy = false; render();
      toast('Data source removed from .projectroom/project.yaml.');
    } catch (cause) { toast(String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); target.disabled = false; }
  });
  document.addEventListener('click', async event => {
    if (state.page !== 'data') return;
    const target = event.target.closest('[data-data-viewer]');
    if (!target) return;
    const [action, ...parts] = target.dataset.dataViewer.split(':');
    const value = parts.join(':');
    if (action === 'add') { if (pv && projectRoot) openAdd(); return; }
    if (action === 'remove') { if (pv && projectRoot) openRemove(); return; }
    if (action === 'source') { await inspectSource(value); return; }
    if (!pv || !projectRoot || busy || !selectedId) return;
    const request = ++requestVersion;
    busy = true; error = ''; render();
    try {
      if (action === 'inspect') { const result = await pv.inspectDataSource(selectedId); if (request !== requestVersion) return; catalog = result; selectedEntry = null; preview = null; }
      if (action === 'entry') {
        const id = decodeURIComponent(value);
        selectedEntry = catalog?.tables.find(item => item.id === id);
        if (!selectedEntry) throw new Error('Choose a listed entry.');
        const result = await pv.previewDataEntry(selectedId, id);
        if (request !== requestVersion) return;
        preview = result;
      }
    } catch (cause) { if (request === requestVersion) error = String(cause.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally { if (request === requestVersion) { busy = false; render(); } }
  });
})();
