// สะพาน Roblox: ปลั๊กอินจำลอง (HTTP) poll → ได้คำสั่ง → ส่งผล · token ผิดถูกปฏิเสธ · ยังไม่ต่อ = บอกวิธี
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { startBridge, robloxTool, pluginSource, pluginDir, installPlugin, ROBLOX_TOOL } = require('../roblox');
const { builtinSkills } = require('../skills');

const fakePlugin = (port, token, handle) => {
  let stop = false;
  (async () => { while (!stop) {
    const r = await fetch(`http://127.0.0.1:${port}/kyber-rbx/poll?place=Obby`, { headers: { 'x-kyber-token': token } }).catch(() => null);
    if (!r) break; if (r.status !== 200) { if (r.status === 403) break; continue; }
    const cmd = await r.json(), out = handle(cmd);
    await fetch(`http://127.0.0.1:${port}/kyber-rbx/result`, { method: 'POST', headers: { 'x-kyber-token': token, 'content-type': 'application/json' }, body: JSON.stringify({ id: cmd.id, ...out }) });
  } })();
  return () => { stop = true; };
};

test('bridge: tool call goes to the Studio plugin and the result comes back; errors keep the Error prefix', async () => {
  const port = 47900 + Math.floor(Math.random() * 50), b = startBridge({ token: 'tok', port });
  assert.match(await robloxTool(b, { op: 'info' }), /ยังไม่ได้เชื่อม Roblox Studio/);
  const seen = [], stop = fakePlugin(port, 'tok', c => { seen.push(c); return c.op === 'read' ? { ok: false, data: 'ไม่พบ Nope' } : { ok: true, data: c.op === 'info' ? { place: 'Obby' } : 'Workspace [Workspace]' }; });
  for (let i = 0; i < 50 && !b.connected(); i++) await new Promise(r => setTimeout(r, 20));
  assert.equal(b.place(), 'Obby');
  assert.equal(await robloxTool(b, { op: 'tree', path: '', depth: 1 }), 'Workspace [Workspace]');
  assert.deepEqual(seen[0], { id: 'r1', op: 'tree', args: { path: '', depth: 1 } });
  assert.match(await robloxTool(b, { op: 'info' }), /"place":"Obby"/);
  assert.equal(await robloxTool(b, { op: 'read', path: 'Nope' }), 'Error: ไม่พบ Nope');
  assert.match(await robloxTool(b, { op: 'fly' }), /^Error: op ต้องเป็น/);
  stop(); await b.close();
});

test('bridge: wrong token is refused (other programs on the PC cannot drive Studio)', async () => {
  const port = 47960 + Math.floor(Math.random() * 30), b = startBridge({ token: 'right', port });
  await new Promise(r => setTimeout(r, 50));
  const r = await fetch(`http://127.0.0.1:${port}/kyber-rbx/poll`, { headers: { 'x-kyber-token': 'wrong' } });
  assert.equal(r.status, 403); assert.equal(b.connected(), false); await b.close();
});

test('plugin file: token and port filled in, installed into the Studio plugins folder; tool and skill exist', () => {
  const src = pluginSource('abc', 1234); assert.match(src, /local PORT, TOKEN, VERSION = "1234", "abc"/); assert.ok(!src.includes('{{'));
  assert.equal(pluginDir('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\U'), path.join('C:\\L', 'Roblox', 'Plugins'));
  assert.equal(pluginDir('darwin', {}, '/Users/a'), path.join('/Users/a', 'Documents', 'Roblox', 'Plugins'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbx-')), f = installPlugin('zz', dir);
  assert.match(fs.readFileSync(f, 'utf8'), /"zz"/);
  assert.equal(ROBLOX_TOOL.function.name, 'roblox');
  assert.match(builtinSkills({ text: 'ช่วยทำเกม Roblox หน่อย' }), /Roblox Studio \(Luau\)/);
});
