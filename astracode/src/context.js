// รายงาน context แบบละเอียด: ในหน้าต่าง context ของโมเดลตอนนี้มีอะไรกินที่อยู่เท่าไร (ประมาณจากจำนวนตัวอักษร ไม่ใช่ tokenizer จริง)
import { HISTORY, HISTORY_CODE, SYSTEM, SYSTEM_CODE, ctxMax, estTokens, histStart, json, err } from './core.js';
import { familyHint, stripOpenFile } from './ai.js';

export const COMPACT_DEFAULT_PCT = 75;
const FILE_RE = /\n*\[\[file:([^\]\n]+)\]\]\n([\s\S]*?)\n\[\[\/file\]\]/g;

export async function contextReport(env, u, { cid, pid, model, skill_ids = [] }) {
  const DB = env.DB, parts = [], add = (k, label, text, extra = {}) => { const tok = typeof text === 'number' ? text : estTokens(text || ''); if (tok > 0) parts.push({ k, label, tok, ...extra }); };
  add('system', pid ? 'คำสั่งระบบ (โหมด Code)' : 'คำสั่งระบบ', pid ? SYSTEM_CODE + '\n' + (model?.code_prompt?.trim() || familyHint(model || {})) : SYSTEM);
  add('instr', 'คำสั่งส่วนตัวของคุณ', (u.instructions || '').trim().slice(0, 3000));
  const mem = (await DB.prepare('SELECT text FROM memories WHERE user_id=? ORDER BY id LIMIT 50').bind(u.id).all()).results; if (mem.length) add('mem', `ความจำ (${mem.length} รายการ)`, mem.map(x => '- ' + x.text).join('\n'));
  const sids = (Array.isArray(skill_ids) ? skill_ids : []).map(Number).filter(x => x > 0).slice(0, 3);
  if (sids.length) { const sks = (await DB.prepare(`SELECT name,content FROM skills WHERE id IN (${sids.map(() => '?')}) AND (user_id=0 OR user_id=?) AND enabled=1`).bind(...sids, u.id).all()).results; for (const s of sks) add('skill', 'Skill: ' + s.name, s.content.slice(0, 6000)); }
  if (pid) {
    const pr = await DB.prepare('SELECT instructions FROM projects WHERE id=? AND user_id=?').bind(pid, u.id).first();
    const af = (await DB.prepare("SELECT content FROM project_files WHERE project_id=? AND path IN ('ASTRA.md','AGENTS.md') ORDER BY path LIMIT 1").bind(pid).first())?.content || '';
    add('rules', 'กฎประจำโปรเจกต์', ((pr?.instructions || '') + (af.startsWith('data:') ? '' : af.slice(0, 3000))).slice(0, 6000));
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
  return json({ ...rep, model: model?.name || null, compacted: !!c?.summary_upto });
}
