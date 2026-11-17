import { err, hex, json, rand, sha, userErr } from './core.js';
import { status } from './jobs.js';
import { notify } from './billing.js';
// ---------- projects (โหมด Code) ----------
export const PATH_RE = /^(?!.*\.\.)(?!.*\/\/)(?!.*\/$)[^\/\\\x00-\x1f<>:"|?*][^\\\x00-\x1f<>:"|?*]{0,199}$/;
export const FILE_LIMIT = 500e3, PROJECT_LIMIT = 5e6, FILES_PER_PROJECT = 300, PROJECTS_PER_USER = 20;
export const STARTER = {
  'index.html': '<!DOCTYPE html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>โปรเจกต์ใหม่</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>สวัสดี AstraCode</h1>\n  <button id="btn">กดเลย</button>\n  <script src="script.js"></script>\n</body>\n</html>\n',
  'style.css': 'body {\n  font-family: system-ui, sans-serif;\n  background: #111;\n  color: #f5f5f7;\n  padding: 24px;\n}\nbutton {\n  padding: 10px 20px;\n  border-radius: 999px;\n  border: 0;\n  background: #0071e3;\n  color: #fff;\n}\n',
  'script.js': "document.getElementById('btn').onclick = () => {\n  console.log('กดปุ่มแล้ว');\n  alert('ทำงานแล้ว!');\n};\n",
  'main.py': 'def greet(name):\n    return f"สวัสดี {name}"\n\nprint(greet("AstraCode"))\n',
};
export const TEMPLATES = {
  starter: STARTER,
  tailwind: {
    'index.html': '<!DOCTYPE html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>โปรเจกต์ใหม่</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-6">\n  <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-center space-y-4">\n    <h1 class="text-2xl font-semibold">สวัสดี AstraCode</h1>\n    <button id="btn" class="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium">เริ่มต้น</button>\n  </div>\n  <script type="module" src="script.js"></script>\n</body>\n</html>\n',
    'script.js': "document.getElementById('btn').onclick = () => console.log('Tailwind starter ready');\n",
  },
  react: { // React + Babel จาก CDN: เปิดแสดงผลได้ทันที ไม่ต้อง npm install
    'index.html': '<!DOCTYPE html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>React</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div id="root"></div>\n  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>\n  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>\n  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n  <script type="text/babel" src="app.jsx"></script>\n</body>\n</html>\n',
    'app.jsx': 'function App() {\n  const [n, setN] = React.useState(0);\n  return (\n    <main>\n      <h1>สวัสดี React</h1>\n      <button onClick={() => setN(n + 1)}>กดแล้ว {n} ครั้ง</button>\n    </main>\n  );\n}\nReactDOM.createRoot(document.getElementById("root")).render(<App />);\n',
    'style.css': 'body { font-family: system-ui, sans-serif; background: #111; color: #f5f5f7; padding: 24px; }\nbutton { padding: 10px 20px; border-radius: 999px; border: 0; background: #0a84ff; color: #fff; font-size: 16px; }\n',
  },
  node: {
    'package.json': '{\n  "name": "astracode-app",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "node index.js"\n  }\n}\n',
    'index.js': 'const name = "AstraCode";\nconsole.log(`Hello from Node.js, ${name}!`);\n',
  },
  python: {
    'main.py': 'def greet(name):\n    return f"สวัสดี {name}"\n\nif __name__ == "__main__":\n    print(greet("AstraCode"))\n',
  },
};
// เก็บเวอร์ชันเก่าของไฟล์ก่อนถูกเขียนทับ (แก้เอง: ทุก 5 นาที, AI/อัปโหลด/Git: ทุกครั้ง) เก็บล่าสุด 30 เวอร์ชันต่อไฟล์
export async function snapshot(env, pid, files, source) {
  const DB = env.DB, now = Date.now(), ops = [];
  for (const f of files) {
    const cur = await DB.prepare('SELECT content FROM project_files WHERE project_id=? AND path=?').bind(pid, f.path).first();
    if (!cur || cur.content === f.content) continue;
    if (source === 'edit') { const last = await DB.prepare('SELECT created_at FROM file_versions WHERE project_id=? AND path=? ORDER BY id DESC LIMIT 1').bind(pid, f.path).first(); if (last && now - last.created_at < 300e3) continue; }
    ops.push(DB.prepare('INSERT INTO file_versions (project_id,path,content,source,created_at) VALUES (?,?,?,?,?)').bind(pid, f.path, cur.content, source, now),
      DB.prepare('DELETE FROM file_versions WHERE project_id=?1 AND path=?2 AND id NOT IN (SELECT id FROM file_versions WHERE project_id=?1 AND path=?2 ORDER BY id DESC LIMIT 30)').bind(pid, f.path));
  }
  for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
}
export async function projects(req, env, u, path, url) {
  const DB = env.DB, M = req.method, now = Date.now();
  if (path === '/api/gallery') { // โปรเจกต์เด่นที่แอดมินเลือก (ต้องแชร์อยู่)
    return json((await DB.prepare('SELECT p.name, p.blurb, COALESCE(p.slug,p.share_token) link, p.updated_at, (SELECT COUNT(*) FROM project_files f WHERE f.project_id=p.id) files FROM projects p WHERE p.featured=1 AND p.share_token IS NOT NULL ORDER BY p.updated_at DESC LIMIT 24').all()).results);
  }
  if (path === '/api/projects/remix' && M === 'POST') { // คัดลอกโปรเจกต์ที่แชร์เป็นของตัวเอง (ต้นฉบับไม่เปลี่ยน)
    const t = String((await req.json().catch(() => ({}))).token || '').toLowerCase();
    const src = /^[a-z0-9][a-z0-9-]{2,47}$/.test(t) && await DB.prepare('SELECT id,name,user_id FROM projects WHERE share_token IS NOT NULL AND (share_token=?1 OR slug=?1)').bind(t).first();
    if (!src) return err('ไม่พบโปรเจกต์นี้ หรือเจ้าของยกเลิกการแชร์แล้ว', 404);
    if ((await DB.prepare('SELECT COUNT(*) n FROM projects WHERE user_id=?').bind(u.id).first()).n >= PROJECTS_PER_USER) return err(`สร้างได้สูงสุด ${PROJECTS_PER_USER} โปรเจกต์`);
    const id = (await DB.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').bind(u.id, (src.user_id === u.id ? 'สำเนา ' : 'Remix ') + src.name.slice(0, 50), now, now).first()).id;
    await DB.prepare('INSERT INTO project_files (project_id,path,content,updated_at) SELECT ?,path,content,? FROM project_files WHERE project_id=?').bind(id, now, src.id).run(); // ไม่คัดลอก .env ที่ซีลไว้/GitHub/ลิงก์แชร์
    return json({ id });
  }
  if (path === '/api/projects') {
    if (M === 'GET') return json((await DB.prepare(`SELECT p.id,p.name,p.updated_at,COUNT(f.path) files,COALESCE(SUM(length(f.content)),0) size
      FROM projects p LEFT JOIN project_files f ON f.project_id=p.id WHERE p.user_id=? GROUP BY p.id ORDER BY p.updated_at DESC`).bind(u.id).all()).results);
    if (M === 'POST') {
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 60);
      if (!name) return err('ตั้งชื่อโปรเจกต์ก่อน');
      if ((await DB.prepare('SELECT COUNT(*) n FROM projects WHERE user_id=?').bind(u.id).first()).n >= PROJECTS_PER_USER) return err(`สร้างได้สูงสุด ${PROJECTS_PER_USER} โปรเจกต์`);
      const id = (await DB.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').bind(u.id, name, now, now).first()).id;
      let tpl = b.empty || b.template === 'empty' ? null : (TEMPLATES[b.template] || STARTER);
      if (b.files && typeof b.files === 'object') { // สร้างจากไฟล์ที่ส่งมา (ปุ่ม "ส่งไป Code" ของ Canvas ในแชต)
        const ents = Object.entries(b.files);
        if (!ents.length || ents.length > 20 || ents.some(([p, c]) => !PATH_RE.test(p) || typeof c !== 'string' || c.length > FILE_LIMIT)) { await DB.prepare('DELETE FROM projects WHERE id=?').bind(id).run(); return err('ไฟล์ที่ส่งมาไม่ถูกต้องหรือใหญ่เกินไป'); }
        tpl = Object.fromEntries(ents);
      }
      if (tpl) await DB.batch(Object.entries(tpl).map(([p, c]) => DB.prepare('INSERT INTO project_files VALUES (?,?,?,?)').bind(id, p, c, now)));
      return json({ ok: true, id });
    }
  }
  const r = path.match(/^\/api\/projects\/(\d+)(\/[a-z]+(?:\/[a-z0-9]+)?)?$/);
  if (!r) return err('not found', 404);
  const pid = +r[1], sub = r[2] || '';
  const p = await DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(pid, u.id).first();
  if (!p) return err('ไม่พบโปรเจกต์', 404);
  const touch = DB.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now, pid);
  if (sub.startsWith('/github')) return github(req, env, u, p, sub, now);
  // ตรวจขนาดรวมและจำนวนไฟล์ หลังเขียนไฟล์ชุดนี้
  const fits = async files => {
    const cur = (await DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=?').bind(pid).all()).results;
    const sizes = new Map(cur.map(x => [x.path, x.n]));
    for (const f of files) sizes.set(f.path, f.content.length);
    if (sizes.size > FILES_PER_PROJECT) return `ไฟล์เกิน ${FILES_PER_PROJECT} ไฟล์ต่อโปรเจกต์`;
    if ([...sizes.values()].reduce((a, b) => a + b, 0) > PROJECT_LIMIT) return 'โปรเจกต์ใหญ่เกิน 5MB';
    return null;
  };
  const valid = f => typeof f?.path === 'string' && PATH_RE.test(f.path) && typeof f.content === 'string' && f.content.length <= FILE_LIMIT;

  if (!sub) {
    if (M === 'GET') return json({ id: p.id, name: p.name, instructions: p.instructions || '', gh: p.gh_repo ? { repo: p.gh_repo, branch: p.gh_branch, synced: p.gh_sha } : null, files: (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=? ORDER BY path').bind(pid).all()).results });
    if (M === 'PUT') {
      const b = await req.json();
      if ('instructions' in b) {
        await DB.prepare('UPDATE projects SET instructions=?, updated_at=? WHERE id=?').bind(String(b.instructions || '').trim().slice(0, 3000), now, pid).run();
        return json({ ok: true });
      }
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) return err('ชื่อว่าง');
      await DB.prepare('UPDATE projects SET name=?, updated_at=? WHERE id=?').bind(name, now, pid).run();
      return json({ ok: true });
    }
    if (M === 'DELETE') {
      await DB.batch([
        DB.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE project_id=? AND user_id=?)').bind(pid, u.id),
        DB.prepare('DELETE FROM chats WHERE project_id=? AND user_id=?').bind(pid, u.id),
        DB.prepare('DELETE FROM project_files WHERE project_id=?').bind(pid),
        DB.prepare('DELETE FROM projects WHERE id=?').bind(pid),
      ]);
      return json({ ok: true });
    }
  }
  if (sub === '/file') {
    if (M === 'PUT') {
      const f = await req.json();
      if (!valid(f)) return err('ชื่อไฟล์ไม่ถูกต้อง หรือไฟล์ใหญ่เกิน 500KB');
      const no = await fits([f]); if (no) return err(no);
      await snapshot(env, pid, [f], 'edit');
      await DB.batch([DB.prepare('INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at').bind(pid, f.path, f.content, now), touch]);
      return json({ ok: true });
    }
    if (M === 'DELETE') { // path ลงท้าย / = ลบทั้งโฟลเดอร์
      const fp = url.searchParams.get('path') || '';
      await DB.batch([fp.endsWith('/') ? DB.prepare('DELETE FROM project_files WHERE project_id=? AND substr(path,1,?)=?').bind(pid, fp.length, fp)
        : DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(pid, fp), touch]);
      return json({ ok: true });
    }
  }
  if (sub === '/rename' && M === 'POST') { // เปลี่ยนชื่อไฟล์ หรือโฟลเดอร์ (ลงท้าย /)
    const { from, to } = await req.json();
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !PATH_RE.test(to.replace(/\/$/, ''))) return err('ชื่อไม่ถูกต้อง');
    const rows = (await DB.prepare('SELECT path FROM project_files WHERE project_id=?').bind(pid).all()).results.map(x => x.path);
    const moves = rows.filter(x => from.endsWith('/') ? x.startsWith(from) : x === from).map(x => [x, from.endsWith('/') ? to.replace(/\/?$/, '/') + x.slice(from.length) : to]);
    if (!moves.length) return err('ไม่พบไฟล์', 404);
    if (moves.some(([, n]) => rows.includes(n) && !moves.some(([o]) => o === n))) return err('มีไฟล์ชื่อนี้อยู่แล้ว');
    await DB.batch([...moves.map(([o, n]) => DB.prepare('UPDATE project_files SET path=?, updated_at=? WHERE project_id=? AND path=?').bind(n, now, pid, o)), touch]);
    return json({ ok: true });
  }
  if (sub === '/env') { // ตัวแปรลับของโปรเจกต์ (KEY=VALUE): เก็บแบบเข้ารหัส ไม่ปนกับไฟล์ (AI/GitHub/zip ไม่เห็น) ส่งให้เทอร์มินัลตอนรันเท่านั้น
    if (M === 'GET') return json({ text: p.env_sealed ? await unseal(env, p.env_sealed).catch(() => '') : '' });
    if (M !== 'PUT') return err('method not allowed', 405);
    const text = String((await req.json()).text ?? '').slice(0, 8000);
    await DB.prepare('UPDATE projects SET env_sealed=? WHERE id=?').bind(text.trim() ? await seal(env, text) : null, pid).run();
    return json({ ok: true });
  }
  if (sub === '/gallery') { // เจ้าของส่งเข้าแกลเลอรี (featured=2 รอแอดมินอนุมัติ) · DELETE = ถอนออก
    if (M === 'DELETE') { await DB.prepare('UPDATE projects SET featured=0 WHERE id=?').bind(pid).run(); return json({ ok: true }); }
    if (!p.share_token) return err('แชร์ลิงก์ก่อน แล้วค่อยส่งเข้าแกลเลอรี');
    const blurb = String((await req.json().catch(() => ({}))).blurb || '').trim().slice(0, 160); if (blurb.length < 10) return err('เขียนคำอธิบายสั้นๆ อย่างน้อย 10 ตัวอักษร');
    await DB.prepare('UPDATE projects SET blurb=?, featured=CASE WHEN featured=1 THEN 1 ELSE 2 END WHERE id=?').bind(blurb, pid).run();
    if (p.featured !== 1) await notify(env, `🖼️ มีโปรเจกต์ส่งเข้าแกลเลอรี: ${p.name} (/p/${p.slug || p.share_token}) รออนุมัติในหลังบ้าน แท็บลิงก์แชร์`).catch(() => {});
    return json({ ok: true, featured: p.featured === 1 ? 1 : 2 });
  }
  if (sub === '/share') { // ลิงก์อ่านอย่างเดียวของโปรเจกต์ (หน้าเว็บที่รันได้ที่ /p/<token>) · DELETE = ยกเลิกลิงก์
    if (M === 'DELETE') { await DB.prepare('UPDATE projects SET share_token=NULL, slug=NULL WHERE id=?').bind(pid).run(); return json({ ok: true }); }
    const token = p.share_token || rand(12);
    if (!p.share_token) await DB.prepare('UPDATE projects SET share_token=? WHERE id=?').bind(token, pid).run();
    const b = M === 'POST' ? await req.json().catch(() => ({})) : {};
    if ('slug' in b) { // ตั้งชื่อลิงก์เอง: a-z 0-9 - ยาว 3-40 ไม่ซ้ำกับคนอื่น และไม่ใช่รูปแบบ token (กันชนกัน)
      const slug = String(b.slug || '').trim().toLowerCase();
      if (slug && (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug) || /^[a-f0-9]{24}$/.test(slug))) return err('ชื่อลิงก์ใช้ได้เฉพาะ a-z 0-9 และ - ยาว 3–40 ตัว');
      if (slug && await DB.prepare('SELECT 1 FROM projects WHERE slug=? AND id<>?').bind(slug, pid).first()) return err('ชื่อลิงก์นี้มีคนใช้แล้ว');
      await DB.prepare('UPDATE projects SET slug=? WHERE id=?').bind(slug || null, pid).run();
      return json({ token, slug: slug || null });
    }
    return json({ token, slug: p.slug || null, featured: p.featured || 0, blurb: p.blurb || '' });
  }
  if (sub === '/restorepoints') return json((await DB.prepare('SELECT MIN(created_at) ts, source, COUNT(DISTINCT path) files FROM file_versions WHERE project_id=? GROUP BY created_at/60000, source ORDER BY ts DESC LIMIT 40').bind(pid).all()).results);
  if (sub === '/restore' && M === 'POST') { // ย้อนทั้งโปรเจกต์ไปสถานะก่อนช่วงเวลานั้น (ใช้ประวัติรายไฟล์) · ไฟล์ที่สร้างใหม่หลังจุดนั้นจะยังอยู่
    const ts = +(await req.json()).ts; if (!(ts > 0)) return err('จุดย้อนกลับไม่ถูกต้อง');
    const back = (await DB.prepare('SELECT v.path,v.content FROM file_versions v WHERE v.project_id=?1 AND v.id=(SELECT MIN(id) FROM file_versions WHERE project_id=?1 AND path=v.path AND created_at>=?2)').bind(pid, ts).all()).results;
    const files = back.filter(f => PATH_RE.test(f.path));
    if (!files.length) return err('ไม่มีอะไรให้ย้อน');
    await snapshot(env, pid, files, 'restore'); // เก็บสถานะปัจจุบันไว้ก่อน ย้อนกลับของการย้อนได้
    const put = 'INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at';
    for (let i = 0; i < files.length; i += 50) await DB.batch(files.slice(i, i + 50).map(f => DB.prepare(put).bind(pid, f.path, f.content, now)));
    await touch.run();
    return json({ ok: true, restored: files.length });
  }
  if (sub === '/versions') return json((await DB.prepare('SELECT id,source,created_at,length(content) size FROM file_versions WHERE project_id=? AND path=? ORDER BY id DESC').bind(pid, url.searchParams.get('path') || '').all()).results);
  if (sub.startsWith('/versions/')) {
    const v = await DB.prepare('SELECT * FROM file_versions WHERE id=? AND project_id=?').bind(+sub.split('/')[2], pid).first();
    return v ? json(v) : err('ไม่พบเวอร์ชัน', 404);
  }
  if (sub === '/import' && M === 'POST') { // อัปโหลดหลายไฟล์ / zip
    const files = (await req.json()).files;
    if (!Array.isArray(files) || !files.length || !files.every(valid)) return err('ไฟล์ไม่ถูกต้อง (ชื่อไฟล์ หรือไฟล์ใหญ่เกิน 500KB)');
    const no = await fits(files); if (no) return err(no);
    await snapshot(env, pid, files, 'import');
    await DB.batch([...files.map(f => DB.prepare('INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at').bind(pid, f.path, f.content, now)), touch]);
    return json({ ok: true, count: files.length });
  }
  return err('not found', 404);
}

// ---------- GitHub (โหมด Code) ----------
// token ของผู้ใช้เข้ารหัส AES-GCM ด้วย SECRET_KEY ก่อนเก็บ ไม่เคยส่งกลับไปที่หน้าเว็บ
export const GH_BASE = 'https://api.github.com'; export const GH_IGNORE = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.next|\.venv)(\/|$)/;
export const b64 = u => { let s = ''; for (const x of new Uint8Array(u)) s += String.fromCharCode(x); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function sealKey(env) {
  if (!env.SECRET_KEY) throw userErr('แอดมินยังไม่ได้ตั้ง SECRET_KEY ใน Worker');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SECRET_KEY)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return b64(iv) + '.' + b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), new TextEncoder().encode(text))); }
export async function unseal(env, s) { const [iv, c] = s.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealKey(env), unb64(c))); }
export const ghErr = (st, d) => st === 401 ? 'GitHub token ใช้ไม่ได้หรือหมดอายุ เชื่อมต่อใหม่'
  : st === 403 ? 'token ไม่มีสิทธิ์ (ต้องการ Contents: Read and write) หรือใช้ GitHub บ่อยเกินไป รอสักครู่'
  : st === 404 ? 'ไม่พบ repo หรือ branch (หรือ token เข้าถึง repo นี้ไม่ได้)'
  : st === 409 ? 'repo ยังว่างอยู่ ให้สร้างไฟล์แรก (เช่น README) บน GitHub ก่อน'
  : 'GitHub ตอบกลับ ' + st + (d?.message ? ': ' + d.message : '');
export async function gh(token, path, opt = {}) {
  const r = await fetch((opt.base || GH_BASE) + path, { method: opt.method || 'GET', body: opt.body && JSON.stringify(opt.body),
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'AstraCode', ...(opt.body ? { 'content-type': 'application/json' } : {}) } })
    .catch(() => { throw userErr('เชื่อมต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง', 502); });
  if (opt.raw) { if (!r.ok) throw userErr(ghErr(r.status)); return r; }
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw userErr(ghErr(r.status, d), [404, 409].includes(r.status) ? r.status : 400);
  return d;
}
// sha แบบเดียวกับ git (blob) ใช้เทียบว่าไฟล์ไหนเปลี่ยน
export async function blobSha(text) {
  const b = new TextEncoder().encode(text), h = new TextEncoder().encode(`blob ${b.length}\0`), all = new Uint8Array(h.length + b.length);
  all.set(h); all.set(b, h.length); return hex(await crypto.subtle.digest('SHA-1', all));
}
export const shaMap = async files => new Map(await Promise.all(files.map(async f => [f.path, await blobSha(f.content)])));
// อ่าน zip ที่ GitHub ส่งมา (ไฟล์แบบ stored / deflate)
export async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw userErr('ไฟล์ zip จาก GitHub เสีย');
  const out = []; let p = v.getUint32(e + 16, true);
  for (let i = v.getUint16(e + 10, true); i > 0; i--) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), lo = v.getUint32(p + 42, true), name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (name.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    out.push({ name, method, usize, data: u8.subarray(start, start + size) });
  }
  return out;
}
export async function inflate(z) { return z.method === 0 ? z.data : new Uint8Array(await new Response(new Blob([z.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
// ดึงไฟล์ข้อความทั้งหมดของ repo ที่ commit นั้น (ข้ามไฟล์ไบนารี รูป และไฟล์ใหญ่)
export async function remoteFiles(token, repo, sha, base) {
  const buf = await (await gh(token, `/repos/${repo}/zipball/${sha}`, { raw: true, base })).arrayBuffer();
  if (buf.byteLength > 30e6) throw userErr('repo ใหญ่เกิน 30MB');
  const files = new Map(), skipped = [];
  for (const z of await unzip(buf)) {
    const path = z.name.split('/').slice(1).join('/'); // ตัดโฟลเดอร์ owner-repo-sha/ ที่ GitHub ครอบไว้
    if (!path || GH_IGNORE.test(path)) continue;
    if (z.usize > FILE_LIMIT || !PATH_RE.test(path)) { skipped.push(path); continue; }
    const bytes = await inflate(z);
    if (bytes.subarray(0, 8000).includes(0)) { skipped.push(path); continue; }
    try { files.set(path, new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { skipped.push(path); }
  }
  return { files, skipped };
}
export async function github(req, env, u, p, sub, now) {
  const DB = env.DB, M = req.method;
    const tok = u.gh_token && await unseal(env, u.gh_token).catch(() => null);
  if (!tok) return err('ยังไม่ได้เชื่อม GitHub', 400);
  const ghApi = (path, opt = {}) => gh(tok, path, { ...opt, base: env.GITHUB_API });
  const head = async () => (await ghApi(`/repos/${p.gh_repo}/git/ref/heads/${encodeURIComponent(p.gh_branch)}`)).object.sha;
  const local = async () => (await DB.prepare("SELECT path,content FROM project_files WHERE project_id=? AND content NOT LIKE 'data:image/%'").bind(p.id).all()).results; // รูปในโปรเจกต์เก็บเป็น data URL ไม่ sync ขึ้น GitHub
  const save = (sha, synced) => DB.prepare('UPDATE projects SET gh_sha=?, gh_synced=?, updated_at=? WHERE id=?').bind(sha, JSON.stringify(Object.fromEntries(synced)), now, p.id).run();

  if (sub === '/github') {
    if (M === 'DELETE') { await DB.prepare('UPDATE projects SET gh_repo=NULL, gh_branch=NULL, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(p.id).run(); return json({ ok: true }); }
    const b = await req.json(), repo = String(b.repo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return err('ใส่ repo แบบ owner/repo');
    const info = await ghApi(`/repos/${repo}`), branch = String(b.branch || '').trim() || info.default_branch;
    await ghApi(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
    await DB.prepare('UPDATE projects SET gh_repo=?, gh_branch=?, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(info.full_name, branch, p.id).run();
    return json({ ok: true, repo: info.full_name, branch, push: !!info.permissions?.push });
  }
  if (!p.gh_repo) return err('โปรเจกต์นี้ยังไม่ได้เชื่อม repo');
  const synced = new Map(Object.entries(JSON.parse(p.gh_synced || '{}')));

  if (sub === '/github/status') { // เทียบไฟล์ในเครื่องกับครั้งล่าสุดที่ sync และดูว่า GitHub มีคอมมิตใหม่ไหม
    const h = await head(), mine = await shaMap(await local());
    const added = [...mine.keys()].filter(k => !synced.has(k)), modified = [...mine].filter(([k, v]) => synced.has(k) && synced.get(k) !== v).map(([k]) => k);
    const deleted = [...synced.keys()].filter(k => !mine.has(k));
    let behind = 0, remote = [];
    if (p.gh_sha && h !== p.gh_sha) { const c = await ghApi(`/repos/${p.gh_repo}/compare/${p.gh_sha}...${h}`); behind = c.ahead_by; remote = (c.files || []).slice(0, 50).map(f => ({ path: f.filename, status: f.status })); }
    return json({ repo: p.gh_repo, branch: p.gh_branch, head: h, synced: p.gh_sha, never: !p.gh_sha, behind, remote, local: { added, modified, deleted } });
  }
  if (sub === '/github/pull' && M === 'POST') { // รวมแบบ 3 ทาง ทีละไฟล์: ของเรา / GitHub / ครั้งล่าสุดที่ sync
    const keep = (await req.json()).resolve; // 'remote' | 'local' เมื่อชนกัน
    const h = await head(), { files: remote, skipped } = await remoteFiles(tok, p.gh_repo, h, env.GITHUB_API), mineRows = await local();
    const mine = await shaMap(mineRows), theirs = new Map(await Promise.all([...remote].map(async ([k, v]) => [k, await blobSha(v)])));
    const writes = [], dels = [], conflicts = [];
    for (const k of new Set([...mine.keys(), ...theirs.keys(), ...synced.keys()])) {
      const L = mine.get(k), R = theirs.get(k), B = synced.get(k);
      if (L === R) continue;
      const take = L === B ? 'remote' : R === B ? 'local' : (conflicts.push(k), keep);
      if (take === 'remote') R ? writes.push({ path: k, content: remote.get(k) }) : dels.push(k);
    }
    if (conflicts.length && !keep) return json({ error: 'ไฟล์ถูกแก้ทั้งในนี้และบน GitHub', conflicts }, 409);
    const size = new Map(mineRows.map(f => [f.path, f.content.length]));
    for (const f of writes) size.set(f.path, f.content.length); for (const k of dels) size.delete(k);
    if (size.size > FILES_PER_PROJECT || [...size.values()].reduce((a, b) => a + b, 0) > PROJECT_LIMIT) return err('repo ใหญ่เกินขีดจำกัดโปรเจกต์ (300 ไฟล์ / 5MB)');
    const put = 'INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at';
    await snapshot(env, p.id, writes, 'git');
    const ops = [...writes.map(f => DB.prepare(put).bind(p.id, f.path, f.content, now)), ...dels.map(k => DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(p.id, k))];
    for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
    await save(h, theirs);
    return json({ ok: true, head: h, updated: writes.map(f => f.path), deleted: dels, conflicts, skipped: skipped.slice(0, 30), skippedCount: skipped.length });
  }
  if (sub === '/github/branches') {
    const list = await ghApi(`/repos/${p.gh_repo}/branches?per_page=100`), info = await ghApi(`/repos/${p.gh_repo}`);
    return json({ current: p.gh_branch, default: info.default_branch, branches: list.map(x => x.name) });
  }
  if (sub === '/github/switch' && M === 'POST') { // เปลี่ยน branch: ต้อง Pull ใหม่
    const br = String((await req.json()).branch || '');
    await ghApi(`/repos/${p.gh_repo}/branches/${encodeURIComponent(br)}`);
    await DB.prepare('UPDATE projects SET gh_branch=?, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(br, p.id).run();
    return json({ ok: true, branch: br });
  }
  if (sub === '/github/branch' && M === 'POST') { // สร้าง branch ใหม่จากคอมมิตที่ sync ล่าสุด แล้วย้ายไปใช้ branch นั้น
    const name = String((await req.json()).name || '').trim();
    if (!/^[\w.\-/]{1,100}$/.test(name) || name.includes('..')) return err('ชื่อ branch ใช้ได้เฉพาะ a-z 0-9 - _ . /');
    if (!p.gh_sha) return err('กด Pull ก่อน แล้วค่อยสร้าง branch', 409);
    await ghApi(`/repos/${p.gh_repo}/git/refs`, { method: 'POST', body: { ref: 'refs/heads/' + name, sha: p.gh_sha } });
    await DB.prepare('UPDATE projects SET gh_branch=? WHERE id=?').bind(name, p.id).run(); // คอมมิตเดียวกัน จึงไม่ต้อง pull ใหม่
    return json({ ok: true, branch: name });
  }
  if (sub === '/github/pr' && M === 'POST') {
    const b = await req.json(), info = await ghApi(`/repos/${p.gh_repo}`), base = String(b.base || info.default_branch);
    if (base === p.gh_branch) return err('branch ต้นทางกับปลายทางเป็นอันเดียวกัน สร้าง branch ใหม่ก่อน');
    const pr = await ghApi(`/repos/${p.gh_repo}/pulls`, { method: 'POST', body: { title: String(b.title || 'อัปเดตจาก AstraCode').slice(0, 200), body: String(b.body || '').slice(0, 5000), head: p.gh_branch, base } });
    return json({ ok: true, url: pr.html_url, number: pr.number });
  }
  if (sub === '/github/push' && M === 'POST') {
    const message = String((await req.json()).message || '').trim().slice(0, 500) || 'อัปเดตจาก AstraCode';
    const h = await head();
    if (!p.gh_sha) return err('กด Pull ก่อน push ครั้งแรก เพื่อรวมไฟล์กับ GitHub', 409);
    if (h !== p.gh_sha) return err('GitHub มีคอมมิตใหม่ กด Pull ก่อนแล้วค่อย Push', 409);
    const rows = await local(), mine = await shaMap(rows), text = new Map(rows.map(f => [f.path, f.content]));
    const tree = [...[...mine].filter(([k, v]) => synced.get(k) !== v).map(([k]) => ({ path: k, mode: '100644', type: 'blob', content: text.get(k) })),
      ...[...synced.keys()].filter(k => !mine.has(k)).map(k => ({ path: k, mode: '100644', type: 'blob', sha: null }))];
    if (!tree.length) return json({ ok: true, nothing: true });
    const base = await ghApi(`/repos/${p.gh_repo}/git/commits/${h}`);
    const t = await ghApi(`/repos/${p.gh_repo}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree } });
    const c = await ghApi(`/repos/${p.gh_repo}/git/commits`, { method: 'POST', body: { message, tree: t.sha, parents: [h] } });
    await ghApi(`/repos/${p.gh_repo}/git/refs/heads/${encodeURIComponent(p.gh_branch)}`, { method: 'PATCH', body: { sha: c.sha } });
    await save(c.sha, mine);
    return json({ ok: true, commit: c.sha, url: c.html_url, files: tree.length });
  }
  return err('not found', 404);
}
