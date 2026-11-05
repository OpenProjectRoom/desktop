/* CLI Explorer follows the MCP Explorer's browse → inspect → explicitly run pattern. */
(() => {
  const trialArgs = {};
  const trialResults = {};
  const trialBusy = {};
  let trialRoot = null;
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const parts = value => String(value || '').split(/\r?\n/).map(part => part.trim()).filter(Boolean);
  const shown = command => (command || []).map(part => /\s/.test(part) ? JSON.stringify(part) : part).join(' ');
  const selectedCandidate = () => commandCandidates.find(item => item.id === commandCandidateId) || (!commandTools().length ? commandCandidates[0] : null);
  const current = () => selectedCandidate() || commandSelected();
  const toolId = () => current()?.id;
  const tabButton = (id, label) => `<button type="button" data-v5="tab:${id}" class="${commandTab === id ? 'active' : ''}">${label}</button>`;
  const catalogItem = (item, candidate) => {
    const active = candidate ? selectedCandidate()?.id === item.id : !selectedCandidate() && commandSelected()?.id === item.id;
    const status = candidate ? item.linkedId ? 'Linked in YAML' : item.source : item.cli?.mode === 'server' ? commandStatus(item) : 'In YAML';
    return `<button type="button" class="mcp-server cli-explorer-item${active ? ' selected' : ''}" ${candidate ? `data-cli="select" data-cli-id="${safe(item.id)}"` : `data-v5="select:${safe(item.id)}"`}><span class="mcp-server-mark">${icon('terminal')}</span><span class="mcp-server-copy"><strong>${safe(item.name)}</strong><small>${safe(status)}</small></span>${!candidate && commandStatus(item).startsWith('Running') ? '<i class="mcp-online" title="Running"></i>' : ''}</button>`;
  };

  function trialPanel(item, candidate) {
    const id = item.id;
    const command = candidate ? item.command : item.runtime?.command;
    const currentArgs = trialArgs[id] || '';
    const extra = parts(currentArgs);
    const result = trialResults[id];
    const helpOnly = !candidate && item.cli?.helpCommand && JSON.stringify(item.cli.helpCommand) === JSON.stringify(command);
    const note = helpOnly ? 'This linked tool currently runs help only. Update its runtime.command in productview.yaml before testing an operational command.' :
      'Each line is one argument. BuildSteer runs this exact command locally without a shell when you click Test command. The trial stops after 10 seconds and does not change productview.yaml.';
    const help = candidate ? commandCandidateHelp[id] : commandHelp[id];
    const commands = candidate ? [] : (item.cli?.commands || []).filter(entry => !command.includes(entry.name));
    const options = candidate ? commandParsedHelp(help?.output).rows.map(row => ({ flag: row[1], description: row[2] })) : item.cli?.options || [];
    const reference = commands.length || options.length ? `<div class="cli-explore-reference"><div><strong>${candidate ? 'Found in actual help' : 'Documented in YAML'}</strong><small>Click an item to add it to the arguments above.</small></div>${commands.length ? `<div class="cli-explore-chips"><span>COMMANDS</span>${commands.map(entry => `<button type="button" data-cli-explore="insert" data-cli-token="${safe(entry.name)}" title="${safe(entry.description)}"><code>${safe(entry.name)}</code><small>${safe(entry.description)}</small></button>`).join('')}</div>` : ''}${options.length ? `<div class="cli-explore-chips"><span>OPTIONS</span>${options.map(entry => `<button type="button" data-cli-explore="insert" data-cli-token="${safe(entry.flag.split(/[ =<]/)[0])}" title="${safe(entry.description)}"><code>${safe(entry.flag)}</code><small>${safe(entry.description)}</small></button>`).join('')}</div>` : ''}</div>` : '';
    return `<div class="cli-explore-body"><div class="cli-explore-intro"><span class="mcp-kicker">INTERACTIVE TESTER</span><h3>Try this command</h3><p>${safe(note)}</p></div>${reference}<div class="cli-explore-command"><span>COMMAND PREVIEW</span><code id="cliTrialPreview">${safe(shown([...command, ...extra]))}</code></div><label for="cliTrialArgs">Additional arguments <small>one per line · optional</small></label><textarea id="cliTrialArgs" spellcheck="false" placeholder="--format\njson" ${helpOnly ? 'disabled' : ''}>${safe(currentArgs)}</textarea><div class="mcp-action-row"><button type="button" class="btn primary" data-cli-explore="run" ${!commandLive() || trialBusy[id] || helpOnly ? 'disabled' : ''}>${trialBusy[id] ? 'Running…' : 'Test command'}</button><small>${commandLive() ? 'Runs only after your click · 10-second limit' : 'Open a local workspace in the desktop app to run commands.'}</small></div>${help ? `<div class="cli-explore-help"><strong>Help available</strong><span>Open the ${candidate ? 'Help' : 'Manual'} tab to compare real output with the documented command.</span></div>` : ''}${result ? `<div class="mcp-result cli-trial-result"><div><strong>${result.timedOut ? 'Stopped after 10 seconds' : `Exit code ${result.exitCode ?? 'unknown'}`}</strong><button type="button" class="btn small" data-cli-explore="clear">Clear</button></div><pre>${safe(result.output || '(No output returned)')}</pre></div>` : '<div class="cli-explore-placeholder">No test run yet. You can inspect the manual or actual help before running a command.</div>'}</div>`;
  }

  function candidateHelp(item) {
    const help = commandCandidateHelp[item.id];
    const parsed = commandParsedHelp(help?.output);
    return `<div class="cli-explore-body"><div class="cli-explore-intro"><span class="mcp-kicker">ACTUAL EXECUTABLE OUTPUT</span><h3>Help</h3><p>Help is read from the local program only when you click Read help. It may still have side effects.</p></div>${help ? `<div class="cli-help-summary"><span>Exit ${safe(help.exitCode)}${help.timedOut ? ' · timed out' : ''}</span>${parsed.usage ? `<code>${safe(parsed.usage)}</code>` : ''}</div>${parsed.rows.length ? `<div class="cli-help-options"><strong>Detected options</strong>${parsed.rows.map(row => `<div><code>${safe(row[1])}</code><span>${safe(row[2])}</span></div>`).join('')}</div>` : ''}<details open class="cli-help-full"><summary>Full help output</summary><pre>${safe(help.output || '(No output returned)')}</pre></details>` : '<div class="cli-explore-placeholder">No help requested yet. Choose a help argument above and click Read help.</div>'}</div>`;
  }

  function candidateSource(item) {
    return `<div class="cli-explore-body"><div class="cli-explore-intro"><span class="mcp-kicker">DISCOVERY SOURCE</span><h3>Where this tool was found</h3><p>Discovery reads project metadata and executable entry files. It does not run them.</p></div><div class="cli-source-row"><strong>Project file</strong><code>${safe(item.path)}</code></div><div class="cli-source-row"><strong>Detected from</strong><span>${safe(item.source)}</span></div><div class="cli-source-row"><strong>Entry point</strong><code>${safe(shown(item.command))}</code></div>${item.linkedId ? `<p class="cli-explore-footnote">This entry point is linked to <code>${safe(item.linkedId)}</code> in productview.yaml.</p>` : '<p class="cli-explore-footnote">Add to project YAML to share this tool with other developers. The initial registered command requests help only.</p>'}</div>`;
  }

  function configuredDetail(item) {
    const running = commandStatus(item).startsWith('Running');
    const busy = !!commandBusy[item.id];
    const status = commandStatus(item);
    const tabs = ['explore', 'manual', 'output', 'config'];
    if (!tabs.includes(commandTab)) commandTab = 'explore';
    const body = commandTab === 'manual' ? `<div class="cli-man-content">${commandGuide(item)}</div>` : commandTab === 'output' ? `<div class="cli-man-content">${commandOutputPage(item)}</div>` : commandTab === 'config' ? `<div class="cli-man-content">${commandConfigPage(item)}</div>` : trialPanel(item, false);
    return `<section class="card mcp-main cli-explorer-main"><div class="mcp-main-head"><div><span class="mcp-kicker">REGISTERED IN PRODUCTVIEW.YAML · ${safe(item.cli?.mode === 'server' ? 'SERVER' : 'TASK')}</span><h2>${safe(item.name)}</h2><p>${safe(item.cli?.summary || 'Project command-line tool.')}</p></div><div class="mcp-head-actions"><span class="mcp-pill ${running ? 'connected' : ''}">${safe(status)}</span><button type="button" class="btn" data-cli-manage="remove" data-id="${safe(item.id)}" ${!commandLive() || running || busy ? 'disabled' : ''}>Remove</button></div></div><div class="mcp-connection cli-launch-bar"><div><strong>Configured command</strong><code>${safe(shown(item.runtime?.command))}</code><small>Working directory: ${safe(item.runtime?.cwd || '.')} · Starts only when you click.</small></div><div class="cli-launch-actions"><button type="button" class="btn primary" data-v5="${running ? 'stop' : 'start'}:${safe(item.id)}" ${!commandLive() || busy ? 'disabled' : ''}>${busy ? 'Working…' : item.cli?.mode === 'task' ? 'Run command' : running ? 'Stop server' : 'Start server'}</button>${item.cli?.helpCommand ? `<button type="button" class="btn" data-v5="help:${safe(item.id)}" ${!commandLive() || busy ? 'disabled' : ''}>Read help</button>` : ''}${item.runtime?.url ? `<button type="button" class="btn" data-v5="open-url:${safe(item.id)}">Open endpoint</button>` : ''}</div></div><nav class="mcp-tabs cli-explorer-tabs" aria-label="CLI tool views">${tabButton('explore', 'Explore')}${tabButton('manual', 'Manual')}${tabButton('output', 'Process output')}${tabButton('config', 'Definition')}</nav>${body}</section>`;
  }

  function discoveredDetail(item) {
    const tabs = ['explore', 'help', 'source'];
    if (!tabs.includes(commandTab)) commandTab = 'explore';
    const helpArg = commandHelpArgs[item.id] || '--help';
    const body = commandTab === 'help' ? candidateHelp(item) : commandTab === 'source' ? candidateSource(item) : trialPanel(item, true);
    return `<section class="card mcp-main cli-explorer-main"><div class="mcp-main-head"><div><span class="mcp-kicker">DISCOVERED LOCALLY · ${safe(item.source)}</span><h2>${safe(item.name)}</h2><p>${safe(item.path)}</p></div><div class="mcp-head-actions">${item.linkedId ? '<span class="mcp-pill connected">Linked in YAML</span>' : `<button type="button" class="btn" data-cli="link" data-cli-id="${safe(item.id)}" ${!commandLive() || commandBusy[item.id] ? 'disabled' : ''}>Add to project YAML</button>`}</div></div><div class="mcp-connection cli-launch-bar"><div><strong>Detected entry point</strong><code>${safe(shown(item.command))}</code><small>Found from project files; nothing ran during discovery.</small></div><div class="cli-launch-actions"><label>Help argument<select data-cli-help-arg="${safe(item.id)}"><option value="--help" ${helpArg === '--help' ? 'selected' : ''}>--help</option><option value="-h" ${helpArg === '-h' ? 'selected' : ''}>-h</option><option value="help" ${helpArg === 'help' ? 'selected' : ''}>help</option></select></label><button type="button" class="btn primary" data-cli="help" data-cli-id="${safe(item.id)}" ${!commandLive() || commandBusy[item.id] ? 'disabled' : ''}>${commandBusy[item.id] ? 'Reading…' : 'Read help'}</button></div></div><nav class="mcp-tabs cli-explorer-tabs" aria-label="CLI entry views">${tabButton('explore', 'Explore')}${tabButton('help', 'Help')}${tabButton('source', 'Source')}</nav>${body}</section>`;
  }

  commandToolsPage = function () {
    if (trialRoot !== projectRoot) { Object.keys(trialArgs).forEach(id => delete trialArgs[id]); Object.keys(trialResults).forEach(id => delete trialResults[id]); trialRoot = projectRoot; }
    if (commandLive() && commandCandidatesRoot !== projectRoot && !commandCandidatesLoading) queueMicrotask(() => commandDiscover());
    if (!commandLive() && commandCandidatesRoot) { commandCandidatesRoot = null; commandCandidates = []; commandCandidateId = null; }
    const tools = commandTools();
    const term = commandSearch.trim().toLowerCase();
    const configured = tools.filter(item => !term || `${item.name} ${item.cli?.summary || ''}`.toLowerCase().includes(term));
    const discovered = commandCandidates.filter(item => !term || `${item.name} ${item.path} ${item.source}`.toLowerCase().includes(term));
    const catalog = `<section class="card mcp-server-list cli-explorer-list"><div class="mcp-section-head"><strong>Project tools</strong><span>${tools.length + commandCandidates.length} found</span></div><input type="search" id="cliExplorerSearch" placeholder="Search tools and files" value="${safe(commandSearch)}" aria-label="Search CLI tools"><div class="cli-explorer-group">IN PRODUCTVIEW.YAML · ${tools.length}</div>${configured.map(item => catalogItem(item, false)).join('') || '<p class="mcp-muted">No registered tools.</p>'}<div class="cli-explorer-group">DISCOVERED LOCALLY · ${commandCandidates.length}</div>${discovered.map(item => catalogItem(item, true)).join('') || `<p class="mcp-muted">${safe(commandCandidatesLoading ? 'Scanning project files…' : commandCandidatesError || 'No entry points found.')}</p>`}<div class="mcp-discovery-note">Discovery reads project files only. Test commands and help run after an explicit click.</div></section>`;
    const candidate = selectedCandidate();
    const configuredItem = commandSelected();
    const detail = candidate ? discoveredDetail(candidate) : configuredItem ? configuredDetail(configuredItem) : '<section class="card mcp-main cli-explorer-main"><div class="mcp-start"><h3>No CLI tool selected</h3><p>Open a local project to find command-line entry points, or add one to productview.yaml.</p></div></section>';
    return `<div class="mcp-shell cli-explorer-shell">${pageHead('CLI Explorer', 'Discover project commands, inspect their manuals and try them locally.', `<button type="button" class="btn" data-cli="refresh" ${!commandLive() || commandCandidatesLoading ? 'disabled' : ''}>Refresh discovery</button><button type="button" class="btn primary" data-cli-manage="add" ${!commandLive() ? 'disabled title="Open a local project to edit productview.yaml"' : ''}>Add CLI tool</button>`)}<div class="mcp-layout cli-explorer-layout">${catalog}${detail}</div><div class="footer-note">${icon('clock')} Commands run locally only after an explicit click. Trial output is limited to 64 KB.</div></div>`;
  };

  document.addEventListener('input', event => {
    if (event.target.id !== 'cliTrialArgs') return;
    const id = toolId(); if (!id) return;
    if (button.dataset.cliExplore === 'insert') {
      const token = button.dataset.cliToken;
      if (!token) return;
      trialArgs[id] = [trialArgs[id]?.trim(), token].filter(Boolean).join('\n');
      render(); document.getElementById('cliTrialArgs')?.focus(); return;
    }
    trialArgs[id] = event.target.value;
    const base = selectedCandidate()?.id === id ? selectedCandidate().command : commandSelected()?.runtime?.command;
    const preview = document.getElementById('cliTrialPreview');
    if (preview) preview.textContent = shown([...(base || []), ...parts(event.target.value)]);
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-cli-explore]'); if (!button || state.page !== 'commands') return;
    const id = toolId(); if (!id) return;
    if (button.dataset.cliExplore === 'clear') { delete trialResults[id]; render(); return; }
    if (button.dataset.cliExplore !== 'run' || !commandLive() || trialBusy[id]) return;
    const args = parts(trialArgs[id]);
    if (args.length > 20 || args.some(arg => arg.length > 200)) { toast('Use at most 20 arguments of 200 characters each.'); return; }
    trialBusy[id] = true; render();
    try { trialResults[id] = await pv.tryCliTool(id, args); }
    catch (error) { toast(String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
    finally { trialBusy[id] = false; render(); }
  });
})();
