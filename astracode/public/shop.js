// AstraCode: หน้าแพลน + ชำระเงิน + เติม Wallet และหน้าราคาต่อ token (แยกจาก app.js · โหลดเฉพาะ plans.html / pricing.html)
// ---------- แพลน + ชำระเงิน + เติม Wallet ----------
const PAY_STATUS = { pending: '<span class="warn">รออนุมัติ</span>', approved: '<span class="ok">สำเร็จ</span>', rejected: '<span class="bad">ไม่อนุมัติ</span>', refunded: '<span class="muted">คืนเงินแล้ว</span>' };
// สลิปถูกปฏิเสธ: ลูกค้าส่งให้แอดมินตรวจเอง (เช่นระบบอ่านบัญชีผู้รับผิด)
const askReview = async (id, btn) => { btn.disabled = true; try { await api('/pay/' + id + '/review', { method: 'POST' }); btn.outerHTML = '<span class="warn">ส่งให้แอดมินตรวจแล้ว</span>'; } catch (x) { toast(x.message, 'bad'); btn.disabled = false; } };
// ตารางเทียบแพลน: ราคา, จำนวนโมเดล, ข้อความโดยประมาณ, API, ที่นั่ง
const cmpTable = ps => ps.length < 2 ? '' : `<details class="faq" style="max-width:920px;margin:14px auto"><summary>เปรียบเทียบแพลนแบบตาราง</summary><div class="tw"><table class="tbl cmp"><tr><th></th>${ps.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>
  ${[['ราคา/เดือน', p => p.price ? '฿' + baht(p.price) : 'ฟรี'], ['รายปี', p => p.price_year ? '฿' + baht(p.price_year) : '-'], ['จำนวนโมเดล', p => p.models?.length || 0],
    ['ข้อความ/สัปดาห์ (โมเดลประหยัดสุด)', p => p.models?.length ? '~' + Math.max(...p.models.map(m => m.week)).toLocaleString(LOC) : '-'], ['API key', p => p.price > 0 ? ic('check', 'sm ok') : '-'], ['API หักจากลิมิตแพลน', p => p.api_limit ? ic('check', 'sm ok') : '-'],
    ['ที่นั่ง', p => p.seats || 1], ['งบรวมทั้งทีม', p => p.shared_pool ? ic('check', 'sm ok') : '-']].map(([l, f]) => `<tr><th scope="row">${l}</th>${ps.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</table></div></details>`;
async function plansPage() {
  const plans = await api('/plans');
  const hasYear = plans.some(p => p.price_year > 0);
  if (!me) { page(nav() + `<div class="wrap"><section class="hero" style="padding-bottom:24px"><h1>เลือกแพลน</h1><div style="margin-top:12px">${curSegHTML()}</div></section>${planTiles(plans.filter(x => x.seats <= 1))}${plans.some(x => x.seats > 1) ? `<h2 style="text-align:center;margin:36px 0 4px">Team</h2><p class="muted" style="text-align:center;margin:0 0 16px">หนึ่งแพ็กเกจ ใช้ร่วมกันหลายคน</p>${planTiles(plans.filter(x => x.seats > 1))}` : ''}<p style="text-align:center;margin:28px"><a class="btn blue" href="/login">Sign up</a></p><div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}<p style="text-align:center;margin:8px 0 0"><button type="button" class="btn out" id="quote">ขอใบเสนอราคาสำหรับองค์กร</button></p></div>${footer()}</div>`); $('#quote')?.addEventListener('click', () => quoteSheet(plans)); app.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { localStorage.setItem('cur', b.dataset.cur); plansPage(); }); return; }
  const pays = await api('/pay');
  const hasTeam = plans.some(x => x.seats > 1), wantPlan = +qs().get('plan') || null;
  let aud = hasTeam && (qs().get('team') || me.plan.team) ? 'team' : 'solo', sel = plans.find(x => x.id === wantPlan && x.price > 0)?.id || null, period = 'month', coupon = null, tab = qs().get('topup') ? 'topup' : 'plan';
  const priceOf = p => period === 'year' && p.price_year ? p.price_year : p.price;
  const payInfo = () => { // ข้อมูลบัญชีรับเงิน + QR Thai QR รูปนิ่ง (สแกนได้จากแอปธนาคารไหนก็ได้ ใส่ยอดเอง)
    const i = me.pay_info || {}, row = (l, v, cp) => v ? `<div class="pi-r"><span class="muted">${l}</span><b>${esc(v)}</b>${cp ? `<button type="button" class="btn out sm" data-cp="${esc(cp)}">Copy</button>` : ''}</div>` : '';
    if (!me.promptpay_id && !i.bank_account) return '';
    return `<div class="pay-info">${row('ชื่อบัญชี', i.bank_holder)}${row(i.bank_name || 'ธนาคาร', i.bank_account, String(i.bank_account || '').replace(/\D/g, ''))}${row('พร้อมเพย์', me.promptpay_id, me.promptpay_id)}
      <details ${tab === 'topup' ? 'open' : ''}><summary>สแกน Thai QR (โอนได้ทุกธนาคาร ใส่ยอดเอง)</summary><img class="thai-qr" src="/thai-qr.jpg" alt="Thai QR PromptPay" loading="lazy"></details>
      <p class="muted" style="font-size:13px;margin:8px 0 0">${tab === 'topup' ? `โอนเท่าไหร่ก็ได้ตั้งแต่ ฿${+site.topup_min || 10} ระบบเติม Wallet ตามยอดในสลิป` : 'ต้องโอนยอดตรงตามที่ระบุเป๊ะ'} · อัปโหลดสลิปภายใน 15 นาทีหลังโอน · สลิปใช้ได้ครั้งเดียว</p></div>`;
  };
  const qr = amount => me.promptpay_id ? `<p class="muted">สแกนจ่ายผ่าน PromptPay แล้วอัปโหลดสลิป</p><img class="qr" alt="QR PromptPay" src="https://promptpay.io/${encodeURIComponent(me.promptpay_id)}/${amount}.png">${payInfo()}` : `<p class="warn">ยังไม่ได้ตั้งค่า PromptPay</p>${payInfo()}`;
  const slipForm = label => `<form id="f" style="max-width:400px;margin:16px auto 0"><label>รูปสลิป</label><input type="file" name="slip" accept="image/*" required style="border-radius:20px">
    <div class="err" id="e"></div><button class="btn blue" style="width:100%">${label}</button><p class="muted" style="margin:12px 0 0">การชำระเงินถือว่ายอมรับ<a href="/terms">เงื่อนไขการคืนเงิน</a></p></form>`;
  const draw = () => {
    const p = plans.find(x => x.id === sel), total = p ? Math.max(0, priceOf(p) - (coupon?.discount || 0)) : 0;
    page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 24px"><h1>${tab === 'topup' ? 'เติมเงิน Wallet' : 'เลือกแพลน'}</h1>
      <p>แพลนปัจจุบัน: ${esc(me.plan.name)}${me.plan.expires ? ' · หมดอายุ ' + when(me.plan.expires) : ''} · Wallet ฿${baht(me.balance)}</p>
      <div class="row" style="justify-content:center;margin-top:12px"><div class="seg" style="margin:0"><button data-tab="plan" class="${tab === 'plan' ? 'on' : ''}">Buy plan</button><button data-tab="topup" class="${tab === 'topup' ? 'on' : ''}">Top up Wallet</button></div>${curSegHTML()}</div></section>
      ${tab === 'plan' ? `
        ${hasYear ? `<div style="text-align:center;margin-bottom:16px"><div class="seg"><button data-per="month" class="${period === 'month' ? 'on' : ''}">Monthly</button><button data-per="year" class="${period === 'year' ? 'on' : ''}">Yearly</button></div></div>` : ''}
        ${hasTeam ? `<div style="text-align:center;margin-bottom:16px"><div class="seg"><button data-aud="solo" class="${aud === 'solo' ? 'on' : ''}">Personal</button><button data-aud="team" class="${aud === 'team' ? 'on' : ''}">Team</button></div></div>` : ''}
        ${aud === 'team' ? '<p class="muted" style="text-align:center;margin:-4px 0 16px">แพ็กเกจเดียว ใช้ร่วมกันหลายคน ซื้อแล้วคุณเป็นหัวหน้าทีม เชิญสมาชิกได้ที่หน้าบัญชี</p>' : ''}
        ${planTiles(plans.filter(x => x.price > 0 && (aud === 'team' ? x.seats > 1 : x.seats <= 1) && (period === 'month' || x.price_year > 0)), sel, period)}
        ${cmpTable(plans.filter(x => aud === 'team' ? x.seats > 1 : x.seats <= 1))}
        ${p ? `<div class="card pay" id="pay" style="text-align:center"><div style="font:600 24px var(--display)">${esc(p.name)} · ${period === 'year' ? '1 ปี' : (p.days || 30) + ' วัน'}</div>
          <div class="price" style="margin:8px 0">${coupon?.discount ? `<s class="muted" style="font-size:20px">${fmtPlanPrice(priceOf(p))}</s> ` : ''}${fmtPlanPrice(total)}${getCur() === 'USD' && total > 0 ? `<div class="muted" style="font-size:13px;margin-top:4px">ยอดโอน PromptPay: ฿${baht(total)}</div>` : ''}</div>
          <form id="cf" class="row" style="max-width:400px;margin:0 auto;flex-wrap:nowrap"><input name="code" placeholder="โค้ดคูปอง" value="${esc(coupon?.code || '')}" autocapitalize="characters"><button class="btn out sm">Apply</button></form>
          <div class="err" id="ce"></div>
          ${me.balance >= total && total > 0 ? `<button class="btn blue" id="wpay" style="margin:12px 0">Pay with Wallet (฿${baht(me.balance)})</button><p class="muted">หรือโอนผ่าน PromptPay</p>` : ''}
          ${total > 0 ? qr(total) + slipForm('ส่งสลิป') : '<button class="btn blue" id="free" style="margin-top:12px">Activate free plan with coupon</button>'}</div>`
        : '<p class="muted" style="text-align:center">แตะแพลนเพื่อชำระเงิน</p>'}
        <div class="band"><h2>เทียบแพลน</h2>${compareTable(plans)}<p style="text-align:center;margin:8px 0 0"><button type="button" class="btn out" id="quote">ขอใบเสนอราคาสำหรับองค์กร</button></p></div>`
      : `<div class="card pay" style="text-align:center;max-width:520px;margin:0 auto"><p class="muted">เงินใน Wallet ใช้กับ API สำหรับนักพัฒนา ใช้ต่อเมื่อลิมิตแพลนเต็ม (เปิดได้ในหน้าบัญชี) และจ่ายค่าแพลน</p>
          <label>จำนวนเงิน (บาท)</label><input id="amt" type="number" inputmode="decimal" min="${+site.topup_min || 10}" max="50000" step="1" value="${+site.topup_min || 100}" style="text-align:center;font-size:24px">
          <div class="row" style="justify-content:center;margin-top:8px">${[100, 300, 500, 1000].map(v => `<button class="btn out sm" data-amt="${v}">฿${v}</button>`).join('')}</div>
          <div id="tq">${qr(+site.topup_min || 100)}</div>${slipForm('ส่งสลิปเติมเงิน')}</div>`}
      ${pays.length ? `<div class="card"><div style="font:600 19px var(--display)">ประวัติการชำระ</div><div class="tw"><table class="tbl"><tr><th>วันที่</th><th>รายการ</th><th>ยอด</th><th>สถานะ</th><th></th></tr>
        ${pays.map(x => `<tr><td>${when(x.created_at)}</td><td>${x.kind === 'topup' ? 'เติม Wallet' : esc(x.plan_name) + (x.period === 'year' ? ' (รายปี)' : '')}</td><td>฿${baht(x.amount)}</td><td>${PAY_STATUS[x.status] || esc(x.status)}</td><td>${x.status === 'approved' ? `<a href="/receipt?id=${x.id}">ใบเสร็จ</a>` : x.status === 'rejected' && x.created_at > Date.now() - 30 * 864e5 ? (x.review ? '<span class="warn">รอแอดมินตรวจ</span>' : `<button class="btn out sm" data-rv="${x.id}">ให้แอดมินตรวจ</button>`) : ''}</td></tr>`).join('')}</table></div></div>` : ''}
      ${footer()}</div>`);
    app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
    app.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { localStorage.setItem('cur', b.dataset.cur); draw(); });
    app.querySelectorAll('[data-aud]').forEach(b => b.onclick = () => { aud = b.dataset.aud; sel = null; coupon = null; draw(); });
    app.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { period = b.dataset.per; coupon = null; if (sel && !plans.find(x => x.id === sel)?.price_year && period === 'year') sel = null; draw(); });
    app.querySelectorAll('[data-plan]').forEach(t => t.onclick = () => { sel = +t.dataset.plan; coupon = null; draw(); $('#pay')?.scrollIntoView({ behavior: 'smooth' }); });
    $('#cf')?.addEventListener('submit', async e => {
      e.preventDefault(); const code = new FormData(e.target).get('code').trim();
      if (!code) { coupon = null; return draw(); }
      try { coupon = await api('/coupon/check', { method: 'POST', body: { code, plan_id: sel, period } }); draw(); } catch (x) { $('#ce').textContent = x.message; }
    });
    const submit = async (fd, btn, errBox) => {
      btn.disabled = true;
      try { const r = await api('/pay', { method: 'POST', body: fd }); await loadMe(); if (r.approved) go(`/receipt?id=${r.id}`); else { toast('ส่งสลิปแล้ว รอแอดมินตรวจ', 'ok'); boot(); } }
      catch (x) { errBox.textContent = x.message; btn.disabled = false; if (x.data?.pay_id) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn out sm'; b.style.marginTop = '8px'; b.textContent = 'ให้แอดมินตรวจสลิปนี้'; b.onclick = () => askReview(x.data.pay_id, b); errBox.append(document.createElement('br'), b); } }
    };
    const planFd = () => { const fd = new FormData(); fd.append('plan_id', sel); fd.append('period', period); if (coupon) fd.append('coupon', coupon.code); return fd; };
    $('#wpay')?.addEventListener('click', async e => { if (!await confirmSheet(`ตัดเงิน ฿${baht(total)} จาก Wallet เพื่อเปิดแพลนนี้?`, { title: 'ยืนยันการชำระเงิน', ok: 'Pay now' })) return; const fd = planFd(); fd.append('wallet', '1'); submit(fd, e.target, $('#ce')); });
    $('#free')?.addEventListener('click', e => submit(planFd(), e.target, $('#ce')));
    const amt = $('#amt');
    if (amt) {
      const upd = () => { $('#tq').innerHTML = qr(Math.max(0, Math.round(+amt.value || 0))); };
      amt.oninput = upd; app.querySelectorAll('[data-amt]').forEach(b => b.onclick = () => { amt.value = b.dataset.amt; upd(); });
    }
    app.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp, b));
    app.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => askReview(+b.dataset.rv, b));
    $('#quote')?.addEventListener('click', () => quoteSheet(plans));
    $('#f')?.addEventListener('submit', e => {
      e.preventDefault(); const fd = tab === 'plan' ? planFd() : new FormData();
      fd.append('slip', new FormData(e.target).get('slip'));
      if (tab === 'topup') { fd.append('kind', 'topup'); fd.append('amount', Math.round(+amt.value || 0)); }
      submit(fd, e.submitter, $('#e'));
    });
  };
  draw();
}


// ---------- หน้าราคาต่อ token (ตั้งค่าในหลังบ้าน → โมเดล / ตั้งค่า) ----------
async function pricing() {
  const d = await api('/pricing');
  let per = localStorage.getItem('per') || 'M';
  const unit = () => per === 'M' ? 'ต่อ 1M token' : 'ต่อ 1K token', u1 = () => per === 'M' ? '1M token' : '1K token', f = v => money(toCur(per === 'M' ? v : v / 1000));
  const planName = id => d.plans.find(p => p.id === id)?.name;
  const day = t => new Date(t).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: '2-digit' });
  const period = p => 'โปรโมชั่น' + (p.start && p.end ? ` ${day(p.start)} – ${day(p.end)}` : p.end ? 'ถึง ' + day(p.end) : p.start ? 'ตั้งแต่ ' + day(p.start) : '');
  const hasOff = d.models.some(m => m.official), showOff = () => hasOff && localStorage.getItem('offcmp') !== '0';
  // เทียบราคาทางการ (ตั้งเป็น USD ต่อ 1M token ในหลังบ้าน) กับราคาของเรา: ถูกกว่า/แพงกว่ากี่ %
  const offLine = (m, k) => {
    const o = +m.official?.[k]; if (!showOff() || !(o > 0) || !(m[k] > 0)) return '';
    const thb = o * usdRate(), pct = Math.round((1 - m[k] / thb) * 100);
    return `<small class="oc">ทางการ ${curSign()}${f(thb)} · <span class="${pct >= 0 ? 'ok' : 'bad'}">${pct === 0 ? 'เท่ากัน' : pct > 0 ? 'ถูกกว่า ' + pct + '%' : 'แพงกว่า ' + -pct + '%'}</span></small>`;
  };
  const cell = (m, k) => `<span class="pc-v"><b>${m.promo ? `<s class="muted">${curSign()}${f(m.promo[k])}</s> ` : ''}${curSign()}${f(m[k])}</b>${offLine(m, k)}</span>`;
  // ค่าใช้จ่ายต่อข้อความทั่วไป: ถูกมาก (ต่ำกว่า 0.1) บอกเป็น "กี่ข้อความต่อ 1 บาท/ดอลลาร์" จะอ่านง่ายกว่าเลขทศนิยมเล็กๆ
  const msgLine = m => { const v = toCur(m.req || (2000 * m.in + 500 * m.out) / 1e6); return v > 0 && v < 0.1 ? `≈ <b>${num(Math.floor(1 / v))} ข้อความ</b> ต่อ ${curSign()}1` : `≈ <b>${curSign()}${money(v)}</b> ต่อข้อความ${m.req ? '' : 'ทั่วไป'}`; };
  const card = m => `<div class="pc ${m.promo ? 'promo' : ''}"><div class="pc-h"><b>${esc(m.name)}</b><span class="pc-tags">${m.promo ? `<span class="pill sale">ลด ${m.promo.pct}%</span>` : ''}${m.vision ? '<span class="pill">อ่านรูป</span>' : ''}${m.effort ? '<span class="pill">Thinking</span>' : ''}</span></div>
    ${m.promo ? `<p class="sale-t">${period(m.promo)}</p>` : ''}
    ${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
    <div class="pc-rows">
      ${m.req ? `<div><span>ต่อ 1 request</span><span class="pc-v"><b>${curSign()}${money(toCur(m.req))}</b></span></div>` : `<div><span>Input <small class="muted">/ ${u1()}</small></span>${cell(m, 'in')}</div>
      <div><span>Output <small class="muted">/ ${u1()}</small></span>${cell(m, 'out')}</div>
      <div><span>Cache read <small class="muted">/ ${u1()}</small></span>${cell(m, 'cache')}</div>
      ${m.cache_write ? `<div><span>Cache write <small class="muted">/ ${u1()}</small></span>${cell(m, 'cache_write')}</div>` : ''}`}
    </div>
    <p class="pc-msg">${msgLine(m)}${m.req ? '' : ' <small class="muted">(ถาม+ประวัติ ~2,000 token · ตอบ ~500 token)</small>'}</p>
    <div class="pc-f"><span class="muted">ใช้ลิมิต ×${m.multiplier}${m.lim != null && m.lim !== 1 ? ` · หักจริง ×${m.lim}` : ''}</span><span class="muted">${m.plans.map(planName).filter(Boolean).map(esc).join(' · ') || 'ยังไม่อยู่ในแพลนไหน'}</span></div></div>`;
  const draw = () => {
    page(nav() + `<div class="wrap"><section class="hero" style="padding:56px 0 24px"><div class="name">AstraCode</div><h1>ราคาต่อ token</h1>
      <p>ราคาของแต่ละโมเดล เป็น${getCur() === 'USD' ? 'ดอลลาร์ ($)' : 'บาท (฿)'} ${unit()} โมเดลที่แพงกว่าจะใช้ลิมิตแพลนเร็วกว่า</p>
      <div class="row" style="justify-content:center">${hasOff ? `<div class="seg" style="margin:0" role="group" aria-label="เทียบราคาทางการ"><button data-off="1" class="${showOff() ? 'on' : ''}">เทียบราคาทางการ</button><button data-off="0" class="${showOff() ? '' : 'on'}">ไม่เทียบ</button></div>` : ''}<div class="seg" style="margin:0" role="group" aria-label="หน่วย"><button data-per="M" class="${per === 'M' ? 'on' : ''}">ต่อ 1M token</button><button data-per="K" class="${per === 'K' ? 'on' : ''}">ต่อ 1K token</button></div>${curSegHTML()}</div></section>
      <details class="card tok-help"><summary><b>Token คืออะไร?</b> <span class="muted">อ่าน 30 วินาที</span></summary><p>AI นับข้อความเป็น "token" ภาษาอังกฤษ 1 token ≈ 4 ตัวอักษร ภาษาไทย 1 token ≈ 1–2 ตัวอักษร ข้อความไทยยาวหนึ่งย่อหน้า (~300 ตัวอักษร) ≈ 200 token</p><p><b>Input</b> = สิ่งที่ส่งให้ AI (คำถาม ประวัติแชต ไฟล์แนบ) · <b>Output</b> = คำตอบของ AI · <b>Cache read</b> = ส่วนของประวัติแชตที่ AI จำไว้แล้ว ราคาถูกกว่ามาก</p><p>ราคาด้านล่างเป็นราคาต่อ <b>1 ล้าน token</b> (1M) ใช้เทียบกันระหว่างโมเดล ดูบรรทัด "≈ ต่อข้อความทั่วไป" จะเห็นค่าใช้จ่ายจริงง่ายกว่า ถ้าใช้ผ่านแพลน ไม่ต้องจ่ายตามนี้ แต่โมเดลที่แพงกว่าจะใช้ลิมิตเร็วกว่า</p></details>
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
    app.querySelectorAll('[data-off]').forEach(b => b.onclick = () => { localStorage.setItem('offcmp', b.dataset.off); draw(); });
    app.querySelectorAll('[data-cur]').forEach(b => b.onclick = () => { localStorage.setItem('cur', b.dataset.cur); draw(); });
    // คำนวณที่เซิร์ฟเวอร์ (/pricing/calc) เพื่อไม่ต้องส่งราคาทุนโมเดลมาให้เบราว์เซอร์
    let calcT = 0, calcSeq = 0;
    const calc = () => {
      clearTimeout(calcT);
      calcT = setTimeout(async () => {
        const m = d.models.find(x => x.id === +$('#cm')?.value); if (!m) return;
        const seq = ++calcSeq; let r;
        try { r = await api('/pricing/calc', { method: 'POST', body: { model_id: m.id, n: $('#cn').value, i: $('#ci').value, o: $('#co').value, c: $('#cc').value } }); } catch { return; }
        if (seq !== calcSeq || !$('#cr')) return;
        const fit = d.plans.filter(p => m.plans.includes(p.id) && p.limit_week);
        $('#cr').innerHTML = `<div class="kpis"><div class="kpi"><div class="muted">ต่อข้อความ</div><div class="stat">${curSign()}${money(toCur(r.per1))}</div></div>
        <div class="kpi"><div class="muted">ต่อเดือน (30 วัน)</div><div class="stat">${curSign()}${money(toCur(r.month))}</div></div></div>
        ${fit.length ? `<div class="tw"><table class="tbl"><tr><th>แพลน</th><th>ราคา/เดือน</th><th>ใช้ลิมิตต่อสัปดาห์</th></tr>${fit.map(p => { const pct = r.plans.find(x => x.id === p.id)?.pct || 0; return `<tr><td>${esc(p.name)}</td><td>${p.price ? fmtPlanPrice(p.price) : 'ฟรี'}</td><td class="${pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok'}">${pct > 999 ? '>999' : Math.round(pct)}%${pct > 100 ? ' (ไม่พอ)' : ''}</td></tr>`; }).join('')}</table></div>` : '<p class="muted">โมเดลนี้ยังไม่อยู่ในแพลนไหน</p>'}`;
      }, 150);
    };
    ['#cm', '#cn', '#ci', '#co', '#cc'].forEach(s => $(s).oninput = calc); calc();
  };
  draw();
}



PAGES.plans = plansPage;
PAGES.pricing = pricing;

// ใบเสนอราคาองค์กร: กรอกข้อมูลบริษัท + แพลน + จำนวน แล้วเปิดหน้าพิมพ์ (บันทึกเป็น PDF จากเมนูพิมพ์ของเบราว์เซอร์) · ไม่บันทึกอะไรที่เซิร์ฟเวอร์
function quoteSheet(plans) {
  const paid = plans.filter(p => p.price > 0 && !p.once);
  sheet('ใบเสนอราคา', `<form id="qf" class="sheet-form" style="display:grid;gap:8px">
    <input name="company" placeholder="ชื่อบริษัท / หน่วยงาน" required maxlength="120"><input name="tax" placeholder="เลขประจำตัวผู้เสียภาษี (ถ้ามี)" maxlength="20">
    <textarea name="addr" rows="2" placeholder="ที่อยู่" maxlength="300"></textarea><input name="contact" placeholder="ผู้ติดต่อ / อีเมล" maxlength="120">
    <select name="plan">${paid.map(p => `<option value="${p.id}">${esc(p.name)}${p.seats > 1 ? ` (${p.seats} ที่นั่ง)` : ''} · ฿${baht(p.price)}/เดือน${p.price_year ? ` · ฿${baht(p.price_year)}/ปี` : ''}</option>`).join('')}</select>
    <div class="row" style="flex-wrap:nowrap"><input name="qty" type="number" min="1" max="1000" value="1" aria-label="จำนวน" style="max-width:110px"><select name="period"><option value="month">รายเดือน</option><option value="year">รายปี</option></select><input name="n" type="number" min="1" max="36" value="1" aria-label="จำนวนรอบ" style="max-width:110px"></div>
    <p class="muted" style="font-size:12px;margin:0">จำนวนชุด × จำนวนรอบ (เดือนหรือปี)</p><button class="btn blue">สร้างใบเสนอราคา (พิมพ์ / PDF)</button></form>`, (d, close) => {
    d.querySelector('#qf').onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), p = paid.find(x => x.id === +f.plan); if (!p) return;
      const year = f.period === 'year' && p.price_year, unit = year ? p.price_year : p.price, qty = Math.max(1, +f.qty || 1), n = Math.max(1, +f.n || 1), total = unit * qty * n;
      const no = 'Q' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), today = new Date(), until = new Date(Date.now() + 30 * 864e5), d8 = x => x.toLocaleDateString('th-TH', { dateStyle: 'long' });
      const w = window.open('', '_blank'); if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ อนุญาต pop-up ก่อน', 'bad');
      w.document.write(`<!doctype html><meta charset="utf-8"><title>ใบเสนอราคา ${no}</title><style>body{font:14px/1.6 'Prompt',system-ui,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}th:last-child,td:last-child{text-align:right}.r{display:flex;justify-content:space-between;gap:24px}.m{color:#666;font-size:12px}.t{font-size:18px;font-weight:700}@media print{body{margin:0}}</style>
        <div class="r"><div><h1>ใบเสนอราคา</h1><div class="m">Quotation</div></div><div style="text-align:right"><b>AstraCode</b><div class="m">${esc(location.host)}</div></div></div>
        <div class="r" style="margin-top:20px"><div><b>เสนอ</b><br>${esc(f.company)}${f.tax ? `<br>เลขผู้เสียภาษี ${esc(f.tax)}` : ''}${f.addr ? `<br>${esc(f.addr)}` : ''}${f.contact ? `<br>ติดต่อ: ${esc(f.contact)}` : ''}</div><div style="text-align:right">เลขที่ ${no}<br>วันที่ ${d8(today)}<br>ยืนราคาถึง ${d8(until)}</div></div>
        <table><tr><th>รายการ</th><th>ราคาต่อหน่วย</th><th>จำนวน</th><th>รอบ</th><th>รวม (บาท)</th></tr><tr><td>แพลน ${esc(p.name)} ${year ? 'รายปี' : 'รายเดือน'}${p.seats > 1 ? ` (${p.seats} ที่นั่ง)` : ''}</td><td>${baht(unit)}</td><td>${qty}</td><td>${n} ${year ? 'ปี' : 'เดือน'}</td><td>${baht(total)}</td></tr>
        <tr><td colspan="4" class="t">ยอดรวม</td><td class="t">฿${baht(total)}</td></tr></table>
        <p class="m">ราคาตามหน้าเว็บ ณ วันที่ออกเอกสาร · ชำระโดยโอนผ่านพร้อมเพย์หรือบัญชีธนาคารที่ระบุในหน้าชำระเงิน · ออกใบเสร็จระบุชื่อบริษัทได้หลังชำระ</p>
        <p style="margin-top:48px">ผู้เสนอราคา ____________________ &nbsp;&nbsp; ผู้อนุมัติ ____________________</p>`);
      w.document.close(); setTimeout(() => w.print(), 300); close();
    };
  });
}
