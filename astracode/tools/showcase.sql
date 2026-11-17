-- ผลงานโชว์ 'งบเงินฉัน' (สร้างด้วยทีม Agent: ChatGPT 6.1 Sol Medium) · รันทุก deploy ได้ซ้ำ (เขียนทับไฟล์เดิม)
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'index.html','<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#175c46">
  <title>ภาพรวม · งบเงินฉัน</title>
  <link rel="stylesheet" href="style.css">
  <script src="store.js" defer></script>
  <script src="script.js" defer></script>
</head>
<body data-page="dashboard">
  <div data-shell></div>
  <main class="container">
    <div class="page-heading">
      <div><p class="eyebrow">YOUR MONEY, YOUR WAY</p><h1>เงินของคุณ ในมุมที่ชัดขึ้น<span class="heading-dot">.</span></h1><p class="subtitle" id="today-label">ภาพรวมการเงินของคุณ</p></div>
      <a class="button primary" href="add.html"><span data-icon="plus"></span> เพิ่มรายการ</a>
    </div>
    <div class="notice" id="storage-notice" role="status" hidden></div>
    <section class="summary-grid" aria-label="สรุปการเงิน">
      <article class="balance-card">
        <div class="card-label"><span data-icon="wallet"></span> ยอดคงเหลือทั้งหมด <span class="live-dot"></span></div>
        <p class="balance-amount" id="balance">฿0.00</p>
        <div class="balance-footer"><span>ทุกบัญชีในบันทึกของคุณ</span><span class="small-tag">THB</span></div>
        <div class="balance-decoration" aria-hidden="true"></div>
      </article>
      <article class="metric-card">
        <span class="metric-icon income-bg" data-icon="down-left"></span>
        <p class="muted">รายรับเดือนนี้</p><p class="metric-value income" id="month-income">฿0.00</p>
        <p class="metric-foot"><span class="income">เงินเข้า</span><span id="income-count">0 รายการ</span></p>
      </article>
      <article class="metric-card">
        <span class="metric-icon expense-bg" data-icon="up-right"></span>
        <p class="muted">รายจ่ายเดือนนี้</p><p class="metric-value" id="month-expense">฿0.00</p>
        <p class="metric-foot"><span class="expense">เงินออก</span><span id="expense-count">0 รายการ</span></p>
      </article>
    </section>
    <div class="dashboard-grid">
      <section class="panel chart-panel">
        <div class="section-heading"><div><h2>จังหวะการใช้เงิน</h2><p class="muted">รายรับและรายจ่าย 7 วันล่าสุด</p></div><span class="period-badge">7 วันล่าสุด</span></div>
        <div class="chart-legend"><span><i class="legend-dot income-dot"></i>รายรับ</span><span><i class="legend-dot expense-dot"></i>รายจ่าย</span><span class="chart-unit">หน่วย: บาท</span></div>
        <div class="chart-container"><canvas id="weekly-chart" role="img" aria-label="กราฟรายรับและรายจ่าย 7 วันล่าสุด"></canvas></div>
        <p class="chart-caption" id="chart-caption"></p>
      </section>
      <aside class="panel month-panel">
        <div class="section-heading"><h2>เดือนนี้เป็นอย่างไร?</h2><span class="soft-icon" data-icon="sparkles"></span></div>
        <p class="muted" id="month-label"></p>
        <p class="saving-label">ส่วนต่างรายรับ − รายจ่าย</p>
        <p class="saving-amount" id="month-net">฿0.00</p>
        <div class="budget-track" aria-hidden="true"><span id="spending-bar"></span></div>
        <p class="spending-caption" id="spending-caption"></p>
        <div class="tip-box"><span data-icon="leaf"></span><p>เริ่มต้นเล็ก ๆ แค่จดทุกวัน<br><strong>ก็เข้าใจเงินของตัวเองมากขึ้น</strong></p></div>
      </aside>
    </div>
    <section class="panel recent-panel">
      <div class="section-heading"><div><h2>รายการล่าสุด</h2><p class="muted">ความเคลื่อนไหวเล็ก ๆ ของเงินคุณ</p></div><a class="text-link" href="history.html">ดูทั้งหมด <span data-icon="arrow-right"></span></a></div>
      <div id="recent-list"></div>
    </section>
    <footer class="page-footer"><span data-icon="shield"></span> ข้อมูลอยู่ในเบราว์เซอร์ของคุณ · ไม่ต้องสมัครสมาชิก</footer>
  </main>
</body>
</html>
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'add.html','<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#175c46">
  <title>เพิ่มรายการ · งบเงินฉัน</title>
  <link rel="stylesheet" href="style.css">
  <script src="store.js" defer></script>
  <script src="script.js" defer></script>
</head>
<body data-page="add">
  <div data-shell></div>
  <main class="container">
    <div class="page-heading"><div><p class="eyebrow">MAKE EVERY BAHT COUNT</p><h1>จดไว้ สบายใจกว่า<span class="heading-dot">.</span></h1><p class="subtitle">เติมบันทึกเล็ก ๆ ให้เห็นภาพการเงินที่ชัดเจน</p></div><a class="text-link" href="history.html">ดูประวัติ <span data-icon="arrow-right"></span></a></div>
    <div class="notice" id="storage-notice" role="status" hidden></div>
    <div class="form-layout">
      <section class="panel form-panel">
        <div class="section-heading"><h2>เพิ่มรายการใหม่</h2><span class="soft-icon" data-icon="edit"></span></div>
        <form id="transaction-form" novalidate>
          <fieldset class="type-fieldset"><legend>ประเภทรายการ</legend>
            <div class="type-picker">
              <label><input type="radio" name="type" value="expense" checked><span><span data-icon="up-right"></span> รายจ่าย</span></label>
              <label><input type="radio" name="type" value="income"><span><span data-icon="down-left"></span> รายรับ</span></label>
            </div>
          </fieldset>
          <div class="field amount-field"><label for="amount">จำนวนเงิน <span class="required">*</span></label><div class="amount-input"><span>฿</span><input id="amount" name="amount" type="number" min="0.01" max="999999999.99" step="0.01" inputmode="decimal" placeholder="0.00" required aria-describedby="amount-error"><span class="currency-label">THB</span></div><small class="field-error" id="amount-error"></small></div>
          <div class="field-row">
            <div class="field"><label for="category">หมวดหมู่ <span class="required">*</span></label><select id="category" name="category" required aria-describedby="category-error"></select><small class="field-error" id="category-error"></small></div>
            <div class="field"><label for="date">วันที่ <span class="required">*</span></label><input id="date" name="date" type="date" required aria-describedby="date-error"><small class="field-error" id="date-error"></small></div>
          </div>
          <div class="field"><label for="note">โน้ต <span class="optional">ไม่บังคับ</span></label><textarea id="note" name="note" rows="3" maxlength="200" placeholder="เช่น มื้อกลางวันกับเพื่อน" aria-describedby="note-count"></textarea><small class="input-hint" id="note-count">0 / 200 ตัวอักษร</small></div>
          <div class="form-message" id="form-message" role="status" tabindex="-1" hidden></div>
          <div class="form-actions"><a class="button secondary" href="index.html">กลับหน้าสรุป</a><button class="button primary" type="submit"><span data-icon="check"></span> บันทึกรายการ</button></div>
        </form>
      </section>
      <aside class="form-aside">
        <div class="aside-art" aria-hidden="true"><span data-icon="leaf"></span><span class="art-dot dot-one"></span><span class="art-dot dot-two"></span></div>
        <p class="eyebrow">A LITTLE HABIT, A BIG CHANGE</p><h2>ทุกบาทมีเรื่องราว<br>เริ่มบันทึกของคุณวันนี้</h2><p class="muted">ไม่ว่าจะเป็นกาแฟแก้วโปรด หรือเงินเดือนก้อนแรก ทุกบันทึกช่วยให้คุณวางแผนวันข้างหน้าได้ดีขึ้น</p>
        <div class="aside-note"><span data-icon="shield"></span><p>บันทึกบนอุปกรณ์นี้ผ่านเบราว์เซอร์<br>ส่งออก CSV เก็บสำรองได้ที่หน้าประวัติ</p></div>
      </aside>
    </div>
    <footer class="page-footer"><span data-icon="leaf"></span> นิสัยเล็ก ๆ เพื่อสุขภาพการเงินที่ดีขึ้น</footer>
  </main>
</body>
</html>
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'history.html','<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#175c46">
  <title>ประวัติรายการ · งบเงินฉัน</title>
  <link rel="stylesheet" href="style.css">
  <script src="store.js" defer></script>
  <script src="script.js" defer></script>
</head>
<body data-page="history">
  <div data-shell></div>
  <main class="container">
    <div class="page-heading"><div><p class="eyebrow">YOUR FINANCIAL STORY</p><h1>ทุกบันทึกของคุณ<span class="heading-dot">.</span></h1><p class="subtitle">ย้อนดู ค้นหา และจัดการรายรับรายจ่ายในที่เดียว</p></div><a class="button primary" href="add.html"><span data-icon="plus"></span> เพิ่มรายการ</a></div>
    <div class="notice" id="storage-notice" role="status" hidden></div>
    <section class="panel history-panel">
      <div class="section-heading"><div><h2>ประวัติรายการ</h2><p class="muted" id="result-count">รายการทั้งหมด</p></div><button class="button secondary export-button" id="export-csv" type="button"><span data-icon="download"></span> ส่งออก CSV</button></div>
      <div class="filters">
        <div class="search-field"><span data-icon="search"></span><input id="search" type="search" aria-label="ค้นหารายการ" placeholder="ค้นหาโน้ต หมวด หรือจำนวนเงิน"></div>
        <div><label class="sr-only" for="filter-category">กรองตามหมวดหมู่</label><select id="filter-category"><option value="">ทุกหมวดหมู่</option></select></div>
        <div><label class="sr-only" for="filter-month">กรองตามเดือน</label><select id="filter-month"><option value="">ทุกเดือน</option></select></div>
        <button class="reset-button" type="button" id="reset-filters">ล้างตัวกรอง</button>
      </div>
      <div class="history-totals"><span>รายรับ <strong class="income" id="filtered-income">฿0.00</strong></span><span>รายจ่าย <strong class="expense" id="filtered-expense">฿0.00</strong></span><span>ส่วนต่าง <strong id="filtered-net">฿0.00</strong></span></div>
      <div class="table-scroll">
        <table><caption class="sr-only">รายการรายรับรายจ่ายตามตัวกรอง</caption><thead><tr><th scope="col">รายการ / หมวดหมู่</th><th scope="col">วันที่</th><th scope="col">ประเภท</th><th scope="col" class="align-right">จำนวนเงิน</th><th scope="col" class="align-right">จัดการ</th></tr></thead><tbody id="history-body"></tbody></table>
      </div>
      <div id="history-empty" hidden></div>
      <p class="table-footnote">CSV จะส่งออกเฉพาะรายการที่ตรงกับตัวกรองปัจจุบัน</p>
    </section>
    <div class="form-message" id="history-message" role="status" hidden></div>
    <footer class="page-footer"><span data-icon="shield"></span> แนะนำให้ส่งออกข้อมูลสำรองก่อนล้างข้อมูลเบราว์เซอร์</footer>
  </main>
  <dialog id="delete-dialog" aria-labelledby="delete-title">
    <div class="dialog-icon" data-icon="trash"></div><h2 id="delete-title">ลบรายการนี้?</h2><p class="muted" id="delete-description"></p><p class="muted">เมื่อลบแล้วจะไม่สามารถกู้คืนรายการนี้ได้</p>
    <div class="dialog-actions"><button type="button" class="button secondary" id="cancel-delete">เก็บไว้</button><button type="button" class="button danger" id="confirm-delete">ลบรายการ</button></div>
  </dialog>
</body>
</html>
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'store.js','(function () {
  ''use strict'';

  const DATA_KEY = ''ngob-ngoen-chan.transactions.v1'';
  const THEME_KEY = ''ngob-ngoen-chan.theme'';
  const categories = Object.freeze({
    income: Object.freeze([''เงินเดือน'', ''รายได้เสริม'', ''โบนัส'', ''การลงทุน'', ''ของขวัญ'', ''รายรับอื่น ๆ'']),
    expense: Object.freeze([''อาหารและเครื่องดื่ม'', ''เดินทาง'', ''ช้อปปิ้ง'', ''ที่พักและบิล'', ''สุขภาพ'', ''บันเทิง'', ''การศึกษา'', ''รายจ่ายอื่น ๆ''])
  });
  let lastError = '''';

  function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, ''0'')}-${String(date.getDate()).padStart(2, ''0'')}`;
  }

  function validDate(value) {
    if (typeof value !== ''string'' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && localDate(date) === value && Number(value.slice(0, 4)) >= 1900;
  }

  function validTransaction(item) {
    return item && typeof item.id === ''string'' && item.id.length > 0 &&
      (item.type === ''income'' || item.type === ''expense'') &&
      categories[item.type].includes(item.category) &&
      Number.isFinite(item.amount) && item.amount > 0 && item.amount <= 999999999.99 &&
      Math.abs(item.amount * 100 - Math.round(item.amount * 100)) < 0.0001 &&
      validDate(item.date) && typeof item.note === ''string'' && item.note.length <= 200 &&
      typeof item.createdAt === ''string'' && Number.isFinite(Date.parse(item.createdAt));
  }

  function getAll() {
    lastError = '''';
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw === null) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || !data.every(validTransaction) ||
        new Set(data.map(item => item.id)).size !== data.length) {
        throw new Error(''invalid-data'');
      }
      return data.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      lastError = error.message === ''invalid-data'' || error instanceof SyntaxError
        ? ''ข้อมูลที่บันทึกไว้มีรูปแบบไม่ถูกต้อง จึงหยุดอ่านและเขียนเพื่อป้องกันข้อมูลเดิมถูกทับ''
        : ''เบราว์เซอร์ไม่อนุญาตให้เข้าถึงข้อมูล กรุณาเปิดเว็บในหน้าต่างปกติและอนุญาตพื้นที่จัดเก็บ'';
      return [];
    }
  }

  function write(items) {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(items));
      lastError = '''';
    } catch (error) {
      lastError = ''บันทึกไม่สำเร็จ พื้นที่จัดเก็บอาจเต็มหรือถูกบล็อก กรุณาตรวจสอบการตั้งค่าเบราว์เซอร์'';
      throw new Error(lastError);
    }
  }

  function add(input) {
    const items = getAll();
    if (lastError) throw new Error(lastError);
    const item = {
      id: globalThis.crypto && typeof globalThis.crypto.randomUUID === ''function''
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      type: input.type,
      amount: input.amount,
      category: input.category,
      date: input.date,
      note: String(input.note || '''').trim(),
      createdAt: new Date().toISOString()
    };
    if (!validTransaction(item)) throw new Error(''กรุณาตรวจสอบจำนวนเงิน หมวดหมู่ วันที่ และความยาวโน้ต'');
    items.push(item);
    write(items);
    return item;
  }

  function remove(id) {
    const items = getAll();
    if (lastError) throw new Error(lastError);
    if (!items.some(item => item.id === id)) throw new Error(''ไม่พบรายการนี้ อาจถูกลบจากหน้าต่างอื่นแล้ว'');
    write(items.filter(item => item.id !== id));
  }

  function getTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      return theme === ''dark'' || theme === ''light'' ? theme : null;
    } catch (error) {
      return null;
    }
  }

  function setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
      return true;
    } catch (error) {
      return false;
    }
  }

  window.BudgetStore = Object.freeze({
    getAll, add, remove, getTheme, setTheme, localDate, validDate, categories,
    getLastError: () => lastError,
    dataKey: DATA_KEY,
    themeKey: THEME_KEY
  });
})();
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'script.js','(function () {
  ''use strict'';

  const store = window.BudgetStore;
  const page = document.body.dataset.page;
  const $ = selector => document.querySelector(selector);
  const moneyFormatter = new Intl.NumberFormat(''th-TH'', { style: ''currency'', currency: ''THB'', minimumFractionDigits: 2 });
  const dateFormatter = new Intl.DateTimeFormat(''th-TH'', { day: ''numeric'', month: ''short'', year: ''2-digit'' });
  const monthFormatter = new Intl.DateTimeFormat(''th-TH'', { month: ''long'', year: ''numeric'' });
  const money = value => moneyFormatter.format(value === 0 ? 0 : value);
  const escapeHTML = value => String(value).replace(/[&<>"'']/g, char => ({ ''&'': ''&amp;'', ''<'': ''&lt;'', ''>'': ''&gt;'', ''"'': ''&quot;'', "''": ''&#39;'' }[char]));
  const sum = (items, type) => items.filter(item => item.type === type).reduce((total, item) => total + Math.round(item.amount * 100), 0) / 100;
  const dateText = value => dateFormatter.format(new Date(`${value}T12:00:00`));

  const paths = {
    wallet: ''<path d="M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6"/><path d="M20 12h-5v4h5"/><path d="M16 14h.01"/>'',
    grid: ''<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'',
    plus: ''<path d="M12 5v14M5 12h14"/>'',
    history: ''<path d="M3 11a9 9 0 1 1 2.5 7.2M3 4v7h7"/><path d="M12 7v5l3 2"/>'',
    moon: ''<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>'',
    sun: ''<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'',
    ''down-left'': ''<path d="M18 6 6 18M6 6v12h12"/>'',
    ''up-right'': ''<path d="M6 18 18 6M6 6h12v12"/>'',
    ''arrow-right'': ''<path d="M4 12h16m-6-6 6 6-6 6"/>'',
    leaf: ''<path d="M20 3C10 2 3 6 4 13c1 7 12 10 16-10Z"/><path d="M3 21 14 10m-5 5v-5m0 5h5"/>'',
    shield: ''<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'',
    sparkles: ''<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>'',
    edit: ''<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>'',
    check: ''<path d="m5 12 4 4L19 6"/>'',
    download: ''<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'',
    search: ''<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>'',
    trash: ''<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'',
    food: ''<path d="M5 3v7m4-7v7M3 3v5a4 4 0 0 0 8 0V3M7 12v9M19 3c-4 3-4 9 0 9V3Zm0 9v9"/>'',
    bag: ''<path d="M5 7h14l2 14H3L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>'',
    travel: ''<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10h14M8 18v3m8-3v3M8 14h.01M16 14h.01M9 6h6"/>'',
    home: ''<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>'',
    heart: ''<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>''
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.wallet}</svg>`;
  }

  function paintIcons(root = document) {
    root.querySelectorAll(''[data-icon]'').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  }

  function categoryIcon(item) {
    if (item.type === ''income'') return ''wallet'';
    return ({
      ''อาหารและเครื่องดื่ม'': ''food'', ''เดินทาง'': ''travel'', ''ช้อปปิ้ง'': ''bag'',
      ''ที่พักและบิล'': ''home'', ''สุขภาพ'': ''heart'', ''การศึกษา'': ''edit'', ''บันเทิง'': ''sparkles''
    })[item.category] || ''wallet'';
  }

  const navigation = [
    [''dashboard'', ''index.html'', ''grid'', ''ภาพรวม''],
    [''add'', ''add.html'', ''plus'', ''เพิ่มรายการ''],
    [''history'', ''history.html'', ''history'', ''ประวัติรายการ'']
  ];
  $(''[data-shell]'').innerHTML = `
    <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหา</a>
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="index.html"><span class="brand-symbol">${icon(''wallet'')}</span><span>งบเงินฉัน<small>พื้นที่เล็ก ๆ ของเงินคุณ</small></span></a>
      <div class="header-right"><span class="header-tagline">จัดการเงินวันนี้ เพื่อพรุ่งนี้ที่ดีกว่า</span><button type="button" class="theme-toggle" id="theme-toggle" aria-label="เปลี่ยนโหมดสี"></button><span class="avatar" aria-hidden="true">ฉัน</span></div>
    </div></header>
    <nav class="bottom-nav" aria-label="เมนูหลัก">${navigation.map(([id, href, symbol, label]) => `<a href="${href}" class="${page === id ? ''active'' : ''''}" ${page === id ? ''aria-current="page"'' : ''''}>${icon(symbol)}<span>${label}</span></a>`).join('''')}</nav>`;
  $(''main'').id = ''main-content'';
  paintIcons();

  const colorScheme = window.matchMedia(''(prefers-color-scheme: dark)'');
  let explicitTheme = store.getTheme();
  function applyTheme() {
    const dark = explicitTheme ? explicitTheme === ''dark'' : colorScheme.matches;
    document.documentElement.dataset.theme = dark ? ''dark'' : ''light'';
    $(''#theme-toggle'').innerHTML = icon(dark ? ''sun'' : ''moon'');
    $(''#theme-toggle'').setAttribute(''aria-label'', dark ? ''เปลี่ยนเป็นโหมดสว่าง'' : ''เปลี่ยนเป็นโหมดมืด'');
    $(''#theme-toggle'').title = dark ? ''โหมดสว่าง'' : ''โหมดมืด'';
    if (page === ''dashboard'' && dashboardItems) drawChart(dashboardItems);
  }
  let dashboardItems = null;
  applyTheme();
  $(''#theme-toggle'').addEventListener(''click'', () => {
    explicitTheme = document.documentElement.dataset.theme === ''dark'' ? ''light'' : ''dark'';
    store.setTheme(explicitTheme);
    applyTheme();
  });
  colorScheme.addEventListener(''change'', applyTheme);

  function showStorageNotice() {
    const notice = $(''#storage-notice'');
    notice.textContent = store.getLastError();
    notice.hidden = !store.getLastError();
  }

  function emptyState(title, description, addLink = true) {
    return `<div class="empty-state"><span class="empty-icon">${icon(''wallet'')}</span><h3>${title}</h3><p>${description}</p>${addLink ? ''<a href="add.html" class="text-link">เริ่มบันทึกรายการแรก '' + icon(''arrow-right'') + ''</a>'' : ''''}</div>`;
  }

  function transactionMarkup(item) {
    return `<div class="transaction-row">
      <span class="transaction-icon ${item.type === ''income'' ? ''income-bg'' : ''neutral-bg''}">${icon(categoryIcon(item))}</span>
      <div class="transaction-info"><strong>${escapeHTML(item.note || item.category)}</strong><span>${escapeHTML(item.category)} <i>·</i> ${dateText(item.date)}</span></div>
      <div class="transaction-amount"><strong class="${item.type}">${item.type === ''income'' ? ''+'' : ''−''}${money(item.amount)}</strong><span>${item.type === ''income'' ? ''รายรับ'' : ''รายจ่าย''}</span></div>
    </div>`;
  }

  function renderDashboard() {
    const items = store.getAll();
    dashboardItems = items;
    showStorageNotice();
    const now = new Date();
    const currentMonth = store.localDate(now).slice(0, 7);
    const monthly = items.filter(item => item.date.startsWith(currentMonth));
    const income = sum(monthly, ''income'');
    const expense = sum(monthly, ''expense'');
    $(''#today-label'').textContent = `ค่อย ๆ เติบโตไปด้วยกัน · ${new Intl.DateTimeFormat(''th-TH'', { weekday: ''long'', day: ''numeric'', month: ''long'', year: ''numeric'' }).format(now)}`;
    $(''#balance'').textContent = money(sum(items, ''income'') - sum(items, ''expense''));
    $(''#month-income'').textContent = money(income);
    $(''#month-expense'').textContent = money(expense);
    $(''#income-count'').textContent = `${monthly.filter(item => item.type === ''income'').length} รายการ`;
    $(''#expense-count'').textContent = `${monthly.filter(item => item.type === ''expense'').length} รายการ`;
    $(''#month-label'').textContent = monthFormatter.format(now);
    $(''#month-net'').textContent = money(income - expense);
    $(''#month-net'').classList.toggle(''expense'', expense > income);
    const ratio = income ? Math.min(expense / income * 100, 100) : expense ? 100 : 0;
    $(''#spending-bar'').style.width = `${ratio}%`;
    $(''#spending-bar'').classList.toggle(''over-budget'', expense > income);
    $(''#spending-caption'').textContent = income
      ? `ใช้ไปแล้ว ${Math.round(expense / income * 100).toLocaleString(''th-TH'')}% ของรายรับเดือนนี้`
      : expense ? ''เดือนนี้มีรายจ่าย แต่ยังไม่มีบันทึกรายรับ'' : ''เริ่มบันทึกเพื่อดูภาพรวมของเดือนนี้'';
    $(''#recent-list'').innerHTML = items.length
      ? items.slice(0, 5).map(transactionMarkup).join('''')
      : emptyState(''เรื่องราวการเงินของคุณเริ่มตรงนี้'', ''ยังไม่มีรายการ ลองจดรายรับหรือรายจ่ายแรกของวันนี้'');
    drawChart(items);
  }

  function drawChart(items) {
    const canvas = $(''#weekly-chart'');
    if (!canvas) return;
    const width = canvas.parentElement.clientWidth;
    if (!width) return;
    const height = 246;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext(''2d'');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const css = getComputedStyle(document.documentElement);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const key = store.localDate(date);
      const daily = items.filter(item => item.date === key);
      return { key, date, income: sum(daily, ''income''), expense: sum(daily, ''expense'') };
    });
    const maximum = Math.max(...days.flatMap(day => [day.income, day.expense]), 100);
    const rawStep = maximum / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = Math.ceil(rawStep / magnitude) * magnitude;
    const ceiling = step * 4;
    const left = width < 400 ? 49 : 64;
    const right = 10;
    const top = 16;
    const bottom = 39;
    const plotHeight = height - top - bottom;
    const plotWidth = width - left - right;
    ctx.font = ''11px system-ui, sans-serif'';
    ctx.textBaseline = ''middle'';
    for (let line = 0; line <= 4; line++) {
      const y = top + plotHeight - line / 4 * plotHeight;
      ctx.strokeStyle = css.getPropertyValue(''--line'').trim();
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css.getPropertyValue(''--muted'').trim();
      ctx.textAlign = ''right'';
      const value = line * step;
      const label = value >= 1000000 ? `${+(value / 1000000).toFixed(1)}M`
        : value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : `${+value.toFixed(2)}`;
      ctx.fillText(label, left - 10, y);
    }
    const slot = plotWidth / 7;
    const barWidth = Math.max(3, Math.min(18, slot * 0.25));
    days.forEach((day, index) => {
      const center = left + slot * (index + 0.5);
      [''income'', ''expense''].forEach((type, series) => {
        const barHeight = day[type] / ceiling * plotHeight;
        if (!barHeight) return;
        const x = center + (series === 0 ? -barWidth - 2 : 2);
        const y = top + plotHeight - barHeight;
        ctx.fillStyle = css.getPropertyValue(type === ''income'' ? ''--chart-income'' : ''--chart-expense'').trim();
        ctx.beginPath();
        if (typeof ctx.roundRect === ''function'') ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        else ctx.rect(x, y, barWidth, barHeight);
        ctx.fill();
      });
      ctx.textAlign = ''center'';
      ctx.fillStyle = css.getPropertyValue(index === 6 ? ''--text'' : ''--muted'').trim();
      ctx.fillText(index === 6 ? ''วันนี้'' : new Intl.DateTimeFormat(''th-TH'', { weekday: ''short'' }).format(day.date), center, height - 17);
    });
    const weeklyIncome = days.reduce((total, day) => total + Math.round(day.income * 100), 0) / 100;
    const weeklyExpense = days.reduce((total, day) => total + Math.round(day.expense * 100), 0) / 100;
    const description = `7 วันล่าสุด: รายรับ ${money(weeklyIncome)} · รายจ่าย ${money(weeklyExpense)}`;
    canvas.setAttribute(''aria-label'', description + '' '' + days.map(day => `${dateText(day.key)} รายรับ ${money(day.income)} รายจ่าย ${money(day.expense)}`).join('' / ''));
    $(''#chart-caption'').textContent = description;
  }

  function initAdd() {
    store.getAll();
    showStorageNotice();
    const form = $(''#transaction-form'');
    $(''#date'').value = store.localDate();
    function updateCategories() {
      const type = form.elements.type.value;
      $(''#category'').innerHTML = ''<option value="">เลือกหมวดหมู่</option>'' +
        store.categories[type].map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('''');
    }
    updateCategories();
    form.querySelectorAll(''[name="type"]'').forEach(input => input.addEventListener(''change'', updateCategories));
    $(''#note'').addEventListener(''input'', () => { $(''#note-count'').textContent = `${$(''#note'').value.length} / 200 ตัวอักษร`; });
    form.addEventListener(''input'', event => {
      if (event.target.id && $(`#${event.target.id}-error`)) {
        $(`#${event.target.id}-error`).textContent = '''';
        event.target.removeAttribute(''aria-invalid'');
      }
      $(''#form-message'').hidden = true;
    });
    form.addEventListener(''submit'', event => {
      event.preventDefault();
      const rawAmount = $(''#amount'').value.trim();
      const amount = Number(rawAmount);
      const type = form.elements.type.value;
      const category = $(''#category'').value;
      const date = $(''#date'').value;
      const errors = {
        amount: !rawAmount || !Number.isFinite(amount) || amount <= 0 || amount > 999999999.99 || !/^\d+(\.\d{1,2})?$/.test(rawAmount)
          ? ''กรอกจำนวนเงิน 0.01–999,999,999.99 บาท และทศนิยมไม่เกิน 2 ตำแหน่ง'' : '''',
        category: !store.categories[type].includes(category) ? ''กรุณาเลือกหมวดหมู่'' : '''',
        date: !store.validDate(date) ? ''กรุณาเลือกวันที่ที่ถูกต้อง ตั้งแต่ปี ค.ศ. 1900'' : ''''
      };
      let firstInvalid = null;
      Object.entries(errors).forEach(([field, message]) => {
        $(`#${field}-error`).textContent = message;
        $(`#${field}`).setAttribute(''aria-invalid'', String(Boolean(message)));
        if (message && !firstInvalid) firstInvalid = $(`#${field}`);
      });
      if (firstInvalid) { firstInvalid.focus(); return; }
      const message = $(''#form-message'');
      try {
        store.add({ type, amount: Math.round(amount * 100) / 100, category, date, note: $(''#note'').value });
        form.reset();
        form.elements.type.value = type;
        updateCategories();
        $(''#date'').value = store.localDate();
        $(''#note-count'').textContent = ''0 / 200 ตัวอักษร'';
        message.className = ''form-message success-message'';
        message.innerHTML = `${icon(''check'')}<span>บันทึก ${money(amount)} เรียบร้อยแล้ว <a href="history.html">ดูรายการ</a> หรือเพิ่มรายการต่อได้เลย</span>`;
        showStorageNotice();
      } catch (error) {
        message.className = ''form-message error-message'';
        message.textContent = error.message;
        showStorageNotice();
      }
      message.hidden = false;
      message.focus();
    });
  }

  let historyItems = [];
  let filteredItems = [];
  let pendingDelete = null;

  function refreshHistory() {
    historyItems = store.getAll();
    showStorageNotice();
    const categorySelect = $(''#filter-category'');
    const monthSelect = $(''#filter-month'');
    const selectedCategory = categorySelect.value;
    const selectedMonth = monthSelect.value;
    categorySelect.innerHTML = ''<option value="">ทุกหมวดหมู่</option>'' +
      [...new Set([...store.categories.expense, ...store.categories.income])].map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('''');
    const months = [...new Set(historyItems.map(item => item.date.slice(0, 7)))].sort().reverse();
    monthSelect.innerHTML = ''<option value="">ทุกเดือน</option>'' +
      months.map(month => `<option value="${month}">${monthFormatter.format(new Date(`${month}-01T12:00:00`))}</option>`).join('''');
    categorySelect.value = selectedCategory;
    if (months.includes(selectedMonth)) monthSelect.value = selectedMonth;
    renderHistory();
  }

  function renderHistory() {
    const query = $(''#search'').value.trim().toLocaleLowerCase(''th-TH'');
    const category = $(''#filter-category'').value;
    const month = $(''#filter-month'').value;
    filteredItems = historyItems.filter(item =>
      (!category || item.category === category) &&
      (!month || item.date.startsWith(month)) &&
      (!query || `${item.note} ${item.category} ${item.amount} ${money(item.amount)} ${item.date} ${item.type === ''income'' ? ''รายรับ'' : ''รายจ่าย''}`.toLocaleLowerCase(''th-TH'').includes(query))
    );
    $(''#result-count'').textContent = `${filteredItems.length.toLocaleString(''th-TH'')} จาก ${historyItems.length.toLocaleString(''th-TH'')} รายการ · เรียงจากวันที่ล่าสุด`;
    const income = sum(filteredItems, ''income'');
    const expense = sum(filteredItems, ''expense'');
    $(''#filtered-income'').textContent = money(income);
    $(''#filtered-expense'').textContent = money(expense);
    $(''#filtered-net'').textContent = money(income - expense);
    $(''#history-body'').innerHTML = filteredItems.map(item => `<tr>
      <td><div class="table-item"><span class="transaction-icon ${item.type === ''income'' ? ''income-bg'' : ''neutral-bg''}">${icon(categoryIcon(item))}</span><div><strong>${escapeHTML(item.note || item.category)}</strong><span>${escapeHTML(item.category)}</span></div></div></td>
      <td class="date-cell">${dateText(item.date)}</td>
      <td><span class="type-badge ${item.type === ''income'' ? ''income-bg'' : ''expense-bg''}">${item.type === ''income'' ? ''รายรับ'' : ''รายจ่าย''}</span></td>
      <td class="align-right amount-cell ${item.type}">${item.type === ''income'' ? ''+'' : ''−''}${money(item.amount)}</td>
      <td class="align-right"><button class="delete-button" type="button" data-delete="${escapeHTML(item.id)}" aria-label="ลบ ${escapeHTML(item.note || item.category)} ${escapeHTML(money(item.amount))}">${icon(''trash'')}</button></td>
    </tr>`).join('''');
    const empty = $(''#history-empty'');
    empty.hidden = filteredItems.length > 0;
    empty.innerHTML = historyItems.length
      ? emptyState(''ยังไม่พบรายการที่ค้นหา'', ''ลองเปลี่ยนคำค้น หมวดหมู่ หรือเดือนที่เลือก'', false)
      : emptyState(''ยังไม่มีบันทึกการเงิน'', ''เริ่มต้นจากรายการเล็ก ๆ แล้วกลับมาดูเรื่องราวของคุณ'');
    $(''#export-csv'').disabled = filteredItems.length === 0;
  }

  function historyMessage(text, error = false) {
    const message = $(''#history-message'');
    message.textContent = text;
    message.className = `form-message ${error ? ''error-message'' : ''success-message''}`;
    message.hidden = false;
  }

  function exportCSV() {
    if (!filteredItems.length) return;
    const safeCell = value => {
      let text = String(value);
      if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "''" + text;
      return `"${text.replace(/"/g, ''""'')}"`;
    };
    const rows = [
      [''วันที่ (ค.ศ.)'', ''ประเภท'', ''หมวดหมู่'', ''จำนวนเงิน (บาท)'', ''โน้ต''],
      ...filteredItems.map(item => [item.date, item.type === ''income'' ? ''รายรับ'' : ''รายจ่าย'', item.category, item.amount.toFixed(2), item.note])
    ];
    let url;
    try {
      const csv = ''\uFEFF'' + rows.map(row => row.map(safeCell).join('','')).join(''\r\n'');
      url = URL.createObjectURL(new Blob([csv], { type: ''text/csv;charset=utf-8;'' }));
      const anchor = document.createElement(''a'');
      anchor.href = url;
      anchor.download = `งบเงินฉัน-${store.localDate()}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      historyMessage(`เตรียมไฟล์ CSV แล้ว ${filteredItems.length} รายการ หากไม่พบไฟล์ กรุณาตรวจสอบรายการดาวน์โหลด`);
    } catch (error) {
      historyMessage(''ส่งออกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ดาวน์โหลดของเบราว์เซอร์'', true);
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  function initHistory() {
    refreshHistory();
    $(''#search'').addEventListener(''input'', renderHistory);
    $(''#filter-category'').addEventListener(''change'', renderHistory);
    $(''#filter-month'').addEventListener(''change'', renderHistory);
    $(''#reset-filters'').addEventListener(''click'', () => {
      $(''#search'').value = '''';
      $(''#filter-category'').value = '''';
      $(''#filter-month'').value = '''';
      renderHistory();
    });
    $(''#export-csv'').addEventListener(''click'', exportCSV);
    const dialog = $(''#delete-dialog'');
    $(''#history-body'').addEventListener(''click'', event => {
      const button = event.target.closest(''[data-delete]'');
      if (!button) return;
      pendingDelete = historyItems.find(item => item.id === button.dataset.delete);
      if (!pendingDelete) return;
      $(''#delete-description'').textContent = `${pendingDelete.note || pendingDelete.category} · ${money(pendingDelete.amount)} · ${dateText(pendingDelete.date)}`;
      dialog.showModal();
      $(''#cancel-delete'').focus();
    });
    $(''#cancel-delete'').addEventListener(''click'', () => dialog.close());
    dialog.addEventListener(''close'', () => { pendingDelete = null; });
    $(''#confirm-delete'').addEventListener(''click'', () => {
      if (!pendingDelete) return;
      try {
        store.remove(pendingDelete.id);
        dialog.close();
        refreshHistory();
        historyMessage(''ลบรายการเรียบร้อยแล้ว'');
      } catch (error) {
        dialog.close();
        refreshHistory();
        historyMessage(error.message, true);
      }
    });
  }

  if (page === ''dashboard'') {
    renderDashboard();
    if (''ResizeObserver'' in window) {
      new ResizeObserver(() => drawChart(dashboardItems || [])).observe($(''.chart-container''));
    } else {
      window.addEventListener(''resize'', () => drawChart(dashboardItems || []));
    }
  }
  if (page === ''add'') initAdd();
  if (page === ''history'') initHistory();

  window.addEventListener(''storage'', event => {
    if (event.key === store.themeKey || event.key === null) {
      explicitTheme = store.getTheme();
      applyTheme();
    }
    if (event.key === store.dataKey || event.key === null) {
      if (page === ''dashboard'') renderDashboard();
      if (page === ''history'') refreshHistory();
      if (page === ''add'') { store.getAll(); showStorageNotice(); }
    }
  });
  window.addEventListener(''pageshow'', event => {
    if (!event.persisted) return;
    if (page === ''dashboard'') renderDashboard();
    if (page === ''history'') refreshHistory();
  });
})();
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) SELECT id,'style.css','@import url(''https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;450;500;550;600;650;700;750&display=swap'');

:root {
  color-scheme: light;
  --bg: #f6f8f5;
  --surface: #ffffff;
  --surface-soft: #f4f7f3;
  --text: #22382f;
  --muted: #7c8980;
  --line: #e9eee7;
  --green: #276b50;
  --green-dark: #174d39;
  --mint: #e9f3e9;
  --income: #32835e;
  --expense: #bd7257;
  --expense-bg: #fbefe7;
  --chart-income: #37785c;
  --chart-expense: #c9d8b3;
  --shadow: 0 6px 24px rgb(35 59 40 / 3%);
  --radius: 20px;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141e19;
  --surface: #1d2a22;
  --surface-soft: #233228;
  --text: #e5eee5;
  --muted: #9aaa9c;
  --line: #304035;
  --green: #9bccac;
  --green-dark: #bdddc5;
  --mint: #2b4231;
  --income: #94cda5;
  --expense: #e4ac8e;
  --expense-bg: #42342c;
  --chart-income: #8cc59a;
  --chart-expense: #697d55;
  --shadow: 0 6px 24px rgb(0 0 0 / 8%);
}
* { box-sizing: border-box; }
html { min-height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: ''Noto Sans Thai'', system-ui, sans-serif; font-size: 14px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
svg { width: 21px; height: 21px; flex-shrink: 0; vertical-align: middle; }
[data-icon] { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
:focus-visible { outline: 3px solid #88b890; outline-offset: 4px; }
[hidden] { display: none !important; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(27px, 3vw, 36px); font-weight: 650; letter-spacing: -1.1px; line-height: 1.5; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -.35px; }
h3 { font-size: 16px; font-weight: 600; }
.muted { color: var(--muted); font-size: 12px; }
.income { color: var(--income); }
.expense { color: var(--expense); }
.income-bg { color: var(--income); background: var(--mint); }
.expense-bg { color: var(--expense); background: var(--expense-bg); }
.neutral-bg { color: var(--green); background: var(--surface-soft); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.skip-link { position: fixed; top: -100px; left: 20px; padding: 12px 20px; background: var(--surface); z-index: 20; }
.skip-link:focus { top: 10px; }
.site-header { height: 91px; border-bottom: 1px solid var(--line); background: var(--surface); }
.header-inner { width: min(1120px, calc(100% - 80px)); height: 100%; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { display: inline-flex; align-items: center; gap: 11px; font-weight: 700; font-size: 21px; letter-spacing: -.5px; line-height: 1.4; }
.brand-symbol { display: grid; place-items: center; background: #276b50; color: #f1f7e9; width: 43px; height: 43px; border-radius: 13px; transform: rotate(-5deg); }
.brand-symbol svg { width: 25px; height: 25px; transform: rotate(5deg); }
.brand small { display: block; color: var(--muted); font-size: 10px; font-weight: 400; letter-spacing: .1px; padding-top: 3px; }
.header-right { display: flex; align-items: center; gap: 19px; }
.header-tagline { color: var(--muted); font-size: 11px; margin-right: 8px; }
.theme-toggle { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 50%; color: var(--muted); background: var(--surface); }
.theme-toggle:hover { color: var(--green); background: var(--mint); }
.avatar { display: grid; place-items: center; background: #eceddf; color: #5c6e4e; width: 35px; height: 35px; border-radius: 50%; font-size: 11px; font-weight: 600; }
.container { max-width: 1120px; margin: 0 auto; padding: 38px 0 125px; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.eyebrow { color: var(--green); letter-spacing: 2.1px; font-size: 9px; font-weight: 650; margin-bottom: 7px; }
.heading-dot { color: #7d9c57; margin-left: 3px; }
.subtitle { color: var(--muted); font-size: 12px; margin-top: 6px; }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 43px; padding: 10px 19px; border: 1px solid transparent; border-radius: 11px; font-size: 12px; font-weight: 550; white-space: nowrap; transition: background .15s, transform .15s; }
.button svg { width: 17px; height: 17px; }
.button:hover { transform: translateY(-1px); }
.button.primary { color: #fff; background: #286b50; box-shadow: 0 4px 8px rgb(25 75 45 / 10%); }
.button.primary:hover { background: #1e573f; }
.button.secondary { color: var(--text); border-color: var(--line); background: var(--surface); }
.button.secondary:hover { background: var(--surface-soft); }
.button.danger { color: #fff; background: #b85849; }
.summary-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 19px; margin-bottom: 23px; }
.balance-card { background: #214e3b; border-radius: var(--radius); color: #fff; padding: 26px 28px 22px; position: relative; overflow: hidden; min-height: 207px; }
.card-label { display: flex; align-items: center; gap: 9px; font-size: 12px; color: #dce9dc; position: relative; z-index: 1; }
.card-label svg { width: 18px; height: 18px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #b0d39b; margin-left: auto; box-shadow: 0 0 0 5px rgb(189 218 167 / 8%); }
.balance-amount { position: relative; z-index: 1; font-size: clamp(28px, 3.2vw, 38px); font-weight: 550; line-height: 1.5; letter-spacing: -1px; margin: 14px 0 18px; overflow-wrap: anywhere; }
.balance-footer { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #b8cdbc; font-size: 10px; }
.small-tag { font-size: 9px; letter-spacing: 1px; border: 1px solid #59755d; padding: 1px 8px; border-radius: 5px; color: #d5e4cd; }
.balance-decoration { width: 220px; height: 220px; border-radius: 50%; border: 28px solid rgb(196 218 168 / 5%); position: absolute; right: -62px; top: 20px; box-shadow: 0 0 0 24px rgb(196 218 168 / 3%), 0 0 0 48px rgb(196 218 168 / 2%); }
.metric-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 23px 24px 18px; box-shadow: var(--shadow); }
.metric-icon { width: 35px; height: 35px; border-radius: 11px; margin-bottom: 12px; }
.metric-icon svg { width: 19px; height: 19px; }
.metric-value { font-size: clamp(22px, 2.4vw, 29px); font-weight: 550; letter-spacing: -.7px; margin-top: 3px; overflow-wrap: anywhere; }
.metric-foot { display: flex; gap: 10px; justify-content: space-between; font-size: 10px; color: var(--muted); margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.dashboard-grid { display: grid; grid-template-columns: 1.95fr 1fr; gap: 23px; margin-bottom: 23px; }
.panel { padding: 25px 27px; border: 1px solid var(--line); background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); min-width: 0; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 20px; }
.section-heading .muted { margin-top: 3px; font-size: 11px; }
.period-badge { background: var(--surface-soft); color: var(--muted); padding: 5px 11px; border-radius: 7px; font-size: 10px; white-space: nowrap; }
.chart-legend { display: flex; gap: 17px; align-items: center; font-size: 10px; color: var(--muted); margin-bottom: 3px; }
.chart-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot { height: 7px; width: 7px; border-radius: 2px; }
.income-dot { background: var(--chart-income); }
.expense-dot { background: var(--chart-expense); }
.chart-unit { margin-left: auto; font-size: 9px; }
.chart-container { width: 100%; min-width: 0; height: 246px; }
canvas { display: block; width: 100%; }
.chart-caption { color: var(--muted); text-align: center; font-size: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
.month-panel .section-heading { margin-bottom: 3px; }
.soft-icon { color: #8b9d70; }
.saving-label { font-size: 11px; color: var(--muted); margin-top: 30px; }
.saving-amount { color: var(--green); font-size: 30px; font-weight: 550; margin: 3px 0 17px; letter-spacing: -.9px; overflow-wrap: anywhere; }
.saving-amount.expense { color: var(--expense); }
.budget-track { height: 7px; border-radius: 10px; background: var(--surface-soft); overflow: hidden; }
.budget-track span { height: 100%; display: block; border-radius: inherit; background: #86a870; min-width: 0; }
.budget-track span.over-budget { background: var(--expense); }
.spending-caption { color: var(--muted); font-size: 10px; margin-top: 10px; }
.tip-box { display: flex; align-items: center; gap: 11px; padding: 15px 13px; border-radius: 12px; background: var(--surface-soft); margin-top: 23px; color: var(--green); font-size: 10px; line-height: 1.85; }
.tip-box > span { align-self: flex-start; padding-top: 3px; }
.tip-box strong { font-weight: 500; }
.recent-panel { padding-bottom: 13px; }
.text-link { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; color: var(--green); font-weight: 550; white-space: nowrap; }
.text-link svg { width: 15px; height: 15px; }
.text-link:hover { text-decoration: underline; }
.transaction-row { display: flex; align-items: center; gap: 13px; padding: 14px 0; border-top: 1px solid var(--line); }
.transaction-icon { display: inline-flex; align-items: center; justify-content: center; width: 39px; height: 39px; border-radius: 12px; flex-shrink: 0; }
.transaction-icon svg { width: 19px; height: 19px; }
.transaction-info { min-width: 0; }
.transaction-info strong { display: block; font-size: 12px; font-weight: 550; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.transaction-info > span { font-size: 10px; color: var(--muted); }
.transaction-info i { font-style: normal; margin: 0 5px; }
.transaction-amount { margin-left: auto; text-align: right; flex-shrink: 0; }
.transaction-amount strong { display: block; font-size: 13px; font-weight: 600; }
.transaction-amount > span { font-size: 9px; color: var(--muted); }
.empty-state { text-align: center; padding: 36px 16px 30px; }
.empty-icon { display: inline-grid; place-items: center; width: 54px; height: 54px; border-radius: 18px; background: var(--mint); color: var(--green); margin-bottom: 12px; }
.empty-icon svg { width: 25px; height: 25px; }
.empty-state p { color: var(--muted); font-size: 12px; margin-top: 7px; }
.empty-state a { margin-top: 15px; }
.page-footer { display: flex; justify-content: center; align-items: center; gap: 6px; color: var(--muted); font-size: 10px; padding-top: 25px; text-align: center; }
.page-footer svg { width: 13px; height: 13px; }
.bottom-nav { position: fixed; z-index: 10; bottom: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; background: var(--surface); border: 1px solid var(--line); padding: 7px; border-radius: 18px; box-shadow: 0 7px 32px rgb(32 59 40 / 12%); }
.bottom-nav a { min-width: 122px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 17px; border-radius: 12px; color: var(--muted); font-size: 12px; }
.bottom-nav a svg { width: 18px; height: 18px; }
.bottom-nav a:hover { background: var(--surface-soft); color: var(--green); }
.bottom-nav a.active { background: var(--mint); color: var(--green); font-weight: 600; }
.notice { border: 1px solid #d8b98c; background: var(--expense-bg); color: var(--expense); padding: 14px 18px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; }
.form-layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; align-items: start; }
.form-panel { padding: 29px 32px; }
.form-panel .section-heading { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 24px; }
.type-fieldset { border: 0; padding: 0; margin: 0 0 23px; }
.type-fieldset legend, .field label { display: block; font-size: 12px; font-weight: 550; margin-bottom: 8px; }
.type-picker { display: flex; gap: 10px; }
.type-picker label { flex: 1; cursor: pointer; position: relative; }
.type-picker input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.type-picker label > span { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 1px solid var(--line); color: var(--muted); border-radius: 11px; background: var(--surface); font-size: 12px; }
.type-picker input:checked + span { background: var(--expense-bg); border-color: var(--expense); color: var(--expense); }
.type-picker input[value="income"]:checked + span { background: var(--mint); border-color: var(--income); color: var(--income); }
.type-picker input:focus-visible + span { outline: 3px solid #88b890; outline-offset: 3px; }
.type-picker svg { width: 17px; height: 17px; }
.field { margin-bottom: 20px; min-width: 0; }
.required { color: var(--expense); }
.optional { font-size: 10px; color: var(--muted); font-weight: 400; margin-left: 6px; }
input, select, textarea { width: 100%; border: 1px solid var(--line); color: var(--text); background: var(--surface); padding: 11px 13px; min-height: 44px; border-radius: 10px; font-size: 12px; }
input::placeholder, textarea::placeholder { color: var(--muted); opacity: .75; }
input:hover, select:hover, textarea:hover { border-color: #9faf98; }
input[aria-invalid="true"], select[aria-invalid="true"] { border-color: var(--expense); }
textarea { resize: vertical; min-height: 100px; }
.amount-input { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 7px 18px; background: var(--surface-soft); color: var(--muted); font-size: 24px; }
.amount-input:focus-within { outline: 2px solid #88b890; }
.amount-input input { border: 0; outline: none; background: transparent; font-size: 32px; font-weight: 500; min-width: 0; padding: 7px 12px; box-shadow: none; }
.amount-input input:focus-visible { outline: none; }
.currency-label { font-size: 11px; letter-spacing: 1px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.field-error { display: block; color: var(--expense); font-size: 10px; margin-top: 5px; }
.field-error:empty { display: none; }
.input-hint { display: block; text-align: right; font-size: 10px; color: var(--muted); }
.form-actions { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid var(--line); padding-top: 23px; margin-top: 23px; }
.form-message { margin: 15px 0; padding: 13px 16px; border-radius: 11px; font-size: 12px; display: flex; gap: 8px; align-items: flex-start; overflow-wrap: anywhere; }
.form-message a { text-decoration: underline; font-weight: 600; }
.success-message { background: var(--mint); color: var(--income); }
.error-message { background: var(--expense-bg); color: var(--expense); }
.form-aside { padding: 36px 22px; }
.aside-art { position: relative; background: var(--mint); width: 118px; height: 118px; border-radius: 35px; display: grid; place-items: center; margin: 9px 0 31px; transform: rotate(-7deg); }
.aside-art > span:first-child { color: var(--green); transform: rotate(7deg); }
.aside-art svg { width: 62px; height: 62px; stroke-width: 1.1; }
.art-dot { position: absolute; border-radius: 50%; background: #cad8b0; }
.dot-one { width: 14px; height: 14px; right: -17px; top: 3px; }
.dot-two { width: 8px; height: 8px; left: -15px; bottom: 3px; }
.form-aside h2 { font-size: 26px; line-height: 1.6; margin: 12px 0 17px; letter-spacing: -.7px; }
.form-aside > .muted { font-size: 12px; line-height: 2; max-width: 280px; }
.aside-note { display: flex; gap: 11px; align-items: flex-start; margin-top: 35px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; line-height: 1.9; }
.aside-note svg { width: 19px; height: 19px; }
.filters { display: grid; grid-template-columns: minmax(180px, 1fr) 180px 174px auto; gap: 12px; margin: 23px 0 20px; align-items: center; }
.search-field { position: relative; }
.search-field > span { position: absolute; top: 13px; left: 13px; color: var(--muted); pointer-events: none; }
.search-field svg { width: 17px; height: 17px; }
.search-field input { padding-left: 39px; }
.reset-button { color: var(--muted); background: none; border: 0; padding: 10px 0 10px 3px; font-size: 11px; white-space: nowrap; }
.reset-button:hover { color: var(--green); text-decoration: underline; }
.history-totals { display: flex; gap: 25px; flex-wrap: wrap; border-top: 1px solid var(--line); padding: 16px 0; font-size: 11px; color: var(--muted); }
.history-totals strong { font-size: 12px; font-weight: 600; margin-left: 7px; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead { background: var(--surface-soft); }
th { color: var(--muted); font-size: 10px; font-weight: 500; text-align: left; padding: 13px 15px; white-space: nowrap; }
th:first-child { border-radius: 8px 0 0 8px; }
th:last-child { border-radius: 0 8px 8px 0; }
td { padding: 17px 15px; border-bottom: 1px solid var(--line); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--surface-soft); }
.table-item { display: flex; align-items: center; gap: 12px; min-width: 210px; max-width: 360px; }
.table-item > div { min-width: 0; }
.table-item strong { display: block; font-weight: 550; overflow-wrap: anywhere; }
.table-item > div > span { display: block; font-size: 10px; color: var(--muted); margin-top: 2px; }
.date-cell { white-space: nowrap; color: var(--muted); font-size: 11px; }
.align-right { text-align: right; }
.amount-cell { white-space: nowrap; font-weight: 600; }
.type-badge { font-size: 10px; padding: 4px 10px; border-radius: 6px; white-space: nowrap; }
.delete-button { display: inline-grid; place-items: center; background: transparent; color: var(--muted); border: 0; border-radius: 8px; width: 35px; height: 35px; }
.delete-button svg { width: 16px; height: 16px; }
.delete-button:hover { color: var(--expense); background: var(--expense-bg); }
.table-footnote { color: var(--muted); font-size: 10px; padding-top: 17px; border-top: 1px solid var(--line); margin-top: 5px; }
dialog { width: min(420px, calc(100% - 32px)); padding: 29px; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 20px 80px rgb(0 0 0 / 20%); }
dialog::backdrop { background: rgb(12 28 19 / 50%); backdrop-filter: blur(3px); }
.dialog-icon { width: 44px; height: 44px; border-radius: 13px; color: var(--expense); background: var(--expense-bg); margin-bottom: 18px; }
dialog h2 { margin-bottom: 10px; }
dialog p { margin-top: 8px; overflow-wrap: anywhere; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 26px; }
@media (min-width: 1500px) {
  .container { padding-top: 50px; }
  .page-heading { margin-bottom: 34px; }
}
@media (max-width: 1200px) {
  .container { margin: 0 40px; }
  .filters { grid-template-columns: minmax(150px, 1fr) 160px 155px; }
  .reset-button { grid-column: 3; justify-self: end; padding-top: 0; }
}
@media (max-width: 900px) {
  .container { margin: 0 25px; padding-top: 28px; }
  .header-inner { width: calc(100% - 50px); }
  .summary-grid { grid-template-columns: 1.3fr 1fr 1fr; gap: 12px; }
  .balance-card { padding: 23px 20px; }
  .metric-card { padding: 22px 17px 17px; }
  .dashboard-grid { grid-template-columns: 1.6fr 1fr; gap: 16px; }
  .panel { padding: 22px 20px; }
  .chart-panel .section-heading { align-items: flex-start; }
  .period-badge { display: none; }
  .month-panel h2 { font-size: 15px; }
  .saving-amount { font-size: 25px; }
  .tip-box { padding: 12px 10px; gap: 8px; }
  .form-layout { grid-template-columns: 1.65fr 1fr; gap: 20px; }
  .form-aside { padding: 30px 8px; }
  .form-aside h2 { font-size: 22px; }
  .header-tagline { display: none; }
}
@media (max-width: 680px) {
  .site-header { height: 77px; }
  .header-inner { width: calc(100% - 36px); }
  .brand { font-size: 19px; gap: 9px; }
  .brand-symbol { width: 38px; height: 38px; border-radius: 12px; }
  .brand small { font-size: 9px; }
  .header-right { gap: 11px; }
  .avatar { width: 32px; height: 32px; font-size: 10px; }
  .theme-toggle { width: 32px; height: 32px; }
  .theme-toggle svg { width: 17px; height: 17px; }
  .container { margin: 0 18px; padding-top: 27px; padding-bottom: 120px; }
  .page-heading { align-items: flex-start; gap: 16px; margin-bottom: 25px; }
  h1 { font-size: 26px; letter-spacing: -.7px; }
  .eyebrow { font-size: 8px; letter-spacing: 1.7px; }
  .subtitle { font-size: 11px; }
  .page-heading > .button { padding: 10px 12px; min-height: 38px; font-size: 10px; margin-top: 23px; gap: 4px; }
  .page-heading > .button svg { width: 14px; height: 14px; }
  .page-heading > .text-link { margin-top: 30px; font-size: 10px; }
  .summary-grid { grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 17px; }
  .balance-card { grid-column: 1 / -1; padding: 24px; min-height: 190px; }
  .balance-amount { font-size: 38px; margin: 12px 0 17px; }
  .balance-decoration { width: 250px; height: 250px; right: -35px; top: -10px; }
  .metric-card { padding: 19px 18px 16px; }
  .metric-icon { width: 31px; height: 31px; border-radius: 9px; margin-bottom: 10px; }
  .metric-card > .muted { font-size: 11px; }
  .metric-value { font-size: 24px; }
  .metric-foot { margin-top: 10px; font-size: 9px; padding-top: 10px; }
  .dashboard-grid { grid-template-columns: 1fr; gap: 17px; margin-bottom: 17px; }
  .panel { border-radius: 17px; padding: 21px 19px; }
  h2 { font-size: 16px; }
  .section-heading { margin-bottom: 19px; gap: 10px; }
  .section-heading .muted { font-size: 10px; }
  .period-badge { display: block; font-size: 9px; }
  .chart-legend { font-size: 9px; }
  .chart-caption { font-size: 9px; }
  .month-panel { display: grid; grid-template-columns: 1fr 1fr; column-gap: 15px; }
  .month-panel > .section-heading, .month-panel > .muted { grid-column: 1 / -1; }
  .month-panel .section-heading { margin-bottom: 2px; }
  .saving-label { grid-column: 1; margin-top: 18px; font-size: 10px; }
  .saving-amount { grid-column: 1; font-size: 26px; margin-bottom: 9px; }
  .budget-track { grid-column: 1 / -1; }
  .spending-caption { grid-column: 1 / -1; margin-top: 8px; font-size: 9px; }
  .tip-box { grid-column: 2; grid-row: 3 / 5; margin: 12px 0 17px; font-size: 9px; padding: 12px; align-self: center; }
  .tip-box svg { width: 17px; height: 17px; }
  .recent-panel { padding-bottom: 9px; }
  .transaction-row { gap: 10px; padding: 13px 0; }
  .transaction-info strong { font-size: 11px; }
  .transaction-info > span { font-size: 9px; }
  .transaction-info i { margin: 0 2px; }
  .transaction-amount strong { font-size: 12px; }
  .transaction-icon { width: 35px; height: 35px; border-radius: 10px; }
  .transaction-icon svg { width: 17px; height: 17px; }
  .text-link { font-size: 10px; }
  .empty-state { padding: 28px 5px; }
  .empty-state h3 { font-size: 14px; }
  .empty-state p { font-size: 11px; }
  .page-footer { font-size: 9px; align-items: flex-start; padding-top: 21px; }
  .bottom-nav { bottom: 0; left: 0; right: 0; transform: none; border-radius: 18px 18px 0 0; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); gap: 8px; justify-content: space-around; border-bottom: 0; box-shadow: 0 -4px 24px rgb(32 59 40 / 6%); }
  .bottom-nav a { min-width: 0; flex: 1; flex-direction: column; gap: 4px; padding: 8px 4px 6px; font-size: 10px; border-radius: 11px; }
  .bottom-nav a svg { width: 20px; height: 20px; }
  .form-layout { grid-template-columns: 1fr; }
  .form-panel { padding: 23px 21px; }
  .form-aside { padding: 8px 10px; display: none; }
  .field-row { gap: 12px; }
  .field-row input, .field-row select { font-size: 11px; padding-left: 10px; padding-right: 8px; }
  .form-actions .button { font-size: 11px; padding: 10px 14px; }
  .history-panel { padding: 20px 16px; }
  .history-panel .section-heading { align-items: flex-start; }
  .export-button { font-size: 10px; padding: 8px 11px; min-height: 37px; }
  .export-button svg { width: 14px; height: 14px; }
  .filters { grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
  .search-field { grid-column: 1 / -1; }
  .filters select { font-size: 11px; }
  .reset-button { grid-column: 1 / -1; padding: 0; font-size: 10px; }
  .history-totals { gap: 10px 17px; font-size: 10px; padding: 13px 0; }
  .history-totals strong { font-size: 11px; margin-left: 3px; }
  .table-scroll { margin-left: -4px; margin-right: -4px; }
  table { min-width: 650px; }
  th, td { padding: 13px 11px; }
  .table-item { min-width: 185px; max-width: 230px; }
  .table-footnote { font-size: 9px; }
}
@media (max-width: 390px) {
  .container { margin: 0 13px; }
  h1 { font-size: 23px; }
  .page-heading { gap: 8px; }
  .metric-value { font-size: 21px; }
  .metric-card { padding-left: 14px; padding-right: 14px; }
  .page-heading > .button { padding: 8px 9px; font-size: 9px; }
  .tip-box { font-size: 8px; padding: 10px; gap: 5px; }
  .month-panel { column-gap: 8px; }
  .saving-amount { font-size: 23px; }
  .field-row { grid-template-columns: 1fr; gap: 0; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; }
}
',1794931200000 FROM projects WHERE slug='ngop-ngern-chan';
