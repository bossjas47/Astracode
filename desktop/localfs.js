// ไฟล์ในโฟลเดอร์ที่ผู้ใช้เชื่อมกับโปรเจกต์บนเว็บ: สแกนขึ้นเว็บ / เขียน ลบ ย้าย ตามที่เว็บแก้ (จำกัดในโฟลเดอร์ที่เลือกเท่านั้น)
const fs = require('fs/promises');
const path = require('path');
const { safePath } = require('./tools');

// ขีดจำกัดเดียวกับโปรเจกต์บนเว็บ (src/projects.js): 300 ไฟล์ · ไฟล์ละ 500KB · รวม 5MB
const FILE_LIMIT = 500e3, PROJECT_LIMIT = 5e6, MAX_FILES = 300;
const SKIP_DIR = /^(node_modules|\.git|__MACOSX|dist|build|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|\.idea|\.vs|bin|obj|target)$/i;
const IMG = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', ico: 'x-icon' };
const BAD = /[\x00-\x1f<>:"|?*\\]/;

async function scanFolder(root) {
  const out = [], skipped = []; let total = 0;
  const walk = async rel => {
    let items; try { items = await fs.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const it of items) {
      const p = rel ? rel + '/' + it.name : it.name;
      if (it.isDirectory()) { if (!SKIP_DIR.test(it.name) && !it.name.startsWith('.')) await walk(p); continue; }
      if (!it.isFile() || it.name === '.DS_Store' || it.name === '.env') continue; // .env ไม่ขึ้นเว็บ (ตัวแปรลับอยู่แยก)
      if (p.length > 200 || BAD.test(p)) { skipped.push(p); continue; }
      if (out.length >= MAX_FILES) { skipped.push(p); continue; }
      const abs = path.join(root, p), st = await fs.stat(abs).catch(() => null); if (!st) continue;
      const ext = p.split('.').pop().toLowerCase();
      let content;
      if (IMG[ext]) { if (st.size > 300e3) { skipped.push(p); continue; } content = `data:image/${IMG[ext]};base64,` + (await fs.readFile(abs)).toString('base64'); }
      else {
        if (st.size > FILE_LIMIT) { skipped.push(p); continue; }
        const buf = await fs.readFile(abs); if (buf.includes(0)) { skipped.push(p); continue; } // ไฟล์ไบนารี
        content = buf.toString('utf8');
      }
      if (content.length > FILE_LIMIT || total + content.length > PROJECT_LIMIT) { skipped.push(p); continue; }
      total += content.length; out.push({ path: p, content });
    }
  };
  await walk('');
  return { files: out, skipped };
}

// เขียนเฉพาะเมื่อเนื้อหาเปลี่ยน (เว็บส่งมาซ้ำได้ไม่เปลือง) · รูปจากเว็บเป็น data URL → เขียนเป็นไฟล์รูปจริง
async function writeRel(root, rel, content) {
  const f = safePath(root, rel), s = String(content ?? '');
  const m = /^data:image\/[\w.+-]+;base64,(.*)$/s.exec(s), data = m ? Buffer.from(m[1], 'base64') : Buffer.from(s, 'utf8');
  const cur = await fs.readFile(f).catch(() => null);
  if (cur && cur.equals(data)) return false;
  await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, data); return true;
}
async function removeRel(root, rel) {
  const f = safePath(root, rel); if (f === path.resolve(root)) throw new Error('ลบโฟลเดอร์งานทั้งโฟลเดอร์ไม่ได้');
  await fs.rm(f, { recursive: true, force: true });
}
async function renameRel(root, from, to) {
  const a = safePath(root, from), b = safePath(root, to);
  await fs.mkdir(path.dirname(b), { recursive: true }); await fs.rename(a, b);
}

module.exports = { scanFolder, writeRel, removeRel, renameRel, FILE_LIMIT, MAX_FILES };
