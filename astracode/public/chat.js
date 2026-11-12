// AstraCode: หน้าแชต
let chat = { id: null, msgs: [], busy: false, ctrl: null, images: [], files: [], chats: [], folders: [], compare: false, cmp: [] };
// สลับแชตโดยไม่โหลดหน้าใหม่
function openChat(id) { if (chat.busy) chat.ctrl?.abort(); setUrl(id ? '/chat?id=' + id : '/chat'); chatView(id); }
addEventListener('popstate', () => { if (pageName() === 'chat') chatView(qs().get('id')); });
PAGES.chat = () => chatView(qs().get('id'));
function notice(u) {
  if (u.pct4h >= 100 || u.pctWeek >= 100)
    return `<div class="notice full">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)} <a class="btn blue sm" href="/plans">อัปเกรด</a></div>`;
  const p = Math.max(u.pct4h, u.pctWeek);
  return p >= 80 ? `<div class="notice hi">ใช้ลิมิตไปแล้ว ${p}% · <a href="/plans">อัปเกรดเพื่อใช้ได้มากขึ้น</a></div>` : '';
}
function setUsage(u) { me.usage = u; $('#lim').innerHTML = limHTML(u); $('#notice').innerHTML = notice(u); }
// "อัตโนมัติ": เซิร์ฟเวอร์เลือกโมเดลถูกหรือเก่งตามคำถาม (ประหยัดลิมิต)
const AUTO = () => ({ id: 'auto', name: 'อัตโนมัติ', effort: me.models.some(m => m.effort !== 'none') ? 'auto' : 'none', vision: me.models.some(m => m.vision) });
const curModel = () => $('#model')?.value === 'auto' ? AUTO() : me.models.find(m => m.id === +$('#model')?.value) || me.models[0];

async function chatView(id) {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  chat = { ...chat, id: id ? +id : null, msgs: id ? await api('/chats/' + id).catch(() => []) : [], busy: false, images: [], files: [], compare: false, cmp: [] };
  for (const m of chat.msgs) if (typeof m.sources === 'string') try { m.sources = JSON.parse(m.sources); } catch { m.sources = null; }
  const saved = localStorage.getItem('model'), opt = sel => me.models.map(m => `<option value="${m.id}" ${String(m.id) === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  app.innerHTML = `<div class="chat view"><aside class="side" id="side">
      <a class="logo" href="/" style="padding:8px 12px">AstraCode</a>
      <a class="btn out sm" href="/chat" data-chat="">+ แชตใหม่</a>
      <input id="search" placeholder="ค้นหาแชต" aria-label="ค้นหาแชต" style="min-height:36px;font-size:14px">
      <div class="list" id="list"></div>
      <button class="btn out sm" id="newf" style="margin:4px 12px">+ โฟลเดอร์</button>
      <nav class="side-links"><a href="/code">${ic('code')} Code</a><a href="/pricing">${ic('tag')} ราคา</a><a href="/blog">${ic('news')} บล็อก</a><a href="/developers">${ic('braces')} API</a><a href="/status">${ic('activity')} สถานะระบบ</a><a href="/support">${ic('mail')} ติดต่อเรา</a>${me.role === 'admin' ? `<a href="/admin">${ic('dash')} หลังบ้าน</a>` : ''}</nav>
      <a class="l muted" href="/plans" style="padding:8px 12px">${esc(me.plan.name)} · อัปเกรด</a>
      <a class="l muted" href="/account" style="padding:8px 12px">${esc(me.email)}</a></aside>
    <div class="main"><div class="bar"><button class="menu-btn" id="menu" aria-label="เมนู">${ic('menu')}</button>
      <div class="ctitle"><b id="ctl">แชตใหม่</b><small id="ctok"></small></div>
      <button class="lim" id="lim" aria-label="ลิมิตการใช้งาน"></button>
      <a class="icon-btn sm" href="/chat" data-new aria-label="แชตใหม่">${ic('newchat')}</a>
      <select id="model" hidden>${me.models.length > 1 ? `<option value="auto" ${saved === 'auto' || !saved ? 'selected' : ''}>อัตโนมัติ</option>` : ''}${opt(saved)}</select><select id="model2" hidden>${opt(localStorage.getItem('model2'))}</select>
      <select id="effort" hidden>${EFFORTS.map(([v]) => `<option value="${v}" ${v === (localStorage.getItem('effort') || '') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="msgs" id="msgs"></div>
      <div class="compose"><div id="notice">${notice(me.usage)}</div><div class="err" id="e"></div><div class="thumbs" id="thumbs"></div>
        <form id="f" class="cbox"><input type="file" id="file" multiple hidden>
          <textarea id="t" rows="1" placeholder="ถามอะไรก็ได้" aria-label="ข้อความ"></textarea>
          <div class="crow"><button type="button" class="cb" id="plus" aria-label="แนบไฟล์และเครื่องมือ">${ic('plus')}</button>
            <button type="button" class="cb pick" id="mdl" aria-haspopup="dialog"></button>
            <button type="button" class="cb pick" id="mdl2" aria-haspopup="dialog" hidden></button>
            <button type="button" class="cb pick" id="eff" aria-haspopup="dialog"></button>
            <span id="flags"></span>
            <button class="send" id="go" aria-label="ส่ง">${ic('up')}</button></div></form></div></div></div>`;
  const side = $('#side');
  side.addEventListener('click', e => { const a = e.target.closest('a[data-chat]'); if (!a) return; e.preventDefault(); openChat(+a.dataset.chat || null); });
  $('#menu').onclick = () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; side.parentElement.append(s); }; // ใส่ในกล่องเดียวกับเมนู ไม่งั้นเงาจะทับเมนู
  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };
  $('#effort').onchange = e => { localStorage.setItem('effort', e.target.value); modelUI(); };
  $('#model2').onchange = e => { localStorage.setItem('model2', e.target.value); modelUI(); };
  $('#mdl').onclick = () => modelSheet('#model');
  $('#mdl2').onclick = () => modelSheet('#model2');
  $('#eff').onclick = () => effortSheet('#effort');
  $('#plus').onclick = toolSheet;
  $('#lim').onclick = limitSheet;
  $('#flags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'web') toggleWeb(); if (f === 'cmp') toggleCompare(); };
  app.querySelector('[data-new]').onclick = e => { e.preventDefault(); openChat(null); };
  $('#newf').onclick = async () => { const name = prompt('ชื่อโฟลเดอร์'); if (name?.trim()) { await api('/folders', { method: 'POST', body: { name } }); loadSide(); } };
  $('#search').oninput = drawSide;
  const t = $('#t');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } };
  $('#f').onsubmit = e => { e.preventDefault(); chat.busy ? chat.ctrl?.abort() : send(); };
  $('#file').onchange = async e => { await addFiles([...e.target.files]); e.target.value = ''; };
  const comp = $('.compose'); // ลากไฟล์มาวาง / วางรูปจากคลิปบอร์ด
  comp.ondragover = e => { e.preventDefault(); comp.classList.add('drop'); };
  comp.ondragleave = () => comp.classList.remove('drop');
  comp.ondrop = e => { e.preventDefault(); comp.classList.remove('drop'); addFiles([...e.dataTransfer.files]); };
  t.onpaste = e => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
  $('#msgs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp-code')) copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.classList.contains('run-code')) showPreview(b.closest('.code').querySelector('code').textContent);
    if (b.dataset.mem != null) remember(chat.msgs[+b.dataset.mem], b);
    if (b.dataset.copy) copy(chat.msgs[+b.dataset.copy].content, b);
    if (b.dataset.regen != null) send({ regenerate: true });
    if (b.dataset.s != null) { t.value = SUGGEST[+b.dataset.s]; t.focus(); t.oninput(); }
    if (b.dataset.ask != null && !chat.busy) { t.value = b.dataset.ask; t.oninput(); send(); }
  };
  $('#lim').innerHTML = limHTML(me.usage); modelUI(); renderAll(); loadSide();
}
function modelUI() {
  const m = curModel(), m2 = me.models.find(x => x.id === +$('#model2').value);
  $('#mdl').innerHTML = `<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
  $('#mdl2').hidden = !chat.compare; $('#mdl2').innerHTML = `<span>vs ${esc(m2?.name || '')}</span>${ic('down', 'sm')}`;
  $('#eff').hidden = !m || m.effort === 'none';
  $('#eff').innerHTML = `${ic('sparkles', 'sm')}${EFFORT_INFO[$('#effort').value][0]}${ic('down', 'sm')}`;
  $('#flags').innerHTML = (localStorage.getItem('web') === '1' && site.search ? `<button type="button" class="flag" data-flag="web" aria-label="ปิดค้นเว็บ">${ic('globe', 'sm')}ค้นเว็บ${ic('x', 'sm')}</button>` : '')
    + (chat.compare ? `<button type="button" class="flag" data-flag="cmp" aria-label="ปิดโหมดเทียบ">${ic('compare', 'sm')}เทียบ${ic('x', 'sm')}</button>` : '');
  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); showErr('โมเดลนี้อ่านรูปไม่ได้ จึงเอารูปออกแล้ว'); }
}
function toolSheet() {
  const web = localStorage.getItem('web') === '1';
  sheet('เพิ่ม', optHTML('file', ic('clip') + 'แนบไฟล์หรือรูป', 'PDF, Word, Excel, โค้ด, รูป · สูงสุด 5 ไฟล์')
    + (site.image ? optHTML('img', ic('image') + 'สร้างรูป', 'พิมพ์สิ่งที่อยากได้ในช่องข้อความก่อน') : '')
    + (site.search ? optHTML('web', ic('globe') + 'ค้นเว็บก่อนตอบ', 'ได้ข้อมูลล่าสุดพร้อมแหล่งอ้างอิง', web) : '')
    + optHTML('cmp', ic('compare') + 'เทียบ 2 โมเดล', 'ถามครั้งเดียว ดูสองคำตอบคู่กัน · ไม่บันทึกแชต', chat.compare)
    + optHTML('exp', ic('download') + 'ส่งออกแชต', 'Markdown หรือ PDF'),
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); ({ file: () => $('#file').click(), img: genImage, web: toggleWeb, cmp: toggleCompare, exp: exportMenu })[b.dataset.v]();
    }));
}
function toggleWeb() { localStorage.setItem('web', localStorage.getItem('web') === '1' ? '0' : '1'); modelUI(); }
function toggleCompare() {
  if (chat.busy) return; chat.compare = !chat.compare;
  const m2 = $('#model2'); if (chat.compare && $('#model').value === 'auto') $('#model').value = me.models[0].id; if (chat.compare && m2.value === $('#model').value) m2.value = me.models.find(m => String(m.id) !== $('#model').value)?.id ?? m2.value; // ตั้งต้นให้ต่างจากตัวแรก
  modelUI(); renderAll();
}
async function loadSide() { [chat.chats, chat.folders] = await Promise.all([api('/chats').catch(() => []), api('/folders').catch(() => [])]); drawSide(); head(); }
// หัวแชต: ชื่อ + token รวมของแชตนี้
function head() {
  const ctl = $('#ctl'); if (!ctl) return;
  ctl.textContent = chat.compare ? 'เทียบ 2 โมเดล' : chat.chats.find(c => c.id === chat.id)?.title || 'แชตใหม่';
  const n = chat.compare ? 0 : chat.msgs.reduce((a, m) => a + (m.tin || 0) + (m.tout || 0), 0);
  $('#ctok').textContent = n ? `${kTok(n)} token` : '';
}
const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
function drawSide() {
  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;
  const item = c => `<div class="item ${c.id === chat.id ? 'on' : ''}" data-id="${c.id}"><a href="/chat?id=${c.id}" data-chat="${c.id}">${esc(c.title)}</a>
    <button data-mv="${c.id}" aria-label="ย้ายไปโฟลเดอร์">${ic('more')}</button><button data-ren="${c.id}" aria-label="เปลี่ยนชื่อ">${ic('pen')}</button><button data-del="${c.id}" aria-label="ลบ">${ic('trash')}</button></div>`;
  const shown = chat.chats.filter(c => c.title.toLowerCase().includes(q)), open = JSON.parse(localStorage.getItem('fopen') || '{}');
  list.innerHTML = chat.folders.map(f => { const cs = shown.filter(c => c.folder_id === f.id); return q && !cs.length ? '' : `<details class="folder" data-f="${f.id}" ${open[f.id] || q ? 'open' : ''}><summary><span>${ic('folder')} ${esc(f.name)}</span><small class="muted">${cs.length}</small><button data-fren="${f.id}" aria-label="เปลี่ยนชื่อโฟลเดอร์">${ic('pen')}</button><button data-fdel="${f.id}" aria-label="ลบโฟลเดอร์">${ic('trash')}</button></summary>${cs.map(item).join('') || '<p class="muted" style="padding:4px 12px;font-size:13px">ว่าง</p>'}</details>`; }).join('')
    + (shown.filter(c => !chat.folders.some(f => f.id === c.folder_id)).map(item).join('') || (chat.chats.length ? '' : '<p class="muted" style="padding:8px 12px">ยังไม่มีแชต</p>'));
  list.querySelectorAll('details.folder').forEach(d => d.ontoggle = () => { const o = JSON.parse(localStorage.getItem('fopen') || '{}'); o[d.dataset.f] = d.open; localStorage.setItem('fopen', JSON.stringify(o)); });
  list.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const d = b.dataset;
    if (d.del) { if (!confirm('ลบแชตนี้?')) return; await api('/chats/' + d.del, { method: 'DELETE' }); if (chat.id === +d.del) openChat(null); else loadSide(); }
    if (d.ren) { const c = chat.chats.find(x => x.id === +d.ren), title = prompt('ชื่อแชต', c.title); if (title?.trim()) { await api('/chats/' + c.id, { method: 'PUT', body: { title } }); loadSide(); } }
    if (d.fren) { const f = chat.folders.find(x => x.id === +d.fren), name = prompt('ชื่อโฟลเดอร์', f.name); if (name?.trim()) { await api('/folders/' + f.id, { method: 'PUT', body: { name } }); loadSide(); } }
    if (d.fdel) { if (!confirm('ลบโฟลเดอร์? แชตข้างในจะย้ายออกมา ไม่ถูกลบ')) return; await api('/folders/' + d.fdel, { method: 'DELETE' }); loadSide(); }
    if (d.mv) { // แทนปุ่มด้วยตัวเลือกโฟลเดอร์
      const c = chat.chats.find(x => x.id === +d.mv), row = b.closest('.item');
      if (!chat.folders.length) return alert('ยังไม่มีโฟลเดอร์ กด "+ โฟลเดอร์" ก่อน');
      row.insertAdjacentHTML('beforeend', `<select class="mvsel" aria-label="ย้ายไปโฟลเดอร์"><option value="">— ไม่มีโฟลเดอร์ —</option>${chat.folders.map(f => `<option value="${f.id}" ${c.folder_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`);
      const sel = row.querySelector('.mvsel'); sel.focus();
      sel.onchange = async () => { await api('/chats/' + c.id, { method: 'PUT', body: { folder_id: +sel.value || null } }); loadSide(); };
      sel.onblur = () => setTimeout(() => sel.remove(), 200);
    }
  };
}
async function remember(m, btn) {
  const text = prompt('ให้ AI จำเรื่องนี้ไว้ในทุกแชต (แก้ได้)', m.content.replace(FILE_RE, '').trim().slice(0, 300));
  if (!text?.trim()) return;
  try { await api('/memories', { method: 'POST', body: { text } }); btn.textContent = 'จำแล้ว ✓'; } catch (x) { alert(x.message); }
}
function exportMenu() {
  const title = chat.chats.find(c => c.id === chat.id)?.title || 'แชต AstraCode';
  if (!chat.msgs.length) return alert('ยังไม่มีข้อความให้ส่งออก');
  const kind = prompt('ส่งออกเป็น\n1 = Markdown (.md)\n2 = PDF (พิมพ์)', '1'); if (!kind) return;
  if (kind.trim() === '2') { document.body.classList.add('printing'); print(); setTimeout(() => document.body.classList.remove('printing'), 500); return; }
  const md_ = `# ${title}\n\n` + chat.msgs.map(m => m.role === 'user'
    ? `## คุณ\n\n${m.content.replace(FILE_RE, (_, n) => `\n📄 ${n}`).trim()}`
    : `## AI${m.model ? ` (${m.model})` : ''}\n\n${m.content}${m.sources?.length ? '\n\nแหล่งที่มา:\n' + m.sources.map(s => `- [${s.title}](${s.url})`).join('\n') : ''}`).join('\n\n---\n\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md_], { type: 'text/markdown' }));
  a.download = title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function genImage() {
  if (chat.busy) return;
  if (chat.compare) return showErr('ปิดโหมดเทียบก่อนสร้างรูป');
  const t = $('#t'), prompt_ = t.value.trim() || prompt('อยากได้รูปแบบไหน');
  if (!prompt_?.trim()) return;
  t.value = ''; t.style.height = 'auto'; $('#e').textContent = '';
  chat.msgs.push({ role: 'user', content: '🎨 ' + prompt_ }); appendMsg(chat.msgs.at(-1));
  const ai = { role: 'assistant', content: '', model: 'สร้างรูป', streaming: true }; chat.msgs.push(ai); appendMsg(ai);
  setBusy(true);
  try { const r = await api('/image', { method: 'POST', body: { prompt: prompt_, chat_id: chat.id } }); ai.content = `![${prompt_.slice(0, 80).replace(/[\[\]]/g, '')}](${r.src})`; setUsage(r.usage); }
  catch (x) { chat.msgs.splice(-2, 2); t.value = prompt_; showErr(x.message); }
  ai.streaming = false; setBusy(false); renderAll();
}

async function readFile(f) {
  const n = f.name.toLowerCase(); let text;
  if (f.size > RAW_MAX) throw new Error('ไฟล์ใหญ่เกิน 20MB');
  if (n.endsWith('.pdf')) {
    const pdf = await (await pdfLib()).getDocument({ data: await f.arrayBuffer(), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      pages.push(`--- หน้า ${i} ---\n` + c.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join(''));
    }
    text = pages.join('\n');
    if (!text.replace(/--- หน้า \d+ ---/g, '').trim()) throw new Error('PDF นี้เป็นภาพสแกน ไม่มีข้อความให้อ่าน ลองแคปหน้าจอแล้วแนบเป็นรูปแทน');
  } else if (n.endsWith('.docx')) {
    await lib('mammoth'); text = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
  } else if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) {
    await lib('xlsx'); const wb = XLSX.read(await f.arrayBuffer());
    text = wb.SheetNames.map(s => `--- ชีต ${s} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
  } else if (TEXT_EXT.test(n) || f.type.startsWith('text/') || /json|xml|javascript/.test(f.type) || !n.includes('.') || /^(dockerfile|makefile|\.\w+)$/.test(n)) {
    text = await f.text();
    if (text.includes('\u0000')) throw new Error('ไฟล์นี้ไม่ใช่ข้อความ');
  } else throw new Error('ยังไม่รองรับไฟล์ชนิดนี้ (รองรับ โค้ด/ข้อความ, PDF, Word, Excel, รูป)');
  if (text.length > FILE_MAX) text = text.slice(0, FILE_MAX) + `\n…(ไฟล์ยาวเกิน ตัดเหลือ ${FILE_MAX.toLocaleString()} ตัวอักษรแรก)`;
  return text;
}
async function addFiles(list) {
  $('#e').textContent = '';
  for (const f of list) {
    if (f.type.startsWith('image/') && !/\.svg$/i.test(f.name)) {
      if (!curModel()?.vision) { showErr('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลที่อ่านรูปได้ เช่น Claude'); continue; }
      if (chat.images.length >= 4) { showErr('แนบรูปได้สูงสุด 4 รูป'); continue; }
      try { // ย่อเป็น JPEG ไม่เกิน 1280px ก่อนส่ง
        const bmp = await createImageBitmap(f), s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        chat.images.push(c.toDataURL('image/jpeg', 0.85));
      } catch { showErr('อ่านรูปนี้ไม่ได้ ลองใช้ JPG หรือ PNG'); }
      continue;
    }
    if (chat.files.length >= FILES_MAX) { showErr(`แนบไฟล์ได้สูงสุด ${FILES_MAX} ไฟล์`); continue; }
    const item = { name: f.name.replace(/[\[\]\r\n]/g, '').slice(0, 120) || 'file', text: null };
    chat.files.push(item); drawThumbs();
    try { item.text = await readFile(f); } catch (x) { chat.files.splice(chat.files.indexOf(item), 1); showErr(`${item.name}: ${x.message}`); }
    drawThumbs();
  }
  drawThumbs();
}
function drawThumbs() {
  const box = $('#thumbs'); if (!box) return;
  box.innerHTML = chat.images.map((d, i) => `<div class="thumb"><img src="${d}" alt=""><button data-rm="${i}" aria-label="ลบรูป">${ic('x')}</button></div>`).join('')
    + chat.files.map((f, i) => `<div class="fchip">${ic('filetext')}<span>${esc(f.name)}</span><small>${f.text == null ? 'กำลังอ่าน...' : tok(f.text.length)}</small><button data-rmf="${i}" aria-label="ลบไฟล์">${ic('x')}</button></div>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { chat.images.splice(+b.dataset.rm, 1); drawThumbs(); });
  box.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { chat.files.splice(+b.dataset.rmf, 1); drawThumbs(); });
}
// รูปแบบเดียวกับที่เซิร์ฟเวอร์บันทึก: [[file:ชื่อ]] ... [[/file]]
function msgHTML(m, i, isNew) {
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    return `<div class="msg user ${isNew ? 'new' : ''}"><div class="b">${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}${m.content.startsWith('🎨 ') ? ic('image') + ' ' : ''}${esc(m.content.replace(FILE_RE, '').replace(/^🎨 /, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${ic('filetext')}<span>${esc(f[1])}</span><small>${tok(f[2].length)}</small></span>`).join('')}</div>` : ''}</div>
      ${i >= 0 && !m.content.startsWith('🎨') ? `<div class="acts"><button data-mem="${i}">จำไว้</button></div>` : ''}</div>`;
  }
  const last = i === chat.msgs.length - 1;
  const { text, asks } = askSplit(m.content, m.streaming);
  return `<div class="msg ai ${isNew ? 'new' : ''}">${thinkHTML(m)}<div class="b">${text ? md(text) : m.thinking || asks.length ? '' : DOTS}</div>${askHTML(asks, last && !m.streaming)}${sourcesHTML(m)}
    ${m.note ? `<div class="mnote">${esc(m.note)}</div>` : ''}
    ${m.streaming ? '' : `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${i < 0 ? '' : `<button data-copy="${i}">คัดลอก</button>${last && !chat.busy ? '<button data-regen>ตอบใหม่</button>' : ''}`}${tokHTML(m)}</div>`}</div>`;
}
// โมเดลบางตัว (เช่น GLM) พิมพ์คำถามแบบ JSON {"question":..,"options":[..]} ออกมาเป็นข้อความ → แสดงเป็นปุ่มให้เลือกแทน
function askSplit(content, streaming) {
  const s = String(content || ''), i = s.search(/(```(?:json)?\s*)?\{\s*"questions?"\s*:/);
  if (i < 0) return { text: s, asks: [] };
  const raw = s.slice(i).replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
  let o; try { o = JSON.parse(raw); } catch { return { text: streaming ? s.slice(0, i) : s, asks: [] }; } // ยังพิมพ์ไม่จบ: ซ่อนไว้ก่อน
  const list = (Array.isArray(o.questions) ? o.questions : [o]).filter(q => q && typeof q.question === 'string');
  if (!list.length) return { text: s, asks: [] };
  const label = x => typeof x === 'string' ? x : x?.label ?? x?.text ?? x?.value ?? x?.title ?? '';
  return { text: s.slice(0, i).trim(), asks: list.map(q => ({ q: q.question, opts: (q.options || q.choices || q.answers || []).map(label).filter(Boolean).slice(0, 8).map(String) })) };
}
const askHTML = (asks, live) => asks.map(a => `<div class="ask"><div class="ask-q">${inline(esc(a.q))}</div>${a.opts.length ? `<div class="ask-o">${a.opts.map(o => `<button data-ask="${esc(o)}" ${live ? '' : 'disabled'}>${esc(o)}</button>`).join('')}</div>` : ''}</div>`).join('');
// token ที่ใช้ตอบ + ลิมิตที่ใช้ไป (เฉพาะข้อความที่เพิ่งตอบ)
const tokHTML = m => m.tin || m.tout ? `<span class="tok" title="Input ${num(m.tin)} · Output ${num(m.tout)} token">↑${kTok(m.tin || 0)} ↓${kTok(m.tout || 0)}${m.pct != null ? ` · ลิมิต +${m.pct < 0.1 ? '<0.1' : m.pct.toFixed(1)}%` : ''}</span>` : '';
const sourcesHTML = m => m.sources?.length ? `<div class="srcs">${m.sources.map((x, k) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.url)}"><b>${k + 1}</b>${esc(x.title || new URL(x.url).hostname)}</a>`).join('')}</div>` : '';
function compareHTML() { // โหมดเทียบ: แต่ละรอบ = คำถาม + คำตอบ 2 คอลัมน์
  return chat.cmp.length ? chat.cmp.map((r, k) => `${msgHTML({ role: 'user', content: r.q }, -1)}<div class="cmp2" data-r="${k}">${r.a.map(m => `<div class="col"><div class="col-h">${esc(m.model)}</div>${msgHTML(m, -1)}</div>`).join('')}</div>`).join('')
    : `<div class="empty"><div class="stat">เทียบ 2 โมเดล</div><div>เลือกโมเดลสองตัวที่ด้านล่าง แล้วถามครั้งเดียว · โหมดนี้ไม่บันทึกแชต และใช้ลิมิตของทั้งสองโมเดล</div></div>`;
}
function renderAll() {
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = chat.compare ? compareHTML() : chat.msgs.length ? chat.msgs.map((m, i) => msgHTML(m, i)).join('')
    : `<div class="empty"><div class="stat">วันนี้ให้ช่วยอะไรดี</div><div>เลือกโมเดลที่มุมซ้ายล่าง แล้วพิมพ์ได้เลย</div>
       <div class="chips">${['อธิบายให้เข้าใจง่าย', 'ช่วยเขียนโค้ด', 'สรุปข้อความ', 'แปลภาษา'].map((s, i) => `<button data-s="${i}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight; head();
}
function appendMsg(m) {
  const box = $('#msgs'); if (!chat.msgs.length || chat.msgs.length === 1) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHTML(m, chat.msgs.length - 1, true));
  box.scrollTop = box.scrollHeight;
}
function updateLast() {
  const box = $('#msgs'), stick = nearBottom(box);
  paintStreaming(box.lastElementChild, chat.msgs.at(-1));
  if (stick) box.scrollTop = box.scrollHeight;
}
function showErr(msg, retry) {
  $('#e').innerHTML = esc(msg) + (retry ? ' <button class="btn out sm" id="retry">ลองใหม่</button>' : '');
  $('#retry')?.addEventListener('click', () => send({ regenerate: true }));
}
function setBusy(b) { chat.busy = b; const g = $('#go'); g.innerHTML = ic(b ? 'stop' : 'up'); g.setAttribute('aria-label', b ? 'หยุด' : 'ส่ง'); g.classList.toggle('stop', b); }

// อ่าน SSE จาก /api/chat แล้วเรียก onData ทีละ event
async function stream(body, signal, onData) {
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify(body) });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (r.status === 429 && 'pct4h' in d) setUsage(d);
    throw Object.assign(new Error(r.status === 429 && 'pct4h' in d ? (d.wallet > 0 ? 'ลิมิตเต็มแล้ว · เปิด "ใช้ Wallet เมื่อลิมิตเต็ม" ในหน้าบัญชีเพื่อใช้ต่อ' : 'ลิมิตเต็มแล้ว') : d.error || 'ผิดพลาด'), { status: r.status });
  }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (line.startsWith('data: ')) onData(JSON.parse(line.slice(6)));
    }
  }
}
const noteOf = (m, d) => { if (d.fallback) m.note = `โมเดลหลักขัดข้อง จึงตอบด้วย ${d.fallback}`; if (d.overflow) m.note = 'ลิมิตเต็ม ใช้เงินใน Wallet'; if (d.sources) m.sources = d.sources; };
async function compareSend() {
  const t = $('#t'), text = t.value.trim(), files = chat.files, imgs = chat.images;
  if (files.some(f => f.text == null)) return showErr('รออ่านไฟล์ให้เสร็จก่อน');
  if (!text && !files.length && !imgs.length) return;
  if ($('#model').value === 'auto') return showErr('โหมดเทียบต้องเลือกโมเดลเอง ไม่ใช่ "อัตโนมัติ"');
  const ids = [+$('#model').value, +$('#model2').value];
  if (ids[0] === ids[1]) return showErr('เลือกโมเดลสองตัวที่ต่างกัน');
  t.value = ''; t.style.height = 'auto'; chat.images = []; chat.files = []; drawThumbs(); $('#e').textContent = '';
  const round = { q: withFiles(text || 'อ่านไฟล์นี้', files), a: ids.map(id => ({ role: 'assistant', content: '', model: me.models.find(m => m.id === id).name, streaming: true })) };
  chat.cmp.push(round); renderAll(); setBusy(true); chat.ctrl = new AbortController();
  const k = chat.cmp.length - 1, web = localStorage.getItem('web') === '1' && !!site.search;
  await Promise.all(ids.map(async (id, j) => {
    const m = round.a[j], el = () => $(`.cmp2[data-r="${k}"] .col:nth-child(${j + 1}) .msg`); let raf = 0;
    const mm = me.models.find(x => x.id === id);
    try {
      await stream({ model_id: id, text, files, images: mm.vision ? imgs : [], ephemeral: true, search: web, effort: mm.effort !== 'none' ? $('#effort').value || null : null }, chat.ctrl.signal, d => {
        noteOf(m, d);
        if (d.t || d.th) { onStreamEvent(m, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const e = el(); if (e) paintStreaming(e, m); }); }
        if (d.error) m.content += `\n\n⚠ ${d.error}`;
        if (d.tok) { m.tin = d.tok.in; m.tout = d.tok.out; }
        if (d.done) setUsage(d);
      });
    } catch (x) { if (x.name !== 'AbortError') m.content += `⚠ ${x.message}`; }
    cancelAnimationFrame(raf); m.streaming = false;
  }));
  setBusy(false); renderAll();
}
async function send({ regenerate = false } = {}) {
  if (chat.busy) return;
  if (chat.compare && !regenerate) return compareSend();
  const t = $('#t'), text = regenerate ? '' : t.value.trim(), imgs = regenerate ? [] : chat.images, m = curModel();
  const files = regenerate ? [] : chat.files;
  if (files.some(f => f.text == null)) return showErr('รออ่านไฟล์ให้เสร็จก่อน');
  if (!regenerate && !text && !imgs.length && !files.length) return;
  $('#e').textContent = '';
  if (regenerate) { if (chat.msgs.at(-1)?.role === 'assistant') chat.msgs.pop(); }
  else {
    t.value = ''; t.style.height = 'auto'; chat.images = []; chat.files = []; drawThumbs();
    chat.msgs.push({ role: 'user', content: withFiles(text || (files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้'), files), imgs: imgs.length ? imgs : null });
    appendMsg(chat.msgs.at(-1));
  }
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };
  chat.msgs.push(ai);
  if (regenerate) renderAll(); else appendMsg(ai);
  setBusy(true); chat.ctrl = new AbortController();
  let started = false, streamErr = null, raf = 0;
  try {
    await stream({ chat_id: chat.id, model_id: m.id, text, images: imgs, files, regenerate, search: localStorage.getItem('web') === '1' && !!site.search,
      effort: m.effort !== 'none' ? $('#effort').value || null : null }, chat.ctrl.signal, d => {
      started = true;
      if (d.chat_id && !chat.id) { chat.id = d.chat_id; setUrl('/chat?id=' + d.chat_id, true); }
      if (d.model) ai.model = d.model;
      noteOf(ai, d); if (d.fallback) ai.model = d.fallback;
      if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); }
      if (d.error) streamErr = d.error;
      if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; }
      if (d.done) { ai.pct = Math.max(0, d.pctWeek - me.usage.pctWeek); setUsage(d); }
    });
  } catch (x) {
    if (x.name === 'AbortError') setTimeout(() => api('/me').then(d => { me = d; setUsage(d.usage); }).catch(() => {}), 1500);
    else if (!started && !regenerate) { // เซิร์ฟเวอร์ยังไม่บันทึก: คืนข้อความให้แก้แล้วส่งใหม่
      chat.msgs.splice(-2, 2); t.value = text; chat.images = imgs; chat.files = files; drawThumbs(); setBusy(false); renderAll(); showErr(x.message); return;
    } else streamErr = x.message;
  }
  cancelAnimationFrame(raf);
  ai.streaming = false;
  if (!ai.content && !ai.thinking) chat.msgs.pop();
  setBusy(false); renderAll();
  if (streamErr) showErr(streamErr, chat.msgs.at(-1)?.role === 'user');
  loadSide();
}
