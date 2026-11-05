const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('./config.cjs');
const { readSpec, discoverSpecs, listApiSources, addApiSource, removeApiSource, sendApiRequest } = require('../desktop/api-explorer.cjs');
const { apiRequestFromDraft } = require('../dist/api-request.js');

test('OpenAPI parameter fields produce a concrete request while unsupported uploads stay blocked', () => {
  const operation = { parameters: [
    { name: 'id', in: 'path', required: true },
    { name: 'include', in: 'query', schema: { type: 'array' } },
    { name: 'X-Trace', in: 'header' },
    { name: 'session', in: 'cookie' }
  ] };
  const draft = { method: 'POST', path: '/orders/{id}', headers: '{}', body: '{"paid":true}', contentType: 'application/json',
    params: { 'path:id': 'A 1', 'query:include': 'items,history', 'header:X-Trace': 'test', 'cookie:session': 'ignored' } };
  assert.deepEqual(apiRequestFromDraft(operation, draft), { method: 'POST', path: '/orders/A%201?include=items&include=history',
    headers: { 'X-Trace': 'test', 'Content-Type': 'application/json' }, body: '{"paid":true}' });
  assert.throws(() => apiRequestFromDraft(operation, { ...draft, params: {} }), /id is required/);
  assert.throws(() => apiRequestFromDraft(operation, { ...draft, contentType: 'multipart/form-data' }), /not supported/);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuildroom-api-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'specs', '001-orders', 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'productview.yaml'), 'schemaVersion: 1\nproject: {id: api-test, name: API Test}\ncomponents:\n  - {id: web, kind: service, name: Web, position: {x: 1, y: 1}, runtime: {command: [node, app.js], startup: manual}}\nconnections: []\n');
  fs.writeFileSync(path.join(root, 'specs', '001-orders', 'contracts', 'openapi.yaml'), 'openapi: 3.0.3\ninfo: {title: Orders API, version: 1.2.0}\npaths:\n  /orders:\n    get: {summary: List orders, responses: {"200": {description: OK}}}\n  /orders/{id}:\n    post: {summary: Update order, responses: {"200": {description: OK}}}\n');
  return root;
}

test('discovers real OpenAPI operations and manages multiple YAML sources', t => {
  const root = fixture(t);
  const discovered = discoverSpecs(root);
  assert.equal(discovered.length, 1);
  assert.deepEqual(discovered[0].operations.map(item => `${item.method} ${item.path}`), ['GET /orders', 'POST /orders/{id}']);
  const first = addApiSource(root, { name: 'Orders API', baseUrl: 'http://127.0.0.1:43179', spec: discovered[0].spec, authEnv: 'ORDERS_TOKEN' });
  const second = addApiSource(root, { name: 'Analytics API', baseUrl: 'https://api.example.test' });
  assert.equal(listApiSources(root, second.config).filter(item => item.linked).length, 2);
  assert.equal(listApiSources(root, second.config).filter(item => !item.linked).length, 0);
  assert.match(fs.readFileSync(path.join(root, 'productview.yaml'), 'utf8'), /authEnv: ORDERS_TOKEN/);
  const after = removeApiSource(root, first.id);
  assert.deepEqual(after.config.workspace.apiSources.map(item => item.id), [second.id]);
  assert.equal(discoverSpecs(root).length, 1);
});

test('keeps common OpenAPI request and response details, including local references', t => {
  const root = fixture(t);
  const file = 'specs/001-orders/contracts/openapi.json';
  fs.writeFileSync(path.join(root, file), JSON.stringify({
    openapi: '3.1.0', info: { title: 'Orders API', version: '2' },
    security: [{ bearerAuth: [] }],
    components: {
      parameters: { orderId: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } },
      schemas: { Order: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, paid: { type: 'boolean' } } } },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
    },
    paths: { '/orders/{id}': { parameters: [{ $ref: '#/components/parameters/orderId' }],
      post: { summary: 'Update order', parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' }, example: { id: 'A-1', paid: true } } } },
        responses: { '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } }
      } } }
  }));
  const operation = readSpec(root, file).operations[0];
  assert.deepEqual(operation.parameters.map(item => `${item.in}:${item.name}`), ['path:id', 'query:dryRun']);
  assert.equal(operation.requestBody.content[0].schema.properties.paid.type, 'boolean');
  assert.deepEqual(operation.requestBody.content[0].example, { id: 'A-1', paid: true });
  assert.equal(operation.responses[0].content[0].schema.properties.id.type, 'string');
  assert.equal(operation.security[0][0].scheme, 'http');
});

test('rejects credentials in YAML URLs and files outside the repository', t => {
  const root = fixture(t);
  assert.throws(() => addApiSource(root, { name: 'Bad', baseUrl: 'https://user:secret@example.com' }), /credentials/);
  assert.throws(() => addApiSource(root, { name: 'Bad', baseUrl: 'http://example.com' }), /HTTPS/);
  assert.throws(() => addApiSource(root, { name: 'Bad', baseUrl: 'https://example.com', spec: '../outside.yaml' }), /relative/);
  assert.equal(loadConfig(path.join(root, 'productview.yaml')).config.workspace, undefined);
});

test('sends explicit request, uses local Bearer token and redacts echoed secrets', async t => {
  const root = fixture(t);
  let seen = null;
  const baseUrl = 'http://127.0.0.1:43179';
  const added = addApiSource(root, { name: 'Orders API', baseUrl, authEnv: 'ORDERS_TOKEN' });
  const response = await sendApiRequest(root, added.config, { sourceId: added.id, method: 'POST', path: '/orders/7?include=items', headers: { Accept: 'application/json' }, body: '{"paid":true}' }, name => name === 'ORDERS_TOKEN' ? 'test-secret-value' : null, async (url, options) => {
    seen = { method: options.method, url: url.pathname + url.search, auth: options.headers.Authorization, body: options.body, redirect: options.redirect };
    return new Response(JSON.stringify({ ok: true, echoedAuthorization: options.headers.Authorization }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(seen, { method: 'POST', url: '/orders/7?include=items', auth: 'Bearer test-secret-value', body: '{"paid":true}', redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.equal(response.path, '/orders/7');
  assert.doesNotMatch(response.body, /test-secret-value/);
  assert.match(response.body, /\[redacted\]/);
});

test('blocks cross-origin paths, credential headers and requests to unregistered APIs', async t => {
  const root = fixture(t);
  const added = addApiSource(root, { name: 'Orders API', baseUrl: 'https://example.com' });
  const secret = () => null;
  await assert.rejects(sendApiRequest(root, added.config, { sourceId: added.id, method: 'GET', path: '//evil.example/steal' }, secret), /relative path/);
  await assert.rejects(sendApiRequest(root, added.config, { sourceId: added.id, method: 'GET', path: '/', headers: { Authorization: 'Bearer inline' } }, secret), /local Environment/);
  await assert.rejects(sendApiRequest(root, added.config, { sourceId: 'unknown', method: 'GET', path: '/' }, secret), /registered/);
});
