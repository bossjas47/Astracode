// AstraCode API — Cloudflare Worker + D1 + R2
const SYSTEM = 'You are AstraCode, a helpful AI assistant. Reply in the user\'s language. Use Markdown. You have no tools: never output JSON tool calls; if you need to ask the user something, ask in plain text. When the user asks for a file (CSV, Excel, Markdown, HTML, JSON, code, Word…), put the whole file in one fenced code block whose info string is the language then file=<name.ext>, e.g. ```csv file=sales.csv — the page shows a download button. For Excel write CSV content with file=<name>.xlsx. For Word write a full HTML document with file=<name>.doc. For PDF write HTML with file=<name>.html and tell the user to print it to PDF. Write file names in English without spaces.';
const SYSTEM_CODE = `You are AstraCode, a senior software engineer working inside the user's project. Reply in the user's language and keep explanations short.
When you create or change a file, output the COMPLETE new content of that file in one fenced code block whose info string is the language followed by path=<relative path>, for example:
\`\`\`js path=src/app.js
...whole file...
\`\`\`
One block per changed file. Never put partial files, "..." placeholders or diffs inside path= blocks. To delete a file, write a line: DELETE path=<relative path>
Code blocks without path= are treated as examples only. Only change files that need changing.
You can see the whole project. The file list is in the message. To look at files, write tool lines on their own and then STOP your reply; the results come back to you:
READ path=<relative path>   (full content of one file; up to 10 READ lines at once)
GREP <regex>                (search every file, returns path:line: text)
LIST <folder/>              (files under a folder, with sizes)
Read every file you need before editing it. Never guess what a file contains. Do not mix READ/GREP/LIST lines with path= blocks in the same reply.
To run a terminal command, write a line RUN <command> (up to 3 per reply) and then STOP; the output comes back in the next message. You may put path= blocks before RUN lines in the same reply: they are applied first. Commands run in a browser Node.js emulator (Node 20 APIs): npm install <pkg>, npm test, npm run <script>, node <file>.js, npx-style CLIs from node_modules/.bin, ls, cat, echo. Not available: git, python, pip, sudo, node -e, node -v, native addons. Use RUN to test your changes when the project has tests or runnable scripts.`;
const HISTORY = 20, HISTORY_CODE = 8; // ข้อความย้อนหลังที่ส่งให้โมเดล (โหมด Code ส่งน้อยกว่าเพราะมีไฟล์ยาว)
const H4 = 4 * 3600e3, DAY = 864e5, BKK = 7 * 3600e3;

// ข้อผิดพลาดที่บอกผู้ใช้ได้ตรงๆ (ไม่ใช่บั๊กของเซิร์ฟเวอร์)
const userErr = (m, status = 400) => Object.assign(new Error(m), { user: true, status });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
const err = (m, s = 400) => json({ error: m }, s);
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));

// ---------- auth ----------
const same = (a, b) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); return x.length === y.length && crypto.subtle.timingSafeEqual(x, y); };
const sha = async t => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
// คำขอที่ผ่าน proxy บน Vercel แนบ x-proxy-secret มา จึงเชื่อ IP และโดเมนที่ proxy ส่งต่อได้
const viaProxy = (req, env) => !!env.PROXY_SECRET && same(req.headers.get('x-proxy-secret') || '', env.PROXY_SECRET);
const ip = (req, env) => (viaProxy(req, env) && req.headers.get('x-client-ip')) || req.headers.get('cf-connecting-ip') || 'local';

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
async function sessionCookie(env, uid) {
  const t = rand(32), exp = Date.now() + 30 * DAY; // เก็บแค่ hash ของ token ถ้า DB รั่วก็เอาไปล็อกอินไม่ได้
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await sha(t), uid, exp),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),
  ]);
  return `sid=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`;
}
const startSession = async (env, uid) => json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, uid) });

// ---------- Firebase Auth: เว็บล็อกอินกับ Firebase แล้วส่ง ID token มาแลกเป็น session ของเรา ----------
let JWKS = null; // { keys, exp } แคชกุญแจของ Google ตาม max-age
async function fbKey(env, kid) {
  if (!JWKS || JWKS.exp < Date.now() || !JWKS.keys[kid]) {
    const r = await fetch(env.FB_JWKS_URL || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'); // FB_JWKS_URL ใช้ตอนทดสอบเท่านั้น
    const age = +(r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600;
    JWKS = { keys: Object.fromEntries((await r.json()).keys.map(k => [k.kid, k])), exp: Date.now() + age * 1000 };
  }
  const k = JWKS.keys[kid]; if (!k) return null;
  return crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function fbVerify(env, token) { // ตรวจตามเอกสาร Firebase "Verify ID tokens using a third-party JWT library"
  const project = env.FIREBASE_PROJECT_ID || 'astra-892a8', [h, p, sig] = String(token || '').split('.');
  if (!sig) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(h))), c = JSON.parse(new TextDecoder().decode(b64u(p))), now = Date.now() / 1000;
  if (head.alg !== 'RS256' || c.aud !== project || c.iss !== 'https://securetoken.google.com/' + project || !c.sub || c.exp < now || c.iat > now + 60 || c.auth_time > now + 60) return null;
  const key = await fbKey(env, head.kid);
  return key && await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(sig), new TextEncoder().encode(h + '.' + p)) ? c : null;
}
async function firebaseLogin(req, env, ctx) {
  const b = await req.json();
  if (await limited(env, 'fb:' + ip(req, env), 30, 900e3)) return err('ลองหลายครั้งเกินไป รอ 15 นาที', 429);
  const c = await fbVerify(env, b.token).catch(() => null);
  if (!c) return err('ล็อกอินไม่สำเร็จ ลองใหม่อีกครั้ง', 401);
  const email = String(c.email || '').toLowerCase();
  if (!email || !c.email_verified) return err('ยืนยันอีเมลก่อน', 403); // กันคนสมัครด้วยอีเมลคนอื่นแล้วยึดบัญชีเดิม
  let u = await env.DB.prepare('SELECT * FROM users WHERE fb_uid=?').bind(c.sub).first()
    || await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(); // บัญชีเดิม (สมัครก่อนย้ายมา Firebase) เชื่อมด้วยอีเมลที่ยืนยันแล้ว
  if (u && u.fb_uid !== c.sub) await env.DB.prepare('UPDATE users SET fb_uid=?, email_verified=1 WHERE id=?').bind(c.sub, u.id).run();
  if (!u) {
    if (await limited(env, 'reg:' + ip(req, env), 3, DAY)) return err('สมัครจากเครือข่ายนี้บ่อยเกินไป ลองใหม่พรุ่งนี้', 429);
    // ได้สิทธิ์แอดมินเฉพาะตอนที่ยังไม่มีแอดมินในระบบ
    const role = email === String(env.ADMIN_EMAIL || '').toLowerCase() && !await env.DB.prepare("SELECT 1 FROM users WHERE role='admin'").first() ? 'admin' : 'user';
    const by = b.ref && await env.DB.prepare('SELECT id FROM users WHERE ref_code=?').bind(String(b.ref).toUpperCase()).first();
    u = await env.DB.prepare('INSERT INTO users (email,pass_hash,role,created_at,ref_code,referred_by,fb_uid,email_verified,has_password) VALUES (?,?,?,?,?,?,?,1,0) RETURNING *')
      .bind(email, 'x', role, Date.now(), rand(4).toUpperCase(), by?.id || null, c.sub).first();
  }
  if (u.banned) return err('บัญชีนี้ถูกระงับ', 403);
  if (u.totp_on) {
    if (!b.code) return json({ need2fa: true }, 401);
    if (await limited(env, 'mfa:' + u.id, 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
    if (!await totpOk(env, u, b.code)) return err('รหัส 2FA ไม่ถูกต้อง', 401);
  }
  return await startSession(env, u.id);
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
async function* callModel(env, m, msgs, { effort, images = [], system = SYSTEM, maxTokens } = {}) {
  const key = env[m.key_name];
  if (!key) throw new Error('missing key ' + m.key_name);
  // หมายเหตุ Claude: Anthropic มี code execution tool ของตัวเอง (ส่ง tools: [{ type: 'code_execution_20250825', name: 'code_execution' }])
  // รัน Python 3.11 + Bash ในเครื่องของ Anthropic, ไม่มีอินเทอร์เน็ต (npm install ไม่ได้), ฟรี 1,550 ชม./เดือน/องค์กร แล้ว $0.05/ชม.
  // ยังไม่เปิดใช้: โหมด Code ใช้ RUN (เทอร์มินัลในเบราว์เซอร์) ซึ่งใช้ได้ทุกโมเดล ถ้าจะเปิด ต้องรองรับ event server_tool_use / bash_code_execution_tool_result ด้วย
  if (m.provider === 'anthropic') {
    const messages = msgs.map(x => ({ role: x.role, content: x.content }));
    const last = messages.at(-1); // cache ทั้งบทสนทนาถึงข้อความล่าสุด
    last.content = [
      ...images.map(d => ({ type: 'image', source: { type: 'base64', media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1) } })),
      { type: 'text', text: last.content, cache_control: { type: 'ephemeral' } },
    ];
    const body = { model: m.api_model, max_tokens: maxTokens || 16000, stream: true, messages };
    if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
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
      else if (e.type === 'content_block_delta' && e.delta?.thinking) yield { th: e.delta.thinking }; // เหตุผลที่ Claude คิด
      else if (e.type === 'message_delta' && e.usage) u.out = e.usage.output_tokens || 0;
      else if (e.type === 'error') throw new Error(e.error?.message || 'upstream error');
    }
    yield { usage: u };
  } else { // OpenAI-compatible: OpenAI, DeepSeek, Kimi, Gemini
    const messages = [...(system ? [{ role: 'system', content: system }] : []), ...msgs.map(x => ({ role: x.role, content: x.content }))];
    if (images.length) messages.at(-1).content = [{ type: 'text', text: messages.at(-1).content }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))];
    const body = { model: m.api_model, stream: true, stream_options: { include_usage: true }, messages };
    if (maxTokens) body[/api\.openai\.com/.test(m.base_url) ? 'max_completion_tokens' : 'max_tokens'] = maxTokens; // OpenAI รุ่นคิด (GPT-5, o-series) ไม่รับ max_tokens
    if (m.effort === 'openai' && effort) body.reasoning_effort = { low: 'low', high: 'medium', max: 'high' }[effort];
    if (m.effort === 'deepseek') { // DeepSeek เปิดคิดเป็นค่าเริ่มต้น จึงต้องปิดเองเมื่อเลือก "เร็ว"
      body.thinking = { type: effort ? 'enabled' : 'disabled' };
      if (effort) body.reasoning_effort = effort; // DeepSeek รับ low / high / max ตรงๆ
    }
    if (m.effort === 'kimi') body.thinking = { type: effort ? 'enabled' : 'disabled' }; // Kimi K2.5+: เปิด/ปิดคิดอย่างเดียว ไม่มีระดับ
    const res = await fetch(m.base_url + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let usage = null;
    for await (const e of sse(res)) {
      const dl = e.choices?.[0]?.delta, th = dl?.reasoning_content || dl?.reasoning; // DeepSeek/Kimi/อื่นๆ ส่งความคิดมาทางนี้
      if (typeof th === 'string' && th) yield { th };
      const t = dl?.content; if (t) yield { t };
      if (e.usage || e.choices?.[0]?.usage) usage = e.usage || e.choices[0].usage; // Kimi ใส่ usage ไว้ใน choices
    }
    const p = usage?.prompt_tokens || 0, d = usage?.prompt_tokens_details;
    const read = usage?.prompt_cache_hit_tokens ?? d?.cached_tokens ?? usage?.cached_tokens ?? 0, write = d?.cache_write_tokens || 0;
    yield { usage: { fresh: p - read - write, read, write, out: usage?.completion_tokens || 0 } };
  }
}

// ระบบพรอมต์: คำสั่งส่วนตัว + ความจำ + ผลค้นเว็บ
async function systemFor(env, u, base, sources) {
  let sys = base;
  if (u.instructions?.trim()) sys += `\n\nUser's custom instructions (follow them):\n${u.instructions.trim().slice(0, 3000)}`;
  const mem = (await env.DB.prepare('SELECT text FROM memories WHERE user_id=? ORDER BY id LIMIT 50').bind(u.id).all()).results;
  if (mem.length) sys += `\n\nThings the user asked you to remember:\n${mem.map(x => '- ' + x.text).join('\n')}`;
  if (sources?.length) sys += `\n\nWeb search results (today is ${new Date().toISOString().slice(0, 10)}). Use them when relevant and cite as [1], [2]:\n` + sources.map((x, i) => `[${i + 1}] ${x.title} (${x.url})\n${x.content}`).join('\n\n');
  return sys;
}
async function webSearch(env, q) { // Tavily
  if (!env.TAVILY_KEY || (await getSetting(env, 'search_enabled')) === '0') return [];
  try {
    const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.TAVILY_KEY },
      body: JSON.stringify({ query: q.slice(0, 400), max_results: 5, search_depth: 'basic' }) });
    if (!r.ok) return [];
    return ((await r.json()).results || []).slice(0, 5).map(x => ({ title: String(x.title || x.url).slice(0, 200), url: x.url, content: String(x.content || '').slice(0, 1200) }));
  } catch { return []; }
}
// บันทึกการใช้งาน + คิดเงิน wallet เมื่อจ่ายแบบตามใช้ (API / ลิมิตเต็มแล้วใช้ wallet)
async function logUsage(env, uid, m, usage, { units = true, wallet = null } = {}) {
  const cost = (usage.fresh * m.cost_in + usage.read * m.cost_cache + usage.write * m.cost_cache_write + usage.out * m.cost_out) / 1e6;
  const un = units ? (usage.fresh + usage.write + usage.read / 10 + usage.out) * m.multiplier : 0; // cache read นับ 1/10
  await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uid, m.id, usage.fresh + usage.write, usage.out, usage.read, un, cost, Date.now()).run();
  let charge = 0;
  if (wallet) {
    const p = await priceOf(env, m); charge = Math.round((usage.fresh * p.in + usage.read * p.cache + usage.write * p.write + usage.out * p.out) / 1e6 * 10000) / 10000;
    if (charge > 0) await walletAdd(env, uid, -charge, wallet, m.name);
  }
  return charge; // ยอดที่ตัดจาก wallet (0 ถ้าไม่ได้ตัด)
}
async function chat(req, env, u, ctx) {
  const b = await req.json();
  const images = Array.isArray(b.images) && !b.regenerate ? b.images.slice(0, 4) : [];
  if (images.some(d => typeof d !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(d) || d.length > 2e6)) return err('รูปต้องเป็น jpeg/png/webp ไม่เกิน 1.5MB');
  const files = Array.isArray(b.files) && !b.regenerate ? b.files : [];
  if (files.length > 5 || files.some(f => typeof f?.name !== 'string' || typeof f?.text !== 'string' || f.name.length > 120)) return err('ไฟล์แนบไม่ถูกต้อง (สูงสุด 5 ไฟล์)');
  if (files.reduce((a, f) => a + f.text.length, 0) > 400000) return err('ไฟล์รวมกันยาวเกินไป ลองแนบทีละน้อยลง');
  let text = typeof b.text === 'string' ? b.text.trim() : '';
  if (text.length > 20000) return err('ข้อความยาวเกิน 20,000 ตัวอักษร');
  if (!b.regenerate && !text && !images.length && !files.length) return err('ข้อความว่าง');
  if (!text) text = files.length ? 'อ่านไฟล์นี้' : 'อธิบายรูปนี้';
  const effort = ['low', 'high', 'max'].includes(b.effort) ? b.effort : null;
  const ephemeral = !!b.ephemeral; // โหมดเทียบโมเดล: ไม่บันทึกแชต
  const plan = await planOf(env, u);
  if (b.model_id === 'auto') b.model_id = await autoModel(env, plan.id, { text, images, files, effort, regenerate: b.regenerate });
  const m = await env.DB.prepare('SELECT m.* FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.id=? AND m.active=1').bind(plan.id, b.model_id).first();
  if (!m) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
  if (images.length && !m.vision) return err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น');
  const st = await usageStatus(env, u, plan);
  // ลิมิตเต็ม: ใช้เงินใน wallet ต่อได้ ถ้าผู้ใช้เปิดไว้
  const overflow = (st.pct4h >= 100 || st.pctWeek >= 100) ? (u.wallet_overflow && u.balance > 0 ? 'overflow' : null) : null;
  if ((st.pct4h >= 100 || st.pctWeek >= 100) && !overflow) return json({ error: 'ลิมิตเต็มแล้ว', ...st, wallet: u.balance }, 429);
  if (await limited(env, 'chatmin:' + u.id, 20, 60e3)) return err('ส่งเร็วเกินไป รอสักครู่', 429);
  // ให้ตอบได้ทีละข้อความ กันยิงพร้อมกันหลายอันเพื่อเลี่ยงลิมิต (ล็อกหมดอายุเองใน 3 นาที) ยกเว้นโหมดเทียบ
  const lock = 'chatlock:' + u.id + (ephemeral ? ':' + rand(4) : '');
  const got = await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n')
    .bind(lock, Date.now() + 180e3, Date.now()).first();
  if (!got) return err('กำลังตอบข้อความก่อนหน้าอยู่', 429);
  try {

  const pid = b.project_id || null; // โหมด Code
  if (pid && !await env.DB.prepare('SELECT 1 FROM projects WHERE id=? AND user_id=?').bind(pid, u.id).first()) return err('ไม่พบโปรเจกต์', 404);
  let cid = ephemeral ? null : b.chat_id;
  if (cid && !await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, u.id).first()) return err('ไม่พบแชต', 404);
  // ไฟล์เก็บในข้อความ โมเดลจึงจำได้ในข้อความถัดไป (รูปแบบเดียวกับฝั่งเว็บ)
  // shortcut: ไม่เก็บรูปไว้ในประวัติ (โมเดลเห็นรูปแค่ข้อความนี้) ถ้าต้องการให้จำรูป ให้เก็บใน R2
  const saved = text + files.map(f => `\n\n[[file:${f.name.replace(/[[\]\r\n]/g, '')}]]\n${f.text}\n[[/file]]`).join('') + (images.length ? `\n\n[แนบรูป ${images.length} รูป]` : '');
  let hist, chatRow = null;
  if (ephemeral) hist = [{ role: 'user', content: saved }];
  else {
    if (b.regenerate) { // ตอบใหม่: ลบคำตอบล่าสุด แล้วใช้คำถามเดิม
      const last = cid && await env.DB.prepare('SELECT id,role FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1').bind(cid).first();
      if (!last) return err('ไม่มีข้อความให้ตอบใหม่');
      if (last.role === 'assistant') await env.DB.prepare('DELETE FROM messages WHERE id=?').bind(last.id).run();
    } else {
      if (!cid) cid = (await env.DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id,folder_id) VALUES (?,?,?,?,?) RETURNING id').bind(u.id, text.slice(0, 40), Date.now(), pid, b.folder_id || null).first()).id;
      await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(cid, 'user', saved, m.id, Date.now()).run();
    }
    chatRow = await env.DB.prepare('SELECT summary,summary_upto FROM chats WHERE id=?').bind(cid).first();
    hist = (await env.DB.prepare('SELECT role,content FROM messages WHERE chat_id=? AND id>? ORDER BY id DESC LIMIT ?').bind(cid, chatRow?.summary_upto || 0, pid ? HISTORY_CODE : HISTORY).all()).results.reverse().filter(x => x.content); // ตัดคำตอบว่าง (กดหยุดตอนยังคิดอยู่)
    while (hist.length && hist[0].role !== 'user') hist.shift();
    if (!hist.length) { await unlimit(env, lock); return err('ไม่มีข้อความให้ตอบ'); }
  }

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(), enc = new TextEncoder();
  let gone = false; // ผู้ใช้กดหยุดหรือหลุด
  const send = async o => { if (gone) return; try { await w.write(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch { gone = true; } };
  ctx.waitUntil((async () => { // waitUntil: ทำงานต่อจนบันทึกเสร็จ แม้ผู้ใช้กดหยุด
    let out = '', think = '', usage = null, model = m;
    await send({ chat_id: cid, model: m.name, overflow: !!overflow });
    const sources = b.search && !pid ? await webSearch(env, hist.at(-1).content) : [];
    if (sources.length) await send({ sources: sources.map(({ title, url }) => ({ title, url })) });
    const system = (await systemFor(env, u, pid ? SYSTEM_CODE + (m.code_prompt?.trim() ? '\n\n' + m.code_prompt.trim() : '') : SYSTEM, sources)) + (chatRow?.summary ? `\n\nSummary of the earlier part of this conversation (older messages are not shown):\n${chatRow.summary}` : ''); // code_prompt: แอดมินเขียนกำกับโมเดลที่ไม่ค่อยทำตาม
    let msgs = hist, imgs = images;
    for (let round = 0; ; round++) { // โหมด Code: AI ขออ่าน/ค้นไฟล์ได้เอง แล้วตอบต่อ (สูงสุด TOOL_ROUNDS รอบ)
      let part = '', ru = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          for await (const e of callModel(env, model, msgs, { effort, images: imgs, system })) {
            if (gone) break;
            if (e.t) { out += e.t; part += e.t; await send({ t: e.t }); }
            if (e.th) { think += e.th; await send({ th: e.th }); }
            if (e.usage) ru = e.usage;
          }
          break;
        } catch (e) {
          console.log('AI error', model.name, e.message);
          await event(env, 'error', model.id, e.message.slice(0, 300));
          const fb = !out && !think && attempt === 0 && model.fallback_id && await env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(model.fallback_id).first();
          if (fb) { model = fb; await send({ fallback: fb.name }); continue; } // โมเดลหลักล่ม: สลับไปโมเดลสำรอง
          await send({ error: u.role === 'admin' ? 'แอดมิน: ' + e.message : 'โมเดลตอบไม่ได้ตอนนี้ ลองใหม่อีกครั้ง' });
          break;
        }
      }
      if (ru) usage = usage ? { fresh: usage.fresh + ru.fresh, read: usage.read + ru.read, write: usage.write + ru.write, out: usage.out + ru.out } : ru;
      const reqs = pid && !gone && round < TOOL_ROUNDS && !/```[^\n]*\bpath=/.test(part) && !/^\s*RUN\s+\S/m.test(part.replace(/```[\s\S]*?```/g, '')) ? toolReqs(part) : []; // RUN รันที่เครื่องผู้ใช้ จึงหยุดรอ
      if (!reqs.length) break;
      const result = await runTools(env, pid, reqs);
      await send({ t: '\n\n' }); out += '\n\n';
      msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: result }]; imgs = [];
      await env.DB.prepare('UPDATE rate SET reset=? WHERE key=?').bind(Date.now() + 180e3, lock).run(); // ยืดล็อกระหว่างทำหลายรอบ
    }
    if (!usage && gone) { // shortcut: กดหยุดก่อนได้ usage จริง จึงประมาณจากจำนวนตัวอักษร ÷ 2
      const chars = hist.reduce((a, x) => a + x.content.length, system.length);
      usage = { fresh: Math.ceil(chars / 2), read: 0, write: 0, out: Math.ceil((out.length + think.length) / 2) };
    }
    const tok = usage && { in: usage.fresh + usage.read + usage.write, out: usage.out };
    if ((out || think) && cid) await env.DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,thinking,sources,tin,tout) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(cid, 'assistant', out, model.id, Date.now(), think || null, sources.length ? JSON.stringify(sources.map(({ title, url }) => ({ title, url }))) : null, tok?.in ?? null, tok?.out ?? null).run();
    if (usage) await logUsage(env, u.id, model, usage, { wallet: overflow });
    await unlimit(env, lock);
    await send({ done: true, tok, ...(await usageStatus(env, u, plan)) });
    await w.close().catch(() => {});
    if (cid && (out || think)) await compact(env, u, cid).catch(e => console.log('compact', e.message)); // ย่อแชตยาวหลังตอบเสร็จ ไม่ทำให้ผู้ใช้รอ
  })());
  return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
  } catch (e) { await unlimit(env, lock); throw e; }
}

// ---------- ลดต้นทุน: เลือกโมเดลอัตโนมัติ + ย่อแชตยาว ----------
const HARD_RE = /```|\b(debug|bug|error|refactor|algorithm|optimi[sz]e|architecture|prove|proof|regex|sql|typescript|python|javascript|react)\b|โค้ด|เขียนโปรแกรม|แก้บั๊ก|วิเคราะห์|พิสูจน์|คำนวณ|สมการ|ออกแบบระบบ|เปรียบเทียบ|กลยุทธ์|แผนธุรกิจ|เรียงความ|รายงาน/i;
// shortcut: แยกง่าย/ยากด้วยกฎ (ไม่เสีย token เพิ่ม) ถ้าอยากแม่นขึ้นค่อยให้โมเดลเล็กช่วยจัดประเภท
async function autoModel(env, planId, { text, images, files, effort, regenerate }) {
  const ms = await allowedModels(env, planId); if (!ms.length) return null;
  const s = await getSettings(env, ['auto_cheap_model', 'auto_strong_model']), by = (a, b) => a.multiplier - b.multiplier;
  const cheap = ms.find(m => m.id === +s.auto_cheap_model) || [...ms].sort(by)[0];
  const strong = ms.find(m => m.id === +s.auto_strong_model) || [...ms].sort(by).at(-1);
  let m = regenerate || images.length || files.length || effort === 'high' || effort === 'max' || text.length > 1200 || HARD_RE.test(text) ? strong : cheap;
  if (images.length && !m.vision) m = ms.find(x => x.vision) || m;
  return m.id;
}
const COMPACT_CHARS = 30000, COMPACT_KEEP = 6;
async function compact(env, u, cid) {
  const c = await env.DB.prepare('SELECT summary,summary_upto FROM chats WHERE id=?').bind(cid).first();
  const rows = (await env.DB.prepare('SELECT id,role,content FROM messages WHERE chat_id=? AND id>? ORDER BY id').bind(cid, c?.summary_upto || 0).all()).results;
  if (rows.length <= COMPACT_KEEP + 2 || rows.reduce((a, r) => a + r.content.length, 0) < COMPACT_CHARS) return;
  const old = rows.slice(0, -COMPACT_KEEP);
  const want = +(await getSetting(env, 'summary_model'));
  const m = (await env.DB.prepare('SELECT * FROM models WHERE active=1 ORDER BY cost_in+cost_out').all()).results.filter(x => env[x.key_name]).find(x => !want || x.id === want);
  if (!m) return;
  const body = (c?.summary ? `Earlier summary:\n${c.summary}\n\n` : '') + old.map(r => `${r.role === 'user' ? 'User' : 'Assistant'}: ${r.content.slice(0, 6000)}`).join('\n\n');
  let summary = '', usage = null;
  for await (const e of callModel(env, m, [{ role: 'user', content: body.slice(-80000) }], { effort: null, maxTokens: 1500,
    system: 'Summarize this conversation so an assistant can continue it. Keep: the user\'s goals and preferences, decisions made, facts, names, numbers, file names, code identifiers and unfinished tasks. Drop small talk and long code (say what it does). Write in the same language as the conversation, at most 350 words, as bullet points.' })) { if (e.t) summary += e.t; if (e.usage) usage = e.usage; }
  if (usage) await logUsage(env, u.id, m, usage, { units: false }); // ต้นทุนของเรา ไม่หักลิมิตผู้ใช้
  if (summary.trim()) await env.DB.prepare('UPDATE chats SET summary=?, summary_upto=? WHERE id=?').bind(summary.trim().slice(0, 6000), old.at(-1).id, cid).run();
}

// ---------- โหมด Code: เครื่องมืออ่าน/ค้นไฟล์ (แบบข้อความ ใช้ได้กับทุกโมเดล) ----------
const TOOL_ROUNDS = 6, READ_MAX = 100e3;
const toolReqs = text => [...text.replace(/```[\s\S]*?```/g, '').matchAll(/^\s*(READ|GREP|LIST)\b[ \t]*(?:path=)?(.*)$/gm)].map(m => ({ op: m[1], arg: m[2].trim().replace(/^`|`$/g, '') })).slice(0, 12);
async function runTools(env, pid, reqs) {
  const files = (await env.DB.prepare('SELECT path,content FROM project_files WHERE project_id=? ORDER BY path').bind(pid).all()).results;
  const out = []; let budget = 200e3;
  for (const { op, arg } of reqs) {
    if (op === 'LIST') { out.push(`[LIST]\n${files.filter(f => f.path.startsWith(arg)).map(f => `${f.path} (${f.content.length} chars)`).join('\n') || '(ว่าง)'}`); continue; }
    if (op === 'READ') {
      const f = files.find(x => x.path === arg);
      if (!f) { out.push(`[READ ${arg}]\n(ไม่พบไฟล์นี้)`); continue; }
      const c = f.content.slice(0, Math.min(READ_MAX, budget)); budget -= c.length;
      out.push(`[READ ${arg}]\n${c}${c.length < f.content.length ? '\n…(ตัดเหลือ ' + c.length + ' ตัวอักษรแรก)' : ''}`); continue;
    }
    let re; try { re = new RegExp(arg, 'i'); } catch { re = { test: l => l.toLowerCase().includes(arg.toLowerCase()) }; }
    const hits = [];
    for (const f of files) { const L = f.content.split('\n'); for (let i = 0; i < L.length && hits.length < 200; i++) if (L[i].length < 2000 && re.test(L[i])) hits.push(`${f.path}:${i + 1}: ${L[i].trim().slice(0, 200)}`); }
    out.push(`[GREP ${arg}]\n${hits.join('\n') || '(ไม่พบ)'}`);
  }
  return out.join('\n\n') + '\n\n[ผลจากเครื่องมือ] ทำงานต่อจากเดิม ถ้าต้องอ่านเพิ่มก็สั่งได้อีก ถ้าพร้อมแล้วให้แก้ไฟล์ด้วยบล็อก path= ได้เลย';
}

// ---------- slip ----------
async function getSetting(env, k) { return (await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(k).first())?.value || ''; }
async function getSettings(env, keys) {
  const rows = (await env.DB.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(() => '?')})`).bind(...keys).all()).results;
  return Object.fromEntries(keys.map(k => [k, rows.find(r => r.key === k)?.value || '']));
}
const r4 = v => Math.round(v * 10000) / 10000;
const promoOn = (m, now = Date.now()) => m.promo_pct > 0 && (!m.promo_start || m.promo_start <= now) && (!m.promo_end || now <= m.promo_end);
// ราคาขาย/1M token: ตั้งเอง หรือ ทุน + markup; base = ก่อนหักโปร
async function priceOf(env, m, base) {
  const mk = +(await getSetting(env, 'price_markup')) || 0, off = !base && promoOn(m) ? 1 - Math.min(m.promo_pct, 100) / 100 : 1;
  const p = (v, c) => r4((v ?? c * (1 + mk / 100)) * off);
  return { in: p(m.price_in, m.cost_in), out: p(m.price_out, m.cost_out), cache: p(m.price_cache, m.cost_cache), write: p(m.price_cache_write, m.cost_cache_write) };
}
async function walletAdd(env, uid, amount, kind, ref) {
  const r = await env.DB.prepare('UPDATE users SET balance=ROUND(balance+?,4) WHERE id=? RETURNING balance').bind(amount, uid).first();
  await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(uid, amount, r?.balance ?? 0, kind, ref ?? null, Date.now()).run();
  return r?.balance;
}
// อีเมล (Resend) และแจ้งเตือนแอดมิน (Discord webhook / LINE Messaging API)
const mailBox = (title, body, btn, link) => `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:28px;background:#000;color:#f5f5f7;border-radius:20px"><h2 style="margin:0 0 12px">${title}</h2><p style="color:#c7c7cc;line-height:1.6">${body}</p>${btn ? `<a href="${link}" style="display:inline-block;margin-top:12px;background:#0071e3;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">${btn}</a>` : ''}<p style="color:#86868b;font-size:12px;margin-top:28px">AstraCode</p></div>`;
async function mail(env, to, subject, html) {
  if (!env.RESEND_KEY || !to || to.endsWith('.local')) return false;
  const from = (await getSetting(env, 'mail_from')) || 'AstraCode <onboarding@resend.dev>';
  try { return (await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.RESEND_KEY }, body: JSON.stringify({ from, to, subject, html }) })).ok; }
  catch { return false; }
}
async function notify(env, text) {
  const s = await getSettings(env, ['alert_discord', 'alert_line_to']), jobs = [];
  if (s.alert_discord) jobs.push(fetch(s.alert_discord, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900) }) }));
  if (env.LINE_ALERT_TOKEN && s.alert_line_to) jobs.push(fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.LINE_ALERT_TOKEN }, body: JSON.stringify({ to: s.alert_line_to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }) }));
  await Promise.allSettled(jobs);
}
async function event(env, kind, model_id, detail) {
  await env.DB.prepare('INSERT INTO events (kind,model_id,detail,created_at) VALUES (?,?,?,?)').bind(kind, model_id ?? null, detail ?? null, Date.now()).run();
  if (kind === 'error') { // แจ้งแอดมินครั้งแรกของแต่ละโมเดลในรอบ 30 นาที
    const n = await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE kind='error' AND model_id IS ? AND created_at>?").bind(model_id ?? null, Date.now() - 1800e3).first();
    if (n.n === 1) await notify(env, `⚠️ AstraCode: โมเดล #${model_id} ตอบไม่ได้\n${String(detail).slice(0, 300)}`);
  }
}
async function audit(env, u, action, detail) {
  await env.DB.prepare('INSERT INTO audit (admin_id,admin_email,action,detail,created_at) VALUES (?,?,?,?,?)').bind(u.id, u.email, action, JSON.stringify(detail ?? null).slice(0, 2000), Date.now()).run();
}
const origin = (req, env) => (env.PUBLIC_URL || '').replace(/\/$/, '') || (viaProxy(req, env) && req.headers.get('x-forwarded-host') ? 'https://' + req.headers.get('x-forwarded-host') : new URL(req.url).origin);
async function newToken(env, uid, kind, ms) { const t = rand(24); await env.DB.prepare('INSERT INTO tokens VALUES (?,?,?,?)').bind(await sha(t), uid, kind, Date.now() + ms).run(); return t; }
async function useToken(env, t, kind) {
  const r = await env.DB.prepare('DELETE FROM tokens WHERE hash=? AND kind=? RETURNING user_id, expires').bind(await sha(String(t || '')), kind).first();
  return r && r.expires > Date.now() ? r.user_id : null;
}
// ตรวจสลิปผ่าน API: เลือกผู้ให้บริการในหลังบ้าน (slip2go / byshop / ไม่ใช้)
// code: ผลแบบ Slip2Go (200200 = ผ่านทุกเงื่อนไข, 200401 บัญชีผู้รับไม่ตรง, 200402 ยอดไม่ตรง, 200500 สลิปปลอม, 200501 สลิปซ้ำ, 200404 ไม่พบ)
const SLIP_FAIL = { '200401': 'บัญชีผู้รับเงินไม่ตรงกับร้าน', '200402': 'ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องจ่าย', '200403': 'วันที่โอนไม่ถูกต้อง', '200500': 'สลิปไม่ถูกต้องหรือเป็นสลิปปลอม', '200501': 'สลิปนี้ถูกใช้ไปแล้ว' };
async function checkSlip(env, buf, type, amount) {
  const s = await getSettings(env, ['slip_provider', 'slip_api_url', 'slip_amount_field', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account']);
  const provider = s.slip_provider || (s.slip_api_url ? 'byshop' : '');
  try {
    if (provider === 'slip2go') {
      if (!s.slip2go_url || !env.SLIP2GO_KEY) return { result: null, amount: null };
      const cond = { checkDuplicate: true, checkAmount: { type: 'eq', amount: String(amount) } };
      if (s.slip2go_receiver_account) cond.checkReceiver = [{ ...(s.slip2go_receiver_type ? { accountType: s.slip2go_receiver_type } : {}), accountNumber: s.slip2go_receiver_account.replace(/[\s-]/g, '') }];
      const r = await fetch(s.slip2go_url.replace(/\/$/, '') + '/api/verify-slip/qr-base64/info', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.SLIP2GO_KEY },
        body: JSON.stringify({ payload: { imageBase64: `data:${type};base64,${b64(buf)}`, checkCondition: cond } }) });
      const d = await r.json().catch(() => ({}));
      return { result: JSON.stringify(d).slice(0, 4000), amount: typeof d.data?.amount === 'number' ? d.data.amount : null, code: String(d.code || r.status), ref: d.data?.transRef || null };
    }
    if (provider === 'byshop') { // shortcut: ส่ง multipart (file + keyapi) และ Bearer ถ้า byshop ใช้รูปแบบอื่นให้แก้ตรงนี้ที่เดียว
      if (!s.slip_api_url || !env.SLIP_API_KEY) return { result: null, amount: null };
      const fd = new FormData(); fd.append('file', new File([buf], 'slip.' + type.split('/')[1], { type })); fd.append('keyapi', env.SLIP_API_KEY);
      const d = await (await fetch(s.slip_api_url, { method: 'POST', headers: { authorization: 'Bearer ' + env.SLIP_API_KEY }, body: fd })).json();
      const a = parseFloat((s.slip_amount_field || 'amount').split('.').reduce((o, k) => o?.[k], d));
      return { result: JSON.stringify(d).slice(0, 4000), amount: isNaN(a) ? null : a };
    }
  } catch (e) { return { result: JSON.stringify({ error: e.message }), amount: null }; }
  return { result: null, amount: null };
}

// ดูชนิดไฟล์จากไบต์จริง ไม่เชื่อชนิดที่เบราว์เซอร์ส่งมา
function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
// คูปอง: percent / fixed = ส่วนลดค่าแพลน, credit = เติมเงินเข้า wallet
async function couponFor(env, u, code, kind) {
  code = String(code || '').trim().toUpperCase(); if (!code) return null;
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE code=? AND active=1').bind(code).first();
  if (!c || (c.expires && c.expires < Date.now()) || (c.max_uses && c.used >= c.max_uses)) throw userErr('คูปองใช้ไม่ได้หรือหมดอายุ');
  if (await env.DB.prepare('SELECT 1 FROM coupon_uses WHERE code=? AND user_id=?').bind(code, u.id).first()) throw userErr('คุณใช้คูปองนี้ไปแล้ว');
  if ((kind === 'credit') !== (c.kind === 'credit')) throw userErr(c.kind === 'credit' ? 'คูปองนี้เป็นเครดิต ใช้ที่หน้า Wallet' : 'คูปองนี้ใช้ลดราคาแพลนเท่านั้น');
  return c;
}
const discountOf = (c, amount) => !c ? 0 : Math.min(amount, Math.round((c.kind === 'percent' ? amount * c.value / 100 : c.value) * 100) / 100);
async function useCoupon(env, code, uid) {
  if (!code) return;
  await env.DB.batch([env.DB.prepare('UPDATE coupons SET used=used+1 WHERE code=?').bind(code), env.DB.prepare('INSERT OR IGNORE INTO coupon_uses VALUES (?,?,?)').bind(code, uid, Date.now())]);
}
// อนุมัติการจ่ายเงิน: เปิด/ต่อแพลน หรือเติม wallet + ให้รางวัลแนะนำเพื่อน
async function applyPayment(env, p) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(p.user_id).first();
  if (p.kind === 'topup') await walletAdd(env, u.id, p.amount, 'topup', 'payment#' + p.id);
  else {
    const days = p.period === 'year' ? 365 : 30;
    const base = u.plan_id === p.plan_id && u.plan_expires > Date.now() ? u.plan_expires : Date.now(); // ต่ออายุแพลนเดิมต่อท้าย
    await env.DB.prepare('UPDATE users SET plan_id=?, plan_expires=?, plan_period=? WHERE id=?').bind(p.plan_id, base + days * DAY, p.period, u.id).run();
  }
  await useCoupon(env, p.coupon, u.id);
  if (u.referred_by && !u.ref_rewarded && !['wallet', 'coupon'].includes(p.slip_key)) { // คนที่ถูกชวนจ่ายเงินจริงครั้งแรก: ได้เครดิตทั้งคู่
    const bonus = +(await getSetting(env, 'referral_bonus')) || 0;
    await env.DB.prepare('UPDATE users SET ref_rewarded=1 WHERE id=?').bind(u.id).run();
    if (bonus > 0) { await walletAdd(env, u.id, bonus, 'referral', 'ref'); await walletAdd(env, u.referred_by, bonus, 'referral', 'user#' + u.id); }
  }
  await mail(env, u.email, 'AstraCode: ชำระเงินสำเร็จ', mailBox('ชำระเงินสำเร็จ', p.kind === 'topup' ? `เติมเงิน ฿${p.amount} เข้า Wallet แล้ว` : 'เปิดแพลนให้แล้ว ใช้งานได้ทันที'));
}
async function pay(req, env, u) {
  const fd = await req.formData(), kind = fd.get('kind') === 'topup' ? 'topup' : 'plan';
  let plan = null, period = 'month', amount, coupon = null, discount = 0;
  if (kind === 'plan') {
    plan = await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1 AND price>0').bind(fd.get('plan_id')).first();
    if (!plan) return err('ไม่พบแพลน');
    period = fd.get('period') === 'year' && plan.price_year ? 'year' : 'month';
    amount = period === 'year' ? plan.price_year : plan.price;
    coupon = await couponFor(env, u, fd.get('coupon'), 'plan');
    discount = discountOf(coupon, amount); amount = Math.round((amount - discount) * 100) / 100;
  } else {
    amount = Math.round(+fd.get('amount') * 100) / 100;
    const min = +(await getSetting(env, 'topup_min')) || 20;
    if (!(amount >= min && amount <= 50000)) return err(`เติมเงินได้ ฿${min} ถึง ฿50,000`);
  }
  if (await limited(env, 'pay:' + u.id, 5, 3600e3)) return err('ส่งสลิปบ่อยเกินไป รอ 1 ชั่วโมง', 429);
  if (kind === 'plan' && fd.get('wallet') === '1' && amount > 0) { // จ่ายด้วยเงินใน Wallet: เปิดแพลนทันที
    const left = await env.DB.prepare('UPDATE users SET balance=ROUND(balance-?,4) WHERE id=? AND balance>=? RETURNING balance').bind(amount, u.id, amount).first(); // ตัดเงินแบบ atomic กันกดซ้ำพร้อมกัน
    if (!left) return err('ยอดเงินใน Wallet ไม่พอ');
    await env.DB.prepare('INSERT INTO wallet_tx (user_id,amount,balance_after,kind,ref,created_at) VALUES (?,?,?,?,?,?)').bind(u.id, -amount, left.balance, 'plan', plan.name, Date.now()).run();
    const p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?,?,?) RETURNING *")
      .bind(u.id, plan.id, amount, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
    await applyPayment(env, p);
    return json({ ok: true, approved: true, id: p.id });
  }
  if (await env.DB.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").bind(u.id).first()) return err('มีคำขอที่รออนุมัติอยู่แล้ว');
  if (amount <= 0) { // คูปองลด 100%: เปิดแพลนทันที ไม่ต้องใช้สลิป
    const p = await env.DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,coupon,discount,created_at,approved_at) VALUES (?,?,0,'coupon','approved',?,?,?,?,?,?) RETURNING *")
      .bind(u.id, plan.id, kind, period, coupon?.code || null, discount, Date.now(), Date.now()).first();
    await applyPayment(env, p);
    return json({ ok: true, approved: true, id: p.id });
  }
  const file = fd.get('slip');
  if (!(file instanceof File) || file.size > 5e6) return err('อัปโหลดรูปสลิป (ไม่เกิน 5MB)');
  const buf = await file.arrayBuffer();
  const type = imageType(new Uint8Array(buf, 0, Math.min(12, buf.byteLength)));
  if (!type) return err('รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
  const key = 'slip/' + hex(await crypto.subtle.digest('SHA-256', buf));
  if (await env.DB.prepare('SELECT 1 FROM payments WHERE slip_key=?').bind(key).first()) return err('สลิปนี้ถูกใช้แล้ว');
  await env.SLIPS.put(key, buf, { httpMetadata: { contentType: type } });
  const c = await checkSlip(env, buf, type, amount);
  if (c.ref && await env.DB.prepare("SELECT 1 FROM payments WHERE slip_ref=? AND status<>'rejected'").bind(c.ref).first()) c.code = '200501'; // เลขอ้างอิงธนาคารซ้ำในระบบเรา
  const fail = SLIP_FAIL[c.code];
  // ผ่านทุกเงื่อนไข (หรือพบสลิปและยอดตรง) และเปิดอนุมัติอัตโนมัติ: เปิดแพลน/เติมเงินทันที
  const pass = !fail && (c.code === '200200' || (c.code === '200000' && c.amount === amount)) && (await getSetting(env, 'slip_auto_approve')) !== '0';
  const now = Date.now(), what = kind === 'topup' ? 'เติม Wallet' : plan.name + (period === 'year' ? ' รายปี' : '');
  const p = await env.DB.prepare('INSERT INTO payments (user_id,plan_id,amount,slip_key,slip_check,slip_amount,slip_ref,status,approved_at,created_at,kind,period,coupon,discount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *')
    .bind(u.id, plan?.id || 0, amount, key, c.result, c.amount, c.ref || null, fail ? 'rejected' : pass ? 'approved' : 'pending', pass ? now : null, now, kind, period, fail ? null : coupon?.code || null, discount).first();
  if (fail) { await notify(env, `⛔ สลิปไม่ผ่าน ฿${amount} จาก ${u.email} (${what}): ${fail}`); return err(fail + ' ถ้าคิดว่าผิดพลาด ติดต่อเราที่หน้า "ติดต่อเรา"'); }
  if (pass) { await applyPayment(env, p); await notify(env, `✅ อนุมัติอัตโนมัติ ฿${amount} จาก ${u.email} (${what})`); return json({ ok: true, approved: true, id: p.id }); }
  await notify(env, `💳 สลิปใหม่ ฿${amount} จาก ${u.email} (${what})${c.amount != null ? ` · API อ่านยอดได้ ฿${c.amount}` : ''}${c.code ? ` · code ${c.code}` : ''}`);
  return json({ ok: true });
}

// ---------- projects (โหมด Code) ----------
const PATH_RE = /^(?!.*\.\.)(?!.*\/\/)(?!.*\/$)[^\/\\\x00-\x1f<>:"|?*][^\\\x00-\x1f<>:"|?*]{0,199}$/;
const FILE_LIMIT = 500e3, PROJECT_LIMIT = 5e6, FILES_PER_PROJECT = 300, PROJECTS_PER_USER = 20;
const STARTER = {
  'index.html': '<!DOCTYPE html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>โปรเจกต์ใหม่</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>สวัสดี AstraCode</h1>\n  <button id="btn">กดเลย</button>\n  <script src="script.js"></script>\n</body>\n</html>\n',
  'style.css': 'body {\n  font-family: system-ui, sans-serif;\n  background: #111;\n  color: #f5f5f7;\n  padding: 24px;\n}\nbutton {\n  padding: 10px 20px;\n  border-radius: 999px;\n  border: 0;\n  background: #0071e3;\n  color: #fff;\n}\n',
  'script.js': "document.getElementById('btn').onclick = () => {\n  console.log('กดปุ่มแล้ว');\n  alert('ทำงานแล้ว!');\n};\n",
  'main.py': 'def greet(name):\n    return f"สวัสดี {name}"\n\nprint(greet("AstraCode"))\n',
};
// เก็บเวอร์ชันเก่าของไฟล์ก่อนถูกเขียนทับ (แก้เอง: ทุก 5 นาที, AI/อัปโหลด/Git: ทุกครั้ง) เก็บล่าสุด 30 เวอร์ชันต่อไฟล์
async function snapshot(env, pid, files, source) {
  const DB = env.DB, now = Date.now(), ops = [];
  for (const f of files) {
    const cur = await DB.prepare('SELECT content FROM project_files WHERE project_id=? AND path=?').bind(pid, f.path).first();
    if (!cur || cur.content === f.content) continue;
    if (source === 'edit') { const last = await DB.prepare('SELECT created_at FROM file_versions WHERE project_id=? AND path=? ORDER BY id DESC LIMIT 1').bind(pid, f.path).first(); if (last && now - last.created_at < 300e3) continue; }
    ops.push(DB.prepare('INSERT INTO file_versions (project_id,path,content,source,created_at) VALUES (?,?,?,?,?)').bind(pid, f.path, cur.content, source, now),
      DB.prepare('DELETE FROM file_versions WHERE project_id=?1 AND path=?2 AND id NOT IN (SELECT id FROM file_versions WHERE project_id=?1 AND path=?2 ORDER BY id DESC LIMIT 30)').bind(pid, f.path));
  }
  for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
}
async function projects(req, env, u, path, url) {
  const DB = env.DB, M = req.method, now = Date.now();
  if (path === '/api/projects') {
    if (M === 'GET') return json((await DB.prepare(`SELECT p.id,p.name,p.updated_at,COUNT(f.path) files,COALESCE(SUM(length(f.content)),0) size
      FROM projects p LEFT JOIN project_files f ON f.project_id=p.id WHERE p.user_id=? GROUP BY p.id ORDER BY p.updated_at DESC`).bind(u.id).all()).results);
    if (M === 'POST') {
      const b = await req.json(), name = String(b.name || '').trim().slice(0, 60);
      if (!name) return err('ตั้งชื่อโปรเจกต์ก่อน');
      if ((await DB.prepare('SELECT COUNT(*) n FROM projects WHERE user_id=?').bind(u.id).first()).n >= PROJECTS_PER_USER) return err(`สร้างได้สูงสุด ${PROJECTS_PER_USER} โปรเจกต์`);
      const id = (await DB.prepare('INSERT INTO projects (user_id,name,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').bind(u.id, name, now, now).first()).id;
      if (!b.empty) await DB.batch(Object.entries(STARTER).map(([p, c]) => DB.prepare('INSERT INTO project_files VALUES (?,?,?,?)').bind(id, p, c, now)));
      return json({ ok: true, id });
    }
  }
  const r = path.match(/^\/api\/projects\/(\d+)(\/[a-z]+(?:\/[a-z0-9]+)?)?$/);
  if (!r) return err('not found', 404);
  const pid = +r[1], sub = r[2] || '';
  const p = await DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(pid, u.id).first();
  if (!p) return err('ไม่พบโปรเจกต์', 404);
  const touch = DB.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now, pid);
  if (sub.startsWith('/github')) return github(req, env, u, p, sub, now);
  // ตรวจขนาดรวมและจำนวนไฟล์ หลังเขียนไฟล์ชุดนี้
  const fits = async files => {
    const cur = (await DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=?').bind(pid).all()).results;
    const sizes = new Map(cur.map(x => [x.path, x.n]));
    for (const f of files) sizes.set(f.path, f.content.length);
    if (sizes.size > FILES_PER_PROJECT) return `ไฟล์เกิน ${FILES_PER_PROJECT} ไฟล์ต่อโปรเจกต์`;
    if ([...sizes.values()].reduce((a, b) => a + b, 0) > PROJECT_LIMIT) return 'โปรเจกต์ใหญ่เกิน 5MB';
    return null;
  };
  const valid = f => typeof f?.path === 'string' && PATH_RE.test(f.path) && typeof f.content === 'string' && f.content.length <= FILE_LIMIT;

  if (!sub) {
    if (M === 'GET') return json({ id: p.id, name: p.name, gh: p.gh_repo ? { repo: p.gh_repo, branch: p.gh_branch, synced: p.gh_sha } : null, files: (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=? ORDER BY path').bind(pid).all()).results });
    if (M === 'PUT') {
      const name = String((await req.json()).name || '').trim().slice(0, 60);
      if (!name) return err('ชื่อว่าง');
      await DB.prepare('UPDATE projects SET name=?, updated_at=? WHERE id=?').bind(name, now, pid).run();
      return json({ ok: true });
    }
    if (M === 'DELETE') {
      await DB.batch([
        DB.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE project_id=? AND user_id=?)').bind(pid, u.id),
        DB.prepare('DELETE FROM chats WHERE project_id=? AND user_id=?').bind(pid, u.id),
        DB.prepare('DELETE FROM project_files WHERE project_id=?').bind(pid),
        DB.prepare('DELETE FROM projects WHERE id=?').bind(pid),
      ]);
      return json({ ok: true });
    }
  }
  if (sub === '/file') {
    if (M === 'PUT') {
      const f = await req.json();
      if (!valid(f)) return err('ชื่อไฟล์ไม่ถูกต้อง หรือไฟล์ใหญ่เกิน 500KB');
      const no = await fits([f]); if (no) return err(no);
      await snapshot(env, pid, [f], 'edit');
      await DB.batch([DB.prepare('INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at').bind(pid, f.path, f.content, now), touch]);
      return json({ ok: true });
    }
    if (M === 'DELETE') { // path ลงท้าย / = ลบทั้งโฟลเดอร์
      const fp = url.searchParams.get('path') || '';
      await DB.batch([fp.endsWith('/') ? DB.prepare('DELETE FROM project_files WHERE project_id=? AND substr(path,1,?)=?').bind(pid, fp.length, fp)
        : DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(pid, fp), touch]);
      return json({ ok: true });
    }
  }
  if (sub === '/rename' && M === 'POST') { // เปลี่ยนชื่อไฟล์ หรือโฟลเดอร์ (ลงท้าย /)
    const { from, to } = await req.json();
    if (typeof from !== 'string' || typeof to !== 'string' || !from || !PATH_RE.test(to.replace(/\/$/, ''))) return err('ชื่อไม่ถูกต้อง');
    const rows = (await DB.prepare('SELECT path FROM project_files WHERE project_id=?').bind(pid).all()).results.map(x => x.path);
    const moves = rows.filter(x => from.endsWith('/') ? x.startsWith(from) : x === from).map(x => [x, from.endsWith('/') ? to.replace(/\/?$/, '/') + x.slice(from.length) : to]);
    if (!moves.length) return err('ไม่พบไฟล์', 404);
    if (moves.some(([, n]) => rows.includes(n) && !moves.some(([o]) => o === n))) return err('มีไฟล์ชื่อนี้อยู่แล้ว');
    await DB.batch([...moves.map(([o, n]) => DB.prepare('UPDATE project_files SET path=?, updated_at=? WHERE project_id=? AND path=?').bind(n, now, pid, o)), touch]);
    return json({ ok: true });
  }
  if (sub === '/versions') return json((await DB.prepare('SELECT id,source,created_at,length(content) size FROM file_versions WHERE project_id=? AND path=? ORDER BY id DESC').bind(pid, url.searchParams.get('path') || '').all()).results);
  if (sub.startsWith('/versions/')) {
    const v = await DB.prepare('SELECT * FROM file_versions WHERE id=? AND project_id=?').bind(+sub.split('/')[2], pid).first();
    return v ? json(v) : err('ไม่พบเวอร์ชัน', 404);
  }
  if (sub === '/import' && M === 'POST') { // อัปโหลดหลายไฟล์ / zip
    const files = (await req.json()).files;
    if (!Array.isArray(files) || !files.length || !files.every(valid)) return err('ไฟล์ไม่ถูกต้อง (ชื่อไฟล์ หรือไฟล์ใหญ่เกิน 500KB)');
    const no = await fits(files); if (no) return err(no);
    await snapshot(env, pid, files, 'import');
    await DB.batch([...files.map(f => DB.prepare('INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at').bind(pid, f.path, f.content, now)), touch]);
    return json({ ok: true, count: files.length });
  }
  return err('not found', 404);
}

// ---------- GitHub (โหมด Code) ----------
// token ของผู้ใช้เข้ารหัส AES-GCM ด้วย SECRET_KEY ก่อนเก็บ ไม่เคยส่งกลับไปที่หน้าเว็บ
let GH = 'https://api.github.com'; const GH_IGNORE = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.next|\.venv)(\/|$)/;
const b64 = u => { let s = ''; for (const x of new Uint8Array(u)) s += String.fromCharCode(x); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function sealKey(env) {
  if (!env.SECRET_KEY) throw userErr('แอดมินยังไม่ได้ตั้ง SECRET_KEY ใน Worker');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SECRET_KEY)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return b64(iv) + '.' + b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), new TextEncoder().encode(text))); }
async function unseal(env, s) { const [iv, c] = s.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealKey(env), unb64(c))); }
const ghErr = (st, d) => st === 401 ? 'GitHub token ใช้ไม่ได้หรือหมดอายุ เชื่อมต่อใหม่'
  : st === 403 ? 'token ไม่มีสิทธิ์ (ต้องการ Contents: Read and write) หรือใช้ GitHub บ่อยเกินไป รอสักครู่'
  : st === 404 ? 'ไม่พบ repo หรือ branch (หรือ token เข้าถึง repo นี้ไม่ได้)'
  : st === 409 ? 'repo ยังว่างอยู่ ให้สร้างไฟล์แรก (เช่น README) บน GitHub ก่อน'
  : 'GitHub ตอบกลับ ' + st + (d?.message ? ': ' + d.message : '');
async function gh(token, path, opt = {}) {
  const r = await fetch(GH + path, { method: opt.method || 'GET', body: opt.body && JSON.stringify(opt.body),
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'AstraCode', ...(opt.body ? { 'content-type': 'application/json' } : {}) } })
    .catch(() => { throw userErr('เชื่อมต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง', 502); });
  if (opt.raw) { if (!r.ok) throw userErr(ghErr(r.status)); return r; }
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw userErr(ghErr(r.status, d), [404, 409].includes(r.status) ? r.status : 400);
  return d;
}
// sha แบบเดียวกับ git (blob) ใช้เทียบว่าไฟล์ไหนเปลี่ยน
async function blobSha(text) {
  const b = new TextEncoder().encode(text), h = new TextEncoder().encode(`blob ${b.length}\0`), all = new Uint8Array(h.length + b.length);
  all.set(h); all.set(b, h.length); return hex(await crypto.subtle.digest('SHA-1', all));
}
const shaMap = async files => new Map(await Promise.all(files.map(async f => [f.path, await blobSha(f.content)])));
// อ่าน zip ที่ GitHub ส่งมา (ไฟล์แบบ stored / deflate)
async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw userErr('ไฟล์ zip จาก GitHub เสีย');
  const out = []; let p = v.getUint32(e + 16, true);
  for (let i = v.getUint16(e + 10, true); i > 0; i--) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), lo = v.getUint32(p + 42, true), name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (name.endsWith('/')) continue;
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    out.push({ name, method, usize, data: u8.subarray(start, start + size) });
  }
  return out;
}
async function inflate(z) { return z.method === 0 ? z.data : new Uint8Array(await new Response(new Blob([z.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
// ดึงไฟล์ข้อความทั้งหมดของ repo ที่ commit นั้น (ข้ามไฟล์ไบนารี รูป และไฟล์ใหญ่)
async function remoteFiles(token, repo, sha) {
  const buf = await (await gh(token, `/repos/${repo}/zipball/${sha}`, { raw: true })).arrayBuffer();
  if (buf.byteLength > 30e6) throw userErr('repo ใหญ่เกิน 30MB');
  const files = new Map(), skipped = [];
  for (const z of await unzip(buf)) {
    const path = z.name.split('/').slice(1).join('/'); // ตัดโฟลเดอร์ owner-repo-sha/ ที่ GitHub ครอบไว้
    if (!path || GH_IGNORE.test(path)) continue;
    if (z.usize > FILE_LIMIT || !PATH_RE.test(path)) { skipped.push(path); continue; }
    const bytes = await inflate(z);
    if (bytes.subarray(0, 8000).includes(0)) { skipped.push(path); continue; }
    try { files.set(path, new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { skipped.push(path); }
  }
  return { files, skipped };
}
async function github(req, env, u, p, sub, now) {
  const DB = env.DB, M = req.method;
  if (env.GITHUB_API) GH = env.GITHUB_API; // ใช้ทดสอบกับ GitHub จำลองเท่านั้น
  const tok = u.gh_token && await unseal(env, u.gh_token).catch(() => null);
  if (!tok) return err('ยังไม่ได้เชื่อม GitHub', 400);
  const head = async () => (await gh(tok, `/repos/${p.gh_repo}/git/ref/heads/${encodeURIComponent(p.gh_branch)}`)).object.sha;
  const local = async () => (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(p.id).all()).results;
  const save = (sha, synced) => DB.prepare('UPDATE projects SET gh_sha=?, gh_synced=?, updated_at=? WHERE id=?').bind(sha, JSON.stringify(Object.fromEntries(synced)), now, p.id).run();

  if (sub === '/github') {
    if (M === 'DELETE') { await DB.prepare('UPDATE projects SET gh_repo=NULL, gh_branch=NULL, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(p.id).run(); return json({ ok: true }); }
    const b = await req.json(), repo = String(b.repo || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/$/g, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return err('ใส่ repo แบบ owner/repo');
    const info = await gh(tok, `/repos/${repo}`), branch = String(b.branch || '').trim() || info.default_branch;
    await gh(tok, `/repos/${repo}/branches/${encodeURIComponent(branch)}`);
    await DB.prepare('UPDATE projects SET gh_repo=?, gh_branch=?, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(info.full_name, branch, p.id).run();
    return json({ ok: true, repo: info.full_name, branch, push: !!info.permissions?.push });
  }
  if (!p.gh_repo) return err('โปรเจกต์นี้ยังไม่ได้เชื่อม repo');
  const synced = new Map(Object.entries(JSON.parse(p.gh_synced || '{}')));

  if (sub === '/github/status') { // เทียบไฟล์ในเครื่องกับครั้งล่าสุดที่ sync และดูว่า GitHub มีคอมมิตใหม่ไหม
    const h = await head(), mine = await shaMap(await local());
    const added = [...mine.keys()].filter(k => !synced.has(k)), modified = [...mine].filter(([k, v]) => synced.has(k) && synced.get(k) !== v).map(([k]) => k);
    const deleted = [...synced.keys()].filter(k => !mine.has(k));
    let behind = 0, remote = [];
    if (p.gh_sha && h !== p.gh_sha) { const c = await gh(tok, `/repos/${p.gh_repo}/compare/${p.gh_sha}...${h}`); behind = c.ahead_by; remote = (c.files || []).slice(0, 50).map(f => ({ path: f.filename, status: f.status })); }
    return json({ repo: p.gh_repo, branch: p.gh_branch, head: h, synced: p.gh_sha, never: !p.gh_sha, behind, remote, local: { added, modified, deleted } });
  }
  if (sub === '/github/pull' && M === 'POST') { // รวมแบบ 3 ทาง ทีละไฟล์: ของเรา / GitHub / ครั้งล่าสุดที่ sync
    const keep = (await req.json()).resolve; // 'remote' | 'local' เมื่อชนกัน
    const h = await head(), { files: remote, skipped } = await remoteFiles(tok, p.gh_repo, h), mineRows = await local();
    const mine = await shaMap(mineRows), theirs = new Map(await Promise.all([...remote].map(async ([k, v]) => [k, await blobSha(v)])));
    const writes = [], dels = [], conflicts = [];
    for (const k of new Set([...mine.keys(), ...theirs.keys(), ...synced.keys()])) {
      const L = mine.get(k), R = theirs.get(k), B = synced.get(k);
      if (L === R) continue;
      const take = L === B ? 'remote' : R === B ? 'local' : (conflicts.push(k), keep);
      if (take === 'remote') R ? writes.push({ path: k, content: remote.get(k) }) : dels.push(k);
    }
    if (conflicts.length && !keep) return json({ error: 'ไฟล์ถูกแก้ทั้งในนี้และบน GitHub', conflicts }, 409);
    const size = new Map(mineRows.map(f => [f.path, f.content.length]));
    for (const f of writes) size.set(f.path, f.content.length); for (const k of dels) size.delete(k);
    if (size.size > FILES_PER_PROJECT || [...size.values()].reduce((a, b) => a + b, 0) > PROJECT_LIMIT) return err('repo ใหญ่เกินขีดจำกัดโปรเจกต์ (300 ไฟล์ / 5MB)');
    const put = 'INSERT INTO project_files VALUES (?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at';
    await snapshot(env, p.id, writes, 'git');
    const ops = [...writes.map(f => DB.prepare(put).bind(p.id, f.path, f.content, now)), ...dels.map(k => DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(p.id, k))];
    for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
    await save(h, theirs);
    return json({ ok: true, head: h, updated: writes.map(f => f.path), deleted: dels, conflicts, skipped: skipped.slice(0, 30), skippedCount: skipped.length });
  }
  if (sub === '/github/branches') {
    const list = await gh(tok, `/repos/${p.gh_repo}/branches?per_page=100`), info = await gh(tok, `/repos/${p.gh_repo}`);
    return json({ current: p.gh_branch, default: info.default_branch, branches: list.map(x => x.name) });
  }
  if (sub === '/github/switch' && M === 'POST') { // เปลี่ยน branch: ต้อง Pull ใหม่
    const br = String((await req.json()).branch || '');
    await gh(tok, `/repos/${p.gh_repo}/branches/${encodeURIComponent(br)}`);
    await DB.prepare('UPDATE projects SET gh_branch=?, gh_sha=NULL, gh_synced=NULL WHERE id=?').bind(br, p.id).run();
    return json({ ok: true, branch: br });
  }
  if (sub === '/github/branch' && M === 'POST') { // สร้าง branch ใหม่จากคอมมิตที่ sync ล่าสุด แล้วย้ายไปใช้ branch นั้น
    const name = String((await req.json()).name || '').trim();
    if (!/^[\w.\-/]{1,100}$/.test(name) || name.includes('..')) return err('ชื่อ branch ใช้ได้เฉพาะ a-z 0-9 - _ . /');
    if (!p.gh_sha) return err('กด Pull ก่อน แล้วค่อยสร้าง branch', 409);
    await gh(tok, `/repos/${p.gh_repo}/git/refs`, { method: 'POST', body: { ref: 'refs/heads/' + name, sha: p.gh_sha } });
    await DB.prepare('UPDATE projects SET gh_branch=? WHERE id=?').bind(name, p.id).run(); // คอมมิตเดียวกัน จึงไม่ต้อง pull ใหม่
    return json({ ok: true, branch: name });
  }
  if (sub === '/github/pr' && M === 'POST') {
    const b = await req.json(), info = await gh(tok, `/repos/${p.gh_repo}`), base = String(b.base || info.default_branch);
    if (base === p.gh_branch) return err('branch ต้นทางกับปลายทางเป็นอันเดียวกัน สร้าง branch ใหม่ก่อน');
    const pr = await gh(tok, `/repos/${p.gh_repo}/pulls`, { method: 'POST', body: { title: String(b.title || 'อัปเดตจาก AstraCode').slice(0, 200), body: String(b.body || '').slice(0, 5000), head: p.gh_branch, base } });
    return json({ ok: true, url: pr.html_url, number: pr.number });
  }
  if (sub === '/github/push' && M === 'POST') {
    const message = String((await req.json()).message || '').trim().slice(0, 500) || 'อัปเดตจาก AstraCode';
    const h = await head();
    if (!p.gh_sha) return err('กด Pull ก่อน push ครั้งแรก เพื่อรวมไฟล์กับ GitHub', 409);
    if (h !== p.gh_sha) return err('GitHub มีคอมมิตใหม่ กด Pull ก่อนแล้วค่อย Push', 409);
    const rows = await local(), mine = await shaMap(rows), text = new Map(rows.map(f => [f.path, f.content]));
    const tree = [...[...mine].filter(([k, v]) => synced.get(k) !== v).map(([k]) => ({ path: k, mode: '100644', type: 'blob', content: text.get(k) })),
      ...[...synced.keys()].filter(k => !mine.has(k)).map(k => ({ path: k, mode: '100644', type: 'blob', sha: null }))];
    if (!tree.length) return json({ ok: true, nothing: true });
    const base = await gh(tok, `/repos/${p.gh_repo}/git/commits/${h}`);
    const t = await gh(tok, `/repos/${p.gh_repo}/git/trees`, { method: 'POST', body: { base_tree: base.tree.sha, tree } });
    const c = await gh(tok, `/repos/${p.gh_repo}/git/commits`, { method: 'POST', body: { message, tree: t.sha, parents: [h] } });
    await gh(tok, `/repos/${p.gh_repo}/git/refs/heads/${encodeURIComponent(p.gh_branch)}`, { method: 'PATCH', body: { sha: c.sha } });
    await save(c.sha, mine);
    return json({ ok: true, commit: c.sha, url: c.html_url, files: tree.length });
  }
  return err('not found', 404);
}

// ---------- admin ----------
const TABLES = {
  plans: ['name', 'price', 'price_year', 'limit_4h', 'limit_week', 'description', 'sort', 'active'],
  models: ['name', 'provider', 'api_model', 'base_url', 'key_name', 'multiplier', 'cost_in', 'cost_out', 'cost_cache', 'cost_cache_write', 'price_in', 'price_out', 'price_cache', 'price_cache_write', 'promo_pct', 'promo_start', 'promo_end', 'code_prompt', 'public', 'note', 'fallback_id', 'vision', 'effort', 'sort', 'active'],
  posts: ['slug', 'title', 'summary', 'body', 'cover', 'published'],
};
const SETTINGS = ['promptpay_id', 'slip_provider', 'slip_auto_approve', 'slip2go_url', 'slip2go_receiver_type', 'slip2go_receiver_account', 'slip_api_url', 'slip_amount_field', 'featured_plan', 'price_markup', 'price_note', 'referral_bonus', 'announcement', 'announcement_level', 'maintenance',
  'alert_discord', 'alert_line_to', 'cost_alert_daily', 'mail_from', 'search_enabled', 'image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_units', 'image_cost',
  'autocomplete_model', 'auto_cheap_model', 'auto_strong_model', 'summary_model', 'business_name', 'business_address', 'business_tax_id', 'topup_min'];

async function admin(req, env, path, url, me) {
  const M = req.method, DB = env.DB;
  const ctxAudit = M === 'GET' ? async () => {} : (action, detail) => audit(env, me, action, detail); // บันทึกทุกการแก้ไขของแอดมิน
  let r;
  if ((r = path.match(/^\/api\/admin\/(plans|models|posts)(?:\/(\d+))?$/))) {
    const [, t, id] = r, cols = TABLES[t];
    if (M === 'GET') {
      const rows = (await DB.prepare(`SELECT * FROM ${t} ORDER BY ${t === 'posts' ? 'id DESC' : 'sort,id'}`).all()).results;
      if (t === 'plans') { const pm = (await DB.prepare('SELECT * FROM plan_models').all()).results; rows.forEach(p => p.model_ids = pm.filter(x => x.plan_id === p.id).map(x => x.model_id)); }
      else if (t === 'models') rows.forEach(m => m.has_key = !!env[m.key_name]);
      return json(rows);
    }
    if (M === 'DELETE' && id) {
      await ctxAudit('delete ' + t, { id });
      await DB.prepare(`DELETE FROM ${t} WHERE id=?`).bind(id).run();
      if (t !== 'posts') await DB.prepare(`DELETE FROM plan_models WHERE ${t === 'plans' ? 'plan_id' : 'model_id'}=?`).bind(id).run();
      return json({ ok: true });
    }
    const b = await req.json(), vals = cols.map(c => b[c] ?? null);
    if (t === 'posts' && !/^[a-z0-9-]{1,80}$/.test(b.slug || '')) return err('slug ใช้ได้เฉพาะ a-z 0-9 และ -');
    if (t === 'models' && b.promo_pct != null && !(b.promo_pct >= 0 && b.promo_pct <= 100)) return err('โปรลดราคาต้องอยู่ระหว่าง 0–100%');
    if (t === 'models' && b.promo_start && b.promo_end && b.promo_end < b.promo_start) return err('วันจบโปรต้องอยู่หลังวันเริ่ม');
    await ctxAudit((M === 'POST' ? 'create ' : 'update ') + t, { id, name: b.name || b.title });
    let pid = id;
    if (M === 'POST') pid = (t === 'posts' ? await DB.prepare(`INSERT INTO posts (${cols},created_at) VALUES (${cols.map(() => '?')},?) RETURNING id`).bind(...vals, Date.now()).first()
      : await DB.prepare(`INSERT INTO ${t} (${cols}) VALUES (${cols.map(() => '?')}) RETURNING id`).bind(...vals).first()).id;
    else if (M === 'PUT' && id) await DB.prepare(`UPDATE ${t} SET ${cols.map(c => c + '=?')} WHERE id=?`).bind(...vals, id).run();
    else return err('bad request');
    if (t === 'plans' && Array.isArray(b.model_ids)) await DB.batch([
      DB.prepare('DELETE FROM plan_models WHERE plan_id=?').bind(pid),
      ...b.model_ids.map(mid => DB.prepare('INSERT INTO plan_models VALUES (?,?)').bind(pid, mid)),
    ]);
    return json({ ok: true, id: pid });
  }
  if (path === '/api/admin/payments') return json((await DB.prepare(
    'SELECT p.*,u.email,CASE WHEN p.kind=\'topup\' THEN \'เติม Wallet\' ELSE pl.name || CASE WHEN p.period=\'year\' THEN \' (รายปี)\' ELSE \'\' END END plan_name FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id ORDER BY p.status=\'pending\' DESC, p.id DESC LIMIT 200').all()).results);
  if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/)) && M === 'POST') {
    const p = await DB.prepare("SELECT * FROM payments WHERE id=? AND status='pending'").bind(r[1]).first();
    if (!p) return err('ไม่พบคำขอที่รออนุมัติ', 404);
    const upd = await DB.prepare("UPDATE payments SET status=?, approved_at=? WHERE id=? AND status='pending'").bind(r[2] === 'approve' ? 'approved' : 'rejected', Date.now(), p.id).run();
    if (!upd.meta.changes) return err('คำขอนี้ถูกจัดการไปแล้ว', 409); // กันกดอนุมัติซ้ำพร้อมกัน
    await ctxAudit(r[2] + ' payment', { id: p.id, amount: p.amount, user: p.user_id });
    if (r[2] === 'approve') await applyPayment(env, p);
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
    return json((await DB.prepare(`SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,p.name plan_name,
      (SELECT MAX(created_at) FROM usage WHERE user_id=u.id) last_active,
      (SELECT COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) FROM usage WHERE user_id=u.id AND created_at>?2) tok30
      FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.email LIKE ?1 ORDER BY u.id DESC LIMIT 100`).bind(q, Date.now() - 30 * DAY).all()).results);
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'PUT') {
    const b = await req.json();
    await ctxAudit('update user', { id: +r[1], ...b });
    if (b.credit) { const v = Math.round(+b.credit * 100) / 100; if (!v) return err('จำนวนเงินไม่ถูกต้อง'); await walletAdd(env, +r[1], v, 'admin', String(b.note || '').slice(0, 100) || null); }
    if (b.logout) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run(); // รหัสผ่านอยู่ใน Firebase ผู้ใช้รีเซ็ตเองที่หน้าเข้าสู่ระบบ
    if (b.reset_usage) await DB.prepare('UPDATE users SET usage_reset_at=? WHERE id=?').bind(Date.now(), r[1]).run();
    if ('banned' in b) await DB.prepare('UPDATE users SET banned=? WHERE id=?').bind(b.banned ? 1 : 0, r[1]).run();
    if ('plan_id' in b) await DB.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').bind(b.plan_id || null, b.plan_id ? Date.now() + (b.days || 30) * DAY : null, r[1]).run();
    if (b.banned) await DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r[1]).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/stats') { // ช่วงเวลาปัจจุบันเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30));
    const now = Date.now(), today = Math.floor((now + BKK) / DAY), from = (today - days + 1) * DAY - BKK, prev = from - days * DAY;
    const dayOf = col => `CAST((${col}+${BKK})/${DAY} AS INTEGER)`;
    const [use, pays, regs, cur, old, models, top, users, pending] = await Promise.all([
      DB.prepare(`SELECT ${dayOf('created_at')} d, SUM(tokens_in) tin, SUM(tokens_out) tout, SUM(tokens_cache) tc, SUM(cost) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au FROM usage WHERE created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT ${dayOf('created_at')} d, SUM(amount) rev FROM payments WHERE status='approved' AND created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT ${dayOf('created_at')} d, COUNT(*) n FROM users WHERE created_at>=? GROUP BY d`).bind(from).all(),
      DB.prepare(`SELECT (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved' AND created_at>=?1) rev, COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1`).bind(from).first(),
      DB.prepare(`SELECT (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='approved' AND created_at>=?1 AND created_at<?2) rev, COALESCE(SUM(cost),0) cost, COUNT(*) msgs, COUNT(DISTINCT user_id) au, COALESCE(SUM(tokens_in+tokens_out+tokens_cache),0) tok FROM usage WHERE created_at>=?1 AND created_at<?2`).bind(prev, from).first(),
      DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(u.tokens_in) tin, SUM(u.tokens_out) tout, SUM(u.tokens_cache) tc, SUM(u.cost) cost FROM usage u JOIN models m ON m.id=u.model_id WHERE u.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(from).all(),
      DB.prepare('SELECT us.id, us.email, p.name plan, COUNT(*) msgs, SUM(u.tokens_in+u.tokens_out+u.tokens_cache) tok, SUM(u.cost) cost FROM usage u JOIN users us ON us.id=u.user_id LEFT JOIN plans p ON p.id=us.plan_id AND us.plan_expires>? WHERE u.created_at>=? GROUP BY us.id ORDER BY cost DESC LIMIT 10').bind(now, from).all(),
      DB.prepare('SELECT COUNT(*) total, COALESCE(SUM(plan_id IS NOT NULL AND plan_expires>?),0) paid FROM users').bind(now).first(),
      DB.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").first(),
    ]);
    const U = new Map(use.results.map(r => [r.d, r])), P = new Map(pays.results.map(r => [r.d, r.rev])), R = new Map(regs.results.map(r => [r.d, r.n]));
    const daily = Array.from({ length: days }, (_, i) => {
      const d = today - days + 1 + i, u = U.get(d) || {};
      return { day: d * DAY, tin: u.tin || 0, tout: u.tout || 0, tc: u.tc || 0, cost: u.cost || 0, msgs: u.msgs || 0, au: u.au || 0, rev: P.get(d) || 0, reg: R.get(d) || 0 };
    });
    return json({ days, cur, prev: old, daily, models: models.results, top: top.results, users, pending: pending.n });
  }
  if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'GET') { // รายละเอียดผู้ใช้ 30 วันล่าสุด
    const u = await DB.prepare('SELECT u.id,u.email,u.role,u.plan_id,u.plan_expires,u.banned,u.created_at,u.usage_reset_at,u.balance,u.email_verified,u.totp_on,u.google_id,u.line_id,u.plan_period,p.name plan_name FROM users u LEFT JOIN plans p ON p.id=u.plan_id WHERE u.id=?').bind(r[1]).first();
    if (!u) return err('ไม่พบผู้ใช้', 404);
    const since = Date.now() - 30 * DAY;
    const [models, pays, chats] = await Promise.all([
      DB.prepare('SELECT m.name, COUNT(*) msgs, SUM(x.tokens_in+x.tokens_out+x.tokens_cache) tok, SUM(x.cost) cost FROM usage x JOIN models m ON m.id=x.model_id WHERE x.user_id=? AND x.created_at>=? GROUP BY m.id ORDER BY cost DESC').bind(u.id, since).all(),
      DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 10').bind(u.id).all(),
      DB.prepare('SELECT COUNT(*) n FROM chats WHERE user_id=?').bind(u.id).first(),
    ]);
    u.wallet = (await DB.prepare('SELECT amount,balance_after,kind,ref,created_at FROM wallet_tx WHERE user_id=? ORDER BY id DESC LIMIT 15').bind(u.id).all()).results;
    u.keys = (await DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n;
    const plan = await planOf(env, u);
    return json({ ...u, usage: await usageStatus(env, u, plan), current_plan: plan.name, models: models.results, payments: pays.results, chats: chats.n });
  }
  if (path === '/api/admin/settings') {
    if (M === 'PUT') await ctxAudit('update settings', Object.keys(await req.clone().json()));
    if (M === 'PUT') { const b = await req.json(); await DB.batch(SETTINGS.filter(k => k in b).map(k => DB.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').bind(k, String(b[k])))); }
    const rows = (await DB.prepare('SELECT * FROM settings').all()).results;
    return json({ ...Object.fromEntries(rows.map(x => [x.key, x.value])), slip_key_set: !!env.SLIP_API_KEY, slip2go_key_set: !!env.SLIP2GO_KEY,
      env: Object.fromEntries(['RESEND_KEY', 'TAVILY_KEY', 'SECRET_KEY', 'GOOGLE_CLIENT_ID', 'LINE_CHANNEL_ID', 'LINE_ALERT_TOKEN', 'PUBLIC_URL'].map(k => [k, !!env[k]])), r2: !!env.SLIPS });
  }
  if (path === '/api/admin/coupons') {
    if (M === 'GET') return json((await DB.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all()).results);
    const b = await req.json(), code = String(b.code || '').trim().toUpperCase();
    if (M === 'DELETE') { await ctxAudit('delete coupon', { code }); await DB.prepare('DELETE FROM coupons WHERE code=?').bind(code).run(); return json({ ok: true }); }
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return err('โค้ดใช้ A-Z 0-9 - _ ยาว 3-30 ตัว');
    if (!['percent', 'fixed', 'credit'].includes(b.kind) || !(+b.value > 0) || (b.kind === 'percent' && +b.value > 100)) return err('ชนิดหรือมูลค่าคูปองไม่ถูกต้อง');
    await ctxAudit('save coupon', { code, kind: b.kind, value: b.value });
    await DB.prepare('INSERT INTO coupons (code,kind,value,max_uses,expires,note,active,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET kind=excluded.kind, value=excluded.value, max_uses=excluded.max_uses, expires=excluded.expires, note=excluded.note, active=excluded.active')
      .bind(code, b.kind, +b.value, +b.max_uses || 0, b.expires ? +b.expires : null, String(b.note || '').slice(0, 200), b.active === 0 ? 0 : 1, Date.now()).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/tickets') return json((await DB.prepare("SELECT t.*,u.email,(SELECT COUNT(*) FROM ticket_msgs WHERE ticket_id=t.id) n FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.status='open' DESC, t.updated_at DESC LIMIT 200").all()).results);
  if ((r = path.match(/^\/api\/admin\/tickets\/(\d+)$/))) {
    const t = await DB.prepare('SELECT t.*,u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?').bind(r[1]).first();
    if (!t) return err('ไม่พบเรื่อง', 404);
    if (M === 'POST') {
      const b = await req.json(), body = String(b.body || '').trim().slice(0, 5000);
      if (body) { await DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,1,?,?)').bind(t.id, body, Date.now()).run(); await mail(env, t.email, 'AstraCode: แอดมินตอบเรื่อง ' + t.subject, mailBox('แอดมินตอบแล้ว', esc(body).slice(0, 800).replace(/\n/g, '<br>'))); }
      await DB.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?').bind(b.status === 'closed' ? 'closed' : body ? 'answered' : t.status, Date.now(), t.id).run();
      return json({ ok: true });
    }
    return json({ ...t, msgs: (await DB.prepare('SELECT * FROM ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  }
  if (path === '/api/admin/profit') { // กำไรแยกตามแพลนและผู้ใช้
    // shortcut: ต้นทุนนับตามแพลน "ปัจจุบัน" ของผู้ใช้ ถ้าผู้ใช้เปลี่ยนแพลนกลางช่วง ตัวเลขรายแพลนจะคลาดเล็กน้อย
    const days = Math.min(365, Math.max(1, +url.searchParams.get('days') || 30)), from = Date.now() - days * DAY, now = Date.now();
    const free = (await DB.prepare('SELECT id FROM plans WHERE price=0 ORDER BY sort LIMIT 1').first())?.id ?? 0;
    const [plans, users, w] = await Promise.all([
      DB.prepare(`SELECT p.id,p.name,p.price,
        (SELECT COUNT(*) FROM users u WHERE u.banned=0 AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) subs,
        (SELECT COALESCE(SUM(amount),0) FROM payments x WHERE x.plan_id=p.id AND x.kind='plan' AND x.status='approved' AND COALESCE(x.approved_at,x.created_at)>=?2) rev,
        (SELECT COALESCE(SUM(g.cost),0) FROM usage g JOIN users u ON u.id=g.user_id WHERE g.created_at>=?2 AND g.units>0 AND COALESCE(CASE WHEN u.plan_expires>?1 THEN u.plan_id END, ?3)=p.id) cost
        FROM plans p ORDER BY p.sort`).bind(now, from, free).all(),
      DB.prepare(`SELECT u.id,u.email,pl.name plan,
        COALESCE((SELECT SUM(cost) FROM usage WHERE user_id=u.id AND created_at>=?1),0) cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE user_id=u.id AND kind='plan' AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) rev_plan,
        COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE user_id=u.id AND kind IN ('api','overflow') AND created_at>=?1),0) rev_wallet
        FROM users u LEFT JOIN plans pl ON pl.id=u.plan_id AND u.plan_expires>?2
        WHERE EXISTS (SELECT 1 FROM usage WHERE user_id=u.id AND created_at>=?1) OR EXISTS (SELECT 1 FROM payments WHERE user_id=u.id AND status='approved' AND created_at>=?1)`).bind(from, now).all(),
      DB.prepare(`SELECT COALESCE((SELECT -SUM(amount) FROM wallet_tx WHERE kind IN ('api','overflow') AND created_at>=?1),0) charges,
        COALESCE((SELECT SUM(cost) FROM usage WHERE units=0 AND model_id>0 AND created_at>=?1),0) api_cost,
        COALESCE((SELECT SUM(amount) FROM payments WHERE kind='topup' AND status='approved' AND COALESCE(approved_at,created_at)>=?1),0) topups,
        COALESCE((SELECT SUM(balance) FROM users WHERE balance>0),0) liability`).bind(from).first(),
    ]);
    const us = users.results.map(x => ({ ...x, rev: x.rev_plan + x.rev_wallet, profit: x.rev_plan + x.rev_wallet - x.cost })).sort((a, b) => a.profit - b.profit);
    const rev = plans.results.reduce((a, x) => a + x.rev, 0) + w.charges, cost = us.reduce((a, x) => a + x.cost, 0);
    return json({ days, total: { rev, cost, profit: rev - cost }, plans: plans.results, wallet: w, users: us.slice(0, 100), losers: us.filter(x => x.profit < 0).length });
  }
  if (path === '/api/admin/export') { // CSV สำหรับทำบัญชี (เปิดใน Excel ภาษาไทยได้)
    const type = url.searchParams.get('type'), days = Math.min(3650, Math.max(1, +url.searchParams.get('days') || 31)), from = Date.now() - days * DAY;
    const q = {
      payments: ["SELECT p.id,p.created_at,p.approved_at,u.email,CASE p.kind WHEN 'topup' THEN 'เติม Wallet' ELSE 'แพลน' END,pl.name plan,CASE WHEN p.kind='topup' THEN '' WHEN p.period='year' THEN 'รายปี' ELSE 'รายเดือน' END,p.amount,p.discount,p.coupon,CASE p.status WHEN 'approved' THEN 'สำเร็จ' WHEN 'rejected' THEN 'ไม่อนุมัติ' ELSE 'รอตรวจ' END,CASE WHEN p.slip_key='wallet' THEN 'Wallet' WHEN p.slip_key='coupon' THEN 'คูปอง' ELSE 'โอน PromptPay' END,p.slip_ref FROM payments p JOIN users u ON u.id=p.user_id LEFT JOIN plans pl ON pl.id=p.plan_id WHERE p.created_at>=? ORDER BY p.id",
        ['เลขที่', 'วันที่ส่ง', 'วันที่อนุมัติ', 'อีเมล', 'ชนิด', 'แพลน', 'รอบ', 'ยอด (บาท)', 'ส่วนลด', 'คูปอง', 'สถานะ', 'ช่องทาง', 'เลขอ้างอิงธนาคาร']],
      wallet: ['SELECT w.id,w.created_at,u.email,w.kind,w.amount,w.balance_after,w.ref FROM wallet_tx w JOIN users u ON u.id=w.user_id WHERE w.created_at>=? ORDER BY w.id',
        ['ลำดับ', 'วันที่', 'อีเมล', 'รายการ', 'จำนวน (บาท)', 'คงเหลือ', 'อ้างอิง']],
      usage: ['SELECT g.id,g.created_at,u.email,m.name,g.tokens_in,g.tokens_out,g.tokens_cache,g.units,g.cost FROM usage g JOIN users u ON u.id=g.user_id LEFT JOIN models m ON m.id=g.model_id WHERE g.created_at>=? ORDER BY g.id LIMIT 100000',
        ['ลำดับ', 'วันที่', 'อีเมล', 'โมเดล', 'token เข้า', 'token ออก', 'token cache', 'units', 'ต้นทุน (บาท)']],
    }[type];
    if (!q) return err('type ต้องเป็น payments, wallet หรือ usage');
    await ctxAudit('export ' + type, { days });
    const rows = (await DB.prepare(q[0]).bind(from).all()).results;
    const cell = v => { if (v == null) return ''; if (typeof v === 'number' && v > 1e12) v = new Date(v + BKK).toISOString().slice(0, 16).replace('T', ' '); v = String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }; // กันสูตร Excel ที่แฝงมา
    const csv = '﻿' + [q[1], ...rows.map(r => Object.values(r))].map(r => r.map(cell).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="astracode-${type}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  if (path === '/api/admin/slip-test' && M === 'POST') { // ตรวจการเชื่อมต่อ Slip2Go: ดูข้อมูลบัญชี/โควตาที่เหลือ
    const base = await getSetting(env, 'slip2go_url');
    if (!base || !env.SLIP2GO_KEY) return err('ใส่ API URL และตั้ง Secret SLIP2GO_KEY ก่อน');
    const r = await fetch(base.replace(/\/$/, '') + '/api/account/info', { headers: { authorization: 'Bearer ' + env.SLIP2GO_KEY } }).catch(e => ({ ok: false, json: async () => ({ message: e.message }) }));
    return json({ ok: r.ok, data: await r.json().catch(() => null) });
  }
  if (path === '/api/admin/notify-test' && M === 'POST') { await notify(env, '✅ ทดสอบแจ้งเตือนจาก AstraCode'); return json({ ok: true }); }
  if (path === '/api/admin/reset-limits' && M === 'POST') { // แจกรีเซ็ตลิมิต: ทุกคน / ทุกคนในแพลน / คนเดียว
    const b = await req.json(), now = Date.now();
    let where = '1=1', args = [];
    if (b.target === 'email') { where = 'email=?'; args = [String(b.email || '').trim().toLowerCase()]; }
    else if (b.target === 'plan') {
      const p = await DB.prepare('SELECT id,price FROM plans WHERE id=?').bind(b.plan_id).first(); if (!p) return err('ไม่พบแพลน');
      // แพลนฟรีรวมคนที่ไม่มีแพลนหรือแพลนหมดอายุ (ระบบนับเป็นแพลนฟรี)
      [where, args] = p.price > 0 ? ['plan_id=? AND plan_expires>?', [p.id, now]] : ['(plan_id IS NULL OR plan_expires IS NULL OR plan_expires<=? OR plan_id=?)', [now, p.id]];
    } else if (b.target !== 'all') return err('เลือกกลุ่มผู้ใช้');
    const r = await DB.prepare(`UPDATE users SET usage_reset_at=? WHERE banned=0 AND ${where}`).bind(now, ...args).run();
    if (b.target === 'email' && !r.meta.changes) return err('ไม่พบผู้ใช้อีเมลนี้');
    await ctxAudit('reset limits', { target: b.target, plan_id: b.plan_id, email: b.email, count: r.meta.changes });
    return json({ ok: true, count: r.meta.changes });
  }
  if (path === '/api/admin/audit') return json((await DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()).results);
  if (path === '/api/admin/events') return json((await DB.prepare('SELECT e.*,m.name model FROM events e LEFT JOIN models m ON m.id=e.model_id ORDER BY e.id DESC LIMIT 200').all()).results);
  if (path === '/api/admin/backups') {
    if (!env.SLIPS) return err('ต้องผูก R2 (SLIPS) ก่อน');
    if (M === 'POST') { await ctxAudit('backup', null); return json({ ok: true, key: await backup(env) }); }
    return json((await env.SLIPS.list({ prefix: 'backup/' })).objects.map(o => ({ key: o.key, size: o.size, at: o.uploaded })).reverse());
  }
  if ((r = path.match(/^\/api\/admin\/backups\/(backup\/[\w.-]+)$/))) {
    const o = env.SLIPS && await env.SLIPS.get(r[1]);
    return o ? new Response(o.body, { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${r[1].split('/')[1]}"` } }) : err('not found', 404);
  }
  return err('not found', 404);
}

// ---------- router ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname, M = req.method; let r;
    // Cloudflare อาจ redirect /preview.html → /preview จึงรับทั้งสองแบบ
    if (path === '/preview' || path === '/preview.html' || path === '/pyworker.js') return sandboxed(await env.ASSETS.fetch(req), path === '/pyworker.js' ? path : '/preview.html');
    if (path === '/node-runner' || path === '/node-runner.html') return sandboxed(await env.ASSETS.fetch(req), '/preview.html'); // เทอร์มินัล Node: origin แยกเหมือนหน้าแสดงผล
    if (path.startsWith('/v1/')) return v1(req, env, ctx, path); // API สำหรับนักพัฒนา (แบบ OpenAI)
    if (path === '/robots.txt' || path === '/api/robots') return robots(req, env);
    if (path === '/sitemap.xml' || path === '/api/sitemap') return secure(await sitemap(req, env));
    if ((r = path.match(/^(?:\/api\/page)?\/blog\/([\w-]+)$/))) return secure(await blogPage(req, env, r[1])); // บทความ: ใส่ meta ให้ Google/social
    if (!path.startsWith('/api/')) { // URL สะอาด: ไม่มี .html, หน้าแรกอยู่ที่ / (ไฟล์ home.html)
      const clean = path === '/index.html' || path === '/home' || path === '/home.html' ? '/' : path.endsWith('.html') ? path.slice(0, -5) : null;
      if (clean) return Response.redirect(new URL(clean + url.search, req.url), 301);
      const res = await env.ASSETS.fetch(path === '/' ? new Request(new URL('/home', req.url), req) : req);
      if (res.status === 404 && M === 'GET') return secure(new Response((await env.ASSETS.fetch(new Request(new URL('/home', req.url), req))).body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })); // หน้าไม่มีจริง: แสดงหน้าแรก
      return secure(res);
    }
    if (M !== 'GET' && M !== 'HEAD') {
      const o = req.headers.get('origin'); // กัน CSRF: รับคำขอแก้ข้อมูลจากเว็บตัวเองเท่านั้น
      const ok = [url.origin, viaProxy(req, env) && 'https://' + req.headers.get('x-forwarded-host')];
      if (o && !ok.includes(o)) return err('forbidden', 403);
      if (+req.headers.get('content-length') > 12e6) return err('ไฟล์ใหญ่เกินไป', 413);
    }
    return secure(await route(req, env, ctx, url, path, M));
  },
  scheduled(ev, env, ctx) { ctx.waitUntil(cron(env)); }, // Cron Trigger: ทุกชั่วโมง
};

// cdn.jsdelivr.net: ตัวอ่าน PDF/Word/Excel (ล็อกเวอร์ชัน + SRI ใน app.js)
const CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://apis.google.com; frame-src 'self' https://astra-892a8.firebaseapp.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://promptpay.io; connect-src 'self' https://cdn.jsdelivr.net https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
// หน้าแสดงผลโค้ดของผู้ใช้: รันใน iframe sandbox (origin แยก อ่าน cookie / เรียก API ในชื่อผู้ใช้ไม่ได้)
function sandboxed(res, path) {
  const r = new Response(res.body, res), h = r.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('content-security-policy', path === '/preview.html'
    ? "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'; sandbox allow-scripts allow-modals allow-forms allow-popups"
    : "default-src 'none'; script-src https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-eval'; connect-src https://cdn.jsdelivr.net");
  return r;
}
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
      if (path === '/api/settings/public') { // ประกาศ, โหมดปิดปรับปรุง, ปุ่มล็อกอินที่เปิดใช้
        const s = await getSettings(env, ['announcement', 'announcement_level', 'maintenance', 'referral_bonus', 'search_enabled', 'image_enabled', 'topup_min']);
        return json({ ...s, google: !!env.GOOGLE_CLIENT_ID, line: !!env.LINE_CHANNEL_ID, search: !!env.TAVILY_KEY && s.search_enabled !== '0', image: s.image_enabled === '1', mail: !!env.RESEND_KEY });
      }
      if (path === '/api/blog') return json((await env.DB.prepare('SELECT slug,title,summary,cover,created_at FROM posts WHERE published=1 ORDER BY created_at DESC LIMIT 100').all()).results);
      if (path.startsWith('/api/blog/')) { const p = await env.DB.prepare('SELECT slug,title,summary,body,cover,created_at FROM posts WHERE slug=? AND published=1').bind(path.slice(10)).first(); return p ? json(p) : err('ไม่พบบทความ', 404); }
      if (path === '/api/status') return json(await status(env));
      if (path.startsWith('/api/oauth/')) return await oauth(req, env, url, path);
      if (path === '/api/login/mfa' && M === 'POST') { // ขั้นที่ 2 หลังล็อกอิน Google/LINE ของคนที่เปิด 2FA
        const b = await req.json();
        if (await limited(env, 'mfa:' + ip(req, env), 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
        const uid = await useToken(env, b.token, 'mfa'); const u = uid && await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
        if (!u) return err('หมดเวลา ล็อกอินใหม่อีกครั้ง', 401);
        if (!await totpOk(env, u, b.code)) return err('รหัส 2FA ไม่ถูกต้อง', 401);
        return await startSession(env, u.id);
      }
      if (path === '/api/firebase' && M === 'POST') return await firebaseLogin(req, env, ctx);
      if (path === '/api/pricing') { // หน้าราคา: ราคาขายต่อ 1M token (ไม่ส่งราคาทุนออกไป)
        const [ms, ps, pm] = await Promise.all([
          env.DB.prepare('SELECT * FROM models WHERE active=1 AND public=1 ORDER BY sort,id').all(),
          env.DB.prepare('SELECT id,name,price,limit_week FROM plans WHERE active=1 ORDER BY sort').all(),
          env.DB.prepare('SELECT * FROM plan_models').all(),
        ]);
        return json({
          note: await getSetting(env, 'price_note'),
          plans: ps.results,
          models: await Promise.all(ms.results.map(async m => {
            const p = await priceOf(env, m), b = await priceOf(env, m, true), on = promoOn(m);
            return { id: m.id, name: m.name, provider: m.provider, vision: !!m.vision, effort: m.effort !== 'none', multiplier: m.multiplier, note: m.note,
              in: p.in, out: p.out, cache: p.cache, cache_write: p.write, promo: on ? { pct: m.promo_pct, start: m.promo_start, end: m.promo_end, in: b.in, out: b.out, cache: b.cache, cache_write: b.write } : null,
              plans: pm.results.filter(x => x.model_id === m.id).map(x => x.plan_id) };
          })),
        });
      }
      if (path === '/api/plans') {
        const plans = (await env.DB.prepare('SELECT id,name,price,price_year,description,limit_week FROM plans WHERE active=1 ORDER BY sort').all()).results;
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
      if (u.role !== 'admin' && !['/api/me', '/api/logout'].includes(path) && (await getSetting(env, 'maintenance')) === '1') return json({ error: 'ระบบปิดปรับปรุงชั่วคราว', maintenance: true }, 503);
      const extra = await userRoutes(req, env, ctx, url, path, M, u); if (extra) return extra;

      if (path === '/api/logout') {
        await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(u.sid).run();
        return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
      }
      if (path === '/api/me') {
        const plan = await planOf(env, u);
        return json({
          email: u.email, role: u.role, plan: { id: plan.id, name: plan.name, expires: plan.price > 0 ? u.plan_expires : null, period: u.plan_period },
          balance: u.balance, ref_code: u.ref_code, email_verified: !!u.email_verified, totp_on: !!u.totp_on, google: !!u.google_id, line: !!u.line_id, has_password: !!u.has_password,
          instructions: u.instructions, wallet_overflow: !!u.wallet_overflow, auto_renew: !!u.auto_renew,
          usage: await usageStatus(env, u, plan), models: await allowedModels(env, plan.id),
          promptpay_id: await getSetting(env, 'promptpay_id'),
        });
      }
      if (path === '/api/chat' && M === 'POST') return await chat(req, env, u, ctx);
      if (path === '/api/chats') {
        const pj = url.searchParams.get('project');
        return json((await env.DB.prepare(`SELECT id,title,folder_id FROM chats WHERE user_id=? AND ${pj ? 'project_id=?' : 'project_id IS NULL'} ORDER BY id DESC LIMIT 100`).bind(...(pj ? [u.id, pj] : [u.id])).all()).results);
      }
      if (path.startsWith('/api/projects')) return await projects(req, env, u, path, url);
      if (path === '/api/github') { // เชื่อม GitHub ด้วย Personal Access Token
        if (M === 'GET') return json({ connected: !!u.gh_token, login: u.gh_login, secret: !!env.SECRET_KEY });
        if (M === 'DELETE') { await env.DB.prepare('UPDATE users SET gh_token=NULL, gh_login=NULL WHERE id=?').bind(u.id).run(); return json({ ok: true }); }
        const token = String((await req.json()).token || '').trim();
        if (!/^(gh[pousr]_|github_pat_)[\w]{20,}$/.test(token)) return err('รูปแบบ token ไม่ถูกต้อง (ขึ้นต้นด้วย github_pat_ หรือ ghp_)');
        if (env.GITHUB_API) GH = env.GITHUB_API;
        const who = await gh(token, '/user');
        await env.DB.prepare('UPDATE users SET gh_token=?, gh_login=? WHERE id=?').bind(await seal(env, token), who.login, u.id).run();
        return json({ ok: true, login: who.login });
      }
      let r;
      if ((r = path.match(/^\/api\/chats\/(\d+)$/))) {
        if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(r[1], u.id).first()) return err('ไม่พบแชต', 404);
        if (M === 'DELETE') { await env.DB.batch([env.DB.prepare('DELETE FROM messages WHERE chat_id=?').bind(r[1]), env.DB.prepare('DELETE FROM chats WHERE id=?').bind(r[1])]); return json({ ok: true }); }
        if (M === 'PUT') { // เปลี่ยนชื่อ / ย้ายโฟลเดอร์
          const b = await req.json();
          if ('title' in b) { const title = String(b.title || '').trim().slice(0, 80); if (!title) return err('ชื่อว่าง'); await env.DB.prepare('UPDATE chats SET title=? WHERE id=?').bind(title, r[1]).run(); }
          if ('folder_id' in b) {
            if (b.folder_id && !await env.DB.prepare('SELECT 1 FROM folders WHERE id=? AND user_id=?').bind(b.folder_id, u.id).first()) return err('ไม่พบโฟลเดอร์', 404);
            await env.DB.prepare('UPDATE chats SET folder_id=? WHERE id=?').bind(b.folder_id || null, r[1]).run();
          }
          return json({ ok: true });
        }
        return json((await env.DB.prepare('SELECT m.role,m.content,m.thinking,m.sources,m.tin,m.tout,md.name model FROM messages m LEFT JOIN models md ON md.id=m.model_id WHERE m.chat_id=? ORDER BY m.id').bind(r[1]).all()).results);
      }
      if (path === '/api/pay' && M === 'POST') return await pay(req, env, u);
      if (path === '/api/pay') return json((await env.DB.prepare('SELECT p.id,p.amount,p.status,p.created_at,p.kind,p.period,p.discount,pl.name plan_name FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id WHERE user_id=? ORDER BY p.id DESC LIMIT 20').bind(u.id).all()).results);

      if (path.startsWith('/api/admin/')) return u.role === 'admin' ? await admin(req, env, path, url, u) : err('forbidden', 403);
      return err('not found', 404);
    } catch (e) {
      if (e.user) return err(e.message, e.status);
      console.log('error', path, e.stack);
      return err('เซิร์ฟเวอร์ผิดพลาด', 500);
    }
}

// ---------- ผู้ใช้: ตั้งค่า, ความจำ, โฟลเดอร์, wallet, คูปอง, API key, 2FA, ข้อมูลส่วนตัว, ใบเสร็จ, ซัพพอร์ต, สร้างรูป, เติมโค้ด ----------
async function userRoutes(req, env, ctx, url, path, M, u) {
  const DB = env.DB; let r;
  if (path === '/api/me' && M === 'PUT') {
    const b = await req.json();
    await DB.prepare('UPDATE users SET instructions=COALESCE(?,instructions), wallet_overflow=COALESCE(?,wallet_overflow), auto_renew=COALESCE(?,auto_renew) WHERE id=?')
      .bind(typeof b.instructions === 'string' ? b.instructions.slice(0, 3000) : null, 'wallet_overflow' in b ? (b.wallet_overflow ? 1 : 0) : null, 'auto_renew' in b ? (b.auto_renew ? 1 : 0) : null, u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/memories') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,text,created_at FROM memories WHERE user_id=? ORDER BY id').bind(u.id).all()).results);
    const text = String((await req.json()).text || '').trim().slice(0, 300);
    if (!text) return err('ข้อความว่าง');
    if ((await DB.prepare('SELECT COUNT(*) n FROM memories WHERE user_id=?').bind(u.id).first()).n >= 50) return err('จำได้สูงสุด 50 เรื่อง ลบเรื่องเก่าก่อน');
    return json(await DB.prepare('INSERT INTO memories (user_id,text,created_at) VALUES (?,?,?) RETURNING id,text').bind(u.id, text, Date.now()).first());
  }
  if ((r = path.match(/^\/api\/memories\/(\d+)$/)) && M === 'DELETE') { await DB.prepare('DELETE FROM memories WHERE id=? AND user_id=?').bind(r[1], u.id).run(); return json({ ok: true }); }
  if (path === '/api/folders') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,name FROM folders WHERE user_id=? ORDER BY name').bind(u.id).all()).results);
    const name = String((await req.json()).name || '').trim().slice(0, 40); if (!name) return err('ชื่อว่าง');
    return json(await DB.prepare('INSERT INTO folders (user_id,name,created_at) VALUES (?,?,?) RETURNING id,name').bind(u.id, name, Date.now()).first());
  }
  if ((r = path.match(/^\/api\/folders\/(\d+)$/))) {
    if (!await DB.prepare('SELECT 1 FROM folders WHERE id=? AND user_id=?').bind(r[1], u.id).first()) return err('ไม่พบโฟลเดอร์', 404);
    if (M === 'DELETE') { await DB.batch([DB.prepare('UPDATE chats SET folder_id=NULL WHERE folder_id=?').bind(r[1]), DB.prepare('DELETE FROM folders WHERE id=?').bind(r[1])]); return json({ ok: true }); }
    const name = String((await req.json()).name || '').trim().slice(0, 40); if (!name) return err('ชื่อว่าง');
    await DB.prepare('UPDATE folders SET name=? WHERE id=?').bind(name, r[1]).run(); return json({ ok: true });
  }
  if (path === '/api/wallet') {
    const ref = await DB.prepare('SELECT COUNT(*) n, SUM(ref_rewarded) paid FROM users WHERE referred_by=?').bind(u.id).first();
    return json({ balance: u.balance, ref_code: u.ref_code, referred: ref.n, referred_paid: ref.paid || 0, bonus: +(await getSetting(env, 'referral_bonus')) || 0,
      tx: (await DB.prepare('SELECT amount,balance_after,kind,ref,created_at FROM wallet_tx WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(u.id).all()).results });
  }
  if (path === '/api/coupon/check' && M === 'POST') {
    const b = await req.json(), plan = await DB.prepare('SELECT * FROM plans WHERE id=?').bind(b.plan_id).first();
    const c = await couponFor(env, u, b.code, 'plan'); if (!c) return err('ใส่โค้ดคูปอง');
    const amount = plan ? (b.period === 'year' && plan.price_year ? plan.price_year : plan.price) : 0;
    return json({ code: c.code, kind: c.kind, value: c.value, discount: discountOf(c, amount), total: Math.max(0, amount - discountOf(c, amount)) });
  }
  if (path === '/api/coupon/redeem' && M === 'POST') {
    const c = await couponFor(env, u, (await req.json()).code, 'credit');
    if (!c) return err('ใส่โค้ดคูปอง');
    if (!await env.DB.prepare('INSERT OR IGNORE INTO coupon_uses VALUES (?,?,?) RETURNING code').bind(c.code, u.id, Date.now()).first()) return err('คุณใช้คูปองนี้ไปแล้ว'); // กันกดซ้ำพร้อมกัน
    await env.DB.prepare('UPDATE coupons SET used=used+1 WHERE code=?').bind(c.code).run();
    return json({ ok: true, amount: c.value, balance: await walletAdd(env, u.id, c.value, 'coupon', c.code) });
  }
  if (path === '/api/keys') {
    if (M === 'GET') return json((await DB.prepare('SELECT id,name,prefix,created_at,last_used,budget,models,CASE WHEN spent_month=? THEN spent ELSE 0 END spent FROM api_keys WHERE user_id=? AND revoked=0 ORDER BY id DESC').bind(monthKey(), u.id).all()).results);
    if ((await DB.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND revoked=0').bind(u.id).first()).n >= 10) return err('สร้าง key ได้สูงสุด 10 อัน');
    const name = String((await req.json()).name || 'default').trim().slice(0, 40) || 'default', key = 'sk-astra-' + rand(24);
    await DB.prepare('INSERT INTO api_keys (user_id,name,key_hash,prefix,created_at) VALUES (?,?,?,?,?)').bind(u.id, name, await sha(key), key.slice(0, 14), Date.now()).run();
    return json({ key }); // แสดงครั้งเดียว เก็บแค่ hash
  }
  if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'DELETE') { await DB.prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND user_id=?').bind(r[1], u.id).run(); return json({ ok: true }); }
  if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'PUT') { // งบต่อเดือน (บาท) และโมเดลที่ key นี้ใช้ได้
    const b = await req.json(), budget = b.budget === '' || b.budget == null ? null : Math.round(+b.budget * 10000) / 10000;
    if (budget != null && !(budget >= 0)) return err('งบต้องเป็นตัวเลข 0 ขึ้นไป');
    const models = Array.isArray(b.models) && b.models.length ? b.models.map(String).filter(x => /^[a-z0-9.-]{1,80}$/.test(x)).slice(0, 50).join(',') : null;
    await DB.prepare('UPDATE api_keys SET budget=?, models=?, name=COALESCE(?,name) WHERE id=? AND user_id=? AND revoked=0').bind(budget, models, typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 40) : null, r[1], u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/2fa/setup' && M === 'POST') {
    if (u.totp_on) return err('เปิด 2FA อยู่แล้ว');
    const secret = b32(crypto.getRandomValues(new Uint8Array(20)));
    await DB.prepare('UPDATE users SET totp_secret=? WHERE id=?').bind(await seal(env, secret), u.id).run();
    return json({ secret, uri: `otpauth://totp/AstraCode:${encodeURIComponent(u.email)}?secret=${secret}&issuer=AstraCode` });
  }
  if ((path === '/api/2fa/enable' || path === '/api/2fa/disable') && M === 'POST') {
    if (await limited(env, '2fa:' + u.id, 10, 900e3)) return err('ลองผิดหลายครั้ง รอ 15 นาที', 429);
    if (!await totpOk(env, u, (await req.json()).code)) return err('รหัสไม่ถูกต้อง ลองรหัสล่าสุดจากแอป');
    await DB.prepare(path.endsWith('enable') ? 'UPDATE users SET totp_on=1 WHERE id=?' : 'UPDATE users SET totp_on=0, totp_secret=NULL WHERE id=?').bind(u.id).run();
    return json({ ok: true });
  }
  if (path === '/api/me/export') { // ดาวน์โหลดข้อมูลของตัวเอง (PDPA)
    const q = (sql, ...a) => DB.prepare(sql).bind(...a).all().then(x => x.results);
    const data = { exported_at: new Date().toISOString(), account: { email: u.email, created_at: u.created_at, plan_id: u.plan_id, plan_expires: u.plan_expires, balance: u.balance, instructions: u.instructions },
      memories: await q('SELECT text,created_at FROM memories WHERE user_id=?', u.id), chats: await q('SELECT id,title,created_at FROM chats WHERE user_id=?', u.id),
      messages: await q('SELECT m.chat_id,m.role,m.content,m.created_at FROM messages m JOIN chats c ON c.id=m.chat_id WHERE c.user_id=?', u.id),
      projects: await q('SELECT p.name,f.path,f.content FROM projects p JOIN project_files f ON f.project_id=p.id WHERE p.user_id=?', u.id),
      payments: await q('SELECT amount,kind,status,created_at FROM payments WHERE user_id=?', u.id), wallet: await q('SELECT amount,kind,created_at FROM wallet_tx WHERE user_id=?', u.id) };
    return new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="astracode-data.json"' } });
  }
  if (path === '/api/me/delete' && M === 'POST') { // ลบบัญชี: ต้องพิมพ์อีเมลยืนยัน
    const b = await req.json();
    if (u.role === 'admin') return err('บัญชีแอดมินลบเองไม่ได้');
    if (String(b.confirm || '').trim().toLowerCase() !== u.email) return err('อีเมลไม่ตรง', 401);
    const c = 'SELECT id FROM chats WHERE user_id=?1', pj = 'SELECT id FROM projects WHERE user_id=?1';
    await DB.batch([`DELETE FROM messages WHERE chat_id IN (${c})`, 'DELETE FROM chats WHERE user_id=?1', `DELETE FROM project_files WHERE project_id IN (${pj})`, `DELETE FROM file_versions WHERE project_id IN (${pj})`,
      'DELETE FROM projects WHERE user_id=?1', 'DELETE FROM memories WHERE user_id=?1', 'DELETE FROM folders WHERE user_id=?1', 'DELETE FROM api_keys WHERE user_id=?1', 'DELETE FROM sessions WHERE user_id=?1',
      `DELETE FROM ticket_msgs WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id=?1)`, 'DELETE FROM tickets WHERE user_id=?1', 'DELETE FROM tokens WHERE user_id=?1',
      "UPDATE users SET email='deleted-'||id||'@deleted.local', pass_hash='x', banned=1, gh_token=NULL, totp_secret=NULL, google_id=NULL, line_id=NULL, fb_uid=NULL, instructions='' WHERE id=?1", // เก็บแถวผู้ใช้ไว้เพราะประวัติการเงินต้องเก็บตามกฎหมาย
    ].map(q => DB.prepare(q).bind(u.id)));
    return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }
  if ((r = path.match(/^\/api\/receipt\/(\d+)$/))) {
    const p = await DB.prepare("SELECT p.*,pl.name plan_name,us.email FROM payments p LEFT JOIN plans pl ON pl.id=p.plan_id JOIN users us ON us.id=p.user_id WHERE p.id=? AND p.status='approved'").bind(r[1]).first();
    if (!p || (p.user_id !== u.id && u.role !== 'admin')) return err('ไม่พบใบเสร็จ', 404);
    const b = await getSettings(env, ['business_name', 'business_address', 'business_tax_id']);
    return json({ id: p.id, no: 'AC' + String(p.id).padStart(6, '0'), date: p.approved_at || p.created_at, email: p.email, amount: p.amount, discount: p.discount, coupon: p.coupon,
      item: p.kind === 'topup' ? 'เติมเงิน Wallet' : `แพลน ${p.plan_name} (${p.period === 'year' ? '1 ปี' : '30 วัน'})`, business: b });
  }
  if (path === '/api/tickets') {
    if (M === 'GET') return json((await DB.prepare('SELECT * FROM tickets WHERE user_id=? ORDER BY updated_at DESC').bind(u.id).all()).results);
    const b = await req.json(), subject = String(b.subject || '').trim().slice(0, 120), body = String(b.body || '').trim().slice(0, 5000);
    if (!subject || !body) return err('ใส่หัวข้อและรายละเอียด');
    if (await limited(env, 'ticket:' + u.id, 5, DAY)) return err('เปิดเรื่องได้วันละ 5 เรื่อง', 429);
    const t = await DB.prepare('INSERT INTO tickets (user_id,subject,created_at,updated_at) VALUES (?,?,?,?) RETURNING id').bind(u.id, subject, Date.now(), Date.now()).first();
    await DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,0,?,?)').bind(t.id, body, Date.now()).run();
    ctx.waitUntil(notify(env, `🎫 เรื่องใหม่จาก ${u.email}: ${subject}`));
    return json({ ok: true, id: t.id });
  }
  if ((r = path.match(/^\/api\/tickets\/(\d+)$/))) {
    const t = await DB.prepare('SELECT * FROM tickets WHERE id=? AND user_id=?').bind(r[1], u.id).first(); if (!t) return err('ไม่พบเรื่อง', 404);
    if (M === 'POST') {
      const body = String((await req.json()).body || '').trim().slice(0, 5000); if (!body) return err('ข้อความว่าง');
      await DB.batch([DB.prepare('INSERT INTO ticket_msgs (ticket_id,admin,body,created_at) VALUES (?,0,?,?)').bind(t.id, body, Date.now()), DB.prepare("UPDATE tickets SET status='open', updated_at=? WHERE id=?").bind(Date.now(), t.id)]);
      ctx.waitUntil(notify(env, `🎫 ${u.email} ตอบเรื่อง: ${t.subject}`));
      return json({ ok: true });
    }
    return json({ ...t, msgs: (await DB.prepare('SELECT admin,body,created_at FROM ticket_msgs WHERE ticket_id=? ORDER BY id').bind(t.id).all()).results });
  }
  if (path === '/api/image' && M === 'POST') return await imageGen(req, env, u);
  if ((r = path.match(/^\/api\/img\/(\d+)\/([\w-]+\.png)$/))) {
    if (+r[1] !== u.id && u.role !== 'admin') return err('not found', 404);
    const o = env.SLIPS && await env.SLIPS.get(`img/${r[1]}/${r[2]}`);
    return o ? new Response(o.body, { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=31536000' } }) : err('not found', 404);
  }
  if (path === '/api/complete' && M === 'POST') return await complete(req, env, u);
  return null;
}

// ---------- 2FA (TOTP) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(bytes) { let bits = '', out = ''; for (const x of bytes) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function unb32(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); } return Uint8Array.from(bits.match(/.{8}/g) || [], b => parseInt(b, 2)); }
async function totp(secret, step) {
  const k = await crypto.subtle.importKey('raw', unb32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, step);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
async function totpOk(env, u, code) {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code) || !u.totp_secret) return false;
  const secret = await unseal(env, u.totp_secret).catch(() => null); if (!secret) return false;
  const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) if (same(await totp(secret, step + d), code)) return true; // ยอมให้นาฬิกาคลาดได้ 30 วินาที
  return false;
}

// ---------- ล็อกอินด้วย Google / LINE ----------
async function oauth(req, env, url, path) {
  const [, , , who, step] = path.split('/'), base = origin(req, env), cb = `${base}/api/oauth/${who}/callback`;
  const cfg = { google: { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email', extra: '&prompt=select_account' },
    line: { id: env.LINE_CHANNEL_ID, secret: env.LINE_CHANNEL_SECRET, auth: 'https://access.line.me/oauth2/v2.1/authorize', token: 'https://api.line.me/oauth2/v2.1/token', scope: 'openid profile email', extra: '' } }[who];
  if (!cfg?.id) return err('ยังไม่ได้เปิดการล็อกอินแบบนี้', 404);
  const fail = m => Response.redirect(`${base}/login?error=${encodeURIComponent(m)}`, 302);
  if (!step) { // ไปหน้ายินยอมของผู้ให้บริการ
    const state = rand(16), ref = (url.searchParams.get('ref') || '').replace(/\W/g, '').slice(0, 12);
    return new Response(null, { status: 302, headers: { location: `${cfg.auth}?response_type=code&client_id=${encodeURIComponent(cfg.id)}&redirect_uri=${encodeURIComponent(cb)}&scope=${encodeURIComponent(cfg.scope)}&state=${state}${cfg.extra}`,
      'set-cookie': `oauth=${state}.${ref}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
  }
  const [state, ref] = ((req.headers.get('cookie') || '').match(/(?:^|;\s*)oauth=([\w.]+)/)?.[1] || '').split('.');
  if (!state || !same(state, url.searchParams.get('state') || '')) return fail('หมดเวลา ลองใหม่อีกครั้ง'); // กันการปลอมคำขอ
  const tr = await fetch(cfg.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: cb, client_id: cfg.id, client_secret: cfg.secret || '' }) });
  const tk = await tr.json().catch(() => ({}));
  if (!tk.id_token) return fail('ล็อกอินไม่สำเร็จ');
  let info; // ได้ id_token ตรงจากผู้ให้บริการผ่าน HTTPS จึงอ่าน payload ได้เลย (LINE ตรวจซ้ำผ่าน API ของ LINE)
  if (who === 'line') info = await (await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: tk.id_token, client_id: cfg.id }) })).json();
  else info = JSON.parse(atob(tk.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!info?.sub) return fail('ล็อกอินไม่สำเร็จ');
  const col = who === 'google' ? 'google_id' : 'line_id', email = info.email && (who === 'line' || info.email_verified) ? String(info.email).toLowerCase() : null;
  let u = await env.DB.prepare(`SELECT * FROM users WHERE ${col}=?`).bind(info.sub).first();
  if (!u && email) { u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(); if (u) await env.DB.prepare(`UPDATE users SET ${col}=?, email_verified=1 WHERE id=?`).bind(info.sub, u.id).run(); }
  if (!u) {
    if (await limited(env, 'reg:' + ip(req, env), 3, DAY)) return fail('สมัครจากเครือข่ายนี้บ่อยเกินไป');
    const by = ref && await env.DB.prepare('SELECT id FROM users WHERE ref_code=?').bind(ref.toUpperCase()).first();
    u = await env.DB.prepare(`INSERT INTO users (email,pass_hash,role,created_at,ref_code,referred_by,${col},email_verified,has_password) VALUES (?,?,?,?,?,?,?,?,0) RETURNING *`)
      .bind(email || `${who}-${info.sub}@users.local`, 'x', 'user', Date.now(), rand(4).toUpperCase(), by?.id || null, info.sub, email ? 1 : 0).first();
  }
  if (u.banned) return fail('บัญชีนี้ถูกระงับ');
  if (u.totp_on) return Response.redirect(`${base}/login?mfa=${await newToken(env, u.id, 'mfa', 600e3)}`, 302);
  return new Response(null, { status: 302, headers: { location: base + '/chat', 'set-cookie': await sessionCookie(env, u.id) } });
}

// ---------- สร้างรูป (API แบบ OpenAI images) ----------
async function imageGen(req, env, u) {
  const s = await getSettings(env, ['image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_units', 'image_cost']);
  if (s.image_enabled !== '1' || !env[s.image_key_name]) return err('ระบบสร้างรูปยังไม่เปิดใช้');
  const b = await req.json(), prompt = String(b.prompt || '').trim().slice(0, 2000);
  if (!prompt) return err('บอกว่าอยากได้รูปแบบไหน');
  const plan = await planOf(env, u), st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ error: 'ลิมิตเต็มแล้ว', ...st }, 429);
  if (await limited(env, 'img:' + u.id, 10, 3600e3)) return err('สร้างรูปได้ชั่วโมงละ 10 รูป', 429);
  const r = await fetch(s.image_base_url.replace(/\/$/, '') + '/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env[s.image_key_name] },
    body: JSON.stringify({ model: s.image_model, prompt, n: 1, size: '1024x1024' }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { await event(env, 'error', null, 'image: ' + (d.error?.message || r.status)); return err(u.role === 'admin' ? 'แอดมิน: ' + (d.error?.message || r.status) : 'สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง', 502); }
  const item = d.data?.[0]; let bytes;
  if (item?.b64_json) bytes = unb64(item.b64_json); else if (item?.url) bytes = new Uint8Array(await (await fetch(item.url)).arrayBuffer()); else return err('ไม่ได้รูปกลับมา', 502);
  await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,0,0,0,0,?,?,?)').bind(u.id, +s.image_units || 0, +s.image_cost || 0, Date.now()).run();
  let src;
  if (env.SLIPS) { const name = rand(12) + '.png'; await env.SLIPS.put(`img/${u.id}/${name}`, bytes, { httpMetadata: { contentType: 'image/png' } }); src = `/api/img/${u.id}/${name}`; }
  else src = 'data:image/png;base64,' + b64(bytes); // ไม่มี R2: ส่งกลับอย่างเดียว ไม่เก็บ
  if (b.chat_id && env.SLIPS && await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(b.chat_id, u.id).first())
    await env.DB.batch([env.DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(b.chat_id, 'user', '🎨 ' + prompt, Date.now()),
      env.DB.prepare('INSERT INTO messages (chat_id,role,content,created_at) VALUES (?,?,?,?)').bind(b.chat_id, 'assistant', `![${prompt.slice(0, 80).replace(/[\[\]]/g, '')}](${src})`, Date.now())]);
  return json({ src, usage: await usageStatus(env, u, plan) });
}

// ---------- เติมโค้ดอัตโนมัติ (ghost text) ----------
async function complete(req, env, u) {
  if (await limited(env, 'complete:' + u.id, 40, 60e3)) return json({ text: '' });
  const b = await req.json(), plan = await planOf(env, u), st = await usageStatus(env, u, plan);
  if (st.pct4h >= 100 || st.pctWeek >= 100) return json({ text: '' });
  const want = +(await getSetting(env, 'autocomplete_model'));
  const m = await env.DB.prepare(`SELECT m.* FROM models m JOIN plan_models pm ON pm.model_id=m.id WHERE pm.plan_id=? AND m.active=1 ${want ? 'AND m.id=?' : ''} ORDER BY m.multiplier LIMIT 1`).bind(...(want ? [plan.id, want] : [plan.id])).first();
  if (!m) return json({ text: '' });
  const prefix = String(b.prefix || '').slice(-3000), suffix = String(b.suffix || '').slice(0, 1000);
  let text = '', usage = null;
  try {
    for await (const e of callModel(env, m, [{ role: 'user', content: `File: ${String(b.path || '').slice(0, 200)}\n<code>${prefix}<CURSOR>${suffix}</code>\nReturn ONLY the code to insert at <CURSOR> (at most a few lines). No explanations, no markdown fences. If nothing fits, return nothing.` }],
      { system: 'You are a code completion engine.', maxTokens: 96, effort: null })) { if (e.t) text += e.t; if (e.usage) usage = e.usage; }
  } catch { return json({ text: '' }); }
  if (usage) await logUsage(env, u.id, m, usage);
  return json({ text: text.replace(/^```\w*\n?|```$/g, '').replace(/<\/?code>|<CURSOR>/g, '').split('\n').slice(0, 8).join('\n').slice(0, 400) }); // เดาแค่ไม่กี่บรรทัด
}

// ---------- API สำหรับนักพัฒนา: /v1/models, /v1/chat/completions (แบบ OpenAI) คิดเงินจาก wallet ----------
const monthKey = () => new Date(Date.now() + BKK).toISOString().slice(0, 7); // เดือนตามเวลาไทย เช่น 2026-11
const slug = m => m.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
async function v1(req, env, ctx, path) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  const out = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...cors } });
  const fail = (m, s, type = 'invalid_request_error') => out({ error: { message: m, type } }, s);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const k = key && await env.DB.prepare('SELECT k.id kid, k.budget, k.models kmodels, k.spent, k.spent_month, u.* FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked=0').bind(await sha(key)).first();
    if (!k || k.banned) return fail('API key ไม่ถูกต้อง', 401, 'invalid_api_key');
    const allow = k.kmodels ? k.kmodels.split(',') : null; // key ที่จำกัดโมเดลไว้
    const models = (await env.DB.prepare('SELECT * FROM models WHERE active=1 AND public=1 ORDER BY sort').all()).results.filter(m => !allow || allow.includes(slug(m)));
    if (path === '/v1/models') return out({ object: 'list', data: models.map(m => ({ id: slug(m), object: 'model', created: 0, owned_by: m.provider })) });
    if (path !== '/v1/chat/completions' || req.method !== 'POST') return fail('not found', 404);
    if (await limited(env, 'api:' + k.kid, 60, 60e3)) return fail('ส่งคำขอเร็วเกินไป (60 ครั้ง/นาที)', 429, 'rate_limit_error');
    const b = await req.json().catch(() => null), m = models.find(x => slug(x) === b?.model || x.api_model === b?.model);
    if (!m) return fail(`ไม่พบโมเดล "${b?.model}" ดูรายชื่อที่ /v1/models`, 404);
    if (!(k.balance > 0)) return fail('ยอดเงินใน Wallet ไม่พอ เติมเงินที่ /plans', 402, 'insufficient_quota');
    const month = monthKey(), spent = k.spent_month === month ? k.spent : 0;
    if (k.budget != null && spent >= k.budget) return fail(`key นี้ใช้ครบงบเดือนนี้แล้ว (฿${k.budget})`, 429, 'insufficient_quota');
    const msgs = Array.isArray(b.messages) ? b.messages : [];
    const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';
    const system = msgs.filter(x => x.role === 'system' || x.role === 'developer').map(x => text(x.content)).join('\n\n');
    const hist = msgs.filter(x => x.role === 'user' || x.role === 'assistant').map(x => ({ role: x.role, content: text(x.content) })).filter(x => x.content);
    if (!hist.length || hist.at(-1).role !== 'user') return fail('messages ต้องลงท้ายด้วยข้อความของ user', 400);
    if (JSON.stringify(hist).length > 800000) return fail('ข้อความยาวเกินไป', 413);
    const effort = ['low', 'high', 'max'].includes(b.reasoning_effort) ? b.reasoning_effort : null, id = 'chatcmpl-' + rand(12), created = Math.floor(Date.now() / 1000), name = slug(m);
    const usageOut = u => ({ prompt_tokens: u.fresh + u.read + u.write, completion_tokens: u.out, total_tokens: u.fresh + u.read + u.write + u.out, prompt_tokens_details: { cached_tokens: u.read } });
    const finish = async u => {
      const charge = u ? await logUsage(env, k.id, m, u, { units: false, wallet: 'api' }) : 0;
      await env.DB.prepare('UPDATE api_keys SET spent=CASE WHEN spent_month=?1 THEN spent ELSE 0 END + ?2, spent_month=?1, last_used=?3 WHERE id=?4').bind(month, charge, Date.now(), k.kid).run();
    };
    const gen = callModel(env, m, hist, { system, effort, maxTokens: +b.max_tokens || +b.max_completion_tokens || undefined });
    if (!b.stream) {
      let content = '', reasoning = '', usage = null;
      try { for await (const e of gen) { if (e.t) content += e.t; if (e.th) reasoning += e.th; if (e.usage) usage = e.usage; } }
      catch (e) { await event(env, 'error', m.id, 'api: ' + e.message.slice(0, 200)); return fail('โมเดลตอบไม่ได้ตอนนี้', 502, 'api_error'); }
      await finish(usage);
      return out({ id, object: 'chat.completion', created, model: name, choices: [{ index: 0, message: { role: 'assistant', content, ...(reasoning ? { reasoning_content: reasoning } : {}) }, finish_reason: 'stop' }], usage: usage ? usageOut(usage) : undefined });
    }
    const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
    const chunk = (delta, extra = {}) => w.write(enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: name, choices: [{ index: 0, delta, finish_reason: null }], ...extra }) + '\n\n'));
    ctx.waitUntil((async () => {
      let usage = null;
      try {
        await chunk({ role: 'assistant', content: '' });
        for await (const e of gen) { if (e.t) await chunk({ content: e.t }); if (e.th) await chunk({ reasoning_content: e.th }); if (e.usage) usage = e.usage; }
        await w.write(enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: name, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: usage ? usageOut(usage) : null }) + '\n\n'));
      } catch (e) { await event(env, 'error', m.id, 'api: ' + e.message.slice(0, 200)); await w.write(enc.encode('data: ' + JSON.stringify({ error: { message: 'โมเดลตอบไม่ได้ตอนนี้', type: 'api_error' } }) + '\n\n')).catch(() => {}); }
      await finish(usage);
      await w.write(enc.encode('data: [DONE]\n\n')).catch(() => {}); await w.close().catch(() => {});
    })());
    return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...cors } });
  } catch (e) { console.log('v1 error', e.stack); return fail(e.user ? e.message : 'เซิร์ฟเวอร์ผิดพลาด', e.user ? 400 : 500, 'api_error'); }
}

// ---------- งานอัตโนมัติ (Cron ทุกชั่วโมง) ----------
async function cron(env) {
  const DB = env.DB, now = Date.now(), log = [];
  // 1) ต่ออายุอัตโนมัติจาก Wallet เมื่อเหลือไม่ถึง 24 ชม.
  for (const u of (await DB.prepare('SELECT u.*,p.price,p.price_year,p.name pname FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.auto_renew=1 AND u.banned=0 AND u.plan_expires BETWEEN ? AND ?').bind(now, now + DAY).all()).results) {
    const year = u.plan_period === 'year' && u.price_year, price = year ? u.price_year : u.price;
    if (u.balance >= price) {
      await walletAdd(env, u.id, -price, 'renew', u.pname);
      await DB.prepare('UPDATE users SET plan_expires=plan_expires+? WHERE id=?').bind((year ? 365 : 30) * DAY, u.id).run();
      await DB.prepare("INSERT INTO payments (user_id,plan_id,amount,slip_key,status,kind,period,created_at,approved_at) VALUES (?,?,?,'wallet','approved','plan',?,?,?)").bind(u.id, u.plan_id, price, year ? 'year' : 'month', now, now).run();
      await mail(env, u.email, 'AstraCode: ต่ออายุแพลนแล้ว', mailBox('ต่ออายุแพลนแล้ว', `ตัดเงินจาก Wallet ฿${price} ต่ออายุ ${u.pname} เรียบร้อย`)); log.push('renew ' + u.id);
    }
  }
  // 2) เตือนแพลนใกล้หมด (3 วัน) ครั้งเดียวต่อรอบ
  for (const u of (await DB.prepare('SELECT u.id,u.email,u.plan_expires,p.name pname FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.banned=0 AND u.plan_expires BETWEEN ? AND ? AND (u.reminded_at IS NULL OR u.reminded_at<>u.plan_expires)').bind(now, now + 3 * DAY).all()).results) {
    await mail(env, u.email, 'AstraCode: แพลนใกล้หมดอายุ', mailBox('แพลนใกล้หมดอายุ', `${u.pname} จะหมดอายุ ${new Date(u.plan_expires + BKK).toISOString().slice(0, 16).replace('T', ' ')} (เวลาไทย) ต่ออายุได้ที่หน้าแพลน หรือเปิด "ต่ออายุอัตโนมัติจาก Wallet" ในหน้าบัญชี`));
    await DB.prepare('UPDATE users SET reminded_at=plan_expires WHERE id=?').bind(u.id).run();
  }
  // 3) แจ้งเตือนต้นทุนวันนี้เกินกำหนด (วันละครั้ง)
  const lim = +(await getSetting(env, 'cost_alert_daily')), dayStart = Math.floor((now + BKK) / DAY) * DAY - BKK;
  if (lim > 0 && (await getSetting(env, 'cost_alert_day')) !== String(dayStart)) {
    const c = (await DB.prepare('SELECT COALESCE(SUM(cost),0) c FROM usage WHERE created_at>=?').bind(dayStart).first()).c;
    if (c > lim) { await notify(env, `💸 ต้นทุน API วันนี้ ฿${c.toFixed(2)} เกินที่ตั้งไว้ ฿${lim}`); await DB.prepare("INSERT OR REPLACE INTO settings VALUES ('cost_alert_day',?)").bind(String(dayStart)).run(); }
  }
  // 4) สำรองข้อมูลวันละครั้ง (ตี 3 เวลาไทย) เก็บ 14 ชุด
  if (env.SLIPS && new Date(now + BKK).getUTCHours() === 3) await backup(env);
  // 5) ล้างข้อมูลหมดอายุ
  await DB.batch([DB.prepare('DELETE FROM rate WHERE reset<?').bind(now), DB.prepare('DELETE FROM tokens WHERE expires<?').bind(now), DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now), DB.prepare('DELETE FROM events WHERE created_at<?').bind(now - 90 * DAY)]);
  return log;
}
async function backup(env) {
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','rate','tokens','_cf_KV')").all()).results.map(x => x.name), data = {};
  for (const t of tables) data[t] = (await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results;
  const key = `backup/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await env.SLIPS.put(key, JSON.stringify(data), { httpMetadata: { contentType: 'application/json' } });
  const old = (await env.SLIPS.list({ prefix: 'backup/' })).objects.sort((a, b) => a.key < b.key ? 1 : -1).slice(14);
  if (old.length) await env.SLIPS.delete(old.map(o => o.key));
  return key;
}

// ---------- หน้าสถานะระบบ ----------
async function status(env) {
  const now = Date.now(), from = now - 30 * DAY, day = c => `CAST((${c}+${BKK})/${DAY} AS INTEGER)`;
  const [models, ok, bad] = await Promise.all([
    env.DB.prepare('SELECT id,name FROM models WHERE active=1 AND public=1 ORDER BY sort').all(),
    env.DB.prepare(`SELECT model_id, ${day('created_at')} d, COUNT(*) n FROM usage WHERE created_at>=? GROUP BY model_id, d`).bind(from).all(),
    env.DB.prepare(`SELECT model_id, ${day('created_at')} d, COUNT(*) n, MAX(created_at) last FROM events WHERE kind='error' AND created_at>=? GROUP BY model_id, d`).bind(from).all(),
  ]);
  const today = Math.floor((now + BKK) / DAY);
  return { updated: now, models: models.results.map(m => {
    const days = Array.from({ length: 30 }, (_, i) => { const d = today - 29 + i, o = ok.results.find(x => x.model_id === m.id && x.d === d)?.n || 0, e = bad.results.find(x => x.model_id === m.id && x.d === d)?.n || 0; return { d: d * DAY, ok: o, err: e }; });
    const last = Math.max(0, ...bad.results.filter(x => x.model_id === m.id).map(x => x.last));
    const o = days.reduce((a, x) => a + x.ok, 0), e = days.reduce((a, x) => a + x.err, 0);
    return { name: m.name, uptime: o + e ? Math.round(o / (o + e) * 1000) / 10 : 100, down: now - last < 900e3, days };
  }) };
}

// ---------- SEO: robots, sitemap, meta ของบทความ ----------
function robots(req, env) { return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /account\n\nSitemap: ${origin(req, env)}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } }); }
async function sitemap(req, env) {
  const base = origin(req, env), posts = (await env.DB.prepare('SELECT slug,created_at FROM posts WHERE published=1').all()).results;
  const urls = ['/', '/pricing', '/plans', '/developers', '/blog', '/status', '/terms'].map(p => `<url><loc>${base}${p}</loc></url>`)
    .concat(posts.map(p => `<url><loc>${base}/blog/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.created_at).toISOString().slice(0, 10)}</lastmod></url>`));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { headers: { 'content-type': 'application/xml' } });
}
async function blogPage(req, env, slugQ) { // ใส่ title/description/og ของบทความลงหน้า HTML ให้ Google และ social เห็น
  const res = await env.ASSETS.fetch(new Request(new URL('/blog', req.url), req)); // /blog.html จะถูก redirect
  const p = await env.DB.prepare('SELECT title,summary,cover FROM posts WHERE slug=? AND published=1').bind(slugQ).first();
  if (!p) return res;
  const set = (sel, attr, v) => ({ element(e) { e.setAttribute(attr, v); } });
  return new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(p.title + ' · AstraCode'); } })
    .on('meta[name="description"]', set(0, 'content', p.summary || p.title))
    .on('meta[property="og:title"]', set(0, 'content', p.title))
    .on('meta[property="og:description"]', set(0, 'content', p.summary || p.title))
    .on('meta[property="og:image"]', p.cover ? set(0, 'content', p.cover.startsWith('/') ? origin(req, env) + p.cover : p.cover) : {})
    .on('meta[property="og:type"]', set(0, 'content', 'article'))
    .on('link[rel="canonical"]', set(0, 'href', `${origin(req, env)}/blog/${encodeURIComponent(slugQ)}`))
    .transform(new Response(res.body, res));
}
