// AstraCode: หน้าแชต
let chat = { id: null, msgs: [], busy: false, ctrl: null, images: [], files: [], chats: [], folders: [], compare: false, cmp: [], skills: JSON.parse(localStorage.getItem('skills') || '[]'), mcps: JSON.parse(localStorage.getItem('mcps') || '[]') };
// ── กัน deploy ไม่ครบคู่ (chat.js ใหม่ + app.js เก่า): ไม่ให้แชตพังเงียบ ──
// app.js ที่ตรงกันจะเป็นคนประกาศ parseAsk; ถ้าไม่มี ให้ใช้ตัวสำรองนี้แทน
if (typeof globalThis.parseAsk !== 'function') {
  const OPT_RE = /^(?:[-*•]|\d+[.)])\s+/;
  globalThis.parseAsk = function (content, streaming) {
    let s = String(content || ''); const asks = [];
    const block = (all, body) => {
      const lines = body.split('\n').map(x => x.trim()).filter(Boolean), q = lines.filter(x => !OPT_RE.test(x)).join(' ').slice(0, 400);
      const opts = lines.filter(x => OPT_RE.test(x)).map(x => x.replace(OPT_RE, '').slice(0, 120)).slice(0, 8);
      if (!q || asks.length >= 4) return all;
      asks.push({ q, opts }); return '';
    };
    s = s.replace(/```ask[ \t]*\n([\s\S]*?)```/g, block);
    const open = s.search(/```ask[ \t]*(\n|$)/);
    if (open >= 0 && !s.slice(open + 6).includes('```')) {
      if (streaming) s = s.slice(0, open);
      else { const rest = s.slice(open).replace(/^```ask[ \t]*\n?/, ''), kept = block(s.slice(open), rest); s = s.slice(0, open) + kept; }
    }
    const i = s.search(/(```(?:json)?\s*)?\{\s*"questions?"\s*:/);
    if (i >= 0) {
      const raw = s.slice(i).replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
      let o; try { o = JSON.parse(raw); } catch { return { text: (streaming ? s.slice(0, i) : s).trim(), asks }; }
      const list = (Array.isArray(o.questions) ? o.questions : [o]).filter(q => q && typeof q.question === 'string');
      const label = x => typeof x === 'string' ? x : x?.label ?? x?.text ?? x?.value ?? x?.title ?? '';
      if (list.length) { for (const q of list) asks.push({ q: q.question, opts: (q.options || q.choices || q.answers || []).map(label).filter(Boolean).slice(0, 8).map(String) }); s = s.slice(0, i); }
    }
    return { text: s.trim(), asks };
  };
}
// ฟังก์ชันที่ต้องมาจาก app.js — ถ้าขาด ให้ขึ้นใน console ว่าลงไฟล์ไม่ครบคู่ (ไม่ใช่พังเงียบ)
for (const k of ['setUrl', 'go', 'qs', 'here', 'pageName', 'limHTML', 'askHTML', 'askAnswer', 'withFiles', 'nearBottom', 'showPreview'])
  if (typeof globalThis[k] !== 'function') console.warn('[AstraCode] app.js ไม่มี ' + k + '() — deploy app.js ให้ตรงกับ chat.js');
let autoRetry = 0; // ลองซ้ำอัตโนมัติได้ครั้งเดียว กันวนไม่จบ
// กดหยุด = สั่งเซิร์ฟเวอร์หยุดตอบจริง (แค่ปิดจอหรือหลุดเน็ต AI จะตอบต่อเบื้องหลัง)
function stopRun() { if (chat.id) fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: chat.id }) }).catch(() => {}); chat.ctrl?.abort(); }
// สลับแชตโดยไม่โหลดหน้าใหม่
function openChat(id) { if (chat.busy) stopRun(); setUrl(id ? '/chat?id=' + id : '/chat'); chatView(id); }
addEventListener('popstate', () => { if (pageName() === 'chat') chatView(qs().get('id')); });
PAGES.chat = () => chatView(qs().get('id'));
function notice(u) {
  if (u.pct4h >= 100 || u.pctWeek >= 100)
    return `<div class="notice full">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)} <a class="btn blue sm" href="/plans">Upgrade</a></div>`;
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
  autoRetry = 0;
  for (const m of chat.msgs) if (typeof m.sources === 'string') try { m.sources = JSON.parse(m.sources); } catch { m.sources = null; }
  const saved = localStorage.getItem('model'), opt = sel => me.models.map(m => `<option value="${m.id}" ${String(m.id) === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  app.innerHTML = `<div class="chat view"><aside class="side" id="side">
      <div class="side-top">
        <a class="logo" href="/">AstraCode</a>
        <button type="button" class="icon-btn sm ghost" id="sbtn" aria-label="Search chats">${ic('search')}</button>
      </div>
      <div class="side-search" id="sbox" hidden><input id="search" placeholder="Search chats…" aria-label="Search chats"></div>
      <nav class="side-nav">
        <a href="/code">${ic('code')}<span>Code</span></a>
        <a href="/plans">${ic('layers')}<span>Plans · ${esc(me.plan.name)}</span></a>
        <a href="/pricing">${ic('tag')}<span>Pricing</span></a>
        <a href="/developers">${ic('braces')}<span>Developer API</span></a>
        <a href="/support">${ic('mail')}<span>Contact us</span></a>
        ${me.role === 'admin' ? `<a href="/admin">${ic('dash')}<span>Admin</span></a>` : ''}
      </nav>
      <div class="side-sec"><span>Folders &amp; recent</span><button type="button" class="icon-btn xs ghost" id="newf" aria-label="สร้างโฟลเดอร์ใหม่" title="สร้างโฟลเดอร์">${ic('plus')}</button></div>
      <div class="list" id="list"></div>
      <div class="side-foot">
        <a class="side-user" href="/account" title="${esc(me.email)}">
          <span class="av sm">${esc((me.email || 'A')[0].toUpperCase())}</span>
          <span class="su-t"><b>${esc(me.email.split('@')[0])}</b><small>${esc(me.plan.name)}</small></span>
        </a>
        <a class="btn-new-chat" href="/chat" data-chat="">${ic('plus', 'sm')} New chat</a>
      </div>
    </aside>
    <div class="main"><div class="bar"><button class="menu-btn" id="menu" aria-label="เมนู">${ic('menu')}</button>
      <div class="ctitle"><b id="ctl">Chat</b><small id="ctok"></small></div>
      <button class="lim" id="lim" aria-label="ลิมิตการใช้งาน"></button>
      <a class="icon-btn sm" href="/chat" data-new aria-label="แชตใหม่">${ic('newchat')}</a>
      <select id="model" hidden>${me.models.length > 1 ? `<option value="auto" ${saved === 'auto' || !saved ? 'selected' : ''}>อัตโนมัติ</option>` : ''}${opt(saved)}</select><select id="model2" hidden>${opt(localStorage.getItem('model2'))}</select>
      <select id="effort" hidden>${EFFORTS.map(([v]) => `<option value="${v}" ${v === (localStorage.getItem('effort') || '') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="msgs" id="msgs"></div>
      <div class="compose"><button type="button" class="scroll-fab" id="sdown" hidden aria-label="เลื่อนลงล่างสุด">${ic('down')}</button><div id="notice">${notice(me.usage)}</div><div class="err" id="e"></div><div class="thumbs" id="thumbs"></div>
        <form id="f" class="cbox"><input type="file" id="file" multiple hidden>
          <textarea id="t" rows="1" placeholder="ถามอะไรก็ได้ · พิมพ์ / เลือก Skill" aria-label="ข้อความ"></textarea>
          <div id="flags" class="cflags"></div><div class="crow"><button type="button" class="cb" id="plus" aria-label="แนบไฟล์และเครื่องมือ">${ic('plus')}</button>${('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? `<button type="button" class="cb" id="mic" aria-label="พิมพ์ด้วยเสียง">${ic('mic')}</button>` : ''}
            <button type="button" class="cb pick" id="mdl" aria-haspopup="dialog"></button>
            <button type="button" class="cb pick" id="mdl2" aria-haspopup="dialog" hidden></button>
            <button type="button" class="cb pick" id="eff" aria-haspopup="dialog"></button>
            
            <button class="send" id="go" aria-label="ส่ง">${ic('up')}</button></div></form></div></div>
    <aside class="canvas" id="canvas" hidden>
      <div class="cv-h"><b>Canvas</b><div class="seg" style="margin:0"><button type="button" data-cv="prev" class="on">Preview</button><button type="button" data-cv="code">Code</button></div><span class="sp"></span><button type="button" class="btn out sm" id="cv-cp">Copy</button><button type="button" class="icon-btn sm ghost" id="cv-x" aria-label="ปิด Canvas">${ic('x')}</button></div>
      <div class="cv-b"><iframe id="cv-f" sandbox="allow-scripts allow-modals allow-forms allow-popups" title="Canvas Preview"></iframe><pre id="cv-c" hidden><code></code></pre></div>
    </aside></div>`;
  const side = $('#side');
  side.addEventListener('click', e => { const a = e.target.closest('a[data-chat]'); if (!a) return; e.preventDefault(); openChat(+a.dataset.chat || null); });
  $('#menu').onclick = () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; side.parentElement.append(s); }; // ใส่ในกล่องเดียวกับเมนู ไม่งั้นเงาจะทับเมนู
  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };
  $('#effort').onchange = e => { localStorage.setItem('effort', e.target.value); modelUI(); };
  $('#model2').onchange = e => { localStorage.setItem('model2', e.target.value); modelUI(); };
  $('#mdl').onclick = () => modelSheet('#model');
  $('#mdl2').onclick = () => modelSheet('#model2');
  $('#eff').onclick = () => effortSheet('#effort', curModel());
  $('#plus').onclick = toolSheet;
  $('#mic')?.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast('เบราว์เซอร์นี้ไม่รองรับพิมพ์ด้วยเสียง ลอง Chrome หรือ Safari', 'err');
    const btn = $('#mic');
    if (chat.rec) { chat.rec.stop(); return; }
    const rec = new SR(); rec.lang = LOC; rec.interimResults = true; chat.rec = rec;
    const base = t.value ? t.value + ' ' : '';
    btn.classList.add('rec');
    rec.onresult = e => { t.value = base + [...e.results].map(r => r[0].transcript).join(''); t.oninput(); };
    rec.onerror = e => { const m = { 'not-allowed': 'ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ที่การตั้งค่าเบราว์เซอร์แล้วลองใหม่', 'service-not-allowed': 'ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ที่การตั้งค่าเบราว์เซอร์แล้วลองใหม่', 'no-speech': 'ไม่ได้ยินเสียง ลองพูดอีกครั้ง', 'audio-capture': 'ไม่พบไมโครโฟน', 'network': 'พิมพ์ด้วยเสียงใช้ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' }[e.error]; if (m) toast(m, 'err'); };
    rec.onend = () => { chat.rec = null; btn.classList.remove('rec'); };
    try { rec.start(); } catch { chat.rec = null; btn.classList.remove('rec'); toast('เริ่มพิมพ์ด้วยเสียงไม่ได้ ลองใหม่อีกครั้ง', 'err'); }
  });
  $('#lim').onclick = limitSheet;
  $('#flags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'web') toggleWeb(); if (f === 'cmp') toggleCompare(); if (f === 'sk') { chat.skills = chat.skills.filter(x => x !== +e.target.closest('[data-sid]').dataset.sid); localStorage.setItem('skills', JSON.stringify(chat.skills)); modelUI(); }
    if (f === 'mc') { chat.mcps = chat.mcps.filter(x => x !== +e.target.closest('[data-mid]').dataset.mid); localStorage.setItem('mcps', JSON.stringify(chat.mcps)); modelUI(); } };
  app.querySelector('[data-new]').onclick = e => { e.preventDefault(); openChat(null); };
  $('#newf').onclick = async () => { const name = await promptSheet('ตั้งชื่อโฟลเดอร์ใหม่', '', { title: 'สร้างโฟลเดอร์', ok: 'Create' }); if (name?.trim()) { await api('/folders', { method: 'POST', body: { name } }); Promise.all([loadSkills(), loadMcps()]).then(() => modelUI()); loadSide(); toast('สร้างโฟลเดอร์แล้ว', 'ok'); } };
  $('#sbtn').onclick = () => { const b = $('#sbox'); b.hidden = !b.hidden; if (!b.hidden) $('#search').focus(); else { $('#search').value = ''; chat.hits = null; drawSide(); } };
    let srchT = null;
  $('#search').oninput = () => {
    drawSide();
    clearTimeout(srchT);
    const q = $('#search').value.trim();
    if (q.length < 2) { chat.hits = null; return drawSide(); }
    srchT = setTimeout(async () => {
      chat.hits = await api('/chats/search?q=' + encodeURIComponent(q)).catch(() => []);
      if ($('#search')?.value.trim() === q) drawSide();
    }, 250);
  };
  $('#cv-x').onclick = () => { $('#canvas').hidden = true; };
  $('#cv-cp').onclick = e => copy(chat.cvCode || '', e.target);
  app.querySelectorAll('[data-cv]').forEach(b => b.onclick = () => {
    app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x === b));
    const isCode = b.dataset.cv === 'code';
    $('#cv-f').hidden = isCode; $('#cv-c').hidden = !isCode;
  });
  const t = $('#t');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  slashSkills(t, () => chat.skills, ids => { chat.skills = ids; localStorage.setItem('skills', JSON.stringify(ids)); modelUI(); });
  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } };
  $('#f').onsubmit = e => { e.preventDefault(); chat.busy ? stopRun() : send(); };
  $('#file').onchange = async e => { await addFiles([...e.target.files]); e.target.value = ''; };
  const comp = $('.compose'); // ลากไฟล์มาวาง / วางรูปจากคลิปบอร์ด
  comp.ondragover = e => { e.preventDefault(); comp.classList.add('drop'); };
  comp.ondragleave = () => comp.classList.remove('drop');
  comp.ondrop = e => { e.preventDefault(); comp.classList.remove('drop'); addFiles([...e.dataTransfer.files]); };
  t.onpaste = e => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
  const answer = e => { const a = askAnswer(e); if (a != null && !chat.busy) { e.preventDefault?.(); t.value = a; t.oninput(); send(); } return a != null; };
  $('#msgs').onkeydown = answer;
  $('#msgs').onscroll = () => { const b = $('#msgs'), sd = $('#sdown'); if (b && sd) sd.hidden = nearBottom(b); };
  $('#sdown').onclick = () => { const b = $('#msgs'); b?.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); };
  $('#msgs').onclick = e => {
    if (answer(e)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp-code')) copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.classList.contains('run-code')) openCanvas(b.closest('.code').querySelector('code').textContent);
    if (b.dataset.edit != null) editMsg(+b.dataset.edit);
    if (b.dataset.mem != null) remember(chat.msgs[+b.dataset.mem], b);
    if (b.dataset.rem != null) remember({ content: parseMem(chat.msgs[+b.dataset.rem].content).mem }, b);
    if (b.dataset.copy) copy(chat.msgs[+b.dataset.copy].content, b);
    if (b.dataset.vote != null) { const m = chat.msgs[+b.dataset.vote], v = m.vote === +b.dataset.v ? 0 : +b.dataset.v; api('/feedback', { method: 'POST', body: { message_id: m.id, vote: v } }).then(() => { m.vote = v || null; renderAll(); }).catch(x => toast(x.message, 'bad')); }
    if (b.dataset.report != null) reportMsg(chat.msgs[+b.dataset.report]);
    if (b.dataset.regen != null) send({ regenerate: true });
    if (b.dataset.s != null) { t.value = SUGGEST[+b.dataset.s]; t.focus(); t.oninput(); }
  };
  $('#lim').innerHTML = limHTML(me.usage); modelUI(); renderAll(); loadSide();
  if (chat.id && chat.msgs.at(-1)?.role === 'user') send({ resume: true }); // ข้อความล่าสุดยังไม่มีคำตอบ: ต่อสตรีมที่ AI ยังทำอยู่
}

function openCanvas(code) {
  const cv = $('#canvas'); if (!cv) return showPreview(code);
  chat.cvCode = code;
  const html = /^\s*<svg/i.test(code) ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body>` : code;
  cv.hidden = false;
  app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x.dataset.cv === 'prev'));
  $('#cv-f').hidden = false; $('#cv-c').hidden = true;
  $('#cv-c code').innerHTML = hlCode(code);
  const f = $('#cv-f');
  if (window.DEMO) f.srcdoc = html;
  else {
    if (chat.cvMsg) removeEventListener('message', chat.cvMsg);
    chat.cvMsg = e => { if (e.source === f.contentWindow && e.data?.ready) { f.contentWindow.postMessage({ html }, '*'); removeEventListener('message', chat.cvMsg); chat.cvMsg = null; } };
    addEventListener('message', chat.cvMsg);
    f.src = '/preview.html';
  }
}

// คำทักหน้าแชตว่าง: สุ่มทุกครั้งที่เปิด
const HELLO = ['วันนี้ให้ช่วยอะไรดี', 'ว่ามา เดี๋ยวปั่นให้', 'สมองพร้อม นิ้วพร้อม รอแค่โจทย์', 'เมนูวันนี้: ถามมาเลย เสิร์ฟไว', 'อยากรู้อะไร ถามได้ ไม่คิดตังค์ค่าสงสัย', 'โหมดเทพเปิดอยู่ มีอะไรให้ซัด', 'พิมพ์มาเลย เดี๋ยวคิดให้ครึ่งนึง (ล้อเล่น คิดให้หมด)', 'วันนี้จะเขียนโค้ด แปลภาษา หรือแค่คุยเล่น', 'ถามมาเลย ไม่มีคำถามโง่ มีแต่คำตอบเด้งๆ', 'ว่างอยู่พอดี มีอะไรให้ช่วยไหม', 'ใส่โจทย์ลงไป เดี๋ยวจัดให้ตามสั่ง', 'เริ่มจากตรงไหนดี เล่ามาเลย'];
function modelUI() {
  const m = curModel(), m2 = me.models.find(x => x.id === +$('#model2').value);
  $('#mdl').innerHTML = `${m ? vendorLogo(m.name, 'xs') : ''}<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
  $('#mdl2').hidden = !chat.compare; $('#mdl2').innerHTML = `${m2 ? vendorLogo(m2.name, 'xs') : ''}<span>vs ${esc(m2?.name || '')}</span>${ic('down', 'sm')}`;
  const efs = modelEfforts(m);
  $('#eff').hidden = !efs.length;
  if (efs.length && !efs.includes($('#effort').value)) $('#effort').value = efs[0];
  $('#eff').innerHTML = `${ic('sparkles', 'sm')}${(EFFORT_INFO[$('#effort').value] || EFFORT_INFO[''])[0]}${ic('down', 'sm')}`;
  $('#flags').innerHTML = (localStorage.getItem('web') === '1' && site.search ? `<button type="button" class="flag" data-flag="web" aria-label="ปิดค้นเว็บ">${ic('globe', 'sm')}ค้นเว็บ${ic('x', 'sm')}</button>` : '')
    + (chat.compare ? `<button type="button" class="flag" data-flag="cmp" aria-label="ปิดโหมดเทียบ">${ic('compare', 'sm')}เทียบ${ic('x', 'sm')}</button>` : '')
    + (chat.skills.length && _skillsCache ? chat.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-flag="sk" data-sid="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
    + (chat.mcps.length && _mcpCache ? chat.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-flag="mc" data-mid="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); showErr('โมเดลนี้อ่านรูปไม่ได้ จึงเอารูปออกแล้ว'); }
}
// ปุ่ม +: แผ่นล่างแบบ "ทางลัดแถวบน + รายการไอคอนพร้อมคำอธิบาย" · ชื่อเป็นอังกฤษ คำอธิบายเป็นไทย
const toolRow = (v, icon, title, desc, on) => `<button type="button" class="trow ${on ? 'on' : ''}" data-v="${v}"><span class="tico">${ic(icon)}</span><span class="tbody"><b>${title}</b><small>${desc}</small></span>${on ? `<i class="tchk">${ic('check')}</i>` : ''}</button>`;
function toolSheet() {
  const web = localStorage.getItem('web') === '1', vision = curModel()?.vision;
  sheet('Add', `<div class="tquick">
      <button type="button" class="tq" data-v="photos">${ic('image')}<span>Photos</span></button>
      <button type="button" class="tq" data-v="camera">${ic('camera')}<span>Camera</span></button>
      <button type="button" class="tq" data-v="file">${ic('clip')}<span>Files</span></button>
    </div>
    ${vision ? '' : '<p class="tnote">โมเดลที่เลือกอ่านรูปไม่ได้ · เลือกโมเดลที่มีไอคอนตา (เช่น Claude) ถ้าจะส่งรูป</p>'}
    <div class="tlist">
      ${site.image ? toolRow('img', 'palette', 'Create image', 'พิมพ์สิ่งที่อยากได้ แล้วให้ AI วาดให้') : ''}
      ${site.search ? toolRow('web', 'globe', 'Web search', 'หาข้อมูลล่าสุดพร้อมแหล่งอ้างอิง', web) : ''}
      ${toolRow('cmp', 'compare', 'Compare 2 models', 'ถามครั้งเดียว ได้คำตอบจาก 2 โมเดล', chat.compare)}
      ${toolRow('prm', 'book', 'Prompt library', 'คำสั่งสำเร็จรูป เลือกแล้วใช้ได้เลย')}
      ${toolRow('skl', 'sparkles', 'Skills', 'สอนวิธีทำงานให้ AI · เปิดปิดหรือสร้างเอง')}
      ${toolRow('mcp', 'server', 'Connect apps', 'ต่อ GitHub, Notion, n8n ผ่าน Remote MCP')}
      ${toolRow('exp', 'download', 'Export chat', 'บันทึกเป็น Markdown หรือ PDF')}
    </div>`,
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); const pick = (accept, capture) => { const i = $('#file'); i.accept = accept; if (capture) i.setAttribute('capture', capture); else i.removeAttribute('capture'); i.click(); setTimeout(() => { i.accept = ''; i.removeAttribute('capture'); }, 1000); }; // ใช้ช่องไฟล์เดียวกัน เปลี่ยนแค่ชนิดที่เลือกได้
      ({ photos: () => pick('image/*'), camera: () => pick('image/*', 'environment'), file: () => pick(''), img: genImage, web: toggleWeb, cmp: toggleCompare, mcp: () => mcpSheet(chat.mcps, ids => { chat.mcps = ids; localStorage.setItem('mcps', JSON.stringify(ids)); modelUI(); }), skl: () => skillsSheet(chat.skills, ids => { chat.skills = ids; localStorage.setItem('skills', JSON.stringify(ids)); modelUI(); }), prm: () => promptLibSheet(p => { const t = $('#t'); t.value = p + t.value; t.oninput(); t.focus(); }), exp: exportMenu })[b.dataset.v]();
    }));
}
function toggleWeb() { localStorage.setItem('web', localStorage.getItem('web') === '1' ? '0' : '1'); modelUI(); }
function toggleCompare() {
  if (chat.busy) return; chat.compare = !chat.compare;
  const m2 = $('#model2'); if (chat.compare && $('#model').value === 'auto') $('#model').value = me.models[0].id; if (chat.compare && m2.value === $('#model').value) m2.value = me.models.find(m => String(m.id) !== $('#model').value)?.id ?? m2.value; // ตั้งต้นให้ต่างจากตัวแรก
  modelUI(); renderAll();
}
async function loadSide() { [chat.chats, chat.folders] = await Promise.all([api('/chats').catch(() => []), api('/folders').catch(() => [])]); drawSide(); head(); }
// หัวแชต: ชื่อ + context ที่ใช้
function head() {
  const ctl = $('#ctl'); if (!ctl) return;
  ctl.textContent = chat.compare ? 'เทียบ 2 โมเดล' : chat.chats.find(c => c.id === chat.id)?.title || 'Chat';
  // แถบ context: ใช้ไปเท่าไรจากขนาด context ของโมเดล (จากคำตอบล่าสุด) · เกิน 70% มีปุ่มย่อแชต
  const cx = !chat.compare && chat.ctx?.id === chat.id ? chat.ctx : null, pct = cx ? Math.min(100, Math.round(cx.used / cx.max * 100)) : 0;
  $('#ctok').innerHTML = cx ? `<span class="ctxm ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}" title="context ที่ใช้ในคำตอบล่าสุด เทียบกับขนาด context ของโมเดล">context ${kTok(cx.used)} / ${kTok(cx.max)} (${pct}%)</span>${pct >= 70 && chat.id ? ' <button type="button" class="linkb" id="cmpct">ย่อแชต</button>' : ''}` : '';
  const cb = $('#cmpct'); if (cb) cb.onclick = async () => { cb.disabled = true; cb.textContent = 'กำลังย่อ...'; try { const r = await api(`/chats/${chat.id}/compact`, { method: 'POST' }); toast(r.ok ? 'ย่อแชตแล้ว ข้อความเก่าถูกสรุปไว้' : 'แชตยังสั้นเกินกว่าจะย่อ', r.ok ? 'ok' : ''); if (r.ok) chat.ctx = null; } catch (x) { toast(x.message, 'bad'); } head(); };
}
const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
function drawSide() {
  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;
  const item = c => `<div class="item ${c.id === chat.id ? 'on' : ''}" data-id="${c.id}"><a href="/chat?id=${c.id}" data-chat="${c.id}">${ic(c.pinned ? 'pin' : c.has_code ? 'code' : 'msg', 'sm ci')}<span>${esc(c.title)}</span></a>
    <button data-cmenu="${c.id}" aria-label="ตัวเลือกแชต">${ic('more')}</button></div>`;
  const shown = chat.chats.filter(c => c.title.toLowerCase().includes(q)), open = JSON.parse(localStorage.getItem('fopen') || '{}');
  const pinned = shown.filter(c => c.pinned && !chat.folders.some(f => f.id === c.folder_id));
  const recent = shown.filter(c => !c.pinned && !chat.folders.some(f => f.id === c.folder_id));
  list.innerHTML = (pinned.length ? `<div class="side-sub">ปักหมุด</div>${pinned.map(item).join('')}` : '')
    + chat.folders.map(f => { const cs = shown.filter(c => c.folder_id === f.id); return q && !cs.length ? '' : `<details class="folder" data-f="${f.id}" ${open[f.id] || q ? 'open' : ''}><summary><span>${ic('folder')} ${esc(f.name)}</span><small class="muted">${cs.length}</small><button data-fren="${f.id}" aria-label="เปลี่ยนชื่อโฟลเดอร์">${ic('pen')}</button><button data-fdel="${f.id}" aria-label="ลบโฟลเดอร์">${ic('trash')}</button></summary>${cs.map(item).join('') || '<p class="muted" style="padding:4px 12px;font-size:13px">ว่าง</p>'}</details>`; }).join('')
    + (recent.map(item).join('') || (chat.chats.length ? '' : '<p class="muted" style="padding:8px 12px">ยังไม่มีแชต</p>'))
    + (q && chat.hits?.length ? `<div class="side-sub">ในข้อความ</div>${chat.hits.map(h => `<div class="item hit"><a href="/chat?id=${h.chat_id}" data-chat="${h.chat_id}">${ic('msg', 'sm ci')}<span><b>${esc(h.title)}</b><small>${esc(h.snippet)}</small></span></a></div>`).join('')}` : '');
  list.querySelectorAll('details.folder').forEach(d => d.ontoggle = () => { const o = JSON.parse(localStorage.getItem('fopen') || '{}'); o[d.dataset.f] = d.open; localStorage.setItem('fopen', JSON.stringify(o)); });
  list.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const d = b.dataset;
    if (d.cmenu) {
      const c = chat.chats.find(x => x.id === +d.cmenu); if (!c) return;
      sheet(c.title, optHTML('pin', ic('pin') + (c.pinned ? 'เลิกปักหมุด' : 'ปักหมุดแชต'), 'แสดงไว้ด้านบนสุดของรายการ')
        + optHTML('shr', ic('share') + 'แชร์ลิงก์แชต', c.share_token ? 'คัดลอกหรือยกเลิกลิงก์แชร์' : 'สร้างลิงก์อ่านอย่างเดียวให้เพื่อนดูได้')
        + optHTML('ren', ic('pen') + 'เปลี่ยนชื่อแชต', 'แก้ไขชื่อที่แสดงในแถบด้านข้าง')
        + optHTML('mv', ic('folder') + 'ย้ายไปโฟลเดอร์', c.folder_id ? 'เปลี่ยนหรือเอาออกจากโฟลเดอร์' : 'จัดเก็บเข้าโฟลเดอร์')
        + optHTML('del', ic('trash') + 'ลบแชตนี้', 'ลบข้อความทั้งหมดในแชตนี้อย่างถาวร'), (sd, close) => {
        sd.querySelector('[data-v=pin]').onclick = async () => { close(); await api('/chats/' + c.id, { method: 'PUT', body: { pinned: c.pinned ? 0 : 1 } }); loadSide(); toast(c.pinned ? 'เลิกปักหมุดแล้ว' : 'ปักหมุดแล้ว', 'ok'); };
        sd.querySelector('[data-v=shr]').onclick = async () => {
          close();
          const r = await api(`/chats/${c.id}/share`, { method: 'POST' });
          const link = `${location.origin}/share?t=${r.share_token}`;
          sheet('แชร์แชต', `<div class="sheet-form"><p class="sheet-msg">ใครที่มีลิงก์นี้สามารถอ่านแชตนี้ได้ (แก้ไขไม่ได้)</p><input readonly value="${esc(link)}" id="shl"><div class="sheet-acts"><button type="button" class="btn red" data-rev>Stop sharing</button><button type="button" class="btn blue" data-cp>Copy link</button></div></div>`, (d2, c2) => {
            d2.querySelector('[data-cp]').onclick = () => { navigator.clipboard?.writeText(link); c2(); toast('คัดลอกลิงก์แชร์แล้ว', 'ok'); };
            d2.querySelector('[data-rev]').onclick = async () => { await api(`/chats/${c.id}/share`, { method: 'DELETE' }); c2(); loadSide(); toast('ยกเลิกลิงก์แชร์แล้ว'); };
          });
        };
        sd.querySelector('[data-v=ren]').onclick = async () => { close(); const title = await promptSheet('ชื่อแชตใหม่', c.title, { title: 'เปลี่ยนชื่อแชต' }); if (title?.trim()) { await api('/chats/' + c.id, { method: 'PUT', body: { title } }); loadSide(); } };
        sd.querySelector('[data-v=mv]').onclick = () => {
          close();
          if (!chat.folders.length) return toast('ยังไม่มีโฟลเดอร์ กด "+ โฟลเดอร์" ก่อน');
          sheet('ย้ายไปโฟลเดอร์', optHTML('', ic('x') + 'ไม่มีโฟลเดอร์', 'แสดงนอกโฟลเดอร์', !c.folder_id)
            + chat.folders.map(f => optHTML(f.id, ic('folder') + esc(f.name), '', c.folder_id === f.id)).join(''), (fd, fclose) => {
            fd.querySelectorAll('[data-v]').forEach(x => x.onclick = async () => { fclose(); await api('/chats/' + c.id, { method: 'PUT', body: { folder_id: +x.dataset.v || null } }); loadSide(); toast('ย้ายแชตแล้ว', 'ok'); });
          });
        };
        sd.querySelector('[data-v=del]').onclick = async () => { close(); if (!await confirmSheet(`ลบแชต "${c.title}" อย่างถาวร?`, { title: 'ลบแชต', ok: 'Delete', danger: true })) return; await api('/chats/' + c.id, { method: 'DELETE' }); if (chat.id === c.id) openChat(null); else loadSide(); toast('ลบแชตแล้ว'); };
      });
    }
    if (d.fren) { const f = chat.folders.find(x => x.id === +d.fren), name = await promptSheet('ชื่อโฟลเดอร์ใหม่', f.name, { title: 'เปลี่ยนชื่อโฟลเดอร์' }); if (name?.trim()) { await api('/folders/' + f.id, { method: 'PUT', body: { name } }); loadSide(); } }
    if (d.fdel) { if (!await confirmSheet('ลบโฟลเดอร์นี้? แชตข้างในจะย้ายออกมา ไม่ถูกลบ', { title: 'ลบโฟลเดอร์', ok: 'Delete folder', danger: true })) return; await api('/folders/' + d.fdel, { method: 'DELETE' }); loadSide(); }
  };
}
// บล็อก ```remember ที่ AI เสนอให้จำ → แยกออกจากข้อความ แสดงเป็นปุ่มให้ผู้ใช้กดยืนยัน (ไม่บันทึกเอง)
// บล็อก ```image ที่ AI สั่งสร้างรูป → ซ่อนจากข้อความ แล้วให้หน้าเว็บสร้างรูปใต้คำตอบเอง
function parseImg(content, streaming) {
  let s = String(content || ''), prompt = '';
  s = s.replace(/```image[ \t]*\n([\s\S]*?)```/g, (_, b) => { prompt ||= b.trim().slice(0, 1500); return ''; });
  const open = s.search(/```image/);
  if (open >= 0) s = s.slice(0, open);
  else if (streaming) s = s.replace(/`{1,3}(?:i(?:m(?:a(?:g(?:e)?)?)?)?)?$/, '');
  return { text: s.trim(), prompt };
}
function parseMem(content, streaming) {
  let s = String(content || ''), mem = '';
  s = s.replace(/```remember[ \t]*\n([\s\S]*?)```/g, (_, b) => { mem ||= b.trim().slice(0, 200); return ''; });
  const open = s.search(/```remember/);
  if (open >= 0) s = s.slice(0, open);
  else if (streaming) s = s.replace(/`{1,3}(?:r(?:e(?:m(?:e(?:m(?:b(?:er?)?)?)?)?)?)?)?$/, ''); // ครึ่งรั้วที่ยังพิมพ์ไม่จบ
  return { text: s.trim(), mem };
}
async function reportMsg(m) {
  const reason = await promptSheet('บอกสั้นๆ ว่าคำตอบนี้มีปัญหาอะไร (ไม่เหมาะสม ผิดกฎหมาย ข้อมูลผิด ฯลฯ)', '', { title: 'รายงานคำตอบนี้', ok: 'Send', placeholder: 'เหตุผล' });
  if (reason == null) return;
  try { await api('/report', { method: 'POST', body: { message_id: m.id, reason } }); toast('ส่งรายงานแล้ว ขอบคุณครับ', 'ok'); } catch (x) { toast(x.message, 'bad'); }
}
async function remember(m, btn) {
  const text = await promptSheet('ให้ AI จำเรื่องนี้ไว้ในทุกแชต (แก้ได้)', m.content.replace(FILE_RE, '').trim().slice(0, 300), { title: 'บันทึกความจำ', ok: 'Remember' });
  if (!text?.trim()) return;
  try { await api('/memories', { method: 'POST', body: { text } }); btn.textContent = 'จำแล้ว ✓'; toast('บันทึกความจำแล้ว', 'ok'); } catch (x) { toast(x.message, 'bad'); }
}
function exportMenu() {
  const title = chat.chats.find(c => c.id === chat.id)?.title || 'แชต AstraCode';
  if (!chat.msgs.length) return toast('ยังไม่มีข้อความให้ส่งออก');
  sheet('ส่งออกแชต', optHTML('md', ic('filetext') + 'Markdown (.md)', 'บันทึกเป็นไฟล์ข้อความพร้อมจัดรูปแบบ')
    + optHTML('pdf', ic('download') + 'PDF (พิมพ์)', 'เปิดหน้าพิมพ์ / บันทึกเป็น PDF'), (d, close) => {
    d.querySelector('[data-v=pdf]').onclick = () => { close(); document.body.classList.add('printing'); print(); setTimeout(() => document.body.classList.remove('printing'), 500); };
    d.querySelector('[data-v=md]').onclick = () => {
      close();
  const md_ = `# ${title}\n\n` + chat.msgs.map(m => m.role === 'user'
    ? `## คุณ\n\n${m.content.replace(FILE_RE, (_, n) => `\n📄 ${n}`).trim()}`
    : `## AI${m.model ? ` (${m.model})` : ''}\n\n${m.content}${m.sources?.length ? '\n\nแหล่งที่มา:\n' + m.sources.map(s => `- [${s.title}](${s.url})`).join('\n') : ''}`).join('\n\n---\n\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md_], { type: 'text/markdown' }));
  a.download = title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
  });
}
async function genImage(auto, silent) { // auto = คำบรรยายที่ AI เขียนเอง (silent: ไม่มีข้อความฝั่งผู้ใช้)
  if (chat.busy) return;
  if (chat.compare) return showErr('ปิดโหมดเทียบก่อนสร้างรูป');
  const t = $('#t'), prompt_ = typeof auto === 'string' ? auto : t.value.trim() || await promptSheet('บรรยายรูปที่ต้องการสร้าง', '', { title: 'สร้างรูปด้วย AI', placeholder: 'เช่น แมวส้มใส่แว่นกันแดด สไตล์อนิเมะ', ok: 'Generate image' });
  if (!prompt_?.trim()) return;
  if (!silent) { t.value = ''; t.style.height = 'auto'; $('#e').textContent = ''; chat.msgs.push({ role: 'user', content: '🎨 ' + prompt_ }); appendMsg(chat.msgs.at(-1)); }
  const ai = { role: 'assistant', content: '', model: 'สร้างรูป', streaming: true }; chat.msgs.push(ai); appendMsg(ai);
  setBusy(true);
  try { const r = await api('/image', { method: 'POST', body: { prompt: prompt_, chat_id: chat.id, silent: !!silent } }); ai.content = `![${prompt_.slice(0, 80).replace(/[\[\]\s]+/g, ' ').trim()}](${r.src})`; setUsage(r.usage); }
  catch (x) { if (silent) chat.msgs.pop(); else { chat.msgs.splice(-2, 2); t.value = prompt_; } showErr(x.message); }
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
      ${i >= 0 && !m.content.startsWith('🎨') ? `<div class="acts">${m.id && !chat.busy ? `<button data-edit="${i}">${ic('pen', 'sm')} Edit</button>` : ''}<button data-mem="${i}">Remember</button></div>` : ''}</div>`;
  }
  const last = i === chat.msgs.length - 1;
  const { text: t00, mem } = parseMem(m.content, m.streaming), { text: t0 } = parseImg(t00, m.streaming), { text, asks } = parseAsk(t0, m.streaming);
  const mcpH = m.mcps?.length ? `<div class="steps-bar mcp-live" style="cursor:default">${ic('server', 'sm')}<span>${m.mcps.map(x => esc(x.tool)).join(', ')}</span></div>` : '';
  return `<div class="msg ai ${isNew ? 'new' : ''}">${hasSegs(m) ? '' : thinkHTML(m)}${mcpH}<div class="b">${hasSegs(m) ? segHTML(m, text) : text ? md(text) : m.thinking || asks.length ? '' : waitHTML(m)}</div>${askHTML(asks, last && !m.streaming)}${mem ? `<div class="acts"><button data-rem="${i}">${ic('plus', 'sm')} จำไว้: ${esc(mem)}</button></div>` : ''}${sourcesHTML(m)}
    ${m.note ? `<div class="mnote">${esc(m.note)}</div>` : ''}
    ${m.streaming ? '' : `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${i < 0 ? '' : `<button data-copy="${i}">Copy</button>${m.id ? `<button data-vote="${i}" data-v="1" class="${m.vote === 1 ? 'on' : ''}" aria-label="คำตอบดี" aria-pressed="${m.vote === 1}">👍</button><button data-vote="${i}" data-v="-1" class="${m.vote === -1 ? 'on' : ''}" aria-label="คำตอบไม่ดี" aria-pressed="${m.vote === -1}">👎</button><button data-report="${i}" aria-label="รายงานคำตอบนี้">Report</button>` : ''}${last && !chat.busy ? '<button data-regen>Regenerate</button>' : ''}`}${tokHTML(m)}</div>`}</div>`;
}
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
    : `<div class="empty"><div class="stat">${esc(HELLO[Math.floor(Math.random() * HELLO.length)])}</div><div>เลือกโมเดลที่มุมซ้ายล่าง แล้วพิมพ์ได้เลย</div>
       <div class="chips">${['อธิบายให้เข้าใจง่าย', 'ช่วยเขียนโค้ด', 'สรุปข้อความ', 'แปลภาษา'].map((s, i) => `<button data-s="${i}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight; head(); renderRich(box);
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
  // retry: true = เดาให้ว่าควรทำอะไรต่อ (มีคำถามค้าง → ต่อคำตอบ, ไม่มี → ตอบใหม่) หรือส่งฟังก์ชันมาเอง
  const fn = typeof retry === 'function' ? retry
    : retry ? () => (chat.id && chat.msgs.at(-1)?.role === 'user' ? send({ resume: true }) : send({ regenerate: true })) : null;
  $('#e').innerHTML = esc(msg) + (fn ? ' <button class="btn out sm" id="retry">Try again</button>' : '');
  const b = $('#retry'); if (b) b.onclick = () => { $('#e').textContent = ''; fn(); };
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
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
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
        if (d.mcp) { (ai.mcps ||= []).push(d.mcp); if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); }
      if (d.t || d.th) { onStreamEvent(m, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; const e = el(); if (e) paintStreaming(e, m); }); }
        if (d.error) m.content += `\n\n**ข้อผิดพลาด:** ${d.error}`;
        if (d.tok) { m.tin = d.tok.in; m.tout = d.tok.out; }
        if (d.done) { setUsage(d); if (d.mid) m.id = d.mid; }
      });
    } catch (x) { if (x.name !== 'AbortError') m.content += `ข้อผิดพลาด: ${x.message}`; }
    cancelAnimationFrame(raf); m.streaming = false;
  }));
  setBusy(false); renderAll();
}
async function editMsg(idx) {
  if (chat.busy) return;
  const m = chat.msgs[idx]; if (!m?.id) return;
  const raw = m.content.replace(FILE_RE, '').trim();
  const next = await promptSheet('แก้ไขข้อความแล้วให้ AI ตอบใหม่จากจุดนี้', raw, { title: 'แก้ไขข้อความ', ok: 'Resend' });
  if (!next?.trim() || next.trim() === raw) return;
  chat.msgs = chat.msgs.slice(0, idx + 1);
  m.content = next.trim();
  send({ edit_id: m.id, edit_text: next.trim() });
}
async function send({ regenerate = false, resume = false, edit_id = null, edit_text = '' } = {}) {
  if (chat.busy) return;
  if (chat.compare && !regenerate && !resume) return compareSend();
  const quiet = regenerate || resume || !!edit_id, t = $('#t'), text = edit_id ? edit_text : quiet ? '' : t.value.trim(), imgs = quiet ? [] : chat.images, m = curModel();
  const files = quiet ? [] : chat.files;
  if (!m) return showErr('ยังโหลดรายการโมเดลไม่เสร็จ ลองรีเฟรชหน้าแล้วส่งอีกครั้ง');
  if (files.some(f => f.text == null)) return showErr('รออ่านไฟล์ให้เสร็จก่อน');
  if (!quiet && !text && !imgs.length && !files.length) return;
  $('#e').textContent = '';
  if (edit_id) { /* already sliced */ } else if (resume) { if (chat.msgs.at(-1)?.role !== 'user') return; } // ต่อคำตอบ: ต้องมีคำถามค้างอยู่
  else if (regenerate) { if (chat.msgs.at(-1)?.role === 'assistant') chat.msgs.pop(); }
  else {
    autoRetry = 0;
    t.value = ''; t.style.height = 'auto'; chat.images = []; chat.files = []; drawThumbs();
    chat.msgs.push({ role: 'user', content: withFiles(text || (files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้'), files), imgs: imgs.length ? imgs : null });
    appendMsg(chat.msgs.at(-1));
  }
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };
  chat.msgs.push(ai);
  if (quiet) renderAll(); else appendMsg(ai);
  setBusy(true); chat.ctrl = new AbortController();
  let started = false, streamErr = null, aborted = false, raf = 0;
  try {
    await stream({ chat_id: chat.id, model_id: m.id, text, images: imgs, files, regenerate, resume, edit_id, search: localStorage.getItem('web') === '1' && !!site.search, skill_ids: chat.skills, mcp_ids: chat.mcps,
      effort: m.effort !== 'none' ? $('#effort').value || null : null }, chat.ctrl.signal, d => {
      started = true;
      if (d.chat_id && !chat.id) { chat.id = d.chat_id; setUrl('/chat?id=' + d.chat_id, true); }
      if (d.model) ai.model = d.model;
      noteOf(ai, d); if (d.fallback) ai.model = d.fallback;
      if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); }
      if (d.error) streamErr = d.error;
      if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; }
      if (d.ctx) { chat.ctx = { ...d.ctx, id: chat.id }; }
      if (d.done) { ai.pct = Math.max(0, d.pctWeek - me.usage.pctWeek); setUsage(d); }
    });
  } catch (x) {
    if (x.name === 'AbortError') {
      aborted = true;
      setTimeout(() => api('/me').then(d => { me = d; setUsage(d.usage); }).catch(() => {}), 1500);
      // เซิร์ฟเวอร์ยังตอบต่อเบื้องหลัง (waitUntil) แล้วบันทึกคำตอบไว้ → ดึงกลับมาแสดงให้เอง
      if (chat.id) setTimeout(async () => {
        if (chat.busy) return;
        const list = await api('/chats/' + chat.id).catch(() => null);
        if (!list || chat.busy || list.length <= chat.msgs.length) return;
        for (const r of list) if (typeof r.sources === 'string') try { r.sources = JSON.parse(r.sources); } catch { r.sources = null; }
        chat.msgs = list; $('#e').textContent = ''; renderAll(); loadSide();
      }, 6000);
    }
    else if (!started && !quiet) { // เซิร์ฟเวอร์ยังไม่บันทึก: คืนข้อความให้แก้แล้วส่งใหม่
      chat.msgs.splice(-2, 2); t.value = text; chat.images = imgs; chat.files = files; drawThumbs(); setBusy(false); renderAll(); showErr(x.message); return;
    } else streamErr = x.message;
  }
  cancelAnimationFrame(raf);
  ai.streaming = false;
  const empty = !ai.content && !ai.thinking;
  if (empty && chat.msgs.at(-1) === ai) chat.msgs.pop();
  setBusy(false); renderAll();
  if (!streamErr && !aborted && !empty && !chat.compare) { const g = parseImg(ai.content); if (g.prompt) genImage(g.prompt, true); } // AI สั่งสร้างรูปเอง
  if (streamErr) showErr(streamErr, true);
  else if (aborted) showErr('หยุดแล้ว · ถ้าเซิร์ฟเวอร์ตอบจบแล้ว ระบบจะดึงคำตอบมาแสดงให้เอง');
  else if (empty) {
    // เดิม: ลบคำตอบทิ้งแล้วเงียบสนิท ไม่มีอะไรขึ้นเลย → ตอนนี้ลองต่อให้อัตโนมัติ 1 ครั้ง แล้วค่อยแจ้ง
    if (started && chat.id && !resume && autoRetry < 1) { autoRetry++; showErr('โมเดลยังไม่ได้ส่งคำตอบ กำลังลองใหม่ให้อัตโนมัติ…'); return send({ resume: true }); }
    showErr('ไม่ได้คำตอบจากโมเดล ลองอีกครั้ง', true);
  }
  loadSide();
}

// กันเหนียว: error ที่หลุดมานอก try ต้องเห็นบนจอ ไม่ใช่เงียบหายไปเลย
addEventListener('error', e => { try { if (e.message) showErr('ผิดพลาด: ' + e.message); } catch {} });
addEventListener('unhandledrejection', e => { const s = e.reason?.message || String(e.reason || ''); if (s && !/\babort/i.test(s)) try { showErr('ผิดพลาด: ' + s); } catch {} });

