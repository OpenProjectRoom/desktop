/* Sidebar presentation is a local preference, never part of project config. */
(() => {
  const key = 'productview.sidebar.expanded';
  const toggle = document.getElementById('sidebarToggle');
  if (!toggle) return;
  const compactWindow = window.matchMedia('(max-width: 900px)');
  const setExpanded = (expanded, remember = true) => {
    document.body.classList.toggle('sidebar-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    const label = expanded ? 'Collapse sidebar' : 'Expand sidebar';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    if (remember) {
      try { localStorage.setItem(key, expanded ? 'true' : 'false'); } catch (_) {}
    }
  };
  let saved = false;
  try { saved = localStorage.getItem(key) === 'true'; } catch (_) {}
  setExpanded(!compactWindow.matches && saved, false);
  compactWindow.addEventListener('change', event => {
    if (event.matches) setExpanded(false, false);
  });
  document.querySelectorAll('#sidebarToggle, [data-sidebar-toggle]').forEach(button => {
    button.addEventListener('click', () => setExpanded(!document.body.classList.contains('sidebar-expanded')));
  });
})();
