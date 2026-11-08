const fs = require('node:fs');
const path = require('node:path');

// Local display state only. Opening a project writes last-project-v1.json in workspace.cjs.
function startupDestination(userData, registeredProjects, hasProjectConfig) {
  const lastFile = path.join(userData, 'last-project-v1.json');
  const introFile = path.join(userData, 'intro-seen-v1.json');
  if (fs.existsSync(lastFile)) {
    try {
      const root = JSON.parse(fs.readFileSync(lastFile, 'utf8')).root;
      if (typeof root === 'string' && hasProjectConfig(root)) return { mode: 'project', root };
    } catch { /* A missing or damaged project goes to the project chooser below. */ }
  }
  const available = registeredProjects.find(hasProjectConfig);
  if (available) return { mode: 'project', root: available };
  if (fs.existsSync(introFile) || fs.existsSync(lastFile)) return { mode: 'empty' };
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(introFile, JSON.stringify({ seen: true }));
  return { mode: 'intro-demo' };
}

module.exports = { startupDestination };
