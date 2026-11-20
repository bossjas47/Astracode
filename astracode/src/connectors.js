// ---------- Connectors: สารบบบริการที่เชื่อมได้ (แอดมินจัดการ) + การเชื่อมของผู้ใช้ (แถว mcp_servers) ----------
// แบบ Claude: กดเชื่อม → ป๊อปอัปล็อกอินกับผู้ให้บริการ (MCP OAuth: ค้นหา auth server เอง ลงทะเบียนแอปอัตโนมัติ PKCE) → ใช้ได้ทุกแชต
// token เก็บแบบเข้ารหัส (seal) และต่ออายุเองก่อนหมด / เมื่อเซิร์ฟเวอร์ตอบ 401
import { err, json, rand, same, userErr } from './core.js';
import { seal, unseal } from './projects.js';
import { isSafeMcpUrl, mcpSync, mcpCall, READ_NAME } from './ai.js';
import { GOOGLE_URL } from './google.js';
import { getSettings, origin } from './billing.js';

// สารบบเริ่มต้น (แอดมินแก้/เพิ่ม/ปิดได้ในหลังบ้าน) · auth: oauth = ล็อกอินในป๊อปอัป, none = ใช้ได้เลย, token = วาง API key, url = วาง URL ส่วนตัว, google / github = ระบบเดิมของเว็บ
// icon: สีแบรนด์ (#hex) แสดงเป็นตัวอักษรบนพื้นสี หรือ data:image/... (อัปโหลดโลโก้ในหลังบ้าน)
export const DEFAULT_CONNECTORS = [
  ['google', 'Google', 'Gmail, Drive, Sheets และปฏิทิน: ค้น อ่าน สรุปอีเมลและไฟล์ ร่างอีเมล สร้างชีตและนัดหมาย', GOOGLE_URL, 'google', 'งานเอกสาร', 'Google', '#4285F4'],
  ['github', 'GitHub', 'อ่าน repo, issue และ pull request ค้นโค้ด และเปิด issue ให้ (ใช้ token GitHub เดียวกับโหมด Code)', 'https://api.githubcopilot.com/mcp/', 'github', 'นักพัฒนา', 'GitHub', '#181717'],
  ['notion', 'Notion', 'ค้นและอ่านหน้า Notion สร้าง/แก้หน้าและฐานข้อมูลในพื้นที่ทำงานของคุณ', 'https://mcp.notion.com/mcp', 'oauth', 'งานเอกสาร', 'Notion', '#000000'],
  ['linear', 'Linear', 'ดู สร้าง และอัปเดต issue, project และ cycle ใน Linear', 'https://mcp.linear.app/mcp', 'oauth', 'จัดการงาน', 'Linear', '#5E6AD2'],
  ['atlassian', 'Atlassian', 'Jira และ Confluence: ค้น issue สรุปหน้า สร้างและอัปเดตงาน', 'https://mcp.atlassian.com/v1/mcp', 'oauth', 'จัดการงาน', 'Atlassian', '#0052CC'],
  ['canva', 'Canva', 'ค้นหาและสร้างงานออกแบบ ส่งออกเป็นไฟล์จาก Canva ของคุณ', 'https://mcp.canva.com/mcp', 'oauth', 'ออกแบบ', 'Canva', '#00C4CC'],
  ['sentry', 'Sentry', 'ดู error และ issue ล่าสุดของโปรเจกต์ พร้อมรายละเอียดให้ AI ช่วยแก้', 'https://mcp.sentry.dev/mcp', 'oauth', 'นักพัฒนา', 'Sentry', '#362D59'],
  ['vercel', 'Vercel', 'ดูโปรเจกต์ deployment และ log ใน Vercel', 'https://mcp.vercel.com', 'oauth', 'นักพัฒนา', 'Vercel', '#000000'],
  ['supabase', 'Supabase', 'ดูตาราง รัน SQL และจัดการโปรเจกต์ Supabase', 'https://mcp.supabase.com/mcp', 'oauth', 'นักพัฒนา', 'Supabase', '#3ECF8E'],
  ['stripe', 'Stripe', 'ดูลูกค้า การชำระเงิน และสร้างลิงก์ชำระเงินใน Stripe', 'https://mcp.stripe.com', 'oauth', 'การเงิน', 'Stripe', '#635BFF'],
  ['huggingface', 'Hugging Face', 'ค้นโมเดล dataset และ Space บน Hugging Face', 'https://huggingface.co/mcp', 'oauth', 'นักพัฒนา', 'Hugging Face', '#FFD21E'],
  ['context7', 'Context7', 'เอกสารไลบรารีเวอร์ชันล่าสุด (React, Next.js, Tailwind ฯลฯ) ไม่ต้องล็อกอิน', 'https://mcp.context7.com/mcp', 'none', 'นักพัฒนา', 'Upstash', '#059669'],
  ['deepwiki', 'DeepWiki', 'ถามเรื่องโค้ดใน repo GitHub สาธารณะ ได้คำอธิบายพร้อมอ้างอิง ไม่ต้องล็อกอิน', 'https://mcp.deepwiki.com/mcp', 'none', 'นักพัฒนา', 'Cognition', '#0EA5E9'],
  ['cloudflare-docs', 'Cloudflare Docs', 'ค้นเอกสาร Cloudflare (Workers, D1, R2 ฯลฯ) ไม่ต้องล็อกอิน', 'https://docs.mcp.cloudflare.com/mcp', 'none', 'นักพัฒนา', 'Cloudflare', '#F38020'],
  ['microsoft-learn', 'Microsoft Learn', 'ค้นเอกสาร Microsoft, Azure และ .NET ไม่ต้องล็อกอิน', 'https://learn.microsoft.com/api/mcp', 'none', 'นักพัฒนา', 'Microsoft', '#0078D4'],
  ['zapier', 'Zapier', 'ต่อแอปอื่นอีกหลายพันแอป (LINE, Slack, HubSpot ฯลฯ) วาง URL MCP ส่วนตัวจาก zapier.com/mcp', '', 'url', 'อื่นๆ', 'Zapier', '#FF4F00'],
];
export const MAX_CONN = 25, MAX_TOOLS = 60;
let ready = null;
export const ensureConnectors = env => ready ||= (async () => {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS connectors (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT, url TEXT, auth TEXT NOT NULL DEFAULT \'oauth\', category TEXT, by_name TEXT, icon TEXT, client_id TEXT, client_secret_enc TEXT, scope TEXT, sort INTEGER NOT NULL DEFAULT 100, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS oauth_clients (issuer TEXT NOT NULL, redirect TEXT NOT NULL, client_id TEXT NOT NULL, client_secret_enc TEXT, created_at INTEGER, PRIMARY KEY (issuer, redirect))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS oauth_pending (state TEXT PRIMARY KEY, user_id INTEGER NOT NULL, data_enc TEXT NOT NULL, created_at INTEGER NOT NULL)'),
  ]);
  const n = (await env.DB.prepare('SELECT COUNT(*) n FROM connectors').first()).n;
  if (!n) await env.DB.batch(DEFAULT_CONNECTORS.map(([slug, name, d, url, auth, cat, by, icon], i) => env.DB.prepare('INSERT OR IGNORE INTO connectors (slug,name,description,url,auth,category,by_name,icon,sort,enabled,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)').bind(slug, name, d, url, auth, cat, by, icon, (i + 1) * 10, Date.now())));
})().catch(e => { ready = null; throw e; });

// ---------- token ของการเชื่อม: OAuth (ต่ออายุเอง) หรือ token ที่วางไว้ ----------
const form = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== ''));
async function tokenReq(endpoint, params, secret) {
  if (!isSafeMcpUrl(endpoint)) throw userErr('ที่อยู่ขอ token ไม่ปลอดภัย');
  const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form({ ...params, client_secret: secret || undefined }), redirect: 'error', signal: AbortSignal.timeout(12000) });
  const txt = await r.text(); let d; try { d = JSON.parse(txt); } catch { d = Object.fromEntries(new URLSearchParams(txt)); } // บางเจ้า (เช่น GitHub) ตอบเป็น form
  if (!r.ok || !d.access_token) throw Object.assign(userErr(d.error_description || d.error || `ขอ token ไม่สำเร็จ (HTTP ${r.status})`, 502), { grant: d.error });
  return d;
}
const saveOauth = async (env, id, o) => env.DB.prepare('UPDATE mcp_servers SET oauth_enc=?, last_error=NULL WHERE id=?').bind(await seal(env, JSON.stringify(o)), id).run();
// คืน bearer token ที่ใช้ได้ตอนนี้ · force = ต่ออายุแม้ยังไม่หมด (เซิร์ฟเวอร์ตอบ 401)
export async function connToken(env, sv, force = false) {
  if (sv.oauth_enc) {
    const o = JSON.parse(await unseal(env, sv.oauth_enc));
    if (!force && o.access && (!o.exp || o.exp > Date.now() + 60e3)) return o.access;
    if (!o.refresh) { await env.DB.prepare("UPDATE mcp_servers SET last_error='ต้องเชื่อมต่อใหม่' WHERE id=?").bind(sv.id).run(); throw userErr('การเชื่อมต่อหมดอายุ เปิดตั้งค่า → Connectors แล้วกดเชื่อมใหม่', 401); }
    try {
      const d = await tokenReq(o.token_endpoint, { grant_type: 'refresh_token', refresh_token: o.refresh, client_id: o.client_id, resource: o.resource }, o.secret);
      Object.assign(o, { access: d.access_token, refresh: d.refresh_token || o.refresh, exp: d.expires_in ? Date.now() + d.expires_in * 1000 : null });
      await saveOauth(env, sv.id, o); return o.access;
    } catch (e) {
      await env.DB.prepare("UPDATE mcp_servers SET last_error='ต้องเชื่อมต่อใหม่' WHERE id=?").bind(sv.id).run();
      throw userErr('การเชื่อมต่อหมดอายุ เปิดตั้งค่า → Connectors แล้วกดเชื่อมใหม่ (' + e.message + ')', 401);
    }
  }
  return sv.token_enc ? await unseal(env, sv.token_enc).catch(() => null) : null;
}
// เรียกเครื่องมือ: token หมดอายุกลางทาง (401) → ต่ออายุแล้วลองอีกครั้งเดียว
export async function connCall(env, sv, name, args) {
  let tok = await connToken(env, sv);
  try { return await mcpCall(sv.url, tok, name, args, env); }
  catch (e) {
    if (!(e.http === 401 && sv.oauth_enc)) throw e;
    const fresh = await env.DB.prepare('SELECT * FROM mcp_servers WHERE id=?').bind(sv.id).first();
    tok = await connToken(env, fresh, true); return await mcpCall(sv.url, tok, name, args, env);
  }
}
const connSync = async (env, sv) => mcpSync(sv.url, await connToken(env, sv));

// ---------- ค้นหา OAuth ของ MCP server (MCP Authorization spec) ----------
const getJson = async u => { if (!isSafeMcpUrl(u)) return null; const r = await fetch(u, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) }).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };
const wellKnown = (base, name) => { const u = new URL(base), p = u.pathname.replace(/\/$/, ''); return [...(p ? [`${u.origin}/.well-known/${name}${p}`] : []), `${u.origin}/.well-known/${name}`]; };
export async function discover(url) {
  // 1) ถามเซิร์ฟเวอร์ตรงๆ: 401 + WWW-Authenticate บอกที่อยู่ข้อมูล protected resource
  let meta = null, hint = null;
  const probe = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'AstraCode', version: '1.0.0' } } }), redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (probe && probe.ok) return { open: true }; // ไม่ต้องล็อกอิน
  const wa = probe?.headers.get('www-authenticate') || '';
  hint = wa.match(/resource_metadata="([^"]+)"/i)?.[1] || null;
  for (const u of [hint, ...wellKnown(url, 'oauth-protected-resource')].filter(Boolean)) if ((meta = await getJson(u))) break;
  const issuer = meta?.authorization_servers?.[0] || new URL(url).origin; // spec เก่า (2025-03-26): auth server อยู่ที่ origin เดียวกับ MCP
  let as = null;
  for (const u of [...wellKnown(issuer, 'oauth-authorization-server'), ...wellKnown(issuer, 'openid-configuration')]) if ((as = await getJson(u))) break;
  if (!as) { const o = new URL(issuer).origin; as = { issuer: o, authorization_endpoint: o + '/authorize', token_endpoint: o + '/token', registration_endpoint: o + '/register', guessed: true }; }
  if (!as.authorization_endpoint || !as.token_endpoint) throw userErr('ผู้ให้บริการนี้ไม่ได้บอกวิธีล็อกอิน (OAuth) ไว้ ลองวาง token แทน');
  for (const k of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) if (as[k] && !isSafeMcpUrl(as[k])) throw userErr('ที่อยู่ล็อกอินของผู้ให้บริการไม่ปลอดภัย');
  return { resource: meta?.resource || url, issuer: as.issuer || issuer, as, scope: (meta?.scopes_supported || []).join(' ') || '' };
}
// ลงทะเบียนแอปกับ auth server ครั้งเดียวต่อผู้ให้บริการ (Dynamic Client Registration) แล้วใช้ซ้ำทุกผู้ใช้
async function clientFor(env, d, redirect, conn) {
  if (conn?.client_id) return { id: conn.client_id, secret: conn.client_secret_enc ? await unseal(env, conn.client_secret_enc) : null };
  const key = d.issuer || d.as.token_endpoint, hit = await env.DB.prepare('SELECT * FROM oauth_clients WHERE issuer=? AND redirect=?').bind(key, redirect).first();
  if (hit) return { id: hit.client_id, secret: hit.client_secret_enc ? await unseal(env, hit.client_secret_enc) : null };
  if (!d.as.registration_endpoint) throw userErr('ผู้ให้บริการนี้ไม่เปิดให้แอปลงทะเบียนเอง ให้แอดมินใส่ Client ID ในหลังบ้าน หรือวาง token แทน');
  const r = await fetch(d.as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ client_name: 'AstraCode', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', client_uri: new URL(redirect).origin }), redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => null);
  const c = r?.ok ? await r.json().catch(() => null) : null;
  if (!c?.client_id) throw userErr(`ลงทะเบียนแอปกับผู้ให้บริการไม่สำเร็จ${r ? ` (HTTP ${r.status})` : ''} ลองใหม่ภายหลัง หรือวาง token แทน`, 502);
  await env.DB.prepare('INSERT OR REPLACE INTO oauth_clients (issuer,redirect,client_id,client_secret_enc,created_at) VALUES (?,?,?,?,?)').bind(key, redirect, c.client_id, c.client_secret ? await seal(env, c.client_secret) : null, Date.now()).run();
  return { id: c.client_id, secret: c.client_secret || null };
}
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- แถวการเชื่อมของผู้ใช้ ----------
const parseTools = sv => { try { return JSON.parse(sv.tools_json || '[]'); } catch { return []; } };
const parsePerms = sv => { try { return JSON.parse(sv.perms_json || '{}') || {}; } catch { return {}; } };
// สิทธิ์ของเครื่องมือ: ผู้ใช้ตั้งเอง > อ่านอย่างเดียว = allow > อื่นๆ (แก้/ส่งข้อมูล) = ask
export const permOf = (sv, t, perms = parsePerms(sv)) => perms[t.name] || (t.ro ?? READ_NAME.test(t.name) ? 'allow' : 'ask');
const rowOut = (sv, dir) => {
  const perms = parsePerms(sv), tools = parseTools(sv).map(t => ({ name: t.name, description: t.description || '', perm: permOf(sv, t, perms) }));
  const c = dir.find(x => x.slug === sv.connector) || (sv.url === GOOGLE_URL ? dir.find(x => x.slug === 'google') : null);
  let host = ''; try { host = sv.url === GOOGLE_URL ? 'google.com' : new URL(sv.url).host; } catch { /* url เสีย */ }
  return { id: sv.id, connector: c?.slug || null, name: sv.name, host, url: sv.user_id && !c ? sv.url : undefined, icon: c?.icon || null, by: c?.by_name || null, global: sv.user_id === 0, auto: sv.auto !== 0, enabled: !!sv.enabled, oauth: !!sv.oauth_enc, status: sv.last_error ? 'error' : 'ok', error: sv.last_error || null, tools };
};
async function addRow(env, u, { name, url, slug = null, token = null, oauth = null }) {
  const old = await env.DB.prepare('SELECT id FROM mcp_servers WHERE user_id=? AND ((connector IS NOT NULL AND connector=?) OR url=?)').bind(u.id, slug, url).first();
  if (!old && (await env.DB.prepare('SELECT COUNT(*) n FROM mcp_servers WHERE user_id=?').bind(u.id).first()).n >= MAX_CONN) throw userErr(`เชื่อมต่อได้สูงสุด ${MAX_CONN} ตัว ลบตัวที่ไม่ใช้ก่อน`);
  const tokEnc = token ? await seal(env, token) : null, oEnc = oauth ? await seal(env, JSON.stringify(oauth)) : null;
  const tools = await mcpSync(url, oauth ? oauth.access : token);
  const id = old ? (await env.DB.prepare('UPDATE mcp_servers SET name=?, url=?, connector=?, token_enc=?, oauth_enc=?, tools_json=?, enabled=1, last_error=NULL WHERE id=? RETURNING id').bind(name, url, slug, tokEnc, oEnc, JSON.stringify(tools), old.id).first()).id
    : (await env.DB.prepare('INSERT INTO mcp_servers (user_id,name,url,connector,token_enc,oauth_enc,tools_json,enabled,auto,created_at) VALUES (?,?,?,?,?,?,?,1,1,?) RETURNING id').bind(u.id, name, url, slug, tokEnc, oEnc, JSON.stringify(tools), Date.now()).first()).id;
  return id;
}
const dirList = async env => (await env.DB.prepare('SELECT * FROM connectors ORDER BY sort, id').all()).results;
const pub = c => ({ slug: c.slug, name: c.name, description: c.description, auth: c.auth, category: c.category, by: c.by_name, icon: c.icon, enabled: !!c.enabled });

// เริ่ม OAuth: เก็บข้อมูลรอไว้ (เข้ารหัส) แล้วคืนที่อยู่หน้าล็อกอินของผู้ให้บริการ
async function oauthStart(env, base, u, { url, name, slug, conn }) {
  const d = await discover(url);
  if (d.open) return { open: true };
  const redirect = `${base}/api/connectors/callback`, cl = await clientFor(env, d, redirect, conn);
  const verifier = rand(32), challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))), state = rand(24);
  const scope = conn?.scope || d.scope;
  await env.DB.prepare('DELETE FROM oauth_pending WHERE created_at<?').bind(Date.now() - 20 * 60e3).run();
  await env.DB.prepare('INSERT INTO oauth_pending (state,user_id,data_enc,created_at) VALUES (?,?,?,?)').bind(state, u.id, await seal(env, JSON.stringify({ url, name, slug, verifier, client_id: cl.id, secret: cl.secret, token_endpoint: d.as.token_endpoint, resource: d.resource, redirect })), Date.now()).run();
  const q = form({ response_type: 'code', client_id: cl.id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state, resource: d.resource, scope });
  return { url: d.as.authorization_endpoint + (d.as.authorization_endpoint.includes('?') ? '&' : '?') + q };
}
const done = (base, o) => Response.redirect(`${base}/connected?${new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]))}`, 302);

export async function connectorRoutes(req, env, url, path, M, u) {
  if (!path.startsWith('/api/connectors')) return null;
  if (path.startsWith('/api/connectors/approve/')) return approvalRoutes(req, env, path, M, u);
  await ensureConnectors(env);
  const DB = env.DB, base = origin(req, env);
  if (path === '/api/connectors' && M === 'GET') {
    const [dir, rows, gh] = await Promise.all([dirList(env), DB.prepare('SELECT * FROM mcp_servers WHERE user_id=? OR (user_id=0 AND enabled=1) ORDER BY user_id DESC, id DESC').bind(u.id).all(), DB.prepare('SELECT gh_token IS NOT NULL g FROM users WHERE id=?').bind(u.id).first()]);
    const live = dir.filter(c => c.enabled);
    return json({ directory: live.map(pub), mine: rows.results.map(r => rowOut(r, dir)), github: !!gh?.g, google: !!(env.GOOGLE_CLIENT_ID || (await getSettings(env, ['google_client_id'])).google_client_id) });
  }
  // ป๊อปอัปเชื่อมต่อ: เปิดหน้านี้ในหน้าต่างใหม่ (ในเว็บเดียวกัน ป๊อปอัปไม่ถูกบล็อก และแอป Desktop เปิดในแอปพร้อมคุกกี้) → ไปหน้าล็อกอินของผู้ให้บริการ
  if (path === '/api/connectors/go' && M === 'GET') {
    const slug = url.searchParams.get('slug'), custom = url.searchParams.get('url');
    try {
      let target, name, conn = null;
      if (slug) { conn = await DB.prepare('SELECT * FROM connectors WHERE slug=? AND enabled=1').bind(slug).first(); if (!conn) throw userErr('ไม่พบ connector นี้'); target = conn.url; name = conn.name; }
      else { target = isSafeMcpUrl(custom); if (!target) throw userErr('URL ต้องเป็น https:// สาธารณะเท่านั้น'); name = String(url.searchParams.get('name') || '').trim().slice(0, 60) || new URL(target).host; }
      if (conn?.auth === 'google') return Response.redirect(`${base}/api/google/connect?popup=1`, 302);
      const r = await oauthStart(env, base, u, { url: target, name, slug: conn?.slug || null, conn });
      if (r.open) { const id = await addRow(env, u, { name, url: target, slug: conn?.slug || null }); return done(base, { ok: 1, id }); }
      return Response.redirect(r.url, 302);
    } catch (e) { return done(base, { ok: 0, error: e.message || 'เชื่อมต่อไม่สำเร็จ' }); }
  }
  if (path === '/api/connectors/callback' && M === 'GET') {
    const state = url.searchParams.get('state') || '';
    const p = state && await DB.prepare('SELECT * FROM oauth_pending WHERE state=?').bind(state).first();
    if (!p || Date.now() - p.created_at > 20 * 60e3) return done(base, { ok: 0, error: 'หมดเวลา ลองกดเชื่อมอีกครั้ง' });
    await DB.prepare('DELETE FROM oauth_pending WHERE state=?').bind(state).run(); // ใช้ได้ครั้งเดียว
    if (p.user_id !== u.id) return done(base, { ok: 0, error: 'บัญชีที่ล็อกอินอยู่ไม่ตรงกับคนที่กดเชื่อม' }); // กันเอา token ของคนอื่นมาผูกบัญชี
    if (url.searchParams.get('error')) return done(base, { ok: 0, error: url.searchParams.get('error') === 'access_denied' ? 'ยกเลิกการเชื่อมต่อ' : 'ผู้ให้บริการปฏิเสธ: ' + String(url.searchParams.get('error_description') || url.searchParams.get('error')).slice(0, 120) });
    try {
      const d = JSON.parse(await unseal(env, p.data_enc));
      const tk = await tokenReq(d.token_endpoint, { grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: d.redirect, client_id: d.client_id, code_verifier: d.verifier, resource: d.resource }, d.secret);
      const oauth = { access: tk.access_token, refresh: tk.refresh_token || null, exp: tk.expires_in ? Date.now() + tk.expires_in * 1000 : null, token_endpoint: d.token_endpoint, client_id: d.client_id, secret: d.secret || null, resource: d.resource };
      const id = await addRow(env, u, { name: d.name, url: d.url, slug: d.slug, oauth });
      return done(base, { ok: 1, id });
    } catch (e) { return done(base, { ok: 0, error: e.message || 'เชื่อมต่อไม่สำเร็จ' }); }
  }
  // เชื่อมแบบไม่ใช้ป๊อปอัป: none / token / url / github
  let r;
  if ((r = path.match(/^\/api\/connectors\/add\/([\w-]+)$/)) && M === 'POST') {
    const b = await req.json().catch(() => ({})), c = await DB.prepare('SELECT * FROM connectors WHERE slug=? AND enabled=1').bind(r[1]).first();
    if (!c) return err('ไม่พบ connector นี้', 404);
    let token = null, target = c.url;
    if (c.auth === 'github') {
      const g = await DB.prepare('SELECT gh_token FROM users WHERE id=?').bind(u.id).first();
      if (!g?.gh_token) return err('ยังไม่ได้ใส่ GitHub token', 409);
      token = await unseal(env, g.gh_token);
    } else if (c.auth === 'token') { token = String(b.token || '').trim(); if (!token) return err('วาง token ก่อน'); }
    else if (c.auth === 'url') { target = isSafeMcpUrl(b.url); if (!target) return err('URL ต้องเป็น https:// สาธารณะเท่านั้น'); }
    else if (c.auth !== 'none') return err('connector นี้ต้องล็อกอินผ่านป๊อปอัป', 400);
    try { const id = await addRow(env, u, { name: c.name, url: target, slug: c.slug, token }); return json({ ok: true, id }); }
    catch (e) { return err(e.http === 401 ? 'token ใช้ไม่ได้ ตรวจแล้วลองใหม่' : e.message, 400); }
  }
  if (path === '/api/connectors/custom' && M === 'POST') { // URL เอง: ไม่ต้องล็อกอิน / วาง token / ต้อง OAuth (หน้าเว็บเปิดป๊อปอัป /go?url=)
    const b = await req.json().catch(() => ({})), target = isSafeMcpUrl(b.url), name = String(b.name || '').trim().slice(0, 60);
    if (!target) return err('URL ต้องเป็น https:// สาธารณะเท่านั้น');
    try { const id = await addRow(env, u, { name: name || new URL(target).host, url: target, token: String(b.token || '').trim() || null }); return json({ ok: true, id }); }
    catch (e) { if (e.http === 401 && !b.token) return json({ oauth: true }); return err(e.http === 401 ? 'token ใช้ไม่ได้' : e.message, 400); }
  }
  if ((r = path.match(/^\/api\/connectors\/mine\/(\d+)(?:\/(sync))?$/))) {
    const sv = await DB.prepare('SELECT * FROM mcp_servers WHERE id=? AND user_id=?').bind(+r[1], u.id).first();
    if (!sv) return err('ไม่พบการเชื่อมต่อ', 404);
    if (r[2] === 'sync' && M === 'POST') {
      try { const tools = await connSync(env, sv); await DB.prepare('UPDATE mcp_servers SET tools_json=?, last_error=NULL WHERE id=?').bind(JSON.stringify(tools), sv.id).run(); return json({ ok: true, tools: tools.length }); }
      catch (e) { await DB.prepare('UPDATE mcp_servers SET last_error=? WHERE id=?').bind(String(e.message).slice(0, 200), sv.id).run(); return err(e.message, 400); }
    }
    if (M === 'PATCH') {
      const b = await req.json().catch(() => ({})), perms = parsePerms(sv);
      if (b.perms && typeof b.perms === 'object') for (const [k, v] of Object.entries(b.perms).slice(0, 80)) if (['allow', 'ask', 'deny'].includes(v)) perms[String(k).slice(0, 80)] = v;
      await DB.prepare('UPDATE mcp_servers SET auto=?, enabled=?, perms_json=? WHERE id=?').bind(b.auto == null ? (sv.auto ?? 1) : b.auto ? 1 : 0, b.enabled == null ? sv.enabled : b.enabled ? 1 : 0, JSON.stringify(perms), sv.id).run();
      return json({ ok: true });
    }
    if (M === 'DELETE') {
      if (sv.url === GOOGLE_URL) return null; // ให้ /api/google DELETE ถอนสิทธิ์ฝั่ง Google ด้วย
      await DB.prepare('DELETE FROM mcp_servers WHERE id=? AND user_id=?').bind(sv.id, u.id).run(); return json({ ok: true });
    }
  }
  return null;
}
// แอดมิน: แก้สารบบ + ทดสอบว่า connector เชื่อมได้จริง (ค้นหา OAuth / ต่อแบบไม่ล็อกอิน)
export async function adminConnectors(req, env, url, path, M) {
  await ensureConnectors(env);
  const DB = env.DB;
  if (path === '/api/admin/connectors' && M === 'GET') return json((await dirList(env)).map(c => ({ ...pub(c), id: c.id, url: c.url, client_id: c.client_id || '', has_secret: !!c.client_secret_enc, scope: c.scope || '', sort: c.sort })));
  if (path === '/api/admin/connectors' && M === 'POST') {
    const b = await req.json(), slug = String(b.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return err('slug ใช้ a-z 0-9 - เท่านั้น');
    if (!['oauth', 'none', 'token', 'url', 'google', 'github'].includes(b.auth)) return err('ชนิดการเชื่อมไม่ถูกต้อง');
    const u2 = b.auth === 'url' ? '' : b.auth === 'google' ? GOOGLE_URL : isSafeMcpUrl(b.url); if (u2 == null) return err('URL ต้องเป็น https:// สาธารณะ');
    const icon = /^#[0-9a-f]{6}$/i.test(b.icon || '') || /^data:image\/(png|jpeg|webp|svg\+xml);base64,[\w+/=]{10,200000}$/.test(b.icon || '') ? b.icon : '#6b7280';
    const sec = b.client_secret ? await seal(env, String(b.client_secret)) : undefined;
    await DB.prepare(`INSERT INTO connectors (slug,name,description,url,auth,category,by_name,icon,client_id,client_secret_enc,scope,sort,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
      ON CONFLICT(slug) DO UPDATE SET name=?2, description=?3, url=?4, auth=?5, category=?6, by_name=?7, icon=?8, client_id=?9, client_secret_enc=COALESCE(?10, client_secret_enc), scope=?11, sort=?12, enabled=?13`)
      .bind(slug, String(b.name || slug).slice(0, 60), String(b.description || '').slice(0, 300), u2, b.auth, String(b.category || '').slice(0, 30), String(b.by || '').slice(0, 40), icon, String(b.client_id || '').trim() || null, sec ?? null, String(b.scope || '').slice(0, 300) || null, +b.sort || 100, b.enabled === false ? 0 : 1, Date.now()).run();
    return json({ ok: true });
  }
  let r;
  if ((r = path.match(/^\/api\/admin\/connectors\/([\w-]+)(?:\/(test))?$/))) {
    const c = await DB.prepare('SELECT * FROM connectors WHERE slug=?').bind(r[1]).first(); if (!c) return err('ไม่พบ', 404);
    if (M === 'DELETE') { await DB.prepare('DELETE FROM connectors WHERE slug=?').bind(c.slug).run(); return json({ ok: true }); }
    if (r[2] === 'test' && M === 'POST') {
      if (!['oauth', 'none'].includes(c.auth)) return json({ ok: true, note: 'ชนิดนี้ทดสอบอัตโนมัติไม่ได้' });
      try {
        const d = await discover(c.url);
        if (d.open) { const tools = await mcpSync(c.url, null); return json({ ok: true, note: `เชื่อมได้ไม่ต้องล็อกอิน · ${tools.length} เครื่องมือ` }); }
        return json({ ok: true, note: `พบหน้าล็อกอิน ${new URL(d.as.authorization_endpoint).host}${d.as.registration_endpoint ? ' · ลงทะเบียนแอปอัตโนมัติได้' : c.client_id ? ' · ใช้ Client ID ที่ตั้งไว้' : ' · ⚠ ไม่รองรับลงทะเบียนอัตโนมัติ ต้องใส่ Client ID'}${d.as.guessed ? ' · (เดาที่อยู่ตามมาตรฐานเก่า)' : ''}` });
      } catch (e) { return json({ ok: false, note: e.message }); }
    }
  }
  return null;
}
// เครื่องมือของการเชื่อมที่เปิดใช้ (แชต/โหมด Code/API): คืนรายการเครื่องมือแบบ function calling + แผนที่ชื่อ → การเชื่อม
// opt.off = id ที่ผู้ใช้ปิดในแชตนี้ · opt.ids = id ที่เลือกเพิ่ม (รวมของกลางที่แอดมินตั้ง) · opt.askOk = แชตรองรับปุ่มอนุญาต
export async function connTools(env, uid, { ids = [], off = [], askOk = true, prefix = 'mcp_' } = {}) {
  const rows = (await env.DB.prepare(`SELECT * FROM mcp_servers WHERE enabled=1 AND ((user_id=?1 AND COALESCE(auto,1)=1) ${ids.length ? `OR (id IN (${ids.map(() => '?').join(',')}) AND (user_id=0 OR user_id=?1))` : ''}) ORDER BY id`).bind(uid, ...ids).all().catch(() => ({ results: [] }))).results.filter(x => !off.includes(x.id));
  const tools = [], map = new Map();
  for (const sv of rows) {
    const perms = parsePerms(sv);
    for (const t of parseTools(sv)) {
      const perm = permOf(sv, t, perms);
      if (perm === 'deny' || (perm === 'ask' && !askOk) || tools.length >= MAX_TOOLS) continue;
      const safe = `${prefix}${sv.id}_${String(t.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
      map.set(safe, { sv, name: t.name, server: sv.name.replace(/ · .*/, ''), perm });
      tools.push({ type: 'function', function: { name: safe, description: `[${sv.name.replace(/ · .*/, '')}] ${t.description || t.name}`.slice(0, 400), parameters: t.inputSchema } });
    }
  }
  return { tools, map, servers: rows };
}

// ---------- ขออนุญาตก่อนใช้เครื่องมือที่แก้/ส่งข้อมูล ----------
// AI เรียกเครื่องมือ "ask" → ยังไม่ทำ เก็บคำขอไว้ แชตขึ้นปุ่ม อนุญาตครั้งนี้ / อนุญาตเสมอ / ไม่อนุญาต
// กดอนุญาต → เซิร์ฟเวอร์ทำตามคำขอเดิม (อาร์กิวเมนต์ที่ AI ส่งมา ผู้ใช้แก้ไม่ได้) แล้วหน้าเว็บส่งผลกลับให้ AI ทำต่อ
const ensureApprovals = env => env.DB.prepare("CREATE TABLE IF NOT EXISTS tool_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, chat_id INTEGER, server_id INTEGER NOT NULL, server TEXT, tool TEXT NOT NULL, args_json TEXT, status TEXT NOT NULL DEFAULT 'pending', result TEXT, created_at INTEGER NOT NULL)").run();
export async function askApproval(env, uid, cid, meta, args) {
  await ensureApprovals(env);
  return (await env.DB.prepare('INSERT INTO tool_approvals (user_id,chat_id,server_id,server,tool,args_json,created_at) VALUES (?,?,?,?,?,?,?) RETURNING id').bind(uid, cid || null, meta.sv.id, meta.server, meta.name, JSON.stringify(args || {}).slice(0, 20000), Date.now()).first()).id;
}
export async function approvalRoutes(req, env, path, M, u) {
  const r = path.match(/^\/api\/connectors\/approve\/(\d+)$/); if (!r) return null;
  await ensureApprovals(env);
  const a = await env.DB.prepare('SELECT * FROM tool_approvals WHERE id=? AND user_id=?').bind(+r[1], u.id).first();
  if (!a) return err('ไม่พบคำขอ', 404);
  let args = {}; try { args = JSON.parse(a.args_json || '{}'); } catch { /* เสีย */ }
  const view = { id: a.id, server: a.server, tool: a.tool, args, status: a.status, result: a.status === 'done' ? a.result : null };
  if (M === 'GET') return json(view);
  if (M !== 'POST') return null;
  const b = await req.json().catch(() => ({})), d = b.decision;
  if (!['once', 'always', 'deny'].includes(d)) return err('เลือก อนุญาต หรือ ไม่อนุญาต');
  if (a.status !== 'pending') return err(a.status === 'denied' ? 'ไม่อนุญาตไปแล้ว' : 'ทำไปแล้ว', 409);
  // เปลี่ยนสถานะแบบ atomic: กดซ้ำ/สองแท็บพร้อมกัน ทำได้ครั้งเดียว
  const claim = await env.DB.prepare("UPDATE tool_approvals SET status=? WHERE id=? AND status='pending'").bind(d === 'deny' ? 'denied' : 'running', a.id).run();
  if (!claim.meta.changes) return err('ทำไปแล้ว', 409);
  if (d === 'deny') return json({ ...view, status: 'denied' });
  if (Date.now() - a.created_at > 24 * 3600e3) { await env.DB.prepare("UPDATE tool_approvals SET status='expired' WHERE id=?").bind(a.id).run(); return err('คำขอนี้เก่าเกิน 1 วัน ให้ AI ทำใหม่', 410); }
  const sv = await env.DB.prepare('SELECT * FROM mcp_servers WHERE id=? AND (user_id=? OR user_id=0) AND enabled=1').bind(a.server_id, u.id).first();
  if (!sv) { await env.DB.prepare("UPDATE tool_approvals SET status='failed' WHERE id=?").bind(a.id).run(); return err('การเชื่อมต่อนี้ถูกปิดหรือลบไปแล้ว', 404); }
  if (d === 'always' && sv.user_id === u.id) { const perms = parsePerms(sv); perms[a.tool] = 'allow'; await env.DB.prepare('UPDATE mcp_servers SET perms_json=? WHERE id=?').bind(JSON.stringify(perms), sv.id).run(); }
  let result, ok = true;
  try { result = String(await connCall(env, sv, a.tool, args)).slice(0, 20000); }
  catch (e) { result = 'Error: ' + e.message; ok = false; }
  await env.DB.prepare('UPDATE tool_approvals SET status=?, result=? WHERE id=?').bind(ok ? 'done' : 'failed', result, a.id).run();
  return json({ ...view, status: ok ? 'done' : 'failed', result });
}

// ---------- Plugins: ชุดสำเร็จรูป = Connectors + Skills + คำสั่งลัด (/) · แอดมินจัดการ · ติดตั้งครั้งเดียวได้ครบ (เว็บและแอปคอมใช้บัญชีเดียวกัน) ----------
// skills = [{ name, description, content }] → Skill ของผู้ใช้ · commands = [{ name, text }] → พรอมต์สำเร็จรูป เรียกด้วย / ในแชต
export const DEFAULT_PLUGINS = [
  ['dev', 'ชุดนักพัฒนา', 'เอกสารไลบรารีล่าสุด อ่าน repo GitHub ดู error จาก Sentry พร้อมคำสั่งลัดรีวิวโค้ดและอธิบาย repo', '#0EA5E9', ['context7', 'deepwiki', 'github', 'sentry'],
    [['dev-rules', 'กติกาเขียนโค้ดที่ดี', 'When writing or changing code: read the existing code first and follow its style; prefer small, focused changes; check library docs with the docs tools instead of guessing APIs; add or update tests when behaviour changes; explain risky changes and how to verify them.']],
    [['review', 'รีวิวโค้ดนี้แบบละเอียด หาบั๊ก ช่องโหว่ และจุดที่ช้า เรียงตามความสำคัญ พร้อมวิธีแก้:\n\n'], ['explain-repo', 'อธิบาย repo GitHub นี้: โครงสร้าง ส่วนสำคัญ วิธีรัน และจุดที่ควรเริ่มอ่าน (ใช้ DeepWiki/GitHub): '], ['fix-error', 'ดู error ล่าสุดของโปรเจกต์ใน Sentry สรุปสาเหตุที่น่าจะเป็นและเสนอวิธีแก้: ']]],
  ['office', 'ชุดงานเอกสารและอีเมล', 'Gmail, Drive, Sheets, ปฏิทิน และ Notion พร้อมสไตล์เขียนภาษาไทยแบบมืออาชีพ และคำสั่งลัดสรุปอีเมล ตอบอีเมล จดบันทึกประชุม', '#4285F4', ['google', 'notion'],
    [['thai-business-writer', 'เขียนภาษาไทยแบบธุรกิจ', 'Write Thai for business: polite but direct, short paragraphs, the main point first, clear next steps with owners and dates. Use ครับ/ค่ะ consistently, avoid slang and English filler. For emails: subject line, greeting, 2–4 short paragraphs, sign-off.']],
    [['inbox', 'สรุปอีเมลที่ยังไม่ได้อ่านใน Gmail 3 วันล่าสุด จัดกลุ่มเป็น ต้องตอบ / รอดำเนินการ / แจ้งให้ทราบ พร้อมสิ่งที่ควรทำต่อ'], ['reply', 'ร่างอีเมลตอบกลับ (เก็บเป็นฉบับร่างใน Gmail ยังไม่ส่ง) สำหรับอีเมลนี้: '], ['meeting-notes', 'สรุปบันทึกประชุมนี้เป็น: ประเด็นหลัก, การตัดสินใจ, งานที่ต้องทำ (ใคร/เมื่อไร) แล้วสร้างหน้าใน Notion ให้:\n\n']]],
  ['pm', 'ชุดจัดการโปรเจกต์', 'Linear, Jira และ Confluence: สรุปงานรายวัน ภาพรวมสปรินต์ และเปลี่ยนโน้ตเป็น issue', '#5E6AD2', ['linear', 'atlassian'],
    [],
    [['standup', 'สรุป standup วันนี้จาก issue ที่อัปเดตใน 24 ชม. ล่าสุด: ทำอะไรไปแล้ว / กำลังทำ / ติดอะไร'], ['sprint', 'สรุปสปรินต์/cycle ปัจจุบัน: ความคืบหน้า งานเสี่ยงล่าช้า และสิ่งที่ควรตัดสินใจ'], ['to-issues', 'แปลงโน้ตนี้เป็น issue (ชื่อ คำอธิบาย ลำดับความสำคัญ) แสดงให้ดูก่อน แล้วค่อยสร้างเมื่อฉันยืนยัน:\n\n']]],
  ['data', 'ชุดวิเคราะห์ข้อมูล', 'อ่าน Google Sheets วิเคราะห์ด้วย Python ทำกราฟ และสรุปเป็นภาษาคน', '#0F9D58', ['google'],
    [['data-analyst', 'นักวิเคราะห์ข้อมูล', 'You are a careful data analyst. Before concluding, check row counts, missing values and units. Use Python (pandas) for any calculation instead of mental math, show the key numbers in a small table, add one chart when it helps, and end with 3 plain-language takeaways and caveats.']],
    [['analyze-sheet', 'วิเคราะห์ Google Sheet นี้: สรุปแนวโน้ม ค่าผิดปกติ และข้อเสนอแนะ พร้อมกราฟ (ลิงก์หรือชื่อไฟล์): '], ['chart', 'ทำกราฟที่เหมาะที่สุดจากข้อมูลนี้ พร้อมอธิบายว่าบอกอะไร:\n\n']]],
];
let pready = null;
const ensurePlugins = env => pready ||= (async () => {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS plugins (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT, icon TEXT, connectors_json TEXT NOT NULL DEFAULT \'[]\', skills_json TEXT NOT NULL DEFAULT \'[]\', commands_json TEXT NOT NULL DEFAULT \'[]\', sort INTEGER NOT NULL DEFAULT 100, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS user_plugins (user_id INTEGER NOT NULL, slug TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, slug))'),
  ]);
  if (!(await env.DB.prepare('SELECT COUNT(*) n FROM plugins').first()).n) await env.DB.batch(DEFAULT_PLUGINS.map(([slug, name, d, icon, conns, skills, cmds], i) => env.DB.prepare('INSERT OR IGNORE INTO plugins (slug,name,description,icon,connectors_json,skills_json,commands_json,sort,enabled,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)')
    .bind(slug, name, d, icon, JSON.stringify(conns), JSON.stringify(skills.map(([n, ds, c]) => ({ name: n, description: ds, content: c }))), JSON.stringify(cmds.map(([n, t]) => ({ name: n, text: t }))), (i + 1) * 10, Date.now())));
})().catch(e => { pready = null; throw e; });
const J = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const plOut = (p, dir, mine, installed) => ({ slug: p.slug, name: p.name, description: p.description, icon: p.icon, installed: installed.has(p.slug),
  connectors: J(p.connectors_json).map(s => { const c = dir.find(x => x.slug === s); return c && { slug: s, name: c.name, auth: c.auth, icon: c.icon, connected: mine.has(s) }; }).filter(Boolean),
  skills: J(p.skills_json).map(x => ({ name: x.name, description: x.description })), commands: J(p.commands_json).map(x => ({ name: x.name, text: x.text })) });
export async function pluginRoutes(req, env, path, M, u) {
  if (!path.startsWith('/api/plugins')) return null;
  await ensureConnectors(env); await ensurePlugins(env);
  const DB = env.DB;
  const ctx = async () => { const [pl, dir, mine, inst] = await Promise.all([DB.prepare('SELECT * FROM plugins WHERE enabled=1 ORDER BY sort, id').all(), dirList(env), DB.prepare("SELECT connector FROM mcp_servers WHERE user_id=? AND enabled=1 AND connector IS NOT NULL").bind(u.id).all(), DB.prepare('SELECT slug FROM user_plugins WHERE user_id=?').bind(u.id).all()]); return { pl: pl.results, dir, mine: new Set(mine.results.map(x => x.connector)), inst: new Set(inst.results.map(x => x.slug)) }; };
  if (path === '/api/plugins' && M === 'GET') { const c = await ctx(); return json(c.pl.map(p => plOut(p, c.dir, c.mine, c.inst))); }
  const r = path.match(/^\/api\/plugins\/([\w-]+)$/); if (!r) return null;
  const p = await DB.prepare('SELECT * FROM plugins WHERE slug=? AND enabled=1').bind(r[1]).first(); if (!p) return err('ไม่พบปลั๊กอินนี้', 404);
  if (M === 'POST') { // ติดตั้ง: Skill + คำสั่งลัดเป็นของผู้ใช้ (ติดป้ายปลั๊กอิน) · connector ที่ไม่ต้องล็อกอินเชื่อมให้เลย ที่เหลือหน้าเว็บพาไปเชื่อม
    const have = (await DB.prepare('SELECT COUNT(*) n FROM skills WHERE user_id=? AND COALESCE(plugin,\'\')<>?').bind(u.id, p.slug).first()).n;
    const items = [...J(p.skills_json).map(x => [x.name, x.description || '', x.content, 0]), ...J(p.commands_json).map(x => [x.name, 'คำสั่งลัดจากปลั๊กอิน ' + p.name, x.text, 1])];
    if (have + items.length > 30) return err(`Skill และคำสั่งลัดรวมเกิน 30 อัน ลบของเดิมบางส่วนก่อน`);
    await DB.batch([DB.prepare('DELETE FROM skills WHERE user_id=? AND plugin=?').bind(u.id, p.slug), ...items.map(([n, d, c, t]) => DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at,as_text,plugin) VALUES (?,?,?,?,1,?,?,?)').bind(u.id, String(n).slice(0, 60), String(d).slice(0, 200), String(c).slice(0, 6000), Date.now(), t, p.slug)),
      DB.prepare('INSERT OR REPLACE INTO user_plugins (user_id,slug,created_at) VALUES (?,?,?)').bind(u.id, p.slug, Date.now())]);
    const dir = await dirList(env), failed = [];
    for (const s of J(p.connectors_json)) { const c = dir.find(x => x.slug === s && x.enabled && x.auth === 'none'); if (c && !(await DB.prepare('SELECT 1 FROM mcp_servers WHERE user_id=? AND connector=?').bind(u.id, s).first())) await addRow(env, u, { name: c.name, url: c.url, slug: s }).catch(() => failed.push(c.name)); }
    const c = await ctx(); return json({ ok: true, plugin: plOut(p, c.dir, c.mine, c.inst), failed });
  }
  if (M === 'DELETE') { await DB.batch([DB.prepare('DELETE FROM skills WHERE user_id=? AND plugin=?').bind(u.id, p.slug), DB.prepare('DELETE FROM user_plugins WHERE user_id=? AND slug=?').bind(u.id, p.slug)]); return json({ ok: true }); }
  return null;
}
export async function adminPlugins(req, env, path, M) {
  await ensurePlugins(env);
  const DB = env.DB;
  if (path === '/api/admin/plugins' && M === 'GET') return json((await DB.prepare('SELECT * FROM plugins ORDER BY sort, id').all()).results.map(p => ({ slug: p.slug, name: p.name, description: p.description, icon: p.icon, connectors: J(p.connectors_json), skills: J(p.skills_json), commands: J(p.commands_json), sort: p.sort, enabled: !!p.enabled })));
  if (path === '/api/admin/plugins' && M === 'POST') {
    const b = await req.json(), slug = String(b.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return err('slug ใช้ a-z 0-9 - เท่านั้น');
    const arr = (v, f) => (Array.isArray(v) ? v : []).slice(0, 12).map(f).filter(Boolean);
    const conns = arr(b.connectors, x => /^[a-z0-9-]{2,41}$/.test(x) && x), skills = arr(b.skills, x => x?.name && x?.content && { name: String(x.name).slice(0, 60), description: String(x.description || '').slice(0, 200), content: String(x.content).slice(0, 6000) }), cmds = arr(b.commands, x => x?.name && x?.text && { name: String(x.name).slice(0, 60), text: String(x.text).slice(0, 6000) });
    const icon = /^#[0-9a-f]{6}$/i.test(b.icon || '') ? b.icon : '#6b7280';
    await DB.prepare(`INSERT INTO plugins (slug,name,description,icon,connectors_json,skills_json,commands_json,sort,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
      ON CONFLICT(slug) DO UPDATE SET name=?2, description=?3, icon=?4, connectors_json=?5, skills_json=?6, commands_json=?7, sort=?8, enabled=?9`).bind(slug, String(b.name || slug).slice(0, 60), String(b.description || '').slice(0, 300), icon, JSON.stringify(conns), JSON.stringify(skills), JSON.stringify(cmds), +b.sort || 100, b.enabled === false ? 0 : 1, Date.now()).run();
    return json({ ok: true });
  }
  const r = path.match(/^\/api\/admin\/plugins\/([\w-]+)$/);
  if (r && M === 'DELETE') { await DB.prepare('DELETE FROM plugins WHERE slug=?').bind(r[1]).run(); return json({ ok: true }); }
  return null;
}
