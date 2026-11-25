// สถานะ Connector: เรียกล้ม (เซิร์ฟเวอร์ล่ม/สิทธิ์หมด) = บันทึกไว้และหน้าแชตได้รายการเตือน · เรียกสำเร็จ = ล้างสถานะ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';
import { connCall, connectorRoutes } from '../src/connectors.js';

test('connector health: a failing server is marked, shows up in /api/connectors/health, and clears after a good call', async () => {
  const t = await makeEnv(), u = await t.user();
  await connectorRoutes(new Request('http://x/api/connectors'), t.env, new URL('http://x/api/connectors'), '/api/connectors', 'GET', u).catch(() => {}); // สร้างตาราง
  const id = t.DB.raw.prepare("INSERT INTO mcp_servers (user_id,name,url,enabled,auto,created_at) VALUES (?, 'Down', 'https://down.example/mcp', 1, 1, ?) RETURNING id").get(u.id, Date.now()).id;
  const real = globalThis.fetch; let up = false;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://down.example/mcp') return real(url, init);
    if (!up) return new Response('bad gateway', { status: 502 });
    const b = JSON.parse(init.body), result = b.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} } : { content: [{ type: 'text', text: 'ok!' }] };
    return Response.json({ jsonrpc: '2.0', id: b.id, result });
  };
  try {
    const sv = () => t.DB.raw.prepare('SELECT * FROM mcp_servers WHERE id=?').get(id);
    await assert.rejects(connCall(t.env, sv(), 'x', {}));
    assert.match(sv().last_error, /เชื่อมต่อไม่ได้/);
    const h = await (await connectorRoutes(new Request('http://x/api/connectors/health'), t.env, new URL('http://x/api/connectors/health'), '/api/connectors/health', 'GET', u)).json();
    assert.deepEqual(h.broken.map(x => x.name), ['Down']);
    up = true; assert.match(String(await connCall(t.env, sv(), 'x', {})), /ok!/);
    assert.equal(sv().last_error, null);
  } finally { globalThis.fetch = real; }
});
