import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const notesFile = new URL('../data/notes.json', import.meta.url);

export async function handleRequest(request, response) {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url === '/api/notes') {
    const notes = await readFile(notesFile, 'utf8');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(notes);
    return;
  }
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Hello Workspace</title><style>body{font:16px system-ui;max-width:680px;margin:12vh auto;padding:0 24px;color:#172435}a{color:#356282}code{background:#eef3f5;padding:3px 6px;border-radius:4px}</style><h1>Hello Workspace</h1><p>This tiny app is running from a real OpenBuildRoom workspace.</p><p>Try <a href="/api/notes">the notes API</a> and <a href="/health">the health check</a>. In OpenBuildRoom, stop the service, run the tests, inspect the data folder, and read the Spec Kit feature.</p><p>Source: <code>app/server.mjs</code></p></html>`);
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('Not found');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 43179);
  createServer((request, response) => {
    handleRequest(request, response).catch(error => {
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end(error.message);
    });
  }).listen(port, '127.0.0.1', () => console.log(`Hello Workspace listening at http://127.0.0.1:${port}`));
}
