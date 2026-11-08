'use strict';
// Watches the open project's .projectroom/project.yaml and .env for changes made outside Project Room
// (a coding agent, an editor, git checkout). It never reloads by itself: it reports a change so the
// window can offer a reload, because reloading the project also resets detached-service polling and
// disconnects MCP Explorer sessions.
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} root repository root
 * @param {object} options
 * @param {string} options.configFile absolute path of .projectroom/project.yaml
 * @param {() => void} options.onConfig called (debounced) after project.yaml may have changed
 * @param {() => void} options.onEnv called (debounced) after .env may have changed
 * @param {number} [options.debounceMs] quiet period before reporting, default 300 ms
 * @param {typeof fs.watch} [options.watch] injectable for tests
 * @returns {{ close(): void }}
 */
function watchProjectFiles(root, { configFile, onConfig, onEnv, debounceMs = 300, watch = fs.watch }) {
  const watchers = [];
  const timers = new Map();
  let closed = false;
  const schedule = (kind, callback) => {
    if (closed) return;
    clearTimeout(timers.get(kind));
    timers.set(kind, setTimeout(() => {
      timers.delete(kind);
      if (!closed) callback();
    }, debounceMs));
  };
  const add = (directory, matches, kind, callback) => {
    try {
      // Watch the directory, not the file: editors and agents often save by writing a temporary file and
      // renaming it over the original, which ends a watch on the old file.
      const watcher = watch(directory, { persistent: false }, (_event, name) => {
        // Some platforms omit the file name; treat that as a possible change.
        if (!name || matches(String(name))) schedule(kind, callback);
      });
      watcher.on?.('error', () => {});
      watchers.push(watcher);
    } catch {
      // Missing folder or unsupported file system: the manual refresh still works.
    }
  };
  const configName = path.basename(configFile);
  add(path.dirname(configFile), name => name === configName, 'config', onConfig);
  add(root, name => name === '.env', 'env', onEnv);
  return {
    close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const watcher of watchers.splice(0)) {
        try { watcher.close(); } catch { /* Already closed. */ }
      }
    },
  };
}

/**
 * Compares the file on disk with the configuration the window currently shows.
 * @returns {null | { valid: true } | { valid: false, message: string }} null when nothing changed
 */
function describeConfigChange(configFile, currentRaw, load) {
  let raw;
  try {
    raw = fs.readFileSync(configFile, 'utf8');
  } catch (error) {
    return { valid: false, message: error.code === 'ENOENT' ? 'The configuration file was removed.' : error.message };
  }
  if (raw === currentRaw) return null;
  try {
    load(configFile);
    return { valid: true };
  } catch (error) {
    return { valid: false, message: String(error.message || error).slice(0, 500) };
  }
}

module.exports = { watchProjectFiles, describeConfigChange };
