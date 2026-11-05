const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const CALLBACK_PORT = 48271;
const CALLBACK_PATH = '/oauth/callback';
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}${CALLBACK_PATH}`;

function safeEndpoint(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('OAuth endpoints must use HTTPS or local HTTP, without credentials.');
  return url;
}

class SecureOAuthStore {
  constructor(userData, encryption, root, kind, id) {
    this.encryption = encryption;
    const key = crypto.createHash('sha256').update(`${fs.realpathSync(root)}\0${kind}\0${id}`).digest('hex');
    this.file = path.join(userData, 'oauth', `${key}.json`);
  }
  read() {
    try {
      if (fs.lstatSync(this.file).isSymbolicLink()) throw new Error('Refusing linked OAuth store.');
      const encoded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (encoded.version !== 1 || typeof encoded.data !== 'string') throw new Error('Invalid OAuth store.');
      return JSON.parse(this.encryption.decryptString(Buffer.from(encoded.data, 'base64')));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }
  write(value) {
    if (!this.encryption?.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable; OAuth tokens were not saved.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const encrypted = this.encryption.encryptString(JSON.stringify(value)).toString('base64');
    const temporary = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, data: encrypted }), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
      fs.chmodSync(this.file, 0o600);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  clear() { try { fs.unlinkSync(this.file); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

class LoopbackCallback {
  constructor() { this.server = null; this.state = null; this.pending = null; }
  async start() {
    if (this.server) throw new Error('OAuth sign-in is already active.');
    this.pending = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.pending.catch(() => {});
    this.server = http.createServer((request, response) => {
      let params;
      try {
        const url = new URL(request.url, CALLBACK_URL);
        if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) { response.writeHead(404); response.end(); return; }
        params = url.searchParams;
      } catch { response.writeHead(400); response.end(); return; }
      const valid = !!this.state && params.get('state') === this.state && !!params.get('code');
      response.writeHead(valid ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', connection: 'close', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
      response.once('finish', () => {
        if (!valid) this.reject(new Error('OAuth sign-in failed or callback state did not match.'));
        else this.resolve(params);
      });
      response.end(`<html><title>Project Room</title><body style="font:16px system-ui;padding:40px">${valid ? 'You can return to Project Room.' : 'Sign-in could not be completed. Return to Project Room.'}</body></html>`);
    });
    try { await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(CALLBACK_PORT, '127.0.0.1', resolve); }); }
    catch (error) { await this.close(); throw new Error(`OAuth callback port ${CALLBACK_PORT} is unavailable: ${error.message}`); }
    return CALLBACK_URL;
  }
  setState(state) { this.state = state; }
  async wait() {
    let timer;
    try { return await Promise.race([this.pending, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('OAuth sign-in timed out.')), 300000); })]); }
    finally { clearTimeout(timer); await this.close(); }
  }
  async close() {
    const server = this.server;
    this.server = null;
    if (server) await new Promise(resolve => { try { server.close(resolve); } catch { resolve(); } });
  }
}

async function tokenPost(url, params, fetcher = fetch) {
  const response = await fetcher(safeEndpoint(url), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(params), redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (Number(response.headers.get('content-length') || 0) > 65536) throw new Error('OAuth token response is too large.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.length;
    if (bytes > 65536) { await response.body?.cancel().catch(() => {}); throw new Error('OAuth token response is too large.'); }
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString('utf8');
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('OAuth token endpoint returned invalid JSON.'); }
  if (!response.ok || !data.access_token || !/^bearer$/i.test(data.token_type || '')) throw new Error('OAuth token exchange failed. Check the client ID, scopes and provider settings.');
  return data;
}

class ApiOAuth {
  constructor(store, openExternal, fetcher = fetch, callbackFactory = () => new LoopbackCallback()) { this.store = store; this.openExternal = openExternal; this.fetcher = fetcher; this.callbackFactory = callbackFactory; }
  status() { const data = this.store.read(); return { signedIn: !!(data.accessToken || data.refreshToken), expiresAt: data.expiresAt || null }; }
  signOut() { this.store.clear(); }
  async signIn(auth) {
    if (!this.store.encryption?.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable; OAuth sign-in cannot start.');
    const callback = this.callbackFactory();
    await callback.start();
    try {
      const state = crypto.randomBytes(24).toString('base64url');
      const verifier = crypto.randomBytes(32).toString('base64url');
      callback.setState(state);
      const authorize = safeEndpoint(auth.authorizationUrl);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', auth.clientId);
      authorize.searchParams.set('redirect_uri', CALLBACK_URL);
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
      authorize.searchParams.set('code_challenge_method', 'S256');
      if (auth.scopes?.length) authorize.searchParams.set('scope', auth.scopes.join(' '));
      await this.openExternal(authorize.href);
      const params = await callback.wait();
      if (auth.issuer && params.has('iss') && params.get('iss') !== auth.issuer) throw new Error('OAuth issuer mismatch.');
      const token = await tokenPost(auth.tokenUrl, { grant_type: 'authorization_code', code: params.get('code'), client_id: auth.clientId, redirect_uri: CALLBACK_URL, code_verifier: verifier }, this.fetcher);
      this.save(token);
      return this.status();
    } finally { await callback.close(); }
  }
  save(token, previous = {}) {
    this.store.write({ accessToken: token.access_token, refreshToken: token.refresh_token || previous.refreshToken || null,
      expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : null });
  }
  async token(auth) {
    const data = this.store.read();
    if (!data.accessToken) return null;
    if (!data.expiresAt || data.expiresAt > Date.now() + 60000) return data.accessToken;
    if (!data.refreshToken) throw new Error('OAuth session expired. Sign in again.');
    const refreshed = await tokenPost(auth.tokenUrl, { grant_type: 'refresh_token', refresh_token: data.refreshToken, client_id: auth.clientId }, this.fetcher);
    this.save(refreshed, data);
    return refreshed.access_token;
  }
}

function mcpOAuthProvider(store, callback, auth, openExternal) {
  const data = store.read();
  const persist = () => store.write(data);
  const issuerKey = ctx => ctx?.issuer || '__default__';
  return {
    get redirectUrl() { return CALLBACK_URL; },
    get clientMetadata() { return { redirect_uris: [CALLBACK_URL], client_name: 'Project Room Desktop', scope: (auth.scopes || []).join(' ') || undefined }; },
    state() { const state = crypto.randomBytes(24).toString('base64url'); callback.setState(state); return state; },
    clientInformation(ctx) { return data.clients?.[ctx?.issuer] || (auth.clientId ? { client_id: auth.clientId, issuer: ctx?.issuer } : undefined); },
    saveClientInformation(value, ctx) { data.clients ||= {}; data.clients[ctx?.issuer || value.issuer] = value; persist(); },
    tokens(ctx) { return ctx?.issuer ? data.tokensByIssuer?.[issuerKey(ctx)] : data.latestTokens; },
    saveTokens(value, ctx) { data.tokensByIssuer ||= {}; data.tokensByIssuer[issuerKey(ctx)] = value; data.latestTokens = value; persist(); },
    redirectToAuthorization(url) { return openExternal(safeEndpoint(url).href); },
    saveCodeVerifier(value) { data.verifier = value; persist(); },
    codeVerifier() { if (!data.verifier) throw new Error('Missing OAuth verifier.'); return data.verifier; },
    saveDiscoveryState(value) { data.discovery = value; persist(); },
    discoveryState() { return data.discovery; },
    invalidateCredentials(scope) { if (scope === 'all' || scope === 'tokens') { delete data.tokensByIssuer; delete data.latestTokens; } if (scope === 'all' || scope === 'client') delete data.clients; if (scope === 'all' || scope === 'verifier') delete data.verifier; if (scope === 'all' || scope === 'discovery') delete data.discovery; persist(); }
  };
}

module.exports = { CALLBACK_URL, SecureOAuthStore, LoopbackCallback, ApiOAuth, mcpOAuthProvider, safeEndpoint };
