// Passkey (WebAuthn): ล็อกอินด้วยลายนิ้วมือ/ใบหน้า/PIN ของเครื่อง · เก็บ public key (SPKI จาก getPublicKey()) ไม่ต้องแกะ CBOR
// ไม่ตรวจ attestation (ขอแบบ none) · ตรวจ challenge, origin, rpIdHash, flag UP และลายเซ็น
import { err, ip, json, limited, startSession } from './core.js';
import { origin } from './billing.js';
import { b64u, unb64u } from './push.js';

const S = crypto.subtle, te = new TextEncoder();
const sha = async b => new Uint8Array(await S.digest('SHA-256', typeof b === 'string' ? te.encode(b) : b));
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

async function ensure(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS passkeys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cred_id TEXT NOT NULL UNIQUE, spki TEXT NOT NULL, alg INTEGER NOT NULL, name TEXT, sign_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, used_at INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS webauthn_ch (ch TEXT PRIMARY KEY, user_id INTEGER, exp INTEGER NOT NULL)'),
  ]);
}
async function newChallenge(env, uid) {
  const ch = b64u(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  await env.DB.batch([env.DB.prepare('DELETE FROM webauthn_ch WHERE exp<?').bind(now), env.DB.prepare('INSERT INTO webauthn_ch (ch,user_id,exp) VALUES (?,?,?)').bind(ch, uid ?? null, now + 300e3)]);
  return ch;
}
// ใช้ challenge ได้ครั้งเดียว · คืน clientData ที่ผ่านการตรวจ หรือ null
async function checkClient(env, req, cdjB64, type, uid) {
  let cd; try { cd = JSON.parse(new TextDecoder().decode(unb64u(cdjB64))); } catch { return null; }
  if (cd.type !== type || cd.origin !== origin(req, env) || typeof cd.challenge !== 'string') return null;
  const row = await env.DB.prepare('DELETE FROM webauthn_ch WHERE ch=? AND exp>? RETURNING user_id').bind(cd.challenge, Date.now()).first();
  if (!row || (uid != null && row.user_id !== uid)) return null;
  return cd;
}
// ลายเซ็น ECDSA ของ WebAuthn เป็น DER → WebCrypto ต้องการ r||s อย่างละ 32 ไบต์
export function derToRaw(der) {
  if (!(der instanceof Uint8Array) || der.length < 8 || der[0] !== 0x30) return null;
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const int = () => {
    if (i + 2 > der.length || der[i++] !== 0x02) return null;
    const n = der[i++]; if (!n || i + n > der.length) return null;
    let v = der.slice(i, i + n); i += n;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) return null;
    const o = new Uint8Array(32); o.set(v, 32 - v.length); return o;
  };
  const r = int(), s = int(); return r && s ? cat(r, s) : null;
}
const ALGS = { [-7]: { imp: { name: 'ECDSA', namedCurve: 'P-256' }, ver: { name: 'ECDSA', hash: 'SHA-256' } }, [-257]: { imp: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, ver: { name: 'RSASSA-PKCS1-v1_5' } } };

// ก่อนล็อกอิน (ไม่ต้องมี session)
export async function passkeyPublic(req, env, path) {
  await ensure(env);
  const rpId = new URL(origin(req, env)).hostname;
  if (path === '/api/passkey/login-options') {
    if (await limited(env, 'pkopt:' + ip(req, env), 30, 600e3)) return err('ลองบ่อยเกินไป รอสักครู่', 429);
    return json({ challenge: await newChallenge(env, null), rpId, userVerification: 'preferred', timeout: 60000 });
  }
  if (path === '/api/passkey/login' && req.method === 'POST') {
    if (await limited(env, 'pklogin:' + ip(req, env), 20, 900e3)) return err('ลองหลายครั้งเกินไป รอ 15 นาที', 429);
    const b = await req.json().catch(() => ({})), fail = () => err('ยืนยัน Passkey ไม่ผ่าน ลองใหม่ หรือใช้วิธีล็อกอินอื่น', 401);
    const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE cred_id=?').bind(String(b.id || '')).first(); if (!pk) return fail();
    if (!await checkClient(env, req, String(b.clientDataJSON || ''), 'webauthn.get', null)) return fail();
    let ad, sig; try { ad = unb64u(String(b.authenticatorData)); sig = unb64u(String(b.signature)); } catch { return fail(); }
    if (ad.length < 37 || !(ad[32] & 1) || b64u(ad.slice(0, 32)) !== b64u(await sha(rpId))) return fail(); // rpIdHash + flag UP
    const a = ALGS[pk.alg]; if (!a) return fail();
    const key = await S.importKey('spki', unb64u(pk.spki), a.imp, false, ['verify']).catch(() => null); if (!key) return fail();
    const rawSig = pk.alg === -7 ? derToRaw(sig) : sig; if (!rawSig) return fail();
    const ok = await S.verify(a.ver, key, rawSig, cat(ad, await sha(unb64u(String(b.clientDataJSON))))).catch(() => false);
    if (!ok) return fail();
    const cnt = new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0);
    if (cnt && pk.sign_count && cnt <= pk.sign_count) return fail(); // ตัวนับไม่เดิน = อาจเป็น passkey ที่ถูกโคลน
    const u = await env.DB.prepare('SELECT id,banned,totp_on FROM users WHERE id=?').bind(pk.user_id).first(); if (!u || u.banned) return fail();
    if (u.totp_on && !(ad[32] & 4)) return fail(); // บัญชีเปิด 2FA ต้องยืนยันตัวตนบนอุปกรณ์ (UV flag)
    await env.DB.prepare('UPDATE passkeys SET sign_count=?, used_at=? WHERE id=?').bind(cnt, Date.now(), pk.id).run();
    return await startSession(env, u.id, req);
  }
  return null;
}

// หลังล็อกอิน: เพิ่ม / ดู / ลบ passkey
export async function passkeyApi(req, env, u, path) {
  await ensure(env);
  const url = new URL(req.url), M = req.method;
  if (path === '/api/passkeys' && M === 'GET') return json((await env.DB.prepare('SELECT id,name,created_at,used_at FROM passkeys WHERE user_id=? ORDER BY id').bind(u.id).all()).results);
  let r;
  if ((r = path.match(/^\/api\/passkeys\/(\d+)$/)) && M === 'DELETE') { await env.DB.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').bind(+r[1], u.id).run(); return json({ ok: true }); }
  if (path === '/api/passkey/register-options' && M === 'POST') {
    const have = (await env.DB.prepare('SELECT cred_id FROM passkeys WHERE user_id=?').bind(u.id).all()).results;
    if (have.length >= 10) return err('เพิ่ม Passkey ได้สูงสุด 10 อัน');
    return json({ challenge: await newChallenge(env, u.id), rp: { id: new URL(origin(req, env)).hostname, name: 'AstraCode' }, user: { id: b64u(te.encode('u' + u.id)), name: u.email, displayName: u.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }, attestation: 'none', timeout: 60000,
      excludeCredentials: have.map(x => ({ type: 'public-key', id: x.cred_id })) });
  }
  if (path === '/api/passkey/register' && M === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (!await checkClient(env, req, String(b.clientDataJSON || ''), 'webauthn.create', u.id)) return err('ยืนยันไม่ผ่าน ลองใหม่อีกครั้ง', 400);
    const id = String(b.id || ''), alg = +b.alg, spki = String(b.publicKey || '');
    if (!/^[\w-]{16,400}$/.test(id) || !ALGS[alg] || !await S.importKey('spki', unb64u(spki), ALGS[alg].imp, false, ['verify']).then(() => true, () => false)) return err('อุปกรณ์นี้ส่ง Passkey ในรูปแบบที่ยังไม่รองรับ', 400);
    await env.DB.prepare('INSERT INTO passkeys (user_id,cred_id,spki,alg,name,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, id, spki, alg, String(b.name || '').slice(0, 60) || 'Passkey', Date.now()).run();
    return json({ ok: true });
  }
  return null;
}
