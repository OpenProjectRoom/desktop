/* Conservative parser for common CLI help layouts. The full output stays visible. */
function commandParsedHelp(output) {
  const lines = String(output || '').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
  const usage = lines.find(line => /^\s*(usage|synopsis):\s*\S/i.test(line))?.trim() || '';
  const rows = [];
  const commands = [];
  const args = [];
  let section = '';
  for (const line of lines) {
    const heading = /^\s*(options?|flags?|commands?|available commands?|subcommands?|arguments?|positional arguments?):\s*$/i.exec(line);
    if (heading) { section = heading[1].toLowerCase(); continue; }
    if (!line.trim()) continue;
    const columns = /^\s{1,12}(\S(?:.*?\S)?)\s{2,}(\S.*)$/.exec(line);
    if (!columns) continue;
    const left = columns[1].trim();
    const description = columns[2].trim();
    if (/^-{1,2}[\w-]/.test(left) && rows.length < 60) {
      rows.push([line, left, description]);
    } else if (/commands?/.test(section) && /^[\w][\w-]*$/.test(left) && commands.length < 60) {
      commands.push({ name: left, description });
    } else if (/arguments?|positional/.test(section) && args.length < 40) {
      args.push({ name: left, description });
    }
  }
  return { usage, rows, commands, arguments: args };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { commandParsedHelp };
