// AstraCode: หน้าบัญชี (แพลน, Wallet, ชวนเพื่อน, ความจำ, ความปลอดภัย, ข้อมูลส่วนตัว)
LIBS.qr = [CDN + 'qrcode-generator@1.4.4/qrcode.js', 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k'];
const TX_KIND = { topup: 'เติมเงิน', coupon: 'คูปอง', referral: 'ชวนเพื่อน', plan: 'ซื้อแพลน', renew: 'ต่ออายุอัตโนมัติ', overflow: 'ใช้เกินลิมิต', api: 'API', admin: 'ปรับโดยแอดมิน' };
const h3 = t => `<div class="acc-t">${t}</div>`;
const meterRow = (label, p, sub) => `<div class="acc-meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}"><div class="am-h"><span>${label}</span><b>${p}%</b></div><div class="bar1 lg"><div style="width:${Math.min(100, p)}%"></div></div><small class="muted">${sub}</small></div>`;
const sw = (id, on, label, hint) => `<label class="tg"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span><b>${label}</b><small class="muted">${hint}</small></span></label>`;

const kfmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0);
function usageHTML(d) {
  if (!d.days.length) return '<p class="muted">ยังไม่มีการใช้งาน</p>';
  const by = Object.fromEntries(d.days.map(r => [r.d, r])), list = [], bkk = Date.now() + 7 * 3600e3;
  for (let i = 13; i >= 0; i--) { const k = new Date(bkk - i * 864e5).toISOString().slice(0, 10); list.push(by[k] || { d: k, n: 0, tin: 0, tout: 0, pct: 0 }); }
  const max = Math.max(...list.map(r => r.tin + r.tout), 1), tot = d.days.reduce((a, r) => ({ n: a.n + r.n, t: a.t + r.tin + r.tout }), { n: 0, t: 0 });
  return `<p class="muted" style="margin:0 0 12px">รวม ${tot.n.toLocaleString('th-TH')} ข้อความ · ${kfmt(tot.t)} token · <a href="/api/usage/export?days=90" download>Download CSV</a></p>
    <div class="ubars">${list.map(r => `<div class="ubar" title="${r.d}: ${r.n} ข้อความ · ↑${kfmt(r.tin)} ↓${kfmt(r.tout)} · ${r.pct}% ของลิมิตสัปดาห์"><i style="height:${Math.max(2, Math.round((r.tin + r.tout) / max * 100))}%"></i><span>${+r.d.slice(8)}</span></div>`).join('')}</div>
    <div class="tw"><table class="tbl"><tr><th>วัน</th><th>ข้อความ</th><th>เข้า/ออก</th><th>ลิมิต</th></tr>
      ${d.days.slice().reverse().slice(0, 7).map(r => `<tr><td>${new Date(r.d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td><td>${r.n}</td><td>${kfmt(r.tin)} / ${kfmt(r.tout)}</td><td>${r.pct}%</td></tr>`).join('')}</table></div>
    ${d.models.length ? `<p class="muted" style="margin:12px 0 0">โมเดลที่ใช้: ${d.models.map(m => `${esc(m.name || 'อื่นๆ')} ${kfmt(m.tok)}`).join(' · ')}</p>` : ''}`;
}

PAGES.account = async function account() {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  await loadMe();
  const [w, mems, ud, tm] = await Promise.all([api('/wallet'), api('/memories'), api('/usage/daily'), api('/team').catch(() => ({ team: null }))]);
  const u = me.usage, refLink = `${location.origin}/login?ref=${me.ref_code}`;
  page(nav() + `<div class="wrap acc" style="max-width:680px">
    <section class="acc-head"><div class="acc-av" aria-hidden="true">${esc((me.email || '?')[0].toUpperCase())}</div>
      <div class="acc-id"><h1>บัญชี</h1><p>${esc(me.email)}</p></div></section>
    <div class="acc-act">
      <a class="btn blue sm" href="/chat">${ic('msg', 'sm')} Open chat</a>
      <a class="btn out sm" href="/plans">${ic('layers', 'sm')} Plans / Top up</a>
      <button class="btn red sm" id="outTop">Log out</button>
    </div>
    <nav class="acc-nav" aria-label="ส่วนในหน้านี้"><a href="#sec-usage">การใช้งาน</a><a href="#sec-team">ทีม</a><a href="#sec-wallet">Wallet</a><a href="#sec-ai">AI ของคุณ</a><a href="#sec-security">ความปลอดภัย</a><a href="#sec-data">ข้อมูล</a></nav>

    <div class="acc-ov">
      <div class="acc-big"><span class="muted">Wallet</span><b>฿${baht(w.balance)}</b><a class="btn blue sm" href="/plans?topup=1">Top up</a></div>
      <div class="acc-big"><span class="muted">แพลน</span><b>${esc(me.plan.name)}</b><span class="muted">${me.plan.expires ? 'หมดอายุ ' + when(me.plan.expires) : 'ไม่มีวันหมดอายุ'}</span></div>
    </div>
    <div class="card acc-c" id="sec-limit">${h3('ลิมิตการใช้งาน')}
      ${u.use4h === false ? '' : meterRow('รอบ 4 ชม.', u.pct4h, u.reset4h ? 'รีเซ็ต ' + when(u.reset4h) : 'เริ่มนับเมื่อส่งข้อความแรก')}
      ${meterRow('รอบสัปดาห์', u.pctWeek, 'รีเซ็ต ' + when(u.resetWeek))}</div>

    <div class="card acc-c" id="sec-usage">${h3('การใช้งาน 30 วันล่าสุด')}${usageHTML(ud)}</div>

    
    <div class="card acc-c" id="sec-team">${h3('ทีม (Team Plan)')}
      ${tm.team ? `
        <p style="margin:0 0 8px"><b>${esc(tm.team.name)}</b> · <span class="pill">${tm.team.role === 'owner' ? 'หัวหน้าทีม' : 'สมาชิก'}</span> · <span class="muted">${tm.members.length}/${tm.team.max_seats} คน · ${tm.team.shared_pool ? 'งบรวมทั้งทีม' : 'แยกโควตาต่อคน'}</span></p>
        <p class="muted" style="margin:0 0 12px">แพลน ${esc(tm.team.plan_name || me.plan.name)} · หมดอายุ ${when(tm.team.expires)}</p>
        ${tm.team.role === 'owner' ? `
          <form id="tnamef" class="row" style="flex-wrap:nowrap;margin-bottom:10px"><input name="name" value="${esc(tm.team.name)}" maxlength="60" placeholder="ชื่อทีม" required><button class="btn out sm">Rename team</button></form>
          <label>โค้ดเชิญเข้าทีม</label>
          <div class="row" style="flex-wrap:nowrap;margin-bottom:10px"><input readonly value="${esc(tm.team.invite_code)}" id="tcode" aria-label="โค้ดเชิญเข้าทีม"><button type="button" class="btn out sm" id="cptc">Copy</button><button type="button" class="btn out sm" id="regtc">Shuffle</button></div>
          <form id="taddf" class="row" style="flex-wrap:nowrap;margin-bottom:10px"><input name="email" type="email" placeholder="เพิ่มสมาชิกที่มีบัญชีอยู่แล้ว (อีเมล)" required><button class="btn out sm">Add member</button></form>
          <form id="tinvf" class="row" style="flex-wrap:nowrap;margin-bottom:12px"><input name="email" type="email" placeholder="ส่งคำเชิญทางอีเมล (ยังไม่มีบัญชีก็ได้)" required><button class="btn blue sm">Send invite</button></form>
          <div class="row" style="margin-bottom:14px"><a class="btn blue sm" href="/plans?team=1&plan=${tm.team.plan_id}">Renew team plan</a><a class="btn out sm" href="/plans?team=1">Upgrade package</a></div>
        ` : ''}
        ${tm.team.role === 'owner' ? '<p class="muted" style="margin:0 0 8px;font-size:12.5px">แถบด้านล่างคือการใช้ 7 วันล่าสุดของแต่ละคน (% ของงบสัปดาห์ของแพลน)</p>' : ''}
        <div id="tmemlist">${tm.members.map(m => `<div class="mem tm"><span>${esc(m.email)} <small class="muted">${m.role === 'owner' ? '(หัวหน้าทีม)' : ''}</small></span>
          ${(tm.team.role === 'owner' && m.role !== 'owner') || (tm.team.role !== 'owner' && m.email === me.email) ? `<button data-rmm="${m.id}" aria-label="นำออก">${ic('x')}</button>` : ''}
          ${tm.team.role === 'owner' ? `<div class="mu"><div class="bar1"><div style="width:${Math.min(100, m.wk_pct || 0)}%"></div></div><b>${m.wk_pct || 0}%</b>${tm.team.shared_pool && m.role !== 'owner' ? `<select data-cap="${m.id}" aria-label="เพดานต่อคน"><option value="">ไม่จำกัด</option>${[10, 25, 50, 75].map(v => `<option value="${v}" ${m.cap_pct === v ? 'selected' : ''}>เพดาน ${v}%</option>`).join('')}</select>` : ''}</div>` : ''}</div>`).join('')}</div>
      ` : `
        <p class="muted">ยังไม่ได้อยู่ในทีม ซื้อแพลนทีมได้ที่ <a href="/plans">หน้าแพลน</a> หรือใส่โค้ดเชิญเพื่อเข้าร่วมทีม</p>
        <form id="tjoinf" class="row" style="flex-wrap:nowrap"><input name="code" placeholder="โค้ดเชิญทีม (เช่น A1B2C3D4)" value="${esc((qs().get('join') || '').toUpperCase().slice(0, 12))}" autocapitalize="characters" required><button class="btn blue sm">Join team</button></form>
      `}
    </div>

    <div class="card acc-c" id="sec-wallet">${h3('Wallet')}
      ${sw('overflow', me.wallet_overflow, 'ใช้ Wallet เมื่อลิมิตเต็ม', 'แชตต่อได้ คิดตามราคาต่อ token จริง')}
      ${me.plan.expires ? sw('renew', me.auto_renew, 'ต่ออายุแพลนอัตโนมัติ', 'ตัดเงินจาก Wallet ก่อนหมดอายุ 1 วัน ถ้ายอดพอ') : ''}
      <form id="cp" class="row" style="flex-wrap:nowrap;margin-top:12px"><input name="code" placeholder="โค้ดคูปองเครดิต" autocapitalize="characters" required><button class="btn out sm">Apply coupon</button></form><div class="err" id="cpe"></div>
      ${w.tx.length ? `<details class="faq" style="margin-top:8px"><summary>ประวัติ Wallet</summary><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>รายการ</th><th>จำนวน</th><th>คงเหลือ</th></tr>
        ${w.tx.map(t => `<tr><td>${when(t.created_at)}</td><td>${TX_KIND[t.kind] || esc(t.kind)}${t.ref ? ` <span class="muted">${esc(t.ref)}</span>` : ''}</td><td class="${t.amount < 0 ? 'bad' : 'ok'}">${t.amount < 0 ? '-' : '+'}฿${money(Math.abs(t.amount))}</td><td>฿${baht(t.balance_after)}</td></tr>`).join('')}</table></div></details>` : ''}</div>

    ${w.bonus > 0 ? `<div class="card acc-c" id="sec-ref">${h3('ชวนเพื่อน')}<p class="muted">เพื่อนสมัครผ่านลิงก์นี้ แล้วจ่ายเงินครั้งแรก รับเครดิตคนละ ฿${baht(w.bonus)}</p>
      <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(refLink)}" id="ref" aria-label="ลิงก์ชวนเพื่อน"><button class="btn out sm" id="cpref">Copy</button></div>
      <p class="muted" style="margin:8px 0 0">ชวนแล้ว ${w.referred} คน · จ่ายแล้ว ${w.referred_paid} คน</p></div>` : ''}

    <div class="card acc-c" id="sec-ai">${h3('ปรับ AI ให้เป็นของคุณ')}
      <label>คำสั่งส่วนตัว (ส่งไปกับทุกแชต)</label><textarea id="ins" rows="4" maxlength="3000" placeholder="เช่น ตอบสั้นๆ เป็นภาษาไทย ฉันเป็นนักพัฒนา Python">${esc(me.instructions || '')}</textarea>
      <button class="btn out sm" id="insave">Save</button> <span id="insok"></span>
      <label style="margin-top:16px">ความจำ (${mems.length}/50)</label>
      <div id="mems">${mems.map(m => `<div class="mem"><span>${esc(m.text)}</span><button data-mem="${m.id}" aria-label="ลบ">${ic('x')}</button></div>`).join('') || '<p class="muted">ยังไม่มี กด "จำไว้" ใต้ข้อความในแชต หรือเพิ่มเองด้านล่าง</p>'}</div>
      <form id="memf" class="row" style="flex-wrap:nowrap"><input name="text" maxlength="300" placeholder="เช่น ฉันชื่อแซม ทำงานด้านการตลาด" required><button class="btn out sm">Add</button></form></div>

    <div class="card acc-c" id="sec-security">${h3('ความปลอดภัย')}
      <div class="row"><button class="btn out sm" id="pw">Email password reset link</button><span id="pe"></span></div>
      <div style="margin-top:20px"><div style="font-weight:600;margin-bottom:6px">อุปกรณ์ที่ล็อกอินอยู่</div><div id="devs" class="muted">กำลังโหลด...</div></div>
      <div id="tfa" style="margin-top:20px"></div>
      ${me.line ? '<p class="muted" style="margin:16px 0 0">เชื่อม LINE แล้ว</p>' : ''}</div>

    <div class="card acc-c" id="sec-api">${h3('API สำหรับนักพัฒนา')}<p class="muted">สร้าง API key แล้วเรียกโมเดลทั้งหมดแบบ OpenAI จ่ายจาก Wallet</p><a class="btn out sm" href="/developers">Manage API keys</a></div>

    <div class="card acc-c" id="sec-data">${h3('ข้อมูลของคุณ')}
      <div class="row"><a class="btn out sm" href="/api/me/export" download>Download all data</a><a class="btn out sm" href="/support">Contact us</a><button class="btn out sm danger" id="del">Delete account</button></div></div>

    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>${footer()}</div>`);

  const doOut = async () => { await api('/logout', { method: 'POST' }); me = null; go('/'); };
  $('#outTop').onclick = doOut;
  const toggle = (id, key) => $(id)?.addEventListener('change', async e => { try { await api('/me', { method: 'PUT', body: { [key]: e.target.checked } }); } catch (x) { e.target.checked = !e.target.checked; toast(x.message, 'bad'); } });
  toggle('#overflow', 'wallet_overflow'); toggle('#renew', 'auto_renew');
  $('#cp').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/coupon/redeem', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(`เติมเครดิต ฿${baht(r.amount)} แล้ว`, 'ok'); boot(); }
    catch (x) { $('#cpe').textContent = x.message; }
  };
  $('#cpref')?.addEventListener('click', e => copy($('#ref').value, e.target));
  $('#insave').onclick = async () => { await api('/me', { method: 'PUT', body: { instructions: $('#ins').value } }); $('#insok').innerHTML = '<span class="ok">บันทึกแล้ว</span>'; };
  $('#mems').onclick = async e => { const b = e.target.closest('[data-mem]'); if (!b) return; await api('/memories/' + b.dataset.mem, { method: 'DELETE' }); b.parentElement.remove(); };
  $('#memf').onsubmit = async e => { e.preventDefault(); try { await api('/memories', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); boot(); } catch (x) { toast(x.message, 'bad'); } };
  $('#pw').onclick = async e => { // รหัสผ่านอยู่ใน Firebase
    e.target.disabled = true;
    try { await api('/auth', { method: 'POST', body: { action: 'forgot', email: me.email } }); $('#pe').innerHTML = '<span class="ok">ส่งแล้ว ดูในอีเมล</span>'; }
    catch (x) { $('#pe').innerHTML = `<span class="bad">${esc(x.message)}</span>`; e.target.disabled = false; }
  };
  const loadDevs = async () => {
    const list = await api('/sessions').catch(() => []), el = $('#devs'); if (!el) return;
    el.innerHTML = list.map(x => `<div class="mem"><span>${esc((x.ua || 'อุปกรณ์ไม่ทราบชนิด').replace(/\(.*?\)/g, '').slice(0, 70))} <small class="muted">${esc(x.ip)} · ${x.created_at ? when(x.created_at) : ''}${x.current ? ' · เครื่องนี้' : ''}</small></span>${x.current ? '' : `<button data-dev="${x.id}" aria-label="ออกจากระบบเครื่องนี้">${ic('x')}</button>`}</div>`).join('') + (list.length > 1 ? '<button class="btn out sm" id="devall" style="margin-top:8px">Log out other devices</button>' : '');
    el.querySelectorAll('[data-dev]').forEach(b => b.onclick = async () => { await api('/sessions/' + b.dataset.dev, { method: 'DELETE' }); loadDevs(); });
    $('#devall')?.addEventListener('click', async () => { if (await confirmSheet('ออกจากระบบทุกเครื่องยกเว้นเครื่องนี้?', { title: 'ออกจากระบบเครื่องอื่น', ok: 'Log out' })) { await api('/sessions', { method: 'DELETE' }); loadDevs(); } });
  };
  loadDevs();
  $('#del').onclick = async () => {
    const v = await promptSheet(`แชต โปรเจกต์ ความจำ และ API key จะหายทั้งหมด และเงินใน Wallet จะใช้ไม่ได้อีก\n\nพิมพ์อีเมล ${me.email} เพื่อยืนยัน`, '', { title: 'ลบบัญชีถาวร', placeholder: me.email, ok: 'Delete account forever' });
    if (!v) return;
    try { await api('/me/delete', { method: 'POST', body: { confirm: v } }); me = null; toast('ลบบัญชีแล้ว'); go('/'); } catch (x) { toast(x.message, 'bad'); }
  };

  $('#tjoinf')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/team/join', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('เข้าร่วมทีมแล้ว', 'ok'); boot(); }
    catch (x) { toast(x.message, 'bad'); }
  });
  $('#tnamef')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/team', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('บันทึกชื่อทีมแล้ว', 'ok'); boot(); }
    catch (x) { toast(x.message, 'bad'); }
  });
  $('#cptc')?.addEventListener('click', e => copy($('#tcode').value, e.target));
  $('#regtc')?.addEventListener('click', async () => {
    if (!await confirmSheet('สุ่มโค้ดเชิญใหม่? โค้ดเดิมจะใช้ไม่ได้', { title: 'สุ่มโค้ดเชิญ' })) return;
    await api('/team', { method: 'PUT', body: { regen_code: true } }); boot();
  });
  $('#taddf')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('/team/add', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('เพิ่มสมาชิกแล้ว', 'ok'); boot(); }
    catch (x) { toast(x.message, 'bad'); }
  });
  $('#tinvf')?.addEventListener('submit', async e => {
    e.preventDefault();
    try { const r = await api('/team/invite', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(r.sent ? 'ส่งคำเชิญแล้ว' : 'ยังส่งอีเมลไม่ได้ (ระบบอีเมลไม่พร้อม) ให้ส่งโค้ดเชิญเอง', r.sent ? 'ok' : 'bad'); e.target.reset(); }
    catch (x) { toast(x.message, 'bad'); }
  });
  $('#tmemlist')?.addEventListener('change', async e => {
    const c = e.target.closest('[data-cap]'); if (!c) return;
    try { await api('/team/members/' + c.dataset.cap, { method: 'PUT', body: { cap_pct: c.value ? +c.value : null } }); toast('ตั้งเพดานแล้ว', 'ok'); }
    catch (x) { toast(x.message, 'bad'); boot(); }
  });
  $('#tmemlist')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-rmm]'); if (!b) return;
    if (!await confirmSheet(tm.team.role === 'owner' ? 'นำสมาชิกคนนี้ออกจากทีม?' : 'ออกจากทีมนี้?', { title: 'ยืนยัน', ok: 'Confirm', danger: true })) return;
    try { await api('/team/members/' + b.dataset.rmm, { method: 'DELETE' }); toast('อัปเดตสมาชิกทีมแล้ว'); boot(); }
    catch (x) { toast(x.message, 'bad'); }
  });

  tfa();
  bindInstall();
};

function tfa() { // 2FA: ตั้งค่า → สแกน QR / แตะลิงก์ → ใส่รหัสเพื่อเปิดใช้
  const box = $('#tfa');
  const codeForm = (label, btn) => `<form id="tf" class="row" style="flex-wrap:nowrap;margin-top:8px"><input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="${label}" required><button class="btn out sm">${btn}</button></form><div class="err" id="te"></div>`;
  const bind = path => $('#tf').onsubmit = async e => {
    e.preventDefault();
    try { await api(path, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await loadMe(); tfa(); }
    catch (x) { $('#te').textContent = x.message; }
  };
  if (me.totp_on) { box.innerHTML = `<b>ยืนยันตัวตน 2 ขั้น (2FA)</b> <span class="ok">เปิดอยู่</span><p class="muted">ปิดได้โดยใส่รหัสจากแอป</p>${codeForm('รหัส 6 หลัก', 'ปิด 2FA')}`; return bind('/2fa/disable'); }
  box.innerHTML = `<b>ยืนยันตัวตน 2 ขั้น (2FA)</b> <span class="muted">ปิดอยู่</span><p class="muted">ใช้แอป Google Authenticator, Microsoft Authenticator หรือ 1Password</p><button class="btn out sm" id="tfs">Set up 2FA</button>`;
  $('#tfs').onclick = async () => {
    const r = await api('/2fa/setup', { method: 'POST' });
    let qr = '';
    try { await lib('qr'); const q = qrcode(0, 'M'); q.addData(r.uri); q.make(); qr = `<div class="qrbox">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>`; } catch { }
    box.innerHTML = `<b>ตั้งค่า 2FA</b><p class="muted">1. สแกน QR ด้วยแอป หรือแตะปุ่มถ้าอยู่บนมือถือเครื่องเดียวกับแอป</p>${qr}
      <p><a class="btn out sm" href="${esc(r.uri)}">Open in Authenticator</a></p><p class="muted">หรือพิมพ์รหัสนี้เอง: <code>${esc(r.secret.match(/.{1,4}/g).join(' '))}</code></p>
      <p class="muted">2. ใส่รหัส 6 หลักจากแอปเพื่อเปิดใช้</p>${codeForm('รหัส 6 หลัก', 'เปิด 2FA')}`;
    bind('/2fa/enable');
  };
}
