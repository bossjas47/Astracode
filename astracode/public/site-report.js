// หน้ารายงานเว็บ Kyber Sites (/sites/report?s=ชื่อ)
const f = document.getElementById('f');
f.onsubmit = async e => {
  e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
  try {
    const r = await fetch('/api/sites/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: f.dataset.slug, reason: f.reason.value }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'ส่งไม่สำเร็จ');
    f.hidden = true; document.getElementById('ok').hidden = false;
  } catch (x) { b.disabled = false; b.textContent = x.message + ' · ลองอีกครั้ง'; }
};
