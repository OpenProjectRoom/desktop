const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MAX_ROWS = 20;
const MAX_TABLES = 100;
const MAX_FILES = 250;
const PREVIEW_BYTES = 65536;

function engine(item) {
  if (item.kind === 'storage') return 'files';
  const name = String(item.data?.engine || '').toLowerCase();
  if (/postgres|pgsql|^pg\b/.test(name)) return 'postgres';
  if (/mariadb|mysql/.test(name)) return 'mysql';
  if (/sqlite/.test(name)) return 'sqlite';
  return 'unsupported';
}
function within(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error('A relative project path is required.');
  const base = fs.realpathSync(root);
  const target = fs.realpathSync(path.resolve(base, relative));
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Source path is outside the project.');
  return target;
}
function cell(value) {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return `[binary · ${value.length} bytes]`;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 500);
  return String(value).slice(0, 500);
}
function tableResult(columns, rows, kind = 'table') {
  return { kind, columns: columns.slice(0, 40).map(String), rows: rows.slice(0, MAX_ROWS).map(row => columns.slice(0, 40).map(name => cell(row[name]))), limit: MAX_ROWS };
}
function identifier(name, quote = '"') { return quote + String(name).replaceAll(quote, quote + quote) + quote; }
function columnsSql(names) { return names.map(name => identifier(name)).join(', '); }
function listSqlite(root, item) {
  let file;
  try { file = within(root, item.data?.path); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('SQLite database file does not exist yet. Check data.path.'); throw error; }
  if (!fs.statSync(file).isFile()) throw new Error('SQLite path must point to an existing database file.');
  const db = new DatabaseSync(file, { readOnly: true, timeout: 3000 });
  try {
    const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 100").all();
    return { engine: 'sqlite', location: item.data.path, tables: tables.map(row => ({ id: row.name, name: row.name, type: row.type })) };
  } finally { db.close(); }
}
function previewSqlite(root, item, table) {
  const file = within(root, item.data?.path);
  const db = new DatabaseSync(file, { readOnly: true, timeout: 3000 });
  try {
    const found = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ? AND name NOT LIKE 'sqlite_%'").get(table);
    if (!found) throw new Error('Table is not available in this source.');
    const columns = db.prepare(`PRAGMA table_info(${identifier(table)})`).all().map(row => ({ name: row.name, type: row.type, nullable: !row.notnull, primaryKey: !!row.pk }));
    const rows = columns.length ? db.prepare(`SELECT ${columnsSql(columns.map(column => column.name))} FROM ${identifier(table)} LIMIT ${MAX_ROWS}`).all() : [];
    return { ...tableResult(columns.map(column => column.name), rows), fields: columns };
  } finally { db.close(); }
}
async function postgres(value, table) {
  if (!value) throw new Error('Set the PostgreSQL connection variable in Environment first.');
  const { Client } = require('pg');
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 4000, query_timeout: 5000, application_name: 'BuildSteer read-only viewer' });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL statement_timeout = 5000');
    const tables = (await client.query("SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name LIMIT $1", [MAX_TABLES])).rows
      .map(row => ({ id: `${row.table_schema}.${row.table_name}`, schema: row.table_schema, name: row.table_name, type: row.table_type === 'VIEW' ? 'view' : 'table' }));
    if (!table) return { engine: 'postgres', tables };
    const selected = tables.find(row => row.id === table);
    if (!selected) throw new Error('Table is not available in this source.');
    const fields = (await client.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position LIMIT 40', [selected.schema, selected.name])).rows
      .map(row => ({ name: row.column_name, type: row.data_type, nullable: row.is_nullable === 'YES' }));
    const rows = fields.length ? (await client.query(`SELECT ${columnsSql(fields.map(field => field.name))} FROM ${identifier(selected.schema)}.${identifier(selected.name)} LIMIT ${MAX_ROWS}`)).rows : [];
    return { ...tableResult(fields.map(field => field.name), rows), fields };
  } finally { if (connected) await client.query('ROLLBACK').catch(() => {}); await client.end().catch(() => {}); }
}
async function mysql(value, table) {
  if (!value) throw new Error('Set the MySQL/MariaDB connection variable in Environment first.');
  const driver = require('mysql2/promise');
  const client = await driver.createConnection(value);
  try {
    await client.query('START TRANSACTION READ ONLY');
    const [listed] = await client.query("SELECT TABLE_NAME AS name, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME LIMIT ?", [MAX_TABLES]);
    const tables = listed.map(row => ({ id: row.name, name: row.name, type: row.type === 'VIEW' ? 'view' : 'table' }));
    if (!table) return { engine: 'mysql', tables };
    const selected = tables.find(row => row.id === table);
    if (!selected) throw new Error('Table is not available in this source.');
    const [listedFields] = await client.query('SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION LIMIT 40', [selected.name]);
    const fields = listedFields.map(row => ({ name: row.name, type: row.type, nullable: row.nullable === 'YES' }));
    const [rows] = fields.length ? await client.query(`SELECT ${fields.map(field => client.escapeId(field.name)).join(', ')} FROM ${client.escapeId(selected.name)} LIMIT ${MAX_ROWS}`) : [[]];
    return { ...tableResult(fields.map(field => field.name), rows), fields };
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end().catch(() => {}); }
}
function listFiles(root, item) {
  let start;
  try { start = within(root, item.data?.path); }
  catch (error) { if (error.code === 'ENOENT') return { engine: 'files', location: item.data?.path, tables: [], message: 'Configured storage path does not exist yet.' }; throw error; }
  const entries = [];
  function walk(folder, depth) {
    if (depth > 3 || entries.length >= MAX_FILES) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entries.length >= MAX_FILES) break;
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      const relative = path.relative(fs.realpathSync(root), full).split(path.sep).join('/');
      if (entry.isDirectory()) { entries.push({ id: relative, name: relative, type: 'folder' }); walk(full, depth + 1); }
      else if (entry.isFile()) entries.push({ id: relative, name: relative, type: 'file', bytes: fs.statSync(full).size });
    }
  }
  if (fs.statSync(start).isDirectory()) walk(start, 0);
  else entries.push({ id: item.data.path, name: item.data.path, type: 'file', bytes: fs.statSync(start).size });
  return { engine: 'files', location: item.data.path, tables: entries, truncated: entries.length >= MAX_FILES };
}
function previewFile(root, item, relative) {
  const start = within(root, item.data?.path);
  const file = within(root, relative);
  if (file !== start && !file.startsWith(start + path.sep)) throw new Error('File is outside this data source.');
  if (!fs.statSync(file).isFile()) throw new Error('Choose a file to preview.');
  const ext = path.extname(file).toLowerCase();
  if (!['.json', '.jsonl', '.csv', '.txt', '.md', '.yaml', '.yml'].includes(ext)) return { kind: 'file', name: relative, text: 'Binary or unsupported file. Use Files or an external viewer.' };
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, PREVIEW_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return { kind: 'file', name: relative, text: buffer.toString('utf8'), truncated: size > length };
  } finally { fs.closeSync(fd); }
}
async function inspect(root, item, value) {
  switch (engine(item)) {
    case 'sqlite': return listSqlite(root, item);
    case 'postgres': return postgres(value);
    case 'mysql': return mysql(value);
    case 'files': return listFiles(root, item);
    default: return { engine: 'unsupported', tables: [], message: 'No built-in viewer for this source type. Configure PostgreSQL, MySQL/MariaDB, SQLite, or a local storage path.' };
  }
}
async function preview(root, item, value, table) {
  switch (engine(item)) {
    case 'sqlite': return previewSqlite(root, item, table);
    case 'postgres': return postgres(value, table);
    case 'mysql': return mysql(value, table);
    case 'files': return previewFile(root, item, table);
    default: throw new Error('No built-in preview for this source type.');
  }
}
module.exports = { engine, inspect, preview, within, identifier };
