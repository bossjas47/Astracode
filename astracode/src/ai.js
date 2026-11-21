import { artPaid, artifactTool } from './artifacts.js';
import { FREE_CTX, FREE_DAY_CAP, isFreeModel, DAY, HISTORY, HISTORY_CODE, LOCK_MS, projectFor, reqCapHit, ctxMax, fitContext, flat, SYSTEM, SYSTEM_CODE, allowedModels, capHit, err, json, limMult, limited, planOf, rand, same, touchWindows, unlimit, usageStatus, userErr, WALLET_MIN } from './core.js';
import { blockedText, dayCapHit, event, getSetting, getSettings, mail, mailBox, notify, priceOf, siteUrl, walletAdd } from './billing.js';
import { b64, projects, unb64, unseal } from './projects.js';
import { CHAT_TOOL_NAMES, CODE_TOOLS, CODE_TOOLS_NOTE, CODE_TOOL_NAMES, FILE_EXT, PLAN_NOTE, WEB_TOOL_NAMES, WRITE_TOOLS, chatTools, codeTool, codeWorkspace, dlMarker, nativeTools, pyMarker, stripMarkers, todosOf, verifyWork, webTools } from './codetools.js';
import { GOOGLE_TOOLS, GOOGLE_URL, googleCall } from './google.js';
import { askApproval, connCall, connTools } from './connectors.js';
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
// ผู้ให้บริการล่ม/คนแน่นชั่วคราว (429/5xx ก่อนเริ่มตอบ): ลองใหม่เอง 2 ครั้ง รอ 1.5 และ 4 วินาที ไม่ให้ลูกค้าเห็น "ตอบไม่ได้" ทันที
// ผู้ให้บริการคนเยอะ/ล่มชั่วคราว: ลองใหม่เอง 3 ครั้ง (ใช้เวลาจาก retry-after ถ้าบอกมา แต่ไม่เกิน 10 วินาที) ก่อนแจ้งผู้ใช้
export async function busyRetry(post, waits = [1500, 4000, 8000]) {
  let res = await post();
  for (const w of waits) { if (![429, 500, 502, 503, 504, 529].includes(res.status)) break; const ra = +res.headers?.get?.('retry-after'); await res.body?.cancel().catch(() => {}); await new Promise(ok => setTimeout(ok, ra > 0 ? Math.min(ra * 1000, 10000) : w)); res = await post(); }
  return res;
}
export const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export function nearEffort(errText, cur) {
  const after = String(errText).split(/reasoning effort/i)[1]?.split(/\buse\b/i)[1]; if (!after || !cur) return null;
  const ok = [...after.matchAll(/\b(none|minimal|low|medium|high|xhigh|max)\b/gi)].map(x => x[1].toLowerCase()), ci = EFFORT_ORDER.indexOf(String(cur).toLowerCase());
  if (!ok.length || ci < 0) return null;
  return ok.sort((a, b) => Math.abs(EFFORT_ORDER.indexOf(a) - ci) - Math.abs(EFFORT_ORDER.indexOf(b) - ci) || EFFORT_ORDER.indexOf(b) - EFFORT_ORDER.indexOf(a))[0];
}
// เพดาน output ตามค่ายของโมเดล (ไม่ส่ง = ผู้ให้บริการบางรายใช้ค่าน้อยจนคิดหมดก่อนตอบ) · ค่ายที่ไม่รู้เพดานไม่ส่ง เพราะค่าเกินอาจถูกปฏิเสธ
export const gptMax = m => { const a = m.api_model || ''; return /^(gpt|o\d|gemini)/i.test(a) ? 256000 : /^deepseek/i.test(a) ? 356000 : undefined; };
const capOut = (m, want) => { const cap = gptMax(m); return want && cap ? Math.min(want, cap) : want || cap; }; // ลูกค้า API ขอเกินเพดาน: ลดให้ ไม่ปล่อยให้ผู้ให้บริการปฏิเสธ
export async function* callModel(env, m, msgs, { effort, images = [], system = SYSTEM, maxTokens, tools, toolChoice, userId, signal, extra = {}, imageOpts = {}, api = false, cacheTtl = null } = {}) {
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
    // แชตเว็บ: cache 1 ชม. (คนพิมพ์ห่างเกิน 5 นาทีบ่อย → cache 5 นาทีหมดก่อนข้อความถัดไป) · Agent/API ยิงถี่ใช้ 5 นาทีที่เขียนถูกกว่า
    let cc = cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    const last = messages.at(-1); // cache ทั้งบทสนทนาถึงข้อความล่าสุด
    if (last) {
      const baseParts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }];
      const imgParts = images.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1) } }));
      last.content = [...imgParts, ...baseParts];
      if (last.content.length) last.content[last.content.length - 1] = { ...last.content.at(-1), cache_control: cc };
    }
    const body = { model: m.api_model, max_tokens: Math.min(maxTokens || 128000, 128000), stream: true, messages }; // เพดาน output ของ Claude ทุกรุ่น · ค่าน้อยกว่านี้โมเดลคิดจนหมดก่อนได้ตอบ (คิดเงินตามที่ใช้จริง ไม่ใช่ตามเพดาน)
    if (system) body.system = [{ type: 'text', text: system, cache_control: cc }];
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
    const postA = () => fetch(m.base_url + '/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    let res = await busyRetry(postA);
    if (res.status === 400 && cc.ttl) { const t = await res.text(); if (!/ttl|cache_control/i.test(t)) throw new Error(`upstream 400: ${t.slice(0, 300)}`); cc = { type: 'ephemeral' }; const strip = x => { if (Array.isArray(x)) x.forEach(strip); else if (x && typeof x === 'object') { if (x.cache_control) x.cache_control = cc; Object.values(x).forEach(strip); } }; strip(body); res = await postA(); } // ผู้ให้บริการไม่รองรับ ttl: ใช้ 5 นาที
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const u = { fresh: 0, read: 0, write: 0, out: 0 };
    for await (const e of sse(res)) {
      if (e.type === 'message_start') { const x = e.message.usage; u.fresh = x.input_tokens || 0; u.read = x.cache_read_input_tokens || 0; u.write = Math.round((x.cache_creation_input_tokens || 0) * (cc.ttl ? 1.6 : 1)); } // เขียน cache 1 ชม. แพงกว่า 5 นาที (2× เทียบ 1.25× ของราคา input) → คิดเป็นจำนวนเทียบเท่าตามราคาเขียน cache ที่ตั้งไว้
      else if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') yield { tc_start: { index: e.index, id: e.content_block.id, name: e.content_block.name } };
      else if (e.type === 'content_block_delta' && e.delta?.text) yield { t: e.delta.text };
      else if (e.type === 'content_block_delta' && e.delta?.thinking) yield { th: e.delta.thinking }; // เหตุผลที่ Claude คิด
      else if (e.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') yield { tc_delta: { index: e.index, args: e.delta.partial_json || '' } };
      else if (e.type === 'message_delta') {
        if (e.usage) u.out = e.usage.output_tokens || 0;
        if (e.delta?.stop_reason) yield { stop_reason: { tool_use: 'tool_calls', max_tokens: 'length' }[e.delta.stop_reason] || 'stop' };
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
    if (res.status === 400 && imageOpts.size && imageOpts.size !== '1024x1024') { imageOpts = { ...imageOpts, size: '1024x1024' }; res = await call({}); } // ไม่รับขนาดที่เลือก: ใช้จัตุรัส
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`upstream ${res.status}: ${JSON.stringify(d.error || d).slice(0, 300)}`);
    const item = d.data?.[0]; let src;
    if (item?.b64_json) {
      const mime = item.b64_json.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
      if (userId && item.b64_json.length > 300e3) src = await putImage(env, userId, mime, item.b64_json); // ใหญ่: เก็บเป็นไฟล์ในฐานข้อมูล ข้อความในแชตเป็นแค่ลิงก์
      else if (!api && item.b64_json.length > 1.8e6) throw new Error('รูปที่ได้ใหญ่เกินจะบันทึก ลองใช้ขนาดที่เล็กลง');
      else src = `data:${mime};base64,` + item.b64_json;
    } else if (item?.url) { // ลิงก์รูปของผู้ให้บริการ: ดึงมาเก็บเอง ไม่ให้ลูกค้าเห็นโดเมนต้นทาง (และลิงก์ต้นทางมักหมดอายุ)
      const ir = userId && await fetch(item.url, { signal: AbortSignal.timeout(30e3) }).catch(() => null), ct = ir?.headers.get('content-type') || '';
      src = ir?.ok && ct.startsWith('image/') ? await putImage(env, userId, ct.split(';')[0], b64(await ir.arrayBuffer())) : item.url;
    } else throw new Error('ไม่ได้รูปกลับมา');
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
    const mt = capOut(m, maxTokens); if (mt) body.max_output_tokens = mt;
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
    const mt = capOut(m, maxTokens); if (mt) body[/api\.openai\.com/.test(m.base_url) ? 'max_completion_tokens' : 'max_tokens'] = mt; // OpenAI รุ่นคิด (GPT-5, o-series) ไม่รับ max_tokens
    if (m.effort === 'openai' && effort) body.reasoning_effort = { on: 'medium', max: 'high', minimal: 'low' }[effort] || effort; // GPT รุ่นใหม่ไม่มี minimal
    if (m.effort === 'openai' && userId) body.prompt_cache_key = 'astra-' + userId; // ให้คำขอของผู้ใช้คนเดิมไปเครื่องที่มี cache อยู่
    if (m.effort === 'gemini') body.reasoning_effort = effort ? ({ xhigh: 'high', max: 'high', on: 'medium' }[effort] || effort) : 'none';
    if (m.effort === 'deepseek') { // DeepSeek เปิดคิดเป็นค่าเริ่มต้น จึงต้องปิดเองเมื่อเลือก Instant
      body.thinking = { type: effort ? 'enabled' : 'disabled' };
      if (effort) body.reasoning_effort = { on: 'medium', xhigh: 'max', minimal: 'low' }[effort] || effort;
    }
    if (m.effort === 'kimi') body.thinking = { type: effort ? 'enabled' : 'disabled' }; // Kimi K2.5+: เปิด/ปิดคิดอย่างเดียว ไม่มีระดับ
    const thinking = body.reasoning_effort || body.thinking?.type === 'enabled'; // โหมดคิดไม่รับพารามิเตอร์สุ่ม
    for (const k of ['seed', 'response_format', ...(thinking ? [] : ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'stop'])]) if (extra[k] !== undefined) body[k] = extra[k];
    const post = () => fetch(m.base_url + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
    let res = await busyRetry(post);
    if (res.status === 400 && body.prompt_cache_key) { const t = await res.clone().text(); if (/prompt_cache_key/i.test(t)) { delete body.prompt_cache_key; res = await post(); } } // ตัวกลางบางรายไม่รู้จักช่องนี้
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
    const rawTail = []; // ข้อมูลดิบ 3 ก้อนท้าย: คำตอบว่างจะได้ดูว่าผู้ให้บริการส่งอะไรมาจริง
    for await (const e of sse(res)) {
      rawTail.push(JSON.stringify(e).slice(0, 300)); if (rawTail.length > 3) rawTail.shift();
      if (e.error) throw new Error('ผู้ให้บริการแจ้ง error กลางคำตอบ: ' + String(e.error.message || e.error.type || JSON.stringify(e.error)).slice(0, 200)); // ไม่งั้นนับเป็นคำตอบว่างและคิดเงิน
      const ch = e.choices?.[0], dl = ch?.delta;
      const th = dl?.reasoning_content || dl?.reasoning || dl?.thought || dl?.thinking || (Array.isArray(dl?.reasoning_details) ? dl.reasoning_details.map(x => x?.text || '').join('') : '');
      if (typeof th === 'string' && th) yield { th };
      const t = dl?.content || dl?.refusal; // refusal = ข้อความปฏิเสธของโมเดล OpenAI (มาแยกช่องจาก content) ต้องโชว์ ไม่งั้นผู้ใช้เห็นคำตอบว่าง
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
    yield { raw: rawTail.join(' | ') };
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
      if (usage) await logUsage(env, u.id, m, usage, { units: false, src: 'system' });
      const qs = outT.split('\n').map(x => x.replace(/^[\s\d.)\-*"']+|["']+$/g, '').trim()).filter(x => x.length > 2 && x.length < 200).slice(0, 3);
      if (qs.length) queries = qs;
    }
  } catch { /* ใช้คำถามเดิม */ }
  const seen = new Set(), out = [];
  for (const list of await Promise.all(queries.map(q => webSearch(env, q)))) for (const r of list) if (!seen.has(r.url)) { seen.add(r.url); out.push(r); }
  return out.slice(0, 8);
}
// ไฟล์แนบที่ยาวมาก: ส่งเฉพาะท่อนที่เกี่ยวกับคำถาม (เทียบคำ/ชุดอักษร 3 ตัว) แทนการส่งทั้งไฟล์จนล้น context · ไฟล์สั้นส่งเต็ม
// แนบในข้อความ: รูป 20 · ไฟล์ 20 · รวม 1.8MB (เพดานจริงคือแถวในฐานข้อมูล D1 ~2MB) · ไฟล์ยาวไม่เกิน FILE_FULL ส่งเต็มให้โมเดล (ทุกโมเดล context 1.05M)
export const ATT_IMGS = 20, FILES_MAX = 20, ATT_BYTES = 1.8e6, FILE_FULL = 700000, FILE_CHUNK = 2000;
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
// ราคาขั้นที่ 2 เมื่อ context ยาว (เช่น GPT บน maxplus: input ตั้งแต่ 272K token ต่อคำขอ → ขาเข้า/cache ×2, ขาออก ×1.5)
// ตั้งต่อโมเดลในหลังบ้าน: long_k = เกณฑ์ (พัน token) · long_in = ตัวคูณขาเข้า+cache read/write · long_out = ตัวคูณขาออก
// usage.long = ส่วนของ token ที่อยู่ในคำขอที่ยาวเกินเกณฑ์ (แชตที่ใช้เครื่องมือหลายรอบรวม usage ไว้ จึงต้องแยกรายรอบก่อนรวม)
export const isLong = (m, u) => m?.long_k > 0 && u.fresh + u.read + u.write >= m.long_k * 1000;
export const longPart = (m, u) => u.long !== undefined ? u.long : isLong(m, u) ? u : null;
export const longExtra = (m, L, r) => { // r = ราคา/ต้นทุนฐานต่อ 1M token {in, cache, write, out} · คืนส่วนที่ต้องจ่ายเพิ่ม (หน่วยเดียวกับ r)
  if (!L) return 0; const li = m.long_in > 0 ? m.long_in : 2, lo = m.long_out > 0 ? m.long_out : 1.5;
  return ((L.fresh * r.in + L.read * r.cache + L.write * r.write) * (li - 1) + L.out * r.out * (lo - 1)) / 1e6;
};
// บันทึกการใช้งาน + คิดเงิน wallet เมื่อจ่ายแบบตามใช้ (API / ลิมิตเต็มแล้วใช้ wallet)
export async function logUsage(env, uid, m, usage, { units = true, wallet = null, plan = null, job = null, ms = null, ttft = null, src = null, flag = null, pack = false, prep = null } = {}) {
  const L = flat(m) ? null : longPart(m, usage);
  const cost = flat(m) ? m.req_cost : (usage.fresh * m.cost_in + usage.read * m.cost_cache + usage.write * m.cost_cache_write + usage.out * m.cost_out) / 1e6 + longExtra(m, L, { in: m.cost_in, cache: m.cost_cache, write: m.cost_cache_write, out: m.cost_out }); // โมเดลคิดเหมาต่อ request: ต้นทุนคงที่ ไม่ขึ้นกับ token
  const un = units ? Math.max(cost * limMult(m), 1e-9) : 0; // หน่วยลิมิต = ต้นทุนจริง (บาท) × ตัวคูณโมเดล · 0 = ไม่หักลิมิตผู้ใช้
  usage._units = un; // ให้ /v1 บอกลูกค้าว่าคำขอนี้ใช้ลิมิตไปกี่ % (ไม่เปิดเผยต้นทุน)
  const pk = pack ? Math.max(cost * limMult(m), 1e-9) : null; usage._pack = pk; // แพ็ก Agent: หักจากโควตาแพ็ก (คอลัมน์ pack) ไม่ใช่ลิมิตแพลน
  const now = Date.now();
  if (units) await touchWindows(env, uid, now, plan); // เริ่มรอบก่อนบันทึก เพื่อให้แถวนี้นับอยู่ในรอบ
  let charge = 0;
  if (wallet) { const p = await priceOf(env, m); charge = Math.round((p.req > 0 ? p.req : (usage.fresh * p.in + usage.read * p.cache + usage.write * p.write + usage.out * p.out) / 1e6 + longExtra(m, L, p)) * 10000) / 10000; } // ราคาขาย context ยาวขึ้นตามสัดส่วนเดียวกับต้นทุน
  await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at,ms,ttft,src,charge,flag,pack,prep) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(uid, m.id, usage.fresh + usage.write, usage.out, usage.read, un, cost, now, ms, ttft || null, src || (job ? 'agent' : null), charge || null, flag || usage.flag || null, pk, prep).run(); // prep = ms ที่ระบบเตรียมก่อนเรียกโมเดล (แยกจาก ttft ของโมเดล)
  // ต้นทุน/token ต่องาน Agent · ctx_peak = input ของรอบที่ใหญ่สุด (ใช้แสดง context ของทีม)
  if (job) { const tin = usage.fresh + usage.read + usage.write; await env.DB.prepare('UPDATE agent_jobs SET cost=COALESCE(cost,0)+?, tin=COALESCE(tin,0)+?, tout=COALESCE(tout,0)+?, ctx_peak=MAX(COALESCE(ctx_peak,0),?) WHERE id=?').bind(cost, tin, usage.out, tin, job).run(); }
  if (charge > 0) await walletAdd(env, uid, -charge, wallet, m.name);
  if (cost >= 0.5) await costWatch(env, uid, m, now).catch(() => {});
  return charge; // ยอดที่ตัดจาก wallet (0 ถ้าไม่ได้ตัด)
}
// เตือนแอดมินทันที (ไม่รอ cron) เมื่อคำขอแพงทำให้ต้นทุน 1 ชม. ล่าสุดของผู้ใช้คนนี้ หรือของทั้งระบบ เกินที่ตั้งไว้ · แจ้งซ้ำได้ชั่วโมงละครั้ง
export async function costWatch(env, uid, m, now = Date.now()) {
  const s = await getSettings(env, ['alert_user_hour', 'alert_hour_cost']), userLim = s.alert_user_hour === '' || s.alert_user_hour == null ? 15 : +s.alert_user_hour, allLim = s.alert_hour_cost === '' || s.alert_hour_cost == null ? 50 : +s.alert_hour_cost;
  const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN user_id=?1 THEN cost END),0) mine, COALESCE(SUM(cost),0) total, (SELECT email FROM users WHERE id=?1) email, (SELECT role FROM users WHERE id=?1) role FROM usage WHERE created_at>=?2").bind(uid, now - 3600e3).first();
  if (userLim > 0 && r.mine >= userLim && r.role !== 'admin' && !await limited(env, 'cw:u:' + uid, 1, 3600e3)) await notify(env, `🚨 ${r.email} ใช้ต้นทุน ฿${r.mine.toFixed(2)} ใน 1 ชม. ล่าสุด (ล่าสุด: ${m.name}) · หลังบ้าน → ต้นทุนสด`);
  if (allLim > 0 && r.total >= allLim && !await limited(env, 'cw:all', 1, 3600e3)) await notify(env, `🚨 ต้นทุนรวมทั้งระบบ ฿${r.total.toFixed(2)} ใน 1 ชม. ล่าสุด · หลังบ้าน → ต้นทุนสด`);
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
  const images = Array.isArray(b.images) && !b.regenerate ? b.images.slice(0, ATT_IMGS) : [];
  if (images.some(d => typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d) || d.length > 2e6)) return err('รูปต้องเป็น jpeg/png/webp ไม่เกิน 1.5MB');
  const files = Array.isArray(b.files) && !b.regenerate ? b.files : [];
  if (files.length > FILES_MAX || files.some(f => typeof f?.name !== 'string' || typeof f?.text !== 'string' || f.name.length > 120)) return err('ไฟล์แนบไม่ถูกต้อง (สูงสุด 5 ไฟล์)');
  if (new TextEncoder().encode(files.map(f => f.text).join('')).length > ATT_BYTES) return err('ไฟล์รวมกันใหญ่เกิน 1.8MB ต่อข้อความ ลองแบ่งส่ง หรืออัปโหลดเข้าโปรเจกต์ใน Code');
  let text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 20000) return err('ข้อความยาวเกิน 20,000 ตัวอักษร');
  if (!b.regenerate && !text && !images.length && !files.length) return err('ข้อความว่าง');
  if (!text) text = files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้';
  const effort = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(b.effort) ? b.effort : null;
  const ephemeral = !!b.ephemeral; // โหมดเทียบโมเดล: ไม่บันทึกแชต
  // ลำดับรอฐานข้อมูลก่อนเริ่มตอบ (เดิมรอทีละคำสั่ง ~15 รอบ): 1) แพลน + โมเดล 2) ตรวจสิทธิ์/เพดาน/ลิมิต/ล็อก/โปรเจกต์/แชตพร้อมกัน 3) บันทึก+อ่านประวัติใน batch เดียว
  const autoPick = b.model_id === 'auto', modelQ = id => env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(id).first();
  const [plan, mPre] = await Promise.all([planOf(env, u), autoPick ? null : modelQ(b.model_id)]);
  if (autoPick) b.model_id = await autoModel(env, plan, u, { text, images, files, effort, regenerate: b.regenerate });
  const mRow = autoPick ? await modelQ(b.model_id) : mPre;
  const pid = b.project_id || null; // โหมด Code
  let cid = ephemeral ? null : b.chat_id;
  const takeLock = k => env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(k, Date.now() + LOCK_MS, Date.now()).first().then(r => r ? k : null);
  // ให้ตอบได้ทีละข้อความ กันยิงพร้อมกันหลายอันเพื่อเลี่ยงลิมิต (ล็อกหมดอายุเอง) · จองพร้อมกับการตรวจอื่น แล้วคืนล็อกทุกทางออกที่ไม่ได้ตอบ
  const [inPlan, capped, reqCapped, blocked, st, dayCapped, tooFast, lock0, projOk, chatOk] = await Promise.all([
    mRow ? env.DB.prepare('SELECT 1 FROM plan_models WHERE plan_id=? AND model_id=?').bind(plan.id, mRow.id).first() : null,
    mRow ? capHit(env, u, plan, mRow) : false, mRow ? reqCapHit(env, u, mRow) : false, blockedText(env, text), usageStatus(env, u, plan),
    u.balance >= WALLET_MIN ? dayCapHit(env, u.id) : false, limited(env, 'chatmin:' + u.id, 20, 60e3),
    mRow && !ephemeral ? takeLock('chatlock:' + u.id) : null,
    !pid || projectFor(env, pid, u.id), !cid || env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(cid, u.id).first()]);
  let lock = lock0;
  const bail = async r => { if (lock) await unlimit(env, lock); return r; }; // ทางออกก่อนเริ่มตอบต้องคืนล็อกเสมอ
  // โมเดลนอกแพลน: จ่ายจาก Wallet ตามราคาขาย ไม่หักลิมิตแพลน (ต้องเป็นโมเดลสาธารณะ ไม่ใช่ embedding)
  let m = mRow, offPlan = false;
  if (m && !inPlan) { if (u.balance >= WALLET_MIN && m.public && m.provider !== 'embedding') offPlan = true; else m = null; }
  if (!m) return bail(err(u.balance >= WALLET_MIN ? 'ใช้โมเดลนี้ไม่ได้' : 'แพลนของคุณใช้โมเดลนี้ไม่ได้ · เติม Wallet เพื่อใช้ทุกโมเดลตามราคาขาย', 403));
  if (images.length && !m.vision) return bail(err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น'));
  if (capped && !offPlan) return bail(json({ error: `${m.name} ใช้ถึงเพดานรายสัปดาห์แล้ว ลองโมเดลอื่นได้เลย`, cap: true }, 429));
  if (reqCapped) return bail(json({ error: `${m.name} ใช้ครบ ${m.req_cap} ครั้งใน 4 ชั่วโมงแล้ว ลองโมเดลอื่นหรือรอสักครู่`, cap: true }, 429));
  if (blocked) return bail(err('ข้อความนี้มีเนื้อหาที่ระบบไม่รับ'));
  const pw0 = st.pctWeek;
  const freeM = !offPlan && !ephemeral && isFreeModel(plan, m.id); // โมเดลฟรีไม่จำกัดของแพลน: ลิมิตเต็มก็ยังใช้ได้ ไม่หักลิมิต
  if (freeM && (await env.DB.prepare('SELECT COUNT(*) n FROM usage WHERE user_id=? AND model_id=? AND created_at>?').bind(u.id, m.id, Date.now() - DAY).first()).n >= FREE_DAY_CAP) return bail(json({ error: `${m.name} ใช้ฟรีครบ ${FREE_DAY_CAP} ข้อความใน 24 ชม. แล้ว (การใช้งานปกติ) ลองโมเดลอื่นได้เลย`, cap: true }, 429));
  // ลิมิตเต็ม: ใช้เงินใน wallet ต่อได้ ถ้าผู้ใช้เปิดไว้
  const overflow = offPlan ? 'wallet' : freeM ? null : (st.pct4h >= 100 || st.pctWeek >= 100) ? (u.wallet_overflow && u.balance >= WALLET_MIN && !ephemeral ? 'overflow' : null) : null;
  if (!offPlan && !freeM && (st.pct4h >= 100 || st.pctWeek >= 100) && !overflow) return bail(json({ error: 'ลิมิตเต็มแล้ว', ...st, wallet: u.balance }, 429));
  if (overflow && dayCapped) return bail(err('ใช้ Wallet ครบเพดานต่อวันที่ตั้งไว้แล้ว ปรับได้ที่หน้าบัญชี', 429));
  if (tooFast) return bail(err('ส่งเร็วเกินไป รอสักครู่', 429));
  if (ephemeral) for (const k of [0, 1, 2].map(i => 'chatlock:' + u.id + ':e' + i)) if ((lock = await takeLock(k))) break; // โหมดเทียบขนานได้สูงสุด 3 ช่อง
  if (!lock) return err('กำลังตอบข้อความก่อนหน้าอยู่', 429);
  const fail = async (...a) => { await unlimit(env, lock); return err(...a); };
  if (!projOk) return fail('ไม่พบโปรเจกต์', 404);
  if (!chatOk) return fail('ไม่พบแชต', 404);
  try {

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
    }
    const hmax = pid ? HISTORY_CODE : HISTORY, write = !b.edit_id && !b.regenerate;
    const rowQ = where => env.DB.prepare(`SELECT c.id,c.summary,c.summary_upto,c.instructions,f.instructions fins,f.files fdocs FROM chats c LEFT JOIN folders f ON f.id=c.folder_id WHERE ${where}`);
    if (!cid) { // แชตใหม่: สร้างแชต + บันทึกข้อความแรก + อ่านข้อมูลโฟลเดอร์ ใน batch เดียว · ประวัติ = ข้อความนี้ข้อความเดียว
      const newest = '(SELECT MAX(id) FROM chats WHERE user_id=?)'; // ล็อกตอบทีละข้อความ: แชตล่าสุดของผู้ใช้ = แชตที่เพิ่งสร้างในทรานแซกชันนี้
      const got = await env.DB.batch([
        env.DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id,folder_id) VALUES (?,?,?,?,(SELECT id FROM folders WHERE id=? AND user_id=?))').bind(u.id, text.slice(0, 40), Date.now(), pid, +b.folder_id || null, u.id), // โฟลเดอร์ต้องเป็นของผู้ใช้เอง (ไม่งั้น AI จะอ่านคำสั่ง/ไฟล์ของคนอื่น)
        env.DB.prepare(`INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (${newest},?,?,?,?)`).bind(u.id, 'user', saved, m.id, Date.now()),
        rowQ(`c.id=${newest}`).bind(u.id)]);
      chatRow = got[2].results?.[0] || null; cid = chatRow.id;
      hist = [{ role: 'user', content: saved }];
    } else { // แชตเดิม: บันทึกข้อความ + อ่านข้อมูลแชต + ประวัติ (ตัดหัวตาม histStart ในคำสั่งเดียว) ใน batch เดียว · เดิมสี่รอบไป-กลับ
      const after = 'COALESCE((SELECT summary_upto FROM chats WHERE id=?1),0)';
      const got = await env.DB.batch([
        ...(write ? [env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(cid, 'user', saved, m.id, Date.now())] : []),
        rowQ('c.id=?').bind(cid),
        env.DB.prepare(`SELECT role,content FROM messages WHERE chat_id=?1 AND id>${after} ORDER BY id LIMIT -1 OFFSET (SELECT CASE WHEN n>?2 THEN CAST((n-?2+?3-1)/?3 AS INTEGER)*?3 ELSE 0 END FROM (SELECT COUNT(*) n FROM messages WHERE chat_id=?1 AND id>${after}))`).bind(cid, hmax, hmax / 2)]); // = histStart(): ตัวเลขที่ผูกอาจเป็นทศนิยม จึง CAST ให้ปัดลงเป็นจำนวนเต็ม
      chatRow = got.at(-2).results?.[0] || null;
      hist = got.at(-1).results || [];
    }
    hist = hist.map(x => ({ ...x, content: stripMarkers(String(x.content || '').replace(/⁣/g, '')) })).filter(x => x.content); // ตัดตัวคั่นรอบความคิดที่มองไม่เห็น + ตัดคำตอบว่าง (กดหยุดตอนยังคิดอยู่)
    while (hist.length && hist[0].role !== 'user') hist.shift();
    if (!pid) { const q = text; hist.forEach(x => { if (x.role === 'user' && x.content.length > FILE_FULL) x.content = excerptFiles(x.content, q); }); }
    if (pid) hist.forEach((x, i) => { if (i < hist.length - 1 && x.role === 'user') x.content = stripOpenFile(x.content); }); // เนื้อหาไฟล์ที่เปิดอยู่ส่งเฉพาะข้อความล่าสุด (ไม่ซ้ำทุกรอบ ประหยัด token)
    if (!hist.length) { await unlimit(env, lock); return err('ไม่มีข้อความให้ตอบ'); }
  }

  const J = { u, plan, m, hist, cid, pid, effort, images, overflow, lock, search: !!b.search, skill_ids: Array.isArray(b.skill_ids) ? b.skill_ids.slice(0, 3) : [], mcp_ids: Array.isArray(b.mcp_ids) ? b.mcp_ids.map(Number).filter(x => x > 0).slice(0, 3) : [], mcp_off: Array.isArray(b.mcp_off) ? b.mcp_off.map(Number).filter(x => x > 0).slice(0, 30) : [], summary: chatRow?.summary || null, chat_ins: chatRow?.instructions || null, folder_ins: chatRow?.fins || null, folder_docs: chatRow?.fdocs || null, pw0, agent: !!(b.agent && pid && plan.price > 0), local: localOf(b.local), perm: pid && ['auto', 'ask', 'plan'].includes(b.perm) ? b.perm : 'auto', img_size: ['1024x1024', '1536x1024', '1024x1536'].includes(b.img_size) ? b.img_size : null };
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
  const tPrep = Date.now();
  await send({ chat_id: cid, model: m.name, overflow: overflow === 'overflow', wallet: overflow === 'wallet' });
  const lastText = hist.at(-1).content;
  // tools แบบ native: โหมด Code อ่าน/แก้ไฟล์ผ่าน tool · แชตค้นเว็บ/เปิดลิงก์ผ่าน tool เมื่อโมเดลเห็นว่าจำเป็น · โมเดลที่ไม่รองรับใช้แบบเดิม
  let useTools = nativeTools(m);
  // งานเตรียมทั้งหมดไม่ขึ้นต่อกัน: ทำพร้อมกันแทนการรอทีละขั้น (ค้นเว็บ, ลิงก์, กติกาโปรเจกต์, system, MCP, ตัวตัดวงจร, คลังความรู้, ไฟล์โปรเจกต์)
  // ค้นล่วงหน้า (ไม่รอ): คำถามแรกของแชตที่ดูเหมือนต้องใช้ข้อมูลล่าสุด เริ่มค้นด้วยคำถามนั้นทันทีระหว่างที่โมเดลคิด
  // ถ้าโมเดลเรียก web_search ได้ผลทันที (เหมือนค้นก่อนตอบแบบเดิม แต่ขนานกับโมเดล) · ถ้าโมเดลตอบเองได้ ก็ไม่ต้องรอผลค้นเลย
  const qText = String(lastText || '').replace(/\n\n\[\[file:[\s\S]*$/, '').slice(0, 1500);
  let spec = null;
  const [searchOn, sources, projRows, systemBase, mcpSrvs, down, links, codeRows, imgPrompt] = await Promise.all([
    !pid && getSetting(env, 'search_enabled').then(async v => {
      const on = v !== '0' && !!env.TAVILY_KEY;
      if (on && useTools && !J.search && hist.length <= 1 && qText.length <= 120 && await autoSearch(env, lastText)) spec = webSearch(env, qText);
      return on;
    }),
    // ค้นเว็บก่อนตอบเฉพาะเมื่อผู้ใช้กดค้นเอง หรือโมเดลใช้ tool ไม่ได้ (โมเดลที่ใช้ tool ได้ค้นเองเมื่อจำเป็น)
    (async () => !pid && (J.search || (!useTools && await autoSearch(env, lastText))) ? smartSearch(env, u, hist) : [])(),
    pid ? env.DB.batch([env.DB.prepare("SELECT content FROM project_files WHERE project_id=? AND path IN ('ASTRA.md','AGENTS.md') ORDER BY path LIMIT 1").bind(pid), env.DB.prepare('SELECT instructions FROM projects WHERE id=?').bind(pid)]).then(r => r.map(x => x.results?.[0])) : [],
    systemFor(env, u, '', J.skill_ids),
    connTools(env, u.id, { ids: J.mcp_ids || [], off: J.mcp_off || [], askOk: !pid }).catch(() => ({ tools: [], map: new Map() })), // connectors ที่เปิดใช้ทุกแชต + ที่เลือกเพิ่ม · โหมด Code ไม่มีปุ่มอนุญาต จึงได้เฉพาะเครื่องมือที่อนุญาตเสมอ
    model.fallback_id ? modelDown(env, model.id) : false,
    !pid ? readLinks(lastText).catch(() => []) : [],
    pid && useTools ? env.DB.prepare('SELECT path,content FROM project_files WHERE project_id=? ORDER BY path').bind(pid).all().then(r => r.results) : null,
    imagePrompt(env, !!pid),
  ]);
  if (sources.length) await send({ sources: sources.map(({ title, url }) => ({ title, url })) });
  const projFile = projRows[0]?.content?.trim() || ''; // ไฟล์กติกาในโปรเจกต์ (แก้ได้เอง/ให้ AI แก้ และซิงก์ GitHub ได้)
  const projIns = pid ? [projRows[1]?.instructions?.trim(), projFile && !projFile.startsWith('data:') ? 'From the project file ASTRA.md:\n' + projFile.slice(0, 3000) : ''].filter(Boolean).join('\n\n') : '';
  // systemFor ต่อท้ายคำสั่งผู้ใช้/ความจำ/Skills หลังข้อความหลัก จึงคำนวณส่วนท้ายครั้งเดียวแล้ววางต่อจากข้อความหลักของโหมดนั้น
  const system = (pid ? SYSTEM_CODE + '\n\n' + (m.code_prompt?.trim() || familyHint(m)) + (projIns ? '\n\nProject-specific instructions (follow them):\n' + projIns.slice(0, 3000) : '') : SYSTEM + (m.sys_prompt?.trim() ? '\n\n' + m.sys_prompt.trim() : '')) + systemBase + (J.summary ?  `\n\nSummary of the earlier part of this conversation (older messages are not shown):\n${J.summary}` : '') + (J.folder_ins ? `\n\nInstructions for every chat in this folder (follow them):\n${J.folder_ins}` : '') + folderDocs(J.folder_docs) + (J.chat_ins ? `\n\nInstructions the user set for this conversation (follow them):\n${J.chat_ins}` : '') + imgPrompt; // code_prompt: แอดมินเขียนกำกับโมเดลที่ไม่ค่อยทำตาม
  const mcpTools = mcpSrvs.tools, mcpMap = mcpSrvs.map; let askStop = false;
  // zip ที่แนบไว้ในแชต ([[zipref:id]] ในข้อความผู้ใช้): ให้ AI เปิดเฉพาะไฟล์ที่ต้องใช้ด้วย read_file / grep_files
  const zipIds = !pid && env.SLIPS ? [...new Set(hist.filter(x => x.role === 'user').flatMap(x => [...String(x.content).matchAll(/\[\[zipref:([0-9a-f]{16})\]\]/g)].map(y => y[1])))] : [];
  let zipCache = null;
  const zipLoad = async () => zipCache ||= Object.assign({}, ...await Promise.all(zipIds.map(async id => { const o = await env.SLIPS.get(`zip/${u.id}/${id}.json`); return o ? await o.json().catch(() => ({})) : {}; })));
  const zipTools = zipIds.length ? ZIP_TOOLS : [];
  const ws = codeRows ? codeWorkspace(codeRows) : null;
  const toolsNow = () => [...mcpTools, ...zipTools, ...(useTools && !pid ? [...webTools(searchOn), ...chatTools({ image: !!imgPrompt, art: artPaid(J.plan) })] : []), ...(useTools && ws ? (J.perm === 'plan' ? CODE_TOOLS.filter(t => !WRITE_TOOLS.has(t.function.name)) : CODE_TOOLS) : [])];
  let imgUsed = false, pyStop = false; // รูป 1 รูปต่อคำตอบ · run_python = จบคำตอบให้หน้าเว็บรันแล้วส่งผลกลับ
  const sysNow = () => (zipIds.length ? system + ZIP_SYS : system) + (useTools && ws ? CODE_TOOLS_NOTE : '') + (pid && J.perm === 'plan' ? PLAN_NOTE : '') + localSys(J.local, !!pid);
  // ตัวตัดวงจร: โมเดลที่ error ตั้งแต่ 3 ครั้งใน 5 นาทีล่าสุดถือว่าล่ม ถ้ามีโมเดลสำรองที่ยังปกติให้สลับไปเลย ไม่ต้องรอให้พังซ้ำ
  if (down) {
    const fb = await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(model.fallback_id).first();
    if (fb && !await modelDown(env, fb.id)) { model = fb; await send({ fallback: fb.name }); }
  }
  if (links.length) await send({ sources: [...sources, ...links].map(({ title, url }) => ({ title, url })) });
  const linkCtx = links.map(l => `[เนื้อหาจากลิงก์ ${l.url}${l.title ? ' · ' + l.title : ''}]\n${l.text}`).join('\n\n');
  const prepMs = Date.now() - tPrep; // เวลาเตรียมก่อนเรียกโมเดล (บันทึกคู่กับ ttft ดูผลการปรับความเร็ว)
  let msgs = sources.length || linkCtx ? hist.map((x, i) => i === hist.length - 1 ? { ...x, content: withSources(x.content, sources) + (linkCtx ? '\n\n' + linkCtx : '') } : x) : hist, imgs = imgs0, beat = Date.now(), lastKind = '';
  // ความคิดหลายรอบ: เมื่อโมเดลกลับมาคิดอีกหลังมีข้อความ/ขั้นตอนไปแล้ว เริ่มส่วนความคิดใหม่ (\u0001 คั่นใน thinking) และวางตัวคั่นที่มองไม่เห็น (\u2063\u2063) ในข้อความตรงจุดนั้น ให้หน้าเว็บแสดง Thinking หลายกล่องสลับกับข้อความ
  let round_ = 1; // จำนวนรอบที่โมเดลตอบ (รวมรอบอ่านไฟล์) ใช้แสดงในหน้า Code
  const maxRounds = J.agent ? AGENT_ROUNDS : TOOL_ROUNDS, inMax = J.agent ? AGENT_IN_MAX : ANSWER_IN_MAX; // โหมด Agent: ทำงานยาวได้มากรอบกว่า
  // ตรวจงานก่อนจบคำตอบ (โหมด Code): ไฟล์ที่แก้ในคำตอบนี้ + รายการงานล่าสุด · ตรวจได้ไม่เกิน 2 ครั้งต่อคำตอบ กันวนไม่จบ
  const touched = new Set(); let lastTodo = null, checks = 0;
  const reviewNote = async round => { // round = รอบปัจจุบัน (ใช้บอกหน้าเว็บว่ากำลังตรวจ)
    if (!ws || !touched.size || checks >= 2 || st.gone || J.perm === 'plan') return '';
    const probs = verifyWork(ws, touched);
    if (!probs.length && [...touched].some(f => /\.(?:html?|m?js|jsx|css)$/i.test(f)) && [...ws.files.keys()].some(f => /(^|\/)index\.html?$/i.test(f))) { // เปิดหน้าเว็บจริงบนเซิร์ฟเวอร์ ดู error ของ JavaScript (ถ้าตั้งค่า Browser Rendering ไว้)
      await send({ round: round + 2, of: maxRounds + 3, doing: 'เปิดหน้าเว็บตรวจ error' });
      const errs = await import('./agent.js').then(m => m.pageErrors(env, ws.files)).catch(() => null);
      if (errs?.length) probs.push('The page shows JavaScript errors when it loads: ' + errs.slice(0, 6).join(' | '));
    }
    const open = (lastTodo || []).filter(t => t.status !== 'completed').map(t => t.content);
    // สถิติการตรวจ (หลังบ้าน → คุณภาพ): selfcheck = เจอปัญหา, selfcheck_ok = ตรวจซ้ำหลังให้แก้แล้วผ่าน
    if (!probs.length && !open.length) { if (checks) await event(env, 'selfcheck_ok', model.id, String(checks)).catch(() => {}); return ''; }
    await event(env, 'selfcheck', model.id, JSON.stringify({ probs: probs.length, open: open.length, n: checks + 1 })).catch(() => {});
    checks++;
    return `[Automatic check before you finish]\n${probs.length ? 'Problems found in the files you changed:\n' + probs.map(x => '- ' + x).join('\n') + '\n' : ''}${open.length ? 'Your checklist still has unfinished items:\n' + open.map(x => '- ' + x).join('\n') + '\n' : ''}Fix these now with the tools (read the exact lines first if needed), then update the checklist and give a short summary. If an item is truly not needed, say why in one line.`;
  };
  let ctxUsed = 0, lastCtx = 0, cumIn = 0, capped = false, trimmedSent = false; // context ที่ใช้รอบล่าสุด · input รวมทุกรอบของคำตอบนี้ (เพดาน ANSWER_IN_MAX)
  for (let round = 0; ; round++) { // โหมด Code + Remote MCP
    round_ = round + 1;
    let part = '', ru = null;
    const tcs = new Map(), anthIdx = new Map();
    const fit = fitContext(system, msgs, ctxMax(model)); msgs = fit.msgs; ctxUsed = fit.used; if (fit.trimmed && !trimmedSent) { trimmedSent = true; await send({ trimmed: true }); } // ไม่ส่งเกิน context ของโมเดล (upstream จะ error)
    let toolsSent = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      // นาฬิกาเฝ้าโมเดล: ไม่มีข้อความ/ความคิดตัวแรกภายใน 90 วิ (effort สูงสุด 150 วิ) หรือเงียบเกิน 60 วิกลางทาง = ตัดการเชื่อมต่อ แล้วใช้ทางสลับโมเดลสำรอง/แจ้งข้อผิดพลาด แทนที่ผู้ใช้จะรอไม่จบ
      const ac = new AbortController(); let stalled = 0, wd;
      const arm = ms => { clearTimeout(wd); wd = setTimeout(() => { stalled = ms; ac.abort(); }, ms); };
      const firstMs = (model.first_token_s > 0 ? model.first_token_s : ['high', 'xhigh', 'max'].includes(effort) ? 150 : 90) * 1000, idleMs = (model.idle_s > 0 ? model.idle_s : 60) * 1000; // ตั้งต่อโมเดลได้ในหลังบ้าน
      arm(firstMs); let stopR = '', rawT = '';
      try {
        const tl = toolsNow(); toolsSent = tl.length > 0;
        for await (const e of callModel(env, model, msgs, { effort, cacheTtl: '1h', images: imgs, system: sysNow(), tools: tl.length ? tl : undefined, userId: u.id, signal: ac.signal, imageOpts: J.img_size ? { size: J.img_size } : {} })) {
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
          if (e.stop_reason) stopR = e.stop_reason;
          if (e.raw) rawT = e.raw;
        }
        clearTimeout(wd);
        if (!out.trim() && think && stopR === 'length' && !st.gone) { const t = 'โมเดลคิดจนเต็มความยาวสูงสุดก่อนจะตอบ ลองลดระดับความคิด หรือแบ่งคำถามให้เล็กลง'; out += t; part += t; await send({ t }); }
        if (!out.trim() && !think && !tcs.size && !st.gone) throw new Error('โมเดลส่งคำตอบว่างกลับมา' + (stopR && stopR !== 'stop' ? ` (เหตุผลจากผู้ให้บริการ: ${stopR})` : '')); // ตอบว่าง = ถือเป็นข้อผิดพลาด (นับเข้าตัวตัดวงจร และลองโมเดลสำรอง)
        break;
      } catch (e0) {
        clearTimeout(wd);
        const e = stalled ? new Error(`โมเดลไม่ตอบภายใน ${Math.round(stalled / 1000)} วินาที`) : e0;
        // ผู้ให้บริการไม่รับ tools (400/422 ที่พูดถึง tool/function): ปิด tools แบบ native ของคำตอบนี้แล้วลองใหม่แบบเดิมทันที ไม่นับเป็นโมเดลล่ม
        if (useTools && toolsSent && !stalled && !out.trim() && !think && !tcs.size && /\b4(00|04|22)\b/.test(e.message) && /tool|function/i.test(e.message)) { useTools = false; console.log('tools off for', model.name, e.message.slice(0, 120)); attempt--; continue; }
        console.log('AI error', model.name, e.message);
        // ผู้ให้บริการปฏิเสธเนื้อหา (ตัวกรองความปลอดภัย/ลิขสิทธิ์ เช่น ขอรูปตัวละครดัง) ไม่ใช่โมเดลล่ม: ไม่นับเข้าตัวตัดวงจร และบอกผู้ใช้ตรงๆ
        const refused = !stalled && /moderation|safety|content[ _-]?policy|policy[ _-]?violation|copyright|trademark|blocked by|not allowed|rejected as a result|responsible ai|content[ _-]?filter/i.test(e.message);
        const busy = !stalled && /\b(429|529)\b|rate.?limit|overloaded|temporarily unavailable/i.test(e.message);
        await event(env, refused ? 'refused' : 'error', model.id, e.message.slice(0, 300));
        const fb = !out.trim() && !think && !tcs.size && attempt === 0 && model.fallback_id && await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(model.fallback_id).first();
        if (fb) { model = fb; await send({ fallback: fb.name }); continue; } // โมเดลหลักล่ม: สลับไปโมเดลสำรอง
        await send({ error: u.role === 'admin' ? (busy ? 'ผู้ให้บริการคนเยอะ ลองใหม่ให้ 3 ครั้งแล้วยังไม่ได้ · ' : '') + 'แอดมิน: ' + e.message + (rawT && e.message.startsWith('โมเดลส่งคำตอบว่าง') ? ' · ข้อมูลดิบท้ายสุด: ' + rawT.slice(0, 900) : '') : e.message.startsWith('โมเดลส่งคำตอบว่าง') ? e.message + ' · มักเกิดจากระบบกรองของผู้ให้บริการ ลองเปลี่ยนคำถามหรือโมเดล'
          : refused ? (model.provider === 'image' ? 'ผู้ให้บริการไม่สร้างรูปนี้ให้ (มักเป็นตัวละคร แบรนด์ หรือคนดังที่มีลิขสิทธิ์ หรือเนื้อหาที่ไม่อนุญาต) ลองบรรยายเป็นสไตล์ของคุณเองโดยไม่ระบุชื่อตัวละคร' : 'ผู้ให้บริการไม่ตอบคำขอนี้เพราะติดตัวกรองเนื้อหา ลองปรับคำถามหรือเลือกโมเดลอื่น')
          : busy ? 'ตอนนี้มีคนใช้โมเดลนี้เยอะ ลองใหม่อีกครั้งในไม่กี่วินาที หรือเลือกโมเดลอื่น' : 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' });
        break;
      }
    }
    cumIn += ru ? ru.fresh + ru.read + ru.write : ctxUsed;
    if (ru && !ru.flag) lastCtx = ru.fresh + ru.read + ru.write + ru.out; // context จริงที่โมเดลเห็นรอบล่าสุด + คำตอบ = ฐานของข้อความถัดไป
    if (ru) { // รวม usage ทุกรอบ · แยกเก็บรอบที่ context ยาวเกินเกณฑ์ไว้ใน .long เพื่อคิดราคาขั้นที่ 2 เฉพาะรอบนั้น
      const L0 = usage?.long || { fresh: 0, read: 0, write: 0, out: 0 }, L = isLong(model, ru) ? { fresh: L0.fresh + ru.fresh, read: L0.read + ru.read, write: L0.write + ru.write, out: L0.out + ru.out } : L0;
      usage = usage ? { fresh: usage.fresh + ru.fresh, read: usage.read + ru.read, write: usage.write + ru.write, out: usage.out + ru.out } : { ...ru };
      usage.long = L.fresh + L.read + L.write + L.out ? L : null;
    }
    const toolCalls = [...tcs.values()];
    if (toolCalls.length && !st.gone && round < (ws && useTools ? maxRounds + 2 : zipTools.length ? 12 : 5)) {
      msgs = [...msgs, { role: 'assistant', content: part || null, tool_calls: toolCalls }];
      imgs = [];
      let onlyWrites = true, allOk = true, wrote = false; const doing = [];
      for (const tc of toolCalls) {
        const tname = tc.function?.name || '';
        if (WRITE_TOOLS.has(tname)) wrote = true; else if (tname !== 'todo_write') onlyWrites = false; // อัปเดตรายการงานไม่ใช่การอ่าน: รอบที่แก้ไฟล์ + อัปเดตรายการ ยังนับว่าจบงานได้
        if ((ws && CODE_TOOL_NAMES.has(tname)) || WEB_TOOL_NAMES.has(tname) || (!pid && CHAT_TOOL_NAMES.has(tname))) {
          let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* อาร์กิวเมนต์เสีย: ให้เครื่องมือตอบ error */ }
          let r;
          if (cumIn >= inMax && !WRITE_TOOLS.has(tname)) r = { result: 'Reading budget for this answer is used up. Stop reading and finish the task with what you have.', ok: false, label: tname };
          else if (tname === 'todo_write') { const todo = todosOf(args); lastTodo = todo; await send({ todo }); r = { result: todo.length ? 'Checklist updated.' : 'Error: todos is empty.', ok: todo.length > 0, label: '' }; }
          else if (J.perm === 'plan' && WRITE_TOOLS.has(tname)) r = { result: 'Error: plan mode is on, files cannot be changed. Reply with the plan instead.', ok: false, label: 'ข้าม (โหมด Plan)' };
          else if (ws && CODE_TOOL_NAMES.has(tname)) { r = codeTool(ws, tname, args); if (r.ok && WRITE_TOOLS.has(tname) && args.path) touched.add(String(args.path).replace(/^\.?\//, '')); }
          else if (CHAT_TOOL_NAMES.has(tname)) r = await chatTool(env, u, cid, tname, args, { imgUsed, pyStop, image: !!imgPrompt, plan: J.plan });
          else if (tname === 'web_search') {
            const q = String(args.query || '').slice(0, 400), pre = spec; spec = null; // ผลค้นล่วงหน้าใช้กับการค้นครั้งแรกเท่านั้น
            let found = pre ? await pre : []; if (!found.length && searchOn && q) found = await webSearch(env, q);
            for (const f of found) if (!sources.some(x => x.url === f.url)) sources.push(f);
            if (found.length) await send({ sources: [...sources, ...links].map(({ title, url }) => ({ title, url })) });
            r = { result: found.length ? found.map((f, i) => `[${i + 1}] ${f.title}\n${f.url}\n${f.content}`).join('\n\n') : 'No results.', ok: found.length > 0, label: 'ค้นเว็บ ' + q.slice(0, 60) };
          } else {
            const pg = (await readLinks(String(args.url || '')).catch(() => []))[0];
            if (pg && !links.some(x => x.url === pg.url)) { links.push(pg); await send({ sources: [...sources, ...links].map(({ title, url }) => ({ title, url })) }); }
            r = { result: pg ? `${pg.title ? pg.title + '\n' : ''}${pg.text}` : 'Error: could not open this page (blocked, not text, or not reachable).', ok: !!pg, label: 'เปิด ' + String(args.url || '').slice(0, 60) };
          }
          if (!r.ok) allOk = false;
          if (r.ok && tname === 'generate_image') imgUsed = true;
          if (r.ok && tname === 'run_python') pyStop = true;
          if (r.emit) { out += r.emit; await send({ t: r.emit }); lastKind = 't'; }
          if (r.label) { doing.push(r.label); await send({ mcp: { server: ws ? 'ไฟล์' : 'เว็บ', tool: r.label, ok: r.ok } }); } // todo_write ไม่ขึ้นเป็นขั้นตอน (แสดงเป็นรายการงานแทน)
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: r.result });
          continue;
        }
        if (ZIP_TOOL_NAMES.has(tc.function?.name) && zipTools.length) {
          let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          const resText = cumIn >= ANSWER_IN_MAX ? 'Reading budget for this answer is used up. Stop calling tools and answer now with what you have.' : zipTool(tc.function.name, args, await zipLoad());
          await send({ mcp: { server: 'zip', tool: `${tc.function.name === 'read_file' ? 'อ่าน' : 'ค้นหา'} ${String(args.path || args.pattern || '').slice(0, 80)}`, ok: !resText.startsWith('Error') } });
          msgs.push({ role: 'tool', tool_call_id: tc.id, content: resText }); continue;
        }
        const meta = mcpMap.get(tc.function?.name);
        let resText = 'ไม่พบเครื่องมือนี้', ok = false;
        if (meta) {
          let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          if (meta.perm === 'ask') { // แก้/ส่งข้อมูลออกไป: ยังไม่ทำ ขึ้นปุ่มให้ผู้ใช้อนุญาตก่อน (กดแล้วหน้าเว็บส่งผลกลับมาเป็นข้อความถัดไป)
            const aid = await askApproval(env, u.id, cid, meta, args), mk = `\n\n[[approve:${aid}|${meta.server} · ${meta.name}]]\n`;
            out += mk; await send({ t: mk }); lastKind = 't'; askStop = true; ok = true;
            resText = 'Not done yet: this action needs the user\'s approval and they now see Allow / Deny buttons. Do not call any more tools. The result will arrive in the next message if they allow it.';
            await send({ mcp: { server: meta.server, tool: meta.name + ' · รออนุญาต', ok: true } });
          } else {
            try { resText = await connCall(env, meta.sv, meta.name, args); ok = true; }
            catch (err) { resText = 'Error: ' + err.message; }
            await send({ mcp: { server: meta.server, tool: meta.name, ok } });
          }
        }
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: resText });
      }
      await env.DB.prepare('UPDATE rate SET reset=? WHERE key=?').bind(Date.now() + LOCK_MS, lock).run();
      lastKind = 't';
      // รอบที่มีแต่การแก้ไฟล์และสำเร็จทุกอัน = งานเสร็จ (โมเดลเขียนสรุปมาในรอบเดียวกันแล้ว) ไม่ต้องเรียกโมเดลอีกรอบให้ผู้ใช้รอ
      if (ws && useTools && onlyWrites && wrote && allOk) { // รอบที่มีแต่การแก้ไฟล์: เดิมจบทันที → ตอนนี้ตรวจก่อน ถ้ายังมีปัญหา/งานค้างให้ทำต่อ
        const note = await reviewNote(round); if (!note) break;
        msgs.push({ role: 'user', content: note }); await send({ round: round + 2, of: maxRounds + 3, doing: 'ตรวจงานที่แก้' }); continue;
      }
      if (pyStop || askStop) break; // หน้าเว็บรัน Python / รอผู้ใช้อนุญาต แล้วส่งผลกลับเป็นข้อความถัดไป
      if (ws && useTools && doing.length) await send({ round: round + 2, of: maxRounds + 3, doing: doing.slice(0, 3).join(', ').slice(0, 120) });
      continue;
    }
    const reqs = pid && !st.gone && round < maxRounds && !/```[^\n]*\bpath=/.test(part) && !/^\s*RUN\s+\S/m.test(part.replace(/```[\s\S]*?```/g, '')) ? toolReqs(part) : []; // RUN รันที่เครื่องผู้ใช้ จึงหยุดรอ
    if (!reqs.length) { // โมเดลตอบจบ: ตรวจไฟล์ที่แก้ในคำตอบนี้ก่อน ถ้าเจอปัญหา/งานค้างให้แก้ต่ออีกรอบ
      const note = round < maxRounds + 2 ? await reviewNote(round) : '';
      if (!note) break;
      await send({ t: '\n\n' }); out += '\n\n'; lastKind = 't';
      msgs = [...msgs, { role: 'assistant', content: part || '(done)' }, { role: 'user', content: note }]; imgs = [];
      await send({ round: round + 2, of: maxRounds + 3, doing: 'ตรวจงานที่แก้' }); continue;
    }
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
    usage = { fresh: Math.ceil(chars / 2), read: 0, write: 0, out: Math.ceil((out.length + think.length) / 2), flag: st.gone ? 'gone' : 'est' };
  }
  const tok = usage && { in: usage.fresh + usage.read + usage.write, out: usage.out };
  let mid = null;
  if ((out || think) && cid) mid = (await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,thinking,sources,tin,tout,tcr,tcw,tctx) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(cid, 'assistant', out, model.id, Date.now(), think || null, sources.length ? JSON.stringify(sources.map(({ title, url }) => ({ title, url }))) : null, tok?.in ?? null, tok?.out ?? null, usage && !usage.flag ? usage.read : null, usage && !usage.flag ? usage.write : null, lastCtx || null).first())?.id ?? null;
  const charged = usage ? await logUsage(env, u.id, model, usage, { wallet: overflow, plan, units: overflow !== 'wallet' && !(isFreeModel(plan, model.id) && usage.fresh + usage.read + usage.write < FREE_CTX), ms: Date.now() - tStart, ttft, src: 'chat', prep: prepMs }) : 0;
  await unlimit(env, lock);
  const fin = await usageStatus(env, u, plan);
  await send({ done: true, tok, mid, ...(charged > 0 ? { cost: charged } : {}), rounds: round_, ctx: { used: lastCtx || ctxUsed, max: ctxMax(model), real: !!lastCtx }, ...fin });
  for (const lv of [100, 80]) if (J.pw0 < lv && fin.pctWeek >= lv) { // ข้ามเส้น 80% / 100% ของลิมิตสัปดาห์: อีเมลครั้งเดียวตอนข้าม
    await mail(env, u.email, `AstraCode: ใช้ลิมิตสัปดาห์ไป ${lv}% แล้ว`, mailBox(`ใช้ลิมิตสัปดาห์ไป ${lv}% แล้ว`, lv === 100 ? 'ลิมิตของแพลนเต็มแล้ว อัปเกรดแพลนหรือเติม Wallet เพื่อใช้ต่อได้ทันที' : 'ใกล้เต็มแล้ว ถ้าใช้ต่อเนื่องแนะนำอัปเกรดแพลนเพื่อไม่ให้งานสะดุด', 'ดูแพลน', siteUrl(env) + '/plans')).catch(() => {});
    break;
  }
  if (cid && (out || think) && u.auto_compact !== 0) { // ย่อแชตอัตโนมัติหลังตอบเสร็จ: context ใช้ถึง compact_pct % ของหน้าต่างโมเดล (ค่าเริ่มต้น 75 · 0 = ปิดทั้งระบบ) หรือแชตยาวเกินเกณฑ์ตัวอักษร
    const pctSet = await getSetting(env, 'compact_pct'), pctLim = pctSet === '' ? 75 : +pctSet, full = pctLim > 0 && Math.max(ctxUsed, lastCtx) >= ctxMax(model) * pctLim / 100;
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
  if (usage) await logUsage(env, u.id, m, usage, { units: false, src: 'system' }); // ต้นทุนของเรา ไม่หักลิมิตผู้ใช้
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
  if (!r.ok) throw Object.assign(userErr(r.status === 401 || r.status === 403 ? 'ต้องเชื่อมต่อใหม่ (สิทธิ์หมดอายุหรือถูกถอน)' : `MCP ตอบกลับ HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 150)}`, 502), { http: r.status, auth: r.headers.get('www-authenticate') || '' });
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
// ชื่อเครื่องมือที่ดูเป็นการอ่าน (ใช้เมื่อเซิร์ฟเวอร์ไม่ได้บอก readOnlyHint)
export const READ_NAME = /^(get|list|search|read|fetch|find|query|lookup|describe|view|show|retrieve|count|check|resolve|ask|explain)(?:[_-]|[A-Z]|$)|(?:[_-])(get|list|search|read|fetch|find|query|lookup|view|retrieve)(?:[_-]|$)/i;
export async function mcpSync(url, token) {
  if (url === GOOGLE_URL) return GOOGLE_TOOLS;
  const init = await mcpRpc(url, token, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AstraCode', version: '1.0.0' } });
  await mcpRpc(url, token, 'notifications/initialized', {}, init.sessionId, true).catch(() => {});
  const res = await mcpRpc(url, token, 'tools/list', {}, init.sessionId);
  const tools = (res.data?.tools || []).slice(0, 40).map(t => ({
    name: String(t.name || '').slice(0, 60),
    description: String(t.description || '').slice(0, 300),
    inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
    ro: t.annotations?.readOnlyHint === true || (t.annotations?.readOnlyHint !== false && READ_NAME.test(String(t.name || ''))), // อ่านอย่างเดียว: ใช้ได้เลยโดยไม่ต้องถาม
  })).filter(t => t.name);
  return tools;
}
export async function mcpCall(url, token, name, args, env) {
  if (url === GOOGLE_URL) return String(await googleCall(env, token, name, args || {})).slice(0, 12000); // เชื่อม Google แบบปุ่มเดียว: เรียกตรงในเซิร์ฟเวอร์
  const init = await mcpRpc(url, token, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AstraCode', version: '1.0.0' } });
  await mcpRpc(url, token, 'notifications/initialized', {}, init.sessionId, true).catch(() => {});
  const res = await mcpRpc(url, token, 'tools/call', { name, arguments: args || {} }, init.sessionId);
  const c = res.data?.content;
  const txt = Array.isArray(c) ? c.map(x => x?.type === 'text' ? x.text : JSON.stringify(x)).join('\n') : JSON.stringify(res.data ?? '');
  return String(txt || '(ไม่มีผลลัพธ์)').slice(0, 12000);
}

// ---------- โหมด Code: เครื่องมืออ่าน/ค้นไฟล์ (แบบข้อความ ใช้ได้กับทุกโมเดล) ----------
export const AGENT_ROUNDS = 20, AGENT_IN_MAX = 1.2e6; // โหมด Agent ในหน้า Code (แพลนชำระเงิน)
// ---------- zip ที่แนบในแชต: เครื่องมืออ่านไฟล์ให้ AI ----------
// แอป AstraCode Desktop: แชต/โหมด Code ใช้ไฟล์ คำสั่ง และ MCP ในเครื่องผู้ใช้ได้ (หน้าเว็บในแอปเป็นคนทำตามบรรทัดคำสั่ง แล้วส่งผลกลับเป็นข้อความถัดไป)
export const localOf = l => l && typeof l === 'object' ? { os: String(l.os || '').slice(0, 20), folder: String(l.folder || '').slice(0, 80), screen: !!l.screen, mcp: Array.isArray(l.mcp) ? l.mcp.slice(0, 40).map(t => ({ name: String(t?.name || '').slice(0, 64), description: String(t?.description || '').slice(0, 300), args: JSON.stringify(t?.parameters?.properties || {}).slice(0, 500) })).filter(t => t.name) : [] } : null;
export function localSys(l, code) {
  if (!l) return '';
  if (code) return `\n\nThis project is linked to a real folder on the user's computer (${l.os || 'unknown OS'}) through the AstraCode Desktop app: the project files ARE the files in that folder. RUN lines execute in a real shell in that folder on the user's machine (not the browser emulator described above), with whatever the user has installed (node, npm, python, pip, git…). The user approves commands (or allowed them automatically). Commands time out after 10 minutes and get no keyboard input, so pass non-interactive flags (-y, --yes). Dev servers and watchers (npm run dev, vite, next dev, python -m http.server…) start in the background and you get their URL back; do not start the same server twice.`;
  return `\n\nThis chat runs inside the AstraCode Desktop app, which gives you tools on the user's computer (${l.os || 'unknown OS'}), limited to the folder "${l.folder}". This overrides "You have no tools" above. To use a tool, write each call on its own line outside code blocks, then STOP and wait; the results come back in the next message:\nLIST <relative folder, . for the root>\nREAD <relative file path>\nGREP <text to find in all files>\nRUN <shell command, runs in that folder; no keyboard input, so use -y/--yes; 10 minute timeout; dev servers run in the background and return their URL>\n${l.mcp.length ? 'MCP <tool name> <JSON arguments on one line>\n' : ''}${l.screen ? 'SCREEN (take a screenshot)\nCLICK x y | DOUBLE x y | RIGHT x y (pixels of the latest screenshot)\nTYPE <text>\nKEY <keys, e.g. ctrl+s, enter, alt+f4>\nSCROLL x y <notches, negative = up>\nWAIT <ms>\n' : ''}To create or overwrite a file in that folder, put the FULL content in a code block whose info string is the language then file=<relative path>. To change part of an existing file, use the same kind of block containing one or more\n<<<<<<< SEARCH\nexact existing lines\n=======\nnew lines\n>>>>>>> REPLACE\nThe app writes files without asking. Use at most 12 tool lines per reply. Look before you change things (LIST/GREP/READ), never claim a command ran or a file changed before you see the result, and summarize what you did when finished.${l.screen ? ' When controlling the screen: start with SCREEN, act in small steps, a fresh screenshot comes back after each batch; never enter passwords, payment details or send messages/purchases without the user asking explicitly in this chat.' : ''}${l.mcp.length ? '\nLocal MCP tools:\n' + l.mcp.map(t => `- ${t.name}: ${t.description} args ${t.args}`).join('\n').slice(0, 8000) : ''}`;
}
export const ZIP_SYS = '\n\nThe user attached a project archive; its file list is in their message. Call read_file to open the files you need (and grep_files to find where something is) before answering. Never guess file contents. To change files, output each changed file in FULL in its own code block with file=<the same path as in the archive>; the page merges them back into the archive for download.';
export const ZIP_TOOLS = [
  { type: 'function', function: { name: 'read_file', description: 'Read a text file from the attached archive. Large files: pass from_line/to_line (1-based).', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path as listed in the archive' }, from_line: { type: 'integer' }, to_line: { type: 'integer' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'grep_files', description: 'Case-insensitive plain-text search across all text files in the attached archive. Returns path:line: text (max 80 hits).', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path_prefix: { type: 'string', description: 'Only search under this folder (optional)' } }, required: ['pattern'] } } },
];
export const ZIP_TOOL_NAMES = new Set(ZIP_TOOLS.map(t => t.function.name)), ZIP_READ_MAX = 60e3;
export function zipTool(name, a, files) {
  const paths = Object.keys(files);
  if (name === 'grep_files') {
    const q = String(a.pattern || '').toLowerCase(), pre = String(a.path_prefix || ''); if (!q) return 'Error: empty pattern';
    const hits = [];
    for (const p of paths) { if (pre && !p.startsWith(pre)) continue; const ls = files[p].split('\n'); for (let i = 0; i < ls.length && hits.length < 80; i++) if (ls[i].toLowerCase().includes(q)) hits.push(`${p}:${i + 1}: ${ls[i].trim().slice(0, 200)}`); if (hits.length >= 80) break; }
    return hits.length ? hits.join('\n') + (hits.length >= 80 ? '\n…(more hits, narrow the search)' : '') : 'No matches.';
  }
  const want = String(a.path || '').replace(/^\.?\/+/, ''), p = paths.find(x => x === want) || paths.find(x => x.endsWith('/' + want) || want.endsWith('/' + x));
  if (!p) return `Error: no file ${want}. Files that look close: ${paths.filter(x => x.split('/').pop() === want.split('/').pop()).slice(0, 10).join(', ') || '(none)'}`;
  const ls = files[p].split('\n'), from = Math.max(1, +a.from_line || 1), to = Math.min(ls.length, +a.to_line || ls.length);
  let body = ls.slice(from - 1, to).join('\n'); const cut = body.length > ZIP_READ_MAX;
  if (cut) body = body.slice(0, ZIP_READ_MAX);
  return `${p} (lines ${from}-${to} of ${ls.length})\n${body}${cut ? `\n…(cut at ${ZIP_READ_MAX} characters; read the rest with from_line/to_line)` : ''}`;
}
export const TOOL_ROUNDS = 6, READ_MAX = 100e3, ANSWER_IN_MAX = 400e3; // ANSWER_IN_MAX = input token รวมทุกรอบของคำตอบเดียว
// หน้า Code แนบเนื้อหาไฟล์ที่เปิดอยู่และข้อความที่เลือกท้ายข้อความ ([เนื้อหาไฟล์ที่เปิดอยู่] … ถึงท้ายสุด)
// ข้อความเก่าของผู้ใช้ในโหมด Code: ตัดรายชื่อไฟล์ทั้งโปรเจกต์ (สูงสุด 15,000 ตัวอักษร) และเนื้อหาไฟล์ที่แนบไว้ออก เหลือเฉพาะในข้อความล่าสุด
// เดิมรายชื่อไฟล์ถูกส่งซ้ำทุกข้อความในประวัติ = context โตเร็วและเสีย token ทุกครั้งที่ส่ง
export const stripOpenFile = t => String(t || '').replace(/\n\n\[(?:ไฟล์ทั้งหมดในโปรเจกต์|เนื้อหาไฟล์ที่เปิดอยู่|เนื้อหาไฟล์ในโปรเจกต์)\][\s\S]*$/, '');
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

// เอกสารอ้างอิงของโฟลเดอร์: ใส่ใน system (คงที่ทุกแชตในโฟลเดอร์ จึงได้ prompt cache)
export function folderDocs(raw) {
  let fs = []; try { fs = JSON.parse(raw || '[]'); } catch {} if (!fs.length) return '';
  return '\n\nReference documents shared by every chat in this folder (use them when relevant; cite the file name):\n' + fs.map(f => `[[file:${f.name}]]\n${f.text}\n[[/file]]`).join('\n');
}

// tools ของแชต (ดู chatTools ใน codetools.js) · คืน { result, emit, ok, label }
export async function chatTool(env, u, cid, name, a, st) {
  const fail = (msg, label) => ({ result: 'Error: ' + msg, ok: false, label });
  const noFence = t => String(t || '').replace(/`{3,}/g, '``'); // กันบล็อกปิดก่อนเวลา
  if (name === 'generate_image') {
    if (!st.image) return fail('image generation is turned off', 'สร้างรูป');
    if (st.imgUsed) return fail('only one image per answer', 'สร้างรูป');
    const p = noFence(a.prompt).trim().slice(0, 1500); if (!p) return fail('prompt is empty', 'สร้างรูป');
    const sz = { square: 'sq', landscape: 'land', portrait: 'port' }[a.size] || ''; // ไม่ระบุ = ขนาดที่ผู้ใช้เลือกไว้ในหน้าเว็บ
    return { result: 'The image is being created and will appear under your answer. Do not paste a link or describe it as already visible.', emit: '\n\n```image' + (sz ? ' ' + sz : '') + '\n' + p + '\n```\n', ok: true, label: 'สร้างรูป' };
  }
  if (name === 'save_memory') {
    const t = noFence(a.text).trim().slice(0, 200); if (!t) return fail('text is empty', 'ความจำ');
    if (u.auto_memory) { // ผู้ใช้เปิดบันทึกอัตโนมัติ: บันทึกเลย (ไม่ซ้ำ · ไม่เกิน 3 ข้อต่อวัน · รวมไม่เกิน 50) แล้วให้หน้าเว็บโชว์ปุ่มยกเลิก
      const key = x => x.toLowerCase().replace(/[\s.,!?'"“”]+/g, ''), all = (await env.DB.prepare('SELECT text, created_at FROM memories WHERE user_id=?').bind(u.id).all()).results;
      if (all.some(x => { const a1 = key(x.text), b1 = key(t); return a1 === b1 || (b1.length > 8 && a1.includes(b1)) || (a1.length > 8 && b1.includes(a1)); })) return { result: 'Already remembered; nothing new saved.', ok: true, label: 'จำไว้แล้ว' };
      const today = all.filter(x => x.created_at > Date.now() - DAY).length;
      if (today < 3 && all.length < 50) {
        const row = await env.DB.prepare('INSERT INTO memories (user_id,text,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, t, Date.now()).first();
        return { result: 'Saved to memory. The user can undo it from the note under your answer.', emit: `\n\n[[mem:${row.id}|${t.replace(/[\]\n|]/g, ' ')}]]\n`, ok: true, label: 'บันทึกความจำ' };
      } // ครบเพดาน: กลับไปเป็นแบบเสนอให้กดเอง
    }
    return { result: 'Suggested. The user sees a button to save it; it is not saved until they tap it.', emit: '\n\n```remember\n' + t + '\n```\n', ok: true, label: 'เสนอให้จำ' };
  }
  if (name === 'search_chats') {
    const q = String(a.query || '').trim().slice(0, 100), label = 'ค้นแชตเก่า ' + q.slice(0, 40);
    const terms = q.split(/\s+/).filter(x => x.length >= 2).slice(0, 4); if (!terms.length) return fail('query is too short', label);
    const like = terms.map(x => '%' + x.replace(/[%_]/g, '') + '%');
    const rows = (await env.DB.prepare(`SELECT m.chat_id, c.title, m.role, m.content, m.created_at FROM messages m JOIN chats c ON c.id=m.chat_id
      WHERE c.user_id=? AND c.id<>? AND c.project_id IS NULL AND c.deleted_at IS NULL AND (${like.map(() => 'm.content LIKE ?').join(' OR ')}) ORDER BY m.id DESC LIMIT 8`).bind(u.id, cid || 0, ...like).all().catch(() => ({ results: [] }))).results;
    if (!rows.length) return { result: 'No earlier chats match.', ok: true, label };
    const snip = t => { const s = stripMarkers(t).replace(/\s+/g, ' '), i = Math.max(0, s.toLowerCase().indexOf(terms[0].toLowerCase()) - 120); return s.slice(i, i + 400); };
    return { result: rows.map(r => `[${r.title} · ${new Date(r.created_at + 7 * 3600e3).toISOString().slice(0, 10)} · ${r.role}]\n${snip(r.content)}`).join('\n\n'), ok: true, label };
  }
  if (name === 'create_file') {
    const fname = String(a.filename || '').replace(/[\\/:*?"<>|[\]\n\r]+/g, '_').trim().slice(0, 100), content = String(a.content ?? '');
    if (!FILE_EXT.test(fname)) return fail('use one of: .xlsx .csv .docx .pdf .md .txt .html .json', 'สร้างไฟล์');
    if (!content.trim()) return fail('content is empty', 'สร้างไฟล์ ' + fname);
    if (content.length > 200e3) return fail('content is over 200,000 characters; split it into smaller files', 'สร้างไฟล์ ' + fname);
    return { result: `File ready: ${fname}. The user can download it from the button under your answer.`, emit: dlMarker(fname, content), ok: true, label: 'สร้างไฟล์ ' + fname };
  }
  if (name === 'artifact') return artPaid(st.plan) ? artifactTool(env, u, cid, a) : fail('artifacts need a paid plan', 'Artifact');
  if (name === 'run_python') {
    const code = String(a.code || ''); if (!code.trim()) return fail('code is empty', 'รัน Python');
    if (st.pyStop) return fail('one run_python per answer', 'รัน Python');
    if (code.length > 30e3) return fail('code is too long (30,000 characters max)', 'รัน Python');
    return { result: 'Sent to run in the browser. The output comes back in the next message; stop here.', emit: pyMarker(code), ok: true, label: 'รัน Python' };
  }
  return fail('unknown tool', name);
}
