// AstraCode: เทอร์มินัล Node.js ในเบราว์เซอร์ (almostnode, MIT) — รันใน iframe sandbox แยก origin
import { createContainer } from 'almostnode';
let c = null;
const sent = new Map(); // path → เนื้อหาล่าสุดที่ซิงก์กับโปรเจกต์
const SKIP = /^\/(node_modules|\.)/;
function walk(dir, out) {
  for (const n of c.vfs.readdirSync(dir)) {
    const p = (dir === '/' ? '' : dir) + '/' + n;
    if (SKIP.test(p) || n.startsWith('.')) continue;
    let st; try { st = c.vfs.statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (out.length < 50) { try { const t = c.vfs.readFileSync(p, 'utf8'); if (t.length <= 500e3 && !t.includes('\u0000') && sent.get(p) !== t) { out.push({ path: p.slice(1), content: t }); sent.set(p, t); } } catch { } }
  }
  return out;
}
addEventListener('message', async e => {
  const d = e.data || {};
  if (!d.cmd) return;
  c ||= createContainer();
  for (const f of d.files || []) {
    const p = '/' + f.path; if (sent.get(p) === f.content) continue;
    const dir = p.slice(0, p.lastIndexOf('/')); if (dir) c.vfs.mkdirSync(dir, { recursive: true });
    c.vfs.writeFileSync(p, f.content); sent.set(p, f.content);
  }
  const post = o => parent.postMessage({ id: d.id, ...o }, '*');
  try {
    const r = await c.run(d.cmd, { onStdout: s => post({ out: s }), onStderr: s => post({ err: s }) });
    post({ done: true, code: r.exitCode ?? 0, stdout: r.stdout || '', stderr: r.stderr || '', files: walk('/', []) });
  } catch (x) { post({ done: true, code: 1, stdout: '', stderr: String(x?.message || x), files: [] }); }
});
parent.postMessage({ nodeReady: true }, '*');
