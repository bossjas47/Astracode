import { BKK, DAY, capHit, err, ip, json, limited, planOf, rand, sha, unlimit, usageStatus } from './core.js';
import { SSE, callModel, chat, logUsage } from './ai.js';
import { event, mail, mailBox, origin, priceOf } from './billing.js';
import { status } from './jobs.js';
// ---------- API สำหรับนักพัฒนา: /v1/models, /v1/chat/completions (แบบ OpenAI) คิดเงินจาก wallet ----------
export const monthKey = () => new Date(Date.now() + BKK).toISOString().slice(0, 7); // เดือนตามเวลาไทย เช่น 2026-11
export const slug = m => m.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
export const V1_CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-api-key, anthropic-version, anthropic-beta', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-expose-headers': 'retry-after, x-request-id, x-ratelimit-limit-requests, x-ratelimit-remaining-requests, x-ratelimit-reset-requests, x-astracode-billing' };
export async function v1core(req, env, ctx, path, lg = {}) {
  const cors = V1_CORS, rid = 'req_' + rand(12);
  let rl = {}; // x-ratelimit-* ของคำขอนี้ (ใส่ในทุกคำตอบหลังผ่านการตรวจ key)
  const out = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'x-request-id': rid, ...cors, ...rl, ...h } });
  const EN = [ // ข้อความ error เป็นอังกฤษ (SDK ต่างชาติแสดงให้ผู้ใช้เห็น) เก็บข้อความไทยไว้ใน message_th
    [/^API key ไม่ถูกต้อง/, () => 'Invalid API key.'],
    [/^ส่งคำขอเร็วเกินไป/, () => 'Rate limit reached: 60 requests per minute per key.'],
    [/^ไม่พบโมเดล "(.*)"/, (_, n) => `The model "${n}" does not exist or is not available to this key. List models at /v1/models.`],
    [/^(.*) ใช้ถึงเพดานรายสัปดาห์แล้ว/, (_, n) => `${n} has reached its weekly cap on your plan.`],
    [/^ลิมิตแพลนเต็มแล้ว/, () => 'Plan limit reached (4-hour or weekly window).'],
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
  try {
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || '';
    const k = key && await env.DB.prepare('SELECT k.id kid, k.budget, k.models kmodels, k.use_plan, k.spent, k.spent_month, k.ip_allow, k.name kname, u.* FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=? AND k.revoked=0').bind(await sha(key)).first();
    if (!k || k.banned) return fail('API key ไม่ถูกต้อง', 401, 'invalid_api_key');
    lg.kid = k.kid; lg.uid = k.id;
    if (k.ip_allow && !ipAllowed(k.ip_allow, ip(req, env))) return fail('This IP address is not allowed for this API key.', 403, 'permission_error');
    const plan = await planOf(env, k);
    if (!(plan?.price > 0)) return fail('API access needs a paid plan. See /plans.', 403, 'permission_error'); // แพลนฟรีใช้ API ไม่ได้ (key เก่าของคนที่แพลนหมดก็หยุดใช้ได้ด้วย)
    const canPlan = !!plan?.api_limit && k.use_plan !== 0;
    const allow = k.kmodels ? k.kmodels.split(',') : null; // key ที่จำกัดโมเดลไว้
    const allPublic = (await env.DB.prepare('SELECT * FROM models WHERE active=1 AND public=1 ORDER BY sort').all()).results;
    const planIds = canPlan ? new Set((await env.DB.prepare('SELECT model_id FROM plan_models WHERE plan_id=?').bind(plan.id).all()).results.map(x => x.model_id)) : null;
    const models = allPublic.filter(m => (!allow || allow.includes(slug(m))) && (!canPlan || k.balance > 0 || planIds.has(m.id)));
    if (path === '/v1/models') return out({ object: 'list', data: models.map(m => ({ id: slug(m), object: 'model', created: 0, owned_by: m.provider })) });
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
    const over = await limited(env, 'api:' + k.kid, 60, 60e3), rrow = await env.DB.prepare('SELECT n,reset FROM rate WHERE key=?').bind('api:' + k.kid).first();
    const secs = Math.max(1, Math.ceil(((rrow?.reset || 0) - Date.now()) / 1e3));
    rl = { 'x-ratelimit-limit-requests': '60', 'x-ratelimit-remaining-requests': String(Math.max(0, 60 - (rrow?.n || 0))), 'x-ratelimit-reset-requests': secs + 's' };
    if (over) return fail('ส่งคำขอเร็วเกินไป (60 ครั้ง/นาที)', 429, 'rate_limit_error', { 'retry-after': String(secs) });
    const b = await req.json().catch(() => null) || {}, pool = allPublic.filter(x => (!allow || allow.includes(slug(x))) && (isImg ? x.provider === 'image' : isEmb ? x.provider === 'embedding' : x.provider !== 'embedding'));
    const m = pool.find(x => slug(x) === b.model || x.api_model === b.model) || ((isImg || isEmb) && !b.model ? pool[0] : null);
    if (!m) return fail(`ไม่พบโมเดล "${String(b?.model ?? '').slice(0, 80)}" ดูรายชื่อที่ /v1/models`, 404);
    let billingMode = 'wallet';
    if (canPlan && planIds.has(m.id)) {
      if (await capHit(env, k, plan, m)) return fail(`${m.name} ใช้ถึงเพดานรายสัปดาห์แล้ว`, 429, 'insufficient_quota');
      const st = await usageStatus(env, k, plan);
      if (st.pct4h < 100 && st.pctWeek < 100) billingMode = 'plan';
      else if (k.wallet_overflow && k.balance > 0) billingMode = 'wallet';
      else return fail('ลิมิตแพลนเต็มแล้ว (4 ชม. / สัปดาห์)', 429, 'insufficient_quota');
    } else if (!(k.balance > 0)) {
      return fail(canPlan ? `แพลน ${plan.name} ไม่รวมโมเดลนี้ และยอดเงินใน Wallet ไม่พอ` : 'ยอดเงินใน Wallet ไม่พอ เติมเงินที่ /plans', 402, 'insufficient_quota');
    }
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
    let system = msgs.filter(x => x.role === 'system' || x.role === 'developer').map(x => text(x.content)).filter(Boolean).join('\n\n');
    const hist = msgs.filter(x => ['user', 'assistant', 'tool'].includes(x.role)).map(x => x.role === 'tool'
      ? { role: 'tool', tool_call_id: String(x.tool_call_id || ''), content: typeof x.content === 'string' ? x.content : JSON.stringify(x.content ?? '') }
      : x.role === 'assistant' && Array.isArray(x.tool_calls) && x.tool_calls.length
        ? { role: 'assistant', content: text(x.content) || null, tool_calls: x.tool_calls }
        : { role: x.role, content: normContent(x.content) }).filter(x => x.role === 'tool' || (x.tool_calls?.length) || (Array.isArray(x.content) ? x.content.length : x.content));
    if (extra.response_format && m.provider !== 'openai') { // Claude/Responses ไม่มี JSON mode แบบ chat/completions: สั่งผ่านคำสั่งระบบ
      system += (system ? '\n\n' : '') + 'Respond with a single valid JSON value only: no prose, no code fences.' + (extra.response_format.json_schema?.schema ? ' It must match this JSON Schema: ' + JSON.stringify(extra.response_format.json_schema.schema).slice(0, 4000) : '');
      delete extra.response_format;
    }
    if (!hist.length || !['user', 'tool'].includes(hist.at(-1).role)) return fail('messages ต้องลงท้ายด้วยข้อความของ user หรือ tool', 400);
    if (hist.some(x => hasImg(x.content)) && !m.vision) return fail(`โมเดล "${slug(m)}" ไม่รองรับการส่งรูปภาพ`, 400);
    if (JSON.stringify(hist).length > 800000) return fail('ข้อความยาวเกินไป', 413);
    const effort = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(b.reasoning_effort) ? b.reasoning_effort : null, id = 'chatcmpl-' + rand(12), created = Math.floor(Date.now() / 1000);
    const tools = Array.isArray(b.tools) && b.tools.length ? b.tools : undefined, toolChoice = b.tool_choice;
    let maxTokens = +b.max_tokens || +b.max_completion_tokens || undefined, walletKey = null;
    if (billingMode === 'wallet') { // ตัดเงินหลังตอบ: จำกัดผลลัพธ์ไม่ให้เกินยอดที่เหลือ และให้ใช้ Wallet ทีละคำขอต่อผู้ใช้ กันยิงขนานจนยอดติดลบ
      const pr = await priceOf(env, m), need = Math.ceil((JSON.stringify(hist).length + system.length) / 2) * pr.in / 1e6, room = k.balance - need;
      if (!(room > 0) || (isImg && room < pr.out)) return fail('ยอดเงินใน Wallet ไม่พอสำหรับคำขอนี้', 402, 'insufficient_quota');
      maxTokens = Math.min(maxTokens || Infinity, Math.max(1, Math.floor(room * 1e6 / Math.max(pr.out, 1e-9))));
      walletKey = 'walletlock:' + k.id; // shortcut: ล็อกหมดอายุเอง 3 นาทีถ้าคำขอล้มก่อนจบ, ถ้าต้องการเข้มกว่านี้ให้จองยอดล่วงหน้าแบบ atomic
      if (!await env.DB.prepare('INSERT INTO rate (key,n,reset) VALUES (?1,1,?2) ON CONFLICT(key) DO UPDATE SET n=1, reset=?2 WHERE reset<?3 RETURNING n').bind(walletKey, Date.now() + 180e3, Date.now()).first()) return fail('มีคำขอที่ใช้ Wallet ค้างอยู่ รอให้เสร็จก่อน', 429, 'rate_limit_error');
    }
    let activeModel = m; lg.model = slug(m);
    const usageOut = u => ({ prompt_tokens: u.fresh + u.read + u.write, completion_tokens: u.out, total_tokens: u.fresh + u.read + u.write + u.out, prompt_tokens_details: { cached_tokens: u.read } });
    const estUsage = (outChars) => ({ fresh: Math.ceil((JSON.stringify(hist).length + system.length) / 2), read: 0, write: 0, out: Math.ceil(outChars / 2) });
    const finish = async (u, outChars) => {
      const finalU = u || (outChars > 0 ? estUsage(outChars) : null);
      const charge = finalU ? await logUsage(env, k.id, activeModel, finalU, billingMode === 'plan' ? { units: true, wallet: null, plan } : { units: false, wallet: 'api', plan }) : 0;
      await env.DB.prepare('UPDATE api_keys SET spent=CASE WHEN spent_month=?1 THEN spent ELSE 0 END + ?2, spent_month=?1, last_used=?3 WHERE id=?4').bind(month, charge, Date.now(), k.kid).run();
      if (walletKey) await unlimit(env, walletKey);
      lg.model = slug(activeModel); lg.tin = finalU ? finalU.fresh + finalU.read + finalU.write : 0; lg.tout = finalU?.out || 0; lg.charge = charge; lg.logged = true;
      await apiLog(env, lg, 200);
      if (k.budget > 0) for (const [pct, label] of [[1, 'ใช้ครบงบแล้ว'], [0.8, 'ใช้ไป 80% ของงบแล้ว']]) { // เตือนครั้งเดียวตอนข้ามเส้น (งบรีเซ็ตทุกเดือน)
        if (spent < k.budget * pct && spent + charge >= k.budget * pct) { await mail(env, k.email, `AstraCode: API key "${k.kname || 'key'}" ${label}`, mailBox('งบ API key ' + label, `ใช้ไปแล้ว ฿${(spent + charge).toFixed(2)} จากงบ ฿${k.budget} ของเดือนนี้`, 'จัดการ key', 'https://astracode.panderx.xyz/developers')).catch(() => {}); break; }
      }
      return finalU;
    };
    const nextFallback = async cur => cur.fallback_id ? env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(cur.fallback_id).first() : null;
    if (isEmb) {
      const key = env[m.key_name];
      if (billingMode === 'wallet' && k.balance < Math.ceil(embIn.join('').length / 2) * (await priceOf(env, m)).in / 1e6) return fail('ยอดเงินใน Wallet ไม่พอสำหรับคำขอนี้', 402, 'insufficient_quota');
      const body = { model: m.api_model, input: embIn, encoding_format: b.encoding_format === 'base64' ? 'base64' : 'float' };
      if (Number.isInteger(b.dimensions) && b.dimensions > 0) body.dimensions = b.dimensions;
      const r = key && await fetch(m.base_url.replace(/\/$/, '') + '/embeddings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }).catch(() => null);
      const d = r?.ok ? await r.json().catch(() => null) : null;
      if (!Array.isArray(d?.data)) { await event(env, 'error', m.id, 'api: embeddings ' + (r?.status || 'no response')); if (walletKey) await unlimit(env, walletKey); return fail('โมเดลตอบไม่ได้ตอนนี้', 502, 'api_error'); }
      const tokens = d.usage?.prompt_tokens ?? Math.ceil(embIn.join('').length / 2);
      await finish({ fresh: tokens, read: 0, write: 0, out: 0 }, 0);
      return out({ object: 'list', data: d.data, model: slug(m), usage: { prompt_tokens: tokens, total_tokens: tokens } }, 200, { 'x-astracode-billing': billingMode });
    }
    if (!b.stream) {
      let content = '', reasoning = '', usage = null, finishReason = 'stop', tcs = new Map(), anthIdx = new Map();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          for await (const e of callModel(env, activeModel, hist, { system, effort, maxTokens, tools, toolChoice, extra, imageOpts, api: true })) {
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
          break;
        } catch (e) {
          await event(env, 'error', activeModel.id, 'api: ' + e.message.slice(0, 200));
          const fb = attempt === 0 && !content && !reasoning && !tcs.size ? await nextFallback(activeModel) : null;
          if (fb && (!hist.some(x => hasImg(x.content)) || fb.vision)) { activeModel = fb; continue; }
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
      return out({ id, object: 'chat.completion', created, model: slug(activeModel), choices: [{ index: 0, message: { role: 'assistant', content: content || (toolCalls.length ? null : ''), ...(reasoning ? { reasoning_content: reasoning } : {}), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finishReason }], usage: used ? usageOut(used) : undefined }, 200, { 'x-astracode-billing': billingMode });
    }
    const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
    const chunk = (delta, extra = {}, fin = null) => w.write(enc.encode('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: slug(activeModel), choices: [{ index: 0, delta, finish_reason: fin }], ...extra }) + '\n\n'));
    ctx.waitUntil((async () => {
      let usage = null, outChars = 0, finishReason = 'stop', sentAny = false, anthIdx = new Map(), tcCount = 0;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            for await (const e of callModel(env, activeModel, hist, { system, effort, maxTokens, tools, toolChoice, extra, imageOpts, api: true })) {
              if (!sentAny) { sentAny = true; await chunk({ role: 'assistant', content: '' }); }
              if (e.t) { outChars += e.t.length; await chunk({ content: e.t }); }
              if (e.th) { outChars += e.th.length; await chunk({ reasoning_content: e.th }); }
              if (e.tc_start) { const idx = tcCount++; anthIdx.set(e.tc_start.index, idx); await chunk({ tool_calls: [{ index: idx, id: e.tc_start.id, type: 'function', function: { name: e.tc_start.name, arguments: '' } }] }); }
              if (e.tc_delta) { const idx = anthIdx.get(e.tc_delta.index); if (idx != null) { outChars += e.tc_delta.args.length; await chunk({ tool_calls: [{ index: idx, function: { arguments: e.tc_delta.args } }] }); } }
              if (e.tc) { outChars += JSON.stringify(e.tc).length; tcCount = Math.max(tcCount, e.tc.length); await chunk({ tool_calls: e.tc }); }
              if (e.stop_reason) finishReason = e.stop_reason;
              if (e.usage) usage = e.usage;
            }
            break;
          } catch (e) {
            await event(env, 'error', activeModel.id, 'api: ' + e.message.slice(0, 200));
            const fb = attempt === 0 && !sentAny ? await nextFallback(activeModel) : null;
            if (fb && (!hist.some(x => hasImg(x.content)) || fb.vision)) { activeModel = fb; continue; }
            throw e;
          }
        }
        if (tcCount > 0 && finishReason === 'stop') finishReason = 'tool_calls';
        const used = await finish(usage, outChars);
        await chunk({}, { usage: used ? usageOut(used) : null }, finishReason);
      } catch (e) { await w.write(enc.encode('data: ' + JSON.stringify({ error: { message: 'The model could not answer right now.', message_th: 'โมเดลตอบไม่ได้ตอนนี้', type: 'api_error' } }) + '\n\n')).catch(() => {}); }
      await w.write(enc.encode('data: [DONE]\n\n')).catch(() => {}); await w.close().catch(() => {});
    })());
    return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-astracode-billing': billingMode, ...cors, ...rl } });
  } catch (e) { console.log('v1 error', e.stack); return fail(e.user ? e.message : 'เซิร์ฟเวอร์ผิดพลาด', e.user ? 400 : 500, 'api_error'); }
}

// ---------- ตัวช่วย /v1: บันทึกคำขอ, IP allowlist, ตัวห่อและตัวแปลง Anthropic Messages / OpenAI Responses ----------
export const apiLog = (env, lg, status) => env.DB.prepare('INSERT INTO api_log (key_id,user_id,path,model,status,tin,tout,charge,ms,err,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  .bind(lg.kid, lg.uid, lg.path, lg.model || null, status, lg.tin || 0, lg.tout || 0, lg.charge || 0, Date.now() - lg.t0, status >= 400 ? (lg.err || '').slice(0, 200) || null : null, Date.now()).run().catch(() => {});
export const v4 = x => { const p = String(x).split('.'); return p.length === 4 && p.every(n => /^\d{1,3}$/.test(n) && +n < 256) ? p.reduce((a, n) => a * 256 + +n, 0) : null; };
// list = IP หรือ IPv4 CIDR คั่นด้วย , (shortcut: IPv6 เทียบแบบตรงตัวเท่านั้น ไม่รองรับ CIDR)
export const ipAllowed = (list, addr) => list.split(',').some(e => {
  e = e.trim(); if (!e) return false; if (!e.includes('/')) return e === addr;
  const [base, n] = e.split('/'), a = v4(addr), c = v4(base), bits = +n; if (a == null || c == null || !(bits >= 0 && bits <= 32)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((a & mask) >>> 0) === ((c & mask) >>> 0);
});
export async function v1(req, env, ctx, path) {
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
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line.startsWith('data:') && !line.includes('[DONE]')) { try { yield JSON.parse(line.slice(5)); } catch { /* ข้าม */ } } }
  }
}
export const sseOut = res => { const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder(); return { readable, w, send: (name, data) => w.write(enc.encode(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`)), close: () => w.close().catch(() => {}) }; };
export const passHeaders = res => { const h = {}; for (const k of ['retry-after', 'x-request-id', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests', 'x-astracode-billing']) { const v = res.headers.get(k); if (v) h[k] = v; } return { ...V1_CORS, ...h }; };
export const usageIn = u => ({ cached: u?.prompt_tokens_details?.cached_tokens || 0, input: (u?.prompt_tokens || 0) - (u?.prompt_tokens_details?.cached_tokens || 0), output: u?.completion_tokens || 0 });

// --- Anthropic Messages API: POST /v1/messages, /v1/messages/count_tokens ---
export const aText = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x?.type === 'text').map(x => x.text).join('\n') : '';
export function anthropicToChat(b) {
  const msgs = [], sys = Array.isArray(b.system) ? b.system.map(x => x?.text || '').join('\n') : String(b.system || '');
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
  const o = { model: b.model, messages: msgs, stream: !!b.stream };
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
  if (path === '/v1/messages/count_tokens') { // ประมาณจากจำนวนตัวอักษร (shortcut: ไม่ใช่ tokenizer จริง) · ต้องมี key ที่ใช้ได้
    const probe = await v1core(new Request(new URL('/v1/models', req.url), { headers: (() => { const h = new Headers(req.headers); h.set('authorization', 'Bearer ' + ((h.get('authorization') || '').replace(/^Bearer\s+/i, '') || h.get('x-api-key') || '')); return h; })() }), env, ctx, '/v1/models', lg);
    if (!probe.ok) return anthropicErr(probe);
    return new Response(JSON.stringify({ input_tokens: Math.ceil(JSON.stringify(chat.messages).length / 2) }), { headers: { 'content-type': 'application/json', ...V1_CORS } });
  }
  const res = await innerChat(req, env, ctx, lg, chat);
  if (!res.ok) return anthropicErr(res);
  if (!chat.stream) {
    const d = await res.json(), c = d.choices?.[0], msg = c?.message || {}, content = [], u = usageIn(d.usage);
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const t of msg.tool_calls || []) { let input = {}; try { input = JSON.parse(t.function.arguments || '{}'); } catch { /* ว่าง */ } content.push({ type: 'tool_use', id: t.id, name: t.function.name, input }); }
    return new Response(JSON.stringify({ id: 'msg_' + String(d.id || rand(12)).replace(/^chatcmpl-/, ''), type: 'message', role: 'assistant', model: d.model, content: content.length ? content : [{ type: 'text', text: '' }], stop_reason: aStop(c?.finish_reason), stop_sequence: null, usage: { input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cached } }), { headers: { 'content-type': 'application/json', ...passHeaders(res) } });
  }
  const o = sseOut(), id = 'msg_' + rand(12);
  ctx.waitUntil((async () => {
    let idx = -1, open = false, started = false, stop = 'end_turn', usage = null, model = chat.model; const tools = new Map();
    const start = async () => { if (!started) { started = true; await o.send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }); } };
    const close = async () => { if (open) { await o.send('content_block_stop', { index: idx }); open = false; } };
    try {
      for await (const j of chatChunks(res)) {
        if (j.error) { await o.send('error', { error: { type: 'api_error', message: j.error.message } }); return; }
        model = j.model || model; if (j.usage) usage = j.usage;
        const ch = j.choices?.[0], dl = ch?.delta || {};
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
    await o.close();
  })());
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
  const o = sseOut();
  ctx.waitUntil((async () => {
    let seq = 0, oi = -1, cur = null, usage = null, model = chat.model; const output = [], tools = new Map();
    const send = (name, data) => o.send(name, { sequence_number: seq++, ...data });
    const close = async () => {
      if (!cur) return;
      if (cur.kind === 'text') { const item = { ...cur.item, status: 'completed', content: [{ type: 'output_text', text: cur.text, annotations: [] }] }; await send('response.output_text.done', { item_id: cur.item.id, output_index: oi, content_index: 0, text: cur.text }); await send('response.content_part.done', { item_id: cur.item.id, output_index: oi, content_index: 0, part: item.content[0] }); output[oi] = item; await send('response.output_item.done', { output_index: oi, item }); }
      else { const item = { ...cur.item, arguments: cur.args, status: 'completed' }; await send('response.function_call_arguments.done', { item_id: cur.item.id, output_index: oi, arguments: cur.args }); output[oi] = item; await send('response.output_item.done', { output_index: oi, item }); }
      cur = null;
    };
    try {
      await send('response.created', { response: respObj(id, created, model, [], 'in_progress') });
      for await (const j of chatChunks(res)) {
        if (j.error) { await send('error', { message: j.error.message, code: j.error.type }); return; }
        model = j.model || model; if (j.usage) usage = j.usage;
        const dl = j.choices?.[0]?.delta || {};
        if (typeof dl.content === 'string' && dl.content) {
          if (cur?.kind !== 'text') { await close(); oi++; const item = { id: 'msg_' + rand(10), type: 'message', role: 'assistant', status: 'in_progress', content: [] }; cur = { kind: 'text', item, text: '' }; await send('response.output_item.added', { output_index: oi, item }); await send('response.content_part.added', { item_id: item.id, output_index: oi, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }); }
          cur.text += dl.content; await send('response.output_text.delta', { item_id: cur.item.id, output_index: oi, content_index: 0, delta: dl.content });
        }
        for (const t of dl.tool_calls || []) {
          if (t.id) { await close(); oi++; const item = { id: 'fc_' + rand(10), type: 'function_call', call_id: t.id, name: t.function?.name || '', arguments: '', status: 'in_progress' }; cur = { kind: 'tool', item, args: '' }; tools.set(t.index ?? 0, cur); await send('response.output_item.added', { output_index: oi, item }); }
          if (t.function?.arguments && cur?.kind === 'tool') { cur.args += t.function.arguments; await send('response.function_call_arguments.delta', { item_id: cur.item.id, output_index: oi, delta: t.function.arguments }); }
        }
      }
      await close(); await send('response.completed', { response: respObj(id, created, model, output, 'completed', usageIn(usage)) });
    } catch { await send('error', { message: 'stream failed', code: 'api_error' }).catch(() => {}); }
    await o.close();
  })());
  return new Response(o.readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...passHeaders(res) } });
}
