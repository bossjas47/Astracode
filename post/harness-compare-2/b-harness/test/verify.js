const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

const results = [];
function check(name, pass, extra) {
  results.push({ name, pass, extra });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(400);

  // localStorage availability on file://
  const lsOK = await page.evaluate(() => {
    try { localStorage.setItem('__t', '1'); const v = localStorage.getItem('__t'); localStorage.removeItem('__t'); return v === '1'; }
    catch (e) { return false; }
  });
  check('localStorage usable on file://', lsOK);

  // 1) menu 8 items
  check('8 menu cards', await page.locator('[data-testid="menu-item"]').count() === 8);

  // 2) filters
  for (const cat of ['ต้ม', 'ผัด', 'แกง', 'ของหวาน']) {
    await page.locator(`[data-testid="filter-${cat}"]`).click();
    const n = await page.locator('[data-testid="menu-item"]').count();
    check(`filter-${cat} shows only ${cat}`, n === 2, n);
    const cats = await page.locator('[data-testid="menu-item"]').evaluateAll(els => els.map(e => e.dataset.category));
    check(`filter-${cat} categories correct`, cats.every(c => c === cat), cats);
  }
  await page.locator('[data-testid="filter-all"]').click();
  check('filter-all shows 8', await page.locator('[data-testid="menu-item"]').count() === 8);

  // search
  await page.locator('[data-testid="search"]').fill('ต้ม');
  check('search "ต้ม" → 2', await page.locator('[data-testid="menu-item"]').count() === 2);
  // search + filter combined
  await page.locator('[data-testid="filter-ผัด"]').click();
  check('search+filter combo → 0', await page.locator('[data-testid="menu-item"]').count() === 0);
  await page.locator('[data-testid="filter-all"]').click();
  await page.locator('[data-testid="search"]').fill('กะเพรา');
  const nm = await page.locator('[data-testid="menu-item"]').count();
  const nmText = await page.locator('[data-testid="menu-item"]').first().innerText();
  check('search "กะเพรา" → 1', nm === 1 && nmText.includes('กะเพรา'), { nm, nmText: nmText.split('\n')[0] });
  await page.locator('[data-testid="search"]').fill('');

  // 3) cart
  await page.locator('[data-testid="menu-item"]').first().locator('[data-testid="add"]').click();
  await page.locator('[data-testid="menu-item"]').first().locator('[data-testid="add"]').click();
  check('adding same item → 1 cart row', await page.locator('[data-testid="cart-row"]').count() === 1);
  const qty1 = await page.locator('[data-testid="cart-row"] .qty-val').first().innerText();
  check('qty = 2 after 2 adds', qty1 === '2', qty1);

  const firstPrice = 180; // ต้มยำกุ้ง
  let sub = await page.locator('[data-testid="subtotal"]').innerText();
  let vat = await page.locator('[data-testid="vat"]').innerText();
  let tot = await page.locator('[data-testid="total"]').innerText();
  // 360 → vat 25.20 → total 385.20
  check('subtotal digits only', /^[\d.]+$/.test(sub.trim()), sub);
  check('subtotal = 360.00', sub.trim() === '360.00', sub);
  check('vat = 25.20', vat.trim() === '25.20', vat);
  check('total = 385.20', tot.trim() === '385.20', tot);

  // VAT rounding: add บัวลอย 90 → subtotal 450 → vat 31.50
  await page.locator('[data-testid="filter-all"]').click();
  const buaLoy = page.locator('[data-testid="menu-item"][data-id="bua-loy"]');
  await buaLoy.locator('[data-testid="add"]').click();
  check('2 cart rows now', await page.locator('[data-testid="cart-row"]').count() === 2);
  check('subtotal 450.00', (await page.locator('[data-testid="subtotal"]').innerText()).trim() === '450.00');
  check('vat 31.50', (await page.locator('[data-testid="vat"]').innerText()).trim() === '31.50');
  check('total 481.50', (await page.locator('[data-testid="total"]').innerText()).trim() === '481.50');

  // rounding test 90*3 = 270 → vat 18.90 ... let's do a case with fraction: 165 → vat 11.55
  // dec/inc
  const row1 = page.locator('[data-testid="cart-row"]').first();
  await row1.locator('[data-testid="inc"]').click();
  check('inc → qty 3', (await page.locator('[data-testid="cart-row"]').first().locator('.qty-val').innerText()) === '3');
  check('subtotal 630.00 after inc', (await page.locator('[data-testid="subtotal"]').innerText()).trim() === '630.00');
  await page.locator('[data-testid="cart-row"]').first().locator('[data-testid="dec"]').click();
  await page.locator('[data-testid="cart-row"]').first().locator('[data-testid="dec"]').click();
  check('dec x2 → qty 1', (await page.locator('[data-testid="cart-row"]').first().locator('.qty-val').innerText()) === '1');
  await page.locator('[data-testid="cart-row"]').first().locator('[data-testid="dec"]').click();
  check('dec to 0 removes row', await page.locator('[data-testid="cart-row"]').count() === 1);

  // persistence: refresh
  await page.reload();
  await page.waitForTimeout(400);
  check('cart persists after reload', await page.locator('[data-testid="cart-row"]').count() === 1);
  check('subtotal persists = 90.00', (await page.locator('[data-testid="subtotal"]').innerText()).trim() === '90.00', await page.locator('[data-testid="subtotal"]').innerText());

  // reset cart for clean booking tests
  await page.evaluate(() => localStorage.removeItem('kbn.cart'));
  await page.reload();
  await page.waitForTimeout(300);

  // 4) booking validation
  const fill = async (o) => {
    const f = page.locator('[data-testid="booking-form"]');
    if ('name' in o) await f.locator('[name="name"]').fill(o.name);
    if ('phone' in o) await f.locator('[name="phone"]').fill(o.phone);
    if ('date' in o) await f.locator('[name="date"]').fill(o.date);
    if ('time' in o) await f.locator('[name="time"]').fill(o.time);
    if ('guests' in o) await f.locator('[name="guests"]').fill(String(o.guests));
  };
  const submit = async () => {
    await page.locator('[data-testid="booking-form"]').locator('button[type="submit"]').click();
    await page.waitForTimeout(120);
  };
  const errText = async () => {
    const loc = page.locator('[data-testid="booking-error"]');
    if (!(await loc.count())) return '(missing)';
    return (await loc.isVisible()) ? (await loc.innerText()).trim() : '';
  };
  const okText = async () => {
    const loc = page.locator('[data-testid="booking-ok"]');
    if (!(await loc.count())) return '(missing)';
    return (await loc.isVisible()) ? (await loc.innerText()).trim() : '';
  };

  // empty submit
  await page.evaluate(() => localStorage.removeItem('kbn.bookings'));
  await page.reload();
  await page.waitForTimeout(300);
  await submit();
  let e = await errText();
  check('empty form shows Thai error', e.length > 0 && /[\u0E00-\u0E7F]/.test(e), e);
  check('no ok message on error', (await okText()) === '');

  // compute valid future non-Monday date
  const info = await page.evaluate(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    let future = new Date(today);
    for (let i = 2; i < 15; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      if (d.getDay() !== 1) { future = d; break; }
    }
    // nearest monday in the future (> today)
    let mon = new Date(today);
    for (let i = 2; i < 15; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      if (d.getDay() === 1) { mon = d; break; }
    }
    const yest = new Date(today.getTime() - 86400000);
    return { today: fmt(today), future: fmt(future), monday: fmt(mon), yesterday: fmt(yest), todayDow: today.getDay() };
  });
  console.log('date info', info);

  // ── base valid values: every case starts from here, overrides one field ──
  const BASE = { name: 'คุณสมชาย', phone: '0812345678', date: info.future, time: '18:00', guests: 4 };
  const resetForm = async () => {
    await page.evaluate(() => { localStorage.removeItem('kbn.bookings'); });
    await page.reload();
    await page.waitForTimeout(200);
  };
  const caseRun = async (overrides) => {
    await resetForm();
    await fill(Object.assign({}, BASE, overrides));
    await submit();
    return { err: await errText(), ok: await okText(), rows: await page.locator('[data-testid="booking-row"]').count() };
  };

  // invalid phone formats
  let r = await caseRun({ phone: '812345678' });
  check('phone not starting with 0 → error', r.err.includes('เบอร์โทร'), r.err);
  r = await caseRun({ phone: '081234567' });
  check('phone 9 digits → error', r.err.includes('เบอร์โทร'), r.err);
  r = await caseRun({ phone: '08123456789' });
  check('phone 11 digits → error', r.err.includes('เบอร์โทร'), r.err);
  r = await caseRun({ phone: '08123456ab' });
  check('phone with letters → error', r.err.includes('เบอร์โทร'), r.err);
  r = await caseRun({ phone: '081-234-5678' });
  check('phone with dashes → error', r.err.includes('เบอร์โทร'), r.err);

  // date rules
  r = await caseRun({ date: info.yesterday });
  check('past date → error', r.err.includes('ผ่านมา'), r.err);
  r = await caseRun({ date: info.monday });
  check('Monday → error', r.err.includes('จันทร์'), r.err);
  if (info.todayDow !== 1) {
    r = await caseRun({ date: info.today });
    check('today (not Monday) accepted', r.err === '' && r.ok.length > 0, r.err);
  } else {
    r = await caseRun({ date: info.today });
    check('today is Monday → rejected', r.err.includes('จันทร์'), r.err);
  }

  // time bounds
  r = await caseRun({ time: '09:59' });
  check('time 09:59 → error', r.err.includes('10:00'), r.err);
  r = await caseRun({ time: '21:01' });
  check('time 21:01 → error', r.err.includes('10:00'), r.err);
  r = await caseRun({ time: '21:00' });
  check('time 21:00 accepted', r.err === '' && r.ok.length > 0, r.err);
  r = await caseRun({ time: '10:00' });
  check('time 10:00 accepted', r.err === '' && r.ok.length > 0, r.err);
  r = await caseRun({ time: '15:00' });
  check('time 15:00 accepted', r.err === '' && r.ok.length > 0, r.err);

  // guests bounds
  r = await caseRun({ guests: 0 });
  check('guests 0 → error', r.err.includes('จำนวนคน'), r.err);
  r = await caseRun({ guests: 13 });
  check('guests 13 → error', r.err.includes('จำนวนคน'), r.err);
  r = await caseRun({ guests: 1 });
  check('guests 1 accepted', r.err === '' && r.ok.length > 0, r.err);
  r = await caseRun({ guests: 12 });
  check('guests 12 accepted', r.err === '' && r.ok.length > 0, r.err);

  // name required
  r = await caseRun({ name: '   ' });
  check('blank name → error', r.err.includes('ชื่อ'), r.err);

  // ── successful booking end-to-end ──
  await resetForm();
  await fill(Object.assign({}, BASE, { guests: 6, time: '19:30' }));
  await submit();
  const ok = await okText();
  check('success shows booking-ok', ok.length > 0 && /[\u0E00-\u0E7F]/.test(ok), ok);
  check('booking-error hidden after success', (await errText()) === '', await errText());
  check('form reset after success', await page.evaluate(() => {
    const f = document.querySelector('[data-testid="booking-form"]');
    return ['name', 'phone', 'date', 'time', 'guests'].every(n => !f.elements[n].value);
  }));
  check('booking row created', await page.locator('[data-testid="booking-row"]').count() === 1);
  const rowText = await page.locator('[data-testid="booking-row"]').first().innerText();
  check('booking row shows name/date/time/guests',
    rowText.includes('คุณสมชาย') && rowText.includes(info.future) && rowText.includes('19:30') && rowText.includes('6'),
    rowText.replace(/\n/g, ' | '));

  // second booking
  await fill({ name: 'คุณมานี', phone: '0899999999', date: info.future, time: '12:00', guests: 2 });
  await submit();
  check('2 booking rows', await page.locator('[data-testid="booking-row"]').count() === 2);

  // persistence of bookings
  await page.reload();
  await page.waitForTimeout(400);
  check('bookings persist after reload', await page.locator('[data-testid="booking-row"]').count() === 2);

  // 6) theme toggle
  const hasDark0 = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.locator('[data-testid="theme-toggle"]').click();
  const hasDark1 = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check('theme toggle flips html.dark', hasDark0 !== hasDark1, { before: hasDark0, after: hasDark1 });
  const savedTheme = await page.evaluate(() => localStorage.getItem('kbn.theme'));
  check('theme saved to localStorage', savedTheme === (hasDark1 ? 'dark' : 'light'), savedTheme);
  await page.reload();
  await page.waitForTimeout(400);
  const hasDark2 = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  check('theme persists after reload', hasDark2 === hasDark1, { hasDark1, hasDark2 });
  // back to light for screenshots
  if (hasDark2) await page.locator('[data-testid="theme-toggle"]').click();

  // 7) responsive measurements
  await page.setViewportSize({ width: 375, height: 780 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow @375px', overflow <= 0, overflow);
  const tapTargets = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-testid="add"], .qty-btn, [data-testid="theme-toggle"], .chip')];
    return btns.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height < 28; }).length;
  });
  check('tap targets >= 28px height', tapTargets === 0, tapTargets);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no horizontal overflow @1280px', overflow2 <= 0, overflow2);

  // required testids existence — seed cart+booking so dynamic rows exist
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    localStorage.setItem('kbn.cart', JSON.stringify({ 'tom-yum-goong': 2 }));
    localStorage.setItem('kbn.bookings', JSON.stringify([{ id: 'b1', name: 'คุณสมชาย', phone: '0812345678', date: '2026-11-27', time: '18:00', guests: 4 }]));
  });
  await page.reload();
  await page.waitForTimeout(300);

  const required = ['menu-item', 'add', 'filter-all', 'filter-ต้ม', 'filter-ผัด', 'filter-แกง', 'filter-ของหวาน', 'search', 'cart-row', 'inc', 'dec', 'subtotal', 'vat', 'total', 'booking-form', 'booking-error', 'booking-ok', 'booking-row', 'theme-toggle'];
  for (const id of required) {
    check(`testid "${id}" present`, await page.locator(`[data-testid="${id}"]`).count() > 0);
  }

  const named = await page.locator('[data-testid="booking-form"]').evaluate(f => ['name', 'phone', 'date', 'time', 'guests'].map(n => !!f.elements[n]));
  check('booking form has name/phone/date/time/guests', named.every(Boolean), named);

  check('no page/console errors', errors.length === 0, errors.slice(0, 5));

  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' passed ===');
  if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(' | ')); process.exit(1); }
})().catch(e => { console.error('RUNNER ERROR', e); process.exit(2); });