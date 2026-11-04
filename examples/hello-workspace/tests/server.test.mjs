import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../app/server.mjs';

async function request(url) {
  const result = { status: null, headers: null, body: '' };
  await handleRequest({ url }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = body; }
  });
  return result;
}

test('health route reports ready status', async () => {
  const response = await request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
});

test('notes API reads the declared local storage', async () => {
  const response = await request('/api/notes');
  assert.equal(response.status, 200);
  const notes = JSON.parse(response.body);
  assert.equal(notes[0].title, 'First working release');
});
