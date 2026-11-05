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
  const card = (number, id, title, description, detail, buttons, done, auto = false) =>
    '<section class="card onboarding-step' + (done ? ' done' : '') + '">' +
      '<div class="onboarding-step-number">' + number + '</div><div class="onboarding-step-body"><div class="onboarding-step-title"><h2>' + title + '</h2><span>' + (done ? 'Done' : 'To check') + '</span></div>' +
      '<p>' + description + '</p>' + (detail ? '<div class="onboarding-step-detail">' + detail + '</div>' : '') +
      '<div class="onboarding-step-actions">' + buttons +
        (auto ? '' : '<label class="onboarding-confirm"><input type="checkbox" data-onboard-check="' + id + '"' + (done ? ' checked' : '') + (projectRoot ? '' : ' disabled') + '> I checked this</label>') +
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
    const done = { project: local, agent: Boolean(checked.agent), analysis: valid, map: Boolean(checked.map), services: Boolean(checked.services), tests: Boolean(checked.tests), data: Boolean(checked.data), specs: Boolean(checked.specs), mcp: Boolean(checked.mcp), cli: Boolean(checked.cli), api: Boolean(checked.api) };
    const completed = Object.values(done).filter(Boolean).length;
    const prompt = guide?.prompt || '';
    const status = !local ? 'Open a local project to begin.' : loading ? 'Inspecting the selected project…' : error ? escapeHtml(error) : review?.state === 'invalid' ? 'YAML needs a fix: ' + escapeHtml(review.message) : valid ? escapeHtml(review.name) + ' · ' + review.components.length + ' components · ' + review.connections + ' connections' : 'Waiting for .projectroom/project.yaml.';
    const warnings = valid && review.warnings.length ? '<div class="onboarding-alert">Check these paths: ' + review.warnings.map(escapeHtml).join(' · ') + '</div>' : '';
    const viewerList = data.map(item => '<span>' + escapeHtml(item.name) + ': ' + escapeHtml(item.data?.engine || item.data?.path || 'external') + '</span>').join('');
    const sourceCandidates = (guide?.inventory?.dataCandidates || []).map(item => escapeHtml(item)).join('<br>');
    return '<div class="onboarding-shell">' +
      '<div class="page-head"><div><div class="eyebrow">PROJECT ROOM / WORKSPACE</div><h1>Onboarding</h1><p>Set up this repository, then check what Project Room actually shows and runs.</p></div></div>' +
      '<section class="card onboarding-progress"><div><strong>' + completed + ' of 11 steps checked</strong><span>' + escapeHtml(projectRoot || 'Interactive demo') + '</span></div><div class="onboarding-progress-track" role="progressbar" aria-label="Onboarding progress" aria-valuemin="0" aria-valuemax="11" aria-valuenow="' + completed + '"><i style="width:' + (completed / 11 * 100) + '%"></i></div><small>Checks are saved on this computer for this workspace. Project YAML and files remain in the repository.</small></section>' +
      '<div class="onboarding-steps">' +
      card(1, 'project', 'Open a project', 'Select a repository folder on this computer. Existing Spec Kit files can stay in their own folders.', '<strong>Current workspace</strong><span>' + escapeHtml(projectRoot || 'No local project selected') + '</span>', '<button type="button" class="btn" data-onboard-open>Open project folder</button>', done.project, true) +
      card(2, 'agent', 'Give Codex or Claude Code the Project Room guide', 'Copy this project-specific prompt into the coding agent already working in the repository. It points to the exported skill and schema, asks for a truthful .projectroom/project.yaml, and does not run commands.', local ? '<details><summary>Read the exact agent prompt</summary><textarea readonly aria-label="Project Room agent prompt">' + escapeHtml(prompt || 'Loading prompt…') + '</textarea></details>' : 'Open a local project to generate its prompt.', '<button type="button" class="btn" data-onboard-copy' + (!prompt ? ' disabled' : '') + '>Copy agent prompt</button>' + action('Agent Access', 'agent'), done.agent) +
      card(3, 'analysis', 'Analyze and validate the configuration', 'Ask the agent to inspect real specs, scripts, processes, tests and data sources. Refresh here after it writes .projectroom/project.yaml.', '<strong>Current result</strong><span>' + status + '</span>' + warnings, '<button type="button" class="btn" data-onboard-refresh' + (!local ? ' disabled' : '') + '>Refresh analysis</button>', done.analysis, true) +
      card(4, 'map', 'Review the Project Map', 'Check each component and connection. Missing or misleading entries should be corrected in .projectroom/project.yaml with your agent.', '<strong>Found</strong><span>' + projectConfig.components.length + ' components · ' + projectConfig.connections.length + ' connections</span>', action('Open Project Map', 'overview'), done.map) +
      card(5, 'services', 'Try Services', 'Confirm the start and stop commands are real and safe for this project. Start one service, inspect its status and output, then stop it.', '<strong>Configured</strong><span>' + services.length + ' service' + (services.length === 1 ? '' : 's') + (services.length ? ': ' + escapeHtml(services.map(item => item.name).join(', ')) : ' · ask your agent if any are missing') + '</span>', action('Open Services', 'runtime'), done.services) +
      card(6, 'tests', 'Run a test suite', 'Check that the expected suites are registered, run a suitable one, and inspect its result and saved log.', '<strong>Configured</strong><span>' + tests.length + ' test suite' + (tests.length === 1 ? '' : 's') + (tests.length ? ': ' + escapeHtml(tests.map(item => item.name).join(', ')) : ' · ask your agent if any are missing') + '</span>', action('Open Test Explorer', 'tests'), done.tests) +
      card(7, 'data', 'Review Data Explorer and Environment', 'Check databases and storage, then open Environment to set missing local values. In Data Explorer, inspect a source and open a table or file to verify its structure and preview.', '<strong>Configured</strong><span>' + (viewerList || 'No data sources registered · ask your agent if any are missing') + '</span>' + (sourceCandidates ? '<strong>Detected candidates</strong><span>' + sourceCandidates + '</span>' : '') + '<em>PostgreSQL, MySQL/MariaDB, SQLite and local files have on-demand read-only viewers. Verify candidates before adding them to YAML.</em>', action('Open Data Explorer', 'data') + action('Open Environment', 'environment'), done.data) +
      card(8, 'specs', 'Check product context', 'Open Requirements and Documentation. Verify the existing specification folders and Markdown documents are visible without a duplicate structure.', '<strong>Specification roots</strong><span>' + escapeHtml(roots.join(', ') || 'None configured') + '</span>', action('Open Requirements', 'spec') + action('Open Documentation', 'docs'), done.specs) +
      card(9, 'mcp', 'Discover MCP servers', 'Review project MCP configurations. In MCP Explorer, connect explicitly, inspect advertised tools, resources and prompts, and try a safe call. No server starts during this scan.', '<strong>Detected in project files</strong><span>' + (mcpServers.length ? mcpServers.map(item => escapeHtml(item.name + ' · ' + item.source + ' · ' + item.transport)).join('<br>') : 'No project server found. The built-in Project Room MCP server is available in MCP Explorer.') + '</span>', action('Open MCP Explorer', 'mcp') + action('Open Environment', 'environment'), done.mcp) +
      card(10, 'cli', 'Explore command-line tools', 'Review executable CLI entry points found in this repository. Open CLI Explorer to read their help explicitly, then link useful tools to .projectroom/project.yaml. Discovery never runs a command.', '<strong>Detected candidates</strong><span>' + (cliTools.length ? cliTools.map(item => escapeHtml(item.name + ' · ' + item.path + (item.linked ? ' · linked' : ''))).join('<br>') : 'No likely CLI entry point found. Package scripts are not automatically treated as product CLIs.') + '</span>', action('Open CLI Explorer', 'commands'), done.cli) +
      card(11, 'api', 'Explore HTTP APIs', 'Review discovered OpenAPI files and registered API base URLs. Start the relevant service, then send one safe request deliberately and inspect status and response. Discovery itself never contacts an API.', '<strong>Registered APIs</strong><span>' + (apiSources.length ? apiSources.map(item => escapeHtml(item.name + ' · ' + item.baseUrl)).join('<br>') : 'None registered yet') + '</span><strong>OpenAPI files found</strong><span>' + (apiSpecs.length ? apiSpecs.map(item => escapeHtml(item.name + ' · ' + item.path)).join('<br>') : 'None found · you can still add an API by URL') + '</span>', action('Open API Explorer', 'api') + action('Open Environment', 'environment'), done.api) +
      '</div></div>';
  };
  document.addEventListener('change', event => {
    const id = event.target.dataset?.onboardCheck;
    if (!id || state.page !== 'onboarding') return;
    checked[id] = event.target.checked;
    save();
    render();
  });
  document.addEventListener('click', async event => {
    if (state.page !== 'onboarding') return;
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
        toast('Agent prompt copied. Mark this step after your agent has used it.');
      } catch (cause) { toast(cause.message); }
      return;
    }
    if (event.target.closest('[data-onboard-refresh]') && pv && projectRoot) {
      const root = projectRoot;
      try {
        const review = await pv.reviewCurrentOnboarding();
        if (review.state === 'ready') {
          const updated = await pv.openProject(root);
          setProject(updated);
          state.page = 'onboarding';
        }
        if (guide) guide.review = review;
        error = '';
        render();
      } catch (cause) { error = cause.message; render(); }
    }
  });
})();
