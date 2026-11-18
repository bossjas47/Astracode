// เครื่องมือในเครื่อง: ดูโฟลเดอร์ อ่านไฟล์ และรันคำสั่ง จำกัดอยู่ในโฟลเดอร์งานที่ผู้ใช้เลือกเท่านั้น
const fs = require('fs/promises');
const path = require('path');
const { exec, spawn } = require('child_process');

function safePath(root, p) {
  if (!root) throw new Error('ยังไม่ได้เลือกโฟลเดอร์งาน');
  const r = path.resolve(root), abs = path.resolve(r, String(p ?? '.'));
  if (abs !== r && !abs.startsWith(r + path.sep)) throw new Error('ไฟล์นี้อยู่นอกโฟลเดอร์งาน ไม่อนุญาต');
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

// รันคำสั่งให้หน้าเว็บ: ส่งผลระหว่างทางทีละส่วน (onOut) · หมดเวลา/กดหยุด = ฆ่าทั้งกลุ่ม process (Windows ต้องใช้ taskkill /T)
const OUT_MAX = 200e3;
function runCmd(cwd, cmd, { onOut = () => {}, timeout = 600e3, signal } = {}) {
  return new Promise(ok => {
    const win = process.platform === 'win32';
    const p = spawn(cmd, { cwd, shell: true, windowsHide: true, detached: !win, env: { ...process.env, FORCE_COLOR: '0' } });
    let stdout = '', stderr = '', done = false;
    const kill = () => { try { win ? exec(`taskkill /pid ${p.pid} /T /F`) : process.kill(-p.pid, 'SIGKILL'); } catch { /* จบไปแล้ว */ } };
    const t = setTimeout(() => { stderr += '\n(หมดเวลา ' + timeout / 1000 + ' วินาที หยุดคำสั่งแล้ว)'; kill(); }, timeout);
    signal?.addEventListener('abort', () => { stderr += '\n(หยุดแล้ว)'; kill(); });
    const take = (k, b) => { const s = b.toString('utf8'); if (k === 'out') { if (stdout.length < OUT_MAX) stdout += s; } else if (stderr.length < OUT_MAX) stderr += s; onOut(k, s); };
    p.stdout.on('data', b => take('out', b)); p.stderr.on('data', b => take('err', b));
    const end = code => { if (done) return; done = true; clearTimeout(t); ok({ code: code ?? 1, stdout, stderr }); };
    p.on('error', e => { stderr += e.message; end(1); }); p.on('close', end);
  });
}

module.exports = { localTool, safePath, runCmd };
