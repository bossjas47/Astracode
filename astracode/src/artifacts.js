// Artifact: หน้าเว็บ (HTML+JS) ที่ AI สร้างในแชต · เก็บทุกเวอร์ชัน · เป็นส่วนตัวจนกว่าเจ้าของกดแชร์
// ความปลอดภัย: หน้าที่แชร์ส่งพร้อม CSP sandbox (origin ทึบ อ่าน cookie / เรียก API ในชื่อผู้ใช้ไม่ได้) และ noindex
import { err, esc, json, limited, planOf, rand } from './core.js';

export const ART_MAX = 2e6, ART_VERS = 30, ART_SHARES = 20, ART_REPORT_OFF = 5;
export const artPaid = plan => plan?.price > 0 && !plan.once; // แพลนทดลอง (once) และฟรีใช้ไม่ได้
export const ART_TABLES = [
  'CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, chat_id INTEGER, title TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, share_token TEXT, share_ver INTEGER, reports INTEGER NOT NULL DEFAULT 0, gallery INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS artifacts_user ON artifacts(user_id, updated_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS artifacts_share ON artifacts(share_token)',
  'CREATE TABLE IF NOT EXISTS artifact_versions (artifact_id INTEGER NOT NULL, ver INTEGER NOT NULL, html TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (artifact_id, ver))',
];
export const artMarker = (id, ver, title) => `\n\n[[art:${id}|${ver}|${String(title).replace(/[\]|\n]/g, ' ')}]]\n`;

// เครื่องมือของ AI: สร้างใหม่ หรือแก้ชิ้นเดิม (id) เป็นเวอร์ชันใหม่
export async function artifactTool(env, u, cid, a) {
  const title = String(a.title || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Artifact', html = String(a.html ?? '');
  const fail = m => ({ result: 'Error: ' + m, ok: false, label: 'Artifact' });
  if (!html.trim()) return fail('html is empty');
  if (html.length > ART_MAX) return fail('html is over 2,000,000 characters');
  const now = Date.now(); let id = +a.id || 0, ver = 1;
  if (id) {
    const row = await env.DB.prepare('SELECT ver FROM artifacts WHERE id=? AND user_id=?').bind(id, u.id).first();
    if (!row) return fail('no artifact with that id in this account; omit id to create a new one');
    ver = row.ver + 1;
    await env.DB.batch([
      env.DB.prepare('UPDATE artifacts SET ver=?, title=?, updated_at=? WHERE id=?').bind(ver, title, now, id),
      env.DB.prepare('INSERT INTO artifact_versions (artifact_id,ver,html,created_at) VALUES (?,?,?,?)').bind(id, ver, html, now),
      env.DB.prepare('DELETE FROM artifact_versions WHERE artifact_id=? AND ver<=?').bind(id, ver - ART_VERS), // เก็บ 30 เวอร์ชันล่าสุด
    ]);
  } else {
    id = (await env.DB.prepare('INSERT INTO artifacts (user_id,chat_id,title,created_at,updated_at) VALUES (?,?,?,?,?) RETURNING id').bind(u.id, cid || null, title, now, now).first()).id;
    await env.DB.prepare('INSERT INTO artifact_versions (artifact_id,ver,html,created_at) VALUES (?,?,?,?)').bind(id, 1, html, now).run();
  }
  return { result: `Artifact ${id} saved as version ${ver}. The user sees a card under your answer and can open it. Do not paste the HTML again; to change it later call artifact with id=${id}.`, emit: artMarker(id, ver, title), ok: true, label: 'Artifact ' + title };
}

const badge = '<div style="position:fixed;right:10px;bottom:10px;z-index:2147483647;font:12px system-ui,sans-serif;background:rgba(20,20,24,.82);color:#fff;padding:5px 10px;border-radius:999px;pointer-events:none">สร้างด้วย AstraCode</div>';
export function artPage(html, { share = false } = {}) {
  const body = share ? (/<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, badge + '</body>') : html + badge) : html;
  return new Response(body, { headers: {
    'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer', 'cache-control': 'private, max-age=0',
    // ไม่มี allow-same-origin: โค้ดในหน้าอยู่ origin ทึบ · โหลดสคริปต์ได้จาก cdnjs/jsdelivr เท่านั้น · fetch ไปที่อื่นไม่ได้
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src * data: blob:; media-src * data: blob:; connect-src 'none'; frame-ancestors 'self'; form-action 'none'; sandbox allow-scripts allow-forms allow-modals",
  } });
}

// หน้าแชร์สาธารณะ /a/:token: กรอบของเว็บเรา (ชื่อ · รายงาน · ทำแบบนี้ให้ฉัน) + iframe โหลดเนื้อหาจริงที่ /a/:token/raw (sandbox)
export async function artShell(env, token) {
  const a = await env.DB.prepare('SELECT title FROM artifacts WHERE share_token=?').bind(token).first();
  if (!a) return new Response('ไม่พบหน้านี้ หรือเจ้าของปิดการแชร์แล้ว', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
  const t = esc(a.title);
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${t} · สร้างด้วย AstraCode</title>
<meta property="og:title" content="${t}"><meta property="og:description" content="หน้าเว็บที่สร้างด้วย AI บน AstraCode"><meta property="og:image" content="/og.png">
<style>html,body{margin:0;height:100%;background:#141210;font-family:system-ui,'Prompt',sans-serif;color:#f3eee7}.bar{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-bottom:1px solid #2c2824;font-size:14px}.bar b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar a,.bar button{color:#f3eee7;text-decoration:none;background:none;border:1px solid #3a352f;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.bar a.cta{background:#d97757;border-color:#d97757;color:#fff}iframe{display:block;width:100%;height:calc(100% - 45px);border:0;background:#fff}@media(max-width:520px){.bar .hide{display:none}}</style></head>
<body><div class="bar"><b>${t}</b><button type="button" id="rep" class="hide">รายงาน</button><a class="cta" href="/?ref=artifact">ทำแบบนี้ให้ฉัน</a></div>
<iframe src="/a/${token}/raw" sandbox="allow-scripts allow-forms allow-modals" title="${t}"></iframe>
<script>document.getElementById('rep').onclick=async e=>{if(!confirm('รายงานหน้านี้ว่าไม่เหมาะสม หรือหลอกลวง?'))return;e.target.disabled=true;try{const r=await fetch('/api/a/${token}/report',{method:'POST'});e.target.textContent=r.ok?'รายงานแล้ว ขอบคุณ':'ลองใหม่ภายหลัง'}catch{e.target.textContent='ลองใหม่ภายหลัง'}}</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=0',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" } });
}
// แกลเลอรีสาธารณะ: เฉพาะที่เจ้าของเลือกโชว์ ยังแชร์อยู่ และถูกรายงานน้อยกว่า 2 ครั้ง
export async function artGallery(env) {
  return json((await env.DB.prepare('SELECT title, share_token token, updated_at FROM artifacts WHERE gallery=1 AND share_token IS NOT NULL AND reports<2 ORDER BY updated_at DESC LIMIT 60').all()).results);
}
// หลังบ้าน: รายการที่แชร์อยู่ (ถูกรายงานมากสุดก่อน) · ปิดลิงก์ / เอาออกจากแกลเลอรี
export async function artAdmin(req, env, path, M) {
  if (path === '/api/admin/artifacts' && M === 'GET') return json((await env.DB.prepare('SELECT a.id, a.title, a.share_token, a.gallery, a.reports, a.updated_at, u.email FROM artifacts a JOIN users u ON u.id=a.user_id WHERE a.share_token IS NOT NULL OR a.reports>0 ORDER BY a.reports DESC, a.updated_at DESC LIMIT 200').all()).results);
  const m = path.match(/^\/api\/admin\/artifacts\/(\d+)$/);
  if (m && M === 'PUT') {
    const b = await req.json().catch(() => ({}));
    if (b.unshare) await env.DB.prepare('UPDATE artifacts SET share_token=NULL, gallery=NULL WHERE id=?').bind(+m[1]).run();
    if ('gallery' in b) await env.DB.prepare('UPDATE artifacts SET gallery=? WHERE id=?').bind(b.gallery ? 1 : null, +m[1]).run();
    return json({ ok: true });
  }
  return null;
}
export async function artPublic(env, token) {
  const a = await env.DB.prepare('SELECT id, ver, share_ver FROM artifacts WHERE share_token=?').bind(token).first();
  if (!a) return new Response('ไม่พบหน้านี้ หรือเจ้าของปิดการแชร์แล้ว', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
  const v = await env.DB.prepare('SELECT html FROM artifact_versions WHERE artifact_id=? AND ver<=? ORDER BY ver DESC LIMIT 1').bind(a.id, a.share_ver || a.ver).first();
  return artPage(v?.html || '', { share: true });
}
export async function artReport(env, token, who) {
  if (await limited(env, 'artrep:' + who, 10, 3600e3)) return err('รายงานถี่เกินไป', 429);
  const a = await env.DB.prepare('UPDATE artifacts SET reports=reports+1 WHERE share_token=? RETURNING id, reports').bind(token).first();
  if (!a) return err('ไม่พบหน้านี้', 404);
  if (a.reports >= ART_REPORT_OFF) await env.DB.prepare('UPDATE artifacts SET share_token=NULL WHERE id=?').bind(a.id).run(); // ถูกรายงานหลายครั้ง: ปิดลิงก์อัตโนมัติ
  return json({ ok: true });
}

// API ของเจ้าของ (ล็อกอินแล้ว)
export async function artApi(req, env, u, path, M, url) {
  if (!path.startsWith('/api/artifacts')) return null;
  if (path === '/api/artifacts' && M === 'GET') return json((await env.DB.prepare('SELECT id, chat_id, title, ver, share_token, share_ver, gallery, updated_at FROM artifacts WHERE user_id=? ORDER BY updated_at DESC LIMIT 300').bind(u.id).all()).results);
  const m = path.match(/^\/api\/artifacts\/(\d+)(\/share|\/raw)?$/); if (!m) return err('not found', 404);
  const a = await env.DB.prepare('SELECT * FROM artifacts WHERE id=? AND user_id=?').bind(+m[1], u.id).first();
  if (!a) return err('ไม่พบ Artifact', 404);
  if (m[2] === '/raw' && M === 'GET') { // แสดงใน iframe ของแชต (เจ้าของเท่านั้น · sandbox เหมือนหน้าแชร์)
    const v = await env.DB.prepare('SELECT html FROM artifact_versions WHERE artifact_id=? AND ver=?').bind(a.id, +url.searchParams.get('v') || a.ver).first();
    return v ? artPage(v.html) : err('ไม่พบเวอร์ชันนี้', 404);
  }
  if (!m[2] && M === 'GET') {
    const vers = (await env.DB.prepare('SELECT ver, created_at FROM artifact_versions WHERE artifact_id=? ORDER BY ver DESC').bind(a.id).all()).results;
    const v = await env.DB.prepare('SELECT html FROM artifact_versions WHERE artifact_id=? AND ver=?').bind(a.id, +url.searchParams.get('v') || a.ver).first();
    return json({ id: a.id, title: a.title, ver: a.ver, chat_id: a.chat_id, share_token: a.share_token, share_ver: a.share_ver, gallery: !!a.gallery, versions: vers, html: v?.html ?? '' });
  }
  if (!m[2] && M === 'DELETE') { await env.DB.batch([env.DB.prepare('DELETE FROM artifact_versions WHERE artifact_id=?').bind(a.id), env.DB.prepare('DELETE FROM artifacts WHERE id=?').bind(a.id)]); return json({ ok: true }); }
  if (m[2] === '/share' && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!b.on) { await env.DB.prepare('UPDATE artifacts SET share_token=NULL, share_ver=NULL, gallery=NULL WHERE id=?').bind(a.id).run(); return json({ ok: true, share_token: null }); }
    if (!artPaid(await planOf(env, u))) return err('แชร์ Artifact ใช้ได้กับแพลนที่ชำระเงิน', 403);
    if (!a.share_token && (await env.DB.prepare('SELECT COUNT(*) n FROM artifacts WHERE user_id=? AND share_token IS NOT NULL').bind(u.id).first()).n >= ART_SHARES) return err(`เปิดแชร์ได้พร้อมกันไม่เกิน ${ART_SHARES} ลิงก์ ปิดแชร์ชิ้นเก่าก่อน`, 403);
    const ver = b.ver ? Math.min(+b.ver, a.ver) : null, tok = a.share_token || rand(16);
    await env.DB.prepare('UPDATE artifacts SET share_token=?, share_ver=?, gallery=? WHERE id=?').bind(tok, ver, b.gallery ? 1 : null, a.id).run(); // ถูกรายงานแล้วไม่ล้างตัวนับ (กันปิด-เปิดหลบ)
    return json({ ok: true, share_token: tok, share_ver: ver, gallery: !!b.gallery });
  }
  return err('not found', 404);
}
