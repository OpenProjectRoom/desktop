const test = require('node:test');
const assert = require('node:assert/strict');
const { renderChatMarkdown } = require('../dist/chat-markdown.js');

test('agent answers render readable Markdown in a narrow chat panel', () => {
  const result = renderChatMarkdown('BuildSteer lists **9 configured components**:\n\n| Type | Components |\n|---|---|\n| Services | API; Worker |\n\n- Check the [service guide](https://example.com/guide)\n- Run `npm test`');
  assert.match(result, /<strong>9 configured components<\/strong>/);
  assert.match(result, /<table>.*<th scope="col">Type<\/th>.*<td>API; Worker<\/td>.*<\/table>/);
  assert.match(result, /<ul><li>Check the <a href="https:\/\/example\.com\/guide"/);
  assert.match(result, /<code>npm test<\/code>/);
});

test('agent output cannot inject HTML or executable links', () => {
  const result = renderChatMarkdown('<img src=x onerror=alert(1)>\n\n[run](javascript:alert(1))\n\n```html\n<script>alert(1)</script>\n```');
  assert.doesNotMatch(result, /<img|<script|href="javascript:/);
  assert.match(result, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
