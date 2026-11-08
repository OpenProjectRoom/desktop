/* Shared map UI for the web demo and the Electron desktop shell. */
let projectConfig = {
  project: { name: 'Blackbox Agent B', version: '0.8.4' },
  components: [
    { id: 'product-spec', kind: 'specification', name: 'Product Spec', icon: 'doc', position: { x: 5, y: 95 }, path: 'specs/vision.md' },
    { id: 'web', kind: 'service', name: 'Web App', icon: 'cube', position: { x: 35, y: 70 }, runtime: { command: ['npm', 'run', 'dev'], port: 3000, url: 'http://localhost:3000', startup: 'manual' } },
    { id: 'api', kind: 'service', name: 'API Server', icon: 'terminal', position: { x: 68, y: 190 }, runtime: { command: ['npm', 'run', 'api'], port: 4000, startup: 'manual' } },
    { id: 'postgres', kind: 'database', name: 'PostgreSQL', icon: 'database', position: { x: 36, y: 320 }, data: { engine: 'postgres', connectionEnv: 'DATABASE_URL', viewer: 'external' } },
    { id: 'tests', kind: 'testSuite', name: 'Tests & Quality', icon: 'flask', position: { x: 5, y: 445 }, tests: { command: ['npm', 'test'] } },
    { id: 'issues', kind: 'issues', name: 'Product Backlog', icon: 'list', position: { x: 67, y: 445 }, integration: { provider: 'github' } },
    { id: 'worker', kind: 'service', name: 'Worker', icon: 'activity', position: { x: 36, y: 570 }, runtime: { command: ['npm', 'run', 'worker'], startup: 'manual' } }
  ],
  connections: [
    { from: 'product-spec', to: 'web', label: 'defines' },
    { from: 'web', to: 'api', label: 'calls' },
    { from: 'api', to: 'postgres', label: 'reads-writes' },
    { from: 'tests', to: 'web', label: 'checks' },
    { from: 'tests', to: 'api', label: 'checks' },
    { from: 'issues', to: 'product-spec', label: 'informs' },
    { from: 'worker', to: 'postgres', label: 'reads-writes' }
  ]
};
let selectedComponent = 'web';
let panelTab = 'chat';
let chatMessages = [];
let mapZoom = 1;
let desktopStatus = {};
let projectRoot = null;
let componentBuilds = {};
function buildIdentityText(id, compact = false) {
  const info = componentBuilds[id] || {};
  const when = value => { try { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }); } catch { return ''; } };
  const parts = [];
  if (info.builtAt) parts.push(`Built ${when(info.builtAt)}`);
  else if (projectRoot) parts.push('Build time unavailable');
  if (info.version) parts.push(`v${info.version}`);
  if (info.revision) parts.push(`build ${info.revision.slice(0, 12)}`);
  else if (info.sourceRevision && !compact) parts.push(`source ${info.sourceRevision}`);
  if (info.startedAt) parts.push(`${desktopStatus[id] === 'running' ? 'Started' : 'Last started'} ${when(info.startedAt)}`);
  return parts.join(' · ');
}
function buildIdentityLine(id) { const value = buildIdentityText(id); return value ? `<div class="build-identity" title="Build data comes from the artifact; the source revision and start time are separate.">${escapeHtml(value)}</div>` : ''; }
let projectFiles = [];
let activeConfigPath = '.projectroom/project.yaml';
let selectedFilePath = activeConfigPath;
let selectedFileText = '';
let recentEvents = ['13:42  Tests bestanden · 26/30 Checks', '13:36  Web App bereit · :3000', '12:18  Product Spec aktualisiert'];
const kindLabels = { service: 'Service', database: 'Datenbank', testSuite: 'Testsammlung', specification: 'Spezifikation', issues: 'Aufgaben', storage: 'Speicher', external: 'Extern' };
if (window.productView) document.body.classList.add('desktop-app');
else document.body.classList.remove('project-booting');

function currentComponent(id) { return projectConfig.components.find(c => c.id === id); }
function getNodeStatus(c) {
  if (c.kind === 'service') {
    if (window.productView) return desktopStatus[c.id] === 'running' ? ['Läuft', ''] : desktopStatus[c.id] === 'starting' ? ['Startet', 'warn'] : ['Gestoppt', 'off'];
    let match = state.services.find(s => s.id === c.id || (c.id === 'web' && s.id === 'app'));
    return match?.running ? ['Läuft', ''] : ['Gestoppt', 'off'];
  }
  if (c.kind === 'database') return window.productView ? ['Konfiguriert', 'off'] : ['Demo-Daten', 'warn'];
  if (c.kind === 'testSuite') return window.productView ? ['Bereit', 'off'] : ['3 bestanden', ''];
  if (c.kind === 'issues') return window.productView ? ['Konfiguriert', 'off'] : ['3 offen', 'warn'];
  return ['Versioniert', ''];
}
function mapNode(c) {
  const [status, kind] = getNodeStatus(c);
  const x = Math.max(0, Math.min(72, Number(c.position?.x) || 0));
  const y = Math.max(0, Math.min(620, Number(c.position?.y) || 0));
  const helper = c.kind === 'service' ? [c.runtime?.port && ':' + c.runtime.port, buildIdentityText(c.id, true)].filter(Boolean).join(' · ') :
    c.kind === 'specification' ? c.path : c.kind === 'database' ? c.data?.engine : c.kind === 'issues' ? c.integration?.provider : c.kind === 'testSuite' ? (c.tests?.categories || []).join(' · ') : '';
  return `<article class="map-node kind-${escapeHtml(c.kind)} ${selectedComponent === c.id ? 'selected' : ''}" data-map-node="${escapeHtml(c.id)}" style="left:${x}%;top:${y}px" tabindex="0" role="button" aria-label="${escapeHtml(c.name)} öffnen">
    <div class="map-node-header"><div class="map-node-icon">${icon(c.icon || 'cube')}</div><div class="map-node-name">${escapeHtml(c.name)}</div></div>
    <div class="map-node-kind" title="${escapeHtml(helper || '')}">${escapeHtml(helper || kindLabels[c.kind] || c.kind)}</div>
    <div class="map-node-bottom">${badge(status, kind)}<button class="map-node-link" data-v2="select:${escapeHtml(c.id)}" title="Details öffnen">${icon('arrow')}</button></div>
  </article>`;
}
overview = function () {
  const serviceCount = projectConfig.components.filter(c => c.kind === 'service').length;
  const connectionCount = projectConfig.connections?.length || 0;
  return `<div class="workspace-head"><div><div class="eyebrow">PROJECT ROOM / ${window.productView ? 'DESKTOP WORKSPACE' : 'INTERAKTIVER PROTOTYP'}</div><h1>${escapeHtml(projectConfig.project?.name || 'Projektkarte')}</h1><p>Alle Bausteine deines Produkts – verbunden mit Spezifikation, Code und Betrieb.</p></div><div class="workspace-head-actions"><button class="btn" data-v2="choose-project">${icon('folder')} Projekt öffnen</button>${window.productView ? `<button class="btn primary" data-v2="config">${icon('doc')} Konfiguration</button>` : `<button class="btn primary" data-v2="add-component">${icon('plus')} Komponente</button>`}</div></div>
    <div class="map-meta"><span class="dot"></span><strong>${projectRoot ? 'Lokales Projekt' : 'Demo-Projekt'}</strong><span>·</span><span>${projectConfig.components.length} Komponenten</span><span>·</span><span>${connectionCount} Verbindungen</span><span>·</span><span>${serviceCount} Dienste</span></div>
    <section class="map-frame"><div class="map-toolbar"><div class="map-toolbar-left"><span class="map-toolbar-title">Projektkarte</span><span class="toolbar-pill">${icon('git')} main</span><span class="toolbar-pill">${window.productView ? '.projectroom/project.yaml' : 'Demo · .projectroom/project.yaml'}</span></div><div class="map-toolbar-right"><button class="tool-button" data-v2="fit" title="Ansicht zentrieren">⌗</button><button class="tool-button" data-v2="config" title="Konfiguration ansehen">${icon('doc')}</button></div></div>
      <div class="map-canvas" id="mapCanvas"><div class="map-content" id="mapContent" style="transform:scale(${mapZoom})"><svg class="map-links" id="mapLinks" aria-hidden="true"></svg>${projectConfig.components.map(mapNode).join('')}</div><div class="map-float-controls"><button data-v2="zoom-in" title="Vergrößern">+</button><button data-v2="zoom-out" title="Verkleinern">−</button><button data-v2="fit" title="Einpassen">⌗</button></div><div class="map-legend"><span><i></i> Aktiv</span><span><i></i> Bereit</span><span><i></i> Hinweis</span></div></div></section>
    <div class="workspace-bottom"><section class="card"><div class="mini-section-head">Produktweg <small>${projectRoot ? 'Workflow-Vorlage' : 'Beispielablauf'}</small></div><div class="phase-strip"><div class="phase ${projectRoot ? '' : 'done'}"><strong>01 · Idee</strong><small>Vision</small><div class="phase-bar"></div></div><div class="phase ${projectRoot ? '' : 'done'}"><strong>02 · Spec</strong><small>Anforderungen</small><div class="phase-bar"></div></div><div class="phase ${projectRoot ? '' : 'active'}"><strong>03 · Build</strong><small>Entwicklung</small><div class="phase-bar"></div></div><div class="phase"><strong>04 · Test</strong><small>Qualität</small><div class="phase-bar"></div></div><div class="phase"><strong>05 · Release</strong><small>Version</small><div class="phase-bar"></div></div></div></section><section class="card"><div class="mini-section-head">Build-Log <small>letzte Ereignisse</small></div><div class="build-log" id="buildLog">${recentEvents.slice(0, 3).map((line, i) => `<div>${i === 0 ? '<b>●</b>' : '·'} ${escapeHtml(line)}</div>`).join('')}</div></section></div>
    <div class="footer-note">${icon('clock')} ${window.productView ? 'Befehle laufen nur nach Klick auf Start.' : 'Web-Demo mit Beispieldaten · die Desktop-App liest .projectroom/project.yaml aus einem Repository.'}</div>`;
};

function drawConnections() {
  const map = document.getElementById('mapContent');
  const svg = document.getElementById('mapLinks');
  if (!map || !svg) return;
  const w = map.clientWidth, h = map.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = (projectConfig.connections || []).map(conn => {
    const a = [...map.querySelectorAll('[data-map-node]')].find(n => n.dataset.mapNode === conn.from);
    const b = [...map.querySelectorAll('[data-map-node]')].find(n => n.dataset.mapNode === conn.to);
    if (!a || !b) return '';
    const ac = { x: a.offsetLeft + a.offsetWidth / 2, y: a.offsetTop + a.offsetHeight / 2 };
    const bc = { x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    let x1, y1, x2, y2, d;
    if (Math.abs(dx) > Math.abs(dy) * .65) {
      x1 = ac.x + Math.sign(dx) * a.offsetWidth / 2; y1 = ac.y;
      x2 = bc.x - Math.sign(dx) * b.offsetWidth / 2; y2 = bc.y;
      const bend = Math.max(35, Math.abs(x2 - x1) * .48) * Math.sign(dx);
      d = `M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}`;
    } else {
      x1 = ac.x; y1 = ac.y + Math.sign(dy) * a.offsetHeight / 2;
      x2 = bc.x; y2 = bc.y - Math.sign(dy) * b.offsetHeight / 2;
      const bend = Math.max(30, Math.abs(y2 - y1) * .45) * Math.sign(dy);
      d = `M${x1} ${y1} C${x1} ${y1 + bend},${x2} ${y2 - bend},${x2} ${y2}`;
    }
    return `<path d="${d}" ${conn.from === selectedComponent || conn.to === selectedComponent ? 'class="emphasis"' : ''}/>`;
  }).join('');
}

function renderPanel() {
  const panel = document.getElementById('chatPanel');
  if (!panel) return;
  panel.querySelectorAll('[data-panel-tab]').forEach(b => b.classList.toggle('active', b.dataset.panelTab === panelTab));
  const body = panel.querySelector('#panelBody');
  if (panelTab === 'inspector') {
    const c = currentComponent(selectedComponent);
    if (!c) { body.innerHTML = `<div class="panel-empty"><div class="panel-symbol">${icon('grid')}</div><strong>Komponente auswählen</strong><p>Klicke auf eine Karte, um Konfiguration, Verbindungen und Aktionen zu sehen.</p></div>`; }
    else {
      const [status, badgeKind] = getNodeStatus(c);
      const edges = (projectConfig.connections || []).filter(e => e.from === c.id || e.to === c.id);
      const fields = c.kind === 'service' ? [
        ['Befehl', (c.runtime?.command || []).join(' ')], ['Port', c.runtime?.port ? ':' + c.runtime.port : '—'], ['Start', c.runtime?.startup || 'manual'], ['Health', c.runtime?.health || '—'], ['Build', buildIdentityText(c.id)]
      ] : c.kind === 'database' ? [['Engine', c.data?.engine || '—'], ['Zugang', c.data?.connectionEnv || '—'], ['Viewer', c.data?.viewer || '—']] :
        c.kind === 'testSuite' ? [['Befehl', (c.tests?.command || []).join(' ')], ['Kategorien', (c.tests?.categories || []).join(', ') || '—']] :
        c.kind === 'specification' ? [['Datei', c.path || '—']] :
        c.kind === 'issues' ? [['Provider', c.integration?.provider || '—'], ['Repository', c.integration?.repository || '—']] : [];
      body.innerHTML = `<div class="inspector-kind">${escapeHtml(kindLabels[c.kind] || c.kind)}</div><div class="inspector-title">${escapeHtml(c.name)}</div>${badge(status, badgeKind)}
        <div class="inspector-actions">${c.kind === 'service' ? `<button class="btn primary" data-v2="toggle-service:${escapeHtml(c.id)}">${icon(desktopStatus[c.id] === 'running' || (!window.productView && status === 'Läuft') ? 'stop' : 'play')} ${desktopStatus[c.id] === 'running' || (!window.productView && status === 'Läuft') ? 'Stoppen' : 'Starten'}</button>` : ''}${c.runtime?.url ? `<button class="btn" data-v2="open-url:${escapeHtml(c.id)}">${icon('external')} Öffnen</button>` : ''}${c.kind === 'testSuite' ? `<button class="btn primary" data-v2="run-suite:${escapeHtml(c.id)}">${icon('play')} Ausführen</button>` : ''}</div>
        <div class="inspector-block"><h3>Konfiguration</h3>${fields.map(([k, v]) => `<div class="inspector-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}<div class="inspector-row"><span>ID</span><strong>${escapeHtml(c.id)}</strong></div></div>
        <div class="inspector-block"><h3>Verbindungen · ${edges.length}</h3>${edges.map(e => { const other = currentComponent(e.from === c.id ? e.to : e.from); return `<div class="inspector-row"><span>${escapeHtml(e.label || 'verbunden')}</span><strong>${escapeHtml(other?.name || '—')}</strong></div>`; }).join('') || '<div class="muted" style="font-size:11px">Keine Verbindungen</div>'}</div>
        <div class="inspector-block"><h3>Quelle</h3><div class="inspector-row"><span>Projektdatei</span><strong>.projectroom/project.yaml</strong></div></div>`;
    }
  } else {
    body.innerHTML = `<div class="chat-messages" id="chatMessages">${chatMessages.length ? chatMessages.map(m => `<div class="chat-message ${m.role}">${escapeHtml(m.text)}</div>`).join('') : `<div class="panel-empty" style="min-height:220px;height:auto"><div class="panel-symbol">${icon('cube')}</div><strong>Sprich mit deinem Produkt</strong><p>Frag nach Komponenten, Verbindungen oder nächsten Schritten. Dieser Prototyp antwortet aus der Projektkonfiguration.</p></div>`}</div><div class="chat-suggestions"><button data-v2="suggest:Welche Komponenten gibt es?">Komponenten erklären</button><button data-v2="suggest:Was ist der nächste Schritt?">Nächster Schritt</button><button data-v2="suggest:Welche Tests sind definiert?">Tests zeigen</button></div>`;
    body.scrollTop = body.scrollHeight;
  }
  panel.querySelector('.chat-composer').classList.toggle('hidden', panelTab !== 'chat');
}

function answerChat(input) {
  const q = input.toLowerCase();
  if (/komponent|baustein|architektur|karte/.test(q)) return `Dieses Projekt hat ${projectConfig.components.length} Komponenten und ${(projectConfig.connections || []).length} Verbindungen. Die wichtigsten Bausteine sind: ${projectConfig.components.map(c => c.name).join(', ')}. Wähle eine Karte für die genaue Konfiguration.`;
  if (/test|qualität|performance/.test(q)) return `Die Projektdatei definiert ${projectConfig.components.filter(c => c.kind === 'testSuite').length} Testsammlung(en). In der Desktop-App kannst du den konfigurierten Testbefehl über die Karte ausführen. Ergebnisse und Verlauf werden in einer späteren Ausbaustufe dauerhaft gespeichert.`;
  if (/nächst|schritt|priorität|aufgabe/.test(q)) return 'Als Nächstes würde ich die Produkt-Spezifikation mit der Web App und den Tests abgleichen. Im Beispiel-Backlog stehen Onboarding und Antwortzeit oben. Das ist eine Demo-Einschätzung, keine Live-Auswertung von GitHub oder Linear.';
  if (/spec|anforder|vision/.test(q)) return `Die Spezifikation ist über ${projectConfig.components.filter(c => c.kind === 'specification').map(c => c.path).join(', ') || 'noch keine Datei'} eingebunden. Änderungen daran werden im Repository versioniert und können auf der Karte mit Services und Tests verknüpft werden.`;
  return 'Ich kann dir die Projektkarte, Komponenten, Tests und Spezifikationen aus .projectroom/project.yaml erklären. Ein echter Codex- oder Claude-Chat ist in diesem Prototyp noch nicht verbunden.';
}
function sendChat(text) {
  const message = text.trim(); if (!message) return;
  chatMessages.push({ role: 'user', text: message }, { role: 'assistant', text: answerChat(message) });
  panelTab = 'chat'; renderPanel();
}
function addEvent(text) { const now = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); recentEvents.unshift(`${now}  ${text}`); recentEvents = recentEvents.slice(0, 10); if (state.page === 'overview') render(); }
function setProject(data) {
  if (!data?.config || !Array.isArray(data.config.components)) throw new Error('Die Projektkonfiguration ist ungültig.');
  projectConfig = data.config; projectRoot = data.root || null; componentBuilds = data.buildIdentities || {};
  if (projectRoot) recentEvents = ['Projekt geladen · ' + (projectConfig.project?.name || 'Repository')];
  selectedComponent = projectConfig.components.find(c => c.kind === 'service')?.id || projectConfig.components[0]?.id || null;
  desktopStatus = data.status || {};
  window.projectRoomMetrics = { services: {}, totals: [] };
  if (window.productView && projectRoot) {
    const metricsRoot = projectRoot;
    window.productView.listProcessMetrics().then(snapshot => {
      if (projectRoot !== metricsRoot) return;
      window.projectRoomMetrics = snapshot;
      if (state.page === 'dashboard' || state.page === 'runtime') render();
    }).catch(() => {});
  }
  activeConfigPath = data.configFile || '.projectroom/project.yaml';
  if (data.raw) files[activeConfigPath] = data.raw;
  selectedFilePath = activeConfigPath; selectedFileText = data.raw || '';
  document.querySelector('.project-picker strong').textContent = projectConfig.project?.name || 'Project';
  document.querySelector('.project-picker small').textContent = projectRoot ? 'Local repository' : 'Demo project';
  document.querySelector('.project-avatar').textContent = (projectConfig.project?.name || 'PV').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  document.querySelector('.breadcrumb').innerHTML = `Projects <span>/</span> ${escapeHtml(projectConfig.project?.name || 'Projekt')} <span>/</span> <strong id="crumb">${escapeHtml(labels[state.page])}</strong>`;
  document.querySelector('.branch').innerHTML = `${icon('git')} main <span style="color:#bac3ce">·</span> ${escapeHtml(projectConfig.project?.version || 'lokal')}`;
  document.body.classList.toggle('real-project', Boolean(projectRoot));
  render();
  if (window.productView && projectRoot) window.productView.listFiles().then(items => { projectFiles = items; if (state.page === 'files') render(); }).catch(error => toast(error.message));
  else projectFiles = [];
}

const previousRuntime = runtime, previousTests = tests, previousSpec = spec, previousData = data, previousFiles = filesPage, previousIssues = issues, previousActivity = activity;
runtime = function () {
  if (!window.productView) return previousRuntime();
  const services = projectConfig.components.filter(c => c.kind === 'service');
  return `${head('Laufzeit', 'Dienste aus .projectroom/project.yaml starten und stoppen.')}
    <section class="card"><div class="card-head"><div><h2>Konfigurierte Dienste</h2><p>${services.length} Dienste · Start nur auf Klick</p></div></div>
    ${services.map(c => { const [status, kind] = getNodeStatus(c); return `<div class="env-row"><div class="service-icon">${icon(c.icon || 'terminal')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)} ${badge(status, kind)}</div><div class="service-sub">${escapeHtml((c.runtime?.command || []).join(' '))}${c.runtime?.port ? ' · :' + c.runtime.port : ''}</div></div><button class="btn small" data-v2="toggle-service:${escapeHtml(c.id)}">${icon(status === 'Läuft' ? 'stop' : 'play')} ${status === 'Läuft' ? 'Stoppen' : 'Starten'}</button></div>`; }).join('') || '<div class="empty">Keine Dienste konfiguriert.</div>'}</section>
    <section class="card" style="margin-top:16px"><div class="card-head"><div><h2>Letzte Ereignisse</h2><p>Prozessausgabe und Statusänderungen</p></div></div><div class="build-log">${recentEvents.map(x => `<div>${escapeHtml(x)}</div>`).join('')}</div></section>`;
};
tests = function () {
  if (!window.productView) return previousTests();
  const suites = projectConfig.components.filter(c => c.kind === 'testSuite');
  return `${head('Tests & Qualität', 'Konfigurierte Testsammlungen aus dem Repository ausführen.')}
    <section class="card"><div class="card-head"><div><h2>Testsammlungen</h2><p>Ergebnisse erscheinen im Build-Log der Projektkarte</p></div></div>
    ${suites.map(c => `<div class="env-row"><div class="service-icon green">${icon('flask')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)}</div><div class="service-sub">${escapeHtml((c.tests?.command || []).join(' '))}</div></div><button class="btn small" data-v2="run-suite:${escapeHtml(c.id)}">${icon('play')} Ausführen</button></div>`).join('') || '<div class="empty">Keine Testsammlung konfiguriert.</div>'}</section>`;
};
spec = function () {
  if (!window.productView) return previousSpec();
  const specs = projectConfig.components.filter(c => c.kind === 'specification');
  return `${head('Spezifikation', 'Produktvision und Anforderungen aus dem Repository.')}
    <section class="card"><div class="card-head"><div><h2>Spezifikationsdateien</h2><p>Diese Dateien sind mit den Komponenten der Projektkarte verbunden</p></div></div>
    ${specs.map(c => `<div class="env-row"><div class="service-icon">${icon('doc')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)}</div><div class="service-sub">${escapeHtml(c.path || '')}</div></div><button class="btn small" data-v2="open-file:${escapeHtml(c.path || '')}">Ansehen ${icon('arrow')}</button></div>`).join('') || '<div class="empty">Keine Spezifikation eingebunden.</div>'}</section>`;
};
data = function () {
  if (!window.productView) return previousData();
  const sources = projectConfig.components.filter(c => ['database', 'storage', 'external'].includes(c.kind));
  return `${head('Daten & Strukturen', 'Konfigurierte Datenquellen und Speicherorte.')}
    <section class="card"><div class="card-head"><div><h2>Datenquellen</h2><p>Zugangsdaten werden aus Umgebungsvariablen gelesen</p></div></div>
    ${sources.map(c => `<div class="env-row"><div class="service-icon blue">${icon(c.icon || 'database')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)} ${badge('Konfiguriert', 'off')}</div><div class="service-sub">${escapeHtml(c.data?.engine || c.data?.path || c.url || kindLabels[c.kind])} · ${escapeHtml(c.data?.connectionEnv || 'Kein Zugang hinterlegt')}</div></div><button class="btn small" data-v2="select:${escapeHtml(c.id)}">Details ${icon('arrow')}</button></div>`).join('') || '<div class="empty">Keine Datenquelle konfiguriert.</div>'}</section>`;
};
filesPage = function () {
  if (!window.productView) return previousFiles();
  const items = projectFiles;
  return `${head('Dateien', 'Projektdatei und Quelltext des geöffneten Repositories.')}
    <section class="card file-layout"><div class="file-tree"><div style="font-size:10px;color:#9da7b4;text-transform:uppercase;letter-spacing:1px;padding:4px 9px 13px;font-weight:800">Explorer</div>
    ${items.map(x => `<button style="padding-left:${9 + x.depth * 15}px" class="${selectedFilePath === x.path ? 'active' : ''}" ${x.type === 'file' ? `data-v2="open-file:${escapeHtml(x.path)}"` : ''}>${icon(x.type === 'directory' ? 'folder' : 'doc')} ${escapeHtml(x.path.split('/').pop())}</button>`).join('')}</div>
    <div class="code-view"><div class="code-header"><span>${escapeHtml(selectedFilePath)}</span><span>${projectRoot ? 'Lokale Datei' : 'Demo'}</span></div><pre>${escapeHtml(selectedFileText).split('\n').map((line, i) => `<span class="ln">${i + 1}</span>${line}`).join('\n')}</pre></div></section>`;
};
issues = function () {
  if (!window.productView) return previousIssues();
  const sources = projectConfig.components.filter(c => c.kind === 'issues');
  return `${head('Aufgaben', 'Backlog-Quellen aus der Projektkonfiguration.')}
    <section class="card"><div class="card-head"><div><h2>Konfigurierte Quellen</h2><p>Die Live-Synchronisierung mit GitHub oder Linear ist noch nicht implementiert</p></div></div>
    ${sources.map(c => `<div class="env-row"><div class="service-icon">${icon('list')}</div><div class="service-meta"><div class="service-title">${escapeHtml(c.name)}</div><div class="service-sub">${escapeHtml(c.integration?.provider || '')} · ${escapeHtml(c.integration?.repository || 'Keine Repository-Angabe')}</div></div>${badge('Adapter geplant', 'off')}</div>`).join('') || '<div class="empty">Keine Aufgabenquelle konfiguriert.</div>'}</section>`;
};
activity = function () {
  if (!window.productView) return previousActivity();
  return `${head('Aktivität', 'Starts, Tests und Prozessmeldungen dieser Sitzung.')}
    <section class="card"><div class="card-head"><div><h2>Ereignisse</h2><p>Nur in dieser Desktop-Sitzung gespeichert</p></div></div>${recentEvents.map(x => `<div class="env-row"><div class="service-icon green">${icon('activity')}</div><div class="service-meta"><div class="service-title">${escapeHtml(x)}</div></div></div>`).join('')}</section>`;
};

const oldRender = render;
render = function () { oldRender(); if (state.page === 'overview') requestAnimationFrame(drawConnections); renderPanel(); };
labels.overview = 'Projektkarte';
const overviewNav = document.querySelector('#nav button[data-page="overview"]');
if (overviewNav) overviewNav.querySelector('span').textContent = 'Projektkarte';
document.querySelectorAll('.nav button,.sidebar-bottom button').forEach(b => { const label = b.querySelector('span')?.textContent || b.textContent.trim(); if (label) b.title = label; });
document.querySelector('.top-actions').insertAdjacentHTML('afterbegin', `<span class="desktop-chip">${window.productView ? 'DESKTOP' : 'WEB-DEMO'}</span><button class="chat-toggle" id="chatToggle" title="Chat und Details öffnen">${icon('list')}</button>`);
document.getElementById('projectPicker').onclick = null;
document.getElementById('projectPicker').dataset.v2 = 'choose-project';
document.getElementById('settingsBtn').onclick = null;
document.getElementById('settingsBtn').dataset.v2 = 'config';
document.querySelector('.app').insertAdjacentHTML('beforeend', `<aside class="chat-panel" id="chatPanel"><div class="panel-top"><strong>Project Room</strong><button class="panel-close" id="panelClose" aria-label="Close panel">×</button></div><div class="panel-tabs"><button class="active" data-panel-tab="inspector">Details</button><button data-panel-tab="chat">Chat mit Produkt</button></div><div class="panel-body" id="panelBody"></div><div class="chat-composer hidden"><form id="chatForm"><textarea id="chatInput" placeholder="Frag etwas zu diesem Projekt…" aria-label="Nachricht an Project Room"></textarea><div class="chat-composer-footer"><span>Antworten aus der Projektdatei · Demo</span><button type="submit" aria-label="Send message">${icon('arrow')}</button></div></form></div><div class="panel-foot"><span class="dot"></span> ${window.productView ? 'Lokaler Projektkontext' : 'Demo-Chat · kein Modell verbunden'}</div></aside>`);
document.getElementById('chatToggle').onclick = () => document.getElementById('chatPanel').classList.toggle('open');
document.getElementById('panelClose').onclick = () => document.getElementById('chatPanel').classList.remove('open');
document.getElementById('chatForm').onsubmit = e => { e.preventDefault(); const input = document.getElementById('chatInput'); sendChat(input.value); input.value = ''; };
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('chatForm').requestSubmit(); } });
document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-panel-tab]');
  if (tab) { panelTab = tab.dataset.panelTab; renderPanel(); return; }
  const node = e.target.closest('[data-map-node]');
  if (node) { selectedComponent = node.dataset.mapNode; panelTab = 'inspector'; render(); window.setProductChatOpen?.(true); return; }
  const action = e.target.closest('[data-v2]'); if (!action) return;
  const [name, arg] = action.dataset.v2.split(':');
  if (name === 'select') { selectedComponent = arg; panelTab = 'inspector'; render(); window.setProductChatOpen?.(true); }
  else if (name === 'suggest') sendChat(arg);
  else if (name === 'fit') { mapZoom = 1; render(); }
  else if (name === 'zoom-in' || name === 'zoom-out') { mapZoom = Math.max(.75, Math.min(1.25, mapZoom + (name === 'zoom-in' ? .1 : -.1))); render(); }
  else if (name === 'config') { state.page = 'files'; state.file = activeConfigPath; render(); }
  else if (name === 'open-file') {
    try {
      selectedFilePath = arg;
      selectedFileText = arg === activeConfigPath ? files[activeConfigPath] : await window.productView.readFile(arg);
      state.page = 'files'; render();
    } catch (err) { toast(err.message); }
  }
  else if (name === 'choose-project') {
    if (!window.productView) { toast('In der Desktop-App kannst du einen Repository-Ordner auswählen.'); return; }
    try { const data = await window.productView.chooseProject(); if (data) { setProject(data); toast('Projekt geladen'); } } catch (err) { toast(err.message); }
  }
  else if (name === 'toggle-service') {
    const c = currentComponent(arg); if (!c) return;
    if (window.productView) {
      try { const result = desktopStatus[arg] === 'running' ? await window.productView.stopComponent(arg) : await window.productView.startComponent(arg); desktopStatus[arg] = result.status; addEvent(`${c.name} ${result.status === 'running' ? 'gestartet' : 'gestoppt'}`); render(); }
      catch (err) { toast(err.message); addEvent(`${c.name} · Fehler: ${err.message}`); }
    } else {
      let s = state.services.find(s => s.id === arg || (arg === 'web' && s.id === 'app'));
      if (s) { s.running = !s.running; addEvent(`${c.name} ${s.running ? 'gestartet' : 'gestoppt'} · Demo`); toast('Dienstzustand simuliert'); }
    }
  }
  else if (name === 'open-url') {
    const url = currentComponent(arg)?.runtime?.url;
    if (!url) return;
    if (window.productView) { try { await window.productView.openLocalUrl(url); } catch (err) { toast(err.message); } }
    else toast('Die lokale App-Vorschau ist nur in der Desktop-App verfügbar.');
  }
  else if (name === 'run-suite') {
    if (window.productView) { try { const result = await window.productView.runTestSuite(arg); addEvent(`Tests: ${result.exitCode === 0 ? 'bestanden' : 'fehlgeschlagen'} · Exit ${result.exitCode}`); toast(result.exitCode === 0 ? 'Tests bestanden' : 'Tests fehlgeschlagen'); } catch (err) { toast(err.message); } }
    else { toast('Tests laufen · Demo'); addEvent('Testsammlung gestartet · Demo'); }
  }
  else if (name === 'add-component') {
    modal('Komponente hinzufügen', '<label for="name">Name</label><input id="name" name="name" required placeholder="z. B. Scheduler"><label for="kind">Typ</label><select id="kind" name="kind"><option value="service">Service</option><option value="database">Datenbank</option><option value="testSuite">Testsammlung</option><option value="specification">Spezifikation</option><option value="issues">Aufgaben</option><option value="storage">Speicher</option></select>', f => {
      const name = f.get('name').trim(), kind = f.get('kind'), id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';
      if (projectConfig.components.some(c => c.id === id)) { toast('Diese ID existiert bereits.'); return; }
      projectConfig.components.push({ id, name, kind, icon: kind === 'database' ? 'database' : kind === 'testSuite' ? 'flask' : kind === 'specification' ? 'doc' : 'cube', position: { x: 7 + (projectConfig.components.length % 3) * 30, y: 595 } });
      selectedComponent = id; addEvent(`${name} zur Karte hinzugefügt · nur Sitzung`); toast('Für dauerhafte Änderungen .projectroom/project.yaml bearbeiten.');
    });
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-map-node]')) e.target.click(); });
window.addEventListener('resize', () => { if (state.page === 'overview') requestAnimationFrame(drawConnections); });
if (!window.productView) render();
(async () => {
  try {
    const data = window.productView ? await window.productView.loadProject() : { config: await fetch('./projectroom.json').then(r => r.json()) };
    setProject(data);
  } catch (err) {
    if (window.productView) setProject({ config: { project: { name: 'Project Room' }, workspace: { startPage: 'overview' }, components: [], connections: [] }, empty: true });
    toast('Project could not be opened: ' + err.message);
  } finally { document.body.classList.remove('project-booting'); }
})();
if (window.productView?.onProcessEvent) window.productView.onProcessEvent(event => {
  if (event.type === 'status') { desktopStatus[event.id] = event.status; if (event.buildIdentity) componentBuilds[event.id] = event.buildIdentity; render(); }
  else if (event.type === 'log') { addEvent(`${event.id}: ${event.text.trim().slice(0, 100)}`); }
});
