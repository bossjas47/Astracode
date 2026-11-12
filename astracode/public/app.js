// AstraCode frontend — vanilla JS, hash router
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = n => ((Math.round(Number(n || 0) * 100) / 100) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); // || 0 กัน "-0"
const num = n => Number(n || 0).toLocaleString('th-TH');
const when = t => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';
const EFFORTS = [['', 'Instant'], ['low', 'Low'], ['high', 'High'], ['max', 'Max']];
const SUGGEST = ['อธิบายเรื่องนี้ให้เข้าใจง่าย: ', 'ช่วยเขียนโค้ด Python ที่', 'สรุปข้อความนี้ให้สั้นลง:\n', 'แปลเป็นภาษาอังกฤษ:\n'];
let me = null, installEvt = null, site = {};
async function api(path, opt = {}) {
  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }
  const r = await fetch('/api' + path, opt);
  const d = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (r.status === 401) me = null;
  if (!r.ok) throw Object.assign(new Error(d?.error || (d?.need2fa ? 'ต้องใช้รหัส 2FA' : 'ผิดพลาด')), { data: d, status: r.status });
  return d;
}

// ---------- Markdown ----------
function inline(s) { // s escape แล้ว
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\(((?:\/api\/img\/[\w/.-]+)|(?:data:image\/(?:png|jpeg|webp);base64,[\w+/=]+))\)/g, '<img class="gen" src="$2" alt="$1" loading="lazy">'); // รูปที่ AI สร้าง (เฉพาะจากเว็บเรา)
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
    return `<div class="code"><div class="code-h"><span>${esc(lang || 'code')}</span>${/^(html|svg|xml)$/i.test(lang) ? '<button class="run-code">▶ แสดงผล</button>' : ''}<button class="cp-code">คัดลอก</button></div><pre><code>${esc(nl >= 0 ? part.slice(nl + 1) : part)}</code></pre></div>`;
  }).join('');
}
// ---------- Thinking: กล่องเหตุผลที่ AI คิด (กดเพื่อขยาย) ----------
const thinkLabel = m => m.streaming && !m.content ? '<span class="shimmer">กำลังคิด…</span>' : `Thinking${m.thinkSec ? ` · ${m.thinkSec} วินาที` : ''}`;
const thinkHTML = m => m.thinking ? `<details class="think"><summary><span class="think-s">${thinkLabel(m)}</span></summary><div class="think-b">${esc(m.thinking)}</div></details>` : '';
// อัปเดตข้อความ AI ที่กำลังพิมพ์ โดยไม่ปิดกล่อง Thinking ที่ผู้ใช้เปิดไว้
function paintStreaming(el, m) {
  let th = el.querySelector('.think');
  if (m.thinking && !th) { el.insertAdjacentHTML('afterbegin', thinkHTML(m)); th = el.querySelector('.think'); }
  if (th) {
    const b = th.querySelector('.think-b'), stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    b.textContent = m.thinking; th.querySelector('.think-s').innerHTML = thinkLabel(m);
    if (stick) b.scrollTop = b.scrollHeight;
  }
  el.querySelector('.b').innerHTML = m.content ? md(m.content) : m.thinking ? '' : DOTS;
}
// นับเวลาคิด: จากความคิดคำแรก ถึงคำตอบคำแรก
function onStreamEvent(m, d) {
  if (d.th) { m.thinking = (m.thinking || '') + d.th; m.t0 ||= Date.now(); }
  if (d.t) { if (m.t0 && !m.thinkSec) m.thinkSec = Math.max(1, Math.round((Date.now() - m.t0) / 1000)); m.content += d.t; }
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { return; }
  const o = btn.textContent; btn.textContent = 'คัดลอกแล้ว ✓'; setTimeout(() => btn.textContent = o, 1500);
}

// ---------- ส่วนที่ใช้ซ้ำ ----------
const nav = () => `<nav class="nav"><a class="logo" href="/">AstraCode</a><span class="sp"></span>
  ${me ? `<a class="l" href="/chat">แชต</a><a class="l" href="/code">Code</a><a class="l" href="/plans">แพลน</a><a class="l" href="/account">บัญชี</a>${me.role === 'admin' ? '<a class="l" href="/admin">หลังบ้าน</a>' : ''}`
       : `<a class="l" href="/plans">แพลน</a><a class="l" href="/pricing">ราคา</a><a class="l" href="/blog">บล็อก</a><a class="btn blue sm" href="/login">เริ่มใช้ฟรี</a>`}</nav>`;
const page = html => { app.innerHTML = `<div class="view">${html}</div>`; };

function planTiles(plans, sel, period) {
  return `<div class="grid">${plans.map(p => `<div class="tile plan ${sel === p.id ? 'sel' : ''} ${p.featured ? 'feat' : ''}" data-plan="${p.id}">
    ${p.featured ? '<span class="badge">แนะนำ</span>' : ''}
    <div style="font:600 19px var(--display)">${esc(p.name)}</div>
    <div class="price">${p.price > 0 ? '฿' + baht(period === 'year' ? p.price_year : p.price) : 'ฟรี'}<small>${p.price > 0 ? (period === 'year' ? ' / ปี' : ' / เดือน') : ''}</small></div>
    ${period === 'year' && p.price_year ? `<div class="ok" style="font-size:13px">ประหยัด ${Math.round((1 - p.price_year / (p.price * 12)) * 100)}% เทียบรายเดือน</div>` : ''}
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
  ['แนบไฟล์อะไรได้บ้าง', 'โค้ดและไฟล์ข้อความแทบทุกชนิด, PDF, Word (.docx), Excel (.xlsx) และรูป (เฉพาะโมเดลที่อ่านรูปได้) ครั้งละไม่เกิน 5 ไฟล์ ไฟล์ยาวจะใช้ลิมิตมากขึ้น และ PDF ที่เป็นภาพสแกนอ่านไม่ได้'],
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
  const [plans, posts] = await Promise.all([api('/plans').catch(() => []), api('/blog').catch(() => [])]);
  page(nav() + `<section class="hero"><div class="name">AstraCode</div>
    <h1>AI ทุกตัว<br>ในมือถือเครื่องเดียว</h1>
    <p>ChatGPT, Claude, Gemini, DeepSeek และ Kimi ในเว็บเดียว เปิดบนมือถือได้ทันที ไม่ต้องลงแอป</p>
    <div class="row" style="justify-content:center"><a class="btn blue" href="/login">เริ่มใช้ฟรี</a><a class="btn out" href="#plans">ดูแพลน</a></div></section>
    <div class="wrap"><div class="band"><h2>ออกแบบมาเพื่อมือถือ</h2><div class="grid">
      <div class="tile"><div class="stat">5+</div><div class="muted">ผู้ให้บริการ AI ชั้นนำ สลับได้ในแชตเดียว</div></div>
      <div class="tile"><div class="stat">PWA</div><div class="muted">เพิ่มลงหน้าจอหลัก ใช้เหมือนแอปจริง</div></div>
      <div class="tile"><div class="stat">%</div><div class="muted">เห็นลิมิตชัดเจน รีเซ็ตทุก 4 ชั่วโมงและทุกสัปดาห์</div></div>
      <div class="tile"><div class="stat">฿</div><div class="muted">จ่ายผ่าน PromptPay เริ่มต้นหลักสิบบาท</div></div>
    </div></div>
    <div class="band"><h2>ทำได้มากกว่าแชต</h2><div class="grid">
      <a class="tile link" href="/code"><div class="stat">⌘</div><div style="font:600 19px var(--display)">Code</div><div class="muted">เขียนโค้ดคล้าย VS Code บนเว็บ ให้ AI แก้ไฟล์ รันผล แล้ว push ขึ้น GitHub</div></a>
      <div class="tile"><div class="stat">⇄</div><div style="font:600 19px var(--display)">เทียบ 2 โมเดล</div><div class="muted">ถามครั้งเดียว ดูคำตอบสองโมเดลคู่กัน</div></div>
      <div class="tile"><div class="stat">🌐</div><div style="font:600 19px var(--display)">ค้นเว็บ</div><div class="muted">ให้ AI ค้นข้อมูลล่าสุดพร้อมแหล่งอ้างอิง</div></div>
      <a class="tile link" href="/developers"><div class="stat">{ }</div><div style="font:600 19px var(--display)">API</div><div class="muted">ใช้โมเดลทั้งหมดผ่าน API แบบ OpenAI จ่ายตามจริงจาก Wallet</div></a>
    </div></div>
    <div class="band" id="plans"><h2>แพลน</h2>${planTiles(plans)}</div>
    <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>
    <div class="band"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>
    ${posts.length ? `<div class="band"><h2>บทความล่าสุด</h2><div class="grid">${posts.slice(0, 3).map(postTile).join('')}</div></div>` : ''}
    ${footer()}</div>`);
  $('a[href="#plans"]').onclick = e => { e.preventDefault(); $('#plans').scrollIntoView({ behavior: 'smooth' }); };
  bindInstall();
}

// ---------- เข้าสู่ระบบ / สมัคร / ลืมรหัส / 2FA ----------
function auth() {
  const q = qs();
  if (q.get('ref')) localStorage.setItem('ref', q.get('ref'));
  let mode = q.get('reset') ? 'reset' : q.get('mfa') ? 'mfa' : 'login', need2fa = false, msg = q.get('error') || '';
  const ref = localStorage.getItem('ref') || '';
  const social = () => site.google || site.line ? `<div class="social">${site.google ? `<a class="btn out" href="/api/oauth/google${ref ? '?ref=' + encodeURIComponent(ref) : ''}">ดำเนินการต่อด้วย Google</a>` : ''}
    ${site.line ? `<a class="btn out line" href="/api/oauth/line${ref ? '?ref=' + encodeURIComponent(ref) : ''}">ดำเนินการต่อด้วย LINE</a>` : ''}<div class="or"><span>หรือ</span></div></div>` : '';
  const forms = {
    login: () => `<label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <label>รหัสผ่าน</label><input name="password" type="password" autocomplete="current-password" required>
      ${need2fa ? '<label>รหัส 2FA จากแอป (6 หลัก)</label><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>' : ''}`,
    register: () => `<label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <label>รหัสผ่าน (อย่างน้อย 8 ตัว)</label><input name="password" type="password" minlength="8" autocomplete="new-password" required>
      ${ref ? `<p class="muted">ชวนโดยโค้ด <b>${esc(ref)}</b> · จ่ายครั้งแรกได้เครดิตทั้งคู่</p>` : ''}`,
    forgot: () => `<p class="muted">ใส่อีเมลที่สมัครไว้ เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้</p><label>อีเมล</label><input name="email" type="email" autocomplete="email" required>`,
    reset: () => `<label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input name="password" type="password" minlength="8" autocomplete="new-password" required autofocus>`,
    mfa: () => `<p class="muted">บัญชีนี้เปิด 2FA ไว้ ใส่รหัส 6 หลักจากแอป Authenticator</p><label>รหัส 2FA</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus>`,
  };
  const title = { login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก', forgot: 'ลืมรหัสผ่าน', reset: 'ตั้งรหัสผ่านใหม่', mfa: 'ยืนยันตัวตน 2 ขั้น' };
  const draw = () => {
    const tabs = mode === 'login' || mode === 'register';
    page(nav() + `<div class="auth wrap"><h1>${title[mode]}</h1>
      ${tabs ? `<div class="tabs"><button class="${mode === 'login' ? 'on' : ''}" data-m="login">เข้าสู่ระบบ</button><button class="${mode === 'register' ? 'on' : ''}" data-m="register">สมัคร</button></div>` : ''}
      <form class="card" id="f">${tabs ? social() : ''}${forms[mode]()}
      <div class="err" id="e">${esc(msg)}</div><button class="btn blue" style="width:100%">${{ login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก', forgot: 'ส่งลิงก์', reset: 'ตั้งรหัสผ่าน', mfa: 'ยืนยัน' }[mode]}</button>
      ${mode === 'login' ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="forgot">ลืมรหัสผ่าน?</a></p>' : ''}
      ${!tabs ? '<p style="text-align:center;margin:12px 0 0"><a href="#" data-m="login">กลับไปเข้าสู่ระบบ</a></p>' : ''}
      <p class="muted" style="text-align:center;margin:12px 0 0">การ${mode === 'register' ? 'สมัคร' : 'ใช้งาน'}ถือว่ายอมรับ<a href="/terms">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`);
    app.querySelectorAll('[data-m]').forEach(b => b.onclick = e => { e.preventDefault(); mode = b.dataset.m; need2fa = false; msg = ''; draw(); });
    $('#f').onsubmit = async e => {
      e.preventDefault(); e.submitter.disabled = true;
      const body = Object.fromEntries(new FormData(e.target));
      try {
        if (mode === 'forgot') { const r = await api('/forgot', { method: 'POST', body }); $('#e').innerHTML = `<span class="ok">${r.mail ? 'ถ้ามีบัญชีนี้ เราส่งลิงก์ไปที่อีเมลแล้ว (ดูในจดหมายขยะด้วย)' : 'ระบบอีเมลยังไม่เปิดใช้ ติดต่อแอดมินที่หน้า "ติดต่อเรา"'}</span>`; e.submitter.disabled = false; return; }
        if (mode === 'reset') await api('/reset', { method: 'POST', body: { ...body, token: q.get('reset') } });
        else if (mode === 'mfa') await api('/login/mfa', { method: 'POST', body: { ...body, token: q.get('mfa') } });
        else await api('/' + mode, { method: 'POST', body: mode === 'register' ? { ...body, ref } : body });
        localStorage.removeItem('ref'); await loadMe(); go(q.get('next') || '/chat');
      } catch (x) {
        if (x.data?.need2fa) { need2fa = true; msg = ''; draw(); for (const [k, v] of Object.entries(body)) { const i = $(`#f [name=${k}]`); if (i) i.value = v; } $('#f [name=code]').focus(); return; }
        $('#e').textContent = x.message; e.submitter.disabled = false;
      }
    };
  };
  draw();
}
const loadMe = async () => { me = await api('/me').catch(() => null); };

function meters(u) {
  const m = (label, p, reset) => `<div class="meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}" title="รีเซ็ต ${when(reset)}">${label} ${p}%<div class="track"><div class="fill" style="width:${p}%"></div></div></div>`;
  return m('4 ชม.', u.pct4h, u.reset4h) + m('สัปดาห์', u.pctWeek, u.resetWeek);
}
// ---------- แนบไฟล์: แปลงเป็นข้อความในเบราว์เซอร์ก่อนส่ง ----------
const CDN = 'https://cdn.jsdelivr.net/npm/', PDFJS = CDN + 'pdfjs-dist@3.11.174/';
const LIBS = { // ล็อกเวอร์ชัน + SRI: ถ้าไฟล์บน CDN ถูกแก้ เบราว์เซอร์จะไม่รัน
  pdf: [PDFJS + 'build/pdf.min.js', 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'],
  pdfWorker: [PDFJS + 'build/pdf.worker.min.js', 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2'],
  mammoth: [CDN + 'mammoth@1.8.0/mammoth.browser.min.js', 'sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y'],
  jszip: [CDN + 'jszip@3.10.1/dist/jszip.min.js', 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'],
  xlsx: [CDN + 'xlsx@0.18.5/dist/xlsx.full.min.js', 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'],
};
const FILE_MAX = 200000, FILES_MAX = 5, RAW_MAX = 20e6; // ตัวอักษรต่อไฟล์, จำนวนไฟล์, ขนาดไฟล์ดิบ
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonc|xml|ya?ml|toml|ini|env|log|html?|css|scss|sass|less|m?js|cjs|jsx|ts|tsx|vue|svelte|py|ipynb|rb|php|java|kt|kts|swift|go|rs|c|h|cpp|hpp|cc|cs|m|mm|sh|bash|zsh|ps1|bat|sql|r|lua|luau|dart|scala|pl|ex|exs|erl|hs|clj|gradle|conf|cfg|properties|tex|srt|vtt|gd|tscn|tres)$/i;
const loading = {};
const lib = k => loading[k] ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = LIBS[k][0]; s.integrity = LIBS[k][1]; s.crossOrigin = 'anonymous';
  s.onload = ok; s.onerror = () => { delete loading[k]; no(new Error('โหลดตัวอ่านไฟล์ไม่ได้ ลองใหม่อีกครั้ง')); };
  document.head.append(s);
});
async function pdfLib() {
  await lib('pdf');
  const o = pdfjsLib.GlobalWorkerOptions;
  if (!o.workerSrc) try { // โหลด worker แบบตรวจ SRI แล้วรันจาก blob
    const t = await (await fetch(LIBS.pdfWorker[0], { integrity: LIBS.pdfWorker[1] })).text();
    o.workerSrc = URL.createObjectURL(new Blob([t], { type: 'text/javascript' }));
  } catch { o.workerSrc = LIBS.pdfWorker[0]; }
  return pdfjsLib;
}
const tok = n => n > 1000 ? '~' + Math.round(n / 3 / 100) / 10 + 'k token' : '~' + Math.ceil(n / 3) + ' token';
const FILE_RE = /\n*\[\[file:([^\]\n]+)\]\]\n([\s\S]*?)\n\[\[\/file\]\]/g;
const withFiles = (text, files) => text + files.map(f => `\n\n[[file:${f.name}]]\n${f.text}\n[[/file]]`).join('');

const nearBottom = box => box.scrollHeight - box.scrollTop - box.clientHeight < 120;
// ---------- แพลน + ชำระเงิน + เติม Wallet ----------
const PAY_STATUS = { pending: '<span class="warn">รออนุมัติ</span>', approved: '<span class="ok">สำเร็จ</span>', rejected: '<span class="bad">ไม่อนุมัติ</span>' };
async function plansPage() {
  const plans = await api('/plans');
  const hasYear = plans.some(p => p.price_year > 0);
  if (!me) { page(nav() + `<div class="wrap"><section class="hero" style="padding-bottom:24px"><h1>เลือกแพลน</h1></section>${planTiles(plans)}<p style="text-align:center;margin:28px"><a class="btn blue" href="/login">สมัครเพื่อเริ่มใช้</a></p><div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>${footer()}</div>`); return; }
  const pays = await api('/pay');
  let sel = null, period = 'month', coupon = null, tab = qs().get('topup') ? 'topup' : 'plan';
  const priceOf = p => period === 'year' && p.price_year ? p.price_year : p.price;
  const qr = amount => me.promptpay_id ? `<p class="muted">สแกนจ่ายผ่าน PromptPay แล้วอัปโหลดสลิป</p><img class="qr" alt="QR PromptPay" src="https://promptpay.io/${encodeURIComponent(me.promptpay_id)}/${amount}.png">` : '<p class="warn">ยังไม่ได้ตั้งค่า PromptPay</p>';
  const slipForm = label => `<form id="f" style="max-width:400px;margin:16px auto 0"><label>รูปสลิป</label><input type="file" name="slip" accept="image/*" required style="border-radius:20px">
    <div class="err" id="e"></div><button class="btn blue" style="width:100%">${label}</button><p class="muted" style="margin:12px 0 0">การชำระเงินถือว่ายอมรับ<a href="/terms">เงื่อนไขการคืนเงิน</a></p></form>`;
  const draw = () => {
    const p = plans.find(x => x.id === sel), total = p ? Math.max(0, priceOf(p) - (coupon?.discount || 0)) : 0;
    page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 24px"><h1>${tab === 'topup' ? 'เติมเงิน Wallet' : 'เลือกแพลน'}</h1>
      <p>แพลนปัจจุบัน: ${esc(me.plan.name)}${me.plan.expires ? ' · หมดอายุ ' + when(me.plan.expires) : ''} · Wallet ฿${baht(me.balance)}</p>
      <div class="seg" style="margin-top:12px"><button data-tab="plan" class="${tab === 'plan' ? 'on' : ''}">ซื้อแพลน</button><button data-tab="topup" class="${tab === 'topup' ? 'on' : ''}">เติม Wallet</button></div></section>
      ${tab === 'plan' ? `
        ${hasYear ? `<div style="text-align:center;margin-bottom:16px"><div class="seg"><button data-per="month" class="${period === 'month' ? 'on' : ''}">รายเดือน</button><button data-per="year" class="${period === 'year' ? 'on' : ''}">รายปี</button></div></div>` : ''}
        ${planTiles(plans.filter(x => x.price > 0 && (period === 'month' || x.price_year > 0)), sel, period)}
        ${p ? `<div class="card pay" id="pay" style="text-align:center"><div style="font:600 24px var(--display)">${esc(p.name)} · ${period === 'year' ? '1 ปี' : '30 วัน'}</div>
          <div class="price" style="margin:8px 0">${coupon?.discount ? `<s class="muted" style="font-size:20px">฿${baht(priceOf(p))}</s> ` : ''}฿${baht(total)}</div>
          <form id="cf" class="row" style="max-width:400px;margin:0 auto;flex-wrap:nowrap"><input name="code" placeholder="โค้ดคูปอง" value="${esc(coupon?.code || '')}" autocapitalize="characters"><button class="btn out sm">ใช้</button></form>
          <div class="err" id="ce"></div>
          ${me.balance >= total && total > 0 ? `<button class="btn blue" id="wpay" style="margin:12px 0">จ่ายด้วย Wallet (฿${baht(me.balance)})</button><p class="muted">หรือโอนผ่าน PromptPay</p>` : ''}
          ${total > 0 ? qr(total) + slipForm('ส่งสลิป') : '<button class="btn blue" id="free" style="margin-top:12px">เปิดใช้แพลนฟรีด้วยคูปอง</button>'}</div>`
        : '<p class="muted" style="text-align:center">แตะแพลนเพื่อชำระเงิน</p>'}
        <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>`
      : `<div class="card pay" style="text-align:center;max-width:520px;margin:0 auto"><p class="muted">เงินใน Wallet ใช้กับ API สำหรับนักพัฒนา ใช้ต่อเมื่อลิมิตแพลนเต็ม (เปิดได้ในหน้าบัญชี) และจ่ายค่าแพลน</p>
          <label>จำนวนเงิน (บาท)</label><input id="amt" type="number" inputmode="decimal" min="${+site.topup_min || 20}" max="50000" step="1" value="${+site.topup_min || 100}" style="text-align:center;font-size:24px">
          <div class="row" style="justify-content:center;margin-top:8px">${[100, 300, 500, 1000].map(v => `<button class="btn out sm" data-amt="${v}">฿${v}</button>`).join('')}</div>
          <div id="tq">${qr(+site.topup_min || 100)}</div>${slipForm('ส่งสลิปเติมเงิน')}</div>`}
      ${pays.length ? `<div class="card"><div style="font:600 19px var(--display)">ประวัติการชำระ</div><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>รายการ</th><th>ยอด</th><th>สถานะ</th><th></th></tr>
        ${pays.map(x => `<tr><td>${when(x.created_at)}</td><td>${x.kind === 'topup' ? 'เติม Wallet' : esc(x.plan_name) + (x.period === 'year' ? ' (รายปี)' : '')}</td><td>฿${baht(x.amount)}</td><td>${PAY_STATUS[x.status]}</td><td>${x.status === 'approved' ? `<a href="/receipt?id=${x.id}">ใบเสร็จ</a>` : ''}</td></tr>`).join('')}</table></div></div>` : ''}
      ${footer()}</div>`);
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    app.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { period = b.dataset.per; coupon = null; if (sel && !plans.find(x => x.id === sel)?.price_year && period === 'year') sel = null; draw(); });
    app.querySelectorAll('[data-plan]').forEach(t => t.onclick = () => { sel = +t.dataset.plan; coupon = null; draw(); $('#pay')?.scrollIntoView({ behavior: 'smooth' }); });
    $('#cf')?.addEventListener('submit', async e => {
      e.preventDefault(); const code = new FormData(e.target).get('code').trim();
      if (!code) { coupon = null; return draw(); }
      try { coupon = await api('/coupon/check', { method: 'POST', body: { code, plan_id: sel, period } }); draw(); } catch (x) { $('#ce').textContent = x.message; }
    });
    const submit = async (fd, btn, errBox) => {
      btn.disabled = true;
      try { const r = await api('/pay', { method: 'POST', body: fd }); await loadMe(); if (r.approved) go(`/receipt?id=${r.id}`); else { alert('ส่งสลิปแล้ว รอแอดมินตรวจ'); boot(); } }
      catch (x) { errBox.textContent = x.message; btn.disabled = false; }
    };
    const planFd = () => { const fd = new FormData(); fd.append('plan_id', sel); fd.append('period', period); if (coupon) fd.append('coupon', coupon.code); return fd; };
    $('#wpay')?.addEventListener('click', e => { if (!confirm(`ตัดเงิน ฿${baht(total)} จาก Wallet?`)) return; const fd = planFd(); fd.append('wallet', '1'); submit(fd, e.target, $('#ce')); });
    $('#free')?.addEventListener('click', e => submit(planFd(), e.target, $('#ce')));
    const amt = $('#amt');
    if (amt) {
      const upd = () => { $('#tq').innerHTML = qr(Math.max(0, Math.round(+amt.value || 0))); };
      amt.oninput = upd; app.querySelectorAll('[data-amt]').forEach(b => b.onclick = () => { amt.value = b.dataset.amt; upd(); });
    }
    $('#f')?.addEventListener('submit', e => {
      e.preventDefault(); const fd = tab === 'plan' ? planFd() : new FormData();
      fd.append('slip', new FormData(e.target).get('slip'));
      if (tab === 'topup') { fd.append('kind', 'topup'); fd.append('amount', Math.round(+amt.value || 0)); }
      submit(fd, e.submitter, $('#e'));
    });
  };
  draw();
}

// ---------- เงื่อนไขการใช้บริการ ----------
const TERMS = [
  ['1. บริการ', 'AstraCode ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],
  ['2. บัญชีผู้ใช้', 'ผู้ใช้ต้องให้อีเมลที่ใช้งานได้ และรักษารหัสผ่านเป็นความลับ บัญชีหนึ่งใช้ได้หนึ่งคน ห้ามแชร์ ขาย หรือให้เช่าบัญชี หากพบการใช้งานผิดเงื่อนไข เราอาจระงับบัญชีโดยไม่คืนเงิน'],
  ['3. แพลนและการชำระเงิน', 'แพลนแบบชำระเงินมีอายุ 30 วันนับจากวันที่แอดมินอนุมัติสลิป การต่ออายุแพลนเดิมจะบวกเวลาต่อจากวันหมดอายุเดิม ชำระผ่าน PromptPay และแนบสลิปเท่านั้น สลิปปลอม สลิปซ้ำ หรือยอดไม่ตรงจะไม่ได้รับการอนุมัติ'],
  ['4. การคืนเงิน', 'ไม่คืนเงินหลังเปิดใช้แพลนแล้ว ยกเว้นกรณีระบบขัดข้องจนใช้งานไม่ได้ต่อเนื่องเกิน 72 ชั่วโมงโดยเป็นความผิดของเรา ซึ่งจะคืนเงินหรือชดเชยวันใช้งานตามสัดส่วน ติดต่อแอดมินภายใน 7 วันนับจากวันที่เกิดปัญหา'],
  ['4.1 Wallet และ API', 'เงินใน Wallet ใช้จ่ายค่าแพลน ค่า API สำหรับนักพัฒนา และค่าใช้งานเมื่อลิมิตแพลนเต็ม (ถ้าเปิดไว้) คิดตามราคาต่อ token ที่แสดงในหน้าราคา เงินใน Wallet ไม่มีวันหมดอายุ แต่ถอนเป็นเงินสดไม่ได้ เครดิตจากคูปองและการชวนเพื่อนไม่มีมูลค่าเป็นเงิน'],
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
  ['สิทธิ์ของคุณ (PDPA)', 'ลบแชตได้เองทุกเมื่อจากเมนูด้านข้าง ดาวน์โหลดสำเนาข้อมูลทั้งหมด และลบบัญชีได้เองที่หน้าบัญชี การลบบัญชีจะลบแชต โปรเจกต์ ความจำ และ API key ทันที ข้อมูลการชำระเงินเก็บต่อตามที่กฎหมายกำหนด'],
  ['ความจำและคำสั่งส่วนตัว', 'ข้อความที่คุณให้ AI จำไว้ และคำสั่งส่วนตัว จะถูกส่งไปกับทุกแชต ดูและลบได้ที่หน้าบัญชี'],
  ['การค้นเว็บ', 'เมื่อเปิดค้นเว็บ ข้อความล่าสุดของคุณจะถูกส่งไปยังบริการค้นหา (Tavily) เพื่อหาข้อมูล'],
];
function terms() {
  const sec = (t, rows) => `<div class="band legal"><h2>${t}</h2>${rows.map(([h, p]) => `<div class="tile"><div style="font:600 17px var(--display)">${h}</div><p class="muted" style="font-size:15px;margin:0">${p}</p></div>`).join('')}</div>`;
  page(nav() + `<div class="wrap" style="max-width:760px"><section class="hero" style="padding:48px 0 8px"><h1>เงื่อนไขและความเป็นส่วนตัว</h1><p>มีผลตั้งแต่ 11 พฤศจิกายน 2569</p></section>
    ${sec('เงื่อนไขการใช้บริการ', TERMS)}${sec('นโยบายความเป็นส่วนตัว', PRIVACY)}
    <p class="muted" style="text-align:center;padding-bottom:48px">มีคำถามเกี่ยวกับเงื่อนไขนี้ ติดต่อแอดมิน</p></div>`);
}
const footer = () => `<footer class="foot"><div><b>AstraCode</b><span class="muted">AI ทุกตัวในมือถือเครื่องเดียว</span></div>
  <div><a href="/pricing">ราคาต่อ token</a><a href="/developers">API สำหรับนักพัฒนา</a><a href="/blog">บล็อก</a></div>
  <div><a href="/status">สถานะระบบ</a><a href="/support">ติดต่อเรา</a><a href="/terms">เงื่อนไขและความเป็นส่วนตัว</a></div>
  <p class="muted">© ${new Date().getFullYear()} AstraCode</p></footer>`;


// ---------- หน้าราคาต่อ token (ตั้งค่าในหลังบ้าน → โมเดล / ตั้งค่า) ----------
const money = v => v === 0 ? '0' : v < 0.01 ? v.toFixed(4) : v < 1 ? v.toFixed(3).replace(/0$/, '') : baht(v);
async function pricing() {
  const d = await api('/pricing');
  let per = localStorage.getItem('per') || 'M';
  const unit = () => per === 'M' ? 'ต่อ 1M token' : 'ต่อ 1K token', f = v => money(per === 'M' ? v : v / 1000);
  const planName = id => d.plans.find(p => p.id === id)?.name;
  const card = m => `<div class="pc"><div class="pc-h"><b>${esc(m.name)}</b><span class="pc-tags">${m.vision ? '<span class="pill">อ่านรูป</span>' : ''}${m.effort ? '<span class="pill">Thinking</span>' : ''}</span></div>
    ${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
    <div class="pc-rows">
      <div><span>Input</span><b>฿${f(m.in)}</b></div>
      <div><span>Output</span><b>฿${f(m.out)}</b></div>
      <div><span>Cache read</span><b>฿${f(m.cache)}</b></div>
      ${m.cache_write ? `<div><span>Cache write</span><b>฿${f(m.cache_write)}</b></div>` : ''}
    </div>
    <div class="pc-f"><span class="muted">ใช้ลิมิต ×${m.multiplier}</span><span class="muted">${m.plans.map(planName).filter(Boolean).map(esc).join(' · ') || 'ยังไม่อยู่ในแพลนไหน'}</span></div></div>`;
  const draw = () => {
    page(nav() + `<div class="wrap"><section class="hero" style="padding:56px 0 24px"><div class="name">AstraCode</div><h1>ราคาต่อ token</h1>
      <p>ราคาของแต่ละโมเดล เป็นบาท${unit()} โมเดลที่แพงกว่าจะใช้ลิมิตแพลนเร็วกว่า</p>
      <div class="seg" role="group" aria-label="หน่วย"><button data-per="M" class="${per === 'M' ? 'on' : ''}">ต่อ 1M token</button><button data-per="K" class="${per === 'K' ? 'on' : ''}">ต่อ 1K token</button></div></section>
      <div class="pgrid">${d.models.map(card).join('') || '<p class="muted">ยังไม่มีโมเดล</p>'}</div>
      ${d.note ? `<p class="muted" style="text-align:center;margin:20px auto;max-width:640px;white-space:pre-wrap">${esc(d.note)}</p>` : ''}
      <div class="band"><h2>คำนวณค่าใช้จ่าย</h2><div class="calc">
        <div class="form2">
          <div><label>โมเดล</label><select id="cm">${d.models.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
          <div><label>ข้อความต่อวัน</label><input id="cn" type="number" inputmode="numeric" min="1" value="30"></div>
          <div><label>คำถาม + ประวัติแชต (token/ข้อความ)</label><input id="ci" type="number" inputmode="numeric" min="0" value="2000"></div>
          <div><label>คำตอบ (token/ข้อความ)</label><input id="co" type="number" inputmode="numeric" min="0" value="500"></div>
          <div><label>ส่วนที่โดน cache (%)</label><input id="cc" type="number" inputmode="numeric" min="0" max="100" value="50"></div>
        </div><div id="cr" class="calc-r" aria-live="polite"></div></div></div>
      <div class="band"><h2>อธิบายราคา</h2>${[
        ['Token คืออะไร', 'หน่วยที่ AI ใช้นับข้อความ ภาษาไทยประมาณ 1–2 ตัวอักษรต่อ token ภาษาอังกฤษประมาณ 4 ตัวอักษรต่อ token'],
        ['Input / Output ต่างกันยังไง', 'Input คือสิ่งที่ส่งให้ AI อ่าน (คำถาม ประวัติแชต ไฟล์แนบ) Output คือคำตอบที่ AI เขียน รวมถึงตอนที่ AI คิด (Thinking) โดยทั่วไป Output แพงกว่า'],
        ['Cache คืออะไร', 'ส่วนที่ AI เคยอ่านแล้วในแชตเดียวกัน เช่น ประวัติแชต ระบบจำไว้ จึงคิดราคาถูกกว่า Input ปกติมาก Cache write คือครั้งแรกที่บันทึกลง cache'],
        ['จ่ายตามนี้จริงไหม', 'ในแพลนรายเดือน คุณจ่ายราคาแพลนคงที่ ตัวเลขในหน้านี้ใช้ดูว่าแต่ละโมเดลกินลิมิตมากน้อยแค่ไหน'],
      ].map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
      ${footer()}</div>`);
    app.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; localStorage.setItem('per', per); draw(); });
    const calc = () => {
      const m = d.models.find(x => x.id === +$('#cm').value); if (!m) return;
      const n = Math.max(0, +$('#cn').value || 0), i = Math.max(0, +$('#ci').value || 0), o = Math.max(0, +$('#co').value || 0), c = Math.min(100, Math.max(0, +$('#cc').value || 0)) / 100;
      const per1 = (i * (1 - c) * m.in + i * c * m.cache + o * m.out) / 1e6, month = per1 * n * 30;
      const weekUnits = n * 7 * (i * (1 - c) + i * c / 10 + o) * m.multiplier; // วิธีนับเดียวกับระบบลิมิต
      const fit = d.plans.filter(p => m.plans.includes(p.id) && p.limit_week);
      $('#cr').innerHTML = `<div class="kpis"><div class="kpi"><div class="muted">ต่อข้อความ</div><div class="stat">฿${money(per1)}</div></div>
        <div class="kpi"><div class="muted">ต่อเดือน (30 วัน)</div><div class="stat">฿${money(month)}</div></div></div>
        ${fit.length ? `<div class="tw"><table class="tbl"><tr><th>แพลน</th><th>ราคา/เดือน</th><th>ใช้ลิมิตต่อสัปดาห์</th></tr>${fit.map(p => { const pct = weekUnits / p.limit_week * 100; return `<tr><td>${esc(p.name)}</td><td>${p.price ? '฿' + baht(p.price) : 'ฟรี'}</td><td class="${pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok'}">${pct > 999 ? '>999' : Math.round(pct)}%${pct > 100 ? ' (ไม่พอ)' : ''}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">โมเดลนี้ยังไม่อยู่ในแพลนไหน</p>'}`;
    };
    ['#cm', '#cn', '#ci', '#co', '#cc'].forEach(s => $(s).oninput = calc); calc();
  };
  draw();
}

// ---------- หลายหน้า: แต่ละไฟล์ .html บอกชื่อหน้าใน <body data-page> ----------
// เดโม (ไฟล์เดียว) จำลอง URL ไว้ใน window.DEMO_URL แทนการเปลี่ยนหน้าจริง
const curl = () => window.DEMO ? (window.DEMO_URL ||= new URL('/', location.origin === 'null' ? 'http://demo' : location.origin)) : location;
const qs = () => new URLSearchParams(curl().search);
const here = () => curl().pathname + curl().search;
const pageName = () => window.DEMO ? (curl().pathname.replace(/^\/|\.html$/g, '').split('/')[0] || 'home') : document.body.dataset.page || 'home';
function setUrl(p, replace) {
  if (window.DEMO) window.DEMO_URL = new URL(p, curl().href);
  else history[replace ? 'replaceState' : 'pushState'](null, '', p);
}
function go(p) { if (window.DEMO) { setUrl(p); boot(); } else location.href = p; }
const PAGES = {
  home: () => me ? go('/chat') : landing(),
  login: () => me ? go(qs().get('next') || '/chat') : auth(),
  plans: plansPage, terms, pricing,
};
const OPEN_IN_MAINTENANCE = ['home', 'login', 'terms', 'status', 'blog', 'pricing'];
function banner() { // ประกาศจากแอดมิน: ปิดได้ จำไว้ว่าปิดข้อความไหน
  const t = site.announcement; if (!t || localStorage.getItem('ann') === t || ['admin', 'code', 'receipt'].includes(pageName())) return;
  const b = document.createElement('div'); b.className = 'ann ' + (site.announcement_level || 'info');
  b.innerHTML = `<span>${inline(esc(t))}</span><button aria-label="ปิดประกาศ">✕</button>`;
  b.querySelector('button').onclick = () => { localStorage.setItem('ann', t); b.remove(); };
  app.prepend(b);
}
// แสดงผล HTML/SVG จากโค้ดในแชต ใน sandbox แยก origin
function showPreview(code) {
  const html = /^\s*<svg/i.test(code) ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body>` : code;
  const d = document.createElement('div'); d.className = 'modal';
  d.innerHTML = `<div class="modal-b"><div class="modal-h"><b>แสดงผล</b><span class="sp"></span><button class="btn out sm" data-x>ปิด</button></div><iframe sandbox="allow-scripts allow-modals allow-forms allow-popups" title="แสดงผล"></iframe></div>`;
  const f = d.querySelector('iframe'), close = () => { d.remove(); removeEventListener('message', onMsg); };
  const onMsg = e => { if (e.source === f.contentWindow && e.data?.ready) f.contentWindow.postMessage({ html }, '*'); };
  if (window.DEMO) f.srcdoc = html; else { addEventListener('message', onMsg); f.src = '/preview.html'; }
  d.onclick = e => { if (e.target === d || e.target.dataset.x != null) close(); };
  document.body.append(d);
}
const postTile = p => `<a class="tile link post" href="/blog/${encodeURIComponent(p.slug)}">${p.cover?.startsWith('/') ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}<div style="font:600 19px var(--display)">${esc(p.title)}</div><div class="muted">${esc(p.summary)}</div><div class="muted" style="font-size:12px">${when(p.created_at).split(' ')[0]}</div></a>`;
async function boot() {
  document.querySelector('.shade')?.remove();
  try {
    if (site.maintenance === '1' && me?.role !== 'admin' && !OPEN_IN_MAINTENANCE.includes(pageName()))
      page(nav() + `<section class="hero"><h1>ปิดปรับปรุงชั่วคราว</h1><p>เรากำลังอัปเกรดระบบ กลับมาใหม่อีกสักครู่ · <a href="/status">ดูสถานะระบบ</a></p></section>`);
    else await (PAGES[pageName()] || PAGES.home)();
    banner();
  }
  catch (x) {
    if (!me) return go('/login?next=' + encodeURIComponent(here()));
    page(nav() + `<p class="err" style="text-align:center;margin:48px">${esc(x.message)}</p>`);
  }
}
if (window.DEMO) addEventListener('click', e => { // เดโม: ลิงก์ภายในเว็บสลับหน้าโดยไม่โหลดใหม่
  const a = e.target.closest('a[href^="/"]'); if (!a || e.defaultPrevented) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
// รอให้สคริปต์ของหน้า (เช่น code.js) โหลดครบก่อน ไม่งั้นหน้านั้นยังไม่ได้ลงทะเบียนใน PAGES
const domReady = new Promise(r => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', r) : r());
const loadSite = async () => { site = await api('/settings/public').catch(() => ({})); };
Promise.all([loadMe(), loadSite(), domReady]).then(boot);
if ('serviceWorker' in navigator && !window.DEMO) navigator.serviceWorker.register('/sw.js').catch(() => {});
