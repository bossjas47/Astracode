// Kyber: โหมด Code ใช้ตัวแปรกลางจาก app.js
// เปิดในหน้าเดียวกับแชต (chat.js: switchMode) · วาดลงฝั่งขวา #cmain ข้างแถบข้าง
function codeDispatch() { return qs().get('p') ? codeView(qs().get('p')) : codeHome(); }
const codeHost = () => $('#cmain') || app;
const needCM = () => (window.CM ? Promise.resolve() : (window.cmJs ||= loadJs('/cm.js').catch(x => { window.cmJs = null; throw x; }))).then(() => { if (!wrap) { wrap = new CM.Compartment(); ghostC = new CM.Compartment(); } }); // ตัวแก้โค้ด (ใหญ่) โหลดเมื่อเปิดโปรเจกต์ครั้งแรก
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

// ---------- หน้าเริ่มโปรเจกต์ใหม่ (แบบ Claude Code): พิมพ์สิ่งที่อยากสร้าง → สร้างโปรเจกต์ + เปิดตัวแก้โค้ดในหน้าเดิม + AI เริ่มทำทันที ----------
const TPLS = [['auto', 'Auto', 'เลือกให้จากสิ่งที่พิมพ์'], ['starter', 'Web', 'HTML / CSS / JS'], ['tailwind', 'Tailwind', 'HTML + Tailwind CSS'], ['react', 'React', 'ไม่ต้องติดตั้ง'], ['node', 'Node.js', 'package.json + เทอร์มินัล'], ['python', 'Python', 'รันในเบราว์เซอร์'],
  ['landing', 'Landing page', 'หน้าขายของ'], ['dashboard', 'Dashboard', 'กราฟ Chart.js'], ['game', 'Game', 'Canvas'], ['linebot', 'LINE Bot', 'Node.js'], ['discordbot', 'Discord Bot', 'Node.js'], ['empty', 'Blank', 'โปรเจกต์ว่าง']];
const CODE_IDEAS = [['Landing page', 'ทำหน้าเว็บขายกาแฟ มีเมนู ราคา และปุ่มสั่งผ่าน LINE'], ['Todo app', 'แอป Todo ด้วย React เพิ่ม ลบ ติ๊กเสร็จ และจำไว้ในเครื่อง'], ['Game', 'เกมงูบน Canvas เล่นบนมือถือได้ด้วยการปัด']];
// เดาแม่แบบจากคำสั่ง (Auto)
const tplFor = t => /discord/i.test(t) ? 'discordbot' : /line ?bot|ไลน์ ?บอท|บอท ?line/i.test(t) ? 'linebot' : /react/i.test(t) ? 'react' : /python|ไพทอน|\.py\b|pandas/i.test(t) ? 'python'
  : /node|express|api server|เซิร์ฟเวอร์/i.test(t) ? 'node' : /tailwind/i.test(t) ? 'tailwind' : /เกม|game|canvas/i.test(t) ? 'game' : /dashboard|แดชบอร์ด|กราฟ|chart/i.test(t) ? 'dashboard' : 'starter';
const nameFor = t => { // ชื่อโปรเจกต์จากบรรทัดแรกของคำสั่ง (ตัดคำสั่งนำหน้า, ไม่เกิน 40 ตัวอักษร ตัดที่ช่องว่างถ้ามี)
  let s = String(t).split('\n')[0].replace(/^(ช่วย|ขอ|อยากได้|please|make|build|create)\s*/i, '').replace(/^(ทำ|สร้าง|เขียน)\s*/, '').trim();
  if (s.length > 40) { const cut = s.slice(0, 40), sp = cut.lastIndexOf(' '); s = sp > 15 ? cut.slice(0, sp) : cut; }
  return s || 'โปรเจกต์ใหม่';
};
async function codeHome() {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  document.title = 'Kyber Code';
  const host = codeHost(); host.innerHTML = `<div class="cs-wrap"><div class="bar cs-bar"><button class="menu-btn" type="button" data-side aria-label="เมนู">${ic('menu')}</button><div class="ctitle"><b>Code</b></div><button class="lim" data-lim aria-label="ลิมิตการใช้งาน">${limHTML(me.usage || {})}</button></div><div class="cstart"><div class="cs-in">
    <h1 class="cs-h">What should we build?</h1>
    <div class="repo-row"><button type="button" class="repo-chip" id="nrepo"></button></div>
    <form class="cbox cs-box" id="nf"><textarea id="nt" rows="3" placeholder="อธิบายสิ่งที่อยากสร้าง เช่น เว็บร้านกาแฟ มีเมนูและปุ่มสั่งซื้อ" aria-label="สิ่งที่อยากสร้าง" maxlength="4000"></textarea>
      <div id="nflags" class="cflags"></div>
      <div class="crow"><button type="button" class="cb" id="nplus" aria-label="เครื่องมือและตัวเลือก" aria-haspopup="dialog">${ic('plus')}</button><button type="button" class="cb pick" id="nmdl" aria-haspopup="dialog"></button><button type="button" class="cb pick" id="neff" aria-haspopup="dialog"></button>
        <button class="send" id="ngo" aria-label="เริ่มสร้าง">${ic('up')}</button></div>
      <select id="nmodel" hidden>${me.models.filter(m => !m.locked).map(m => `<option value="${m.id}" ${String(m.id) === localStorage.getItem('model') ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <select id="neffort" hidden>${EFFORTS.map(([v]) => `<option value="${v}">${v}</option>`).join('')}</select></form>
    <div class="err" id="ne"></div>
    <div class="cs-ideas">${CODE_IDEAS.map(([l, t]) => `<button type="button" class="cs-idea" data-idea="${esc(t)}">${esc(l)}</button>`).join('')}</div>
    <p class="cs-foot"><button type="button" class="linkish" id="nempty">Start with an empty editor</button> · <button type="button" class="linkish" id="nall">All projects</button></p>
  </div></div></div>`;
  host.querySelector('[data-side]').onclick = () => openSide(); host.querySelector('[data-lim]').onclick = limitSheet;
  if (!window.CM && !window.DEMO) setTimeout(() => prefetch('/cm.js'), 1500); // ตัวแก้โค้ดพร้อมก่อนกดส่ง
  const ta = $('#nt'), grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'; };
  ta.oninput = grow; if (!isPhone()) ta.focus();
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isPhone()) { e.preventDefault(); $('#nf').requestSubmit(); } };
  host.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => { ta.value = b.dataset.idea; grow(); ta.focus(); });
  // โมเดล / ระดับความคิด / เครื่องมือ: ใช้ค่าเดียวกับกล่อง AI ในตัวแก้โค้ด (จำไว้ต่อเครื่อง)
  const curM = () => me.models.find(x => x.id === +$('#nmodel').value) || me.models.find(x => !x.locked) || me.models[0];
  const ui = () => {
    const m = curM(), efs = modelEfforts(m);
    $('#nmdl').innerHTML = `${m ? vendorLogo(m.name, 'xs') : ''}<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
    $('#neff').hidden = !efs.length;
    $('#neffort').value = effortFor(m, $('#neffort').value);
    $('#neff').innerHTML = `${ic('sparkles', 'sm')}${EFFORT_INFO[$('#neffort').value]?.[0] || 'Instant'}${ic('down', 'sm')}`;
    $('#nflags').innerHTML = ''
      + (IDE.cloud ? `<button type="button" class="flag agent-on" data-nf="cloud">${ic('terminal', 'sm')}Agent บนคลาวด์${ic('x', 'sm')}</button>` : '')
      + (IDE.agent ? `<button type="button" class="flag agent-on" data-nf="agent">${ic('sparkles', 'sm')}Agent ON${ic('x', 'sm')}</button>` : '')
      + (_skillsCache ? IDE.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-nf="sk" data-id="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
      + (_mcpCache ? IDE.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-nf="mc" data-id="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
  };
  IDE.cloud = localStorage.getItem('ccloud') === '1' && me?.role === 'admin';
  $('#neffort').value = localStorage.getItem('effort') || '';
  $('#nmodel').onchange = e => { localStorage.setItem('model', e.target.value); ui(); };
  $('#neffort').onchange = e => { localStorage.setItem('effort', e.target.value); ui(); };
  $('#nmdl').onclick = () => modelSheet('#nmodel'); $('#neff').onclick = () => effortSheet('#neffort', curM());
  const setSkills = ids => { IDE.skills = ids; localStorage.setItem('cskills', JSON.stringify(ids)); ui(); }, setMcps = ids => { IDE.mcps = ids; localStorage.setItem('cmcps', JSON.stringify(ids)); ui(); };
  const setAgent = on => { IDE.agent = on; localStorage.setItem('agent', on ? '1' : '0'); ui(); }, setCloud = on => { IDE.cloud = on; localStorage.setItem('ccloud', on ? '1' : '0'); ui(); };
  $('#nflags').onclick = e => {
    const f = e.target.closest('[data-nf]'); if (!f) return; const k = f.dataset.nf, id = +f.dataset.id;
    if (k === 'agent') setAgent(false); else if (k === 'cloud') setCloud(false);
    else if (k === 'sk') setSkills(IDE.skills.filter(x => x !== id)); else if (k === 'mc') setMcps(IDE.mcps.filter(x => x !== id));
  };
  $('#nplus').onclick = () => sheet('เครื่องมือ', optHTML('agent', ic('sparkles') + 'โหมด Agent (งานยาว): ' + (IDE.agent ? 'เปิด' : 'ปิด'), me.plan.paid ? 'AI ทำงานต่อเนื่องได้ถึง 20 รอบต่อคำสั่ง · ใช้ลิมิตมากกว่าปกติ' : 'ใช้ได้กับแพลนที่ชำระเงิน', IDE.agent)
    + (me.role === 'admin' ? optHTML('cloud', ic('terminal') + 'Agent บนคลาวด์ (รันโค้ดได้): ' + (IDE.cloud ? 'เปิด' : 'ปิด'), 'Agent แก้ไฟล์ รัน npm / python / git ทดสอบเองในเครื่องแยก ปิดแอปได้', IDE.cloud) : '') // ใช้แค่แอดมิน: ซ่อนจากลูกค้าให้เมนูสั้นลง
    + optHTML('skl', ic('sparkles') + 'Skills', 'เลือก Skill ให้ AI ใช้ในโหมด Code (สูงสุด 3)')
    + optHTML('mcp', ic('server') + 'Remote MCP', 'เชื่อมต่อ GitHub หรือ Remote MCP (สูงสุด 3)')
    + optHTML('clone', ic('branch') + 'Clone จาก GitHub', 'ดึง repo มาเป็นโปรเจกต์ใหม่')
    + (DESK ? optHTML('local', ic('folder') + 'เปิดโฟลเดอร์ในเครื่อง', 'ไฟล์ในโฟลเดอร์ขึ้นมาเป็นโปรเจกต์ AI แก้ไฟล์จริงในเครื่อง') : ''), (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    close(); const v = b.dataset.v;
    if (v === 'agent') { if (!me.plan.paid) return toast('โหมด Agent ใช้ได้กับแพลนที่ชำระเงิน', 'bad'); setAgent(!IDE.agent); }
    if (v === 'cloud') setCloud(!IDE.cloud);
    if (v === 'skl') skillsSheet(IDE.skills, setSkills);
    if (v === 'mcp') mcpSheet(IDE.mcps, setMcps);
    if (v === 'clone') cloneSheet();
    if (v === 'local') openLocal();
  }));
  const repoUI = () => { const rp = codeRepo(), b = $('#nrepo'); b.innerHTML = rp ? `${ic('branch', 'sm')}<span>${esc(rp.repo.split('/').pop())} · ${esc(rp.branch || 'main')}</span><i class="rc-x" data-clear title="ไม่ใช้ repo">${ic('x', 'sm')}</i>` : `${ic('branch', 'sm')}<span>เชื่อม GitHub repo</span>`; b.classList.toggle('on', !!rp); };
  $('#nrepo').onclick = e => { if (e.target.closest('[data-clear]')) { setCodeRepo(null); return repoUI(); } repoPicker(rp => { setCodeRepo(rp); repoUI(); ta.focus(); }); };
  repoUI();
  ui(); if (IDE.skills.length) loadSkills().then(ui).catch(() => {}); if (IDE.mcps.length) loadMcps().then(ui).catch(() => {});
  const create = async (body, prompt) => {
    const r = await api('/projects', { method: 'POST', body }); delete sideCache.code; openProject(r.id, prompt);
  };
  $('#nf').onsubmit = async e => {
    e.preventDefault(); const t = ta.value.trim(); if (!t) return ta.focus();
    const btn = $('#ngo'); btn.disabled = true; $('#ne').textContent = '';
    try { const rp = codeRepo(); if (rp) await cloneRepo(rp, t, $('#ne')); else await create({ name: nameFor(t), template: tplFor(t) }, t); }
    catch (x) { $('#ne').textContent = x.message; btn.disabled = false; }
  };
  $('#nempty').onclick = async e => { e.target.disabled = true; try { await create({ name: 'โปรเจกต์ใหม่', template: 'starter' }); } catch (x) { $('#ne').textContent = x.message; e.target.disabled = false; } };
  $('#nall').onclick = projectsSheet;
  const openLocal = async () => { // โปรเจกต์ใหม่ที่ผูกกับโฟลเดอร์ในเครื่อง: ไฟล์ในโฟลเดอร์ขึ้นมาเป็นไฟล์ในโปรเจกต์
    try {
      const { id } = await api('/projects', { method: 'POST', body: { name: 'โฟลเดอร์ในเครื่อง', empty: true } });
      const l = await DESK.link('p:' + id).catch(x => { toast(x.message, 'bad'); return null; });
      if (!l) { await api('/projects/' + id, { method: 'DELETE' }); return; }
      await api('/projects/' + id, { method: 'PUT', body: { name: l.name.slice(0, 60) } }); delete sideCache.code; openProject(id);
    } catch (x) { $('#ne').textContent = x.message; }
  };
}
// เปิดโปรเจกต์ในหน้าเดิม (ไม่โหลดหน้าใหม่) · prompt = ส่งให้ AI เริ่มทำทันที
function openProject(id, prompt) { setUrl('/code?p=' + id); codeView(id, prompt); }
function projectsSheet() {
  api('/projects').then(list => sheet('Projects', `<div class="sheet-form">${list.length > 6 ? '<input id="psearch" type="search" placeholder="Search projects" aria-label="Search projects" autocomplete="off">' : ''}
    <div class="plist">${list.map(p => `<div class="prow" data-name="${esc(p.name.toLowerCase())}"><a href="/code?p=${p.id}" data-close><b>${esc(p.name)}${p.shared ? ' <span class="pill">shared</span>' : ''}</b><small class="muted">${p.files} files · ${kb(p.size)} · ${when(p.updated_at)}</small></a>
      ${p.shared ? '' : `<button type="button" class="icon-btn xs ghost" data-ren="${p.id}" aria-label="Rename">${ic('pen', 'sm')}</button><button type="button" class="icon-btn xs ghost" data-del="${p.id}" aria-label="Delete">${ic('trash', 'sm')}</button>`}</div>`).join('') || '<p class="muted">No projects yet</p>'}</div></div>`, (d, close) => {
    d.querySelector('#psearch')?.addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); d.querySelectorAll('.prow').forEach(r => r.hidden = !!q && !r.dataset.name.includes(q)); });
    d.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', close));
    d.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
      const p = list.find(x => x.id === +b.dataset.ren); close(); const name = await promptSheet('ตั้งชื่อโปรเจกต์ใหม่', p.name, { title: 'Rename project' });
      if (name?.trim()) { await api('/projects/' + p.id, { method: 'PUT', body: { name } }); delete sideCache.code; navRecents(); }
      projectsSheet();
    });
    d.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      close(); if (await confirmSheet('ลบโปรเจกต์นี้? ไฟล์และแชตทั้งหมดจะหายถาวร', { title: 'Delete project', ok: 'Delete forever', danger: true })) { await api('/projects/' + b.dataset.del, { method: 'DELETE' }); delete sideCache.code; navRecents(); }
      projectsSheet();
    });
  })).catch(x => toast(x.message, 'bad'));
}
// repo ที่เลือกไว้บนหน้า New project (แบบ Claude Code: ชิปเหนือช่องพิมพ์) · จำไว้ต่อเครื่อง
const codeRepo = () => { try { const r = JSON.parse(localStorage.getItem('codeRepo') || 'null'); return r?.repo ? r : null; } catch { return null; } };
const setCodeRepo = r => { try { r ? localStorage.setItem('codeRepo', JSON.stringify(r)) : localStorage.removeItem('codeRepo'); } catch { /* ไม่มีที่เก็บ */ } };
// เลือก repo: รายการ repo ของผู้ใช้ (แตะเดียว) หรือพิมพ์เอง · ยังไม่เชื่อม GitHub ใส่ token ได้ในหน้าต่างเดียวกัน · onPick({ repo, branch, size })
async function repoPicker(onPick, title = 'เลือก GitHub repo') {
  const g = await api('/github').catch(() => ({})), repos = g.connected ? await api('/github/repos').catch(() => []) : [];
  sheet(title, `<form id="cf2" class="sheet-form">
    ${repos.length ? `<div class="repo-pick">${repos.map(x => `<button type="button" class="repo-it" data-repo="${esc(x.full_name)}" data-br="${esc(x.branch || '')}" data-size="${+x.size || 0}">${ic('branch', 'sm')}<span><b>${esc(x.full_name)}</b>${x.description ? `<small class="muted">${esc(x.description.slice(0, 80))}</small>` : ''}</span>${x.private ? '<i class="pill">private</i>' : ''}</button>`).join('')}</div><small class="muted">แตะ repo เพื่อเลือก หรือพิมพ์เองด้านล่าง</small>` : ''}
    <label>Repo</label><input name="repo" placeholder="owner/repo หรือลิงก์ GitHub" required>
    <label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main">
    ${g.connected ? `<p class="muted">เชื่อม GitHub แล้ว (${esc(g.login || '')})</p>` : `<label>GitHub token (ครั้งแรกครั้งเดียว · จำเป็นสำหรับ repo ส่วนตัว)</label><input name="token" type="password" autocomplete="off" placeholder="github_pat_...">`}
    <p class="muted" id="cmsg"></p><button class="btn blue">เลือก repo นี้</button></form>`, (d, close) => {
    d.querySelectorAll('[data-repo]').forEach(b => b.onclick = () => { close(); onPick({ repo: b.dataset.repo, branch: b.dataset.br, size: +b.dataset.size || 0 }); });
    d.querySelector('#cf2').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), msg = d.querySelector('#cmsg');
      try { if (f.token?.trim()) { msg.textContent = 'กำลังเชื่อม GitHub...'; await api('/github', { method: 'PUT', body: { token: f.token.trim() } }); } close(); onPick({ repo: f.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''), branch: f.branch.trim(), size: 0 }); }
      catch (x) { msg.innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    };
  });
}
// ดึง repo มาเป็นโปรเจกต์ใหม่ แล้วเปิด (prompt = ส่งให้ AI ทำต่อทันที) · ขึ้น % ระหว่างดึงไฟล์: ประมาณจากขนาด repo (GitHub บอกเป็น KB)
// ดึงจริงเป็นคำขอเดียวจึงไม่รู้ % จริง: เดินถึง 95% ตามเวลาที่คาด แล้วเป็น 100% เมื่อเสร็จ
async function cloneRepo(rp, prompt, msgEl) {
  const say = t => { if (msgEl) msgEl.textContent = t; };
  let id, timer;
  try {
    say('กำลังสร้างโปรเจกต์...');
    id = (await api('/projects', { method: 'POST', body: { name: rp.repo.split('/').pop() || 'repo', empty: true } })).id;
    say('กำลังเชื่อม repo...'); await api(`/projects/${id}/github`, { method: 'POST', body: { repo: rp.repo, branch: rp.branch || '' } });
    const t0 = Date.now(), est = 3 + (rp.size || 2000) / 600; // วินาทีโดยประมาณ (~600KB/วินาที + เวลาเริ่ม)
    const tick = () => say(`กำลังดึงไฟล์จาก GitHub... ${Math.min(95, Math.round(95 * (1 - Math.exp(-(Date.now() - t0) / 1000 / est * 2))))}%`);
    tick(); timer = setInterval(tick, 300);
    await api(`/projects/${id}/github/pull`, { method: 'POST', body: {} });
    clearInterval(timer); say('กำลังดึงไฟล์จาก GitHub... 100%');
    delete sideCache.code; openProject(id, prompt);
  } catch (x) { clearInterval(timer); if (id) api('/projects/' + id, { method: 'DELETE' }).catch(() => {}); throw x; }
}
// Clone จาก GitHub (เมนู): เลือก repo แล้วดึงเป็นโปรเจกต์ใหม่ พร้อมแสดง %
function cloneSheet() {
  repoPicker(rp => {
    sheet('Clone from GitHub', `<div class="sheet-form"><p class="sheet-msg">${esc(rp.repo)}${rp.branch ? ' · ' + esc(rp.branch) : ''}</p><p class="muted" id="clp">เริ่ม...</p></div>`, (d, close) => {
      cloneRepo(rp, null, d.querySelector('#clp')).then(close).catch(x => { d.querySelector('#clp').innerHTML = `<span class="bad">${esc(x.message)}</span>`; });
    });
  }, 'Clone from GitHub');
}
// ออกจากตัวแก้โค้ด (ไป New project / โปรเจกต์อื่น): หยุดคำตอบที่ค้าง บันทึกไฟล์ ปิดตัวรัน
function leaveIDE() {
  if (!IDE.pid) return;
  if (IDE.busy) codeStop();
  if (IDE.dirty.size) saveNow();
  IDE.node?.f.remove(); IDE.node = null;
  if (IDE.worker) { IDE.worker.terminate(); IDE.worker = null; }
  document.querySelector('.tmenu')?.remove(); document.querySelector('.sheet-bg')?.remove();
  IDE.pid = null;
}
function codeRoute() {
  const p = +qs().get('p'), s = qs().get('s');
  if (p && p === IDE.pid && $('#cmain .ide')) return s ? openSession(s) : undefined; // โปรเจกต์เดิม: สลับ session ในที่ ไม่โหลดตัวแก้โค้ดใหม่
  leaveIDE(); return codeDispatch();
}

// ---------- ตัวแก้โค้ด ----------
const edLight = () => document.documentElement.dataset.theme === 'light';
const edTheme = () => edLight() ? CM.EditorView.theme({ // ธีมขาว: ใช้สีไฮไลต์ตั้งต้นของ CodeMirror (ไม่ใส่ oneDark)
  '&': { height: '100%', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 'var(--cfs, 12px)', lineHeight: '1.6', fontVariantLigatures: 'contextual' },
  '.cm-content': { paddingTop: '10px', paddingBottom: '40px', caretColor: '#c25b3a' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#c25b3a', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'rgba(20,16,12,.03)', borderRight: '1px solid rgba(20,16,12,.08)', color: '#a39a8d' },
  '.cm-activeLine': { backgroundColor: 'rgba(194,91,58,.06)' }, '.cm-activeLineGutter': { backgroundColor: 'rgba(194,91,58,.1)', color: '#6a6256' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(194,91,58,.22)' },
  '.cm-panels': { backgroundColor: '#f2ede5', color: '#1d1a16' }, '.cm-ghost': { color: '#a39a8d', cursor: 'pointer' },
}, { dark: false }) : CM.EditorView.theme({
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
let wrap, ghostC; // สร้างหลังโหลด cm.js (needCM)
// เติมโค้ดอัตโนมัติ: AI เดาต่อจากเคอร์เซอร์ (Tab หรือแตะข้อความเทาเพื่อรับ)
const ghostExt = () => localStorage.getItem('ghost') === '0' || window.DEMO ? [] : CM.ghost((prefix, suffix) => api('/complete', { method: 'POST', body: { prefix, suffix, path: IDE.active } }).then(r => r.text));
function extensions(path) {
  return [
    edTheme(), CM.basicSetup, ...(edLight() ? [] : [CM.oneDark]), CM.lang(path), CM.EditorView.contentAttributes.of({ 'aria-label': 'ตัวแก้ไขโค้ด', 'aria-multiline': 'true' }), // ธีมของเราไว้ก่อน oneDark เพื่อให้ชนะ
    wrap.of(localStorage.getItem('wrap') === '0' ? [] : CM.EditorView.lineWrapping), ghostC.of(ghostExt()),
    CM.keymap.of([CM.indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { saveNow(); return true; } }]),
    CM.EditorView.updateListener.of(u => { if (u.docChanged) { markDirty(path); lintSoon(path); } if (u.selectionSet || u.docChanged) { const b = $('#selai'); if (b) b.hidden = u.state.selection.main.empty; } }),
  ];
}
// ---------- ตรวจ error ตอนพิมพ์ (JS / JSON / HTML / CSS) · แถบใต้ตัวแก้ไข แตะเพื่อไปบรรทัดนั้น ----------
const lineAt = (s, i) => s.slice(0, Math.max(0, i)).split('\n').length;
function lintText(path, src) {
  const out = [], ext = (path.split('.').pop() || '').toLowerCase();
  if (src.length > 400e3) return out;
  if (ext === 'json') { try { JSON.parse(src); } catch (e) { const m = /position (\d+)/.exec(e.message), l = /line (\d+)/.exec(e.message); out.push({ line: l ? +l[1] : m ? lineAt(src, +m[1]) : jsonLine(src), msg: 'JSON ไม่ถูกต้อง: ' + e.message.split(', "')[0].slice(0, 100) }); } }
  if (/^(m?js|cjs)$/.test(ext)) { // ตรวจไวยากรณ์ด้วยตัวแปลภาษาของเบราว์เซอร์ (ไม่รันโค้ด) · บรรทัด import/export ถูกเว้นไว้เพราะ Function() ไม่รับ
    const body = src.split('\n').map(l => { const x = l.trimStart(); return /^import\s+[^(]/.test(x) || /^export\s*(\{|\*)/.test(x) ? '' : l.replace(/^(\s*)export\s+(default\s+)?/, '$1'); }).join('\n');
    const bad = jsSyntaxLine(body); if (bad) out.push({ line: bad, msg: 'JavaScript: ไวยากรณ์ไม่ถูกต้อง (syntax error)' });
  }
  if (/^html?$/.test(ext)) { // แท็กเปิด-ปิดไม่ครบ (ข้าม void tag / script / style / comment)
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|!doctype)$/i, OPT = /^(p|li|td|th|tr|option|html|head|body|tbody|thead|dt|dd)$/, stack = [];
    const clean = src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' ')).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n<>/a-z]/gi, ' '));
    const re = /<(\/)?([a-zA-Z][\w-]*)[^>]*?(\/)?>/g; let m;
    while ((m = re.exec(clean))) { const tag = m[2].toLowerCase(); if (VOID.test(tag) || m[3]) continue;
      if (!m[1]) stack.push({ tag, i: m.index }); else { const k = stack.map(x => x.tag).lastIndexOf(tag); if (k < 0) out.push({ line: lineAt(src, m.index), msg: `HTML: มีแท็กปิด </${tag}> แต่ไม่มีแท็กเปิด` }); else { for (const x of stack.slice(k + 1)) if (!OPT.test(x.tag)) out.push({ line: lineAt(src, x.i), msg: `HTML: <${x.tag}> ไม่มีแท็กปิด (ก่อน </${tag}>)` }); stack.length = k; } } }
    for (const s of stack.filter(x => !OPT.test(x.tag)).slice(-3)) out.push({ line: lineAt(src, s.i), msg: `HTML: <${s.tag}> ไม่มีแท็กปิด` });
  }
  if (ext === 'css') { let d = 0, i = 0; for (const ch of src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))) { if (ch === '{') d++; else if (ch === '}') { d--; if (d < 0) { out.push({ line: lineAt(src, i), msg: 'CSS: มี } เกิน' }); d = 0; } } i++; } if (d > 0) out.push({ line: lineAt(src, src.length), msg: `CSS: ขาด } อีก ${d} ตัว` }); }
  return out.slice(0, 5);
}
function jsonLine(src) { // ข้อความ error ของ JSON ไม่มีตำแหน่ง: แปลทีละบรรทัดเพิ่มขึ้น หาบรรทัดแรกที่ไม่ใช่ "จบก่อนเวลา"
  const lines = src.split('\n'); if (lines.length > 3000) return 1;
  for (let n = 1; n <= lines.length; n++) { const pre = lines.slice(0, n).join('\n'); try { JSON.parse(pre); } catch (e) { const pos = /position (\d+)/.exec(e.message); if (!(/end of|Unterminated string/i.test(e.message) || (pos && +pos[1] >= pre.trimEnd().length))) return n; } }
  return lines.length;
}
// ตรวจไวยากรณ์ JS ด้วยตัวแยกคำของ CodeMirror (lezer) ไม่ใช้ new Function: หน้าเว็บบังคับ CSP ห้าม eval · คืนเลขบรรทัดแรกที่พัง หรือ 0
function jsSyntaxLine(src) {
  let parser; try { const l = CM.lang('x.js'); parser = (Array.isArray(l) ? l[0] : l).language.parser; } catch { return 0; }
  const errsOf = t => { const e = []; parser.parse(t).iterate({ enter: n => { if (n.type.isError) e.push(n.from); } }); return e; };
  const all = errsOf(src); if (!all.length) return 0;
  const lines = src.split('\n'); if (lines.length > 3000) return 1;
  for (let n = 1; n <= lines.length; n++) { // พิมพ์ถึงบรรทัด n แล้วพังก่อนท้ายข้อความ = พังที่บรรทัดนี้ (พังตรงท้าย = แค่ยังพิมพ์ไม่ครบ)
    const pre = lines.slice(0, n).join('\n'), end = pre.trimEnd().length;
    if (errsOf(pre).some(x => x < end)) return n;
  }
  let last = lines.length; while (last > 1 && !lines[last - 1].trim()) last--; // พังที่ท้ายไฟล์: ชี้บรรทัดสุดท้ายที่มีเนื้อหา
  return last;
}
let lintT = 0;
function lintSoon(path, ms = 700) {
  clearTimeout(lintT);
  lintT = setTimeout(() => {
    const bar = $('#lintbar'); if (!bar || !IDE.view || IDE.active !== path) return;
    const probs = isImg(path) ? [] : lintText(path, IDE.view.state.doc.toString());
    bar.hidden = !probs.length;
    bar.innerHTML = probs.map(p => `<button type="button" data-line="${p.line}">${ic('alert', 'sm')}<b>บรรทัด ${p.line}</b> ${esc(p.msg)}</button>`).join('');
    bar.onclick = e => { const b = e.target.closest('[data-line]'); if (!b) return; const ln = IDE.view.state.doc.line(Math.min(+b.dataset.line, IDE.view.state.doc.lines)); IDE.view.dispatch({ selection: { anchor: ln.from }, scrollIntoView: true }); IDE.view.focus(); };
  }, ms);
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
    try { await api(`/projects/${IDE.pid}/file`, { method: 'PUT', body: { path: p, content: c } }); IDE.files.set(p, c); toDisk([{ path: p, content: c }]); if (content(p) === c) IDE.dirty.delete(p); }
    catch (x) { setStatus('บันทึกไม่ได้: ' + x.message, true); return; }
  }
  setStatus(IDE.dirty.size ? 'ยังไม่บันทึก' : 'บันทึกแล้ว ✓'); drawTabs(); syntaxCheck();
}
// แถบ "กำลังทำงาน" ใต้ข้อความ AI: เห็นตลอดช่วงที่ AI ยังทำงาน รวมช่วงเงียบระหว่างรอบ (คิด, ใช้เครื่องมือ, สร้างรูป, รันตรวจผล)
// ผู้ใช้จะได้ไม่เข้าใจว่าค้างแล้วกดหยุด · อัปเดตทุกครึ่งวินาทีจากสถานะที่มีอยู่แล้ว ไม่ต้องแก้ทุกจุดที่ทำงาน
const WORK = { since: 0, lastLen: -1, lastTok: 0, off: 0 };
function workTick() {
  const box = $('#cmsgs'); if (!box) return;
  let el = $('#cwork'); if (!el) { el = document.createElement('div'); el.id = 'cwork'; el.className = 'cwork'; el.hidden = true; el.setAttribute('aria-live', 'polite'); box.after(el); }
  const now = Date.now(), stepping = /(\.\.\.|…)$/.test(IDE.status || '') && !/^(ยังไม่บันทึก)/.test(IDE.status || ''), on = IDE.busy || stepping;
  if (on) WORK.off = 0; else if (!WORK.off && WORK.since) WORK.off = now;
  const show = on || (WORK.off && now - WORK.off < 1500); // ช่วงต่อระหว่างรอบสั้นๆ ไม่ให้แถบกะพริบหาย
  if (!show) { if (!el.hidden) el.hidden = true; WORK.since = 0; WORK.off = 0; return; }
  if (!WORK.since) WORK.since = now;
  const last = IDE.msgs.at(-1), len = last ? String(last.content || '').length + String(last.thinking || '').length : 0;
  if (len !== WORK.lastLen) { WORK.lastLen = len; WORK.lastTok = now; }
  const quiet = now - WORK.lastTok, sec = Math.floor((now - WORK.since) / 1000);
  const what = stepping ? IDE.status.replace(/(\.\.\.|…)$/, '') : !IDE.busy ? 'กำลังเตรียมขั้นต่อไป' : quiet > 2500 ? (last?.thinking && !last?.content ? 'AI กำลังคิด' : 'AI กำลังทำงานต่อ') : 'AI กำลังเขียน';
  el.hidden = false; el.innerHTML = `<span class="cw-dot"></span><span>${esc(what)}…</span><span class="muted">${sec >= 60 ? Math.floor(sec / 60) + ' นาที ' : ''}${sec % 60} วิ</span>`;
}
setInterval(workTick, 500);
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
  if (!isPhone() && $('.ide')?.dataset.rp !== 'code') setRp('code');
  IDE.recent = [path, ...(IDE.recent || []).filter(x => x !== path)].slice(0, 8);
  try { localStorage.setItem('recent:' + IDE.pid, JSON.stringify(IDE.recent)); } catch { /* ไม่มีที่เก็บ ไม่เป็นไร */ }
  if (IDE.active && IDE.view) IDE.states.set(IDE.active, IDE.view.state);
  IDE.view.setState(stateFor(path)); showImg(path); lintSoon(path, 0);
  IDE.active = path;
  if (!IDE.open.includes(path)) IDE.open.push(path);
  drawTabs(); drawTree(); drawRecent(); setPane('code'); drawer(false);
}
// ดูรูปในโปรเจกต์ (แทนตัวแก้ไขข้อความ)
function showImg(path) {
  const v = $('#imgview'), main = $('.ide-main'); if (!v || !main) return;
  const raw = path ? IDE.files.get(path) : '', d = isImg(path || '') ? raw : '', on = isDataImg(d), bin = !on && isDataBin(raw);
  v.hidden = !on && !bin; main.classList.toggle('isimg', on || bin);
  if (bin) { // ไฟล์ไบนารี (ฟอนต์ เสียง PDF ...): แสดงข้อมูลแทนตัวแก้ข้อความ
    v.innerHTML = `<div class="iv-box"><div class="iv-meta"><b>${esc(path)}</b><span class="muted">ไฟล์ไบนารี · ~${Math.round(raw.length / 1365)}KB</span></div><p class="muted" style="margin:0 0 10px;font-size:12.5px">แก้ในตัวแก้โค้ดไม่ได้ ใช้ในโค้ดด้วยพาธ ${esc(path)} · ส่งออก zip ได้ไฟล์จริง</p><div class="row"><a class="btn out sm" href="${raw}" download="${esc(path.split('/').pop())}">Download</a><button class="btn red sm" id="ivdel">Delete</button></div></div>`;
    $('#ivdel').onclick = async () => { if (!await confirmSheet(`ลบ ${path} ?`, { title: 'ยืนยันการลบ', ok: 'Delete', danger: true })) return; try { await delFile(path); dropFile(path); refresh(); } catch (x) { setStatus(x.message, true); } };
    return;
  }
  if (!on) return;
  v.innerHTML = `<div class="iv-box"><img alt="${esc(path)}" src="${d}"><div class="iv-meta"><b>${esc(path)}</b><span class="muted" id="ivsz">~${Math.round(d.length / 1365)}KB</span></div>
    <p class="muted" style="margin:0 0 10px;font-size:12.5px">ใช้ในโค้ดด้วย &lt;img src="${esc(path)}"&gt; หรือ url(${esc(path)})</p><div class="row"><button class="btn out sm" id="ivcp">Copy path</button><button class="btn red sm" id="ivdel">Delete</button></div></div>`;
  const im = v.querySelector('img'); im.onload = () => { const z = $('#ivsz'); if (z) z.textContent = `${im.naturalWidth}×${im.naturalHeight}px · ~${Math.round(d.length / 1365)}KB`; };
  $('#ivcp').onclick = e => copy(path, e.target);
  $('#ivdel').onclick = async () => {
    if (!await confirmSheet(`ลบ ${path} ?`, { title: 'ยืนยันการลบ', ok: 'Delete', danger: true })) return;
    try { await delFile(path); dropFile(path); refresh(); } catch (x) { setStatus(x.message, true); }
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
  const row = (depth, inner) => `<div class="trow" style="--d:${depth};padding-left:${6 + depth * 14}px">${inner}</div>`; // --d = ระดับโฟลเดอร์ ใช้วาดเส้นโครงต้นไม้
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
        await delFile(path);
        for (const p of [...IDE.files.keys()]) if (folder ? p.startsWith(path) : p === path) dropFile(p);
        return refresh();
      }
      if (a === 'ren') {
        const to = await promptSheet(folder ? 'ชื่อโฟลเดอร์ใหม่ (พาธเต็ม)' : 'ชื่อไฟล์ใหม่ (ใส่ / เพื่อย้ายเข้าโฟลเดอร์)', folder ? path.slice(0, -1) : path, { title: 'เปลี่ยนชื่อ / ย้าย' });
        if (!to || to === path) return;
        await saveNow();
        await api(`/projects/${IDE.pid}/rename`, { method: 'POST', body: { from: path, to: folder ? to.replace(/\/?$/, '/') : to } });
        if (IDE.local) await DESK.rename(lkey(), path, folder ? to.replace(/\/$/, '') : to).catch(x => setStatus('ย้ายไฟล์ในเครื่องไม่ได้: ' + x.message, true));
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
async function writeFiles(files, fromDisk) { // นำเข้าหลายไฟล์ แล้วอัปเดตหน้าจอ
  await api(`/projects/${IDE.pid}/import`, { method: 'POST', body: { files } });
  if (!fromDisk) toDisk(files);
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
  const d = await api('/projects/' + IDE.pid), before = [...IDE.files.keys()];
  IDE.files = new Map(d.files.map(f => [f.path, f.content])); IDE.states.clear(); IDE.dirty.clear();
  if (IDE.local) { toDisk(d.files); for (const p of before) if (!has(p)) mirror(() => DESK.remove(lkey(), p)); } // ย้อนเวอร์ชัน / git pull / ย้ายไฟล์: ให้โฟลเดอร์ในเครื่องตรงกับโปรเจกต์
  IDE.open = IDE.open.filter(has);
  const a = openPath && has(openPath) ? openPath : has(IDE.active) ? IDE.active : IDE.open[0] || [...IDE.files.keys()][0];
  IDE.active = null; if (a) openFile(a); refresh();
}
function refresh() { drawTree(); drawTabs(); }

// ---------- อัปโหลด / zip ----------
async function uploadFiles(list) {
  const out = [], skip = [];
  for (const f of list) try { if (/^image\/(?!svg)/.test(f.type) || IMG_RE.test(f.name)) { out.push(await imageFile(f)); continue; } const r = await fileEntry(f.name, new Uint8Array(await f.arrayBuffer())); r.file ? out.push(r.file) : skip.push([f.name, r.why]); } catch (x) { skip.push([f.name, x.message]); }
  importReport('อัปโหลดไฟล์', out.length ? await writeChunks(out, skip) : 0, skip);
}
// ไฟล์ไบนารีอื่นที่ไม่ใช่รูป (ฟอนต์ เสียง วิดีโอ PDF ...) เก็บเป็น data URL ถ้าไม่ใหญ่เกิน ไม่ให้หายตอนนำเข้า · ส่งออก zip เป็นไฟล์จริงเหมือนเดิม
const BIN_MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', pdf: 'application/pdf', wasm: 'application/wasm', zip: 'application/zip' };
const BIN_RE = /\.(woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|mp4|webm|mov|pdf|wasm|zip|gz|tgz|rar|7z|jar|class|exe|dll|so|dylib|bin|dat|db|sqlite3?|psd|ai|sketch|fig|xlsx?|docx?|pptx?|keystore|jks|p12|pfx)$/i;
const BIN_MAX = 370e3; // base64 แล้วยังไม่เกิน 500KB ต่อไฟล์
const isDataBin = t => typeof t === 'string' && /^data:[\w.+/-]*;base64,/.test(t);
const b64u8 = u => { let x = ''; for (let i = 0; i < u.length; i += 0x8000) x += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(x); };
const looksBinary = u => { const n = Math.min(u.length, 8000); for (let i = 0; i < n; i++) if (u[i] === 0) return true; return false; };
// แปลงไฟล์หนึ่งไฟล์ (bytes) เป็นรายการที่เก็บในโปรเจกต์ได้ · คืน { file } หรือ { why }
async function fileEntry(path, u) {
  if (IMG_RE.test(path)) {
    const ext = path.split('.').pop().toLowerCase(), mime = { jpg: 'jpeg', jpeg: 'jpeg', ico: 'x-icon' }[ext] || ext;
    let d = `data:image/${mime};base64,` + b64u8(u);
    if (d.length > 420000) try { d = (await shrinkImage(d)).data; } catch { return { why: 'รูปเปิดไม่ได้' }; }
    return d.length > PF_MAX ? { why: 'รูปใหญ่เกิน ย่อแล้วยังเกิน 500KB' } : { file: { path, content: d } };
  }
  if (BIN_RE.test(path) || looksBinary(u)) {
    if (u.length > BIN_MAX) return { why: 'ไฟล์ไบนารีใหญ่เกิน 370KB' };
    return { file: { path, content: `data:${BIN_MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,` + b64u8(u) } };
  }
  const t = new TextDecoder('utf-8').decode(u).replace(/^﻿/, '');
  return t.length > PF_MAX ? { why: 'ไฟล์ข้อความใหญ่เกิน 500KB' } : { file: { path, content: t } };
}
const PF_MAX = 500e3, PF_COUNT = 1000, PF_BYTES = 20e6;
// ส่งขึ้นเซิร์ฟเวอร์ทีละชุด (กันคำขอใหญ่เกิน) · ชุดที่ไม่ผ่านไม่ทำให้ชุดอื่นหาย
async function writeChunks(files, skip) {
  let done = 0, chunk = [], size = 0;
  const flush = async () => {
    if (!chunk.length) return; const c = chunk; chunk = []; size = 0;
    try { await writeFiles(c); done += c.length; } catch (x) { for (const f of c) skip.push([f.path, x.message]); }
    setStatus(`กำลังนำเข้า ${done}/${files.length} ไฟล์...`);
  };
  for (const f of files) { if (chunk.length >= 60 || size + f.content.length > 2.5e6) await flush(); chunk.push(f); size += f.content.length; }
  await flush(); return done;
}
// สรุปหลังนำเข้า: บอกทุกไฟล์ที่ไม่ได้เข้า พร้อมเหตุผล (เดิมขึ้นแค่แถบสถานะแป๊บเดียว ผู้ใช้เลยคิดว่าไฟล์หาย)
function importReport(title, done, skip) {
  setStatus(`นำเข้า ${done} ไฟล์` + (skip.length ? ` · ไม่ได้นำเข้า ${skip.length}` : ''), skip.length > 0 && !done);
  if (!skip.length) return toast(`นำเข้า ${done} ไฟล์แล้ว`, 'ok');
  const by = new Map(); for (const [p, why] of skip) (by.get(why) || by.set(why, []).get(why)).push(p);
  sheet(title, `<div class="sheet-form"><p class="sheet-msg">นำเข้าแล้ว <b>${done}</b> ไฟล์ · ไม่ได้นำเข้า <b>${skip.length}</b> ไฟล์</p>
    ${[...by].map(([why, ps]) => `<details class="imp-skip"${by.size === 1 ? ' open' : ''}><summary><b>${esc(why)}</b> <span class="muted">${ps.length} ไฟล์</span></summary><ul>${ps.slice(0, 80).map(x => `<li>${esc(x)}</li>`).join('')}${ps.length > 80 ? `<li class="muted">และอีก ${ps.length - 80} ไฟล์</li>` : ''}</ul></details>`).join('')}
    <p class="muted" style="font-size:12.5px;margin:0">node_modules / ไฟล์ build ติดตั้งหรือสร้างใหม่ได้ด้วย npm install / npm run build ในเทอร์มินัล</p></div>`);
}
async function importZip(file) {
  setStatus('กำลังแตก zip...');
  await lib('jszip');
  let z; try { z = await JSZip.loadAsync(file); } catch { return setStatus('เปิด zip ไม่ได้ (ไฟล์เสียหรือไม่ใช่ zip)', true); }
  const skip = [], ALWAYS = /(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;
  const norm = n => n.replace(/\\/g, '/').replace(/^(\.?\/)+/, '').split('/').map(seg => seg.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim()).filter(Boolean).join('/'); // zip จาก Windows ใช้ \ · ตัดอักษรที่ใช้ในชื่อไฟล์ไม่ได้
  let entries = Object.values(z.files).filter(e => !e.dir).map(e => ({ e, name: norm(e.name) })).filter(x => x.name);
  let junk = 0; entries = entries.filter(x => ALWAYS.test(x.name) ? (junk++, false) : true);
  const roots = new Set(entries.map(x => x.name.split('/')[0]));
  if (roots.size === 1 && entries.every(x => x.name.includes('/'))) for (const x of entries) x.name = x.name.split('/').slice(1).join('/'); // zip ที่มีโฟลเดอร์ครอบชั้นเดียว
  const isNode = entries.some(x => /(^|\/)package\.json$/.test(x.name)), BUILT = /(^|\/)(dist|build|\.next|\.nuxt|\.output|\.svelte-kit|coverage|\.cache|\.parcel-cache|\.turbo)\//;
  const out = [], have = new Map([...IDE.files].map(([k, v]) => [k, v.length]));
  for (const { e, name } of entries) {
    if (isNode && BUILT.test(name)) { skip.push([name, 'ไฟล์ที่ build แล้ว (สร้างใหม่ได้)']); continue; } // โปรเจกต์ Node: dist/build เป็นผลลัพธ์ ไม่ใช่โค้ดต้นฉบับ
    if (name.length > 200) { skip.push([name, 'ชื่อไฟล์/พาธยาวเกิน 200 ตัวอักษร']); continue; }
    const r = await fileEntry(name, await e.async('uint8array'));
    if (!r.file) { skip.push([name, r.why]); continue; }
    const next = new Map(have); next.set(name, r.file.content.length);
    if (next.size > PF_COUNT || [...next.values()].reduce((a, b) => a + b, 0) > PF_BYTES) { skip.push([name, 'เกินขีดจำกัดโปรเจกต์ (1,000 ไฟล์ / 20MB)']); continue; }
    have.set(name, r.file.content.length); out.push(r.file);
  }
  if (junk) skip.push([`${junk} ไฟล์ใน node_modules / .git / __MACOSX`, 'ไฟล์ระบบ / แพ็กเกจ (ไม่ต้องนำเข้า)']);
  if (!out.length) return importReport('นำเข้า zip', 0, skip.length ? skip : [['(zip ว่าง)', 'ไม่พบไฟล์']]);
  importReport('นำเข้า zip', await writeChunks(out, skip), skip);
}
async function exportZip() {
  await saveNow(); await lib('jszip');
  const z = new JSZip(); for (const p of IDE.files.keys()) isDataBin(content(p)) && (isImg(p) || BIN_RE.test(p) || !/\.(txt|md|html?|css|js|json|svg)$/i.test(p)) ? z.file(p, content(p).split(',')[1], { base64: true }) : z.file(p, content(p));
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
  const deferred = [];
  const dir = dirOf(htmlPath);
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => { const fp = resolveFrom(dir, href); return fp && has(fp) && /stylesheet/i.test(m) ? `<style>\n${content(fp)}\n</style>` : m; })
    .replace(/<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi, (m, a, src, b) => { const fp = resolveFrom(dir, src); return fp && has(fp) && /\.svg$/i.test(fp) ? `<img${a}src="data:image/svg+xml;base64,${toB64(content(fp))}"${b}>` : fp && isImg(fp) && isDataImg(IDE.files.get(fp)) ? `<img${a}src="${IDE.files.get(fp)}"${b}>` : m; })
    .replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => {
      const fp = resolveFrom(dir, src);
      if (!fp || !has(fp)) return m;
      const isMod = /\btype\s*=\s*["']module["']/i.test(a + b);
      const body = isMod ? rewriteMod(content(fp), dirOf(fp)) : content(fp);
      const tag = `<script${(a + b).replace(/\s+defer\b(=["']?[^"'\s>]*["']?)?/gi, '')}>\n${body.replace(/<\/script/gi, '<\\/script')}\n</script>`;
      if (!isMod && /\bdefer\b/i.test(a + b)) { deferred.push(tag); return ''; } // defer ใช้กับสคริปต์ฝังไม่ได้ → ย้ายไปท้าย body (ลำดับเดิม)
      return tag;
    })
    .replace(/<script\b([^>]*\btype\s*=\s*["']module["'][^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => /src=/.test(attrs) ? m : `<script${attrs}>${rewriteMod(body, dir).replace(/<\/script/gi, '<\\/script')}</script>`);
  if (deferred.length) html = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, deferred.join('\n') + '\n</body>') : html + deferred.join('\n');
  html = html.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => { const fp = resolveFrom(dir, ref); return fp && isDataBin(IDE.files.get(fp)) ? `url(${q}${IDE.files.get(fp)}${q})` : m; }); // รูป / ฟอนต์ใน CSS
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
// รัน Python บนคลาวด์ก่อน (ต่อเน็ตได้ · ติดตั้งแพ็กเกจให้เอง) · แพลนฟรี/เครื่องไม่พร้อม = รันในเบราว์เซอร์แทน (Pyodide)
let idePyCloudOff = false;
async function runPython(main) {
  runTab('con');
  if (window.DEMO) return log('warn', 'หน้าเดโมรัน Python ไม่ได้ (sandbox ห้ามโหลดไฟล์ Python) บนเว็บจริงใช้ได้');
  if (!idePyCloudOff && !IDE.running) {
    IDE.running = true; $('#run-status').textContent = 'กำลังรันบนคลาวด์...'; log('info', `▶ python ${main} (คลาวด์)`);
    try {
      const r = await fetch('/api/py/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ main, files: [...IDE.files.keys()].map(p => ({ path: p, content: content(p) })) }), signal: AbortSignal.timeout(150e3) });
      if (r.ok) {
        const d = await r.json(); IDE.running = false;
        if (d.out) log(d.code ? 'error' : 'log', d.out.replace(/\n$/, '')); if (d.code) badge();
        if (d.imgs?.length) { const c = $('#console'); d.imgs.forEach(src => { const i = document.createElement('img'); i.src = src; i.alt = 'กราฟจาก Python'; i.className = 'py-img'; c?.append(i); }); }
        if (d.outs?.length) log('info', 'ไฟล์ใน /out: ' + d.outs.map(o => o.name).join(', ') + ' (สั่งในแชตให้ AI บันทึกเข้าโปรเจกต์ได้)');
        $('#run-status').textContent = `จบการทำงาน · ${(d.ms / 1000).toFixed(1)} วิ บนคลาวด์`; return;
      }
      if (r.status === 402 || r.status === 503) idePyCloudOff = true; else log('warn', (await r.json().catch(() => ({}))).error || 'รันบนคลาวด์ไม่สำเร็จ ลองในเบราว์เซอร์แทน');
    } catch { log('warn', 'เชื่อมเครื่องคลาวด์ไม่ได้ รันในเบราว์เซอร์แทน'); }
    IDE.running = false;
  }
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
function stopCode() {
  if (IDE.local) DESK.kill();
  if (IDE.node?.jobs.size) { for (const j of IDE.node.jobs.values()) j({ code: 130, stdout: '', stderr: 'หยุดแล้ว (ต้องติดตั้งแพ็กเกจใหม่)', files: [] }); IDE.node.f.remove(); IDE.node = null; termOut('■ หยุดแล้ว\n', 'err'); }
  if (IDE.worker && IDE.running) { IDE.worker.terminate(); IDE.worker = null; IDE.running = false; log('warn', '■ หยุดแล้ว'); $('#run-status').textContent = 'หยุดแล้ว'; }
  if (IDE.frame) { IDE.frame.remove(); IDE.frame = null; $('#out').innerHTML = '<p class="muted" style="padding:16px">หยุดแล้ว กด รัน เพื่อรันใหม่</p>'; }
}
function badge() { const b = $('[data-rtab=con]'); if (b && IDE.runTab !== 'con') b.classList.add('alert'); }
function runTab(t) {
  IDE.runTab = t; $('#out').hidden = t !== 'out'; $('#console').hidden = t !== 'con'; $('#term').hidden = t !== 'term';
  document.querySelectorAll('[data-rtab]').forEach(b => { b.classList.toggle('on', b.dataset.rtab === t); if (b.dataset.rtab === t) b.classList.remove('alert'); });
}
function showRun(on) { $('.ide').dataset.run = on ? '1' : ''; if (!isPhone()) setRp(on ? 'preview' : 'code'); if (on && matchMedia('(max-width: 999px)').matches && !$('.ide').hasAttribute('data-split')) setPane('run'); } // แบ่งจอ: ผลลัพธ์อยู่ใต้โค้ดอยู่แล้ว ไม่ต้องสลับหน้า
// ลิ้นชักไฟล์ (มือถือ): ปุ่มเมนูมุมซ้ายบน / แท็บ "ไฟล์" ด้านล่าง
function drawer(on) { const ide = $('.ide'); if (!ide) return; ide.dataset.drawer = on ? '1' : ''; $('#burger')?.setAttribute('aria-expanded', !!on); }
// รูปแบบ AI บนมือถือ (ผู้ใช้เลือกในตั้งค่า): page = หน้าแยก · sheet = แผ่นลอยทับโค้ด · bar = แถบสั่งเร็วใต้โค้ด + แผ่นลอย · split = แบ่งจอบน-ล่าง
const AI_MODES = [['page', 'หน้าแยก', 'สลับไปหน้า AI เต็มจอ (แบบเดิม)'], ['sheet', 'แผ่นลอยทับโค้ด', 'ปุ่ม AI เปิดแผ่นครึ่งจอ ยังเห็นโค้ดด้านบน'], ['bar', 'แถบสั่งเร็วใต้โค้ด', 'พิมพ์คำสั่งใต้โค้ด เลือกโมเดล/Effort ได้ และทำให้อัตโนมัติทั้งหมด (ใช้การแก้ไข รัน ตรวจผล)'], ['split', 'แบ่งจอ บน-ล่าง', 'โค้ดอยู่บน AI อยู่ล่างตลอดเวลา']];
// หน้าโปรเจกต์แบบแชตเป็นหลัก (แบบ Claude Code): ซ้าย = บทสนทนากับ AI · ขวา = Preview / Code / Files · มือถือเปิดที่แชต
const chatLayout = () => localStorage.getItem('clayout') !== 'editor';
function setRp(k) {
  const ide = $('.ide'); if (!ide || !chatLayout()) return;
  ide.dataset.rp = k; document.querySelectorAll('.rp-tabs [data-rp]').forEach(b => { b.classList.toggle('on', b.dataset.rp === k); b.setAttribute('aria-selected', b.dataset.rp === k); });
  requestAnimationFrame(() => IDE.view?.requestMeasure());
}
const aiMode = () => { if (chatLayout()) return 'page'; const m = localStorage.getItem('aimode'); return AI_MODES.some(x => x[0] === m) ? m : 'split'; }; // ค่าเริ่มต้น = แบ่งจอ
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
    <label style="margin:16px 0 6px">หน้าโปรเจกต์</label>${[['chat', 'แชตเป็นหลัก (แบบ Claude Code)', 'ซ้ายคุยกับ AI ขวาดู Preview / Code / Files · มือถือเปิดที่แชต'], ['editor', 'ตัวแก้โค้ดเป็นหลัก', 'ไฟล์ · โค้ด · AI สามช่อง (แบบเดิม)']].map(([v, t, ds]) => optHTML('L' + v, t, ds, (chatLayout() ? 'chat' : 'editor') === v)).join('')}
    ${chatLayout() ? '' : `<label style="margin:16px 0 6px">รูปแบบ AI บนมือถือ</label>${AI_MODES.map(([v, t, d]) => optHTML(v, t, d, v === mode)).join('')}`}`, (d, close) => {
    d.querySelectorAll('.opt[data-v^="L"]').forEach(b => b.onclick = e => { e.stopImmediatePropagation(); localStorage.setItem('clayout', b.dataset.v.slice(1)); close(); codeView(IDE.pid); });
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
function termOut(text, cls = '', live) {
  const t = $('#term-o'); if (!t) return;
  t.insertAdjacentHTML('beforeend', `<span class="${cls}">${esc(text)}</span>`);
  if (cls === 'err' && text.trim() && !live) t.insertAdjacentHTML('beforeend', ` <button type="button" class="btn-fix" data-fix="${esc(text.slice(0, 1500))}">Fix with AI</button>\n`);
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
// รันคำสั่ง: ส่งไฟล์โปรเจกต์ไปด้วย ไฟล์ที่คำสั่งสร้าง/แก้ (ยกเว้น node_modules) จะถูกบันทึกกลับเข้าโปรเจกต์
async function nodeRun(cmd) {
  if (IDE.local) return localRun(cmd);
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
// ---------- โฟลเดอร์ในเครื่อง (เปิดในแอป Kyber Desktop): ไฟล์ในโปรเจกต์ = ไฟล์จริงในโฟลเดอร์ · RUN รันใน terminal ของเครื่อง ----------
// โปรเจกต์ยังอยู่บนเซิร์ฟเวอร์ครบ (ประวัติ เวอร์ชัน แชต เปิดจากมือถือได้) แอปเขียนตามลงเครื่อง และดึงไฟล์ที่แก้ด้วยโปรแกรมอื่นกลับขึ้นมาเมื่อกลับมาที่หน้าต่าง
const DESK = window.astraDesktop?.fs;
const lkey = () => 'p:' + IDE.pid;
const mirror = fn => { if (IDE.local) fn().catch(x => setStatus('เขียนไฟล์ลงเครื่องไม่ได้: ' + x.message, true)); };
const toDisk = files => mirror(() => DESK.write(lkey(), files.map(f => ({ path: f.path, content: f.content }))));
async function delFile(path) { await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' }); mirror(() => DESK.remove(lkey(), path)); }
async function syncDisk(first) {
  if (!IDE.local || IDE.syncing || IDE.busy) return; IDE.syncing = true;
  try {
    await saveNow();
    const { files, skipped } = await DESK.scan(lkey()), disk = new Map(files.map(f => [f.path, f.content])), skip = new Set(skipped);
    const up = files.filter(f => !has(f.path) || content(f.path) !== f.content); // ใหม่/แก้ในเครื่อง → ขึ้นโปรเจกต์ (ในเครื่องชนะ)
    const gone = [...IDE.files.keys()].filter(p => !disk.has(p) && !skip.has(p)), delHere = IDE.seen ? gone.filter(p => IDE.seen.has(p)) : [];
    const down = gone.filter(p => !delHere.includes(p)); // มีในโปรเจกต์แต่ยังไม่มีในเครื่อง (เพิ่งเชื่อม / สร้างจากเครื่องอื่น) → เขียนลงเครื่อง ไม่ลบอะไรทิ้ง
    for (let i = 0; i < up.length; i += 40) await writeFiles(up.slice(i, i + 40), true);
    for (const p of delHere) { await api(`/projects/${IDE.pid}/file?path=${encodeURIComponent(p)}`, { method: 'DELETE' }); dropFile(p); }
    if (down.length) await DESK.write(lkey(), down.map(p => ({ path: p, content: content(p) })));
    IDE.seen = new Set([...disk.keys(), ...down]);
    if (delHere.length) refresh();
    if (first && skipped.length) toast(`ข้าม ${skipped.length} ไฟล์ในเครื่อง (ไบนารี / ใหญ่เกิน 500KB / เกิน 1,000 ไฟล์ หรือ 20MB) · ไฟล์ยังอยู่ในเครื่องครบ`);
    if (up.length || delHere.length) setStatus(`ซิงก์จากเครื่อง ${up.length + delHere.length} ไฟล์ ✓`);
  } catch (x) { setStatus('ซิงก์โฟลเดอร์ในเครื่องไม่ได้: ' + x.message, true); }
  finally { IDE.syncing = false; }
}
async function localRun(cmd) {
  if (await DESK.isServer(cmd)) return localServe(cmd);
  await saveNow(); showRun(true); runTab('term');
  termOut(`$ ${cmd}\n`, 'cmd'); $('#run-status').textContent = 'กำลังรันในเครื่อง...';
  const d = await DESK.run(lkey(), cmd, o => { if (o.out) termOut(o.out); if (o.err) termOut(o.err, 'err', true); }).catch(x => ({ code: 1, stdout: '', stderr: x.message }));
  if (d.denied) termOut(d.stderr + '\n', 'err', true);
  termOut(`[exit ${d.code}]\n`, d.code ? 'err' : 'muted');
  $('#run-status').textContent = '';
  await syncDisk(); // คำสั่งสร้าง/แก้ไฟล์ (build, format, codegen) → ขึ้นโปรเจกต์
  return d;
}
// dev server (npm run dev ฯลฯ): รันค้างเบื้องหลังในเครื่อง ไม่รอให้จบ · ผลลัพธ์ไหลเข้า Terminal · ปุ่ม 🌐 บนหัวจอ = เปิดพรีวิว / หยุด
async function localServe(cmd) {
  await saveNow(); showRun(true); runTab('term'); termOut(`$ ${cmd}  (รันเบื้องหลัง)\n`, 'cmd'); IDE.srvLog = '';
  const d = await DESK.serve(lkey(), cmd).catch(x => ({ code: 1, stderr: x.message }));
  if (d.stderr) { termOut(d.stderr + '\n', 'err', true); return { code: 1, stdout: '', stderr: d.stderr }; }
  const msg = d.running ? `เซิร์ฟเวอร์รันอยู่เบื้องหลัง${d.port ? ' ที่ http://localhost:' + d.port : ' (ยังไม่เห็นพอร์ตใน 20 วินาทีแรก)'} · เปิดพรีวิว/หยุดได้ที่ปุ่ม 🌐 ด้านบน` : 'เซิร์ฟเวอร์หยุดทำงานทันที ดู error ด้านบน';
  termOut(msg + '\n', d.running ? 'muted' : 'err'); srvUI();
  return { code: d.running ? 0 : 1, stdout: msg + '\n' + (IDE.srvLog || '').slice(-3000), stderr: '' };
}
async function srvUI() {
  const b = $('#srvb'); if (!b) return;
  const sv = IDE.local ? await DESK.serveInfo(lkey()).catch(() => null) : null; b.hidden = !sv;
  if (sv) b.innerHTML = `${ic('globe', 'sm')} ${sv.port ? ':' + sv.port : 'server'}`;
  b.onclick = async () => { const a = await sheetPick(`${sv.cmd}${sv.port ? ' · http://localhost:' + sv.port : ''}`, [...(sv.port ? [['open', 'เปิดพรีวิว']] : []), ['stop', 'หยุดเซิร์ฟเวอร์']]); if (a === 'open') DESK.preview(sv.port); if (a === 'stop') { await DESK.serveStop(lkey()); setTimeout(srvUI, 500); } };
}
if (DESK) {
  DESK.onServe?.(d => { if (!IDE.local || d.k !== lkey()) return; const t = d.out || d.err; if (t) { termOut(t, d.err ? 'err' : '', true); IDE.srvLog = ((IDE.srvLog || '') + t).slice(-20000); } if (d.port || d.exit != null) { if (d.exit != null) termOut(`[เซิร์ฟเวอร์หยุด exit ${d.exit}]\n`, 'muted'); srvUI(); } });
  DESK.onChanged?.(k => { if (IDE.local && k === lkey()) syncDisk(); }); // แก้ไฟล์ด้วยโปรแกรมอื่น → ขึ้นโปรเจกต์ทันที
}
async function linkLocal() {
  if (IDE.local) {
    IDE.local = await DESK.linked(lkey()).catch(() => IDE.local) || IDE.local;
    const a = await sheetPick(`เชื่อมกับโฟลเดอร์ในเครื่อง: ${IDE.local.path}`, [['open', 'เปิดโฟลเดอร์'], ['sync', 'ซิงก์ตอนนี้'], ...(IDE.local.auto ? [['auto', 'ปิดรันคำสั่งอัตโนมัติ (ตอนนี้เปิดอยู่ ยกเว้นคำสั่งอันตราย)']] : []), ['off', 'เลิกเชื่อม (ไฟล์ในเครื่องและในโปรเจกต์ยังอยู่ครบ)']]);
    if (a === 'auto') { await DESK.autoOff(lkey()); IDE.local.auto = false; toast('ปิดรันอัตโนมัติแล้ว ต่อไปจะถามทุกคำสั่ง'); }
    if (a === 'open') DESK.open(lkey()); if (a === 'sync') syncDisk(true);
    if (a === 'off') { DESK.unwatch(lkey()); DESK.serveStop(lkey()); await DESK.unlink(lkey()); IDE.local = null; IDE.seen = null; localUI(); toast('เลิกเชื่อมโฟลเดอร์แล้ว'); }
    return;
  }
  const l = await DESK.link(lkey()); if (!l) return;
  IDE.local = l; IDE.seen = null; localUI(); DESK.watch(lkey()); toast(`เชื่อม ${l.name} แล้ว · ไฟล์ในเครื่องจะทับไฟล์ชื่อเดียวกันในโปรเจกต์`, 'ok'); await syncDisk(true);
}
function localUI() { const b = $('#localb'); if (b) { b.hidden = !DESK; b.innerHTML = `${ic('folder', 'sm')} ${IDE.local ? esc(IDE.local.name) : 'โฟลเดอร์ในเครื่อง'}`; b.classList.toggle('blue', !!IDE.local); b.classList.toggle('out', !IDE.local); } }
const sheetPick = (title, opts) => new Promise(ok => { sheet(title, opts.map(([k, t]) => `<button type="button" class="opt" data-v="${k}">${esc(t)}</button>`).join(''), (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { close(); ok(b.dataset.v); })); }); // ปิดแผ่นโดยไม่เลือก = ไม่ทำอะไร
if (DESK) addEventListener('focus', () => { if (IDE.local && document.querySelector('.ide')) syncDisk(); });
const PATH_OK = p => p && !p.startsWith('node_modules/') && p.length < 200;
// AI สั่ง RUN: ใช้การแก้ไขของข้อความนั้นก่อน แล้วรัน แล้วส่งผลกลับให้ AI
// AI สั่งสร้างรูปด้วยบรรทัด `IMAGE <คำบรรยาย> -> images/ชื่อ.jpg` → เรียก /api/image สร้างรูป ย่อ เก็บเป็นไฟล์ในโปรเจกต์ แล้วส่งผลกลับให้ AI ใส่ลงโค้ดต่อเอง
const IMG_LINE = /^[\u2063 \t]*IMAGE[ \t]+(.+?)[ \t]*(?:->|→)[ \t]*(\S+)[ \t]*$/gm;
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
// หลัง AI แก้ไฟล์: โปรเจกต์มี scripts.test → รัน npm test เอง ไม่ผ่านส่งผลให้ AI แก้ (สูงสุด 2 รอบต่อคำสั่ง) · true = รันแล้ว
async function autoTest() {
  let ts = ''; try { ts = JSON.parse(IDE.files.get('package.json') || '{}').scripts?.test || ''; } catch { /* package.json พัง */ }
  if (!ts || /no test specified/.test(ts) || (IDE.round ?? 0) >= 2) return false;
  setStatus('กำลังรัน npm test...'); const d = await nodeRun('npm test').catch(x => ({ code: 1, stderr: x.message }));
  if (d.code === 0) { setStatus('เทสต์ผ่าน ✓'); toast('npm test ผ่าน ✓', 'ok'); return true; }
  const out = (d.stdout || '') + (d.stderr ? '\n[stderr]\n' + d.stderr : ''); IDE.round = (IDE.round ?? 0) + 1; setPane('ai');
  await codeSend({ text: `[ผลการรันเทสต์อัตโนมัติ]\n$ npm test\n(exit ${d.code})\n${out.length > 6000 ? out.slice(0, 2000) + '\n…(ตัดกลาง)…\n' + out.slice(-4000) : out || '(ไม่มีผลลัพธ์)'}\n\nเทสต์ไม่ผ่าน แก้โค้ดให้ผ่าน (ห้ามแก้หรือลบเทสต์เพื่อให้ผ่าน เว้นแต่เทสต์ผิดจริง) แล้วสรุปสั้นๆ` });
  return true;
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
  $('#ceffort').value = effortFor(m, $('#ceffort').value);
  $('#ceff').innerHTML = `${ic('sparkles', 'sm')}<span>${EFFORT_INFO[$('#ceffort').value]?.[0] || 'Instant'}</span>${ic('down', 'sm')}`;
  $('#bmdl').innerHTML = $('#cmdl').innerHTML; $('#beff').innerHTML = $('#ceff').innerHTML; $('#beff').hidden = !efs.length; // แถบสั่งเร็วใช้ค่าเดียวกับกล่อง AI
  $('#cflags').innerHTML = ''
    + (IDE.bgJob ? `<button type="button" class="flag agent-on" data-flag="bgagent" title="Agent กำลังทำงานบนเซิร์ฟเวอร์ · แตะเพื่อดู">${ic('server', 'sm')}${IDE.bgJob.role === 'lead' ? `ทีม Agent · ${AG_LABEL[IDE.bgJob.status]} · เสร็จ ${(IDE.bgJob.team || []).filter(k => k.role === 'worker' && !['waiting', 'queued', 'running', 'stopping'].includes(k.status)).length}/${(IDE.bgJob.team || []).filter(k => k.role === 'worker').length}` : `Agent ทำงานอยู่ · รอบ ${IDE.bgJob.rounds}/20`}</button>` : '')
    + (IDE.cloud ? `<button type="button" class="flag agent-on" data-flag="cloud" title="ข้อความที่ส่งจะไปให้ Agent บนคลาวด์ทำ · แตะเพื่อปิด">${ic('terminal', 'sm')}Agent บนคลาวด์${ic('x', 'sm')}</button>` : '')
    + (IDE.agent ? `<button type="button" class="flag agent-on" data-flag="agent" title="โหมด Agent เปิดอยู่: ทำงานต่อเนื่องได้ถึง 20 รอบ · แตะเพื่อปิด">${ic('sparkles', 'sm')}Agent ON</button>` : '')
    + (IDE.skills.length && _skillsCache ? IDE.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-flag="sk" data-sid="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
    + (IDE.mcps.length && _mcpCache ? IDE.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-flag="mc" data-mid="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
}
function setOpt(k, on) { localStorage.setItem(k, on ? '1' : '0'); if (k === 'auto') IDE.autoMode = on; else IDE.autoApply = on; }
// สมาชิกโปรเจกต์: เจ้าของเชิญ/ลบได้ · สมาชิกกดออกจากโปรเจกต์ได้ · แก้ไฟล์เดียวกันพร้อมกัน = บันทึกหลังสุดชนะ
// Agent เบื้องหลัง: ส่งงานให้เซิร์ฟเวอร์ทำเองทั้งชุด (ปิดแอปได้) · ดูสถานะ/หยุด/โหลดไฟล์ใหม่
const AG_LABEL = { queued: 'รอคิว', running: 'กำลังทำงาน', stopping: 'กำลังหยุด', done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิต', failed: 'ไม่สำเร็จ', timeout: 'หมดเวลา', waiting: 'รอคิว (ไฟล์ชนกัน)', team: 'ทีมกำลังทำงาน', reviewing: 'กำลังตรวจรวม', plan: 'รอยืนยันแผน', planned: 'ในแผน' };
const agBusy = j => ['queued', 'running', 'stopping', 'team', 'reviewing', 'plan'].includes(j?.status);
const AG_ROLE = { worker: 'ลูกทีม', review: 'ผู้ตรวจ' };
// แผงทีม: ลูกทีมแต่ละตัว (สถานะ, ไฟล์, รอบ) + หยุดรายตัว
// แผนของหัวหน้ารอยืนยัน: แก้ชื่อ/คำสั่ง/ไฟล์ หรือเอางานย่อยออก แล้วกดเริ่มทีม
const planForm = j => `<p class="sheet-msg"><b>หัวหน้าแบ่งงานเสร็จแล้ว รอคุณยืนยัน</b><br><small class="muted">${esc(j.prompt.slice(0, 120))}</small></p><div id="agplan" data-id="${j.id}">${(j.team || []).filter(k => k.status === 'planned').map(k => { const p = JSON.parse(k.plan || '{}'); return `<div class="mem tm" style="display:block" data-k="${k.id}"><label class="sw-row" style="margin:0 0 6px"><span class="sw"><input type="checkbox" data-keep checked><span></span></span><input data-title value="${esc(p.title || '')}" maxlength="80" style="flex:1"></label><textarea data-prompt rows="3" maxlength="4000">${esc(p.prompt || '')}</textarea><input data-files value="${esc(JSON.parse(k.scope || '[]').join(', '))}" placeholder="ไฟล์ที่แก้ได้ คั่นด้วย ," style="margin-top:6px"></div>`; }).join('')}</div><div class="row"><button type="button" class="btn blue" id="agstart">เริ่มทีม</button><button type="button" class="btn red sm" id="agx">ยกเลิกแผน</button></div>`;
const mName = id => me.models.find(x => x.id === id)?.name || 'โมเดล #' + id;
const agModels = () => me.models.filter(x => !['image', 'embedding'].includes(x.provider) && !x.wallet);
// ห้องทำงานแบบการ์ตูน (isometric): หัวหน้า + ลูกทีม + ผู้ตรวจ นั่งโต๊ะของตัวเอง · กำลังทำ = พิมพ์ + บับเบิลสถานะ · เสร็จ = ✓ · รอ = zzz
const AG_SKIN = ['#f2c9a0', '#e0ac7e', '#c68b5e', '#f5d3b5', '#d9a273', '#eabf94', '#b97d52'], AG_HAIR = ['#2b2b33', '#6b3e26', '#1d1d22', '#a0522d', '#3a2a1a', '#d4a24c', '#4a3020'], AG_SHIRT = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
function agStage(j) {
  const crew = [{ role: 'lead', title: 'หัวหน้าทีม', status: j.role === 'lead' ? (j.team?.length ? (j.status === 'reviewing' ? 'done' : 'idle') : 'running') : j.status, doing: j.role === 'lead' ? (j.team?.length ? '' : j.doing || 'กำลังวางแผน') : j.doing, model_id: j.model_id }, ...(j.team || [])].slice(0, 7);
  // จุดวางโต๊ะบนพื้นแบบ isometric (หัวหน้าอยู่หลังสุดตรงกลาง)
  const spots = [[180, 92], [96, 128], [264, 128], [138, 160], [222, 160], [60, 176], [300, 176]];
  const iso = (x, y, w, d, h, top, l, r) => `<path d="M${x} ${y - h}l${w} ${w / 2}l${-d} ${d / 2}l${-w} ${-w / 2}z" fill="${top}"/><path d="M${x - d} ${y - h + d / 2}l${w} ${w / 2}v${h}l${-w} ${-w / 2}z" fill="${l}"/><path d="M${x + w - d} ${y - h + w / 2 + d / 2}l${d} ${-d / 2}v${h}l${-d} ${d / 2}z" fill="${r}"/>`;
  const person = (k, i) => {
    const [x, y] = spots[i], on = ['running', 'queued', 'reviewing'].includes(k.status), done = ['done'].includes(k.status), sleep = !on && !done;
    return `<g class="ag-p ${on ? 'on' : done ? 'done' : 'zz'}" transform="translate(${x} ${y})" style="--d:${i * 0.17}s">
      <g transform="translate(0 -27)">
        <rect x="-6" y="8" width="12" height="13" rx="5" fill="${AG_SHIRT[i]}"/>
        <circle cx="0" cy="2" r="7.5" fill="${AG_SKIN[i]}"/><path d="M-7.6 1a7.6 7.6 0 0 1 15.2 0q-3-4-7.6-4t-7.6 4z" fill="${AG_HAIR[i]}"/>
        ${sleep ? '<path d="M-3.4 3h2M1.6 3h2" stroke="#333" stroke-width="1" stroke-linecap="round"/>' : '<circle cx="-2.4" cy="3" r=".9" fill="#222"/><circle cx="2.6" cy="3" r=".9" fill="#222"/>'}
        ${done ? '<path d="M-1.5 5.6q1.5 1.4 3 0" stroke="#222" stroke-width=".8" fill="none"/>' : ''}
        <g class="arm"><rect x="-10" y="13" width="8" height="3.2" rx="1.6" fill="${AG_SHIRT[i]}"/></g><g class="arm r"><rect x="2" y="13" width="8" height="3.2" rx="1.6" fill="${AG_SHIRT[i]}"/></g>
      </g>
      ${iso(-5, 4, 30, 20, 12, '#a0714a', '#7d5636', '#664429')}
      <g transform="translate(-24 -16)"><rect x="0" y="0" width="13" height="9" rx="1.5" fill="#1e293b"/><rect class="scr" x="1.5" y="1.4" width="10" height="6.2" rx="1" fill="${on ? '#60a5fa' : '#334155'}"/></g>
      ${done ? '<g transform="translate(13 -44)"><circle r="6" fill="#22c55e"/><path d="M-2.6 0l1.8 1.9 3.4-3.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>' : ''}
      ${sleep ? '<text class="zzz" x="8" y="-38" font-size="9" fill="#94a3b8">z z</text>' : ''}
    </g>`;
  };
  const bubbles = crew.map((k, i) => { const [x, y] = spots[i], on = ['running', 'queued', 'reviewing'].includes(k.status); const t = on ? (k.doing || (k.role === 'review' ? 'กำลังตรวจรวม' : 'กำลังทำงาน')) : k.status === 'done' ? 'เสร็จแล้ว' : k.status === 'waiting' ? 'รอคิว' : ''; return t ? `<span class="ag-b ${on ? 'on' : ''}" style="left:${x / 3.6}%;top:${(y - 44) / 2.3}%" title="${esc((k.title || '') + ' · ' + t)}">${esc(t.length > 34 ? t.slice(0, 33) + '…' : t)}</span>` : ''; }).join('');
  return `<div class="ag-stage" role="img" aria-label="ภาพทีม Agent กำลังทำงาน"><svg viewBox="0 0 360 230" aria-hidden="true">
      <path d="M180 40l170 85-170 85-170-85z" fill="#efe6d8"/><path d="M180 40l170 85-170 85-170-85z" fill="url(#agfl)" opacity=".35"/>
      <path d="M10 125V50L180 -35v75z" fill="#e4dccf"/><path d="M350 125V50L180 -35v75z" fill="#d8cfc1"/>
      <path d="M232 18l64 32v34l-64-32z" fill="#9cc3e6" opacity=".7"/><path d="M232 18l64 32M264 34v34" stroke="#fff" stroke-width="1.4"/>
      <g transform="translate(70 34)"><circle r="9" fill="#fff" stroke="#8b8478"/><path class="clk" d="M0 0v-6" stroke="#333" stroke-width="1.3" stroke-linecap="round"/><path d="M0 0h4" stroke="#333" stroke-width="1.3"/></g>
      <g transform="translate(118 30)"><path d="M0 0l26 13v16L0 16z" fill="#7c5a3d"/><path d="M3 4l6 3v9l-6-3zM11 8l5 2.5v9L11 17zM18 11.5l5 2.5v9l-5-2.5z" fill="#c084fc"/></g>
      <g transform="translate(330 150)"><path d="M-6 0h12l-2 12h-8z" fill="#c2410c"/><circle cx="0" cy="-6" r="8" fill="#16a34a"/><circle cx="-6" cy="-12" r="5" fill="#22c55e"/><circle cx="6" cy="-13" r="5" fill="#15803d"/></g>
      <defs><pattern id="agfl" width="24" height="12" patternUnits="userSpaceOnUse"><path d="M0 6l12-6 12 6-12 6z" fill="none" stroke="#bfae96" stroke-width=".6"/></pattern></defs>
      ${crew.map(person).join('')}
    </svg>${bubbles}</div>`;
}
// ลิมิตสัปดาห์ที่งานนี้ใช้ไปแล้ว (อัปเดตทุกครั้งที่ดึงสถานะ ระหว่าง Agent ยังทำอยู่)
const agUsed = j => j?.used_pct > 0 ? ` · ใช้ลิมิตสัปดาห์ไป <b class="ag-used">${j.used_pct < 0.1 ? '<0.1' : j.used_pct}%</b>` : '';
const teamRows = j => (j.team || []).map(k => `<div class="mem tm"><span><b>${AG_ROLE[k.role] || k.role}</b> ${esc(k.role === 'review' ? 'ตรวจรวมผลงาน' : k.title)}<br><small class="muted">${AG_LABEL[k.status] || k.status}${k.rounds ? ' · ' + k.rounds + ' รอบ' : ''}${k.used_pct > 0 ? ` · ${k.used_pct < 0.1 ? '<0.1' : k.used_pct}%` : ''} · ${esc(mName(k.model_id))}${k.scope ? ' · ' + esc(JSON.parse(k.scope).join(', ')) : ''}</small>${k.doing && ['running', 'queued'].includes(k.status) ? `<br><small class="ag-doing">${esc(k.doing)}</small>` : ''}</span>${['queued', 'running'].includes(k.status) ? `<button type="button" class="btn out sm" data-agstop="${k.id}">หยุด</button>` : ''}</div>`).join('');
async function bgAgentSheet() {
  if (!me.plan.paid) return toast('Agent เบื้องหลังใช้ได้กับแพลนที่ชำระเงิน', 'bad');
  let timer = 0;
  const draw = async d => {
    const jobs = await api('/agent?project=' + IDE.pid).catch(() => []), busy = jobs.find(agBusy), box = d.querySelector('.sheet-b'); if (!box) return clearInterval(timer);
    if (busy?.status === 'plan' && box.querySelector(`#agplan[data-id="${busy.id}"]`)) return; // กำลังแก้แผน: ไม่วาดทับ
    if (!busy && box.querySelector('#agp')) return; // ฟอร์มสั่งงานเปิดอยู่: ไม่วาดทับทุก 5 วิ (ข้อความ/สวิตช์ที่เลือกจะหาย)
    const m = $('#cmodel')?.value;
    box.innerHTML = `<div class="sheet-form">
      ${busy?.status === 'plan' ? planForm(busy) : busy ? `<p class="sheet-msg"><b>${AG_LABEL[busy.status]}</b>${busy.role === 'lead' ? (busy.team?.length ? ` · ทีม ${busy.team.filter(k => k.role === 'worker').length} ตัว` : ' · หัวหน้ากำลังแบ่งงาน') : ` · รอบที่ ${busy.rounds}/20`}${agUsed(busy)}<br><small class="muted">${esc(busy.prompt.slice(0, 120))}</small></p>${agStage(busy)}${busy.role !== 'lead' && busy.doing ? `<p class="ag-doing">${ic('sparkles', 'sm')} ${esc(busy.doing)}</p>` : ''}${teamRows(busy)}<button type="button" class="btn red sm" id="agx">${busy.role === 'lead' ? 'หยุดทั้งทีม' : 'หยุดงานนี้'}</button>`
        : `<textarea id="agp" rows="4" maxlength="4000" placeholder="อธิบายงานให้ละเอียด เช่น ทำหน้า Contact พร้อมฟอร์ม ใส่ลิงก์ในเมนู และปรับสไตล์ให้เข้ากับหน้าแรก"></textarea>
           <label class="sw-row"><span class="sw"><input type="checkbox" id="agteam"><span></span></span> ทีม Agent: หัวหน้าแบ่งงาน ลูกทีมทำพร้อมกันสูงสุด 5 ตัว แล้วตรวจรวม เหมาะกับงานใหญ่หลายไฟล์</label>
           <div id="agms" class="form2" hidden><div><label>โมเดลหัวหน้า (วางแผน + ตรวจรวม)</label><select id="aglead">${agModels().map(x => `<option value="${x.id}" ${x.id === +m ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><div><label>โมเดลลูกทีม</label><select id="agwork"><option value="">อัตโนมัติ (ถูกและเร็ว เช่น DeepSeek 4.1 Flash)</option>${agModels().map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><label class="sw-row" id="agcfw"><span class="sw"><input type="checkbox" id="agconfirm" checked><span></span></span> ให้ฉันตรวจแผนก่อนเริ่ม (ปิดถ้าจะสั่งแล้วปิดแอปเลย)</label>${pushOK() && Notification.permission !== 'denied' ? '<label class="sw-row"><span class="sw"><input type="checkbox" id="agpush" checked><span></span></span> แจ้งเตือนเข้ามือถือเมื่อเสร็จ</label>' : ''}<p class="muted" id="agest" style="margin:0;font-size:13px"></p><button type="button" class="btn blue" id="agg">เริ่มให้ Agent ทำ</button><p class="muted" style="margin:0;font-size:12.5px">ใช้โมเดลและระดับการคิดที่เลือกอยู่ · ใช้ลิมิตแพลนตามจริง · แก้ไขย้อนกลับได้จาก "ประวัติโปรเจกต์"</p>`}
      ${jobs.filter(j => !agBusy(j)).slice(0, 4).map(j => `<div class="mem tm" style="display:block"><b>${AG_LABEL[j.status] || j.status}</b> · ${j.rounds} รอบ${agUsed(j)} · ${when(j.created_at)}<br><small class="muted">${esc(j.prompt.slice(0, 100))}</small>${j.summary ? `<br><small>${esc(j.summary.slice(0, 220))}</small>` : ''}${j.chat_id ? ` <a href="/chat?id=${j.chat_id}">ดูรายละเอียด</a>` : ''}${['stopped', 'limit', 'timeout', 'failed'].includes(j.status) && !busy && j.role !== 'research' ? ` <button type="button" class="btn out sm" data-agres="${j.id}">ทำต่อจากที่หยุด</button>` : ''}</div>`).join('')}
    </div>`;
    box.querySelector('#agg')?.addEventListener('click', async e => {
      const prompt = box.querySelector('#agp').value.trim(); if (prompt.length < 10) return toast('อธิบายงานให้ละเอียดขึ้นอีกหน่อย', 'bad');
      e.target.disabled = true; if (box.querySelector('#agpush')?.checked) pushState().then(on => on || enablePush()).catch(x => toast(x.message, 'bad')); await saveNow();
      const team = box.querySelector('#agteam')?.checked;
      try { await api('/agent', { method: 'POST', body: { project_id: IDE.pid, model_id: team ? +box.querySelector('#aglead').value : +m, worker_model_id: team ? +box.querySelector('#agwork').value || null : null, effort: $('#ceffort')?.value || '', prompt, team: box.querySelector('#agteam')?.checked, confirm: box.querySelector('#agconfirm')?.checked } }); toast('ส่งงานให้ Agent แล้ว ปิดแอปได้เลย จะอีเมลเมื่อเสร็จ', 'ok'); agWatch(); draw(d); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
    });
    const est = async () => { const el = box.querySelector('#agest'); if (!el) return; const team = box.querySelector('#agteam').checked; const r = await api('/agent/estimate', { method: 'POST', body: { project_id: IDE.pid, team, model_id: team ? +box.querySelector('#aglead').value : +m, worker_model_id: team ? +box.querySelector('#agwork').value || null : null } }).catch(() => null); el.textContent = r?.ok ? `ประเมินคร่าวๆ: ใช้ประมาณ ${r.low}–${r.high}% ของลิมิตสัปดาห์ (ขึ้นกับความยากของงาน)` : ''; };
    const tg = box.querySelector('#agteam'); if (tg) { tg.onchange = () => { box.querySelector('#agms').hidden = !tg.checked; est(); }; box.querySelector('#aglead').onchange = box.querySelector('#agwork').onchange = est; est(); } // เปิดทีม = เลือกโมเดลหัวหน้า/ลูกทีมได้
    box.querySelectorAll('[data-agres]').forEach(b => b.onclick = async () => { b.disabled = true; try { await saveNow(); await api(`/agent/${b.dataset.agres}/resume`, { method: 'POST' }); toast('สั่งทำต่อแล้ว ปิดแอปได้', 'ok'); agWatch(); draw(d); } catch (x) { toast(x.message, 'bad'); b.disabled = false; } });
    box.querySelector('#agx')?.addEventListener('click', async () => { await api(`/agent/${busy.id}/stop`, { method: 'POST' }).catch(() => {}); draw(d); });
    box.querySelector('#agstart')?.addEventListener('click', async e => {
      const tasks = [...box.querySelectorAll('#agplan [data-k]')].filter(r => r.querySelector('[data-keep]').checked).map(r => ({ id: +r.dataset.k, title: r.querySelector('[data-title]').value, prompt: r.querySelector('[data-prompt]').value, files: r.querySelector('[data-files]').value }));
      e.target.disabled = true; try { const r = await api(`/agent/${busy.id}/start`, { method: 'POST', body: { tasks } }); toast(`เริ่มทีม ${r.tasks} งานแล้ว ปิดแอปได้`, 'ok'); box.innerHTML = ''; agWatch(); draw(d); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
    });
    box.querySelectorAll('[data-agstop]').forEach(b => b.onclick = async () => { await api(`/agent/${b.dataset.agstop}/stop`, { method: 'POST' }).catch(() => {}); draw(d); });
  };
  sheet('Agent บนเซิร์ฟเวอร์', '<p class="muted">กำลังโหลด...</p>', d => { draw(d); timer = setInterval(() => draw(d), 5000); new MutationObserver((_, o) => { if (!document.contains(d)) { clearInterval(timer); o.disconnect(); } }).observe(document.body, { childList: true }); });
}
// Agent บนคลาวด์: สั่งงาน → เครื่องเสมือนทำเอง (แก้ไฟล์ + รันคำสั่ง) → ดูความคืบหน้าสด → เสร็จแล้วโหลดไฟล์ใหม่
const CL_LABEL = { running: 'กำลังทำ', done: 'เสร็จ', partial: 'เสร็จบางส่วน', failed: 'ไม่สำเร็จ' };
const clLine = e => e.type === 'tool' ? `⚙ ${esc(e.name)} ${esc(e.args?.command || e.args?.path || e.args?.pattern || e.args?.url || '')}` : e.type === 'tool_result' ? `<span class="${e.ok ? 'muted' : 'bad'}">  ${esc(String(e.preview || '').split('\n').slice(0, 3).join(' ⏎ ').slice(0, 240))}</span>` : e.type === 'text' ? esc(e.text) : e.type === 'info' ? `<span class="muted">${esc(e.text)}</span>` : '';
// ข้อความของงานคลาวด์ในแชต: Thinking + ขั้นตอน (เปิดดูผลคำสั่งได้) + คำตอบ + ไฟล์ที่เปลี่ยน · สร้างใหม่จาก events ทุกครั้งที่ดึง
function cloudApply(m, j) {
  const steps = new Map(); let th = '', txt = [], todos = null;
  for (const e of j.events || []) {
    if (e.type === 'think') th += e.text;
    else if (e.type === 'text') txt.push(e.text);
    else if (e.type === 'todos') todos = e.todos;
    else if (e.type === 'tool') steps.set(e.id, { name: e.name, args: e.args || {}, st: 'run' });
    else if (e.type === 'tool_result' && steps.has(e.id)) Object.assign(steps.get(e.id), { st: e.ok ? 'ok' : 'bad', out: e.preview });
    else if (e.type === 'info') steps.set('i' + steps.size, { name: 'info', text: e.text });
  }
  Object.assign(m, { thinking: th, content: txt.join('\n\n') || j.final || '', steps: [...steps.values()], todos, status: j.status, error: j.error, changed: j.changed || [], streaming: j.status === 'running', model: j.model || m.model });
}
function cloudMsgHTML(m) {
  const arg = a => a.command || a.path || a.pattern || a.url || a.query || '';
  const st = s => s.st === 'run' ? '<span class="agsp" aria-label="กำลังทำ"></span>' : s.st === 'bad' ? '<b class="bad">✕</b>' : '<b class="ok">✓</b>';
  const steps = (m.steps || []).map(s => s.name === 'info' ? `<div class="agstep muted">${esc(s.text)}</div>` : `<details class="agstep"><summary>${st(s)} <b>${esc(s.name)}</b> <code>${esc(String(arg(s.args)).slice(0, 140))}</code></summary>${s.out ? `<pre>${esc(s.out)}</pre>` : ''}</details>`).join('');
  const todos = m.todos?.length ? `<div class="agtodo">${m.todos.map(t => `<div class="${t.status}">${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${esc(t.content)}</div>`).join('')}</div>` : '';
  const n = (m.steps || []).filter(s => s.name !== 'info').length;
  return `<div class="msg ai">${thinkHTML(m)}<div class="agent">${todos}${steps ? `<details class="agsteps" ${m.streaming ? 'open' : ''}><summary>${ic('terminal', 'sm')} Agent บนคลาวด์ ${n} ขั้นตอน</summary>${steps}</details>` : m.streaming ? `<div class="agstep muted"><span class="agsp"></span> กำลังเปิดเครื่องบนคลาวด์ (ครั้งแรก ~20 วินาที)…</div>` : ''}</div>
    <div class="b">${m.content ? md(m.content) : ''}</div>${m.error ? `<p class="bad" style="margin:6px 0">${esc(m.error)}</p>` : ''}
    ${m.streaming ? '' : `<div class="acts"><span class="muted">${esc(m.model || '')} · คลาวด์${m.changed?.length ? ` · แก้ ${m.changed.length} ไฟล์: ${m.changed.slice(0, 6).map(esc).join(', ')} (ย้อนได้ที่ ประวัติโปรเจกต์)` : ''}</span></div>`}</div>`;
}
async function cloudSend(job) {
  const t = $('#ct'), text = job ? job.prompt : t.value.trim(); if (!text) return;
  const ai = { role: 'assistant', cloud: true, content: '', streaming: true, steps: [] };
  try {
    if (!job) { await saveNow(); job = await api('/cloud-agent', { method: 'POST', body: { project_id: IDE.pid, prompt: text, model_id: +$('#cmodel')?.value || 0, effort: $('#ceffort')?.value || null } }); t.value = ''; }
  } catch (x) { return toast(x.message, 'bad'); }
  IDE.msgs.push({ role: 'user', content: text }, ai); IDE.busy = true; IDE.cloudJob = job.id; $('#cgo').innerHTML = ic('stop'); $('#cgo').classList.add('stop'); drawAI();
  let fails = 0;
  for (;;) {
    const j = await api('/cloud-agent/' + job.id).catch(() => null);
    if (j) { fails = 0; cloudApply(ai, j); const b = $('#cmsgs'), stick = b && nearBottom(b), last = b?.lastElementChild; if (last && IDE.msgs.at(-1) === ai) { last.outerHTML = cloudMsgHTML(ai); renderRich(b); if (stick) b.scrollTop = b.scrollHeight; } if (j.status !== 'running') break; }
    else if (++fails > 20) { ai.streaming = false; ai.error = 'ติดต่อเซิร์ฟเวอร์ไม่ได้ · งานยังทำต่อบนคลาวด์ ดูได้ที่ ประวัติงานบนคลาวด์'; break; }
    await new Promise(ok => setTimeout(ok, 2500));
  }
  IDE.busy = false; IDE.cloudJob = null; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI();
  if (ai.changed?.length && !IDE.busy) reloadFiles().catch(() => {});
}
function cloudSheet() {
  let timer = 0, view = 0, was = '';
  const draw = async d => {
    if (!document.contains(d)) return clearInterval(timer);
    const box = d.querySelector('#clb');
    if (view) {
      const j = await api('/cloud-agent/' + view).catch(x => ({ error: x.message })); if (j.error) { box.innerHTML = `<p class="bad">${esc(j.error)}</p>`; return; }
      const log = j.events.map(clLine).filter(Boolean).join('\n');
      box.innerHTML = `<button type="button" class="btn out sm" id="clback">← รายการงาน</button> <b>${CL_LABEL[j.status] || j.status}</b> · ${esc(j.model || '')}${j.status === 'running' ? ' <button type="button" class="btn out sm" id="clstop">หยุด</button>' : ''}
        <p class="muted" style="margin:8px 0">${esc(j.prompt)}</p><pre class="cl-log" style="max-height:44vh;overflow:auto;white-space:pre-wrap;font-size:12px">${log || 'กำลังเปิดเครื่อง (ครั้งแรกอาจ ~20 วินาที)…'}</pre>
        ${j.final ? `<div class="sheet-msg">${esc(j.final)}</div>` : ''}${j.error ? `<p class="bad">${esc(j.error)}</p>` : ''}${j.changed?.length ? `<p class="muted">ไฟล์ที่เปลี่ยน: ${j.changed.map(esc).join(', ')} · ย้อนได้ที่ ประวัติโปรเจกต์</p>` : ''}`;
      const pre = box.querySelector('.cl-log'); pre.scrollTop = pre.scrollHeight;
      box.querySelector('#clback').onclick = () => { view = 0; draw(d); };
      box.querySelector('#clstop')?.addEventListener('click', async () => { await api(`/cloud-agent/${view}/stop`, { method: 'POST' }).catch(() => {}); toast('สั่งหยุดแล้ว ไฟล์ที่ทำถึงตรงนั้นจะเข้าโปรเจกต์'); });
      if (was === 'running' && j.status !== 'running') { toast(`Agent บนคลาวด์${CL_LABEL[j.status]}: ${j.changed.length} ไฟล์`, j.status === 'done' ? 'ok' : 'bad'); if (j.changed.length && !IDE.busy) reloadFiles().catch(() => {}); }
      was = j.status; return;
    }
    if (box.querySelector('#clf textarea')?.value || d.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // กำลังพิมพ์งาน: ไม่วาดทับ
    const jobs = await api('/cloud-agent?project=' + IDE.pid).catch(() => []), busy = jobs.find(j => j.status === 'running');
    box.innerHTML = (busy ? '' : `<form class="sheet-form" id="clf"><textarea name="prompt" rows="4" maxlength="20000" required placeholder="เช่น เพิ่มหน้า login แล้วรัน npm test ให้ผ่าน"></textarea><button class="btn blue">${ic('sparkles', 'sm')} เริ่มงานบนคลาวด์</button><p class="muted" style="margin:0">ทำเองทั้งหมดในเครื่องแยก (ลบทิ้งหลังจบ) สูงสุด 30 นาที · ค่าโมเดลหักตามจริง · ไฟล์ .env ไม่ถูกส่ง</p></form>`)
      + (jobs.length ? jobs.map(j => optHTML(j.id, `${CL_LABEL[j.status] || j.status} · ${esc(j.prompt.slice(0, 60))}`, esc(j.model || '') + (j.error ? ' · ' + esc(j.error.slice(0, 80)) : ''))).join('') : '<p class="muted">ยังไม่มีงาน</p>');
    box.querySelector('#clf')?.addEventListener('submit', async e => {
      e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
      try { await saveNow(); const r = await api('/cloud-agent', { method: 'POST', body: { project_id: IDE.pid, prompt: e.target.prompt.value, model_id: +$('#cmodel')?.value || 0 } }); view = r.id; was = 'running'; draw(d); } catch (x) { toast(x.message, 'bad'); b.disabled = false; }
    });
    box.querySelectorAll('.opt[data-v]').forEach(o => o.onclick = () => { view = +o.dataset.v; was = ''; draw(d); });
  };
  sheet('Agent บนคลาวด์', '<div id="clb"><p class="muted">กำลังโหลด...</p></div>', d => { draw(d); timer = setInterval(() => draw(d), 4000); });
}
// ดูสถานะงาน Agent ตลอดที่เปิดหน้า Code: ขึ้นป้าย + พอเสร็จโหลดไฟล์ใหม่ให้อัตโนมัติ
let agPoll = 0;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && IDE.pid) agWatch().catch(() => {}); }); // กลับมาที่แอป: เช็กงาน Agent ใหม่ทันที
// เตือนครั้งเดียวต่อระดับ: ลิมิตเกิน 80% หรือเงินใน Wallet (ผู้ใช้ไม่มีแพลน) ต่ำกว่า ฿10
function lowWarn(u) {
  const p = Math.max(u.pct4h || 0, u.pctWeek || 0), k = p >= 100 ? 'full' : p >= 80 ? 'hi' : !me.plan?.paid && me.balance > 0 && me.balance < 10 ? 'wal' : '';
  if (!k || IDE.warned === k) return; IDE.warned = k;
  toast(k === 'wal' ? `เงินใน Wallet เหลือ ฿${(+me.balance).toFixed(2)} · เติมได้ที่เมนู เติมเงิน` : k === 'full' ? 'ลิมิตเต็มแล้ว · เติม Wallet เพื่อใช้ต่อ หรืออัปเกรดแพลน' : `ใช้ลิมิตไปแล้ว ${Math.round(p)}%`, k === 'hi' ? '' : 'bad');
}
async function agWatch() {
  clearInterval(agPoll);
  const tick = async () => {
    const jobs = await api('/agent?project=' + IDE.pid).catch(() => null); if (!jobs) return; // เน็ตหลุด (เช่นปิดจอ) ≠ งานจบ: คงสถานะเดิมไว้ ลองใหม่รอบหน้า
    const busy = jobs.find(agBusy), prev = IDE.bgJob;
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
  const lbl = s => s.startsWith('cp:') ? 'จุดบันทึก: ' + s.slice(3) : label[s] || s;
  sheet('ประวัติโปรเจกต์', `<button type="button" class="btn blue sm" id="cpnew" style="margin:0 0 10px">${ic('star', 'sm')} บันทึกจุดนี้ (ตั้งชื่อ)</button>` + (pts.length ? `<p class="muted" style="margin:0 0 10px">เลือกจุดเวลา แล้วไฟล์ที่เปลี่ยนหลังจุดนั้นจะย้อนกลับ (ไฟล์ใหม่ที่เพิ่งสร้างจะยังอยู่ · ย้อนกลับของการย้อนได้จากรายการนี้)</p>${pts.map(x => optHTML(x.ts, (x.source.startsWith('cp:') ? '★ ' : '') + when(x.ts), `${esc(lbl(x.source))} · ${x.files} ไฟล์`)).join('')}` : '<p class="muted">ยังไม่มีประวัติ</p>'), (d, close) => {
    d.querySelector('#cpnew').onclick = async () => { const name = await promptSheet('ชื่อจุดบันทึก เช่น "หน้าแรกเสร็จ"', '', { title: 'บันทึกจุดนี้', ok: 'Save' }); if (!name?.trim()) return; try { await saveNow(); await api(`/projects/${IDE.pid}/checkpoint`, { method: 'POST', body: { name } }); close(); toast('บันทึกจุดแล้ว ย้อนกลับมาได้จากประวัติโปรเจกต์', 'ok'); } catch (x) { toast(x.message, 'bad'); } };
    d.querySelectorAll('.opt[data-v]').forEach(b => b.onclick = async () => {
      if (!await confirmSheet('ย้อนไฟล์ในโปรเจกต์ไปสถานะก่อนเวลานี้?', { title: 'ย้อนโปรเจกต์', ok: 'Undo' })) return;
      try { await saveNow(); const r = await api(`/projects/${IDE.pid}/restore`, { method: 'POST', body: { ts: +b.dataset.v } }); close(); await reloadFiles(); toast(`ย้อนแล้ว ${r.restored} ไฟล์`, 'ok'); } catch (x) { toast(x.message, 'bad'); }
    });
  });
}
// เมตร context บนหัวแท็บ AI: นับตั้งแต่ก่อนส่งข้อความแรก (คำสั่งระบบ + ไฟล์โปรเจกต์) อัปเดตเมื่อเปลี่ยนโมเดล/แชต/ตอบเสร็จ
let ctxT = 0;
function ctxMeter() {
  clearTimeout(ctxT); ctxT = setTimeout(async () => {
    const b = $('#cctx'); if (!b || window.DEMO) return;
    const q = new URLSearchParams({ project_id: IDE.pid, model_id: $('#cmodel')?.value || '' }); if (IDE.chatId) q.set('chat_id', IDE.chatId); if (IDE.skills?.length) q.set('skills', IDE.skills.join(','));
    const r = await api('/context?' + q).catch(() => null); if (!r) return;
    const k = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    const pct = Number.isFinite(r.pct) ? r.pct : r.max ? r.used / r.max * 100 : 0;
    b.hidden = false; b.className = 'ctxm ' + (pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''); b.textContent = `ctx ${k(r.used)}/${k(r.max)} · ${Math.round(pct)}%`;
  }, 400);
}
function codeTools() {
  sheet('เครื่องมือ AI', optHTML('check', ic('camera') + 'ให้ AI ดูผลลัพธ์ตอนนี้', 'รันโปรเจกต์ จับภาพหน้าจอ แล้วส่งให้ AI ตรวจ')
    + optHTML('skl', ic('sparkles') + 'Skills', 'เปิด/ปิด Skill เฉพาะในโหมด Code (สูงสุด 3)')
    + (optHTML('bgagent', ic('server') + 'Sub-agent · ทีม Agent ทำงานแทน' + newPill('team'), me.plan.paid ? 'สั่งแล้วปิดแอปได้ Agent แก้ไฟล์และสร้างรูปให้เองสูงสุด 20 รอบ เสร็จแล้วส่งอีเมล · ไม่รันโค้ด ตรวจผลเองตอนจบ' : 'ใช้ได้กับแพลนที่ชำระเงิน')) // Sub-agent: ทีม Agent บนเซิร์ฟเวอร์ (หัวหน้า + ลูกทีม) เปิดให้ทุกคน (แพลนจ่ายเงินใช้ได้)
    + (me.role === 'admin' ? optHTML('cloud', ic('terminal') + 'Agent บนคลาวด์ (รันโค้ดได้): ' + (IDE.cloud ? 'เปิด' : 'ปิด'), 'เปิดแล้วพิมพ์สั่งในแชตได้เลย: Agent แก้ไฟล์ รัน npm/python/git ทดสอบเองในเครื่องแยก ปิดแอปได้ · Pro ขึ้นไป / แพ็ก Agent / Wallet', IDE.cloud) : '') // ใช้แค่แอดมิน: ซ่อนจากลูกค้าให้เมนูสั้นลง
    + (me.role === 'admin' ? optHTML('cloudlog', ic('undo') + 'ประวัติงานบนคลาวด์', 'ดูงานเก่า / log เต็ม') : '') // ใช้แค่แอดมิน: ซ่อนจากลูกค้าให้เมนูสั้นลง
    + optHTML('agent', ic('sparkles') + 'โหมด Agent (งานยาว)', me.plan.paid ? 'AI ทำงานต่อเนื่องได้ถึง 20 รอบต่อคำสั่ง ปิดจอได้ กลับมาดูผล · ใช้ลิมิตมากกว่าปกติ' : 'ใช้ได้กับแพลนที่ชำระเงิน', IDE.agent)
    + optHTML('mcp', ic('server') + 'Remote MCP', 'เชื่อมต่อ GitHub หรือ Remote MCP (สูงสุด 3)')
    + optHTML('rules', ic('filetext') + 'กฎประจำโปรเจกต์', IDE.instructions ? 'ตั้งค่าไว้แล้ว · แตะเพื่อแก้ไข' : 'กำหนด Stack หรือข้อกำหนดให้ AI ทำตามทุกแชต')
    + optHTML('audit', ic('activity') + 'ตรวจหน้าเว็บ (ความเร็ว / SEO / การเข้าถึง)', 'ให้คะแนนพร้อมรายการที่ควรแก้ แล้วส่งให้ AI แก้ได้ในคลิกเดียว')
    + optHTML('hist', ic('undo') + 'ประวัติโปรเจกต์ / ย้อนทั้งโปรเจกต์', 'ย้อนไฟล์ทั้งหมดไปสถานะก่อนช่วงเวลาที่เลือก')
    + optHTML('exphtml', ic('download') + 'ส่งออก HTML ไฟล์เดียว', 'รวม HTML/CSS/JS เป็นไฟล์เดียวพร้อมเปิดใช้งาน')
    + optHTML('term', ic('terminal') + 'เปิดเทอร์มินัล', IDE.local ? 'รันคำสั่งใน terminal ของเครื่องนี้ (ถามก่อนทุกครั้ง)' : 'พิมพ์คำสั่ง npm / node เอง')
    + (DESK ? optHTML('local', ic('folder') + (IDE.local ? 'โฟลเดอร์ในเครื่อง: ' + esc(IDE.local.name) : 'เชื่อมกับโฟลเดอร์ในเครื่อง'), 'AI แก้ไฟล์จริงในเครื่อง · RUN รันใน terminal ของเครื่อง · แก้ด้วยโปรแกรมอื่นก็ซิงก์ขึ้นมา', !!IDE.local) : ''),
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); const v = b.dataset.v;
      if (v === 'autoapply' || v === 'auto') { setOpt(v, !(v === 'auto' ? IDE.autoMode : IDE.autoApply)); cUI(); }
      if (v === 'bgagent') { seen('team'); return bgAgentSheet(); }
      if (v === 'cloud') { IDE.cloud = !IDE.cloud; localStorage.setItem('ccloud', IDE.cloud ? '1' : '0'); cUI(); return toast(IDE.cloud ? 'Agent บนคลาวด์: พิมพ์งานในแชตแล้วส่งได้เลย' : 'ปิด Agent บนคลาวด์', 'ok'); }
      if (v === 'cloudlog') return cloudSheet();
      if (v === 'agent') { if (!me.plan.paid) return toast('โหมด Agent ใช้ได้กับแพลนที่ชำระเงิน', 'bad'); IDE.agent = !IDE.agent; localStorage.setItem('agent', IDE.agent ? '1' : '0'); cUI(); toast(IDE.agent ? 'เปิดโหมด Agent: งานยาวได้ถึง 20 รอบ' : 'ปิดโหมด Agent', 'ok'); if (IDE.agent && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }
      if (v === 'check') { IDE.round = 0; check().catch(x => $('#ce').textContent = x.message); }
      if (v === 'mcp') mcpSheet(IDE.mcps, ids => { IDE.mcps = ids; localStorage.setItem('cmcps', JSON.stringify(ids)); cUI(); });
      if (v === 'skl') skillsSheet(IDE.skills, ids => { IDE.skills = ids; localStorage.setItem('cskills', JSON.stringify(ids)); cUI(); });
      if (v === 'hist') projectHistory().catch(x => $('#ce').textContent = x.message);
      if (v === 'audit') auditSheet();
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
      if (v === 'exphtml') { const hp = has('index.html') ? 'index.html' : (/\.html?$/i.test(IDE.active || '') ? IDE.active : null); const jp = !hp && /\.m?js$/i.test(IDE.active || '') ? IDE.active : null; if (!hp && !jp) return toast('ต้องมี index.html หรือไฟล์ .html/.js', 'bad'); const out = buildHtml(hp, jp, true); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/html;charset=utf-8' })); a.download = (IDE.name || 'kyber').replace(/[^\wก-๙-]+/g, '_') + '.html'; a.click(); toast('ส่งออกไฟล์ HTML แล้ว', 'ok'); }
      if (v === 'local') return linkLocal().catch(x => toast(x.message, 'bad'));
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
    if (rep.trim() && rep.includes(search.trim()) && out.includes(rep.trim())) continue; // แบบแทรกเพิ่ม (REPLACE มี SEARCH อยู่ในตัว) ที่ใช้ไปแล้ว: ไม่งั้นจะแทรกซ้ำทุกครั้งที่คำนวณใหม่
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
// สถานะ "ใช้แล้ว" ของการแก้ไขในข้อความ AI: เก็บถาวรในฐานข้อมูล (messages.applied = path ที่ใช้แล้ว) ไม่ใช่แค่ในหน่วยความจำ
// รีเฟรชแล้วการ์ดยังขึ้น "ใช้แล้ว ✓" แม้ไฟล์ถูกแก้ต่อในข้อความหลัง (SEARCH เดิมหาไม่เจอแล้ว) และไม่ชวนให้ Apply ของเก่าทับของใหม่
function appliedSet(m) { let a = m.applied; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } m.applied = a; } return new Set(Array.isArray(a) ? a : []); }
function saveApplied(m) { if (m?.id) api(`/messages/${m.id}/applied`, { method: 'POST', body: { paths: m.applied?.length ? m.applied : null } }).catch(() => {}); }
function markApplied(m, path) { if (!m) return; const s = appliedSet(m); if (s.has(path)) return; s.add(path); m.applied = [...s]; saveApplied(m); }
function changeCards(m, i) {
  const ch = changesOf(m.content, undefined, activeRef()); if (!ch.length) return '';
  const done = appliedSet(m);
  return `<div class="changes">${ch.map((c, k) => {
    if (done.has(c.path) && (c.error || (has(c.path) ? content(c.path) : null) !== c.content)) return `<div class="chg"><span class="cpath" data-openf="${esc(c.path)}" role="button" tabindex="0" title="เปิดไฟล์">${icon(c.path)} ${esc(c.path)}</span><span class="muted">ใช้แล้ว ✓</span></div>`; // ใช้แล้ว แต่ไฟล์ถูกแก้ต่อภายหลัง
    if (c.error) return `<div class="chg"><span class="cpath">${icon(c.path)} ${esc(c.path)}</span><span class="bad" title="${esc(c.error)}">แก้ไม่ได้</span><span class="muted" style="font-size:12px">${esc(c.error.slice(0, 90))}</span></div>`;
    const cur = has(c.path) ? content(c.path) : null;
    const same = c.del ? cur == null : cur === c.content;
    const pv = same ? m._prev?.find(x => x.path === c.path) : null; // ใช้แล้ว: นับบรรทัดที่เปลี่ยนจากก่อนแก้
    const d = !c.del && cur != null && !same ? lineDiff(cur, c.content) : pv?.existed && !c.del ? lineDiff(pv.prev, cur) : null;
    const tag = c.del ? '<span class="bad">ลบ</span>' : cur == null || (pv && !pv.existed) ? '<span class="ok">ไฟล์ใหม่</span>' : d ? `<span class="ok">+${d.add}</span> <span class="bad">−${d.del}</span>` : '';
    return `<div class="chg"><span class="cpath" data-openf="${esc(c.path)}" role="button" tabindex="0" title="เปิดไฟล์">${icon(c.path)} ${esc(c.path)}</span>${tag}
      ${same ? '<span class="muted">ใช้แล้ว ✓</span>' : `${c.del ? '' : `<button data-diff="${i}:${k}">View diff</button>`}<button class="ap" data-apply="${i}:${k}">${c.del ? 'Delete file' : c.guess ? 'Apply to this file' : 'Apply'}</button>`}</div>`;
  }).join('')}<div class="row" style="padding:2px 6px">${ch.filter(c => needsApply(c) && !done.has(c.path)).length > 1 ? `<button class="btn blue sm" data-applyall="${i}">Apply all</button>` : ''}${m._prev?.length ? `<button class="btn out sm" data-revert="${i}">${ic('undo', 'sm')} Undo this batch</button>` : ''}</div></div>`;
}
const activeRef = () => IDE.active && has(IDE.active) && !isImg(IDE.active) ? { path: IDE.active } : null;
const needsApply = c => !c.error && !c.guess && (c.del ? has(c.path) : !has(c.path) || content(c.path) !== c.content);
// ใช้การแก้ไขทั้งหมดของข้อความนี้ · คืนรายการที่ใช้ไม่ได้ (SEARCH ไม่ตรง / ไฟล์ไม่ผ่านการตรวจ) เพื่อส่งกลับให้ AI แก้เอง
// แก้ไม่ได้เพราะ SEARCH ไม่ตรง: แนบบรรทัดที่ใกล้ที่สุดในไฟล์ปัจจุบัน (พร้อมเลขบรรทัด) ไปกับข้อความให้ AI แก้ในรอบเดียว ไม่ต้องอ่านทั้งไฟล์ใหม่
function nearHint(c, msg) {
  if (!has(c.path) || !/SEARCH/.test(c.error || '')) return '';
  const body = [...String(msg?.content || '').matchAll(/```[^\n`]*\bpath=([^\s`]+)[^\n]*\n([\s\S]*?)```/g)].find(m => m[1] === c.path)?.[2] || '';
  const key = (body.match(/^<{5,9} SEARCH[ \t]*\n([\s\S]*?)\n={5,9}/m)?.[1] || '').split('\n').map(l => l.trim()).filter(l => l.length >= 6).sort((a, b) => b.length - a.length)[0];
  if (!key) return '';
  const L = content(c.path).split('\n'), words = new Set(key.toLowerCase().match(/[\w$]+/g) || []); let best = -1, score = 1;
  L.forEach((l, i) => { const t = l.trim(); let s = t.includes(key) ? 1e5 : 0; if (!s) for (const w of t.toLowerCase().match(/[\w$]+/g) || []) if (words.has(w)) s++; if (s > score) { score = s; best = i; } });
  if (best < 0) return '';
  const from = Math.max(0, best - 5), to = Math.min(L.length, best + 6);
  return `\n  บรรทัดที่ใกล้ที่สุดในไฟล์ตอนนี้ (คัดลอก SEARCH จากตรงนี้ให้ตรงทุกตัวอักษร):\n${L.slice(from, to).map((l, i) => `  ${from + i + 1}| ${l}`).join('\n')}`;
}
async function applyChanges(ch, msg) {
  const bad = [];
  for (const c of ch) {
    if (msg && appliedSet(msg).has(c.path)) continue; // ใช้ไปแล้ว (จำไว้ในฐานข้อมูล): ไม่ทำซ้ำ ไม่แจ้งว่าแก้ไม่ได้
    if (c.error) { bad.push(`${c.path}: ${c.error}${nearHint(c, msg)}`); continue; }
    if (!needsApply(c)) { if (msg) markApplied(msg, c.path); continue; }
    try { await apply(c, msg, false); } catch (x) { if (x.problem) bad.push(`${c.path}: ${x.message}`); else throw x; }
  }
  if (bad.length) { msg.rejected = bad; $('#ce').textContent = 'มีไฟล์ที่ยังไม่ถูกใช้: ' + bad.length + ' ไฟล์'; drawAI(); }
  return bad;
}
// ส่งปัญหากลับให้ AI (ไม่เกิน 3 รอบ) · AI ต้อง READ ไฟล์ก่อนแก้ซ้ำ
async function feedBack(bad) {
  if (!bad.length || (IDE.round ?? 0) >= 3) return;
  IDE.round = (IDE.round ?? 0) + 1;
  await codeSend({ text: `การแก้ไขบางไฟล์ยังไม่ถูกใช้ ไม่มีอะไรถูกเขียนทับในไฟล์เหล่านี้:\n${bad.map(x => '- ' + x).join('\n')}\n\nถ้ามีบรรทัดที่ใกล้ที่สุดแนบมา ใช้ตรงนั้นเป็น SEARCH ได้เลยไม่ต้องอ่านใหม่ ไม่งั้นใช้ READ อ่านไฟล์ที่เกี่ยวข้องก่อน แล้วส่งการแก้ที่ถูกต้องใหม่ (ถ้าแก้ไฟล์ที่มีอยู่ ให้ SEARCH ตรงกับเนื้อหาจริงของไฟล์ ถ้าเปลี่ยนเกือบทั้งไฟล์ให้ส่งทั้งไฟล์)` });
}
async function apply(c, msg, force = true) {
  if (!c.del && !force) { const why = problemOf(c.path, c.content, has(c.path) ? content(c.path) : null); if (why) throw Object.assign(new Error(why), { problem: true }); }
  if (msg) {
    msg._prev ||= [];
    IDE.task?.touched.add(c.path);
    if (!msg._prev.some(x => x.path === c.path)) msg._prev.push({ path: c.path, existed: has(c.path), prev: has(c.path) ? content(c.path) : '' });
  }
  if (c.del) {
    if (!has(c.path)) return;
    await delFile(c.path); dropFile(c.path);
  } else await writeFiles([{ path: c.path, content: c.content }]);
  markApplied(msg, c.path);
  refresh(); drawAI();
}
// diff ทีละบรรทัด (LCS) แบ่งเป็นจุดๆ ให้เลือกรับ/ไม่รับทีละจุด · ไฟล์ใหญ่มาก (เกิน ~4 ล้านคู่บรรทัด) คืน null แล้วใช้แบบรวมก้อนเดียว
function hunksOf(a, b) {
  const n = a.length, m = b.length; if (n * m > 4e6) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { ops.push(['=', a[i++]]); j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', a[i++]]); else ops.push(['+', b[j++]]); }
  while (i < n) ops.push(['-', a[i++]]); while (j < m) ops.push(['+', b[j++]]);
  const hunks = []; let cur = null; ops.forEach((o, k) => { if (o[0] === '=') cur = null; else { if (!cur) hunks.push(cur = { ops: [] }); cur.ops.push(k); } });
  return { ops, hunks };
}
// สร้างเนื้อหาไฟล์จากจุดที่เลือกรับ (ไม่รับ = คงบรรทัดเดิม)
function pickHunks(d, keep) {
  const take = new Set(); d.hunks.forEach((h, i) => { if (keep.has(i)) h.ops.forEach(k => take.add(k)); });
  return d.ops.filter(([o], k) => o === '=' || (o === '+' ? take.has(k) : !take.has(k))).map(o => o[1]).join('\n');
}
function showDiff(c, label = 'Apply') {
  const cur = has(c.path) ? content(c.path) : '', H = !c.del && cur ? hunksOf(cur.split('\n'), c.content.split('\n')) : null;
  const line = (cls, sign, t) => `<div class="dl ${cls}"><span>${sign}</span>${esc(t) || ' '}</div>`;
  let body, add = 0, del = 0;
  if (H && H.hunks.length > 1) { // หลายจุด: แสดงทีละจุดพร้อมบรรทัดรอบข้าง 2 บรรทัด และช่องติ๊กเลือก
    body = H.hunks.map((h, i) => { const a = h.ops[0], z = h.ops.at(-1), ctx = k => k >= 0 && k < H.ops.length && H.ops[k][0] === '=' ? line('', ' ', H.ops[k][1]) : '';
      h.ops.forEach(k => H.ops[k][0] === '+' ? add++ : del++);
      return `<label class="hunk"><input type="checkbox" data-h="${i}" checked> จุดที่ ${i + 1}</label>${ctx(a - 2)}${ctx(a - 1)}${h.ops.map(k => line(H.ops[k][0] === '+' ? 'add' : 'del', H.ops[k][0], H.ops[k][1])).join('')}${ctx(z + 1)}${ctx(z + 2)}<div class="dl muted">…</div>`; }).join('');
  } else {
    const d = lineDiff(cur, c.content); add = d.add; del = d.del; const ln = d.start - d.before.length;
    body = (ln > 0 ? `<div class="dl muted">… บรรทัด ${ln + 1}</div>` : '') + d.before.map(t => line('', ' ', t)).join('') + d.ops.map(([o, t]) => line(o === '+' ? 'add' : o === '-' ? 'del' : '', o, t)).join('') + d.after.map(t => line('', ' ', t)).join('');
  }
  const box = document.createElement('div'); box.className = 'diffbox';
  box.innerHTML = `<div class="diff-h"><b>${esc(c.path)}</b> <span class="ok">+${add}</span> <span class="bad">−${del}</span><span style="flex:1"></span>
    <button class="btn blue sm" id="dapply">${label}</button><button class="btn out sm" id="dclose">Close</button></div>
    ${H && H.hunks.length > 1 ? '<p class="muted" style="margin:6px 12px 0;font-size:12.5px">ติ๊กออกจุดที่ไม่อยากได้ แล้วกด Apply ใช้เฉพาะจุดที่เลือก</p>' : ''}<div class="diff-b">${body}</div>`;
  $('.ide').append(box);
  box.querySelector('#dclose').onclick = () => box.remove();
  box.querySelector('#dapply').onclick = async () => {
    const keep = new Set([...box.querySelectorAll('[data-h]')].filter(x => x.checked).map(x => +x.dataset.h));
    box.remove(); await apply(H && H.hunks.length > 1 && keep.size < H.hunks.length ? { ...c, content: pickHunks(H, keep) } : c);
  };
}
// บรรทัด READ / GREP / LIST ที่ AI ใช้อ่านไฟล์ → แสดงเป็นป้ายเล็กๆ
const TOOL_LABEL = { IMAGE: ['image', 'สร้างรูป'], READ: ['filetext', 'อ่านไฟล์'], GREP: ['search', 'ค้นหา'], LIST: ['folder', 'ดูโฟลเดอร์'], RUN: ['terminal', 'รันคำสั่ง'] };
function stepsOf(text) {
  const out = [];
  for (const m of String(text || '').replace(/```[\s\S]*?```/g, '').replace(/(\S)(READ path=)/g, '$1\n$2').matchAll(/^[\u2063 \t]*(READ|GREP|LIST|RUN|IMAGE)\b[ \t]*(?:path=)?(.*)$/gm)) {
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
// แบบแชต: บล็อกแก้ไฟล์ (path=…, SEARCH/REPLACE) ไม่แสดงในข้อความ ดูจากการ์ดไฟล์แทน · ระหว่างสตรีม บล็อกที่ยังเขียนไม่จบแสดงเป็นบรรทัด "กำลังแก้ …"
// เดิมซ่อนเฉพาะตอนตอบจบ → ระหว่างพิมพ์ (หรือสตรีมค้าง) เห็นบล็อก diff ดิบ ">>>>>>> REPLACE" เต็มจอ
function hideEditBlocks(t) {
  if (typeof chatLayout !== 'function' || !chatLayout()) return t;
  t = t.replace(/```[^\n`]*\bpath=[^\n]*\n[\s\S]*?```\n?/g, '');
  const at = t.lastIndexOf('```');
  if (at >= 0 && (t.match(/```/g) || []).length % 2 === 1) { const head = t.slice(at, t.indexOf('\n', at) < 0 ? t.length : t.indexOf('\n', at)), path = head.match(/\bpath=([^\s`]+)/)?.[1]; if (path) t = t.slice(0, at) + `\n_✎ กำลังแก้ ${path}…_\n`; }
  return t;
}
const stripTools = text => hideEditBlocks(String(text || '')).split(/```/).map((part, idx) => idx % 2 ? part : part.replace(/(\S)(READ path=)/g, '$1\n$2').replace(/^(\u2063*)[ \t]*(?:READ|LIST)\b[ \t]*(?:path=)?[`'"]?[\w./@~-]*[`'"]?/gm, '$1').replace(/^(\u2063*)[ \t]*(?:GREP|RUN|IMAGE)\b.*$/gm, '$1')).join('```').replace(/\n{3,}/g, '\n\n').trim();
function stepsBar(m, i) {
  const s = stepsOf(m.content); if (!s.length) return '';
  const cnt = k => s.filter(x => x.op === k).length;
  const parts = [['READ', 'อ่าน', 'ไฟล์'], ['GREP', 'ค้นหา', 'จุด'], ['LIST', 'ดู', 'โฟลเดอร์'], ['RUN', 'รัน', 'คำสั่ง'], ['IMAGE', 'สร้าง', 'รูป']].map(([k, v, u]) => cnt(k) ? `${v} ${cnt(k)} ${u}` : '').filter(Boolean);
  return `<button type="button" class="steps-bar" data-steps="${i}">${ic('terminal', 'sm')}<span>${parts.join(', ')}</span>${ic('right', 'sm')}</button>`;
}
const runCard = (m, i) => { const r = runsOf(m.content); return r.length ? `<div class="changes runs"><span class="muted">AI ขอรันคำสั่ง</span>${r.map(c => `<code>${esc(c)}</code>`).join('')}${m.ran ? '<span class="muted">รันแล้ว ✓</span>' : `<button class="btn blue sm" data-runai="${i}">${ic('terminal', 'sm')} รันแล้วส่งผลให้ AI</button>`}</div>` : ''; };
const ktok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
// โหมดสิทธิ์แบบ Claude Code: Auto = แก้/รัน/ตรวจเอง · Ask = เสนอการแก้ไข ผู้ใช้กด Apply · Plan = อ่านแล้ววางแผน ยังไม่แก้ไฟล์
const permOf = () => 'auto'; // AI ทำงานได้เต็มที่เสมอ: แก้ไฟล์ รัน และตรวจเองโดยไม่ต้องกด Apply (ตัวเลือก Ask/Plan เอาออกแล้ว)
// รายการงานสดที่ AI อัปเดตระหว่างทำ (todo_write)
function todoHTML(m) {
  const t = m.todos; if (!t?.length) return '';
  const done = t.filter(x => x.status === 'completed').length;
  return `<div class="todos"><div class="td-h">${ic('check', 'sm')}<b>รายการงาน</b><span class="muted">${done}/${t.length}</span></div><ul>${t.map(x => `<li class="td-${x.status}"><i></i><span>${esc(x.content)}</span></li>`).join('')}</ul></div>`;
}
// ---- หลาย session ต่อโปรเจกต์: แต่ละงานเป็นแชตแยก แสดงในแถบข้างใต้ชื่อโปรเจกต์
async function openSession(s) {
  const id = s === 'new' ? null : +s || null;
  if (id && id === IDE.chatId) return;
  if (IDE.busy) codeStop();
  IDE.chatId = id; IDE.msgs = id ? await api('/chats/' + id).catch(() => []) : []; drawAI(); ctxMeter(); $('#ce').textContent = '';
  if (isPhone()) setPane('ai');
}
const sessionsChanged = () => { if (typeof refreshSessions === 'function') refreshSessions(IDE.pid); };
// ขั้นตอนที่ AI ใช้เครื่องมือ (อ่าน / ค้นหา / แก้ / ค้นเว็บ ...) แบบ Claude Code: แถบสรุปพับได้ · ระหว่างทำแสดงขั้นล่าสุด
function toolSteps(m) {
  const s = m.mcps || []; if (!s.length) return '';
  const groups = new Map(); for (const x of s) { const v = String(x.tool || '').split(' ')[0] || 'ใช้'; groups.set(v, (groups.get(v) || 0) + 1); }
  const bad = s.filter(x => x.ok === false).length, live = m.streaming, last = s.at(-1);
  const sum = live ? `${esc(last.tool)}…` : [...groups].map(([v, n]) => `${esc(v)} ${n}`).join(' · ') + (bad ? ` · <span class="bad">ไม่สำเร็จ ${bad}</span>` : '');
  return `<details class="tsteps${live ? ' live' : ''}"${m._stepsOpen ? ' open' : ''}><summary>${live ? '<i class="tdot"></i>' : ic('terminal', 'sm')}<span>${sum}</span>${ic('right', 'sm tchev')}</summary><ol>${s.map(x => `<li class="${x.ok === false ? 'bad' : ''}">${x.ok === false ? ic('x', 'sm') : ic('check', 'sm')}<span>${esc(x.tool)}</span></li>`).join('')}</ol></details>`;
}
// ผล commit + push อัตโนมัติหลัง AI ทำงานเสร็จ (เฉพาะโปรเจกต์ที่เชื่อม GitHub)
function pushHTML(m) {
  const p = m.push, br = `<b>${esc(p.branch || '')}</b>`;
  const body = p.state === 'run' ? `<i class="tdot"></i><span>กำลัง commit และ push ขึ้น ${br}…</span>`
    : p.state === 'ok' ? `${ic('push', 'sm')}<span>Push ขึ้น ${br} แล้ว · ${p.n} ไฟล์ · ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(String(p.sha || '').slice(0, 7))}</a>` : esc(String(p.sha || '').slice(0, 7))}<small class="muted">${esc(String(p.message || '').split('\n')[0])}</small>${p.pr ? `<a class="pn-pr" href="${esc(p.pr.url)}" target="_blank" rel="noopener">${ic('pull', 'sm')} Pull Request #${p.pr.number}</a>` : p.canPr ? `<button type="button" class="btn out sm pn-pr" data-pr>${ic('pull', 'sm')} สร้าง Pull Request</button>` : ''}</span>`
    : p.state === 'none' ? `${ic('check', 'sm')}<span>ไม่มีไฟล์เปลี่ยน ไม่ต้อง push</span>`
    : `${ic('alert', 'sm')}<span>Push ไม่สำเร็จ: ${esc(p.error || '')} <button type="button" class="linkish" data-opengit>เปิด Git</button></span>`;
  return `<div class="pushnote st-${p.state}">${body}</div>`;
}
const commitMsg = (prompt, files) => {
  let sub = String(prompt || '').split('\n').map(x => x.trim()).find(Boolean) || 'อัปเดตจาก Kyber';
  if (sub.length > 72) sub = sub.slice(0, 70) + '…';
  return `${sub}\n\n${files.slice(0, 20).map(f => '- ' + f).join('\n')}${files.length > 20 ? `\n- และอีก ${files.length - 20} ไฟล์` : ''}\n\nCommitted by Kyber AI`;
};
async function createPR(note, btn) {
  if (!note?.push) return; btn.disabled = true;
  const [sub, ...rest] = String(note.push.message || '').split('\n');
  try {
    const r = await api(`/projects/${IDE.pid}/github/pr`, { method: 'POST', body: { title: sub, body: rest.join('\n').trim() + '\n\nสร้างจาก Kyber', base: IDE.ghDefault } });
    (IDE.prs ||= {})[note.push.branch] = r; note.push.pr = r; drawAI(); toast(`สร้าง Pull Request #${r.number} แล้ว`, 'ok');
  } catch (x) { btn.disabled = false; toast(x.message, 'bad'); }
}
async function autoPush() {
  const t = IDE.task; IDE.task = null;
  if (!IDE.gh || localStorage.getItem('autoPush') === '0' || !t?.touched.size) return;
  const files = [...t.touched], note = { role: 'note', push: { state: 'run', branch: IDE.gh.branch, files } }, pid = IDE.pid;
  IDE.msgs.push(note); drawAI();
  const message = commitMsg(t.prompt, files), push = () => api(`/projects/${pid}/github/push`, { method: 'POST', body: { message } });
  const pull = async () => { const pl = await api(`/projects/${pid}/github/pull`, { method: 'POST', body: {} }); if (IDE.pid === pid && (pl.updated.length || pl.deleted.length)) await reloadFiles(); };
  try {
    await saveNow();
    if ((localStorage.getItem('pushMode') || 'branch') === 'branch') { // แบบ Claude Code: งานใหม่บน branch หลัก → แยก branch ใหม่ ไม่แตะ main
      if (!IDE.ghDefault) IDE.ghDefault = (await api(`/projects/${pid}/github/branches`).catch(() => ({}))).default || null;
      if (IDE.ghDefault && IDE.gh.branch === IDE.ghDefault) {
        const name = 'astra/' + (String(t.prompt).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'task') + '-' + Math.random().toString(36).slice(2, 6);
        const mk = () => api(`/projects/${pid}/github/branch`, { method: 'POST', body: { name } });
        try { await mk(); } catch (x) { if (x.status !== 409) throw x; await pull(); await mk(); }
        IDE.gh.branch = name; note.push.branch = name; const g = $('#git'); if (g && IDE.pid === pid) g.innerHTML = ic('branch') + ' ' + esc(name); drawAI();
      }
    }
    let r;
    try { r = await push(); } catch (x) { // GitHub มีคอมมิตใหม่ / ยังไม่เคย pull: ดึงมารวมก่อน (ถ้าไม่ชนกัน) แล้ว push อีกครั้ง
      if (x.status !== 409) throw x;
      await pull(); r = await push();
    }
    const br = note.push.branch;
    Object.assign(note.push, r.nothing ? { state: 'none' } : { state: 'ok', sha: r.commit, url: r.url, n: r.files ?? files.length, message, canPr: !!IDE.ghDefault && br !== IDE.ghDefault, pr: IDE.prs?.[br] || null });
  } catch (x) { Object.assign(note.push, { state: 'bad', error: x.data?.conflicts ? 'ไฟล์ถูกแก้ทั้งในนี้และบน GitHub เลือกได้ว่าจะใช้ของฝั่งไหน' : x.message }); }
  if (IDE.pid === pid) drawAI();
}
function aiMsgHTML(m, i) {
  if (m.push) return pushHTML(m);
  if (m.cloud) return cloudMsgHTML(m);
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    const shots = m.imgs || (attImgsOf(m.content).length ? attImgsOf(m.content) : null); // รูปที่แนบ (ในเครื่อง หรือที่เซิร์ฟเวอร์เก็บไว้หลังโหลดใหม่)
    return `<div class="msg user ${m.auto ? 'auto' : ''}"><div class="b">${shots ? `<div class="mimgs shot">${shots.map(d => `<img src="${esc(d)}" alt="ภาพที่แนบ" loading="lazy">`).join('')}</div>` : ''}${esc(noAttImgs(m.content).replace(FILE_RE, '').replace(TREE_RE, '').replace(CHECK_RE, '').replace(/\n\n\[แนบรูป \d+ รูป\]/, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${icon(f[1])} <span>${esc(f[1])}</span></span>`).join('')}</div>` : ''}</div></div>`;
  }
  const ask = parseAsk(m.content, m.streaming);
  let cleanBody = vidStrip(fenceBare(stripTools(ask.text)));
  if (!m.streaming && chatLayout()) cleanBody = cleanBody.replace(/```[^\n]*\bpath=[^\n]*\n[\s\S]*?```\n?/g, '').replace(/\n{3,}/g, '\n\n').trim(); // แบบ Claude Code: โค้ดที่แก้ไฟล์ดูได้จากการ์ดไฟล์ / แท็บ Code ไม่ต้องยาวในแชต
  const mcpH = toolSteps(m);
  return `<div class="msg ai">${hasSegs(m) ? '' : thinkHTML(m)}${todoHTML(m)}${mcpH}${m.streaming ? '' : stepsBar(m, i)}<div class="b">${hasSegs(m) ? segHTML(m, cleanBody) : cleanBody ? md(cleanBody) : m.thinking || ask.asks.length ? '' : emptyHTML(m)}${vidCards(ask.text)}</div>${m.note ? `<div class="mnote">${esc(m.note)}</div>` : ''}${m.streaming ? '' : askHTML(ask.asks, i === IDE.msgs.length - 1 && !IDE.busy) + changeCards(m, i) + runCard(m, i)
    + (m.perm === 'plan' && !m.streaming && i === IDE.msgs.length - 1 && !IDE.busy ? `<div class="plan-go"><button type="button" class="btn blue sm" data-build>${ic('play', 'sm')} Start building</button><span class="muted">เปลี่ยนเป็นโหมด Auto แล้วให้ AI ทำตามแผนนี้</span></div>` : '')
    + `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${m.tin || m.tout ? `<span class="tok" title="Input ${m.tin || 0} · Output ${m.tout || 0} token">↑${ktok(m.tin || 0)} ↓${ktok(m.tout || 0)}${m.rounds ? ` · ${m.rounds} รอบ` : ''}${m.ctx ? ` · <button type="button" class="ctxm ${m.ctx.used / m.ctx.max >= 0.9 ? 'bad' : m.ctx.used / m.ctx.max >= 0.7 ? 'warn' : ''}" data-ctx title="แตะเพื่อดูว่าอะไรกิน context อยู่เท่าไร">ctx ${ktok(m.ctx.used)}/${ktok(m.ctx.max)}</button>` : ''}${m.cost ? ` · ฿${m.cost}` : ''}</span>` : ''}<button data-copy="${i}">Copy</button></div>`}</div>`;
}
function drawAI() {
  const box = $('#cmsgs'); if (!box) return;
  box.innerHTML = IDE.msgs.length ? IDE.msgs.map(aiMsgHTML).join('')
    : `<div class="empty" style="padding-top:24px"><div class="stat" style="font-size:22px">ให้ AI ช่วยเขียนโค้ด</div><div class="muted">AI อ่าน แก้ไฟล์ รัน และตรวจผลให้เองอัตโนมัติ · กด Undo ได้ทุกครั้ง</div>
      <div class="chips">${['อธิบายโค้ดไฟล์นี้', 'หาบั๊กและแก้ให้', 'เพิ่มคอมเมนต์ภาษาไทย', 'ทำให้หน้าเว็บสวยขึ้น'].map(s => `<button data-cs="${s}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight; renderRich(box);
}
// ---------- ซิงก์กับเซิร์ฟเวอร์แบบ event-driven (ไม่ poll): กลับมาที่แท็บ / เน็ตกลับมา / สตรีมหลุดแล้วโหลดใหม่ ----------
// คำตอบที่ได้มาจากการโหลดใหม่ (ไม่ผ่านสตรีม) ยังไม่ได้ใช้การแก้ไขกับไฟล์ เพราะการเขียนไฟล์ทำที่หน้าเว็บ → โหมด Auto ใช้ให้เลย และจำว่าใช้แล้ว
async function applyMissed(fromId) {
  if ((IDE.perm || 'auto') !== 'auto') return;
  for (const m of IDE.msgs) {
    if (m.role !== 'assistant' || !(+m.id > fromId) || !m.content) continue;
    const ch = changesOf(m.content, undefined, activeRef()).filter(c => !appliedSet(m).has(c.path)); if (!ch.length) continue;
    await applyChanges(ch, m).catch(x => { $('#ce').textContent = x.message; });
  }
}
async function reloadMsgs() {
  const mine = Math.max(0, ...IDE.msgs.map(m => +m.id || 0)), list = await api('/chats/' + IDE.chatId).catch(() => null);
  if (!Array.isArray(list) || IDE.busy) return false;
  if ((list.at(-1)?.id || 0) <= mine && list.length <= IDE.msgs.filter(m => !m.push).length) return false; // ไม่มีอะไรใหม่: ไม่วาดใหม่ (การ์ด push ที่มีเฉพาะในหน้านี้ยังอยู่)
  IDE.msgs = list; drawAI(); ctxMeter(); await applyMissed(mine);
  if (IDE.msgs.at(-1)?.role === 'user') codeSend({ resume: true }); // AI ยังทำงานอยู่ที่เซิร์ฟเวอร์: ต่อสตรีม
  return true;
}
async function codeResync() {
  if (!IDE.pid || !IDE.chatId || document.hidden || !$('#cmsgs')) return;
  if (IDE.busy) { if (IDE.reader && Date.now() - (IDE.lastEv || 0) > 15000) { IDE.resyncing = true; IDE.ctrl?.abort(); } return; } // สตรีมเงียบนานหลังพับจอ: ตัดแล้วต่อใหม่
  await reloadMsgs();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) codeResync(); });
window.addEventListener('online', () => codeResync());
function codeStop() {
  IDE.round = 99; if (IDE.local) DESK.kill();
  if (IDE.chatId) fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: IDE.chatId }) }).catch(() => {});
  IDE.ctrl?.abort();
}
// ---------- แนบรูป/ไฟล์ข้อความในข้อความถึง AI (เหมือนโหมดแชต) ----------
const ATT_TEXT = /\.(md|markdown|txt|csv|json|html|css|js|ts|py|xml|ya?ml|log)$/i;
const shrinkImg = f => new Promise((ok, no) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { const s = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = () => no(new Error('เปิดรูปไม่ได้')); im.src = u; });
async function addAtt(list) {
  IDE.att ||= { images: [], files: [] };
  for (const f of list) {
    try {
      if (/^image\//.test(f.type)) { if (IDE.att.images.length >= IMG_MAX) { setStatus(`แนบรูปได้สูงสุด ${IMG_MAX} รูป`, true); continue; } IDE.att.images.push(await shrinkImg(f)); }
      else if (ATT_TEXT.test(f.name)) { if (IDE.att.files.length >= FILES_MAX) { setStatus(`แนบไฟล์ได้สูงสุด ${FILES_MAX} ไฟล์`, true); continue; } if (f.size + IDE.att.files.reduce((s, x) => s + new Blob([x.text]).size, 0) > 1.8e6) { setStatus('ไฟล์แนบรวมเกิน 1.8MB ต่อข้อความ อัปโหลดเข้าโปรเจกต์แทนได้ (AI อ่านได้ไม่จำกัด)', true); continue; } IDE.att.files.push({ name: f.name.slice(0, 120), text: await f.text() }); }
      else setStatus('แนบได้เฉพาะรูป หรือไฟล์ข้อความ (.md .txt .csv .json ...)', true);
    } catch (x) { setStatus(x.message, true); }
  }
  drawAtt(); $('#ct')?.focus();
}
function drawAtt() {
  const box = $('#catts'), a = IDE.att || { images: [], files: [] }; if (!box) return;
  box.hidden = !a.images.length && !a.files.length;
  box.innerHTML = a.images.map((d, i) => `<span class="catt"><img src="${d}" alt=""><button type="button" data-rmi="${i}" aria-label="เอาออก">×</button></span>`).join('') + a.files.map((f, i) => `<span class="catt f">${ic('filetext', 'sm')}<b>${esc(f.name)}</b><button type="button" data-rmf="${i}" aria-label="เอาออก">×</button></span>`).join('');
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.rmi) a.images.splice(+b.dataset.rmi, 1); else a.files.splice(+b.dataset.rmf, 1); drawAtt(); };
}
function takeAtt() { const a = IDE.att || { images: [], files: [] }; IDE.att = { images: [], files: [] }; drawAtt(); return a; }
async function codeSend(auto) {
  if (IDE.busy && IDE.cloudJob) return api(`/cloud-agent/${IDE.cloudJob}/stop`, { method: 'POST' }).then(() => toast('สั่งหยุดแล้ว ไฟล์ที่ทำถึงตรงนั้นจะเข้าโปรเจกต์')).catch(() => {});
  if (IDE.cloud && !auto && !IDE.busy) return cloudSend();
  if (IDE.busy) return codeStop(); // กดหยุด = หยุดโหมดอัตโนมัติและหยุดฝั่งเซิร์ฟเวอร์ด้วย
  const resume = !!auto?.resume;
  if (resume && IDE.msgs.at(-1)?.role !== 'user') return;
  const t = $('#ct'), text = resume ? '' : auto ? auto.text : t.value.trim() || (IDE.att?.images.length || IDE.att?.files.length ? 'ดูรูป/ไฟล์ที่แนบ' : '');
  if (!resume && !text && !(IDE.att?.images.length || IDE.att?.files.length)) return;
  if (!auto) { IDE.round = 0; IDE.cont = 0; IDE.t0 = Date.now(); IDE.task = resume || IDE.perm !== 'auto' ? null : { prompt: text, touched: new Set() }; }
  await saveNow();
  const att = !auto && !resume ? takeAtt() : { images: [], files: [] }; // รูป/ไฟล์ที่แนบในข้อความนี้ (ไม่เข้าโปรเจกต์)
  const files = att.files;
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
  const images = [...(auto?.images || []), ...att.images];
  if (!auto) { t.value = ''; t.style.height = 'auto'; }
  $('#ce').textContent = '';
  if (!resume) IDE.msgs.push({ role: 'user', content: withFiles(full, files), imgs: images.length ? images : null, auto: !!auto });
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true, perm: IDE.perm }; IDE.msgs.push(ai); drawAI();
  IDE.busy = true; IDE.ctrl = new AbortController(); $('#cgo').innerHTML = ic('stop'); $('#cgo').classList.add('stop');
  let raf = 0, started = false, netLost = false, reload = false;
  try {
    const reqBody = resume ? { resume: true, chat_id: IDE.chatId } : { project_id: IDE.pid, chat_id: IDE.chatId, model_id: m.id, text: full, files, images, effort: m.effort !== 'none' ? $('#ceffort').value || null : null, skill_ids: IDE.skills, mcp_ids: IDE.mcps, agent: !!IDE.agent, perm: IDE.perm || 'auto', local: IDE.local ? { os: navigator.userAgentData?.platform || navigator.platform } : undefined };
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: IDE.ctrl.signal, body: JSON.stringify(reqBody) });
    if (!r.ok) { const d = await r.json(); throw new Error(r.status === 429 && d.pct4h != null ? 'ลิมิตเต็มแล้ว' : d.error); }
    started = true;
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', ended = false; IDE.lastEv = Date.now(); IDE.reader = rd;
    for (;;) {
      const { done, value } = await rd.read();
      // จบสตรีม: ถอดรหัสส่วนที่เหลือ + เติมตัวคั่น เพื่อให้ event สุดท้ายที่ไม่มี \n\n ปิดท้ายถูกอ่านด้วย (เดิมตกหล่น → done ไม่ถูกประมวลผล)
      buf += (done ? dec.decode() + '\n\n' : dec.decode(value, { stream: true })).replace(/\r\n/g, '\n'); IDE.lastEv = Date.now();
      let k; while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 2);
        if (!line.startsWith('data: ')) continue;
        let d; try { d = JSON.parse(line.slice(6)); } catch { continue; } // event ขาดครึ่ง (สตรีมถูกตัด) ไม่ทำให้ทั้งคำตอบพัง
        if (d.done) { ended = true; if (d.mid) ai.id = d.mid; if (d.more) ai.more = true; } // more = ครบรอบทั้งที่งานยังไม่เสร็จ
        if (d.chat_id) { const fresh = !IDE.chatId; IDE.chatId = d.chat_id; if (fresh) { setUrl(`/code?p=${IDE.pid}&s=${d.chat_id}`, true); sessionsChanged(); } } // session ใหม่ได้เลขแล้ว
        if (d.todo) { ai.todos = d.todo; if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) paintStreaming(last, ai); }); }
        if (d.mcp) { (ai.mcps ||= []).push(d.mcp); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) paintStreaming(last, ai); }); }
        if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) { const stick = nearBottom(b); paintStreaming(last, ai); if (stick) b.scrollTop = b.scrollHeight; } }); }
        if (d.error) $('#ce').textContent = d.error;
        if (d.model && !ai.model) ai.model = d.model;
        if (d.fallback) { ai.model = d.fallback; ai.note = `โมเดลหลักขัดข้อง จึงตอบด้วย ${d.fallback}`; toast(ai.note, 'bad'); } // แจ้งชัดว่าโมเดลที่ตอบไม่ใช่ตัวที่เลือก (เดิมโหมด Code เงียบ)
        if (d.round) { setStatus(`AI กำลังทำงาน · รอบที่ ${d.round}/${d.of}`); ai.doingBase = `รอบที่ ${d.round}/${d.of}${d.doing ? ' · ' + d.doing : ''}`; ai.doingAt = Date.now(); ai.doing = ai.doingBase; const b = $('#cmsgs'), last = b?.lastElementChild; if (last) paintStreaming(last, ai);
          clearInterval(IDE.tick); IDE.tick = setInterval(() => { // นับวินาทีที่รอในรอบนี้ ให้เห็นว่ายังทำงานอยู่
            if (!ai.doing || !ai.streaming) { clearInterval(IDE.tick); return; }
            ai.doing = `${ai.doingBase} · ${Math.round((Date.now() - ai.doingAt) / 1000)} วินาที`; const el = $('#cmsgs')?.lastElementChild?.querySelector('.doing'); if (el) el.textContent = ai.doing;
          }, 1000); }
        if (d.t?.trim() && ai.doing) ai.doing = '';
        if (d.compacted) toast(`ย่อแชตอัตโนมัติแล้ว (${d.why})`, 'ok');
        if (d.trimmed) toast('context เต็ม: ตัดข้อความเก่าบางส่วนออกจากที่ส่งให้ AI', 'bad');
        if (d.done && IDE.agent && document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification('Kyber', { body: 'AI ทำงานเสร็จแล้ว แตะเพื่อดูผล' }); } catch { /* บางเบราว์เซอร์ต้องใช้ service worker */ }
        if (d.done) { me.usage = d; if ($('#clim')) $('#clim').innerHTML = limHTML(d); lowWarn(d); IDE.resumeTries = 0; if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; } if (d.ctx) ai.ctx = d.ctx; ctxMeter(); if (d.cost) ai.cost = d.cost; if (d.rounds > 1) ai.rounds = d.rounds; setStatus('บันทึกแล้ว ✓'); }
      }
      if (done || ended) { if (!done) rd.cancel().catch(() => {}); break; } // ได้ done แล้วจบทันที ไม่รอให้เซิร์ฟเวอร์ปิดการเชื่อมต่อ
    }
    // สตรีมปิดโดยไม่มี done (เซิร์ฟเวอร์ตัด/เครือข่ายหลุดเงียบๆ): ดึงผลจริงจากเซิร์ฟเวอร์ แทนที่จะถือว่าคำตอบครึ่งเดียวคือคำตอบสุดท้าย
    if (!ended && IDE.chatId) { if (resume) reload = true; else if ((IDE.resumeTries = (IDE.resumeTries || 0) + 1) <= 8) netLost = true; }
  } catch (x) {
    if (x.name === 'AbortError' && IDE.resyncing && started && IDE.chatId) netLost = true; // กลับมาที่แท็บแล้วสตรีมเงียบนาน: ตัดแล้วต่อใหม่จากเซิร์ฟเวอร์ (ไม่ใช่ผู้ใช้กดหยุด)
    else if (x.name !== 'AbortError') {
      // เครือข่ายหลุดกลางคำตอบ (สลับแอป ปิดจอ): เซิร์ฟเวอร์ยังตอบต่อเบื้องหลัง จึงต่อสตรีมกลับมาให้เอง แทนที่จะแจ้ง network error
      if (started && IDE.chatId && (IDE.resumeTries = (IDE.resumeTries || 0) + 1) <= 8) netLost = true;
      else { $('#ce').textContent = x.message; if (!started && !resume) { IDE.msgs.splice(-2, 2); if (!auto) t.value = text; } }
    }
  }
  IDE.resyncing = false; IDE.reader = null;
  cancelAnimationFrame(raf); ai.streaming = false; if (!ai.content && !ai.thinking && IDE.msgs.at(-1) === ai) IDE.msgs.pop();
  if (netLost) { // ทิ้งข้อความที่ได้มาครึ่งเดียว แล้วรอจนหน้าจอกลับมา เพื่อดึงคำตอบเต็มจากเซิร์ฟเวอร์
    if (IDE.msgs.at(-1) === ai) IDE.msgs.pop();
    IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI(); $('#ce').textContent = 'เครือข่ายหลุด กำลังต่อให้อัตโนมัติ...';
    const go = () => { $('#ce').textContent = ''; if (!IDE.busy && IDE.msgs.at(-1)?.role === 'user') codeSend({ resume: true }); };
    if (document.hidden) document.addEventListener('visibilitychange', function f() { if (!document.hidden) { document.removeEventListener('visibilitychange', f); setTimeout(go, 600); } });
    else setTimeout(go, 2000);
    return;
  }
  if (resume && (reload || (!ai.content && !ai.thinking)) && IDE.chatId) { const mine = Math.max(0, ...IDE.msgs.map(m => +m.id || 0)); IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => IDE.msgs); IDE.resumeTries = 0; IDE.busy = false; await applyMissed(mine); IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI(); return; } // ต้องคืนปุ่มส่งด้วย ไม่งั้นปุ่มหยุดค้างหลังต่อสตรีมกลับมาแล้วพบว่าตอบจบไปแล้ว // เซิร์ฟเวอร์ตอบจบไปแล้ว: โหลดคำตอบที่บันทึกไว้
  IDE.busy = false; $('#cgo').innerHTML = ic('up'); $('#cgo').classList.remove('stop'); drawAI();
  // โหมดอัตโนมัติ: ใช้การแก้ไขทันที แล้วให้ AI ดูผลลัพธ์เอง (สูงสุด 3 รอบ)
  // Auto-apply: ใช้การแก้ไขทันที (และรันคำสั่งที่ AI ขอ) · ตรวจผลเอง: ใช้การแก้ไข แล้วรัน + จับภาพให้ AI ดู (สูงสุด 3 รอบ)
  const runs = ai.content ? runsOf(ai.content) : [], ch = ai.content ? changesOf(ai.content, undefined, activeRef()) : [], autoOn = (IDE.perm || 'auto') === 'auto' && (IDE.autoApply || IDE.autoMode || barAuto() || IDE.applyNext), imgs = ai.content ? imagesOf(ai.content) : [];
  IDE.applyNext = false; // หลังสร้างรูปเสร็จ คำตอบถัดไปที่ใส่รูปลงโค้ดจะถูกใช้ทันที
  try {
    if (imgs.length && !ai.imgdone && (IDE.round ?? 0) < 5) await imagesForAI(ai, imgs);
    else if (autoOn && runs.length && (IDE.round ?? 0) < 5) await runForAI(ai, runs);
    else if (!ch.length && !runs.length && !(ai.content && /^\s*(?:READ|GREP|LIST)\b/m.test(ai.content.replace(/```[\s\S]*?```/g, ''))) && ai.content && looseCode(ai.content).length && (IDE.round ?? 0) < 2) { // ตอบเป็นโค้ดลอยๆ ไม่ใช้รูปแบบที่ระบบแก้ไฟล์ได้: ขอให้ส่งใหม่ให้ถูก (ไม่เกิน 2 รอบ)
      IDE.round = (IDE.round ?? 0) + 1;
      await codeSend({ text: 'ข้อความก่อนหน้ายังไม่ได้แก้ไฟล์ เพราะโค้ดไม่ได้อยู่ในรูปแบบที่ระบบใช้ได้ คุณแก้ไฟล์ในโปรเจกต์ได้จริง ให้ส่งใหม่: ไฟล์ที่มีอยู่แล้วใช้บล็อก ```<ภาษา> path=<ไฟล์> ที่ข้างในเป็น <<<<<<< SEARCH / ======= / >>>>>>> REPLACE (คัดลอก SEARCH จากเนื้อหาไฟล์จริง) หรือส่งทั้งไฟล์ใน path= เดียวกัน ห้ามตอบว่าแก้ไฟล์ไม่ได้ และห้ามส่งโค้ดที่ไม่มี path=' });
    }
    else if (autoOn && ch.length) { const bad = await applyChanges(ch, ai); if (bad.length) await feedBack(bad); else if (await autoTest()) { /* รันเทสต์แล้ว */ } else if ((IDE.autoMode || barAuto()) && (IDE.round ?? 0) < (IDE.agent ? 8 : 3)) await check(); }
  } catch (x) { $('#ce').textContent = x.message; }
  // งานใหญ่ครบรอบต่อคำตอบแล้วแต่ยังไม่เสร็จ: สั่งทำต่อเองสูงสุด 2 ครั้งต่อคำสั่ง (เดิมหยุดเงียบ ลูกค้าต้องพิมพ์ "ทำต่อ" เอง) · กดหยุด = ไม่ทำต่อ
  if (ai.more && !IDE.busy && IDE.round !== 99 && (IDE.cont ?? 0) < 2) {
    IDE.cont = (IDE.cont ?? 0) + 1; toast(`งานยังไม่เสร็จ ทำต่อให้อัตโนมัติ (${IDE.cont}/2)`, 'ok');
    await codeSend({ text: '[ทำต่ออัตโนมัติ] คำตอบก่อนหน้าครบจำนวนรอบแล้วแต่งานยังไม่เสร็จ ทำต่อจากจุดที่ค้างไว้จนเสร็จ ไม่ต้องเริ่มใหม่หรือทำซ้ำสิ่งที่ทำไปแล้ว' });
  }
  if (!auto && !IDE.busy && IDE.round !== 99) await autoPush(); else if (!auto) IDE.task = null;
  if (!auto) sessionsChanged(); // ชื่อ session ตั้งหลังคำตอบแรก // งานจบ (ไม่ได้กดหยุด): commit + push ขึ้น GitHub ให้เอง
  if (!IDE.busy && Date.now() - (IDE.t0 || Date.now()) > 15000 && Date.now() - (IDE.told || 0) > 10000) { IDE.told = Date.now(); window.astraDesktop?.notify('AI ทำงานเสร็จแล้ว', IDE.name); } // แอป Desktop: แจ้งเตือนเมื่อสลับไปทำอย่างอื่น
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
      <div><label>Branch (เว้นว่าง = ค่าเริ่มต้น)</label><input name="branch" placeholder="main"></div><div style="grid-column:1/-1"><button class="btn blue" style="width:100%">Connect repo</button></div></form>
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
    <label class="tg gauto"><input type="checkbox" id="gautop" ${localStorage.getItem('autoPush') === '0' ? '' : 'checked'}><span><b>Push อัตโนมัติเมื่อ AI ทำเสร็จ</b><small class="muted">commit พร้อมข้อความสรุปงาน แล้ว push ให้ทันที</small></span></label>
    <div class="gmode"><span class="muted">Push ไปที่</span><div class="seg" role="group" aria-label="Push ไปที่">${[['branch', 'Branch ใหม่ต่องาน'], ['direct', 'Branch ปัจจุบัน']].map(([v, l]) => `<button type="button" data-pm="${v}" class="${(localStorage.getItem('pushMode') || 'branch') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <form id="gc" class="gcommit"><label>ข้อความคอมมิต</label><input name="message" placeholder="อธิบายสิ่งที่เปลี่ยน" maxlength="500"><button class="btn blue" id="gpush">${ic('push')} Commit & Push</button></form><p class="gmsg"></p>`;
  const list = (t, xs, cls) => xs.length ? `<div class="gl"><b>${t}</b>${xs.map(x => `<div class="${cls}">${esc(x.path || x)}${x.status ? ` <span class="muted">${x.status}</span>` : ''}</div>`).join('')}</div>` : '';
  gb.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { localStorage.setItem('pushMode', b.dataset.pm); gb.querySelectorAll('[data-pm]').forEach(x => x.classList.toggle('on', x === b)); });
  gb.querySelector('#gautop')?.addEventListener('change', e => { localStorage.setItem('autoPush', e.target.checked ? '1' : '0'); toast(e.target.checked ? 'เปิด Push อัตโนมัติ' : 'ปิด Push อัตโนมัติ', 'ok'); });
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
async function codeView(id, prompt) {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const [d] = await Promise.all([api('/projects/' + id), needCM()]);
  IDE.node?.f.remove(); IDE.node = null; // เทอร์มินัลของโปรเจกต์ก่อน
  Object.assign(IDE, { ghDefault: null, prs: {}, pid: d.id, name: d.name, instructions: d.instructions || '', gh: d.gh, files: new Map(d.files.map(f => [f.path, f.content])), states: new Map(), open: [], active: null,
    dirty: new Set(), filter: '', recent: (() => { try { return JSON.parse(localStorage.getItem('recent:' + d.id) || '[]'); } catch { return []; } })(), msgs: [], chatId: null, busy: false, logs: [], frame: null });
  if (IDE.worker) { IDE.worker.terminate(); IDE.worker = null; }
  const saved = localStorage.getItem('model');
  const cl = chatLayout();
  codeHost().innerHTML = `<div class="ide view" data-pane="${cl ? 'ai' : 'code'}" data-layout="${cl ? 'chat' : 'editor'}" data-rp="code">
    <header class="ide-bar"><button type="button" class="icon-btn sm ide-burger" id="burger" aria-label="เมนูไฟล์" aria-expanded="false">${ic('menu')}</button><a class="icon-btn sm ide-back" href="/code" aria-label="กลับไปหน้าโปรเจกต์">‹</a><b class="pname">${esc(d.name)}</b><span id="ide-status" class="muted"></span><span style="flex:1"></span>${cl ? `<div class="rp-tabs" role="tablist" aria-label="แผงขวา">${[['preview', 'eye', 'Preview'], ['code', 'code', 'Code'], ['files', 'folder', 'Files']].map(([k, i, l]) => `<button type="button" role="tab" data-rp="${k}" class="${k === 'code' ? 'on' : ''}" aria-selected="${k === 'code'}">${ic(i, 'sm')}<span>${l}</span></button>`).join('')}</div>` : ''}
      <button class="btn out sm" id="srvb" hidden></button><button class="btn out sm" id="localb" hidden title="ไฟล์ในโปรเจกต์ = ไฟล์จริงในโฟลเดอร์นี้ · RUN รันในเครื่อง"></button><button class="btn out sm" id="git" aria-label="GitHub">${ic('branch')} ${d.gh ? esc(d.gh.branch) : 'Git'}</button><button class="btn blue sm" id="run" aria-label="รัน">${ic('play')} Run</button></header>
    <div class="ide-body">
      <aside class="ide-files">
        <div class="dr-tabs"><button type="button" data-dr="ai" aria-label="AI">${ic('sparkles')}</button><button type="button" data-dr="files" class="on" aria-label="ไฟล์">${ic('folder')}</button><button type="button" data-dr="find" aria-label="ค้นหาทั้งโปรเจกต์">${ic('search')}</button><button type="button" data-dr="git" aria-label="GitHub">${ic('branch')}</button><a href="/account" aria-label="บัญชี">${ic('user')}</a></div>
        <div class="dr-head"><div><b>${esc(d.name)}</b><div class="dr-links"><a href="/code" class="dr-back">‹ Projects</a><a href="/chat" class="dr-exit">Exit Code mode</a></div></div><button type="button" class="icon-btn sm" id="edset" aria-label="ตั้งค่าตัวแก้ไข">${ic('settings')}</button></div>
        <div class="dr-find"><input id="tfilter" type="search" placeholder="ค้นหาชื่อไฟล์" aria-label="ค้นหาชื่อไฟล์" autocomplete="off"></div><div id="recent" class="recent"></div>
        <div id="tree" class="tree"></div>
        <div class="ftools"><button class="btn out sm" id="nfile">+ File</button><button class="btn out sm" id="nfold">+ Folder</button><button class="btn out sm" id="gfind">${ic('search', 'sm')} ทั้งโปรเจกต์</button><button class="btn out sm" id="upl">Upload</button>
        <button class="btn out sm" id="zin">Import zip</button><button class="btn out sm" id="zout">Export zip</button>
        <input type="file" id="uplf" multiple hidden><input type="file" id="zinf" accept=".zip,application/zip" hidden></div></aside>
      <div class="ide-scrim" id="idescrim"></div>
      <section class="ide-main"><div class="ide-tabs" id="tabs"></div>
        <div class="ide-tools"><button id="split" aria-label="แบ่งจอ: โค้ดกับผลลัพธ์" aria-pressed="false">${ic('layers', 'sm')} แบ่งจอ</button><button id="undo" aria-label="ย้อนกลับ">${ic('undo')}</button><button id="redo" aria-label="ทำซ้ำ">${ic('redo')}</button><button id="find" aria-label="ค้นหา">${ic('search')}</button>
          <button id="fmtb" aria-label="จัดรูปแบบโค้ด" title="จัดรูปแบบโค้ด (Prettier)">${ic('code', 'sm')} จัดรูป</button><button id="wrapb" aria-label="ตัดบรรทัด">${ic('filetext', 'sm')} ตัดบรรทัด</button><button id="ghostb" aria-pressed="${localStorage.getItem('ghost') !== '0'}" title="ให้ AI เดาโค้ดต่อขณะพิมพ์ (ใช้ลิมิตเล็กน้อย)">${ic('sparkles', 'sm')} AI เดา ${localStorage.getItem('ghost') === '0' ? 'ปิด' : 'เปิด'}</button><button id="hist" aria-label="ประวัติไฟล์">${ic('activity', 'sm')} History</button><button id="save" aria-label="บันทึก">${ic('check', 'sm')} Save</button></div>
        <div id="editor" class="ide-editor"></div><div id="lintbar" class="lintbar" hidden></div><div id="imgview" class="imgview" hidden></div>
        <button type="button" class="sel-ai" id="selai" hidden>${ic('sparkles', 'sm')} ถาม / แก้ส่วนที่เลือก</button>
        <form class="cmdbar" id="cmdbar"><div class="cmd-opts"><button type="button" id="bmdl" aria-haspopup="dialog"></button><button type="button" id="beff" aria-haspopup="dialog"></button><span class="muted">อัตโนมัติ: แก้ไฟล์ · รัน · ตรวจผล</span></div>
          <div class="cmd-in"><input id="cmdi" placeholder="สั่ง AI แก้ไฟล์นี้ เช่น เพิ่มปุ่มรีเซ็ต" aria-label="สั่ง AI" autocomplete="off"><button aria-label="ส่ง">${ic('up')}</button></div></form>
        <div class="mkeys" id="mkeys"><button type="button" data-mv="undo" aria-label="ย้อนกลับ">${ic('undo', 'sm')}</button><button type="button" data-mv="redo" aria-label="ทำซ้ำ">${ic('redo', 'sm')}</button><button type="button" data-mv="L" aria-label="เลื่อนซ้าย">←</button><button type="button" data-mv="R" aria-label="เลื่อนขวา">→</button><button type="button" data-mv="U" aria-label="ขึ้นบรรทัดบน">↑</button><button type="button" data-mv="D" aria-label="ลงบรรทัดล่าง">↓</button>${[['Tab', '  '], ['{ }', '{}', 1], ['( )', '()', 1], ['[ ]', '[]', 1], ['=>', ' => '], [';', ';'], ['" "', '""', 1], ["' '", "''", 1], ['< >', '<>', 1], ['/', '/'], ['=', ' = '], [':', ':'], ['.', '.'], [',', ','], ['!', '!'], ['&', '&'], ['|', '|'], ['+', '+'], ['-', '-'], ['*', '*'], ['$', '$'], ['#', '#'], ['` `', '``', 1]].map(([l, v, o]) => `<button type="button" data-ins="${esc(v)}" data-off="${o || 0}">${esc(l)}</button>`).join('')}</div>
        <div class="ide-run"><div class="run-h"><button data-rtab="out" class="on">Output</button><button data-rtab="con">Console</button><button data-rtab="term">Terminal</button><span id="run-status" class="muted"></span><span style="flex:1"></span>
          <button id="rmob" title="สลับขนาดมือถือ">${ic('smartphone', 'sm')}</button><button id="rfull" title="ขยายเต็มจอ" aria-label="ขยายเต็มจอ">${ic('eye', 'sm')}</button><button id="stop" title="หยุด" aria-label="หยุด">${ic('stop', 'sm')}</button><button id="clr">Clear</button><button id="hiderun" aria-label="ปิดแผงรัน">${ic('x')}</button></div>
          <div id="out" class="run-out"><p class="muted" style="padding:16px">กด รัน เพื่อดูผล</p></div><div id="console" class="console" hidden></div><div id="term" class="term" hidden><pre id="term-o"></pre><form id="term-f"><span>$</span><input id="term-i" placeholder="npm install lodash / npm test / node app.js" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="คำสั่ง"></form></div></div></section>
      <aside class="ide-ai"><div class="ai-h"><b class="ai-t">${ic('sparkles')} AI</b><button type="button" class="ctxm" id="cctx" hidden title="context ที่ใช้อยู่ · แตะดูรายละเอียด"></button><span class="sp"></span><button class="lim" id="clim" aria-label="ลิมิตการใช้งาน"></button><button class="icon-btn sm" id="chist" aria-label="ประวัติแชตโปรเจกต์" title="ประวัติแชต">${ic('more')}</button><button class="icon-btn sm" id="cnew" aria-label="แชตใหม่">${ic('newchat')}</button>
        <button type="button" class="icon-btn sm" id="aiclose" aria-label="ปิดแผง AI">${ic('x')}</button>
        <select id="cmodel" hidden>${me.models.filter(m => !m.locked).map(m => `<option value="${m.id}" ${String(m.id) === saved ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <select id="ceffort" hidden>${EFFORTS.map(([v]) => `<option value="${v}">${v}</option>`).join('')}</select></div>
        <div id="cmsgs" class="msgs"></div>
        <div class="compose"><div class="err" id="ce"></div>
          <form id="cf" class="cbox"><div id="catts" class="catts" hidden></div><input type="file" id="catt" multiple hidden accept="image/png,image/jpeg,image/webp,.md,.markdown,.txt,.csv,.json,.html,.css,.js,.ts,.py,.xml,.yml,.yaml,.log"><textarea id="ct" rows="1" placeholder="สั่ง AI เช่น เพิ่มปุ่มรีเซ็ต" aria-label="ข้อความถึง AI"></textarea>
            <div id="cflags" class="cflags"></div><div class="crow"><button type="button" class="cb" id="cplus" aria-label="เครื่องมือ">${ic('plus')}</button><button type="button" class="cb" id="cup" aria-label="แนบรูปหรือไฟล์ในข้อความ" title="แนบรูป / ไฟล์ .md ให้ AI อ่าน">${ic('clip')}</button><button type="button" class="cb pick" id="cmdl" aria-haspopup="dialog"></button><button type="button" class="cb pick" id="ceff" aria-haspopup="dialog"></button>
              <button class="send" id="cgo" aria-label="ส่ง">${ic('up')}</button></div></form></div></aside>
    </div>
    <nav class="ide-nav">${(cl ? [['ai', 'sparkles', 'AI'], ['files', 'folder', 'ไฟล์'], ['code', 'code', 'โค้ด'], ['run', 'play', 'Preview']] : [['files', 'folder', 'ไฟล์'], ['code', 'code', 'โค้ด'], ['ai', 'sparkles', 'AI'], ['run', 'play', 'ผลลัพธ์']]).map(([k, i, l]) => `<button data-pane-btn="${k}" class="${k === (cl ? 'ai' : 'code') ? 'on' : ''}"><span>${ic(i)}</span>${l}</button>`).join('')}</nav></div>`;

  IDE.view = new CM.EditorView({ parent: $('#editor'), state: CM.EditorState.create({ doc: '' }) });
  const first = has('index.html') ? 'index.html' : [...IDE.files.keys()][0];
  if (first) openFile(first); else refresh();
  if (cl) setPane('ai'); // แชตเป็นหลัก: มือถือเปิดที่บทสนทนา
  setStatus('บันทึกแล้ว ✓'); applyEditorPrefs();
  if (!IDE.menuClose) { IDE.menuClose = true; document.addEventListener('click', e => { if (!e.target.closest('.tmenu, .tmore')) document.querySelector('.tmenu')?.remove(); }); }
  $('#nfold').onclick = () => newFolder();
  $('#tfilter').oninput = e => { IDE.filter = e.target.value; drawTree(); drawRecent(); }; $('#edset').onclick = editorSettings; $('#aiclose').onclick = () => openAI(false);
  if (cl) { IDE.pane = 'ai'; document.querySelectorAll('.rp-tabs [data-rp]').forEach(b => b.onclick = () => { setRp(b.dataset.rp); if (b.dataset.rp === 'preview' && !IDE.frame && !IDE.running) $('#run').click(); }); }
  $('#cmdbar').onsubmit = e => { e.preventDefault(); const i = $('#cmdi'), v = i.value.trim(); if (!v || IDE.busy) return; $('#ct').value = v; $('#ct').dispatchEvent(new Event('input')); i.value = ''; openAI(true); codeSend(); };

  $('#cmodel').onchange = e => { localStorage.setItem('model', e.target.value); cUI(); ctxMeter(); };
  $('#cctx').onclick = () => ctxSheet({ chatId: IDE.chatId, projectId: IDE.pid, modelId: +$('#cmodel')?.value || null, skills: IDE.skills, onCompact: ctxMeter, onPickModel: id => { $('#cmodel').value = id; $('#cmodel').onchange({ target: $('#cmodel') }); } });
  IDE.cloud = localStorage.getItem('ccloud') === '1' && me?.role === 'admin';
  if (!window.DEMO) api('/cloud-agent?project=' + IDE.pid).then(l => { const j = l.find(x => x.status === 'running'); if (j && !IDE.busy) { IDE.cloud = true; cUI(); cloudSend(j); } }).catch(() => {});
  $('#ceffort').value = localStorage.getItem('effort') || ''; $('#ceffort').onchange = e => { localStorage.setItem('effort', e.target.value); cUI(); };
  $('#cmdl').onclick = $('#bmdl').onclick = () => modelSheet('#cmodel'); $('#ceff').onclick = $('#beff').onclick = () => effortSheet('#ceffort', me.models.find(x => x.id === +$('#cmodel').value) || me.models[0]); $('#clim').onclick = limitSheet; $('#cplus').onclick = codeTools; $('#cup').onclick = () => $('#catt').click(); $('#ct').addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); addAtt(fs); } }); $('#catt').onchange = async e => { await addAtt([...e.target.files]); e.target.value = ''; };
  $('#cflags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'cloud') { IDE.cloud = false; localStorage.setItem('ccloud', '0'); cUI(); return; } if (f === 'bgagent') { bgAgentSheet(); return; } if (f === 'agent') { IDE.agent = false; localStorage.setItem('agent', '0'); toast('ปิดโหมด Agent', 'ok'); cUI(); return; } if (f === 'sk') { IDE.skills = IDE.skills.filter(x => x !== +e.target.closest('[data-sid]').dataset.sid); localStorage.setItem('cskills', JSON.stringify(IDE.skills)); cUI(); }
    else if (f === 'mc') { IDE.mcps = IDE.mcps.filter(x => x !== +e.target.closest('[data-mid]').dataset.mid); localStorage.setItem('cmcps', JSON.stringify(IDE.mcps)); cUI(); } else if (f) { setOpt(f, false); cUI(); } };
  $('#clim').innerHTML = limHTML(me.usage); lowWarn(me.usage); agWatch().catch(() => {}); Promise.all([loadSkills(), loadMcps()]).then(() => cUI()); cUI();
  document.querySelectorAll('[data-pane-btn]').forEach(b => b.onclick = () => { if (b.dataset.paneBtn === 'files') return drawer(true); if (b.dataset.paneBtn === 'run') showRun(true); if (b.dataset.paneBtn === 'ai') return openAI(!(aiMode() !== 'page' && isPhone() && $('.ide').dataset.ai)); setPane(b.dataset.paneBtn); });
  $('#burger').onclick = () => drawer(!$('.ide').dataset.drawer); $('#idescrim').onclick = () => drawer(false);
  document.querySelectorAll('[data-dr]').forEach(b => b.onclick = () => { const k = b.dataset.dr; if (k === 'files') return; drawer(false); if (k === 'ai') openAI(true); else if (k === 'find') $('#gfind').click(); else if (k === 'git') $('#git').click(); });
  $('.ide-files').addEventListener('click', e => { if (e.target.closest('.dr-back, .dr-exit, .dr-tabs a')) drawer(false); });
  $('#term-f').onsubmit = async e => { e.preventDefault(); const i = $('#term-i'), cmd = i.value.trim(); if (!cmd || IDE.termBusy) return; i.value = ''; IDE.termBusy = true; try { await nodeRun(cmd); } finally { IDE.termBusy = false; i.focus(); } };
  $('#run').onclick = run; $('#git').onclick = () => gitPanel(); $('#stop').onclick = stopCode; $('#clr').onclick = () => { IDE.logs = []; $('#console').innerHTML = ''; };
  $('#hiderun').onclick = () => { $('.ide').classList.remove('run-full'); $('#rfull')?.classList.remove('on'); showRun(false); setPane('code'); };
  document.querySelectorAll('[data-rtab]').forEach(b => b.onclick = () => runTab(b.dataset.rtab));
  // แบ่งจอบนมือถือ: โค้ดด้านบน ผลลัพธ์ด้านล่าง (จำค่าไว้)
  const splitSet = on => { $('.ide').toggleAttribute('data-split', on); $('#split').classList.toggle('on', on); $('#split').setAttribute('aria-pressed', on); try { localStorage.setItem('codeSplit', on ? '1' : '0'); } catch { /* ไม่มีที่เก็บ */ } requestAnimationFrame(() => IDE.view?.requestMeasure()); };
  $('#split').onclick = () => { const on = !$('.ide').hasAttribute('data-split'); splitSet(on); if (on && !IDE.frame) run(); };
  try { if (localStorage.getItem('codeSplit') === '1') splitSet(true); } catch { /* ไม่มีที่เก็บ */ }
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
  $('#cnew').onclick = () => { setUrl(`/code?p=${IDE.pid}&s=new`); openSession('new'); sessionsChanged(); };
  IDE.perm = 'auto';
  $('#chist').onclick = async () => {
    const list = await api('/chats?project=' + IDE.pid).catch(() => []);
    if (!list.length) return toast('ยังไม่มีประวัติแชตในโปรเจกต์นี้');
    sheet('ประวัติแชตในโปรเจกต์', list.map(c => optHTML(c.id, ic('msg') + esc(c.title), c.id === IDE.chatId ? 'กำลังเปิดอยู่' : '', c.id === IDE.chatId)).join(''), (d, close) => {
      d.querySelectorAll('[data-v]').forEach(b => b.onclick = async () => {
        close(); IDE.chatId = +b.dataset.v; IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => []); drawAI(); ctxMeter();
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
    const mv = e.target.closest('[data-mv]')?.dataset.mv, v = IDE.view;
    if (mv && v) { // ย้อน/ทำซ้ำ และเลื่อนเคอร์เซอร์ (คีย์บอร์ดมือถือไม่มีปุ่มลูกศร)
      const r = v.state.selection.main;
      if (mv === 'undo') CM.undo(v); else if (mv === 'redo') CM.redo(v);
      else if (mv === 'L' || mv === 'R') v.dispatch({ selection: { anchor: Math.max(0, Math.min(v.state.doc.length, r.head + (mv === 'R' ? 1 : -1))) } });
      else v.dispatch({ selection: { anchor: v.moveVertically(r, mv === 'D').head }, scrollIntoView: true });
      return v.focus();
    }
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
  $('#fmtb').onclick = formatActive;
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
  $('#cmsgs').onkeydown = e => { answer(e); }; // ห้าม return ค่า: on-handler ที่คืน false = ยกเลิกปุ่มที่กด → ช่องพิมพ์ในรายการข้อความพิมพ์ไม่ได้
  $('#cmsgs').onclick = async e => {
    if (answer(e)) return;
    if (e.target.closest('[data-opengit]')) return $('#git').click();
    if (e.target.closest('[data-build]')) { IDE.perm = 'auto'; const t = $('#ct'); t.value = 'ทำตามแผนนี้ได้เลย'; t.dispatchEvent(new Event('input')); return codeSend(); }
    const pr = e.target.closest('[data-pr]'); if (pr) return createPR(IDE.msgs[[...$('#cmsgs').children].indexOf(pr.closest('.pushnote'))], pr);
    const of = e.target.closest('[data-openf]'); if (of && has(of.dataset.openf)) { openFile(of.dataset.openf); return; }
    const sm = e.target.closest('.tsteps summary'); if (sm) { const k = [...$('#cmsgs').children].indexOf(sm.closest('.msg')); if (IDE.msgs[k]) IDE.msgs[k]._stepsOpen = !sm.parentElement.open; return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ctx != null) return $('#cctx').click();
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
        b.disabled = true; await apply(c, IDE.msgs[ref[0]]);
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
        for (const dp of dels) { await delFile(dp); dropFile(dp); }
        delete msg._prev; msg.applied = null; saveApplied(msg); refresh(); drawAI(); toast('ย้อนกลับไฟล์เรียบร้อย', 'ok'); return;
      }
      if (b.dataset.applyall) { b.disabled = true; const m = IDE.msgs[+b.dataset.applyall], bad = await applyChanges(changesOf(m.content, undefined, activeRef()), m); if (bad.length) toast(bad[0], 'bad'); }
    } catch (x) { $('#ce').textContent = x.message; drawAI(); }
  };
  drawAI();
  $('#localb').onclick = () => linkLocal().catch(x => toast(x.message, 'bad'));
  IDE.local = DESK ? await DESK.linked(lkey()).catch(() => null) : null; IDE.seen = null; localUI();
  if (IDE.local) { syncDisk(true); DESK.watch(lkey()); srvUI(); }
  const chats = await api('/chats?project=' + IDE.pid).catch(() => []); // เปิดแชตล่าสุดของโปรเจกต์
  ctxMeter();
  const want = qs().get('s'), sess = want === 'new' ? null : chats.find(c => c.id === +want) || (want ? null : chats[0]); // ?s= เลือก session · new = เริ่มใหม่
  if (sess) { IDE.chatId = sess.id; IDE.msgs = await api('/chats/' + IDE.chatId).catch(() => []); drawAI(); if (IDE.msgs.at(-1)?.role === 'user') codeSend({ resume: true }); }
  else if (prompt && IDE.pid === d.id) { // มาจากหน้าเริ่มโปรเจกต์: AI เริ่มทำตามที่พิมพ์ทันที
    openAI(true); const t = $('#ct'); t.value = prompt; t.dispatchEvent(new Event('input')); codeSend();
  }
}
addEventListener('beforeunload', e => { if (IDE.dirty.size) { saveNow(); e.preventDefault(); } });

// ตรวจหน้าเว็บจากไฟล์ในโปรเจกต์ (ไม่ต้องรัน): หาจุดที่ทำให้ช้า / ไม่ติด Google / ใช้ยากสำหรับผู้พิการ
function auditProject(files) {
  const html = [...files.keys()].filter(p => /\.html?$/i.test(p)).sort((a, b) => (b === 'index.html') - (a === 'index.html'));
  const out = { speed: [], seo: [], a11y: [] }; if (!html.length) return null;
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  for (const p of html) {
    const doc = new DOMParser().parseFromString(files.get(p), 'text/html'), at = html.length > 1 ? ` (${p})` : '';
    if (!doc.title?.trim()) out.seo.push('ไม่มี <title>' + at);
    else if (doc.title.length > 65) out.seo.push(`<title> ยาว ${doc.title.length} ตัวอักษร (ควรไม่เกิน 60)` + at);
    if (!doc.querySelector('meta[name=description]')?.content?.trim()) out.seo.push('ไม่มี meta description' + at);
    if (!doc.querySelector('meta[name=viewport]')) out.seo.push('ไม่มี meta viewport: มือถือจะแสดงผลเล็กผิดปกติ' + at);
    if (!doc.documentElement.getAttribute('lang')) out.a11y.push('<html> ไม่มี lang (เช่น lang="th")' + at);
    const h1 = doc.querySelectorAll('h1').length; if (h1 !== 1) out.seo.push(`มี <h1> ${h1} อัน (ควรมี 1 อัน)` + at);
    if (!doc.querySelector('meta[property="og:title"],meta[property="og:image"]')) out.seo.push('ไม่มี og:title / og:image: แชร์ลง Facebook/LINE ไม่มีรูปตัวอย่าง' + at);
    const noAlt = doc.querySelectorAll('img:not([alt])').length; if (noAlt) out.a11y.push(`รูป ${noAlt} รูปไม่มี alt` + at);
    const noLazy = [...doc.querySelectorAll('img')].slice(2).filter(i => i.getAttribute('loading') !== 'lazy').length; if (noLazy) out.speed.push(`รูป ${noLazy} รูปไม่ได้ใส่ loading="lazy"` + at);
    const blocking = [...doc.head?.querySelectorAll('script[src]:not([defer]):not([async]):not([type=module])') || []].length; if (blocking) out.speed.push(`สคริปต์ ${blocking} ไฟล์ใน <head> บล็อกการแสดงผล (ใส่ defer)` + at);
    const btn = [...doc.querySelectorAll('button,a')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt]')).length; if (btn) out.a11y.push(`ปุ่ม/ลิงก์ ${btn} อันไม่มีข้อความหรือ aria-label` + at);
    const inputs = [...doc.querySelectorAll('input:not([type=hidden]):not([type=submit]),select,textarea')].filter(i => !i.getAttribute('aria-label') && !(i.id && doc.querySelector(`label[for="${CSS.escape(i.id)}"]`)) && !i.closest('label')).length; if (inputs) out.a11y.push(`ช่องกรอก ${inputs} ช่องไม่มี label` + at);
    const ext = doc.querySelectorAll('script[src^="http"],link[rel=stylesheet][href^="http"]').length; if (ext > 4) out.speed.push(`โหลดไฟล์จากเว็บอื่น ${ext} ไฟล์` + at);
  }
  for (const [p, c] of files) { if (/^data:image/.test(c) && c.length > 300e3) out.speed.push(`รูป ${p} ใหญ่ ${kb(c.length * 0.75)} (ควรย่อให้ต่ำกว่า 200 KB)`); else if (/\.(js|css)$/.test(p) && c.length > 150e3) out.speed.push(`${p} ใหญ่ ${kb(c.length)}`); }
  const score = list => Math.max(0, 100 - list.length * 12);
  return { ...out, scores: { speed: score(out.speed), seo: score(out.seo), a11y: score(out.a11y) } };
}
function auditSheet() {
  const r = auditProject(IDE.files); if (!r) return toast('ไม่พบไฟล์ HTML ในโปรเจกต์', 'bad');
  const all = [...r.speed, ...r.seo, ...r.a11y], col = n => n >= 90 ? 'ok' : n >= 60 ? 'warn' : 'bad';
  const sec = (k, t) => `<div style="margin:10px 0"><b>${t}</b> <span class="pill ${col(r.scores[k])}">${r.scores[k]}</span>${r[k].length ? `<ul style="margin:6px 0 0;padding-left:20px;font-size:13px">${r[k].map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted" style="margin:4px 0 0;font-size:13px">ผ่านทุกข้อ</p>'}</div>`;
  sheet('ตรวจหน้าเว็บ', sec('speed', 'ความเร็ว') + sec('seo', 'SEO / แชร์ลงโซเชียล') + sec('a11y', 'การเข้าถึง') + (all.length ? '<button class="btn blue" id="aufix" style="width:100%;margin-top:8px">ให้ AI แก้ทั้งหมด</button>' : ''), (d, close) => {
    d.querySelector('#aufix')?.addEventListener('click', () => { close(); const ct = $('#ct'); ct.value = 'แก้ปัญหาจากการตรวจหน้าเว็บต่อไปนี้ โดยไม่เปลี่ยนหน้าตาและข้อความเดิม:\n' + all.map(x => '- ' + x).join('\n'); ct.oninput?.(); setPane('ai'); ct.focus(); });
  });
}
