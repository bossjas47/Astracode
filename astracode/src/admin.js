import { resyncPrimary, multiOn, BKK, DAY, creditsInit, err, esc, hex, json, limitBoost, limited, logReset, planOf, rand, resetUsage, same, slipGet, unlimit, usageStatus } from './core.js';
import { callModel, ensureFb, isSafeMcpUrl, logUsage, mcpSync } from './ai.js';
import { applyPayment, audit, promoOn, supplyIssue, releaseCoupon, getSetting, getSettings, mail, mailBox, notify, priceOf, siteUrl as siteUrlOf, slipLooksOk, topupPromo, walletAdd } from './billing.js';
import { seal } from './projects.js';
import { adminConnectors, adminPlugins } from './connectors.js';
import { agentQuality, slug } from './api.js';
import { backup, lossModels, status, verifyBackup } from './jobs.js';
import { ensureAgentTable, launch, workerModel } from './agent.js';
// ---------- admin ----------
// ใช้ร่วมกันทุกหน้า · วันตามเวลาไทย
// rev (รายได้ที่แสดง) = เงินที่โอนเข้าจริง: ค่าแพลน + เติม Wallet (ไม่นับแพลนที่จ่ายจาก Wallet/คูปองซ้ำ)
// earned (ใช้คิดกำไร) = ค่าแพลนที่อนุมัติทุกช่องทาง + เงินที่หักจาก Wallet เป็นค่าใช้จริง (API / เกินลิมิต / แพ็ก) · เงินเติมที่ยังไม่ใช้ไม่นับเป็นกำไร
export const WALLET_SPEND = "('api','overflow','agentpack','wallet')";
const NOREP = "user_id NOT IN (SELECT id FROM users WHERE no_report=1 OR role<>'user')"; // บัญชีที่ไม่นับในรายงาน (แอดมิน/ทีม/ติ๊กไว้)
export async function revenueByDay(DB, from, to = 9e15) {
  const day = c => `CAST((${c}+${BKK})/${DAY} AS INTEGER)`, at = 'COALESCE(approved_at,created_at)';
  const [pl, wl, tp] = await Promise.all([
    DB.prepare(`SELECT ${day(at)} d, SUM(amount) v FROM payments WHERE kind='plan' AND status='approved' AND ${NOREP} AND ${at}>=? AND ${at}<? GROUP BY d`).bind(from, to).all(),
    DB.prepare(`SELECT ${day('created_at')} d, -SUM(amount) v FROM wallet_tx WHERE kind IN ${WALLET_SPEND} AND ${NOREP} AND created_at>=? AND created_at<? GROUP BY d`).bind(from, to).all(),
    DB.prepare(`SELECT ${day(at)} d, SUM(amount) v FROM payments WHERE status='approved' AND ${NOREP} AND kind IN ('plan','topup') AND COALESCE(slip_key,'') NOT IN ('wallet','coupon') AND ${at}>=? AND ${at}<? GROUP BY d`).bind(from, to).all(),
  ]);
  const m = new Map(), put = (rows, k) => rows.results.forEach(r => { const o = m.get(r.d) || { d: r.d, plan: 0, wallet: 0, cash: 0 }; o[k] += r.v || 0; m.set(r.d, o); });
  put(pl, 'plan'); put(wl, 'wallet'); put(tp, 'cash');
  for (const o of m.values()) { o.earned = o.plan + o.wallet; o.rev = o.cash; }
  return m;
}
const sumRev = m => [...m.values()].reduce((a, o) => ({ rev: a.rev + o.rev, earned: a.earned + o.earned, plan: a.plan + o.plan, wallet: a.wallet + o.wallet, cash: a.cash + o.cash }), { rev: 0, earned: 0, plan: 0, wallet: 0, cash: 0 });
// วันเริ่มของช่วง N วันล่าสุด (เที่ยงคืนเวลาไทย) · ใช้เหมือนกันทั้งหน้าภาพรวมและหน้ากำไร ตัวเลขจึงตรงกัน
export const rangeFrom = (days, now = Date.now()) => (Math.floor((now + BKK) / DAY) - days + 1) * DAY - BKK;
export const TABLES = {
  plans: ['name', 'price', 'price_year', 'days', 'once', 'limit_4h', 'use_4h', 'limit_week', 'seats', 'shared_pool', 'api_limit', 'agent', 'cowork', 'sites', 'compare', 'min_margin', 'description', 'sort', 'active'],
  models: ['name', 'provider', 'api_model', 'base_url', 'key_name', 'multiplier', 'cap_pct', 'cost_in', 'cost_out', 'cost_cache', 'cost_cache_write', 'price_in', 'price_out', 'price_cache', 'price_cache_write', 'promo_pct', 'promo_start', 'promo_end', 'use_mult', 'promo_mult', 'first_token_s', 'idle_s', 'ctx_k', 'long_k', 'long_in', 'long_out', 'req_cap', 'bill', 'req_cost', 'req_price', 'code_prompt', 'sys_prompt', 'public', 'note', 'cats', 'fallback_id', 'vision', 'tools', 'effort', 'effort_levels', 'sort', 'active', 'new_until'],
  posts: ['slug', 'title', 'summary', 'body', 'cover', 'published', 'changelog'],
};
export const SETTINGS = ['promptpay_id', 'slip_provider', 'slip_auto_approve', 'multi_plan', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account', 'slip_api_url', 'slip_amount_field', 'featured_plan', 'price_markup', 'price_note', 'referral_bonus', 'announcement', 'announcement_level', 'maintenance',
  'alert_discord', 'alert_line_to', 'cost_alert_daily', 'alert_hour_cost', 'alert_user_hour', 'video_enabled', 'video_price', 'video_key_name', 'video_model', 'agent_pack_enabled', 'agent_pack_price', 'agent_pack_units', 'agent_pack_days', 'mail_from', 'search_enabled', 'search_auto', 'health_check', 'turnstile_site', 'image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_units', 'image_cost',
  'autocomplete_model', 'auto_cheap_model', 'auto_strong_model', 'summary_model', 'business_name', 'business_address', 'business_tax_id', 'topup_min', 'fb_api_key', 'google_client_id', 'google_client_secret',
  'model_icons', 'picker_filter', 'picker_mult', 'picker_logos', 'official_prices', 'block_words', 'compact_pct', 'team_budget_pct', 'team_worker_model', 'meeting_model', 'image_prompt_model', 'block_domains', 'first_topup_pct', 'first_topup_max', 'aff_pct', 'aff_months', 'winback_credit', 'canned_replies', 'promo_until', 'promo_x4h', 'promo_xweek', 'promo_label', 'easyslip_url', 'checkslip_url', 'easyslip_receiver', 'easyslip_receiver_names', 'bank_name', 'bank_account', 'bank_holder'];

// ---------- รหัสผ่านชั้นที่สองของหน้าแอดมิน (ตั้งครั้งแรกเอง · ปลดล็อกต่อ session 12 ชม.) ----------
const GATE_MS = 12 * 36e5;
const gateHash = async (pw, salt) => hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']), 256));
export async function gateBlock(env, u) { // คืน Response 403 ถ้ายังไม่ปลดล็อก · null = ผ่าน
  const ok = (await env.DB.prepare('SELECT admin_ok FROM sessions WHERE token=?').bind(u.sid).first())?.admin_ok;
  return ok > Date.now() ? null : json({ error: 'admin_gate', gate: true, set: !!(await getSetting(env, 'admin_gate')) }, 403);
}
export async function adminGate(req, env, u) {
  const saved = await getSetting(env, 'admin_gate'), unlocked = (await gateBlock(env, u)) === null;
  if (req.method === 'GET') return json({ set: !!saved, ok: unlocked });
  if (req.method !== 'POST') return err('method not allowed', 405);
  const b = await req.json().catch(() => ({})), pw = String(b.password || ''), next = String(b.new || '');
  if (await limited(env, 'agate:' + u.id, 8, 15 * 60e3)) return err('ลองผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่', 429);
  const [salt, h] = saved.split(':');
  if (saved && !same(await gateHash(pw, salt), h || '')) return err('รหัสผ่านไม่ถูกต้อง', 403);
  const fresh = !saved ? pw : next; // ยังไม่ตั้ง = รหัสที่ส่งมาคือรหัสใหม่ · ตั้งแล้ว = ส่ง new เพื่อเปลี่ยน
  if (fresh && u.role !== 'admin') return err('เฉพาะแอดมินหลักตั้งหรือเปลี่ยนรหัสหลังบ้านได้', 403);
  if (fresh) {
    if (fresh.length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
    const s = hex(crypto.getRandomValues(new Uint8Array(12)));
    await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').bind('admin_gate', s + ':' + await gateHash(fresh, s)), env.DB.prepare('UPDATE sessions SET admin_ok=NULL WHERE user_id=?').bind(u.id)]); // เปลี่ยนรหัส = เครื่องอื่นต้องใส่ใหม่
  }
  await env.DB.prepare('UPDATE sessions SET admin_ok=? WHERE token=?').bind(Date.now() + GATE_MS, u.sid).run();
  await unlimit(env, 'agate:' + u.id);
  return json({ ok: true, set: true });
}
export const ensureRoadmap = env => env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS roadmap (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'planned', created_at INTEGER NOT NULL)"), env.DB.prepare('CREATE TABLE IF NOT EXISTS roadmap_votes (item_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (item_id, user_id))')]);
export async function admin(req, env, path, url, me) {
  const M = req.method, DB = env.DB;
  const ctxAudit = M === 'GET' ? async () => {} : (action, detail) => audit(env, me, action, detail); // บันทึกทุกการแก้ไขของแอดมิน
  let r;
  if ((r = path.match(/^\/api\/admin\/model-usage\/(\d+)$/)) && M === 'GET') { // กดดูรายละเอียดโมเดลในภาพรวม: ใครใช้ ใช้จากไหน คำขอล่าสุด
    const id = +r[1], days = Math.min(90, Math.max(1, +url.searchParams.get('days') || 7)), from = Date.now() - days * DAY;
    const q = (sql, ...a) => DB.prepare(sql).bind(...a).all().then(x => x.results);
    const [byUser, bySrc, recent] = await Promise.all([
      q('SELECT u.user_id id, us.email, COUNT(*) n, SUM(u.tokens_in) tin, SUM(u.tokens_out) tout, SUM(u.tokens_cache) tc, SUM(u.cost) cost, SUM(COALESCE(u.charge,0)) charge FROM usage u LEFT JOIN users us ON us.id=u.user_id WHERE u.model_id=? AND u.created_at>=? GROUP BY u.user_id ORDER BY cost DESC LIMIT 50', id, from),
      q("SELECT COALESCE(src,'-') src, COUNT(*) n, SUM(cost) cost, SUM(COALESCE(charge,0)) charge FROM usage WHERE model_id=? AND created_at>=? GROUP BY src ORDER BY cost DESC", id, from),
      q('SELECT u.created_at t, u.user_id id, us.email, u.tokens_in tin, u.tokens_out tout, u.tokens_cache tc, u.cost, u.charge, u.ms, u.src FROM usage u LEFT JOIN users us ON us.id=u.user_id WHERE u.model_id=? AND u.created_at>=? ORDER BY u.id DESC LIMIT 30', id, from),
    ]);
    const m = await DB.prepare('SELECT id,name,api_model,cost_in,cost_out,cost_cache,price_in,price_out,use_mult FROM models WHERE id=?').bind(id).first();
    return json({ model: m, days, by_user: byUser, by_src: bySrc, recent });
  }
  if ((r = path.match(/^\/api\/admin\/(plans|models|posts)(?:\/(\d+))?$/))) {
    const [, t, id] = r, cols = TABLES[t];
    if (M === 'GET') {
      const rows = (await DB.prepare(`SELECT * FROM ${t} ORDER BY ${t === 'posts' ? 'id DESC' : 'sort,id'}`).all()).results;
      if (t === 'plans') { const pm = (await DB.prepare('SELECT * FROM plan_models').all()).results; rows.forEach(p => p.model_ids = pm.filter(x => x.plan_id === p.id).map(x => x.model_id)); }
      else if (t === 'models') rows.forEach(m => m.has_key = !!env[m.key_name]);
      return json(rows);
    }
    if (M === 'DELETE' && id) {
      await ctxAudit('delete ' + t, { id });
      await DB.prepare(`DELETE FROM ${t} WHERE id=?`).bind(id).run();
      if (t !== 'posts') await DB.prepare(`DELETE FROM plan_models WHERE ${t === 'plans' ? 'plan_id' : 'model_id'}=?`).bind(id).run();
      return json({ ok: true });
    }
    const b = await req.json();
    if (t === 'models') { // เลือกแบบเดียว: ตาม token หรือเหมาต่อ request
      b.bill = b.bill === 'request' ? 'request' : null;
      if (b.bill && !(+b.req_cost > 0)) return err('คิดต่อ request ต้องใส่ต้นทุนต่อ request มากกว่า 0');
      if (!b.bill) { b.req_cost = null; b.req_price = null; } // โหมด token ล้างค่าต่อ request ทิ้ง ไม่ค้างปนกัน
    }
    if (t === 'plans' && b.min_margin != null && b.min_margin !== '' && +b.price > 0) { // กำไรขั้นต่ำ: ลิมิตสัปดาห์ = ราคา × (1 − กำไร%) ÷ จำนวนสัปดาห์ (กรณีลูกค้าใช้เต็มทุกสัปดาห์)
      const m = +b.min_margin; if (!(m >= 0 && m < 100)) return err('กำไรขั้นต่ำต้องอยู่ระหว่าง 0–99%');
      const weeks = +b.days > 0 ? +b.days / 7 : 30 / 7, members = +b.seats > 1 && !+b.shared_pool && !+b.per_seat ? +b.seats : 1; // แพลนทีมแยกโควตาต่อคน: แบ่งเงินตามจำนวนคน
      const ratio = +b.limit_week > 0 && +b.limit_4h > 0 ? +b.limit_4h / +b.limit_week : 0.25, wk = Math.round(+b.price * (1 - m / 100) / weeks / members * 100) / 100;
      b.limit_week = wk; b.limit_4h = Math.round(wk * ratio * 100) / 100;
    }
    if (t === 'plans' && !(b.limit_4h > 0)) b.limit_4h = +b.limit_week || 0; // ปิดรอบ 4 ชม./เว้นว่าง: ใช้งบเท่ารอบสัปดาห์ (คอลัมน์ห้ามว่าง)
    const vals = cols.map(c => b[c] ?? null);
    if (t === 'posts' && !/^[a-z0-9-]{1,80}$/.test(b.slug || '')) return err('slug ใช้ได้เฉพาะ a-z 0-9 และ -');
    if (t === 'models' && b.promo_pct != null && !(b.promo_pct >= 0 && b.promo_pct <= 100)) return err('โปรลดราคาต้องอยู่ระหว่าง 0–100%');
    if (t === 'models' && [b.use_mult, b.promo_mult].some(v => v != null && !(v >= 0 && v <= 100))) return err('ตัวคูณลิมิตต้องอยู่ระหว่าง 0–100');
    if (t === 'models' && b.promo_start && b.promo_end && b.promo_end < b.promo_start) return err('วันจบโปรต้องอยู่หลังวันเริ่ม');
    await ctxAudit((M === 'POST' ? 'create ' : 'update ') + t, { id, name: b.name || b.title });
    let pid = id;
    if (M === 'POST') pid = (t === 'posts' ? await DB.prepare(`INSERT INTO posts (${cols},created_at) VALUES (${cols.map(() => '?')},?) RETURNING id`).bind(...vals, Date.now()).first()
      : await DB.prepare(`INSERT INTO ${t} (${cols}) VALUES (${cols.map(() => '?')}) RETURNING id`).bind(...vals).first()).id;
    else if (M === 'PUT' && id) await DB.prepare(`UPDATE ${t} SET ${cols.map(c => c + '=?')} WHERE id=?`).bind(...vals, id).run();
    else return err('bad request');
    if (t === 'plans' && Array.isArray(b.model_ids)) await DB.batch([
      DB.prepare('DELETE FROM plan_models WHERE plan_id=?').bind(pid),
      ...b.model_ids.map(mid => DB.prepare('INSERT INTO plan_models VALUES (?,?)').bind(pid, mid)),
    ]);
    return json({ ok: true, id: pid });
  }
  if (path === '/api/admin/payments') { // ป้าย likely_ok = ถูกปฏิเสธแต่ผลตรวจบอกว่าสลิปจริง ยอดตรง ผู้รับถูก (เช่นบั๊กเทียบบัญชีผู้รับเดิม)
    const rows = (await DB.prepare(
    'SELECT p.*,u.email,CASE WHEN p.kind=\'topup\' THEN \'เติม Wallet\' ELSE pl.name || CASE WHEN p.period=\'year\' THEN \' (รายปี)\' ELSE \'\' END END plan_name FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id ORDER BY p.status=\'pending\' DESC, COALESCE(p.review,0) DESC, p.id DESC LIMIT 200').all()).results, st = await getSettings(env, ['easyslip_receiver', 'promptpay_id', 'bank_account']);
    return json(rows.map(p => p.status === 'rejected' && slipLooksOk(p, st) ? { ...p, likely_ok: 1 } : p));
  }
  if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/)) && M === 'POST') {
    // อนุมัติย้อนหลังได้ทั้งที่รอตรวจและที่ถูกปฏิเสธ (สลิปที่ระบบปฏิเสธผิด) · ดัชนี unique ของ slip_ref กันอนุมัติสลิปที่ใช้ไปแล้วกับรายการอื่น
    const from = r[2] === 'approve' ? "status IN ('pending','rejected')" : "status='pending'";
    const p = await DB.prepare(`SELECT * FROM payments WHERE id=? AND ${from}`).bind(r[1]).first();
    if (!p) return err('ไม่พบคำขอที่จัดการได้', 404);
    const fix = r[2] === 'approve' && p.kind === 'topup' ? +(await req.json().catch(() => ({}))).amount : 0; // เติมเงิน: แอดมินใส่ยอดตามสลิปจริง
    if (fix && !(fix > 0 && fix <= 50000)) return err('ยอดเงินไม่ถูกต้อง');
    if (fix) { p.amount = Math.round(fix * 100) / 100; await DB.prepare('UPDATE payments SET amount=? WHERE id=?').bind(p.amount, p.id).run(); }
    const upd = await DB.prepare(`UPDATE payments SET status=?, approved_at=?, review=NULL WHERE id=? AND ${from}`).bind(r[2] === 'approve' ? 'approved' : 'rejected', Date.now(), p.id).run().catch(e => { if (/UNIQUE/i.test(e.message)) return null; throw e; });
    if (!upd) return err('สลิปนี้ (เลขอ้างอิงเดียวกัน) ถูกอนุมัติกับรายการอื่นไปแล้ว', 409);
    if (!upd.meta.changes) return err('คำขอนี้ถูกจัดการไปแล้ว', 409); // กันกดอนุมัติซ้ำพร้อมกัน
    await ctxAudit(r[2] + ' payment', { id: p.id, amount: p.amount, user: p.user_id });
    if (r[2] === 'approve') await applyPayment(env, p);
    else await releaseCoupon(env, p.coupon, p.user_id); // ปฏิเสธ: คืนสิทธิ์คูปองที่จองไว้ตอนส่งสลิป
    return json({ ok: true });
  }
  if ((r = path.match(/^\/api\/admin\/subs\/(\d+)$/)) && M === 'POST') { // หลายแพลน: แอดมินเพิ่มวัน / ปิดใบ ทีละใบ
    const b = await req.json().catch(() => ({})), s = await DB.prepare('SELECT * FROM subscriptions WHERE id=?').bind(+r[1]).first(); if (!s) return err('ไม่พบแพลนใบนี้', 404);
    const now = Date.now();
    if (b.action === 'extend') { const d = Math.round(+b.days); if (!(d >= 1 && d <= 3650)) return err('จำนวนวันไม่ถูกต้อง'); await DB.prepare("UPDATE subscriptions SET expires_at=MAX(expires_at, ?)+?, status='active' WHERE id=?").bind(now, d * DAY, s.id).run(); }
    else if (b.action === 'end') await DB.prepare("UPDATE subscriptions SET status='expired', expires_at=? WHERE id=?").bind(now, s.id).run();
    else return err('action ไม่ถูกต้อง');
    await ctxAudit('sub ' + b.action, { id: s.id, user: s.user_id, days: b.days || null });
    await resyncPrimary(env, s.user_id);
    return json({ ok: true });
  }
  if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/refund$/)) && M === 'POST') { // คืนเงิน: ปิดแพลน/หักยอดเติม · wallet=1 = คืนเป็นเครดิต ไม่งั้นแอดมินโอนคืนเอง
    const b = await req.json().catch(() => ({}));
    const p = await DB.prepare("UPDATE payments SET status='refunded' WHERE id=? AND status='approved' RETURNING *").bind(r[1]).first();
    if (!p) return err('คืนเงินได้เฉพาะรายการที่สำเร็จแล้ว', 404);
    await ctxAudit('refund payment', { id: p.id, amount: p.amount, user: p.user_id, wallet: !!b.wallet });
    const ref = 'payment#' + p.id;
    if (p.kind === 'topup') await walletAdd(env, p.user_id, -p.amount, 'refund', ref); // เงินออกจาก Wallet (อาจติดลบถ้าใช้ไปแล้ว)
    else {
      const now = Date.now(), pl = await DB.prepare('SELECT seats FROM plans WHERE id=?').bind(p.plan_id).first();
      if (pl?.seats > 1) await DB.prepare('UPDATE teams SET expires=? WHERE owner_id=? AND plan_id=? AND expires>?').bind(now, p.user_id, p.plan_id, now).run();
      else if (await multiOn(env) && (p.sub_id || await DB.prepare('SELECT 1 FROM subscriptions WHERE payment_id=?').bind(p.id).first().catch(() => null))) { // หลายแพลน: ปิดเฉพาะใบที่ซื้อด้วยรายการนี้ · รายการต่ออายุ = หักวันที่เพิ่มคืน
        const days = (p.period === 'year' ? 365 : (await DB.prepare('SELECT days FROM plans WHERE id=?').bind(p.plan_id).first())?.days || 30) * DAY;
        if (p.sub_id) await DB.prepare('UPDATE subscriptions SET expires_at=MAX(?, expires_at-?) WHERE id=?').bind(now, days, p.sub_id).run();
        else await DB.prepare("UPDATE subscriptions SET status='refunded', expires_at=? WHERE payment_id=?").bind(now, p.id).run();
        await resyncPrimary(env, p.user_id);
      }
      else await DB.prepare('UPDATE users SET plan_expires=? WHERE id=? AND plan_id=? AND plan_expires>?').bind(now, p.user_id, p.plan_id, now).run();
      if (b.wallet) await walletAdd(env, p.user_id, p.amount, 'refund', ref);
    }
    const u = await DB.prepare('SELECT email FROM users WHERE id=?').bind(p.user_id).first();
    await mail(env, u?.email, 'Kyber: คืนเงินแล้ว', mailBox('คืนเงินแล้ว', `รายการ #${p.id} ฿${p.amount} ถูกยกเลิก ${p.kind !== 'topup' && b.wallet ? 'คืนเป็นเครดิตเข้า Wallet แล้ว' : 'เราจะโอนเงินคืนเข้าบัญชีของคุณ'}`)).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/api/admin/margin') return json(await lossModels(env));
  if ((r = path.match(/^\/api\/admin\/reports\/(\d+)\/context$/))) { // แชตรอบข้อความที่ถูกรายงาน (เปิดดูได้เฉพาะแชตที่มีคนรายงาน) · บันทึกว่าแอดมินคนไหนเปิดดู
    const rp = await DB.prepare('SELECT r.message_id, m.chat_id FROM reports r JOIN messages m ON m.id=r.message_id WHERE r.id=?').bind(+r[1]).first();
    if (!rp) return err('ไม่พบข้อความที่ถูกรายงาน (อาจถูกลบแล้ว)', 404);
    await audit(env, me, 'view reported chat', { report: +r[1], chat: rp.chat_id });
    const msgs = (await DB.prepare('SELECT id,role,content,created_at FROM messages WHERE chat_id=? AND id BETWEEN ?-12 AND ?+4 ORDER BY id').bind(rp.chat_id, rp.message_id, rp.message_id).all()).results;
    return json(msgs.map(x => ({ ...x, content: x.content.replace(/\[\[file:([^\]]+)\]\][\s\S]*?\[\[\/file\]\]/g, '[ไฟล์ $1]').slice(0, 4000), reported: x.id === rp.message_id })));
  }
  if (path === '/api/admin/fraud') { // บัญชีที่น่าสงสัย: หลายบัญชีจาก IP เดียว · ผู้ชวนกับผู้ถูกชวนใช้ IP เดียวกัน (โกงโบนัส/ค่าคอม)
    const since = Date.now() - 60 * DAY;
    const [ips, refs] = await Promise.all([
      DB.prepare("SELECT s.ip, COUNT(DISTINCT s.user_id) n, group_concat(DISTINCT u.email) emails FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.ip IS NOT NULL AND s.ip<>'' AND s.created_at>? GROUP BY s.ip HAVING n>=3 ORDER BY n DESC LIMIT 50").bind(since).all(),
      DB.prepare(`SELECT u.id, u.email, r.email referrer, r.id rid, (SELECT COALESCE(SUM(amount),0) FROM wallet_tx w WHERE w.user_id=r.id AND w.kind IN ('affiliate','referral') AND (w.ref='user#'||u.id OR w.ref LIKE 'user#'||u.id||' %')) paid
        FROM users u JOIN users r ON r.id=u.referred_by WHERE u.created_at>? AND EXISTS (SELECT 1 FROM sessions a JOIN sessions b ON a.ip=b.ip WHERE a.user_id=u.id AND b.user_id=r.id AND a.ip IS NOT NULL AND a.ip<>'') ORDER BY u.id DESC LIMIT 100`).bind(since).all(),
    ]);
    return json({ ips: ips.results.map(x => ({ ...x, emails: String(x.emails || '').split(',').slice(0, 20) })), refs: refs.results });
  }
  if ((r = path.match(/^\/api\/admin\/slip\/(\d+)$/))) {
    const p = await DB.prepare('SELECT slip_key FROM payments WHERE id=?').bind(r[1]).first();
    const o = p && await slipGet(env, p.slip_key);
    const t = o?.httpMetadata?.contentType;
    if (!o || !['image/jpeg', 'image/png', 'image/webp'].includes(t)) return err('not found', 404);
    return new Response(o.body, { headers: { 'content-type': t, 'content-security-policy': "default-src 'none'; sandbox", 'cache-control': 'private, no-store' } });
  }
  if (path === '/api/admin/users') {
    const q = '%' + (url.searchParams.get('q') || '') + '%';
    return json((await DB.prepare(`SELECT u.id,u.email,u.role,u.no_report,u.plan_id,u.plan_expires,u.banned,u.created_at,p.name plan_name,
      (SELECT MAX(created_at) FROM usage WHERE user_id=u.id) last_active,
      (SELECT COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) FROM usage WHERE user_id=u.id AND created_at>?2) tok30
      FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.email LIKE ?1 ORDER BY u.id DESC LIMIT 100`).bind(q, Date.now() - 30 * DAY).all()).results);
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)\/model-credits(?:\/(\d+))?$/))) { // เครดิตเฉพาะโมเดล (แยกจาก Wallet)
    const C = await import('./credits.js'), uid = +r[1];
    if (M === 'GET') return json(await C.modelCredits(env, uid));
    if (M === 'POST' && !r[2]) { try { const b = await req.json(); const cid = await C.grantModelCredit(env, uid, b, me?.id); await audit(env, me, 'grant model credit', { user: uid, credit: cid, amount: +b.amount, models: b.models }); return json({ ok: true, id: cid }); } catch (e) { return err(e.message); } }
    if (M === 'DELETE' && r[2]) { await C.revokeModelCredit(env, uid, +r[2]); await audit(env, me, 'revoke model credit', { user: uid, credit: +r[2] }); return json({ ok: true }); }
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'PUT') {
    const b = await req.json();
    await ctxAudit('update user', { id: +r[1], ...b });
    if (b.credit) { const v = Math.round(+b.credit * 100) / 100; if (!v) return err('จำนวนเงินไม่ถูกต้อง'); await walletAdd(env, +r[1], v, 'admin', String(b.note || '').slice(0, 100) || null); }
    if ('no_report' in b) await DB.prepare('UPDATE users SET no_report=? WHERE id=?').bind(b.no_report ? 1 : null, r[1]).run(); // ไม่นับในรายงาน
    if (b.logout) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run(); // รหัสผ่านอยู่ใน Firebase ผู้ใช้รีเซ็ตเองที่หน้าเข้าสู่ระบบ
    let scopedRows = null;
    if (b.reset_usage) {
      const n = await resetUsage(env, +r[1], b.scope), lbl = b.scope?.vendor ? 'ค่าย ' + String(b.scope.vendor).slice(0, 40) : b.scope?.model_id ? 'โมเดล #' + (+b.scope.model_id) : 'ทั้งหมด';
      await logReset(env, +r[1], 'direct', lbl, { by: me.email });
      scopedRows = n;
    }
    if ('role' in b) { // ตั้ง/ถอดแอดมิน · ถอดตัวเองไม่ได้ (กันหลังบ้านไม่มีใครเข้าได้) · ถอดแล้วต้องใส่รหัสหลังบ้านใหม่
      if (!['admin', 'support', 'viewer', 'user'].includes(b.role)) return err('role ไม่ถูกต้อง');
      if (+r[1] === me.id) return err('เปลี่ยนสิทธิ์ของตัวเองไม่ได้');
      const t = await DB.prepare('SELECT banned FROM users WHERE id=?').bind(r[1]).first(); if (!t) return err('ไม่พบผู้ใช้', 404);
      if (b.role !== 'user' && t.banned) return err('ผู้ใช้นี้ถูกแบนอยู่');
      await DB.batch([DB.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role, r[1]), DB.prepare('UPDATE sessions SET admin_ok=NULL WHERE user_id=?').bind(r[1])]);
    }
    if ('banned' in b) { if (b.banned && +r[1] === me.id) return err('แบนตัวเองไม่ได้'); await DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(b.banned ? 1 : 0, r[1]).run(); }
    if ('plan_id' in b) await DB.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').bind(b.plan_id || null, b.plan_id ? Date.now() + (b.days || 30) * DAY : null, r[1]).run();
    if (b.banned) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run();
    return json(scopedRows == null ? { ok: true } : { ok: true, rows: scopedRows });
  }
  if (path === '/api/admin/stats') { // ช่วงเวลาปัจจุบันเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
    const now = Date.now(), today = Math.floor((now + BKK) / DAY), from = (today - days + 1) * DAY - BKK, prev = from - days * DAY;
    const dayOf = col => `CAST((${col}+${BKK})/${DAY} AS INTEGER)`;
    const [use, pays, regs, cur, old, models, top, users, pending] = await Promise.all([
      DB.prepare(`SELECT ${dayOf('created_at')} d, SUM(tokens_in) tin, SUM(tokens_out) tout, SUM(tokens_cache) tc, SUM(cost) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au FROM usage WHERE created_at>=? GROUP BY d`).bind(from).all(),
      revenueByDay(DB, from),
      DB.prepare(`SELECT ${dayOf('created_at')} d, COUNT(*) n FROM users WHERE created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1`).bind(from).first(),
      DB.prepare(`SELECT COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1 AND created_at<?2`).bind(prev, from).first(),
      DB.prepare('SELECT m.id, m.name, COUNT(*) msgs, SUM(u.tokens_in) tin, SUM(u.tokens_out) tout, SUM(u.tokens_cache) tc, SUM(u.cost) cost FROM usage u JOIN models m ON m.id=u.model_id WHERE u.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(from).all(),
      DB.prepare('SELECT us.id, us.email, p.name plan, COUNT(*) msgs, SUM(u.tokens_in+u.tokens_out+u.tokens_cache) tok, SUM(u.cost) cost FROM usage u JOIN users us ON us.id=u.user_id LEFT JOIN plans p ON p.id=us.plan_id AND us.plan_expires>? WHERE u.created_at>=? GROUP BY us.id ORDER BY cost DESC LIMIT 10').bind(now, from).all(),
      DB.prepare('SELECT COUNT(*) total, COALESCE(SUM(plan_id IS NOT NULL AND plan_expires>?),0) paid FROM users').bind(now).first(),
      DB.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").first(),
    ]);
    Object.assign(cur, sumRev(pays)); Object.assign(old, sumRev(await revenueByDay(DB, prev, from)));
    const U = new Map(use.results.map(r => [r.d, r])), P = new Map([...pays.values()].map(r => [r.d, r.rev])), R = new Map(regs.results.map(r => [r.d, r.n]));
    const daily = Array.from({ length: days }, (_, i) => {
      const d = today - days + 1 + i, u = U.get(d) || {};
      return { day: d * DAY, tin: u.tin || 0, tout: u.tout || 0, tc: u.tc || 0, cost: u.cost || 0, msgs: u.msgs || 0, au: u.au || 0, rev: P.get(d) || 0, reg: R.get(d) || 0 };
    });
    const bySrc = (await DB.prepare("SELECT COALESCE(src,'-') src, COUNT(*) n, COALESCE(SUM(cost),0) cost, COALESCE(SUM(charge),0) charge FROM usage WHERE created_at>=? GROUP BY src ORDER BY cost DESC").bind(from).all()).results; // charge = เงินที่หักจาก Wallet จริง (ใช้ในลิมิตแพลน = 0)
    return json({ days, cur, prev: old, daily, models: models.results, top: top.results, users, pending: pending.n, by_src: bySrc });
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'GET') { // รายละเอียดผู้ใช้ 30 วันล่าสุด
    const u = await DB.prepare('SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,u.usage_reset_at,u.sess_start,u.week_start,u.balance,u.email_verified,u.totp_on,u.google_id,u.line_id,u.plan_period,p.name plan_name FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.id=?').bind(r[1]).first();
    if (!u) return err('ไม่พบผู้ใช้', 404);
    const since = Date.now() - 30 * DAY;
    const [models, pays, chats] = await Promise.all([
      DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(x.tokens_in+x.tokens_out+x.tokens_cache) tok, SUM(x.tokens_in) tin, SUM(x.tokens_out) tout, SUM(x.tokens_cache) tc, SUM(x.cost) cost FROM usage x JOIN models m ON m.id=x.model_id WHERE x.user_id=? AND x.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(u.id, since).all(),
      DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 10').bind(u.id).all(),
      DB.prepare('SELECT COUNT(*) n FROM chats WHERE user_id=?').bind(u.id).first(),
    ]);
    u.wallet = (await DB.prepare('SELECT amount,balance_after,kind,ref,created_at FROM wallet_tx WHERE user_id=? ORDER BY id DESC LIMIT 15').bind(u.id).all()).results;
    u.recent = (await DB.prepare("SELECT x.created_at,x.tokens_in tin,x.tokens_out tout,x.tokens_cache tc,x.cost,x.ms,x.src,x.charge,COALESCE(m.name,'รูปภาพ') name FROM usage x LEFT JOIN models m ON m.id=x.model_id WHERE x.user_id=? ORDER BY x.id DESC LIMIT 30").bind(u.id).all()).results;
    u.keys = (await DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n;
    const plan = await planOf(env, u);
    const subs = await multiOn(env) ? (await DB.prepare("SELECT s.id, s.plan_id, s.status, s.starts_at, s.expires_at, s.auto_renew, s.payment_id, s.legacy, p.name FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY (s.status='active' AND s.expires_at>?) DESC, s.expires_at DESC LIMIT 20").bind(u.id, Date.now()).all().catch(() => ({ results: [] }))).results : null;
    return json({ ...u, usage: await usageStatus(env, u, plan), current_plan: plan.name, models: models.results, payments: pays.results, chats: chats.n, subs });
  }
  if (path === '/api/admin/settings') {
    if (M === 'PUT') await ctxAudit('update settings', Object.keys(await req.clone().json()));
    if (M === 'PUT') { const b = await req.json(), q = SETTINGS.filter(k => k in b && (k !== 'google_client_secret' || b[k])).map(k => DB.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').bind(k, String(b[k]))); if (q.length) await DB.batch(q); } // ช่อง secret ว่าง = คงค่าเดิม
    const rows = (await DB.prepare('SELECT * FROM settings').all()).results;
    return json({ ...Object.fromEntries(rows.filter(x => !['google_client_secret', 'admin_gate'].includes(x.key)).map(x => [x.key, x.value])), google_secret_set: rows.some(x => x.key === 'google_client_secret' && x.value), slip_key_set: !!env.SLIP_API_KEY, slip2go_key_set: !!env.SLIP2GO_KEY, easyslip_key_set: !!env.EASYSLIP_KEY, checkslip_key_set: !!env.CHECKSLIP_KEY,
      env: Object.fromEntries(['RESEND_KEY', 'TAVILY_KEY', 'TURNSTILE_SECRET', 'SECRET_KEY', 'GOOGLE_CLIENT_ID', 'LINE_CHANNEL_ID', 'LINE_ALERT_TOKEN', 'PUBLIC_URL'].map(k => [k, !!env[k]])), r2: !!env.SLIPS });
  }
  if (path === '/api/admin/coupons') {
    if (M === 'GET') return json((await DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()).results);
    const b = await req.json(), code = String(b.code || '').trim().toUpperCase();
    if (M === 'DELETE') { await ctxAudit('delete coupon', { code }); await DB.prepare('DELETE FROM coupons WHERE code=?').bind(code).run(); return json({ ok: true }); }
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return err('โค้ดใช้ A-Z 0-9 - _ ยาว 3-30 ตัว');
    if (!['percent', 'fixed', 'credit'].includes(b.kind) || !(+b.value > 0) || (b.kind === 'percent' && +b.value > 100)) return err('ชนิดหรือมูลค่าคูปองไม่ถูกต้อง');
    await ctxAudit('save coupon', { code, kind: b.kind, value: b.value });
    await DB.prepare('INSERT INTO coupons (code,kind,value,max_uses,expires,note,active,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, value=excluded.value, max_uses=excluded.max_uses, expires=excluded.expires, note=excluded.note, active=excluded.active')
      .bind(code, b.kind, +b.value, +b.max_uses || 0, b.expires ? +b.expires : null, String(b.note || '').slice(0, 200), b.active === 0 ? 0 : 1, Date.now()).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/apistats') { // API นักพัฒนา: ยอดขายเทียบต้นทุนรายผู้ใช้, ต่อโมเดล, key ที่ใช้มากสุด, error ล่าสุด (api_log เก็บ 30 วัน)
    const nd = [7, 30].includes(+url.searchParams.get('days')) ? +url.searchParams.get('days') : 7, from = rangeFrom(nd);
    // คำขอที่ถูกปฏิเสธก่อนเลือกโมเดล (Wallet ไม่พอ, ติดลิมิต, endpoint ผิด) ไม่มีโมเดลและไม่ถูกหักเงิน: ไม่แสดงในตารางต่อโมเดล แต่ยังเห็นในข้อผิดพลาดล่าสุด
    const [models, keys, errors, days, sales] = await Promise.all([
      DB.prepare('SELECT model, COUNT(*) n, SUM(status>=400) errors, ROUND(AVG(ms)) ms, COALESCE(SUM(tin),0) tin, COALESCE(SUM(tout),0) tout, ROUND(COALESCE(SUM(charge),0),2) charge FROM api_log WHERE created_at>=? AND model IS NOT NULL GROUP BY model ORDER BY n DESC LIMIT 30').bind(from).all(),
      DB.prepare('SELECT k.name, k.prefix, u.email, COUNT(*) n, SUM(l.status>=400) errors, ROUND(COALESCE(SUM(l.charge),0),2) charge FROM api_log l JOIN api_keys k ON k.id=l.key_id JOIN users u ON u.id=l.user_id WHERE l.created_at>=? GROUP BY l.key_id ORDER BY charge DESC, n DESC LIMIT 20').bind(from).all(),
      DB.prepare('SELECT l.path, l.model, l.status, l.err, l.created_at, u.email FROM api_log l JOIN users u ON u.id=l.user_id WHERE l.status>=400 AND l.created_at>=? ORDER BY l.id DESC LIMIT 30').bind(from).all(),
      DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') d, COUNT(*) n, SUM(status>=400) errors, SUM(status<400) ok, ROUND(COALESCE(SUM(charge),0),2) charge FROM api_log WHERE created_at>=? GROUP BY d ORDER BY d").bind(from).all(),
      // ยอดขาย API ต่อผู้ใช้จากตาราง usage (src='api'): ส่วนที่หัก Wallet = ขายได้จริง · ส่วนที่ใช้ในลิมิตแพลน = รายได้อยู่ในค่าแพลนแล้ว
      DB.prepare(`SELECT g.user_id id, u.email, pl.name plan, COUNT(*) n,
        COALESCE(SUM(CASE WHEN g.units=0 THEN g.charge END),0) sold, COALESCE(SUM(CASE WHEN g.units=0 THEN g.cost END),0) cost_wallet,
        COALESCE(SUM(CASE WHEN g.units>0 THEN g.cost END),0) cost_plan, SUM(g.units>0) n_plan,
        COALESCE((SELECT SUM(amount) FROM payments p WHERE p.user_id=g.user_id AND p.kind='plan' AND p.status='approved' AND COALESCE(p.approved_at,p.created_at)>=?1),0) plan_paid
        FROM usage g JOIN users u ON u.id=g.user_id LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?2
        WHERE g.src='api' AND g.created_at>=?1 GROUP BY g.user_id ORDER BY sold+cost_plan DESC LIMIT 100`).bind(from, Date.now()).all(),
    ]);
    const S = sales.results.map(x => ({ ...x, profit: x.sold - x.cost_wallet }));
    const total = S.reduce((a, x) => ({ n: a.n + x.n, sold: a.sold + x.sold, cost_wallet: a.cost_wallet + x.cost_wallet, cost_plan: a.cost_plan + x.cost_plan }), { n: 0, sold: 0, cost_wallet: 0, cost_plan: 0 });
    return json({ nd, models: models.results, keys: keys.results, errors: errors.results, days: days.results, sales: S, total });
  }
  if (path === '/api/admin/quality') { // คะแนน 👍/👎 ต่อโมเดล (30 วัน) + รายงานคำตอบ
    await ensureFb(env);
    const from = Date.now() - 30 * DAY;
    const votes = (await DB.prepare("SELECT f.model_id, md.name, SUM(f.vote>0) up, SUM(f.vote<0) down FROM feedback f LEFT JOIN models md ON md.id=f.model_id WHERE f.created_at>=? GROUP BY f.model_id ORDER BY (up+down) DESC").bind(from).all()).results;
    const reports = (await DB.prepare("SELECT r.id,r.message_id,r.reason,r.snippet,r.status,r.created_at,u.email,md.name model FROM reports r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN models md ON md.id=r.model_id ORDER BY (r.status='open') DESC, r.id DESC LIMIT 100").all()).results;
    // อัตรา cache hit ต่อโมเดล 7 วัน: token ที่อ่านจาก cache ÷ token ขาเข้าทั้งหมด (ดูว่า prefix คงที่ได้ผลไหม)
    const cache = (await DB.prepare('SELECT g.model_id, md.name, COUNT(*) n, SUM(g.tokens_in) fresh, SUM(g.tokens_cache) cached FROM usage g LEFT JOIN models md ON md.id=g.model_id WHERE g.created_at>=? GROUP BY g.model_id ORDER BY (fresh+cached) DESC').bind(Date.now() - 7 * DAY).all()).results;
    // AI ตรวจงานตัวเองในโหมด Code (7 วัน): กี่ครั้งที่เจอปัญหา และหลังให้แก้แล้วผ่านกี่ครั้ง ต่อโมเดล
    const selfcheck = (await DB.prepare("SELECT e.model_id, md.name, SUM(e.kind='selfcheck' AND json_extract(e.detail,'$.n')=1) found, SUM(e.kind='selfcheck_ok') fixed, SUM(e.kind='selfcheck') rounds FROM events e LEFT JOIN models md ON md.id=e.model_id WHERE e.kind IN ('selfcheck','selfcheck_ok') AND e.created_at>=? GROUP BY e.model_id ORDER BY found DESC").bind(Date.now() - 7 * DAY).all().catch(() => ({ results: [] }))).results;
    // รัน Python บนคลาวด์ (14 วัน): ครั้งต่อวัน · ผู้ใช้ · เวลาเครื่องทำงาน (ดูต้นทุนจริงที่ Cloudflare → Containers)
    const py = (await DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') d, COUNT(*) n, COUNT(DISTINCT json_extract(detail,'$.u')) users, SUM(json_extract(detail,'$.ok')=0) fail, SUM(json_extract(detail,'$.down')=1) down, SUM(json_extract(detail,'$.pip')=1) pip, ROUND(SUM(COALESCE(json_extract(detail,'$.ms'),0))/1000.0) sec FROM events WHERE kind='pyrun' AND created_at>=? GROUP BY d ORDER BY d DESC").bind(Date.now() - 14 * DAY).all()).results;
    // Live Eval (โมเดลจริงทำงานจริง · workflow รายสัปดาห์บันทึกลงตารางนี้): 8 รอบล่าสุด
    await DB.prepare('CREATE TABLE IF NOT EXISTS eval_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, data TEXT NOT NULL)').run();
    const evals = (await DB.prepare('SELECT at, data FROM eval_runs ORDER BY at DESC LIMIT 8').all()).results.map(r => { try { return { at: r.at, by: JSON.parse(r.data).by || [] }; } catch { return null; } }).filter(Boolean);
    return json({ votes, reports, cache, selfcheck, py, evals });
  }
  if ((r = path.match(/^\/api\/admin\/reports\/(\d+)$/)) && M === 'PUT') { await ensureFb(env); await DB.prepare('UPDATE reports SET status=? WHERE id=?').bind((await req.json()).status === 'open' ? 'open' : 'done', r[1]).run(); return json({ ok: true }); }
  if (path === '/api/admin/tickets') return json((await DB.prepare("SELECT t.*,u.email,(SELECT COUNT(*) FROM ticket_msgs WHERE ticket_id=t.id) n FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.status='open' DESC, t.updated_at DESC LIMIT 200").all()).results);
  if ((r = path.match(/^\/api\/admin\/tickets\/(\d+)$/))) {
    const t = await DB.prepare('SELECT t.*,u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?').bind(r[1]).first();
    if (!t) return err('ไม่พบเรื่อง', 404);
    if (M === 'POST') {
      const b = await req.json(), body = String(b.body || '').trim().slice(0, 5000);
      if (body) { await DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,1,?,?)').bind(t.id, body, Date.now()).run(); await mail(env, t.email, 'Kyber: แอดมินตอบเรื่อง ' + t.subject, mailBox('แอดมินตอบแล้ว', esc(body).slice(0, 800).replace(/\n/g, '<br>'))); }
      await DB.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?').bind(b.status === 'closed' ? 'closed' : body ? 'answered' : t.status, Date.now(), t.id).run();
      return json({ ok: true });
    }
    return json({ ...t, msgs: (await DB.prepare('SELECT * FROM ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  }
  // ต้นทุนสด: ต้นทุนต่อ key ผู้ให้บริการ (เทียบหน้า dashboard ของเจ้าของ key ได้) · ฟีดทุกคำขอ · ลูกค้าที่ใช้หนัก/ขาดทุน
  if (path === '/api/admin/live') {
    const now = Date.now(), H = 3600e3;
    const kf = await getSetting(env, 'key_funds').then(v => { try { return JSON.parse(v || '{}'); } catch { return {}; } });
    const [keys, hourly, feed, errs, hot, losers] = await Promise.all([
      DB.prepare(`SELECT m.key_name k, COALESCE(SUM(CASE WHEN g.created_at>=?1 THEN g.cost END),0) h1, COALESCE(SUM(CASE WHEN g.created_at>=?2 THEN g.cost END),0) d1,
        COALESCE(SUM(CASE WHEN g.created_at>=?3 THEN g.cost END),0) d3, COALESCE(SUM(g.cost),0) d7, COUNT(*) n, SUM(g.flag IS NOT NULL) flagged
        FROM usage g JOIN models m ON m.id=g.model_id WHERE g.created_at>=?4 GROUP BY m.key_name ORDER BY d1 DESC`).bind(now - H, now - 24 * H, now - 72 * H, now - 7 * DAY).all(),
      DB.prepare(`SELECT m.key_name k, CAST((?1-g.created_at)/${H} AS INTEGER) ago, SUM(g.cost) c FROM usage g JOIN models m ON m.id=g.model_id WHERE g.created_at>=?2 GROUP BY 1,2`).bind(now, now - 24 * H).all(),
      DB.prepare(`SELECT g.id, g.created_at t, g.user_id uid, u.email, m.name model, m.key_name k, g.src, g.tokens_in tin, g.tokens_out tout, g.tokens_cache tc, g.cost, g.charge, g.units, g.ms, g.flag
        FROM usage g LEFT JOIN users u ON u.id=g.user_id LEFT JOIN models m ON m.id=g.model_id ORDER BY g.id DESC LIMIT 150`).all(),
      DB.prepare(`SELECT l.created_at t, l.user_id uid, u.email, l.model, l.path, l.status, l.err FROM api_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.status>=400 AND l.created_at>=? ORDER BY l.id DESC LIMIT 60`).bind(now - 24 * H).all().catch(() => ({ results: [] })),
      DB.prepare(`SELECT g.user_id uid, u.email, u.role, pl.name plan, u.balance, COUNT(*) n, SUM(CASE WHEN g.created_at>=?1 THEN g.cost ELSE 0 END) h1, SUM(g.cost) d1, SUM(COALESCE(g.charge,0)) charge, SUM(g.units) units, SUM(g.flag IS NOT NULL) flagged
        FROM usage g JOIN users u ON u.id=g.user_id LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?3 WHERE g.created_at>=?2 GROUP BY g.user_id ORDER BY d1 DESC LIMIT 20`).bind(now - H, now - 24 * H, now).all(),
      DB.prepare(`SELECT u.id uid, u.email, u.role, pl.name plan, COALESCE((SELECT SUM(cost) FROM usage WHERE user_id=u.id AND created_at>=?1),0) cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE user_id=u.id AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) paid
        FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?2 WHERE EXISTS (SELECT 1 FROM usage WHERE user_id=u.id AND created_at>=?1)`).bind(now - 30 * DAY, now).all(),
    ]);
    const series = {}; for (const r of hourly.results) (series[r.k] ||= Array(24).fill(0))[Math.min(23, r.ago)] += r.c;
    const keyRows = keys.results.map(r => ({ ...r, series: (series[r.k] || Array(24).fill(0)).reverse(), fund: kf[r.k] || null, left: null, days: null })); // series: ชั่วโมงเก่าสุด → ล่าสุด
    // บัญชีผู้ให้บริการ (เช่น maxplus ที่ใช้ร่วมหลาย key): แอดมินกรอกเครดิตที่เห็นล่าสุด แล้วระบบหักต้นทุนของทุก key ในบัญชีที่เกิดหลังจากนั้น
    const accounts = [];
    for (const [name, f] of Object.entries(kf)) {
      const ks = f.keys?.length ? f.keys : [name], q = ks.map(() => '?').join(',');
      const r = await DB.prepare(`SELECT COALESCE(SUM(CASE WHEN g.created_at>? THEN g.cost END),0) after, COALESCE(SUM(CASE WHEN g.created_at>? THEN g.cost END),0) d3 FROM usage g JOIN models m ON m.id=g.model_id WHERE m.key_name IN (${q})`).bind(f.at || 0, now - 72 * H, ...ks).first();
      const rate = f.rate || 1, left = f.credits - r.after * rate;
      accounts.push({ name, keys: ks, credits: f.credits, rate, at: f.at, low: f.low, left, days: r.d3 > 0 ? left / rate / (r.d3 / 3) : null, perDay: r.d3 / 3 });
    }
    for (const r of keyRows) r.acct = accounts.find(a => a.keys.includes(r.k))?.name || null;
    const lose = losers.results.map(x => ({ ...x, profit: x.paid - x.cost })).filter(x => x.role !== 'admin').sort((a, b) => a.profit - b.profit).slice(0, 15);
    const agentRuns = await DB.prepare('SELECT model, COUNT(*) n, SUM(ok) ok, AVG(rounds) rounds, AVG(tools) tools, AVG(ms) ms, AVG(charge) charge, AVG(pct) pct FROM agent_runs WHERE created_at>? GROUP BY model ORDER BY n DESC').bind(now - 7 * DAY).all().then(r => r.results).catch(() => []);
    const deskErrs = await DB.prepare("SELECT detail, created_at t FROM events WHERE kind='client' AND detail LIKE 'desktop%' AND created_at>? ORDER BY id DESC LIMIT 30").bind(now - 7 * DAY).all().then(r => r.results).catch(() => []);
    const agentQ = await agentQuality(env, 14).catch(() => []); // คุณภาพงาน Agent ต่อโมเดล 14 วัน (สำเร็จ, วนซ้ำ, error เครื่องมือ, cache)
    return json({ agentRuns, agentQ, deskErrs, keys: keyRows, accounts, feed: feed.results, errs: errs.results, hot: hot.results, losers: lose, settings: await getSettings(env, ['alert_hour_cost', 'alert_user_hour', 'cost_alert_daily']) });
  }
  // ทดสอบโมเดลกับงาน Agent: 4 งานที่ต้องใช้เครื่องมือ (ค้น/อ่าน/แก้ไฟล์) ในโฟลเดอร์จำลอง ตรวจผลจากไฟล์จริง ไม่ใช่จากคำพูดโมเดล
  if (path === '/api/admin/agent-bench' && M === 'POST') {
    const b = await req.json(), m = await DB.prepare('SELECT * FROM models WHERE id=?').bind(+b.model_id).first(); if (!m) return err('ไม่พบโมเดล', 404);
    return json(await agentBench(env, me, m));
  }
  // บันทึกยอดเครดิตคงเหลือที่หน้าเจ้าของ key (เช่น maxplus) + อัตราเครดิตต่อบาท
  if (path === '/api/admin/key-funds' && M === 'PUT') {
    const b = await req.json(), k = String(b.key || '').trim().slice(0, 60); if (!/^[\w.-]+$/.test(k)) return err('ชื่อบัญชีไม่ถูกต้อง (a-z 0-9 _ . -)');
    const kf = await getSetting(env, 'key_funds').then(v => { try { return JSON.parse(v || '{}'); } catch { return {}; } });
    const keys = (Array.isArray(b.keys) ? b.keys : String(b.keys || '').split(',')).map(x => String(x).trim()).filter(x => /^[\w.-]{1,60}$/.test(x)).slice(0, 20);
    if (b.remove) delete kf[k]; else kf[k] = { credits: +b.credits || 0, rate: +b.rate > 0 ? +b.rate : 1, at: Date.now(), low: +b.low > 0 ? +b.low : null, keys: keys.length ? keys : [k] };
    await DB.prepare("INSERT OR REPLACE INTO settings VALUES ('key_funds',?)").bind(JSON.stringify(kf)).run();
    await ctxAudit('key funds', { k, ...kf[k] }); return json({ ok: true });
  }
  if (path === '/api/admin/profit') { // กำไรแยกตามแพลนและผู้ใช้
    // shortcut: ต้นทุนนับตามแพลน "ปัจจุบัน" ของผู้ใช้ ถ้าผู้ใช้เปลี่ยนแพลนกลางช่วง ตัวเลขรายแพลนจะคลาดเล็กน้อย
    const now = Date.now(), days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30)), from = rangeFrom(days, now);
    const free = (await DB.prepare('SELECT id FROM plans WHERE price=0 ORDER BY sort LIMIT 1').first())?.id ?? 0;
    const [plans, users, w] = await Promise.all([
      DB.prepare(`SELECT p.id,p.name,p.price,
        (SELECT COUNT(*) FROM users u WHERE u.banned=0 AND COALESCE(u.no_report,0)=0 AND u.role='user' AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) subs,
        (SELECT COALESCE(SUM(amount),0) FROM payments x WHERE x.plan_id=p.id AND x.${NOREP} AND x.kind='plan' AND x.status='approved' AND COALESCE(x.approved_at,x.created_at)>=?2) rev,
        (SELECT COALESCE(SUM(g.cost),0) FROM usage g JOIN users u ON u.id=g.user_id WHERE g.created_at>=?2 AND g.units>0 AND COALESCE(u.no_report,0)=0 AND u.role='user' AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) cost
        FROM plans p ORDER BY p.sort`).bind(now, from, free).all(),
      DB.prepare(`SELECT u.id,u.email,pl.name plan,
        COALESCE((SELECT SUM(cost) FROM usage WHERE user_id=u.id AND created_at>=?1),0) cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE user_id=u.id AND kind='plan' AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) rev_plan,
        COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE user_id=u.id AND kind IN ('api','overflow','agentpack','wallet') AND created_at>=?1),0) rev_wallet
        FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?2
        WHERE COALESCE(u.no_report,0)=0 AND u.role='user' AND (EXISTS (SELECT 1 FROM usage WHERE user_id=u.id AND created_at>=?1) OR EXISTS (SELECT 1 FROM payments WHERE user_id=u.id AND status='approved' AND created_at>=?1))`).bind(from, now).all(),
      DB.prepare(`SELECT COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE kind IN ('api','overflow','agentpack','wallet') AND ${NOREP} AND created_at>=?1),0) charges,
        COALESCE((SELECT SUM(cost) FROM usage WHERE units=0 AND model_id>0 AND ${NOREP} AND created_at>=?1),0) api_cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE kind='topup' AND status='approved' AND ${NOREP} AND COALESCE(approved_at,created_at)>=?1),0) topups,
        COALESCE((SELECT SUM(balance) FROM users WHERE balance>0 AND COALESCE(no_report,0)=0 AND role='user'),0) liability`).bind(from).first(),
    ]);
    const us = users.results.map(x => ({ ...x, rev: x.rev_plan + x.rev_wallet, profit: x.rev_plan + x.rev_wallet - x.cost })).sort((a, b) => a.profit - b.profit);
    const revDays = await revenueByDay(DB, from), R = sumRev(revDays), rev = R.rev, earned = R.earned;
    const dayOf = c => `CAST((${c}+${BKK})/${DAY} AS INTEGER)`;
    const [pm, pd] = await Promise.all([ // ต้นทุนจริงต่อโมเดล · ต้นทุนรายวัน (เวลาไทย)
      DB.prepare(`SELECT g.model_id id, md.name, COUNT(*) n, COUNT(DISTINCT g.user_id) users, AVG(CASE WHEN g.ttft>0 THEN g.ttft END) ttft, AVG(CASE WHEN g.ms>0 THEN g.ms END) ms, SUM(CASE WHEN g.ms>g.ttft AND g.ttft>0 THEN g.tokens_out END)*1000.0/NULLIF(SUM(CASE WHEN g.ms>g.ttft AND g.ttft>0 THEN g.ms-g.ttft END),0) tps, COALESCE(SUM(g.cost),0) cost, COALESCE(SUM(g.tokens_in),0) tin, COALESCE(SUM(g.tokens_out),0) tout, COALESCE(SUM(g.tokens_cache),0) tcache FROM usage g LEFT JOIN models md ON md.id=g.model_id WHERE g.created_at>=? AND g.${NOREP} AND g.model_id>0 GROUP BY g.model_id ORDER BY cost DESC`).bind(from).all(),
      DB.prepare(`SELECT ${dayOf('created_at')} d, COALESCE(SUM(cost),0) cost FROM usage WHERE created_at>=? AND ${NOREP} GROUP BY d`).bind(from).all(),
    ]);
    const cost = pd.results.reduce((a, r) => a + r.cost, 0); // ต้นทุนรวมเท่ากับหน้าภาพรวม (ทุกแถวใน usage ช่วงเดียวกัน)
    const dayMap = new Map([...revDays.values()].map(o => [o.d, { d: o.d, cost: 0, rev: o.rev, earned: o.earned }])); pd.results.forEach(r => { const o = dayMap.get(r.d) || { d: r.d, cost: 0, rev: 0, earned: 0 }; o.cost += r.cost; dayMap.set(r.d, o); });
    const daily = [...dayMap.values()].sort((a, b) => b.d - a.d).slice(0, 60).map(x => ({ ...x, date: new Date(x.d * DAY).toISOString().slice(0, 10), profit: x.earned - x.cost }));
    return json({ days, total: { rev, earned, cost, profit: earned - cost, plan: R.plan, wallet: R.wallet, cash: R.cash }, plans: plans.results, wallet: w, users: us.slice(0, 100), losers: us.filter(x => x.profit < 0).length, models: pm.results, daily, forecast: await profitForecast(env, now) });
  }
  if (path === '/api/admin/export') { // CSV สำหรับทำบัญชี (เปิดใน Excel ภาษาไทยได้)
    const type = url.searchParams.get('type'), days = Math.min(3650, Math.max(1, +url.searchParams.get('days') || 31)), from = Date.now() - days * DAY;
    const q = {
      payments: ["SELECT p.id,p.created_at,p.approved_at,u.email,CASE p.kind WHEN 'topup' THEN 'เติม Wallet' ELSE 'แพลน' END,pl.name plan,CASE WHEN p.kind='topup' THEN '' WHEN p.period='year' THEN 'รายปี' ELSE 'รายเดือน' END,p.amount,p.discount,p.coupon,CASE p.status WHEN 'approved' THEN 'สำเร็จ' WHEN 'rejected' THEN 'ไม่อนุมัติ' ELSE 'รอตรวจ' END,CASE WHEN p.slip_key='wallet' THEN 'Wallet' WHEN p.slip_key='coupon' THEN 'คูปอง' ELSE 'โอน PromptPay' END,p.slip_ref FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.created_at>=? ORDER BY p.id",
        ['เลขที่', 'วันที่ส่ง', 'วันที่อนุมัติ', 'อีเมล', 'ชนิด', 'แพลน', 'รอบ', 'ยอด (บาท)', 'ส่วนลด', 'คูปอง', 'สถานะ', 'ช่องทาง', 'เลขอ้างอิงธนาคาร']],
      wallet: ['SELECT w.id,w.created_at,u.email,w.kind,w.amount,w.balance_after,w.ref FROM wallet_tx w JOIN users u ON u.id=w.user_id WHERE w.created_at>=? ORDER BY w.id',
        ['ลำดับ', 'วันที่', 'อีเมล', 'รายการ', 'จำนวน (บาท)', 'คงเหลือ', 'อ้างอิง']],
      usage: ['SELECT g.id,g.created_at,u.email,m.name,g.tokens_in,g.tokens_out,g.tokens_cache,g.units,g.cost FROM usage g JOIN users u ON u.id=g.user_id LEFT JOIN models m ON m.id=g.model_id WHERE g.created_at>=? ORDER BY g.id LIMIT 100000',
        ['ลำดับ', 'วันที่', 'อีเมล', 'โมเดล', 'token เข้า', 'token ออก', 'token cache', 'units', 'ต้นทุน (บาท)']],
    }[type];
    if (!q) return err('type ต้องเป็น payments, wallet หรือ usage');
    await ctxAudit('export ' + type, { days });
    const rows = (await DB.prepare(q[0]).bind(from).all()).results;
    const cell = v => { if (v == null) return ''; if (typeof v === 'number' && v > 1e12) v = new Date(v + BKK).toISOString().slice(0, 16).replace('T', ' '); v = String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; // กันสูตร Excel ที่แฝงมา
    const csv = '﻿' + [q[1], ...rows.map(r => Object.values(r))].map(r => r.map(cell).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="kyber-${type}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  if (path === '/api/admin/slip-test' && M === 'POST') { // ตรวจการเชื่อมต่อ Slip2Go: ดูข้อมูลบัญชี/โควตาที่เหลือ
    if ((await getSetting(env, 'slip_provider')) === 'easyslip') { // EasySlip: อ่านข้อมูลแอป/โควตาที่เหลือ
      if (!env.EASYSLIP_KEY) return err('ตั้ง Secret EASYSLIP_KEY ก่อน');
      const u = ((await getSetting(env, 'easyslip_url')) || 'https://developer.easyslip.com/api/v1/verify').replace(/\/verify.*$/, '').replace(/\/$/, '') + '/info';
      const r = await fetch(u, { headers: { authorization: 'Bearer ' + env.EASYSLIP_KEY } }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
      const text = await r.text().catch(() => ''); let data = null; try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 200) }; }
      return json({ ok: r.ok, status: r.status, url: u, data }); // แสดงสถานะและข้อความจริงให้แอดมินเห็นว่าพังเพราะอะไร
    }
    const base = await getSetting(env, 'slip2go_url');
    if (!base || !env.SLIP2GO_KEY) return err('ใส่ API URL และตั้ง Secret SLIP2GO_KEY ก่อน');
    const r = await fetch(base.replace(/\/$/, '') + '/api/account/info', { headers: { authorization: 'Bearer ' + env.SLIP2GO_KEY } }).catch(e => ({ ok: false, json: async () => ({ message: e.message }) }));
    return json({ ok: r.ok, data: await r.json().catch(() => null) });
  }
  if (path === '/api/admin/notify-test' && M === 'POST') { await notify(env, '✅ ทดสอบแจ้งเตือนจาก Kyber'); return json({ ok: true }); }
  if ((path === '/api/admin/reset-limits' || path === '/api/admin/reset-credits') && M === 'POST') { // รีเซ็ตทันที หรือ แจกปุ่มรีเซ็ต: ทุกคน / ทุกคนในแพลน / คนเดียว
    const b = await req.json(), now = Date.now(), credits = path.endsWith('credits');
    let where = '1=1', args = [];
    if (b.target === 'email') { where = 'email=?'; args = [String(b.email || '').trim().toLowerCase()]; }
    else if (b.target === 'plan') {
      const p = await DB.prepare('SELECT id,price FROM plans WHERE id=?').bind(b.plan_id).first(); if (!p) return err('ไม่พบแพลน');
      // แพลนฟรีรวมคนที่ไม่มีแพลนหรือแพลนหมดอายุ (ระบบนับเป็นแพลนฟรี)
      [where, args] = p.price > 0 ? ['plan_id=? AND plan_expires>?', [p.id, now]] : ['(plan_id IS NULL OR plan_expires IS NULL OR plan_expires<=? OR plan_id=?)', [now, p.id]];
    } else if (b.target !== 'all') return err('เลือกกลุ่มผู้ใช้');
    let count;
    if (credits) {
      const n = Math.min(50, Math.max(1, Math.round(+b.n || 1)));
      await creditsInit(env);
      const sc = b.scope?.vendor ? { vendor: String(b.scope.vendor).replace(/[%_]/g, '').trim().slice(0, 40) } : b.scope?.model_id ? { model_id: +b.scope.model_id } : null;
      if (sc?.vendor === '') return err('เลือกค่ายที่จะแจก');
      let label = 'ทั้งหมด';
      if (sc?.model_id) { const m = await DB.prepare('SELECT name FROM models WHERE id=?').bind(sc.model_id).first(); if (!m) return err('ไม่พบโมเดล', 404); label = 'โมเดล ' + m.name; } else if (sc?.vendor) label = 'ค่าย ' + sc.vendor;
      const days = Math.round(+b.days || 0), exp = days > 0 ? now + Math.min(days, 3650) * DAY : null; // ว่าง/0 = ไม่หมดอายุ
      // สมาชิกทีมที่ใช้ลิมิตรวมใช้สิทธิ์เองไม่ได้ จึงไม่แจกให้ · แจกทั้งก้อนใน batch เดียว (n รอบด้วย CTE) พร้อมบันทึกประวัติ
      const pool = ' AND id NOT IN (SELECT tm.user_id FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.shared_pool=1 AND t.expires>?)', arg = [...args, now];
      const res = await DB.batch([
        DB.prepare(`WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<?5) INSERT INTO reset_grants (user_id,vendor,model_id,created_at,expires_at) SELECT id,?1,?2,?3,?4 FROM users, s WHERE banned=0 AND ${where}${pool}`).bind(sc?.vendor ?? null, sc?.model_id ?? null, now, exp, n, ...arg),
        DB.prepare(`INSERT INTO reset_log (user_id,kind,scope,n,expires_at,by_email,created_at) SELECT id,'grant',?1,?2,?3,?4,?5 FROM users WHERE banned=0 AND ${where}${pool}`).bind(label, n, exp, me.email, now, ...arg),
      ]);
      count = Math.round(res[0].meta.changes / n);
    } else {
      await creditsInit(env);
      await DB.prepare(`INSERT INTO reset_log (user_id,kind,scope,n,expires_at,by_email,created_at) SELECT id,'direct','ทั้งหมด',1,NULL,?1,?2 FROM users WHERE banned=0 AND ${where}`).bind(me.email, now, ...args).run(); // บันทึกก่อนรีเซ็ต
      await DB.prepare(`UPDATE teams SET sess_start=NULL, week_start=NULL WHERE shared_pool=1 AND id IN (SELECT team_id FROM team_members WHERE user_id IN (SELECT id FROM users WHERE banned=0 AND ${where}))`).bind(...args).run();
      count = (await DB.prepare(`UPDATE users SET usage_reset_at=?, sess_start=NULL, week_start=NULL WHERE banned=0 AND ${where}`).bind(now, ...args).run()).meta.changes;
    }
    if (b.target === 'email' && !count) return err('ไม่พบผู้ใช้อีเมลนี้');
    await ctxAudit(credits ? 'grant reset credits' : 'reset limits', { target: b.target, plan_id: b.plan_id, email: b.email, n: b.n, count });
    return json({ ok: true, count });
  }
  if (path === '/api/admin/reset-log' && M === 'GET') { // ประวัติแจก/ใช้สิทธิ์รีเซ็ต: ทั้งระบบ หรือของผู้ใช้คนเดียว (?user_id=)
    await creditsInit(env);
    const uid = +url.searchParams.get('user_id') || 0;
    return json((await DB.prepare(`SELECT l.id,l.kind,l.scope,l.n,l.expires_at,l.by_email,l.created_at,u.email FROM reset_log l LEFT JOIN users u ON u.id=l.user_id ${uid ? 'WHERE l.user_id=?1' : 'WHERE ?1=0'} ORDER BY l.id DESC LIMIT 100`).bind(uid).all()).results);
  }
  if (path === '/api/admin/teams') {
    return json((await DB.prepare(`SELECT t.*, u.email owner_email, p.name plan_name,
      (SELECT COUNT(*) FROM team_members WHERE team_id=t.id) members_count
      FROM teams t JOIN users u ON u.id=t.owner_id LEFT JOIN plans p ON p.id=t.plan_id ORDER BY t.id DESC LIMIT 200`).all()).results);
  }
  if ((r = path.match(/^\/api\/admin\/teams\/(\d+)$/))) {
    const tid = +r[1];
    if (M === 'DELETE') {
      await ctxAudit('delete team', { id: tid });
      await DB.batch([DB.prepare('DELETE FROM team_members WHERE team_id=?').bind(tid), DB.prepare('DELETE FROM teams WHERE id=?').bind(tid)]);
      return json({ ok: true });
    }
    if (M === 'PUT') {
      const b = await req.json();
      await ctxAudit('update team', { id: tid, ...b });
      const sets = [], args = [];
      if (typeof b.name === 'string' && b.name.trim()) { sets.push('name=?'); args.push(b.name.trim().slice(0, 60)); }
      if (b.max_seats != null) { sets.push('max_seats=?'); args.push(Math.max(1, +b.max_seats || 5)); }
      if ('shared_pool' in b) { sets.push('shared_pool=?'); args.push(b.shared_pool ? 1 : 0); }
      if (b.days != null && +b.days > 0) { sets.push('expires=?'); args.push(Date.now() + +b.days * DAY); }
      if (sets.length) await DB.prepare(`UPDATE teams SET ${sets.join(',')} WHERE id=?`).bind(...args, tid).run();
      return json({ ok: true });
    }
  }
  if ((r = path.match(/^\/api\/admin\/skills(?:\/(\d+))?$/))) {
    const sid = r[1] ? +r[1] : null;
    if (M === 'GET') return json((await DB.prepare('SELECT * FROM skills WHERE user_id=0 ORDER BY id DESC').all()).results);
    if (M === 'DELETE' && sid) { await ctxAudit('delete skill', { id: sid }); await DB.prepare('DELETE FROM skills WHERE id=? AND user_id=0').bind(sid).run(); return json({ ok: true }); }
    const b = await req.json(), name = String(b.name || '').trim().slice(0, 60), desc = String(b.description || '').trim().slice(0, 200), content = String(b.content || '').trim().slice(0, 6000);
    if (!name || !content) return err('ใส่ชื่อและคำสั่งของ Skill');
    await ctxAudit((M === 'POST' ? 'create' : 'update') + ' skill', { id: sid, name });
    if (M === 'POST') return json(await DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at) VALUES (0,?,?,?,?,?) RETURNING *').bind(name, desc, content, b.enabled === 0 ? 0 : 1, Date.now()).first());
    if (M === 'PUT' && sid) { await DB.prepare('UPDATE skills SET name=?, description=?, content=?, enabled=? WHERE id=? AND user_id=0').bind(name, desc, content, b.enabled === 0 ? 0 : 1, sid).run(); return json({ ok: true }); }
  }
  if (path.startsWith('/api/admin/plugins')) { const pr = await adminPlugins(req, env, path, M); if (pr) { if (M !== 'GET') await ctxAudit(M.toLowerCase() + ' plugin', { path }); return pr; } }
  if (path.startsWith('/api/admin/connectors')) { const cr = await adminConnectors(req, env, url, path, M); if (cr) { if (M !== 'GET') await ctxAudit(M.toLowerCase() + ' connector', { path }); return cr; } }
  if ((r = path.match(/^\/api\/admin\/mcp(?:\/(\d+))?$/))) {
    const mid = r[1] ? +r[1] : null;
    if (M === 'GET') {
      const rows = (await DB.prepare('SELECT id,name,url,token_enc,tools_json,enabled,created_at FROM mcp_servers WHERE user_id=0 ORDER BY id DESC').all()).results;
      return json(rows.map(x => { let ts = []; try { ts = JSON.parse(x.tools_json || '[]'); } catch {} return { id: x.id, name: x.name, url: x.url, has_token: !!x.token_enc, tools: ts.map(t => t.name), enabled: x.enabled }; }));
    }
    if (M === 'DELETE' && mid) { await ctxAudit('delete mcp', { id: mid }); await DB.prepare('DELETE FROM mcp_servers WHERE id=? AND user_id=0').bind(mid).run(); return json({ ok: true }); }
    const b = await req.json(), name = String(b.name || '').trim().slice(0, 60), url_ = isSafeMcpUrl(b.url), token = String(b.token || '').trim();
    if (!name || !url_) return err('ใส่ชื่อและ URL (https:// สาธารณะ)');
    const tools = await mcpSync(url_, token || null);
    const tokEnc = token ? await seal(env, token) : null;
    await ctxAudit((M === 'POST' ? 'create' : 'update') + ' mcp', { id: mid, name });
    if (M === 'POST') return json(await DB.prepare('INSERT INTO mcp_servers (user_id,name,url,token_enc,tools_json,enabled,created_at) VALUES (0,?,?,?,?,?,?) RETURNING id,name,url,enabled').bind(name, url_, tokEnc, JSON.stringify(tools), b.enabled === 0 ? 0 : 1, Date.now()).first());
    if (M === 'PUT' && mid) {
      if (tokEnc) await DB.prepare('UPDATE mcp_servers SET name=?, url=?, token_enc=?, tools_json=?, enabled=? WHERE id=? AND user_id=0').bind(name, url_, tokEnc, JSON.stringify(tools), b.enabled === 0 ? 0 : 1, mid).run();
      else await DB.prepare('UPDATE mcp_servers SET name=?, url=?, tools_json=?, enabled=? WHERE id=? AND user_id=0').bind(name, url_, JSON.stringify(tools), b.enabled === 0 ? 0 : 1, mid).run();
      return json({ ok: true });
    }
  }
  if (path === '/api/admin/agents') { // ต้นทุน Agent / ทีม Agent 30 วัน: ต่องาน (รวมลูกทีม) และต่อผู้ใช้
    await ensureAgentTable(env); const from = Date.now() - 30 * DAY;
    const jobs = (await DB.prepare(`SELECT j.id,j.prompt,j.status,j.role,j.rounds,j.created_at,j.finished_at,u.email, COALESCE(j.cost,0)+COALESCE((SELECT SUM(c.cost) FROM agent_jobs c WHERE c.parent_id=j.id),0) cost, (SELECT COUNT(*) FROM agent_jobs c WHERE c.parent_id=j.id AND c.role='worker') workers
      FROM agent_jobs j JOIN users u ON u.id=j.user_id WHERE j.parent_id IS NULL AND j.created_at>=? ORDER BY j.id DESC LIMIT 200`).bind(from).all()).results;
    const users = Object.values(jobs.reduce((a, j) => { const x = a[j.email] ||= { email: j.email, jobs: 0, teams: 0, cost: 0 }; x.jobs++; if (j.role === 'lead') x.teams++; x.cost += j.cost; return a; }, {})).sort((a, b) => b.cost - a.cost).slice(0, 20);
    return json({ jobs, users, total: jobs.reduce((a, j) => a + j.cost, 0) });
  }
  if (path === '/api/admin/bench' && M === 'POST') { // ชุดทดสอบโมเดล: ตอบโจทย์ที่มีคำตอบตายตัว วัดถูก/ผิด เวลา และต้นทุนจริง (เสียค่า API จริง ต้นทุนของเรา)
    const m = await DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(+(await req.json()).model_id).first(); if (!m) return err('ไม่พบโมเดล', 404);
    if (await limited(env, 'bench:' + me.id, 60, 3600e3)) return err('ทดสอบบ่อยเกินไป รอสักครู่', 429);
    await ctxAudit('bench model', { model: m.id });
    const res = await Promise.all(BENCH.map(async ([cat, q, ok]) => {
      const t0 = Date.now(); let out = '', usage = null, er = null;
      try { for await (const e of callModel(env, m, [{ role: 'user', content: q }], { effort: null, maxTokens: 900, signal: AbortSignal.timeout(90e3) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; } } catch (e) { er = e.message; }
      if (usage) await logUsage(env, me.id, m, usage, { units: false, src: 'system' });
      const cost = usage ? (usage.fresh * m.cost_in + usage.read * m.cost_cache + usage.write * m.cost_cache_write + usage.out * m.cost_out) / 1e6 : 0;
      return { cat, q, pass: !er && ok.test(out), ms: Date.now() - t0, cost, answer: (er ? 'ERROR: ' + er : out).slice(0, 600) };
    }));
    return json({ model: m.name, score: res.filter(x => x.pass).length, total: res.length, ms: Math.round(res.reduce((s, x) => s + x.ms, 0) / res.length), cost: res.reduce((s, x) => s + x.cost, 0), items: res });
  }
  if (path === '/api/admin/agent-test' && M === 'POST') { // ทดสอบทีม Agent / Deep research กับโมเดลจริงในบัญชีแอดมิน (เสียต้นทุนจริงเล็กน้อย ใช้โมเดลลูกทีมทั้งหมด)
    await ensureAgentTable(env); const b = await req.json().catch(() => ({})), research = b.kind === 'research', plan = await planOf(env, me);
    if (!(plan?.price > 0)) return err('บัญชีแอดมินต้องมีแพลนเสียเงินก่อน (ให้แพลนตัวเองได้ที่แท็บผู้ใช้)');
    const m = await workerModel(env, plan); if (!m) return err('ไม่มีโมเดลในแพลนของแอดมิน');
    if (research && !env.TAVILY_KEY) return err('ยังไม่ได้ตั้งคีย์ค้นเว็บ (TAVILY_KEY)');
    if (await DB.prepare("SELECT 1 FROM agent_jobs WHERE user_id=? AND status IN ('queued','running','stopping','waiting','team','reviewing','plan')").bind(me.id).first()) return err('มีงาน Agent ของแอดมินค้างอยู่ รอให้เสร็จก่อน', 409);
    let pid = 0;
    if (!research) {
      const now = Date.now(); pid = (await DB.prepare("SELECT id FROM projects WHERE user_id=? AND name='ทดสอบ Agent'").bind(me.id).first())?.id;
      if (!pid) { pid = (await DB.prepare("INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,'ทดสอบ Agent',?,?) RETURNING id").bind(me.id, now, now).first()).id; }
      await DB.prepare("INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,'index.html',?,?)").bind(pid, '<!DOCTYPE html>\n<html lang="th">\n<head><meta charset="utf-8"><title>ร้านกาแฟ</title></head>\n<body>\n  <h1>ร้านกาแฟ</h1>\n</body>\n</html>\n', now).run();
    }
    const prompt = research ? 'สรุปข้อดีข้อเสียของรถยนต์ไฟฟ้าในไทยปีนี้แบบสั้นๆ (ทดสอบระบบ)' : 'ทำเว็บร้านกาแฟเล็กๆ: หน้าแรก index.html มีเมนูลิงก์ไป menu.html, หน้า menu.html แสดงเมนู 4 อย่างพร้อมราคา, และไฟล์ style.css ใช้ร่วมกันทั้งสองหน้า (ทดสอบระบบ)';
    const job = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,role) VALUES (?,?,?,?,'queued',?,?) RETURNING id").bind(me.id, pid, m.id, prompt, Date.now(), research ? 'research' : 'lead').first();
    await ctxAudit('agent test', { kind: research ? 'research' : 'team', job: job.id });
    await launch(env, job.id);
    return json({ ok: true, id: job.id, model: m.name, project_id: pid });
  }
  if (path === '/api/admin/broadcast' && M === 'POST') { // อีเมลถึงผู้ใช้ทุกคน (ยกเว้นคนที่ปิดอีเมลสรุป/ข่าวสาร) · test = ส่งให้แอดมินคนเดียวก่อน
    const b = await req.json().catch(() => ({})), subject = String(b.subject || '').trim().slice(0, 150), body = String(b.body || '').trim().slice(0, 4000);
    if (!subject || !body) return err('ใส่หัวข้อและข้อความ');
    const html = mailBox(esc(subject), esc(body).replace(/\n/g, '<br>') + '<br><br><small>ไม่อยากรับอีเมลข่าวสาร ปิดได้ที่หน้าบัญชี (สรุปการใช้รายเดือน)</small>', b.button ? esc(String(b.button).slice(0, 40)) : null, b.button ? siteUrlOf(env) + '/plans' : null);
    if (b.test) return json({ ok: await mail(env, me.email, subject, html), to: 1 });
    if (await limited(env, 'broadcast', 2, DAY)) return err('ส่งอีเมลถึงทุกคนได้วันละ 2 ครั้ง', 429);
    const to = (await DB.prepare("SELECT email FROM users WHERE banned=0 AND COALESCE(digest_off,0)=0 AND email NOT LIKE '%.local'").all()).results;
    let sent = 0; for (const x of to) { if (await mail(env, x.email, subject, html)) sent++; await new Promise(r => setTimeout(r, 600)); } // Resend จำกัด ~2 ฉบับ/วินาที
    await ctxAudit('broadcast', { subject, sent, total: to.length });
    return json({ ok: true, sent, total: to.length });
  }
  if (path === '/api/admin/backups/verify' && M === 'POST') return json(await verifyBackup(env)); // เปิดไฟล์สำรองล่าสุด ตรวจว่าอ่านได้และนับแถวเทียบฐานข้อมูลจริง (ไม่เขียนอะไร)
  if (path === '/api/admin/audit') return json((await DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()).results);
  if (path === '/api/admin/seo-models' && M === 'POST') { // สร้าง/อัปเดตบทความ SEO หนึ่งหน้าต่อโมเดล (ขึ้น /blog และ sitemap)
    const ms = (await DB.prepare("SELECT * FROM models WHERE active=1 AND public=1 AND provider NOT IN ('embedding','image') ORDER BY sort,id").all()).results;
    let official = {}; try { official = JSON.parse(await getSetting(env, 'official_prices') || '{}') || {}; } catch { /* ไม่มีราคาทางการ */ }
    const rate = +(await getSetting(env, 'usd_rate')) || 34.5, base = siteUrlOf(env), now = Date.now();
    for (const m of ms) {
      const p = await priceOf(env, m), o = official[m.id], s = 'model-' + slug(m), ctx = (m.ctx_k > 0 ? m.ctx_k : 128) >= 1000 ? Math.round((m.ctx_k || 128) / 1000 * 10) / 10 + ' ล้าน' : (m.ctx_k || 128) + 'k';
      const cheaper = o?.out > 0 && p.out > 0 ? Math.round((1 - p.out / (o.out * rate)) * 100) : 0;
      const title = `ใช้ ${m.name} ภาษาไทย ราคาถูก จ่ายเป็นบาท`, summary = `${m.name} บน Kyber: แชตภาษาไทย เขียนโค้ด และเรียกผ่าน API ราคา output ฿${p.out}/1M token${cheaper > 0 ? ` ถูกกว่าซื้อตรงประมาณ ${cheaper}%` : ''} เติมเริ่มต้น ฿10`;
      const body = `# ${m.name} ใช้ได้แล้วบน Kyber

ใช้ **${m.name}** ผ่านเว็บได้ทันที ไม่ต้องมีบัตรเครดิต จ่ายเป็นบาทผ่าน PromptPay เติมเริ่มต้นแค่ ฿10

## จุดเด่น

- ${m.vision ? 'อ่านรูปได้: แนบภาพ สลิป หรือหน้าจอแล้วถามได้' : 'เน้นงานข้อความและโค้ด'}
- ${m.effort !== 'none' ? 'เลือกระดับการคิด (Thinking) ได้ตามความยากของงาน' : 'ตอบเร็ว เหมาะกับงานทั่วไป'}
- Context ยาว ${ctx} token: แนบเอกสารยาวหรือโค้ดทั้งโปรเจกต์ได้
- ใช้ได้ทั้งแชต โหมด Code ทีม Agent และ API แบบ OpenAI

## ราคา (ต่อ 1 ล้าน token)

| | Kyber | ซื้อตรง (ราคาทางการ) |
|---|---|---|
| Input | ฿${p.in} | ${o?.in ? '฿' + Math.round(o.in * rate * 100) / 100 : '-'} |
| Output | ฿${p.out} | ${o?.out ? '฿' + Math.round(o.out * rate * 100) / 100 : '-'} |

${cheaper > 0 ? `ถูกกว่าซื้อ API ทางการประมาณ **${cheaper}%** (คิดที่ 1 ดอลลาร์ = ${rate} บาท)

` : ''}## เริ่มใช้ใน 1 นาที

1. สมัครที่ [Kyber](${base}/login)
2. เลือก **${m.name}** ที่ปุ่มเลือกโมเดล
3. ถ้าโมเดลไม่อยู่ในแพลนของคุณ เติม Wallet ขั้นต่ำ ฿1 แล้วใช้ได้ทันที

นักพัฒนาเรียกผ่าน API ได้ที่ [หน้า API](${base}/developers) ใช้ชื่อโมเดล \`${slug(m)}\`
`;
      await DB.prepare('INSERT INTO posts (slug,title,summary,body,cover,published,created_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, summary=excluded.summary, body=excluded.body').bind(s, title, summary, body, '/og.png', now).run();
    }
    await ctxAudit('seo pages', { n: ms.length });
    return json({ ok: true, n: ms.length });
  }
  if (path.startsWith('/api/admin/roadmap')) { // Roadmap: เพิ่ม/แก้สถานะ/ลบ
    await ensureRoadmap(env); const id = +path.split('/')[4] || 0, b = M === 'GET' ? {} : await req.json().catch(() => ({}));
    if (M === 'GET') return json((await DB.prepare('SELECT r.*, (SELECT COUNT(*) FROM roadmap_votes v WHERE v.item_id=r.id) votes FROM roadmap r ORDER BY r.id DESC').all()).results);
    const st = ['idea', 'planned', 'doing', 'done'].includes(b.status) ? b.status : 'planned';
    if (M === 'POST') { const t = String(b.title || '').trim().slice(0, 120); if (!t) return err('ใส่หัวข้อ'); await DB.prepare('INSERT INTO roadmap (title,body,status,created_at) VALUES (?,?,?,?)').bind(t, String(b.body || '').slice(0, 1000), st, Date.now()).run(); return json({ ok: true }); }
    if (M === 'PUT' && id) { await DB.prepare('UPDATE roadmap SET status=? WHERE id=?').bind(st, id).run(); return json({ ok: true }); }
    if (M === 'DELETE' && id) { await DB.batch([DB.prepare('DELETE FROM roadmap_votes WHERE item_id=?').bind(id), DB.prepare('DELETE FROM roadmap WHERE id=?').bind(id)]); return json({ ok: true }); }
  }
  if (path === '/api/admin/churn') { // แพลนหมดอายุใน 60 วันแล้วไม่ต่อ: จ่ายไปเท่าไหร่ ใช้ล่าสุดเมื่อไหร่ โมเดลสุดท้าย
    const now = Date.now();
    return json((await DB.prepare(`SELECT u.id,u.email,p.name plan,u.plan_expires,u.plan_period,
      (SELECT COALESCE(SUM(amount),0) FROM payments x WHERE x.user_id=u.id AND x.status='approved' AND x.slip_key NOT IN ('wallet','coupon')) paid,
      (SELECT MAX(created_at) FROM usage s WHERE s.user_id=u.id) last_use,
      (SELECT m.name FROM usage s JOIN models m ON m.id=s.model_id WHERE s.user_id=u.id ORDER BY s.id DESC LIMIT 1) last_model,
      (SELECT COUNT(*) FROM usage s WHERE s.user_id=u.id AND s.created_at>u.plan_expires-30*86400000 AND s.created_at<=u.plan_expires) msgs_last30
      FROM users u JOIN plans p ON p.id=u.plan_id WHERE p.price>0 AND u.plan_expires BETWEEN ?1 AND ?2 ORDER BY u.plan_expires DESC LIMIT 200`).bind(now - 60 * 864e5, now).all()).results);
  }
  if (path === '/api/admin/model-health') { // สุขภาพโมเดล 24 ชม.: ตอบสำเร็จ (จาก usage) เทียบ error (จาก events)
    const since = Date.now() - 864e5;
    const ok = (await DB.prepare('SELECT model_id, COUNT(*) n, AVG(ttft) ttft, AVG(ms) ms, AVG(prep) prep FROM usage WHERE created_at>? AND model_id>0 GROUP BY model_id').bind(since).all()).results;
    const er = (await DB.prepare("SELECT model_id, COUNT(*) n, MAX(created_at) at FROM events WHERE kind='error' AND created_at>? GROUP BY model_id").bind(since).all()).results;
    const last = (await DB.prepare("SELECT model_id, detail FROM events WHERE id IN (SELECT MAX(id) FROM events WHERE kind='error' AND created_at>? GROUP BY model_id)").bind(since).all().catch(() => ({ results: [] }))).results;
    const fbs = (await DB.prepare("SELECT model_id, COUNT(*) n FROM events WHERE kind='fallback' AND created_at>? GROUP BY model_id").bind(since).all()).results; // ตอบด้วยโมเดลสำรองแทนตัวนี้กี่ครั้ง
    const ms = (await DB.prepare('SELECT id,name,active FROM models ORDER BY id').all()).results;
    return json(ms.map(m => ({ id: m.id, name: m.name, active: m.active, fallback: fbs.find(x => x.model_id === m.id)?.n || 0, issue: supplyIssue(last.find(x => x.model_id === m.id)?.detail)?.label || '', ok: ok.find(x => x.model_id === m.id)?.n || 0, ttft: Math.round(ok.find(x => x.model_id === m.id)?.ttft || 0), ms: Math.round(ok.find(x => x.model_id === m.id)?.ms || 0), prep: Math.round(ok.find(x => x.model_id === m.id)?.prep || 0), err: er.find(x => x.model_id === m.id)?.n || 0, last_at: er.find(x => x.model_id === m.id)?.at || null, last: last.find(x => x.model_id === m.id)?.detail || '' })).filter(x => x.ok || x.err || x.fallback));
  }
  if (path === '/api/admin/events') return json((await DB.prepare('SELECT e.*,m.name model FROM events e LEFT JOIN models m ON m.id=e.model_id ORDER BY e.id DESC LIMIT 200').all()).results);
  if (path === '/api/admin/backups') {
    if (!env.SLIPS) return err('ต้องผูก R2 (SLIPS) ก่อน');
    if (M === 'POST') { await ctxAudit('backup', null); return json({ ok: true, key: await backup(env) }); }
    return json((await env.SLIPS.list({ prefix: 'backup/' })).objects.map(o => ({ key: o.key, size: o.size, at: o.uploaded })).reverse());
  }
  if ((r = path.match(/^\/api\/admin\/backups\/(backup\/[\w.-]+)$/))) {
    const o = env.SLIPS && await env.SLIPS.get(r[1]);
    return o ? new Response(o.body, { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${r[1].split('/')[1]}"` } }) : err('not found', 404);
  }
  return err('not found', 404);
}

// โจทย์มาตรฐานของปุ่มทดสอบโมเดล: [หมวด, คำถาม, regex ของคำตอบที่ถูก] · ตรวจแบบตายตัว จึงเทียบข้ามโมเดลได้ยุติธรรม
export const BENCH = [
  ['การเงิน', 'กู้ 100,000 บาท ดอกเบี้ย 12% ต่อปี ผ่อนรายเดือนเท่ากัน 12 งวด (ลดต้นลดดอก) ผ่อนงวดละกี่บาท ตอบตัวเลขปัดเป็นจำนวนเต็มในบรรทัดสุดท้าย', /8,?88[45]/],
  ['การเงิน', 'ลงทุนเดือนละ 1,000 บาท 12 เดือน ไม่มีผลตอบแทน รวมได้เท่าไร และถ้าได้ผลตอบแทนรวม 6% ของเงินต้นเมื่อครบปี จะมีเงินทั้งหมดเท่าไร ตอบตัวเลขสุดท้าย', /12,?720/],
  ['คณิต', 'ถ้า 3x + 7 = 31 แล้ว x^2 - x เท่ากับเท่าไร ตอบเฉพาะตัวเลข', /\b56\b/],
  ['โค้ด', 'JavaScript: [3,1,2].sort().map(x => x * 2).join("-") ได้ผลลัพธ์เป็นอะไร ตอบเฉพาะผลลัพธ์', /2-4-6/],
  ['โค้ด', 'Python: print(len(set("banana"))) ได้ผลลัพธ์อะไร ตอบเฉพาะตัวเลข', /\b3\b/],
  ['ภาษาไทย', 'ประเทศไทยมีกี่จังหวัด (นับรวมกรุงเทพมหานคร) ตอบเฉพาะตัวเลข', /\b77\b/],
  ['ทำตามคำสั่ง', 'ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น ไม่มี code fence: {"fruit": ชื่อผลไม้สีเหลืองภาษาอังกฤษตัวพิมพ์เล็ก 1 คำ}', /^\s*\{\s*"fruit"\s*:\s*"(banana|lemon|mango|pineapple)"\s*\}\s*$/],
  ['เหตุผล', 'นาย A สูงกว่า B, B สูงกว่า C, D เตี้ยกว่า C ใครเตี้ยที่สุด ตอบตัวอักษรเดียว', /\bD\b/],
];

// ---------- ทดสอบโมเดลกับงาน Agent ----------
const BENCH_FS = () => ({ 'src/cart.js': "import { vat } from './vat.js';\nexport function total(items, discount = 0) {\n  const sum = items.reduce((a, i) => a + i.price * i.qty, 0);\n  return sum + vat(sum) - discount;\n}\n", 'src/vat.js': 'export const RATE = 0.07;\nexport const vat = p => p * RATE;\n', 'README.md': '# shop\nRun tests with npm test\n' });
// Workers ห้าม eval/new Function จึงตรวจจากโค้ด: ต้องคิด VAT จาก (sum - discount) ตรงๆ หรือผ่านตัวแปรที่เท่ากับ sum - discount และไม่เหลือ vat(sum)
const vatAfterDiscount = c => {
  const direct = /vat\(\s*\(?\s*sum\s*-\s*discount\s*\)?\s*\)/.test(c);
  const viaVar = [...c.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*sum\s*-\s*discount/g)].some(m => new RegExp(`vat\\(\\s*${m[1]}\\s*\\)`).test(c));
  return (direct || viaVar) && !/vat\(\s*sum\s*\)/.test(c);
};
const BENCH_TASKS = [
  ['What is the VAT rate used in this project? Reply with just the number.', (fs, text) => /0\.07|7\s*%/.test(text)],
  ['Which file contains the function that computes the cart total? Reply with just the path.', (fs, text) => /src\/cart\.js/.test(text)],
  ['Change the VAT rate to 10%.', fs => /RATE\s*=\s*0?\.10?\b/.test(fs['src/vat.js']) && !/0\.07/.test(fs['src/vat.js'])],
  ['Bug: VAT must be charged on the amount after the discount, not before. Fix it.', fs => vatAfterDiscount(fs['src/cart.js'])],
];
const BENCH_TOOLS = [
  { type: 'function', function: { name: 'list_dir', description: 'List files in the project', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'grep', description: 'Search all files for text', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Replace exact text in a file (old_string must appear once)', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] } } },
];
async function agentBench(env, me, m) {
  const t0 = Date.now(); let score = 0, cost = 0; const detail = [];
  for (const [task, check] of BENCH_TASKS) {
    const fs = BENCH_FS(), tool = (n, a) => {
      if (n === 'list_dir') return Object.keys(fs).join('\n');
      if (n === 'read_file') return fs[a.path] ?? 'Error: no such file';
      if (n === 'grep') return Object.entries(fs).flatMap(([p, c]) => c.split('\n').map((l, i) => l.includes(a.pattern) ? `${p}:${i + 1}: ${l}` : null).filter(Boolean)).join('\n') || 'no match';
      if (n === 'edit_file') { const c = fs[a.path]; if (c == null) return 'Error: no such file'; const k = a.old_string ? c.split(a.old_string).length - 1 : 0; if (k !== 1) return `Error: old_string found ${k} times`; fs[a.path] = c.replace(a.old_string, () => a.new_string); return 'ok'; }
      return 'Error: unknown tool';
    };
    let msgs = [{ role: 'user', content: task }], text = '';
    try {
      for (let round = 0; round < 8; round++) {
        let part = '', usage = null; const tcs = new Map(), idx = new Map();
        for await (const e of callModel(env, m, msgs, { system: 'You are a coding agent working in a small JavaScript project. Use the tools to look at files before answering or editing. Be brief.', tools: BENCH_TOOLS, maxTokens: 2000, signal: AbortSignal.timeout(60e3) })) {
          if (e.t) part += e.t; if (e.usage) usage = e.usage;
          if (e.tc_start) { const i = tcs.size; idx.set(e.tc_start.index, i); tcs.set(i, { id: e.tc_start.id, type: 'function', function: { name: e.tc_start.name, arguments: '' } }); }
          if (e.tc_delta) { const i = idx.get(e.tc_delta.index); if (i != null) tcs.get(i).function.arguments += e.tc_delta.args; }
          if (e.tc) for (const d of e.tc) { const i = d.index ?? 0; if (!tcs.has(i)) tcs.set(i, { id: d.id || 'call_' + rand(8), type: 'function', function: { name: '', arguments: '' } }); const c = tcs.get(i); if (d.id) c.id = d.id; if (d.function?.name) c.function.name += d.function.name; if (d.function?.arguments) c.function.arguments += d.function.arguments; }
        }
        if (usage) { cost += (usage.fresh * m.cost_in + usage.read * (m.cost_cache || 0) + usage.write * (m.cost_cache_write || 0) + usage.out * m.cost_out) / 1e6; await logUsage(env, me.id, m, usage, { units: false, src: 'system' }); }
        text += part; const calls = [...tcs.values()];
        if (!calls.length) break;
        msgs = [...msgs, { role: 'assistant', content: part || null, tool_calls: calls }, ...calls.map(c => { let a = {}; try { a = JSON.parse(c.function.arguments || '{}'); } catch { /* ว่าง */ } return { role: 'tool', tool_call_id: c.id, content: String(tool(c.function.name, a)) }; })];
      }
      const ok = check(fs, text); score += ok ? 1 : 0; detail.push((ok ? '✓ ' : '✕ ') + task.slice(0, 32));
    } catch (x) { detail.push('✕ ' + task.slice(0, 24) + ' (' + String(x.message).slice(0, 60) + ')'); }
  }
  return { name: m.name, score, of: BENCH_TASKS.length, ms: Date.now() - t0, cost: Math.round(cost * 1e4) / 1e4, detail };
}

// คาดการณ์ทั้งเดือน + ผู้ใช้แพลนที่อาจขาดทุนก่อนแพลนหมด
// แพลนจ่ายล่วงหน้าทั้งรอบ แต่ต้นทุนทยอยเกิดทุกวัน: กำไรช่วงต้นรอบจึงดูดีเกินจริง
// ต้นทุนต่อวันของแต่ละคน = ต้นทุนที่หักลิมิต (units>0) ใน 7 วันล่าสุด ÷ จำนวนวันที่ใช้จริง · ไม่เกินเพดานลิมิตรายสัปดาห์ (limit_week ÷ 7 ต่อวัน, ตัวคูณ 1)
// คาดการณ์ทั้งเดือน · ไม่นับบัญชีที่ติ๊ก "ไม่นับในรายงาน" (และแอดมิน/ทีมงาน) ทั้งรายได้ ต้นทุน และลูกค้าแพลน
// หลังหมดโปร: (1) โปรเพิ่มลิมิตทั้งเว็บ (promo_until) และตัวคูณลิมิตช่วงโปรของโมเดล (promo_mult) จบ → ลูกค้าแพลนใช้ได้แค่ลิมิตปกติ ต้นทุนต่อคนถูกตัดที่ลิมิตเดิม
// (2) โปรลดราคาโมเดล (promo_pct) จบ → เงินที่ตัดจาก Wallet ของโมเดลนั้นกลับเป็นราคาเต็ม · ต้นทุนส่วนอื่น (Wallet/API/แพลนฟรี) ถือว่าเท่าเดิม
export async function profitForecast(env, now = Date.now()) {
  const DB = env.DB, d = new Date(now + BKK), mStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - BKK, mEnd = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - BKK;
  const win = 3 * DAY, since7 = now - 7 * DAY, NR = NOREP, NRU = "COALESCE(u.no_report,0)=0 AND u.role='user'";
  const multAfter = "CASE WHEN md.use_mult >= 0 THEN md.use_mult ELSE 1 END"; // ตัวคูณลิมิตปกติของโมเดล (ไม่ใช่ช่วงโปร)
  const [m, r, subs, byModel, ms, boost] = await Promise.all([
    DB.prepare(`SELECT
      COALESCE((SELECT SUM(cost) FROM usage WHERE created_at>=?1 AND ${NR}),0) cost,
      COALESCE((SELECT SUM(amount) FROM payments WHERE status='approved' AND kind='plan' AND ${NR} AND COALESCE(approved_at,created_at)>=?1),0) plan_rev,
      COALESCE((SELECT SUM(amount) FROM payments WHERE status='approved' AND kind='plan' AND slip_key NOT IN ('wallet','coupon') AND ${NR} AND COALESCE(approved_at,created_at)>=?1),0) plan_cash,
      COALESCE((SELECT SUM(amount) FROM payments WHERE status='approved' AND kind='topup' AND ${NR} AND COALESCE(approved_at,created_at)>=?1),0) topups,
      COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE kind IN ${WALLET_SPEND} AND ${NR} AND created_at>=?1),0) wallet_rev,
      COALESCE((SELECT SUM(amount) FROM wallet_tx WHERE kind IN ('promo_bonus','first_bonus','referral','affiliate') AND ${NR} AND created_at>=?1),0) bonus`).bind(mStart).first(),
    DB.prepare(`SELECT COALESCE((SELECT SUM(cost) FROM usage WHERE created_at>=?1 AND ${NR}),0) cost, COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE kind IN ${WALLET_SPEND} AND ${NR} AND created_at>=?1),0) wallet_rev`).bind(now - win).first(),
    DB.prepare(`SELECT u.id, u.email, pl.name plan, pl.price, pl.limit_week, pl.once, u.plan_expires,
      (SELECT amount FROM payments x WHERE x.user_id=u.id AND x.status='approved' AND x.kind='plan' AND x.plan_id=u.plan_id ORDER BY COALESCE(x.approved_at,x.created_at) DESC LIMIT 1) paid,
      (SELECT COALESCE(x.approved_at,x.created_at) FROM payments x WHERE x.user_id=u.id AND x.status='approved' AND x.kind='plan' AND x.plan_id=u.plan_id ORDER BY COALESCE(x.approved_at,x.created_at) DESC LIMIT 1) paid_at,
      COALESCE((SELECT SUM(g.cost) FROM usage g WHERE g.user_id=u.id AND g.units>0 AND g.created_at>=?2),0) cost7,
      COALESCE((SELECT SUM(g.units) FROM usage g WHERE g.user_id=u.id AND g.units>0 AND g.created_at>=?2),0) units7,
      COALESCE((SELECT SUM(g.cost * ${multAfter}) FROM usage g LEFT JOIN models md ON md.id=g.model_id WHERE g.user_id=u.id AND g.units>0 AND g.created_at>=?2),0) units_after7,
      (SELECT MIN(created_at) FROM usage g WHERE g.user_id=u.id AND g.units>0 AND g.created_at>=?2) first7
      FROM users u JOIN plans pl ON pl.id=u.plan_id WHERE u.banned=0 AND ${NRU} AND pl.price>0 AND u.plan_expires>?1`).bind(now, since7).all(),
    DB.prepare(`SELECT model_id, COALESCE(SUM(charge),0) c FROM usage WHERE created_at>=?1 AND charge>0 AND ${NR} GROUP BY model_id`).bind(now - win).all(), // เงินที่ตัดจาก Wallet ต่อโมเดล 3 วันล่าสุด
    DB.prepare('SELECT id, name, promo_pct, promo_start, promo_end, promo_mult, use_mult FROM models').all(),
    limitBoost(env),
  ]);
  // โปรที่กำลังจัดอยู่ และวันจบ (ไม่ตั้งวันจบ = ไม่รู้ว่าจบเมื่อไร: คิดให้จบสิ้นเดือนในตัวเลขทั้งเดือน)
  const inWin = x => (!x.promo_start || x.promo_start <= now) && (!x.promo_end || now <= x.promo_end);
  const priceP = ms.results.filter(x => promoOn(x, now)), multP = ms.results.filter(x => x.promo_mult != null && inWin(x)), tp = topupPromo(now);
  const ends = [boost?.until, ...priceP.map(x => x.promo_end || mEnd), ...multP.map(x => x.promo_end || mEnd), tp?.end].filter(Boolean);
  const promoEnd = ends.length ? Math.min(mEnd, Math.max(...ends)) : now, untilEnd = Math.max(0, (promoEnd - now) / DAY);
  const left = Math.max(0, (mEnd - now) / DAY), elapsed = Math.max(1 / 24, (now - mStart) / DAY);
  const costDay = r.cost / 3, walletDay = r.wallet_rev / 3;
  const factor = new Map(priceP.map(x => [x.id, 1 / Math.max(0.01, 1 - Math.min(x.promo_pct, 99) / 100)])); // ราคาเต็ม ÷ ราคาโปร
  const walletDayAfter = walletDay + byModel.results.reduce((a, x) => a + x.c * ((factor.get(x.model_id) || 1) - 1), 0) / 3;
  let planNow = 0, planAfter = 0;
  const people = await Promise.all(subs.results.map(async x => {
    const start = x.paid_at || x.plan_expires - 30 * DAY, periodLeft = Math.max(0, (x.plan_expires - now) / DAY);
    const spent = (await DB.prepare('SELECT COALESCE(SUM(cost),0) c FROM usage WHERE user_id=? AND units>0 AND created_at>=?').bind(x.id, start).first()).c;
    const usedDays = Math.min(7, x.first7 ? Math.max(1, (now - x.first7) / DAY) : 7), costRate = x.cost7 / usedDays;
    const capNow = x.limit_week * (boost && !x.once ? boost.xweek : 1) / 7, capAfter = x.limit_week / 7; // ลิมิตเป็นหน่วย (ต้นทุน × ตัวคูณโมเดล) ต่อวัน · แพลนทดลอง (once) ไม่ได้โปรเพิ่มลิมิต
    const scale = (u, cap) => u > cap && u > 0 ? cap / u : 1; // ใช้เกินลิมิตไม่ได้: ต้นทุนถูกตัดตามสัดส่วน
    const rate = costRate * scale(x.units7 / usedDays, capNow), rateAfter = costRate * scale(x.units_after7 / usedDays, capAfter);
    planNow += rate; planAfter += rateAfter;
    const future = rate * Math.min(periodLeft, untilEnd) + rateAfter * Math.max(0, periodLeft - untilEnd), paid = x.paid || 0;
    const unitCost = x.units_after7 > 0 ? x.cost7 / x.units_after7 : 1; // บาทต้นทุนต่อหน่วยลิมิตหลังโปร (แย่สุด = ใช้เต็มลิมิต)
    const worstRate = d => (d < untilEnd ? capNow * (x.units7 > 0 ? x.cost7 / x.units7 : 1) : capAfter * unitCost);
    const worst = paid - spent - worstRate(0) * Math.min(periodLeft, untilEnd) - worstRate(untilEnd) * Math.max(0, periodLeft - untilEnd);
    return { id: x.id, email: x.email, plan: x.plan, price: x.price, paid, free: !x.paid, spent, rate, rate_after: rateAfter, days_left: periodLeft, future, total: spent + future, profit: paid - spent - future, worst };
  }));
  people.sort((a, b) => a.profit - b.profit);
  const other = Math.max(0, costDay - planNow), costDayAfter = other + planAfter; // ต้นทุนส่วนที่ไม่ใช่ลูกค้าแพลน (Wallet/API/แพลนฟรี) ถือว่าเท่าเดิม
  const projCost = m.cost + costDay * left, projRev = m.plan_rev + m.wallet_rev + walletDay * left;
  const a = Math.min(left, untilEnd), b = Math.max(0, left - untilEnd); // ช่วงที่ยังมีโปร / ช่วงหลังโปรจบ ในเดือนนี้
  const afCost = m.cost + costDay * a + costDayAfter * b, afRev = m.plan_rev + m.wallet_rev + walletDay * a + walletDayAfter * b;
  const planDay = m.plan_rev / elapsed; // ค่าแพลนเฉลี่ยต่อวันของเดือนนี้ (ใช้ประมาณเดือนถัดไป)
  const owed = people.reduce((s, x) => s + x.future, 0), worstOwed = people.reduce((s, x) => s + Math.max(0, x.paid - x.spent - x.worst), 0);
  return { month: new Date(mStart + BKK).toISOString().slice(0, 7), elapsed, left, so_far: { cost: m.cost, plan_rev: m.plan_rev, wallet_rev: m.wallet_rev, cash_in: m.plan_cash + m.topups, bonus: m.bonus, profit: m.plan_rev + m.wallet_rev - m.cost },
    rate: { cost_day: costDay, wallet_day: walletDay }, proj: { cost: projCost, rev: projRev, profit: projRev - projCost },
    promo: { active: ends.length > 0, end: ends.length ? promoEnd : null, boost: boost ? { until: boost.until, x4h: boost.x4h, xweek: boost.xweek, label: boost.label } : null,
      price: priceP.map(x => ({ name: x.name, pct: x.promo_pct, end: x.promo_end || null })), mult: multP.map(x => ({ name: x.name, mult: x.promo_mult, normal: x.use_mult ?? 1, end: x.promo_end || null })), topup: tp ? { pct: tp.pct, end: tp.end } : null },
    after: { cost_day: costDayAfter, wallet_day: walletDayAfter, plan_day: planDay, plan_cost_now: planNow, plan_cost_after: planAfter, profit_day: planDay + walletDayAfter - costDayAfter, profit_30: (planDay + walletDayAfter - costDayAfter) * 30,
      month: { cost: afCost, rev: afRev, profit: afRev - afCost } },
    subs: { n: people.length, owed, worst_owed: worstOwed, at_risk: people.filter(x => x.profit < 0).length }, people: people.slice(0, 15) };
}
