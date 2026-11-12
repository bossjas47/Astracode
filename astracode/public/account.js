// AstraCode: หน้าบัญชี (แพลน, Wallet, ชวนเพื่อน, ความจำ, ความปลอดภัย, ข้อมูลส่วนตัว)
LIBS.qr = [CDN + 'qrcode-generator@1.4.4/qrcode.js', 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k'];
const TX_KIND = { topup: 'เติมเงิน', coupon: 'คูปอง', referral: 'ชวนเพื่อน', plan: 'ซื้อแพลน', renew: 'ต่ออายุอัตโนมัติ', overflow: 'ใช้เกินลิมิต', api: 'API', admin: 'ปรับโดยแอดมิน' };
const h3 = t => `<div style="font:600 19px var(--display);margin-bottom:8px">${t}</div>`;
const sw = (id, on, label, hint) => `<label class="tg"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span><b>${label}</b><small class="muted">${hint}</small></span></label>`;

PAGES.account = async function account() {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  await loadMe();
  const [w, mems] = await Promise.all([api('/wallet'), api('/memories')]);
  const u = me.usage, refLink = `${location.origin}/login?ref=${me.ref_code}`;
  page(nav() + `<div class="wrap" style="max-width:640px"><section class="hero" style="padding:48px 0 16px"><h1>บัญชี</h1>
    <p>${esc(me.email)}</p></section>

    <div class="card"><div class="grid">
      <div class="tile"><div class="muted">แพลน</div><div class="stat">${esc(me.plan.name)}</div><div class="muted">${me.plan.expires ? 'หมดอายุ ' + when(me.plan.expires) : 'ไม่มีวันหมดอายุ'}</div></div>
      <div class="tile"><div class="muted">ลิมิต 4 ชม.</div><div class="stat">${u.pct4h}%</div><div class="muted">รีเซ็ต ${u.reset4h ? when(u.reset4h) : '-'}</div></div>
      <div class="tile"><div class="muted">ลิมิตสัปดาห์</div><div class="stat">${u.pctWeek}%</div><div class="muted">รีเซ็ต ${when(u.resetWeek)}</div></div>
      <div class="tile"><div class="muted">Wallet</div><div class="stat">฿${baht(w.balance)}</div><a href="/plans?topup=1">เติมเงิน</a></div>
    </div></div>

    <div class="card">${h3('Wallet')}
      ${sw('overflow', me.wallet_overflow, 'ใช้ Wallet เมื่อลิมิตเต็ม', 'แชตต่อได้ คิดตามราคาต่อ token จริง')}
      ${me.plan.expires ? sw('renew', me.auto_renew, 'ต่ออายุแพลนอัตโนมัติ', 'ตัดเงินจาก Wallet ก่อนหมดอายุ 1 วัน ถ้ายอดพอ') : ''}
      <form id="cp" class="row" style="flex-wrap:nowrap;margin-top:12px"><input name="code" placeholder="โค้ดคูปองเครดิต" autocapitalize="characters" required><button class="btn out sm">ใช้คูปอง</button></form><div class="err" id="cpe"></div>
      ${w.tx.length ? `<details class="faq" style="margin-top:8px"><summary>ประวัติ Wallet</summary><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>รายการ</th><th>จำนวน</th><th>คงเหลือ</th></tr>
        ${w.tx.map(t => `<tr><td>${when(t.created_at)}</td><td>${TX_KIND[t.kind] || esc(t.kind)}${t.ref ? ` <span class="muted">${esc(t.ref)}</span>` : ''}</td><td class="${t.amount < 0 ? 'bad' : 'ok'}">${t.amount < 0 ? '-' : '+'}฿${money(Math.abs(t.amount))}</td><td>฿${baht(t.balance_after)}</td></tr>`).join('')}</table></div></details>` : ''}</div>

    ${w.bonus > 0 ? `<div class="card">${h3('ชวนเพื่อน')}<p class="muted">เพื่อนสมัครผ่านลิงก์นี้ แล้วจ่ายเงินครั้งแรก รับเครดิตคนละ ฿${baht(w.bonus)}</p>
      <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(refLink)}" id="ref"><button class="btn out sm" id="cpref">คัดลอก</button></div>
      <p class="muted" style="margin:8px 0 0">ชวนแล้ว ${w.referred} คน · จ่ายแล้ว ${w.referred_paid} คน</p></div>` : ''}

    <div class="card">${h3('ปรับ AI ให้เป็นของคุณ')}
      <label>คำสั่งส่วนตัว (ส่งไปกับทุกแชต)</label><textarea id="ins" rows="4" maxlength="3000" placeholder="เช่น ตอบสั้นๆ เป็นภาษาไทย ฉันเป็นนักพัฒนา Python">${esc(me.instructions || '')}</textarea>
      <button class="btn out sm" id="insave">บันทึก</button> <span id="insok"></span>
      <label style="margin-top:16px">ความจำ (${mems.length}/50)</label>
      <div id="mems">${mems.map(m => `<div class="mem"><span>${esc(m.text)}</span><button data-mem="${m.id}" aria-label="ลบ">${ic('x')}</button></div>`).join('') || '<p class="muted">ยังไม่มี กด "จำไว้" ใต้ข้อความในแชต หรือเพิ่มเองด้านล่าง</p>'}</div>
      <form id="memf" class="row" style="flex-wrap:nowrap"><input name="text" maxlength="300" placeholder="เช่น ฉันชื่อแซม ทำงานด้านการตลาด" required><button class="btn out sm">เพิ่ม</button></form></div>

    <div class="card">${h3('ความปลอดภัย')}
      <div class="row"><button class="btn out sm" id="pw">ส่งลิงก์เปลี่ยนรหัสผ่านไปที่อีเมล</button><span id="pe"></span></div>
      <div id="tfa" style="margin-top:20px"></div>
      ${me.line ? '<p class="muted" style="margin:16px 0 0">เชื่อม LINE แล้ว</p>' : ''}</div>

    <div class="card">${h3('API สำหรับนักพัฒนา')}<p class="muted">สร้าง API key แล้วเรียกโมเดลทั้งหมดแบบ OpenAI จ่ายจาก Wallet</p><a class="btn out sm" href="/developers">จัดการ API key</a></div>

    <div class="card">${h3('ข้อมูลของคุณ')}
      <div class="row"><a class="btn out sm" href="/api/me/export" download>ดาวน์โหลดข้อมูลทั้งหมด</a><a class="btn out sm" href="/support">ติดต่อเรา</a><button class="btn out sm danger" id="del">ลบบัญชี</button></div></div>

    <div class="row" style="justify-content:center;margin:24px 0"><button class="btn out" id="out">ออกจากระบบ</button></div>
    <div class="band"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>${footer()}</div>`);

  $('#out').onclick = async () => { await api('/logout', { method: 'POST' }); me = null; go('/'); };
  const toggle = (id, key) => $(id)?.addEventListener('change', async e => { try { await api('/me', { method: 'PUT', body: { [key]: e.target.checked } }); } catch (x) { e.target.checked = !e.target.checked; alert(x.message); } });
  toggle('#overflow', 'wallet_overflow'); toggle('#renew', 'auto_renew');
  $('#cp').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/coupon/redeem', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); alert(`เติมเครดิต ฿${baht(r.amount)} แล้ว`); boot(); }
    catch (x) { $('#cpe').textContent = x.message; }
  };
  $('#cpref')?.addEventListener('click', e => copy($('#ref').value, e.target));
  $('#insave').onclick = async () => { await api('/me', { method: 'PUT', body: { instructions: $('#ins').value } }); $('#insok').innerHTML = '<span class="ok">บันทึกแล้ว</span>'; };
  $('#mems').onclick = async e => { const b = e.target.closest('[data-mem]'); if (!b) return; await api('/memories/' + b.dataset.mem, { method: 'DELETE' }); b.parentElement.remove(); };
  $('#memf').onsubmit = async e => { e.preventDefault(); try { await api('/memories', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); boot(); } catch (x) { alert(x.message); } };
  $('#pw').onclick = async e => { // รหัสผ่านอยู่ใน Firebase
    e.target.disabled = true;
    try { await lib('fb'); await FB.reset(me.email); $('#pe').innerHTML = '<span class="ok">ส่งแล้ว ดูในอีเมล</span>'; }
    catch (x) { $('#pe').innerHTML = `<span class="bad">${esc(x.code === 'auth/too-many-requests' ? 'ขอบ่อยเกินไป รอสักครู่' : 'ส่งไม่ได้ ลองใหม่')}</span>`; e.target.disabled = false; }
  };
  $('#del').onclick = async () => {
    const v = prompt(`ลบบัญชีถาวร: แชต โปรเจกต์ ความจำ และ API key จะหายทั้งหมด และเงินใน Wallet จะใช้ไม่ได้อีก\n\nพิมพ์อีเมล ${me.email} เพื่อยืนยัน`);
    if (!v) return;
    try { await api('/me/delete', { method: 'POST', body: { confirm: v } }); me = null; alert('ลบบัญชีแล้ว'); go('/'); } catch (x) { alert(x.message); }
  };
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
  box.innerHTML = `<b>ยืนยันตัวตน 2 ขั้น (2FA)</b> <span class="muted">ปิดอยู่</span><p class="muted">ใช้แอป Google Authenticator, Microsoft Authenticator หรือ 1Password</p><button class="btn out sm" id="tfs">ตั้งค่า 2FA</button>`;
  $('#tfs').onclick = async () => {
    const r = await api('/2fa/setup', { method: 'POST' });
    let qr = '';
    try { await lib('qr'); const q = qrcode(0, 'M'); q.addData(r.uri); q.make(); qr = `<div class="qrbox">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>`; } catch { }
    box.innerHTML = `<b>ตั้งค่า 2FA</b><p class="muted">1. สแกน QR ด้วยแอป หรือแตะปุ่มถ้าอยู่บนมือถือเครื่องเดียวกับแอป</p>${qr}
      <p><a class="btn out sm" href="${esc(r.uri)}">เปิดในแอป Authenticator</a></p><p class="muted">หรือพิมพ์รหัสนี้เอง: <code>${esc(r.secret.match(/.{1,4}/g).join(' '))}</code></p>
      <p class="muted">2. ใส่รหัส 6 หลักจากแอปเพื่อเปิดใช้</p>${codeForm('รหัส 6 หลัก', 'เปิด 2FA')}`;
    bind('/2fa/enable');
  };
}
