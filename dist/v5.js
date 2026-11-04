/* Repository CLI manuals. Executables run only after an explicit click. */
let commandSelectedId = null;
let commandTab = 'explore';
let commandHelp = {};
let commandOutput = {};
let commandBusy = {};
let commandCandidates = [];
let commandCandidatesRoot = null;
let commandCandidatesLoading = false;
let commandCandidatesError = '';
let commandCandidateId = null;
let commandCandidateHelp = {};
let commandHelpArgs = {};
let commandSearch = '';
const commandTools = () => (projectConfig.components || []).filter(c => c.kind === 'commandTool');
const commandSelected = () => commandTools().find(c => c.id === commandSelectedId) || commandTools()[0];
const commandLine = parts => (parts || []).join(' ');
const commandText = value => escapeHtml(value === undefined || value === null || value === '' ? '—' : value);
const commandStatus = c => commandLive() ? v3Status(c)[0] : 'Desktop only';
const commandLive = () => Boolean(pv && projectRoot);
const commandCard = c => `<button class="cli-man-index-item ${!commandCandidateId && commandSelected()?.id === c.id ? 'active' : ''}" data-v5="select:${escapeHtml(c.id)}"><strong>${commandText(c.name)}</strong><small>${commandText(c.cli?.summary)}</small></button>`;
const commandSection = (title, content) => `<section class="cli-man-section"><h3>${title}</h3><div class="cli-man-body">${content}</div></section>`;
const commandRow = (left, right) => `<div class="cli-man-row"><code>${commandText(left)}</code><span>${commandText(right)}</span></div>`;
function commandGuide(c) {
  const cli = c.cli || {};
  const usage = cli.usage || commandLine(c.runtime?.command);
  const commands = (cli.commands || []).map(x => commandRow(x.name, x.description)).join('');
  const options = (cli.options || []).map(x => commandRow(x.flag, x.description)).join('');
  const examples = (cli.examples || []).map(x => `<div class="cli-man-example"><span>${commandText(x.label)}</span><code>$ ${commandText(commandLine(x.command))}</code></div>`).join('');
  const help = commandHelp[c.id];
  return `<article class="cli-man-page"><div class="cli-man-source"><span>MANUAL · PRODUCTVIEW.YAML</span>${cli.helpCommand && commandLive() ? `<button class="btn small" data-v5="help:${escapeHtml(c.id)}" ${commandBusy[c.id] ? 'disabled' : ''}>${icon('terminal')} ${commandBusy[c.id] ? 'Reading…' : 'Read actual --help'}</button>` : ''}</div>
  <p class="cli-man-provenance">The sections below are documented in this repository. ${cli.helpCommand ? (commandLive() ? 'Use “Read actual --help” to compare them with the executable.' : 'Executable help is available in the desktop app.') : 'No executable help command is configured.'}</p>
  ${commandSection('NAME', `<p><strong>${commandText(c.name)}</strong> — ${commandText(cli.summary)}</p>`)}
  ${commandSection('SYNOPSIS', `<pre>${commandText(usage)}</pre>`)}
  ${cli.description ? commandSection('DESCRIPTION', `<p>${commandText(cli.description)}</p>`) : ''}
  ${commands ? commandSection('COMMANDS', commands) : ''}
  ${options ? commandSection('OPTIONS', options) : ''}
  ${examples ? commandSection('EXAMPLES', examples) : ''}
  ${(cli.environment || []).length ? commandSection('ENVIRONMENT', `<p>${cli.environment.map(x => `<code>${commandText(x)}</code>`).join(' ')} <span class="cli-man-muted">Variable names only; values are not stored here.</span></p>`) : ''}
  ${commandSection('LAUNCH COMMAND', `<pre>${commandText(commandLine(c.runtime?.command))}</pre><p class="cli-man-muted">${commandText(cli.mode === 'task' ? 'One-off command' : 'Long-running server')}${cli.protocol ? ` · ${commandText(cli.protocol.toUpperCase())}` : ''} · Working directory: <code>${commandText(c.runtime?.cwd || '.')}</code>. Runs only when you click ${cli.mode === 'task' ? 'Run command' : 'Start server'}.</p>`)}
  ${help ? commandSection('ACTUAL --HELP OUTPUT', `<div class="cli-man-help-meta">Executed locally · exit ${commandText(help.exitCode)}${help.timedOut ? ' · timed out' : ''}</div><pre class="cli-man-help-output">${commandText(help.output || '(No text returned)')}</pre>`) : ''}
  </article>`;
}
function commandOutputPage(c) {
  const status = commandStatus(c);
  const item = commandOutput[c.id];
  return `<div class="command-output-page"><div class="command-output-head"><div><span class="command-kicker">PROCESS OUTPUT</span><h2>Console</h2><p>${commandLive() ? 'Live process output and the latest saved log in this repository.' : 'Process output is available in the desktop app.'}</p></div><span class="command-output-status">${commandText(status)}</span></div><div class="command-terminal"><div class="command-terminal-top"><span class="command-terminal-lights"><i></i><i></i><i></i></span><strong>${commandText(c.id)}</strong><span>${commandLive() ? 'local process' : 'desktop only'}</span></div><pre id="commandTerminalOutput">${commandText(item?.text || (commandLive() ? 'No output recorded yet. Start this command to watch it here.' : 'The web preview does not run project commands.'))}</pre></div>${item?.path ? `<p class="command-log-path">Saved in ${commandText(item.path)}</p>` : ''}</div>`;
}
function commandConfigPage(c) {
  const snippet = { id: c.id, kind: c.kind, name: c.name, position: c.position, runtime: c.runtime, cli: c.cli };
  return `<div class="command-config-page"><span class="command-kicker">REPOSITORY DEFINITION</span><h2>Where this manual comes from</h2><p><code>cli.summary</code> describes NAME and DESCRIPTION; <code>cli.usage</code> becomes SYNOPSIS; <code>cli.commands</code>, <code>cli.options</code> and <code>cli.examples</code> become their matching sections. <code>runtime.command</code> is the exact command OpenBuildRoom can run. <code>cli.helpCommand</code>, when set, reads the executable’s real help on request.</p><div class="command-config-source"><div><span>productview.yaml · ${commandText(c.id)}</span><button data-page="agent">Agent Access ${icon('arrow')}</button></div><pre>${commandText(JSON.stringify(snippet, null, 2))}</pre></div></div>`;
}
async function commandDiscover(force = false) {
  if (!commandLive() || !pv?.discoverCliTools || commandCandidatesLoading) return;
  if (!force && commandCandidatesRoot === projectRoot) return;
  const root = projectRoot;
  if (commandCandidatesRoot !== root) {
    commandCandidates = []; commandCandidateId = null; commandCandidateHelp = {}; commandHelpArgs = {};
    commandHelp = {}; commandOutput = {}; commandSelectedId = null; commandSearch = '';
  }
  commandCandidatesRoot = root;
  commandCandidatesLoading = true;
  commandCandidatesError = '';
  try {
    const found = await pv.discoverCliTools();
    if (root === projectRoot) {
      commandCandidates = found;
      if (commandCandidateId && !found.some(item => item.id === commandCandidateId)) commandCandidateId = null;
    }
  } catch (error) { if (root === projectRoot) commandCandidatesError = error.message; }
  finally {
    commandCandidatesLoading = false;
    if (root === projectRoot && state.page === 'commands') render();
    else if (root !== projectRoot && state.page === 'commands') { commandCandidatesRoot = null; queueMicrotask(() => commandDiscover()); }
  }
}
function commandParsedHelp(output) {
  const lines = String(output || '').split(/\r?\n/);
  const usage = lines.find(line => /^\s*(usage|synopsis):\s*\S/i.test(line))?.trim() || '';
  const rows = lines.map(line => /^\s{0,8}(-{1,2}[\w-]+(?:[=\s][\w<>\[\]|.,-]+)?)\s{2,}(.+)$/.exec(line)).filter(Boolean).slice(0, 30);
  return { usage, rows };
}
function commandCandidatePage(item) {
  const helpArg = commandHelpArgs[item.id] || '--help';
  const help = commandCandidateHelp[item.id];
  const parsed = commandParsedHelp(help?.output);
  return `<main class="cli-man-document cli-explorer-detail"><header class="cli-man-toolbar"><div><span class="cli-man-label">DISCOVERED ENTRY POINT · ${commandText(item.source)}</span><h2>${commandText(item.name)}</h2></div><div class="cli-man-actions">${item.linkedId ? `<span class="cli-man-status running">Linked</span><button class="btn" data-v5="select:${commandText(item.linkedId)}">Open manual</button>` : commandLive() ? `<button class="btn" data-cli="link" data-cli-id="${escapeHtml(item.id)}">Add to project YAML</button>` : ''}</div></header>
  <div class="cli-man-content"><article class="cli-man-page"><div class="cli-man-source"><span>FOUND IN THIS REPOSITORY · NOT EXECUTED DURING DISCOVERY</span></div>
  <p class="cli-man-provenance">This is a candidate CLI entry point, found from project files. Check its actual help before documenting commands or options.</p>
  ${commandSection('SOURCE', `<p><code>${commandText(item.path)}</code><br><span class="cli-man-muted">${commandText(item.source)}</span></p>`)}
  ${commandSection('ENTRY POINT', `<pre>${commandText(commandLine(item.command))}</pre>`)}
  <div class="cli-explorer-help-controls"><div><strong>Explore actual help</strong><p>This runs the local program with the selected help argument only after you click. Some programs can still have side effects when showing help.</p></div><label>Help argument<select data-cli-help-arg="${escapeHtml(item.id)}"><option value="--help" ${helpArg === '--help' ? 'selected' : ''}>--help</option><option value="-h" ${helpArg === '-h' ? 'selected' : ''}>-h</option><option value="help" ${helpArg === 'help' ? 'selected' : ''}>help</option></select></label><button class="btn primary" data-cli="help" data-cli-id="${escapeHtml(item.id)}" ${!commandLive() || commandBusy[item.id] ? 'disabled' : ''}>${commandBusy[item.id] ? 'Reading…' : 'Read help'}</button></div>
  ${help ? `<div class="cli-explorer-help"><div class="cli-man-help-meta">ACTUAL OUTPUT · EXIT ${commandText(help.exitCode)}${help.timedOut ? ' · TIMEOUT' : ''}</div>${parsed.usage ? commandSection('SYNOPSIS', `<pre>${commandText(parsed.usage)}</pre>`) : ''}${parsed.rows.length ? commandSection('OPTIONS', parsed.rows.map(row => commandRow(row[1], row[2])).join('')) : ''}<details open><summary>Full help output</summary><pre class="cli-man-help-output">${commandText(help.output || '(No text returned)')}</pre></details></div>` : '<p class="cli-explorer-pending">No help has been requested yet. Discovery itself does not start this program.</p>'}
  ${!item.linkedId ? '<p class="cli-explorer-link-note">Adding this entry creates a safe, help-only commandTool in productview.yaml and enables CLI Explorer in the navigation. Edit the YAML to define real actions after reviewing the help.</p>' : ''}
  </article></div></main>`;
}
function commandToolsPage() {
  if (commandLive() && commandCandidatesRoot !== projectRoot && !commandCandidatesLoading) queueMicrotask(() => commandDiscover());
  if (!commandLive() && commandCandidatesRoot) { commandCandidatesRoot = null; commandCandidates = []; commandCandidateId = null; }
  const tools = commandTools();
  const c = commandSelected();
  const selectedCandidate = commandCandidates.find(item => item.id === commandCandidateId) || (!c ? commandCandidates[0] : null);
  const term = commandSearch.trim().toLowerCase();
  const visibleTools = tools.filter(item => !term || `${item.name} ${item.cli?.summary || ''}`.toLowerCase().includes(term));
  const visibleCandidates = commandCandidates.filter(item => !term || `${item.name} ${item.path} ${item.source}`.toLowerCase().includes(term));
  const catalog = `<aside class="cli-man-index cli-explorer-index"><div class="cli-explorer-index-head"><strong>Project CLI tools</strong><button type="button" class="btn small" data-cli="refresh" ${!commandLive() || commandCandidatesLoading ? 'disabled' : ''}>Refresh</button></div><input type="search" id="cliExplorerSearch" placeholder="Search tools and files" value="${escapeHtml(commandSearch)}" aria-label="Search CLI tools"><span class="cli-man-label">LINKED IN YAML · ${tools.length}</span>${visibleTools.map(commandCard).join('') || '<p class="cli-explorer-none">No linked tools.</p>'}<span class="cli-man-label">DISCOVERED LOCALLY · ${commandCandidates.length}</span>${visibleCandidates.map(item => `<button type="button" class="cli-man-index-item ${selectedCandidate?.id === item.id ? 'active' : ''}" data-cli="select" data-cli-id="${escapeHtml(item.id)}"><strong>${commandText(item.name)} ${item.linkedId ? '✓' : ''}</strong><small>${commandText(item.path)}</small></button>`).join('') || `<p class="cli-explorer-none">${commandCandidatesLoading ? 'Scanning project files…' : commandCandidatesError ? commandText(commandCandidatesError) : 'No CLI entry points found.'}</p>`}<p class="cli-explorer-index-note">Discovery reads project metadata and executable entry files. It does not run commands.</p></aside>`;
  let detail;
  if (selectedCandidate) detail = commandCandidatePage(selectedCandidate);
  else if (c) {
    const status = commandStatus(c);
    const running = status.startsWith('Running');
    const action = c.cli?.mode === 'task' ? 'Run command' : running ? 'Stop server' : 'Start server';
    detail = `<main class="cli-man-document"><header class="cli-man-toolbar"><div><span class="cli-man-label">${commandText(c.id)} · ${commandText(c.cli?.mode === 'task' ? 'COMMAND' : 'SERVER')}</span><h2>${commandText(c.name)}</h2></div><div class="cli-man-actions"><span class="cli-man-status ${running ? 'running' : ''}">${commandText(status)}</span>${commandLive() ? `<button class="btn primary" data-v5="${running ? 'stop' : 'start'}:${escapeHtml(c.id)}" ${commandBusy[c.id] ? 'disabled' : ''}>${icon(running ? 'stop' : 'play')} ${commandBusy[c.id] ? 'Working…' : action}</button>${c.runtime?.url ? `<button class="btn" data-v5="open-url:${escapeHtml(c.id)}">${icon('external')} Open endpoint</button>` : ''}<button class="btn" data-cli-manage="remove" data-id="${escapeHtml(c.id)}" ${running || commandBusy[c.id] ? 'disabled title="Stop the tool first"' : ''}>Remove</button>` : '<span class="cli-man-muted">Run controls are available in the desktop app.</span>'}</div></header><nav class="cli-man-tabs" aria-label="Tool views"><button data-v5="tab:guide" class="${commandTab === 'guide' ? 'active' : ''}">Manual</button><button data-v5="tab:output" class="${commandTab === 'output' ? 'active' : ''}">Process output</button><button data-v5="tab:config" class="${commandTab === 'config' ? 'active' : ''}">Definition</button></nav><div class="cli-man-content">${commandTab === 'guide' ? commandGuide(c) : commandTab === 'output' ? commandOutputPage(c) : commandConfigPage(c)}</div></main>`;
  } else detail = '<main class="cli-man-document cli-explorer-empty"><h2>No CLI entry point found yet</h2><p>Open a local project to discover package bins and executable CLI files. You can also describe a real commandTool in productview.yaml.</p></main>';
  return `<div class="command-workbench">${pageHead('CLI Explorer', 'Discover local command-line entry points, inspect real help, and link verified tools to this workspace.', `<span class="command-page-count">${tools.length} LINKED · ${commandCandidates.length} DISCOVERED</span><button type="button" class="btn primary" data-cli-manage="add" ${!commandLive() ? 'disabled title="Open a local project to edit productview.yaml"' : ''}>Add CLI tool</button>`)}<div class="cli-man-layout">${catalog}${detail}</div><div class="footer-note">${icon('clock')} Discovery is read-only. Help and configured commands run only after an explicit click.</div></div>`;
}
const cliManageRoot = document.getElementById('modalRoot');
function cliManageClose() { cliManageRoot.innerHTML = ''; }
function cliManageAdd() {
  cliManageRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Add CLI tool"><div class="modal-head"><h2>Add CLI tool</h2><button type="button" class="icon-btn" data-cli-manage="close" aria-label="Close">×</button></div><form id="cliManageForm"><div class="modal-body"><p>Add a tool that discovery missed. Arguments are entered one per line and saved as an exact command array in productview.yaml.</p><label>Name<input name="name" required maxlength="100" placeholder="Project inspector"></label><div class="component-form-grid"><label>Mode<select name="mode"><option value="task">One-off command</option><option value="server">Long-running server</option></select></label><label>Working directory<input name="cwd" value="." placeholder="."></label></div><label>Executable<input name="executable" required maxlength="120" placeholder="node"></label><label>Arguments <small>one per line</small><textarea name="args" rows="3" placeholder="scripts/inspect.cjs"></textarea></label><label>Summary<input name="summary" required maxlength="240" placeholder="Inspect this project’s local tools"></label><label>Usage <small>shown in the manual</small><input name="usage" required maxlength="240" placeholder="node scripts/inspect.cjs [options]"></label><label>Help argument <small>optional; runs only when you click Read actual help</small><select name="helpArg"><option value="">None</option><option value="--help">--help</option><option value="-h">-h</option><option value="help">help</option></select></label></div><div class="modal-actions"><button type="button" class="btn" data-cli-manage="close">Cancel</button><button type="submit" class="btn primary">Add to repository</button></div></form></div></div>`;
  document.getElementById('cliManageForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.target.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const updated = await pv.addCliTool(Object.fromEntries(new FormData(event.target)));
      cliManageClose(); setProject(updated); state.page = 'commands'; commandCandidateId = null;
      commandSelectedId = updated.addedId; commandTab = 'explore'; commandDiscover(true); render();
      toast('CLI tool added to productview.yaml.');
    } catch (error) { toast(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { submit.disabled = false; }
  });
}
function cliManageRemove(id) {
  const item = commandTools().find(tool => tool.id === id); if (!item) return;
  const edges = (projectConfig.connections || []).filter(edge => edge.from === id || edge.to === id).length;
  cliManageRoot.innerHTML = `<div class="modal-backdrop"><div class="modal component-editor-modal" role="dialog" aria-modal="true" aria-label="Remove CLI tool"><div class="modal-head"><h2>Remove ${commandText(item.name)}?</h2><button type="button" class="icon-btn" data-cli-manage="close" aria-label="Close">×</button></div><div class="modal-body"><p>This removes the tool from productview.yaml${edges ? ` and its ${edges} map connection${edges === 1 ? '' : 's'}` : ''}. Related Spec Kit and roadmap links are updated. The executable and saved logs stay in place.</p></div><div class="modal-actions"><button type="button" class="btn" data-cli-manage="close">Cancel</button><button type="button" class="btn component-remove-button" data-cli-manage="confirm-remove" data-id="${escapeHtml(id)}">Remove from YAML</button></div></div></div>`;
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-cli-manage]'); if (!button) return;
  const action = button.dataset.cliManage;
  if (action === 'close') { cliManageClose(); return; }
  if (action === 'add') { if (commandLive()) cliManageAdd(); return; }
  if (action === 'remove') { if (commandLive()) cliManageRemove(button.dataset.id); return; }
  if (action !== 'confirm-remove') return;
  button.disabled = true;
  try {
    const updated = await pv.removeComponent(button.dataset.id);
    cliManageClose(); setProject(updated); state.page = 'commands'; commandCandidateId = null;
    commandSelectedId = commandTools()[0]?.id || null; commandTab = 'explore'; commandDiscover(true); render();
    toast('CLI tool removed from productview.yaml.');
  } catch (error) { toast(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); button.disabled = false; }
});
async function commandLoadLog(id) {
  if (!commandLive() || !pv?.readCommandLog) return;
  try { const result = await pv.readCommandLog(id); if (result) commandOutput[id] = result; if (state.page === 'commands' && commandSelected()?.id === id && commandTab === 'output') render(); }
  catch (error) { toast(error.message); }
}
document.addEventListener('click', async event => {
  const el = event.target.closest('[data-v5]');
  if (!el) return;
  const [action, id] = el.dataset.v5.split(':');
  if (action === 'open') { commandCandidateId = null; commandSelectedId = id; commandTab = 'explore'; state.page = 'commands'; render(); window.scrollTo(0, 0); commandLoadLog(id); return; }
  if (action === 'select') { commandCandidateId = null; commandSelectedId = id; commandTab = 'explore'; render(); commandLoadLog(id); return; }
  if (action === 'tab') { commandTab = id; render(); if (id === 'output') commandLoadLog(commandSelected()?.id); return; }
  const c = commandTools().find(x => x.id === id);
  if (!c) return;
  if (action === 'open-url') { if (c.runtime?.url) window.open(c.runtime.url, '_blank', 'noopener,noreferrer'); return; }
  if (commandBusy[id]) return;
  if (action === 'help') {
    commandBusy[id] = true; render();
    try {
      if (!commandLive() || !c.cli?.helpCommand) throw new Error('Executable help is not available for this workspace.');
      commandHelp[id] = await pv.readCommandHelp(id);
      commandTab = 'manual';
    } catch (error) { toast(error.message); }
    finally { commandBusy[id] = false; render(); }
    return;
  }
  if (action === 'start' || action === 'stop') {
    if (!commandLive()) return;
    commandBusy[id] = true;
    if (action === 'start') { commandTab = 'output'; commandOutput[id] = { text: 'Starting command…\n' }; }
    render();
    try {
      if (commandLive()) {
        if (action === 'start') { const result = await pv.startCommandTool(id); if (c.cli?.mode === 'task') commandOutput[id] = { text: (commandOutput[id]?.text || '') + `\nProcess finished with exit code ${result.exitCode}.` }; }
        else await pv.stopCommandTool(id);
        desktopStatus[id] = action === 'start' && c.cli?.mode !== 'task' ? 'running' : 'stopped';
        await commandLoadLog(id);
      }
      toast(`${c.name} ${action === 'start' ? 'started' : 'stopped'}`);
    } catch (error) { toast(error.message); }
    finally { commandBusy[id] = false; render(); }
  }
});
document.addEventListener('change', event => {
  const id = event.target.dataset?.cliHelpArg;
  if (!id) return;
  commandHelpArgs[id] = event.target.value;
  delete commandCandidateHelp[id];
  if (state.page === 'commands') render();
});
document.addEventListener('input', event => {
  if (event.target.id !== 'cliExplorerSearch') return;
  const position = event.target.selectionStart;
  commandSearch = event.target.value;
  render();
  const input = document.getElementById('cliExplorerSearch');
  input?.focus();
  input?.setSelectionRange(position, position);
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-cli]');
  if (!button) return;
  const action = button.dataset.cli;
  const id = button.dataset.cliId;
  if (action === 'refresh') { await commandDiscover(true); return; }
  if (action === 'select') { commandCandidateId = id; commandTab = 'explore'; render(); return; }
  if (!commandLive() || !id || commandBusy[id]) return;
  const item = commandCandidates.find(candidate => candidate.id === id);
  if (!item) return;
  if (action === 'help') {
    commandBusy[id] = true; render();
    try { commandCandidateHelp[id] = await pv.inspectCliHelp(id, commandHelpArgs[id] || '--help'); commandTab = 'help'; }
    catch (error) { toast(error.message); }
    finally { commandBusy[id] = false; render(); }
  }
  if (action === 'link') {
    commandBusy[id] = true; render();
    try {
      const updated = await pv.linkCliTool(id, commandHelpArgs[id] || '--help');
      setProject(updated);
      state.page = 'commands';
      commandCandidateId = null;
      commandSelectedId = updated.linkedId;
      commandTab = 'explore';
      await commandDiscover(true);
      toast(`${item.name} added to productview.yaml as a help-only CLI.`);
    } catch (error) { toast(error.message); }
    finally { commandBusy[id] = false; render(); }
  }
});
if (pv?.onProcessEvent) pv.onProcessEvent(event => {
  if (!commandTools().some(c => c.id === event.id)) return;
  if (event.type === 'status') desktopStatus[event.id] = event.status;
  if (event.type === 'log') commandOutput[event.id] = { text: ((commandOutput[event.id]?.text || '') + event.text).slice(-64000) };
  if (state.page === 'commands' && commandSelected()?.id === event.id) {
    if (event.type === 'log' && commandTab === 'output') { const pre = document.getElementById('commandTerminalOutput'); if (pre) { pre.textContent = commandOutput[event.id].text; pre.scrollTop = pre.scrollHeight; } }
    else render();
  }
});
