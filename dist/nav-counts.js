/* Counts describe the entries available in each workspace view, not their live status. */
(() => {
  const nav = document.getElementById('nav');
  const countedPages = {
    vision: ['vision document', 'vision documents', () => Number(Boolean(projectConfig.product?.vision))],
    'north-star': ['North Star metric', 'North Star metrics', () => Number(Boolean(projectConfig.product?.northStar))],
    roadmap: ['roadmap item', 'roadmap items', () => projectConfig.product?.roadmap?.length || 0],
    issues: ['backlog issue', 'backlog issues', () => localBacklog.issues.length],
    spec: ['Spec Kit feature or specification file', 'Spec Kit features or specification files', () => specKit.detected ? specKit.features.length : specEntries.filter(item => item.type === 'file').length],
    docs: ['documentation file', 'documentation files', () => docEntries.filter(item => item.type === 'file').length],
    runtime: ['configured service', 'configured services', () => projectConfig.components.filter(item => item.kind === 'service').length],
    commands: ['configured CLI tool', 'configured CLI tools', () => projectConfig.components.filter(item => item.kind === 'commandTool').length],
    mcp: ['linked MCP server', 'linked MCP servers', () => projectConfig.workspace?.mcpServers?.length || 0],
    api: ['linked API', 'linked APIs', () => projectConfig.workspace?.apiSources?.length || 0],
    tests: ['configured test suite', 'configured test suites', () => projectConfig.components.filter(item => item.kind === 'testSuite').length],
    data: ['configured data source', 'configured data sources', () => projectConfig.components.filter(item => ['database', 'storage', 'external'].includes(item.kind)).length],
    environment: ['declared environment variable', 'declared environment variables', () => window.projectRoomEnvironmentCount?.() || 0]
  };

  for (const page of Object.keys(countedPages)) {
    const button = nav.querySelector(`[data-page="${page}"]`);
    if (button && !button.querySelector('.count')) {
      const count = document.createElement('span');
      count.className = 'count';
      button.append(count);
    }
  }

  function updateCounts() {
    for (const [page, [singular, plural, calculate]] of Object.entries(countedPages)) {
      const button = nav.querySelector(`[data-page="${page}"]`);
      const badge = button?.querySelector('.count');
      if (!badge) continue;
      const count = calculate();
      const description = count === 1 ? singular : plural;
      badge.textContent = String(count);
      badge.setAttribute('aria-label', `${count} ${description}`);
      button.title = `${button.querySelector('span:not(.count)')?.textContent || page} · ${count} ${description}`;
    }
  }

  window.updateProjectRoomNavCounts = updateCounts;
  const previousRender = render;
  render = function (...args) {
    const result = previousRender(...args);
    updateCounts();
    return result;
  };
  updateCounts();
})();
