const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { loadConfig, parseConfig, configPath } = require('../scripts/config.cjs');
const { safeEndpoint } = require('./oauth.cjs');

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
function cleanSpecPath(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 300 || !value.startsWith('/') || value.startsWith('//') || /[?#%\\\s]/.test(value) || value.split('/').includes('..') || value.split('/').includes('.')) {
    throw new Error('Use a plain OpenAPI path on this API, such as /open-api/core.');
  }
  return value;
}
function validateAuth(auth) {
  if (!auth || typeof auth !== 'object') return null;
  if (auth.type === 'none') return { type: 'none' };
  if (auth.type === 'bearer') {
    if (!/^[A-Z][A-Z0-9_]*$/.test(auth.env || '')) throw new Error('Bearer auth needs an Environment variable name.');
    return { type: 'bearer', env: auth.env };
  }
  if (auth.type === 'apiKey') {
    if (!/^[A-Z][A-Z0-9_]*$/.test(auth.env || '') || !['header', 'query'].includes(auth.in) || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(auth.name || '')) throw new Error('API key needs a variable name, header or query placement, and parameter name.');
    if (/^(authorization|cookie|host|content-length|proxy-authorization)$/i.test(auth.name)) throw new Error('Use Bearer auth for Authorization; protected headers cannot hold API keys.');
    return { type: 'apiKey', env: auth.env, in: auth.in, name: auth.name };
  }
  if (auth.type === 'oauth2') {
    const authorizationUrl = safeEndpoint(auth.authorizationUrl).href;
    const tokenUrl = safeEndpoint(auth.tokenUrl).href;
    if (typeof auth.clientId !== 'string' || !auth.clientId.trim() || auth.clientId.length > 240) throw new Error('OAuth needs a public client ID.');
    if (auth.scopes && (!Array.isArray(auth.scopes) || auth.scopes.some(scope => typeof scope !== 'string' || !scope.trim()))) throw new Error('OAuth scopes must be nonempty names.');
    if (auth.issuer) safeEndpoint(auth.issuer);
    return { type: 'oauth2', authorizationUrl, tokenUrl, clientId: auth.clientId.trim(), scopes: auth.scopes || [], ...(auth.issuer ? { issuer: new URL(auth.issuer).href } : {}) };
  }
  throw new Error('Unsupported API authentication type.');
}
function cleanSpec(root, relative) {
  if (!relative) return null;
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').includes('..') || relative.length > 300) throw new Error('Choose a relative OpenAPI file in the project.');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, relative));
  if (!file.startsWith(base + path.sep) || !fs.statSync(file).isFile() || fs.statSync(file).size > 2_000_000) throw new Error('OpenAPI file must be a regular project file below 2 MB.');
  return file;
}
function localReference(document, value, depth = 0) {
  if (!value || typeof value !== 'object' || !value.$ref || depth > 8) return value;
  if (!value.$ref.startsWith('#/')) return value;
  const target = value.$ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, part) => node && typeof node === 'object' ? node[part] : undefined, document);
  if (!target || typeof target !== 'object') return value;
  return { ...localReference(document, target, depth + 1), ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref')) };
}
function schemaDetails(document, value, depth = 0) {
  if (!value || typeof value !== 'object') return null;
  const schema = localReference(document, value);
  if (schema.$ref) return { type: 'reference', ref: schema.$ref };
  const result = { type: schema.type || (schema.properties ? 'object' : schema.items ? 'array' : ''),
    format: schema.format || '', description: String(schema.description || '').slice(0, 300) };
  for (const key of ['default', 'example', 'const', 'enum']) if (schema[key] !== undefined) result[key] = schema[key];
  if (depth < 2 && schema.properties && typeof schema.properties === 'object') {
    result.required = Array.isArray(schema.required) ? schema.required : [];
    result.properties = Object.fromEntries(Object.entries(schema.properties).slice(0, 50)
      .map(([key, child]) => [key, schemaDetails(document, child, depth + 1)]));
  }
  if (depth < 2 && schema.items) result.items = schemaDetails(document, schema.items, depth + 1);
  if (depth < 2) for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(schema[key])) result[key] = schema[key].slice(0, 12).map(part => schemaDetails(document, part, depth + 1));
  }
  return result;
}
function mediaDetails(document, content) {
  return Object.entries(content || {}).slice(0, 12).map(([type, raw]) => {
    const media = localReference(document, raw);
    const firstExample = Object.values(media?.examples || {})[0];
    return { type, schema: schemaDetails(document, media?.schema),
      example: media?.example ?? localReference(document, firstExample)?.value ?? undefined };
  });
}
function describeSpec(spec) {
  if (!spec || typeof spec !== 'object' || !/^3\./.test(String(spec.openapi || ''))) throw new Error('Only OpenAPI 3.x documents are supported.');
  const operations = [];
  for (const [route, rawPathItem] of Object.entries(spec.paths || {})) {
    const pathItem = localReference(spec, rawPathItem);
    if (!route.startsWith('/') || !pathItem || typeof pathItem !== 'object') continue;
    for (const method of METHODS) {
      const operation = localReference(spec, pathItem[method.toLowerCase()]);
      if (!operation || typeof operation !== 'object') continue;
      const rawParameters = [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])];
      const parameters = [...new Map(rawParameters.map(raw => {
        const parameter = localReference(spec, raw);
        return [`${parameter?.in}:${parameter?.name}`, parameter];
      })).values()].filter(parameter => parameter?.name && parameter?.in).map(parameter => ({
        name: parameter.name, in: parameter.in, required: parameter.in === 'path' || !!parameter.required,
        description: String(parameter.description || '').slice(0, 300),
        style: parameter.style || '', explode: parameter.explode,
        schema: schemaDetails(spec, parameter.schema), example: parameter.example ?? parameter.schema?.example
      }));
      const body = localReference(spec, operation.requestBody);
      const security = operation.security ?? spec.security ?? [];
      operations.push({ method, path: route, summary: String(operation.summary || operation.operationId || ''),
        description: String(operation.description || '').slice(0, 500), deprecated: !!operation.deprecated,
        tags: Array.isArray(operation.tags) ? operation.tags.filter(tag => typeof tag === 'string').slice(0, 4) : [],
        parameters, requestBody: body ? { required: !!body.required, description: String(body.description || '').slice(0, 300), content: mediaDetails(spec, body.content) } : null,
        responses: Object.entries(operation.responses || {}).slice(0, 30).map(([status, raw]) => { const response = localReference(spec, raw); return { status, description: String(response?.description || '').slice(0, 300), content: mediaDetails(spec, response?.content) }; }),
        security: Array.isArray(security) ? security.map(requirement => Object.entries(requirement).map(([name, scopes]) => ({ name, scopes,
          scheme: localReference(spec, spec.components?.securitySchemes?.[name])?.type || '' }))) : [] });
      if (operations.length >= 300) break;
    }
    if (operations.length >= 300) break;
  }
  return { title: String(spec.info?.title || 'OpenAPI'), version: String(spec.info?.version || ''), operations, suggestedUrl: Array.isArray(spec.servers) && typeof spec.servers[0]?.url === 'string' ? spec.servers[0].url : '' };
}
function readSpec(root, relative) {
  const file = cleanSpec(root, relative);
  if (!file) return null;
  const raw = fs.readFileSync(file, 'utf8');
  return describeSpec(/\.json$/i.test(file) ? JSON.parse(raw) : YAML.parse(raw, { uniqueKeys: true }));
}
async function loadApiSpec(config, id, fetcher = fetch) {
  const source = (config.workspace?.apiSources || []).find(item => item.id === id);
  if (!source?.specPath) throw new Error('This API has no live OpenAPI path configured.');
  const base = new URL(cleanUrl(source.baseUrl));
  const target = new URL(cleanSpecPath(source.specPath), base.origin);
  const response = await fetcher(target, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`OpenAPI endpoint returned HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') || 0) > 2_000_000) throw new Error('OpenAPI document exceeds 2 MB.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > 2_000_000) { await response.body?.cancel(); throw new Error('OpenAPI document exceeds 2 MB.'); }
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const document = /json/i.test(response.headers.get('content-type') || '') || raw.trimStart().startsWith('{')
    ? JSON.parse(raw) : YAML.parse(raw, { uniqueKeys: true });
  return { ...describeSpec(document), source: source.specPath };
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
      const next = path.join(relative, entry.name).split(path.sep).join('/').replace(/^\.\//, '');
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
  const linkedPaths = new Set((config.workspace?.apiSources || []).map(item => item.spec).filter(Boolean).map(spec => path.resolve(root, spec)));
  return [...configured, ...discoverSpecs(root).filter(item => !linkedPaths.has(path.resolve(root, item.spec))).map(item => ({ ...item, linked: false, baseUrl: '' }))];
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
  if (input.spec && input.specPath) throw new Error('Choose either a project OpenAPI file or a live endpoint path.');
  if (input.spec) { readSpec(root, input.spec); item.spec = input.spec; }
  if (input.specPath) item.specPath = cleanSpecPath(input.specPath);
  const authEnv = String(input.authEnv || '').trim();
  if (authEnv && !/^[A-Z][A-Z0-9_]*$/.test(authEnv)) throw new Error('Use an environment name such as API_TOKEN, never a value.');
  if (authEnv) item.authEnv = authEnv;
  if (input.auth && input.auth.type !== 'none') {
    if (authEnv) throw new Error('Choose one API authentication method.');
    item.auth = validateAuth(input.auth);
  }
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
async function sendApiRequest(root, config, input, getSecret, fetcher = fetch, getOAuthToken = null) {
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
  const auth = source.auth || (source.authEnv ? { type: 'bearer', env: source.authEnv } : { type: 'none' });
  let token = null;
  if (auth.type === 'bearer' || auth.type === 'apiKey') {
    token = getSecret(auth.env);
    if (!token) throw new Error(`${auth.env} is missing. Set it in local Environment first.`);
    if (auth.type === 'bearer') headers.Authorization = `Bearer ${token}`;
    else if (auth.in === 'header') {
      if (Object.keys(headers).some(name => name.toLowerCase() === auth.name.toLowerCase())) throw new Error('The configured API key header cannot be entered manually.');
      headers[auth.name] = token;
    } else target.searchParams.set(auth.name, token);
  } else if (auth.type === 'oauth2') {
    if (!getOAuthToken) throw new Error('Sign in to this API with OAuth first.');
    token = await getOAuthToken(source);
    if (!token) throw new Error('Sign in to this API with OAuth first.');
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

module.exports = { cleanUrl, cleanSpecPath, validateAuth, readSpec, loadApiSpec, discoverSpecs, listApiSources, addApiSource, removeApiSource, sendApiRequest };
