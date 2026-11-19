const WHATS_NEW = 'whatsnew:2026-11'; // เปลี่ยนเลขเมื่อมีฟีเจอร์ใหม่ที่อยากบอกผู้ใช้เดิม
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
function stopRun() { if (chat.enhancing) return chat.enhancing.abort(); if (chat.id) fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: chat.id }) }).catch(() => {}); chat.ctrl?.abort(); }
// สลับแชตโดยไม่โหลดหน้าใหม่
function openChat(id) { if (chat.busy) stopRun(); setUrl(id ? '/chat?id=' + id : '/chat'); chatView(id); }
addEventListener('popstate', () => { if (pageName() === 'chat') chatView(qs().get('id')); });
PAGES.chat = () => chatView(qs().get('id'));
function notice(u) {
  if (u.pct4h >= 100 || u.pctWeek >= 100)
    return `<div class="notice full">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)}${me.balance >= 1 ? ' · โมเดลนอกแพลนยังใช้ได้ด้วย Wallet' : ''} <a class="btn blue sm" href="/plans?topup=1">เติมเงิน</a> <a class="btn out sm" href="/plans">Upgrade</a></div>`;
  const p = Math.max(u.pct4h, u.pctWeek);
  // ใช้ Wallet อย่างเดียว (ไม่มีแพลน) แล้วเงินใกล้หมด: เตือนก่อนส่งไม่ได้
  if (!me.plan?.paid && me.balance > 0 && me.balance < 10) return `<div class="notice hi">เงินใน Wallet เหลือ ฿${(+me.balance).toFixed(2)} · <a href="/plans?topup=1">เติมเงิน (ขั้นต่ำ ฿10)</a></div>`;
  return p >= 80 ? `<div class="notice hi">ใช้ลิมิตไปแล้ว ${p}% · <a href="/plans">อัปเกรดเพื่อใช้ได้มากขึ้น</a></div>` : '';
}
function setUsage(u) { me.usage = u; $('#lim').innerHTML = limHTML(u); $('#notice').innerHTML = notice(u); }
// "อัตโนมัติ": เซิร์ฟเวอร์เลือกโมเดลถูกหรือเก่งตามคำถาม (ประหยัดลิมิต)
const AUTO = () => ({ id: 'auto', name: 'อัตโนมัติ', effort: me.models.some(m => m.effort !== 'none') ? 'auto' : 'none', vision: me.models.some(m => m.vision) });
// ข้อความที่ดูเป็นข้อมูลส่วนตัว/ความชอบถาวร: เน้นปุ่มจำ ให้กดบันทึกเป็นความจำได้ในคลิกเดียว
const MEM_RE = /(^|\s)(ฉัน|ผม|หนู|เรา|ดิฉัน)(ชื่อ|ชอบ|ไม่ชอบ|ทำงาน|เป็น|ใช้|อยาก|ถนัด)|จำไว้|ต่อไปนี้ให้|ทุกครั้งให้|\b(my name is|i am a|i work|i prefer|i always|remember that|from now on|call me)\b/i;
const curModel = () => $('#model')?.value === 'auto' ? AUTO() : me.models.find(m => m.id === +$('#model')?.value) || me.models[0];

async function chatView(id) {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  chat = { ...chat, id: id ? +id : null, msgs: id ? await api('/chats/' + id).catch(() => []) : [], busy: false, images: [], files: [], compare: false, cmp: [], agSid: null };
  autoRetry = 0;
  for (const m of chat.msgs) if (typeof m.sources === 'string') try { m.sources = JSON.parse(m.sources); } catch { m.sources = null; }
  const saved = localStorage.getItem('model'), opt = sel => me.models.filter(m => !m.locked).map(m => `<option value="${m.id}" ${String(m.id) === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  app.innerHTML = `<div class="chat view"><aside class="side" id="side">
      <div class="side-top">
        <a class="logo" href="/">AstraCode</a>
        <button type="button" class="icon-btn sm ghost" id="sbtn" aria-label="Search chats">${ic('search')}</button>
      </div>
      <div class="side-search" id="sbox" hidden><input id="search" placeholder="Search chats…" aria-label="Search chats"></div>
      <nav class="side-nav">
        <a href="/support" class="contact-l">${ic('mail')}<span>ติดต่อเรา / แจ้งปัญหา</span></a>
        <a href="/code">${ic('code')}<span>Code</span></a>${deskLink()}
        <a href="/plans">${ic('layers')}<span>Plans · ${esc(me.plan.name)}</span></a>
        <a href="/plans?topup=1">${ic('wallet')}<span>เติมเงิน · ฿${baht(me.balance)}</span></a>
        <a href="/pricing">${ic('tag')}<span>Pricing</span></a>
        <a href="/developers">${ic('braces')}<span>Developer API</span></a>
        ${['admin', 'support', 'viewer'].includes(me.role) ? `<a href="/admin">${ic('dash')}<span>Admin</span></a>` : ''}
      </nav>
      <div class="side-sec"><span>Folders &amp; recent</span><span><button type="button" class="icon-btn xs ghost" id="bmk" aria-label="บุ๊กมาร์ก" title="บุ๊กมาร์ก">${ic('star', 'sm')}</button><button type="button" class="icon-btn xs ghost" id="bin" aria-label="เก็บถาวรและถังขยะ" title="เก็บถาวร / ถังขยะ">${ic('trash')}</button><button type="button" class="icon-btn xs ghost" id="newf" aria-label="สร้างโฟลเดอร์ใหม่" title="สร้างโฟลเดอร์">${ic('plus')}</button></span></div>
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
      <div class="compose"><button type="button" class="scroll-fab" id="sdown" hidden aria-label="เลื่อนลงล่างสุด">${ic('down')}</button><div id="notice">${notice(me.usage)}</div><div class="err" id="e"></div><div class="thumbs" id="thumbs"></div><div id="flags" class="cflags"></div>
        <form id="f" class="cbox"><input type="file" id="file" multiple hidden>
          <textarea id="t" rows="1" placeholder="ถามอะไรก็ได้ · พิมพ์ / เลือก Skill" aria-label="ข้อความ"></textarea>
          <div class="crow"><button type="button" class="cb" id="plus" aria-label="แนบไฟล์และเครื่องมือ">${ic('plus')}</button>${('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? `<button type="button" class="cb" id="mic" aria-label="พิมพ์ด้วยเสียง">${ic('mic')}</button>` : ''}
            <button type="button" class="cb pick" id="mdl" aria-haspopup="dialog"></button>
            <button type="button" class="cb pick" id="mdl2" aria-haspopup="dialog" hidden></button>
            <button type="button" class="cb pick" id="eff" aria-haspopup="dialog"></button>
            
            <button class="send" id="go" aria-label="ส่ง">${ic('up')}</button></div></form></div></div>
    <aside class="canvas" id="canvas" hidden>
      <div class="cv-h"><b>Canvas</b><div class="seg" style="margin:0"><button type="button" data-cv="prev" class="on">Preview</button><button type="button" data-cv="code">Code</button></div><span class="sp"></span><button type="button" class="btn out sm" id="cv-cp">Copy</button><button type="button" class="btn out sm" id="cv-tc">ส่งไป Code</button><button type="button" class="icon-btn sm ghost" id="cv-x" aria-label="ปิด Canvas">${ic('x')}</button></div>
      <div class="cv-b"><iframe id="cv-f" sandbox="allow-scripts allow-modals allow-forms allow-popups" title="Canvas Preview"></iframe><pre id="cv-c" hidden><code></code></pre></div>
    </aside></div>`;
  const side = $('#side');
  side.addEventListener('click', e => { const a = e.target.closest('a[data-chat]'); if (!a) return; e.preventDefault(); openChat(+a.dataset.chat || null); });
  $('#menu').onclick = () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; side.parentElement.append(s); }; // ใส่ในกล่องเดียวกับเมนู ไม่งั้นเงาจะทับเมนู
  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };
  if (!window.DEMO && !id) try { // แนะนำครั้งแรก 3 ข้อ (ครั้งเดียวต่อเครื่อง)
    if (!localStorage.getItem('onb')) { localStorage.setItem('onb', '1');
      sheet('เริ่มใช้ AstraCode', `<div class="sheet-form"><p class="sheet-msg"><b>1. เลือกโมเดลหรือปล่อย Auto</b><br>Auto เลือกโมเดลที่คุ้มสุดให้ตามความยากของคำถาม เปลี่ยนเองได้ที่ปุ่มชื่อโมเดล</p>
        <p class="sheet-msg"><b>2. พิมพ์ / เพื่อใช้ Skill</b><br>เช่น /translator /summarizer /code-reviewer ให้ AI ทำงานตามบทบาทนั้น</p>
        <p class="sheet-msg"><b>3. โหมด Code</b><br>ให้ AI สร้างและแก้ไฟล์จริง รันดูผลได้ทันที เปิดจากเมนู Code</p>
        <p class="sheet-msg"><b>คุณใช้ AstraCode เพื่ออะไร?</b><br><small class="muted">เลือกแล้วเราเปิด Skill ที่เหมาะให้ (ปิดได้ทีหลังที่ปุ่ม +)</small></p>
        <div class="sheet-acts" style="flex-wrap:wrap"><button type="button" class="btn out" data-goal="code">เขียนโค้ด</button><button type="button" class="btn out" data-goal="work">งานเอกสาร/อีเมล</button><button type="button" class="btn out" data-goal="study">เรียน/หาความรู้</button><button type="button" class="btn blue x">ข้ามไปก่อน</button></div></div>`, d => d.querySelectorAll('[data-goal]').forEach(b => b.onclick = async () => {
        const want = { code: ['code-reviewer', 'refactor-clean', 'sql-helper'], work: ['email-writer', 'summarizer', 'thai-pro-writer'], study: ['study-tutor', 'explain-simple', 'translator'] }[b.dataset.goal], all = await loadSkills();
        chat.skills = want.map(n => all.find(s => s.name === n)?.id).filter(Boolean); localStorage.setItem('skills', JSON.stringify(chat.skills)); modelUI();
        d.remove(); toast(chat.skills.length ? 'เปิด Skill ที่เหมาะให้แล้ว' : 'ตั้งค่าเรียบร้อย', 'ok');
      })); localStorage.setItem(WHATS_NEW, '1'); } // คนใหม่ไม่ต้องเห็น "มีอะไรใหม่"
    else if (!localStorage.getItem(WHATS_NEW)) { localStorage.setItem(WHATS_NEW, '1'); // ผู้ใช้เดิม: บอกฟีเจอร์ใหม่ครั้งเดียว
      sheet('มีอะไรใหม่', `<div class="sheet-form">
        <p class="sheet-msg"><b>${ic('search', 'sm')} Deep research</b><br>กด + แล้วเลือก Deep research ทีม AI ค้นเว็บหลายหัวข้อพร้อมกัน แล้วเขียนรายงานพร้อมอ้างอิงให้ ปิดแอปได้</p>
        <p class="sheet-msg"><b>${ic('server', 'sm')} ทีม Agent ในโหมด Code</b><br>หัวหน้าแบ่งงาน ลูกทีมหลายตัวเขียนไฟล์พร้อมกัน แล้วตรวจรวม คุณตรวจแผนก่อนเริ่มได้</p>
        <p class="sheet-msg"><b>${ic('trash', 'sm')} ถังขยะ</b><br>ลบแชตแล้วกู้คืนได้ 30 วัน และเก็บแชตเข้าที่เก็บถาวรได้ (ไอคอนถังขยะในแถบข้าง)</p>
        <p class="sheet-msg"><b>${ic('book', 'sm')} คลัง Prompt</b><br>พรอมต์ที่บันทึกไว้ใช้ได้ทุกเครื่อง พิมพ์ / ในช่องข้อความเพื่อเลือก</p>
        <button type="button" class="btn blue" data-x>เข้าใจแล้ว</button></div>`, (d, close) => d.querySelector('[data-x]').onclick = close);
    }
  } catch { /* ไม่มีที่เก็บ */ }
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
  $('#flags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'img') exitImageMode(); if (f === 'enh') enhancePrompt(false); if (f === 'enhauto') { localStorage.setItem('imgAuto', localStorage.getItem('imgAuto') === '0' ? '1' : '0'); modelUI(); } if (f === 'web') toggleWeb(); if (f === 'pc') { localStorage.setItem('pc', '0'); modelUI(); } if (f === 'pcset') pcSheet(); if (f === 'pcag') { localStorage.setItem('pcAgent', '0'); modelUI(); } if (f === 'kb') { localStorage.setItem('kb', '0'); modelUI(); } if (f === 'voice') toggleVoice(); if (f === 'cmp') toggleCompare(); if (f === 'sk') { chat.skills = chat.skills.filter(x => x !== +e.target.closest('[data-sid]').dataset.sid); localStorage.setItem('skills', JSON.stringify(chat.skills)); modelUI(); }
    if (f === 'mc') { chat.mcps = chat.mcps.filter(x => x !== +e.target.closest('[data-mid]').dataset.mid); localStorage.setItem('mcps', JSON.stringify(chat.mcps)); modelUI(); } };
  app.querySelector('[data-new]').onclick = e => { e.preventDefault(); openChat(null); };
  $('#bin').onclick = binSheet; $('#bmk').onclick = bookmarksSheet;
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
      if (!chat.hits.length && q.length >= 3) { // ไม่เจอคำตรงตัว: ลองค้นตามความหมาย (คำใกล้เคียงไทย/อังกฤษ)
        if ($('#search')?.value.trim() === q) { chat.hits = null; drawSide(); }
        chat.hits = await api('/chats/search?smart=1&q=' + encodeURIComponent(q)).catch(() => []);
      }
      if ($('#search')?.value.trim() === q) drawSide();
    }, 250);
  };
  $('#cv-x').onclick = () => { $('#canvas').hidden = true; };
  $('#cv-cp').onclick = e => copy(chat.cvCode || '', e.target);
  $('#cv-tc').onclick = async e => { // เก็บหน้าที่ AI เขียนเป็นโปรเจกต์ใหม่ใน Code
    const code = chat.cvCode || '', svg = /^\s*<svg/i.test(code), b = e.target; b.disabled = true;
    try { const r = await api('/projects', { method: 'POST', body: { name: 'จาก Canvas ' + new Date().toLocaleDateString(LOC), files: { 'index.html': svg ? `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>` : code } } }); location.href = '/code?p=' + r.id; }
    catch (x) { toast(x.message, 'bad'); b.disabled = false; }
  };
  app.querySelectorAll('[data-cv]').forEach(b => b.onclick = () => {
    app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x === b));
    const isCode = b.dataset.cv === 'code';
    $('#cv-f').hidden = isCode; $('#cv-c').hidden = !isCode;
  });
  pcInit(); setTimeout(remoteWatch, 400);
  const t = $('#t');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  const skTok = qs().get('skill'); // เปิดจากลิงก์แชร์ Skill: นำเข้าแล้วเปิดใช้ทันที
  if (skTok) api('/skills/import', { method: 'POST', body: { token: skTok } }).then(async s => { await loadSkills(true); if (!chat.skills.includes(s.id) && chat.skills.length < 3) chat.skills.push(s.id); localStorage.setItem('skills', JSON.stringify(chat.skills)); skillModel(s); modelUI(); toast(`เพิ่ม Skill "${s.name}" แล้ว`, 'ok'); }).catch(x => toast(x.message, 'bad'));
  const shared = [qs().get('title'), qs().get('text'), qs().get('url')].filter(Boolean).join('\n'); // ข้อความที่แชร์มาจากแอปอื่น (manifest share_target)
  if (shared && !qs().get('id')) { t.value = shared.slice(0, 20000); setTimeout(() => t.oninput(), 0); }
  const shf = (qs().get('shared') || '').match(/^([0-9a-f]{16})\.([1-4])$/); // ไฟล์ที่แชร์มาจากแอปอื่น: ดึงมาแนบในแชตใหม่
  if (shf && !qs().get('id')) Promise.all(Array.from({ length: +shf[2] }, async (_, i) => { const r = await fetch(`/api/shared/${shf[1]}/${i}`); if (!r.ok) return null; return new File([await r.blob()], decodeURIComponent(r.headers.get('x-name') || 'file'), { type: r.headers.get('content-type') || '' }); }))
    .then(fs => { fs = fs.filter(Boolean); if (fs.length) addFiles(fs); else toast('ไฟล์ที่แชร์หมดอายุแล้ว แชร์ใหม่อีกครั้ง', 'bad'); history.replaceState(null, '', '/chat'); }).catch(() => {});
  slashSkills(t, () => chat.skills, ids => { chat.skills = ids; localStorage.setItem('skills', JSON.stringify(ids)); modelUI(); });
  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } };
  $('#f').onsubmit = e => { e.preventDefault(); chat.busy ? stopRun() : send(); };
  $('#file').onchange = async e => { await addFiles([...e.target.files]); e.target.value = ''; };
  // เลือกข้อความในคำตอบ → แถบลอย "อธิบาย / แปล / ถามต่อ" เหนือช่องพิมพ์ (มือถือ: เมนูคัดลอกของระบบบังบริเวณข้อความ จึงไม่วางติดข้อความ)
  let selT = null;
  document.onselectionchange = () => { clearTimeout(selT); selT = setTimeout(() => { // ตั้งแทนที่ (ไม่ใช่ addEventListener): เปิดแชตใหม่กี่ครั้งก็มีตัวฟังตัวเดียว แถบเดียว
    let selBar = document.querySelector('.selbar');
    const sel = getSelection(), txt = sel?.toString().trim() || '', node = sel?.anchorNode?.parentElement;
    if (!txt || txt.length < 2 || !node?.closest('#msgs .msg')) { selBar?.remove(); selBar = null; return; }
    if (!selBar) { selBar = document.createElement('div'); selBar.className = 'selbar'; $('#f').before(selBar); }
    const q = txt.slice(0, 1500).replace(/\n/g, '\n> ');
    selBar.innerHTML = [['explain', 'อธิบายตรงนี้', 'อธิบายส่วนนี้ให้ละเอียดและเข้าใจง่ายขึ้น'], ['tr', 'แปล', 'แปลส่วนนี้ (ไทย↔อังกฤษ)'], ['ask', 'ถามต่อ', '']].map(([k, l]) => `<button type="button" data-sel="${k}">${l}</button>`).join('');
    selBar.querySelectorAll('[data-sel]').forEach((b, i) => b.onpointerdown = e => { e.preventDefault(); const p = ['อธิบายส่วนนี้ให้ละเอียดและเข้าใจง่ายขึ้น', 'แปลส่วนนี้ (ไทย↔อังกฤษ)', ''][i];
      t.value = `> ${q}\n\n${p}`; selBar.remove(); selBar = null; getSelection().removeAllRanges(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.oninput(); if (p) $('#f').requestSubmit(); });
  }, 250); };
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
    if (b.dataset.zip) zipFiles(+b.dataset.zip, b).catch(x => toast('ทำ zip ไม่ได้: ' + x.message, 'bad'));
    if (b.classList.contains('run-code')) openCanvas(b.closest('.code').querySelector('code').textContent);
    if (b.classList.contains('run-py')) runPyChat(b.closest('.code'));
    if (b.dataset.edit != null) editMsg(+b.dataset.edit);
    if (b.dataset.star != null) { const m = chat.msgs[+b.dataset.star], on = !m.starred; api(`/messages/${m.id}/star`, { method: 'POST', body: { on } }).then(() => { m.starred = on ? 1 : 0; renderAll(); toast(on ? 'บุ๊กมาร์กแล้ว ดูได้ที่เมนูแชต → บุ๊กมาร์ก' : 'เลิกบุ๊กมาร์กแล้ว', on ? 'ok' : ''); }).catch(x => toast(x.message, 'bad')); }
    if (b.dataset.branch != null && chat.id) api(`/chats/${chat.id}/branch`, { method: 'POST', body: { message_id: chat.msgs[+b.dataset.branch]?.id } }).then(r => { toast('แตกกิ่งเป็นแชตใหม่แล้ว', 'ok'); go('/chat?id=' + r.id); }).catch(x => toast(x.message, 'bad'));
    if (b.dataset.say != null) { // อ่านออกเสียงด้วยเสียงของเครื่อง (กดซ้ำ = หยุด)
      const sy = speechSynthesis; if (sy.speaking) return sy.cancel();
      const txt = String(chat.msgs[+b.dataset.say]?.content || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>\u2063]/g, '').slice(0, 4000), ut = new SpeechSynthesisUtterance(txt);
      ut.lang = /[\u0E00-\u0E7F]/.test(txt) ? 'th-TH' : 'en-US'; sy.speak(ut);
    }
    if (b.dataset.mem != null) remember(chat.msgs[+b.dataset.mem], b);
    if (b.dataset.rem != null) remember({ content: parseMem(chat.msgs[+b.dataset.rem].content).mem }, b);
    if (b.dataset.copy) { const r = bubbleText(b.closest('.msg')); copy(r?.text || chat.msgs[+b.dataset.copy].content, b, r?.html); }
    if (b.dataset.vote != null) { const m = chat.msgs[+b.dataset.vote], v = m.vote === +b.dataset.v ? 0 : +b.dataset.v; api('/feedback', { method: 'POST', body: { message_id: m.id, vote: v } }).then(() => { m.vote = v || null; renderAll(); }).catch(x => toast(x.message, 'bad')); }
    if (b.dataset.report != null) reportMsg(chat.msgs[+b.dataset.report]);
    if (b.dataset.regen != null) send({ regenerate: true });
    if (b.dataset.s != null) { t.value = SUGGEST[+b.dataset.s][2]; t.focus(); t.oninput(); }
  };
  $('#lim').innerHTML = limHTML(me.usage); modelUI(); renderAll(); loadSide();
  if (chat.id && chat.msgs.at(-1)?.role === 'user') send({ resume: true }); // ข้อความล่าสุดยังไม่มีคำตอบ: ต่อสตรีมที่ AI ยังทำอยู่
}

// วิเคราะห์ข้อมูลในแชต: รันบล็อก Python ด้วย Pyodide ในเบราว์เซอร์ · ไฟล์ที่แนบในแชตนี้อยู่ในโฟลเดอร์เดียวกัน (เปิดด้วยชื่อไฟล์ได้เลย) · กราฟ matplotlib แสดงเป็นรูป
let pyChat = null;
function runPyChat(block) {
  const code = block.querySelector('code').textContent, files = new Map();
  for (const m of chat.msgs) if (m.role === 'user') for (const f of String(m.content || '').matchAll(FILE_RE)) {
    const name = f[1].replace(/[^\w.\-ก-๙]/g, '_'), sheets = f[2].split(/^--- ชีต (.+) ---$/m);
    if (sheets.length > 1) for (let i = 1; i < sheets.length; i += 2) files.set(name.replace(/\.\w+$/, '') + '__' + sheets[i].replace(/[^\w\-ก-๙]/g, '_') + '.csv', sheets[i + 1].trim()); // Excel: แยกชีตละไฟล์ CSV
    else files.set(name, f[2]);
  }
  let out = block.querySelector('.pyout'); if (!out) { out = document.createElement('div'); out.className = 'pyout'; block.append(out); }
  out.innerHTML = '<pre class="muted">กำลังเตรียม Python…</pre>'; const pre = out.querySelector('pre'); let txt = '';
  pyChat?.terminate(); const w = pyChat = new Worker('/pyworker.js'), kill = setTimeout(() => { w.terminate(); pre.textContent = (txt + '\n(หยุด: รันนานเกิน 90 วินาที)').trim(); }, 90e3);
  w.onmessage = e => { const d = e.data;
    if (d.status && !txt) pre.textContent = d.status;
    if (d.out != null || d.err) { txt += (d.out ?? d.err) + '\n'; pre.textContent = txt.slice(-20000); pre.classList.toggle('muted', false); }
    if (d.img) out.insertAdjacentHTML('beforeend', `<img src="data:image/png;base64,${d.img}" alt="กราฟ">`);
    if (d.done) { clearTimeout(kill); if (!txt && !out.querySelector('img')) pre.textContent = 'รันเสร็จ (ไม่มีผลลัพธ์ ลองใส่ print())'; }
  };
  w.postMessage({ files: [...[...files].map(([path, content]) => ({ path, content })), { path: '__main__.py', content: code }], main: '__main__.py' });
}
function chatInsSheet(id, cur) {
  sheet('คำสั่งเฉพาะแชตนี้', `<form class="sheet-form" id="cif"><p class="muted" style="margin:0">AI จะทำตามคำสั่งนี้ทุกข้อความในแชตนี้เท่านั้น (เว้นว่าง = ไม่มี)</p><textarea name="v" rows="5" maxlength="2000" placeholder="เช่น ตอบสั้นๆ เป็นข้อๆ และใช้ภาษาอังกฤษ">${esc(cur || '')}</textarea><button class="btn blue">บันทึก</button></form>`, (d, close) => {
    d.querySelector('#cif').onsubmit = async e => { e.preventDefault(); const v = new FormData(e.target).get('v'); try { await api('/chats/' + id, { method: 'PUT', body: { instructions: v } }); const c = chat.chats.find(x => x.id === id); if (c) c.instructions = v; close(); toast('บันทึกแล้ว', 'ok'); } catch (x) { toast(x.message, 'bad'); } };
  });
}
async function bookmarksSheet() {
  const draw = async (d, q = '') => { const list = await api('/bookmarks' + (q ? '?q=' + encodeURIComponent(q) : '')).catch(() => []);
    d.querySelector('#bml').innerHTML = list.map(b => `<a class="mem tm" style="display:block;color:inherit" href="/chat?id=${b.chat_id}#m${b.id}"><small class="muted">${esc(b.title)} · ${when(b.created_at)}</small><br>${esc(b.content.replace(/[#*`>]/g, '').slice(0, 220))}</a>`).join('') || '<p class="muted">ยังไม่มีบุ๊กมาร์ก กดไอคอนดาวใต้คำตอบเพื่อเก็บไว้</p>'; };
  sheet('บุ๊กมาร์ก', '<div class="sheet-form"><input id="bmq" type="search" placeholder="ค้นหาในบุ๊กมาร์ก" aria-label="ค้นหาในบุ๊กมาร์ก"><div id="bml"><p class="muted">กำลังโหลด...</p></div></div>', d => { draw(d); let t; d.querySelector('#bmq').oninput = e => { clearTimeout(t); t = setTimeout(() => draw(d, e.target.value.trim()), 300); }; });
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
  const img = isImgMode(); $('#t').placeholder = img ? 'บรรยายภาพที่อยากได้ · แนบรูปเป็นตัวอย่างได้' : 'ถามอะไรก็ได้ · พิมพ์ / เลือก Skill';
  $('#flags').innerHTML = (img ? `<button type="button" class="flag on" data-flag="img" aria-label="ออกจากโหมดสร้างภาพ">${ic('palette', 'sm')}สร้างภาพ${ic('x', 'sm')}</button><button type="button" class="flag" data-flag="enh">${ic('sparkles', 'sm')}ปรับ prompt</button><button type="button" class="flag ${localStorage.getItem('imgAuto') !== '0' ? 'on' : ''}" data-flag="enhauto" aria-pressed="${localStorage.getItem('imgAuto') !== '0'}">ปรับอัตโนมัติ: ${localStorage.getItem('imgAuto') !== '0' ? 'เปิด' : 'ปิด'}</button>` : '')
    + (localStorage.getItem('web') === '1' && site.search ? `<button type="button" class="flag" data-flag="web" aria-label="ปิดค้นเว็บ">${ic('globe', 'sm')}ค้นเว็บ${ic('x', 'sm')}</button>` : '')
    + (PCD && !pcOn() && !img ? `<button type="button" class="flag on" data-flag="pcset">${ic('folder', 'sm')}ให้ AI ทำงานในคอม: เลือกโฟลเดอร์</button>` : '') // ในแอป: ปุ่มเห็นชัด ไม่งั้นลูกค้าไม่รู้ว่าต้องเปิดเอง แล้ว AI ได้แค่บอกให้รันเอง
    + (pcOn() ? `<button type="button" class="flag" data-flag="pc" aria-label="ปิดใช้คอมเครื่องนี้">${ic('folder', 'sm')}${esc(chat.pc.name)}${ic('x', 'sm')}</button>` : '')
    + (agentOn() ? `<button type="button" class="flag on" data-flag="pcag" aria-label="ปิดโหมด Agent">${ic('sparkles', 'sm')}Agent · ${esc(AG_MODES.find(x => x[0] === agMode())[2])}${ic('x', 'sm')}</button>` : '')
    + (chat.compare ? `<button type="button" class="flag" data-flag="cmp" aria-label="ปิดโหมดเทียบ">${ic('compare', 'sm')}เทียบ${ic('x', 'sm')}</button>` : '')
    + (localStorage.getItem('kb') === '1' ? `<button type="button" class="flag" data-flag="kb">${ic('book', 'sm')}คลังความรู้</button>` : '') + (chat.voice ? `<button type="button" class="flag" data-flag="voice">${ic('mic', 'sm')}โหมดเสียง</button>` : '')
    + (chat.skills.length && _skillsCache ? chat.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-flag="sk" data-sid="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
    + (chat.mcps.length && _mcpCache ? chat.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-flag="mc" data-mid="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); showErr('โมเดลนี้อ่านรูปไม่ได้ จึงเอารูปออกแล้ว'); }
}
// ปุ่ม +: แผ่นล่างแบบ "ทางลัดแถวบน + รายการไอคอนพร้อมคำอธิบาย" · ชื่อเป็นอังกฤษ คำอธิบายเป็นไทย
const toolRow = (v, icon, title, desc, on) => `<button type="button" class="trow ${on ? 'on' : ''}" data-v="${v}"><span class="tico">${ic(icon)}</span><span class="tbody"><b>${title}</b><small>${desc}</small></span>${on ? `<i class="tchk">${ic('check')}</i>` : ''}</button>`;
// คลังความรู้: เอกสารที่เก็บถาวร (เพิ่มจากไฟล์ที่แนบอยู่ในช่องข้อความ) · เปิดสวิตช์แล้ว AI จะค้นจากคลังทุกคำถาม
async function kbSheet() {
  const docs = await api('/docs').catch(() => []), on = localStorage.getItem('kb') === '1', ready = chat.files.filter(f => f.text);
  sheet('คลังความรู้', `<div class="sheet-form">
    <label class="sw-row"><span class="sw"><input type="checkbox" id="kbon" ${on ? 'checked' : ''}><span></span></span> ใช้คลังความรู้ตอบคำถามในแชต</label>
    ${ready.length ? `<button type="button" class="btn blue sm" id="kbadd">เก็บไฟล์ที่แนบอยู่ลงคลัง (${ready.length})</button>` : '<p class="muted" style="margin:0">แนบไฟล์ในช่องข้อความก่อน (PDF, Word, Excel, ข้อความ) แล้วเปิดหน้านี้อีกครั้งเพื่อเก็บลงคลัง</p>'}
    ${docs.map(d => `<div class="mem tm"><span>${esc(d.name)} <small class="muted">${Math.round(d.size / 1000)}k ตัวอักษร</small></span><button type="button" data-deld="${d.id}" aria-label="ลบ">${ic('x')}</button></div>`).join('') || '<p class="muted">ยังไม่มีเอกสารในคลัง (เก็บได้ 20 เอกสาร)</p>'}
  </div>`, d => {
    d.querySelector('#kbon').onchange = e => { localStorage.setItem('kb', e.target.checked ? '1' : '0'); modelUI(); };
    const add = d.querySelector('#kbadd'); if (add) add.onclick = async () => {
      add.disabled = true; let n = 0;
      for (const f of ready) { try { await api('/docs', { method: 'POST', body: { name: f.name, content: f.text } }); n++; } catch (x) { toast(`${f.name}: ${x.message}`, 'bad'); } }
      if (n) { localStorage.setItem('kb', '1'); toast(`เก็บ ${n} เอกสารลงคลังแล้ว`, 'ok'); } kbSheet();
    };
    d.querySelectorAll('[data-deld]').forEach(b => b.onclick = async () => { await api('/docs/' + b.dataset.deld, { method: 'DELETE' }).catch(() => {}); kbSheet(); });
  });
}
// โหมดเสียง: ฟังผู้ใช้ → ส่ง → อ่านคำตอบ → ฟังต่อ จนกว่าจะปิด (ใช้เสียงและตัวรู้จำเสียงของเบราว์เซอร์)
// โหมดเสียงแบบโทรคุย: ฟัง → ส่ง → พูดคำตอบทีละช่วงระหว่างที่ AI ยังเขียน → ฟังต่อ · แตะปุ่มกลางเพื่อพูดแทรก
function vstate(s) {
  const el = $('#vcall'); if (!el) return; chat.vst = s;
  el.querySelector('.vc-s').textContent = { listen: 'กำลังฟัง… พูดได้เลย', think: 'กำลังคิด…', speak: 'กำลังพูด · แตะเพื่อพูดแทรก', idle: 'แตะเพื่อพูด' }[s] || '';
  el.dataset.s = s;
}
function voiceListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!chat.voice || !SR || chat.busy) return;
  try { chat.vrec?.abort(); } catch { /* ไม่ได้ฟังอยู่ */ }
  const rec = chat.vrec = new SR(); rec.lang = window.LANG === 'en' ? 'en-US' : 'th-TH'; rec.interimResults = true; let fin = '';
  const t = $('#t'); rec.onresult = e => { fin = [...e.results].map(r => r[0].transcript).join(''); if (t) { t.value = fin; t.oninput(); } const h = $('#vcall .vc-h'); if (h) h.textContent = fin; };
  rec.onend = () => { if (!chat.voice || chat.vrec !== rec) return; if (fin.trim()) { vstate('think'); send(); } else if (document.visibilityState === 'visible') setTimeout(voiceListen, 400); else vstate('idle'); };
  rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toggleVoice(); toast('ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน', 'bad'); } };
  try { rec.start(); vstate('listen'); } catch { /* กำลังฟังอยู่แล้ว */ }
}
// พูดคำตอบทีละช่วง: ระหว่างสตรีมพูดเมื่อได้ข้อความยาวพอและตัดที่ช่องว่าง/ขึ้นบรรทัด (โค้ดไม่อ่าน) · done = พูดที่เหลือแล้วกลับไปฟัง
function voiceFeed(text, done) {
  if (!chat.voice) return;
  if (!('speechSynthesis' in window)) { if (done) voiceListen(); return; }
  let rest = text.slice(chat.vpos || 0);
  if (!done) {
    if (rest.includes('```') || rest.length < 80) return;
    const cut = Math.max(rest.lastIndexOf('\n'), rest.lastIndexOf(' ')); if (cut < 40) return;
    rest = rest.slice(0, cut);
  }
  chat.vpos = (chat.vpos || 0) + rest.length;
  const say = rest.replace(/```[\s\S]*?(```|$)/g, ' (มีโค้ดในคำตอบ) ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[#*_`>|⁣]/g, '').trim();
  if (say) {
    const ut = new SpeechSynthesisUtterance(say.slice(0, 1500)); ut.lang = /[฀-๿]/.test(say) ? 'th-TH' : 'en-US';
    chat.vpend = (chat.vpend || 0) + 1; vstate('speak');
    ut.onend = ut.onerror = () => { chat.vpend = Math.max(0, chat.vpend - 1); if (!chat.vpend && chat.vdone && chat.voice) voiceListen(); };
    speechSynthesis.speak(ut);
  }
  if (done) { chat.vdone = true; if (!chat.vpend) voiceListen(); }
}
const voiceSpeak = text => { chat.vpos = 0; chat.vpend = 0; voiceFeed(text, true); };
function voiceReset() { chat.vpos = 0; chat.vpend = 0; chat.vdone = false; try { speechSynthesis?.cancel(); } catch { /* ไม่มี */ } }
function toggleVoice() {
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return toast('เบราว์เซอร์นี้ไม่รองรับโหมดเสียง ลอง Chrome หรือ Safari', 'bad');
  chat.voice = !chat.voice;
  $('#vcall')?.remove();
  if (chat.voice) {
    document.body.insertAdjacentHTML('beforeend', `<div id="vcall" class="vcall" role="dialog" aria-label="โหมดเสียง"><div class="vc-s" aria-live="polite"></div><button type="button" class="vc-orb" aria-label="พูด / พูดแทรก">${ic('mic')}</button><div class="vc-h"></div><button type="button" class="btn red vc-x">${ic('x', 'sm')} วางสาย</button></div>`);
    const el = $('#vcall');
    el.querySelector('.vc-orb').onclick = () => { if (chat.busy) { stopRun(); } voiceReset(); voiceListen(); };
    el.querySelector('.vc-x').onclick = () => toggleVoice();
    voiceReset(); voiceListen();
  } else { try { chat.vrec?.abort(); } catch { /* ไม่ได้ฟังอยู่ */ } chat.vrec = null; voiceReset(); toast('ปิดโหมดเสียงแล้ว'); }
  modelUI();
}
// เมนู + : เรียงตามความนิยมโดยรวม แล้วดันอันที่ผู้ใช้คนนี้กดบ่อย (ตั้งแต่ 3 ครั้ง) ขึ้นบนสุด 3 อัน · ที่เหลือหลัง 6 อันแรกอยู่ใต้หัวข้อ "เพิ่มเติม"
const TOOL_ORDER = ['pc', 'mcp', 'img', 'web', 'rsch', 'prm', 'voice', 'cmp', 'kb', 'skl', 'exp']; // MCP อยู่บน: ลูกค้าหาไม่เจอตอนอยู่ใต้ "เพิ่มเติม"
const toolUse = () => { try { return JSON.parse(localStorage.getItem('toolUse') || '{}'); } catch { return {}; } };
const toolUsed = v => { try { const u = toolUse(); u[v] = (u[v] || 0) + 1; localStorage.setItem('toolUse', JSON.stringify(u)); } catch { /* ไม่มีที่เก็บ */ } };
function toolRows(web) {
  const defs = {
    pc: PCD && ['folder', 'ใช้คอมเครื่องนี้', chat.pc ? `${pcOn() ? 'เปิดอยู่' : 'ปิดอยู่'} · โฟลเดอร์ ${esc(chat.pc.name)}` : 'AI อ่าน/เขียนไฟล์ รันคำสั่ง และใช้ MCP (เช่น Blender) ในเครื่องนี้', pcOn()],
    img: (me.models.some(m => m.provider === 'image') || site.image) && ['palette', 'สร้างภาพ', me.models.some(m => m.provider === 'image') ? 'สลับเป็นโมเดลสร้างภาพ พิมพ์สิ่งที่อยากได้ AI ช่วยปรับ prompt ให้' : 'พิมพ์สิ่งที่อยากได้ แล้วให้ AI วาดให้', isImgMode()],
    web: site.search && ['globe', 'Web search', 'หาข้อมูลล่าสุดพร้อมแหล่งอ้างอิง', web],
    rsch: site.search && ['search', 'Deep research' + newPill('rsch'), 'ทีม AI ค้นเว็บหลายหัวข้อพร้อมกัน แล้วเขียนรายงานพร้อมอ้างอิง (ปิดแอปได้)'],
    prm: ['book', 'Prompt library', 'คำสั่งสำเร็จรูป เลือกแล้วใช้ได้เลย'],
    voice: ['mic', 'โหมดเสียง', 'พูดคุยกับ AI ต่อเนื่อง: พูด แล้วฟังคำตอบ', chat.voice],
    cmp: ['compare', 'Compare 2 models', 'ถามครั้งเดียว ได้คำตอบจาก 2 โมเดล', chat.compare],
    kb: ['book', 'คลังความรู้', 'เก็บเอกสารไว้ถาวร แล้วถามได้จากทุกแชต', localStorage.getItem('kb') === '1'],
    skl: ['sparkles', 'Skills', 'สอนวิธีทำงานให้ AI · เปิดปิดหรือสร้างเอง'],
    mcp: ['server', 'MCP / ปลั๊กอิน', PCD ? 'ต่อแอปให้ AI ใช้: ปลั๊กอินสำเร็จรูป, MCP ในเครื่อง (Blender ฯลฯ), GitHub/Notion ออนไลน์' : 'ต่อแอปให้ AI ใช้: GitHub, Notion, n8n ผ่าน Remote MCP', (chat.mcps?.length || 0) > 0],
    exp: ['download', 'Export chat', 'บันทึกเป็น Markdown หรือ PDF'],
  }, use = toolUse();
  const avail = TOOL_ORDER.filter(v => defs[v]), mine = avail.filter(v => use[v] >= 3).sort((a, b) => use[b] - use[a]).slice(0, 3);
  const list = [...mine, ...avail.filter(v => !mine.includes(v))], row = v => toolRow(v, ...defs[v]);
  return list.slice(0, 6).map(row).join('') + (list.length > 6 ? `<div class="tsub">เพิ่มเติม</div>${list.slice(6).map(row).join('')}` : '');
}
// โหมดสร้างภาพ = เลือกโมเดลสร้างภาพในช่องพิมพ์ (จำโมเดลเดิมไว้ กด × แล้วกลับ) · ✨ ให้ AI ช่วยปรับ prompt · ปรับอัตโนมัติก่อนส่ง (ปิดได้)
const imgModel = () => me.models.find(m => m.provider === 'image' && !m.locked);
const isImgMode = () => curModel()?.provider === 'image';
function enterImageMode() {
  const im = imgModel(), locked = !im && me.models.find(m => m.provider === 'image');
  if (locked) { toast(`${locked.name} ต้องเติมเครดิต (ขั้นต่ำ ฿1) แล้วจ่ายตามที่ใช้จริง`); return go('/plans?topup=1'); } // มีโมเดลสร้างภาพแต่ล็อก: พาไปเติมเงิน ไม่ใช้ทางสำรองที่ไม่ได้สลับโมเดล
  if (!im) return genImage();
  if (chat.compare) toggleCompare();
  if (!isImgMode()) localStorage.setItem('modelBeforeImg', $('#model').value);
  $('#model').value = im.id; localStorage.setItem('model', im.id); modelUI(); $('#t').focus();
  toast('โหมดสร้างภาพ: พิมพ์สิ่งที่อยากได้แล้วกดส่ง', 'ok');
}
function exitImageMode() {
  const prev = localStorage.getItem('modelBeforeImg'), sel = $('#model'), ok = [...sel.options].some(o => o.value === prev && !me.models.find(m => String(m.id) === prev && m.provider === 'image'));
  sel.value = ok ? prev : [...sel.options].find(o => !me.models.find(m => String(m.id) === o.value && m.provider === 'image'))?.value || sel.value;
  localStorage.setItem('model', sel.value); modelUI();
}
async function enhancePrompt(auto) { // ให้ AI ช่วยเขียน prompt (รูปที่แนบใช้เป็นแรงบันดาลใจ แล้วเอาออก เพราะโมเดลสร้างภาพไม่ได้ใช้รูป)
  const t = $('#t'), text = t.value.trim(), images = chat.images;
  if (!text && !images.length) { if (!auto) toast('พิมพ์ว่าอยากได้ภาพแบบไหนก่อน', 'bad'); return false; }
  const ac = chat.enhancing = new AbortController(), t0 = Date.now();
  const tick = () => { const b = $('[data-flag="enh"]'); if (b) { b.disabled = true; b.innerHTML = ic('sparkles', 'sm') + `AI กำลังปรับ prompt ${Math.round((Date.now() - t0) / 1e3)}s`; } };
  tick(); const iv = setInterval(tick, 1e3);
  if (auto) toast('AI กำลังปรับ prompt ก่อนสร้างภาพ · กดปุ่มหยุดเพื่อยกเลิก');
  try {
    const r = await api('/image/prompt', { method: 'POST', body: { text, images }, signal: ac.signal });
    t.value = r.prompt; chat.enhanced = r.prompt; t.oninput?.(); chat.images = []; drawThumbs();
    if (!auto) toast(`${r.model} ปรับ prompt แล้ว แก้ได้ก่อนกดส่ง`, 'ok'); return true;
  } catch (x) { if (x.name === 'AbortError') toast('ยกเลิกการปรับ prompt แล้ว · ข้อความเดิมยังอยู่'); else if (x instanceof TypeError) return 'net'; else showErr(x.message); return false; }
  finally { clearInterval(iv); chat.enhancing = null; modelUI(); }
}
function toolSheet() {
  const web = localStorage.getItem('web') === '1', vision = curModel()?.vision;
  sheet('Add', `<div class="tquick">
      <button type="button" class="tq" data-v="photos">${ic('image')}<span>Photos</span></button>
      <button type="button" class="tq" data-v="camera">${ic('camera')}<span>Camera</span></button>
      <button type="button" class="tq" data-v="file">${ic('clip')}<span>Files</span></button>
    </div>
    ${vision ? '' : '<p class="tnote">โมเดลที่เลือกอ่านรูปไม่ได้ · เลือกโมเดลที่มีไอคอนตา (เช่น Claude) ถ้าจะส่งรูป</p>'}
    <div class="tlist">${toolRows(web)}</div>`,
    (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      close(); toolUsed(b.dataset.v); const pick = (accept, capture) => { const i = $('#file'); i.accept = accept; if (capture) i.setAttribute('capture', capture); else i.removeAttribute('capture'); i.click(); setTimeout(() => { i.accept = ''; i.removeAttribute('capture'); }, 1000); }; // ใช้ช่องไฟล์เดียวกัน เปลี่ยนแค่ชนิดที่เลือกได้
      ({ photos: () => pick('image/*'), camera: () => pick('image/*', 'environment'), file: () => pick(''), pc: pcSheet, kb: kbSheet, rsch: () => { seen('rsch'); researchSheet(); }, voice: toggleVoice, img: enterImageMode, web: toggleWeb, cmp: toggleCompare, mcp: () => PCD ? mcpHub() : mcpSheet(chat.mcps, ids => { chat.mcps = ids; localStorage.setItem('mcps', JSON.stringify(ids)); modelUI(); }), skl: () => skillsSheet(chat.skills, ids => { chat.skills = ids; localStorage.setItem('skills', JSON.stringify(ids)); modelUI(); }), prm: () => promptLibSheet(p => { const t = $('#t'); t.value = p + t.value; t.oninput(); t.focus(); }), exp: exportMenu })[b.dataset.v]();
    }));
}
// Deep research เบื้องหลัง: สั่งแล้วปิดแอปได้ ผลขึ้นเป็นแชตใหม่ + อีเมล
async function researchSheet() {
  if (!me.plan.paid) return toast('Deep research ใช้ได้กับแพลนที่ชำระเงิน', 'bad');
  const L = { queued: 'รอคิว', running: 'กำลังค้นและเขียน', stopping: 'กำลังหยุด', done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิต', failed: 'ไม่สำเร็จ' };
  const jobs = await api('/agent?research=1').catch(() => []), busy = jobs.find(j => ['queued', 'running', 'stopping'].includes(j.status)), m = curModel();
  sheet('Deep research', `<div class="sheet-form">${busy ? `<p class="sheet-msg"><b>${L[busy.status]}</b><br><small class="muted">${esc(busy.prompt.slice(0, 140))}</small></p><button type="button" class="btn red sm" id="rsx">หยุด</button>`
    : `<textarea id="rsp" rows="4" maxlength="4000" placeholder="อยากรู้เรื่องอะไร เช่น เปรียบเทียบรถยนต์ไฟฟ้าราคาไม่เกิน 1 ล้านในไทยปีนี้">${esc($('#t')?.value || '')}</textarea><button type="button" class="btn blue" id="rsgo">เริ่มค้นคว้า</button><p class="muted" style="margin:0;font-size:12.5px">หัวหน้า: ${esc(m?.name || 'โมเดลที่เลือก')} แบ่งหัวข้อและเขียนรายงาน · ลูกทีม DeepSeek 4.1 Flash สรุปแต่ละหัวข้อพร้อมกัน · ใช้ลิมิตตามจริง</p>`}
    ${jobs.filter(j => j !== busy).slice(0, 5).map(j => `<div class="mem tm" style="display:block"><b>${L[j.status] || j.status}</b> · ${when(j.created_at)}<br><small class="muted">${esc(j.prompt.slice(0, 100))}</small>${j.chat_id ? ` <a href="/chat?id=${j.chat_id}" data-chat="${j.chat_id}">เปิดรายงาน</a>` : ''}</div>`).join('')}</div>`, (d, close) => {
    d.querySelector('#rsgo')?.addEventListener('click', async e => {
      const prompt = d.querySelector('#rsp').value.trim(); if (prompt.length < 10) return toast('อธิบายสิ่งที่อยากรู้ให้ละเอียดขึ้นอีกหน่อย', 'bad');
      const model_id = +(m?.id || me.models[0]?.id); e.target.disabled = true;
      try { await api('/agent', { method: 'POST', body: { model_id, prompt, research: true, effort: $('#effort')?.value || '' } }); close(); toast('เริ่มค้นคว้าแล้ว ปิดแอปได้ รายงานจะขึ้นเป็นแชตใหม่และส่งอีเมล', 'ok'); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; }
    });
    d.querySelector('#rsx')?.addEventListener('click', async () => { await api(`/agent/${busy.id}/stop`, { method: 'POST' }).catch(() => {}); close(); toast('สั่งหยุดแล้ว'); });
    d.querySelectorAll('a[data-chat]').forEach(a => a.onclick = e => { e.preventDefault(); close(); openChat(+a.dataset.chat); });
  });
}
function toggleWeb() { localStorage.setItem('web', localStorage.getItem('web') === '1' ? '0' : '1'); modelUI(); }
function toggleCompare() {
  if (chat.busy) return; chat.compare = !chat.compare;
  const m2 = $('#model2'); if (chat.compare && $('#model').value === 'auto') $('#model').value = me.models[0].id; if (chat.compare && m2.value === $('#model').value) m2.value = me.models.find(m => String(m.id) !== $('#model').value)?.id ?? m2.value; // ตั้งต้นให้ต่างจากตัวแรก
  modelUI(); renderAll();
}
// เก็บถาวร + ถังขยะ: กู้คืนได้ · ถังขยะลบถาวรเองหลัง 30 วัน
async function binSheet() {
  const [arc, tr] = await Promise.all([api('/chats/archived').catch(() => []), api('/chats/trash').catch(() => [])]);
  const row = (c, trash) => `<div class="mem tm"><span>${esc(c.title)}${trash ? ` <small class="muted">เหลือ ${Math.max(1, 30 - Math.floor((Date.now() - c.deleted_at) / 864e5))} วัน</small>` : ''}</span><span><button type="button" class="btn out sm" data-rs="${c.id}">กู้คืน</button>${trash ? `<button type="button" class="icon-btn sm ghost" data-pd="${c.id}" aria-label="ลบถาวร">${ic('x')}</button>` : ''}</span></div>`;
  sheet('เก็บถาวร / ถังขยะ', `<div class="sheet-form"><b>เก็บถาวร (${arc.length})</b>${arc.map(c => row(c, false)).join('') || '<p class="muted" style="margin:0">ว่าง</p>'}<b>ถังขยะ (${tr.length})</b>${tr.map(c => row(c, true)).join('') || '<p class="muted" style="margin:0">ว่าง · ลบแล้วเก็บไว้ 30 วัน</p>'}</div>`, (d, close) => {
    d.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { await api(`/chats/${b.dataset.rs}/restore`, { method: 'POST' }); close(); await loadSide(); toast('กู้คืนแล้ว', 'ok'); });
    d.querySelectorAll('[data-pd]').forEach(b => b.onclick = async () => { if (!await confirmSheet('ลบแชตนี้ถาวร? กู้คืนไม่ได้', { title: 'ลบถาวร', ok: 'Delete forever', danger: true })) return; await api('/chats/' + b.dataset.pd, { method: 'DELETE' }); close(); binSheet(); });
  });
}
async function loadSide() { [chat.chats, chat.folders] = await Promise.all([api('/chats').catch(() => []), api('/folders').catch(() => [])]); drawSide(); head(); }
// หัวแชต: ชื่อ + context ที่ใช้
function head() {
  const ctl = $('#ctl'); if (!ctl) return;
  ctl.textContent = chat.compare ? 'เทียบ 2 โมเดล' : chat.chats.find(c => c.id === chat.id)?.title || 'Chat';
  // แถบ context: ใช้ไปเท่าไรจากขนาด context ของโมเดล (จากคำตอบล่าสุด) · เกิน 70% มีปุ่มย่อแชต
  const cx = !chat.compare && chat.ctx?.id === chat.id ? chat.ctx : null, pct = cx ? Math.min(100, cx.used / cx.max * 100) : 0, pctT = pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct); // context ใหญ่ (1M): ปัดเป็นจำนวนเต็มจะค้างที่ 0% นาน
  $('#ctok').innerHTML = cx ? `<button type="button" class="ctxm ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}" id="ctxopen" title="แตะเพื่อดูว่าอะไรกิน context อยู่เท่าไร">context ${kTok(cx.used)} / ${kTok(cx.max)} (${pctT}%)</button>${pct >= 70 && chat.id ? ' <button type="button" class="linkb" id="cmpct">ย่อแชต</button>' : ''}` : '';
  const co = $('#ctxopen'); if (co) co.onclick = () => ctxSheet({ chatId: chat.id, modelId: +curModel()?.id || null, skills: chat.skills, onCompact: () => { chat.ctx = null; head(); }, onPickModel: id => { $('#model').value = id; localStorage.setItem('model', id); modelUI(); } });
  const cb = $('#cmpct'); if (cb) cb.onclick = async () => { cb.disabled = true; cb.textContent = 'กำลังย่อ...'; try { const r = await api(`/chats/${chat.id}/compact`, { method: 'POST' }); toast(r.ok ? 'ย่อแชตแล้ว ข้อความเก่าถูกสรุปไว้' : 'แชตยังสั้นเกินกว่าจะย่อ', r.ok ? 'ok' : ''); if (r.ok) chat.ctx = null; } catch (x) { toast(x.message, 'bad'); } head(); };
}
const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
function drawSide() {
  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;
  const item = c => `<div class="item ${c.id === chat.id ? 'on' : ''}" data-id="${c.id}"><a href="/chat?id=${c.id}" data-chat="${c.id}">${ic(c.pinned ? 'pin' : { '🤖': 'server', '⏰': 'bell', '📥': 'inbox', '🎨': 'palette' }[[...c.title][0]] || (c.has_code ? 'code' : 'msg'), 'sm ci')}<span>${esc(c.title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''))}</span></a>
    <button data-cmenu="${c.id}" aria-label="ตัวเลือกแชต">${ic('more')}</button></div>`;
  const shown = chat.chats.filter(c => c.title.toLowerCase().includes(q)), open = JSON.parse(localStorage.getItem('fopen') || '{}');
  const pinned = shown.filter(c => c.pinned && !chat.folders.some(f => f.id === c.folder_id));
  const recent = shown.filter(c => !c.pinned && !chat.folders.some(f => f.id === c.folder_id));
  list.innerHTML = (pinned.length ? `<div class="side-sub">ปักหมุด</div>${pinned.map(item).join('')}` : '')
    + chat.folders.map(f => { const cs = shown.filter(c => c.folder_id === f.id); return q && !cs.length ? '' : `<details class="folder" data-f="${f.id}" ${open[f.id] || q ? 'open' : ''}><summary><span>${ic('folder')} ${esc(f.name)}</span><small class="muted">${cs.length}</small><button data-fren="${f.id}" aria-label="ตั้งค่าโฟลเดอร์" title="ชื่อ คำสั่ง และเอกสารประจำโฟลเดอร์">${ic('settings')}</button><button data-fdel="${f.id}" aria-label="ลบโฟลเดอร์">${ic('trash')}</button></summary>${cs.map(item).join('') || '<p class="muted" style="padding:4px 12px;font-size:13px">ว่าง</p>'}</details>`; }).join('')
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
        + optHTML('ins', ic('settings') + 'คำสั่งเฉพาะแชตนี้', 'เช่น "ตอบเป็นภาษาอังกฤษ" หรือ "เป็นครูสอนคณิต" ใช้แค่ในแชตนี้')
        + optHTML('mv', ic('folder') + 'ย้ายไปโฟลเดอร์', c.folder_id ? 'เปลี่ยนหรือเอาออกจากโฟลเดอร์' : 'จัดเก็บเข้าโฟลเดอร์')
        + optHTML('cst', ic('dash') + 'ดูต้นทุนแชตนี้', 'โทเคนที่ใช้และค่าใช้จ่ายโดยประมาณถ้าจ่ายตามใช้')
        + optHTML('arc', ic('inbox') + 'เก็บถาวร', 'ซ่อนจากรายการ ค้นหาและกู้คืนได้ที่ไอคอนถังขยะ')
        + optHTML('del', ic('trash') + 'ลบแชตนี้', 'ย้ายเข้าถังขยะ กู้คืนได้ภายใน 30 วัน'), (sd, close) => {
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
        sd.querySelector('[data-v=ins]').onclick = () => { close(); chatInsSheet(c.id, c.instructions || ''); };
        sd.querySelector('[data-v=ren]').onclick = async () => { close(); const title = await promptSheet('ชื่อแชตใหม่', c.title, { title: 'เปลี่ยนชื่อแชต' }); if (title?.trim()) { await api('/chats/' + c.id, { method: 'PUT', body: { title } }); loadSide(); } };
        sd.querySelector('[data-v=mv]').onclick = () => {
          close();
          if (!chat.folders.length) return toast('ยังไม่มีโฟลเดอร์ กด "+ โฟลเดอร์" ก่อน');
          sheet('ย้ายไปโฟลเดอร์', optHTML('', ic('x') + 'ไม่มีโฟลเดอร์', 'แสดงนอกโฟลเดอร์', !c.folder_id)
            + chat.folders.map(f => optHTML(f.id, ic('folder') + esc(f.name), '', c.folder_id === f.id)).join(''), (fd, fclose) => {
            fd.querySelectorAll('[data-v]').forEach(x => x.onclick = async () => { fclose(); await api('/chats/' + c.id, { method: 'PUT', body: { folder_id: +x.dataset.v || null } }); loadSide(); toast('ย้ายแชตแล้ว', 'ok'); });
          });
        };
        sd.querySelector('[data-v=cst]').onclick = async () => { close(); const x = await api(`/chats/${c.id}/cost`).catch(() => null); if (!x) return toast('โหลดไม่สำเร็จ', 'bad'); sheet('ต้นทุนแชตนี้', `<div class="sheet-form"><p style="margin:0">ตอบแล้ว <b>${x.replies}</b> ครั้ง · โทเคนเข้า <b>${kTok(x.tin)}</b> · โทเคนออก <b>${kTok(x.tout)}</b></p><p style="margin:0">ค่าใช้จ่ายโดยประมาณที่ราคาจ่ายตามใช้ (Wallet/API): <b>฿${x.baht.toFixed(2)}</b></p><p class="muted" style="margin:0">ถ้าใช้ผ่านแพลน ค่านี้ไม่ถูกเรียกเก็บ แต่ใช้เทียบว่าแชตไหนกินลิมิตมาก ไม่นับ cache จึงสูงกว่าจริงเล็กน้อย</p></div>`); };
        sd.querySelector('[data-v=arc]').onclick = async () => { close(); await api('/chats/' + c.id, { method: 'PUT', body: { archived: 1 } }); if (chat.id === c.id) openChat(null); else loadSide(); toast('เก็บถาวรแล้ว'); };
        sd.querySelector('[data-v=del]').onclick = async () => { close(); if (!await confirmSheet(`ลบแชต "${c.title}"? ย้ายเข้าถังขยะ กู้คืนได้ภายใน 30 วัน`, { title: 'ลบแชต', ok: 'Delete', danger: true })) return; await api('/chats/' + c.id, { method: 'DELETE' }); if (chat.id === c.id) openChat(null); else loadSide(); toast('ย้ายเข้าถังขยะแล้ว'); };
      });
    }
    if (d.fren) folderSheet(+d.fren);
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
    + optHTML('doc', ic('filetext') + 'Word (.doc)', 'เปิดแก้ต่อใน Word / Google Docs ได้ พร้อมหัวข้อ ตาราง และโค้ด')
    + optHTML('pdf', ic('download') + 'PDF (พิมพ์)', 'เปิดหน้าพิมพ์ / บันทึกเป็น PDF'), (d, close) => {
    d.querySelector('[data-v=doc]').onclick = () => { // Word เปิดไฟล์ HTML ที่ตั้งนามสกุล .doc ได้ตรง ๆ: ใช้คำตอบที่วาดแล้ว ตัดปุ่มออก
      close(); const box = $('#msgs').cloneNode(true); box.querySelectorAll('button, .acts, svg, script').forEach(x => x.remove());
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:'TH Sarabun New',Tahoma,sans-serif;font-size:14pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}pre{background:#f4f4f4;padding:8px;font-family:Consolas,monospace;font-size:10pt}</style></head><body><h1>${esc(title)}</h1>${box.innerHTML}</body></html>`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/msword' })); a.download = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.doc'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    d.querySelector('[data-v=pdf]').onclick = () => { close(); document.body.classList.add('printing'); print(); setTimeout(() => document.body.classList.remove('printing'), 500); };
    d.querySelector('[data-v=md]').onclick = () => {
      close();
  const md_ = `# ${title}\n\n` + chat.msgs.map(m => m.role === 'user'
    ? `## คุณ\n\n${m.content.replace(FILE_RE, (_, n) => `\n[ไฟล์] ${n}`).trim()}`
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
  } else if (n.endsWith('.zip')) { // zip: แตกในเบราว์เซอร์ · ส่งเก็บที่เซิร์ฟเวอร์ แล้วแนบแค่รายชื่อไฟล์ AI เปิดอ่านเองทีละไฟล์ (รับโปรเจกต์ใหญ่ได้)
    if (f.size > 25e6) throw new Error('zip ต้องไม่เกิน 25MB');
    await lib('jszip'); const z = await JSZip.loadAsync(f), files = {}, bin = [];
    for (const e of Object.values(z.files)) {
      if (e.dir || /(^|\/)(__MACOSX|node_modules|\.git|dist|build|\.next|vendor)\/|\.DS_Store$/.test(e.name)) continue;
      const t = TEXT_EXT.test(e.name) || !/\.[a-z0-9]+$/i.test(e.name.split('/').pop()) ? await e.async('string') : null;
      if (t == null || t.includes('\u0000')) bin.push(e.name); else files[e.name] = t;
    }
    const list = Object.keys(files); if (!list.length) throw new Error('ไม่พบไฟล์ข้อความหรือโค้ดใน zip');
    const head = `[zip: ${list.length} ไฟล์ข้อความ${bin.length ? `, ไฟล์อื่น ${bin.length} ไฟล์ (ไม่ได้อ่าน): ${bin.slice(0, 30).join(', ')}` : ''}]`;
    let id = null;
    try { const fd = new FormData(); fd.append('zip', f); fd.append('files', JSON.stringify(files)); id = (await api('/zipref', { method: 'POST', body: fd })).id; }
    catch (x) { if (!/R2|501/.test(x.message)) throw x; } // เซิร์ฟเวอร์ไม่มีที่เก็บ: แนบทั้งก้อนแบบเดิม
    text = id ? `${head} [[zipref:${id}]]\nรายชื่อไฟล์ (AI เปิดอ่านเองได้):\n` + list.slice(0, 1500).map(p => `${p} · ${files[p].length.toLocaleString()} ตัวอักษร`).join('\n') + (list.length > 1500 ? `\n…และอีก ${list.length - 1500} ไฟล์` : '')
      : head + '\n\n' + list.map(p => `===== ${p} =====\n${files[p]}`).join('\n\n');
  } else if (n.endsWith('.docx')) {
    await lib('mammoth'); text = (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
  } else if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) {
    await lib('xlsx'); const wb = XLSX.read(await f.arrayBuffer());
    text = wb.SheetNames.map(s => `--- ชีต ${s} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
  } else if (TEXT_EXT.test(n) || f.type.startsWith('text/') || /json|xml|javascript/.test(f.type) || !n.includes('.') || /^(dockerfile|makefile|\.\w+)$/.test(n)) {
    text = await f.text();
    if (text.includes('\u0000')) throw new Error('ไฟล์นี้ไม่ใช่ข้อความ');
  } else throw new Error('ยังไม่รองรับไฟล์ชนิดนี้ (รองรับ โค้ด/ข้อความ, PDF, Word, Excel, zip, รูป)');
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
// ไฟล์ที่ AI เขียน (```lang file=path) → ปุ่มดาวน์โหลด .zip
// ถ้าก่อนหน้านี้แนบ zip โปรเจกต์มา: เอาไฟล์ข้อความทั้งหมดจาก zip นั้นเป็นฐาน แล้วทับด้วยไฟล์ที่ AI แก้ = ได้โปรเจกต์ครบทั้งก้อน
const fileBlocks = s => [...String(s || '').matchAll(/```[^\n]*?\bfile=(\S+)[^\n]*\n([\s\S]*?)```/g)].map(x => ({ path: x[1].replace(/^\/+|\.\.\//g, ''), text: x[2] }));
function baseZip(i) { // zip ล่าสุดที่ผู้ใช้แนบไว้ก่อนคำตอบ i: { name, files: Map(path → text) }
  for (let k = i - 1; k >= 0; k--) {
    const m = chat.msgs[k]; if (m.role !== 'user') continue;
    for (const f of [...String(m.content).matchAll(FILE_RE)].reverse()) {
      if (!/\.zip$/i.test(f[1]) || !f[2].startsWith('[zip:')) continue;
      const ref = f[2].match(/\[\[zipref:([0-9a-f]{16})\]\]/)?.[1];
      if (ref) return { name: f[1], ref };
      const parts = f[2].split(/(?:^|\n\n)===== (.+?) =====\n/), files = new Map(), cut = /\n…\(ไฟล์ยาวเกิน ตัดเหลือ/.test(f[2]);
      for (let j = 1; j < parts.length; j += 2) files.set(parts[j], parts[j + 1] ?? '');
      if (cut && parts.length > 2) files.delete(parts[parts.length - 2]); // ไฟล์สุดท้ายถูกตัดกลางไฟล์: ไม่ใส่ ไม่งั้นทับของจริงด้วยไฟล์ครึ่งเดียว
      if (files.size) return { name: f[1], files, cut, bin: /ไฟล์อื่น \d+ ไฟล์/.test(parts[0]) };
    }
  }
  return null;
}
const zipBtn = (m, i) => { const n = fileBlocks(m.content).length, base = n && baseZip(i); return n > 1 || base ? `<button type="button" class="btn out sm zipbar" data-zip="${i}">${ic('download', 'sm')} ${base ? `ดาวน์โหลดโปรเจกต์ที่แก้แล้ว (.zip) · แก้ ${n} ไฟล์` : `ดาวน์โหลดทั้งหมดเป็น .zip · ${n} ไฟล์`}</button>` : ''; };
async function zipFiles(i, btn) {
  const fs = fileBlocks(chat.msgs[i].content), base = baseZip(i); if (!fs.length) return;
  await lib('jszip'); let z = new JSZip(), all = new Map(base?.files || []);
  if (base?.ref) { // zip ที่เก็บบนเซิร์ฟเวอร์: เริ่มจาก zip ต้นฉบับ (มีรูป/ไฟล์ไบนารีครบ) แล้วทับด้วยไฟล์ที่ AI แก้
    const r = await fetch(`/api/zipref/${base.ref}/raw`); if (!r.ok) throw new Error('zip ต้นฉบับหมดอายุหรือถูกลบแล้ว');
    z = await JSZip.loadAsync(await r.blob()); all = new Map(Object.values(z.files).filter(e => !e.dir).map(e => [e.name, null]));
  }
  for (const f of fs) { // AI อาจเขียน path มีหรือไม่มีโฟลเดอร์ครอบของ zip: จับคู่กับไฟล์เดิมที่ path ลงท้ายเหมือนกัน
    const hit = [...all.keys()].find(p => p === f.path || p.endsWith('/' + f.path) || f.path.endsWith('/' + p));
    all.set(hit || f.path, f.text);
  }
  for (const [p, t] of all) if (t != null) z.file(p, t);
  const roots = new Set([...all.keys()].map(p => p.split('/')[0])), name = base ? base.name.replace(/\.zip$/i, '') + '_edited.zip' : (roots.size === 1 && [...all.keys()][0].includes('/') ? [...roots][0] : 'astracode-files') + '.zip';
  const a = document.createElement('a'); a.href = URL.createObjectURL(await z.generateAsync({ type: 'blob' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const o = btn.innerHTML; btn.innerHTML = ic('check', 'sm') + ' ดาวน์โหลดแล้ว'; setTimeout(() => btn.innerHTML = o, 1500);
  if (base?.cut || base?.bin) toast((base.cut ? 'zip เดิมใหญ่เกินที่แนบได้ บางไฟล์ไม่อยู่ใน zip นี้ · ' : '') + (base.bin ? 'รูปและไฟล์ที่ไม่ใช่ข้อความไม่อยู่ใน zip นี้ คัดลอกจาก zip เดิมมาใส่' : ''), 'warn');
}
// ข้อความที่ผู้ใช้เห็นในฟองแชต (ไม่มี markdown ดิบ/แท็กภายใน/ปุ่ม) + html สำหรับวางในเอกสาร
function bubbleText(el) {
  const b = el?.querySelector(':scope > .b'); if (!b) return null;
  b.classList.add('copying'); const text = b.innerText.replace(/\n{3,}/g, '\n\n').trim(); b.classList.remove('copying');
  const c = b.cloneNode(true); c.querySelectorAll('button, .code-h, .mfiles').forEach(x => x.remove());
  return text ? { text, html: c.innerHTML } : null;
}
// รูปแบบเดียวกับที่เซิร์ฟเวอร์บันทึก: [[file:ชื่อ]] ... [[/file]]
function msgHTML(m, i, isNew) {
  if (m.role === 'user' && m.content.startsWith(PC_RES)) return `<div class="msg user pcres ${isNew ? 'new' : ''}"><details><summary>${ic('folder', 'sm')} ผลจากเครื่อง</summary>${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}<pre>${esc(m.content.slice(PC_RES.length).trim())}</pre></details></div>`;
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    return `<div class="msg user ${isNew ? 'new' : ''}"><div class="b">${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}${m.content.startsWith('🎨 ') ? ic('image') + ' ' : ''}${esc(m.content.replace(FILE_RE, '').replace(/^🎨 /, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${ic('filetext')}<span>${esc(f[1])}</span><small>${tok(f[2].length)}</small></span>`).join('')}</div>` : ''}</div>
      ${i >= 0 && !m.content.startsWith('🎨') ? `<div class="acts"><button data-copy="${i}" aria-label="คัดลอกข้อความ">${ic('copy', 'sm')}</button>${m.id && !chat.busy ? `<button data-edit="${i}">${ic('pen', 'sm')} Edit</button>` : ''}<button data-mem="${i}" class="${MEM_RE.test(m.content) ? 'memhint' : ''}">${MEM_RE.test(m.content) ? ic('bulb') + ' ให้ AI จำเรื่องนี้?' : 'Remember'}</button></div>` : ''}</div>`;
  }
  const last = i === chat.msgs.length - 1;
  const { text: t00, mem } = parseMem(m.content, m.streaming), { text: t0, prompt: imgP } = parseImg(t00, m.streaming), { text: t1, asks } = parseAsk(t0, m.streaming), text = pcFmt(t1);
  const mcpH = m.mcps?.length ? `<div class="steps-bar mcp-live" style="cursor:default">${ic('server', 'sm')}<span>${m.mcps.map(x => esc(x.tool)).join(', ')}</span></div>` : '';
  return `<div class="msg ai ${isNew ? 'new' : ''}">${hasSegs(m) ? '' : thinkHTML(m)}${mcpH}${m.agent ? agentHTML(m, i) : ''}<div class="b">${hasSegs(m) ? segHTML(m, text) : text ? md(text) : m.thinking || asks.length ? '' : imgP ? `<details class="imgp"><summary class="muted">${ic('image', 'sm')} สั่งสร้างรูปแล้ว · ดูคำบรรยายรูป</summary><p>${esc(imgP)}</p></details>` : emptyHTML(m)}</div>${askHTML(asks, last && !m.streaming)}${mem ? `<div class="acts"><button data-rem="${i}">${ic('plus', 'sm')} จำไว้: ${esc(mem)}</button></div>` : ''}${sourcesHTML(m)}
    ${!m.streaming && i >= 0 ? zipBtn(m, i) : ''}
    ${m.note ? `<div class="mnote">${esc(m.note)}</div>` : ''}
    ${m.streaming ? '' : `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${i < 0 ? '' : `<button data-copy="${i}" class="cp-msg">${ic('copy', 'sm')} คัดลอก</button>`}${i < 0 ? '' : `${m.id ? `<button data-vote="${i}" data-v="1" class="${m.vote === 1 ? 'on' : ''}" aria-label="คำตอบดี" aria-pressed="${m.vote === 1}">${ic('thumbup')}</button><button data-vote="${i}" data-v="-1" class="${m.vote === -1 ? 'on' : ''}" aria-label="คำตอบไม่ดี" aria-pressed="${m.vote === -1}">${ic('thumbdown')}</button><button data-report="${i}" aria-label="รายงานคำตอบนี้">Report</button><button data-star="${i}" class="${m.starred ? 'on' : ''}" aria-label="${m.starred ? 'เลิกบุ๊กมาร์ก' : 'บุ๊กมาร์กคำตอบนี้'}" aria-pressed="${!!m.starred}">${ic('star')}</button><button data-branch="${i}" title="เปิดแชตใหม่ที่มีข้อความถึงตรงนี้ แล้วถามต่อคนละทาง" aria-label="แตกกิ่ง">${ic('branch')}</button>` : ''}${'speechSynthesis' in window ? `<button data-say="${i}" aria-label="อ่านออกเสียง">${ic('volume')}</button>` : ''}${last && !chat.busy && !m.agent ? '<button data-regen>Regenerate</button>' : ''}`}${tokHTML(m)}</div>`}</div>`;
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
       <div class="chips">${SUGGEST.map(([icon, s], i) => `<button data-s="${i}">${ic(icon, 'sm')} ${s}</button>`).join('')}</div></div>`;
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
  // โมเดลที่เลือกมีปัญหา/ติดเพดาน: เสนอสลับเป็น Auto (ระบบเลือกตัวที่ใช้ได้) แล้วลองใหม่ในคลิกเดียว
  const sel = $('#model'), canAuto = fn && sel && sel.value !== 'auto' && [...sel.options].some(o => o.value === 'auto') && /โมเดล|model|ขัดข้อง|เพดาน|ตอบไม่ได้|timeout|ช้ากว่าปกติ/i.test(msg);
  $('#e').innerHTML = esc(msg) + (fn ? ' <button class="btn out sm" id="retry">Try again</button>' : '') + (canAuto ? ' <button class="btn blue sm" id="retryauto">สลับเป็น Auto แล้วลองใหม่</button>' : '');
  const b = $('#retry'); if (b) b.onclick = () => { $('#e').textContent = ''; fn(); };
  const ba = $('#retryauto'); if (ba) ba.onclick = () => { sel.value = 'auto'; sel.onchange({ target: sel }); $('#e').textContent = ''; fn(); };
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
const noteOf = (m, d) => { if (d.wallet) m.note = 'โมเดลนอกแพลน: ตัดเงินจาก Wallet ตามราคาขาย'; if (d.fallback) m.note = `โมเดลหลักขัดข้อง จึงตอบด้วย ${d.fallback}`; if (d.overflow) m.note = 'ลิมิตเต็ม ใช้เงินใน Wallet'; if (d.sources) m.sources = d.sources; };
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
// โหมดสร้างภาพ: ถ้าการเชื่อมต่อหลุดตอนปิดจอ กลับมาที่หน้าแล้วทำต่อให้ (ภาพเสร็จแล้ว = ดึงจากแชต, ยังไม่เสร็จ = ต่อสตรีม)
async function imgWake() {
  const w = chat.imgWake; if (!w || chat.busy) return; chat.imgWake = null;
  if (w === 'send') return send();
  const list = await api('/chats/' + chat.id).catch(() => null);
  if (list && list.length > chat.msgs.length) { chat.msgs = list; renderAll(); loadSide(); return; }
  if (chat.msgs.at(-1)?.role === 'user') send({ resume: true });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') imgWake(); });
async function send({ regenerate = false, resume = false, edit_id = null, edit_text = '' } = {}) {
  if (chat.busy) { if (chat.agentBusy && !regenerate && !resume && !edit_id) agentSteer(); return; } // Agent กำลังทำ: Enter = พิมพ์แทรก (ปุ่มส่ง = หยุด)
  if (!regenerate && !resume && !edit_id && isImgMode() && $('#t').value.trim() !== chat.enhanced && (chat.images.length || localStorage.getItem('imgAuto') !== '0')) { // โหมดสร้างภาพ: ปรับ prompt ก่อนส่ง (แนบรูป = ต้องปรับ เพราะใช้รูปเป็นแรงบันดาลใจ)
    setBusy(true); const ok = await enhancePrompt(true); setBusy(false);
    if (ok === 'net') { chat.imgWake = 'send'; if (document.visibilityState === 'visible') imgWake(); return; } // เน็ตหลุดตอนปิดจอ: กลับมาแล้วส่งต่อให้เอง
    if (!ok) return;
  }
  if (chat.compare && !regenerate && !resume) return compareSend();
  if (!regenerate && !resume && !edit_id && agentOn()) { const tx = $('#t').value.trim(); if (chat.files.length) toast('โหมด Agent: ไฟล์แนบใช้ไม่ได้ พิมพ์ @พาธ เพื่ออ้างไฟล์ในโฟลเดอร์แทน (แนบรูปได้)'); return tx ? agentSend(tx) : undefined; }
  const quiet = regenerate || resume || !!edit_id, t = $('#t'), text = edit_id ? edit_text : quiet ? '' : t.value.trim(), imgs = quiet ? [] : chat.images, m = curModel();
  const files = quiet ? [] : chat.files;
  if (!m) return showErr('ยังโหลดรายการโมเดลไม่เสร็จ ลองรีเฟรชหน้าแล้วส่งอีกครั้ง');
  if (files.some(f => f.text == null)) return showErr('รออ่านไฟล์ให้เสร็จก่อน');
  if (!quiet && !text && !imgs.length && !files.length) return;
  $('#e').textContent = '';
  if (edit_id) { /* already sliced */ } else if (resume) { if (chat.msgs.at(-1)?.role !== 'user') return; } // ต่อคำตอบ: ต้องมีคำถามค้างอยู่
  else if (regenerate) { if (chat.msgs.at(-1)?.role === 'assistant') chat.msgs.pop(); }
  else {
    autoRetry = 0; if (!chat.pcAuto) chat.pcRound = 0; chat.pcAuto = false;
    t.value = ''; t.style.height = 'auto'; chat.images = []; chat.files = []; drawThumbs();
    chat.msgs.push({ role: 'user', content: withFiles(text || (files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้'), files), imgs: imgs.length ? imgs : null });
    appendMsg(chat.msgs.at(-1));
  }
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };
  chat.msgs.push(ai);
  if (quiet) renderAll(); else appendMsg(ai);
  setBusy(true); chat.ctrl = new AbortController(); if (chat.voice) { voiceReset(); vstate('think'); }
  const t0 = Date.now();
  let started = false, streamErr = null, aborted = false, raf = 0;
  try {
    await stream({ chat_id: chat.id, model_id: m.id, text, images: imgs, files, regenerate, resume, edit_id, search: localStorage.getItem('web') === '1' && !!site.search, kb: localStorage.getItem('kb') === '1', skill_ids: chat.skills, mcp_ids: chat.mcps, local: pcOn() ? { os: navigator.userAgentData?.platform || navigator.platform, folder: chat.pc.name, mcp: chat.pcTools || [], screen: !!chat.screen } : undefined,
      effort: m.effort !== 'none' ? $('#effort').value || null : null }, chat.ctrl.signal, d => {
      started = true;
      if (d.chat_id && !chat.id) { chat.id = d.chat_id; setUrl('/chat?id=' + d.chat_id, true); }
      if (d.model) ai.model = d.model;
      noteOf(ai, d); if (d.fallback) ai.model = d.fallback;
      if (d.t || d.th) { onStreamEvent(ai, d); if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); if (d.t && chat.voice) voiceFeed(ai.content, false); }
      if (d.error) streamErr = d.error;
      if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; }
      if (d.ctx) { chat.ctx = { ...d.ctx, id: chat.id }; }
      if (d.compacted) { toast(`ย่อแชตอัตโนมัติแล้ว (${d.why}) ข้อความเก่าถูกสรุปไว้`, 'ok'); chat.ctx = null; }
      if (d.trimmed) toast('context เต็ม: ตัดข้อความเก่าบางส่วนออกจากที่ส่งให้ AI ลองย่อแชตหรือเปิดแชตใหม่', 'bad');
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
    else if (started && x instanceof TypeError && m.provider === 'image' && chat.id) { // ปิดจอระหว่างสร้างภาพ: เซิร์ฟเวอร์สร้างต่อเบื้องหลัง กลับมาแล้วดึงภาพมาให้
      chat.msgs.pop(); chat.imgWake = 'resume'; setBusy(false); renderAll(); if (document.visibilityState === 'visible') imgWake(); return;
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
  if (streamErr) { showErr(streamErr, true); if (chat.voice) voiceListen(); }
  else if (chat.voice && !aborted) voiceFeed(ai.content, true);
  else if (aborted) showErr('หยุดแล้ว · ถ้าเซิร์ฟเวอร์ตอบจบแล้ว ระบบจะดึงคำตอบมาแสดงให้เอง');
  else if (empty) {
    // เดิม: ลบคำตอบทิ้งแล้วเงียบสนิท ไม่มีอะไรขึ้นเลย → ตอนนี้ลองต่อให้อัตโนมัติ 1 ครั้ง แล้วค่อยแจ้ง
    if (started && chat.id && !resume && autoRetry < 1) { autoRetry++; showErr('โมเดลยังไม่ได้ส่งคำตอบ กำลังลองใหม่ให้อัตโนมัติ…'); return send({ resume: true }); }
    showErr('ไม่ได้คำตอบจากโมเดล ลองอีกครั้ง', true);
  }
  loadSide();
  if (!streamErr && !aborted && !empty && !chat.compare && pcOn() && (pcCalls(ai.content).length || fileBlocks(ai.content).length)) return pcAct(ai);
  if (!streamErr && !aborted && Date.now() - t0 > 15000) PCD?.notify('AstraCode ตอบเสร็จแล้ว', ai.content.replace(/[#*`>\[\]]/g, '').slice(0, 140)); // แอป Desktop: แจ้งเตือนเมื่อสลับไปทำอย่างอื่นระหว่างรอ
}

// ---------- ใช้คอมเครื่องนี้ (แอป AstraCode Desktop) ----------
// AI เขียนบรรทัด LIST / READ / RUN / MCP หรือบล็อก file=… → หน้าเว็บในแอปทำในเครื่อง (เฉพาะโฟลเดอร์ที่ผู้ใช้เลือก) แล้วส่งผลกลับเป็นข้อความถัดไปให้ AI ทำต่อ
// RUN และการตั้งค่า MCP ถามอนุญาตด้วยหน้าต่างของ Windows (แอปเป็นคนถาม หน้าเว็บกดแทนไม่ได้) · เขียนไฟล์ถามในหน้านี้ก่อน
const PCD = window.astraDesktop?.fs ? window.astraDesktop : null;
const PC_LINE = /^[ \t]*(LIST|READ|GREP|RUN|MCP|SCREEN|CLICK|DOUBLE|RIGHT|TYPE|KEY|SCROLL|WAIT)\b[ \t]*(.*)$/gm, PC_SCREEN = new Set(['SCREEN', 'CLICK', 'DOUBLE', 'RIGHT', 'TYPE', 'KEY', 'SCROLL', 'WAIT']), PC_RES = '[ผลจากเครื่อง]', PC_MAX = 15;
const pcOn = () => !!(PCD && chat.pc && localStorage.getItem('pc') === '1');
const pcCalls = text => [...String(text || '').replace(/```[\s\S]*?```/g, '').matchAll(PC_LINE)].map(m => [m[1], m[2].trim()]).slice(0, 12);
const pcFmt = text => PCD ? String(text).split(/(```[\s\S]*?(?:```|$))/).map((p, i) => i % 2 ? p : p.replace(PC_LINE, (_, k, a) => '`⚙ ' + k + ' ' + a.replace(/`/g, "'").slice(0, 200) + '`')).join('') : text;
const pcTools = () => { if (pcOn()) PCD.mcp.tools().then(t => { chat.pcTools = t; }).catch(x => { chat.pcTools = []; toast('MCP ในเครื่อง: ' + x.message, 'bad'); }); };
async function pcInit() { if (!PCD) return; chat.pc = await PCD.fs.linked('chat').catch(() => null); chat.screen = await PCD.screen?.state().catch(() => false); pcTools(); modelUI(); }
function pcSheet() {
  sheet('ใช้คอมเครื่องนี้', `<div class="sheet-form"><p class="sheet-msg">AI อ่าน/เขียนไฟล์ รันคำสั่ง และใช้ MCP ในเครื่องนี้ได้ <b>เฉพาะในโฟลเดอร์ที่เลือก</b> · เขียนไฟล์ได้เองในโฟลเดอร์นี้ · รันคำสั่งถามในหน้าต่างของ Windows (เลือก "รันอัตโนมัติ" ได้ คำสั่งลบ/อันตรายยังถามเสมอ)</p>
    <p style="margin:0">${chat.pc ? `โฟลเดอร์: <b>${esc(chat.pc.path)}</b>${chat.pc.auto ? '<br>รันคำสั่งอัตโนมัติ: <b>เปิด</b> (ยกเว้นคำสั่งอันตราย) <button type="button" class="btn out sm" id="pcauto">ปิด</button>' : ''}` : 'ยังไม่ได้เลือกโฟลเดอร์'}</p>
    <div class="row"><button type="button" class="btn blue sm" id="pcpick">${ic('folder', 'sm')} ${chat.pc ? 'เปลี่ยนโฟลเดอร์' : 'เลือกโฟลเดอร์'}</button>${chat.pc ? `<button type="button" class="btn ${pcOn() ? 'red' : 'blue'} sm" id="pctog">${pcOn() ? 'ปิดใช้' : 'เปิดใช้'}</button><button type="button" class="btn out sm" id="pcopen">เปิดโฟลเดอร์</button>` : ''}<button type="button" class="btn out sm" id="pcmcp">${ic('server', 'sm')} MCP ในเครื่อง</button>${PCD.plugins ? `<button type="button" class="btn out sm" id="pcplug">${ic('layers', 'sm')} ปลั๊กอิน</button>` : ''}${PCD.agent?.schedules ? `<button type="button" class="btn out sm" id="pcsch">${ic('bell', 'sm')} งานตั้งเวลา</button>` : ''}</div>
    ${chat.pc && PCD.agent ? `<label class="sw-row"><span class="sw"><input type="checkbox" id="pcag" ${localStorage.getItem('pcAgent') === '1' ? 'checked' : ''}><span></span></span> <span><b>โหมด Agent</b> · ทำงานเองต่อเนื่องแบบ Claude Code (อ่าน/แก้ไฟล์ รันคำสั่ง ค้นเว็บ จนเสร็จ) · ใช้ลิมิต/Wallet ผ่าน API</span></label>
      <div id="pcagopt" style="display:grid;gap:8px" ${localStorage.getItem('pcAgent') === '1' ? '' : 'hidden'}><div class="row"><select id="pcagm" style="width:auto">${AG_MODES.map(([k, l]) => `<option value="${k}" ${agMode() === k ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="pcagr" style="width:auto">${[30, 80, 150].map(n => `<option value="${n}" ${(+localStorage.getItem('pcAgentMax') || 80) === n ? 'selected' : ''}>สูงสุด ${n} รอบ</option>`).join('')}</select>
        <select id="pcags" style="width:auto"><option value="code" ${localStorage.getItem('pcAgentStyle') !== 'work' ? 'selected' : ''}>งานโค้ด</option><option value="work" ${localStorage.getItem('pcAgentStyle') === 'work' ? 'selected' : ''}>งานทั่วไป / เอกสาร</option></select><select id="pcagb" style="width:auto">${[0, 5, 20, 50, 100].map(n => `<option value="${n}" ${(+localStorage.getItem('pcAgentBudget') || 0) === n ? 'selected' : ''}>${n ? `เพดาน ฿${n}/งาน` : 'ไม่จำกัดเงินต่องาน'}</option>`).join('')}</select></div>
        <div id="pcpack" class="muted" style="font-size:12.5px"></div>
        <label class="sw-row"><span class="sw"><input type="checkbox" id="pcagrem" ${localStorage.getItem('pcAgentRemote') === '1' ? 'checked' : ''}><span></span></span> สั่งงานและกดอนุญาตจากมือถือได้ (เปิดแชตเดียวกันในมือถือ)</label>
        <p class="muted" style="margin:0;font-size:12.5px">คำสั่งลัด: ${AG_CMDS.map(c => `<code>/${c[0]}</code>`).join(' ')} · ของโปรเจกต์เอง: ไฟล์ <code>.astra/commands/ชื่อ.md</code> · อ้างไฟล์ด้วย <code>@src/app.js</code> · แปะรูปหน้าจอได้ · พิมพ์แทรกระหว่าง Agent ทำงานได้ (กด Enter) · hook หลังแก้ไฟล์: <code>.astra/hooks.json</code> เช่น <code>{"after_edit":"npx prettier --write {file}"}</code></p></div>` : ''}
    ${chat.pc ? `<label class="sw-row"><span class="sw"><input type="checkbox" id="pcscr" ${chat.screen ? 'checked' : ''}><span></span></span> ให้ AI ดูหน้าจอและคุมเมาส์/คีย์บอร์ด (Windows · ต้องใช้โมเดลที่อ่านรูปได้ · หยุดทันที Ctrl+Alt+Esc)</label>` : ''}</div>`, (d, close) => {
    d.querySelector('#pcag')?.addEventListener('change', e => { localStorage.setItem('pcAgent', e.target.checked ? '1' : '0'); d.querySelector('#pcagopt').hidden = !e.target.checked; if (e.target.checked) { localStorage.setItem('pc', '1'); if (localStorage.getItem('agTour') !== '1') { close(); agentTour(); } } modelUI(); });
    d.querySelector('#pcagm')?.addEventListener('change', e => { localStorage.setItem('pcAgentMode', e.target.value); modelUI(); });
    d.querySelector('#pcagr')?.addEventListener('change', e => localStorage.setItem('pcAgentMax', e.target.value));
    d.querySelector('#pcagb')?.addEventListener('change', e => localStorage.setItem('pcAgentBudget', e.target.value));
    d.querySelector('#pcags')?.addEventListener('change', e => localStorage.setItem('pcAgentStyle', e.target.value));
    const pk = d.querySelector('#pcpack'); // ค่าใช้ Agent: แพลนที่รวม Agent / แพ็กเสริม / Wallet
    if (pk) api('/agent-pack').then(p => {
      pk.innerHTML = p.inPlan ? `${ic('check', 'sm')} แพลนของคุณรวม Agent แล้ว (หักลิมิตแพลน)` : p.active ? `${ic('check', 'sm')} แพ็ก Agent ใช้ไป ${p.pct.toFixed(1)}% · หมดอายุ ${when(p.until)}` : p.enabled ? `Agent หักจาก Wallet ตามจริง · หรือซื้อ<b>แพ็ก Agent ฿${p.price}/${p.days} วัน</b> <button type="button" class="btn blue sm" id="pcbuy">ซื้อด้วย Wallet</button>` : 'Agent หักจาก Wallet ตามจริง (แพลน Pro ขึ้นไปใช้ลิมิตแพลนได้)';
      pk.querySelector('#pcbuy')?.addEventListener('click', async () => { if (!await confirmSheet(`ซื้อแพ็ก Agent ฿${p.price} (ใช้ได้ ${p.days} วัน) โดยหักจาก Wallet?`, { title: 'แพ็ก Agent', ok: 'ซื้อ' })) return; try { const r = await api('/agent-pack', { method: 'POST' }); me.balance = r.balance; toast('ซื้อแพ็ก Agent แล้ว', 'ok'); close(); } catch (x) { toast(x.message, 'bad'); } });
    }).catch(() => {});
    d.querySelector('#pcagrem')?.addEventListener('change', e => localStorage.setItem('pcAgentRemote', e.target.checked ? '1' : '0'));
    d.querySelector('#pcscr')?.addEventListener('change', async e => { try { chat.screen = e.target.checked ? await PCD.screen.on() : !await PCD.screen.off(); } catch (x) { chat.screen = false; toast(x.message, 'bad'); } e.target.checked = !!chat.screen; if (chat.screen && !curModel()?.vision) toast('โมเดลที่เลือกอ่านรูปไม่ได้ เปลี่ยนเป็นโมเดลที่มีไอคอนตาก่อนใช้', 'bad'); });
    d.querySelector('#pcpick').onclick = async () => { const l = await PCD.fs.link('chat').catch(x => { toast(x.message, 'bad'); return null; }); if (!l) return; chat.pc = l; localStorage.setItem('pc', '1'); if (PCD.agent && localStorage.getItem('pcAgent') === null) localStorage.setItem('pcAgent', '1'); close(); pcTools(); modelUI(); toast(`AI ใช้โฟลเดอร์ ${l.name} ได้แล้ว`, 'ok'); };
    d.querySelector('#pctog')?.addEventListener('click', () => { localStorage.setItem('pc', pcOn() ? '0' : '1'); close(); pcTools(); modelUI(); });
    d.querySelector('#pcopen')?.addEventListener('click', () => PCD.fs.open('chat'));
    d.querySelector('#pcauto')?.addEventListener('click', async () => { await PCD.fs.autoOff('chat'); chat.pc.auto = false; close(); toast('ปิดรันอัตโนมัติแล้ว ต่อไปจะถามทุกคำสั่ง'); });
    d.querySelector('#pcmcp').onclick = () => { close(); mcpLocalSheet(); };
    d.querySelector('#pcplug')?.addEventListener('click', () => { close(); pluginSheet(); });
    d.querySelector('#pcsch')?.addEventListener('click', () => { close(); scheduleSheet(); });
  });
}
// ตั้งค่า MCP ในเครื่องแบบกดเลือก (ไม่ต้องพิมพ์ JSON) · บันทึกแล้วแอปถามยืนยันด้วยหน้าต่าง Windows เพราะเป็นโปรแกรมที่จะรันในเครื่อง
const MCP_PRESETS = [['blender', 'Blender', 'uvx', 'blender-mcp', 'ต้องมี uv และติดตั้ง addon ใน Blender ก่อน'], ['browser', 'เปิดเว็บ / กดหน้าเว็บ (Playwright)', 'npx', '-y @playwright/mcp@latest', 'ต้องมี Node.js'], ['memory', 'ความจำถาวร', 'npx', '-y @modelcontextprotocol/server-memory', 'ต้องมี Node.js']];
// รวม MCP ทุกแบบไว้ที่เดียว (แอป Desktop): เลือกแบบที่ต้องการ · แบบในเครื่องต้องเลือกโฟลเดอร์ก่อน
function mcpHub() {
  const need = !pcOn() ? ' · ต้องเลือกโฟลเดอร์ก่อน' : '';
  sheet('MCP / ปลั๊กอิน', `<p class="sheet-msg">MCP = ตัวเชื่อมให้ AI ใช้แอปอื่นได้ เลือกแบบที่ต้องการ</p>`
    + (PCD.plugins ? optHTML('plug', ic('layers') + 'ปลั๊กอินสำเร็จรูป (แนะนำ)', 'กดติดตั้งคลิกเดียว: คุมเบราว์เซอร์, GitHub, ความจำ, เอกสาร' + need) : '')
    + optHTML('local', ic('server') + 'MCP ในเครื่อง', 'ใส่คำสั่ง MCP เอง เช่น Blender, ฐานข้อมูล, ไฟล์ config จาก Claude Desktop' + need)
    + optHTML('remote', ic('globe') + 'Remote MCP (ออนไลน์)', 'ต่อ GitHub, Notion, n8n ผ่านลิงก์ · ใช้ได้ทั้งเว็บและแอป' + (chat.mcps?.length ? ` · เปิดอยู่ ${chat.mcps.length}` : '')),
  (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    close(); const v = b.dataset.v;
    if (v === 'remote') return mcpSheet(chat.mcps, ids => { chat.mcps = ids; localStorage.setItem('mcps', JSON.stringify(ids)); modelUI(); });
    if (!pcOn()) { toast('เลือกโฟลเดอร์งานก่อน แล้วกดปุ่ม ' + (v === 'plug' ? 'ปลั๊กอิน' : 'MCP ในเครื่อง') + ' ในหน้านี้'); return pcSheet(); }
    return v === 'plug' ? pluginSheet() : mcpLocalSheet();
  }));
}
async function mcpLocalSheet() {
  const cur = await PCD.mcp.get(); let cfg = {}; try { cfg = JSON.parse(cur.config || '{}'); } catch { cfg = {}; }
  const srv = cfg.mcpServers ||= {};
  const draw = () => `<div class="sheet-form"><p class="sheet-msg">MCP = ปลั๊กอินให้ AI คุมโปรแกรมในเครื่อง ใช้ได้เมื่อเปิด "ใช้คอมเครื่องนี้"</p>
    ${Object.entries(srv).map(([n, c]) => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span>${ic('server', 'sm')} <b>${esc(n)}</b> <code>${esc(c.command + ' ' + (c.args || []).join(' '))}</code></span><button type="button" class="icon-btn xs ghost" data-rm="${esc(n)}" aria-label="ลบ ${esc(n)}">${ic('x')}</button></div>`).join('') || '<p class="muted" style="margin:0">ยังไม่มี MCP</p>'}
    <b>เพิ่มแบบสำเร็จรูป</b><div class="row">${MCP_PRESETS.filter(p => !srv[p[0]]).map(p => `<button type="button" class="btn out sm" data-pre="${p[0]}" title="${esc(p[4])}">+ ${esc(p[1])}</button>`).join('')}</div>
    <b>เพิ่มเอง</b><div class="row" style="flex-wrap:nowrap"><input id="mcn" placeholder="ชื่อ" style="width:90px"><input id="mcc" placeholder="คำสั่ง เช่น npx -y some-mcp" style="flex:1"><button type="button" class="btn out sm" id="mca">เพิ่ม</button></div>
    ${cur.log?.length ? `<small class="muted">${cur.log.map(esc).join('<br>')}</small>` : ''}
    <button type="button" class="btn blue" id="mcs">บันทึก</button></div>`;
  sheet('MCP ในเครื่อง', draw(), function bind(d, close) {
    const redo = () => { d.querySelector('.sheet-b').innerHTML = draw(); bind(d, close); };
    d.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete srv[b.dataset.rm]; redo(); });
    d.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { const p = MCP_PRESETS.find(x => x[0] === b.dataset.pre); srv[p[0]] = { command: p[2], args: p[3].split(' ') }; toast(p[4]); redo(); });
    d.querySelector('#mca').onclick = () => { const n = d.querySelector('#mcn').value.trim().replace(/[^\w-]/g, ''), c = d.querySelector('#mcc').value.trim().split(/\s+/); if (!n || !c[0]) return toast('ใส่ชื่อและคำสั่ง', 'bad'); srv[n] = { command: c[0], args: c.slice(1) }; redo(); };
    d.querySelector('#mcs').onclick = async () => { try { if (await PCD.mcp.set(Object.keys(srv).length ? JSON.stringify(cfg) : '')) { close(); chat.pcTools = null; pcTools(); toast('บันทึก MCP แล้ว', 'ok'); } } catch (x) { toast(x.message, 'bad'); } };
  });
}
async function pcAct(ai) {
  chat.pcRound = (chat.pcRound || 0) + 1; if (chat.pcRound > PC_MAX) return showErr(`AI ใช้เครื่องมือในเครื่องครบ ${PC_MAX} รอบแล้ว พิมพ์สั่งต่อได้`);
  const calls = pcCalls(ai.content), writes = fileBlocks(ai.content), cut = s => s.length > 8000 ? s.slice(0, 2500) + '\n…(ตัดกลาง)…\n' + s.slice(-5000) : s;
  let out = PC_RES; const imgs = [];
  for (const f of writes) { // บล็อก file= ทั้งไฟล์ = เขียนทับ · ข้างในเป็น SEARCH/REPLACE = แก้เฉพาะจุด
    const edits = [...f.text.matchAll(/^<{5,9} SEARCH[ \t]*\n([\s\S]*?)\n?={5,9}[ \t]*\n([\s\S]*?)\n?>{5,9} REPLACE[ \t]*$/gm)].map(m => ({ search: m[1], replace: m[2] }));
    try {
      if (edits.length) { const bad = await PCD.fs.edit('chat', f.path, edits); out += `\n\nแก้ ${f.path}: ${edits.length - bad.length}/${edits.length} จุด${bad.length ? '\n' + bad.map(b => '- ' + b).join('\n') : ''}`; }
      else { await PCD.fs.write('chat', [{ path: f.path, content: f.text }]); out += `\n\nเขียน ${f.path} แล้ว`; }
    } catch (x) { out += `\n\nเขียน ${f.path} ไม่สำเร็จ: ${x.message}`; }
  }
  if (writes.length) toast(`อัปเดต ${writes.length} ไฟล์ใน ${chat.pc.name} แล้ว`, 'ok');
  const acts = calls.filter(c => PC_SCREEN.has(c[0])).map(([k, a]) => [k, ...(k === 'TYPE' ? [a] : a.split(/\s+/).filter(Boolean))]);
  for (const [k, a] of calls.filter(c => !PC_SCREEN.has(c[0]))) {
    let r;
    try {
      const arg = a.replace(/^path=/, '').replace(/^[`'"]|[`'"]$/g, '');
      if (k === 'LIST') r = await PCD.fs.list('chat', arg || '.');
      if (k === 'READ') r = await PCD.fs.read('chat', arg);
      if (k === 'GREP') r = await PCD.fs.grep('chat', arg);
      if (k === 'RUN' && await PCD.fs.isServer(a)) { const d = await PCD.fs.serve('chat', a); r = d.stderr || (d.running ? `รันเบื้องหลังแล้ว${d.port ? ' ที่ http://localhost:' + d.port : ''} (เซิร์ฟเวอร์ไม่จบเอง ผู้ใช้เปิดดูได้)` : 'เซิร์ฟเวอร์หยุดทันที'); out += `\n\n$ ${k} ${a}\n${r}`; continue; }
      if (k === 'RUN') { if (!chat.pc.auto) toast('รอคุณกดอนุญาตในหน้าต่างของ Windows'); const d = await PCD.fs.run('chat', a); chat.pc = await PCD.fs.linked('chat').catch(() => chat.pc) || chat.pc; r = `(exit ${d.code})\n${d.stdout}${d.stderr ? '\n[stderr]\n' + d.stderr : ''}`; }
      if (k === 'MCP') { const sp = a.indexOf(' '), name = sp < 0 ? a : a.slice(0, sp); let args = {}; if (sp >= 0) try { args = JSON.parse(a.slice(sp + 1)); } catch { throw new Error('JSON arguments ไม่ถูกต้อง'); } const d = await PCD.mcp.call(name, args); r = d.text; imgs.push(...(d.images || [])); }
    } catch (x) { r = 'Error: ' + x.message; }
    out += `\n\n$ ${k} ${a}\n${cut(String(r || '(ไม่มีผลลัพธ์)'))}`;
  }
  if (acts.length) {
    if (!chat.screen) out += '\n\n' + acts.map(x => x[0]).join(', ') + ': Error: ผู้ใช้ยังไม่ได้เปิดให้ AI ดูหน้าจอ/คุมเมาส์';
    else try { const d = await PCD.screen.batch(acts); out += `\n\n[หน้าจอ ${d.w}x${d.h} พิกเซล ภาพแนบล่าสุด]\n${d.log.join('\n')}`; imgs.push(d.image); } catch (x) { out += '\n\nหน้าจอ: Error: ' + x.message; if (/ยังไม่ได้อนุญาต/.test(x.message)) chat.screen = false; }
  }
  if (imgs.length && !curModel()?.vision) out += '\n\n(เครื่องมือส่งรูปมา แต่โมเดลนี้อ่านรูปไม่ได้)';
  const t = $('#t'), keep = [t.value, chat.files, chat.images];
  t.value = out; chat.files = []; chat.images = curModel()?.vision ? imgs.slice(0, 4) : []; chat.pcAuto = true;
  const p = send(); [t.value, chat.files, chat.images] = keep; drawThumbs(); return p; // ส่งผลกลับให้ AI ทำต่อ (ข้อความที่ผู้ใช้พิมพ์ค้างไว้ยังอยู่)
}

// ---------- โหมด Agent แบบ Claude Code (แอป Desktop): แอปวนทำงานเองในเครื่องด้วย tool calling ผ่าน /v1 · หน้านี้แสดงขั้นตอนสด และบันทึกคำสั่ง+คำตอบลงแชต ----------
const AG_MODES = [['plan', 'วางแผนก่อน (ยังไม่แก้อะไร)', 'วางแผน'], ['ask', 'ถามก่อนทุกครั้ง', 'ถามก่อน'], ['edits', 'แก้ไฟล์เอง · ถามก่อนรันคำสั่ง', 'แก้ไฟล์เอง'], ['auto', 'ทำเองทั้งหมด (คำสั่งอันตรายยังถาม)', 'ทำเองทั้งหมด']];
const AG_CMDS = [['review', 'รีวิวโค้ดที่เพิ่งเปลี่ยน (git diff) หาบั๊ก ช่องโหว่ และจุดที่ช้า เรียงตามความรุนแรง พร้อมวิธีแก้ ยังไม่ต้องแก้ไฟล์ $ARGUMENTS'], ['test', 'รันเทสต์ของโปรเจกต์ ถ้าไม่ผ่านให้หาสาเหตุจริงแล้วแก้โค้ดจนผ่าน (ห้ามแก้เทสต์ให้ผ่านเฉยๆ) $ARGUMENTS'], ['fix', 'หาสาเหตุและแก้ปัญหานี้ แล้วตรวจว่าหายจริง: $ARGUMENTS'], ['explain', 'อธิบายโปรเจกต์/โค้ดนี้แบบเข้าใจง่าย: โครงสร้าง ไฟล์สำคัญ และการทำงานหลัก $ARGUMENTS'], ['commit', 'ดู git diff แล้วเขียนข้อความ commit ที่ดี แล้ว commit ให้ $ARGUMENTS'], ['init', 'สำรวจโปรเจกต์แล้วเขียนไฟล์ ASTRA.md สรุปวิธี build/test โครงสร้าง และกติกาโค้ด ให้ Agent รอบหน้าอ่าน $ARGUMENTS']];
const agentOn = () => pcOn() && !!PCD?.agent && localStorage.getItem('pcAgent') === '1';
const agMode = () => AG_MODES.some(x => x[0] === localStorage.getItem('pcAgentMode')) ? localStorage.getItem('pcAgentMode') : 'auto'; // ค่าเริ่มต้น: ทำเองทั้งหมด (คำสั่งอันตราย/นอกโฟลเดอร์ยังถามเสมอ)
const vslug = m => m.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''); // ชื่อโมเดลใน /v1 (ตรงกับ slug ฝั่งเซิร์ฟเวอร์)
const AG_ICON = { read_file: 'filetext', write_file: 'pen', edit_file: 'pen', list_dir: 'folder', glob: 'search', grep: 'search', bash: 'terminal', bash_output: 'terminal', kill_bash: 'stop', web_fetch: 'globe', web_search: 'globe', screenshot_url: 'camera', task: 'users', todo_write: 'check', sub: 'users', make_document: 'filetext', read_document: 'filetext', ask_user: 'msg', computer: 'camera' };
const agArg = s => { const a = s.args || {}; return a.command || a.path || a.pattern || a.url || a.query || a.description || a.id || ''; };
const diffPre = t => esc(t).split('\n').map(l => /^\+ /.test(l) ? `<span class="dadd">${l}</span>` : /^- /.test(l) ? `<span class="ddel">${l}</span>` : l).join('\n');
function agentHTML(m, i) {
  const st = s => s.st === 'run' ? '<span class="agsp" aria-label="กำลังทำ"></span>' : s.st === 'bad' ? '<b class="bad">✕</b>' : '<b class="ok">✓</b>';
  const done = !m.streaming, last = i === chat.msgs.length - 1;
  const steps = (m.steps || []).map(s => s.name === 'info' ? `<div class="agstep muted">${esc(s.text)}</div>` : s.name === 'sub' ? `<div class="agstep sub">↳ ${ic(AG_ICON[s.tool] || 'search', 'sm')} <small>${esc(s.title)}</small> ${esc(s.tool)} <code>${esc(String(agArg(s)).slice(0, 100))}</code></div>`
    : `<details class="agstep"><summary>${st(s)} ${ic(AG_ICON[s.name] || 'server', 'sm')} <b>${esc(s.name)}</b> <code>${esc(String(agArg(s)).slice(0, 140))}</code>${done && last && s.step && ['edit_file', 'write_file'].includes(s.name) && s.st === 'ok' && m.changed?.length ? `<button type="button" class="agback" data-agstep="${s.step}" title="ย้อนไฟล์กลับไปก่อนขั้นนี้">${ic('undo', 'sm')}</button>` : ''}</summary>${s.preview ? `<pre>${diffPre(s.preview)}</pre>` : ''}</details>`).join('');
  const todos = m.todos?.length ? `<div class="agtodo">${m.todos.map(t => `<div class="${t.status}">${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '▶' : '☐'} ${esc(t.content)}</div>`).join('')}</div>` : '';
  const n = (m.steps || []).filter(s => !['info', 'sub'].includes(s.name)).length, cost = m.cost ? ` · ${m.cost.charge ? '฿' + m.cost.charge.toFixed(2) : ''}${m.cost.charge && m.cost.pct ? ' + ' : ''}${m.cost.pct ? 'ลิมิต ' + m.cost.pct.toFixed(2) + '%' : ''}` : '';
  return `<div class="agent">${todos}${steps ? `<details class="agsteps" ${m.streaming ? 'open' : ''}><summary>${ic('sparkles', 'sm')} Agent ${n} ขั้นตอน${m.tin ? ` · ↑${kTok(m.tin)} ↓${kTok(m.tout)} token` : ''}${cost}</summary>${steps}</details>` : m.streaming ? `<div class="agstep muted"><span class="agsp"></span> Agent กำลังเริ่ม…</div>` : ''}
    ${m.ask ? `<div class="agask"><b>${esc(m.ask.question)}</b><div class="row" style="flex-wrap:wrap">${m.ask.options.map(o => `<button type="button" class="btn out sm" data-agans="${esc(o)}">${esc(o)}</button>`).join('')}</div><form class="row" data-agansf style="flex-wrap:nowrap"><input placeholder="หรือพิมพ์คำตอบ…" style="flex:1"><button class="btn blue sm">ตอบ</button></form></div>` : ''}
    ${m.error ? `<p class="bad" style="margin:6px 0">${esc(m.error)}</p>` : ''}
    ${m.outputs?.length ? `<div class="agout">${m.outputs.map(p => `<button type="button" class="fchip" data-agopen="${esc(p)}">${ic('filetext', 'sm')}<span>${esc(p.split('/').pop())}</span><small>เปิด</small></button>`).join('')}</div>` : ''}
    ${done && last ? `<div class="acts">${m.mode === 'plan' && !m.error ? `<button class="btn blue sm" data-agplan>${ic('play', 'sm')} อนุมัติแผน ลงมือเลย</button>` : ''}${m.changed?.length ? `<span class="muted">แก้ ${m.changed.length} ไฟล์: ${m.changed.slice(0, 6).map(esc).join(', ')}${m.changed.length > 6 ? '…' : ''}</span><button data-agundo="${i}">${ic('undo', 'sm')} ย้อนทั้งรอบ</button>` : ''}<button data-aggit="status">${ic('branch', 'sm')} Git</button></div>` : ''}</div>`;
}
let agSub = null;
const agSid = () => 'c' + chat.id; // ผูกกับแชต: ปิดแอปแล้วเปิดแชตเดิม Agent จำงานเดิม (ไฟล์ session ในเครื่อง)
async function agentExpand(text) { // คำสั่งลัด /review /test … และของโปรเจกต์ (.astra/commands/*.md)
  const m = /^\/([\w-]+)\s*([\s\S]*)$/.exec(text); if (!m) return text;
  const custom = await PCD.agent.commands('chat').catch(() => []), c = custom.find(x => x.name === m[1])?.text || AG_CMDS.find(x => x[0] === m[1])?.[1];
  return c ? c.replace(/\$ARGUMENTS/g, m[2]).trim() : text;
}
function agentSteer() {
  const t = $('#t'), text = t.value.trim(); if (!text || !chat.agentBusy) return;
  PCD.agent.steer(agSid(), text).then(ok => { if (!ok) return toast('Agent จบงานแล้ว ส่งเป็นคำสั่งใหม่ได้เลย'); t.value = ''; t.style.height = 'auto'; const u = { role: 'user', content: text, steer: true }; chat.msgs.splice(chat.msgs.length - 1, 0, u); renderAll(); api('/chats/append', { method: 'POST', body: { chat_id: chat.id, messages: [{ role: 'user', content: text }] } }).catch(() => {}); toast('ส่งถึง Agent แล้ว จะเห็นก่อนขั้นถัดไป', 'ok'); });
}
async function agentSend(text0, { mode = agMode() } = {}) {
  const chatModels = me.models.filter(x => !['image', 'embedding'].includes(x.provider) && !x.locked);
  const m = curModel()?.id === 'auto' ? chatModels.find(x => /sonnet.*eco|sonnet/i.test(x.name)) || chatModels[0] : curModel(); // อัตโนมัติ: Agent ใช้ Sonnet (ใช้ tool เก่ง ราคากลาง)
  if (!m || ['image', 'embedding'].includes(m.provider)) return showErr('เลือกโมเดลแชตก่อน (แนะนำ Claude Sonnet / Opus Eco หรือ ChatGPT 6.2)');
  const cheap = [...chatModels].sort((a, b) => a.multiplier - b.multiplier).find(x => !/uncen/i.test(x.name)); // ผู้ช่วยค้น (subagent) ใช้โมเดลถูกสุด
  try { if (await PCD.agent.needKey()) await PCD.agent.setKey((await api('/keys', { method: 'POST', body: { name: 'Desktop Agent' } })).key); } // ครั้งแรก: สร้าง API key ของบัญชีนี้ให้แอป (คิดเงินผ่าน /v1 ตามจริง)
  catch (x) { return showErr('สร้าง API key ให้แอปไม่ได้: ' + x.message); }
  const t = $('#t'), images = chat.images.slice(0, 4), history = chat.msgs.filter(x => typeof x.content === 'string' && x.content).map(x => ({ role: x.role, content: x.content }));
  if (t.value.trim() === text0) { t.value = ''; t.style.height = 'auto'; } chat.images = []; drawThumbs(); $('#e').textContent = '';
  const user = { role: 'user', content: text0, imgs: images.length ? images : null }; chat.msgs.push(user); appendMsg(user);
  try { const r = await api('/chats/append', { method: 'POST', body: { chat_id: chat.id, title: text0, messages: [{ role: 'user', content: text0 }] } }); if (!chat.id) { chat.id = r.chat_id; setUrl('/chat?id=' + r.chat_id, true); loadSide(); } }
  catch (x) { chat.msgs.pop(); renderAll(); t.value = text0; return showErr('บันทึกแชตไม่ได้: ' + x.message); }
  const text = await agentExpand(text0);
  const ai = { role: 'assistant', content: '', thinking: '', model: m.name + ' · Agent', streaming: true, agent: true, mode, steps: [], todos: null, tin: 0, tout: 0 }; chat.msgs.push(ai); appendMsg(ai);
  const sid = agSid(), t0 = Date.now(); let raf = 0;
  setBusy(true); chat.agentBusy = true; chat.ctrl = { abort: () => PCD.agent.stop(sid) }; // ปุ่มหยุดเดิม = หยุด Agent · Enter = พิมพ์แทรก
  const paint = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const box = $('#msgs'), el = box?.lastElementChild, stick = box && nearBottom(box); if (el) el.outerHTML = msgHTML(ai, chat.msgs.length - 1); if (stick) box.scrollTop = box.scrollHeight; }); };
  agSub?.(); agSub = PCD.agent.onEvent(d => {
    if (d.sid !== sid) return;
    if (d.type === 'delta') ai.content += d.text;
    if (d.type === 'think') ai.thinking += d.text;
    if (d.type === 'tool') ai.steps.push({ id: d.id, name: d.name, args: d.args, step: d.step, st: 'run' });
    if (d.type === 'sub') ai.steps.push({ name: 'sub', title: d.title, tool: d.name, args: d.args });
    if (d.type === 'tool_result') { const s = ai.steps.findLast(x => x.id === d.id) || ai.steps.findLast(x => x.st === 'run'); if (s) { s.st = d.ok ? 'ok' : 'bad'; s.preview = d.preview; } }
    if (d.type === 'todos') ai.todos = d.todos;
    if (d.type === 'usage') { ai.tin += d.usage.prompt_tokens || 0; ai.tout += d.usage.completion_tokens || 0; }
    if (d.type === 'cost') ai.cost = { charge: d.charge, pct: d.pct };
    if (d.type === 'info') ai.steps.push({ name: 'info', text: d.text });
    if (d.type === 'text_end' && ai.content && !/\n$/.test(ai.content)) ai.content += '\n\n';
    if (d.type === 'ask') ai.ask = { id: d.id, question: d.question, options: d.options || [] };
    if (d.type === 'answered') { ai.ask = null; ai.steps.push({ name: 'info', text: 'คุณตอบ: ' + d.text }); }
    if (d.type === 'done' || d.type === 'error') { ai.changed = d.changed; ai.outputs = d.outputs || []; ai.ask = null; if (d.type === 'error') ai.error = d.text; }
    paint();
  });
  try { await PCD.agent.run({ sid, chatId: chat.id, text, images, style: localStorage.getItem('pcAgentStyle') === 'work' ? 'work' : 'code', model: vslug(m), subModel: cheap ? vslug(cheap) : null, mode, effort: m.effort !== 'none' ? $('#effort')?.value || null : null, budget: +localStorage.getItem('pcAgentBudget') || 0, remote: localStorage.getItem('pcAgentRemote') === '1', maxRounds: +localStorage.getItem('pcAgentMax') || 80, slot: 'chat', history }); }
  catch (x) { ai.error = String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  agSub?.(); agSub = null; cancelAnimationFrame(raf); ai.streaming = false; ai.content = ai.content.trim(); setBusy(false); chat.agentBusy = false; chat.ctrl = null;
  for (const s of ai.steps) if (s.st === 'run') s.st = 'bad';
  const did = ai.steps.filter(s => !['info', 'sub'].includes(s.name)), sum = did.length ? `> Agent ${did.length} ขั้นตอน: ${[...new Set(did.map(s => s.name))].join(', ')}${ai.changed?.length ? ' · แก้ ' + ai.changed.slice(0, 10).join(', ') : ''}\n\n` : '';
  api('/chats/append', { method: 'POST', body: { chat_id: chat.id, messages: [{ role: 'assistant', content: sum + (ai.content || ai.error || '(ไม่มีข้อความ)') }] } }).then(() => loadSide()).catch(() => {});
  renderAll(); api('/me').then(d => { me = d; setUsage(d.usage); }).catch(() => {});
  if (Date.now() - t0 > 15000) PCD.notify('Agent ทำงานเสร็จแล้ว', (ai.content || ai.error || '').replace(/[#*`>]/g, '').slice(0, 140));
}
document.addEventListener('click', e => {
  const o = e.target.closest?.('[data-agopen]'); if (o && PCD?.agent) { PCD.agent.open('chat', o.dataset.agopen).catch(x => toast(String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad')); return; }
  const an = e.target.closest?.('[data-agans]'); if (an && PCD?.agent) { const m = chat.msgs.findLast(x => x.agent && x.ask); if (m) PCD.agent.answer(agSid(), m.ask.id, an.dataset.agans); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest?.('[data-agansf]'); if (!f || !PCD?.agent) return; e.preventDefault();
  const v = f.querySelector('input').value.trim(), m = chat.msgs.findLast(x => x.agent && x.ask); if (v && m) PCD.agent.answer(agSid(), m.ask.id, v);
});
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-agundo], [data-agstep], [data-agplan], [data-aggit]'); if (!b || !PCD?.agent || !chat.id) return;
  e.preventDefault(); e.stopPropagation();
  if (b.dataset.agplan != null) { const nx = localStorage.getItem('pcAgentExec') || 'edits'; return agentSend('อนุมัติแผนแล้ว ลงมือทำตามแผนได้เลย', { mode: nx }); }
  if (b.dataset.aggit != null) {
    const show = async (action, title) => { const r = await PCD.agent.git('chat', action).catch(x => ({ code: 1, out: x.message })); sheet(title, `<pre class="gitout">${diffPre(r.out.replace(/^\+(?!\+)/gm, '+ ').replace(/^-(?!-)/gm, '- ') || '(ไม่มีอะไร)')}</pre><div class="row"><button class="btn out sm" data-g="diff">ดู diff</button><button class="btn blue sm" data-g="commit">Commit ทั้งหมด</button></div>`, (d, close) => d.querySelectorAll('[data-g]').forEach(x => x.onclick = async () => {
      if (x.dataset.g === 'diff') { close(); return show('diff', 'git diff'); }
      const msg = await promptSheet('ข้อความ commit', (chat.msgs.findLast(m => m.role === 'user')?.content || 'AstraCode Agent').split('\n')[0].slice(0, 70), { title: 'Commit', ok: 'Commit' }); if (!msg) return;
      const r2 = await PCD.agent.git('chat', 'commit', msg); toast(r2.code ? 'commit ไม่สำเร็จ: ' + r2.out.slice(0, 120) : 'commit แล้ว', r2.code ? 'bad' : 'ok'); close();
    })); };
    return show('status', 'Git ของโฟลเดอร์');
  }
  const step = b.dataset.agstep != null ? +b.dataset.agstep : null;
  if (!await confirmSheet(step != null ? 'ย้อนไฟล์ที่ Agent แก้ตั้งแต่ขั้นนี้เป็นต้นไปกลับเป็นแบบเดิม?' : 'ย้อนไฟล์ทุกไฟล์ที่ Agent แก้/สร้างในรอบล่าสุดกลับเป็นแบบเดิม?', { title: 'ย้อนไฟล์', ok: 'ย้อนเลย' })) return;
  const done = await PCD.agent.undo(agSid(), step).catch(x => { toast(x.message, 'bad'); return null; }); if (!done) return;
  const m = chat.msgs.findLast(x => x.agent); if (m) { if (step == null) m.changed = []; else m.steps.forEach(s => { if (s.step >= step && ['edit_file', 'write_file'].includes(s.name)) s.st = 'bad'; }); } renderAll(); toast(done.length ? `ย้อน ${done.length} ไฟล์แล้ว` : 'ไม่มีไฟล์ให้ย้อน', 'ok');
});
// ตัวอย่างงานตามอาชีพ (โหมดงานทั่วไป): Agent ทำไฟล์ออฟฟิศจากไฟล์ในโฟลเดอร์
const AG_ROLES = [['ขาย/การตลาด', ['สรุปยอดขายจากไฟล์ Excel ในโฟลเดอร์ ทำรายงาน Excel มีกราฟรวมรายเดือน', 'ทำสไลด์ PowerPoint 8 หน้า นำเสนอสินค้าจากข้อมูลในโฟลเดอร์']], ['บัญชี/การเงิน', ['รวมใบเสร็จ PDF ในโฟลเดอร์เป็นตาราง Excel (วันที่ ร้าน ยอด VAT)', 'เช็คยอดใน Excel ว่าตรงกับใบแจ้งหนี้ PDF ไหม สรุปจุดที่ไม่ตรง']], ['HR/ธุรการ', ['ร่างประกาศบริษัทเป็นไฟล์ Word จากโน้ตในโฟลเดอร์', 'สรุปเอกสารทุกไฟล์ในโฟลเดอร์เป็น Word หน้าเดียว']], ['ทั่วไป', ['จัดไฟล์ในโฟลเดอร์ให้เป็นหมวดหมู่ (ถามก่อนย้าย)', 'แปลงไฟล์ Word นี้เป็น PDF และทำสรุป 5 บรรทัด']]];
// งานตั้งเวลา: แอปที่ถาดรัน Agent เองตามเวลา (เครื่องต้องเปิดอยู่) · โหมดทำเองต้องยืนยันในหน้าต่าง Windows ตอนบันทึก
async function scheduleSheet() {
  let list = await PCD.agent.schedules().catch(() => []);
  const DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'], m = curModel(), slug = m && m.id !== 'auto' ? vslug(m) : 'claude-sonnet-5.5-eco';
  const draw = () => `<div class="sheet-form"><p class="sheet-msg">Agent ทำงานเองตามเวลา ในโฟลเดอร์ที่เลือกไว้ · ต้องเปิดเครื่องและแอป (อยู่ที่ถาดได้) · ผลขึ้นเป็นแชตใหม่ + แจ้งเตือน</p>
    ${list.map((x, i) => `<div class="plug"><div><b>${esc(x.time)}</b> ${x.days.length === 7 ? 'ทุกวัน' : x.days.map(d => DAYS[d]).join(' ')} · ${esc(x.name || x.text.slice(0, 40))}<br><small class="muted">${x.mode === 'auto' ? 'ทำเองทั้งหมด' : x.mode === 'edits' ? 'แก้ไฟล์เอง' : 'ถามก่อน'} · ${esc(x.model)}</small></div><label class="sw"><input type="checkbox" data-son="${i}" ${x.on ? 'checked' : ''}><span></span></label><button type="button" class="icon-btn xs ghost" data-sdel="${i}" aria-label="ลบ">${ic('x')}</button></div>`).join('') || '<p class="muted" style="margin:0">ยังไม่มีงานตั้งเวลา</p>'}
    <b>เพิ่มงาน</b><input id="snm" placeholder="ชื่องาน เช่น สรุปยอดขายเช้า"><textarea id="stx" rows="3" placeholder="สั่งงาน เช่น อ่านไฟล์ Excel ยอดขายเมื่อวานในโฟลเดอร์ แล้วทำสรุปเป็น Word"></textarea>
    <div class="row"><input id="stm" type="time" value="08:00" style="width:auto"><select id="smd" style="width:auto"><option value="edits">แก้ไฟล์เอง</option><option value="auto">ทำเองทั้งหมด</option><option value="ask">ถามก่อน (ต้องอยู่หน้าจอ)</option></select></div>
    <div class="row">${DAYS.map((d, i) => `<label class="chk"><input type="checkbox" data-sday="${i}" checked> ${d}</label>`).join('')}</div>
    <button type="button" class="btn blue" id="sadd">เพิ่ม</button></div>`;
  sheet('งานตั้งเวลา', draw(), function bind(d, close) {
    const saveL = async l => { try { if (await PCD.agent.setSchedules(l)) { list = await PCD.agent.schedules(); d.querySelector('.sheet-b').innerHTML = draw(); bind(d, close); toast('บันทึกแล้ว', 'ok'); } } catch (x) { toast(x.message, 'bad'); } };
    d.querySelectorAll('[data-sdel]').forEach(b => b.onclick = () => saveL(list.filter((_, i) => i !== +b.dataset.sdel)));
    d.querySelectorAll('[data-son]').forEach(b => b.onchange = () => saveL(list.map((x, i) => i === +b.dataset.son ? { ...x, on: b.checked } : x)));
    d.querySelector('#sadd').onclick = () => { const text = d.querySelector('#stx').value.trim(); if (!text) return toast('พิมพ์งานที่จะสั่งก่อน', 'bad'); saveL([...list, { name: d.querySelector('#snm').value.trim(), text, time: d.querySelector('#stm').value, mode: d.querySelector('#smd').value, days: [...d.querySelectorAll('[data-sday]:checked')].map(x => +x.dataset.sday), model: slug, style: localStorage.getItem('pcAgentStyle') === 'code' ? 'code' : 'work', on: true }]); };
  });
}
// ครั้งแรกที่เปิดโหมด Agent: อธิบายสั้นๆ 3 ข้อ + ตัวอย่างคำสั่ง (กดแล้วใส่ในช่องพิมพ์)
function agentTour() {
  const ex = localStorage.getItem('pcAgentStyle') === 'work' ? AG_ROLES.flatMap(r => r[1]).slice(0, 6) : ['/explain', 'หาว่าทำไมหน้า login กดแล้วไม่ไปต่อ แล้วแก้ให้', 'เพิ่มปุ่ม export เป็น Excel ในหน้ารายงาน แล้วรันเทสต์', '/init'];
  sheet('เริ่มใช้โหมด Agent', `<div class="sheet-form agtour"><ol><li><b>สั่งเป็นงาน ไม่ต้องสั่งทีละขั้น</b> Agent จะอ่านโค้ด แก้ไฟล์ รันเทสต์ และแก้ error เองจนเสร็จ</li><li><b>เลือกระดับอนุญาต</b> เริ่มที่ "ถามก่อนทุกครั้ง" หรือ "วางแผนก่อน" แล้วค่อยปล่อยให้ทำเองเมื่อมั่นใจ · ย้อนไฟล์ได้ทุกขั้น</li><li><b>คุมระหว่างทาง</b> พิมพ์แทรกแล้วกด Enter ได้ตลอด · กดปุ่มหยุดเมื่อไรก็ได้ · ดู/อนุญาตจากมือถือได้</li></ol>
    <b>ลองสั่ง</b><div class="row" style="flex-wrap:wrap">${ex.map(x => `<button type="button" class="btn out sm" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <p class="muted" style="margin:0;font-size:12.5px">ค่าใช้จ่ายหักลิมิต/Wallet ตาม token จริง ตั้งเพดานเงินต่องานได้ในเมนูนี้ · แนะนำโมเดล Claude Sonnet / Opus Eco</p><button class="btn blue" id="agtok">เข้าใจแล้ว</button></div>`, (d, close) => {
    const done = () => { localStorage.setItem('agTour', '1'); close(); };
    d.querySelector('#agtok').onclick = done;
    d.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const t = $('#t'); t.value = b.dataset.ex; t.oninput?.(); done(); t.focus(); });
  });
}
// ปลั๊กอิน (แบบ Claude Code): แคตตาล็อกจากเว็บ + ติดตั้งจากลิงก์ manifest · ติดตั้งจริงต้องยืนยันในหน้าต่าง Windows (เพราะ MCP คือโปรแกรมที่รันในเครื่อง)
async function pluginSheet() {
  const [cat, mine] = await Promise.all([fetch('/plugins/catalog.json').then(r => r.json()).catch(() => ({ plugins: [] })), PCD.plugins.list().catch(() => [])]);
  const has = n => mine.some(p => p.name === n), extra = mine.filter(p => !cat.plugins.some(c => c.name === p.name));
  const row = (p, inst) => `<div class="plug"><div><b>${esc(p.title || p.name)}</b>${inst ? ' <span class="pill ok">ติดตั้งแล้ว</span>' : ''}<br><small class="muted">${esc(p.description || '')}</small><br><small>${[...Object.keys(p.mcpServers || {}).map(x => 'MCP ' + x), ...(p.mcp || []).map(x => 'MCP ' + x), ...(p.commands || []).map(c => '/' + (c.name || c))].map(esc).join(' · ')}</small></div>${inst ? `<button type="button" class="btn out sm" data-prm="${esc(p.name)}">ถอน</button>` : `<button type="button" class="btn blue sm" data-pin="${esc(p.name)}">ติดตั้ง</button>`}</div>`;
  sheet('ปลั๊กอิน', `<div class="sheet-form"><p class="sheet-msg">ปลั๊กอิน = ชุดเครื่องมือ (MCP) + คำสั่งลัด + กติกา ที่ Agent ใช้ได้ทันที · บางตัวต้องมี Node.js / uv ในเครื่อง</p>
    ${cat.plugins.map(p => row(p, has(p.name))).join('')}${extra.map(p => row(p, true)).join('')}
    <b>ติดตั้งจากลิงก์</b><div class="row" style="flex-wrap:nowrap"><input id="purl" placeholder="https://…/plugin.json" style="flex:1"><button type="button" class="btn out sm" id="pgo">ติดตั้ง</button></div>
    <small class="muted">รูปแบบ manifest: { "name", "title", "description", "mcpServers": {…}, "commands": [{ "name", "text" }], "rules", "hooks": { "after_edit" }, "envAsk": ["TOKEN"] }</small></div>`, (d, close) => {
    const done = ok => { if (ok) { close(); chat.pcTools = null; pcTools(); toast('ติดตั้งแล้ว', 'ok'); } };
    d.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => {
      const p = cat.plugins.find(x => x.name === b.dataset.pin), env = {};
      for (const k of p.envAsk || []) { const v = await promptSheet(`ใส่ค่า ${k} สำหรับ ${p.title} (เก็บในเครื่องนี้เท่านั้น)`, '', { title: p.title }); if (!v) return; env[k] = v; }
      try { done(await PCD.plugins.install(p, env)); } catch (x) { toast(String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad'); }
    });
    d.querySelectorAll('[data-prm]').forEach(b => b.onclick = async () => { await PCD.plugins.remove(b.dataset.prm); close(); chat.pcTools = null; pcTools(); toast('ถอนแล้ว'); });
    d.querySelector('#pgo').onclick = async () => { const u = d.querySelector('#purl').value.trim(); if (!u) return; try { done(await PCD.plugins.install(u)); } catch (x) { toast(String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'bad'); } };
  });
}
// ---------- มือถือ/เครื่องอื่น: ดูและสั่ง Agent ที่ทำงานบนคอม (เปิดแชตเดียวกัน) ----------
let remoteT = null;
async function remoteWatch() {
  clearTimeout(remoteT); const id = chat.id; if (!id || chat.agentBusy) return $('#rmt')?.remove();
  const d = await api('/remote/' + id).catch(() => null); if (chat.id !== id) return;
  if (!d || !Array.isArray(d.events) || (!d.running && !d.ask && Date.now() - d.updated_at > 10 * 60e3)) return $('#rmt')?.remove();
  let box = $('#rmt'); if (!box) { box = document.createElement('div'); box.id = 'rmt'; box.className = 'rmt'; $('#msgs')?.before(box); }
  const evs = d.events.filter(x => ['tool', 'sub', 'info', 'done', 'error', 'tool_result'].includes(x.type)).slice(-14);
  box.innerHTML = `<div class="rmt-h">${ic('server', 'sm')} <b>Agent บนคอม</b> <span class="muted">${d.running ? (d.live ? 'กำลังทำงาน' : 'ขาดการติดต่อ') : 'หยุดแล้ว'}</span></div>
    <div class="rmt-ev">${evs.map(x => x.type === 'tool' ? `<div>${ic(AG_ICON[x.name] || 'server', 'sm')} ${esc(x.name)} <code>${esc(String(agArg(x)).slice(0, 80))}</code></div>` : x.type === 'tool_result' ? '' : x.type === 'sub' ? `<div class="muted">↳ ${esc(x.name)} <code>${esc(String(agArg(x)).slice(0, 60))}</code></div>` : x.type === 'done' ? `<div><b>เสร็จ:</b> ${esc((x.final || '').slice(0, 300))}</div>` : `<div class="${x.type === 'error' ? 'bad' : 'muted'}">${esc(x.text || '')}</div>`).join('')}</div>
    ${d.ask ? `<div class="rmt-ask"><b>${esc(d.ask.title)}</b><pre>${diffPre(d.ask.detail || '')}</pre><div class="row"><button class="btn blue sm" data-rv="yes">อนุญาต</button>${d.ask.allowAll ? '<button class="btn out sm" data-rv="all">อนุญาตทั้งงาน</button>' : ''}<button class="btn red sm" data-rv="no">ไม่อนุญาต</button></div></div>` : ''}
    ${d.running ? `<form class="row rmt-say"><input placeholder="พิมพ์แทรกถึง Agent…" maxlength="2000"><button class="btn out sm">ส่ง</button></form>` : ''}`;
  box.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { await api(`/remote/${id}/answer`, { method: 'POST', body: { id: d.ask.id, v: b.dataset.rv } }).catch(x => toast(x.message, 'bad')); toast('ส่งคำตอบแล้ว', 'ok'); remoteWatch(); });
  box.querySelector('.rmt-say')?.addEventListener('submit', async e => { e.preventDefault(); const i = e.target.querySelector('input'); if (!i.value.trim()) return; await api(`/remote/${id}/say`, { method: 'POST', body: { text: i.value } }).catch(x => toast(x.message, 'bad')); i.value = ''; toast('ส่งถึง Agent แล้ว', 'ok'); });
  if (!box.contains(document.activeElement)) remoteT = setTimeout(remoteWatch, d.running || d.ask ? 3000 : 15000); else remoteT = setTimeout(remoteWatch, 6000);
}

// กันเหนียว: error ที่หลุดมานอก try ต้องเห็นบนจอ ไม่ใช่เงียบหายไปเลย
addEventListener('error', e => { try { if (e.message) showErr('ผิดพลาด: ' + e.message); } catch {} });
addEventListener('unhandledrejection', e => { const s = e.reason?.message || String(e.reason || ''); if (s && !/\babort/i.test(s)) try { showErr('ผิดพลาด: ' + s); } catch {} });


// ตั้งค่าโฟลเดอร์: ชื่อ + คำสั่งที่ทุกแชตในโฟลเดอร์ใช้ + เอกสารอ้างอิง (อ่านไฟล์ในเครื่องแล้วเก็บเป็นข้อความ)
async function folderSheet(id) {
  const f = await api('/folders/' + id).catch(x => { toast(x.message, 'bad'); return null; }); if (!f) return;
  let files = f.files.slice();
  const list = () => files.map((x, i) => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap;font-size:13px">${ic('filetext', 'sm')}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</span><span class="muted">${((x.size ?? x.text.length) / 1000).toFixed(1)}k</span><button type="button" class="icon-btn xs ghost" data-rmf="${i}" aria-label="ลบไฟล์">${ic('x')}</button></div>`).join('') || '<p class="muted" style="font-size:13px;margin:0">ยังไม่มีเอกสาร</p>';
  sheet('ตั้งค่าโฟลเดอร์', `<form id="fdf" class="sheet-form" style="display:grid;gap:8px">
    <label>ชื่อ</label><input name="name" value="${esc(f.name)}" maxlength="40" required>
    <label>คำสั่งสำหรับทุกแชตในโฟลเดอร์นี้</label><textarea name="ins" rows="4" maxlength="4000" placeholder="เช่น ตอบในฐานะผู้ช่วยร้านกาแฟ ใช้ราคาจากเอกสารที่แนบ ตอบสั้นและสุภาพ">${esc(f.instructions || '')}</textarea>
    <label>เอกสารอ้างอิง (สูงสุด 10 ไฟล์ รวม 150,000 ตัวอักษร)</label><div id="fdl" style="display:grid;gap:4px">${list()}</div>
    <label class="btn out sm" style="justify-self:start">${ic('clip', 'sm')} เพิ่มไฟล์<input type="file" id="fdi" multiple hidden></label>
    <p class="muted" style="font-size:12px;margin:0">AI เห็นคำสั่งและเอกสารนี้ทุกครั้งที่คุยในแชตของโฟลเดอร์ ยิ่งเอกสารยาว แต่ละข้อความยิ่งใช้ลิมิตมากขึ้น</p>
    <button class="btn blue">บันทึก</button></form>`, (d, close) => {
    const redraw = () => { d.querySelector('#fdl').innerHTML = list(); d.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rmf, 1); redraw(); }); };
    redraw();
    d.querySelector('#fdi').onchange = async e => { for (const x of e.target.files) { if (files.length >= 10) break; try { files.push({ name: x.name.replace(/[\[\]\r\n]/g, '').slice(0, 120), text: await readFile(x) }); } catch (er) { toast(`${x.name}: ${er.message}`, 'bad'); } } e.target.value = ''; redraw(); };
    d.querySelector('#fdf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await api('/folders/' + id, { method: 'PUT', body: { name: fd.get('name'), instructions: fd.get('ins'), files: files.map(x => x.text != null ? x : { name: x.name }) } }); toast('บันทึกแล้ว', 'ok'); close(); loadSide(); } catch (x) { toast(x.message, 'bad'); }
    };
  });
}
