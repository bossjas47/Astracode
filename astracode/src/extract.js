// ดึงข้อมูลจากเอกสารทีละเยอะ: ใบเสร็จ / ใบกำกับภาษี / สลิป / ใบแจ้งหนี้ / นามบัตร / กำหนดช่องเอง → ตาราง → Excel
// เบราว์เซอร์แปลงไฟล์เป็นรูป (PDF = 2 หน้าแรก) ส่งทีละไฟล์ · เซิร์ฟเวอร์ให้โมเดลที่อ่านรูปได้ตอบเป็น JSON ตามช่อง · เก็บผลเป็นงาน (กลับมาดู/แก้/ดาวน์โหลดได้)
// คิดเงิน: หักลิมิตแพลน (โมเดลอ่านรูปที่ถูกที่สุดในแพลน หรือที่แอดมินตั้ง extract_model)
import { err, json, limited, planOf, allowedModels, pickBucket, usageStatus } from './core.js';
import { callModel, logUsage } from './ai.js';
import { getSetting } from './billing.js';

export const EX_FILES = 200, EX_IMG = 4, EX_IMG_MAX = 3e6, EX_JOBS = 100;
export const EX_TABLES = [
  'CREATE TABLE IF NOT EXISTS extract_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, fields TEXT NOT NULL, rows TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS extract_jobs_user ON extract_jobs(user_id, id)',
];
// แม่แบบ: [ชื่อช่อง, คำอธิบายให้โมเดล]
export const EX_KINDS = {
  receipt: ['ใบเสร็จ / ใบกำกับภาษี', [['วันที่', 'document date as YYYY-MM-DD'], ['เลขที่เอกสาร', ''], ['ผู้ขาย', 'seller / shop name'], ['เลขผู้เสียภาษีผู้ขาย', '13 digits'], ['รายการ', 'short list of items'], ['ยอดก่อนภาษี', 'number'], ['VAT', 'number'], ['ยอดรวม', 'grand total, number'], ['วิธีชำระ', 'cash / transfer / card if shown']]],
  slip: ['สลิปโอนเงิน', [['วันที่', 'YYYY-MM-DD'], ['เวลา', 'HH:MM'], ['ธนาคารผู้โอน', ''], ['ชื่อผู้โอน', ''], ['ชื่อผู้รับ', ''], ['บัญชีผู้รับ', 'masked number as shown'], ['จำนวนเงิน', 'number'], ['เลขอ้างอิง', 'transaction reference']]],
  invoice: ['ใบแจ้งหนี้ / ใบวางบิล', [['วันที่', 'YYYY-MM-DD'], ['เลขที่', ''], ['ผู้ออก', 'issuer'], ['ลูกค้า', 'billed to'], ['ครบกำหนด', 'due date YYYY-MM-DD'], ['ยอดก่อนภาษี', 'number'], ['VAT', 'number'], ['ยอดรวม', 'number']]],
  card: ['นามบัตร', [['ชื่อ', ''], ['ตำแหน่ง', ''], ['บริษัท', ''], ['โทร', ''], ['อีเมล', ''], ['เว็บไซต์', ''], ['ที่อยู่', ''], ['LINE', '']]],
  id: ['เอกสารทั่วไป (สรุป)', [['ประเภทเอกสาร', ''], ['วันที่', 'YYYY-MM-DD if any'], ['จาก', 'sender / issuer'], ['ถึง', 'recipient'], ['ยอดเงิน', 'number if any'], ['สรุป', 'one sentence']]],
};
const fieldsOf = (kind, custom) => kind === 'custom' ? (Array.isArray(custom) ? custom : []).map(x => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 30).map(f => [f, '']) : EX_KINDS[kind]?.[1];

export async function exModel(env, plan) {
  const set = +(await getSetting(env, 'extract_model')) || 0;
  const ms = (await allowedModels(env, plan._planIds || plan.id)).filter(m => m.vision && !['image', 'embedding'].includes(m.provider));
  const pick = ms.find(m => m.id === set) || ms.sort((a, b) => (a.cost_in + a.cost_out) - (b.cost_in + b.cost_out))[0];
  return pick ? env.DB.prepare('SELECT * FROM models WHERE id=?').bind(pick.id).first() : null;
}
export function parseRow(text, names) {
  const raw = String(text || ''), s = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let o = {}; try { o = JSON.parse(s); } catch { return null; }
  const row = {}; for (const n of names) { const v = o[n]; row[n] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 2000); }
  return row;
}

export async function extractApi(req, env, u, path, M, url) {
  if (!path.startsWith('/api/extract')) return null;
  const DB = env.DB, body = () => req.json().catch(() => ({}));
  if (path === '/api/extract' && M === 'GET') {
    const plan = await planOf(env, u);
    return json({ kinds: Object.fromEntries(Object.entries(EX_KINDS).map(([k, [label, f]]) => [k, { label, fields: f.map(x => x[0]) }])), ready: !!(await exModel(env, plan)),
      jobs: (await DB.prepare('SELECT id, title, kind, json_array_length(rows) n, created_at, updated_at FROM extract_jobs WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(u.id).all()).results });
  }
  if (path === '/api/extract' && M === 'POST') { // งานใหม่
    const b = await body(), kind = EX_KINDS[b.kind] ? b.kind : b.kind === 'custom' ? 'custom' : null; if (!kind) return err('เลือกชนิดเอกสาร');
    const f = fieldsOf(kind, b.fields); if (!f?.length) return err('ใส่ชื่อช่องที่ต้องการอย่างน้อย 1 ช่อง');
    if (await limited(env, 'exjob:' + u.id, 30, 864e5)) return err('สร้างงานได้ไม่เกิน 30 งานต่อวัน', 429);
    if ((await DB.prepare('SELECT COUNT(*) n FROM extract_jobs WHERE user_id=?').bind(u.id).first()).n >= EX_JOBS) await DB.prepare('DELETE FROM extract_jobs WHERE id=(SELECT MIN(id) FROM extract_jobs WHERE user_id=?)').bind(u.id).run(); // เก็บ 100 งานล่าสุด
    const now = Date.now(), title = String(b.title || '').trim().slice(0, 100) || (kind === 'custom' ? 'ดึงข้อมูล' : EX_KINDS[kind][0]) + ' ' + new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
    const r = await DB.prepare("INSERT INTO extract_jobs (user_id,title,kind,fields,rows,created_at,updated_at) VALUES (?,?,?,?,'[]',?,?) RETURNING id").bind(u.id, title, kind, JSON.stringify(f), now, now).first();
    return json({ id: r.id, title, fields: f.map(x => x[0]) });
  }
  const m = path.match(/^\/api\/extract\/(\d+)(\/file)?$/); if (!m) return err('not found', 404);
  const job = await DB.prepare('SELECT * FROM extract_jobs WHERE id=? AND user_id=?').bind(+m[1], u.id).first(); if (!job) return err('ไม่พบงาน', 404);
  const fields = JSON.parse(job.fields), names = fields.map(x => x[0]);
  if (!m[2] && M === 'GET') return json({ id: job.id, title: job.title, kind: job.kind, fields: names, rows: JSON.parse(job.rows) });
  if (!m[2] && M === 'PUT') { // แก้ช่องในตาราง / ลบแถว (ส่งทั้งตาราง)
    const b = await body(); if (!Array.isArray(b.rows)) return err('rows ต้องเป็น array');
    const rows = b.rows.slice(0, EX_FILES).map(r => ({ _file: String(r._file || '').slice(0, 200), _err: r._err ? String(r._err).slice(0, 200) : undefined, ...Object.fromEntries(names.map(n => [n, String(r[n] ?? '').slice(0, 2000)])) }));
    await DB.prepare('UPDATE extract_jobs SET rows=?, title=COALESCE(?,title), updated_at=? WHERE id=?').bind(JSON.stringify(rows), b.title ? String(b.title).slice(0, 100) : null, Date.now(), job.id).run();
    return json({ ok: true });
  }
  if (!m[2] && M === 'DELETE') { await DB.prepare('DELETE FROM extract_jobs WHERE id=?').bind(job.id).run(); return json({ ok: true }); }
  if (m[2] && M === 'POST') { // หนึ่งไฟล์ → หนึ่งแถว
    const b = await body(), name = String(b.name || 'ไฟล์').slice(0, 200);
    const imgs = (Array.isArray(b.images) ? b.images : []).filter(x => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length <= EX_IMG_MAX).slice(0, EX_IMG);
    if (!imgs.length) return err('ไม่มีรูปของเอกสาร (รองรับ JPG/PNG/PDF)');
    if (JSON.parse(job.rows).length >= EX_FILES) return err(`งานหนึ่งรับได้ไม่เกิน ${EX_FILES} ไฟล์ สร้างงานใหม่`, 413);
    if (await limited(env, 'exfile:' + u.id, 400, 3600e3)) return err('ส่งไฟล์ถี่เกินไป ลองใหม่ภายหลัง', 429);
    let plan = await planOf(env, u); const model = await exModel(env, plan);
    if (!model) return err('แพลนของคุณยังไม่มีโมเดลที่อ่านรูปได้', 403);
    if (plan._subs?.length) plan = await pickBucket(env, u, plan, model.id);
    const st = await usageStatus(env, u, plan); if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
    const sys = `You extract data from a document image. Reply with ONLY one JSON object with exactly these keys (Thai key names as given):\n${fields.map(([n, h]) => `- "${n}"${h ? ': ' + h : ''}`).join('\n')}\nCopy values exactly as printed (Thai stays Thai). Numbers: digits and dot only, no commas or currency. Thai Buddhist-era years (25xx) convert to Christian era for YYYY-MM-DD. Use "" when a value is not on the document. Never guess.`;
    let out = '', usage = null;
    try { for await (const e of callModel(env, model, [{ role: 'user', content: `File: ${name}` }], { effort: null, system: sys, images: imgs, maxTokens: 1500, userId: u.id, signal: AbortSignal.timeout(90e3) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; } }
    catch (e) { return err('อ่านเอกสารไม่สำเร็จ: ' + String(e.message || e).slice(0, 120), 502); }
    if (usage) await logUsage(env, u.id, model, usage, { plan, src: 'extract' });
    const row = parseRow(out, names), rec = { _file: name, ...(row || Object.fromEntries(names.map(n => [n, '']))), ...(row ? {} : { _err: 'อ่านค่าไม่ได้ ตรวจไฟล์นี้เอง' }) };
    // ต่อท้ายแบบ atomic (ไฟล์ส่งมาพร้อมกันหลายไฟล์ได้)
    await DB.prepare("UPDATE extract_jobs SET rows=json_insert(rows, '$[#]', json(?)), updated_at=? WHERE id=?").bind(JSON.stringify(rec), Date.now(), job.id).run();
    return json({ row: rec });
  }
  return err('not found', 404);
}
