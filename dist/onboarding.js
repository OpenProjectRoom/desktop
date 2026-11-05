/* Read-only repository discovery and agent-assisted first setup. */
(() => {
  let poller = null;
  let active = null;
  const root = document.getElementById('modalRoot');
  const list = (items, fallback) => items.length ? items.map(item => '<span class="onboarding-chip">' + escapeHtml(item) + '</span>').join('') : '<span class="onboarding-muted">' + fallback + '</span>';

  function renderReview(review) {
    const target = document.getElementById('onboardingReview');
    if (!target) return;
    const open = document.getElementById('onboardingOpen');
    open.disabled = review.state !== 'ready';
    if (review.state === 'waiting') {
      target.innerHTML = '<strong>Waiting for productview.yaml</strong><p>Paste the prompt into your agent. Project Room checks this folder while the dialog is open.</p>';
    } else if (review.state === 'invalid') {
      target.innerHTML = '<strong>Configuration needs a fix</strong><pre>' + escapeHtml(review.message) + '</pre>';
    } else {
      target.innerHTML = '<strong>Valid YAML · ' + review.components.length + ' components · ' + review.connections + ' connections</strong>' +
        '<p>' + escapeHtml(review.name) + ' is ready to preview in Project Room.</p>' +
        '<div class="onboarding-chips">' + review.components.map(item => '<span class="onboarding-chip">' + escapeHtml(item.name) + ' · ' + escapeHtml(item.kind) + '</span>').join('') + '</div>' +
        (review.warnings.length ? '<div class="onboarding-warning"><strong>Check these paths</strong><ul>' + review.warnings.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>' : '') +
        '<details><summary>Inspect YAML source</summary><pre>' + escapeHtml(review.raw) + '</pre></details>';
    }
  }

  async function refreshReview() {
    if (!active) return;
    try { renderReview(await window.productView.reviewOnboarding()); }
    catch (error) { renderReview({ state: 'invalid', message: error.message }); }
  }
  function close() {
    if (poller) clearInterval(poller);
    poller = null;
    active = null;
    root.innerHTML = '';
  }
  window.showAgentOnboarding = data => {
    close();
    active = data;
    const item = data.inventory;
    root.innerHTML = '<div class="modal-backdrop"><section class="modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">' +
      '<div class="modal-head"><div><small>LOCAL PROJECT SETUP</small><h2 id="onboardingTitle">Set up with a coding agent</h2></div><button type="button" class="icon-btn" data-onboard="close" aria-label="Close">×</button></div>' +
      '<div class="onboarding-body"><p>Project Room inspected this folder without changing it. Let Codex or Claude Code build the shared configuration, then review it here.</p>' +
      '<div class="onboarding-path">' + escapeHtml(item.root) + '</div>' +
      '<div class="onboarding-inventory"><div><strong>Specifications</strong><div class="onboarding-chips">' + list(item.specs, 'None found') + '</div></div>' +
      '<div><strong>Documentation</strong><div class="onboarding-chips">' + list(item.docs, 'None found') + '</div></div>' +
      '<div><strong>Runtime clues</strong><div class="onboarding-chips">' + list(item.compose, 'No Compose file found') + '</div></div>' +
      '<div><strong>Package scripts</strong><div class="onboarding-chips">' + list(item.scripts, 'None found') + '</div></div><div><strong>Data candidates</strong><div class="onboarding-chips">' + list(item.dataCandidates || [], 'None found') + '</div></div></div>' +
      '<div class="onboarding-prompt-head"><strong>1 · Give your agent this task</strong><button type="button" class="btn" data-onboard="copy">Copy agent prompt</button></div>' +
      '<textarea id="onboardingPrompt" readonly aria-label="Agent setup prompt"></textarea>' +
      '<div class="onboarding-review-head"><strong>2 · Review the result</strong><button type="button" class="btn" data-onboard="check">Check now</button></div>' +
      '<div id="onboardingReview" class="onboarding-review" role="status"></div></div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-onboard="close">Close</button><button type="button" class="btn primary" id="onboardingOpen" data-onboard="open" disabled>Open project map</button></div>' +
      '</section></div>';
    document.getElementById('onboardingPrompt').value = data.prompt;
    renderReview(data.review);
    poller = setInterval(refreshReview, 3000);
  };
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-onboard]');
    if (!button || !active) return;
    try {
      if (button.dataset.onboard === 'close') close();
      else if (button.dataset.onboard === 'copy') {
        await window.productView.copyOnboardingPrompt(active.prompt);
        button.textContent = 'Copied';
        setTimeout(() => { if (button.isConnected) button.textContent = 'Copy agent prompt'; }, 2000);
      } else if (button.dataset.onboard === 'check') await refreshReview();
      else if (button.dataset.onboard === 'open') {
        const project = await window.productView.openOnboardedProject();
        close();
        await loadWorkspace(project);
        state.page = 'overview';
        render();
      }
    } catch (error) {
      const target = document.getElementById('onboardingReview');
      if (target) target.innerHTML = '<strong>Could not continue</strong><pre>' + escapeHtml(error.message) + '</pre>';
    }
  });
})();
