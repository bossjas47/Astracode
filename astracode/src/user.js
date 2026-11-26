import { connectorRoutes, pluginRoutes } from './connectors.js';
import { multiOn, BKK, DAY, getUser, allowedModels, creditList, creditsInit, err, esc, ip, json, limited, logReset, planOf, rand, resetUsage, same, sessionCookie, sha, touchWindows, usageStatus, WALLET_MIN } from './core.js';
import { callModel, chat, ensureImgTable, imageEditCall, IMG_REF_MAX, isSafeMcpUrl, logUsage, mcpSync, putImage } from './ai.js';
import { audit, claimCoupon, couponFor, discountOf, event, getSetting, getSettings, mail, mailBox, newToken, notify, origin, siteUrl, walletAdd } from './billing.js';
import { b64, projects, seal, unb64, unseal } from './projects.js';
import { admin } from './admin.js';
import { agentQuality, ensureRemote, monthKey } from './api.js';
import { status } from './jobs.js';
import { cloudApi, pyApi } from './cloud.js';
import { googleConnectFinish, googleConnectStart, googleDisconnect, googleStatus } from './google.js';
export const ZIPREF_MAX = 25e6, ZIPREF_TEXT_MAX = 20e6;
// ---------- ผู้ใช้: ตั้งค่า, ความจำ, โฟลเดอร์, wallet, คูปอง, API key, 2FA, ข้อมูลส่วนตัว, ใบเสร็จ, ซัพพอร์ต, สร้างรูป, เติมโค้ด ----------
// ประวัติการจัดการทีม (หัวหน้าทีมดูได้)
const PUBLIC_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|mac|proton|protonmail|aol|gmx|mail|yandex|zoho)\.[a-z.]+$/;
// ล็อกอินด้วยอีเมล @โดเมนบริษัท: เข้าทีมที่ตั้งโดเมนนี้เองถ้ายังไม่อยู่ทีมไหนและที่นั่งยังว่าง (เรียกจาก /api/me)
export async function autoJoinTeam(env, u) {
  const dm = String(u.email || '').split('@')[1]; if (!dm || PUBLIC_MAIL.test(dm) || !u.email_verified) return null; // ต้องยืนยันอีเมลแล้ว: กันสมัครด้วยอีเมลบริษัทคนอื่นเพื่อแอบเข้าทีม
  const t = await env.DB.prepare('SELECT id, max_seats FROM teams WHERE domain=? AND expires>?').bind(dm, Date.now()).first(); if (!t) return null;
  if (await env.DB.prepare('SELECT 1 FROM team_members WHERE user_id=?').bind(u.id).first()) return null;
  const r = await env.DB.prepare("INSERT INTO team_members (team_id,user_id,role,joined_at) SELECT ?1,?2,'member',?3 WHERE (SELECT COUNT(*) FROM team_members WHERE team_id=?1) < ?4").bind(t.id, u.id, Date.now(), t.max_seats).run();
  if (r.meta?.changes) { await teamLog(env, t.id, u.id, 'auto join', '@' + dm); return t.id; }
  return null;
}
export const teamLog = (env, teamId, uid, action, detail = '') => env.DB.prepare('INSERT INTO team_log (team_id,user_id,action,detail,created_at) VALUES (?,?,?,?,?)').bind(teamId, uid || null, action, String(detail || '').slice(0, 300), Date.now()).run().catch(() => {});
let agentQCache = { exp: 0, v: [] };
export async function userRoutes(req, env, ctx, url, path, M, u) {
  if (path === '/api/agent/quality' && M === 'GET') { // โมเดลที่สถิติงาน Agent แย่ (หน้าเว็บเตือนก่อนเริ่ม Agent) · จำไว้ใน isolate 10 นาที
    if (!(agentQCache.exp > Date.now())) agentQCache = { exp: Date.now() + 600e3, v: (await agentQuality(env, 14).catch(() => [])).filter(x => x.flagged).map(({ model, n, reason }) => ({ model, n, reason })) };
    return json({ flagged: agentQCache.v });
  }
  if (path.startsWith('/api/connectors')) { const cr = await connectorRoutes(req, env, url, path, M, u); if (cr) return cr; }
  if (path.startsWith('/api/plugins')) { const pr = await pluginRoutes(req, env, path, M, u); if (pr) return pr; }
  const DB = env.DB; let r;
  // zip ที่แนบในแชต: เก็บ zip ต้นฉบับ + ไฟล์ข้อความ (JSON) ใน R2 · AI เปิดอ่านทีละไฟล์ด้วยเครื่องมือ read_file แทนการยัดทั้งก้อนลงข้อความ
  if (path === '/api/zipref' && M === 'POST') {
    if (!env.SLIPS) return err('ยังไม่ได้ตั้งที่เก็บไฟล์ (R2)', 501);
    if (await limited(env, 'zipref:' + u.id, 30, 3600e3)) return err('อัปโหลด zip บ่อยเกินไป รอสักครู่', 429);
    const fd = await req.formData(), zip = fd.get('zip'), raw = String(fd.get('files') || '');
    if (!(zip instanceof File) || zip.size > ZIPREF_MAX) return err('zip ต้องไม่เกิน 25MB');
    if (raw.length > ZIPREF_TEXT_MAX) return err('ไฟล์ข้อความใน zip รวมกันใหญ่เกิน 20MB');
    let files; try { files = JSON.parse(raw); } catch { return err('ข้อมูลไฟล์ไม่ถูกต้อง'); }
    if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length > 5000 || Object.values(files).some(v => typeof v !== 'string')) return err('ข้อมูลไฟล์ไม่ถูกต้อง');
    const id = rand(8);
    await env.SLIPS.put(`zip/${u.id}/${id}.zip`, await zip.arrayBuffer(), { httpMetadata: { contentType: 'application/zip' } });
    await env.SLIPS.put(`zip/${u.id}/${id}.json`, raw, { httpMetadata: { contentType: 'application/json' } });
    return json({ id });
  }
  if ((r = path.match(/^\/api\/zipref\/([0-9a-f]{16})(\/raw)?$/)) && M === 'GET') { // ของตัวเองเท่านั้น (คีย์มี user id)
    const o = env.SLIPS && await env.SLIPS.get(`zip/${u.id}/${r[1]}.${r[2] ? 'zip' : 'json'}`);
    if (!o) return err('ไม่พบไฟล์ zip นี้แล้ว', 404);
    return new Response(o.body, { headers: { 'content-type': r[2] ? 'application/zip' : 'application/json', 'cache-control': 'private, max-age=3600' } });
  }
  if (path === '/api/limits/reset' && M === 'POST') { // ผู้ใช้กดใช้สิทธิ์รีเซ็ตที่แอดมินแจก · ขอบเขตกำหนดโดยแอดมินตอนแจก ผู้ใช้เลือกเองไม่ได้ (ส่งแค่ k ของสิทธิ์ที่มีอยู่)
    const b = await req.json(), plan = await planOf(env, u), k = String(b.k || '');
    if (plan?._team?.shared_pool) return err('แพลนทีมใช้ลิมิตรวมกัน รีเซ็ตเองไม่ได้ ติดต่อแอดมิน', 400);
    if (await limited(env, 'rst:' + u.id, 10, 60e3)) return err('กดเร็วเกินไป รอสักครู่', 429);
    await creditsInit(env);
    let sc = null, used, now = Date.now();
    // ใช้สิทธิ์ที่ใกล้หมดอายุก่อน · ไม่นับสิทธิ์ที่หมดอายุแล้ว
    const take = (cond, ...args) => DB.prepare(`DELETE FROM reset_grants WHERE id=(SELECT id FROM reset_grants WHERE user_id=?1 AND (expires_at IS NULL OR expires_at>?2) AND ${cond} ORDER BY expires_at IS NULL, expires_at LIMIT 1)`).bind(u.id, now, ...args).run();
    if (k === 'all') {
      used = await take('vendor IS NULL AND model_id IS NULL');
      if (!used.meta.changes) used = await DB.prepare('UPDATE reset_credits SET n=n-1 WHERE user_id=? AND n>0').bind(u.id).run(); // สิทธิ์รุ่นเก่า (ไม่มีวันหมดอายุ)
    } else if (k.startsWith('v:') || k.startsWith('m:')) {
      const v = k.startsWith('v:'); sc = v ? { vendor: k.slice(2) } : { model_id: +k.slice(2) };
      used = await take(v ? 'vendor=?3' : 'model_id=?3', v ? sc.vendor : sc.model_id);
    } else return err('เลือกสิทธิ์ที่จะใช้');
    if (!used.meta.changes) return err('ไม่มีสิทธิ์รีเซ็ตเหลือ', 403);
    await resetUsage(env, u.id, sc);
    await audit(env, u, 'use reset credit', sc || 'all');
    const lbl = sc?.vendor ? 'ค่าย ' + sc.vendor : sc?.model_id ? 'โมเดล ' + ((await DB.prepare('SELECT name FROM models WHERE id=?').bind(sc.model_id).first())?.name || sc.model_id) : 'ทั้งหมด';
    await logReset(env, u.id, 'use', lbl, { by: u.email });
    const u2 = await DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first(), list = await creditList(env, u.id);
    return json({ ok: true, credits: list, left: list.reduce((a, x) => a + x.n, 0), usage: await usageStatus(env, u2, plan) });
  }
  if (path === '/api/limits/history' && M === 'GET') { // ประวัติสิทธิ์รีเซ็ตของตัวเอง
    await creditsInit(env);
    return json((await DB.prepare('SELECT kind,scope,n,expires_at,created_at FROM reset_log WHERE user_id=? ORDER BY id DESC LIMIT 20').bind(u.id).all()).results);
  }
  if (path === '/api/me' && M === 'PUT') {
    const b = await req.json();
    await DB.prepare('UPDATE users SET instructions=COALESCE(?,instructions), wallet_overflow=COALESCE(?,wallet_overflow), auto_renew=COALESCE(?,auto_renew) WHERE id=?')
      .bind(typeof b.instructions === 'string' ? b.instructions.slice(0, 3000) : null, 'wallet_overflow' in b ? (b.wallet_overflow ? 1 : 0) : null, 'auto_renew' in b ? (b.auto_renew ? 1 : 0) : null, u.id).run();
    if ('auto_compact' in b) await DB.prepare('UPDATE users SET auto_compact=? WHERE id=?').bind(b.auto_compact ? 1 : 0, u.id).run();
    if ('cc_first' in b) await DB.prepare('UPDATE users SET cc_first=? WHERE id=?').bind(b.cc_first ? 1 : null, u.id).run(); // เครดิต Claude ที่แถม: ใช้ก่อนลิมิตหรือไม่
    if ('auto_memory' in b) await DB.prepare('UPDATE users SET auto_memory=? WHERE id=?').bind(b.auto_memory ? 1 : 0, u.id).run();
    if ('digest' in b) await DB.prepare('UPDATE users SET digest_off=? WHERE id=?').bind(b.digest ? 0 : 1, u.id).run();
    if ('wallet_day_cap' in b) { const c = Math.round(+b.wallet_day_cap * 100) / 100; await DB.prepare('UPDATE users SET wallet_day_cap=? WHERE id=?').bind(c > 0 ? Math.min(c, 1e6) : null, u.id).run(); } // 0/ว่าง = ไม่จำกัด
    if ('webhook_url' in b) { // Webhook แจ้งเมื่อ API key ใช้งบถึง 80% / 100% (https เท่านั้น ห้ามที่อยู่ภายใน)
      const w = String(b.webhook_url || '').trim(), safe = w ? isSafeMcpUrl(w) : '';
      if (w && !safe) return err('Webhook ต้องเป็นลิงก์ https ที่เปิดสู่สาธารณะเท่านั้น');
      await DB.prepare('UPDATE users SET webhook_url=? WHERE id=?').bind(safe || null, u.id).run();
    }
    if ('auto_renew' in b && await multiOn(env)) await DB.prepare('UPDATE subscriptions SET auto_renew=? WHERE id=(SELECT primary_sub_id FROM users WHERE id=?)').bind(b.auto_renew ? 1 : 0, u.id).run().catch(() => {}); // หลายแพลน: สวิตช์เดิมของบัญชี = ใบหลัก
    if (b.auto_renew === false && typeof b.reason === 'string' && b.reason.trim()) await event(env, 'cancel', null, `${u.email}: ${b.reason.trim().slice(0, 300)}`); // เหตุผลที่ปิดต่ออายุ ให้แอดมินดูในเหตุการณ์ระบบ
    return json({ ok: true });
  }
  if (path === '/api/memories/import' && M === 'POST') { // นำเข้าความจำจาก ChatGPT/Claude: วางข้อความ แยกเป็นข้อ ๆ ข้ามที่ซ้ำ เติมจนครบ 50
    const raw = String((await req.json().catch(() => ({}))).text || '').slice(0, 30000);
    const key = s => s.toLowerCase().replace(/[\s.,!?'"“”]+/g, ''), have = (await DB.prepare('SELECT text FROM memories WHERE user_id=?').bind(u.id).all()).results.map(x => key(x.text));
    const items = [...new Set(raw.split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/).map(l => l.replace(/^\s*([-*•·▪●]|\d+[.)])\s*/, '').replace(/^(user|ผู้ใช้)\s*[:：]\s*/i, '').trim()).filter(l => l.length >= 4 && !/^(saved memories|memory|ความจำ|manage memories)$/i.test(l)))];
    let room = 50 - have.length, added = 0, skipped = 0; const now = Date.now(), q = [];
    for (const it of items) { if (room <= 0) { skipped++; continue; } if (have.includes(key(it))) { skipped++; continue; } have.push(key(it)); q.push(DB.prepare('INSERT INTO memories (user_id,text,created_at) VALUES (?,?,?)').bind(u.id, it.slice(0, 300), now + added)); added++; room--; }
    if (q.length) await DB.batch(q);
    return json({ added, skipped, total: 50 - room });
  }
  if (path === '/api/memories') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,text,created_at FROM memories WHERE user_id=? ORDER BY id').bind(u.id).all()).results);
    const text = String((await req.json()).text || '').trim().slice(0, 300);
    if (!text) return err('ข้อความว่าง');
    if ((await DB.prepare('SELECT COUNT(*) n FROM memories WHERE user_id=?').bind(u.id).first()).n >= 50) return err('จำได้สูงสุด 50 เรื่อง ลบเรื่องเก่าก่อน');
    return json(await DB.prepare('INSERT INTO memories (user_id,text,created_at) VALUES (?,?,?) RETURNING id,text').bind(u.id, text, Date.now()).first());
  }
  if ((r = path.match(/^\/api\/memories\/(\d+)$/)) && M === 'DELETE') { await DB.prepare('DELETE FROM memories WHERE id=? AND user_id=?').bind(r[1], u.id).run(); return json({ ok: true }); }
  if (path === '/api/folders') {
    if (M === 'GET') return json((await DB.prepare("SELECT f.id,f.name,(COALESCE(f.instructions,'')<>'') has_ins,(COALESCE(f.files,'[]')<>'[]') has_files,(f.team_id IS NOT NULL) shared,(f.user_id=?1) mine,ow.email owner FROM folders f JOIN users ow ON ow.id=f.user_id WHERE f.user_id=?1 OR (f.team_id IS NOT NULL AND f.team_id=(SELECT team_id FROM team_members WHERE user_id=?1)) ORDER BY f.name").bind(u.id).all()).results); // ของตัวเอง + Workspace ที่ทีมแชร์
    const b = await req.json(), name = String(b.name || '').trim().slice(0, 40); if (!name) return err('ชื่อว่าง');
    const ins = String(b.instructions || '').trim().slice(0, 4000) || null; // เทมเพลต Workspace: สร้างพร้อมคำสั่งตั้งต้น
    return json(await DB.prepare('INSERT INTO folders (user_id,name,created_at,instructions) VALUES (?,?,?,?) RETURNING id,name').bind(u.id, name, Date.now(), ins).first());
  }
  if ((r = path.match(/^\/api\/folders\/(\d+)\/share$/)) && M === 'POST') { // แชร์ Workspace ให้ทีม (คำสั่ง + เอกสาร = คลังความรู้ทีม) · เฉพาะเจ้าของ
    const f = await DB.prepare('SELECT id,name FROM folders WHERE id=? AND user_id=?').bind(r[1], u.id).first(); if (!f) return err('ไม่พบ Workspace', 404);
    const tm = await DB.prepare('SELECT team_id FROM team_members WHERE user_id=?').bind(u.id).first(); if (!tm) return err('ต้องอยู่ในทีมก่อนจึงแชร์ได้', 403);
    const on = !!(await req.json().catch(() => ({}))).on;
    await DB.prepare('UPDATE folders SET team_id=? WHERE id=?').bind(on ? tm.team_id : null, f.id).run();
    await teamLog(env, tm.team_id, u.id, on ? 'share workspace' : 'unshare workspace', f.name);
    return json({ ok: true, shared: on });
  }
  if ((r = path.match(/^\/api\/folders\/(\d+)$/))) {
    const fo = await DB.prepare('SELECT user_id, team_id FROM folders WHERE id=?').bind(r[1]).first();
    const myTeam = fo && fo.user_id !== u.id && fo.team_id ? (await DB.prepare('SELECT team_id FROM team_members WHERE user_id=?').bind(u.id).first())?.team_id : null;
    if (!fo || (fo.user_id !== u.id && !(fo.team_id && fo.team_id === myTeam))) return err('ไม่พบโฟลเดอร์', 404);
    if (fo.user_id !== u.id && M !== 'GET') return err('เฉพาะเจ้าของ Workspace แก้ไขได้ · สมาชิกทีมใช้งานได้อย่างเดียว', 403);
    if (M === 'DELETE') { await DB.batch([DB.prepare('UPDATE chats SET folder_id=NULL WHERE folder_id=?').bind(r[1]), DB.prepare('DELETE FROM folders WHERE id=?').bind(r[1])]); return json({ ok: true }); }
    if (M === 'GET') { const f = await DB.prepare('SELECT id,name,instructions,files,team_id FROM folders WHERE id=?').bind(r[1]).first(); let files = []; try { files = JSON.parse(f.files || '[]'); } catch {} return json({ ...f, shared: !!f.team_id, team_id: undefined, mine: fo.user_id === u.id, files: files.map(x => ({ name: x.name, size: x.text.length })) }); }
    const b = await req.json();
    if ('name' in b) { const name = String(b.name || '').trim().slice(0, 40); if (!name) return err('ชื่อว่าง'); await DB.prepare('UPDATE folders SET name=? WHERE id=?').bind(name, r[1]).run(); }
    if ('instructions' in b) await DB.prepare('UPDATE folders SET instructions=? WHERE id=?').bind(String(b.instructions || '').trim().slice(0, 4000) || null, r[1]).run();
    if (Array.isArray(b.files)) { // เอกสารอ้างอิงของโฟลเดอร์ (ข้อความที่อ่านจากไฟล์แล้ว) · ส่งชื่อเดิมโดยไม่มี text = เก็บของเดิมไว้
      let old = []; try { old = JSON.parse((await DB.prepare('SELECT files FROM folders WHERE id=?').bind(r[1]).first())?.files || '[]'); } catch {}
      const files = b.files.slice(0, 20).map(x => typeof x?.text === 'string' ? { name: String(x.name || 'file').slice(0, 120), text: x.text } : old.find(o => o.name === x?.name)).filter(Boolean);
      if (files.reduce((n, x) => n + x.text.length, 0) > 600000) return err('เอกสารรวมยาวเกิน 600,000 ตัวอักษร ลบบางไฟล์ออก'); // คลังความรู้: ยาวเกิน 120K ระบบส่งเฉพาะส่วนที่เกี่ยวกับคำถาม
      await DB.prepare('UPDATE folders SET files=? WHERE id=?').bind(files.length ? JSON.stringify(files) : null, r[1]).run();
    }
    return json({ ok: true });
  }
  if (path === '/api/usage/daily') { // ใช้ไปเท่าไรต่อวัน 30 วันล่าสุด (นับวันตามเวลาไทย)
    const plan = await planOf(env, u), from = Date.now() - 30 * DAY;
    const days = (await DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') d, COUNT(*) n, SUM(tokens_in) tin, SUM(tokens_out) tout, SUM(units) units FROM usage WHERE user_id=? AND created_at>=? GROUP BY d ORDER BY d").bind(u.id, from).all()).results;
    const models = (await DB.prepare('SELECT m.name, COUNT(*) n, SUM(x.tokens_in+x.tokens_out) tok FROM usage x LEFT JOIN models m ON m.id=x.model_id WHERE x.user_id=? AND x.created_at>=? GROUP BY x.model_id ORDER BY tok DESC LIMIT 8').bind(u.id, from).all()).results;
    return json({ days: days.map(r => ({ ...r, pct: plan.limit_week > 0 ? Math.round(r.units / plan.limit_week * 1000) / 10 : 0 })), models }); // pct = สัดส่วนของลิมิตสัปดาห์
  }
  if (path === '/api/notifications') { // กระดิ่ง: คำนวณจากข้อมูลที่มีอยู่ ไม่มีตารางใหม่ (อ่านแล้ว/ยัง เก็บฝั่งเบราว์เซอร์)
    const now = Date.now(), out = [];
    for (const p of (await DB.prepare("SELECT p.id,p.amount,p.status,p.kind,COALESCE(p.approved_at,p.created_at) t,pl.name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.user_id=? AND p.status IN ('approved','rejected') AND p.slip_key NOT IN ('wallet','coupon') AND COALESCE(p.approved_at,p.created_at)>? ORDER BY t DESC LIMIT 10").bind(u.id, now - 14 * DAY).all()).results)
      out.push({ t: p.t, kind: p.status === 'approved' ? 'ok' : 'bad', text: p.status === 'approved' ? (p.kind === 'topup' ? `เติมเงิน ฿${p.amount} เข้า Wallet แล้ว` : `ชำระเงิน ฿${p.amount} สำเร็จ เปิดแพลน ${p.name || ''} แล้ว`) : `สลิป ฿${p.amount} ไม่ผ่านการตรวจ`, href: '/account' });
    if (u.plan_id && u.plan_expires > now && u.plan_expires < now + 3 * DAY) out.push({ t: u.plan_expires - 3 * DAY, kind: 'warn', text: `แพลนจะหมดอายุ ${new Date(u.plan_expires + BKK).toISOString().slice(0, 10)}`, href: '/plans' });
    for (const k of (await DB.prepare('SELECT name,budget,spent,last_used FROM api_keys WHERE user_id=? AND revoked=0 AND budget>0 AND spent_month=? AND spent>=budget*0.8').bind(u.id, monthKey()).all()).results)
      out.push({ t: k.last_used || now, kind: k.spent >= k.budget ? 'bad' : 'warn', text: `API key "${k.name}" ใช้งบเดือนนี้ไป ฿${(+k.spent).toFixed(2)} จาก ฿${k.budget}`, href: '/developers' });
    const st = await usageStatus(env, u, await planOf(env, u)).catch(() => null), day = Math.floor(now / DAY) * DAY;
    if (st?.pctWeek >= 80) out.push({ t: day, kind: st.pctWeek >= 100 ? 'bad' : 'warn', text: st.pctWeek >= 100 ? 'ลิมิตสัปดาห์เต็มแล้ว อัปเกรดแพลนหรือเติม Wallet เพื่อใช้ต่อ' : `ใช้ลิมิตสัปดาห์ไป ${Math.round(st.pctWeek)}% แล้ว`, href: '/plans' });
    return json(out.sort((a, b) => b.t - a.t));
  }
  if (path === '/api/gift') { // โค้ดของขวัญ: ตัดเงินจาก Wallet ของผู้ให้ คนรับกรอกโค้ดแล้วเงินเข้า Wallet
    if (M === 'GET') return json((await DB.prepare('SELECT code,amount,created_at,used_at FROM gift_codes WHERE from_user=? ORDER BY created_at DESC LIMIT 50').bind(u.id).all()).results);
    if (M !== 'POST') return err('method not allowed', 405);
    const gb = await req.json(), amount = Math.round(+gb.amount * 100) / 100, to = String(gb.email || '').trim().toLowerCase(), note = String(gb.message || '').trim().slice(0, 300);
    if (!(amount >= 20 && amount <= 50000)) return err('ยอดของขวัญต้องอยู่ระหว่าง ฿20–฿50,000');
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return err('อีเมลผู้รับไม่ถูกต้อง');
    if (to && await limited(env, 'giftmail:' + u.id, 10, DAY)) return err('ส่งของขวัญทางอีเมลได้วันละ 10 ครั้ง', 429);
    const took = await DB.prepare('UPDATE users SET balance=ROUND(balance-?1,4) WHERE id=?2 AND balance>=?1 RETURNING balance').bind(amount, u.id).first(); // ตัดแบบ atomic กันยอดติดลบ
    if (!took) return err('ยอดเงินใน Wallet ไม่พอ', 402);
    const code = 'GIFT-' + rand(6).toUpperCase();
    try {
      await DB.batch([DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -amount, took.balance, 'gift', code, Date.now()),
        DB.prepare('INSERT INTO gift_codes (code,amount,from_user,created_at) VALUES (?,?,?,?)').bind(code, amount, u.id, Date.now())]);
    } catch (e) { await walletAdd(env, u.id, amount, 'refund', 'gift failed').catch(() => {}); throw e; } // หักเงินแล้วแต่สร้างโค้ดไม่สำเร็จ: คืนเงิน
    if (to) await mail(env, to, `คุณได้รับของขวัญ ฿${amount} จาก Kyber`, mailBox('คุณได้รับของขวัญ', `${esc(u.email.split('@')[0])} ส่งเครดิต Kyber ฿${amount} ให้คุณ${note ? `<br><br>"${esc(note)}"` : ''}<br><br>โค้ดของขวัญ: <b style="font-size:20px;letter-spacing:1px">${code}</b><br>เข้าสู่ระบบแล้วกรอกโค้ดที่หน้าบัญชี → Wallet → "ใช้โค้ดของขวัญ"`, 'รับของขวัญ', siteUrl(env) + '/account')).catch(() => {});
    return json({ code, amount, sent: !!to });
  }
  if (path === '/api/gift/redeem' && M === 'POST') {
    if (await limited(env, 'gift:' + u.id, 10, 3600e3)) return err('ลองหลายครั้งเกินไป รอสักครู่', 429);
    const code = String((await req.json()).code || '').trim().toUpperCase();
    const at = Date.now(); // ทำใน batch เดียว (ทรานแซกชัน): ทำเครื่องหมายว่าใช้แล้ว + เติมเงิน + บันทึกบัญชี สำเร็จพร้อมกันหรือไม่สำเร็จเลย ไม่ทำให้โค้ดถูกใช้แล้วแต่เงินไม่เข้า
    const who = [code, u.id, at], got = 'FROM gift_codes WHERE code=?1 AND used_by=?2 AND used_at=?3';
    const rs = code ? await DB.batch([DB.prepare('UPDATE gift_codes SET used_by=?2, used_at=?3 WHERE code=?1 AND used_by IS NULL RETURNING amount').bind(...who),
      DB.prepare(`UPDATE users SET balance=ROUND(balance+(SELECT amount ${got}),4) WHERE id=?2 AND EXISTS (SELECT 1 ${got})`).bind(...who),
      DB.prepare(`INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) SELECT ?2, g.amount, (SELECT balance FROM users WHERE id=?2), 'gift', ?1, ?3 FROM gift_codes g WHERE g.code=?1 AND g.used_by=?2 AND g.used_at=?3`).bind(...who)]) : [];
    const g = rs[0]?.results?.[0];
    if (!g) return err('โค้ดของขวัญไม่ถูกต้องหรือถูกใช้ไปแล้ว', 404);
    return json({ ok: true, amount: g.amount, balance: (await DB.prepare('SELECT balance FROM users WHERE id=?').bind(u.id).first()).balance });
  }
  if (path === '/api/team/usage.csv') { // หัวหน้าทีม: การใช้ของสมาชิก 7 และ 30 วัน (หน่วย = บาทต้นทุนที่หักลิมิต)
    const own = await DB.prepare("SELECT team_id FROM team_members WHERE user_id=? AND role='owner'").bind(u.id).first();
    if (!own) return err('เฉพาะหัวหน้าทีมเท่านั้น', 403);
    const now = Date.now(), rows = (await DB.prepare(`SELECT u.email, tm.role, (SELECT COUNT(*) FROM usage g WHERE g.user_id=u.id AND g.created_at>=?2) n30,
      (SELECT COALESCE(SUM(g.units),0) FROM usage g WHERE g.user_id=u.id AND g.created_at>=?3) u7, (SELECT COALESCE(SUM(g.units),0) FROM usage g WHERE g.user_id=u.id AND g.created_at>=?2) u30
      FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=?1 ORDER BY u30 DESC`).bind(own.team_id, now - 30 * DAY, now - 7 * DAY).all()).results;
    const csv = '\ufeffemail,role,requests_30d,units_7d,units_30d\n' + rows.map(r => [r.email, r.role, r.n30, (+r.u7).toFixed(4), (+r.u30).toFixed(4)].join(',')).join('\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="team-usage.csv"' } });
  }
  if (path === '/api/wallet') {
    const ref = await DB.prepare('SELECT COUNT(*) n, SUM(ref_rewarded) paid FROM users WHERE referred_by=?').bind(u.id).first();
    return json({ balance: u.balance, ref_code: u.ref_code, referred: ref.n, referred_paid: ref.paid || 0, bonus: +(await getSetting(env, 'referral_bonus')) || 0, aff_pct: +(await getSetting(env, 'aff_pct')) || 0, aff_total: (await DB.prepare("SELECT COALESCE(SUM(amount),0) n FROM wallet_tx WHERE user_id=? AND kind='affiliate'").bind(u.id).first()).n,
      tx: (await DB.prepare('SELECT amount,balance_after,kind,ref,created_at FROM wallet_tx WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(u.id).all()).results });
  }
  if (path === '/api/coupon/check' && M === 'POST') {
    const b = await req.json(), plan = await DB.prepare('SELECT * FROM plans WHERE id=?').bind(b.plan_id).first();
    const c = await couponFor(env, u, b.code, 'plan'); if (!c) return err('ใส่โค้ดคูปอง');
    const base = plan ? (b.period === 'year' && plan.price_year ? plan.price_year : plan.price) : 0, amount = plan?.per_seat ? base * Math.max(plan.seats || 3, Math.min(100, Math.floor(+b.seats || 0))) : base;
    return json({ code: c.code, kind: c.kind, value: c.value, discount: discountOf(c, amount), total: Math.max(0, amount - discountOf(c, amount)) });
  }
  if (path === '/api/coupon/redeem' && M === 'POST') {
    const c = await couponFor(env, u, (await req.json()).code, 'credit');
    if (!c) return err('ใส่โค้ดคูปอง');
    if (!await claimCoupon(env, c.code, u.id)) return err('คุณใช้คูปองนี้ไปแล้ว หรือคูปองเต็มสิทธิ์แล้ว'); // atomic: กันกดซ้ำพร้อมกัน และกันเกิน max_uses เมื่อหลายคนกดพร้อมกัน
    return json({ ok: true, amount: c.value, balance: await walletAdd(env, u.id, c.value, 'coupon', c.code) });
  }
  if (path === '/api/keys/live' && M === 'GET') { const { liveStats } = await import('./apiplus.js'); return json(await liveStats(env, u, await planOf(env, u))); } // Live Dashboard ต่อ key
  if ((r = path.match(/^\/api\/keys\/(\d+)\/memory$/)) && (M === 'GET' || M === 'DELETE')) { const { memoryApi } = await import('./apiplus.js'); return memoryApi(env, u, +r[1], M); } // Kyber Memory: ดู/ล้างโน้ตโปรเจกต์ของ key
  if (path === '/api/keys/stats') {
    const from = Date.now() - 14 * DAY;
    const rows = (await DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') d, COUNT(*) n, COALESCE(SUM(-amount),0) spent FROM wallet_tx WHERE user_id=? AND kind='api' AND created_at>=? GROUP BY d ORDER BY d").bind(u.id, from).all()).results;
    return json(rows);
  }
  if (path === '/api/setup-cmd' && M === 'POST') { // คำสั่งติดตั้ง 1 บรรทัด: สร้าง key ใหม่ + ลิงก์สคริปต์ใช้ครั้งเดียว
    if (!((await planOf(env, u))?.price > 0) && !(u.balance >= WALLET_MIN) && !(await import('./credits.js').then(C => C.modelCreditIds(env, u.id)).catch(() => new Set())).size) return err('เติม Wallet (ขั้นต่ำ ฿1) หรือใช้แพลนที่ชำระเงิน เพื่อเชื่อมต่อโปรแกรม', 403);
    if ((await planOf(env, u))?._team?.api_off) return err('หัวหน้าทีมปิดสิทธิ์สร้าง API key ของคุณไว้', 403);
    if (await limited(env, 'setupcmd:' + u.id, 10, 3600e3)) return err('สร้างคำสั่งบ่อยเกินไป ลองใหม่ภายหลัง', 429);
    const { setupApi } = await import('./setup.js'); return setupApi(req, env, u, new URL(req.url).origin);
  }
  if (path === '/api/keys') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,name,prefix,created_at,last_used,budget,models,use_plan,ip_allow,expires_at,memory,CASE WHEN spent_month=? THEN spent ELSE 0 END spent FROM api_keys WHERE user_id=? AND revoked=0 ORDER BY id DESC').bind(monthKey(), u.id).all()).results);
    if (M === 'POST' && !((await planOf(env, u))?.price > 0) && !(u.balance >= WALLET_MIN) && !(await import('./credits.js').then(C => C.modelCreditIds(env, u.id)).catch(() => new Set())).size) return err('เติม Wallet (ขั้นต่ำ ฿1) หรือใช้แพลนที่ชำระเงิน เพื่อสร้าง API key', 403);
    if (M === 'POST' && (await planOf(env, u))?._team?.api_off) return err('หัวหน้าทีมปิดสิทธิ์สร้าง API key ของคุณไว้', 403);
    if ((await DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n >= 10) return err('สร้าง key ได้สูงสุด 10 อัน');
    const kb = await req.json(), name = String(kb.name || 'default').trim().slice(0, 40) || 'default', key = 'sk-astra-' + rand(24), days = Math.min(3650, Math.max(0, Math.floor(+kb.days) || 0)); // days = อายุ key (0 = ไม่หมดอายุ)
    await DB.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(u.id, name, await sha(key), key.slice(0, 14), Date.now(), days ? Date.now() + days * DAY : null).run();
    return json({ key }); // แสดงครั้งเดียว เก็บแค่ hash
  }
  if ((r = path.match(/^\/api\/keys\/(\d+)\/log$/)) && M === 'GET') { // คำขอล่าสุดของ key (เก็บ 30 วัน)
    if (!await DB.prepare('SELECT 1 FROM api_keys WHERE id=? AND user_id=?').bind(r[1], u.id).first()) return err('ไม่พบ key', 404);
    return json((await DB.prepare('SELECT path,model,status,tin,tout,COALESCE(tcr,0) tcr,ttft,ROUND(charge,4) charge,ms,err,created_at FROM api_log WHERE key_id=? ORDER BY id DESC LIMIT 50').bind(r[1]).all()).results);
  }
  if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'DELETE') { await DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND user_id=?').bind(r[1], u.id).run(); return json({ ok: true }); }
  if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'PUT') { // งบต่อเดือน (บาท) และโมเดลที่ key นี้ใช้ได้
    const b = await req.json();
    if (Object.keys(b).length === 1 && 'memory' in b) { await DB.prepare('UPDATE api_keys SET memory=? WHERE id=? AND user_id=? AND revoked=0').bind(b.memory ? 1 : null, r[1], u.id).run(); return json({ ok: true }); } // Kyber Memory เปิด/ปิดต่อ key (ไม่แตะค่าอื่น)
    const budget = b.budget === '' || b.budget == null ? null : Math.round(+b.budget * 10000) / 10000;
    if (budget != null && !(budget >= 0)) return err('งบต้องเป็นตัวเลข 0 ขึ้นไป');
    const models = Array.isArray(b.models) && b.models.length ? b.models.map(String).filter(x => /^[a-z0-9.-]{1,80}$/.test(x)).slice(0, 50).join(',') : null;
    const usePlan = 'use_plan' in b ? (b.use_plan ? 1 : 0) : 1;
    const ips = String(b.ip_allow || '').split(/[\s,]+/).filter(Boolean);
    if (ips.length > 20 || ips.some(x => !/^[0-9a-fA-F:.]{3,45}(\/\d{1,2})?$/.test(x))) return err('IP ไม่ถูกต้อง (คั่นด้วยจุลภาค ได้สูงสุด 20 รายการ รองรับ IPv4 CIDR เช่น 203.0.113.0/24)');
    await DB.prepare('UPDATE api_keys SET ip_allow=?, budget=?, models=?, use_plan=?, name=COALESCE(?,name) WHERE id=? AND user_id=? AND revoked=0').bind(ips.join(',') || null, budget, models, usePlan, typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 40) : null, r[1], u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/2fa/setup' && M === 'POST') {
    if (u.totp_on) return err('เปิด 2FA อยู่แล้ว');
    const secret = b32(crypto.getRandomValues(new Uint8Array(20)));
    await DB.prepare('UPDATE users SET totp_secret=? WHERE id=?').bind(await seal(env, secret), u.id).run();
    return json({ secret, uri: `otpauth://totp/Kyber:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Kyber` });
  }
  if ((path === '/api/2fa/enable' || path === '/api/2fa/disable') && M === 'POST') {
    if (await limited(env, '2fa:' + u.id, 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
    if (!await totpOk(env, u, (await req.json()).code)) return err('รหัสไม่ถูกต้อง ลองรหัสล่าสุดจากแอป');
    await DB.prepare(path.endsWith('enable') ? 'UPDATE users SET totp_on=1 WHERE id=?' : 'UPDATE users SET totp_on=0, totp_secret=NULL WHERE id=?').bind(u.id).run();
    ctx.waitUntil(mail(env, u.email, 'Kyber: ความปลอดภัยบัญชีมีการเปลี่ยนแปลง', mailBox('ความปลอดภัยบัญชีมีการเปลี่ยนแปลง', path.endsWith('enable') ? 'เปิดการยืนยันตัวตน 2 ขั้น (2FA) ให้บัญชีของคุณแล้ว' : 'ปิดการยืนยันตัวตน 2 ขั้น (2FA) ของบัญชีคุณแล้ว ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันที')));
    return json({ ok: true });
  }
  if (path === '/api/me/export') { // ดาวน์โหลดข้อมูลของตัวเอง (PDPA)
    const q = (sql, ...a) => DB.prepare(sql).bind(...a).all().then(x => x.results);
    const data = { exported_at: new Date().toISOString(), account: { email: u.email, created_at: u.created_at, plan_id: u.plan_id, plan_expires: u.plan_expires, balance: u.balance, instructions: u.instructions },
      memories: await q('SELECT text,created_at FROM memories WHERE user_id=?', u.id), chats: await q('SELECT id,title,created_at FROM chats WHERE user_id=?', u.id),
      messages: await q('SELECT m.chat_id,m.role,m.content,m.created_at FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.user_id=?', u.id),
      projects: await q('SELECT p.name,f.path,f.content FROM projects p JOIN project_files f ON f.project_id=p.id WHERE p.user_id=?', u.id),
      payments: await q('SELECT amount,kind,status,created_at FROM payments WHERE user_id=?', u.id), wallet: await q('SELECT amount,kind,created_at FROM wallet_tx WHERE user_id=?', u.id) };
    return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="kyber-data.json"' } });
  }
  if (path === '/api/me/delete' && M === 'POST') { // ลบบัญชี: ต้องพิมพ์อีเมลยืนยัน
    const b = await req.json();
    if (u.role === 'admin') return err('บัญชีแอดมินลบเองไม่ได้');
    if (String(b.confirm || '').trim().toLowerCase() !== u.email) return err('อีเมลไม่ตรง', 401);
    await creditsInit(env); await ensureImgTable(env); // ให้ตารางสิทธิ์รีเซ็ตและตารางรูปมีอยู่ก่อนลบ
    const c = 'SELECT id FROM chats WHERE user_id=?1', pj = 'SELECT id FROM projects WHERE user_id=?1';
    await DB.batch([`DELETE FROM messages WHERE chat_id IN (${c})`, 'DELETE FROM chats WHERE user_id=?1', `DELETE FROM project_files WHERE project_id IN (${pj})`, `DELETE FROM file_versions WHERE project_id IN (${pj})`,
      'DELETE FROM projects WHERE user_id=?1', 'DELETE FROM chat_images WHERE user_id=?1', 'DELETE FROM team_members WHERE user_id=?1', 'DELETE FROM mcp_servers WHERE user_id=?1', 'DELETE FROM skills WHERE user_id=?1', 'DELETE FROM reset_grants WHERE user_id=?1', 'DELETE FROM reset_credits WHERE user_id=?1', 'DELETE FROM memories WHERE user_id=?1', 'DELETE FROM folders WHERE user_id=?1', 'DELETE FROM api_keys WHERE user_id=?1', 'DELETE FROM sessions WHERE user_id=?1',
      `DELETE FROM ticket_msgs WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id=?1)`, 'DELETE FROM tickets WHERE user_id=?1', 'DELETE FROM tokens WHERE user_id=?1',
      "UPDATE users SET email='deleted-'||id||'@deleted.local', pass_hash='x', banned=1, gh_token=NULL, totp_secret=NULL, google_id=NULL, line_id=NULL, fb_uid=NULL, instructions='' WHERE id=?1", // เก็บแถวผู้ใช้ไว้เพราะประวัติการเงินต้องเก็บตามกฎหมาย
    ].map(q => DB.prepare(q).bind(u.id)));
    return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }
  // มือถือ/เครื่องอื่น: ดูความคืบหน้า Agent ที่ทำงานบนคอม · ตอบคำขออนุญาต · พิมพ์แทรก (แอปมารับทุก 3 วินาที)
  if ((r = path.match(/^\/api\/remote\/(\d+)(\/answer|\/say)?$/))) {
    await ensureRemote(env);
    const row = await DB.prepare('SELECT * FROM agent_remote WHERE chat_id=? AND user_id=?').bind(+r[1], u.id).first();
    if (!row) return json(null);
    const parse = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } }; // แถวที่ JSON พังจากบั๊กเดิม: แสดงว่างแทน error
    if (M === 'GET') return json({ events: parse(row.events || '[]', []).slice(-120), ask: row.ask ? parse(row.ask, null) : null, running: !!row.running, updated_at: row.updated_at, live: Date.now() - row.updated_at < 20e3 });
    const b = await req.json().catch(() => ({}));
    if (r[2] === '/answer') { if (!['yes', 'all', 'no'].includes(b.v)) return err('คำตอบไม่ถูกต้อง'); await DB.prepare('UPDATE agent_remote SET answer=?, ask=NULL WHERE chat_id=?').bind(JSON.stringify({ id: +b.id, v: b.v }), +r[1]).run(); return json({ ok: true }); }
    if (r[2] === '/say') { const t = String(b.text || '').trim().slice(0, 20000); if (!t) return err('ข้อความว่าง'); const inbox = [...parse(row.inbox || '[]', []), t].slice(-10); await DB.prepare('UPDATE agent_remote SET inbox=? WHERE chat_id=?').bind(JSON.stringify(inbox), +r[1]).run(); return json({ ok: true }); }
    return err('not found', 404);
  }
  // แพ็กเสริม Agent: ซื้อด้วย Wallet ได้โควตาใช้ Agent (แอป Desktop / คลาวด์) แยกจากลิมิตแชต · ปิดไว้จนแอดมินเปิด (agent_pack_enabled)
  if (path === '/api/google' && M === 'GET') return googleStatus(env, u);
  if (path === '/api/google' && M === 'DELETE') return googleDisconnect(env, u);
  if (path === '/api/google/connect' && M === 'GET') return googleConnectStart(env, origin(req, env), u, url.searchParams.get('popup') === '1');
  if (path.startsWith('/api/videos')) { const { videoApi } = await import('./video.js'); const r = await videoApi(req, env, u, path, M); if (r) return r; }
  if (path.startsWith('/api/cowork')) { const { coworkApi } = await import('./cowork.js'); const r = await coworkApi(req, env, u, path, M, new URL(req.url)); if (r) return r; }
  if (path === '/api/py/run' && M === 'POST') return pyApi(req, env, u);
  if (path.startsWith('/api/cloud-agent')) { const r = await cloudApi(req, env, u, path, M); if (r) return r; }
  if (path === '/api/agent-pack') {
    const s = await getSettings(env, ['agent_pack_enabled', 'agent_pack_price', 'agent_pack_units', 'agent_pack_days']), price = +s.agent_pack_price || 199, units = +s.agent_pack_units || 120, days = +s.agent_pack_days || 30, now = Date.now();
    const plan = await planOf(env, u), active = u.agent_pack_until > now, used = active ? (await DB.prepare('SELECT COALESCE(SUM(pack),0) x FROM usage WHERE user_id=? AND created_at>=?').bind(u.id, u.agent_pack_from || 0).first()).x : 0;
    const info = { enabled: s.agent_pack_enabled === '1', price, days, inPlan: !!plan?.agent, active, until: u.agent_pack_until || null, pct: active ? Math.min(100, used / (u.agent_pack_units || units) * 100) : 0 };
    if (M === 'GET') return json(info);
    if (M === 'POST') {
      if (!info.enabled) return err('ยังไม่เปิดขายแพ็ก Agent', 403);
      if (await limited(env, 'apack:' + u.id, 5, 3600e3)) return err('ลองใหม่ภายหลัง', 429);
      const took = await DB.prepare('UPDATE users SET balance=balance-?1, agent_pack_from=?2, agent_pack_until=?3, agent_pack_units=?4 WHERE id=?5 AND balance>=?1 RETURNING balance').bind(price, now, now + days * DAY, units, u.id).first();
      if (!took) return err(`ยอดเงินใน Wallet ไม่พอ (ต้องมี ฿${price}) เติมเงินก่อน`, 402);
      await DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -price, took.balance, 'agentpack', `แพ็ก Agent ${days} วัน`, now).run();
      return json({ ...info, active: true, until: now + days * DAY, pct: 0, balance: took.balance });
    }
  }
  // แอป Desktop โหมด Agent: บันทึกคำสั่งและคำตอบลงแชต (โมเดลทำงานผ่าน /v1 ซึ่งคิดเงินแยกแล้ว ตรงนี้เก็บประวัติเท่านั้น) · เปิดดูจากมือถือได้
  if (path === '/api/chats/append' && M === 'POST') {
    if (await limited(env, 'append:' + u.id, 300, 3600e3)) return err('บันทึกบ่อยเกินไป', 429);
    const b = await req.json().catch(() => ({})), ms = (Array.isArray(b.messages) ? b.messages : []).filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim()).slice(0, 10);
    if (!ms.length) return err('ไม่มีข้อความ');
    let id = +b.chat_id || 0;
    if (id && !await DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(id, u.id).first()) return err('ไม่พบแชต', 404);
    if (!id) id = (await DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, ('🤖 ' + String(b.title || ms[0].content)).slice(0, 80), Date.now()).first()).id;
    const t0 = Date.now(); await DB.batch(ms.map((m, i) => DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(id, m.role, m.content.slice(0, 50000), t0 + i)));
    return json({ chat_id: id });
  }
  if (path === '/api/chats/import' && M === 'POST') { // นำเข้าแชตจากไฟล์ export ของ ChatGPT/Claude (หน้าเว็บแกะไฟล์แล้วส่งมาเป็นชุด ชุดละไม่เกิน 50 แชต)
    if (await limited(env, 'import:' + u.id, 40, 3600e3)) return err('นำเข้าบ่อยเกินไป รอสักครู่', 429);
    const list = (await req.json().catch(() => ({}))).chats; if (!Array.isArray(list) || !list.length || list.length > 50) return err('ไม่มีแชตให้นำเข้า');
    if ((await DB.prepare('SELECT COUNT(*) n FROM chats WHERE user_id=?').bind(u.id).first()).n + list.length > 5000) return err('มีแชตเกิน 5,000 แล้ว ลบแชตเก่าก่อน');
    let n = 0;
    for (const c of list) {
      const ms = (Array.isArray(c?.messages) ? c.messages : []).filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim()).slice(0, 500);
      if (!ms.length) continue;
      const t0 = Math.min(Math.max(+c.created_at || Date.now(), 1e12), Date.now());
      const id = (await DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, ('📥 ' + String(c.title || 'แชตที่นำเข้า')).slice(0, 80), t0).first()).id;
      const ops = ms.map((m, i) => DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(id, m.role, m.content.slice(0, 20000), t0 + i));
      for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
      n++;
    }
    return json({ imported: n });
  }
  if (path === '/api/badges') { // ตราสะสม: คำนวณจากข้อมูลที่มีอยู่ ไม่มีรางวัลเป็นเงิน
    const now = Date.now(), BK = 7 * 3600e3;
    const days = (await DB.prepare('SELECT DISTINCT CAST((created_at+?)/86400000 AS INTEGER) d FROM usage WHERE user_id=? AND created_at>? ORDER BY d').bind(BK, u.id, now - 400 * 864e5).all()).results.map(r => r.d);
    let best = 0, run = 0; days.forEach((d, i) => { run = i && d === days[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); });
    const today = Math.floor((now + BK) / 864e5), cur = days.length && days.at(-1) >= today - 1 ? (() => { let n = 1; for (let i = days.length - 1; i > 0 && days[i] === days[i - 1] + 1; i--) n++; return n; })() : 0;
    const q = async (sql, ...a) => (await DB.prepare(sql).bind(...a).first())?.n || 0;
    const [msgs, projs, agents, refs, paid] = await Promise.all([
      q("SELECT COUNT(*) n FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.user_id=? AND m.role='user'", u.id), q('SELECT COUNT(*) n FROM projects WHERE user_id=?', u.id),
      q("SELECT COUNT(*) n FROM agent_jobs WHERE user_id=? AND parent_id IS NULL AND status='done'", u.id).catch(() => 0), q('SELECT COUNT(*) n FROM users WHERE referred_by=?', u.id), q("SELECT COUNT(*) n FROM payments WHERE user_id=? AND status='approved'", u.id)]);
    const B = [['streak7', '🔥', 'ใช้ต่อเนื่อง 7 วัน', best >= 7], ['streak30', '🌋', 'ใช้ต่อเนื่อง 30 วัน', best >= 30], ['msg100', '💬', 'ส่งข้อความครบ 100', msgs >= 100], ['msg1000', '🗣️', 'ส่งข้อความครบ 1,000', msgs >= 1000],
      ['proj', '🧑‍💻', 'สร้างโปรเจกต์แรก', projs >= 1], ['agent', '🤖', 'Agent ทำงานสำเร็จ', agents >= 1], ['ref', '🤝', 'ชวนเพื่อนสำเร็จ', refs >= 1], ['supporter', '💎', 'ผู้สนับสนุน', paid >= 1]];
    return json({ streak: cur, best, msgs, badges: B.map(([id, icon, name, got]) => ({ id, icon, name, got })) });
  }
  if (path === '/api/bill-info' && M === 'PUT') { // ข้อมูลผู้ซื้อในใบเสร็จ (บริษัท): ชื่อ ที่อยู่ เลขผู้เสียภาษี
    const b = await req.json().catch(() => ({})), v = { name: String(b.name || '').trim().slice(0, 120), address: String(b.address || '').trim().slice(0, 400), tax_id: String(b.tax_id || '').replace(/[^\d-]/g, '').slice(0, 20) };
    await DB.prepare('UPDATE users SET bill_info=? WHERE id=?').bind(v.name || v.address || v.tax_id ? JSON.stringify(v) : null, u.id).run(); return json(v);
  }
  if ((r = path.match(/^\/api\/receipt\/(\d+)$/))) {
    const p = await DB.prepare("SELECT p.*,pl.name plan_name,us.email,us.bill_info FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id JOIN users us ON us.id=p.user_id WHERE p.id=? AND p.status='approved'").bind(r[1]).first();
    if (!p || (p.user_id !== u.id && u.role !== 'admin')) return err('ไม่พบใบเสร็จ', 404);
    const b = await getSettings(env, ['business_name', 'business_address', 'business_tax_id']);
    return json({ id: p.id, no: 'AC' + String(p.id).padStart(6, '0'), date: p.approved_at || p.created_at, email: p.email, amount: p.amount, discount: p.discount, coupon: p.coupon,
      item: p.kind === 'topup' ? 'เติมเงิน Wallet' : `แพลน ${p.plan_name} (${p.period === 'year' ? '1 ปี' : '30 วัน'})`, business: b, buyer: (() => { try { return JSON.parse(p.bill_info || 'null'); } catch { return null; } })(), mine: p.user_id === u.id });
  }
  if (path === '/api/tickets') {
    if (M === 'GET') return json((await DB.prepare('SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC').bind(u.id).all()).results);
    const b = await req.json(), subject = String(b.subject || '').trim().slice(0, 120), body = String(b.body || '').trim().slice(0, 5000);
    if (!subject || !body) return err('ใส่หัวข้อและรายละเอียด');
    if (await limited(env, 'ticket:' + u.id, 5, DAY)) return err('เปิดเรื่องได้วันละ 5 เรื่อง', 429);
    const t = await DB.prepare('INSERT INTO tickets (user_id,subject,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').bind(u.id, subject, Date.now(), Date.now()).first();
    await DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,0,?,?)').bind(t.id, body, Date.now()).run();
    ctx.waitUntil(notify(env, `🎫 เรื่องใหม่จาก ${u.email}: ${subject}`));
    return json({ ok: true, id: t.id });
  }
  if ((r = path.match(/^\/api\/tickets\/(\d+)$/))) {
    const t = await DB.prepare('SELECT * FROM tickets WHERE id=? AND user_id=?').bind(r[1], u.id).first(); if (!t) return err('ไม่พบเรื่อง', 404);
    if (M === 'POST') {
      const body = String((await req.json()).body || '').trim().slice(0, 5000); if (!body) return err('ข้อความว่าง');
      await DB.batch([DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,0,?,?)').bind(t.id, body, Date.now()), DB.prepare("UPDATE tickets SET status='open', updated_at=? WHERE id=?").bind(Date.now(), t.id)]);
      ctx.waitUntil(notify(env, `🎫 ${u.email} ตอบเรื่อง: ${t.subject}`));
      return json({ ok: true });
    }
    return json({ ...t, msgs: (await DB.prepare('SELECT admin,body,created_at FROM ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  }
  if (path === '/api/image/prompt' && M === 'POST') { // ให้ AI ช่วยเขียน prompt สร้างภาพให้ดีขึ้น (ดูรูปที่แนบเป็นแรงบันดาลใจได้)
    const b = await req.json().catch(() => ({})), text = String(b.text || '').trim().slice(0, 2000);
    let imgs = (Array.isArray(b.images) ? b.images : []).filter(x => typeof x === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(x) && x.length < 4e6).slice(0, 2);
    if (!text && !imgs.length) return err('พิมพ์ว่าอยากได้ภาพแบบไหน หรือแนบรูปตัวอย่าง');
    const plan = await planOf(env, u), st = await usageStatus(env, u, plan);
    if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
    if (await limited(env, 'imgp:' + u.id, 30, 3600e3)) return err('ปรับ prompt ได้ชั่วโมงละ 30 ครั้ง', 429);
    const ms = (await allowedModels(env, plan._planIds || plan.id)).filter(x => !['image', 'embedding'].includes(x.provider)), set = +(await getSetting(env, 'image_prompt_model'));
    let pick = ms.find(x => x.id === set) || ms.find(x => /6\.1\s*sol/i.test(x.name)) || ms.find(x => /deepseek.*4\.1.*flash/i.test(x.name)) || [...ms].sort((a, b) => a.multiplier - b.multiplier)[0]; // ค่าเริ่มต้น ChatGPT 6.1 Sol ถ้าแพลนมี
    if (!pick) return err('แพลนของคุณยังไม่มีโมเดลที่ช่วยเขียน prompt ได้', 403);
    if (imgs.length && !pick.vision) pick = ms.find(x => x.vision) || pick; if (!pick.vision) imgs = []; // ต้องอ่านรูปได้ถึงจะใช้รูปตัวอย่าง
    const m = await DB.prepare('SELECT * FROM models WHERE id=?').bind(pick.id).first();
    const msg = [{ role: 'user', content: (text || 'Create an image inspired by the attached picture.') + (imgs.length ? '\n\n(Attached picture(s) are inspiration only.)' : '') }];
    // effort ต่ำ: ถ้าไม่ส่ง โมเดลคิดได้จะคิดนานตามค่าเริ่มต้น ทำให้ผู้ใช้รอค้าง
    const run = async (mm, ms2, im) => { let o = '', us = null; for await (const e of callModel(env, mm, msg, { effort: mm.effort && mm.effort !== 'none' ? 'low' : null, images: im, maxTokens: 500, userId: u.id, signal: AbortSignal.timeout(ms2), system: IMG_PROMPT_SYS })) { if (e.t) o += e.t; if (e.usage) us = e.usage; } if (us) await logUsage(env, u.id, mm, us, { plan }); return o; };
    let out = '', used = m.name;
    try { out = await run(m, 25e3, imgs); }
    catch (x) { // ช้าหรือพัง → ลองโมเดลเร็ว/ถูกสุดอีกรอบ (ไม่ส่งรูป)
      const fast = !imgs.length && (ms.find(y => /deepseek.*4\.1.*flash/i.test(y.name)) || [...ms].sort((a, c) => a.multiplier - c.multiplier)[0]);
      if (!fast || fast.id === m.id) return err('ช่วยเขียน prompt ไม่สำเร็จ: ' + String(x.message).slice(0, 120), 502);
      try { out = await run(await DB.prepare('SELECT * FROM models WHERE id=?').bind(fast.id).first(), 20e3, []); used = fast.name; }
      catch (y) { return err('ช่วยเขียน prompt ไม่สำเร็จ: ' + String(y.message).slice(0, 120), 502); }
    }
    const prompt = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^```\w*\n?|```$/g, '').replace(/^["'“”]+|["'“”]+$/g, '').trim().slice(0, 2000);
    return prompt ? json({ prompt, model: used }) : err('AI ไม่ได้ส่ง prompt กลับมา ลองใหม่อีกครั้ง', 502);
  }
  if (path === '/api/image' && M === 'POST') { const job = imageGen(req, env, u); ctx.waitUntil(job.catch(() => {})); return await job; } // ปิดหน้าระหว่างรอ: ยังสร้างเสร็จและคิดเงิน (ผู้ให้บริการคิดเงินเราแล้ว)
  if ((r = path.match(/^\/api\/img\/(\d+)\/([\w-]+)\.(png|jpg)$/))) {
    if (+r[1] !== u.id && u.role !== 'admin') return err('not found', 404);
    const o = env.SLIPS && await env.SLIPS.get(`img/${r[1]}/${r[2]}.${r[3]}`), cc = { 'cache-control': 'private, max-age=31536000', 'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff' }; // รูปเปิดตรงๆ ไม่รันสคริปต์ (เช่น SVG)
    if (o) return new Response(o.body, { headers: { 'content-type': 'image/' + (r[3] === 'jpg' ? 'jpeg' : 'png'), ...cc } });
    await ensureImgTable(env);
    const rows = (await DB.prepare('SELECT mime,data FROM chat_images WHERE key=? AND user_id=? ORDER BY n').bind(r[2], +r[1]).all()).results;
    return rows.length ? new Response(unb64(rows.map(x => x.data).join('')), { headers: { 'content-type': /^image\/(png|jpeg|webp|gif)$/.test(rows[0].mime) ? rows[0].mime : 'application/octet-stream', ...cc } }) : err('not found', 404);
  }
  if (path === '/api/team') {
    const tm = await DB.prepare('SELECT t.*, tm.role, p.name plan_name, p.limit_week, p.price plan_price, p.id pid FROM team_members tm JOIN teams t ON t.id=tm.team_id LEFT JOIN plans p ON p.id=t.plan_id WHERE tm.user_id=? ORDER BY t.expires DESC LIMIT 1').bind(u.id).first();
    if (M === 'GET') {
      if (!tm) return json({ team: null });
      const own = tm.role === 'owner', members = (await DB.prepare('SELECT u.id, u.email, tm.role, tm.joined_at, tm.cap_pct, tm.api_off, (SELECT COALESCE(SUM(g.units),0) FROM usage g WHERE g.user_id=u.id AND g.created_at>=?2) wk FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=?1 ORDER BY tm.role DESC, tm.joined_at').bind(tm.id, Date.now() - 7 * DAY).all()).results;
      // หัวหน้าทีมเห็นการใช้ 7 วันล่าสุดของทุกคน (% ของงบสัปดาห์ของแพลน) · สมาชิกเห็นแค่รายชื่อ
      if (own) { // แดชบอร์ดหัวหน้า: ข้อความ 30 วัน + โมเดลที่ใช้บ่อยสุดของแต่ละคน
        const st = (await DB.prepare(`SELECT g.user_id, COUNT(*) n, (SELECT md.name FROM usage x JOIN models md ON md.id=x.model_id WHERE x.user_id=g.user_id AND x.created_at>=?1 GROUP BY x.model_id ORDER BY COUNT(*) DESC LIMIT 1) top FROM usage g WHERE g.created_at>=?1 AND g.user_id IN (SELECT user_id FROM team_members WHERE team_id=?2) GROUP BY g.user_id`).bind(Date.now() - 30 * DAY, tm.id).all()).results;
        const sm = new Map(st.map(x => [x.user_id, x])); members.forEach(m => { m.msgs30 = sm.get(m.id)?.n || 0; m.top = sm.get(m.id)?.top || null; });
      }
      members.forEach(m => { if (own) m.wk_pct = tm.limit_week > 0 ? Math.round(m.wk / tm.limit_week * 1000) / 10 : 0; else { delete m.cap_pct; delete m.api_off; } delete m.wk; });
      return json({ team: { domain: own ? tm.domain || null : undefined, id: tm.id, name: tm.name, plan_name: tm.plan_name, plan_id: tm.pid, expires: tm.expires, max_seats: tm.max_seats, shared_pool: !!tm.shared_pool, role: tm.role, invite_code: own ? tm.invite_code : null }, members });
    }
    if (M === 'PUT') {
      if (!tm || tm.role !== 'owner') return err('เฉพาะหัวหน้าทีมเท่านั้น', 403);
      const b = await req.json();
      if (typeof b.name === 'string' && b.name.trim()) await DB.prepare('UPDATE teams SET name=? WHERE id=?').bind(b.name.trim().slice(0, 60), tm.id).run();
      if (b.regen_code) await DB.prepare('UPDATE teams SET invite_code=? WHERE id=?').bind(rand(4).toUpperCase(), tm.id).run();
      if ('domain' in b) { // อีเมล @โดเมนบริษัท เข้าทีมเองตอนล็อกอิน · ต้องเป็นโดเมนเดียวกับอีเมลหัวหน้า และไม่ใช่อีเมลฟรี
        const dm = String(b.domain || '').trim().toLowerCase().replace(/^@/, '');
        if (dm) {
          if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dm)) return err('โดเมนไม่ถูกต้อง');
          if (PUBLIC_MAIL.test(dm)) return err('ใช้อีเมลฟรี (Gmail, Hotmail ฯลฯ) ไม่ได้ ต้องเป็นโดเมนของบริษัท');
          if (!u.email_verified) return err('ยืนยันอีเมลของคุณก่อน จึงตั้งโดเมนบริษัทได้', 403);
          if (u.email.split('@')[1] !== dm) return err('ต้องเป็นโดเมนเดียวกับอีเมลของหัวหน้าทีม (@' + u.email.split('@')[1] + ')');
          if (await DB.prepare('SELECT 1 FROM teams WHERE domain=? AND id<>?').bind(dm, tm.id).first()) return err('โดเมนนี้ถูกใช้กับทีมอื่นแล้ว');
        }
        await DB.prepare('UPDATE teams SET domain=? WHERE id=?').bind(dm || null, tm.id).run();
        await teamLog(env, tm.id, u.id, 'set domain', dm || '(ปิด)');
      }
      return json({ ok: true });
    }
  }
  if (path === '/api/team/log' && M === 'GET') { // หัวหน้าทีม: ใครทำอะไรกับทีมเมื่อไร (100 รายการล่าสุด)
    const own = await DB.prepare("SELECT team_id FROM team_members WHERE user_id=? AND role='owner'").bind(u.id).first(); if (!own) return err('เฉพาะหัวหน้าทีมเท่านั้น', 403);
    return json((await DB.prepare('SELECT l.action, l.detail, l.created_at, us.email FROM team_log l LEFT JOIN users us ON us.id=l.user_id WHERE l.team_id=? ORDER BY l.id DESC LIMIT 100').bind(own.team_id).all()).results);
  }
  if (path === '/api/team/join' && M === 'POST') {
    if (await limited(env, 'tj:' + u.id, 10, 3600e3)) return err('ลองหลายครั้งเกินไป รอสักครู่', 429); // กันเดารหัสเชิญทีม
    const code = String((await req.json()).code || '').trim().toUpperCase();
    const t = code && await DB.prepare('SELECT * FROM teams WHERE invite_code=? AND expires>?').bind(code, Date.now()).first();
    if (!t) return err('รหัสเชิญทีมไม่ถูกต้องหรือทีมหมดอายุแล้ว', 404);
    if (await DB.prepare('SELECT 1 FROM team_members WHERE user_id=?').bind(u.id).first()) return err('คุณอยู่ในทีมอื่นแล้ว ออกทีมเดิมก่อน');
    const cnt = (await DB.prepare('SELECT COUNT(*) n FROM team_members WHERE team_id=?').bind(t.id).first()).n;
    if (cnt >= t.max_seats) return err('ทีมนี้สมาชิกเต็มแล้ว');
    if (!(await DB.prepare("INSERT INTO team_members (team_id,user_id,role,joined_at) SELECT ?1,?2,'member',?3 WHERE (SELECT COUNT(*) FROM team_members WHERE team_id=?1) < ?4").bind(t.id, u.id, Date.now(), t.max_seats).run()).meta.changes) return err('ทีมนี้สมาชิกเต็มแล้ว'); // นับที่นั่งกับเพิ่มสมาชิกใน statement เดียว กันคนเข้าพร้อมกันจนเกินที่นั่ง
    await teamLog(env, t.id, u.id, 'join', 'เข้าทีมด้วยรหัสเชิญ');
    return json({ ok: true, team_id: t.id });
  }
  if (path === '/api/team/add' && M === 'POST') {
    const tm = await DB.prepare("SELECT t.* FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=? AND tm.role='owner' AND t.expires>?").bind(u.id, Date.now()).first();
    if (!tm) return err('เฉพาะหัวหน้าทีมที่ยังไม่หมดอายุเท่านั้น', 403);
    const email = String((await req.json()).email || '').trim().toLowerCase();
    const target = email && await DB.prepare('SELECT id FROM users WHERE email=? AND banned=0').bind(email).first();
    if (!target) return err('ไม่พบบัญชีผู้ใช้อีเมลนี้ในระบบ', 404);
    if (await DB.prepare('SELECT 1 FROM team_members WHERE user_id=?').bind(target.id).first()) return err('ผู้ใช้นี้อยู่ในทีมอื่นแล้ว');
    const cnt = (await DB.prepare('SELECT COUNT(*) n FROM team_members WHERE team_id=?').bind(tm.id).first()).n;
    if (cnt >= tm.max_seats) return err(`ทีมเต็มแล้ว (สูงสุด ${tm.max_seats} คน)`);
    await DB.prepare("INSERT INTO team_members (team_id,user_id,role,joined_at) VALUES (?,?,'member',?)").bind(tm.id, target.id, Date.now()).run();
    await teamLog(env, tm.id, u.id, 'add member', email);
    return json({ ok: true });
  }
  if ((r = path.match(/^\/api\/team\/members\/(\d+)$/)) && M === 'PUT') { // ตั้งเพดานต่อคน (% ของงบสัปดาห์ทีม · เฉพาะงบรวม) และเปิด/ปิดสิทธิ์ใช้ API ของสมาชิก
    const tm = await DB.prepare("SELECT t.* FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=? AND tm.role='owner'").bind(u.id).first();
    if (!tm) return err('เฉพาะหัวหน้าทีมเท่านั้น', 403);
    const b = await req.json(), sets = [], vals = [];
    if ('cap_pct' in b) {
      if (!tm.shared_pool) return err('แพลนนี้แยกโควตาต่อคนอยู่แล้ว ไม่ต้องตั้งเพดาน');
      if (b.cap_pct != null && !(b.cap_pct > 0 && b.cap_pct <= 100)) return err('เพดานต้องอยู่ระหว่าง 1–100%');
      sets.push('cap_pct=?'); vals.push(b.cap_pct ?? null);
    }
    if ('api_off' in b) { sets.push('api_off=?'); vals.push(b.api_off ? 1 : 0); }
    if (!sets.length) return err('ไม่มีอะไรให้แก้');
    const ch = await DB.prepare(`UPDATE team_members SET ${sets.join(',')} WHERE team_id=? AND user_id=? AND role!='owner'`).bind(...vals, tm.id, +r[1]).run();
    if (ch.meta.changes) await teamLog(env, tm.id, u.id, 'member settings', JSON.stringify({ member: +r[1], ...b }));
    return ch.meta.changes ? json({ ok: true }) : err('ไม่พบสมาชิกคนนี้', 404);
  }
  if ((r = path.match(/^\/api\/team\/members\/(\d+)\/keys(?:\/(\d+))?$/)) && (M === 'GET' || M === 'DELETE')) { // หัวหน้าทีมดู/เพิกถอน API key ของสมาชิก
    const own = await DB.prepare("SELECT team_id FROM team_members WHERE user_id=? AND role='owner'").bind(u.id).first();
    if (!own || !await DB.prepare("SELECT 1 FROM team_members WHERE team_id=? AND user_id=? AND role!='owner'").bind(own.team_id, +r[1]).first()) return err('ไม่พบสมาชิกคนนี้ในทีมของคุณ', 404);
    if (M === 'GET') return json((await DB.prepare('SELECT id,name,prefix,created_at,last_used,budget,CASE WHEN spent_month=? THEN spent ELSE 0 END spent FROM api_keys WHERE user_id=? AND revoked=0 ORDER BY id DESC').bind(monthKey(), +r[1]).all()).results);
    const ch = r[2] ? await DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND user_id=? AND revoked=0').bind(+r[2], +r[1]).run()
      : await DB.prepare('UPDATE api_keys SET revoked=1 WHERE user_id=? AND revoked=0').bind(+r[1]).run(); // ไม่ระบุ key = เพิกถอนทุก key ของสมาชิก
    if (ch.meta.changes) { await audit(env, u, 'revoke member api key', { key: r[2] ? +r[2] : 'all', member: +r[1], n: ch.meta.changes }); await teamLog(env, own.team_id, u.id, 'revoke api key', JSON.stringify({ member: +r[1], key: r[2] ? +r[2] : 'all' })); }
    return ch.meta.changes ? json({ ok: true }) : err('ไม่พบ key', 404);
  }
  if (path === '/api/team/invite' && M === 'POST') { // ส่งคำเชิญทางอีเมล: ลิงก์พาไปล็อกอินแล้วเข้าทีมด้วยโค้ด
    const tm = await DB.prepare("SELECT t.* FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=? AND tm.role='owner' AND t.expires>?").bind(u.id, Date.now()).first();
    if (!tm) return err('เฉพาะหัวหน้าทีมที่ยังไม่หมดอายุเท่านั้น', 403);
    const email = String((await req.json()).email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return err('อีเมลไม่ถูกต้อง');
    if ((await DB.prepare('SELECT COUNT(*) n FROM team_members WHERE team_id=?').bind(tm.id).first()).n >= tm.max_seats) return err(`ทีมเต็มแล้ว (สูงสุด ${tm.max_seats} คน)`);
    if (await limited(env, 'tinv:' + u.id, 20, DAY)) return err('ส่งคำเชิญวันนี้ครบแล้ว ลองใหม่พรุ่งนี้', 429);
    const link = origin(req, env) + '/login?next=' + encodeURIComponent('/account?join=' + tm.invite_code);
    await teamLog(env, tm.id, u.id, 'invite', email);
    const sent = await mail(env, email, 'Kyber: คุณได้รับเชิญเข้าทีม ' + tm.name.slice(0, 60), mailBox('คุณได้รับเชิญเข้าทีม', `${esc(u.email)} เชิญคุณเข้าทีม “${esc(tm.name.slice(0, 60))}” ล็อกอินหรือสมัครแล้วระบบจะพาเข้าทีมให้ทันที`, 'เข้าร่วมทีม', link));
    return json({ ok: true, sent });
  }
  if ((r = path.match(/^\/api\/team\/members\/(\d+)$/)) && M === 'DELETE') {
    const targetId = +r[1];
    const tm = await DB.prepare('SELECT t.*, tm.role FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=?').bind(u.id).first();
    if (!tm) return err('ไม่พบทีม', 404);
    if (targetId === tm.owner_id) return err('หัวหน้าทีมไม่สามารถออกจากทีมได้');
    if (tm.role !== 'owner' && targetId !== u.id) return err('ไม่มีสิทธิ์ลบสมาชิกคนอื่น', 403);
    await DB.batch([DB.prepare('DELETE FROM team_members WHERE team_id=? AND user_id=?').bind(tm.id, targetId), DB.prepare('UPDATE folders SET team_id=NULL WHERE user_id=? AND team_id=?').bind(targetId, tm.id)]); // ออกทีม: Workspace ที่เคยแชร์เลิกแชร์
    await teamLog(env, tm.id, u.id, targetId === u.id ? 'leave' : 'remove member', String(targetId));
    return json({ ok: true });
  }
  if (path === '/api/skills') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,user_id,name,description,content,enabled,COALESCE(as_text,0) as_text,model_id FROM skills WHERE (user_id=0 AND enabled=1) OR user_id=? ORDER BY user_id, id DESC').bind(u.id).all()).results);
    if (M === 'POST') {
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 60), desc = String(b.description || '').trim().slice(0, 200), content = String(b.content || '').trim().slice(0, 6000);
      if (!name || !content) return err('ใส่ชื่อและคำสั่งของ Skill');
      if ((await DB.prepare('SELECT COUNT(*) n FROM skills WHERE user_id=?').bind(u.id).first()).n >= 30) return err('สร้าง Skill ส่วนตัวได้สูงสุด 30 อัน');
      return json(await DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at,as_text,model_id) VALUES (?,?,?,?,1,?,?,?) RETURNING id,user_id,name,description,content,enabled,COALESCE(as_text,0) as_text,model_id').bind(u.id, name, desc, content, Date.now(), b.as_text ? 1 : 0, +b.model_id > 0 ? +b.model_id : null).first());
    }
  }
  if ((r = path.match(/^\/api\/skills\/(\d+)\/share$/)) && M === 'POST') { // ลิงก์แชร์ Skill (ผู้ช่วยเฉพาะทาง) ให้คนอื่นนำเข้าไปใช้
    const row = await DB.prepare('UPDATE skills SET share_token=COALESCE(share_token,?) WHERE id=? AND user_id=? RETURNING share_token').bind(rand(10), +r[1], u.id).first();
    return row ? json({ token: row.share_token }) : err('ไม่พบ Skill', 404);
  }
  if (path === '/api/skills/github' && M === 'POST') { // นำเข้า Skill จาก GitHub repo: หาไฟล์ SKILL.md (แบบ Claude Skills) แล้วสร้างเป็น Skill ของผู้ใช้ เรียกด้วย / ได้
    if (await limited(env, 'skgh:' + u.id, 10, 3600e3)) return err('นำเข้าบ่อยเกินไป รอสักครู่', 429);
    const m = String((await req.json()).url || '').trim().match(/^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(\/.*)?)?\/?$/i);
    if (!m) return err('ใส่ลิงก์ GitHub repo เช่น https://github.com/owner/repo');
    const [, owner, repo, br0, sub0] = m, sub = (sub0 || '').replace(/^\/|\/$/g, '').replace(/\/?SKILL\.md$/i, '');
    const H = { accept: 'application/vnd.github+json', 'user-agent': 'Kyber' }, g = p2 => fetch('https://api.github.com/repos/' + owner + '/' + repo + p2, { headers: H });
    const info = br0 ? null : await g('').then(r => r.ok ? r.json() : null).catch(() => null);
    const br = br0 || info?.default_branch; if (!br) return err('ไม่พบ repo (ต้องเป็น repo สาธารณะ)', 404);
    const tree = await g('/git/trees/' + encodeURIComponent(br) + '?recursive=1').then(r => r.ok ? r.json() : null).catch(() => null);
    if (!tree?.tree) return err('อ่านไฟล์ใน repo ไม่ได้ (GitHub จำกัดการเรียก ลองใหม่อีกครั้ง)', 502);
    const paths = tree.tree.filter(x => x.type === 'blob' && /(^|\/)SKILL\.md$/i.test(x.path) && (!sub || x.path === sub + '/SKILL.md' || x.path.startsWith(sub + '/'))).map(x => x.path).slice(0, 20);
    if (!paths.length) return err('ไม่พบไฟล์ SKILL.md ใน repo นี้ · repo นี้อาจไม่ใช่ Skill (ถ้าเป็น MCP ให้ใช้ในแอปคอม)', 404);
    const have = (await DB.prepare('SELECT name FROM skills WHERE user_id=?').bind(u.id).all()).results.map(x => x.name), added = [];
    for (const fp of paths) {
      if (have.length >= 30) break;
      const raw = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(br)}/${fp.split('/').map(encodeURIComponent).join('/')}`).then(r => r.ok ? r.text() : '').catch(() => '');
      if (!raw.trim()) continue;
      const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/), meta = {};
      for (const l of (fm?.[1] || '').split('\n')) { const kv = l.match(/^(\w[\w-]*)\s*:\s*(.*)$/); if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '').trim(); }
      const name = (meta.name || fp.split('/').slice(-2, -1)[0] || repo).slice(0, 60), body = (fm ? raw.slice(fm[0].length) : raw).trim().slice(0, 6000);
      if (!body || have.includes(name)) continue;
      await DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at) VALUES (?,?,?,?,1,?)').bind(u.id, name, (meta.description || '').slice(0, 200), body, Date.now()).run();
      have.push(name); added.push(name);
    }
    return json({ added, found: paths.length });
  }
  if (path === '/api/skills/import' && M === 'POST') { // นำเข้า Skill จากลิงก์: คัดลอกมาเป็นของตัวเอง (ต้นฉบับแก้ทีหลังไม่กระทบ)
    const s = await DB.prepare('SELECT name,description,content,model_id FROM skills WHERE share_token=? AND enabled=1').bind(String((await req.json()).token || '')).first();
    if (!s) return err('ลิงก์ Skill ไม่ถูกต้องหรือถูกยกเลิกแล้ว', 404);
    const mine = await DB.prepare('SELECT id FROM skills WHERE user_id=? AND name=? AND content=?').bind(u.id, s.name, s.content).first();
    if (mine) return json({ id: mine.id, name: s.name, model_id: s.model_id });
    if ((await DB.prepare('SELECT COUNT(*) n FROM skills WHERE user_id=?').bind(u.id).first()).n >= 30) return err('สร้าง Skill ส่วนตัวได้สูงสุด 30 อัน');
    return json(await DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at,model_id) VALUES (?,?,?,?,1,?,?) RETURNING id,name,model_id').bind(u.id, s.name, s.description, s.content, Date.now(), s.model_id ?? null).first());
  }
  if ((r = path.match(/^\/api\/skills\/(\d+)$/))) {
    const sid = +r[1];
    if (M === 'DELETE') { await DB.prepare('DELETE FROM skills WHERE id=? AND user_id=?').bind(sid, u.id).run(); return json({ ok: true }); }
    if (M === 'PUT') {
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 60), desc = String(b.description || '').trim().slice(0, 200), content = String(b.content || '').trim().slice(0, 6000);
      if (!name || !content) return err('ใส่ชื่อและคำสั่งของ Skill');
      await DB.prepare('UPDATE skills SET name=?, description=?, content=?, enabled=?, as_text=? WHERE id=? AND user_id=?').bind(name, desc, content, b.enabled === 0 ? 0 : 1, b.as_text ? 1 : 0, sid, u.id).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/mcp') {
    if (M === 'GET') {
      const rows = (await DB.prepare('SELECT id,user_id,name,url,token_enc,tools_json,enabled FROM mcp_servers WHERE (user_id=0 AND enabled=1) OR user_id=? ORDER BY user_id, id DESC').bind(u.id).all()).results;
      return json(rows.map(x => { let ts = []; try { ts = JSON.parse(x.tools_json || '[]'); } catch {} return { id: x.id, user_id: x.user_id, name: x.name, url: x.url, has_token: !!x.token_enc, tools: ts.map(t => t.name), enabled: x.enabled }; }));
    }
    if (M === 'POST') {
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 60), url_ = isSafeMcpUrl(b.url), token = String(b.token || '').trim();
      if (!name) return err('ตั้งชื่อ MCP Server ก่อน');
      if (!url_) return err('URL ต้องเป็น https:// สาธารณะเท่านั้น');
      if ((await DB.prepare('SELECT COUNT(*) n FROM mcp_servers WHERE user_id=?').bind(u.id).first()).n >= 15) return err('เชื่อมต่อ MCP ส่วนตัวได้สูงสุด 15 ตัว');
      // ลิงก์ repo (GitHub/GitLab/npm) คือซอร์สโค้ดของ MCP ไม่ใช่ที่อยู่เซิร์ฟเวอร์ที่ออนไลน์อยู่ · บอกให้ชัดแทน error 500
      if (/^https:\/\/(www\.)?(github\.com|gitlab\.com|npmjs\.com|pypi\.org)\//i.test(url_)) return err('ลิงก์นี้เป็นหน้าโค้ดของ MCP (repo) ไม่ใช่ที่อยู่เซิร์ฟเวอร์ · Remote MCP ต้องเป็น URL ของเซิร์ฟเวอร์ที่ออนไลน์อยู่ เช่น https://example.com/mcp · ถ้าเป็น MCP ที่ต้องติดตั้งในเครื่อง ให้ใช้แอป Kyber บนคอม (Plugins / Local MCP) หรือดูใน README ว่ามี URL แบบ hosted ไหม', 400);
      let tools; try { tools = await mcpSync(url_, token || null); } catch (e) { return err('เชื่อมต่อ MCP ไม่ได้: ' + String(e.message || e).slice(0, 160) + ' · ตรวจว่า URL เป็น MCP endpoint (Streamable HTTP) และ token ถูกต้อง', 400); }
      const tokEnc = token ? await seal(env, token) : null;
      const row = await DB.prepare('INSERT INTO mcp_servers (user_id,name,url,token_enc,tools_json,enabled,created_at) VALUES (?,?,?,?,?,1,?) RETURNING id,user_id,name,url,enabled')
        .bind(u.id, name, url_, tokEnc, JSON.stringify(tools), Date.now()).first();
      return json({ ...row, has_token: !!tokEnc, tools: tools.map(t => t.name) });
    }
  }
  if ((r = path.match(/^\/api\/mcp\/(\d+)(?:\/(sync))?$/))) {
    const mid = +r[1], act = r[2];
    const sv = await DB.prepare('SELECT * FROM mcp_servers WHERE id=? AND user_id=?').bind(mid, u.id).first();
    if (!sv) return err('ไม่พบ MCP Server', 404);
    if (act === 'sync' && M === 'POST') {
      const tok = sv.token_enc ? await unseal(env, sv.token_enc).catch(() => null) : null;
      const tools = await mcpSync(sv.url, tok);
      await DB.prepare('UPDATE mcp_servers SET tools_json=? WHERE id=?').bind(JSON.stringify(tools), mid).run();
      return json({ ok: true, tools: tools.map(t => t.name) });
    }
    if (M === 'DELETE') { await DB.prepare('DELETE FROM mcp_servers WHERE id=? AND user_id=?').bind(mid, u.id).run(); return json({ ok: true }); }
  }
  if (path === '/api/complete' && M === 'POST') return await complete(req, env, u);
  return null;
}

// ---------- 2FA (TOTP) ----------
export const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32(bytes) { let bits = '', out = ''; for (const x of bytes) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
export function unb32(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } return Uint8Array.from(bits.match(/.{8}/g) || [], b => parseInt(b, 2)); }
export async function totp(secret, step) {
  const k = await crypto.subtle.importKey('raw', unb32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, step);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
export async function totpOk(env, u, code) {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code) || !u.totp_secret) return false;
  const secret = await unseal(env, u.totp_secret).catch(() => null); if (!secret) return false;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) if (same(await totp(secret, step + d), code)) { // ยอมให้นาฬิกาคลาดได้ 30 วินาที · รหัสแต่ละช่วงเวลาใช้ได้ครั้งเดียว (กันคนแอบดูรหัสแล้วเอาไปใช้ซ้ำ)
    return !!(await env.DB.prepare('UPDATE users SET totp_last=?1 WHERE id=?2 AND COALESCE(totp_last,0)<?1').bind(step + d, u.id).run()).meta.changes;
  }
  return false;
}

// ---------- ล็อกอินด้วย Google / LINE ----------
export async function oauth(req, env, url, path) {
  const [, , , who, step] = path.split('/'), base = origin(req, env), cb = `${base}/api/oauth/${who}/callback`;
  const g = await getSettings(env, ['google_client_id', 'google_client_secret']);
  const cfg = { google: { id: env.GOOGLE_CLIENT_ID || g.google_client_id, secret: env.GOOGLE_CLIENT_SECRET || g.google_client_secret, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email', extra: '&prompt=select_account' },
    line: { id: env.LINE_CHANNEL_ID, secret: env.LINE_CHANNEL_SECRET, auth: 'https://access.line.me/oauth2/v2.1/authorize', token: 'https://api.line.me/oauth2/v2.1/token', scope: 'openid profile email', extra: '' } }[who];
  if (!cfg?.id) return err('ยังไม่ได้เปิดการล็อกอินแบบนี้', 404);
  const fail = m => Response.redirect(`${base}/login?error=${encodeURIComponent(m)}`, 302);
  if (!step) { // ไปหน้ายินยอมของผู้ให้บริการ
    const state = rand(16), ref = (url.searchParams.get('ref') || '').replace(/\W/g, '').slice(0, 12);
    return new Response(null, { status: 302, headers: { location: `${cfg.auth}?response_type=code&client_id=${encodeURIComponent(cfg.id)}&redirect_uri=${encodeURIComponent(cb)}&scope=${encodeURIComponent(cfg.scope)}&state=${state}${cfg.extra}`,
      'set-cookie': `oauth=${state}.${ref}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  if (who === 'google' && /(?:^|;\s*)gconn=/.test(req.headers.get('cookie') || '')) return googleConnectFinish(req, env, url, base, await getUser(req, env)); // เชื่อม Google ให้ AI ใช้ (ไม่ใช่ล็อกอิน)
  const [state, ref] = ((req.headers.get('cookie') || '').match(/(?:^|;\s*)oauth=([\w.]+)/)?.[1] || '').split('.');
  if (!state || !same(state, url.searchParams.get('state') || '')) return fail('หมดเวลา ลองใหม่อีกครั้ง'); // กันการปลอมคำขอ
  const tr = await fetch(cfg.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: cb, client_id: cfg.id, client_secret: cfg.secret || '' }) });
  const tk = await tr.json().catch(() => ({}));
  if (!tk.id_token) return fail('ล็อกอินไม่สำเร็จ');
  let info; // ได้ id_token ตรงจากผู้ให้บริการผ่าน HTTPS จึงอ่าน payload ได้เลย (LINE ตรวจซ้ำผ่าน API ของ LINE)
  if (who === 'line') info = await (await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: tk.id_token, client_id: cfg.id }) })).json();
  else info = JSON.parse(atob(tk.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!info?.sub) return fail('ล็อกอินไม่สำเร็จ');
  // อีเมลจาก LINE ไม่มีสถานะ "ยืนยันแล้ว": ใช้ตั้งบัญชีใหม่ได้ แต่ห้ามใช้ผูกเข้าบัญชีเดิม (กันคนตั้งอีเมลคนอื่นใน LINE แล้วยึดบัญชี)
  const col = who === 'google' ? 'google_id' : 'line_id', email = info.email && (who === 'line' || info.email_verified) ? String(info.email).toLowerCase() : null, verified = who === 'google' && !!email;
  let u = await env.DB.prepare(`SELECT * FROM users WHERE ${col}=?`).bind(info.sub).first();
  const cur = !u && who === 'line' && await getUser(req, env).catch(() => null); // ล็อกอินอยู่แล้วกด "เชื่อม LINE" ที่หน้าบัญชี: ผูกกับบัญชีที่ใช้อยู่ (Google ใช้อีเมลที่ยืนยันแล้วผูกเองอยู่แล้ว)
  if (cur && !cur[col] && !cur.banned) { await env.DB.prepare(`UPDATE users SET ${col}=? WHERE id=?`).bind(info.sub, cur.id).run(); return Response.redirect(`${base}/account#sec-security`, 302); }
  if (!u && email) {
    const ex = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (ex && !verified) return fail('อีเมลนี้มีบัญชีอยู่แล้ว เข้าสู่ระบบด้วยวิธีเดิม แล้วกด "เชื่อม LINE" ที่หน้าบัญชี');
    if (ex) { u = ex; await env.DB.prepare(`UPDATE users SET ${col}=?, email_verified=1${ex.email_verified ? '' : ', line_id=NULL'} WHERE id=?`).bind(info.sub, u.id).run(); } // เจ้าของอีเมลตัวจริงมาแล้ว: ตัด LINE ที่ผูกไว้ตอนอีเมลยังไม่ยืนยันออก
  }
  if (!u) {
    if (await limited(env, 'reg:' + ip(req, env), 3, DAY)) return fail('สมัครจากเครือข่ายนี้บ่อยเกินไป');
    const by = ref && await env.DB.prepare('SELECT id FROM users WHERE ref_code=?').bind(ref.toUpperCase()).first();
    u = await env.DB.prepare(`INSERT INTO users (email,pass_hash,role,created_at,ref_code,referred_by,${col},email_verified,has_password) VALUES (?,?,?,?,?,?,?,?,0) RETURNING *`)
      .bind(email || `${who}-${info.sub}@users.local`, 'x', 'user', Date.now(), rand(4).toUpperCase(), by?.id || null, info.sub, verified ? 1 : 0).first();
  }
  if (u.banned) return fail('บัญชีนี้ถูกระงับ');
  if (u.totp_on) return Response.redirect(`${base}/login?mfa=${await newToken(env, u.id, 'mfa', 600e3)}`, 302);
  return new Response(null, { status: 302, headers: { location: base + '/chat', 'set-cookie': await sessionCookie(env, u.id, req) } });
}

// ---------- สร้างรูป (API แบบ OpenAI images) ----------
const IMG_PROMPT_SYS = 'You write prompts for an image generation model. Turn the user\'s idea into ONE excellent prompt: keep their subject and intent exactly, then add concrete details: style or medium, composition and framing, camera or lens when photographic, lighting, color palette, mood, background, and fine details. If pictures are attached they are inspiration only: describe their style, character look, colors and atmosphere so the new image feels similar, but do not copy text, logos or watermarks. If the user wants text inside the image, keep that text exactly in quotes. Write the prompt in English (keep requested on-image text in its original language), at most 120 words, one paragraph, no lists, no explanations. Output only the prompt.';
export const IMG_SIZE_OK = new Set(['1024x1024', '1536x1024', '1024x1536']); // จัตุรัส / แนวนอน / แนวตั้ง
export async function imageGen(req, env, u) {
  const s = await getSettings(env, ['image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_cost']);
  if (s.image_enabled !== '1' || !env[s.image_key_name]) return err('ระบบสร้างรูปยังไม่เปิดใช้');
  const b = await req.json(), prompt = String(b.prompt || '').trim().slice(0, 2000), size = IMG_SIZE_OK.has(b.size) ? b.size : '1024x1024';
  if (!prompt) return err('บอกว่าอยากได้รูปแบบไหน');
  const plan = await planOf(env, u), st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
  if (await limited(env, 'img:' + u.id, 10, 3600e3)) return err('สร้างรูปได้ชั่วโมงละ 10 รูป', 429);
  // รูปอ้างอิง (แนบมากับคำบรรยาย): /images/edits · ไม่มี = สร้างจากข้อความ
  const refs = (Array.isArray(b.images) ? b.images : []).filter(x => typeof x === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(x) && x.length <= 8e6).slice(0, IMG_REF_MAX);
  const gen = sz => refs.length ? imageEditCall({ base: s.image_base_url, key: env[s.image_key_name], model: s.image_model, prompt, refs, opts: { size: sz } }) : fetch(s.image_base_url.replace(/\/$/, '') + '/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env[s.image_key_name] },
    body: JSON.stringify({ model: s.image_model, prompt, n: 1, size: sz }) });
  let r; try { r = await gen(size); } catch (x) { return err(x.message, 400); } if (r.status === 400 && size !== '1024x1024') r = await gen('1024x1024').catch(() => r); // ผู้ให้บริการไม่รับขนาดนี้: ใช้จัตุรัสแทน
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { await event(env, 'error', null, 'image: ' + (d.error?.message || r.status)); return err(u.role === 'admin' ? 'แอดมิน: ' + (d.error?.message || r.status) : 'สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง', 502); }
  const item = d.data?.[0]; let bytes;
  if (item?.b64_json) bytes = unb64(item.b64_json); else if (item?.url) bytes = new Uint8Array(await (await fetch(item.url)).arrayBuffer()); else return err('ไม่ได้รูปกลับมา', 502);
  const now = Date.now(); await touchWindows(env, u.id, now, plan);
  await env.DB.prepare("INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,src) VALUES (?,0,0,0,0,?,?,?,'image')").bind(u.id, Math.max(+s.image_cost || 0, 1e-9), +s.image_cost || 0, now).run();
  let src;
  if (b.inline) return json({ src: 'data:image/png;base64,' + b64(bytes), usage: await usageStatus(env, u, plan) }); // โหมด Code: เบราว์เซอร์ย่อรูปแล้วเก็บเป็นไฟล์ในโปรเจกต์เอง
  if (env.SLIPS) { const name = rand(12) + '.png'; await env.SLIPS.put(`img/${u.id}/${name}`, bytes, { httpMetadata: { contentType: 'image/png' } }); src = `/api/img/${u.id}/${name}`; }
  else src = await putImage(env, u.id, 'image/png', b64(bytes)); // ไม่มี R2: เก็บเป็นก้อนในฐานข้อมูล
  if (b.chat_id && await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(b.chat_id, u.id).first())
    await env.DB.batch([...(b.silent ? [] : [env.DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(b.chat_id, 'user', '🎨 ' + prompt + (refs.length ? ` (รูปอ้างอิง ${refs.length} รูป)` : ''), Date.now())]), // silent = AI สั่งสร้างเอง ไม่มีข้อความฝั่งผู้ใช้
      env.DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(b.chat_id, 'assistant', `![${prompt.slice(0, 80).replace(/[\[\]\s]+/g, ' ').trim()}](${src})`, Date.now())]);
  return json({ src, usage: await usageStatus(env, u, plan) });
}

// ---------- เติมโค้ดอัตโนมัติ (ghost text) ----------
export async function complete(req, env, u) {
  if (await limited(env, 'complete:' + u.id, 40, 60e3)) return json({ text: '' });
  const b = await req.json(), plan = await planOf(env, u), st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ text: '' });
  const want = +(await getSetting(env, 'autocomplete_model'));
  const m = await env.DB.prepare(`SELECT m.* FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.active=1 ${want ? 'AND m.id=?' : ''} ORDER BY m.multiplier LIMIT 1`).bind(...(want ? [plan.id, want] : [plan.id])).first();
  if (!m) return json({ text: '' });
  const prefix = String(b.prefix || '').slice(-3000), suffix = String(b.suffix || '').slice(0, 1000);
  let text = '', usage = null;
  try {
    for await (const e of callModel(env, m, [{ role: 'user', content: `File: ${String(b.path || '').slice(0, 200)}\n<code>${prefix}<CURSOR>${suffix}</code>\nReturn ONLY the code to insert at <CURSOR> (at most a few lines). No explanations, no markdown fences. If nothing fits, return nothing.` }],
      { system: 'You are a code completion engine.', maxTokens: 96, effort: null })) { if (e.t) text += e.t; if (e.usage) usage = e.usage; }
  } catch { return json({ text: '' }); }
  if (usage) await logUsage(env, u.id, m, usage, { plan, src: 'complete' });
  return json({ text: text.replace(/^```\w*\n?|```$/g, '').replace(/<\/?code>|<CURSOR>/g, '').split('\n').slice(0, 8).join('\n').slice(0, 400) }); // เดาแค่ไม่กี่บรรทัด
}
