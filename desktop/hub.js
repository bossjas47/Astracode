// Connector แบบโหลดเท่าที่ใช้: Agent ได้เครื่องมือ "connectors" ตัวเดียวแทนการส่งคำอธิบายเครื่องมือของทุก Connector (สูงสุด 60 ตัว) ไปทุกรอบ
// list = ชื่อ + คำอธิบายสั้น · describe = พารามิเตอร์ของเครื่องมือที่จะใช้ · call = เรียกจริง (ผ่านเซิร์ฟเวอร์ Kyber: token ของ Connector ไม่ออกจากเซิร์ฟเวอร์)
// ใช้ร่วมกัน: แอปคอม (main.js) และ Harness บนคลาวด์ (container/server.js)
const CONNECTORS_TOOL = { type: 'function', function: { name: 'connectors', description: 'Use the apps the user connected to Kyber (Google Gmail/Drive/Sheets/Calendar, GitHub, Notion, Linear, Jira, Canva, Stripe, Supabase, ... whichever are connected). action=list shows the available connector tools; action=describe {name} shows one tool\'s parameters; action=call {name, args} runs it. List first, describe before the first call of a tool.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'describe', 'call'] }, name: { type: 'string' }, args: { type: 'object' } }, required: ['action'] } } };

function makeHub({ site, key, fetchImpl = fetch, ttl = 5 * 60e3 }) {
  let cache = { at: 0, tools: [] };
  const H = { authorization: 'Bearer ' + key };
  const tools = async () => {
    if (Date.now() - cache.at < ttl) return cache.tools;
    const r = await fetchImpl(site + '/v1/mcp/tools', { headers: H }).catch(() => null), d = r?.ok ? await r.json().catch(() => ({})) : {};
    cache = { at: Date.now(), tools: (d.tools || []).slice(0, 80) }; return cache.tools;
  };
  const short = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 110);
  const call = async (name, args) => {
    const r = await fetchImpl(site + '/v1/mcp/call', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ name, args: args && typeof args === 'object' ? args : {} }) }).catch(e => ({ ok: false, statusText: e.message }));
    const d = r.json ? await r.json().catch(() => ({})) : {};
    return d.text ?? ('Error: ' + (d.error?.message_th || d.error?.message || 'HTTP ' + (r.status || r.statusText)));
  };
  return {
    tools,
    async has() { return (await tools()).length > 0; },
    async run(a = {}) {
      const ts = await tools();
      if (!ts.length) return 'ยังไม่มี Connector ที่เชื่อมไว้ (ผู้ใช้เชื่อมได้ที่เมนู Connectors บนเว็บ Kyber)';
      if (a.action === 'list' || !a.action) return 'Connector tools (call describe before first use):\n' + ts.map(t => `- ${t.name}: ${short(t.description)}`).join('\n');
      const t = ts.find(x => x.name === a.name) || ts.find(x => x.name.endsWith('_' + a.name));
      if (!t) return `Error: ไม่พบเครื่องมือ "${String(a.name || '').slice(0, 80)}" ใช้ action=list ดูชื่อที่มี`;
      if (a.action === 'describe') return `${t.name}\n${String(t.description || '').slice(0, 1500)}\nparameters: ${JSON.stringify(t.parameters || {}).slice(0, 4000)}`;
      if (a.action === 'call') return call(t.name, a.args);
      return 'Error: action ต้องเป็น list, describe หรือ call';
    },
  };
}
module.exports = { CONNECTORS_TOOL, makeHub };
