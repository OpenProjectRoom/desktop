/* Read-only repository discovery and agent-assisted first setup. */
(() => {
  let poller = null;
  let active = null;
  const root = document.getElementById('modalRoot');
  const list = (items, fallback) => items.length ? items.map(item => '<span class="onboarding-chip">' + escapeHtml(item) + '</span>').join('') : '<span class="onboarding-muted">' + fallback + '</span>';

  function renderSignal(review) {
    if (review.state === 'ready') return '';
    const phases = {
      auditing: ['Agent reports: source audit started', 'The agent is inspecting this project. Project Room has not verified its findings yet.'],
      findings_ready: ['Agent reports: findings ready', 'Review the findings and reply in your coding agent before it writes the project configuration.'],
      configuring: ['Agent reports: configuring the project', 'Project Room is waiting to check the finished YAML.'],
      finished: ['Agent reports: configuration finished', 'Project Room is checking for the YAML in this folder.']
    };
    const phase = phases[review.progress?.phase];
    if (phase) {
      const time = new Date(review.progress.updatedAt);
      const last = Number.isNaN(time.getTime()) ? '' : ' · Last signal ' + escapeHtml(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      return '<div class="onboarding-signal"><strong>' + phase[0] + '</strong><small>' + last + '</small><p>' + phase[1] + '</p></div>';
    }
    if (review.copiedAt) return '<div class="onboarding-signal"><strong>Prompt copied · Waiting for agent signal</strong><p>Paste it into the coding agent working in this folder. Its first progress update will appear here when it starts.</p></div>';
    return '';
  }

  function renderReview(review) {
    const target = document.getElementById('onboardingReview');
    if (!target) return;
    const open = document.getElementById('onboardingOpen');
    open.disabled = review.state !== 'ready';
    const signal = renderSignal(review);
    if (review.state === 'waiting') {
      target.innerHTML = signal + '<strong>Waiting for .projectroom/project.yaml</strong><p>Project Room checks the same folder every few seconds. The YAML is verified separately from the agent’s progress reports.</p>';
    } else if (review.state === 'invalid') {
      target.innerHTML = signal + '<strong>Configuration needs a fix</strong><pre>' + escapeHtml(review.message) + '</pre>';
    } else {
      target.innerHTML = '<strong>Valid YAML · ' + review.components.length + ' components · ' + review.connections + ' connections</strong>' +
        '<p>' + escapeHtml(review.name) + ' is ready to open. Project Room checked ' + (review.checked?.paths || 0) + ' paths, ' + (review.checked?.commands || 0) + ' commands and ' + (review.checked?.environment || 0) + ' environment names without running them. Check real behavior in Onboarding.</p>' +
        '<div class="onboarding-chips">' + review.components.map(item => '<span class="onboarding-chip">' + escapeHtml(item.name) + ' · ' + escapeHtml(item.kind) + '</span>').join('') + '</div>' +
        (review.warnings.length ? '<div class="onboarding-warning"><strong>Review before running</strong><ul>' + review.warnings.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></div>' : '') +
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
      '<div class="onboarding-body"><p>Project Room inspected this folder without changing it. Paste the prompt into your coding agent. It first reports what it found and waits for your reply; then it creates the shared YAML for review here.</p>' +
      '<div class="onboarding-path">' + escapeHtml(item.root) + '</div>' +
      '<div class="onboarding-inventory"><div><strong>Specifications</strong><div class="onboarding-chips">' + list(item.specs, 'None found') + '</div></div>' +
      '<div><strong>Documentation</strong><div class="onboarding-chips">' + list(item.docs, 'None found') + '</div></div>' +
      '<div><strong>Runtime clues</strong><div class="onboarding-chips">' + list(item.compose, 'No Compose file found') + '</div></div>' +
      '<div><strong>Package scripts</strong><div class="onboarding-chips">' + list(item.scripts, 'None found') + '</div></div><div><strong>Data candidates</strong><div class="onboarding-chips">' + list(item.dataCandidates || [], 'None found') + '</div></div></div>' +
      '<div class="onboarding-prompt-head"><strong>1 · Ask your coding agent to audit the source</strong><button type="button" class="btn" data-onboard="copy">Copy agent prompt</button></div>' +
      '<textarea id="onboardingPrompt" readonly aria-label="Agent setup prompt"></textarea>' +
      '<div class="onboarding-review-head"><strong>2 · Review the result</strong><button type="button" class="btn" data-onboard="check">Check now</button></div>' +
      '<div id="onboardingReview" class="onboarding-review" role="status"></div><p class="onboarding-finish"><strong>3 · Open and verify.</strong> When YAML is valid, open this folder and use Onboarding to check the real commands and connections.</p></div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-onboard="close">Close</button><button type="button" class="btn primary" id="onboardingOpen" data-onboard="open" disabled>Open project and verify</button></div>' +
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
        await refreshReview();
        setTimeout(() => { if (button.isConnected) button.textContent = 'Copy agent prompt'; }, 2000);
      } else if (button.dataset.onboard === 'check') await refreshReview();
      else if (button.dataset.onboard === 'open') {
        const project = await window.productView.openOnboardedProject();
        close();
        await loadWorkspace(project);
        state.page = 'onboarding';
        render();
      }
    } catch (error) {
      const target = document.getElementById('onboardingReview');
      if (target) target.innerHTML = '<strong>Could not continue</strong><pre>' + escapeHtml(error.message) + '</pre>';
    }
  });
})();
