// โฟลเดอร์ในเครื่อง ↔ โปรเจกต์บนเว็บ: สแกน (ข้าม node_modules/ไบนารี/.env) · เขียนเฉพาะที่เปลี่ยน · รูป data URL → ไฟล์จริง · กันพาธออกนอกโฟลเดอร์ · รันคำสั่ง
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'), fs = require('fs'), path = require('path');
const { scanFolder, writeRel, removeRel, renameRel } = require('../localfs');
const { runCmd, localTool } = require('../tools');

test('localfs: scan, write, image round-trip, rename, remove, outside path refused', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-'));
  fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'node_modules/x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/a.js'), 'let a = 1');
  fs.writeFileSync(path.join(root, 'node_modules/x/i.js'), 'skip');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from([1, 0, 2]));
  const png = Buffer.from([137, 80, 78, 71, 1, 2, 3]); fs.writeFileSync(path.join(root, 'logo.png'), png);
  const s = await scanFolder(root);
  assert.deepEqual(s.files.map(f => f.path), ['logo.png', 'src/a.js']);
  assert.deepEqual(s.skipped, ['bin.dat']);
  assert.equal(s.files[0].content, 'data:image/png;base64,' + png.toString('base64'));
  assert.equal(await writeRel(root, 'src/a.js', 'let a = 1'), false); // เหมือนเดิม: ไม่เขียนซ้ำ
  assert.equal(await writeRel(root, 'new/b.txt', 'hi'), true);
  assert.equal(fs.readFileSync(path.join(root, 'new/b.txt'), 'utf8'), 'hi');
  await writeRel(root, 'img/c.png', s.files[0].content); assert.ok(fs.readFileSync(path.join(root, 'img/c.png')).equals(png));
  await renameRel(root, 'new/b.txt', 'b2.txt'); assert.ok(fs.existsSync(path.join(root, 'b2.txt')));
  await removeRel(root, 'b2.txt'); assert.ok(!fs.existsSync(path.join(root, 'b2.txt')));
  await assert.rejects(writeRel(root, '../evil.txt', 'x'), /นอกโฟลเดอร์/);
  await assert.rejects(removeRel(root, '.'), /ทั้งโฟลเดอร์/);
  assert.match(await localTool(root, 'list_dir', { path: '.' }), /\[dir\] src/); assert.equal(await localTool(root, 'read_file', { path: 'src/a.js' }), 'let a = 1');
  await assert.rejects(localTool(root, 'read_file', { path: '../x' }), /นอกโฟลเดอร์/);
});

test('runCmd: streams output, returns exit code, times out', async () => {
  const outs = [];
  const r = await runCmd(os.tmpdir(), 'node -e "console.log(1);console.error(2);process.exit(3)"', { onOut: (k, s) => outs.push(k + s.trim()) });
  assert.equal(r.code, 3); assert.equal(r.stdout.trim(), '1'); assert.equal(r.stderr.trim(), '2'); assert.ok(outs.includes('out1'));
  const t = await runCmd(os.tmpdir(), 'node -e "setTimeout(()=>{},9000)"', { timeout: 300 });
  assert.match(t.stderr, /หมดเวลา/);
});
