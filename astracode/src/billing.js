import { grantClaudeCredit } from './credits.js';
import { DAY, err, flat, hex, json, limited, mirrorPrimary, multiOn, rand, sha, slipPut, subsOf, unlimit, userErr, viaProxy } from './core.js';
import { b64 } from './projects.js';
import { status } from './jobs.js';
// ---------- slip ----------
export async function getSetting(env, k) { return (await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(k).first())?.value || ''; }
export async function getSettings(env, keys) {
  const rows = (await env.DB.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => '?')})`).bind(...keys).all()).results;
  return Object.fromEntries(keys.map(k => [k, rows.find(r => r.key === k)?.value || '']));
}
export const r4 = v => Math.round(v * 10000) / 10000;
export const promoOn = (m, now = Date.now()) => m.promo_pct > 0 && (!m.promo_start || m.promo_start <= now) && (!m.promo_end || now <= m.promo_end);
// ราคาขาย/1M token: ตั้งเอง หรือ ทุน + markup; base = ก่อนหักโปร
// คำต้องห้ามที่แอดมินตั้ง (คั่นด้วย , หรือขึ้นบรรทัดใหม่): กันเนื้อหาที่ทำให้คีย์ upstream โดนแบน · เทียบแบบไม่สนตัวพิมพ์
export async function blockedText(env, text, preset) { // preset = ค่า block_words ที่อ่านมาแล้ว (ไม่ต้องอ่านซ้ำ)
  const words = String((preset ?? await getSetting(env, 'block_words')) || '').split(/[,\n]/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 2);
  if (!words.length) return false; const t = String(text || '').toLowerCase();
  return words.some(w => t.includes(w));
}
export async function priceOf(env, m, base, markup) { // markup = ค่า price_markup ที่อ่านมาแล้ว (ไม่ต้องอ่านซ้ำ)
  const mk = +(markup ?? await getSetting(env, 'price_markup')) || 0, off = !base && promoOn(m) ? 1 - Math.min(m.promo_pct, 100) / 100 : 1;
  const p = (v, c) => r4((v ?? c * (1 + mk / 100)) * off);
  return { in: p(m.price_in, m.cost_in), out: p(m.price_out, m.cost_out), cache: p(m.price_cache, m.cost_cache), write: p(m.price_cache_write, m.cost_cache_write), req: flat(m) ? p(m.req_price, m.req_cost) : 0 }; // req > 0 = คิดเหมาต่อ request
}
export async function walletAdd(env, uid, amount, kind, ref) {
  const r = await env.DB.prepare('UPDATE users SET balance=ROUND(balance+?,4) WHERE id=? RETURNING balance').bind(amount, uid).first();
  await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(uid, amount, r?.balance ?? 0, kind, ref ?? null, Date.now()).run();
  return r?.balance;
}
// อีเมล (Resend) และแจ้งเตือนแอดมิน (Discord webhook / LINE Messaging API)
export const mailBox = (title, body, btn, link) => `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:28px;background:#000;color:#f5f5f7;border-radius:20px"><h2 style="margin:0 0 12px">${title}</h2><p style="color:#c7c7cc;line-height:1.6">${body}</p>${btn ? `<a href="${link}" style="display:inline-block;margin-top:12px;background:#0071e3;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">${btn}</a>` : ''}<p style="color:#86868b;font-size:12px;margin-top:28px">Kyber · สร้างโดย Hypatia</p></div>`;
export async function mail(env, to, subject, html) {
  if (!env.RESEND_KEY || !to || to.endsWith('.local')) return false;
  const from = (await getSetting(env, 'mail_from')) || 'Kyber by Hypatia <onboarding@resend.dev>';
  try { return (await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_KEY }, body: JSON.stringify({ from, to, subject, html }) })).ok; }
  catch { return false; }
}
export async function notify(env, text) {
  const s = await getSettings(env, ['alert_discord', 'alert_line_to']), jobs = [];
  if (s.alert_discord) jobs.push(fetch(s.alert_discord, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) })); // กันข้อความผู้ใช้ปิง @everyone
  // แอดมินที่เปิดแจ้งเตือนในเครื่องไว้: ได้ push ด้วย (สลิปรอตรวจ, โมเดลล่ม, ticket ใหม่ ฯลฯ)
  jobs.push(env.DB.prepare("SELECT id FROM users WHERE role='admin'").all().then(async r => { const { sendPush } = await import('./push.js'); for (const a of r.results) await sendPush(env, a.id, { title: 'Kyber แอดมิน', body: text.slice(0, 280), url: '/admin' }); }));
  if (env.LINE_ALERT_TOKEN && s.alert_line_to) jobs.push(fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LINE_ALERT_TOKEN }, body: JSON.stringify({ to: s.alert_line_to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) }));
  await Promise.allSettled(jobs);
}
export async function event(env, kind, model_id, detail) {
  await env.DB.prepare('INSERT INTO events (kind,model_id,detail,created_at) VALUES (?,?,?,?)').bind(kind, model_id ?? null, detail ?? null, Date.now()).run();
  if (kind === 'error') { // แจ้งแอดมินครั้งแรกของแต่ละโมเดลในรอบ 30 นาที · ปัญหาฝั่งต้นทาง (เงินหมด/คีย์/ช่องทางปิด) แจ้งซ้ำทุก 6 ชม. จนกว่าจะแก้ (เดิมล่มยาวแจ้งครั้งเดียว)
    const d = String(detail), sup = supplyIssue(d);
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE kind='error' AND model_id IS ? AND created_at>?").bind(model_id ?? null, Date.now() - 1800e3).first();
    const again = sup && !(await limited(env, `supply:${model_id ?? 0}:${sup.type}`, 1, 6 * 3600e3));
    if (n.n === 1 || again) {
      const hint = sup?.hint || (/timeout|timed out|หมดเวลา|stall|ไม่ตอบภายใน/i.test(d) ? '⏱️ ผู้ขายตอบช้า/ไม่ตอบ' : '');
      const name = model_id ? (await env.DB.prepare('SELECT name FROM models WHERE id=?').bind(model_id).first().catch(() => null))?.name : null;
      await notify(env, `⚠️ Kyber: ${name ? name + ` (#${model_id})` : 'โมเดล #' + (model_id ?? '-')} ตอบไม่ได้${hint ? '\n' + hint : ''}\n${d.slice(0, 300)}`);
    }
  }
}
// error ที่แก้ได้ฝั่งเราหรือผู้ขายเท่านั้น (ลูกค้าลองใหม่กี่ครั้งก็ไม่หาย): เงิน/เครดิตต้นทางหมด · คีย์ไม่มี/ผิด · ช่องทางหรือกลุ่มคีย์ถูกปิด
export function supplyIssue(d) {
  d = String(d || '');
  if (/missing key/i.test(d)) return { type: 'nokey', hint: `🔑 Worker ไม่มีคีย์ ${(d.match(/missing key (\w+)/i) || [])[1] || ''}: ตั้ง secret ใน Cloudflare หรือปิดโมเดลนี้`, label: 'ไม่มีคีย์ใน Worker' };
  if (/insufficient[_ ]?(credit|balance|funds|quota)|\b402\b|exceeded your current quota|available credit|เครดิต/i.test(d)) return { type: 'credit', hint: '💳 เงิน/เครดิตที่ผู้ขายต้นทางหมด: เติมเงินกับผู้ขาย', label: 'เงินต้นทางหมด' };
  if (/GROUP_DISABLED|channel is currently disabled|分组已停用|account (is )?(disabled|suspended)/i.test(d)) return { type: 'channel', hint: '⛔ ผู้ขายปิดช่องทาง/กลุ่มคีย์นี้: ติดต่อผู้ขาย หรือปิดโมเดล/เปลี่ยนช่องทาง', label: 'ต้นทางปิดช่องทาง' };
  if (/invalid.?api.?key|\b401\b|unauthori[sz]ed|not bound/i.test(d)) return { type: 'key', hint: '🔑 คีย์ใช้ไม่ได้/ไม่ผูกช่องทาง: ตรวจ Worker secret ของโมเดลนี้', label: 'คีย์ใช้ไม่ได้' };
  return null;
}
export async function audit(env, u, action, detail) {
  await env.DB.prepare('INSERT INTO audit (admin_id,admin_email,action,detail,created_at) VALUES (?,?,?,?,?)').bind(u.id, u.email, action, JSON.stringify(detail ?? null).slice(0, 2000), Date.now()).run();
}
export const siteUrl = env => (env.PUBLIC_URL || '').replace(/\/$/, '') || 'https://astracode.panderx.xyz'; // ลิงก์ในอีเมล/งานเบื้องหลังที่ไม่มีคำขอให้อ่านโดเมน
export const origin = (req, env) => (env.PUBLIC_URL || '').replace(/\/$/, '') || (viaProxy(req, env) && req.headers.get('x-forwarded-host') ? 'https://' + req.headers.get('x-forwarded-host') : new URL(req.url).origin);
export async function newToken(env, uid, kind, ms) { const t = rand(24); await env.DB.prepare('INSERT INTO tokens VALUES (?,?,?,?)').bind(await sha(t), uid, kind, Date.now() + ms).run(); return t; }
export async function useToken(env, t, kind) {
  const r = await env.DB.prepare('DELETE FROM tokens WHERE hash=? AND kind=? RETURNING user_id, expires').bind(await sha(String(t || '')), kind).first();
  return r && r.expires > Date.now() ? r.user_id : null;
}
// ตรวจสลิปผ่าน API: เลือกผู้ให้บริการในหลังบ้าน (easyslip / checkslip / slip2go / byshop / ไม่ใช้)
// code: ผลแบบ Slip2Go (200200 = ผ่านทุกเงื่อนไข, 200401 บัญชีผู้รับไม่ตรง, 200402 ยอดไม่ตรง, 200500 สลิปปลอม, 200501 สลิปซ้ำ, 200404 ไม่พบ)
export const SLIP_FAIL = { '200401': 'บัญชีผู้รับเงินไม่ตรงกับร้าน', '200402': 'ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องจ่าย', '200403': 'สลิปหมดอายุ: ต้องอัปโหลดภายใน 15 นาทีหลังโอน (หรือวันที่ในสลิปไม่ถูกต้อง)', '200404': 'ยอดในสลิปต่ำกว่ายอดเติมขั้นต่ำ', '200500': 'สลิปไม่ถูกต้องหรือเป็นสลิปปลอม', '200501': 'สลิปนี้ถูกใช้ไปแล้ว' };
export async function checkSlip(env, buf, type, amount, flex = false) { // flex = เติม Wallet: EasySlip เติมตามยอดในสลิป ไม่ต้องตรงกับที่กรอก
  const s = await getSettings(env, ['slip_provider', 'slip_api_url', 'slip_amount_field', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account', 'easyslip_url', 'checkslip_url', 'easyslip_receiver', 'easyslip_receiver_names', 'promptpay_id', 'bank_account', 'topup_min']);
  const provider = s.slip_provider || (s.slip_api_url ? 'byshop' : '');
  try {
    if (provider === 'slip2go') {
      if (!s.slip2go_url || !env.SLIP2GO_KEY) return { result: null, amount: null };
      const cond = { checkDuplicate: true, checkAmount: { type: 'eq', amount: String(amount) } };
      if (s.slip2go_receiver_account) cond.checkReceiver = [{ ...(s.slip2go_receiver_type ? { accountType: s.slip2go_receiver_type } : {}), accountNumber: s.slip2go_receiver_account.replace(/[\s-]/g, '') }];
      const r = await fetch(s.slip2go_url.replace(/\/$/, '') + '/api/verify-slip/qr-base64/info', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.SLIP2GO_KEY },
        body: JSON.stringify({ payload: { imageBase64: `data:${type};base64,${b64(buf)}`, checkCondition: cond } }) });
      const d = await r.json().catch(() => ({}));
      return { result: JSON.stringify(d).slice(0, 4000), amount: typeof d.data?.amount === 'number' ? d.data.amount : null, code: String(d.code || r.status), ref: d.data?.transRef || null };
    }
    if (provider === 'easyslip') return await easySlip(env, s, buf, type, amount, flex);
    if (provider === 'checkslip') return await checkSlipCo(env, s, buf, type, amount, flex);
    if (provider === 'byshop') { // shortcut: ส่ง multipart (file + keyapi) และ Bearer ถ้า byshop ใช้รูปแบบอื่นให้แก้ตรงนี้ที่เดียว
      if (!s.slip_api_url || !env.SLIP_API_KEY) return { result: null, amount: null };
      const fd = new FormData(); fd.append('file', new File([buf], 'slip.' + type.split('/')[1], { type })); fd.append('keyapi', env.SLIP_API_KEY);
      const d = await (await fetch(s.slip_api_url, { method: 'POST', headers: { authorization: 'Bearer ' + env.SLIP_API_KEY }, body: fd })).json();
      const a = parseFloat((s.slip_amount_field || 'amount').split('.').reduce((o, k) => o?.[k], d));
      return { result: JSON.stringify(d).slice(0, 4000), amount: isNaN(a) ? null : a };
    }
  } catch (e) { return { result: JSON.stringify({ error: e.message }), amount: null }; }
  return { result: null, amount: null };
}

// ---------- EasySlip (https://easyslip.com) ----------
// ส่งรูปสลิป (multipart `file` + checkDuplicate) ด้วย Bearer EASYSLIP_KEY · อ่านผลได้ทั้งรูปแบบ v1 (status/data.amount.amount) และ v2 (data.rawSlip.amount.amount)
// ผลที่คืน: code 200000 = สลิปจริงและยอดตรง (pay() อนุมัติเมื่อเปิดอัตโนมัติ) · 200401/200402/200403/200501 = ปฏิเสธ · อย่างอื่น (ไม่พบสลิป โควตาหมด ตรวจผู้รับไม่ได้ ฯลฯ) = รอแอดมินตรวจเอง
export const EASYSLIP_URL = 'https://developer.easyslip.com/api/v1/verify';
const numOf = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const slipAmount = d => numOf(d?.amount?.amount ?? d?.amount ?? d?.rawSlip?.amount?.amount);
// เลขผู้รับในสลิปถูกปิดบังบางส่วน (เช่น 088-xxx-1234, x-xxx-x5678-x): เทียบทีละหลัก x = อะไรก็ได้ · คืน true/false หรือ null (เทียบไม่ได้)
export function receiverMatches(slip, expected) {
  const wants = [].concat(expected || []).map(e => { let w = String(e || '').replace(/\D/g, ''); if (w.startsWith('66') && w.length === 11) w = '0' + w.slice(2); return w; }).filter(Boolean);
  if (!wants.length) return true; // ไม่ได้ตั้งไว้ = ไม่ตรวจ
  const found = []; (function walk(o, k) { if (typeof o === 'string' && /account$/i.test(k || '')) found.push(o); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(slip?.receiver ?? slip?.rawSlip?.receiver, '');
  let comparable = false;
  for (let c of found) {
    c = c.replace(/[\s-]/g, ''); if (c.startsWith('+66')) c = '0' + c.slice(3);
    if ((c.match(/\d/g) || []).length < 3) continue; // เห็นเลขน้อยเกินไป: เทียบไม่ได้
    for (const want of wants) {
      if (c.length !== want.length) continue; // ยาวไม่เท่ากัน (เบอร์โทรเทียบกับเลขบัญชี): ข้าม
      comparable = true; if ([...c].every((ch, i) => /[xX*•]/.test(ch) || ch === want[i])) return true;
    }
  }
  return comparable ? false : null;
}
// ผู้ให้บริการบางราย (CheckSlip) ส่งเลขบัญชีผู้รับมาแค่หลักท้าย เช่น "8835" (ไม่มี x ปิดหลักหน้า) จึงเทียบความยาวเต็มไม่ได้
// true = หลักท้าย 4–6 หลักตรงกับเลขพร้อมเพย์/บัญชีร้าน · ใช้คู่กับชื่อผู้รับที่ตรงเท่านั้น (หลักท้ายอย่างเดียวไม่พอยืนยัน)
export function receiverTailMatches(slip, expected) {
  const wants = [].concat(expected || []).map(e => String(e || '').replace(/\D/g, '')).filter(w => w.length >= 6);
  const found = []; (function walk(o, k) { if (typeof o === 'string' && /account$/i.test(k || '')) found.push(o); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(slip?.receiver ?? slip?.rawSlip?.receiver, '');
  return found.some(c => { c = String(c).replace(/[\s-]/g, ''); return /^\d{4,6}$/.test(c) && wants.some(w => w.endsWith(c)); });
}
export const SLIP_MAX_AGE = 15 * 60e3; // สลิปใช้ได้ภายใน 15 นาทีหลังโอนเท่านั้น
const nameKey = x => String(x || '').normalize('NFC').replace(/(?:นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|miss|ms\.?)/gi, '').replace(/[\s.]/g, '').toLowerCase();
// ชื่อผู้รับในสลิป (ไทย) เทียบกับรายชื่อที่อนุญาต · true = ตรงอย่างน้อยหนึ่งชื่อ · false = มีชื่อไทยแต่ไม่ตรง · null = สลิปไม่มีชื่อไทยให้เทียบ
export function receiverNameMatches(slip, allowed) {
  const found = []; (function walk(o, k) { if (typeof o === 'string' && /^(th|name)$/i.test(k || '') && /[ก-๛]/.test(o)) found.push(o); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(slip?.receiver?.account?.name ?? slip?.rawSlip?.receiver?.account?.name, 'name');
  if (!found.length) return null;
  return found.some(f => allowed.some(a => { const w = nameKey(a); return w && nameKey(f).includes(w); })); // ชื่อในสลิปมักตัดนามสกุลเหลือตัวอักษรแรก จึงรองรับ "ชื่อต้นอย่างเดียว" ที่ใส่เป็นชื่อสำรอง
}
// ชื่อผู้รับแบบเข้มงวด (ใช้เมื่อสลิปไม่มีเลขบัญชีให้เทียบ): ชื่อต้นต้องตรงทั้งคำ และนามสกุลในสลิป (เต็มหรือตัดเหลืออักษรแรก) ต้องเป็นส่วนต้นของนามสกุลที่ตั้งไว้
// ใช้ได้เฉพาะชื่อที่ตั้งไว้แบบมีนามสกุล ("ณัฐภูมินทร์ จูบ้ง") · ชื่อต้นอย่างเดียวที่ใส่สำรองไว้ไม่นับ
export function receiverHasDigits(slip) { // สลิปมีเลขบัญชี/พร้อมเพย์ผู้รับ (แม้บางส่วน) หรือไม่
  let n = false; (function walk(o, k) { if (typeof o === 'string' && /account$/i.test(k || '') && /\d/.test(o)) n = true; else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(slip?.receiver ?? slip?.rawSlip?.receiver, '');
  return n;
}
export function receiverNameStrict(slip, allowed) {
  const raw = slip?.receiver?.account?.name ?? slip?.rawSlip?.receiver?.account?.name; const found = [];
  (function walk(o, k) { if (typeof o === 'string' && /^(th|name)$/i.test(k || '') && /[ก-๛]/.test(o)) found.push(o); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(raw, 'name');
  const parts = x => String(x || '').normalize('NFC').replace(/^\s*(?:นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/, '').replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  const want = allowed.map(parts).filter(p => p.length >= 2);
  return found.some(f => { const [a, ...r] = parts(f), sur = r.join(''); return a && sur && want.some(([wa, ...wr]) => wa === a && wr.join('').startsWith(sur)); });
}
export async function easySlip(env, s, buf, type, amount, flex = false) {
  if (!env.EASYSLIP_KEY) return { result: null, amount: null };
  const url = s.easyslip_url || EASYSLIP_URL, v2 = /\/v2(\/|$)/.test(url); // URL ที่มี /v2 = EasySlip v2 (JSON base64) ไม่งั้นใช้ v1 (multipart)
  const bearer = { authorization: 'Bearer ' + env.EASYSLIP_KEY }, name = 'slip.' + (type.split('/')[1] || 'jpg');
  const form = field => { const fd = new FormData(); fd.append(field, new File([buf], name, { type })); fd.append('checkDuplicate', 'true'); return { headers: bearer, body: fd }; };
  const tries = v2 // v2: ปลายทางมาตรฐาน /v2/verify/bank (JSON base64) · ถ้าคำขอผิดรูปแบบลองส่งไฟล์ multipart ชื่อ image ต่อ (ยังไม่ได้ทดสอบกับเอกสารจริง)
    ? [[/\/verify/.test(url) ? url : url.replace(/\/$/, '') + '/verify/bank', { headers: { ...bearer, 'content-type': 'application/json' }, body: JSON.stringify({ base64: b64(buf), checkDuplicate: true }) }], [null, form('image')]]
    : [[url, form('file')]];
  let r, d, last;
  for (const [e, init] of tries) {
    last = e || last;
    r = await fetch(last, { method: 'POST', ...init, signal: AbortSignal.timeout(25000) });
    d = await r.json().catch(() => ({}));
    if (r.status < 400 || r.status >= 500 || [401, 403, 404].includes(r.status)) break; // ลองรูปแบบถัดไปเฉพาะคำขอผิดรูปแบบ (4xx อื่น)
  }
  d ||= {}; return judgeSlip(s, d, +d.status || r.status, String(d.message || d.error?.message || ''), amount, flex);
}

// ---------- CheckSlip (https://checkslip.com) ----------
// POST /api/slips/lookup (multipart `image`) ด้วย Bearer CHECKSLIP_KEY · แปลงผลเป็นรูปแบบเดียวกับ EasySlip แล้วตัดสินด้วย judgeSlip ชุดเดียวกัน
// FOUND = ตรวจยอด/วันที่/ผู้รับต่อ · DUPLICATE = ใช้แล้ว · QR_TAMPERED = ปลอม · TOO_OLD = หมดอายุ · อื่นๆ (NOT_FOUND, คีย์ผิด, เครดิตหมด) = รอแอดมิน
export const CHECKSLIP_URL = 'https://api.checkslip.com';
export async function checkSlipCo(env, s, buf, type, amount, flex = false) {
  if (!env.CHECKSLIP_KEY) return { result: null, amount: null };
  const fd = new FormData(); fd.append('image', new File([buf], 'slip.' + (type.split('/')[1] || 'jpg'), { type }));
  const idem = hex(await crypto.subtle.digest('SHA-256', buf)).slice(0, 64); // คีย์จากรูป: ส่งซ้ำไม่โดนคิดเครดิตซ้ำ
  let r, c = {}, raw = '';
  for (let i = 0; i < 3; i++) { // บางครั้งตอบว่าง/ไม่ใช่ JSON/5xx/429 (ทำให้สลิปค้างรอแอดมินทั้งที่ตรวจได้): ลองใหม่ 2 ครั้ง
    r = await fetch((s.checkslip_url || CHECKSLIP_URL).replace(/\/$/, '') + '/api/slips/lookup', { method: 'POST', body: fd, signal: AbortSignal.timeout(25000),
      headers: { authorization: 'Bearer ' + env.CHECKSLIP_KEY, accept: 'application/json, application/problem+json', 'idempotency-key': idem } }).catch(e => ({ status: 0, text: async () => String(e.message) }));
    raw = await r.text().catch(() => ''); try { c = JSON.parse(raw); } catch { c = {}; }
    if (c.outcome || c.code || (r.status >= 400 && r.status < 500 && r.status !== 429)) break;
    await new Promise(ok => setTimeout(ok, 1500 * (i + 1)));
  }
  const sl = c.slip, rc = sl?.receiver || {};
  const data = c.outcome === 'FOUND' && sl ? { transRef: sl.trans_ref, date: sl.transferred_at, amount: { amount: sl.amount ? sl.amount.satang / 100 : null }, receiver: { account: { name: { th: rc.name_th, en: rc.name_en }, bank: { account: rc.account } } } } : null;
  const d = { provider: 'checkslip', success: !!data, outcome: c.outcome || null, code: c.code || null, message: c.detail || c.title || null, request_id: c.request_id || null, http: r.status, ...(c.outcome || c.code ? {} : { raw: raw.slice(0, 300) }), data };
  const code = { QR_TAMPERED: '200500', TOO_OLD: '200403' }[c.code];
  if (code) return { flex, result: JSON.stringify(d).slice(0, 4000), amount: null, ref: null, code };
  return judgeSlip(s, d, data ? 200 : r.status, c.outcome === 'DUPLICATE' ? 'duplicate' : String(c.code || c.outcome || ''), amount, flex);
}

// ตัดสินผลสลิป (รูปแบบ EasySlip: d.data = สลิป) · ใช้ร่วมกันทุกผู้ให้บริการที่แปลงผลมาเป็นรูปแบบนี้
export function judgeSlip(s, d, st, msg, amount, flex) {
  const slip = d.data && typeof d.data === 'object' ? d.data : null;
  const out = (code, extra = {}) => ({ flex, result: JSON.stringify(d).slice(0, 4000), amount: slip ? slipAmount(slip) : null, ref: slip?.transRef || slip?.rawSlip?.transRef || null, code, ...extra });
  if (/duplicate/i.test(msg)) return out('200501');
  if (!(st === 200 || d.success === true) || !slip) return out(msg || String(st)); // ไม่ใช่สลิปที่อ่านได้: ปล่อยให้แอดมินดู (ไม่ปฏิเสธเอง)
  const got = slipAmount(slip);
  if (got == null) return out('amount_missing');
  if (!flex && Math.abs(got - amount) > 0.004) return out('200402'); // แพลนต้องตรงเป๊ะ · เติมเงิน (flex) ใช้ยอดตามสลิป
  const when = Date.parse(slip.date || slip.rawSlip?.date || '');
  if (!Number.isFinite(when) || Date.now() - when > SLIP_MAX_AGE || when - Date.now() > 5 * 60e3) return Number.isFinite(when) ? out('200403') : out('date_missing'); // สลิปต้องโอนภายใน 15 นาที (เผื่อนาฬิกาเร็วได้ 5 นาที) · ไม่มีวันที่ = ให้แอดมินตรวจ
  const names = String(s.easyslip_receiver_names || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  const wantAcc = String(s.easyslip_receiver || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean); // ไม่ตั้ง = ใช้พร้อมเพย์ + เลขบัญชีธนาคารของร้านทั้งคู่ (สลิปโอนผ่านพร้อมเพย์โชว์เบอร์ ส่วนโอนเข้าบัญชีโชว์เลขบัญชี)
  const dg = receiverMatches(slip, [...wantAcc, s.promptpay_id, s.bank_account].filter(Boolean)) /* พร้อมเพย์และเลขบัญชีร้านนับเสมอ: ลูกค้าโอนเข้าเลขบัญชีตรงๆ ก็ต้องผ่าน */, nm = names.length ? receiverNameMatches(slip, names) : null;
  // มีรายชื่อผู้รับที่อนุญาต: ชื่อตรง (เต็มหรือเฉพาะชื่อต้นที่สำรองไว้) แล้วเลขบัญชีต้องไม่ขัดแย้ง · ชื่อไม่ตรง = ปฏิเสธ · ชื่อในสลิปเทียบไม่ได้ ใช้เลขบัญชีตัดสินแทน
  // ชื่อตรงอย่างเดียวไม่พอ (เทียบแบบ "มีคำนี้ในชื่อ" · คนร้ายโอนเข้าบัญชีตัวเองที่ชื่อคล้ายร้านได้): อนุมัติเองเมื่อเลขบัญชี/พร้อมเพย์ตรงด้วยเท่านั้น · เลขเทียบไม่ได้ = ให้แอดมินตรวจ
  if (names.length) {
    if (nm === false || dg === false) return out('200401');
    if (dg === true) return out('200000');
    if (nm === true && receiverTailMatches(slip, [...wantAcc, s.promptpay_id, s.bank_account].filter(Boolean))) return out('200000'); // ชื่อตรง + หลักท้ายบัญชีตรง (CheckSlip)
    if (dg === null && !receiverHasDigits(slip) && receiverNameStrict(slip, names)) return out('200000'); // สลิปไม่มีเลขบัญชีเลย (CheckSlip โอนในธนาคารเดียวกัน): ชื่อต้น + นามสกุล (หรืออักษรแรกนามสกุล) ต้องตรงชื่อเต็มที่ตั้งไว้
    return out('receiver_unverified'); // ไม่มีเลขบัญชีในสลิป: แอดมินตรวจ
  }
  if (dg === false) return out('200401');
  if (dg === null) return out('receiver_unverified'); // ตั้งผู้รับไว้แต่สลิปไม่มีเลขที่เทียบได้ → ให้แอดมินตรวจ
  return out('200000');
}

// ดูชนิดไฟล์จากไบต์จริง ไม่เชื่อชนิดที่เบราว์เซอร์ส่งมา
export function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
// คูปอง: percent / fixed = ส่วนลดค่าแพลน, credit = เติมเงินเข้า wallet
export async function couponFor(env, u, code, kind) {
  code = String(code || '').trim().toUpperCase(); if (!code) return null;
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND active=1').bind(code).first();
  if (!c || (c.expires && c.expires < Date.now()) || (c.max_uses && c.used >= c.max_uses)) throw userErr('คูปองใช้ไม่ได้หรือหมดอายุ');
  if (await env.DB.prepare('SELECT 1 FROM coupon_uses WHERE code=? AND user_id=?').bind(code, u.id).first()) throw userErr('คุณใช้คูปองนี้ไปแล้ว');
  if ((kind === 'credit') !== (c.kind === 'credit')) throw userErr(c.kind === 'credit' ? 'คูปองนี้เป็นเครดิต ใช้ที่หน้า Wallet' : 'คูปองนี้ใช้ลดราคาแพลนเท่านั้น');
  return c;
}
export const discountOf = (c, amount) => !c ? 0 : Math.min(amount, Math.round((c.kind === 'percent' ? amount * c.value / 100 : c.value) * 100) / 100);
// จองคูปองแบบ atomic: คนนี้ต้องยังไม่เคยใช้ (PK code+user) และจำนวนใช้ต้องไม่เกิน max_uses · ซ้ำได้ผล false
export async function claimCoupon(env, code, uid) {
  if (!code) return true;
  if (!(await env.DB.prepare('INSERT OR IGNORE INTO coupon_uses VALUES (?,?,?)').bind(code, uid, Date.now()).run()).meta.changes) return false;
  if ((await env.DB.prepare('UPDATE coupons SET used=used+1 WHERE code=? AND (COALESCE(max_uses,0)=0 OR used<max_uses)').bind(code).run()).meta.changes) return true;
  await env.DB.prepare('DELETE FROM coupon_uses WHERE code=? AND user_id=?').bind(code, uid).run();
  return false;
}
export const releaseCoupon = async (env, code, uid) => { if (code && (await env.DB.prepare('DELETE FROM coupon_uses WHERE code=? AND user_id=?').bind(code, uid).run()).meta.changes) await env.DB.prepare('UPDATE coupons SET used=MAX(used-1,0) WHERE code=?').bind(code).run(); };
export async function useCoupon(env, code, uid) { // idempotent: นับ used เฉพาะตอนบันทึกครั้งแรก (ถ้าจองไว้แล้วจะไม่นับซ้ำ)
  if (!code) return;
  if ((await env.DB.prepare('INSERT OR IGNORE INTO coupon_uses VALUES (?,?,?)').bind(code, uid, Date.now()).run()).meta.changes) await env.DB.prepare('UPDATE coupons SET used=used+1 WHERE code=?').bind(code).run();
}
// อนุมัติการจ่ายเงิน: เปิด/ต่อแพลน หรือเติม wallet + ให้รางวัลแนะนำเพื่อน
// เปลี่ยนไปแพ็กเกจอื่นระหว่างที่ยังมีเวลาเหลือ: แปลงมูลค่าที่เหลือของแพ็กเกจเดิมเป็นวันของแพ็กเกจใหม่ (ไม่เกินจำนวนวันที่เหลือจริง) ไม่ให้เวลาที่จ่ายไปแล้วหายไป
export function carryMs(oldPlan, oldPeriod, remainingMs, newPlan, newPeriod) {
  if (!oldPlan || remainingMs <= 0) return 0;
  const rate = (pl, per) => (per === 'year' && pl.price_year ? pl.price_year / 365 : pl.price / 30);
  const o = rate(oldPlan, oldPeriod), n = rate(newPlan, newPeriod);
  return n > 0 && o > 0 ? Math.min(remainingMs, remainingMs * o / n) : 0;
}
// โปรฉลองยอดเติมทะลุ ฿10,000: เติม Wallet ตั้งแต่ ฿300 แถม 10% (21–28 พ.ย. 2026 เวลาไทย) · เฉพาะโอนจริง ครั้งละรายการ
export const TOPUP_PROMO = { pct: 10, min: 300, start: Date.UTC(2026, 10, 20, 17), end: Date.UTC(2026, 10, 28, 17), label: 'ฉลองยอดเติมทะลุ ฿10,000' };
export const topupPromo = (now = Date.now()) => now >= TOPUP_PROMO.start && now < TOPUP_PROMO.end ? TOPUP_PROMO : null;
export async function applyPayment(env, p) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(p.user_id).first();
  const real = !['wallet', 'coupon'].includes(p.slip_key); // จ่ายเงินจริง (สลิป) ไม่ใช่ตัดจาก Wallet/คูปอง
  if (p.kind === 'topup') {
    await walletAdd(env, u.id, p.amount, 'topup', 'payment#' + p.id);
    const promo = real && p.amount >= TOPUP_PROMO.min && topupPromo(p.created_at || Date.now()); // นับตามเวลาส่งสลิป: ส่งช่วงโปร แอดมินอนุมัติทีหลังก็ได้
    if (promo && !await env.DB.prepare("SELECT 1 FROM wallet_tx WHERE user_id=? AND kind='promo_bonus' AND ref=?").bind(u.id, 'payment#' + p.id).first()) await walletAdd(env, u.id, Math.round(p.amount * promo.pct) / 100, 'promo_bonus', 'payment#' + p.id);
    // โบนัสเติมเงินครั้งแรก: % ของยอด (มีเพดาน) ครั้งเดียวต่อบัญชี · first_topup_pct ว่าง/0 = ปิด (แอดมินเปิดในหลังบ้าน)
    const s = await getSettings(env, ['first_topup_pct', 'first_topup_max']), pct = +s.first_topup_pct || 0, cap = s.first_topup_max === '' ? 100 : +s.first_topup_max;
    if (real && pct > 0 && !await env.DB.prepare("SELECT 1 FROM wallet_tx WHERE user_id=? AND kind='first_bonus'").bind(u.id).first()) {
      const bonus = Math.round(Math.min(p.amount * pct / 100, cap) * 100) / 100;
      // จองแถว first_bonus ก่อน (ดัชนี unique ต่อผู้ใช้) แล้วค่อยเพิ่มเงิน: อนุมัติสองรายการพร้อมกันได้โบนัสครั้งเดียว
      const tx = bonus > 0 && await env.DB.prepare("INSERT OR IGNORE INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,0,'first_bonus',?,?) RETURNING id").bind(u.id, bonus, 'payment#' + p.id, Date.now()).first();
      if (tx) {
        const r = await env.DB.prepare('UPDATE users SET balance=ROUND(balance+?,4) WHERE id=? RETURNING balance').bind(bonus, u.id).first();
        await env.DB.prepare('UPDATE wallet_tx SET balance_after=? WHERE id=?').bind(r?.balance ?? 0, tx.id).run();
      }
    }
  } else {
    const pl = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(p.plan_id).first();
    const days = p.period === 'year' ? 365 : pl?.days || 30, now = Date.now(); // plans.days: แพลนระยะสั้น เช่นทดลอง 7 วัน
    if (pl && pl.seats > 1) {
      const ex = await env.DB.prepare('SELECT * FROM teams WHERE owner_id=? ORDER BY id DESC LIMIT 1').bind(u.id).first();
      let base = ex && ex.plan_id === p.plan_id && ex.expires > now ? ex.expires : now;
      if (ex && ex.plan_id !== p.plan_id && ex.expires > now) base = now + carryMs(await env.DB.prepare('SELECT price,price_year FROM plans WHERE id=?').bind(ex.plan_id).first(), u.plan_period, ex.expires - now, pl, p.period); // อัปเกรดทีม: ทบเวลาที่เหลือ
      const exp = base + days * DAY;
      if (ex) {
        await env.DB.prepare('UPDATE teams SET plan_id=?, expires=?, max_seats=?, shared_pool=? WHERE id=?').bind(pl.id, exp, p.seats || pl.seats, pl.shared_pool ? 1 : 0, ex.id).run();
      } else {
        const t = await env.DB.prepare('INSERT INTO teams (name,owner_id,plan_id,expires,invite_code,max_seats,shared_pool,created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id')
          .bind('ทีมของ ' + u.email.split('@')[0], u.id, pl.id, exp, rand(4).toUpperCase(), p.seats || pl.seats, pl.shared_pool ? 1 : 0, now).first();
        await env.DB.prepare("INSERT OR IGNORE INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").bind(t.id, u.id, now).run();
      }
    } else if (await multiOn(env)) { // หลายแพลน: ซื้อ = ได้ใบใหม่ (ลิมิตแยก ใช้พร้อมกัน) · payments.sub_id = กด "ต่ออายุใบนี้" → ยืดวันหมดอายุของใบนั้น
      await subsOf(env, u); // ย้ายแพลนเดิมเข้าเป็นใบแรกก่อน (ไม่งั้นใบใหม่จะทับ)
      const target = p.sub_id && await env.DB.prepare("SELECT * FROM subscriptions WHERE id=? AND user_id=? AND status='active'").bind(p.sub_id, u.id).first();
      if (target) await env.DB.prepare('UPDATE subscriptions SET expires_at=?, period=? WHERE id=?').bind(Math.max(target.expires_at, now) + days * DAY, p.period, target.id).run();
      else await env.DB.prepare("INSERT INTO subscriptions (user_id,plan_id,period,starts_at,expires_at,status,payment_id,auto_renew,created_at) VALUES (?,?,?,?,?,'active',?,0,?)").bind(u.id, p.plan_id, p.period, now, now + days * DAY, p.id, now).run();
      const fresh = await subsOf(env, u), prim = fresh.find(x => x.primary) || fresh[0];
      if (prim) await mirrorPrimary(env, u.id, prim); // users.plan_* = ใบหลักเสมอ (ไม่มีใบหลักเดิม = ใบที่เพิ่งซื้อ)
    } else {
      let base = u.plan_id === p.plan_id && u.plan_expires > now ? u.plan_expires : now; // ต่ออายุแพลนเดิมต่อท้าย
      if (u.plan_id && u.plan_id !== p.plan_id && u.plan_expires > now) base = now + carryMs(await env.DB.prepare('SELECT price,price_year FROM plans WHERE id=?').bind(u.plan_id).first(), u.plan_period, u.plan_expires - now, pl || { price: 0 }, p.period); // เปลี่ยนแพลน: ทบเวลาที่เหลือ
      await env.DB.prepare('UPDATE users SET plan_id=?, plan_expires=?, plan_period=? WHERE id=?').bind(p.plan_id, base + days * DAY, p.period, u.id).run();
      // แพลนสั้น (≤7 วัน) เริ่มใหม่: เริ่มรอบลิมิตสัปดาห์ ณ วันซื้อ ไม่งั้นรอบเดิมที่เริ่มก่อนซื้อจะรีเซ็ตกลางแพลน = ได้ลิมิตสัปดาห์ 2 รอบใน 7 วัน (ต้นทุนเกินที่คิดราคาไว้)
      if (days <= 7 && base === now) await env.DB.prepare('UPDATE users SET usage_reset_at=?, sess_start=NULL, week_start=NULL WHERE id=?').bind(now, u.id).run();
    }
    await grantClaudeCredit(env, u, pl, p).catch(e => console.log('claude credit', e.message)); // แถมเครดิต Claude Eco ทุกครั้งที่ซื้อ/ต่อ (ลูกค้าใหม่ Pro X2 ขึ้นไป)
  }
  await useCoupon(env, p.coupon, u.id);
  // Affiliate: คนที่ชวนมาจ่ายเงินจริง → ผู้ชวนได้ค่าคอม % เข้า Wallet ภายใน aff_months เดือนแรกของบัญชีนั้น · aff_pct = 0 (ค่าเริ่มต้น) = ปิด
  if (u.referred_by && real) {
    const s = await getSettings(env, ['aff_pct', 'aff_months']), pct = +s.aff_pct || 0, months = +s.aff_months || 12;
    if (pct > 0 && Date.now() - u.created_at < months * 30 * DAY) { const c = Math.round(p.amount * pct) / 100; if (c > 0) await walletAdd(env, u.referred_by, c, 'affiliate', 'user#' + u.id + ' payment#' + p.id); }
  }
  // คนที่ถูกชวนจ่ายเงินจริงครั้งแรก: ได้เครดิตทั้งคู่ · ตั้ง ref_rewarded แบบมีเงื่อนไข อนุมัติสองรายการพร้อมกันจ่ายโบนัสครั้งเดียว
  if (u.referred_by && !u.ref_rewarded && real && (await env.DB.prepare('UPDATE users SET ref_rewarded=1 WHERE id=? AND COALESCE(ref_rewarded,0)=0').bind(u.id).run()).meta.changes) {
    const bonus = +(await getSetting(env, 'referral_bonus')) || 0;
    if (bonus > 0) { await walletAdd(env, u.id, bonus, 'referral', 'ref'); await walletAdd(env, u.referred_by, bonus, 'referral', 'user#' + u.id); }
  }
  await mail(env, u.email, 'Kyber: ชำระเงินสำเร็จ', mailBox('ชำระเงินสำเร็จ', p.kind === 'topup' ? `เติมเงิน ฿${p.amount} เข้า Wallet แล้ว` : 'เปิดแพลนให้แล้ว ใช้งานได้ทันที'));
}
export const SEATS_MAX = 100;
const setSeats = async (env, p, seats) => { if (p && seats) { await env.DB.prepare('UPDATE payments SET seats=? WHERE id=?').bind(seats, p.id).run(); p.seats = seats; } return p; };
// ทำรายการชำระเงินทีละรายการต่อผู้ใช้: กดซ้ำ/ยิงพร้อมกันไม่ผ่านการตรวจ "แพลนซื้อได้ครั้งเดียว" และ "มีคำขอรออนุมัติอยู่แล้ว" ซ้อนกันได้ (ล็อกหมดอายุเองใน 2 นาที)
export async function pay(req, env, u) {
  const k = 'paylock:' + u.id, now = Date.now();
  if (!await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(k, now + 120e3, now).first()) return err('กำลังทำรายการก่อนหน้าอยู่ รอสักครู่แล้วลองใหม่', 429);
  try { return await pay0(req, env, u); } finally { await unlimit(env, k).catch(() => {}); }
}
async function pay0(req, env, u) {
  // กันสลิปปลอม: อีเมลชั่วคราวส่งสลิปไม่ได้ · ปฏิเสธ 3 ครั้งใน 24 ชม. = พัก 24 ชม. · ปฏิเสธ 5 ครั้งและไม่เคยจ่ายผ่าน = ระงับบัญชี
  const { tempEmail } = await import('./core.js');
  if (await tempEmail(env, u.email)) return err('บัญชีที่ใช้อีเมลชั่วคราวชำระเงินไม่ได้ กรุณาสมัครด้วยอีเมลจริง', 403);
  const rj = await env.DB.prepare("SELECT SUM(status='rejected' AND created_at>?2) day, SUM(status='rejected') total, SUM(status='approved') ok FROM payments WHERE user_id=?1").bind(u.id, Date.now() - 864e5).first();
  if (!rj?.ok && rj?.total >= 5) {
    await env.DB.prepare('UPDATE users SET banned=1 WHERE id=? AND role=\'user\'').bind(u.id).run(); await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run().catch(() => {});
    await notify(env, `🚫 ระงับบัญชี ${u.email} อัตโนมัติ: สลิปถูกปฏิเสธ ${rj.total} ครั้ง ไม่เคยจ่ายผ่าน (ปลดได้ที่หลังบ้าน → ผู้ใช้)`).catch(() => {});
    return err('บัญชีถูกระงับเพราะส่งสลิปไม่ถูกต้องหลายครั้ง ติดต่อแอดมิน', 403);
  }
  if (rj?.day >= 3) return err('ส่งสลิปไม่ผ่านหลายครั้ง ส่งใหม่ได้ใน 24 ชั่วโมง หรือติดต่อแอดมินถ้าโอนจริงแล้ว', 429);
  const fd = await req.formData(), kind = fd.get('kind') === 'topup' ? 'topup' : 'plan';
  let plan = null, period = 'month', amount, coupon = null, discount = 0, seats = null, renewSub = null;
  if (kind === 'plan') {
    plan = await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1 AND price>0').bind(fd.get('plan_id')).first();
    if (!plan) return err('ไม่พบแพลน');
    if (plan.once && await env.DB.prepare("SELECT 1 FROM payments WHERE user_id=? AND plan_id=? AND status IN ('approved','pending','refunded')").bind(u.id, plan.id).first()) return err('แพลนนี้ซื้อได้ครั้งเดียวต่อบัญชี');
    period = fd.get('period') === 'year' && plan.price_year ? 'year' : 'month';
    renewSub = +fd.get('sub_id') && await multiOn(env) ? (await env.DB.prepare("SELECT id FROM subscriptions WHERE id=? AND user_id=? AND plan_id=? AND status='active'").bind(+fd.get('sub_id'), u.id, plan.id).first().catch(() => null))?.id || null : null; // ต่ออายุใบนี้ (หลายแพลน)
    amount = period === 'year' ? plan.price_year : plan.price;
    if (plan.per_seat) { seats = Math.min(SEATS_MAX, Math.max(plan.seats || 3, Math.floor(+fd.get('seats') || 0))); amount = Math.round(amount * seats * 100) / 100; } // แพลนทีมคิดต่อที่นั่ง
    coupon = await couponFor(env, u, fd.get('coupon'), 'plan');
    discount = discountOf(coupon, amount); amount = Math.round((amount - discount) * 100) / 100;
  } else {
    amount = Math.round(+fd.get('amount') * 100) / 100;
    const min = +(await getSetting(env, 'topup_min')) || 10;
    if (!(amount >= min && amount <= 50000)) amount = null; // ไม่กรอก/กรอกผิด: เติมตามยอดที่อ่านได้จากสลิป (หน้าเว็บบอกว่าโอนเท่าไหร่ก็ได้)
  }
  if (await limited(env, 'pay:' + u.id, 5, 3600e3)) return err('ส่งสลิปบ่อยเกินไป รอ 1 ชั่วโมง', 429);
  if (kind === 'plan' && fd.get('wallet') === '1' && amount > 0) { // จ่ายด้วยเงินใน Wallet: เปิดแพลนทันที
    if (!await claimCoupon(env, coupon?.code, u.id)) return err('คูปองใช้ไม่ได้หรือหมดอายุ');
    const left = await env.DB.prepare('UPDATE users SET balance=ROUND(balance-?,4) WHERE id=? AND balance>=? RETURNING balance').bind(amount, u.id, amount).first(); // ตัดเงินแบบ atomic กันกดซ้ำพร้อมกัน
    if (!left) { await releaseCoupon(env, coupon?.code, u.id); return err('ยอดเงินใน Wallet ไม่พอ'); }
    let p = null;
    try { // เงินถูกหักแล้ว: ขั้นใดล้ม ต้องคืนเงินและคืนสิทธิ์คูปอง ไม่ให้ผู้ใช้เสียเงินโดยไม่ได้แพลน
      await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -amount, left.balance, 'plan', plan.name, Date.now()).run();
      p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?,?,?) RETURNING *")
        .bind(u.id, plan.id, amount, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
      await setSeats(env, p, seats); if (renewSub && p) { await env.DB.prepare('UPDATE payments SET sub_id=? WHERE id=?').bind(renewSub, p.id).run(); p.sub_id = renewSub; }
      await applyPayment(env, p);
    } catch (e) { // shortcut: ถ้า applyPayment ทำแพลนเสร็จแล้วค่อยล้มตอนท้าย (คูปอง/โบนัสแนะนำ) ผู้ใช้จะได้แพลนและเงินคืนด้วย ยอมรับได้เพราะเกิดยากและเข้าข้างลูกค้า
      await walletAdd(env, u.id, amount, 'refund', plan.name).catch(() => {});
      await releaseCoupon(env, coupon?.code, u.id).catch(() => {});
      if (p) await env.DB.prepare("UPDATE payments SET status='rejected' WHERE id=?").bind(p.id).run().catch(() => {});
      await notify(env, `⚠️ จ่ายแพลนด้วย Wallet ล้มเหลว คืนเงิน ฿${amount} ให้ ${u.email} แล้ว: ${String(e.message).slice(0, 200)}`).catch(() => {});
      return err('ทำรายการไม่สำเร็จ คืนเงินเข้า Wallet แล้ว ลองใหม่อีกครั้ง', 500);
    }
    return json({ ok: true, approved: true, id: p.id });
  }
  if (await env.DB.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").bind(u.id).first()) return err('มีคำขอที่รออนุมัติอยู่แล้ว');
  if (kind === 'plan' && amount <= 0) { // คูปองลด 100%: เปิดแพลนทันที ไม่ต้องใช้สลิป
    if (!await claimCoupon(env, coupon?.code, u.id)) return err('คูปองใช้ไม่ได้หรือหมดอายุ');
    const p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,0,'coupon','approved',?,?,?,?,?,?) RETURNING *")
      .bind(u.id, plan.id, kind, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
    await setSeats(env, p, seats); if (renewSub && p) { await env.DB.prepare('UPDATE payments SET sub_id=? WHERE id=?').bind(renewSub, p.id).run(); p.sub_id = renewSub; }
    await applyPayment(env, p);
    return json({ ok: true, approved: true, id: p.id });
  }
  const file = fd.get('slip');
  if (!(file instanceof File) || file.size > 5e6) return err('อัปโหลดรูปสลิป (ไม่เกิน 5MB)');
  const buf = await file.arrayBuffer();
  const type = imageType(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
  if (!type) return err('รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
  const key = 'slip/' + hex(await crypto.subtle.digest('SHA-256', buf));
  if (await env.DB.prepare('SELECT 1 FROM payments WHERE slip_key=?').bind(key).first()) return err('สลิปนี้ถูกใช้แล้ว');
  // จองสิทธิ์คูปองก่อนส่งสลิปไปตรวจ (กันคูปองจำกัดจำนวนถูกใช้เกินด้วยสลิปที่รอตรวจพร้อมกัน) · สลิปไม่ผ่าน/บันทึกไม่ได้ = คืนสิทธิ์
  if (coupon && !await claimCoupon(env, coupon.code, u.id)) return err('คูปองใช้ไม่ได้หรือหมดอายุ');
  await slipPut(env, key, buf, type).catch(async e => { await releaseCoupon(env, coupon?.code, u.id); throw e; });
  const c = await checkSlip(env, buf, type, amount ?? 0, kind === 'topup');
  if (c.ref && await env.DB.prepare('SELECT 1 FROM payments WHERE slip_ref=?').bind(c.ref).first()) c.code = '200501'; // สลิปที่เคยสแกนแล้วใช้ซ้ำไม่ได้ แม้ครั้งก่อนถูกปฏิเสธ // เลขอ้างอิงธนาคารซ้ำในระบบเรา
  if (kind === 'topup' && c.amount != null && !SLIP_FAIL[c.code]) { // เติมเงิน: ใช้ยอดตามสลิปเสมอ (ไม่ต้องตรงกับที่กรอก) ทั้งที่อนุมัติเองและที่รอแอดมิน ไม่งั้นรายการค้างเก็บยอดที่กรอกผิดไว้
    const min = +(await getSetting(env, 'topup_min')) || 10;
    if (!(c.amount >= min)) c.code = '200404'; else if (c.amount > 50000) c.code = 'over_limit'; else amount = Math.round(c.amount * 100) / 100;
  }
  if (kind === 'topup' && amount == null) { // ไม่ได้กรอกยอดและอ่านยอดจากสลิปไม่ได้
    if (!SLIP_FAIL[c.code]) return err('อ่านยอดเงินในสลิปไม่ได้ กรอกจำนวนเงินที่โอนแล้วส่งสลิปอีกครั้ง');
    amount = Math.round((c.amount || 0) * 100) / 100; // สลิปไม่ผ่านอยู่แล้ว: บันทึกไว้เป็นรายการปฏิเสธ
  }
  const fail = SLIP_FAIL[c.code];
  if (c.code != null) { // ระบบตรวจสลิปอัตโนมัติพัง (คีย์/URL/รูปแบบคำขอผิด) ติดกัน 3 ครั้ง = เตือนแอดมินชัดๆ ไม่ใช่ปล่อยค้างรอเงียบๆ
    const broken = !fail && !['200000', '200200', 'receiver_unverified', 'date_missing', 'amount_missing'].includes(c.code) /* อ่านสลิปได้แต่ต้องให้แอดมินดู ≠ ระบบตรวจพัง */, n = broken ? (+(await getSetting(env, 'slip_fail_streak')) || 0) + 1 : 0;
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('slip_fail_streak', String(n)).run();
    if (n === 3) await notify(env, `⚠️ ตรวจสลิปอัตโนมัติไม่สำเร็จ 3 ครั้งติดกัน (ล่าสุด: ${String(c.code).slice(0, 120)}) สลิปค้างรออนุมัติเอง · เช็คคีย์/URL ในหน้าตั้งค่า แล้วกด Test connection`);
  }
  // ผ่านทุกเงื่อนไข (หรือพบสลิปและยอดตรง) และเปิดอนุมัติอัตโนมัติ: เปิดแพลน/เติมเงินทันที
  const pass = !fail && (c.code === '200200' || (c.code === '200000' && c.amount === amount)) && (await getSetting(env, 'slip_auto_approve')) !== '0';
  const now = Date.now(), what = kind === 'topup' ? 'เติม Wallet' : plan.name + (period === 'year' ? ' รายปี' : '');
  // ดัชนี unique (slip_key, slip_ref) กันสลิปเดียวส่งพร้อมกันสองครั้งแล้วอนุมัติซ้ำ: ตัวที่สองชนดัชนีและถูกปฏิเสธก่อนถึง applyPayment
  const p = await env.DB.prepare('INSERT INTO payments (user_id,plan_id,amount,slip_key,slip_check,slip_amount,slip_ref,status,approved_at,created_at,kind,period,coupon,discount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .bind(u.id, plan?.id || 0, amount, key, c.result, c.amount, c.ref || null, fail ? 'rejected' : pass ? 'approved' : 'pending', pass ? now : null, now, kind, period, fail ? null : coupon?.code || null, discount).first().catch(async e => { if (/UNIQUE/i.test(e.message)) return null; await releaseCoupon(env, coupon?.code, u.id); throw e; });
  await setSeats(env, p, seats); if (renewSub && p) { await env.DB.prepare('UPDATE payments SET sub_id=? WHERE id=?').bind(renewSub, p.id).run(); p.sub_id = renewSub; }
  if (!p || fail) await releaseCoupon(env, coupon?.code, u.id);
  if (!p) return err('สลิปนี้ถูกใช้แล้ว');
  if (fail) { await notify(env, `⛔ สลิปไม่ผ่าน ฿${amount} จาก ${u.email} (${what}): ${fail}`); return json({ error: fail + ' ถ้าคิดว่าผิดพลาด กด "ให้แอดมินตรวจ" ได้เลย', pay_id: p.id }, 400); }
  if (pass) { await applyPayment(env, p); await notify(env, `✅ อนุมัติอัตโนมัติ ฿${amount} จาก ${u.email} (${what})`); return json({ ok: true, approved: true, id: p.id }); }
  await notify(env, `💳 สลิปใหม่ ฿${amount} จาก ${u.email} (${what})${c.amount != null ? ` · API อ่านยอดได้ ฿${c.amount}` : ''}${c.code ? ` · code ${c.code}` : ''}`);
  return json({ ok: true });
}

// สลิปที่ถูกปฏิเสธแต่ผล API บอกว่าสลิปจริง ยอดตรง และผู้รับเป็นบัญชีร้าน = น่าจะปฏิเสธผิด (ใช้ติดป้ายในหลังบ้าน ไม่อนุมัติเอง)
export function slipLooksOk(p, s) {
  let d; try { d = JSON.parse(p.slip_check || ''); } catch { return false; }
  const slip = d?.data || d; if (!(d?.success || d?.status === 200)) return false;
  const amt = slipAmount(slip); if (amt == null || (p.kind !== 'topup' && Math.abs(amt - p.amount) > 0.001)) return false;
  return receiverMatches(slip, [s.easyslip_receiver, s.promptpay_id, s.bank_account].flatMap(x => String(x || '').split(/[,\n]/)).map(x => x.trim()).filter(Boolean)) === true;
}
// เพดานใช้ Wallet ต่อวันที่ผู้ใช้ตั้งเอง (users.wallet_day_cap) · วันตามเวลาไทย · true = ใช้ครบแล้ววันนี้
export async function dayCapHit(env, uid) {
  const r = await env.DB.prepare('SELECT wallet_day_cap c FROM users WHERE id=?').bind(uid).first(); if (!(r?.c > 0)) return false;
  const start = Math.floor((Date.now() + 7 * 3600e3) / DAY) * DAY - 7 * 3600e3;
  const x = await env.DB.prepare("SELECT -COALESCE(SUM(amount),0) v FROM wallet_tx WHERE user_id=? AND amount<0 AND kind IN ('wallet','overflow','api') AND created_at>=?").bind(uid, start).first();
  return x.v >= r.c;
}
