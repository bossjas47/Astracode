import { BKK, DAY, creditsInit, err, esc, json, logReset, planOf, resetUsage, slipGet, usageStatus } from './core.js';
import { ensureFb, isSafeMcpUrl, mcpSync } from './ai.js';
import { applyPayment, audit, getSetting, mail, mailBox, notify, walletAdd } from './billing.js';
import { seal } from './projects.js';
import { slug } from './api.js';
import { backup, status } from './jobs.js';
// ---------- admin ----------
export const TABLES = {
  plans: ['name', 'price', 'price_year', 'limit_4h', 'use_4h', 'limit_week', 'seats', 'shared_pool', 'api_limit', 'description', 'sort', 'active'],
  models: ['name', 'provider', 'api_model', 'base_url', 'key_name', 'multiplier', 'cap_pct', 'cost_in', 'cost_out', 'cost_cache', 'cost_cache_write', 'price_in', 'price_out', 'price_cache', 'price_cache_write', 'promo_pct', 'promo_start', 'promo_end', 'use_mult', 'promo_mult', 'first_token_s', 'idle_s', 'code_prompt', 'public', 'note', 'fallback_id', 'vision', 'effort', 'effort_levels', 'sort', 'active'],
  posts: ['slug', 'title', 'summary', 'body', 'cover', 'published'],
};
export const SETTINGS = ['promptpay_id', 'slip_provider', 'slip_auto_approve', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account', 'slip_api_url', 'slip_amount_field', 'featured_plan', 'price_markup', 'price_note', 'referral_bonus', 'announcement', 'announcement_level', 'maintenance',
  'alert_discord', 'alert_line_to', 'cost_alert_daily', 'mail_from', 'search_enabled', 'search_auto', 'health_check', 'turnstile_site', 'image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_units', 'image_cost',
  'autocomplete_model', 'auto_cheap_model', 'auto_strong_model', 'summary_model', 'business_name', 'business_address', 'business_tax_id', 'topup_min', 'fb_api_key', 'google_client_id', 'google_client_secret',
  'model_icons', 'picker_filter', 'picker_mult', 'picker_logos', 'official_prices', 'easyslip_url', 'easyslip_receiver', 'easyslip_receiver_names'];

export async function admin(req, env, path, url, me) {
  const M = req.method, DB = env.DB;
  const ctxAudit = M === 'GET' ? async () => {} : (action, detail) => audit(env, me, action, detail); // บันทึกทุกการแก้ไขของแอดมิน
  let r;
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
    const b = await req.json(), vals = cols.map(c => b[c] ?? null);
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
  if (path === '/api/admin/payments') return json((await DB.prepare(
    'SELECT p.*,u.email,CASE WHEN p.kind=\'topup\' THEN \'เติม Wallet\' ELSE pl.name || CASE WHEN p.period=\'year\' THEN \' (รายปี)\' ELSE \'\' END END plan_name FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id ORDER BY p.status=\'pending\' DESC, p.id DESC LIMIT 200').all()).results);
  if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/)) && M === 'POST') {
    const p = await DB.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").bind(r[1]).first();
    if (!p) return err('ไม่พบคำขอที่รออนุมัติ', 404);
    const upd = await DB.prepare("UPDATE payments SET status=?, approved_at=? WHERE id=? AND status='pending'").bind(r[2] === 'approve' ? 'approved' : 'rejected', Date.now(), p.id).run();
    if (!upd.meta.changes) return err('คำขอนี้ถูกจัดการไปแล้ว', 409); // กันกดอนุมัติซ้ำพร้อมกัน
    await ctxAudit(r[2] + ' payment', { id: p.id, amount: p.amount, user: p.user_id });
    if (r[2] === 'approve') await applyPayment(env, p);
    return json({ ok: true });
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
    return json((await DB.prepare(`SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,p.name plan_name,
      (SELECT MAX(created_at) FROM usage WHERE user_id=u.id) last_active,
      (SELECT COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) FROM usage WHERE user_id=u.id AND created_at>?2) tok30
      FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.email LIKE ?1 ORDER BY u.id DESC LIMIT 100`).bind(q, Date.now() - 30 * DAY).all()).results);
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'PUT') {
    const b = await req.json();
    await ctxAudit('update user', { id: +r[1], ...b });
    if (b.credit) { const v = Math.round(+b.credit * 100) / 100; if (!v) return err('จำนวนเงินไม่ถูกต้อง'); await walletAdd(env, +r[1], v, 'admin', String(b.note || '').slice(0, 100) || null); }
    if (b.logout) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run(); // รหัสผ่านอยู่ใน Firebase ผู้ใช้รีเซ็ตเองที่หน้าเข้าสู่ระบบ
    let scopedRows = null;
    if (b.reset_usage) {
      const n = await resetUsage(env, +r[1], b.scope), lbl = b.scope?.vendor ? 'ค่าย ' + String(b.scope.vendor).slice(0, 40) : b.scope?.model_id ? 'โมเดล #' + (+b.scope.model_id) : 'ทั้งหมด';
      await logReset(env, +r[1], 'direct', lbl, { by: me.email });
      scopedRows = n;
    }
    if ('banned' in b) await DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(b.banned ? 1 : 0, r[1]).run();
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
      DB.prepare(`SELECT ${dayOf('created_at')} d, SUM(amount) rev FROM payments WHERE status='approved' AND created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT ${dayOf('created_at')} d, COUNT(*) n FROM users WHERE created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved' AND created_at>=?1) rev, COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1`).bind(from).first(),
      DB.prepare(`SELECT (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved' AND created_at>=?1 AND created_at<?2) rev, COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1 AND created_at<?2`).bind(prev, from).first(),
      DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(u.tokens_in) tin, SUM(u.tokens_out) tout, SUM(u.tokens_cache) tc, SUM(u.cost) cost FROM usage u JOIN models m ON m.id=u.model_id WHERE u.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(from).all(),
      DB.prepare('SELECT us.id, us.email, p.name plan, COUNT(*) msgs, SUM(u.tokens_in+u.tokens_out+u.tokens_cache) tok, SUM(u.cost) cost FROM usage u JOIN users us ON us.id=u.user_id LEFT JOIN plans p ON p.id=us.plan_id AND us.plan_expires>? WHERE u.created_at>=? GROUP BY us.id ORDER BY cost DESC LIMIT 10').bind(now, from).all(),
      DB.prepare('SELECT COUNT(*) total, COALESCE(SUM(plan_id IS NOT NULL AND plan_expires>?),0) paid FROM users').bind(now).first(),
      DB.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").first(),
    ]);
    const U = new Map(use.results.map(r => [r.d, r])), P = new Map(pays.results.map(r => [r.d, r.rev])), R = new Map(regs.results.map(r => [r.d, r.n]));
    const daily = Array.from({ length: days }, (_, i) => {
      const d = today - days + 1 + i, u = U.get(d) || {};
      return { day: d * DAY, tin: u.tin || 0, tout: u.tout || 0, tc: u.tc || 0, cost: u.cost || 0, msgs: u.msgs || 0, au: u.au || 0, rev: P.get(d) || 0, reg: R.get(d) || 0 };
    });
    return json({ days, cur, prev: old, daily, models: models.results, top: top.results, users, pending: pending.n });
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'GET') { // รายละเอียดผู้ใช้ 30 วันล่าสุด
    const u = await DB.prepare('SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,u.usage_reset_at,u.sess_start,u.week_start,u.balance,u.email_verified,u.totp_on,u.google_id,u.line_id,u.plan_period,p.name plan_name FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.id=?').bind(r[1]).first();
    if (!u) return err('ไม่พบผู้ใช้', 404);
    const since = Date.now() - 30 * DAY;
    const [models, pays, chats] = await Promise.all([
      DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(x.tokens_in+x.tokens_out+x.tokens_cache) tok, SUM(x.cost) cost FROM usage x JOIN models m ON m.id=x.model_id WHERE x.user_id=? AND x.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(u.id, since).all(),
      DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 10').bind(u.id).all(),
      DB.prepare('SELECT COUNT(*) n FROM chats WHERE user_id=?').bind(u.id).first(),
    ]);
    u.wallet = (await DB.prepare('SELECT amount,balance_after,kind,ref,created_at FROM wallet_tx WHERE user_id=? ORDER BY id DESC LIMIT 15').bind(u.id).all()).results;
    u.keys = (await DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n;
    const plan = await planOf(env, u);
    return json({ ...u, usage: await usageStatus(env, u, plan), current_plan: plan.name, models: models.results, payments: pays.results, chats: chats.n });
  }
  if (path === '/api/admin/settings') {
    if (M === 'PUT') await ctxAudit('update settings', Object.keys(await req.clone().json()));
    if (M === 'PUT') { const b = await req.json(), q = SETTINGS.filter(k => k in b && (k !== 'google_client_secret' || b[k])).map(k => DB.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').bind(k, String(b[k]))); if (q.length) await DB.batch(q); } // ช่อง secret ว่าง = คงค่าเดิม
    const rows = (await DB.prepare('SELECT * FROM settings').all()).results;
    return json({ ...Object.fromEntries(rows.filter(x => x.key !== 'google_client_secret').map(x => [x.key, x.value])), google_secret_set: rows.some(x => x.key === 'google_client_secret' && x.value), slip_key_set: !!env.SLIP_API_KEY, slip2go_key_set: !!env.SLIP2GO_KEY, easyslip_key_set: !!env.EASYSLIP_KEY,
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
  if (path === '/api/admin/apistats') { // API นักพัฒนา 7 วัน: ต่อโมเดล, key ที่ใช้มากสุด, error ล่าสุด (จาก api_log)
    const from = Date.now() - 7 * DAY;
    const [models, keys, errors, days] = await Promise.all([
      DB.prepare('SELECT COALESCE(model,\'-\') model, COUNT(*) n, SUM(status>=400) errors, ROUND(AVG(ms)) ms, COALESCE(SUM(tin),0) tin, COALESCE(SUM(tout),0) tout, ROUND(COALESCE(SUM(charge),0),2) charge FROM api_log WHERE created_at>=? GROUP BY model ORDER BY n DESC LIMIT 30').bind(from).all(),
      DB.prepare('SELECT k.name, k.prefix, u.email, COUNT(*) n, SUM(l.status>=400) errors, ROUND(COALESCE(SUM(l.charge),0),2) charge FROM api_log l JOIN api_keys k ON k.id=l.key_id JOIN users u ON u.id=l.user_id WHERE l.created_at>=? GROUP BY l.key_id ORDER BY charge DESC, n DESC LIMIT 20').bind(from).all(),
      DB.prepare('SELECT l.path, l.model, l.status, l.err, l.created_at, u.email FROM api_log l JOIN users u ON u.id=l.user_id WHERE l.status>=400 AND l.created_at>=? ORDER BY l.id DESC LIMIT 30').bind(from).all(),
      DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') d, COUNT(*) n, SUM(status>=400) errors FROM api_log WHERE created_at>=? GROUP BY d ORDER BY d").bind(from).all(),
    ]);
    return json({ models: models.results, keys: keys.results, errors: errors.results, days: days.results });
  }
  if (path === '/api/admin/quality') { // คะแนน 👍/👎 ต่อโมเดล (30 วัน) + รายงานคำตอบ
    await ensureFb(env);
    const from = Date.now() - 30 * DAY;
    const votes = (await DB.prepare("SELECT f.model_id, md.name, SUM(f.vote>0) up, SUM(f.vote<0) down FROM feedback f LEFT JOIN models md ON md.id=f.model_id WHERE f.created_at>=? GROUP BY f.model_id ORDER BY (up+down) DESC").bind(from).all()).results;
    const reports = (await DB.prepare("SELECT r.id,r.message_id,r.reason,r.snippet,r.status,r.created_at,u.email,md.name model FROM reports r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN models md ON md.id=r.model_id ORDER BY (r.status='open') DESC, r.id DESC LIMIT 100").all()).results;
    return json({ votes, reports });
  }
  if ((r = path.match(/^\/api\/admin\/reports\/(\d+)$/)) && M === 'PUT') { await ensureFb(env); await DB.prepare('UPDATE reports SET status=? WHERE id=?').bind((await req.json()).status === 'open' ? 'open' : 'done', r[1]).run(); return json({ ok: true }); }
  if (path === '/api/admin/tickets') return json((await DB.prepare("SELECT t.*,u.email,(SELECT COUNT(*) FROM ticket_msgs WHERE ticket_id=t.id) n FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.status='open' DESC, t.updated_at DESC LIMIT 200").all()).results);
  if ((r = path.match(/^\/api\/admin\/tickets\/(\d+)$/))) {
    const t = await DB.prepare('SELECT t.*,u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?').bind(r[1]).first();
    if (!t) return err('ไม่พบเรื่อง', 404);
    if (M === 'POST') {
      const b = await req.json(), body = String(b.body || '').trim().slice(0, 5000);
      if (body) { await DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,1,?,?)').bind(t.id, body, Date.now()).run(); await mail(env, t.email, 'AstraCode: แอดมินตอบเรื่อง ' + t.subject, mailBox('แอดมินตอบแล้ว', esc(body).slice(0, 800).replace(/\n/g, '<br>'))); }
      await DB.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?').bind(b.status === 'closed' ? 'closed' : body ? 'answered' : t.status, Date.now(), t.id).run();
      return json({ ok: true });
    }
    return json({ ...t, msgs: (await DB.prepare('SELECT * FROM ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  }
  if (path === '/api/admin/profit') { // กำไรแยกตามแพลนและผู้ใช้
    // shortcut: ต้นทุนนับตามแพลน "ปัจจุบัน" ของผู้ใช้ ถ้าผู้ใช้เปลี่ยนแพลนกลางช่วง ตัวเลขรายแพลนจะคลาดเล็กน้อย
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30)), from = Date.now() - days * DAY, now = Date.now();
    const free = (await DB.prepare('SELECT id FROM plans WHERE price=0 ORDER BY sort LIMIT 1').first())?.id ?? 0;
    const [plans, users, w] = await Promise.all([
      DB.prepare(`SELECT p.id,p.name,p.price,
        (SELECT COUNT(*) FROM users u WHERE u.banned=0 AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) subs,
        (SELECT COALESCE(SUM(amount),0) FROM payments x WHERE x.plan_id=p.id AND x.kind='plan' AND x.status='approved' AND COALESCE(x.approved_at,x.created_at)>=?2) rev,
        (SELECT COALESCE(SUM(g.cost),0) FROM usage g JOIN users u ON u.id=g.user_id WHERE g.created_at>=?2 AND g.units>0 AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) cost
        FROM plans p ORDER BY p.sort`).bind(now, from, free).all(),
      DB.prepare(`SELECT u.id,u.email,pl.name plan,
        COALESCE((SELECT SUM(cost) FROM usage WHERE user_id=u.id AND created_at>=?1),0) cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE user_id=u.id AND kind='plan' AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) rev_plan,
        COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE user_id=u.id AND kind IN ('api','overflow') AND created_at>=?1),0) rev_wallet
        FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?2
        WHERE EXISTS (SELECT 1 FROM usage WHERE user_id=u.id AND created_at>=?1) OR EXISTS (SELECT 1 FROM payments WHERE user_id=u.id AND status='approved' AND created_at>=?1)`).bind(from, now).all(),
      DB.prepare(`SELECT COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE kind IN ('api','overflow') AND created_at>=?1),0) charges,
        COALESCE((SELECT SUM(cost) FROM usage WHERE units=0 AND model_id>0 AND created_at>=?1),0) api_cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE kind='topup' AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) topups,
        COALESCE((SELECT SUM(balance) FROM users WHERE balance>0),0) liability`).bind(from).first(),
    ]);
    const us = users.results.map(x => ({ ...x, rev: x.rev_plan + x.rev_wallet, profit: x.rev_plan + x.rev_wallet - x.cost })).sort((a, b) => a.profit - b.profit);
    const rev = plans.results.reduce((a, x) => a + x.rev, 0) + w.charges, cost = us.reduce((a, x) => a + x.cost, 0);
    return json({ days, total: { rev, cost, profit: rev - cost }, plans: plans.results, wallet: w, users: us.slice(0, 100), losers: us.filter(x => x.profit < 0).length });
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
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="astracode-${type}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  if (path === '/api/admin/slip-test' && M === 'POST') { // ตรวจการเชื่อมต่อ Slip2Go: ดูข้อมูลบัญชี/โควตาที่เหลือ
    if ((await getSetting(env, 'slip_provider')) === 'easyslip') { // EasySlip: อ่านข้อมูลแอป/โควตาที่เหลือ
      if (!env.EASYSLIP_KEY) return err('ตั้ง Secret EASYSLIP_KEY ก่อน');
      const u = ((await getSetting(env, 'easyslip_url')) || 'https://developer.easyslip.com/api/v1/verify').replace(/\/verify\/?$/, '/info');
      const r = await fetch(u, { headers: { authorization: 'Bearer ' + env.EASYSLIP_KEY } }).catch(e => ({ ok: false, json: async () => ({ message: e.message }) }));
      return json({ ok: r.ok, data: await r.json().catch(() => null) });
    }
    const base = await getSetting(env, 'slip2go_url');
    if (!base || !env.SLIP2GO_KEY) return err('ใส่ API URL และตั้ง Secret SLIP2GO_KEY ก่อน');
    const r = await fetch(base.replace(/\/$/, '') + '/api/account/info', { headers: { authorization: 'Bearer ' + env.SLIP2GO_KEY } }).catch(e => ({ ok: false, json: async () => ({ message: e.message }) }));
    return json({ ok: r.ok, data: await r.json().catch(() => null) });
  }
  if (path === '/api/admin/notify-test' && M === 'POST') { await notify(env, '✅ ทดสอบแจ้งเตือนจาก AstraCode'); return json({ ok: true }); }
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
  if (path === '/api/admin/audit') return json((await DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()).results);
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
