const WHATS_NEW = 'whatsnew:2026-11-code'; // เปลี่ยนเลขเมื่อมีฟีเจอร์ใหม่ที่อยากบอกผู้ใช้เดิม
// Kyber: หน้าแชต
let chat = { id: null, msgs: [], busy: false, ctrl: null, images: [], files: [], chats: [], folders: [], skills: JSON.parse(localStorage.getItem('skills') || '[]'), mcps: JSON.parse(localStorage.getItem('mcps') || '[]') };
{ // กลับจากหน้ายินยอมของ Google: เปิด MCP ของ Google ในแชตให้เลย
  const q = new URLSearchParams(location.search), g = q.get('google');
  if (g) { const id = +q.get('mcp_on'); if (id && !chat.mcps.includes(id)) { chat.mcps = [...chat.mcps, id].slice(-3); localStorage.setItem('mcps', JSON.stringify(chat.mcps)); } setTimeout(() => toast(g === 'ok' ? 'เชื่อม Google แล้ว: สั่ง AI อ่าน/ส่ง Gmail, ค้น Drive, แก้ Sheets, ลงปฏิทินได้เลย' : g, g === 'ok' ? 'ok' : 'bad'), 800); history.replaceState(null, '', location.pathname); }
}
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
  if (typeof globalThis[k] !== 'function') console.warn('[Kyber] app.js ไม่มี ' + k + '() — deploy app.js ให้ตรงกับ chat.js');
let autoRetry = 0; // ลองซ้ำอัตโนมัติได้ครั้งเดียว กันวนไม่จบ
// กดหยุด = สั่งเซิร์ฟเวอร์หยุดตอบจริง (แค่ปิดจอหรือหลุดเน็ต AI จะตอบต่อเบื้องหลัง)
function stopRun() { if (chat.enhancing) return chat.enhancing.abort(); fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: chat.id || null }) }).catch(() => {}); chat.ctrl?.abort(); }
// สลับแชตโดยไม่โหลดหน้าใหม่
function openChat(id, space = null) { chat.spaceId = id ? null : space; chat.spaceName = chat.spaceId ? chat.folders?.find(f => f.id === space)?.name || 'this workspace' : null; if (chat.busy) stopRun(); setUrl(id ? '/chat?id=' + id : '/chat'); chatView(id); }
PAGES.chat = () => qs().get('mode') === 'cowork' ? switchMode('cowork', location.pathname + location.search, true) : chatView(qs().get('id'));
PAGES.code = () => switchMode('code', here(), true);
// ---------- Chat กับ Code อยู่ในหน้าเดียว: แถบข้างเดียวกัน ฝั่งขวาสลับระหว่างแชต (.main) กับโหมด Code (#cmain) ไม่โหลดหน้าใหม่ ----------
// แชตที่กำลังตอบยังตอบต่อขณะอยู่โหมด Code (แค่ซ่อนไว้) · โค้ดโหมด Code (code.js) และตัวแก้โค้ด (cm.js) โหลดเมื่อใช้ครั้งแรก
const prefetch = href => { const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'script'; l.href = href; document.head.append(l); };
const loadJs = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('โหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่')); document.head.append(s); });
let codeJs = null;
const loadCode = () => typeof codeDispatch === 'function' ? Promise.resolve() : (codeJs ||= loadJs('/code.js').catch(x => { codeJs = null; throw x; }));
const curMode = () => ['code', 'cowork'].includes(document.body.dataset.page) ? document.body.dataset.page : 'chat';
let cwJs = null; const loadCowork = () => typeof coworkView === 'function' ? Promise.resolve() : (cwJs ||= loadJs('/cowork.js').catch(x => { cwJs = null; throw x; }));
function openSide() { const side = $('#side'); if (!side || side.classList.contains('open')) return; side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = closeSide; side.parentElement.append(s); }
function closeSide() { $('#side')?.classList.remove('open'); document.querySelector('.chat > .shade')?.remove(); }
// path = ที่อยู่ที่จะเปิด (เช่น /code?p=3) · ไม่ใส่ = กลับไปหน้าที่เปิดค้างไว้ของโหมดนั้น · pop = มาจากปุ่มย้อนกลับ (ไม่เพิ่มประวัติ)
async function switchMode(mode, path, pop) {
  if (!$('#cmain')) { document.body.dataset.page = mode; await chatView(mode === 'chat' ? qs().get('id') : null); }
  if (!$('#cwmain')) { const cw = Object.assign(document.createElement('div'), { id: 'cwmain', className: 'cwmain', hidden: true }); app.querySelector('.chat').insertBefore(cw, $('#canvas')); }
  const host = $('#cmain'), was = curMode();
  if (was === 'code' && mode === 'chat') host.dataset.url = location.pathname + location.search;
  document.body.dataset.page = mode; closeSide();
  $('#side').querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('on', b.dataset.mode === mode); b.setAttribute('aria-pressed', b.dataset.mode === mode); });
  $('#paneChat').hidden = mode !== 'chat'; $('#paneCode').hidden = mode !== 'code'; $('#paneCowork').hidden = mode !== 'cowork';
  app.querySelector('.chat > .main').hidden = mode !== 'chat'; host.hidden = mode !== 'code'; $('#cwmain').hidden = mode !== 'cowork';
  if (mode !== 'chat') $('#canvas').hidden = true;
  if (mode === 'cowork') { // โหมด Kyber Harness: งานที่ AI ทำเองจนจบ (cowork.js โหลดเมื่อเปิดครั้งแรก)
    const target = path || '/chat?mode=cowork'; if (!pop && target !== location.pathname + location.search) setUrl(target);
    try { await loadCowork(); } catch (x) { $('#cwmain').innerHTML = `<div class="cs-load"><p class="muted">${esc(x.message)}</p></div>`; return; }
    $('#paneCowork').innerHTML = coworkSide(); document.title = 'Kyber Harness · Kyber';
    return coworkView(new URL(target, location.href).searchParams.get('task'));
  }
  if (mode === 'chat') {
    document.title = (chat.id && $('#ctl')?.textContent) || 'Chat · Kyber';
    const want = path ? new URL(path, location.href).searchParams.get('id') : null;
    if (path && (+want || null) !== chat.id) { if (!pop) setUrl(path); return chatView(want); }
    if (!pop && was !== 'chat' && !path) return setUrl(chat.id ? '/chat?id=' + chat.id : '/chat');
    if (!pop) setUrl(chat.id ? '/chat?id=' + chat.id : '/chat');
    return;
  }
  drawProjects();
  const target = path || host.dataset.url || '/code';
  if (!pop && target !== location.pathname + location.search) setUrl(target);
  if (!path && host.childElementCount) return; // กลับมาที่หน้าเดิมที่เปิดค้างไว้ (ตัวแก้โค้ด / หน้าเริ่มโปรเจกต์)
  if (!host.childElementCount) host.innerHTML = '<div class="cs-load"><p class="muted">Loading…</p></div>';
  try { await loadCode(); } catch (x) { host.innerHTML = `<div class="cs-load"><p class="muted">${esc(x.message)}</p><button class="btn out" data-reload>Try again</button></div>`; return; }
  return codeRoute();
}
addEventListener('popstate', () => { if (!$('#cmain')) return; const p = location.pathname; if (p.startsWith('/code')) switchMode('code', p + location.search, true); else if (p === '/chat' && qs().get('mode') === 'cowork') switchMode('cowork', p + location.search, true); else if (p === '/chat') switchMode('chat', p + location.search, true); });
// ลิงก์ /code และ /chat ในหน้านี้ (แถบข้าง, ปุ่มในตัวแก้โค้ด) เปิดในหน้าเดิม
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]'); if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.hasAttribute('download') || !$('#cmain') || window.DEMO) return;
  const u = new URL(a.href, location.href); if (u.origin !== location.origin) return;
  if (u.pathname === '/code') { e.preventDefault(); switchMode('code', u.pathname + u.search); }
  else if (u.pathname === '/chat' && u.searchParams.get('mode') === 'cowork') { e.preventDefault(); switchMode('cowork', u.pathname + u.search); }
  else if (u.pathname === '/chat' && curMode() !== 'chat') { e.preventDefault(); switchMode('chat', u.search ? u.pathname + u.search : null); }
});
function notice(u) {
  if (u.pct4h >= 100 || u.pctWeek >= 100)
    return `<div class="notice full">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)}${me.balance >= 1 ? ' · โมเดลนอกแพลนยังใช้ได้ด้วย Wallet' : ''} <a class="btn blue sm" href="/plans?topup=1">เติมเงิน</a> <a class="btn out sm" href="/plans">Upgrade</a></div>`;
  const p = Math.max(u.pct4h, u.pctWeek);
  // ใช้ Wallet อย่างเดียว (ไม่มีแพลน) แล้วเงินใกล้หมด: เตือนก่อนส่งไม่ได้
  if (!me.plan?.paid && me.balance > 0 && me.balance < 10) return `<div class="notice hi">เงินใน Wallet เหลือ ฿${(+me.balance).toFixed(2)} · <a href="/plans?topup=1">เติมเงิน (ขั้นต่ำ ฿10)</a></div>`;
  return p >= 80 ? `<div class="notice hi">ใช้ลิมิตไปแล้ว ${p}% · <a href="/plans">อัปเกรดเพื่อใช้ได้มากขึ้น</a></div>` : '';
}
function setUsage(u) { me.usage = u; const s = u.sub_id && me.subs?.find(x => x.id === u.sub_id); if (s) Object.assign(s, { pct4h: u.pct4h, pctWeek: u.pctWeek, reset4h: u.reset4h, resetWeek: u.resetWeek }); $('#lim').innerHTML = limHTML(u); $('#notice').innerHTML = notice(u); } // หลายแพลน: อัปเดตใบที่เพิ่งถูกหัก
// "อัตโนมัติ": เซิร์ฟเวอร์เลือกโมเดลถูกหรือเก่งตามคำถาม (ประหยัดลิมิต)
const AUTO = () => ({ id: 'auto', name: 'อัตโนมัติ', effort: me.models.some(m => m.effort !== 'none') ? 'auto' : 'none', vision: me.models.some(m => m.vision) });
// ข้อความที่ดูเป็นข้อมูลส่วนตัว/ความชอบถาวร: เน้นปุ่มจำ ให้กดบันทึกเป็นความจำได้ในคลิกเดียว
const MEM_RE = /(^|\s)(ฉัน|ผม|หนู|เรา|ดิฉัน)(ชื่อ|ชอบ|ไม่ชอบ|ทำงาน|เป็น|ใช้|อยาก|ถนัด)|จำไว้|ต่อไปนี้ให้|ทุกครั้งให้|\b(my name is|i am a|i work|i prefer|i always|remember that|from now on|call me)\b/i;
const curModel = () => $('#model')?.value === 'auto' ? AUTO() : me.models.find(m => m.id === +$('#model')?.value) || me.models[0];

async function chatView(id) {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const keep = $('#cmain'); keep?.remove(); // โหมด Code ที่เปิดค้างไว้ อยู่ต่อเมื่อวาดแชตใหม่
  chat = { ...chat, id: id ? +id : null, msgs: id ? await api('/chats/' + id).catch(() => []) : [], busy: false, images: [], files: [], agSid: null };
  autoRetry = 0;
  for (const m of chat.msgs) if (typeof m.sources === 'string') try { m.sources = JSON.parse(m.sources); } catch { m.sources = null; }
  const saved = localStorage.getItem('model'), opt = sel => me.models.filter(m => !m.locked).map(m => `<option value="${m.id}" ${String(m.id) === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const sideMode = curMode();
  app.innerHTML = `<div class="chat view"><aside class="side" id="side">
      <div class="side-top">
        <a class="logo" href="/">Kyber</a>
        <span class="side-top-acts">
          <a class="icon-btn sm ghost" href="/chat" data-chat="" aria-label="New chat" title="New chat">${ic('newchat')}</a>
          <button type="button" class="icon-btn sm ghost" id="sbtn" aria-label="Search chats">${ic('search')}</button>
          <button type="button" class="icon-btn sm ghost side-x" id="sclose" aria-label="Close sidebar">${ic('x')}</button>
        </span>
      </div>
      <div class="side-search" id="sbox" hidden><input id="search" placeholder="Search chats…" aria-label="Search chats"></div>
      <div class="mode-seg" role="group" aria-label="Mode">
        <button type="button" data-mode="chat" class="${sideMode === 'chat' ? 'on' : ''}" aria-pressed="${sideMode === 'chat'}">${ic('msg', 'sm')}<span>Chat</span></button>
        <button type="button" data-mode="code" class="${sideMode === 'code' ? 'on' : ''}" aria-pressed="${sideMode === 'code'}">${ic('code', 'sm')}<span>Code</span></button>
        <button type="button" data-mode="cowork" class="${sideMode === 'cowork' ? 'on' : ''}" aria-pressed="${sideMode === 'cowork'}" title="Kyber Harness">${ic('layers', 'sm')}<span>Harness</span></button>
      </div>
      <div class="side-pane" id="paneChat" ${sideMode === 'chat' ? '' : 'hidden'}>
        <div class="work-tiles${me?.plan?.artifacts ? '' : ' one'}">
          <button type="button" id="spc" class="wtile">${ic('folder')}<b>Workspace</b><small id="spcN">เครื่องมือ + โฟลเดอร์งาน</small></button>
          ${me?.plan?.artifacts ? `<button type="button" id="arts" class="wtile">${ic('code')}<b>Artifacts</b><small>Pages built by AI</small></button>` : ''}
        </div>
        ${deskLink() ? `<nav class="side-nav">${deskLink()}</nav>` : ''}
        <div class="side-sec"><span>Chats</span><button type="button" class="icon-btn xs ghost" id="newc" aria-label="New chat" title="New chat">${ic('plus')}</button></div>
        <div class="list" id="list"></div>
      </div>
      <div class="side-pane" id="paneCowork" ${sideMode === 'cowork' ? '' : 'hidden'}></div>
      <div class="side-pane" id="paneCode" ${sideMode === 'code' ? '' : 'hidden'}>
        <a class="side-new" href="/code">${ic('plus', 'sm')}<span>New project</span></a>
        <nav class="side-nav"><button type="button" id="allp">${ic('code')}<span>All projects</span></button></nav>
        <div class="side-sec"><span>Projects</span></div>
        <div class="list" id="plist"><p class="muted" style="padding:8px 12px">Loading…</p></div>
      </div>
      <div class="side-foot">
        <button type="button" class="side-user" id="acct" aria-haspopup="menu" aria-expanded="false" title="${esc(me.email)}">
          <span class="av sm">${esc((me.email || 'A')[0].toUpperCase())}</span>
          <span class="su-t"><b>${esc(me.email.split('@')[0])}</b><small>${esc(me.plan.name)} · ${Math.round(Math.max(me.usage?.pct4h || 0, me.usage?.pctWeek || 0))}% used</small></span>
          ${ic('up', 'sm')}
        </button>
      </div>
    </aside>
    <div class="main" ${sideMode !== 'chat' ? 'hidden' : ''}><div class="bar"><button class="menu-btn" id="menu" aria-label="เมนู">${ic('menu')}</button>
      <div class="ctitle"><b id="ctl">Chat</b><small id="ctok"></small></div>
      <button class="lim" id="lim" aria-label="ลิมิตการใช้งาน"></button>
      <a class="icon-btn sm" href="/chat" data-new aria-label="แชตใหม่">${ic('newchat')}</a>
      <select id="model" hidden>${me.models.length > 1 ? `<option value="auto" ${saved === 'auto' || !saved ? 'selected' : ''}>อัตโนมัติ</option>` : ''}${opt(saved)}</select>
      <select id="effort" hidden>${EFFORTS.map(([v]) => `<option value="${v}" ${v === (localStorage.getItem('effort') || '') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="msgs" id="msgs"></div>
      <div class="compose"><button type="button" class="scroll-fab" id="sdown" hidden aria-label="เลื่อนลงล่างสุด">${ic('down')}</button><div id="notice">${notice(me.usage)}</div><div class="err" id="e"></div><div class="thumbs" id="thumbs"></div><div id="flags" class="cflags"></div>
        <form id="f" class="cbox"><input type="file" id="file" multiple hidden>
          <textarea id="t" rows="1" placeholder="Ask anything · type / for Skills" aria-label="Message"></textarea>
          <div class="crow"><button type="button" class="cb" id="plus" aria-label="แนบไฟล์และเครื่องมือ">${ic('plus')}</button>${('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? `<button type="button" class="cb" id="mic" aria-label="พิมพ์ด้วยเสียง">${ic('mic')}</button>` : ''}
            <button type="button" class="cb pick" id="mdl" aria-haspopup="dialog"></button>
            <button type="button" class="cb pick" id="eff" aria-haspopup="dialog"></button>
            
            <button class="send" id="go" aria-label="ส่ง">${ic('up')}</button></div></form></div>
      </div>
    <aside class="canvas" id="canvas" hidden>
      <div class="cv-h"><b id="cv-t">Canvas</b><select id="cv-v" class="cv-v" hidden aria-label="เวอร์ชัน"></select><div class="seg" style="margin:0"><button type="button" data-cv="prev" class="on">Preview</button><button type="button" data-cv="code">Code</button></div><span class="sp"></span><button type="button" class="btn out sm" id="cv-sh" hidden>แชร์</button><button type="button" class="btn out sm" id="cv-cp">Copy</button><button type="button" class="icon-btn sm ghost" id="cv-dl" aria-label="ดาวน์โหลด .html">${ic('download')}</button><button type="button" class="btn out sm" id="cv-tc">ส่งไป Code</button><button type="button" class="icon-btn sm ghost" id="cv-x" aria-label="ปิด Canvas">${ic('x')}</button></div>
      <div class="cv-dev" id="cv-dev"><div class="seg" role="group" aria-label="ขนาดหน้าจอพรีวิว">${[['full', 'expand', 'เต็มพื้นที่'], ['phone', 'smartphone', 'มือถือ'], ['tablet', 'tablet', 'แท็บเล็ต'], ['desktop', 'monitor', 'คอม']].map(([k, i, t]) => `<button type="button" data-dev="${k}" title="${t}" aria-label="${t}">${ic(i, 'sm')}<span>${t}</span></button>`).join('')}</div><select id="cv-dsz" aria-label="รุ่นอุปกรณ์" hidden></select><button type="button" class="icon-btn sm ghost" id="cv-rot" aria-label="หมุนจอ" title="หมุนจอ" hidden>${ic('rotate', 'sm')}</button><small class="muted" id="cv-zoom"></small></div>
      <div class="cv-b"><div class="cv-stage" id="cv-stage"><div class="cv-frame" id="cv-fr"><iframe id="cv-f" sandbox="allow-scripts allow-modals allow-forms allow-popups" title="Canvas Preview"></iframe></div></div><pre id="cv-c" hidden><code></code></pre></div>
    </aside></div>`;
  const host = keep || Object.assign(document.createElement('div'), { id: 'cmain', className: 'cmain' });
  if (!keep && !window.DEMO) setTimeout(() => { if (typeof codeDispatch !== 'function') prefetch('/code.js'); }, 3000); // สลับไป Code ได้ทันที
  host.hidden = sideMode !== 'code'; app.querySelector('.chat').insertBefore(host, $('#canvas'));
  const side = $('#side');
  $('#allp').onclick = () => { closeSide(); loadCode().then(projectsSheet).catch(x => toast(x.message, 'bad')); };
  side.addEventListener('click', e => { const a = e.target.closest('a[data-chat]'); if (!a) return; e.preventDefault(); openChat(+a.dataset.chat || null); });
  // แถบข้าง: สลับ Chat / Code ในหน้าเดียว · ปุ่มปิดบนมือถือ · เมนูบัญชีที่ชื่อผู้ใช้
  side.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (b.dataset.mode !== curMode()) switchMode(b.dataset.mode); else closeSide(); });
  if (sideMode === 'code') drawProjects();
  $('#sclose').onclick = closeSide;
  $('#acct').onclick = e => { e.stopPropagation(); acctMenu($('#acct'), side); };
  { const op = qs().get('open'), cn = qs().get('connectors'); if (op === 'bin') binSheet(); else if (op === 'saved') bookmarksSheet(); else if (op === 'arts') artsSheet(); else if (op === 'spaces') spacesSheet(); else if (op === 'files') filesSheet(); else if (op === 'video') videoSheet(); else if (op === 'sched' && me?.plan?.artifacts) schedSheet(); else if (op === 'connectors' || cn) { openConnectors('connectors', 'mine'); if (cn === 'ok') toast('เชื่อมต่อแล้ว · AI ใช้ได้ทุกแชต', 'ok'); else if (cn === 'err') toast('เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง', 'bad'); if (cn) history.replaceState(null, '', location.pathname + (chat.id ? '?id=' + chat.id : '')); } } // ลิงก์จากตั้งค่าของหน้าอื่น / กลับจากหน้าล็อกอิน connector
  $('#menu').onclick = openSide; // เงาใส่ในกล่องเดียวกับเมนู ไม่งั้นเงาจะทับเมนู
  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };
  if (!window.DEMO && !id && sideMode === 'chat') try { // แนะนำครั้งแรก 3 ข้อ (ครั้งเดียวต่อเครื่อง)
    if (!localStorage.getItem('onb')) { localStorage.setItem('onb', '1');
      sheet('เริ่มใช้ Kyber', `<div class="sheet-form"><p class="sheet-msg"><b>1. เลือกโมเดลหรือปล่อย Auto</b><br>Auto เลือกโมเดลที่คุ้มสุดให้ตามความยากของคำถาม เปลี่ยนเองได้ที่ปุ่มชื่อโมเดล</p>
        <p class="sheet-msg"><b>2. พิมพ์ / เพื่อใช้ Skill</b><br>เช่น /translator /summarizer /code-reviewer ให้ AI ทำงานตามบทบาทนั้น</p>
        <p class="sheet-msg"><b>3. โหมด Code</b><br>ให้ AI สร้างและแก้ไฟล์จริง รันดูผลได้ทันที เปิดจากเมนู Code</p>
        <p class="sheet-msg"><b>คุณใช้ Kyber เพื่ออะไร?</b><br><small class="muted">เลือกแล้วเราเปิด Skill ที่เหมาะให้ (ปิดได้ทีหลังที่ปุ่ม +)</small></p>
        <div class="sheet-acts" style="flex-wrap:wrap"><button type="button" class="btn out" data-goal="code">เขียนโค้ด</button><button type="button" class="btn out" data-goal="work">งานเอกสาร/อีเมล</button><button type="button" class="btn out" data-goal="study">เรียน/หาความรู้</button><button type="button" class="btn blue x">ข้ามไปก่อน</button></div></div>`, d => d.querySelectorAll('[data-goal]').forEach(b => b.onclick = async () => {
        const want = { code: ['code-reviewer', 'refactor-clean', 'sql-helper'], work: ['email-writer', 'summarizer', 'thai-pro-writer'], study: ['study-tutor', 'explain-simple', 'translator'] }[b.dataset.goal], all = await loadSkills();
        chat.skills = want.map(n => all.find(s => s.name === n)?.id).filter(Boolean); localStorage.setItem('skills', JSON.stringify(chat.skills)); modelUI();
        d.remove(); toast(chat.skills.length ? 'เปิด Skill ที่เหมาะให้แล้ว' : 'ตั้งค่าเรียบร้อย', 'ok');
      })); localStorage.setItem(WHATS_NEW, '1'); } // คนใหม่ไม่ต้องเห็น "มีอะไรใหม่"
    else if (!localStorage.getItem(WHATS_NEW)) { localStorage.setItem(WHATS_NEW, '1'); // ผู้ใช้เดิม: บอกฟีเจอร์ใหม่ครั้งเดียว
      sheet('มีอะไรใหม่ในโหมด Code', `<div class="sheet-form">
        <p class="sheet-msg"><b>${ic('code', 'sm')} Chat กับ Code รวมหน้าเดียว</b><br>กดสลับ Chat / Code ได้เลยโดยหน้าไม่โหลดใหม่ แชตที่กำลังตอบก็ยังทำงานต่อ</p>
        <p class="sheet-msg"><b>${ic('sparkles', 'sm')} หน้าโปรเจกต์แบบใหม่</b><br>คุยกับ AI เป็นหลัก มีแท็บ Preview / Code / Files · AI อ่าน แก้ไฟล์ รัน และตรวจผลให้เอง มีรายการงานขึ้นให้เห็นระหว่างทำ</p>
        <p class="sheet-msg"><b>${ic('hand', 'sm')} โหมด Auto / Ask / Plan</b><br>เลือกได้ว่าให้ AI ทำเองเลย, เสนอให้กด Apply เอง, หรือวางแผนให้ก่อนแล้วค่อยกดเริ่ม (ปุ่มใต้ช่องพิมพ์)</p>
        <p class="sheet-msg"><b>${ic('branch', 'sm')} ต่อ GitHub อัตโนมัติ</b><br>พอ AI ทำเสร็จ commit + push ให้เอง แยก branch ต่องานได้ พร้อมปุ่มสร้าง Pull Request</p>
        <p class="sheet-msg"><b>${ic('download', 'sm')} Import zip ครบขึ้น</b><br>เก็บฟอนต์และไฟล์อื่นได้ ไม่ตัดทิ้งเงียบๆ และบอกชัดถ้ามีไฟล์ไหนข้ามไป</p>
        <button type="button" class="btn blue" data-x>เข้าใจแล้ว</button></div>`, (d, close) => d.querySelector('[data-x]').onclick = close);
    }
  } catch { /* ไม่มีที่เก็บ */ }
  $('#effort').onchange = e => { localStorage.setItem('effort', e.target.value); modelUI(); };
  $('#mdl').onclick = () => modelSheet('#model');
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
  // แถบเมนูล่าง (มือถือ): แชต = รายการแชต · โค้ด = สลับไปโหมดโค้ด · การใช้งาน = ลิมิต/Wallet
    $('#flags').onclick = e => { const f = e.target.closest('[data-flag]')?.dataset.flag; if (f === 'img') exitImageMode(); if (f === 'imgsize') imgSizeSheet(); if (f === 'enh') enhancePrompt(false); if (f === 'enhauto') { localStorage.setItem('imgAuto', localStorage.getItem('imgAuto') === '0' ? '1' : '0'); modelUI(); } if (f === 'web') toggleWeb(); if (f === 'pc') { localStorage.setItem('pc', '0'); modelUI(); } if (f === 'pcset') pcSheet(); if (f === 'pcag') { localStorage.setItem('pcAgent', '0'); modelUI(); toast('ปิดโหมด Agent แล้ว · เปิดคืนได้ที่ปุ่ม "เปิดโหมด Agent" ใต้ช่องพิมพ์'); } if (f === 'pcagon') { localStorage.setItem('pcAgent', '1'); localStorage.setItem('pc', '1'); modelUI(); toast('เปิดโหมด Agent แล้ว', 'ok'); } if (f === 'sk') { chat.skills = chat.skills.filter(x => x !== +e.target.closest('[data-sid]').dataset.sid); localStorage.setItem('skills', JSON.stringify(chat.skills)); modelUI(); }
    if (f === 'mc') { chat.mcps = chat.mcps.filter(x => x !== +e.target.closest('[data-mid]').dataset.mid); localStorage.setItem('mcps', JSON.stringify(chat.mcps)); modelUI(); } };
  app.querySelector('[data-new]').onclick = e => { e.preventDefault(); openChat(null); };
  $('#spc').onclick = () => { $('#sclose')?.click(); spacesSheet(); }; if ($('#arts')) $('#arts').onclick = () => { $('#sclose')?.click(); artsSheet(); }; $('#newc').onclick = () => { $('#sclose').click(); openChat(null); };
  $('#sbtn').onclick = () => { const b = $('#sbox'); b.hidden = !b.hidden; if (!b.hidden) $('#search').focus(); else { $('#search').value = ''; chat.hits = null; drawSide(); } };
    let srchT = null;
  $('#search').oninput = () => {
    drawSide(); if (!$('#paneCode').hidden) drawProjects(true);
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
  $('#cv-x').onclick = () => { $('#canvas').hidden = true; chat.ufSeen = null; };
  $('#cv-sh').onclick = artShare;
  $('#cv-v').onchange = e => chat.art ? openArtifact(chat.art.id, +e.target.value) : chat.uf && openFile(chat.uf.id, +e.target.value);
  $('#cv-dl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([chat.cvCode || ''], { type: 'text/html' })); a.download = (chat.art ? chat.art.title : 'page').replace(/[\\/:*?"<>|]+/g, '_') + '.html'; a.click(); };
  $('#cv-cp').onclick = e => copy(chat.cvCode || '', e.target);
  $('#cv-tc').onclick = async e => { // เก็บหน้าที่ AI เขียนเป็นโปรเจกต์ใหม่ใน Code
    const code = chat.cvCode || '', svg = /^\s*<svg/i.test(code), b = e.target; b.disabled = true;
    try { const r = await api('/projects', { method: 'POST', body: { name: 'จาก Canvas ' + new Date().toLocaleDateString(LOC), files: { 'index.html': svg ? `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>` : code } } }); location.href = '/code?p=' + r.id; }
    catch (x) { toast(x.message, 'bad'); b.disabled = false; }
  };
  app.querySelectorAll('[data-cv]').forEach(b => b.onclick = () => {
    app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x === b));
    const isCode = b.dataset.cv === 'code';
    if (chat.uf) return; $('#cv-f').hidden = isCode; $('#cv-c').hidden = !isCode; $('#cv-stage').hidden = isCode; $('#cv-dev').hidden = isCode; if (!isCode) devWatch();
  });
  pcInit(); setTimeout(remoteWatch, 400);
  const t = $('#t');
  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; clearTimeout(chat.draftT); chat.draftT = setTimeout(() => draft.set(t.value), 400); };
  const dft = draft.get(); if (dft && !t.value) { t.value = dft; setTimeout(() => t.oninput(), 0); } // ร่างที่พิมพ์ค้างไว้ (รีเฟรช/สลับแชต/แอปรีโหลด) ไม่หาย
  const skTok = qs().get('skill'); // เปิดจากลิงก์แชร์ Skill: นำเข้าแล้วเปิดใช้ทันที
  if (skTok) api('/skills/import', { method: 'POST', body: { token: skTok } }).then(async s => { await loadSkills(true); if (!chat.skills.includes(s.id) && chat.skills.length < 3) chat.skills.push(s.id); localStorage.setItem('skills', JSON.stringify(chat.skills)); skillModel(s); modelUI(); toast(`เพิ่ม Skill "${s.name}" แล้ว`, 'ok'); }).catch(x => toast(x.message, 'bad'));
  const shared = [qs().get('title'), qs().get('text'), qs().get('url')].filter(Boolean).join('\n'); // ข้อความที่แชร์มาจากแอปอื่น (manifest share_target)
  if (shared && !qs().get('id')) { t.value = shared.slice(0, 20000); setTimeout(() => t.oninput(), 0); }
  const shf = (qs().get('shared') || '').match(/^([0-9a-f]{16})\.([1-4])$/); // ไฟล์ที่แชร์มาจากแอปอื่น: ดึงมาแนบในแชตใหม่
  if (shf && !qs().get('id')) Promise.all(Array.from({ length: +shf[2] }, async (_, i) => { const r = await fetch(`/api/shared/${shf[1]}/${i}`); if (!r.ok) return null; return new File([await r.blob()], decodeURIComponent(r.headers.get('x-name') || 'file'), { type: r.headers.get('x-type') || '' }); }))
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
  $('#msgs').onkeydown = e => { answer(e); }; // ห้าม return ค่า: on-handler ที่คืน false = ยกเลิกปุ่มที่กด → พิมพ์ในช่องใดๆ ในรายการข้อความไม่ได้ (เช่นช่องตอบคำถามของ Agent)
  $('#msgs').onscroll = () => { const b = $('#msgs'), sd = $('#sdown'); if (b && sd) sd.hidden = nearBottom(b); };
  $('#sdown').onclick = () => { const b = $('#msgs'); b?.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); };
  $('#msgs').onclick = e => {
    if (answer(e)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('cp-code')) copy(b.closest('.code').querySelector('code').textContent, b);
    if (b.dataset.zip) zipFiles(+b.dataset.zip, b).catch(x => toast('ทำ zip ไม่ได้: ' + x.message, 'bad'));
    if (b.classList.contains('art-up')) return void (location.href = '/plans?from=artifact');
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
    if (b.dataset.nospace != null) { chat.spaceId = chat.spaceName = null; renderAll(); }
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
async function artsSheet() {
  const draw = async (d, q = '') => {
    const list = (await api('/artifacts').catch(() => [])).filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()));
    d.querySelector('#arl').innerHTML = list.map(a => `<div class="mem tm row" style="align-items:center"><button type="button" class="linkish" data-arto="${a.id}" style="flex:1;text-align:left;color:inherit"><b>${esc(a.title)}</b><br><small class="muted">v${a.ver} · ${when(a.updated_at)}${a.share_token ? ' · shared' : ''}</small></button>${a.chat_id ? `<a class="btn out sm" href="/chat?id=${a.chat_id}">Chat</a>` : ''}<button type="button" class="icon-btn sm ghost" data-ardel="${a.id}" aria-label="Delete">${ic('trash', 'sm')}</button></div>`).join('') || '<p class="muted">No artifacts yet · ask the AI for a calculator, a game or a dashboard</p>';
  };
  sheet('Artifacts', '<div class="sheet-form"><input id="arq" type="search" placeholder="Search artifacts" aria-label="Search artifacts"><div id="arl"><p class="muted">Loading…</p></div></div>', (d, close) => {
    draw(d); d.querySelector('#arq').oninput = e => draw(d, e.target.value);
    d.querySelector('#arl').onclick = async e => {
      const o = e.target.closest('[data-arto]'); if (o) { close(); return openArtifact(+o.dataset.arto); }
      const x = e.target.closest('[data-ardel]'); if (x && confirm('Delete this artifact? Its share link stops working too.')) { try { await api('/artifacts/' + x.dataset.ardel, { method: 'DELETE' }); toast('ลบแล้ว', 'ok'); draw(d); } catch (y) { toast(y.message, 'bad'); } }
    };
  });
}
async function bookmarksSheet() {
  const draw = async (d, q = '') => { const list = await api('/bookmarks' + (q ? '?q=' + encodeURIComponent(q) : '')).catch(() => []);
    d.querySelector('#bml').innerHTML = list.map(b => `<a class="mem tm" style="display:block;color:inherit" href="/chat?id=${b.chat_id}#m${b.id}"><small class="muted">${esc(b.title)} · ${when(b.created_at)}</small><br>${esc(b.content.replace(/[#*`>]/g, '').slice(0, 220))}</a>`).join('') || '<p class="muted">ยังไม่มีบุ๊กมาร์ก กดไอคอนดาวใต้คำตอบเพื่อเก็บไว้</p>'; };
  sheet('บุ๊กมาร์ก', '<div class="sheet-form"><input id="bmq" type="search" placeholder="ค้นหาในบุ๊กมาร์ก" aria-label="ค้นหาในบุ๊กมาร์ก"><div id="bml"><p class="muted">กำลังโหลด...</p></div></div>', d => { draw(d); let t; d.querySelector('#bmq').oninput = e => { clearTimeout(t); t = setTimeout(() => draw(d, e.target.value.trim()), 300); }; });
}
function openCanvas(code) {
  const cv = $('#canvas'); if (!cv) return showPreview(code);
  chat.cvCode = code; chat.art = null; chat.uf = null; cv.classList.remove('is-art', 'is-file'); if ($('#cv-s')) $('#cv-s').hidden = true; $('#cv-t').textContent = 'Canvas'; $('#cv-v').hidden = true; $('#cv-sh').hidden = true;
  const html = /^\s*<svg/i.test(code) ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body>` : code;
  cv.hidden = false;
  app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x.dataset.cv === 'prev'));
  $('#cv-f').hidden = false; $('#cv-c').hidden = true; $('#cv-stage').hidden = false; $('#cv-dev').hidden = false; devWatch();
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
const HELLO = ['How can I help today?', 'What are we working on?', 'Ask me anything', 'Ready when you are', 'What’s on your mind?'];
function modelUI() {
  const m = curModel();
  $('#mdl').innerHTML = `${m ? vendorLogo(m.name, 'xs') : ''}<span>${esc(m?.name || 'เลือกโมเดล')}</span>${ic('down', 'sm')}`;
  const efs = modelEfforts(m);
  $('#eff').hidden = !efs.length;
  $('#effort').value = effortFor(m, $('#effort').value);
  $('#eff').innerHTML = `${ic('sparkles', 'sm')}${(EFFORT_INFO[$('#effort').value] || EFFORT_INFO[''])[0]}${ic('down', 'sm')}`;
  const img = isImgMode(); $('#t').placeholder = img ? 'Describe the image you want · attach a picture as a reference' : 'Ask anything · type / for Skills';
  $('#flags').innerHTML = (img ? `<button type="button" class="flag on" data-flag="img" aria-label="ออกจากโหมดสร้างภาพ">${ic('palette', 'sm')}สร้างภาพ${ic('x', 'sm')}</button><button type="button" class="flag" data-flag="imgsize" aria-label="ขนาดภาพ">${ic('image', 'sm')}${IMG_SIZES[imgSize()][1]}</button><button type="button" class="flag" data-flag="enh">${ic('sparkles', 'sm')}ปรับ prompt</button><button type="button" class="flag ${localStorage.getItem('imgAuto') !== '0' ? 'on' : ''}" data-flag="enhauto" aria-pressed="${localStorage.getItem('imgAuto') !== '0'}">ปรับอัตโนมัติ: ${localStorage.getItem('imgAuto') !== '0' ? 'เปิด' : 'ปิด'}</button>` : '')
    + (localStorage.getItem('web') === '1' && site.search ? `<button type="button" class="flag" data-flag="web" aria-label="ปิดค้นเว็บ">${ic('globe', 'sm')}ค้นเว็บ${ic('x', 'sm')}</button>` : '')
    + (PCD && !pcOn() && !img ? `<button type="button" class="flag on" data-flag="pcset">${ic('folder', 'sm')}ให้ AI ทำงานในคอม: เลือกโฟลเดอร์</button>` : '') // ในแอป: ปุ่มเห็นชัด ไม่งั้นลูกค้าไม่รู้ว่าต้องเปิดเอง แล้ว AI ได้แค่บอกให้รันเอง
    + (pcOn() ? `<button type="button" class="flag" data-flag="pc" aria-label="ปิดใช้คอมเครื่องนี้">${ic('folder', 'sm')}${esc(chat.pc.name)}${ic('x', 'sm')}</button>` : '')
    + (agentOn() ? `<button type="button" class="flag on" data-flag="pcag" aria-label="ปิดโหมด Agent">${ic('sparkles', 'sm')}Agent · ${esc(AG_MODES.find(x => x[0] === agMode())[2])}${ic('x', 'sm')}</button>` : pcOn() && PCD?.agent && !img ? `<button type="button" class="flag" data-flag="pcagon" aria-label="เปิดโหมด Agent">${ic('plus', 'sm')}เปิดโหมด Agent</button>` : '') // ปิดแล้วต้องเปิดคืนได้ในที่เดิม (ลูกค้ากด x แล้วหาทางเปิดไม่เจอ)
    + (chat.skills.length && _skillsCache ? chat.skills.map(id => { const sk = _skillsCache.find(x => x.id === id); return sk ? `<button type="button" class="flag" data-flag="sk" data-sid="${id}">${ic('sparkles', 'sm')}${esc(sk.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '')
    + (chat.mcps.length && _mcpCache ? chat.mcps.map(id => { const mc = _mcpCache.find(x => x.id === id); return mc ? `<button type="button" class="flag" data-flag="mc" data-mid="${id}">${ic('server', 'sm')}${esc(mc.name)}${ic('x', 'sm')}</button>` : ''; }).join('') : '');
  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); showErr('โมเดลนี้อ่านรูปไม่ได้ จึงเอารูปออกแล้ว'); }
}
// ปุ่ม +: แผ่นล่างแบบ "ทางลัดแถวบน + รายการไอคอนพร้อมคำอธิบาย" · ชื่อเป็นอังกฤษ คำอธิบายเป็นไทย
const toolRow = (v, icon, title, desc, on) => `<button type="button" class="trow ${on ? 'on' : ''}" data-v="${v}"><span class="tico">${ic(icon)}</span><span class="tbody"><b>${title}</b><small>${desc}</small></span>${on ? `<i class="tchk">${ic('check')}</i>` : ''}</button>`;
const TOOL_ORDER = ['pc', 'mcp', 'img', 'web', 'rsch', 'meet', 'prm', 'skl', 'exp']; // MCP อยู่บน: ลูกค้าหาไม่เจอตอนอยู่ใต้ "เพิ่มเติม"
const toolUse = () => { try { return JSON.parse(localStorage.getItem('toolUse') || '{}'); } catch { return {}; } };
const toolUsed = v => { try { const u = toolUse(); u[v] = (u[v] || 0) + 1; localStorage.setItem('toolUse', JSON.stringify(u)); } catch { /* ไม่มีที่เก็บ */ } };
function toolRows(web) {
  const defs = {
    pc: PCD && ['folder', 'ใช้คอมเครื่องนี้', chat.pc ? `${pcOn() ? 'เปิดอยู่' : 'ปิดอยู่'} · โฟลเดอร์ ${esc(chat.pc.name)}` : 'AI อ่าน/เขียนไฟล์ รันคำสั่ง และใช้ MCP (เช่น Blender) ในเครื่องนี้', pcOn()],
    img: (me.models.some(m => m.provider === 'image') || site.image) && ['palette', 'สร้างภาพ', me.models.some(m => m.provider === 'image') ? 'สลับเป็นโมเดลสร้างภาพ พิมพ์สิ่งที่อยากได้ AI ช่วยปรับ prompt ให้' : 'พิมพ์สิ่งที่อยากได้ แล้วให้ AI วาดให้', isImgMode()],
    web: site.search && ['globe', 'Web search', 'หาข้อมูลล่าสุดพร้อมแหล่งอ้างอิง', web],
    rsch: site.search && ['search', 'Deep research' + newPill('rsch'), 'ทีม AI ค้นเว็บหลายหัวข้อพร้อมกัน แล้วเขียนรายงานพร้อมอ้างอิง (ปิดแอปได้)'],
    meet: ['mic', 'AI ประชุม', 'อัดเสียงหรืออัปไฟล์ประชุม ได้บทถอดความแยกคนพูด สรุป และงานที่ต้องทำ'],
    prm: ['book', 'Prompt library', 'คำสั่งสำเร็จรูป เลือกแล้วใช้ได้เลย'],
    skl: ['sparkles', 'Skills', 'สอนวิธีทำงานให้ AI · เปิดปิดหรือสร้างเอง'],
    mcp: ['layers', 'Connectors', PCD ? 'Google, Notion, GitHub ฯลฯ + ปลั๊กอินและ MCP ในเครื่อง · เปิด/ปิดในแชตนี้' : 'Google, Notion, GitHub ฯลฯ ที่เชื่อมไว้ · เปิด/ปิดในแชตนี้', mcpOff().length > 0],
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
      ({ photos: () => pick('image/*'), camera: () => pick('image/*', 'environment'), file: () => pick(''), pc: pcSheet, rsch: () => { seen('rsch'); researchSheet(); }, meet: () => go('/meetings?rec=1'), img: enterImageMode, web: toggleWeb, mcp: () => connInChat(), skl: () => skillsSheet(chat.skills, ids => { chat.skills = ids; localStorage.setItem('skills', JSON.stringify(ids)); modelUI(); }), prm: () => promptLibSheet(p => { const t = $('#t'); t.value = p + t.value; t.oninput(); t.focus(); }), exp: exportMenu })[b.dataset.v]();
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
  ctl.textContent = chat.chats.find(c => c.id === chat.id)?.title || (isTask() ? 'งานใหม่' : 'Chat');
  let tb = $('#taskfold'); if (isTask() && chat.id) { if (!tb) { tb = Object.assign(document.createElement('button'), { type: 'button', id: 'taskfold', className: 'btn out sm task-fold', innerHTML: ic('folder', 'sm') + ' โฟลเดอร์งาน' }); tb.onclick = () => taskFolder(chat.id); ctl.after(tb); } } else tb?.remove();
  // แถบ context: ใช้ไปเท่าไรจากขนาด context ของโมเดล (จากคำตอบล่าสุด) · เกิน 70% มีปุ่มย่อแชต
  const cx = chat.ctx?.id === chat.id ? chat.ctx : null, pct = cx ? Math.min(100, cx.used / cx.max * 100) : 0, pctT = pct < 10 ? pct.toFixed(1).replace(/\.0$/, '') : Math.round(pct); // context ใหญ่ (1M): ปัดเป็นจำนวนเต็มจะค้างที่ 0% นาน
  $('#ctok').innerHTML = cx ? `<button type="button" class="ctxm ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}" id="ctxopen" title="แตะเพื่อดูว่าอะไรกิน context อยู่เท่าไร">context ${kTok(cx.used)} / ${kTok(cx.max)} (${pctT}%)</button>${pct >= 70 && chat.id ? ' <button type="button" class="linkb" id="cmpct">ย่อแชต</button>' : ''}` : '';
  const co = $('#ctxopen'); if (co) co.onclick = () => ctxSheet({ chatId: chat.id, modelId: +curModel()?.id || null, skills: chat.skills, onCompact: () => { chat.ctx = null; head(); }, onPickModel: id => { $('#model').value = id; localStorage.setItem('model', id); modelUI(); } });
  const cb = $('#cmpct'); if (cb) cb.onclick = async () => { cb.disabled = true; cb.textContent = 'กำลังย่อ...'; try { const r = await api(`/chats/${chat.id}/compact`, { method: 'POST' }); toast(r.ok ? 'ย่อแชตแล้ว ข้อความเก่าถูกสรุปไว้' : 'แชตยังสั้นเกินกว่าจะย่อ', r.ok ? 'ok' : ''); if (r.ok) chat.ctx = null; } catch (x) { toast(x.message, 'bad'); } head(); };
}
const kTok = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
// แถบข้างโหมด Code: รายการโปรเจกต์ (เปิดในหน้า Code) · โหลดครั้งแรกที่เปิดแท็บ แล้วกรองด้วยช่องค้นหาเดียวกับแชต
async function drawProjects(cached) {
  const box = $('#plist'); if (!box) return;
  if (!cached || !chat.projects) chat.projects = await api('/projects').catch(() => null);
  if (!$('#plist')) return;
  const q = ($('#search')?.value || '').toLowerCase(), ps = (chat.projects || []).filter(p => p.name.toLowerCase().includes(q));
  const cur = curMode() === 'code' ? +qs().get('p') : 0, ss = cur ? (chat.sessions ||= {})[cur] : null;
  if (cur && !ss) api('/chats?project=' + cur).then(l => { chat.sessions[cur] = l; drawProjects(true); }).catch(() => {});
  const act = +qs().get('s') || (typeof IDE !== 'undefined' && IDE.pid === cur ? IDE.chatId : 0) || (qs().get('s') ? 0 : ss?.[0]?.id);
  const sessHTML = pid => `<div class="sess"><a class="sess-new" href="/code?p=${pid}&s=new">${ic('plus', 'sm')}<span>New session</span></a>${(ss || []).slice(0, 15).map(c => `<a class="sess-i${c.id === act ? ' on' : ''}" href="/code?p=${pid}&s=${c.id}"><span>${esc(String(c.title || 'Untitled').replace(/^\p{Extended_Pictographic}️?\s*/u, ''))}</span></a>`).join('')}</div>`; // session ของโปรเจกต์ที่เปิดอยู่
  box.innerHTML = !chat.projects ? '<p class="muted" style="padding:8px 12px">Could not load projects</p>'
    : ps.length ? ps.map(p => `<div class="item${p.id === cur ? ' on' : ''}"><a href="/code?p=${p.id}">${ic(p.shared ? 'users' : 'code', 'sm ci')}<span class="pi"><b>${esc(p.name)}</b><small>${when(p.updated_at)} · ${p.files} files${p.shared ? ' · shared with me' : ''}</small></span></a></div>${p.id === cur ? sessHTML(p.id) : ''}`).join('')
    : `<p class="muted" style="padding:8px 12px">${q ? 'No projects found' : 'No projects yet · tap New project'}</p>`;
}
// รายการ session ของโปรเจกต์เปลี่ยน (session ใหม่ / ได้ชื่อแล้ว): โหลดใหม่แล้ววาดแถบข้าง
function refreshSessions(pid) { if (chat.sessions) delete chat.sessions[pid]; drawProjects(true); }
// บุ๊กมาร์กแชต (ใช้ค่า pinned เดิม): กดเลือกแชตที่จะบุ๊กมาร์ก · แชตที่บุ๊กมาร์กขึ้นดาวและอยู่บนสุดของแถบข้าง กดดาวเพื่อยกเลิก
async function setBookmark(id, on) {
  const c = chat.chats.find(x => x.id === id); if (!c) return;
  c.pinned = on ? 1 : 0; drawSide();
  await api('/chats/' + id, { method: 'PUT', body: { pinned: c.pinned } }).catch(e => { c.pinned = on ? 0 : 1; drawSide(); toast(e.message, 'bad'); });
}
// Spaces (ระบบโฟลเดอร์เดิม): กลุ่มแชตที่มีคำสั่งและไฟล์อ้างอิงร่วมกัน · แชตใน Space แสดงเฉพาะที่นี่ ไม่ปนในรายการ Chats
// ---------- งานตามเวลา: AI ทำงานซ้ำทุกวัน/วันทำงาน/สัปดาห์ละครั้ง ผลเก็บเป็นแชต ----------
const SCH_DAYS = { daily: 'Every day', weekdays: 'Weekdays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' };
const SCH_IDEAS = [['สรุปข่าวเช้า', 'สรุปข่าวสำคัญของไทยและโลกวันนี้ 5 ข้อ สั้น ๆ พร้อมแหล่งที่มา', 8], ['โพสต์ขายของ', 'เขียนแคปชันขายของสำหรับโพสต์วันนี้ 1 โพสต์ พร้อม hashtag', 10], ['ศัพท์อังกฤษวันละ 5 คำ', 'สอนศัพท์ภาษาอังกฤษระดับกลาง 5 คำ พร้อมคำแปล ตัวอย่างประโยค และคำที่ใช้แทนกันได้', 7]];
async function schedSheet() {
  let r; try { r = await api('/schedules'); } catch (x) { return toast(x.message, 'bad'); }
  const hh = h => String(h).padStart(2, '0') + ':00', mname = id => me.models.find(m => m.id === id)?.name || 'model';
  const row = s => `<div class="sch-card ${s.active ? '' : 'off'}"><div class="sch-t"><b>${esc(s.title)}</b><small>${SCH_DAYS[s.days]} · ${hh(s.hour)} · ${esc(mname(s.model_id))}${s.email ? ' · email' : ''}</small>${s.last_run ? `<small class="${s.last_status === 'ok' ? 'muted' : 'bad'}">Last run ${when(s.last_run)}${s.last_status === 'ok' ? '' : ' · ' + esc(s.last_status || '')}</small>` : ''}</div>
    <label class="sw" title="On/off"><input type="checkbox" data-tog="${s.id}" ${s.active ? 'checked' : ''}><span></span></label>
    <div class="sch-acts">${s.chat_id ? `<a class="btn out sm" href="/chat?id=${s.chat_id}">Results</a>` : ''}<button type="button" class="btn out sm" data-run="${s.id}">Run now</button><button type="button" class="btn out sm" data-edit="${s.id}">Edit</button><button type="button" class="icon-btn sm ghost" data-del="${s.id}" aria-label="Delete">${ic('trash', 'sm')}</button></div></div>`;
  sheet('Scheduled tasks', `<div class="sheet-form ws">
    <p class="sheet-msg">The AI runs your prompt on a schedule (Thai time) and saves each result as a chat. You get a notification, and an email if you turn it on. Up to ${r.max} tasks · uses your plan limits like normal chats.</p>
    ${r.items.map(row).join('') || '<p class="muted">No scheduled tasks yet</p>'}
    ${r.items.length < r.max ? `<button type="button" class="ws-new" data-new>${ic('plus')}<span><b>New scheduled task</b><small>Daily news digest, a sales post every morning, 5 English words a day…</small></span></button>` : `<p class="muted">You have ${r.max} of ${r.max} tasks</p>`}</div>`, (d, close) => {
    const nw = d.querySelector('[data-new]'); if (nw) nw.onclick = () => { close(); schedForm(); };
    d.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { close(); schedForm(r.items.find(s => s.id === +b.dataset.edit)); });
    d.querySelectorAll('[data-tog]').forEach(c => c.onchange = async () => { try { await api('/schedules/' + c.dataset.tog, { method: 'PUT', body: { active: c.checked } }); c.closest('.sch-card').classList.toggle('off', !c.checked); } catch (x) { c.checked = !c.checked; toast(x.message, 'bad'); } });
    d.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Delete this scheduled task? Its past results stay in your chats.')) return; try { await api('/schedules/' + b.dataset.del, { method: 'DELETE' }); close(); schedSheet(); } catch (x) { toast(x.message, 'bad'); } });
    d.querySelectorAll('[data-run]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Running…'; try { const x = await api('/schedules/' + b.dataset.run + '/run', { method: 'POST' }); if (x.status === 'ok') { toast('Done · result saved as a chat', 'ok'); close(); loadSide(); if (x.chat_id) openChat(x.chat_id); } else { toast(x.status, 'bad'); b.disabled = false; b.textContent = 'Run now'; } } catch (y) { toast(y.message, 'bad'); b.disabled = false; b.textContent = 'Run now'; } });
  });
}
function schedForm(s = null, idea = null) {
  const v = s || { title: idea?.[0] || '', prompt: idea?.[1] || '', hour: idea?.[2] ?? 8, days: 'daily', model_id: curModel()?.id || me.models[0]?.id, email: 0, search: 1 };
  const models = me.models.filter(m => !m.locked && m.provider !== 'image');
  sheet(s ? 'Edit scheduled task' : 'New scheduled task', `<form class="sheet-form ws" id="schf">
    ${s ? '' : `<div class="chips">${SCH_IDEAS.map((x, i) => `<button type="button" class="btn out sm" data-idea="${i}">${esc(x[0])}</button>`).join('')}</div>`}
    <label>Name</label><input name="title" maxlength="60" required value="${esc(v.title)}" placeholder="Morning news digest">
    <label>What should the AI do?</label><textarea name="prompt" rows="4" maxlength="4000" required placeholder="Summarize today's top 5 news stories with sources">${esc(v.prompt)}</textarea>
    <div class="row" style="flex-wrap:nowrap"><div style="flex:1"><label>Repeat</label><select name="days">${Object.entries(SCH_DAYS).map(([k, l]) => `<option value="${k}" ${v.days === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div style="flex:1"><label>Time (Thai)</label><select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${+v.hour === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></div></div>
    <label>Model</label><select name="model_id">${models.map(m => `<option value="${m.id}" ${m.id === v.model_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="search" ${v.search ? 'checked' : ''}><span></span></span> Search the web for fresh info</label>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="email" ${v.email ? 'checked' : ''}><span></span></span> Also email me the result</label>
    <div class="err" id="sche"></div><button class="btn blue">${s ? 'Save' : 'Create task'}</button></form>`, (d, close) => {
    d.querySelectorAll('[data-idea]').forEach(b => b.onclick = () => { close(); schedForm(null, SCH_IDEAS[+b.dataset.idea]); });
    d.querySelector('#schf').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), body = { title: f.get('title'), prompt: f.get('prompt'), days: f.get('days'), hour: +f.get('hour'), model_id: +f.get('model_id'), search: f.get('search') === 'on', email: f.get('email') === 'on' };
      try { await api('/schedules' + (s ? '/' + s.id : ''), { method: s ? 'PUT' : 'POST', body }); toast(s ? 'Saved' : 'Scheduled · the first run is at ' + String(body.hour).padStart(2, '0') + ':00', 'ok'); close(); schedSheet(); } catch (x) { d.querySelector('#sche').textContent = x.message; }
    };
  });
}
// เทมเพลต Workspace: กดครั้งเดียวได้คำสั่งตั้งต้นที่เขียนไว้ดีแล้ว (ลูกค้าไม่ต้องเขียน prompt เอง)
const WS_TPL = [
  { e: 'tag', n: 'แอดมินเพจขายของ', d: 'Replies, captions, promos', i: 'คุณคือแอดมินเพจขายของออนไลน์ภาษาไทย ตอบลูกค้าสุภาพ เป็นกันเอง กระชับ ใช้คำลงท้าย ค่ะ/ครับ ตามที่ผู้ใช้กำหนด\n- เขียนแคปชันขายของที่ดึงดูด มีจุดเด่นสินค้า ราคา วิธีสั่ง และ hashtag 3-5 อัน\n- ตอบข้อความลูกค้า (ถามราคา ค่าส่ง ของหมด ขอคืน) แบบพร้อมคัดลอกไปวาง\n- คิดโปรโมชันและข้อความ broadcast\n- ถ้าข้อมูลสินค้าไม่พอ ให้ถามก่อน 1-2 ข้อ ห้ามแต่งราคาเอง' },
  { e: 'book', n: 'ครู / ติวเตอร์', d: 'Lessons, quizzes, explain', i: 'คุณคือผู้ช่วยครูภาษาไทย อธิบายให้เข้าใจง่ายตามระดับชั้นที่ผู้ใช้บอก\n- ทำแผนการสอน ใบงาน และข้อสอบปรนัย/อัตนัย พร้อมเฉลยและเกณฑ์ให้คะแนน\n- อธิบายทีละขั้น ยกตัวอย่างใกล้ตัว\n- ถ้าไม่ได้บอกระดับชั้นหรือวิชา ให้ถามก่อน' },
  { e: 'pen', n: 'นักศึกษาทำรายงาน', d: 'Outline, summarize, cite', i: 'คุณคือผู้ช่วยทำรายงานและการบ้านระดับมหาวิทยาลัย\n- ช่วยวางโครงร่าง สรุปเนื้อหา เรียบเรียงภาษาวิชาการ และอ้างอิงแบบ APA\n- อธิบายแนวคิดให้เข้าใจ ไม่ใช่แค่ให้คำตอบ\n- ห้ามแต่งแหล่งอ้างอิงที่ไม่มีจริง ถ้าไม่แน่ใจให้บอกว่าควรไปค้นที่ไหน' },
  { e: 'trend', n: 'นักการตลาด', d: 'Ads, content plans, ideas', i: 'คุณคือนักการตลาดออนไลน์ที่เข้าใจตลาดไทย\n- เขียนโฆษณา Facebook/TikTok/LINE หลายเวอร์ชันให้เลือก พร้อมเหตุผลสั้น ๆ\n- วางแผนคอนเทนต์รายสัปดาห์เป็นตาราง (วัน แพลตฟอร์ม หัวข้อ รูปแบบ)\n- คิดชื่อแคมเปญ สโลแกน และไอเดียโปรโมชัน\n- ถามกลุ่มเป้าหมายและงบก่อนถ้ายังไม่รู้' },
  { e: 'code', n: 'นักพัฒนา', d: 'Code, debug, review', i: 'You are a senior software engineer. Answer in the user\'s language.\n- Give complete, runnable code and say where it goes.\n- When debugging, find the root cause first, then the fix.\n- Point out security and performance problems you notice.\n- Prefer simple solutions; ask when requirements are unclear.' },
  { e: 'dash', n: 'งานออฟฟิศ', d: 'Email, Excel, reports', i: 'คุณคือผู้ช่วยงานออฟฟิศ\n- เขียนอีเมลและหนังสือราชการ/ธุรกิจภาษาไทยและอังกฤษให้สุภาพถูกรูปแบบ\n- ช่วยสูตร Excel/Google Sheets อธิบายทีละขั้น\n- สรุปเอกสารยาวเป็นข้อ ๆ และทำรายงานการประชุม\n- ทำตาราง/ไฟล์ให้ดาวน์โหลดเมื่อเหมาะสม' },
  { e: 'filetext', n: 'สรุปประชุม', d: 'Minutes, action items', i: 'คุณคือเลขาการประชุมมืออาชีพ\n- สรุปจากบันทึก/ถอดเสียง/แชตที่ผู้ใช้ส่งมา เป็น: หัวข้อ · ข้อสรุป · สิ่งที่ต้องทำ (ใคร / อะไร / ภายในเมื่อไร) เป็นตาราง · เรื่องที่ยังค้าง\n- ภาษากระชับ เป็นทางการ ห้ามแต่งข้อมูลที่ไม่มีในต้นฉบับ\n- ทำไฟล์ Word ให้ดาวน์โหลดเมื่อผู้ใช้ขอ' },
  { e: 'mail', n: 'อีเมลลูกค้า', d: 'Replies, follow-ups', i: 'คุณคือผู้ช่วยเขียนอีเมลธุรกิจไทย-อังกฤษ\n- เขียนอีเมลตอบลูกค้า ติดตามงาน ขอโทษ เสนอราคา ทวงถาม ให้สุภาพ ชัดเจน มีหัวเรื่อง\n- ให้ 2 เวอร์ชัน: ทางการ และเป็นกันเอง\n- ถ้าขาดข้อมูลสำคัญ (ชื่อ ราคา วันที่) ให้เว้นเป็น [วงเล็บ] แทนการแต่งเอง' },
  { e: 'pie', n: 'รายงานจาก Excel', d: 'Analyze sheets, charts', i: 'คุณคือนักวิเคราะห์ข้อมูลในบริษัท\n- อ่านไฟล์ Excel/CSV ที่แนบ สรุปตัวเลขสำคัญ แนวโน้ม และสิ่งผิดปกติ\n- คำนวณด้วย Python เมื่อต้องการความแม่นยำ ทำกราฟเมื่อช่วยให้เข้าใจง่าย\n- ทำรายงานสั้นสำหรับหัวหน้า: 3 ประเด็นหลัก + ตัวเลขยืนยัน + ข้อเสนอแนะ' },
  { e: 'layers', n: 'ร่างสัญญา / TOR', d: 'Contracts, TOR, policies', i: 'คุณคือผู้ช่วยร่างเอกสารธุรกิจภาษาไทย (ไม่ใช่ทนายความ)\n- ร่างสัญญาจ้าง ข้อตกลงรักษาความลับ TOR นโยบายบริษัท จากข้อมูลที่ผู้ใช้ให้ จัดเป็นข้อ ๆ ครบถ้วน\n- ชี้จุดเสี่ยงและข้อที่ควรให้นักกฎหมายตรวจก่อนใช้จริงเสมอ\n- ทำไฟล์ Word ให้ดาวน์โหลดเมื่อผู้ใช้ขอ' },
  { e: 'globe', n: 'แปลเอกสาร', d: 'Thai ⇄ English, formal', i: 'คุณคือนักแปลไทย-อังกฤษสำหรับงานธุรกิจ\n- แปลให้เป็นธรรมชาติ รักษาความหมาย ตัวเลข ชื่อเฉพาะ และรูปแบบตาราง/หัวข้อเดิม\n- ใช้ระดับภาษาทางการเว้นแต่ผู้ใช้ขอ\n- คำศัพท์เฉพาะทางที่ไม่แน่ใจ ให้วงเล็บคำเดิมไว้' },
  { e: 'users', n: 'HR / สรรหาคน', d: 'JD, interview, policy', i: 'คุณคือผู้ช่วยฝ่ายบุคคล\n- เขียนประกาศรับสมัครงาน (JD) คำถามสัมภาษณ์พร้อมเกณฑ์ให้คะแนน แบบประเมินผลงาน และประกาศภายใน\n- ภาษาสุภาพ ไม่เลือกปฏิบัติ ถูกต้องตามแนวปฏิบัติทั่วไป\n- ถามตำแหน่ง ระดับ และวัฒนธรรมองค์กรก่อนถ้ายังไม่รู้' },
];
function spacesSheet() {
  const count = id => chat.chats.filter(c => c.folder_id === id).length;
  const card = f => `<button type="button" class="ws-card" data-sp="${f.id}"><span class="ws-ic">${esc((f.name.trim()[0] || 'W').toUpperCase())}</span><span class="ws-t"><b>${esc(f.name)}${f.shared ? ' <span class="ws-team">ทีม</span>' : ''}</b><small>${f.mine === 0 ? 'แชร์โดย ' + esc((f.owner || '').split('@')[0]) + ' · ' : ''}${count(f.id)} chat${count(f.id) === 1 ? '' : 's'}${f.has_ins ? ' · instructions' : ''}${f.has_files ? ' · files' : ''}</small></span>${ic('right', 'sm')}</button>`;
  // เครื่องมือทั้งหมดรวมไว้ที่นี่ (เดิมอยู่ในแถบข้าง ทำให้รายการแชตบนมือถือเหลือที่นิดเดียว เลื่อนไม่ได้)
  const P = !!me?.plan?.artifacts, tools = [['files', 'sheet', 'ไฟล์ของฉัน', 'ไฟล์ที่อัปโหลดและที่ AI สร้าง'], P && ['/sites', 'globe', 'เว็บของฉัน', 'เผยแพร่เว็บ/แอปที่ AI สร้าง'], ['/meetings', 'mic', 'AI ประชุม', 'ถอดเสียง สรุป งานที่ต้องทำ'], ['/extract', 'sheet', 'ดึงข้อมูลเอกสาร', 'ใบเสร็จ สลิป ใบกำกับ → Excel'], ['/translate', 'globe', 'แปลทั้งไฟล์', 'Word / PowerPoint / Excel คงรูปแบบ'], P && ['/bots', 'msg', 'บอทตอบแชตร้าน', 'ใส่ในเว็บร้าน ตอบลูกค้าแทน'], ['video', 'play', 'สร้างวิดีโอ', 'คลิป 5 วินาที 1080p'], P && ['sched', 'clock', 'Scheduled tasks', 'ให้ AI ทำงานตามเวลา']].filter(Boolean);
  sheet('Workspace', `<div class="sheet-form ws">
    <h4 class="sp-h" style="margin-top:0">เครื่องมือ</h4>
    <div class="ws-tpls">${tools.map(([k, i, n, dsc]) => k.startsWith('/') ? `<a class="ws-tpl" href="${k}"><span class="ws-tpl-ic">${ic(i)}</span><b>${n}</b><small>${dsc}</small></a>` : `<button type="button" class="ws-tpl" data-tool="${k}"><span class="ws-tpl-ic">${ic(i)}</span><b>${n}</b><small>${dsc}</small></button>`).join('')}</div>
    <h4 class="sp-h">โฟลเดอร์งาน</h4>
    <p class="sheet-msg">Group related chats by client, project or subject. Every chat in a workspace shares the same instructions and reference files.</p>
    <button type="button" class="ws-new" data-new>${ic('plus')}<span><b>New workspace</b><small>Name it now, add instructions and files later</small></span></button>
    <h4 class="sp-h">Start from a template</h4>
    <div class="ws-tpls">${WS_TPL.map((x, i) => `<button type="button" class="ws-tpl" data-tpl="${i}"><span class="ws-tpl-ic">${ic(x.e)}</span><b>${x.n}</b><small>${x.d}</small></button>`).join('')}</div>
    ${chat.folders.length ? '<h4 class="sp-h">Your workspaces</h4>' : ''}
    ${chat.folders.length > 5 ? '<input type="search" id="wsq" placeholder="Search workspaces" aria-label="Search workspaces">' : ''}
    <div class="ws-grid" id="wsl">${chat.folders.map(card).join('') || '<p class="muted">No workspaces yet</p>'}</div></div>`, (d, close) => {
    d.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { close(); ({ files: filesSheet, video: videoSheet, sched: schedSheet })[b.dataset.tool](); });
    d.querySelector('[data-new]').onclick = async () => {
      close(); const name = await promptSheet('Workspace name', '', { title: 'New workspace', ok: 'Create' }); if (!name?.trim()) return;
      const f = await api('/folders', { method: 'POST', body: { name } }).catch(x => { toast(x.message, 'bad'); return null; }); if (!f) return;
      await loadSide(); spaceSheet(f.id);
    };
    d.querySelectorAll('[data-tpl]').forEach(b => b.onclick = async () => {
      const x = WS_TPL[+b.dataset.tpl]; b.disabled = true;
      const f = await api('/folders', { method: 'POST', body: { name: x.n, instructions: x.i } }).catch(y => { toast(y.message, 'bad'); return null; }); if (!f) { b.disabled = false; return; }
      close(); await loadSide(); toast(`สร้าง ${x.n} แล้ว · แก้คำสั่งได้ที่ Instructions & files`, 'ok'); openChat(null, f.id); $('#sclose')?.click();
    });
    const q = d.querySelector('#wsq'); if (q) q.oninput = () => { d.querySelector('#wsl').innerHTML = chat.folders.filter(f => f.name.toLowerCase().includes(q.value.toLowerCase())).map(card).join(''); };
    d.querySelector('#wsl').onclick = e => { const b = e.target.closest('[data-sp]'); if (b) { close(); spaceSheet(+b.dataset.sp); } };
  });
}
function spaceSheet(id) {
  const f = chat.folders.find(x => x.id === id); if (!f) return;
  const cs = chat.chats.filter(c => c.folder_id === id);
  const mine = f.mine !== 0;
  sheet(f.name, `<div class="sheet-form">
    ${mine ? '' : `<p class="sheet-msg">${ic('users', 'sm')} Workspace ของทีม แชร์โดย ${esc(f.owner || '')} · ใช้คำสั่งและเอกสารอ้างอิงของทีมได้ แก้ไขได้เฉพาะเจ้าของ</p>`}
    <div class="sheet-acts" style="flex-wrap:wrap"><button type="button" class="btn blue" data-chat-new>${ic('plus', 'sm')} New chat here</button>${mine ? `<button type="button" class="btn out" data-cust>${ic('settings', 'sm')} Instructions &amp; files</button><button type="button" class="btn out" data-share hidden>${ic('users', 'sm')} <span>${f.shared ? 'เลิกแชร์กับทีม' : 'แชร์ให้ทีม'}</span></button>` : ''}</div>
    <h4 class="sp-h">Chats (${cs.length})</h4>
    <div class="spaces">${cs.map(c => `<button type="button" class="opt" data-open="${c.id}"><span class="opt-t">${ic(c.pinned ? 'star' : 'msg', c.pinned ? 'bm-on' : '')}${esc(c.title.replace(/^\p{Extended_Pictographic}️?\s*/u, ''))}</span></button>`).join('') || '<p class="muted">No chats in this space yet</p>'}</div>
    ${mine ? `<button type="button" class="btn out sm sp-del" data-del>${ic('trash', 'sm')} Delete workspace</button>` : ''}</div>`, (d, close) => {
    d.querySelector('[data-chat-new]').onclick = () => { close(); $('#sclose')?.click(); openChat(null, id); };
    const cu = d.querySelector('[data-cust]'); if (cu) cu.onclick = () => { close(); folderSheet(id); };
    const sh = d.querySelector('[data-share]'); if (sh) { api('/team').then(r => { if (r.team) sh.hidden = false; }).catch(() => {}); sh.onclick = async () => { try { const r = await api('/folders/' + id + '/share', { method: 'POST', body: { on: !f.shared } }); f.shared = r.shared ? 1 : 0; sh.querySelector('span').textContent = f.shared ? 'เลิกแชร์กับทีม' : 'แชร์ให้ทีม'; toast(f.shared ? 'แชร์ให้ทีมแล้ว · สมาชิกใช้คำสั่งและเอกสารนี้ได้' : 'เลิกแชร์แล้ว', 'ok'); loadSide(); } catch (x) { toast(x.message, 'bad'); } }; }
    d.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { close(); $('#sclose')?.click(); openChat(+b.dataset.open); });
    const dl = d.querySelector('[data-del]'); if (dl) dl.onclick = async () => {
      close(); if (!await confirmSheet(`Delete the workspace "${f.name}"? Its chats move back to Chats; nothing is deleted.`, { title: 'Delete workspace', ok: 'Delete', danger: true })) return;
      await api('/folders/' + id, { method: 'DELETE' }); loadSide();
    };
  });
}
function drawSide() {
  const wn = $('#spcN'); if (wn) wn.textContent = chat.folders?.length ? chat.folders.length + (chat.folders.length > 1 ? ' workspaces' : ' workspace') + ' · เครื่องมือ' : 'เครื่องมือ + โฟลเดอร์งาน';
  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;
  const item = c => `<div class="item ${c.id === chat.id ? 'on' : ''}" data-id="${c.id}">${c.pinned ? `<button class="bm-star" data-unbm="${c.id}" aria-label="Remove bookmark" title="Remove bookmark">${ic('star', 'sm bm-on')}</button>` : ''}<a href="/chat?id=${c.id}" data-chat="${c.id}">${c.pinned ? '' : ic( { '🤖': 'server', '⏰': 'bell', '📥': 'inbox', '🎨': 'palette' }[[...c.title][0]] || (c.has_code ? 'code' : 'msg'), 'sm ci')}<span>${esc(c.title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''))}</span></a>
    <button data-cmenu="${c.id}" aria-label="Chat options">${ic('more')}</button></div>`;
  const shown = chat.chats.filter(c => c.title.toLowerCase().includes(q)), open = JSON.parse(localStorage.getItem('fopen') || '{}');
  const inSpace = c => !q && chat.folders.some(f => f.id === c.folder_id); // แชตใน Space แสดงเฉพาะในหน้า Spaces (ค้นหายังเจอ)
  const pinned = shown.filter(c => c.pinned && !inSpace(c));
  const recent = shown.filter(c => !c.pinned && !inSpace(c));
  list.innerHTML = (pinned.length ? `<div class="side-sub">Bookmarked</div>${pinned.map(item).join('')}` : '')
    + (recent.length && pinned.length ? '<div class="side-sub">Recents</div>' : '') + (recent.map(item).join('') || (chat.chats.length ? '' : '<p class="muted" style="padding:8px 12px">No chats yet</p>'))
    + (q && chat.hits?.length ? `<div class="side-sub">ในข้อความ</div>${chat.hits.map(h => `<div class="item hit"><a href="/chat?id=${h.chat_id}" data-chat="${h.chat_id}">${ic('msg', 'sm ci')}<span><b>${esc(h.title)}</b><small>${esc(h.snippet)}</small></span></a></div>`).join('')}` : '');
  list.querySelectorAll('details.folder').forEach(d => d.ontoggle = () => { const o = JSON.parse(localStorage.getItem('fopen') || '{}'); o[d.dataset.f] = d.open; localStorage.setItem('fopen', JSON.stringify(o)); });
  list.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const d = b.dataset;
    if (d.unbm) return setBookmark(+d.unbm, false);
    if (d.cmenu) {
      const c = chat.chats.find(x => x.id === +d.cmenu); if (!c) return;
      sheet(c.title, optHTML('pin', ic('star') + (c.pinned ? 'Remove bookmark' : 'Bookmark chat'), 'Starred chats stay at the top of the sidebar')
        + optHTML('shr', ic('share') + 'Share link', c.share_token ? 'Copy or turn off the share link' : 'Create a read-only link for others')
        + optHTML('ren', ic('pen') + 'Rename', 'Change the name shown in the sidebar')
        + optHTML('ins', ic('settings') + 'Chat instructions', 'For example "answer in English" or "act as a math tutor", for this chat only')
        + optHTML('mv', ic('folder') + 'Move to workspace', c.folder_id ? 'Change or remove its workspace' : 'Keep it with shared instructions and files')
        + optHTML('cst', ic('dash') + 'Chat cost', 'Tokens used and the estimated pay-as-you-go cost')
        + optHTML('arc', ic('inbox') + 'Archive', 'Hide it from the list · restore it in Settings › Archive & trash')
        + optHTML('del', ic('trash') + 'Delete', 'Moves to the trash · can be restored for 30 days'), (sd, close) => {
        sd.querySelector('[data-v=pin]').onclick = async () => { close(); await api('/chats/' + c.id, { method: 'PUT', body: { pinned: c.pinned ? 0 : 1 } }); loadSide(); toast(c.pinned ? 'Bookmark removed' : 'Bookmarked', 'ok'); };
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
          if (!chat.folders.length) return toast('No workspaces yet · create one from Workspace in the sidebar');
          sheet('Move to workspace', optHTML('', ic('x') + 'No workspace', 'Show it in Chats', !c.folder_id)
            + chat.folders.map(f => optHTML(f.id, ic('folder') + esc(f.name), '', c.folder_id === f.id)).join(''), (fd, fclose) => {
            fd.querySelectorAll('[data-v]').forEach(x => x.onclick = async () => { fclose(); await api('/chats/' + c.id, { method: 'PUT', body: { folder_id: +x.dataset.v || null } }); loadSide(); toast('Moved', 'ok'); });
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
  let size = '';
  s = s.replace(/```image[ \t]*(\w*)[ \t]*\n([\s\S]*?)```/g, (_, z, b) => { if (!prompt) { prompt = b.trim().slice(0, 1500); size = IMG_SIZES[z] ? z : ''; } return ''; });
  const open = s.search(/```image/);
  if (open >= 0) s = s.slice(0, open);
  else if (streaming) s = s.replace(/`{1,3}(?:i(?:m(?:a(?:g(?:e)?)?)?)?)?$/, '');
  return { text: s.trim(), prompt, size };
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
  const title = chat.chats.find(c => c.id === chat.id)?.title || 'แชต Kyber';
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
async function genImage(auto, silent, size) { // size = sq/land/port (AI เลือกได้ผ่าน generate_image) · ไม่ส่ง = ตามที่ผู้ใช้เลือกไว้ // auto = คำบรรยายที่ AI เขียนเอง (silent: ไม่มีข้อความฝั่งผู้ใช้)
  if (chat.busy) return;
  const t = $('#t'), prompt_ = typeof auto === 'string' ? auto : t.value.trim() || await promptSheet('บรรยายรูปที่ต้องการสร้าง', '', { title: 'สร้างรูปด้วย AI', placeholder: 'เช่น แมวส้มใส่แว่นกันแดด สไตล์อนิเมะ', ok: 'Generate image' });
  if (!prompt_?.trim()) return;
  if (!silent) { t.value = ''; t.style.height = 'auto'; $('#e').textContent = ''; chat.msgs.push({ role: 'user', content: '🎨 ' + prompt_ }); appendMsg(chat.msgs.at(-1)); }
  const ai = { role: 'assistant', content: '', model: 'สร้างรูป', streaming: true }; chat.msgs.push(ai); appendMsg(ai);
  setBusy(true);
  try { const r = await api('/image', { method: 'POST', body: { prompt: prompt_, chat_id: chat.id, silent: !!silent, size: IMG_SIZES[size && IMG_SIZES[size] ? size : imgSize()][0] } }); ai.content = `![${prompt_.slice(0, 80).replace(/[\[\]\s]+/g, ' ').trim()}](${r.src})`; setUsage(r.usage); }
  catch (x) { if (silent) chat.msgs.pop(); else { chat.msgs.splice(-2, 2); t.value = prompt_; } showErr(x.message); }
  ai.streaming = false; setBusy(false); renderAll();
}

// ---------- APK: แปลงไฟล์ไบนารีของแอป Android ให้ AI อ่านได้ (ทำในเบราว์เซอร์) ----------
// AndroidManifest.xml / res/*.xml เป็น binary XML (AXML) → XML ข้อความ · classes*.dex → รายชื่อคลาส
function axmlToText(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), u16 = o => v.getUint16(o, true), u32 = o => v.getUint32(o, true);
  if (buf.length < 8 || u16(0) !== 3) return null;
  let strs = [], ids = [], out = [], depth = 0, open = false; const ns = new Map();
  const S = i => i === 0xffffffff ? '' : strs[i] ?? '';
  const esc_ = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const val = (type, data, raw) => raw !== 0xffffffff ? S(raw) : type === 3 ? S(data) : type === 0x12 ? String(data !== 0) : type === 0x10 ? String(data | 0) : type === 0x11 ? '0x' + data.toString(16) : type === 1 ? '@0x' + data.toString(16).padStart(8, '0') : type === 2 ? '?0x' + data.toString(16).padStart(8, '0') : type === 4 ? String(new Float32Array(new Uint32Array([data]).buffer)[0]) : type === 5 ? (data >> 8) + ['px', 'dp', 'sp', 'pt', 'in', 'mm'][data & 15] : '0x' + data.toString(16);
  for (let o = u16(2); o + 8 <= buf.length;) {
    const type = u16(o), size = u32(o + 4); if (!size) break;
    if (type === 1) { // string pool
      const n = u32(o + 8), utf8 = (u32(o + 16) & 256) !== 0, start = o + u32(o + 20);
      for (let i = 0; i < n; i++) {
        let p = start + u32(o + u16(o + 2) + i * 4);
        if (utf8) { p += (buf[p] & 128) ? 2 : 1; let len = buf[p]; if (len & 128) { len = ((len & 127) << 8) | buf[p + 1]; p += 2; } else p++; strs.push(new TextDecoder().decode(buf.subarray(p, p + len))); }
        else { let len = u16(p); if (len & 0x8000) { len = ((len & 0x7fff) << 16) | u16(p + 2); p += 4; } else p += 2; let t = ''; for (let k = 0; k < len; k++) t += String.fromCharCode(u16(p + k * 2)); strs.push(t); }
      }
    } else if (type === 0x180) { for (let p = o + 8; p < o + size; p += 4) ids.push(u32(p)); }
    else if (type === 0x100) ns.set(S(u32(o + 20)), S(u32(o + 16)));
    else if (type === 0x102) {
      if (open) out[out.length - 1] += '>';
      const name = S(u32(o + 20)), aStart = u16(o + 24), aSize = u16(o + 26), n = u16(o + 28), attrs = [];
      for (let k = 0; k < n; k++) {
        const p = o + 16 + aStart + k * aSize, an = u32(p + 4), pre = ns.get(S(u32(p)));
        attrs.push(` ${pre ? pre + ':' : ''}${S(an) || 'attr_0x' + (ids[an] ?? 0).toString(16)}="${esc_(val(buf[p + 15], u32(p + 16), u32(p + 8)))}"`);
      }
      out.push('  '.repeat(depth) + `<${name}${out.length ? '' : [...ns].map(([u, pf]) => ` xmlns:${pf}="${u}"`).join('')}${attrs.join('')}`); depth++; open = true;
    } else if (type === 0x103) { depth--; if (open) { out[out.length - 1] += ' />'; open = false; } else out.push('  '.repeat(depth) + `</${S(u32(o + 20))}>`); }
    else if (type === 0x104) { if (open) { out[out.length - 1] += '>'; open = false; } out.push('  '.repeat(depth) + esc_(S(u32(o + 16)))); }
    o += size;
  }
  return out.join('\n');
}
function dexClasses(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), u32 = o => v.getUint32(o, true);
  if (String.fromCharCode(...buf.subarray(0, 3)) !== 'dex') return null;
  const strOff = u32(0x3c), typeOff = u32(0x44), n = u32(0x60), clsOff = u32(0x64), dec = new TextDecoder();
  const str = i => { let p = u32(strOff + i * 4); while (buf[p] & 128) p++; p++; let e = p; while (buf[e]) e++; return dec.decode(buf.subarray(p, e)); };
  const out = [];
  for (let i = 0; i < n; i++) out.push(str(u32(typeOff + u32(clsOff + i * 32) * 4)).replace(/^L|;$/g, '').replace(/\//g, '.'));
  return out.sort();
}
async function apkFiles(f) {
  await lib('jszip'); const z = await JSZip.loadAsync(f), files = {}, bin = [];
  for (const e of Object.values(z.files)) {
    if (e.dir) continue; const nm = e.name;
    if (/\.xml$/i.test(nm)) { const b = await e.async('uint8array'), t = axmlToText(b); if (t != null) { files[nm] = t; continue; } const s = new TextDecoder().decode(b); if (!s.includes('\u0000')) { files[nm] = s; continue; } }
    else if (/(^|\/)classes\d*\.dex$/.test(nm)) { const c = dexClasses(await e.async('uint8array')); if (c) { const own = c.filter(x => !/^(android|androidx|kotlin|kotlinx|com\.google|org\.jetbrains|okhttp3|okio|retrofit2|io\.reactivex|dagger|javax)\./.test(x)); files[nm + '.classes.txt'] = `${c.length} คลาส (ไม่รวมไลบรารีทั่วไป ${own.length} คลาส)\n\n# คลาสของแอป\n${own.slice(0, 20000).join('\n')}`; continue; } }
    else if (/\.(xapk|apk)$/i.test(nm)) { bin.push(nm + ' (APK ย่อย: แตกแล้วแนบแยก)'); continue; }
    else if (TEXT_EXT.test(nm) || /\.(properties|json|txt|smali|js|html|css|cfg|ini)$/i.test(nm)) { const t = await e.async('string'); if (!t.includes('\u0000')) { files[nm] = t; continue; } }
    bin.push(nm);
  }
  if (!Object.keys(files).length) throw new Error('อ่าน APK นี้ไม่ได้ (ไฟล์เสียหรือเข้ารหัส)');
  return { files, bin };
}
async function readFile(f) {
  const n = f.name.toLowerCase(); let text;
  if (f.size > (/\.(apk|aab|xapk|apks)$/.test(n) ? 300e6 : RAW_MAX)) throw new Error(/\.(apk|aab|xapk|apks)$/.test(n) ? 'APK ใหญ่เกิน 300MB' : 'ไฟล์ใหญ่เกิน 20MB');
  if (n.endsWith('.pdf')) {
    const pdf = await (await pdfLib()).getDocument({ data: await f.arrayBuffer(), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      pages.push(`--- หน้า ${i} ---\n` + c.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join(''));
    }
    text = pages.join('\n');
    if (!text.replace(/--- หน้า \d+ ---/g, '').trim()) throw new Error('PDF นี้เป็นภาพสแกน ไม่มีข้อความให้อ่าน ลองแคปหน้าจอแล้วแนบเป็นรูปแทน');
  } else if (/\.(apk|aab|xapk|apks)$/.test(n)) { // APK: แปลง Manifest/layout/dex ให้อ่านได้ แล้วเก็บแบบ zip ให้ AI เปิดทีละไฟล์ (ไม่ส่งตัว APK ขึ้นเซิร์ฟเวอร์)
    const { files, bin } = await apkFiles(f), list = Object.keys(files);
    const head = `[apk: ${f.name} · ${list.length} ไฟล์ที่อ่านได้ (Manifest/resource แปลงจากไบนารีแล้ว, dex เป็นรายชื่อคลาส)${bin.length ? `, ไฟล์ไบนารีอื่น ${bin.length} ไฟล์: ${bin.slice(0, 40).join(', ')}${bin.length > 40 ? '…' : ''}` : ''}] · แก้แล้วแพ็กกลับ/เซ็น APK ต้องทำในแอป Kyber บนคอม (Agent มีเครื่องมือ android_tools)`;
    let id = null;
    try { const zz = new JSZip(); for (const p of list) zz.file(p, files[p]); const fd = new FormData(); fd.append('zip', new File([await zz.generateAsync({ type: 'blob', compression: 'DEFLATE' })], f.name + '.zip')); fd.append('files', JSON.stringify(files)); id = (await api('/zipref', { method: 'POST', body: fd })).id; }
    catch (x) { if (!/R2|501/.test(x.message)) throw x; }
    text = id ? `${head} [[zipref:${id}]]\nรายชื่อไฟล์ (AI เปิดอ่านเองได้):\n` + list.slice(0, 1500).map(p => `${p} · ${files[p].length.toLocaleString()} ตัวอักษร`).join('\n') : head + '\n\n' + list.map(p => `===== ${p} =====\n${files[p]}`).join('\n\n');
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
    await lib('mammoth'); const ab = await f.arrayBuffer(); text = (await mammoth.extractRawText({ arrayBuffer: ab })).value;
    const mdx = await mammoth.convertToMarkdown?.({ arrayBuffer: ab }).then(r => r.value.replace(/\\([.()\-#*_!])/g, '$1')).catch(() => null); text = ufNote(await ufUpload(f.name, 'doc', { md: mdx || text })) + text;
  } else if (/\.(xlsx|xlsm|xls|ods)$/.test(n)) {
    await lib('xlsx'); const wb = XLSX.read(await f.arrayBuffer());
    text = wb.SheetNames.map(s => `--- ชีต ${s} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
    if (/\.xlsx?$|\.xlsm$|\.ods$/.test(n)) text = ufNote(await ufUpload(f.name.replace(/\.(xls|xlsm|ods)$/i, '.xlsx'), 'sheet', wbBook(wb))) + text; // เก็บเข้าบัญชี: AI แก้ไฟล์นี้ได้ตรง ๆ
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
    if ((f.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/i.test(f.name)) && typeof meetFileSheet === 'function') { meetFileSheet(f); continue; } // ไฟล์เสียง: ถอดเป็นบันทึกประชุม
    if (f.type.startsWith('image/') && !/\.svg$/i.test(f.name)) {
      if (!curModel()?.vision) { showErr('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลที่อ่านรูปได้ เช่น Claude'); continue; }
      if (chat.images.length >= IMG_MAX) { showErr(`แนบรูปได้สูงสุด ${IMG_MAX} รูป`); continue; }
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
  const roots = new Set([...all.keys()].map(p => p.split('/')[0])), name = base ? base.name.replace(/\.zip$/i, '') + '_edited.zip' : (roots.size === 1 && [...all.keys()][0].includes('/') ? [...roots][0] : 'kyber-files') + '.zip';
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
  if (m.role === 'user' && m.content.startsWith(APPR_RES)) return `<div class="msg user pcres ${isNew ? 'new' : ''}"><details><summary>${ic('check', 'sm')} ผลจากเครื่องมือที่อนุญาต</summary><pre>${esc(m.content.slice(APPR_RES.length).trim())}</pre></details></div>`;
  if (m.role === 'user' && m.content.startsWith(PY_RES)) return `<div class="msg user pcres ${isNew ? 'new' : ''}"><details><summary>${ic('terminal', 'sm')} ผลรัน Python</summary>${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}<pre>${esc(m.content.slice(PY_RES.length).trim())}</pre></details></div>`;
  if (m.role === 'user' && m.content.startsWith(PC_RES)) return `<div class="msg user pcres ${isNew ? 'new' : ''}"><details><summary>${ic('folder', 'sm')} ผลจากเครื่อง</summary>${m.imgs ? `<div class="mimgs">${m.imgs.map(d => `<img src="${d}" alt="">`).join('')}</div>` : ''}<pre>${esc(m.content.slice(PC_RES.length).trim())}</pre></details></div>`;
  if (m.role === 'user') {
    const files = [...m.content.matchAll(FILE_RE)];
    const shots = m.imgs || (attImgsOf(m.content).length ? attImgsOf(m.content) : null); // รูปที่แนบ: ตอนส่ง (ในเครื่อง) หรือที่เซิร์ฟเวอร์เก็บไว้ (หลังโหลดใหม่)
    return `<div class="msg user ${isNew ? 'new' : ''}"><div class="b">${shots ? `<div class="mimgs">${shots.map(d => `<img src="${esc(d)}" alt="" loading="lazy">`).join('')}</div>` : ''}${m.content.startsWith('🎨 ') ? ic('image') + ' ' : ''}${esc(noAttImgs(m.content).replace(FILE_RE, '').replace(/^🎨 /, '').trim())}${files.length ? `<div class="mfiles">${files.map(f => `<span class="fchip">${ic('filetext')}<span>${esc(f[1])}</span><small>${tok(f[2].length)}</small></span>`).join('')}</div>` : ''}</div>
      ${i >= 0 && !m.content.startsWith('🎨') ? `<div class="acts"><button data-copy="${i}" aria-label="คัดลอกข้อความ">${ic('copy', 'sm')}</button>${m.id && !chat.busy ? `<button data-edit="${i}">${ic('pen', 'sm')} Edit</button>` : ''}<button data-mem="${i}" class="${MEM_RE.test(m.content) ? 'memhint' : ''}">${MEM_RE.test(m.content) ? ic('bulb') + ' ให้ AI จำเรื่องนี้?' : 'Remember'}</button></div>` : ''}</div>`;
  }
  const last = i === chat.msgs.length - 1;
  const { text: tTools, files: dlFiles, py: pyCodes, mems: memSaved, approves, arts } = parseTools(m.content);
  const { text: t00, mem } = parseMem(tTools, m.streaming), { text: t0, prompt: imgP } = parseImg(t00, m.streaming), { text: t1, asks } = parseAsk(t0, m.streaming), text = pcFmt(t1);
  const mcpH = m.mcps?.length ? `<div class="steps-bar mcp-live" style="cursor:default">${ic('server', 'sm')}<span>${m.mcps.map(x => esc(x.tool)).join(', ')}</span></div>` : '';
  return `<div class="msg ai ${isNew ? 'new' : ''}">${hasSegs(m) ? '' : thinkHTML(m)}${taskTodoHTML(m)}${mcpH}${m.agent ? agentHTML(m, i) : ''}<div class="b">${hasSegs(m) ? segHTML(m, text) : text ? md(text) : m.thinking || asks.length ? '' : imgP ? `<details class="imgp"><summary class="muted">${ic('image', 'sm')} สั่งสร้างรูปแล้ว · ดูคำบรรยายรูป</summary><p>${esc(imgP)}</p></details>` : emptyHTML(m)}</div>${askHTML(asks, last && !m.streaming)}${mem ? `<div class="acts"><button data-rem="${i}">${ic('plus', 'sm')} จำไว้: ${esc(mem)}</button></div>` : ''}${sourcesHTML(m)}
    ${vidCards(m.content)}${ufCards(m.content)}${arts.map(a => `<button type="button" class="art-card" data-art="${a.id}" data-artv="${a.v}">${ic('code', 'sm')}<span><b>${esc(a.t)}</b><small>Artifact · v${a.v} · tap to open</small></span></button>`).join('')}${toolCards(m, i, dlFiles, pyCodes, approves)}${memSaved.map(x => `<div class="mem-saved">${ic('check', 'sm')}<span>จำแล้ว: ${esc(x.t)}</span><button type="button" data-unmem="${x.id}">ยกเลิก</button></div>`).join('')}
    ${!m.streaming && i >= 0 ? zipBtn(m, i) : ''}
    ${m.note ? `<div class="mnote">${esc(m.note)}</div>` : ''}
    ${m.streaming ? '' : `<div class="acts">${m.model ? `<span class="muted">${esc(m.model)}</span>` : ''}${i < 0 ? '' : `<button data-copy="${i}" class="cp-msg">${ic('copy', 'sm')} คัดลอก</button>`}${i < 0 ? '' : `${m.id ? `<button data-vote="${i}" data-v="1" class="${m.vote === 1 ? 'on' : ''}" aria-label="คำตอบดี" aria-pressed="${m.vote === 1}">${ic('thumbup')}</button><button data-vote="${i}" data-v="-1" class="${m.vote === -1 ? 'on' : ''}" aria-label="คำตอบไม่ดี" aria-pressed="${m.vote === -1}">${ic('thumbdown')}</button><button data-report="${i}" aria-label="รายงานคำตอบนี้">Report</button><button data-branch="${i}" title="เปิดแชตใหม่ที่มีข้อความถึงตรงนี้ แล้วถามต่อคนละทาง" aria-label="แตกกิ่ง">${ic('branch')}</button>` : ''}${'speechSynthesis' in window ? `<button data-say="${i}" aria-label="อ่านออกเสียง">${ic('volume')}</button>` : ''}${last && !chat.busy && !m.agent ? '<button data-regen>Regenerate</button>' : ''}`}${tokHTML(m)}</div>`}</div>`;
}
// token ที่ใช้ตอบ + ลิมิตที่ใช้ไป (เฉพาะข้อความที่เพิ่งตอบ)
const tokHTML = m => m.tin || m.tout ? `<span class="tok" title="Input ${num(m.tin)} · Output ${num(m.tout)} token">↑${kTok(m.tin || 0)} ↓${kTok(m.tout || 0)}${m.pct != null ? ` · ลิมิต +${m.pct < 0.1 ? '<0.1' : m.pct.toFixed(1)}%` : ''}</span>` : '';
const sourcesHTML = m => m.sources?.length ? `<details class="srcbox"><summary>${ic('globe', 'sm')}<span>ค้นเว็บ · ${m.sources.length} แหล่งที่มา</span><span class="src-fav">${[...new Set(m.sources.map(x => { try { return new URL(x.url).hostname; } catch { return ''; } }).filter(Boolean))].slice(0, 4).map(h => `<i>${esc(h.replace(/^www\./, '')[0].toUpperCase())}</i>`).join('')}</span>${ic('down', 'sm')}</summary><div class="srcs">${m.sources.map((x, k) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.url)}"><b>${k + 1}</b>${esc(x.title || new URL(x.url).hostname)}</a>`).join('')}</div></details>` : '';
function renderAll() {
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = chat.msgs.length ? chat.msgs.map((m, i) => msgHTML(m, i)).join('')
    : `<div class="empty"><div class="stat">${esc(HELLO[Math.floor(Math.random() * HELLO.length)])}</div><div>${chat.spaceId ? `New chat in <b>${esc(chat.spaceName)}</b> · <button type="button" class="linkish" data-nospace>no workspace</button>` : 'Pick a model below and start typing'}</div>
       <div class="mode-seg sm" role="group" aria-label="Mode"><span class="on" aria-current="page">${ic('msg', 'sm')}Chat</span><a href="/code">${ic('code', 'sm')}Code</a><a href="/chat?mode=cowork" title="Kyber Harness">${ic('layers', 'sm')}Harness</a></div>
       <div class="chips">${SUGGEST.map(([icon, s], i) => `<button data-s="${i}">${ic(icon, 'sm')} ${s}</button>`).join('')}</div></div>`;
  box.scrollTop = box.scrollHeight; head(); renderRich(box);
}
function appendMsg(m) {
  const box = $('#msgs'); if (!chat.msgs.length || chat.msgs.length === 1) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', msgHTML(m, chat.msgs.length - 1, true)); box.lastElementChild?.classList.add('enter');
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
// ตัวจับเวลาขณะ AI ทำงาน (แชต): บอกว่ากำลังทำอะไร + กี่วินาทีแล้ว ใต้ข้อความ · ช่วงที่ไม่มีตัวอักษรใหม่บอกว่ากำลังคิด/ใช้เครื่องมือ
const CHWORK = { since: 0, len: -1, at: 0 };
function chatWorkTick() {
  const box = $('#msgs'); if (!box) return;
  let el = $('#chwork'); if (!el) { el = document.createElement('div'); el.id = 'chwork'; el.className = 'cwork'; el.hidden = true; el.setAttribute('aria-live', 'off'); box.after(el); }
  if (!chat.busy) { if (!el.hidden) el.hidden = true; CHWORK.since = 0; return; }
  const now = Date.now(); if (!CHWORK.since) { CHWORK.since = now; CHWORK.at = now; }
  const last = chat.msgs.at(-1), len = last ? String(last.content || '').length + String(last.thinking || '').length : 0;
  if (len !== CHWORK.len) { CHWORK.len = len; CHWORK.at = now; }
  const sec = Math.floor((now - CHWORK.since) / 1000), quiet = now - CHWORK.at > 2500;
  const what = last?.mcps?.length && quiet ? `ใช้เครื่องมือ: ${last.mcps.at(-1).tool || ''}` : quiet ? (last?.content ? 'AI กำลังทำงานต่อ' : 'AI กำลังคิด') : 'AI กำลังเขียน';
  el.hidden = false; el.innerHTML = `<span class="cw-dot"></span><span>${esc(String(what).slice(0, 80))}…</span><span class="muted">${sec >= 60 ? Math.floor(sec / 60) + ' นาที ' : ''}${sec % 60} วิ</span>`;
}
setInterval(chatWorkTick, 500);
function setBusy(b) { chat.busy = b; const g = $('#go'); g.innerHTML = ic(b ? 'stop' : 'up'); g.setAttribute('aria-label', b ? 'หยุด' : 'ส่ง'); g.classList.toggle('stop', b); }

// อ่าน SSE จาก /api/chat แล้วเรียก onData ทีละ event
async function stream(body, signal, onData) {
  if (subSel() && !body.stop) body = { ...body, sub_id: subSel() }; // หลายแพลน: ใบที่ผู้ใช้เลือก
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
const noteOf = (m, d) => { const add = t => { if (!(m.note || '').includes(t)) m.note = m.note ? m.note + ' · ' + t : t; }; if (d.wallet) add('โมเดลนอกแพลน: ตัดเงินจาก Wallet ตามราคาขาย'); if (d.overflow) add('ลิมิตเต็ม ใช้เงินใน Wallet'); if (d.fallback) add(`โมเดลหลักขัดข้อง จึงตอบด้วย ${d.fallback}`); if (d.sources) m.sources = d.sources; };
async function editMsg(idx) {
  if (chat.busy) return;
  const m = chat.msgs[idx]; if (!m?.id) return;
  const raw = noAttImgs(m.content).replace(FILE_RE, '').trim();
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { imgWake(); textWake(); } });
addEventListener('online', () => textWake());
// กลับมาที่หน้า / เน็ตกลับมา: คำถามล่าสุดยังไม่มีคำตอบ (สตรีมหลุดตอนพับจอหรือเน็ตหลุด) → ดึงคำตอบที่เซิร์ฟเวอร์ทำต่อไว้ ถ้ายังไม่มีก็ต่อสตรีม · ลองครั้งเดียวต่อคำถาม
async function textWake() {
  if (document.body.dataset.page !== 'chat' || document.visibilityState !== 'visible' || !navigator.onLine || !chat.id || chat.busy || chat.agentBusy || chat.imgWake || chat.msgs.at(-1)?.role !== 'user') return;
  const k = chat.id + ':' + chat.msgs.length; if (chat.wokeFor === k) return; chat.wokeFor = k;
  const list = await api('/chats/' + chat.id).catch(() => null);
  if (chat.busy || chat.wokeFor !== k) return;
  if (list && list.length > chat.msgs.length) { for (const r of list) if (typeof r.sources === 'string') try { r.sources = JSON.parse(r.sources); } catch { r.sources = null; } chat.msgs = list; $('#e').textContent = ''; renderAll(); loadSide(); return; }
  if (chat.msgs.at(-1)?.role === 'user') send({ resume: true });
}
// ร่างข้อความในช่องพิมพ์ ต่อแชต (sessionStorage: อยู่ถึงปิดแท็บ ไม่ค้างในเครื่องถาวร) · ลบเมื่อส่งสำเร็จ
const draft = {
  key: () => 'draft:' + (chat.id || 'new'),
  get() { try { return sessionStorage.getItem(this.key()) || ''; } catch { return ''; } },
  set(v) { try { if (v && v.trim()) sessionStorage.setItem(this.key(), v.slice(0, 50000)); else sessionStorage.removeItem(this.key()); } catch { /* โหมดส่วนตัว/เต็ม: ข้าม */ } },
  del() { clearTimeout(chat.draftT); try { sessionStorage.removeItem(this.key()); } catch { /* ข้าม */ } },
};
async function send({ regenerate = false, resume = false, edit_id = null, edit_text = '' } = {}) {
  if (chat.busy) { if (chat.agentBusy && !regenerate && !resume && !edit_id) agentSteer(); return; } // Agent กำลังทำ: Enter = พิมพ์แทรก (ปุ่มส่ง = หยุด)
  if (!regenerate && !resume && !edit_id && isImgMode() && $('#t').value.trim() !== chat.enhanced && (chat.images.length || localStorage.getItem('imgAuto') !== '0')) { // โหมดสร้างภาพ: ปรับ prompt ก่อนส่ง (แนบรูป = ต้องปรับ เพราะใช้รูปเป็นแรงบันดาลใจ)
    setBusy(true); const ok = await enhancePrompt(true); setBusy(false);
    if (ok === 'net') { chat.imgWake = 'send'; if (document.visibilityState === 'visible') imgWake(); return; } // เน็ตหลุดตอนปิดจอ: กลับมาแล้วส่งต่อให้เอง
    if (!ok) return;
  }
  // แพลนไม่รวม Agent และไม่มีแพ็ก/เงินใน Wallet: บอกก่อนส่ง และให้ปิด Agent แล้วส่งเป็นแชตปกติได้ในแตะเดียว (เดิมขึ้นว่า "แพลนไม่รวมโมเดลนี้")
  if (!regenerate && !resume && !edit_id && agentOn() && me.plan?.paid && !me.plan.agent && !(me.balance >= 1)) {
    const pk = await api('/agent-pack').catch(() => null);
    if (!pk?.active) {
      const off = await confirmSheet(`แพลน ${me.plan.name} ยังไม่รวมโหมด Agent (มีในแพลน Pro ขึ้นไป หรือซื้อแพ็ก Agent) · ปิดโหมด Agent แล้วส่งเป็นแชตปกติด้วยลิมิตแพลนได้เลย`, { title: 'โหมด Agent', ok: 'ปิด Agent แล้วส่ง', cancel: 'ดูแพลน' });
      if (!off) return go('/plans');
      localStorage.setItem('pcAgent', '0'); modelUI();
    }
  }
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
    autoRetry = 0; if (!chat.pcAuto) chat.pcRound = 0; chat.pcAuto = false; if (!chat.pyAuto) chat.pyRound = 0; chat.pyAuto = false;
    draft.del(); t.value = ''; t.style.height = 'auto'; chat.images = []; chat.files = []; drawThumbs();
    chat.msgs.push({ role: 'user', content: withFiles(text || (files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้'), files), imgs: imgs.length ? imgs : null });
    appendMsg(chat.msgs.at(-1));
  }
  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };
  chat.msgs.push(ai);
  if (quiet) renderAll(); else appendMsg(ai);
  setBusy(true); chat.ctrl = new AbortController();
  const t0 = Date.now();
  let started = false, streamErr = null, aborted = false, raf = 0;
  // พิมพ์ตัวอักษรแบบไหลลื่น: ข้อความมาเป็นก้อน ๆ แต่แสดงทีละนิดทุกเฟรม (ค้างมากก็เร่งให้ทัน) · ผู้ใช้ที่ลดการเคลื่อนไหวเห็นทันที
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches; let shown = 0;
  const tick = () => {
    raf = 0; const full = ai.content || '';
    if (calm || hasSegs(ai) || chat.msgs.at(-1) !== ai) { shown = full.length; return updateLast(); }
    shown = Math.min(full.length, shown + Math.max(3, Math.ceil((full.length - shown) / 6)));
    const box = $('#msgs'), stick = nearBottom(box);
    paintStreaming(box.lastElementChild, shown < full.length ? { ...ai, content: full.slice(0, shown) } : ai);
    if (stick) box.scrollTop = box.scrollHeight;
    if (shown < full.length) raf = requestAnimationFrame(tick);
  };
  try {
    await stream({ task: isTask() || undefined, img_size: IMG_SIZES[imgSize()][0], chat_id: chat.id, folder_id: !chat.id && chat.spaceId ? chat.spaceId : undefined, model_id: m.id, text, images: imgs, files, regenerate, resume, edit_id, search: localStorage.getItem('web') === '1' && !!site.search, skill_ids: chat.skills, mcp_ids: chat.mcps, mcp_off: mcpOff(), local: pcOn() ? { os: navigator.userAgentData?.platform || navigator.platform, folder: chat.pc.name, mcp: chat.pcTools || [], screen: !!chat.screen } : undefined,
      effort: m.effort !== 'none' ? $('#effort').value || null : null }, chat.ctrl.signal, d => {
      started = true;
      if (d.chat_id && !chat.id) { chat.id = d.chat_id; setUrl('/chat?id=' + d.chat_id, true); }
      if (d.model) ai.model = d.model;
      noteOf(ai, d); if (d.fallback) ai.model = d.fallback;
      if (d.todo) { ai.todos = d.todo; const el = $('#msgs')?.lastElementChild?.querySelector('.task-todo'); if (el) el.outerHTML = taskTodoHTML(ai); else { const b = $('#msgs')?.lastElementChild?.querySelector('.b'); b?.insertAdjacentHTML('beforebegin', taskTodoHTML(ai)); } }
      if (d.t || d.th) { onStreamEvent(ai, d); if (d.t?.includes("]]")) ufLive(ai.content); if (!raf) raf = requestAnimationFrame(tick); }
      if (d.error) streamErr = d.error;
      if (d.tok) { ai.tin = d.tok.in; ai.tout = d.tok.out; }
      if (d.ctx) { chat.ctx = { ...d.ctx, id: chat.id }; }
      if (d.compacted) { toast(`ย่อแชตอัตโนมัติแล้ว (${d.why}) ข้อความเก่าถูกสรุปไว้`, 'ok'); chat.ctx = null; }
      if (d.trimmed) toast('context เต็ม: ตัดข้อความเก่าบางส่วนออกจากที่ส่งให้ AI ลองย่อแชตหรือเปิดแชตใหม่', 'bad');
      if (d.done) { const prev = (d.sub_id && me.subs?.find(x => x.id === d.sub_id)) || me.usage; ai.pct = Math.max(0, d.pctWeek - prev.pctWeek); setUsage(d); }
    });
    cancelAnimationFrame(raf); raf = 0; // จบแล้ว: หยุดพิมพ์ทีละนิด ให้ขั้นถัดไปแสดงข้อความเต็ม
  } catch (x) {
    cancelAnimationFrame(raf); raf = 0;
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
    else if (x.status === 429 && /กำลังตอบข้อความก่อนหน้า/.test(x.message) && !chat.lockRetry) { // คำตอบเดิมค้าง (เช่น โมเดลเงียบ): หยุดคำตอบเดิมแล้วส่งใหม่ให้เอง 1 ครั้ง
      chat.lockRetry = true; chat.msgs.pop(); if (chat.msgs.at(-1)?.role === 'user' && !regenerate && !resume) chat.msgs.pop(); setBusy(false); renderAll(); showErr('กำลังหยุดคำตอบเดิมที่ค้างอยู่ แล้วส่งใหม่ให้…');
      await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stop: true, chat_id: chat.id || null }) }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200)); $('#t').value ||= text; try { return await send({ regenerate, edit_id, edit_text }); } finally { chat.lockRetry = false; }
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
  if (!streamErr && !aborted && !empty) { const g = parseImg(ai.content); if (g.prompt) genImage(g.prompt, true, g.size); } // AI สั่งสร้างรูปเอง
  if (streamErr) showErr(streamErr, true);
  else if (aborted) showErr('หยุดแล้ว · ถ้าเซิร์ฟเวอร์ตอบจบแล้ว ระบบจะดึงคำตอบมาแสดงให้เอง');
  else if (empty) {
    // เดิม: ลบคำตอบทิ้งแล้วเงียบสนิท ไม่มีอะไรขึ้นเลย → ตอนนี้ลองต่อให้อัตโนมัติ 1 ครั้ง แล้วค่อยแจ้ง
    if (started && chat.id && !resume && autoRetry < 1) { autoRetry++; showErr('โมเดลยังไม่ได้ส่งคำตอบ กำลังลองใหม่ให้อัตโนมัติ…'); return send({ resume: true }); }
    showErr('ไม่ได้คำตอบจากโมเดล ลองอีกครั้ง', true);
  }
  loadSide();
  if (!streamErr && !aborted && !empty && pcOn() && (pcCalls(ai.content).length || fileBlocks(ai.content).length)) return pcAct(ai);
  if (!streamErr && !aborted && !empty && parseTools(ai.content).py.length) return pyRun(ai); // AI เรียก run_python: รันในเบราว์เซอร์แล้วส่งผลกลับให้ทำต่อ
  if (!streamErr && !aborted && Date.now() - t0 > 15000) PCD?.notify('Kyber ตอบเสร็จแล้ว', ai.content.replace(/[#*`>\[\]]/g, '').slice(0, 140)); // แอป Desktop: แจ้งเตือนเมื่อสลับไปทำอย่างอื่นระหว่างรอ
}

// ---------- ใช้คอมเครื่องนี้ (แอป Kyber Desktop) ----------
// AI เขียนบรรทัด LIST / READ / RUN / MCP หรือบล็อก file=… → หน้าเว็บในแอปทำในเครื่อง (เฉพาะโฟลเดอร์ที่ผู้ใช้เลือก) แล้วส่งผลกลับเป็นข้อความถัดไปให้ AI ทำต่อ
// RUN และการตั้งค่า MCP ถามอนุญาตด้วยหน้าต่างของ Windows (แอปเป็นคนถาม หน้าเว็บกดแทนไม่ได้) · เขียนไฟล์ถามในหน้านี้ก่อน
const PCD = window.astraDesktop?.fs ? window.astraDesktop : null;
const PC_LINE = /^[ \t]*(LIST|READ|GREP|RUN|MCP|SCREEN|CLICK|DOUBLE|RIGHT|TYPE|KEY|SCROLL|WAIT)\b[ \t]*(.*)$/gm, PC_SCREEN = new Set(['SCREEN', 'CLICK', 'DOUBLE', 'RIGHT', 'TYPE', 'KEY', 'SCROLL', 'WAIT']), PC_RES = '[ผลจากเครื่อง]', PC_MAX = 15;
const pcOn = () => !!(PCD && chat.pc && localStorage.getItem('pc') !== '0'); // ในแอป: เปิดเป็นค่าเริ่มต้น (ปิดเองได้) · ไม่งั้น AI ได้แค่บอกให้ผู้ใช้รันคำสั่งเอง
const pcCalls = text => [...String(text || '').replace(/```[\s\S]*?```/g, '').matchAll(PC_LINE)].map(m => [m[1], m[2].trim()]).slice(0, 12);
const pcFmt = text => PCD ? String(text).split(/(```[\s\S]*?(?:```|$))/).map((p, i) => i % 2 ? p : p.replace(PC_LINE, (_, k, a) => '`⚙ ' + k + ' ' + a.replace(/`/g, "'").slice(0, 200) + '`')).join('') : text;
const pcTools = () => { if (pcOn()) PCD.mcp.tools().then(t => { chat.pcTools = t; }).catch(x => { chat.pcTools = []; toast('MCP ในเครื่อง: ' + x.message, 'bad'); }); };
async function pcInit() { if (!PCD) return; chat.pc = await PCD.fs.linked('chat').catch(() => null); chat.screen = await PCD.screen?.state().catch(() => false); pcTools(); modelUI(); }
function pcSheet() {
  sheet('ใช้คอมเครื่องนี้', `<div class="sheet-form"><p class="sheet-msg">AI อ่าน/เขียนไฟล์ รันคำสั่ง และใช้ MCP ในเครื่องนี้ได้ <b>เฉพาะในโฟลเดอร์ที่เลือก</b> · เขียนไฟล์ได้เองในโฟลเดอร์นี้ · รันคำสั่งถามในหน้าต่างของ Windows (เลือก "รันอัตโนมัติ" ได้ คำสั่งลบ/อันตรายยังถามเสมอ)</p>
    <p style="margin:0">${chat.pc ? `โฟลเดอร์: <b>${esc(chat.pc.path)}</b>${chat.pc.auto ? '<br>รันคำสั่งอัตโนมัติ: <b>เปิด</b> (ยกเว้นคำสั่งอันตราย) <button type="button" class="btn out sm" id="pcauto">ปิด</button>' : ''}` : 'ยังไม่ได้เลือกโฟลเดอร์'}</p>
    <div class="row"><button type="button" class="btn blue sm" id="pcpick">${ic('folder', 'sm')} ${chat.pc ? 'เปลี่ยนโฟลเดอร์' : 'เลือกโฟลเดอร์'}</button>${chat.pc ? `<button type="button" class="btn ${pcOn() ? 'red' : 'blue'} sm" id="pctog">${pcOn() ? 'ปิดใช้' : 'เปิดใช้'}</button><button type="button" class="btn out sm" id="pcopen">เปิดโฟลเดอร์</button>` : ''}<button type="button" class="btn out sm" id="pcmcp">${ic('server', 'sm')} MCP ในเครื่อง</button>${PCD.roblox ? `<button type="button" class="btn out sm" id="pcrbx">${ic('play', 'sm')} Roblox Studio</button>` : ''}${PCD.plugins ? `<button type="button" class="btn out sm" id="pcplug">${ic('layers', 'sm')} ปลั๊กอิน</button>` : ''}${PCD.agent?.schedules ? `<button type="button" class="btn out sm" id="pcsch">${ic('bell', 'sm')} งานตั้งเวลา</button>` : ''}</div>
    ${chat.pc && PCD.agent ? `<label class="sw-row"><span class="sw"><input type="checkbox" id="pcag" ${localStorage.getItem('pcAgent') !== '0' ? 'checked' : ''}><span></span></span> <span><b>โหมด Agent</b> · ทำงานเองต่อเนื่องแบบ Claude Code (อ่าน/แก้ไฟล์ รันคำสั่ง ค้นเว็บ จนเสร็จ) · ใช้ลิมิต/Wallet ผ่าน API</span></label>
      <div id="pcagopt" style="display:grid;gap:8px" ${localStorage.getItem('pcAgent') !== '0' ? '' : 'hidden'}><div class="row"><select id="pcagm" style="width:auto">${AG_MODES.map(([k, l]) => `<option value="${k}" ${agMode() === k ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="pcagr" style="width:auto">${[30, 80, 150].map(n => `<option value="${n}" ${(+localStorage.getItem('pcAgentMax') || 80) === n ? 'selected' : ''}>สูงสุด ${n} รอบ</option>`).join('')}</select>
        <select id="pcags" style="width:auto"><option value="code" ${localStorage.getItem('pcAgentStyle') !== 'work' ? 'selected' : ''}>งานโค้ด</option><option value="work" ${localStorage.getItem('pcAgentStyle') === 'work' ? 'selected' : ''}>งานทั่วไป / เอกสาร</option></select><select id="pcagb" style="width:auto">${[0, 5, 20, 50, 100].map(n => `<option value="${n}" ${(+localStorage.getItem('pcAgentBudget') || 0) === n ? 'selected' : ''}>${n ? `เพดาน ฿${n}/งาน` : 'ไม่จำกัดเงินต่องาน'}</option>`).join('')}</select></div>
        <div id="pcpack" class="muted" style="font-size:12.5px"></div>
        <label class="sw-row"><span class="sw"><input type="checkbox" id="pcadv" ${localStorage.getItem('pcAdvisor') !== '0' ? 'checked' : ''}><span></span></span> <span><b>ที่ปรึกษา Opus</b> · วางแผนตอนเริ่ม ช่วยตอนติด ตรวจงานตอนจบ ให้โมเดลระดับกลางพลาดน้อยลง (ใช้ลิมิตเพิ่มเล็กน้อย)</span></label>
        <label class="sw-row"><span class="sw"><input type="checkbox" id="pcmem" ${localStorage.getItem('pcMemory') !== '0' ? 'checked' : ''}><span></span></span> <span><b>ความจำโปรเจกต์</b> · จำบทเรียนจากงานก่อนไว้ใน .kyber/memory.md ใช้ในงานถัดไป</span></label>
        <label class="sw-row"><span class="sw"><input type="checkbox" id="pcagrem" ${localStorage.getItem('pcAgentRemote') === '1' ? 'checked' : ''}><span></span></span> สั่งงานและกดอนุญาตจากมือถือได้ (เปิดแชตเดียวกันในมือถือ)</label>
        <p class="muted" style="margin:0;font-size:12.5px">คำสั่งลัด: ${AG_CMDS.map(c => `<code>/${c[0]}</code>`).join(' ')} · ของโปรเจกต์เอง: ไฟล์ <code>.astra/commands/ชื่อ.md</code> · อ้างไฟล์ด้วย <code>@src/app.js</code> · แปะรูปหน้าจอได้ · พิมพ์แทรกระหว่าง Agent ทำงานได้ (กด Enter) · hook หลังแก้ไฟล์: <code>.astra/hooks.json</code> เช่น <code>{"after_edit":"npx prettier --write {file}"}</code></p></div>` : ''}
    ${chat.pc ? `<label class="sw-row"><span class="sw"><input type="checkbox" id="pcscr" ${chat.screen ? 'checked' : ''}><span></span></span> ให้ AI ดูหน้าจอและคุมเมาส์/คีย์บอร์ด (Windows · ต้องใช้โมเดลที่อ่านรูปได้ · หยุดทันที Ctrl+Alt+Esc)</label>` : ''}</div>`, (d, close) => {
    d.querySelector('#pcadv')?.addEventListener('change', e => localStorage.setItem('pcAdvisor', e.target.checked ? '1' : '0'));
    d.querySelector('#pcmem')?.addEventListener('change', e => localStorage.setItem('pcMemory', e.target.checked ? '1' : '0'));
    d.querySelector('#pcag')?.addEventListener('change', e => { localStorage.setItem('pcAgent', e.target.checked ? '1' : '0'); d.querySelector('#pcagopt').hidden = !e.target.checked; if (e.target.checked) { localStorage.setItem('pc', '1'); if (localStorage.getItem('agTour') !== '1') { close(); agentTour(); } } modelUI(); });
    d.querySelector('#pcagm')?.addEventListener('change', async e => { if (e.target.value === 'yolo' && !await confirmSheet('Agent จะรันทุกคำสั่งโดยไม่ถาม รวมลบไฟล์ ติดตั้งโปรแกรม และแตะไฟล์นอกโฟลเดอร์ ถ้า AI เข้าใจผิด ข้อมูลอาจหายถาวร ใช้กับโฟลเดอร์ที่สำรองไว้แล้วเท่านั้น', { title: 'โหมดไม่ถามอะไรเลย', ok: 'เข้าใจแล้ว เปิดเลย', danger: true })) { e.target.value = agMode(); return; } localStorage.setItem('pcAgentMode', e.target.value); modelUI(); });
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
    const rb = d.querySelector('#pcrbx'); if (rb) rb.onclick = () => { close(); robloxSheet(); };
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
    + optHTML('remote', ic('globe') + 'Connectors ออนไลน์', 'Google, Notion, GitHub ฯลฯ · ใช้ได้ทั้งเว็บและแอป'),
  (d, close) => d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
    close(); const v = b.dataset.v;
    if (v === 'remote') return openConnectors('connectors', 'browse');
    if (!pcOn()) { toast('เลือกโฟลเดอร์งานก่อน แล้วกดปุ่ม ' + (v === 'plug' ? 'ปลั๊กอิน' : 'MCP ในเครื่อง') + ' ในหน้านี้'); return pcSheet(); }
    return v === 'plug' ? pluginSheet() : mcpLocalSheet();
  }));
}
// Roblox Studio ในตัว: ติดตั้งปลั๊กอิน Kyber Studio ครั้งเดียว ไม่ต้องตั้ง MCP · Agent อ่าน/แก้สคริปต์ สร้างชิ้นส่วน และทดสอบเกมได้
async function robloxSheet() {
  const draw = s => `<div class="sheet-form"><p class="sheet-msg">ให้ Agent ทำงานใน Roblox Studio ที่เปิดอยู่: เขียน/แก้สคริปต์ Luau, สร้างแมปและชิ้นส่วน, กดทดสอบแล้วอ่าน Output เพื่อแก้บั๊กเอง · ไม่ต้องตั้ง MCP · แก้อะไรไป Ctrl+Z ใน Studio ย้อนได้</p>
    <div class="row"><span>${s.connected ? `${ic('check', 'sm')} <b>เชื่อมแล้ว</b> · ${esc(s.place || 'Studio')}` : s.installed ? `${ic('clock', 'sm')} ติดตั้งแล้ว · รอ Studio เชื่อม` : `${ic('x', 'sm')} ยังไม่ได้ติดตั้ง`}</span></div>
    ${s.installed ? `<ol class="muted" style="margin:0;padding-left:18px"><li>ปิดแล้วเปิด Roblox Studio ใหม่ และเปิดเกมที่จะทำ</li><li>Studio ถามสิทธิ์ปลั๊กอิน Kyber ให้ต่อ 127.0.0.1 → กด <b>Allow</b></li><li>ปุ่ม Kyber AI บนแถบ Plugins ต้องเป็นสีฟ้า (กดเปิด/ปิดได้)</li><li>สั่ง Agent ในแชตได้เลย เช่น "ทำระบบเงินกับร้านค้าในเกมนี้ แล้วทดสอบให้"</li></ol>` : ''}
    <div class="row"><button type="button" class="btn blue" id="rbi">${s.installed ? 'ติดตั้งใหม่' : 'ติดตั้งปลั๊กอิน Kyber Studio'}</button><button type="button" class="btn out" id="rbr">ตรวจสถานะ</button></div></div>`;
  let s = await PCD.roblox.state().catch(() => ({}));
  sheet('Roblox Studio', draw(s), function bind(d) {
    const redo = async () => { s = await PCD.roblox.state().catch(() => s); d.querySelector('.sheet-b').innerHTML = draw(s); bind(d); };
    d.querySelector('#rbi').onclick = async () => { try { const r = await PCD.roblox.install(); if (r) toast('ติดตั้งแล้ว · เปิด Studio ใหม่แล้วกด Allow', 'ok'); redo(); } catch (x) { toast(x.message, 'bad'); } };
    d.querySelector('#rbr').onclick = redo;
  });
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
  const calls = pcCalls(ai.content), writes = fileBlocks(ai.content);
  const nonScreen = calls.filter(c => !PC_SCREEN.has(c[0]));
  const perLim = Math.min(8000, Math.max(1200, Math.floor(17500 / Math.max(1, nonScreen.length))));
  const cut = s => s.length > perLim ? s.slice(0, Math.floor(perLim * 0.35)) + '\n…(ตัดกลาง)…\n' + s.slice(-Math.floor(perLim * 0.6)) : s;
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
  for (const [k, a] of nonScreen) {
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
  if (out.length > 19500) out = out.slice(0, 19420) + '\n…(ผลรวมยาวเกินเพดาน ตัดบางส่วนออกแล้ว)';
  t.value = out; chat.files = []; chat.images = curModel()?.vision ? imgs.slice(0, IMG_MAX) : []; chat.pcAuto = true;
  const p = send(); [t.value, chat.files, chat.images] = keep; drawThumbs(); return p; // ส่งผลกลับให้ AI ทำต่อ (ข้อความที่ผู้ใช้พิมพ์ค้างไว้ยังอยู่)
}

// ---------- โหมด Agent แบบ Claude Code (แอป Desktop): แอปวนทำงานเองในเครื่องด้วย tool calling ผ่าน /v1 · หน้านี้แสดงขั้นตอนสด และบันทึกคำสั่ง+คำตอบลงแชต ----------
const AG_MODES = [['plan', 'วางแผนก่อน (ยังไม่แก้อะไร)', 'วางแผน'], ['ask', 'ถามก่อนทุกครั้ง', 'ถามก่อน'], ['edits', 'แก้ไฟล์เอง · ถามก่อนรันคำสั่ง', 'แก้ไฟล์เอง'], ['auto', 'ทำเองทั้งหมด (คำสั่งอันตรายยังถาม)', 'ทำเองทั้งหมด'], ['yolo', 'ไม่ถามอะไรเลย ⚠ รวมลบไฟล์/นอกโฟลเดอร์', 'ไม่ถาม ⚠']];
const AG_CMDS = [['review', 'รีวิวโค้ดที่เพิ่งเปลี่ยน (git diff) หาบั๊ก ช่องโหว่ และจุดที่ช้า เรียงตามความรุนแรง พร้อมวิธีแก้ ยังไม่ต้องแก้ไฟล์ $ARGUMENTS'], ['test', 'รันเทสต์ของโปรเจกต์ ถ้าไม่ผ่านให้หาสาเหตุจริงแล้วแก้โค้ดจนผ่าน (ห้ามแก้เทสต์ให้ผ่านเฉยๆ) $ARGUMENTS'], ['fix', 'หาสาเหตุและแก้ปัญหานี้ แล้วตรวจว่าหายจริง: $ARGUMENTS'], ['explain', 'อธิบายโปรเจกต์/โค้ดนี้แบบเข้าใจง่าย: โครงสร้าง ไฟล์สำคัญ และการทำงานหลัก $ARGUMENTS'], ['commit', 'ดู git diff แล้วเขียนข้อความ commit ที่ดี แล้ว commit ให้ $ARGUMENTS'], ['init', 'สำรวจโปรเจกต์แล้วเขียนไฟล์ ASTRA.md สรุปวิธี build/test โครงสร้าง และกติกาโค้ด ให้ Agent รอบหน้าอ่าน $ARGUMENTS']];
// ที่ปรึกษา: โมเดลแรงที่สุดในแพลน (Opus) วางแผนตอนเริ่ม ช่วยตอนติด และตรวจงานตอนจบ · ไม่ใช้เมื่อโมเดลหลักแรงพอแล้ว
const agAdvisor = m => { if (localStorage.getItem('pcAdvisor') === '0' || /opus/i.test(m?.name || '')) return null; const a = me.models.find(x => /opus/i.test(x.name) && !x.locked && !x.wallet && x.provider !== 'image'); return a ? vslug(a) : null; };
const agentOn = () => pcOn() && !!PCD?.agent && localStorage.getItem('pcAgent') !== '0';
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
// โมเดลที่ไม่เหมาะกับงาน Agent (หลายขั้นตอน ใช้เครื่องมือ): รุ่นเล็ก/เร็ว/Uncen มักเรียกเครื่องมือเดิมซ้ำหรือหยุดกลางทาง
const agentWeak = m => /uncen|flash|lite|nano|mini\b/i.test(m?.name || '');
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* โหมดส่วนตัว */ } };
// คืนโมเดลที่จะใช้ (null = ยกเลิก) · แนะนำ Sonnet Eco > Sonnet > Opus Eco ที่แพลนใช้ได้
function agentWeakSheet(m, models, stat = null) {
  const rec = [models.find(x => /sonnet.*eco/i.test(x.name)), models.find(x => /sonnet/i.test(x.name)), models.find(x => /opus.*eco/i.test(x.name))].find(x => x && x.id !== m.id && !chat.agQ?.some(q => q.model === vslug(x)));
  return new Promise(done => {
    let res = null;
    sheet('โมเดลนี้ไม่เหมาะกับงาน Agent', `<p>${stat ? `สถิติ 14 วันล่าสุดจากผู้ใช้ทุกคน: งาน Agent ด้วย ${esc(m.name)} ${esc(stat.reason)} (จาก ${stat.n} งาน)` : `${esc(m.name)} เป็นโมเดลรุ่นเล็ก/เร็ว ใช้ทำงาน Agent (หลายขั้นตอน ใช้เครื่องมือ) แล้วมักทำคำสั่งเดิมวนซ้ำ ตอบไม่จบ หรือแก้ไฟล์พลาด`}</p>
      ${rec ? `<p>แนะนำ <b>${esc(rec.name)}</b> สำหรับงาน Agent</p><button type="button" class="btn blue" data-w="rec">ใช้ ${esc(rec.name)} (แนะนำ)</button>` : '<p>แนะนำเปลี่ยนเป็นโมเดลรุ่นใหญ่ เช่น Claude Sonnet หรือ ChatGPT 6.2</p>'}
      <button type="button" class="btn" data-w="keep">ใช้ ${esc(m.name)} ต่อ</button>
      <label class="row" style="gap:8px;margin-top:6px;font-size:13px"><input type="checkbox" data-w="mute"> ไม่ต้องเตือนสำหรับโมเดลนี้อีก</label>`, (d, close) => {
      d.querySelectorAll('button[data-w]').forEach(b => b.onclick = () => {
        if (d.querySelector('[data-w=mute]')?.checked) lsSet('agWeakOk:' + m.id, '1');
        res = b.dataset.w === 'rec' ? rec : m;
        if (res === rec) { const sel = $('#model'); if (sel) { sel.value = rec.id; lsSet('model', rec.id); modelUI(); } }
        close();
      });
      new MutationObserver((_, o) => { if (!d.isConnected) { o.disconnect(); done(res); } }).observe(document.body, { childList: true }); // ปิดด้วย X / กดนอกกรอบ = ยกเลิก
    });
  });
}
async function agentSend(text0, { mode = agMode() } = {}) {
  const chatModels = me.models.filter(x => !['image', 'embedding'].includes(x.provider) && !x.locked);
  let m = curModel()?.id === 'auto' ? chatModels.find(x => /sonnet.*eco|sonnet/i.test(x.name)) || chatModels[0] : curModel(); // อัตโนมัติ: Agent ใช้ Sonnet (ใช้ tool เก่ง ราคากลาง)
  if (!m || ['image', 'embedding'].includes(m.provider)) return showErr('เลือกโมเดลแชตก่อน (แนะนำ Claude Sonnet / Opus Eco หรือ ChatGPT 6.2)');
  if (chat.agQ === undefined) chat.agQ = await api('/agent/quality').then(d => d.flagged || []).catch(() => []); // โมเดลที่สถิติงาน Agent แย่ (14 วัน จากผู้ใช้ทุกคน)
  const stat = chat.agQ.find(x => x.model === vslug(m));
  if ((agentWeak(m) || stat) && !lsGet('agWeakOk:' + m.id)) { const pick = await agentWeakSheet(m, chatModels, stat); if (!pick) return; m = pick; } // โมเดลเล็ก/Uncen มักวนซ้ำหรือใช้เครื่องมือพลาดในงาน Agent: เตือนก่อนเริ่ม
  const cheap = [...chatModels].sort((a, b) => a.multiplier - b.multiplier).find(x => !/uncen/i.test(x.name)); // ผู้ช่วยค้น (subagent) ใช้โมเดลถูกสุด
  try { if (await PCD.agent.needKey()) await PCD.agent.setKey((await api('/keys', { method: 'POST', body: { name: 'Desktop Agent' } })).key); } // ครั้งแรก: สร้าง API key ของบัญชีนี้ให้แอป (คิดเงินผ่าน /v1 ตามจริง)
  catch (x) { return showErr('สร้าง API key ให้แอปไม่ได้: ' + x.message); }
  const t = $('#t'), images = chat.images.slice(0, IMG_MAX), history = chat.msgs.filter(x => typeof x.content === 'string' && x.content).map(x => ({ role: x.role, content: x.content }));
  if (t.value.trim() === text0) { t.value = ''; t.style.height = 'auto'; } chat.images = []; drawThumbs(); $('#e').textContent = '';
  const user = { role: 'user', content: text0, imgs: images.length ? images : null }; chat.msgs.push(user); appendMsg(user);
  try { const r = await api('/chats/append', { method: 'POST', body: { chat_id: chat.id, title: text0, messages: [{ role: 'user', content: text0 }] } }); if (!chat.id) { chat.id = r.chat_id; setUrl('/chat?id=' + r.chat_id, true); loadSide(); } }
  catch (x) { chat.msgs.pop(); renderAll(); t.value = text0; return showErr('บันทึกแชตไม่ได้: ' + x.message); }
  const text = await agentExpand(text0);
  const ai = { role: 'assistant', content: '', thinking: '', model: m.name + ' · Agent', streaming: true, agent: true, mode, steps: [], todos: null, tin: 0, tout: 0 }; chat.msgs.push(ai); appendMsg(ai);
  const sid = agSid(), t0 = Date.now(), rid = Math.random().toString(36).slice(2, 10); let raf = 0, held = false; // rid = รหัสงานรอบนี้ · held = กำลังหยุดงานเดิมที่ค้าง (ไม่รับเหตุการณ์ของมัน)
  setBusy(true); chat.agentBusy = true; chat.ctrl = { abort: () => PCD.agent.stop(sid) }; // ปุ่มหยุดเดิม = หยุด Agent · Enter = พิมพ์แทรก
  // วาดข้อความ Agent ใหม่ทุกเหตุการณ์ (เครื่องมือ/ค่าใช้จ่าย/ข้อความ) · ช่อง "พิมพ์คำตอบ" ต้องคงข้อความ โฟกัส และตำแหน่งเคอร์เซอร์ไว้ (เดิมถูกสร้างใหม่ทุกครั้ง พิมพ์ไม่ติด)
  const paint = () => { if (raf) return; raf = requestAnimationFrame(() => {
    raf = 0; const box = $('#msgs'), el = box?.lastElementChild, stick = box && nearBottom(box) && !el?.querySelector('.agask input:focus'); if (!el) return;
    const inp = el.querySelector('.agask input'), keep = inp && { v: inp.value, f: document.activeElement === inp, a: inp.selectionStart, b: inp.selectionEnd };
    el.outerHTML = msgHTML(ai, chat.msgs.length - 1);
    const n = keep && box.lastElementChild?.querySelector('.agask input');
    if (n) { n.value = keep.v; if (keep.f) { n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.a, keep.b); } catch { /* ช่องชนิดนี้ไม่มีเคอร์เซอร์ */ } } }
    if (stick) box.scrollTop = box.scrollHeight;
  }); };
  agSub?.(); agSub = PCD.agent.onEvent(d => {
    if (d.sid !== sid || held || (d.rid && d.rid !== rid)) return; // เหตุการณ์ของงานเดิม (แอปรุ่นใหม่ส่ง rid มาด้วย)
    if (d.type === 'delta') { ai.content += d.text; if (d.text.includes('[[uf:')) ufLive(ai.content); }
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
  const run = () => PCD.agent.run({ sid, rid, chatId: chat.id, text, images, style: localStorage.getItem('pcAgentStyle') === 'work' ? 'work' : 'code', model: vslug(m), subModel: cheap ? vslug(cheap) : null, mode, effort: m.effort !== 'none' ? $('#effort')?.value || null : null, budget: +localStorage.getItem('pcAgentBudget') || 0, remote: localStorage.getItem('pcAgentRemote') === '1', maxRounds: +localStorage.getItem('pcAgentMax') || 80, slot: 'chat', history, advisor: agAdvisor(m), memory: localStorage.getItem('pcMemory') !== '0' });
  try { await run(); }
  catch (x) {
    // แอปรุ่นเก่า: งานเดิมยังวิ่งอยู่ในแอปแต่หน้าเว็บไม่รู้ (รีเฟรช/เปิดแชตใหม่/งานค้าง) → หยุดงานเดิมแล้วส่งใหม่ให้เอง 1 ครั้ง แทนการตอบ "กำลังทำงานอยู่" ทุกข้อความ
    if (/กำลังทำงานอยู่ในแชตนี้/.test(x.message)) {
      held = true; ai.steps.push({ name: 'info', text: 'หยุดงาน Agent เดิมที่ค้างอยู่ แล้วเริ่มงานนี้ใหม่…' }); paint();
      await PCD.agent.stop(sid).catch(() => {}); await new Promise(r => setTimeout(r, 2500)); held = false;
      try { await run(); } catch (y) { ai.error = /กำลังทำงานอยู่ในแชตนี้/.test(y.message) ? 'Agent งานเดิมยังค้างอยู่ในแอป: ปิดแอปจากไอคอนที่ถาด (ออกจากแอป) แล้วเปิดใหม่' : String(y.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    } else ai.error = String(x.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
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
      const msg = await promptSheet('ข้อความ commit', (chat.msgs.findLast(m => m.role === 'user')?.content || 'Kyber Agent').split('\n')[0].slice(0, 70), { title: 'Commit', ok: 'Commit' }); if (!msg) return;
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
  sheet('Workspace instructions & files', `<form id="fdf" class="sheet-form" style="display:grid;gap:8px">
    <label>Name</label><input name="name" value="${esc(f.name)}" maxlength="40" required>
    <label>Instructions for every chat in this workspace</label><textarea name="ins" rows="4" maxlength="4000" placeholder="เช่น ตอบในฐานะผู้ช่วยร้านกาแฟ ใช้ราคาจากเอกสารที่แนบ ตอบสั้นและสุภาพ">${esc(f.instructions || '')}</textarea>
    <label>Reference files · คลังความรู้ (up to 20 files, 600,000 characters · แชร์ Workspace ให้ทีมได้)</label><div id="fdl" style="display:grid;gap:4px">${list()}</div>
    <label class="btn out sm" style="justify-self:start">${ic('clip', 'sm')} Add files<input type="file" id="fdi" multiple hidden></label>
    <p class="muted" style="font-size:12px;margin:0">AI เห็นคำสั่งและเอกสารนี้ทุกครั้งที่คุยในแชตของโฟลเดอร์ ยิ่งเอกสารยาว แต่ละข้อความยิ่งใช้ลิมิตมากขึ้น</p>
    <button class="btn blue">Save</button></form>`, (d, close) => {
    const redraw = () => { d.querySelector('#fdl').innerHTML = list(); d.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rmf, 1); redraw(); }); };
    redraw();
    d.querySelector('#fdi').onchange = async e => { for (const x of e.target.files) { if (files.length >= 20) break; try { files.push({ name: x.name.replace(/[\[\]\r\n]/g, '').slice(0, 120), text: await readFile(x) }); } catch (er) { toast(`${x.name}: ${er.message}`, 'bad'); } } e.target.value = ''; redraw(); };
    d.querySelector('#fdf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      try { await api('/folders/' + id, { method: 'PUT', body: { name: fd.get('name'), instructions: fd.get('ins'), files: files.map(x => x.text != null ? x : { name: x.name }) } }); toast('Saved', 'ok'); close(); loadSide(); } catch (x) { toast(x.message, 'bad'); }
    };
  });
}

// ---------- tools ของแชต: ไฟล์ให้ดาวน์โหลด [[dl:ชื่อ|base64]] และรัน Python [[py:base64]] (เซิร์ฟเวอร์ใส่ไว้ในคำตอบ) ----------
const DL_RE = /\[\[dl:([^|\]\n]{1,120})\|([A-Za-z0-9+/=]+)\]\]/g, PY_RE = /\[\[py:([A-Za-z0-9+/=]+)\]\]/g, PY_RES = '[ผลรัน Python]', PY_MAX = 4;
const unb64t = b => { try { return new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0))); } catch { return ''; } };
function parseTools(content) {
  const files = [], py = [];
  const mems = [], approves = [], arts = [];
  const text = String(content || '').replace(ART_RE, (_, id, v, t) => { arts.push({ id: +id, v: +v, t }); return ''; }).replace(UF_RE, '').replace(VID_RE, '').replace(DL_RE, (_, name, b) => { files.push({ name, b }); return ''; }).replace(PY_RE, (_, b) => { py.push(unb64t(b)); return ''; }).replace(MEM_MARK, (_, id, t) => { mems.push({ id, t }); return ''; }).replace(APPROVE_RE, (_, id, label) => { approves.push({ id: +id, label }); return ''; });
  return { text, files, py, mems, approves, arts };
}
function toolCards(m, i, files, py, asks = []) {
  if (!files.length && !py.length && !m.pyOut && !asks.length) return '';
  const fileBtn = (f, k) => `<button type="button" class="dl-card" data-dl="${i}:${k}">${ic('download', 'sm')}<span><b>${esc(f.name)}</b><small>${{ xlsx: 'Excel', csv: 'CSV', docx: 'Word', pdf: 'PDF (พิมพ์/บันทึก)', md: 'Markdown', txt: 'ข้อความ', html: 'HTML', json: 'JSON' }[f.name.split('.').pop().toLowerCase()] || 'ไฟล์'} · กดเพื่อดาวน์โหลด</small></span></button>`;
  const pyBox = code => `<details class="pyrun"><summary>${ic('terminal', 'sm')} Python ${m.pyOut ? '' : '· กำลังรอรัน'}</summary><pre><code>${esc(code)}</code></pre></details>`;
  const out = m.pyOut ? `<div class="pyout"><pre>${esc(m.pyOut.text)}</pre>${m.pyOut.imgs.map(d => `<img src="${d}" alt="กราฟจาก Python">`).join('')}</div>` : '';
  return `<div class="tool-cards">${files.map(fileBtn).join('')}${py.map(pyBox).join('')}${out}${asks.map(a => approveHTML(a, i)).join('')}</div>`;
}
// สร้างไฟล์ในเบราว์เซอร์: Excel ด้วย SheetJS, Word = HTML เปิดใน Word (.doc), PDF = หน้าพิมพ์ (บันทึกเป็น PDF), ที่เหลือเป็นข้อความ
async function makeFile(name, content) {
  const ext = name.split('.').pop().toLowerCase(), save = (blob, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  if (ext === 'xlsx') try { let j = null; try { j = JSON.parse(content); } catch {} return await bookXlsx(Array.isArray(j?.sheets) ? j : { sheets: [{ name: 'Sheet1', rows: content.split(/\r?\n/).filter(Boolean).map(l => l.split(',')) }] }, name); } catch { /* โหลดตัวเขียนไม่ได้: ใช้แบบเดิม */ }
  if (ext === 'docx') try { return await mdDocx(content, name); } catch {}
  if (ext === 'pptx') return mdPptx(content, name);
  if (ext === 'pdf') try { return await mdPdf(content, name); } catch { /* ใช้หน้าพิมพ์แทน */ }
  if (ext === 'xlsx') {
    await lib('xlsx'); let wb = null;
    try { const j = JSON.parse(content); if (Array.isArray(j?.sheets)) { wb = XLSX.utils.book_new(); j.sheets.forEach((sh, k) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.isArray(sh.rows) ? sh.rows : []), String(sh.name || 'Sheet' + (k + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))); } } catch { /* ไม่ใช่ JSON: อ่านเป็น CSV */ }
    return XLSX.writeFile(wb || XLSX.read(content, { type: 'string' }), name);
  }
  if (ext === 'docx' || ext === 'pdf') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)}</title><style>body{font-family:Tahoma,'Sarabun','TH Sarabun New',sans-serif;font-size:12pt;line-height:1.6;margin:24px;color:#111}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #999;padding:4px 8px}pre{white-space:pre-wrap}</style></head><body>${md(content)}</body></html>`;
    if (ext === 'docx') return save(new Blob(['﻿' + html], { type: 'application/msword' }), name.replace(/\.docx$/i, '.doc')); // Word เปิด HTML .doc ได้ตรง ๆ
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.append(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { toast('เปิดหน้าพิมพ์ไม่ได้', 'bad'); } setTimeout(() => f.remove(), 60e3); }, 300);
    return;
  }
  save(new Blob([ext === 'csv' ? '﻿' + content : content], { type: (MIME[ext] || 'text/plain') + ';charset=utf-8' }), name);
}
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-dl]'); if (!b) return;
  const [i, k] = b.dataset.dl.split(':').map(Number), f = parseTools(chat.msgs[i]?.content).files[k]; if (!f) return;
  try { await makeFile(f.name, unb64t(f.b)); } catch (x) { toast('สร้างไฟล์ไม่สำเร็จ: ' + x.message, 'bad'); }
});
// รัน Python ที่ AI ส่งมาในเบราว์เซอร์ (Pyodide ใน Web Worker · ไฟล์ที่แนบในแชตอยู่ที่ /data/) แล้วส่งผลกลับให้ AI ทำต่อ
// ไฟล์ที่ Python เขียนลง /out/: Excel/CSV → ตาราง, Markdown/ข้อความ → เอกสาร · เก็บเข้าบัญชี (ผูกกับแชตนี้ = โฟลเดอร์งาน)
async function pyOutSave(outs) {
  const res = [];
  for (const o of outs || []) {
    try {
      let kind = 'doc', data, name = o.name;
      if (/\.(xlsx|xls|csv)$/i.test(name)) { await lib('xlsx'); const wb = /\.csv$/i.test(name) ? XLSX.read(new TextDecoder().decode(o.bytes), { type: 'string' }) : XLSX.read(o.bytes); kind = 'sheet'; data = wbBook(wb); name = name.replace(/\.(xls|csv)$/i, '.xlsx'); }
      else if (/\.(md|txt|json|html?)$/i.test(name)) data = { md: new TextDecoder().decode(o.bytes).slice(0, 1e6) };
      else continue; // รูปแสดงในผลลัพธ์อยู่แล้ว · ไฟล์ชนิดอื่นยังไม่รองรับ
      const id = await ufUpload(name, kind, data); if (id) { res.push({ id, name }); openFile(id, 0, true); }
    } catch { /* ไฟล์อ่านไม่ได้: ข้าม */ }
  }
  return res;
}
// รัน Python บนเครื่องคลาวด์ (ต่อเน็ตได้ · ติดตั้งแพ็กเกจที่ขาดให้เอง) · ไม่ได้ (แพลนฟรี/เครื่องไม่พร้อม/ครบโควตา) = null แล้วรันในเบราว์เซอร์แทน
let pyCloudOff = false;
async function pyCloud(files, main) {
  if (pyCloudOff || window.DEMO) return null;
  try {
    const r = await fetch('/api/py/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files, main }), signal: AbortSignal.timeout(150e3) });
    if (!r.ok) { if (r.status === 402 || r.status === 503) pyCloudOff = true; return null; }
    const d = await r.json(); if (typeof d.out !== 'string') return null;
    return { out: d.out, imgs: d.imgs || [], outs: (d.outs || []).map(o => ({ name: o.name, bytes: Uint8Array.from(atob(o.b64), c => c.charCodeAt(0)) })), cloud: true };
  } catch { return null; }
}
async function pyRun(ai) {
  chat.pyRound = (chat.pyRound || 0) + 1; if (chat.pyRound > PY_MAX) return showErr(`AI รัน Python ครบ ${PY_MAX} รอบแล้ว พิมพ์สั่งต่อได้เลย`);
  const code = parseTools(ai.content).py.at(-1); if (!code) return;
  const files = chat.msgs.filter(m => m.role === 'user').flatMap(m => [...m.content.matchAll(FILE_RE)].map(x => ({ path: '/data/' + x[1].replace(/[\\/]/g, '_'), content: x[2] })));
  ai.pyOut = { text: 'กำลังรัน Python บนคลาวด์…', imgs: [] }; renderAll(); setBusy(true);
  const res = await pyCloud([...files, { path: 'main.py', content: code }], 'main.py') || await new Promise(ok => {
    ai.pyOut.text = 'กำลังรัน Python ในเบราว์เซอร์…'; renderAll();
    let out = ''; const imgs = [], outs = [], w = new Worker('/pyworker.js');
    const end = extra => { clearTimeout(t); w.terminate(); ok({ out: out + (extra || ''), imgs, outs }); }, t = setTimeout(() => end('\n[หยุด: รันนานเกิน 90 วินาที]'), 90e3);
    w.onmessage = e => { const d = e.data; if (d.outFile) outs.push(d.outFile); if (d.out != null) out += d.out + '\n'; if (d.err) out += d.err + '\n'; if (d.img) imgs.push(d.img.startsWith('data:') ? d.img : 'data:image/png;base64,' + d.img); if (d.status) { ai.pyOut.text = d.status; renderAll(); } if (d.done) end(); };
    w.onerror = e => end('\nError: ' + (e.message || 'โหลด Python ไม่สำเร็จ'));
    w.postMessage({ files: [...files, { path: 'main.py', content: code }], main: 'main.py' });
  });
  setBusy(false);
  const saved = await pyOutSave(res.outs); if (saved.length) res.out += '\n' + saved.map(s => `[saved to the task folder: ${s.name} file_id=${s.id}]`).join('\n');
  const text = res.out.trim() || '(ไม่มีผลลัพธ์ที่พิมพ์ออกมา)', cut = s => s.length > 8000 ? s.slice(0, 2500) + '\n…(ตัดกลาง)…\n' + s.slice(-5000) : s, vision = !!curModel()?.vision;
  ai.pyOut = { text, imgs: res.imgs }; renderAll();
  const t = $('#t'), keep = [t.value, chat.files, chat.images];
  t.value = PY_RES + '\n' + cut(text) + (res.imgs.length ? `\n[สร้างกราฟ ${res.imgs.length} รูป${vision ? ' แนบมาด้วย' : ' (แสดงให้ผู้ใช้แล้ว โมเดลนี้อ่านรูปไม่ได้)'}]` : '');
  chat.files = []; chat.images = vision ? res.imgs.slice(0, 2) : []; chat.pyAuto = true;
  const p = send(); [t.value, chat.files, chat.images] = keep; drawThumbs(); return p;
}

// ---------- ขนาดภาพที่สร้าง: จัตุรัส / แนวนอน / แนวตั้ง (จำไว้ต่อเครื่อง · ใช้ทั้งโหมดสร้างภาพและรูปที่ AI สร้างในแชต) ----------
const IMG_SIZES = { sq: ['1024x1024', 'จัตุรัส 1:1'], land: ['1536x1024', 'แนวนอน 3:2'], port: ['1024x1536', 'แนวตั้ง 2:3'] };
const imgSize = () => { try { const v = localStorage.getItem('imgSize'); return IMG_SIZES[v] ? v : 'sq'; } catch { return 'sq'; } };
function imgSizeSheet() {
  sheet('ขนาดภาพ', Object.entries(IMG_SIZES).map(([k, [px, label]]) => optHTML(k, ic('image') + label, px + ' พิกเซล' + (k === 'land' ? ' · เหมาะกับปก แบนเนอร์' : k === 'port' ? ' · เหมาะกับสตอรี่ โปสเตอร์' : ' · เหมาะกับโพสต์ โลโก้'), imgSize() === k)).join(''), (d, close) => {
    d.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { try { localStorage.setItem('imgSize', b.dataset.v); } catch { /* ไม่มีที่เก็บ */ } close(); modelUI(); toast('ขนาดภาพ: ' + IMG_SIZES[b.dataset.v][1], 'ok'); });
  });
}
// ---------- Connectors ในแชต: เปิด/ปิดชั่วคราว (จำไว้ต่อเครื่อง) · ขออนุญาตเฉพาะเครื่องมือที่ผู้ใช้ตั้ง "ถามก่อน" ----------
const mcpOff = () => { try { return JSON.parse(localStorage.getItem('mcpOff') || '[]').filter(Number.isInteger); } catch { return []; } };
async function connInChat() {
  const d = await api('/connectors').catch(x => { toast(x.message, 'bad'); return null; }); if (!d) return;
  const off = new Set(mcpOff()), list = d.mine.filter(x => x.enabled && (x.auto || chat.mcps.includes(x.id)));
  sheet('Connectors ในแชตนี้', `<div class="sheet-form">${list.length ? list.map(x => `<label class="tg"><input type="checkbox" data-cn="${x.id}" ${off.has(x.id) ? '' : 'checked'}><span><b>${esc(x.name)}</b><small class="muted">${x.tools.length} เครื่องมือ${x.status === 'error' ? ' · <span class="bad">ต้องเชื่อมใหม่</span>' : ''}</small></span></label>`).join('')
      : '<p class="sheet-msg">ยังไม่ได้เชื่อมต่อบริการไหน เชื่อม Google, Notion, GitHub ฯลฯ แล้ว AI ใช้ได้ทุกแชต</p>'}
    <button type="button" class="btn ${list.length ? 'out' : 'blue'}" data-manage>${ic('layers', 'sm')} ${list.length ? 'จัดการ / เพิ่ม Connectors' : 'เลือก Connectors'}</button>${PCD ? `<button type="button" class="btn out" data-pc>${ic('server', 'sm')} ปลั๊กอินและ MCP ในเครื่อง</button>` : ''}</div>`, (dd, close) => {
    dd.querySelectorAll('[data-cn]').forEach(b => b.onchange = () => { const id = +b.dataset.cn, s = new Set(mcpOff()); b.checked ? s.delete(id) : s.add(id); localStorage.setItem('mcpOff', JSON.stringify([...s])); modelUI(); });
    dd.querySelector('[data-manage]').onclick = () => { close(); openConnectors('connectors', list.length ? 'mine' : 'browse'); };
    dd.querySelector('[data-pc]')?.addEventListener('click', () => { close(); mcpHub(); });
  });
}
const APPROVE_RE = /\[\[approve:(\d+)\|([^\]\n]{1,120})\]\]/g, APPR = new Map(), APPR_RES = '[ผลจากเครื่องมือที่อนุญาต]';
function approveHTML(a) {
  const st = APPR.get(a.id); if (!st) { api('/connectors/approve/' + a.id).then(v => { APPR.set(a.id, v); renderAll(); }).catch(() => { APPR.set(a.id, { status: 'gone' }); renderAll(); }); }
  const v = st || { status: 'loading' }, args = v.args ? Object.entries(v.args).slice(0, 6).map(([k, x]) => `<div><span class="muted">${esc(k)}</span> ${esc(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300)}</div>`).join('') : '';
  const body = v.status === 'pending' ? `<div class="ap-args">${args || '<span class="muted">ไม่มีรายละเอียด</span>'}</div><div class="ap-btns"><button type="button" class="btn blue sm" data-appr="${a.id}" data-d="once">อนุญาตครั้งนี้</button><button type="button" class="btn out sm" data-appr="${a.id}" data-d="always">อนุญาตเสมอ</button><button type="button" class="btn out sm" data-appr="${a.id}" data-d="deny">ไม่อนุญาต</button></div>`
    : `<div class="muted">${{ loading: 'กำลังโหลด…', running: 'กำลังทำ…', done: '✓ ทำแล้ว ส่งผลให้ AI แล้ว', denied: 'ไม่อนุญาต', failed: 'ทำไม่สำเร็จ', expired: 'หมดเวลา', gone: 'คำขอนี้ไม่มีแล้ว' }[v.status] || esc(v.status)}</div>`;
  return `<div class="approve ${v.status}"><div class="ap-h">${ic(v.status === 'pending' ? 'hand' : v.status === 'done' ? 'check' : 'alert', 'sm')}<b>AI ขอใช้ ${esc(a.label)}</b></div>${body}</div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-appr]'); if (!b || chat.busy) return;
  const id = +b.dataset.appr, dec = b.dataset.d; b.closest('.ap-btns').querySelectorAll('button').forEach(x => x.disabled = true);
  try {
    const v = await api('/connectors/approve/' + id, { method: 'POST', body: { decision: dec } }); APPR.set(id, v); renderAll();
    if (dec === 'deny') return;
    const t = $('#t'), keep = [t.value, chat.files, chat.images]; // ผลกลับไปให้ AI ทำต่อ (แบบเดียวกับผลรัน Python)
    t.value = `${APPR_RES}\n${v.server} · ${v.tool}\n${String(v.result || '').slice(0, 8000)}`; chat.files = []; chat.images = []; chat.pyAuto = true;
    const p = send(); [t.value, chat.files, chat.images] = keep; drawThumbs(); await p;
  } catch (x) { toast(x.message, 'bad'); APPR.delete(id); renderAll(); }
});
// ---------- ความจำที่บันทึกอัตโนมัติ [[mem:id|ข้อความ]]: แสดง "จำแล้ว" + ปุ่มยกเลิก ----------
const ART_RE = /\[\[art:(\d+)\|(\d+)\|([^\]\n]{0,120})\]\]/g;
// ---------- Artifact: เปิดในแผงข้าง (คอม) / เต็มจอ (มือถือ) · เวอร์ชัน · แชร์ลิงก์ ----------
async function openArtifact(id, v) {
  const cv = $('#canvas'); if (!cv) return;
  let a; try { a = await api('/artifacts/' + id + (v ? '?v=' + v : '')); } catch (x) { return toast(x.message, 'bad'); }
  chat.art = a; chat.artV = v || a.ver; chat.cvCode = a.html;
  cv.hidden = false; cv.classList.add('is-art'); cv.classList.remove('is-file'); if ($('#cv-s')) $('#cv-s').hidden = true; chat.uf = null;
  if (chat.cvMsg) { removeEventListener('message', chat.cvMsg); chat.cvMsg = null; }
  $('#cv-t').textContent = a.title;
  $('#cv-v').innerHTML = a.versions.map(x => `<option value="${x.ver}" ${x.ver === chat.artV ? 'selected' : ''}>v${x.ver}</option>`).join(''); $('#cv-v').hidden = a.versions.length < 2;
  $('#cv-sh').hidden = false; $('#cv-sh').classList.toggle('on', !!a.share_token);
  app.querySelectorAll('[data-cv]').forEach(x => x.classList.toggle('on', x.dataset.cv === 'prev'));
  $('#cv-f').hidden = false; $('#cv-c').hidden = true; $('#cv-c code').innerHTML = hlCode(a.html); $('#cv-stage').hidden = false; $('#cv-dev').hidden = false; devWatch();
  $('#cv-f').src = window.DEMO ? 'about:blank' : `/api/artifacts/${id}/raw?v=${chat.artV}`; if (window.DEMO) $('#cv-f').srcdoc = a.html;
}
function artShare() {
  const a = chat.art; if (!a) return;
  const link = a.share_token ? location.origin + '/a/' + a.share_token : '';
  sheet('แชร์ Artifact', `<div class="sheet-form">
    <p class="sheet-msg">${a.share_token ? 'ทุกคนที่มีลิงก์นี้เปิดดูได้ (ไม่ต้องล็อกอิน)' : 'ตอนนี้เป็นส่วนตัว เห็นแค่คุณ'}</p>
    ${link ? `<div class="row"><input id="ashl" readonly value="${esc(link)}"><button type="button" class="btn out sm" id="ashc">คัดลอก</button></div>` : ''}
    <label class="sw-row"><span class="sw"><input type="checkbox" id="ashg" ${a.gallery ? 'checked' : ''}><span></span></span> แสดงในแกลเลอรีสาธารณะ (/gallery)</label>
    <label>เวอร์ชันที่แชร์<select id="ashv"><option value="">ล่าสุดเสมอ</option>${a.versions.map(x => `<option value="${x.ver}" ${a.share_ver === x.ver ? 'selected' : ''}>ล็อกไว้ที่ v${x.ver}</option>`).join('')}</select></label>
    <button type="button" class="btn blue" id="asho">${a.share_token ? 'บันทึก' : 'เปิดลิงก์แชร์'}</button>
    ${a.share_token ? '<button type="button" class="btn out" id="ashx">ปิดการแชร์</button>' : ''}
    <button type="button" class="btn out" id="ashw">${ic('globe', 'sm')} เผยแพร่เป็นเว็บจริง (ชื่อเว็บของคุณเอง)</button>
    <small class="muted">หน้าที่แชร์รันแยกจากบัญชีของคุณ และไม่ขึ้นใน Google</small></div>`, (d, close) => {
    const go = async on => { try { const r = await api(`/artifacts/${a.id}/share`, { method: 'POST', body: { on, ver: +d.querySelector('#ashv').value || null, gallery: d.querySelector('#ashg').checked } }); a.gallery = !!r.gallery; a.share_token = r.share_token; a.share_ver = r.share_ver ?? null; $('#cv-sh').classList.toggle('on', !!a.share_token); close(); if (on) { copy(location.origin + '/a/' + r.share_token); toast('คัดลอกลิงก์แล้ว', 'ok'); } else toast('ปิดการแชร์แล้ว ลิงก์เดิมใช้ไม่ได้'); } catch (x) { toast(x.message, 'bad'); } };
    d.querySelector('#asho').onclick = () => go(true);
    const x = d.querySelector('#ashx'); if (x) x.onclick = () => go(false);
    const c = d.querySelector('#ashc'); if (c) c.onclick = e => copy(link, e.target);
    d.querySelector('#ashw').onclick = () => { close(); sitePublish({ src: 'artifact', src_id: a.id, title: a.title }); };
  });
}
document.addEventListener('click', e => { const b = e.target.closest?.('[data-art]'); if (b) openArtifact(+b.dataset.art); });
const MEM_MARK = /\[\[mem:(\d+)\|([^\]\n]{1,300})\]\]/g;
document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-unmem]'); if (!b) return;
  try { await api('/memories/' + b.dataset.unmem, { method: 'DELETE' }); b.closest('.mem-saved').innerHTML = `${ic('x', 'sm')}<span>ยกเลิกความจำนี้แล้ว</span>`; toast('ลบความจำแล้ว', 'ok'); } catch (x) { toast(x.message, 'bad'); }
});
// ---------- ไฟล์ในบัญชี (แบบ Kyber Harness): Excel/Word ที่ AI สร้างหรือแก้ เปิดข้างแชตและอัปเดตสดทุกครั้งที่ AI แก้ [[uf:id|ver|ชื่อ]] ----------
ICONS.sheet ||= '';
const UF_RE = /\[\[uf:(\d+)\|(\d+)\|([^\]\n]{0,120})\]\]/g;
const ufKind = n => /\.(xlsx|xlsm|xls|ods|csv)$/i.test(n) ? 'sheet' : 'doc';
const ufType = n => (/\.(\w+)$/.exec(n)?.[1] || '').toLowerCase(), ufLabel = n => ({ xlsx: 'Excel', xls: 'Excel', csv: 'Excel', pptx: 'PowerPoint', pdf: 'PDF' })[ufType(n)] || 'Word';
const ufIcon = n => ufKind(n) === 'sheet' ? 'sheet' : ufType(n) === 'pptx' ? 'layers' : 'filetext';
async function ufDownload(f) { const x = ufType(f.name); return f.kind === 'sheet' ? bookXlsx(f.data, f.name) : x === 'pptx' ? mdPptx(f.data.md || '', f.name) : x === 'pdf' ? mdPdf(f.data.md || '', f.name) : mdDocx(f.data.md || '', f.name); }
const ufCards = content => { const seen = new Map(); for (const m of String(content || '').matchAll(UF_RE)) seen.set(m[1], { id: +m[1], v: +m[2], t: m[3] }); // ไฟล์เดียวแก้หลายรอบ: การ์ดเดียว (เวอร์ชันล่าสุด)
  return [...seen.values()].map(f => `<button type="button" class="art-card uf-card" data-uf="${f.id}">${ic(ufIcon(f.t), 'sm')}<span><b>${esc(f.t)}</b><small>${ufLabel(f.t)} · v${f.v} · เปิดดู / แก้ไข / ดาวน์โหลด</small></span></button>`).join(''); };
document.addEventListener('click', e => { const b = e.target.closest?.('[data-uf]'); if (b) openFile(+b.dataset.uf); });
// ตอน AI กำลังตอบ: เจอเวอร์ชันใหม่ของไฟล์ → เปิด/รีเฟรชแผงข้างแชตทันที
function ufLive(content) {
  const all = [...String(content || '').matchAll(UF_RE)], last = all.at(-1); if (!last) return;
  const key = last[1] + ':' + last[2]; if (chat.ufSeen === key) return; chat.ufSeen = key;
  openFile(+last[1], 0, true);
}
// สูตรแบบง่ายสำหรับแสดงผลในหน้าเว็บ (Excel คำนวณจริงอีกรอบตอนเปิดไฟล์) · คำนวณไม่ได้แสดงสูตรแทน
const UF_FN = {
  SUM: (...a) => a.flat(9).reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0),
  AVERAGE: (...a) => { const n = a.flat(9).filter(x => typeof x === 'number'); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; },
  MIN: (...a) => Math.min(...a.flat(9).filter(x => typeof x === 'number')), MAX: (...a) => Math.max(...a.flat(9).filter(x => typeof x === 'number')),
  COUNT: (...a) => a.flat(9).filter(x => typeof x === 'number').length, COUNTA: (...a) => a.flat(9).filter(x => x !== '' && x != null).length,
  ROUND: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d, ABS: Math.abs, IF: (c, a, b = false) => c ? a : b, AND: (...a) => a.flat(9).every(Boolean), OR: (...a) => a.flat(9).some(Boolean),
  CONCAT: (...a) => a.flat(9).join(''), CONCATENATE: (...a) => a.flat(9).join(''), UPPER: s => String(s).toUpperCase(), LOWER: s => String(s).toLowerCase(), LEN: s => String(s).length,
  SUMIF: (r, c, s) => { const R = r.flat(), S = (s || r).flat(), t = ufCrit(c); return R.reduce((n, x, i) => n + (t(x) && typeof S[i] === 'number' ? S[i] : 0), 0); },
  COUNTIF: (r, c) => { const t = ufCrit(c); return r.flat().filter(t).length; }, IFERROR: (a, b) => a, TODAY: () => new Date().toLocaleDateString(LOC),
};
const ufCrit = c => { const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(String(c)), op = m[1] || '=', v = m[2] !== '' && !isNaN(m[2]) ? +m[2] : m[2];
  return x => op === '=' ? x == v : op === '<>' ? x != v : op === '<' ? x < v : op === '>' ? x > v : op === '<=' ? x <= v : x >= v; };
function ufEval(rows) {
  const memo = new Map(), busy = new Set(), A = s => { let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
  const V = (c, r) => { const k = r + ':' + c; if (memo.has(k)) return memo.get(k); const raw = rows[r]?.[c] ?? ''; if (typeof raw !== 'string' || raw[0] !== '=') return raw === '' ? '' : raw;
    if (busy.has(k)) return '#CYCLE'; busy.add(k); let out; try { out = calc(raw.slice(1)); } catch { out = raw; } busy.delete(k); memo.set(k, out); return out; };
  // แปลงสูตรด้วยตัวแยกคำ + ลำดับความสำคัญแบบ Excel (ไม่ใช้ Function/eval: หน้าเว็บบังคับ CSP และสูตรมาจากไฟล์ที่ใครก็ทำได้)
  const TOK = /\s*(?:([A-Z][A-Z0-9.]*)(?=\s*\()|(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_])|(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)|"((?:[^"]|"")*)"|(TRUE|FALSE)\b|(<=|>=|<>|[-+*/^&=<>(),%]))/y;
  const cell = t => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(t); return [A(m[1]), m[2] - 1]; };
  const range = (a, b) => { const [c1, r1] = cell(a), [c2, r2] = cell(b), o = []; for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) { const row = []; for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) row.push(V(c, r)); o.push(row); } return o; };
  const calc = f => {
    const toks = []; TOK.lastIndex = 0; let m;
    while (TOK.lastIndex < f.length && (m = TOK.exec(f))) toks.push(m);
    if (TOK.lastIndex < f.trimEnd().length) throw 0; // มีตัวอักษรที่ไม่รู้จัก: แสดงสูตรแทน
    let k = 0; const peek = () => toks[k]?.[7], eat = op => { if (peek() !== op) throw 0; k++; };
    const num = v => typeof v === 'number' ? v : typeof v === 'boolean' ? +v : v === '' ? 0 : isNaN(v) ? (() => { throw 0; })() : +v;
    const bin = (next, ops, fn) => () => { let a = next(); while (ops.includes(peek())) { const op = toks[k++][7]; a = fn(op, a, next()); } return a; };
    const primary = () => {
      const t = toks[k++]; if (!t) throw 0;
      if (t[1]) { const fn = UF_FN[t[1]]; if (!fn) throw 0; eat('('); const args = []; if (peek() !== ')') { args.push(expr()); while (peek() === ',') { k++; args.push(expr()); } } eat(')'); return fn(...args); }
      if (t[2]) return t[3] ? range(t[2], t[3]) : V(...cell(t[2]));
      if (t[4] != null) return +t[4];
      if (t[5] != null) return t[5].replace(/""/g, '"');
      if (t[6]) return t[6] === 'TRUE';
      if (t[7] === '(') { const v = expr(); eat(')'); return v; }
      throw 0;
    };
    const unary = () => { if (peek() === '-') { k++; return -num(unary()); } if (peek() === '+') { k++; return num(unary()); } let v = primary(); while (peek() === '%') { k++; v = num(v) / 100; } return v; };
    const pow = bin(unary, ['^'], (_, a, b) => num(a) ** num(b));
    const mul = bin(pow, ['*', '/'], (op, a, b) => op === '*' ? num(a) * num(b) : num(a) / num(b));
    const add = bin(mul, ['+', '-'], (op, a, b) => op === '+' ? num(a) + num(b) : num(a) - num(b));
    const cat = bin(add, ['&'], (_, a, b) => String(a) + String(b));
    const CMP = { '=': (a, b) => a == b, '<>': (a, b) => a != b, '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b }; // eslint-disable-line eqeqeq
    const expr = bin(cat, Object.keys(CMP), (op, a, b) => CMP[op](a, b));
    const v = expr(); if (k !== toks.length) throw 0; return v;
  };
  return V;
}
const ufFmt = (v, f) => { if (typeof v !== 'number' || !isFinite(v)) return v;
  if (f && /%/.test(f)) return (v * 100).toFixed((f.split('.')[1] || '').replace(/[^0]/g, '').length) + '%';
  const d = f ? (f.split('.')[1] || '').replace(/[^0]/g, '').length : Number.isInteger(v) ? 0 : 2;
  return f && !/,/.test(f) ? v.toFixed(d) : v.toLocaleString(LOC, { minimumFractionDigits: f ? d : 0, maximumFractionDigits: d }); };
const colL = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
async function openFile(id, v, live) {
  const cv = $('#canvas'); if (!cv) return;
  if (live && !cv.hidden && chat.uf && chat.uf.id !== id && !cv.classList.contains('is-file')) { /* แผงกำลังแสดงอย่างอื่น: สลับมาไฟล์ที่ AI แก้ */ }
  let f; try { f = await api('/files/' + id + (v ? '?v=' + v : '')); } catch (x) { return live ? null : toast(x.message, 'bad'); }
  chat.uf = f; chat.art = null; chat.ufSheet = Math.min(chat.ufSheet && chat.uf?.id === id ? chat.ufSheet : 0, (f.data.sheets?.length || 1) - 1);
  cv.hidden = false; cv.classList.remove('is-art'); cv.classList.add('is-file');
  $('#cv-t').textContent = f.name;
  $('#cv-v').innerHTML = f.versions.map(x => `<option value="${x.ver}" ${x.ver === f.shown ? 'selected' : ''}>v${x.ver}${x.note ? ' · ' + esc(x.note.slice(0, 40)) : ''}</option>`).join(''); $('#cv-v').hidden = f.versions.length < 2;
  $('#cv-sh').hidden = true; $('#cv-f').hidden = true; $('#cv-c').hidden = true;
  let box = $('#cv-s'); if (!box) { box = Object.assign(document.createElement('div'), { id: 'cv-s', className: 'cv-s' }); $('#cv-f').parentNode.append(box); }
  box.hidden = false; drawFile(box, live);
}
function drawFile(box, live) {
  const f = chat.uf, old = f.shown !== f.ver;
  const bar = `<div class="uf-bar">${old ? `<span class="muted">กำลังดู v${f.shown} (เก่า)</span><button type="button" class="btn blue sm" data-ufrest>${ic('undo', 'sm')} ย้อนกลับไปใช้เวอร์ชันนี้</button>` : `<span class="muted">${live ? '<b class="uf-live">AI เพิ่งแก้</b> · ' : ''}v${f.ver} · ${f.kind === 'sheet' ? 'ดับเบิลคลิกที่ช่องเพื่อแก้' : 'กดแก้ไขเพื่อเขียนเอง'}</span>`}<span class="sp"></span>${f.kind === 'doc' && !old ? `<button type="button" class="btn out sm" data-ufedit>${ic('pen', 'sm')} แก้ไข</button>` : ''}<button type="button" class="btn out sm" data-ufdl>${ic('download', 'sm')} ${ufLabel(f.name)}</button></div>`;
  if (f.kind === 'doc') { box.innerHTML = bar + (ufType(f.name) === 'pptx' ? `<div class="uf-slides">${mdSlides(f.data.md || '').map((s, k) => `<div class="uf-slide"><small>${k + 1}</small><h3>${esc(s.title)}</h3>${md(s.body.join('\n'))}${s.notes.length ? `<p class="muted">โน้ต: ${esc(s.notes.join(' '))}</p>` : ''}</div>`).join('')}</div>` : `<div class="uf-doc b">${md(f.data.md || '')}</div>`); renderRich(box); return; }
  const sh = f.data.sheets[chat.ufSheet] || f.data.sheets[0], V = ufEval(sh.rows), w = Math.max(1, ...sh.rows.map(r => r.length)), fmt = sh.fmt || {};
  const tabs = f.data.sheets.length > 1 ? `<div class="uf-tabs">${f.data.sheets.map((s, k) => `<button type="button" data-ufsh="${k}" class="${k === chat.ufSheet ? 'on' : ''}">${esc(s.name)}</button>`).join('')}</div>` : '';
  const n = Math.min(sh.rows.length, 2000);
  let h = `<div class="uf-grid"><table><thead><tr><th></th>${Array.from({ length: w }, (_, c) => `<th style="${sh.widths?.[c] ? `min-width:${sh.widths[c] * 7}px` : ''}">${colL(c)}</th>`).join('')}</tr></thead><tbody>`;
  for (let r = 0; r < n; r++) {
    h += `<tr class="${r === 0 && sh.header !== false ? 'hd' : ''}"><th>${r + 1}</th>`;
    for (let c = 0; c < w; c++) { const raw = sh.rows[r]?.[c] ?? '', isF = typeof raw === 'string' && raw[0] === '=', out = isF ? V(c, r) : raw, shown = ufFmt(out, fmt[colL(c)]);
      h += `<td data-r="${r}" data-c="${c}" class="${typeof out === 'number' ? 'num' : ''}${isF ? ' fx' : ''}" title="${isF ? esc(raw) : ''}">${esc(String(shown))}</td>`; }
    h += '</tr>';
  }
  box.innerHTML = bar + tabs + h + `</tbody></table>${sh.rows.length > n ? `<p class="muted">แสดง ${n} จาก ${sh.rows.length} แถว · ดาวน์โหลดเพื่อดูทั้งหมด</p>` : ''}</div>`;
}
// บันทึกที่ลูกค้าแก้เอง (รวมหลายช่องเป็นเวอร์ชันเดียว)
let ufT; const ufSave = () => { clearTimeout(ufT); ufT = setTimeout(async () => { const f = chat.uf; try { const r = await api('/files/' + f.id, { method: 'PUT', body: { data: f.data } }); f.ver = f.shown = r.ver; f.versions.unshift({ ver: r.ver, note: 'แก้โดยคุณ' }); chat.ufSeen = f.id + ':' + r.ver; $('#cv-v').innerHTML = f.versions.map(x => `<option value="${x.ver}" ${x.ver === f.shown ? 'selected' : ''}>v${x.ver}${x.note ? ' · ' + esc(x.note.slice(0, 40)) : ''}</option>`).join(''); $('#cv-v').hidden = false; if (!document.querySelector('.uf-in')) drawFile($('#cv-s')); } catch (x) { toast(x.message, 'bad'); } }, 700); };
document.addEventListener('dblclick', e => {
  const td = e.target.closest?.('#cv-s td[data-r]'); if (!td || chat.uf?.shown !== chat.uf?.ver) return;
  const sh = chat.uf.data.sheets[chat.ufSheet], r = +td.dataset.r, c = +td.dataset.c, raw = sh.rows[r]?.[c] ?? '';
  const inp = Object.assign(document.createElement('input'), { value: String(raw), className: 'uf-in' }); td.textContent = ''; td.append(inp); inp.focus(); inp.select();
  const done = keep => { if (!inp.isConnected) return; if (keep) { const v = inp.value.trim(), val = v !== '' && !/^0\d/.test(v) && !isNaN(v) ? +v : inp.value; while (sh.rows.length <= r) sh.rows.push([]); while (sh.rows[r].length < c) sh.rows[r].push(''); if (sh.rows[r][c] !== val) { sh.rows[r][c] = val; ufSave(); } } drawFile($('#cv-s')); };
  inp.onkeydown = k => { if (k.key === 'Enter') done(true); if (k.key === 'Escape') done(false); }; inp.onblur = () => done(true);
});
document.addEventListener('click', async e => {
  if (!e.target.closest?.('#cv-s')) return;
  const t = e.target.closest('[data-ufsh],[data-ufdl],[data-ufrest],[data-ufedit]'); if (!t) return; const f = chat.uf;
  if (t.dataset.ufsh != null) { chat.ufSheet = +t.dataset.ufsh; return drawFile($('#cv-s')); }
  if (t.hasAttribute('data-ufdl')) { t.disabled = true; try { await ufDownload(f); } catch (x) { toast('สร้างไฟล์ไม่สำเร็จ: ' + x.message, 'bad'); } t.disabled = false; return; }
  if (t.hasAttribute('data-ufrest')) { try { await api('/files/' + f.id + '/restore', { method: 'POST', body: { ver: f.shown } }); toast('ย้อนกลับแล้ว (บันทึกเป็นเวอร์ชันใหม่)', 'ok'); openFile(f.id); } catch (x) { toast(x.message, 'bad'); } return; }
  if (t.hasAttribute('data-ufedit')) { const box = $('#cv-s'); box.innerHTML = `<div class="uf-bar"><span class="muted">แก้เป็น Markdown (# หัวข้อ, - รายการ, | ตาราง |)</span><span class="sp"></span><button type="button" class="btn out sm" id="ufx">ยกเลิก</button><button type="button" class="btn blue sm" id="ufok">บันทึก</button></div><textarea class="uf-ta" id="ufta"></textarea>`;
    box.querySelector('#ufta').value = f.data.md || ''; box.querySelector('#ufx').onclick = () => drawFile(box);
    box.querySelector('#ufok').onclick = () => { f.data.md = box.querySelector('#ufta').value; clearTimeout(ufT); ufSave(); drawFile(box); }; }
});
// ดาวน์โหลด Excel จริง: สูตรทำงาน · หัวตารางตัวหนามีสีพื้น · ความกว้างคอลัมน์ · รูปแบบตัวเลข · ตัวกรอง
async function bookXlsx(book, name) {
  await lib('xlsxStyle'); const X = window.XLSX, wb = X.utils.book_new();
  for (const sh of book.sheets) {
    const ws = {}, w = Math.max(1, ...sh.rows.map(r => r.length)), fmt = sh.fmt || {}, line = { style: 'thin', color: { rgb: 'D0D7E2' } };
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v === '' || v == null) return; const a = X.utils.encode_cell({ r, c }), z = fmt[colL(c)], hd = r === 0 && sh.header !== false;
      const cell = typeof v === 'string' && v[0] === '=' && v.length > 1 ? { t: 'n', f: v.slice(1) } : typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : { t: 's', v: String(v) };
      if (z && !hd) cell.z = z;
      cell.s = hd ? { font: { bold: true, color: { rgb: '1F2937' } }, fill: { fgColor: { rgb: 'E8EEF7' } }, border: { bottom: { style: 'medium', color: { rgb: '9AA8BD' } } }, alignment: { vertical: 'center', wrapText: true } }
        : { border: { bottom: line }, ...(z ? { numFmt: z } : {}), alignment: { vertical: 'top' } };
      ws[a] = cell;
    }));
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, sh.rows.length - 1), c: w - 1 } });
    ws['!cols'] = Array.from({ length: w }, (_, c) => ({ wch: sh.widths?.[c] || Math.min(50, Math.max(8, ...sh.rows.slice(0, 300).map(r => [...String(r[c] ?? '')].length + 2))) }));
    if (sh.header !== false && sh.rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.rows.length - 1, c: w - 1 } }) };
    X.utils.book_append_sheet(wb, ws, sh.name);
  }
  X.writeFile(wb, name.replace(/\.(xls|xlsm|ods|csv)$/i, '') .replace(/(\.xlsx)?$/i, '.xlsx'));
}
// ดาวน์โหลด Word .docx จริงจาก Markdown: หัวข้อ, ย่อหน้า, รายการ, ตาราง, ตัวหนา/เอียง
async function mdDocx(src, name) {
  await lib('docx'); const D = window.docx, kids = [], lines = String(src).replace(/\r/g, '').split('\n');
  const runs = (t, o = {}) => String(t).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).filter(Boolean).map(p => p.startsWith('**') ? new D.TextRun({ text: p.slice(2, -2), bold: true, ...o }) : p.startsWith('`') ? new D.TextRun({ text: p.slice(1, -1), font: 'Consolas', ...o }) : p.length > 2 && p[0] === '*' ? new D.TextRun({ text: p.slice(1, -1), italics: true, ...o }) : new D.TextRun({ text: p, ...o }));
  const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { kids.push(new D.Paragraph({ heading: [D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4][h[1].length - 1], children: runs(h[2]) })); continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) { const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i])); i++; } i--;
      const w = Math.max(...rows.map(r => r.length)), b = { style: D.BorderStyle.SINGLE, size: 4, color: '999999' };
      kids.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: rows.map((r, k) => new D.TableRow({ tableHeader: k === 0, children: Array.from({ length: w }, (_, c) => new D.TableCell({ borders: { top: b, bottom: b, left: b, right: b }, shading: k === 0 ? { fill: 'E8EEF7' } : undefined, children: [new D.Paragraph({ children: runs(r[c] ?? '', k === 0 ? { bold: true } : {}) })] })) })) }));
      kids.push(new D.Paragraph('')); continue; }
    const li = /^(\s*)[-*•]\s+(.*)$/.exec(l); if (li) { kids.push(new D.Paragraph({ bullet: { level: Math.min(3, li[1].length >> 1) }, children: runs(li[2]) })); continue; }
    const nl = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(l); if (nl) { kids.push(new D.Paragraph({ indent: { left: 360 }, children: runs(nl[2] + '. ' + nl[3]) })); continue; }
    if (/^---+$/.test(l.trim())) { kids.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'BBBBBB' } } })); continue; }
    if (l.trim()) kids.push(new D.Paragraph({ spacing: { after: 120 }, children: runs(l.replace(/^>\s?/, '')) }));
  }
  const doc = new D.Document({ styles: { default: { document: { run: { font: 'Tahoma', size: 22 } } } }, sections: [{ children: kids }] });
  const a = document.createElement('a'); a.href = URL.createObjectURL(await D.Packer.toBlob(doc)); a.download = name.replace(/\.(docx?|md|pdf)$/i, '') + '.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// ไฟล์ Excel ที่แนบ → ข้อมูลตาราง (เก็บสูตร + ความกว้างคอลัมน์)
const wbBook = wb => ({ sheets: wb.SheetNames.slice(0, 30).map(n => { const ws = wb.Sheets[n], rows = []; if (ws['!ref']) { const R = XLSX.utils.decode_range(ws['!ref']);
  for (let r = R.s.r; r <= Math.min(R.e.r, 20000); r++) { const row = []; for (let c = R.s.c; c <= Math.min(R.e.c, 199); c++) { const x = ws[XLSX.utils.encode_cell({ r, c })]; row.push(!x ? '' : x.f ? '=' + x.f : x.v instanceof Date ? x.w || x.v.toISOString().slice(0, 10) : x.v ?? ''); } while (row.length && row.at(-1) === '') row.pop(); rows.push(row); } }
  while (rows.length && !rows.at(-1).length) rows.pop(); return { name: n, rows, widths: (ws['!cols'] || []).map(c => Math.round(c?.wch || 0)) }; }) });
async function ufUpload(name, kind, data) { if (window.DEMO) return null; try { return (await api('/files', { method: 'POST', body: { name, kind, data, chat_id: chat.id || null } })).id; } catch { return null; } }
const ufNote = id => id ? `[ไฟล์นี้บันทึกในบัญชีแล้ว file_id=${id} · ถ้าลูกค้าขอให้แก้ไฟล์นี้ ใช้ edit_account_file กับ file_id นี้ ไม่ต้องสร้างไฟล์ใหม่]\n` : '';
// แถบข้าง: ไฟล์ของฉัน
async function filesSheet() {
  const draw = async (d, q = '') => { const L = (await api('/files').catch(() => [])).filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    d.querySelector('#ufl').innerHTML = L.map(f => `<div class="mem tm row" style="align-items:center"><button type="button" class="linkish" data-ufo="${f.id}" style="flex:1;text-align:left;color:inherit">${ic(ufIcon(f.name), 'sm')} <b>${esc(f.name)}</b><br><small class="muted">v${f.ver} · ${when(f.updated_at)}</small></button>${f.chat_id ? `<a class="btn out sm" href="/chat?id=${f.chat_id}">แชต</a>` : ''}<button type="button" class="icon-btn sm ghost" data-ufdel="${f.id}" aria-label="ลบไฟล์">${ic('trash', 'sm')}</button></div>`).join('') || '<p class="muted">ยังไม่มีไฟล์ · สั่ง AI เช่น "ทำตารางรายรับรายจ่ายเป็น Excel" หรือแนบไฟล์ Excel/Word แล้วสั่งให้แก้</p>'; };
  sheet('ไฟล์ของฉัน', '<div class="sheet-form"><input id="ufq" type="search" placeholder="ค้นหาไฟล์" aria-label="ค้นหาไฟล์"><div id="ufl"><p class="muted">กำลังโหลด...</p></div></div>', (d, close) => {
    draw(d); d.querySelector('#ufq').oninput = e => draw(d, e.target.value);
    d.querySelector('#ufl').onclick = async e => { const o = e.target.closest('[data-ufo]'); if (o) { close(); return openFile(+o.dataset.ufo); }
      const x = e.target.closest('[data-ufdel]'); if (x && confirm('ลบไฟล์นี้และทุกเวอร์ชัน?')) { try { await api('/files/' + x.dataset.ufdel, { method: 'DELETE' }); toast('ลบแล้ว', 'ok'); draw(d); } catch (y) { toast(y.message, 'bad'); } } };
  });
}

// สไลด์จาก Markdown: "# หัวข้อ" ขึ้นสไลด์ใหม่ · "- ข้อ" = bullet · | ตาราง | · "> " = โน้ตผู้พูด
function mdSlides(src) {
  const out = []; let cur = null;
  for (const l of String(src).replace(/\r/g, '').split('\n')) {
    const h = /^#{1,2}\s+(.*)$/.exec(l);
    if (h || /^---+\s*$/.test(l)) { if (h) { cur = { title: h[1].trim(), body: [], notes: [] }; out.push(cur); } else cur = null; continue; }
    if (!cur) { if (!l.trim()) continue; cur = { title: '', body: [], notes: [] }; out.push(cur); }
    if (/^>\s?/.test(l)) cur.notes.push(l.replace(/^>\s?/, '')); else cur.body.push(l);
  }
  return out.filter(s => s.title || s.body.some(x => x.trim()));
}
async function mdPptx(src, name) {
  await lib('pptx'); const P = new window.PptxGenJS(); P.layout = 'LAYOUT_WIDE';
  const clean = s => String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  mdSlides(src).forEach((s, k) => {
    const sl = P.addSlide(); sl.background = { color: 'FFFFFF' };
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: 'D97757' } });
    sl.addText(clean(s.title), { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontFace: 'Tahoma', fontSize: k === 0 && !s.body.some(x => x.trim()) ? 40 : 28, bold: true, color: '1F2937' });
    const rows = s.body.filter(l => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(x => clean(x.trim())));
    const bul = s.body.filter(l => l.trim() && !/^\s*\|/.test(l)).map(l => { const m = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l); return { text: clean(m ? m[2] : l.trim()), options: { bullet: !!m, indentLevel: m ? Math.min(3, m[1].length >> 1) : 0, breakLine: true } }; });
    let y = 1.4;
    if (bul.length) { const h = rows.length ? 2.2 : 5.6; sl.addText(bul, { x: 0.7, y, w: 11.9, h, fontFace: 'Tahoma', fontSize: bul.length > 7 ? 16 : 20, color: '374151', valign: 'top', paraSpaceAfter: 6 }); y += h + 0.2; }
    if (rows.length) sl.addTable(rows.map((r, i) => r.map(c => ({ text: c, options: i === 0 ? { bold: true, fill: { color: 'E8EEF7' } } : {} }))), { x: 0.7, y, w: 11.9, fontFace: 'Tahoma', fontSize: 14, border: { type: 'solid', pt: 0.5, color: 'BBBBBB' }, autoPage: true });
    if (s.notes.length) sl.addNotes(s.notes.join('\n'));
    sl.addText(String(k + 1), { x: 12.4, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: '9CA3AF', align: 'right' });
  });
  await P.writeFile({ fileName: name.replace(/\.(pptx|md)$/i, '') + '.pptx' });
}
async function mdPdf(src, name, raw = false) {
  await lib('html2pdf');
  const el = document.createElement('div'); el.className = 'pdf-src';
  el.innerHTML = `<style>.pdf-src{font-family:Tahoma,'Sarabun',sans-serif;font-size:12pt;line-height:1.6;color:#111;padding:8px;background:#fff;width:720px}.pdf-src table{border-collapse:collapse;margin:8px 0;width:100%}.pdf-src td,.pdf-src th{border:1px solid #999;padding:4px 8px}.pdf-src th{background:#e8eef7}.pdf-src h1,.pdf-src h2,.pdf-src h3{color:#1f2937}.pdf-src pre{white-space:pre-wrap}</style>${md(src)}`;
  el.querySelectorAll('.tbl-x,button').forEach(x => x.remove());
  const job = window.html2pdf().set({ margin: 12, filename: name.replace(/\.(pdf|md)$/i, '') + '.pdf', html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4' }, pagebreak: { mode: ['css', 'legacy'] } }).from(el);
  return raw ? job.outputPdf('arraybuffer') : job.save();
}

// ---------- โหมดงาน (แบบ Kyber Harness): สั่งงานใหญ่ครั้งเดียว AI วางแผน (checklist) แล้วทำเองจนจบบนเซิร์ฟเวอร์ แม้ปิดหน้าเว็บ · ผลงานอยู่ใน "โฟลเดอร์งาน" ----------
const isTask = () => !!(chat.taskNew && !chat.id) || !!chat.chats?.find(c => c.id === chat.id)?.task || chat.taskId === chat.id && !!chat.id;
const taskTodoHTML = m => m.todos?.length ? `<div class="task-todo"><b>${ic('check', 'sm')} แผนงาน · ${m.todos.filter(x => x.status === 'completed').length}/${m.todos.length}</b>${m.todos.map(x => `<div class="tt ${x.status}">${x.status === 'completed' ? '✓' : x.status === 'in_progress' ? '●' : '○'} ${esc(x.content)}</div>`).join('')}</div>` : '';
const TASK_TPL = [
  ['sheet', 'ปิดยอดรายเดือน', 'สรุปยอดขาย/รายจ่ายจากไฟล์ที่แนบ ทำ Excel สรุปรายเดือน (มีสูตรรวม กำไร % เติบโต) และรายงาน Word 1 หน้า สรุปตัวเลขสำคัญและข้อสังเกต'],
  ['filetext', 'ใบเสนอราคา', 'ทำใบเสนอราคาเป็น Excel จากรายการสินค้าในไฟล์/ข้อความนี้ (ราคาต่อหน่วย จำนวน รวม ส่วนลด VAT 7% ยอดสุทธิ เป็นสูตร) และ PDF ส่งลูกค้า'],
  ['msg', 'สรุปประชุม', 'สรุปบันทึกประชุมที่แนบเป็น Word: ประเด็นหลัก มติ งานที่ต้องทำ (ใคร ทำอะไร ภายในเมื่อไร) เป็นตาราง'],
  ['layers', 'สไลด์นำเสนอ', 'ทำสไลด์ PowerPoint 8-10 หน้าจากเนื้อหา/ไฟล์ที่แนบ มีหน้าปก สรุปตัวเลขเป็นตาราง และหน้าสรุปข้อเสนอแนะ พร้อมโน้ตผู้พูด'],
  ['pie', 'วิเคราะห์ข้อมูล', 'วิเคราะห์ข้อมูลในไฟล์ Excel/CSV ที่แนบ ด้วย Python: หาแนวโน้ม กลุ่มที่ขายดี/แย่ ค่าผิดปกติ ทำกราฟ แล้วสรุปเป็นรายงาน Word และ Excel ตารางสรุป'],
  ['users', 'งาน HR', 'จากข้อมูลพนักงานที่แนบ ทำตารางเงินเดือน/วันลาเป็น Excel (มีสูตร) และร่างประกาศหรือจดหมายถึงพนักงานเป็น Word'],
  ['mail', 'ตอบอีเมลลูกค้า', 'อ่านอีเมล/ข้อความลูกค้าที่แนบ จัดกลุ่มตามเรื่อง ร่างคำตอบแต่ละฉบับอย่างสุภาพ และทำตารางสรุปใน Excel'],
];
function taskSheet() {
  sheet('งานใหม่ · AI ทำให้จนจบ', `<div class="sheet-form">
    <p class="sheet-msg">สั่งงานครั้งเดียว AI จะวางแผน ทำทีละขั้น และส่งผลเป็นไฟล์ Excel / Word / PowerPoint / PDF ในโฟลเดอร์งาน · ปิดหน้าเว็บได้ เสร็จแล้วแจ้งเตือน</p>
    <div class="task-tpl">${TASK_TPL.map(([i, n], k) => `<button type="button" data-tt="${k}">${ic(i, 'sm')}<span>${esc(n)}</span></button>`).join('')}</div>
    <textarea id="taskt" rows="5" placeholder="อธิบายงานที่ต้องการ เช่น &quot;รวมยอดขาย 3 สาขาจากไฟล์ที่แนบ ทำ Excel สรุป + รายงาน Word&quot;"></textarea>
    <small class="muted">แนบไฟล์ได้หลังกดเริ่ม (ปุ่ม + ในช่องพิมพ์) หรือแนบก่อนเปิดหน้านี้ · ใช้ลิมิตตามปกติ ทำได้สูงสุด 40 ขั้นต่อครั้ง</small>
    <button type="button" class="btn blue" id="taskgo">${ic('play', 'sm')} เริ่มงาน</button></div>`, (d, close) => {
    d.querySelector('.task-tpl').onclick = e => { const b = e.target.closest('[data-tt]'); if (b) { d.querySelector('#taskt').value = TASK_TPL[+b.dataset.tt][2]; d.querySelector('#taskt').focus(); } };
    d.querySelector('#taskgo').onclick = () => { const v = d.querySelector('#taskt').value.trim(); if (!v) return toast('พิมพ์งานที่ต้องการก่อน', 'bad');
      const keepF = chat.files, keepI = chat.images; close(); openChat(null); chat.files = keepF || []; chat.images = keepI || []; chat.taskNew = true; drawThumbs?.(); $('#t').value = v; send().then(() => { chat.taskId = chat.id; chat.taskNew = false; const c = chat.chats?.find(x => x.id === chat.id); if (c) c.task = 1; head(); }); };
  });
}
async function taskFolder(cid) {
  const L = await api('/files?chat_id=' + cid).catch(() => []);
  sheet('โฟลเดอร์งาน', `<div class="sheet-form">${L.length ? L.map(f => `<div class="mem tm row" style="align-items:center"><button type="button" class="linkish" data-tfo="${f.id}" style="flex:1;text-align:left;color:inherit">${ic(ufIcon(f.name), 'sm')} <b>${esc(f.name)}</b><br><small class="muted">${ufLabel(f.name)} · v${f.ver} · ${when(f.updated_at)}</small></button></div>`).join('') + `<button type="button" class="btn blue" id="tfzip">${ic('download', 'sm')} ดาวน์โหลดทั้งหมด (.zip)</button>` : '<p class="muted">ยังไม่มีไฟล์ · ไฟล์ที่ AI สร้างหรือไฟล์ Excel/Word ที่แนบในงานนี้จะมาอยู่ที่นี่</p>'}</div>`, (d, close) => {
    d.onclick = e => { const o = e.target.closest('[data-tfo]'); if (o) { close(); openFile(+o.dataset.tfo); } };
    const z = d.querySelector('#tfzip'); if (z) z.onclick = async () => { z.disabled = true; z.textContent = 'กำลังรวมไฟล์...'; try { await taskZip(L); } catch (x) { toast('รวมไฟล์ไม่สำเร็จ: ' + x.message, 'bad'); } z.disabled = false; z.innerHTML = ic('download', 'sm') + ' ดาวน์โหลดทั้งหมด (.zip)'; };
  });
}
// รวมทุกไฟล์ในงานเป็น zip: แปลงเป็นไฟล์จริงทีละไฟล์ (ดักการดาวน์โหลดแต่ละไฟล์ไว้ใส่ zip แทน)
async function taskZip(list) {
  await lib('jszip'); const zip = new JSZip(), origClick = HTMLAnchorElement.prototype.click, grabbed = [];
  HTMLAnchorElement.prototype.click = function () { if (this.download && this.href.startsWith('blob:')) grabbed.push({ name: this.download, href: this.href }); else origClick.call(this); };
  const xlsxWrite = window.XLSX?.writeFile;
  try {
    for (const f of list) {
      const full = await api('/files/' + f.id);
      if (full.kind === 'sheet') { await lib('xlsxStyle'); const W = window.XLSX.writeFile; window.XLSX.writeFile = (wb, n) => grabbed.push({ name: n, data: window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) }); try { await bookXlsx(full.data, full.name); } finally { window.XLSX.writeFile = W; } }
      else if (ufType(full.name) === 'pptx') { await lib('pptx'); const P = window.PptxGenJS.prototype, W = P.writeFile; P.writeFile = async function (o) { grabbed.push({ name: o.fileName, data: await this.write({ outputType: 'arraybuffer' }) }); }; try { await mdPptx(full.data.md || '', full.name); } finally { P.writeFile = W; } }
      else if (ufType(full.name) === 'pdf') grabbed.push({ name: full.name.replace(/(\.pdf)?$/i, '.pdf'), data: await mdPdf(full.data.md || '', full.name, true) });
      else await ufDownload(full);
    }
    for (const g of grabbed) zip.file(g.name, g.data || await (await fetch(g.href)).arrayBuffer());
  } finally { HTMLAnchorElement.prototype.click = origClick; if (xlsxWrite && window.XLSX) window.XLSX.writeFile = xlsxWrite; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' })); a.download = 'งาน-' + new Date().toISOString().slice(0, 10) + '.zip'; origClick.call(a);
}

// ---------- สร้างวิดีโอ (คลิปละ 5 วินาที 1080p · จ่ายจาก Wallet · ไม่สำเร็จคืนเงินอัตโนมัติ) ----------
function videoSheet() {
  let aspect = '16:9', timer = 0, dur = 5, refs = [];
  sheet('สร้างวิดีโอ', `<div class="sheet-form" id="vsf"><p class="muted">กำลังโหลด...</p></div>`, (d, close) => {
    const box = d.querySelector('#vsf'), stop = () => clearTimeout(timer);
    const card = v => `<div class="vid-item">${v.url ? `<video src="${v.url}" controls playsinline preload="metadata" class="${v.aspect === '9:16' ? 'tall' : ''}"></video>` : `<div class="vid-wait ${v.status}">${v.status === 'failed' ? ic('x') + ' สร้างไม่สำเร็จ (คืนเงินแล้ว)' : '<span class="cw-spin"></span> กำลังสร้าง… ประมาณ 1–5 นาที ปิดหน้านี้ได้'}</div>`}
      <small class="muted">${esc(v.prompt.slice(0, 140))} · ${v.duration} วินาที · ${v.aspect} · ฿${v.charged} · ${when(v.created_at)}</small>
      <div class="row">${v.url ? `<a class="btn out sm" href="${v.url}" download="kyber-video-${v.id}.mp4">${ic('download', 'sm')} ดาวน์โหลด</a>` : ''}${v.status === 'done' || v.status === 'failed' ? `<button type="button" class="btn out sm" data-vdel="${v.id}">${ic('trash', 'sm')}</button>` : ''}</div></div>`;
    const draw = async () => {
      if (!box.isConnected) return stop();
      const r = await api('/videos').catch(x => ({ error: x.message }));
      if (r.error) { box.innerHTML = `<p class="muted">${esc(r.error)}</p>`; return; }
      if (!r.enabled) { box.innerHTML = `<p class="muted">ระบบสร้างวิดีโอยังไม่เปิดให้ใช้ ติดต่อแอดมิน</p>${r.why ? `<p class="sheet-msg">${ic('alert', 'sm')} สำหรับแอดมิน: ${esc(r.why)}</p>` : ''}`; return; }
      const keep = box.querySelector('#vprompt')?.value ?? '';
      box.innerHTML = `<p class="sheet-msg">${ic('play', 'sm')} 1080p · ยาวได้ถึง ${r.max_s} วินาที · <b>฿${r.price} ต่อคลิป</b> (ไม่ขึ้นกับความยาว) จ่ายจาก Wallet (คงเหลือ ฿${(+me.balance || 0).toFixed(2)}) · สร้างไม่สำเร็จคืนเงินอัตโนมัติ</p>
        <textarea id="vprompt" rows="4" maxlength="2000" placeholder="อธิบายฉาก เช่น มุมกล้อง แสง การเคลื่อนไหว อารมณ์ภาพ · เขียนเป็นภาษาอังกฤษจะได้ผลดีที่สุด"></textarea>
        <div class="row"><div class="seg" role="group" aria-label="สัดส่วนภาพ"><button type="button" data-asp="16:9" class="${aspect === '16:9' ? 'on' : ''}">16:9 แนวนอน</button><button type="button" data-asp="9:16" class="${aspect === '9:16' ? 'on' : ''}">9:16 แนวตั้ง</button></div>
          <label style="flex:1;min-width:120px">ความยาว<select id="vdur">${Array.from({ length: r.max_s - 3 }, (_, k) => k + 4).map(s => `<option value="${s}" ${s === dur ? 'selected' : ''}>${s} วินาที</option>`).join('')}</select></label></div>
        <div class="row"><button type="button" class="btn out sm" id="vref">${ic('clip', 'sm')} แนบรูป/เสียงอ้างอิง</button><input type="file" id="vreff" accept="image/*,audio/*" multiple hidden><small class="muted" id="vrefn">${refs.length ? refs.length + ' ไฟล์' : `รูปได้ ${r.max_images} ใบ · เสียง ${r.max_audios} ไฟล์ (ไม่จำเป็น)`}</small></div>
        <button type="button" class="btn blue" id="vgo">${ic('play', 'sm')} สร้างวิดีโอ ฿${r.price}</button>
        ${me.balance < r.price ? '<a class="btn out" href="/plans?topup=1">เติมเงิน Wallet</a>' : ''}
        <div class="vid-list">${r.items.map(card).join('') || '<p class="muted">ยังไม่มีวิดีโอ</p>'}</div>`;
      box.querySelector('#vprompt').value = keep;
      box.querySelector('#vdur').onchange = e => { dur = +e.target.value; };
      box.querySelector('#vref').onclick = () => box.querySelector('#vreff').click();
      box.querySelector('#vreff').onchange = async e => { for (const f of [...e.target.files]) { if (f.size > 8e6) { toast(f.name + ' ใหญ่เกิน 8MB', 'bad'); continue; } const kind = f.type.startsWith('audio/') ? 'audio' : 'image';
          if (refs.filter(x => x.kind === kind).length >= (kind === 'audio' ? r.max_audios : r.max_images)) continue; refs.push({ kind, data: await new Promise(ok => { const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.readAsDataURL(f); }) }); }
        box.querySelector('#vrefn').textContent = `รูป ${refs.filter(x => x.kind === 'image').length} · เสียง ${refs.filter(x => x.kind === 'audio').length}`; e.target.value = ''; };
      box.querySelectorAll('[data-asp]').forEach(b => b.onclick = () => { aspect = b.dataset.asp; box.querySelectorAll('[data-asp]').forEach(x => x.classList.toggle('on', x === b)); });
      box.querySelector('#vgo').onclick = async e => { const p = box.querySelector('#vprompt').value.trim(); if (p.length < 5) return toast('อธิบายฉากที่ต้องการก่อน', 'bad');
        if (!confirm(`สร้างวิดีโอ 1 คลิป ฿${r.price} จาก Wallet?`)) return; e.target.disabled = true;
        try { const x = await api('/videos', { method: 'POST', body: { prompt: p, aspect, duration: dur, images: refs.filter(f => f.kind === 'image').map(f => f.data), audios: refs.filter(f => f.kind === 'audio').map(f => f.data), chat_id: chat.id || null } }); refs = []; me.balance = x.balance; box.querySelector('#vprompt').value = ''; toast('เริ่มสร้างแล้ว เสร็จแล้วดูได้ที่นี่', 'ok'); } catch (y) { toast(y.message, 'bad'); }
        draw(); };
      box.querySelectorAll('[data-vdel]').forEach(b => b.onclick = async () => { if (!confirm('ลบวิดีโอนี้?')) return; await api('/videos/' + b.dataset.vdel, { method: 'DELETE' }).catch(x => toast(x.message, 'bad')); draw(); });
      stop(); if (r.items.some(v => ['queued', 'processing'].includes(v.status))) timer = setTimeout(draw, 10000);
    };
    draw();
  });
}

// ---------- พรีวิวตามขนาดอุปกรณ์ (มือถือ / แท็บเล็ต / คอม) ใน Canvas · Artifact ----------
const DEVICES = {
  phone: [['iPhone 15 Pro', 393, 852], ['iPhone 15 Pro Max', 430, 932], ['iPhone SE', 375, 667], ['Galaxy S24', 360, 780]],
  tablet: [['iPad', 820, 1180], ['iPad mini', 744, 1133], ['iPad Pro 12.9"', 1024, 1366]],
  desktop: [['Laptop', 1280, 800], ['Desktop', 1440, 900], ['Full HD', 1920, 1080]],
};
const devState = (() => { try { return { dev: 'full', i: 0, rot: false, ...JSON.parse(localStorage.getItem('cvDev') || '{}') }; } catch { return { dev: 'full', i: 0, rot: false }; } })();
function fitDevice() {
  const st = $('#cv-stage'), fr = $('#cv-fr'), f = $('#cv-f'); if (!st || !fr || !f) return;
  const list = DEVICES[devState.dev], d = list?.[devState.i] || list?.[0];
  st.dataset.dev = devState.dev;
  app.querySelectorAll('[data-dev]').forEach(b => b.classList.toggle('on', b.dataset.dev === devState.dev));
  const sz = $('#cv-dsz'), rot = $('#cv-rot'), zoom = $('#cv-zoom');
  if (!d) { fr.style.cssText = ''; f.style.cssText = ''; sz.hidden = rot.hidden = true; zoom.textContent = ''; return; }
  sz.hidden = false; rot.hidden = devState.dev === 'desktop';
  sz.innerHTML = list.map(([n, w, h], i) => `<option value="${i}" ${i === devState.i ? 'selected' : ''}>${esc(n)} · ${w}×${h}</option>`).join('');
  const [w, h] = devState.rot && devState.dev !== 'desktop' ? [d[2], d[1]] : [d[1], d[2]];
  const pad = devState.dev === 'desktop' ? 64 : 48, s = Math.min(1, (st.clientWidth - pad) / w, (st.clientHeight - pad) / h);
  fr.style.cssText = `width:${Math.round(w * s)}px;height:${Math.round(h * s)}px`;
  f.style.cssText = `width:${w}px;height:${h}px;transform:scale(${s});transform-origin:0 0`;
  zoom.textContent = Math.round(s * 100) + '%';
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-dev]'); if (b) { devState.dev = b.dataset.dev; devState.i = 0; devState.rot = false; }
  else if (e.target.closest?.('#cv-rot')) devState.rot = !devState.rot; else return;
  try { localStorage.setItem('cvDev', JSON.stringify(devState)); } catch { /* ไม่มีที่เก็บ */ } fitDevice();
});
document.addEventListener('change', e => { if (e.target.id !== 'cv-dsz') return; devState.i = +e.target.value; try { localStorage.setItem('cvDev', JSON.stringify(devState)); } catch { /* ไม่มีที่เก็บ */ } fitDevice(); });
const devRO = 'ResizeObserver' in window ? new ResizeObserver(() => fitDevice()) : null;
function devWatch() { const st = $('#cv-stage'); if (st && devRO && !st.dataset.obs) { st.dataset.obs = '1'; devRO.observe(st); } requestAnimationFrame(fitDevice); }
