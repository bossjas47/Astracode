// ดึง repo จาก GitHub: รูปในโปรเจกต์มาเป็น data URL (แยกจากไฟล์ข้อความ) · ไบนารีอื่น/ใหญ่เกินยังข้าม
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { remoteFiles } from '../src/projects.js';

test('remoteFiles: images come in as data URLs, text as text, other binaries are skipped', async () => {
  const d = mkdtempSync(join(tmpdir(), 'ghz-')), root = join(d, 'own-repo-abc');
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<img src="public/icon.png">');
  writeFileSync(join(root, 'public', 'icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  writeFileSync(join(root, 'font.woff2'), Buffer.from([0, 1, 2, 3, 0, 5]));
  execFileSync('zip', ['-qr', join(d, 'z.zip'), 'own-repo-abc'], { cwd: d });
  const zip = readFileSync(join(d, 'z.zip'));
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/zip' }); r.end(zip); }).listen(0);
  await new Promise(r => srv.on('listening', r));
  try {
    const { files, images, skipped } = await remoteFiles('t', 'own/repo', 'abc', 'http://127.0.0.1:' + srv.address().port);
    assert.equal(files.get('index.html'), '<img src="public/icon.png">');
    assert.equal(images.get('public/icon.png'), 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]).toString('base64'));
    assert.ok(skipped.includes('font.woff2')); assert.ok(!files.has('public/icon.png'));
  } finally { srv.close(); }
});
