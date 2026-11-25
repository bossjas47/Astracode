// Connector แบบโหลดเท่าที่ใช้: list สั้น · describe ให้พารามิเตอร์ · call ผ่าน /v1/mcp/call · ไม่มี Connector = บอกวิธีเชื่อม
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CONNECTORS_TOOL, makeHub } = require('../hub');

test('hub: one small tool instead of every connector schema; list, describe and call go through the server', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push([url, init.method || 'GET', init.headers?.authorization]);
    if (url.endsWith('/v1/mcp/tools')) return { ok: true, json: async () => ({ tools: [{ name: 'rmcp_gmail_search', description: 'Search Gmail messages by query '.repeat(10), parameters: { type: 'object', properties: { q: { type: 'string' } } } }] }) };
    return { ok: true, json: async () => ({ text: 'found 3 emails for ' + JSON.parse(init.body).args.q }) };
  };
  const hub = makeHub({ site: 'https://k', key: 'sk', fetchImpl });
  assert.equal(await hub.has(), true);
  const list = await hub.run({ action: 'list' }); assert.match(list, /rmcp_gmail_search: Search Gmail/); assert.ok(list.length < 300, 'descriptions are shortened');
  assert.match(await hub.run({ action: 'describe', name: 'gmail_search' }), /"q"/);
  assert.equal(await hub.run({ action: 'call', name: 'rmcp_gmail_search', args: { q: 'invoice' } }), 'found 3 emails for invoice');
  assert.match(await hub.run({ action: 'call', name: 'nope' }), /^Error: ไม่พบ/);
  assert.equal(seen.filter(s => s[0].endsWith('/tools')).length, 1, 'tool list cached'); assert.equal(seen[0][2], 'Bearer sk');
  assert.ok(JSON.stringify(CONNECTORS_TOOL).length < 900);
  const empty = makeHub({ site: 'x', key: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ tools: [] }) }) });
  assert.equal(await empty.has(), false); assert.match(await empty.run({ action: 'list' }), /ยังไม่มี Connector/);
});
