/* Build one explicit request from the selected OpenAPI operation and edited fields. */
function apiRequestFromDraft(operation, draft) {
  const headers = JSON.parse(draft.headers);
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Headers must be a JSON object.');
  let [pathname, query = ''] = draft.path.split('?', 2);
  const search = new URLSearchParams(query);
  for (const parameter of operation?.parameters || []) {
    if (parameter.in === 'cookie') continue;
    const value = draft.params[`${parameter.in}:${parameter.name}`] || '';
    if (!value) { if (parameter.required) throw new Error(`${parameter.name} is required.`); continue; }
    if (parameter.in === 'path') {
      pathname = pathname.replace(`{${parameter.name}}`, encodeURIComponent(value));
    } else if (parameter.in === 'query') {
      search.delete(parameter.name);
      const values = parameter.schema?.type === 'array' && parameter.explode !== false ? value.split(',').map(part => part.trim()) : [value];
      for (const part of values) search.append(parameter.name, part);
    } else if (parameter.in === 'header') headers[parameter.name] = value;
  }
  if (/\{[^}]+\}/.test(pathname)) throw new Error('Fill in every path placeholder before sending.');
  if (draft.body && draft.contentType) {
    if (draft.contentType === 'multipart/form-data') throw new Error('Multipart uploads are documented but not supported by this request composer.');
    headers['Content-Type'] = draft.contentType;
    if (/\bjson\b|\+json/i.test(draft.contentType)) JSON.parse(draft.body);
  }
  return { method: draft.method, path: pathname + (search.size ? `?${search}` : ''), headers, body: draft.body };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { apiRequestFromDraft };
