const { build, devDependencies } = require('./package.json');
const checksums = require('electron/checksums.json');
const path = require('node:path');

for (const artifact of [
  `electron-v${devDependencies.electron}-darwin-arm64.zip`,
  `electron-v${devDependencies.electron}-win32-x64.zip`,
  `electron-v${devDependencies.electron}-win32-arm64.zip`,
]) {
  if (!/^[a-f0-9]{64}$/i.test(checksums[artifact] || '')) {
    throw new Error(`Missing Electron SHA-256 checksum for ${artifact}`);
  }
}

module.exports = {
  ...build,
  electronDownload: { checksums },
  electronDist: ({ arch, platformName }) =>
    platformName === process.platform && arch === process.arch
      ? path.join(__dirname, 'node_modules/electron/dist')
      : null,
};
