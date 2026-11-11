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
export default {
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
