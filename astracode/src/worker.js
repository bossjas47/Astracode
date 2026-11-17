import { DAY, allowedModels, flat, limitBoost, walletModels, creditList, creditsOf, emailAuth, ensureCols, err, getUser, ip, json, limMult, limited, msgCost, planOf, rand, startSession, usageStatus, viaProxy } from './core.js';
import { bundleProject, chat, compact, ensureFb } from './ai.js';
import { event, getSetting, getSettings, mail, mailBox, notify, origin, pay, priceOf, promoOn, useToken } from './billing.js';
import { gh, github, projects, seal } from './projects.js';
import { admin, adminGate, gateBlock } from './admin.js';
import { agentApi } from './agent.js';
import { contextApi } from './context.js';
import { oauth, totpOk, userRoutes } from './user.js';
import { slug, v1 } from './api.js';
import { pushApi } from './push.js';
import { SHOWCASE_SLUG, seedShowcase } from './showcase.js';
import { passkeyApi, passkeyPublic } from './passkey.js';
import { blogPage, cron, robots, sitemap, status } from './jobs.js';
// ---------- router ----------
// ข้อมูลหน้าราคา: ราคาขายต่อ 1M token (ไม่ส่งราคาทุนออกไป)
const pubCache = new Map();
// รายการโมเดลของแต่ละแพลน (ใช้ใน /api/me ทุกหน้า) แคชในหน่วยความจำ 30 วินาที
const modelCache = new WeakMap(); // แยกตามฐานข้อมูล (env.DB) กันปนกันระหว่าง env
const cachedModels = async (env, planId) => {
  let m = modelCache.get(env.DB); if (!m) modelCache.set(env.DB, m = new Map());
  const hit = m.get(planId); if (hit && hit.exp > Date.now()) return hit.body;
  const body = planId === 'wallet' ? await walletModels(env) : await allowedModels(env, planId); m.set(planId, { exp: Date.now() + 30e3, body }); return body;
};
async function pricingBody(env) {
    const [ms, ps, pm] = await Promise.all([
      env.DB.prepare('SELECT * FROM models WHERE active=1 AND public=1 ORDER BY sort,id').all(),
      env.DB.prepare('SELECT id,name,price,limit_week FROM plans WHERE active=1 ORDER BY sort').all(),
      env.DB.prepare('SELECT * FROM plan_models').all(),
    ]);
    let official = {}; try { official = JSON.parse(await getSetting(env, 'official_prices') || '{}') || {}; } catch { /* ค่าเสีย ไม่แสดงเทียบ */ }
    return {
      note: await getSetting(env, 'price_note'),
      plans: ps.results, // limit_week = งบต้นทุนต่อสัปดาห์ (บาท) ใช้คำนวณ % ในเครื่องคิดเลข
      models: await Promise.all(ms.results.map(async m => {
        const p = await priceOf(env, m), b = await priceOf(env, m, true), on = promoOn(m);
        return { id: m.id, name: m.name, provider: m.provider, vision: !!m.vision, effort: m.effort !== 'none', multiplier: m.multiplier, lim: limMult(m), note: m.note,
          in: p.in, out: p.out, cache: p.cache, cache_write: p.write, req: p.req || null, promo: on ? { pct: m.promo_pct, start: m.promo_start, end: m.promo_end, in: b.in, out: b.out, cache: b.cache, cache_write: b.write } : null,
          official: official[m.id] || null, plans: pm.results.filter(x => x.model_id === m.id).map(x => x.plan_id) };
      })),
    };
}
async function plansBody(env) {
  const plans = (await env.DB.prepare('SELECT id,name,price,price_year,description,limit_week,seats,shared_pool,api_limit FROM plans WHERE active=1 ORDER BY sort').all()).results;
  const [featured, lists] = await Promise.all([getSetting(env, 'featured_plan'), Promise.all(plans.map(p => allowedModels(env, p.id)))]);
  plans.forEach((p, i) => { // ประมาณจำนวนข้อความ/สัปดาห์ ตามต้นทุนจริงของ 1 ข้อความทั่วไป
    p.models = lists[i].map(m => ({ name: m.name, week: Math.floor(p.limit_week / Math.max(msgCost(m), 1e-6)) }));
    p.featured = p.id === +featured;
    delete p.limit_week;
  });
  return plans;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname, M = req.method; let r;
    if (path.startsWith('/api/') || path.startsWith('/v1/')) await ensureCols(env);
    if ((r = path.match(/^\/p\/([a-z0-9][a-z0-9-]{2,39})$/))) { // token 24 ตัว หรือชื่อลิงก์ที่เจ้าของตั้งเอง // โปรเจกต์ที่แชร์: หน้าเว็บอ่านอย่างเดียว รันใน sandbox (ไม่มีคุกกี้/ข้อมูลของเว็บเรา)
      await ensureCols(env);
      if (r[1] === SHOWCASE_SLUG) await seedShowcase(env).catch(e => console.log('showcase', e.message));
      const pr = await env.DB.prepare('SELECT id FROM projects WHERE share_token IS NOT NULL AND (share_token=?1 OR slug=?1)').bind(r[1]).first();
      const rows = pr ? (await env.DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(pr.id).all()).results : [];
      const html = rows.length ? bundleProject(new Map(rows.map(f => [f.path, f.content]))) + '<a href="/support" rel="noopener" style="position:fixed;right:8px;bottom:8px;z-index:2147483647;font:12px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:4px 10px;border-radius:99px;text-decoration:none">รายงานหน้านี้ · Report</a><a href="/code?remix=' + r[1] + '" target="_blank" rel="noopener" style="position:fixed;right:8px;bottom:40px;z-index:2147483647;font:12px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:4px 10px;border-radius:99px;text-decoration:none">Remix ใน AstraCode</a>' : null; // ปุ่มรายงานคงที่ ให้ผู้พบหน้าผิดกฎแจ้งแอดมินได้
      if (!html) return new Response('ไม่พบโปรเจกต์นี้ หรือเจ้าของยกเลิกการแชร์แล้ว', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex', 'content-security-policy': "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'; sandbox allow-scripts allow-modals allow-forms allow-popups", 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
    }
    // Cloudflare อาจ redirect /preview.html → /preview จึงรับทั้งสองแบบ
    if (path === '/preview' || path === '/preview.html' || path === '/pyworker.js') return sandboxed(await env.ASSETS.fetch(req), path === '/pyworker.js' ? path : '/preview.html');
    if (path === '/node-runner' || path === '/node-runner.html') return sandboxed(await env.ASSETS.fetch(req), '/preview.html'); // เทอร์มินัล Node: origin แยกเหมือนหน้าแสดงผล
    if (path.startsWith('/v1/')) return v1(req, env, ctx, path); // API สำหรับนักพัฒนา (แบบ OpenAI)
    if (path === '/robots.txt' || path === '/api/robots') return robots(req, env);
    if (path === '/sitemap.xml' || path === '/api/sitemap') return secure(await sitemap(req, env));
    if ((r = path.match(/^(?:\/api\/page)?\/blog\/([\w-]+)$/))) return secure(await blogPage(req, env, r[1])); // บทความ: ใส่ meta ให้ Google/social
    if (!path.startsWith('/api/')) { // URL สะอาด: ไม่มี .html, หน้าแรกอยู่ที่ / (ไฟล์ home.html)
      const clean = path === '/index.html' || path === '/home' || path === '/home.html' ? '/' : path.endsWith('.html') ? path.slice(0, -5) : null;
      if (clean) return new Response(null, { status: 301, headers: { location: clean + url.search } }); // Location แบบ relative: ผ่าน Vercel แล้วไม่หลุดไปโดเมน workers.dev
      const res = await env.ASSETS.fetch(path === '/' ? new Request(new URL('/home', req.url), req) : req);
      if (res.status === 404 && M === 'GET') return secure(new Response((await env.ASSETS.fetch(new Request(new URL('/404.html', req.url), req))).body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })); // หน้าไม่มีจริง: แสดงหน้าแรก
      return secure(res);
    }
    if (M !== 'GET' && M !== 'HEAD') {
      const o = req.headers.get('origin'); // กัน CSRF: รับคำขอแก้ข้อมูลจากเว็บตัวเองเท่านั้น
      const ok = [url.origin, viaProxy(req, env) && 'https://' + req.headers.get('x-forwarded-host')];
      if (o && !ok.includes(o)) return err('forbidden', 403);
      if (+req.headers.get('content-length') > 12e6) return err('ไฟล์ใหญ่เกินไป', 413);
    }
    return secure(await route(req, env, ctx, url, path, M));
  },
  scheduled(ev, env, ctx) { ctx.waitUntil(cron(env)); }, // Cron Trigger: ทุกชั่วโมง
};

// cdn.jsdelivr.net: ตัวอ่าน PDF/Word/Excel (ล็อกเวอร์ชัน + SRI ใน app.js)
export const CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https://promptpay.io; connect-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
// หน้าแสดงผลโค้ดของผู้ใช้: รันใน iframe sandbox (origin แยก อ่าน cookie / เรียก API ในชื่อผู้ใช้ไม่ได้)
export function sandboxed(res, path) {
  const r = new Response(res.body, res), h = r.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('content-security-policy', path === '/preview.html'
    ? "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'; sandbox allow-scripts allow-modals allow-forms allow-popups"
    : "default-src 'none'; script-src https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-eval'; connect-src https://cdn.jsdelivr.net");
  return r;
}
export function secure(res) {
  const r = new Response(res.body, res), h = r.headers;
  if (!h.has('content-security-policy')) h.set('content-security-policy', CSP);
  h.set('x-content-type-options', 'nosniff');
  h.set('x-frame-options', 'DENY');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('permissions-policy', 'camera=(), microphone=(self), geolocation=()');
  return r;
}

// กันยิงรัวจากคนที่ยังไม่ล็อกอิน: นับในหน่วยความจำของ isolate (ไม่เขียน D1 ทุกคำขอ) · shortcut: ไม่แชร์ข้าม isolate จึงเป็นเพดานหยาบ ถ้าต้องเข้มกว่านี้ใช้ Cloudflare Rate Limiting rule
export const burst = new Map();
export function burstHit(key, max, ms) {
  const now = Date.now(); let e = burst.get(key);
  if (!e || e.t < now) { if (burst.size > 5000) burst.clear(); e = { n: 0, t: now + ms }; burst.set(key, e); }
  return ++e.n > max;
}
export async function route(req, env, ctx, url, path, M) {
  let r;
  if (path === '/api/version') return json({ version: env.VERSION || 'dev' }); // workflow ใช้ยืนยันว่า deploy ขึ้นจริง
  if (path === '/api/clienterr' && M === 'POST') { // error ที่เกิดในเบราว์เซอร์ผู้ใช้ → events (แอดมินดูที่แท็บระบบ)
    if (burstHit('ce:' + ip(req, env), 10, 600e3) || await limited(env, 'ce:' + ip(req, env), 30, 3600e3)) return new Response(null, { status: 204 }); // ในหน่วยความจำ + ในฐานข้อมูล (กันถูกยิงข้าม isolate จนตาราง events บวม)
    const b = await req.json().catch(() => null), s = v => String(v ?? '').replace(/\s+/g, ' ').slice(0, 300);
    if (b?.msg) await event(env, 'client', null, `${s(b.page).slice(0, 80)} · ${s(b.msg)} @ ${s(b.src).slice(0, 160)} · ${s(req.headers.get('user-agent')).slice(0, 90)}`);
    return new Response(null, { status: 204 });
  }
  if (path.startsWith('/api/') && !/(?:^|;\s*)sid=/.test(req.headers.get('cookie') || '') && burstHit('anon:' + ip(req, env), 240, 60e3)) return err('ส่งคำขอถี่เกินไป รอสักครู่', 429);
    try {
      if (path === '/api/settings/public') { // ประกาศ, โหมดปิดปรับปรุง, ปุ่มล็อกอินที่เปิดใช้
        const s = await getSettings(env, ['announcement', 'announcement_level', 'maintenance', 'referral_bonus', 'search_enabled', 'image_enabled', 'topup_min', 'model_icons', 'picker_filter', 'picker_mult', 'picker_logos']);
        return json({ ...s, turnstile: env.TURNSTILE_SECRET ? await getSetting(env, 'turnstile_site') : '', google: !!(env.GOOGLE_CLIENT_ID || await getSetting(env, 'google_client_id')), line: !!env.LINE_CHANNEL_ID, search: !!env.TAVILY_KEY && s.search_enabled !== '0', promo: await limitBoost(env), image: s.image_enabled === '1', mail: !!env.RESEND_KEY });
      }
      if (path === '/api/blog') return json((await env.DB.prepare('SELECT slug,title,summary,cover,created_at FROM posts WHERE published=1 ORDER BY created_at DESC LIMIT 100').all()).results);
      if (path.startsWith('/api/blog/')) { const p = await env.DB.prepare('SELECT slug,title,summary,body,cover,created_at FROM posts WHERE slug=? AND published=1').bind(path.slice(10)).first(); return p ? json(p) : err('ไม่พบบทความ', 404); }
      if (path === '/api/pricing/calc' && M === 'POST') { // เครื่องคิดเลขหน้าราคา: คำนวณฝั่งเซิร์ฟเวอร์ ไม่ส่งราคาทุนออกไป
        if (await limited(env, 'pcalc:' + ip(req, env), 120, 60e3)) return err('คำนวณถี่เกินไป รอสักครู่', 429);
        const b = await req.json(), m = await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1 AND public=1').bind(+b.model_id).first();
        if (!m) return err('ไม่พบโมเดล', 404);
        const num = (v, max) => Math.min(max, Math.max(0, +v || 0)), n = num(b.n, 1e5), i = num(b.i, 2e6), o = num(b.o, 2e6), c = num(b.c, 100) / 100, p = await priceOf(env, m);
        const per1 = p.req > 0 ? p.req : (i * (1 - c) * p.in + i * c * p.cache + o * p.out) / 1e6;
        const weekUnits = n * 7 * (flat(m) ? m.req_cost : (i * (1 - c) * m.cost_in + i * c * m.cost_cache + o * m.cost_out) / 1e6) * limMult(m); // วิธีนับเดียวกับระบบลิมิต: ต้นทุนจริง × ตัวคูณโมเดล
        const pls = (await env.DB.prepare('SELECT p.id, p.limit_week FROM plans p JOIN plan_models pm ON pm.plan_id=p.id WHERE pm.model_id=? AND p.active=1 AND p.limit_week>0').bind(m.id).all()).results;
        return json({ per1, month: per1 * n * 30, plans: pls.map(x => ({ id: x.id, pct: weekUnits / x.limit_week * 100 })) });
      }
      if (path === '/api/status') return json(await status(env));
      if (path === '/api/gallery') { await seedShowcase(env).catch(() => {}); return await projects(req, env, null, path, url); } // ผลงานเด่น: เปิดดูได้โดยไม่ต้องล็อกอิน
      if ((r = path.match(/^\/api\/share\/([a-f0-9]{12,48})$/))) {
        const c = await env.DB.prepare('SELECT id,title,created_at FROM chats WHERE share_token=? AND deleted_at IS NULL').bind(r[1]).first();
        if (!c) return err('ไม่พบแชตที่แชร์ หรือถูกยกเลิกแล้ว', 404);
        const ms = (await env.DB.prepare('SELECT m.role,m.content,m.sources,md.name model FROM messages m LEFT JOIN models md ON md.id=m.model_id WHERE m.chat_id=? ORDER BY m.id').bind(c.id).all()).results;
        return json({ ...c, messages: ms });
      }
      if (path.startsWith('/api/oauth/')) return await oauth(req, env, url, path);
      if (path === '/api/login/mfa' && M === 'POST') { // ขั้นที่ 2 หลังล็อกอิน Google/LINE ของคนที่เปิด 2FA
        const b = await req.json();
        if (await limited(env, 'mfa:' + ip(req, env), 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
        const uid = await useToken(env, b.token, 'mfa'); const u = uid && await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
        if (!u) return err('หมดเวลา ล็อกอินใหม่อีกครั้ง', 401);
        if (!await totpOk(env, u, b.code)) return err('รหัส 2FA ไม่ถูกต้อง', 401);
        return await startSession(env, u.id, req);
      }
      if (path.startsWith('/api/passkey/login')) { const pr = await passkeyPublic(req, env, path); if (pr) return pr; }
      if (path === '/api/auth' && M === 'POST') return await emailAuth(req, env);
      if ((path === '/api/pricing' || path === '/api/plans') && M === 'GET') { // ข้อมูลสาธารณะที่คิดหนัก (หลาย query): เก็บในหน่วยความจำ 30 วินาที แอดมินแก้แล้วเห็นผลภายใน 30 วิ
        const hit = pubCache.get(path);
        if (hit && hit.exp > Date.now()) return new Response(hit.body, { headers: { 'content-type': 'application/json' } });
        const ck = new Request('https://cache.internal' + path), shared = typeof caches !== 'undefined' && caches.default; // แคชร่วมของศูนย์ข้อมูล (ทุก isolate ใช้ร่วมกัน)
        const c = shared && await shared.match(ck).catch(() => null);
        if (c) { const body = await c.text(); pubCache.set(path, { exp: Date.now() + 30e3, body }); return new Response(body, { headers: { 'content-type': 'application/json' } }); }
        const body = JSON.stringify(await (path === '/api/pricing' ? pricingBody : plansBody)(env));
        pubCache.set(path, { exp: Date.now() + 30e3, body });
        if (shared) ctx.waitUntil(shared.put(ck, new Response(body, { headers: { 'cache-control': 'max-age=30' } })).catch(() => {}));
        return new Response(body, { headers: { 'content-type': 'application/json' } });
      }
      const u = await getUser(req, env);
      if (!u || u.banned) return err('กรุณาเข้าสู่ระบบ', 401);
      if (u.role !== 'admin' && !['/api/me', '/api/logout'].includes(path) && (await getSetting(env, 'maintenance')) === '1') return json({ error: 'ระบบปิดปรับปรุงชั่วคราว', maintenance: true }, 503);
      const extra = await userRoutes(req, env, ctx, url, path, M, u); if (extra) return extra;

      if (path === '/api/feedback' && M === 'POST') { // 👍 = 1, 👎 = -1, 0 = ยกเลิก
        const b = await req.json(), vote = +b.vote;
        if (![1, -1, 0].includes(vote)) return err('vote ไม่ถูกต้อง');
        const m = await env.DB.prepare("SELECT m.id,m.model_id FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.id=? AND c.user_id=? AND m.role='assistant'").bind(+b.message_id, u.id).first();
        if (!m) return err('ไม่พบข้อความ', 404);
        await ensureFb(env);
        if (vote) await env.DB.prepare('INSERT INTO feedback VALUES (?,?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET vote=excluded.vote, created_at=excluded.created_at').bind(m.id, u.id, m.model_id, vote, Date.now()).run();
        else await env.DB.prepare('DELETE FROM feedback WHERE message_id=? AND user_id=?').bind(m.id, u.id).run();
        return json({ ok: true });
      }
      if (path === '/api/report' && M === 'POST') { // รายงานคำตอบที่ไม่เหมาะสม → แอดมินดูในหลังบ้านแท็บคุณภาพ
        if (await limited(env, 'report:' + u.id, 20, DAY)) return err('รายงานวันนี้ครบแล้ว', 429);
        const b = await req.json(), m = await env.DB.prepare("SELECT m.id,m.model_id,m.content FROM messages m JOIN chats c ON c.id=m.chat_id WHERE m.id=? AND c.user_id=? AND m.role='assistant'").bind(+b.message_id, u.id).first();
        if (!m) return err('ไม่พบข้อความ', 404);
        await ensureFb(env);
        await env.DB.prepare('INSERT INTO reports (message_id,user_id,model_id,reason,snippet,created_at) VALUES (?,?,?,?,?,?)').bind(m.id, u.id, m.model_id, String(b.reason || '').slice(0, 300), String(m.content || '').replace(/\u2063/g, '').slice(0, 600), Date.now()).run();
        ctx.waitUntil(notify(env, `🚩 มีรายงานคำตอบ AI #${m.id} จาก ${u.email.split('@')[0]}`));
        return json({ ok: true });
      }
      if (path === '/api/usage/export') { // CSV การใช้งานรายวันต่อโมเดล (สูงสุด 365 วัน)
        const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 90)), plan = await planOf(env, u), wk = plan?.limit_week || 0;
        const rows = (await env.DB.prepare("SELECT date((g.created_at+25200000)/1000,'unixepoch') d, COALESCE(m.name,'(รูป/อื่นๆ)') model, COUNT(*) n, SUM(g.tokens_in) tin, SUM(g.tokens_out) tout, SUM(g.tokens_cache) tc, SUM(g.units) units FROM usage g LEFT JOIN models m ON m.id=g.model_id WHERE g.user_id=? AND g.created_at>=? GROUP BY d, g.model_id ORDER BY d DESC, model").bind(u.id, Date.now() - days * DAY).all()).results;
        const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
        const csv = '\ufeffวันที่,โมเดล,ข้อความ,token เข้า,token ออก,token cache,ใช้ลิมิต (% ของงบสัปดาห์)\n' + rows.map(r => [r.d, q(r.model), r.n, r.tin, r.tout, r.tc, wk > 0 ? Math.round(r.units / wk * 1000) / 10 : ''].join(',')).join('\n');
        return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="astracode-usage-${days}d.csv"` } });
      }
      if (path === '/api/sessions') { // อุปกรณ์ที่ล็อกอินอยู่: ดูรายการ / ออกจากระบบเครื่องอื่นทั้งหมด
        if (M === 'GET') return json((await env.DB.prepare('SELECT token,created_at,ua,ip,expires FROM sessions WHERE user_id=? AND expires>? ORDER BY created_at DESC').bind(u.id, Date.now()).all()).results.map(x => ({ id: x.token.slice(0, 16), created_at: x.created_at, ua: x.ua || '', ip: x.ip || '', current: x.token === u.sid })));
        if (M === 'DELETE') { await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').bind(u.id, u.sid).run(); ctx.waitUntil(mail(env, u.email, 'AstraCode: ออกจากระบบเครื่องอื่นแล้ว', mailBox('ออกจากระบบเครื่องอื่นแล้ว', 'มีการสั่งออกจากระบบทุกเครื่องยกเว้นเครื่องที่ใช้อยู่ ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันที'))); return json({ ok: true }); }
      }
      if ((r = path.match(/^\/api\/sessions\/([a-f0-9]{16})$/)) && M === 'DELETE') {
        await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND substr(token,1,16)=? AND token<>?').bind(u.id, r[1], u.sid).run(); return json({ ok: true });
      }
      if (path === '/api/logout') {
        await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(u.sid).run();
        return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
      }
      if (path === '/api/me') {
        const plan = await planOf(env, u);
        const [usage, credits, models, pay] = await Promise.all([usageStatus(env, u, plan), creditList(env, u.id), cachedModels(env, plan.id), getSettings(env, ['promptpay_id', 'bank_name', 'bank_account', 'bank_holder'])]); // ยิงพร้อมกัน ไม่ต่อคิวทีละอัน
        return json({
          email: u.email, role: u.role, plan: { id: plan.id, name: plan.name, paid: plan.price > 0, api_limit: !!plan.api_limit, expires: plan._team ? plan._team.expires : (plan.price > 0 ? u.plan_expires : null), period: u.plan_period, team: plan._team ? { id: plan._team.id, name: plan._team.name, role: plan._team.role, max_seats: plan._team.max_seats, shared_pool: plan._team.shared_pool } : null },
          balance: u.balance, ref_code: u.ref_code, email_verified: !!u.email_verified, totp_on: !!u.totp_on, google: !!u.google_id, line: !!u.line_id, has_password: !!u.has_password,
          instructions: u.instructions, webhook_url: u.webhook_url || '', auto_compact: u.auto_compact !== 0, digest: !u.digest_off, wallet_overflow: !!u.wallet_overflow, auto_renew: !!u.auto_renew,
          usage, reset_credits: credits.reduce((a, x) => a + x.n, 0), reset_list: credits, models: [...models, ...(u.balance > 0 ? (await cachedModels(env, 'wallet')).filter(w => !models.some(x => x.id === w.id)).map(w => ({ ...w, wallet: true })) : [])].map(({ cost_in, cost_out, cost_cache, ...m }) => m), // มียอด Wallet: ใช้ได้ทุกโมเดล โมเดลนอกแพลนตัดเงินตามราคาขาย
          promptpay_id: pay.promptpay_id, pay_info: { bank_name: pay.bank_name, bank_account: pay.bank_account, bank_holder: pay.bank_holder },
        });
      }
      if (path === '/api/chat' && M === 'POST') return await chat(req, env, u, ctx);
      if (path === '/api/context' && M === 'GET') return await contextApi(req, env, u);
      if (path === '/api/agent' || path.startsWith('/api/agent/')) return await agentApi(req, env, u, path);
      if (path.startsWith('/api/push/')) return await pushApi(req, env, u, path);
      if (path.startsWith('/api/passkey')) { const pr = await passkeyApi(req, env, u, path); if (pr) return pr; }
      if ((path === '/api/chats/trash' || path === '/api/chats/archived') && M === 'GET') { // ถังขยะ (เก็บ 30 วัน แล้วลบถาวร) และแชตที่เก็บถาวร
        const trash = path.endsWith('trash');
        return json((await env.DB.prepare(`SELECT id,title,deleted_at FROM chats WHERE user_id=? AND project_id IS NULL AND ${trash ? 'deleted_at>?' : 'deleted_at IS NULL AND archived=1 AND ?>=0'} ORDER BY id DESC LIMIT 100`).bind(u.id, trash ? Date.now() - 30 * DAY : 0).all()).results);
      }
      if (path === '/api/chats/search') {
        const q = String(url.searchParams.get('q') || '').trim();
        if (q.length < 2) return json([]);
        const rows = (await env.DB.prepare(`SELECT m.chat_id, c.title, m.role, m.content, m.created_at
          FROM messages m JOIN chats c ON c.id=m.chat_id
          WHERE c.user_id=? AND c.project_id IS NULL AND c.deleted_at IS NULL AND COALESCE(c.archived,0)=0 AND m.content LIKE ?
          ORDER BY m.id DESC LIMIT 30`).bind(u.id, '%' + q.replace(/[%_]/g, '') + '%').all()).results;
        const ql = q.toLowerCase();
        return json(rows.map(r => {
          const clean = r.content.replace(/\[\[file:[^\]]+\]\][\s\S]*?\[\[\/file\]\]/g, '').trim();
          const idx = clean.toLowerCase().indexOf(ql);
          const s = Math.max(0, idx - 35), e = Math.min(clean.length, (idx < 0 ? 0 : idx) + q.length + 65);
          return { chat_id: r.chat_id, title: r.title, role: r.role, snippet: (s > 0 ? '…' : '') + clean.slice(s, e) + (e < clean.length ? '…' : '') };
        }));
      }
      if (path === '/api/chats') {
        const pj = url.searchParams.get('project');
        return json((await env.DB.prepare(`SELECT id,title,folder_id,pinned,share_token,EXISTS(SELECT 1 FROM messages m WHERE m.chat_id=chats.id AND m.content LIKE '%\`\`\`%') has_code FROM chats WHERE user_id=? AND deleted_at IS NULL AND COALESCE(archived,0)=0 AND ${pj ? 'project_id=?' : 'project_id IS NULL'} ORDER BY pinned DESC, id DESC LIMIT 100`).bind(...(pj ? [u.id, pj] : [u.id])).all()).results);
      }
      if (path === '/api/gallery' || path.startsWith('/api/projects')) return await projects(req, env, u, path, url);
      if (path === '/api/github') { // เชื่อม GitHub ด้วย Personal Access Token
        if (M === 'GET') return json({ connected: !!u.gh_token, login: u.gh_login, secret: !!env.SECRET_KEY });
        if (M === 'DELETE') { await env.DB.prepare('UPDATE users SET gh_token=NULL, gh_login=NULL WHERE id=?').bind(u.id).run(); return json({ ok: true }); }
        const token = String((await req.json()).token || '').trim();
        if (!/^(gh[pousr]_|github_pat_)[\w]{20,}$/.test(token)) return err('รูปแบบ token ไม่ถูกต้อง (ขึ้นต้นด้วย github_pat_ หรือ ghp_)');
        const who = await gh(token, '/user', { base: env.GITHUB_API });
        await env.DB.prepare('UPDATE users SET gh_token=?, gh_login=? WHERE id=?').bind(await seal(env, token), who.login, u.id).run();
        return json({ ok: true, login: who.login });
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)\/cost$/)) && M === 'GET') { // ต้นทุนโดยประมาณของแชตนี้ที่ราคาจ่ายตามใช้ (Wallet/API) จากโทเคนที่บันทึกในแต่ละข้อความ
        if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(r[1], u.id).first()) return err('ไม่พบแชต', 404);
        const rows = (await env.DB.prepare("SELECT model_id, COUNT(*) n, COALESCE(SUM(tin),0) tin, COALESCE(SUM(tout),0) tout FROM messages WHERE chat_id=? AND role='assistant' GROUP BY model_id").bind(r[1]).all()).results;
        let baht = 0, tin = 0, tout = 0, replies = 0;
        for (const x of rows) {
          tin += x.tin; tout += x.tout; replies += x.n;
          const m = x.model_id && await env.DB.prepare('SELECT * FROM models WHERE id=?').bind(x.model_id).first(); if (!m) continue;
          const pr = await priceOf(env, m); baht += pr.req > 0 ? pr.req * x.n : (x.tin * pr.in + x.tout * pr.out) / 1e6; // shortcut: ไม่นับ cache hit/write จึงเป็นค่าประมาณสูงกว่าจริงเล็กน้อย
        }
        return json({ replies, tin, tout, baht: Math.round(baht * 10000) / 10000 });
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)\/restore$/)) && M === 'POST') {
        const ch = await env.DB.prepare('UPDATE chats SET deleted_at=NULL, archived=0 WHERE id=? AND user_id=? RETURNING id').bind(r[1], u.id).first();
        return ch ? json({ ok: true }) : err('ไม่พบแชต', 404);
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)\/branch$/)) && M === 'POST') { // แตกกิ่ง: แชตใหม่ที่มีข้อความถึงจุดที่เลือก (ของเดิมไม่ถูกแตะ)
        const c = await env.DB.prepare('SELECT title,project_id,folder_id FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(r[1], u.id).first();
        if (!c) return err('ไม่พบแชต', 404);
        const upto = +(await req.json().catch(() => ({}))).message_id || 1e15;
        const n = await env.DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id,folder_id) VALUES (?,?,?,?,?) RETURNING id').bind(u.id, ('↳ ' + c.title).slice(0, 60), Date.now(), c.project_id, c.folder_id).first();
        await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,thinking,sources,tin,tout) SELECT ?1,role,content,model_id,created_at,thinking,sources,tin,tout FROM messages WHERE chat_id=?2 AND id<=?3 ORDER BY id').bind(n.id, r[1], upto).run();
        return json({ id: n.id });
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)\/compact$/)) && M === 'POST') { // ผู้ใช้กดย่อแชต: สรุปข้อความเก่าเหลือ 2 ข้อความล่าสุด (ลด context)
        if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(r[1], u.id).first()) return err('ไม่พบแชต', 404);
        if (await limited(env, 'compact:' + u.id, 10, 3600e3)) return err('ย่อแชตบ่อยเกินไป ลองใหม่ภายหลัง', 429);
        return json({ ok: await compact(env, u, +r[1], true) });
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)\/share$/))) {
        if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(r[1], u.id).first()) return err('ไม่พบแชต', 404);
        if (M === 'DELETE') { await env.DB.prepare('UPDATE chats SET share_token=NULL WHERE id=?').bind(r[1]).run(); return json({ ok: true }); }
        if (M === 'POST') {
          const row = await env.DB.prepare('UPDATE chats SET share_token=COALESCE(share_token,?) WHERE id=? RETURNING share_token').bind(rand(12), r[1]).first();
          return json({ share_token: row.share_token });
        }
      }
      if ((r = path.match(/^\/api\/chats\/(\d+)$/))) {
        const own = await env.DB.prepare('SELECT deleted_at FROM chats WHERE id=? AND user_id=?').bind(r[1], u.id).first();
        if (!own || (own.deleted_at && M !== 'DELETE')) return err('ไม่พบแชต', 404);
        if (M === 'DELETE') { // ลบครั้งแรก = ย้ายเข้าถังขยะ (กู้คืนได้ 30 วัน) · ลบซ้ำหรือสั่ง permanent=1 = ลบถาวร
          if (own.deleted_at || url.searchParams.get('permanent') === '1') await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE chat_id=?').bind(r[1]), env.DB.prepare('DELETE FROM chats WHERE id=?').bind(r[1])]);
          else await env.DB.prepare('UPDATE chats SET deleted_at=?, share_token=NULL WHERE id=?').bind(Date.now(), r[1]).run();
          return json({ ok: true });
        }
        if (M === 'PUT') { // เปลี่ยนชื่อ / ย้ายโฟลเดอร์
          const b = await req.json();
          if ('title' in b) { const title = String(b.title || '').trim().slice(0, 80); if (!title) return err('ชื่อว่าง'); await env.DB.prepare('UPDATE chats SET title=? WHERE id=?').bind(title, r[1]).run(); }
          if ('pinned' in b) await env.DB.prepare('UPDATE chats SET pinned=? WHERE id=?').bind(b.pinned ? 1 : 0, r[1]).run();
          if ('archived' in b) await env.DB.prepare('UPDATE chats SET archived=? WHERE id=?').bind(b.archived ? 1 : 0, r[1]).run();
          if ('folder_id' in b) {
            if (b.folder_id && !await env.DB.prepare('SELECT 1 FROM folders WHERE id=? AND user_id=?').bind(b.folder_id, u.id).first()) return err('ไม่พบโฟลเดอร์', 404);
            await env.DB.prepare('UPDATE chats SET folder_id=? WHERE id=?').bind(b.folder_id || null, r[1]).run();
          }
          return json({ ok: true });
        }
        await ensureFb(env);
        return json((await env.DB.prepare('SELECT m.id,m.role,m.content,m.thinking,m.sources,m.tin,m.tout,md.name model,(SELECT vote FROM feedback f WHERE f.message_id=m.id AND f.user_id=?2) vote FROM messages m LEFT JOIN models md ON md.id=m.model_id WHERE m.chat_id=?1 ORDER BY m.id').bind(r[1], u.id).all()).results);
      }
      if (path === '/api/pay' && M === 'POST') return await pay(req, env, u);
      if (path === '/api/pay') return json((await env.DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,p.kind,p.period,p.discount,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE user_id=? ORDER BY p.id DESC LIMIT 20').bind(u.id).all()).results);

      if (path === '/api/admin-gate') return u.role === 'admin' ? await adminGate(req, env, u) : err('forbidden', 403);
      if (path.startsWith('/api/admin/')) {
        if (u.role !== 'admin') return err('forbidden', 403);
        return (await gateBlock(env, u)) || await admin(req, env, path, url, u); // ต้องผ่านรหัสผ่านชั้นที่สองก่อน
      }
      return err('not found', 404);
    } catch (e) {
      if (e.user) return err(e.message, e.status);
      if (e instanceof SyntaxError && /JSON/.test(e.message)) return err('คำขอไม่ถูกต้อง (ต้องเป็น JSON)', 400); // body ว่าง/พัง = ความผิดของผู้เรียก ไม่ใช่ 500
      console.log('error', path, e.stack);
      return err('เซิร์ฟเวอร์ผิดพลาด', 500);
    }
}
export { ChatRun } from './jobs.js';
