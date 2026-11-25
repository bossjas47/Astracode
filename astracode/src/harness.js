// Kyber Harness ฝั่งเซิร์ฟเวอร์ (ใช้ร่วมกัน: Agent เบื้องหลัง agent.js · Agent หน้า Code แบบสด ai.js)
// อ่านก่อนเขียนทับ · จับการวนซ้ำ (ชุดเดียวกับแอปคอม desktop/agent.js)
import { TEMPLATES } from './projects.js';

let STARTER_TEXT = null; // ไฟล์ตั้งต้นของโปรเจกต์ใหม่ที่ยังไม่มีใครแก้: เขียนทับได้เลย (สร้างตอนใช้ครั้งแรก: projects.js import วนกลับมาที่ไฟล์นี้)
export function blindOverwrite(c, cur, read, mine) {
  if (c.edit || c.del || c.error || !cur.has(c.path)) return false;
  const old = cur.get(c.path) || ''; if (!old.trim() || old.startsWith('data:') || (STARTER_TEXT ??= new Set(Object.values(TEMPLATES).flatMap(t => Object.values(t)))).has(old)) return false;
  return !read.has(c.path) && !mine.has(c.path);
}
// คืนข้อความเตือนให้ใส่ในรอบถัดไป · 'stop' = วนซ้ำนานเกินไป · '' = ปกติ
export function stuckHint(H, reqs, res) {
  const sig = JSON.stringify([reqs.map(r => r.op + ' ' + r.arg).sort(), [...res.applied].sort(), [...res.problems].sort()]), prob = res.problems.length ? JSON.stringify([...res.problems].sort()) : '';
  H.sigs.push(sig); H.probs.push(prob);
  const same = (arr, n) => arr.length >= n && arr.slice(-n).every(x => x && x === arr.at(-1));
  if (same(H.sigs, 5)) return 'stop';
  if (same(H.sigs, 3) && !H.hinted.has(sig)) { H.hinted.add(sig); return '[Kyber Harness · วนซ้ำ] คุณทำสิ่งเดิมซ้ำ 3 รอบติดกันโดยผลไม่เปลี่ยน หยุดทำแบบเดิม: อ่านผลด้านบนให้ดี ลองวิธีอื่น (เช่น READ ส่วนอื่นของไฟล์ ใช้ SEARCH ที่สั้นลงและตรงเป๊ะ หรือเขียนทั้งไฟล์ใหม่) หรือสรุปสิ่งที่ทำไม่ได้พร้อมเหตุผล'; }
  if (same(H.probs, 3) && !H.hinted.has('p' + prob)) { H.hinted.add('p' + prob); return '[Kyber Harness · ปัญหาเดิมซ้ำ] การเขียนไฟล์ล้มด้วยปัญหาเดิม 3 รอบติดกัน: READ ไฟล์นั้นใหม่ก่อน แล้วใช้ข้อความ SEARCH ที่คัดลอกจากไฟล์จริงทุกตัวอักษร หรือส่งทั้งไฟล์แทน';
  }
  return '';
}
