// วัดเวลาตอบของ /api/chat แบบจำลอง: D1 หน่วงต่อคำสั่ง, โมเดลปลอมหน่วงตัวแรก, Tavily/ลิงก์หน่วง · ไม่ใช่เทสต์ (ไม่อยู่ใน npm test)
// รัน: node tests/bench/latency.mjs [D1_MS=20] [MODEL_MS=400]
// ผลเป็น JSON: เวลาถึงตัวอักษรแรก (ttft), เวลาจบ, จำนวนคำสั่ง D1, จำนวนครั้งที่เรียกโมเดล, ตัวอักษร input ที่ส่งให้โมเดลรวม
import { makeEnv, addModel, addPlan, fakeModel } from '../helpers.mjs';

const D1_MS = +(process.argv[2] ?? 20), MODEL_MS = +(process.argv[3] ?? 400), TOOLS = process.argv[4] || 'auto', TAVILY_MS = 700, LINK_MS = 600;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// D1 ช้า: ทุก first/all/run/batch รอ D1_MS ก่อน (เหมือนรอบไปกลับถึงฐานข้อมูล)
function slowDB(DB, stats) {
  const prep = DB.prepare;
  // stats.q = คำสั่งที่ส่งไป D1 (batch = 1 ครั้ง) · stats.rt = รอบไป-กลับที่ต้องรอจริง (คำสั่งที่ยิงพร้อมกันนับเป็นรอบเดียว)
  let inflight = 0;
  const wait = async () => { stats.q++; if (!inflight++) stats.rt++; await sleep(D1_MS); inflight--; };
  DB.prepare = sql => { const s = prep(sql); for (const k of ['first', 'all', 'run']) { const f = s[k].bind(s); s['_' + k] = f; s[k] = async (...a) => { await wait(); return f(...a); }; } return s; };
  const batch = DB.batch.bind(DB);
  DB.batch = async st => { await wait(); for (const x of st) for (const k of ['first', 'all', 'run']) if (x['_' + k]) x[k] = x['_' + k]; return batch(st); };
  return DB;
}

// โมเดลปลอม: แยกคำขอเขียนคำค้น / โหมด Code แบบข้อความ / แบบ tool / แชตปกติ
function brain(fm, stats) {
  return (req, res, body) => {
    stats.calls++; stats.inChars += JSON.stringify(body.messages || []).length;
    const names = (body.tools || []).map(t => t.function?.name);
    const msgs = body.messages || [], last = msgs.at(-1) || {}, sys = String(msgs[0]?.content || '');
    const toolMsg = (calls) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: calls.map((c, i) => ({ index: i, id: 'c' + stats.calls + i, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } })) } }] }) + '\n\n'); res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end(); };
    const reply = text => fm.sse(res, text);
    setTimeout(() => {
      if (/web search queries/i.test(sys)) return reply('ราคาทองวันนี้');
      const toolRounds = msgs.filter(m => m.role === 'tool').length, sawRead = JSON.stringify(msgs).includes('[READ a.js]');
      if (names.includes('read_file') && /แก้ a\.js/.test(JSON.stringify(msgs))) { // โหมด Code แบบ tool
        if (!toolRounds) return toolMsg([['read_file', { path: 'a.js' }], ['read_file', { path: 'b.js' }]]);
        if (toolRounds === 2) return toolMsg([['edit_file', { path: 'a.js', old_string: 'let a = 1', new_string: 'let a = 2' }]]);
        return reply('แก้แล้ว');
      }
      if (names.includes('web_search') && /ทอง/.test(JSON.stringify(last))) {
        if (!toolRounds) return toolMsg([['web_search', { query: 'ราคาทองวันนี้' }]]);
        return reply('ราคาทองวันนี้ 40,000 บาท');
      }
      if (/โปรเจกต์ที่มีไฟล์/.test(JSON.stringify(msgs)) || sys.includes('READ path=')) { // โหมด Code แบบข้อความ
        if (/แก้ a\.js/.test(JSON.stringify(last)) && !sawRead) return reply('ขอดูไฟล์ก่อน\nREAD path=a.js\nREAD path=b.js');
        if (sawRead) return reply('แก้แล้ว\n```js path=a.js\n<<<<<<< SEARCH\nlet a = 1\n=======\nlet a = 2\n>>>>>>> REPLACE\n```');
      }
      reply('สวัสดีครับ');
    }, MODEL_MS);
  };
}

async function scenario(name, text, { code = false } = {}) {
  const stats = { q: 0, rt: 0, calls: 0, inChars: 0 };
  let fm; fm = await fakeModel((req, res, body) => brain(fm, stats)(req, res, body));
  const t = await makeEnv({ K: 'x', TAVILY_KEY: 't' });
  const m = addModel(t.DB, { name: 'M', base_url: fm.url, cost_in: 1, cost_out: 1 });
  try { t.DB.raw.prepare('UPDATE models SET tools=? WHERE id=?').run(TOOLS, m.id); } catch { /* โค้ดเก่ายังไม่มีคอลัมน์ tools */ }
  const plan = addPlan(t.DB, { models: [m.id], price: 100, limit_4h: 1000, limit_week: 1000 });
  const u = await t.user(); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  let pid = null;
  if (code) {
    pid = (await t.json('/api/projects', { method: 'POST', cookie: u.cookie, body: { name: 'p', empty: true } })).data.id;
    for (const [p, c] of [['a.js', 'let a = 1\n'], ['b.js', 'let b = 1\n'], ['index.html', '<script src="a.js"></script>\n']]) await t.json(`/api/projects/${pid}/file`, { method: 'PUT', cookie: u.cookie, body: { path: p, content: c } });
  }
  await t.json('/api/me', { cookie: u.cookie });
  // เครือข่ายนอก: Tavily และหน้าเว็บที่ผู้ใช้แปะลิงก์ (ช้าตามจริง)
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const s = String(url?.url || url);
    if (s.includes('api.tavily.com')) { await sleep(TAVILY_MS); return new Response(JSON.stringify({ results: [{ title: 'ทอง', url: 'https://gold.example/x', content: 'ราคาทอง 40,000' }] }), { headers: { 'content-type': 'application/json' } }); }
    if (s.startsWith('https://example.com')) { await sleep(LINK_MS); return new Response('<title>ตัวอย่าง</title><p>' + 'เนื้อหาบทความ '.repeat(20) + '</p>', { headers: { 'content-type': 'text/html' } }); }
    return realFetch(url, init);
  };
  slowDB(t.DB, stats);
  const files = code ? '\n\n[โปรเจกต์ที่มีไฟล์] a.js, b.js, index.html' : '';
  const t0 = performance.now(); let first = 0;
  const r = await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: text + files, model_id: m.id, project_id: pid } });
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '', done = null;
  for (;;) {
    const { value, done: end } = await rd.read(); if (end) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (!line.startsWith('data:')) continue; const d = JSON.parse(line.slice(5)); if (d.t && d.t.trim() && !first) first = performance.now() - t0; if (d.t) out += d.t; if (d.done) done = d; if (d.error) out += ' [error ' + d.error + ']'; }
  }
  const total = performance.now() - t0; await Promise.all(t.ctx.pending);
  globalThis.fetch = realFetch; fm.close();
  return { name, ttft: Math.round(first), total: Math.round(total), d1: stats.q, d1Waits: stats.rt, modelCalls: stats.calls, inChars: stats.inChars, edited: /let a = 2/.test(out), out: out.replace(/\s+/g, ' ').slice(0, 80) };
}

const rows = [];
rows.push(await scenario('chat: ทักทาย', 'สวัสดี'));
rows.push(await scenario('chat: คำถามมีคำว่า "วันนี้" แต่ไม่ต้องค้น', 'วันนี้ช่วยแต่งกลอนสั้นๆ ให้หน่อย'));
rows.push(await scenario('chat: ต้องค้นเว็บ', 'ราคาทองวันนี้เท่าไร'));
rows.push(await scenario('chat: แปะลิงก์', 'สรุปให้หน่อย https://example.com/a'));
rows.push(await scenario('code: ถามสั้น', 'อธิบายโปรเจกต์นี้', { code: true }));
rows.push(await scenario('code: อ่าน 2 ไฟล์แล้วแก้', 'แก้ a.js ให้ a เป็น 2', { code: true }));
console.log(JSON.stringify({ TOOLS, D1_MS, MODEL_MS, TAVILY_MS, LINK_MS, rows }, null, 1));
process.exit(0);
