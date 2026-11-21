// ระบบดึงลูกค้า: เทมเพลต Workspace, งานตามเวลา, ส่วนลดต่ออายุ, โปรเติม Wallet แถม %
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';

async function paidUser(t, price = 299, models = []) {
  const p = addPlan(t.DB, { models, limit_4h: 1e6, limit_week: 1e6, price }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(p.id, Date.now() + 864e5, u.id); return { u, p };
}

test('workspace template: folder is created with starter instructions and the list says so', async () => {
  const t = await makeEnv(), u = await t.user();
  const f = await t.json('/api/folders', { method: 'POST', cookie: u.cookie, body: { name: 'ครู', instructions: 'คุณคือผู้ช่วยครู' } });
  assert.equal(f.status, 200);
  const list = (await t.json('/api/folders', { cookie: u.cookie })).data;
  assert.equal(list[0].has_ins, 1); assert.equal(list[0].has_files, 0);
});

test('scheduled tasks: paid only, max 3, due() by Thai hour/day, run now saves a chat', async () => {
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ข่าววันนี้ 5 ข้อ'));
  const t = await makeEnv({ K: 'k' }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  await t.json('/api/version');
  const free = await t.user();
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: free.cookie, body: { title: 'x', prompt: 'y', hour: 8, model_id: m.id } })).status, 403);
  const { u } = await paidUser(t, 299, [m.id]);
  const body = { title: 'สรุปข่าว', prompt: 'สรุปข่าว', hour: 8, days: 'daily', model_id: m.id, search: false };
  const s = (await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body })).data;
  for (let i = 0; i < 2; i++) await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body });
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body })).status, 403, 'max 3');
  assert.equal((await t.json('/api/schedules', { method: 'POST', cookie: u.cookie, body: { ...body, hour: 30 } })).status, 400);

  const { due } = await import('../src/schedules.js');
  const at = (h, wd) => { const d = new Date(Date.UTC(2026, 10, 22 + ((wd - 0 + 7) % 7), h - 7)); return d.getTime(); }; // 22 พ.ย. 2026 = อาทิตย์
  assert.ok(due({ active: 1, hour: 8, days: 'daily' }, at(8, 0)));
  assert.ok(!due({ active: 1, hour: 8, days: 'daily' }, at(9, 0)));
  assert.ok(!due({ active: 1, hour: 8, days: 'weekdays' }, at(8, 0)), 'Sunday is not a weekday');
  assert.ok(due({ active: 1, hour: 8, days: 'mon' }, at(8, 1)));
  assert.ok(!due({ active: 1, hour: 8, days: 'daily', last_run: at(8, 0) - 3600e3 }, at(8, 0)), 'already ran within 20h');

  const r = (await t.json(`/api/schedules/${s.id}/run`, { method: 'POST', cookie: u.cookie })).data;
  assert.equal(r.status, 'ok'); assert.ok(r.chat_id);
  const msgs = t.DB.raw.prepare('SELECT role,content FROM messages WHERE chat_id=? ORDER BY id').all(r.chat_id);
  assert.match(msgs[0].content, /งานตามเวลา: สรุปข่าว/); assert.match(msgs.at(-1).content, /ข่าววันนี้/);
  assert.match(t.DB.raw.prepare('SELECT title FROM chats WHERE id=?').get(r.chat_id).title, /⏰ สรุปข่าว/);
  assert.equal((await t.json(`/api/schedules/${s.id}/run`, { method: 'POST', cookie: u.cookie })).status, 429, 'no rapid re-runs');
  const { u: other } = await paidUser(t, 299, [m.id]); assert.equal((await t.json(`/api/schedules/${s.id}`, { method: 'DELETE', cookie: other.cookie })).status, 404, 'cannot touch others\' tasks');
});

test('renew reminder: paid plan without auto-renew gets a one-use 10% code; topup promo adds 10% once', async () => {
  const { cron } = await import('../src/jobs.js'), { applyPayment, TOPUP_PROMO } = await import('../src/billing.js');
  const t = await makeEnv(), { u } = await paidUser(t, 749);
  t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(Date.now() + 2 * 864e5, u.id);
  await cron(t.env);
  const c = t.DB.raw.prepare("SELECT * FROM coupons WHERE code LIKE 'RENEW%'").get();
  assert.ok(c); assert.equal(c.kind, 'percent'); assert.equal(c.value, 10); assert.equal(c.max_uses, 1);
  await cron(t.env); assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM coupons WHERE code LIKE 'RENEW%'").get().n, 1, 'one reminder per expiry');

  const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
  const p = { id: 77, user_id: u.id, kind: 'topup', amount: 500, slip_key: 'slip/x', created_at: TOPUP_PROMO.start + 1000 };
  await applyPayment(t.env, p); assert.equal(bal(), 550, '500 + 10%');
  await applyPayment(t.env, p); assert.equal(bal(), 1050, 'same payment does not get a second bonus');
  await applyPayment(t.env, { ...p, id: 78, amount: 200 }); assert.equal(bal(), 1250, 'under ฿300: no bonus');
  await applyPayment(t.env, { ...p, id: 79, created_at: TOPUP_PROMO.end + 1 }); assert.equal(bal(), 1750, 'after the promo: no bonus');
});

test('skills from GitHub: finds SKILL.md files, reads name/description from frontmatter, skips duplicates', async () => {
  const t = await makeEnv(), u = await t.user(), f0 = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const s = String(url);
    if (s === 'https://api.github.com/repos/acme/skills') return Response.json({ default_branch: 'main' });
    if (s.startsWith('https://api.github.com/repos/acme/skills/git/trees/main')) return Response.json({ tree: [{ type: 'blob', path: 'pdf/SKILL.md' }, { type: 'blob', path: 'seo/SKILL.md' }, { type: 'blob', path: 'README.md' }] });
    if (s.endsWith('pdf/SKILL.md')) return new Response('---\nname: pdf-helper\ndescription: "Work with PDFs"\n---\n# PDF\nDo PDF things');
    if (s.endsWith('seo/SKILL.md')) return new Response('Write SEO titles');
    if (s.startsWith('https://t.test')) return f0(url, init);
    return new Response('nope', { status: 404 });
  };
  try {
    const r = await t.json('/api/skills/github', { method: 'POST', cookie: u.cookie, body: { url: 'https://github.com/acme/skills' } });
    assert.equal(r.status, 200); assert.deepEqual(r.data.added, ['pdf-helper', 'seo']);
    const sk = t.DB.raw.prepare('SELECT name,description,content FROM skills WHERE user_id=? ORDER BY id').all(u.id);
    assert.equal(sk[0].description, 'Work with PDFs'); assert.match(sk[0].content, /^# PDF/); assert.doesNotMatch(sk[0].content, /---/);
    assert.deepEqual((await t.json('/api/skills/github', { method: 'POST', cookie: u.cookie, body: { url: 'https://github.com/acme/skills' } })).data.added, [], 'no duplicates');
    assert.equal((await t.json('/api/skills/github', { method: 'POST', cookie: u.cookie, body: { url: 'https://example.com/x' } })).status, 400);
  } finally { globalThis.fetch = f0; }
});

test('7-day plan bought fresh starts its weekly limit window at purchase (one window per pass)', async () => {
  const { applyPayment } = await import('../src/billing.js');
  const t = await makeEnv(), u = await t.user(), p = addPlan(t.DB, { price: 499 });
  t.DB.raw.prepare('UPDATE plans SET days=7 WHERE id=?').run(p.id);
  t.DB.raw.prepare('UPDATE users SET week_start=?, sess_start=? WHERE id=?').run(Date.now() - 6 * 864e5, Date.now() - 3600e3, u.id);
  await applyPayment(t.env, { id: 5, user_id: u.id, kind: 'plan', plan_id: p.id, amount: 499, slip_key: 'slip/a', period: 'month' });
  const r = t.DB.raw.prepare('SELECT week_start, usage_reset_at, plan_id FROM users WHERE id=?').get(u.id);
  assert.equal(r.plan_id, p.id); assert.equal(r.week_start, null); assert.ok(r.usage_reset_at > Date.now() - 5000);
});

test('plan free models: no limit units, still usable when the limit is full, other models blocked, daily cap', async () => {
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ok'));
  const t = await makeEnv({ K: 'k' }), free = addModel(t.DB, { name: 'Haiku', base_url: fm.url }), paid = addModel(t.DB, { name: 'Opus', base_url: fm.url });
  await t.json('/api/version');
  const { u, p } = await paidUser(t, 749, [free.id, paid.id]);
  t.DB.raw.prepare('UPDATE plans SET free_models=?, limit_week=1, limit_4h=1 WHERE id=?').run(JSON.stringify([free.id]), p.id);
  const send = async mid => { t.DB.raw.exec('DELETE FROM rate'); const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: mid } }); const body = await r.text(); return { status: r.status, body }; };
  assert.equal((await send(free.id)).status, 200);
  const units = t.DB.raw.prepare('SELECT units FROM usage WHERE user_id=? AND model_id=?').get(u.id, free.id).units;
  assert.equal(units, 0, 'free model does not use the plan limit');
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,5,5,?)').run(u.id, paid.id, Date.now());
  t.DB.raw.prepare('UPDATE users SET week_start=?, sess_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, u.id);
  assert.equal((await send(paid.id)).status, 429, 'limit full blocks normal models');
  assert.equal((await send(free.id)).status, 200, 'free model still works with a full limit');
  const me = (await t.json('/api/me', { cookie: u.cookie })).data; assert.deepEqual(me.plan.free_models, [free.id]);
  const plans = (await t.json('/api/plans')).data, pp = plans.find(x => x.id === p.id);
  assert.equal(pp.models[0].free, true); assert.equal(pp.models[0].name, 'Haiku');
  const ins = t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,0,0,?)');
  for (let i = 0; i < 500; i++) ins.run(u.id, free.id, Date.now());
  const { FREE_CTX } = await import('../src/core.js'); assert.equal(FREE_CTX, 100e3);
  const capped = await send(free.id); assert.equal(capped.status, 429); assert.match(capped.body, /500/);
});

test('plan free models: a reply whose context is 100K+ tokens counts against the limit', async () => {
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ok', { prompt_tokens: 150000, completion_tokens: 10 }));
  const t = await makeEnv({ K: 'k' }), free = addModel(t.DB, { name: 'Haiku', base_url: fm.url });
  await t.json('/api/version');
  const { u, p } = await paidUser(t, 749, [free.id]);
  t.DB.raw.prepare('UPDATE plans SET free_models=? WHERE id=?').run(JSON.stringify([free.id]), p.id);
  const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: free.id } }); await r.text();
  assert.ok(t.DB.raw.prepare('SELECT units FROM usage WHERE user_id=? AND model_id=?').get(u.id, free.id).units > 0);
});

test('Claude credit: new Pro X2+ buyers get ฿100 for Claude Eco (25 days), used before the limit; 7-day plans and old customers get none', async () => {
  const { applyPayment } = await import('../src/billing.js'), { CC } = await import('../src/credits.js');
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ok', { prompt_tokens: 1000000, completion_tokens: 0 }));
  const t = await makeEnv({ K: 'k' }), eco = addModel(t.DB, { name: 'Claude Sonnet 5.5 Eco', base_url: fm.url, cost_in: 1.67 }), other = addModel(t.DB, { name: 'GPT', base_url: fm.url });
  await t.json('/api/version');
  const px2 = addPlan(t.DB, { price: 1490, models: [eco.id, other.id], limit_4h: 1, limit_week: 1 }), wk = addPlan(t.DB, { price: 499, models: [eco.id] });
  t.DB.raw.prepare('UPDATE plans SET days=7 WHERE id=?').run(wk.id);
  const u = await t.user(), old = await t.user(), w = await t.user();
  const pay = (uid, plan, id, at = Date.now()) => ({ id, user_id: uid, kind: 'plan', plan_id: plan, amount: 1, slip_key: 'slip/a', period: 'month', created_at: at });
  await applyPayment(t.env, pay(u.id, px2.id, 1));
  const c = t.DB.raw.prepare('SELECT * FROM claude_credits WHERE user_id=?').get(u.id);
  assert.equal(c.amount, 100); assert.ok(Math.abs(c.expires_at - Date.now() - 25 * 864e5) < 60e3);
  await applyPayment(t.env, pay(u.id, px2.id, 1)); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM claude_credits WHERE user_id=?').get(u.id).n, 1, 'same payment once');
  await applyPayment(t.env, pay(u.id, px2.id, 2)); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM claude_credits WHERE user_id=?').get(u.id).n, 2, 'each renewal');
  await applyPayment(t.env, pay(w.id, wk.id, 3)); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM claude_credits WHERE user_id=?').get(w.id).n, 0, '7-day plan gets none');
  t.DB.raw.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,1490,'slip/o','approved','plan','month',?,?)").run(old.id, px2.id, CC.start - 864e5, CC.start - 864e5);
  await applyPayment(t.env, pay(old.id, px2.id, 4)); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM claude_credits WHERE user_id=?').get(old.id).n, 0, 'old customer gets none');

  t.DB.raw.prepare('UPDATE users SET week_start=?, sess_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, u.id);
  t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,5,5,?)').run(u.id, other.id, Date.now());
  const send = async mid => { t.DB.raw.exec('DELETE FROM rate'); const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: mid } }); await r.text(); return r.status; };
  assert.equal(await send(other.id), 429, 'limit full');
  assert.equal(await send(eco.id), 200, 'Claude Eco still works on the credit');
  const used = t.DB.raw.prepare('SELECT SUM(used) s FROM claude_credits WHERE user_id=?').get(u.id).s;
  assert.ok(used > 1.6 && used < 1.8, 'cost taken from the credit: ' + used);
  assert.equal(t.DB.raw.prepare('SELECT units FROM usage WHERE user_id=? AND model_id=?').get(u.id, eco.id).units, 0);
  const me = (await t.json('/api/me', { cookie: u.cookie })).data; assert.ok(me.claude_credit.left > 198 && me.claude_credit.usd > 290);
});

test('Claude credit order: limit first by default, credit first when switched on; API uses the credit too', async () => {
  const { applyPayment } = await import('../src/billing.js'), { sha } = await import('./helpers.mjs');
  let fm; fm = await fakeModel((req, res) => fm.sse(res, 'ok', { prompt_tokens: 1000000, completion_tokens: 0 }));
  const t = await makeEnv({ K: 'k' }), eco = addModel(t.DB, { name: 'Claude Opus 5.5 Eco', base_url: fm.url, cost_in: 3.33 });
  await t.json('/api/version');
  const px2 = addPlan(t.DB, { price: 1490, models: [eco.id], limit_4h: 1e6, limit_week: 1e6 }), u = await t.user();
  t.DB.raw.prepare('UPDATE plans SET api_limit=1 WHERE id=?').run(px2.id);
  await applyPayment(t.env, { id: 9, user_id: u.id, kind: 'plan', plan_id: px2.id, amount: 1490, slip_key: 'slip/a', period: 'month', created_at: Date.now() });
  const used = () => t.DB.raw.prepare('SELECT SUM(used) s FROM claude_credits WHERE user_id=?').get(u.id).s;
  const chat = async () => { t.DB.raw.exec('DELETE FROM rate'); const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'hi', model_id: eco.id } }); await r.text(); return r.status; };
  assert.equal(await chat(), 200); assert.equal(used(), 0, 'default: limit first, credit untouched');
  assert.equal((await t.json('/api/me', { method: 'PUT', cookie: u.cookie, body: { cc_first: true } })).status, 200);
  assert.equal(await chat(), 200); assert.ok(used() > 3.3, 'credit first after switching: ' + used());
  const before = used(), key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const r = await t.call('/v1/chat/completions', { method: 'POST', body: { model: 'claude-opus-5.5-eco', messages: [{ role: 'user', content: 'hi' }] }, headers: { authorization: 'Bearer ' + key } });
  const body = await r.text(); await Promise.all(t.ctx.pending);
  assert.equal(r.status, 200, body); assert.equal(r.headers.get('x-astracode-billing'), 'credit'); assert.ok(used() > before + 3.3, 'API took from the credit');
});

test('Claude credit reminder: 5 days before expiry, once, only when ≥ ฿5 is left', async () => {
  const { remindClaudeCredits, claudeCreditLeft } = await import('../src/credits.js');
  const t = await makeEnv(), u = await t.user(), u2 = await t.user();
  await claudeCreditLeft(t.env, u.id); // สร้างตาราง
  const ins = t.DB.raw.prepare('INSERT INTO claude_credits (user_id,payment_id,amount,used,expires_at,created_at) VALUES (?,?,?,?,?,?)');
  ins.run(u.id, 1, 100, 20, Date.now() + 3 * 864e5, Date.now()); ins.run(u2.id, 2, 100, 98, Date.now() + 3 * 864e5, Date.now()); ins.run(u.id, 3, 100, 0, Date.now() + 20 * 864e5, Date.now());
  assert.equal(await remindClaudeCredits(t.env), 1);
  assert.equal(await remindClaudeCredits(t.env), 0, 'only once');
});
