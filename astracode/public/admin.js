// AstraCode: หลังบ้าน
PAGES.admin = () => adminView(qs().get('tab') || 'stats');

const FIELDS = {
  plans: [['name', 'ชื่อ'], ['price', 'ราคา (บาท/เดือน)', 'n'], ['price_year', 'ราคารายปี (เว้นว่าง = ไม่ขายรายปี)', 'o'], ['days', 'ระยะแพลน (วัน) เว้นว่าง = 30 วัน เช่น 7 = แพลนทดลอง', 'o'], ['once', 'ซื้อได้ครั้งเดียวต่อบัญชี (ไม่ต่ออายุอัตโนมัติ)', 'b'], ['limit_4h', 'งบรอบ 4 ชม. (บาท ต้นทุนจริง · เว้นว่าง = เท่างบสัปดาห์)', 'o'], ['use_4h', 'เปิดรอบ 4 ชม. (ปิด = จำกัดเฉพาะรอบสัปดาห์)', 'b'], ['limit_week', 'งบรอบสัปดาห์ (บาท ต้นทุนจริง)', 'n'], ['seats', 'จำนวนคนในทีม (1 = เดี่ยว, 2+ = ทีม)', 'n'], ['shared_pool', 'ใช้งบลิมิตร่วมกันทั้งทีม', 'b'], ['api_limit', 'ใช้ API Key หักจากลิมิตแพลนได้ (ไม่ต้องเติม Wallet)', 'b'], ['agent', 'รวม Agent (แอป Desktop / คลาวด์) ในลิมิตแพลน · ปิด = ต้องซื้อแพ็ก Agent หรือใช้ Wallet', 'b'], ['description', 'คำอธิบาย'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
  models: [['name', 'ชื่อที่แสดง'], ['provider', 'รูปแบบ API (openai = /chat/completions · responses = /responses ของ OpenAI รุ่นใหม่ · image = โมเดลสร้างรูป ตอบเป็นรูป ใส่ราคาต่อ 1 รูปในช่อง ทุน output · embedding = โมเดลเวกเตอร์ใช้ผ่าน /v1/embeddings เท่านั้น คิดตาม token ขาเข้า · anthropic)', ['openai', 'responses', 'image', 'embedding', 'anthropic']], ['api_model', 'รหัสโมเดล'], ['base_url', 'Base URL'], ['key_name', 'ชื่อ secret ของ key'], ['multiplier', 'ความหนักสัมพัทธ์ (ใช้เรียง/แสดง ไม่ใช่ตัวหักลิมิต)', 'n'], ['cap_pct', 'เพดาน % ของงบสัปดาห์ (0 = ไม่จำกัด เช่น Opus 50)', 'n'],
    ['ctx_k', 'ขนาด context ของโมเดล (พัน token เช่น 128, 200, 1000 · เว้นว่าง = 128)', 'o'],
    ['long_k', 'ราคาขั้นที่ 2 เมื่อ context ยาว: เกณฑ์ (พัน token ต่อคำขอ เช่น 272 · ว่าง = ไม่มี)', 'o'],
    ['long_in', 'ตัวคูณขาเข้า + cache เมื่อเกินเกณฑ์ (ว่าง = 2)', 'o'],
    ['long_out', 'ตัวคูณขาออกเมื่อเกินเกณฑ์ (ว่าง = 1.5)', 'o'],
    ['req_cap', 'เพดานคำขอต่อผู้ใช้ต่อ 4 ชม. (เว้นว่าง = ไม่จำกัด)', 'o'],
    ['bill', 'วิธีคิดเงิน (token = ตามจำนวน token · request = เหมาต่อครั้ง ไม่ผสมกัน)', ['token', 'request']],
    ['cost_in', 'ทุน input (บาท/1M)', 'n'], ['cost_out', 'ทุน output', 'n'], ['cost_cache', 'ทุน cache read', 'n'], ['cost_cache_write', 'ทุน cache write', 'n'],
    ['price_in', 'ราคาขาย input (บาท/1M)', 'o'], ['price_out', 'ราคาขาย output', 'o'], ['price_cache', 'ราคาขาย cache read', 'o'], ['price_cache_write', 'ราคาขาย cache write', 'o'],
    ['promo_pct', 'โปรลดราคา % (เว้นว่าง = ไม่มีโปร)', 'o'], ['promo_start', 'โปรเริ่ม (เว้นว่าง = ทันที)', 'd'], ['promo_end', 'โปรถึงวันที่ (เว้นว่าง = ไม่มีวันจบ)', 'd'], ['new_until', 'ป้าย "ใหม่" ในหน้าเลือกโมเดลถึงวันที่ (ขึ้นบนสุดจนผู้ใช้เห็น)', 'd'],
    ['first_token_s', 'รอข้อความแรกได้นานสุด (วินาที · เว้นว่าง = 90, effort สูง 150)', 'o'], ['idle_s', 'เงียบกลางคำตอบได้นานสุด (วินาที · เว้นว่าง = 60)', 'o'],
    ['req_cost', 'ต้นทุนเหมาต่อ request (บาท · ตั้งแล้วคิดต่อครั้ง ไม่คิดตาม token · เว้นว่าง = คิดตาม token)', 'o'], ['req_price', 'ราคาขายเหมาต่อ request (บาท · เว้นว่าง = ต้นทุน + ส่วนบวก)', 'o'],
    ['use_mult', 'ตัวคูณหักลิมิต (เว้นว่าง = 1 · 0.5 = หักครึ่ง · 2 = หัก 2 เท่า)', 'o'], ['promo_mult', 'ตัวคูณหักลิมิตช่วงโปร (เว้นว่าง = ใช้ตัวปกติ · ใช้ช่วงวันเดียวกับโปรด้านบน)', 'o'],
    ['note', 'คำอธิบายในหน้าราคา', 's'], ['cats', 'หมวดงานที่เหมาะ (คั่นด้วย , จาก: general, code, math, write, docs, image, fast, special, uncen)', 's'], ['code_prompt', 'คำสั่งเพิ่มในโหมด Code (เช่น บังคับให้อ่านไฟล์ก่อนแก้)', 'x'], ['sys_prompt', 'คำสั่งระบบประจำโมเดล ใช้ทั้งแชตและ API (ทำโมเดลเฉพาะทาง เช่น การเงิน)', 'x'], ['fallback_id', 'โมเดลสำรองเมื่อตัวนี้ล่ม', 'm'],
    ['effort', 'รูปแบบ effort', ['none', 'openai', 'anthropic', 'deepseek', 'kimi', 'gemini']], ['tools', 'Tools แบบ native (auto = เปิดเองกับโมเดลที่รองรับ · on = บังคับเปิด · off = ใช้คำสั่งแบบข้อความเดิม)', ['auto', 'on', 'off']], ['effort_levels', 'ระดับ Effort ที่เลือกได้ (คั่นด้วย , เช่น none,low,medium,high,max · เว้นว่าง = ค่าเริ่มต้นค่าย)', 's'], ['vision', 'อ่านรูปได้', 'b'], ['public', 'แสดงในหน้าราคา', 'b'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
  posts: [['title', 'หัวข้อ'], ['slug', 'slug (a-z 0-9 -) ใช้ใน URL'], ['summary', 'สรุปสั้น (แสดงในรายการและ Google)', 's'], ['cover', 'รูปปก (path บนเว็บ เช่น /og.png)', 's'], ['body', 'เนื้อหา (Markdown)', 't'], ['published', 'เผยแพร่', 'b'], ['changelog', 'แสดงในหน้า "มีอะไรใหม่" (จุดแดงบนเมนู)', 'b']],
};
// โมเดลคิดเงินแบบเดียวต่อตัว: ช่องราคา token โชว์เฉพาะโหมด token · ช่องต่อ request โชว์เฉพาะโหมด request
const BILL_GROUP = Object.fromEntries([...['cost_in', 'cost_out', 'cost_cache', 'cost_cache_write', 'price_in', 'price_out', 'price_cache', 'price_cache_write'].map(k => [k, 'token']), ['req_cost', 'request'], ['req_price', 'request']]);
const billApply = f => {
  const rq = f.querySelector('[name=bill]')?.value === 'request';
  f.querySelectorAll('[data-bill]').forEach(d => { const hide = d.dataset.bill === (rq ? 'token' : 'request'); d.hidden = hide; d.querySelectorAll('input').forEach(i => { i.required = !hide && i.dataset.n === '1'; }); });
  const rc = f.querySelector('[name=req_cost]'); if (rc) rc.required = rq;
};
// เทมเพลตเพิ่มโมเดล: รหัสโมเดลเปลี่ยนบ่อย ตรวจชื่อล่าสุดในเว็บผู้ให้บริการก่อนบันทึก
const PRESETS = {
  'OpenAI (GPT)': { name: 'GPT-5.1', provider: 'openai', api_model: 'gpt-5.1', base_url: 'https://api.openai.com/v1', key_name: 'OPENAI_KEY', effort: 'openai', vision: 1 },
  'Kimi (Moonshot)': { name: 'Kimi K2.6', provider: 'openai', api_model: 'kimi-k2.6', base_url: 'https://api.moonshot.ai/v1', key_name: 'KIMI_KEY', effort: 'kimi', vision: 1 },
  'DeepSeek': { name: 'DeepSeek', provider: 'openai', api_model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1', key_name: 'DEEPSEEK_KEY', effort: 'deepseek', vision: 0 },
  'Claude (Anthropic)': { name: 'Claude Sonnet 5.5', provider: 'anthropic', api_model: 'claude-sonnet-5-5', base_url: 'https://api.anthropic.com/v1', key_name: 'ANTHROPIC_KEY', effort: 'anthropic', vision: 1 },
  'Gemini (Google)': { name: 'Gemini', provider: 'openai', api_model: '', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', key_name: 'GEMINI_KEY', effort: 'gemini', vision: 1 },
};
// ผลตรวจสลิปจาก API (Slip2Go ส่ง code มา, byshop ดูจากยอด)
const SLIP_CODE = { 200000: ['ok', 'พบสลิป'], 200200: ['ok', '✓ ผ่านทุกเงื่อนไข'], 200401: ['bad', '✕ บัญชีผู้รับไม่ตรง'], 200402: ['bad', '✕ ยอดไม่ตรง'], 200403: ['bad', '✕ วันที่ไม่ตรง'], 200404: ['warn', 'ไม่พบสลิปในธนาคาร (อาจรอสักครู่)'], 200500: ['bad', '✕ สลิปปลอม'], 200501: ['bad', '✕ สลิปซ้ำ'], 200502: ['warn', 'ธนาคารขัดข้อง'], 401005: ['warn', 'โทเคน Slip2Go หมด'], 401004: ['warn', 'แพ็กเกจ Slip2Go หมดอายุ'], 401007: ['warn', 'IP ไม่ได้รับอนุญาต (ตั้ง IP Whitelist เป็น *)'] };
function slipResult(p) {
  if (['wallet', 'coupon'].includes(p.slip_key)) return `<span class="muted">${p.slip_key === 'wallet' ? 'จ่ายด้วย Wallet' : 'คูปอง'}</span>`;
  let d = null; try { d = JSON.parse(p.slip_check); } catch { }
  const c = d && SLIP_CODE[d.code];
  if (c) return `<span class="${c[0]}">${c[1]}</span>${p.slip_amount != null ? ` <span class="muted">฿${baht(p.slip_amount)}</span>` : ''}`;
  if (p.slip_amount == null) return '<span class="muted">ไม่มีผล</span>';
  return p.slip_amount === p.amount ? `<span class="ok">✓ ยอดตรง ฿${baht(p.slip_amount)}</span>` : `<span class="bad">✕ ยอดไม่ตรง ฿${baht(p.slip_amount)}</span>`;
}
const STATUS = { pending: '<span class="pill warn">● รออนุมัติ</span>', approved: '<span class="pill ok">✓ อนุมัติแล้ว</span>', rejected: '<span class="pill bad">✕ ปฏิเสธ</span>', refunded: '<span class="pill">คืนเงินแล้ว</span>' };
// คาดการณ์ทั้งเดือน (แท็บกำไร): แพลนจ่ายล่วงหน้า ต้นทุนทยอยมา จึงต้องดูต้นทุนที่ยังต้องจ่ายให้ลูกค้าแพลนด้วย
function forecastHTML(f) {
  if (!f) return '';
  const c = v => v < -0.005 ? 'bad' : v > 0.005 ? 'ok' : 'muted', p = f.people || [];
  return `<section class="panel"><div class="ph"><h2>คาดการณ์เดือน ${esc(f.month)}</h2><span class="muted">ผ่านไป ${f.elapsed.toFixed(1)} วัน · เหลือ ${f.left.toFixed(1)} วัน</span></div>
    <div class="kpis">
      <div class="kpi"><div class="muted">กำไรถึงตอนนี้</div><div class="stat ${c(f.so_far.profit)}">฿${baht(f.so_far.profit)}</div><div class="kd muted">รายได้ ฿${baht(f.so_far.plan_rev + f.so_far.wallet_rev)} − ต้นทุน ฿${baht(f.so_far.cost)}</div></div>
      <div class="kpi"><div class="muted">ต้นทุนต่อวันตอนนี้</div><div class="stat">฿${baht(f.rate.cost_day)}</div><div class="kd muted">เฉลี่ย 3 วันล่าสุด · Wallet เข้า ฿${baht(f.rate.wallet_day)}/วัน</div></div>
      <div class="kpi"><div class="muted">คาดกำไรทั้งเดือน</div><div class="stat ${c(f.proj.profit)}">฿${baht(f.proj.profit)}</div><div class="kd muted">ถ้าใช้เท่า 3 วันล่าสุด · ไม่รวมแพลนที่จะซื้อเพิ่ม</div></div>
      <div class="kpi"><div class="muted">ต้นทุนที่ยังต้องจ่ายให้ลูกค้าแพลน</div><div class="stat">฿${baht(f.subs.owed)}</div><div class="kd muted">${num(f.subs.n)} คนที่แพลนยังไม่หมด · เสี่ยงขาดทุน <b class="${f.subs.at_risk ? 'bad' : ''}">${num(f.subs.at_risk)}</b> คน</div></div>
    </div>
    <p class="muted" style="font-size:12.5px">เงินเข้าจริงเดือนนี้ (สลิป + เติม Wallet ไม่นับแพลนที่ตัดจาก Wallet ซ้ำ) ฿${baht(f.so_far.cash_in)} · ค่าแพลนจ่ายล่วงหน้าทั้งรอบ แต่ต้นทุนทยอยเกิด กำไรช่วงต้นรอบจึงดูสูงกว่าจริง</p>
    ${p.length ? `<div class="tw"><table class="tbl"><tr><th>ลูกค้าแพลน (เสี่ยงสุดอยู่บน)</th><th>แพลน</th><th>จ่าย</th><th>ใช้ไปแล้ว</th><th>ต่อวัน</th><th>เหลือ</th><th>คาดกำไรจบรอบ</th><th>แย่สุด</th></tr>
    ${p.map(x => `<tr class="click" data-user="${x.id}"><td>${esc(x.email)}${x.free ? ' <span class="pill">ไม่ได้จ่าย</span>' : ''}</td><td>${esc(x.plan)}</td><td>฿${baht(x.paid)}</td><td>฿${baht(x.spent)}</td><td>฿${baht(x.rate)}</td><td>${x.days_left.toFixed(0)} วัน</td><td class="${c(x.profit)}">฿${baht(x.profit)}</td><td class="${c(x.worst)}">฿${baht(x.worst)}</td></tr>`).join('')}</table></div>
    <p class="muted" style="font-size:12.5px">คาดกำไร = จ่าย − ใช้ไปแล้ว − (ต้นทุนต่อวัน × วันที่เหลือ) · แย่สุด = ถ้าใช้เต็มลิมิตทุกสัปดาห์จนแพลนหมด (ไม่นับสิทธิ์รีเซ็ตลิมิตที่แจกเพิ่ม)</p>` : ''}
  </section>`;
}
const TABS = [['stats', 'pie', 'ภาพรวม'], ['live', 'activity', 'ต้นทุนสด'], ['quality', 'check', 'คุณภาพ'], ['apistats', 'braces', 'API'], ['agents', 'server', 'Agent'], ['profit', 'trend', 'กำไร'], ['payments', 'bank', 'ชำระเงิน'], ['users', 'users', 'ผู้ใช้'], ['teams', 'users', 'ทีม'], ['churn', 'trend', 'เลิกใช้'], ['fraud', 'alert', 'กันโกง'], ['roadmap', 'layers', 'Roadmap'], ['tickets', 'inbox', 'ติดต่อ'], ['plans', 'layers', 'แพลน'], ['teamplans', 'users', 'แพลนทีม'], ['models', 'cpu', 'โมเดล'], ['coupons', 'coupon', 'คูปอง'], ['skills', 'sparkles', 'Skills'], ['connectors', 'layers', 'Connectors'], ['plugins', 'layers', 'Plugins'], ['mcp', 'server', 'MCP'], ['posts', 'news', 'บล็อก'], ['system', 'server', 'ระบบ'], ['settings', 'settings', 'ตั้งค่า']];
// สีชุดข้อมูล (ตรวจแล้วว่าแยกได้แม้ตาบอดสี บนพื้นเข้ม): น้ำเงิน, ส้ม, เขียวน้ำทะเล
const SERIES = ['#3987e5', '#d95926', '#199e70'];
const compact = n => { n = Number(n) || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n * 100) / 100); };
const dayLabel = t => new Date(t).toLocaleDateString(LOC, { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const ago = t => { if (!t) return 'ไม่เคยใช้'; const m = (Date.now() - t) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' นาทีที่แล้ว' : m < 1440 ? Math.round(m / 60) + ' ชม.ที่แล้ว' : Math.round(m / 1440) + ' วันที่แล้ว'; };

// รหัสผ่านชั้นที่สอง: ยังไม่ตั้ง = ให้ตั้งครั้งแรก · ตั้งแล้ว = ต้องใส่ก่อนเข้าหลังบ้านในแต่ละ session
async function adminGateView(tab, set) {
  page(nav() + `<div class="auth wrap"><h1>${set ? 'ยืนยันรหัสผ่านแอดมิน' : 'ตั้งรหัสผ่านแอดมิน'}</h1>
    <form class="card" id="gf"><p class="muted">${set ? 'ใส่รหัสผ่านหลังบ้านเพื่อเข้าต่อ (ขอใหม่ทุก 12 ชั่วโมง หรือเมื่อเข้าจากเครื่อง/เบราว์เซอร์ใหม่)' : 'ครั้งแรก: ตั้งรหัสผ่านแยกสำหรับหลังบ้าน อย่างน้อย 8 ตัวอักษร (ไม่ซ้ำกับรหัสเข้าสู่ระบบ)'}</p>
    <label>${set ? 'รหัสผ่านแอดมิน' : 'รหัสผ่านใหม่'}</label><input type="password" name="password" autocomplete="${set ? 'current-password' : 'new-password'}" required minlength="${set ? 1 : 8}">
    <div class="err" id="ge"></div><button class="btn blue" style="width:100%">${set ? 'เข้าหลังบ้าน' : 'ตั้งรหัสผ่านและเข้า'}</button></form></div>`);
  $('#gf').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/admin-gate', { method: 'POST', body: { password: new FormData(ev.target).get('password') } }); adminView(tab); } catch (x) { $('#ge').textContent = x.message; }
  };
}
// เปลี่ยนรหัสผ่านหลังบ้าน (เครื่องอื่นที่ปลดล็อกไว้ต้องใส่รหัสใหม่)
function gatePwCard(box) {
  box.insertAdjacentHTML('beforeend', `<div class="card"><b>รหัสผ่านหลังบ้าน</b><form id="gpw" class="sheet-form" style="margin-top:10px">
    <input type="password" name="password" placeholder="รหัสผ่านปัจจุบัน" autocomplete="current-password" required>
    <input type="password" name="new" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" autocomplete="new-password" minlength="8" required>
    <div class="row"><button class="btn blue sm">เปลี่ยนรหัสผ่าน</button><span class="muted" id="gpwm"></span></div></form></div>`);
  $('#gpw').onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target));
    try { await api('/admin-gate', { method: 'POST', body: fd }); e.target.reset(); $('#gpwm').textContent = '✓ เปลี่ยนแล้ว เครื่องอื่นต้องใส่รหัสใหม่'; } catch (x) { $('#gpwm').textContent = x.message; }
  };
}
async function adminView(tab = 'stats') {
  if (!['admin', 'support', 'viewer'].includes(me?.role)) return go('/');
  const MYTABS = me.role === 'admin' ? TABS : TABS.filter(([k]) => me.role === 'support' ? ['stats', 'quality', 'payments', 'users', 'fraud', 'churn', 'tickets'].includes(k) : k !== 'system'); // สิทธิ์ย่อย: ซ่อนแท็บที่ใช้ไม่ได้
  if (!MYTABS.some(t => t[0] === tab)) tab = MYTABS[0][0];
  const g = await api('/admin-gate').catch(() => null);
  if (g && !g.ok) return adminGateView(tab, g.set);
  const [pending, open] = await Promise.all([api('/admin/payments').then(p => p.filter(x => x.status === 'pending').length).catch(() => 0), api('/admin/tickets').then(t => t.filter(x => x.status === 'open').length).catch(() => 0)]);
  page(nav() + `<div class="adm"><aside class="adm-nav">${MYTABS.map(([k, i, l]) => `<a class="${k === tab ? 'on' : ''}" href="/admin?tab=${k}"><span class="ai">${ic(i)}</span>${l}${k === 'payments' && pending ? `<b class="cnt">${pending}</b>` : ''}${k === 'tickets' && open ? `<b class="cnt">${open}</b>` : ''}</a>`).join('')}</aside>
    <main class="adm-main"><h1 class="adm-h">${TABS.find(t => t[0] === tab)?.[2] || ''}</h1><div id="ad"></div></main></div>`);
  const box = $('#ad'), reload = () => adminView(tab);
  try { await ADMIN[tab]?.(box, reload); if (tab === 'settings') gatePwCard(box); if (tab === 'models') lossBanner(box); } catch (x) { if (x.data?.gate) return adminGateView(tab, x.data.set); box.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
}

// ---------- กราฟ (SVG ล้วน ไม่ใช้ไลบรารี) ----------
const tip = (() => { let t; return { show(html, x, y) { t ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'ctip' }); t.innerHTML = html; t.hidden = false; const w = t.offsetWidth; t.style.left = Math.min(innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px'; t.style.top = (y - t.offsetHeight - 12) + 'px'; }, hide() { if (t) t.hidden = true; } }; })();
function ticks(max) { // เส้นแกนที่อ่านง่าย 3-5 เส้น
  if (max <= 0) return [0, 1];
  const step = Math.pow(10, Math.floor(Math.log10(max))), n = max / step, s = n <= 2 ? step / 2 : n <= 5 ? step : step * 2;
  const out = []; for (let v = 0; v <= max + s * 0.001; v += s) out.push(v); if (out.at(-1) < max) out.push(out.at(-1) + s); return out;
}
// series: [{name, color, values[]}], labels: วันที่, fmt: รูปแบบตัวเลข
function lineChart(el, { labels, series, fmt = compact, unit = '' }) {
  const W = el.clientWidth || 600, H = 220, L = 44, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B, n = labels.length;
  const yt = ticks(Math.max(...series.flatMap(s => s.values), 0)), ymax = yt.at(-1);
  const x = i => L + (n === 1 ? iw / 2 : i * iw / (n - 1)), y = v => T + ih - v / ymax * ih;
  const every = Math.ceil(n / (W < 480 ? 4 : 7));
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(series.map(s => s.name).join(', '))}">
    ${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`).join('')}
    ${labels.map((l, i) => i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="end">${l}</text>` : i % every === 0 && i < n - every / 2 ? `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="${i ? 'middle' : 'start'}">${l}</text>` : '').join('')}
    ${series.map(s => `<path d="${s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    <line class="xh" y1="${T}" y2="${T + ih}" hidden/>${series.map((s, k) => `<circle class="dot" data-k="${k}" r="4" fill="${s.color}" stroke="var(--carbon)" stroke-width="2" hidden/>`).join('')}
    <rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" class="hit"/></svg>`;
  const svg = el.querySelector('svg'), xh = svg.querySelector('.xh'), dots = svg.querySelectorAll('.dot');
  const move = e => {
    const b = svg.getBoundingClientRect(), px = (e.touches?.[0] || e).clientX - b.left, i = Math.max(0, Math.min(n - 1, Math.round((px - L) / iw * (n - 1))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.hidden = false;
    dots.forEach((d, k) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(series[k].values[i])); d.hidden = false; });
    tip.show(`<b>${labels[i]}</b>${series.map(s => `<div><i style="background:${s.color}"></i>${esc(s.name)} <b>${fmt(s.values[i])}${unit}</b></div>`).join('')}`, b.left + x(i), b.top + window.scrollY - window.scrollY + Math.min(...series.map(s => y(s.values[i]))) + 0);
  };
  const out = () => { xh.hidden = true; dots.forEach(d => d.hidden = true); tip.hide(); };
  const hit = svg.querySelector('.hit');
  hit.onpointermove = move; hit.onpointerdown = move; hit.onpointerleave = out;
}
function barChart(el, { labels, values, color = SERIES[0], fmt = compact, unit = '', name = '' }) {
  const W = el.clientWidth || 600, H = 200, L = 44, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B, n = labels.length;
  const yt = ticks(Math.max(...values, 0)), ymax = yt.at(-1), slot = iw / n, bw = Math.max(2, slot - 2), y = v => T + ih - v / ymax * ih;
  const every = Math.ceil(n / (W < 480 ? 4 : 7));
  const bar = (v, i) => { const x0 = L + i * slot + (slot - bw) / 2, h = Math.max(0, ih - (y(v) - T)), r = Math.min(4, bw / 2, h); return h ? `<path d="M${x0} ${T + ih}V${T + ih - h + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${T + ih}Z" fill="${color}" data-i="${i}"/>` : ''; };
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(name)}">
    ${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`).join('')}
    ${labels.map((l, i) => i === n - 1 ? `<text x="${W - R}" y="${H - 6}" class="ax" text-anchor="end">${l}</text>` : i % every === 0 && i < n - every / 2 ? `<text x="${L + i * slot + slot / 2}" y="${H - 6}" class="ax" text-anchor="${i ? 'middle' : 'start'}">${l}</text>` : '').join('')}
    ${values.map(bar).join('')}${labels.map((_, i) => `<rect x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" fill="transparent" data-h="${i}"/>`).join('')}</svg>`;
  const svg = el.querySelector('svg');
  svg.querySelectorAll('[data-h]').forEach(r => {
    const i = +r.dataset.h, show = () => { const b = svg.getBoundingClientRect(); svg.querySelectorAll('path[data-i]').forEach(p => p.style.opacity = +p.dataset.i === i ? 1 : .45); tip.show(`<b>${labels[i]}</b><div><i style="background:${color}"></i>${esc(name)} <b>${fmt(values[i])}${unit}</b></div>`, b.left + L + i * slot + slot / 2, b.top + y(values[i])); };
    r.onpointerenter = show; r.onpointerdown = show;
    r.onpointerleave = () => { svg.querySelectorAll('path[data-i]').forEach(p => p.style.opacity = 1); tip.hide(); };
  });
}
// ตารางแทนกราฟ สำหรับคนที่อ่านกราฟลำบาก
const dataTable = (head, rows) => `<details class="tview"><summary>ดูเป็นตาราง</summary><div class="tw"><table class="tbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div></details>`;
const delta = (a, b, invert) => {
  if (!b) return '<span class="muted">ไม่มีข้อมูลช่วงก่อน</span>';
  const p = Math.round((a - b) / Math.abs(b) * 100), up = p >= 0, good = invert ? !up : up;
  return `<span class="${p === 0 ? 'muted' : good ? 'ok' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(p)}%</span> <span class="muted">เทียบช่วงก่อน</span>`;
};

const ADMIN = {
  async stats(box) {
    const days = +(localStorage.getItem('adm-days') || 30);
    const s = await api('/admin/stats?days=' + days);
    const c = s.cur, p = s.prev, profit = c.earned - c.cost, margin = c.earned ? Math.round(profit / c.earned * 100) : null; // กำไรไม่นับเงินเติมที่ลูกค้ายังไม่ได้ใช้
    const labels = s.daily.map(d => dayLabel(d.day));
    box.innerHTML = `<div class="seg" role="group" aria-label="ช่วงเวลา">${[7, 30, 90].map(d => `<button data-days="${d}" class="${d === days ? 'on' : ''}">${d} วัน</button>`).join('')}</div>
      ${s.pending ? `<a class="alert-row" href="/admin?tab=payments">● มีสลิปรออนุมัติ ${s.pending} รายการ <span>ตรวจเลย ›</span></a>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="muted">รายได้</div><div class="stat">฿${baht(c.rev)}</div><div class="kd">${delta(c.rev, p.rev)}</div><div class="kd muted">เงินโอนเข้า: แพลน + เติม Wallet</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API</div><div class="stat">฿${baht(c.cost)}</div><div class="kd">${delta(c.cost, p.cost, true)}</div></div>
        <div class="kpi"><div class="muted">กำไรขั้นต้น</div><div class="stat">฿${baht(profit)}</div><div class="kd">${margin == null ? '<span class="muted">ยังไม่มีรายได้</span>' : `<span class="muted">มาร์จิ้น</span> <b>${margin}%</b>`}</div><div class="kd muted">คิดจากแพลน + ใช้ Wallet จริง − ต้นทุน</div></div>
        <div class="kpi"><div class="muted">ผู้ใช้ที่ส่งข้อความ (${days} วัน)</div><div class="stat">${num(c.au)}</div><div class="kd">${delta(c.au, p.au)}</div></div>
        <div class="kpi"><div class="muted">ข้อความ</div><div class="stat">${compact(c.msgs)}</div><div class="kd">${delta(c.msgs, p.msgs)}</div></div>
        <div class="kpi"><div class="muted">Token ทั้งหมด</div><div class="stat">${compact(c.tok)}</div><div class="kd">${delta(c.tok, p.tok)}</div></div>
        <div class="kpi"><div class="muted">สมาชิก / จ่ายเงิน</div><div class="stat">${num(s.users.total)} / ${num(s.users.paid)}</div><div class="kd"><span class="muted">จ่ายเงิน ${s.users.total ? Math.round(s.users.paid / s.users.total * 100) : 0}%</span></div></div>
      </div>
      <section class="panel"><div class="ph"><h2>การใช้ Token รายวัน</h2><div class="legend">${[['Input', SERIES[0]], ['Output', SERIES[1]], ['Cache', SERIES[2]]].map(([l, cl]) => `<span><i style="background:${cl}"></i>${l}</span>`).join('')}</div></div>
        <div class="chart" id="c-tok"></div>${dataTable(['วันที่', 'Input', 'Output', 'Cache'], s.daily.map((d, i) => [labels[i], num(d.tin), num(d.tout), num(d.tc)]))}</section>
      <div class="two">
        <section class="panel"><div class="ph"><h2>ต้นทุน API รายวัน</h2><span class="muted">บาท</span></div><div class="chart" id="c-cost"></div>${dataTable(['วันที่', 'ต้นทุน (บาท)'], s.daily.map((d, i) => [labels[i], baht(d.cost)]))}</section>
        <section class="panel"><div class="ph"><h2>รายได้รายวัน</h2><span class="muted">บาท</span></div><div class="chart" id="c-rev"></div>${dataTable(['วันที่', 'รายได้ (บาท)'], s.daily.map((d, i) => [labels[i], baht(d.rev)]))}</section>
        <section class="panel"><div class="ph"><h2>ข้อความรายวัน</h2></div><div class="chart" id="c-msg"></div>${dataTable(['วันที่', 'ข้อความ', 'ผู้ใช้'], s.daily.map((d, i) => [labels[i], num(d.msgs), num(d.au)]))}</section>
        <section class="panel"><div class="ph"><h2>สมัครใหม่รายวัน</h2></div><div class="chart" id="c-reg"></div>${dataTable(['วันที่', 'สมัครใหม่'], s.daily.map((d, i) => [labels[i], num(d.reg)]))}</section>
      </div>
      <section class="panel"><div class="ph"><h2>แยกตามโมเดล</h2><span class="muted">${days} วัน</span></div>
        ${s.models.length ? `<div class="hbars">${s.models.map(m => { const max = Math.max(...s.models.map(x => x.cost)) || 1; return `<div class="hb click" data-mu="${m.id}" role="button" tabindex="0" title="ดูรายละเอียด"><div class="hb-l"><b>${esc(m.name)}</b><span class="muted">${num(m.msgs)} ข้อความ · ${compact(m.tin + m.tout + m.tc)} token</span></div>
          <div class="hb-t"><div style="width:${Math.max(1, m.cost / max * 100)}%"></div></div><div class="hb-v">฿${baht(m.cost)}</div></div>`; }).join('')}</div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}</section>
      ${s.by_src?.length ? `<section class="panel"><div class="ph"><h2>แยกตามที่มา</h2><span class="muted">${days} วัน · เก็บตั้งแต่ 18 พ.ย. 2569</span></div><div class="tw"><table class="tbl"><tr><th>ที่มา</th><th>ครั้ง</th><th>ต้นทุน</th><th>หัก Wallet</th></tr>${s.by_src.map(x => `<tr><td>${{ chat: 'แชต', api: 'API', agent: 'Agent', task: 'งานตั้งเวลา', complete: 'เติมโค้ด', image: 'สร้างรูป', system: 'ระบบ', batch: 'Batch API', line: 'LINE', '-': 'ไม่ระบุ (ก่อนเริ่มเก็บ)' }[x.src] || esc(x.src)}</td><td>${num(x.n)}</td><td>฿${baht(x.cost)}</td><td>฿${baht(x.charge)}</td></tr>`).join('')}</table></div></section>` : ''}
      <section class="panel"><div class="ph"><h2>ผู้ใช้ที่ใช้มากที่สุด</h2><span class="muted">${days} วัน</span></div>
        ${s.top.length ? `<div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>ข้อความ</th><th>Token</th><th>ต้นทุน</th></tr>${s.top.map(u => `<tr class="click" data-user="${u.id}"><td>${esc(u.email)}</td><td>${esc(u.plan || 'Free')}</td><td>${num(u.msgs)}</td><td>${compact(u.tok)}</td><td>฿${baht(u.cost)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}</section>`;
    box.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { localStorage.setItem('adm-days', b.dataset.days); ADMIN.stats(box); });
    box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => userDrawer(+r.dataset.user));
    box.querySelectorAll('[data-mu]').forEach(r => r.onclick = () => modelUsageSheet(+r.dataset.mu, days));
    const draw = () => {
      if (!$('#c-tok')) return ADMIN._resize?.disconnect(); // ออกจากหน้าแล้ว
      lineChart($('#c-tok'), { labels, series: [{ name: 'Input', color: SERIES[0], values: s.daily.map(d => d.tin) }, { name: 'Output', color: SERIES[1], values: s.daily.map(d => d.tout) }, { name: 'Cache', color: SERIES[2], values: s.daily.map(d => d.tc) }], unit: ' token' });
      barChart($('#c-cost'), { labels, values: s.daily.map(d => d.cost), name: 'ต้นทุน', fmt: v => v >= 1 ? compact(v) : String(+v.toPrecision(2)), unit: ' บาท' });
      barChart($('#c-rev'), { labels, values: s.daily.map(d => d.rev), name: 'รายได้', fmt: v => compact(v), unit: ' บาท' });
      barChart($('#c-msg'), { labels, values: s.daily.map(d => d.msgs), name: 'ข้อความ', unit: ' ข้อความ' });
      barChart($('#c-reg'), { labels, values: s.daily.map(d => d.reg), name: 'สมัครใหม่', unit: ' คน' });
    };
    draw(); ADMIN._resize?.disconnect(); ADMIN._resize = new ResizeObserver(() => { clearTimeout(ADMIN._rt); ADMIN._rt = setTimeout(draw, 150); }); ADMIN._resize.observe(box);
  },

  async payments(box, reload) {
    const ps = await api('/admin/payments');
    let filter = 'pending';
    const draw = () => {
      const list = ps.filter(p => filter === 'all' || p.status === filter);
      box.innerHTML = `<div class="seg">${[['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ปฏิเสธ'], ['refunded', 'คืนเงิน'], ['all', 'ทั้งหมด']].map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l} ${k === 'all' ? ps.length : ps.filter(p => p.status === k).length}</button>`).join('')}</div>
        ${list.map(p => `<div class="card pay-card"><div class="row"><b>#${p.id}</b><span>${esc(p.email)}</span><span style="flex:1"></span>${p.review ? '<span class="pill warn">ลูกค้าขอให้ตรวจ</span>' : ''}${p.likely_ok ? '<span class="pill ok" title="ผลตรวจบอกสลิปจริง ยอดตรง ผู้รับเป็นบัญชีร้าน">น่าจะปฏิเสธผิด</span>' : ''}${STATUS[p.status] || esc(p.status)}</div>
          <div class="pay-grid"><div><div class="muted">แพลน</div>${esc(p.plan_name)}</div><div><div class="muted">ต้องจ่าย</div>฿${baht(p.amount)}</div><div><div class="muted">ส่งเมื่อ</div>${when(p.created_at)}</div>
          <div><div class="muted">ตรวจสลิป</div>${slipResult(p)}</div></div>
          ${p.slip_check ? `<details class="tview"><summary>ผลดิบจาก API</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(p.slip_check)}</pre></details>` : ''}
          <div class="row" style="margin-top:12px"><button class="btn out sm" data-slip="${p.id}">View slip</button>
          ${p.status === 'pending' ? `<button class="btn blue sm" data-act="approve" data-id="${p.id}" ${p.kind === 'topup' ? `data-topup="${p.slip_amount ?? p.amount}"` : ''}>Approve</button><button class="btn red sm" data-act="reject" data-id="${p.id}">Reject</button>` : ''}${p.status === 'rejected' ? `<button class="btn blue sm" data-act="approve" data-id="${p.id}" ${p.kind === 'topup' ? `data-topup="${p.slip_amount ?? p.amount}"` : ''}>อนุมัติย้อนหลัง</button>` : ''}${p.status === 'approved' && !['wallet', 'coupon'].includes(p.slip_key) ? `<button class="btn out sm" data-refund="${p.id}" data-kind="${p.kind}">คืนเงิน</button>` : ''}</div>
          <div data-img="${p.id}"></div></div>`).join('') || '<div class="empty-s">ไม่มีรายการ</div>'}`;
      box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
      box.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => { const c = box.querySelector(`[data-img="${b.dataset.slip}"]`); c.innerHTML = c.innerHTML ? '' : `<img class="slipimg" style="margin-top:12px" src="/api/admin/slip/${b.dataset.slip}" alt="สลิป">`; });
      box.querySelectorAll('[data-refund]').forEach(b => b.onclick = async () => {
        const topup = b.dataset.kind === 'topup', ok = await confirmSheet(topup ? 'คืนเงินรายการเติม Wallet นี้? ระบบหักยอดออกจาก Wallet ลูกค้า (ติดลบได้ถ้าใช้ไปแล้ว) แล้วคุณโอนคืนเอง' : 'คืนเงินแพลนนี้? แพลนจะหมดอายุทันที', { title: 'คืนเงิน', ok: topup ? 'คืนเงิน' : 'คืนเป็นเงินโอน', danger: true });
        if (!ok) return; const wallet = !topup && await confirmSheet('คืนเป็นเครดิตเข้า Wallet แทนการโอนเงินไหม?', { title: 'วิธีคืนเงิน', ok: 'คืนเข้า Wallet', cancel: 'ฉันโอนคืนเอง' });
        b.disabled = true; try { await api(`/admin/payments/${b.dataset.refund}/refund`, { method: 'POST', body: { wallet } }); toast('คืนเงินแล้ว', 'ok'); reload(); } catch (x) { toast(x.message, 'bad'); b.disabled = false; }
      });
      box.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        let body; // เติม Wallet: เติมตามยอดในสลิปจริง (แก้ได้) ไม่ใช่ยอดที่ลูกค้ากรอก
        if (b.dataset.act === 'approve' && b.dataset.topup) { const v = await promptSheet('ยอดที่เห็นในสลิปจริง (บาท) · เติมเข้า Wallet ตามยอดนี้', b.dataset.topup, { title: 'อนุมัติเติมเงิน', ok: 'อนุมัติ', type: 'number' }); if (v == null || !(+v > 0)) return; body = { amount: +v }; }
        else if (!await confirmSheet(b.dataset.act === 'approve' ? 'อนุมัติและเปิดแพลนให้ผู้ใช้?' : 'ปฏิเสธคำขอนี้?', { title: 'ยืนยันรายการ', ok: 'Confirm', danger: b.dataset.act !== 'approve' })) return;
        b.disabled = true;
        try { await api(`/admin/payments/${b.dataset.id}/${b.dataset.act}`, { method: 'POST', body }); reload(); } catch (x) { toast(x.message, 'bad'); b.disabled = false; }
      });
    };
    draw();
  },

  async users(box) {
    const [plans, models] = await Promise.all([api('/admin/plans'), api('/admin/models')]);
    const vendors = [...new Set(models.map(m => String(m.name).trim().split(/\s+/)[0]))];
    box.innerHTML = `<details class="ed gift"><summary><b>${ic('refresh')} แจกรีเซ็ตลิมิต</b><span class="muted">รีเซ็ตให้ทันที หรือแจกปุ่มรีเซ็ตให้ผู้ใช้กดใช้เอง (กำหนดค่าย/โมเดลและวันหมดอายุได้)</span></summary>
      <form id="rlf" class="ed-f"><label>รูปแบบ</label><select name="mode"><option value="grant">แจกปุ่มรีเซ็ต (ผู้ใช้กดใช้เอง)</option><option value="now">รีเซ็ตทันที (ล้างทุกโมเดล)</option></select>
        <label class="gs">จำนวนสิทธิ์ต่อคน</label><input name="n" type="number" min="1" max="50" value="1" placeholder="จำนวนสิทธิ์ต่อคน" class="gs">
        <label class="gs">หมดอายุใน (วัน) เว้นว่าง = ไม่หมดอายุ</label><input name="days" type="number" min="1" max="3650" placeholder="เช่น 7" class="gs">
        <label class="gs">ขอบเขตที่ผู้ใช้จะรีเซ็ตได้ (เลือกตอนแจก ผู้ใช้เปลี่ยนเองไม่ได้)</label><select name="scope" class="gs"><option value="all">ทั้งหมด (ทุกโมเดล)</option>${vendors.map(v => `<option value="v:${esc(v)}">ค่าย ${esc(v)} (ทุกโมเดลของค่ายนี้)</option>`).join('')}${models.map(m => `<option value="m:${m.id}">โมเดล ${esc(m.name)}</option>`).join('')}</select>
        <label>แจกให้</label><select name="who"><option value="all">ผู้ใช้ทุกคน</option>${plans.map(p => `<option value="plan:${p.id}">ทุกคนในแพลน ${esc(p.name)}</option>`).join('')}<option value="email">ผู้ใช้คนเดียว (ใส่อีเมล)</option></select>
        <input name="email" type="email" placeholder="อีเมลผู้ใช้" hidden>
        <div class="row" style="margin-top:12px"><button class="btn blue sm">Confirm</button><span class="ok sv"></span></div></form></details>
      <details class="ed" id="rlh"><summary><b>${ic('activity')} ประวัติรีเซ็ตลิมิต</b><span class="muted">แจกให้ใคร ใครกดใช้ เมื่อไหร่ (ล่าสุด 100 รายการ)</span></summary><div id="rlhb" class="tw"></div></details>
      <div class="toolbar"><input id="q" placeholder="ค้นหาอีเมล" aria-label="ค้นหาอีเมล"></div><div id="ul"></div>`;
    $('#rlh').ontoggle = async () => { if (!$('#rlh').open) return; try { $('#rlhb').innerHTML = resetLogTable(await api('/admin/reset-log')); } catch (x) { $('#rlhb').textContent = x.message; } };
    const rf = $('#rlf');
    rf.who.onchange = () => { rf.email.hidden = rf.who.value !== 'email'; rf.email.required = !rf.email.hidden; };
    rf.mode.onchange = () => { const g = rf.mode.value === 'grant'; rf.querySelectorAll('.gs').forEach(e => e.hidden = !g); }; rf.mode.onchange();
    rf.onsubmit = async e => {
      e.preventDefault(); const t = rf.who.value, label = rf.who.selectedOptions[0].textContent;
      const grant = rf.mode.value === 'grant', n = +rf.n.value || 1, who = t === 'email' ? rf.email.value : label, sv = rf.scope.value, scope = sv.startsWith('v:') ? { vendor: sv.slice(2) } : sv.startsWith('m:') ? { model_id: +sv.slice(2) } : null, sl = rf.scope.selectedOptions[0].textContent;
      if (!await confirmSheet(grant ? `แจกปุ่มรีเซ็ต ${n} ครั้ง (${sl}${+rf.days.value ? ' · หมดอายุใน ' + +rf.days.value + ' วัน' : ' · ไม่หมดอายุ'}) ให้ ${who}?` : `รีเซ็ตลิมิตให้ ${who}?`, { title: grant ? 'แจกปุ่มรีเซ็ต' : 'รีเซ็ตลิมิต', ok: grant ? 'แจก' : 'รีเซ็ต' })) return;
      try { const r = await api(grant ? '/admin/reset-credits' : '/admin/reset-limits', { method: 'POST', body: { target: t.split(':')[0], plan_id: +t.split(':')[1] || null, email: rf.email.value, n, scope, days: +rf.days.value || 0 } }); rf.querySelector('.sv').textContent = grant ? `✓ แจกแล้ว ${num(r.count)} คน` : `✓ รีเซ็ตแล้ว ${num(r.count)} คน`; }
      catch (x) { toast(x.message, 'bad'); }
    };
    const load = async () => {
      const us = await api('/admin/users?q=' + encodeURIComponent($('#q').value));
      $('#ul').innerHTML = us.map(u => `<button class="urow" data-user="${u.id}"><span class="av">${esc(u.email[0].toUpperCase())}</span>
        <span class="ue"><b>${esc(u.email)}</b><span class="muted">${{ admin: 'แอดมิน · ', support: 'ดูแลลูกค้า · ', viewer: 'ดูอย่างเดียว · ' }[u.role] || ''}${u.plan_id && u.plan_expires > Date.now() ? esc(u.plan_name) + ' ถึง ' + dayLabel(u.plan_expires) : 'Free'} · ใช้ล่าสุด ${ago(u.last_active)}</span></span>
        <span class="ut">${compact(u.tok30)}<small class="muted">token/30 วัน</small></span>${u.banned ? '<span class="pill bad">แบน</span>' : ''}<span class="chev">›</span></button>`).join('') || '<div class="empty-s">ไม่พบผู้ใช้</div>';
      $('#ul').querySelectorAll('[data-user]').forEach(b => b.onclick = () => userDrawer(+b.dataset.user, load));
    };
    let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 250); }; load();
  },

  async plans(box, reload) { return editors('plans', box, reload, 'solo'); },
  async teamplans(box, reload) { return editors('plans', box, reload, 'team'); }, // แพลนที่ seats > 1: ผู้ซื้อเป็นหัวหน้าทีม เชิญสมาชิกเอง

  // ต้นทุนสด: เงินที่จ่ายผู้ให้บริการต่อ key (เทียบหน้า maxplus ฯลฯ) · ทุกคำขอล่าสุด · ใครใช้หนัก/ขาดทุน · ตั้งแจ้งเตือน · รีเฟรชเองทุก 30 วิ
  async live(box) {
    const d = await api('/admin/live'), t = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0);
    const sum = k => d.keys.reduce((a, x) => a + (x[k] || 0), 0), flagged = d.feed.filter(x => x.flag).length;
    const FLAG = { gone: ['ลูกค้าตัดกลางทาง', 'warn'], est: ['token ประมาณ', 'muted'], part: ['ผู้ให้บริการพังกลางคำตอบ', 'bad'] };
    const flagH = f => f ? f.split('+').map(x => `<span class="pill ${FLAG[x]?.[1] || ''}" title="${esc(FLAG[x]?.[0] || x)}">${esc(FLAG[x]?.[0] || x)}</span>`).join(' ') : '';
    const bars = arr => { const mx = Math.max(...arr, 0.0001); return `<svg class="spark" viewBox="0 0 96 24" width="96" height="24" aria-hidden="true">${arr.map((v, i) => `<rect x="${i * 4}" y="${24 - Math.max(v > 0 ? 1.5 : 0, v / mx * 24)}" width="3" height="${Math.max(v > 0 ? 1.5 : 0, v / mx * 24)}" rx="1"/>`).join('')}</svg>`; };
    const when2 = ms => new Date(ms + 7 * 3600e3).toISOString().slice(11, 19);
    box.innerHTML = `<p class="muted hint">ต้นทุน = เงินที่เราจ่ายผู้ให้บริการ (บาท) · รีเฟรชเองทุก 30 วินาที · <button type="button" class="btn out sm" id="lvr">รีเฟรชตอนนี้</button></p>
      <div class="kpis">
        <div class="kpi"><div class="muted">ต้นทุน 1 ชม.</div><div class="stat">฿${baht(sum('h1'))}</div></div>
        <div class="kpi"><div class="muted">ต้นทุน 24 ชม.</div><div class="stat">฿${baht(sum('d1'))}</div><div class="kd muted">เฉลี่ย 3 วัน ฿${baht(sum('d3') / 3)}/วัน</div></div>
        <div class="kpi"><div class="muted">คำขอผิดปกติ (150 ล่าสุด)</div><div class="stat ${flagged ? 'bad' : ''}">${flagged}</div><div class="kd muted">ตัดกลางทาง / ประมาณ / พัง</div></div>
        <div class="kpi"><div class="muted">API error 24 ชม.</div><div class="stat">${d.errs.length}</div></div>
      </div>
      <section class="card"><h3>เครดิตคงเหลือที่ผู้ให้บริการ</h3><p class="muted" style="margin:0 0 8px;font-size:12.5px">กรอกเครดิตที่เห็นในหน้าผู้ให้บริการ "ตอนนี้" ระบบหักต้นทุนของทุก key ในบัญชีที่เกิดหลังจากนั้นให้เอง · เตือนเมื่อพอใช้ไม่ถึง 2 วัน · เติมเงินแล้วกด อัปเดต กรอกยอดใหม่</p>
        <div class="tw"><table class="tbl"><tr><th>บัญชี</th><th>key</th><th>คงเหลือ (ประมาณ)</th><th>ใช้/วัน</th><th>พอใช้</th><th>กรอกล่าสุด</th><th></th></tr>
        ${(d.accounts || []).map(a => `<tr><td><b>${esc(a.name)}</b></td><td><small>${a.keys.map(esc).join('<br>')}</small></td><td><b class="${a.days != null && a.days < 2 ? 'bad' : ''}">${baht(a.left)}</b> เครดิต<br><small class="muted">≈ ฿${baht(a.left / a.rate)}</small></td><td>฿${baht(a.perDay)}</td><td>${a.days != null ? '~' + a.days.toFixed(1) + ' วัน' : '-'}</td><td><small>${baht(a.credits)} เครดิต<br>${when(a.at)}</small></td><td><button type="button" class="btn out sm" data-fund="${esc(a.name)}">อัปเดต</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">ยังไม่ได้เพิ่มบัญชี</td></tr>'}</table></div>
        <button type="button" class="btn out sm" data-fund="" style="margin-top:8px">+ เพิ่มบัญชีผู้ให้บริการ</button></section>
      <section class="card"><h3>ต้นทุนต่อ key ผู้ให้บริการ</h3>
        <div class="tw"><table class="tbl"><tr><th>key</th><th>1 ชม.</th><th>24 ชม.</th><th>เฉลี่ย/วัน</th><th>7 วัน</th><th>24 ชม. ล่าสุด</th><th>บัญชี</th></tr>
        ${d.keys.map(k => `<tr><td><b>${esc(k.k)}</b>${k.flagged ? ` <span class="pill warn">${k.flagged} ผิดปกติ</span>` : ''}</td><td>฿${baht(k.h1)}</td><td>฿${baht(k.d1)}</td><td>฿${baht(k.d3 / 3)}</td><td>฿${baht(k.d7)}</td><td>${bars(k.series)}</td>
          <td>${k.acct ? esc(k.acct) : '<span class="muted">-</span>'}</td></tr>`).join('')}</table></div></section>
      <section class="card"><h3>ใช้หนักสุด 24 ชม.</h3><div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>คำขอ</th><th>ต้นทุน 1 ชม.</th><th>ต้นทุน 24 ชม.</th><th>หัก Wallet</th><th>หักลิมิต</th><th>Wallet เหลือ</th></tr>
        ${d.hot.map(u => `<tr class="click" data-user="${u.uid}"><td>${esc(u.email || '#' + u.uid)}${u.role === 'admin' ? ' <span class="pill">แอดมิน</span>' : ''}${u.flagged ? ` <span class="pill warn">${u.flagged} ผิดปกติ</span>` : ''}</td><td>${esc(u.plan || 'Free')}</td><td>${u.n}</td><td class="${u.h1 >= 5 ? 'bad' : ''}">฿${baht(u.h1)}</td><td>฿${baht(u.d1)}</td><td>฿${baht(u.charge)}</td><td>${baht(u.units)}</td><td>฿${baht(u.balance)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">ยังไม่มีการใช้</td></tr>'}</table></div></section>
      <section class="card"><h3>ลูกค้าที่ทำให้ขาดทุน 30 วัน</h3><p class="muted" style="margin:0 0 8px;font-size:12.5px">ต้นทุนที่เราจ่าย เทียบเงินที่ลูกค้าจ่ายเข้ามา (ค่าแพลน + เติม Wallet) ใน 30 วัน</p><div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>จ่ายมา</th><th>ต้นทุน</th><th>กำไร</th></tr>
        ${d.losers.map(u => `<tr class="click" data-user="${u.uid}"><td>${esc(u.email)}</td><td>${esc(u.plan || 'Free')}</td><td>฿${baht(u.paid)}</td><td>฿${baht(u.cost)}</td><td class="${u.profit < 0 ? 'bad' : 'ok'}">฿${baht(u.profit)}</td></tr>`).join('')}</table></div></section>
      <section class="card"><h3>ทุกคำขอล่าสุด</h3><div class="seg" role="group"><button data-ff="" class="on">ทั้งหมด</button><button data-ff="flag">เฉพาะผิดปกติ</button><button data-ff="api">API</button><button data-ff="chat">แชต</button></div>
        <div class="tw"><table class="tbl" id="lvfeed"><tr><th>เวลา</th><th>ผู้ใช้</th><th>โมเดล · key</th><th>ที่มา</th><th>เข้า / ออก / แคช</th><th>ต้นทุน</th><th>หัก Wallet</th><th>หักลิมิต</th><th>หมายเหตุ</th></tr>
        ${d.feed.map(r => `<tr class="click" data-user="${r.uid}" data-src="${esc(r.src || '')}" data-flag="${r.flag ? 1 : ''}"><td>${when2(r.t)}</td><td>${esc((r.email || '#' + r.uid).split('@')[0])}</td><td>${esc(r.model || '-')}<br><small class="muted">${esc(r.k || '')}</small></td><td>${esc(r.src || '-')}</td><td>${t(r.tin)} / ${t(r.tout)} / ${t(r.tc)}</td><td class="${r.cost >= 1 ? 'bad' : ''}">฿${(r.cost || 0).toFixed(r.cost < 0.01 ? 4 : 2)}</td><td>${r.charge ? '฿' + r.charge.toFixed(2) : '-'}</td><td>${r.units ? r.units.toFixed(2) : '-'}</td><td>${flagH(r.flag)}</td></tr>`).join('')}</table></div></section>
      <section class="card"><h3>Agent ในแอป Desktop · 7 วัน</h3><p class="muted" style="margin:0 0 8px;font-size:12.5px">จากแอปที่ส่งสถิติกลับมา (ไม่มีเนื้อหางาน) · ใช้เลือกโมเดลเริ่มต้นของ Agent</p>
        ${(d.agentRuns || []).length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>งาน</th><th>สำเร็จ</th><th>รอบเฉลี่ย</th><th>เครื่องมือเฉลี่ย</th><th>เวลาเฉลี่ย</th><th>เงินเฉลี่ย/งาน</th><th>ลิมิตเฉลี่ย/งาน</th></tr>${d.agentRuns.map(r => `<tr><td>${esc(r.model)}</td><td>${r.n}</td><td class="${r.ok / r.n < 0.7 ? 'bad' : 'ok'}">${Math.round(r.ok / r.n * 100)}%</td><td>${(r.rounds || 0).toFixed(1)}</td><td>${(r.tools || 0).toFixed(1)}</td><td>${Math.round((r.ms || 0) / 1000)} วิ</td><td>฿${baht(r.charge)}</td><td>${(r.pct || 0).toFixed(2)}%</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีข้อมูล</p>'}
        <button type="button" class="btn out sm" id="lvbench" style="margin-top:8px">${ic('activity', 'sm')} ทดสอบโมเดลกับงาน Agent</button><div id="lvbenchr"></div></section>
      <details class="card"><summary><b>ข้อผิดพลาดจากแอป Desktop 7 วัน (${(d.deskErrs || []).length})</b></summary><div class="tw"><table class="tbl"><tr><th>เวลา</th><th>รายละเอียด</th></tr>${(d.deskErrs || []).map(e => `<tr><td>${when(e.t)}</td><td><small>${esc(e.detail)}</small></td></tr>`).join('')}</table></div></details>
      <details class="card"><summary><b>API error 24 ชม. (${d.errs.length})</b></summary><div class="tw"><table class="tbl"><tr><th>เวลา</th><th>ผู้ใช้</th><th>สถานะ</th><th>โมเดล / path</th><th>ข้อความ</th></tr>
        ${d.errs.map(e => `<tr class="click" data-user="${e.uid}"><td>${when2(e.t)}</td><td>${esc((e.email || '').split('@')[0])}</td><td>${e.status}</td><td>${esc(e.model || e.path || '-')}</td><td><small>${esc(e.err || '')}</small></td></tr>`).join('')}</table></div></details>
      <section class="card"><h3>แจ้งเตือน</h3><p class="muted" style="margin:0 0 8px;font-size:12.5px">ส่งเข้า Push แอดมิน / Discord / LINE ตามที่ตั้งไว้ในหน้าตั้งค่า · เช็กทันทีที่มีคำขอราคา ฿0.5 ขึ้นไป · 0 = ปิด</p>
        <form id="lvalert" class="form2"><div><label>ลูกค้าคนเดียว ต้นทุนใน 1 ชม. เกิน (บาท)</label><input name="alert_user_hour" type="number" min="0" step="any" value="${esc(d.settings.alert_user_hour ?? '15')}" placeholder="15"></div>
        <div><label>ทั้งระบบ ต้นทุนใน 1 ชม. เกิน (บาท)</label><input name="alert_hour_cost" type="number" min="0" step="any" value="${esc(d.settings.alert_hour_cost ?? '50')}" placeholder="50"></div>
        <div><label>ทั้งระบบ ต้นทุนต่อวันเกิน (บาท)</label><input name="cost_alert_daily" type="number" min="0" step="any" value="${esc(d.settings.cost_alert_daily || '0')}"></div><div style="align-self:end"><button class="btn blue sm">บันทึก</button></div></form></section>`;
    box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => userDrawer(+r.dataset.user));
    box.querySelectorAll('[data-ff]').forEach(b => b.onclick = () => { box.querySelectorAll('[data-ff]').forEach(x => x.classList.toggle('on', x === b)); const f = b.dataset.ff; box.querySelectorAll('#lvfeed tr[data-src]').forEach(tr => tr.hidden = f === 'flag' ? !tr.dataset.flag : f ? tr.dataset.src !== f : false); });
    box.querySelector('#lvr').onclick = () => ADMIN.live(box);
    box.querySelector('#lvbench').onclick = async e => { // ทดสอบความสามารถใช้เครื่องมือของแต่ละโมเดล (เสียต้นทุนเราเล็กน้อย)
      const ms = await api('/admin/models'), pick = ms.filter(m => m.active && !['image', 'embedding'].includes(m.provider));
      sheet('ทดสอบโมเดลกับงาน Agent', `<div class="sheet-form"><p class="sheet-msg">ให้แต่ละโมเดลทำงาน 4 ข้อที่ต้องใช้เครื่องมือ (ค้นไฟล์ อ่าน แก้ไฟล์ให้ถูกจุด) ในโฟลเดอร์จำลอง แล้วให้คะแนน · ใช้ต้นทุนจริงของเราโมเดลละราว ฿0.1–2</p><div class="chips-sel">${pick.map(m => `<label><input type="checkbox" name="bm" value="${m.id}" ${/sonnet|opus|6\.2|flash/i.test(m.name) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div><button class="btn blue" id="bmgo">เริ่มทดสอบ</button></div>`, (sd, close) => {
        sd.querySelector('#bmgo').onclick = async () => {
          const ids = [...sd.querySelectorAll('[name=bm]:checked')].map(x => +x.value); if (!ids.length) return; close();
          const out = box.querySelector('#lvbenchr'); out.innerHTML = '<p class="muted">กำลังทดสอบ… (โมเดลละไม่เกิน ~1 นาที)</p>'; const rows = [];
          for (const id of ids) { const r = await api('/admin/agent-bench', { method: 'POST', body: { model_id: id } }).catch(x => ({ name: ms.find(m => m.id === id)?.name, error: x.message })); rows.push(r); out.innerHTML = `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>คะแนน</th><th>เวลา</th><th>ต้นทุน</th><th>รายละเอียด</th></tr>${rows.map(x => `<tr><td>${esc(x.name || '')}</td><td class="${x.score >= 3 ? 'ok' : 'bad'}">${x.error ? '-' : x.score + '/' + x.of}</td><td>${x.ms ? Math.round(x.ms / 1000) + ' วิ' : ''}</td><td>${x.cost != null ? '฿' + baht(x.cost) : ''}</td><td><small>${esc(x.error || (x.detail || []).join(' · '))}</small></td></tr>`).join('')}</table></div>`; }
        };
      });
    };
    box.querySelector('#lvalert').onsubmit = async e => { e.preventDefault(); await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('บันทึกแล้ว', 'ok'); };
    box.querySelectorAll('[data-fund]').forEach(b => b.onclick = () => {
      const a0 = (d.accounts || []).find(x => x.name === b.dataset.fund), f = a0 || {}, allKeys = [...new Set([...d.keys.map(x => x.k), ...(f.keys || [])])];
      sheet(a0 ? 'บัญชี ' + a0.name : 'เพิ่มบัญชีผู้ให้บริการ', `<form class="sheet-form" id="kff"><p class="sheet-msg">เปิดหน้าผู้ให้บริการ (เช่น maxplus) แล้วกรอกเครดิตที่เหลือ "ตอนนี้" ระบบจะหักต้นทุนของ key ที่เลือกที่เกิดหลังจากนี้ให้เอง</p>
        <label>ชื่อบัญชี</label><input name="key" required pattern="[A-Za-z0-9_.\-]+" value="${esc(f.name || 'maxplus')}" ${a0 ? 'readonly' : ''}>
        <label>key ที่ใช้เครดิตบัญชีนี้</label><div class="chips-sel">${allKeys.map(x => `<label><input type="checkbox" name="keys" value="${esc(x)}" ${(f.keys || []).includes(x) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>
        <label>เครดิตคงเหลือตอนนี้</label><input name="credits" type="number" step="any" required value="${f.credits ?? ''}">
        <label>เครดิตต่อ 1 บาท (maxplus = 3)</label><input name="rate" type="number" step="any" min="0.0001" value="${f.rate ?? 3}">
        <label>เตือนเมื่อเหลือต่ำกว่า (เครดิต, เว้นว่าง = เตือนเมื่อพอใช้ไม่ถึง 2 วัน)</label><input name="low" type="number" step="any" min="0" value="${f.low ?? ''}">
        <div class="sheet-acts">${f.at ? '<button type="button" class="btn out" id="kfx">ลบ</button>' : ''}<button class="btn blue">บันทึก</button></div></form>`, (sd, close) => {
        sd.querySelector('#kff').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); if (!fd.getAll('keys').length) return toast('เลือก key อย่างน้อย 1 ตัว', 'bad'); try { await api('/admin/key-funds', { method: 'PUT', body: { ...Object.fromEntries(fd), keys: fd.getAll('keys') } }); close(); toast('บันทึกแล้ว', 'ok'); ADMIN.live(box); } catch (x) { toast(x.message, 'bad'); } };
        sd.querySelector('#kfx')?.addEventListener('click', async () => { await api('/admin/key-funds', { method: 'PUT', body: { key: a0.name, remove: true } }); close(); ADMIN.live(box); });
      });
    });
    clearTimeout(ADMIN._lvT); ADMIN._lvT = setTimeout(() => { if (box.isConnected && !document.querySelector('.sheet-bg') && !box.querySelector('input:focus')) ADMIN.live(box).catch(() => {}); }, 30e3);
  },
  async profit(box) {
    const famOf = n => /uncen/i.test(n) ? 'Uncen' : /claude|haiku|sonnet|opus|fable/i.test(n) ? 'Claude' : /gemini/i.test(n) ? 'Gemini' : /deepseek/i.test(n) ? 'DeepSeek' : /chatgpt|gpt/i.test(n) ? 'ChatGPT' : 'อื่น ๆ';
    window.famHTML = ms => { const f = new Map(), all = ms.reduce((s, x) => s + x.n, 0) || 1, cost = ms.reduce((s, x) => s + x.cost, 0) || 1; ms.forEach(m => { const k = famOf(m.name || ''), o = f.get(k) || { n: 0, cost: 0 }; o.n += m.n; o.cost += m.cost; f.set(k, o); });
      return `<div class="kpis sm">${[...f.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<div class="kpi"><div class="muted">${k}</div><div class="stat">${Math.round(o.n / all * 100)}%</div><div class="kd muted">ข้อความ ${num(o.n)} · ต้นทุน ${Math.round(o.cost / cost * 100)}%</div></div>`).join('')}</div>`; };
    const days = +(localStorage.getItem('adm-pdays') || 30), d = await api('/admin/profit?days=' + days), t = d.total, w = d.wallet;
    const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-', cls = v => v < -0.005 ? 'bad' : v > 0.005 ? 'ok' : 'muted';
    box.innerHTML = `<div class="seg" role="group" aria-label="ช่วงเวลา">${[7, 30, 90, 365].map(x => `<button data-d="${x}" class="${x === days ? 'on' : ''}">${x} วัน</button>`).join('')}</div>
      <div class="kpis">
        <div class="kpi"><div class="muted">รายได้</div><div class="stat">฿${baht(t.rev)}</div><div class="kd muted">เงินโอนเข้า: แพลน + เติม Wallet</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API</div><div class="stat">฿${baht(t.cost)}</div></div>
        <div class="kpi"><div class="muted">กำไรขั้นต้น</div><div class="stat ${cls(t.profit)}">฿${baht(t.profit)}</div><div class="kd muted">คิดจากแพลน ฿${baht(t.plan)} + ใช้ Wallet จริง ฿${baht(t.wallet)} − ต้นทุน · มาร์จิ้น ${pct(t.profit, t.earned)}</div></div>
        <div class="kpi"><div class="muted">ผู้ใช้ที่ขาดทุน</div><div class="stat ${d.losers ? 'bad' : ''}">${num(d.losers)}</div><div class="kd muted">ต้นทุนเกินเงินที่จ่าย</div></div>
      </div>
      ${forecastHTML(d.forecast)}
      <section class="panel"><div class="ph"><h2>แยกตามแพลน</h2><span class="muted">${days} วัน</span></div>
        <div class="tw"><table class="tbl"><tr><th>แพลน</th><th>สมาชิกตอนนี้</th><th>รายได้</th><th>ต้นทุน</th><th>กำไร</th><th>ต้นทุน/คน</th></tr>
        ${d.plans.map(p => `<tr><td>${esc(p.name)} <span class="muted">${p.price ? '฿' + baht(p.price) : 'ฟรี'}</span></td><td>${num(p.subs)}</td><td>฿${baht(p.rev)}</td><td>฿${baht(p.cost)}</td><td class="${cls(p.rev - p.cost)}">฿${baht(p.rev - p.cost)}</td><td>${p.subs ? '฿' + baht(p.cost / p.subs) : '-'}${p.price && p.subs && p.cost / p.subs > p.price * days / 30 ? ' <span class="bad">เกินค่าแพลน</span>' : ''}</td></tr>`).join('')}</table></div>
        <p class="muted">ต้นทุนนับตามแพลนปัจจุบันของผู้ใช้ · แพลนฟรีไม่มีรายได้ ต้นทุนคือค่าโปรโมต</p></section>
      <section class="panel"><div class="ph"><h2>โมเดลยอดนิยมและความเร็ว</h2><span class="muted">${days} วัน · ไม่นับบัญชีแอดมิน/ที่ติ๊กไม่นับ</span></div>
        ${famHTML(d.models || [])}
        <div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ผู้ใช้</th><th>ข้อความ</th><th>% ข้อความ</th><th>รอตัวแรก</th><th>ทั้งคำตอบ</th><th>token/วิ</th></tr>
        ${[...(d.models || [])].sort((a, b) => (b.users || 0) - (a.users || 0) || b.n - a.n).slice(0, 25).map(m => `<tr><td>${esc(m.name || '#' + m.id)}</td><td><b>${num(m.users || 0)}</b></td><td>${num(m.n)}</td><td>${pct(m.n, (d.models || []).reduce((s, x) => s + x.n, 0))}</td><td>${m.ttft ? (m.ttft / 1000).toFixed(1) + ' วิ' : '-'}</td><td>${m.ms ? (m.ms / 1000).toFixed(1) + ' วิ' : '-'}</td><td>${m.tps ? Math.round(m.tps) : '-'}</td></tr>`).join('')}</table></div></section>
      <section class="panel"><div class="ph"><h2>ต้นทุนจริงต่อโมเดล</h2><span class="muted">${days} วัน</span></div>
        <div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>คำขอ</th><th>ต้นทุน</th><th>% ของต้นทุนรวม</th><th>token เข้า</th><th>cache</th><th>ออก</th></tr>
        ${(d.models || []).map(m => `<tr><td>${esc(m.name || '#' + m.id)}</td><td>${num(m.n)}</td><td>฿${baht(m.cost)}</td><td>${pct(m.cost, t.cost)}</td><td>${num(m.tin)}</td><td>${num(m.tcache)}</td><td>${num(m.tout)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">ยังไม่มีการใช้งาน</td></tr>'}</table></div></section>
      <section class="panel"><div class="ph"><h2>รายวัน</h2><span class="muted">เวลาไทย · รายได้ = เงินโอนเข้า · กำไร = แพลน + ใช้ Wallet จริง − ต้นทุน</span></div>
        <div class="tw"><table class="tbl"><tr><th>วัน</th><th>รายได้</th><th>ต้นทุน</th><th>กำไร</th></tr>
        ${(d.daily || []).slice(0, 31).map(x => `<tr><td>${x.date}</td><td>฿${baht(x.rev)}</td><td>฿${baht(x.cost)}</td><td class="${cls(x.profit)}">฿${baht(x.profit)}</td></tr>`).join('')}</table></div></section>
      <section class="panel"><div class="ph"><h2>Wallet และ API</h2></div><div class="kpis sm">
        <div class="kpi"><div class="muted">ค่าใช้ API/เกินลิมิต</div><div class="stat">฿${baht(w.charges)}</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API นักพัฒนา</div><div class="stat">฿${baht(w.api_cost)}</div></div>
        <div class="kpi"><div class="muted">เงินเติมเข้า</div><div class="stat">฿${baht(w.topups)}</div></div>
        <div class="kpi"><div class="muted">ยอดค้างใน Wallet ทั้งหมด</div><div class="stat">฿${baht(w.liability)}</div><div class="kd muted">เงินที่ผู้ใช้ยังใช้ได้</div></div></div></section>
      <section class="panel"><div class="ph"><h2>กำไรรายผู้ใช้</h2><span class="muted">ขาดทุนมากสุดอยู่บน</span></div>
        ${d.users.length ? `<div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>จ่าย</th><th>ต้นทุน</th><th>กำไร</th></tr>${d.users.map(u => `<tr class="click" data-user="${u.id}"><td>${esc(u.email)}</td><td>${esc(u.plan || 'Free')}</td><td>฿${baht(u.rev)}</td><td>฿${baht(u.cost)}</td><td class="${cls(u.profit)}">฿${baht(u.profit)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีข้อมูล</p>'}</section>
      <section class="panel"><div class="ph"><h2>ส่งออกข้อมูล (CSV)</h2></div><p class="muted">เปิดด้วย Excel หรือ Google Sheets ได้ ใช้ทำบัญชีและยื่นภาษี</p>
        <div class="row"><select id="exd" style="width:auto">${[[31, '31 วัน'], [92, '3 เดือน'], [366, '1 ปี'], [3650, 'ทั้งหมด']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        ${[['payments', 'การชำระเงิน'], ['wallet', 'ความเคลื่อนไหว Wallet'], ['usage', 'การใช้งานและต้นทุน']].map(([k, l]) => `<a class="btn out sm" data-ex="${k}" href="/api/admin/export?type=${k}&days=31" download>${l}</a>`).join('')}</div></section>`;
    box.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { localStorage.setItem('adm-pdays', b.dataset.d); ADMIN.profit(box); });
    box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => userDrawer(+r.dataset.user));
    $('#exd').onchange = e => box.querySelectorAll('[data-ex]').forEach(a => a.href = `/api/admin/export?type=${a.dataset.ex}&days=${e.target.value}`);
  },
  async posts(box, reload) { return editors('posts', box, reload); },

  async coupons(box, reload) {
    const cs = await api('/admin/coupons');
    const KIND = { percent: 'ลด %', fixed: 'ลดบาท', credit: 'เครดิต Wallet' };
    const form = (c = { kind: 'percent', active: 1 }) => `<form class="ed-f cpf"><div class="form2">
      <div><label>โค้ด</label><input name="code" value="${esc(c.code || '')}" ${c.code ? 'readonly' : ''} required pattern="[A-Za-z0-9_-]{3,30}" autocapitalize="characters"></div>
      <div><label>ชนิด</label><select name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>มูลค่า (% หรือ บาท)</label><input name="value" type="number" step="any" min="0" value="${c.value ?? ''}" required></div>
      <div><label>ใช้ได้กี่ครั้งรวม (0 = ไม่จำกัด)</label><input name="max_uses" type="number" min="0" value="${c.max_uses ?? 0}"></div>
      <div><label>หมดอายุ (เว้นว่าง = ไม่หมด)</label><input name="expires" type="date" value="${c.expires ? new Date(c.expires).toISOString().slice(0, 10) : ''}"></div>
      <div><label>โน้ต</label><input name="note" value="${esc(c.note || '')}"></div>
      <div><label>เปิดใช้</label><label class="sw"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}><span></span></label></div></div>
      <div class="row" style="margin-top:16px"><button class="btn blue sm">Save</button>${c.code ? `<button type="button" class="btn red sm" data-del="${esc(c.code)}">Delete</button>` : ''}</div></form>`;
    box.innerHTML = `<p class="muted hint">ลด % / ลดบาท ใช้ตอนซื้อแพลน · เครดิต Wallet ผู้ใช้กรอกที่หน้าบัญชี · คนหนึ่งใช้โค้ดเดิมได้ครั้งเดียว</p>
      <div class="ed-list">${cs.map(c => `<details class="ed"><summary><b>${esc(c.code)}</b><span class="muted">${KIND[c.kind]} ${c.kind === 'percent' ? c.value + '%' : '฿' + baht(c.value)} · ใช้แล้ว ${c.used}${c.max_uses ? '/' + c.max_uses : ''}${c.expires ? ' · หมด ' + dayLabel(c.expires) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span>${c.active ? '' : '<span class="pill">ปิดอยู่</span>'}</summary>${form(c)}</details>`).join('')}
      <details class="ed add"><summary><b>+ สร้างคูปอง</b></summary>${form()}</details></div>`;
    box.querySelectorAll('.cpf').forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const b = Object.fromEntries(new FormData(f));
      b.active = b.active ? 1 : 0; b.expires = b.expires ? new Date(b.expires + 'T23:59:59+07:00').getTime() : null;
      try { await api('/admin/coupons', { method: 'POST', body: b }); reload(); } catch (x) { toast(x.message, 'bad'); }
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmSheet('ลบคูปองนี้?', { title: 'ลบคูปอง', ok: 'Delete', danger: true })) { await api('/admin/coupons', { method: 'DELETE', body: { code: b.dataset.del } }); reload(); } });
  },

  async tickets(box) {
    const id = qs().get('id');
    if (ADMIN._canned == null) ADMIN._canned = (await api('/admin/settings').catch(() => ({}))).canned_replies || 'ขอบคุณที่แจ้ง\nขอบคุณที่แจ้งเข้ามาครับ ทีมงานกำลังตรวจสอบและจะแจ้งกลับโดยเร็ว\n---\nเติมเงินแล้ว\nเติมเงินเข้า Wallet ให้เรียบร้อยแล้วครับ ตรวจสอบยอดได้ที่หน้าบัญชี\n---\nแนะนำแพลน\nแนะนำแพลน Plus สำหรับใช้งานทั่วไป หรือ Pro ถ้าใช้โหมด Code บ่อย ดูรายละเอียดได้ที่ /plans';
    if (id) {
      const t = await api('/admin/tickets/' + id);
      box.innerHTML = `<p><a href="/admin?tab=tickets">← ทั้งหมด</a></p><div class="panel"><div class="ph"><h2>${esc(t.subject)}</h2><span class="muted">${esc(t.email)}</span></div>
        <div class="thread">${t.msgs.map(m => `<div class="tmsg ${m.admin ? '' : 'adm'}"><div class="muted" style="font-size:12px">${m.admin ? 'แอดมิน' : esc(t.email)} · ${when(m.created_at)}</div><div>${esc(m.body).replace(/\n/g, '<br>')}</div></div>`).join('')}</div>
        <div class="row" id="canned" style="gap:6px;flex-wrap:wrap;margin:8px 0">${cannedList().map((c, i) => `<button type="button" class="btn out sm" data-cn="${i}">${esc(c.title)}</button>`).join('')}<button type="button" class="btn out sm" id="cned">${ic('pen', 'sm')} แก้คำตอบสำเร็จ</button></div>
        <form id="tr"><textarea name="body" rows="4" placeholder="ตอบกลับ (ส่งอีเมลแจ้งผู้ใช้ด้วย ถ้าเปิดระบบอีเมล)"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn blue sm">Send answer</button><button type="button" class="btn out sm" id="tclose">${t.status === 'closed' ? 'Closed' : 'Close ticket'}</button><button type="button" class="btn out sm" data-user="${t.user_id}">View user</button></div></form></div>`;
      box.querySelectorAll('[data-cn]').forEach(b => b.onclick = () => { const ta = $('#tr textarea'); ta.value = (ta.value ? ta.value + '\n\n' : '') + cannedList()[+b.dataset.cn].body; ta.focus(); });
      $('#cned').onclick = () => sheet('คำตอบสำเร็จ', `<form class="sheet-form" id="cnf"><p class="muted" style="margin:0">คั่นแต่ละคำตอบด้วยบรรทัด <code>---</code> · บรรทัดแรกของแต่ละอันคือชื่อปุ่ม</p><textarea name="v" rows="12">${esc(ADMIN._canned || '')}</textarea><button class="btn blue">บันทึก</button></form>`, (d, close) => { d.querySelector('#cnf').onsubmit = async e => { e.preventDefault(); const v = new FormData(e.target).get('v'); await api('/admin/settings', { method: 'PUT', body: { canned_replies: v } }); ADMIN._canned = v; close(); ADMIN.tickets(box); }; });
      $('#tr').onsubmit = async e => { e.preventDefault(); await api('/admin/tickets/' + id, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); ADMIN.tickets(box); };
      $('#tclose').onclick = async () => { await api('/admin/tickets/' + id, { method: 'POST', body: { status: 'closed' } }); go('/admin?tab=tickets'); };
      box.querySelector('[data-user]').onclick = () => userDrawer(t.user_id);
      return;
    }
    const ts = await api('/admin/tickets');
    const TS = { open: '<span class="pill warn">● รอตอบ</span>', answered: '<span class="pill ok">ตอบแล้ว</span>', closed: '<span class="pill">ปิด</span>' };
    box.innerHTML = ts.map(t => `<a class="urow" href="/admin?tab=tickets&id=${t.id}"><span class="ue"><b>${esc(t.subject)}</b><span class="muted">${esc(t.email)} · ${t.n} ข้อความ · ${ago(t.updated_at)}</span></span>${TS[t.status] || ''}<span class="chev">›</span></a>`).join('') || '<div class="empty-s">ยังไม่มีเรื่อง</div>';
  },

  async apistats(box) {
    const nd = +(localStorage.getItem('adm-adays') || 7), d = await api('/admin/apistats?days=' + nd), pct = (e, n) => n ? Math.round(e / n * 1000) / 10 + '%' : '-', t = d.total;
    const cls = v => v < -0.005 ? 'bad' : v > 0.005 ? 'ok' : 'muted';
    const tbl = (head, rows) => rows.length ? `<div class="tw"><table class="tbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table></div>` : '<p class="muted">ยังไม่มีข้อมูล</p>';
    box.innerHTML = `<div class="seg" role="group" aria-label="ช่วงเวลา">${[7, 30].map(x => `<button data-ad="${x}" class="${x === nd ? 'on' : ''}">${x} วัน</button>`).join('')}</div>
      <div class="kpis">
        <div class="kpi"><div class="muted">ขาย API (หัก Wallet)</div><div class="stat">฿${baht(t.sold)}</div></div>
        <div class="kpi"><div class="muted">ต้นทุนส่วนที่ขาย</div><div class="stat">฿${baht(t.cost_wallet)}</div></div>
        <div class="kpi"><div class="muted">กำไรจากการขาย API</div><div class="stat ${cls(t.sold - t.cost_wallet)}">฿${baht(t.sold - t.cost_wallet)}</div><div class="kd muted">มาร์จิ้น ${t.sold ? Math.round((t.sold - t.cost_wallet) / t.sold * 100) + '%' : '-'}</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API ในลิมิตแพลน</div><div class="stat">฿${baht(t.cost_plan)}</div><div class="kd muted">รายได้อยู่ในค่าแพลนแล้ว</div></div>
      </div>
      <section class="panel"><div class="ph"><h2>ยอดขาย API เทียบต้นทุน รายผู้ใช้</h2><span class="muted">${nd} วัน · กดแถวเพื่อดูผู้ใช้</span></div>
        ${tbl(['ผู้ใช้', 'แพลน', 'คำขอ', 'ขายได้', 'ต้นทุน', 'กำไร', 'ต้นทุนในแพลน', 'ค่าแพลนที่จ่าย'], d.sales.map(u => `<tr class="click" data-user="${u.id}"><td>${esc(u.email)}</td><td>${esc(u.plan || 'Free')}</td><td>${num(u.n)}</td><td>฿${baht(u.sold)}</td><td>฿${baht(u.cost_wallet)}</td><td class="${cls(u.profit)}">฿${baht(u.profit)}</td><td>${u.cost_plan ? '฿' + baht(u.cost_plan) : '-'}</td><td>${u.plan_paid ? '฿' + baht(u.plan_paid) : '-'}</td></tr>`))}
        <p class="muted">ขายได้ = เงินที่หักจาก Wallet เป็นค่า API · ต้นทุน = ค่า API จริงของคำขอเหล่านั้น · ต้นทุนในแพลน = คำขอที่ใช้ลิมิตแพลน (ไม่หักเงินเพิ่ม)</p></section>
      <div class="card"><b>รายวัน</b>${tbl(['วัน', 'คำขอ', 'สำเร็จ', 'ผิดพลาด', '%', 'เก็บเงิน ฿'], d.days.map(r => `<tr><td>${r.d}</td><td>${r.n}</td><td>${r.ok}</td><td>${r.errors}</td><td>${pct(r.errors, r.n)}</td><td>${r.charge}</td></tr>`))}</div>
      <div class="card"><b>ต่อโมเดล</b>${tbl(['โมเดล', 'คำขอ', 'ผิดพลาด', 'เฉลี่ย ms', 'token in/out', 'เก็บเงิน ฿'], d.models.map(r => `<tr><td>${esc(r.model)}</td><td>${r.n}</td><td class="${r.errors / r.n > 0.1 ? 'bad' : ''}">${r.errors} (${pct(r.errors, r.n)})</td><td>${r.ms}</td><td>${r.tin}/${r.tout}</td><td>${r.charge}</td></tr>`))}
        <p class="muted">คำขอที่ถูกปฏิเสธก่อนถึงโมเดล (Wallet ไม่พอ ติดลิมิต endpoint ผิด) ไม่หักเงิน และไม่นับในตารางนี้ ดูได้ที่ข้อผิดพลาดล่าสุด</p></div>
      <div class="card"><b>Key ที่ใช้มากสุด</b>${tbl(['key', 'ผู้ใช้', 'คำขอ', 'ผิดพลาด', 'เก็บเงิน ฿'], d.keys.map(r => `<tr><td>${esc(r.name)} <code>${esc(r.prefix)}…</code></td><td>${esc(r.email)}</td><td>${r.n}</td><td>${r.errors}</td><td>${r.charge}</td></tr>`))}</div>
      <div class="card"><b>ข้อผิดพลาดล่าสุด</b>${tbl(['เวลา', 'ผู้ใช้', 'endpoint', 'โมเดล', 'status', 'ข้อความ'], d.errors.map(r => `<tr><td>${when(r.created_at)}</td><td>${esc(r.email)}</td><td><code>${esc(r.path)}</code></td><td>${esc(r.model || '-')}</td><td class="bad">${r.status}</td><td>${esc(r.err || '')}</td></tr>`))}</div>`;
    box.querySelectorAll('[data-ad]').forEach(b => b.onclick = () => { localStorage.setItem('adm-adays', b.dataset.ad); ADMIN.apistats(box); });
    box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => userDrawer(+r.dataset.user));
  },

  async agents(box, reload) { // ต้นทุน Agent / ทีม Agent (ต้นทุนจริงของเรา บาท)
    const d = await api('/admin/agents'), tbl = (head, rows) => rows.length ? `<div class="tw"><table class="tbl"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table></div>` : '<p class="muted">ยังไม่มีข้อมูล</p>';
    const dur = j => j.finished_at ? Math.max(1, Math.round((j.finished_at - j.created_at) / 60e3)) + ' นาที' : '-';
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><button class="btn out sm" data-agtest="team">ทดสอบทีม Agent</button><button class="btn out sm" data-agtest="research">ทดสอบ Deep research</button><span class="muted" style="font-size:12.5px">รันจริงด้วยบัญชีแอดมิน (ใช้โมเดลลูกทีมทั้งหมด ต้นทุนไม่กี่บาท) ผลขึ้นในตารางด้านล่าง</span></div>
      <p class="muted hint">งาน Agent เบื้องหลังและทีม Agent 30 วันล่าสุด · ต้นทุนจริงของเรา รวมลูกทีมและผู้ตรวจ · รวม ฿${d.total.toFixed(2)}</p>
      <div class="card"><b>ผู้ใช้ที่ใช้มากสุด</b>${tbl(['ผู้ใช้', 'งาน', 'ทีม', 'ต้นทุน ฿'], d.users.map(r => `<tr><td>${esc(r.email)}</td><td>${r.jobs}</td><td>${r.teams}</td><td>${r.cost.toFixed(2)}</td></tr>`))}</div>
      <div class="card"><b>งานล่าสุด</b>${tbl(['เวลา', 'ผู้ใช้', 'งาน', 'แบบ', 'สถานะ', 'รอบ', 'ใช้เวลา', 'ต้นทุน ฿'], d.jobs.map(j => `<tr><td style="white-space:nowrap">${when(j.created_at)}</td><td>${esc(j.email)}</td><td style="min-width:200px">${esc(j.prompt.slice(0, 60))}</td><td style="white-space:nowrap">${j.role === 'lead' ? 'ทีม ' + j.workers + ' ตัว' : j.role === 'research' ? 'research' : 'เดี่ยว'}</td><td class="${['failed', 'limit', 'timeout'].includes(j.status) ? 'bad' : ''}">${esc(j.status)}</td><td>${j.rounds}</td><td>${dur(j)}</td><td>${j.cost.toFixed(2)}</td></tr>`))}</div>`;
    box.querySelectorAll('[data-agtest]').forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await api('/admin/agent-test', { method: 'POST', body: { kind: b.dataset.agtest } }); toast(`เริ่มทดสอบแล้ว (${r.model}) รอสักครู่แล้วกดรีเฟรชแท็บนี้`, 'ok'); setTimeout(reload, 4000); } catch (x) { toast(x.message, 'bad'); b.disabled = false; } });
  },

  async quality(box, reload) {
    const d = await api('/admin/quality');
    box.innerHTML = `<p class="muted hint">คะแนนถูกใจ/ไม่ถูกใจจากผู้ใช้ใน 30 วันล่าสุด และรายงานคำตอบที่ไม่เหมาะสม</p>
      <div class="card"><b>คะแนนต่อโมเดล</b>${d.votes.length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>${ic('thumbup', 'sm')}</th><th>${ic('thumbdown', 'sm')}</th><th>พอใจ</th></tr>${d.votes.map(v => `<tr><td>${esc(v.name || '#' + v.model_id)}</td><td>${v.up}</td><td>${v.down}</td><td>${Math.round(v.up / Math.max(1, v.up + v.down) * 100)}%</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีคะแนน</p>'}</div>
      <div class="card"><b>AI ตรวจงานตัวเอง (โหมด Code, 7 วัน)</b>${d.selfcheck?.length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>คำตอบที่เจอปัญหา</th><th>แก้แล้วผ่าน</th><th>% แก้สำเร็จ</th><th>รอบแก้ทั้งหมด</th></tr>${d.selfcheck.map(s => `<tr><td>${esc(s.name || '#' + s.model_id)}</td><td>${s.found}</td><td>${s.fixed}</td><td>${s.found ? Math.round(s.fixed / s.found * 100) + '%' : '-'}</td><td>${s.rounds}</td></tr>`).join('')}</table></div><p class="muted" style="font-size:12.5px;margin:6px 0 0">ก่อนจบคำตอบ ระบบตรวจไวยากรณ์, ไฟล์ที่อ้างถึงแต่ไม่มี, ฟังก์ชันที่ไม่ถูกเรียก, error บนหน้าเว็บ และรายการงานค้าง · เจอแล้วให้ AI แก้ต่อ (สูงสุด 2 รอบ)</p>` : '<p class="muted">ยังไม่มีข้อมูล</p>'}</div>
      <div class="card"><b>อัตรา cache hit (7 วัน)</b>${d.cache?.length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>คำขอ</th><th>token เข้า (ไม่ cache)</th><th>อ่านจาก cache</th><th>hit</th></tr>${d.cache.map(c => { const all = (c.fresh || 0) + (c.cached || 0); return `<tr><td>${esc(c.name || '#' + c.model_id)}</td><td>${c.n}</td><td>${(c.fresh || 0).toLocaleString()}</td><td>${(c.cached || 0).toLocaleString()}</td><td><b>${all ? Math.round(c.cached / all * 100) : 0}%</b></td></tr>`; }).join('')}</table></div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}</div>
      <div class="card"><b>รายงานคำตอบ</b>${d.reports.length ? d.reports.map(r => `<div class="rep ${r.status}"><div class="muted" style="font-size:12px">#${r.message_id} · ${esc(r.model || '-')} · ${esc(r.email || '-')} · ${when(r.created_at)}</div><div><b>${esc(r.reason || '(ไม่ระบุเหตุผล)')}</b></div><div class="muted" style="font-size:13px;white-space:pre-wrap">${esc(r.snippet)}</div><button class="btn out sm" data-repctx="${r.id}">ดูบทสนทนา</button> <button class="btn out sm" data-rep="${r.id}" data-s="${r.status === 'open' ? 'done' : 'open'}">${r.status === 'open' ? 'Mark done' : 'Reopen'}</button></div>`).join('') : '<p class="muted">ไม่มีรายงาน</p>'}</div>`;
    box.querySelectorAll('[data-rep]').forEach(b => b.onclick = async () => { await api('/admin/reports/' + b.dataset.rep, { method: 'PUT', body: { status: b.dataset.s } }); reload(); });
    box.insertAdjacentHTML('afterbegin', `<div class="card"><b>ทดสอบเทียบโมเดล</b><p class="muted" style="font-size:13px;margin:4px 0 8px">โจทย์ 8 ข้อที่มีคำตอบตายตัว (การเงิน คณิต โค้ด ภาษาไทย ทำตามคำสั่ง เหตุผล) วัดถูกผิด เวลา และต้นทุนจริง · เสียค่า API จริงประมาณ ฿0.1–3 ต่อโมเดล</p><button class="btn blue sm" id="bench">เลือกโมเดลแล้วทดสอบ</button><div id="benchout"></div></div>`);
    box.querySelector('#bench').onclick = async () => {
      const ms = (await api('/admin/models')).filter(m => m.active && !['image', 'embedding'].includes(m.provider));
      sheet('เลือกโมเดลที่จะทดสอบ', `<form id="bf" class="sheet-form" style="display:grid;gap:6px">${ms.map(m => `<label class="row" style="flex-wrap:nowrap;gap:8px"><input type="checkbox" name="m" value="${m.id}" style="width:auto"> ${esc(m.name)}</label>`).join('')}<button class="btn blue">เริ่มทดสอบ</button></form>`, (d, close) => {
        d.querySelector('#bf').onsubmit = async e => {
          e.preventDefault(); const ids = new FormData(e.target).getAll('m').map(Number); if (!ids.length) return; close();
          const out = box.querySelector('#benchout'), rows = [];
          const draw = busy => { out.innerHTML = `<div class="tw" style="margin-top:10px"><table class="tbl"><tr><th>โมเดล</th><th>ผ่าน</th><th>เวลาเฉลี่ย</th><th>ต้นทุนรวม</th></tr>${rows.map((r, i) => `<tr class="click" data-bi="${i}"><td>${esc(r.model)}</td><td><b>${r.score}/${r.total}</b></td><td>${(r.ms / 1000).toFixed(1)} วิ</td><td>฿${r.cost.toFixed(4)}</td></tr>`).join('')}${busy ? `<tr><td colspan="4" class="muted">กำลังทดสอบ ${esc(busy)}…</td></tr>` : ''}</table></div>`;
            out.querySelectorAll('[data-bi]').forEach(tr => tr.onclick = () => { const r = rows[+tr.dataset.bi]; sheet(r.model, r.items.map(x => `<div style="margin:8px 0"><b>${x.pass ? '✓' : '✗'} ${esc(x.cat)}</b> <span class="muted">${(x.ms / 1000).toFixed(1)} วิ</span><div class="muted" style="font-size:12.5px">${esc(x.q)}</div><div style="white-space:pre-wrap;font-size:13px">${esc(x.answer)}</div></div>`).join('')); }); };
          for (const id of ids) { draw(ms.find(m => m.id === id)?.name); try { rows.push(await api('/admin/bench', { method: 'POST', body: { model_id: id } })); } catch (x) { toast(x.message, 'bad'); } }
          rows.sort((a, b) => b.score - a.score || a.ms - b.ms); draw('');
        };
      });
    };
    box.querySelectorAll('[data-repctx]').forEach(b => b.onclick = async () => { try { const ms = await api(`/admin/reports/${b.dataset.repctx}/context`); sheet('บทสนทนาที่ถูกรายงาน', `<p class="muted" style="font-size:12px;margin:0 0 8px">แสดงเฉพาะช่วงรอบข้อความที่ถูกรายงาน · การเปิดดูถูกบันทึกในประวัติแอดมิน</p>${ms.map(m => `<div style="margin:8px 0;padding:8px 10px;border-radius:10px;background:${m.reported ? 'rgba(220,60,60,.12)' : 'rgba(var(--ov),.05)'}"><div class="muted" style="font-size:11.5px">${m.role === 'user' ? 'ผู้ใช้' : 'AI'} · ${when(m.created_at)}${m.reported ? ' · <b class="bad">ข้อความที่ถูกรายงาน</b>' : ''}</div><div style="white-space:pre-wrap;font-size:13px">${esc(m.content)}</div></div>`).join('')}`); } catch (x) { toast(x.message, 'bad'); } });
  },

  async system(box, reload) {
    const [s, backups, events, logs] = await Promise.all([api('/admin/settings'), api('/admin/backups').catch(x => ({ error: x.message })), api('/admin/events'), api('/admin/audit')]);
    const save = async (body, el) => { await api('/admin/settings', { method: 'PUT', body }); el.textContent = '✓ บันทึกแล้ว'; setTimeout(() => el.textContent = '', 2000); };
    box.innerHTML = `<form class="panel form-p" id="mf"><h2>โหมดปิดปรับปรุง</h2>
      <label class="sw-row"><span class="sw"><input type="checkbox" name="maintenance" ${s.maintenance === '1' ? 'checked' : ''}><span></span></span> ปิดเว็บชั่วคราว (แอดมินยังใช้ได้ หน้าแรก/สถานะ/บล็อกยังเปิด)</label>
      <h2 style="margin-top:24px">ประกาศ</h2><label>ข้อความ (เว้นว่าง = ไม่แสดง) ใส่ลิงก์แบบ [ข้อความ](https://...) ได้</label><textarea name="announcement" rows="2">${esc(s.announcement)}</textarea>
      <label>ระดับ</label><select name="announcement_level">${[['info', 'ทั่วไป'], ['warn', 'เตือน'], ['critical', 'สำคัญมาก']].map(([k, l]) => `<option value="${k}" ${s.announcement_level === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <h2 style="margin-top:24px">ย่อแชตอัตโนมัติ</h2><label>ย่อแชตเมื่อ context ใช้ถึงกี่ % ของหน้าต่างโมเดล (เว้นว่าง = 75 · 0 = ปิดทั้งระบบ · ผู้ใช้ปิดของตัวเองได้)</label><input name="compact_pct" type="number" min="0" max="95" value="${esc(s.compact_pct || '')}" placeholder="75">
      <h2 style="margin-top:24px">โปรเพิ่มลิมิต</h2><label>หมดเขตโปร (เวลาไทย · เว้นว่าง = ไม่มีโปร) แพลนเสียเงินได้ลิมิตเพิ่มตามตัวคูณจนถึงเวลานี้ แล้วกลับเป็นปกติเอง</label><input name="promo_until_dt" type="datetime-local" value="${+s.promo_until ? new Date(+s.promo_until - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16) : ''}">
      <div class="form2"><div><label>ตัวคูณรอบ 4 ชม.</label><input name="promo_x4h" type="number" min="1" step="0.1" value="${esc(s.promo_x4h || '')}"></div><div><label>ตัวคูณรายสัปดาห์</label><input name="promo_xweek" type="number" min="1" step="0.1" value="${esc(s.promo_xweek || '')}"></div></div>
      <label>ข้อความประกาศโปร (แถบบนเว็บ · ต่อท้ายวันหมดเขตให้เอง)</label><input name="promo_label" maxlength="200" value="${esc(s.promo_label || '')}">
      <h2 style="margin-top:24px">ทีม Agent</h2><label>เพดานลิมิตต่อหนึ่งงานทีม (% ของลิมิตสัปดาห์ · เว้นว่าง = 30)</label><input name="team_budget_pct" type="number" min="1" max="100" step="any" value="${esc(s.team_budget_pct || '')}">
      <label>โมเดลลูกทีม (id ของโมเดล · เว้นว่าง = DeepSeek 4.1 Flash ถ้าแพลนมี ไม่งั้นตัวที่ถูกสุด)</label><input name="team_worker_model" type="number" min="1" value="${esc(s.team_worker_model || '')}">
      <h2 style="margin-top:24px">โบนัสและ Affiliate</h2><div class="form2"><div><label>โบนัสเติมเงินครั้งแรก % (เว้นว่าง/0 = ปิด · แนะนำ 20)</label><input name="first_topup_pct" type="number" min="0" max="100" value="${esc(s.first_topup_pct ?? '')}"></div><div><label>เพดานโบนัสครั้งแรก (บาท · เว้นว่าง = 100)</label><input name="first_topup_max" type="number" min="0" value="${esc(s.first_topup_max ?? '')}"></div><div><label>ค่าคอม Affiliate % ของยอดที่คนถูกชวนจ่าย (0 = ปิด)</label><input name="aff_pct" type="number" min="0" max="50" step="0.5" value="${esc(s.aff_pct ?? '')}"></div><div><label>ได้ค่าคอมกี่เดือนแรกของบัญชีที่ชวน (เว้นว่าง = 12)</label><input name="aff_months" type="number" min="1" value="${esc(s.aff_months ?? '')}"></div><div><label>เครดิตดึงคนกลับ (บาท · คนหายไป 14 วัน · 0 = ส่งแค่อีเมล)</label><input name="winback_credit" type="number" min="0" value="${esc(s.winback_credit ?? '')}"></div></div><h2 style="margin-top:24px">กันสมัครปลอม</h2><label>โดเมนอีเมลที่ห้ามสมัครเพิ่มเติม (มีรายการอีเมลชั่วคราวยอดนิยมในระบบแล้ว · คั่นด้วย , หรือขึ้นบรรทัด)</label><textarea name="block_domains" rows="2" placeholder="example-temp.com, another.net">${esc(s.block_domains || '')}</textarea><h2 style="margin-top:24px">ช่วยเขียน prompt สร้างภาพ</h2><label>โมเดลที่ช่วยปรับ prompt (id · เว้นว่าง = ChatGPT 6.1 Sol ถ้าแพลนของผู้ใช้มี ไม่งั้น DeepSeek 4.1 Flash)</label><input name="image_prompt_model" type="number" min="1" value="${esc(s.image_prompt_model || '')}">
      <h2 style="margin-top:24px">คำต้องห้าม</h2><label>ข้อความที่มีคำเหล่านี้จะถูกปฏิเสธก่อนส่งให้โมเดล (คั่นด้วย , หรือขึ้นบรรทัดใหม่ · เว้นว่าง = ไม่กรอง) ใช้กันเนื้อหาที่ทำให้คีย์ upstream โดนแบน</label><textarea name="block_words" rows="2">${esc(s.block_words || '')}</textarea>
      <div class="row" style="margin-top:16px"><button class="btn blue">Save</button><span class="ok" id="ms"></span></div></form>

      <form class="panel form-p" id="af"><h2>แจ้งเตือนแอดมิน</h2><p class="muted">แจ้งเมื่อมีสลิปใหม่ เรื่องติดต่อใหม่ โมเดลล่ม และต้นทุนเกินกำหนด</p>
      <label>Discord webhook URL</label><input name="alert_discord" value="${esc(s.alert_discord)}" placeholder="https://discord.com/api/webhooks/...">
      <label>LINE: User ID หรือ Group ID ที่จะส่งถึง</label><input name="alert_line_to" value="${esc(s.alert_line_to)}" placeholder="U1234...">
      <p class="muted">LINE ใช้ Messaging API (LINE Notify ปิดบริการแล้ว) ตั้ง Secret <code>LINE_ALERT_TOKEN</code> = Channel access token ${s.env.LINE_ALERT_TOKEN ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'}</p>
      <label>แจ้งเมื่อต้นทุน API ต่อวันเกิน (บาท, 0 = ปิด)</label><input name="cost_alert_daily" type="number" min="0" step="any" value="${esc(s.cost_alert_daily || '0')}">
      <h3 style="margin-top:18px">แพ็กเสริม Agent</h3><p class="muted" style="margin:0">ลูกค้าซื้อด้วย Wallet ได้โควตาใช้ Agent (แอป Desktop / คลาวด์) แยกจากลิมิตแชต · แพลนที่ติ๊ก "รวม Agent" ใช้ลิมิตแพลนแทน</p>
      <label class="sw-row"><span class="sw"><input type="checkbox" name="agent_pack_enabled" value="1" ${s.agent_pack_enabled === '1' ? 'checked' : ''}><span></span></span> เปิดขายแพ็ก Agent</label>
      <div class="form2"><div><label>ราคา (บาท)</label><input name="agent_pack_price" type="number" min="1" step="any" value="${esc(s.agent_pack_price || '199')}"></div><div><label>โควตา (บาท ต้นทุนจริง × ตัวคูณโมเดล)</label><input name="agent_pack_units" type="number" min="1" step="any" value="${esc(s.agent_pack_units || '120')}"></div><div><label>อายุ (วัน)</label><input name="agent_pack_days" type="number" min="1" value="${esc(s.agent_pack_days || '30')}"></div></div>
      <div class="row" style="margin-top:16px"><button class="btn blue">Save</button><button type="button" class="btn out" id="atest">Send test</button><span class="ok" id="as"></span></div></form>

      <section class="panel"><div class="ph"><h2>อีเมลถึงผู้ใช้ทุกคน</h2></div><p class="muted">ไม่ส่งถึงคนที่ปิดอีเมลสรุป/ข่าวสารในหน้าบัญชี · ส่งได้วันละ 2 ครั้ง · กดส่งทดสอบให้ตัวเองก่อน</p>
        <form id="bcf" class="sheet-form" onsubmit="return false"><input name="subject" maxlength="150" placeholder="หัวข้อ" value="AstraCode โปรเดือนนี้: ใช้งานได้ 2 เท่า ถึง 30 พ.ย.">
        <textarea name="body" rows="5" maxlength="4000">ตั้งแต่วันนี้ถึง 30 พ.ย. 23:59 (เวลาไทย) ทุกแพลนที่ชำระเงินใช้งานได้ 2 เท่าในรอบ 4 ชั่วโมง และลิมิตรายสัปดาห์เพิ่ม 50% ไม่ต้องกดรับ ระบบปรับให้เอง

มีอะไรใหม่: Deep research, ทีม Agent ในโหมด Code และระบบสร้างภาพที่ AI ช่วยเขียน prompt ให้</textarea>
        <input name="button" maxlength="40" placeholder="ข้อความปุ่ม (ลิงก์ไปหน้าแพลน · เว้นว่าง = ไม่มีปุ่ม)" value="ดูแพลน">
        <div class="row"><button type="button" class="btn out sm" id="bct">ส่งทดสอบให้ฉัน</button><button type="button" class="btn red sm" id="bca">ส่งถึงทุกคน</button></div></form></section>
      <section class="panel"><div class="ph"><h2>สำรองข้อมูล (R2)</h2><span><button class="btn out sm" id="bkv">ตรวจไฟล์ล่าสุด</button> <button class="btn out sm" id="bk">Back up now</button></span></div><div id="bkr"></div>
        <p class="muted">ระบบสำรองอัตโนมัติทุกวันตี 3 (ต้องตั้ง Cron Trigger) เก็บ 14 ชุดล่าสุด</p>
        ${backups.error ? `<p class="warn">${esc(backups.error)}</p>` : backups.length ? backups.map(b => `<div class="row" style="padding:6px 0;border-top:1px solid var(--steel)"><span>${when(b.at)}</span><span class="muted">${compact(b.size)}B</span><span style="flex:1"></span><a href="/api/admin/backups/${esc(b.key)}" download>ดาวน์โหลด</a></div>`).join('') : '<p class="muted">ยังไม่มีไฟล์สำรอง</p>'}</section>

      <section class="panel"><div class="ph"><h2>ความพร้อมของระบบ</h2></div><div class="envs">
        ${[['RESEND_KEY', 'อีเมล (Resend)'], ['TAVILY_KEY', 'ค้นเว็บ (Tavily)'], ['SECRET_KEY', 'เข้ารหัส token GitHub / 2FA'], ['GOOGLE_CLIENT_ID', 'ล็อกอิน Google'], ['LINE_CHANNEL_ID', 'ล็อกอิน LINE'], ['LINE_ALERT_TOKEN', 'แจ้งเตือน LINE'], ['PUBLIC_URL', 'โดเมนหลักสำหรับลิงก์ในอีเมล']].map(([k, l]) => `<div>${s.env[k] ? '<span class="ok">✓</span>' : '<span class="muted">○</span>'} ${l} <code>${k}</code></div>`).join('')}
        <div>${s.r2 ? '<span class="ok">✓</span>' : '<span class="muted">○</span>'} R2 (สลิป รูป และไฟล์สำรอง) <code>SLIPS</code></div></div></section>

      <section class="panel"><div class="ph"><h2>เหตุการณ์ล่าสุด</h2><a href="/status">หน้าสถานะ ›</a></div>
        ${events.length ? `<div class="tw"><table class="tbl"><tr><th>เวลา</th><th>ชนิด</th><th>โมเดล</th><th>รายละเอียด</th></tr>${events.slice(0, 50).map(e => `<tr><td>${when(e.created_at)}</td><td>${e.kind === 'error' ? '<span class="bad">error</span>' : esc(e.kind)}</td><td>${esc(e.model || '-')}</td><td class="muted">${esc(e.detail)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ไม่มีเหตุการณ์</p>'}</section>

      <section class="panel"><div class="ph"><h2>บันทึกการกระทำของแอดมิน</h2></div>
        ${logs.length ? `<div class="tw"><table class="tbl"><tr><th>เวลา</th><th>แอดมิน</th><th>การกระทำ</th><th>รายละเอียด</th></tr>${logs.slice(0, 100).map(a => `<tr><td>${when(a.created_at)}</td><td>${esc(a.admin_email)}</td><td>${esc(a.action)}</td><td class="muted"><code>${esc(a.detail)}</code></td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีบันทึก</p>'}</section>`;
    $('#mf').onsubmit = e => { // บันทึกทุกช่องในฟอร์ม (เดิมบันทึกแค่ 3 ช่อง ช่องอื่นที่เพิ่มทีหลังจึงไม่ถูกบันทึก)
      e.preventDefault(); const fd = new FormData(e.target), o = Object.fromEntries(fd);
      o.maintenance = fd.get('maintenance') ? '1' : '0';
      o.promo_until = o.promo_until_dt ? String(new Date(o.promo_until_dt).getTime()) : ''; delete o.promo_until_dt;
      save(o, $('#ms'));
    };
    const bc = async test => { const f = $('#bcf'), body = { subject: f.subject.value, body: f.body.value, button: f.button.value, test };
      if (!test && !await confirmSheet('ส่งอีเมลนี้ถึงผู้ใช้ทุกคนตอนนี้? ยกเลิกไม่ได้', { title: 'ส่งอีเมลถึงทุกคน', ok: 'Send to everyone', danger: true })) return;
      try { const r = await api('/admin/broadcast', { method: 'POST', body }); toast(test ? 'ส่งทดสอบให้อีเมลแอดมินแล้ว' : `ส่งแล้ว ${r.sent}/${r.total} ฉบับ`, 'ok'); } catch (x) { toast(x.message, 'bad'); } };
    $('#bct').onclick = () => bc(true); $('#bca').onclick = () => bc(false);
    $('#af').onsubmit = e => { e.preventDefault(); save({ ...Object.fromEntries(new FormData(e.target)), agent_pack_enabled: e.target.agent_pack_enabled.checked ? '1' : '0' }, $('#as')); };
    $('#atest').onclick = async () => { try { await api('/admin/notify-test', { method: 'POST' }); $('#as').textContent = '✓ ส่งแล้ว ตรวจใน Discord/LINE'; } catch (x) { toast(x.message, 'bad'); } };
    $('#bkv').onclick = async e => { e.target.disabled = true; try { const v = await api('/admin/backups/verify', { method: 'POST' }); $('#bkr').innerHTML = v.error ? `<p class="warn">${esc(v.error)}</p>` : `<p class="${v.ok ? 'ok' : 'warn'}">${v.ok ? '✓ อ่านได้ครบ' : 'ไม่มีตารางในฐานข้อมูลตอนนี้: ' + esc(v.missing.join(', '))} · ${v.tables.length} ตาราง · ${v.tables.reduce((a, x) => a + x.backup, 0)} แถว · ${when(+new Date(v.at))}</p>${v.note ? `<p class="muted">${esc(v.note)}</p>` : ''}`; } catch (x) { toast(x.message, 'bad'); } e.target.disabled = false; };
    $('#bk').onclick = async e => { e.target.disabled = true; try { await api('/admin/backups', { method: 'POST' }); reload(); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; } };
  },
  async models(box, reload) {
    await editors('models', box, reload);
    const [s, ms] = await Promise.all([api('/admin/settings'), api('/admin/models')]);
    const vendors = [...new Map(ms.map(m => [vendorOf(m.name).toLowerCase(), vendorOf(m.name)])).values()];
    let icons = {}; try { icons = JSON.parse(s.model_icons || '{}') || {}; } catch { /* ค่าเสีย เริ่มใหม่ */ }
    const on = k => s[k] !== '0';
    const toIcon = file => new Promise((ok, no) => { // ย่อเป็น 96px แล้วเก็บเป็น data URL (CSP ให้โหลดรูปจากเว็บอื่นไม่ได้)
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const c = document.createElement('canvas'), z = 96; c.width = c.height = z; const r = Math.min(z / img.width, z / img.height); c.getContext('2d').drawImage(img, (z - img.width * r) / 2, (z - img.height * r) / 2, img.width * r, img.height * r); URL.revokeObjectURL(url); ok(c.toDataURL('image/png')); };
      img.onerror = () => no(new Error('อ่านรูปไม่ได้')); img.src = url;
    });
    const card = document.createElement('details'); card.className = 'ed'; card.open = true; card.style.marginBottom = '16px';
    const draw = () => {
      site.model_icons = JSON.stringify(icons); // ให้ vendorLogo() แสดงตัวอย่างตามที่แก้อยู่
      card.innerHTML = `<summary><b>${ic('palette')} หน้าเลือกโมเดล</b><span class="muted">โลโก้ค่าย ตัวกรอง และป้ายตัวคูณลิมิต</span></summary>
        <form id="pkf" class="ed-f">
          <label class="tg"><input type="checkbox" data-pk="picker_logos" ${on('picker_logos') ? 'checked' : ''}><span>แสดงโลโก้ค่าย</span></label>
          <label class="tg"><input type="checkbox" data-pk="picker_filter" ${on('picker_filter') ? 'checked' : ''}><span>แสดงปุ่มกรองตามค่ายด้านบน</span></label>
          <label class="tg"><input type="checkbox" data-pk="picker_mult" ${on('picker_mult') ? 'checked' : ''}><span>แสดงตัวคูณลิมิต (×1, ×5 ...)</span></label>
          <h3>โลโก้แต่ละค่าย</h3><p class="muted" style="margin:0 0 8px;font-size:13px">ค่ายดูจากคำแรกของชื่อโมเดล ถ้าไม่อัปโหลดจะใช้โลโก้ค่าเริ่มต้น (ค่ายที่ไม่มีโลโก้ในระบบ เช่น ChatGPT จะแสดงตัวอักษรแรก) รูปจะถูกย่อเป็น 96px</p>
          ${vendors.map(v => `<div class="row" style="align-items:center;gap:12px;padding:6px 0">${vendorLogo(v)}<b style="min-width:96px">${esc(v)}</b><label class="btn out sm" style="margin:0;cursor:pointer">อัปโหลด<input type="file" accept="image/*" data-up="${esc(v.toLowerCase())}" hidden></label>${icons[v.toLowerCase()] ? `<button type="button" class="btn out sm" data-rm="${esc(v.toLowerCase())}">Use default</button>` : '<span class="muted" style="font-size:12px">ค่าเริ่มต้น</span>'}</div>`).join('')}
          <div class="row" style="margin-top:12px"><button class="btn blue sm">Save</button><span class="ok sv"></span></div></form>`;
      card.querySelectorAll('[data-up]').forEach(i => i.onchange = async () => {
        const f = i.files[0]; if (!f) return;
        try { const u = await toIcon(f); if (u.length > 60000) throw new Error('รูปใหญ่เกินไป ใช้รูปที่เรียบง่ายกว่านี้'); icons[i.dataset.up] = u; draw(); } catch (x) { toast(x.message, 'bad'); }
      });
      card.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete icons[b.dataset.rm]; draw(); });
      card.querySelector('#pkf').onsubmit = async e => {
        e.preventDefault(); const body = { model_icons: JSON.stringify(icons) };
        card.querySelectorAll('[data-pk]').forEach(c => body[c.dataset.pk] = c.checked ? '1' : '0');
        try { await api('/admin/settings', { method: 'PUT', body }); card.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; Object.assign(site, body); } catch (x) { toast(x.message, 'bad'); }
      };
    };
    draw(); box.prepend(card);
    // ราคาทางการ (USD ต่อ 1M token) ไว้เทียบในหน้าราคา: ว่าง = ไม่เทียบโมเดลนั้น
    let off = {}; try { off = JSON.parse(s.official_prices || '{}') || {}; } catch { /* ค่าเสีย เริ่มใหม่ */ }
    const oc = document.createElement('details'); oc.className = 'ed'; oc.style.marginBottom = '16px';
    oc.innerHTML = `<summary><b>${ic('tag')} ราคาทางการ (เทียบในหน้าราคา)</b><span class="muted">ใส่ราคาของเจ้าของโมเดลเป็นดอลลาร์ต่อ 1M token ว่าง = ไม่เทียบ</span></summary>
      <form id="off" class="ed-f"><div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>Input $</th><th>Output $</th><th>Cache read $</th><th>Cache write $</th></tr>
      ${ms.map(m => `<tr><td>${esc(m.name)}</td>${['in', 'out', 'cache', 'write'].map(k => `<td><input type="number" step="any" min="0" data-m="${m.id}" data-k="${k === 'write' ? 'cache_write' : k}" value="${off[m.id]?.[k === 'write' ? 'cache_write' : k] ?? ''}" style="min-width:76px"></td>`).join('')}</tr>`).join('')}</table></div>
      <div class="row" style="margin-top:12px"><button class="btn blue sm">Save</button><span class="ok sv"></span></div></form>`;
    oc.querySelector('#off').onsubmit = async e => {
      e.preventDefault(); const out = {};
      oc.querySelectorAll('input[data-m]').forEach(i => { const v = parseFloat(i.value); if (v > 0) (out[i.dataset.m] ||= {})[i.dataset.k] = v; });
      try { await api('/admin/settings', { method: 'PUT', body: { official_prices: JSON.stringify(out) } }); oc.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; } catch (x) { toast(x.message, 'bad'); }
    };
    card.after(oc);
  },

  async settings(box) {
    const [s, plans, models] = await Promise.all([api('/admin/settings'), api('/admin/plans'), api('/admin/models')]);
    box.innerHTML = `<form class="panel form-p" id="f">
      <h2>การชำระเงิน</h2>
      <label>PromptPay (เบอร์โทรหรือเลขบัตรประชาชน)</label><input name="promptpay_id" value="${esc(s.promptpay_id)}">
      <div class="form2"><div><label>ธนาคาร (แสดงในหน้าชำระเงิน)</label><input name="bank_name" value="${esc(s.bank_name)}" placeholder="กสิกรไทย"></div><div><label>เลขบัญชี</label><input name="bank_account" value="${esc(s.bank_account)}" placeholder="193-1-13233-0"></div></div>
      <label>ชื่อบัญชี</label><input name="bank_holder" value="${esc(s.bank_holder)}" placeholder="นาย ณัฐภูมินทร์ จูบ้ง">
      <label>ตรวจสลิปอัตโนมัติ</label><select name="slip_provider" id="sp">${[['', 'ไม่ใช้ (แอดมินตรวจเอง)'], ['easyslip', 'EasySlip'], ['checkslip', 'CheckSlip'], ['slip2go', 'Slip2Go'], ['byshop', 'byshop']].map(([k, l]) => `<option value="${k}" ${(s.slip_provider || (s.slip_api_url ? 'byshop' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div data-sp="easyslip">
        <p class="muted">Secret Key (จากหน้า Application ใน EasySlip) ตั้งที่ Worker เป็น Secret ชื่อ <code>EASYSLIP_KEY</code> ${s.easyslip_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'}</p>
        <label>API URL (เว้นว่าง = v1 มาตรฐาน · EasySlip v2 ใช้ <code>https://api.easyslip.com/v2/verify/bank</code>)</label><input name="easyslip_url" value="${esc(s.easyslip_url)}" placeholder="https://developer.easyslip.com/api/v1/verify">
      </div>
      <div data-sp="checkslip">
        <p class="muted">API Key (ขึ้นต้น <code>csk_</code> จากเว็บ CheckSlip) ตั้งที่ Worker เป็น Secret ชื่อ <code>CHECKSLIP_KEY</code> ${s.checkslip_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'}</p>
        <label>API URL (เว้นว่าง = https://api.checkslip.com)</label><input name="checkslip_url" value="${esc(s.checkslip_url)}" placeholder="https://api.checkslip.com">
      </div>
      <div data-sp="easyslip checkslip">
        <label>เลขพร้อมเพย์/บัญชีผู้รับที่ต้องตรงกับสลิป (เว้นว่าง = ใช้ PromptPay ด้านบน)</label><input name="easyslip_receiver" value="${esc(s.easyslip_receiver)}" placeholder="0812345678">
        <label>ชื่อผู้รับที่อนุญาต (คั่นด้วยจุลภาค · ตรงชื่อใดชื่อหนึ่งก็ผ่าน · ใส่ชื่อต้นอย่างเดียวไว้สำรองได้ เพราะสลิปมักตัดนามสกุลเหลือตัวอักษรแรก)</label><input name="easyslip_receiver_names" value="${esc(s.easyslip_receiver_names)}" placeholder="ณัฐภูมินทร์ จูบ้ง, ณัฐภูมินทร์">
        <p class="muted">ระบบส่งสลิปให้ EasySlip/CheckSlip ตรวจ: สลิปซ้ำ, ยอดต้องตรงเป๊ะ, โอนไม่เกิน 15 นาที สลิปที่เคยสแกนแล้วใช้ซ้ำไม่ได้ และผู้รับต้องตรงชื่อที่อนุญาต (เลขบัญชีในสลิปถูกปิดบังบางหลัก ระบบเทียบเฉพาะหลักที่เห็นและต้องไม่ขัดแย้ง) · ตรวจไม่ได้หรือไม่พบสลิป = รอแอดมินตรวจเอง ไม่ปฏิเสธเอง</p>
      </div>
      <div data-sp="easyslip">
        <div class="row" style="margin-top:8px"><button type="button" class="btn out sm" id="est">Test connection</button><span id="esr" class="muted"></span></div>
      </div>
      <div data-sp="slip2go">
        <label>API URL ของ Slip2Go (ดูในหน้า API Connect หลังล็อกอิน Slip2Go)</label><input name="slip2go_url" value="${esc(s.slip2go_url)}" placeholder="https://...">
        <p class="muted">Secret Key ตั้งที่ Worker เป็น Secret ชื่อ <code>SLIP2GO_KEY</code> ${s.slip2go_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · ที่ Slip2Go ตั้ง IP Whitelist เป็น <code>*</code> (IP ของ Cloudflare เปลี่ยนได้)</p>
        <div class="form2"><div><label>ตรวจบัญชีผู้รับ: รหัสชนิดบัญชี (เว้นว่างได้)</label><input name="slip2go_receiver_type" value="${esc(s.slip2go_receiver_type)}" placeholder="เช่น 02001 = พร้อมเพย์เบอร์โทร, 01004 = กสิกร"></div>
          <div><label>เลขบัญชี/พร้อมเพย์ผู้รับ (เว้นว่าง = ไม่ตรวจ)</label><input name="slip2go_receiver_account" value="${esc(s.slip2go_receiver_account)}" placeholder="0812345678"></div></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn out sm" id="s2t">Test connection</button><span id="s2r" class="muted"></span></div>
        <p class="muted">ระบบส่งสลิปให้ Slip2Go ตรวจ: สลิปซ้ำ, ยอดต้องตรง และบัญชีผู้รับ (ถ้าใส่) · สลิปปลอม/ซ้ำ/ยอดไม่ตรง ปฏิเสธทันที</p>
      </div>
      <div data-sp="byshop">
        <label>URL API เช็กสลิป (byshop)</label><input name="slip_api_url" value="${esc(s.slip_api_url)}" placeholder="https://...">
        <label>ตำแหน่งยอดเงินในผลลัพธ์ JSON (เช่น data.amount)</label><input name="slip_amount_field" value="${esc(s.slip_amount_field)}">
        <p class="muted">API key: ${s.slip_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · ตั้งเป็น Secret ชื่อ <code>SLIP_API_KEY</code></p>
      </div>
      <label class="sw-row" data-sp="easyslip checkslip slip2go byshop"><span class="sw"><input type="checkbox" data-b="slip_auto_approve" ${s.slip_auto_approve !== '0' ? 'checked' : ''}><span></span></span> อนุมัติอัตโนมัติเมื่อสลิปผ่าน (ปิด = รอแอดมินกดเหมือนเดิม)</label>
      <h2 style="margin-top:28px">หน้าราคา <a href="/pricing" style="font-size:14px;font-weight:400">ดูหน้าราคา ›</a></h2>
      <label>Markup อัตโนมัติ (%) ใช้กับโมเดลที่ไม่ได้ตั้งราคาขายเอง</label><input name="price_markup" type="number" step="any" inputmode="decimal" value="${esc(s.price_markup || '0')}">
      <p class="muted">ตัวอย่าง: ทุน 1.00 บาท + markup 30% = ขาย 1.30 บาท ต่อ 1M token</p>
      <label>ข้อความใต้ตารางราคา (เว้นว่างได้)</label><textarea name="price_note" rows="3">${esc(s.price_note || '')}</textarea>
      <h2 style="margin-top:28px">หน้าแพลน</h2>
      <label>แพลนที่ติดป้าย "แนะนำ"</label><select name="featured_plan"><option value="">ไม่มี</option>${plans.map(p => `<option value="${p.id}" ${String(p.id) === s.featured_plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <h2 style="margin-top:28px">Wallet และชวนเพื่อน</h2>
      <label>เติมเงินขั้นต่ำ (บาท)</label><input name="topup_min" type="number" min="1" value="${esc(s.topup_min || '50')}">
      <label>เครดิตชวนเพื่อน (บาท ต่อคน ให้ทั้งคนชวนและคนถูกชวน เมื่อจ่ายเงินจริงครั้งแรก, 0 = ปิด)</label><input name="referral_bonus" type="number" min="0" step="any" value="${esc(s.referral_bonus || '0')}">
      <h2 style="margin-top:28px">ล็อกอิน</h2>
      <label>Firebase Web API key (เว้นว่าง = ค่าของโปรเจกต์ astra-892a8)</label><input name="fb_api_key" value="${esc(s.fb_api_key)}" placeholder="AIza...">
      <p class="muted">Worker คุยกับ Firebase เอง เบราว์เซอร์ผู้ใช้ไม่ต้องต่อ Google · Firebase Console ต้องเปิด Email/Password · ถ้าจำกัดคีย์ใน Google Cloud ให้อนุญาต <code>astracode.panderx.xyz/*</code></p>
      <label>Google OAuth Client ID (เว้นว่าง = ซ่อนปุ่ม Google)</label><input name="google_client_id" value="${esc(s.google_client_id)}" placeholder="xxxx.apps.googleusercontent.com">
      <label>Google OAuth Client Secret ${s.google_secret_set ? '<span class="ok">✓ ตั้งแล้ว (เว้นว่าง = ใช้ค่าเดิม)</span>' : ''}</label><input name="google_client_secret" type="password" autocomplete="off">
      <p class="muted">Google Cloud → APIs &amp; Services → Credentials → OAuth client (Web) → Authorized redirect URI: <code>${location.origin}/api/oauth/google/callback</code></p>
      <h2 style="margin-top:28px">ลดต้นทุน</h2>
      <p class="muted">"อัตโนมัติ" ในหน้าแชต: คำถามทั่วไปใช้โมเดลถูก คำถามยาก/โค้ด/รูป/ไฟล์ใช้โมเดลเก่ง (เลือกจากโมเดลในแพลนของผู้ใช้) · แชตยาวเกิน ~30,000 ตัวอักษร ระบบจะสรุปข้อความเก่าด้วยโมเดลถูก ไม่หักลิมิตผู้ใช้</p>
      <label>โมเดลถูกสำหรับคำถามทั่วไป (เว้นว่าง = ตัวคูณต่ำสุดในแพลน)</label><select name="auto_cheap_model"><option value="">อัตโนมัติ</option>${models.map(m => `<option value="${m.id}" ${String(m.id) === s.auto_cheap_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <label>โมเดลเก่งสำหรับคำถามยาก (เว้นว่าง = ตัวคูณสูงสุดในแพลน)</label><select name="auto_strong_model"><option value="">อัตโนมัติ</option>${models.map(m => `<option value="${m.id}" ${String(m.id) === s.auto_strong_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <label>โมเดลสำหรับย่อแชตยาว (เว้นว่าง = ตัวที่ต้นทุนต่ำสุด)</label><select name="summary_model"><option value="">อัตโนมัติ</option>${models.map(m => `<option value="${m.id}" ${String(m.id) === s.summary_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <h2 style="margin-top:28px">ฟีเจอร์ AI</h2>
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="search_enabled" ${s.search_enabled !== '0' ? 'checked' : ''}><span></span></span> ค้นเว็บ (ต้องตั้ง Secret <code>TAVILY_KEY</code> ${s.env.TAVILY_KEY ? '<span class="ok">✓</span>' : '<span class="warn">ยังไม่ตั้ง</span>'})</label>
      <label>Turnstile site key (กันบอทสมัคร/ล็อกอิน · ต้องตั้ง Secret <code>TURNSTILE_SECRET</code> ที่ Worker ด้วย ${s.env.TURNSTILE_SECRET ? '<span class="ok">✓</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · เว้นว่าง = ปิด)</label><input name="turnstile_site" value="${esc(s.turnstile_site)}" autocomplete="off">
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="health_check" ${s.health_check === '1' ? 'checked' : ''}><span></span></span> เช็กสุขภาพโมเดลทุกชั่วโมง (ยิงข้อความสั้นมากไปยังโมเดลที่ไม่มีคนใช้ · เสียโควตาน้อยมาก)</label>
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="search_auto" ${s.search_auto !== '0' ? 'checked' : ''}><span></span></span> ค้นเว็บเองเมื่อคำถามต้องใช้ข้อมูลล่าสุด (ข่าว ราคา อากาศ) โดยผู้ใช้ไม่ต้องกดเปิด · เสียโควตา Tavily</label>
      <label>โมเดลสำหรับเติมโค้ดอัตโนมัติ (เว้นว่าง = ตัวที่ถูกที่สุดในแพลน)</label><select name="autocomplete_model"><option value="">อัตโนมัติ</option>${models.map(m => `<option value="${m.id}" ${String(m.id) === s.autocomplete_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="image_enabled" ${s.image_enabled === '1' ? 'checked' : ''}><span></span></span> สร้างรูป (API แบบ OpenAI images)</label>
      <div class="form2"><div><label>Base URL</label><input name="image_base_url" value="${esc(s.image_base_url)}"></div><div><label>โมเดล</label><input name="image_model" value="${esc(s.image_model)}"></div>
        <div><label>ชื่อ Secret ของ key</label><input name="image_key_name" value="${esc(s.image_key_name)}"></div>
        <div><label>ต้นทุนต่อรูป (บาท, หักจากลิมิตและใช้ในสถิติ)</label><input name="image_cost" type="number" min="0" step="any" value="${esc(s.image_cost)}"></div></div>
      <h2 style="margin-top:28px">อีเมล</h2>
      <p class="muted">ใช้ Resend ตั้ง Secret <code>RESEND_KEY</code> ${s.env.RESEND_KEY ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} และยืนยันโดเมนผู้ส่งใน Resend</p>
      <label>ผู้ส่ง (เช่น AstraCode &lt;no-reply@panderx.xyz&gt;)</label><input name="mail_from" value="${esc(s.mail_from)}">
      <h2 style="margin-top:28px">ข้อมูลในใบเสร็จ</h2>
      <label>ชื่อร้าน / บริษัท</label><input name="business_name" value="${esc(s.business_name)}">
      <label>ที่อยู่</label><textarea name="business_address" rows="2">${esc(s.business_address)}</textarea>
      <label>เลขประจำตัวผู้เสียภาษี (ถ้ามี)</label><input name="business_tax_id" value="${esc(s.business_tax_id)}">
      <div class="row" style="margin-top:20px"><button class="btn blue">Save</button><span id="sv" class="ok"></span></div></form>`;
    const sp = () => box.querySelectorAll('[data-sp]').forEach(el => el.hidden = !el.dataset.sp.split(' ').includes($('#sp').value));
    $('#sp').onchange = sp; sp();
    $('#est').onclick = async () => {
      $('#esr').textContent = 'กำลังทดสอบ... (กดบันทึกก่อนถ้าเพิ่งแก้ค่า)';
      try { const r = await api('/admin/slip-test', { method: 'POST' }); $('#esr').innerHTML = r.ok ? `<span class="ok">✓ เชื่อมต่อได้</span> <code>${esc(JSON.stringify(r.data?.data ?? r.data)).slice(0, 300)}</code>` : `<span class="bad">✕ HTTP ${r.status ?? '?'} ${esc(r.data?.message || r.data?.error || '')}</span> <code>${esc(r.url || '')}</code>`; }
      catch (x) { $('#esr').innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    };
    $('#s2t').onclick = async () => {
      $('#s2r').textContent = 'กำลังทดสอบ... (กดบันทึกก่อนถ้าเพิ่งแก้ URL)';
      try { const r = await api('/admin/slip-test', { method: 'POST' }); $('#s2r').innerHTML = r.ok ? `<span class="ok">✓ เชื่อมต่อได้</span> <code>${esc(JSON.stringify(r.data?.data ?? r.data)).slice(0, 300)}</code>` : `<span class="bad">✕ ${esc(r.data?.message || 'เชื่อมต่อไม่ได้')}</span>`; }
      catch (x) { $('#s2r').innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    };
    $('#f').onsubmit = async e => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); e.target.querySelectorAll('[data-b]').forEach(c => body[c.dataset.b] = c.checked ? '1' : '0'); await api('/admin/settings', { method: 'PUT', body }); $('#sv').textContent = '✓ บันทึกแล้ว'; setTimeout(() => $('#sv').textContent = '', 2000); };
  },
};

// แพลน/โมเดล: แสดงเป็นรายการ กดเพื่อแก้ไข
async function editors(tab, box, reload, kind) {
  const rows = (await api('/admin/' + tab)).filter(r => !kind || (kind === 'team' ? r.seats > 1 : !(r.seats > 1))), models = tab === 'posts' ? [] : tab === 'models' ? rows : await api('/admin/models');
  const summary = r => tab === 'posts' ? `<b>${esc(r.title)}</b><span class="muted">/blog/${esc(r.slug)} · ${r.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'} · ${when(r.created_at)}</span>`
    : tab === 'plans'
    ? `<b>${esc(r.name)}</b><span class="muted">${r.price > 0 ? '฿' + baht(r.price) + '/เดือน' : 'ฟรี'} · ฿${+r.limit_week.toFixed(2)}/สัปดาห์ · ${r.use_4h === 0 ? 'ปิดรอบ 4 ชม.' : '฿' + +r.limit_4h.toFixed(2) + '/4 ชม.'} · ต้นทุนสูงสุด ฿${Math.round(r.limit_week * 4.33)}/เดือน${r.price > 0 ? ` (${Math.round(r.limit_week * 4.33 / r.price * 100)}% ของราคา)` : ''} · ${r.model_ids.length} โมเดล</span>${r.price > 0 && site.promo?.until > Date.now() ? `<span class="warn" style="display:block">ช่วงโปรตอนนี้ (ถึง ${new Date(site.promo.until).toLocaleDateString(LOC)}): ฿${+(r.limit_week * site.promo.xweek).toFixed(2)}/สัปดาห์ · ${r.use_4h === 0 ? 'ปิดรอบ 4 ชม.' : '฿' + +(r.limit_4h * site.promo.x4h).toFixed(2) + '/4 ชม.'} · ต้นทุนสูงสุด ฿${Math.round(r.limit_week * site.promo.xweek * 4.33)}/เดือน (${Math.round(r.limit_week * site.promo.xweek * 4.33 / r.price * 100)}% ของราคา) · ค่าในฟอร์มคือค่าปกติ ไม่ต้องแก้</span>` : ''}`
    : `<b>${esc(r.name)}</b><span class="muted">${esc(r.api_model)} · ×${r.multiplier}${r.cap_pct > 0 ? ` · เพดาน ${r.cap_pct}%` : ''}${r.use_mult != null && r.use_mult !== 1 ? ` · หักลิมิต ×${r.use_mult}` : ''}${r.promo_mult != null ? ` · โปรหัก ×${r.promo_mult}` : ''} · ${r.price_in != null ? `ขาย ${r.price_in}/${r.price_out ?? '-'}` : 'ราคาอัตโนมัติ'}${r.promo_pct > 0 ? ` · <span class="warn">โปร -${r.promo_pct}%${r.promo_end ? ' ถึง ' + new Date(r.promo_end).toLocaleDateString(LOC) : ''}</span>` : ''}${r.public ? '' : ' · ซ่อนจากหน้าราคา'} · ${r.has_key ? '<span class="ok">key พร้อม</span>' : '<span class="bad">ไม่พบ key</span>'}${r.vision ? ' · อ่านรูป' : ''}${r.effort !== 'none' ? ' · effort' : ''}</span>`;
  const form = (r = { active: 1, public: 1, use_4h: 1, model_ids: [], ...(kind === 'team' ? { seats: 5, shared_pool: 1 } : kind ? { seats: 1 } : {}) }) => `<form class="ed-f" data-id="${r.id || ''}"><div class="form2 ${tab === 'posts' ? 'one' : ''}">${FIELDS[tab].map(([k, l, t]) => `<div ${BILL_GROUP[k] ? `data-bill="${BILL_GROUP[k]}"` : ''}><label>${l}</label>${t === 'b' ? `<label class="sw"><input type="checkbox" name="${k}" ${r[k] ? 'checked' : ''}><span></span></label>`
      : Array.isArray(t) ? `<select name="${k}">${t.map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : t === 'm' ? `<select name="${k}"><option value="">ไม่มี</option>${models.filter(m => m.id !== r.id).map(m => `<option value="${m.id}" ${r[k] === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`
      : t === 't' ? `<textarea name="${k}" rows="12">${esc(r[k] ?? '')}</textarea>`
      : t === 'x' ? `<textarea name="${k}" rows="3" placeholder="เว้นว่างได้">${esc(r[k] ?? '')}</textarea>`
      : t === 'd' ? `<input type="date" name="${k}" value="${r[k] ? new Date(r[k] + 7 * 3600e3).toISOString().slice(0, 10) : ''}">`
      : `<input name="${k}" ${t === 'n' || t === 'o' ? 'type="number" step="any" inputmode="decimal"' : ''} ${t === 'n' ? 'data-n="1"' : ''} value="${esc(r[k] ?? '')}" ${t === 'o' ? `placeholder="${k.endsWith('_mult') ? '1' : 'อัตโนมัติ: ทุน + markup'}"` : t === 's' ? '' : 'required'}>`}</div>`).join('')}</div>
    ${tab === 'plans' ? `<label>โมเดลที่ใช้ได้</label><div class="chips-sel">${models.map(m => `<label><input type="checkbox" name="m" value="${m.id}" ${r.model_ids?.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)} ×${m.multiplier}</span></label>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn blue sm">Save</button>${r.id ? `<button type="button" class="btn red sm" data-del="${r.id}">Delete</button>` : ''}<span class="ok sv"></span></div></form>`;
  const health = tab === 'models' ? await api('/admin/model-health').catch(() => []) : [];
  const healthHTML = health.length ? `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 8px">สุขภาพโมเดล 24 ชม.</h3><div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>สำเร็จ</th><th>error</th><th>อัตรา error</th><th>เริ่มตอบ / จบ (เฉลี่ย)</th><th>ระบบเตรียม</th><th>error ล่าสุด</th></tr>${health.sort((a, b) => b.err / (b.ok + b.err) - a.err / (a.ok + a.err)).map(h => { const r = h.err / (h.ok + h.err); return `<tr><td>${esc(h.name)}${h.active ? '' : ' <small class="muted">(ปิด)</small>'}</td><td>${h.ok}</td><td>${h.err}</td><td style="color:${r > 0.2 ? 'var(--bad, #e5484d)' : r > 0.05 ? '#d9a400' : 'inherit'}"><b>${Math.round(r * 100)}%</b></td><td style="color:${h.ttft > 20000 ? '#d9a400' : 'inherit'}">${h.ttft ? (h.ttft / 1000).toFixed(1) + ' / ' + (h.ms / 1000).toFixed(1) + ' วิ' : '-'}</td><td>${h.prep ? h.prep + ' ms' : '-'}</td><td><small class="muted">${h.last_at ? when(h.last_at) + ' · ' : ''}${esc(h.last.slice(0, 120))}</small></td></tr>`; }).join('')}</table></div></div>` : '';
  box.innerHTML = healthHTML + `<p class="muted hint">${tab === 'posts' ? 'เขียนด้วย Markdown · บทความที่เผยแพร่จะขึ้นที่ /blog, หน้าแรก และ sitemap.xml <button type="button" class="btn out sm" id="seogen">สร้างหน้า SEO ทุกโมเดล</button>' : tab === 'plans'
    ? 'ลิมิตหักตามต้นทุนจริงของแต่ละข้อความ (ราคาทุนของโมเดล) แล้วแสดงเป็น % · งบเป็นบาท: รอบ 4 ชม. เริ่มนับตอนส่งข้อความแรก, รอบสัปดาห์เริ่มตอนใช้ครั้งแรกแล้วรีเซ็ตหลัง 7 วัน · ต้นทุนสูงสุด/เดือน = งบสัปดาห์ × 4.33 (กรณีผู้ใช้ใช้เต็มทุกสัปดาห์)'
    : 'key ใส่ที่ Worker → Settings → Variables and Secrets (Type: Secret) · Claude ใช้รูปแบบ anthropic ตัวอื่นใช้ openai'}${kind === 'team' ? ' · แพลนทีม: ราคาเป็นแพ็กเกจเดียวต่อทีม ตั้งจำนวนคน 2 ขึ้นไป · ติ๊ก "ใช้งบลิมิตร่วมกัน" = ทุกคนแบ่งงบเดียวกัน (หัวหน้าตั้งเพดานต่อคนได้) ไม่ติ๊ก = แต่ละคนได้โควตาเต็มของแพลน · คนซื้อกลายเป็นหัวหน้าทีมและเชิญสมาชิกเองที่หน้าบัญชี' : ''}</p>
    <div class="ed-list">${rows.map(r => `<details class="ed"><summary>${summary(r)}${r.active ? '' : '<span class="pill">ปิดอยู่</span>'}</summary>${form(r)}</details>`).join('')}
    <details class="ed add"><summary><b>+ เพิ่ม${{ plans: 'แพลน', models: 'โมเดล', posts: 'บทความ' }[tab]}</b></summary>${tab === 'models' ? `<label>เริ่มจากเทมเพลต</label><select class="preset"><option value="">— เลือกผู้ให้บริการ —</option>${Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('')}</select>` : ''}${form(tab === 'posts' ? { published: 0 } : undefined)}</details></div>`;
  box.querySelector('.preset')?.addEventListener('change', e => { // เติมค่าตามผู้ให้บริการ แก้ต่อได้
    const f = e.target.nextElementSibling, p = PRESETS[e.target.value]; if (!p) return;
    for (const [k, v] of Object.entries(p)) { const i = f.elements[k]; if (!i) continue; if (i.type === 'checkbox') i.checked = !!v; else i.value = v; }
  });
  box.querySelector('#seogen')?.addEventListener('click', async e => { e.target.disabled = true; try { const r = await api('/admin/seo-models', { method: 'POST' }); toast(`สร้าง/อัปเดต ${r.n} หน้าแล้ว (ขึ้น /blog และ sitemap)`, 'ok'); reload(); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; } });
  if (tab === 'models') box.querySelectorAll('form').forEach(f => { billApply(f); f.querySelector('[name=bill]').onchange = () => billApply(f); });
  box.querySelectorAll('form').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f), body = {};
    FIELDS[tab].forEach(([k, , t]) => body[k] = t === 'b' ? (fd.get(k) ? 1 : 0) : t === 'n' ? +fd.get(k) : t === 'o' || t === 'm' ? (fd.get(k) === '' ? null : +fd.get(k))
      : t === 'd' ? (fd.get(k) ? Date.parse(fd.get(k) + (k.endsWith('end') ? 'T23:59:59.999+07:00' : 'T00:00:00+07:00')) : null) : fd.get(k)); // วันที่ตามเวลาไทย
    if (tab === 'plans') body.model_ids = fd.getAll('m').map(Number);
    if (kind === 'team') body.seats = Math.max(2, body.seats || 2); else if (kind) { body.seats = 1; body.shared_pool = 0; } // แยกแพลนทีม/ส่วนตัวตามแท็บ
    try { await api(`/admin/${tab}${f.dataset.id ? '/' + f.dataset.id : ''}`, { method: f.dataset.id ? 'PUT' : 'POST', body }); if (f.dataset.id) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; setTimeout(reload, 700); } else reload(); }
    catch (x) { toast(x.message, 'bad'); }
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmSheet('ลบรายการนี้ถาวร?', { title: 'ยืนยันการลบ', ok: 'Delete forever', danger: true })) { await api(`/admin/${tab}/${b.dataset.del}`, { method: 'DELETE' }); reload(); } });
}

const RL_KIND = { grant: 'แจกสิทธิ์', use: 'ผู้ใช้กดใช้', direct: 'แอดมินรีเซ็ตให้' };
const resetLogTable = (rows, withUser = true) => rows.length ? `<table class="tbl"><tr><th>เมื่อ</th>${withUser ? '<th>ผู้ใช้</th>' : ''}<th>รายการ</th><th>ขอบเขต</th><th>หมายเหตุ</th></tr>${rows.map(r => `<tr><td>${when(r.created_at)}</td>${withUser ? `<td>${esc(r.email || '-')}</td>` : ''}<td>${RL_KIND[r.kind] || esc(r.kind)}${r.kind === 'grant' ? ' ×' + (r.n || 1) : ''}</td><td>${esc(r.scope || '-')}</td><td class="muted">${r.kind === 'grant' ? (r.expires_at ? 'หมดอายุ ' + when(r.expires_at) : 'ไม่หมดอายุ') + (r.by_email ? ' · โดย ' + esc(r.by_email) : '') : (r.by_email && r.kind === 'direct' ? 'โดย ' + esc(r.by_email) : '')}</td></tr>`).join('')}</table>` : '<p class="muted">ยังไม่มีประวัติ</p>';
// แผงรายละเอียดผู้ใช้ (เลื่อนออกมาจากขวา)
// รายละเอียดการใช้โมเดลหนึ่งตัว: ใครใช้ ใช้จากไหน และคำขอล่าสุด (กดแถวผู้ใช้เพื่อเปิดข้อมูลผู้ใช้)
async function modelUsageSheet(id, days) {
  let d; try { d = await api(`/admin/model-usage/${id}?days=${days}`); } catch (x) { return toast(x.message, 'bad'); }
  const src = k => ({ chat: 'แชต', api: 'API', agent: 'Agent', task: 'งานตั้งเวลา', line: 'LINE', image: 'รูป' })[k] || k;
  const tot = d.by_user.reduce((a, u) => ({ n: a.n + u.n, cost: a.cost + u.cost, charge: a.charge + u.charge }), { n: 0, cost: 0, charge: 0 });
  const m = d.model || {};
  sheet(esc(m.name || 'โมเดล'), `<p class="muted" style="margin:0 0 10px">${d.days} วัน · ${num(tot.n)} ครั้ง · ต้นทุน ฿${baht(tot.cost)} · เก็บจาก Wallet ฿${baht(tot.charge)}<br>ต้นทุน in/out ฿${m.cost_in}/${m.cost_out} ต่อ 1M · ราคาขาย ${m.price_in ?? 'อัตโนมัติ'}/${m.price_out ?? 'อัตโนมัติ'}${m.use_mult ? ` · หักลิมิต ×${m.use_mult}` : ''}</p>
    <h3>ผู้ใช้</h3><div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>ครั้ง</th><th>in/out/cache</th><th>ต้นทุน</th><th>Wallet</th></tr>${d.by_user.map(u => `<tr class="click" data-user="${u.id}"><td>${esc(u.email || '#' + u.id)}</td><td>${num(u.n)}</td><td>${compact(u.tin)}/${compact(u.tout)}/${compact(u.tc)}</td><td>฿${baht(u.cost)}</td><td>${u.charge ? '฿' + baht(u.charge) : '-'}</td></tr>`).join('')}</table></div>
    <h3>ที่มา</h3><div class="tw"><table class="tbl"><tr><th>ที่มา</th><th>ครั้ง</th><th>ต้นทุน</th><th>Wallet</th></tr>${d.by_src.map(x => `<tr><td>${esc(src(x.src))}</td><td>${num(x.n)}</td><td>฿${baht(x.cost)}</td><td>${x.charge ? '฿' + baht(x.charge) : '-'}</td></tr>`).join('')}</table></div>
    <h3>คำขอล่าสุด</h3><div class="tw"><table class="tbl"><tr><th>เวลา</th><th>ผู้ใช้</th><th>in/out/cache</th><th>ต้นทุน</th><th>เวลาตอบ</th></tr>${d.recent.map(x => `<tr class="click" data-user="${x.id}"><td>${when(x.t)}</td><td>${esc(x.email || '#' + x.id)}<br><span class="muted">${esc(src(x.src || '-'))}</span></td><td>${compact(x.tin)}/${compact(x.tout)}/${compact(x.tc)}</td><td>฿${baht(x.cost)}${x.charge ? `<br><span class="muted">เก็บ ฿${baht(x.charge)}</span>` : ''}</td><td>${x.ms ? (x.ms / 1000).toFixed(1) + ' วิ' : '-'}</td></tr>`).join('')}</table></div>`,
    (box, close) => box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => { close(); userDrawer(+r.dataset.user); }));
}
async function userDrawer(id, after) {
  const [u, plans, allModels, rlog] = await Promise.all([api('/admin/users/' + id), api('/admin/plans'), api('/admin/models'), api('/admin/reset-log?user_id=' + id).catch(() => [])]);
  const vendors = [...new Set(allModels.map(m => String(m.name).trim().split(/\s+/)[0]))];
  document.querySelector('.drawer')?.remove();
  const d = document.createElement('div'); d.className = 'drawer';
  const total = u.models.reduce((a, m) => a + m.cost, 0);
  d.innerHTML = `<div class="dr-shade"></div><aside class="dr-p" role="dialog" aria-label="ผู้ใช้ ${esc(u.email)}">
    <div class="dr-h"><span class="av lg">${esc(u.email[0].toUpperCase())}</span><div><b>${esc(u.email)}</b><div class="muted">สมัคร ${when(u.created_at)} · ${u.chats} แชต</div></div><span style="flex:1"></span><button class="btn out sm" id="dx">Close</button></div>
    <div class="kpis sm">
      <div class="kpi"><div class="muted">แพลน</div><div class="stat">${esc(u.current_plan)}</div><div class="kd muted">${u.plan_id && u.plan_expires > Date.now() ? 'ถึง ' + when(u.plan_expires) : 'ไม่มีวันหมด'}</div></div>
      ${u.usage.use4h === false ? '' : `<div class="kpi"><div class="muted">ลิมิต 4 ชม.</div><div class="stat">${u.usage.pct4h}%</div><div class="bar1"><div style="width:${u.usage.pct4h}%"></div></div></div>`}
      <div class="kpi"><div class="muted">ลิมิตสัปดาห์</div><div class="stat">${u.usage.pctWeek}%</div><div class="bar1"><div style="width:${u.usage.pctWeek}%"></div></div></div>
      <div class="kpi"><div class="muted">ต้นทุน 30 วัน</div><div class="stat">฿${baht(total)}</div></div>
    </div>
    <h3>ใช้โมเดลไหน (30 วัน)</h3>${u.models.length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ครั้ง</th><th>Input</th><th>Output</th><th>Cache</th><th>รวม</th><th>ต้นทุน</th></tr>${u.models.map(m => `<tr><td>${esc(m.name)}</td><td>${num(m.msgs)}</td><td title="${num(m.tin)}">${compact(m.tin)}</td><td title="${num(m.tout)}">${compact(m.tout)}</td><td title="${num(m.tc)}">${compact(m.tc)}</td><td>${compact(m.tok)}</td><td>฿${baht(m.cost)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}
    ${u.recent?.length ? `<h3>ใช้งานล่าสุด ${u.recent.length} ครั้ง</h3><p class="muted" style="margin:0 0 6px;font-size:12.5px">Cache = token ที่อ่านจากแคช (ราคาถูกกว่า Input) · ต้นทุน = ที่เราจ่ายผู้ให้บริการ</p><div class="tw"><table class="tbl"><tr><th>เวลา</th><th>ที่มา</th><th>โมเดล</th><th>Input</th><th>Output</th><th>Cache</th><th>ต้นทุน</th><th>หัก Wallet</th><th>ใช้เวลา</th></tr>${u.recent.map(x => `<tr><td style="white-space:nowrap">${when(x.created_at)}</td><td style="white-space:nowrap">${{ chat: 'แชต', api: 'API', agent: 'Agent', task: 'งานตั้งเวลา', complete: 'เติมโค้ด', image: 'สร้างรูป', system: 'ระบบ (ค้นเว็บ/ย่อแชต)' }[x.src] || '-'}</td><td>${esc(x.name)}</td><td>${num(x.tin)}</td><td>${num(x.tout)}</td><td>${num(x.tc)}</td><td>฿${(+x.cost).toFixed(4)}</td><td>${x.charge ? '฿' + (+x.charge).toFixed(4) : '-'}</td><td>${x.ms ? (x.ms / 1000).toFixed(1) + ' วิ' : '-'}</td></tr>`).join('')}</table></div>` : ''}
    <h3>Wallet ฿${baht(u.balance)}</h3>${u.wallet.length ? `<div class="tw"><table class="tbl">${u.wallet.map(t => `<tr><td>${when(t.created_at)}</td><td>${esc(t.kind)}${t.ref ? ' · ' + esc(t.ref) : ''}</td><td class="${t.amount < 0 ? 'bad' : 'ok'}">${t.amount < 0 ? '' : '+'}${baht(t.amount)}</td></tr>`).join('')}</table></div>` : ''}
    <div class="row" style="margin-top:8px"><input id="dcr" type="number" step="any" placeholder="เพิ่ม/ลด เช่น 50 หรือ -20" style="flex:1"><input id="dcn" placeholder="เหตุผล" style="flex:1"><button class="btn out sm" id="dcs">Adjust balance</button></div>
    <h3>การชำระเงิน</h3>${u.payments.length ? u.payments.map(p => `<div class="row" style="padding:6px 0">${STATUS[p.status]} ${esc(p.plan_name)} ฿${baht(p.amount)} <span class="muted">${when(p.created_at)}</span></div>`).join('') : '<p class="muted">ยังไม่เคยจ่าย</p>'}
    <h3>จัดการ</h3>
    <label>เปลี่ยนแพลน (30 วันนับจากวันนี้)</label><div class="row"><select id="dp" style="flex:1"><option value="">Free</option>${plans.filter(p => p.price > 0).map(p => `<option value="${p.id}" ${p.id === u.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn blue sm" id="dps">Choose plan</button></div>
    <label>รีเซ็ตลิมิต</label><div class="row"><select id="dscope" style="flex:1"><option value="all">ทั้งหมด (ทุกโมเดล)</option>${vendors.map(v => `<option value="v:${esc(v)}">ค่าย ${esc(v)} (ทุกโมเดลของค่ายนี้)</option>`).join('')}${allModels.map(m => `<option value="m:${m.id}">โมเดล ${esc(m.name)}</option>`).join('')}</select><button class="btn out sm" id="dr">Reset</button></div>
    <div class="row" style="margin-top:12px"><button class="btn out sm" id="dpw">Log out all devices</button><label class="row" style="gap:6px;margin-left:8px;font-size:13px"><input type="checkbox" id="dnorep" style="width:auto" ${u.no_report ? 'checked' : ''}> ไม่นับในรายงานรายได้/กำไร</label><button class="btn red sm" id="db">${u.banned ? 'Unban' : 'Ban'}</button>${u.email === me.email || me.role !== 'admin' ? '' : `<select id="drole" style="width:auto" aria-label="สิทธิ์">${[['user', 'ผู้ใช้ทั่วไป'], ['viewer', 'แอดมิน: ดูอย่างเดียว'], ['support', 'แอดมิน: ดูแลลูกค้า'], ['admin', 'แอดมินหลัก (ทุกอย่าง)']].map(([v, l]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>
    <h3>ประวัติรีเซ็ตลิมิต</h3><div class="tw">${resetLogTable(rlog, false)}</div>
    <p class="ok" id="dmsg"></p></aside>`;
  document.body.append(d);
  const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 200); after?.(); };
  d.querySelector('.dr-shade').onclick = close; d.querySelector('#dx').onclick = close;
  const put = async (body, msg) => { try { await api('/admin/users/' + id, { method: 'PUT', body }); d.querySelector('#dmsg').textContent = '✓ ' + msg; } catch (x) { toast(x.message, 'bad'); } };
  d.querySelector('#dps').onclick = () => put({ plan_id: +d.querySelector('#dp').value || null, days: 30 }, 'เปลี่ยนแพลนแล้ว');
  d.querySelector('#dr').onclick = async () => {
    const v = d.querySelector('#dscope').value, label = d.querySelector('#dscope').selectedOptions[0].textContent;
    const scope = v.startsWith('v:') ? { vendor: v.slice(2) } : v.startsWith('m:') ? { model_id: +v.slice(2) } : null;
    if (!await confirmSheet(`รีเซ็ตลิมิตของ ${u.email}: ${label}?`, { title: 'รีเซ็ตลิมิต', ok: 'Reset' })) return;
    put(scope ? { reset_usage: true, scope } : { reset_usage: true }, 'รีเซ็ตลิมิตแล้ว: ' + label);
  };
  d.querySelector('#dcs').onclick = async () => { const v = +d.querySelector('#dcr').value; if (!v || !await confirmSheet(`ปรับ Wallet ${v > 0 ? '+' : ''}${v} บาท?`, { title: 'ปรับยอด Wallet', ok: 'Confirm' })) return; await put({ credit: v, note: d.querySelector('#dcn').value }, 'ปรับยอดแล้ว'); setTimeout(() => userDrawer(id, after), 500); };
  d.querySelector('#dnorep').onchange = e => put({ no_report: e.target.checked }, e.target.checked ? 'ไม่นับบัญชีนี้ในรายงานแล้ว' : 'นับบัญชีนี้ในรายงาน');
  d.querySelector('#dpw').onclick = async () => { if (await confirmSheet('ให้ผู้ใช้นี้ออกจากระบบทุกเครื่อง?', { title: 'บังคับออกจากระบบ', ok: 'Confirm' })) put({ logout: 1 }, 'ออกจากระบบทุกเครื่องแล้ว'); };
  d.querySelector('#drole')?.addEventListener('change', async e => { const v = e.target.value, txt = { admin: 'เข้าหลังบ้านได้ทุกอย่าง (เงิน ผู้ใช้ ตั้งค่า)', support: 'ดูแลลูกค้า: อนุมัติสลิป ตอบติดต่อ ดูผู้ใช้', viewer: 'ดูข้อมูลหลังบ้านได้อย่างเดียว', user: 'ถอดสิทธิ์หลังบ้าน' }[v];
    if (await confirmSheet(`${u.email}: ${txt}?${v !== 'user' ? ' ต้องใช้รหัสหลังบ้านเดียวกับคุณ' : ''}`, { title: 'เปลี่ยนสิทธิ์', ok: 'Confirm', danger: v === 'admin' })) { await put({ role: v }, 'เปลี่ยนสิทธิ์แล้ว'); setTimeout(() => userDrawer(id, after), 600); } else e.target.value = u.role; });
  d.querySelector('#db').onclick = async () => { if (await confirmSheet(u.banned ? 'ปลดแบนผู้ใช้นี้?' : 'แบนผู้ใช้นี้? จะถูกออกจากระบบทันที', { title: 'จัดการบัญชี', ok: 'Confirm', danger: !u.banned })) { await put({ banned: u.banned ? 0 : 1 }, u.banned ? 'ปลดแบนแล้ว' : 'แบนแล้ว'); setTimeout(() => userDrawer(id, after), 600); } };
}

const cannedList = () => String(ADMIN._canned || '').split(/^---$/m).map(x => x.trim()).filter(Boolean).map(x => { const [t, ...b] = x.split('\n'); return { title: t.trim().slice(0, 40), body: b.join('\n').trim() || t.trim() }; });
ADMIN.roadmap = async (box, reload) => {
  const rows = await api('/admin/roadmap'), ST = [['idea', 'ไอเดีย'], ['planned', 'วางแผนแล้ว'], ['doing', 'กำลังทำ'], ['done', 'เสร็จแล้ว']];
  box.innerHTML = `<p class="muted hint">หัวข้อที่ผู้ใช้โหวตได้ในหน้า "มีอะไรใหม่" เรียงตามสถานะและจำนวนโหวต</p>
    <form id="rmf" class="card sheet-form"><input name="title" maxlength="120" placeholder="หัวข้อ เช่น แอป Android" required><input name="body" maxlength="1000" placeholder="รายละเอียดสั้นๆ (ไม่บังคับ)"><select name="status">${ST.map(([k, l]) => `<option value="${k}" ${k === 'planned' ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn blue sm">เพิ่ม</button></form>
    ${rows.map(r => `<div class="row" style="justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--hair)"><span style="min-width:0"><b>${esc(r.title)}</b> <span class="muted">${r.votes} โหวต</span></span><span class="row" style="gap:6px;flex:none"><select data-rs="${r.id}">${ST.map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn red sm" data-rd="${r.id}">ลบ</button></span></div>`).join('') || '<p class="empty-s">ยังไม่มีหัวข้อ</p>'}`;
  box.querySelector('#rmf').onsubmit = async e => { e.preventDefault(); await api('/admin/roadmap', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); reload(); };
  box.querySelectorAll('[data-rs]').forEach(s => s.onchange = async () => { await api('/admin/roadmap/' + s.dataset.rs, { method: 'PUT', body: { status: s.value } }); toast('บันทึกแล้ว', 'ok'); });
  box.querySelectorAll('[data-rd]').forEach(b => b.onclick = async () => { if (await confirmSheet('ลบหัวข้อนี้และโหวตทั้งหมด?', { title: 'ลบ', ok: 'ลบ', danger: true })) { await api('/admin/roadmap/' + b.dataset.rd, { method: 'DELETE' }); reload(); } });
};
ADMIN.fraud = async box => {
  const d = await api('/admin/fraud');
  box.innerHTML = `<p class="muted hint">60 วันล่าสุด · IP เดียวกันอาจเป็นครอบครัว ออฟฟิศ หรือเน็ตมือถือที่แชร์ IP ตรวจก่อนแบน</p>
    <div class="card"><b>หลายบัญชีจาก IP เดียว (3 บัญชีขึ้นไป)</b>${d.ips.length ? `<div class="tw"><table class="tbl"><tr><th>IP</th><th>บัญชี</th><th>อีเมล</th></tr>${d.ips.map(x => `<tr><td><code>${esc(x.ip)}</code></td><td>${x.n}</td><td style="min-width:240px">${x.emails.map(esc).join(', ')}</td></tr>`).join('')}</table></div>` : '<p class="muted">ไม่พบ</p>'}</div>
    <div class="card"><b>ชวนเพื่อนแต่ใช้ IP เดียวกัน (อาจชวนตัวเองเอาโบนัส/ค่าคอม)</b>${d.refs.length ? `<div class="tw"><table class="tbl"><tr><th>ผู้ถูกชวน</th><th>ผู้ชวน</th><th>ผู้ชวนได้ไปแล้ว</th></tr>${d.refs.map(x => `<tr data-user="${x.rid}" style="cursor:pointer"><td>${esc(x.email)}</td><td>${esc(x.referrer)}</td><td>฿${baht(x.paid)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ไม่พบ</p>'}</div>`;
  box.querySelectorAll('[data-user]').forEach(tr => tr.onclick = () => userDrawer(+tr.dataset.user));
};
ADMIN.churn = async box => {
  const rows = await api('/admin/churn');
  box.innerHTML = `<p class="muted hint">ผู้ใช้ที่แพลนหมดอายุใน 60 วันที่ผ่านมาแล้วไม่ต่อ · ใช้น้อยก่อนหมด = ไม่เห็นคุณค่า · ใช้เยอะแล้วหาย = อาจติดราคาหรือลิมิต</p>
    ${rows.length ? `<div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>หมดเมื่อ</th><th>จ่ายรวม</th><th>ข้อความ 30 วันก่อนหมด</th><th>ใช้ล่าสุด</th><th>โมเดลสุดท้าย</th></tr>${rows.map(r => `<tr class="click" data-user="${r.id}"><td>${esc(r.email)}</td><td>${esc(r.plan)}${r.plan_period === 'year' ? ' (ปี)' : ''}</td><td>${when(r.plan_expires)}</td><td>฿${baht(r.paid)}</td><td>${r.msgs_last30}</td><td>${r.last_use ? when(r.last_use) : 'ไม่เคยใช้'}</td><td>${esc(r.last_model || '-')}</td></tr>`).join('')}</table></div>` : '<p class="empty-s">ยังไม่มีคนเลิกใช้ใน 60 วัน</p>'}`;
  box.querySelectorAll('[data-user]').forEach(tr => tr.onclick = () => userDrawer(+tr.dataset.user));
};
ADMIN.teams = async (box, reload) => {
  const rows = await api('/admin/teams');
  box.innerHTML = `<p class="muted hint">จัดการทีมทั้งหมด แก้ไขจำนวนที่นั่ง โหมดงบรวม ต่ออายุ หรือยุบทีม</p>
    <div class="ed-list">${rows.map(t => `<details class="ed"><summary><b>${esc(t.name)}</b><span class="pill">${t.members_count}/${t.max_seats} คน</span><span class="muted">หัวหน้า: ${esc(t.owner_email)} · ${esc(t.plan_name || '-')} · ${t.shared_pool ? 'งบรวมทีม' : 'แยกโควตา'} · หมดอายุ ${when(t.expires)}</span></summary>
      <form class="ed-f" data-tid="${t.id}"><div class="form2">
        <div><label>ชื่อทีม</label><input name="name" value="${esc(t.name)}" required></div>
        <div><label>จำนวนคนสูงสุด (Seats)</label><input name="max_seats" type="number" min="1" value="${t.max_seats}" required></div>
        <div><label>ต่ออายุจากวันนี้ (วัน · 0 = ไม่เปลี่ยน)</label><input name="days" type="number" min="0" value="0"></div>
        <div><label class="sw-row"><span class="sw"><input type="checkbox" name="shared_pool" ${t.shared_pool ? 'checked' : ''}><span></span></span>ใช้งบรวมทั้งทีม</label></div>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn blue sm">Save</button><button type="button" class="btn red sm" data-tdel="${t.id}">Delete team</button><span class="ok sv"></span></div></form></details>`).join('') || '<p class="empty-s">ยังไม่มีทีม</p>'}</div>`;
  box.querySelectorAll('form[data-tid]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f);
    await api('/admin/teams/' + f.dataset.tid, { method: 'PUT', body: { name: fd.get('name'), max_seats: +fd.get('max_seats'), shared_pool: fd.get('shared_pool') ? 1 : 0, days: +fd.get('days') || 0 } });
    f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; setTimeout(reload, 700);
  });
  box.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => { if (await confirmSheet('ลบทีมนี้ถาวร?', { title: 'ลบทีม', ok: 'Delete forever', danger: true })) { await api('/admin/teams/' + b.dataset.tdel, { method: 'DELETE' }); reload(); } });
};

ADMIN.skills = async (box, reload) => {
  const rows = await api('/admin/skills');
  const form = (s = {}) => `<form class="ed-f" data-sid="${s.id || ''}">
    <div class="form2"><div><label>ชื่อ Skill</label><input name="name" value="${esc(s.name || '')}" maxlength="60" required></div>
    <div><label>คำอธิบาย</label><input name="description" value="${esc(s.description || '')}" maxlength="200"></div></div>
    <label>คำสั่ง (Instructions)</label><textarea name="content" rows="5" maxlength="6000" required>${esc(s.content || '')}</textarea>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="enabled" ${s.enabled !== 0 ? 'checked' : ''}><span></span></span>เปิดใช้งานสำหรับทุกคน</label>
    <div class="row" style="margin-top:12px"><button class="btn blue sm">${s.id ? 'Save' : 'Create Skill'}</button>${s.id ? `<button type="button" class="btn red sm" data-sdel="${s.id}">Delete</button>` : ''}<span class="ok sv"></span></div></form>`;
  box.innerHTML = `<p class="muted hint">Skill ส่วนกลางที่ผู้ใช้ทุกคนเปิดใช้ได้ในแชตและโหมด Code (ไม่กินโหลดเซิร์ฟเวอร์)</p>
    <div class="ed-list"><details class="ed add"><summary><b>+ เพิ่ม Skill ใหม่</b></summary>${form()}</details>
    ${rows.map(s => `<details class="ed"><summary><b>${esc(s.name)}</b><span class="pill ${s.enabled ? 'ok' : ''}">${s.enabled ? 'เปิด' : 'ปิด'}</span><span class="muted">${esc(s.description || s.content.slice(0, 80))}</span></summary>${form(s)}</details>`).join('')}</div>`;
  box.querySelectorAll('form[data-sid]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f), id = f.dataset.sid;
    await api('/admin/skills' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: { name: fd.get('name'), description: fd.get('description'), content: fd.get('content'), enabled: fd.get('enabled') ? 1 : 0 } });
    if (id) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; setTimeout(reload, 700); } else reload();
  });
  box.querySelectorAll('[data-sdel]').forEach(b => b.onclick = async () => {
    if (await confirmSheet('ลบ Skill นี้ถาวร?', { title: 'ลบ Skill', ok: 'Delete forever', danger: true })) { await api('/admin/skills/' + b.dataset.sdel, { method: 'DELETE' }); reload(); }
  });
};

ADMIN.mcp = async (box, reload) => {
  const rows = await api('/admin/mcp');
  const form = (m = {}) => `<form class="ed-f" data-mid="${m.id || ''}">
    <div class="form2"><div><label>ชื่อ</label><input name="name" value="${esc(m.name || '')}" maxlength="60" required></div>
    <div><label>URL (https://)</label><input name="url" type="url" value="${esc(m.url || '')}" required></div></div>
    <label>Bearer Token ${m.has_token ? '(เว้นว่าง = ใช้ค่าเดิม)' : '(ถ้ามี)'}</label><input name="token" type="password" autocomplete="off">
    <label class="sw-row"><span class="sw"><input type="checkbox" name="enabled" ${m.enabled !== 0 ? 'checked' : ''}><span></span></span>เปิดใช้งานสำหรับทุกคน</label>
    <div class="row" style="margin-top:12px"><button class="btn blue sm">${m.id ? 'Sync &amp; save' : 'Connect &amp; add MCP'}</button>${m.id ? `<button type="button" class="btn red sm" data-mdel="${m.id}">Delete</button>` : ''}<span class="ok sv"></span></div></form>`;
  box.innerHTML = `<p class="muted hint">Remote MCP ส่วนกลาง (Streamable HTTP) ให้ผู้ใช้ทุกคนเปิดใช้งานได้</p>
    <div class="ed-list"><details class="ed add"><summary><b>+ เพิ่ม Remote MCP ใหม่</b></summary>${form()}</details>
    ${rows.map(m => `<details class="ed"><summary><b>${esc(m.name)}</b><span class="pill ${m.enabled ? 'ok' : ''}">${m.enabled ? 'เปิด' : 'ปิด'}</span><span class="pill">${m.tools.length} tools</span><span class="muted">${esc(m.url)}</span></summary>${form(m)}</details>`).join('')}</div>`;
  box.querySelectorAll('form[data-mid]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f), id = f.dataset.mid, btn = f.querySelector('.btn.blue'); btn.disabled = true;
    try {
      await api('/admin/mcp' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: { name: fd.get('name'), url: fd.get('url'), token: fd.get('token'), enabled: fd.get('enabled') ? 1 : 0 } });
      if (id) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; setTimeout(reload, 700); } else reload();
    } catch (x) { toast(x.message, 'bad'); btn.disabled = false; }
  });
  box.querySelectorAll('[data-mdel]').forEach(b => b.onclick = async () => {
    if (await confirmSheet('ลบ MCP นี้ถาวร?', { title: 'ลบ MCP', ok: 'Delete forever', danger: true })) { await api('/admin/mcp/' + b.dataset.mdel, { method: 'DELETE' }); reload(); }
  });
};

// ปลั๊กอิน = ชุด Connectors (slug) + Skills + คำสั่งลัด · ผู้ใช้กดติดตั้งใน ตั้งค่า → Plugins
ADMIN.plugins = async (box, reload) => {
  const rows = await api('/admin/plugins'), J = v => JSON.stringify(v || [], null, 1);
  const form = (p = {}) => `<form class="ed-f" data-pslug="${esc(p.slug || '')}">
    <div class="form2"><div><label>slug</label><input name="slug" value="${esc(p.slug || '')}" ${p.slug ? 'readonly' : ''} required></div><div><label>ชื่อ</label><input name="name" value="${esc(p.name || '')}" required maxlength="60"></div></div>
    <label>คำอธิบาย</label><input name="description" value="${esc(p.description || '')}" maxlength="300">
    <div class="form2"><div><label>Connectors (slug คั่นด้วย ,)</label><input name="connectors" value="${esc((p.connectors || []).join(', '))}" placeholder="google, notion"></div><div><label>สี (#hex) · ลำดับ</label><div class="row"><input name="icon" value="${esc(p.icon || '#6b7280')}" style="flex:1"><input name="sort" type="number" value="${p.sort ?? 100}" style="width:90px"></div></div></div>
    <label>Skills (JSON: [{"name","description","content"}])</label><textarea name="skills" rows="4">${esc(J(p.skills))}</textarea>
    <label>คำสั่งลัด (JSON: [{"name","text"}])</label><textarea name="commands" rows="4">${esc(J(p.commands))}</textarea>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="enabled" ${p.enabled !== false ? 'checked' : ''}><span></span></span>แสดงให้ผู้ใช้</label>
    <div class="row" style="margin-top:12px"><button class="btn blue sm">${p.slug ? 'บันทึก' : 'เพิ่ม'}</button>${p.slug ? `<button type="button" class="btn red sm" data-pdel="${esc(p.slug)}">ลบ</button>` : ''}<span class="sv ok"></span></div></form>`;
  box.innerHTML = `<p class="muted hint">ผู้ใช้ติดตั้งปลั๊กอินได้ใน ตั้งค่า → Plugins: ได้ Skills + คำสั่งลัด (/) และถูกพาไปเชื่อม Connectors ที่ระบุ</p>
    <div class="ed-list"><details class="ed add"><summary><b>+ เพิ่ม Plugin</b></summary>${form()}</details>${rows.map(p => `<details class="ed"><summary><b>${esc(p.name)}</b><span class="pill ${p.enabled ? 'ok' : ''}">${p.enabled ? 'แสดง' : 'ซ่อน'}</span><span class="muted">${esc(p.connectors.join(', '))}</span></summary>${form(p)}</details>`).join('')}</div>`;
  box.querySelectorAll('form[data-pslug]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const o = Object.fromEntries(new FormData(f)), btn = f.querySelector('.btn.blue');
    let skills, commands; try { skills = JSON.parse(o.skills || '[]'); commands = JSON.parse(o.commands || '[]'); } catch { return toast('JSON ของ Skills / คำสั่งลัดไม่ถูกต้อง', 'bad'); }
    btn.disabled = true;
    try { await api('/admin/plugins', { method: 'POST', body: { ...o, connectors: o.connectors.split(',').map(x => x.trim()).filter(Boolean), skills, commands, sort: +o.sort || 100, enabled: !!o.enabled } }); if (f.dataset.pslug) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; btn.disabled = false; } else reload(); }
    catch (x) { toast(x.message, 'bad'); btn.disabled = false; }
  });
  box.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { if (await confirmSheet('ลบปลั๊กอินนี้? (ผู้ที่ติดตั้งแล้วยังมี Skills เดิม)', { title: 'ลบ Plugin', ok: 'Delete', danger: true })) { await api('/admin/plugins/' + b.dataset.pdel, { method: 'DELETE' }); reload(); } });
};
// สารบบ Connectors ที่ผู้ใช้เห็นใน ตั้งค่า → Connectors · ปุ่มทดสอบ = ลองค้นหน้าล็อกอิน (OAuth) / ต่อแบบไม่ล็อกอินจากเซิร์ฟเวอร์จริง
ADMIN.connectors = async (box, reload) => {
  const rows = await api('/admin/connectors');
  const AUTH = [['oauth', 'ล็อกอินในป๊อปอัป (MCP OAuth)'], ['none', 'ไม่ต้องล็อกอิน'], ['token', 'ผู้ใช้วาง API key'], ['url', 'ผู้ใช้วาง URL ส่วนตัว'], ['google', 'Google (ระบบเดิม)'], ['github', 'GitHub token (ระบบเดิม)']];
  const form = (c = {}) => `<form class="ed-f" data-cslug="${esc(c.slug || '')}">
    <div class="form2"><div><label>slug (a-z 0-9 -)</label><input name="slug" value="${esc(c.slug || '')}" ${c.slug ? 'readonly' : ''} required></div><div><label>ชื่อ</label><input name="name" value="${esc(c.name || '')}" maxlength="60" required></div></div>
    <label>คำอธิบาย (ผู้ใช้เห็น)</label><input name="description" value="${esc(c.description || '')}" maxlength="300">
    <div class="form2"><div><label>ชนิดการเชื่อม</label><select name="auth">${AUTH.map(([v, l]) => `<option value="${v}" ${c.auth === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label>URL ของ MCP (https://)</label><input name="url" value="${esc(c.url || '')}" placeholder="https://mcp.example.com/mcp"></div></div>
    <div class="form2"><div><label>หมวด</label><input name="category" value="${esc(c.category || '')}" maxlength="30"></div><div><label>โดย</label><input name="by" value="${esc(c.by || '')}" maxlength="40"></div></div>
    <div class="form2"><div><label>ไอคอน (#สี หรือ data:image/...)</label><input name="icon" value="${esc(c.icon || '#6b7280')}"></div><div><label>ลำดับ</label><input name="sort" type="number" value="${c.sort ?? 100}"></div></div>
    <details><summary class="muted">OAuth ขั้นสูง: ผู้ให้บริการที่ไม่ลงทะเบียนแอปอัตโนมัติ</summary><div class="form2"><div><label>Client ID</label><input name="client_id" value="${esc(c.client_id || '')}"></div><div><label>Client secret ${c.has_secret ? '(เว้นว่าง = ใช้ค่าเดิม)' : ''}</label><input name="client_secret" type="password" autocomplete="off"></div></div><label>Scope (ถ้าต้องระบุ)</label><input name="scope" value="${esc(c.scope || '')}"><p class="muted hint">Redirect URI ที่ต้องลงทะเบียน: ${esc(location.origin)}/api/connectors/callback</p></details>
    <label class="sw-row"><span class="sw"><input type="checkbox" name="enabled" ${c.enabled !== false ? 'checked' : ''}><span></span></span>แสดงให้ผู้ใช้</label>
    <div class="row" style="margin-top:12px"><button class="btn blue sm">${c.slug ? 'บันทึก' : 'เพิ่ม'}</button>${c.slug ? `<button type="button" class="btn out sm" data-ctest="${esc(c.slug)}">ทดสอบการเชื่อม</button><button type="button" class="btn red sm" data-cdel="${esc(c.slug)}">ลบ</button>` : ''}<span class="sv muted"></span></div></form>`;
  box.innerHTML = `<p class="muted hint">บริการที่ผู้ใช้กดเชื่อมได้ใน ตั้งค่า → Connectors · กด "ทดสอบการเชื่อม" เพื่อเช็คว่าผู้ให้บริการเปิดหน้าล็อกอินและลงทะเบียนแอปให้อัตโนมัติได้</p>
    <div class="ed-list"><details class="ed add"><summary><b>+ เพิ่ม Connector</b></summary>${form()}</details>
    ${rows.map(c => `<details class="ed"><summary><b>${esc(c.name)}</b><span class="pill ${c.enabled ? 'ok' : ''}">${c.enabled ? 'แสดง' : 'ซ่อน'}</span><span class="pill">${esc(AUTH.find(x => x[0] === c.auth)?.[1] || c.auth)}</span><span class="muted">${esc(c.url || '')}</span></summary>${form(c)}</details>`).join('')}</div>`;
  box.querySelectorAll('form[data-cslug]').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const o = Object.fromEntries(new FormData(f)), btn = f.querySelector('.btn.blue'); btn.disabled = true;
    try { await api('/admin/connectors', { method: 'POST', body: { ...o, sort: +o.sort || 100, enabled: !!o.enabled } }); if (f.dataset.cslug) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; btn.disabled = false; } else reload(); }
    catch (x) { toast(x.message, 'bad'); btn.disabled = false; }
  });
  box.querySelectorAll('[data-ctest]').forEach(b => b.onclick = async () => {
    const sv = b.parentElement.querySelector('.sv'); b.disabled = true; sv.textContent = 'กำลังทดสอบ…';
    try { const r = await api(`/admin/connectors/${b.dataset.ctest}/test`, { method: 'POST' }); sv.className = 'sv ' + (r.ok ? 'ok' : 'bad'); sv.textContent = (r.ok ? '✓ ' : '✗ ') + r.note; } catch (x) { sv.className = 'sv bad'; sv.textContent = x.message; }
    b.disabled = false;
  });
  box.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
    if (await confirmSheet('ลบ connector นี้จากสารบบ? (การเชื่อมที่ผู้ใช้มีอยู่ยังใช้ได้)', { title: 'ลบ Connector', ok: 'Delete', danger: true })) { await api('/admin/connectors/' + b.dataset.cdel, { method: 'DELETE' }); reload(); }
  });
};

// เตือนโมเดลที่ราคาขายต่ำกว่าต้นทุน (ขาดทุนทุกครั้งที่ใช้) บนแท็บโมเดล
async function lossBanner(box) {
  const bad = await api('/admin/margin').catch(() => []);
  if (bad.length) box.insertAdjacentHTML('afterbegin', `<div class="card" style="border-color:var(--red,#d33)"><b class="bad">${ic('alert', 'sm')} ราคาขายต่ำกว่าต้นทุน</b>${bad.map(x => `<div style="font-size:13px;margin-top:6px"><b>${esc(x.name)}</b>: ${x.parts.map(esc).join(', ')}</div>`).join('')}</div>`);
}
