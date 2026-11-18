import { HISTORY, HISTORY_CODE, LOCK_MS, projectFor, reqCapHit, ctxMax, fitContext, flat, histStart, SYSTEM, SYSTEM_CODE, allowedModels, capHit, err, json, limMult, limited, planOf, rand, same, touchWindows, unlimit, usageStatus, userErr } from './core.js';
import { blockedText, event, getSetting, getSettings, mail, mailBox, priceOf, siteUrl, walletAdd } from './billing.js';
import { b64, projects, unb64, unseal } from './projects.js';
import { admin } from './admin.js';
import { v1 } from './api.js';
import { cron, status } from './jobs.js';
// ---------- AI providers ----------
// คืน async generator: {t:text} ระหว่างทาง, {usage:{fresh,read,write,out}} ตอนจบ
export async function* sse(res) {
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  try { for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') try { yield JSON.parse(d); } catch {} }
    }
  } } finally { rd.cancel().catch(() => {}); } // ผู้ใช้กดหยุด: ตัดการเชื่อมต่อ AI ทันที
}
export const toAnthropicPart = p => {
  if (typeof p === 'string') return { type: 'text', text: p };
  if (p?.type === 'text') return { type: 'text', text: String(p.text || '') };
  if (p?.type === 'image_url') {
    const u = String(p.image_url?.url || p.image_url || '');
    if (u.startsWith('data:')) return { type: 'image', source: { type: 'base64', media_type: u.slice(5, u.indexOf(';')), data: u.slice(u.indexOf(',') + 1) } };
    return { type: 'image', source: { type: 'url', url: u } };
  }
  return null;
};
// ผู้ให้บริการบางรายปฏิเสธระดับ effort ที่เราเลือก (เช่น "does not support reasoning effort \"minimal\"; use low, medium, high, xhigh or max") → อ่านรายการที่รองรับแล้วเลือกระดับที่ใกล้ที่สุด (เท่ากันเลือกอันที่สูงกว่า) เพื่อลองใหม่ 1 ครั้ง
export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export function nearEffort(errText, cur) {
  const after = String(errText).split(/reasoning effort/i)[1]?.split(/\buse\b/i)[1]; if (!after || !cur) return null;
  const ok = [...after.matchAll(/\b(none|minimal|low|medium|high|xhigh|max)\b/gi)].map(x => x[1].toLowerCase()), ci = EFFORT_ORDER.indexOf(String(cur).toLowerCase());
  if (!ok.length || ci < 0) return null;
  return ok.sort((a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - ci) - Math.abs(EFFORT_ORDER.indexOf(b) - ci) || EFFORT_ORDER.indexOf(b) - EFFORT_ORDER.indexOf(a))[0];
}
export async function* callModel(env, m, msgs, { effort, images = [], system = SYSTEM, maxTokens, tools, toolChoice, userId, signal, extra = {}, imageOpts = {}, api = false } = {}) {
  const key = env[m.key_name];
  const fetch = (url, init) => globalThis.fetch(url, { ...init, signal }); // signal = ตัดการเชื่อมต่อเมื่อโมเดลเงียบนานเกินไป
  if (!key) throw new Error('missing key ' + m.key_name);
  if (m.provider === 'anthropic') {
    const messages = [];
    for (const x of msgs) {
      if (x.role === 'tool') {
        const part = { type: 'tool_result', tool_use_id: x.tool_call_id || '', content: typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? '') };
        if (messages.at(-1)?.role === 'user' && Array.isArray(messages.at(-1).content)) messages.at(-1).content.push(part);
        else messages.push({ role: 'user', content: [part] });
        continue;
      }
      if (x.role === 'assistant' && Array.isArray(x.tool_calls) && x.tool_calls.length) {
        const blocks = [];
        if (x.content) blocks.push({ type: 'text', text: typeof x.content === 'string' ? x.content : String(x.content) });
        for (const tc of x.tool_calls) {
          let inp = {};
          try { inp = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : (tc.function?.arguments || {}); } catch {}
          blocks.push({ type: 'tool_use', id: tc.id || rand(8), name: tc.function?.name || '', input: inp });
        }
        messages.push({ role: 'assistant', content: blocks });
        continue;
      }
      const content = Array.isArray(x.content) ? x.content.map(toAnthropicPart).filter(Boolean) : x.content;
      messages.push({ role: x.role, content });
    }
    const last = messages.at(-1); // cache ทั้งบทสนทนาถึงข้อความล่าสุด
    if (last) {
      const baseParts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }];
      const imgParts = images.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1) } }));
      last.content = [...imgParts, ...baseParts];
      if (last.content.length) last.content[last.content.length - 1] = { ...last.content.at(-1), cache_control: { type: 'ephemeral' } };
    }
    const body = { model: m.api_model, max_tokens: maxTokens || 16000, stream: true, messages };
    if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    if (Array.isArray(tools) && tools.length && toolChoice !== 'none') {
      body.tools = tools.map(t => ({ name: t.function?.name || t.name, description: t.function?.description || t.description || '', input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} } }));
      if (toolChoice === 'auto') body.tool_choice = { type: 'auto' };
      else if (toolChoice === 'required') body.tool_choice = { type: 'any' };
      else if (toolChoice?.function?.name) body.tool_choice = { type: 'tool', name: toolChoice.function.name };
    }
    // shortcut: Max ของ Claude ส่งเป็น high เพราะ effort max ใช้ได้แค่บางรุ่น ถ้ารุ่นที่ใช้รองรับ ให้เปลี่ยนเป็น 'max'
    if (m.effort === 'anthropic' && effort) { body.thinking = { type: 'adaptive' }; body.output_config = { effort: { minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'max', max: 'max', on: 'medium' }[effort] || 'medium' }; }
    if (!body.thinking) { // Claude รุ่นคิดไม่รับ temperature/top_p
      if (extra.temperature !== undefined) body.temperature = Math.min(extra.temperature, 1);
      else if (extra.top_p !== undefined) body.top_p = extra.top_p;
    }
    if (extra.stop) body.stop_sequences = extra.stop;
    const res = await fetch(m.base_url + '/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const u = { fresh: 0, read: 0, write: 0, out: 0 };
    for await (const e of sse(res)) {
      if (e.type === 'message_start') { const x = e.message.usage; u.fresh = x.input_tokens || 0; u.read = x.cache_read_input_tokens || 0; u.write = x.cache_creation_input_tokens || 0; }
      else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') yield { tc_start: { index: e.index, id: e.content_block.id, name: e.content_block.name } };
      else if (e.type === 'content_block_delta' && e.delta?.text) yield { t: e.delta.text };
      else if (e.type === 'content_block_delta' && e.delta?.thinking) yield { th: e.delta.thinking }; // เหตุผลที่ Claude คิด
      else if (e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') yield { tc_delta: { index: e.index, args: e.delta.partial_json || '' } };
      else if (e.type === 'message_delta') {
        if (e.usage) u.out = e.usage.output_tokens || 0;
        if (e.delta?.stop_reason) yield { stop_reason: e.delta.stop_reason === 'tool_use' ? 'tool_calls' : 'stop' };
      }
      else if (e.type === 'error') throw new Error(e.error?.message || 'upstream error');
    }
    yield { usage: u };
  } else if (m.provider === 'image') { // โมเดลสร้างรูป (gpt-image-*): ข้อความล่าสุดของผู้ใช้ = คำบรรยายรูป ตอบกลับเป็นรูปในแชต · ทุน output = ราคาต่อ 1 รูป
    const last = msgs.findLast(x => x.role === 'user'), prompt = (Array.isArray(last?.content) ? last.content.filter(c => c?.type === 'text').map(c => c.text).join('\n') : String(last?.content || '')).replace(/\n\n\[ไฟล์ทั้งหมดในโปรเจกต์\][\s\S]*$/, '').trim().slice(0, 4000);
    if (!prompt) throw new Error('บอกว่าอยากได้รูปแบบไหน');
    const base0 = m.base_url.replace(/\/$/, '');
    const call = async extra => { // 404 = ไม่มีเส้นทางนี้ ลองใส่ /v1 ให้ (ผู้ให้บริการบางรายต้องมี)
      const go = b => fetch(b + '/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model: m.api_model, prompt, n: 1, size: '1024x1024', ...extra, ...imageOpts }) });
      const r = await go(base0); return r.status === 404 && !/\/v1$/.test(base0) ? go(base0 + '/v1') : r;
    };
    let res = await call({ output_format: 'jpeg', output_compression: 80 }); // JPEG เพื่อให้ไฟล์เล็กพอเก็บในแชต (D1 แถวละไม่เกิน ~2MB)
    if (res.status === 400) res = await call({}); // ผู้ให้บริการบางรายไม่รับพารามิเตอร์ข้างบน ลองใหม่แบบเรียบง่าย
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`upstream ${res.status}: ${JSON.stringify(d.error || d).slice(0, 300)}`);
    const item = d.data?.[0]; let src;
    if (item?.b64_json) {
      const mime = item.b64_json.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
      if (userId && item.b64_json.length > 300e3) src = await putImage(env, userId, mime, item.b64_json); // ใหญ่: เก็บเป็นไฟล์ในฐานข้อมูล ข้อความในแชตเป็นแค่ลิงก์
      else if (!api && item.b64_json.length > 1.8e6) throw new Error('รูปที่ได้ใหญ่เกินจะบันทึก ลองใช้ขนาดที่เล็กลง');
      else src = `data:${mime};base64,` + item.b64_json;
    } else if (item?.url) src = item.url; else throw new Error('ไม่ได้รูปกลับมา');
    yield { t: `![${prompt.slice(0, 80).replace(/[\[\]\s]+/g, ' ').trim()}](${src})` }; // alt ต้องอยู่บรรทัดเดียว ไม่งั้น markdown ไม่แสดงรูป
    yield { usage: { fresh: 0, read: 0, write: 0, out: 1e6 } }; // 1 รูป = 1M "token" จึงคิดตามทุน output ต่อรูป
  } else if (m.provider === 'responses') { // OpenAI Responses API (/responses): โมเดลรุ่นใหม่ที่ไม่รับ /chat/completions
    const part = (role, p) => typeof p === 'string' ? { type: role === 'assistant' ? 'output_text' : 'input_text', text: p }
      : p?.type === 'image_url' ? { type: 'input_image', image_url: p.image_url?.url || p.image_url }
      : { type: role === 'assistant' ? 'output_text' : 'input_text', text: String(p?.text ?? '') };
    const input = [];
    for (const x of msgs) {
      if (x.role === 'tool') { input.push({ type: 'function_call_output', call_id: x.tool_call_id || '', output: typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? '') }); continue; }
      const role = x.role === 'system' ? 'developer' : x.role;
      const parts = (Array.isArray(x.content) ? x.content : x.content ? [String(x.content)] : []).map(c => part(role, c));
      if (parts.length) input.push({ role, content: parts });
      for (const tc of x.tool_calls || []) input.push({ type: 'function_call', call_id: tc.id || rand(8), name: tc.function?.name || '', arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {}) });
    }
    if (images.length) { const last = input.findLast(i => i.role === 'user'); if (last) last.content.push(...images.map(url => ({ type: 'input_image', image_url: url }))); }
    const body = { model: m.api_model, stream: true, store: false, input };
    if (system) body.instructions = system;
    if (maxTokens) body.max_output_tokens = maxTokens;
    if (m.effort === 'openai' && effort) body.reasoning = { effort: { on: 'medium', max: 'high' }[effort] || effort };
    if (Array.isArray(tools) && tools.length && toolChoice !== 'none') {
      body.tools = tools.map(t => ({ type: 'function', name: t.function?.name || t.name, description: t.function?.description || t.description || '', parameters: t.function?.parameters || t.parameters || { type: 'object', properties: {} } }));
      if (toolChoice === 'auto' || toolChoice === 'required') body.tool_choice = toolChoice;
      else if (toolChoice?.function?.name) body.tool_choice = { type: 'function', name: toolChoice.function.name };
    }
    const post = () => fetch(m.base_url + '/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    let res = await post();
    if (res.status === 400 && body.reasoning) { const t = await res.text(), ne = nearEffort(t, body.reasoning.effort); if (!ne) throw new Error(`upstream 400: ${t.slice(0, 300)}`); body.reasoning.effort = ne; res = await post(); }
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let usage = null;
    for await (const e of sse(res)) {
      if (e.type === 'response.output_text.delta' && e.delta) yield { t: e.delta };
      else if ((e.type === 'response.reasoning_summary_text.delta' || e.type === 'response.reasoning_text.delta') && e.delta) yield { th: e.delta };
      else if (e.type === 'response.output_item.added' && e.item?.type === 'function_call') yield { tc: [{ index: e.output_index ?? 0, id: e.item.call_id || e.item.id, function: { name: e.item.name || '', arguments: '' } }] };
      else if (e.type === 'response.function_call_arguments.delta' && e.delta) yield { tc: [{ index: e.output_index ?? 0, function: { arguments: e.delta } }] };
      else if (e.type === 'response.completed' || e.type === 'response.incomplete') { usage = e.response?.usage || usage; yield { stop_reason: e.type === 'response.completed' ? 'stop' : 'length' }; }
      else if (e.type === 'response.failed' || e.type === 'error') throw new Error(`upstream: ${String(e.response?.error?.message || e.message || e.error?.message || 'failed').slice(0, 300)}`);
    }
    if (usage) { const inp = usage.input_tokens || 0, read = usage.input_tokens_details?.cached_tokens || 0; yield { usage: { fresh: Math.max(0, inp - read), read, write: 0, out: usage.output_tokens || 0 } }; }
  } else { // OpenAI-compatible: OpenAI, DeepSeek, Kimi, Gemini
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...msgs.map(x => x.role === 'tool'
        ? { role: 'tool', tool_call_id: x.tool_call_id, content: x.content }
        : x.tool_calls ? { role: 'assistant', content: x.content ?? null, tool_calls: x.tool_calls }
        : { role: x.role, content: x.content }),
    ];
    if (images.length) {
      const prev = messages.at(-1).content;
      const parts = Array.isArray(prev) ? prev : [{ type: 'text', text: String(prev || '') }];
      messages.at(-1).content = [...parts, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
    }
    const body = { model: m.api_model, stream: true, stream_options: { include_usage: true }, messages };
    if (Array.isArray(tools) && tools.length && toolChoice !== 'none') {
      body.tools = tools;
      if (toolChoice) body.tool_choice = toolChoice;
    }
    if (maxTokens) body[/api\.openai\.com/.test(m.base_url) ? 'max_completion_tokens' : 'max_tokens'] = maxTokens; // OpenAI รุ่นคิด (GPT-5, o-series) ไม่รับ max_tokens
    if (m.effort === 'openai' && effort) body.reasoning_effort = { on: 'medium', max: 'high' }[effort] || effort;
    if (m.effort === 'gemini') body.reasoning_effort = effort ? ({ xhigh: 'high', max: 'high', on: 'medium' }[effort] || effort) : 'none';
    if (m.effort === 'deepseek') { // DeepSeek เปิดคิดเป็นค่าเริ่มต้น จึงต้องปิดเองเมื่อเลือก Instant
      body.thinking = { type: effort ? 'enabled' : 'disabled' };
      if (effort) body.reasoning_effort = { on: 'medium', xhigh: 'max', minimal: 'low' }[effort] || effort;
    }
    if (m.effort === 'kimi') body.thinking = { type: effort ? 'enabled' : 'disabled' }; // Kimi K2.5+: เปิด/ปิดคิดอย่างเดียว ไม่มีระดับ
    const thinking = body.reasoning_effort || body.thinking?.type === 'enabled'; // โหมดคิดไม่รับพารามิเตอร์สุ่ม
    for (const k of ['seed', 'response_format', ...(thinking ? [] : ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'stop'])]) if (extra[k] !== undefined) body[k] = extra[k];
    const post = () => fetch(m.base_url + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    let res = await post();
    if (res.status === 400 && body.reasoning_effort) { const t = await res.text(), ne = nearEffort(t, body.reasoning_effort); if (!ne) throw new Error(`upstream 400: ${t.slice(0, 300)}`); body.reasoning_effort = ne; res = await post(); }
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let usage = null, inThink = false, tagBuf = '';
    const OPEN_T = ['<think>', '<thought>'], CLOSE_T = ['</think>', '</thought>'];
    const flushBuf = (final = false) => {
      const out = [];
      for (;;) {
        const tags = inThink ? CLOSE_T : OPEN_T;
        let hit = -1, hitTag = '';
        for (const tg of tags) { const idx = tagBuf.indexOf(tg); if (idx >= 0 && (hit < 0 || idx < hit)) { hit = idx; hitTag = tg; } }
        if (hit >= 0) {
          const pre = tagBuf.slice(0, hit);
          if (pre) out.push(inThink ? { th: pre } : { t: pre });
          tagBuf = tagBuf.slice(hit + hitTag.length);
          inThink = !inThink;
          continue;
        }
        if (final) {
          if (tagBuf) out.push(inThink ? { th: tagBuf } : { t: tagBuf });
          tagBuf = '';
        } else {
          // เก็บส่วนท้ายที่อาจเป็นครึ่งหนึ่งของแท็ก <think> / </think> ไว้รอรอบหน้า
          const keep = Math.max(...tags.map(tg => { for (let k = tg.length - 1; k > 0; k--) if (tagBuf.endsWith(tg.slice(0, k))) return k; return 0; }));
          const emit = tagBuf.slice(0, tagBuf.length - keep);
          if (emit) out.push(inThink ? { th: emit } : { t: emit });
          tagBuf = tagBuf.slice(tagBuf.length - keep);
        }
        break;
      }
      return out;
    };
    for await (const e of sse(res)) {
      const ch = e.choices?.[0], dl = ch?.delta;
      const th = dl?.reasoning_content || dl?.reasoning || dl?.thought || dl?.thinking || (Array.isArray(dl?.reasoning_details) ? dl.reasoning_details.map(x => x?.text || '').join('') : '');
      if (typeof th === 'string' && th) yield { th };
      const t = dl?.content;
      if (typeof t === 'string' && t) { tagBuf += t; for (const ev of flushBuf(false)) yield ev; }
      for (const im of Array.isArray(dl?.images) ? dl.images : []) { // โมเดลที่ตอบเป็นภาพในแชตเลย (เช่น Gemini Image ผ่านรูปแบบ OpenAI): เก็บเป็นไฟล์แล้วแสดงใต้คำตอบ
        const u0 = im?.image_url?.url || im?.url;
        if (typeof u0 === 'string' && u0.startsWith('data:image/') && userId) { const mm = u0.slice(5, u0.indexOf(';')), b64s = u0.slice(u0.indexOf(',') + 1); try { yield { t: `\n\n![image](${await putImage(env, userId, mm === 'image/png' ? 'image/png' : 'image/jpeg', b64s)})\n\n` }; } catch { /* รูปใหญ่เกิน ข้าม */ } }
      }
      if (Array.isArray(dl?.tool_calls) && dl.tool_calls.length) yield { tc: dl.tool_calls };
      if (ch?.finish_reason) yield { stop_reason: ch.finish_reason };
      if (e.usage || ch?.usage) usage = e.usage || ch.usage; // Kimi ใส่ usage ไว้ใน choices
    }
    for (const ev of flushBuf(true)) yield ev;
    if (usage) {
      const p = usage.prompt_tokens || 0, d = usage.prompt_tokens_details;
      const read = usage.prompt_cache_hit_tokens ?? d?.cached_tokens ?? usage.cached_tokens ?? 0, write = d?.cache_write_tokens || 0;
      yield { usage: { fresh: Math.max(0, p - read - write), read, write, out: usage.completion_tokens || 0 } };
    }
  }
}

// ระบบพรอมต์: คำสั่งส่วนตัว + ความจำ + ผลค้นเว็บ
export async function systemFor(env, u, base, skillIds = []) {
  let sys = base;
  if (u.instructions?.trim()) sys += `\n\nUser's custom instructions (follow them):\n${u.instructions.trim().slice(0, 3000)}`;
  const mem = (await env.DB.prepare('SELECT text FROM memories WHERE user_id=? ORDER BY id LIMIT 50').bind(u.id).all()).results;
  if (mem.length) sys += `\n\nThings the user asked you to remember (use them naturally when relevant; do not recite them or mention that you remember):\n${mem.map(x => '- ' + x.text).join('\n')}`;
  const sids = Array.isArray(skillIds) ? skillIds.map(Number).filter(x => x > 0).slice(0, 3) : [];
  if (sids.length) {
    const sks = (await env.DB.prepare(`SELECT name,content FROM skills WHERE id IN (${sids.map(() => '?')}) AND (user_id=0 OR user_id=?) AND enabled=1`).bind(...sids, u.id).all().catch(() => ({ results: [] }))).results;
    if (sks?.length) sys += '\n\nActive Skills (follow these instructions carefully):\n' + sks.map(k => `### Skill: ${k.name}\n${k.content.slice(0, 6000)}`).join('\n\n');
  }
  return sys;
}
// ผลค้นเว็บแปะหน้าข้อความล่าสุด ไม่ต่อท้าย system เพราะ system ที่เปลี่ยนจะทำให้ prefix cache ของทั้งแชตหลุด
// คลังความรู้: เลือกท่อนที่เกี่ยวกับคำถามจากเอกสารทั้งหมดของผู้ใช้ (ไม่เกิน ~12,000 ตัวอักษร) แปะหน้าข้อความล่าสุด
export async function kbBlock(env, uid, question) {
  const docs = (await env.DB.prepare('SELECT name,content FROM user_docs WHERE user_id=?').bind(uid).all().catch(() => ({ results: [] }))).results;
  if (!docs.length) return '';
  const q = grams(question), chunks = [];
  for (const d of docs) for (let i = 0; i < d.content.length; i += 1500) { const text = d.content.slice(i, i + 1500); let s = 0; for (const g of grams(text)) if (q.has(g)) s++; if (s) chunks.push({ name: d.name, at: i, text, s }); }
  const top = chunks.sort((a, b) => b.s - a.s).slice(0, 8); if (!top.length) return '';
  return 'Excerpts from the user\'s knowledge base. Answer from them when relevant and name the document you used:\n' + top.map(c => `[${c.name} @${c.at}]\n${c.text}`).join('\n\n');
}
export const withSources = (text, sources) => sources?.length ? `Web search results (today is ${new Date().toISOString().slice(0, 10)}). Use them when relevant and cite as [1], [2]:\n${sources.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.content}`).join('\n\n')}\n\nUser message:\n${text}` : text;
// ค้นเว็บอัตโนมัติเมื่อคำถามดูเป็นข้อมูลสด (ข่าว ราคา อากาศ ผลแข่ง เวอร์ชันล่าสุด) · แอดมินปิดได้ที่ search_auto · shortcut: ใช้ regex ไม่เรียกโมเดลจัดประเภท ถ้าพลาดบ่อยค่อยเปลี่ยนเป็นโมเดลเล็ก
export const FRESH = /ล่าสุด|วันนี้|ตอนนี้|เมื่อวาน|พรุ่งนี้|ข่าว|ราคา(?:ทอง|น้ำมัน|หุ้น|บิทคอยน์|ล่าสุด)|อัตราแลกเปลี่ยน|สภาพอากาศ|พยากรณ์|ผลบอล|ผลการแข่งขัน|ปัจจุบัน|\b(?:latest|today|tonight|news|current(?:ly)?|right now|this (?:week|month|year)|weather|score|release date|stock price)\b|\b202[5-9]\b/i;
export const autoSearch = async (env, text) => typeof text === 'string' && FRESH.test(text) && (await getSetting(env, 'search_auto')) !== '0';
// บอกโมเดลว่าสร้างรูปได้ (เฉพาะเมื่อแอดมินเปิดระบบสร้างรูปและตั้ง key แล้ว): Code = บรรทัด IMAGE · แชต = บล็อก ```image ให้หน้าเว็บเรียก /api/image ให้เอง
export async function imagePrompt(env, code) {
  const s = await getSettings(env, ['image_enabled', 'image_key_name']);
  if (s.image_enabled !== '1' || !env[s.image_key_name]) return '';
  return code
    ? '\n\nImage generation is available. When the project needs a real picture (hero, banner, product photo, illustration), write a line on its own: IMAGE <detailed English description> -> images/<name>.jpg (up to 2 per reply), then STOP the reply (no path= blocks, READ or RUN lines in the same reply). The page creates the image, saves it in the project and tells you its path; then use it, e.g. <img src="images/<name>.jpg" alt="..."> or CSS url(images/<name>.jpg). Do not use IMAGE for icons or simple shapes: use CSS or inline SVG for those.'
    : '\n\nImage generation is available. When the user asks you to draw, create or generate an image, end your reply with ONE block (and only then):\n```image\n<detailed English description of the image>\n```\nThe page creates the image right below your reply. Never say you cannot create images.';
}
// รูปที่สร้างในแชต: เก็บเป็นก้อนละ ~900K ตัวอักษร (D1 แถวละไม่เกิน ~2MB) ไม่ต้องมี R2 · เสิร์ฟที่ /api/img/<uid>/<key>.png|jpg
// shortcut: ยังไม่มีงานลบรูปเก่า (ลบตอนลบบัญชีเท่านั้น) ถ้ารูปสะสมมากให้เพิ่มลบตามอายุใน cron
export const IMG_CHUNK = 900e3, IMG_MAX = 8e6;
export let imgTable;
export const ensureImgTable = env => imgTable ||= env.DB.prepare('CREATE TABLE IF NOT EXISTS chat_images (key TEXT NOT NULL, n INTEGER NOT NULL, user_id INTEGER NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (key, n))').run().catch(e => { imgTable = undefined; throw e; }); // ล้มครั้งเดียวไม่ควรจำค่าล้มไว้ตลอดอายุ isolate
export async function putImage(env, uid, mime, b64s) {
  if (b64s.length > IMG_MAX) throw new Error('รูปที่ได้ใหญ่เกินไป');
  const ext = mime === 'image/png' ? 'png' : 'jpg', key = rand(12);
  if (env.SLIPS) { await env.SLIPS.put(`img/${uid}/${key}.${ext}`, unb64(b64s), { httpMetadata: { contentType: mime } }); return `/api/img/${uid}/${key}.${ext}`; } // มี R2: เก็บที่ R2
  await ensureImgTable(env);
  const now = Date.now(), ops = [];
  for (let i = 0, n = 0; i < b64s.length; i += IMG_CHUNK, n++) ops.push(env.DB.prepare('INSERT INTO chat_images VALUES (?,?,?,?,?,?)').bind(key, n, uid, mime, b64s.slice(i, i + IMG_CHUNK), now));
  await env.DB.batch(ops);
  return `/api/img/${uid}/${key}.${ext}`;
}
export const modelDown = async (env, id) => (await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE kind='error' AND model_id=? AND created_at>?").bind(id, Date.now() - 300e3).first()).n >= 3;
// คะแนน 👍/👎 ต่อคำตอบ และรายงานคำตอบที่ไม่เหมาะสม (สร้างตารางเองตอนใช้ครั้งแรก)
export let fbTable;
export const ensureFb = env => fbTable ||= env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS feedback (message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, model_id INTEGER, vote INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id))'),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER, user_id INTEGER, model_id INTEGER, reason TEXT, snippet TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)"),
]).catch(e => { fbTable = undefined; throw e; });
// หน้าเว็บของโปรเจกต์ที่แชร์: รวม CSS/JS/รูปเข้าไฟล์ HTML เดียว (เวอร์ชันฝั่งเซิร์ฟเวอร์ของ buildHtml ในหน้า Code · ไม่รองรับ ES module ที่ import ข้ามไฟล์)
export const STORAGE_SHIM = `<script>try{localStorage.getItem('_')}catch(e){for(const n of['localStorage','sessionStorage']){const m=new Map();Object.defineProperty(window,n,{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}})}}</script>`;
export function bundleProject(files, page = null) { // page = หน้า .html ที่ขอ (เว็บหลายหน้า) ไม่งั้น index.html
  const has = p => files.has(p), isImg = p => /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i.test(p), data = p => { const c = files.get(p) || ''; return c.startsWith('data:image/') ? c : null; };
  const entry = page && has(page) ? page : has('index.html') ? 'index.html' : [...files.keys()].find(f => /\.html?$/i.test(f));
  if (!entry) return null;
  const dir = entry.replace(/[^/]*$/, '');
  const resolve = ref => {
    if (/^([a-z]+:|\/\/|#)/i.test(ref)) return null;
    const out = []; for (const x of (ref.startsWith('/') ? ref.slice(1) : dir + ref).split('?')[0].split('#')[0].split('/')) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }
    const p = out.join('/'); return has(p) ? p : null;
  };
  const b64 = str => { let o = ''; for (const x of new TextEncoder().encode(str)) o += String.fromCharCode(x); return btoa(o); };
  const deferred = [];
  let html = files.get(entry)
    .replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, h) => { const f = resolve(h); return f && /stylesheet/i.test(m) ? `<style>\n${files.get(f)}\n</style>` : m; })
    .replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi, (m, a, src, b) => { const f = resolve(src); if (!f) return m; if (isImg(f) && data(f)) return `<img${a}src="${data(f)}"${b}>`; return /\.svg$/i.test(f) ? `<img${a}src="data:image/svg+xml;base64,${b64(files.get(f))}"${b}>` : m; })
    .replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => { const f = resolve(src); if (!f) return m; const tag = `<script${(a + b).replace(/\s+defer\b(=["']?[^"'\s>]*["']?)?/gi, '')}>\n${files.get(f).replace(/<\/script/gi, '<\\/script')}\n</script>`; if (/\bdefer\b/i.test(a + b) && !/type\s*=\s*["']module/i.test(a + b)) { deferred.push(tag); return ''; } return tag; }) // defer ใช้กับสคริปต์ฝังไม่ได้ → ย้ายไปท้าย body (ลำดับเดิม)
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => { const f = resolve(ref); return f && isImg(f) && data(f) ? `url(${q}${data(f)}${q})` : m; });
  if (deferred.length) html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, deferred.join('\n') + '\n</body>') : html + deferred.join('\n');
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + STORAGE_SHIM) : STORAGE_SHIM + html;
}
// อ่านลิงก์ในข้อความล่าสุด (สูงสุด 2 ลิงก์): ดึงหน้าเว็บแล้วตัดเหลือข้อความ ให้ AI สรุป/ตอบจากเนื้อหาจริง
// กันยิงเข้าเครือข่ายภายใน: รับแค่ http(s) โดเมนปกติ ไม่รับ IP ตรงๆ / localhost / .local
export async function readLinks(text) {
  const urls = [...new Set(String(text || '').replace(/\[\[file:[\s\S]*?\[\[\/file\]\]/g, '').match(/https?:\/\/[^\s<>"'`)\]]+/g) || [])].slice(0, 2);
  return (await Promise.all(urls.map(async url => {
    let u; try { u = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname) || u.port) return null;
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; AstraCodeReader/1.0)', accept: 'text/html,text/plain,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!r?.ok || !/text\/|json/.test(r.headers.get('content-type') || '')) return null;
    const raw = (await r.text()).slice(0, 600000), title = /<title[^>]*>([^<]{1,200})/i.exec(raw)?.[1]?.trim() || '';
    const body = raw.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    return body.length > 80 ? { url, title, text: body.slice(0, 20000) } : null;
  }))).filter(Boolean);
}
export async function webSearch(env, q) { // Tavily
  if (!env.TAVILY_KEY || (await getSetting(env, 'search_enabled')) === '0') return [];
  try {
    const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.TAVILY_KEY },
      body: JSON.stringify({ query: q.slice(0, 400), max_results: 5, search_depth: 'basic' }) });
    if (!r.ok) return [];
    return ((await r.json()).results || []).slice(0, 5).map(x => ({ title: String(x.title || x.url).slice(0, 200), url: x.url, content: String(x.content || '').slice(0, 1200) }));
  } catch { return []; }
}
// คำแนะนำเพิ่มตามตระกูลโมเดลในโหมด Code (ใช้เมื่อแอดมินไม่ได้ตั้ง code_prompt ของโมเดลนั้นเอง) · จุดที่แต่ละตระกูลพลาดบ่อย
export const familyHint = m => {
  const n = `${m.name} ${m.api_model}`.toLowerCase();
  if (m.provider === 'anthropic' || n.includes('claude')) return 'Keep prose short: one or two sentences before the edit blocks, none after unless something needs the user. Prefer several small SEARCH/REPLACE pairs over one large one.';
  if (n.includes('gemini')) return 'Output format is strict: every file change must be a fenced block whose opening fence line contains path=<file>. Do not describe a change without writing its block. Do not wrap the whole answer in one outer code fence. Copy SEARCH text exactly from the file, including indentation.';
  if (n.includes('deepseek')) return 'Do the reasoning silently and keep the visible answer short. Never print a whole file when a SEARCH/REPLACE pair is enough. Copy SEARCH text exactly from the file; do not retype it from memory.';
  if (n.includes('gpt') || m.provider === 'responses') return 'Do not ask for confirmation before making a change the user asked for; make it. Do not use "..." or "rest of file unchanged" placeholders inside path= blocks. Batch all READ lines in one reply.';
  return 'Copy SEARCH text exactly from the file, and put path=<file> on the opening fence line of every file block.';
};
// ค้นเว็บแบบหลายคำค้น: ให้โมเดลถูกสุดเขียนคำค้น 1-3 คำจากบทสนทนา (คำถามต่อเนื่องอย่าง "แล้วราคาล่ะ" ค้นตรงๆ ไม่เจอ) แล้วค้นพร้อมกัน รวมผลไม่ซ้ำ
export async function smartSearch(env, u, hist) {
  const last = String(hist.at(-1)?.content || '').replace(/\n\n\[\[file:[\s\S]*$/, '').slice(0, 1500);
  let queries = [last];
  if (env.TAVILY_KEY && (hist.length > 1 || last.length > 120)) try {
    const m = (await env.DB.prepare("SELECT * FROM models WHERE active=1 AND provider NOT IN ('image','embedding') ORDER BY cost_in+cost_out").all()).results.find(x => env[x.key_name]);
    if (m) {
      const ctx = hist.slice(-5).map(x => `${x.role === 'user' ? 'User' : 'Assistant'}: ${String(x.content || '').slice(0, 500)}`).join('\n');
      let outT = '', usage = null; const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000); // ช้าเกิน 8 วินาที = ใช้คำถามเดิมค้นเลย
      try { for await (const e of callModel(env, m, [{ role: 'user', content: ctx }], { effort: null, maxTokens: 120, signal: ac.signal, system: 'Write 1 to 3 web search queries that would find the facts needed to answer the last user message. Resolve pronouns from the conversation. One query per line, no numbering, no quotes, nothing else. Use the language most likely to find good sources.' })) { if (e.t) outT += e.t; if (e.usage) usage = e.usage; } } finally { clearTimeout(timer); }
      if (usage) await logUsage(env, u.id, m, usage, { units: false });
      const qs = outT.split('\n').map(x => x.replace(/^[\s\d.)\-*"']+|["']+$/g, '').trim()).filter(x => x.length > 2 && x.length < 200).slice(0, 3);
      if (qs.length) queries = qs;
    }
  } catch { /* ใช้คำถามเดิม */ }
  const seen = new Set(), out = [];
  for (const list of await Promise.all(queries.map(q => webSearch(env, q)))) for (const r of list) if (!seen.has(r.url)) { seen.add(r.url); out.push(r); }
  return out.slice(0, 8);
}
// ไฟล์แนบที่ยาวมาก: ส่งเฉพาะท่อนที่เกี่ยวกับคำถาม (เทียบคำ/ชุดอักษร 3 ตัว) แทนการส่งทั้งไฟล์จนล้น context · ไฟล์สั้นส่งเต็ม
export const FILE_FULL = 30000, FILE_CHUNK = 2000;
const grams = s => { const out = new Set(), t = String(s).toLowerCase(); for (const w of t.match(/[a-z0-9_]{3,}/g) || []) out.add(w); const th = t.replace(/[\x00-\x7f]+/g, ' '); for (let i = 0; i + 3 <= th.length; i++) { const g = th.slice(i, i + 3); if (!g.includes(' ')) out.add(g); } return out; };
export function excerptFiles(content, question) {
  return String(content || '').replace(/(\[\[file:[^\]\n]+\]\]\n)([\s\S]*?)(\n\[\[\/file\]\])/g, (all, open, body, close) => {
    if (body.length <= FILE_FULL) return all;
    const q = grams(question), chunks = []; for (let i = 0; i < body.length; i += FILE_CHUNK) chunks.push({ i, text: body.slice(i, i + FILE_CHUNK) });
    chunks.forEach((c, k) => { let s = 0; for (const g of grams(c.text)) if (q.has(g)) s++; c.score = s + (k === 0 ? 1e6 : 0); }); // ท่อนแรกเก็บเสมอ (หัวไฟล์/สารบัญ)
    const keep = new Set([...chunks].sort((a, b) => b.score - a.score).slice(0, Math.floor(FILE_FULL / FILE_CHUNK)).map(c => c.i));
    // ท่อนที่ตัดมากลางหน้า: ใส่เลขหน้า/ชีตล่าสุดก่อนท่อนนั้นไว้ ให้ AI อ้างอิงหน้าได้ถูก
    const markAt = i => { const m = [...body.slice(Math.max(0, i - 200000), i).matchAll(/--- (หน้า \d+|ชีต [^\n]+) ---/g)].at(-1); return m ? `--- ${m[1]} (ต่อ) ---\n` : ''; };
    let outB = '', gap = false; for (const c of chunks) { if (keep.has(c.i)) { outB += (gap ? '\n[...ข้ามบางส่วน...]\n' + (/^\s*--- (หน้า|ชีต) /.test(c.text) ? '' : markAt(c.i)) : '') + c.text; gap = false; } else gap = true; }
    return `${open}[ไฟล์ยาว ${body.length.toLocaleString()} ตัวอักษร: แสดงเฉพาะส่วนที่เกี่ยวกับคำถาม ถ้าต้องการส่วนอื่นให้ผู้ใช้ถามเจาะจง]\n${outB}${close}`;
  });
}
// บันทึกการใช้งาน + คิดเงิน wallet เมื่อจ่ายแบบตามใช้ (API / ลิมิตเต็มแล้วใช้ wallet)
export async function logUsage(env, uid, m, usage, { units = true, wallet = null, plan = null, job = null, ms = null, ttft = null } = {}) {
  const cost = flat(m) ? m.req_cost : (usage.fresh * m.cost_in + usage.read * m.cost_cache + usage.write * m.cost_cache_write + usage.out * m.cost_out) / 1e6; // โมเดลคิดเหมาต่อ request: ต้นทุนคงที่ ไม่ขึ้นกับ token
  const un = units ? Math.max(cost * limMult(m), 1e-9) : 0; // หน่วยลิมิต = ต้นทุนจริง (บาท) × ตัวคูณโมเดล · 0 = ไม่หักลิมิตผู้ใช้
  const now = Date.now();
  if (units) await touchWindows(env, uid, now, plan); // เริ่มรอบก่อนบันทึก เพื่อให้แถวนี้นับอยู่ในรอบ
  await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,ms,ttft) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(uid, m.id, usage.fresh + usage.write, usage.out, usage.read, un, cost, now, ms, ttft || null).run();
  // ต้นทุน/token ต่องาน Agent · ctx_peak = input ของรอบที่ใหญ่สุด (ใช้แสดง context ของทีม)
  if (job) { const tin = usage.fresh + usage.read + usage.write; await env.DB.prepare('UPDATE agent_jobs SET cost=COALESCE(cost,0)+?, tin=COALESCE(tin,0)+?, tout=COALESCE(tout,0)+?, ctx_peak=MAX(COALESCE(ctx_peak,0),?) WHERE id=?').bind(cost, tin, usage.out, tin, job).run(); }
  let charge = 0;
  if (wallet) {
    const p = await priceOf(env, m); charge = Math.round((p.req > 0 ? p.req : (usage.fresh * p.in + usage.read * p.cache + usage.write * p.write + usage.out * p.out) / 1e6) * 10000) / 10000;
    if (charge > 0) await walletAdd(env, uid, -charge, wallet, m.name);
  }
  return charge; // ยอดที่ตัดจาก wallet (0 ถ้าไม่ได้ตัด)
}
export async function chat(req, env, u, ctx) {
  const b = await req.json();
  if (b.resume || b.stop) { // ต่อสตรีมคำตอบที่ยังทำอยู่ หรือกดหยุดจริง (การหลุดการเชื่อมต่อเฉยๆ ไม่หยุด AI)
    const cid = +b.chat_id;
    if (!env.CHATRUN || !cid || !await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first()) return json({ ok: true, idle: true });
    const stub = runStub(env, u.id, cid);
    if (b.stop) { await stub.fetch('https://run/stop', { method: 'POST' }); return json({ ok: true }); }
    return runStream(stub, 0);
  }
  const images = Array.isArray(b.images) && !b.regenerate ? b.images.slice(0, 4) : [];
  if (images.some(d => typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d) || d.length > 2e6)) return err('รูปต้องเป็น jpeg/png/webp ไม่เกิน 1.5MB');
  const files = Array.isArray(b.files) && !b.regenerate ? b.files : [];
  if (files.length > 5 || files.some(f => typeof f?.name !== 'string' || typeof f?.text !== 'string' || f.name.length > 120)) return err('ไฟล์แนบไม่ถูกต้อง (สูงสุด 5 ไฟล์)');
  if (files.reduce((a, f) => a + f.text.length, 0) > 400000) return err('ไฟล์รวมกันยาวเกินไป ลองแนบทีละน้อยลง');
  let text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 20000) return err('ข้อความยาวเกิน 20,000 ตัวอักษร');
  if (!b.regenerate && !text && !images.length && !files.length) return err('ข้อความว่าง');
  if (!text) text = files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้';
  const effort = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(b.effort) ? b.effort : null;
  const ephemeral = !!b.ephemeral; // โหมดเทียบโมเดล: ไม่บันทึกแชต
  const plan = await planOf(env, u);
  if (b.model_id === 'auto') b.model_id = await autoModel(env, plan, u, { text, images, files, effort, regenerate: b.regenerate });
  let m = await env.DB.prepare('SELECT m.* FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.id=? AND m.active=1').bind(plan.id, b.model_id).first(), offPlan = false;
  if (!m && u.balance > 0) { m = await env.DB.prepare("SELECT * FROM models WHERE id=? AND active=1 AND public=1 AND provider<>'embedding'").bind(b.model_id).first(); offPlan = !!m; } // โมเดลนอกแพลน: จ่ายจาก Wallet ตามราคาขาย ไม่หักลิมิตแพลน
  if (!m) return err(u.balance > 0 ? 'ใช้โมเดลนี้ไม่ได้' : 'แพลนของคุณใช้โมเดลนี้ไม่ได้ · เติม Wallet เพื่อใช้ทุกโมเดลตามราคาขาย', 403);
  if (images.length && !m.vision) return err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น');
  if (!offPlan && await capHit(env, u, plan, m)) return json({ error: `${m.name} ใช้ถึงเพดานรายสัปดาห์แล้ว ลองโมเดลอื่นได้เลย`, cap: true }, 429);
  if (await reqCapHit(env, u, m)) return json({ error: `${m.name} ใช้ครบ ${m.req_cap} ครั้งใน 4 ชั่วโมงแล้ว ลองโมเดลอื่นหรือรอสักครู่`, cap: true }, 429);
  if (await blockedText(env, text)) return err('ข้อความนี้มีเนื้อหาที่ระบบไม่รับ');
  const st = await usageStatus(env, u, plan), pw0 = st.pctWeek;
  // ลิมิตเต็ม: ใช้เงินใน wallet ต่อได้ ถ้าผู้ใช้เปิดไว้
  const overflow = offPlan ? 'wallet' : (st.pct4h >= 100 || st.pctWeek >= 100) ? (u.wallet_overflow && u.balance > 0 && !ephemeral ? 'overflow' : null) : null;
  if (!offPlan && (st.pct4h >= 100 || st.pctWeek >= 100) && !overflow) return json({ error: 'ลิมิตเต็มแล้ว', ...st, wallet: u.balance }, 429);
  if (await limited(env, 'chatmin:' + u.id, 20, 60e3)) return err('ส่งเร็วเกินไป รอสักครู่', 429);
  // ให้ตอบได้ทีละข้อความ กันยิงพร้อมกันหลายอันเพื่อเลี่ยงลิมิต (ล็อกหมดอายุเองใน 3 นาที) ยกเว้นโหมดเทียบ
  // โหมดเทียบ (ephemeral) ขนานได้สูงสุด 3 ช่อง ไม่ใช่ไม่จำกัด
  let lock = null;
  for (const k of ephemeral ? [0, 1, 2].map(i => 'chatlock:' + u.id + ':e' + i) : ['chatlock:' + u.id]) {
    if (await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(k, Date.now() + LOCK_MS, Date.now()).first()) { lock = k; break; }
  }
  if (!lock) return err('กำลังตอบข้อความก่อนหน้าอยู่', 429);
  const fail = async (...a) => { await unlimit(env, lock); return err(...a); }; // ทางออกก่อนเริ่มตอบต้องคืนล็อกเสมอ
  try {

  const pid = b.project_id || null; // โหมด Code
  if (pid && !await projectFor(env, pid, u.id)) return fail('ไม่พบโปรเจกต์', 404);
  let cid = ephemeral ? null : b.chat_id;
  if (cid && !await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(cid, u.id).first()) return fail('ไม่พบแชต', 404);
  // ไฟล์เก็บในข้อความ โมเดลจึงจำได้ในข้อความถัดไป (รูปแบบเดียวกับฝั่งเว็บ)
  // shortcut: ไม่เก็บรูปไว้ในประวัติ (โมเดลเห็นรูปแค่ข้อความนี้) ถ้าต้องการให้จำรูป ให้เก็บใน R2
  const saved = text + files.map(f => `\n\n[[file:${f.name.replace(/[[\]\r\n]/g, '')}]]\n${f.text}\n[[/file]]`).join('') + (images.length ? `\n\n[แนบรูป ${images.length} รูป]` : '');
  let hist, chatRow = null;
  if (ephemeral) hist = [{ role: 'user', content: saved }];
  else {
    if (b.edit_id && cid) { // แก้ไขข้อความเดิมของ user แล้วลบข้อความหลังจากนั้นเพื่อตอบใหม่
      const target = await env.DB.prepare("SELECT id FROM messages WHERE id=? AND chat_id=? AND role='user'").bind(+b.edit_id, cid).first();
      if (!target) return fail('ไม่พบข้อความที่จะแก้ไข', 404);
      await env.DB.batch([
        env.DB.prepare('UPDATE messages SET content=?, model_id=? WHERE id=?').bind(saved, m.id, target.id),
        env.DB.prepare('DELETE FROM messages WHERE chat_id=? AND id>?').bind(cid, target.id),
        env.DB.prepare('UPDATE chats SET summary=CASE WHEN summary_upto>=?1 THEN NULL ELSE summary END, summary_upto=CASE WHEN summary_upto>=?1 THEN NULL ELSE summary_upto END WHERE id=?2').bind(target.id, cid),
      ]);
    } else if (b.regenerate) { // ตอบใหม่: ลบคำตอบล่าสุด แล้วใช้คำถามเดิม
      const last = cid && await env.DB.prepare('SELECT id,role FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').bind(cid).first();
      if (!last) return fail('ไม่มีข้อความให้ตอบใหม่');
      if (last.role === 'assistant') await env.DB.prepare('DELETE FROM messages WHERE id=?').bind(last.id).run();
    } else {
      if (!cid) cid = (await env.DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id,folder_id) VALUES (?,?,?,?,?) RETURNING id').bind(u.id, text.slice(0, 40), Date.now(), pid, b.folder_id || null).first()).id;
      await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(cid, 'user', saved, m.id, Date.now()).run();
    }
    chatRow = await env.DB.prepare('SELECT summary,summary_upto,instructions FROM chats WHERE id=?').bind(cid).first();
    const hmax = pid ? HISTORY_CODE : HISTORY, after = chatRow?.summary_upto || 0;
    const hn = (await env.DB.prepare('SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>?').bind(cid, after).first()).n;
    hist = (await env.DB.prepare('SELECT role,content FROM messages WHERE chat_id=? AND id>? ORDER BY id LIMIT -1 OFFSET ?').bind(cid, after, histStart(hn, hmax)).all()).results.map(x => ({ ...x, content: String(x.content || '').replace(/\u2063/g, '') })).filter(x => x.content); // ตัดตัวคั่นรอบความคิดที่มองไม่เห็น + ตัดคำตอบว่าง (กดหยุดตอนยังคิดอยู่)
    while (hist.length && hist[0].role !== 'user') hist.shift();
    if (!pid) { const q = text; hist.forEach(x => { if (x.role === 'user' && x.content.length > FILE_FULL) x.content = excerptFiles(x.content, q); }); }
    if (pid) hist.forEach((x, i) => { if (i < hist.length - 1 && x.role === 'user') x.content = stripOpenFile(x.content); }); // เนื้อหาไฟล์ที่เปิดอยู่ส่งเฉพาะข้อความล่าสุด (ไม่ซ้ำทุกรอบ ประหยัด token)
    if (!hist.length) { await unlimit(env, lock); return err('ไม่มีข้อความให้ตอบ'); }
  }

  const J = { u, plan, m, hist, cid, pid, effort, images, overflow, lock, search: !!b.search, skill_ids: Array.isArray(b.skill_ids) ? b.skill_ids.slice(0, 3) : [], mcp_ids: Array.isArray(b.mcp_ids) ? b.mcp_ids.map(Number).filter(x => x > 0).slice(0, 3) : [], summary: chatRow?.summary || null, chat_ins: chatRow?.instructions || null, pw0, agent: !!(b.agent && pid && plan.price > 0), kb: !!b.kb && !pid };
  if (env.CHATRUN) { // ให้ Durable Object ตอบต่อเบื้องหลัง แม้ผู้ใช้ปิดจอหรือหลุด แล้วต่อสตรีมกลับมาดูได้
    const stub = runStub(env, u.id, ephemeral ? lock : cid);
    await stub.fetch('https://run/start', { method: 'POST', body: JSON.stringify(J) });
    return runStream(stub, 0);
  }
  const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(), st = { gone: false };
  const send = async o => { if (st.gone) return; try { await w.write(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch { st.gone = true; } };
  ctx.waitUntil(runChat(env, J, send, st).catch(() => unlimit(env, lock)).then(() => w.close().catch(() => {})));
  return new Response(readable, SSE);
  } catch (e) { await unlimit(env, lock); throw e; }
}
export const SSE = { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } };
export const runStub = (env, uid, key) => env.CHATRUN.get(env.CHATRUN.idFromName('run:' + uid + ':' + key));
export const runStream = (stub, from) => stub.fetch('https://run/stream?from=' + from).then(r => new Response(r.body, SSE));
// ตอบแชต: เรียกโมเดล ส่ง event ผ่าน send บันทึกข้อความ/ค่าใช้จ่าย แล้วปลดล็อก (st.gone = ผู้ใช้กดหยุดเอง)
export async function runChat(env, J, send, st) {
  const { u, plan, m, hist, cid, pid, effort, overflow, lock } = J;
  let imgs0 = J.images;
  let out = '', think = '', usage = null, model = m; const tStart = Date.now(); let ttft = 0; // เวลาจนได้ตัวอักษรแรก/ความคิดแรก (สุขภาพโมเดล)
  await send({ chat_id: cid, model: m.name, overflow: overflow === 'overflow', wallet: overflow === 'wallet' });
  const sources = !pid && (J.search || await autoSearch(env, hist.at(-1).content)) ? await smartSearch(env, u, hist) : [];
  if (sources.length) await send({ sources: sources.map(({ title, url }) => ({ title, url })) });
  const projFile = pid ? (await env.DB.prepare("SELECT content FROM project_files WHERE project_id=? AND path IN ('ASTRA.md','AGENTS.md') ORDER BY path LIMIT 1").bind(pid).first())?.content?.trim() : ''; // ไฟล์กติกาในโปรเจกต์ (แก้ได้เอง/ให้ AI แก้ และซิงก์กับ GitHub ไปด้วย)
  const projIns = pid ? [(await env.DB.prepare('SELECT instructions FROM projects WHERE id=?').bind(pid).first())?.instructions?.trim(), projFile && !projFile.startsWith('data:') ? 'From the project file ASTRA.md:\n' + projFile.slice(0, 3000) : ''].filter(Boolean).join('\n\n') : '';
  const system = (await systemFor(env, u, pid ? SYSTEM_CODE + '\n\n' + (m.code_prompt?.trim() || familyHint(m)) + (projIns ? '\n\nProject-specific instructions (follow them):\n' + projIns.slice(0, 3000) : '') : SYSTEM, J.skill_ids)) + (J.summary ? `\n\nSummary of the earlier part of this conversation (older messages are not shown):\n${J.summary}` : '') + (J.chat_ins ? `\n\nInstructions the user set for this conversation (follow them):\n${J.chat_ins}` : '') + (await imagePrompt(env, !!pid)); // code_prompt: แอดมินเขียนกำกับโมเดลที่ไม่ค่อยทำตาม
  const mcpTools = [], mcpMap = new Map();
  if (J.mcp_ids?.length) {
    const srvs = (await env.DB.prepare(`SELECT * FROM mcp_servers WHERE id IN (${J.mcp_ids.map(() => '?')}) AND (user_id=0 OR user_id=?) AND enabled=1`).bind(...J.mcp_ids, u.id).all().catch(() => ({ results: [] }))).results;
    for (const sv of srvs) {
      const tok = sv.token_enc ? await unseal(env, sv.token_enc).catch(() => null) : null;
      let list = []; try { list = JSON.parse(sv.tools_json || '[]'); } catch {}
      for (const t of list) {
        const safe = `mcp_${sv.id}_${String(t.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
        mcpMap.set(safe, { url: sv.url, tok, name: t.name, server: sv.name });
        mcpTools.push({ type: 'function', function: { name: safe, description: `[${sv.name}] ${t.description || t.name}`, parameters: t.inputSchema } });
      }
    }
  }
  // ตัวตัดวงจร: โมเดลที่ error ตั้งแต่ 3 ครั้งใน 5 นาทีล่าสุดถือว่าล่ม ถ้ามีโมเดลสำรองที่ยังปกติให้สลับไปเลย ไม่ต้องรอให้พังซ้ำต่อหน้าผู้ใช้
  if (model.fallback_id && await modelDown(env, model.id)) {
    const fb = await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(model.fallback_id).first();
    if (fb && !await modelDown(env, fb.id)) { model = fb; await send({ fallback: fb.name }); }
  }
  const kb = J.kb ? await kbBlock(env, u.id, hist.at(-1).content) : '';
  const links = !pid ? await readLinks(hist.at(-1).content).catch(() => []) : [];
  if (links.length) await send({ sources: [...sources, ...links].map(({ title, url }) => ({ title, url })) });
  const linkCtx = links.map(l => `[เนื้อหาจากลิงก์ ${l.url}${l.title ? ' · ' + l.title : ''}]\n${l.text}`).join('\n\n');
  let msgs = sources.length || kb || linkCtx ? hist.map((x, i) => i === hist.length - 1 ? { ...x, content: (kb ? kb + '\n\n' : '') + withSources(x.content, sources) + (linkCtx ? '\n\n' + linkCtx : '') } : x) : hist, imgs = imgs0, beat = Date.now(), lastKind = '';
  // ความคิดหลายรอบ: เมื่อโมเดลกลับมาคิดอีกหลังมีข้อความ/ขั้นตอนไปแล้ว เริ่มส่วนความคิดใหม่ (\u0001 คั่นใน thinking) และวางตัวคั่นที่มองไม่เห็น (\u2063\u2063) ในข้อความตรงจุดนั้น ให้หน้าเว็บแสดง Thinking หลายกล่องสลับกับข้อความ
  let round_ = 1; // จำนวนรอบที่โมเดลตอบ (รวมรอบอ่านไฟล์) ใช้แสดงในหน้า Code
  const maxRounds = J.agent ? AGENT_ROUNDS : TOOL_ROUNDS, inMax = J.agent ? AGENT_IN_MAX : ANSWER_IN_MAX; // โหมด Agent: ทำงานยาวได้มากรอบกว่า
  let ctxUsed = 0, cumIn = 0, capped = false, trimmedSent = false; // context ที่ใช้รอบล่าสุด · input รวมทุกรอบของคำตอบนี้ (เพดาน ANSWER_IN_MAX)
  for (let round = 0; ; round++) { // โหมด Code + Remote MCP
    round_ = round + 1;
    let part = '', ru = null;
    const tcs = new Map(), anthIdx = new Map();
    const fit = fitContext(system, msgs, ctxMax(model)); msgs = fit.msgs; ctxUsed = fit.used; if (fit.trimmed && !trimmedSent) { trimmedSent = true; await send({ trimmed: true }); } // ไม่ส่งเกิน context ของโมเดล (upstream จะ error)
    for (let attempt = 0; attempt < 2; attempt++) {
      // นาฬิกาเฝ้าโมเดล: ไม่มีข้อความ/ความคิดตัวแรกภายใน 90 วิ (effort สูงสุด 150 วิ) หรือเงียบเกิน 60 วิกลางทาง = ตัดการเชื่อมต่อ แล้วใช้ทางสลับโมเดลสำรอง/แจ้งข้อผิดพลาด แทนที่ผู้ใช้จะรอไม่จบ
      const ac = new AbortController(); let stalled = 0, wd;
      const arm = ms => { clearTimeout(wd); wd = setTimeout(() => { stalled = ms; ac.abort(); }, ms); };
      const firstMs = (model.first_token_s > 0 ? model.first_token_s : ['high', 'xhigh', 'max'].includes(effort) ? 150 : 90) * 1000, idleMs = (model.idle_s > 0 ? model.idle_s : 60) * 1000; // ตั้งต่อโมเดลได้ในหลังบ้าน
      arm(firstMs);
      try {
        for await (const e of callModel(env, model, msgs, { effort, images: imgs, system, tools: mcpTools.length ? mcpTools : undefined, userId: u.id, signal: ac.signal })) {
          arm(idleMs);
          if (st.gone) break;
          if (Date.now() - beat > 15e3) { beat = Date.now(); await env.DB.prepare('UPDATE rate SET reset=? WHERE key=?').bind(beat + LOCK_MS, lock).run(); }
          if ((e.t || e.th) && !ttft) ttft = Date.now() - tStart;
          if (e.t) { lastKind = 't'; out += e.t; part += e.t; await send({ t: e.t }); }
          if (e.th) { if (lastKind === 't') { think += '\u0001'; out += '\u2063\u2063'; await send({ t: '\u2063\u2063' }); } lastKind = 'th'; think += e.th; await send({ th: e.th }); }
          if (e.tc_start) { const idx = tcs.size; anthIdx.set(e.tc_start.index, idx); tcs.set(idx, { id: e.tc_start.id, type: 'function', function: { name: e.tc_start.name, arguments: '' } }); }
          if (e.tc_delta) { const idx = anthIdx.get(e.tc_delta.index); if (idx != null) tcs.get(idx).function.arguments += e.tc_delta.args; }
          if (e.tc) for (const d of e.tc) {
            const idx = d.index ?? 0;
            if (!tcs.has(idx)) tcs.set(idx, { id: d.id || 'call_' + rand(8), type: 'function', function: { name: '', arguments: '' } }); // ชื่อต่อท้ายบรรทัดถัดไปครั้งเดียว (ไม่ใส่ซ้ำสองรอบ)
            const c = tcs.get(idx); if (d.id) c.id = d.id; if (d.function?.name) c.function.name += d.function.name; if (d.function?.arguments) c.function.arguments += d.function.arguments;
          }
          if (e.usage) ru = e.usage;
        }
        clearTimeout(wd);
        if (!out && !think && !tcs.size && !st.gone) throw new Error('โมเดลส่งคำตอบว่างกลับมา'); // ตอบว่าง = ถือเป็นข้อผิดพลาด (นับเข้าตัวตัดวงจร และลองโมเดลสำรอง)
        break;
      } catch (e0) {
        clearTimeout(wd);
        const e = stalled ? new Error(`โมเดลไม่ตอบภายใน ${Math.round(stalled / 1000)} วินาที`) : e0;
        console.log('AI error', model.name, e.message);
        await event(env, 'error', model.id, e.message.slice(0, 300));
        const fb = !out && !think && !tcs.size && attempt === 0 && model.fallback_id && await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(model.fallback_id).first();
        if (fb) { model = fb; await send({ fallback: fb.name }); continue; } // โมเดลหลักล่ม: สลับไปโมเดลสำรอง
        await send({ error: u.role === 'admin' ? 'แอดมิน: ' + e.message : 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' });
        break;
      }
    }
    cumIn += ru ? ru.fresh + ru.read + ru.write : ctxUsed;
    if (ru) usage = usage ? { fresh: usage.fresh + ru.fresh, read: usage.read + ru.read, write: usage.write + ru.write, out: usage.out + ru.out } : ru;
    const toolCalls = [...tcs.values()];
    if (toolCalls.length && !st.gone && round < 5) {
      msgs = [...msgs, { role: 'assistant', content: part || null, tool_calls: toolCalls }];
      imgs = [];
      for (const tc of toolCalls) {
        const meta = mcpMap.get(tc.function?.name);
        let resText = 'ไม่พบเครื่องมือนี้', ok = false;
        if (meta) {
          let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          try { resText = await mcpCall(meta.url, meta.tok, meta.name, args); ok = true; }
          catch (err) { resText = 'Error: ' + err.message; }
          await send({ mcp: { server: meta.server, tool: meta.name, ok } });
        }
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: resText });
      }
      await env.DB.prepare('UPDATE rate SET reset=? WHERE key=?').bind(Date.now() + LOCK_MS, lock).run();
      lastKind = 't';
      continue;
    }
    const reqs = pid && !st.gone && round < maxRounds && !/```[^\n]*\bpath=/.test(part) && !/^\s*RUN\s+\S/m.test(part.replace(/```[\s\S]*?```/g, '')) ? toolReqs(part) : []; // RUN รันที่เครื่องผู้ใช้ จึงหยุดรอ
    if (!reqs.length) break;
    if (cumIn >= inMax) { // คำตอบเดียวใช้ input เกินเพดาน: ไม่อ่านไฟล์เพิ่ม ให้ทำต่อจากที่มี (รอบถัดไปถ้ายังขออ่านอีกก็จบเลย)
      if (capped) break; capped = true;
      await send({ t: '\n\n' }); out += '\n\n'; lastKind = 't';
      msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: '[ระบบ] คำตอบนี้ใช้ context ครบเพดานแล้ว ห้าม READ / GREP / LIST เพิ่ม ทำงานต่อหรือตอบจากข้อมูลที่มีตอนนี้เลย' }];
      continue;
    }
    await send({ round: round + 2, of: maxRounds + 1, doing: doingOf(reqs) }); // บอกหน้าเว็บว่าเข้ารอบถัดไป (อ่านไฟล์แล้วคิดต่อ)
    const result = await runTools(env, pid, reqs);
    await send({ t: '\n\n' }); out += '\n\n'; lastKind = 't';
    msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: result }]; imgs = [];
    await env.DB.prepare('UPDATE rate SET reset=? WHERE key=?').bind(Date.now() + LOCK_MS, lock).run(); // ยืดล็อกระหว่างทำหลายรอบ
  }
  if (!usage && (st.gone || out || think)) { // กดหยุดหรือ upstream ไม่ส่ง usage จริง → ประมาณจากจำนวนตัวอักษร ÷ 2
    const chars = hist.reduce((a, x) => a + String(x.content || '').length, system.length);
    usage = { fresh: Math.ceil(chars / 2), read: 0, write: 0, out: Math.ceil((out.length + think.length) / 2) };
  }
  const tok = usage && { in: usage.fresh + usage.read + usage.write, out: usage.out };
  let mid = null;
  if ((out || think) && cid) mid = (await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,thinking,sources,tin,tout) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(cid, 'assistant', out, model.id, Date.now(), think || null, sources.length ? JSON.stringify(sources.map(({ title, url }) => ({ title, url }))) : null, tok?.in ?? null, tok?.out ?? null).first())?.id ?? null;
  const charged = usage ? await logUsage(env, u.id, model, usage, { wallet: overflow, plan, units: overflow !== 'wallet', ms: Date.now() - tStart, ttft }) : 0;
  await unlimit(env, lock);
  const fin = await usageStatus(env, u, plan);
  await send({ done: true, tok, mid, ...(charged > 0 ? { cost: charged } : {}), rounds: round_, ctx: { used: ctxUsed, max: ctxMax(model) }, ...fin });
  for (const lv of [100, 80]) if (J.pw0 < lv && fin.pctWeek >= lv) { // ข้ามเส้น 80% / 100% ของลิมิตสัปดาห์: อีเมลครั้งเดียวตอนข้าม
    await mail(env, u.email, `AstraCode: ใช้ลิมิตสัปดาห์ไป ${lv}% แล้ว`, mailBox(`ใช้ลิมิตสัปดาห์ไป ${lv}% แล้ว`, lv === 100 ? 'ลิมิตของแพลนเต็มแล้ว อัปเกรดแพลนหรือเติม Wallet เพื่อใช้ต่อได้ทันที' : 'ใกล้เต็มแล้ว ถ้าใช้ต่อเนื่องแนะนำอัปเกรดแพลนเพื่อไม่ให้งานสะดุด', 'ดูแพลน', siteUrl(env) + '/plans')).catch(() => {});
    break;
  }
  if (cid && (out || think) && u.auto_compact !== 0) { // ย่อแชตอัตโนมัติหลังตอบเสร็จ: context ใช้ถึง compact_pct % ของหน้าต่างโมเดล (ค่าเริ่มต้น 75 · 0 = ปิดทั้งระบบ) หรือแชตยาวเกินเกณฑ์ตัวอักษร
    const pctSet = await getSetting(env, 'compact_pct'), pctLim = pctSet === '' ? 75 : +pctSet, full = pctLim > 0 && ctxUsed >= ctxMax(model) * pctLim / 100;
    const did = await compact(env, u, cid, false, full).catch(e => { console.log('compact', e.message); return false; }); // ไม่ทำให้ผู้ใช้รอ: สตรีมปิดหลังงานนี้เสร็จ
    if (did) await send({ compacted: true, why: full ? 'context ใกล้เต็ม' : 'แชตยาว' });
  }
}

// ---------- ลดต้นทุน: เลือกโมเดลอัตโนมัติ + ย่อแชตยาว ----------
export const HARD_RE = /```|\b(debug|bug|error|refactor|algorithm|optimi[sz]e|architecture|prove|proof|regex|sql|typescript|python|javascript|react)\b|โค้ด|เขียนโปรแกรม|แก้บั๊ก|วิเคราะห์|พิสูจน์|คำนวณ|สมการ|ออกแบบระบบ|เปรียบเทียบ|กลยุทธ์|แผนธุรกิจ|เรียงความ|รายงาน/i;
// shortcut: แยกง่าย/ยากด้วยกฎ (ไม่เสีย token เพิ่ม) ถ้าอยากแม่นขึ้นค่อยให้โมเดลเล็กช่วยจัดประเภท
export async function autoModel(env, plan, u, { text, images, files, effort, regenerate }) {
  const all = (await allowedModels(env, plan.id)).filter(m => m.provider !== 'image' && m.provider !== 'embedding'); if (!all.length) return null; // โมเดลสร้างรูปไม่ใช่ตัวเลือกของ Auto
  const ok = [], healthy = [];
  for (const m of all) if (!(await capHit(env, u, plan, m))) { ok.push(m); if (!await modelDown(env, m.id)) healthy.push(m); }
  const ms1 = healthy.length ? healthy : ok.length ? ok : all; // เลือกจากตัวที่ปกติก่อน (ข้ามโมเดลที่ล่มอยู่) ถ้าไม่เหลือใช้ตัวที่เหลือ · ติดเพดานหมดใช้ all เพื่อแจ้ง 429 ตามปกติ
  // โมเดลที่ผู้ใช้กด 👎 มากกว่า 👍 ชัดเจนใน 30 วัน (อย่างน้อย 10 โหวต พอใจต่ำกว่า 40%) ถูกข้าม ถ้ายังมีตัวอื่นให้เลือก
  const votes = await env.DB.prepare('SELECT model_id, SUM(vote>0) up, SUM(vote<0) down FROM feedback WHERE created_at>? GROUP BY model_id').bind(Date.now() - 30 * 864e5).all().then(r => r.results).catch(() => []);
  const disliked = new Set(votes.filter(v => v.up + v.down >= 10 && v.up / (v.up + v.down) < 0.4).map(v => v.model_id)), liked = ms0 => { const g = ms0.filter(m => !disliked.has(m.id)); return g.length ? g : ms0; };
  const s = await getSettings(env, ['auto_cheap_model', 'auto_strong_model']), by = (a, b) => a.multiplier - b.multiplier;
  const ms = liked(ms1);
  const cheap = ms.find(m => m.id === +s.auto_cheap_model) || [...ms].sort(by)[0];
  const strong = ms.find(m => m.id === +s.auto_strong_model) || [...ms].sort(by).at(-1);
  let m = regenerate || images.length || files.length || ['high', 'xhigh', 'max'].includes(effort) || text.length > 1200 || HARD_RE.test(text) ? strong : cheap;
  if (images.length && !m.vision) m = ms.find(x => x.vision) || m;
  return m.id;
}
export const COMPACT_CHARS = 30000, COMPACT_KEEP = 6;
export async function compact(env, u, cid, force = false, byCtx = false) { // byCtx = context ใกล้เต็ม: ไม่ต้องรอถึงเกณฑ์ตัวอักษร // force = ผู้ใช้กด "ย่อแชต" เอง (ไม่ต้องรอให้ยาวถึงเกณฑ์)
  const c = await env.DB.prepare('SELECT summary,summary_upto FROM chats WHERE id=?').bind(cid).first();
  const rows = (await env.DB.prepare('SELECT id,role,content FROM messages WHERE chat_id=? AND id>? ORDER BY id').bind(cid, c?.summary_upto || 0).all()).results.map(r => ({ ...r, content: String(r.content || '').replace(/\u2063/g, '') }));
  if (rows.length <= (force ? 2 : COMPACT_KEEP + 2) || (!force && !byCtx && rows.reduce((a, r) => a + r.content.length, 0) < COMPACT_CHARS)) return false;
  const old = rows.slice(0, force ? -2 : -COMPACT_KEEP);
  const want = +(await getSetting(env, 'summary_model'));
  const m = (await env.DB.prepare('SELECT * FROM models WHERE active=1 ORDER BY cost_in+cost_out').all()).results.filter(x => env[x.key_name]).find(x => !want || x.id === want);
  if (!m) return false;
  const body = (c?.summary ? `Earlier summary:\n${c.summary}\n\n` : '') + old.map(r => `${r.role === 'user' ? 'User' : 'Assistant'}: ${r.content.slice(0, 6000)}`).join('\n\n');
  let summary = '', usage = null;
  for await (const e of callModel(env, m, [{ role: 'user', content: body.slice(-80000) }], { effort: null, maxTokens: 1500,
    system: 'Summarize this conversation so an assistant can continue it. Keep: the user\'s goals and preferences, decisions made, facts, names, numbers, file names, code identifiers and unfinished tasks. Drop small talk and long code (say what it does). Write in the same language as the conversation, at most 350 words, as bullet points.' })) { if (e.t) summary += e.t; if (e.usage) usage = e.usage; }
  if (usage) await logUsage(env, u.id, m, usage, { units: false }); // ต้นทุนของเรา ไม่หักลิมิตผู้ใช้
  if (summary.trim()) await env.DB.prepare('UPDATE chats SET summary=?, summary_upto=? WHERE id=?').bind(summary.trim().slice(0, 6000), old.at(-1).id, cid).run();
  return !!summary.trim();
}


// ---------- Remote MCP (Streamable HTTP / JSON-RPC 2.0) ----------
export function isSafeMcpUrl(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]') return null;
  if (h === 'localhost.' || h.endsWith('.localhost') || h.endsWith('.localdomain') || h.endsWith('.intranet') || h.endsWith('.lan')) return null;
  if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|192\.0\.0\.|2[2-5]\d\.)/.test(h)) return null; // รวม CGNAT, benchmark, multicast/สงวน
  // shortcut: ตรวจแค่ชื่อโฮสต์ ไม่ได้ resolve DNS (กัน DNS rebinding ไม่ได้) · Workers เชื่อมต่อช่วง IP ภายในไม่ได้อยู่แล้ว ถ้าจะเข้มขึ้นให้ตรวจผล DoH ก่อนเรียก
  if (/^\d+$/.test(h) || h.includes(':')) return null;
  return u.href;
}
export async function mcpRpc(url, token, method, params = {}, sessionId = null, notifyOnly = false) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'AstraCode-MCP/1.0' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const id = notifyOnly ? undefined : Math.floor(Math.random() * 1e9);
  const body = notifyOnly ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const sid = r.headers.get('mcp-session-id') || sessionId;
  if (notifyOnly) return { data: null, sessionId: sid };
  if (!r.ok) throw userErr(`MCP ตอบกลับ HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 150)}`, 502);
  const ct = r.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('text/event-stream')) {
    const txt = await r.text();
    for (const line of txt.split('\n')) {
      const l = line.trim();
      if (l.startsWith('data:')) {
        try { const o = JSON.parse(l.slice(5).trim()); if (o && (o.id === id || o.result !== undefined || o.error)) data = o; } catch {}
      }
    }
  } else {
    data = await r.json().catch(() => null);
  }
  if (!data) throw userErr('MCP ไม่ได้ส่งข้อมูล JSON-RPC กลับมา', 502);
  if (data.error) throw userErr('MCP error: ' + (data.error.message || JSON.stringify(data.error)).slice(0, 200), 502);
  return { data: data.result, sessionId: sid };
}
export async function mcpSync(url, token) {
  const init = await mcpRpc(url, token, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AstraCode', version: '1.0.0' } });
  await mcpRpc(url, token, 'notifications/initialized', {}, init.sessionId, true).catch(() => {});
  const res = await mcpRpc(url, token, 'tools/list', {}, init.sessionId);
  const tools = (res.data?.tools || []).slice(0, 30).map(t => ({
    name: String(t.name || '').slice(0, 60),
    description: String(t.description || '').slice(0, 300),
    inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
  })).filter(t => t.name);
  return tools;
}
export async function mcpCall(url, token, name, args) {
  const init = await mcpRpc(url, token, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AstraCode', version: '1.0.0' } });
  await mcpRpc(url, token, 'notifications/initialized', {}, init.sessionId, true).catch(() => {});
  const res = await mcpRpc(url, token, 'tools/call', { name, arguments: args || {} }, init.sessionId);
  const c = res.data?.content;
  const txt = Array.isArray(c) ? c.map(x => x?.type === 'text' ? x.text : JSON.stringify(x)).join('\n') : JSON.stringify(res.data ?? '');
  return String(txt || '(ไม่มีผลลัพธ์)').slice(0, 12000);
}

// ---------- โหมด Code: เครื่องมืออ่าน/ค้นไฟล์ (แบบข้อความ ใช้ได้กับทุกโมเดล) ----------
export const AGENT_ROUNDS = 20, AGENT_IN_MAX = 1.2e6; // โหมด Agent ในหน้า Code (แพลนชำระเงิน)
export const TOOL_ROUNDS = 6, READ_MAX = 100e3, ANSWER_IN_MAX = 400e3; // ANSWER_IN_MAX = input token รวมทุกรอบของคำตอบเดียว
// หน้า Code แนบเนื้อหาไฟล์ที่เปิดอยู่และข้อความที่เลือกท้ายข้อความ ([เนื้อหาไฟล์ที่เปิดอยู่] … ถึงท้ายสุด)
export const stripOpenFile = t => String(t || '').replace(/\n\n\[(?:เนื้อหาไฟล์ที่เปิดอยู่|เนื้อหาไฟล์ในโปรเจกต์)\][\s\S]*$/, '');
// โมเดลบางตัวเขียนคำสั่งติดกับข้อความ (เช่น "...ครับREAD path=a.js" หรือ "READ path=a.jsกำลังอ่าน...") → แยกบรรทัด และอ่านพาธเฉพาะตัวอักษรที่เป็นพาธ ไม่เอาข้อความไทยที่ติดมา (เดิมทำให้หาไฟล์ไม่พบแล้วโมเดลสั่งอ่านซ้ำวน)
export const toolReqs = text => [...text.replace(/```[\s\S]*?```/g, '').replace(/(\S)(READ path=)/g, '$1\n$2').matchAll(/^\s*(READ|GREP|LIST)\b[ \t]*(?:path=)?(.*)$/gm)].map(m => {
  let arg = m[2].trim().replace(/^`|`$/g, '');
  if (m[1] !== 'GREP') arg = arg.match(/^[`'"]?([\w./@~-]*)/)?.[1] ?? arg;
  return { op: m[1], arg };
}).slice(0, 12);
// สรุปสิ่งที่ AI กำลังทำในรอบนี้ ให้หน้าเว็บโชว์ระหว่างรอ (เช่น "อ่าน a.js, b.js")
export const doingOf = reqs => ['READ', 'GREP', 'LIST'].map(op => [op, reqs.filter(r => r.op === op).map(r => r.arg).filter(Boolean)]).filter(([, a]) => a.length)
  .map(([op, a]) => `${{ READ: 'อ่าน', GREP: 'ค้นหา', LIST: 'ดูโฟลเดอร์' }[op]} ${a.slice(0, 3).join(', ')}${a.length > 3 ? ` +${a.length - 3}` : ''}`).join(' · ').slice(0, 120);
export async function runTools(env, pid, reqs) {
  const files = (await env.DB.prepare('SELECT path,content FROM project_files WHERE project_id=? ORDER BY path').bind(pid).all()).results;
  const out = []; let budget = 200e3;
  for (const { op, arg } of reqs) {
    if (op === 'LIST') { out.push(`[LIST]\n${files.filter(f => f.path.startsWith(arg)).map(f => `${f.path} (${f.content.startsWith('data:image/') ? 'image ~' + Math.round(f.content.length / 1365) + 'KB' : f.content.length + ' chars'})`).join('\n') || '(ว่าง)'}`); continue; }
    if (op === 'READ') {
      const f = files.find(x => x.path === arg);
      if (!f) { out.push(`[READ ${arg}]\n(ไม่พบไฟล์นี้)`); continue; }
      if (f.content.startsWith('data:image/')) { out.push(`[READ ${arg}]\n(ไฟล์รูปภาพ ~${Math.round(f.content.length / 1365)}KB อ่านเป็นข้อความไม่ได้ · ใช้ใน HTML ด้วย <img src="${arg}"> หรือใน CSS ด้วย url(${arg}))`); continue; }
      const c = f.content.slice(0, Math.min(READ_MAX, budget)); budget -= c.length;
      out.push(`[READ ${arg}]\n${c}${c.length < f.content.length ? '\n…(ตัดเหลือ ' + c.length + ' ตัวอักษรแรก)' : ''}`); continue;
    }
    // shortcut: ไม่มี timeout ให้ regex ใน Worker จึงกันแบบ backtracking ซ้อน ((a+)+ ฯลฯ) และรูปแบบยาวเกินด้วยการค้นข้อความตรงๆ แทน; ถ้าต้องการเข้มกว่านี้ให้ใช้ RE2
    const risky = arg.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(arg);
    let re; try { if (risky) throw 0; re = new RegExp(arg, 'i'); } catch { re = { test: l => l.toLowerCase().includes(arg.toLowerCase()) }; }
    const hits = [];
    for (const f of files) { if (f.content.startsWith('data:image/')) continue; const L = f.content.split('\n'); for (let i = 0; i < L.length && hits.length < 200; i++) if (L[i].length < 2000 && re.test(L[i])) hits.push(`${f.path}:${i + 1}: ${L[i].trim().slice(0, 200)}`); }
    out.push(`[GREP ${arg}]\n${hits.join('\n') || '(ไม่พบ)'}`);
  }
  return out.join('\n\n') + '\n\n[ผลจากเครื่องมือ] ทำงานต่อจากเดิม ถ้าต้องอ่านเพิ่มก็สั่งได้อีก ถ้าพร้อมแล้วให้แก้ไฟล์ด้วยบล็อก path= ได้เลย';
}
