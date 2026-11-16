import { BKK, DAY, err, json, unlimit } from './core.js';
import { SSE, callModel, ensureImgTable, runChat } from './ai.js';
import { event, getSetting, mail, mailBox, notify, origin, walletAdd } from './billing.js';
import { admin } from './admin.js';
import { slug } from './api.js';
// ---------- งานอัตโนมัติ (Cron ทุกชั่วโมง) ----------
export async function cron(env) {
  const DB = env.DB, now = Date.now(), log = [];
  // 1) ต่ออายุอัตโนมัติจาก Wallet เมื่อเหลือไม่ถึง 24 ชม.
  for (const u of (await DB.prepare('SELECT u.*,p.price,p.price_year,p.name pname FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.auto_renew=1 AND u.banned=0 AND u.plan_expires BETWEEN ? AND ?').bind(now, now + DAY).all()).results) {
    const year = u.plan_period === 'year' && u.price_year, price = year ? u.price_year : u.price;
    if (u.balance >= price) {
      await walletAdd(env, u.id, -price, 'renew', u.pname);
      await DB.prepare('UPDATE users SET plan_expires=plan_expires+? WHERE id=?').bind((year ? 365 : 30) * DAY, u.id).run();
      await DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?)").bind(u.id, u.plan_id, price, year ? 'year' : 'month', now, now).run();
      await mail(env, u.email, 'AstraCode: ต่ออายุแพลนแล้ว', mailBox('ต่ออายุแพลนแล้ว', `ตัดเงินจาก Wallet ฿${price} ต่ออายุ ${u.pname} เรียบร้อย`)); log.push('renew ' + u.id);
    }
  }
  // 2) เตือนแพลนใกล้หมด (3 วัน) ครั้งเดียวต่อรอบ
  for (const u of (await DB.prepare('SELECT u.id,u.email,u.plan_expires,p.name pname FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.banned=0 AND u.plan_expires BETWEEN ? AND ? AND (u.reminded_at IS NULL OR u.reminded_at<>u.plan_expires)').bind(now, now + 3 * DAY).all()).results) {
    await mail(env, u.email, 'AstraCode: แพลนใกล้หมดอายุ', mailBox('แพลนใกล้หมดอายุ', `${u.pname} จะหมดอายุ ${new Date(u.plan_expires + BKK).toISOString().slice(0, 16).replace('T', ' ')} (เวลาไทย) ต่ออายุได้ที่หน้าแพลน หรือเปิด "ต่ออายุอัตโนมัติจาก Wallet" ในหน้าบัญชี`));
    await DB.prepare('UPDATE users SET reminded_at=plan_expires WHERE id=?').bind(u.id).run();
  }
  // 3) แจ้งเตือนต้นทุนวันนี้เกินกำหนด (วันละครั้ง)
  const lim = +(await getSetting(env, 'cost_alert_daily')), dayStart = Math.floor((now + BKK) / DAY) * DAY - BKK;
  if (lim > 0 && (await getSetting(env, 'cost_alert_day')) !== String(dayStart)) {
    const c = (await DB.prepare('SELECT COALESCE(SUM(cost),0) c FROM usage WHERE created_at>=?').bind(dayStart).first()).c;
    if (c > lim) { await notify(env, `💸 ต้นทุน API วันนี้ ฿${c.toFixed(2)} เกินที่ตั้งไว้ ฿${lim}`); await DB.prepare("INSERT OR REPLACE INTO settings VALUES ('cost_alert_day',?)").bind(String(dayStart)).run(); }
  }
  // 4) สำรองข้อมูลวันละครั้ง (ตี 3 เวลาไทย) เก็บ 14 ชุด
  if (env.SLIPS && new Date(now + BKK).getUTCHours() === 3) await backup(env);
  // 4.5) เช็กสุขภาพโมเดลที่ไม่มีใครใช้ในชั่วโมงที่ผ่านมา (ยิงข้อความสั้นมาก) · แอดมินปิดได้ที่ health_check
  if ((await getSetting(env, 'health_check')) === '1') await healthCheck(env).catch(e => console.log('health', e.message)); // ปิดเป็นค่าเริ่มต้น: ยิงโมเดลจริงทุกชั่วโมงเสียเครดิต upstream
  if (new Date(now + BKK).getUTCHours() === 4) await cleanImages(env).catch(e => console.log('cleanImages', e.message)); // ล้างรูปที่ไม่มีข้อความไหนอ้างถึงแล้ว (วันละครั้ง)
  // 5) ล้างข้อมูลหมดอายุ
  await DB.batch([DB.prepare('DELETE FROM rate WHERE reset<?').bind(now), DB.prepare('DELETE FROM tokens WHERE expires<?').bind(now), DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now), DB.prepare('DELETE FROM events WHERE created_at<?').bind(now - 90 * DAY), DB.prepare('DELETE FROM api_log WHERE created_at<?').bind(now - 30 * DAY)]);
  return log;
}
// ยิงข้อความสั้นๆ ไปโมเดลที่ไม่มีทั้งการใช้งานและ error ในชั่วโมงที่ผ่านมา · ล้มเหลว = บันทึก error (เข้าตัวตัดวงจร/หน้าสถานะ/แจ้งเตือนแอดมิน)
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
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','rate','tokens','_cf_KV','chat_images','slip_blobs','file_versions')").all()).results.map(x => x.name), data = {};
  for (const t of tables) data[t] = (await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results;
  const key = `backup/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await env.SLIPS.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
  const old = (await env.SLIPS.list({ prefix: 'backup/' })).objects.sort((a, b) => a.key < b.key ? 1 : -1).slice(14);
  if (old.length) await env.SLIPS.delete(old.map(o => o.key));
  return key;
}

// ---------- หน้าสถานะระบบ ----------
export async function status(env) {
  const now = Date.now(), from = now - 30 * DAY, day = c => `CAST((${c}+${BKK})/${DAY} AS INTEGER)`;
  const [models, ok, bad, recent] = await Promise.all([
    env.DB.prepare('SELECT id,name FROM models WHERE active=1 AND public=1 ORDER BY sort').all(),
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
    const send = async o => { this.ev.push(o); this.wake.splice(0).forEach(r => r()); };
    try { await runChat(this.env, J, send, this.st); }
    catch (e) { console.log('run', e.message); await unlimit(this.env, J.lock).catch(() => {}); await send({ error: 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' }); await send({ done: true }); }
    this.done = true; this.wake.splice(0).forEach(r => r());
  }
}
