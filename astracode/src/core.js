import { ART_TABLES } from './artifacts.js';
import { UF_TABLES } from './files.js';
import { SITE_TABLES } from './sites.js';
import { MEET_TABLES } from './meetings.js';
import { BOT_TABLES } from './bots.js';
import { event, getSettings, mail, mailBox, origin } from './billing.js';
import { projects } from './projects.js';
import { admin } from './admin.js';
import { CSP, sandboxed } from './worker.js';
import { totpOk } from './user.js';
import { v1 } from './api.js';
import { status } from './jobs.js';
// Kyber API (เดิม AstraCode) — Cloudflare Worker + D1 + R2
export const SYSTEM = 'You are Kyber, a helpful AI assistant developed by Hypatia. If asked what you are, say you are Kyber by Hypatia (formerly called AstraCode). Never name the API provider, proxy, gateway or reseller that serves you. Reply in the user\'s language. Use Markdown. Answer the point first, then the details; no long preamble. To analyze attached data (CSV, Excel, JSON), write ONE ```python block: the page has a Run button that executes it in the browser (Pyodide with pandas, numpy, matplotlib) with the attached files in the working folder under their names; an Excel sheet is the file <name without extension>__<sheet>.csv. Print the results and plot with matplotlib (do not call plt.show-only code paths that need a display). When you use attached files that have page or sheet markers (--- หน้า N ---), cite where each fact came from, e.g. (ไฟล์ report.pdf หน้า 12); if the answer is not in the files, say so instead of guessing. Match length to the question: short questions get short answers, but when asked to build, write or create something, deliver a complete, high-quality result. If you are unsure, say so; never invent numbers, quotes, sources or links. For math, money and logic, work step by step and check units before the final answer. If a request is ambiguous, take the most reasonable reading and say which one you took; ask only when a wrong guess would waste real work. You have no tools: never output JSON tool calls; if you really need the user to choose or decide something, end your reply with ONE block (use it only then, otherwise just proceed):\n```ask\nQuestion in one line?\n- Option 1\n- Option 2\n```\nGive 2-4 short options. The page shows them as buttons plus a box for a custom answer, so do not repeat the options in your text. When the user asks for a file (CSV, Excel, Markdown, HTML, JSON, code, Word…), put the whole file in one fenced code block whose info string is the language then file=<name.ext>, e.g. ```csv file=sales.csv — the page shows a download button. For a program or project with several files, write every file in full, each in its own block with file=<relative path> (folders allowed, e.g. file=myapp/main.py), plus a README with how to run it; the page offers them all as one .zip download. For Excel write CSV content with file=<name>.xlsx. For Word write a full HTML document with file=<name>.doc. For PDF write HTML with file=<name>.html and tell the user to print it to PDF. Write file names in English without spaces. When the user states a lasting personal fact or preference that is not already in the remembered list (name, job, preferred style or language, ongoing project), end your reply with ONE block, rarely and never for one-off requests:\n```remember\nOne short sentence in the user\'s language\n```\nThe page shows it as a button the user may tap to save it.';
export const SYSTEM_CODE = `You are Kyber Code, a senior software engineer (Kyber by Hypatia) working inside the user's project. Never name the API provider, proxy, gateway or reseller that serves you. Reply in the user's language and keep explanations short.
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
The project preview runs in a sandboxed browser frame: access to localStorage/sessionStorage/cookies may be blocked, so wrap storage reads in try/catch; there is no real server, no network to localhost and no Python http.server: build front-end projects that open from index.html (the user can publish them as a public website with the Publish button: use relative paths, keep index.html at the root, and for a contact/order form use <form method="post" action="__form"> or fetch('__form', {method:'POST', body: new FormData(form)}) — submissions land in the owner's inbox; published sites also get a built-in kyber object: await kyber.ai(prompt, {system, json}) returns an AI reply (json:true returns parsed JSON) and kyber.db.add(table, obj) / kyber.db.list(table) store and read small records — use them for chatbots, AI tools and guestbooks, wrap calls in try/catch, and note that these work only on the published site, not in the preview; never add password fields), and Python runs in the browser (Pyodide) without a server or webbrowser module. Code blocks without path= are treated as examples only. Only change files that need changing.
You can see the whole project. The file list is in the message. To look at files, write tool lines on their own and then STOP your reply; the results come back to you:
READ path=<relative path>   (full content of one file; up to 10 READ lines at once)
GREP <regex>                (search every file, returns path:line: text)
LIST <folder/>              (files under a folder, with sizes)
Every round costs the user waiting time: decide what you need first, then put ALL the READ / GREP / LIST lines in ONE reply (up to 10 READ lines) instead of one file per round, and do not read a file whose content you were already given. If the message has a [เนื้อหาไฟล์ในโปรเจกต์] block, it already contains the current content of every other file in this small project: do not READ those files.
The latest message may end with [เนื้อหาไฟล์ที่เปิดอยู่] (the current content of the file open in the editor, possibly cut) and the text the user has selected: both are current, so you need not READ that file again unless it was cut. If that block is NOT there, you have not seen any file content yet: never say you cannot see files or ask the user to paste them, use READ (or GREP/LIST) first. Read every file you need before editing it. Never guess what a file contains. Do not mix READ/GREP/LIST lines with path= blocks in the same reply.
To run a terminal command, write a line RUN <command> (up to 3 per reply) and then STOP; the output comes back in the next message. You may put path= blocks before RUN lines in the same reply: they are applied first. Commands run in a browser Node.js emulator (Node 20 APIs): npm install <pkg>, npm test, npm run <script>, node <file>.js, npx-style CLIs from node_modules/.bin, ls, cat, echo. Not available: git, python, pip, sudo, node -e, node -v, native addons. Use RUN to test your changes when the project has tests or runnable scripts.
How to work: understand the goal, READ the files involved, make a short plan, edit, then RUN the tests or the script and fix until it passes. For a bug, find the root cause (GREP the callers of the function before you change it) and fix it once in the shared code instead of patching the symptom. When changing existing code, make the smallest change that fully does the task: no features, options or refactors nobody asked for; reuse existing helpers and installed packages before writing new code. When building something new (a new project, game, page, 3D scene, visual or creative work), aim for a polished, impressive result: rich detail, good visual design, smooth interaction and the features a user would reasonably expect, not a bare minimum. Follow the project's existing style, names and structure. When a command fails, read the real error output and act on it; never guess, and never say the work is done while it still fails. For a big task, get a small working version first, then extend it.
Before you finish, re-read what you wrote: every import/require resolves to a real file or package, every function and variable you use is defined, brackets and quotes are balanced, JSON files are valid, and existing behavior you did not mean to change still works. Fix problems in the same reply; do not hand back code you have not checked. In the last line, say in one short sentence what you checked.`;
export const HISTORY = 20, HISTORY_CODE = 20; // ข้อความย้อนหลังที่ส่งให้โมเดล (โหมด Code เดิม 12 = ลืมงานที่ทำไปเร็ว · ส่วนที่ยาวเกิน context ถูกตัดด้วย fitContext อยู่แล้ว)
// จุดเริ่มของหน้าต่างประวัติ: ขยับทีละครึ่งหน้าต่าง (ไม่ใช่ทีละข้อความ) เพื่อให้ต้นข้อความที่ส่งโมเดลคงที่หลายเทิร์น prefix cache ถึงจะติด · ขนาดหน้าต่างอยู่ระหว่าง max/2 ถึง max
export const histStart = (count, max) => count > max ? Math.ceil((count - max) / (max / 2)) * (max / 2) : 0;
export const LOCK_MS = 45e3; // ล็อกตอบทีละข้อความ: ต่ออายุทุก 15 วินาทีระหว่างตอบ ถ้า Worker ถูกตัดกลางคัน (ผู้ใช้ปิดจอ) ล็อกหมดใน 45 วินาที
export const H4 = 4 * 3600e3, DAY = 864e5, BKK = 7 * 3600e3;
export const WALLET_MIN = 1; // ยอด Wallet ขั้นต่ำ (บาท) ที่ใช้โมเดลนอกแพลน / API / ใช้ต่อเมื่อลิมิตเต็มได้

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
// แบบเดียวกับ limited แต่คืนตัวนับและเวลารีเซ็ตด้วย (ใช้ทำหัว x-ratelimit-*) ในคำสั่งเดียว
export async function limitedInfo(env, key, max, ms) {
  const now = Date.now();
  const r = await env.DB.prepare(`INSERT INTO rate (key,n,reset) VALUES (?1,1,?2)
    ON CONFLICT(key) DO UPDATE SET n=CASE WHEN reset<?3 THEN 1 ELSE n+1 END, reset=CASE WHEN reset<?3 THEN ?2 ELSE reset END RETURNING n, reset`).bind(key, now + ms, now).first();
  return { over: r.n > max, n: r.n, reset: r.reset };
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
    if (u) await mail(env, u.email, 'Kyber: มีการเข้าสู่ระบบจากอุปกรณ์ใหม่', mailBox('เข้าสู่ระบบจากอุปกรณ์ใหม่', `${esc(ua || 'อุปกรณ์ไม่ทราบชนิด')}${ipc ? ' · ' + esc(ipc) : ''} เวลา ${new Date(now + BKK).toISOString().replace('T', ' ').slice(0, 16)} ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านและกด "ออกจากระบบทุกเครื่อง" ที่หน้าบัญชี`)).catch(() => {});
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
// อีเมลชั่วคราว (ใช้แล้วทิ้ง) สมัครไม่ได้ กันสมัครหลายบัญชีเพื่อใช้แพลนฟรี · แอดมินเพิ่มโดเมนได้ที่ settings.block_domains (คั่นด้วย , หรือขึ้นบรรทัด)
const TEMP_MAIL = 'guerrillamailblock.com guerrillamail.org guerrillamail.biz guerrillamail.de guerrillamail.info grr.la pokemail.net spam4.me 10minemail.com emailfake.com fakemail.net mailnesia.com mailcatch.com tempinbox.com burnermail.io inboxkitten.com mail.tm mailinator.com guerrillamail.com guerrillamail.net sharklasers.com 10minutemail.com 10minutemail.net temp-mail.org tempmail.com tempmail.net tempmailo.com throwawaymail.com yopmail.com yopmail.net getnada.com nada.email dispostable.com trashmail.com trashmail.net maildrop.cc mintemail.com mohmal.com emailondeck.com fakeinbox.com moakt.com tempr.email discard.email spamgourmet.com mailnesia.com mytemp.email tmpmail.org tmail.ws burnermail.io inboxkitten.com 1secmail.com 1secmail.net 1secmail.org emltmp.com tmpeml.com dropmail.me minuteinbox.com linshiyouxiang.net'.split(' ');
export async function tempEmail(env, email) {
  const d = email.split('@')[1] || '', extra = String(await env.DB.prepare("SELECT value FROM settings WHERE key='block_domains'").first().then(r => r?.value || '', () => '')).toLowerCase().split(/[\s,]+/).filter(Boolean);
  return [...TEMP_MAIL, ...extra].some(x => d === x || d.endsWith('.' + x)) || /guerrilla|tempmail|temp-mail|10minute|throwaway|disposable|trashmail|fakemail|burner|mailinator|yopmail/.test(d); // โดเมนเครือเดียวกันมีหลายชื่อ: ดักด้วยคำในชื่อด้วย
}
export async function emailAuth(req, env) {
  const b = await req.json(), a = b.action, email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
  if (['login', 'register', 'forgot', 'check'].includes(a) && !await turnstileOk(req, env, b.cf)) return err('ยืนยันว่าไม่ใช่บอทไม่สำเร็จ รีเฟรชหน้าแล้วลองใหม่', 400);
  if (await limited(env, 'fb:' + ip(req, env), 30, 900e3)) return err('ลองหลายครั้งเกินไป รอ 15 นาที', 429);
  try {
    if (a === 'forgot') { await fbApi(req, env, 'sendOobCode', { requestType: 'PASSWORD_RESET', email }).catch(x => { if (!x.known) throw x; }); return json({ ok: true }); } // ไม่บอกว่ามีอีเมลนี้ไหม
    if (!['login', 'register', 'check'].includes(a) || !email || !pw) return err('ใส่อีเมลและรหัสผ่าน');
    if (a === 'register' && pw.length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
    if (a === 'register' && await tempEmail(env, email)) return err('ใช้อีเมลชั่วคราวสมัครไม่ได้ ใช้อีเมลจริง หรือเข้าสู่ระบบด้วย Google', 400);
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
  if (u && u.fb_uid !== c.sub) await env.DB.prepare(`UPDATE users SET fb_uid=?, email_verified=1${u.email_verified ? '' : ', line_id=NULL'} WHERE id=?`).bind(c.sub, u.id).run(); // บัญชีที่สร้างจาก LINE ด้วยอีเมลที่ยังไม่ยืนยัน: เจ้าของอีเมลจริงยืนยันแล้ว ตัด LINE เดิมออก
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
// โปรเพิ่มลิมิตทั้งเว็บ (ตั้งในหลังบ้าน): promo_until = หมดเขต (ms), promo_x4h / promo_xweek = ตัวคูณลิมิตรอบ 4 ชม. / สัปดาห์ · เฉพาะแพลนเสียเงิน · แคช 60 วินาทีต่อ isolate
let boostCache = null;
export async function limitBoost(env) {
  if (boostCache && boostCache.db === env.DB && boostCache.exp > Date.now()) return boostCache.v;
  const s = await getSettings(env, ['promo_until', 'promo_x4h', 'promo_xweek', 'promo_label']), on = +s.promo_until > Date.now();
  const v = on ? { until: +s.promo_until, x4h: Math.max(1, +s.promo_x4h || 1), xweek: Math.max(1, +s.promo_xweek || 1), label: s.promo_label || '' } : null;
  boostCache = { db: env.DB, exp: Date.now() + 60e3, v }; return v;
}
export async function planOf(env, u) {
  if (await multiOn(env)) { const m = await planOfMulti(env, u); if (m) return m; }
  return boosted(env, await planOf0(env, u));
}
const boosted = async (env, p) => { const b = p?.price > 0 && !p.once && await limitBoost(env); return b && b.until > Date.now() ? Object.assign(p, { limit_4h: p.limit_4h * b.x4h, limit_week: p.limit_week * b.xweek, boost: b }) : p; }; // แพลนทดลอง (ซื้อได้ครั้งเดียว) ไม่ได้โปรเพิ่มลิมิต

// ---------- หลายแพลนต่อบัญชี (Multi-Plan) ----------
// แต่ละใบ = แถวใน subscriptions: ลิมิต 4 ชม./สัปดาห์ + นาฬิการอบของตัวเอง (usage.sub_id บอกว่าหักจากใบไหน)
// ฟีเจอร์ (Agent, Kyber Harness, Artifacts, API หักลิมิต, โมเดลฟรี) = รวมทุกใบที่ยังไม่หมด · users.plan_id/plan_expires = สำเนาของใบหลัก (โค้ด/หลังบ้านเดิมอ่านต่อได้)
// เปิดด้วย settings.multi_plan='1' · ปิด = ระบบเดิมทุกอย่าง (ใบที่ขายไปแล้วยังอยู่ในตาราง เปิดใหม่ใช้ต่อได้)
const SUBS_TABLE = 'CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, plan_id INTEGER NOT NULL, period TEXT, starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'active\', payment_id INTEGER, auto_renew INTEGER, sess_start INTEGER, week_start INTEGER, legacy INTEGER, created_at INTEGER NOT NULL)';
const SUBS_INDEX = 'CREATE INDEX IF NOT EXISTS subs_user ON subscriptions(user_id, expires_at)';
let multiCache = null, subsReady = null;
export async function multiOn(env) {
  if (multiCache?.db === env.DB && multiCache.exp > Date.now()) return multiCache.v;
  const v = (await env.DB.prepare("SELECT value FROM settings WHERE key='multi_plan'").first().catch(() => null))?.value === '1';
  multiCache = { db: env.DB, exp: Date.now() + 30e3, v }; return v;
}
export const resetMultiCache = () => { multiCache = null; };
export const ensureSubs = env => subsReady?.db === env.DB ? subsReady.p : (subsReady = { db: env.DB, p: (async () => {
  await env.DB.prepare(SUBS_TABLE).run(); await env.DB.prepare(SUBS_INDEX).run();
  for (const [t, c] of [['users', 'primary_sub_id'], ['usage', 'sub_id'], ['payments', 'sub_id']]) await env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${c} INTEGER`).run().catch(() => {});
})() }).p;
// ใบที่ยังใช้ได้ของผู้ใช้ (พร้อมข้อมูลแพลน) เรียงตามวันหมดอายุ · ย้ายแพลนเดิม (users.plan_id) เข้ามาเป็นใบแรกครั้งเดียว · แอดมินแก้ users.plan_* ตรง ๆ = แก้ใบหลักตาม
export async function subsOf(env, u, { sync = true } = {}) { // sync=false: เพิ่งแก้ใบเอง (ต่ออายุ/แอดมิน/คืนเงิน) ไม่ต้องดึงค่าจาก users.plan_* กลับมาทับ
  await ensureSubs(env); const now = Date.now();
  const list = async () => (await env.DB.prepare("SELECT s.*, s.id sid FROM subscriptions s WHERE s.user_id=? AND s.status='active' AND s.expires_at>? ORDER BY s.expires_at, s.id").bind(u.id, now).all()).results;
  let subs = await list();
  const up = await env.DB.prepare('SELECT plan_id, plan_expires, plan_period, primary_sub_id, sess_start, week_start, auto_renew FROM users WHERE id=?').bind(u.id).first() || {};
  if (up.plan_id && up.plan_expires > now) {
    const pl = await env.DB.prepare('SELECT price FROM plans WHERE id=?').bind(up.plan_id).first();
    const prim = subs.find(x => x.sid === up.primary_sub_id);
    if (pl && !subs.length) { // ไม่มีใบที่ใช้ได้แต่ users.plan_* ยังไม่หมด = แพลนเดิมก่อนมีหลายใบ (ครั้งแรก) หรือแอดมินให้แพลนแบบเดิม → รับเป็นใบหนึ่ง (legacy เฉพาะครั้งแรก): แพลนเดิมกลายเป็นใบที่ 1 (วันหมดอายุ/รอบลิมิตเดิม · การใช้งานเก่าที่ไม่มี sub_id นับเข้าใบนี้)
      const r = await env.DB.prepare('INSERT INTO subscriptions (user_id,plan_id,period,starts_at,expires_at,status,auto_renew,sess_start,week_start,legacy,created_at) VALUES (?,?,?,?,?,\'active\',?,?,?,?,?) RETURNING id').bind(u.id, up.plan_id, up.plan_period || 'month', now, up.plan_expires, up.auto_renew ? 1 : 0, up.primary_sub_id ? null : up.sess_start || null, up.primary_sub_id ? null : up.week_start || null, up.primary_sub_id ? 0 : 1, now).first();
      await env.DB.prepare('UPDATE users SET primary_sub_id=? WHERE id=?').bind(r.id, u.id).run(); subs = await list();
    } else if (sync && prim && (prim.plan_id !== up.plan_id || prim.expires_at !== up.plan_expires)) { // หลังบ้าน/ต่ออายุแบบเดิมแก้ users.plan_* → ใบหลักตาม
      await env.DB.prepare('UPDATE subscriptions SET plan_id=?, expires_at=? WHERE id=?').bind(up.plan_id, up.plan_expires, prim.sid).run(); subs = await list();
    }
  }
  if (subs.length && !subs.some(x => x.sid === up.primary_sub_id)) { await mirrorPrimary(env, u.id, subs[0]); } // ใบหลักหมดอายุ: ใบที่หมดก่อนถัดไปเป็นใบหลัก
  return subs.map(x => ({ ...x, primary: x.sid === up.primary_sub_id || (!subs.some(y => y.sid === up.primary_sub_id) && x === subs[0]) }));
}
// หลังปิด/คืนเงิน/แก้ใบ: ใบหลักใหม่ = ใบที่ยังใช้ได้ (ใบหลักเดิมก่อน) · ไม่เหลือใบ = users.plan_* หมดตาม (ไม่เรียก subsOf กันรับแพลนเดิมกลับมาเป็นใบ)
export async function resyncPrimary(env, uid) {
  const now = Date.now(), pid = (await env.DB.prepare('SELECT primary_sub_id p FROM users WHERE id=?').bind(uid).first())?.p;
  const left = (await env.DB.prepare("SELECT *, id sid FROM subscriptions WHERE user_id=? AND status='active' AND expires_at>? ORDER BY (id=?) DESC, expires_at").bind(uid, now, pid || 0).all()).results;
  if (left.length) return mirrorPrimary(env, uid, left[0]);
  await env.DB.prepare('UPDATE users SET plan_expires=? WHERE id=? AND plan_expires>?').bind(now, uid, now).run();
}
export async function mirrorPrimary(env, uid, sub) {
  await env.DB.prepare('UPDATE users SET primary_sub_id=?, plan_id=?, plan_expires=?, plan_period=? WHERE id=?').bind(sub.sid ?? sub.id, sub.plan_id, sub.expires_at, sub.period || 'month', uid).run();
}
// แพลนของใบหนึ่งใบ (พร้อมโปรเพิ่มลิมิต) · _sub = ใบที่หักลิมิต · _subs = ทุกใบ (ใช้เลือก/สลับใบ)
async function subPlan(env, sub, subs) {
  const p = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(sub.plan_id).first(); if (!p) return null;
  return Object.assign(await boosted(env, p), { _sub: sub, _subs: subs });
}
// ฟีเจอร์รวมทุกใบ: ได้ทุกอย่างที่ใบใดใบหนึ่งมี · โมเดลฟรีรวมกัน
async function unionFeatures(env, plan, subs) {
  if (subs.length < 2) { plan._planIds = [plan.id]; return plan; }
  const rows = (await env.DB.prepare(`SELECT * FROM plans WHERE id IN (${subs.map(() => '?').join(',')})`).bind(...subs.map(x => x.plan_id)).all()).results;
  for (const k of ['agent', 'cowork', 'artifacts', 'api_limit', 'sites']) if (rows.some(r => r[k])) plan[k] = Math.max(...rows.map(r => +r[k] || 0)) || 1;
  plan.free_models = JSON.stringify([...new Set(rows.flatMap(r => freeIds(r)))]);
  plan._planIds = [...new Set(rows.map(r => r.id))];
  return plan;
}
async function planOfMulti(env, u) {
  const subs = await subsOf(env, u); if (!subs.length) return null; // ไม่มีใบส่วนตัว: ทีม/ฟรี แบบเดิม
  const base = await planOf0(env, u); if (base?._team) return boosted(env, base); // แพลนทีมดีกว่าใบหลัก: ใช้ทีมแบบเดิม (ระบบหลายใบใช้กับแพลนส่วนตัว)
  const prim = subs.find(x => x.primary) || subs[0];
  return unionFeatures(env, await subPlan(env, prim, subs), subs);
}
// สถานะทุกใบ (หน้าบัญชี / แผ่นลิมิต): ชื่อ วันหมดอายุ ใบหลัก ต่ออายุอัตโนมัติ และ % ลิมิตของแต่ละใบ
export async function subsStatus(env, u, plan) {
  const subs = plan?._subs; if (!subs?.length) return null;
  return Promise.all(subs.map(async s => { const p = await subPlan(env, s, subs); const st = p ? await usageStatus(env, u, p) : {}; return { id: s.sid, plan_id: s.plan_id, name: p?.name || '?', price: p?.price || 0, expires: s.expires_at, period: s.period, primary: !!s.primary, auto_renew: !!s.auto_renew, ...st }; }));
}
// เลือกใบที่จะหักลิมิตสำหรับโมเดลนี้: ใบที่ผู้ใช้เลือก → ใบหลัก → ใบที่หมดอายุก่อน · ใบเต็มสลับไปใบถัดไปเอง · ไม่มีใบไหนว่าง = คืนใบแรกที่มีสิทธิ์ (ผู้เรียกจัดการลิมิตเต็ม/Wallet ตามเดิม)
export async function pickBucket(env, u, plan, modelId, subId = null) {
  const subs = plan?._subs; if (!subs?.length || modelId == null) return plan;
  const ids = [...new Set(subs.map(x => x.plan_id))];
  const ok = new Set((await env.DB.prepare(`SELECT plan_id FROM plan_models WHERE model_id=? AND plan_id IN (${ids.map(() => '?').join(',')})`).bind(+modelId, ...ids).all()).results.map(r => r.plan_id));
  const planRows = new Map((await env.DB.prepare(`SELECT id, free_models FROM plans WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results.map(r => [r.id, r]));
  const fits = s => ok.has(s.plan_id) || freeIds(planRows.get(s.plan_id)).includes(+modelId);
  const order = [...subs.filter(s => +subId && s.sid === +subId), ...subs.filter(s => s.primary && s.sid !== +subId), ...subs.filter(s => !s.primary && s.sid !== +subId)].filter(fits);
  if (!order.length) return plan;
  let first = null;
  for (const s of order) {
    const p = await unionFeatures(env, await subPlan(env, s, subs), subs); if (!p) continue; first ||= p;
    const st = await usageStatus(env, u, p); if (st.pct4h < 100 && st.pctWeek < 100) return p;
  }
  return first || plan;
}
let freeCache = null;
async function planOf0(env, u) {
  const now = Date.now();
  // แพลนส่วนตัวกับแพลนทีมอ่านพร้อมกัน (ไม่ขึ้นต่อกัน) ลดเวลารอฐานข้อมูลก่อนเริ่มตอบ
  const [personal, tm] = await Promise.all([
    u.plan_id && u.plan_expires > now ? env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(u.plan_id).first() : null,
    env.DB.prepare(`SELECT t.id tid,t.name tname,t.owner_id,t.expires,t.invite_code,t.max_seats,t.shared_pool tshared,tm.role trole,tm.api_off tapioff,p.*
    FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN plans p ON p.id=t.plan_id
    WHERE tm.user_id=? AND t.expires>? ORDER BY p.limit_week DESC, t.expires DESC LIMIT 1`).bind(u.id, now).first().catch(() => null),
  ]);
  if (tm && (!personal || tm.limit_week >= personal.limit_week)) {
    tm._team = { id: tm.tid, name: tm.tname, owner_id: tm.owner_id, expires: tm.expires, invite_code: tm.invite_code, max_seats: tm.max_seats, shared_pool: !!tm.tshared, role: tm.trole, api_off: !!tm.tapioff };
    return tm;
  }
  if (personal) return personal;
  // แพลนฟรีแทบไม่เปลี่ยน: จำไว้ 30 วิ ต่อ isolate (ผู้ใช้แพลนฟรี/จ่ายจาก Wallet ไม่ต้องรอฐานข้อมูลเพิ่มอีกรอบ) · คืนสำเนา เพราะผู้เรียกแก้ค่าในวัตถุได้
  if (!(freeCache?.db === env.DB && freeCache.exp > now)) freeCache = { db: env.DB, exp: now + 30e3, v: await env.DB.prepare('SELECT * FROM plans WHERE price=0 AND active=1 ORDER BY sort LIMIT 1').first() };
  return freeCache.v && { ...freeCache.v };
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
  if (plan?._sub) { // หลายแพลน: นับเฉพาะการใช้งานของใบนี้ (ใบที่ย้ายมาจากแพลนเดิมนับการใช้งานเก่าที่ไม่มี sub_id ด้วย)
    const s = await env.DB.prepare(`SELECT sess_start, week_start, legacy,
        (SELECT COALESCE(SUM(units),0) FROM usage WHERE user_id=?1 AND (sub_id=?2 OR (sub_id IS NULL AND subscriptions.legacy=1)) AND created_at>=subscriptions.sess_start) u4,
        (SELECT COALESCE(SUM(units),0) FROM usage WHERE user_id=?1 AND (sub_id=?2 OR (sub_id IS NULL AND subscriptions.legacy=1)) AND created_at>=subscriptions.week_start) uw
      FROM subscriptions WHERE id=?2`).bind(u.id, plan._sub.sid ?? plan._sub.id).first() || {};
    const s4 = s.sess_start && now < s.sess_start + H4 && s.sess_start >= r0 ? s.sess_start : null, sw = s.week_start && now < s.week_start + 7 * DAY && s.week_start >= r0 ? s.week_start : null;
    const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 1000) / 10) : 100;
    return win4(plan, { pct4h: pct(s4 ? s.u4 || 0 : 0, plan.limit_4h), pctWeek: pct(sw ? s.uw || 0 : 0, plan.limit_week), reset4h: s4 && s4 + H4, resetWeek: sw && sw + 7 * DAY, sub_id: plan._sub.sid ?? plan._sub.id });
  }
  // รอบเวลา + ยอดใช้ในรอบ อ่านในคำสั่งเดียว (เดิมสองรอบไป-กลับ) · อ่านรอบใหม่เสมอ เพราะเพิ่งอาจเริ่มรอบตอนบันทึกการใช้งาน
  const w = await env.DB.prepare(`SELECT sess_start, week_start,
      (SELECT COALESCE(SUM(units),0) FROM usage WHERE user_id=?1 AND created_at>=users.sess_start) u4,
      (SELECT COALESCE(SUM(units),0) FROM usage WHERE user_id=?1 AND created_at>=users.week_start) uw
    FROM users WHERE id=?1`).bind(u.id).first() || {};
  const s4 = w.sess_start && now < w.sess_start + H4 && w.sess_start >= r0 ? w.sess_start : null, sw = w.week_start && now < w.week_start + 7 * DAY && w.week_start >= r0 ? w.week_start : null;
  const r = { u4: s4 ? w.u4 || 0 : 0, uw: sw ? w.uw || 0 : 0 };
  const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 1000) / 10) : 100;
  return win4(plan, { pct4h: pct(r.u4, plan.limit_4h), pctWeek: pct(r.uw, plan.limit_week), reset4h: s4 && s4 + H4, resetWeek: sw && sw + 7 * DAY });
}
// แพลนที่ปิดรอบ 4 ชม. (use_4h=0): ไม่นับ/ไม่บล็อกด้วยรอบ 4 ชม. เหลือแค่รอบสัปดาห์ · use4h ให้หน้าเว็บซ่อนมิเตอร์
export const win4 = (plan, st) => plan?.use_4h === 0 ? { ...st, pct4h: 0, reset4h: null, use4h: false } : { ...st, use4h: true };
// คอลัมน์ที่เพิ่มทีหลัง: เพิ่มเองครั้งแรกต่อ isolate (ไม่ต้องรัน migrate-19 ด้วยมือ)
export let colsDone;
// เดิมสั่ง ALTER ทีละคำสั่งทุกครั้งที่ isolate เริ่ม (13 รอบไป-กลับ D1 ก่อนตอบคำขอแรก) ตอนนี้ถามโครงสร้างครั้งเดียวแล้วเพิ่มเฉพาะที่ขาด
const NEW_COLS = [['chats', 'has_code', 'INTEGER'], ['projects', 'gh_skipped', 'TEXT'], ['plans', 'min_margin', 'REAL'], ['plans', 'compare', 'TEXT'], ['plans', 'cowork', 'INTEGER'], ['chats', 'task', 'INTEGER'], ['plans', 'per_seat', 'INTEGER'], ['payments', 'seats', 'INTEGER'], ['folders', 'team_id', 'INTEGER'], ['teams', 'domain', 'TEXT'], ['artifacts', 'gallery', 'INTEGER'], ['users', 'no_report', 'INTEGER'], ['users', 'cc_first', 'INTEGER'], ['plans', 'free_models', 'TEXT'], ['skills', 'plugin', 'TEXT'], ['mcp_servers', 'connector', 'TEXT'], ['mcp_servers', 'auto', 'INTEGER'], ['mcp_servers', 'oauth_enc', 'TEXT'], ['mcp_servers', 'perms_json', 'TEXT'], ['mcp_servers', 'last_error', 'TEXT'], ['users', 'auto_memory', 'INTEGER'], ['usage', 'prep', 'INTEGER'], ['models', 'tools', 'TEXT'], ['api_keys', 'ip_allow', 'TEXT'], ['plans', 'use_4h', 'INTEGER'], ['models', 'use_mult', 'REAL'], ['models', 'promo_mult', 'REAL'], ['team_members', 'cap_pct', 'REAL'], ['team_members', 'api_off', 'INTEGER'], ['models', 'first_token_s', 'REAL'], ['models', 'idle_s', 'REAL'], ['models', 'ctx_k', 'REAL'], ['models', 'long_k', 'REAL'], ['models', 'long_in', 'REAL'], ['models', 'long_out', 'REAL'], ['models', 'req_cap', 'INTEGER'], ['api_keys', 'expires_at', 'INTEGER'], ['users', 'webhook_url', 'TEXT'], ['users', 'auto_compact', 'INTEGER'], ['users', 'totp_last', 'INTEGER'], ['chats', 'deleted_at', 'INTEGER'], ['chats', 'archived', 'INTEGER'], ['skills', 'as_text', 'INTEGER'], ['skills', 'model_id', 'INTEGER'], ['users', 'bill_info', 'TEXT'], ['usage', 'ms', 'INTEGER'], ['posts', 'changelog', 'INTEGER'], ['models', 'new_until', 'INTEGER'], ['models', 'sys_prompt', 'TEXT'], ['plans', 'days', 'INTEGER'], ['plans', 'once', 'INTEGER'], ['users', 'wallet_day_cap', 'REAL'], ['payments', 'review', 'INTEGER'], ['folders', 'instructions', 'TEXT'], ['folders', 'files', 'TEXT'], ['messages', 'starred', 'INTEGER'], ['messages', 'tcr', 'INTEGER'], ['messages', 'applied', 'TEXT'], ['messages', 'tcw', 'INTEGER'], ['messages', 'tctx', 'INTEGER'], ['users', 'vercel_token', 'TEXT'], ['chats', 'instructions', 'TEXT'], ['usage', 'ttft', 'INTEGER'], ['usage', 'src', 'TEXT'], ['usage', 'charge', 'REAL'], ['projects', 'featured', 'INTEGER'], ['projects', 'blurb', 'TEXT'], ['projects', 'env_sealed', 'TEXT'], ['users', 'digest_off', 'INTEGER'], ['projects', 'slug', 'TEXT'], ['skills', 'share_token', 'TEXT'], ['models', 'bill', 'TEXT'], ['models', 'req_cost', 'REAL'], ['models', 'req_price', 'REAL'], ['sessions', 'created_at', 'INTEGER'], ['sessions', 'ua', 'TEXT'], ['sessions', 'ip', 'TEXT'], ['sessions', 'admin_ok', 'INTEGER'], ['projects', 'share_token', 'TEXT'], ['models', 'cats', 'TEXT'], ['usage', 'flag', 'TEXT'], ['usage', 'pack', 'REAL'], ['plans', 'agent', 'INTEGER'], ['users', 'agent_pack_from', 'INTEGER'], ['users', 'agent_pack_until', 'INTEGER'], ['users', 'agent_pack_units', 'REAL'], ['api_log', 'tcr', 'INTEGER'], ['api_log', 'ttft', 'INTEGER'], ['api_log', 'req_model', 'TEXT'], ['users', 'primary_sub_id', 'INTEGER'], ['usage', 'sub_id', 'INTEGER'], ['payments', 'sub_id', 'INTEGER'], ['plans', 'sites', 'INTEGER'], ['sites', 'ai_on', 'INTEGER'], ['sites', 'ai_model', 'INTEGER'], ['sites', 'ai_day', 'INTEGER'], ['sites', 'db_public', 'TEXT']];
const API_LOG = 'CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER NOT NULL, user_id INTEGER NOT NULL, path TEXT, model TEXT, req_model TEXT, status INTEGER, tin INTEGER, tout INTEGER, tcr INTEGER, ttft INTEGER, charge REAL, ms INTEGER, err TEXT, created_at INTEGER NOT NULL)';
const PAY_UQ = ["CREATE UNIQUE INDEX IF NOT EXISTS payments_slip_key_uq ON payments(slip_key) WHERE slip_key LIKE 'slip/%'", "CREATE UNIQUE INDEX IF NOT EXISTS payments_slip_ref_uq ON payments(slip_ref) WHERE slip_ref IS NOT NULL AND status<>'rejected'", "CREATE UNIQUE INDEX IF NOT EXISTS wallet_first_bonus_uq ON wallet_tx(user_id) WHERE kind='first_bonus'"]; // โบนัสเติมเงินครั้งแรกได้ครั้งเดียวต่อบัญชี แม้อนุมัติสองรายการพร้อมกัน
// โปรเจกต์ที่ผู้ใช้เข้าถึงได้: เจ้าของ หรือสมาชิกที่ถูกเชิญให้แก้ (owner = true เฉพาะเจ้าของ)
export const projectFor = async (env, pid, uid) => { const p = await env.DB.prepare('SELECT * FROM projects p WHERE id=?1 AND user_id=?2').bind(pid, uid).first(); return p && { ...p, owner: p.user_id === uid }; };
// โมเดลฟรีไม่จำกัดของแพลน (plans.free_models = JSON [model_id]) · ไม่หักลิมิต แต่จำกัด FREE_DAY_CAP ข้อความ/วัน/โมเดล กันใช้เกินควร
export const FREE_DAY_CAP = 500, FREE_CTX = 100e3; // ข้อความที่ context ตั้งแต่ 100K token (ราคาขั้นที่ 2 แพงขึ้น 5 เท่า) หักลิมิตตามปกติ
export const freeIds = plan => { try { const a = JSON.parse(plan?.free_models || '[]'); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; } };
export const isFreeModel = (plan, id) => !!plan && freeIds(plan).includes(+id);
// ดัชนีที่คำสั่งถี่ๆ ต้องใช้ (เดิมสแกนทั้งตาราง) + ธง has_code ของแชต (ทริกเกอร์ตั้งให้ตอนบันทึกข้อความ แทนการค้น ``` ในทุกข้อความทุกครั้งที่โหลดรายการแชต)
const PERF = [
  'CREATE INDEX IF NOT EXISTS usage_time ON usage(created_at)', // ต้นทุนรวมทั้งระบบ 1 ชม. (costWatch), หลังบ้าน, cron
  'CREATE INDEX IF NOT EXISTS usage_user_model ON usage(user_id, model_id, created_at)', // เพดานโมเดล/คำขอ/โมเดลฟรีต่อวัน (ทุกข้อความ)
  'CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id, status)',
  'CREATE INDEX IF NOT EXISTS users_google ON users(google_id) WHERE google_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS users_line ON users(line_id) WHERE line_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS users_ref ON users(ref_code)',
  'CREATE INDEX IF NOT EXISTS chats_project ON chats(project_id) WHERE project_id IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys(user_id)',
  "CREATE TRIGGER IF NOT EXISTS messages_has_code AFTER INSERT ON messages WHEN instr(NEW.content, '```') > 0 BEGIN UPDATE chats SET has_code=1 WHERE id=NEW.chat_id AND has_code IS NOT 1; END",
  "CREATE TRIGGER IF NOT EXISTS messages_has_code_upd AFTER UPDATE OF content ON messages WHEN instr(NEW.content, '```') > 0 BEGIN UPDATE chats SET has_code=1 WHERE id=NEW.chat_id AND has_code IS NOT 1; END",
  "UPDATE chats SET has_code=1 WHERE has_code IS NULL AND id IN (SELECT DISTINCT chat_id FROM messages WHERE instr(content, '```') > 0)", // เติมย้อนหลังครั้งเดียว
];
// เพิ่มเมื่อแก้ NEW_COLS / PERF / ตารางที่สร้างเอง: isolate ใหม่เห็นเลขตรงกันแล้วข้ามทั้งหมด (เดิมสั่ง CREATE ~15 คำสั่งทีละรอบทุก isolate ก่อนตอบคำขอแรก)
export const SCHEMA_VER = '2026-11-25e';
export const ensureCols = env => colsDone ||= (async () => {
  try { if ((await env.DB.prepare("SELECT value FROM settings WHERE key='schema_ver'").first())?.value === SCHEMA_VER) return; } catch { /* ยังไม่มีตาราง settings: ทำต่อ */ }
  let todo = NEW_COLS.map(([t, c, ty]) => `ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`), apiLog = true;
  try {
    const rows = (await env.DB.prepare("SELECT m.name t, p.name c FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name IN ('teams','artifacts','mcp_servers','api_keys','plans','models','team_members','sessions','projects','skills','users','chats','api_log','usage','posts','messages','payments','folders','sites')").all()).results;
    const has = new Set(rows.map(r => r.t + '.' + r.c));
    const tables = new Set(rows.map(r => r.t));
    todo = NEW_COLS.filter(([t, c]) => !has.has(t + '.' + c) && (t !== 'sites' || tables.has(t))).map(([t, c, ty]) => `ALTER TABLE ${t} ADD COLUMN ${c} ${ty}`); // ตาราง sites ยังไม่มี: CREATE ใน SITE_TABLES มีคอลัมน์ครบแล้ว
    apiLog = !rows.some(r => r.t === 'api_log');
  } catch { /* ถามโครงสร้างไม่ได้: ใช้วิธีเดิม ลองเพิ่มทุกคอลัมน์ */ }
  if (apiLog) {
    // สร้างตารางก่อน: อย่าสั่ง ALTER api_log ตอนที่ตารางยังไม่มี
    todo = todo.filter(q => !/^ALTER TABLE api_log /.test(q));
    todo.push(API_LOG, 'CREATE INDEX IF NOT EXISTS api_log_key ON api_log(key_id, id)');
  }
  todo.push(...PAY_UQ, ...ART_TABLES, ...UF_TABLES, 'CREATE TABLE IF NOT EXISTS team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, user_id INTEGER, action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL)', 'CREATE INDEX IF NOT EXISTS team_log_team ON team_log(team_id, id)'); // ถ้ามีข้อมูลซ้ำอยู่แล้วคำสั่งจะล้ม (ถูก catch ด้านล่าง) · ตรวจซ้ำที่หลังบ้านแล้วค่อยสร้างเอง
  todo.push(...PERF, SUBS_TABLE, SUBS_INDEX, ...SITE_TABLES, ...MEET_TABLES, ...BOT_TABLES);
  let ok = true;
  for (const q of todo) try { await env.DB.prepare(q).run(); } catch (e) { if (!/duplicate column|already exists/i.test(e.message)) { ok = false; console.log('ensureCols', q.slice(0, 80), e.message); } } // มีอยู่แล้ว = ปกติ
  if (ok) await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('schema_ver',?)").bind(SCHEMA_VER).run().catch(() => {}); // มีคำสั่งล้ม (เช่นดัชนี unique ชนข้อมูลซ้ำ): ไม่จำเลข ลองใหม่ใน isolate ถัดไป
})();
// ตัวคูณหน่วยลิมิตของโมเดล: ช่วงโปรใช้ promo_mult (ถ้าตั้ง) ไม่งั้นใช้ use_mult · ว่าง = 1
export const limMult = (m, now = Date.now()) => { const inPromo = (m.promo_pct > 0 || m.promo_mult != null) && (!m.promo_start || m.promo_start <= now) && (!m.promo_end || now <= m.promo_end), v = inPromo && m.promo_mult != null ? m.promo_mult : m.use_mult; return v != null && v >= 0 ? +v : 1; };
// ข้อความแรกหลังรอบเก่าจบ = เริ่มรอบใหม่
export async function touchWindows(env, uid, now = Date.now(), plan = null) {
  await env.DB.prepare(`UPDATE users SET
    sess_start=CASE WHEN sess_start IS NULL OR sess_start+?2<=?1 OR sess_start<usage_reset_at THEN ?1 ELSE sess_start END,
    week_start=CASE WHEN week_start IS NULL OR week_start+?3<=?1 OR week_start<usage_reset_at THEN ?1 ELSE week_start END WHERE id=?4`).bind(now, H4, 7 * DAY, uid).run();
  if (plan?._sub) { // หลายแพลน: เริ่มรอบของใบที่ถูกหัก (ใบอื่นไม่เสียรอบ)
    await env.DB.prepare(`UPDATE subscriptions SET
      sess_start=CASE WHEN sess_start IS NULL OR sess_start+?2<=?1 OR sess_start<?5 THEN ?1 ELSE sess_start END,
      week_start=CASE WHEN week_start IS NULL OR week_start+?3<=?1 OR week_start<?5 THEN ?1 ELSE week_start END WHERE id=?4`).bind(now, H4, 7 * DAY, plan._sub.sid ?? plan._sub.id, (await env.DB.prepare('SELECT usage_reset_at r FROM users WHERE id=?').bind(uid).first())?.r || 0).run();
  }
  if (plan?._team?.shared_pool) {
    await env.DB.prepare(`UPDATE teams SET
      sess_start=CASE WHEN sess_start IS NULL OR sess_start+?2<=?1 THEN ?1 ELSE sess_start END,
      week_start=CASE WHEN week_start IS NULL OR week_start+?3<=?1 THEN ?1 ELSE week_start END WHERE id=?4`).bind(now, H4, 7 * DAY, plan._team.id).run();
  }
}
// เพดานโมเดลระดับบน: ใช้ได้ไม่เกิน cap_pct % ของงบสัปดาห์ (เช่น Opus 50%)
// เพดานจำนวนคำขอของโมเดล (req_cap ครั้งต่อผู้ใช้ต่อ 4 ชม.) นับจากแถว usage
export async function reqCapHit(env, u, m) {
  if (!(m.req_cap > 0)) return false;
  return (await env.DB.prepare('SELECT COUNT(*) n FROM usage WHERE user_id=? AND model_id=? AND created_at>?').bind(u.id, m.id, Date.now() - H4).first()).n >= m.req_cap;
}
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
// ประมาณ token: ตัวอักษรละติน/ตัวเลข ~4 ตัวต่อ token, ภาษาไทยและอักษรอื่น ~1.5 ตัวต่อ token (BPE แตกภาษาไทยละเอียดกว่ามาก)
export const estTokens = s => { s = String(s || ''); const ascii = s.replace(/[^\x00-\x7f]/g, '').length; return Math.ceil(ascii / 4 + (s.length - ascii) / 1.5); };
// ขนาด context ของโมเดล (token) · ตั้งต่อโมเดลในหลังบ้าน (ctx_k = พัน token) ไม่ตั้ง = 128k
export const ctxMax = m => (m?.ctx_k > 0 ? m.ctx_k : 128) * 1000;
// รูปในข้อความ (image_url / image) นับเหมาตัวละ ~1,600 token ตามจริงของผู้ให้บริการ · เดิมนับความยาว base64 ทั้งก้อน (รูปเดียว = หลายแสน token) ทำให้ประวัติถูกตัดทิ้งเกินจริง
const partTok = p => p?.type === 'text' ? estTokens(p.text) : p?.type === 'image_url' || p?.type === 'image' || p?.type === 'input_image' ? 1600 : estTokens(JSON.stringify(p ?? ''));
const msgTok = x => (typeof x.content === 'string' ? estTokens(x.content) : Array.isArray(x.content) ? x.content.reduce((a, p) => a + partTok(p), 0) : estTokens(JSON.stringify(x.content ?? ''))) + (x.tool_calls ? estTokens(JSON.stringify(x.tool_calls)) : 0) + 4;
// ให้ system + ข้อความพอดี context: ทิ้งข้อความเก่าสุดก่อน (ข้อความแรกต้องเป็นของผู้ใช้) ถ้ายังเกินค่อยตัดเนื้อหาที่ยาวสุด · เผื่อที่ให้คำตอบ 15% (ไม่เกิน 16k)
export function fitContext(system, msgs, max) {
  const budget = max - Math.min(16000, max * 0.15) - estTokens(system);
  let list = [...msgs], sizes = list.map(msgTok), total = sizes.reduce((a, b) => a + b, 0), trimmed = false;
  while (total > budget && list.length > 1) {
    total -= sizes.shift(); list.shift(); trimmed = true;
    while (list.length > 1 && list[0].role !== 'user') { total -= sizes.shift(); list.shift(); }
  }
  while (total > budget) { // เหลือข้อความที่ยาวมากเกินเอง: ตัดเนื้อหาข้อความที่ยาวสุด
    let k = -1; list.forEach((x, i) => { if (typeof x.content === 'string' && (k < 0 || sizes[i] > sizes[k])) k = i; });
    if (k < 0 || sizes[k] < 50) break;
    const x = list[k], keep = Math.max(0, Math.floor(x.content.length * Math.max(0, sizes[k] - (total - budget) - 20) / sizes[k]));
    list[k] = { ...x, content: x.content.slice(0, keep) + '\n\n[...ตัดส่วนที่เหลือออกเพราะยาวเกิน context ของโมเดล]' };
    total += msgTok(list[k]) - sizes[k]; sizes[k] = msgTok(list[k]); trimmed = true;
    if (keep === 0) break;
  }
  return { msgs: list, used: Math.round(total + estTokens(system)), trimmed };
}
// คิดเงินแบบใดแบบหนึ่งต่อโมเดล ไม่ผสม: bill='request' (และตั้ง req_cost แล้ว) = เหมาต่อ request · อื่นๆ = ตาม token
export const flat = m => m.bill === 'request' && m.req_cost > 0;
export const msgCost = m => flat(m) ? m.req_cost : (20000 * m.cost_cache + 1000 * m.cost_in + 1000 * m.cost_out) / 1e6;
// โมเดลที่จ่ายจาก Wallet ได้ (สาธารณะ เปิดอยู่ มีคีย์) รูปแบบเดียวกับ allowedModels
export const walletModels = env => env.DB.prepare("SELECT id,name,provider,multiplier,vision,effort,effort_levels,cost_in,cost_out,cost_cache,cap_pct,key_name,ctx_k,new_until,note,cats FROM models WHERE active=1 AND public=1 AND provider<>'embedding' ORDER BY sort,id").all()
  .then(r => r.results.filter(m => env[m.key_name]).map(({ key_name, ...m }) => m));
export const allowedModels = (env, planId) => { const ids = [...new Set([].concat(planId).filter(x => x != null))]; return env.DB.prepare( // planId = id เดียว หรือหลาย id (หลายแพลน: รวมโมเดลทุกใบ)
  'SELECT DISTINCT m.id,m.name,m.provider,m.multiplier,m.vision,m.effort,m.effort_levels,m.cost_in,m.cost_out,m.cost_cache,m.cap_pct,m.key_name,m.ctx_k,m.new_until,m.note,m.cats FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id IN (' + (ids.map(() => '?').join(',') || 'NULL') + ') AND m.active=1 AND m.provider<>\'embedding\' ORDER BY m.sort,m.id').bind(...ids).all()
  .then(r => r.results.filter(m => env[m.key_name]).map(({ key_name, ...m }) => m)); }; // ซ่อนโมเดลที่ Worker ยังไม่มีคีย์ (เรียกไปก็ error)
