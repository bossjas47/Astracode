// สร้างวิดีโอ: หัก Wallet ต่อคลิป · ผู้ให้บริการเสร็จ = เก็บ mp4 ใน R2 แล้วเปิดดูได้ · ล้มเหลว/เริ่มไม่ได้ = คืนเงิน · คนอื่นเปิดไม่ได้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';

const r2 = () => { const m = new Map(); return { m, put: async (k, v) => { m.set(k, new Uint8Array(v)); }, get: async k => m.has(k) ? { body: m.get(k) } : null, delete: async k => { m.delete(k); } }; };

test('video: wallet charge, upstream job polled to done, mp4 stored and served; failures refund', async () => {
  const SLIPS = r2(), calls = [], real = globalThis.fetch; let mode = 'ok';
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); if (!u.startsWith('https://api.maxplus-ai.cc')) return real(url, init);
    calls.push({ u, m: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.authorization });
    if (u.endsWith('/v1/videos') && init.method === 'POST') return mode === 'reject' ? new Response(JSON.stringify({ error: 'no credit' }), { status: 402 }) : Response.json({ id: 'up1', status: 'queued' });
    if (u.includes('/v1/videos/up1')) return Response.json(mode === 'fail' ? { status: 'failed', error: { message: 'bad prompt' } } : { status: 'completed', output: { url: 'https://api.maxplus-ai.cc/files/up1.mp4' } });
    if (u.endsWith('/files/up1.mp4')) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
    return new Response('nf', { status: 404 });
  };
  try {
    const t = await makeEnv({ K: 'k', SLIPS, VIDEO_KEY: 'vk' }); await t.json('/api/version');
    for (const [k, v] of [['video_enabled', '1'], ['video_price', '59']]) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
    const u = await t.user(); t.DB.raw.prepare('UPDATE users SET balance=200 WHERE id=?').run(u.id);
    const bal = () => t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
    const r = await t.json('/api/videos', { method: 'POST', cookie: u.cookie, body: { prompt: 'rainy city street at night', aspect: '9:16' } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(bal(), 141);
    const sent = calls.find(c => c.m === 'POST'); assert.equal(sent.auth, 'Bearer vk'); assert.equal(sent.body.model, 'sd26-seedance-2.5-2'); assert.equal(sent.body.aspect_ratio, '9:16'); assert.equal(sent.body.duration, 5);
    const v = (await t.json('/api/videos/' + r.data.id, { cookie: u.cookie })).data;
    assert.equal(v.status, 'done'); assert.ok(SLIPS.m.has(`video/${u.id}/${r.data.id}.mp4`));
    const f = await t.call(v.url, { cookie: u.cookie }); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'video/mp4');
    const other = await t.user(); assert.equal((await t.call(v.url, { cookie: other.cookie })).status, 404);
    // ผู้ให้บริการปฏิเสธตอนเริ่ม: คืนเงินทันที
    mode = 'reject'; const r2x = await t.json('/api/videos', { method: 'POST', cookie: u.cookie, body: { prompt: 'a cat dancing on the moon' } });
    assert.equal(r2x.status, 502); assert.equal(bal(), 141);
    // สร้างล้มเหลวภายหลัง: คืนเงินตอนเช็กสถานะ
    mode = 'ok'; const r3 = await t.json('/api/videos', { method: 'POST', cookie: u.cookie, body: { prompt: 'sunrise over the sea' } }); assert.equal(bal(), 82);
    mode = 'fail'; t.DB.raw.prepare('UPDATE videos SET checked_at=NULL').run();
    const v3 = (await t.json('/api/videos/' + r3.data.id, { cookie: u.cookie })).data; assert.equal(v3.status, 'failed'); assert.equal(bal(), 141);
    assert.equal((await t.json('/api/videos', { method: 'POST', cookie: other.cookie, body: { prompt: 'no money here please' } })).status, 402);
  } finally { globalThis.fetch = real; }
});

test('video in chat: the AI calls generate_video with the attached image, the clip is charged and shows as a marker; 30s max', async () => {
  const { addModel, addPlan, fakeModel, readSSE } = await import('./helpers.mjs');
  const SLIPS = r2(), real = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, init = {}) => { const u = String(url); if (!u.startsWith('https://api.maxplus-ai.cc')) return real(url, init); sent.push(JSON.parse(init.body || '{}')); return Response.json({ id: 'up9', status: 'queued' }); };
  try {
    let n = 0; const fm = await fakeModel((req, res, body) => { n++; const tools = body.messages.filter(x => x.role === 'tool').length;
      if (!tools) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'v1', type: 'function', function: { name: 'generate_video', arguments: JSON.stringify({ prompt: 'product spinning on a table', duration: 45, aspect: '9:16', use_attached_images: true }) } }] } }] }) + '\n\ndata: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n'); return res.end(); }
      return fm.sse(res, 'กำลังสร้างวิดีโอให้ครับ'); });
    const t = await makeEnv({ K: 'k', SLIPS, VIDEO_KEY: 'vk' }); await t.json('/api/version');
    for (const [k, v] of [['video_enabled', '1'], ['video_price', '59']]) t.DB.raw.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(k, v);
    const m = addModel(t.DB, { name: 'M', base_url: fm.url }); t.DB.raw.prepare("UPDATE models SET tools='on', vision=1 WHERE id=?").run(m.id);
    const p = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 349 }), u = await t.user();
    t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=?, balance=100 WHERE id=?').run(p.id, Date.now() + 864e5, u.id);
    const img = 'data:image/png;base64,iVBORw0KGgo=';
    const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'ทำวิดีโอโฆษณาจากรูปนี้', model_id: m.id, images: [img] } }));
    assert.match(ev.filter(e => e.t).map(e => e.t).join(''), /\[\[vid:\d+\]\]/);
    assert.equal(sent[0].duration, 30); assert.equal(sent[0].aspect_ratio, '9:16'); assert.deepEqual(sent[0].images, [img]);
    assert.equal(t.DB.raw.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance, 41);
    assert.ok(t.DB.raw.prepare('SELECT chat_id FROM videos').get().chat_id > 0);
    fm.close();
  } finally { globalThis.fetch = real; }
});
