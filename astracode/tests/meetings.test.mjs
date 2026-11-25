// AI ประชุม: ส่งเสียงทีละช่วง (WAV) → ถอดด้วยโมเดลที่ฟังเสียงได้ → สรุปตอนจบ · หักลิมิตแพลน · ช่วงที่ค้าง cron ถอดต่อ · ถามต่อในแชต
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel } from './helpers.mjs';
import { parseLines, meetCron } from '../src/meetings.js';

function r2() {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)); }, get: async k => m.has(k) ? { body: m.get(k) } : null, delete: async ks => { for (const k of [].concat(ks)) m.delete(k); } };
}
const wav = (n = 1000) => { const b = new Uint8Array(44 + n); b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); b.set([...'WAVE'].map(c => c.charCodeAt(0)), 8); return b; };

async function setup({ fail = false } = {}) {
  const seen = [];
  const fm = await fakeModel((q, res, body) => {
    seen.push(body);
    if (fail) { res.writeHead(500); return res.end('down'); }
    const audio = JSON.stringify(body.messages).includes('input_audio');
    const text = audio ? '{"t": 1.5, "s": "ผู้พูด 1", "x": "สวัสดีครับ วันนี้คุยเรื่องงบ"}\n{"t": 9, "s": "ผู้พูด 2", "x": "สมชายจะส่งงบวันศุกร์"}'
      : '```json\n{"title":"ประชุมงบ","summary":"- คุยเรื่องงบ","decisions":["อนุมัติงบ"],"actions":[{"who":"สมชาย","what":"ส่งงบ","when":"วันศุกร์"}],"speakers":{"ผู้พูด 2":"สมชาย"}}\n```';
    fm.sse(res, text, { prompt_tokens: 3000, completion_tokens: 200 });
  });
  const SLIPS = r2(), t = await makeEnv({ K: 'k', SLIPS });
  const gem = addModel(t.DB, { name: 'Gemini 3 Flash', base_url: fm.url, api_model: 'gemini-3-flash' });
  const plan = addPlan(t.DB, { name: 'Plus', price: 100, models: [gem.id], limit_4h: 1000, limit_week: 1000 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e6, u.id);
  const api = (p, o = {}) => t.json('/api/meetings' + p, { cookie: u.cookie, ...o });
  const seg = (id, n, body = wav(), dur = 180) => t.worker.default.fetch(new Request(`https://t.test/api/meetings/${id}/seg/${n}?dur=${dur}`, { method: 'POST', headers: { cookie: u.cookie, 'content-type': 'audio/wav' }, body }), t.env, t.ctx).then(r => r.json().then(d => ({ status: r.status, data: d })));
  return { t, fm, seen, SLIPS, gem, plan, u, api, seg };
}

test('meetings: parse JSON lines, arrays and plain text', () => {
  assert.deepEqual(parseLines('{"t":2,"s":"ผู้พูด 1","x":"ก"}\n{"t":5,"s":"ผู้พูด 2","x":"ข"}').map(l => l.s), ['ผู้พูด 1', 'ผู้พูด 2']);
  assert.equal(parseLines('```json\n[{"start":1,"speaker":"A","text":"hi"}]\n```')[0].x, 'hi');
  assert.equal(parseLines('just text')[0].x, 'just text');
  assert.equal(parseLines('').length, 0);
});

test('meetings: record two parts, each is transcribed with audio sent to the model, finish writes minutes, renames speakers, charges the plan', async () => {
  const S = await setup();
  const m = await S.api('', { method: 'POST', body: { title: '' } }); assert.equal(m.status, 200); assert.equal(m.data.status, 'recording');
  const r0 = await S.seg(m.data.id, 0); assert.equal(r0.data.status, 'done', JSON.stringify(r0)); assert.equal(r0.data.lines, 2);
  const sent = S.seen[0].messages.at(-1).content; assert.equal(sent.find(p => p.type === 'input_audio').input_audio.format, 'wav');
  await S.seg(m.data.id, 1, wav(), 100);
  assert.match(JSON.stringify(S.seen[1].messages), /สมชายจะส่งงบ/, 'the previous part tail is sent for speaker continuity');
  const fin = await S.api(`/${m.data.id}/finish`, { method: 'POST' });
  assert.equal(fin.data.status, 'done'); assert.equal(fin.data.title, 'ประชุมงบ', 'auto title replaces the default one');
  assert.equal(fin.data.summary.actions[0].who, 'สมชาย'); assert.equal(fin.data.speakers['ผู้พูด 2'], 'สมชาย');
  assert.equal(fin.data.lines.length, 4); assert.equal(fin.data.lines[2].t, 181.5, 'times are offset by earlier parts'); assert.equal(fin.data.dur, 280);
  const use = S.t.DB.raw.prepare("SELECT COUNT(*) n, SUM(units) u FROM usage WHERE user_id=? AND src='meeting'").get(S.u.id); assert.equal(use.n, 3); assert.ok(use.u > 0, 'plan limit charged');
  const p = await S.api(`/${m.data.id}`, { method: 'PATCH', body: { speakers: { 'ผู้พูด 1': 'คุณนก' } } }); assert.equal(p.data.speakers['ผู้พูด 1'], 'คุณนก');
  const audio = await S.t.call(`/api/meetings/${m.data.id}/audio/0`, { cookie: S.u.cookie }); assert.equal(audio.headers.get('content-type'), 'audio/wav');
  const c = await S.api(`/${m.data.id}/chat`, { method: 'POST' }); const chat = S.t.DB.raw.prepare('SELECT * FROM chats WHERE id=?').get(c.data.chat_id);
  assert.match(chat.instructions, /คุณนก: สวัสดีครับ/); assert.match(chat.title, /^ประชุม: /);
  assert.equal((await S.api('?q=' + encodeURIComponent('ส่งงบ'))).data.items.length, 1, 'search inside transcripts');
  assert.equal((await S.seg(m.data.id, 2)).status, 409, 'no more parts after finishing');
  S.fm.close();
});

test('meetings: bad audio refused; other users cannot read; delete removes audio', async () => {
  const S = await setup();
  const id = (await S.api('', { method: 'POST', body: { title: 'x' } })).data.id;
  assert.equal((await S.seg(id, 0, new Uint8Array(100))).status, 400);
  await S.seg(id, 0);
  const other = await S.t.user();
  assert.equal((await S.t.json('/api/meetings/' + id, { cookie: other.cookie })).status, 404);
  assert.equal((await S.t.call(`/api/meetings/${id}/audio/0`, { cookie: other.cookie })).status, 404);
  assert.equal((await S.api('/' + id, { method: 'DELETE' })).status, 200);
  assert.equal([...S.SLIPS.m.keys()].length, 0);
  S.fm.close();
});

test('meetings: limit full stops transcription; model down leaves the part pending and cron finishes it later', async () => {
  const S = await setup({ fail: true });
  const id = (await S.api('', { method: 'POST', body: {} })).data.id;
  const r = await S.seg(id, 0); assert.equal(r.data.status, 'pending'); assert.match(r.data.error, /ถอดเสียงไม่สำเร็จ/);
  // ลิมิตเต็ม
  S.t.DB.raw.prepare('UPDATE users SET sess_start=?, week_start=? WHERE id=?').run(Date.now() - 1000, Date.now() - 1000, S.u.id);
  S.t.DB.raw.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,0,0,0,5000,1,?)').run(S.u.id, S.gem.id, Date.now());
  const r2 = await S.seg(id, 1); assert.match(r2.data.error, /ลิมิตเต็ม/); assert.equal(r2.data.status, 'pending');
  S.fm.close();
  // โมเดลกลับมา + ลิมิตคืน → cron ถอดต่อและสรุป
  const S2 = await setup(); // โมเดลที่ทำงาน
  S.t.DB.raw.prepare('UPDATE models SET base_url=? WHERE id=?').run(S2.fm.url, S.gem.id);
  S.t.DB.raw.prepare('DELETE FROM usage WHERE units=5000').run();
  S.t.DB.raw.prepare("UPDATE meeting_segs SET created_at=? WHERE meeting_id=?").run(Date.now() - 3600e3, id);
  S.t.DB.raw.prepare("UPDATE meetings SET status='processing', updated_at=? WHERE id=?").run(Date.now() - 3600e3, id);
  await meetCron(S.t.env, Date.now());
  const done = await S.api('/' + id); assert.equal(done.data.status, 'done'); assert.equal(done.data.lines.length, 4);
  S2.fm.close();
});

test('meetings: no transcription model configured = feature off', async () => {
  const S = await setup(); S.t.DB.raw.prepare('UPDATE models SET active=0').run();
  assert.equal((await S.api('')).data.ready, false);
  assert.equal((await S.api('', { method: 'POST', body: {} })).status, 503);
  S.fm.close();
});
