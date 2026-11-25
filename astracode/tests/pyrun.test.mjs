// รัน Python บนคลาวด์: API (สิทธิ์ แพลน ส่งต่อเข้าเครื่อง) + ตัวรันในเครื่อง (import ข้ามไฟล์ · /out · หมดเวลา)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEnv, addPlan } from './helpers.mjs';

const give = (DB, u, plan) => DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
test('cloud python API: paid plans are forwarded to the per-user machine; free plans and missing machines tell the page to run in the browser', async () => {
  const seen = []; const box = { idFromName: n => n, get: n => ({ fetch: async (url, init) => { seen.push([n, url, JSON.parse(init.body)]); return new Response(JSON.stringify({ out: 'hi\n', code: 0, imgs: [], outs: [] })); } }) };
  const t = await makeEnv({ AGENTBOX: box }), paid = addPlan(t.DB, { price: 100 }), free = addPlan(t.DB, { name: 'F', price: 0 });
  const a = await t.user(), b = await t.user(); give(t.DB, a, paid); give(t.DB, b, free);
  const body = { main: 'main.py', files: [{ path: 'main.py', content: 'print("hi")' }] };
  const r = await t.json('/api/py/run', { method: 'POST', cookie: a.cookie, body }); assert.equal(r.status, 200); assert.equal(r.data.out, 'hi\n');
  assert.equal(seen[0][0], 'py:' + a.id, 'one machine per user'); assert.equal(seen[0][2].main, 'main.py');
  const adm = await t.user({ role: 'admin' }), q = (await t.json('/api/admin/quality', { cookie: adm.cookie })).data;
  assert.equal(q.py[0].n, 1); assert.equal(q.py[0].users, 1); assert.equal(q.py[0].fail, 0, 'runs are counted for the admin quality page');
  assert.equal((await t.json('/api/py/run', { method: 'POST', cookie: b.cookie, body })).status, 402);
  assert.equal((await t.json('/api/py/run', { method: 'POST', body })).status, 401);
  const n = await makeEnv(), c = await n.user(); give(n.DB, c, addPlan(n.DB, { price: 100 }));
  assert.equal((await n.json('/api/py/run', { method: 'POST', cookie: c.cookie, body })).status, 503);
});

const hasPy = (() => { try { execFileSync('python3', ['--version']); return true; } catch { return false; } })();
test('cloud python runner: imports project files, reads attachments, returns /out files, stops runaway code', { skip: !hasPy && 'no python3' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kyber-py-'));
  Object.assign(process.env, { PY_ROOT: join(dir, 'run'), PY_DATA: join(dir, 'data'), PY_OUT: join(dir, 'out') });
  const { pyExec } = createRequire(import.meta.url)('../container/pyexec.js');
  const r = await pyExec({ files: [{ path: 'main.py', content: `import util, os\nprint(util.f(2))\nprint(open(os.environ['PY_DATA'] + '/a.csv').read().strip())\nopen(os.environ['PY_OUT'] + '/r.txt', 'w').write('ok')` }, { path: 'util.py', content: 'def f(x): return x * 21' }, { path: '/data/a.csv', content: 'x,y' }] });
  assert.equal(r.code, 0, r.out); assert.match(r.out, /42\nx,y/); assert.deepEqual(r.outs.map(o => [o.name, Buffer.from(o.b64, 'base64').toString()]), [['r.txt', 'ok']]);
  const slow = await pyExec({ files: [{ path: 'main.py', content: 'import time\nwhile True: time.sleep(1)' }], timeoutMs: 5000 });
  assert.match(slow.out, /หยุด: รันนานเกิน/); assert.ok(slow.ms < 15000);
  await assert.rejects(pyExec({ files: [{ path: '../evil.py', content: 'x' }] }), /พาธ/);
});
