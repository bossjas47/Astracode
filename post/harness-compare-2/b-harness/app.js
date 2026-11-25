/* =========================================================
   ครัวบ้านนก — app.js
   เว็บแอปหน้าเดียว: เมนู · ตะกร้า · จองโต๊ะ · ธีมมืด/สว่าง
   ไม่ใช้ build step เปิดจาก index.html ได้เลย
   ========================================================= */
'use strict';

(function () {

  /* ── ข้อมูลเมนู (8 รายการ) ─────────────────────────────── */
  const MENU = [
    {
      id: 'tom-yum-goong',
      name: 'ต้มยำกุ้ง',
      desc: 'กุ้งสดตัวโต น้ำต้มยำเปรี้ยวเผ็ดหอมตะไคร้',
      category: 'ต้ม',
      price: 180,
      spicy: true
    },
    {
      id: 'tom-kha-gai',
      name: 'ต้มข่าไก่',
      desc: 'น้ำกะทิหอมข่า ไก่ฉีกนุ่ม กลมกล่อม',
      category: 'ต้ม',
      price: 150,
      spicy: false
    },
    {
      id: 'pad-thai',
      name: 'ผัดไทยกุ้งสด',
      desc: 'เส้นจันท์ผัดซอสเข้มข้น กุ้งสด เต้าหู้ ถั่วลิสง',
      category: 'ผัด',
      price: 160,
      spicy: false
    },
    {
      id: 'pad-kra-pao',
      name: 'ผัดกะเพราเนื้อ',
      desc: 'เนื้อสับผัดใบกะเพรา พริกขี้หนู ไข่ดาว',
      category: 'ผัด',
      price: 140,
      spicy: true
    },
    {
      id: 'gaeng-keaw-wan',
      name: 'แกงเขียวหวานไก่',
      desc: 'น้ำแกงเขียวหวานกะทิสด หอมใบโหระพา',
      category: 'แกง',
      price: 170,
      spicy: true
    },
    {
      id: 'panang-moo',
      name: 'พะแนงหมู',
      desc: 'หมูสันคอในซอสพะแนงเข้มข้น โรยใบมะกรูด',
      category: 'แกง',
      price: 165,
      spicy: true
    },
    {
      id: 'khao-niao-mamuang',
      name: 'ข้าวเหนียวมะม่วง',
      desc: 'ข้าวเหนียวมูนกะทิ มะม่วงน้ำดอกไม้สุก',
      category: 'ของหวาน',
      price: 120,
      spicy: false
    },
    {
      id: 'bua-loy',
      name: 'บัวลอยน้ำขิง',
      desc: 'บัวลอยสามสีในน้ำขิงร้อน หอมกลิ่นงา',
      category: 'ของหวาน',
      price: 90,
      spicy: false
    }
  ];

  const CATEGORIES = ['all', 'ต้ม', 'ผัด', 'แกง', 'ของหวาน'];
  const VAT_RATE = 7;

  const KEYS = {
    cart: 'kbn.cart',
    bookings: 'kbn.bookings',
    theme: 'kbn.theme'
  };

  /* ── state ───────────────────────────────────────────── */
  const state = {
    category: 'all',
    query: '',
    cart: {},      // { menuId: จำนวนเต็ม > 0 }
    bookings: []
  };

  /* ── DOM ─────────────────────────────────────────────── */
  const el = {
    menuGrid: document.getElementById('menu-grid'),
    menuEmpty: document.getElementById('menu-empty'),
    search: document.getElementById('search'),
    filterButtons: Array.prototype.slice.call(document.querySelectorAll('.chip[data-cat]')),
    cartList: document.getElementById('cart-list'),
    cartEmpty: document.getElementById('cart-empty'),
    cartCount: document.getElementById('cart-count'),
    subtotal: document.querySelector('[data-testid="subtotal"]'),
    vat: document.querySelector('[data-testid="vat"]'),
    total: document.querySelector('[data-testid="total"]'),
    form: document.getElementById('booking-form'),
    bkName: document.getElementById('bk-name'),
    bkPhone: document.getElementById('bk-phone'),
    bkDate: document.getElementById('bk-date'),
    bkTime: document.getElementById('bk-time'),
    bkGuests: document.getElementById('bk-guests'),
    bookingError: document.getElementById('booking-error'),
    bookingOk: document.getElementById('booking-ok'),
    bookingList: document.getElementById('booking-list'),
    bookingsEmpty: document.getElementById('bookings-empty'),
    themeToggle: document.getElementById('theme-toggle'),
    themeLabel: document.getElementById('theme-label'),
    themeIcon: document.querySelector('#theme-toggle .theme-icon')
  };

  const menuById = {};
  MENU.forEach(function (item) { menuById[item.id] = item; });

  const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  /* ── helpers ─────────────────────────────────────────── */

  function money(satang) {
    return (satang / 100).toFixed(2);
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* โหมดส่วนตัว/พื้นที่เต็ม — ใช้งานต่อได้โดยไม่บันทึก */
    }
  }

  /* แปลง "YYYY-MM-DD" เป็น Date แบบเวลาท้องถิ่น (เลี่ยงปัญหา timezone) */
  function parseDateInput(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function todayAtMidnight() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  function formatThaiDate(value) {
    const date = parseDateInput(value);
    if (!date) return value;
    const day = date.getDate();
    const month = THAI_MONTHS_SHORT[date.getMonth()];
    const beYear = date.getFullYear() + 543;
    return day + ' ' + month + ' ' + beYear;
  }

  /* ── localStorage ────────────────────────────────────── */

  function loadCart() {
    const saved = readJSON(KEYS.cart, {});
    if (!isObject(saved)) return;
    Object.keys(saved).forEach(function (id) {
      const qty = Number(saved[id]);
      if (menuById[id] && Number.isFinite(qty) && qty > 0) {
        state.cart[id] = Math.floor(qty);
      }
    });
  }

  function loadBookings() {
    const saved = readJSON(KEYS.bookings, []);
    if (!Array.isArray(saved)) return;
    state.bookings = saved.filter(function (b) {
      return isObject(b) && typeof b.name === 'string' && typeof b.date === 'string';
    });
  }

  function saveCart() {
    writeJSON(KEYS.cart, state.cart);
  }

  function saveBookings() {
    writeJSON(KEYS.bookings, state.bookings);
  }

  /* ── ตะกร้า: คำนวณเงิน (หน่วยสตางค์) ───────────────────── */

  function cartItems() {
    const items = [];
    Object.keys(state.cart).forEach(function (id) {
      const item = menuById[id];
      const qty = state.cart[id];
      if (item && qty > 0) items.push({ item: item, qty: qty });
    });
    return items;
  }

  function computeTotals() {
    let subtotalSatang = 0;
    cartItems().forEach(function (row) {
      subtotalSatang += Math.round(row.item.price * 100) * row.qty;
    });
    const vatSatang = Math.round(subtotalSatang * VAT_RATE / 100);
    return {
      subtotal: subtotalSatang,
      vat: vatSatang,
      total: subtotalSatang + vatSatang
    };
  }

  function cartCount() {
    let n = 0;
    Object.keys(state.cart).forEach(function (id) { n += state.cart[id]; });
    return n;
  }

  function addToCart(id) {
    if (!menuById[id]) return;
    state.cart[id] = (state.cart[id] || 0) + 1;
    saveCart();
    renderCart();
  }

  function changeQty(id, delta) {
    if (!menuById[id]) return;
    const next = (state.cart[id] || 0) + delta;
    if (next <= 0) {
      delete state.cart[id];
    } else {
      state.cart[id] = next;
    }
    saveCart();
    renderCart();
  }

  /* ── render: เมนู ────────────────────────────────────── */

  function visibleMenu() {
    const q = state.query.trim().toLowerCase();
    return MENU.filter(function (item) {
      const matchCat = state.category === 'all' || item.category === state.category;
      const matchQuery = q === '' || item.name.toLowerCase().indexOf(q) !== -1;
      return matchCat && matchQuery;
    });
  }

  function buildMenuCard(item) {
    const card = document.createElement('article');
    card.className = 'menu-card';
    card.setAttribute('data-testid', 'menu-item');
    card.setAttribute('data-id', item.id);
    card.setAttribute('data-category', item.category);

    const head = document.createElement('div');
    head.className = 'card-head';

    const name = document.createElement('h3');
    name.className = 'menu-name';
    name.textContent = item.name;
    head.appendChild(name);

    const badges = document.createElement('div');
    badges.className = 'badges';

    const catBadge = document.createElement('span');
    catBadge.className = 'badge badge-cat';
    catBadge.textContent = item.category;
    badges.appendChild(catBadge);

    const spicyBadge = document.createElement('span');
    spicyBadge.className = 'badge ' + (item.spicy ? 'badge-spicy' : 'badge-mild');
    spicyBadge.textContent = item.spicy ? '🌶 เผ็ด' : 'ไม่เผ็ด';
    badges.appendChild(spicyBadge);

    const desc = document.createElement('p');
    desc.className = 'menu-desc';
    desc.textContent = item.desc;

    const foot = document.createElement('div');
    foot.className = 'card-foot';

    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = '฿' + item.price.toFixed(2);
    const perPlate = document.createElement('small');
    perPlate.textContent = '/ จาน';
    price.appendChild(perPlate);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add';
    addBtn.setAttribute('data-testid', 'add');
    addBtn.setAttribute('data-add-id', item.id);
    addBtn.setAttribute('aria-label', 'เพิ่ม ' + item.name + ' ลงตะกร้า');
    addBtn.textContent = '＋ เพิ่ม';
    addBtn.addEventListener('click', function () { addToCart(item.id); });

    foot.appendChild(price);
    foot.appendChild(addBtn);

    card.appendChild(head);
    card.appendChild(desc);
    card.appendChild(badges);
    card.appendChild(foot);
    return card;
  }

  function renderMenu() {
    const items = visibleMenu();
    el.menuGrid.textContent = '';
    const frag = document.createDocumentFragment();
    items.forEach(function (item) { frag.appendChild(buildMenuCard(item)); });
    el.menuGrid.appendChild(frag);
    el.menuEmpty.hidden = items.length > 0;
  }

  /* ── render: ตะกร้า ──────────────────────────────────── */

  function buildCartRow(row) {
    const line = document.createElement('div');
    line.className = 'cart-row';
    line.setAttribute('data-testid', 'cart-row');
    line.setAttribute('data-id', row.item.id);

    const info = document.createElement('div');
    info.className = 'cart-info';

    const name = document.createElement('p');
    name.className = 'cart-name';
    name.textContent = row.item.name;

    const unit = document.createElement('span');
    unit.className = 'cart-unit';
    unit.textContent = '฿' + row.item.price.toFixed(2) + ' × ' + row.qty;

    info.appendChild(name);
    info.appendChild(unit);

    const qty = document.createElement('div');
    qty.className = 'qty';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'qty-btn';
    decBtn.setAttribute('data-testid', 'dec');
    decBtn.setAttribute('data-dec-id', row.item.id);
    decBtn.setAttribute('aria-label', 'ลดจำนวน ' + row.item.name);
    decBtn.textContent = '−';
    decBtn.addEventListener('click', function () { changeQty(row.item.id, -1); });

    const qtyVal = document.createElement('span');
    qtyVal.className = 'qty-val';
    qtyVal.textContent = String(row.qty);

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'qty-btn';
    incBtn.setAttribute('data-testid', 'inc');
    incBtn.setAttribute('data-inc-id', row.item.id);
    incBtn.setAttribute('aria-label', 'เพิ่มจำนวน ' + row.item.name);
    incBtn.textContent = '＋';
    incBtn.addEventListener('click', function () { changeQty(row.item.id, 1); });

    qty.appendChild(decBtn);
    qty.appendChild(qtyVal);
    qty.appendChild(incBtn);

    const lineTotal = document.createElement('span');
    lineTotal.className = 'line-total';
    lineTotal.textContent = money(Math.round(row.item.price * 100) * row.qty);
    const unitSmall = document.createElement('small');
    unitSmall.textContent = ' ฿';
    lineTotal.appendChild(unitSmall);

    line.appendChild(info);
    line.appendChild(qty);
    line.appendChild(lineTotal);
    return line;
  }

  function renderCart() {
    const rows = cartItems();
    el.cartList.textContent = '';
    const frag = document.createDocumentFragment();
    rows.forEach(function (row) { frag.appendChild(buildCartRow(row)); });
    el.cartList.appendChild(frag);

    el.cartEmpty.hidden = rows.length > 0;
    el.cartCount.hidden = rows.length === 0;
    el.cartCount.textContent = String(cartCount());

    const t = computeTotals();
    el.subtotal.textContent = money(t.subtotal);
    el.vat.textContent = money(t.vat);
    el.total.textContent = money(t.total);
  }

  /* ── render: รายการจอง ──────────────────────────────── */

  function buildBookingRow(booking) {
    const wrap = document.createElement('div');
    wrap.className = 'booking-item';
    wrap.setAttribute('data-testid', 'booking-row');

    const name = document.createElement('p');
    name.className = 'booking-name';
    name.textContent = booking.name;

    const guests = document.createElement('span');
    guests.className = 'booking-guests';
    guests.textContent = booking.guests + ' ท่าน';

    const meta = document.createElement('p');
    meta.className = 'booking-meta';

    const dateSpan = document.createElement('span');
    dateSpan.textContent = '📅 ' + formatThaiDate(booking.date) + ' (' + booking.date + ')';
    meta.appendChild(dateSpan);

    const weekday = parseDateInput(booking.date);
    if (weekday) {
      const daySpan = document.createElement('span');
      daySpan.textContent = 'วัน' + THAI_DAYS[weekday.getDay()];
      meta.appendChild(daySpan);
    }

    const timeSpan = document.createElement('span');
    timeSpan.textContent = '⏰ ' + booking.time + ' น.';
    meta.appendChild(timeSpan);

    const phoneSpan = document.createElement('span');
    phoneSpan.textContent = '📞 ' + booking.phone;
    meta.appendChild(phoneSpan);

    wrap.appendChild(name);
    wrap.appendChild(guests);
    wrap.appendChild(meta);
    return wrap;
  }

  function renderBookings() {
    el.bookingList.textContent = '';
    const frag = document.createDocumentFragment();
    state.bookings.forEach(function (booking) { frag.appendChild(buildBookingRow(booking)); });
    el.bookingList.appendChild(frag);
    el.bookingsEmpty.hidden = state.bookings.length > 0;
  }

  /* ── ฟอร์มจอง: ตรวจสอบเงื่อนไข ────────────────────────── */

  function showError(messages) {
    if (!messages.length) {
      el.bookingError.hidden = true;
      el.bookingError.textContent = '';
      return;
    }
    el.bookingError.textContent = messages.join(' · ');
    el.bookingError.hidden = false;
  }

  function showOk(text) {
    el.bookingOk.textContent = text;
    el.bookingOk.hidden = false;
  }

  function hideOk() {
    el.bookingOk.hidden = true;
    el.bookingOk.textContent = '';
  }

  function validateBooking(data) {
    const errors = [];

    if (!data.name) {
      errors.push('กรุณากรอกชื่อผู้จอง');
    }

    if (!data.phone) {
      errors.push('กรุณากรอกเบอร์โทรศัพท์');
    } else if (!/^0\d{9}$/.test(data.phone)) {
      errors.push('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วย 0');
    }

    if (!data.date) {
      errors.push('กรุณาเลือกวันที่ต้องการจอง');
    } else {
      const date = parseDateInput(data.date);
      if (!date) {
        errors.push('รูปแบบวันที่ไม่ถูกต้อง');
      } else {
        const today = todayAtMidnight();
        if (date.getTime() < today.getTime()) {
          errors.push('จองวันที่ผ่านมาแล้วไม่ได้ กรุณาเลือกวันนี้หรือวันถัดไป');
        } else if (date.getDay() === 1) {
          errors.push('ขออภัย ร้านปิดทุกวันจันทร์ กรุณาเลือกวันอื่น');
        }
      }
    }

    if (!data.time) {
      errors.push('กรุณาเลือกเวลา');
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) {
      errors.push('รูปแบบเวลาไม่ถูกต้อง');
    } else if (data.time < '10:00' || data.time > '21:00') {
      errors.push('เวลาเปิดให้บริการคือ 10:00 ถึง 21:00 น.');
    }

    if (!data.guestsRaw) {
      errors.push('กรุณากรอกจำนวนคน');
    } else if (!/^\d+$/.test(data.guestsRaw)) {
      errors.push('จำนวนคนต้องเป็นตัวเลขเต็มจำนวน 1 ถึง 12 ท่าน');
    } else {
      const guests = Number(data.guestsRaw);
      if (guests < 1 || guests > 12) {
        errors.push('จำนวนคนต้องอยู่ระหว่าง 1 ถึง 12 ท่าน');
      }
    }

    return errors;
  }

  function handleSubmit(event) {
    event.preventDefault();

    /* อ่านค่าจากช่อง name="..." ของฟอร์มจริง */
    const form = event.currentTarget;
    const getValue = function (fieldName) {
      const field = form.elements[fieldName];
      return field && typeof field.value === 'string' ? field.value.trim() : '';
    };

    let timeValue = getValue('time');
    /* บางเบราว์เซอร์คืนค่าเป็น HH:MM:SS */
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeValue)) timeValue = timeValue.slice(0, 5);
    if (/^\d:\d{2}$/.test(timeValue)) timeValue = '0' + timeValue;

    const data = {
      name: getValue('name').replace(/\s+/g, ' '),
      phone: getValue('phone'),
      date: getValue('date'),
      time: timeValue,
      guestsRaw: getValue('guests')
    };

    const errors = validateBooking(data);
    if (errors.length) {
      hideOk();
      showError(errors);
      return;
    }

    const booking = {
      id: 'bk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: data.name,
      phone: data.phone,
      date: data.date,
      time: data.time,
      guests: Number(data.guestsRaw),
      createdAt: new Date().toISOString()
    };

    state.bookings.push(booking);
    saveBookings();
    renderBookings();

    showError([]);
    showOk('จองโต๊ะสำเร็จแล้ว! คุณ' + booking.name + ' วันที่ ' +
      formatThaiDate(booking.date) + ' เวลา ' + booking.time +
      ' น. จำนวน ' + booking.guests + ' ท่าน — ร้านจะโทรยืนยันที่ ' + booking.phone);

    form.reset();
  }

  /* ── ธีมมืด / สว่าง ─────────────────────────────────── */

  function applyTheme(isDark, persist) {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    el.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    el.themeLabel.textContent = isDark ? 'โหมดสว่าง' : 'โหมดมืด';
    el.themeIcon.textContent = isDark ? '☀️' : '🌙';
    if (persist) {
      try {
        localStorage.setItem(KEYS.theme, isDark ? 'dark' : 'light');
      } catch (err) {
        /* ไม่สามารถบันทึกได้ — ยังใช้งานต่อได้ */
      }
    }
  }

  function initTheme() {
    applyTheme(document.documentElement.classList.contains('dark'), false);
    el.themeToggle.addEventListener('click', function () {
      applyTheme(!document.documentElement.classList.contains('dark'), true);
    });
  }

  /* ── เริ่มทำงาน ──────────────────────────────────────── */

  function bindEvents() {
    el.search.addEventListener('input', function (event) {
      state.query = event.target.value;
      renderMenu();
    });

    el.filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const cat = button.getAttribute('data-cat');
        if (CATEGORIES.indexOf(cat) === -1) return;
        state.category = cat;
        el.filterButtons.forEach(function (other) {
          const active = other === button;
          other.classList.toggle('is-active', active);
          other.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderMenu();
      });
    });

    el.form.addEventListener('submit', handleSubmit);

    /* พิมพ์แก้ไขแล้วล้างข้อความเดิม เพื่อไม่ให้ค้าง */
    el.form.addEventListener('input', function () {
      if (!el.bookingError.hidden) showError([]);
    });
  }

  function init() {
    loadCart();
    loadBookings();
    initTheme();
    bindEvents();
    renderMenu();
    renderCart();
    renderBookings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();