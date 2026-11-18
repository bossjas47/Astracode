// วนทำงานแบบ agent: ส่งงานให้โมเดล → โมเดลขอใช้เครื่องมือ → ทำในเครื่อง → ส่งผลกลับ → วนจนโมเดลตอบโดยไม่ขอเครื่องมือ
// แยกจาก Electron เพื่อทดสอบด้วย node ได้ (fetchImpl / callTool / onEvent ฉีดเข้ามา)
const TOOL_OUT_MAX = 60000;

async function runAgent({ base, key, model, messages, tools = [], callTool, onEvent = () => {}, signal, maxRounds = 40, fetchImpl = fetch }) {
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) throw new Error('หยุดแล้ว');
    const r = await fetchImpl(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages, ...(tools.length ? { tools } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status);
    const msg = d.choices?.[0]?.message || {};
    if (d.usage) onEvent({ type: 'usage', usage: d.usage });
    messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'text', text: msg.content });
    if (!msg.tool_calls?.length) return messages;
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

module.exports = { runAgent, TOOL_OUT_MAX };
