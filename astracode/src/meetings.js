// AI ประชุม: อัดเสียง/อัปไฟล์ → ถอดความแยกผู้พูด (โมเดลที่ฟังเสียงได้ เช่น Gemini) → สรุป ข้อตกลง รายการงาน → ถามต่อในแชต
// เบราว์เซอร์แปลงเสียงเป็น WAV 16kHz mono ตัดเป็นช่วงละ ~3 นาที แล้วส่งทีละช่วง (อัดสด: ส่งระหว่างอัด เน็ตหลุดไม่เสียส่วนที่ส่งแล้ว)
// แต่ละช่วงถอดทันทีในคำขอที่ส่งขึ้นมา · ช่วงที่ค้าง (ปิดหน้าไปก่อน / โมเดลล่ม) cron ทุกชั่วโมงถอดต่อ แล้วสรุปให้เมื่อครบ
// คิดเงิน: หักลิมิตแพลนตามต้นทุนจริงของโมเดล (เหมือนแชต) · ลิมิตเต็ม = หยุดถอด ช่วงที่เหลือรอจนลิมิตคืน
// ไฟล์เสียงเก็บใน R2 meet/<uid>/<id>/<n>.wav 30 วัน (cron ลบ) · ข้อความเก็บถาวรจนกว่าเจ้าของลบ
import { err, json, limited, planOf, pickBucket, usageStatus } from './core.js';
import { callModel, logUsage } from './ai.js';
import { getSetting } from './billing.js';

export const MEET_SEG_MAX = 12e6, MEET_MAX_SEGS = 70, MEET_KEEP_AUDIO = 30 * 864e5, MEET_DAY_MAX = 30;
export const MEET_TABLES = [
  "CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'recording', segs INTEGER NOT NULL DEFAULT 0, dur REAL NOT NULL DEFAULT 0, speakers TEXT, summary TEXT, error TEXT, audio_gone INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  'CREATE INDEX IF NOT EXISTS meetings_user ON meetings(user_id, created_at)',
  "CREATE TABLE IF NOT EXISTS meeting_segs (meeting_id INTEGER NOT NULL, n INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', dur REAL NOT NULL DEFAULT 0, lines TEXT, error TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (meeting_id, n))",
];

// โมเดลถอดเสียง: ตั้งในหลังบ้าน (meeting_model) หรือ Gemini ตัวแรกที่มีคีย์
export async function meetModel(env) {
  const id = +(await getSetting(env, 'meeting_model')) || 0;
  const rows = (await env.DB.prepare("SELECT * FROM models WHERE active=1 AND provider NOT IN ('image','embedding') ORDER BY sort, id").all()).results.filter(m => env[m.key_name]);
  return (id && rows.find(m => m.id === id)) || rows.find(m => /gemini/i.test(m.name + ' ' + m.api_model)) || null;
}

const SEG_PROMPT = `You transcribe one part of a meeting recording. Output ONLY JSON lines, one per utterance, nothing else:
{"t": <start second within THIS audio part>, "s": "<speaker label>", "x": "<exact words>"}
Rules: transcribe in the language actually spoken (Thai stays Thai, mixed Thai-English stays mixed); do not translate or summarize; keep filler words out; merge very short back-channel sounds into the next line.
Speakers: label voices "ผู้พูด 1", "ผู้พูด 2" ... consistently. If a name is clearly said (introductions, someone addressed by name), still use the label, the user renames later.
If the audio has no speech, output nothing.`;

// แปลงผลโมเดลเป็นบรรทัด [{t, s, x}] (รับทั้ง JSON lines, JSON array, หรือข้อความธรรมดา)
export function parseLines(text) {
  const out = [], raw = String(text || '').replace(/^```\w*\n?|```$/gm, '').trim();
  const push = o => { if (o && typeof o === 'object' && String(o.x ?? o.text ?? '').trim()) out.push({ t: Math.max(0, +(o.t ?? o.start ?? 0) || 0), s: String(o.s ?? o.speaker ?? 'ผู้พูด 1').slice(0, 40), x: String(o.x ?? o.text).trim().slice(0, 4000) }); };
  if (raw.startsWith('[')) { try { JSON.parse(raw).forEach(push); return out; } catch { /* ลองทีละบรรทัด */ } }
  for (const l of raw.split('\n')) { const s = l.trim().replace(/,$/, ''); if (!s) continue; if (s.startsWith('{')) { try { push(JSON.parse(s)); continue; } catch { /* ข้อความธรรมดา */ } } if (!/^[[\]]$/.test(s)) out.push({ t: 0, s: 'ผู้พูด 1', x: s.slice(0, 4000) }); }
  return out;
}

const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

// ลิมิต + เลือกใบ (หลายแพลน) ก่อนเรียกโมเดล · คืน { plan } หรือ { error }
async function gate(env, u, m) {
  let plan = await planOf(env, u);
  if (plan?._subs?.length) plan = await pickBucket(env, u, plan, m.id);
  const st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return { error: 'ลิมิตเต็มแล้ว ช่วงที่เหลือจะถอดต่อเองเมื่อลิมิตคืน', full: true };
  return { plan };
}

async function ask(env, u, m, plan, msgs, { system, maxTokens = 8000, timeout = 240e3 }) {
  let out = '', usage = null;
  for await (const e of callModel(env, m, msgs, { effort: null, system, maxTokens, userId: u.id, signal: AbortSignal.timeout(timeout) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; }
  if (usage) await logUsage(env, u.id, m, usage, { plan, src: 'meeting' });
  return out;
}

// ถอดหนึ่งช่วง (ใช้ทั้งตอนอัปโหลดและ cron) · คืน true = เสร็จ
export async function transcribeSeg(env, u, meet, n) {
  const seg = await env.DB.prepare('SELECT * FROM meeting_segs WHERE meeting_id=? AND n=?').bind(meet.id, n).first();
  if (!seg || seg.status === 'done') return true;
  const m = await meetModel(env); if (!m) { await setSeg(env, meet.id, n, 'error', null, 'ยังไม่ได้ตั้งโมเดลถอดเสียง (หลังบ้าน → ตั้งค่า → AI ประชุม)'); return false; }
  const g = await gate(env, u, m); if (g.error) { await env.DB.prepare('UPDATE meeting_segs SET error=? WHERE meeting_id=? AND n=?').bind(g.error, meet.id, n).run(); return false; }
  const obj = await env.SLIPS.get(`meet/${u.id}/${meet.id}/${n}.wav`); if (!obj) { await setSeg(env, meet.id, n, 'error', null, 'ไม่พบไฟล์เสียงของช่วงนี้'); return false; }
  const audio = new Uint8Array(await new Response(obj.body).arrayBuffer());
  // ผู้พูดต่อเนื่องข้ามช่วง: ส่งท้ายของช่วงก่อนให้โมเดลรู้ว่าใครพูดอะไรไปแล้ว
  const prev = n > 0 ? await env.DB.prepare("SELECT lines FROM meeting_segs WHERE meeting_id=? AND n=? AND status='done'").bind(meet.id, n - 1).first() : null;
  const tail = prev ? JSON.parse(prev.lines || '[]').slice(-8).map(l => `${l.s}: ${l.x}`).join('\n') : '';
  await env.DB.prepare('UPDATE meeting_segs SET tries=tries+1 WHERE meeting_id=? AND n=?').bind(meet.id, n).run();
  try {
    const text = await ask(env, u, m, g.plan, [{ role: 'user', content: [
      { type: 'text', text: `Meeting: ${meet.title}\nThis is part ${n + 1}.${tail ? `\nEnd of the previous part (keep the same speaker labels for the same voices):\n${tail}` : ''}` },
      { type: 'input_audio', input_audio: { data: b64(audio), format: 'wav' } },
    ] }], { system: SEG_PROMPT });
    await setSeg(env, meet.id, n, 'done', parseLines(text), null);
    return true;
  } catch (e) {
    const fin = seg.tries + 1 >= 4; // ลอง 4 ครั้ง (ตอนส่ง + cron) แล้วยอมแพ้ช่วงนี้
    await setSeg(env, meet.id, n, fin ? 'error' : 'pending', null, 'ถอดเสียงไม่สำเร็จ: ' + String(e.message || e).slice(0, 200));
    return false;
  }
}
const setSeg = (env, id, n, status, lines, error) => env.DB.prepare('UPDATE meeting_segs SET status=?, lines=COALESCE(?,lines), error=? WHERE meeting_id=? AND n=?').bind(status, lines ? JSON.stringify(lines) : null, error, id, n).run();

// บทถอดความทั้งการประชุม (เวลาเทียบจากต้นการประชุม)
export async function transcript(env, id) {
  const segs = (await env.DB.prepare('SELECT n, dur, status, lines, error FROM meeting_segs WHERE meeting_id=? ORDER BY n').bind(id).all()).results;
  let off = 0; const lines = [];
  for (const s of segs) { for (const l of JSON.parse(s.lines || '[]')) lines.push({ ...l, t: Math.round((off + Math.min(l.t, s.dur || l.t)) * 10) / 10, n: s.n, o: Math.min(l.t, s.dur || l.t) }); off += s.dur || 0; }
  return { lines, segs: segs.map(s => ({ n: s.n, dur: s.dur, status: s.status, error: s.error })) };
}
const fmtT = t => { t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const named = (sp, s) => (sp && sp[s]) || s;
export const plainText = (lines, sp) => lines.map(l => `[${fmtT(l.t)}] ${named(sp, l.s)}: ${l.x}`).join('\n');

const SUM_PROMPT = `You write meeting minutes from a transcript. Reply in the language of the meeting (Thai meeting → Thai). Output ONLY one JSON object:
{"title": "<short meeting title>", "summary": "<markdown: 3-8 bullet points of what was discussed>", "decisions": ["<agreed decision>", ...], "actions": [{"who": "<person or speaker label>", "what": "<task>", "when": "<deadline as said, or empty>"}], "speakers": {"<speaker label>": "<real name if clearly stated in the meeting, else empty>"}}
Only include decisions and actions that were actually agreed or assigned. Never invent names, numbers or deadlines.`;

// สรุปเมื่อทุกช่วงเสร็จ (ช่วงที่ถอดไม่ได้ข้ามไป)
export async function summarize(env, u, meet) {
  const tr = await transcript(env, meet.id);
  if (tr.segs.some(s => s.status === 'pending')) return false;
  if (!tr.lines.length) { await env.DB.prepare("UPDATE meetings SET status='done', summary=?, updated_at=? WHERE id=?").bind(JSON.stringify({ summary: 'ไม่พบเสียงพูดในไฟล์นี้', decisions: [], actions: [] }), Date.now(), meet.id).run(); return true; }
  const m = await meetModel(env); if (!m) return false;
  const g = await gate(env, u, m); if (g.error) { await env.DB.prepare('UPDATE meetings SET error=?, updated_at=? WHERE id=?').bind(g.error, Date.now(), meet.id).run(); return false; }
  await env.DB.prepare("UPDATE meetings SET status='summarizing', updated_at=? WHERE id=?").bind(Date.now(), meet.id).run();
  try {
    const text = await ask(env, u, m, g.plan, [{ role: 'user', content: `Meeting: ${meet.title}\n\nTranscript:\n${plainText(tr.lines, JSON.parse(meet.speakers || '{}')).slice(-400000)}` }], { system: SUM_PROMPT, maxTokens: 6000 });
    let o = {}; try { o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { o = { summary: text.trim() }; }
    const sum = { summary: String(o.summary || '').slice(0, 20000), decisions: (Array.isArray(o.decisions) ? o.decisions : []).map(String).slice(0, 50), actions: (Array.isArray(o.actions) ? o.actions : []).filter(a => a && a.what).map(a => ({ who: String(a.who || ''), what: String(a.what), when: String(a.when || '') })).slice(0, 80) };
    const sp = { ...JSON.parse(meet.speakers || '{}') }; for (const [k, v] of Object.entries(o.speakers || {})) if (v && !sp[k]) sp[k] = String(v).slice(0, 40); // ชื่อจริงที่ AI เจอ (ผู้ใช้แก้ทับได้)
    const title = /^(การประชุม|ประชุม|บันทึกเสียง)\s/.test(meet.title) && o.title ? String(o.title).slice(0, 100) : meet.title;
    await env.DB.prepare("UPDATE meetings SET status='done', summary=?, speakers=?, title=?, error=NULL, updated_at=? WHERE id=?").bind(JSON.stringify(sum), JSON.stringify(sp), title, Date.now(), meet.id).run();
    return true;
  } catch (e) {
    await env.DB.prepare("UPDATE meetings SET status='processing', error=?, updated_at=? WHERE id=?").bind('สรุปไม่สำเร็จ จะลองใหม่อัตโนมัติ: ' + String(e.message || e).slice(0, 160), Date.now(), meet.id).run();
    return false;
  }
}

const view = m => ({ id: m.id, title: m.title, status: m.status, segs: m.segs, dur: m.dur, error: m.error, audio: !m.audio_gone, created_at: m.created_at, updated_at: m.updated_at });

export async function meetApi(req, env, ctx, u, path, M, url) {
  if (!path.startsWith('/api/meetings')) return null;
  const DB = env.DB;
  if (path === '/api/meetings' && M === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { // ค้นข้ามการประชุม: ชื่อ สรุป และบทถอดความ
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      return json({ items: (await DB.prepare("SELECT DISTINCT m.* FROM meetings m LEFT JOIN meeting_segs s ON s.meeting_id=m.id WHERE m.user_id=? AND (m.title LIKE ? OR m.summary LIKE ? OR s.lines LIKE ?) ORDER BY m.created_at DESC LIMIT 50").bind(u.id, like, like, like).all()).results.map(view) });
    }
    return json({ items: (await DB.prepare('SELECT * FROM meetings WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(u.id).all()).results.map(view), ready: !!(await meetModel(env)) && !!env.SLIPS });
  }
  if (path === '/api/meetings' && M === 'POST') {
    if (!env.SLIPS) return err('ยังไม่ได้ผูกที่เก็บไฟล์ (R2)', 503);
    if (!await meetModel(env)) return err('ยังไม่เปิดใช้ AI ประชุม (แอดมินยังไม่ได้ตั้งโมเดลถอดเสียง)', 503);
    if (await limited(env, 'meetnew:' + u.id, MEET_DAY_MAX, 864e5)) return err(`สร้างการประชุมได้ไม่เกิน ${MEET_DAY_MAX} ครั้งต่อวัน`, 429);
    const b = await req.json().catch(() => ({})), now = Date.now();
    const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'การประชุม ' + new Date(now + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    const r = await DB.prepare("INSERT INTO meetings (user_id,title,status,created_at,updated_at) VALUES (?,?,'recording',?,?) RETURNING *").bind(u.id, title, now, now).first();
    return json(view(r));
  }
  const mm = path.match(/^\/api\/meetings\/(\d+)(?:\/(seg|audio)\/(\d+)|\/(finish|retry|chat))?$/); if (!mm) return err('not found', 404);
  const meet = await DB.prepare('SELECT * FROM meetings WHERE id=? AND user_id=?').bind(+mm[1], u.id).first();
  if (!meet) return err('ไม่พบการประชุม', 404);
  const n = mm[3] != null ? +mm[3] : null, act = mm[4];
  if (mm[2] === 'seg' && M === 'POST') { // ส่งเสียงหนึ่งช่วง (WAV) แล้วถอดทันที
    if (meet.status !== 'recording') return err('การประชุมนี้จบการอัดแล้ว', 409);
    if (n >= MEET_MAX_SEGS) return err('ยาวเกิน 3 ชั่วโมง', 413);
    const dur = Math.min(Math.max(+url.searchParams.get('dur') || 0, 0), 900);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length < 44 || buf.length > MEET_SEG_MAX || String.fromCharCode(...buf.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...buf.subarray(8, 12)) !== 'WAVE') return err('ไฟล์เสียงช่วงนี้ไม่ถูกต้อง (ต้องเป็น WAV ไม่เกิน 12MB)', 400);
    await env.SLIPS.put(`meet/${u.id}/${meet.id}/${n}.wav`, buf, { httpMetadata: { contentType: 'audio/wav' } });
    const ins = await DB.prepare("INSERT INTO meeting_segs (meeting_id,n,dur,created_at) VALUES (?,?,?,?) ON CONFLICT(meeting_id,n) DO UPDATE SET dur=excluded.dur, status=CASE WHEN status='done' THEN 'done' ELSE 'pending' END, tries=0").bind(meet.id, n, dur, Date.now()).run();
    await DB.prepare('UPDATE meetings SET segs=(SELECT COUNT(*) FROM meeting_segs WHERE meeting_id=?1), dur=(SELECT COALESCE(SUM(dur),0) FROM meeting_segs WHERE meeting_id=?1), updated_at=?2 WHERE id=?1').bind(meet.id, Date.now()).run();
    void ins;
    const ok = await transcribeSeg(env, u, meet, n);
    const s = await DB.prepare('SELECT status, error, lines FROM meeting_segs WHERE meeting_id=? AND n=?').bind(meet.id, n).first();
    return json({ ok, n, status: s.status, error: s.error, lines: JSON.parse(s.lines || '[]').length });
  }
  if (mm[2] === 'audio' && M === 'GET') {
    const o = await env.SLIPS.get(`meet/${u.id}/${meet.id}/${n}.wav`); if (!o) return err('ไฟล์เสียงถูกลบแล้ว (เก็บ 30 วัน)', 404);
    return new Response(o.body, { headers: { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=3600' } });
  }
  if (act === 'finish' && M === 'POST') { // จบการอัด → ถอดช่วงที่ค้าง แล้วสรุป
    await DB.prepare("UPDATE meetings SET status='processing', updated_at=? WHERE id=? AND status='recording'").bind(Date.now(), meet.id).run();
    const fresh = await DB.prepare('SELECT * FROM meetings WHERE id=?').bind(meet.id).first();
    const pend = (await DB.prepare("SELECT n FROM meeting_segs WHERE meeting_id=? AND status='pending' ORDER BY n").bind(meet.id).all()).results;
    for (const p of pend) await transcribeSeg(env, u, fresh, p.n);
    if (fresh.status !== 'done') await summarize(env, u, fresh);
    return meetGet(env, meet.id);
  }
  if (act === 'retry' && M === 'POST') { // ลองใหม่: ช่วงที่ error กลับเป็น pending แล้วทำเหมือนจบการอัด
    await DB.prepare("UPDATE meeting_segs SET status='pending', tries=0, error=NULL WHERE meeting_id=? AND status='error'").bind(meet.id).run();
    await DB.prepare("UPDATE meetings SET status='processing', error=NULL WHERE id=? AND status<>'recording'").bind(meet.id).run();
    const fresh = await DB.prepare('SELECT * FROM meetings WHERE id=?').bind(meet.id).first();
    for (const p of (await DB.prepare("SELECT n FROM meeting_segs WHERE meeting_id=? AND status='pending' ORDER BY n").bind(meet.id).all()).results) await transcribeSeg(env, u, fresh, p.n);
    if (fresh.status !== 'recording') await summarize(env, u, fresh);
    return meetGet(env, meet.id);
  }
  if (act === 'chat' && M === 'POST') { // ถามต่อ: เปิดแชตใหม่ที่มีบทถอดความเป็นคำสั่งของแชต
    const tr = await transcript(env, meet.id), sp = JSON.parse(meet.speakers || '{}'), sum = JSON.parse(meet.summary || '{}');
    const ins = `Answer questions about this meeting using only the transcript and minutes below. Quote the time [m:ss] when you cite what someone said. If the answer is not in the meeting, say so.\n\nMeeting: ${meet.title}\n\nMinutes:\n${sum.summary || ''}\n${(sum.actions || []).map(a => `- ${a.who}: ${a.what} ${a.when}`).join('\n')}\n\nTranscript:\n${plainText(tr.lines, sp)}`.slice(0, 300000);
    const c = await DB.prepare('INSERT INTO chats (user_id,title,created_at,instructions) VALUES (?,?,?,?) RETURNING id').bind(u.id, 'ประชุม: ' + meet.title.slice(0, 80), Date.now(), ins).first();
    return json({ chat_id: c.id });
  }
  if (!act && !mm[2] && M === 'GET') return meetGet(env, meet.id);
  if (!act && !mm[2] && M === 'PATCH') {
    const b = await req.json().catch(() => ({}));
    if (b.title != null) await DB.prepare('UPDATE meetings SET title=?, updated_at=? WHERE id=?').bind(String(b.title).replace(/\s+/g, ' ').trim().slice(0, 100) || meet.title, Date.now(), meet.id).run();
    if (b.speakers && typeof b.speakers === 'object') { const sp = {}; for (const [k, v] of Object.entries(b.speakers).slice(0, 30)) if (String(v).trim()) sp[String(k).slice(0, 40)] = String(v).trim().slice(0, 40); await DB.prepare('UPDATE meetings SET speakers=?, updated_at=? WHERE id=?').bind(JSON.stringify(sp), Date.now(), meet.id).run(); }
    if (b.summary && typeof b.summary === 'object') await DB.prepare('UPDATE meetings SET summary=?, updated_at=? WHERE id=?').bind(JSON.stringify(b.summary).slice(0, 60000), Date.now(), meet.id).run();
    return meetGet(env, meet.id);
  }
  if (!act && !mm[2] && M === 'DELETE') {
    await wipeAudio(env, u.id, meet);
    await DB.batch([DB.prepare('DELETE FROM meeting_segs WHERE meeting_id=?').bind(meet.id), DB.prepare('DELETE FROM meetings WHERE id=?').bind(meet.id)]);
    return json({ ok: true });
  }
  return err('not found', 404);
}

async function meetGet(env, id) {
  const m = await env.DB.prepare('SELECT * FROM meetings WHERE id=?').bind(id).first(), tr = await transcript(env, id);
  return json({ ...view(m), speakers: JSON.parse(m.speakers || '{}'), summary: m.summary ? JSON.parse(m.summary) : null, lines: tr.lines, seg_list: tr.segs });
}
async function wipeAudio(env, uid, meet) {
  const keys = Array.from({ length: Math.max(meet.segs, 0) }, (_, i) => `meet/${uid}/${meet.id}/${i}.wav`);
  if (keys.length && env.SLIPS) await env.SLIPS.delete(keys).catch(() => {});
}

// cron: ถอดช่วงที่ค้าง (เว้นช่วงที่เพิ่งส่ง 10 นาที เผื่อคำขอเดิมยังทำอยู่) · สรุปการประชุมที่ถอดครบ · ปิดการอัดที่ทิ้งไว้ 3 ชม. · ลบเสียงเก่า 30 วัน
export async function meetCron(env, now = Date.now(), log = []) {
  const DB = env.DB; if (!env.SLIPS) return;
  await DB.prepare("UPDATE meetings SET status='processing', updated_at=? WHERE status='recording' AND updated_at<?").bind(now, now - 3 * 3600e3).run();
  const pend = (await DB.prepare("SELECT s.meeting_id, s.n FROM meeting_segs s JOIN meetings m ON m.id=s.meeting_id WHERE s.status='pending' AND s.created_at<? ORDER BY s.created_at LIMIT 20").bind(now - 600e3).all()).results;
  for (const p of pend) {
    const meet = await DB.prepare('SELECT * FROM meetings WHERE id=?').bind(p.meeting_id).first(), u = meet && await DB.prepare('SELECT * FROM users WHERE id=?').bind(meet.user_id).first();
    if (u && !u.banned) { await transcribeSeg(env, u, meet, p.n); log.push('meet seg ' + p.meeting_id + '/' + p.n); }
  }
  for (const meet of (await DB.prepare("SELECT * FROM meetings WHERE status IN ('processing','summarizing') AND updated_at<? LIMIT 10").bind(now - 300e3).all()).results) {
    const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(meet.user_id).first();
    if (u && !u.banned && await summarize(env, u, meet)) log.push('meet sum ' + meet.id);
  }
  for (const meet of (await DB.prepare('SELECT * FROM meetings WHERE audio_gone IS NULL AND created_at<? LIMIT 50').bind(now - MEET_KEEP_AUDIO).all()).results) {
    await wipeAudio(env, meet.user_id, meet); await DB.prepare('UPDATE meetings SET audio_gone=1 WHERE id=?').bind(meet.id).run();
  }
}
