// AstraCode frontend — vanilla JS, hash router
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const num = n => Number(n || 0).toLocaleString('th-TH');
const when = t => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';
const EFFORTS = [['', 'Instant'], ['low', 'Low'], ['high', 'High'], ['max', 'Max']];
const SUGGEST = ['อธิบายเรื่องนี้ให้เข้าใจง่าย: ', 'ช่วยเขียนโค้ด Python ที่', 'สรุปข้อความนี้ให้สั้นลง:\n', 'แปลเป็นภาษาอังกฤษ:\n'];
let me = null, installEvt = null;
let chat = { id: null, msgs: [], busy: false, ctrl: null, images: [], chats: [] };

async function api(path, opt = {}) {
  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }
  const r = await fetch('/api' + path, opt);
  const d = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (r.status === 401) me = null;
  if (!r.ok) throw Object.assign(new Error(d?.error || 'ผิดพลาด'), { data: d });
  return d;
}

// ---------- Markdown ----------
function inline(s) { // s escape แล้ว
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
function blocks(text) {
  const L = esc(text).split('\n'); let out = '', i = 0;
  while (i < L.length) {
    const l = L[i]; let m;
    if (!l.trim()) { i++; continue; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { out += `<div class="h h${m[1].length}">${inline(m[2])}</div>`; i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out += '<hr>'; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
      const head = cells(l); i += 2; const rows = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) rows.push(cells(L[i++]));
      out += `<div class="tw"><table><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      continue;
    }
    if (/^&gt;\s?/.test(l)) { const q = []; while (i < L.length && /^&gt;\s?/.test(L[i])) q.push(L[i++].replace(/^&gt;\s?/, '')); out += `<blockquote>${blocks_(q)}</blockquote>`; continue; }
    if (isList(l)) {
      const ol = /^\s*\d/.test(l), items = [];
      while (i < L.length && (isList(L[i]) || (/^\s{2,}\S/.test(L[i]) && items.length))) {
        if (isList(L[i]) && !/^\s{2,}/.test(L[i]) && /^\s*\d/.test(L[i]) !== ol) break; // เปลี่ยนชนิดรายการ
        const x = L[i++], sub = /^\s{2,}/.test(x);
        if (isList(x)) items.push(`<li class="${sub ? 'sub' : ''}">${inline(x.replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`);
        else items[items.length - 1] = items.at(-1).replace(/<\/li>$/, '<br>' + inline(x.trim()) + '</li>');
      }
      out += ol ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`; continue;
    }
    const p = [];
    while (i < L.length && L[i].trim() && !/^(#{1,4}\s|&gt;)/.test(L[i]) && !isList(L[i]) && !/^\s*\|.*\|\s*$/.test(L[i])) p.push(inline(L[i++]));
    if (!p.length) p.push(inline(L[i++]));
    out += `<p>${p.join('<br>')}</p>`;
  }
  return out;
}
const blocks_ = lines => blocks(lines.join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
function md(s) {
  return String(s).split(/```/).map((part, i) => {
    if (!(i % 2)) return blocks(part);
    const nl = part.indexOf('\n'), lang = nl >= 0 ? part.slice(0, nl).trim() : '';
    return `<div class="code"><div class="code-h"><span>${esc(lang || 'code')}</span><button class="cp-code">คัดลอก</button></div><pre><code>${esc(nl >= 0 ? part.slice(nl + 1) : part)}</code></pre></div>`;
  }).join('');
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const o = btn.textContent; btn.textContent = 'คัดลอกแล้ว ✓'; setTimeout(() => btn.textContent = o, 1500);
}

// ---------- ส่วนที่ใช้ซ้ำ ----------
const nav = () => `<nav class="nav"><a class="logo" href="#/">AstraCode</a><span class="sp"></span>
  ${me ? `<a class="l" href="#/chat">แชต</a><a class="l" href="#/plans">แพลน</a><a class="l" href="#/account">บัญชี</a>${me.role === 'admin' ? '<a class="l" href="#/admin">หลังบ้าน</a>' : ''}`
       : `<a class="l" href="#/plans">แพลน</a><a class="btn blue sm" href="#/login">เริ่มใช้ฟรี</a>`}</nav>`;
const page = html => { app.innerHTML = `<div class="view">${html}</div>`; };

function planTiles(plans, sel) {
  return `<div class="grid">${plans.map(p => `<div class="tile plan ${sel === p.id ? 'sel' : ''} ${p.featured ? 'feat' : ''}" data-plan="${p.id}">
    ${p.featured ? '<span class="badge">แนะนำ</span>' : ''}
    <div style="font:600 19px var(--display)">${esc(p.name)}</div>
    <div class="price">${p.price > 0 ? '฿' + baht(p.price) : 'ฟรี'}<small>${p.price > 0 ? ' / เดือน' : ''}</small></div>
    <div class="muted">${esc(p.description)}</div>
    <ul class="feat-list">${p.models.map(m => `<li>${esc(m.name)} <span class="muted">~${num(m.week)} ข้อความ/สัปดาห์</span></li>`).join('')}</ul></div>`).join('')}</div>
    <p class="muted" style="text-align:center;margin-top:16px">จำนวนข้อความเป็นค่าประมาณ (ข้อความละ ~2,500 token) ใช้หลายโมเดลได้ในลิมิตเดียวกัน</p>`;
}
function compareTable(plans) {
  const names = [...new Set(plans.flatMap(p => p.models.map(m => m.name)))];
  return `<div class="tw"><table class="cmp"><tr><th></th>${plans.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>
    <tr><td>ราคา/เดือน</td>${plans.map(p => `<td>${p.price > 0 ? '฿' + baht(p.price) : 'ฟรี'}</td>`).join('')}</tr>
    ${names.map(n => `<tr><td>${esc(n)}</td>${plans.map(p => { const m = p.models.find(x => x.name === n); return `<td>${m ? '~' + num(m.week) : '<span class="muted">—</span>'}</td>`; }).join('')}</tr>`).join('')}
    <tr><td>รีเซ็ตลิมิต</td>${plans.map(() => '<td>4 ชม. + สัปดาห์</td>').join('')}</tr></table></div>
    <p class="muted" style="text-align:center">ตัวเลขในตาราง = จำนวนข้อความโดยประมาณต่อสัปดาห์</p>`;
}
const FAQ = [
  ['ลิมิต 4 ชั่วโมงกับลิมิตสัปดาห์ต่างกันยังไง', 'ลิมิต 4 ชั่วโมงกันการใช้รวดเดียวหมด ส่วนลิมิตสัปดาห์คือโควตารวม ทั้งสองแสดงเป็น % ด้านบนหน้าแชต ลิมิตสัปดาห์รีเซ็ตทุกวันจันทร์ 00:00'],
  ['ทำไมแต่ละโมเดลใช้ลิมิตไม่เท่ากัน', 'โมเดลที่เก่งกว่ามีต้นทุนสูงกว่า จึงกิน % เร็วกว่า DeepSeek ใช้ได้เยอะที่สุด'],
  ['Instant / Low / High / Max คืออะไร', 'คือระดับความคิดของ AI: Instant ตอบทันทีไม่คิดก่อน ส่วน Low, High และ Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบโจทย์ยากได้ดี แต่ช้ากว่าและใช้ลิมิตมากกว่า'],
  ['จ่ายเงินยังไง', 'เลือกแพลน สแกน QR PromptPay แล้วอัปโหลดสลิป แอดมินตรวจและเปิดแพลนให้ แพลนใช้ได้ 30 วัน'],
  ['ต้องลงแอปไหม', 'ไม่ต้อง ใช้บนเว็บได้เลย หรือเพิ่มลงหน้าจอหลักเพื่อใช้เหมือนแอป'],
];
const faqHTML = () => FAQ.map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('');
const installHTML = () => `<div class="grid">
  <div class="tile"><div style="font:600 19px var(--display)">iPhone / iPad</div><div class="muted">เปิดใน Safari → กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → "เพิ่มไปยังหน้าจอโฮม"</div></div>
  <div class="tile"><div style="font:600 19px var(--display)">Android</div><div class="muted">เปิดใน Chrome → กด ⋮ มุมขวาบน → "ติดตั้งแอป" หรือ "เพิ่มลงในหน้าจอหลัก"</div>
  ${installEvt ? '<button class="btn blue sm" id="install" style="margin-top:8px">ติดตั้งเลย</button>' : ''}</div></div>`;
function bindInstall() {
  const b = $('#install'); if (!b) return;
  b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.remove(); };
}

// ---------- หน้าแรก ----------
async function landing() {
  const plans = await api('/plans').catch(() => []);
  page(nav() + `<section class="hero"><div class="name">AstraCode</div>
    <h1>AI ทุกตัว<br>ในมือถือเครื่องเดียว</h1>
    <p>ChatGPT, Claude, Gemini, DeepSeek และ Kimi ในเว็บเดียว เปิดบนมือถือได้ทันที ไม่ต้องลงแอป</p>
    <div class="row" style="justify-content:center"><a class="btn blue" href="#/login">เริ่มใช้ฟรี</a><a class="btn out" href="#plans">ดูแพลน</a></div></section>
    <div class="wrap"><div class="band"><h2>ออกแบบมาเพื่อมือถือ</h2><div class="grid">
      <div class="tile"><div class="stat">5+</div><div class="muted">ผู้ให้บริการ AI ชั้นนำ สลับได้ในแชตเดียว</div></div>
      <div class="tile"><div class="stat">PWA</div><div class="muted">เพิ่มลงหน้าจอหลัก ใช้เหมือนแอปจริง</div></div>
      <div class="tile"><div class="stat">%</div><div class="muted">เห็นลิมิตชัดเจน รีเซ็ตทุก 4 ชั่วโมงและทุกสัปดาห์</div></div>
      <div class="tile"><div class="stat">฿</div><div class="muted">จ่ายผ่าน PromptPay เริ่มต้นหลักสิบบาท</div></div>
    </div></div>
    <div class="band" id="plans"><h2>แพลน</h2>${planTiles(plans)}</div>
    <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>
    <div class="band"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>
    ${footer()}</div>`);
  $('a[href="#plans"]').onclick = e => { e.preventDefault(); $('#plans').scrollIntoView({ behavior: 'smooth' }); };
  bindInstall();
}

// ---------- เข้าสู่ระบบ ----------
function auth() {
  let mode = 'login';
  const draw = () => {
    page(nav() + `<div class="auth wrap"><h1>${mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h1>
      <div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">เข้าสู่ระบบ</button><button class="${mode === 'register' ? 'on' : ''}" data-m="register">สมัคร</button></div>
      <form class="card" id="f"><label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <label>รหัสผ่าน</label><input name="password" type="password" minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
      <div class="err" id="e"></div><button class="btn blue" style="width:100%">${mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</button>
      ${mode === 'login' ? '<p class="muted" style="text-align:center;margin:12px 0 0">ลืมรหัสผ่าน? ติดต่อแอดมินเพื่อตั้งรหัสใหม่</p>' : ''}
      <p class="muted" style="text-align:center;margin:12px 0 0">การ${mode === 'login' ? 'ใช้งาน' : 'สมัคร'}ถือว่ายอมรับ<a href="#/terms">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`);
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
    $('#f').onsubmit = async e => {
      e.preventDefault(); e.submitter.disabled = true;
      try { await api('/' + mode, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await loadMe(); location.hash = '#/chat'; }
      catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; }
    };
  };
  draw();
}
const loadMe = async () => { me = await api('/me').catch(() => null); };

// ---------- แชต ----------
function meters(u) {
  const m = (label, p, reset) => `<div class="meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" title="รีเซ็ต ${when(reset)}">${label} ${p}%<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
  return m('4 ชม.', u.pct4h, u.reset4h) + m('สัปดาห์', u.pctWeek, u.resetWeek);
}
function notice(u) {
  if (u.pct4h >= 100 || u.pctWeek >= 100)
    return `<div class="notice full">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)} <a class="btn blue sm" href="#/plans">อัปเกรด</a></div>`;
  const p = Math.max(u.pct4h, u.pctWeek);
  return p >= 80 ? `<div class="notice hi">ใช้ลิมิตไปแล้ว ${p}% · <a href="#/plans">อัปเกรดเพื่อใช้ได้มากขึ้น</a></div>` : '';
}
function setUsage(u) { me.usage = u; $('#meters').innerHTML = meters(u); $('#notice').innerHTML = notice(u); }
const curModel = () => me.models.find(m => m.id === +$('#model')?.value) || me.models[0];

async function chatView(id) {
  if (!me) return location.hash = '#/login';
  chat = { ...chat, id: id ? +id : null, msgs: id ? await api('/chats/' + id).catch(() => []) : [], busy: false, images: [] };
  const saved = localStorage.getItem('model');
  app.innerHTML = `<div class="chat view"><aside class="side" id="side">
      <a class="logo" href="#/" style="padding:8px 12px">AstraCode</a>
      <a class="btn out sm" href="#/chat">+ แชตใหม่</a>
      <input id="search" placeholder="ค้นหาแชต" aria-label="ค้นหาแชต" style="min-height:36px;font-size:14px">
      <div class="list" id="list"></div>
      <a class="l muted" href="#/plans" style="padding:8px 12px">${esc(me.plan.name)} · อัปเกรด</a>
      <a class="l muted" href="#/account" style="padding:8px 12px">${esc(me.email)}</a></aside>
    <div class="main"><div class="bar"><button class="menu-btn" id="menu" aria-label="เมนู">☰</button>
      <select id="model" aria-label="โมเดล">${me.models.map(m => `<option value="${m.id}" ${String(m.id) === saved ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <select id="effort" aria-label="ระดับความคิด" title="Low/High/Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบดีแต่ช้าและใช้ลิมิตมากกว่า">${EFFORTS.map(([v, l]) => `<option value="${v}" ${v === (localStorage.getItem('effort') || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="meters" id="meters">${meters(me.usage)}</div></div>
      <div class="msgs" id="msgs"></div>
      <div class="compose"><div id="notice">${notice(me.usage)}</div><div class="err" id="e"></div><div class="thumbs" id="thumbs"></div>
        <form id="f"><button type="button" class="icon-btn" id="attach" aria-label="แนบรูป">＋</button><input type="file" id="file" accept="image/*" multiple hidden>
        <textarea id="t" rows="1" placeholder="พิมพ์ข้อความ..." aria-label="ข้อความ"></textarea><button class="btn blue send" id="go" aria-label="ส่ง">↑</button></form></div></div></div>`;
  const side = $('#side');
  $('#menu').onclick = () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; document.body.append(s); };
  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };
  $('#effort').onchange = e => localStorage.setItem('effort', e.target.value);
  $('#search').oninput = drawSide;
  const t = $('#t');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } };
  $('#f').onsubmit = e => { e.preventDefault(); chat.busy ? chat.ctrl?.abort() : send(); };
  $('#attach').onclick = () => $('#file').click();
  $('#file').onchange = async e => { await addImages([...e.target.files]); e.target.value = ''; };
  $('#msgs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp-code')) copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.dataset.copy) copy(chat.msgs[+b.dataset.copy].content, b);
    if (b.dataset.regen != null) send({ regenerate: true });
    if (b.dataset.s != null) { t.value = SUGGEST[+b.dataset.s]; t.focus(); t.oninput(); }
  };
  modelUI(); renderAll(); loadSide();
}
function modelUI() {
  const m = curModel();
  $('#effort').hidden = !m || m.effort === 'none';
  $('#attach').hidden = !m?.vision;
  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); }
}
async function loadSide() { chat.chats = await api('/chats').catch(() => []); drawSide(); }
function drawSide() {
  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;
  list.innerHTML = chat.chats.filter(c => c.title.toLowerCase().includes(q)).map(c => `<div class="item ${c.id === chat.id ? 'on' : ''}"><a href="#/chat/${c.id}">${esc(c.title)}</a>
    <button data-ren="${c.id}" aria-label="เปลี่ยนชื่อ">✎</button><button data-del="${c.id}" aria-label="ลบ">✕</button></div>`).join('') || '<p class="muted" style="padding:8px 12px">ยังไม่มีแชต</p>';
  list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('ลบแชตนี้?')) return;
    await api('/chats/' + b.dataset.del, { method: 'DELETE' });
    if (chat.id === +b.dataset.del) location.hash = '#/chat'; else loadSide();
  });
  list.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
    const c = chat.chats.find(x => x.id === +b.dataset.ren), title = prompt('ชื่อแชต', c.title);
    if (title?.trim()) { await api('/chats/' + c.id, { method: 'PUT', body: { title } }); loadSide(); }
  });
}

// รูปภาพ: ย่อเป็น JPEG ไม่เกิน 1280px ก่อนส่ง
async function addImages(files) {
  for (const f of files.slice(0, 4 - chat.images.length)) {
    try {
      const bmp = await createImageBitmap(f), s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      chat.images.push(c.toDataURL('image/jpeg', 0.85));
    } catch { alert('อ่านรูปนี้ไม่ได้ ลองใช้ JPG หรือ PNG'); }
  }
  drawThumbs();
}
function drawThumbs() {
  const box = $('#thumbs'); if (!box) return;
  box.innerHTML = chat.images.map((d, i) => `<div class="thumb"><img src="${d}" alt=""><button data-rm="${i}" aria-label="ลบรูป">✕</button></div>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { chat.images.splice(+b.dataset.rm, 1); drawThumbs(); });
}

function msgHTML(m, i, isNew) {
  if (m.role === 'user') return `<div class="msg user ${isNew ? 'new' : ''}"><div class="b">${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}${esc(m.content)}</div></div>`;
  const last = i === chat.msgs.length - 1;
  return `<div class="msg ai ${isNew ? 'new' : ''}"><div class="b">${m.content ? md(m.content) : DOTS}</div>
    ${m.streaming ? '' : `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}<button data-copy="${i}">คัดลอก</button>${last && !chat.busy ? '<button data-regen>ตอบใหม่</button>' : ''}</div>`}</div>`;
}
const nearBottom = box => box.scrollHeight - box.scrollTop - box.clientHeight < 120;
function renderAll() {
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = chat.msgs.length ? chat.msgs.map((m, i) => msgHTML(m, i)).join('')
    : `<div class="empty"><div class="stat">วันนี้ให้ช่วยอะไรดี</div><div>เลือกโมเดลด้านบน แล้วพิมพ์ได้เลย</div>
       <div class="chips">${['อธิบายให้เข้าใจง่าย', 'ช่วยเขียนโค้ด', 'สรุปข้อความ', 'แปลภาษา'].map((s, i) => `<button data-s="${i}">${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight;
}
function appendMsg(m) {
  const box = $('#msgs'); if (!chat.msgs.length || chat.msgs.length === 1) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHTML(m, chat.msgs.length - 1, true));
  box.scrollTop = box.scrollHeight;
}
function updateLast() {
  const box = $('#msgs'), stick = nearBottom(box);
  box.lastElementChild.querySelector('.b').innerHTML = md(chat.msgs.at(-1).content);
  if (stick) box.scrollTop = box.scrollHeight;
}
function showErr(msg, retry) {
  $('#e').innerHTML = esc(msg) + (retry ? ' <button class="btn out sm" id="retry">ลองใหม่</button>' : '');
  $('#retry')?.addEventListener('click', () => send({ regenerate: true }));
}
function setBusy(b) { chat.busy = b; const g = $('#go'); g.textContent = b ? '■' : '↑'; g.setAttribute('aria-label', b ? 'หยุด' : 'ส่ง'); g.classList.toggle('stop', b); }

async function send({ regenerate = false } = {}) {
  if (chat.busy) return;
  const t = $('#t'), text = regenerate ? '' : t.value.trim(), imgs = regenerate ? [] : chat.images, m = curModel();
  if (!regenerate && !text && !imgs.length) return;
  $('#e').textContent = '';
  if (regenerate) { if (chat.msgs.at(-1)?.role === 'assistant') chat.msgs.pop(); }
  else {
    t.value = ''; t.style.height = 'auto'; chat.images = []; drawThumbs();
    chat.msgs.push({ role: 'user', content: text || 'อธิบายรูปนี้', imgs: imgs.length ? imgs : null });
    appendMsg(chat.msgs.at(-1));
  }
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };
  chat.msgs.push(ai);
  if (regenerate) renderAll(); else appendMsg(ai);
  setBusy(true); chat.ctrl = new AbortController();
  let started = false, streamErr = null, raf = 0;
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: chat.ctrl.signal,
      body: JSON.stringify({ chat_id: chat.id, model_id: m.id, text, images: imgs, regenerate, effort: m.effort !== 'none' ? $('#effort').value || null : null }) });
    if (!r.ok) {
      const d = await r.json();
      if (r.status === 429) setUsage(d);
      throw new Error(r.status === 429 ? 'ลิมิตเต็มแล้ว' : d.error);
    }
    started = true;
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith('data: ')) continue;
        const d = JSON.parse(line.slice(6));
        if (d.chat_id && !chat.id) { chat.id = d.chat_id; history.replaceState(null, '', '#/chat/' + d.chat_id); }
        if (d.model) ai.model = d.model;
        if (d.t) { ai.content += d.t; if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); }
        if (d.error) streamErr = d.error;
        if (d.done) setUsage(d);
      }
    }
  } catch (x) {
    if (x.name === 'AbortError') setTimeout(() => api('/me').then(d => { me = d; setUsage(d.usage); }).catch(() => {}), 1500);
    else if (!started && !regenerate) { // เซิร์ฟเวอร์ยังไม่บันทึก: คืนข้อความให้แก้แล้วส่งใหม่
      chat.msgs.splice(-2, 2); t.value = text; chat.images = imgs; drawThumbs(); setBusy(false); renderAll(); showErr(x.message); return;
    } else streamErr = x.message;
  }
  cancelAnimationFrame(raf);
  ai.streaming = false;
  if (!ai.content) chat.msgs.pop();
  setBusy(false); renderAll();
  if (streamErr) showErr(streamErr, chat.msgs.at(-1)?.role === 'user');
  loadSide();
}

// ---------- แพลน + ชำระเงิน ----------
async function plansPage() {
  const plans = await api('/plans');
  if (!me) { page(nav() + `<div class="wrap"><section class="hero" style="padding-bottom:24px"><h1>เลือกแพลน</h1></section>${planTiles(plans)}<p style="text-align:center;margin:28px"><a class="btn blue" href="#/login">สมัครเพื่อเริ่มใช้</a></p><div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div></div>`); return; }
  const pays = await api('/pay');
  let sel = null;
  const draw = () => {
    const p = plans.find(x => x.id === sel);
    page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 24px"><h1>เลือกแพลน</h1><p>แพลนปัจจุบัน: ${esc(me.plan.name)}${me.plan.expires ? ' · หมดอายุ ' + when(me.plan.expires) : ''}</p></section>
      ${planTiles(plans.filter(x => x.price > 0), sel)}
      ${p ? `<div class="card pay" id="pay" style="text-align:center"><div style="font:600 24px var(--display)">${esc(p.name)} · ฿${baht(p.price)}</div>
        ${me.promptpay_id ? `<p class="muted">สแกนจ่ายผ่าน PromptPay แล้วอัปโหลดสลิป</p><img class="qr" alt="QR PromptPay" src="https://promptpay.io/${encodeURIComponent(me.promptpay_id)}/${p.price}.png">` : '<p class="warn">ยังไม่ได้ตั้งค่า PromptPay</p>'}
        <form id="f" style="max-width:400px;margin:16px auto 0"><label>รูปสลิป</label><input type="file" name="slip" accept="image/*" required style="border-radius:20px">
        <div class="err" id="e"></div><button class="btn blue" style="width:100%">ส่งสลิป</button><p class="muted" style="margin:12px 0 0">การชำระเงินถือว่ายอมรับ<a href="#/terms">เงื่อนไขการคืนเงิน</a></p></form></div>` : '<p class="muted" style="text-align:center">แตะแพลนเพื่อชำระเงิน</p>'}
      <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>
      ${pays.length ? `<div class="card"><div style="font:600 19px var(--display)">ประวัติการชำระ</div><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>แพลน</th><th>ยอด</th><th>สถานะ</th></tr>
        ${pays.map(x => `<tr><td>${when(x.created_at)}</td><td>${esc(x.plan_name)}</td><td>฿${baht(x.amount)}</td><td>${{ pending: '<span class="warn">รออนุมัติ</span>', approved: '<span class="ok">อนุมัติแล้ว</span>', rejected: '<span class="bad">ไม่อนุมัติ</span>' }[x.status]}</td></tr>`).join('')}</table></div></div>` : ''}</div>`);
    app.querySelectorAll('[data-plan]').forEach(t => t.onclick = () => { sel = +t.dataset.plan; draw(); $('#pay')?.scrollIntoView({ behavior: 'smooth' }); });
    $('#f')?.addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target); fd.append('plan_id', sel);
      e.submitter.disabled = true;
      try { await api('/pay', { method: 'POST', body: fd }); alert('ส่งสลิปแล้ว รอแอดมินอนุมัติ'); route(); }
      catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; }
    });
  };
  draw();
}

// ---------- บัญชี ----------
async function account() {
  if (!me) return location.hash = '#/login';
  await loadMe();
  const u = me.usage;
  page(nav() + `<div class="wrap" style="max-width:600px"><section class="hero" style="padding:48px 0 16px"><h1>บัญชี</h1><p>${esc(me.email)}</p></section>
    <div class="card"><div class="grid">
      <div class="tile"><div class="muted">แพลน</div><div class="stat">${esc(me.plan.name)}</div><div class="muted">${me.plan.expires ? 'หมดอายุ ' + when(me.plan.expires) : 'ไม่มีวันหมดอายุ'}</div></div>
      <div class="tile"><div class="muted">ลิมิต 4 ชม.</div><div class="stat">${u.pct4h}%</div><div class="muted">รีเซ็ต ${u.reset4h ? when(u.reset4h) : '-'}</div></div>
      <div class="tile"><div class="muted">ลิมิตสัปดาห์</div><div class="stat">${u.pctWeek}%</div><div class="muted">รีเซ็ต ${when(u.resetWeek)}</div></div>
    </div></div>
    <div class="row" style="justify-content:center"><a class="btn blue" href="#/plans">อัปเกรด</a><button class="btn out" id="out">ออกจากระบบ</button></div>
    <form class="card" id="pw" style="margin-top:24px"><div style="font:600 19px var(--display)">เปลี่ยนรหัสผ่าน</div>
      <label>รหัสผ่านเดิม</label><input name="old" type="password" autocomplete="current-password" required>
      <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input name="new" type="password" minlength="8" autocomplete="new-password" required>
      <div class="err" id="pe"></div><button class="btn blue">เปลี่ยนรหัสผ่าน</button>
      <p class="muted" style="margin:12px 0 0">เปลี่ยนแล้วเครื่องอื่นที่ล็อกอินอยู่จะถูกออกจากระบบ</p></form>
    <p class="muted" style="text-align:center;margin-top:24px"><a href="#/terms">เงื่อนไขและความเป็นส่วนตัว</a></p>
    <div class="band" style="margin-top:48px"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div></div>`);
  $('#out').onclick = async () => { await api('/logout', { method: 'POST' }); me = null; location.hash = '#/'; };
  $('#pw').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); $('#pe').innerHTML = '<span class="ok">เปลี่ยนรหัสผ่านแล้ว</span>'; }
    catch (x) { $('#pe').textContent = x.message; }
    e.submitter.disabled = false;
  };
  bindInstall();
}

// ---------- หลังบ้าน ----------
const FIELDS = {
  plans: [['name', 'ชื่อ'], ['price', 'ราคา (บาท/เดือน)', 'n'], ['limit_4h', 'ลิมิต 4 ชม. (units)', 'n'], ['limit_week', 'ลิมิตสัปดาห์ (units)', 'n'], ['description', 'คำอธิบาย'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
  models: [['name', 'ชื่อที่แสดง'], ['provider', 'รูปแบบ API', ['openai', 'anthropic']], ['api_model', 'รหัสโมเดล'], ['base_url', 'Base URL'], ['key_name', 'ชื่อ secret ของ key'], ['multiplier', 'ตัวคูณ', 'n'],
    ['cost_in', 'ทุน input (บาท/1M)', 'n'], ['cost_out', 'ทุน output', 'n'], ['cost_cache', 'ทุน cache read', 'n'], ['cost_cache_write', 'ทุน cache write', 'n'],
    ['effort', 'รองรับ effort', ['none', 'openai', 'anthropic', 'deepseek']], ['vision', 'อ่านรูปได้', 'b'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
};
const STATUS = { pending: '<span class="warn">รออนุมัติ</span>', approved: '<span class="ok">อนุมัติแล้ว</span>', rejected: '<span class="bad">ปฏิเสธ</span>' };
async function adminView(tab = 'stats') {
  if (me?.role !== 'admin') return location.hash = '#/';
  const tabs = { stats: 'สรุป', payments: 'ชำระเงิน', users: 'ผู้ใช้', plans: 'แพลน', models: 'โมเดล', settings: 'ตั้งค่า' };
  page(nav() + `<div class="wrap"><div class="tabs" style="margin-top:24px">${Object.entries(tabs).map(([k, v]) => `<a class="${k === tab ? 'on' : ''}" href="#/admin/${k}">${v}</a>`).join('')}</div><div id="ad"></div></div>`);
  const box = $('#ad'), reload = () => adminView(tab);

  if (tab === 'stats') {
    const s = await api('/admin/stats');
    box.innerHTML = `<div class="card"><div class="muted">เดือนนี้</div><div class="grid" style="margin-top:12px">
      <div class="tile"><div class="muted">รายได้</div><div class="stat">฿${baht(s.revenue)}</div></div>
      <div class="tile"><div class="muted">ต้นทุน API</div><div class="stat">฿${baht(s.cost)}</div></div>
      <div class="tile"><div class="muted">กำไรขั้นต้น</div><div class="stat ${s.profit >= 0 ? 'ok' : ''}">฿${baht(s.profit)}</div></div>
      <div class="tile"><div class="muted">ผู้ใช้ / จ่ายเงิน</div><div class="stat">${s.users.total} / ${s.users.paid || 0}</div><div class="muted">${s.pending} สลิปรออนุมัติ</div></div></div></div>
      <div class="card tw"><table class="tbl"><tr><th>โมเดล</th><th>ข้อความ</th><th>Token in</th><th>Token out</th><th>ต้นทุน</th></tr>
      ${s.models.map(m => `<tr><td>${esc(m.name)}</td><td>${m.msgs}</td><td>${num(m.tin)}</td><td>${num(m.tout)}</td><td>฿${baht(m.cost)}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">ยังไม่มีการใช้งาน</td></tr>'}</table></div>`;
  }
  if (tab === 'payments') {
    const ps = await api('/admin/payments');
    box.innerHTML = ps.map(p => `<div class="card"><div class="row"><b>#${p.id} ${esc(p.email)}</b><span style="flex:1"></span>${STATUS[p.status]}</div>
      <div class="muted">${when(p.created_at)} · ${esc(p.plan_name)} · ต้องจ่าย ฿${baht(p.amount)}</div>
      <div class="muted">API เช็กสลิป: ${p.slip_amount == null ? 'ไม่มีผล' : (p.slip_amount === p.amount ? `<span class="ok">ยอดตรง ฿${baht(p.slip_amount)}</span>` : `<span class="bad">ยอดไม่ตรง ฿${baht(p.slip_amount)}</span>`)}</div>
      ${p.slip_check ? `<details><summary class="muted">ผลดิบจาก API</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(p.slip_check)}</pre></details>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn out sm" data-slip="${p.id}">ดูสลิป</button>
      ${p.status === 'pending' ? `<button class="btn blue sm" data-act="approve" data-id="${p.id}">อนุมัติ</button><button class="btn red sm" data-act="reject" data-id="${p.id}">ปฏิเสธ</button>` : ''}</div>
      <div data-img="${p.id}"></div></div>`).join('') || '<p class="muted" style="text-align:center">ยังไม่มีคำขอ</p>';
    box.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => { box.querySelector(`[data-img="${b.dataset.slip}"]`).innerHTML = `<img class="slipimg" style="margin-top:12px" src="/api/admin/slip/${b.dataset.slip}" alt="สลิป">`; });
    box.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      if (!confirm(b.dataset.act === 'approve' ? 'อนุมัติและเปิดแพลนให้ผู้ใช้?' : 'ปฏิเสธคำขอนี้?')) return;
      await api(`/admin/payments/${b.dataset.id}/${b.dataset.act}`, { method: 'POST' }); reload();
    });
  }
  if (tab === 'users') {
    const plans = await api('/admin/plans');
    box.innerHTML = `<div class="card"><input id="q" placeholder="ค้นหาอีเมล"><div id="ul" class="tw" style="margin-top:12px"></div></div>`;
    const load = async () => {
      const us = await api('/admin/users?q=' + encodeURIComponent($('#q').value));
      $('#ul').innerHTML = `<table class="tbl"><tr><th>อีเมล</th><th>แพลน</th><th>หมดอายุ</th><th></th></tr>${us.map(u => `<tr><td>${esc(u.email)}${u.role === 'admin' ? ' <span class="muted">(admin)</span>' : ''}${u.banned ? ' <span class="bad">แบน</span>' : ''}</td>
        <td><select data-plan="${u.id}" style="min-height:32px;padding:2px 12px;font-size:13px"><option value="">ฟรี</option>${plans.filter(p => p.price > 0).map(p => `<option value="${p.id}" ${p.id === u.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
        <td>${u.plan_id ? when(u.plan_expires) : '-'}</td>
        <td class="row"><button class="btn out sm" data-reset="${u.id}">รีเซ็ตลิมิต</button><button class="btn out sm" data-pw="${u.id}">ตั้งรหัสใหม่</button><button class="btn red sm" data-ban="${u.id}" data-b="${u.banned ? 0 : 1}">${u.banned ? 'ปลดแบน' : 'แบน'}</button></td></tr>`).join('')}</table>`;
      const put = (id, body) => api('/admin/users/' + id, { method: 'PUT', body }).then(load);
      $('#ul').querySelectorAll('[data-plan]').forEach(s => s.onchange = () => put(s.dataset.plan, { plan_id: +s.value || null, days: 30 }));
      $('#ul').querySelectorAll('[data-reset]').forEach(b => b.onclick = () => put(b.dataset.reset, { reset_usage: true }));
      $('#ul').querySelectorAll('[data-pw]').forEach(b => b.onclick = async () => {
        const pw = prompt('รหัสผ่านใหม่ (อย่างน้อย 8 ตัว) ผู้ใช้จะถูกออกจากระบบทุกเครื่อง');
        if (pw) try { await put(b.dataset.pw, { password: pw }); alert('ตั้งรหัสใหม่แล้ว ส่งรหัสนี้ให้ผู้ใช้'); } catch (x) { alert(x.message); }
      });
      $('#ul').querySelectorAll('[data-ban]').forEach(b => b.onclick = () => confirm('ยืนยัน?') && put(b.dataset.ban, { banned: +b.dataset.b }));
    };
    let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 300); }; load();
  }
  if (tab === 'plans' || tab === 'models') {
    const rows = await api('/admin/' + tab), models = tab === 'plans' ? await api('/admin/models') : [];
    const form = (r = { active: 1, model_ids: [] }) => `<form class="card" data-id="${r.id || ''}"><div style="font:600 19px var(--display)">${r.id ? esc(r.name) : '+ เพิ่ม' + (tab === 'plans' ? 'แพลน' : 'โมเดล')}
        ${tab === 'models' && r.id ? (r.has_key ? ' <span class="ok muted">key พร้อม</span>' : ' <span class="bad muted">ไม่พบ key</span>') : ''}</div>
      <div class="form2">${FIELDS[tab].map(([k, l, t]) => `<div><label>${l}</label>${t === 'b' ? `<input type="checkbox" name="${k}" ${r[k] ? 'checked' : ''}>`
        : Array.isArray(t) ? `<select name="${k}">${t.map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input name="${k}" ${t === 'n' ? 'type="number" step="any"' : ''} value="${esc(r[k] ?? '')}" required>`}</div>`).join('')}</div>
      ${tab === 'plans' ? `<label>โมเดลที่ใช้ได้</label><div class="row">${models.map(m => `<label style="margin:0 12px 0 0;color:var(--porcelain)"><input type="checkbox" name="m" value="${m.id}" ${r.model_ids?.includes(m.id) ? 'checked' : ''}> ${esc(m.name)} ×${m.multiplier}</label>`).join('')}</div>` : ''}
      <div class="row" style="margin-top:16px"><button class="btn blue sm">บันทึก</button>${r.id ? `<button type="button" class="btn red sm" data-del="${r.id}">ลบ</button>` : ''}</div></form>`;
    box.innerHTML = (tab === 'plans'
      ? `<p class="muted">1 unit = 1 token ของโมเดลตัวคูณ ×1 (cache read นับ 1/10) · ต้นทุนเต็มลิมิต/สัปดาห์ของ DeepSeek ≈ ลิมิต ÷ 1,000,000 × 1.2 บาท</p>`
      : `<p class="muted">key ใส่ที่ Worker → Settings → Variables and Secrets (Type: Secret) · Claude ใช้รูปแบบ anthropic ตัวอื่นใช้ openai · effort: openai = reasoning_effort, anthropic = adaptive thinking, deepseek = thinking + reasoning_effort</p>`)
      + rows.map(form).join('') + form();
    box.querySelectorAll('form').forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(f), body = {};
      FIELDS[tab].forEach(([k, , t]) => body[k] = t === 'b' ? (fd.get(k) ? 1 : 0) : t === 'n' ? +fd.get(k) : fd.get(k));
      if (tab === 'plans') body.model_ids = fd.getAll('m').map(Number);
      await api(`/admin/${tab}${f.dataset.id ? '/' + f.dataset.id : ''}`, { method: f.dataset.id ? 'PUT' : 'POST', body }); reload();
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('ลบถาวร?')) { await api(`/admin/${tab}/${b.dataset.del}`, { method: 'DELETE' }); reload(); } });
  }
  if (tab === 'settings') {
    const [s, plans] = await Promise.all([api('/admin/settings'), api('/admin/plans')]);
    box.innerHTML = `<form class="card" id="f" style="max-width:600px;margin:16px auto">
      <label>PromptPay (เบอร์โทรหรือเลขบัตรประชาชน)</label><input name="promptpay_id" value="${esc(s.promptpay_id)}">
      <label>แพลนที่ติดป้าย "แนะนำ"</label><select name="featured_plan"><option value="">ไม่มี</option>${plans.map(p => `<option value="${p.id}" ${String(p.id) === s.featured_plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <label>URL API เช็กสลิป (byshop)</label><input name="slip_api_url" value="${esc(s.slip_api_url)}" placeholder="https://...">
      <label>ตำแหน่งยอดเงินในผลลัพธ์ JSON (เช่น data.amount)</label><input name="slip_amount_field" value="${esc(s.slip_amount_field)}">
      <p class="muted">API key ของเช็กสลิป: ${s.slip_key_set ? '<span class="ok">ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · ตั้งเป็น Secret ชื่อ <code>SLIP_API_KEY</code></p>
      <button class="btn blue">บันทึก</button></form>`;
    $('#f').onsubmit = async e => { e.preventDefault(); await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); alert('บันทึกแล้ว'); };
  }
}


// ---------- เงื่อนไขการใช้บริการ ----------
const TERMS = [
  ['1. บริการ', 'AstraCode ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],
  ['2. บัญชีผู้ใช้', 'ผู้ใช้ต้องให้อีเมลที่ใช้งานได้ และรักษารหัสผ่านเป็นความลับ บัญชีหนึ่งใช้ได้หนึ่งคน ห้ามแชร์ ขาย หรือให้เช่าบัญชี หากพบการใช้งานผิดเงื่อนไข เราอาจระงับบัญชีโดยไม่คืนเงิน'],
  ['3. แพลนและการชำระเงิน', 'แพลนแบบชำระเงินมีอายุ 30 วันนับจากวันที่แอดมินอนุมัติสลิป การต่ออายุแพลนเดิมจะบวกเวลาต่อจากวันหมดอายุเดิม ชำระผ่าน PromptPay และแนบสลิปเท่านั้น สลิปปลอม สลิปซ้ำ หรือยอดไม่ตรงจะไม่ได้รับการอนุมัติ'],
  ['4. การคืนเงิน', 'ไม่คืนเงินหลังเปิดใช้แพลนแล้ว ยกเว้นกรณีระบบขัดข้องจนใช้งานไม่ได้ต่อเนื่องเกิน 72 ชั่วโมงโดยเป็นความผิดของเรา ซึ่งจะคืนเงินหรือชดเชยวันใช้งานตามสัดส่วน ติดต่อแอดมินภายใน 7 วันนับจากวันที่เกิดปัญหา'],
  ['5. ลิมิตการใช้งาน', 'แต่ละแพลนมีลิมิตทุก 4 ชั่วโมงและลิมิตรายสัปดาห์ แสดงเป็น % ในหน้าแชต โมเดลที่ต้นทุนสูงกว่าและโหมดคิด (Low / High / Max) ใช้ลิมิตมากกว่า จำนวนข้อความที่แสดงในหน้าแพลนเป็นค่าประมาณ เราอาจปรับลิมิต ราคา หรือโมเดลในแพลนได้ โดยจะแจ้งล่วงหน้าบนเว็บไซต์ การเปลี่ยนแปลงมีผลกับรอบที่ชำระครั้งถัดไป'],
  ['6. การใช้งานที่ห้าม', 'ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง ละเมิดสิทธิ์ผู้อื่น สร้างมัลแวร์ หรือเนื้อหาที่ผิดนโยบายของผู้ให้บริการ AI ห้ามใช้โปรแกรมอัตโนมัติยิงคำขอ หรือพยายามเลี่ยงลิมิต'],
  ['7. คำตอบจาก AI', 'คำตอบสร้างโดย AI อาจไม่ถูกต้อง ไม่ครบถ้วน หรือล้าสมัย ผู้ใช้ควรตรวจสอบก่อนนำไปใช้ โดยเฉพาะเรื่องการแพทย์ กฎหมาย และการเงิน เราไม่รับผิดชอบความเสียหายจากการนำคำตอบไปใช้'],
  ['8. การเปลี่ยนแปลงบริการ', 'เราอาจหยุดให้บริการชั่วคราวเพื่อปรับปรุงระบบ หรือเมื่อผู้ให้บริการ AI ขัดข้อง และอาจแก้ไขเงื่อนไขนี้ได้ การใช้งานต่อหลังแก้ไขถือว่ายอมรับเงื่อนไขใหม่'],
];
const PRIVACY = [
  ['ข้อมูลที่เราเก็บ', 'อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว เราอ่านไม่ได้) ประวัติแชต สถิติการใช้งาน (จำนวน token และเวลา) และรูปสลิปการโอนเงิน'],
  ['เราใช้ข้อมูลทำอะไร', 'ใช้เพื่อให้บริการ คำนวณลิมิต ตรวจสอบการชำระเงิน และแก้ปัญหาการใช้งาน เราไม่ขายข้อมูลของคุณ'],
  ['การส่งข้อมูลให้ผู้ให้บริการ AI', 'ข้อความและรูปที่คุณส่งในแชตจะถูกส่งไปยังผู้ให้บริการ AI ของโมเดลที่คุณเลือก เพื่อสร้างคำตอบ ผู้ให้บริการเหล่านั้นอยู่ต่างประเทศและมีนโยบายข้อมูลของตัวเอง โปรดอย่าส่งข้อมูลส่วนตัวที่อ่อนไหว เช่น เลขบัตรประชาชน หรือรหัสผ่าน'],
  ['การจัดเก็บ', 'ข้อมูลเก็บบน Cloudflare รูปที่แนบในแชตไม่ถูกเก็บไว้หลังส่งให้ AI แล้ว'],
  ['สิทธิ์ของคุณ', 'ลบแชตได้เองทุกเมื่อจากเมนูด้านข้าง หากต้องการลบบัญชีและข้อมูลทั้งหมด หรือขอสำเนาข้อมูล ติดต่อแอดมิน เราจะดำเนินการภายใน 30 วัน ข้อมูลการชำระเงินอาจเก็บต่อตามที่กฎหมายกำหนด'],
];
function terms() {
  const sec = (t, rows) => `<div class="band legal"><h2>${t}</h2>${rows.map(([h, p]) => `<div class="tile"><div style="font:600 17px var(--display)">${h}</div><p class="muted" style="font-size:15px;margin:0">${p}</p></div>`).join('')}</div>`;
  page(nav() + `<div class="wrap" style="max-width:760px"><section class="hero" style="padding:48px 0 8px"><h1>เงื่อนไขและความเป็นส่วนตัว</h1><p>มีผลตั้งแต่ 11 พฤศจิกายน 2569</p></section>
    ${sec('เงื่อนไขการใช้บริการ', TERMS)}${sec('นโยบายความเป็นส่วนตัว', PRIVACY)}
    <p class="muted" style="text-align:center;padding-bottom:48px">มีคำถามเกี่ยวกับเงื่อนไขนี้ ติดต่อแอดมิน</p></div>`);
}
const footer = () => `<p class="muted" style="text-align:center;padding:24px 0 48px">© AstraCode · <a href="#/terms">เงื่อนไขและความเป็นส่วนตัว</a></p>`;

// ---------- router ----------
async function route() {
  document.querySelector('.shade')?.remove();
  if (chat.busy) chat.ctrl?.abort();
  const [, pg, arg] = location.hash.split('/');
  try {
    if (pg === 'login') return me ? (location.hash = '#/chat') : auth();
    if (pg === 'chat') return chatView(arg);
    if (pg === 'plans') return plansPage();
    if (pg === 'account') return account();
    if (pg === 'terms') return terms();
    if (pg === 'admin') return adminView(arg);
    return me ? (location.hash = '#/chat') : landing();
  } catch (x) {
    if (!me) return location.hash = '#/login';
    page(nav() + `<p class="err" style="text-align:center;margin:48px">${esc(x.message)}</p>`);
  }
}
addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
loadMe().then(route);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
