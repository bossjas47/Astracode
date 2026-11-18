// วนทำงานแบบ agent (แบบ Claude Code): ส่งงานให้โมเดลผ่าน /v1 ของ AstraCode → โมเดลขอใช้เครื่องมือ → ทำในเครื่อง → ส่งผลกลับ → วนจนโมเดลตอบโดยไม่ขอเครื่องมือ
// แยกจาก Electron เพื่อทดสอบด้วย node ได้ (fetchImpl / callTool / onEvent ฉีดเข้ามา) · ค่าใช้งานหักลิมิต/Wallet ตามจริงที่ฝั่ง /v1
const TOOL_OUT_MAX = 60000;
const COMPACT_AT = 350000; // ตัวอักษรรวมของบทสนทนา (~100k token) เกินนี้ → ย่อส่วนเก่าก่อนรอบถัดไป

// inbox(): ข้อความที่ผู้ใช้พิมพ์แทรกระหว่างทำงาน (เข้าไปก่อนรอบถัดไป) · effort: ระดับการคิด (โชว์ Thinking ในแชต) · onStep(n): เลขขั้นตอนก่อนเรียกเครื่องมือ (ใช้ย้อนไฟล์)
async function runAgent({ base, key, model, messages, tools = [], callTool, onEvent = () => {}, signal, maxRounds = 80, fetchImpl = fetch, compactAt = COMPACT_AT, inbox = () => [], effort = null, onStep = () => {} }) {
  const post = (body) => fetchImpl(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) throw new Error('หยุดแล้ว');
    for (const m of inbox()) { messages.push({ role: 'user', content: m }); onEvent({ type: 'steer' }); }
    if (JSON.stringify(messages).length > compactAt) await compact({ post, model, messages, onEvent });
    const r = await post({ model, messages, stream: true, ...(tools.length ? { tools } : {}), ...(effort ? { reasoning_effort: effort } : {}) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status); }
    const msg = await readStream(r, onEvent); // สตรีม: ตัวหนังสือขึ้นทีละส่วนเหมือนเว็บ
    messages.push({ role: 'assistant', content: msg.content || null, ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'text_end' });
    if (!msg.tool_calls.length) return messages;
    const images = [];
    const run1 = async tc => {
      if (signal?.aborted) throw new Error('หยุดแล้ว');
      let args = {}; try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* อาร์กิวเมนต์เสีย: ส่งค่าว่าง ให้เครื่องมือแจ้ง error เอง */ }
      const step = onStep(tc) ?? null;
      onEvent({ type: 'tool', id: tc.id, name: tc.function?.name, args, step });
      let out;
      try { out = await callTool(tc.function?.name, args, tc); } catch (e) { out = 'Error: ' + e.message; }
      if (out && typeof out === 'object') { images.push(...(out.images || [])); out = out.text ?? ''; } // MCP / ภาพหน้าเว็บ ที่ส่งรูปมา
      out = String(out ?? ''); if (out.length > TOOL_OUT_MAX) out = out.slice(0, TOOL_OUT_MAX / 2) + '\n…(ตัดกลาง เหลือ ' + TOOL_OUT_MAX + ' ตัวอักษร)…\n' + out.slice(-TOOL_OUT_MAX / 2);
      onEvent({ type: 'tool_result', id: tc.id, name: tc.function?.name, ok: !out.startsWith('Error'), preview: out.slice(0, 3000) });
      return { role: 'tool', tool_call_id: tc.id, content: out || '(ไม่มีผลลัพธ์)' };
    };
    // ผู้ช่วยค้น (task) หลายตัวในรอบเดียว = ทำพร้อมกัน · เครื่องมืออื่นทำทีละตัวตามลำดับ
    if (msg.tool_calls.length > 1 && msg.tool_calls.every(tc => tc.function?.name === 'task')) messages.push(...await Promise.all(msg.tool_calls.map(run1)));
    else for (const tc of msg.tool_calls) messages.push(await run1(tc));
    if (images.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'ภาพจากเครื่องมือด้านบน' }, ...images.slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))] }); // tool message ส่งรูปไม่ได้ จึงแนบเป็นข้อความถัดไป
  }
  onEvent({ type: 'delta', text: `\n\n(หยุด: ทำงานครบ ${maxRounds} รอบแล้ว สั่ง "ทำต่อ" ได้)` });
  return messages;
}

// ย่อบทสนทนาเมื่อยาวเกิน: ให้โมเดลสรุปงานที่ทำไปแล้ว แล้วเก็บไว้แค่ system + สรุป + ข้อความล่าสุด (ไม่เริ่มด้วยผลเครื่องมือที่ไม่มีคำขอ)
async function compact({ post, model, messages, onEvent }) {
  const sys = messages[0]?.role === 'system' ? messages[0] : null, body = messages.slice(sys ? 1 : 0);
  let keep = body.slice(-8); while (keep.length && keep[0].role === 'tool') keep = keep.slice(1);
  const old = body.slice(0, body.length - keep.length); if (!old.length) return;
  const text = old.map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.tool_calls ?? '')}`.slice(0, 4000)).join('\n').slice(-200000);
  onEvent({ type: 'info', text: 'บทสนทนายาวแล้ว กำลังย่อส่วนเก่า…' });
  const r = await post({ model, stream: false, max_tokens: 2000, messages: [{ role: 'system', content: 'Summarize this agent work log so the agent can continue: the user goal, files read and changed (with paths), commands run and their results, decisions, and what is left to do. Bullet points, at most 400 words, same language as the user.' }, { role: 'user', content: text }] });
  const d = await r.json().catch(() => ({})), sum = d.choices?.[0]?.message?.content;
  if (!r.ok || !sum) return; // ย่อไม่สำเร็จ: ทำต่อแบบเดิม (โมเดลอาจตัดเองเมื่อเกิน context)
  messages.splice(0, messages.length, ...(sys ? [sys] : []), { role: 'user', content: '[สรุปงานก่อนหน้า]\n' + sum }, { role: 'assistant', content: 'รับทราบ ทำงานต่อจากสรุปนี้' }, ...keep);
}

// อ่าน SSE แบบ OpenAI: ต่อข้อความและ tool_calls ที่มาเป็นชิ้น ๆ (ชิ้นแรกมี id/name ชิ้นต่อไปมีแต่ arguments)
async function readStream(r, onEvent) {
  const out = { content: '', tool_calls: [] }, dec = new TextDecoder(); let buf = '';
  const take = line => {
    if (!line.startsWith('data:')) return; const data = line.slice(5).trim(); if (!data || data === '[DONE]') return;
    let e; try { e = JSON.parse(data); } catch { return; }
    if (e.error) throw new Error(e.error.message_th || e.error.message || 'error');
    if (e.usage) onEvent({ type: 'usage', usage: e.usage });
    const d = e.choices?.[0]?.delta || {};
    if (typeof d.content === 'string' && d.content) { out.content += d.content; onEvent({ type: 'delta', text: d.content }); }
    if (typeof d.reasoning_content === 'string' && d.reasoning_content) onEvent({ type: 'think', text: d.reasoning_content });
    for (const tc of d.tool_calls || []) {
      const i = tc.index ?? out.tool_calls.length, c = out.tool_calls[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (tc.id) c.id = tc.id; if (tc.function?.name) c.function.name += tc.function.name; if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
    }
  };
  for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } }
  take(buf.trim());
  out.tool_calls = out.tool_calls.filter(Boolean).map(c => ({ ...c, id: c.id || 'call_' + Math.random().toString(36).slice(2, 10) }));
  return out;
}

module.exports = { runAgent, readStream, compact, TOOL_OUT_MAX };
