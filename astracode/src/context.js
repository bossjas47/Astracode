// รายงาน context แบบละเอียด: ในหน้าต่าง context ของโมเดลตอนนี้มีอะไรกินที่อยู่เท่าไร (ประมาณจากจำนวนตัวอักษร ไม่ใช่ tokenizer จริง)
import { HISTORY, HISTORY_CODE, SYSTEM, SYSTEM_CODE, allowedModels, ctxMax, estTokens, histStart, json, err, limMult, planOf, projectFor } from './core.js';
import { familyHint, smartExecutor, stripOpenFile } from './ai.js';
import { isClaudeEco } from './credits.js';

const FILE_RE = /\n*\[\[file:([^\]\n]+)\]\]\n([\s\S]*?)\n\[\[\/file\]\]/g;

export async function contextReport(env, u, { cid, pid, model, skill_ids = [] }) {
  const DB = env.DB, parts = [], add = (k, label, text, extra = {}) => { const tok = typeof text === 'number' ? text : estTokens(text || ''); if (tok > 0) parts.push({ k, label, tok, ...extra }); };
  add('system', pid ? 'คำสั่งระบบ (โหมด Code)' : 'คำสั่งระบบ', pid ? SYSTEM_CODE + '\n' + (model?.code_prompt?.trim() || familyHint(model || {})) : SYSTEM);
  add('instr', 'คำสั่งส่วนตัวของคุณ', (u.instructions || '').trim().slice(0, 3000));
  const mem = (await DB.prepare('SELECT text FROM memories WHERE user_id=? ORDER BY id LIMIT 50').bind(u.id).all()).results; if (mem.length) add('mem', `ความจำ (${mem.length} รายการ)`, mem.map(x => '- ' + x.text).join('\n'));
  const sids = (Array.isArray(skill_ids) ? skill_ids : []).map(Number).filter(x => x > 0).slice(0, 3);
  if (sids.length) { const sks = (await DB.prepare(`SELECT name,content FROM skills WHERE id IN (${sids.map(() => '?')}) AND (user_id=0 OR user_id=?) AND enabled=1`).bind(...sids, u.id).all()).results; for (const s of sks) add('skill', 'Skill: ' + s.name, s.content.slice(0, 6000)); }
  if (pid) {
    const pr = await projectFor(env, pid, u.id);
    const af = (await DB.prepare("SELECT path, content FROM project_files WHERE project_id=? AND path IN ('KYBER.md','ASTRA.md','CLAUDE.md','AGENTS.md') ORDER BY CASE path WHEN 'KYBER.md' THEN 0 WHEN 'ASTRA.md' THEN 1 WHEN 'CLAUDE.md' THEN 2 ELSE 3 END LIMIT 1").bind(pid).first())?.content || '';
    add('rules', 'กฎประจำโปรเจกต์', ((pr?.instructions || '') + (af.startsWith('data:') ? '' : af.slice(0, 3000))).slice(0, 6000));
    // ทุกข้อความในโหมด Code แนบรายชื่อไฟล์ และถ้าโปรเจกต์เล็ก (ข้อความรวม ≤ 14,000 ตัวอักษร) แนบเนื้อหาทุกไฟล์ด้วย (เหมือนหน้าเว็บ)
    const fl = (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(pid).all()).results;
    const text = fl.filter(f => !String(f.content).startsWith('data:')), small = text.reduce((a, f) => a + f.content.length, 0) <= 14000;
    add('files', `ไฟล์โปรเจกต์ที่แนบทุกข้อความ (${fl.length} ไฟล์${small ? ' พร้อมเนื้อหา' : ' เฉพาะรายชื่อ'})`, fl.map(f => f.path).join('\n').slice(0, 15000) + (small ? text.map(f => `${f.path}:\n${f.content}`).join('\n\n') : ''), { detail: small ? 'โปรเจกต์เล็ก: AI ได้เนื้อหาทุกไฟล์ไม่ต้อง READ' : 'AI อ่านไฟล์เองด้วย READ เมื่อจำเป็น' });
  }
  let msgs = 0;
  if (cid) {
    const c = await DB.prepare('SELECT summary,summary_upto FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first();
    if (c?.summary) add('summary', 'สรุปข้อความเก่า (ย่อแชตแล้ว)', c.summary);
    const after = c?.summary_upto || 0, hmax = pid ? HISTORY_CODE : HISTORY;
    const n = (await DB.prepare('SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>?').bind(cid, after).first()).n;
    const rows = (await DB.prepare('SELECT role,content FROM messages WHERE chat_id=? AND id>? ORDER BY id LIMIT -1 OFFSET ?').bind(cid, after, histStart(n, hmax)).all()).results.map(r => ({ ...r, content: String(r.content || '').replace(/⁣/g, '') }));
    while (rows.length && rows[0].role !== 'user') rows.shift();
    let user = 0, asst = 0, files = 0, fileNames = [];
    rows.forEach((r, i) => {
      let t = r.content;
      if (pid && i < rows.length - 1 && r.role === 'user') t = stripOpenFile(t);
      for (const m of t.matchAll(FILE_RE)) { files += estTokens(m[2]); fileNames.push(m[1]); }
      t = t.replace(FILE_RE, '');
      if (r.role === 'user') user += estTokens(t) + 4; else asst += estTokens(t) + 4;
    });
    msgs = rows.length; add('files', `ไฟล์แนบ (${fileNames.length} ไฟล์)`, files, { detail: fileNames.slice(0, 8).join(', ') });
    add('user', 'ข้อความของคุณ', user); add('assistant', 'คำตอบของ AI', asst);
  }
  const max = ctxMax(model), used = parts.reduce((a, p) => a + p.tok, 0), reserve = Math.min(16000, Math.round(max * 0.15));
  return { used, max, reserve, free: Math.max(0, max - used - reserve), pct: Math.round(used / max * 1000) / 10, msgs, parts: parts.sort((a, b) => b.tok - a.tok) };
}

export async function contextApi(req, env, u) {
  const q = new URL(req.url).searchParams, mid = +q.get('model_id'), cid = +q.get('chat_id') || null, pid = +q.get('project_id') || null;
  const model = mid ? await env.DB.prepare('SELECT * FROM models WHERE id=?').bind(mid).first() : null;
  if (cid && !await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first()) return err('ไม่พบแชต', 404);
  const sk = (q.get('skills') || '').split(',').filter(Boolean);
  const [rep, c] = await Promise.all([contextReport(env, u, { cid, pid, model, skill_ids: sk }), cid ? env.DB.prepare('SELECT summary_upto FROM chats WHERE id=?').bind(cid).first() : null]);
  // เทียบทุกโมเดลในแพลน: ถ้าคุยต่อด้วยโมเดลนั้น context จะเต็มกี่ % · และแต่ละโมเดลที่ตอบในแชตนี้ใช้ token ไปเท่าไร (ตัวเลขจริงจากผู้ให้บริการ)
  const plan = await planOf(env, u), ids = (await allowedModels(env, plan?._planIds || plan?.id)).filter(m => !['image', 'embedding'].includes(m.provider)).map(m => m.id);
  const models = ids.length ? (await env.DB.prepare(`SELECT id,name,ctx_k FROM models WHERE id IN (${ids.map(() => '?')}) ORDER BY sort,id`).bind(...ids).all()).results.map(m => { const max = ctxMax(m); return { id: m.id, name: m.name, max, pct: Math.round(rep.used / max * 1000) / 10 }; }) : [];
  // ตัวเลขจริงจากผู้ให้บริการต่อโมเดล: ขาเข้าใหม่ / เขียน cache / อ่าน cache / ขาออก · tin รวม cache แล้ว
  const byModel = cid ? (await env.DB.prepare("SELECT COALESCE(m.name,'โมเดลที่ถูกลบ') name, COUNT(*) replies, COALESCE(SUM(x.tin),0) tin, COALESCE(SUM(x.tout),0) tout, COALESCE(SUM(x.tcr),0) cr, COALESCE(SUM(x.tcw),0) cw, SUM(x.tcr IS NOT NULL) known, COALESCE(MAX(x.tin),0) peak FROM messages x LEFT JOIN models m ON m.id=x.model_id WHERE x.chat_id=? AND x.role='assistant' GROUP BY x.model_id ORDER BY replies DESC").bind(cid).all()).results.map(m => ({ ...m, fresh: Math.max(0, m.tin - m.cr - m.cw) })) : [];
  const tokens = byModel.reduce((a, m) => ({ fresh: a.fresh + m.fresh, cw: a.cw + m.cw, cr: a.cr + m.cr, out: a.out + m.tout, replies: a.replies + m.replies, known: a.known + m.known }), { fresh: 0, cw: 0, cr: 0, out: 0, replies: 0, known: 0 });
  tokens.hit = tokens.fresh + tokens.cw + tokens.cr ? Math.round(tokens.cr / (tokens.fresh + tokens.cw + tokens.cr) * 1000) / 10 : null; // อัตราติด cache = อ่านจาก cache ÷ ขาเข้าทั้งหมด
  // context จริงล่าสุด (input + output ของรอบสุดท้ายตามผู้ให้บริการ) ใช้เป็นตัวเลขหลัก ให้ตรงกับหัวแชต · ส่วนแยกเป็นการประมาณ
  const real = cid ? (await env.DB.prepare("SELECT tctx FROM messages WHERE chat_id=? AND role='assistant' AND id>? ORDER BY id DESC LIMIT 1").bind(cid, c?.summary_upto || 0).first())?.tctx || 0 : 0; // หลังย่อแชต ใช้แค่คำตอบที่มาหลังย่อ
  if (real > 0) Object.assign(rep, { est: rep.used, used: real, real: true, pct: Math.round(real / rep.max * 1000) / 10, free: Math.max(0, rep.max - real - rep.reserve) });
  return json({ ...rep, tokens, model: model?.name || null, model_id: model?.id || null, compacted: !!c?.summary_upto, models, byModel });
}

// ประมาณว่าข้อความถัดไปจะกินลิมิตสัปดาห์กี่ % (แสดงข้างช่องพิมพ์ก่อนกดส่ง) · ใช้ context จริงรอบล่าสุดของแชต + ความยาวข้อความ
export const estUnits = (m, tokIn, cacheShare, out = 900) => ((tokIn * (1 - cacheShare) * (m.cost_in || 0) + tokIn * cacheShare * (m.cost_cache ?? m.cost_in ?? 0) + out * (m.cost_out || 0)) / 1e6) * limMult(m);
export async function estimateApi(req, env, u) {
  const q = new URL(req.url).searchParams, cid = +q.get('chat_id') || 0, chars = Math.min(+q.get('chars') || 0, 2e6), smart = q.get('smart') === '1';
  const m = await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(+q.get('model_id') || 0).first();
  if (!m || ['image', 'embedding'].includes(m.provider) || m.req_cost > 0) return json({ pct: null });
  const plan = await planOf(env, u); if (!(plan?.limit_week > 0)) return json({ pct: null });
  const own = cid && await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first();
  const prev = own ? (await env.DB.prepare("SELECT tctx FROM messages WHERE chat_id=? AND role='assistant' AND tctx>0 ORDER BY id DESC LIMIT 1").bind(cid).first())?.tctx || 0 : 0;
  const tokIn = prev + Math.ceil(chars / 3) + 3000, cache = prev ? (isClaudeEco(m) ? 0.2 : 0.6) : 0;
  const pct = x => Math.round(x / plan.limit_week * 1000) / 10;
  const r = { pct: pct(estUnits(m, tokIn, cache)), tokens: tokIn };
  if (smart && /\bopus\b/i.test(m.name)) { const ex = await smartExecutor(env); if (ex) r.pct = pct(estUnits(ex, tokIn, cache, 1500) + estUnits(m, Math.min(tokIn, 25000), 0, 1200)); }
  // ทางเลือกที่ถูกกว่าในแพลน (ประหยัด ≥ 5 เท่า) แนะนำให้สลับ
  if (r.pct >= 0.3) {
    const ids = (await allowedModels(env, plan._planIds?.length ? plan._planIds : plan.id)).filter(x => !["image", "embedding"].includes(x.provider)).map(x => x.id);
    const alt = ids.length ? (await env.DB.prepare(`SELECT * FROM models WHERE active=1 AND id IN (${ids.map(() => '?')}) AND name IN ('ChatGPT 6.2 Sol','ChatGPT 6.1 Sol','DeepSeek 4.1 Flash 1017')`).bind(...ids).all()).results.filter(x => x.id !== m.id).map(x => ({ id: x.id, name: x.name, pct: pct(estUnits(x, tokIn, prev ? 0.6 : 0)) })).sort((a, b) => a.pct - b.pct)[0] : null;
    if (alt && alt.pct * 5 <= r.pct) r.alt = alt;
  }
  return json(r);
}

// คุณภาพจริงต่อโมเดล (7 วัน): เสถียรแค่ไหน (คำขอสำเร็จ ÷ ทั้งหมด) และกินลิมิตต่อข้อความกี่เท่าของตัวที่ประหยัดสุด · แสดงในหน้าเลือกโมเดล · cache 1 ชม.
export async function modelStatsApi(env, cache = globalThis.caches?.default) {
  const key = new Request('https://cache.local/model-stats-v1');
  const hit = cache && await cache.match(key).catch(() => null); if (hit) return hit;
  const since = Date.now() - 7 * 864e5;
  const [use, errs, ev] = await Promise.all([
    env.DB.prepare("SELECT model_id id, COUNT(*) n, AVG(units) u FROM usage WHERE created_at>? AND units>0 AND COALESCE(src,'') NOT IN ('system','image') GROUP BY model_id").bind(since).all(),
    env.DB.prepare("SELECT model_id id, COUNT(*) n FROM events WHERE kind='error' AND created_at>? AND model_id IS NOT NULL GROUP BY model_id").bind(since).all(),
    env.DB.prepare('SELECT data FROM eval_runs ORDER BY at DESC LIMIT 1').first().catch(() => null)]);
  const e = new Map(errs.results.map(r => [r.id, r.n]));
  let evalBy = {}; try { for (const r of JSON.parse(ev?.data || '{}').by || []) if (r.model) evalBy[r.model] = r.pass ?? r.rate; } catch { /* ไม่มีผลทดสอบ */ }
  const rows = use.results.filter(r => r.n >= 30), base = Math.min(...rows.map(r => r.u).filter(x => x > 0));
  const names = rows.length ? new Map((await env.DB.prepare(`SELECT id,name FROM models WHERE id IN (${rows.map(() => '?')})`).bind(...rows.map(r => r.id)).all()).results.map(r => [r.id, r.name])) : new Map();
  const out = {};
  for (const r of rows) {
    const bad = e.get(r.id) || 0, ok = Math.round(r.n / (r.n + bad) * 1000) / 10;
    out[r.id] = { ok, x: base > 0 ? Math.max(1, Math.round(r.u / base * 10) / 10) : null, n: r.n, ...(evalBy[names.get(r.id)] != null ? { pass: evalBy[names.get(r.id)] } : {}) };
  }
  const res = json(out); res.headers.set('cache-control', 'public, max-age=3600');
  if (cache) await cache.put(key, res.clone()).catch(() => {});
  return res;
}
