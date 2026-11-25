// แปลทั้งไฟล์คงรูปแบบ: เบราว์เซอร์แตกไฟล์ Word/PowerPoint/Excel เป็นย่อหน้า ส่งมาแปลเป็นชุด แล้วใส่คำแปลกลับในไฟล์เดิม (หน้าตาเหมือนเดิม)
// เซิร์ฟเวอร์: แปลชุดข้อความ (สูงสุด 80 ชิ้น / 15,000 ตัวอักษรต่อครั้ง) ตอบเป็น JSON array ยาวเท่าเดิม · คลังคำศัพท์ของผู้ใช้ · หักลิมิตแพลน
import { err, json, limited, planOf, allowedModels, pickBucket, usageStatus } from './core.js';
import { callModel, logUsage } from './ai.js';

export const TR_ITEMS = 80, TR_CHARS = 15000;
export const TR_LANGS = { th: 'Thai', en: 'English', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', lo: 'Lao', my: 'Burmese', km: 'Khmer', ms: 'Malay', id: 'Indonesian', fr: 'French', de: 'German', es: 'Spanish', ru: 'Russian', ar: 'Arabic', hi: 'Hindi' };

// แยกคำตอบเป็น array ยาว n · ไม่ได้ = null
export function parseArr(text, n) {
  const s = String(text || ''), a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a < 0 || b < a) return null;
  try { const v = JSON.parse(s.slice(a, b + 1)); return Array.isArray(v) && v.length === n ? v.map(x => String(x ?? '')) : null; } catch { return null; }
}

async function pickModel(env, plan, want) {
  const ms = (await allowedModels(env, plan._planIds || plan.id)).filter(m => !['image', 'embedding'].includes(m.provider));
  const p = ms.find(m => m.id === +want) || ms.sort((a, b) => (a.cost_in + a.cost_out) - (b.cost_in + b.cost_out))[0];
  return p ? env.DB.prepare('SELECT * FROM models WHERE id=?').bind(p.id).first() : null;
}

export async function translateApi(req, env, u, path, M) {
  if (!path.startsWith('/api/translate')) return null;
  if (path === '/api/translate' && M === 'GET') {
    const plan = await planOf(env, u);
    return json({ langs: TR_LANGS, models: (await allowedModels(env, plan._planIds || plan.id)).filter(m => !['image', 'embedding'].includes(m.provider)).map(m => ({ id: m.id, name: m.name })) });
  }
  if (path !== '/api/translate' || M !== 'POST') return err('not found', 404);
  const b = await req.json().catch(() => ({}));
  const texts = Array.isArray(b.texts) ? b.texts.map(x => String(x ?? '')) : [];
  if (!texts.length) return err('ไม่มีข้อความ');
  if (texts.length > TR_ITEMS || texts.join('').length > TR_CHARS) return err('ชุดข้อความใหญ่เกินไป', 413);
  const to = TR_LANGS[b.to]; if (!to) return err('เลือกภาษาปลายทาง');
  if (await limited(env, 'tr:' + u.id, 600, 3600e3)) return err('แปลถี่เกินไป ลองใหม่ภายหลัง', 429);
  let plan = await planOf(env, u); const model = await pickModel(env, plan, b.model_id);
  if (!model) return err('ไม่มีโมเดลที่ใช้ได้', 403);
  if (plan._subs?.length) plan = await pickBucket(env, u, plan, model.id);
  const st = await usageStatus(env, u, plan); if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
  const gloss = String(b.glossary || '').split('\n').map(l => l.trim()).filter(l => l.includes('=')).slice(0, 200).join('\n').slice(0, 6000);
  const sys = `You are a professional document translator. Translate each string in the JSON array into ${to}. Reply with ONLY a JSON array of the same length and order.
Keep meaning, tone and formatting markers (numbers, codes, URLs, emails, placeholders like {name}, line breaks) exactly. Keep proper nouns and brand names unless a glossary entry says otherwise. If a string is already in ${to}, is only numbers/symbols, or must not be translated, return it unchanged. Never add explanations.${b.context ? `\nDocument context: ${String(b.context).slice(0, 300)}` : ''}${gloss ? `\nGlossary (source = required translation), always use these:\n${gloss}` : ''}`;
  let out = '', usage = null;
  const run = async () => { out = ''; for await (const e of callModel(env, model, [{ role: 'user', content: JSON.stringify(texts) }], { effort: null, system: sys, maxTokens: Math.min(16000, 2000 + texts.join('').length * 3), userId: u.id, signal: AbortSignal.timeout(120e3) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; } };
  try { await run(); } catch (e) { return err('แปลไม่สำเร็จ: ' + String(e.message || e).slice(0, 120), 502); }
  if (usage) await logUsage(env, u.id, model, usage, { plan, src: 'translate' });
  let res = parseArr(out, texts.length);
  if (!res) { usage = null; try { await run(); } catch { /* ลองครั้งเดียว */ } if (usage) await logUsage(env, u.id, model, usage, { plan, src: 'translate' }); res = parseArr(out, texts.length); }
  if (!res) return err('โมเดลตอบไม่ครบ ลองใหม่ หรือเลือกโมเดลอื่น', 502);
  return json({ texts: res });
}
