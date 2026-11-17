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
  const r = await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true, confirm: false } });
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
  await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true, confirm: false } });
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

// R2 จำลองในหน่วยความจำ (put/get/list/delete)
const fakeR2 = () => { const m = new Map(); return { m, async put(k, v) { m.set(k, { body: String(v), uploaded: new Date() }); }, async get(k) { const o = m.get(k); return o && { body: o.body, json: async () => JSON.parse(o.body) }; }, async list({ prefix }) { return { objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, size: o.body.length, uploaded: o.uploaded })) }; }, async delete(ks) { [].concat(ks).forEach(k => m.delete(k)); } }; };

test('admin sees agent cost per job (team incl. workers) and per user', async () => {
  const { t, fm, u, pid, lead } = await setup();
  await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true, confirm: false } });
  const adm = await t.user({ role: 'admin' }), d = (await t.json('/api/admin/agents', { cookie: adm.cookie })).data;
  assert.equal(d.jobs.length, 1); assert.equal(d.jobs[0].workers, 3); assert.ok(d.jobs[0].cost > 0, 'cost recorded');
  const sum = t.DB.raw.prepare('SELECT SUM(cost) c FROM usage WHERE user_id=?').get(u.id).c; assert.ok(Math.abs(d.jobs[0].cost - sum) < 1e-9, 'job cost = all usage rows of the team');
  assert.equal(d.users[0].teams, 1); assert.equal((await t.json('/api/admin/agents', { cookie: u.cookie })).status, 403);
  fm.close();
});

test('backup: verify reads the latest file and compares row counts; a stale backup alerts once a day', async () => {
  const t = await makeEnv(); t.env.SLIPS = fakeR2(); const adm = await t.user({ role: 'admin' });
  assert.match((await t.json('/api/admin/backups/verify', { method: 'POST', cookie: adm.cookie })).data.error, /ยังไม่มี/);
  assert.equal((await t.json('/api/admin/backups', { method: 'POST', cookie: adm.cookie })).status, 200);
  const v = (await t.json('/api/admin/backups/verify', { method: 'POST', cookie: adm.cookie })).data;
  assert.equal(v.ok, true, JSON.stringify(v)); assert.equal(v.tables.find(x => x.table === 'users').backup, 1);
  const sent = []; t.DB.raw.prepare("INSERT OR REPLACE INTO settings VALUES ('alert_discord','https://discord.test/hook')").run();
  const orig = globalThis.fetch; globalThis.fetch = async (u, o) => { if (String(u).includes('discord.test')) { sent.push(JSON.parse(o.body).content); return new Response('{}'); } return orig(u, o); };
  try {
    for (const o of t.env.SLIPS.m.values()) o.uploaded = new Date(Date.now() - 3 * 864e5);
    for (let i = 0; i < 2; i++) { t.ctx.pending.length = 0; t.worker.default.scheduled({}, t.env, t.ctx); await Promise.all(t.ctx.pending); }
  } finally { globalThis.fetch = orig; }
  assert.equal(sent.filter(x => /ไม่มีไฟล์สำรองข้อมูลใหม่/.test(x)).length, 1, 'alert once per day');
});

test('team plan waits for the user: edit, drop a task, then start; or it expires after 24 hours', async () => {
  const { t, fm, u, pid, lead } = await setup();
  await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'ทำเว็บหน้าแรกพร้อม CSS และเมนู', team: true } });
  let job = (await t.json('/api/agent?project=' + pid, { cookie: u.cookie })).data[0];
  assert.equal(job.status, 'plan'); assert.equal(job.team.length, 3); assert.equal(JSON.parse(job.team[0].plan).title, 'หน้าแรก');
  assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM project_files WHERE project_id=?').get(pid).n, 0, 'nothing runs before confirm');
  assert.equal((await t.json(`/api/agent/${job.id}/start`, { method: 'POST', cookie: u.cookie, body: { tasks: [{ id: job.team[0].id, title: 'หน้าแรก', prompt: '', files: 'a.html' }] } })).status, 400, 'empty prompt refused');
  const r = await t.json(`/api/agent/${job.id}/start`, { method: 'POST', cookie: u.cookie, body: { tasks: [{ id: job.team[0].id, title: 'หน้าแรก', prompt: 'ทำหน้าแรก', files: 'a.html' }, { id: job.team[1].id, title: 'สไตล์', prompt: 'ทำ CSS', files: ['b.css'] }] } });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.tasks, 2);
  job = (await t.json('/api/agent?project=' + pid, { cookie: u.cookie })).data[0];
  assert.equal(job.status, 'done', JSON.stringify(job)); assert.equal(job.team.filter(k => k.role === 'worker').length, 2, 'dropped task removed');
  assert.equal((await t.json(`/api/agent/${job.id}/start`, { method: 'POST', cookie: u.cookie, body: { tasks: [] } })).status, 404, 'cannot start twice');
  await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { project_id: pid, model_id: lead.id, prompt: 'งานที่สองที่จะปล่อยให้หมดอายุ', team: true } });
  const j2 = (await t.json('/api/agent?project=' + pid, { cookie: u.cookie })).data[0]; assert.equal(j2.status, 'plan');
  t.DB.raw.prepare('UPDATE agent_jobs SET created_at=? WHERE id=?').run(Date.now() - 25 * 3600e3, j2.id);
  const { reapAgentJobs } = await import('../src/agent.js'); await reapAgentJobs(t.env);
  assert.deepEqual([...new Set(t.DB.raw.prepare('SELECT status FROM agent_jobs WHERE id=? OR parent_id=?').all(j2.id, j2.id).map(x => x.status))], ['stopped']);
  fm.close();
});

test('deep research: topics are searched in parallel, cheap model writes notes, lead writes a cited report into a new chat', async () => {
  const seen = []; const fm = await fakeModel((q, res, body) => {
    const sys = JSON.stringify(body.messages[0] || '') + JSON.stringify(body.system || ''); seen.push(body.model + ':' + (/sub-topics/.test(sys) ? 'plan' : /research assistant/.test(sys) ? 'notes' : 'report'));
    if (/sub-topics/.test(sys)) return fm.sse(res, '{"topics":[{"title":"ราคา","queries":["ev price thailand"]},{"title":"สถานีชาร์จ","queries":["ev charger thailand"]}]}');
    if (/research assistant/.test(sys)) return fm.sse(res, 'ข้อเท็จจริง [1]');
    return fm.sse(res, '## สรุป\nรถไฟฟ้าในไทยถูกลง [1] และสถานีเพิ่มขึ้น [2]');
  });
  const t = await makeEnv({ K: 'k', TAVILY_KEY: 'tv' }); const lead = addModel(t.DB, { name: 'Lead Pro', api_model: 'lead', base_url: fm.url }), cheap = addModel(t.DB, { name: 'DeepSeek 4.1 Flash', api_model: 'flash', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [lead.id, cheap.id], limit_4h: 1e6, limit_week: 1e6, price: 100 }), u = await t.user(); give(t.DB, u, plan);
  const orig = globalThis.fetch; globalThis.fetch = async (url, o) => String(url).includes('tavily') ? new Response(JSON.stringify({ results: [{ title: 'Price ' + JSON.parse(o.body).query, url: 'https://news.test/' + encodeURIComponent(JSON.parse(o.body).query), content: 'ข้อมูล' }, { title: 'Shared', url: 'https://shared.test/', content: 'ร่วม' }] })) : orig(url, o);
  try {
    const r = await t.json('/api/agent', { method: 'POST', cookie: u.cookie, body: { model_id: lead.id, prompt: 'สรุปตลาดรถยนต์ไฟฟ้าในไทยปีนี้', research: true } }); assert.equal(r.status, 200, JSON.stringify(r.data));
  } finally { globalThis.fetch = orig; }
  const job = (await t.json('/api/agent?research=1', { cookie: u.cookie })).data[0];
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.deepEqual(seen.sort(), ['flash:notes', 'flash:notes', 'lead:plan', 'lead:report'], 'cheap model writes the notes');
  const msg = t.DB.raw.prepare("SELECT m.content, m.sources, c.project_id FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.id=? AND m.role='assistant'").get(job.chat_id);
  assert.equal(msg.project_id, null, 'report chat shows in the normal chat list'); assert.match(msg.content, /\*\*แหล่งที่มา\*\*/);
  assert.equal(JSON.parse(msg.sources).length, 3, 'the same URL found by two topics is listed once');
  fm.close();
});

test('admin agent test button runs a real team job on a sample project with the cheap model', async () => {
  const { t, fm, cheap } = await setup();
  const plan = t.DB.raw.prepare('SELECT * FROM plans WHERE price>0 ORDER BY id DESC LIMIT 1').get(), adm = await t.user({ role: 'admin' }); give(t.DB, adm, plan);
  assert.match((await t.json('/api/admin/agent-test', { method: 'POST', cookie: adm.cookie, body: { kind: 'research' } })).data.error, /TAVILY/);
  const r = await t.json('/api/admin/agent-test', { method: 'POST', cookie: adm.cookie, body: { kind: 'team' } }); assert.equal(r.status, 200, JSON.stringify(r.data));
  const job = t.DB.raw.prepare('SELECT * FROM agent_jobs WHERE id=?').get(r.data.id);
  assert.equal(job.model_id, cheap.id); assert.equal(job.status, 'done', JSON.stringify(job));
  assert.ok(t.DB.raw.prepare("SELECT 1 FROM projects WHERE id=? AND name='ทดสอบ Agent'").get(r.data.project_id));
  assert.equal((await t.json('/api/admin/agent-test', { method: 'POST', cookie: (await t.user()).cookie, body: { kind: 'team' } })).status, 403);
  fm.close();
});
