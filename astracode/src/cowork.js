// ---------- Cowork (แบบ Claude Cowork): งานออฟฟิศที่ AI ทำเองจนจบในเครื่องเสมือนบนคลาวด์ ----------
// งาน 1 งาน = Durable Object AgentBox 'cw:<id>' + เครื่องเสมือน 1 เครื่อง (Chromium, Python, ไฟล์ออฟฟิศ) · คุยต่อได้หลายข้อความ
// ไฟล์งานเก็บใน R2 (SLIPS) cowork/<user>/<task>/<path> · โมเดลล็อก Claude Sonnet 5.5 Eco · ใช้ได้เฉพาะแพลนที่เปิด cowork (Pro ขึ้นไป)
// ค่าโมเดล: เครื่องเรียก /v1 ด้วย key ชั่วคราว "Cloud Agent" ของลูกค้า (หักลิมิตแพลน) · key ถูกเพิกถอนเมื่อจบแต่ละรอบ
import { err, json, planOf, rand, sha } from './core.js';
import { slug } from './api.js';
import { siteUrl } from './billing.js';

export const CW_MAX_MS = 30 * 60e3, CW_RUNNING = 5, CW_FILE_MAX = 15e6, CW_IN_MAX = 25e6, CW_FILES = 300;
export const COWORK_MODEL = 'Claude Sonnet 5.5 Eco';
const TABLE = 'CREATE TABLE IF NOT EXISTS cowork_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, events TEXT, final TEXT, files TEXT, history TEXT, key_id INTEGER, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)';
export const ensureCowork = env => env.DB.batch([env.DB.prepare(TABLE), env.DB.prepare('CREATE INDEX IF NOT EXISTS cowork_user ON cowork_tasks(user_id, updated_at)')]);
const r2key = (t, p) => `cowork/${t.user_id}/${t.id}/${p}`;
const cleanPath = p => String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(x => x && x !== '..' && x !== '.').join('/').slice(0, 300);
export const coworkModel = env => env.DB.prepare('SELECT * FROM models WHERE active=1 AND name=?').bind(COWORK_MODEL).first();
const mimeOf = p => ({ xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf', png: 'image/png', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv; charset=utf-8', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json' })[String(p).split('.').pop().toLowerCase()] || 'application/octet-stream';
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = buf => { const b = new Uint8Array(buf); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(o); };

async function appendEvents(env, id, evs) {
  const row = await env.DB.prepare('SELECT events FROM cowork_tasks WHERE id=?').bind(id).first(); if (!row) return;
  const all = [...JSON.parse(row.events || '[]'), ...evs].slice(-600);
  let s = JSON.stringify(all); while (s.length > 900000 && all.length > 50) { all.splice(0, 50); s = JSON.stringify(all); }
  await env.DB.prepare('UPDATE cowork_tasks SET events=?, updated_at=? WHERE id=?').bind(s, Date.now(), id).run();
}
export const coworkEvents = appendEvents;

// จบรอบ: เก็บทุกไฟล์ในโฟลเดอร์งานลง R2 · สรุปบทสนทนาไว้เริ่มใหม่ได้ถ้าเครื่องถูกปิด · เพิกถอน key
export async function finishCowork(env, id, res) {
  const t = await env.DB.prepare('SELECT * FROM cowork_tasks WHERE id=?').bind(id).first(); if (!t || t.status !== 'running') return;
  let files = JSON.parse(t.files || '[]');
  if (res.files && env.SLIPS) {
    const keep = new Map(files.map(f => [f.path, f]));
    for (const f of res.files.slice(0, CW_FILES)) {
      const p = cleanPath(f.path); if (!p) continue; const old = keep.get(p);
      if (old && old.mtime === f.mtime && old.size === f.size) continue;
      const m = /^data:[\w/.+-]+;base64,(.*)$/s.exec(f.content || ''), body = m ? b64(m[1]) : new TextEncoder().encode(String(f.content ?? ''));
      await env.SLIPS.put(r2key(t, p), body, { httpMetadata: { contentType: mimeOf(p) } });
      keep.set(p, { path: p, size: body.length, mtime: f.mtime, at: Date.now(), by: old?.by || 'ai' });
    }
    const now = new Set(res.files.map(f => cleanPath(f.path)));
    if (res.files.length < CW_FILES) for (const [p, f] of keep) if (!now.has(p) && f.by === 'ai') { keep.delete(p); await env.SLIPS.delete(r2key(t, p)).catch(() => {}); } // AI ลบไฟล์ที่มันสร้างเอง (รายการเต็ม 300 ไฟล์ = อาจตกหล่น: ไม่ลบ)
    files = [...keep.values()];
  }
  const hist = JSON.parse(t.history || '[]'); if (res.final) hist.push({ role: 'assistant', content: String(res.final).slice(0, 8000) });
  await env.DB.batch([
    env.DB.prepare('UPDATE cowork_tasks SET status=?, final=?, files=?, history=?, error=?, updated_at=? WHERE id=?').bind(res.status === 'done' ? 'done' : 'error', String(res.final || '').slice(0, 20000), JSON.stringify(files), JSON.stringify(hist.slice(-40)), res.error ? String(res.error).slice(0, 1000) : null, Date.now(), id),
    env.DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=?').bind(t.key_id || 0),
  ]);
  await appendEvents(env, id, [{ type: 'end', status: res.status, error: res.error || null, t: Date.now() }]);
  try { const { sendPush } = await import('./push.js'); await sendPush(env, t.user_id, { title: 'Cowork ' + (res.status === 'done' ? 'เสร็จแล้ว' : 'หยุดแล้ว') + ' · ' + t.title.slice(0, 40), body: String(res.final || res.error || '').slice(0, 140), url: '/chat?mode=cowork&task=' + id }); } catch { /* ไม่ได้เปิดแจ้งเตือน */ }
}

// เริ่มรอบใหม่ (งานใหม่ หรือข้อความต่อ) ในเครื่องของงานนั้น
async function startTurn(env, u, t, prompt, m, follow) {
  const key = 'sk-astra-' + rand(24), now = Date.now();
  const kid = (await env.DB.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at,expires_at) VALUES (?,?,?,?,?,?) RETURNING id').bind(u.id, 'Cloud Agent', await sha(key), key.slice(0, 14), now, now + CW_MAX_MS + 10 * 60e3).first()).id;
  const hist = JSON.parse(t.history || '[]');
  await env.DB.prepare("UPDATE cowork_tasks SET status='running', key_id=?, error=NULL, history=?, updated_at=? WHERE id=?").bind(kid, JSON.stringify([...hist, { role: 'user', content: prompt.slice(0, 8000) }].slice(-40)), now, t.id).run();
  await appendEvents(env, t.id, [{ type: 'user', text: prompt.slice(0, 20000), t: now }]);
  // ไฟล์ทั้งหมดของงาน (เผื่อเครื่องถูกปิดไปแล้ว ต้องวางไฟล์ใหม่) · DO ตัดสินเองว่าต้องส่งไหม
  const files = [];
  let total = 0; // ส่งไฟล์ไปวางใหม่ได้ไม่เกิน ~25MB ต่อรอบ (เกินนี้ใช้ไฟล์ที่ยังอยู่ในเครื่อง)
  if (env.SLIPS) for (const f of JSON.parse(t.files || '[]').slice(0, CW_FILES)) { if ((total += f.size || 0) > CW_IN_MAX) break; const o = await env.SLIPS.get(r2key(t, f.path)); if (!o) continue; const buf = await o.arrayBuffer(); files.push({ path: f.path, content: /^(text|application\/json)/.test(mimeOf(f.path)) ? new TextDecoder().decode(buf) : 'data:application/octet-stream;base64,' + toB64(buf) }); }
  const skills = (await env.DB.prepare('SELECT name, content FROM skills WHERE user_id=? AND enabled=1 ORDER BY id LIMIT 20').bind(u.id).all().catch(() => ({ results: [] }))).results.map(s => `## ${s.name}\n${s.content}`).join('\n\n').slice(0, 30000); // Skills ของลูกค้าใช้ใน Cowork ด้วย
  const stub = env.AGENTBOX.get(env.AGENTBOX.idFromName('cw:' + t.id));
  const r = await stub.fetch('https://box/start', { method: 'POST', body: JSON.stringify({ id: t.id, kind: 'cowork', run: { cowork: true, follow, site: siteUrl(env), key, model: slug(m), prompt, files, skills, history: hist.slice(-30), maxRounds: 120, effort: null } }) });
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
}

export async function coworkApi(req, env, u, path, M, url) {
  if (!path.startsWith('/api/cowork')) return null;
  const DB = env.DB; await ensureCowork(env);
  if (path === '/api/cowork' && M === 'GET') return json((await DB.prepare('SELECT id, title, status, updated_at FROM cowork_tasks WHERE user_id=? ORDER BY updated_at DESC LIMIT 60').bind(u.id).all()).results);
  const gate = async () => {
    const plan = await planOf(env, u);
    if (!plan?.cowork) return err('Cowork ใช้ได้กับแพลน Pro ขึ้นไป', 402);
    if (!env.AGENTBOX) return err('Cowork บนคลาวด์ยังไม่เปิดในระบบ (รอเครื่องเสมือน) · ใช้ในแอป Desktop ได้', 503);
    if (!env.SLIPS) return err('ระบบเก็บไฟล์ (R2) ยังไม่เปิด', 503);
    if ((await DB.prepare("SELECT COUNT(*) n FROM cowork_tasks WHERE user_id=? AND status='running'").bind(u.id).first()).n) return err('มีงาน Cowork ทำอยู่แล้ว รอให้เสร็จหรือกดหยุดก่อน', 429);
    if ((await DB.prepare("SELECT COUNT(*) n FROM cowork_tasks WHERE status='running' AND updated_at>?").bind(Date.now() - CW_MAX_MS - 120e3).first()).n >= CW_RUNNING) return err('เครื่อง Cowork เต็ม ลองใหม่ในไม่กี่นาที', 503);
    const m = await coworkModel(env); if (!m) return err('ไม่พบโมเดล ' + COWORK_MODEL, 503);
    return m;
  };
  // ไฟล์ที่ลูกค้าแนบ: [{ name, data (base64 หรือข้อความ), text? }] → R2
  const putInputs = async (t, list) => {
    const files = JSON.parse(t.files || '[]'), map = new Map(files.map(f => [f.path, f])); let total = 0;
    for (const f of (Array.isArray(list) ? list : []).slice(0, 20)) {
      const p = cleanPath(f.name); if (!p) continue;
      const body = f.b64 ? b64(String(f.b64)) : new TextEncoder().encode(String(f.text ?? '')); total += body.length;
      if (body.length > CW_FILE_MAX || total > CW_IN_MAX) throw new Error('ไฟล์ใหญ่เกิน (ไฟล์ละไม่เกิน 15MB รวมไม่เกิน 25MB ต่อครั้ง)');
      await env.SLIPS.put(r2key(t, p), body, { httpMetadata: { contentType: mimeOf(p) } });
      map.set(p, { path: p, size: body.length, mtime: Date.now(), at: Date.now(), by: 'user' });
    }
    t.files = JSON.stringify([...map.values()]);
    await DB.prepare('UPDATE cowork_tasks SET files=? WHERE id=?').bind(t.files, t.id).run();
  };
  if (path === '/api/cowork' && M === 'POST') {
    const b = await req.json().catch(() => ({})), prompt = String(b.prompt || '').trim().slice(0, 20000); if (!prompt) return err('พิมพ์งานที่ต้องการก่อน');
    const m = await gate(); if (m instanceof Response) return m;
    const now = Date.now(), t = await DB.prepare("INSERT INTO cowork_tasks (user_id,title,status,events,files,history,created_at,updated_at) VALUES (?,?,'idle','[]','[]','[]',?,?) RETURNING *").bind(u.id, prompt.replace(/\s+/g, ' ').slice(0, 80), now, now).first();
    try { await putInputs(t, b.files); await startTurn(env, u, t, prompt, m, false); }
    catch (e) { await finishCowork(env, t.id, { status: 'error', error: 'เริ่มงานไม่สำเร็จ: ' + e.message }); await DB.prepare("UPDATE cowork_tasks SET status='error', error=? WHERE id=? AND status='idle'").bind('เริ่มงานไม่สำเร็จ: ' + String(e.message).slice(0, 300), t.id).run(); return err('เริ่มงานไม่สำเร็จ: ' + e.message, e.message.includes('ใหญ่เกิน') ? 413 : 502); }
    return json({ id: t.id });
  }
  const r = path.match(/^\/api\/cowork\/(\d+)(\/say|\/stop|\/file|\/answer)?$/); if (!r) return err('not found', 404);
  const t = await DB.prepare('SELECT * FROM cowork_tasks WHERE id=? AND user_id=?').bind(+r[1], u.id).first(); if (!t) return err('ไม่พบงาน', 404);
  if (!r[2] && M === 'GET') { const from = +url.searchParams.get('from') || 0, ev = JSON.parse(t.events || '[]'); return json({ id: t.id, title: t.title, status: t.status, error: t.error, files: JSON.parse(t.files || '[]'), events: ev.slice(from), total: ev.length, model: COWORK_MODEL }); }
  if (!r[2] && M === 'PUT') { const b = await req.json().catch(() => ({})); if (b.title) await DB.prepare('UPDATE cowork_tasks SET title=? WHERE id=?').bind(String(b.title).slice(0, 80), t.id).run(); return json({ ok: true }); }
  if (!r[2] && M === 'DELETE') {
    if (t.status === 'running' && env.AGENTBOX) await env.AGENTBOX.get(env.AGENTBOX.idFromName('cw:' + t.id)).fetch('https://box/stop', { method: 'POST' }).catch(() => {});
    if (env.SLIPS) for (const f of JSON.parse(t.files || '[]')) await env.SLIPS.delete(r2key(t, f.path)).catch(() => {});
    await DB.batch([DB.prepare('DELETE FROM cowork_tasks WHERE id=?').bind(t.id), DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=?').bind(t.key_id || 0)]); return json({ ok: true });
  }
  if (r[2] === '/answer' && M === 'POST') { // ตอบคำถามที่ AI ถาม (ask_user) ระหว่างทำงาน
    const b = await req.json().catch(() => ({})); if (t.status !== 'running' || !env.AGENTBOX) return err('งานนี้ไม่ได้รอคำตอบแล้ว', 409);
    const x = await env.AGENTBOX.get(env.AGENTBOX.idFromName('cw:' + t.id)).fetch('https://box/answer', { method: 'POST', body: JSON.stringify({ id: String(b.ask_id || ''), text: String(b.text || '').slice(0, 4000) }) });
    return x.ok ? json({ ok: true }) : err('คำถามนี้หมดเวลาหรือถูกตอบไปแล้ว', 409);
  }
  if (r[2] === '/stop' && M === 'POST') { if (t.status === 'running' && env.AGENTBOX) await env.AGENTBOX.get(env.AGENTBOX.idFromName('cw:' + t.id)).fetch('https://box/stop', { method: 'POST' }).catch(() => {}); return json({ ok: true }); }
  if (r[2] === '/file' && M === 'GET') {
    const p = cleanPath(url.searchParams.get('path')); if (!JSON.parse(t.files || '[]').some(f => f.path === p)) return err('ไม่พบไฟล์', 404);
    const o = env.SLIPS && await env.SLIPS.get(r2key(t, p)); if (!o) return err('ไม่พบไฟล์', 404);
    const inline = url.searchParams.get('view') === '1' && /^(image\/|video\/mp4|audio\/|application\/pdf|text\/plain|text\/csv|text\/markdown)/.test(mimeOf(p));
    return new Response(o.body, { headers: { 'content-type': mimeOf(p), 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(p.split('/').pop())}`, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox", 'cache-control': 'private, max-age=0' } });
  }
  if (r[2] === '/file' && M === 'POST') { try { await putInputs(t, (await req.json().catch(() => ({}))).files); } catch (e) { return err(e.message, 413); } return json({ ok: true, files: JSON.parse(t.files) }); }
  if (r[2] === '/say' && M === 'POST') {
    const b = await req.json().catch(() => ({})), prompt = String(b.prompt || '').trim().slice(0, 20000); if (!prompt) return err('พิมพ์ข้อความก่อน');
    const m = await gate(); if (m instanceof Response) return m;
    try { await putInputs(t, b.files); await startTurn(env, u, t, prompt, m, true); }
    catch (e) { await finishCowork(env, t.id, { status: 'error', error: 'ส่งข้อความไม่สำเร็จ: ' + e.message }); return err('ส่งข้อความไม่สำเร็จ: ' + e.message, e.message.includes('ใหญ่เกิน') ? 413 : 502); }
    return json({ ok: true });
  }
  return err('not found', 404);
}
// เปิดงาน Cowork จากระบบ (งานตามเวลา) · ตรวจสิทธิ์แบบเดียวกับกดเอง
export async function coworkStart(env, u, prompt) {
  await ensureCowork(env);
  const plan = await planOf(env, u); if (!plan?.cowork) throw new Error('แพลนไม่รองรับ Cowork');
  if (!env.AGENTBOX || !env.SLIPS) throw new Error('Cowork บนคลาวด์ยังไม่เปิดในระบบ');
  if ((await env.DB.prepare("SELECT COUNT(*) n FROM cowork_tasks WHERE user_id=? AND status='running'").bind(u.id).first()).n) throw new Error('มีงาน Cowork ทำอยู่แล้ว');
  const m = await coworkModel(env); if (!m) throw new Error('ไม่พบโมเดล ' + COWORK_MODEL);
  const now = Date.now(), t = await env.DB.prepare("INSERT INTO cowork_tasks (user_id,title,status,events,files,history,created_at,updated_at) VALUES (?,?,'idle','[]','[]','[]',?,?) RETURNING *").bind(u.id, prompt.replace(/\s+/g, ' ').slice(0, 80), now, now).first();
  try { await startTurn(env, u, t, prompt.slice(0, 20000), m, false); return t.id; }
  catch (e) { await finishCowork(env, t.id, { status: 'error', error: 'เริ่มงานไม่สำเร็จ: ' + e.message }); await env.DB.prepare("UPDATE cowork_tasks SET status='error', error=? WHERE id=? AND status='idle'").bind('เริ่มงานไม่สำเร็จ: ' + String(e.message).slice(0, 300), t.id).run(); throw e; }
}
// งานค้าง running นานเกิน (เครื่องหายกลางทาง): ปิดเป็น error (เรียกจาก cron)
export async function reapCowork(env) {
  await ensureCowork(env);
  for (const t of (await env.DB.prepare("SELECT id FROM cowork_tasks WHERE status='running' AND updated_at<?").bind(Date.now() - CW_MAX_MS - 15 * 60e3).all()).results) await finishCowork(env, t.id, { status: 'error', error: 'งานค้างเกินเวลา ปิดให้แล้ว' });
}
