// AstraCode: หลังบ้าน
PAGES.admin = () => adminView(qs().get('tab') || 'stats');

const FIELDS = {
  plans: [['name', 'ชื่อ'], ['price', 'ราคา (บาท/เดือน)', 'n'], ['price_year', 'ราคารายปี (เว้นว่าง = ไม่ขายรายปี)', 'o'], ['limit_4h', 'ลิมิต 4 ชม. (units)', 'n'], ['limit_week', 'ลิมิตสัปดาห์ (units)', 'n'], ['description', 'คำอธิบาย'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
  models: [['name', 'ชื่อที่แสดง'], ['provider', 'รูปแบบ API', ['openai', 'anthropic']], ['api_model', 'รหัสโมเดล'], ['base_url', 'Base URL'], ['key_name', 'ชื่อ secret ของ key'], ['multiplier', 'ตัวคูณ', 'n'],
    ['cost_in', 'ทุน input (บาท/1M)', 'n'], ['cost_out', 'ทุน output', 'n'], ['cost_cache', 'ทุน cache read', 'n'], ['cost_cache_write', 'ทุน cache write', 'n'],
    ['price_in', 'ราคาขาย input (บาท/1M)', 'o'], ['price_out', 'ราคาขาย output', 'o'], ['price_cache', 'ราคาขาย cache read', 'o'], ['price_cache_write', 'ราคาขาย cache write', 'o'],
    ['note', 'คำอธิบายในหน้าราคา', 's'], ['fallback_id', 'โมเดลสำรองเมื่อตัวนี้ล่ม', 'm'],
    ['effort', 'รองรับ effort', ['none', 'openai', 'anthropic', 'deepseek']], ['vision', 'อ่านรูปได้', 'b'], ['public', 'แสดงในหน้าราคา', 'b'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],
  posts: [['title', 'หัวข้อ'], ['slug', 'slug (a-z 0-9 -) ใช้ใน URL'], ['summary', 'สรุปสั้น (แสดงในรายการและ Google)', 's'], ['cover', 'รูปปก (path บนเว็บ เช่น /og.png)', 's'], ['body', 'เนื้อหา (Markdown)', 't'], ['published', 'เผยแพร่', 'b']],
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
const STATUS = { pending: '<span class="pill warn">● รออนุมัติ</span>', approved: '<span class="pill ok">✓ อนุมัติแล้ว</span>', rejected: '<span class="pill bad">✕ ปฏิเสธ</span>' };
const TABS = [['stats', '◔', 'ภาพรวม'], ['profit', '▲', 'กำไร'], ['payments', '฿', 'ชำระเงิน'], ['users', '◉', 'ผู้ใช้'], ['tickets', '✉', 'ติดต่อ'], ['plans', '▤', 'แพลน'], ['models', '✦', 'โมเดล'], ['coupons', '%', 'คูปอง'], ['posts', '✎', 'บล็อก'], ['system', '⛭', 'ระบบ'], ['settings', '⚙', 'ตั้งค่า']];
// สีชุดข้อมูล (ตรวจแล้วว่าแยกได้แม้ตาบอดสี บนพื้นเข้ม): น้ำเงิน, ส้ม, เขียวน้ำทะเล
const SERIES = ['#3987e5', '#d95926', '#199e70'];
const compact = n => { n = Number(n) || 0; const a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n * 100) / 100); };
const dayLabel = t => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const ago = t => { if (!t) return 'ไม่เคยใช้'; const m = (Date.now() - t) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' นาทีที่แล้ว' : m < 1440 ? Math.round(m / 60) + ' ชม.ที่แล้ว' : Math.round(m / 1440) + ' วันที่แล้ว'; };

async function adminView(tab = 'stats') {
  if (me?.role !== 'admin') return go('/');
  const [pending, open] = await Promise.all([api('/admin/payments').then(p => p.filter(x => x.status === 'pending').length).catch(() => 0), api('/admin/tickets').then(t => t.filter(x => x.status === 'open').length).catch(() => 0)]);
  page(nav() + `<div class="adm"><aside class="adm-nav">${TABS.map(([k, i, l]) => `<a class="${k === tab ? 'on' : ''}" href="/admin?tab=${k}"><span class="ai">${i}</span>${l}${k === 'payments' && pending ? `<b class="cnt">${pending}</b>` : ''}${k === 'tickets' && open ? `<b class="cnt">${open}</b>` : ''}</a>`).join('')}</aside>
    <main class="adm-main"><h1 class="adm-h">${TABS.find(t => t[0] === tab)?.[2] || ''}</h1><div id="ad"></div></main></div>`);
  const box = $('#ad'), reload = () => adminView(tab);
  try { await ADMIN[tab]?.(box, reload); } catch (x) { box.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
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
    const c = s.cur, p = s.prev, profit = c.rev - c.cost, margin = c.rev ? Math.round(profit / c.rev * 100) : null;
    const labels = s.daily.map(d => dayLabel(d.day));
    box.innerHTML = `<div class="seg" role="group" aria-label="ช่วงเวลา">${[7, 30, 90].map(d => `<button data-days="${d}" class="${d === days ? 'on' : ''}">${d} วัน</button>`).join('')}</div>
      ${s.pending ? `<a class="alert-row" href="/admin?tab=payments">● มีสลิปรออนุมัติ ${s.pending} รายการ <span>ตรวจเลย ›</span></a>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="muted">รายได้</div><div class="stat">฿${baht(c.rev)}</div><div class="kd">${delta(c.rev, p.rev)}</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API</div><div class="stat">฿${baht(c.cost)}</div><div class="kd">${delta(c.cost, p.cost, true)}</div></div>
        <div class="kpi"><div class="muted">กำไรขั้นต้น</div><div class="stat">฿${baht(profit)}</div><div class="kd">${margin == null ? '<span class="muted">ยังไม่มีรายได้</span>' : `<span class="muted">มาร์จิ้น</span> <b>${margin}%</b>`}</div></div>
        <div class="kpi"><div class="muted">ผู้ใช้ที่ใช้งาน</div><div class="stat">${num(c.au)}</div><div class="kd">${delta(c.au, p.au)}</div></div>
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
        ${s.models.length ? `<div class="hbars">${s.models.map(m => { const max = Math.max(...s.models.map(x => x.cost)) || 1; return `<div class="hb"><div class="hb-l"><b>${esc(m.name)}</b><span class="muted">${num(m.msgs)} ข้อความ · ${compact(m.tin + m.tout + m.tc)} token</span></div>
          <div class="hb-t"><div style="width:${Math.max(1, m.cost / max * 100)}%"></div></div><div class="hb-v">฿${baht(m.cost)}</div></div>`; }).join('')}</div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}</section>
      <section class="panel"><div class="ph"><h2>ผู้ใช้ที่ใช้มากที่สุด</h2><span class="muted">${days} วัน</span></div>
        ${s.top.length ? `<div class="tw"><table class="tbl"><tr><th>ผู้ใช้</th><th>แพลน</th><th>ข้อความ</th><th>Token</th><th>ต้นทุน</th></tr>${s.top.map(u => `<tr class="click" data-user="${u.id}"><td>${esc(u.email)}</td><td>${esc(u.plan || 'Free')}</td><td>${num(u.msgs)}</td><td>${compact(u.tok)}</td><td>฿${baht(u.cost)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}</section>`;
    box.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { localStorage.setItem('adm-days', b.dataset.days); ADMIN.stats(box); });
    box.querySelectorAll('[data-user]').forEach(r => r.onclick = () => userDrawer(+r.dataset.user));
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
      box.innerHTML = `<div class="seg">${[['pending', 'รออนุมัติ'], ['approved', 'อนุมัติแล้ว'], ['rejected', 'ปฏิเสธ'], ['all', 'ทั้งหมด']].map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l} ${k === 'all' ? ps.length : ps.filter(p => p.status === k).length}</button>`).join('')}</div>
        ${list.map(p => `<div class="card pay-card"><div class="row"><b>#${p.id}</b><span>${esc(p.email)}</span><span style="flex:1"></span>${STATUS[p.status]}</div>
          <div class="pay-grid"><div><div class="muted">แพลน</div>${esc(p.plan_name)}</div><div><div class="muted">ต้องจ่าย</div>฿${baht(p.amount)}</div><div><div class="muted">ส่งเมื่อ</div>${when(p.created_at)}</div>
          <div><div class="muted">ตรวจสลิป</div>${slipResult(p)}</div></div>
          ${p.slip_check ? `<details class="tview"><summary>ผลดิบจาก API</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(p.slip_check)}</pre></details>` : ''}
          <div class="row" style="margin-top:12px"><button class="btn out sm" data-slip="${p.id}">ดูสลิป</button>
          ${p.status === 'pending' ? `<button class="btn blue sm" data-act="approve" data-id="${p.id}">อนุมัติ</button><button class="btn red sm" data-act="reject" data-id="${p.id}">ปฏิเสธ</button>` : ''}</div>
          <div data-img="${p.id}"></div></div>`).join('') || '<div class="empty-s">ไม่มีรายการ</div>'}`;
      box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
      box.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => { const c = box.querySelector(`[data-img="${b.dataset.slip}"]`); c.innerHTML = c.innerHTML ? '' : `<img class="slipimg" style="margin-top:12px" src="/api/admin/slip/${b.dataset.slip}" alt="สลิป">`; });
      box.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        if (!confirm(b.dataset.act === 'approve' ? 'อนุมัติและเปิดแพลนให้ผู้ใช้?' : 'ปฏิเสธคำขอนี้?')) return;
        b.disabled = true;
        try { await api(`/admin/payments/${b.dataset.id}/${b.dataset.act}`, { method: 'POST' }); reload(); } catch (x) { alert(x.message); b.disabled = false; }
      });
    };
    draw();
  },

  async users(box) {
    box.innerHTML = `<div class="toolbar"><input id="q" placeholder="ค้นหาอีเมล" aria-label="ค้นหาอีเมล"></div><div id="ul"></div>`;
    const load = async () => {
      const us = await api('/admin/users?q=' + encodeURIComponent($('#q').value));
      $('#ul').innerHTML = us.map(u => `<button class="urow" data-user="${u.id}"><span class="av">${esc(u.email[0].toUpperCase())}</span>
        <span class="ue"><b>${esc(u.email)}</b><span class="muted">${u.role === 'admin' ? 'แอดมิน · ' : ''}${u.plan_id && u.plan_expires > Date.now() ? esc(u.plan_name) + ' ถึง ' + dayLabel(u.plan_expires) : 'Free'} · ใช้ล่าสุด ${ago(u.last_active)}</span></span>
        <span class="ut">${compact(u.tok30)}<small class="muted">token/30 วัน</small></span>${u.banned ? '<span class="pill bad">แบน</span>' : ''}<span class="chev">›</span></button>`).join('') || '<div class="empty-s">ไม่พบผู้ใช้</div>';
      $('#ul').querySelectorAll('[data-user]').forEach(b => b.onclick = () => userDrawer(+b.dataset.user, load));
    };
    let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 250); }; load();
  },

  async plans(box, reload) { return editors('plans', box, reload); },

  async profit(box) {
    const days = +(localStorage.getItem('adm-pdays') || 30), d = await api('/admin/profit?days=' + days), t = d.total, w = d.wallet;
    const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '-', cls = v => v < -0.005 ? 'bad' : v > 0.005 ? 'ok' : 'muted';
    box.innerHTML = `<div class="seg" role="group" aria-label="ช่วงเวลา">${[7, 30, 90, 365].map(x => `<button data-d="${x}" class="${x === days ? 'on' : ''}">${x} วัน</button>`).join('')}</div>
      <div class="kpis">
        <div class="kpi"><div class="muted">รายได้</div><div class="stat">฿${baht(t.rev)}</div><div class="kd muted">แพลน + ค่าใช้ Wallet</div></div>
        <div class="kpi"><div class="muted">ต้นทุน API</div><div class="stat">฿${baht(t.cost)}</div></div>
        <div class="kpi"><div class="muted">กำไรขั้นต้น</div><div class="stat ${cls(t.profit)}">฿${baht(t.profit)}</div><div class="kd muted">มาร์จิ้น ${pct(t.profit, t.rev)}</div></div>
        <div class="kpi"><div class="muted">ผู้ใช้ที่ขาดทุน</div><div class="stat ${d.losers ? 'bad' : ''}">${num(d.losers)}</div><div class="kd muted">ต้นทุนเกินเงินที่จ่าย</div></div>
      </div>
      <section class="panel"><div class="ph"><h2>แยกตามแพลน</h2><span class="muted">${days} วัน</span></div>
        <div class="tw"><table class="tbl"><tr><th>แพลน</th><th>สมาชิกตอนนี้</th><th>รายได้</th><th>ต้นทุน</th><th>กำไร</th><th>ต้นทุน/คน</th></tr>
        ${d.plans.map(p => `<tr><td>${esc(p.name)} <span class="muted">${p.price ? '฿' + baht(p.price) : 'ฟรี'}</span></td><td>${num(p.subs)}</td><td>฿${baht(p.rev)}</td><td>฿${baht(p.cost)}</td><td class="${cls(p.rev - p.cost)}">฿${baht(p.rev - p.cost)}</td><td>${p.subs ? '฿' + baht(p.cost / p.subs) : '-'}${p.price && p.subs && p.cost / p.subs > p.price * days / 30 ? ' <span class="bad">เกินค่าแพลน</span>' : ''}</td></tr>`).join('')}</table></div>
        <p class="muted">ต้นทุนนับตามแพลนปัจจุบันของผู้ใช้ · แพลนฟรีไม่มีรายได้ ต้นทุนคือค่าโปรโมต</p></section>
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
      <div class="row" style="margin-top:16px"><button class="btn blue sm">บันทึก</button>${c.code ? `<button type="button" class="btn red sm" data-del="${esc(c.code)}">ลบ</button>` : ''}</div></form>`;
    box.innerHTML = `<p class="muted hint">ลด % / ลดบาท ใช้ตอนซื้อแพลน · เครดิต Wallet ผู้ใช้กรอกที่หน้าบัญชี · คนหนึ่งใช้โค้ดเดิมได้ครั้งเดียว</p>
      <div class="ed-list">${cs.map(c => `<details class="ed"><summary><b>${esc(c.code)}</b><span class="muted">${KIND[c.kind]} ${c.kind === 'percent' ? c.value + '%' : '฿' + baht(c.value)} · ใช้แล้ว ${c.used}${c.max_uses ? '/' + c.max_uses : ''}${c.expires ? ' · หมด ' + dayLabel(c.expires) : ''}${c.note ? ' · ' + esc(c.note) : ''}</span>${c.active ? '' : '<span class="pill">ปิดอยู่</span>'}</summary>${form(c)}</details>`).join('')}
      <details class="ed add"><summary><b>+ สร้างคูปอง</b></summary>${form()}</details></div>`;
    box.querySelectorAll('.cpf').forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const b = Object.fromEntries(new FormData(f));
      b.active = b.active ? 1 : 0; b.expires = b.expires ? new Date(b.expires + 'T23:59:59+07:00').getTime() : null;
      try { await api('/admin/coupons', { method: 'POST', body: b }); reload(); } catch (x) { alert(x.message); }
    });
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('ลบคูปองนี้?')) { await api('/admin/coupons', { method: 'DELETE', body: { code: b.dataset.del } }); reload(); } });
  },

  async tickets(box) {
    const id = qs().get('id');
    if (id) {
      const t = await api('/admin/tickets/' + id);
      box.innerHTML = `<p><a href="/admin?tab=tickets">← ทั้งหมด</a></p><div class="panel"><div class="ph"><h2>${esc(t.subject)}</h2><span class="muted">${esc(t.email)}</span></div>
        <div class="thread">${t.msgs.map(m => `<div class="tmsg ${m.admin ? '' : 'adm'}"><div class="muted" style="font-size:12px">${m.admin ? 'แอดมิน' : esc(t.email)} · ${when(m.created_at)}</div><div>${esc(m.body).replace(/\n/g, '<br>')}</div></div>`).join('')}</div>
        <form id="tr"><textarea name="body" rows="4" placeholder="ตอบกลับ (ส่งอีเมลแจ้งผู้ใช้ด้วย ถ้าเปิดระบบอีเมล)"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn blue sm">ส่งคำตอบ</button><button type="button" class="btn out sm" id="tclose">${t.status === 'closed' ? 'ปิดแล้ว' : 'ปิดเรื่อง'}</button><button type="button" class="btn out sm" data-user="${t.user_id}">ดูผู้ใช้</button></div></form></div>`;
      $('#tr').onsubmit = async e => { e.preventDefault(); await api('/admin/tickets/' + id, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); ADMIN.tickets(box); };
      $('#tclose').onclick = async () => { await api('/admin/tickets/' + id, { method: 'POST', body: { status: 'closed' } }); go('/admin?tab=tickets'); };
      box.querySelector('[data-user]').onclick = () => userDrawer(t.user_id);
      return;
    }
    const ts = await api('/admin/tickets');
    const TS = { open: '<span class="pill warn">● รอตอบ</span>', answered: '<span class="pill ok">ตอบแล้ว</span>', closed: '<span class="pill">ปิด</span>' };
    box.innerHTML = ts.map(t => `<a class="urow" href="/admin?tab=tickets&id=${t.id}"><span class="ue"><b>${esc(t.subject)}</b><span class="muted">${esc(t.email)} · ${t.n} ข้อความ · ${ago(t.updated_at)}</span></span>${TS[t.status] || ''}<span class="chev">›</span></a>`).join('') || '<div class="empty-s">ยังไม่มีเรื่อง</div>';
  },

  async system(box, reload) {
    const [s, backups, events, logs] = await Promise.all([api('/admin/settings'), api('/admin/backups').catch(x => ({ error: x.message })), api('/admin/events'), api('/admin/audit')]);
    const save = async (body, el) => { await api('/admin/settings', { method: 'PUT', body }); el.textContent = '✓ บันทึกแล้ว'; setTimeout(() => el.textContent = '', 2000); };
    box.innerHTML = `<form class="panel form-p" id="mf"><h2>โหมดปิดปรับปรุง</h2>
      <label class="sw-row"><span class="sw"><input type="checkbox" name="maintenance" ${s.maintenance === '1' ? 'checked' : ''}><span></span></span> ปิดเว็บชั่วคราว (แอดมินยังใช้ได้ หน้าแรก/สถานะ/บล็อกยังเปิด)</label>
      <h2 style="margin-top:24px">ประกาศ</h2><label>ข้อความ (เว้นว่าง = ไม่แสดง) ใส่ลิงก์แบบ [ข้อความ](https://...) ได้</label><textarea name="announcement" rows="2">${esc(s.announcement)}</textarea>
      <label>ระดับ</label><select name="announcement_level">${[['info', 'ทั่วไป'], ['warn', 'เตือน'], ['critical', 'สำคัญมาก']].map(([k, l]) => `<option value="${k}" ${s.announcement_level === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="row" style="margin-top:16px"><button class="btn blue">บันทึก</button><span class="ok" id="ms"></span></div></form>

      <form class="panel form-p" id="af"><h2>แจ้งเตือนแอดมิน</h2><p class="muted">แจ้งเมื่อมีสลิปใหม่ เรื่องติดต่อใหม่ โมเดลล่ม และต้นทุนเกินกำหนด</p>
      <label>Discord webhook URL</label><input name="alert_discord" value="${esc(s.alert_discord)}" placeholder="https://discord.com/api/webhooks/...">
      <label>LINE: User ID หรือ Group ID ที่จะส่งถึง</label><input name="alert_line_to" value="${esc(s.alert_line_to)}" placeholder="U1234...">
      <p class="muted">LINE ใช้ Messaging API (LINE Notify ปิดบริการแล้ว) ตั้ง Secret <code>LINE_ALERT_TOKEN</code> = Channel access token ${s.env.LINE_ALERT_TOKEN ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'}</p>
      <label>แจ้งเมื่อต้นทุน API ต่อวันเกิน (บาท, 0 = ปิด)</label><input name="cost_alert_daily" type="number" min="0" step="any" value="${esc(s.cost_alert_daily || '0')}">
      <div class="row" style="margin-top:16px"><button class="btn blue">บันทึก</button><button type="button" class="btn out" id="atest">ทดสอบส่ง</button><span class="ok" id="as"></span></div></form>

      <section class="panel"><div class="ph"><h2>สำรองข้อมูล (R2)</h2><button class="btn out sm" id="bk">สำรองตอนนี้</button></div>
        <p class="muted">ระบบสำรองอัตโนมัติทุกวันตี 3 (ต้องตั้ง Cron Trigger) เก็บ 14 ชุดล่าสุด</p>
        ${backups.error ? `<p class="warn">${esc(backups.error)}</p>` : backups.length ? backups.map(b => `<div class="row" style="padding:6px 0;border-top:1px solid var(--steel)"><span>${when(b.at)}</span><span class="muted">${compact(b.size)}B</span><span style="flex:1"></span><a href="/api/admin/backups/${esc(b.key)}" download>ดาวน์โหลด</a></div>`).join('') : '<p class="muted">ยังไม่มีไฟล์สำรอง</p>'}</section>

      <section class="panel"><div class="ph"><h2>ความพร้อมของระบบ</h2></div><div class="envs">
        ${[['RESEND_KEY', 'อีเมล (Resend)'], ['TAVILY_KEY', 'ค้นเว็บ (Tavily)'], ['SECRET_KEY', 'เข้ารหัส token GitHub / 2FA'], ['GOOGLE_CLIENT_ID', 'ล็อกอิน Google'], ['LINE_CHANNEL_ID', 'ล็อกอิน LINE'], ['LINE_ALERT_TOKEN', 'แจ้งเตือน LINE'], ['PUBLIC_URL', 'โดเมนหลักสำหรับลิงก์ในอีเมล']].map(([k, l]) => `<div>${s.env[k] ? '<span class="ok">✓</span>' : '<span class="muted">○</span>'} ${l} <code>${k}</code></div>`).join('')}
        <div>${s.r2 ? '<span class="ok">✓</span>' : '<span class="muted">○</span>'} R2 (สลิป รูป และไฟล์สำรอง) <code>SLIPS</code></div></div></section>

      <section class="panel"><div class="ph"><h2>เหตุการณ์ล่าสุด</h2><a href="/status">หน้าสถานะ ›</a></div>
        ${events.length ? `<div class="tw"><table class="tbl"><tr><th>เวลา</th><th>ชนิด</th><th>โมเดล</th><th>รายละเอียด</th></tr>${events.slice(0, 50).map(e => `<tr><td>${when(e.created_at)}</td><td>${e.kind === 'error' ? '<span class="bad">error</span>' : esc(e.kind)}</td><td>${esc(e.model || '-')}</td><td class="muted">${esc(e.detail)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ไม่มีเหตุการณ์</p>'}</section>

      <section class="panel"><div class="ph"><h2>บันทึกการกระทำของแอดมิน</h2></div>
        ${logs.length ? `<div class="tw"><table class="tbl"><tr><th>เวลา</th><th>แอดมิน</th><th>การกระทำ</th><th>รายละเอียด</th></tr>${logs.slice(0, 100).map(a => `<tr><td>${when(a.created_at)}</td><td>${esc(a.admin_email)}</td><td>${esc(a.action)}</td><td class="muted"><code>${esc(a.detail)}</code></td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีบันทึก</p>'}</section>`;
    $('#mf').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); save({ maintenance: fd.get('maintenance') ? '1' : '0', announcement: fd.get('announcement'), announcement_level: fd.get('announcement_level') }, $('#ms')); };
    $('#af').onsubmit = e => { e.preventDefault(); save(Object.fromEntries(new FormData(e.target)), $('#as')); };
    $('#atest').onclick = async () => { try { await api('/admin/notify-test', { method: 'POST' }); $('#as').textContent = '✓ ส่งแล้ว ตรวจใน Discord/LINE'; } catch (x) { alert(x.message); } };
    $('#bk').onclick = async e => { e.target.disabled = true; try { await api('/admin/backups', { method: 'POST' }); reload(); } catch (x) { alert(x.message); e.target.disabled = false; } };
  },
  async models(box, reload) { return editors('models', box, reload); },

  async settings(box) {
    const [s, plans, models] = await Promise.all([api('/admin/settings'), api('/admin/plans'), api('/admin/models')]);
    box.innerHTML = `<form class="panel form-p" id="f">
      <h2>การชำระเงิน</h2>
      <label>PromptPay (เบอร์โทรหรือเลขบัตรประชาชน)</label><input name="promptpay_id" value="${esc(s.promptpay_id)}">
      <label>ตรวจสลิปอัตโนมัติ</label><select name="slip_provider" id="sp">${[['', 'ไม่ใช้ (แอดมินตรวจเอง)'], ['slip2go', 'Slip2Go'], ['byshop', 'byshop']].map(([k, l]) => `<option value="${k}" ${(s.slip_provider || (s.slip_api_url ? 'byshop' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div data-sp="slip2go">
        <label>API URL ของ Slip2Go (ดูในหน้า API Connect หลังล็อกอิน Slip2Go)</label><input name="slip2go_url" value="${esc(s.slip2go_url)}" placeholder="https://...">
        <p class="muted">Secret Key ตั้งที่ Worker เป็น Secret ชื่อ <code>SLIP2GO_KEY</code> ${s.slip2go_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · ที่ Slip2Go ตั้ง IP Whitelist เป็น <code>*</code> (IP ของ Cloudflare เปลี่ยนได้)</p>
        <div class="form2"><div><label>ตรวจบัญชีผู้รับ: รหัสชนิดบัญชี (เว้นว่างได้)</label><input name="slip2go_receiver_type" value="${esc(s.slip2go_receiver_type)}" placeholder="เช่น 02001 = พร้อมเพย์เบอร์โทร, 01004 = กสิกร"></div>
          <div><label>เลขบัญชี/พร้อมเพย์ผู้รับ (เว้นว่าง = ไม่ตรวจ)</label><input name="slip2go_receiver_account" value="${esc(s.slip2go_receiver_account)}" placeholder="0812345678"></div></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn out sm" id="s2t">ทดสอบการเชื่อมต่อ</button><span id="s2r" class="muted"></span></div>
        <p class="muted">ระบบส่งสลิปให้ Slip2Go ตรวจ: สลิปซ้ำ, ยอดต้องตรง และบัญชีผู้รับ (ถ้าใส่) · สลิปปลอม/ซ้ำ/ยอดไม่ตรง ปฏิเสธทันที</p>
      </div>
      <div data-sp="byshop">
        <label>URL API เช็กสลิป (byshop)</label><input name="slip_api_url" value="${esc(s.slip_api_url)}" placeholder="https://...">
        <label>ตำแหน่งยอดเงินในผลลัพธ์ JSON (เช่น data.amount)</label><input name="slip_amount_field" value="${esc(s.slip_amount_field)}">
        <p class="muted">API key: ${s.slip_key_set ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} · ตั้งเป็น Secret ชื่อ <code>SLIP_API_KEY</code></p>
      </div>
      <label class="sw-row" data-sp="slip2go byshop"><span class="sw"><input type="checkbox" data-b="slip_auto_approve" ${s.slip_auto_approve !== '0' ? 'checked' : ''}><span></span></span> อนุมัติอัตโนมัติเมื่อสลิปผ่าน (ปิด = รอแอดมินกดเหมือนเดิม)</label>
      <h2 style="margin-top:28px">หน้าราคา <a href="/pricing" style="font-size:14px;font-weight:400">ดูหน้าราคา ›</a></h2>
      <label>Markup อัตโนมัติ (%) ใช้กับโมเดลที่ไม่ได้ตั้งราคาขายเอง</label><input name="price_markup" type="number" step="any" inputmode="decimal" value="${esc(s.price_markup || '0')}">
      <p class="muted">ตัวอย่าง: ทุน 1.00 บาท + markup 30% = ขาย 1.30 บาท ต่อ 1M token</p>
      <label>ข้อความใต้ตารางราคา (เว้นว่างได้)</label><textarea name="price_note" rows="3">${esc(s.price_note || '')}</textarea>
      <h2 style="margin-top:28px">หน้าแพลน</h2>
      <label>แพลนที่ติดป้าย "แนะนำ"</label><select name="featured_plan"><option value="">ไม่มี</option>${plans.map(p => `<option value="${p.id}" ${String(p.id) === s.featured_plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <h2 style="margin-top:28px">Wallet และชวนเพื่อน</h2>
      <label>เติมเงินขั้นต่ำ (บาท)</label><input name="topup_min" type="number" min="1" value="${esc(s.topup_min || '50')}">
      <label>เครดิตชวนเพื่อน (บาท ต่อคน ให้ทั้งคนชวนและคนถูกชวน เมื่อจ่ายเงินจริงครั้งแรก, 0 = ปิด)</label><input name="referral_bonus" type="number" min="0" step="any" value="${esc(s.referral_bonus || '0')}">
      <h2 style="margin-top:28px">ฟีเจอร์ AI</h2>
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="search_enabled" ${s.search_enabled !== '0' ? 'checked' : ''}><span></span></span> ค้นเว็บ (ต้องตั้ง Secret <code>TAVILY_KEY</code> ${s.env.TAVILY_KEY ? '<span class="ok">✓</span>' : '<span class="warn">ยังไม่ตั้ง</span>'})</label>
      <label>โมเดลสำหรับเติมโค้ดอัตโนมัติ (เว้นว่าง = ตัวที่ถูกที่สุดในแพลน)</label><select name="autocomplete_model"><option value="">อัตโนมัติ</option>${models.map(m => `<option value="${m.id}" ${String(m.id) === s.autocomplete_model ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <label class="sw-row"><span class="sw"><input type="checkbox" data-b="image_enabled" ${s.image_enabled === '1' ? 'checked' : ''}><span></span></span> สร้างรูป (API แบบ OpenAI images)</label>
      <div class="form2"><div><label>Base URL</label><input name="image_base_url" value="${esc(s.image_base_url)}"></div><div><label>โมเดล</label><input name="image_model" value="${esc(s.image_model)}"></div>
        <div><label>ชื่อ Secret ของ key</label><input name="image_key_name" value="${esc(s.image_key_name)}"></div><div><label>ใช้ลิมิตต่อรูป (units)</label><input name="image_units" type="number" min="0" value="${esc(s.image_units)}"></div>
        <div><label>ต้นทุนต่อรูป (บาท, ใช้ในสถิติ)</label><input name="image_cost" type="number" min="0" step="any" value="${esc(s.image_cost)}"></div></div>
      <h2 style="margin-top:28px">อีเมล</h2>
      <p class="muted">ใช้ Resend ตั้ง Secret <code>RESEND_KEY</code> ${s.env.RESEND_KEY ? '<span class="ok">✓ ตั้งแล้ว</span>' : '<span class="warn">ยังไม่ตั้ง</span>'} และยืนยันโดเมนผู้ส่งใน Resend</p>
      <label>ผู้ส่ง (เช่น AstraCode &lt;no-reply@panderx.xyz&gt;)</label><input name="mail_from" value="${esc(s.mail_from)}">
      <h2 style="margin-top:28px">ข้อมูลในใบเสร็จ</h2>
      <label>ชื่อร้าน / บริษัท</label><input name="business_name" value="${esc(s.business_name)}">
      <label>ที่อยู่</label><textarea name="business_address" rows="2">${esc(s.business_address)}</textarea>
      <label>เลขประจำตัวผู้เสียภาษี (ถ้ามี)</label><input name="business_tax_id" value="${esc(s.business_tax_id)}">
      <div class="row" style="margin-top:20px"><button class="btn blue">บันทึก</button><span id="sv" class="ok"></span></div></form>`;
    const sp = () => box.querySelectorAll('[data-sp]').forEach(el => el.hidden = !el.dataset.sp.split(' ').includes($('#sp').value));
    $('#sp').onchange = sp; sp();
    $('#s2t').onclick = async () => {
      $('#s2r').textContent = 'กำลังทดสอบ... (กดบันทึกก่อนถ้าเพิ่งแก้ URL)';
      try { const r = await api('/admin/slip-test', { method: 'POST' }); $('#s2r').innerHTML = r.ok ? `<span class="ok">✓ เชื่อมต่อได้</span> <code>${esc(JSON.stringify(r.data?.data ?? r.data)).slice(0, 300)}</code>` : `<span class="bad">✕ ${esc(r.data?.message || 'เชื่อมต่อไม่ได้')}</span>`; }
      catch (x) { $('#s2r').innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    };
    $('#f').onsubmit = async e => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); e.target.querySelectorAll('[data-b]').forEach(c => body[c.dataset.b] = c.checked ? '1' : '0'); await api('/admin/settings', { method: 'PUT', body }); $('#sv').textContent = '✓ บันทึกแล้ว'; setTimeout(() => $('#sv').textContent = '', 2000); };
  },
};

// แพลน/โมเดล: แสดงเป็นรายการ กดเพื่อแก้ไข
async function editors(tab, box, reload) {
  const rows = await api('/admin/' + tab), models = tab === 'posts' ? [] : tab === 'models' ? rows : await api('/admin/models');
  const summary = r => tab === 'posts' ? `<b>${esc(r.title)}</b><span class="muted">/blog/${esc(r.slug)} · ${r.published ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'} · ${when(r.created_at)}</span>`
    : tab === 'plans'
    ? `<b>${esc(r.name)}</b><span class="muted">${r.price > 0 ? '฿' + baht(r.price) + '/เดือน' : 'ฟรี'} · สัปดาห์ ${compact(r.limit_week)} units · ${r.model_ids.length} โมเดล</span>`
    : `<b>${esc(r.name)}</b><span class="muted">${esc(r.api_model)} · ×${r.multiplier} · ${r.price_in != null ? `ขาย ${r.price_in}/${r.price_out ?? '-'}` : 'ราคาอัตโนมัติ'}${r.public ? '' : ' · ซ่อนจากหน้าราคา'} · ${r.has_key ? '<span class="ok">key พร้อม</span>' : '<span class="bad">ไม่พบ key</span>'}${r.vision ? ' · อ่านรูป' : ''}${r.effort !== 'none' ? ' · effort' : ''}</span>`;
  const form = (r = { active: 1, public: 1, model_ids: [] }) => `<form class="ed-f" data-id="${r.id || ''}"><div class="form2 ${tab === 'posts' ? 'one' : ''}">${FIELDS[tab].map(([k, l, t]) => `<div><label>${l}</label>${t === 'b' ? `<label class="sw"><input type="checkbox" name="${k}" ${r[k] ? 'checked' : ''}><span></span></label>`
      : Array.isArray(t) ? `<select name="${k}">${t.map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : t === 'm' ? `<select name="${k}"><option value="">ไม่มี</option>${models.filter(m => m.id !== r.id).map(m => `<option value="${m.id}" ${r[k] === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`
      : t === 't' ? `<textarea name="${k}" rows="12">${esc(r[k] ?? '')}</textarea>`
      : `<input name="${k}" ${t === 'n' || t === 'o' ? 'type="number" step="any" inputmode="decimal"' : ''} value="${esc(r[k] ?? '')}" ${t === 'o' ? 'placeholder="อัตโนมัติ: ทุน + markup"' : t === 's' ? '' : 'required'}>`}</div>`).join('')}</div>
    ${tab === 'plans' ? `<label>โมเดลที่ใช้ได้</label><div class="chips-sel">${models.map(m => `<label><input type="checkbox" name="m" value="${m.id}" ${r.model_ids?.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)} ×${m.multiplier}</span></label>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn blue sm">บันทึก</button>${r.id ? `<button type="button" class="btn red sm" data-del="${r.id}">ลบ</button>` : ''}<span class="ok sv"></span></div></form>`;
  box.innerHTML = `<p class="muted hint">${tab === 'posts' ? 'เขียนด้วย Markdown · บทความที่เผยแพร่จะขึ้นที่ /blog, หน้าแรก และ sitemap.xml' : tab === 'plans'
    ? '1 unit = 1 token ของโมเดลตัวคูณ ×1 (cache read นับ 1/10) · ต้นทุนเต็มลิมิต/สัปดาห์ของ DeepSeek ≈ ลิมิต ÷ 1,000,000 × 1.2 บาท'
    : 'key ใส่ที่ Worker → Settings → Variables and Secrets (Type: Secret) · Claude ใช้รูปแบบ anthropic ตัวอื่นใช้ openai'}</p>
    <div class="ed-list">${rows.map(r => `<details class="ed"><summary>${summary(r)}${r.active ? '' : '<span class="pill">ปิดอยู่</span>'}</summary>${form(r)}</details>`).join('')}
    <details class="ed add"><summary><b>+ เพิ่ม${{ plans: 'แพลน', models: 'โมเดล', posts: 'บทความ' }[tab]}</b></summary>${form(tab === 'posts' ? { published: 0 } : undefined)}</details></div>`;
  box.querySelectorAll('form').forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(f), body = {};
    FIELDS[tab].forEach(([k, , t]) => body[k] = t === 'b' ? (fd.get(k) ? 1 : 0) : t === 'n' ? +fd.get(k) : t === 'o' || t === 'm' ? (fd.get(k) === '' ? null : +fd.get(k)) : fd.get(k));
    if (tab === 'plans') body.model_ids = fd.getAll('m').map(Number);
    try { await api(`/admin/${tab}${f.dataset.id ? '/' + f.dataset.id : ''}`, { method: f.dataset.id ? 'PUT' : 'POST', body }); if (f.dataset.id) { f.querySelector('.sv').textContent = '✓ บันทึกแล้ว'; setTimeout(reload, 700); } else reload(); }
    catch (x) { alert(x.message); }
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('ลบถาวร?')) { await api(`/admin/${tab}/${b.dataset.del}`, { method: 'DELETE' }); reload(); } });
}

// แผงรายละเอียดผู้ใช้ (เลื่อนออกมาจากขวา)
async function userDrawer(id, after) {
  const [u, plans] = await Promise.all([api('/admin/users/' + id), api('/admin/plans')]);
  document.querySelector('.drawer')?.remove();
  const d = document.createElement('div'); d.className = 'drawer';
  const total = u.models.reduce((a, m) => a + m.cost, 0);
  d.innerHTML = `<div class="dr-shade"></div><aside class="dr-p" role="dialog" aria-label="ผู้ใช้ ${esc(u.email)}">
    <div class="dr-h"><span class="av lg">${esc(u.email[0].toUpperCase())}</span><div><b>${esc(u.email)}</b><div class="muted">สมัคร ${when(u.created_at)} · ${u.chats} แชต</div></div><span style="flex:1"></span><button class="btn out sm" id="dx">ปิด</button></div>
    <div class="kpis sm">
      <div class="kpi"><div class="muted">แพลน</div><div class="stat">${esc(u.current_plan)}</div><div class="kd muted">${u.plan_id && u.plan_expires > Date.now() ? 'ถึง ' + when(u.plan_expires) : 'ไม่มีวันหมด'}</div></div>
      <div class="kpi"><div class="muted">ลิมิต 4 ชม.</div><div class="stat">${u.usage.pct4h}%</div><div class="bar1"><div style="width:${u.usage.pct4h}%"></div></div></div>
      <div class="kpi"><div class="muted">ลิมิตสัปดาห์</div><div class="stat">${u.usage.pctWeek}%</div><div class="bar1"><div style="width:${u.usage.pctWeek}%"></div></div></div>
      <div class="kpi"><div class="muted">ต้นทุน 30 วัน</div><div class="stat">฿${baht(total)}</div></div>
    </div>
    <h3>ใช้โมเดลไหน (30 วัน)</h3>${u.models.length ? `<div class="tw"><table class="tbl"><tr><th>โมเดล</th><th>ข้อความ</th><th>Token</th><th>ต้นทุน</th></tr>${u.models.map(m => `<tr><td>${esc(m.name)}</td><td>${num(m.msgs)}</td><td>${compact(m.tok)}</td><td>฿${baht(m.cost)}</td></tr>`).join('')}</table></div>` : '<p class="muted">ยังไม่มีการใช้งาน</p>'}
    <h3>Wallet ฿${baht(u.balance)}</h3>${u.wallet.length ? `<div class="tw"><table class="tbl">${u.wallet.map(t => `<tr><td>${when(t.created_at)}</td><td>${esc(t.kind)}${t.ref ? ' · ' + esc(t.ref) : ''}</td><td class="${t.amount < 0 ? 'bad' : 'ok'}">${t.amount < 0 ? '' : '+'}${baht(t.amount)}</td></tr>`).join('')}</table></div>` : ''}
    <div class="row" style="margin-top:8px"><input id="dcr" type="number" step="any" placeholder="เพิ่ม/ลด เช่น 50 หรือ -20" style="flex:1"><input id="dcn" placeholder="เหตุผล" style="flex:1"><button class="btn out sm" id="dcs">ปรับยอด</button></div>
    <h3>การชำระเงิน</h3>${u.payments.length ? u.payments.map(p => `<div class="row" style="padding:6px 0">${STATUS[p.status]} ${esc(p.plan_name)} ฿${baht(p.amount)} <span class="muted">${when(p.created_at)}</span></div>`).join('') : '<p class="muted">ยังไม่เคยจ่าย</p>'}
    <h3>จัดการ</h3>
    <label>เปลี่ยนแพลน (30 วันนับจากวันนี้)</label><div class="row"><select id="dp" style="flex:1"><option value="">Free</option>${plans.filter(p => p.price > 0).map(p => `<option value="${p.id}" ${p.id === u.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn blue sm" id="dps">ใช้แพลนนี้</button></div>
    <div class="row" style="margin-top:12px"><button class="btn out sm" id="dr">รีเซ็ตลิมิต</button><button class="btn out sm" id="dpw">ตั้งรหัสใหม่</button><button class="btn red sm" id="db">${u.banned ? 'ปลดแบน' : 'แบน'}</button></div>
    <p class="ok" id="dmsg"></p></aside>`;
  document.body.append(d);
  const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 200); after?.(); };
  d.querySelector('.dr-shade').onclick = close; d.querySelector('#dx').onclick = close;
  const put = async (body, msg) => { try { await api('/admin/users/' + id, { method: 'PUT', body }); d.querySelector('#dmsg').textContent = '✓ ' + msg; } catch (x) { alert(x.message); } };
  d.querySelector('#dps').onclick = () => put({ plan_id: +d.querySelector('#dp').value || null, days: 30 }, 'เปลี่ยนแพลนแล้ว');
  d.querySelector('#dr').onclick = () => put({ reset_usage: true }, 'รีเซ็ตลิมิตแล้ว');
  d.querySelector('#dcs').onclick = async () => { const v = +d.querySelector('#dcr').value; if (!v || !confirm(`ปรับ Wallet ${v > 0 ? '+' : ''}${v} บาท?`)) return; await put({ credit: v, note: d.querySelector('#dcn').value }, 'ปรับยอดแล้ว'); setTimeout(() => userDrawer(id, after), 500); };
  d.querySelector('#dpw').onclick = () => { const pw = prompt('รหัสผ่านใหม่ (อย่างน้อย 8 ตัว) ผู้ใช้จะถูกออกจากระบบทุกเครื่อง'); if (pw) put({ password: pw }, 'ตั้งรหัสใหม่แล้ว ส่งรหัสนี้ให้ผู้ใช้'); };
  d.querySelector('#db').onclick = () => confirm(u.banned ? 'ปลดแบนผู้ใช้นี้?' : 'แบนผู้ใช้นี้? จะถูกออกจากระบบทันที') && put({ banned: u.banned ? 0 : 1 }, u.banned ? 'ปลดแบนแล้ว' : 'แบนแล้ว').then(() => setTimeout(() => userDrawer(id, after), 600));
}
