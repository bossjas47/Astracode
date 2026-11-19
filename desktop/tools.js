// เครื่องมือในเครื่อง: ดูโฟลเดอร์ อ่านไฟล์ และรันคำสั่ง จำกัดอยู่ในโฟลเดอร์งานที่ผู้ใช้เลือกเท่านั้น
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// path จริงหลังตาม symlink: ส่วนที่ยังไม่มีบนดิสก์ (ไฟล์ที่กำลังจะสร้าง) ต่อท้ายโฟลเดอร์แม่ที่มีอยู่จริง
function realOf(abs) {
  const rest = [];
  for (let cur = abs; ; cur = path.dirname(cur)) {
    try { return path.join(fsSync.realpathSync.native(cur), ...rest.reverse()); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; if (path.dirname(cur) === cur) return abs; rest.push(path.basename(cur)); }
  }
}
const inside = (r, abs) => abs === r || abs.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
function safePath(root, p) {
  if (!root) throw new Error('ยังไม่ได้เลือกโฟลเดอร์งาน');
  const r = path.resolve(root), abs = path.resolve(r, String(p ?? '.'));
  if (!inside(r, abs)) throw new Error('ไฟล์นี้อยู่นอกโฟลเดอร์งาน ไม่อนุญาต');
  if (!inside(realOf(r), realOf(abs))) throw new Error('ไฟล์นี้ชี้ (symlink) ออกนอกโฟลเดอร์งาน ไม่อนุญาต'); // กัน symlink ในโฟลเดอร์ที่ชี้ไปไฟล์อื่นในเครื่อง
  return abs;
}

async function localTool(root, name, a = {}) {
  if (name === 'list_dir') {
    const items = await fs.readdir(safePath(root, a.path), { withFileTypes: true });
    return items.filter(x => !['node_modules', '.git'].includes(x.name)).slice(0, 500).map(x => (x.isDirectory() ? '[dir] ' : '') + x.name).join('\n') || '(ว่าง)';
  }
  if (name === 'read_file') {
    const f = safePath(root, a.path), st = await fs.stat(f);
    if (st.size > 2e6) return `Error: ไฟล์ใหญ่ ${Math.round(st.size / 1e6)}MB อ่านทั้งไฟล์ไม่ได้`;
    const t = await fs.readFile(f, 'utf8'); return t.includes('\u0000') ? 'Error: ไม่ใช่ไฟล์ข้อความ' : t;
  }
  throw new Error('ไม่รู้จักเครื่องมือ ' + name);
}

// รันคำสั่งให้หน้าเว็บ: ส่งผลระหว่างทางทีละส่วน (onOut) · หมดเวลา/กดหยุด = ฆ่าทั้งกลุ่ม process (Windows ต้องใช้ taskkill /T) · timeout 0 = ไม่จำกัด (dev server)
// ปิด stdin: คำสั่งที่ถาม y/n ได้คำตอบว่าง แล้วจบเอง ไม่ค้างรอ · Windows: chcp 65001 ให้ผลภาษาไทยเป็น UTF-8 (ค่าเดิม code page 874 อ่านแล้วเพี้ยน)
const OUT_MAX = 200e3;
function runCmd(cwd, cmd, { onOut = () => {}, timeout = 600e3, signal } = {}) {
  return new Promise(ok => {
    const win = process.platform === 'win32';
    const p = spawn(win ? 'chcp 65001>nul & ' + cmd : cmd, { cwd, shell: true, windowsHide: true, detached: !win, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', npm_config_yes: 'true', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    let stdout = '', stderr = '', done = false;
    const kill = () => { try { win ? exec(`taskkill /pid ${p.pid} /T /F`) : process.kill(-p.pid, 'SIGKILL'); } catch { /* จบไปแล้ว */ } };
    const t = timeout ? setTimeout(() => { stderr += '\n(หมดเวลา ' + timeout / 1000 + ' วินาที หยุดคำสั่งแล้ว)'; kill(); }, timeout) : null;
    signal?.addEventListener('abort', () => { stderr += '\n(หยุดแล้ว)'; kill(); });
    const take = (k, b) => { const s = b.toString('utf8'); if (k === 'out') { if (stdout.length < OUT_MAX) stdout += s; } else if (stderr.length < OUT_MAX) stderr += s; onOut(k, s); };
    p.stdout.on('data', b => take('out', b)); p.stderr.on('data', b => take('err', b));
    const end = code => { if (done) return; done = true; clearTimeout(t); ok({ code: code ?? 1, stdout, stderr }); };
    p.on('error', e => { stderr += e.message; end(1); }); p.on('close', end);
  });
}
// dev server: เห็นพอร์ตในผลลัพธ์ (localhost:5173 ฯลฯ) · คำสั่งที่ไม่จบเอง ต้องรันเบื้องหลังแทนรันแล้วรอ
const portOf = s => +(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/.exec(String(s).replace(/\x1b\[[0-9;]*m/g, '')) || [])[1] || null;
const SERVER_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview|watch)\b|\b(vite|nodemon|live-server|http-server|serve)\b(?!-)|\bnext\s+(dev|start)\b|\bpython3?\s+-m\s+http\.server\b|\bflask\s+run\b|\buvicorn\b|\bphp\s+-S\b|\bng\s+serve\b|--watch\b/i;
const isServer = cmd => SERVER_CMD.test(String(cmd));

// คำสั่งที่ลบ/ทับข้อมูล ปิดเครื่อง แก้ระบบ ส่งงานขึ้นที่อื่น หรือโหลดสคริปต์จากเน็ตมารัน: ถามทุกครั้งแม้เปิดรันอัตโนมัติ
const DANGER = /\b(rm|rmdir|rd|del|erase|format|mkfs|diskpart|shutdown|reboot|reg|regedit|taskkill|kill|pkill|chmod|chown|sudo|runas|takeown|icacls|bcdedit|cipher|move|mv|dd)\b|remove-item|format-volume|stop-process|set-executionpolicy|invoke-expression|\biex\b|\biwr\b|invoke-webrequest|git\s+(push|reset|clean|checkout|rebase|branch\s+-D)|--force|\b(curl|wget)\b[^\n]*\|\s*(sh|bash|pwsh|powershell)|npm\s+(publish|unpublish)|>\s*[\w./\\:-]*\.(env|bat|cmd|ps1)\b/i;
const isDanger = cmd => DANGER.test(String(cmd));

module.exports = { localTool, safePath, runCmd, isDanger, isServer, portOf };
