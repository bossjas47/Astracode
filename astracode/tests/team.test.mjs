// ทีม Agent: หัวหน้าแบ่งงาน → ลูกทีม (DeepSeek 4.1 Flash) ทำพร้อมกันโดยไฟล์ไม่ชน → ผู้ตรวจสรุป
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, fakeModel, addModel, addPlan } from './helpers.mjs';
import { parsePlan } from '../src/agent.js';

const give = (DB, u, plan) => DB.raw.prepare('UPDATE users SET plan_id=?,plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
const PLAN = { tasks: [{ title: 'หน้าแรก', prompt: 'ทำหน้าแรก', files: ['a.html'] }, { title: 'สไตล์', prompt: 'ทำ CSS', files: ['b.css'] }, { title: 'แก้หน้าแรกต่อ', prompt: 'เพิ่มเมนูในหน้าแรก', files: ['a.html'] }] };
const userText = body => body.messages.filter(x => x.role === 'user').map(x => typeof x.content === 'string' ? x.content : JSON.stringify(x.content)).join('\n');
async function setup(settings = {}) {
  const calls = [];
  const fm = await fakeModel((q, res, body) => {
    const sys = JSON.stringify(body.messages[0] || '') + JSON.stringify(body.system || ''), txt = userText(body), first = body.messages.filter(x => x.role === 'assistant').length === 0;
    if (/You lead a small team/.test(sys)) { calls.push('lead'); return fm.sse(res, '```json\n' + JSON.stringify(PLAN) + '\n```'); }
    if (/\[ผลของลูกทีม/.test(txt)) { calls.push('review'); return fm.sse(res, 'ทีมเสร็จแล้ว ตรวจรวมเรียบร้อย'); }
    const title = /^(.+)\n/.exec(body.messages.find(x => x.role === 'user')?.content || '')?.[1] || '?';
    calls.push(`${body.model}:${title}:${first ? 'write' : 'sum'}`);
    if (!first) return fm.sse(res, 'เสร็จงานย่อย ' + title);
    if (title === 'หน้าแรก') return fm.sse(res, '```html path=a.html\n<h1>home</h1>\n```\n```js path=evil.js\nalert(1)\n```');
    if (title === 'สไตล์') return fm.sse(res, '```css path=b.css\nh1{color:red}\n```');
    return fm.sse(res, '```html path=a.html\n<nav>menu</nav><h1>home</h1>\n```');
  });
  const t = await makeEnv({ K: 'k' }); const lead = addModel(t.DB, { name: 'Lead Pro', api_model: 'lead', base_url: fm.url }), cheap = addModel(t.DB, { name: 'DeepSeek 4.1 Flash', api_model: 'flash', base_url: fm.url });
  t.DB.raw.prepare('UPDATE models SET multiplier=5 WHERE id=?').run(lead.id);
  const plan = addPlan(t.DB, { models: [lead.id, cheap.id], limit_4h: 1e6, limit_week: 1e6, price: 100 }), u = await t.user(); give(t.DB, u, plan);
  for (const [k, v] of Object.entries(settings)) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
  const pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'Site', empty: true } })).data.id;
  return { t, fm, u, pid, lead, cheap, calls };
}

test('parsePlan keeps at most 5 tasks with valid file paths and rejects broken JSON', () => {
  assert.equal(parsePlan('not json'), null);
  assert.equal(parsePlan('{"tasks":[{"title":"x","prompt":"p","files":[]}]}'), null, 'a task needs files');
  const p = parsePlan('{"tasks":' + JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ title: 't' + i, prompt: 'p', files: ['./ok.js', '../bad'] }))) + '}');
  assert.equal(p.length, 5); assert.deepEqual(p[0].files, ['ok.js']);
});

test('team: lead splits the work, cheap workers write only their own files, same-file tasks run in turn, reviewer sums up', async () => {
  const { t, fm, u, pid, lead, cheap, calls } = await setup();
  const r = await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const job = (await t.json('/api/agent?project=' + pid, { cookie: u.cookie })).data[0];
  assert.equal(job.status, 'done', JSON.stringify(job)); assert.match(job.summary, /ทีมเสร็จ/);
  assert.equal(job.team.filter(k => k.role === 'worker').length, 3); assert.equal(job.team.filter(k => k.role === 'review').length, 1);
  const rows = t.DB.raw.prepare('SELECT * FROM agent_jobs WHERE parent_id=? ORDER BY id').all(job.id), w = rows.filter(x => x.role === 'worker');
  assert.ok(w.every(x => x.model_id === cheap.id && x.status === 'done'), 'workers use DeepSeek 4.1 Flash');
  assert.equal(rows.find(x => x.role === 'review').model_id, lead.id, 'reviewer uses the lead model');
  assert.ok(w[2].started_at >= w[0].finished_at, 'the second a.html task waits for the first');
  const files = Object.fromEntries(t.DB.raw.prepare('SELECT path,content FROM project_files WHERE project_id=?').all(pid).map(f => [f.path, f.content]));
  assert.match(files['a.html'], /menu/); assert.ok(files['b.css']); assert.equal(files['evil.js'], undefined, 'out-of-scope write refused');
  assert.match(w[0].log, /ปัญหา/); assert.deepEqual(JSON.parse(job.changed).sort(), ['a.html', 'b.css']);
  assert.equal(calls.filter(c => c === 'review').length, 1);
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM chats WHERE user_id=?').get(u.id).n, 1, 'one result chat for the whole team');
  fm.close();
});

test('team: the budget cap stops the workers and the reviewer; stop-all ends a running team', async () => {
  const { t, fm, u, pid, lead } = await setup({ team_budget_pct: '1e-13' });
  await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true } });
  const job = (await t.json('/api/agent?project=' + pid, { cookie: u.cookie })).data[0];
  assert.equal(job.status, 'limit', JSON.stringify(job)); assert.ok(job.team.filter(k => k.role === 'worker').every(k => k.status === 'limit'));
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM project_files WHERE project_id=?').get(pid).n, 0, 'nothing written');
  const L = t.DB.raw.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,role) VALUES (?,?,?,?,'team',?,'lead') RETURNING id").get(u.id, pid, lead.id, 'x'.repeat(20), Date.now()).id;
  t.DB.raw.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,parent_id,role,scope) VALUES (?,?,?,?,'waiting',?,?,'worker','[\"a\"]')").run(u.id, pid, lead.id, 'w', Date.now(), L);
  assert.equal((await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'งานใหม่ระหว่างทีมกำลังทำ' } })).status, 409);
  assert.equal((await t.json(`/api/agent/${L}/stop`, { method: 'POST', cookie: u.cookie })).data.ok, true);
  assert.deepEqual(t.DB.raw.prepare('SELECT status FROM agent_jobs WHERE id=? OR parent_id=? ORDER BY id').all(L, L).map(x => x.status), ['stopped', 'stopped']);
  fm.close();
});
