const fs = require('node:fs');
const path = require('node:path');
const { spawnProject } = require('./platform-process.cjs');

function dockerExecutable(env) {
  const directories = (env.PATH || '').split(path.delimiter);
  if (process.platform === 'darwin') directories.push('/usr/local/bin', '/opt/homebrew/bin');
  for (const directory of directories) {
    if (!directory) continue;
    const candidate = path.join(directory, process.platform === 'win32' ? 'docker.exe' : 'docker');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'docker';
}

function checkDocker({ env = process.env, spawn = spawnProject, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(dockerExecutable(env), ['info', '--format', '{{.ServerVersion}}'], {
        env, shell: false, stdio: 'ignore', windowsHide: true
      });
    } catch (error) {
      reject(new Error('Docker could not be checked. Install Docker Desktop or make the Docker CLI available, then retry.'));
      return;
    }
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* The Docker check may already have exited. */ }
      finish(new Error('Docker did not respond. Check Docker Desktop and the active Docker context, then retry.'));
    }, timeoutMs);
    child.once('error', error => finish(new Error(error.code === 'ENOENT'
      ? 'Docker CLI was not found. Install Docker Desktop or make the Docker CLI available, then retry.'
      : 'Docker could not be checked. Check its installation and permissions, then retry.')));
    child.once('close', code => finish(code === 0 ? null : new Error('Docker Engine is not reachable. Start Docker Desktop or your configured Docker Engine, wait until it is ready, then retry. The project command was not launched.')));
  });
}

async function checkPrerequisites(requires = [], options = {}) {
  if (requires.includes('docker')) await checkDocker(options);
}

module.exports = { checkDocker, checkPrerequisites };
