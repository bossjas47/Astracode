import { claudeCreditLeft, isClaudeEco, modelCreditIds, useClaudeCredit, useModelCredit } from './credits.js';
import { pickBucket, BKK, DAY, capHit, reqCapHit, err, estTokens, ip, json, limited, limitedInfo, planOf, rand, sha, unlimit, usageStatus, WALLET_MIN } from './core.js';
import { SSE, callModel, chat, logFallback, logUsage, slimTools, webSearch } from './ai.js';
import { connCall, connTools } from './connectors.js';
import { unseal } from './projects.js';
import { blockedText, dayCapHit, event, getSetting, mail, mailBox, origin, priceOf, siteUrl } from './billing.js';
import { status } from './jobs.js';
// ---------- API สำหรับนักพัฒนา: /v1/models, /v1/chat/completions (แบบ OpenAI) คิดเงินจาก wallet ----------
export const monthKey = () => new Date(Date.now() + BKK).toISOString().slice(0, 7); // เดือนตามเวลาไทย เช่น 2026-11
export const WALLET_SLOTS = 8;
export const slug = m => m.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
export const V1_CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-api-key, anthropic-version, anthropic-beta', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-expose-headers': 'retry-after, x-request-id, x-ratelimit-limit-requests, x-ratelimit-remaining-requests, x-ratelimit-reset-requests, x-astracode-billing, x-kyber-billing, x-astracode-model, x-kyber-model' };
export const CTX_GUARD = 600000; // ตัวอักษร (~150K token)
export async function v1core(req, env, ctx, path, lg = {}) {
  const cors = V1_CORS, rid = 'req_' + rand(12);
  let rl = {}; // x-ratelimit-* ของคำขอนี้ (ใส่ในทุกคำตอบหลังผ่านการตรวจ key)
  // รีแบรนด์เป็น Kyber: ส่ง header ชื่อเดิม (x-astracode-*) คู่กับชื่อใหม่ (x-kyber-*) เสมอ ลูกค้าที่อ่าน header เดิมไม่พัง
  const dual = (h = {}) => { const o = { ...h }; for (const k of ['billing', 'model']) if (o['x-astracode-' + k] != null) o['x-kyber-' + k] = o['x-astracode-' + k]; return o; };
  const out = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'x-request-id': rid, ...cors, ...rl, ...dual(h) } });
  const EN = [ // ข้อความ error เป็นอังกฤษ (SDK ต่างชาติแสดงให้ผู้ใช้เห็น) เก็บข้อความไทยไว้ใน message_th
    [/^API key ไม่ถูกต้อง/, () => 'Invalid API key.'],
    [/^ส่งคำขอเร็วเกินไป/, () => 'Rate limit reached: 60 requests per minute per key.'],
    [/^ไม่พบโมเดล "(.*)"/, (_, n) => `The model "${n}" does not exist or is not available to this key. List models at /v1/models.`],
    [/^(.*) ใช้ถึงเพดานรายสัปดาห์แล้ว/, (_, n) => `${n} has reached its weekly cap on your plan.`],
    [/^ลิมิตแพลนเต็มแล้ว/, () => 'Plan limit reached (4-hour or weekly window).'],
    [/^แพลน (.*) ยังไม่รวมโหมด Agent/, (_, n) => `Plan ${n} does not include Agent mode (Pro and above, or an Agent pack). Turn Agent mode off to chat on your plan limits, or top up the wallet to use Agent pay-as-you-go.`],
    [/^แพลน (.*) ไม่รวมโมเดลนี้/, (_, n) => `Plan ${n} does not include this model and the wallet balance is too low.`],
    [/^ยอดเงินใน Wallet ไม่พอสำหรับ/, () => 'Wallet balance is too low for this request.'],
    [/^ยอดเงินใน Wallet ไม่พอ/, () => 'Wallet balance is too low. Top up at /plans.'],
    [/^key นี้ใช้ครบงบเดือนนี้แล้ว \(฿(.*)\)/, (_, b) => `This key has used its monthly budget (THB ${b}).`],
    [/^messages ต้องลงท้าย/, () => 'The last message must have role "user" or "tool".'],
    [/^โมเดล "(.*)" ไม่รองรับการส่งรูปภาพ/, (_, n) => `The model "${n}" does not accept images.`],
    [/^ข้อความยาวเกินไป/, () => 'The request is too long.'],
    [/^มีคำขอที่ใช้ Wallet ค้างอยู่/, () => 'Another wallet-billed request is still running on this account. Wait for it to finish.'],
    [/^โมเดลตอบไม่ได้ตอนนี้/, () => 'The model could not answer right now.'],
    [/^เซิร์ฟเวอร์ผิดพลาด/, () => 'Internal server error.'],
  ];
  const en = m => { for (const [r, f] of EN) { const g = m.match(r); if (g) return f(...g); } return m; };
  const fail = (m, s, type = 'invalid_request_error', h = {}) => { lg.err = en(m); return out({ error: { message: en(m), message_th: m, type } }, s, h); };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  let walletKey = null; // ล็อก Wallet ทีละคำขอ: ต้องปลดทุกทางออก (สำเร็จ/ผิดพลาด) ไม่งั้นผู้ใช้ติดล็อก 3 นาที
  try {
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || '';
    const k = key && await env.DB.prepare('SELECT k.id kid, k.budget, k.models kmodels, k.use_plan, k.spent, k.spent_month, k.ip_allow, k.name kname, u.* FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked=0 AND (k.expires_at IS NULL OR k.expires_at>?)').bind(await sha(key), Date.now()).first();
    if (!k || k.banned) return fail('API key ไม่ถูกต้อง', 401, 'invalid_api_key');
    lg.kid = k.kid; lg.uid = k.id;
    if (k.ip_allow && !ipAllowed(k.ip_allow, ip(req, env))) return fail('This IP address is not allowed for this API key.', 403, 'permission_error');
    // คำขอเรียกโมเดล: อ่านแพลน, นับ rate limit (คำสั่งเดียวได้ทั้งตัวนับและเวลารีเซ็ต), อ่าน body, แพ็ก Agent, เพดาน Wallet ต่อวัน พร้อมกัน · เดิมรอทีละคำสั่ง
    const isCall = req.method === 'POST' && ['/v1/chat/completions', '/v1/images/generations', '/v1/embeddings'].includes(path);
    const isAgentKey = /^(Desktop|Cloud) Agent/.test(k.kname || '');
    let [plan, packUsed, rate, b0, dayCapped] = await Promise.all([planOf(env, k),
      isAgentKey && k.agent_pack_until > Date.now() ? env.DB.prepare('SELECT COALESCE(SUM(pack),0) x FROM usage WHERE user_id=? AND created_at>=?').bind(k.id, k.agent_pack_from || 0).first().then(r => r.x) : null,
      isCall ? limitedInfo(env, 'api:' + k.kid, 60, 60e3) : null, isCall ? req.json().catch(() => null) : null,
      isCall && k.balance >= WALLET_MIN ? dayCapHit(env, k.id) : false]);
    // แอป Desktop / Agent บนคลาวด์ ใช้ key ชื่อ "Desktop Agent" / "Cloud Agent": แพลนที่รวม Agent (Pro ขึ้นไป) ใช้ลิมิตแพลน · แพลนอื่นใช้แพ็ก Agent ก่อน แล้วค่อย Wallet
    const packLeft = packUsed == null ? 0 : (k.agent_pack_units || 0) - packUsed;
    if (!(plan?.price > 0) && !(k.balance >= WALLET_MIN) && !(packLeft > 0) && !(await modelCreditIds(env, k.id).catch(() => new Set())).size) return fail('ยอดเงินใน Wallet ไม่พอ เติมเงินที่ /plans?topup=1 (ขั้นต่ำ ฿1)', 402, 'insufficient_quota'); // ไม่มีแพลนเสียเงิน: ใช้ได้ทุกโมเดลจาก Wallet ตามราคาขาย
    const canPlan = !!plan?.api_limit && k.use_plan !== 0 && !plan._team?.api_off; // หัวหน้าทีมปิด API ของสมาชิก = ใช้งบทีมไม่ได้ (ยังใช้ Wallet ของตัวเองได้)
    const allow = k.kmodels ? k.kmodels.split(',') : null; // key ที่จำกัดโมเดลไว้
    const [allPublic, planIds, mcIds] = await Promise.all([modelsCached(env), canPlan ? (plan._planIds?.length > 1 ? Promise.all(plan._planIds.map(id => planModelsCached(env, id))).then(a => new Set(a.flatMap(x => [...x]))) : planModelsCached(env, plan.id)) : null, modelCreditIds(env, k.id).catch(() => new Set())]); // mcIds = โมเดลที่มีเครดิตเฉพาะโมเดล // จำไว้ 30 วิ ต่อ isolate: ไม่ต้องถาม D1 ทุกคำขอ (ลดเวลาก่อนเริ่มตอบ)
    const models = allPublic.filter(m => (!allow || allow.includes(slug(m))) && (!canPlan || k.balance >= WALLET_MIN || planIds.has(m.id) || mcIds.has(m.id)));
    if (path === '/v1/models') return out({ object: 'list', data: models.map(m => ({ id: slug(m), object: 'model', created: 0, owned_by: m.provider, vision: !!m.vision, multiplier: m.multiplier ?? 1, cost: (m.cost_in || 0) + (m.cost_out || 0) })) }); // vision/multiplier: แอป Desktop ใช้เลือก "ตาช่วย" ให้โมเดลที่อ่านรูปไม่ได้
    if (path.startsWith('/v1/models/')) { const m = models.find(x => slug(x) === decodeURIComponent(path.slice(11))); return m ? out({ id: slug(m), object: 'model', created: 0, owned_by: m.provider }) : fail(`ไม่พบโมเดล "${decodeURIComponent(path.slice(11)).slice(0, 80)}" ดูรายชื่อที่ /v1/models`, 404); }
    // สั่ง Agent จากมือถือ: แอป Desktop ส่งความคืบหน้า/คำถามขออนุญาตของแชตนี้ขึ้นมา แล้วรับคำตอบ/ข้อความที่พิมพ์จากมือถือกลับไป
    if (path === '/v1/remote/push' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), cid = +b.chat_id;
      if (!await env.DB.prepare('SELECT 1 FROM chats WHERE id=? AND user_id=?').bind(cid, k.id).first()) return fail('ไม่พบแชต', 404);
      await ensureRemote(env);
      const row = await env.DB.prepare('SELECT events,answer,inbox FROM agent_remote WHERE chat_id=?').bind(cid).first();
      const parse = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } }; // แถวเก่าที่ JSON พัง (บั๊กตัดสตริงเดิม) ไม่ทำให้แชตนี้ error ถาวร
      const ev = [...(row ? parse(row.events || '[]', []) : []), ...(Array.isArray(b.events) ? b.events.slice(0, 200) : [])].slice(-300);
      let evJson = JSON.stringify(ev); // เกิน 400KB: ทิ้งเหตุการณ์เก่าสุดทีละชุด (เดิมตัดท้ายสตริง JSON → อ่านกลับไม่ได้)
      while (evJson.length > 400000 && ev.length) { ev.splice(0, Math.max(1, Math.ceil(ev.length / 10))); evJson = JSON.stringify(ev); }
      await env.DB.prepare('INSERT OR REPLACE INTO agent_remote (chat_id,user_id,events,ask,answer,inbox,running,updated_at) VALUES (?,?,?,?,NULL,NULL,?,?)').bind(cid, k.id, evJson, b.ask ? JSON.stringify(b.ask).slice(0, 5000) : null, b.running ? 1 : 0, Date.now()).run();
      return out({ answer: row?.answer ? parse(row.answer, null) : null, inbox: row?.inbox ? parse(row.inbox, []) : [] });
    }
    // สถิติ Agent ในแอป Desktop (ไม่มีเนื้อหางาน): สำเร็จไหม กี่รอบ ใช้เงินเท่าไร → หลังบ้านเลือกโมเดลเริ่มต้นจากข้อมูลจริง
    if (path === '/v1/agent/stat' && req.method === 'POST') {
      const b = await req.json().catch(() => ({})), n = (v, mx) => Math.max(0, Math.min(mx, +v || 0));
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, model TEXT, mode TEXT, rounds INTEGER, tools INTEGER, ok INTEGER, ms INTEGER, charge REAL, pct REAL, error TEXT, version TEXT, os TEXT, created_at INTEGER)').run();
      if (await limited(env, 'astat:' + k.id, 200, 3600e3)) return out({ ok: false });
      await env.DB.prepare('INSERT INTO agent_runs (user_id,model,mode,rounds,tools,ok,ms,charge,pct,error,version,os,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(k.id, String(b.model || '').slice(0, 80), String(b.mode || '').slice(0, 10), n(b.rounds, 1000), n(b.tools, 5000), b.ok ? 1 : 0, n(b.ms, 864e5), n(b.charge, 1e4), n(b.pct, 1e4), b.error ? String(b.error).slice(0, 300) : null, String(b.version || '').slice(0, 20), String(b.os || '').slice(0, 30), Date.now()).run();
      // Kyber Harness telemetry (แอป 0.10+): ลองใหม่กี่ครั้ง วนซ้ำกี่ครั้ง cache hit % TTFT และสถิติต่อเครื่องมือ (ไม่มีเนื้อหางาน) · ตารางแยก ไม่แตะ agent_runs
      const h = b.harness && typeof b.harness === 'object' ? b.harness : null;
      if (h) {
        const tools = Object.fromEntries(Object.entries(h.perTool || {}).slice(0, 40).map(([t, v]) => [String(t).slice(0, 60), { calls: n(v?.calls, 5000), errors: n(v?.errors, 5000) }]));
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_harness (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, model TEXT, retries INTEGER, stuck INTEGER, tool_errors INTEGER, cache_hit REAL, ttft_ms INTEGER, tools TEXT, created_at INTEGER)').run();
        await env.DB.prepare('INSERT INTO agent_harness (user_id,model,retries,stuck,tool_errors,cache_hit,ttft_ms,tools,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(k.id, String(b.model || '').slice(0, 80), n(h.retries, 1000), n(h.stuck, 1000), n(h.toolErrors, 5000), n(h.cacheHit, 100), n(h.ttftMs, 6e5), JSON.stringify(tools).slice(0, 4000), Date.now()).run().catch(() => {});
      }
      return out({ ok: true });
    }
    // Connector (Remote MCP ที่ลูกค้าเชื่อมไว้บนเว็บ เช่น Gmail/Notion ผ่าน Zapier/Composio): Agent ในแอปเรียกผ่านเซิร์ฟเวอร์ token ไม่ออกจากเซิร์ฟเวอร์
    if (path.startsWith('/v1/videos')) { const { videoV1 } = await import('./video.js'); const r = await videoV1(req, env, k, path); if (r) return r; } // สร้างวิดีโอผ่าน API (Kyber Harness บนคลาวด์ / ลูกค้า API)
    if (path === '/v1/mcp/tools' || (path === '/v1/mcp/call' && req.method === 'POST')) {
      const ct = await connTools(env, k.id, { ids: (await env.DB.prepare('SELECT id FROM mcp_servers WHERE user_id=0 AND enabled=1').all().catch(() => ({ results: [] }))).results.map(x => x.id), prefix: 'rmcp_' });
      const tools = ct.tools.map(t => { const x = ct.map.get(t.function.name); return { name: t.function.name, description: t.function.description, parameters: t.function.parameters, sv: x.sv, tool: x.name }; }); // ไม่รวมเครื่องมือที่ผู้ใช้ตั้ง "ห้ามใช้" · แอปถามผู้ใช้เองก่อนใช้
      if (path === '/v1/mcp/tools') return out({ tools: tools.map(({ name, description, parameters }) => ({ name, description, parameters })) });
      if (await limited(env, 'vmcp:' + k.kid, 300, 3600e3)) return fail('เรียก connector บ่อยเกินไป', 429, 'rate_limit_error');
      const b = await req.json().catch(() => ({})), t = tools.find(x => x.name === b.name); if (!t) return fail('ไม่พบเครื่องมือ ' + String(b.name || '').slice(0, 80), 404);
      try { return out({ text: String(await connCall(env, t.sv, t.tool, b.args && typeof b.args === 'object' ? b.args : {})).slice(0, 100000) }); }
      catch (e) { return out({ text: 'Error: ' + String(e.message).slice(0, 500) }); }
    }
    // ปลั๊กอินที่ Harness สร้างให้ตัวเอง: เก็บเป็น Skill / คำสั่งลัดของผู้ใช้ (ป้าย ai:<ชื่อ>) ใช้ได้ทั้งแชต แอปคอม และ Harness · ไม่มีส่วนที่รันโปรแกรม (MCP อยู่ในแอปคอมและต้องยืนยัน)
    if (path === '/v1/plugins') {
      const rows = async () => (await env.DB.prepare("SELECT name, description, content, COALESCE(as_text,0) t, plugin FROM skills WHERE user_id=? AND enabled=1 AND plugin LIKE 'ai:%' ORDER BY id").bind(k.id).all()).results;
      if (req.method === 'GET') {
        const by = new Map(); for (const r of await rows()) { const p = by.get(r.plugin) || { name: r.plugin.slice(3), title: r.plugin.slice(3), skills: [], commands: [] }; if (r.t) p.commands.push({ name: r.name, text: r.content }); else p.skills.push({ name: r.name, description: r.description, content: r.content }); by.set(r.plugin, p); }
        return out({ plugins: [...by.values()] });
      }
      if (req.method !== 'POST') return fail('method not allowed', 405);
      if (await limited(env, 'vplug:' + k.kid, 20, 3600e3)) return fail('สร้างปลั๊กอินบ่อยเกินไป', 429, 'rate_limit_error');
      const b = await req.json().catch(() => ({})), name = String(b.name || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(name)) return fail('name ต้องเป็น a-z 0-9 -', 400);
      const label = 'ai:' + name, title = String(b.title || name).slice(0, 60);
      const sk = (Array.isArray(b.skills) ? b.skills : []).filter(x => x?.name && x?.content).slice(0, 6), cm = (Array.isArray(b.commands) ? b.commands : []).filter(x => x?.name && x?.text).slice(0, 8);
      if (!sk.length && !cm.length) return fail('ต้องมี skills หรือ commands', 400);
      if (/\b(sk-[\w-]{12,}|ghp_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[abp]-[\w-]{10,})\b/.test(JSON.stringify([sk, cm]))) return fail('ห้ามใส่ key/token ลับในปลั๊กอิน', 400);
      const have = (await env.DB.prepare('SELECT COUNT(*) n FROM skills WHERE user_id=? AND COALESCE(plugin,\'\')<>?').bind(k.id, label).first()).n;
      if (have + sk.length + cm.length > 30) return fail('Skill และคำสั่งลัดของผู้ใช้เต็ม 30 อันแล้ว ให้ผู้ใช้ลบของเดิมบางส่วนก่อน', 409);
      const ins = (n, d, c, t) => env.DB.prepare('INSERT INTO skills (user_id,name,description,content,enabled,created_at,as_text,plugin) VALUES (?,?,?,?,1,?,?,?)').bind(k.id, String(n).slice(0, 60), String(d).slice(0, 200), String(c).slice(0, 6000), Date.now(), t, label);
      await env.DB.batch([env.DB.prepare('DELETE FROM skills WHERE user_id=? AND plugin=?').bind(k.id, label), ...sk.map(x => ins(x.name, x.description || `จากปลั๊กอิน ${title} (AI สร้าง)`, x.content, 0)), ...cm.map(x => ins(String(x.name).replace(/^\//, ''), `คำสั่งลัดจากปลั๊กอิน ${title} (AI สร้าง)`, x.text, 1))]);
      return out({ ok: true, plugin: label, skills: sk.length, commands: cm.length });
    }
    // ค้นเว็บให้ agent ในแอป Desktop (ไม่คิดเงิน จำกัด 60 ครั้ง/ชม. ต่อ key)
    if (path === '/v1/web_search' && req.method === 'POST') {
      if (await limited(env, 'vws:' + k.kid, 60, 3600e3)) return fail('ค้นเว็บบ่อยเกินไป (60 ครั้ง/ชม.)', 429, 'rate_limit_error');
      const q = String((await req.json().catch(() => ({}))).query || '').trim(); if (!q) return fail('ไม่มีคำค้น', 400);
      return out({ results: await webSearch(env, q) });
    }
    // แบบ OpenRouter: Cline / Kilo / Roo เรียกดูเครดิตที่เหลือทุกไม่กี่วินาที (เดิมตอบ 404 เต็มหน้าแอดมิน) · หน่วยเป็นบาทของ Wallet
    if (path === '/v1/credits' || path === '/v1/key' || path === '/v1/auth/key') {
      const used = k.spent_month === monthKey() ? +k.spent || 0 : 0, bal = Math.max(0, +k.balance || 0);
      return out(path === '/v1/credits' ? { data: { total_credits: +(bal + used).toFixed(4), total_usage: +used.toFixed(4) } } : { data: { label: k.kname || 'key', usage: +used.toFixed(4), limit: k.budget || null, limit_remaining: k.budget ? +Math.max(0, k.budget - used).toFixed(4) : null, is_free_tier: !(plan?.price > 0), balance: bal } });
    }
    if (path === '/v1/usage' && req.method === 'GET') {
      const st = await usageStatus(env, k, plan);
      const month = monthKey(), keySpent = k.spent_month === month ? k.spent : 0;
      const days = Math.min(90, Math.max(0, Math.floor(+new URL(req.url).searchParams.get('days')) || 0)), extra = {};
      if (days) { // ประวัติจาก api_log ของ key นี้ (มีข้อมูลเมื่อเริ่มบันทึกแล้วเท่านั้น)
        const from = Date.now() - days * DAY;
        extra.history = (await env.DB.prepare("SELECT date((created_at+25200000)/1000,'unixepoch') date, COUNT(*) requests, SUM(status<400) ok, COALESCE(SUM(tin),0) tokens_in, COALESCE(SUM(tout),0) tokens_out, ROUND(COALESCE(SUM(charge),0),4) charge FROM api_log WHERE key_id=? AND created_at>=? GROUP BY date ORDER BY date").bind(k.kid, from).all()).results;
        extra.by_model = (await env.DB.prepare("SELECT model, COUNT(*) requests, COALESCE(SUM(tin),0) tokens_in, COALESCE(SUM(tout),0) tokens_out, ROUND(COALESCE(SUM(charge),0),4) charge FROM api_log WHERE key_id=? AND created_at>=? AND model IS NOT NULL GROUP BY model ORDER BY charge DESC").bind(k.kid, from).all()).results;
      }
      return out({ plan: plan.name, api_limit_enabled: !!plan.api_limit, key_use_plan: k.use_plan !== 0, wallet_balance: k.balance, key_spent_month: keySpent, key_budget: k.budget, usage: st, ...extra });
    }
    const isImg = path === '/v1/images/generations', isEmb = path === '/v1/embeddings';
    if ((path !== '/v1/chat/completions' && !isImg && !isEmb) || req.method !== 'POST') return fail('not found', 404);
    const over = rate.over, rrow = rate;
    const secs = Math.max(1, Math.ceil(((rrow?.reset || 0) - Date.now()) / 1e3));
    rl = { 'x-ratelimit-limit-requests': '60', 'x-ratelimit-remaining-requests': String(Math.max(0, 60 - (rrow?.n || 0))), 'x-ratelimit-reset-requests': secs + 's' };
    if (over) return fail('ส่งคำขอเร็วเกินไป (60 ครั้ง/นาที)', 429, 'rate_limit_error', { 'retry-after': String(secs) });
    const b = b0 || {}, pool = allPublic.filter(x => (!allow || allow.includes(slug(x))) && (isImg ? x.provider === 'image' : isEmb ? x.provider === 'embedding' : x.provider !== 'embedding'));
    const m = pool.find(x => slug(x) === b.model || x.api_model === b.model) || ((isImg || isEmb) && !b.model ? pool[0] : null);
    if (!m) return fail(`ไม่พบโมเดล "${String(b?.model ?? '').slice(0, 80)}" ดูรายชื่อที่ /v1/models`, 404);
    // อ่านค่าล่าสุดของโมเดล + เพดานคำขอ/สัปดาห์ + ลิมิตแพลน + คำต้องห้าม + ส่วนบวกราคา พร้อมกัน · เพดานใช้ค่าจากรายการโมเดลที่จำไว้ (ค้างได้ไม่เกิน 30 วิ)
    if (canPlan && plan._subs?.length && planIds.has(m.id)) { const feats = { agent: plan.agent, api_limit: plan.api_limit, _planIds: plan._planIds }; plan = Object.assign(await pickBucket(env, k, plan, m.id), feats); } // หลายแพลน: ใบหลักก่อน เต็มแล้วสลับใบถัดไป
    const onPlan = canPlan && planIds.has(m.id) && (!isAgentKey || plan.agent); // Agent ใช้ลิมิตแพลนได้เฉพาะแพลนที่รวม Agent
    const [fresh, reqCapped, capped, st, blockWords, markup] = await Promise.all([env.DB.prepare('SELECT * FROM models WHERE id=?').bind(m.id).first(), reqCapHit(env, k, m),
      onPlan ? capHit(env, k, plan, m) : false, onPlan ? usageStatus(env, k, plan) : null, getSetting(env, 'block_words'), getSetting(env, 'price_markup')]);
    // รายการโมเดลค้างจาก memo ได้ 30 วิ: ถ้าแอดมินเพิ่งปิด/ซ่อนโมเดล ต้องปฏิเสธทันที (เดิมเรียกโมเดลที่ปิดแล้วได้อีกนานสุด 30 วิ)
    if (!fresh || !fresh.active || !fresh.public) return fail(`ไม่พบโมเดล "${String(b?.model ?? '').slice(0, 80)}" ดูรายชื่อที่ /v1/models`, 404);
    Object.assign(m, fresh); // ราคา/ตั้งค่าล่าสุดเสมอ
    if (reqCapped) return fail(`${m.name} reached its request cap (${m.req_cap} per 4 hours).`, 429, 'rate_limit_error');
    let billingMode = 'wallet';
    if (mcIds.has(m.id) && isCall) billingMode = 'mcredit'; // เครดิตเฉพาะโมเดล: ใช้ก่อนแพลน/Wallet
    const ccOk = onPlan && isClaudeEco(m) && (await claudeCreditLeft(env, k.id)).left > 0; // เครดิต Claude ที่แถม (Pro X2 ขึ้นไป)
    if (billingMode === 'mcredit') { /* ไม่ตรวจลิมิตแพลน/Wallet */ }
    else if (onPlan) {
      if (capped && !ccOk) return fail(`${m.name} ใช้ถึงเพดานรายสัปดาห์แล้ว`, 429, 'insufficient_quota');
      if (ccOk && (k.cc_first === 1 || capped || st.pct4h >= 100 || st.pctWeek >= 100)) billingMode = 'credit';
      else if (st.pct4h < 100 && st.pctWeek < 100) billingMode = 'plan';
      else if (k.wallet_overflow && k.balance >= WALLET_MIN) billingMode = 'wallet';
      else return fail('ลิมิตแพลนเต็มแล้ว (4 ชม. / สัปดาห์)', 429, 'insufficient_quota');
    } else if (packLeft > 0) billingMode = 'pack';
    else if (!(k.balance >= WALLET_MIN)) {
      // โมเดลอยู่ในแพลน แต่เรียกจากโหมด Agent และแพลนไม่รวม Agent: บอกตรงๆ (เดิมขึ้นว่า "แพลนไม่รวมโมเดลนี้" ทำให้ลูกค้างง)
      if (canPlan && isAgentKey && !plan.agent && planIds.has(m.id)) return fail(`แพลน ${plan.name} ยังไม่รวมโหมด Agent (มีในแพลน Pro ขึ้นไป หรือซื้อแพ็ก Agent) · ปิดโหมด Agent เพื่อแชตตามปกติด้วยลิมิตแพลน หรือเติม Wallet เพื่อใช้ Agent แบบจ่ายตามใช้`, 402, 'insufficient_quota');
      return fail(canPlan ? `แพลน ${plan.name} ไม่รวมโมเดลนี้ และยอดเงินใน Wallet ไม่พอ` : 'ยอดเงินใน Wallet ไม่พอ เติมเงินที่ /plans', 402, 'insufficient_quota');
    }
    if (billingMode === 'wallet' && dayCapped) return fail('Daily wallet limit reached (set on the account page).', 429, 'insufficient_quota');
    const month = monthKey(), spent = k.spent_month === month ? k.spent : 0;
    if (k.budget != null && spent >= k.budget) return fail(`key นี้ใช้ครบงบเดือนนี้แล้ว (฿${k.budget})`, 429, 'insufficient_quota');
    // พารามิเตอร์แบบ OpenAI: ตรวจแล้วส่งต่อให้โมเดล (ค่าผิดรูปแบบ = 400 ไม่ทิ้งเงียบๆ)
    const extra = {}, imageOpts = {};
    for (const [k, lo, hi] of [['temperature', 0, 2], ['top_p', 0, 1], ['presence_penalty', -2, 2], ['frequency_penalty', -2, 2]]) if (b[k] != null) { if (typeof b[k] !== 'number' || !(b[k] >= lo && b[k] <= hi)) return fail(`${k} must be a number between ${lo} and ${hi}.`, 400); extra[k] = b[k]; }
    if (b.seed != null) { if (!Number.isInteger(b.seed)) return fail('seed must be an integer.', 400); extra.seed = b.seed; }
    if (b.stop != null) { const st = typeof b.stop === 'string' ? [b.stop] : b.stop; if (!Array.isArray(st) || st.length > 4 || st.some(x => typeof x !== 'string' || !x || x.length > 64)) return fail('stop must be a string or up to 4 strings.', 400); extra.stop = st; }
    const rf = b.response_format;
    if (rf != null) { if (!['text', 'json_object', 'json_schema'].includes(rf.type)) return fail('response_format.type must be text, json_object or json_schema.', 400); if (rf.type !== 'text') extra.response_format = rf; }
    if (isImg) {
      if (b.n != null && b.n !== 1) return fail('Only n=1 is supported.', 400);
      if (b.size != null) { if (!/^(auto|\d{3,4}x\d{3,4})$/.test(b.size)) return fail('size must be auto or WIDTHxHEIGHT, for example 1024x1024.', 400); imageOpts.size = b.size; }
      if (b.quality != null) { if (!['auto', 'low', 'medium', 'high', 'standard', 'hd'].includes(b.quality)) return fail('quality must be auto, low, medium, high, standard or hd.', 400); imageOpts.quality = b.quality; }
      b.stream = false;
    }
    let embIn = null;
    if (isEmb) {
      embIn = typeof b.input === 'string' ? [b.input] : Array.isArray(b.input) && b.input.every(x => typeof x === 'string') ? b.input : null;
      if (!embIn?.length || embIn.length > 128 || embIn.some(x => !x)) return fail('input must be a string or an array of up to 128 non-empty strings.', 400);
      if (embIn.join('').length > 400000) return fail('ข้อความยาวเกินไป', 413);
      b.stream = false;
    }
    const msgs = isEmb ? [{ role: 'user', content: embIn.join('\n') }] : isImg ? [{ role: 'user', content: String(b.prompt || '').trim().slice(0, 4000) }] : Array.isArray(b.messages) ? b.messages : [];
    if (isImg && !msgs[0].content) return fail('prompt is required.', 400);
    const text = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';
    const hasImg = c => Array.isArray(c) && c.some(x => x?.type === 'image_url');
    const normContent = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x?.type === 'text' || x?.type === 'image_url') : '';
    let system = [m.sys_prompt?.trim(), ...msgs.filter(x => x.role === 'system' || x.role === 'developer').map(x => text(x.content))].filter(Boolean).join('\n\n'); // sys_prompt = บุคลิกประจำโมเดล (เช่นโมเดลการเงิน) มาก่อนคำสั่งของผู้เรียก
    let systemBlocks = Array.isArray(b._sys_blocks) && b._sys_blocks.length ? [...(m.sys_prompt?.trim() ? [{ type: 'text', text: m.sys_prompt.trim() }] : []), ...b._sys_blocks] : null;
    const hist = msgs.filter(x => ['user', 'assistant', 'tool'].includes(x.role)).map(x => x.role === 'tool'
      ? { role: 'tool', tool_call_id: String(x.tool_call_id || ''), content: typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? '') }
      : x.role === 'assistant' && Array.isArray(x.tool_calls) && x.tool_calls.length
        ? { role: 'assistant', content: text(x.content) || null, tool_calls: x.tool_calls }
        : { role: x.role, content: normContent(x.content) }).filter(x => x.role === 'tool' || (x.tool_calls?.length) || (Array.isArray(x.content) ? x.content.length : x.content));
    if (await blockedText(env, hist.map(x => typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? '')).join('\n'), blockWords)) return fail('This request contains content that is not accepted.', 400, 'invalid_request_error');
    if (extra.response_format && m.provider !== 'openai') { // Claude/Responses ไม่มี JSON mode แบบ chat/completions: สั่งผ่านคำสั่งระบบ
      const jsonHint = 'Respond with a single valid JSON value only: no prose, no code fences.' + (extra.response_format.json_schema?.schema ? ' It must match this JSON Schema: ' + JSON.stringify(extra.response_format.json_schema.schema).slice(0, 4000) : '');
      system += (system ? '\n\n' : '') + jsonHint; if (systemBlocks) systemBlocks.push({ type: 'text', text: jsonHint });
      delete extra.response_format;
    }
    if (!hist.length || !['user', 'tool'].includes(hist.at(-1).role)) return fail('messages ต้องลงท้ายด้วยข้อความของ user หรือ tool', 400);
    if (hist.some(x => hasImg(x.content)) && !m.vision) return fail(`โมเดล "${slug(m)}" ไม่รองรับการส่งรูปภาพ`, 400);
    // กันลิมิตหมดไว: เครื่องมืออย่าง OpenCode ที่ตั้ง context ไว้ใหญ่ (เดิมเราแนะนำ 1M) ส่งบทสนทนา 300K+ token ทุกรอบ · ประวัติยาวเกิน ~150K token = ย่อผลเครื่องมือเก่า (เก็บ 6 รอบล่าสุดเต็ม)
    // ผลเดิมของข้อความเดิมย่อแบบเดียวกันทุกครั้ง → prompt cache ส่วนต้นยังใช้ได้ · ปิดได้ด้วย header x-kyber-full-context: 1
    if (req.headers.get('x-kyber-full-context') !== '1' && JSON.stringify(hist).length > CTX_GUARD) slimTools(hist, 6, 4000);
    const histLen = JSON.stringify(hist).length;
    if (histLen > 4e6) return fail('ข้อความยาวเกินไป', 413); // ~1M token: ทุกโมเดล context 1.05M (เดิม 800K ตัวอักษร = เครื่องมือแบบ Claude Code / OpenCode ชนเร็ว)
    const cacheTtl = (histLen + system.length) >= 80000 ? '1h' : null; // context ยาว (~25K+ token): ใช้ cache 1 ชม. กันหมดอายุตอนหยุดอ่านโค้ดเกิน 5 นาที (ถ้า upstream ไม่รองรับ ai.js ถอยกลับ 5 นาทีเอง)
    const effort = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(b.reasoning_effort) ? b.reasoning_effort : null, id = 'chatcmpl-' + rand(12), created = Math.floor(Date.now() / 1000);
    const tools = Array.isArray(b.tools) && b.tools.length ? b.tools : undefined, toolChoice = b.tool_choice;
    let maxTokens = +b.max_tokens || +b.max_completion_tokens || undefined;
    if (billingMode === 'wallet') { // ตัดเงินหลังตอบ: จำกัดผลลัพธ์ไม่ให้เกินยอดที่เหลือ และให้ใช้ Wallet ทีละคำขอต่อผู้ใช้ กันยิงขนานจนยอดติดลบ
      const pr = await priceOf(env, m, false, markup), need = Math.ceil((JSON.stringify(hist).length + system.length) / 2) * pr.in / 1e6, room = k.balance - need;
      if (pr.req > 0 ? k.balance < pr.req : (!(room > 0) || (isImg && room < pr.out))) return fail('ยอดเงินใน Wallet ไม่พอสำหรับคำขอนี้', 402, 'insufficient_quota');
      // ยิงพร้อมกันได้ WALLET_SLOTS คำขอต่อบัญชี (OpenCode/Claude Code มี sub-agent + หลาย session) · ช่องแรกได้งบครึ่งหนึ่ง ช่องที่เหลือแบ่งอีกครึ่งเท่ากัน รวมไม่เกินยอดที่เหลือ · (เครื่องมือเขียนโค้ดยิงขนาน) · ช่องที่ k ได้งบ 1/2^(k+1) ของยอดที่เหลือ รวมทุกช่องไม่เกินยอดจริง Wallet จึงไม่ติดลบ
      for (let slot = 0; slot < WALLET_SLOTS && !walletKey; slot++) {
        const kk = 'walletlock:' + k.id + (slot ? ':' + slot : '');
        if (!await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(kk, Date.now() + 180e3, Date.now()).first()) continue;
        walletKey = kk;
        if (!(pr.req > 0)) maxTokens = Math.min(maxTokens || Infinity, Math.max(1, Math.floor(room * (slot ? 1 / (2 * (WALLET_SLOTS - 1)) : 0.5) * 1e6 / Math.max(pr.out, 1e-9)))); // คิดเหมาต่อ request ไม่ต้องจำกัดความยาวตามยอดที่เหลือ
      }
      if (!walletKey) return fail(`Too many wallet-billed requests at once (max ${WALLET_SLOTS}). Wait for one to finish.`, 429, 'rate_limit_error', { 'retry-after': '5' });
    } else if (billingMode === 'credit' || billingMode === 'mcredit') { // ยิงขนานได้สูงสุด 3 ช่อง (พอสำหรับ sub-agent แต่กันยิงรัว 60 ครั้งตอนเครดิตใกล้หมด)
      for (let slot = 0; slot < 3 && !walletKey; slot++) {
        const kk = 'creditlock:' + k.id + (slot ? ':' + slot : '');
        if (!await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(kk, Date.now() + 180e3, Date.now()).first()) continue;
        walletKey = kk;
      }
      if (!walletKey) return fail('Too many credit-billed requests at once (max 3). Wait for one to finish.', 429, 'rate_limit_error', { 'retry-after': '3' });
    }
    let activeModel = m; lg.model = slug(m); lg.req = String(b.model ?? '').slice(0, 80) || slug(m); // req = โมเดลที่ลูกค้าขอ · model = โมเดลที่ตอบจริง (ต่างกัน = สลับไปโมเดลสำรอง)
    const fbInfo = () => activeModel.id !== m.id ? { requested: slug(m), answered_by: slug(activeModel) } : undefined; // บอกลูกค้าตรงๆ เมื่อโมเดลที่ขอล่มแล้วตอบด้วยโมเดลสำรอง
    const usageOut = u => ({ prompt_tokens: u.fresh + u.read + u.write, completion_tokens: u.out, total_tokens: u.fresh + u.read + u.write + u.out, prompt_tokens_details: { cached_tokens: u.read }, ...(u.astra ? { astra: u.astra } : {}) });
    const estUsage = (outChars) => ({ fresh: Math.ceil((JSON.stringify(hist).length + system.length) / 2), read: 0, write: 0, out: Math.ceil(outChars / 2), flag: 'est' });
    const finish = async (u, outChars, flag = null) => { // flag: gone = ลูกค้าตัดกลางทาง · part = ผู้ให้บริการพังกลางคำตอบ (โชว์ในหลังบ้าน)
      const f0 = u || (outChars > 0 ? estUsage(outChars) : null), finalU = f0 && flag ? { ...f0, flag: f0.flag ? flag + '+est' : flag } : f0;
      const charge = finalU ? await logUsage(env, k.id, activeModel, finalU, billingMode === 'plan' || billingMode === 'credit' || billingMode === 'mcredit' ? { units: billingMode === 'plan', wallet: null, plan, src: 'api' } : billingMode === 'pack' ? { units: false, wallet: null, plan, src: 'agent', pack: true } : { units: false, wallet: 'api', plan, src: 'api' }) : 0;
      if (finalU && billingMode === 'mcredit') await useModelCredit(env, k.id, activeModel.id, finalU._cost || 0).catch(() => {});
      if (finalU && billingMode === 'credit') await useClaudeCredit(env, k.id, finalU._cost || 0).catch(() => {}); // หักจากเครดิตที่แถมแทนลิมิต
      if (finalU) finalU.astra = { charge_thb: charge, week_pct: plan?.limit_week > 0 && finalU._units ? +(finalU._units / plan.limit_week * 100).toFixed(4) : 0, ...(finalU._pack ? { pack_pct: +(finalU._pack / (k.agent_pack_units || 1) * 100).toFixed(4) } : {}) }; // ค่าใช้จ่ายคำขอนี้: บาทจาก Wallet / % ลิมิตสัปดาห์ (แอป Desktop ใช้คุมเพดานต่องาน)
      await env.DB.prepare('UPDATE api_keys SET spent=CASE WHEN spent_month=?1 THEN spent ELSE 0 END + ?2, spent_month=?1, last_used=?3 WHERE id=?4').bind(month, charge, Date.now(), k.kid).run();
      if (walletKey) await unlimit(env, walletKey);
      lg.model = slug(activeModel); lg.tin = finalU ? finalU.fresh + finalU.read + finalU.write : 0; lg.tout = finalU?.out || 0; lg.tcr = finalU?.read || 0; lg.charge = charge; lg.logged = true;
      await apiLog(env, lg, 200);
      if (k.budget > 0) for (const [pct, label] of [[1, 'ใช้ครบงบแล้ว'], [0.8, 'ใช้ไป 80% ของงบแล้ว']]) { // เตือนครั้งเดียวตอนข้ามเส้น (งบรีเซ็ตทุกเดือน)
        if (spent < k.budget * pct && spent + charge >= k.budget * pct) {
          if (k.webhook_url) await fetch(k.webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'api_key_budget', threshold: pct, key: k.kname || 'key', spent: +(spent + charge).toFixed(4), budget: k.budget, month }), signal: AbortSignal.timeout(4000), redirect: 'manual' }).catch(() => {}); // ปลายทางที่ผู้ใช้ตั้งเอง: https เท่านั้น ไม่ตามรีไดเรกต์
          await mail(env, k.email, `Kyber: API key "${k.kname || 'key'}" ${label}`, mailBox('งบ API key ' + label, `ใช้ไปแล้ว ฿${(spent + charge).toFixed(2)} จากงบ ฿${k.budget} ของเดือนนี้`, 'จัดการ key', siteUrl(env) + '/developers')).catch(() => {}); break; }
      }
      return finalU;
    };
    // นาฬิกาเฝ้าโมเดล (/v1): ไม่มี token แรกภายใน first_token_s หรือเงียบกลางทางเกิน idle_s (ตั้งต่อโมเดลในหลังบ้าน · ค่าเริ่มต้นของ API หลวมกว่าแชต เพราะ context ยาว) → ตัดแล้วสลับโมเดลสำรองได้ แทนที่ลูกค้าจะค้างจน timeout
    const watch = (mod, outer = null) => {
      const ac = new AbortController(), first = (mod.first_token_s > 0 ? mod.first_token_s : ['high', 'xhigh', 'max'].includes(effort) ? 300 : 180) * 1000, idle = (mod.idle_s > 0 ? mod.idle_s : 120) * 1000;
      let stalled = 0, t; const arm = ms => { clearTimeout(t); t = setTimeout(() => { stalled = ms; ac.abort(); }, ms); }, onOuter = () => ac.abort();
      outer?.addEventListener('abort', onOuter, { once: true }); arm(first);
      return { signal: ac.signal, tick: () => arm(idle), done: () => { clearTimeout(t); outer?.removeEventListener('abort', onOuter); }, err: e => stalled ? new Error(`no response from the model within ${Math.round(stalled / 1000)} s`) : e };
    };
    const nextFallback = async cur => cur.fallback_id ? env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(cur.fallback_id).first() : null;
    if (isEmb) {
      const key = env[m.key_name];
      if (billingMode === 'wallet' && k.balance < Math.ceil(embIn.join('').length / 2) * (await priceOf(env, m)).in / 1e6) { if (walletKey) await unlimit(env, walletKey); return fail('ยอดเงินใน Wallet ไม่พอสำหรับคำขอนี้', 402, 'insufficient_quota'); }
      const body = { model: m.api_model, input: embIn, encoding_format: b.encoding_format === 'base64' ? 'base64' : 'float' };
      if (Number.isInteger(b.dimensions) && b.dimensions > 0) body.dimensions = b.dimensions;
      const r = key && await fetch(m.base_url.replace(/\/$/, '') + '/embeddings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      if (!Array.isArray(d?.data)) { await event(env, 'error', m.id, 'api: embeddings ' + (r?.status || 'no response')); if (walletKey) await unlimit(env, walletKey); return fail('โมเดลตอบไม่ได้ตอนนี้', 502, 'api_error'); }
      const tokens = d.usage?.prompt_tokens ?? Math.ceil(embIn.join('').length / 2);
      await finish({ fresh: tokens, read: 0, write: 0, out: 0 }, 0);
      return out({ object: 'list', data: d.data, model: slug(m), usage: { prompt_tokens: tokens, total_tokens: tokens } }, 200, { 'x-astracode-billing': billingMode });
    }
    if (!b.stream) { // ทำใน waitUntil: ลูกค้าตัดการเชื่อมต่อระหว่างรอ ยังทำต่อจนคิดเงินได้ (ผู้ให้บริการคิดเงินเราแล้ว)
      const job = (async () => {
      let content = '', reasoning = '', usage = null, finishReason = 'stop', tcs = new Map(), anthIdx = new Map();
      for (let attempt = 0; attempt < 2; attempt++) {
        const wd = watch(activeModel);
        try {
          for await (const e of callModel(env, activeModel, hist, { system, systemBlocks, effort, maxTokens, tools, toolChoice, userId: k.id, extra, imageOpts, api: true, cacheTtl, signal: wd.signal })) {
            wd.tick();
            if (!lg.ttft && (e.t || e.th || e.tc_start || e.tc)) lg.ttft = Date.now() - lg.t0;
            if (e.t) content += e.t;
            if (e.th) reasoning += e.th;
            if (e.tc_start) { const idx = tcs.size; anthIdx.set(e.tc_start.index, idx); tcs.set(idx, { id: e.tc_start.id, type: 'function', function: { name: e.tc_start.name, arguments: '' } }); }
            if (e.tc_delta) { const idx = anthIdx.get(e.tc_delta.index); if (idx != null) tcs.get(idx).function.arguments += e.tc_delta.args; }
            if (e.tc) for (const d of e.tc) {
              const idx = d.index ?? 0;
              if (!tcs.has(idx)) tcs.set(idx, { id: d.id || 'call_' + rand(8), type: 'function', function: { name: '', arguments: '' } }); // ชื่อต่อท้ายบรรทัดถัดไปครั้งเดียว (ไม่ใส่ซ้ำสองรอบ)
              const c = tcs.get(idx); if (d.id) c.id = d.id; if (d.function?.name) c.function.name += d.function.name; if (d.function?.arguments) c.function.arguments += d.function.arguments;
            }
            if (e.stop_reason) finishReason = e.stop_reason;
            if (e.usage) usage = e.usage;
          }
          wd.done(); break;
        } catch (e0) {
          wd.done(); const e = wd.err(e0);
          await event(env, 'error', activeModel.id, 'api: ' + e.message.slice(0, 200));
          const fb = attempt === 0 && !content && !reasoning && !tcs.size ? await nextFallback(activeModel) : null;
          if (fb && (!hist.some(x => hasImg(x.content)) || fb.vision)) { await logFallback(env, activeModel, fb, 'error: ' + e.message.slice(0, 120), 'api', k.id); activeModel = fb; continue; }
          if (content || reasoning || tcs.size) await finish(usage, content.length + reasoning.length + 2, 'part'); // พังกลางคำตอบ: ผู้ให้บริการคิดเงินส่วนที่ทำไปแล้ว
          else if (walletKey) await unlimit(env, walletKey);
          return fail('โมเดลตอบไม่ได้ตอนนี้', 502, 'api_error');
        }
      }
      if (isImg) {
        const src = content.match(/\]\((data:[^)]+|https?:[^)]+)\)/)?.[1];
        await finish(src ? usage : null, 0);
        if (!src) return fail('The image model returned no image.', 502, 'api_error');
        return out({ created, data: [src.startsWith('data:') ? { b64_json: src.slice(src.indexOf(',') + 1) } : { url: src }] }, 200, { 'x-astracode-billing': billingMode });
      }
      const toolCalls = [...tcs.values()]; if (toolCalls.length) finishReason = 'tool_calls';
      const used = await finish(usage, content.length + reasoning.length + JSON.stringify(toolCalls).length);
      return out({ id, object: 'chat.completion', created, model: slug(activeModel), choices: [{ index: 0, message: { role: 'assistant', content: content || (toolCalls.length ? null : ''), ...(reasoning ? { reasoning_content: reasoning } : {}), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finishReason }], usage: used ? usageOut(used) : undefined, astra_fallback: fbInfo() }, 200, { 'x-astracode-billing': billingMode, 'x-astracode-model': slug(activeModel) });
      })();
      ctx.waitUntil(job.catch(() => {}));
      return await job;
    }
    const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
    // ลูกค้าตัดการเชื่อมต่อกลางคำตอบ (กดหยุด / timeout / ส่งซ้ำ): ผู้ให้บริการยังคิดเงินเรา → อ่านต่อเงียบๆ จนได้ token จริงแล้วคิดเงินตามจริง
    // อ่านต่อได้ไม่เกิน 25 วินาที (Cloudflare ให้งานเบื้องหลังหลังลูกค้าหลุดราว 30 วินาที) เกินนั้นตัดแล้วคิดตามประมาณ
    let gone = false; const upstream = new AbortController();
    const lost = () => { if (!gone) { gone = true; setTimeout(() => upstream.abort(), 25e3); } };
    const chunk = async (delta, extra = {}, fin = null) => { if (gone) return; try { await w.write(enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: slug(activeModel), choices: [{ index: 0, delta, finish_reason: fin }], ...extra }) + '\n\n')); } catch { lost(); } };
    // keepalive: comment ของ SSE ทุก 15 วินาทีระหว่างโมเดลคิด/อ่าน context ยาว · proxy/ตัวกลาง/SDK ของลูกค้าไม่ตัดเพราะเงียบนาน (client ทุกตัวข้ามบรรทัดที่ขึ้นต้นด้วย :)
    const ka = setInterval(() => { if (!gone) w.write(enc.encode(': ping\n\n')).catch(lost); }, +env.SSE_PING_MS || 15e3); // SSE_PING_MS: ใช้ในเทสต์เท่านั้น
    // โมเดล error ก่อนตอบ: ต้องคืนช่อง Wallet ด้วย (เดิมค้าง 3 นาที → OpenCode ลองซ้ำจนช่องเต็ม 8 ช่อง)
    ctx.waitUntil((async () => {
      let usage = null, outChars = 0, finishReason = 'stop', sentAny = false, anthIdx = new Map(), tcCount = 0;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const wd = watch(activeModel, upstream.signal);
          try {
            for await (const e of callModel(env, activeModel, hist, { system, systemBlocks, effort, maxTokens, tools, toolChoice, userId: k.id, extra, imageOpts, api: true, cacheTtl, signal: wd.signal })) {
              wd.tick();
              if (!sentAny) { sentAny = true; if (!lg.ttft) lg.ttft = Date.now() - lg.t0; await chunk({ role: 'assistant', content: '' }, fbInfo() ? { astra_fallback: fbInfo() } : {}); } // สตรีม: header ส่งไปก่อนรู้ว่าสลับไหม จึงบอกใน chunk แรก
              if (e.t) { outChars += e.t.length; await chunk({ content: e.t }); }
              if (e.th) { outChars += e.th.length; await chunk({ reasoning_content: e.th }); }
              if (e.tc_start) { const idx = tcCount++; anthIdx.set(e.tc_start.index, idx); await chunk({ tool_calls: [{ index: idx, id: e.tc_start.id, type: 'function', function: { name: e.tc_start.name, arguments: '' } }] }); }
              if (e.tc_delta) { const idx = anthIdx.get(e.tc_delta.index); if (idx != null) { outChars += e.tc_delta.args.length; await chunk({ tool_calls: [{ index: idx, function: { arguments: e.tc_delta.args } }] }); } }
              if (e.tc) { outChars += JSON.stringify(e.tc).length; tcCount = Math.max(tcCount, e.tc.length); await chunk({ tool_calls: e.tc }); }
              if (e.stop_reason) finishReason = e.stop_reason;
              if (e.usage) usage = e.usage;
            }
            wd.done(); break;
          } catch (e0) {
            wd.done(); const e = wd.err(e0);
            if (gone) break;
            await event(env, 'error', activeModel.id, 'api: ' + e.message.slice(0, 200));
            const fb = attempt === 0 && !sentAny ? await nextFallback(activeModel) : null;
            if (fb && (!hist.some(x => hasImg(x.content)) || fb.vision)) { await logFallback(env, activeModel, fb, 'error: ' + e.message.slice(0, 120), 'api', k.id); activeModel = fb; continue; }
            throw e;
          }
        }
        if (tcCount > 0 && finishReason === 'stop') finishReason = 'tool_calls';
        const used = await finish(usage, gone ? Math.max(outChars, 2) : outChars, gone ? 'gone' : null);
        if (!gone) await chunk({}, { usage: used ? usageOut(used) : null }, finishReason);
      } catch (e) { if (sentAny && !lg.logged) await finish(usage, Math.max(outChars, 2), 'part').catch(() => {}); else if (walletKey && !lg.logged) await unlimit(env, walletKey).catch(() => {}); await w.write(enc.encode('data: ' + JSON.stringify({ error: { message: 'The model could not answer right now.', message_th: 'โมเดลตอบไม่ได้ตอนนี้', type: 'api_error' } }) + '\n\n')).catch(() => {}); }
      clearInterval(ka); await w.write(enc.encode('data: [DONE]\n\n')).catch(() => {}); await w.close().catch(() => {});
    })().finally(() => clearInterval(ka)));
    return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-astracode-billing': billingMode, 'x-kyber-billing': billingMode, ...cors, ...rl } });
  } catch (e) { console.log('v1 error', e.stack); if (walletKey) await unlimit(env, walletKey).catch(() => {}); return fail(e.user ? e.message : 'เซิร์ฟเวอร์ผิดพลาด', e.user ? 400 : 500, 'api_error'); }
}

// ---------- ตัวช่วย /v1: บันทึกคำขอ, IP allowlist, ตัวห่อและตัวแปลง Anthropic Messages / OpenAI Responses ----------
// ตารางสั่ง Agent จากมือถือ (สร้างเองครั้งแรก) · events = ความคืบหน้าล่าสุด 300 รายการ, ask = คำถามขออนุญาตที่รอ, answer/inbox = จากมือถือ รอแอปมารับ
// คุณภาพงาน Agent ต่อโมเดล (สถิติที่แอป Desktop ส่งกลับ ไม่มีเนื้อหางาน): agent_runs + agent_harness
// flagged = งาน ≥ 10 แล้วสำเร็จ < 60% หรือวนซ้ำ (stuck) ≥ 30% ของงาน → หน้าเว็บเตือนก่อนใช้โมเดลนั้นทำงาน Agent
export async function agentQuality(env, days = 14) {
  const since = Date.now() - days * DAY;
  const [runs, h] = await Promise.all([
    env.DB.prepare('SELECT model, COUNT(*) n, SUM(ok) ok, AVG(rounds) rounds, AVG(tools) tools, AVG(ms) ms, AVG(charge) charge FROM agent_runs WHERE created_at>? GROUP BY model').bind(since).all().then(r => r.results).catch(() => []),
    env.DB.prepare('SELECT model, COUNT(*) n, SUM(stuck>0) stuck_runs, AVG(tool_errors) tool_err, AVG(retries) retries, AVG(cache_hit) cache_hit, AVG(ttft_ms) ttft_ms FROM agent_harness WHERE created_at>? GROUP BY model').bind(since).all().then(r => r.results).catch(() => [])]);
  const hm = new Map(h.map(x => [x.model, x]));
  return runs.map(r => {
    const x = hm.get(r.model) || {}, okRate = r.n ? (r.ok || 0) / r.n : 0, stuckRate = x.n ? (x.stuck_runs || 0) / x.n : null, why = [];
    if (r.n >= 10 && okRate < 0.6) why.push(`งานสำเร็จแค่ ${Math.round(okRate * 100)}%`);
    if (x.n >= 10 && stuckRate >= 0.3) why.push(`ทำงานวนซ้ำใน ${Math.round(stuckRate * 100)}% ของงาน`);
    return { model: r.model, n: r.n, ok_rate: okRate, rounds: r.rounds, tools: r.tools, ms: r.ms, charge: r.charge, harness_n: x.n || 0, stuck_rate: stuckRate, tool_err: x.tool_err ?? null, retries: x.retries ?? null, cache_hit: x.cache_hit ?? null, ttft_ms: x.ttft_ms ?? null, flagged: why.length > 0, reason: why.join(' · ') };
  }).sort((a, b) => b.n - a.n);
}
export const ensureRemote = env => env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_remote (chat_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, events TEXT, ask TEXT, answer TEXT, inbox TEXT, running INTEGER, updated_at INTEGER)').run();
export const apiLog = (env, lg, status) => env.DB.prepare('INSERT INTO api_log (key_id,user_id,path,model,req_model,status,tin,tout,tcr,ttft,charge,ms,err,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(lg.kid, lg.uid, lg.path, lg.model || null, lg.req || null, status, lg.tin || 0, lg.tout || 0, lg.tcr || 0, lg.ttft || null, lg.charge || 0, Date.now() - lg.t0, status >= 400 ? (lg.err || '').slice(0, 200) || null : null, Date.now()).run().catch(() => {});
export const v4 = x => { const p = String(x).split('.'); return p.length === 4 && p.every(n => /^\d{1,3}$/.test(n) && +n < 256) ? p.reduce((a, n) => a * 256 + +n, 0) : null; };
// IPv6 เป็น BigInt 128 บิต (รองรับ :: ย่อ) · null = ไม่ใช่ IPv6
export const v6 = x => {
  x = String(x).toLowerCase(); if (!x.includes(':') || x.includes('.')) return null;
  const [h, t, extra] = x.split('::'); if (extra != null) return null;
  const a = h ? h.split(':') : [], b = t != null ? (t ? t.split(':') : []) : null, parts = b ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  if (parts.length !== 8 || !parts.every(p => /^[0-9a-f]{1,4}$/.test(p))) return null;
  return parts.reduce((n, p) => (n << 16n) + BigInt(parseInt(p, 16)), 0n);
};
// list = IP หรือ CIDR (IPv4 และ IPv6) คั่นด้วย ,
export const ipAllowed = (list, addr) => list.split(',').some(e => {
  e = e.trim(); if (!e) return false;
  const [base, n] = e.split('/'), bits = n == null ? null : +n;
  const a4 = v4(addr), c4 = v4(base);
  if (a4 != null && c4 != null) { const b = bits ?? 32; if (!(b >= 0 && b <= 32)) return false; const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0; return ((a4 & mask) >>> 0) === ((c4 & mask) >>> 0); }
  const a6 = v6(addr), c6 = v6(base);
  if (a6 != null && c6 != null) { const b = bits ?? 128; if (!(b >= 0 && b <= 128)) return false; const sh = BigInt(128 - b); return a6 >> sh === c6 >> sh; }
  return n == null && e === addr;
});
// รายการโมเดล/โมเดลในแพลน เปลี่ยนไม่บ่อย: จำไว้ใน isolate 30 วินาที (แก้ในหลังบ้านมีผลภายใน 30 วิ)
const memo = new Map();
const cached = async (key, ms, load) => { const h = memo.get(key); if (h && h.exp > Date.now()) return h.v; const v = await load(); memo.set(key, { v, exp: Date.now() + ms }); return v; };
const modelsCached = env => cached('models', 30e3, async () => (await env.DB.prepare('SELECT * FROM models WHERE active=1 AND public=1 ORDER BY sort').all()).results.filter(m => env[m.key_name])); // ไม่มีคีย์ใน Worker = เรียกไปก็ error (missing key): ไม่แสดงใน /v1/models เหมือนหน้าเว็บ
const planModelsCached = (env, pid) => cached('pm:' + pid, 30e3, async () => new Set((await env.DB.prepare('SELECT model_id FROM plan_models WHERE plan_id=?').bind(pid).all()).results.map(x => x.model_id)));
export async function v1(req, env, ctx, path) {
  if (path.length > 4 && path.endsWith("/")) path = path.replace(/\/+$/, ""); // /v1/credits/ = /v1/credits (บางโปรแกรมเติม / ท้าย)
  const lg = { t0: Date.now(), path };
  const res = path.startsWith('/v1/messages') ? await anthropicApi(req, env, ctx, path, lg) : path === '/v1/responses' ? await responsesApi(req, env, ctx, lg) : await v1core(req, env, ctx, path, lg);
  if (lg.kid && !lg.logged && res.status >= 400) ctx.waitUntil(apiLog(env, lg, res.status));
  return res;
}
// เรียก chat/completions ภายในด้วยเนื้อความที่แปลงแล้ว (key มาจาก Authorization หรือ x-api-key)
export const innerChat = (req, env, ctx, lg, body) => {
  const h = new Headers(req.headers), key = (h.get('authorization') || '').replace(/^Bearer\s+/i, '') || h.get('x-api-key') || '';
  h.set('authorization', 'Bearer ' + key); h.set('content-type', 'application/json');
  return v1core(new Request(new URL('/v1/chat/completions', req.url), { method: 'POST', headers: h, body: JSON.stringify(body) }), env, ctx, '/v1/chat/completions', lg);
};
export async function* chatChunks(res) { // อ่าน SSE ของ chat/completions ทีละก้อน JSON
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:') && !line.includes('[DONE]')) { try { yield JSON.parse(line.slice(5)); } catch { /* ข้าม */ } } }
    }
    buf = (buf + dec.decode()).trim(); if (buf.startsWith('data:') && !buf.includes('[DONE]')) { try { yield JSON.parse(buf.slice(5)); } catch { /* ข้าม */ } } // ก้อนสุดท้ายที่ไม่มี \n
  } finally { rd.cancel().catch(() => {}); } // ลูกค้าของ /v1/messages, /v1/responses ตัดกลางทาง: ยกเลิกสตรีมด้านใน ไม่งั้นด้านในค้างรอไม่จบและไม่คิดเงิน
}
// ping = keepalive ทุก 15 วินาที (Anthropic: event ping ตามสเปก · Responses: comment ของ SSE) · close() ล้างตัวจับเวลาเสมอ
export const sseOut = (ping = ': ping\n\n', every = 15e3) => {
  const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
  const ka = ping ? setInterval(() => { w.write(enc.encode(ping)).catch(() => clearInterval(ka)); }, every) : null;
  return { readable, w, send: (name, data) => w.write(enc.encode(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`)), close: () => { clearInterval(ka); return w.close().catch(() => {}); } };
};
export const passHeaders = res => { const h = {}; for (const k of ['retry-after', 'x-request-id', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests', 'x-astracode-billing', 'x-kyber-billing', 'x-astracode-model', 'x-kyber-model']) { const v = res.headers.get(k); if (v) h[k] = v; } return { ...V1_CORS, ...h }; };
export const usageIn = u => ({ cached: u?.prompt_tokens_details?.cached_tokens || 0, input: (u?.prompt_tokens || 0) - (u?.prompt_tokens_details?.cached_tokens || 0), output: u?.completion_tokens || 0 });

// --- Anthropic Messages API: POST /v1/messages, /v1/messages/count_tokens ---
export const aText = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';
export function anthropicToChat(b) {
  const msgs = [], sysBlocks = Array.isArray(b.system) ? b.system.filter(x => x && typeof x.text === 'string' && x.text).map(x => ({ type: 'text', text: x.text, ...(x.cache_control ? { cache_control: x.cache_control } : {}) })) : (typeof b.system === 'string' && b.system ? [{ type: 'text', text: b.system }] : []);
  const sys = sysBlocks.map(x => x.text).join('\n');
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of Array.isArray(b.messages) ? b.messages : []) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const tc = blocks.filter(x => x.type === 'tool_use').map(x => ({ id: x.id, type: 'function', function: { name: x.name, arguments: JSON.stringify(x.input ?? {}) } })), text = blocks.filter(x => x.type === 'text').map(x => x.text).join('');
      msgs.push({ role: 'assistant', content: text || (tc.length ? null : ''), ...(tc.length ? { tool_calls: tc } : {}) });
    } else {
      for (const x of blocks.filter(x => x.type === 'tool_result')) msgs.push({ role: 'tool', tool_call_id: x.tool_use_id, content: aText(x.content) || (x.is_error ? 'error' : '') });
      const parts = blocks.flatMap(x => x.type === 'text' ? [{ type: 'text', text: x.text }] : x.type === 'image' ? [{ type: 'image_url', image_url: { url: x.source?.type === 'base64' ? `data:${x.source.media_type};base64,${x.source.data}` : x.source?.url || '' } }] : []);
      if (parts.length) msgs.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts });
    }
  }
  const o = { model: b.model, messages: msgs, stream: !!b.stream, ...(sysBlocks.length > 1 ? { _sys_blocks: sysBlocks } : {}) };
  if (b.max_tokens) o.max_tokens = b.max_tokens;
  if (b.temperature != null) o.temperature = b.temperature; if (b.top_p != null) o.top_p = b.top_p;
  if (b.stop_sequences?.length) o.stop = b.stop_sequences.slice(0, 4);
  if (Array.isArray(b.tools)) o.tools = b.tools.filter(t => t?.name).map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } } }));
  const tc = b.tool_choice?.type; if (tc === 'any') o.tool_choice = 'required'; else if (tc === 'auto' || tc === 'none') o.tool_choice = tc; else if (tc === 'tool') o.tool_choice = { type: 'function', function: { name: b.tool_choice.name } };
  if (b.thinking?.type === 'enabled') { const bt = +b.thinking.budget_tokens || 0; o.reasoning_effort = bt <= 2048 ? 'low' : bt <= 8192 ? 'medium' : 'high'; }
  return o;
}
export const aStop = r => ({ stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', max_tokens: 'max_tokens' })[r] || 'end_turn';
export async function anthropicErr(res) { // error ของ chat/completions → รูปแบบ error ของ Anthropic
  const d = await res.json().catch(() => ({})), t = d.error?.type, st = res.status;
  const type = t === 'invalid_api_key' ? 'authentication_error' : t === 'permission_error' ? 'permission_error' : t === 'rate_limit_error' || (t === 'insufficient_quota' && st === 429) ? 'rate_limit_error' : t === 'insufficient_quota' ? 'billing_error' : st === 404 ? 'not_found_error' : st === 413 ? 'request_too_large' : t === 'api_error' ? 'api_error' : 'invalid_request_error';
  return new Response(JSON.stringify({ type: 'error', error: { type, message: d.error?.message || 'error', message_th: d.error?.message_th } }), { status: st, headers: { 'content-type': 'application/json', ...passHeaders(res) } });
}
export async function anthropicApi(req, env, ctx, path, lg) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: V1_CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }), { status: 404, headers: { 'content-type': 'application/json', ...V1_CORS } });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Invalid JSON body.' } }), { status: 400, headers: { 'content-type': 'application/json', ...V1_CORS } });
  const chat = anthropicToChat(b);
  if (path === '/v1/messages/count_tokens') { // ประมาณ (shortcut: ไม่ใช่ tokenizer จริง คลาดได้ ~20%) · ต้องมี key ที่ใช้ได้
    const probe = await v1core(new Request(new URL('/v1/models', req.url), { headers: (() => { const h = new Headers(req.headers); h.set('authorization', 'Bearer ' + ((h.get('authorization') || '').replace(/^Bearer\s+/i, '') || h.get('x-api-key') || '')); return h; })() }), env, ctx, '/v1/models', lg);
    if (!probe.ok) return anthropicErr(probe);
    return new Response(JSON.stringify({ input_tokens: estTokens(chat.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n')) + chat.messages.length * 4 }), { headers: { 'content-type': 'application/json', ...V1_CORS } });
  }
  const res = await innerChat(req, env, ctx, lg, chat);
  if (!res.ok) return anthropicErr(res);
  const wantThink = ['enabled', 'adaptive'].includes(b.thinking?.type); // ลูกค้าเปิด extended thinking: ส่งความคิดของโมเดล (reasoning_content) เป็นบล็อก thinking
  if (!chat.stream) {
    const d = await res.json(), c = d.choices?.[0], msg = c?.message || {}, content = [], u = usageIn(d.usage);
    if (wantThink && msg.reasoning_content) content.push({ type: 'thinking', thinking: msg.reasoning_content, signature: '' });
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const t of msg.tool_calls || []) { let input = {}; try { input = JSON.parse(t.function.arguments || '{}'); } catch { /* ว่าง */ } content.push({ type: 'tool_use', id: t.id, name: t.function.name, input }); }
    return new Response(JSON.stringify({ id: 'msg_' + String(d.id || rand(12)).replace(/^chatcmpl-/, ''), type: 'message', role: 'assistant', model: d.model, content: content.length ? content : [{ type: 'text', text: '' }], stop_reason: aStop(c?.finish_reason), stop_sequence: null, usage: { input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cached } }), { headers: { 'content-type': 'application/json', ...passHeaders(res) } });
  }
  const o = sseOut('event: ping\ndata: {"type": "ping"}\n\n', +env.SSE_PING_MS || 15e3), id = 'msg_' + rand(12);
  ctx.waitUntil((async () => {
    let idx = -1, open = false, started = false, stop = 'end_turn', usage = null, model = chat.model; const tools = new Map();
    const start = async () => { if (!started) { started = true; await o.send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
    const close = async () => { if (open) { await o.send('content_block_stop', { index: idx }); open = false; } };
    try {
      for await (const j of chatChunks(res)) {
        if (j.error) { await o.send('error', { error: { type: 'api_error', message: j.error.message } }); return; }
        model = j.model || model; if (j.usage) usage = j.usage;
        const ch = j.choices?.[0], dl = ch?.delta || {};
        if (wantThink && typeof dl.reasoning_content === 'string' && dl.reasoning_content) {
          await start(); if (open !== 'thinking') { await close(); idx++; open = 'thinking'; await o.send('content_block_start', { index: idx, content_block: { type: 'thinking', thinking: '', signature: '' } }); }
          await o.send('content_block_delta', { index: idx, delta: { type: 'thinking_delta', thinking: dl.reasoning_content } });
        }
        if (typeof dl.content === 'string' && dl.content) {
          await start(); if (!open || open !== 'text') { await close(); idx++; open = 'text'; await o.send('content_block_start', { index: idx, content_block: { type: 'text', text: '' } }); }
          await o.send('content_block_delta', { index: idx, delta: { type: 'text_delta', text: dl.content } });
        }
        for (const t of dl.tool_calls || []) {
          await start();
          if (t.id) { await close(); idx++; open = 'tool'; tools.set(t.index ?? 0, idx); await o.send('content_block_start', { index: idx, content_block: { type: 'tool_use', id: t.id, name: t.function?.name || '', input: {} } }); }
          if (t.function?.arguments && tools.has(t.index ?? 0)) await o.send('content_block_delta', { index: tools.get(t.index ?? 0), delta: { type: 'input_json_delta', partial_json: t.function.arguments } });
        }
        if (ch?.finish_reason) stop = aStop(ch.finish_reason);
      }
      await start(); await close(); const u = usageIn(usage);
      await o.send('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cached } });
      await o.send('message_stop', {});
    } catch { await o.send('error', { error: { type: 'api_error', message: 'stream failed' } }).catch(() => {}); }
  })().finally(() => o.close())); // ทุกทางออก (รวม error ระหว่างทาง) ปิดสตรีมและหยุด keepalive
  return new Response(o.readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...passHeaders(res) } });
}

// --- OpenAI Responses API: POST /v1/responses ---
export function responsesToChat(b) {
  const msgs = []; if (b.instructions) msgs.push({ role: 'system', content: String(b.instructions) });
  const items = typeof b.input === 'string' ? [{ role: 'user', content: b.input }] : Array.isArray(b.input) ? b.input : [];
  for (const it of items) {
    if (it.type === 'function_call') {
      const tc = { id: it.call_id, type: 'function', function: { name: it.name, arguments: typeof it.arguments === 'string' ? it.arguments : JSON.stringify(it.arguments || {}) } }, last = msgs.at(-1);
      if (last?.role === 'assistant' && last.tool_calls) last.tool_calls.push(tc); else msgs.push({ role: 'assistant', content: null, tool_calls: [tc] });
    } else if (it.type === 'function_call_output') msgs.push({ role: 'tool', tool_call_id: it.call_id, content: typeof it.output === 'string' ? it.output : JSON.stringify(it.output ?? '') });
    else if (it.role) {
      const role = it.role === 'developer' ? 'system' : it.role;
      const parts = typeof it.content === 'string' ? [{ type: 'text', text: it.content }] : (Array.isArray(it.content) ? it.content : []).flatMap(c => ['input_text', 'output_text', 'text'].includes(c?.type) ? [{ type: 'text', text: c.text }] : c?.type === 'input_image' ? [{ type: 'image_url', image_url: { url: c.image_url?.url || c.image_url || '' } }] : []);
      if (role === 'system' || role === 'assistant') msgs.push({ role, content: parts.map(p => p.text || '').join('') });
      else msgs.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts });
    }
  }
  const o = { model: b.model, messages: msgs, stream: !!b.stream };
  if (b.max_output_tokens) o.max_tokens = b.max_output_tokens;
  if (b.temperature != null) o.temperature = b.temperature; if (b.top_p != null) o.top_p = b.top_p;
  if (Array.isArray(b.tools)) o.tools = b.tools.filter(t => t?.type === 'function' && t.name).map(t => ({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } }));
  if (typeof b.tool_choice === 'string') o.tool_choice = b.tool_choice; else if (b.tool_choice?.name) o.tool_choice = { type: 'function', function: { name: b.tool_choice.name } };
  if (b.reasoning?.effort) o.reasoning_effort = b.reasoning.effort;
  const f = b.text?.format; if (f?.type === 'json_object') o.response_format = { type: 'json_object' }; else if (f?.type === 'json_schema') o.response_format = { type: 'json_schema', json_schema: { name: f.name || 'schema', schema: f.schema || {} } };
  return o;
}
export const respObj = (id, created, model, output, status, usage) => ({ id, object: 'response', created_at: created, status, model, output, ...(usage ? { usage: { input_tokens: usage.input + usage.cached, output_tokens: usage.output, total_tokens: usage.input + usage.cached + usage.output, input_tokens_details: { cached_tokens: usage.cached } } } : {}) });
export async function responsesApi(req, env, ctx, lg) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: V1_CORS });
  const b = req.method === 'POST' ? await req.json().catch(() => null) : null;
  if (!b || typeof b !== 'object') return new Response(JSON.stringify({ error: { message: req.method === 'POST' ? 'Invalid JSON body.' : 'not found', type: 'invalid_request_error' } }), { status: req.method === 'POST' ? 400 : 404, headers: { 'content-type': 'application/json', ...V1_CORS } });
  const chat = responsesToChat(b), res = await innerChat(req, env, ctx, lg, chat);
  if (!res.ok) return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', ...passHeaders(res) } });
  const id = 'resp_' + rand(12), created = Math.floor(Date.now() / 1000);
  if (!chat.stream) {
    const d = await res.json(), msg = d.choices?.[0]?.message || {}, output = [];
    if (msg.content) output.push({ id: 'msg_' + rand(10), type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: msg.content, annotations: [] }] });
    for (const t of msg.tool_calls || []) output.push({ id: 'fc_' + rand(10), type: 'function_call', call_id: t.id, name: t.function.name, arguments: t.function.arguments || '{}', status: 'completed' });
    return new Response(JSON.stringify(respObj(id, created, d.model, output, 'completed', usageIn(d.usage))), { headers: { 'content-type': 'application/json', ...passHeaders(res) } });
  }
  const o = sseOut(': ping\n\n', +env.SSE_PING_MS || 15e3);
  ctx.waitUntil((async () => {
    // เครื่องมือหลายตัวพร้อมกัน (parallel tool calls): argument ของแต่ละตัวผูกกับ index ของมันเอง (ชิ้นอาจมาสลับกัน) · ปิดเครื่องมือทุกตัวตอนจบหรือก่อนข้อความถัดไป
    let seq = 0, oi = -1, cur = null, usage = null, model = chat.model; const output = [], tools = new Map();
    const send = (name, data) => o.send(name, { sequence_number: seq++, ...data });
    const closeTools = async () => {
      for (const [k, t] of [...tools].sort((a, b) => a[1].oi - b[1].oi)) { const item = { ...t.item, arguments: t.args, status: 'completed' }; await send('response.function_call_arguments.done', { item_id: t.item.id, output_index: t.oi, arguments: t.args }); output[t.oi] = item; await send('response.output_item.done', { output_index: t.oi, item }); tools.delete(k); }
    };
    const close = async () => {
      if (cur?.kind === 'text') { const item = { ...cur.item, status: 'completed', content: [{ type: 'output_text', text: cur.text, annotations: [] }] }; await send('response.output_text.done', { item_id: cur.item.id, output_index: cur.oi, content_index: 0, text: cur.text }); await send('response.content_part.done', { item_id: cur.item.id, output_index: cur.oi, content_index: 0, part: item.content[0] }); output[cur.oi] = item; await send('response.output_item.done', { output_index: cur.oi, item }); }
      cur = null; await closeTools();
    };
    try {
      await send('response.created', { response: respObj(id, created, model, [], 'in_progress') });
      for await (const j of chatChunks(res)) {
        if (j.error) { await send('error', { message: j.error.message, code: j.error.type }); return; }
        model = j.model || model; if (j.usage) usage = j.usage;
        const dl = j.choices?.[0]?.delta || {};
        if (typeof dl.content === 'string' && dl.content) {
          if (cur?.kind !== 'text') { await close(); oi++; const item = { id: 'msg_' + rand(10), type: 'message', role: 'assistant', status: 'in_progress', content: [] }; cur = { kind: 'text', item, text: '', oi }; await send('response.output_item.added', { output_index: oi, item }); await send('response.content_part.added', { item_id: item.id, output_index: oi, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }); }
          cur.text += dl.content; await send('response.output_text.delta', { item_id: cur.item.id, output_index: oi, content_index: 0, delta: dl.content });
        }
        for (const t of dl.tool_calls || []) {
          const k = t.index ?? 0;
          if (t.id && !(tools.get(k)?.item.call_id === t.id)) { if (cur?.kind === 'text') await close(); if (tools.has(k)) await closeTools(); oi++; const item = { id: 'fc_' + rand(10), type: 'function_call', call_id: t.id, name: t.function?.name || '', arguments: '', status: 'in_progress' }; tools.set(k, { item, args: '', oi }); await send('response.output_item.added', { output_index: oi, item }); }
          const tl = tools.get(k);
          if (t.function?.arguments && tl) { tl.args += t.function.arguments; await send('response.function_call_arguments.delta', { item_id: tl.item.id, output_index: tl.oi, delta: t.function.arguments }); }
        }
      }
      await close(); await send('response.completed', { response: respObj(id, created, model, output, 'completed', usageIn(usage)) });
    } catch { await send('error', { message: 'stream failed', code: 'api_error' }).catch(() => {}); }
  })().finally(() => o.close())); // ทุกทางออก (รวม error ระหว่างทาง) ปิดสตรีมและหยุด keepalive
  return new Response(o.readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...passHeaders(res) } });
}

