// AstraCode: โหมด Code ใช้ตัวแปรกลางจาก app.js
PAGES.code = () => qs().get('p') ? codeView(qs().get('p')) : codeHome();
const IDE = {
  pid: null, name: '', files: new Map(), states: new Map(), open: [], active: null, view: null,
  dirty: new Set(), saveT: null, status: '', closed: new Set(),
  chatId: null, msgs: [], busy: false, ctrl: null, 
  worker: null, frame: null, logs: [], runTab: 'out', pane: 'code', agent: localStorage.getItem('agent') === '1', skills: JSON.parse(localStorage.getItem('cskills') || '[]'), mcps: JSON.parse(localStorage.getItem('cmcps') || '[]'),
};
const TREE_RE = /\n\n\[ไฟล์ทั้งหมดในโปรเจกต์\]\n[\s\S]*?(?=\n\n\[\[file:|$)/;
const CHECK_RE = /\n\n\[คำสั่งตรวจ\]\n[\s\S]*?(?=\n\n\[ไฟล์ทั้งหมดในโปรเจกต์\]|\n\n\[\[file:|$)/;
const IGNORE = /(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store|dist|build)(\/|$)/;
const kb = n => n > 1024 ? Math.round(n / 102.4) / 10 + ' KB' : n + ' B';

// ---------- หน้ารวมโปรเจกต์ ----------
async function codeHome() {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const list = await api('/projects');
  page(nav() + `<div class="wrap"><section class="hero code-hero" style="padding:20px 0 8px"><h1>Code</h1>
    <p>เขียนโค้ดบนมือถือ มี AI ช่วยแก้ไฟล์ รัน HTML, JavaScript และ Python ได้ในเบราว์เซอร์</p></section>
    <form class="card row" id="nf"><input name="name" placeholder="ชื่อโปรเจกต์ใหม่" maxlength="60" required style="flex:1;min-width:180px">
      <select name="template" style="width:auto;min-width:160px"><option value="starter">เว็บเริ่มต้น (HTML/CSS/JS/Py)</option><option value="tailwind">HTML + Tailwind CSS</option><option value="react">React (ไม่ต้องติดตั้ง)</option><option value="node">Node.js (package.json)</option><option value="python">Python</option><option value="empty">โปรเจกต์ว่าง</option></select>
      <button class="btn blue">+ New project</button></form>
    <details class="card clone"><summary><b>${ic('branch')} Clone จาก GitHub</b> <span class="muted">ดึง repo มาเป็นโปรเจกต์ใหม่</span></summary>
      <form id="cf2" class="form2" style="margin-top:12px"><div><label>Repo</label><input name="repo" placeholder="owner/repo หรือลิงก์ GitHub" required></div>
      <div><label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main"></div><div style="align-self:end"><button class="btn blue">Clone</button></div></form>
      <p class="muted" id="cmsg">ต้องเชื่อม GitHub ก่อน (ปุ่ม Git ในโปรเจกต์ไหนก็ได้)</p></details>
    <div class="err" id="e"></div>
    ${list.length > 4 ? '<input id="psearch" type="search" placeholder="ค้นหาโปรเจกต์" aria-label="ค้นหาโปรเจกต์" autocomplete="off" style="margin-bottom:12px">' : ''}
    <div class="grid" id="pgrid">${list.map(p => `<div class="tile proj" data-name="${esc(p.name.toLowerCase())}"><a href="/code?p=${p.id}" style="color:inherit"><div style="font:600 19px var(--display)">${esc(p.name)}</div>
      <div class="muted">${p.files} ไฟล์ · ${kb(p.size)} · แก้ล่าสุด ${when(p.updated_at)}</div></a>
      <div class="row" style="margin-top:8px"><a class="btn blue sm" href="/code?p=${p.id}">Open</a><button class="btn out sm" data-ren="${p.id}">Rename</button><button class="btn red sm" data-del="${p.id}">Delete</button></div></div>`).join('')
      || '<p class="muted" style="text-align:center">ยังไม่มีโปรเจกต์ สร้างอันแรกได้เลย ระบบจะใส่ไฟล์ตัวอย่างให้</p>'}</div>${footer()}</div>`);
  $('#psearch')?.addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#pgrid .tile.proj').forEach(t => t.hidden = !!q && !t.dataset.name.includes(q)); });
  $('#nf').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    try { const r = await api('/projects', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); go('/code?p=' + r.id); }
    catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; }
  };
  $('#cf2').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), msg = $('#cmsg'); e.submitter.disabled = true;
    let id;
    try {
      msg.textContent = 'กำลังสร้างโปรเจกต์...';
      id = (await api('/projects', { method: 'POST', body: { name: f.repo.replace(/^https:\/\/github\.com\//, '').split('/').pop().replace(/\.git$/, '') || 'repo', empty: true } })).id;
      msg.textContent = 'กำลังเชื่อม repo...'; await api(`/projects/${id}/github`, { method: 'POST', body: f });
      msg.textContent = 'กำลังดึงไฟล์จาก GitHub...'; await api(`/projects/${id}/github/pull`, { method: 'POST', body: {} });
      go('/code?p=' + id);
    } catch (x) { msg.innerHTML = `<span class="bad">${esc(x.message)}</span>`; e.submitter.disabled = false; if (id) api('/projects/' + id, { method: 'DELETE' }); }
  };
  app.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
    const p = list.find(x => x.id === +b.dataset.ren), name = await promptSheet('ตั้งชื่อโปรเจกต์ใหม่', p.name, { title: 'เปลี่ยนชื่อโปรเจกต์' });
    if (name?.trim()) { await api('/projects/' + p.id, { method: 'PUT', body: { name } }); codeHome(); }
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!await confirmSheet('ลบโปรเจกต์นี้? ไฟล์และแชตทั้งหมดจะหายถาวร', { title: 'ลบโปรเจกต์', ok: 'Delete forever', danger: true })) return;
    await api('/projects/' + b.dataset.del, { method: 'DELETE' }); codeHome();
  });
}

// ---------- ตัวแก้โค้ด ----------
const edTheme = () => CM.EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent' }, // พื้นหลังไล่เฉดอยู่ที่ .ide-editor
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 'var(--cfs, 12px)', lineHeight: '1.6', fontVariantLigatures: 'contextual' },
  '.cm-content': { paddingTop: '10px', paddingBottom: '40px', caretColor: '#7dcfff' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#7dcfff', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'rgba(255,255,255,.025)', borderRight: '1px solid rgba(255,255,255,.06)', color: '#4f5a78' },
  '.cm-activeLine': { backgroundColor: 'rgba(125,207,255,.05)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(125,207,255,.08)', color: '#9fb4e8' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(122,162,247,.28)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(122,162,247,.22)', outline: '1px solid rgba(122,162,247,.5)' },
  '.cm-panels': { backgroundColor: '#1a1f2e', color: '#e6ebff' },
  '.cm-ghost': { color: '#5f6b8c', cursor: 'pointer' },
}, { dark: true });
const wrap = new CM.Compartment(), ghostC = new CM.Compartment();
// เติมโค้ดอัตโนมัติ: AI เดาต่อจากเคอร์เซอร์ (Tab หรือแตะข้อความเทาเพื่อรับ)
const ghostExt = () => localStorage.getItem('ghost') === '0' || window.DEMO ? [] : CM.ghost((prefix, suffix) => api('/complete', { method: 'POST', body: { prefix, suffix, path: IDE.active } }).then(r => r.text));
function extensions(path) {
  return [
    edTheme(), CM.basicSetup, CM.oneDark, CM.lang(path), CM.EditorView.contentAttributes.of({ 'aria-label': 'ตัวแก้ไขโค้ด', 'aria-multiline': 'true' }), // ธีมของเราไว้ก่อน oneDark เพื่อให้ชนะ
    wrap.of(localStorage.getItem('wrap') === '0' ? [] : CM.EditorView.lineWrapping), ghostC.of(ghostExt()),
    CM.keymap.of([CM.indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { saveNow(); return true; } }]),
    CM.EditorView.updateListener.of(u => { if (u.docChanged) markDirty(path); if (u.selectionSet || u.docChanged) { const b = $('#selai'); if (b) b.hidden = u.state.selection.main.empty; } }),
  ];
}
function stateFor(path) {
  let s = IDE.states.get(path);
  if (!s) { s = CM.EditorState.create({ doc: isImg(path) ? '' : IDE.files.get(path) ?? '', extensions: extensions(path) }); IDE.states.set(path, s); }
  return s;
}
// รูปในโปรเจกต์ = ไฟล์ข้อความที่เนื้อหาเป็น data URL (ย่อด้วยเบราว์เซอร์ก่อนเก็บ ไม่เกิน ~420KB) · ไม่ sync ขึ้น GitHub
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i, isImg = p => IMG_RE.test(p), isDataImg = t => typeof t === 'string' && t.startsWith('data:image/');
const content = p => isImg(p) ? IDE.files.get(p) ?? '' : (p === IDE.active ? IDE.view.state : IDE.states.get(p))?.doc.toString() ?? IDE.files.get(p) ?? '';
const readDataUrl = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('อ่านรูปไม่ได้')); r.readAsDataURL(f); });
// ย่อรูป (ด้านยาวสุด 1024px) เป็น JPEG ให้ไม่เกิน limit ตัวอักษรของ data URL · รับ data URL หรือ Blob
function shrinkImage(src, { max = 1024, limit = 420000 } = {}) {
  return new Promise((ok, no) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src), img = new Image();
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      let w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k)), q = .86, out;
      const draw = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); return c; };
      let c = draw(); out = c.toDataURL('image/jpeg', q);
      while (out.length > limit && q > .45) { q -= .1; out = c.toDataURL('image/jpeg', q); }
      while (out.length > limit && w > 64) { w = Math.round(w * .75); h = Math.round(h * .75); c = draw(); out = c.toDataURL('image/jpeg', .7); }
      ok({ data: out, w, h });
    };
    img.onerror = () => no(new Error('อ่านรูปไม่ได้'));
    img.src = url;
  });
}
// ไฟล์รูปที่ผู้ใช้อัปโหลด → { path, content } (เก็บในโฟลเดอร์ images/ · เล็กพออยู่แล้วคงรูปเดิม ไม่งั้นย่อเป็น .jpg)
async function imageFile(f) {
  const d = await readDataUrl(f), base = f.name.replace(/^.*\//, '');
  if (d.length <= 420000) return { path: 'images/' + base, content: d };
  const r = await shrinkImage(d); return { path: 'images/' + base.replace(/\.\w+$/, '') + '.jpg', content: r.data };
}
const has = p => IDE.files.has(p);

function markDirty(path) {
  IDE.dirty.add(path); setStatus('ยังไม่บันทึก');
  clearTimeout(IDE.saveT); IDE.saveT = setTimeout(saveNow, 1200);
}
async function saveNow() {
  clearTimeout(IDE.saveT);
  const paths = [...IDE.dirty]; if (!paths.length) return;
  setStatus('กำลังบันทึก...');
  for (const p of paths) {
    const c = content(p);
    try { await api(`/projects/${IDE.pid}/file`, { method: 'PUT', body: { path: p, content: c } }); IDE.files.set(p, c); if (content(p) === c) IDE.dirty.delete(p); }
    catch (x) { setStatus('บันทึกไม่ได้: ' + x.message, true); return; }
  }
  setStatus(IDE.dirty.size ? 'ยังไม่บันทึก' : 'บันทึกแล้ว ✓'); drawTabs(); syntaxCheck();
}
function setStatus(t, bad) { IDE.status = t; const s = $('#ide-status'); if (s) { s.textContent = t; s.classList.toggle('bad', !!bad); } }

// ไฟล์ที่เปิดล่าสุด (เรียงใหม่สุดก่อน เก็บต่อโปรเจกต์ในเครื่อง) แสดงเป็นชิปบนต้นไม้ไฟล์
function drawRecent() {
  const el = $('#recent'); if (!el) return;
  const list = (IDE.recent || []).filter(has).slice(0, 5);
  el.innerHTML = (IDE.filter || '').trim() || list.length < 2 ? '' : `<span class="muted">เปิดล่าสุด</span>${list.map(p => `<button type="button" data-file="${esc(p)}" class="${p === IDE.active ? 'on' : ''}">${esc(p.split('/').pop())}</button>`).join('')}`;
  el.querySelectorAll('[data-file]').forEach(b => b.onclick = () => openFile(b.dataset.file));
}
function openFile(path) {
  if (!has(path)) return;
  IDE.recent = [path, ...(IDE.recent || []).filter(x => x !== path)].slice(0, 8);
  try { localStorage.setItem('recent:' + IDE.pid, JSON.stringify(IDE.recent)); } catch { /* ไม่มีที่เก็บ ไม่เป็นไร */ }
  if (IDE.active && IDE.view) IDE.states.set(IDE.active, IDE.view.state);
  IDE.view.setState(stateFor(path)); showImg(path);
  IDE.active = path;
  if (!IDE.open.includes(path)) IDE.open.push(path);
  drawTabs(); drawTree(); drawRecent(); setPane('code'); drawer(false);
}
// ดูรูปในโปรเจกต์ (แทนตัวแก้ไขข้อความ)
function showImg(path) {
  const v = $('#imgview'), main = $('.ide-main'); if (!v || !main) return;
  const d = path && isImg(path) ? IDE.files.get(path) : '', on = isDataImg(d);
  v.hidden = !on; main.classList.toggle('isimg', on); if (!on) return;
  v.innerHTML = `<div class="iv-box"><img alt="${esc(path)}" src="${d}"><div class="iv-meta"><b>${esc(path)}</b><span class="muted" id="ivsz">~${Math.round(d.length / 1365)}KB</span></div>
    <p class="muted" style="margin:0 0 10px;font-size:12.5px">ใช้ในโค้ดด้วย &lt;img src="${esc(path)}"&gt; หรือ url(${esc(path)})</p><div class="row"><button class="btn out sm" id="ivcp">Copy path</button><button class="btn red sm" id="ivdel">Delete</button></div></div>`;
  const im = v.querySelector('img'); im.onload = () => { const z = $('#ivsz'); if (z) z.textContent = `${im.naturalWidth}×${im.naturalHeight}px · ~${Math.round(d.length / 1365)}KB`; };
  $('#ivcp').onclick = e => copy(path, e.target);
  $('#ivdel').onclick = async () => {
    if (!await confirmSheet(`ลบ ${path} ?`, { title: 'ยืนยันการลบ', ok: 'Delete', danger: true })) return;
    try { await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' }); dropFile(path); refresh(); } catch (x) { setStatus(x.message, true); }
  };
}
function closeTab(path) {
  IDE.open = IDE.open.filter(p => p !== path);
  if (IDE.active === path) { const n = IDE.open.at(-1) || [...IDE.files.keys()][0]; IDE.active = null; if (n) openFile(n); else { IDE.view.setState(CM.EditorState.create({ doc: '' })); showImg(null); } }
  drawTabs();
}
function drawTabs() {
  const t = $('#tabs'); if (!t) return;
  t.innerHTML = IDE.open.map(p => `<div class="tab ${p === IDE.active ? 'on' : ''}" data-open="${esc(p)}"><span>${IDE.dirty.has(p) ? '● ' : ''}${esc(p.split('/').pop())}</span><button data-close="${esc(p)}" aria-label="ปิด">${ic('x')}</button></div>`).join('');
  t.querySelectorAll('[data-open]').forEach(x => x.onclick = e => { if (!e.target.dataset.close) openFile(x.dataset.open); });
  t.querySelectorAll('[data-close]').forEach(x => x.onclick = () => closeTab(x.dataset.close));
  t.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- ต้นไม้ไฟล์ ----------
function drawTree() {
  const root = {};
  const q = (IDE.filter || '').trim().toLowerCase();
  for (const p of [...IDE.files.keys()].sort().filter(x => !q || x.toLowerCase().includes(q))) { let n = root; const parts = p.split('/'); parts.forEach((x, i) => { if (i === parts.length - 1) (n.__f ||= []).push(p); else n = n[x] ||= {}; }); }
  const row = (depth, inner) => `<div class="trow" style="padding-left:${8 + depth * 14}px">${inner}</div>`;
  const walk = (n, prefix, depth) => Object.keys(n).filter(k => k !== '__f').sort().map(d => {
    const full = prefix + d + '/', closed = !q && IDE.closed.has(full);
    return row(depth, `<button class="tname" data-fold="${esc(full)}">${ic(closed ? 'right' : 'down', 'sm')}${ic('folder')} ${esc(d)}</button><button class="tmore" data-dmenu="${esc(full)}" aria-label="ตัวเลือกโฟลเดอร์">${ic('more')}</button>`)
      + (closed ? '' : walk(n[d], full, depth + 1));
  }).join('') + (n.__f || []).map(p => row(depth, `<button class="tname ${p === IDE.active ? 'on' : ''}" data-file="${esc(p)}">${icon(p)} ${esc(p.split('/').pop())}</button><button class="tmore" data-fmenu="${esc(p)}" aria-label="ตัวเลือกไฟล์">${ic('more')}</button>`)).join('');
  $('#tree').innerHTML = walk(root, '', 0) || `<p class="muted" style="padding:12px">${q ? 'ไม่พบไฟล์ที่ตรงกับคำค้น' : 'ยังไม่มีไฟล์'}</p>`;
  $('#tree').querySelectorAll('[data-file]').forEach(b => b.onclick = () => openFile(b.dataset.file));
  $('#tree').querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { const f = b.dataset.fold; IDE.closed.has(f) ? IDE.closed.delete(f) : IDE.closed.add(f); drawTree(); });
  $('#tree').querySelectorAll('[data-fmenu]').forEach(b => b.onclick = () => menu(b, b.dataset.fmenu, false));
  $('#tree').querySelectorAll('[data-dmenu]').forEach(b => b.onclick = () => menu(b, b.dataset.dmenu, true));
}
const icon = p => { const e = p.split('.').pop().toLowerCase(), k = { html: 'web', htm: 'web', css: 'palette', js: 'filecode', mjs: 'filecode', ts: 'filecode', tsx: 'filecode', jsx: 'filecode', py: 'py', json: 'braces2', md: 'filetext', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', ico: 'image', avif: 'image' }[e] || 'file'; return ic(k, 'f-' + e); };
function menu(btn, path, folder) {
  const open = document.querySelector('.tmenu'), same = open && open.previousElementSibling === btn.closest('.trow');
  open?.remove(); if (same) return; // กดซ้ำที่ปุ่มเดิม = ปิดเมนู
  const m = document.createElement('div'); m.className = 'tmenu';
  m.innerHTML = folder ? '<button data-a="new">+ ไฟล์ในโฟลเดอร์นี้</button><button data-a="nfold">+ โฟลเดอร์ย่อย</button><button data-a="ren">Rename folder</button><button data-a="del" class="bad">Delete folder</button>'
    : `<button data-a="ren">Rename / Move</button><button data-a="dup">Duplicate</button><button data-a="del" class="bad">Delete</button>`;
  btn.closest('.trow').after(m);
  m.onclick = async e => {
    const a = e.target.dataset.a; if (!a) return; m.remove();
    try {
      if (a === 'new') return newFile(path);
      if (a === 'nfold') return newFolder(path);
      if (a === 'dup') { const to = await promptSheet('ชื่อไฟล์สำเนา', path.replace(/(\.\w+)?$/, '-copy$1'), { title: 'ทำสำเนาไฟล์', ok: 'Create' }); if (to) await writeFiles([{ path: to, content: content(path) }]); return; }
      if (a === 'del') {
        if (!await confirmSheet(`ลบ ${path} ?`, { title: 'ยืนยันการลบ', ok: 'Delete', danger: true })) return;
        await saveNow();
        await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        for (const p of [...IDE.files.keys()]) if (folder ? p.startsWith(path) : p === path) dropFile(p);
        return refresh();
      }
      if (a === 'ren') {
        const to = await promptSheet(folder ? 'ชื่อโฟลเดอร์ใหม่ (พาธเต็ม)' : 'ชื่อไฟล์ใหม่ (ใส่ / เพื่อย้ายเข้าโฟลเดอร์)', folder ? path.slice(0, -1) : path, { title: 'เปลี่ยนชื่อ / ย้าย' });
        if (!to || to === path) return;
        await saveNow();
        await api(`/projects/${IDE.pid}/rename`, { method: 'POST', body: { from: path, to: folder ? to.replace(/\/?$/, '/') : to } });
        return reload(folder ? null : to);
      }
    } catch (x) { setStatus(x.message, true); }
  };
}
function dropFile(p) { IDE.files.delete(p); IDE.states.delete(p); IDE.dirty.delete(p); if (IDE.open.includes(p)) closeTab(p); }
async function newFile(dir = '') {
  const p = await promptSheet('ระบุพาธและชื่อไฟล์ (เช่น src/app.js)', dir, { title: 'สร้างไฟล์ใหม่', ok: 'Create' }); if (!p || p.endsWith('/')) return;
  if (has(p)) return openFile(p);
  try { await writeFiles([{ path: p, content: '' }]); openFile(p); } catch (x) { setStatus(x.message, true); }
}
// โฟลเดอร์ในโปรเจกต์ = พาธของไฟล์ จึงสร้างโฟลเดอร์ว่างด้วยไฟล์ .gitkeep (git เก็บโฟลเดอร์ว่างไม่ได้ ใช้วิธีเดียวกัน)
async function newFolder(parent = '') {
  const n = await promptSheet('ชื่อโฟลเดอร์ (เช่น src หรือ src/utils)', parent, { title: 'สร้างโฟลเดอร์ใหม่', ok: 'Create' }); if (!n) return;
  const dir = n.trim().replace(/^\/+|\/+$/g, '');
  if (!dir || /\.\.|\/\/|[\\<>:"|?*\x00-\x1f]/.test(dir)) return setStatus('ชื่อโฟลเดอร์ไม่ถูกต้อง', true);
  if ([...IDE.files.keys()].some(p => p.startsWith(dir + '/'))) { IDE.closed.delete(dir + '/'); return drawTree(); }
  try { await writeFiles([{ path: dir + '/.gitkeep', content: '' }]); IDE.closed.delete(dir + '/'); drawTree(); } catch (x) { setStatus(x.message, true); }
}
async function writeFiles(files) { // นำเข้าหลายไฟล์ แล้วอัปเดตหน้าจอ
  await api(`/projects/${IDE.pid}/import`, { method: 'POST', body: { files } });
  for (const f of files) {
    IDE.files.set(f.path, f.content);
    const s = IDE.states.get(f.path);
    if (f.path === IDE.active) IDE.view.dispatch({ changes: { from: 0, to: IDE.view.state.doc.length, insert: f.content } });
    else if (s) IDE.states.set(f.path, s.update({ changes: { from: 0, to: s.doc.length, insert: f.content } }).state);
    IDE.dirty.delete(f.path);
  }
  refresh(); setStatus('บันทึกแล้ว ✓');
}
async function reload(openPath) {
  const d = await api('/projects/' + IDE.pid);
  IDE.files = new Map(d.files.map(f => [f.path, f.content])); IDE.states.clear(); IDE.dirty.clear();
  IDE.open = IDE.open.filter(has);
  const a = openPath && has(openPath) ? openPath : has(IDE.active) ? IDE.active : IDE.open[0] || [...IDE.files.keys()][0];
  IDE.active = null; if (a) openFile(a); refresh();
}
function refresh() { drawTree(); drawTabs(); }

// ---------- อัปโหลด / zip ----------
async function readText(f) {
  if (f.size > 500e3) throw new Error(`${f.name} ใหญ่เกิน 500KB`);
  const t = await f.text(); if (t.includes('\u0000')) throw new Error(`${f.name} ไม่ใช่ไฟล์ข้อความ`);
  return t;
}
async function uploadFiles(list) {
  const out = [], skip = [];
  for (const f of list) try { out.push(/^image\/(?!svg)/.test(f.type) || IMG_RE.test(f.name) ? await imageFile(f) : { path: f.name, content: await readText(f) }); } catch (x) { skip.push(x.message); }
  if (out.length) await writeFiles(out);
  setStatus(`อัปโหลด ${out.length} ไฟล์` + (skip.length ? ` · ข้าม: ${skip.join(', ')}` : ''), skip.length > 0);
}
async function importZip(file) {
  setStatus('กำลังแตก zip...');
  await lib('jszip');
  const z = await JSZip.loadAsync(file), out = [], skip = [];
  const entries = Object.values(z.files).filter(e => !e.dir && !IGNORE.test(e.name));
  const roots = new Set(entries.map(e => e.name.split('/')[0]));
  const strip = roots.size === 1 && entries.every(e => e.name.includes('/')); // zip ที่มีโฟลเดอร์ครอบชั้นเดียว
  for (const e of entries) {
    const path = strip ? e.name.split('/').slice(1).join('/') : e.name;
    if (IMG_RE.test(path)) { // รูปใน zip: เก็บเป็น data URL (ย่อถ้าใหญ่)
      try { const ext = path.split('.').pop().toLowerCase(), mime = { jpg: 'jpeg', jpeg: 'jpeg', svg: 'svg+xml', ico: 'x-icon' }[ext] || ext; let d = `data:image/${mime};base64,` + await e.async('base64'); if (d.length > 420000) d = (await shrinkImage(d)).data; out.push({ path, content: d }); } catch { skip.push(path); }
      continue;
    }
    const t = await e.async('string');
    if (t.length > 500e3 || t.includes('\u0000')) { skip.push(path); continue; }
    out.push({ path, content: t });
  }
  if (!out.length) return setStatus('ไม่พบไฟล์ข้อความใน zip', true);
  await writeFiles(out);
  setStatus(`นำเข้า ${out.length} ไฟล์` + (skip.length ? ` · ข้าม ${skip.length} ไฟล์ (รูป/ไบนารี/ใหญ่เกิน)` : ''));
}
async function exportZip() {
  await saveNow(); await lib('jszip');
  const z = new JSZip(); for (const p of IDE.files.keys()) isImg(p) && isDataImg(content(p)) ? z.file(p, content(p).split(',')[1], { base64: true }) : z.file(p, content(p));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await z.generateAsync({ type: 'blob' })); a.download = IDE.name.replace(/[^\wก-๙-]+/g, '_') + '.zip';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- รันโค้ด ----------
// หน้าตัวอย่างรันใน iframe แบบ sandbox (ไม่มี allow-same-origin) จึงเรียก localStorage/sessionStorage แล้วเกิด SecurityError ทำให้สคริปต์ของเกมล้มตั้งแต่ต้นและปุ่มไม่ทำงาน · ใส่ตัวแทนที่เก็บในหน่วยความจำ (หายเมื่อรันใหม่)
const STORAGE_SHIM = `<script>try{localStorage.getItem('_')}catch(e){for(const n of['localStorage','sessionStorage']){const m=new Map();Object.defineProperty(window,n,{configurable:true,value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:k=>{m.delete(k)},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}})}}<\/script>`;
const CAPTURE = `<script>(()=>{const s=(t,a)=>parent.postMessage({log:t,msg:a.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x)}catch{return String(x)}}).join(' ')},'*');for(const k of ['log','info','warn','error'])console[k]=(...a)=>s(k,a);addEventListener('error',e=>s('error',[e.message+(e.lineno?' (บรรทัด '+e.lineno+')':'')]));addEventListener('unhandledrejection',e=>s('error',[String(e.reason)]));addEventListener('message',e=>{if(e.source!==parent||!e.data||!e.data.shot)return;const done=(img,err)=>parent.postMessage({shotResult:img||null,err:err||null,text:(document.body&&document.body.innerText||'').slice(0,3000)},'*');const go=()=>{const b=document.body,bg=getComputedStyle(b).backgroundColor;htmlToImage.toJpeg(b,{quality:.8,pixelRatio:Math.min(2,devicePixelRatio||1),skipFonts:true,width:Math.max(b.scrollWidth,innerWidth),height:Math.min(Math.max(b.scrollHeight,innerHeight),2400),backgroundColor:bg==='rgba(0, 0, 0, 0)'?'#fff':bg}).then(img=>done(img)).catch(x=>done(null,String(x&&x.message||x)))};if(window.htmlToImage)return go();const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';sc.integrity='sha384-Tha/42qsYmpYmQ07pX+nJzkKumO0BzKJxK/uzVc7xyBQxVCUgQBhQIG8L7vXK+9C';sc.crossOrigin='anonymous';sc.onload=go;sc.onerror=()=>done(null,'โหลดตัวจับภาพไม่ได้');document.head.appendChild(sc)})})()<\/script>`;
function log(type, msg) {
  IDE.logs.push({ type, msg }); if (IDE.logs.length > 500) IDE.logs.shift();
  const c = $('#console'); if (!c) return;
  const fix = type === 'error' ? ` <button type="button" class="btn-fix" data-fix="${esc(msg)}">Fix with AI</button>` : '';
  c.insertAdjacentHTML('beforeend', `<div class="cl ${type}"><span>${esc(msg)}</span>${fix}</div>`); c.scrollTop = c.scrollHeight;
}
function buildHtml(htmlPath, jsPath, forExport = false) {
  const entryIsMod = jsPath && /\bmjs$|\bexport\s|\bimport\s/m.test(content(jsPath));
  let html = htmlPath ? content(htmlPath) : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script${entryIsMod ? ' type="module"' : ''} src="${jsPath}"></script></body></html>`;
  const dirOf = f => f ? f.replace(/[^/]*$/, '') : '';
  const resolveFrom = (baseDir, ref) => {
    if (/^([a-z]+:|\/\/|#)/i.test(ref)) return null;
    const out = []; for (const x of (ref.startsWith('/') ? ref.slice(1) : baseDir + ref).split('?')[0].split('/')) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }
    const p = out.join('/');
    if (has(p)) return p;
    for (const ext of ['.js', '.mjs']) if (has(p + ext)) return p + ext;
    return p;
  };
  const rewriteMod = (code, baseDir) => code
    .replace(/(\b(?:import|export)\b[\s\S]*?\bfrom\s*['"])([^'"]+)(['"])/g, (m, a, ref, b) => { const rp = resolveFrom(baseDir, ref); return rp && has(rp) ? `${a}@proj/${rp}${b}` : m; })
    .replace(/(\bimport\s*['"])([^'"]+)(['"])/g, (m, a, ref, b) => { const rp = resolveFrom(baseDir, ref); return rp && has(rp) ? `${a}@proj/${rp}${b}` : m; })
    .replace(/(\bimport\s*\(\s*['"])([^'"]+)(['"]\s*\))/g, (m, a, ref, b) => { const rp = resolveFrom(baseDir, ref); return rp && has(rp) ? `${a}@proj/${rp}${b}` : m; });
  const toB64 = str => { const u = new TextEncoder().encode(str); let b = ''; for (const x of u) b += String.fromCharCode(x); return btoa(b); };
  const imports = {};
  for (const fp of IDE.files.keys()) {
    if (/\.m?js$/i.test(fp)) imports['@proj/' + fp] = 'data:text/javascript;base64,' + toB64(rewriteMod(content(fp), dirOf(fp)));
  }
  const importMap = Object.keys(imports).length ? `<script type="importmap">${JSON.stringify({ imports })}<\/script>` : '';
  const dir = dirOf(htmlPath);
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => { const fp = resolveFrom(dir, href); return fp && has(fp) && /stylesheet/i.test(m) ? `<style>\n${content(fp)}\n</style>` : m; })
    .replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi, (m, a, src, b) => { const fp = resolveFrom(dir, src); return fp && has(fp) && /\.svg$/i.test(fp) ? `<img${a}src="data:image/svg+xml;base64,${toB64(content(fp))}"${b}>` : fp && isImg(fp) && isDataImg(IDE.files.get(fp)) ? `<img${a}src="${IDE.files.get(fp)}"${b}>` : m; })
    .replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => {
      const fp = resolveFrom(dir, src);
      if (!fp || !has(fp)) return m;
      const isMod = /\btype\s*=\s*["']module["']/i.test(a + b);
      const body = isMod ? rewriteMod(content(fp), dirOf(fp)) : content(fp);
      return `<script${a}${b}>\n${body.replace(/<\/script/gi, '<\\/script')}\n</script>`;
    })
    .replace(/<script\b([^>]*\btype\s*=\s*["']module["'][^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => /src=/.test(attrs) ? m : `<script${attrs}>${rewriteMod(body, dir).replace(/<\/script/gi, '<\\/script')}</script>`);
  html = html.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => { const fp = resolveFrom(dir, ref); return fp && isImg(fp) && isDataImg(IDE.files.get(fp)) ? `url(${q}${IDE.files.get(fp)}${q})` : m; }); // รูปใน CSS
  const headAdd = (forExport ? '' : STORAGE_SHIM + CAPTURE) + importMap;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + headAdd) : headAdd + html;
}
async function run() {
  await saveNow();
  const p = IDE.active || '';
  IDE.logs = []; $('#console').innerHTML = ''; showRun(true);
  if (/\.py$/i.test(p)) return runPython(p);
  // ไฟล์ HTML รันตัวเอง ไฟล์อื่นรัน index.html ของโปรเจกต์ ถ้าไม่มี index.html ค่อยรัน .js เดี่ยวๆ
  const target = /\.html?$/i.test(p) ? [p] : has('index.html') ? ['index.html'] : /\.m?js$/i.test(p) ? [null, p] : null;
  if (!target) { runTab('con'); return log('error', 'รันได้เฉพาะไฟล์ HTML, JavaScript หรือ Python (หรือโปรเจกต์ที่มี index.html)'); }
  runTab('out');
  const box = $('#out'); box.innerHTML = '';
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups');
  f.title = 'ผลลัพธ์';
  const html = buildHtml(...target);
  if (window.DEMO) f.srcdoc = html; // หน้าเดโมไม่มี /preview.html
  else { f.src = '/preview.html'; f.dataset.html = '1'; IDE.pending = html; }
  IDE.frame = f; box.append(f);
  log('info', `▶ รัน ${target[0] || target[1]}`);
}
addEventListener('message', e => {
  if (!IDE.frame || e.source !== IDE.frame.contentWindow) return;
  if (e.data?.ready && IDE.pending) { IDE.frame.contentWindow.postMessage({ html: IDE.pending }, '*'); IDE.pending = null; }
  if ('shotResult' in (e.data || {})) { IDE.shotWait?.(e.data); IDE.shotWait = null; }
  if (e.data?.log) { log(e.data.log === 'error' ? 'error' : e.data.log === 'warn' ? 'warn' : 'log', e.data.msg); if (e.data.log === 'error') badge(); }
});
function runPython(main) {
  runTab('con');
  if (window.DEMO) return log('warn', 'หน้าเดโมรัน Python ไม่ได้ (sandbox ห้ามโหลดไฟล์ Python) บนเว็บจริงใช้ได้');
  if (!IDE.worker) {
    IDE.worker = window.DEMO_PYWORKER ? new Worker(DEMO_PYWORKER) : new Worker('/pyworker.js');
    IDE.worker.onmessage = e => {
      const d = e.data;
      if (d.status) $('#run-status').textContent = d.status;
      if (d.out != null) log('log', d.out);
      if (d.err != null) { log('error', d.err); badge(); }
      if (d.done) { $('#run-status').textContent = 'จบการทำงาน'; IDE.running = false; }
    };
    IDE.worker.onerror = e => { log('error', 'โหลด Python ไม่ได้: ' + (e.message || 'ตรวจการเชื่อมต่อ')); IDE.worker = null; };
  }
  IDE.running = true; $('#run-status').textContent = 'กำลังเริ่ม...';
  log('info', `▶ python ${main}`);
  IDE.worker.postMessage({ main, files: [...IDE.files.keys()].map(p => ({ path: p, content: content(p) })) });
}
function stopRun() {
  if (IDE.node?.jobs.size) { for (const j of IDE.node.jobs.values()) j({ code: 130, stdout: '', stderr: 'หยุดแล้ว (ต้องติดตั้งแพ็กเกจใหม่)', files: [] }); IDE.node.f.remove(); IDE.node = null; termOut('■ หยุดแล้ว\n', 'err'); }
  if (IDE.worker && IDE.running) { IDE.worker.terminate(); IDE.worker = null; IDE.running = false; log('warn', '■ หยุดแล้ว'); $('#run-status').textContent = 'หยุดแล้ว'; }
  if (IDE.frame) { IDE.frame.remove(); IDE.frame = null; $('#out').innerHTML = '<p class="muted" style="padding:16px">หยุดแล้ว กด รัน เพื่อรันใหม่</p>'; }
}
function badge() { const b = $('[data-rtab=con]'); if (b && IDE.runTab !== 'con') b.classList.add('alert'); }
function runTab(t) {
  IDE.runTab = t; $('#out').hidden = t !== 'out'; $('#console').hidden = t !== 'con'; $('#term').hidden = t !== 'term';
  document.querySelectorAll('[data-rtab]').forEach(b => { b.classList.toggle('on', b.dataset.rtab === t); if (b.dataset.rtab === t) b.classList.remove('alert'); });
}
function showRun(on) { $('.ide').dataset.run = on ? '1' : ''; if (on && matchMedia('(max-width: 999px)').matches) setPane('run'); }
// ลิ้นชักไฟล์ (มือถือ): ปุ่มเมนูมุมซ้ายบน / แท็บ "ไฟล์" ด้านล่าง
function drawer(on) { const ide = $('.ide'); if (!ide) return; ide.dataset.drawer = on ? '1' : ''; $('#burger')?.setAttribute('aria-expanded', !!on); }
// รูปแบบ AI บนมือถือ (ผู้ใช้เลือกในตั้งค่า): page = หน้าแยก · sheet = แผ่นลอยทับโค้ด · bar = แถบสั่งเร็วใต้โค้ด + แผ่นลอย · split = แบ่งจอบน-ล่าง
const AI_MODES = [['page', 'หน้าแยก', 'สลับไปหน้า AI เต็มจอ (แบบเดิม)'], ['sheet', 'แผ่นลอยทับโค้ด', 'ปุ่ม AI เปิดแผ่นครึ่งจอ ยังเห็นโค้ดด้านบน'], ['bar', 'แถบสั่งเร็วใต้โค้ด', 'พิมพ์คำสั่งใต้โค้ด เลือกโมเดล/Effort ได้ และทำให้อัตโนมัติทั้งหมด (ใช้การแก้ไข รัน ตรวจผล)'], ['split', 'แบ่งจอ บน-ล่าง', 'โค้ดอยู่บน AI อยู่ล่างตลอดเวลา']];
const aiMode = () => { const m = localStorage.getItem('aimode'); return AI_MODES.some(x => x[0] === m) ? m : 'split'; }; // ค่าเริ่มต้น = แบ่งจอ
const isPhone = () => matchMedia('(max-width: 999px)').matches;
const barAuto = () => true; // แถบสั่งเร็ว = ทำอัตโนมัติทั้งหมด: ใช้การแก้ไข รันคำสั่งที่ AI ขอ แล้วรัน+จับภาพตรวจผลให้ AI แก้ต่อ (สูงสุด 3 รอบ)
function openAI(on = true) {
  const ide = $('.ide'); if (!ide) return; const m = aiMode();
  if (!isPhone() || m === 'page') return setPane(on ? 'ai' : 'code');
  if (m === 'split') { setPane('code'); if (on) $('#ct')?.focus(); return; }
  ide.dataset.ai = on ? '1' : ''; if (on) setTimeout(() => $('#ct')?.focus(), 320);
}
function applyEditorPrefs() {
  document.documentElement.style.setProperty('--cfs', (+localStorage.getItem('cfont') || 12) + 'px');
  const ide = $('.ide'); if (ide) { ide.dataset.aimode = aiMode(); ide.dataset.ai = ''; }
  IDE.view?.requestMeasure();
}
function editorSettings() {
  const fs = +localStorage.getItem('cfont') || 12, mode = aiMode(), wrapOn = localStorage.getItem('wrap') !== '0';
  sheet('ตั้งค่าตัวแก้ไข', `<label for="fsr">ขนาดตัวอักษรในตัวแก้ไข <b id="fsv">${fs}px</b></label><input type="range" id="fsr" min="10" max="18" step="1" value="${fs}" style="padding:0;min-height:32px">
    <label class="tg" style="margin-top:12px"><input type="checkbox" id="wrp" ${wrapOn ? 'checked' : ''}><span><b>ตัดบรรทัดยาว</b><small class="muted">ข้อความที่ยาวเกินจอจะขึ้นบรรทัดใหม่</small></span></label>
    <label style="margin:16px 0 6px">รูปแบบ AI บนมือถือ</label>${AI_MODES.map(([v, t, d]) => optHTML(v, t, d, v === mode)).join('')}`, (d, close) => {
    d.querySelector('#fsr').oninput = e => { localStorage.setItem('cfont', e.target.value); d.querySelector('#fsv').textContent = e.target.value + 'px'; applyEditorPrefs(); };
    d.querySelector('#wrp').onchange = e => { if (e.target.checked !== (localStorage.getItem('wrap') !== '0')) $('#wrapb').click(); };
    d.querySelectorAll('.opt[data-v]').forEach(b => b.onclick = () => { localStorage.setItem('aimode', b.dataset.v); applyEditorPrefs(); close(); toast('เปลี่ยนรูปแบบ AI แล้ว', 'ok'); });
  });
}
function setPane(p) {
  if (p === 'ai' && isPhone() && aiMode() !== 'page') { openAI(); p = 'code'; }
  IDE.pane = p; const ide = $('.ide'); if (!ide) return;
  ide.dataset.pane = p;
  document.querySelectorAll('[data-pane-btn]').forEach(b => b.classList.toggle('on', b.dataset.paneBtn === p));
  if (p === 'code') requestAnimationFrame(() => IDE.view?.requestMeasure());
}

// ---------- เทอร์มินัล Node.js (almostnode ใน iframe sandbox: เข้าถึง cookie / API ของผู้ใช้ไม่ได้) ----------
const RUN_RE = /^[ \t]*RUN[ \t]+(.+)$/gm;
const runsOf = text => [...String(text || '').replace(/```[\s\S]*?```/g, '').matchAll(RUN_RE)].map(m => m[1].trim()).slice(0, 3);
function nodeFrame() {
  if (IDE.node) return IDE.node.ready;
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts'); f.hidden = true; f.title = 'เทอร์มินัล';
  IDE.node = { f, jobs: new Map() };
  IDE.node.ready = new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('เปิดเทอร์มินัลไม่ได้ ลองรีเฟรชหน้า')), 30000);
    IDE.node.onReady = () => { clearTimeout(t); ok(); };
  });
  f.src = '/node-runner'; document.body.append(f);
  return IDE.node.ready;
}
addEventListener('message', e => {
  const n = IDE.node; if (!n || e.source !== n.f.contentWindow) return;
  const d = e.data || {};
  if (d.nodeReady) return n.onReady();
  const job = n.jobs.get(d.id); if (!job) return;
  if (d.out || d.err) { job.streamed = true; if (d.out) termOut(d.out); if (d.err) termOut(d.err, 'err'); }
  if (d.done) { n.jobs.delete(d.id); if (!job.streamed) { termOut(d.stdout || ''); termOut(d.stderr || '', 'err'); } job(d); } // บางคำสั่งไม่ส่งผลระหว่างทาง
});
function termOut(text, cls = '') {
  const t = $('#term-o'); if (!t) return;
  t.insertAdjacentHTML('beforeend', `<span class="${cls}">${esc(text)}</span>`);
  if (cls === 'err' && text.trim()) t.insertAdjacentHTML('beforeend', ` <button type="button" class="btn-fix" data-fix="${esc(text.slice(0, 1500))}">Fix with AI</button>\n`);
  t.scrollTop = t.scrollHeight;
}
// ---------- จัดรูปแบบโค้ด (Prettier: โหลดจาก CDN เมื่อกดครั้งแรก ตรวจ SRI) + ตรวจไวยากรณ์ ----------
const PRET = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3/';
Object.assign(LIBS, {
  prStd: [PRET + 'standalone.js', 'sha384-92h6ALm8/lHpNGn6MfGlgZ+I8c/4yn/nSN8dV9ZmDxqbP9L93gk/Jj2i0LtV+AVd'], prBabel: [PRET + 'plugins/babel.js', 'sha384-LVGbDV/P7cLtPieWR5eaG37eUXcUZWd+WiDayBt6n6/teTUJlQngL9TYCOVT3ZRj'],
  prEstree: [PRET + 'plugins/estree.js', 'sha384-mNSKm0X7oH5iPYdbWeG0lmp0/RQ9VlHbsLaVbkkCPFep276FSXr8YrErabQmjcIJ'], prHtml: [PRET + 'plugins/html.js', 'sha384-VCy7LKCQow/T2yndLoIV5EJejLOuAjN751ZhVr3Ht99t2BncwdQuvukah28BeS03'],
  prCss: [PRET + 'plugins/postcss.js', 'sha384-FUOoCpwcTLZEOGwXBLpirv3vYTBa8H30d595o52TC4oHV5F3nLVFNGuxn+O8EHPC'], prMd: [PRET + 'plugins/markdown.js', 'sha384-5ufuUgoSsr/2oihBZ5d+c+yt0qaUmzLtUz41VZNJ4txtyJ6mBve3ZwuKoq/IygYX'],
});
const PARSERS = [[/\.(m?jsx?|cjs)$/i, 'babel', ['prBabel', 'prEstree']], [/\.json$/i, 'json', ['prBabel', 'prEstree']], [/\.(css|scss|less)$/i, 'css', ['prCss']], [/\.html?$/i, 'html', ['prHtml', 'prBabel', 'prEstree', 'prCss']], [/\.(md|markdown)$/i, 'markdown', ['prMd']]];
const parserOf = path => PARSERS.find(x => x[0].test(path || ''));
const PLUGIN_NAMES = { prBabel: 'babel', prEstree: 'estree', prHtml: 'html', prCss: 'postcss', prMd: 'markdown' };
async function prettierOpts(path, load) {
  const pr = parserOf(path); if (!pr) return null;
  if (load) { await lib('prStd'); for (const k of pr[2]) await lib(k); } else if (!window.prettier || pr[2].some(k => !loading[k])) return null; // ตรวจไวยากรณ์เฉพาะเมื่อโหลดตัวจัดรูปแบบแล้ว (ไม่โหลดเองให้เปลืองเน็ต)
  return { parser: pr[1], plugins: pr[2].map(k => window.prettierPlugins[PLUGIN_NAMES[k]]), tabWidth: 2 };
}
const errLine = e => e?.loc?.start?.line || +(/\((\d+):\d+\)/.exec(e?.message || '') || [])[1] || null;
async function formatActive() {
  const path = IDE.active; if (!path || !parserOf(path)) return toast('ไฟล์ชนิดนี้ยังจัดรูปแบบไม่ได้ (รองรับ JS, JSON, CSS, HTML, Markdown)');
  const b = $('#fmtb'); b.disabled = true; setStatus('กำลังจัดรูปแบบ...');
  try {
    const opt = await prettierOpts(path, true), src = content(path), out = await prettier.format(src, opt);
    if (out !== src) { IDE.view.dispatch({ changes: { from: 0, to: IDE.view.state.doc.length, insert: out } }); toast('จัดรูปแบบแล้ว', 'ok'); } else toast('โค้ดเป็นระเบียบอยู่แล้ว');
    IDE.synErr = null; setStatus(IDE.dirty.size ? 'ยังไม่บันทึก' : 'บันทึกแล้ว ✓');
  } catch (x) { synFail(path, x); }
  finally { b.disabled = false; }
}
function synFail(path, x) { const ln = errLine(x); IDE.synErr = { path, ln }; setStatus(`⚠ ไวยากรณ์ผิด${ln ? ' บรรทัด ' + ln : ''}: ${String(x.message || x).split('\n')[0].replace(/\s*\(\d+:\d+\)$/, '').slice(0, 80)}`, true); }
async function syntaxCheck() { // หลังบันทึก: ไฟล์ที่เปิดอยู่ผิดไวยากรณ์ไหม (แตะแถบสถานะเพื่อไปบรรทัดที่ผิด)
  const path = IDE.active; if (!path || isImg(path)) return;
  const was = IDE.synErr; IDE.synErr = null;
  try {
    const src = content(path);
    if (/\.json$/i.test(path)) JSON.parse(src); else { const opt = await prettierOpts(path, false); if (opt) await prettier.format(src, opt); }
    if (was) setStatus(IDE.dirty.size ? 'ยังไม่บันทึก' : 'บันทึกแล้ว ✓');
  } catch (x) { const m = /position (\d+)/.exec(x.message); if (m && x instanceof SyntaxError) x.loc = { start: { line: content(path).slice(0, +m[1]).split('\n').length } }; synFail(path, x); }
}
// ตัวแปรลับของโปรเจกต์ (.env): เก็บเข้ารหัสแยกจากไฟล์ ส่งให้เทอร์มินัลเป็นไฟล์ .env ชั่วคราวตอนรันเท่านั้น (ไม่เข้า AI, GitHub, zip)
async function envSheet() {
  const cur = await api(`/projects/${IDE.pid}/env`).catch(() => ({ text: '' }));
  sheet('ตัวแปรลับ (.env)', `<div class="sheet-form"><p class="muted" style="margin:0">บรรทัดละ 1 ตัว เช่น <code>API_KEY=abc123</code> เก็บเข้ารหัส AI และ GitHub ไม่เห็น เทอร์มินัลจะได้รับเป็นไฟล์ <code>.env</code> ชั่วคราวตอนรัน (อ่านด้วย dotenv หรือ fs ได้ <code>process.env</code> ตรงๆ ยังไม่รองรับ)</p><textarea id="envt" rows="7" spellcheck="false" placeholder="API_KEY=...">${esc(cur.text || '')}</textarea><button class="btn blue sm" id="envs">Save</button></div>`, (d, close) => {
    d.querySelector('#envs').onclick = async () => { try { const text = d.querySelector('#envt').value; await api(`/projects/${IDE.pid}/env`, { method: 'PUT', body: { text } }); IDE.env = text; toast('บันทึกตัวแปรลับแล้ว', 'ok'); close(); } catch (x) { toast(x.message, 'bad'); } };
  });
}
// รันคำสั่ง: ส่งไฟล์โปรเจกต์ไปด้วย ไฟล์ที่คำสั่งสร้าง/แก้ (ยกเว้น node_modules) จะถูกบันทึกกลับเข้าโปรเจกต์
async function nodeRun(cmd) {
  if (window.DEMO) { termOut(`$ ${cmd}\nหน้าเดโมรันเทอร์มินัลไม่ได้ บนเว็บจริงใช้ได้\n`, 'err'); return { code: 1, stdout: '', stderr: 'หน้าเดโมรันเทอร์มินัลไม่ได้' }; }
  await saveNow(); showRun(true); runTab('term');
  termOut(`$ ${cmd}\n`, 'cmd'); $('#run-status').textContent = 'กำลังรัน...';
  try { await nodeFrame(); } catch (x) { termOut(x.message + '\n', 'err'); return { code: 1, stdout: '', stderr: x.message }; }
  const id = Math.random().toString(36).slice(2);
  const files = [...IDE.files.keys()].map(p => ({ path: p, content: content(p) }));
  IDE.env ??= (await api(`/projects/${IDE.pid}/env`).catch(() => ({ text: '' }))).text || ''; if (IDE.env.trim()) files.push({ path: '.env', content: IDE.env });
  const d = await new Promise(ok => { IDE.node.jobs.set(id, ok); IDE.node.f.contentWindow.postMessage({ id, cmd, files }, '*'); });
  termOut(`[exit ${d.code}]\n`, d.code ? 'err' : 'muted'); $('#run-status').textContent = '';
  const changed = (d.files || []).filter(f => PATH_OK(f.path) && f.path !== '.env' && content(f.path) !== f.content);
  if (changed.length) { await writeFiles(changed); termOut(`บันทึกไฟล์ที่เปลี่ยน: ${changed.map(f => f.path).join(', ')}\n`, 'muted'); }
  return d;
}
const PATH_OK = p => p && !p.startsWith('node_modules/') && p.length < 200;
// AI สั่ง RUN: ใช้การแก้ไขของข้อความนั้นก่อน แล้วรัน แล้วส่งผลกลับให้ AI
// AI สั่งสร้างรูปด้วยบรรทัด `IMAGE <คำบรรยาย> -> images/ชื่อ.jpg` → เรียก /api/image สร้างรูป ย่อ เก็บเป็นไฟล์ในโปรเจกต์ แล้วส่งผลกลับให้ AI ใส่ลงโค้ดต่อเอง
const IMG_LINE = /^[ \t]*IMAGE[ \t]+(.+?)[ \t]*(?:->|→)[ \t]*(\S+)[ \t]*$/gm;
const imagesOf = text => [...String(text || '').replace(/```[\s\S]*?```/g, '').matchAll(IMG_LINE)].map(m => {
  let path = m[2].replace(/^[`'"]|[`'",.]+$/g, '').replace(/^\/+/, '').replace(/[^\w./-]/g, '_').replace(/\.\./g, '_');
  if (!path.includes('/')) path = 'images/' + path;
  return { prompt: m[1].trim().slice(0, 1500), path: path.replace(/\.\w+$/, '') + '.jpg' };
}).slice(0, 2);
async function imagesForAI(msg, list) {
  msg.imgdone = true; drawAI();
  let text = '[ผลการสร้างรูป]';
  for (const it of list) {
    setStatus('กำลังสร้างรูป ' + it.path + '...');
    try {
      const r = await api('/image', { method: 'POST', body: { prompt: it.prompt, inline: true } });
      const sm = await shrinkImage(r.src); await writeFiles([{ path: it.path, content: sm.data }]);
      if (r.usage) { me.usage = r.usage; $('#clim').innerHTML = limHTML(r.usage); }
      text += `\n\nสร้างแล้ว: ${it.path} (${sm.w}x${sm.h}px, ~${Math.round(sm.data.length / 1365)}KB) ใช้ใน HTML ด้วย <img src="${it.path}"> หรือใน CSS ด้วย url(${it.path})`;
    } catch (x) { text += `\n\nสร้าง ${it.path} ไม่สำเร็จ: ${x.message}`; }
  }
  setStatus('บันทึกแล้ว ✓'); IDE.round = (IDE.round ?? 0) + 1; setPane('ai');
  IDE.applyNext = true;
  if (IDE.round <= 5) await codeSend({ text: text + '\n\nใส่รูปลงในโค้ดตามที่ต้องการ แล้วสรุปสั้นๆ ถ้าสร้างรูปไม่สำเร็จให้ใช้ CSS หรือ SVG แทน' });
}
async function runForAI(msg, cmds) {
  const bad = await applyChanges(changesOf(msg.content, undefined, activeRef()), msg);
  if (bad.length) { drawAI(); return feedBack(bad); } // ไฟล์พัง: ไม่รันคำสั่ง ส่งกลับให้ AI แก้ก่อน
  msg.ran = true; drawAI();
  const cut = s => s.length > 6000 ? s.slice(0, 2000) + '\n…(ตัดกลาง)…\n' + s.slice(-4000) : s;
  let text = '[ผลการรันคำสั่ง]';
  for (const cmd of cmds) { const d = await nodeRun(cmd); text += `\n\n$ ${cmd}\n(exit ${d.code})\n${cut((d.stdout || '') + (d.stderr ? '\n[stderr]\n' + d.stderr : '')) || '(ไม่มีผลลัพธ์)'}`; }
  IDE.round = (IDE.round ?? 0) + 1; setPane('ai');
  if (IDE.round <= (IDE.agent ? 12 : 5)) await codeSend({ text: text + '\n\nดูผลแล้วแก้ต่อถ้ายังมีปัญหา ถ้าผ่านแล้วให้สรุปสั้นๆ' });
}

// ---------- AI: ปุ่มด้านล่างแบบเดียวกับหน้าแชต ----------
function cUI() {
  const m = me.models.find(x => x.id === +$('#cmodel').value) || me.models[0];
  $('#cmdl').innerHTML = `${m ? vendorLogo(m.name, 'xs') : ''}<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
  const efs = modelEfforts(m);
  $('#ceff').hidden = !efs.length;
  if (efs.length && !efs.includes($('#ceffort').value)) $('#ceffort').value = efs[0];
  $('#ceff').innerHTML = `${ic('sparkles', 'sm')}${EFFORT_INFO[$('#ceffort').value]?.[0] || 'Instant'}${ic('down', 'sm')}`;
  $('#bmdl').innerHTML = $('#cmdl').innerHTML; $('#beff').innerHTML = $('#ceff').innerHTML; $('#beff').hidden = !efs.length; // แถบสั่งเร็วใช้ค่าเดียวกับกล่อง AI
  $('#cflags').innerHTML = ''
    + (IDE.bgJob ? `<button type="button" class="flag agent-on" data-flag="bgagent" title="Agent กำลังทำงานบนเซิร์ฟเวอร์ · แตะเพื่อดู">${ic('server', 'sm')}${IDE.bgJob.role === 'lead' ? `ทีม Agent · ${AG_LABEL[IDE.bgJob.status]} · เสร็จ ${(IDE.bgJob.team || []).filter(k => k.role === 'worker' && !['waiting', 'queued', 'running', 'stopping'].includes(k.status)).length}/${(IDE.bgJob.team || []).filter(k => k.role === 'worker').length}` : `Agent ทำงานอยู่ · รอบ ${IDE.bgJob.rounds}/20`}</button>` : '')
    + (IDE.agent ? `<button type="button" class="flag agent-on" data-flag="agent" title="โหมด Agent เปิดอยู่: ทำงานต่อเนื่องได้ถึง 20 รอบ · แตะเพื่อปิด">${ic('sparkles', 'sm')}Agent ON</button>` : '')
    + (IDE.skills.length && _skillsCache ? IDE.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-flag="sk" data-sid="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
    + (IDE.mcps.length && _mcpCache ? IDE.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-flag="mc" data-mid="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
}
function setOpt(k, on) { localStorage.setItem(k, on ? '1' : '0'); if (k === 'auto') IDE.autoMode = on; else IDE.autoApply = on; }
async function shareProject() {
  const r = await api(`/projects/${IDE.pid}/share`, { method: 'POST' }), url = `${location.origin}/p/${r.slug || r.token}`;
  sheet('แชร์โปรเจกต์ (อ่านอย่างเดียว)', `<p class="muted" style="margin:0 0 12px">ใครมีลิงก์นี้เปิดดูหน้าเว็บของโปรเจกต์ได้ แต่แก้ไฟล์ไม่ได้ · หน้าจะอัปเดตตามไฟล์ล่าสุดเสมอ</p>
    <div class="row" style="flex-wrap:nowrap"><input readonly id="shu" value="${esc(url)}"><button class="btn out sm" id="shc">Copy</button></div><form id="shs" class="row" style="flex-wrap:nowrap;margin-top:10px"><input name="slug" value="${esc(r.slug || '')}" placeholder="ตั้งชื่อลิงก์เอง เช่น my-shop" pattern="[a-z0-9][a-z0-9-]{2,39}" autocapitalize="none"><button class="btn blue sm">Save name</button></form><p class="muted" style="margin:6px 0 0;font-size:12.5px">ลิงก์แสดงไฟล์ล่าสุดของโปรเจกต์เสมอ แก้แล้วคนเปิดลิงก์เห็นของใหม่ภายใน 1 นาที</p><button class="btn red sm" id="shx" style="margin-top:12px">Stop sharing</button>`, (d, close) => {
    d.querySelector('#shs').onsubmit = async e => { e.preventDefault(); try { await api(`/projects/${IDE.pid}/share`, { method: 'POST', body: { slug: new FormData(e.target).get('slug') } }); toast('บันทึกชื่อลิงก์แล้ว', 'ok'); shareProject(); } catch (x) { toast(x.message, 'bad'); } };
    d.querySelector('#shc').onclick = e => copy(url, e.target);
    d.querySelector('#shx').onclick = async () => { await api(`/projects/${IDE.pid}/share`, { method: 'DELETE' }); close(); toast('ยกเลิกการแชร์แล้ว', 'ok'); };
  });
}
// Agent เบื้องหลัง: ส่งงานให้เซิร์ฟเวอร์ทำเองทั้งชุด (ปิดแอปได้) · ดูสถานะ/หยุด/โหลดไฟล์ใหม่
const AG_LABEL = { queued: 'รอคิว', running: 'กำลังทำงาน', stopping: 'กำลังหยุด', done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิต', failed: 'ไม่สำเร็จ', timeout: 'หมดเวลา', waiting: 'รอคิว (ไฟล์ชนกัน)', team: 'ทีมกำลังทำงาน', reviewing: 'กำลังตรวจรวม', plan: 'รอยืนยันแผน', planned: 'ในแผน' };
const agBusy = j => ['queued', 'running', 'stopping', 'team', 'reviewing', 'plan'].includes(j?.status);
const AG_ROLE = { worker: 'ลูกทีม', review: 'ผู้ตรวจ' };
// แผงทีม: ลูกทีมแต่ละตัว (สถานะ, ไฟล์, รอบ) + หยุดรายตัว
// แผนของหัวหน้ารอยืนยัน: แก้ชื่อ/คำสั่ง/ไฟล์ หรือเอางานย่อยออก แล้วกดเริ่มทีม
const planForm = j => `<p class="sheet-msg"><b>หัวหน้าแบ่งงานเสร็จแล้ว รอคุณยืนยัน</b><br><small class="muted">${esc(j.prompt.slice(0, 120))}</small></p><div id="agplan" data-id="${j.id}">${(j.team || []).filter(k => k.status === 'planned').map(k => { const p = JSON.parse(k.plan || '{}'); return `<div class="mem tm" style="display:block" data-k="${k.id}"><label class="sw-row" style="margin:0 0 6px"><span class="sw"><input type="checkbox" data-keep checked><span></span></span><input data-title value="${esc(p.title || '')}" maxlength="80" style="flex:1"></label><textarea data-prompt rows="3" maxlength="4000">${esc(p.prompt || '')}</textarea><input data-files value="${esc(JSON.parse(k.scope || '[]').join(', '))}" placeholder="ไฟล์ที่แก้ได้ คั่นด้วย ," style="margin-top:6px"></div>`; }).join('')}</div><div class="row"><button type="button" class="btn blue" id="agstart">เริ่มทีม</button><button type="button" class="btn red sm" id="agx">ยกเลิกแผน</button></div>`;
const teamRows = j => (j.team || []).map(k => `<div class="mem tm"><span><b>${AG_ROLE[k.role] || k.role}</b> ${esc(k.role === 'review' ? 'ตรวจรวมผลงาน' : k.title)}<br><small class="muted">${AG_LABEL[k.status] || k.status}${k.rounds ? ' · ' + k.rounds + ' รอบ' : ''}${k.scope ? ' · ' + esc(JSON.parse(k.scope).join(', ')) : ''}</small></span>${['queued', 'running'].includes(k.status) ? `<button type="button" class="btn out sm" data-agstop="${k.id}">หยุด</button>` : ''}</div>`).join('');
async function bgAgentSheet() {
  if (!me.plan.paid) return toast('Agent เบื้องหลังใช้ได้กับแพลนที่ชำระเงิน', 'bad');
  let timer = 0;
  const draw = async d => {
    const jobs = await api('/agent?project=' + IDE.pid).catch(() => []), busy = jobs.find(agBusy), box = d.querySelector('.sheet-b'); if (!box) return clearInterval(timer);
    if (busy?.status === 'plan' && box.querySelector(`#agplan[data-id="${busy.id}"]`)) return; // กำลังแก้แผน: ไม่วาดทับ
    const m = $('#cmodel')?.value;
    box.innerHTML = `<div class="sheet-form">
      ${busy?.status === 'plan' ? planForm(busy) : busy ? `<p class="sheet-msg"><b>${AG_LABEL[busy.status]}</b>${busy.role === 'lead' ? (busy.team?.length ? ` · ทีม ${busy.team.filter(k => k.role === 'worker').length} ตัว` : ' · หัวหน้ากำลังแบ่งงาน') : ` · รอบที่ ${busy.rounds}/20`}<br><small class="muted">${esc(busy.prompt.slice(0, 120))}</small></p>${teamRows(busy)}<button type="button" class="btn red sm" id="agx">${busy.role === 'lead' ? 'หยุดทั้งทีม' : 'หยุดงานนี้'}</button>`
        : `<textarea id="agp" rows="4" maxlength="4000" placeholder="อธิบายงานให้ละเอียด เช่น ทำหน้า Contact พร้อมฟอร์ม ใส่ลิงก์ในเมนู และปรับสไตล์ให้เข้ากับหน้าแรก"></textarea>
           <label class="sw-row"><span class="sw"><input type="checkbox" id="agteam"><span></span></span> ทีม Agent: หัวหน้า (โมเดลที่เลือก) แบ่งงาน ลูกทีม DeepSeek 4.1 Flash ทำพร้อมกันสูงสุด 5 ตัว แล้วตรวจรวม เหมาะกับงานใหญ่หลายไฟล์</label><label class="sw-row" id="agcfw"><span class="sw"><input type="checkbox" id="agconfirm" checked><span></span></span> ให้ฉันตรวจแผนก่อนเริ่ม (ปิดถ้าจะสั่งแล้วปิดแอปเลย)</label><button type="button" class="btn blue" id="agg">เริ่มให้ Agent ทำ</button><p class="muted" style="margin:0;font-size:12.5px">ใช้โมเดลที่เลือกอยู่ · ใช้ลิมิตแพลนตามจริง · แก้ไขย้อนกลับได้จาก "ประวัติโปรเจกต์"</p>`}
      ${jobs.filter(j => !agBusy(j)).slice(0, 4).map(j => `<div class="mem tm" style="display:block"><b>${AG_LABEL[j.status] || j.status}</b> · ${j.rounds} รอบ · ${when(j.created_at)}<br><small class="muted">${esc(j.prompt.slice(0, 100))}</small>${j.summary ? `<br><small>${esc(j.summary.slice(0, 220))}</small>` : ''}${j.chat_id ? ` <a href="/chat?id=${j.chat_id}">ดูรายละเอียด</a>` : ''}</div>`).join('')}
    </div>`;
    box.querySelector('#agg')?.addEventListener('click', async e => {
      const prompt = box.querySelector('#agp').value.trim(); if (prompt.length < 10) return toast('อธิบายงานให้ละเอียดขึ้นอีกหน่อย', 'bad');
      e.target.disabled = true; await saveNow();
      try { await api('/agent', { method: 'POST', body: { project_id: IDE.pid, model_id: +m, prompt, team: box.querySelector('#agteam')?.checked, confirm: box.querySelector('#agconfirm')?.checked } }); toast('ส่งงานให้ Agent แล้ว ปิดแอปได้เลย จะอีเมลเมื่อเสร็จ', 'ok'); agWatch(); draw(d); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
    });
    box.querySelector('#agx')?.addEventListener('click', async () => { await api(`/agent/${busy.id}/stop`, { method: 'POST' }).catch(() => {}); draw(d); });
    box.querySelector('#agstart')?.addEventListener('click', async e => {
      const tasks = [...box.querySelectorAll('#agplan [data-k]')].filter(r => r.querySelector('[data-keep]').checked).map(r => ({ id: +r.dataset.k, title: r.querySelector('[data-title]').value, prompt: r.querySelector('[data-prompt]').value, files: r.querySelector('[data-files]').value }));
      e.target.disabled = true; try { const r = await api(`/agent/${busy.id}/start`, { method: 'POST', body: { tasks } }); toast(`เริ่มทีม ${r.tasks} งานแล้ว ปิดแอปได้`, 'ok'); box.innerHTML = ''; agWatch(); draw(d); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
    });
    box.querySelectorAll('[data-agstop]').forEach(b => b.onclick = async () => { await api(`/agent/${b.dataset.agstop}/stop`, { method: 'POST' }).catch(() => {}); draw(d); });
  };
  sheet('Agent บนเซิร์ฟเวอร์', '<p class="muted">กำลังโหลด...</p>', d => { draw(d); timer = setInterval(() => draw(d), 5000); new MutationObserver((_, o) => { if (!document.contains(d)) { clearInterval(timer); o.disconnect(); } }).observe(document.body, { childList: true }); });
}
// ดูสถานะงาน Agent ตลอดที่เปิดหน้า Code: ขึ้นป้าย + พอเสร็จโหลดไฟล์ใหม่ให้อัตโนมัติ
let agPoll = 0;
async function agWatch() {
  clearInterval(agPoll);
  const tick = async () => {
    const jobs = await api('/agent?project=' + IDE.pid).catch(() => []), busy = jobs.find(agBusy), prev = IDE.bgJob;
    IDE.bgJob = busy || null; if (!!busy !== !!prev || busy?.rounds !== prev?.rounds || JSON.stringify(busy?.team?.map(k => k.status)) !== JSON.stringify(prev?.team?.map(k => k.status))) cUI();
    if (prev && !busy) { const j = jobs.find(x => x.id === prev.id); clearInterval(agPoll); if (j) { toast(`Agent ${AG_LABEL[j.status] || j.status}: ${(JSON.parse(j.changed || '[]')).length} ไฟล์ที่เปลี่ยน`, j.status === 'done' ? 'ok' : ''); if (!IDE.busy) reloadFiles().catch(() => {}); } }
    else if (!busy) clearInterval(agPoll);
  };
  await tick(); if (IDE.bgJob) agPoll = setInterval(tick, 8000);
}
// โหลดไฟล์ทั้งหมดจากเซิร์ฟเวอร์ใหม่ (หลังย้อนทั้งโปรเจกต์)
async function reloadFiles() {
  const d = await api('/projects/' + IDE.pid), keep = IDE.active;
  IDE.files = new Map(d.files.map(f => [f.path, f.content])); IDE.states.clear(); IDE.dirty.clear(); IDE.open = IDE.open.filter(has); IDE.active = null;
  refresh(); const first = has(keep) ? keep : [...IDE.files.keys()][0]; if (first) openFile(first);
}
async function projectHistory() {
  const pts = await api(`/projects/${IDE.pid}/restorepoints`), label = { edit: 'ก่อนแก้ไข', import: 'ก่อนนำเข้า', git: 'ก่อน Pull', restore: 'ก่อนย้อนกลับ' };
  sheet('ประวัติโปรเจกต์', pts.length ? `<p class="muted" style="margin:0 0 10px">เลือกจุดเวลา แล้วไฟล์ที่เปลี่ยนหลังจุดนั้นจะย้อนกลับ (ไฟล์ใหม่ที่เพิ่งสร้างจะยังอยู่ · ย้อนกลับของการย้อนได้จากรายการนี้)</p>${pts.map(x => optHTML(x.ts, when(x.ts), `${label[x.source] || x.source} · ${x.files} ไฟล์`)).join('')}` : '<p class="muted">ยังไม่มีประวัติ</p>', (d, close) => {
    d.querySelectorAll('.opt[data-v]').forEach(b => b.onclick = async () => {
      if (!await confirmSheet('ย้อนไฟล์ในโปรเจกต์ไปสถานะก่อนเวลานี้?', { title: 'ย้อนโปรเจกต์', ok: 'Undo' })) return;
      try { await saveNow(); const r = await api(`/projects/${IDE.pid}/restore`, { method: 'POST', body: { ts: +b.dataset.v } }); close(); await reloadFiles(); toast(`ย้อนแล้ว ${r.restored} ไฟล์`, 'ok'); } catch (x) { toast(x.message, 'bad'); }
    });
  });
}
function codeTools() {
  sheet('เครื่องมือ AI', optHTML('check', ic('camera') + 'ให้ AI ดูผลลัพธ์ตอนนี้', 'รันโปรเจกต์ จับภาพหน้าจอ แล้วส่งให้ AI ตรวจ')
    + optHTML('skl', ic('sparkles') + 'Skills', 'เปิด/ปิด Skill เฉพาะในโหมด Code (สูงสุด 3)')
    + optHTML('bgagent', ic('server') + 'ส่งงานให้ Agent ทำบนเซิร์ฟเวอร์' + newPill('team'), me.plan.paid ? 'สั่งแล้วปิดแอปได้ Agent แก้ไฟล์และสร้างรูปให้เองสูงสุด 20 รอบ เสร็จแล้วส่งอีเมล · ไม่รันโค้ด ตรวจผลเองตอนจบ' : 'ใช้ได้กับแพลนที่ชำระเงิน')
    + optHTML('agent', ic('sparkles') + 'โหมด Agent (งานยาว)', me.plan.paid ? 'AI ทำงานต่อเนื่องได้ถึง 20 รอบต่อคำสั่ง ปิดจอได้ กลับมาดูผล · ใช้ลิมิตมากกว่าปกติ' : 'ใช้ได้กับแพลนที่ชำระเงิน', IDE.agent)
    + optHTML('mcp', ic('server') + 'Remote MCP', 'เชื่อมต่อ GitHub หรือ Remote MCP (สูงสุด 3)')
    + optHTML('rules', ic('filetext') + 'กฎประจำโปรเจกต์', IDE.instructions ? 'ตั้งค่าไว้แล้ว · แตะเพื่อแก้ไข' : 'กำหนด Stack หรือข้อกำหนดให้ AI ทำตามทุกแชต')
    + optHTML('prm', ic('book') + 'คลัง Prompt', 'เลือกคำสั่งสำเร็จรูปสำหรับเขียนโค้ด')
    + optHTML('share', ic('share') + 'แชร์โปรเจกต์ (ลิงก์อ่านอย่างเดียว)', 'ให้คนอื่นเปิดดูหน้าเว็บที่รันแล้วได้ แก้ไฟล์ไม่ได้')
    + optHTML('hist', ic('undo') + 'ประวัติโปรเจกต์ / ย้อนทั้งโปรเจกต์', 'ย้อนไฟล์ทั้งหมดไปสถานะก่อนช่วงเวลาที่เลือก')
    + optHTML('exphtml', ic('download') + 'ส่งออก HTML ไฟล์เดียว', 'รวม HTML/CSS/JS เป็นไฟล์เดียวพร้อมเปิดใช้งาน')
    + optHTML('term', ic('terminal') + 'เปิดเทอร์มินัล', 'พิมพ์คำสั่ง npm / node เอง'),
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); const v = b.dataset.v;
      if (v === 'autoapply' || v === 'auto') { setOpt(v, !(v === 'auto' ? IDE.autoMode : IDE.autoApply)); cUI(); }
      if (v === 'bgagent') { seen('team'); return bgAgentSheet(); }
      if (v === 'agent') { if (!me.plan.paid) return toast('โหมด Agent ใช้ได้กับแพลนที่ชำระเงิน', 'bad'); IDE.agent = !IDE.agent; localStorage.setItem('agent', IDE.agent ? '1' : '0'); cUI(); toast(IDE.agent ? 'เปิดโหมด Agent: งานยาวได้ถึง 20 รอบ' : 'ปิดโหมด Agent', 'ok'); if (IDE.agent && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
      if (v === 'check') { IDE.round = 0; check().catch(x => $('#ce').textContent = x.message); }
      if (v === 'mcp') mcpSheet(IDE.mcps, ids => { IDE.mcps = ids; localStorage.setItem('cmcps', JSON.stringify(ids)); cUI(); });
      if (v === 'skl') skillsSheet(IDE.skills, ids => { IDE.skills = ids; localStorage.setItem('cskills', JSON.stringify(ids)); cUI(); });
      if (v === 'share') shareProject().catch(x => $('#ce').textContent = x.message);
      if (v === 'hist') projectHistory().catch(x => $('#ce').textContent = x.message);
      if (v === 'rules') {
        sheet('กฎประจำโปรเจกต์', `<form class="sheet-form" id="rf"><p class="sheet-msg">AI จะอ่านกฎนี้ทุกครั้งที่สั่งงานในโปรเจกต์นี้ (เช่น Stack, สไตล์โค้ด, ข้อห้าม) · หรือสร้างไฟล์ <code>ASTRA.md</code> ในโปรเจกต์ AI จะอ่านให้อัตโนมัติเช่นกัน</p><textarea name="instructions" rows="5" maxlength="3000" placeholder="เช่น ใช้ Vanilla JS + Tailwind CSS, ตอบสั้นๆ">${esc(IDE.instructions || '')}</textarea><div class="sheet-acts"><button type="button" class="btn out" data-c>Cancel</button><button class="btn blue">Save rule</button></div></form>`, (sd, sclose) => {
          sd.querySelector('[data-c]').onclick = sclose;
          sd.querySelector('#rf').onsubmit = async ev => {
            ev.preventDefault(); const ins = new FormData(ev.target).get('instructions');
            await api('/projects/' + IDE.pid, { method: 'PUT', body: { instructions: ins } });
            IDE.instructions = ins; sclose(); toast('บันทึกกฎโปรเจกต์แล้ว', 'ok');
          };
        });
      }
      if (v === 'prm') promptLibSheet(p => { const ct = $('#ct'); ct.value = p + ct.value; ct.oninput(); ct.focus(); });
      if (v === 'exphtml') { const hp = has('index.html') ? 'index.html' : (/\.html?$/i.test(IDE.active || '') ? IDE.active : null); const jp = !hp && /\.m?js$/i.test(IDE.active || '') ? IDE.active : null; if (!hp && !jp) return toast('ต้องมี index.html หรือไฟล์ .html/.js', 'bad'); const out = buildHtml(hp, jp, true); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/html;charset=utf-8' })); a.download = (IDE.name || 'astracode').replace(/[^\wก-๙-]+/g, '_') + '.html'; a.click(); toast('ส่งออกไฟล์ HTML แล้ว', 'ok'); }
      if (v === 'term') { showRun(true); runTab('term'); setTimeout(() => $('#term-i')?.focus(), 50); }
    }));
}

// ---------- AI ----------
// บล็อกโค้ดที่ AI ตั้งใจให้เป็นไฟล์: ใช้ ```lang path=ชื่อ ตามที่สั่ง · โมเดลบางตัวไม่ทำตาม จึงรับรูปแบบใกล้เคียงด้วย (ชื่อไฟล์ใน info string หรือหัวข้อบรรทัดเหนือบล็อก เช่น ## `index.html`)
const NOT_FILE_LANG = /^(?:bash|sh|shell|zsh|console|cmd|powershell|ps1|diff|patch|text|txt|log|output)$/i;
const FILE_NAME = /^[\w][\w./-]{0,150}\.[A-Za-z0-9]{1,8}$/;
// ---------- แก้ไฟล์แบบ SEARCH/REPLACE (ประหยัด token กว่าส่งทั้งไฟล์) ----------
// บล็อก path=… ที่ข้างในเป็น <<<<<<< SEARCH / ======= / >>>>>>> REPLACE (ได้หลายคู่) → คำนวณเนื้อหาใหม่จากไฟล์ปัจจุบัน
const EDIT_RE = /^<{5,9} SEARCH[ \t]*\n([\s\S]*?)\n?={5,9}[ \t]*\n([\s\S]*?)\n?>{5,9} REPLACE[ \t]*$/gm;
const isEditBody = t => /^<{5,9} SEARCH[ \t]*$/m.test(t) && /^>{5,9} REPLACE[ \t]*$/m.test(t);
// หาตำแหน่งข้อความเดิม: ตรงตัว → ไม่สนช่องว่างท้ายบรรทัด → ไม่สนการเยื้อง (ต้องพบแบบเดียวเท่านั้น)
function findBlock(text, search) {
  const tryAt = (norm) => {
    const T = text.split('\n'), S = search.split('\n'), hits = [];
    for (let i = 0; i + S.length <= T.length; i++) if (S.every((l, k) => norm(T[i + k]) === norm(l))) hits.push(i);
    if (hits.length !== 1) return hits.length ? -1 : null;
    const i = hits[0]; let from = 0; for (let k = 0; k < i; k++) from += T[k].length + 1;
    let to = from; for (let k = 0; k < S.length; k++) to += T[i + k].length + (k < S.length - 1 ? 1 : 0); // ไม่รวมขึ้นบรรทัดใหม่หลังบรรทัดสุดท้ายของส่วนที่พบ
    return { from, to };
  };
  const exact = text.indexOf(search);
  if (exact >= 0) return text.indexOf(search, exact + 1) >= 0 ? -1 : { from: exact, to: exact + search.length };
  for (const norm of [l => l.replace(/\s+$/, ''), l => l.trim()]) { const r = tryAt(norm); if (r) return r; }
  return null;
}
// ใช้ทุกคู่ตามลำดับ · คืน { content } หรือ { error } · ใช้ซ้ำได้ (ถ้าข้อความใหม่อยู่ในไฟล์แล้ว ถือว่าใช้แล้ว)
function applyEdits(cur, body) {
  let out = cur ?? '', n = 0;
  for (const m of body.matchAll(EDIT_RE)) {
    const search = m[1].replace(/\r/g, ''), rep = m[2].replace(/\r/g, '');
    if (!search.trim()) { if (cur == null && n === 0) { out = rep + '\n'; n++; continue; } return { error: 'ส่วน SEARCH ว่างเปล่า (ใช้ได้เฉพาะสร้างไฟล์ใหม่)' }; }
    if (cur == null) return { error: 'ไฟล์นี้ยังไม่มี แต่ใช้ SEARCH/REPLACE (ไฟล์ใหม่ให้ส่งทั้งไฟล์)' };
    const at = findBlock(out, search);
    if (at && at !== -1) { out = out.slice(0, at.from) + rep + out.slice(at.to); n++; continue; }
    if (rep.trim() && out.includes(rep.trim())) continue; // ใช้ไปแล้ว
    return { error: at === -1 ? `ข้อความใน SEARCH ซ้ำหลายที่ในไฟล์ (ระบุบรรทัดรอบข้างให้ชัดขึ้น): ${search.split('\n')[0].slice(0, 80)}` : `ไม่พบข้อความใน SEARCH ในไฟล์นี้ (ต้องตรงกับไฟล์ปัจจุบัน): ${search.split('\n')[0].slice(0, 80)}` };
  }
  return { content: out.replace(/\n?$/, '\n') };
}
// ตรวจก่อนเขียนทับ: คืนข้อความปัญหา หรือ '' ถ้าผ่าน · ตรวจเฉพาะสิ่งที่ตัดสินได้แน่ (JSON, JS ธรรมดา, ไฟล์หดผิดปกติ) เพื่อไม่ปฏิเสธไฟล์ที่ถูกต้อง
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
function problemOf(path, next, cur) {
  if (/\.json$/i.test(path)) { try { JSON.parse(next); } catch (e) { return `JSON ไม่ถูกต้อง: ${e.message}`; } }
  else if (/\.(?:js|mjs|cjs)$/i.test(path) && !/^\s*(?:import|export)\b/m.test(next) && !/<\/?[A-Za-z][\w.-]*[\s>/]/.test(next)) { // ไม่มี import/export/JSX/HTML ในไฟล์ → ลอง parse ได้ตรงๆ
    try { new AsyncFn(next); } catch (e) { if (e instanceof SyntaxError) return `JavaScript มี syntax error: ${e.message}`; }
  }
  if (cur && cur.length > 2000 && next.length < cur.length * 0.5 && !/\.(?:md|txt|csv|log)$/i.test(path)) return `ไฟล์หดลงเหลือ ${Math.round(next.length / cur.length * 100)}% ของเดิม (${cur.length} → ${next.length} ตัวอักษร) อาจถูกตัดกลางทาง`;
  return '';
}
// โมเดลบางตัวส่งโค้ดทั้งไฟล์โดยไม่ใส่ path= : ถ้าเป็นบล็อกเดียว ภาษาตรงกับไฟล์ที่เปิดอยู่ และยาวพอ (≥60% ของไฟล์เดิม) ให้เสนอเป็นการ์ด "ใช้กับไฟล์นี้" (ไม่ใช้อัตโนมัติ)
const LANG_EXT = { javascript: 'js', js: 'js', jsx: 'js', typescript: 'ts', ts: 'ts', tsx: 'ts', python: 'py', py: 'py', html: 'html', htm: 'html', css: 'css', json: 'json', markdown: 'md', md: 'md', yaml: 'yml', yml: 'yml', xml: 'xml', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', go: 'go', rust: 'rs', rs: 'rs', php: 'php', ruby: 'rb', rb: 'rb' };
const looseCode = text => [...String(text || '').matchAll(/```([^\n`]*)\n([\s\S]*?)\n?```/g)].filter(m => { const info = m[1].trim(); return info && !/\bpath=/.test(info) && !NOT_FILE_LANG.test(info.split(/\s+/)[0]) && !/^(?:ask|mermaid|math)$/i.test(info); });
function changesOf(text, getFile = p => has(p) ? content(p) : null, active = null) {
  const map = new Map();
  text = String(text || '');
  let last = 0;
  for (const m of text.matchAll(/```([^\n`]*)\n([\s\S]*?)\n?```/g)) {
    const info = m[1].trim(), before = text.slice(last, m.index); last = m.index + m[0].length;
    let path = info.match(/\bpath=([^\s`]+)/)?.[1];
    if (!path) {
      const [lang, ...rest] = info.split(/\s+/);
      if (NOT_FILE_LANG.test(lang)) continue;
      path = rest.map(x => x.replace(/^(?:file|filename|title|name)=["']?|["']$/g, '')).find(x => FILE_NAME.test(x));
      if (!path) { // บรรทัดไม่ว่างสุดท้ายเหนือบล็อก: หัวข้อหรือตัวหนาที่ขึ้นต้นด้วยชื่อไฟล์
        const line = before.split('\n').map(x => x.trim()).filter(Boolean).at(-1) || '';
        const f = line.length < 160 && line.match(/^(?:#{1,6}\s*|\*{1,2}|(?:file|ไฟล์)\s*[:：]?\s*)?[`*]*([\w][\w./-]{0,150}\.[A-Za-z0-9]{1,8})[`*]*(?=$|[\s:：(（\-–—])/i);
        if (f && FILE_NAME.test(f[1]) && !/^https?:/i.test(f[1])) path = f[1];
      }
    }
    if (path && isEditBody(m[2])) {
      const prev = map.get(path), cur = prev && !prev.error ? prev.content : getFile(path), r = applyEdits(cur, m[2]);
      map.set(path, r.error ? { path, error: r.error, edit: true } : { path, content: r.content, edit: true });
    } else if (path) map.set(path, { path, content: m[2].replace(/\n?$/, '\n') });
  }
  for (const m of text.matchAll(/^DELETE path=(\S+)/gm)) map.set(m[1], { path: m[1], del: true });
  if (!map.size && active) { // เดาไฟล์จากบล็อกเดียวที่ไม่มี path=
    const loose = looseCode(text), cur = getFile(active.path);
    if (loose.length === 1 && cur != null && cur.length > 0) {
      const lang = loose[0][1].trim().split(/\s+/)[0].toLowerCase(), ext = (active.path.match(/\.([^.\/]+)$/)?.[1] || '').toLowerCase(), body = loose[0][2];
      if (LANG_EXT[lang] && LANG_EXT[lang] === ext && body.length >= cur.length * 0.6 && !isEditBody(body)) map.set(active.path, { path: active.path, content: body.replace(/\n?$/, '\n'), guess: true });
    }
  }
  return [...map.values()];
}
function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n'); let s = 0;
  while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length, eb = B.length;
  while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea--; eb--; }
  const x = A.slice(s, ea), y = B.slice(s, eb), n = x.length, m = y.length, ops = [];
  if (n * m > 4e6) { x.forEach(l => ops.push(['-', l])); y.forEach(l => ops.push(['+', l])); }
  else { // LCS ระดับบรรทัด
    const t = new Int32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * (m + 1) + j] = x[i] === y[j] ? t[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(t[(i + 1) * (m + 1) + j], t[i * (m + 1) + j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { ops.push([' ', x[i]]); i++; j++; }
      else if (j < m && (i === n || t[i * (m + 1) + j + 1] >= t[(i + 1) * (m + 1) + j])) ops.push(['+', y[j++]]);
      else ops.push(['-', x[i++]]);
    }
  }
  return { before: A.slice(Math.max(0, s - 3), s), ops, after: A.slice(ea, ea + 3), start: s, add: ops.filter(o => o[0] === '+').length, del: ops.filter(o => o[0] === '-').length };
}
function changeCards(m, i) {
  const ch = changesOf(m.content, undefined, activeRef()); if (!ch.length) return '';
  return `<div class="changes">${ch.map((c, k) => {
    if (c.error) return `<div class="chg"><span class="cpath">${icon(c.path)} ${esc(c.path)}</span><span class="bad" title="${esc(c.error)}">แก้ไม่ได้</span><span class="muted" style="font-size:12px">${esc(c.error.slice(0, 90))}</span></div>`;
    const cur = has(c.path) ? content(c.path) : null;
    const same = c.del ? cur == null : cur === c.content;
    const d = !c.del && cur != null && !same ? lineDiff(cur, c.content) : null;
    const tag = c.del ? '<span class="bad">ลบ</span>' : cur == null ? '<span class="ok">ไฟล์ใหม่</span>' : d ? `<span class="ok">+${d.add}</span> <span class="bad">−${d.del}</span>` : '';
    return `<div class="chg"><span class="cpath">${icon(c.path)} ${esc(c.path)}</span>${tag}
      ${same ? '<span class="muted">ใช้แล้ว ✓</span>' : `${c.del ? '' : `<button data-diff="${i}:${k}">View diff</button>`}<button class="ap" data-apply="${i}:${k}">${c.del ? 'Delete file' : c.guess ? 'Apply to this file' : 'Apply'}</button>`}</div>`;
  }).join('')}<div class="row" style="padding:2px 6px">${ch.filter(needsApply).length > 1 ? `<button class="btn blue sm" data-applyall="${i}">Apply all</button>` : ''}${m._prev?.length ? `<button class="btn out sm" data-revert="${i}">${ic('undo', 'sm')} Undo this batch</button>` : ''}</div></div>`;
}
const activeRef = () => IDE.active && has(IDE.active) && !isImg(IDE.active) ? { path: IDE.active } : null;
const needsApply = c => !c.error && !c.guess && (c.del ? has(c.path) : !has(c.path) || content(c.path) !== c.content);
// ใช้การแก้ไขทั้งหมดของข้อความนี้ · คืนรายการที่ใช้ไม่ได้ (SEARCH ไม่ตรง / ไฟล์ไม่ผ่านการตรวจ) เพื่อส่งกลับให้ AI แก้เอง
async function applyChanges(ch, msg) {
  const bad = [];
  for (const c of ch) {
    if (c.error) { bad.push(`${c.path}: ${c.error}`); continue; }
    if (!needsApply(c)) continue;
    try { await apply(c, msg, false); } catch (x) { if (x.problem) bad.push(`${c.path}: ${x.message}`); else throw x; }
  }
  if (bad.length) { msg.rejected = bad; $('#ce').textContent = 'มีไฟล์ที่ยังไม่ถูกใช้: ' + bad.length + ' ไฟล์'; drawAI(); }
  return bad;
}
// ส่งปัญหากลับให้ AI (ไม่เกิน 3 รอบ) · AI ต้อง READ ไฟล์ก่อนแก้ซ้ำ
async function feedBack(bad) {
  if (!bad.length || (IDE.round ?? 0) >= 3) return;
  IDE.round = (IDE.round ?? 0) + 1;
  await codeSend({ auto: { text: `การแก้ไขบางไฟล์ยังไม่ถูกใช้ ไม่มีอะไรถูกเขียนทับในไฟล์เหล่านี้:\n${bad.map(x => '- ' + x).join('\n')}\n\nใช้ READ อ่านไฟล์ที่เกี่ยวข้องก่อน แล้วส่งการแก้ที่ถูกต้องใหม่ (ถ้าแก้ไฟล์ที่มีอยู่ ให้ SEARCH ตรงกับเนื้อหาจริงของไฟล์ ถ้าเปลี่ยนเกือบทั้งไฟล์ให้ส่งทั้งไฟล์)` } });
}
async function apply(c, msg, force = true) {
  if (!c.del && !force) { const why = problemOf(c.path, c.content, has(c.path) ? content(c.path) : null); if (why) throw Object.assign(new Error(why), { problem: true }); }
  if (msg) {
    msg._prev ||= [];
    if (!msg._prev.some(x => x.path === c.path)) msg._prev.push({ path: c.path, existed: has(c.path), prev: has(c.path) ? content(c.path) : '' });
  }
  if (c.del) {
    if (!has(c.path)) return;
    await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(c.path)}`, { method: 'DELETE' }); dropFile(c.path);
  } else await writeFiles([{ path: c.path, content: c.content }]);
  refresh(); drawAI();
}
function showDiff(c, label = 'Apply') {
  const cur = has(c.path) ? content(c.path) : '', d = lineDiff(cur, c.content);
  let ln = d.start - d.before.length;
  const line = (cls, sign, t) => `<div class="dl ${cls}"><span>${sign}</span>${esc(t) || ' '}</div>`;
  const body = d.before.map(t => line('', ' ', t)).join('')
    + d.ops.map(([o, t]) => line(o === '+' ? 'add' : o === '-' ? 'del' : '', o, t)).join('')
    + d.after.map(t => line('', ' ', t)).join('');
  const box = document.createElement('div'); box.className = 'diffbox';
  box.innerHTML = `<div class="diff-h"><b>${esc(c.path)}</b> <span class="ok">+${d.add}</span> <span class="bad">−${d.del}</span><span style="flex:1"></span>
    <button class="btn blue sm" id="dapply">${label}</button><button class="btn out sm" id="dclose">Close</button></div>
    <div class="diff-b">${ln > 0 ? `<div class="dl muted">… บรรทัด ${ln + 1}</div>` : ''}${body}</div>`;
  $('.ide').append(box);
  box.querySelector('#dclose').onclick = () => box.remove();
  box.querySelector('#dapply').onclick = async () => { box.remove(); await apply(c); };
}
// บรรทัด READ / GREP / LIST ที่ AI ใช้อ่านไฟล์ → แสดงเป็นป้ายเล็กๆ
const TOOL_LABEL = { IMAGE: ['image', 'สร้างรูป'], READ: ['filetext', 'อ่านไฟล์'], GREP: ['search', 'ค้นหา'], LIST: ['folder', 'ดูโฟลเดอร์'], RUN: ['terminal', 'รันคำสั่ง'] };
function stepsOf(text) {
  const out = [];
  for (const m of String(text || '').replace(/```[\s\S]*?```/g, '').replace(/(\S)(READ path=)/g, '$1\n$2').matchAll(/^[ \t]*(READ|GREP|LIST|RUN|IMAGE)\b[ \t]*(?:path=)?(.*)$/gm)) {
    const a = m[2].trim();
    out.push({ op: m[1], arg: m[1] === 'READ' || m[1] === 'LIST' ? a.match(/^[`'"]?([\w./@~-]*)/)?.[1] || a : a });
  }
  return out;
}
// โมเดลบางตัว (เช่น DeepSeek Flash) พิมพ์โค้ดโดยไม่ใส่กรอบ ``` ทำให้หน้าจอแสดงเป็นข้อความธรรมดา เยื้องหายและบรรทัดติดกัน
// เฉพาะข้อความที่ไม่มี ``` เลย: หาช่วงบรรทัดที่เป็นโค้ด (ตั้งแต่ 4 บรรทัดขึ้นไปติดกัน) แล้วห่อเป็นกรอบโค้ดให้อ่านได้ · ไม่แตะข้อความที่มีกรอบอยู่แล้ว
const CODE_LINE = /^\s*(?:(?:const|let|var|function|async|class|import|export|return|if|else|for|while|switch|case|try|catch|def|from|elif|print|await|public|private|static|package|using|#include|<\/?[A-Za-z!][^>]*>?)\b|[}\])]+[;,)]*\s*$|\/\/|\/\*|\*\/|\*\s|@\w+|[\w.$\[\]'"`]+\s*(?:=|\+=|-=|=>|:)\s*\S|[\w.$]+\(.*\)[;,]?\s*$)|[;{}]\s*$/;
function fenceBare(text) {
  text = String(text || '');
  if (text.includes('```') || text.length < 80) return text;
  const L = text.split('\n'), out = []; let i = 0;
  while (i < L.length) {
    if (!CODE_LINE.test(L[i]) || /[\u0E00-\u0E7F]{3}/.test(L[i].replace(/(?:\/\/|#).*$|(['"`]).*?\1/g, ''))) { out.push(L[i++]); continue; } // บรรทัดภาษาไทยล้วนไม่ใช่โค้ด (ไม่นับคอมเมนต์/สตริง)
    let j = i, n = 0, end = i;
    while (j < L.length) {
      if (CODE_LINE.test(L[j])) { n++; end = j; j++; continue; }
      if (!L[j].trim()) { let k = j; while (k < L.length && !L[k].trim()) k++; if (k < L.length && CODE_LINE.test(L[k]) && k - j < 3) { j = k; continue; } }
      break;
    }
    if (n >= 4) { const body = L.slice(i, end + 1).join('\n'), lang = /^\s*(?:def |from \S+ import|import \w+$|print\()/m.test(body) ? 'python' : /^\s*<[A-Za-z!]/m.test(body) ? 'html' : /\{[^}]*:[^}]*;/.test(body) && !/\b(?:function|const|let)\b/.test(body) ? 'css' : 'js'; out.push('```' + lang, body, '```'); i = end + 1; }
    else { out.push(...L.slice(i, i + 1)); i++; }
  }
  return out.join('\n');
}
const stripTools = text => String(text || '').split(/```/).map((part, idx) => idx % 2 ? part : part.replace(/(\S)(READ path=)/g, '$1\n$2').replace(/^[ \t]*(?:READ|LIST)\b[ \t]*(?:path=)?[`'"]?[\w./@~-]*[`'"]?/gm, '').replace(/^[ \t]*(?:GREP|RUN|IMAGE)\b.*$/gm, '')).join('```').replace(/\n{3,}/g, '\n\n').trim();
function stepsBar(m, i) {
  const s = stepsOf(m.content); if (!s.length) return '';
  const cnt = k => s.filter(x => x.op === k).length;
  const parts = [['READ', 'อ่าน', 'ไฟล์'], ['GREP', 'ค้นหา', 'จุด'], ['LIST', 'ดู', 'โฟลเดอร์'], ['RUN', 'รัน', 'คำสั่ง'], ['IMAGE', 'สร้าง', 'รูป']].map(([k, v, u]) => cnt(k) ? `${v} ${cnt(k)} ${u}` : '').filter(Boolean);
  return `<button type="button" class="steps-bar" data-steps="${i}">${ic('terminal', 'sm')}<span>${parts.join(', ')}</span>${ic('right', 'sm')}</button>`;
}
const runCard = (m, i) => { const r = runsOf(m.content); return r.length ? `<div class="changes runs"><span class="muted">AI ขอรันคำสั่ง</span>${r.map(c => `<code>${esc(c)}</code>`).join('')}${m.ran ? '<span class="muted">รันแล้ว ✓</span>' : `<button class="btn blue sm" data-runai="${i}">${ic('terminal', 'sm')} รันแล้วส่งผลให้ AI</button>`}</div>` : ''; };
const ktok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
function aiMsgHTML(m, i) {
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    return `<div class="msg user ${m.auto ? 'auto' : ''}"><div class="b">${m.imgs ? `<div class="mimgs shot">${m.imgs.map(d => `<img src="${d}" alt="ภาพหน้าจอผลลัพธ์">`).join('')}</div>` : ''}${esc(m.content.replace(FILE_RE, '').replace(TREE_RE, '').replace(CHECK_RE, '').replace(/\n\n\[แนบรูป \d+ รูป\]/, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${icon(f[1])} <span>${esc(f[1])}</span></span>`).join('')}</div>` : ''}</div></div>`;
  }
  const ask = parseAsk(m.content, m.streaming);
  const cleanBody = fenceBare(stripTools(ask.text));
  const mcpH = m.mcps?.length ? `<div class="steps-bar mcp-live" style="cursor:default">${ic('server', 'sm')}<span>${m.mcps.map(x => esc(x.tool)).join(', ')}</span></div>` : '';
  return `<div class="msg ai">${hasSegs(m) ? '' : thinkHTML(m)}${mcpH}${m.streaming ? '' : stepsBar(m, i)}<div class="b">${hasSegs(m) ? segHTML(m, cleanBody) : cleanBody ? md(cleanBody) : m.thinking || ask.asks.length ? '' : waitHTML(m)}</div>${m.streaming ? '' : askHTML(ask.asks, i === IDE.msgs.length - 1 && !IDE.busy) + changeCards(m, i) + runCard(m, i)
    + `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${m.tin || m.tout ? `<span class="tok" title="Input ${m.tin || 0} · Output ${m.tout || 0} token">↑${ktok(m.tin || 0)} ↓${ktok(m.tout || 0)}${m.rounds ? ` · ${m.rounds} รอบ` : ''}${m.ctx ? ` · <button type="button" class="ctxm ${m.ctx.used / m.ctx.max >= 0.9 ? 'bad' : m.ctx.used / m.ctx.max >= 0.7 ? 'warn' : ''}" data-ctx title="แตะเพื่อดูว่าอะไรกิน context อยู่เท่าไร">ctx ${ktok(m.ctx.used)}/${ktok(m.ctx.max)}</button>` : ''}${m.cost ? ` · ฿${m.cost}` : ''}</span>` : ''}<button data-copy="${i}">Copy</button></div>`}</div>`;
}
function drawAI() {
  const box = $('#cmsgs'); if (!box) return;
  box.innerHTML = IDE.msgs.length ? IDE.msgs.map(aiMsgHTML).join('')
    : `<div class="empty" style="padding-top:24px"><div class="stat" style="font-size:22px">ให้ AI ช่วยเขียนโค้ด</div><div class="muted">AI อ่านได้ทุกไฟล์ในโปรเจกต์ และแก้ไฟล์ให้ได้ กด Apply เพื่อใช้การแก้ไข</div>
      <div class="chips">${['อธิบายโค้ดไฟล์นี้', 'หาบั๊กและแก้ให้', 'เพิ่มคอมเมนต์ภาษาไทย', 'ทำให้หน้าเว็บสวยขึ้น'].map(s => `<button data-cs="${s}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight; renderRich(box);
}
function codeStop() {
  IDE.round = 99;
  if (IDE.chatId) fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: IDE.chatId }) }).catch(() => {});
  IDE.ctrl?.abort();
}
async function codeSend(auto) {
  if (IDE.busy) return codeStop(); // กดหยุด = หยุดโหมดอัตโนมัติและหยุดฝั่งเซิร์ฟเวอร์ด้วย
  const resume = !!auto?.resume;
  if (resume && IDE.msgs.at(-1)?.role !== 'user') return;
  const t = $('#ct'), text = resume ? '' : auto ? auto.text : t.value.trim();
  if (!resume && !text) return;
  if (!auto) IDE.round = 0;
  await saveNow();
  const files = []; // ไม่มีระบบแนบไฟล์: AI อ่านไฟล์เองด้วย READ / GREP
  const tree = resume ? '' : [...IDE.files.keys()].join('\n').slice(0, 15000) + (IDE.active && has(IDE.active) ? `\n\n[ไฟล์ที่เปิดอยู่ในตัวแก้ไข: ${IDE.active}]` : '');
  // ไฟล์ที่เปิดอยู่ (ถ้าเป็นข้อความและไม่ใหญ่เกิน) + ข้อความที่ผู้ใช้เลือกไว้: AI ไม่ต้อง READ ซ้ำ (เซิร์ฟเวอร์ตัดออกจากข้อความเก่า)
  const openBlock = (() => {
    if (resume || auto || !IDE.active || !has(IDE.active) || isImg(IDE.active)) return '';
    const c = content(IDE.active), sel = IDE.view && !IDE.view.state.selection.main.empty ? IDE.view.state.sliceDoc(IDE.view.state.selection.main.from, IDE.view.state.selection.main.to) : '';
    return `\n\n[เนื้อหาไฟล์ที่เปิดอยู่]\n${IDE.active}${c.length > 8000 ? ' (ตัดเหลือ 8000 ตัวอักษรแรก)' : ''}:\n${c.slice(0, 8000)}${sel ? `\n\n[ข้อความที่ผู้ใช้เลือกไว้]\n${sel.slice(0, 3000)}` : ''}`;
  })();
  // โปรเจกต์เล็ก: ส่งเนื้อหาทุกไฟล์ข้อความไปตั้งแต่รอบแรก AI ไม่ต้องเสียหลายรอบอ่านทีละไฟล์ (รวมไม่เกิน 14,000 ตัวอักษร ไม่งั้นให้ AI อ่านเอง)
  const smallBlock = (() => {
    if (resume || auto) return '';
    const paths = [...IDE.files.keys()].filter(p => p !== IDE.active && !isImg(p)); let total = 0, parts = [];
    for (const p of paths) { const c = content(p); if (typeof c !== 'string' || c.startsWith('data:')) continue; total += c.length; if (total > 14000) return ''; parts.push(`${p}:\n${c}`); }
    return parts.length ? `\n\n[เนื้อหาไฟล์ในโปรเจกต์]\n${parts.join('\n\n')}` : '';
  })();
  const full = resume ? '' : `${text}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${tree}${openBlock}${smallBlock}`;
  const m = me.models.find(x => x.id === +$('#cmodel').value) || me.models[0];
  const images = auto?.images || [];
  if (!auto) { t.value = ''; t.style.height = 'auto'; }
  $('#ce').textContent = '';
  if (!resume) IDE.msgs.push({ role: 'user', content: withFiles(full, files), imgs: images.length ? images : null, auto: !!auto });
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true }; IDE.msgs.push(ai); drawAI();
  IDE.busy = true; IDE.ctrl = new AbortController(); $('#cgo').innerHTML = ic('stop'); $('#cgo').classList.add('stop');
  let raf = 0, started = false, netLost = false;
  try {
    const reqBody = resume ? { resume: true, chat_id: IDE.chatId } : { project_id: IDE.pid, chat_id: IDE.chatId, model_id: m.id, text: full, files, images, effort: m.effort !== 'none' ? $('#ceffort').value || null : null, skill_ids: IDE.skills, mcp_ids: IDE.mcps, agent: !!IDE.agent };
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: IDE.ctrl.signal, body: JSON.stringify(reqBody) });
    if (!r.ok) { const d = await r.json(); throw new Error(r.status === 429 && d.pct4h != null ? 'ลิมิตเต็มแล้ว' : d.error); }
    started = true;
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let k; while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 2);
        if (!line.startsWith('data: ')) continue;
        const d = JSON.parse(line.slice(6));
        if (d.chat_id) IDE.chatId = d.chat_id;
        if (d.mcp) { (ai.mcps ||= []).push(d.mcp); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) paintStreaming(last, ai); }); }
        if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) { const stick = nearBottom(b); paintStreaming(last, ai); if (stick) b.scrollTop = b.scrollHeight; } }); }
        if (d.error) $('#ce').textContent = d.error;
        if (d.round) { setStatus(`AI กำลังทำงาน · รอบที่ ${d.round}/${d.of}`); ai.doingBase = `รอบที่ ${d.round}/${d.of}${d.doing ? ' · ' + d.doing : ''}`; ai.doingAt = Date.now(); ai.doing = ai.doingBase; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) paintStreaming(last, ai);
          clearInterval(IDE.tick); IDE.tick = setInterval(() => { // นับวินาทีที่รอในรอบนี้ ให้เห็นว่ายังทำงานอยู่
            if (!ai.doing || !ai.streaming) { clearInterval(IDE.tick); return; }
            ai.doing = `${ai.doingBase} · ${Math.round((Date.now() - ai.doingAt) / 1000)} วินาที`; const el = $('#cmsgs')?.lastElementChild?.querySelector('.doing'); if (el) el.textContent = ai.doing;
          }, 1000); }
        if (d.t?.trim() && ai.doing) ai.doing = '';
        if (d.compacted) toast(`ย่อแชตอัตโนมัติแล้ว (${d.why})`, 'ok');
        if (d.trimmed) toast('context เต็ม: ตัดข้อความเก่าบางส่วนออกจากที่ส่งให้ AI', 'bad');
        if (d.done && IDE.agent && document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification('AstraCode', { body: 'AI ทำงานเสร็จแล้ว แตะเพื่อดูผล' }); } catch { /* บางเบราว์เซอร์ต้องใช้ service worker */ }
        if (d.done) { me.usage = d; $('#clim').innerHTML = limHTML(d); IDE.resumeTries = 0; if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; } if (d.ctx) ai.ctx = d.ctx; if (d.cost) ai.cost = d.cost; if (d.rounds > 1) ai.rounds = d.rounds; setStatus('บันทึกแล้ว ✓'); }
      }
    }
  } catch (x) {
    if (x.name !== 'AbortError') {
      // เครือข่ายหลุดกลางคำตอบ (สลับแอป ปิดจอ): เซิร์ฟเวอร์ยังตอบต่อเบื้องหลัง จึงต่อสตรีมกลับมาให้เอง แทนที่จะแจ้ง network error
      if (started && IDE.chatId && (IDE.resumeTries = (IDE.resumeTries || 0) + 1) <= 8) netLost = true;
      else { $('#ce').textContent = x.message; if (!started && !resume) { IDE.msgs.splice(-2, 2); if (!auto) t.value = text; } }
    }
  }
  cancelAnimationFrame(raf); ai.streaming = false; if (!ai.content && !ai.thinking && IDE.msgs.at(-1) === ai) IDE.msgs.pop();
  if (netLost) { // ทิ้งข้อความที่ได้มาครึ่งเดียว แล้วรอจนหน้าจอกลับมา เพื่อดึงคำตอบเต็มจากเซิร์ฟเวอร์
    if (IDE.msgs.at(-1) === ai) IDE.msgs.pop();
    IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI(); $('#ce').textContent = 'เครือข่ายหลุด กำลังต่อให้อัตโนมัติ...';
    const go = () => { $('#ce').textContent = ''; if (!IDE.busy && IDE.msgs.at(-1)?.role === 'user') codeSend({ resume: true }); };
    if (document.hidden) document.addEventListener('visibilitychange', function f() { if (!document.hidden) { document.removeEventListener('visibilitychange', f); setTimeout(go, 600); } });
    else setTimeout(go, 2000);
    return;
  }
  if (resume && !ai.content && !ai.thinking && IDE.chatId) { IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => IDE.msgs); IDE.resumeTries = 0; IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI(); return; } // ต้องคืนปุ่มส่งด้วย ไม่งั้นปุ่มหยุดค้างหลังต่อสตรีมกลับมาแล้วพบว่าตอบจบไปแล้ว // เซิร์ฟเวอร์ตอบจบไปแล้ว: โหลดคำตอบที่บันทึกไว้
  IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI();
  // โหมดอัตโนมัติ: ใช้การแก้ไขทันที แล้วให้ AI ดูผลลัพธ์เอง (สูงสุด 3 รอบ)
  // Auto-apply: ใช้การแก้ไขทันที (และรันคำสั่งที่ AI ขอ) · ตรวจผลเอง: ใช้การแก้ไข แล้วรัน + จับภาพให้ AI ดู (สูงสุด 3 รอบ)
  const runs = ai.content ? runsOf(ai.content) : [], ch = ai.content ? changesOf(ai.content, undefined, activeRef()) : [], autoOn = IDE.autoApply || IDE.autoMode || barAuto() || IDE.applyNext, imgs = ai.content ? imagesOf(ai.content) : [];
  IDE.applyNext = false; // หลังสร้างรูปเสร็จ คำตอบถัดไปที่ใส่รูปลงโค้ดจะถูกใช้ทันที
  try {
    if (imgs.length && !ai.imgdone && (IDE.round ?? 0) < 5) await imagesForAI(ai, imgs);
    else if (autoOn && runs.length && (IDE.round ?? 0) < 5) await runForAI(ai, runs);
    else if (!ch.length && !runs.length && !(ai.content && /^\s*(?:READ|GREP|LIST)\b/m.test(ai.content.replace(/```[\s\S]*?```/g, ''))) && ai.content && looseCode(ai.content).length && (IDE.round ?? 0) < 2) { // ตอบเป็นโค้ดลอยๆ ไม่ใช้รูปแบบที่ระบบแก้ไฟล์ได้: ขอให้ส่งใหม่ให้ถูก (ไม่เกิน 2 รอบ)
      IDE.round = (IDE.round ?? 0) + 1;
      await codeSend({ auto: { text: 'ข้อความก่อนหน้ายังไม่ได้แก้ไฟล์ เพราะโค้ดไม่ได้อยู่ในรูปแบบที่ระบบใช้ได้ คุณแก้ไฟล์ในโปรเจกต์ได้จริง ให้ส่งใหม่: ไฟล์ที่มีอยู่แล้วใช้บล็อก ```<ภาษา> path=<ไฟล์> ที่ข้างในเป็น <<<<<<< SEARCH / ======= / >>>>>>> REPLACE (คัดลอก SEARCH จากเนื้อหาไฟล์จริง) หรือส่งทั้งไฟล์ใน path= เดียวกัน ห้ามตอบว่าแก้ไฟล์ไม่ได้ และห้ามส่งโค้ดที่ไม่มี path=' } });
    }
    else if (autoOn && ch.length) { const bad = await applyChanges(ch, ai); if (bad.length) await feedBack(bad); else if ((IDE.autoMode || barAuto()) && (IDE.round ?? 0) < (IDE.agent ? 8 : 3)) await check(); }
  } catch (x) { $('#ce').textContent = x.message; }
}

// ---------- AI ดูผลลัพธ์เอง: รัน → จับภาพหน้าจอ + คอนโซล → ส่งให้ AI ตรวจ ----------
function shot() {
  return new Promise(ok => {
    if (!IDE.frame) return ok({});
    const timer = setTimeout(() => { IDE.shotWait = null; ok({ err: 'จับภาพไม่ทัน' }); }, 12000);
    IDE.shotWait = d => { clearTimeout(timer); ok({ img: d.shotResult, text: d.text, err: d.err }); };
    IDE.frame.contentWindow.postMessage({ shot: 1 }, '*');
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function check() {
  if (IDE.busy) return;
  IDE.round = (IDE.round ?? 0) + 1;
  const m = me.models.find(x => x.id === +$('#cmodel').value) || me.models[0];
  setStatus('กำลังรันและจับภาพผลลัพธ์...');
  await run();
  const isPy = /\.py$/i.test(IDE.active || '');
  if (isPy) { for (let i = 0; i < 60 && IDE.running; i++) await sleep(500); }
  else { for (let i = 0; i < 20 && IDE.pending; i++) await sleep(250); await sleep(1200); } // รอหน้าเว็บโหลดและวาดเสร็จ
  const s = isPy ? {} : await shot();
  const logs = IDE.logs.filter(l => l.type !== 'info').slice(-40).map(l => `[${l.type}] ${l.msg}`).join('\n') || '(ไม่มีข้อความในคอนโซล)';
  const images = s.img && m.vision ? [s.img] : [];
  const text = `ตรวจผลลัพธ์อัตโนมัติ รอบ ${IDE.round}${images.length ? '' : s.img ? ' (โมเดลนี้อ่านรูปไม่ได้ ส่งเฉพาะข้อความ)' : ''}\n\nคอนโซล:\n${logs}`
    + `\n\n[คำสั่งตรวจ]\nนี่คือผลลัพธ์หลังรันโปรเจกต์${images.length ? ' พร้อมภาพหน้าจอ' : ''}${!images.length && s.text ? `\nข้อความบนหน้าเว็บ:\n${s.text}` : ''}\nตรวจว่าทำงานถูกต้องตามที่ผู้ใช้ขอหรือไม่ ถ้ามีข้อผิดพลาดหรือหน้าตาไม่ตรง ให้แก้ไฟล์ตามรูปแบบ path= ถ้าถูกต้องแล้วให้ตอบสั้นๆ ว่าเสร็จแล้ว โดยไม่ต้องแก้ไฟล์`;
  setStatus('บันทึกแล้ว ✓'); setPane('ai');
  await codeSend({ text, images });
}

// ---------- GitHub: เชื่อม repo, ดูสถานะ, pull, push ----------
// ประวัติไฟล์: เก็บอัตโนมัติทุกครั้งที่แก้ (ห่างกัน 5 นาที), นำเข้า, pull, หรือ AI แก้
const SRC = { edit: 'ก่อนแก้ไข', import: 'ก่อนนำเข้า', git: 'ก่อน Pull จาก GitHub' };
async function versions() {
  const p = IDE.active; if (!p) return;
  await saveNow();
  document.querySelector('.verbox')?.remove();
  const list = await api(`/projects/${IDE.pid}/versions?path=${encodeURIComponent(p)}`);
  const box = document.createElement('div'); box.className = 'diffbox gitbox verbox';
  box.innerHTML = `<div class="diff-h"><b>ประวัติ: ${esc(p)}</b><span style="flex:1"></span><button class="btn out sm" data-x>Close</button></div>
    <div class="git-b">${list.length ? list.map(v => `<button class="ver" data-v="${v.id}"><span>${when(v.created_at)}</span><span class="muted">${SRC[v.source] || esc(v.source)} · ${num(v.size)} ตัวอักษร</span></button>`).join('')
      : '<p class="muted">ยังไม่มีประวัติ ระบบจะเก็บเวอร์ชันเก่าไว้ให้เมื่อไฟล์ถูกแก้</p>'}<p class="muted">เก็บล่าสุด 30 เวอร์ชันต่อไฟล์ · แตะเพื่อดูความต่าง แล้วกดกู้คืน</p></div>`;
  $('.ide').append(box);
  box.onclick = async e => {
    if (e.target.closest('[data-x]')) return box.remove();
    const b = e.target.closest('[data-v]'); if (!b) return;
    const v = await api(`/projects/${IDE.pid}/versions/${b.dataset.v}`);
    if (v.content === content(p)) return toast('เวอร์ชันนี้เหมือนไฟล์ปัจจุบัน');
    box.remove(); showDiff({ path: p, content: v.content }, 'กู้คืนเวอร์ชันนี้');
  };
}
async function gitPanel() {
  document.querySelector('.gitbox')?.remove();
  const box = document.createElement('div'); box.className = 'diffbox gitbox';
  box.innerHTML = `<div class="diff-h"><b>${ic('branch')} GitHub</b><span style="flex:1"></span><button class="btn out sm" id="gx">Close</button></div><div class="git-b" id="gb"><p class="muted">กำลังโหลด...</p></div>`;
  $('.ide').append(box); box.querySelector('#gx').onclick = () => box.remove();
  const gb = box.querySelector('#gb'), say = (h, bad) => { const m = gb.querySelector('.gmsg'); if (m) m.innerHTML = bad ? `<span class="bad">${esc(h)}</span>` : h; };
  const acct = await api('/github');
  if (!acct.connected) {
    gb.innerHTML = `<h3>เชื่อมบัญชี GitHub</h3>
      <ol class="steps"><li>เปิด <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
      <li>เลือก repo ที่จะใช้ แล้วตั้งสิทธิ์ <b>Contents: Read and write</b></li><li>กด Generate แล้วคัดลอก token มาวางด้านล่าง</li></ol>
      <form id="gt"><label>Personal access token</label><input name="token" type="password" placeholder="github_pat_..." autocomplete="off" required>
      <div class="row" style="margin-top:12px"><button class="btn blue">Connect</button></div></form>
      <p class="muted">token ถูกเข้ารหัสเก็บที่เซิร์ฟเวอร์ และไม่ถูกส่งกลับมาที่หน้าเว็บ${acct.secret ? '' : ' · <span class="bad">แอดมินยังไม่ได้ตั้ง SECRET_KEY จึงเชื่อมยังไม่ได้</span>'}</p><p class="gmsg"></p>`;
    gb.querySelector('#gt').onsubmit = async e => { e.preventDefault(); try { await api('/github', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); gitPanel(); } catch (x) { say(x.message, 1); } };
    return;
  }
  if (!IDE.gh) {
    gb.innerHTML = `<p class="muted">เชื่อมอยู่กับ <b>@${esc(acct.login)}</b> · <button class="linkb" id="gdis">Unlink</button></p>
      <h3>เชื่อมโปรเจกต์นี้กับ repo</h3><form id="gl" class="form2"><div><label>Repo</label><input name="repo" placeholder="owner/repo" required></div>
      <div><label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main"></div><div style="align-self:end"><button class="btn blue">Connect repo</button></div></form>
      <p class="muted">เชื่อมแล้วกด Pull ก่อน เพื่อรวมไฟล์ใน repo กับไฟล์ในโปรเจกต์นี้</p><p class="gmsg"></p>`;
    gb.querySelector('#gl').onsubmit = async e => { e.preventDefault(); try { const r = await api(`/projects/${IDE.pid}/github`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); IDE.gh = { repo: r.repo, branch: r.branch }; $('#git').textContent = '⑂ ' + r.branch; gitPanel(); } catch (x) { say(x.message, 1); } };
    gb.querySelector('#gdis').onclick = async () => { if (await confirmSheet('ยกเลิกการเชื่อมบัญชี GitHub?', { title: 'ยกเลิกการเชื่อม', ok: 'Disconnect', danger: true })) { await api('/github', { method: 'DELETE' }); gitPanel(); } };
    return;
  }
  await saveNow();
  gb.innerHTML = `<p class="gm-repo"><a href="https://github.com/${esc(IDE.gh.repo)}/tree/${encodeURIComponent(IDE.gh.branch)}" target="_blank" rel="noopener">${esc(IDE.gh.repo)}</a> <span class="pill">${ic('branch', 'sm')} ${esc(IDE.gh.branch)}</span> <span class="muted">@${esc(acct.login)}</span></p>
    <div class="row"><button class="btn out sm" id="gf">${ic('refresh')} Fetch</button><button class="btn out sm" id="gp">${ic('pull')} Pull</button><button class="btn out sm" id="gun">Disconnect repo</button></div>
    <div class="row gbr"><select id="gbs" aria-label="branch"><option>${esc(IDE.gh.branch)}</option></select><button class="btn out sm" id="gnb">+ New branch</button><button class="btn out sm" id="gpr">Open Pull Request</button></div>
    <div id="gs" class="gstat"><p class="muted">กำลังตรวจสถานะ...</p></div>
    <form id="gc" class="gcommit"><label>ข้อความคอมมิต</label><input name="message" placeholder="อธิบายสิ่งที่เปลี่ยน" maxlength="500"><button class="btn blue" id="gpush">${ic('push')} Commit & Push</button></form><p class="gmsg"></p>`;
  const list = (t, xs, cls) => xs.length ? `<div class="gl"><b>${t}</b>${xs.map(x => `<div class="${cls}">${esc(x.path || x)}${x.status ? ` <span class="muted">${x.status}</span>` : ''}</div>`).join('')}</div>` : '';
  const status = async () => {
    const g = gb.querySelector('#gs'); g.innerHTML = '<p class="muted">กำลังตรวจสถานะ...</p>';
    try {
      const s = await api(`/projects/${IDE.pid}/github/status`), L = s.local, n = L.added.length + L.modified.length + L.deleted.length;
      g.innerHTML = (s.never ? '<p class="warn">ยังไม่เคย sync กด ↓ Pull ก่อนเพื่อรวมไฟล์กับ GitHub</p>'
        : s.behind ? `<p class="warn">GitHub มีคอมมิตใหม่ ${s.behind} คอมมิต กด ↓ Pull ก่อน push</p>` : '<p class="ok">✓ ตรงกับ GitHub ล่าสุด</p>')
        + (n ? `<p>แก้ในนี้ ${n} ไฟล์ ที่ยังไม่ได้ push</p>` : '<p class="muted">ไม่มีไฟล์ที่ยังไม่ได้ push</p>')
        + list('เพิ่ม', L.added, 'ga') + list('แก้ไข', L.modified, 'gmo') + list('ลบ', L.deleted, 'gd') + list('เปลี่ยนบน GitHub', s.remote, 'gmo');
      gb.querySelector('#gpush').disabled = s.never || s.behind > 0 || !n;
    } catch (x) { g.innerHTML = `<p class="bad">${esc(x.message)}</p>`; }
  };
  const pull = async resolve => {
    say('กำลังดึงไฟล์จาก GitHub...');
    try {
      const r = await api(`/projects/${IDE.pid}/github/pull`, { method: 'POST', body: { resolve } });
      await reload();
      say(`<span class="ok">✓ Pull แล้ว: อัปเดต ${r.updated.length} · ลบ ${r.deleted.length} ไฟล์${r.conflicts.length ? ` · ไฟล์ชนกัน ${r.conflicts.length} ใช้${resolve === 'remote' ? 'ของ GitHub' : 'ของเรา'}` : ''}</span>${r.skippedCount ? `<br><span class="muted">ข้าม ${r.skippedCount} ไฟล์ (รูป/ไบนารี/ใหญ่เกิน 500KB) ไฟล์เหล่านี้ยังอยู่บน GitHub ตามเดิม</span>` : ''}`);
      status();
    } catch (x) {
      const c = x.data?.conflicts;
      if (!c) return say(x.message, 1);
      say(`<span class="warn">ไฟล์ถูกแก้ทั้งในนี้และบน GitHub:</span>${c.map(p => `<div class="gmo">${esc(p)}</div>`).join('')}
        <div class="row" style="margin-top:8px"><button class="btn out sm" id="gr">Use GitHub's</button><button class="btn out sm" id="gk">Keep ours</button></div>`);
      gb.querySelector('#gr').onclick = () => pull('remote'); gb.querySelector('#gk').onclick = () => pull('local');
    }
  };
  const setBranch = br => { IDE.gh.branch = br; $('#git').innerHTML = ic('branch') + ' ' + esc(br); };
  api(`/projects/${IDE.pid}/github/branches`).then(b => {
    const sel = gb.querySelector('#gbs'); IDE.gh.default = b.default;
    sel.innerHTML = b.branches.map(n => `<option ${n === b.current ? 'selected' : ''}>${esc(n)}</option>`).join('');
    sel.onchange = async () => {
      if (!await confirmSheet(`สลับไป branch "${sel.value}"? ต้อง Pull ใหม่เพื่อรวมไฟล์`, { title: 'สลับ Branch', ok: 'Switch' })) { sel.value = IDE.gh.branch; return; }
      try { await api(`/projects/${IDE.pid}/github/switch`, { method: 'POST', body: { branch: sel.value } }); setBranch(sel.value); gitPanel(); } catch (x) { say(x.message, 1); }
    };
  }).catch(x => say(x.message, 1));
  gb.querySelector('#gnb').onclick = async () => {
    const name = await promptSheet('ชื่อ branch ใหม่ (สร้างจากคอมมิตที่ sync ล่าสุด)', 'feature/', { title: 'สร้าง Branch ใหม่', ok: 'Create' }); if (!name?.trim()) return;
    try { await api(`/projects/${IDE.pid}/github/branch`, { method: 'POST', body: { name: name.trim() } }); setBranch(name.trim()); gitPanel(); } catch (x) { say(x.message, 1); }
  };
  gb.querySelector('#gpr').onclick = () => {
    say(`<form id="prf" class="gcommit"><label>Pull Request: ${esc(IDE.gh.branch)} → <input name="base" value="${esc(IDE.gh.default || 'main')}" style="display:inline;width:140px;min-height:32px"></label>
      <input name="title" placeholder="หัวข้อ PR" maxlength="200" required><textarea name="body" rows="3" placeholder="รายละเอียด (ไม่ใส่ก็ได้)"></textarea><button class="btn blue sm">Create PR</button></form>`);
    gb.querySelector('#prf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api(`/projects/${IDE.pid}/github/pr`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); say(`<span class="ok">✓ สร้าง PR #${r.number} แล้ว</span> · <a href="${esc(r.url)}" target="_blank" rel="noopener">เปิดบน GitHub</a>`); }
      catch (x) { say(x.message, 1); }
    };
  };
  gb.querySelector('#gf').onclick = status;
  gb.querySelector('#gp').onclick = () => pull();
  gb.querySelector('#gun').onclick = async () => { if (!await confirmSheet('ยกเลิกการเชื่อม repo? ไฟล์ในโปรเจกต์ยังอยู่ครบ', { title: 'ยกเลิกการเชื่อม Repo', ok: 'Cancel' })) return; await api(`/projects/${IDE.pid}/github`, { method: 'DELETE' }); IDE.gh = null; $('#git').textContent = '⑂ Git'; gitPanel(); };
  gb.querySelector('#gc').onsubmit = async e => {
    e.preventDefault(); await saveNow(); e.submitter.disabled = true; say('กำลัง push...');
    try {
      const r = await api(`/projects/${IDE.pid}/github/push`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      say(r.nothing ? 'ไม่มีอะไรเปลี่ยน' : `<span class="ok">✓ Push แล้ว ${r.files} ไฟล์</span> · <a href="${esc(r.url)}" target="_blank" rel="noopener">ดูคอมมิต</a>`);
      e.target.reset(); status();
    } catch (x) { say(x.message, 1); e.submitter.disabled = false; }
  };
  status();
}

// ---------- หน้าหลักโหมด Code ----------
async function codeView(id) {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const d = await api('/projects/' + id);
  IDE.node?.f.remove(); IDE.node = null; // เทอร์มินัลของโปรเจกต์ก่อน
  Object.assign(IDE, { pid: d.id, name: d.name, instructions: d.instructions || '', gh: d.gh, files: new Map(d.files.map(f => [f.path, f.content])), states: new Map(), open: [], active: null,
    dirty: new Set(), filter: '', recent: (() => { try { return JSON.parse(localStorage.getItem('recent:' + d.id) || '[]'); } catch { return []; } })(), msgs: [], chatId: null, busy: false, logs: [], frame: null });
  if (IDE.worker) { IDE.worker.terminate(); IDE.worker = null; }
  const saved = localStorage.getItem('model');
  app.innerHTML = `<div class="ide view" data-pane="code">
    <header class="ide-bar"><button type="button" class="icon-btn sm ide-burger" id="burger" aria-label="เมนูไฟล์" aria-expanded="false">${ic('menu')}</button><a class="icon-btn sm ide-back" href="/code" aria-label="กลับไปหน้าโปรเจกต์">‹</a><b class="pname">${esc(d.name)}</b><span id="ide-status" class="muted"></span><span style="flex:1"></span>
      <button class="btn out sm" id="git" aria-label="GitHub">${ic('branch')} ${d.gh ? esc(d.gh.branch) : 'Git'}</button><button class="btn blue sm" id="run" aria-label="รัน">${ic('play')} Run</button></header>
    <div class="ide-body">
      <aside class="ide-files">
        <div class="dr-tabs"><button type="button" data-dr="ai" aria-label="AI">${ic('sparkles')}</button><button type="button" data-dr="files" class="on" aria-label="ไฟล์">${ic('folder')}</button><button type="button" data-dr="find" aria-label="ค้นหาทั้งโปรเจกต์">${ic('search')}</button><button type="button" data-dr="git" aria-label="GitHub">${ic('branch')}</button><a href="/account" aria-label="บัญชี">${ic('user')}</a></div>
        <div class="dr-head"><div><b>${esc(d.name)}</b><div class="dr-links"><a href="/code" class="dr-back">‹ Projects</a><a href="/chat" class="dr-exit">Exit Code mode</a></div></div><button type="button" class="icon-btn sm" id="edset" aria-label="ตั้งค่าตัวแก้ไข">${ic('settings')}</button></div>
        <div class="dr-find"><input id="tfilter" type="search" placeholder="ค้นหาชื่อไฟล์" aria-label="ค้นหาชื่อไฟล์" autocomplete="off"></div><div id="recent" class="recent"></div>
        <div id="tree" class="tree"></div>
        <div class="ftools"><button class="btn out sm" id="nfile">+ File</button><button class="btn out sm" id="nfold">+ Folder</button><button class="btn out sm" id="gfind">${ic('search', 'sm')} ทั้งโปรเจกต์</button><button class="btn out sm" id="envb">${ic('settings', 'sm')} .env</button><button class="btn out sm" id="upl">Upload</button>
        <button class="btn out sm" id="zin">Import zip</button><button class="btn out sm" id="zout">Export zip</button>
        <input type="file" id="uplf" multiple hidden><input type="file" id="zinf" accept=".zip,application/zip" hidden></div></aside>
      <div class="ide-scrim" id="idescrim"></div>
      <section class="ide-main"><div class="ide-tabs" id="tabs"></div>
        <div class="ide-tools"><button id="undo" aria-label="ย้อนกลับ">${ic('undo')}</button><button id="redo" aria-label="ทำซ้ำ">${ic('redo')}</button><button id="find" aria-label="ค้นหา">${ic('search')}</button>
          <button id="fmtb" aria-label="จัดรูปแบบโค้ด" title="จัดรูปแบบโค้ด (Prettier)">${ic('code', 'sm')} จัดรูป</button><button id="wrapb" aria-label="ตัดบรรทัด">${ic('filetext', 'sm')} ตัดบรรทัด</button><button id="ghostb" aria-pressed="${localStorage.getItem('ghost') !== '0'}" title="ให้ AI เดาโค้ดต่อขณะพิมพ์ (ใช้ลิมิตเล็กน้อย)">${ic('sparkles', 'sm')} AI เดา ${localStorage.getItem('ghost') === '0' ? 'ปิด' : 'เปิด'}</button><button id="hist" aria-label="ประวัติไฟล์">${ic('activity', 'sm')} History</button><button id="save" aria-label="บันทึก">${ic('check', 'sm')} Save</button></div>
        <div id="editor" class="ide-editor"></div><div id="imgview" class="imgview" hidden></div>
        <button type="button" class="sel-ai" id="selai" hidden>${ic('sparkles', 'sm')} ถาม / แก้ส่วนที่เลือก</button>
        <form class="cmdbar" id="cmdbar"><div class="cmd-opts"><button type="button" id="bmdl" aria-haspopup="dialog"></button><button type="button" id="beff" aria-haspopup="dialog"></button><span class="muted">อัตโนมัติ: แก้ไฟล์ · รัน · ตรวจผล</span></div>
          <div class="cmd-in"><input id="cmdi" placeholder="สั่ง AI แก้ไฟล์นี้ เช่น เพิ่มปุ่มรีเซ็ต" aria-label="สั่ง AI" autocomplete="off"><button aria-label="ส่ง">${ic('up')}</button></div></form>
        <div class="mkeys" id="mkeys">${[['Tab', '  '], ['{ }', '{}', 1], ['( )', '()', 1], ['[ ]', '[]', 1], ['=>', ' => '], [';', ';'], ['" "', '""', 1], ["' '", "''", 1], ['< >', '<>', 1], ['/', '/'], ['=', ' = ']].map(([l, v, o]) => `<button type="button" data-ins="${esc(v)}" data-off="${o || 0}">${esc(l)}</button>`).join('')}</div>
        <div class="ide-run"><div class="run-h"><button data-rtab="out" class="on">Output</button><button data-rtab="con">Console</button><button data-rtab="term">Terminal</button><span id="run-status" class="muted"></span><span style="flex:1"></span>
          <button id="rmob" title="สลับขนาดมือถือ">${ic('smartphone', 'sm')}</button><button id="rfull" title="ขยายเต็มจอ">${ic('eye', 'sm')} Fullscreen</button><button id="stop">${ic('stop')} Stop</button><button id="clr">Clear</button><button id="hiderun" aria-label="ปิดแผงรัน">${ic('x')}</button></div>
          <div id="out" class="run-out"><p class="muted" style="padding:16px">กด รัน เพื่อดูผล</p></div><div id="console" class="console" hidden></div><div id="term" class="term" hidden><pre id="term-o"></pre><form id="term-f"><span>$</span><input id="term-i" placeholder="npm install lodash / npm test / node app.js" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="คำสั่ง"></form></div></div></section>
      <aside class="ide-ai"><div class="ai-h"><b class="ai-t">${ic('sparkles')} AI</b><span class="sp"></span><button class="lim" id="clim" aria-label="ลิมิตการใช้งาน"></button><button class="icon-btn sm" id="chist" aria-label="ประวัติแชตโปรเจกต์" title="ประวัติแชต">${ic('more')}</button><button class="icon-btn sm" id="cnew" aria-label="แชตใหม่">${ic('newchat')}</button>
        <button type="button" class="icon-btn sm" id="aiclose" aria-label="ปิดแผง AI">${ic('x')}</button>
        <select id="cmodel" hidden>${me.models.map(m => `<option value="${m.id}" ${String(m.id) === saved ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <select id="ceffort" hidden>${EFFORTS.map(([v]) => `<option value="${v}">${v}</option>`).join('')}</select></div>
        <div id="cmsgs" class="msgs"></div>
        <div class="compose"><div class="err" id="ce"></div>
          <form id="cf" class="cbox"><textarea id="ct" rows="1" placeholder="สั่ง AI เช่น เพิ่มปุ่มรีเซ็ต" aria-label="ข้อความถึง AI"></textarea>
            <div id="cflags" class="cflags"></div><div class="crow"><button type="button" class="cb" id="cplus" aria-label="เครื่องมือ">${ic('plus')}</button><button type="button" class="cb" id="cup" aria-label="อัปโหลดไฟล์เข้าโปรเจกต์">${ic('clip')}</button><button type="button" class="cb pick" id="cmdl" aria-haspopup="dialog"></button><button type="button" class="cb pick" id="ceff" aria-haspopup="dialog"></button>
              <button class="send" id="cgo" aria-label="ส่ง">${ic('up')}</button></div></form></div></aside>
    </div>
    <nav class="ide-nav">${[['files', 'folder', 'ไฟล์'], ['code', 'code', 'โค้ด'], ['ai', 'sparkles', 'AI'], ['run', 'play', 'ผลลัพธ์']].map(([k, i, l]) => `<button data-pane-btn="${k}" class="${k === 'code' ? 'on' : ''}"><span>${ic(i)}</span>${l}</button>`).join('')}</nav></div>`;

  IDE.view = new CM.EditorView({ parent: $('#editor'), state: CM.EditorState.create({ doc: '' }) });
  const first = has('index.html') ? 'index.html' : [...IDE.files.keys()][0];
  if (first) openFile(first); else refresh();
  setStatus('บันทึกแล้ว ✓'); applyEditorPrefs();
  if (!IDE.menuClose) { IDE.menuClose = true; document.addEventListener('click', e => { if (!e.target.closest('.tmenu, .tmore')) document.querySelector('.tmenu')?.remove(); }); }
  $('#nfold').onclick = () => newFolder();
  $('#tfilter').oninput = e => { IDE.filter = e.target.value; drawTree(); drawRecent(); }; $('#edset').onclick = editorSettings; $('#aiclose').onclick = () => openAI(false);
  $('#cmdbar').onsubmit = e => { e.preventDefault(); const i = $('#cmdi'), v = i.value.trim(); if (!v || IDE.busy) return; $('#ct').value = v; $('#ct').dispatchEvent(new Event('input')); i.value = ''; openAI(true); codeSend(); };

  $('#cmodel').onchange = e => { localStorage.setItem('model', e.target.value); cUI(); };
  $('#ceffort').value = localStorage.getItem('effort') || ''; $('#ceffort').onchange = e => { localStorage.setItem('effort', e.target.value); cUI(); };
  $('#cmdl').onclick = $('#bmdl').onclick = () => modelSheet('#cmodel'); $('#ceff').onclick = $('#beff').onclick = () => effortSheet('#ceffort', me.models.find(x => x.id === +$('#cmodel').value) || me.models[0]); $('#clim').onclick = limitSheet; $('#cplus').onclick = codeTools; $('#cup').onclick = () => $('#uplf').click();
  $('#cflags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'bgagent') { bgAgentSheet(); return; } if (f === 'agent') { IDE.agent = false; localStorage.setItem('agent', '0'); toast('ปิดโหมด Agent', 'ok'); cUI(); return; } if (f === 'sk') { IDE.skills = IDE.skills.filter(x => x !== +e.target.closest('[data-sid]').dataset.sid); localStorage.setItem('cskills', JSON.stringify(IDE.skills)); cUI(); }
    else if (f === 'mc') { IDE.mcps = IDE.mcps.filter(x => x !== +e.target.closest('[data-mid]').dataset.mid); localStorage.setItem('cmcps', JSON.stringify(IDE.mcps)); cUI(); } else if (f) { setOpt(f, false); cUI(); } };
  $('#clim').innerHTML = limHTML(me.usage); agWatch().catch(() => {}); Promise.all([loadSkills(), loadMcps()]).then(() => cUI()); cUI();
  document.querySelectorAll('[data-pane-btn]').forEach(b => b.onclick = () => { if (b.dataset.paneBtn === 'files') return drawer(true); if (b.dataset.paneBtn === 'run') showRun(true); if (b.dataset.paneBtn === 'ai') return openAI(!(aiMode() !== 'page' && isPhone() && $('.ide').dataset.ai)); setPane(b.dataset.paneBtn); });
  $('#burger').onclick = () => drawer(!$('.ide').dataset.drawer); $('#idescrim').onclick = () => drawer(false);
  document.querySelectorAll('[data-dr]').forEach(b => b.onclick = () => { const k = b.dataset.dr; if (k === 'files') return; drawer(false); if (k === 'ai') openAI(true); else if (k === 'find') $('#gfind').click(); else if (k === 'git') $('#git').click(); });
  $('.ide-files').addEventListener('click', e => { if (e.target.closest('.dr-back, .dr-exit, .dr-tabs a')) drawer(false); });
  $('#term-f').onsubmit = async e => { e.preventDefault(); const i = $('#term-i'), cmd = i.value.trim(); if (!cmd || IDE.termBusy) return; i.value = ''; IDE.termBusy = true; try { await nodeRun(cmd); } finally { IDE.termBusy = false; i.focus(); } };
  $('#run').onclick = run; $('#git').onclick = () => gitPanel(); $('#stop').onclick = stopRun; $('#clr').onclick = () => { IDE.logs = []; $('#console').innerHTML = ''; };
  $('#hiderun').onclick = () => { $('.ide').classList.remove('run-full'); $('#rfull')?.classList.remove('on'); showRun(false); setPane('code'); };
  document.querySelectorAll('[data-rtab]').forEach(b => b.onclick = () => runTab(b.dataset.rtab));
  $('#undo').onclick = () => { CM.undo(IDE.view); IDE.view.focus(); }; $('#redo').onclick = () => { CM.redo(IDE.view); IDE.view.focus(); };
  $('#find').onclick = () => CM.openSearchPanel(IDE.view); $('#save').onclick = saveNow;
  $('#wrapb').onclick = () => { const on = localStorage.getItem('wrap') === '0'; localStorage.setItem('wrap', on ? '1' : '0'); IDE.view.dispatch({ effects: wrap.reconfigure(on ? CM.EditorView.lineWrapping : []) }); for (const [p, s] of IDE.states) if (p !== IDE.active) IDE.states.set(p, s.update({ effects: wrap.reconfigure(on ? CM.EditorView.lineWrapping : []) }).state); };
  $('#ghostb').onclick = e => {
    const on = localStorage.getItem('ghost') === '0'; localStorage.setItem('ghost', on ? '1' : '0');
    e.target.textContent = 'AI เดา ' + (on ? 'เปิด' : 'ปิด'); e.target.setAttribute('aria-pressed', on);
    IDE.view.dispatch({ effects: ghostC.reconfigure(ghostExt()) });
    for (const [p, st] of IDE.states) if (p !== IDE.active) IDE.states.set(p, st.update({ effects: ghostC.reconfigure(ghostExt()) }).state);
  };
  $('#hist').onclick = () => versions().catch(x => setStatus(x.message, true));
  $('#nfile').onclick = () => newFile();
  $('#upl').onclick = () => $('#uplf').click(); $('#uplf').onchange = async e => { try { await uploadFiles([...e.target.files]); } catch (x) { setStatus(x.message, true); } e.target.value = ''; };
  $('#zin').onclick = () => $('#zinf').click(); $('#zinf').onchange = async e => { try { await importZip(e.target.files[0]); } catch (x) { setStatus('zip: ' + x.message, true); } e.target.value = ''; };
  $('#zout').onclick = () => exportZip().catch(x => setStatus(x.message, true));
  $('#cnew').onclick = () => { IDE.chatId = null; IDE.msgs = []; drawAI(); };
  $('#chist').onclick = async () => {
    const list = await api('/chats?project=' + IDE.pid).catch(() => []);
    if (!list.length) return toast('ยังไม่มีประวัติแชตในโปรเจกต์นี้');
    sheet('ประวัติแชตในโปรเจกต์', list.map(c => optHTML(c.id, ic('msg') + esc(c.title), c.id === IDE.chatId ? 'กำลังเปิดอยู่' : '', c.id === IDE.chatId)).join(''), (d, close) => {
      d.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => {
        close(); IDE.chatId = +b.dataset.v; IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => []); drawAI();
      });
    });
  };
  $('#rmob').onclick = e => { $('#out').classList.toggle('mob'); e.currentTarget.classList.toggle('on'); };
  $('#rfull').onclick = e => { $('.ide').classList.toggle('run-full'); e.currentTarget.classList.toggle('on'); };
  $('.ide-run').addEventListener('click', e => {
    const b = e.target.closest('[data-fix]'); if (!b || IDE.busy) return;
    setPane('ai'); IDE.round = 0;
    codeSend({ text: `ช่วยแก้ error นี้ให้หน่อย (กำลังเปิดไฟล์ ${IDE.active || '-'}):\n\`\`\`\n${b.dataset.fix}\n\`\`\`` });
  });
  $('#mkeys').onmousedown = e => e.preventDefault();
  $('#mkeys').onclick = e => {
    const b = e.target.closest('[data-ins]'); if (!b || !IDE.view) return;
    const ins = b.dataset.ins, off = +b.dataset.off || 0, { from, to } = IDE.view.state.selection.main;
    IDE.view.dispatch({ changes: { from, to, insert: ins }, selection: { anchor: from + ins.length - off } });
    IDE.view.focus();
  };
  $('#selai').onclick = () => {
    const st = IDE.view?.state, sel = st?.selection.main; if (!sel || sel.empty) return;
    const code = st.sliceDoc(sel.from, sel.to), l1 = st.doc.lineAt(sel.from).number, l2 = st.doc.lineAt(sel.to).number;
    const ct = $('#ct'); setPane('ai');
    ct.value = `จากไฟล์ \`${IDE.active}\` บรรทัด ${l1}${l2 > l1 ? '-' + l2 : ''}:\n\`\`\`\n${code}\n\`\`\`\nช่วย`;
    ct.oninput(); ct.focus();
  };
  $('#fmtb').onclick = formatActive; $('#envb').onclick = envSheet;
  $('#ide-status')?.addEventListener('click', () => { const e = IDE.synErr; if (!e) return; if (e.path !== IDE.active) openFile(e.path); if (e.ln) { const ln = Math.min(e.ln, IDE.view.state.doc.lines); IDE.view.dispatch({ selection: { anchor: IDE.view.state.doc.line(ln).from }, scrollIntoView: true }); IDE.view.focus(); } });
  $('#gfind').onclick = () => {
    document.querySelector('.gsearch')?.remove();
    const box = document.createElement('div'); box.className = 'diffbox gitbox gsearch';
    box.innerHTML = `<div class="diff-h"><b>${ic('search', 'sm')} ค้นหาทั้งโปรเจกต์</b><span style="flex:1"></span><button class="btn out sm" data-x>Close</button></div>
      <div class="git-b"><input id="gf-i" placeholder="พิมพ์คำหรือชื่อฟังก์ชันที่ต้องการค้นหา..." autofocus>
      <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input id="gf-w" placeholder="แทนที่ด้วย..." aria-label="แทนที่ด้วย" style="flex:1"><button class="btn out sm" id="gf-rep" disabled>แทนที่ทั้งหมด</button></div><div id="gf-r" style="margin-top:10px"></div></div>`;
    $('.ide').append(box);
    const inp = box.querySelector('#gf-i'), res = box.querySelector('#gf-r');
    setTimeout(() => inp.focus(), 30);
    box.onclick = e => { if (e.target.closest('[data-x]')) box.remove(); };
    const repB = box.querySelector('#gf-rep'), repI = box.querySelector('#gf-w');
    repB.onclick = async () => { // แทนที่ทุกที่ในโปรเจกต์ (ไม่สนตัวพิมพ์เล็กใหญ่ เหมือนการค้นหา) แล้วบันทึกอัตโนมัติ · ย้อนกลับได้จากประวัติไฟล์
      const q = inp.value.trim(), rep = repI.value; if (!q) return;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), todo = [];
      for (const fp of IDE.files.keys()) { if (isImg(fp)) continue; const c = content(fp), n = (c.match(re) || []).length; if (n) todo.push([fp, c, n]); }
      const total = todo.reduce((a, x) => a + x[2], 0); if (!total) return toast('ไม่พบคำที่ค้นหา');
      if (!await confirmSheet(`แทนที่ "${q}" ด้วย "${rep}" ${total} จุดใน ${todo.length} ไฟล์?`, { title: 'แทนที่ทั้งโปรเจกต์', ok: 'Replace all' })) return;
      for (const [fp, c] of todo) {
        const next = c.replace(re, () => rep);
        if (fp === IDE.active) IDE.view.dispatch({ changes: { from: 0, to: IDE.view.state.doc.length, insert: next } });
        else { IDE.files.set(fp, next); IDE.states.delete(fp); }
        markDirty(fp);
      }
      toast(`แทนที่ ${total} จุดแล้ว`, 'ok'); inp.oninput(); drawTabs();
    };
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase(); repB.disabled = !q;
      if (!q) { res.innerHTML = '<p class="muted">พิมพ์คำที่ต้องการค้นหา</p>'; return; }
      const hits = [];
      for (const fp of IDE.files.keys()) {
        if (isImg(fp)) continue;
        const lines = content(fp).split('\n');
        for (let i = 0; i < lines.length && hits.length < 80; i++) {
          if (lines[i].toLowerCase().includes(q)) hits.push({ fp, ln: i + 1, txt: lines[i].trim().slice(0, 120) });
        }
      }
      res.innerHTML = hits.length ? hits.map(h => `<button class="ver" data-go="${esc(h.fp)}" data-ln="${h.ln}"><b>${esc(h.fp)}:${h.ln}</b><span class="muted">${esc(h.txt)}</span></button>`).join('') : '<p class="muted">ไม่พบคำที่ค้นหา</p>';
      res.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
        openFile(b.dataset.go);
        const ln = Math.min(+b.dataset.ln, IDE.view.state.doc.lines), pos = IDE.view.state.doc.line(ln).from;
        IDE.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        IDE.view.focus(); box.remove();
      });
    };
  };
  IDE.autoMode = true; IDE.autoApply = true; // โหมด Code ใช้การแก้ไขและรันทดสอบอัตโนมัติเสมอ (ปิดไม่ได้)
  const ct = $('#ct');
  ct.oninput = () => { ct.style.height = 'auto'; ct.style.height = ct.scrollHeight + 'px'; };
  slashSkills(ct, () => IDE.skills, ids => { IDE.skills = ids; localStorage.setItem('cskills', JSON.stringify(ids)); cUI(); });
  ct.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#cf').requestSubmit(); } };
  $('#cf').onsubmit = e => { e.preventDefault(); codeSend(); };
  const answer = e => { const a = askAnswer(e); if (a != null && !IDE.busy) { e.preventDefault?.(); ct.value = a; codeSend(); } return a != null; };
  $('#cmsgs').onkeydown = answer;
  $('#cmsgs').onclick = async e => {
    if (answer(e)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ctx != null) return ctxSheet({ chatId: IDE.chatId, projectId: IDE.pid, modelId: +$('#cmodel')?.value || null, skills: IDE.skills, onCompact: () => {} });
    if (b.classList.contains('cp-code')) return copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.dataset.copy) return copy(IDE.msgs[+b.dataset.copy].content, b);
    if (b.dataset.cs) { ct.value = b.dataset.cs; ct.focus(); return; }
    if (b.dataset.runai) { if (IDE.busy) return; b.disabled = true; const m = IDE.msgs[+b.dataset.runai]; IDE.round = 0; try { await runForAI(m, runsOf(m.content)); } catch (x) { $('#ce').textContent = x.message; } return; }
    const ref = (b.dataset.diff || b.dataset.apply || '').split(':').map(Number);
    const c = ref.length === 2 ? changesOf(IDE.msgs[ref[0]].content, undefined, activeRef())[ref[1]] : null;
    try {
      if (b.dataset.diff) { if (c.error) { toast(c.error, 'bad'); return; } showDiff(c); }
      if (b.dataset.apply) {
        if (c.error) { toast(c.error, 'bad'); return; }
        const why = c.del ? '' : problemOf(c.path, c.content, has(c.path) ? content(c.path) : null);
        if (why && !await confirmSheet(`${why}\n\nเขียนทับต่อไหม?`, { title: 'ตรวจพบปัญหาในไฟล์', ok: 'เขียนทับ', danger: true })) return;
        b.disabled = true; await apply(c);
      }
      if (b.dataset.steps != null) {
        const steps = stepsOf(IDE.msgs[+b.dataset.steps]?.content);
        sheet('ขั้นตอนการทำงาน', `<div class="step-tl">${steps.map(s => `<div class="step-i"><span class="step-ic">${ic(TOOL_LABEL[s.op][0], 'sm')}</span><div><b>${TOOL_LABEL[s.op][1]}</b><code>${esc(s.arg || '/')}</code></div></div>`).join('')}</div>`);
        return;
      }
      if (b.dataset.revert != null) {
        const msg = IDE.msgs[+b.dataset.revert]; if (!msg?._prev?.length) return;
        if (!await confirmSheet(`ย้อนกลับ ${msg._prev.length} ไฟล์ก่อน AI แก้ในรอบนี้?`, { title: 'ย้อนกลับการแก้ไข', ok: 'Undo' })) return;
        const writes = [], dels = [];
        for (const p of msg._prev) { if (p.existed) writes.push({ path: p.path, content: p.prev }); else dels.push(p.path); }
        if (writes.length) await writeFiles(writes);
        for (const dp of dels) { await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(dp)}`, { method: 'DELETE' }); dropFile(dp); }
        delete msg._prev; refresh(); drawAI(); toast('ย้อนกลับไฟล์เรียบร้อย', 'ok'); return;
      }
      if (b.dataset.applyall) { b.disabled = true; const m = IDE.msgs[+b.dataset.applyall], bad = await applyChanges(changesOf(m.content, undefined, activeRef()), m); if (bad.length) toast(bad[0], 'bad'); }
    } catch (x) { $('#ce').textContent = x.message; drawAI(); }
  };
  drawAI();
  const chats = await api('/chats?project=' + IDE.pid).catch(() => []); // เปิดแชตล่าสุดของโปรเจกต์
  if (chats[0]) { IDE.chatId = chats[0].id; IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => []); drawAI(); if (IDE.msgs.at(-1)?.role === 'user') codeSend({ resume: true }); }
}
addEventListener('beforeunload', e => { if (IDE.dirty.size) { saveNow(); e.preventDefault(); } });
