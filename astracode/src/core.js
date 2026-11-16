import { event, getSettings, mail, mailBox, origin } from './billing.js';
import { projects } from './projects.js';
import { admin } from './admin.js';
import { CSP, sandboxed } from './worker.js';
import { totpOk } from './user.js';
import { v1 } from './api.js';
import { status } from './jobs.js';
// AstraCode API — Cloudflare Worker + D1 + R2
export const SYSTEM = 'You are AstraCode, a helpful AI assistant. Reply in the user\'s language. Use Markdown. You have no tools: never output JSON tool calls; if you really need the user to choose or decide something, end your reply with ONE block (use it only then, otherwise just proceed):\n```ask\nQuestion in one line?\n- Option 1\n- Option 2\n```\nGive 2-4 short options. The page shows them as buttons plus a box for a custom answer, so do not repeat the options in your text. When the user asks for a file (CSV, Excel, Markdown, HTML, JSON, code, Word…), put the whole file in one fenced code block whose info string is the language then file=<name.ext>, e.g. ```csv file=sales.csv — the page shows a download button. For Excel write CSV content with file=<name>.xlsx. For Word write a full HTML document with file=<name>.doc. For PDF write HTML with file=<name>.html and tell the user to print it to PDF. Write file names in English without spaces. When the user states a lasting personal fact or preference that is not already in the remembered list (name, job, preferred style or language, ongoing project), end your reply with ONE block, rarely and never for one-off requests:\n```remember\nOne short sentence in the user\'s language\n```\nThe page shows it as a button the user may tap to save it.';
export const SYSTEM_CODE = `You are AstraCode, a senior software engineer working inside the user's project. Reply in the user's language and keep explanations short.
You CAN create, edit and delete files in this project: the page applies your path= blocks to the real files. Never say you cannot edit files, that this is chat-only mode, or that the user must copy code by hand. A code block without path= changes nothing, so every file change must use path=.
To CREATE a file, output its COMPLETE content in one fenced code block whose info string is the language followed by path=<relative path>, for example:
\`\`\`js path=src/app.js
...whole file...
\`\`\`
To CHANGE an existing file, use edit blocks instead of rewriting it (far cheaper and safer). Inside a fence with path=<relative path>, write one or more pairs:
<<<<<<< SEARCH
exact lines copied from the current file (add one or two unchanged neighbouring lines so it matches only one place)
=======
the replacement lines
>>>>>>> REPLACE
SEARCH must match the file character for character, so READ the file first and copy from it. Pairs apply in order; if nothing in the file matches, the edit is rejected and you will be asked to retry. Output a whole-file block for an existing file only when you rewrite most of it or it is under about 40 lines.
The path= must be inside the opening fence line itself: a heading or bold file name above a plain code block does NOT create the file. One block per changed file. Never put "..." placeholders or diffs inside path= blocks. To delete a file, write a line: DELETE path=<relative path>
If you truly need a decision from the user (which approach, which file, missing requirement), do not guess: end your reply with ONE block and STOP, with no path= blocks, READ or RUN lines in the same reply:
\`\`\`ask
Question in one line?
- Option 1
- Option 2
\`\`\`
Give 2-4 short options. The page shows buttons plus a box for a custom answer. Ask only when needed; otherwise just do the work.
The project preview runs in a sandboxed browser frame: access to localStorage/sessionStorage/cookies may be blocked, so wrap storage reads in try/catch; there is no real server, no network to localhost and no Python http.server: build front-end projects that open from index.html, and Python runs in the browser (Pyodide) without a server or webbrowser module. Code blocks without path= are treated as examples only. Only change files that need changing.
You can see the whole project. The file list is in the message. To look at files, write tool lines on their own and then STOP your reply; the results come back to you:
READ path=<relative path>   (full content of one file; up to 10 READ lines at once)
GREP <regex>                (search every file, returns path:line: text)
LIST <folder/>              (files under a folder, with sizes)
The latest message may end with [เนื้อหาไฟล์ที่เปิดอยู่] (the current content of the file open in the editor, possibly cut) and the text the user has selected: both are current, so you need not READ that file again unless it was cut. If that block is NOT there, you have not seen any file content yet: never say you cannot see files or ask the user to paste them, use READ (or GREP/LIST) first. Read every file you need before editing it. Never guess what a file contains. Do not mix READ/GREP/LIST lines with path= blocks in the same reply.
To run a terminal command, write a line RUN <command> (up to 3 per reply) and then STOP; the output comes back in the next message. You may put path= blocks before RUN lines in the same reply: they are applied first. Commands run in a browser Node.js emulator (Node 20 APIs): npm install <pkg>, npm test, npm run <script>, node <file>.js, npx-style CLIs from node_modules/.bin, ls, cat, echo. Not available: git, python, pip, sudo, node -e, node -v, native addons. Use RUN to test your changes when the project has tests or runnable scripts.
Before you finish, re-read what you wrote: every import/require resolves to a real file or package, every function and variable you use is defined, brackets and quotes are balanced, JSON files are valid, and existing behavior you did not mean to change still works. Fix problems in the same reply; do not hand back code you have not checked. In the last line, say in one short sentence what you checked.`;
export const HISTORY = 20, HISTORY_CODE = 8; // ข้อความย้อนหลังที่ส่งให้โมเดล (โหมด Code ส่งน้อยกว่าเพราะมีไฟล์ยาว)
export const LOCK_MS = 45e3; // ล็อกตอบทีละข้อความ: ต่ออายุทุก 15 วินาทีระหว่างตอบ ถ้า Worker ถูกตัดกลางคัน (ผู้ใช้ปิดจอ) ล็อกหมดใน 45 วินาที
export const H4 = 4 * 3600e3, DAY = 864e5, BKK = 7 * 3600e3;

// ข้อผิดพลาดที่บอกผู้ใช้ได้ตรงๆ (ไม่ใช่บั๊กของเซิร์ฟเวอร์)
// เก็บสลิป: ใช้ R2 ถ้าผูกไว้ ไม่งั้นเก็บใน D1 (shortcut: D1 แถวละไม่เกิน ~2MB จึงจำกัด 1.5MB, ถ้าสลิปเยอะให้ผูก R2)
export const slipPut = async (env, key, buf, type) => {
  if (env.SLIPS) return env.SLIPS.put(key, buf, { httpMetadata: { contentType: type } });
  if (buf.byteLength > 1.5e6) throw userErr('รูปสลิปใหญ่เกิน 1.5MB ลดขนาดรูปแล้วลองใหม่');
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS slip_blobs (k TEXT PRIMARY KEY, t TEXT, d BLOB)').run();
  await env.DB.prepare('INSERT OR REPLACE INTO slip_blobs VALUES (?,?,?)').bind(key, type, [...new Uint8Array(buf)]).run();
};
export const slipGet = async (env, key) => {
  if (env.SLIPS) { const o = await env.SLIPS.get(key); if (o) return o; } // สลิปที่เก็บก่อนผูก R2 ยังอยู่ใน D1
  const r = await env.DB.prepare('SELECT t,d FROM slip_blobs WHERE k=?').bind(key).first().catch(() => null);
  return r && { body: new Uint8Array(r.d), httpMetadata: { contentType: r.t } };
};
export const userErr = (m, status = 400) => Object.assign(new Error(m), { user: true, status });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
export const err = (m, s = 400) => json({ error: m }, s);
export const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));

// ---------- auth ----------
export const same = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0, n = Math.max(x.length, y.length); i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
};
export const sha = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
// คำขอที่ผ่าน proxy บน Vercel แนบ x-proxy-secret มา จึงเชื่อ IP และโดเมนที่ proxy ส่งต่อได้
export const viaProxy = (req, env) => !!env.PROXY_SECRET && same(req.headers.get('x-proxy-secret') || '', env.PROXY_SECRET);
export const ip = (req, env) => (viaProxy(req, env) && req.headers.get('x-client-ip')) || req.headers.get('cf-connecting-ip') || 'local';

// นับครั้งต่อช่วงเวลา คืน true ถ้าเกิน max
export async function limited(env, key, max, ms) {
  const now = Date.now();
  const r = await env.DB.prepare(`INSERT INTO rate (key,n,reset) VALUES (?1,1,?2)
    ON CONFLICT(key) DO UPDATE SET n=CASE WHEN reset<?3 THEN 1 ELSE n+1 END, reset=CASE WHEN reset<?3 THEN ?2 ELSE reset END RETURNING n`).bind(key, now + ms, now).first();
  return r.n > max;
}
export const unlimit = (env, key) => env.DB.prepare('DELETE FROM rate WHERE key=?').bind(key).run();

export async function getUser(req, env) {
  const sid = (req.headers.get('cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];
  if (!sid) return null;
  const u = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').bind(await sha(sid), Date.now()).first();
  if (u) u.sid = await sha(sid);
  return u;
}
// IP ที่เก็บเป็นแบบหยาบ (IPv4 ตัดท้าย 2 ชุด · IPv6 เหลือ 3 ชุดแรก) เพื่อให้ผู้ใช้เห็นว่าเข้าจากที่ไหน โดยไม่เก็บ IP เต็ม
export const coarseIp = a => !a || a === 'local' ? '' : a.includes(':') ? a.split(':').slice(0, 3).join(':') + '::' : a.split('.').slice(0, 2).join('.') + '.x.x';
export async function sessionCookie(env, uid, req) {
  await ensureCols(env);
  const t = rand(32), now = Date.now(), exp = now + 30 * DAY, ua = String(req?.headers.get('user-agent') || '').slice(0, 160), ipc = req ? coarseIp(ip(req, env)) : '';
  const known = req && (await env.DB.prepare('SELECT COUNT(*) n, SUM(ua=?) same FROM sessions WHERE user_id=? AND expires>?').bind(ua, uid, now).first());
  // เก็บแค่ hash ของ token ถ้า DB รั่วก็เอาไปล็อกอินไม่ได้
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token,user_id,expires,created_at,ua,ip) VALUES (?,?,?,?,?,?)').bind(await sha(t), uid, exp, now, ua, ipc),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
  ]);
  if (known?.n > 0 && !known.same) { // มีอุปกรณ์อื่นล็อกอินอยู่ แต่เครื่องนี้ไม่เคยเห็น → อีเมลแจ้งเจ้าของบัญชี
    const u = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(uid).first();
    if (u) await mail(env, u.email, 'AstraCode: มีการเข้าสู่ระบบจากอุปกรณ์ใหม่', mailBox('เข้าสู่ระบบจากอุปกรณ์ใหม่', `${esc(ua || 'อุปกรณ์ไม่ทราบชนิด')}${ipc ? ' · ' + esc(ipc) : ''} เวลา ${new Date(now + BKK).toISOString().replace('T', ' ').slice(0, 16)} ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านและกด "ออกจากระบบทุกเครื่อง" ที่หน้าบัญชี`)).catch(() => {});
  }
  return `sid=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`;
}
export const startSession = async (env, uid, req) => json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, uid, req) });

// ---------- Firebase Auth ผ่าน REST จากฝั่ง Worker: เบราว์เซอร์ไม่ต้องคุยกับ Google เอง (กันเน็ต/CSP/adblock บล็อก) ----------
export const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export const FB_BAD = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', FB_OFF = 'ยังไม่ได้เปิดล็อกอินด้วยอีเมลใน Firebase (แจ้งแอดมิน)';
export const FB_MSG = { EMAIL_EXISTS: 'อีเมลนี้สมัครแล้ว กด "เข้าสู่ระบบ"', INVALID_LOGIN_CREDENTIALS: FB_BAD, EMAIL_NOT_FOUND: FB_BAD, INVALID_PASSWORD: FB_BAD, USER_DISABLED: 'บัญชีนี้ถูกระงับ',
  WEAK_PASSWORD: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว', INVALID_EMAIL: 'อีเมลไม่ถูกต้อง', TOO_MANY_ATTEMPTS_TRY_LATER: 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่', OPERATION_NOT_ALLOWED: FB_OFF, PASSWORD_LOGIN_DISABLED: FB_OFF };
export async function fbApi(req, env, op, body) {
  const s = await getSettings(env, ['fb_api_key']), key = s.fb_api_key || 'AIzaSyBDiG6Y7fhI-pPkucmAtTNZaZ5rgLIdxOM'; // web key ของ Firebase เป็นค่าสาธารณะ
  const r = await fetch(`${env.FB_API_URL || 'https://identitytoolkit.googleapis.com/v1'}/accounts:${op}?key=${encodeURIComponent(key)}`, { method: 'POST', // FB_API_URL ใช้ตอนทดสอบเท่านั้น
    headers: { 'content-type': 'application/json', referer: origin(req, env) + '/', 'x-firebase-locale': 'th' }, body: JSON.stringify(body) }); // referer: ผ่านกรณี API key จำกัดโดเมนไว้
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d;
  const code = String(d.error?.message || r.status), k = code.split(/[\s:]/)[0];
  if (!FB_MSG[k]) await event(env, 'error', null, 'firebase ' + op + ': ' + code);
  throw Object.assign(new Error(FB_MSG[k] || 'ระบบล็อกอินขัดข้อง: ' + code), { known: !!FB_MSG[k] });
}
// Cloudflare Turnstile กันบอทสมัคร/ล็อกอิน: ทำงานเมื่อตั้ง Secret TURNSTILE_SECRET และตั้ง turnstile_site (site key) ในหลังบ้าน · ไม่ตั้ง = ปิด
export async function turnstileOk(req, env, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const r = await fetch(env.TURNSTILE_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token).slice(0, 2100), remoteip: ip(req, env) }) });
    return !!(await r.json()).success;
  } catch { return false; }
}
export async function emailAuth(req, env) {
  const b = await req.json(), a = b.action, email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (['login', 'register', 'forgot'].includes(a) && !await turnstileOk(req, env, b.cf)) return err('ยืนยันว่าไม่ใช่บอทไม่สำเร็จ รีเฟรชหน้าแล้วลองใหม่', 400);
  if (await limited(env, 'fb:' + ip(req, env), 30, 900e3)) return err('ลองหลายครั้งเกินไป รอ 15 นาที', 429);
  try {
    if (a === 'forgot') { await fbApi(req, env, 'sendOobCode', { requestType: 'PASSWORD_RESET', email }).catch(x => { if (!x.known) throw x; }); return json({ ok: true }); } // ไม่บอกว่ามีอีเมลนี้ไหม
    if (!['login', 'register', 'check'].includes(a) || !email || !pw) return err('ใส่อีเมลและรหัสผ่าน');
    if (a === 'register' && pw.length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
    const d = await fbApi(req, env, a === 'register' ? 'signUp' : 'signInWithPassword', { email, password: pw, returnSecureToken: true });
    const c = JSON.parse(new TextDecoder().decode(b64u(d.idToken.split('.')[1]))); // ได้ token ตรงจาก Google ผ่าน HTTPS จึงอ่าน payload ได้เลย
    if (!c.email_verified) { // check = กด "ยืนยันแล้ว" ไม่ต้องส่งอีเมลซ้ำ
      if (a !== 'check') await fbApi(req, env, 'sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: d.idToken }).catch(() => {});
      return json({ verify: true });
    }
    return await fbSession(req, env, { sub: c.user_id || c.sub, email: c.email }, b);
  } catch (x) { return err(x.message, x.known ? 400 : 502); }
}
export async function fbSession(req, env, c, b) { // c มาจาก token ที่อีเมลยืนยันแล้ว: กันคนสมัครด้วยอีเมลคนอื่นแล้วยึดบัญชีเดิม
  const email = String(c.email || '').toLowerCase();
  let u = await env.DB.prepare('SELECT * FROM users WHERE fb_uid=?').bind(c.sub).first()
    || await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(); // บัญชีเดิม (สมัครก่อนย้ายมา Firebase) เชื่อมด้วยอีเมลที่ยืนยันแล้ว
  if (u && u.fb_uid !== c.sub) await env.DB.prepare('UPDATE users SET fb_uid=?, email_verified=1 WHERE id=?').bind(c.sub, u.id).run();
  if (!u) {
    if (await limited(env, 'reg:' + ip(req, env), 3, DAY)) return err('สมัครจากเครือข่ายนี้บ่อยเกินไป ลองใหม่พรุ่งนี้', 429);
    // ได้สิทธิ์แอดมินเฉพาะตอนที่ยังไม่มีแอดมินในระบบ
    const role = email === String(env.ADMIN_EMAIL || '').toLowerCase() && !await env.DB.prepare("SELECT 1 FROM users WHERE role='admin'").first() ? 'admin' : 'user';
    const by = b.ref && await env.DB.prepare('SELECT id FROM users WHERE ref_code=?').bind(String(b.ref).toUpperCase()).first();
    u = await env.DB.prepare('INSERT INTO users (email,pass_hash,role,created_at,ref_code,referred_by,fb_uid,email_verified,has_password) VALUES (?,?,?,?,?,?,?,1,0) RETURNING *')
      .bind(email, 'x', role, Date.now(), rand(4).toUpperCase(), by?.id || null, c.sub).first();
  }
  if (u.banned) return err('บัญชีนี้ถูกระงับ', 403);
  if (u.totp_on) {
    if (!b.code) return json({ need2fa: true }, 401);
    if (await limited(env, 'mfa:' + u.id, 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
    if (!await totpOk(env, u, b.code)) return err('รหัส 2FA ไม่ถูกต้อง', 401);
  }
  return await startSession(env, u.id, req);
}

// ---------- plan + limits ----------
export async function planOf(env, u) {
  const now = Date.now();
  let personal = null;
  if (u.plan_id && u.plan_expires > now) {
    personal = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(u.plan_id).first();
  }
  const tm = await env.DB.prepare(`SELECT t.id tid,t.name tname,t.owner_id,t.expires,t.invite_code,t.max_seats,t.shared_pool tshared,tm.role trole,p.*
    FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN plans p ON p.id=t.plan_id
    WHERE tm.user_id=? AND t.expires>? ORDER BY p.limit_week DESC, t.expires DESC LIMIT 1`).bind(u.id, now).first().catch(() => null);
  if (tm && (!personal || tm.limit_week >= personal.limit_week)) {
    tm._team = { id: tm.tid, name: tm.tname, owner_id: tm.owner_id, expires: tm.expires, invite_code: tm.invite_code, max_seats: tm.max_seats, shared_pool: !!tm.tshared, role: tm.trole };
    return tm;
  }
  if (personal) return personal;
  return env.DB.prepare('SELECT * FROM plans WHERE price=0 AND active=1 ORDER BY sort LIMIT 1').first();
}
// ลิมิตหักตามต้นทุนจริง (บาท) แบบเดียวกับ Claude: รอบสั้นเริ่มนับตอนส่งข้อความแรกและยาว 4 ชม. · รอบสัปดาห์เริ่มตอนใช้ครั้งแรกแล้วรีเซ็ตหลัง 7 วัน
export async function usageStatus(env, u, plan) {
  const now = Date.now(), r0 = u.usage_reset_at || 0;
  if (plan?._team?.shared_pool) {
    const w = await env.DB.prepare('SELECT sess_start,week_start FROM teams WHERE id=?').bind(plan._team.id).first() || {};
    const s4 = w.sess_start && now < w.sess_start + H4 ? w.sess_start : null, sw = w.week_start && now < w.week_start + 7 * DAY ? w.week_start : null;
    const r = s4 || sw ? await env.DB.prepare(`SELECT
        COALESCE(SUM(CASE WHEN created_at>=?1 THEN units END),0) u4,
        COALESCE(SUM(CASE WHEN created_at>=?2 THEN units END),0) uw
      FROM usage WHERE user_id IN (SELECT user_id FROM team_members WHERE team_id=?3) AND created_at>=?4`).bind(s4 || 1e18, sw || 1e18, plan._team.id, Math.min(s4 || 1e18, sw || 1e18)).first() : { u4: 0, uw: 0 };
    const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 1000) / 10) : 100;
    let pw = pct(r.uw, plan.limit_week);
    // เพดานต่อคนที่หัวหน้าทีมตั้ง (% ของงบสัปดาห์ของทีม): ใช้ถึงเพดานนี้แล้วคนนั้นเต็ม แม้งบทีมยังเหลือ
    const cap = sw && plan.limit_week > 0 ? (await env.DB.prepare('SELECT cap_pct FROM team_members WHERE team_id=? AND user_id=?').bind(plan._team.id, u.id).first())?.cap_pct : 0;
    if (cap > 0) { const mu = (await env.DB.prepare('SELECT COALESCE(SUM(units),0) x FROM usage WHERE user_id=? AND created_at>=?').bind(u.id, sw).first()).x; pw = Math.max(pw, pct(mu, plan.limit_week * cap / 100)); }
    return win4(plan, { pct4h: pct(r.u4, plan.limit_4h), pctWeek: pw, reset4h: s4 && s4 + H4, resetWeek: sw && sw + 7 * DAY });
  }
  const w = await env.DB.prepare('SELECT sess_start,week_start FROM users WHERE id=?').bind(u.id).first() || {}; // อ่านใหม่เสมอ เพราะเพิ่งอาจเริ่มรอบตอนบันทึกการใช้งาน
  const s4 = w.sess_start && now < w.sess_start + H4 && w.sess_start >= r0 ? w.sess_start : null, sw = w.week_start && now < w.week_start + 7 * DAY && w.week_start >= r0 ? w.week_start : null;
  const r = s4 || sw ? await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN created_at>=?1 THEN units END),0) u4,
      COALESCE(SUM(CASE WHEN created_at>=?2 THEN units END),0) uw
    FROM usage WHERE user_id=?3 AND created_at>=?4`).bind(s4 || 1e18, sw || 1e18, u.id, Math.min(s4 || 1e18, sw || 1e18)).first() : { u4: 0, uw: 0 };
  const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 1000) / 10) : 100;
  return win4(plan, { pct4h: pct(r.u4, plan.limit_4h), pctWeek: pct(r.uw, plan.limit_week), reset4h: s4 && s4 + H4, resetWeek: sw && sw + 7 * DAY });
}
// แพลนที่ปิดรอบ 4 ชม. (use_4h=0): ไม่นับ/ไม่บล็อกด้วยรอบ 4 ชม. เหลือแค่รอบสัปดาห์ · use4h ให้หน้าเว็บซ่อนมิเตอร์
export const win4 = (plan, st) => plan?.use_4h === 0 ? { ...st, pct4h: 0, reset4h: null, use4h: false } : { ...st, use4h: true };
// คอลัมน์ที่เพิ่มทีหลัง: เพิ่มเองครั้งแรกต่อ isolate (ไม่ต้องรัน migrate-19 ด้วยมือ)
export let colsDone;
// เดิมสั่ง ALTER ทีละคำสั่งทุกครั้งที่ isolate เริ่ม (13 รอบไป-กลับ D1 ก่อนตอบคำขอแรก) ตอนนี้ถามโครงสร้างครั้งเดียวแล้วเพิ่มเฉพาะที่ขาด
const NEW_COLS = [['api_keys', 'ip_allow', 'TEXT'], ['plans', 'use_4h', 'INTEGER'], ['models', 'use_mult', 'REAL'], ['models', 'promo_mult', 'REAL'], ['team_members', 'cap_pct', 'REAL'], ['models', 'first_token_s', 'REAL'], ['models', 'idle_s', 'REAL'], ['sessions', 'created_at', 'INTEGER'], ['sessions', 'ua', 'TEXT'], ['sessions', 'ip', 'TEXT'], ['sessions', 'admin_ok', 'INTEGER'], ['projects', 'share_token', 'TEXT']];
const API_LOG = 'CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER NOT NULL, user_id INTEGER NOT NULL, path TEXT, model TEXT, status INTEGER, tin INTEGER, tout INTEGER, charge REAL, ms INTEGER, err TEXT, created_at INTEGER NOT NULL)';
export const ensureCols = env => colsDone ||= (async () => {
  let todo = NEW_COLS.map(([t, c, ty]) => `ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`), apiLog = true;
  try {
    const rows = (await env.DB.prepare("SELECT m.name t, p.name c FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name IN ('api_keys','plans','models','team_members','sessions','projects','api_log')").all()).results;
    const has = new Set(rows.map(r => r.t + '.' + r.c));
    todo = NEW_COLS.filter(([t, c]) => !has.has(t + '.' + c)).map(([t, c, ty]) => `ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`);
    apiLog = !rows.some(r => r.t === 'api_log');
  } catch { /* ถามโครงสร้างไม่ได้: ใช้วิธีเดิม ลองเพิ่มทุกคอลัมน์ */ }
  if (apiLog) todo.push(API_LOG, 'CREATE INDEX IF NOT EXISTS api_log_key ON api_log(key_id, id)');
  for (const q of todo) try { await env.DB.prepare(q).run(); } catch { /* มีคอลัมน์แล้ว */ }
})();
// ตัวคูณหน่วยลิมิตของโมเดล: ช่วงโปรใช้ promo_mult (ถ้าตั้ง) ไม่งั้นใช้ use_mult · ว่าง = 1
export const limMult = (m, now = Date.now()) => { const inPromo = (m.promo_pct > 0 || m.promo_mult != null) && (!m.promo_start || m.promo_start <= now) && (!m.promo_end || now <= m.promo_end), v = inPromo && m.promo_mult != null ? m.promo_mult : m.use_mult; return v != null && v >= 0 ? +v : 1; };
// ข้อความแรกหลังรอบเก่าจบ = เริ่มรอบใหม่
export async function touchWindows(env, uid, now = Date.now(), plan = null) {
  await env.DB.prepare(`UPDATE users SET
    sess_start=CASE WHEN sess_start IS NULL OR sess_start+?2<=?1 OR sess_start<usage_reset_at THEN ?1 ELSE sess_start END,
    week_start=CASE WHEN week_start IS NULL OR week_start+?3<=?1 OR week_start<usage_reset_at THEN ?1 ELSE week_start END WHERE id=?4`).bind(now, H4, 7 * DAY, uid).run();
  if (plan?._team?.shared_pool) {
    await env.DB.prepare(`UPDATE teams SET
      sess_start=CASE WHEN sess_start IS NULL OR sess_start+?2<=?1 THEN ?1 ELSE sess_start END,
      week_start=CASE WHEN week_start IS NULL OR week_start+?3<=?1 THEN ?1 ELSE week_start END WHERE id=?4`).bind(now, H4, 7 * DAY, plan._team.id).run();
  }
}
// เพดานโมเดลระดับบน: ใช้ได้ไม่เกิน cap_pct % ของงบสัปดาห์ (เช่น Opus 50%)
export async function capHit(env, u, plan, m) {
  if (!(m.cap_pct > 0) || !(plan.limit_week > 0)) return false;
  const w = await env.DB.prepare('SELECT week_start FROM users WHERE id=?').bind(u.id).first();
  if (!w?.week_start || Date.now() >= w.week_start + 7 * DAY) return false;
  const r = await env.DB.prepare('SELECT COALESCE(SUM(units),0) x FROM usage WHERE user_id=? AND model_id=? AND created_at>=?').bind(u.id, m.id, Math.max(w.week_start, u.usage_reset_at || 0)).first();
  return r.x >= plan.limit_week * m.cap_pct / 100;
}
// ---------- รีเซ็ตลิมิต: ทั้งหมด / ค่าย (ชื่อโมเดลขึ้นต้นด้วยชื่อค่าย) / โมเดลเดียว ----------
export async function resetUsage(env, uid, scope) {
  if (scope?.vendor || scope?.model_id) {
    const byModel = !!scope.model_id, key = byModel ? +scope.model_id : String(scope.vendor).replace(/[%_]/g, '').trim().slice(0, 40);
    if (!key) throw userErr('เลือกค่ายหรือโมเดลที่จะรีเซ็ต');
    const sel = byModel ? 'model_id=?2' : "model_id IN (SELECT id FROM models WHERE lower(name)=lower(?2) OR lower(name) LIKE lower(?2)||' %')";
    // shortcut: ลดหน่วยลิมิตของแถวในรอบ 7 วันเหลือ 1e-12 (ไม่ใช่ 0 เพราะรายงานแยก "ใช้ผ่านแพลน" ด้วย units>0 · ต้นทุนจริง cost ไม่เปลี่ยน) ถ้าต้องเก็บประวัติรีเซ็ต ให้เพิ่มคอลัมน์ใน usage
    return (await env.DB.prepare(`UPDATE usage SET units=1e-12 WHERE user_id=?1 AND units>1e-12 AND created_at>=?3 AND ${sel}`).bind(uid, key, Date.now() - 7 * DAY).run()).meta?.changes ?? 0;
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET usage_reset_at=?, sess_start=NULL, week_start=NULL WHERE id=?').bind(Date.now(), uid),
    // สมาชิกทีมที่ใช้ลิมิตรวม: ลิมิตนับจากรอบของทีม จึงต้องเริ่มรอบทีมใหม่ด้วย (มีผลกับทั้งทีม)
    env.DB.prepare('UPDATE teams SET sess_start=NULL, week_start=NULL WHERE shared_pool=1 AND id IN (SELECT team_id FROM team_members WHERE user_id=?)').bind(uid),
  ]);
  return 1;
}
// สิทธิ์กดรีเซ็ตที่แอดมินแจก (ใช้แล้วหมดไป) · สร้างตารางเองครั้งแรก ไม่ต้องรัน migration
// reset_credits = สิทธิ์รีเซ็ต "ทั้งหมด" (นับจำนวน) · reset_grants = สิทธิ์ที่แอดมินกำหนดขอบเขตไว้ (ค่าย หรือโมเดลเดียว) แถวละ 1 สิทธิ์
export let creditsReady = false;
export async function creditsInit(env) {
  if (creditsReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS reset_credits (user_id INTEGER PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS reset_grants (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, vendor TEXT, model_id INTEGER, created_at INTEGER NOT NULL, expires_at INTEGER)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS reset_grants_user ON reset_grants(user_id)'),
    // ประวัติ: grant = แอดมินแจก · use = ผู้ใช้กดใช้ · direct = แอดมินรีเซ็ตให้ทันที
    env.DB.prepare('CREATE TABLE IF NOT EXISTS reset_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, scope TEXT, n INTEGER, expires_at INTEGER, by_email TEXT, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS reset_log_user ON reset_log(user_id, created_at)'),
  ]);
  try { await env.DB.prepare('ALTER TABLE reset_grants ADD COLUMN expires_at INTEGER').run(); } catch { /* มีคอลัมน์แล้ว */ }
  creditsReady = true;
}
export const logReset = async (env, uid, kind, scope, { n = 1, exp = null, by = null } = {}) => { await creditsInit(env); await env.DB.prepare('INSERT INTO reset_log (user_id,kind,scope,n,expires_at,by_email,created_at) VALUES (?,?,?,?,?,?,?)').bind(uid, kind, scope, n, exp, by, Date.now()).run(); };
// รายการสิทธิ์ของผู้ใช้ที่ยังไม่หมดอายุ แยกตามขอบเขต: [{k:'all'|'v:DeepSeek'|'m:12', label, n, exp}]
export async function creditList(env, uid) {
  await creditsInit(env);
  const now = Date.now();
  const [legacy, gs] = await Promise.all([
    env.DB.prepare('SELECT n FROM reset_credits WHERE user_id=?').bind(uid).first(),
    env.DB.prepare('SELECT g.vendor, g.model_id, m.name mname, COUNT(*) n, MIN(g.expires_at) exp FROM reset_grants g LEFT JOIN models m ON m.id=g.model_id WHERE g.user_id=? AND (g.expires_at IS NULL OR g.expires_at>?) GROUP BY g.vendor, g.model_id').bind(uid, now).all(),
  ]);
  const out = [];
  let all = { k: 'all', label: 'ทั้งหมด (ทุกโมเดล)', n: legacy?.n || 0, exp: null };
  for (const g of gs.results) {
    if (!g.vendor && !g.model_id) { all.n += g.n; all.exp = g.exp; } // ขอบเขตทั้งหมด
    else out.push(g.vendor ? { k: 'v:' + g.vendor, label: 'ค่าย ' + g.vendor, n: g.n, exp: g.exp } : { k: 'm:' + g.model_id, label: 'โมเดล ' + (g.mname || g.model_id), n: g.n, exp: g.exp });
  }
  return [...(all.n > 0 ? [all] : []), ...out];
}
export const creditsOf = async (env, uid) => (await creditList(env, uid)).reduce((a, x) => a + x.n, 0);
// ต้นทุนโดยประมาณของ 1 ข้อความทั่วไป (context 20K อยู่ใน cache, ส่งใหม่ 1K, ตอบ 1K) ใช้ประมาณจำนวนข้อความต่อสัปดาห์
export const msgCost = m => (20000 * m.cost_cache + 1000 * m.cost_in + 1000 * m.cost_out) / 1e6;
export const allowedModels = (env, planId) => env.DB.prepare(
  'SELECT m.id,m.name,m.provider,m.multiplier,m.vision,m.effort,m.effort_levels,m.cost_in,m.cost_out,m.cost_cache,m.cap_pct FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.active=1 AND m.provider<>\'embedding\' ORDER BY m.sort').bind(planId).all().then(r => r.results);
