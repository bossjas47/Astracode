/* ============================================================
   บ้านนก คอฟฟี่ — interactions
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Mobile menu ---------- */
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  function closeMenu() {
    navLinks.classList.remove('open');
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'เปิดเมนู');
  }

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('open');
      hamburger.classList.toggle('is-open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      hamburger.setAttribute('aria-label', isOpen ? 'ปิดเมนู' : 'เปิดเมนู');
    });

    // ปิดเมนูเมื่อคลิกลิงก์
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // ปิดเมื่อกด Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ---------- Header shadow on scroll ---------- */
  const header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Toast helper ---------- */
  const toast = document.getElementById('toast');
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2600);
  }

  /* ---------- Order buttons ---------- */
  document.querySelectorAll('.order-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const item = btn.getAttribute('data-item') || 'เมนูนี้';
      showToast('เพิ่ม “' + item + '” ลงตะกร้าแล้ว ☕');
    });
  });

  /* ---------- Contact form validation ---------- */
  const form = document.getElementById('contactForm');
  const success = document.getElementById('formSuccess');

  function setError(field, message) {
    const wrapper = field.closest('.field');
    const msg = wrapper ? wrapper.querySelector('.error-msg') : null;
    if (wrapper) wrapper.classList.toggle('invalid', Boolean(message));
    if (msg) msg.textContent = message || '';
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validate() {
    let ok = true;

    const name = form.elements.name;
    const phone = form.elements.phone;
    const message = form.elements.message;

    if (!name.value.trim()) {
      setError(name, 'กรุณากรอกชื่อของคุณ');
      ok = false;
    } else {
      setError(name, '');
    }

    const phoneDigits = phone.value.replace(/[^0-9]/g, '');
    if (!phone.value.trim()) {
      setError(phone, 'กรุณากรอกเบอร์โทรศัพท์');
      ok = false;
    } else if (phoneDigits.length < 9 || phoneDigits.length > 10) {
      setError(phone, 'เบอร์โทรควรมี 9-10 หลัก');
      ok = false;
    } else {
      setError(phone, '');
    }

    if (!message.value.trim()) {
      setError(message, 'กรุณากรอกข้อความ');
      ok = false;
    } else if (message.value.trim().length < 5) {
      setError(message, 'กรุณากรอกข้อความอย่างน้อย 5 ตัวอักษร');
      ok = false;
    } else {
      setError(message, '');
    }

    return ok;
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        const firstInvalid = form.querySelector('.field.invalid input, .field.invalid textarea');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      success.hidden = false;
      form.reset();
      form.querySelectorAll('.field').forEach(function (f) {
        f.classList.remove('invalid');
      });
      showToast('ส่งข้อความเรียบร้อยแล้ว ขอบคุณครับ 🙏');
      setTimeout(function () { success.hidden = true; }, 6000);
    });

    // ล้าง error เมื่อเริ่มพิมพ์
    form.querySelectorAll('input, textarea').forEach(function (el) {
      el.addEventListener('input', function () {
        if (el.closest('.field').classList.contains('invalid')) setError(el, '');
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(
    '.section-head, .menu-card, .review-card, .info-block, .visit-map, .contact-copy, .contact-form'
  );
  if ('IntersectionObserver' in window) {
    revealEls.forEach(function (el) { el.classList.add('reveal'); });
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
