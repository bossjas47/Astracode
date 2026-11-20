import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// วงเล็บปีกกาที่ไม่ปิดใน CSS ทำให้ทุกกฎที่อยู่ถัดไปหายทั้งไฟล์ (หน้าเว็บกลายเป็นปุ่มเปล่า)
test('every stylesheet has balanced braces', () => {
  for (const f of readdirSync(new URL('../public/', import.meta.url)).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(new URL('../public/' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '');
    let d = 0, line = 1;
    for (const c of css) { if (c === '\n') line++; if (c === '{') d++; if (c === '}' && --d < 0) assert.fail(`${f}: extra } near line ${line}`); }
    assert.equal(d, 0, `${f}: ${d} block(s) not closed`);
  }
});
