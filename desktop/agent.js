// Kyber Harness · ตัวคุมรอบ (Loop Controller) แบบ Claude Code: ส่งงานให้โมเดลผ่าน /v1 → โมเดลขอใช้เครื่องมือ → ทำในเครื่อง → ส่งผลกลับ → วนจนโมเดลตอบโดยไม่ขอเครื่องมือ
// ใช้ร่วมกันทั้งแอป Desktop (main.js) และเครื่องเสมือนบนคลาวด์ (astracode/container/server.js) · ไม่ผูก Electron จึงทดสอบด้วย node ได้ (fetchImpl / callTool / onEvent ฉีดเข้ามา)
// ส่วนที่คุมให้ทำงานได้นานโดยไม่เปลือง: ลองใหม่แบบ backoff+jitter · ตรวจวนซ้ำ · เพดานรอบ/เวลา/token · ตรวจ argument กับ schema · อ่านพร้อมกัน/เขียนทีละอัน · ผลยาวเก็บลงไฟล์ · ย่อบทสนทนาแบบไม่ทิ้งงาน · บันทึก checkpoint
const TOOL_OUT_MAX = 60000; // ผลเครื่องมือยาวสุดที่ส่งเข้า context (กรณีไม่มีที่เก็บไฟล์)
const SPILL_AT = 12000; // ผลยาวกว่านี้: เก็บเต็มลงไฟล์ (.kyber-tmp) แล้วส่งให้โมเดลแค่หัว + ท้าย + path
const COMPACT_AT = 600000; // เดิม 350K (~100K token): งาน Agent ยาว ๆ ถูกย่อบ่อยจนลืมของต้นงาน · โมเดลหลักรับได้ 1M token และส่วนเก่าติดแคช (ถูก) // ตัวอักษรรวมของบทสนทนา (~100k token) เกินนี้ → ย่อส่วนเก่าก่อนรอบถัดไป
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 529]);
// เครื่องมือที่อ่านอย่างเดียว: รันพร้อมกันได้ในรอบเดียว · ที่เหลือ (แก้ไฟล์/รันคำสั่ง/ถามผู้ใช้) รันทีละอันตามลำดับ กันไฟล์ชนกัน
const READ_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep', 'git_inspect', 'check_syntax', 'web_search', 'web_fetch', 'task', 'read_document', 'screenshot_url']);
const EDIT_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit', 'make_document']);
const NO_SPILL = new Set(['read_file', 'read_document', 'task', 'ask_user']); // ผลที่โมเดลขอดูเต็ม ๆ (เนื้อไฟล์ที่จะแก้ / รายงานผู้ช่วย): ไม่เก็บลงไฟล์
const STUCK_N = 3;
// คำสั่งสำรวจเครื่อง / error ที่มาจากเครื่องไม่พร้อม (ไม่ใช่โค้ดของงาน)
const ENV_CMD_RE = /^\s*(which|command -v|type|ls|find|whereis|echo|cat|env|printenv|npm\s+ls|pip\s+(show|list)|uname)\b/;
const ENV_ERR_RE = /command not found|not found in PATH|Executable doesn't exist|Looks like Playwright|playwright install|Cannot find module '(playwright|puppeteer)|ms-playwright|EAI_AGAIN|ENOTFOUND|getaddrinfo|Could not resolve host|permission denied.*\/(usr|opt|root)\//i;
// ตรวจงานก่อนจบ: ไฟล์โค้ด · คำสั่งที่นับว่า "ตรวจแล้ว" (เทสต์/บิลด์/lint/รันสคริปต์) · ข้อความที่อ้างว่าผ่าน
const CODE_RE = /\.(m?[jt]sx?|cjs|py|go|rs|java|kt|cs|cpp|cc|c|h|rb|php|swift|vue|svelte|sh|sql)$/i;
const VERIFY_RE = /\b(test|tests|pytest|jest|vitest|mocha|tsc|lint|eslint|build|compile|py_compile|cargo\s+(test|build|check)|go\s+(test|build|vet)|mvn|gradle|make|ruff|mypy|flake8)\b|\b(node|python3?|deno|bun|php|ruby)\s+[^|;&]*\.(m?js|py|ts|php|rb)\b|\b(node|python3?|deno|bun)\s+(-e|-c|--eval|-p)\s/i;
// "รับปากแล้วไม่ลงมือ": โมเดลถูก (เช่น DeepSeek Flash) ตอบว่าจะทำ/ทำเลย แต่ไม่เรียกเครื่องมือแล้วจบ → เตือนให้ลงมือจริง
const PROMISE_RE = /(ไม่ถามแล้ว|ทำเลย|จะ(ทำ|แก้|ตัด|ลบ|เพิ่ม|เขียน|สร้าง|รัน|ห่อ|ย้าย|เปลี่ยน|ปรับ)|เดี๋ยว(ผม|จะ)?(ทำ|แก้)|ขั้นต่อไป|ต่อไปผมจะ|กำลัง(ทำ|แก้)|เข้าใจแล้ว|\bI(?:'| wi)ll\b|\blet me\b|\bnow I\b|\bnext,? I\b|\bI am going to\b|\bgoing to (?:edit|fix|update|remove|add|write|run)\b)/i;
const CLAIM_RE = /(tests?|เทสต์|ทดสอบ|build|บิลด์|รัน)[^.\n]{0,40}(pass|ผ่าน|สำเร็จ|succeed|green|เรียบร้อย)/i; // เรียกเครื่องมือเดิมด้วย argument เดิม / error เดิม ติดกันเท่านี้ = วนซ้ำ

const sleep = (ms, signal) => new Promise((ok, no) => {
  if (signal?.aborted) return no(new Error('หยุดแล้ว'));
  const t = setTimeout(ok, ms); signal?.addEventListener('abort', () => { clearTimeout(t); no(new Error('หยุดแล้ว')); }, { once: true });
});
// Retry-After: วินาที หรือวันที่แบบ HTTP · ไม่มี = null
function retryAfterMs(r) {
  const v = r?.headers?.get?.('retry-after'); if (!v) return null;
  const s = Number(v); if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const d = Date.parse(v); return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}
// รอแบบทวีคูณ + สุ่ม (กันลูกค้าหลายคนยิงซ้ำพร้อมกันตอนผู้ให้บริการกลับมา) · เพดาน 30 วินาที
const backoffMs = (i, base = 2000, cap = 30000) => Math.min(cap, base * 2 ** i) + Math.floor(Math.random() * 1000);

// ปิดบังความลับที่หลุดมาในผลเครื่องมือ (stdout ของคำสั่ง, ไฟล์ .env ฯลฯ) ก่อนส่งให้โมเดล/บันทึก
const SECRET_RE = /\b(sk-(?:ant-|proj-|astra-|kyber-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})/g;
const maskSecrets = s => String(s ?? '').replace(SECRET_RE, m => m.slice(0, Math.min(8, m.indexOf('-') + 4 || 6)) + '…[ซ่อน]');

// ตรวจ argument กับ JSON schema ของเครื่องมือ (required + ชนิด + enum) · คืนข้อความ error ที่บอกพารามิเตอร์ที่ถูกต้อง หรือ null
const typeOk = (t, v) => t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : typeof v === t;
function describeParams(p) {
  const req = new Set(p?.required || []);
  return Object.entries(p?.properties || {}).map(([k, s]) => `${k} (${s.type || 'any'}${s.enum ? ': ' + s.enum.join('|') : ''}${req.has(k) ? ', required' : ''})`).join(', ') || '(no parameters)';
}
function validateArgs(params, args) {
  if (!params || params.type !== 'object') return null;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return 'arguments must be a JSON object';
  const bad = [];
  for (const k of params.required || []) if (args[k] === undefined || args[k] === null || args[k] === '') bad.push(`missing "${k}"`);
  for (const [k, v] of Object.entries(args)) {
    const s = params.properties?.[k]; if (!s || v === undefined || v === null) continue;
    if (s.type && !typeOk(s.type, v)) bad.push(`"${k}" must be ${s.type}`);
    else if (s.enum && !s.enum.includes(v)) bad.push(`"${k}" must be one of ${s.enum.join(', ')}`);
    else if (s.type === 'array' && s.items?.type === 'object' && s.items.required) v.forEach((x, i) => { for (const r of s.items.required) if (x?.[r] === undefined) bad.push(`"${k}[${i}].${r}" is missing`); });
  }
  return bad.length ? bad.slice(0, 6).join('; ') : null;
}

// ประวัติที่ค้างจากแอป/เครื่องเสมือนรีสตาร์ตกลางรอบ: assistant ขอเครื่องมือแต่ไม่มีผลตอบ → เติมผลบอกว่าถูกขัดจังหวะ (ไม่งั้น API ปฏิเสธ และโมเดลอาจเขียนไฟล์ซ้ำ)
function repairHistory(messages) {
  let fixed = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]; if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    const have = new Set(); let j = i + 1;
    for (; j < messages.length && messages[j].role === 'tool'; j++) have.add(messages[j].tool_call_id);
    const miss = m.tool_calls.filter(tc => !have.has(tc.id));
    if (miss.length) { messages.splice(j, 0, ...miss.map(tc => ({ role: 'tool', tool_call_id: tc.id, content: `Error: interrupted before ${tc.function?.name || 'this tool'} finished (the user pressed stop, or the app restarted). Earlier results in this conversation are still valid; reuse them. Redo this one call only if it is still needed; for file edits, check the file first.` }))); fixed += miss.length; }
  }
  return fixed;
}

// inbox(): ข้อความที่ผู้ใช้พิมพ์แทรกระหว่างทำงาน · effort: ระดับการคิด · onStep(tc): เลขขั้นตอนก่อนเรียกเครื่องมือ (ใช้ย้อนไฟล์)
// ตัวเลือกใหม่ (ไม่ส่ง = พฤติกรรมเดิม): maxDurationMs · maxTokens (token รวมทั้งงาน) · depth (ผู้ช่วย = 1: ห้าม task ซ้อน) · toolKind(name) → 'read'|อื่นๆ
//   spill(text, info) → path ของไฟล์ที่เก็บผลเต็ม · onCheckpoint({ round, messages, state }) · retryWaits (ระบุเอง = ไม่สุ่ม ใช้ในเทสต์)
async function runAgent({ base, key, model, messages, tools = [], callTool, onEvent = () => {}, signal, maxRounds = 80, fetchImpl = fetch, compactAt = COMPACT_AT, inbox = () => [], effort = null, onStep = () => {},
  retryWaits = null, segment = false, maxDurationMs = 0, maxTokens = 0, depth = 0, toolKind = null, spill = null, onCheckpoint = null, firstByteMs = 300000, stallMs = 180000,
  verifyGate = true, checks = [], review = null, advisor = null, pinned = null, seeImages = true, slimOld = true, helperModel = null, summaryModel = null, steer = null }) {
  const url = base.replace(/\/$/, '') + '/chat/completions', t0 = Date.now();
  const post = (body, sig = signal) => fetchImpl(url, { method: 'POST', signal: sig, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  // นาฬิกาเฝ้าคำขอ: ไม่ได้คำตอบเลยภายใน firstByteMs หรือสตรีมเงียบ (ไม่มีข้อมูลแม้แต่ ping) เกิน stallMs → ตัดการเชื่อมต่อ
  // เดิมรอไม่มีวันจบ: งานค้าง "Agent กำลังทำงานอยู่" ตลอดจนต้องปิดแอป · ตัดก่อนได้ข้อความ = ลองใหม่ได้ · ตัดกลางคำตอบ = จบงานพร้อมบอกผู้ใช้
  const watch = () => {
    const ac = new AbortController(), w = { signal: ac.signal, stalled: 0, t: null }, out = () => ac.abort(), sec = ms => Math.round(ms / 1000);
    signal?.addEventListener('abort', out, { once: true });
    w.arm = ms => { clearTimeout(w.t); w.t = setTimeout(() => { w.stalled = ms; ac.abort(); }, ms); };
    w.stop = () => { clearTimeout(w.t); signal?.removeEventListener('abort', out); };
    w.kill = () => { clearTimeout(w.t); ac.abort(); }; // ผู้ใช้พิมพ์แทรก: ตัดคำตอบปัจจุบันทิ้ง แล้วเริ่มรอบใหม่พร้อมข้อความนั้น
    w.err = () => new Error(`โมเดลไม่ตอบภายใน ${sec(w.stalled)} วินาที`);
    w.arm(firstByteMs); return w;
  };
  const schemas = new Map(tools.map(t => [t.function?.name, t.function?.parameters]));
  const kindOf = name => toolKind?.(name) || (READ_TOOLS.has(name) ? 'read' : 'write');
  // สถานะที่ต้องคงไว้เสมอแม้ย่อบทสนทนา: รายการงานล่าสุด · ไฟล์ที่แก้แล้ว · error ที่ยังไม่หาย
  const state = { todos: null, changed: new Set(), errors: new Map(), round: 0, codeEditRound: -1, verifyRound: -1, gated: false, reviewed: false };
  const stats = { rounds: 0, toolCalls: 0, toolErrors: 0, perTool: {}, ttft: [], promptTokens: 0, cachedTokens: 0, outTokens: 0, stuck: 0, retries: 0 };
  const recentSig = [], recentErr = [], hinted = new Set();
  const fixed = repairHistory(messages); if (fixed) onEvent({ type: 'info', text: `ทำต่อจากงานที่ค้าง (เครื่องมือ ${fixed} รายการถูกขัดจังหวะ)` });
  const stop = text => { onEvent({ type: 'delta', text: `\n\n(หยุด: ${text} สั่ง "ทำต่อ" ได้)` }); };
  const finish = () => { stats.ms = Date.now() - t0; stats.cacheHit = stats.promptTokens ? Math.round(stats.cachedTokens / stats.promptTokens * 1000) / 10 : 0; onEvent({ type: 'stats', stats }); return messages; };
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) throw new Error('หยุดแล้ว'); state.round = round;
    if (maxDurationMs && Date.now() - t0 > maxDurationMs) { stats.capped = 'time'; if (!segment) stop(`ทำงานครบเวลา ${Math.round(maxDurationMs / 60000)} นาทีแล้ว`); return finish(); }
    if (maxTokens && stats.promptTokens + stats.outTokens > maxTokens) { stop(`ใช้ token ครบเพดาน ${maxTokens.toLocaleString()} แล้ว`); return finish(); }
    for (const m of inbox()) { // ข้อความที่ผู้ใช้พิมพ์แทรก (แนบรูปได้: โมเดลที่อ่านรูปได้จะเห็นรูปด้วย)
      const text = typeof m === 'string' ? m : String(m?.text || ''), imgs = typeof m === 'string' ? [] : (m?.images || []).filter(u => /^data:image\//.test(u)).slice(0, 4);
      messages.push({ role: 'user', content: imgs.length && seeImages ? [{ type: 'text', text }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))] : text + (imgs.length ? `\n(แนบรูป ${imgs.length} รูป แต่โมเดลนี้อ่านรูปไม่ได้)` : '') });
      onEvent({ type: 'steer' });
    }
    if (slimOld) stats.slimmed = (stats.slimmed || 0) + slim(messages, SLIM_MIN, state.changed); // slimOld=false: ใช้วัดเทียบกับโปรแกรม AI ทั่วไปที่ไม่ย่อ
    if (JSON.stringify(messages).length > compactAt) await compact({ post, model: summaryModel || helperModel || model, messages, onEvent, state, pinned }); // ย่อบทสนทนาด้วยโมเดลประหยัด (ถ้ามี)
    // ที่ปรึกษาโมเดลแรง: วางแผนให้ครั้งเดียวต่อคำสั่งผู้ใช้ (ก่อนรอบแรก) · เรียกไม่ได้ = ทำงานต่อตามปกติ
    if (round === 0 && advisor?.plan && depth === 0) {
      const lastUser = [...messages].reverse().find(m => m.role === 'user'), task = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content || '');
      // ประหยัดลิมิต: วางแผนเฉพาะคำสั่งแรกของบทสนทนา (ที่ไม่สั้นมาก) หรือคำสั่งยาว/งานใหญ่ · "ทำต่อ", "แก้สีปุ่ม" ไม่เรียกโมเดลแรง
      const firstAsk = messages.filter(m => m.role === 'user' && !String(typeof m.content === 'string' ? m.content : '').startsWith('[')).length <= 1;
      if (lastUser && !String(task).startsWith('[Kyber Harness') && ((firstAsk && String(task).length >= 300) || String(task).length >= 1200)) { // คำสั่งแรกของบทสนทนาที่ไม่สั้นมาก หรือคำสั่งยาว (เดิมคำนวณ firstAsk แต่ไม่ได้ใช้ = แทบไม่เคยวางแผน) // วัดจริง: Opus = 75% ของค่าใช้จ่ายในงานแก้บั๊กหลายไฟล์ โดยคุณภาพไม่ต่าง → วางแผนเฉพาะคำสั่งใหญ่ (ที่เหลือใช้ตอนติด/ตรวจไม่ผ่าน)
        onEvent({ type: 'info', text: 'ที่ปรึกษากำลังวางแผนงาน (AI เริ่มสำรวจไปพร้อมกัน)…' });
        // ไม่ให้โมเดลหลักนั่งรอ (Opus ใช้ ~25 วินาที): เริ่มงานเลย แผนมาเมื่อไหร่ค่อยแทรกก่อนรอบถัดไป
        state.planP = Promise.resolve(advisor.plan(task, messages[0]?.role === 'system' ? String(messages[0].content).match(/Project map[\s\S]{0,3500}/)?.[0] || '' : '')).catch(() => null).then(p => { state.plan = p || ''; });
        await Promise.race([state.planP, new Promise(r => setTimeout(r, 0))]);
      }
    }
    if (state.plan && !state.planIn) { // แผนมาแล้ว: แทรกครั้งเดียว (ต่อท้ายผลเครื่องมือล่าสุด)
      state.planIn = true; messages.push({ role: 'user', content: `[Kyber Harness · advisor plan] A senior engineer (${advisor.model}) suggests this plan. Use it as guidance, verify against the real files, and adapt if the code says otherwise:\n${state.plan.slice(0, 4000)}` }); stats.advised = (stats.advised || 0) + 1; onEvent({ type: 'info', text: 'ที่ปรึกษาวางแผนให้แล้ว' });
    }
    // 1) ใกล้ครบรอบ: บอกให้สรุป (เดิมวนจนครบแล้วจบเงียบ ๆ ผู้ใช้ไม่ได้สรุปว่าทำอะไรไป)
    if (depth === 0 && !segment && maxRounds >= 8 && round === maxRounds - 3) { messages.push({ role: 'user', content: '[Kyber Harness] Only 3 rounds left in this run. Finish now: make only the last essential fix (if any), then give the final summary (what changed, how it was verified, what is left). Do not start new work.' }); onEvent({ type: 'info', text: 'ใกล้ครบรอบ: ให้ AI สรุปงาน' }); }
    // 1) หยุดเมื่องานเสร็จจริง: ตรวจผ่านหลังแก้ล่าสุด + ไม่มี error ค้าง + ไม่มี todo ค้าง → 3 รอบที่ไม่แก้อะไร = เตือนให้สรุป · 6 รอบ = ปิดเครื่องมือให้สรุปเลย
    // (วัดจริง: งานเสร็จตั้งแต่ราวครึ่งทาง แต่โมเดลวนตรวจซ้ำจนครบ 60 รอบ ทุกรอบส่งบทสนทนาทั้งหมดใหม่)
    const quiet = state.codeEditRound >= 0 && state.verifyRound >= state.codeEditRound && !state.pageBad && !state.errors.size && !(state.todos || []).some(t => t.status && t.status !== 'completed') ? round - state.codeEditRound : 0;
    if (depth === 0 && !state.doneHint && quiet >= 3) {
      state.doneHint = true; messages.push({ role: 'user', content: '[Kyber Harness] Your last checks passed and you have not changed anything since. If every part of the request is done, give the final summary now. If something is still missing, make that change next (more checking alone is not needed).' }); onEvent({ type: 'info', text: 'ตรวจผ่านแล้ว: ให้ AI สรุปงาน' });
    }
    const doneStop = depth === 0 && quiet >= 6 && round < maxRounds - 1;
    const lastTurn = depth === 0 && ((!segment && maxRounds >= 8 && round === maxRounds - 1) || doneStop); // segment = งานยาว: ครบรอบแล้วระบบต่อช่วงใหม่ให้ ไม่ต้องรีบสรุป // รอบสุดท้าย / งานเสร็จแล้ว: ไม่ส่งเครื่องมือ = โมเดลต้องตอบสรุปเป็นข้อความ
    if (lastTurn) { messages.push({ role: 'user', content: doneStop ? '[Kyber Harness] The work is verified and nothing has changed for several rounds, so tools are off now. Write the final summary for the user: what you changed, how you checked it, and anything left to do.' : '[Kyber Harness] This is the last round: tools are off now. Write the final summary for the user: what you changed, how you checked it, and anything left to do.' }); if (doneStop) { stats.doneStop = 1; onEvent({ type: 'info', text: 'งานผ่านการตรวจแล้ว: ให้ AI สรุปและจบงาน' }); } }
    const body = { model, messages, stream: true, ...(tools.length && !lastTurn ? { tools } : {}), ...(effort ? { reasoning_effort: effort } : {}) };
    const tReq = Date.now(); let r, attempt = 0, msg = null, stalls = 0;
    const onEv = e => { if (e.type === 'usage') { const u = e.usage || {}; stats.promptTokens += u.prompt_tokens || 0; stats.outTokens += u.completion_tokens || 0; stats.cachedTokens += u.prompt_tokens_details?.cached_tokens || 0; } onEvent(e); };
    for (;;) { // ผู้ให้บริการล่ม/คนเยอะชั่วคราว/โมเดลเงียบ: รอแล้วลองรอบเดิมใหม่ ไม่ทิ้งงานที่ทำมาแล้ว · เคารพ Retry-After
      let netErr = null, got = false; const wd = watch(); let steered = false; if (steer) steer.cut = false; if (steer) steer.now = () => { steered = true; steer.cut = true; wd.kill(); };
      try { r = await post(body, wd.signal); } catch (e) { wd.stop(); if (signal?.aborted) throw new Error('หยุดแล้ว'); if (steered) break; netErr = wd.stalled ? wd.err() : e; }
      if (!netErr && r.ok) {
        try { msg = await readStream(r, onEv, () => { got = true; stats.ttft.push(Date.now() - tReq); }, () => wd.arm(stallMs)); wd.stop(); break; }
        catch (e) {
          wd.stop(); if (signal?.aborted) throw new Error('หยุดแล้ว'); if (steered) { msg = null; break; }
          // ผู้ให้บริการตัดสตรีมกลางคำสั่งเขียนไฟล์ใหญ่ (เช่น EA ทั้งไฟล์ในครั้งเดียว): ไม่จบงาน · ทำเหมือนชนเพดานความยาว ให้ AI แบ่งเขียนเป็นส่วน
          if (got && (stats.midcut || 0) < 2 && e.partial?.tool_calls?.some(tc => (tc.function?.arguments || '').length > 4000)) { stats.midcut = (stats.midcut || 0) + 1; msg = { ...e.partial, finish: 'length' }; onEvent({ type: 'text_end' }); break; }
          if (!wd.stalled) { if (got) throw e; netErr = e; netErr.soft = true; r = null; } // error กลางสตรีมก่อนได้คำตอบใด ๆ (เช่น "โมเดลตอบไม่ได้ตอนนี้"): ลองใหม่ ไม่ทิ้งทั้งงาน
          else {
          if (got) throw new Error(`${wd.err().message} (หยุดกลางคำตอบ สั่ง "ทำต่อ" ได้)`); // ส่งข้อความไปแล้วบางส่วน: ลองใหม่จะซ้ำ จึงจบงานแทนการค้าง
          netErr = wd.err(); r = null; }
        }
      } else if (!netErr) wd.stop();
      const n = retryWaits ? retryWaits.length : 4;
      if (!netErr && !RETRY_STATUS.has(r.status)) break;
      const stall = netErr && /ไม่ตอบภายใน/.test(netErr.message); if (stall) stalls++;
      if (attempt >= n || stalls > 1) { if (netErr) throw new Error(stall ? netErr.message + ' (ลองแล้ว 2 ครั้ง ลองสลับโมเดล หรือสั่ง "ทำต่อ")' : netErr.soft ? netErr.message + ' (ลองใหม่แล้วหลายครั้ง สั่ง "ทำต่อ" ได้)' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + netErr.message); break; } // โมเดลเงียบ: ลองใหม่แค่ครั้งเดียว ไม่รอเป็นสิบนาที
      const ra = netErr ? null : retryAfterMs(r), w = ra != null ? Math.min(ra, 60000) : retryWaits ? retryWaits[attempt] : backoffMs(attempt);
      onEvent({ type: 'info', text: `${stall ? netErr.message : `โมเดลไม่ว่างชั่วคราว (${netErr ? 'เครือข่าย' : r.status})`} ลองใหม่ใน ${Math.max(1, Math.round(w / 1000))} วินาที…` });
      stats.retries++; attempt++;
      try { await r?.body?.cancel?.(); } catch { /* ไม่มี body */ }
      await sleep(w, signal);
    }
    if (steer) steer.now = null;
    if (!msg && steer?.cut) { steer.cut = false; onEvent({ type: 'text_end' }); onEvent({ type: 'info', text: 'หยุดคำตอบเดิมไว้ แล้วอ่านข้อความที่คุณแทรกก่อน' }); round--; continue; }
    if (!msg) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status); }
    stats.rounds++;
    // คำตอบชนเพดานความยาว (finish_reason=length): ไม่ทิ้งงานแล้วให้โมเดลเขียนใหม่ทั้งก้อน (เปลือง token ซ้ำๆ)
    if (msg.finish === 'length') {
      stats.cut = (stats.cut || 0) + 1;
      const broken = msg.tool_calls.filter(tc => { try { JSON.parse(tc.function?.arguments || '{}'); return false; } catch { return true; } });
      if (broken.length) { // คำสั่งเครื่องมือถูกตัดกลาง (เช่น write_file ไฟล์ใหญ่): ไม่รัน · บอกให้แบ่งเขียนเป็นส่วน
        messages.push({ role: 'assistant', content: msg.content || '(cut off)' });
        messages.push({ role: 'user', content: `[Kyber Harness] Your last reply hit the output length limit and the ${broken.map(tc => tc.function?.name).join(', ')} call was cut off, so it was NOT run (about ${Math.round(broken.reduce((n, tc) => n + (tc.function?.arguments || '').length, 0) / 1000)}K characters). Do not resend it whole. Split the work: write a big file in parts (write_file for the first ~250 lines, then write_file with append=true for each next part), or change existing files with edit_file. Keep every single tool call well under the limit.` });
        onEvent({ type: 'info', text: 'คำตอบยาวเกินเพดาน คำสั่งถูกตัด: ให้ AI แบ่งเขียนเป็นส่วนแทนการเขียนใหม่ทั้งก้อน' }); onCheckpoint?.({ round, messages, state: snapshot(state) }); continue;
      }
      if (!msg.tool_calls.length && (stats.cont || 0) < 3) { // ข้อความยาวถูกตัด: ให้เขียนต่อจากจุดที่ค้าง (ไม่เริ่มใหม่)
        stats.cont = (stats.cont || 0) + 1;
        messages.push({ role: 'assistant', content: msg.content || '' }, { role: 'user', content: '[Kyber Harness] Your reply was cut off by the length limit. Continue exactly where it stopped, without repeating anything already written.' });
        onEvent({ type: 'info', text: 'คำตอบยาวเกินเพดาน: ให้ AI เขียนต่อจากจุดที่ค้าง' }); continue;
      }
    }
    messages.push({ role: 'assistant', content: msg.content || null, ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'text_end' });
    if (!msg.tool_calls.length) {
      // รับปากแล้วจบโดยไม่เรียกเครื่องมือ (ได้สูงสุด 2 ครั้งต่องาน): สั่งให้ลงมือแก้ไฟล์จริงตอนนี้
      if (depth === 0 && tools.length && !lastTurn && (state.promised || 0) < 2 && round < maxRounds - 1 && PROMISE_RE.test(msg.content || '') && (msg.content || '').length < 3000) {
        state.promised = (state.promised || 0) + 1; stats.promised = (stats.promised || 0) + 1;
        messages.push({ role: 'user', content: '[Kyber Harness] You said what you will do but did not call any tool, so nothing was changed. Do it now: call the tools (read the exact lines, then edit_file/write_file, run commands). Do not answer with text only and do not ask for permission again. When the work is really done, give a short summary of what changed.' });
        onEvent({ type: 'info', text: 'AI บอกว่าจะทำแต่ยังไม่ลงมือ: สั่งให้แก้ไฟล์จริง' }); onCheckpoint?.({ round, messages, state: snapshot(state) }); continue;
      }
      // ตรวจงานก่อนจบ (ครั้งเดียว): แก้โค้ดแล้วยังไม่ได้รันเทสต์/บิลด์หลังแก้ครั้งล่าสุด หรืออ้างว่า "ผ่าน" ทั้งที่ไม่ได้รันอะไรเลย → ให้ตรวจจริงก่อน
      const unverified = state.codeEditRound >= 0 && state.verifyRound < state.codeEditRound, claim = CLAIM_RE.test(msg.content || '') && state.verifyRound < 0;
      const stillBad = state.pageBad || [...state.errors.keys()].some(k => /^(bash|check_page):/.test(k)); // ตรวจแล้วยังพัง (เทสต์/บิลด์ exit ≠ 0 หรือหน้าเว็บมี error/จอว่าง)
      if (verifyGate && depth === 0 && (state.badGates || 0) < 2 && stillBad && state.verifyRound >= 0 && round < maxRounds - 1) {
        state.badGates = (state.badGates || 0) + 1; stats.gated = (stats.gated || 0) + 1;
        let adv = null; if (advisor?.unstuck) { onEvent({ type: 'info', text: 'ตรวจไม่ผ่าน: ถามที่ปรึกษา…' }); adv = await Promise.resolve(advisor.unstuck(messages)).catch(() => null); } // เรียกโมเดลแรงตอนที่ช่วยได้จริง
        messages.push({ role: 'user', content: `[Kyber Harness] The last checks still fail:\n${[...state.errors.values()].slice(-4).join('\n') || 'check_page reported errors or a blank page'}\nFix the cause and run the check again. Only finish when it passes; if it truly cannot pass, explain exactly why.${adv ? `\n\n[advisor ${advisor.model}] ${adv.slice(0, 2000)}` : ''}` });
        onEvent({ type: 'info', text: 'ตรวจงานยังไม่ผ่าน: ให้ AI แก้ก่อนสรุป' }); onCheckpoint?.({ round, messages, state: snapshot(state) }); continue;
      }
      if (verifyGate && depth === 0 && !state.gated && (unverified || claim) && round < maxRounds - 1) {
        state.gated = 1; stats.gated = (stats.gated || 0) + 1;
        const how = checks.length ? `The project's checks: ${checks.slice(0, 4).map(c => '`' + c + '`').join(', ')}.` : 'Find the project\'s test/build command (package.json scripts, Makefile, pytest, etc.).';
        messages.push({ role: 'user', content: `[Kyber Harness] ${claim && !unverified ? 'You said it passes, but you have not run any test or build in this task.' : 'You changed code but have not run any test or build since your last change.'} Before finishing, verify your work: ${how} Run the relevant check now with bash, fix real failures, then give the final summary. If there is genuinely nothing to run (no tests, no build step), say that plainly instead of claiming it passes.` });
        onEvent({ type: 'info', text: 'ตรวจงานก่อนจบ: ให้ AI รันเทสต์/บิลด์ก่อนสรุป' }); onCheckpoint?.({ round, messages, state: snapshot(state) }); continue;
      }
      // ผู้ตรวจรอบสอง (ครั้งเดียว): โมเดลอีกตัวอ่านสิ่งที่แก้หาบั๊ก/จุดที่ไม่ตรงคำสั่ง → ให้ Agent แก้ก่อนจบ
      const small = state.verifyRound >= 0 && state.verifyRound >= state.codeEditRound && !state.errors.size && !state.pageBad; // เทสต์/ตรวจหน้าเว็บผ่านหลังแก้ล่าสุดแล้ว: เชื่อผลตรวจ ข้ามผู้ตรวจ Opus (วัดจริง: แพงแต่ไม่เพิ่มคุณภาพ) · ผู้ตรวจใช้เมื่อไม่มีอะไรให้ตรวจ
      if (small && review && depth === 0 && !state.reviewed && state.changed.size) { state.reviewed = true; stats.reviewSkipped = 1; }
      if (review && depth === 0 && !state.reviewed && state.changed.size && round < maxRounds - 1) {
        state.reviewed = true; onEvent({ type: 'info', text: 'ผู้ตรวจรอบสองกำลังอ่านสิ่งที่แก้…' });
        const notes = await Promise.resolve(review({ changed: [...state.changed], final: msg.content || '', messages })).catch(() => null);
        if (notes && !/^\s*(LGTM|ไม่พบปัญหา)/i.test(notes)) {
          stats.reviewed = (stats.reviewed || 0) + 1;
          messages.push({ role: 'user', content: `[Kyber Harness · review] A second reviewer read your changes and flagged:\n${String(notes).slice(0, 4000)}\n\nCheck each point against the actual files. Fix the real problems (and re-run the checks); if a point is wrong, say why in one line. Then give the final summary.` });
          onEvent({ type: 'info', text: 'ผู้ตรวจรอบสองพบจุดที่ควรแก้: ให้ AI แก้ก่อนจบ' }); onCheckpoint?.({ round, messages, state: snapshot(state) }); continue;
        }
      }
      onCheckpoint?.({ round, messages, state: snapshot(state) }); return finish();
    }
    const images = [];
    const run1 = async tc => {
      if (signal?.aborted) throw new Error('หยุดแล้ว');
      const name = tc.function?.name || '', raw = tc.function?.arguments || '';
      let args = {}, parseErr = null;
      try { args = raw.trim() ? JSON.parse(raw) : {}; } catch (e) { parseErr = e.message; }
      const step = onStep(tc) ?? null;
      onEvent({ type: 'tool', id: tc.id, name, args, step });
      stats.toolCalls++; stats.perTool[name] = stats.perTool[name] || { calls: 0, errors: 0 }; stats.perTool[name].calls++;
      // argument ผิดรูป/ขาด: ตอบโมเดลทันทีพร้อมพารามิเตอร์ที่ถูกต้อง (ไม่ส่ง {} เข้าไปพังในเครื่องมือ)
      const invalid = parseErr ? `arguments are not valid JSON (${parseErr})` : schemas.has(name) ? validateArgs(schemas.get(name), args) : null;
      let out;
      if (invalid) out = `Error: invalid arguments for ${name}: ${invalid}. Expected parameters: ${describeParams(schemas.get(name))}. Call it again with corrected arguments.`;
      else if (depth > 0 && name === 'task') out = 'Error: a helper agent cannot start another helper (no nested task). Do the research yourself.';
      else { try { out = await callTool(name, args, tc); } catch (e) { out = 'Error: ' + e.message; } }
      if (out && typeof out === 'object') { images.push(...(out.images || [])); out = out.text ?? ''; } // MCP / ภาพหน้าเว็บ ที่ส่งรูปมา
      out = maskSecrets(out);
      const ok = !out.startsWith('Error');
      if (!ok) { stats.toolErrors++; stats.perTool[name].errors++; }
      // ผลยาว: เก็บเต็มลงไฟล์ ส่งแค่หัว/ท้าย (ประหยัด context และให้โมเดลเจาะอ่านเฉพาะบรรทัดที่ต้องการ)
      if (out.length > SPILL_AT && spill && !NO_SPILL.has(name)) {
        const p = await Promise.resolve(spill(out, { name, id: tc.id })).catch(() => null);
        if (p) out = `${out.slice(0, 6000)}\n\n…(ตัดกลาง: ผลเต็ม ${out.length.toLocaleString()} ตัวอักษร ${out.split('\n').length.toLocaleString()} บรรทัด เก็บไว้ที่ ${p} · อ่านเฉพาะส่วนด้วย read_file (offset/limit) หรือ grep)…\n\n${out.slice(-3000)}`;
      }
      if (out.length > TOOL_OUT_MAX) out = out.slice(0, TOOL_OUT_MAX / 2) + '\n…(ตัดกลาง เหลือ ' + TOOL_OUT_MAX + ' ตัวอักษร)…\n' + out.slice(-TOOL_OUT_MAX / 2);
      track(state, name, args, out, ok);
      onEvent({ type: 'tool_result', id: tc.id, name, ok, preview: out.slice(0, 3000) });
      return { role: 'tool', tool_call_id: tc.id, content: out || '(ไม่มีผลลัพธ์)', _sig: name + '|' + raw, _err: ok ? null : name + '|' + out.slice(0, 200) };
    };
    // อ่าน/ค้นที่ติดกันรันพร้อมกัน · แก้ไฟล์/รันคำสั่ง/ถามผู้ใช้ รันทีละอันตามลำดับ · ผลเรียงตาม tool_calls เดิมเสมอ
    const results = new Array(msg.tool_calls.length); let batch = [];
    const flush = async () => { await Promise.all(batch.map(async ([i, tc]) => { results[i] = await run1(tc); })); batch = []; };
    for (let i = 0; i < msg.tool_calls.length; i++) {
      const tc = msg.tool_calls[i];
      if (kindOf(tc.function?.name) === 'read') batch.push([i, tc]); else { await flush(); results[i] = await run1(tc); }
    }
    await flush();
    // ตัวตรวจวนซ้ำ: เรียกเครื่องมือเดิม argument เดิม หรือได้ error เดิม ติดกัน STUCK_N ครั้ง → เตือนให้เปลี่ยนวิธี (ครั้งเดียวต่อรูปแบบ)
    for (const m of results) { recentSig.push(m._sig); if (m._err) recentErr.push(m._err); else recentErr.length = 0; }
    const sameTail = (a, k) => a.length >= STUCK_N && a.slice(-STUCK_N).every(x => x === a[a.length - 1]) ? a[a.length - 1] : null;
    const loop = sameTail(recentSig, STUCK_N), errLoop = sameTail(recentErr, STUCK_N);
    let hint = '';
    if (loop && !hinted.has('s:' + loop)) { hinted.add('s:' + loop); hint = `You have called ${loop.split('|')[0]} with the same arguments ${STUCK_N} times in a row and keep getting the same result. Stop repeating it: read the result above, then change your approach (different arguments, another tool, or ask the user).`; }
    else if (errLoop && !hinted.has('e:' + errLoop)) { hinted.add('e:' + errLoop); hint = `The same error has happened ${STUCK_N} times in a row (${errLoop.split('|')[0]}). Do not retry the same thing: find the root cause (read the file/output again, check paths and exact text) or try a different method.`; }
    if (hint) {
      stats.stuck++; let adv = null;
      if (advisor?.unstuck && depth === 0) { onEvent({ type: 'info', text: 'ติดวนซ้ำ: ถามที่ปรึกษา…' }); adv = await Promise.resolve(advisor.unstuck([...messages, ...results.map(({ _sig, _err, ...m }) => m)])).catch(() => null); }
      results.at(-1).content += `\n\n[Kyber Harness] ${hint}${adv ? `\n\n[advisor ${advisor.model}] ${adv.slice(0, 2000)}` : ''}`; onEvent({ type: 'info', text: adv ? 'ที่ปรึกษาแนะนำทางแก้แล้ว' : 'ตรวจพบการวนซ้ำ: เตือนโมเดลให้เปลี่ยนวิธี' });
    }
    messages.push(...results.map(({ _sig, _err, ...m }) => m));
    if (images.length && !seeImages) { messages.push({ role: 'user', content: `[Kyber Harness] เครื่องมือส่งรูปมา ${images.length} รูป แต่โมเดลนี้อ่านรูปไม่ได้ จึงไม่ได้แนบ (ใช้ผลที่เป็นข้อความแทน)` }); images.length = 0; } // เดิมแนบไป → เซิร์ฟเวอร์ตอบ 400 งานพัง
    if (images.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'ภาพจากเครื่องมือด้านบน' }, ...images.slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))] }); // tool message ส่งรูปไม่ได้ จึงแนบเป็นข้อความถัดไป
    onCheckpoint?.({ round, messages, state: snapshot(state) }); // บันทึกทุกรอบ: แอป/เครื่องเสมือนรีสตาร์ตแล้วทำต่อได้
  }
  stats.capped = 'rounds'; if (!segment) stop(`ทำงานครบ ${maxRounds} รอบแล้ว`);
  return finish();
}
// ลดขนาดบริบท (ทำทุกรอบ ไม่ต้องเรียกโมเดล): ของเก่าที่โมเดลไม่ต้องเห็นซ้ำทุกรอบ
// 1) เนื้อหาไฟล์ใน write_file/edit_file ที่เขียนไปแล้ว (ไฟล์อยู่บนดิสก์ อ่านใหม่ได้) 2) ผลเครื่องมือยาว ๆ ของรอบเก่า 3) ภาพหน้าเว็บเก่า (เหลือภาพล่าสุด)
// เดิมไฟล์ 50K ตัวอักษรที่เขียนตอนต้นถูกส่งซ้ำทุกรอบ = โทเคนขาเข้าหลักของงาน · แก้ในที่เดิมครั้งเดียว ข้อความเก่าไม่เปลี่ยนอีก (prompt cache ส่วนต้นยังใช้ได้)
const SLIM_MIN = 240000, SLIM_KEEP = 3, SLIM_STEP = 4, SLIM_OUT = 1500, SLIM_ARG = 400, BIG_ARGS = ['content', 'new_string', 'old_string', 'edits', 'patch'], CODE_ARGS = ['code', 'script', 'source', 'command', 'luau', 'lua', 'python', 'query']; // CODE_ARGS: โค้ดที่ส่งไปรันแล้ว (เช่น MCP Roblox run_code, bash)
// วัดจริง (Roblox, DeepSeek): ย่อบทสนทนาเล็ก ๆ ทำให้แคชหลุดทุกครั้งที่ย่อ (ผู้ให้บริการจำแคชจากต้นบทสนทนา) แพงกว่าส่งต่อแบบแคช → ย่อเมื่อยาวเกิน ~40K token เท่านั้น
function slim(messages, min = SLIM_MIN, editing = null) { // editing = ไฟล์ที่งานนี้แก้อยู่: ผลอ่านไฟล์เหล่านี้ไม่ตัด (โมเดลต้องเห็นข้อความจริงเพื่อแก้ต่อ ไม่งั้นต้องอ่านซ้ำทุกไม่กี่รอบ)
  if (min && JSON.stringify(messages).length < min) return 0;
  const readOf = new Map(); for (const m of messages) if (m.role === 'assistant' && m.tool_calls) for (const tc of m.tool_calls) if (tc.function?.name === 'read_file') { try { readOf.set(tc.id, String(JSON.parse(tc.function.arguments || '{}').path || '')); } catch { /* */ } }
  const latestRead = new Map(); messages.forEach((m, i) => { if (m.role === 'tool' && readOf.has(m.tool_call_id)) latestRead.set(readOf.get(m.tool_call_id), i); }); // เก็บเฉพาะครั้งล่าสุดที่อ่านแต่ละไฟล์
  const asst = messages.map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0);
  // เส้นแบ่ง "ของเก่า" ขยับทีละ SLIM_STEP รอบ (ไม่ใช่ทุกรอบ): ข้อความต้นบทสนทนาคงเดิมหลายรอบติด → prompt cache ติดมากขึ้น · เก็บเต็มอย่างน้อย SLIM_KEEP รอบล่าสุด
  const k = Math.floor((asst.length - SLIM_KEEP) / SLIM_STEP) * SLIM_STEP, cut = k > 0 ? asst[k] : -1; let n = 0, lastImg = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (Array.isArray(messages[i].content) && messages[i].content.some(p => p.type === 'image_url')) { lastImg = i; break; }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (Array.isArray(m.content) && i !== lastImg && m.content.some(p => p.type === 'image_url')) { m.content = '(ภาพหน้าเว็บรอบก่อน: ลบออกเพื่อประหยัด context · ภาพล่าสุดยังอยู่)'; n++; continue; }
    if (cut < 0 || i >= cut) continue;
    if (m.role === 'assistant' && m.tool_calls) for (const tc of m.tool_calls) {
      const raw = tc.function?.arguments || ''; if (raw.length <= SLIM_ARG * 2) continue;
      let a; try { a = JSON.parse(raw); } catch { continue; }
      let hit = false;
      for (const k of BIG_ARGS) if (a[k] != null) { const v = typeof a[k] === 'string' ? a[k] : JSON.stringify(a[k]); if (v.length > SLIM_ARG) { a[k] = `«${v.length.toLocaleString()} chars, already applied to the file; read_file to see the current text»`; hit = true; } }
      for (const k of CODE_ARGS) if (typeof a[k] === 'string' && a[k].length > SLIM_ARG * 2) { a[k] = a[k].slice(0, SLIM_ARG) + `\n…«${(a[k].length - SLIM_ARG).toLocaleString()} more chars, already run»`; hit = true; }
      if (hit) { tc.function.arguments = JSON.stringify(a); n++; }
    }
    if (m.role === 'tool' && editing?.size && readOf.has(m.tool_call_id) && editing.has(readOf.get(m.tool_call_id)) && latestRead.get(readOf.get(m.tool_call_id)) === i) continue;
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > SLIM_OUT && !m.content.startsWith('[old]')) { m.content = `[old] ${m.content.slice(0, 900)}\n…(older output trimmed; re-run or read_file if you need it again)…\n${m.content.slice(-400)}`; n++; }
  }
  return n;
}
const snapshot = s => ({ todos: s.todos, changed: [...s.changed], errors: [...s.errors.values()], verified: s.verifyRound >= s.codeEditRound });
// เก็บสถานะงานจากผลเครื่องมือ: todo ล่าสุด · ไฟล์ที่แก้สำเร็จ · error ที่ยังไม่หาย (หายเมื่อเครื่องมือเดียวกันกับไฟล์/คำสั่งเดียวกันสำเร็จ)
function track(state, name, args, out, ok) {
  if (name === 'todo_write' && ok && Array.isArray(args.todos)) state.todos = args.todos.slice(0, 30).map(t => ({ content: String(t.content || '').slice(0, 200), status: t.status }));
  const target = String(args.path || args.command || args.url || '').slice(0, 200), k = name + ':' + target;
  if (EDIT_TOOLS.has(name) && ok) state.editChars = (state.editChars || 0) + String(args.content ?? args.new_string ?? JSON.stringify(args.edits ?? '')).length;
  if (EDIT_TOOLS.has(name) && ok && args.path) { state.changed.add(String(args.path)); if (CODE_RE.test(String(args.path))) state.codeEditRound = state.round; }
  if ((name === 'bash' && VERIFY_RE.test(String(args.command || ''))) || name === 'check_page') state.verifyRound = state.round;
  if (name === 'roblox' && ok) { // Roblox Studio: แก้ = write/edit/create/set/delete/run · ตรวจ = play (ใช้ระบบเตือนให้จบเหมือนงานโค้ดปกติ)
    if (['write', 'edit', 'create', 'set', 'delete', 'run'].includes(args.op)) state.codeEditRound = state.round;
    if (args.op === 'play') { state.verifyRound = state.round; state.pageBad = /\[error\]/.test(out); }
  } // check_page = เปิดหน้าเว็บจริงตรวจ
  if (name === 'check_page') { state.pageBad = !ok || /พบ error|ดูเหมือนว่าง/.test(out); } // รันตรวจแล้ว (ผ่านหรือไม่ผ่านก็นับ: โมเดลเห็นผลจริงแล้ว)
  const envOnly = name === 'bash' && (ENV_CMD_RE.test(String(args.command || '')) || ENV_ERR_RE.test(out)); // หาโปรแกรม/เครื่องไม่พร้อม ≠ งานพัง: ไม่ใช้ตีกลับตอนจบ (เดิมทำให้ AI ไปนั่งแก้เครื่องแทนงาน)
  const failed = !ok || (name === 'bash' && !envOnly && /^exit [1-9]\d*/.test(out)); // คำสั่งที่ exit ไม่ใช่ 0 (เทสต์/บิลด์พัง) = error ที่ยังค้าง
  if (failed) state.errors.set(k, `${name} ${target}: ${out.slice(0, 300)}`); else state.errors.delete(k);
  if (state.errors.size > 8) state.errors.delete(state.errors.keys().next().value);
}

// ย่อบทสนทนาเมื่อยาวเกิน: ให้โมเดลสรุปงานส่วนเก่า แล้วเก็บ system + สรุป + สถานะงานที่บังคับคง (todo / ไฟล์ที่แก้ / error ค้าง) + 4 รอบล่าสุดเต็มข้อความ
async function compact({ post, model, messages, onEvent, state = null, pinned = null }) {
  const sys = messages[0]?.role === 'system' ? messages[0] : null, body = messages.slice(sys ? 1 : 0);
  const asst = body.map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0);
  let start = asst.length >= 6 ? asst[asst.length - 6] : Math.max(0, body.length - 8); // เก็บ 6 รอบล่าสุดเต็ม ๆ (เดิม 4): ลูกค้าหยุดแล้วสั่งต่อบ่อย ส่วนที่เพิ่งทำต้องยังอยู่ครบ
  if (start === 0) start = Math.max(1, body.length - 8); // ต้องมีส่วนเก่าให้ย่ออย่างน้อย 1 ข้อความ
  let keep = body.slice(start); while (keep.length && keep[0].role === 'tool') keep = keep.slice(1);
  const old = body.slice(0, body.length - keep.length); if (!old.length) return;
  const text = old.map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.tool_calls ?? '')}`.slice(0, 4000)).join('\n').slice(-200000);
  onEvent({ type: 'info', text: 'บทสนทนายาวแล้ว กำลังย่อส่วนเก่า…' });
  const r = await post({ model, stream: false, max_tokens: 3500, messages: [{ role: 'system', content: 'Summarize this agent work log so the agent can continue WITHOUT redoing any work: the user goal and every later instruction or correction from the user; what was already found (search results, sources with URLs, facts, numbers, answers, conclusions); files read and changed (with paths); commands run and their results; decisions; and what is left to do. Keep concrete findings verbatim enough to reuse them. Bullet points, at most 800 words, same language as the user.' }, { role: 'user', content: text }] }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {}, sum = d.choices?.[0]?.message?.content;
  if (!r?.ok || !sum) return; // ย่อไม่สำเร็จ (รวมเน็ตหลุด): ทำต่อแบบเดิม ไม่ทิ้งงาน
  const s = state ? snapshot(state) : null;
  const facts = s ? [s.todos?.length ? 'Current todo list:\n' + s.todos.map(t => `- [${t.status}] ${t.content}`).join('\n') : '', s.changed.length ? 'Files already changed in this task: ' + s.changed.join(', ') : '', s.errors.length ? 'Unresolved errors:\n' + s.errors.map(e => '- ' + e).join('\n') : '', pinned?.() || ''].filter(Boolean).join('\n\n') : '';
  const goal = body.find(m => m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('[')); // คำสั่งแรกของผู้ใช้: เก็บคำต่อคำ ไม่ให้สรุปจนเพี้ยน
  messages.splice(0, messages.length, ...(sys ? [sys] : []), { role: 'user', content: (goal && !keep.includes(goal) ? '[คำสั่งแรกของผู้ใช้ (ตัวจริง)]\n' + goal.content.slice(0, 6000) + '\n\n' : '') + '[สรุปงานก่อนหน้า]\n' + sum + (facts ? '\n\n[สถานะงานที่ต้องคงไว้]\n' + facts : '') }, { role: 'assistant', content: 'รับทราบ ทำงานต่อจากสรุปนี้' }, ...keep);
}

// อ่าน SSE แบบ OpenAI: ต่อข้อความและ tool_calls ที่มาเป็นชิ้น ๆ (ชิ้นแรกมี id/name ชิ้นต่อไปมีแต่ arguments) · onFirst = ได้ token/เครื่องมือแรก (วัด TTFT)
async function readStream(r, onEvent, onFirst = () => {}, onChunk = () => {}) { // onChunk: ได้ข้อมูลทุกครั้ง (รวม ping) ใช้รีเซ็ตนาฬิกาเฝ้าสตรีม
  const out = { content: '', tool_calls: [], finish: null }, dec = new TextDecoder(); let buf = '', first = false;
  const hit = () => { if (!first) { first = true; onFirst(); } };
  const take = line => {
    if (!line.startsWith('data:')) return; const data = line.slice(5).trim(); if (!data || data === '[DONE]') return;
    let e; try { e = JSON.parse(data); } catch { return; }
    if (e.error) throw new Error(e.error.message_th || e.error.message || 'error');
    if (e.usage) onEvent({ type: 'usage', usage: e.usage });
    if (e.choices?.[0]?.finish_reason) out.finish = e.choices[0].finish_reason;
    const d = e.choices?.[0]?.delta || {};
    if (typeof d.content === 'string' && d.content) { hit(); out.content += d.content; onEvent({ type: 'delta', text: d.content }); }
    if (typeof d.reasoning_content === 'string' && d.reasoning_content) { hit(); onEvent({ type: 'think', text: d.reasoning_content }); }
    for (const tc of d.tool_calls || []) {
      hit(); const i = tc.index ?? out.tool_calls.length, c = out.tool_calls[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (tc.id) c.id = tc.id; if (tc.function?.name) c.function.name += tc.function.name; if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
    }
  };
  try {
    for await (const chunk of r.body) { onChunk(); buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } }
    buf += dec.decode(); take(buf.trim());
  } catch (e) { e.partial = { ...out, tool_calls: out.tool_calls.filter(Boolean) }; throw e; } // ให้ผู้เรียกเห็นว่าพังตอนเขียนอะไรค้างอยู่ // บรรทัดสุดท้ายที่ไม่มี \n ปิดท้าย (usage / stop) ไม่หล่นหาย
  out.tool_calls = out.tool_calls.filter(Boolean).map(c => ({ ...c, id: c.id || 'call_' + Math.random().toString(36).slice(2, 10) }));
  return out;
}

module.exports = { PROMISE_RE, runAgent, readStream, compact, slim, repairHistory, validateArgs, describeParams, maskSecrets, retryAfterMs, backoffMs, TOOL_OUT_MAX, SPILL_AT, READ_TOOLS };
