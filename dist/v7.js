/* Sidebar presentation is a local preference, never part of project config. */
(() => {
  const key = 'productview.sidebar.expanded';
  const toggle = document.getElementById('sidebarToggle');
  if (!toggle) return;
  const setExpanded = expanded => {
    document.body.classList.toggle('sidebar-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    const label = expanded ? 'Collapse sidebar' : 'Expand sidebar';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    try { localStorage.setItem(key, expanded ? 'true' : 'false'); } catch (_) {}
  };
  let saved = false;
  try { saved = localStorage.getItem(key) === 'true'; } catch (_) {}
  setExpanded(saved);
  document.querySelectorAll('#sidebarToggle, [data-sidebar-toggle]').forEach(button => {
    button.addEventListener('click', () => setExpanded(!document.body.classList.contains('sidebar-expanded')));
  });
})();
