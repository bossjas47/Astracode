// Web Push (RFC 8030/8291/8292): แจ้งเตือนเข้ามือถือแม้ปิดแอป · กุญแจ VAPID สร้างครั้งแรกแล้วเก็บใน settings (ไม่เปิดให้ public อ่าน)
import { err, json } from './core.js';
import { getSetting } from './billing.js';

const enc = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
// บริการ push ของเบราว์เซอร์หลัก (กันส่งคำขอไปที่อื่น/เครือข่ายภายใน)
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+\.push\.apple\.com|[\w.-]+\.notify\.windows\.com)$/;

async function ensure(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
}
async function vapid(env) {
  let jwk = await getSetting(env, 'vapid_jwk');
  if (!jwk) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    // INSERT OR IGNORE: ถ้ามีคำขออื่นสร้างไปก่อน ใช้ของเดิม (กุญแจต้องคงที่ ไม่งั้น subscription เก่าใช้ไม่ได้)
    await env.DB.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').bind('vapid_jwk', jwk).run();
    jwk = await getSetting(env, 'vapid_jwk') || jwk;
  }
  const j = JSON.parse(jwk);
  return { key: await crypto.subtle.importKey('jwk', j, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), pub: b64u(cat(new Uint8Array([4]), unb64u(j.x), unb64u(j.y))) };
}
const hkdf = async (salt, ikm, info, bits) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bits));

// เข้ารหัส payload แบบ aes128gcm (RFC 8291)
export async function encrypt(payload, p256dh, auth, salt = crypto.getRandomValues(new Uint8Array(16)), as = null) {
  const ua = unb64u(p256dh), au = unb64u(auth);
  as ||= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, as.privateKey, 256));
  const ikm = await hkdf(au, shared, cat(enc.encode('WebPush: info\0'), ua, asPub), 256);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128), nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']), cat(enc.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0, 65]), asPub, ct); // rs=4096, idlen=65
}

// ส่งแจ้งเตือนถึงทุกอุปกรณ์ของผู้ใช้ · อุปกรณ์ที่ยกเลิกแล้ว (404/410) ลบทิ้ง · ไม่ throw
export async function sendPush(env, userId, msg) {
  try {
    await ensure(env);
    const subs = (await env.DB.prepare('SELECT * FROM push_subs WHERE user_id=?').bind(userId).all()).results; if (!subs.length) return 0;
    const v = await vapid(env), body = JSON.stringify({ title: String(msg.title || 'Kyber').slice(0, 80), body: String(msg.body || '').slice(0, 300), url: msg.url || '/' });
    let n = 0;
    await Promise.all(subs.map(async s => {
      const u = new URL(s.endpoint), now = Math.floor(Date.now() / 1000);
      const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), p = b64u(enc.encode(JSON.stringify({ aud: u.origin, exp: now + 12 * 3600, sub: 'mailto:noreply@astracode.app' })));
      const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc.encode(h + '.' + p)));
      const r = await fetch(s.endpoint, { method: 'POST', headers: { authorization: `vapid t=${h}.${p}.${sig}, k=${v.pub}`, 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal' }, body: await encrypt(body, s.p256dh, s.auth), signal: AbortSignal.timeout(10e3) }).catch(() => null);
      if (r?.ok) n++; else if (r && [404, 410].includes(r.status)) await env.DB.prepare('DELETE FROM push_subs WHERE id=?').bind(s.id).run();
      else if (r) console.log('push', r.status, (await r.text().catch(() => '')).slice(0, 200));
    }));
    return n;
  } catch (e) { console.log('push', e.message); return 0; }
}

export async function pushApi(req, env, u, path) {
  await ensure(env);
  if (path === '/api/push/key') return json({ key: (await vapid(env)).pub });
  if (path === '/api/push/test' && req.method === 'POST') { const n = await sendPush(env, u.id, { title: 'Kyber', body: 'ทดสอบแจ้งเตือน: ใช้ได้แล้ว', url: '/account' }); return n ? json({ ok: true, n }) : err('ส่งไม่ถึงอุปกรณ์ไหนเลย ลองปิดแล้วเปิดแจ้งเตือนใหม่', 502); }
  if (path !== '/api/push/sub') return err('not found', 404);
  const b = await req.json().catch(() => ({})), ep = String(b.endpoint || '');
  if (req.method === 'DELETE') { await env.DB.prepare('DELETE FROM push_subs WHERE user_id=? AND endpoint=?').bind(u.id, ep).run(); return json({ ok: true }); }
  if (req.method === 'GET') return json({ n: (await env.DB.prepare('SELECT COUNT(*) n FROM push_subs WHERE user_id=?').bind(u.id).first()).n });
  let host = ''; try { const x = new URL(ep); if (x.protocol === 'https:') host = x.hostname; } catch {}
  if (!PUSH_HOST.test(host) || ep.length > 1000) return err('endpoint ไม่ถูกต้อง');
  const p256 = String(b.keys?.p256dh || ''), auth = String(b.keys?.auth || '');
  if (!/^[\w-]{80,100}$/.test(p256) || !/^[\w-]{16,30}$/.test(auth)) return err('keys ไม่ถูกต้อง');
  if ((await env.DB.prepare('SELECT COUNT(*) n FROM push_subs WHERE user_id=?').bind(u.id).first()).n >= 10) await env.DB.prepare('DELETE FROM push_subs WHERE id=(SELECT MIN(id) FROM push_subs WHERE user_id=?)').bind(u.id).run();
  await env.DB.prepare('INSERT INTO push_subs (user_id,endpoint,p256dh,auth,created_at) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth').bind(u.id, ep, p256, auth, Date.now()).run();
  return json({ ok: true });
}
