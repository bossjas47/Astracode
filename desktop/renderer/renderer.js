// หน้าแอป: ข้อความทั้งหมดใส่ด้วย textContent (ไม่แปลงเป็น HTML) กันข้อความจาก AI/ไฟล์รันสคริปต์
const $ = s => document.querySelector(s), log = $('#log');
let busy = false;
const add = (cls, text) => { $('#hello')?.remove(); const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.append(d); log.scrollTop = log.scrollHeight; return d; };
const setBusy = b => { busy = b; $('#go').textContent = b ? 'หยุด' : 'ส่ง'; };
const short = a => JSON.stringify(a).slice(0, 160);

async function refresh() {
  const s = await astra.getSettings();
  $('#folder').textContent = '📁 ' + (s.workspace || 'เลือกโฟลเดอร์งาน');
  if (s.key) { $('#login')?.remove(); try { const ms = await astra.models(); $('#model').innerHTML = ''; for (const m of ms) $('#model').add(new Option(m, m, false, m === (s.model || 'claude-sonnet-5.5-eco'))); } catch (e) { add('err', 'โหลดรายชื่อโมเดลไม่ได้: ' + e.message); } }
  return s;
}
$('#login')?.addEventListener('click', async () => { add('info', 'เปิดเบราว์เซอร์ให้กดอนุญาต…'); try { await astra.login(); add('info', 'เข้าสู่ระบบแล้ว'); await refresh(); } catch (e) { add('err', e.message); } });
$('#folder').onclick = async () => { await astra.pickFolder(); refresh(); };
$('#model').onchange = e => astra.setSettings({ model: e.target.value });
$('#newchat').onclick = async () => { await astra.reset(); log.innerHTML = ''; add('info', 'เริ่มงานใหม่'); };
$('#gear').onclick = async () => { const s = await astra.getSettings(); $('#key').value = ''; $('#key').placeholder = s.key || 'sk-astra-…'; $('#autoWrite').checked = !!s.autoWrite; $('#autoRun').checked = !!s.autoRun; $('#mcp').value = s.mcp || ''; $('#dlg').showModal(); };
$('#setf').onsubmit = async e => {
  if (e.submitter?.value !== 'save') return;
  const s = { autoWrite: $('#autoWrite').checked, autoRun: $('#autoRun').checked, mcp: $('#mcp').value.trim() };
  if ($('#key').value.trim()) s.key = $('#key').value.trim();
  try { await astra.setSettings(s); add('info', 'บันทึกการตั้งค่าแล้ว'); refresh(); } catch (x) { add('err', 'บันทึกไม่ได้: ' + (/JSON/.test(x.message) ? 'MCP ไม่ใช่ JSON ที่ถูกต้อง' : x.message)); }
};
astra.onApprove(a => {
  $('#askt').textContent = a.name === 'run_command' ? 'รันคำสั่ง:\n' + a.args.command : 'เขียนไฟล์: ' + a.args.path + '\n\n' + String(a.args.content || '').slice(0, 3000);
  const done = ok => { $('#ask').close(); astra.reply(a.id, ok); };
  $('#yes').onclick = () => done(true); $('#no').onclick = () => done(false); $('#ask').showModal();
});
astra.onEvent(e => {
  if (e.type === 'text') add('ai', e.text);
  else if (e.type === 'tool') add('tool', '▶ ' + e.name + ' ' + short(e.args));
  else if (e.type === 'tool_result') add('tool ' + (e.ok ? 'ok' : 'bad'), (e.ok ? '✓ ' : '✗ ') + e.preview);
  else if (e.type === 'info') add('info', e.text);
  else if (e.type === 'done') setBusy(false);
});
$('#f').onsubmit = async e => {
  e.preventDefault();
  if (busy) return astra.stop();
  const t = $('#t').value.trim(); if (!t) return;
  $('#t').value = ''; add('user', t); setBusy(true);
  try { await astra.run(t); } catch (x) { add('err', x.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); setBusy(false); }
};
$('#t').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#f').requestSubmit(); } });
refresh();
