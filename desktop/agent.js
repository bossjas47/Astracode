// Kyber Harness · ตัวคุมรอบ (Loop Controller) แบบ Claude Code: ส่งงานให้โมเดลผ่าน /v1 → โมเดลขอใช้เครื่องมือ → ทำในเครื่อง → ส่งผลกลับ → วนจนโมเดลตอบโดยไม่ขอเครื่องมือ
// ใช้ร่วมกันทั้งแอป Desktop (main.js) และเครื่องเสมือนบนคลาวด์ (astracode/container/server.js) · ไม่ผูก Electron จึงทดสอบด้วย node ได้ (fetchImpl / callTool / onEvent ฉีดเข้ามา)
// ส่วนที่คุมให้ทำงานได้นานโดยไม่เปลือง: ลองใหม่แบบ backoff+jitter · ตรวจวนซ้ำ · เพดานรอบ/เวลา/token · ตรวจ argument กับ schema · อ่านพร้อมกัน/เขียนทีละอัน · ผลยาวเก็บลงไฟล์ · ย่อบทสนทนาแบบไม่ทิ้งงาน · บันทึก checkpoint
const TOOL_OUT_MAX = 60000; // ผลเครื่องมือยาวสุดที่ส่งเข้า context (กรณีไม่มีที่เก็บไฟล์)
const SPILL_AT = 12000; // ผลยาวกว่านี้: เก็บเต็มลงไฟล์ (.kyber-tmp) แล้วส่งให้โมเดลแค่หัว + ท้าย + path
const COMPACT_AT = 350000; // ตัวอักษรรวมของบทสนทนา (~100k token) เกินนี้ → ย่อส่วนเก่าก่อนรอบถัดไป
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 529]);
// เครื่องมือที่อ่านอย่างเดียว: รันพร้อมกันได้ในรอบเดียว · ที่เหลือ (แก้ไฟล์/รันคำสั่ง/ถามผู้ใช้) รันทีละอันตามลำดับ กันไฟล์ชนกัน
const READ_TOOLS = new Set(['read_file', 'list_dir', 'glob', 'grep', 'git_inspect', 'check_syntax', 'web_search', 'web_fetch', 'task', 'read_document', 'screenshot_url']);
const EDIT_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit', 'make_document']);
const NO_SPILL = new Set(['read_file', 'read_document', 'task', 'ask_user']); // ผลที่โมเดลขอดูเต็ม ๆ (เนื้อไฟล์ที่จะแก้ / รายงานผู้ช่วย): ไม่เก็บลงไฟล์
const STUCK_N = 3; // เรียกเครื่องมือเดิมด้วย argument เดิม / error เดิม ติดกันเท่านี้ = วนซ้ำ

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
    if (miss.length) { messages.splice(j, 0, ...miss.map(tc => ({ role: 'tool', tool_call_id: tc.id, content: `Error: interrupted (the app or sandbox restarted before ${tc.function?.name || 'this tool'} finished). Check the current state of files before redoing it; do not blindly rewrite.` }))); fixed += miss.length; }
  }
  return fixed;
}

// inbox(): ข้อความที่ผู้ใช้พิมพ์แทรกระหว่างทำงาน · effort: ระดับการคิด · onStep(tc): เลขขั้นตอนก่อนเรียกเครื่องมือ (ใช้ย้อนไฟล์)
// ตัวเลือกใหม่ (ไม่ส่ง = พฤติกรรมเดิม): maxDurationMs · maxTokens (token รวมทั้งงาน) · depth (ผู้ช่วย = 1: ห้าม task ซ้อน) · toolKind(name) → 'read'|อื่นๆ
//   spill(text, info) → path ของไฟล์ที่เก็บผลเต็ม · onCheckpoint({ round, messages, state }) · retryWaits (ระบุเอง = ไม่สุ่ม ใช้ในเทสต์)
async function runAgent({ base, key, model, messages, tools = [], callTool, onEvent = () => {}, signal, maxRounds = 80, fetchImpl = fetch, compactAt = COMPACT_AT, inbox = () => [], effort = null, onStep = () => {},
  retryWaits = null, maxDurationMs = 0, maxTokens = 0, depth = 0, toolKind = null, spill = null, onCheckpoint = null }) {
  const url = base.replace(/\/$/, '') + '/chat/completions', t0 = Date.now();
  const post = body => fetchImpl(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  const schemas = new Map(tools.map(t => [t.function?.name, t.function?.parameters]));
  const kindOf = name => toolKind?.(name) || (READ_TOOLS.has(name) ? 'read' : 'write');
  // สถานะที่ต้องคงไว้เสมอแม้ย่อบทสนทนา: รายการงานล่าสุด · ไฟล์ที่แก้แล้ว · error ที่ยังไม่หาย
  const state = { todos: null, changed: new Set(), errors: new Map() };
  const stats = { rounds: 0, toolCalls: 0, toolErrors: 0, perTool: {}, ttft: [], promptTokens: 0, cachedTokens: 0, outTokens: 0, stuck: 0, retries: 0 };
  const recentSig = [], recentErr = [], hinted = new Set();
  const fixed = repairHistory(messages); if (fixed) onEvent({ type: 'info', text: `ทำต่อจากงานที่ค้าง (เครื่องมือ ${fixed} รายการถูกขัดจังหวะ)` });
  const stop = text => { onEvent({ type: 'delta', text: `\n\n(หยุด: ${text} สั่ง "ทำต่อ" ได้)` }); };
  const finish = () => { stats.ms = Date.now() - t0; stats.cacheHit = stats.promptTokens ? Math.round(stats.cachedTokens / stats.promptTokens * 1000) / 10 : 0; onEvent({ type: 'stats', stats }); return messages; };
  for (let round = 0; round < maxRounds; round++) {
    if (signal?.aborted) throw new Error('หยุดแล้ว');
    if (maxDurationMs && Date.now() - t0 > maxDurationMs) { stop(`ทำงานครบเวลา ${Math.round(maxDurationMs / 60000)} นาทีแล้ว`); return finish(); }
    if (maxTokens && stats.promptTokens + stats.outTokens > maxTokens) { stop(`ใช้ token ครบเพดาน ${maxTokens.toLocaleString()} แล้ว`); return finish(); }
    for (const m of inbox()) { messages.push({ role: 'user', content: m }); onEvent({ type: 'steer' }); }
    if (JSON.stringify(messages).length > compactAt) await compact({ post, model, messages, onEvent, state });
    const body = { model, messages, stream: true, ...(tools.length ? { tools } : {}), ...(effort ? { reasoning_effort: effort } : {}) };
    const tReq = Date.now(); let r, attempt = 0;
    for (;;) { // ผู้ให้บริการล่ม/คนเยอะชั่วคราว: รอแล้วลองรอบเดิมใหม่ ไม่ทิ้งงานที่ทำมาแล้ว · เคารพ Retry-After
      let netErr = null;
      try { r = await post(body); } catch (e) { if (signal?.aborted) throw new Error('หยุดแล้ว'); netErr = e; }
      const n = retryWaits ? retryWaits.length : 4;
      if (!netErr && !RETRY_STATUS.has(r.status)) break;
      if (attempt >= n) { if (netErr) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + netErr.message); break; }
      const ra = netErr ? null : retryAfterMs(r), w = ra != null ? Math.min(ra, 60000) : retryWaits ? retryWaits[attempt] : backoffMs(attempt);
      onEvent({ type: 'info', text: `โมเดลไม่ว่างชั่วคราว (${netErr ? 'เครือข่าย' : r.status}) ลองใหม่ใน ${Math.max(1, Math.round(w / 1000))} วินาที…` });
      stats.retries++; attempt++;
      try { await r?.body?.cancel?.(); } catch { /* ไม่มี body */ }
      await sleep(w, signal);
    }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status); }
    const msg = await readStream(r, e => { if (e.type === 'usage') { const u = e.usage || {}; stats.promptTokens += u.prompt_tokens || 0; stats.outTokens += u.completion_tokens || 0; stats.cachedTokens += u.prompt_tokens_details?.cached_tokens || 0; } onEvent(e); }, () => stats.ttft.push(Date.now() - tReq));
    stats.rounds++;
    messages.push({ role: 'assistant', content: msg.content || null, ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'text_end' });
    if (!msg.tool_calls.length) { onCheckpoint?.({ round, messages, state: snapshot(state) }); return finish(); }
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
    if (hint) { stats.stuck++; results.at(-1).content += `\n\n[Kyber Harness] ${hint}`; onEvent({ type: 'info', text: 'ตรวจพบการวนซ้ำ: เตือนโมเดลให้เปลี่ยนวิธี' }); }
    messages.push(...results.map(({ _sig, _err, ...m }) => m));
    if (images.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'ภาพจากเครื่องมือด้านบน' }, ...images.slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))] }); // tool message ส่งรูปไม่ได้ จึงแนบเป็นข้อความถัดไป
    onCheckpoint?.({ round, messages, state: snapshot(state) }); // บันทึกทุกรอบ: แอป/เครื่องเสมือนรีสตาร์ตแล้วทำต่อได้
  }
  stop(`ทำงานครบ ${maxRounds} รอบแล้ว`);
  return finish();
}
const snapshot = s => ({ todos: s.todos, changed: [...s.changed], errors: [...s.errors.values()] });
// เก็บสถานะงานจากผลเครื่องมือ: todo ล่าสุด · ไฟล์ที่แก้สำเร็จ · error ที่ยังไม่หาย (หายเมื่อเครื่องมือเดียวกันกับไฟล์/คำสั่งเดียวกันสำเร็จ)
function track(state, name, args, out, ok) {
  if (name === 'todo_write' && ok && Array.isArray(args.todos)) state.todos = args.todos.slice(0, 30).map(t => ({ content: String(t.content || '').slice(0, 200), status: t.status }));
  const target = String(args.path || args.command || args.url || '').slice(0, 200), k = name + ':' + target;
  if (EDIT_TOOLS.has(name) && ok && args.path) state.changed.add(String(args.path));
  const failed = !ok || (name === 'bash' && /^exit [1-9]\d*/.test(out)); // คำสั่งที่ exit ไม่ใช่ 0 (เทสต์/บิลด์พัง) = error ที่ยังค้าง
  if (failed) state.errors.set(k, `${name} ${target}: ${out.slice(0, 300)}`); else state.errors.delete(k);
  if (state.errors.size > 8) state.errors.delete(state.errors.keys().next().value);
}

// ย่อบทสนทนาเมื่อยาวเกิน: ให้โมเดลสรุปงานส่วนเก่า แล้วเก็บ system + สรุป + สถานะงานที่บังคับคง (todo / ไฟล์ที่แก้ / error ค้าง) + 4 รอบล่าสุดเต็มข้อความ
async function compact({ post, model, messages, onEvent, state = null }) {
  const sys = messages[0]?.role === 'system' ? messages[0] : null, body = messages.slice(sys ? 1 : 0);
  const asst = body.map((m, i) => m.role === 'assistant' ? i : -1).filter(i => i >= 0);
  let start = asst.length >= 4 ? asst[asst.length - 4] : Math.max(0, body.length - 8);
  if (start === 0) start = Math.max(1, body.length - 8); // ต้องมีส่วนเก่าให้ย่ออย่างน้อย 1 ข้อความ
  let keep = body.slice(start); while (keep.length && keep[0].role === 'tool') keep = keep.slice(1);
  const old = body.slice(0, body.length - keep.length); if (!old.length) return;
  const text = old.map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.tool_calls ?? '')}`.slice(0, 4000)).join('\n').slice(-200000);
  onEvent({ type: 'info', text: 'บทสนทนายาวแล้ว กำลังย่อส่วนเก่า…' });
  const r = await post({ model, stream: false, max_tokens: 2000, messages: [{ role: 'system', content: 'Summarize this agent work log so the agent can continue: the user goal, files read and changed (with paths), commands run and their results, decisions, and what is left to do. Bullet points, at most 400 words, same language as the user.' }, { role: 'user', content: text }] });
  const d = await r.json().catch(() => ({})), sum = d.choices?.[0]?.message?.content;
  if (!r.ok || !sum) return; // ย่อไม่สำเร็จ: ทำต่อแบบเดิม
  const s = state ? snapshot(state) : null;
  const facts = s ? [s.todos?.length ? 'Current todo list:\n' + s.todos.map(t => `- [${t.status}] ${t.content}`).join('\n') : '', s.changed.length ? 'Files already changed in this task: ' + s.changed.join(', ') : '', s.errors.length ? 'Unresolved errors:\n' + s.errors.map(e => '- ' + e).join('\n') : ''].filter(Boolean).join('\n\n') : '';
  messages.splice(0, messages.length, ...(sys ? [sys] : []), { role: 'user', content: '[สรุปงานก่อนหน้า]\n' + sum + (facts ? '\n\n[สถานะงานที่ต้องคงไว้]\n' + facts : '') }, { role: 'assistant', content: 'รับทราบ ทำงานต่อจากสรุปนี้' }, ...keep);
}

// อ่าน SSE แบบ OpenAI: ต่อข้อความและ tool_calls ที่มาเป็นชิ้น ๆ (ชิ้นแรกมี id/name ชิ้นต่อไปมีแต่ arguments) · onFirst = ได้ token/เครื่องมือแรก (วัด TTFT)
async function readStream(r, onEvent, onFirst = () => {}) {
  const out = { content: '', tool_calls: [] }, dec = new TextDecoder(); let buf = '', first = false;
  const hit = () => { if (!first) { first = true; onFirst(); } };
  const take = line => {
    if (!line.startsWith('data:')) return; const data = line.slice(5).trim(); if (!data || data === '[DONE]') return;
    let e; try { e = JSON.parse(data); } catch { return; }
    if (e.error) throw new Error(e.error.message_th || e.error.message || 'error');
    if (e.usage) onEvent({ type: 'usage', usage: e.usage });
    const d = e.choices?.[0]?.delta || {};
    if (typeof d.content === 'string' && d.content) { hit(); out.content += d.content; onEvent({ type: 'delta', text: d.content }); }
    if (typeof d.reasoning_content === 'string' && d.reasoning_content) { hit(); onEvent({ type: 'think', text: d.reasoning_content }); }
    for (const tc of d.tool_calls || []) {
      hit(); const i = tc.index ?? out.tool_calls.length, c = out.tool_calls[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (tc.id) c.id = tc.id; if (tc.function?.name) c.function.name += tc.function.name; if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
    }
  };
  for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { take(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } }
  buf += dec.decode(); take(buf.trim()); // บรรทัดสุดท้ายที่ไม่มี \n ปิดท้าย (usage / stop) ไม่หล่นหาย
  out.tool_calls = out.tool_calls.filter(Boolean).map(c => ({ ...c, id: c.id || 'call_' + Math.random().toString(36).slice(2, 10) }));
  return out;
}

module.exports = { runAgent, readStream, compact, repairHistory, validateArgs, describeParams, maskSecrets, retryAfterMs, backoffMs, TOOL_OUT_MAX, SPILL_AT, READ_TOOLS };
