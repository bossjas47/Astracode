/* ครัวบ้านนก — ครัวไทยหน้าเดียว (HTML/CSS/JS ล้วน) */
(function () {
  'use strict';

  /* ==================== ข้อมูลเมนู ==================== */
  var MENU = [
    { id: 1, name: 'ต้มยำกุ้งน้ำข้น', category: 'ต้ม', price: 180, spicy: true },
    { id: 2, name: 'ต้มจืดเต้าหู้หมูสับ', category: 'ต้ม', price: 90, spicy: false },
    { id: 3, name: 'ผัดไทยกุ้งสด', category: 'ผัด', price: 120, spicy: false },
    { id: 4, name: 'ผัดกะเพราไก่ไข่ดาว', category: 'ผัด', price: 110, spicy: true },
    { id: 5, name: 'ผัดซีอิ๊วหมู', category: 'ผัด', price: 95, spicy: false },
    { id: 6, name: 'แกงเขียวหวานไก่', category: 'แกง', price: 140, spicy: true },
    { id: 7, name: 'แกงมัสมั่นเนื้อ', category: 'แกง', price: 160, spicy: false },
    { id: 8, name: 'ข้าวเหนียวมะม่วง', category: 'ของหวาน', price: 130, spicy: false }
  ];

  var MENU_BY_ID = {};
  MENU.forEach(function (m) { MENU_BY_ID[m.id] = m; });

  /* ==================== ค่าคงที่ ==================== */
  var KEY_CART = 'kbn-cart';
  var KEY_BOOKINGS = 'kbn-bookings';
  var KEY_THEME = 'kbn-theme';
  var VAT_RATE = 0.07;
  var OPEN_TIME = '10:00';
  var CLOSE_TIME = '21:00';
  var THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  /* ==================== localStorage helpers ==================== */
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* โหมดส่วนตัว / พื้นที่เต็ม — เก็บในหน่วยความจำแทน */
    }
  }

  /* ==================== State ==================== */
  var cart = normalizeCart(loadJSON(KEY_CART, {}));
  var bookings = normalizeBookings(loadJSON(KEY_BOOKINGS, []));
  var filterCategory = 'all';
  var searchQuery = '';

  function normalizeCart(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      var id = Number(k);
      var qty = Math.floor(Number(raw[k]));
      if (MENU_BY_ID[id] && isFinite(qty) && qty > 0) out[id] = qty;
    });
    return out;
  }

  function normalizeBookings(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (b) {
      return b && typeof b === 'object' && b.name && b.phone && b.date && b.time;
    });
  }

  /* ==================== Element refs ==================== */
  function $(id) { return document.getElementById(id); }

  var elMenuGrid = $('menu-grid');
  var elMenuEmpty = $('menu-empty');
  var elSearch = $('search');
  var elFilterBtns = Array.prototype.slice.call(document.querySelectorAll('.filter-btn'));
  var elCartList = $('cart-list');
  var elCartEmpty = $('cart-empty');
  var elSubtotal = document.querySelector('[data-testid="subtotal"]');
  var elVat = document.querySelector('[data-testid="vat"]');
  var elTotal = document.querySelector('[data-testid="total"]');
  var elForm = $('booking-form');
  var elError = $('booking-error');
  var elOk = $('booking-ok');
  var elBookingList = $('booking-list');
  var elBookingEmpty = $('booking-empty');
  var elThemeToggle = document.querySelector('[data-testid="theme-toggle"]');

  /* ==================== ตัวช่วยรูปแบบเงิน ==================== */
  function baht(satang) {
    return (satang / 100).toFixed(2);
  }

  /* ==================== เมนู + ตัวกรอง + ค้นหา ==================== */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderMenu() {
    var q = searchQuery.trim().toLowerCase();
    var list = MENU.filter(function (m) {
      var okCat = filterCategory === 'all' || m.category === filterCategory;
      var okQuery = q === '' || m.name.toLowerCase().indexOf(q) !== -1;
      return okCat && okQuery;
    });

    elMenuGrid.innerHTML = list.map(function (m) {
      return '' +
        '<article class="menu-item" data-testid="menu-item" data-id="' + m.id + '">' +
          '<div class="item-head">' +
            '<h3>' + escapeHtml(m.name) + '</h3>' +
            '<span class="badge' + (m.spicy ? ' spicy' : '') + '">' + (m.spicy ? '🌶 เผ็ด' : 'ไม่เผ็ด') + '</span>' +
          '</div>' +
          '<div class="item-meta"><span class="badge">' + escapeHtml(m.category) + '</span></div>' +
          '<div class="item-foot">' +
            '<span class="price">' + m.price.toFixed(2) + ' บาท</span>' +
            '<button type="button" class="add-btn" data-testid="add" data-id="' + m.id + '" data-action="add"' +
              ' aria-label="เพิ่ม ' + escapeHtml(m.name) + ' ลงตะกร้า">เพิ่มลงตะกร้า</button>' +
          '</div>' +
        '</article>';
    }).join('');

    elMenuEmpty.hidden = list.length !== 0;
  }

  elMenuGrid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="add"]');
    if (!btn) return;
    addToCart(Number(btn.getAttribute('data-id')));
  });

  elFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterCategory = btn.getAttribute('data-category') || 'all';
      elFilterBtns.forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      renderMenu();
    });
  });

  elSearch.addEventListener('input', function () {
    searchQuery = elSearch.value;
    renderMenu();
  });

  /* ==================== ตะกร้า ==================== */
  function addToCart(id) {
    if (!MENU_BY_ID[id]) return;
    cart[id] = (cart[id] || 0) + 1;
    persistCart();
    renderCart();
  }

  function changeQty(id, delta) {
    if (!cart[id]) return;
    var next = cart[id] + delta;
    if (next <= 0) {
      delete cart[id];
    } else {
      cart[id] = next;
    }
    persistCart();
    renderCart();
  }

  function persistCart() {
    saveJSON(KEY_CART, cart);
  }

  function cartTotals() {
    var subtotalSatang = 0;
    Object.keys(cart).forEach(function (k) {
      var m = MENU_BY_ID[k];
      if (m) subtotalSatang += m.price * 100 * cart[k];
    });
    var vatSatang = Math.round(subtotalSatang * VAT_RATE);
    return {
      subtotal: subtotalSatang,
      vat: vatSatang,
      total: subtotalSatang + vatSatang
    };
  }

  function renderCart() {
    var ids = Object.keys(cart).map(Number);

    elCartList.innerHTML = ids.map(function (id) {
      var m = MENU_BY_ID[id];
      var qty = cart[id];
      return '' +
        '<div class="cart-row" data-testid="cart-row" data-id="' + id + '">' +
          '<div class="row-name-wrap">' +
            '<span class="row-name">' + escapeHtml(m.name) + '</span>' +
            '<span class="row-price"> · ' + m.price.toFixed(2) + ' บาท / จาน</span>' +
          '</div>' +
          '<div class="qty-controls">' +
            '<button type="button" class="qty-btn" data-testid="dec" data-action="dec" data-id="' + id + '"' +
              ' aria-label="ลดจำนวน ' + escapeHtml(m.name) + '">−</button>' +
            '<span class="qty-value">' + qty + '</span>' +
            '<button type="button" class="qty-btn" data-testid="inc" data-action="inc" data-id="' + id + '"' +
              ' aria-label="เพิ่มจำนวน ' + escapeHtml(m.name) + '">+</button>' +
          '</div>' +
          '<span class="row-sum">' + baht(m.price * 100 * qty) + ' บาท</span>' +
        '</div>';
    }).join('');

    elCartEmpty.hidden = ids.length !== 0;

    var t = cartTotals();
    elSubtotal.textContent = baht(t.subtotal);
    elVat.textContent = baht(t.vat);
    elTotal.textContent = baht(t.total);
  }

  elCartList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-id'));
    var action = btn.getAttribute('data-action');
    if (action === 'inc') changeQty(id, 1);
    else if (action === 'dec') changeQty(id, -1);
  });

  /* ==================== ฟอร์มจองโต๊ะ ==================== */
  function todayMidnight() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function parseISODate(str) {
    // "YYYY-MM-DD" -> Date เวลาท้องถิ่น (กันปัญหา UTC offset)
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function thaiDateLabel(iso) {
    var dt = parseISODate(iso);
    if (!dt) return iso;
    return 'วัน' + THAI_DAYS[dt.getDay()] + ' ที่ ' + dt.getDate() + '/' + (dt.getMonth() + 1) + '/' + (dt.getFullYear() + 543);
  }

  function validateBooking(data) {
    if (!data.name) return 'กรุณากรอกชื่อผู้จอง';
    if (!data.phone) return 'กรุณากรอกเบอร์โทรศัพท์';
    if (!/^0\d{9}$/.test(data.phone)) return 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก และขึ้นต้นด้วย 0 (เช่น 0812345678)';
    if (!data.date) return 'กรุณาเลือกวันที่จอง';

    var dt = parseISODate(data.date);
    if (!dt) return 'รูปแบบวันที่ไม่ถูกต้อง';
    if (dt.getTime() < todayMidnight().getTime()) return 'ไม่สามารถจองวันที่ผ่านมาแล้วได้';
    if (dt.getDay() === 1) return 'ร้านปิดทุกวันจันทร์ กรุณาเลือกวันอื่น';

    if (!data.time) return 'กรุณาเลือกเวลา';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) return 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM)';
    if (data.time < OPEN_TIME || data.time > CLOSE_TIME) {
      return 'เวลาเปิดทำการคือ 10:00–21:00 กรุณาเลือกเวลาในช่วงนี้';
    }

    var guests = Number(data.guests);
    if (!data.guests || !isFinite(guests) || Math.floor(guests) !== guests) return 'กรุณากรอกจำนวนคนเป็นจำนวนเต็ม';
    if (guests < 1 || guests > 12) return 'จำนวนคนต้องอยู่ระหว่าง 1 ถึง 12 คน';

    return '';
  }

  function showError(msg) {
    elError.textContent = msg;
    elError.hidden = false;
    elOk.hidden = true;
    elOk.textContent = '';
  }

  function showOk(msg) {
    elOk.textContent = msg;
    elOk.hidden = false;
    elError.hidden = true;
    elError.textContent = '';
  }

  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(elForm);
    var data = {
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim().replace(/[\s-]/g, ''),
      date: String(fd.get('date') || '').trim(),
      time: String(fd.get('time') || '').trim(),
      guests: String(fd.get('guests') || '').trim()
    };

    var err = validateBooking(data);
    if (err) {
      showError(err);
      return;
    }

    var booking = {
      id: 'bk-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      name: data.name,
      phone: data.phone,
      date: data.date,
      time: data.time,
      guests: Number(data.guests),
      createdAt: new Date().toISOString()
    };

    bookings.push(booking);
    saveJSON(KEY_BOOKINGS, bookings);

    elForm.reset();
    $('bk-guests').value = '2';

    showOk('จองสำเร็จแล้ว! คุณ' + booking.name + ' จำนวน ' + booking.guests + ' คน ' +
      thaiDateLabel(booking.date) + ' เวลา ' + booking.time + ' น. — ร้านจะติดต่อกลับที่ ' + booking.phone);
    renderBookings();
  });

  /* ==================== รายการจอง ==================== */
  function renderBookings() {
    elBookingList.innerHTML = bookings.map(function (b) {
      return '' +
        '<div class="booking-row" data-testid="booking-row" data-id="' + escapeHtml(b.id) + '">' +
          '<span class="bk-main">' + escapeHtml(b.name) + ' · ' + escapeHtml(String(b.guests)) + ' คน</span>' +
          '<span class="bk-sub">' + escapeHtml(thaiDateLabel(b.date)) + ' เวลา ' + escapeHtml(b.time) + ' น.</span>' +
          '<span class="bk-sub">โทร. ' + escapeHtml(b.phone) + '</span>' +
          '<button type="button" class="del-btn" data-action="remove-booking" data-id="' + escapeHtml(b.id) + '">ยกเลิก</button>' +
        '</div>';
    }).join('');

    elBookingEmpty.hidden = bookings.length !== 0;
  }

  elBookingList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="remove-booking"]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    bookings = bookings.filter(function (b) { return b.id !== id; });
    saveJSON(KEY_BOOKINGS, bookings);
    renderBookings();
  });

  /* ==================== โหมดมืด / สว่าง ==================== */
  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    var icon = elThemeToggle.querySelector('.theme-icon');
    var label = elThemeToggle.querySelector('.theme-label');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'โหมดสว่าง' : 'โหมดมืด';
    elThemeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  }

  elThemeToggle.addEventListener('click', function () {
    var isDark = !document.documentElement.classList.contains('dark');
    applyTheme(isDark);
    try {
      localStorage.setItem(KEY_THEME, isDark ? 'dark' : 'light');
    } catch (e) { /* ไม่เป็นไร */ }
  });

  /* ==================== เริ่มต้น ==================== */
  applyTheme(document.documentElement.classList.contains('dark'));
  renderMenu();
  renderCart();
  renderBookings();
})();
