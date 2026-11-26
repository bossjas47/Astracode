// ---------- ของเสริม /v1: Self-Heal (ซ่อมคำตอบพังด้วยการลองโมเดลเดิมซ้ำ) · Kyber Memory (จำโปรเจกต์ข้ามเซสชัน ต่อ key) · Live Dashboard + เตือนลิมิตพุ่ง ----------
import { json, err, limited, DAY } from './core.js';

// ===== Self-Heal =====
// ตรวจคำตอบที่ได้ครบแล้ว (ไม่สตรีม) ว่าพังแบบที่ลองใหม่แล้วมักหาย: ว่างเปล่า, tool call ที่ JSON พัง, หลุดไปตอบภาษาจีนทั้งที่ผู้ใช้ไม่ได้เขียนจีน
const CJK = /[㐀-鿿豈-﫿]/g;
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => typeof p?.text === 'string' ? p.text : '').join('\n') : '';
export function healReason({ content = '', reasoning = '', toolCalls = [], hist = [], finish = 'stop' }) {
  if (!content.trim() && !toolCalls.length && finish !== 'length') return reasoning.trim() ? 'empty_after_thinking' : 'empty';
  for (const t of toolCalls) {
    const a = t?.function?.arguments;
    if (!t?.function?.name) return 'tool_no_name';
    if (a && a.trim()) { try { JSON.parse(a); } catch { return 'tool_bad_json'; } }
  }
  const lastUser = textOf([...hist].reverse().find(x => x.role === 'user')?.content);
  if (content.length >= 40 && !(lastUser.match(CJK) || []).length) {
    const cjk = (content.match(CJK) || []).length, letters = content.replace(/\s|[\p{P}\p{S}\d]/gu, '').length;
    if (letters > 0 && cjk / letters > 0.3) return 'wrong_language';
  }
  return null;
}
export const HEAL_TRIES = 2; // ลองโมเดลเดิมซ้ำได้สูงสุด 2 ครั้ง (ตามที่เจ้าของระบบเลือก: ไม่สลับโมเดล)

// ===== Kyber Memory =====
// ระบุโปรเจกต์จาก "working directory" ที่ Claude Code / OpenCode / Codex ใส่ไว้ใน system prompt · ไม่เจอ = ไม่ใช้ความจำ
const DIR_RE = /(?:working directory|cwd|primary working directory|current directory|workspace(?: root)?)\s*[:=]\s*`?([^\s`'"<>]{2,300})/i;
export async function projectOf(system, hist) {
  const src = String(system || '') + '\n' + hist.filter(x => x.role === 'system' || x.role === 'developer').map(x => textOf(x.content)).join('\n');
  const dir = src.match(DIR_RE)?.[1]?.replace(/[.,;)]+$/, '');
  if (!dir) return null;
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dir.toLowerCase()));
  return { id: [...new Uint8Array(h)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(''), name: dir.split(/[\\/]/).filter(Boolean).pop()?.slice(0, 80) || 'project' };
}
const MEM_TBL = 'CREATE TABLE IF NOT EXISTS key_memory (key_id INTEGER NOT NULL, project TEXT NOT NULL, name TEXT, summary TEXT NOT NULL DEFAULT \'\', reqs INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (key_id, project))';
let memMade = false; const memEnsure = async env => { if (!memMade) { await env.DB.prepare(MEM_TBL).run(); memMade = true; } };
export const MEM_EVERY = 20, MEM_MAX = 2400; // สรุปใหม่ทุก 20 คำขอของโปรเจกต์ · ความยาวสรุปสูงสุด (ตัวอักษร)
export async function loadMemory(env, kid, proj) {
  await memEnsure(env);
  return (await env.DB.prepare('SELECT summary FROM key_memory WHERE key_id=? AND project=?').bind(kid, proj.id).first())?.summary || '';
}
export const memoryBlock = s => s ? `\n\n<kyber_memory>\nNotes saved from earlier sessions on this project (may be slightly out of date; trust the files if they disagree):\n${s}\n</kyber_memory>` : '';
// นับคำขอ แล้วทุก MEM_EVERY ครั้งให้โมเดลถูกสุดสรุปเพิ่ม (ต้นทุนของเรา ไม่หักลิมิตลูกค้า) · ทำใน waitUntil ไม่ให้ลูกค้ารอ
export async function bumpMemory(env, k, proj, hist, answer, summarize) {
  await memEnsure(env);
  const row = await env.DB.prepare('INSERT INTO key_memory (key_id,project,name,reqs,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(key_id,project) DO UPDATE SET reqs=reqs+1 RETURNING reqs, summary').bind(k.kid, proj.id, proj.name, Date.now()).first();
  if (!row || (row.reqs !== 3 && row.reqs % MEM_EVERY !== 0)) return false; // สรุปครั้งแรกเร็ว (คำขอที่ 3) แล้วทุก 20
  const recent = hist.filter(x => x.role === 'user' || x.role === 'assistant').slice(-12).map(x => `${x.role}: ${textOf(x.content).slice(0, 1500)}`).join('\n');
  const prompt = `Project: ${proj.name}\n\nCurrent notes:\n${row.summary || '(none)'}\n\nRecent conversation:\n${recent}\n\nLatest answer:\n${String(answer || '').slice(0, 2000)}`;
  const s = (await summarize(prompt).catch(() => '')).trim().slice(0, MEM_MAX);
  if (s) await env.DB.prepare('UPDATE key_memory SET summary=?, updated_at=? WHERE key_id=? AND project=?').bind(s, Date.now(), k.kid, proj.id).run();
  return !!s;
}
export const MEM_SYS = 'You maintain short project notes for a coding assistant so it remembers this project in its next session. Update the notes with what matters long-term: what the project is, stack and key files, conventions, decisions made, bugs fixed and their cause, open tasks. Drop chit-chat, secrets, API keys, passwords and personal data. Bullet points, at most 250 words, English.';

// ===== Live Dashboard + เตือนลิมิตพุ่ง (เตือนอย่างเดียว ไม่ตัด) =====
export const BURN_PCT = 20; // ใช้เกิน 20% ของลิมิตสัปดาห์ภายใน 1 ชม. = เตือน (อีเมลไม่เกินวันละครั้ง)
export async function burnCheck(env, k, plan, mailFn) {
  if (!(plan?.limit_week > 0)) return null;
  const r = await env.DB.prepare('SELECT COALESCE(SUM(units),0) u, COUNT(*) n FROM api_log WHERE user_id=? AND created_at>?').bind(k.id, Date.now() - 3600e3).first();
  const pct = r.u / plan.limit_week * 100;
  if (pct < BURN_PCT) return null;
  if (await limited(env, 'burnwarn:' + k.id, 1, DAY)) return { pct, mailed: false };
  const top = (await env.DB.prepare('SELECT model, COUNT(*) n, SUM(units) u, AVG(tin) tin FROM api_log WHERE user_id=? AND created_at>? GROUP BY model ORDER BY u DESC LIMIT 3').bind(k.id, Date.now() - 3600e3).all()).results;
  await mailFn(pct, r.n, top).catch(() => {});
  return { pct, mailed: true };
}
// สถิติสดต่อ key: 1 ชม. / 24 ชม. · % ลิมิตสัปดาห์ · โมเดลที่กินเยอะ · คำขอใหญ่ที่สุด · ซ่อมคำตอบไปกี่ครั้ง
export async function liveStats(env, u, plan) {
  const now = Date.now(), lw = plan?.limit_week > 0 ? plan.limit_week : null;
  const keys = (await env.DB.prepare('SELECT id,name,prefix,memory FROM api_keys WHERE user_id=? AND revoked=0 ORDER BY id DESC').bind(u.id).all()).results;
  if (!keys.length) return { keys: [], limit_week: lw };
  const ph = keys.map(() => '?').join(',');
  const agg = (await env.DB.prepare(`SELECT key_id, SUM(created_at>?) n1, COALESCE(SUM(CASE WHEN created_at>? THEN units END),0) u1, COUNT(*) n24, COALESCE(SUM(units),0) u24, SUM(status>=400 AND status NOT IN (401,402,429)) err24, MAX(tin) peak, CAST(AVG(ms) AS INT) ms, MAX(created_at) last FROM api_log WHERE key_id IN (${ph}) AND created_at>? GROUP BY key_id`).bind(now - 3600e3, now - 3600e3, ...keys.map(k => k.id), now - DAY).all()).results;
  const byModel = (await env.DB.prepare(`SELECT key_id, model, COUNT(*) n, COALESCE(SUM(units),0) u, CAST(AVG(tin) AS INT) tin FROM api_log WHERE key_id IN (${ph}) AND created_at>? AND model IS NOT NULL GROUP BY key_id, model ORDER BY u DESC`).bind(...keys.map(k => k.id), now - DAY).all()).results;
  const heals = (await env.DB.prepare(`SELECT COUNT(*) n FROM events WHERE kind='heal' AND created_at>? AND detail LIKE ?`).bind(now - DAY, `%"uid":${u.id},%`).first().catch(() => ({ n: 0 }))).n;
  const pct = x => lw ? Math.round(x / lw * 1000) / 10 : null;
  const hourly = (await env.DB.prepare(`SELECT CAST((created_at-?)/3600000 AS INT) h, COUNT(*) n, COALESCE(SUM(units),0) u FROM api_log WHERE user_id=? AND created_at>? GROUP BY h ORDER BY h`).bind(now - DAY, u.id, now - DAY).all()).results;
  return {
    limit_week: lw, burn_pct: BURN_PCT, heals_24h: heals,
    hourly: Array.from({ length: 24 }, (_, i) => { const r = hourly.find(x => x.h === i); return { h: i, n: r?.n || 0, pct: pct(r?.u || 0) }; }),
    keys: keys.map(k => { const a = agg.find(x => x.key_id === k.id) || {}; return { id: k.id, name: k.name, prefix: k.prefix, memory: !!k.memory, n1: a.n1 || 0, pct1: pct(a.u1 || 0), n24: a.n24 || 0, pct24: pct(a.u24 || 0), err24: a.err24 || 0, peak_k: Math.round((a.peak || 0) / 1000), ms: a.ms || 0, last: a.last || null, hot: lw ? (a.u1 || 0) / lw * 100 >= BURN_PCT : false, models: byModel.filter(x => x.key_id === k.id).slice(0, 4).map(x => ({ model: x.model, n: x.n, pct: pct(x.u), tin_k: Math.round(x.tin / 1000) })) }; }),
  };
}
export async function memoryApi(env, u, kid, M) {
  await memEnsure(env);
  if (!await env.DB.prepare('SELECT 1 FROM api_keys WHERE id=? AND user_id=?').bind(kid, u.id).first()) return err('ไม่พบ key', 404);
  if (M === 'DELETE') { await env.DB.prepare('DELETE FROM key_memory WHERE key_id=?').bind(kid).run(); return json({ ok: true }); }
  return json((await env.DB.prepare('SELECT project,name,summary,reqs,updated_at FROM key_memory WHERE key_id=? ORDER BY updated_at DESC LIMIT 20').bind(kid).all()).results);
}
