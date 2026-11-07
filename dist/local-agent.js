/* Local Codex / Claude Code chat. Personal connection state stays outside the repository. */
(() => {
  const api = window.productView;
  let connection = null;
  let busy = false;
  let recording = false;
  let dictationBase = '';
  let dictationLatest = '';
  const micSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>';
  const label = () => connection?.provider === 'codex' ? 'Codex CLI' : connection?.provider === 'claude' ? 'Claude Code' : 'No agent connected';
  const connectionOk = () => !!connection && connection.provider !== 'none' && connection.providers?.[connection.provider]?.installed;
  const escape = value => escapeHtml(String(value ?? ''));
  function settings() {
    if (!api) return '<section class="card settings-card"><div><h2>Local coding agent</h2><p>Open the desktop app to connect Codex CLI or Claude Code.</p></div></section>';
    if (!connection) return '<section class="card settings-card"><div><h2>Local coding agent</h2><p>Checking installed CLIs…</p></div></section>';
    const provider = connection.provider;
    return `<div class="settings-grid"><section class="card settings-card agent-chat-settings"><div class="settings-icon">${icon('terminal')}</div><div><h2>Local coding agent</h2><p>Use an installed coding agent for Product Chat. Project Room launches it in the open project folder.</p><div class="agent-provider-list">${[['none', 'None'], ['codex', 'Codex CLI'], ['claude', 'Claude Code']].map(([id, name]) => `<label class="agent-provider-row"><input type="radio" name="agent-provider" value="${id}" ${provider === id ? 'checked' : ''}><span><strong>${name}</strong>${id !== 'none' ? `<small>${connection.providers[id]?.installed ? 'Installed · ' + escape(connection.providers[id].path) : 'Not found on this computer'}</small>` : '<small>No coding agent connected.</small>'}</span></label>`).join('')}</div><button class="btn" type="button" data-agent-chat="refresh">Check again</button></div></section><section class="card settings-card agent-chat-settings"><div class="settings-icon">${icon('settings')}</div><div><h2>Chat permissions</h2><p>Choose what the coding agent may do when you send a message.</p><div class="agent-provider-list"><label class="agent-provider-row"><input type="radio" name="agent-mode" value="inspect" ${connection.mode === 'inspect' ? 'checked' : ''}><span><strong>Ask & inspect</strong><small>Read the project and Project Room MCP tools. No project edits.</small></span></label><label class="agent-provider-row"><input type="radio" name="agent-mode" value="edit" ${connection.mode === 'edit' ? 'checked' : ''}><span><strong>Allow project edits</strong><small>Let the agent update files in the open project folder under its CLI permissions.</small></span></label></div></div></section><section class="card settings-card agent-chat-settings"><div class="settings-icon">${icon('cube')}</div><div><h2>Available context & tools</h2><p>The selected CLI keeps its own configured tools and gains Project Room's read-only MCP server for this project. Other CLI tools follow that agent's permissions.</p><div class="agent-tool-tags">${['Product YAML', 'Vision & roadmap', 'Components & connections', 'Spec Kit', 'Project files', 'Activity history'].map(name => `<span>${name}</span>`).join('')}</div><small>Local environment values and secrets are not added to the prompt or MCP output. Codex or Claude sends the text you submit to its configured model provider.</small></div></section></div>`;
  }
  window.productViewChatSettings = settings;
  async function refresh() {
    if (!api) return;
    try { connection = await api.chatStatus(); } catch (error) { toast(error.message); }
    if (state.page === 'settings') render(); else renderPanel();
  }
  refresh();
  document.addEventListener('change', async event => {
    if (!api || !connection) return;
    if (!['agent-provider', 'agent-mode'].includes(event.target.name)) return;
    const next = { provider: event.target.name === 'agent-provider' ? event.target.value : connection.provider, mode: event.target.name === 'agent-mode' ? event.target.value : connection.mode };
    try { connection = await api.saveChatSettings(next); render(); toast('Chat settings saved on this computer.'); }
    catch (error) { toast(error.message); render(); }
  });
  document.addEventListener('click', event => { if (event.target.closest('[data-agent-chat="refresh"]')) refresh(); });
  const originalPanel = renderPanel;
  renderPanel = function () {
    originalPanel();
    if (panelTab !== 'chat') return;
    const panel = document.getElementById('chatPanel');
    const body = panel.querySelector('#panelBody');
    const empty = api ? `<div class="panel-empty agent-chat-empty"><div class="panel-symbol">${icon('cube')}</div><strong>Talk to your product</strong><p>${connectionOk() ? `${label()} can inspect this project through Project Room and its configured tools.` : 'Connect Codex CLI or Claude Code to ask about this project and work on it.'}</p>${!connectionOk() ? '<button type="button" class="btn small" data-v8="open:chat">Connect an agent</button>' : ''}</div>` : `<div class="panel-empty agent-chat-empty"><div class="panel-symbol">${icon('cube')}</div><strong>Talk to your product</strong><p>This browser demo answers from its sample configuration. Open the desktop app for Codex or Claude Code.</p></div>`;
    body.innerHTML = `<div class="chat-messages">${chatMessages.length ? chatMessages.map(message => `<div class="chat-message ${message.role}">${message.role === 'assistant' ? window.renderChatMarkdown(message.text) : escape(message.text)}</div>`).join('') : empty}${busy ? '<div class="chat-message assistant agent-thinking">Working with the project…</div>' : ''}</div><div class="chat-suggestions"><button data-v3="ask:Which components exist?">Explain components</button><button data-v3="ask:Which tests are configured?">Show tests</button></div>`;
    body.scrollTop = body.scrollHeight;
    const footer = panel.querySelector('.chat-composer-footer');
    const note = footer.querySelector('span');
    note.textContent = api ? `${label()} · ${connection?.mode === 'edit' ? 'project edits enabled' : 'ask & inspect'}` : 'Local configuration answer · demo';
    const send = footer.querySelector('button[type="submit"]');
    send.disabled = busy;
    panel.querySelector('.panel-foot').innerHTML = `<span class="dot"></span> ${api ? (projectRoot ? `${escape(label())} · Project Room MCP` : 'Open a project folder to chat') : 'Demo chat · no model connected'}`;
  };
  const oldSend = sendChat;
  sendChat = async function (input) {
    const message = String(input || '').trim();
    if (!message || busy) return;
    if (!api) { oldSend(message); return; }
    if (!projectRoot) { document.getElementById('chatInput').value = message; toast('Open a project folder first.'); return; }
    if (!connectionOk()) { document.getElementById('chatInput').value = message; document.querySelector('[data-v8="open:chat"]')?.click(); toast('Connect an installed coding agent in Settings.'); return; }
    const history = [...chatMessages.filter(item => ['user', 'assistant'].includes(item.role)), { role: 'user', text: message }];
    chatMessages.push({ role: 'user', text: message });
    busy = true; panelTab = 'chat'; renderPanel();
    try { const answer = await api.sendAgentChat(history); chatMessages.push({ role: 'assistant', text: answer.text }); refreshHistory().catch(() => {}); }
    catch (error) { chatMessages.push({ role: 'assistant', text: `Agent error: ${error.message}` }); }
    finally { busy = false; renderPanel(); }
  };
  const footer = document.querySelector('.chat-composer-footer');
  const microphone = document.createElement('button');
  microphone.type = 'button'; microphone.id = 'chatMicrophone'; microphone.className = 'chat-microphone'; microphone.title = 'Dictate locally'; microphone.setAttribute('aria-label', 'Start dictation'); microphone.innerHTML = micSvg;
  if (!api || api.platform === 'darwin') footer.insertBefore(microphone, footer.querySelector('button[type="submit"]'));
  microphone.addEventListener('click', async () => {
    if (!api) { toast('Dictation is available in the desktop app.'); return; }
    if (recording) { await api.stopDictation(); return; }
    const input = document.getElementById('chatInput'); dictationBase = input.value.trim(); dictationLatest = '';
    try { await api.startDictation(); } catch (error) { toast(error.message); }
  });
  api?.onDictation(event => {
    const input = document.getElementById('chatInput');
    if (event.type === 'started') { recording = true; microphone.classList.add('recording'); microphone.title = 'Stop dictation'; microphone.setAttribute('aria-label', 'Stop dictation'); }
    if (event.type === 'transcript') { dictationLatest = event.text || ''; input.value = [dictationBase, dictationLatest].filter(Boolean).join(' '); input.focus(); }
    if (event.type === 'stopped' || event.type === 'error') { recording = false; microphone.classList.remove('recording'); microphone.title = 'Dictate locally'; microphone.setAttribute('aria-label', 'Start dictation'); if (event.type === 'error') toast(event.message || 'Dictation failed.'); }
  });
  renderPanel();
})();
