/* Expandable test suites backed by local project commands and history. */
(() => {
  let loadedConfig = null;
  let entries = {};
  let expanded = new Set();
  let busy = new Set();
  let openLog = null;
  let logText = null;
  let error = '';
  let searches = {};
  let suiteSearch = '';
  const safe = value => escapeHtml(value == null ? '' : String(value));
  const suites = () => projectConfig.components.filter(item => item.kind === 'testSuite');
  globalThis.projectRoomFocusFirstTestSuite = () => {
    const first = suites()[0];
    if (first && !expanded.has(first.id)) { expanded.add(first.id); render(); }
  };
  const eventFor = (id, caseId) => pvHistory.find(event => event.component === id && (caseId ? event.type === 'test.case.finished' && event.caseId === caseId : event.type === 'test.finished'));
  const status = event => !event ? '<span class="test-state muted">No run yet</span>' : `<span class="test-state ${event.exitCode === 0 ? 'passed' : 'failed'}">${event.exitCode === 0 ? 'Passed' : 'Failed'}</span><time title="${safe(event.at)}">${safe(new Date(event.at).toLocaleString())}</time>`;
  const action = (label, value, disabled = false) => `<button type="button" class="btn small" data-test-explorer="${safe(value)}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const latestLog = (suiteId, caseId) => openLog === `${suiteId}:${caseId || ''}` ? `<div class="test-log"><div><strong>Latest output</strong>${action('Close', 'close-log')}</div><pre>${safe(logText || 'No output recorded.')}</pre></div>` : '';
  function caseRow(suite, item) {
    const result = eventFor(suite.id, item.id);
    const running = busy.has(suite.id) || desktopStatus[suite.id] === 'running';
    return `<div class="test-case${item.kind === 'node' ? ' inner-test' : ''}"><div class="test-case-copy"><strong>${safe(item.name)}</strong><small>${safe(item.kind === 'rust' ? 'Rust test' : item.kind === 'node' ? `Node test · ${item.file}` : item.kind === 'file' ? 'Run every test in this file' : 'Configured command')}</small></div><div class="test-case-result">${status(result)}</div><div class="test-case-actions">${action('Run', `case:${suite.id}:${encodeURIComponent(item.id)}`, running || !projectRoot)}${result ? action('Output', `log:${suite.id}:${encodeURIComponent(item.id)}`) : ''}</div></div>${latestLog(suite.id, item.id)}`;
  }
  function suiteCard(suite) {
    const entry = entries[suite.id];
    const isOpen = expanded.has(suite.id);
    const running = busy.has(suite.id) || desktopStatus[suite.id] === 'running';
    const result = eventFor(suite.id);
    const cases = entry?.cases || [];
    const query = (searches[suite.id] || '').toLowerCase();
    const visibleCases = query ? cases.filter(item => item.name.toLowerCase().includes(query)) : cases;
    return `<section class="card test-suite" ${suiteSearch && !suite.name.toLowerCase().includes(suiteSearch) ? 'hidden' : ''}><div class="test-suite-head"><button type="button" class="test-suite-toggle" data-test-explorer="toggle:${safe(suite.id)}" aria-expanded="${isOpen}"><span class="test-chevron">${isOpen ? '⌄' : '›'}</span><span class="test-suite-title"><strong>${safe(suite.name)}</strong><small>${safe((suite.tests.command || []).join(' '))}</small></span></button><div class="test-suite-meta">${running ? '<span class="test-state running">Running</span>' : status(result)}</div>${action(running ? 'Running…' : 'Run suite', `suite:${suite.id}`, running || !projectRoot)}</div>${isOpen ? `<div class="test-suite-body"><div class="test-suite-summary"><span>${entry ? entry.canDiscover && !entry.discovered ? 'Test names not loaded · Cargo test list' : `${cases.length} ${cases.length === 1 ? 'item' : 'items'} · ${safe(entry.source)}` : projectRoot ? 'Finding test entries…' : 'Open a project folder to inspect tests'}</span>${entry?.canDiscover ? action(busy.has(`${suite.id}:discover`) ? 'Discovering…' : 'Discover Rust tests', `discover:${suite.id}`, busy.has(`${suite.id}:discover`)) : entry?.source === 'Node test script' ? action('Refresh test names', `refresh:${suite.id}`, busy.has(suite.id)) : ''}${result ? action('Suite output', `log:${suite.id}`) : ''}</div>${entry?.canDiscover && !cases.length ? `<p class="test-hint">${entry.discovered ? 'Cargo reported no individual tests.' : 'Rust test names are listed on request. Discovery compiles test binaries but does not execute tests.'}</p>` : ''}${cases.length > 8 ? `<div class="test-search"><input type="search" data-test-search="${safe(suite.id)}" value="${safe(searches[suite.id] || '')}" placeholder="Find a test…" aria-label="Filter tests in ${safe(suite.name)}"><span>${visibleCases.length} shown</span></div>` : ''}${cases.length ? `<div class="test-case-list">${visibleCases.length ? visibleCases.map(item => caseRow(suite, item)).join('') : '<p class="test-hint">No matching tests.</p>'}</div>` : entry && !entry.canDiscover ? '<p class="test-hint">No individual tests detected. Declare <code>tests.cases</code> in .projectroom/project.yaml for this runner.</p>' : ''}${latestLog(suite.id, null)}</div>` : ''}</section>`;
  }
  testsPage = function () {
    if (loadedConfig !== projectConfig) {
      loadedConfig = projectConfig; entries = {}; expanded = new Set(suites()[0] ? [suites()[0].id] : []); searches = {}; suiteSearch = ''; openLog = null; logText = null;
      if (pv && projectRoot) queueMicrotask(async () => {
        try {
          const found = await Promise.all(suites().map(async suite => [suite.id, await pv.listTestCases(suite.id)]));
          if (loadedConfig !== projectConfig) return;
          entries = Object.fromEntries(found);
        } catch (cause) { error = cause.message; }
        if (state.page === 'tests') render();
      });
    }
    return `${pageHead('Test Explorer', 'Run a suite or an individual test.')}<div class="test-explorer">${suites().length > 1 ? `<input class="explorer-search test-suite-search" id="testSuiteSearch" type="search" placeholder="Search suites" aria-label="Search test suites" value="${safe(suiteSearch)}">` : ''}${error ? `<div class="test-error" role="alert">${safe(error)}</div>` : ''}${suites().length ? suites().map(suiteCard).join('') : '<section class="card test-empty">No test suites configured in .projectroom/project.yaml.</section>'}<details class="test-footnote"><summary>About test history</summary><p>Runs are manual. Results and command output are saved in this repository’s <code>.productview/</code> history.</p></details></div>`;
  };
  document.addEventListener('click', async event => {
    if (state.page !== 'tests') return;
    const target = event.target.closest('[data-test-explorer]');
    if (!target) return;
    const [verb, suiteId, encodedCase] = target.dataset.testExplorer.split(':');
    const caseId = encodedCase ? decodeURIComponent(encodedCase) : null;
    if (verb === 'toggle') { expanded.has(suiteId) ? expanded.delete(suiteId) : expanded.add(suiteId); render(); return; }
    if (verb === 'close-log') { openLog = null; logText = null; render(); return; }
    if (!pv || !projectRoot || busy.has(suiteId)) return;
    error = '';
    if (verb === 'log') {
      try { const result = await pv.readTestLog(suiteId, caseId); openLog = `${suiteId}:${caseId || ''}`; logText = result?.text || 'No output recorded.'; if (result?.truncated) logText = '… earlier output omitted …\n' + logText; }
      catch (cause) { error = cause.message; }
      render(); return;
    }
    busy.add(suiteId);
    if (verb === 'discover') busy.add(`${suiteId}:discover`);
    render();
    try {
      if (verb === 'discover') entries[suiteId] = await pv.discoverTestCases(suiteId);
      if (verb === 'refresh') entries[suiteId] = await pv.listTestCases(suiteId);
      if (verb === 'suite') { const result = await pv.runTestSuite(suiteId); toast(result.exitCode === 0 ? 'Test suite passed.' : `Test suite failed · exit ${result.exitCode}`); }
      if (verb === 'case') { const result = await pv.runTestCase(suiteId, caseId); toast(result.exitCode === 0 ? 'Test passed.' : `Test failed · exit ${result.exitCode}`); }
      if (verb === 'suite' || verb === 'case') await refreshHistory();
    } catch (cause) { error = cause.message; }
    finally { busy.delete(suiteId); busy.delete(`${suiteId}:discover`); render(); }
  });
  document.addEventListener('input', event => {
    if (state.page === 'tests' && event.target.id === 'testSuiteSearch') {
      suiteSearch = event.target.value.trim().toLowerCase();
      document.querySelectorAll('.test-suite').forEach(card => {
        card.hidden = !card.querySelector('.test-suite-title strong')?.textContent.toLowerCase().includes(suiteSearch);
      });
      return;
    }
    if (state.page !== 'tests' || !event.target.matches('[data-test-search]')) return;
    const id = event.target.dataset.testSearch;
    const position = event.target.selectionStart;
    searches[id] = event.target.value;
    render();
    const input = [...document.querySelectorAll('[data-test-search]')].find(item => item.dataset.testSearch === id);
    input?.focus();
    if (position != null) input?.setSelectionRange(position, position);
  });
  if (pv?.onProcessEvent) pv.onProcessEvent(event => { if (state.page === 'tests' && event.type === 'status') render(); });
})();
