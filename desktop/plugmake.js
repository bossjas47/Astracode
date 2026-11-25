// Harness สร้างปลั๊กอินให้ตัวเอง: แพ็กสิ่งที่เพิ่งเรียนรู้/งานที่ทำซ้ำ เป็นสกิล (คำสอน AI) + คำสั่งลัด (+ MCP ในเครื่อง เฉพาะแอปคอม)
// สกิล/คำสั่งลัด = ข้อความล้วน ติดตั้งทันทีแล้วแจ้งผู้ใช้ (ลบได้) · MCP = รันโปรแกรมในเครื่อง ต้องให้ผู้ใช้กดยืนยันทุกครั้ง
// เก็บในบัญชี Kyber (ใช้ได้ทั้งแชต แอปคอม และ Harness บนคลาวด์) ผ่าน /v1/plugins
const MAKE_PLUGIN_TOOL = { type: 'function', function: { name: 'make_plugin', description: 'Save a reusable plugin for this user so future tasks can use it: skills (instructions the AI follows, e.g. the team\'s code review checklist, a report format, lessons from this task) and commands (shortcut prompts like /weekly-report). Use it when the user asks, or after finishing work they will clearly repeat (then tell them what you saved). Skills and commands install right away and the user can remove them; mcpServers (programs on the user\'s computer, desktop app only) always need the user\'s confirmation. Keep content concrete and short; never put secrets in it.', parameters: { type: 'object', properties: {
  name: { type: 'string', description: 'id: lowercase a-z 0-9 - (e.g. team-review)' }, title: { type: 'string' }, description: { type: 'string' },
  skills: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] } },
  commands: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'] } },
  mcpServers: { type: 'object', description: 'desktop app only: { "server-name": { "command": "npx", "args": ["-y", "some-mcp"] } }' } }, required: ['name', 'title'] } } };

const SECRET_RE = /\b(sk-[\w-]{12,}|ghp_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[\w-]{10,}|AIza[\w-]{30,})\b/;
// ตรวจและตัดให้อยู่ในขอบเขต · โยน error เป็นภาษาไทยให้โมเดลแก้แล้วเรียกใหม่
function normalizePlugin(a = {}) {
  const name = String(a.name || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(name)) throw new Error('name ต้องเป็น a-z 0-9 - ยาว 2-39 ตัว เช่น team-review');
  const skills = (Array.isArray(a.skills) ? a.skills : []).filter(s => s?.name && s?.content).slice(0, 6).map(s => ({ name: String(s.name).trim().slice(0, 60), description: String(s.description || '').trim().slice(0, 200), content: String(s.content).trim().slice(0, 6000) }));
  const commands = (Array.isArray(a.commands) ? a.commands : []).filter(c => c?.name && c?.text).slice(0, 8).map(c => ({ name: String(c.name).replace(/^\//, '').trim().toLowerCase().replace(/[^\w-]/g, '-').slice(0, 30), text: String(c.text).trim().slice(0, 6000) }));
  const mcpServers = a.mcpServers && typeof a.mcpServers === 'object' ? a.mcpServers : {};
  if (!skills.length && !commands.length && !Object.keys(mcpServers).length) throw new Error('ต้องมี skills, commands หรือ mcpServers อย่างน้อย 1 อย่าง');
  if (SECRET_RE.test(JSON.stringify({ skills, commands, mcpServers }))) throw new Error('ห้ามใส่ key/token ลับในปลั๊กอิน: ลบออกแล้วเรียกใหม่');
  return { name, title: String(a.title || name).trim().slice(0, 60), description: String(a.description || '').trim().slice(0, 300), skills, commands, mcpServers };
}
// ปลั๊กอินที่ AI สร้างไว้ → ส่วนของ system prompt (Harness ใช้ทุกงานถัดไป)
function pluginPrompt(plugins = []) {
  const ps = plugins.filter(p => p.skills?.length || p.commands?.length).slice(0, 10);
  if (!ps.length) return '';
  return '\n\nPlugins saved for this user (made in earlier tasks; follow their skills when relevant; the user may type their commands):\n' + ps.map(p => `### ${p.title || p.name}\n` + (p.skills || []).map(s => `- Skill "${s.name}": ${String(s.content).slice(0, 1500)}`).join('\n') + ((p.commands || []).length ? '\n- Commands: ' + p.commands.map(c => '/' + c.name).join(', ') : '')).join('\n\n').slice(0, 8000);
}
const pluginSummary = (p, extra = '') => `บันทึกปลั๊กอิน "${p.title}" แล้ว${p.skills.length ? ` · สกิล ${p.skills.map(s => s.name).join(', ')}` : ''}${p.commands.length ? ` · คำสั่งลัด ${p.commands.map(c => '/' + c.name).join(', ')}` : ''}${extra} (ผู้ใช้ดู/ลบได้ที่ Skills ในเว็บ Kyber) · Tell the user what you saved.`;

module.exports = { MAKE_PLUGIN_TOOL, normalizePlugin, pluginPrompt, pluginSummary };
