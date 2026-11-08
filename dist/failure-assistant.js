/* A failed local action can be inspected before a separately approved repair. */
(() => {
  const pv = window.productView;
  if (!pv?.listFailures) return;
  let failures = [];
  let loadedRoot = null;
  let loadingRoot = null;
  let busy = false;
  let busyAction = null;
  let busyStartedAt = 0;
  let busyTimer = null;
  let openId = null;
  let errorText = '';
  let retryText = '';
  const safe = value => escapeHtml(String(value ?? ''));
  const failure = id => failures.find(item => item.id === id);
  const label = item => ({ 'cli-trial': 'CLI command', tool: 'CLI tool', start: 'Application or service', rebuild: 'Build', test: 'Test suite', 'test-case': 'Test case' })[item.action] || 'Action';
  const pageMatches = item => ({ 'cli-trial': ['commands'], tool: ['commands'], start: ['dashboard', 'applications', 'runtime'], rebuild: ['dashboard', 'applications', 'runtime'], test: ['tests', 'dashboard'], 'test-case': ['tests', 'dashboard'] })[item.action]?.includes(state.page);

  async function refresh() {
    const root = projectRoot;
    if (!root) { failures = []; loadedRoot = null; return; }
    if (loadingRoot === root) return;
    loadingRoot = root;
    try {
      const result = await pv.listFailures();
      if (projectRoot !== root) return;
      failures = result;
      loadedRoot = root;
      render();
      if (openId) showDialog();
    } catch (cause) { if (projectRoot === root) console.warn('Could not load failed actions:', cause); }
    finally { if (loadingRoot === root) loadingRoot = null; }
  }

  function callout(item) {
    return `<div class="failure-callout" role="alert"><div><strong>${safe(label(item))} failed${item.exitCode == null ? '' : ` · exit ${safe(item.exitCode)}`}</strong><span>${safe(item.message)}</span></div><button type="button" class="btn small" data-failure="open" data-failure-id="${safe(item.id)}">Investigate problem</button></div>`;
  }
  function insertCallout() {
    if (!projectRoot || !loadedRoot || loadedRoot !== projectRoot) return;
    const content = document.getElementById('content');
    const selectedTool = content?.querySelector('.cli-explorer-item.selected');
    const selectedId = selectedTool?.dataset.cliId || selectedTool?.dataset.v5?.replace(/^select:/, '');
    const item = failures.find(entry => !entry.resolved && pageMatches(entry) && (state.page !== 'commands' || !selectedId || entry.componentId === selectedId));
    if (!item) return;
    if (!content) return;
    const anchor = item.action === 'cli-trial' ? content.querySelector('.cli-trial-result, .cli-explore-body .mcp-action-row') :
      item.action === 'tool' ? content.querySelector('.cli-man-content, .cli-launch-bar') :
      ['start', 'rebuild'].includes(item.action) ? content.querySelector('.service-start-error, .overview-launch-error, .overview-launch-feedback') : null;
    if (anchor) anchor.insertAdjacentHTML('afterend', callout(item));
    else {
      const head = content.querySelector('.page-head, .mcp-page-head, .v3-page-head') || content.firstElementChild;
      if (head) head.insertAdjacentHTML('afterend', callout(item));
      else content.insertAdjacentHTML('afterbegin', callout(item));
    }
  }
  const oldRender = render;
  render = function (...args) {
    const result = oldRender.apply(this, args);
    if (projectRoot && loadedRoot !== projectRoot) queueMicrotask(refresh);
    insertCallout();
    return result;
  };

  function showDialog() {
    const item = failure(openId);
    if (!item) { openId = null; document.getElementById('modalRoot').innerHTML = ''; return; }
    const plan = item.plan;
    const steps = plan ? `<section><h3>Proposed cause</h3><p>${safe(plan.cause)}</p><div class="failure-plan-grid"><div><h3>Files to change</h3>${plan.changes.length ? `<ul>${plan.changes.map(step => `<li>${safe(step)}</li>`).join('')}</ul>` : '<p>No file changes proposed.</p>'}</div><div><h3>Commands or installation</h3>${plan.commands.length ? `<ul>${plan.commands.map(step => `<li>${safe(step)}</li>`).join('')}</ul>` : '<p>No commands proposed.</p>'}</div></div><h3>How to verify</h3><p>${safe(plan.verification)}</p><small>Confidence: ${safe(plan.confidence)}. Review every proposed step before approving it. System-wide installs must be done manually.</small></section>` : '';
    const activity = busy ? ({
      diagnose: ['Investigating the problem', 'Your coding agent is checking the project and the failure read-only. Its proposal will appear here automatically.'],
      fix: ['Applying the approved fix', 'Your coding agent is making the approved project changes. The result will appear here automatically.'],
      retry: ['Running the action again', 'Project Room is repeating the same command and checking its result.'],
    })[busyAction] : null;
    const progress = activity ? `<div class="failure-progress" role="status" aria-live="polite"><span class="failure-spinner" aria-hidden="true"></span><div><strong>${activity[0]}</strong><p>${activity[1]}</p><small>Working for <span id="failureElapsed">${Math.floor((Date.now() - busyStartedAt) / 1000)}</span> seconds</small></div></div>` : item.fixed ? '<p class="failure-result" role="status">Fix attempt finished. Review the result below, then run the same action again to verify it.</p>' : '';
    const action = busy ? `<button type="button" class="btn primary failure-busy-button" disabled><span class="failure-spinner" aria-hidden="true"></span>${{ diagnose: 'Investigating…', fix: 'Applying fix…', retry: 'Running again…' }[busyAction]}</button>` : item.fixed ? '<button type="button" class="btn primary" data-failure="retry">Run again</button>' : plan?.changes?.length || plan?.commands?.length ? '<button type="button" class="btn primary" data-failure="fix">Apply fix</button>' : `<button type="button" class="btn primary" data-failure="diagnose">${plan ? 'Investigate again' : 'Investigate read-only'}</button>`;
    document.getElementById('modalRoot').innerHTML = `<div class="modal-backdrop failure-backdrop"><div class="modal failure-dialog" role="dialog" aria-modal="true" aria-label="Investigate failed action"><div class="modal-head"><div><span class="failure-eyebrow">FAILED ACTION · ${safe(label(item))}</span><h2>Investigate problem</h2></div><button type="button" class="icon-btn" data-failure="close" aria-label="Close">×</button></div><div class="modal-body failure-body"><p class="failure-intro">Project Room sends the command, folder, exit code and a short redacted log to your selected coding agent. Investigation is read-only. A repair requires your separate approval.</p>${progress}<dl class="failure-context"><div><dt>Command</dt><dd><code>${safe(item.command || 'Unavailable')}</code></dd></div><div><dt>Working folder</dt><dd><code>${safe(item.cwd)}</code></dd></div><div><dt>Exit code</dt><dd>${safe(item.exitCode ?? 'Unavailable')}</dd></div><div><dt>Error</dt><dd>${safe(item.message)}</dd></div></dl>${item.log ? `<details><summary>Recent output sent to the agent</summary><pre>${safe(item.log)}</pre></details>` : ''}${steps}${item.fixResult ? `<section><h3>Fix attempt</h3><pre>${safe(item.fixResult)}</pre><small>Check the changes before running the same action again.</small></section>` : ''}${retryText ? `<p class="failure-result" role="status">${safe(retryText)}</p>` : ''}${errorText ? `<p class="failure-error" role="alert">${safe(errorText)}</p>` : ''}</div><div class="modal-actions"><button type="button" class="btn" data-failure="close">Close</button>${action}</div></div></div>`;
  }
  async function retry(item) {
    // A coding agent may have updated project.yaml. Reopen it before repeating the action.
    const page = state.page;
    const updatedProject = await pv.openProject(projectRoot);
    setProject(updatedProject);
    state.page = page;
    render();
    let result;
    if (item.action === 'cli-trial') result = await pv.retryFailedCli(item.id);
    else if (item.action === 'start') result = await pv.startComponent(item.componentId);
    else if (item.action === 'rebuild') result = await pv.rebuildComponent(item.componentId);
    else if (item.action === 'test') result = await pv.runTestSuite(item.componentId);
    else if (item.action === 'test-case') result = await pv.runTestCase(item.componentId, item.caseId);
    else if (item.action === 'tool') result = await pv.startCommandTool(item.componentId);
    else throw new Error('This action cannot be rerun automatically.');
    if (result?.exitCode != null && result.exitCode !== 0 || result?.timedOut) {
      retryText = `The same action failed again${result.exitCode == null ? '.' : ` (exit ${result.exitCode}).`} Review the new output before another fix.`;
      await refresh();
      return;
    }
    if (item.action !== 'cli-trial') await pv.resolveFailure(item.id);
    retryText = 'The same action completed. Check its output and status in this view.';
    await refresh();
    refreshHistory?.().catch(() => {});
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-failure]');
    if (!button) return;
    const action = button.dataset.failure;
    if (action === 'close') { openId = null; document.getElementById('modalRoot').innerHTML = ''; return; }
    if (busy) return;
    if (action === 'open') { openId = button.dataset.failureId; errorText = ''; retryText = ''; showDialog(); return; }
    const item = failure(openId);
    if (!item) return;
    busy = true; busyAction = action; busyStartedAt = Date.now(); errorText = ''; retryText = ''; showDialog();
    busyTimer = setInterval(() => {
      const elapsed = document.getElementById('failureElapsed');
      if (elapsed) elapsed.textContent = String(Math.floor((Date.now() - busyStartedAt) / 1000));
    }, 1000);
    try {
      let updated;
      if (action === 'diagnose') updated = await pv.diagnoseFailure(item.id);
      else if (action === 'fix') updated = await pv.applyFailureFix(item.id);
      else if (action === 'retry') await retry(item);
      if (updated) { failures = failures.map(entry => entry.id === updated.id ? updated : entry); render(); }
    } catch (cause) { errorText = String(cause?.message || cause).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally { clearInterval(busyTimer); busyTimer = null; busy = false; busyAction = null; showDialog(); }
  });
  pv.onProcessEvent?.(event => { if (event?.type === 'failure') refresh(); });
  window.addEventListener('projectroom:configuration-reloaded', refresh);
  queueMicrotask(refresh);
})();
