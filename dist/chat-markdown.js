/* Render agent Markdown as a small, safe set of HTML elements. Raw HTML is always text. */
(() => {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const inlinePattern = /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

  function inline(source) {
    const value = String(source);
    let result = '';
    let start = 0;
    for (const match of value.matchAll(inlinePattern)) {
      result += escape(value.slice(start, match.index));
      if (match[1] !== undefined) result += `<code>${escape(match[1])}</code>`;
      else if (match[2] !== undefined) {
        try {
          const url = new URL(match[3]);
          result += `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(match[2])}</a>`;
        } catch (_) { result += escape(match[0]); }
      } else if (match[4] !== undefined || match[5] !== undefined) result += `<strong>${inline(match[4] ?? match[5])}</strong>`;
      else result += `<em>${inline(match[6] ?? match[7])}</em>`;
      start = match.index + match[0].length;
    }
    return result + escape(value.slice(start));
  }

  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
  }
  function tableAt(lines, index) {
    if (index + 1 >= lines.length || !lines[index].includes('|')) return false;
    const header = cells(lines[index]);
    const separator = cells(lines[index + 1]);
    return header.length > 1 && separator.length === header.length && separator.every(cell => /^:?-{3,}:?$/.test(cell));
  }
  const listMatch = line => /^\s{0,3}([-*+]|\d+\.)\s+(.+)$/.exec(line);
  const headingMatch = line => /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  const fenceMatch = line => /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  const blockStart = (lines, index) => headingMatch(lines[index]) || fenceMatch(lines[index]) || listMatch(lines[index]) || /^\s{0,3}>/.test(lines[index]) || tableAt(lines, index);

  function render(source) {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const fence = fenceMatch(line);
      if (fence) {
        const marker = fence[1][0];
        const size = fence[1].length;
        const code = [];
        index++;
        while (index < lines.length && !new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{${size},}\\s*$`).test(lines[index])) code.push(lines[index++]);
        if (index < lines.length) index++;
        blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
        continue;
      }
      const heading = headingMatch(line);
      if (heading) {
        const level = Math.min(heading[1].length + 2, 6);
        blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        index++;
        continue;
      }
      if (tableAt(lines, index)) {
        const header = cells(lines[index]);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]));
        blocks.push(`<div class="chat-table-scroll"><table><thead><tr>${header.map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${header.map((_, column) => `<td>${inline(row[column] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const list = listMatch(line);
      if (list) {
        const ordered = /^\d/.test(list[1]);
        const items = [];
        while (index < lines.length) {
          const item = listMatch(lines[index]);
          if (!item || /^\d/.test(item[1]) !== ordered) break;
          items.push(`<li>${inline(item[2])}</li>`);
          index++;
        }
        const tag = ordered ? 'ol' : 'ul';
        blocks.push(`<${tag}>${items.join('')}</${tag}>`);
        continue;
      }
      if (/^\s{0,3}>/.test(line)) {
        const quoted = [];
        while (index < lines.length && /^\s{0,3}>/.test(lines[index])) quoted.push(lines[index++].replace(/^\s{0,3}>\s?/, ''));
        blocks.push(`<blockquote>${render(quoted.join('\n'))}</blockquote>`);
        continue;
      }
      if (/^\s{0,3}([-*_]\s*){3,}$/.test(line)) { blocks.push('<hr>'); index++; continue; }
      const paragraph = [line.trim()];
      index++;
      while (index < lines.length && lines[index].trim() && !blockStart(lines, index)) paragraph.push(lines[index++].trim());
      blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
    return `<div class="chat-markdown">${blocks.join('')}</div>`;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { renderChatMarkdown: render };
  if (typeof window !== 'undefined') window.renderChatMarkdown = render;
})();
