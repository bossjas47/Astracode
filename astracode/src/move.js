// ย้ายโดเมน (astracode.panderx.xyz → โดเมนใหม่ใน PUBLIC_URL) โดยลูกค้าไม่หลุดล็อกอิน
// เปิดหน้าเว็บที่โดเมนเดิม → ถ้าล็อกอินอยู่ ออกตั๋วใช้ครั้งเดียว (60 วินาที) แล้วพาไป https://<ใหม่>/handoff?t=… ซึ่งสร้าง session บนโดเมนใหม่ให้
// ยังไม่ล็อกอิน → 301 ไปหน้าเดียวกันบนโดเมนใหม่ (Google ย้ายอันดับตาม) · ไม่แตะ /api/* และ /v1/* เลย (POST จะพัง · key เดิมใช้ต่อได้)
// แอปที่ฝังเว็บไว้ (แอปคอมรุ่นเก่า = Electron · แอปมือถือ = Android WebView) ไม่ถูกย้าย เพราะตัวแอปเปิดได้เฉพาะโดเมนเดิม · ?handoff=1 = บังคับย้าย (แอปคอมรุ่นใหม่ใช้ตอนเปิดครั้งแรก)
// ทำงานเมื่อตั้ง PUBLIC_URL เป็นโดเมนใหม่แล้วเท่านั้น (ไม่ตั้ง = ไม่ย้าย)
import { rand, sha, sessionCookie } from './core.js';

const OLD_DEFAULT = 'astracode.panderx.xyz';
export const newHost = env => { try { const h = new URL(env.PUBLIC_URL || '').hostname; return h && h !== OLD_DEFAULT ? h : ''; } catch { return ''; } };
const embedded = req => /Electron\/|; wv\)/.test(req.headers.get('user-agent') || '');
const isPage = path => !/\.[a-z0-9]{2,5}$/i.test(path) || /\.html$/i.test(path);
const safeNext = n => { const s = String(n || '/'); return /^\/(?![/\\])[^\s]*$/.test(s) ? s.slice(0, 1000) : '/'; };
let ready = false;
const ensure = async env => { if (ready) return; await env.DB.prepare('CREATE TABLE IF NOT EXISTS handoffs (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)').run(); ready = true; };

// หน้าเว็บที่โดเมนเดิม: คืน Response (redirect) หรือ null = ให้ทำงานตามปกติ
export async function moveSite(req, env, url, path, M, getUser) {
  const nh = newHost(env); if (!nh || url.hostname === nh || (M !== 'GET' && M !== 'HEAD')) return null;
  if (/^\/(api|v1|setup)\//.test(path) || /^\/(handoff|preview|node-runner)(\.html)?$/.test(path) || !isPage(path)) return null; // พรีวิว/เทอร์มินัลรันใน iframe ของหน้าเดิม: ไม่ย้าย
  const force = url.searchParams.get('handoff') === '1';
  if (embedded(req) && !force) return null;
  url.searchParams.delete('handoff');
  const next = safeNext(path + url.search), u = await getUser(req, env).catch(() => null);
  if (!u) return new Response(null, { status: 301, headers: { location: `https://${nh}${next}`, 'cache-control': 'no-store' } });
  await ensure(env);
  const t = rand(32), now = Date.now();
  await env.DB.batch([env.DB.prepare('INSERT INTO handoffs (token,user_id,expires) VALUES (?,?,?)').bind(await sha(t), u.id, now + 60e3), env.DB.prepare('DELETE FROM handoffs WHERE expires<?').bind(now)]);
  return new Response(null, { status: 302, headers: { location: `https://${nh}/handoff?t=${t}&next=${encodeURIComponent(next)}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

// โดเมนใหม่: รับตั๋ว → สร้าง session (ตั๋วใช้ได้ครั้งเดียว) → ไปหน้าที่ตั้งใจเปิด · ตั๋วหมดอายุ/ใช้แล้ว = ไปหน้านั้นเฉย ๆ (ล็อกอินเองได้)
export async function handoff(req, env, url) {
  const next = safeNext(url.searchParams.get('next')), t = url.searchParams.get('t') || '';
  const go = (cookie) => new Response(null, { status: 302, headers: { location: next, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...(cookie ? { 'set-cookie': cookie } : {}) } });
  if (!/^[a-f0-9]{32,128}$/.test(t)) return go();
  await ensure(env);
  const row = await env.DB.prepare('DELETE FROM handoffs WHERE token=? AND expires>? RETURNING user_id').bind(await sha(t), Date.now()).first();
  if (!row) return go();
  const ok = await env.DB.prepare('SELECT 1 FROM users WHERE id=? AND COALESCE(banned,0)=0').bind(row.user_id).first();
  return go(ok ? await sessionCookie(env, row.user_id, req) : null);
}
