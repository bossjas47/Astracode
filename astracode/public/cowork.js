// ---------- โหมด Cowork (แบบ Claude Cowork): สั่งงานออฟฟิศ AI ทำเองจนจบ ----------
// เว็บ: รันในเครื่องเสมือนบนคลาวด์ (/api/cowork) · แอป Desktop: รันในเครื่องลูกค้า ในโฟลเดอร์ที่เลือก (astraDesktop.agent)
// โมเดลล็อก Claude Sonnet 5.5 Eco ทั้งสองแบบ · ใช้ได้เฉพาะแพลนที่เปิด Cowork (Pro ขึ้นไป)
const CW_MODEL = 'Claude Sonnet 5.5 Eco';
const CW = { id: null, tasks: [], ev: [], files: [], status: 'idle', title: '', total: 0, poll: 0, pending: [], local: !!(window.astraDesktop?.agent), folder: null, busy: false };
const CW_TPL = [
  ['sheet', 'ปิดยอดรายเดือน', 'สรุปยอดขาย/รายจ่ายจากไฟล์ที่แนบ ทำ Excel สรุปรายเดือน (สูตรรวม กำไร % เติบโต + กราฟ) และรายงาน Word 1 หน้า'],
  ['filetext', 'ใบเสนอราคา', 'ทำใบเสนอราคาเป็น Excel (ราคาต่อหน่วย จำนวน รวม ส่วนลด VAT 7% ยอดสุทธิ เป็นสูตร) และ PDF ส่งลูกค้า จากรายการนี้:'],
  ['layers', 'สไลด์นำเสนอ', 'ทำสไลด์ PowerPoint 8-10 หน้าจากไฟล์ที่แนบ มีหน้าปก ตารางสรุปตัวเลข และหน้าสรุปข้อเสนอแนะ พร้อมโน้ตผู้พูด'],
  ['pie', 'วิเคราะห์ข้อมูล', 'วิเคราะห์ข้อมูลในไฟล์ที่แนบด้วย Python: แนวโน้ม กลุ่มขายดี/แย่ ค่าผิดปกติ ทำกราฟ PNG แล้วสรุปเป็นรายงาน Word'],
  ['globe', 'หาข้อมูลจากเว็บ', 'ค้นข้อมูลจากเว็บเรื่องต่อไปนี้ เปิดอ่านหลายแหล่ง แล้วสรุปเป็นรายงาน Word พร้อมตารางเปรียบเทียบและลิงก์อ้างอิง:'],
  ['folder', 'จัดไฟล์ในโฟลเดอร์', 'ดูไฟล์ทั้งหมดในโฟลเดอร์ที่เลือก จัดเข้าโฟลเดอร์ตามประเภท/ปี ตั้งชื่อให้เป็นระบบ (ถามก่อนลบหรือเขียนทับไฟล์) แล้วสรุปว่าย้ายอะไรไปไหน'],
];
const cwExt = p => (/\.(\w+)$/.exec(p)?.[1] || '').toLowerCase();
const cwIcon = p => ({ xlsx: 'sheet', csv: 'sheet', docx: 'filetext', pdf: 'filetext', pptx: 'layers', png: 'image', jpg: 'image', jpeg: 'image', md: 'filetext', txt: 'filetext', html: 'web' })[cwExt(p)] || 'file';
const cwOk = () => !!me?.plan?.cowork;
const cwModel = () => me.models.find(m => m.name === CW_MODEL);
const TOOL_TH = { bash: 'Running command', read_file: 'Reading file', write_file: 'Writing file', edit_file: 'Editing file', list_dir: 'Looking at folder', glob: 'Finding files', grep: 'Searching files', web_search: 'Searching the web', web_fetch: 'Reading web page', browser: 'Using browser', make_document: 'Creating document', read_document: 'Reading document', todo_write: 'Updating plan', ask_user: 'Asking you' };

// ---------- รายการงาน (แถบข้าง) ----------
const cwLocalTasks = () => { try { return JSON.parse(localStorage.getItem('cw_local') || '[]'); } catch { return []; } };
const cwSaveLocal = list => { try { localStorage.setItem('cw_local', JSON.stringify(list.slice(0, 40))); } catch { /* เต็ม: ข้าม */ } };
async function cwLoadTasks() {
  CW.tasks = CW.local ? cwLocalTasks().map(t => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at })) : await api('/cowork').catch(() => []);
  const box = $('#cwlist'); if (!box) return;
  box.innerHTML = CW.tasks.map(t => `<a href="/chat?mode=cowork&task=${t.id}" data-cwt="${t.id}" class="${t.id === CW.id ? 'on' : ''}">${t.status === 'running' ? '<span class="cw-dot"></span>' : ''}<span>${esc(t.title)}</span></a>`).join('') || '<p class="muted cw-none">ยังไม่มีงาน</p>';
}
function coworkSide() {
  return `<button type="button" class="cw-new" id="cwnew">${ic('plus', 'sm')}<span>New task</span></button>
    <div class="list cw-list" id="cwlist"></div>
    <p class="muted cw-note">${ic('lock', 'sm')} ${CW.local ? 'งานรันในเครื่องนี้ ในโฟลเดอร์ที่คุณเลือก' : 'งานรันในเครื่องเสมือนส่วนตัวบนคลาวด์ ปิดเว็บได้ เสร็จแล้วแจ้งเตือน'}</p>`;
}

// ---------- หน้า Cowork ----------
async function coworkView(id) {
  const host = $('#cwmain'); if (!host) return;
  clearTimeout(CW.poll); CW.id = id ? (CW.local ? String(id) : +id) : null; CW.ev = []; CW.files = []; CW.total = 0; CW.status = 'idle'; CW.title = '';
  host.innerHTML = `<div class="cw ${CW.id ? '' : 'cw-empty'}">
    <section class="cw-conv">
      <div class="bar cw-bar"><button class="menu-btn" id="cwmenu" aria-label="เมนู">${ic('menu')}</button><b id="cwtitle">${CW.id ? '' : 'Cowork'}</b><span class="cw-model">${ic('sparkles', 'sm')} ${CW_MODEL.replace('Claude ', '')}</span>${CW.local ? '' : `<button type="button" class="icon-btn sm ghost" id="cwsched" aria-label="ตั้งเวลาให้ทำซ้ำ" title="ตั้งเวลาให้ทำซ้ำ">${ic('clock', 'sm')}</button>`}<button type="button" class="icon-btn sm ghost cw-paneb" id="cwpane" aria-label="Progress และไฟล์">${ic('layers', 'sm')}</button></div>
      <div class="cw-msgs" id="cwmsgs"></div>
      <form class="cw-box" id="cwform">
        <div class="cw-chips" id="cwchips"></div>
        <textarea id="cwt" rows="1" placeholder="${CW.id ? 'Reply…' : 'อธิบายงานที่ต้องการ…'}"></textarea>
        <div class="cw-acts"><button type="button" class="icon-btn" id="cwatt" aria-label="แนบไฟล์" ${CW.local ? 'hidden' : ''}>${ic('plus')}</button><input type="file" id="cwfile" multiple hidden>
          ${CW.local ? `<button type="button" class="btn out sm" id="cwfold">${ic('folder', 'sm')} <span id="cwfoldn">เลือกโฟลเดอร์</span></button>` : ''}
          <span class="sp"></span><button class="send" id="cwgo" aria-label="ส่ง">${ic('up')}</button></div>
      </form>
      <p class="cw-foot muted">AI อาจผิดพลาดได้ ตรวจผลงานสำคัญก่อนใช้ทุกครั้ง</p>
    </section>
    <aside class="cw-side" id="cwside">
      <details open><summary>Progress</summary><div id="cwprog" class="cw-prog"><p class="muted">ขั้นตอนจะขึ้นที่นี่ระหว่างทำงาน</p></div></details>
      <details open><summary>Artifacts</summary><div id="cwart"><p class="muted">ไฟล์ที่ AI สร้างจะอยู่ที่นี่</p></div></details>
      <details open><summary>Context</summary><div id="cwctx"></div></details>
    </aside></div>`;
  $('#cwmenu').onclick = () => openSide?.();
  $('#cwpane').onclick = () => $('#cwside').classList.toggle('open');
  const sc = $('#cwsched'); if (sc) sc.onclick = cwSchedule;
  const t = $('#cwt'); t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; };
  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('#cwform').requestSubmit(); } };
  $('#cwform').onsubmit = e => { e.preventDefault(); CW.busy ? cwStop() : cwSend(); };
  if (!CW.local) { $('#cwatt').onclick = () => $('#cwfile').click(); $('#cwfile').onchange = e => { cwAttach([...e.target.files]); e.target.value = ''; }; }
  if (CW.local) { $('#cwfold').onclick = cwPickFolder; cwFolderName(); }
  host.ondragover = e => { if (!CW.local) e.preventDefault(); }; host.ondrop = e => { if (CW.local) return; e.preventDefault(); cwAttach([...e.dataTransfer.files]); };
  cwLoadTasks();
  if (!cwOk()) return cwLocked();
  if (!cwModel()) { $('#cwmsgs').innerHTML = `<div class="cw-hello"><h2>Cowork</h2><p class="muted">ยังไม่มีโมเดล ${CW_MODEL} ในแพลนของคุณ ติดต่อแอดมิน</p></div>`; return; }
  if (!CW.id) return cwHello();
  if (CW.local) { const L = cwLocalTasks().find(x => x.id === CW.id); if (!L) return cwHello(); CW.ev = L.events || []; CW.files = L.files || []; CW.title = L.title; CW.status = L.status === 'running' ? 'error' : L.status; cwPaint(); return; }
  await cwFetch(true);
}
function cwLocked() {
  $('#cwmsgs').innerHTML = `<div class="cw-hello"><div class="cw-logo">${ic('layers')}</div><h2>Cowork</h2><p>มอบงานให้ AI ทำเองจนจบ: อ่านไฟล์ ค้นเว็บ ใช้เบราว์เซอร์ รันโค้ด แล้วส่งผลเป็นไฟล์ Excel / Word / PowerPoint / PDF</p><p class="muted">ใช้ได้กับแพลน Pro ขึ้นไป</p><a class="btn blue" href="/plans">${ic('sparkles', 'sm')} อัปเกรดเพื่อใช้ Cowork</a></div>`;
  $('#cwform').hidden = true;
}
function cwHello() {
  $('#cwmsgs').innerHTML = `<div class="cw-hello"><div class="cw-logo">${ic('layers')}</div><h2>วันนี้ให้ช่วยทำงานอะไร?</h2><p class="muted">${CW.local ? 'AI ทำงานในโฟลเดอร์ที่คุณเลือกบนเครื่องนี้ ถามก่อนรันคำสั่งเสี่ยง' : 'แนบไฟล์แล้วสั่งงาน AI วางแผน ทำทีละขั้นในเครื่องเสมือนของคุณ และส่งผลเป็นไฟล์'}</p>
    <div class="cw-tpl">${CW_TPL.filter(x => CW.local || x[0] !== 'folder').map(([i, n, p], k) => `<button type="button" data-cwtpl="${k}">${ic(i, 'sm')}<b>${esc(n)}</b><small>${esc(p.slice(0, 60))}…</small></button>`).join('')}</div></div>`;
  $('#cwmsgs').onclick = e => { const b = e.target.closest('[data-cwtpl]'); if (b) { const t = $('#cwt'); t.value = CW_TPL[+b.dataset.cwtpl][2] + ' '; t.focus(); t.oninput(); } };
  cwPanels();
}

// ---------- ไฟล์แนบ (คลาวด์) ----------
async function cwAttach(list) {
  for (const f of list.slice(0, 20)) {
    if (f.size > 15e6) { toast(f.name + ' ใหญ่เกิน 15MB', 'bad'); continue; }
    const buf = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    CW.pending.push({ name: f.name, b64: btoa(s), size: f.size });
  }
  cwChips();
}
const cwChips = () => { const c = $('#cwchips'); if (c) c.innerHTML = CW.pending.map((f, i) => `<span class="fchip">${ic(cwIcon(f.name), 'sm')}<span>${esc(f.name)}</span><button type="button" data-cwrm="${i}" aria-label="เอาออก">${ic('x', 'sm')}</button></span>`).join(''); };
document.addEventListener('click', e => { const b = e.target.closest?.('[data-cwrm]'); if (b) { CW.pending.splice(+b.dataset.cwrm, 1); cwChips(); } });

// ---------- ส่งงาน / ข้อความต่อ ----------
async function cwSend() {
  const t = $('#cwt'), text = t.value.trim(); if (!text) return;
  if (CW.local) return cwLocalSend(text);
  const files = CW.pending.map(f => ({ name: f.name, b64: f.b64 })); cwBusy(true);
  try {
    if (!CW.id) { const r = await api('/cowork', { method: 'POST', body: { prompt: text, files } }); CW.id = r.id; setUrl('/chat?mode=cowork&task=' + r.id); }
    else await api('/cowork/' + CW.id + '/say', { method: 'POST', body: { prompt: text, files } });
    t.value = ''; t.oninput(); CW.pending = []; cwChips(); $('.cw')?.classList.remove('cw-empty'); cwLoadTasks(); await cwFetch(true);
  } catch (x) { cwBusy(false); toast(x.message, 'bad'); }
}
async function cwFetch(full) {
  if (!CW.id || CW.local) return;
  let d; try { d = await api(`/cowork/${CW.id}?from=${full ? 0 : CW.total}`); } catch (x) { if (full) $('#cwmsgs').innerHTML = `<p class="muted">${esc(x.message)}</p>`; return; }
  if (full) CW.ev = []; CW.ev.push(...d.events); CW.total = d.total; CW.files = d.files; CW.status = d.status; CW.title = d.title; CW.error = d.error;
  cwPaint(); cwBusy(d.status === 'running');
  clearTimeout(CW.poll); if (d.status === 'running') CW.poll = setTimeout(() => cwFetch(false), 2000); else cwLoadTasks();
}
async function cwStop() {
  if (CW.local) { window.astraDesktop.agent.stop('cw' + CW.id); return; }
  if (CW.id) await api('/cowork/' + CW.id + '/stop', { method: 'POST' }).catch(x => toast(x.message, 'bad'));
}
function cwBusy(on) { CW.busy = on; const b = $('#cwgo'); if (b) { b.innerHTML = ic(on ? 'stop' : 'up'); b.classList.toggle('stop', on); b.setAttribute('aria-label', on ? 'หยุด' : 'ส่ง'); } }

// ---------- วาดบทสนทนา + แผงขวา ----------
function cwPaint() {
  const box = $('#cwmsgs'); if (!box) return; const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  $('#cwtitle').textContent = CW.title || 'Cowork'; document.title = (CW.title || 'Cowork') + ' · ASTRACODE';
  const res = new Map(CW.ev.filter(e => e.type === 'tool_result').map(e => [e.id, e])); let h = '';
  for (const e of CW.ev) {
    if (e.type === 'user') h += `<div class="msg user"><div class="b">${esc(e.text)}</div></div>`;
    else if (e.type === 'text') h += `<div class="cw-say">${md(e.text)}</div>`;
    else if (e.type === 'think') h += `<details class="cw-think"><summary>${ic('bulb', 'sm')} Thinking</summary><p>${esc(e.text.slice(0, 3000))}</p></details>`;
    else if (e.type === 'tool' && e.name !== 'todo_write') { const r = res.get(e.id), st = r ? (r.ok === false ? 'bad' : 'ok') : CW.status === 'running' ? 'run' : 'bad';
      h += `<details class="cw-tool ${st}"><summary>${st === 'run' ? '<span class="cw-spin"></span>' : ic(st === 'ok' ? 'check' : 'x', 'sm')} ${esc(TOOL_TH[e.name] || e.name)} <small>${esc(cwArg(e))}</small></summary><div class="cw-req"><small class="muted">Request</small><pre>${esc(JSON.stringify(e.args || {}, null, 2).slice(0, 4000))}</pre>${r?.preview ? `<small class="muted">Result</small><pre>${esc(String(r.preview).slice(0, 3000))}</pre>` : ''}</div></details>`; }
    else if (e.type === 'shot') h += `<figure class="cw-shot"><img src="/api/cowork/${CW.id}/file?view=1&path=${encodeURIComponent(e.path)}" alt="ภาพหน้าจอเบราว์เซอร์" loading="lazy"><figcaption class="muted">${esc(e.path)}</figcaption></figure>`;
    else if (e.type === 'info') h += `<p class="cw-info muted">${esc(e.text)}</p>`;
    else if (e.type === 'ask') { const done = CW.ev.some(x => x.type === 'answered' && x.id === e.id) || CW.status !== 'running';
      h += `<div class="cw-ask ${done ? 'done' : ''}" data-askid="${esc(e.id || '')}"><b>${ic('msg', 'sm')} ${esc(e.question)}</b>${done ? '' : `<div>${(e.options || []).map(o => `<button type="button" class="btn out sm" data-cwans="${esc(o)}">${esc(o)}</button>`).join('')}</div><form class="row" data-cwansf><input placeholder="หรือพิมพ์คำตอบ…" maxlength="2000"><button class="btn blue sm">ตอบ</button></form>`}</div>`; }
    else if (e.type === 'answered') h += `<div class="msg user"><div class="b">${esc(e.text)}</div></div>`;
    else if (e.type === 'end' && e.status !== 'done') h += `<p class="cw-info bad">${esc(e.error || 'หยุดแล้ว')}</p>`;
  }
  if (CW.status === 'running') h += `<p class="cw-working"><span class="cw-spin"></span> กำลังทำงาน… ${CW.local ? '' : 'ปิดหน้านี้ได้ เสร็จแล้วแจ้งเตือน'}</p>`;
  box.innerHTML = h || '<p class="muted">กำลังเริ่ม…</p>'; box.onclick = null; renderRich?.(box);
  if (stick) box.scrollTop = box.scrollHeight;
  cwPanels();
}
const cwArg = e => { const a = e.args || {}; return String(a.command || a.path || a.url || a.query || a.action && (a.action + ' ' + (a.url || a.target || '')) || '').slice(0, 70); };
function cwPanels() {
  const todos = CW.ev.filter(e => e.type === 'todos').at(-1)?.todos || [];
  $('#cwprog').innerHTML = todos.length ? `<div class="cw-dots">${todos.map(t => `<span class="${t.status}" title="${esc(t.content)}">${t.status === 'completed' ? ic('check', 'sm') : ''}</span>`).join('')}</div><ol class="cw-steps">${todos.map(t => `<li class="${t.status}">${esc(t.content)}</li>`).join('')}</ol>` : '<p class="muted">ขั้นตอนจะขึ้นที่นี่ระหว่างทำงาน</p>';
  const mine = CW.files.filter(f => f.by !== 'user' && !/(^|\/)\./.test(f.path)), inputs = CW.files.filter(f => f.by === 'user');
  const link = f => CW.local ? `<button type="button" class="cw-file" data-cwopen="${esc(f.path)}">` : `<a class="cw-file" href="/api/cowork/${CW.id}/file?path=${encodeURIComponent(f.path)}${/^(png|jpe?g|pdf)$/.test(cwExt(f.path)) ? '&view=1" target="_blank' : ''}" rel="noopener">`;
  const row = f => `${link(f)}${ic(cwIcon(f.path), 'sm')}<span>${esc(f.path.split('/').pop())}</span>${f.size ? `<small>${f.size > 1e6 ? (f.size / 1e6).toFixed(1) + 'MB' : Math.ceil(f.size / 1e3) + 'KB'}</small>` : ''}${CW.local ? '</button>' : '</a>'}`;
  $('#cwart').innerHTML = mine.length ? mine.map(row).join('') : '<p class="muted">ไฟล์ที่ AI สร้างจะอยู่ที่นี่</p>';
  const conn = CW.ev.filter(e => e.type === 'info' && /^Connectors: /.test(e.text)).at(-1)?.text.slice(12).split(', ') || [];
  $('#cwctx').innerHTML = `<small class="muted">${CW.local ? 'Selected folder' : 'Workspace'}</small><div class="cw-file static">${ic(CW.local ? 'folder' : 'server', 'sm')}<span>${esc(CW.local ? CW.folder || 'ยังไม่ได้เลือก' : 'เครื่องเสมือนบนคลาวด์')}</span></div>
    ${CW.local && window.astraDesktop?.screen ? `<button type="button" class="cw-file" id="cwscreen">${ic('smartphone', 'sm')}<span>ควบคุมหน้าจอ: ${CW.screen ? 'เปิด' : 'ปิด'}</span><small>Windows</small></button>` : ''}
    <small class="muted">Connectors</small><div class="cw-file static">${ic('globe', 'sm')}<span>Web search</span></div>${CW.local ? '' : `<div class="cw-file static">${ic('web', 'sm')}<span>Browser</span></div><div class="cw-file static">${ic('image', 'sm')}<span>Image &amp; OCR</span></div>`}${conn.map(c => `<div class="cw-file static">${ic('server', 'sm')}<span>${esc(c)}</span></div>`).join('')}${CW.local ? '' : `<button type="button" class="cw-file" data-cwconn>${ic('plus', 'sm')}<span>เชื่อม Gmail / Drive / อื่น ๆ</span></button>`}
    ${inputs.length ? `<small class="muted">Working files</small>${inputs.map(row).join('')}` : ''}`;
}
document.addEventListener('click', e => {
  const o = e.target.closest?.('[data-cwopen]'); if (o && window.astraDesktop?.agent) window.astraDesktop.agent.open('chat', o.dataset.cwopen).catch(x => toast(String(x.message), 'bad'));
  const a = e.target.closest?.('[data-cwans]'); if (a) cwAnswer(a.closest('[data-askid]')?.dataset.askid, a.dataset.cwans);
  if (e.target.closest?.('[data-cwconn]')) openConnectors?.();
  if (e.target.closest?.('#cwscreen')) cwScreen();
  const n = e.target.closest?.('#cwnew'); if (n) { closeSide?.(); CW.pending = []; setUrl('/chat?mode=cowork'); coworkView(null); }
  const t = e.target.closest?.('[data-cwt]'); if (t) { e.preventDefault(); closeSide?.(); setUrl('/chat?mode=cowork&task=' + t.dataset.cwt); coworkView(t.dataset.cwt); }
});

// ---------- แอป Desktop: รันในเครื่อง ในโฟลเดอร์ที่เลือก (ช่อง "chat") ----------
async function cwFolderName() { try { CW.screen = !!await window.astraDesktop.screen?.state(); } catch { CW.screen = false; } try { const i = await window.astraDesktop.fs.linked('chat'); CW.folder = i?.name || null; } catch { CW.folder = null; } const n = $('#cwfoldn'); if (n) n.textContent = CW.folder || 'เลือกโฟลเดอร์'; cwPanels(); }
async function cwPickFolder() { try { const i = await window.astraDesktop.fs.link('chat'); if (i) { CW.folder = i.name; toast('ใช้โฟลเดอร์ ' + i.name, 'ok'); } } catch (x) { toast(x.message, 'bad'); } cwFolderName(); }
let cwSub = null;
async function cwLocalSend(text) {
  const D = window.astraDesktop, m = cwModel(); if (!m) return;
  if (!CW.folder) { await cwPickFolder(); if (!CW.folder) return; }
  try { if (await D.agent.needKey()) await D.agent.setKey((await api('/keys', { method: 'POST', body: { name: 'Desktop Agent' } })).key); } catch (x) { return toast('สร้าง API key ให้แอปไม่ได้: ' + x.message, 'bad'); }
  const list = cwLocalTasks(); let L = CW.id ? list.find(x => x.id === CW.id) : null;
  if (!L) { L = { id: Date.now().toString(36), title: text.replace(/\s+/g, ' ').slice(0, 80), events: [], files: [], status: 'idle', updated_at: Date.now() }; list.unshift(L); CW.id = L.id; setUrl('/chat?mode=cowork&task=' + L.id); }
  const history = L.events.filter(e => e.type === 'user' || e.type === 'text').map(e => ({ role: e.type === 'user' ? 'user' : 'assistant', content: e.text })).slice(-30);
  L.events.push({ type: 'user', text, t: Date.now() }); L.status = 'running'; CW.ev = L.events; CW.files = L.files; CW.title = L.title; CW.status = 'running'; cwSaveLocal(list);
  const t = $('#cwt'); t.value = ''; t.oninput(); $('.cw')?.classList.remove('cw-empty'); cwBusy(true); cwPaint(); cwLoadTasks();
  const sid = 'cw' + L.id; let buf = '', raf = 0; const paint = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; cwPaint(); }); };
  const flush = () => { if (buf.trim()) L.events.push({ type: 'text', text: buf.trim(), t: Date.now() }); buf = ''; };
  cwSub?.(); cwSub = D.agent.onEvent(d => {
    if (d.sid !== sid) return;
    if (d.type === 'delta') { buf += d.text; const last = L.events.at(-1); if (last?.live) last.text = buf; else L.events.push({ type: 'text', text: buf, live: true }); }
    else { const last = L.events.at(-1); if (last?.live) { delete last.live; last.text = buf.trim(); buf = ''; } }
    if (d.type === 'tool') L.events.push({ type: 'tool', id: d.id, name: d.name, args: d.args });
    if (d.type === 'tool_result') L.events.push({ type: 'tool_result', id: d.id, ok: d.ok, preview: d.preview });
    if (d.type === 'todos') L.events.push({ type: 'todos', todos: d.todos });
    if (d.type === 'info') L.events.push({ type: 'info', text: d.text });
    if (d.type === 'ask') { CW.askId = d.id; L.events.push({ type: 'ask', id: d.id, question: d.question, options: d.options }); }
    if (d.type === 'answered') L.events.push({ type: 'answered', id: CW.askId || '', text: d.text });
    if (d.type === 'done' || d.type === 'error') { L.files = [...new Set([...(d.outputs || []), ...(d.changed || [])])].map(p => ({ path: p, by: 'ai' })); CW.files = L.files; if (d.type === 'error') L.events.push({ type: 'end', status: 'error', error: d.text }); }
    paint();
  });
  try { await D.agent.run({ sid, chatId: null, text, images: [], style: 'work', model: vslug(m), subModel: null, mode: 'edits', history, slot: 'chat' }); }
  catch (x) { flush(); L.events.push({ type: 'end', status: 'error', error: String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); }
  cwSub?.(); cwSub = null; const last = L.events.at(-1); if (last?.live) delete last.live;
  L.status = L.events.at(-1)?.type === 'end' ? 'error' : 'done'; L.updated_at = Date.now(); L.events = L.events.slice(-400); cwSaveLocal(list);
  CW.status = L.status; cwBusy(false); cwPaint(); cwLoadTasks(); D.notify?.('Cowork เสร็จแล้ว', L.title);
}

// ตั้งเวลาให้ Cowork ทำงานนี้ซ้ำ (เช่น ทุกวันจันทร์ 8 โมง ดึงยอดขายทำรายงานส่งอีเมล) · ใช้ระบบงานตามเวลาเดิม (cowork=1)
function cwSchedule() {
  const first = CW.ev.find(e => e.type === 'user')?.text || $('#cwt').value.trim();
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === 8 ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  sheet('ตั้งเวลาให้ Cowork ทำซ้ำ', `<form class="sheet-form" id="cwsf">
    <label>ชื่องาน<input name="title" maxlength="60" required value="${esc((CW.title || first).slice(0, 60))}"></label>
    <label>คำสั่ง (AI ทำในเครื่องเสมือนใหม่ทุกรอบ)<textarea name="prompt" rows="5" maxlength="4000" required>${esc(first)}</textarea></label>
    <div class="row"><label style="flex:1">เวลา (ไทย)<select name="hour">${hours}</select></label>
    <label style="flex:1">ทุก<select name="days"><option value="daily">วัน</option><option value="weekdays">วันทำงาน</option><option value="mon">วันจันทร์</option><option value="tue">วันอังคาร</option><option value="wed">วันพุธ</option><option value="thu">วันพฤหัส</option><option value="fri">วันศุกร์</option><option value="sat">วันเสาร์</option><option value="sun">วันอาทิตย์</option></select></label></div>
    <small class="muted">เสร็จแล้วแจ้งเตือน · ถ้าเชื่อม Gmail ไว้ สั่งในคำสั่งได้ เช่น "ส่งไฟล์ให้ boss@company.com" · ตั้งได้รวมกับงานตามเวลาอื่นไม่เกิน 3 งาน</small>
    <button class="btn blue">${ic('clock', 'sm')} บันทึก</button></form>`, (d, close) => {
    d.querySelector('#cwsf').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target);
      try { await api('/schedules', { method: 'POST', body: { title: f.get('title'), prompt: f.get('prompt'), hour: +f.get('hour'), days: f.get('days'), cowork: 1, search: true } }); close(); toast('ตั้งเวลาแล้ว · ดู/แก้ได้ที่เมนู Scheduled tasks', 'ok'); } catch (x) { toast(x.message, 'bad'); } };
  });
}

// ตอบคำถามที่ AI ถามระหว่างทำงาน (ปุ่มตัวเลือก หรือพิมพ์เอง)
async function cwAnswer(askId, text) {
  if (!text) return;
  if (CW.local) { if (CW.askId) { window.astraDesktop.agent.answer('cw' + CW.id, CW.askId, text); CW.askId = null; } return; }
  try { await api(`/cowork/${CW.id}/answer`, { method: 'POST', body: { ask_id: askId, text } }); CW.ev.push({ type: 'answered', id: askId, text }); cwPaint(); } catch (x) { toast(x.message, 'bad'); }
}
document.addEventListener('submit', e => { const f = e.target.closest?.('[data-cwansf]'); if (!f) return; e.preventDefault(); cwAnswer(f.closest('[data-askid]')?.dataset.askid, f.querySelector('input').value.trim()); });

// แอป Desktop (Windows): ให้ AI ควบคุมเมาส์/คีย์บอร์ด/ดูหน้าจอได้ในงาน Cowork (แอปถามยืนยันทุกครั้งที่เปิด)
async function cwScreen() {
  const S = window.astraDesktop?.screen; if (!S) return;
  try { if (CW.screen) await S.off(); else await S.on(); CW.screen = !!await S.state(); toast(CW.screen ? 'เปิดให้ AI ควบคุมหน้าจอแล้ว (ใช้ได้เฉพาะ Windows)' : 'ปิดการควบคุมหน้าจอแล้ว', 'ok'); }
  catch (x) { toast(String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad'); }
  cwPanels();
}
