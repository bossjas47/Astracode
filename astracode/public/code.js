// AstraCode: โหมด Code ใช้ตัวแปรกลางจาก app.js
PAGES.code = () => qs().get('p') ? codeView(qs().get('p')) : codeHome();
const IDE = {
  pid: null, name: '', files: new Map(), states: new Map(), open: [], active: null, view: null,
  dirty: new Set(), saveT: null, status: '', closed: new Set(),
  chatId: null, msgs: [], busy: false, ctrl: null, ctx: new Set(), autoActive: true,
  worker: null, frame: null, logs: [], runTab: 'out', pane: 'code',
};
const TREE_RE = /\n\n\[ไฟล์ทั้งหมดในโปรเจกต์\]\n[\s\S]*?(?=\n\n\[\[file:|$)/;
const CHECK_RE = /\n\n\[คำสั่งตรวจ\]\n[\s\S]*?(?=\n\n\[ไฟล์ทั้งหมดในโปรเจกต์\]|\n\n\[\[file:|$)/;
const IGNORE = /(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store|dist|build)(\/|$)/;
const kb = n => n > 1024 ? Math.round(n / 102.4) / 10 + ' KB' : n + ' B';

// ---------- หน้ารวมโปรเจกต์ ----------
async function codeHome() {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const list = await api('/projects');
  page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 24px"><div class="name">AstraCode</div><h1>Code</h1>
    <p>เขียนโค้ดบนมือถือ มี AI ช่วยแก้ไฟล์ รัน HTML, JavaScript และ Python ได้ในเบราว์เซอร์</p></section>
    <form class="card row" id="nf"><input name="name" placeholder="ชื่อโปรเจกต์ใหม่" maxlength="60" required style="flex:1;min-width:180px"><button class="btn blue">+ สร้างโปรเจกต์</button></form>
    <details class="card clone"><summary><b>${ic('branch')} Clone จาก GitHub</b> <span class="muted">ดึง repo มาเป็นโปรเจกต์ใหม่</span></summary>
      <form id="cf2" class="form2" style="margin-top:12px"><div><label>Repo</label><input name="repo" placeholder="owner/repo หรือลิงก์ GitHub" required></div>
      <div><label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main"></div><div style="align-self:end"><button class="btn blue">Clone</button></div></form>
      <p class="muted" id="cmsg">ต้องเชื่อม GitHub ก่อน (ปุ่ม Git ในโปรเจกต์ไหนก็ได้)</p></details>
    <div class="err" id="e"></div>
    <div class="grid">${list.map(p => `<div class="tile proj"><a href="/code?p=${p.id}" style="color:inherit"><div style="font:600 19px var(--display)">${esc(p.name)}</div>
      <div class="muted">${p.files} ไฟล์ · ${kb(p.size)} · แก้ล่าสุด ${when(p.updated_at)}</div></a>
      <div class="row" style="margin-top:8px"><a class="btn blue sm" href="/code?p=${p.id}">เปิด</a><button class="btn out sm" data-ren="${p.id}">เปลี่ยนชื่อ</button><button class="btn red sm" data-del="${p.id}">ลบ</button></div></div>`).join('')
      || '<p class="muted" style="text-align:center">ยังไม่มีโปรเจกต์ สร้างอันแรกได้เลย ระบบจะใส่ไฟล์ตัวอย่างให้</p>'}</div>${footer()}</div>`);
  $('#nf').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    try { const r = await api('/projects', { method: 'POST', body: { name: new FormData(e.target).get('name') } }); go('/code?p=' + r.id); }
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
    const p = list.find(x => x.id === +b.dataset.ren), name = prompt('ชื่อโปรเจกต์', p.name);
    if (name?.trim()) { await api('/projects/' + p.id, { method: 'PUT', body: { name } }); codeHome(); }
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('ลบโปรเจกต์นี้ ไฟล์และแชตทั้งหมดจะหายถาวร?')) return;
    await api('/projects/' + b.dataset.del, { method: 'DELETE' }); codeHome();
  });
}

// ---------- ตัวแก้โค้ด ----------
const edTheme = () => CM.EditorView.theme({
  '&': { height: '100%', backgroundColor: '#000' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: matchMedia('(pointer:coarse)').matches ? '16px' : '13px', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: '#0e0e0e', border: 'none', color: '#6e6e73' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff0d' },
  '.cm-panels': { backgroundColor: '#1d1d1f', color: '#f5f5f7' },
  '.cm-ghost': { color: '#6e6e73', cursor: 'pointer' },
}, { dark: true });
const wrap = new CM.Compartment(), ghostC = new CM.Compartment();
// เติมโค้ดอัตโนมัติ: AI เดาต่อจากเคอร์เซอร์ (Tab หรือแตะข้อความเทาเพื่อรับ)
const ghostExt = () => localStorage.getItem('ghost') === '0' || window.DEMO ? [] : CM.ghost((prefix, suffix) => api('/complete', { method: 'POST', body: { prefix, suffix, path: IDE.active } }).then(r => r.text));
function extensions(path) {
  return [
    edTheme(), CM.basicSetup, CM.oneDark, CM.lang(path), // ธีมของเราไว้ก่อน oneDark เพื่อให้ชนะ
    wrap.of(localStorage.getItem('wrap') === '0' ? [] : CM.EditorView.lineWrapping), ghostC.of(ghostExt()),
    CM.keymap.of([CM.indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { saveNow(); return true; } }]),
    CM.EditorView.updateListener.of(u => { if (u.docChanged) markDirty(path); }),
  ];
}
function stateFor(path) {
  let s = IDE.states.get(path);
  if (!s) { s = CM.EditorState.create({ doc: IDE.files.get(path) ?? '', extensions: extensions(path) }); IDE.states.set(path, s); }
  return s;
}
const content = p => (p === IDE.active ? IDE.view.state : IDE.states.get(p))?.doc.toString() ?? IDE.files.get(p) ?? '';
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
  setStatus(IDE.dirty.size ? 'ยังไม่บันทึก' : 'บันทึกแล้ว ✓'); drawTabs();
}
function setStatus(t, bad) { IDE.status = t; const s = $('#ide-status'); if (s) { s.textContent = t; s.classList.toggle('bad', !!bad); } }

function openFile(path) {
  if (!has(path)) return;
  if (IDE.active && IDE.view) IDE.states.set(IDE.active, IDE.view.state);
  IDE.view.setState(stateFor(path));
  IDE.active = path;
  if (!IDE.open.includes(path)) IDE.open.push(path);
  drawTabs(); drawTree(); drawCtx(); setPane('code');
}
function closeTab(path) {
  IDE.open = IDE.open.filter(p => p !== path);
  if (IDE.active === path) { const n = IDE.open.at(-1) || [...IDE.files.keys()][0]; IDE.active = null; if (n) openFile(n); else IDE.view.setState(CM.EditorState.create({ doc: '' })); }
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
  for (const p of [...IDE.files.keys()].sort()) { let n = root; const parts = p.split('/'); parts.forEach((x, i) => { if (i === parts.length - 1) (n.__f ||= []).push(p); else n = n[x] ||= {}; }); }
  const row = (depth, inner) => `<div class="trow" style="padding-left:${8 + depth * 14}px">${inner}</div>`;
  const walk = (n, prefix, depth) => Object.keys(n).filter(k => k !== '__f').sort().map(d => {
    const full = prefix + d + '/', closed = IDE.closed.has(full);
    return row(depth, `<button class="tname" data-fold="${esc(full)}">${ic(closed ? 'right' : 'down', 'sm')}${ic('folder')} ${esc(d)}</button><button class="tmore" data-dmenu="${esc(full)}" aria-label="ตัวเลือกโฟลเดอร์">${ic('more')}</button>`)
      + (closed ? '' : walk(n[d], full, depth + 1));
  }).join('') + (n.__f || []).map(p => row(depth, `<button class="tname ${p === IDE.active ? 'on' : ''}" data-file="${esc(p)}">${icon(p)} ${esc(p.split('/').pop())}</button><button class="tmore" data-fmenu="${esc(p)}" aria-label="ตัวเลือกไฟล์">${ic('more')}</button>`)).join('');
  $('#tree').innerHTML = walk(root, '', 0) || '<p class="muted" style="padding:12px">ยังไม่มีไฟล์</p>';
  $('#tree').querySelectorAll('[data-file]').forEach(b => b.onclick = () => openFile(b.dataset.file));
  $('#tree').querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { const f = b.dataset.fold; IDE.closed.has(f) ? IDE.closed.delete(f) : IDE.closed.add(f); drawTree(); });
  $('#tree').querySelectorAll('[data-fmenu]').forEach(b => b.onclick = () => menu(b, b.dataset.fmenu, false));
  $('#tree').querySelectorAll('[data-dmenu]').forEach(b => b.onclick = () => menu(b, b.dataset.dmenu, true));
}
const icon = p => { const e = p.split('.').pop().toLowerCase(), k = { html: 'web', htm: 'web', css: 'palette', js: 'filecode', mjs: 'filecode', ts: 'filecode', tsx: 'filecode', jsx: 'filecode', py: 'py', json: 'braces2', md: 'filetext' }[e] || 'file'; return ic(k, 'f-' + e); };
function menu(btn, path, folder) {
  document.querySelector('.tmenu')?.remove();
  const m = document.createElement('div'); m.className = 'tmenu';
  m.innerHTML = folder ? '<button data-a="new">+ ไฟล์ในโฟลเดอร์นี้</button><button data-a="ren">เปลี่ยนชื่อโฟลเดอร์</button><button data-a="del" class="bad">ลบโฟลเดอร์</button>'
    : `<button data-a="ai">${IDE.ctx.has(path) ? 'เอาออกจาก AI' : 'ส่งให้ AI ดู'}</button><button data-a="ren">เปลี่ยนชื่อ / ย้าย</button><button data-a="dup">ทำสำเนา</button><button data-a="del" class="bad">ลบ</button>`;
  btn.closest('.trow').after(m);
  m.onclick = async e => {
    const a = e.target.dataset.a; if (!a) return; m.remove();
    try {
      if (a === 'new') return newFile(path);
      if (a === 'ai') { IDE.ctx.has(path) ? IDE.ctx.delete(path) : IDE.ctx.add(path); drawCtx(); return; }
      if (a === 'dup') { const to = prompt('ชื่อไฟล์สำเนา', path.replace(/(\.\w+)?$/, '-copy$1')); if (to) await writeFiles([{ path: to, content: content(path) }]); return; }
      if (a === 'del') {
        if (!confirm(`ลบ ${path} ?`)) return;
        await saveNow();
        await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        for (const p of [...IDE.files.keys()]) if (folder ? p.startsWith(path) : p === path) dropFile(p);
        return refresh();
      }
      if (a === 'ren') {
        const to = prompt(folder ? 'ชื่อโฟลเดอร์ใหม่ (พาธเต็ม)' : 'ชื่อไฟล์ใหม่ (ใส่ / เพื่อย้ายเข้าโฟลเดอร์)', folder ? path.slice(0, -1) : path);
        if (!to || to === path) return;
        await saveNow();
        await api(`/projects/${IDE.pid}/rename`, { method: 'POST', body: { from: path, to: folder ? to.replace(/\/?$/, '/') : to } });
        return reload(folder ? null : to);
      }
    } catch (x) { setStatus(x.message, true); }
  };
}
function dropFile(p) { IDE.files.delete(p); IDE.states.delete(p); IDE.dirty.delete(p); IDE.ctx.delete(p); if (IDE.open.includes(p)) closeTab(p); }
async function newFile(dir = '') {
  const p = prompt('ชื่อไฟล์ (เช่น src/app.js)', dir); if (!p || p.endsWith('/')) return;
  if (has(p)) return openFile(p);
  try { await writeFiles([{ path: p, content: '' }]); openFile(p); } catch (x) { setStatus(x.message, true); }
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
  IDE.open = IDE.open.filter(has); IDE.ctx = new Set([...IDE.ctx].filter(has));
  const a = openPath && has(openPath) ? openPath : has(IDE.active) ? IDE.active : IDE.open[0] || [...IDE.files.keys()][0];
  IDE.active = null; if (a) openFile(a); refresh();
}
function refresh() { drawTree(); drawTabs(); drawCtx(); }

// ---------- อัปโหลด / zip ----------
async function readText(f) {
  if (f.size > 500e3) throw new Error(`${f.name} ใหญ่เกิน 500KB`);
  const t = await f.text(); if (t.includes('\u0000')) throw new Error(`${f.name} ไม่ใช่ไฟล์ข้อความ`);
  return t;
}
async function uploadFiles(list) {
  const out = [], skip = [];
  for (const f of list) try { out.push({ path: f.name, content: await readText(f) }); } catch (x) { skip.push(x.message); }
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
  const z = new JSZip(); for (const p of IDE.files.keys()) z.file(p, content(p));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await z.generateAsync({ type: 'blob' })); a.download = IDE.name.replace(/[^\wก-๙-]+/g, '_') + '.zip';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- รันโค้ด ----------
const CAPTURE = `<script>(()=>{const s=(t,a)=>parent.postMessage({log:t,msg:a.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x)}catch{return String(x)}}).join(' ')},'*');for(const k of ['log','info','warn','error'])console[k]=(...a)=>s(k,a);addEventListener('error',e=>s('error',[e.message+(e.lineno?' (บรรทัด '+e.lineno+')':'')]));addEventListener('unhandledrejection',e=>s('error',[String(e.reason)]));addEventListener('message',e=>{if(e.source!==parent||!e.data||!e.data.shot)return;const done=(img,err)=>parent.postMessage({shotResult:img||null,err:err||null,text:(document.body&&document.body.innerText||'').slice(0,3000)},'*');const go=()=>{const b=document.body,bg=getComputedStyle(b).backgroundColor;htmlToImage.toJpeg(b,{quality:.8,pixelRatio:Math.min(2,devicePixelRatio||1),skipFonts:true,width:Math.max(b.scrollWidth,innerWidth),height:Math.min(Math.max(b.scrollHeight,innerHeight),2400),backgroundColor:bg==='rgba(0, 0, 0, 0)'?'#fff':bg}).then(img=>done(img)).catch(x=>done(null,String(x&&x.message||x)))};if(window.htmlToImage)return go();const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';sc.integrity='sha384-Tha/42qsYmpYmQ07pX+nJzkKumO0BzKJxK/uzVc7xyBQxVCUgQBhQIG8L7vXK+9C';sc.crossOrigin='anonymous';sc.onload=go;sc.onerror=()=>done(null,'โหลดตัวจับภาพไม่ได้');document.head.appendChild(sc)})})()<\/script>`;
function log(type, msg) {
  IDE.logs.push({ type, msg }); if (IDE.logs.length > 500) IDE.logs.shift();
  const c = $('#console'); if (!c) return;
  c.insertAdjacentHTML('beforeend', `<div class="cl ${type}">${esc(msg)}</div>`); c.scrollTop = c.scrollHeight;
}
function buildHtml(htmlPath, jsPath) {
  let html = htmlPath ? content(htmlPath) : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script src="${jsPath}"></script></body></html>`;
  const dir = htmlPath ? htmlPath.replace(/[^/]*$/, '') : '';
  const resolve = ref => {
    if (/^([a-z]+:|\/\/|#)/i.test(ref)) return null;
    const out = []; for (const x of (ref.startsWith('/') ? ref.slice(1) : dir + ref).split('?')[0].split('/')) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); }
    return out.join('/');
  };
  // shortcut: ใส่ CSS/JS ของโปรเจกต์แบบ inline ลงหน้า (import ระหว่าง module และรูปในโปรเจกต์ยังไม่รองรับ)
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => { const p = resolve(href); return p && has(p) && /stylesheet/i.test(m) ? `<style>\n${content(p)}\n</style>` : m; })
    .replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => { const p = resolve(src); return p && has(p) ? `<script${a}${b}>\n${content(p).replace(/<\/script/gi, '<\\/script')}\n</script>` : m; });
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + CAPTURE) : CAPTURE + html;
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
function setPane(p) {
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
  t.insertAdjacentHTML('beforeend', `<span class="${cls}">${esc(text)}</span>`); t.scrollTop = t.scrollHeight;
}
// รันคำสั่ง: ส่งไฟล์โปรเจกต์ไปด้วย ไฟล์ที่คำสั่งสร้าง/แก้ (ยกเว้น node_modules) จะถูกบันทึกกลับเข้าโปรเจกต์
async function nodeRun(cmd) {
  if (window.DEMO) { termOut(`$ ${cmd}\nหน้าเดโมรันเทอร์มินัลไม่ได้ บนเว็บจริงใช้ได้\n`, 'err'); return { code: 1, stdout: '', stderr: 'หน้าเดโมรันเทอร์มินัลไม่ได้' }; }
  await saveNow(); showRun(true); runTab('term');
  termOut(`$ ${cmd}\n`, 'cmd'); $('#run-status').textContent = 'กำลังรัน...';
  try { await nodeFrame(); } catch (x) { termOut(x.message + '\n', 'err'); return { code: 1, stdout: '', stderr: x.message }; }
  const id = Math.random().toString(36).slice(2);
  const files = [...IDE.files.keys()].map(p => ({ path: p, content: content(p) }));
  const d = await new Promise(ok => { IDE.node.jobs.set(id, ok); IDE.node.f.contentWindow.postMessage({ id, cmd, files }, '*'); });
  termOut(`[exit ${d.code}]\n`, d.code ? 'err' : 'muted'); $('#run-status').textContent = '';
  const changed = (d.files || []).filter(f => PATH_OK(f.path) && content(f.path) !== f.content);
  if (changed.length) { await writeFiles(changed); termOut(`บันทึกไฟล์ที่เปลี่ยน: ${changed.map(f => f.path).join(', ')}\n`, 'muted'); }
  return d;
}
const PATH_OK = p => p && !p.startsWith('node_modules/') && p.length < 200;
// AI สั่ง RUN: ใช้การแก้ไขของข้อความนั้นก่อน แล้วรัน แล้วส่งผลกลับให้ AI
async function runForAI(msg, cmds) {
  for (const c of changesOf(msg.content)) if (c.del ? has(c.path) : !has(c.path) || content(c.path) !== c.content) await apply(c);
  msg.ran = true; drawAI();
  const cut = s => s.length > 6000 ? s.slice(0, 2000) + '\n…(ตัดกลาง)…\n' + s.slice(-4000) : s;
  let text = '[ผลการรันคำสั่ง]';
  for (const cmd of cmds) { const d = await nodeRun(cmd); text += `\n\n$ ${cmd}\n(exit ${d.code})\n${cut((d.stdout || '') + (d.stderr ? '\n[stderr]\n' + d.stderr : '')) || '(ไม่มีผลลัพธ์)'}`; }
  IDE.round = (IDE.round ?? 0) + 1; setPane('ai');
  if (IDE.round <= 5) await codeSend({ text: text + '\n\nดูผลแล้วแก้ต่อถ้ายังมีปัญหา ถ้าผ่านแล้วให้สรุปสั้นๆ' });
}

// ---------- AI: ปุ่มด้านล่างแบบเดียวกับหน้าแชต ----------
function cUI() {
  const m = me.models.find(x => x.id === +$('#cmodel').value) || me.models[0];
  $('#cmdl').innerHTML = `<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
  $('#ceff').hidden = !m || m.effort === 'none';
  $('#ceff').innerHTML = `${ic('sparkles', 'sm')}${EFFORT_INFO[$('#ceffort').value]?.[0] || 'Instant'}${ic('down', 'sm')}`;
  $('#cflags').innerHTML = (IDE.autoApply ? `<button type="button" class="flag" data-flag="autoapply" aria-label="ปิด Auto-apply">${ic('check', 'sm')}Auto-apply${ic('x', 'sm')}</button>` : '')
    + (IDE.autoMode ? `<button type="button" class="flag" data-flag="auto" aria-label="ปิดตรวจผลเอง">${ic('eye', 'sm')}ตรวจผลเอง${ic('x', 'sm')}</button>` : '');
}
function setOpt(k, on) { localStorage.setItem(k, on ? '1' : '0'); if (k === 'auto') IDE.autoMode = on; else IDE.autoApply = on; }
function codeTools() {
  sheet('เครื่องมือ AI', optHTML('autoapply', ic('check') + 'Auto-apply', 'ใช้การแก้ไฟล์ของ AI ทันที และรันคำสั่งที่ AI ขอ ไม่ต้องกดเอง', IDE.autoApply)
    + optHTML('auto', ic('eye') + 'ตรวจผลเองอัตโนมัติ', 'ใช้การแก้ไข แล้วรัน + จับภาพหน้าจอให้ AI ดูและแก้ต่อ สูงสุด 3 รอบ', IDE.autoMode)
    + optHTML('check', ic('camera') + 'ให้ AI ดูผลลัพธ์ตอนนี้', 'รันโปรเจกต์ จับภาพหน้าจอ แล้วส่งให้ AI ตรวจ')
    + optHTML('term', ic('terminal') + 'เปิดเทอร์มินัล', 'พิมพ์คำสั่ง npm / node เอง'),
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); const v = b.dataset.v;
      if (v === 'autoapply' || v === 'auto') { setOpt(v, !(v === 'auto' ? IDE.autoMode : IDE.autoApply)); cUI(); }
      if (v === 'check') { IDE.round = 0; check().catch(x => $('#ce').textContent = x.message); }
      if (v === 'term') { showRun(true); runTab('term'); setTimeout(() => $('#term-i')?.focus(), 50); }
    }));
}

// ---------- AI ----------
function drawCtx() {
  const box = $('#ctx'); if (!box) return;
  const list = [...new Set([IDE.autoActive && IDE.active, ...IDE.ctx].filter(p => p && has(p)))];
  const total = list.reduce((a, p) => a + content(p).length, 0);
  box.innerHTML = `<span class="muted">แนบให้ AI:</span>` + list.map(p => `<span class="fchip">${icon(p)} <span>${esc(p)}</span>${p === IDE.active && IDE.autoActive && !IDE.ctx.has(p) ? '<small>ไฟล์ที่เปิด</small>' : ''}<button data-uctx="${esc(p)}" aria-label="เอาออก">${ic('x')}</button></span>`).join('')
    + `<select id="addctx" aria-label="เพิ่มไฟล์ให้ AI"><option value="">+ เพิ่มไฟล์</option>${[...IDE.files.keys()].filter(p => !list.includes(p)).map(p => `<option>${esc(p)}</option>`).join('')}</select>`
    + `<small class="muted">${tok(total)}</small>`;
  box.querySelectorAll('[data-uctx]').forEach(b => b.onclick = () => { const p = b.dataset.uctx; if (IDE.ctx.has(p)) IDE.ctx.delete(p); else IDE.autoActive = false; drawCtx(); });
  $('#addctx').onchange = e => { if (e.target.value) { IDE.ctx.add(e.target.value); drawCtx(); } };
}
function changesOf(text) {
  const map = new Map();
  for (const m of text.matchAll(/```[^\n`]*?\bpath=([^\s`]+)[^\n]*\n([\s\S]*?)\n?```/g)) map.set(m[1], { path: m[1], content: m[2].replace(/\n?$/, '\n') });
  for (const m of text.matchAll(/^DELETE path=(\S+)/gm)) map.set(m[1], { path: m[1], del: true });
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
  const ch = changesOf(m.content); if (!ch.length) return '';
  return `<div class="changes">${ch.map((c, k) => {
    const cur = has(c.path) ? content(c.path) : null;
    const same = c.del ? cur == null : cur === c.content;
    const d = !c.del && cur != null && !same ? lineDiff(cur, c.content) : null;
    const tag = c.del ? '<span class="bad">ลบ</span>' : cur == null ? '<span class="ok">ไฟล์ใหม่</span>' : d ? `<span class="ok">+${d.add}</span> <span class="bad">−${d.del}</span>` : '';
    return `<div class="chg"><span class="cpath">${icon(c.path)} ${esc(c.path)}</span>${tag}
      ${same ? '<span class="muted">ใช้แล้ว ✓</span>' : `${c.del ? '' : `<button data-diff="${i}:${k}">ดู diff</button>`}<button class="ap" data-apply="${i}:${k}">${c.del ? 'ลบไฟล์' : 'Apply'}</button>`}</div>`;
  }).join('')}${ch.filter(c => (c.del ? has(c.path) : content(c.path) !== c.content || !has(c.path))).length > 1 ? `<button class="btn blue sm" data-applyall="${i}">Apply ทั้งหมด</button>` : ''}</div>`;
}
async function apply(c) {
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
    <button class="btn blue sm" id="dapply">${label}</button><button class="btn out sm" id="dclose">ปิด</button></div>
    <div class="diff-b">${ln > 0 ? `<div class="dl muted">… บรรทัด ${ln + 1}</div>` : ''}${body}</div>`;
  $('.ide').append(box);
  box.querySelector('#dclose').onclick = () => box.remove();
  box.querySelector('#dapply').onclick = async () => { box.remove(); await apply(c); };
}
// บรรทัด READ / GREP / LIST ที่ AI ใช้อ่านไฟล์ → แสดงเป็นป้ายเล็กๆ
const TOOL_LABEL = { READ: ['filetext', 'อ่าน'], GREP: ['search', 'ค้นหา'], LIST: ['folder', 'ดูไฟล์ใน'], RUN: ['terminal', 'รัน'] };
const toolsMd = t => md(t.replace(/^[ \t]*(READ|GREP|LIST|RUN)\b[ \t]*(?:path=)?(.*)$/gm, (_, op, a) => `\u0001${op}\u0002${a.trim()}\u0003`))
  .replace(/\u0001(\w+)\u0002([^\u0003]*)\u0003/g, (_, op, a) => `<span class="tool">${ic(TOOL_LABEL[op][0], 'sm')}${TOOL_LABEL[op][1]} <code>${a || '/'}</code></span>`);
const runCard = (m, i) => { const r = runsOf(m.content); return r.length ? `<div class="changes runs"><span class="muted">AI ขอรันคำสั่ง</span>${r.map(c => `<code>${esc(c)}</code>`).join('')}${m.ran ? '<span class="muted">รันแล้ว ✓</span>' : `<button class="btn blue sm" data-runai="${i}">${ic('terminal', 'sm')} รันแล้วส่งผลให้ AI</button>`}</div>` : ''; };
function aiMsgHTML(m, i) {
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    return `<div class="msg user ${m.auto ? 'auto' : ''}"><div class="b">${m.imgs ? `<div class="mimgs shot">${m.imgs.map(d => `<img src="${d}" alt="ภาพหน้าจอผลลัพธ์">`).join('')}</div>` : ''}${esc(m.content.replace(FILE_RE, '').replace(TREE_RE, '').replace(CHECK_RE, '').replace(/\n\n\[แนบรูป \d+ รูป\]/, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${icon(f[1])} <span>${esc(f[1])}</span></span>`).join('')}</div>` : ''}</div></div>`;
  }
  const ask = parseAsk(m.content, m.streaming);
  return `<div class="msg ai">${thinkHTML(m)}<div class="b">${ask.text ? toolsMd(ask.text) : m.thinking || ask.asks.length ? '' : DOTS}</div>${m.streaming ? '' : askHTML(ask.asks, i === IDE.msgs.length - 1 && !IDE.busy) + changeCards(m, i) + runCard(m, i)
    + `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}<button data-copy="${i}">คัดลอก</button></div>`}</div>`;
}
function drawAI() {
  const box = $('#cmsgs'); if (!box) return;
  box.innerHTML = IDE.msgs.length ? IDE.msgs.map(aiMsgHTML).join('')
    : `<div class="empty" style="padding-top:24px"><div class="stat" style="font-size:22px">ให้ AI ช่วยเขียนโค้ด</div><div class="muted">AI อ่านได้ทุกไฟล์ในโปรเจกต์ และแก้ไฟล์ให้ได้ กด Apply เพื่อใช้การแก้ไข</div>
      <div class="chips">${['อธิบายโค้ดไฟล์นี้', 'หาบั๊กและแก้ให้', 'เพิ่มคอมเมนต์ภาษาไทย', 'ทำให้หน้าเว็บสวยขึ้น'].map(s => `<button data-cs="${s}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight;
}
async function codeSend(auto) {
  if (IDE.busy) { IDE.round = 99; if (IDE.chatId) fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: IDE.chatId }) }).catch(() => {}); return IDE.ctrl?.abort(); } // กดหยุด = หยุดโหมดอัตโนมัติด้วย
  const t = $('#ct'), text = auto ? auto.text : t.value.trim(); if (!text) return;
  if (!auto) IDE.round = 0;
  await saveNow();
  const paths = [...new Set([IDE.autoActive && IDE.active, ...IDE.ctx].filter(p => p && has(p)))];
  const files = paths.map(p => ({ name: p, text: content(p) }));
  if (files.reduce((a, f) => a + f.text.length, 0) > 380000) return $('#ce').textContent = 'ไฟล์ที่ส่งให้ AI ยาวเกินไป เอาบางไฟล์ออก';
  const tree = [...IDE.files.keys()].join('\n').slice(0, 15000);
  const full = `${text}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${tree}`;
  const m = me.models.find(x => x.id === +$('#cmodel').value) || me.models[0];
  const images = auto?.images || [];
  if (!auto) { t.value = ''; t.style.height = 'auto'; }
  $('#ce').textContent = '';
  IDE.msgs.push({ role: 'user', content: withFiles(full, files), imgs: images.length ? images : null, auto: !!auto });
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true }; IDE.msgs.push(ai); drawAI();
  IDE.busy = true; IDE.ctrl = new AbortController(); $('#cgo').innerHTML = ic('stop'); $('#cgo').classList.add('stop');
  let raf = 0, started = false;
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: IDE.ctrl.signal,
      body: JSON.stringify({ project_id: IDE.pid, chat_id: IDE.chatId, model_id: m.id, text: full, files, images, effort: m.effort !== 'none' ? $('#ceffort').value || null : null }) });
    if (!r.ok) { const d = await r.json(); throw new Error(r.status === 429 && d.pct4h != null ? 'ลิมิตเต็มแล้ว' : d.error); }
    started = true;
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let k; while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 2);
        if (!line.startsWith('data: ')) continue;
        const d = JSON.parse(line.slice(6));
        if (d.chat_id) IDE.chatId = d.chat_id;
        if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) { const stick = nearBottom(b); paintStreaming(last, ai); if (stick) b.scrollTop = b.scrollHeight; } }); }
        if (d.error) $('#ce').textContent = d.error;
        if (d.done) { me.usage = d; $('#clim').innerHTML = limHTML(d); }
      }
    }
  } catch (x) {
    if (x.name !== 'AbortError') { $('#ce').textContent = x.message; if (!started) { IDE.msgs.splice(-2, 2); if (!auto) t.value = text; } }
  }
  cancelAnimationFrame(raf); ai.streaming = false; if (!ai.content && !ai.thinking && IDE.msgs.at(-1) === ai) IDE.msgs.pop();
  IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI();
  // โหมดอัตโนมัติ: ใช้การแก้ไขทันที แล้วให้ AI ดูผลลัพธ์เอง (สูงสุด 3 รอบ)
  // Auto-apply: ใช้การแก้ไขทันที (และรันคำสั่งที่ AI ขอ) · ตรวจผลเอง: ใช้การแก้ไข แล้วรัน + จับภาพให้ AI ดู (สูงสุด 3 รอบ)
  const runs = ai.content ? runsOf(ai.content) : [], ch = ai.content ? changesOf(ai.content) : [], autoOn = IDE.autoApply || IDE.autoMode;
  try {
    if (autoOn && runs.length && (IDE.round ?? 0) < 5) await runForAI(ai, runs);
    else if (autoOn && ch.length) { for (const c of ch) if (c.del ? has(c.path) : !has(c.path) || content(c.path) !== c.content) await apply(c); if (IDE.autoMode && (IDE.round ?? 0) < 3) await check(); }
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
  const text = `📸 ตรวจผลลัพธ์อัตโนมัติ รอบ ${IDE.round}${images.length ? '' : s.img ? ' (โมเดลนี้อ่านรูปไม่ได้ ส่งเฉพาะข้อความ)' : ''}\n\nคอนโซล:\n${logs}`
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
  box.innerHTML = `<div class="diff-h"><b>ประวัติ: ${esc(p)}</b><span style="flex:1"></span><button class="btn out sm" data-x>ปิด</button></div>
    <div class="git-b">${list.length ? list.map(v => `<button class="ver" data-v="${v.id}"><span>${when(v.created_at)}</span><span class="muted">${SRC[v.source] || esc(v.source)} · ${num(v.size)} ตัวอักษร</span></button>`).join('')
      : '<p class="muted">ยังไม่มีประวัติ ระบบจะเก็บเวอร์ชันเก่าไว้ให้เมื่อไฟล์ถูกแก้</p>'}<p class="muted">เก็บล่าสุด 30 เวอร์ชันต่อไฟล์ · แตะเพื่อดูความต่าง แล้วกดกู้คืน</p></div>`;
  $('.ide').append(box);
  box.onclick = async e => {
    if (e.target.closest('[data-x]')) return box.remove();
    const b = e.target.closest('[data-v]'); if (!b) return;
    const v = await api(`/projects/${IDE.pid}/versions/${b.dataset.v}`);
    if (v.content === content(p)) return alert('เวอร์ชันนี้เหมือนไฟล์ปัจจุบัน');
    box.remove(); showDiff({ path: p, content: v.content }, 'กู้คืนเวอร์ชันนี้');
  };
}
async function gitPanel() {
  document.querySelector('.gitbox')?.remove();
  const box = document.createElement('div'); box.className = 'diffbox gitbox';
  box.innerHTML = `<div class="diff-h"><b>${ic('branch')} GitHub</b><span style="flex:1"></span><button class="btn out sm" id="gx">ปิด</button></div><div class="git-b" id="gb"><p class="muted">กำลังโหลด...</p></div>`;
  $('.ide').append(box); box.querySelector('#gx').onclick = () => box.remove();
  const gb = box.querySelector('#gb'), say = (h, bad) => { const m = gb.querySelector('.gmsg'); if (m) m.innerHTML = bad ? `<span class="bad">${esc(h)}</span>` : h; };
  const acct = await api('/github');
  if (!acct.connected) {
    gb.innerHTML = `<h3>เชื่อมบัญชี GitHub</h3>
      <ol class="steps"><li>เปิด <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>
      <li>เลือก repo ที่จะใช้ แล้วตั้งสิทธิ์ <b>Contents: Read and write</b></li><li>กด Generate แล้วคัดลอก token มาวางด้านล่าง</li></ol>
      <form id="gt"><label>Personal access token</label><input name="token" type="password" placeholder="github_pat_..." autocomplete="off" required>
      <div class="row" style="margin-top:12px"><button class="btn blue">เชื่อมต่อ</button></div></form>
      <p class="muted">token ถูกเข้ารหัสเก็บที่เซิร์ฟเวอร์ และไม่ถูกส่งกลับมาที่หน้าเว็บ${acct.secret ? '' : ' · <span class="bad">แอดมินยังไม่ได้ตั้ง SECRET_KEY จึงเชื่อมยังไม่ได้</span>'}</p><p class="gmsg"></p>`;
    gb.querySelector('#gt').onsubmit = async e => { e.preventDefault(); try { await api('/github', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); gitPanel(); } catch (x) { say(x.message, 1); } };
    return;
  }
  if (!IDE.gh) {
    gb.innerHTML = `<p class="muted">เชื่อมอยู่กับ <b>@${esc(acct.login)}</b> · <button class="linkb" id="gdis">ยกเลิกการเชื่อม</button></p>
      <h3>เชื่อมโปรเจกต์นี้กับ repo</h3><form id="gl" class="form2"><div><label>Repo</label><input name="repo" placeholder="owner/repo" required></div>
      <div><label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main"></div><div style="align-self:end"><button class="btn blue">เชื่อม repo</button></div></form>
      <p class="muted">เชื่อมแล้วกด Pull ก่อน เพื่อรวมไฟล์ใน repo กับไฟล์ในโปรเจกต์นี้</p><p class="gmsg"></p>`;
    gb.querySelector('#gl').onsubmit = async e => { e.preventDefault(); try { const r = await api(`/projects/${IDE.pid}/github`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); IDE.gh = { repo: r.repo, branch: r.branch }; $('#git').textContent = '⑂ ' + r.branch; gitPanel(); } catch (x) { say(x.message, 1); } };
    gb.querySelector('#gdis').onclick = async () => { if (confirm('ยกเลิกการเชื่อม GitHub?')) { await api('/github', { method: 'DELETE' }); gitPanel(); } };
    return;
  }
  await saveNow();
  gb.innerHTML = `<p class="gm-repo"><a href="https://github.com/${esc(IDE.gh.repo)}/tree/${encodeURIComponent(IDE.gh.branch)}" target="_blank" rel="noopener">${esc(IDE.gh.repo)}</a> <span class="pill">${ic('branch', 'sm')} ${esc(IDE.gh.branch)}</span> <span class="muted">@${esc(acct.login)}</span></p>
    <div class="row"><button class="btn out sm" id="gf">${ic('refresh')} Fetch</button><button class="btn out sm" id="gp">${ic('pull')} Pull</button><button class="btn out sm" id="gun">ยกเลิกการเชื่อม repo</button></div>
    <div class="row gbr"><select id="gbs" aria-label="branch"><option>${esc(IDE.gh.branch)}</option></select><button class="btn out sm" id="gnb">+ branch ใหม่</button><button class="btn out sm" id="gpr">เปิด Pull Request</button></div>
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
        <div class="row" style="margin-top:8px"><button class="btn out sm" id="gr">ใช้ของ GitHub</button><button class="btn out sm" id="gk">เก็บของเรา</button></div>`);
      gb.querySelector('#gr').onclick = () => pull('remote'); gb.querySelector('#gk').onclick = () => pull('local');
    }
  };
  const setBranch = br => { IDE.gh.branch = br; $('#git').innerHTML = ic('branch') + ' ' + esc(br); };
  api(`/projects/${IDE.pid}/github/branches`).then(b => {
    const sel = gb.querySelector('#gbs'); IDE.gh.default = b.default;
    sel.innerHTML = b.branches.map(n => `<option ${n === b.current ? 'selected' : ''}>${esc(n)}</option>`).join('');
    sel.onchange = async () => {
      if (!confirm(`สลับไป branch "${sel.value}"? ต้อง Pull ใหม่เพื่อรวมไฟล์`)) { sel.value = IDE.gh.branch; return; }
      try { await api(`/projects/${IDE.pid}/github/switch`, { method: 'POST', body: { branch: sel.value } }); setBranch(sel.value); gitPanel(); } catch (x) { say(x.message, 1); }
    };
  }).catch(x => say(x.message, 1));
  gb.querySelector('#gnb').onclick = async () => {
    const name = prompt('ชื่อ branch ใหม่ (สร้างจากคอมมิตที่ sync ล่าสุด)', 'feature/'); if (!name?.trim()) return;
    try { await api(`/projects/${IDE.pid}/github/branch`, { method: 'POST', body: { name: name.trim() } }); setBranch(name.trim()); gitPanel(); } catch (x) { say(x.message, 1); }
  };
  gb.querySelector('#gpr').onclick = () => {
    say(`<form id="prf" class="gcommit"><label>Pull Request: ${esc(IDE.gh.branch)} → <input name="base" value="${esc(IDE.gh.default || 'main')}" style="display:inline;width:140px;min-height:32px"></label>
      <input name="title" placeholder="หัวข้อ PR" maxlength="200" required><textarea name="body" rows="3" placeholder="รายละเอียด (ไม่ใส่ก็ได้)"></textarea><button class="btn blue sm">สร้าง PR</button></form>`);
    gb.querySelector('#prf').onsubmit = async e => {
      e.preventDefault();
      try { const r = await api(`/projects/${IDE.pid}/github/pr`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); say(`<span class="ok">✓ สร้าง PR #${r.number} แล้ว</span> · <a href="${esc(r.url)}" target="_blank" rel="noopener">เปิดบน GitHub</a>`); }
      catch (x) { say(x.message, 1); }
    };
  };
  gb.querySelector('#gf').onclick = status;
  gb.querySelector('#gp').onclick = () => pull();
  gb.querySelector('#gun').onclick = async () => { if (!confirm('ยกเลิกการเชื่อม repo? ไฟล์ในโปรเจกต์ยังอยู่ครบ')) return; await api(`/projects/${IDE.pid}/github`, { method: 'DELETE' }); IDE.gh = null; $('#git').textContent = '⑂ Git'; gitPanel(); };
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
  Object.assign(IDE, { pid: d.id, name: d.name, gh: d.gh, files: new Map(d.files.map(f => [f.path, f.content])), states: new Map(), open: [], active: null,
    dirty: new Set(), ctx: new Set(), autoActive: true, msgs: [], chatId: null, busy: false, logs: [], frame: null });
  if (IDE.worker) { IDE.worker.terminate(); IDE.worker = null; }
  const saved = localStorage.getItem('model');
  app.innerHTML = `<div class="ide view" data-pane="code">
    <header class="ide-bar"><a class="icon-btn sm" href="/code" aria-label="กลับไปหน้าโปรเจกต์">‹</a><b class="pname">${esc(d.name)}</b><span id="ide-status" class="muted"></span><span style="flex:1"></span>
      <button class="btn out sm" id="git" aria-label="GitHub">${ic('branch')} ${d.gh ? esc(d.gh.branch) : 'Git'}</button><button class="btn blue sm" id="run" aria-label="รัน">${ic('play')} รัน</button></header>
    <div class="ide-body">
      <aside class="ide-files"><div class="ftools"><button class="btn out sm" id="nfile">+ ไฟล์</button><button class="btn out sm" id="upl">อัปโหลด</button>
        <button class="btn out sm" id="zin">นำเข้า zip</button><button class="btn out sm" id="zout">ส่งออก zip</button>
        <input type="file" id="uplf" multiple hidden><input type="file" id="zinf" accept=".zip,application/zip" hidden></div><div id="tree" class="tree"></div></aside>
      <section class="ide-main"><div class="ide-tabs" id="tabs"></div>
        <div class="ide-tools"><button id="undo" aria-label="ย้อนกลับ">${ic('undo')}</button><button id="redo" aria-label="ทำซ้ำ">${ic('redo')}</button><button id="find" aria-label="ค้นหา">${ic('search')}</button>
          <button id="wrapb" aria-label="ตัดบรรทัด">ตัดบรรทัด</button><button id="ghostb" aria-pressed="${localStorage.getItem('ghost') !== '0'}" title="ให้ AI เดาโค้ดต่อขณะพิมพ์ (ใช้ลิมิตเล็กน้อย)">AI เดา ${localStorage.getItem('ghost') === '0' ? 'ปิด' : 'เปิด'}</button><button id="hist" aria-label="ประวัติไฟล์">ประวัติ</button><button id="save" aria-label="บันทึก">บันทึก</button></div>
        <div id="editor" class="ide-editor"></div>
        <div class="ide-run"><div class="run-h"><button data-rtab="out" class="on">ผลลัพธ์</button><button data-rtab="con">คอนโซล</button><button data-rtab="term">เทอร์มินัล</button><span id="run-status" class="muted"></span><span style="flex:1"></span>
          <button id="stop">${ic('stop')} หยุด</button><button id="clr">ล้าง</button><button id="hiderun" aria-label="ปิดแผงรัน">${ic('x')}</button></div>
          <div id="out" class="run-out"><p class="muted" style="padding:16px">กด รัน เพื่อดูผล</p></div><div id="console" class="console" hidden></div><div id="term" class="term" hidden><pre id="term-o"></pre><form id="term-f"><span>$</span><input id="term-i" placeholder="npm install lodash / npm test / node app.js" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="คำสั่ง"></form></div></div></section>
      <aside class="ide-ai"><div class="ai-h"><b class="ai-t">${ic('sparkles')} AI</b><span class="sp"></span><button class="lim" id="clim" aria-label="ลิมิตการใช้งาน"></button><button class="icon-btn sm" id="cnew" aria-label="แชตใหม่">${ic('newchat')}</button>
        <select id="cmodel" hidden>${me.models.map(m => `<option value="${m.id}" ${String(m.id) === saved ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <select id="ceffort" hidden>${EFFORTS.map(([v]) => `<option value="${v}">${v}</option>`).join('')}</select></div>
        <div id="cmsgs" class="msgs"></div>
        <div class="compose"><div id="ctx" class="ctx"></div><div class="err" id="ce"></div>
          <form id="cf" class="cbox"><textarea id="ct" rows="1" placeholder="สั่ง AI เช่น เพิ่มปุ่มรีเซ็ต" aria-label="ข้อความถึง AI"></textarea>
            <div class="crow"><button type="button" class="cb" id="cplus" aria-label="เครื่องมือ">${ic('plus')}</button><button type="button" class="cb pick" id="cmdl" aria-haspopup="dialog"></button><button type="button" class="cb pick" id="ceff" aria-haspopup="dialog"></button>
              <span id="cflags"></span><button class="send" id="cgo" aria-label="ส่ง">${ic('up')}</button></div></form></div></aside>
    </div>
    <nav class="ide-nav">${[['files', 'folder', 'ไฟล์'], ['code', 'code', 'โค้ด'], ['ai', 'sparkles', 'AI'], ['run', 'play', 'ผลลัพธ์']].map(([k, i, l]) => `<button data-pane-btn="${k}" class="${k === 'code' ? 'on' : ''}"><span>${ic(i)}</span>${l}</button>`).join('')}</nav></div>`;

  IDE.view = new CM.EditorView({ parent: $('#editor'), state: CM.EditorState.create({ doc: '' }) });
  const first = has('index.html') ? 'index.html' : [...IDE.files.keys()][0];
  if (first) openFile(first); else refresh();
  setStatus('บันทึกแล้ว ✓');

  $('#cmodel').onchange = e => { localStorage.setItem('model', e.target.value); cUI(); };
  $('#ceffort').value = localStorage.getItem('effort') || ''; $('#ceffort').onchange = e => { localStorage.setItem('effort', e.target.value); cUI(); };
  $('#cmdl').onclick = () => modelSheet('#cmodel'); $('#ceff').onclick = () => effortSheet('#ceffort'); $('#clim').onclick = limitSheet; $('#cplus').onclick = codeTools;
  $('#cflags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f) { setOpt(f, false); cUI(); } };
  $('#clim').innerHTML = limHTML(me.usage); cUI();
  document.querySelectorAll('[data-pane-btn]').forEach(b => b.onclick = () => { if (b.dataset.paneBtn === 'run') showRun(true); setPane(b.dataset.paneBtn); });
  $('#term-f').onsubmit = async e => { e.preventDefault(); const i = $('#term-i'), cmd = i.value.trim(); if (!cmd || IDE.termBusy) return; i.value = ''; IDE.termBusy = true; try { await nodeRun(cmd); } finally { IDE.termBusy = false; i.focus(); } };
  $('#run').onclick = run; $('#git').onclick = () => gitPanel(); $('#stop').onclick = stopRun; $('#clr').onclick = () => { IDE.logs = []; $('#console').innerHTML = ''; };
  $('#hiderun').onclick = () => { showRun(false); setPane('code'); };
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
  IDE.autoMode = localStorage.getItem('auto') === '1'; IDE.autoApply = localStorage.getItem('autoapply') === '1';
  const ct = $('#ct');
  ct.oninput = () => { ct.style.height = 'auto'; ct.style.height = ct.scrollHeight + 'px'; };
  ct.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#cf').requestSubmit(); } };
  $('#cf').onsubmit = e => { e.preventDefault(); codeSend(); };
  const answer = e => { const a = askAnswer(e); if (a != null && !IDE.busy) { e.preventDefault?.(); ct.value = a; codeSend(); } return a != null; };
  $('#cmsgs').onkeydown = answer;
  $('#cmsgs').onclick = async e => {
    if (answer(e)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp-code')) return copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.dataset.copy) return copy(IDE.msgs[+b.dataset.copy].content, b);
    if (b.dataset.cs) { ct.value = b.dataset.cs; ct.focus(); return; }
    if (b.dataset.runai) { if (IDE.busy) return; b.disabled = true; const m = IDE.msgs[+b.dataset.runai]; IDE.round = 0; try { await runForAI(m, runsOf(m.content)); } catch (x) { $('#ce').textContent = x.message; } return; }
    const ref = (b.dataset.diff || b.dataset.apply || '').split(':').map(Number);
    const c = ref.length === 2 ? changesOf(IDE.msgs[ref[0]].content)[ref[1]] : null;
    try {
      if (b.dataset.diff) showDiff(c);
      if (b.dataset.apply) { b.disabled = true; await apply(c); }
      if (b.dataset.applyall) { b.disabled = true; for (const x of changesOf(IDE.msgs[+b.dataset.applyall].content)) if (x.del ? has(x.path) : content(x.path) !== x.content || !has(x.path)) await apply(x); }
    } catch (x) { $('#ce').textContent = x.message; drawAI(); }
  };
  drawAI();
  const chats = await api('/chats?project=' + IDE.pid).catch(() => []); // เปิดแชตล่าสุดของโปรเจกต์
  if (chats[0]) { IDE.chatId = chats[0].id; IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => []); drawAI(); }
}
addEventListener('beforeunload', e => { if (IDE.dirty.size) { saveNow(); e.preventDefault(); } });
