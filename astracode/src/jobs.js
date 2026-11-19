import { BKK, DAY, SYSTEM, allowedModels, ensureCols, err, esc, json, limited, planOf, unlimit, usageStatus } from './core.js';
import { SSE, callModel, ensureImgTable, logUsage, runChat, smartSearch, withSources } from './ai.js';
import { reapAgentJobs, runAgent } from './agent.js';
import { sendPush } from './push.js';
import { event, getSetting, mail, mailBox, notify, origin, priceOf, siteUrl, walletAdd } from './billing.js';
import { admin } from './admin.js';
import { runBatches, slug } from './api.js';
// ---------- งานอัตโนมัติ (Cron ทุกชั่วโมง) ----------
// KPI ของวันก่อนหน้า (ตามเวลาไทย) สำหรับแจ้งแอดมิน
export async function kpiYesterday(env, now = Date.now()) {
  const day = Math.floor((now + BKK) / DAY) - 1, a = day * DAY - BKK, b = a + DAY, q = (sql, ...x) => env.DB.prepare(sql).bind(...x).first();
  const [su, rev, cost, top, act] = await Promise.all([q('SELECT COUNT(*) n FROM users WHERE created_at>=? AND created_at<?', a, b), q("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status='approved' AND slip_key NOT IN ('wallet','coupon') AND COALESCE(approved_at,created_at)>=? AND COALESCE(approved_at,created_at)<?", a, b),
    q('SELECT COALESCE(SUM(cost),0) n FROM usage WHERE created_at>=? AND created_at<?', a, b), q('SELECT m.name, COUNT(*) n FROM usage s JOIN models m ON m.id=s.model_id WHERE s.created_at>=? AND s.created_at<? GROUP BY s.model_id ORDER BY n DESC LIMIT 1', a, b), q('SELECT COUNT(DISTINCT user_id) n FROM usage WHERE created_at>=? AND created_at<?', a, b)]);
  const r = { day, signups: su.n, revenue: rev.n, cost: cost.n, active: act.n, top: top?.name || '-' };
  r.text = `📊 สรุปเมื่อวาน: สมัครใหม่ ${r.signups} · ผู้ใช้ที่ใช้งาน ${r.active} · รายได้ ฿${r.revenue.toFixed(0)} · ต้นทุน ฿${r.cost.toFixed(2)} · กำไรขั้นต้น ฿${(r.revenue - r.cost).toFixed(0)} · ใช้มากสุด ${r.top}`;
  return r;
}
export async function cron(env) {
  const DB = env.DB, now = Date.now(), log = [];
  await ensureCols(env).catch(() => {}); // cron ไม่ผ่านเส้นทาง /api จึงต้องให้คอลัมน์ใหม่มีก่อนใช้
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('cron ' + name, e.message); log.push('ERR ' + name); } }; // ขั้นหนึ่งพัง ขั้นอื่นต้องไปต่อ (โดยเฉพาะสำรองข้อมูลและล้างข้อมูลเก่า)
  // 1) ต่ออายุอัตโนมัติจาก Wallet เมื่อเหลือไม่ถึง 24 ชม.
  await step('renew', async () => { for (const u of (await DB.prepare('SELECT u.*,p.price,p.price_year,p.name pname,p.days pdays FROM users u JOIN plans p ON p.id=u.plan_id WHERE COALESCE(p.once,0)=0 AND u.auto_renew=1 AND u.banned=0 AND u.plan_expires BETWEEN ? AND ?').bind(now, now + DAY).all()).results) {
    const year = u.plan_period === 'year' && u.price_year, price = year ? u.price_year : u.price;
    // หักเงินกับขยายวันใน statement เดียว (atomic) · เงื่อนไขช่วง plan_expires ทำให้รันซ้ำ/cron ซ้อนกันก็หักได้ครั้งเดียว เพราะหลังขยายแล้วหลุดช่วง
    const took = u.balance >= price && await DB.prepare('UPDATE users SET balance=ROUND(balance-?1,4), plan_expires=plan_expires+?2 WHERE id=?3 AND balance>=?1 AND plan_expires BETWEEN ?4 AND ?5 RETURNING balance').bind(price, (year ? 365 : u.pdays || 30) * DAY, u.id, now, now + DAY).first();
    if (took) {
      await DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -price, took.balance, 'renew', u.pname, now).run();
      await DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?)").bind(u.id, u.plan_id, price, year ? 'year' : 'month', now, now).run();
      await mail(env, u.email, 'AstraCode: ต่ออายุแพลนแล้ว', mailBox('ต่ออายุแพลนแล้ว', `ตัดเงินจาก Wallet ฿${price} ต่ออายุ ${u.pname} เรียบร้อย`)); log.push('renew ' + u.id);
    }
  } });
  // ค่าใช้จ่ายผิดปกติ: ต้นทุนวันนี้ (24 ชม.) เกิน 5 เท่าของเฉลี่ยรายวัน 7 วันก่อนหน้า และเกิน ฿20 → แจ้งแอดมิน คนละครั้งต่อวัน
  await step('anomaly', async () => {
    const rows = (await DB.prepare(`SELECT u.id, u.email, SUM(CASE WHEN s.created_at>?1 THEN s.cost END) today, SUM(CASE WHEN s.created_at<=?1 THEN s.cost END) / 7.0 avg
      FROM usage s JOIN users u ON u.id=s.user_id WHERE s.created_at>?2 AND u.role<>'admin' GROUP BY u.id HAVING today > 20 AND today > 5 * COALESCE(avg, 0)`).bind(now - DAY, now - 8 * DAY).all()).results;
    for (const r of rows) if (!await limited(env, 'anom:' + r.id, 1, DAY)) await notify(env, `⚠️ ค่าใช้จ่ายผิดปกติ: ${r.email} ใช้ต้นทุน ฿${r.today.toFixed(2)} ใน 24 ชม. (เฉลี่ยเดิม ฿${(r.avg || 0).toFixed(2)}/วัน) ตรวจ API key หรือบัญชีที่หลังบ้าน`);
  });
  // สรุป KPI เมื่อวานให้แอดมิน (8 โมงเช้าไทย): สมัครใหม่, รายได้, ต้นทุน, กำไร, โมเดลยอดนิยม
  if (new Date(now + BKK).getUTCHours() === 8) await step('kpi', async () => { const k = await kpiYesterday(env, now); if (!await limited(env, 'kpi:' + k.day, 1, 2 * DAY)) await notify(env, k.text); });
  // ดึงคนกลับ (10 โมงเช้าไทย): ผู้ใช้ที่เคยใช้งานแต่หายไป 14 วัน → อีเมลบอกของใหม่ + เครดิต (winback_credit บาท, 0 = ไม่แจก) · คนละครั้งต่อ 60 วัน
  await step('batch', () => runBatches(env)); // Batch API: งานค้างประมวลผลทุกชั่วโมง
  // เตือนแอดมินเมื่อราคาขายต่ำกว่าต้นทุน (เช่นต้นทางขึ้นราคาแต่ยังไม่ได้แก้ราคาขาย) วันละครั้ง
  if (new Date(now + BKK).getUTCHours() === 9) await step('margin', async () => { const bad = await lossModels(env); if (bad.length && !await limited(env, 'margin:' + Math.floor((now + BKK) / DAY), 1, 2 * DAY)) await notify(env, '⚠️ ราคาขายต่ำกว่าต้นทุน (ขาดทุนทุกครั้งที่ใช้):\n' + bad.map(x => `• ${x.name}: ${x.parts.join(', ')}`).join('\n')); });
  if (new Date(now + BKK).getUTCHours() === 10) await step('winback', async () => {
    const credit = +(await getSetting(env, 'winback_credit')) || 0;
    const rows = (await DB.prepare("SELECT u.id,u.email FROM users u WHERE u.banned=0 AND u.email_verified=1 AND COALESCE(u.digest_off,0)=0 AND (SELECT MAX(created_at) FROM usage s WHERE s.user_id=u.id) BETWEEN ?1 AND ?2 LIMIT 50").bind(now - 15 * DAY, now - 14 * DAY).all()).results;
    for (const r of rows) {
      if (await limited(env, 'winback:' + r.id, 1, 60 * DAY)) continue;
      if (credit > 0) await walletAdd(env, r.id, credit, 'winback', 'ดึงกลับ');
      await mail(env, r.email, 'AstraCode: คิดถึงนะ มีของใหม่รออยู่', mailBox('กลับมาลองของใหม่กัน', `ช่วงที่ผ่านมาเราเพิ่มโมเดลใหม่ ระบบทีม Agent ในโหมด Code และโหมดสร้างภาพที่ AI ช่วยเขียน prompt${credit > 0 ? `<br><br>เราเติมเครดิต <b>฿${credit}</b> เข้า Wallet ให้แล้ว ใช้กับโมเดลไหนก็ได้` : ''}`, 'เปิด AstraCode', siteUrl(env) + '/chat')).catch(() => {});
    }
  });
  // 2) เตือนแพลนใกล้หมด (3 วัน) ครั้งเดียวต่อรอบ
  await step('remind', async () => { for (const u of (await DB.prepare('SELECT u.id,u.email,u.plan_expires,p.name pname FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.banned=0 AND u.plan_expires BETWEEN ? AND ? AND (u.reminded_at IS NULL OR u.reminded_at<>u.plan_expires)').bind(now, now + 3 * DAY).all()).results) {
    await mail(env, u.email, 'AstraCode: แพลนใกล้หมดอายุ', mailBox('แพลนใกล้หมดอายุ', `${u.pname} จะหมดอายุ ${new Date(u.plan_expires + BKK).toISOString().slice(0, 16).replace('T', ' ')} (เวลาไทย) ต่ออายุได้ที่หน้าแพลน หรือเปิด "ต่ออายุอัตโนมัติจาก Wallet" ในหน้าบัญชี`));
    await DB.prepare('UPDATE users SET reminded_at=plan_expires WHERE id=?').bind(u.id).run();
  } });
  // 3) แจ้งเตือนต้นทุนวันนี้เกินกำหนด (วันละครั้ง)
  await step('alerts', async () => {
  const lim = +(await getSetting(env, 'cost_alert_daily')), dayStart = Math.floor((now + BKK) / DAY) * DAY - BKK;
  if (lim > 0 && (await getSetting(env, 'cost_alert_day')) !== String(dayStart)) {
    const c = (await DB.prepare('SELECT COALESCE(SUM(cost),0) c FROM usage WHERE created_at>=?').bind(dayStart).first()).c;
    if (c > lim) { await notify(env, `💸 ต้นทุน API วันนี้ ฿${c.toFixed(2)} เกินที่ตั้งไว้ ฿${lim}`); await DB.prepare("INSERT OR REPLACE INTO settings VALUES ('cost_alert_day',?)").bind(String(dayStart)).run(); }
  }
  // 3.2) เครดิตที่ผู้ให้บริการใกล้หมด (จากยอดที่แอดมินกรอกในหน้าต้นทุนสด): เหลือต่ำกว่าที่ตั้ง หรือพอใช้ไม่ถึง 2 วัน → แจ้งวันละครั้งต่อ key
  let kf = {}; try { kf = JSON.parse((await getSetting(env, 'key_funds')) || '{}'); } catch { /* ค่าเสีย */ }
  for (const [k, f] of Object.entries(kf)) {
    if (!f?.at) continue;
    const ks = f.keys?.length ? f.keys : [k];
    const r = await DB.prepare(`SELECT COALESCE(SUM(CASE WHEN g.created_at>? THEN g.cost END),0) after, COALESCE(SUM(CASE WHEN g.created_at>? THEN g.cost END),0) d3 FROM usage g JOIN models m ON m.id=g.model_id WHERE m.key_name IN (${ks.map(() => '?').join(',')})`).bind(f.at, now - 3 * DAY, ...ks).first();
    const rate = f.rate || 1, left = f.credits - r.after * rate, days = r.d3 > 0 ? left / rate / (r.d3 / 3) : Infinity;
    if ((left <= (f.low ?? 0) || days < 2) && !await limited(env, 'kf:' + k, 1, DAY)) await notify(env, `🪫 ${k}: เครดิตที่ผู้ให้บริการเหลือประมาณ ${left.toFixed(0)} (พอใช้ ~${isFinite(days) ? days.toFixed(1) : '-'} วัน) เติมแล้วกรอกยอดใหม่ที่ หลังบ้าน → ต้นทุนสด`);
  }
  // 3.5) โมเดลที่ error ตั้งแต่ 10 ครั้งในชั่วโมงที่ผ่านมา: สรุปแจ้งแอดมิน (cron รายชั่วโมง = แจ้งไม่เกินชั่วโมงละครั้ง)
  const spike = (await DB.prepare("SELECT e.model_id, md.name, COUNT(*) n FROM events e LEFT JOIN models md ON md.id=e.model_id WHERE e.kind='error' AND e.created_at>? GROUP BY e.model_id HAVING n>=10 ORDER BY n DESC").bind(now - 3600e3).all()).results;
  if (spike.length) await notify(env, '🔥 error พุ่งในชั่วโมงที่ผ่านมา: ' + spike.map(s => `${s.name || 'ระบบ'} ${s.n} ครั้ง`).join(' · ') + ' (เช็คคีย์/เครดิต upstream)');
  });
  await runTasks(env, now).catch(e => console.log('tasks', e.message));
  await reapAgentJobs(env).catch(e => console.log('agent reap', e.message));
  await import('./cloud.js').then(m => m.reapCloud(env)).catch(e => console.log('cloud reap', e.message));
  // สลิปค้างรออนุมัติเกิน 2 ชม.: เตือนแอดมินไม่เกินทุก 6 ชม. (ลูกค้าจ่ายแล้วรออยู่)
  const pend = await DB.prepare("SELECT COUNT(*) n, MIN(created_at) first FROM payments WHERE status='pending' AND created_at<?").bind(now - 2 * 3600e3).first();
  if (pend.n > 0 && now - (+(await getSetting(env, 'pend_alert_at')) || 0) > 6 * 3600e3) {
    await notify(env, `🧾 มีสลิปค้างรออนุมัติ ${pend.n} รายการ (เก่าสุด ${Math.round((now - pend.first) / 3600e3)} ชม.) · หน้าแอดมิน → ชำระเงิน`);
    await DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('pend_alert_at',?)").bind(String(now)).run();
  }
  // 4) สำรองข้อมูลวันละครั้ง (ตี 3 เวลาไทย) เก็บ 14 ชุด
  if (env.SLIPS && new Date(now + BKK).getUTCHours() === 3) await step('backup', async () => { try { await backup(env); } catch (e) { await notify(env, '⚠️ สำรองข้อมูลรายวันล้มเหลว: ' + String(e.message).slice(0, 200)); throw e; } });
  // 4.2) ไม่มีไฟล์สำรองใหม่เกิน 2 วัน (cron ไม่รัน / R2 มีปัญหา): เตือนแอดมินวันละครั้ง
  if (env.SLIPS) await step('backup-stale', async () => {
    const last = (await env.SLIPS.list({ prefix: 'backup/' })).objects.reduce((a, o) => Math.max(a, +new Date(o.uploaded)), 0);
    if (now - last > 2 * DAY && now - (+(await getSetting(env, 'backup_alert_at')) || 0) > DAY) { await notify(env, `🗄️ ไม่มีไฟล์สำรองข้อมูลใหม่มา ${last ? Math.floor((now - last) / DAY) + ' วัน' : 'เลย'} · หลังบ้าน → ระบบ → Back up now`); await DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('backup_alert_at',?)").bind(String(now)).run(); }
  });
  // 4.3) สรุปการใช้รายเดือนทางอีเมล: วันที่ 1 ตั้งแต่ 10 โมง (เวลาไทย) ทีละ 40 คนต่อชั่วโมง จำคนล่าสุดไว้ไม่ส่งซ้ำ
  await step('digest', () => monthlyDigest(env, now));
  // 4.5) เช็กสุขภาพโมเดลที่ไม่มีใครใช้ในชั่วโมงที่ผ่านมา (ยิงข้อความสั้นมาก) · แอดมินปิดได้ที่ health_check
  if ((await getSetting(env, 'health_check')) === '1') await healthCheck(env).catch(e => console.log('health', e.message)); // ปิดเป็นค่าเริ่มต้น: ยิงโมเดลจริงทุกชั่วโมงเสียเครดิต upstream
  if (new Date(now + BKK).getUTCHours() === 4) await cleanImages(env).catch(e => console.log('cleanImages', e.message)); // ล้างรูปที่ไม่มีข้อความไหนอ้างถึงแล้ว (วันละครั้ง)
  // 5) ล้างข้อมูลหมดอายุ
  await DB.batch([DB.prepare('DELETE FROM rate WHERE reset<?').bind(now), DB.prepare('DELETE FROM tokens WHERE expires<?').bind(now), DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now), DB.prepare('DELETE FROM events WHERE created_at<?').bind(now - 90 * DAY), DB.prepare('DELETE FROM api_log WHERE created_at<?').bind(now - 30 * DAY),
    DB.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE deleted_at<?)').bind(now - 30 * DAY), DB.prepare('DELETE FROM chats WHERE deleted_at<?').bind(now - 30 * DAY)]); // ถังขยะเก็บ 30 วัน
  return log;
}
// ยิงข้อความสั้นๆ ไปโมเดลที่ไม่มีทั้งการใช้งานและ error ในชั่วโมงที่ผ่านมา · ล้มเหลว = บันทึก error (เข้าตัวตัดวงจร/หน้าสถานะ/แจ้งเตือนแอดมิน)
// งานตั้งเวลาของผู้ใช้: ถึงชั่วโมงที่ตั้ง (เวลาไทย) และวันนี้ยังไม่รัน → ให้โมเดลประหยัดสุดในแพลนทำ (หักลิมิตตามจริง) ส่งอีเมล + เก็บเป็นแชตใหม่
export async function runTasks(env, now = Date.now()) {
  const hour = new Date(now + BKK).getUTCHours(), day = Math.floor((now + BKK) / DAY);
  const due = (await env.DB.prepare('SELECT t.*, u.email FROM tasks t JOIN users u ON u.id=t.user_id WHERE t.hour<=? AND (t.last_day IS NULL OR t.last_day<?) AND u.banned=0 ORDER BY t.hour LIMIT 20').bind(hour, day).all()).results;
  const started = Date.now(), runOne = async t => {
    await env.DB.prepare('UPDATE tasks SET last_day=? WHERE id=?').bind(day, t.id).run(); // จองก่อนรัน กันรันซ้ำถ้างานล้มกลางทาง
    try {
      const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(t.user_id).first(), plan = await planOf(env, u);
      if (!(plan?.price > 0)) return;
      const st = await usageStatus(env, u, plan); if (st.pct4h >= 100 || st.pctWeek >= 100) return; // ลิมิตเต็ม ข้ามวันนี้
      const pick = (await allowedModels(env, plan.id)).filter(m => m.provider !== 'image').sort((a, b) => a.multiplier - b.multiplier)[0]; if (!pick) return;
      const m = await env.DB.prepare('SELECT * FROM models WHERE id=?').bind(pick.id).first(), hist = [{ role: 'user', content: t.prompt }];
      const sources = t.search ? await smartSearch(env, u, hist) : [];
      let out = '', usage = null; const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 120e3);
      try { for await (const e of callModel(env, m, [{ role: 'user', content: withSources(t.prompt, sources) }], { effort: null, system: SYSTEM, maxTokens: 2000, userId: u.id, signal: ac.signal })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; } } finally { clearTimeout(timer); }
      if (usage) await logUsage(env, u.id, m, usage, { plan, src: 'task' });
      if (!out.trim()) return;
      const c = await env.DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, ('⏰ ' + t.prompt).slice(0, 40), now).first();
      await env.DB.batch([env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(c.id, 'user', t.prompt, m.id, now),
        env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,sources) VALUES (?,?,?,?,?,?)').bind(c.id, 'assistant', out, m.id, now + 1, sources.length ? JSON.stringify(sources.map(({ title, url }) => ({ title, url }))) : null)]);
      await sendPush(env, u.id, { title: 'งานตั้งเวลา: ' + t.prompt.slice(0, 40), body: out.replace(/[#*`>_]/g, '').slice(0, 160), url: '/chat?id=' + c.id });
      await mail(env, t.email, 'AstraCode: ' + t.prompt.slice(0, 60), mailBox('งานตั้งเวลาของคุณ', esc(out.slice(0, 6000)).replace(/\n/g, '<br>'), 'เปิดในแชต', siteUrl(env) + '/chat?id=' + c.id));
    } catch (e) { console.log('task', t.id, e.message); }
  };
  // ทีละ 3 งานพร้อมกัน และไม่เริ่มงานใหม่หลัง 8 นาที (cron มีเพดาน 15 นาที) · งานที่ยังไม่ได้เริ่มไม่ถูกจองวัน จึงไปต่อรอบชั่วโมงถัดไป (hour<=ตอนนี้ = ตามให้ทัน)
  for (let i = 0; i < due.length && Date.now() - started < 480e3; i += 3) await Promise.all(due.slice(i, i + 3).map(runOne));
  return due.length;
}
export async function healthCheck(env) {
  const now = Date.now(), ms = (await env.DB.prepare("SELECT * FROM models WHERE active=1 AND provider NOT IN ('image','embedding') ORDER BY id LIMIT 12").all()).results;
  for (const m of ms) {
    if (!env[m.key_name]) continue;
    const r = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM usage WHERE model_id=?1 AND created_at>?2) u, (SELECT COUNT(*) FROM events WHERE model_id=?1 AND created_at>?2) e').bind(m.id, now - 3000e3).first();
    if (r.u || r.e) continue;
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 25e3);
    try {
      let got = false;
      for await (const e of callModel(env, m, [{ role: 'user', content: 'hi' }], { system: 'Reply with one word.', maxTokens: 16, signal: ac.signal })) if (e.t || e.th || e.tc) { got = true; break; }
      if (!got) throw new Error('empty reply');
    } catch (x) { await event(env, 'error', m.id, 'health check: ' + String(x.message).slice(0, 200)); }
    finally { clearTimeout(to); }
  }
}
// รูปแชตที่ไม่มีข้อความไหนอ้างถึงแล้ว (เก่ากว่า 7 วัน): ลบจาก D1 และ R2
export const IMG_KEEP_DAYS = 30;
export async function cleanImages(env) { // รูปในแชตเก็บ 30 วัน: เก่ากว่านั้นลบทิ้ง (ข้อความยังอยู่ แต่รูปจะหาย)
  const cut = Date.now() - IMG_KEEP_DAYS * DAY;
  await ensureImgTable(env);
  await env.DB.prepare('DELETE FROM chat_images WHERE created_at<?').bind(cut).run();
  if (!env.SLIPS) return;
  let cursor;
  for (let page = 0; page < 10; page++) { // R2 ลิสต์ทีละ 1000 · วันละไม่เกิน 10 หน้า ที่เหลือลบรอบถัดไป
    const l = await env.SLIPS.list({ prefix: 'img/', limit: 1000, cursor });
    const old = l.objects.filter(o => !(o.uploaded?.getTime?.() > cut)).map(o => o.key);
    if (old.length) await env.SLIPS.delete(old);
    if (!l.truncated) break; cursor = l.cursor;
  }
}
export async function backup(env) {
  // shortcut: ทั้งชุดเป็นไฟล์ JSON ก้อนเดียวในหน่วยความจำ (Worker ~128MB) ถ้าตารางใหญ่ถึงหลายสิบ MB ให้แยกไฟล์ต่อตาราง/แบ่งหน้า · api_log/events ข้าม (ล้างเองทุก 30/90 วัน)
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','rate','tokens','_cf_KV','chat_images','slip_blobs','file_versions','api_log','events')").all()).results.map(x => x.name), data = {};
  for (const t of tables) data[t] = (await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results;
  const key = `backup/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await env.SLIPS.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
  const old = (await env.SLIPS.list({ prefix: 'backup/' })).objects.sort((a, b) => a.key < b.key ? 1 : -1).slice(14);
  if (old.length) await env.SLIPS.delete(old.map(o => o.key));
  return key;
}

export async function monthlyDigest(env, now = Date.now(), batch = 40) {
  const t = new Date(now + BKK); if (t.getUTCDate() !== 1 || t.getUTCHours() < 10) return 0;
  const start = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1) - BKK, end = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - BKK, month = new Date(start + BKK).toISOString().slice(0, 7);
  const cur = String(await getSetting(env, 'digest_cursor') || ''), after = cur.startsWith(month + ':') ? +cur.split(':')[1] : 0;
  const users = (await env.DB.prepare(`SELECT u.id,u.email,p.name pname,p.price FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.id>? AND u.banned=0 AND COALESCE(u.digest_off,0)=0 AND u.plan_expires>? AND p.price>0 AND EXISTS (SELECT 1 FROM usage g WHERE g.user_id=u.id AND g.created_at>=? AND g.created_at<?) ORDER BY u.id LIMIT ?`).bind(after, now, start, end, batch).all()).results;
  const models = new Map((await env.DB.prepare('SELECT * FROM models').all()).results.map(m => [m.id, m]));
  for (const u of users) {
    const rows = (await env.DB.prepare('SELECT model_id, COUNT(*) n, SUM(tokens_in) tin, SUM(tokens_out) tout, SUM(tokens_cache) tc FROM usage WHERE user_id=? AND created_at>=? AND created_at<? GROUP BY model_id ORDER BY n DESC').bind(u.id, start, end).all()).results;
    let payg = 0; const lines = [];
    for (const r of rows) { const m = models.get(r.model_id); if (!m) continue; const p = await priceOf(env, m); payg += p.req > 0 ? p.req * r.n : (r.tin * p.in + r.tout * p.out + r.tc * p.cache) / 1e6; lines.push(`${esc(m.name)} · ${r.n.toLocaleString('th-TH')} ครั้ง`); }
    const total = rows.reduce((a, r) => a + r.n, 0), save = payg - u.price;
    await mail(env, u.email, `AstraCode: สรุปการใช้งานเดือน ${month}`, mailBox(`สรุปเดือน ${month}`, `แพลน ${esc(u.pname)} · ใช้ AI ไป <b>${total.toLocaleString('th-TH')}</b> ครั้ง<br><br>${lines.slice(0, 5).join('<br>')}<br><br>ถ้าจ่ายตามใช้จะเป็นประมาณ <b>฿${payg.toFixed(2)}</b>${save > 0 ? ` · แพลนช่วยประหยัด <b>฿${save.toFixed(2)}</b>` : ''}<br><br><small>ปิดอีเมลนี้ได้ที่หน้าบัญชี</small>`, 'ดูการใช้งาน', siteUrl(env) + '/account')).catch(() => {});
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('digest_cursor',?)").bind(month + ':' + u.id).run();
  }
  return users.length;
}

// ตรวจไฟล์สำรองล่าสุด: อ่าน JSON ได้ไหม มีตารางครบไหม จำนวนแถวใกล้เคียงฐานข้อมูลจริงไหม (ไม่กู้คืน ไม่เขียนอะไร)
export async function verifyBackup(env) {
  if (!env.SLIPS) return { ok: false, error: 'ไม่ได้ผูก R2' };
  const last = (await env.SLIPS.list({ prefix: 'backup/' })).objects.sort((a, b) => a.key < b.key ? 1 : -1)[0]; if (!last) return { ok: false, error: 'ยังไม่มีไฟล์สำรอง' };
  let data; try { data = await (await env.SLIPS.get(last.key)).json(); } catch (e) { return { ok: false, key: last.key, error: 'อ่านไฟล์ไม่ได้: ' + e.message }; }
  const tables = [];
  for (const [t, rows] of Object.entries(data)) { const live = (await env.DB.prepare(`SELECT COUNT(*) n FROM "${t}"`).first().catch(() => null))?.n; tables.push({ table: t, backup: rows.length, live: live ?? null }); }
  const missing = tables.filter(x => x.live === null).map(x => x.table), short = tables.filter(x => x.live != null && x.backup > x.live).map(x => x.table);
  return { ok: !missing.length, key: last.key, at: last.uploaded, size: last.size, tables, missing, note: short.length ? 'ตารางที่ไฟล์สำรองมีแถวมากกว่าตอนนี้ (มีการลบหลังสำรอง): ' + short.join(', ') : '' };
}

// ---------- หน้าสถานะระบบ ----------
export async function status(env) {
  const now = Date.now(), from = now - 30 * DAY, day = c => `CAST((${c}+${BKK})/${DAY} AS INTEGER)`;
  const [models, ok, bad, recent] = await Promise.all([
    env.DB.prepare('SELECT id,name,key_name FROM models WHERE active=1 AND public=1 ORDER BY sort').all().then(r => ({ results: r.results.filter(m => env[m.key_name]) })), // โมเดลที่ยังไม่มีคีย์ไม่ได้เปิดขาย จึงไม่นับเป็น "ปกติ"
    env.DB.prepare(`SELECT model_id, ${day('created_at')} d, COUNT(*) n FROM usage WHERE created_at>=? GROUP BY model_id, d`).bind(from).all(),
    env.DB.prepare(`SELECT model_id, ${day('created_at')} d, COUNT(*) n, MAX(created_at) last FROM events WHERE kind='error' AND created_at>=? GROUP BY model_id, d`).bind(from).all(),
    env.DB.prepare("SELECT model_id, COUNT(*) n FROM events WHERE kind='error' AND created_at>? GROUP BY model_id").bind(now - 300e3).all(),
  ]);
  const today = Math.floor((now + BKK) / DAY);
  return { updated: now, models: models.results.map(m => {
    const days = Array.from({ length: 30 }, (_, i) => { const d = today - 29 + i, o = ok.results.find(x => x.model_id === m.id && x.d === d)?.n || 0, e = bad.results.find(x => x.model_id === m.id && x.d === d)?.n || 0; return { d: d * DAY, ok: o, err: e }; });
    const last = Math.max(0, ...bad.results.filter(x => x.model_id === m.id).map(x => x.last)), n5 = recent.results.find(x => x.model_id === m.id)?.n || 0;
    const o = days.reduce((a, x) => a + x.ok, 0), e = days.reduce((a, x) => a + x.err, 0);
    return { name: m.name, uptime: o + e ? Math.round(o / (o + e) * 1000) / 10 : 100, down: now - last < 900e3, state: n5 >= 3 ? 'down' : now - last < 900e3 ? 'degraded' : 'ok', days }; // down = ผิดพลาด ≥3 ครั้งใน 5 นาที (ระบบสลับไปโมเดลสำรองเอง) · degraded = มี error ใน 15 นาที
  }) };
}

// ---------- SEO: robots, sitemap, meta ของบทความ ----------
export function robots(req, env) { return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /account\n\nSitemap: ${origin(req, env)}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } }); }
export async function sitemap(req, env) {
  const base = origin(req, env), posts = (await env.DB.prepare('SELECT slug,created_at FROM posts WHERE published=1').all()).results;
  const urls = ['/', '/pricing', '/plans', '/developers', '/blog', '/status', '/terms'].map(p => `<url><loc>${base}${p}</loc></url>`)
    .concat(posts.map(p => `<url><loc>${base}/blog/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.created_at).toISOString().slice(0, 10)}</lastmod></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
}
export async function blogPage(req, env, slugQ) { // ใส่ title/description/og ของบทความลงหน้า HTML ให้ Google และ social เห็น
  const res = await env.ASSETS.fetch(new Request(new URL('/blog', req.url), req)); // /blog.html จะถูก redirect
  const p = await env.DB.prepare('SELECT title,summary,cover FROM posts WHERE slug=? AND published=1').bind(slugQ).first();
  if (!p) return res;
  const set = (sel, attr, v) => ({ element(e) { e.setAttribute(attr, v); } });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(p.title + ' · AstraCode'); } })
    .on('meta[name="description"]', set(0, 'content', p.summary || p.title))
    .on('meta[property="og:title"]', set(0, 'content', p.title))
    .on('meta[property="og:description"]', set(0, 'content', p.summary || p.title))
    .on('meta[property="og:image"]', p.cover ? set(0, 'content', p.cover.startsWith('/') ? origin(req, env) + p.cover : p.cover) : {})
    .on('meta[property="og:type"]', set(0, 'content', 'article'))
    .on('link[rel="canonical"]', set(0, 'href', `${origin(req, env)}/blog/${encodeURIComponent(slugQ)}`))
    .transform(new Response(res.body, res));
}

// Durable Object: ทำงานตอบแชตต่อจนเสร็จ แม้ผู้ใช้ปิดจอ (ใช้ alarm เพราะไม่ถูกตัดตามคำขอ) · เก็บ event ไว้ในหน่วยความจำให้ต่อสตรีมกลับมาดูได้
export class ChatRun {
  constructor(state, env) { this.s = state; this.env = env; this.ev = []; this.done = true; this.wake = []; this.st = { gone: false }; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/start') {
      await this.s.storage.put('job', await req.json());
      this.ev = []; this.done = false; this.st = { gone: false };
      await this.s.storage.setAlarm(Date.now());
      return new Response('ok');
    }
    if (url.pathname === '/stop') { this.st.gone = true; return new Response('ok'); }
    let i = +url.searchParams.get('from') || 0; const enc = new TextEncoder();
    // DO อาจถูกปลุกใหม่หลังเริ่มงาน (ev ว่าง แต่ยังมีงานค้างใน storage) → ต้องรอ ไม่ใช่ปิดสตรีมทันที
    // ไม่งั้นผู้ใช้จะเห็น 200 แต่ไม่มี event เลย = หน้าจอเงียบไม่มีคำตอบ
    if (this.done && !this.ev.length && await this.s.storage.get('job')) this.done = false;
    return new Response(new ReadableStream({ async pull(c) {
      const o = this.o;
      while (i >= o.ev.length && !o.done) await new Promise(r => o.wake.push(r));
      if (i < o.ev.length) c.enqueue(enc.encode('data: ' + JSON.stringify(o.ev[i++]) + '\n\n')); else c.close();
    }, o: this }), SSE);
  }
  async alarm() {
    const J = await this.s.storage.get('job'); if (!J) return;
    await this.s.storage.delete('job'); // alarm ที่ถูกลองซ้ำจะไม่ตอบซ้ำ
    this.done = false;
    if (J.agent_id) { // งาน Agent เบื้องหลัง (ไม่มีสตรีมให้หน้าเว็บ)
      try { await runAgent(this.env, J.agent_id, this.st); } catch (e) { console.log('agent run', e.message); }
      this.done = true; this.wake.splice(0).forEach(r => r()); return;
    }
    const send = async o => { this.ev.push(o); this.wake.splice(0).forEach(r => r()); };
    try { await runChat(this.env, J, send, this.st); }
    catch (e) { console.log('run', e.message); await unlimit(this.env, J.lock).catch(() => {}); await send({ error: 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' }); await send({ done: true }); }
    this.done = true; this.wake.splice(0).forEach(r => r());
  }
}

// โมเดลที่ราคาขาย (หลังโปร) ต่ำกว่าต้นทุนในช่องใดช่องหนึ่ง · คืน [{ id, name, parts: ['input ฿x < ทุน ฿y', ...] }]
export async function lossModels(env) {
  const out = [];
  for (const m of (await env.DB.prepare("SELECT * FROM models WHERE active=1 AND provider<>'embedding'").all()).results) {
    const p = await priceOf(env, m), parts = [];
    for (const [k, c, l] of [['in', 'cost_in', 'input'], ['out', 'cost_out', 'output'], ['cache', 'cost_cache', 'cache'], ['write', 'cost_cache_write', 'cache write']]) if (m[c] > 0 && p[k] < m[c] - 1e-9) parts.push(`${l} ฿${p[k]} < ทุน ฿${m[c]}`);
    if (p.req > 0 && m.req_cost > 0 && p.req < m.req_cost) parts.push(`ต่อครั้ง ฿${p.req} < ทุน ฿${m.req_cost}`);
    if (parts.length) out.push({ id: m.id, name: m.name, parts });
  }
  return out;
}
