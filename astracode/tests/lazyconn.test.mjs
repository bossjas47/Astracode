import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyConn, LAZY_CONN, LAZY_TOOL } from '../src/ai.js';
test('lazy connectors: list is short, describe gives params, call maps to the real tool name', () => {
  const tools = Array.from({ length: LAZY_CONN + 3 }, (_, i) => ({ type: 'function', function: { name: `mcp_s${i}_tool${i}`, description: 'Does thing ' + i + ' '.repeat(5) + 'x'.repeat(400), parameters: { type: 'object', properties: { q: { type: 'string' } } } } }));
  const l = lazyConn(tools, { action: 'list' }).text; assert.match(l, /mcp_s0_tool0: Does thing 0/); assert.ok(l.length < tools.length * 160);
  assert.match(lazyConn(tools, { action: 'describe', name: 'tool3' }).text, /"q"/);
  assert.deepEqual(lazyConn(tools, { action: 'call', name: 'mcp_s2_tool2' }), { name: 'mcp_s2_tool2' });
  assert.match(lazyConn(tools, { action: 'call', name: 'zz' }).text, /^Error/);
  assert.ok(JSON.stringify(LAZY_TOOL).length < JSON.stringify(tools).length / 10);
});
