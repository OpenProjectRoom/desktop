const { spawn: nativeSpawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crossSpawn = require('cross-spawn');

function pathKey(env) {
  return Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
}

function projectRoot(cwd) {
  if (!cwd) return null;
  let directory = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(directory, '.projectroom', 'project.yaml'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function projectEnvironment(env = process.env, cwd) {
  const result = { ...env };
  const key = pathKey(result);
  const existing = String(result[key] || '').split(path.delimiter).filter(Boolean);
  const root = projectRoot(cwd);
  const candidates = [
    cwd && path.join(path.resolve(cwd), 'node_modules', '.bin'),
    root && path.join(root, 'node_modules', '.bin'),
    ...(process.platform === 'darwin' ? [
      '/usr/bin', '/bin', '/usr/sbin', '/sbin',
      '/opt/homebrew/bin', '/usr/local/bin',
      path.join(os.homedir(), '.volta', 'bin'),
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), 'Library', 'pnpm'),
      path.join(os.homedir(), '.local', 'share', 'pnpm'),
      path.join(os.homedir(), '.cargo', 'bin'),
      path.join(os.homedir(), '.bun', 'bin'),
      path.join(os.homedir(), '.deno', 'bin'),
      path.join(os.homedir(), '.asdf', 'shims'),
      path.join(os.homedir(), '.local', 'share', 'mise', 'shims')
    ] : [])
  ];
  const seen = new Set(existing.map(directory => process.platform === 'win32' ? directory.toLowerCase() : directory));
  for (const directory of candidates) {
    if (!directory || !fs.existsSync(directory)) continue;
    const identity = process.platform === 'win32' ? directory.toLowerCase() : directory;
    if (!seen.has(identity)) { existing.push(directory); seen.add(identity); }
  }
  result[key] = existing.join(path.delimiter);
  return result;
}

function projectPath(env = process.env, cwd) {
  const effective = projectEnvironment(env, cwd);
  return effective[pathKey(effective)];
}

function resolveProjectExecutable(command, cwd, env = process.env) {
  if (!command || command.includes('/') || command.includes('\\')) return null;
  const effective = projectEnvironment(env, cwd);
  const directories = String(effective[pathKey(effective)] || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32' ? ['', ...(effective.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')] : [''];
  for (const directory of directories) for (const extension of extensions) {
    const candidate = path.join(directory, command + extension.toLowerCase());
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch { /* Search next directory. */ }
  }
  return null;
}

function commandStartError(error, command, cwd, env = process.env) {
  if (error?.code !== 'ENOENT' || (cwd && !fs.existsSync(cwd)) || command.includes('/') || command.includes('\\') || resolveProjectExecutable(command, cwd, env)) return error.message;
  const effective = projectEnvironment(env, cwd);
  const directories = String(effective[pathKey(effective)] || '').split(path.delimiter).filter(Boolean);
  return `${command} was not found. Check that it is installed and available to Project Room. Searched: ${directories.slice(0, 8).join(', ')}${directories.length > 8 ? ', …' : ''}`;
}

// cross-spawn resolves Windows .cmd/.bat shims (npm, npx, Codex, Claude) while
// preserving argument boundaries for normal executables on every platform.
function spawnProject(command, args, options) {
  return crossSpawn(command, args, { windowsHide: true, ...options, env: projectEnvironment(options?.env || process.env, options?.cwd) });
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

module.exports = { spawnProject, stopProcessTree, projectEnvironment, projectPath, resolveProjectExecutable, commandStartError };
