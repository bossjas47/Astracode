// ธีม (Auto / Light / Dark) และขนาดตัวอักษรของแชต: โหลดก่อนหน้าแสดงผลเพื่อไม่ให้หน้ากะพริบ
(() => {
  const root = document.documentElement, mq = matchMedia('(prefers-color-scheme: light)'), get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const apply = () => {
    const pref = get('theme') || 'dark', t = pref === 'auto' ? (mq.matches ? 'light' : 'dark') : pref;
    root.dataset.theme = t;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#faf7f2' : '#12100e';
    root.style.setProperty('--msgfs', ({ s: '13.5px', m: '15px', l: '17px' })[get('fsize') || 'm'] || '15px');
  };
  window.LANG = get('lang') === 'en' ? 'en' : 'th';
  if (window.LANG === 'en') document.write('<script src="/i18n-en.js"><\/script><script src="/i18n.js"><\/script>'); // แปลทั้งเว็บเป็นอังกฤษ (โหลดแบบซิงก์ เพื่อไม่ให้เห็นภาษาไทยแวบก่อน)
  apply(); mq.addEventListener?.('change', apply);
  window.applyTheme = apply;
  addEventListener('DOMContentLoaded', apply);
})();
