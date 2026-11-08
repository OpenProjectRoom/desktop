/* Offers a reload when .projectroom/project.yaml changes outside Project Room; refreshes .env-backed views quietly. */
(() => {
  const pv = window.productView;
  if (!pv?.onProjectFilesChanged) return;
  const banner = document.createElement('div');
  banner.className = 'config-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<div class="config-banner-copy"><strong></strong><span></span></div>' +
    '<button type="button" data-config-reload>Reload</button><button type="button" class="ghost" data-config-dismiss aria-label="Dismiss">Later</button>';
  document.body.append(banner);
  const title = banner.querySelector('strong');
  const detail = banner.querySelector('span');
  const reloadButton = banner.querySelector('[data-config-reload]');
  let pendingRoot = null;
  let reloading = false;

  function hide() { banner.hidden = true; pendingRoot = null; }
  function show(change) {
    pendingRoot = change.root;
    banner.classList.toggle('invalid', !change.valid);
    title.textContent = change.valid ? 'Project configuration changed' : 'Project configuration has an error';
    detail.textContent = change.valid
      ? '.projectroom/project.yaml was edited outside Project Room. Reload to show it; running services keep running.'
      : `The current view stays as it is until the file is fixed. ${change.message || ''}`.trim();
    reloadButton.hidden = !change.valid;
    banner.hidden = false;
  }

  async function reload() {
    if (reloading || !projectRoot || pendingRoot !== projectRoot) return;
    reloading = true;
    reloadButton.disabled = true;
    const page = state.page;
    try {
      const updated = await pv.openProject(projectRoot);
      setProject(updated);
      if (state.page !== page) { state.page = page; render(); }
      hide();
      toast('Configuration reloaded.');
    } catch (cause) {
      show({ root: pendingRoot, valid: false, message: cause.message });
    } finally {
      reloading = false;
      reloadButton.disabled = false;
    }
  }

  pv.onProjectFilesChanged(change => {
    if (!change || !projectRoot || change.root !== projectRoot) return;
    if (change.kind === 'env') {
      window.dispatchEvent(new CustomEvent('projectroom:env-changed'));
      return;
    }
    show(change);
  });
  reloadButton.addEventListener('click', reload);
  banner.querySelector('[data-config-dismiss]').addEventListener('click', hide);
})();
