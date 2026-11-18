// เครื่องมือในเครื่อง: อ่าน/เขียนไฟล์และรันคำสั่ง จำกัดอยู่ในโฟลเดอร์งานที่ผู้ใช้เลือกเท่านั้น
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');

const LOCAL_TOOLS = [
  { type: 'function', function: { name: 'list_dir', description: 'List files and folders in a directory of the workspace.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative path, "." for the workspace root' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a text file in the workspace.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a text file in the workspace with the full content.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'run_command', description: 'Run a shell command in the workspace folder (Windows: cmd.exe). Returns exit code, stdout and stderr. Times out after 120 seconds.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
];
const NEEDS_OK = new Set(['write_file', 'run_command']); // แก้ไฟล์ / รันคำสั่ง ต้องให้ผู้ใช้อนุญาต (ยกเว้นเปิดอนุญาตอัตโนมัติ)

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
  if (name === 'write_file') {
    const f = safePath(root, a.path); await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, String(a.content ?? ''), 'utf8'); return `เขียน ${a.path} แล้ว (${String(a.content ?? '').length} ตัวอักษร)`;
  }
  if (name === 'run_command') {
    const cmd = String(a.command || '').trim(); if (!cmd) return 'Error: คำสั่งว่าง';
    return await new Promise(ok => exec(cmd, { cwd: safePath(root, '.'), timeout: 120e3, maxBuffer: 2e6, windowsHide: true }, (e, so, se) =>
      ok(`exit ${e ? (e.killed ? 'timeout' : e.code ?? 1) : 0}\n${so ? 'stdout:\n' + so : ''}${se ? '\nstderr:\n' + se : ''}`.trim())));
  }
  throw new Error('ไม่รู้จักเครื่องมือ ' + name);
}

module.exports = { LOCAL_TOOLS, NEEDS_OK, localTool, safePath };
