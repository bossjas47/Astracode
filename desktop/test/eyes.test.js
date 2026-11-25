// ตาช่วยของโมเดลที่อ่านรูปไม่ได้: แปลงผล UI Automation · เลือกโมเดลตาช่วย · บรรยายภาพ · ไม่แนบรูปให้โมเดลที่อ่านรูปไม่ได้
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUia, uiaText, pickEyes, describeScreen } = require('../eyes');
const { runAgent } = require('../agent');

test('parseUia: scales physical pixels to screenshot pixels, keeps names with |, drops off-screen', () => {
  const out = 'WINDOW|Roblox Studio\r\nButton|Play|200|100\r\nEdit|ค้นหา|a|b|400|300\r\nButton|Far|99999|5\r\nbad line';
  const r = parseUia(out, { sx: 2, sy: 2, w: 1280, h: 720 });
  assert.equal(r.window, 'Roblox Studio');
  assert.deepEqual(r.items, [{ type: 'Button', name: 'Play', x: 100, y: 50 }, { type: 'Edit', name: 'ค้นหา|a|b', x: 200, y: 150 }]);
  assert.match(uiaText(r), /Button "Play" @ 100,50/);
  assert.match(uiaText({ window: 'Game', items: [] }), /วาดหน้าจอเอง/);
});

test('pickEyes: cheapest vision model by plan multiplier, then cost; none = null', () => {
  const ms = [{ id: 'deepseek-uncen', vision: false, multiplier: 0.5 }, { id: 'claude-opus-5.5-eco', vision: true, multiplier: 8, cost: 30 }, { id: 'gemini-flash', vision: true, multiplier: 1, cost: 3 }, { id: 'gpt-mini', vision: true, multiplier: 1, cost: 2 }, { id: 'image-gen', vision: true, multiplier: 0.1 }];
  assert.equal(pickEyes(ms), 'gpt-mini');
  assert.equal(pickEyes([{ id: 'x', vision: false }]), null);
});

test('describeScreen: sends the screenshot to the eyes model with goal and Windows elements', async () => {
  let sent; const post = async b => { sent = b; return { ok: true, json: async () => ({ choices: [{ message: { content: 'ปุ่ม Play @ 100,50' } }] }) }; };
  const t = await describeScreen({ post, model: 'gpt-mini', image: 'data:image/jpeg;base64,AA', w: 1280, h: 720, goal: 'กด Play', uia: 'Button "Play" @ 100,50' });
  assert.equal(t, 'ปุ่ม Play @ 100,50'); assert.equal(sent.model, 'gpt-mini');
  assert.equal(sent.messages[1].content[1].type, 'image_url'); assert.match(sent.messages[1].content[0].text, /กด Play[\s\S]*Button "Play"/);
  assert.equal(await describeScreen({ post: async () => ({ ok: false }), model: 'm', image: 'x' }), null);
});

test('runAgent seeImages=false: tool images are not attached (no 400 from a text-only model)', async () => {
  const seen = []; let n = 0;
  const sse = o => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\ndata: [DONE]\n\n`)); c.close(); } }), { status: 200 });
  const fetchImpl = async (_, init) => { const b = JSON.parse(init.body); seen.push(b.messages); return sse(n++ === 0 ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'shot', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] } : { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }); };
  await runAgent({ base: 'http://x/v1', key: 'k', model: 'm', messages: [{ role: 'user', content: 'go' }], tools: [{ type: 'function', function: { name: 'shot', parameters: { type: 'object', properties: {} } } }], verifyGate: false, seeImages: false, fetchImpl, callTool: async () => ({ text: 'จับภาพแล้ว', images: ['data:image/png;base64,AA'] }) });
  const last = JSON.stringify(seen[1]); assert.ok(!last.includes('image_url')); assert.match(last, /อ่านรูปไม่ได้/);
});
