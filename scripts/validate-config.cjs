const path = require('node:path');
const { loadConfig } = require('./config.cjs');
try {
  const file = path.resolve(process.argv[2] || 'productview.yaml');
  const { config } = loadConfig(file);
  process.stdout.write(`OK: ${config.project.name} · ${config.components.length} Komponenten · ${config.connections.length} Verbindungen\n`);
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
