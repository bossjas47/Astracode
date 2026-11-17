// ฟังก์ชันล้วนของหน้า Code ดึงจากไฟล์จริงมารันใน Node (ไม่ต้องมีเบราว์เซอร์)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/code.js'), 'utf8');
const pick = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const ctx = new Function(`${pick('const NOT_FILE_LANG', 'function lineDiff')}\n${pick('function stepsOf', 'function stepsBar')}\nreturn { changesOf, stepsOf, stripTools, applyEdits, problemOf, isEditBody, looseCode };`)();

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

test('biLang picks the Thai or English half of "ไทย || English" text, deep in objects', () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/app.js'), 'utf8');
  const code = app.slice(app.indexOf('const biLang'), app.indexOf('async function api('));
  const run = lang => new Function('window', code + '\nreturn biLang;')({ LANG: lang });
  const d = { note: 'ปิดปรับปรุง || Maintenance', plans: [{ name: 'Pro', desc: 'คุ้มสุด || Best value' }], n: 3 };
  assert.deepEqual(run('th')(d), { note: 'ปิดปรับปรุง', plans: [{ name: 'Pro', desc: 'คุ้มสุด' }], n: 3 });
  assert.deepEqual(run('en')(d), { note: 'Maintenance', plans: [{ name: 'Pro', desc: 'Best value' }], n: 3 });
});

const edit = (path, ...pairs) => '```js path=' + path + '\n' + pairs.map(([a, b]) => `<<<<<<< SEARCH\n${a}\n=======\n${b}\n>>>>>>> REPLACE`).join('\n') + '\n```';
const SRC = 'function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n';

test('SEARCH/REPLACE: exact edit, several pairs, whitespace-tolerant match, idempotent re-run', () => {
  const get = p => p === 'x.js' ? SRC : null;
  const one = ctx.changesOf(edit('x.js', ['  return 1;', '  return 10;']), get)[0];
  assert.equal(one.content, SRC.replace('return 1;', 'return 10;')); assert.ok(one.edit);
  const two = ctx.changesOf(edit('x.js', ['  return 1;', '  return 10;'], ['  return 2;', '  return 20;']), get)[0];
  assert.equal(two.content, SRC.replace('return 1;', 'return 10;').replace('return 2;', 'return 20;'));
  const loose = ctx.changesOf(edit('x.js', ['return 2;   ', '  return 22;']), get)[0]; // ต่างแค่ช่องว่างท้าย/การเยื้อง
  assert.equal(loose.content, SRC.replace('  return 2;', '  return 22;'));
  const done = ctx.changesOf(edit('x.js', ['  return 1;', '  return 10;']), p => SRC.replace('return 1;', 'return 10;'))[0];
  assert.equal(done.content, SRC.replace('return 1;', 'return 10;'), 'applying again changes nothing');
});

test('SEARCH/REPLACE: missing, ambiguous and unknown-file edits report an error instead of writing', () => {
  const get = p => p === 'x.js' ? SRC : null;
  assert.match(ctx.changesOf(edit('x.js', ['  return 99;', 'x']), get)[0].error, /ไม่พบ/);
  assert.match(ctx.changesOf(edit('x.js', ['}', 'x']), get)[0].error, /ซ้ำหลายที่/);
  assert.match(ctx.changesOf(edit('new.js', ['a', 'b']), get)[0].error, /ยังไม่มี/);
  const create = ctx.changesOf(edit('new.js', ['', 'const a = 1;']), get)[0];
  assert.equal(create.content, 'const a = 1;\n', 'empty SEARCH creates a new file');
  const plain = ctx.changesOf('```js path=y.js\nlet y = 1;\n```', get)[0];
  assert.equal(plain.content, 'let y = 1;\n', 'whole-file blocks still work');
});

test('problemOf: bad JSON, JS syntax errors and suspicious shrinking are caught; valid files pass', () => {
  assert.match(ctx.problemOf('a.json', '{"a": }', ''), /JSON/);
  assert.equal(ctx.problemOf('a.json', '{"a": 1}', ''), '');
  assert.match(ctx.problemOf('a.js', 'function (', ''), /syntax error/);
  assert.equal(ctx.problemOf('a.js', 'const x = await Promise.resolve(1);', ''), '', 'top-level await is fine');
  assert.equal(ctx.problemOf('a.js', "import x from './x.js';\nexport default x;", ''), '', 'modules are not judged');
  assert.equal(ctx.problemOf('a.js', 'const el = <div>{x</div>;', ''), '', 'JSX-looking files are not judged');
  assert.match(ctx.problemOf('big.js', 'x', 'y'.repeat(3000)), /หดลง/);
  assert.equal(ctx.problemOf('notes.md', 'x', 'y'.repeat(3000)), '', 'docs may shrink');
});

test('unpathed code: a same-language, nearly whole-file block becomes a "guess" card for the open file; fragments are not guessed', () => {
  const html = '<!DOCTYPE html>\n<html>\n<body>\n  <h1>A</h1>\n  <button>x</button>\n</body>\n</html>\n', get = p => p === 'index.html' ? html : null, act = { path: 'index.html' };
  const whole = '```html\n<!DOCTYPE html>\n<html>\n<body>\n  <h1>B</h1>\n  <button>x</button>\n</body>\n</html>\n```';
  const g = ctx.changesOf('เสร็จแล้ว\n' + whole, get, act);
  assert.equal(g.length, 1); assert.equal(g[0].path, 'index.html'); assert.ok(g[0].guess); assert.match(g[0].content, /<h1>B<\/h1>/);
  assert.deepEqual(ctx.changesOf('```html\n<h1>B</h1>\n```', get, act), [], 'a fragment is too short to guess');
  assert.deepEqual(ctx.changesOf(whole, get, { path: 'style.css' }), [], 'language must match the open file');
  assert.deepEqual(ctx.changesOf(whole, get, null), [], 'no open file, no guess');
  assert.equal(ctx.looseCode('```html\n<h1>x</h1>\n```').length, 1); assert.equal(ctx.looseCode('```bash\nls\n```\n```js path=a.js\nx\n```').length, 0);
});

test('safeNext only accepts in-site paths (no open redirect)', () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/app.js'), 'utf8');
  const safeNext = new Function(app.slice(app.indexOf('const safeNext'), app.indexOf('async function api(')) + '\nreturn safeNext;')();
  for (const ok of ['/chat', '/code?p=3', '/plans?topup=1']) assert.equal(safeNext(ok), ok);
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, 'evil.com']) assert.equal(safeNext(bad), '/chat', String(bad));
});

test('every page loads only scripts that exist, every script parses, the manifest is valid JSON', async () => {
  const { readdirSync, existsSync } = await import('node:fs'); const { execFileSync } = await import('node:child_process');
  const pub = join(dirname(fileURLToPath(import.meta.url)), '../public');
  for (const h of readdirSync(pub).filter(f => f.endsWith('.html'))) for (const m of readFileSync(join(pub, h), 'utf8').matchAll(/<script[^>]*\ssrc="\/([^"]+)"/g)) assert.ok(existsSync(join(pub, m[1])), `${h} loads missing /${m[1]}`);
  for (const f of readdirSync(pub).filter(f => f.endsWith('.js') && !['node-runner.js', 'cm.js', 'fb.js'].includes(f))) execFileSync(process.execPath, ['--check', join(pub, f)]);
  const man = JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8')); assert.equal(man.share_target.action, '/chat');
  const app = readFileSync(join(pub, 'app.js'), 'utf8'), shop = readFileSync(join(pub, 'shop.js'), 'utf8');
  assert.ok(shop.includes('PAGES.plans = plansPage') && shop.includes('PAGES.pricing = pricing') && !/^async function plansPage/m.test(app), 'plans and pricing pages live in shop.js');
});
