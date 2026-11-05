const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig, configPath } = require('../scripts/config.cjs');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const SPEC_NAME = /^(?:openapi|swagger)(?:\.[\w-]+)?\.(?:yaml|yml|json)$/i;
const SKIP = new Set(['.git', '.productview', 'node_modules', 'target', 'build', 'dist', '.next', 'vendor']);

function cleanUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('Enter a valid API base URL.'); }
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use HTTPS or local HTTP. Keep credentials and query values out of the base URL.');
  }
  return url.toString().replace(/\/$/, '');
}
function cleanSpec(root, relative) {
  if (!relative) return null;
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..') || relative.length > 300) throw new Error('Choose a relative OpenAPI file in the project.');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep) || !fs.statSync(file).isFile() || fs.statSync(file).size > 2_000_000) throw new Error('OpenAPI file must be a regular project file below 2 MB.');
  return file;
}
function readSpec(root, relative) {
  const file = cleanSpec(root, relative);
  if (!file) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const spec = /\.json$/i.test(file) ? JSON.parse(raw) : YAML.parse(raw, { uniqueKeys: true });
  if (!spec || typeof spec !== 'object' || !/^3\./.test(String(spec.openapi || ''))) throw new Error('Only OpenAPI 3.x documents are supported.');
  const operations = [];
  for (const [route, pathItem] of Object.entries(spec.paths || {})) {
    if (!route.startsWith('/') || !pathItem || typeof pathItem !== 'object') continue;
    for (const method of METHODS) {
      const operation = pathItem[method.toLowerCase()];
      if (!operation || typeof operation !== 'object') continue;
      operations.push({ method, path: route, summary: String(operation.summary || operation.operationId || ''), description: String(operation.description || '').slice(0, 500), tags: Array.isArray(operation.tags) ? operation.tags.filter(tag => typeof tag === 'string').slice(0, 4) : [] });
      if (operations.length >= 300) break;
    }
    if (operations.length >= 300) break;
  }
  return { title: String(spec.info?.title || 'OpenAPI'), version: String(spec.info?.version || ''), operations, suggestedUrl: Array.isArray(spec.servers) && typeof spec.servers[0]?.url === 'string' ? spec.servers[0].url : '' };
}
function discoverSpecs(root) {
  const found = [];
  let visited = 0;
  function walk(relative, depth) {
    if (depth > 4 || visited > 1600 || found.length >= 30) return;
    let entries;
    try { entries = fs.readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++visited > 1600 || found.length >= 30) break;
      if (entry.isSymbolicLink()) continue;
      const next = path.join(relative, entry.name).replace(/^\.\//, '');
      if (entry.isFile() && SPEC_NAME.test(entry.name)) {
        try { const spec = readSpec(root, next); found.push({ id: `file:${next}`, name: spec.title, source: next, spec: next, suggestedUrl: spec.suggestedUrl, operations: spec.operations, version: spec.version }); } catch { /* A name alone is not proof of an OpenAPI file. */ }
      } else if (entry.isDirectory() && !SKIP.has(entry.name)) walk(next, depth + 1);
    }
  }
  walk('.', 0);
  return found;
}
function listApiSources(root, config) {
  if (!root) return [];
  const configured = (config.workspace?.apiSources || []).map(item => {
    let spec = null, error = '';
    if (item.spec) try { spec = readSpec(root, item.spec); } catch (cause) { error = cause.message; }
    return { ...item, id: `yaml:${item.id}`, source: '.projectroom/project.yaml', linked: true, operations: spec?.operations || [], specTitle: spec?.title || '', specVersion: spec?.version || '', error };
  });
  const linkedPaths = new Set((config.workspace?.apiSources || []).map(item => item.spec).filter(Boolean));
  return [...configured, ...discoverSpecs(root).filter(item => !linkedPaths.has(item.spec)).map(item => ({ ...item, linked: false, baseUrl: '' }))];
}
function editDocument(root) {
  const base = fs.realpathSync(root);
  const file = configPath(base);
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Cannot edit a linked configuration file.');
  const current = loadConfig(file);
  const document = YAML.parseDocument(current.raw, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  return { base, file, current, document };
}
function save(record) {
  const raw = String(record.document);
  parseConfig(raw);
  const temporary = path.join(record.base, `.productview-api-${process.pid}-${Date.now()}.tmp`);
  try { fs.writeFileSync(temporary, raw, { flag: 'wx' }); fs.renameSync(temporary, record.file); }
  finally { try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  return loadConfig(record.file);
}
function addApiSource(root, input) {
  if (!input || typeof input !== 'object') throw new Error('Enter an API source.');
  const record = editDocument(root);
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) throw new Error('API name must contain 1–100 characters.');
  const baseUrl = cleanUrl(input.baseUrl);
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'api';
  const prefix = /^[a-z]/.test(stem) ? stem : `api-${stem}`;
  const taken = new Set((record.current.config.workspace?.apiSources || []).map(item => item.id));
  let id = prefix;
  for (let n = 2; taken.has(id); n++) id = `${prefix}-${n}`;
  const item = { id, name, baseUrl };
  const description = String(input.description || '').trim();
  if (description.length > 240) throw new Error('Description is too long.');
  if (description) item.description = description;
  if (input.spec) { readSpec(root, input.spec); item.spec = input.spec; }
  const authEnv = String(input.authEnv || '').trim();
  if (authEnv && !/^[A-Z][A-Z0-9_]*$/.test(authEnv)) throw new Error('Use an environment name such as API_TOKEN, never a value.');
  if (authEnv) item.authEnv = authEnv;
  if (!record.document.has('workspace')) record.document.set('workspace', new YAML.YAMLMap());
  const sources = record.document.getIn(['workspace', 'apiSources'], true);
  if (YAML.isSeq(sources)) sources.add(item);
  else record.document.setIn(['workspace', 'apiSources'], [item]);
  return { ...save(record), id };
}
function removeApiSource(root, id) {
  const record = editDocument(root);
  const sources = record.document.getIn(['workspace', 'apiSources'], true);
  if (!YAML.isSeq(sources) || !sources.items.some(item => item.get('id') === id)) throw new Error('API source is no longer in .projectroom/project.yaml.');
  sources.items = sources.items.filter(item => item.get('id') !== id);
  return save(record);
}
async function sendApiRequest(root, config, input, getSecret, fetcher = fetch) {
  const source = (config.workspace?.apiSources || []).find(item => item.id === input?.sourceId);
  if (!source) throw new Error('Choose an API registered in .projectroom/project.yaml.');
  const base = new URL(cleanUrl(source.baseUrl));
  const method = String(input.method || '').toUpperCase();
  if (!METHODS.includes(method)) throw new Error('Unsupported HTTP method.');
  const route = String(input.path || '').trim();
  if (!route || route.length > 2000 || !route.startsWith('/') || route.startsWith('//') || /[\r\n]/.test(route)) throw new Error('Enter a relative path beginning with /.');
  const target = new URL(base.pathname.replace(/\/$/, '') + route, base.origin);
  if (target.origin !== base.origin || target.username || target.password || target.hash) throw new Error('Request must stay on the selected API origin.');
  let headers = {};
  if (input.headers) {
    if (typeof input.headers !== 'object' || Array.isArray(input.headers)) throw new Error('Headers must be a JSON object.');
    for (const [name, value] of Object.entries(input.headers)) {
      if (!/^[A-Za-z0-9-]{1,80}$/.test(name) || typeof value !== 'string' || value.length > 2000 || /[\r\n]/.test(value)) throw new Error('Invalid request header.');
      if (/^(authorization|cookie|host|content-length|proxy-authorization)$/i.test(name)) throw new Error('Set authentication through the local Environment page.');
      headers[name] = value;
    }
  }
  let token = null;
  if (source.authEnv) {
    token = getSecret(source.authEnv);
    if (!token) throw new Error(`${source.authEnv} is missing. Set it in local Environment first.`);
    headers.Authorization = `Bearer ${token}`;
  }
  const body = String(input.body || '');
  if (body.length > 200_000) throw new Error('Request body exceeds 200 KB.');
  if (body && ['GET', 'HEAD'].includes(method)) throw new Error(`${method} cannot send a body here.`);
  if (body && !Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  const started = Date.now();
  const response = await fetcher(target, { method, headers, body: body || undefined, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 1_000_000) { await response.body?.cancel(); throw new Error('Response exceeds the 1 MB preview limit.'); }
  let text = '';
  for await (const chunk of response.body || []) {
    text += Buffer.from(chunk).toString('utf8');
    if (Buffer.byteLength(text) > 1_000_000) { await response.body?.cancel(); throw new Error('Response exceeds the 1 MB preview limit.'); }
  }
  if (token) text = text.replaceAll(token, '[redacted]');
  return { status: response.status, statusText: response.statusText, durationMs: Date.now() - started, contentType: response.headers.get('content-type') || '', body: text.slice(0, 200_000), truncated: text.length > 200_000, method, path: target.pathname };
}

module.exports = { cleanUrl, readSpec, discoverSpecs, listApiSources, addApiSource, removeApiSource, sendApiRequest };
