// ปลายทางหลังล็อกอินกับผู้ให้บริการ (ป๊อปอัปจาก ตั้งค่า → Connectors): แจ้งหน้าต่างหลักแล้วปิดตัวเอง
(() => {
  const q = new URLSearchParams(location.search), ok = q.get('ok') === '1', error = q.get('error') || '';
  document.getElementById('mk').textContent = ok ? '✓' : '!';
  document.getElementById('mk').className = 'cn-mark ' + (ok ? 'ok' : 'bad');
  document.getElementById('h').textContent = ok ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อไม่สำเร็จ';
  document.getElementById('m').textContent = ok ? 'ปิดหน้าต่างนี้ได้เลย AI ใช้งานได้ทุกแชตแล้ว' : error;
  const data = { ok, id: +q.get('id') || null, error };
  let told = false;
  try { if (window.opener && !window.opener.closed) { window.opener.postMessage({ astraConnected: data }, location.origin); told = true; } } catch { /* opener คนละ origin */ }
  if (told) setTimeout(() => window.close(), ok ? 500 : 3000);
  else { const b = document.getElementById('back'); b.hidden = false; b.href = '/chat?connectors=' + (ok ? 'ok' : 'err'); if (ok) setTimeout(() => location.replace(b.href), 1200); }
})();
