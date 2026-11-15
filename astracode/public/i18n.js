// ภาษาอังกฤษทั้งเว็บ: แปลข้อความไทยที่ปรากฏบนหน้าตาม i18n-en.js (โหลดเฉพาะเมื่อเลือก English) ทั้งตอนวาดหน้าและตอนที่หน้าเปลี่ยนภายหลัง
// ข้อความที่ผู้ใช้เขียน (แชต ไฟล์ ชื่อโปรเจกต์ ฯลฯ) ไม่แปล · ข้อความที่ยังไม่มีคำแปลคงเป็นไทย และรายการอยู่ที่ i18nMissing() ในคอนโซล
(() => {
  if (window.LANG !== 'en') return; // ใช้เมื่อเลือก English เท่านั้น
  const D = window.I18N_EN || {}, keys = Object.keys(D).sort((a, b) => b.length - a.length), TH = /[ก-ฺเ-๛]/, missing = new Set();
  const re = keys.length ? new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null, cache = new Map();
  const tr = s => {
    if (!s || !TH.test(s)) return s;
    const t = s.trim(); if (D[t]) return s.replace(t, D[t]);
    let o = cache.get(s); if (o !== undefined) return o;
    o = re ? s.replace(re, m => D[m]) : s;
    if (TH.test(o)) { missing.add(t); o = s; } // แปลไม่ครบ = คงข้อความไทยเดิมทั้งก้อน (ไม่ให้ไทยปนอังกฤษ)
    cache.set(s, o); return o;
  };
  // ส่วนที่เป็นเนื้อหาของผู้ใช้/โค้ด: ไม่แปล (ยกเว้นข้อความสถานะของระบบที่อยู่ในนั้น)
  const SKIP = 'script,style,pre,code,textarea,.msg .b,.msg.user,.cm-editor,.term,.console,[data-notr],.tname,.mem>span,.fchip,.item>a>span,.pname,.dr-head>div>b,.imgview';
  const KEEP = '.waitx,.think-s,.steps-bar';
  const skip = el => !!el && !!el.closest(SKIP) && !el.closest(KEEP);
  const ATTR = ['placeholder', 'aria-label', 'title', 'alt'];
  const doNode = n => {
    if (n.nodeType === 3) { const p = n.parentElement; if (!p || skip(p)) return; if (n.__en === n.nodeValue) return; const v = tr(n.nodeValue); if (v !== n.nodeValue) { n.__en = v; n.nodeValue = v; } return; }
    if (n.nodeType !== 1 || skip(n)) return;
    for (const a of ATTR) if (n.hasAttribute?.(a)) { const v = n.getAttribute(a); if (TH.test(v)) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
    for (const c of n.childNodes) doNode(c);
  };
  let pending = 0;
  const run = () => { pending = 0; doNode(document.body); if (TH.test(document.title)) document.title = tr(document.title); };
  window.i18nMissing = () => [...missing];
  new MutationObserver(ms => {
    for (const m of ms) { if (m.type === 'characterData') doNode(m.target); else if (m.type === 'attributes') doNode(m.target); else m.addedNodes.forEach(doNode); }
    if (TH.test(document.title)) document.title = tr(document.title);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  addEventListener('DOMContentLoaded', run); if (document.body) run();
  document.documentElement.lang = 'en';
})();
