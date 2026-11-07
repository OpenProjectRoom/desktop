const { spawn: nativeSpawn } = require('node:child_process');
const crossSpawn = require('cross-spawn');

// cross-spawn resolves Windows .cmd/.bat shims (npm, npx, Codex, Claude) while
// preserving argument boundaries for normal executables on every platform.
function spawnProject(command, args, options) {
  return crossSpawn(command, args, { windowsHide: true, ...options });
}

function stopProcessTree(child, { platform = process.platform, killCommand = nativeSpawn } = {}) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (platform === 'win32') {
    // A service started through npm.cmd has a cmd.exe/npm/actual-service tree.
    // Killing only the direct child leaves the server running on Windows.
    const killer = killCommand('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { try { child.kill(); } catch { /* Already exited. */ } });
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); }
  catch { try { child.kill('SIGTERM'); } catch { /* Already exited. */ } }
}

module.exports = { spawnProject, stopProcessTree };
