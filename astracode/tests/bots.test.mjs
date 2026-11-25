// บอทตอบแชตลูกค้าแทนร้าน: สร้าง/แก้ · สคริปต์ฝัง + หน้า iframe ฝังได้ทุกเว็บ · ตอบจากข้อมูลร้าน หักลิมิตเจ้าของ · ส่งต่อพนักงาน → ฟอร์มทิ้งเบอร์ → อีเมลแจ้งร้าน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';

async function setup({ reply = 'ร้านเปิด 9 โมงค่ะ', paid = true } = {}) {
  const fm = await fakeModel((q, res) => fm.sse(res, reply, { prompt_tokens: 200, completion_tokens: 20 }));
  const t = await makeEnv({ K: 'k' });
  const m = addModel(t.DB, { name: 'Cheap', base_url: fm.url }), plan = addPlan(t.DB, { price: paid ? 100 : 0, models: [m.id], limit_4h: 1000, limit_week: 1000 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e6, u.id);
  const api = (p, o = {}) => t.json('/api/bots' + p, { cookie: u.cookie, ...o });
  const w = (p, body) => t.json('/w/' + p, { method: 'POST', body, headers: { origin: 'https://shop.example' } });
  return { t, fm, m, plan, u, api, w };
}
const SID = 'abcdef123456abcdef';

test('bots: create, embed script and framable page, answer from shop info charged to the owner, history kept', async () => {
  const S = await setup();
  try {
    const b = (await S.api('', { method: 'POST', body: { name: 'ร้านกาแฟนก', knowledge: 'เปิด 9:00-18:00 · ลาเต้ 60 บาท' } })).data;
    const js = await S.t.call(`/w/${b.token}.js`); assert.match(js.headers.get('content-type'), /javascript/); assert.match(await js.text(), /\/w\/'\+T/);
    const pg = await S.t.call(`/w/${b.token}`); assert.equal(pg.status, 200); assert.match(pg.headers.get('content-security-policy'), /frame-ancestors \*/); assert.equal(pg.headers.get('x-frame-options'), null); assert.match(await pg.text(), /ร้านกาแฟนก/);
    const r = await S.w(`${b.token}/chat`, { sid: SID, text: 'เปิดกี่โมง' }); assert.equal(r.status, 200); assert.equal(r.data.reply, 'ร้านเปิด 9 โมงค่ะ'); assert.equal(r.data.handoff, false);
    assert.match(r.res.headers.get('access-control-allow-origin'), /\*/);
    assert.match(S.fm.hits.at(-1).body.messages[0].content, /ลาเต้ 60 บาท/, 'shop info in the system prompt');
    await S.w(`${b.token}/chat`, { sid: SID, text: 'ขอบคุณ' });
    assert.equal(S.fm.hits.at(-1).body.messages.filter(x => x.role === 'user').length, 2, 'history sent');
    assert.equal(S.t.DB.raw.prepare("SELECT COUNT(*) n FROM usage WHERE user_id=? AND src='bot'").get(S.u.id).n, 2);
    const cv = await S.api(`/${b.id}/convos`); assert.equal(cv.data.length, 1); assert.equal(cv.data[0].msgs.length, 4);
    assert.equal((await S.api('')).data.bots[0].chats, 1);
    await S.api(`/${b.id}`, { method: 'PATCH', body: { on: false } });
    assert.equal((await S.w(`${b.token}/chat`, { sid: SID, text: 'x' })).status, 404); assert.equal((await S.t.call(`/w/${b.token}`)).status, 404);
  } finally { S.fm.close(); }
});

test('bots: handoff marker shows the lead form; lead saved and mailed to the owner; unseen lead count', async () => {
  const S = await setup({ reply: 'ขอส่งเรื่องให้พนักงานนะคะ [[handoff]]' });
  const sent = []; S.t.env.RESEND_KEY = 'x'; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { if (String(u).includes('resend')) { sent.push(JSON.parse(o.body)); return new Response('{}'); } return realFetch(u, o); };
  try {
    const b = (await S.api('', { method: 'POST', body: { name: 'ร้าน' } })).data;
    const r = await S.w(`${b.token}/chat`, { sid: SID, text: 'อยากสั่ง 100 แก้ว' }); assert.equal(r.data.handoff, true); assert.doesNotMatch(r.data.reply, /handoff/);
    assert.equal((await S.w(`${b.token}/lead`, { sid: SID, name: 'ก' })).status, 400, 'contact required');
    assert.equal((await S.w(`${b.token}/lead`, { sid: SID, name: 'คุณนก', contact: '0812345678' })).status, 200);
    assert.equal(sent.length, 1, 'owner mailed'); assert.match(sent[0].html, /0812345678/); assert.match(sent[0].html, /อยากสั่ง 100 แก้ว/);
    const list = await S.api(''); assert.equal(list.data.bots[0].leads, 1);
    const leads = await S.api(`/${b.id}/convos?leads=1`); assert.equal(leads.data[0].lead.contact, '0812345678'); assert.equal(leads.data[0].msgs.length, 2);
    await S.api(`/${b.id}/leads`, { method: 'POST' }); assert.equal((await S.api('')).data.bots[0].leads, 0);
  } finally { globalThis.fetch = realFetch; S.fm.close(); }
});

test('bots: paid plans only; owner plan lapsed = polite fallback with lead form; per-IP rate limit; other users cannot read', async () => {
  const F = await setup({ paid: false });
  try { assert.equal((await F.api('', { method: 'POST', body: {} })).status, 403); } finally { F.fm.close(); }
  const S = await setup();
  try {
    const b = (await S.api('', { method: 'POST', body: {} })).data;
    const other = await S.t.user(); assert.equal((await S.t.json(`/api/bots/${b.id}/convos`, { cookie: other.cookie })).status, 404);
    assert.equal((await S.w(`${b.token}/chat`, { sid: 'bad', text: 'x' })).status, 400);
    for (let i = 0; i < 30; i++) await S.w(`${b.token}/chat`, { sid: SID, text: 'x' + i });
    assert.equal((await S.w(`${b.token}/chat`, { sid: SID, text: 'again' })).status, 429);
    S.t.DB.raw.prepare('UPDATE users SET plan_expires=? WHERE id=?').run(Date.now() - 1000, S.u.id);
    S.t.DB.raw.prepare('DELETE FROM rate').run();
    const r = await S.w(`${b.token}/chat`, { sid: SID, text: 'hi' }); assert.equal(r.data.handoff, true); assert.match(r.data.reply, /ทิ้งเบอร์/);
  } finally { S.fm.close(); }
});
