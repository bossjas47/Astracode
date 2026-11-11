// AstraCode API — Cloudflare Worker + D1 + R2
const SYSTEM = 'You are AstraCode, a helpful AI assistant. Reply in the user\'s language. Use Markdown.';
const HISTORY = 20; // ข้อความย้อนหลังที่ส่งให้โมเดล
const H4 = 4 * 3600e3, DAY = 864e5, BKK = 7 * 3600e3;

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
const err = (m, s = 400) => json({ error: m }, s);
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));

// ---------- auth ----------
async function pbkdf2(pass, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256));
}
const hashPass = async p => { const s = rand(16); return s + ':' + await pbkdf2(p, s); };
const same = (a, b) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); return x.length === y.length && crypto.subtle.timingSafeEqual(x, y); };
const checkPass = async (p, stored) => { const [s, h] = stored.split(':'); return same(await pbkdf2(p, s), h); };
const sha = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
const ip = req => req.headers.get('cf-connecting-ip') || 'local';

// นับครั้งต่อช่วงเวลา คืน true ถ้าเกิน max
async function limited(env, key, max, ms) {
  const now = Date.now();
  const r = await env.DB.prepare(`INSERT INTO rate (key,n,reset) VALUES (?1,1,?2)
    ON CONFLICT(key) DO UPDATE SET n=CASE WHEN reset<?3 THEN 1 ELSE n+1 END, reset=CASE WHEN reset<?3 THEN ?2 ELSE reset END RETURNING n`).bind(key, now + ms, now).first();
  return r.n > max;
}
const unlimit = (env, key) => env.DB.prepare('DELETE FROM rate WHERE key=?').bind(key).run();

async function getUser(req, env) {
  const sid = (req.headers.get('cookie') || '').match(/(?:^|;\s*)sid=([a-f0-9]+)/)?.[1];
  if (!sid) return null;
  const u = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').bind(await sha(sid), Date.now()).first();
  if (u) u.sid = await sha(sid);
  return u;
}
async function startSession(env, uid) {
  const t = rand(32), exp = Date.now() + 30 * DAY; // เก็บแค่ hash ของ token ถ้า DB รั่วก็เอาไปล็อกอินไม่ได้
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await sha(t), uid, exp),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': `sid=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}` });
}

// ---------- plan + limits ----------
async function planOf(env, u) {
  if (u.plan_id && u.plan_expires > Date.now()) {
    const p = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(u.plan_id).first();
    if (p) return p;
  }
  return env.DB.prepare('SELECT * FROM plans WHERE price=0 AND active=1 ORDER BY sort LIMIT 1').first();
}
function weekStart(now) { // จันทร์ 00:00 เวลาไทย
  const d = new Date(now + BKK);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY - BKK;
}
async function usageStatus(env, u, plan) {
  const now = Date.now(), r0 = u.usage_reset_at || 0, ws = weekStart(now);
  const s4 = Math.max(now - H4, r0), sw = Math.max(ws, r0);
  const r = await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN created_at>=?1 THEN units END),0) u4,
      COALESCE(SUM(CASE WHEN created_at>=?2 THEN units END),0) uw,
      MIN(CASE WHEN created_at>=?1 THEN created_at END) first4
    FROM usage WHERE user_id=?3 AND created_at>=?4`).bind(s4, sw, u.id, Math.min(s4, sw)).first();
  const pct = (a, b) => b > 0 ? Math.min(100, Math.round(a / b * 1000) / 10) : 100;
  return {
    pct4h: pct(r.u4, plan.limit_4h), pctWeek: pct(r.uw, plan.limit_week),
    reset4h: r.first4 ? r.first4 + H4 : null, resetWeek: ws + 7 * DAY,
  };
}
const allowedModels = (env, planId) => env.DB.prepare(
  'SELECT m.id,m.name,m.multiplier,m.vision,m.effort FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.active=1 ORDER BY m.sort').bind(planId).all().then(r => r.results);

// ---------- AI providers ----------
// คืน async generator: {t:text} ระหว่างทาง, {usage:{fresh,read,write,out}} ตอนจบ
async function* sse(res) {
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  try { for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') try { yield JSON.parse(d); } catch {} }
    }
  } } finally { rd.cancel().catch(() => {}); } // ผู้ใช้กดหยุด: ตัดการเชื่อมต่อ AI ทันที
}
async function* callModel(env, m, msgs, { effort, images = [] } = {}) {
  const key = env[m.key_name];
  if (!key) throw new Error('missing key ' + m.key_name);
  if (m.provider === 'anthropic') {
    const messages = msgs.map(x => ({ role: x.role, content: x.content }));
    const last = messages.at(-1); // cache ทั้งบทสนทนาถึงข้อความล่าสุด
    last.content = [
      ...images.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1) } })),
      { type: 'text', text: last.content, cache_control: { type: 'ephemeral' } },
    ];
    const body = { model: m.api_model, max_tokens: 16000, stream: true, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages };
    // shortcut: Max ของ Claude ส่งเป็น high เพราะ effort max ใช้ได้แค่บางรุ่น ถ้ารุ่นที่ใช้รองรับ ให้เปลี่ยนเป็น 'max'
    if (m.effort === 'anthropic' && effort) { body.thinking = { type: 'adaptive' }; body.output_config = { effort: { low: 'low', high: 'medium', max: 'high' }[effort] }; }
    const res = await fetch(m.base_url + '/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const u = { fresh: 0, read: 0, write: 0, out: 0 };
    for await (const e of sse(res)) {
      if (e.type === 'message_start') { const x = e.message.usage; u.fresh = x.input_tokens || 0; u.read = x.cache_read_input_tokens || 0; u.write = x.cache_creation_input_tokens || 0; }
      else if (e.type === 'content_block_delta' && e.delta?.text) yield { t: e.delta.text };
      else if (e.type === 'message_delta' && e.usage) u.out = e.usage.output_tokens || 0;
      else if (e.type === 'error') throw new Error(e.error?.message || 'upstream error');
    }
    yield { usage: u };
  } else { // OpenAI-compatible: OpenAI, DeepSeek, Kimi, Gemini
    const messages = [{ role: 'system', content: SYSTEM }, ...msgs.map(x => ({ role: x.role, content: x.content }))];
    if (images.length) messages.at(-1).content = [{ type: 'text', text: messages.at(-1).content }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
    const body = { model: m.api_model, stream: true, stream_options: { include_usage: true }, messages };
    if (m.effort === 'openai' && effort) body.reasoning_effort = { low: 'low', high: 'medium', max: 'high' }[effort];
    if (m.effort === 'deepseek') { // DeepSeek เปิดคิดเป็นค่าเริ่มต้น จึงต้องปิดเองเมื่อเลือก "เร็ว"
      body.thinking = { type: effort ? 'enabled' : 'disabled' };
      if (effort) body.reasoning_effort = effort; // DeepSeek รับ low / high / max ตรงๆ
    }
    const res = await fetch(m.base_url + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let usage = null;
    for await (const e of sse(res)) {
      const t = e.choices?.[0]?.delta?.content; if (t) yield { t };
      if (e.usage) usage = e.usage;
    }
    const p = usage?.prompt_tokens || 0;
    const read = usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0;
    yield { usage: { fresh: p - read, read, write: 0, out: usage?.completion_tokens || 0 } };
  }
}

async function chat(req, env, u, ctx) {
  const b = await req.json();
  const images = Array.isArray(b.images) && !b.regenerate ? b.images.slice(0, 4) : [];
  if (images.some(d => typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d) || d.length > 2e6)) return err('รูปต้องเป็น jpeg/png/webp ไม่เกิน 1.5MB');
  let text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 20000) return err('ข้อความยาวเกิน 20,000 ตัวอักษร');
  if (!b.regenerate && !text && !images.length) return err('ข้อความว่าง');
  if (!text && images.length) text = 'อธิบายรูปนี้';
  const effort = ['low', 'high', 'max'].includes(b.effort) ? b.effort : null;
  const plan = await planOf(env, u);
  const m = await env.DB.prepare('SELECT m.* FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.id=? AND m.active=1').bind(plan.id, b.model_id).first();
  if (!m) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
  if (images.length && !m.vision) return err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น');
  const st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
  if (await limited(env, 'chatmin:' + u.id, 20, 60e3)) return err('ส่งเร็วเกินไป รอสักครู่', 429);
  // ให้ตอบได้ทีละข้อความ กันยิงพร้อมกันหลายอันเพื่อเลี่ยงลิมิต (ล็อกหมดอายุเองใน 3 นาที)
  const lock = 'chatlock:' + u.id;
  const got = await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n')
    .bind(lock, Date.now() + 180e3, Date.now()).first();
  if (!got) return err('กำลังตอบข้อความก่อนหน้าอยู่', 429);
  try {

  let cid = b.chat_id;
  if (cid && !await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first()) return err('ไม่พบแชต', 404);
  if (b.regenerate) { // ตอบใหม่: ลบคำตอบล่าสุด แล้วใช้คำถามเดิม
    const last = cid && await env.DB.prepare('SELECT id,role FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').bind(cid).first();
    if (!last) return err('ไม่มีข้อความให้ตอบใหม่');
    if (last.role === 'assistant') await env.DB.prepare('DELETE FROM messages WHERE id=?').bind(last.id).run();
  } else {
    if (!cid) cid = (await env.DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(u.id, text.slice(0, 40), Date.now()).first()).id;
    // shortcut: ไม่เก็บรูปไว้ในประวัติ (โมเดลเห็นรูปแค่ข้อความนี้) ถ้าต้องการให้จำรูป ให้เก็บใน R2
    const saved = images.length ? `${text}\n\n[แนบรูป ${images.length} รูป]` : text;
    await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(cid, 'user', saved, m.id, Date.now()).run();
  }
  const hist = (await env.DB.prepare('SELECT role,content FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?').bind(cid, HISTORY).all()).results.reverse();
  while (hist.length && hist[0].role !== 'user') hist.shift();
  if (!hist.length) { await unlimit(env, lock); return err('ไม่มีข้อความให้ตอบ'); }

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  let gone = false; // ผู้ใช้กดหยุดหรือหลุด
  const send = async o => { if (gone) return; try { await w.write(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch { gone = true; } };
  ctx.waitUntil((async () => { // waitUntil: ทำงานต่อจนบันทึกเสร็จ แม้ผู้ใช้กดหยุด
    let out = '', usage = null;
    await send({ chat_id: cid, model: m.name });
    try {
      for await (const e of callModel(env, m, hist, { effort, images })) {
        if (gone) break;
        if (e.t) { out += e.t; await send({ t: e.t }); }
        if (e.usage) usage = e.usage;
      }
    } catch (e) {
      console.log('AI error', m.name, e.message);
      await send({ error: u.role === 'admin' ? 'แอดมิน: ' + e.message : 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' });
    }
    if (!usage && gone) { // shortcut: กดหยุดก่อนได้ usage จริง จึงประมาณจากจำนวนตัวอักษร ÷ 2
      const chars = hist.reduce((a, x) => a + x.content.length, SYSTEM.length);
      usage = { fresh: Math.ceil(chars / 2), read: 0, write: 0, out: Math.ceil(out.length / 2) };
    }
    if (out) await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(cid, 'assistant', out, m.id, Date.now()).run();
    if (usage) {
      const cost = (usage.fresh * m.cost_in + usage.read * m.cost_cache + usage.write * m.cost_cache_write + usage.out * m.cost_out) / 1e6;
      const units = (usage.fresh + usage.write + usage.read / 10 + usage.out) * m.multiplier; // cache read นับ 1/10
      await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(u.id, m.id, usage.fresh + usage.write, usage.out, usage.read, units, cost, Date.now()).run();
    }
    await unlimit(env, lock);
    await send({ done: true, ...(await usageStatus(env, u, plan)) });
    await w.close().catch(() => {});
  })());
  return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
  } catch (e) { await unlimit(env, lock); throw e; }
}

// ---------- slip ----------
async function getSetting(env, k) { return (await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(k).first())?.value || ''; }
// shortcut: ส่ง multipart (file + keyapi) และ Bearer ให้ API เช็กสลิป ถ้า byshop ใช้รูปแบบอื่นให้แก้ฟังก์ชันนี้ที่เดียว
async function checkSlip(env, file) {
  const url = await getSetting(env, 'slip_api_url');
  if (!url || !env.SLIP_API_KEY) return { result: null, amount: null };
  try {
    const fd = new FormData(); fd.append('file', file); fd.append('keyapi', env.SLIP_API_KEY);
    const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + env.SLIP_API_KEY }, body: fd });
    const data = await r.json();
    const path = (await getSetting(env, 'slip_amount_field')) || 'amount';
    const amount = parseFloat(path.split('.').reduce((o, k) => o?.[k], data));
    return { result: JSON.stringify(data).slice(0, 4000), amount: isNaN(amount) ? null : amount };
  } catch (e) { return { result: JSON.stringify({ error: e.message }), amount: null }; }
}

// ดูชนิดไฟล์จากไบต์จริง ไม่เชื่อชนิดที่เบราว์เซอร์ส่งมา
function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
async function pay(req, env, u) {
  const fd = await req.formData();
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1 AND price>0').bind(fd.get('plan_id')).first();
  const file = fd.get('slip');
  if (!plan) return err('ไม่พบแพลน');
  if (!(file instanceof File) || file.size > 5e6) return err('อัปโหลดรูปสลิป (ไม่เกิน 5MB)');
  if (await limited(env, 'pay:' + u.id, 5, 3600e3)) return err('ส่งสลิปบ่อยเกินไป รอ 1 ชั่วโมง', 429);
  if (await env.DB.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").bind(u.id).first()) return err('มีคำขอที่รออนุมัติอยู่แล้ว');
  const buf = await file.arrayBuffer();
  const type = imageType(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
  if (!type) return err('รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
  const key = 'slip/' + hex(await crypto.subtle.digest('SHA-256', buf));
  if (await env.DB.prepare('SELECT 1 FROM payments WHERE slip_key=?').bind(key).first()) return err('สลิปนี้ถูกใช้แล้ว');
  await env.SLIPS.put(key, buf, { httpMetadata: { contentType: type } });
  const c = await checkSlip(env, new File([buf], 'slip.' + type.split('/')[1], { type }));
  await env.DB.prepare('INSERT INTO payments (user_id,plan_id,amount,slip_key,slip_check,slip_amount,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(u.id, plan.id, plan.price, key, c.result, c.amount, Date.now()).run();
  return json({ ok: true });
}

// ---------- admin ----------
const TABLES = {
  plans: ['name', 'price', 'limit_4h', 'limit_week', 'description', 'sort', 'active'],
  models: ['name', 'provider', 'api_model', 'base_url', 'key_name', 'multiplier', 'cost_in', 'cost_out', 'cost_cache', 'cost_cache_write', 'vision', 'effort', 'sort', 'active'],
};
const SETTINGS = ['promptpay_id', 'slip_api_url', 'slip_amount_field', 'featured_plan'];

async function admin(req, env, path, url) {
  const M = req.method, DB = env.DB;
  let r;
  if ((r = path.match(/^\/api\/admin\/(plans|models)(?:\/(\d+))?$/))) {
    const [, t, id] = r, cols = TABLES[t];
    if (M === 'GET') {
      const rows = (await DB.prepare(`SELECT * FROM ${t} ORDER BY sort,id`).all()).results;
      if (t === 'plans') { const pm = (await DB.prepare('SELECT * FROM plan_models').all()).results; rows.forEach(p => p.model_ids = pm.filter(x => x.plan_id === p.id).map(x => x.model_id)); }
      else rows.forEach(m => m.has_key = !!env[m.key_name]);
      return json(rows);
    }
    if (M === 'DELETE' && id) {
      await DB.prepare(`DELETE FROM ${t} WHERE id=?`).bind(id).run();
      await DB.prepare(`DELETE FROM plan_models WHERE ${t === 'plans' ? 'plan_id' : 'model_id'}=?`).bind(id).run();
      return json({ ok: true });
    }
    const b = await req.json(), vals = cols.map(c => b[c] ?? null);
    let pid = id;
    if (M === 'POST') pid = (await DB.prepare(`INSERT INTO ${t} (${cols}) VALUES (${cols.map(() => '?')}) RETURNING id`).bind(...vals).first()).id;
    else if (M === 'PUT' && id) await DB.prepare(`UPDATE ${t} SET ${cols.map(c => c + '=?')} WHERE id=?`).bind(...vals, id).run();
    else return err('bad request');
    if (t === 'plans' && Array.isArray(b.model_ids)) await DB.batch([
      DB.prepare('DELETE FROM plan_models WHERE plan_id=?').bind(pid),
      ...b.model_ids.map(mid => DB.prepare('INSERT INTO plan_models VALUES (?,?)').bind(pid, mid)),
    ]);
    return json({ ok: true, id: pid });
  }
  if (path === '/api/admin/payments') return json((await DB.prepare(
    'SELECT p.*,u.email,pl.name plan_name FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id ORDER BY p.status=\'pending\' DESC, p.id DESC LIMIT 200').all()).results);
  if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/)) && M === 'POST') {
    const p = await DB.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").bind(r[1]).first();
    if (!p) return err('ไม่พบคำขอที่รออนุมัติ', 404);
    const upd = await DB.prepare("UPDATE payments SET status=? WHERE id=? AND status='pending'").bind(r[2] === 'approve' ? 'approved' : 'rejected', p.id).run();
    if (!upd.meta.changes) return err('คำขอนี้ถูกจัดการไปแล้ว', 409); // กันกดอนุมัติซ้ำพร้อมกัน
    if (r[2] === 'approve') {
      const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(p.user_id).first();
      const base = u.plan_id === p.plan_id && u.plan_expires > Date.now() ? u.plan_expires : Date.now(); // ต่ออายุแพลนเดิมต่อท้าย
      await DB.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').bind(p.plan_id, base + 30 * DAY, p.user_id).run();
    }
    return json({ ok: true });
  }
  if ((r = path.match(/^\/api\/admin\/slip\/(\d+)$/))) {
    const p = await DB.prepare('SELECT slip_key FROM payments WHERE id=?').bind(r[1]).first();
    const o = p && await env.SLIPS.get(p.slip_key);
    const t = o?.httpMetadata?.contentType;
    if (!o || !['image/jpeg', 'image/png', 'image/webp'].includes(t)) return err('not found', 404);
    return new Response(o.body, { headers: { 'content-type': t, 'content-security-policy': "default-src 'none'; sandbox", 'cache-control': 'private, no-store' } });
  }
  if (path === '/api/admin/users') {
    const q = '%' + (url.searchParams.get('q') || '') + '%';
    return json((await DB.prepare('SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,p.name plan_name FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.email LIKE ? ORDER BY u.id DESC LIMIT 100').bind(q).all()).results);
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'PUT') {
    const b = await req.json();
    if (b.password != null) {
      if (String(b.password).length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
      await DB.batch([DB.prepare('UPDATE users SET pass_hash=? WHERE id=?').bind(await hashPass(String(b.password)), r[1]), DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1])]);
    }
    if (b.reset_usage) await DB.prepare('UPDATE users SET usage_reset_at=? WHERE id=?').bind(Date.now(), r[1]).run();
    if ('banned' in b) await DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(b.banned ? 1 : 0, r[1]).run();
    if ('plan_id' in b) await DB.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').bind(b.plan_id || null, b.plan_id ? Date.now() + (b.days || 30) * DAY : null, r[1]).run();
    if (b.banned) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/stats') {
    const d = new Date(Date.now() + BKK), ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - BKK; // ต้นเดือนเวลาไทย
    const rev = await DB.prepare("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='approved' AND created_at>=?").bind(ms).first();
    const models = (await DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(u.tokens_in+u.tokens_cache) tin, SUM(u.tokens_out) tout, SUM(u.cost) cost FROM usage u JOIN models m ON m.id=u.model_id WHERE u.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(ms).all()).results;
    const users = await DB.prepare('SELECT COUNT(*) total, SUM(plan_id IS NOT NULL AND plan_expires>?) paid FROM users').bind(Date.now()).first();
    const pending = await DB.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").first();
    const cost = models.reduce((a, m) => a + m.cost, 0);
    return json({ revenue: rev.v, cost, profit: rev.v - cost, models, users, pending: pending.n });
  }
  if (path === '/api/admin/settings') {
    if (M === 'PUT') { const b = await req.json(); await DB.batch(SETTINGS.filter(k => k in b).map(k => DB.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').bind(k, String(b[k])))); }
    const rows = (await DB.prepare('SELECT * FROM settings').all()).results;
    return json({ ...Object.fromEntries(rows.map(x => [x.key, x.value])), slip_key_set: !!env.SLIP_API_KEY });
  }
  return err('not found', 404);
}

// ---------- router ----------
const API = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname, M = req.method;
    if (!path.startsWith('/api/')) return secure(await env.ASSETS.fetch(req));
    if (M !== 'GET' && M !== 'HEAD') {
      const o = req.headers.get('origin'); // กัน CSRF: รับคำขอแก้ข้อมูลจากเว็บตัวเองเท่านั้น
      if (o && o !== url.origin) return err('forbidden', 403);
      if (+req.headers.get('content-length') > 12e6) return err('ไฟล์ใหญ่เกินไป', 413);
    }
    return secure(await route(req, env, ctx, url, path, M));
  },
};

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://promptpay.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function secure(res) {
  const r = new Response(res.body, res), h = r.headers;
  if (!h.has('content-security-policy')) h.set('content-security-policy', CSP);
  h.set('x-content-type-options', 'nosniff');
  h.set('x-frame-options', 'DENY');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return r;
}

async function route(req, env, ctx, url, path, M) {
    try {
      if (path === '/api/register' && M === 'POST') {
        const { email, password } = await req.json();
        const e = String(email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return err('อีเมลไม่ถูกต้อง');
        if (String(password || '').length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(e).first()) return err('อีเมลนี้สมัครแล้ว');
        if (await limited(env, 'reg:' + ip(req), 3, DAY)) return err('สมัครจากเครือข่ายนี้บ่อยเกินไป ลองใหม่พรุ่งนี้', 429);
        // ได้สิทธิ์แอดมินเฉพาะตอนที่ยังไม่มีแอดมินในระบบ
        const role = e === String(env.ADMIN_EMAIL || '').toLowerCase() && !await env.DB.prepare("SELECT 1 FROM users WHERE role='admin'").first() ? 'admin' : 'user';
        const u = await env.DB.prepare('INSERT INTO users (email,pass_hash,role,created_at) VALUES (?,?,?,?) RETURNING id').bind(e, await hashPass(password), role, Date.now()).first();
        return startSession(env, u.id);
      }
      if (path === '/api/login' && M === 'POST') {
        const { email, password } = await req.json();
        const e = String(email || '').trim().toLowerCase();
        if (await limited(env, 'loginip:' + ip(req), 30, 900e3) || await limited(env, 'login:' + e, 5, 900e3))
          return err('ลองผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่', 429);
        const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(e).first();
        if (!u || !await checkPass(String(password || ''), u.pass_hash)) return err('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
        if (u.banned) return err('บัญชีนี้ถูกระงับ', 403);
        await unlimit(env, 'login:' + e);
        return startSession(env, u.id);
      }
      if (path === '/api/plans') {
        const plans = (await env.DB.prepare('SELECT id,name,price,description,limit_week FROM plans WHERE active=1 ORDER BY sort').all()).results;
        const featured = +await getSetting(env, 'featured_plan');
        for (const p of plans) { // ประมาณจำนวนข้อความ/สัปดาห์ (1 ข้อความ ≈ 2,500 token)
          p.models = (await allowedModels(env, p.id)).map(m => ({ name: m.name, week: Math.floor(p.limit_week / (2500 * m.multiplier)) }));
          p.featured = p.id === featured;
          delete p.limit_week;
        }
        return json(plans);
      }

      const u = await getUser(req, env);
      if (!u || u.banned) return err('กรุณาเข้าสู่ระบบ', 401);

      if (path === '/api/logout') {
        await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(u.sid).run();
        return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
      }
      if (path === '/api/password' && M === 'POST') {
        const b = await req.json();
        if (await limited(env, 'login:' + u.email, 5, 900e3)) return err('ลองผิดหลายครั้งเกินไป รอ 15 นาที', 429);
        if (!await checkPass(String(b.old || ''), u.pass_hash)) return err('รหัสผ่านเดิมไม่ถูกต้อง', 401);
        if (String(b.new || '').length < 8) return err('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว');
        await env.DB.batch([ // ออกจากระบบทุกเครื่อง ยกเว้นเครื่องนี้
          env.DB.prepare('UPDATE users SET pass_hash=? WHERE id=?').bind(await hashPass(String(b.new)), u.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').bind(u.id, u.sid),
        ]);
        await unlimit(env, 'login:' + u.email);
        return json({ ok: true });
      }
      if (path === '/api/me') {
        const plan = await planOf(env, u);
        return json({
          email: u.email, role: u.role, plan: { id: plan.id, name: plan.name, expires: plan.price > 0 ? u.plan_expires : null },
          usage: await usageStatus(env, u, plan), models: await allowedModels(env, plan.id),
          promptpay_id: await getSetting(env, 'promptpay_id'),
        });
      }
      if (path === '/api/chat' && M === 'POST') return chat(req, env, u, ctx);
      if (path === '/api/chats') return json((await env.DB.prepare('SELECT id,title FROM chats WHERE user_id=? ORDER BY id DESC LIMIT 100').bind(u.id).all()).results);
      let r;
      if ((r = path.match(/^\/api\/chats\/(\d+)$/))) {
        if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(r[1], u.id).first()) return err('ไม่พบแชต', 404);
        if (M === 'DELETE') { await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE chat_id=?').bind(r[1]), env.DB.prepare('DELETE FROM chats WHERE id=?').bind(r[1])]); return json({ ok: true }); }
        if (M === 'PUT') {
          const title = String((await req.json()).title || '').trim().slice(0, 80);
          if (!title) return err('ชื่อว่าง');
          await env.DB.prepare('UPDATE chats SET title=? WHERE id=?').bind(title, r[1]).run();
          return json({ ok: true });
        }
        return json((await env.DB.prepare('SELECT m.role,m.content,md.name model FROM messages m LEFT JOIN models md ON md.id=m.model_id WHERE m.chat_id=? ORDER BY m.id').bind(r[1]).all()).results);
      }
      if (path === '/api/pay' && M === 'POST') return pay(req, env, u);
      if (path === '/api/pay') return json((await env.DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE user_id=? ORDER BY p.id DESC LIMIT 20').bind(u.id).all()).results);

      if (path.startsWith('/api/admin/')) return u.role === 'admin' ? admin(req, env, path, url) : err('forbidden', 403);
      return err('not found', 404);
    } catch (e) {
      console.log('error', path, e.stack);
      return err('เซิร์ฟเวอร์ผิดพลาด', 500);
    }
}

const FILES = {"/app.js":["text/javascript; charset=utf-8","// AstraCode frontend — vanilla JS, hash router\nconst $ = s => document.querySelector(s);\nconst app = $('#app');\nconst esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\nconst baht = n => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });\nconst num = n => Number(n || 0).toLocaleString('th-TH');\nconst when = t => t ? new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';\nconst DOTS = '<span class=\"dots\"><i></i><i></i><i></i></span>';\nconst EFFORTS = [['', 'Instant'], ['low', 'Low'], ['high', 'High'], ['max', 'Max']];\nconst SUGGEST = ['อธิบายเรื่องนี้ให้เข้าใจง่าย: ', 'ช่วยเขียนโค้ด Python ที่', 'สรุปข้อความนี้ให้สั้นลง:\\n', 'แปลเป็นภาษาอังกฤษ:\\n'];\nlet me = null, installEvt = null;\nlet chat = { id: null, msgs: [], busy: false, ctrl: null, images: [], chats: [] };\n\nasync function api(path, opt = {}) {\n  if (opt.body && !(opt.body instanceof FormData)) { opt.body = JSON.stringify(opt.body); opt.headers = { 'content-type': 'application/json' }; }\n  const r = await fetch('/api' + path, opt);\n  const d = r.headers.get('content-type')?.includes('json') ? await r.json() : null;\n  if (r.status === 401) me = null;\n  if (!r.ok) throw Object.assign(new Error(d?.error || 'ผิดพลาด'), { data: d });\n  return d;\n}\n\n// ---------- Markdown ----------\nfunction inline(s) { // s escape แล้ว\n  const codes = [];\n  s = s.replace(/`([^`]+)`/g, (_, c) => `\\u0000${codes.push(c) - 1}\\u0000`);\n  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>').replace(/(^|[^*\\w])\\*([^*\\s][^*]*?)\\*(?!\\w)/g, '$1<i>$2</i>')\n    .replace(/~~([^~]+)~~/g, '<s>$1</s>')\n    .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g, '<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>');\n  return s.replace(/\\u0000(\\d+)\\u0000/g, (_, i) => `<code>${codes[i]}</code>`);\n}\nconst cells = l => l.trim().replace(/^\\|/, '').replace(/\\|$/, '').split('|').map(c => c.trim());\nconst isList = l => /^\\s*([-*+]|\\d+[.)])\\s+/.test(l);\nfunction blocks(text) {\n  const L = esc(text).split('\\n'); let out = '', i = 0;\n  while (i < L.length) {\n    const l = L[i]; let m;\n    if (!l.trim()) { i++; continue; }\n    if ((m = l.match(/^(#{1,4})\\s+(.*)/))) { out += `<div class=\"h h${m[1].length}\">${inline(m[2])}</div>`; i++; continue; }\n    if (/^\\s*([-*_])(\\s*\\1){2,}\\s*$/.test(l)) { out += '<hr>'; i++; continue; }\n    if (/^\\s*\\|.*\\|\\s*$/.test(l) && /^\\s*\\|?\\s*:?-{2,}/.test(L[i + 1] || '')) {\n      const head = cells(l); i += 2; const rows = [];\n      while (i < L.length && /^\\s*\\|.*\\|\\s*$/.test(L[i])) rows.push(cells(L[i++]));\n      out += `<div class=\"tw\"><table><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;\n      continue;\n    }\n    if (/^&gt;\\s?/.test(l)) { const q = []; while (i < L.length && /^&gt;\\s?/.test(L[i])) q.push(L[i++].replace(/^&gt;\\s?/, '')); out += `<blockquote>${blocks_(q)}</blockquote>`; continue; }\n    if (isList(l)) {\n      const ol = /^\\s*\\d/.test(l), items = [];\n      while (i < L.length && (isList(L[i]) || (/^\\s{2,}\\S/.test(L[i]) && items.length))) {\n        if (isList(L[i]) && !/^\\s{2,}/.test(L[i]) && /^\\s*\\d/.test(L[i]) !== ol) break; // เปลี่ยนชนิดรายการ\n        const x = L[i++], sub = /^\\s{2,}/.test(x);\n        if (isList(x)) items.push(`<li class=\"${sub ? 'sub' : ''}\">${inline(x.replace(/^\\s*([-*+]|\\d+[.)])\\s+/, ''))}</li>`);\n        else items[items.length - 1] = items.at(-1).replace(/<\\/li>$/, '<br>' + inline(x.trim()) + '</li>');\n      }\n      out += ol ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`; continue;\n    }\n    const p = [];\n    while (i < L.length && L[i].trim() && !/^(#{1,4}\\s|&gt;)/.test(L[i]) && !isList(L[i]) && !/^\\s*\\|.*\\|\\s*$/.test(L[i])) p.push(inline(L[i++]));\n    if (!p.length) p.push(inline(L[i++]));\n    out += `<p>${p.join('<br>')}</p>`;\n  }\n  return out;\n}\nconst blocks_ = lines => blocks(lines.join('\\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&#39;/g, \"'\"));\nfunction md(s) {\n  return String(s).split(/```/).map((part, i) => {\n    if (!(i % 2)) return blocks(part);\n    const nl = part.indexOf('\\n'), lang = nl >= 0 ? part.slice(0, nl).trim() : '';\n    return `<div class=\"code\"><div class=\"code-h\"><span>${esc(lang || 'code')}</span><button class=\"cp-code\">คัดลอก</button></div><pre><code>${esc(nl >= 0 ? part.slice(nl + 1) : part)}</code></pre></div>`;\n  }).join('');\n}\nasync function copy(text, btn) {\n  try { await navigator.clipboard.writeText(text); } catch { return; }\n  const o = btn.textContent; btn.textContent = 'คัดลอกแล้ว ✓'; setTimeout(() => btn.textContent = o, 1500);\n}\n\n// ---------- ส่วนที่ใช้ซ้ำ ----------\nconst nav = () => `<nav class=\"nav\"><a class=\"logo\" href=\"#/\">AstraCode</a><span class=\"sp\"></span>\n  ${me ? `<a class=\"l\" href=\"#/chat\">แชต</a><a class=\"l\" href=\"#/plans\">แพลน</a><a class=\"l\" href=\"#/account\">บัญชี</a>${me.role === 'admin' ? '<a class=\"l\" href=\"#/admin\">หลังบ้าน</a>' : ''}`\n       : `<a class=\"l\" href=\"#/plans\">แพลน</a><a class=\"btn blue sm\" href=\"#/login\">เริ่มใช้ฟรี</a>`}</nav>`;\nconst page = html => { app.innerHTML = `<div class=\"view\">${html}</div>`; };\n\nfunction planTiles(plans, sel) {\n  return `<div class=\"grid\">${plans.map(p => `<div class=\"tile plan ${sel === p.id ? 'sel' : ''} ${p.featured ? 'feat' : ''}\" data-plan=\"${p.id}\">\n    ${p.featured ? '<span class=\"badge\">แนะนำ</span>' : ''}\n    <div style=\"font:600 19px var(--display)\">${esc(p.name)}</div>\n    <div class=\"price\">${p.price > 0 ? '฿' + baht(p.price) : 'ฟรี'}<small>${p.price > 0 ? ' / เดือน' : ''}</small></div>\n    <div class=\"muted\">${esc(p.description)}</div>\n    <ul class=\"feat-list\">${p.models.map(m => `<li>${esc(m.name)} <span class=\"muted\">~${num(m.week)} ข้อความ/สัปดาห์</span></li>`).join('')}</ul></div>`).join('')}</div>\n    <p class=\"muted\" style=\"text-align:center;margin-top:16px\">จำนวนข้อความเป็นค่าประมาณ (ข้อความละ ~2,500 token) ใช้หลายโมเดลได้ในลิมิตเดียวกัน</p>`;\n}\nfunction compareTable(plans) {\n  const names = [...new Set(plans.flatMap(p => p.models.map(m => m.name)))];\n  return `<div class=\"tw\"><table class=\"cmp\"><tr><th></th>${plans.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr>\n    <tr><td>ราคา/เดือน</td>${plans.map(p => `<td>${p.price > 0 ? '฿' + baht(p.price) : 'ฟรี'}</td>`).join('')}</tr>\n    ${names.map(n => `<tr><td>${esc(n)}</td>${plans.map(p => { const m = p.models.find(x => x.name === n); return `<td>${m ? '~' + num(m.week) : '<span class=\"muted\">—</span>'}</td>`; }).join('')}</tr>`).join('')}\n    <tr><td>รีเซ็ตลิมิต</td>${plans.map(() => '<td>4 ชม. + สัปดาห์</td>').join('')}</tr></table></div>\n    <p class=\"muted\" style=\"text-align:center\">ตัวเลขในตาราง = จำนวนข้อความโดยประมาณต่อสัปดาห์</p>`;\n}\nconst FAQ = [\n  ['ลิมิต 4 ชั่วโมงกับลิมิตสัปดาห์ต่างกันยังไง', 'ลิมิต 4 ชั่วโมงกันการใช้รวดเดียวหมด ส่วนลิมิตสัปดาห์คือโควตารวม ทั้งสองแสดงเป็น % ด้านบนหน้าแชต ลิมิตสัปดาห์รีเซ็ตทุกวันจันทร์ 00:00'],\n  ['ทำไมแต่ละโมเดลใช้ลิมิตไม่เท่ากัน', 'โมเดลที่เก่งกว่ามีต้นทุนสูงกว่า จึงกิน % เร็วกว่า DeepSeek ใช้ได้เยอะที่สุด'],\n  ['Instant / Low / High / Max คืออะไร', 'คือระดับความคิดของ AI: Instant ตอบทันทีไม่คิดก่อน ส่วน Low, High และ Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบโจทย์ยากได้ดี แต่ช้ากว่าและใช้ลิมิตมากกว่า'],\n  ['จ่ายเงินยังไง', 'เลือกแพลน สแกน QR PromptPay แล้วอัปโหลดสลิป แอดมินตรวจและเปิดแพลนให้ แพลนใช้ได้ 30 วัน'],\n  ['ต้องลงแอปไหม', 'ไม่ต้อง ใช้บนเว็บได้เลย หรือเพิ่มลงหน้าจอหลักเพื่อใช้เหมือนแอป'],\n];\nconst faqHTML = () => FAQ.map(([q, a]) => `<details class=\"faq\"><summary>${q}</summary><p>${a}</p></details>`).join('');\nconst installHTML = () => `<div class=\"grid\">\n  <div class=\"tile\"><div style=\"font:600 19px var(--display)\">iPhone / iPad</div><div class=\"muted\">เปิดใน Safari → กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → \"เพิ่มไปยังหน้าจอโฮม\"</div></div>\n  <div class=\"tile\"><div style=\"font:600 19px var(--display)\">Android</div><div class=\"muted\">เปิดใน Chrome → กด ⋮ มุมขวาบน → \"ติดตั้งแอป\" หรือ \"เพิ่มลงในหน้าจอหลัก\"</div>\n  ${installEvt ? '<button class=\"btn blue sm\" id=\"install\" style=\"margin-top:8px\">ติดตั้งเลย</button>' : ''}</div></div>`;\nfunction bindInstall() {\n  const b = $('#install'); if (!b) return;\n  b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.remove(); };\n}\n\n// ---------- หน้าแรก ----------\nasync function landing() {\n  const plans = await api('/plans').catch(() => []);\n  page(nav() + `<section class=\"hero\"><div class=\"name\">AstraCode</div>\n    <h1>AI ทุกตัว<br>ในมือถือเครื่องเดียว</h1>\n    <p>ChatGPT, Claude, Gemini, DeepSeek และ Kimi ในเว็บเดียว เปิดบนมือถือได้ทันที ไม่ต้องลงแอป</p>\n    <div class=\"row\" style=\"justify-content:center\"><a class=\"btn blue\" href=\"#/login\">เริ่มใช้ฟรี</a><a class=\"btn out\" href=\"#plans\">ดูแพลน</a></div></section>\n    <div class=\"wrap\"><div class=\"band\"><h2>ออกแบบมาเพื่อมือถือ</h2><div class=\"grid\">\n      <div class=\"tile\"><div class=\"stat\">5+</div><div class=\"muted\">ผู้ให้บริการ AI ชั้นนำ สลับได้ในแชตเดียว</div></div>\n      <div class=\"tile\"><div class=\"stat\">PWA</div><div class=\"muted\">เพิ่มลงหน้าจอหลัก ใช้เหมือนแอปจริง</div></div>\n      <div class=\"tile\"><div class=\"stat\">%</div><div class=\"muted\">เห็นลิมิตชัดเจน รีเซ็ตทุก 4 ชั่วโมงและทุกสัปดาห์</div></div>\n      <div class=\"tile\"><div class=\"stat\">฿</div><div class=\"muted\">จ่ายผ่าน PromptPay เริ่มต้นหลักสิบบาท</div></div>\n    </div></div>\n    <div class=\"band\" id=\"plans\"><h2>แพลน</h2>${planTiles(plans)}</div>\n    <div class=\"band\"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>\n    <div class=\"band\"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div>\n    <div class=\"band\"><h2>คำถามที่พบบ่อย</h2>${faqHTML()}</div>\n    ${footer()}</div>`);\n  $('a[href=\"#plans\"]').onclick = e => { e.preventDefault(); $('#plans').scrollIntoView({ behavior: 'smooth' }); };\n  bindInstall();\n}\n\n// ---------- เข้าสู่ระบบ ----------\nfunction auth() {\n  let mode = 'login';\n  const draw = () => {\n    page(nav() + `<div class=\"auth wrap\"><h1>${mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</h1>\n      <div class=\"tabs\"><button class=\"${mode === 'login' ? 'on' : ''}\" data-m=\"login\">เข้าสู่ระบบ</button><button class=\"${mode === 'register' ? 'on' : ''}\" data-m=\"register\">สมัคร</button></div>\n      <form class=\"card\" id=\"f\"><label>อีเมล</label><input name=\"email\" type=\"email\" autocomplete=\"email\" required>\n      <label>รหัสผ่าน</label><input name=\"password\" type=\"password\" minlength=\"8\" autocomplete=\"${mode === 'login' ? 'current-password' : 'new-password'}\" required>\n      <div class=\"err\" id=\"e\"></div><button class=\"btn blue\" style=\"width:100%\">${mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</button>\n      ${mode === 'login' ? '<p class=\"muted\" style=\"text-align:center;margin:12px 0 0\">ลืมรหัสผ่าน? ติดต่อแอดมินเพื่อตั้งรหัสใหม่</p>' : ''}\n      <p class=\"muted\" style=\"text-align:center;margin:12px 0 0\">การ${mode === 'login' ? 'ใช้งาน' : 'สมัคร'}ถือว่ายอมรับ<a href=\"#/terms\">เงื่อนไขและนโยบายความเป็นส่วนตัว</a></p></form></div>`);\n    app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });\n    $('#f').onsubmit = async e => {\n      e.preventDefault(); e.submitter.disabled = true;\n      try { await api('/' + mode, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); await loadMe(); location.hash = '#/chat'; }\n      catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; }\n    };\n  };\n  draw();\n}\nconst loadMe = async () => { me = await api('/me').catch(() => null); };\n\n// ---------- แชต ----------\nfunction meters(u) {\n  const m = (label, p, reset) => `<div class=\"meter ${p >= 100 ? 'full' : p >= 80 ? 'hi' : ''}\" title=\"รีเซ็ต ${when(reset)}\">${label} ${p}%<div class=\"track\"><div class=\"fill\" style=\"width:${p}%\"></div></div></div>`;\n  return m('4 ชม.', u.pct4h, u.reset4h) + m('สัปดาห์', u.pctWeek, u.resetWeek);\n}\nfunction notice(u) {\n  if (u.pct4h >= 100 || u.pctWeek >= 100)\n    return `<div class=\"notice full\">ลิมิตเต็ม · รีเซ็ต ${when(u.pct4h >= 100 ? u.reset4h : u.resetWeek)} <a class=\"btn blue sm\" href=\"#/plans\">อัปเกรด</a></div>`;\n  const p = Math.max(u.pct4h, u.pctWeek);\n  return p >= 80 ? `<div class=\"notice hi\">ใช้ลิมิตไปแล้ว ${p}% · <a href=\"#/plans\">อัปเกรดเพื่อใช้ได้มากขึ้น</a></div>` : '';\n}\nfunction setUsage(u) { me.usage = u; $('#meters').innerHTML = meters(u); $('#notice').innerHTML = notice(u); }\nconst curModel = () => me.models.find(m => m.id === +$('#model')?.value) || me.models[0];\n\nasync function chatView(id) {\n  if (!me) return location.hash = '#/login';\n  chat = { ...chat, id: id ? +id : null, msgs: id ? await api('/chats/' + id).catch(() => []) : [], busy: false, images: [] };\n  const saved = localStorage.getItem('model');\n  app.innerHTML = `<div class=\"chat view\"><aside class=\"side\" id=\"side\">\n      <a class=\"logo\" href=\"#/\" style=\"padding:8px 12px\">AstraCode</a>\n      <a class=\"btn out sm\" href=\"#/chat\">+ แชตใหม่</a>\n      <input id=\"search\" placeholder=\"ค้นหาแชต\" aria-label=\"ค้นหาแชต\" style=\"min-height:36px;font-size:14px\">\n      <div class=\"list\" id=\"list\"></div>\n      <a class=\"l muted\" href=\"#/plans\" style=\"padding:8px 12px\">${esc(me.plan.name)} · อัปเกรด</a>\n      <a class=\"l muted\" href=\"#/account\" style=\"padding:8px 12px\">${esc(me.email)}</a></aside>\n    <div class=\"main\"><div class=\"bar\"><button class=\"menu-btn\" id=\"menu\" aria-label=\"เมนู\">☰</button>\n      <select id=\"model\" aria-label=\"โมเดล\">${me.models.map(m => `<option value=\"${m.id}\" ${String(m.id) === saved ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>\n      <select id=\"effort\" aria-label=\"ระดับความคิด\" title=\"Low/High/Max ให้ AI คิดก่อนตอบ ยิ่งสูงยิ่งตอบดีแต่ช้าและใช้ลิมิตมากกว่า\">${EFFORTS.map(([v, l]) => `<option value=\"${v}\" ${v === (localStorage.getItem('effort') || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>\n      <div class=\"meters\" id=\"meters\">${meters(me.usage)}</div></div>\n      <div class=\"msgs\" id=\"msgs\"></div>\n      <div class=\"compose\"><div id=\"notice\">${notice(me.usage)}</div><div class=\"err\" id=\"e\"></div><div class=\"thumbs\" id=\"thumbs\"></div>\n        <form id=\"f\"><button type=\"button\" class=\"icon-btn\" id=\"attach\" aria-label=\"แนบรูป\">＋</button><input type=\"file\" id=\"file\" accept=\"image/*\" multiple hidden>\n        <textarea id=\"t\" rows=\"1\" placeholder=\"พิมพ์ข้อความ...\" aria-label=\"ข้อความ\"></textarea><button class=\"btn blue send\" id=\"go\" aria-label=\"ส่ง\">↑</button></form></div></div></div>`;\n  const side = $('#side');\n  $('#menu').onclick = () => { side.classList.add('open'); const s = document.createElement('div'); s.className = 'shade'; s.onclick = () => { side.classList.remove('open'); s.remove(); }; document.body.append(s); };\n  $('#model').onchange = e => { localStorage.setItem('model', e.target.value); modelUI(); };\n  $('#effort').onchange = e => localStorage.setItem('effort', e.target.value);\n  $('#search').oninput = drawSide;\n  const t = $('#t');\n  t.oninput = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };\n  t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); $('#f').requestSubmit(); } };\n  $('#f').onsubmit = e => { e.preventDefault(); chat.busy ? chat.ctrl?.abort() : send(); };\n  $('#attach').onclick = () => $('#file').click();\n  $('#file').onchange = async e => { await addImages([...e.target.files]); e.target.value = ''; };\n  $('#msgs').onclick = e => {\n    const b = e.target.closest('button'); if (!b) return;\n    if (b.classList.contains('cp-code')) copy(b.closest('.code').querySelector('code').textContent, b);\n    if (b.dataset.copy) copy(chat.msgs[+b.dataset.copy].content, b);\n    if (b.dataset.regen != null) send({ regenerate: true });\n    if (b.dataset.s != null) { t.value = SUGGEST[+b.dataset.s]; t.focus(); t.oninput(); }\n  };\n  modelUI(); renderAll(); loadSide();\n}\nfunction modelUI() {\n  const m = curModel();\n  $('#effort').hidden = !m || m.effort === 'none';\n  $('#attach').hidden = !m?.vision;\n  if (!m?.vision && chat.images.length) { chat.images = []; drawThumbs(); }\n}\nasync function loadSide() { chat.chats = await api('/chats').catch(() => []); drawSide(); }\nfunction drawSide() {\n  const q = ($('#search')?.value || '').toLowerCase(), list = $('#list'); if (!list) return;\n  list.innerHTML = chat.chats.filter(c => c.title.toLowerCase().includes(q)).map(c => `<div class=\"item ${c.id === chat.id ? 'on' : ''}\"><a href=\"#/chat/${c.id}\">${esc(c.title)}</a>\n    <button data-ren=\"${c.id}\" aria-label=\"เปลี่ยนชื่อ\">✎</button><button data-del=\"${c.id}\" aria-label=\"ลบ\">✕</button></div>`).join('') || '<p class=\"muted\" style=\"padding:8px 12px\">ยังไม่มีแชต</p>';\n  list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {\n    if (!confirm('ลบแชตนี้?')) return;\n    await api('/chats/' + b.dataset.del, { method: 'DELETE' });\n    if (chat.id === +b.dataset.del) location.hash = '#/chat'; else loadSide();\n  });\n  list.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {\n    const c = chat.chats.find(x => x.id === +b.dataset.ren), title = prompt('ชื่อแชต', c.title);\n    if (title?.trim()) { await api('/chats/' + c.id, { method: 'PUT', body: { title } }); loadSide(); }\n  });\n}\n\n// รูปภาพ: ย่อเป็น JPEG ไม่เกิน 1280px ก่อนส่ง\nasync function addImages(files) {\n  for (const f of files.slice(0, 4 - chat.images.length)) {\n    try {\n      const bmp = await createImageBitmap(f), s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));\n      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);\n      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);\n      chat.images.push(c.toDataURL('image/jpeg', 0.85));\n    } catch { alert('อ่านรูปนี้ไม่ได้ ลองใช้ JPG หรือ PNG'); }\n  }\n  drawThumbs();\n}\nfunction drawThumbs() {\n  const box = $('#thumbs'); if (!box) return;\n  box.innerHTML = chat.images.map((d, i) => `<div class=\"thumb\"><img src=\"${d}\" alt=\"\"><button data-rm=\"${i}\" aria-label=\"ลบรูป\">✕</button></div>`).join('');\n  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { chat.images.splice(+b.dataset.rm, 1); drawThumbs(); });\n}\n\nfunction msgHTML(m, i, isNew) {\n  if (m.role === 'user') return `<div class=\"msg user ${isNew ? 'new' : ''}\"><div class=\"b\">${m.imgs ? `<div class=\"mimgs\">${m.imgs.map(d => `<img src=\"${d}\" alt=\"\">`).join('')}</div>` : ''}${esc(m.content)}</div></div>`;\n  const last = i === chat.msgs.length - 1;\n  return `<div class=\"msg ai ${isNew ? 'new' : ''}\"><div class=\"b\">${m.content ? md(m.content) : DOTS}</div>\n    ${m.streaming ? '' : `<div class=\"acts\">${m.model ? `<span class=\"muted\">${esc(m.model)}</span>` : ''}<button data-copy=\"${i}\">คัดลอก</button>${last && !chat.busy ? '<button data-regen>ตอบใหม่</button>' : ''}</div>`}</div>`;\n}\nconst nearBottom = box => box.scrollHeight - box.scrollTop - box.clientHeight < 120;\nfunction renderAll() {\n  const box = $('#msgs'); if (!box) return;\n  box.innerHTML = chat.msgs.length ? chat.msgs.map((m, i) => msgHTML(m, i)).join('')\n    : `<div class=\"empty\"><div class=\"stat\">วันนี้ให้ช่วยอะไรดี</div><div>เลือกโมเดลด้านบน แล้วพิมพ์ได้เลย</div>\n       <div class=\"chips\">${['อธิบายให้เข้าใจง่าย', 'ช่วยเขียนโค้ด', 'สรุปข้อความ', 'แปลภาษา'].map((s, i) => `<button data-s=\"${i}\">${s}</button>`).join('')}</div></div>`;\n  box.scrollTop = box.scrollHeight;\n}\nfunction appendMsg(m) {\n  const box = $('#msgs'); if (!chat.msgs.length || chat.msgs.length === 1) box.innerHTML = '';\n  box.insertAdjacentHTML('beforeend', msgHTML(m, chat.msgs.length - 1, true));\n  box.scrollTop = box.scrollHeight;\n}\nfunction updateLast() {\n  const box = $('#msgs'), stick = nearBottom(box);\n  box.lastElementChild.querySelector('.b').innerHTML = md(chat.msgs.at(-1).content);\n  if (stick) box.scrollTop = box.scrollHeight;\n}\nfunction showErr(msg, retry) {\n  $('#e').innerHTML = esc(msg) + (retry ? ' <button class=\"btn out sm\" id=\"retry\">ลองใหม่</button>' : '');\n  $('#retry')?.addEventListener('click', () => send({ regenerate: true }));\n}\nfunction setBusy(b) { chat.busy = b; const g = $('#go'); g.textContent = b ? '■' : '↑'; g.setAttribute('aria-label', b ? 'หยุด' : 'ส่ง'); g.classList.toggle('stop', b); }\n\nasync function send({ regenerate = false } = {}) {\n  if (chat.busy) return;\n  const t = $('#t'), text = regenerate ? '' : t.value.trim(), imgs = regenerate ? [] : chat.images, m = curModel();\n  if (!regenerate && !text && !imgs.length) return;\n  $('#e').textContent = '';\n  if (regenerate) { if (chat.msgs.at(-1)?.role === 'assistant') chat.msgs.pop(); }\n  else {\n    t.value = ''; t.style.height = 'auto'; chat.images = []; drawThumbs();\n    chat.msgs.push({ role: 'user', content: text || 'อธิบายรูปนี้', imgs: imgs.length ? imgs : null });\n    appendMsg(chat.msgs.at(-1));\n  }\n  const ai = { role: 'assistant', content: '', model: m.name, streaming: true };\n  chat.msgs.push(ai);\n  if (regenerate) renderAll(); else appendMsg(ai);\n  setBusy(true); chat.ctrl = new AbortController();\n  let started = false, streamErr = null, raf = 0;\n  try {\n    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: chat.ctrl.signal,\n      body: JSON.stringify({ chat_id: chat.id, model_id: m.id, text, images: imgs, regenerate, effort: m.effort !== 'none' ? $('#effort').value || null : null }) });\n    if (!r.ok) {\n      const d = await r.json();\n      if (r.status === 429) setUsage(d);\n      throw new Error(r.status === 429 ? 'ลิมิตเต็มแล้ว' : d.error);\n    }\n    started = true;\n    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';\n    for (;;) {\n      const { done, value } = await rd.read(); if (done) break;\n      buf += dec.decode(value, { stream: true });\n      let i; while ((i = buf.indexOf('\\n\\n')) >= 0) {\n        const line = buf.slice(0, i); buf = buf.slice(i + 2);\n        if (!line.startsWith('data: ')) continue;\n        const d = JSON.parse(line.slice(6));\n        if (d.chat_id && !chat.id) { chat.id = d.chat_id; history.replaceState(null, '', '#/chat/' + d.chat_id); }\n        if (d.model) ai.model = d.model;\n        if (d.t) { ai.content += d.t; if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateLast(); }); }\n        if (d.error) streamErr = d.error;\n        if (d.done) setUsage(d);\n      }\n    }\n  } catch (x) {\n    if (x.name === 'AbortError') setTimeout(() => api('/me').then(d => { me = d; setUsage(d.usage); }).catch(() => {}), 1500);\n    else if (!started && !regenerate) { // เซิร์ฟเวอร์ยังไม่บันทึก: คืนข้อความให้แก้แล้วส่งใหม่\n      chat.msgs.splice(-2, 2); t.value = text; chat.images = imgs; drawThumbs(); setBusy(false); renderAll(); showErr(x.message); return;\n    } else streamErr = x.message;\n  }\n  cancelAnimationFrame(raf);\n  ai.streaming = false;\n  if (!ai.content) chat.msgs.pop();\n  setBusy(false); renderAll();\n  if (streamErr) showErr(streamErr, chat.msgs.at(-1)?.role === 'user');\n  loadSide();\n}\n\n// ---------- แพลน + ชำระเงิน ----------\nasync function plansPage() {\n  const plans = await api('/plans');\n  if (!me) { page(nav() + `<div class=\"wrap\"><section class=\"hero\" style=\"padding-bottom:24px\"><h1>เลือกแพลน</h1></section>${planTiles(plans)}<p style=\"text-align:center;margin:28px\"><a class=\"btn blue\" href=\"#/login\">สมัครเพื่อเริ่มใช้</a></p><div class=\"band\"><h2>เทียบแพลน</h2>${compareTable(plans)}</div></div>`); return; }\n  const pays = await api('/pay');\n  let sel = null;\n  const draw = () => {\n    const p = plans.find(x => x.id === sel);\n    page(nav() + `<div class=\"wrap\"><section class=\"hero\" style=\"padding:48px 0 24px\"><h1>เลือกแพลน</h1><p>แพลนปัจจุบัน: ${esc(me.plan.name)}${me.plan.expires ? ' · หมดอายุ ' + when(me.plan.expires) : ''}</p></section>\n      ${planTiles(plans.filter(x => x.price > 0), sel)}\n      ${p ? `<div class=\"card pay\" id=\"pay\" style=\"text-align:center\"><div style=\"font:600 24px var(--display)\">${esc(p.name)} · ฿${baht(p.price)}</div>\n        ${me.promptpay_id ? `<p class=\"muted\">สแกนจ่ายผ่าน PromptPay แล้วอัปโหลดสลิป</p><img class=\"qr\" alt=\"QR PromptPay\" src=\"https://promptpay.io/${encodeURIComponent(me.promptpay_id)}/${p.price}.png\">` : '<p class=\"warn\">ยังไม่ได้ตั้งค่า PromptPay</p>'}\n        <form id=\"f\" style=\"max-width:400px;margin:16px auto 0\"><label>รูปสลิป</label><input type=\"file\" name=\"slip\" accept=\"image/*\" required style=\"border-radius:20px\">\n        <div class=\"err\" id=\"e\"></div><button class=\"btn blue\" style=\"width:100%\">ส่งสลิป</button><p class=\"muted\" style=\"margin:12px 0 0\">การชำระเงินถือว่ายอมรับ<a href=\"#/terms\">เงื่อนไขการคืนเงิน</a></p></form></div>` : '<p class=\"muted\" style=\"text-align:center\">แตะแพลนเพื่อชำระเงิน</p>'}\n      <div class=\"band\"><h2>เทียบแพลน</h2>${compareTable(plans)}</div>\n      ${pays.length ? `<div class=\"card\"><div style=\"font:600 19px var(--display)\">ประวัติการชำระ</div><div class=\"tw\"><table class=\"tbl\"><tr><th>วันที่</th><th>แพลน</th><th>ยอด</th><th>สถานะ</th></tr>\n        ${pays.map(x => `<tr><td>${when(x.created_at)}</td><td>${esc(x.plan_name)}</td><td>฿${baht(x.amount)}</td><td>${{ pending: '<span class=\"warn\">รออนุมัติ</span>', approved: '<span class=\"ok\">อนุมัติแล้ว</span>', rejected: '<span class=\"bad\">ไม่อนุมัติ</span>' }[x.status]}</td></tr>`).join('')}</table></div></div>` : ''}</div>`);\n    app.querySelectorAll('[data-plan]').forEach(t => t.onclick = () => { sel = +t.dataset.plan; draw(); $('#pay')?.scrollIntoView({ behavior: 'smooth' }); });\n    $('#f')?.addEventListener('submit', async e => {\n      e.preventDefault(); const fd = new FormData(e.target); fd.append('plan_id', sel);\n      e.submitter.disabled = true;\n      try { await api('/pay', { method: 'POST', body: fd }); alert('ส่งสลิปแล้ว รอแอดมินอนุมัติ'); route(); }\n      catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; }\n    });\n  };\n  draw();\n}\n\n// ---------- บัญชี ----------\nasync function account() {\n  if (!me) return location.hash = '#/login';\n  await loadMe();\n  const u = me.usage;\n  page(nav() + `<div class=\"wrap\" style=\"max-width:600px\"><section class=\"hero\" style=\"padding:48px 0 16px\"><h1>บัญชี</h1><p>${esc(me.email)}</p></section>\n    <div class=\"card\"><div class=\"grid\">\n      <div class=\"tile\"><div class=\"muted\">แพลน</div><div class=\"stat\">${esc(me.plan.name)}</div><div class=\"muted\">${me.plan.expires ? 'หมดอายุ ' + when(me.plan.expires) : 'ไม่มีวันหมดอายุ'}</div></div>\n      <div class=\"tile\"><div class=\"muted\">ลิมิต 4 ชม.</div><div class=\"stat\">${u.pct4h}%</div><div class=\"muted\">รีเซ็ต ${u.reset4h ? when(u.reset4h) : '-'}</div></div>\n      <div class=\"tile\"><div class=\"muted\">ลิมิตสัปดาห์</div><div class=\"stat\">${u.pctWeek}%</div><div class=\"muted\">รีเซ็ต ${when(u.resetWeek)}</div></div>\n    </div></div>\n    <div class=\"row\" style=\"justify-content:center\"><a class=\"btn blue\" href=\"#/plans\">อัปเกรด</a><button class=\"btn out\" id=\"out\">ออกจากระบบ</button></div>\n    <form class=\"card\" id=\"pw\" style=\"margin-top:24px\"><div style=\"font:600 19px var(--display)\">เปลี่ยนรหัสผ่าน</div>\n      <label>รหัสผ่านเดิม</label><input name=\"old\" type=\"password\" autocomplete=\"current-password\" required>\n      <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input name=\"new\" type=\"password\" minlength=\"8\" autocomplete=\"new-password\" required>\n      <div class=\"err\" id=\"pe\"></div><button class=\"btn blue\">เปลี่ยนรหัสผ่าน</button>\n      <p class=\"muted\" style=\"margin:12px 0 0\">เปลี่ยนแล้วเครื่องอื่นที่ล็อกอินอยู่จะถูกออกจากระบบ</p></form>\n    <p class=\"muted\" style=\"text-align:center;margin-top:24px\"><a href=\"#/terms\">เงื่อนไขและความเป็นส่วนตัว</a></p>\n    <div class=\"band\" style=\"margin-top:48px\"><h2>ติดตั้งลงมือถือ</h2>${installHTML()}</div></div>`);\n  $('#out').onclick = async () => { await api('/logout', { method: 'POST' }); me = null; location.hash = '#/'; };\n  $('#pw').onsubmit = async e => {\n    e.preventDefault(); e.submitter.disabled = true;\n    try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); $('#pe').innerHTML = '<span class=\"ok\">เปลี่ยนรหัสผ่านแล้ว</span>'; }\n    catch (x) { $('#pe').textContent = x.message; }\n    e.submitter.disabled = false;\n  };\n  bindInstall();\n}\n\n// ---------- หลังบ้าน ----------\nconst FIELDS = {\n  plans: [['name', 'ชื่อ'], ['price', 'ราคา (บาท/เดือน)', 'n'], ['limit_4h', 'ลิมิต 4 ชม. (units)', 'n'], ['limit_week', 'ลิมิตสัปดาห์ (units)', 'n'], ['description', 'คำอธิบาย'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],\n  models: [['name', 'ชื่อที่แสดง'], ['provider', 'รูปแบบ API', ['openai', 'anthropic']], ['api_model', 'รหัสโมเดล'], ['base_url', 'Base URL'], ['key_name', 'ชื่อ secret ของ key'], ['multiplier', 'ตัวคูณ', 'n'],\n    ['cost_in', 'ทุน input (บาท/1M)', 'n'], ['cost_out', 'ทุน output', 'n'], ['cost_cache', 'ทุน cache read', 'n'], ['cost_cache_write', 'ทุน cache write', 'n'],\n    ['effort', 'รองรับ effort', ['none', 'openai', 'anthropic', 'deepseek']], ['vision', 'อ่านรูปได้', 'b'], ['sort', 'ลำดับ', 'n'], ['active', 'เปิดใช้', 'b']],\n};\nconst STATUS = { pending: '<span class=\"warn\">รออนุมัติ</span>', approved: '<span class=\"ok\">อนุมัติแล้ว</span>', rejected: '<span class=\"bad\">ปฏิเสธ</span>' };\nasync function adminView(tab = 'stats') {\n  if (me?.role !== 'admin') return location.hash = '#/';\n  const tabs = { stats: 'สรุป', payments: 'ชำระเงิน', users: 'ผู้ใช้', plans: 'แพลน', models: 'โมเดล', settings: 'ตั้งค่า' };\n  page(nav() + `<div class=\"wrap\"><div class=\"tabs\" style=\"margin-top:24px\">${Object.entries(tabs).map(([k, v]) => `<a class=\"${k === tab ? 'on' : ''}\" href=\"#/admin/${k}\">${v}</a>`).join('')}</div><div id=\"ad\"></div></div>`);\n  const box = $('#ad'), reload = () => adminView(tab);\n\n  if (tab === 'stats') {\n    const s = await api('/admin/stats');\n    box.innerHTML = `<div class=\"card\"><div class=\"muted\">เดือนนี้</div><div class=\"grid\" style=\"margin-top:12px\">\n      <div class=\"tile\"><div class=\"muted\">รายได้</div><div class=\"stat\">฿${baht(s.revenue)}</div></div>\n      <div class=\"tile\"><div class=\"muted\">ต้นทุน API</div><div class=\"stat\">฿${baht(s.cost)}</div></div>\n      <div class=\"tile\"><div class=\"muted\">กำไรขั้นต้น</div><div class=\"stat ${s.profit >= 0 ? 'ok' : ''}\">฿${baht(s.profit)}</div></div>\n      <div class=\"tile\"><div class=\"muted\">ผู้ใช้ / จ่ายเงิน</div><div class=\"stat\">${s.users.total} / ${s.users.paid || 0}</div><div class=\"muted\">${s.pending} สลิปรออนุมัติ</div></div></div></div>\n      <div class=\"card tw\"><table class=\"tbl\"><tr><th>โมเดล</th><th>ข้อความ</th><th>Token in</th><th>Token out</th><th>ต้นทุน</th></tr>\n      ${s.models.map(m => `<tr><td>${esc(m.name)}</td><td>${m.msgs}</td><td>${num(m.tin)}</td><td>${num(m.tout)}</td><td>฿${baht(m.cost)}</td></tr>`).join('') || '<tr><td colspan=5 class=\"muted\">ยังไม่มีการใช้งาน</td></tr>'}</table></div>`;\n  }\n  if (tab === 'payments') {\n    const ps = await api('/admin/payments');\n    box.innerHTML = ps.map(p => `<div class=\"card\"><div class=\"row\"><b>#${p.id} ${esc(p.email)}</b><span style=\"flex:1\"></span>${STATUS[p.status]}</div>\n      <div class=\"muted\">${when(p.created_at)} · ${esc(p.plan_name)} · ต้องจ่าย ฿${baht(p.amount)}</div>\n      <div class=\"muted\">API เช็กสลิป: ${p.slip_amount == null ? 'ไม่มีผล' : (p.slip_amount === p.amount ? `<span class=\"ok\">ยอดตรง ฿${baht(p.slip_amount)}</span>` : `<span class=\"bad\">ยอดไม่ตรง ฿${baht(p.slip_amount)}</span>`)}</div>\n      ${p.slip_check ? `<details><summary class=\"muted\">ผลดิบจาก API</summary><pre style=\"white-space:pre-wrap;font-size:12px\">${esc(p.slip_check)}</pre></details>` : ''}\n      <div class=\"row\" style=\"margin-top:12px\"><button class=\"btn out sm\" data-slip=\"${p.id}\">ดูสลิป</button>\n      ${p.status === 'pending' ? `<button class=\"btn blue sm\" data-act=\"approve\" data-id=\"${p.id}\">อนุมัติ</button><button class=\"btn red sm\" data-act=\"reject\" data-id=\"${p.id}\">ปฏิเสธ</button>` : ''}</div>\n      <div data-img=\"${p.id}\"></div></div>`).join('') || '<p class=\"muted\" style=\"text-align:center\">ยังไม่มีคำขอ</p>';\n    box.querySelectorAll('[data-slip]').forEach(b => b.onclick = () => { box.querySelector(`[data-img=\"${b.dataset.slip}\"]`).innerHTML = `<img class=\"slipimg\" style=\"margin-top:12px\" src=\"/api/admin/slip/${b.dataset.slip}\" alt=\"สลิป\">`; });\n    box.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {\n      if (!confirm(b.dataset.act === 'approve' ? 'อนุมัติและเปิดแพลนให้ผู้ใช้?' : 'ปฏิเสธคำขอนี้?')) return;\n      await api(`/admin/payments/${b.dataset.id}/${b.dataset.act}`, { method: 'POST' }); reload();\n    });\n  }\n  if (tab === 'users') {\n    const plans = await api('/admin/plans');\n    box.innerHTML = `<div class=\"card\"><input id=\"q\" placeholder=\"ค้นหาอีเมล\"><div id=\"ul\" class=\"tw\" style=\"margin-top:12px\"></div></div>`;\n    const load = async () => {\n      const us = await api('/admin/users?q=' + encodeURIComponent($('#q').value));\n      $('#ul').innerHTML = `<table class=\"tbl\"><tr><th>อีเมล</th><th>แพลน</th><th>หมดอายุ</th><th></th></tr>${us.map(u => `<tr><td>${esc(u.email)}${u.role === 'admin' ? ' <span class=\"muted\">(admin)</span>' : ''}${u.banned ? ' <span class=\"bad\">แบน</span>' : ''}</td>\n        <td><select data-plan=\"${u.id}\" style=\"min-height:32px;padding:2px 12px;font-size:13px\"><option value=\"\">ฟรี</option>${plans.filter(p => p.price > 0).map(p => `<option value=\"${p.id}\" ${p.id === u.plan_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>\n        <td>${u.plan_id ? when(u.plan_expires) : '-'}</td>\n        <td class=\"row\"><button class=\"btn out sm\" data-reset=\"${u.id}\">รีเซ็ตลิมิต</button><button class=\"btn out sm\" data-pw=\"${u.id}\">ตั้งรหัสใหม่</button><button class=\"btn red sm\" data-ban=\"${u.id}\" data-b=\"${u.banned ? 0 : 1}\">${u.banned ? 'ปลดแบน' : 'แบน'}</button></td></tr>`).join('')}</table>`;\n      const put = (id, body) => api('/admin/users/' + id, { method: 'PUT', body }).then(load);\n      $('#ul').querySelectorAll('[data-plan]').forEach(s => s.onchange = () => put(s.dataset.plan, { plan_id: +s.value || null, days: 30 }));\n      $('#ul').querySelectorAll('[data-reset]').forEach(b => b.onclick = () => put(b.dataset.reset, { reset_usage: true }));\n      $('#ul').querySelectorAll('[data-pw]').forEach(b => b.onclick = async () => {\n        const pw = prompt('รหัสผ่านใหม่ (อย่างน้อย 8 ตัว) ผู้ใช้จะถูกออกจากระบบทุกเครื่อง');\n        if (pw) try { await put(b.dataset.pw, { password: pw }); alert('ตั้งรหัสใหม่แล้ว ส่งรหัสนี้ให้ผู้ใช้'); } catch (x) { alert(x.message); }\n      });\n      $('#ul').querySelectorAll('[data-ban]').forEach(b => b.onclick = () => confirm('ยืนยัน?') && put(b.dataset.ban, { banned: +b.dataset.b }));\n    };\n    let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 300); }; load();\n  }\n  if (tab === 'plans' || tab === 'models') {\n    const rows = await api('/admin/' + tab), models = tab === 'plans' ? await api('/admin/models') : [];\n    const form = (r = { active: 1, model_ids: [] }) => `<form class=\"card\" data-id=\"${r.id || ''}\"><div style=\"font:600 19px var(--display)\">${r.id ? esc(r.name) : '+ เพิ่ม' + (tab === 'plans' ? 'แพลน' : 'โมเดล')}\n        ${tab === 'models' && r.id ? (r.has_key ? ' <span class=\"ok muted\">key พร้อม</span>' : ' <span class=\"bad muted\">ไม่พบ key</span>') : ''}</div>\n      <div class=\"form2\">${FIELDS[tab].map(([k, l, t]) => `<div><label>${l}</label>${t === 'b' ? `<input type=\"checkbox\" name=\"${k}\" ${r[k] ? 'checked' : ''}>`\n        : Array.isArray(t) ? `<select name=\"${k}\">${t.map(o => `<option ${r[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`\n        : `<input name=\"${k}\" ${t === 'n' ? 'type=\"number\" step=\"any\"' : ''} value=\"${esc(r[k] ?? '')}\" required>`}</div>`).join('')}</div>\n      ${tab === 'plans' ? `<label>โมเดลที่ใช้ได้</label><div class=\"row\">${models.map(m => `<label style=\"margin:0 12px 0 0;color:var(--porcelain)\"><input type=\"checkbox\" name=\"m\" value=\"${m.id}\" ${r.model_ids?.includes(m.id) ? 'checked' : ''}> ${esc(m.name)} ×${m.multiplier}</label>`).join('')}</div>` : ''}\n      <div class=\"row\" style=\"margin-top:16px\"><button class=\"btn blue sm\">บันทึก</button>${r.id ? `<button type=\"button\" class=\"btn red sm\" data-del=\"${r.id}\">ลบ</button>` : ''}</div></form>`;\n    box.innerHTML = (tab === 'plans'\n      ? `<p class=\"muted\">1 unit = 1 token ของโมเดลตัวคูณ ×1 (cache read นับ 1/10) · ต้นทุนเต็มลิมิต/สัปดาห์ของ DeepSeek ≈ ลิมิต ÷ 1,000,000 × 1.2 บาท</p>`\n      : `<p class=\"muted\">key ใส่ที่ Worker → Settings → Variables and Secrets (Type: Secret) · Claude ใช้รูปแบบ anthropic ตัวอื่นใช้ openai · effort: openai = reasoning_effort, anthropic = adaptive thinking, deepseek = thinking + reasoning_effort</p>`)\n      + rows.map(form).join('') + form();\n    box.querySelectorAll('form').forEach(f => f.onsubmit = async e => {\n      e.preventDefault(); const fd = new FormData(f), body = {};\n      FIELDS[tab].forEach(([k, , t]) => body[k] = t === 'b' ? (fd.get(k) ? 1 : 0) : t === 'n' ? +fd.get(k) : fd.get(k));\n      if (tab === 'plans') body.model_ids = fd.getAll('m').map(Number);\n      await api(`/admin/${tab}${f.dataset.id ? '/' + f.dataset.id : ''}`, { method: f.dataset.id ? 'PUT' : 'POST', body }); reload();\n    });\n    box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('ลบถาวร?')) { await api(`/admin/${tab}/${b.dataset.del}`, { method: 'DELETE' }); reload(); } });\n  }\n  if (tab === 'settings') {\n    const [s, plans] = await Promise.all([api('/admin/settings'), api('/admin/plans')]);\n    box.innerHTML = `<form class=\"card\" id=\"f\" style=\"max-width:600px;margin:16px auto\">\n      <label>PromptPay (เบอร์โทรหรือเลขบัตรประชาชน)</label><input name=\"promptpay_id\" value=\"${esc(s.promptpay_id)}\">\n      <label>แพลนที่ติดป้าย \"แนะนำ\"</label><select name=\"featured_plan\"><option value=\"\">ไม่มี</option>${plans.map(p => `<option value=\"${p.id}\" ${String(p.id) === s.featured_plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>\n      <label>URL API เช็กสลิป (byshop)</label><input name=\"slip_api_url\" value=\"${esc(s.slip_api_url)}\" placeholder=\"https://...\">\n      <label>ตำแหน่งยอดเงินในผลลัพธ์ JSON (เช่น data.amount)</label><input name=\"slip_amount_field\" value=\"${esc(s.slip_amount_field)}\">\n      <p class=\"muted\">API key ของเช็กสลิป: ${s.slip_key_set ? '<span class=\"ok\">ตั้งแล้ว</span>' : '<span class=\"warn\">ยังไม่ตั้ง</span>'} · ตั้งเป็น Secret ชื่อ <code>SLIP_API_KEY</code></p>\n      <button class=\"btn blue\">บันทึก</button></form>`;\n    $('#f').onsubmit = async e => { e.preventDefault(); await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); alert('บันทึกแล้ว'); };\n  }\n}\n\n\n// ---------- เงื่อนไขการใช้บริการ ----------\nconst TERMS = [\n  ['1. บริการ', 'AstraCode ให้บริการแชตกับโมเดล AI จากผู้ให้บริการหลายราย (เช่น OpenAI, Anthropic, Google, DeepSeek, Moonshot) ผ่านเว็บไซต์ รายชื่อโมเดลที่ใช้ได้ขึ้นอยู่กับแพลน และอาจเปลี่ยนแปลงได้ตามความพร้อมของผู้ให้บริการ'],\n  ['2. บัญชีผู้ใช้', 'ผู้ใช้ต้องให้อีเมลที่ใช้งานได้ และรักษารหัสผ่านเป็นความลับ บัญชีหนึ่งใช้ได้หนึ่งคน ห้ามแชร์ ขาย หรือให้เช่าบัญชี หากพบการใช้งานผิดเงื่อนไข เราอาจระงับบัญชีโดยไม่คืนเงิน'],\n  ['3. แพลนและการชำระเงิน', 'แพลนแบบชำระเงินมีอายุ 30 วันนับจากวันที่แอดมินอนุมัติสลิป การต่ออายุแพลนเดิมจะบวกเวลาต่อจากวันหมดอายุเดิม ชำระผ่าน PromptPay และแนบสลิปเท่านั้น สลิปปลอม สลิปซ้ำ หรือยอดไม่ตรงจะไม่ได้รับการอนุมัติ'],\n  ['4. การคืนเงิน', 'ไม่คืนเงินหลังเปิดใช้แพลนแล้ว ยกเว้นกรณีระบบขัดข้องจนใช้งานไม่ได้ต่อเนื่องเกิน 72 ชั่วโมงโดยเป็นความผิดของเรา ซึ่งจะคืนเงินหรือชดเชยวันใช้งานตามสัดส่วน ติดต่อแอดมินภายใน 7 วันนับจากวันที่เกิดปัญหา'],\n  ['5. ลิมิตการใช้งาน', 'แต่ละแพลนมีลิมิตทุก 4 ชั่วโมงและลิมิตรายสัปดาห์ แสดงเป็น % ในหน้าแชต โมเดลที่ต้นทุนสูงกว่าและโหมดคิด (Low / High / Max) ใช้ลิมิตมากกว่า จำนวนข้อความที่แสดงในหน้าแพลนเป็นค่าประมาณ เราอาจปรับลิมิต ราคา หรือโมเดลในแพลนได้ โดยจะแจ้งล่วงหน้าบนเว็บไซต์ การเปลี่ยนแปลงมีผลกับรอบที่ชำระครั้งถัดไป'],\n  ['6. การใช้งานที่ห้าม', 'ห้ามใช้บริการเพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง ละเมิดสิทธิ์ผู้อื่น สร้างมัลแวร์ หรือเนื้อหาที่ผิดนโยบายของผู้ให้บริการ AI ห้ามใช้โปรแกรมอัตโนมัติยิงคำขอ หรือพยายามเลี่ยงลิมิต'],\n  ['7. คำตอบจาก AI', 'คำตอบสร้างโดย AI อาจไม่ถูกต้อง ไม่ครบถ้วน หรือล้าสมัย ผู้ใช้ควรตรวจสอบก่อนนำไปใช้ โดยเฉพาะเรื่องการแพทย์ กฎหมาย และการเงิน เราไม่รับผิดชอบความเสียหายจากการนำคำตอบไปใช้'],\n  ['8. การเปลี่ยนแปลงบริการ', 'เราอาจหยุดให้บริการชั่วคราวเพื่อปรับปรุงระบบ หรือเมื่อผู้ให้บริการ AI ขัดข้อง และอาจแก้ไขเงื่อนไขนี้ได้ การใช้งานต่อหลังแก้ไขถือว่ายอมรับเงื่อนไขใหม่'],\n];\nconst PRIVACY = [\n  ['ข้อมูลที่เราเก็บ', 'อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว เราอ่านไม่ได้) ประวัติแชต สถิติการใช้งาน (จำนวน token และเวลา) และรูปสลิปการโอนเงิน'],\n  ['เราใช้ข้อมูลทำอะไร', 'ใช้เพื่อให้บริการ คำนวณลิมิต ตรวจสอบการชำระเงิน และแก้ปัญหาการใช้งาน เราไม่ขายข้อมูลของคุณ'],\n  ['การส่งข้อมูลให้ผู้ให้บริการ AI', 'ข้อความและรูปที่คุณส่งในแชตจะถูกส่งไปยังผู้ให้บริการ AI ของโมเดลที่คุณเลือก เพื่อสร้างคำตอบ ผู้ให้บริการเหล่านั้นอยู่ต่างประเทศและมีนโยบายข้อมูลของตัวเอง โปรดอย่าส่งข้อมูลส่วนตัวที่อ่อนไหว เช่น เลขบัตรประชาชน หรือรหัสผ่าน'],\n  ['การจัดเก็บ', 'ข้อมูลเก็บบน Cloudflare รูปที่แนบในแชตไม่ถูกเก็บไว้หลังส่งให้ AI แล้ว'],\n  ['สิทธิ์ของคุณ', 'ลบแชตได้เองทุกเมื่อจากเมนูด้านข้าง หากต้องการลบบัญชีและข้อมูลทั้งหมด หรือขอสำเนาข้อมูล ติดต่อแอดมิน เราจะดำเนินการภายใน 30 วัน ข้อมูลการชำระเงินอาจเก็บต่อตามที่กฎหมายกำหนด'],\n];\nfunction terms() {\n  const sec = (t, rows) => `<div class=\"band legal\"><h2>${t}</h2>${rows.map(([h, p]) => `<div class=\"tile\"><div style=\"font:600 17px var(--display)\">${h}</div><p class=\"muted\" style=\"font-size:15px;margin:0\">${p}</p></div>`).join('')}</div>`;\n  page(nav() + `<div class=\"wrap\" style=\"max-width:760px\"><section class=\"hero\" style=\"padding:48px 0 8px\"><h1>เงื่อนไขและความเป็นส่วนตัว</h1><p>มีผลตั้งแต่ 11 พฤศจิกายน 2569</p></section>\n    ${sec('เงื่อนไขการใช้บริการ', TERMS)}${sec('นโยบายความเป็นส่วนตัว', PRIVACY)}\n    <p class=\"muted\" style=\"text-align:center;padding-bottom:48px\">มีคำถามเกี่ยวกับเงื่อนไขนี้ ติดต่อแอดมิน</p></div>`);\n}\nconst footer = () => `<p class=\"muted\" style=\"text-align:center;padding:24px 0 48px\">© AstraCode · <a href=\"#/terms\">เงื่อนไขและความเป็นส่วนตัว</a></p>`;\n\n// ---------- router ----------\nasync function route() {\n  document.querySelector('.shade')?.remove();\n  if (chat.busy) chat.ctrl?.abort();\n  const [, pg, arg] = location.hash.split('/');\n  try {\n    if (pg === 'login') return me ? (location.hash = '#/chat') : auth();\n    if (pg === 'chat') return chatView(arg);\n    if (pg === 'plans') return plansPage();\n    if (pg === 'account') return account();\n    if (pg === 'terms') return terms();\n    if (pg === 'admin') return adminView(arg);\n    return me ? (location.hash = '#/chat') : landing();\n  } catch (x) {\n    if (!me) return location.hash = '#/login';\n    page(nav() + `<p class=\"err\" style=\"text-align:center;margin:48px\">${esc(x.message)}</p>`);\n  }\n}\naddEventListener('hashchange', route);\naddEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });\nloadMe().then(route);\nif ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});\n"],"/icon.svg":["image/svg+xml","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><rect width=\"512\" height=\"512\" rx=\"112\" fill=\"#000\"/><path d=\"M256 96 L388 416 H334 L304 340 H208 L178 416 H124 Z M224 296 H288 L256 212 Z\" fill=\"#f5f5f7\"/><circle cx=\"380\" cy=\"132\" r=\"22\" fill=\"#0071e3\"/></svg>\n"],"/index.html":["text/html; charset=utf-8","<!doctype html>\n<html lang=\"th\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content\">\n<meta name=\"theme-color\" content=\"#000000\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black\">\n<title>AstraCode — AI ทุกตัว ในมือถือเครื่องเดียว</title>\n<link rel=\"manifest\" href=\"/manifest.json\">\n<link rel=\"icon\" href=\"/icon.svg\">\n<link rel=\"apple-touch-icon\" href=\"/icon.svg\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Prompt:wght@400;500;600&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"/style.css\">\n</head>\n<body>\n<div id=\"app\"></div>\n<script src=\"/app.js\"></script>\n</body>\n</html>\n"],"/manifest.json":["application/manifest+json","{\n  \"name\": \"AstraCode\",\n  \"short_name\": \"AstraCode\",\n  \"start_url\": \"/\",\n  \"display\": \"standalone\",\n  \"background_color\": \"#000000\",\n  \"theme_color\": \"#000000\",\n  \"icons\": [{ \"src\": \"/icon.svg\", \"sizes\": \"any\", \"type\": \"image/svg+xml\", \"purpose\": \"any maskable\" }]\n}\n"],"/style.css":["text/css; charset=utf-8",":root {\n  --obsidian: #000; --graphite: #0e0e0e; --carbon: #1d1d1f; --steel: #333336; --slate: #6e6e73;\n  --ash: #86868b; --porcelain: #f5f5f7; --blue: #0071e3; --link: #2997ff;\n  --green: #30d158; --yellow: #ffd500; --red: #ff453a;\n  --font: 'SF Pro Text', 'Inter', 'Prompt', ui-sans-serif, system-ui, -apple-system, sans-serif;\n  --display: 'SF Pro Display', 'Inter', 'Prompt', ui-sans-serif, system-ui, -apple-system, sans-serif;\n  color-scheme: dark; accent-color: var(--porcelain);\n}\n* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\nhtml, body { margin: 0; background: var(--obsidian); color: var(--porcelain); font: 400 15px/1.5 var(--font); }\na { color: var(--link); text-decoration: none; }\n:focus-visible { outline: 2px solid var(--porcelain); outline-offset: 2px; }\n[hidden] { display: none !important; }\n\n/* nav */\n.nav { position: sticky; top: 0; z-index: 10; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: rgba(0,0,0,.8); backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid #282828; }\n.logo { font: 600 19px var(--display); color: var(--porcelain); letter-spacing: .2px; }\n.nav .sp { flex: 1; }\n.nav a.l { font-size: 13px; color: rgba(255,255,255,.8); padding: 12px 6px; }\n\n/* buttons */\n.btn { min-height: 44px; padding: 0 22px; border-radius: 170px; border: 0; font: 500 15px var(--font); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }\n.btn.blue { background: var(--blue); color: #fff; }\n.btn.out { background: transparent; color: var(--porcelain); box-shadow: 0 0 0 1px var(--slate) inset; }\n.btn.dark { background: rgba(66,66,69,.72); color: rgba(255,255,255,.85); }\n.btn.sm { min-height: 36px; padding: 0 14px; font-size: 13px; }\n.btn.red { background: transparent; color: var(--red); box-shadow: 0 0 0 1px var(--steel) inset; }\n.btn:disabled { opacity: .4; cursor: default; }\n\n/* inputs */\ninput, select, textarea { width: 100%; min-height: 44px; padding: 10px 20px; border-radius: 980px; border: 1px solid var(--slate); background: rgba(255,255,255,.04); color: var(--porcelain); font: 400 15px var(--font); }\ntextarea { border-radius: 20px; resize: none; }\ninput:focus, select:focus, textarea:focus { outline: 1px solid var(--blue); outline-offset: 1px; }\nlabel { display: block; font-size: 13px; color: var(--ash); margin: 12px 0 6px 8px; }\ninput[type=checkbox] { width: auto; min-height: 0; }\n\n/* layout */\n.wrap { max-width: 980px; margin: 0 auto; padding: 0 16px; }\n.hero { text-align: center; padding: 90px 16px 48px; }\n.hero .name { font: 600 32px/1.13 var(--display); }\n.hero h1 { font: 600 40px/1.15 var(--display); letter-spacing: -.5px; margin: 8px 0 16px; }\n.hero p { color: var(--ash); font-size: 17px; max-width: 560px; margin: 0 auto 28px; }\n@media (min-width: 768px) { .hero h1 { font-size: 80px; letter-spacing: -1.2px; } }\n.band { background: linear-gradient(#1d1d1f, #000 288px); border-radius: 28px; padding: 28px 16px; margin: 24px 0 90px; }\n.band h2 { font: 600 32px/1.15 var(--display); text-align: center; margin: 0 0 24px; }\n.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }\n.tile { background: var(--obsidian); border-radius: 28px; padding: 28px; display: flex; flex-direction: column; gap: 8px; }\n.card { background: var(--carbon); border-radius: 28px; padding: 24px; margin: 16px 0; }\n.card .tile { background: var(--obsidian); }\n.stat { font: 600 28px/1 var(--display); }\n.muted { color: var(--ash); font-size: 13px; }\n.price { font: 600 40px/1 var(--display); }\n.price small { font-size: 15px; color: var(--ash); font-weight: 400; }\n.tile.sel { box-shadow: 0 0 0 2px var(--porcelain) inset; }\n.err { color: var(--red); font-size: 13px; min-height: 20px; margin: 8px; }\n.ok { color: var(--green); }\n.warn { color: var(--yellow); }\n\n/* auth */\n.auth { max-width: 400px; margin: 48px auto; }\n.auth h1 { font: 600 32px var(--display); text-align: center; }\n.tabs { display: flex; gap: 8px; justify-content: center; margin: 16px 0; flex-wrap: wrap; }\n.tabs button { min-height: 36px; padding: 0 16px; border-radius: 9999px; border: 1px solid var(--steel); background: transparent; color: var(--porcelain); font: 500 14px var(--font); cursor: pointer; }\n.tabs button.on { background: var(--porcelain); color: #1d1d1f; border-color: var(--porcelain); }\n\n/* chat */\n.chat { display: flex; height: 100dvh; }\n.side { width: 280px; background: var(--graphite); border-right: 1px solid #282828; display: flex; flex-direction: column; padding: 12px; gap: 8px; }\n.side .list { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 2px; }\n.side .item { display: flex; align-items: center; border-radius: 10px; }\n.side .item a { flex: 1; color: var(--porcelain); padding: 10px 12px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.side .item.on, .side .item:hover { background: var(--carbon); }\n.side .item button { background: none; border: 0; color: var(--ash); width: 36px; height: 36px; cursor: pointer; }\n.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }\n.bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #282828; }\n.bar select { width: auto; min-height: 36px; padding: 4px 14px; font-size: 14px; }\n.meters { display: flex; gap: 12px; flex: 1; justify-content: flex-end; }\n.meter { width: 96px; font-size: 11px; color: var(--ash); }\n.meter .track { height: 4px; border-radius: 4px; background: var(--steel); margin-top: 3px; overflow: hidden; }\n.meter .fill { height: 100%; background: var(--porcelain); }\n.meter.hi .fill { background: var(--yellow); }\n.meter.full .fill { background: var(--red); }\n.msgs { flex: 1; overflow: auto; padding: 16px 12px; }\n.msg { max-width: 760px; margin: 0 auto 16px; line-height: 1.6; word-wrap: break-word; }\n.msg.user { display: flex; justify-content: flex-end; }\n.msg.user .b { background: var(--carbon); border-radius: 20px; padding: 10px 16px; max-width: 85%; white-space: pre-wrap; }\n.msg .b p { margin: 0 0 10px; }\n.msg pre { background: var(--carbon); border-radius: 14px; padding: 14px; overflow: auto; font-size: 13px; }\n.msg code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; }\n.msg :not(pre) > code { background: var(--carbon); padding: 1px 6px; border-radius: 6px; }\n.empty { text-align: center; color: var(--ash); padding-top: 18vh; }\n.empty .stat { color: var(--porcelain); margin-bottom: 8px; }\n.compose { padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }\n.compose form { max-width: 760px; margin: 0 auto; display: flex; gap: 8px; align-items: flex-end; }\n.compose textarea { max-height: 180px; }\n.compose .btn { width: 44px; padding: 0; flex: none; }\n.menu-btn { display: none; background: none; border: 0; color: var(--porcelain); font-size: 22px; width: 44px; height: 44px; cursor: pointer; }\n@media (max-width: 760px) {\n  .side { position: fixed; inset: 0 auto 0 0; z-index: 20; transform: translateX(-100%); transition: transform .2s; }\n  .side.open { transform: none; }\n  .menu-btn { display: block; }\n  .meter { width: 64px; }\n}\n.shade { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 15; }\n\n/* tables (admin) */\n.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }\n.tbl th { text-align: left; color: var(--ash); font-weight: 500; padding: 8px; }\n.tbl td { padding: 8px; border-top: 1px solid var(--steel); vertical-align: top; }\n.scroll { overflow-x: auto; }\n.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.form2 { display: grid; gap: 0 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }\n.slipimg { max-width: 100%; max-height: 70vh; border-radius: 14px; }\n.qr { width: 220px; border-radius: 20px; background: #fff; padding: 12px; }\n\n/* ---------- v2: markdown ---------- */\n.msg .b .h { font: 600 17px/1.35 var(--display); margin: 16px 0 8px; }\n.msg .b .h1 { font-size: 22px; } .msg .b .h2 { font-size: 19px; }\n.msg .b ul, .msg .b ol { margin: 0 0 10px; padding-left: 22px; }\n.msg .b li { margin: 3px 0; } .msg .b li.sub { margin-left: 18px; list-style: circle; }\n.msg .b blockquote { margin: 0 0 10px; padding: 4px 14px; border-left: 3px solid var(--slate); color: var(--ash); }\n.msg .b hr { border: 0; border-top: 1px solid var(--steel); margin: 16px 0; }\n.msg .b a { color: var(--link); text-decoration: underline; text-underline-offset: 2px; }\n.tw { overflow-x: auto; margin: 0 0 12px; -webkit-overflow-scrolling: touch; }\n.tw table { border-collapse: collapse; font-size: 14px; min-width: 100%; }\n.tw th, .tw td { padding: 8px 12px; border-bottom: 1px solid var(--steel); text-align: left; white-space: nowrap; }\n.tw th { color: var(--ash); font-weight: 500; }\n.code { background: var(--carbon); border-radius: 14px; margin: 0 0 12px; overflow: hidden; }\n.code-h { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px 6px 14px; font-size: 12px; color: var(--ash); border-bottom: 1px solid var(--steel); }\n.code pre { margin: 0; border-radius: 0; }\n.code-h button, .acts button { background: none; border: 0; color: var(--ash); font: 500 12px var(--font); padding: 8px 10px; border-radius: 10px; cursor: pointer; min-height: 32px; }\n.code-h button:hover, .acts button:hover { background: var(--steel); color: var(--porcelain); }\n.acts { display: flex; align-items: center; gap: 2px; margin-top: 4px; font-size: 12px; }\n.acts .muted { font-size: 12px; margin-right: 6px; }\n\n/* ---------- v2: chat UI ---------- */\n.dots { display: inline-flex; gap: 5px; padding: 8px 0; }\n.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--ash); animation: blink 1.2s infinite ease-in-out; }\n.dots i:nth-child(2) { animation-delay: .15s; } .dots i:nth-child(3) { animation-delay: .3s; }\n@keyframes blink { 0%, 80%, 100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }\n.chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 24px; padding: 0 16px; }\n.chips button { min-height: 40px; padding: 0 16px; border-radius: 9999px; border: 1px solid var(--steel); background: var(--carbon); color: var(--porcelain); font: 400 14px var(--font); cursor: pointer; }\n.notice { max-width: 760px; margin: 0 auto 8px; padding: 10px 16px; border-radius: 20px; background: var(--carbon); font-size: 13px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n.notice.hi { color: var(--yellow); } .notice.full { color: var(--red); }\n.compose .err { max-width: 760px; margin: 0 auto 6px; text-align: center; min-height: 0; }\n.compose .err:empty { display: none; }\n.thumbs { max-width: 760px; margin: 0 auto; display: flex; gap: 8px; }\n.thumbs:not(:empty) { margin-bottom: 8px; }\n.thumb { position: relative; }\n.thumb img { width: 64px; height: 64px; object-fit: cover; border-radius: 14px; display: block; }\n.thumb button { position: absolute; top: -6px; right: -6px; width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--steel); color: var(--porcelain); font-size: 11px; cursor: pointer; }\n.mimgs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }\n.mimgs img { width: 96px; height: 96px; object-fit: cover; border-radius: 12px; }\n.icon-btn { width: 44px; height: 44px; flex: none; border-radius: 50%; border: 1px solid var(--slate); background: transparent; color: var(--porcelain); font-size: 20px; cursor: pointer; }\n.btn.send.stop { background: var(--porcelain); color: #000; }\n.bar #effort { max-width: 110px; }\n.side .item button { opacity: .6; } .side .item:hover button, .side .item.on button { opacity: 1; }\n\n/* ---------- v2: plans + landing ---------- */\n.tile.plan { position: relative; cursor: pointer; }\n.tile.feat { box-shadow: 0 0 0 1px var(--slate) inset; }\n.tile.sel { box-shadow: 0 0 0 2px var(--porcelain) inset; }\n.badge { position: absolute; top: 20px; right: 20px; font: 600 12px var(--font); color: #1d1d1f; background: var(--porcelain); padding: 4px 10px; border-radius: 9999px; }\n.feat-list { list-style: none; padding: 0; margin: 4px 0 0; font-size: 14px; }\n.feat-list li { padding: 4px 0; border-top: 1px solid var(--steel); }\n.cmp td:first-child { color: var(--ash); }\n.faq { background: var(--obsidian); border-radius: 20px; padding: 0 20px; margin-bottom: 8px; }\n.faq summary { min-height: 52px; display: flex; align-items: center; cursor: pointer; font-weight: 500; list-style: none; }\n.faq summary::after { content: '+'; margin-left: auto; color: var(--ash); font-size: 20px; transition: transform .2s; }\n.faq[open] summary::after { transform: rotate(45deg); }\n.faq p { margin: 0 0 16px; color: var(--ash); }\n.bad { color: var(--red); }\n\n/* ---------- v2: motion ---------- */\n.view { animation: fadeUp .28s ease-out both; }\n.msg.new { animation: fadeUp .22s ease-out both; }\n@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }\n.btn, .tabs button, .chips button, .icon-btn, .tile.plan { transition: transform .15s ease, background-color .2s, color .2s, box-shadow .2s, opacity .2s; }\n.btn:active, .tabs button:active, .chips button:active, .icon-btn:active { transform: scale(.96); }\n.tile.plan:active { transform: scale(.98); }\n.meter .fill { transition: width .5s ease, background-color .3s; }\n.notice:not(:empty) { animation: fadeUp .25s ease-out both; }\n.shade { animation: fade .2s ease-out both; }\n@keyframes fade { from { opacity: 0; } }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }\n.bar #model { flex: 0 1 auto; min-width: 0; max-width: 46%; }\n@media (max-width: 760px) {\n  .bar { gap: 6px; padding: 8px; }\n  .bar select { padding: 4px 10px; font-size: 13px; }\n  .bar #effort { max-width: 84px; }\n  .meters { gap: 8px; }\n  .meter { width: 52px; font-size: 10px; white-space: nowrap; }\n}\n.wrap > .grid > .tile { background: var(--carbon); } /* การ์ดบนพื้นดำ ใช้สี Carbon */\n.cmp td:first-child, .cmp th:first-child { position: sticky; left: 0; background: var(--carbon); }\n.legal .tile { margin-bottom: 12px; }\n.legal h2 { text-align: left; font-size: 24px; }\n.band.legal { background: var(--carbon); }\n.tabs a { min-height: 36px; padding: 0 16px; border-radius: 9999px; border: 1px solid var(--steel); color: var(--porcelain); font: 500 14px var(--font); display: inline-flex; align-items: center; transition: transform .15s, background-color .2s; }\n.tabs a.on { background: var(--porcelain); color: #1d1d1f; border-color: var(--porcelain); }\n.tabs a:active { transform: scale(.96); }\n"],"/sw.js":["text/javascript; charset=utf-8","// PWA: ทำให้ติดตั้งลงหน้าจอหลักได้ ไม่ cache API\nself.addEventListener('fetch', () => {});\n"]};
const ASSETS = { fetch(req) { const f = FILES[new URL(req.url).pathname] || FILES['/index.html']; return new Response(f[1], { headers: { 'content-type': f[0] } }); } };
export default { fetch: (req, env, ctx) => API.fetch(req, { ...env, ASSETS }, ctx) };
