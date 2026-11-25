// รัน Python บนคลาวด์ (แชต run_python / ปุ่มรันในหน้า Code) ในเครื่องเสมือนแยกต่อผู้ใช้
// รูปแบบเดียวกับตัวรันในเบราว์เซอร์ (Pyodide): ไฟล์โปรเจกต์อยู่ที่โฟลเดอร์งาน · ไฟล์แนบอยู่ที่ /data · ไฟล์ผลลัพธ์เขียนลง /out · กราฟ matplotlib ส่งกลับเป็นรูป
// ข้อดีกว่าในเบราว์เซอร์: ต่อเน็ตได้ · ติดตั้งแพ็กเกจที่ขาดให้เอง (pip) · เร็วและหน่วยความจำมากกว่า · ไม่ต้องโหลด Python 10MB ลงมือถือ
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const BASE = process.env.PY_ROOT || '/pyrun', PROJ = path.join(BASE, 'project'), DATA = process.env.PY_DATA || '/data', OUT = process.env.PY_OUT || '/out', FIGS = path.join(BASE, '.figs');
const OUT_CAP = 200e3, FILE_CAP = 8e6, TOTAL_CAP = 20e6;
// ชื่อที่ import ≠ ชื่อแพ็กเกจบน pip
const PIP_NAME = { sklearn: 'scikit-learn', cv2: 'opencv-python-headless', PIL: 'pillow', bs4: 'beautifulsoup4', yaml: 'pyyaml', docx: 'python-docx', pptx: 'python-pptx', fitz: 'pymupdf', dateutil: 'python-dateutil', Crypto: 'pycryptodome', dotenv: 'python-dotenv', telegram: 'python-telegram-bot', jwt: 'pyjwt', serial: 'pyserial', skimage: 'scikit-image', google: 'google-api-python-client' };
const MOD_RE = /^[A-Za-z_][\w]{0,60}$/;
// ตัวห่อ: รัน main แบบสคริปต์ปกติ แล้วเก็บกราฟ matplotlib ที่ยังเปิดอยู่เป็น PNG
const WRAP = `import os, sys, runpy
os.environ.setdefault('MPLBACKEND', 'Agg')
os.chdir(sys.argv[1]); sys.path.insert(0, sys.argv[1]); sys.argv = [sys.argv[2]]
try:
    runpy.run_path(sys.argv[0], run_name='__main__')
finally:
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        for i, n in enumerate(plt.get_fignums()[:8]):
            plt.figure(n).savefig(os.path.join(${JSON.stringify(FIGS)}, 'fig%d.png' % i), format='png', dpi=110, bbox_inches='tight')
`;

const safe = (root, p) => { const full = path.resolve(root, p); if (full !== root && !full.startsWith(root + path.sep)) throw new Error('พาธไฟล์ไม่ถูกต้อง: ' + p); return full; };
async function reset() { for (const d of [PROJ, DATA, OUT, FIGS]) { await fs.rm(d, { recursive: true, force: true }); await fs.mkdir(d, { recursive: true }); } }
async function put(files) {
  let total = 0;
  for (const f of files || []) {
    const p = String(f.path || ''), c = f.content ?? ''; if (!p) continue;
    const buf = typeof c === 'string' && c.startsWith('data:') ? Buffer.from(c.slice(c.indexOf(',') + 1), 'base64') : Buffer.from(String(c));
    total += buf.length; if (total > TOTAL_CAP) throw new Error('ไฟล์รวมใหญ่เกิน 20MB');
    const full = p.startsWith('/data/') ? safe(DATA, p.slice(6)) : safe(PROJ, p.replace(/^\/+/, ''));
    await fs.mkdir(path.dirname(full), { recursive: true }); await fs.writeFile(full, buf);
  }
}
function run(main, ms) {
  return new Promise(ok => {
    let out = '', cut = false; const add = d => { if (out.length < OUT_CAP) out += d; else cut = true; };
    const ch = spawn('python3', ['-u', '-c', WRAP, PROJ, main], { cwd: PROJ, env: { ...process.env, MPLBACKEND: 'Agg', PYTHONIOENCODING: 'utf-8', HOME: BASE }, detached: true });
    const t = setTimeout(() => { add(`\n[หยุด: รันนานเกิน ${Math.round(ms / 1000)} วินาที]`); try { process.kill(-ch.pid, 'SIGKILL'); } catch { ch.kill('SIGKILL'); } }, ms);
    ch.stdout.on('data', d => add(d.toString('utf8'))); ch.stderr.on('data', d => add(d.toString('utf8')));
    ch.on('close', code => { clearTimeout(t); ok({ out: out + (cut ? '\n…(ผลลัพธ์ยาวเกิน ตัดท้าย)' : ''), code }); });
    ch.on('error', e => { clearTimeout(t); ok({ out: 'Error: ' + e.message, code: 1 }); });
  });
}
function pipInstall(pkg) {
  return new Promise(ok => { const ch = spawn('python3', ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', pkg], { env: { ...process.env, PIP_BREAK_SYSTEM_PACKAGES: '1' } }); let err = ''; ch.stderr.on('data', d => { err += d; }); const t = setTimeout(() => ch.kill('SIGKILL'), 120e3); ch.on('close', c => { clearTimeout(t); ok(c === 0 ? '' : err.slice(-300) || 'ติดตั้งไม่สำเร็จ'); }); ch.on('error', e => { clearTimeout(t); ok(e.message); }); });
}
async function collect() {
  const imgs = [], outs = [];
  for (const n of (await fs.readdir(FIGS).catch(() => [])).sort()) imgs.push('data:image/png;base64,' + (await fs.readFile(path.join(FIGS, n))).toString('base64'));
  let total = 0;
  for (const n of (await fs.readdir(OUT).catch(() => [])).slice(0, 10)) {
    const p = path.join(OUT, n), st = await fs.stat(p).catch(() => null); if (!st?.isFile() || st.size > FILE_CAP || (total += st.size) > TOTAL_CAP) continue;
    outs.push({ name: n, b64: (await fs.readFile(p)).toString('base64') });
  }
  return { imgs, outs };
}
// files: [{ path, content }] (พาธขึ้นต้น /data/ = ไฟล์แนบ · ที่เหลือ = ไฟล์โปรเจกต์ · content แบบ data: = ไฟล์ไบนารี) · main = ไฟล์ที่รัน
async function pyExec({ files = [], main = 'main.py', timeoutMs = 90e3 } = {}) {
  const t0 = Date.now(), ms = Math.min(Math.max(+timeoutMs || 90e3, 5e3), 120e3); await reset(); await put(files);
  if (!/^[\w./-]{1,200}\.py$/.test(main)) throw new Error('ไฟล์ที่รันต้องเป็น .py');
  let r = await run(main, ms), installed = [];
  for (let i = 0; i < 3; i++) { // ขาดแพ็กเกจ: ติดตั้งให้แล้วรันใหม่ (สูงสุด 3 ตัว)
    const mod = /ModuleNotFoundError: No module named '([\w.]+)'/.exec(r.out)?.[1]?.split('.')[0]; if (!mod || !MOD_RE.test(mod) || installed.includes(mod)) break;
    const e = await pipInstall(PIP_NAME[mod] || mod); installed.push(mod); if (e) { r.out += `\n[ติดตั้งแพ็กเกจ ${PIP_NAME[mod] || mod} ไม่สำเร็จ: ${e}]`; break; }
    await fs.rm(OUT, { recursive: true, force: true }); await fs.mkdir(OUT, { recursive: true }); await fs.rm(FIGS, { recursive: true, force: true }); await fs.mkdir(FIGS, { recursive: true });
    r = await run(main, Math.max(5e3, ms - (Date.now() - t0)));
  }
  return { out: (installed.length ? `[ติดตั้งแพ็กเกจให้แล้ว: ${installed.map(m => PIP_NAME[m] || m).join(', ')}]\n` : '') + r.out, code: r.code, ms: Date.now() - t0, ...(await collect()) };
}
module.exports = { pyExec, PIP_NAME };
