#!/usr/bin/env node
'use strict';

// SignPath changes the installer bytes after electron-builder generated latest.yml.
// Rebuild both pieces from the signed installer before publishing an update.
const fs = require('node:fs/promises');
const path = require('node:path');
const YAML = require('yaml');
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');

const installerName = 'Project-Room-Desktop-windows.exe';

async function main(directory) {
  if (!directory) throw new Error('Usage: node scripts/refresh-windows-update-metadata.cjs <output-directory>');
  const installer = path.join(directory, installerName);
  const manifest = path.join(directory, 'latest.yml');
  const currentVersion = require('../package.json').version;
  const info = YAML.parse(await fs.readFile(manifest, 'utf8'));
  if (info?.version !== currentVersion) throw new Error(`latest.yml version ${info?.version} differs from package version ${currentVersion}`);
  const matches = info.files?.filter(file => file.url === installerName) || [];
  if (matches.length !== 1 || info.path !== installerName) throw new Error('latest.yml does not identify exactly one Project Room installer');

  const { sha512, size } = await buildBlockMap(installer, 'gzip', `${installer}.blockmap`);
  matches[0].sha512 = sha512;
  matches[0].size = size;
  info.sha512 = sha512;
  await fs.writeFile(manifest, YAML.stringify(info), 'utf8');
  const actualSize = (await fs.stat(installer)).size;
  if (actualSize !== size) throw new Error(`Blockmap size ${size} differs from installer size ${actualSize}`);
  console.log(`Refreshed Windows update metadata for signed ${installerName} (${size} bytes)`);
}

if (require.main === module) main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
