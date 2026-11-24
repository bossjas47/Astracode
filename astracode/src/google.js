// ---------- เชื่อม Google (Gmail / Drive / Sheets / Calendar) แบบปุ่มเดียว ----------
// ลูกค้ากดยินยอมกับ Google ครั้งเดียว → เก็บ refresh token แบบเข้ารหัส → เพิ่มแถว mcp_servers (url astra://google) ให้อัตโนมัติ
// เครื่องมือเลยใช้ได้ทุกที่ที่ใช้ Remote MCP อยู่แล้ว: แชตเว็บ, โหมด Code, Agent ในแอป Desktop/CLI/คลาวด์ (ผ่าน /v1/mcp/*) · token ไม่ออกจากเซิร์ฟเวอร์
import { err, json, rand, same } from './core.js';
import { getSettings } from './billing.js';
import { seal, unseal } from './projects.js';

export const GOOGLE_URL = 'astra://google';
const SCOPES = 'openid email https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify';
const S = d => ({ type: 'string', description: d }), O = (props, req = []) => ({ type: 'object', properties: props, required: req });
const ROWS = { type: 'array', description: 'Rows, each an array of cell values', items: { type: 'array', items: {} } };
export const GOOGLE_TOOLS = [
  { name: 'drive_search', description: 'Search Google Drive files by name or text. Returns id, name, type, modified time, link.', inputSchema: O({ query: S('Words to find'), max: { type: 'number' } }, ['query']) },
  { name: 'drive_read', description: 'Read a Drive file as text (Google Docs as text, Sheets as CSV, Slides as text, other text files as-is).', inputSchema: O({ file_id: S('File id from drive_search') }, ['file_id']) },
  { name: 'drive_create_doc', description: 'Create a new Google Doc from plain text or simple HTML. Returns its link.', inputSchema: O({ name: S('Document title'), content: S('Text or HTML body'), html: { type: 'boolean' } }, ['name', 'content']) },
  { name: 'sheets_read', description: 'Read cell values from a Google Sheet range, e.g. Sheet1!A1:F50.', inputSchema: O({ spreadsheet_id: S('Spreadsheet id'), range: S('A1 range') }, ['spreadsheet_id', 'range']) },
  { name: 'sheets_write', description: 'Overwrite a range with rows, or append rows after the last row with append=true. Values starting with = are formulas.', inputSchema: O({ spreadsheet_id: S('Spreadsheet id'), range: S('A1 range, e.g. Sheet1!A1'), rows: ROWS, append: { type: 'boolean' } }, ['spreadsheet_id', 'range', 'rows']) },
  { name: 'sheets_create', description: 'Create a new Google Sheet, optionally filled with rows (first row = header). Returns id and link.', inputSchema: O({ title: S('Title'), rows: ROWS }, ['title']) },
  { name: 'calendar_list', description: 'List events in the primary Google Calendar between two times (ISO 8601). Defaults to the next 7 days.', inputSchema: O({ time_min: S('ISO start'), time_max: S('ISO end'), query: S('Text filter') }) },
  { name: 'calendar_create', description: 'Create an event in the primary Google Calendar. Times are ISO 8601 with offset, e.g. 2026-11-20T14:00:00+07:00.', inputSchema: O({ summary: S('Title'), start: S('ISO start'), end: S('ISO end'), description: S('Details'), location: S('Place'), attendees: { type: 'array', items: { type: 'string' }, description: 'Guest emails' } }, ['summary', 'start', 'end']) },
  { name: 'drive_save_file', description: 'Save a file from the user\'s Kyber account (file_id from create_file / list_account_files) to their Google Drive: spreadsheets become a Google Sheet (all sheets, formulas kept), documents and slides a Google Doc. Returns the link; put it in an email with gmail_draft to share it.', inputSchema: O({ file_id: { type: 'number' } }, ['file_id']) },
  { name: 'drive_upload_file', description: 'Upload a real file (base64) to Google Drive. Kyber Harness agents should use their save_to_drive tool instead, which reads the file for you.', inputSchema: O({ name: S('File name'), b64: S('Base64 content'), mime: S('MIME type'), convert: { type: 'boolean', description: 'Convert Office files to Google Docs/Sheets/Slides' }, folder_id: S('Optional Drive folder id') }, ['name', 'b64']) },
  { name: 'gmail_search', description: 'Search Gmail with Gmail query syntax (e.g. "from:bank newer_than:7d"). Returns id, from, subject, date, snippet.', inputSchema: O({ query: S('Gmail search query'), max: { type: 'number' } }, ['query']) },
  { name: 'gmail_read', description: 'Read one email as plain text.', inputSchema: O({ id: S('Message id from gmail_search') }, ['id']) },
  { name: 'gmail_draft', description: 'Create a Gmail draft (not sent). Prefer this unless the user clearly asked to send.', inputSchema: O({ to: S('Recipient emails, comma separated'), subject: S('Subject'), body: S('Plain text body') }, ['to', 'subject', 'body']) },
  { name: 'gmail_send', description: 'Send an email now from the user\'s Gmail. Only when the user explicitly asked to send.', inputSchema: O({ to: S('Recipient emails, comma separated'), subject: S('Subject'), body: S('Plain text body') }, ['to', 'subject', 'body']) },
];

const ensure = env => env.DB.prepare('CREATE TABLE IF NOT EXISTS google_links (user_id INTEGER PRIMARY KEY, email TEXT, refresh_enc TEXT NOT NULL, access TEXT, access_exp INTEGER, created_at INTEGER)').run();
async function client(env) { const g = await getSettings(env, ['google_client_id', 'google_client_secret']); return { id: env.GOOGLE_CLIENT_ID || g.google_client_id, secret: env.GOOGLE_CLIENT_SECRET || g.google_client_secret }; }

// เริ่มเชื่อม: ใช้ redirect URI เดิมของปุ่มล็อกอิน Google (ไม่ต้องลงทะเบียน URI ใหม่) แยกด้วยคุกกี้ gconn
export async function googleConnectStart(env, base, u, popup = false) {
  const c = await client(env); if (!c.id) return err('ยังไม่ได้ตั้งค่า Google Client ID', 404);
  const state = rand(16);
  const q = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: `${base}/api/oauth/google/callback`, scope: SCOPES, state, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' });
  return new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, 'set-cookie': `gconn=${state}.${u.id}${popup ? '.p' : ''}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
}
// เรียกจาก /api/oauth/google/callback เมื่อมีคุกกี้ gconn (ไม่ใช่การล็อกอิน) · ต้องเป็นผู้ใช้คนเดิมที่ล็อกอินอยู่
export async function googleConnectFinish(req, env, url, base, me) {
  const [state, uid, pop] = ((req.headers.get('cookie') || '').match(/(?:^|;\s*)gconn=([\w.]+)/)?.[1] || '').split('.'), del = 'gconn=; Path=/api/oauth; Max-Age=0';
  const back = m => pop ? Response.redirect(`${base}/connected?ok=0&error=${encodeURIComponent(m)}`, 302) : Response.redirect(`${base}/chat?google=${encodeURIComponent(m)}`, 302); // เปิดจากตั้งค่า → Connectors (ป๊อปอัป) ปิดหน้าต่างเอง
  if (!state || !same(state, url.searchParams.get('state') || '') || !me || me.id !== +uid) return back('หมดเวลา ลองใหม่อีกครั้ง');
  if (url.searchParams.get('error')) return back('ยกเลิกการเชื่อมต่อ');
  const c = await client(env);
  const tk = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: `${base}/api/oauth/google/callback`, client_id: c.id, client_secret: c.secret || '' }) })).json().catch(() => ({}));
  if (!tk.refresh_token) return back('Google ไม่ส่งสิทธิ์ใช้งานต่อเนื่องมา ลองใหม่อีกครั้ง');
  let email = ''; try { email = JSON.parse(atob(tk.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch { /* ไม่มีอีเมล */ }
  await ensure(env);
  await env.DB.prepare('INSERT OR REPLACE INTO google_links (user_id,email,refresh_enc,access,access_exp,created_at) VALUES (?,?,?,?,?,?)').bind(me.id, email, await seal(env, tk.refresh_token), tk.access_token || null, Date.now() + ((tk.expires_in || 3000) - 60) * 1000, Date.now()).run();
  const old = await env.DB.prepare('SELECT id FROM mcp_servers WHERE user_id=? AND url=?').bind(me.id, GOOGLE_URL).first();
  const id = old ? (await env.DB.prepare('UPDATE mcp_servers SET tools_json=?, enabled=1, name=? WHERE id=? RETURNING id').bind(JSON.stringify(GOOGLE_TOOLS), 'Google' + (email ? ' · ' + email : ''), old.id).first()).id
    : (await env.DB.prepare('INSERT INTO mcp_servers (user_id,name,url,token_enc,tools_json,enabled,created_at) VALUES (?,?,?,?,?,1,?) RETURNING id').bind(me.id, 'Google' + (email ? ' · ' + email : ''), GOOGLE_URL, await seal(env, String(me.id)), JSON.stringify(GOOGLE_TOOLS), Date.now()).first()).id;
  return new Response(null, { status: 302, headers: { location: pop ? `${base}/connected?ok=1&id=${id}` : `${base}/chat?google=ok&mcp_on=${id}`, 'set-cookie': del } });
}
export async function googleStatus(env, u) { await ensure(env); const r = await env.DB.prepare('SELECT email, created_at FROM google_links WHERE user_id=?').bind(u.id).first(); return json({ connected: !!r, email: r?.email || null, enabled: !!(await client(env)).id }); }
export async function googleDisconnect(env, u) {
  await ensure(env); const r = await env.DB.prepare('SELECT refresh_enc FROM google_links WHERE user_id=?').bind(u.id).first();
  if (r) { const t = await unseal(env, r.refresh_enc).catch(() => null); if (t) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {}); } // ถอนสิทธิ์ฝั่ง Google ด้วย
  await env.DB.batch([env.DB.prepare('DELETE FROM google_links WHERE user_id=?').bind(u.id), env.DB.prepare('DELETE FROM mcp_servers WHERE user_id=? AND url=?').bind(u.id, GOOGLE_URL)]);
  return json({ ok: true });
}

async function accessToken(env, uid) {
  await ensure(env);
  const r = await env.DB.prepare('SELECT * FROM google_links WHERE user_id=?').bind(uid).first(); if (!r) throw new Error('ยังไม่ได้เชื่อม Google หรือยกเลิกไปแล้ว: เชื่อมใหม่ที่เมนู MCP');
  if (r.access && r.access_exp > Date.now()) return r.access;
  const c = await client(env), rt = await unseal(env, r.refresh_enc);
  const tk = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: c.id, client_secret: c.secret || '' }) })).json().catch(() => ({}));
  if (!tk.access_token) throw new Error('สิทธิ์ Google หมดอายุหรือถูกถอน: เชื่อม Google ใหม่ที่เมนู MCP');
  await env.DB.prepare('UPDATE google_links SET access=?, access_exp=? WHERE user_id=?').bind(tk.access_token, Date.now() + ((tk.expires_in || 3000) - 60) * 1000, uid).run();
  return tk.access_token;
}
const b64url = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// อีเมลแนบไฟล์จริง (multipart/mixed) · att = [{ name, b64, mime }] รวมไม่เกิน ~18MB
const mimeAtt = (to, subject, body, att) => { const bd = 'astra' + rand(10), enc = s => '=?UTF-8?B?' + btoa(String.fromCharCode(...new TextEncoder().encode(String(s).replace(/[\r\n]/g, ' ')))) + '?=', wrap = s => String(s).replace(/(.{76})/g, '$1\r\n');
  const parts = [`--${bd}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(btoa(String.fromCharCode(...new TextEncoder().encode(String(body || '')))))}`,
    ...att.map(f => `--${bd}\r\nContent-Type: ${String(f.mime || 'application/octet-stream').replace(/[\r\n;]/g, '')}; name="${enc(f.name)}"\r\nContent-Disposition: attachment; filename="${enc(f.name)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(String(f.b64).replace(/[^A-Za-z0-9+/=]/g, ''))}`)];
  return b64url(`To: ${String(to).replace(/[\r\n]/g, '')}\r\nSubject: ${enc(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${bd}"\r\n\r\n${parts.join('\r\n')}\r\n--${bd}--`); };
const atts = a => (Array.isArray(a.attachments) ? a.attachments : []).slice(0, 10).filter(f => f && f.name && f.b64);
const mime = (to, subject, body) => b64url(`To: ${String(to).replace(/[\r\n]/g, '')}\r\nSubject: =?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(String(subject).replace(/[\r\n]/g, ' '))))}?=\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`);
const unb64url = s => { try { return new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); } catch { return ''; } };
function mailText(p) { // หาส่วน text/plain ก่อน ไม่มีค่อยใช้ html แบบตัดแท็ก
  const parts = [], walk = x => { if (!x) return; parts.push(x); (x.parts || []).forEach(walk); }; walk(p);
  const t = parts.find(x => x.mimeType === 'text/plain' && x.body?.data), h = parts.find(x => x.mimeType === 'text/html' && x.body?.data);
  return t ? unb64url(t.body.data) : h ? unb64url(h.body.data).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ') : '';
}

// เรียกเครื่องมือ (mcpCall ส่งมาเมื่อ url = astra://google) · uid มาจาก token ที่ผนึกไว้ตอนสร้างแถว ไม่ได้มาจากโมเดล
// Markdown → HTML ง่าย ๆ สำหรับ Google Docs (หัวข้อ, รายการ, ตาราง, ตัวหนา)
const hesc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]), inl = s => hesc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
export function mdHtml(md) {
  const L = String(md).replace(/\r/g, '').split('\n'), o = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i], h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { o.push(`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { const rows = []; while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(L[i])) rows.push(L[i].trim().replace(/^\||\|$/g, '').split('|')); i++; } i--; o.push('<table border="1" style="border-collapse:collapse">' + rows.map((r, k) => '<tr>' + r.map(c => `<${k ? 'td' : 'th'}>${inl(c.trim())}</${k ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'); continue; }
    if (/^\s*[-*•]\s+/.test(l)) { const it = []; while (i < L.length && /^\s*[-*•]\s+/.test(L[i])) it.push(L[i++].replace(/^\s*[-*•]\s+/, '')); i--; o.push('<ul>' + it.map(x => `<li>${inl(x)}</li>`).join('') + '</ul>'); continue; }
    if (l.trim()) o.push(`<p>${inl(l.replace(/^>\s?/, ''))}</p>`);
  }
  return '<html><body>' + o.join('\n') + '</body></html>';
}
export async function googleCall(env, uid, name, a = {}) {
  const tok = await accessToken(env, +uid);
  const g = async (u, init = {}) => { const r = await fetch(u, { ...init, headers: { authorization: 'Bearer ' + tok, ...(init.body && typeof init.body === 'string' && !init.headers?.['content-type'] ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`Google ${r.status}: ${t.slice(0, 300)}`); return init.raw ? t : t ? JSON.parse(t) : {}; };
  const max = n => Math.min(50, Math.max(1, +n || 10)), q = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const vals = rows => (Array.isArray(rows) ? rows : []).slice(0, 5000).map(r => (Array.isArray(r) ? r : [r]).map(v => v ?? ''));
  switch (name) {
    case 'drive_search': { const d = await g('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q: `(name contains '${q(a.query)}' or fullText contains '${q(a.query)}') and trashed=false`, pageSize: max(a.max), fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc' })); return JSON.stringify(d.files || []); }
    case 'drive_read': {
      const f = await g(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(a.file_id)}?fields=name,mimeType,size`);
      const ex = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' }[f.mimeType];
      if (!ex && !/^(text\/|application\/(json|xml|javascript))/.test(f.mimeType)) return `ไฟล์ ${f.name} เป็น ${f.mimeType} อ่านเป็นข้อความไม่ได้`;
      if (!ex && +f.size > 500000) return `ไฟล์ ${f.name} ใหญ่เกิน 500KB`;
      return `# ${f.name}\n` + (await g(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(a.file_id)}${ex ? '/export?mimeType=' + encodeURIComponent(ex) : '?alt=media'}`, { raw: true })).slice(0, 100000);
    }
    case 'drive_create_doc': {
      const bd = 'astra' + rand(8), meta = JSON.stringify({ name: String(a.name || 'เอกสาร').slice(0, 200), mimeType: 'application/vnd.google-apps.document' });
      const d = await g('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${bd}` }, body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bd}\r\nContent-Type: ${a.html ? 'text/html' : 'text/plain'}; charset=UTF-8\r\n\r\n${String(a.content || '')}\r\n--${bd}--` });
      return JSON.stringify(d);
    }
    case 'drive_save_file': { // ไฟล์ในบัญชี → Google Sheet (ทุกชีต เก็บสูตร) / Google Doc
      const f = await env.DB.prepare('SELECT name, kind, data FROM user_files WHERE id=? AND user_id=?').bind(+a.file_id || 0, +uid).first(); if (!f) return 'Error: no file with that file_id in this account';
      const data = JSON.parse(f.data), title = f.name.replace(/\.\w+$/, '');
      if (f.kind === 'sheet') {
        const d = await g('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title }, sheets: data.sheets.map(s => ({ properties: { title: s.name, gridProperties: { frozenRowCount: s.header !== false ? 1 : 0 } } })) }) });
        if (data.sheets.some(s => s.rows.length)) await g(`https://sheets.googleapis.com/v4/spreadsheets/${d.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: data.sheets.filter(s => s.rows.length).map(s => ({ range: `'${s.name.replace(/'/g, "''")}'!A1`, values: vals(s.rows) })) }) });
        return JSON.stringify({ id: d.spreadsheetId, link: d.spreadsheetUrl, type: 'Google Sheet' });
      }
      return googleCall(env, uid, 'drive_create_doc', { name: title, content: mdHtml(data.md || ''), html: true });
    }
    case 'drive_upload_file': { // ไฟล์จริง (xlsx/docx/pdf/png ...) ขึ้น Drive · convert=true แปลงเป็น Google Docs/Sheets/Slides
      const name = String(a.name || 'file').slice(0, 200), type = String(a.mime || 'application/octet-stream').replace(/[\r\n;]/g, ''), bd = 'astra' + rand(8);
      const conv = a.convert ? { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.google-apps.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'application/vnd.google-apps.spreadsheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'application/vnd.google-apps.presentation' }[type] : null;
      const meta = JSON.stringify({ name: conv ? name.replace(/\.\w+$/, '') : name, ...(conv ? { mimeType: conv } : {}), ...(a.folder_id ? { parents: [String(a.folder_id)] } : {}) });
      const d = await g('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${bd}` }, body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bd}\r\nContent-Type: ${type}\r\nContent-Transfer-Encoding: base64\r\n\r\n${String(a.b64 || '').replace(/[^A-Za-z0-9+/=]/g, '')}\r\n--${bd}--` });
      return JSON.stringify(d);
    }
    case 'sheets_read': { const d = await g(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(a.spreadsheet_id)}/values/${encodeURIComponent(a.range)}`); return JSON.stringify(d.values || []).slice(0, 100000); }
    case 'sheets_write': {
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(a.spreadsheet_id)}/values/${encodeURIComponent(a.range)}`;
      const d = await g(a.append ? base + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS' : base + '?valueInputOption=USER_ENTERED', { method: a.append ? 'POST' : 'PUT', body: JSON.stringify({ values: vals(a.rows) }) });
      return JSON.stringify(d.updates || d);
    }
    case 'sheets_create': {
      const d = await g('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title: String(a.title || 'ตาราง').slice(0, 200) } }) });
      if (a.rows?.length) await g(`https://sheets.googleapis.com/v4/spreadsheets/${d.spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: vals(a.rows) }) });
      return JSON.stringify({ id: d.spreadsheetId, link: d.spreadsheetUrl });
    }
    case 'calendar_list': {
      const now = Date.now(), d = await g('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams({ timeMin: a.time_min || new Date(now).toISOString(), timeMax: a.time_max || new Date(now + 7 * 864e5).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50', ...(a.query ? { q: a.query } : {}) }));
      return JSON.stringify((d.items || []).map(e => ({ id: e.id, summary: e.summary, start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, location: e.location, link: e.htmlLink })));
    }
    case 'calendar_create': {
      const d = await g('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify({ summary: a.summary, description: a.description, location: a.location, start: { dateTime: a.start }, end: { dateTime: a.end }, attendees: (a.attendees || []).slice(0, 50).map(email => ({ email })) }) });
      return JSON.stringify({ id: d.id, link: d.htmlLink });
    }
    case 'gmail_search': {
      const l = await g('https://gmail.googleapis.com/gmail/v1/users/me/messages?' + new URLSearchParams({ q: String(a.query || ''), maxResults: String(max(a.max)) }));
      const out = await Promise.all((l.messages || []).map(async m => { const d = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`); const h = n => d.payload?.headers?.find(x => x.name === n)?.value; return { id: m.id, from: h('From'), subject: h('Subject'), date: h('Date'), snippet: d.snippet }; }));
      return JSON.stringify(out);
    }
    case 'gmail_read': { const d = await g(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(a.id)}?format=full`); const h = n => d.payload?.headers?.find(x => x.name === n)?.value || ''; return `From: ${h('From')}\nTo: ${h('To')}\nDate: ${h('Date')}\nSubject: ${h('Subject')}\n\n${mailText(d.payload).slice(0, 60000)}`; }
    case 'gmail_draft': { const at = atts(a), d = await g('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', body: JSON.stringify({ message: { raw: at.length ? mimeAtt(a.to, a.subject, a.body, at) : mime(a.to, a.subject, a.body) } }) }); return 'สร้างฉบับร่างแล้ว id ' + d.id + ' (ยังไม่ได้ส่ง เปิดดูใน Gmail > ฉบับร่าง)'; }
    case 'gmail_send': { const at = atts(a), d = await g('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: at.length ? mimeAtt(a.to, a.subject, a.body, at) : mime(a.to, a.subject, a.body) }) }); return 'ส่งแล้ว id ' + d.id; }
    default: return 'ไม่พบเครื่องมือ ' + name;
  }
}
