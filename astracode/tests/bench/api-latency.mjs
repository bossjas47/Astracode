// วัดเวลาตอบของ /v1/chat/completions แบบจำลอง: D1 หน่วงต่อคำสั่ง, โมเดลปลอมหน่วงตัวแรก · ไม่ใช่เทสต์ (ไม่อยู่ใน npm test)
// รัน: node tests/bench/api-latency.mjs [D1_MS=20] [MODEL_MS=400]
// ผลเป็น JSON: ttft (สตรีม) หรือเวลาจบ (ไม่สตรีม), คำสั่ง D1 ก่อนเรียกโมเดล, รอบรอ D1 ก่อนเรียกโมเดล
import { makeEnv, addModel, addPlan, fakeModel, sha } from '../helpers.mjs';

const D1_MS = +(process.argv[2] ?? 20), MODEL_MS = +(process.argv[3] ?? 400);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function slowDB(DB, stats) {
  let inflight = 0;
  const wait = async () => { stats.q++; if (!inflight++) stats.rt++; await sleep(D1_MS); inflight--; };
  const prep = DB.prepare;
  DB.prepare = sql => { const s = prep(sql); for (const k of ['first', 'all', 'run']) { const f = s[k].bind(s); s['_' + k] = f; s[k] = async (...a) => { await wait(); return f(...a); }; } return s; };
  const batch = DB.batch.bind(DB);
  DB.batch = async st => { await wait(); for (const x of st) for (const k of ['first', 'all', 'run']) if (x['_' + k]) x[k] = x['_' + k]; return batch(st); };
}

async function scenario(name, { stream, wallet }) {
  const stats = { q: 0, rt: 0, atModel: null };
  let fm; fm = await fakeModel((req, res) => { stats.atModel ??= { q: stats.q, rt: stats.rt }; setTimeout(() => fm.sse(res, 'สวัสดี'), MODEL_MS); });
  const t = await makeEnv({ K: 'x' });
  const m = addModel(t.DB, { name: 'Chat One', base_url: fm.url });
  const plan = addPlan(t.DB, { models: [m.id], price: 100, limit_4h: 1000, limit_week: 1000 });
  t.DB.raw.prepare('UPDATE plans SET api_limit=1 WHERE id=?').run(plan.id);
  const u = await t.user({ balance: 100 });
  if (!wallet) t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  const key = 'sk-astra-' + Math.random().toString(36).slice(2, 12);
  t.DB.raw.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').run(u.id, 'k', await sha(key), key.slice(0, 14), Date.now());
  const call = () => t.worker.default.fetch(new Request('https://t.test/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'chat-one', stream, messages: [{ role: 'user', content: 'สวัสดี' }] }) }), t.env, t.ctx);
  await (await call()).text(); await Promise.all(t.ctx.pending); t.ctx.pending.length = 0; // อุ่นแคชต่อ isolate (รายการโมเดล, ensureCols) เหมือนเครื่องที่รันอยู่แล้ว
  t.DB.raw.exec('DELETE FROM rate'); stats.atModel = null;
  slowDB(t.DB, stats);
  const t0 = performance.now(); let first = 0;
  const r = await call();
  const rd = r.body.getReader(), dec = new TextDecoder(); let body = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; const s = dec.decode(value, { stream: true }); body += s; if (!first && /สวัสดี/.test(body)) first = performance.now() - t0; }
  const total = performance.now() - t0; await Promise.all(t.ctx.pending); fm.close();
  return { name, status: r.status, ttft: Math.round(first), total: Math.round(total), d1BeforeModel: stats.atModel?.q, d1WaitsBeforeModel: stats.atModel?.rt, d1Total: stats.q };
}

const rows = [];
rows.push(await scenario('v1 สตรีม · ใช้ลิมิตแพลน', { stream: true, wallet: false }));
rows.push(await scenario('v1 ไม่สตรีม · ใช้ลิมิตแพลน', { stream: false, wallet: false }));
rows.push(await scenario('v1 สตรีม · จ่ายจาก Wallet', { stream: true, wallet: true }));
console.log(JSON.stringify({ D1_MS, MODEL_MS, rows }, null, 1));
process.exit(0);
