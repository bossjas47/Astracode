// พื้นหลังแชต (Kyber 2.5): ภาพสำเร็จรูป · รูปของผู้ใช้ · 3D 4 แบบ (ดาว / คลื่นแสง / รูปทรงลอย / ไล่สีนุ่ม)
// ตั้งในหน้าบัญชี → เก็บในบัญชี (me.bg) ใช้ได้ทั้งเว็บและแอปบนคอม · แคชใน localStorage ให้ขึ้นทันทีก่อนโหลดข้อมูลบัญชี
// 3D วาดด้วย canvas 2D (ไม่มีไลบรารี): ≤30fps, หยุดเมื่อแท็บซ่อน, ผู้ใช้ตั้ง "ลดการเคลื่อนไหว" = ภาพนิ่งเฟรมเดียว
(() => {
  const SPEC = ['#14b8d9', '#6b6ff5', '#e0509f'];
  const PRESETS = {
    aurora: { name: 'Aurora', css: 'radial-gradient(1200px 700px at 15% 10%, rgba(20,184,217,.35), transparent 60%), radial-gradient(1000px 800px at 85% 30%, rgba(107,111,245,.35), transparent 60%), radial-gradient(900px 700px at 50% 100%, rgba(224,80,159,.25), transparent 60%), #05060a' },
    dusk: { name: 'Dusk', css: 'linear-gradient(160deg, #1a1033 0%, #3b1d4a 45%, #7a2f4f 75%, #c4593f 100%)' },
    ocean: { name: 'Ocean', css: 'radial-gradient(900px 600px at 70% 20%, rgba(56,189,248,.35), transparent 60%), linear-gradient(180deg, #021526 0%, #03346e 60%, #0b5c8a 100%)' },
    forest: { name: 'Forest', css: 'radial-gradient(900px 700px at 20% 80%, rgba(60,207,142,.28), transparent 60%), linear-gradient(170deg, #03110b 0%, #0b2a1c 55%, #134e3a 100%)' },
    ember: { name: 'Ember', css: 'radial-gradient(800px 600px at 80% 90%, rgba(255,106,94,.35), transparent 60%), radial-gradient(700px 500px at 10% 10%, rgba(243,180,90,.22), transparent 60%), #0a0605' },
    paper: { name: 'Paper', css: 'linear-gradient(180deg, #f6f7fb 0%, #e9ecf4 100%)', light: true },
  };
  const P3D = { stars: 'อวกาศ', waves: 'คลื่นแสง', shapes: 'รูปทรงลอย', mesh: 'ไล่สีนุ่ม' };
  const read = () => { try { return JSON.parse(localStorage.getItem('kbg') || 'null'); } catch { return null; } };
  const write = g => { try { g ? localStorage.setItem('kbg', JSON.stringify(g)) : localStorage.removeItem('kbg'); } catch { /* โหมดส่วนตัว */ } };
  let layer = null, cv = null, raf = 0, cur = null, draw = null, last = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clear() { cancelAnimationFrame(raf); raf = 0; draw = null; layer?.remove(); layer = cv = null; document.documentElement.classList.remove('has-kbg'); }
  const onChat = () => /^\/chat(\/|$)/.test(location.pathname); // ใช้เฉพาะหน้าแชต (แอปบนคอมเปิดหน้าแชตเหมือนกัน)
  function mount(g) {
    clear(); if (!g || !g.kind || !onChat()) return;
    layer = document.createElement('div'); layer.id = 'kbg'; layer.setAttribute('aria-hidden', 'true');
    const img = document.createElement('div'); img.className = 'kbg-img';
    if (g.kind === 'preset' && PRESETS[g.id]) img.style.background = PRESETS[g.id].css;
    else if (g.kind === 'img') { img.style.backgroundImage = `url("${String(g.id).replace(/"/g, '')}")`; img.style.backgroundSize = 'cover'; img.style.backgroundPosition = 'center'; }
    else if (g.kind === '3d' && P3D[g.id]) { cv = document.createElement('canvas'); img.appendChild(cv); img.style.background = '#000'; }
    else return;
    if (g.blur && g.kind !== '3d') { img.style.filter = `blur(${+g.blur}px)`; img.style.transform = 'scale(1.06)'; }
    const dim = document.createElement('div'); dim.className = 'kbg-dim'; dim.style.background = `rgba(0,0,0,${Math.min(.85, Math.max(0, (+g.dim || 0) / 100))})`;
    layer.append(img, dim); document.body.prepend(layer); document.documentElement.classList.add('has-kbg');
    if (cv) start(g.id);
  }

  // ---------- 3D ----------
  function start(kind) {
    const ctx = cv.getContext('2d'); let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(1.5, devicePixelRatio || 1); W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr); cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; };
    size(); addEventListener('resize', size);
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (kind === 'stars') {
      const S = Array.from({ length: 420 }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(.05, 1), c: SPEC[Math.random() * 3 | 0] }));
      draw = dt => {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
        for (const s of S) {
          s.z -= dt * .00006; if (s.z <= .02) { s.z = 1; s.x = rnd(-1, 1); s.y = rnd(-1, 1); }
          const k = .5 / s.z, x = W / 2 + s.x * W * k * .5, y = H / 2 + s.y * H * k * .5, r = Math.max(.4, (1 - s.z) * 2.2 * dpr);
          if (x < 0 || x > W || y < 0 || y > H) { s.z = 1; continue; }
          ctx.globalAlpha = Math.min(1, (1 - s.z) * 1.4); ctx.fillStyle = s.z < .3 ? s.c : '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
    } else if (kind === 'waves') {
      let t = 0;
      draw = dt => {
        t += dt * .0004; ctx.clearRect(0, 0, W, H);
        const rows = 26, horizon = H * .42;
        for (let r = 0; r < rows; r++) {
          const z = r / rows, persp = 1 / (1 + z * 6), y0 = horizon + (H - horizon) * persp * .95;
          const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, SPEC[0]); g.addColorStop(.5, SPEC[1]); g.addColorStop(1, SPEC[2]);
          ctx.strokeStyle = g; ctx.globalAlpha = .15 + persp * .55; ctx.lineWidth = Math.max(1, persp * 2.4 * dpr); ctx.beginPath();
          for (let i = 0; i <= 80; i++) { const u = i / 80, x = W * u, y = y0 + Math.sin(u * 9 + t * 2 + z * 6) * 26 * persp * dpr + Math.sin(u * 3.1 - t + z * 2) * 40 * persp * dpr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
    } else if (kind === 'shapes') {
      const phi = (1 + Math.sqrt(5)) / 2;
      const ico = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]];
      const edges = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(...ico[i].map((v, k) => v - ico[j][k])); if (Math.abs(d - 2) < .01) edges.push([i, j]); }
      const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], oe = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
      const bodies = [{ v: ico, e: edges, x: .28, y: .38, s: .16, c: SPEC[1], sp: 1 }, { v: oct, e: oe, x: .76, y: .62, s: .2, c: SPEC[0], sp: -.7 }, { v: ico, e: edges, x: .62, y: .2, s: .07, c: SPEC[2], sp: 1.4 }];
      let t = 0;
      draw = dt => {
        t += dt * .00025; ctx.clearRect(0, 0, W, H);
        for (const b of bodies) {
          const a = t * b.sp, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(a * .7), sb = Math.sin(a * .7), R = Math.min(W, H) * b.s, fl = Math.sin(t * 2 + b.x * 9) * 12 * dpr;
          const P = b.v.map(([x, y, z]) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca, y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, p = 3 / (3 + z2 * .5); return [W * b.x + x1 * R * p, H * b.y + y1 * R * p + fl, z2]; });
          ctx.strokeStyle = b.c; ctx.lineWidth = 1.2 * dpr; ctx.shadowColor = b.c; ctx.shadowBlur = 12 * dpr;
          for (const [i, j] of b.e) { ctx.globalAlpha = .35 + .25 * ((P[i][2] + P[j][2]) / 4 + .5); ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); }
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      };
    } else {
      const B = SPEC.concat('#3c1d6b').map((c, i) => ({ c, a: rnd(0, 6), r: rnd(.35, .6), sp: rnd(.6, 1.2) * (i % 2 ? 1 : -1) }));
      let t = 0;
      draw = dt => {
        t += dt * .0001; ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
        for (const b of B) { const x = W * (.5 + Math.cos(t * b.sp + b.a) * .32), y = H * (.5 + Math.sin(t * b.sp * 1.3 + b.a) * .3), R = Math.max(W, H) * b.r, g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, b.c + '55'); g.addColorStop(1, b.c + '00'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
        ctx.globalCompositeOperation = 'source-over';
      };
    }
    const loop = ts => { raf = requestAnimationFrame(loop); if (document.hidden || ts - last < 33) return; const dt = Math.min(100, ts - (last || ts)); last = ts; draw?.(dt); };
    if (still) { for (let i = 0; i < 40; i++) draw(33); } else raf = requestAnimationFrame(loop);
  }

  window.kbg = {
    PRESETS, P3D,
    apply(g) { cur = g || null; write(cur); mount(cur); },
    sync(server) { let g = null; try { g = typeof server === 'string' ? JSON.parse(server) : server || null; } catch { g = null; } if (JSON.stringify(g) !== JSON.stringify(cur)) this.apply(g); },
    get: () => cur,
  };
  cur = read();
  const boot = () => mount(cur);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
