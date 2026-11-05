const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CALLBACK_URL, SecureOAuthStore, ApiOAuth, mcpOAuthProvider } = require('../desktop/oauth.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-room-oauth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value, 'utf8'),
    decryptString: value => value.toString('utf8')
  };
  return { root, store: (kind, id) => new SecureOAuthStore(root, encryption, root, kind, id) };
}

test('API OAuth uses PKCE, verifies callback state, stores tokens and refreshes', async t => {
  const { store } = fixture(t);
  const saved = store('api', 'orders');
  let authorizing;
  let exchanges = 0;
  const callback = { async start() {}, setState(value) { this.state = value; }, async wait() { return new URLSearchParams({ code: 'sample-code', state: this.state }); }, close() {} };
  const api = new ApiOAuth(saved, async url => {
    authorizing = new URL(url);
    assert.equal(authorizing.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorizing.searchParams.get('redirect_uri'), CALLBACK_URL);
    assert.equal(authorizing.searchParams.get('state'), callback.state);
  }, async (_url, options) => {
    exchanges++;
    const body = new URLSearchParams(options.body);
    if (exchanges === 1) {
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.ok(body.get('code_verifier'));
      assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'), authorizing.searchParams.get('code_challenge'));
      return new Response(JSON.stringify({ access_token: 'first', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 1 }), { status: 200 });
    }
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'refresh');
    return new Response(JSON.stringify({ access_token: 'second', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
  }, () => callback);
  const auth = { authorizationUrl: 'https://example.com/authorize', tokenUrl: 'https://example.com/token', clientId: 'public-client', scopes: ['read'] };
  assert.equal((await api.signIn(auth)).signedIn, true);
  assert.equal(await api.token(auth), 'second');
  assert.equal(new ApiOAuth(saved, () => {}).status().signedIn, true);
  api.signOut();
  assert.equal(api.status().signedIn, false);
  assert.equal(fs.existsSync(saved.file), false);
});

test('MCP OAuth provider scopes persisted credentials by source and issuer', t => {
  const { store } = fixture(t);
  const saved = store('mcp', 'docs');
  let state;
  const provider = mcpOAuthProvider(saved, { setState(value) { state = value; } }, { scopes: ['read'] }, () => {});
  assert.equal(provider.clientMetadata.scope, 'read');
  assert.equal(provider.state(), state);
  provider.saveCodeVerifier('verifier');
  provider.saveClientInformation({ client_id: 'one', issuer: 'https://issuer.one' }, { issuer: 'https://issuer.one' });
  provider.saveTokens({ access_token: 'token', token_type: 'Bearer', issuer: 'https://issuer.one' }, { issuer: 'https://issuer.one' });
  const resumed = mcpOAuthProvider(saved, { setState() {} }, {}, () => {});
  assert.equal(resumed.codeVerifier(), 'verifier');
  assert.equal(resumed.clientInformation({ issuer: 'https://issuer.one' }).client_id, 'one');
  assert.equal(resumed.clientInformation({ issuer: 'https://issuer.two' }), undefined);
  assert.equal(resumed.tokens().access_token, 'token');
  assert.equal(resumed.tokens({ issuer: 'https://issuer.one' }).access_token, 'token');
  assert.equal(resumed.tokens({ issuer: 'https://issuer.two' }), undefined);
});
