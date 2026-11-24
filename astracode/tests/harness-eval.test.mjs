// รัน Eval Harness (tests/bench/harness-eval.mjs) ทุกเคสใน npm test: สถานการณ์ออฟไลน์ของ Kyber Harness ต้องผ่านครบ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, runEval } from './bench/harness-eval.mjs';

test('eval harness has at least 8 offline scenarios', () => assert.ok(CASES.length >= 8, String(CASES.length)));
for (const c of CASES) test(`eval: ${c.name} — ${c.about}`, async () => {
  const { results: [r] } = await runEval([c.name]);
  assert.ok(r.pass, `${c.name}: ${r.error || ''} ${r.final || ''}`);
});
