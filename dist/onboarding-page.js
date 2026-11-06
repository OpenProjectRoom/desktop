/* Workspace-specific, locally saved onboarding checklist. */
(() => {
  let loadedRoot = null;
  let guide = null;
  let loading = false;
  let error = '';
  let checked = {};
  const key = () => 'productview.onboardingChecklist.v1:' + (projectRoot || 'demo');
  const save = () => { try { localStorage.setItem(key(), JSON.stringify(checked)); } catch (_) {} };
  const current = () => {
    const root = projectRoot || 'demo';
    if (loadedRoot === root) return;
    loadedRoot = root;
    guide = null;
    loading = false;
    error = '';
    try { checked = JSON.parse(localStorage.getItem(key()) || '{}') || {}; }
    catch (_) { checked = {}; }
  };
  async function loadGuide() {
    if (!pv || !projectRoot || loading || guide) return;
    const root = projectRoot;
    loading = true;
    error = '';
    try {
      const result = await pv.currentOnboarding();
      if (projectRoot === root) guide = result;
    } catch (cause) { if (projectRoot === root) error = cause.message; }
    finally { loading = false; if (state.page === 'onboarding' && projectRoot === root) render(); }
  }
  const action = (label, value, primary = false) => '<button type="button" class="btn' + (primary ? ' primary' : '') + '" data-onboard-page="' + value + '">' + label + '</button>';
  const card = (number, id, title, description, detail, buttons, ready, auto = false, verified = false, relevant = true, readyLabel = 'Configured') =>
    '<section class="card onboarding-step' + (ready ? ' ready' : '') + (verified ? ' verified' : '') + (!relevant ? ' optional' : '') + '">' +
      '<div class="onboarding-step-number">' + number + '</div><div class="onboarding-step-body"><div class="onboarding-step-title"><h2>' + title + '</h2><span>' + (!relevant ? 'Not detected · optional' : verified ? 'Verified' : ready ? readyLabel : 'To set up') + '</span></div>' +
      '<p>' + description + '</p>' + (detail ? '<div class="onboarding-step-detail">' + detail + '</div>' : '') +
      '<div class="onboarding-step-actions">' + buttons +
        (auto ? '' : '<button type="button" class="onboarding-verify' + (verified ? ' is-verified' : '') + '" data-onboard-verify="' + id + '" aria-pressed="' + verified + '"' + (verified ? ' title="Click to remove this confirmation"' : '') + (projectRoot && ready ? '' : ' disabled') + '>' + (verified ? '✓ Verified' : 'Mark as verified') + '</button>') +
      '</div></div></section>';
  window.onboardingPage = function () {
    current();
    if (pv && projectRoot && !guide && !loading && !error) queueMicrotask(loadGuide);
    const local = Boolean(pv && projectRoot);
    const review = guide?.review;
    const valid = review?.state === 'ready';
    const services = projectConfig.components.filter(item => item.kind === 'service');
    const tests = projectConfig.components.filter(item => item.kind === 'testSuite');
    const data = projectConfig.components.filter(item => ['database', 'storage', 'external'].includes(item.kind));
    const roots = projectConfig.views?.specifications?.roots || [];
    const mcpServers = guide?.inventory?.mcpServers || [];
    const cliTools = guide?.inventory?.cliTools || [];
    const apiSpecs = guide?.inventory?.apiSpecs || [];
    const apiSources = projectConfig.workspace?.apiSources || [];
    const linkedMcp = projectConfig.workspace?.mcpServers || [];
    const linkedCli = projectConfig.components.filter(item => item.kind === 'commandTool');
    const specificationFiles = specEntries.filter(item => item.type === 'file').length;
    const documentationFiles = docEntries.filter(item => item.type === 'file').length || (projectConfig.product?.documentation || []).length;
    const setup = {
      project: local,
      analysis: valid,
      map: valid && projectConfig.components.some(item => ['service', 'database', 'storage'].includes(item.kind) || item.kind === 'commandTool' && item.cli?.mode === 'server'),
      services: valid && services.length > 0,
      tests: valid && tests.length > 0,
      data: valid && data.length > 0,
      specs: valid && (roots.length > 0 || specKit.features.length > 0 || specificationFiles > 0 || documentationFiles > 0),
      mcp: valid && linkedMcp.length > 0,
      cli: valid && linkedCli.length > 0,
      api: valid && apiSources.length > 0
    };
    const relevant = {
      project: true, analysis: true,
      map: setup.map || services.length > 0 || (guide?.inventory?.compose || []).length > 0,
      services: services.length > 0 || (guide?.inventory?.compose || []).length > 0 || (guide?.inventory?.scripts || []).some(item => ['dev', 'start', 'serve'].includes(item)),
      tests: tests.length > 0 || (guide?.inventory?.scripts || []).some(item => /test|check|verify/.test(item)),
      data: data.length > 0 || (guide?.inventory?.dataCandidates || []).length > 0,
      specs: setup.specs || (guide?.inventory?.specs || []).length > 0 || (guide?.inventory?.docs || []).length > 0,
      mcp: linkedMcp.length > 0 || mcpServers.length > 0,
      cli: linkedCli.length > 0 || cliTools.length > 0,
      api: apiSources.length > 0 || apiSpecs.length > 0
    };
    const reviewIds = ['map', 'services', 'tests', 'data', 'specs', 'mcp', 'cli', 'api'];
    const reviewed = Object.fromEntries(reviewIds.map(id => [id, Boolean(setup[id] && checked[id])]));
    const completed = Object.keys(setup).filter(id => relevant[id] && setup[id]).length;
    const applicable = Object.values(relevant).filter(Boolean).length;
    const reviewable = reviewIds.filter(id => relevant[id] && setup[id]).length;
    const reviewedCount = Object.values(reviewed).filter(Boolean).length;
    const prompt = guide?.prompt || '';
    const status = !local ? 'Open a local project to begin.' : loading ? 'Inspecting the selected project…' : error ? escapeHtml(error) : review?.state === 'invalid' ? 'YAML needs a fix: ' + escapeHtml(review.message) : valid ? escapeHtml(review.name) + ' · ' + review.components.length + ' components · ' + review.connections + ' connections' : 'Waiting for .projectroom/project.yaml.';
    const warnings = valid && review.warnings.length ? '<div class="onboarding-alert">Review before running: ' + review.warnings.map(escapeHtml).join(' · ') + '</div>' : '';
    const viewerList = data.map(item => '<span>' + escapeHtml(item.name) + ': ' + escapeHtml(item.data?.engine || item.data?.path || 'external') + '</span>').join('');
    const sourceCandidates = (guide?.inventory?.dataCandidates || []).map(item => escapeHtml(item)).join('<br>');
    return '<div class="onboarding-shell">' +
      '<div class="page-head"><div><div class="eyebrow">PROJECT ROOM / PROJECT</div><h1>Onboarding</h1><p>Set up this repository, then check what Project Room actually shows and runs.</p></div></div>' +
      '<section class="card onboarding-progress"><div><strong>' + completed + ' of ' + applicable + ' detected sections configured</strong><span>' + escapeHtml(projectRoot || 'Interactive demo') + '</span></div><div class="onboarding-progress-track" role="progressbar" aria-label="Project setup progress" aria-valuemin="0" aria-valuemax="' + applicable + '" aria-valuenow="' + completed + '"><i style="width:' + (applicable ? completed / applicable * 100 : 0) + '%"></i></div><div class="onboarding-progress-explanation"><strong>' + reviewedCount + ' of ' + reviewable + ' available hands-on checks verified</strong><small>Undetected optional views do not lower setup progress. Configuration is separate from manual verification; neither proves that a command runs successfully.</small></div></section>' +
      '<details class="card onboarding-agent-help"><summary>Need help from a coding agent?</summary><p>Copy the Project Room prompt into Codex, Claude Code, or your usual agent when you want help setting up or updating this project. This is optional and does not affect setup progress.</p>' + (local ? '<details><summary>Read the exact agent prompt</summary><textarea readonly aria-label="Project Room agent prompt">' + escapeHtml(prompt || 'Loading prompt…') + '</textarea></details>' : '') + '<div class="onboarding-step-actions"><button type="button" class="btn" data-onboard-copy' + (!prompt ? ' disabled' : '') + '>Copy agent prompt</button>' + action('Agent Access', 'agent') + '</div></details>' +
      '<div class="onboarding-steps">' +
      card(1, 'project', 'Open a project', 'Select a repository folder on this computer. Existing Spec Kit files can stay in their own folders.', '<strong>Project folder</strong><span>' + escapeHtml(projectRoot || 'No local project selected') + '</span>', '<button type="button" class="btn" data-onboard-open>Open project folder</button>', setup.project, true, false, true, 'Opened') +
      card(2, 'analysis', 'Analyze and validate the configuration', 'Project Room checks .projectroom/project.yaml automatically. Refresh after your agent changes it.', '<strong>Current result</strong><span>' + status + '</span>' + warnings, '<button type="button" class="btn" data-onboard-refresh' + (!local ? ' disabled' : '') + '>Refresh analysis</button>', setup.analysis, true, false, true, 'Valid YAML') +
      card(3, 'map', 'Review the Project Map', 'Runtime components are read from project YAML. Open the map to judge whether its components and connections are accurate.', '<strong>Found in YAML</strong><span>' + projectConfig.components.length + ' components · ' + projectConfig.connections.length + ' connections</span>', action('Open Project Map', 'overview'), setup.map, false, reviewed.map, relevant.map) +
      card(4, 'services', 'Try Services', 'Service entries are detected automatically. Start one, inspect its output, and stop it before confirming the hands-on check.', '<strong>Configured in YAML</strong><span>' + services.length + ' service' + (services.length === 1 ? '' : 's') + (services.length ? ': ' + escapeHtml(services.map(item => item.name).join(', ')) : ' · ask your agent if any are missing') + '</span>', action('Open Services', 'runtime'), setup.services, false, reviewed.services, relevant.services) +
      card(5, 'tests', 'Run a test suite', 'Registered suites are detected automatically. Run a suitable suite and inspect its result and saved log before confirming.', '<strong>Configured in YAML</strong><span>' + tests.length + ' test suite' + (tests.length === 1 ? '' : 's') + (tests.length ? ': ' + escapeHtml(tests.map(item => item.name).join(', ')) : ' · ask your agent if any are missing') + '</span>', action('Open Test Explorer', 'tests'), setup.tests, false, reviewed.tests, relevant.tests) +
      card(6, 'data', 'Review Data Explorer and Environment', 'Declared data sources are detected automatically. Set missing local values, then inspect a table or file before confirming.', '<strong>Configured in YAML</strong><span>' + (viewerList || 'No data sources registered · ask your agent if any are missing') + '</span>' + (sourceCandidates ? '<strong>Detected candidates</strong><span>' + sourceCandidates + '</span>' : '') + '<em>Configured metadata does not prove that a database connection or viewer works.</em>', action('Open Data Explorer', 'data') + action('Open Environment', 'environment'), setup.data, false, reviewed.data, relevant.data) +
      card(7, 'specs', 'Check product context', 'Project Room detects specification roots and documentation. Open both views to confirm the files are useful and there is no duplicate tree.', '<strong>Project content</strong><span>' + escapeHtml(roots.join(', ') || 'No specification roots configured') + ' · ' + documentationFiles + ' documentation files</span>', action('Open Requirements', 'spec') + action('Open Documentation', 'docs'), setup.specs, false, reviewed.specs, relevant.specs) +
      card(8, 'mcp', 'Discover MCP servers', 'Registered project servers are detected automatically. Connecting and trying a safe call remain deliberate hands-on checks.', '<strong>Linked in YAML</strong><span>' + linkedMcp.length + ' server' + (linkedMcp.length === 1 ? '' : 's') + '</span><strong>Detected in project files</strong><span>' + (mcpServers.length ? mcpServers.map(item => escapeHtml(item.name + ' · ' + item.source + ' · ' + item.transport)).join('<br>') : 'No project server found. The built-in Project Room MCP server is available in MCP Explorer.') + '</span>', action('Open MCP Explorer', 'mcp') + action('Open Environment', 'environment'), setup.mcp, false, reviewed.mcp, relevant.mcp) +
      card(9, 'cli', 'Explore command-line tools', 'Linked CLI tools are detected automatically. Read help and try a safe command before confirming the hands-on check.', '<strong>Linked in YAML</strong><span>' + linkedCli.length + ' tool' + (linkedCli.length === 1 ? '' : 's') + '</span><strong>Detected candidates</strong><span>' + (cliTools.length ? cliTools.map(item => escapeHtml(item.name + ' · ' + item.path + (item.linked ? ' · linked' : ''))).join('<br>') : 'No likely CLI entry point found. Package scripts are not automatically treated as product CLIs.') + '</span>', action(window.productViewOptionalViewEnabled?.('commands') ? 'Open CLI Explorer' : 'Enable CLI Explorer', window.productViewOptionalViewEnabled?.('commands') ? 'commands' : 'settings'), setup.cli, false, reviewed.cli, relevant.cli) +
      card(10, 'api', 'Explore HTTP APIs', 'Registered APIs are detected automatically. Start the service and send a safe request before confirming the hands-on check.', '<strong>Registered APIs</strong><span>' + (apiSources.length ? apiSources.map(item => escapeHtml(item.name + ' · ' + item.baseUrl)).join('<br>') : 'None registered yet') + '</span><strong>OpenAPI files found</strong><span>' + (apiSpecs.length ? apiSpecs.map(item => escapeHtml(item.name + ' · ' + item.path)).join('<br>') : 'None found · you can still add an API by URL') + '</span>', action('Open API Explorer', 'api') + action('Open Environment', 'environment'), setup.api, false, reviewed.api, relevant.api) +
      '</div></div>';
  };
  document.addEventListener('click', async event => {
    if (state.page !== 'onboarding') return;
    const verify = event.target.closest('[data-onboard-verify]');
    if (verify && !verify.disabled) {
      const id = verify.dataset.onboardVerify;
      checked[id] = !checked[id];
      save();
      render();
      return;
    }
    const page = event.target.closest('[data-onboard-page]');
    if (page) { state.page = page.dataset.onboardPage; render(); window.scrollTo(0, 0); return; }
    if (event.target.closest('[data-onboard-open]')) {
      if (pv) await loadWorkspace(await pv.chooseProject());
      else toast('Open a project in the desktop app.');
      return;
    }
    if (event.target.closest('[data-onboard-copy]') && guide?.prompt) {
      try {
        if (pv) await pv.copyOnboardingPrompt(guide.prompt);
        else await navigator.clipboard.writeText(guide.prompt);
        toast('Project Room agent prompt copied.');
      } catch (cause) { toast(cause.message); }
      return;
    }
    if (event.target.closest('[data-onboard-refresh]') && pv && projectRoot) {
      const root = projectRoot;
      try {
        const refreshed = await pv.currentOnboarding();
        guide = refreshed;
        const review = refreshed.review;
        if (review.state === 'ready') {
          const updated = await pv.openProject(root);
          setProject(updated);
          state.page = 'onboarding';
        }
        error = '';
        render();
      } catch (cause) { error = cause.message; render(); }
    }
  });
})();
