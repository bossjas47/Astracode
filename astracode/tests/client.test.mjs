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
  const man = JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8')); assert.equal(man.share_target.action, '/share-in'); assert.equal(man.share_target.method, 'POST'); // ไฟล์ต้องส่งแบบ POST multipart
  const app = readFileSync(join(pub, 'app.js'), 'utf8'), shop = readFileSync(join(pub, 'shop.js'), 'utf8');
  assert.ok(shop.includes('PAGES.plans = plansPage') && shop.includes('PAGES.pricing = pricing') && !/^async function plansPage/m.test(app), 'plans and pricing pages live in shop.js');
});

test('Code mode: every path that ends a send puts the send button back (no stuck stop button)', () => {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/code.js'), 'utf8');
  const fn = code.slice(code.indexOf('async function codeSend'), code.indexOf('// ---------- AI ดูผลลัพธ์เอง'));
  const resumeReturn = fn.slice(fn.indexOf('if (resume && (reload'), fn.indexOf('IDE.busy = false; $(\'#cgo\').innerHTML = ic(\'up\'); $(\'#cgo\').classList.remove(\'stop\'); drawAI();\n  // โหมดอัตโนมัติ'));
  assert.ok(/IDE\.busy = false/.test(resumeReturn) && /classList\.remove\('stop'\)/.test(resumeReturn), 'the resume early-return must reset busy and the button');
});

test('fenceBare wraps unfenced code runs for display and leaves prose and fenced replies alone', () => {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/code.js'), 'utf8');
  const fb = new Function(`${code.slice(code.indexOf('const CODE_LINE'), code.indexOf('const stripTools'))}\nreturn fenceBare;`)();
  const bare = 'function chunkify(str, size) {\nconst out = [];\nconst s = String(str || \'\');\nfor (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));\nreturn out;\n}\n\n/* ── live ── */\nasync function liveStream(a, b) {\nconst mt = a.metrics;\nconst url = settings.baseUrl;\n}';
  const r = fb(bare); assert.ok(r.startsWith('```js\nfunction chunkify') && r.trim().endsWith('```'), r);
  assert.equal(fb('```js\nlet a = 1;\n```\nเสร็จแล้ว'), '```js\nlet a = 1;\n```\nเสร็จแล้ว', 'already fenced');
  const prose = 'ผมแก้ไฟล์ให้แล้ว: ปรับสีปุ่มเป็นสีน้ำเงิน และเพิ่มคำอธิบายให้ชัดขึ้น ลองเปิดดูผลได้เลยครับ ถ้ายังไม่ถูกใจบอกได้';
  assert.equal(fb(prose), prose);
  const mixed = 'แก้ฟังก์ชันนี้:\nconst a = 1;\nconst b = 2;\nlet c = a + b;\nreturn c;\nแล้วลองรันดู ถ้ามีปัญหาบอกได้ครับ ขอบคุณ';
  const m = fb(mixed); assert.ok(m.includes('```js\nconst a = 1;') && m.includes('return c;\n```\nแล้วลองรันดู'), m);
  const short = 'const a = 1;\nconst b = 2;'; assert.equal(fb(short), short, 'two lines are not wrapped');
});

test('generated images get a download button; vote, speak and memory buttons use icons instead of emoji', () => {
  const d = join(dirname(fileURLToPath(import.meta.url)), '../public'), app = readFileSync(join(d, 'app.js'), 'utf8'), chat = readFileSync(join(d, 'chat.js'), 'utf8');
  assert.ok(app.includes('class="img-dl"') && app.includes("closest('.img-dl')"));
  for (const k of ['thumbup', 'thumbdown', 'volume', 'bulb']) assert.ok(new RegExp(`"${k}":"<`).test(app), 'icon ' + k);
  assert.ok(!/[\u{1F44D}\u{1F44E}\u{1F50A}\u{1F4A1}\u{1F4C4}]/u.test(chat), 'no emoji left in the chat page buttons');
});

test('per-hunk diff: separate changes become separate hunks; applying only some keeps the rest as before', () => {
  const f = new Function(`${pick('function hunksOf', 'function showDiff')}\nreturn { hunksOf, pickHunks };`)();
  const a = ['a', 'b', 'c', 'd', 'e', 'f', 'g'], b = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h'];
  const d = f.hunksOf(a, b); assert.equal(d.hunks.length, 2);
  assert.equal(f.pickHunks(d, new Set([0, 1])), b.join('\n'));
  assert.equal(f.pickHunks(d, new Set([1])), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n'));
  assert.equal(f.pickHunks(d, new Set()), a.join('\n'));
});

test('applyEdits: an insert-only edit (REPLACE contains SEARCH) applies once, not again on re-render', () => {
  const body = '<<<<<<< SEARCH\nlet a = 1;\n=======\nlet a = 1;\nlet b = 2;\n>>>>>>> REPLACE';
  const once = ctx.applyEdits('let a = 1;\nrun();\n', body).content;
  assert.equal(once, 'let a = 1;\nlet b = 2;\nrun();\n');
  assert.equal(ctx.applyEdits(once, body).content, once, 'second pass is a no-op');
});

test('APK attach: binary AndroidManifest/layout decode to XML, dex lists the app classes (real apktool-built APK)', async () => {
  const chat = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/chat.js'), 'utf8');
  const fns = new Function(chat.slice(chat.indexOf('function axmlToText'), chat.indexOf('async function apkFiles')) + '\nreturn { axmlToText, dexClasses };')();
  const { execFileSync } = await import('node:child_process');
  const apk = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/demo.apk');
  const get = n => new Uint8Array(execFileSync('unzip', ['-p', apk, n]));
  const man = fns.axmlToText(get('AndroidManifest.xml'));
  assert.match(man, /<manifest xmlns:android="http:\/\/schemas.android.com\/apk\/res\/android"/);
  assert.match(man, /package="com.demo.app"/); assert.match(man, /android:name="android.permission.INTERNET"/); assert.match(man, /android:exported="true"/);
  assert.match(man, /<\/application>/);
  const lay = fns.axmlToText(get('res/layout/main.xml')); assert.match(lay, /android:layout_height="16dp"/); assert.match(lay, /<TextView .* \/>/);
  assert.deepEqual(fns.dexClasses(get('classes.dex')), ['com.demo.app.MainActivity']);
  assert.equal(fns.axmlToText(new TextEncoder().encode('<a/>')), null);
});

test('effortFor: a user who never picked a level starts at Medium on thinking models; a saved choice (even Instant) is kept', () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/app.js'), 'utf8');
  const a = app.indexOf('const EFFORT_INFO'), b = app.indexOf('\n}\n', app.indexOf('function modelEfforts')) + 3;
  const code = app.slice(a, b) + '\nreturn effortFor;'; // EFFORT_INFO, DEFAULT_EFFORTS, effortFor, modelEfforts อยู่ติดกัน
  const run = saved => new Function('localStorage', code)({ getItem: () => saved });
  const claude = { effort: 'anthropic' }, flat = { effort: 'none' };
  assert.equal(run(null)(claude, ''), 'medium', 'never chose: Medium');
  assert.equal(run('')(claude, ''), '', 'chose Instant before: stays Instant');
  assert.equal(run('high')(claude, 'high'), 'high');
  assert.equal(run(null)(flat, ''), '', 'model without thinking: unchanged');
});
