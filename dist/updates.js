(() => {
  if (!window.productView?.updateStatus) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<div class="update-banner-copy"><strong></strong><span></span></div><button type="button">Restart to update</button>';
  document.body.append(banner);
  const title = banner.querySelector('strong');
  const detail = banner.querySelector('span');
  const button = banner.querySelector('button');
  const render = state => {
    banner.hidden = !state || state.enabled === false || !['downloading', 'ready'].includes(state.phase);
    if (banner.hidden) return;
    const version = state.version ? `v${state.version}` : 'new version';
    title.textContent = `Project Room ${version} is available`;
    detail.textContent = state.phase === 'ready'
      ? 'Ready to install. Running local services will stop when the app restarts.'
      : `Downloading update${state.percent ? ` · ${state.percent}%` : '…'}`;
    button.hidden = state.phase !== 'ready';
  };
  window.productView.onUpdateState(render);
  window.productView.updateStatus().then(render).catch(() => {});
  button.addEventListener('click', () => window.productView.installUpdate().catch(() => {}));
})();
