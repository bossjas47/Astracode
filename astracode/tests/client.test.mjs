// ฟังก์ชันล้วนของหน้า Code ดึงจากไฟล์จริงมารันใน Node (ไม่ต้องมีเบราว์เซอร์)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/code.js'), 'utf8');
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ctx = new Function(`${pick('const NOT_FILE_LANG', 'function lineDiff')}\n${pick('function stepsOf', 'function stepsBar')}\nreturn { changesOf, stepsOf, stripTools };`)();

test('changesOf: path= blocks, heading-named blocks, ignores shell and plain examples', () => {
  const t = '# `index.html`\n```html\n<h1>x</h1>\n```\n\n```js path=a.js\nlet a\n```\n\nรัน:\n```bash\nnpm i\n```\n\nตัวอย่าง:\n```js\nconsole.log(1)\n```\nDELETE path=old.txt';
  const c = ctx.changesOf(t);
  assert.deepEqual(c.map(x => x.path), ['index.html', 'a.js', 'old.txt']);
  assert.equal(c[0].content, '<h1>x</h1>\n'); assert.ok(c[2].del);
});

test('tool lines glued to prose are parsed and stripped without eating the prose', () => {
  const t = 'ตรวจก่อนครับREAD path=index.html\nREAD path=main.pyกำลังอ่านไฟล์\nGREP btn';
  assert.deepEqual(ctx.stepsOf(t).map(s => s.op + ':' + s.arg), ['READ:index.html', 'READ:main.py', 'GREP:btn']);
  const out = ctx.stripTools(t);
  assert.ok(out.includes('ตรวจก่อนครับ') && out.includes('กำลังอ่านไฟล์') && !out.includes('READ') && !out.includes('GREP'), out);
});
