import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slimTools } from '../src/ai.js';
test('slimTools: old long connector/MCP results are trimmed, the last 2 rounds stay whole', () => {
  const big = 'x'.repeat(20000), m = [{ role: 'user', content: 'q' }];
  for (let i = 0; i < 4; i++) m.push({ role: 'assistant', content: '', tool_calls: [{ id: 't' + i }] }, { role: 'tool', tool_call_id: 't' + i, content: big });
  assert.equal(slimTools(m), 2); assert.ok(m[2].content.startsWith('[old]') && m[2].content.length < 2000);
  assert.equal(m[8].content, big); assert.equal(slimTools(m), 0);
});
