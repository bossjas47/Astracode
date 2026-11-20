// ธีม (Auto / Light / Dark) และขนาดตัวอักษรของแชต: โหลดก่อนหน้าแสดงผลเพื่อไม่ให้หน้ากะพริบ
(() => {
  const root = document.documentElement, mq = matchMedia('(prefers-color-scheme: light)'), get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const apply = () => {
    const pref = get('theme') || 'light', t = pref === 'auto' ? (mq.matches ? 'light' : 'dark') : pref;
    root.dataset.theme = t;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#faf7f2' : '#12100e';
    // เอฟเฟกต์กระจก: auto = ปิดเบลอบนเครื่องสเปกต่ำ (RAM ≤ 4GB หรือ ≤ 4 คอร์) หรือเมื่อระบบขอลดความโปร่งใส
    const fx = get('fx') || 'auto', weak = navigator.deviceMemory <= 4 || navigator.hardwareConcurrency <= 4 || matchMedia('(prefers-reduced-transparency: reduce)').matches;
    root.toggleAttribute('data-lite', fx === 'off' || (fx === 'auto' && weak));
    root.style.setProperty('--msgfs', ({ s: '13.5px', m: '15px', l: '17px' })[get('fsize') || 'm'] || '15px');
  };
  // ขอข้อมูลที่หน้าแรกต้องใช้ตั้งแต่หัวหน้า ขนานไปกับการโหลด CSS/JS (เดิมรอ app.js โหลดเสร็จก่อนค่อยเริ่มขอ) · app.js api() ใช้ผลนี้ครั้งเดียว
  try {
    const p = location.pathname, li = get('li') === '1', want = ['/me', '/settings/public'];
    if (li && p === '/chat') { want.push('/chats', '/folders'); const id = new URLSearchParams(location.search).get('id'); if (/^\d+$/.test(id || '')) want.push('/chats/' + id); }
    else if (li && !/^\/(admin|share|preview|node-runner|p\/)/.test(p)) want.push(p.startsWith('/code') ? '/projects' : '/chats');
    want.push(...({ '/': ['/plans', '/blog', '/pricing', '/gallery'], '/plans': ['/plans'], '/pricing': ['/pricing'] }[p] || [])); // ข้อมูลหลักของหน้าสาธารณะ
    if (li) want.push(...({ '/plans': ['/pay'], '/account': ['/wallet', '/memories', '/usage/daily', '/team'] }[p] || []));
    window.__pre = Object.fromEntries([...new Set(want)].map(k => [k, fetch('/api' + k, { credentials: 'same-origin' })]));
  } catch { /* เบราว์เซอร์เก่า: app.js ขอเองตามปกติ */ }
  // ฟอนต์จาก Google ไม่บล็อกการวาดหน้า (หน้าโหลดด้วย media=print แล้วสลับเป็น all เมื่อโหลดเสร็จ · ตัวอักษรเหมือนเดิมเมื่อฟอนต์มาถึง)
  const fl = document.querySelector('link[data-fonts]'); if (fl) { const on = () => { fl.media = 'all'; }; if (fl.sheet) on(); else fl.addEventListener('load', on); }
  window.LANG = get('lang') === 'en' ? 'en' : 'th';
  if (window.LANG === 'en') document.write('<script src="/i18n-en.js"><\/script><script src="/i18n.js"><\/script>'); // แปลทั้งเว็บเป็นอังกฤษ (โหลดแบบซิงก์ เพื่อไม่ให้เห็นภาษาไทยแวบก่อน)
  root.lang = window.LANG; root.setAttribute('translate', 'no'); // กัน Chrome แปลหน้าซ้อนกับระบบแปลของเว็บเอง (ทำให้ DOM เปลี่ยนวนจนค้าง)
  apply(); mq.addEventListener?.('change', apply);
  window.applyTheme = apply;
  addEventListener('DOMContentLoaded', apply);
})();
