// วนทำงานแบบ agent: ส่งงานให้โมเดล → โมเดลขอใช้เครื่องมือ → ทำในเครื่อง → ส่งผลกลับ → วนจนโมเดลตอบโดยไม่ขอเครื่องมือ
// แยกจาก Electron เพื่อทดสอบด้วย node ได้ (fetchImpl / callTool / onEvent ฉีดเข้ามา)
const TOOL_OUT_MAX = 60000;

async function runAgent({ base, key, model, messages, tools = [], callTool, onEvent = () => {}, signal, maxRounds = 40, fetchImpl = fetch }) {
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) throw new Error('หยุดแล้ว');
    const r = await fetchImpl(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages, stream: true, ...(tools.length ? { tools } : {}) }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status); }
    const msg = await readStream(r, onEvent); // สตรีม: ตัวหนังสือขึ้นทีละส่วนเหมือนเว็บ
    messages.push({ role: 'assistant', content: msg.content || null, ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'text_end' });
    if (!msg.tool_calls.length) return messages;
    const images = [];
    for (const tc of msg.tool_calls) {
      let args = {}; try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* อาร์กิวเมนต์เสีย: ส่งค่าว่าง ให้เครื่องมือแจ้ง error เอง */ }
      onEvent({ type: 'tool', name: tc.function?.name, args });
      let out;
      try { out = await callTool(tc.function?.name, args); } catch (e) { out = 'Error: ' + e.message; }
      if (out && typeof out === 'object') { images.push(...(out.images || [])); out = out.text ?? ''; } // MCP ที่ส่งรูปมา (เช่นภาพหน้าจอ Blender)
      out = String(out ?? ''); if (out.length > TOOL_OUT_MAX) out = out.slice(0, TOOL_OUT_MAX) + '\n…(ตัดเหลือ ' + TOOL_OUT_MAX + ' ตัวอักษร)';
      onEvent({ type: 'tool_result', name: tc.function?.name, ok: !out.startsWith('Error'), preview: out.slice(0, 400) });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: out || '(ไม่มีผลลัพธ์)' });
    }
    if (images.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'ภาพจากเครื่องมือด้านบน' }, ...images.slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))] }); // tool message ส่งรูปไม่ได้ จึงแนบเป็นข้อความถัดไป
  }
  onEvent({ type: 'text', text: '(หยุด: ทำงานครบจำนวนรอบสูงสุดแล้ว สั่งต่อได้)' });
  return messages;
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

module.exports = { runAgent, readStream, TOOL_OUT_MAX };
