/* Render MCP results as inert HTML. Only bounded, known media types become previews. */
function mcpResultMarkup(output, safe) {
  const formattedText = value => {
    if (typeof value !== 'string') return JSON.stringify(value, null, 2);
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  };
  const blockMarkup = block => {
    if (!block || typeof block !== 'object') return `<pre>${safe(String(block))}</pre>`;
    if (block.type === 'resource_link') return `<div class="mcp-result-link"><strong>${safe(block.name || block.title || 'Linked resource')}</strong><code>${safe(block.uri)}</code>${block.description ? `<small>${safe(block.description)}</small>` : ''}</div>`;
    if (block.type === 'resource' && block.resource) return `<div class="mcp-result-link"><strong>Embedded resource</strong><code>${safe(block.resource.uri)}</code>${blockMarkup(block.resource)}</div>`;
    if (typeof block.text === 'string') return `<pre>${safe(formattedText(block.text).slice(0, 200000))}</pre>`;
    if (typeof block.data === 'string' && block.data.length < 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(block.data)) {
      const mime = String(block.mimeType || '');
      if (block.type === 'image' && /^image\/(?:png|jpeg|gif|webp)$/.test(mime)) return `<img class="mcp-result-image" alt="MCP image result" src="data:${mime};base64,${block.data}">`;
      if (block.type === 'audio' && /^audio\/(?:mpeg|mp3|wav|ogg|webm|mp4)$/.test(mime)) return `<audio class="mcp-result-audio" controls src="data:${mime};base64,${block.data}"></audio>`;
    }
    if (typeof block.data === 'string' && ['image', 'audio'].includes(block.type)) return `<p class="mcp-result-note">${safe(block.type)} · ${safe(block.mimeType || 'unknown media type')} · preview unavailable</p>`;
    if (typeof block.blob === 'string') return `<p class="mcp-result-note">Binary resource · ${safe(block.mimeType || 'unknown media type')} · ${Math.ceil(block.blob.length * .75)} bytes</p>`;
    return `<pre>${safe(JSON.stringify(block, null, 2).slice(0, 20000))}</pre>`;
  };
  const parts = [];
  if (output.structuredContent !== undefined) parts.push(`<section><strong>Structured result</strong><pre>${safe(JSON.stringify(output.structuredContent, null, 2).slice(0, 200000))}</pre></section>`);
  const blocks = output.content || output.contents;
  if (Array.isArray(blocks)) parts.push(...blocks.map(blockMarkup));
  if (Array.isArray(output.messages)) parts.push(...output.messages.map(message => `<section><strong>${safe(message.role || 'Prompt message')}</strong>${(Array.isArray(message.content) ? message.content : [message.content]).map(blockMarkup).join('')}</section>`));
  return parts.join('') || `<pre>${safe(JSON.stringify(output, null, 2).slice(0, 200000))}</pre>`;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mcpResultMarkup };
