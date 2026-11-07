const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createUpdates({ app, updater, send, platform = process.platform, delay = setTimeout, repeat = setInterval }) {
  let state = { phase: 'idle', version: null, percent: 0, message: null };
  let timer;
  const enabled = ['darwin', 'win32'].includes(platform) && app.isPackaged;
  const setState = patch => { state = { ...state, ...patch }; send(state); };
  const check = async () => {
    if (!enabled || ['downloading', 'ready'].includes(state.phase)) return;
    try { await updater.checkForUpdates(); }
    catch (error) { setState({ phase: 'idle', message: String(error?.message || error) }); }
  };
  const start = () => {
    if (!enabled) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.on('update-available', info => setState({ phase: 'downloading', version: info.version, percent: 0, message: null }));
    updater.on('download-progress', progress => setState({ phase: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) }));
    updater.on('update-downloaded', info => setState({ phase: 'ready', version: info.version, percent: 100, message: null }));
    updater.on('update-not-available', () => setState({ phase: 'idle', version: null, percent: 0, message: null }));
    updater.on('error', error => setState({ phase: 'idle', message: String(error?.message || error) }));
    delay(check, 5000);
    timer = repeat(check, CHECK_INTERVAL_MS);
  };
  const install = () => {
    if (!enabled || state.phase !== 'ready') return false;
    updater.quitAndInstall(false, true);
    return true;
  };
  const stop = () => { if (timer) clearInterval(timer); };
  return { start, stop, check, install, snapshot: () => ({ ...state }), enabled };
}

module.exports = { createUpdates, CHECK_INTERVAL_MS };
