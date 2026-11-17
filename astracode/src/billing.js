import { DAY, err, flat, hex, json, limited, rand, sha, slipPut, userErr, viaProxy } from './core.js';
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
export async function blockedText(env, text) {
  const words = String(await getSetting(env, 'block_words') || '').split(/[,\n]/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 2);
  if (!words.length) return false; const t = String(text || '').toLowerCase();
  return words.some(w => t.includes(w));
}
export async function priceOf(env, m, base) {
  const mk = +(await getSetting(env, 'price_markup')) || 0, off = !base && promoOn(m) ? 1 - Math.min(m.promo_pct, 100) / 100 : 1;
  const p = (v, c) => r4((v ?? c * (1 + mk / 100)) * off);
  return { in: p(m.price_in, m.cost_in), out: p(m.price_out, m.cost_out), cache: p(m.price_cache, m.cost_cache), write: p(m.price_cache_write, m.cost_cache_write), req: flat(m) ? p(m.req_price, m.req_cost) : 0 }; // req > 0 = คิดเหมาต่อ request
}
export async function walletAdd(env, uid, amount, kind, ref) {
  const r = await env.DB.prepare('UPDATE users SET balance=ROUND(balance+?,4) WHERE id=? RETURNING balance').bind(amount, uid).first();
  await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(uid, amount, r?.balance ?? 0, kind, ref ?? null, Date.now()).run();
  return r?.balance;
}
// อีเมล (Resend) และแจ้งเตือนแอดมิน (Discord webhook / LINE Messaging API)
export const mailBox = (title, body, btn, link) => `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:28px;background:#000;color:#f5f5f7;border-radius:20px"><h2 style="margin:0 0 12px">${title}</h2><p style="color:#c7c7cc;line-height:1.6">${body}</p>${btn ? `<a href="${link}" style="display:inline-block;margin-top:12px;background:#0071e3;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">${btn}</a>` : ''}<p style="color:#86868b;font-size:12px;margin-top:28px">AstraCode</p></div>`;
export async function mail(env, to, subject, html) {
  if (!env.RESEND_KEY || !to || to.endsWith('.local')) return false;
  const from = (await getSetting(env, 'mail_from')) || 'AstraCode <onboarding@resend.dev>';
  try { return (await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_KEY }, body: JSON.stringify({ from, to, subject, html }) })).ok; }
  catch { return false; }
}
export async function notify(env, text) {
  const s = await getSettings(env, ['alert_discord', 'alert_line_to']), jobs = [];
  if (s.alert_discord) jobs.push(fetch(s.alert_discord, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900), allowed_mentions: { parse: [] } }) })); // กันข้อความผู้ใช้ปิง @everyone
  if (env.LINE_ALERT_TOKEN && s.alert_line_to) jobs.push(fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LINE_ALERT_TOKEN }, body: JSON.stringify({ to: s.alert_line_to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) }));
  await Promise.allSettled(jobs);
}
export async function event(env, kind, model_id, detail) {
  await env.DB.prepare('INSERT INTO events (kind,model_id,detail,created_at) VALUES (?,?,?,?)').bind(kind, model_id ?? null, detail ?? null, Date.now()).run();
  if (kind === 'error') { // แจ้งแอดมินครั้งแรกของแต่ละโมเดลในรอบ 30 นาที
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE kind='error' AND model_id IS ? AND created_at>?").bind(model_id ?? null, Date.now() - 1800e3).first();
    if (n.n === 1) {
      const d = String(detail), hint = /insufficient_credit|402|quota|balance|เครดิต/i.test(d) ? '💳 เครดิตของผู้ขายน่าจะหมด: เติมเครดิต' : /not bound|403|invalid.?api.?key|401|unauthor/i.test(d) ? '🔑 คีย์ใช้ไม่ได้/ไม่ผูกช่องทาง: ตรวจ Worker secret ของโมเดลนี้' : /timeout|timed out|หมดเวลา|stall/i.test(d) ? '⏱️ ผู้ขายตอบช้า/ไม่ตอบ' : '';
      await notify(env, `⚠️ AstraCode: โมเดล #${model_id} ตอบไม่ได้${hint ? '\n' + hint : ''}\n${d.slice(0, 300)}`);
    }
  }
}
export async function audit(env, u, action, detail) {
  await env.DB.prepare('INSERT INTO audit (admin_id,admin_email,action,detail,created_at) VALUES (?,?,?,?,?)').bind(u.id, u.email, action, JSON.stringify(detail ?? null).slice(0, 2000), Date.now()).run();
}
export const origin = (req, env) => (env.PUBLIC_URL || '').replace(/\/$/, '') || (viaProxy(req, env) && req.headers.get('x-forwarded-host') ? 'https://' + req.headers.get('x-forwarded-host') : new URL(req.url).origin);
export async function newToken(env, uid, kind, ms) { const t = rand(24); await env.DB.prepare('INSERT INTO tokens VALUES (?,?,?,?)').bind(await sha(t), uid, kind, Date.now() + ms).run(); return t; }
export async function useToken(env, t, kind) {
  const r = await env.DB.prepare('DELETE FROM tokens WHERE hash=? AND kind=? RETURNING user_id, expires').bind(await sha(String(t || '')), kind).first();
  return r && r.expires > Date.now() ? r.user_id : null;
}
// ตรวจสลิปผ่าน API: เลือกผู้ให้บริการในหลังบ้าน (slip2go / byshop / ไม่ใช้)
// code: ผลแบบ Slip2Go (200200 = ผ่านทุกเงื่อนไข, 200401 บัญชีผู้รับไม่ตรง, 200402 ยอดไม่ตรง, 200500 สลิปปลอม, 200501 สลิปซ้ำ, 200404 ไม่พบ)
export const SLIP_FAIL = { '200401': 'บัญชีผู้รับเงินไม่ตรงกับร้าน', '200402': 'ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องจ่าย', '200403': 'สลิปหมดอายุ: ต้องอัปโหลดภายใน 15 นาทีหลังโอน (หรือวันที่ในสลิปไม่ถูกต้อง)', '200404': 'ยอดในสลิปต่ำกว่ายอดเติมขั้นต่ำ', '200500': 'สลิปไม่ถูกต้องหรือเป็นสลิปปลอม', '200501': 'สลิปนี้ถูกใช้ไปแล้ว' };
export async function checkSlip(env, buf, type, amount, flex = false) { // flex = เติม Wallet: EasySlip เติมตามยอดในสลิป ไม่ต้องตรงกับที่กรอก
  const s = await getSettings(env, ['slip_provider', 'slip_api_url', 'slip_amount_field', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account', 'easyslip_url', 'easyslip_receiver', 'easyslip_receiver_names', 'promptpay_id', 'bank_account', 'topup_min']);
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
export const SLIP_MAX_AGE = 15 * 60e3; // สลิปใช้ได้ภายใน 15 นาทีหลังโอนเท่านั้น
const nameKey = x => String(x || '').normalize('NFC').replace(/(?:นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|miss|ms\.?)/gi, '').replace(/[\s.]/g, '').toLowerCase();
// ชื่อผู้รับในสลิป (ไทย) เทียบกับรายชื่อที่อนุญาต · true = ตรงอย่างน้อยหนึ่งชื่อ · false = มีชื่อไทยแต่ไม่ตรง · null = สลิปไม่มีชื่อไทยให้เทียบ
export function receiverNameMatches(slip, allowed) {
  const found = []; (function walk(o, k) { if (typeof o === 'string' && /^(th|name)$/i.test(k || '') && /[ก-๛]/.test(o)) found.push(o); else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) walk(v, kk); })(slip?.receiver?.account?.name ?? slip?.rawSlip?.receiver?.account?.name, 'name');
  if (!found.length) return null;
  return found.some(f => allowed.some(a => { const w = nameKey(a); return w && nameKey(f).includes(w); })); // ชื่อในสลิปมักตัดนามสกุลเหลือตัวอักษรแรก จึงรองรับ "ชื่อต้นอย่างเดียว" ที่ใส่เป็นชื่อสำรอง
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
  d ||= {}; const st = +d.status || r.status, msg = String(d.message || d.error?.message || ''), slip = d.data && typeof d.data === 'object' ? d.data : null;
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
  const dg = receiverMatches(slip, wantAcc.length ? wantAcc : [s.promptpay_id, s.bank_account].filter(Boolean)), nm = names.length ? receiverNameMatches(slip, names) : null;
  // มีรายชื่อผู้รับที่อนุญาต: ชื่อตรง (เต็มหรือเฉพาะชื่อต้นที่สำรองไว้) แล้วเลขบัญชีต้องไม่ขัดแย้ง · ชื่อไม่ตรง = ปฏิเสธ · ชื่อในสลิปเทียบไม่ได้ ใช้เลขบัญชีตัดสินแทน
  if (names.length) { if (nm === false || dg === false) return out('200401'); if (nm === true) return out('200000'); return dg === true ? out('200000') : out('receiver_unverified'); }
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
export async function applyPayment(env, p) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(p.user_id).first();
  if (p.kind === 'topup') await walletAdd(env, u.id, p.amount, 'topup', 'payment#' + p.id);
  else {
    const days = p.period === 'year' ? 365 : 30, now = Date.now();
    const pl = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(p.plan_id).first();
    if (pl && pl.seats > 1) {
      const ex = await env.DB.prepare('SELECT * FROM teams WHERE owner_id=? ORDER BY id DESC LIMIT 1').bind(u.id).first();
      let base = ex && ex.plan_id === p.plan_id && ex.expires > now ? ex.expires : now;
      if (ex && ex.plan_id !== p.plan_id && ex.expires > now) base = now + carryMs(await env.DB.prepare('SELECT price,price_year FROM plans WHERE id=?').bind(ex.plan_id).first(), u.plan_period, ex.expires - now, pl, p.period); // อัปเกรดทีม: ทบเวลาที่เหลือ
      const exp = base + days * DAY;
      if (ex) {
        await env.DB.prepare('UPDATE teams SET plan_id=?, expires=?, max_seats=?, shared_pool=? WHERE id=?').bind(pl.id, exp, pl.seats, pl.shared_pool ? 1 : 0, ex.id).run();
      } else {
        const t = await env.DB.prepare('INSERT INTO teams (name,owner_id,plan_id,expires,invite_code,max_seats,shared_pool,created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id')
          .bind('ทีมของ ' + u.email.split('@')[0], u.id, pl.id, exp, rand(4).toUpperCase(), pl.seats, pl.shared_pool ? 1 : 0, now).first();
        await env.DB.prepare("INSERT OR IGNORE INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,'owner',?)").bind(t.id, u.id, now).run();
      }
    } else {
      let base = u.plan_id === p.plan_id && u.plan_expires > now ? u.plan_expires : now; // ต่ออายุแพลนเดิมต่อท้าย
      if (u.plan_id && u.plan_id !== p.plan_id && u.plan_expires > now) base = now + carryMs(await env.DB.prepare('SELECT price,price_year FROM plans WHERE id=?').bind(u.plan_id).first(), u.plan_period, u.plan_expires - now, pl || { price: 0 }, p.period); // เปลี่ยนแพลน: ทบเวลาที่เหลือ
      await env.DB.prepare('UPDATE users SET plan_id=?, plan_expires=?, plan_period=? WHERE id=?').bind(p.plan_id, base + days * DAY, p.period, u.id).run();
    }
  }
  await useCoupon(env, p.coupon, u.id);
  if (u.referred_by && !u.ref_rewarded && !['wallet', 'coupon'].includes(p.slip_key)) { // คนที่ถูกชวนจ่ายเงินจริงครั้งแรก: ได้เครดิตทั้งคู่
    const bonus = +(await getSetting(env, 'referral_bonus')) || 0;
    await env.DB.prepare('UPDATE users SET ref_rewarded=1 WHERE id=?').bind(u.id).run();
    if (bonus > 0) { await walletAdd(env, u.id, bonus, 'referral', 'ref'); await walletAdd(env, u.referred_by, bonus, 'referral', 'user#' + u.id); }
  }
  await mail(env, u.email, 'AstraCode: ชำระเงินสำเร็จ', mailBox('ชำระเงินสำเร็จ', p.kind === 'topup' ? `เติมเงิน ฿${p.amount} เข้า Wallet แล้ว` : 'เปิดแพลนให้แล้ว ใช้งานได้ทันที'));
}
export async function pay(req, env, u) {
  const fd = await req.formData(), kind = fd.get('kind') === 'topup' ? 'topup' : 'plan';
  let plan = null, period = 'month', amount, coupon = null, discount = 0;
  if (kind === 'plan') {
    plan = await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1 AND price>0').bind(fd.get('plan_id')).first();
    if (!plan) return err('ไม่พบแพลน');
    period = fd.get('period') === 'year' && plan.price_year ? 'year' : 'month';
    amount = period === 'year' ? plan.price_year : plan.price;
    coupon = await couponFor(env, u, fd.get('coupon'), 'plan');
    discount = discountOf(coupon, amount); amount = Math.round((amount - discount) * 100) / 100;
  } else {
    amount = Math.round(+fd.get('amount') * 100) / 100;
    const min = +(await getSetting(env, 'topup_min')) || 20;
    if (!(amount >= min && amount <= 50000)) return err(`เติมเงินได้ ฿${min} ถึง ฿50,000`);
  }
  if (await limited(env, 'pay:' + u.id, 5, 3600e3)) return err('ส่งสลิปบ่อยเกินไป รอ 1 ชั่วโมง', 429);
  if (kind === 'plan' && fd.get('wallet') === '1' && amount > 0) { // จ่ายด้วยเงินใน Wallet: เปิดแพลนทันที
    if (!await claimCoupon(env, coupon?.code, u.id)) return err('คูปองใช้ไม่ได้หรือหมดอายุ');
    const left = await env.DB.prepare('UPDATE users SET balance=ROUND(balance-?,4) WHERE id=? AND balance>=? RETURNING balance').bind(amount, u.id, amount).first(); // ตัดเงินแบบ atomic กันกดซ้ำพร้อมกัน
    if (!left) { await releaseCoupon(env, coupon?.code, u.id); return err('ยอดเงินใน Wallet ไม่พอ'); }
    await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -amount, left.balance, 'plan', plan.name, Date.now()).run();
    const p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?,?,?) RETURNING *")
      .bind(u.id, plan.id, amount, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
    await applyPayment(env, p);
    return json({ ok: true, approved: true, id: p.id });
  }
  if (await env.DB.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").bind(u.id).first()) return err('มีคำขอที่รออนุมัติอยู่แล้ว');
  if (amount <= 0) { // คูปองลด 100%: เปิดแพลนทันที ไม่ต้องใช้สลิป
    if (!await claimCoupon(env, coupon?.code, u.id)) return err('คูปองใช้ไม่ได้หรือหมดอายุ');
    const p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,0,'coupon','approved',?,?,?,?,?,?) RETURNING *")
      .bind(u.id, plan.id, kind, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
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
  await slipPut(env, key, buf, type);
  const c = await checkSlip(env, buf, type, amount, kind === 'topup');
  if (c.ref && await env.DB.prepare('SELECT 1 FROM payments WHERE slip_ref=?').bind(c.ref).first()) c.code = '200501'; // สลิปที่เคยสแกนแล้วใช้ซ้ำไม่ได้ แม้ครั้งก่อนถูกปฏิเสธ // เลขอ้างอิงธนาคารซ้ำในระบบเรา
  if (kind === 'topup' && c.flex && c.code === '200000') { // เติมเงินด้วย EasySlip: ได้ยอดตามสลิป (ไม่ต้องตรงกับที่กรอก) ขั้นต่ำตามที่ตั้ง
    const min = +(await getSetting(env, 'topup_min')) || 20;
    if (!(c.amount >= min)) c.code = '200404'; else if (c.amount > 50000) c.code = 'over_limit'; else amount = Math.round(c.amount * 100) / 100;
  }
  const fail = SLIP_FAIL[c.code];
  if (c.code != null) { // ระบบตรวจสลิปอัตโนมัติพัง (คีย์/URL/รูปแบบคำขอผิด) ติดกัน 3 ครั้ง = เตือนแอดมินชัดๆ ไม่ใช่ปล่อยค้างรอเงียบๆ
    const broken = !fail && !['200000', '200200'].includes(c.code), n = broken ? (+(await getSetting(env, 'slip_fail_streak')) || 0) + 1 : 0;
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('slip_fail_streak', String(n)).run();
    if (n === 3) await notify(env, `⚠️ ตรวจสลิปอัตโนมัติไม่สำเร็จ 3 ครั้งติดกัน (ล่าสุด: ${String(c.code).slice(0, 120)}) สลิปค้างรออนุมัติเอง · เช็คคีย์/URL ในหน้าตั้งค่า แล้วกด Test connection`);
  }
  // ผ่านทุกเงื่อนไข (หรือพบสลิปและยอดตรง) และเปิดอนุมัติอัตโนมัติ: เปิดแพลน/เติมเงินทันที
  const pass = !fail && (c.code === '200200' || (c.code === '200000' && c.amount === amount)) && (await getSetting(env, 'slip_auto_approve')) !== '0';
  const now = Date.now(), what = kind === 'topup' ? 'เติม Wallet' : plan.name + (period === 'year' ? ' รายปี' : '');
  // ดัชนี unique (slip_key, slip_ref) กันสลิปเดียวส่งพร้อมกันสองครั้งแล้วอนุมัติซ้ำ: ตัวที่สองชนดัชนีและถูกปฏิเสธก่อนถึง applyPayment
  const p = await env.DB.prepare('INSERT INTO payments (user_id,plan_id,amount,slip_key,slip_check,slip_amount,slip_ref,status,approved_at,created_at,kind,period,coupon,discount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .bind(u.id, plan?.id || 0, amount, key, c.result, c.amount, c.ref || null, fail ? 'rejected' : pass ? 'approved' : 'pending', pass ? now : null, now, kind, period, fail ? null : coupon?.code || null, discount).first().catch(e => { if (/UNIQUE/i.test(e.message)) return null; throw e; });
  if (!p) return err('สลิปนี้ถูกใช้แล้ว');
  if (fail) { await notify(env, `⛔ สลิปไม่ผ่าน ฿${amount} จาก ${u.email} (${what}): ${fail}`); return err(fail + ' ถ้าคิดว่าผิดพลาด ติดต่อเราที่หน้า "ติดต่อเรา"'); }
  if (pass) { await applyPayment(env, p); await notify(env, `✅ อนุมัติอัตโนมัติ ฿${amount} จาก ${u.email} (${what})`); return json({ ok: true, approved: true, id: p.id }); }
  await notify(env, `💳 สลิปใหม่ ฿${amount} จาก ${u.email} (${what})${c.amount != null ? ` · API อ่านยอดได้ ฿${c.amount}` : ''}${c.code ? ` · code ${c.code}` : ''}`);
  return json({ ok: true });
}
