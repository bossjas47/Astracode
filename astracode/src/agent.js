// Agent เบื้องหลัง: ทำงานแก้โค้ดบนเซิร์ฟเวอร์ทั้งชุดโดยผู้ใช้ไม่ต้องเปิดหน้าค้างไว้ (รันใน Durable Object ของ ChatRun)
// วนรอบ: ให้โมเดลคิด → อ่านไฟล์ที่ขอ (READ/GREP/LIST) → เขียนไฟล์ที่แก้ลงโปรเจกต์ → ส่งผลกลับให้โมเดล จนไม่มีอะไรต้องทำ
// ข้อจำกัด: เซิร์ฟเวอร์รันโค้ดและจับภาพหน้าจอไม่ได้ Agent จึงตรวจงานด้วยการอ่านไฟล์กลับ ผู้ใช้ควรเปิดดูผลเองตอนจบ
import { DAY, SYSTEM_CODE, allowedModels, ctxMax, err, esc, fitContext, json, limited, planOf, touchWindows, usageStatus } from './core.js';
import { callModel, doingOf, familyHint, imagePrompt, logUsage, runTools, toolReqs } from './ai.js';
import { b64 } from './projects.js';
import { event, getSetting, getSettings, mail, mailBox, notify, siteUrl } from './billing.js';
import { FILE_LIMIT, FILES_PER_PROJECT, PATH_RE, PROJECT_LIMIT, snapshot } from './projects.js';
import { changesOf, problemOf, syntaxWarning } from './edits.js';

export const AGENT_MAX_ROUNDS = 20, AGENT_MAX_IN = 1.5e6, AGENT_MAX_MS = 12 * 60e3;
const AGENT_NOTE = `You are running as an unattended background agent on the server. The user is not watching and cannot answer questions, so never ask: choose sensible defaults and state them in your summary.
You cannot run code, open a browser or see the page, so RUN lines are ignored. Verify your work by re-reading the files you changed.
Work in as few rounds as you can: READ everything you need in one reply, then write all the file changes together. When the task is complete, reply with a short summary (what you changed, what the user should test, any assumption) and NO READ/GREP/LIST lines and no file blocks.`;

// สร้างรูปด้วยตัวสร้างรูปของเว็บ (ตั้งค่าในหลังบ้าน) แล้วเก็บเป็นไฟล์รูป (data URL) ในโปรเจกต์เลย ไม่ต้องมีเบราว์เซอร์
// ขอขนาด 512 + JPEG ให้ไฟล์เล็กพอ (ฝั่งเซิร์ฟเวอร์ย่อรูปเองไม่ได้) · ถ้ายังใหญ่เกินไฟล์โปรเจกต์ → แจ้งโมเดลให้ใช้ CSS/SVG แทน
const IMG_LINE = /^[ \t]*IMAGE[ \t]+(.+?)[ \t]*(?:->|→)[ \t]*(\S+)[ \t]*$/gm;
export const imagesOf = text => [...String(text || '').replace(/```[\s\S]*?```/g, '').matchAll(IMG_LINE)].map(m => {
  let path = m[2].replace(/^[`'"]|[`'",.]+$/g, '').replace(/^\/+/, '').replace(/[^\w./-]/g, '_').replace(/\.\./g, '_');
  if (!path.includes('/')) path = 'images/' + path;
  return { prompt: m[1].trim().slice(0, 1500), path: path.replace(/\.\w+$/, '') + '.jpg' };
}).slice(0, 2);
async function makeImages(env, u, plan, pid, list) {
  const s = await getSettings(env, ['image_enabled', 'image_base_url', 'image_model', 'image_key_name', 'image_cost']); let text = '[ผลการสร้างรูป]';
  for (const it of list) {
    if (s.image_enabled !== '1' || !env[s.image_key_name]) { text += `\n\nสร้าง ${it.path} ไม่ได้: ระบบสร้างรูปยังไม่เปิดใช้ ให้ใช้ CSS หรือ SVG แทน`; continue; }
    const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) { text += `\n\nสร้าง ${it.path} ไม่ได้: ลิมิตเต็ม`; continue; }
    if (await limited(env, 'img:' + u.id, 10, 3600e3)) { text += `\n\nสร้าง ${it.path} ไม่ได้: สร้างรูปได้ชั่วโมงละ 10 รูป ใช้ CSS หรือ SVG แทน`; continue; }
    try {
      const go = extra => fetch(s.image_base_url.replace(/\/$/, '') + '/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env[s.image_key_name] }, body: JSON.stringify({ model: s.image_model, prompt: it.prompt, n: 1, size: '512x512', ...extra }), signal: AbortSignal.timeout(90000) });
      let r = await go({ output_format: 'jpeg', output_compression: 70 }); if (r.status === 400) r = await go({}); // ผู้ให้บริการบางรายไม่รับพารามิเตอร์ข้างบน
      const d = await r.json().catch(() => ({})); if (!r.ok) { await event(env, 'error', null, 'agent image: ' + (d.error?.message || r.status)); throw new Error('ผู้ให้บริการสร้างรูปตอบ ' + r.status); }
      const item = d.data?.[0]; let data;
      if (item?.b64_json) data = `data:${item.b64_json.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'};base64,` + item.b64_json;
      else if (item?.url) { const bytes = new Uint8Array(await (await fetch(item.url, { signal: AbortSignal.timeout(30000) })).arrayBuffer()); data = 'data:image/jpeg;base64,' + b64(bytes); }
      else throw new Error('ไม่ได้รูปกลับมา');
      if (data.length > FILE_LIMIT) throw new Error(`รูปใหญ่เกิน ${Math.round(FILE_LIMIT / 1000)}KB (ได้ ${Math.round(data.length / 1000)}KB)`);
      const wr = await applyChanges(env, pid, [{ path: it.path, content: data }], true); if (wr.problems.length) throw new Error(wr.problems[0]);
      const now = Date.now(); await touchWindows(env, u.id, now, plan);
      await env.DB.prepare('INSERT INTO usage (user_id,model_id,tokens_in,tokens_out,tokens_cache,units,cost,created_at) VALUES (?,0,0,0,0,?,?,?)').bind(u.id, Math.max(+s.image_cost || 0, 1e-9), +s.image_cost || 0, now).run();
      text += `\n\nสร้างแล้ว: ${it.path} (~${Math.round(data.length / 1365)}KB) ใช้ใน HTML ด้วย <img src="${it.path}"> หรือใน CSS ด้วย url(${it.path})`;
    } catch (x) { text += `\n\nสร้าง ${it.path} ไม่สำเร็จ: ${String(x.message).slice(0, 120)} (ใช้ CSS หรือ SVG แทนได้)`; }
  }
  return text + '\n\nใส่รูปลงในโค้ดตามที่ต้องการ';
}

export async function ensureAgentTable(env) {
  if (agentReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, project_id INTEGER NOT NULL, model_id INTEGER NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, rounds INTEGER NOT NULL DEFAULT 0, log TEXT NOT NULL DEFAULT \'\', summary TEXT, changed TEXT, chat_id INTEGER, created_at INTEGER NOT NULL, finished_at INTEGER)').run();
  // ทีม Agent: role = lead (หัวหน้าวางแผน) / worker (ลูกทีม) / review (ผู้ตรวจรวม) · scope = ไฟล์ที่ลูกทีมแก้ได้ (JSON) · started_at = เริ่มรันจริง (ใช้กับตัวเก็บงานค้าง)
  for (const c of ['parent_id INTEGER', 'role TEXT', 'scope TEXT', 'started_at INTEGER', 'cost REAL']) try { await env.DB.prepare('ALTER TABLE agent_jobs ADD COLUMN ' + c).run(); } catch { /* มีแล้ว */ }
  agentReady = true;
}
let agentReady = false;
const setJob = (env, id, f) => { const ks = Object.keys(f); return env.DB.prepare(`UPDATE agent_jobs SET ${ks.map(k => k + '=?').join(',')} WHERE id=?`).bind(...ks.map(k => f[k]), id).run(); };

// เขียนผลลง project_files (เก็บเวอร์ชันเก่าไว้ย้อนได้) · คืน { applied: [path], problems: [ข้อความ] }
async function applyChanges(env, pid, changes, raw = false) {
  const DB = env.DB, files = (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(pid).all()).results, cur = new Map(files.map(f => [f.path, f.content]));
  const applied = [], problems = [], warnings = [], writes = [], dels = [];
  for (const c of changes) {
    if (!PATH_RE.test(c.path)) { problems.push(`${c.path}: ชื่อไฟล์ไม่ถูกต้อง`); continue; }
    if (c.error) { problems.push(`${c.path}: ${c.error}`); continue; }
    if (c.del) { if (cur.has(c.path)) { dels.push(c.path); applied.push(c.path + ' (ลบ)'); } continue; }
    if (c.content.length > FILE_LIMIT) { problems.push(`${c.path}: ไฟล์ใหญ่เกิน ${FILE_LIMIT / 1000}KB`); continue; }
    const p = raw ? '' : problemOf(c.path, c.content, cur.get(c.path)); if (p) { problems.push(`${c.path}: ${p}`); continue; }
    if (cur.get(c.path) === c.content) continue;
    writes.push({ path: c.path, content: c.content }); applied.push(c.path);
    const w = raw ? '' : syntaxWarning(c.path, c.content); if (w) warnings.push(`${c.path}: ${w}`);
  }
  const sizes = new Map(cur); for (const d of dels) sizes.delete(d); for (const w of writes) sizes.set(w.path, w.content);
  if (sizes.size > FILES_PER_PROJECT || [...sizes.values()].reduce((a, b) => a + b.length, 0) > PROJECT_LIMIT) return { applied: [], problems: ['โปรเจกต์ใหญ่เกินขีดจำกัด (ไฟล์เยอะหรือเกิน 5MB) ไม่ได้เขียนไฟล์รอบนี้'] };
  const now = Date.now();
  await snapshot(env, pid, [...writes, ...dels.map(path => ({ path, content: '' }))], 'agent');
  const ops = [...writes.map(w => DB.prepare('INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').bind(pid, w.path, w.content, now)), ...dels.map(p => DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(pid, p))];
  for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
  if (ops.length) await DB.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now, pid).run();
  return { applied, problems, warnings };
}

// งานที่ค้าง 'running' เกิน 20 นาที (Durable Object ถูกตัดกลางทาง) ให้ปิดเป็น failed ไม่ให้ผู้ใช้ติดคิว
export async function reapAgentJobs(env) {
  await ensureAgentTable(env);
  const now = Date.now(), gone = (await env.DB.prepare("UPDATE agent_jobs SET status='failed', summary='งานถูกตัดกลางทาง (ระบบรีสตาร์ต) ไฟล์ที่แก้แล้วยังอยู่ สั่งต่อได้', finished_at=?1 WHERE (status IN ('queued','running','stopping') AND COALESCE(started_at,created_at)<?2) OR (status IN ('waiting','team','reviewing') AND created_at<?3) RETURNING parent_id").bind(now, now - 20 * 60e3, now - 3 * 3600e3).all()).results;
  for (const pid of new Set(gone.map(g => g.parent_id).filter(Boolean))) await teamAdvance(env, pid).catch(() => {}); // ลูกทีมที่ค้างถูกปิดแล้ว ให้ทีมเดินต่อ (ตัวถัดไป/ผู้ตรวจ)
}

// ---------- ทีม Agent: หัวหน้าแบ่งงาน → ลูกทีมทำพร้อมกัน (ไฟล์ไม่ทับกัน) → ผู้ตรวจรวมผล ----------
export const TEAM_MAX = 5;
const LEAD_NOTE = `You lead a small team of coding agents working on the user's project on the server. Do NOT write code yourself. Split the task into 1-${TEAM_MAX} independent sub-tasks that cheaper agents can do in parallel.
You may first look at files with READ/GREP/LIST lines (then stop your reply). When ready, reply with ONLY one JSON object, no prose:
{"tasks":[{"title":"short title","prompt":"detailed instructions for this sub-task: what to build, which existing names/ids/classes to use, how it connects to the other parts","files":["paths this sub-task may create or change"]}]}
Rules: each file belongs to at most one sub-task when possible (sub-tasks that share a file run one after another); every sub-task lists at least one file; keep sub-tasks small and concrete; write prompts in the user's language.`;
const REVIEW_NOTE = 'You are the reviewer of a team of agents. READ the changed files, check that the parts work together (links, imports, element ids, CSS classes, function names, missing pieces) and fix real problems directly. Do not rewrite working code. Finish with a short summary for the user in their language: what the team built, what you fixed, what the user should test.';
export const parsePlan = text => { // แผนของหัวหน้า: ดึง JSON ก้อนแรกที่มี tasks แล้วตรวจรูปแบบ
  const src = String(text || ''), fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(src), raw = fence ? fence[1] : src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  let d; try { d = JSON.parse(raw); } catch { return null; }
  const tasks = (Array.isArray(d?.tasks) ? d.tasks : []).slice(0, TEAM_MAX).map(t => ({ title: String(t?.title || '').trim().slice(0, 80), prompt: String(t?.prompt || '').trim().slice(0, 4000), files: [...new Set((Array.isArray(t?.files) ? t.files : []).map(f => String(f).trim().replace(/^\.?\//, '')).filter(f => PATH_RE.test(f)))].slice(0, 15) }))
    .filter(t => t.prompt && t.files.length);
  return tasks.length ? tasks : null;
};
const launch = async (env, id) => {
  if (env.CHATRUN) await env.CHATRUN.get(env.CHATRUN.idFromName('agent:' + id)).fetch('https://run/start', { method: 'POST', body: JSON.stringify({ agent_id: id }) }); // แต่ละตัวมี Durable Object ของตัวเอง = ทำงานพร้อมกันจริง
  else await runAgent(env, id); // ไม่มี Durable Object (ทดสอบ): ทำในคำขอนี้
};
// ให้ทีมเดินต่อ: เริ่มลูกทีมที่ไฟล์ไม่ชนกับตัวที่กำลังทำ (ตามลำดับ ตัวก่อนหน้าที่รออยู่ก็กันไฟล์ไว้) · หมดแล้วเริ่มผู้ตรวจครั้งเดียว
export async function teamAdvance(env, leadId) {
  const DB = env.DB, lead = await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(leadId).first(); if (!lead) return;
  const kids = (await DB.prepare('SELECT id,status,scope,role FROM agent_jobs WHERE parent_id=? ORDER BY id').bind(leadId).all()).results;
  if (lead.status !== 'team') { if (!['reviewing'].includes(lead.status)) await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=? WHERE parent_id=? AND status='waiting'").bind(Date.now(), leadId).run(); return; }
  const files = k => { try { return JSON.parse(k.scope || '[]'); } catch { return []; } };
  const active = kids.filter(k => ['queued', 'running', 'stopping'].includes(k.status)), blocked = new Set(active.flatMap(files)), start = [];
  for (const w of kids.filter(k => k.status === 'waiting')) { const fs = files(w); if (!fs.some(f => blocked.has(f))) start.push(w); fs.forEach(f => blocked.add(f)); }
  const go = [];
  for (const w of start) if ((await DB.prepare("UPDATE agent_jobs SET status='queued', started_at=? WHERE id=? AND status='waiting'").bind(Date.now(), w.id).run()).meta.changes) go.push(w.id); // จองแบบ atomic: สองตัวจบพร้อมกันก็เริ่มงานเดียวกันซ้ำไม่ได้
  if (!go.length && !active.length && !kids.some(k => k.status === 'waiting') && (await DB.prepare("UPDATE agent_jobs SET status='reviewing' WHERE id=? AND status='team'").bind(leadId).run()).meta.changes) {
    const res = kids.filter(k => k.role === 'worker'), rows = (await DB.prepare(`SELECT prompt,status,summary,changed FROM agent_jobs WHERE parent_id=? AND role='worker' ORDER BY id`).bind(leadId).all()).results;
    const changed = [...new Set(rows.flatMap(r => { try { return JSON.parse(r.changed || '[]'); } catch { return []; } }))];
    const prompt = `[งานของผู้ใช้]\n${lead.prompt}\n\n[ผลของลูกทีม ${res.length} ตัว]\n${rows.map((r, i) => `${i + 1}. ${r.prompt.split('\n')[0]} → ${r.status}: ${(r.summary || '').slice(0, 600)}`).join('\n')}\n\n[ไฟล์ที่ถูกแก้]\n${changed.join('\n') || '(ไม่มี)'}\n\nตรวจว่าทุกส่วนทำงานร่วมกันได้และครบตามงานของผู้ใช้ แก้เฉพาะที่ผิดจริง แล้วสรุปให้ผู้ใช้`;
    const rv = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,parent_id,role,started_at) VALUES (?,?,?,?,'queued',?,?,'review',?) RETURNING id").bind(lead.user_id, lead.project_id, lead.model_id, prompt, Date.now(), leadId, Date.now()).first();
    go.push(rv.id);
  }
  await Promise.all(go.map(id => launch(env, id)));
}
// เพดานลิมิตของทั้งทีม (ตั้ง team_budget_pct ในหลังบ้าน ค่าเริ่มต้น 30% ของลิมิตสัปดาห์) · shortcut: นับการใช้ทั้งหมดของผู้ใช้ตั้งแต่เริ่มทีม รวมแชตที่ใช้พร้อมกันด้วย
async function teamOver(env, u, plan, lead) {
  const pct = +(await getSetting(env, 'team_budget_pct')) || 30; if (!(plan?.limit_week > 0)) return false;
  const used = (await env.DB.prepare('SELECT COALESCE(SUM(units),0) x FROM usage WHERE user_id=? AND created_at>=?').bind(u.id, lead.created_at).first()).x;
  return used >= plan.limit_week * pct / 100;
}
// หัวหน้า: อ่านโปรเจกต์ (ไม่เกิน 3 รอบ) แล้วตอบแผน JSON → สร้างลูกทีม → เริ่มทีม
async function runLead(env, J, u, plan, m) {
  const DB = env.DB, files = (await DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=? ORDER BY path').bind(J.project_id).all()).results;
  let msgs = [{ role: 'user', content: `${J.prompt}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${files.map(f => `${f.path} (${f.n})`).join('\n').slice(0, 15000)}` }], tasks = null, note = '';
  for (let round = 1; round <= 4 && !tasks; round++) {
    if ((await DB.prepare('SELECT status FROM agent_jobs WHERE id=?').bind(J.id).first())?.status === 'stopping') return { status: 'stopped', note: 'หยุดก่อนแบ่งงาน' };
    let part = '', usage = null;
    try { for await (const e of callModel(env, m, fitContext(LEAD_NOTE, msgs, ctxMax(m)).msgs, { effort: null, system: SYSTEM_CODE + '\n\n' + LEAD_NOTE, userId: u.id, signal: AbortSignal.timeout(150e3) })) { if (e.t) part += e.t; if (e.usage) usage = e.usage; } }
    catch (x) { note = 'หัวหน้าตอบไม่ได้: ' + String(x.message).slice(0, 80); await new Promise(r => setTimeout(r, 3000)); continue; }
    if (usage) { await touchWindows(env, u.id, Date.now(), plan); await logUsage(env, u.id, m, usage, { units: true, plan, job: J.id }); }
    await setJob(env, J.id, { rounds: round });
    tasks = parsePlan(part); if (tasks) break;
    const reqs = toolReqs(part);
    msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: reqs.length && round < 4 ? await runTools(env, J.project_id, reqs) : 'ตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น {"tasks":[...]} ทุกงานต้องมี files อย่างน้อย 1 ไฟล์' }];
    note = 'หัวหน้าส่งแผนไม่ถูกรูปแบบ';
  }
  if (!tasks) return { status: 'failed', note: note || 'หัวหน้าแบ่งงานไม่สำเร็จ' };
  const wm = await workerModel(env, plan), goal = J.prompt.slice(0, 1500), now = Date.now();
  await DB.batch(tasks.map(t => DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,parent_id,role,scope) VALUES (?,?,?,?,'waiting',?,?,'worker',?)")
    .bind(J.user_id, J.project_id, (wm || m).id, `${t.title || t.prompt.slice(0, 60)}\n\n${t.prompt}\n\n[งานรวมของทีม (ส่วนอื่นมีลูกทีมคนอื่นทำ)]\n${goal}\n\n[ขอบเขต] แก้หรือสร้างได้เฉพาะไฟล์: ${t.files.join(', ')} · อ่านไฟล์อื่นได้แต่ห้ามแก้`, now, J.id, JSON.stringify(t.files))));
  await setJob(env, J.id, { status: 'team', log: `แบ่งงาน ${tasks.length} ชิ้น (ลูกทีมใช้ ${(wm || m).name})\n` + tasks.map((t, i) => `${i + 1}. ${t.title} → ${t.files.join(', ')}`).join('\n') });
  await teamAdvance(env, J.id);
  return null;
}
// โมเดลลูกทีม: ตั้งใน team_worker_model (id) ไม่งั้นใช้ DeepSeek 4.1 Flash ถ้าแพลนมี สุดท้ายใช้ตัวที่ตัวคูณต่ำสุด
export async function workerModel(env, plan) {
  const ms = (await allowedModels(env, plan.id)).filter(x => !['image', 'embedding'].includes(x.provider)), set = +(await getSetting(env, 'team_worker_model'));
  const pick = ms.find(x => x.id === set) || ms.find(x => /deepseek.*4\.1.*flash/i.test(x.name)) || [...ms].sort((a, b) => a.multiplier - b.multiplier)[0];
  return pick && env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(pick.id).first();
}
export async function runAgent(env, jobId, st = { gone: false }) {
  const DB = env.DB, J = await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(jobId).first(); if (!J || J.status !== 'queued') return;
  await setJob(env, jobId, { status: 'running', started_at: Date.now() });
  const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(J.user_id).first(), plan = await planOf(env, u);
  const proj = await DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(J.project_id, J.user_id).first();
  const m = await DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(J.model_id).first();
  const log = [], changedAll = new Set(); let usageNote = '', final = '', status = 'done', cumIn = 0, round = 0; const t0 = Date.now(), transcript = [];
  const lead = J.parent_id ? await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(J.parent_id).first() : null, scope = J.scope ? JSON.parse(J.scope) : null;
  const finish = async () => {
    if (J.role === 'worker') { // ลูกทีม: ไม่สร้างแชต ไม่ส่งอีเมล (ผู้ตรวจสรุปรวมทีเดียว) แล้วให้ทีมเดินต่อ
      await setJob(env, jobId, { status, rounds: round, log: log.join('\n').slice(0, 8000), summary: (final || usageNote).slice(0, 4000), changed: JSON.stringify([...changedAll]), finished_at: Date.now() });
      return teamAdvance(env, J.parent_id);
    }
    const chat = await DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id) VALUES (?,?,?,?) RETURNING id').bind(J.user_id, ('🤖 ' + J.prompt).slice(0, 40), Date.now(), J.project_id).first();
    const body = (final || '(Agent ไม่ได้ส่งสรุป)') + (changedAll.size ? `\n\n**ไฟล์ที่เปลี่ยน:** ${[...changedAll].join(', ')}` : '') + (usageNote ? `\n\n_${usageNote}_` : '') + `\n\n<details><summary>ขั้นตอน</summary>\n\n${log.join('\n')}\n\n</details>`;
    await DB.batch([DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'user', J.prompt, J.model_id, Date.now()), DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'assistant', body, J.model_id, Date.now() + 1)]);
    await setJob(env, jobId, { status, rounds: round, log: log.join('\n').slice(0, 8000), summary: (final || usageNote).slice(0, 4000), changed: JSON.stringify([...changedAll]), chat_id: chat.id, finished_at: Date.now() });
    if (J.role === 'review' && lead) { // ผู้ตรวจจบ = ทั้งทีมจบ: สรุปและไฟล์ที่เปลี่ยนทั้งหมดไปอยู่ที่งานหัวหน้า
      const all = (await DB.prepare("SELECT changed FROM agent_jobs WHERE parent_id=?").bind(lead.id).all()).results.flatMap(r => { try { return JSON.parse(r.changed || '[]'); } catch { return []; } });
      [...all].forEach(p => changedAll.add(p));
      await DB.prepare("UPDATE agent_jobs SET status=?, summary=?, changed=?, chat_id=?, finished_at=? WHERE id=? AND status='reviewing'").bind(status === 'done' ? 'done' : status, (final || usageNote).slice(0, 4000), JSON.stringify([...changedAll]), chat.id, Date.now(), lead.id).run();
    }
    if (status === 'failed') { // Agent ล้มติดกัน 3 งานของผู้ใช้เดียวกัน: เตือนแอดมิน (น่าจะมีปัญหาคีย์/โมเดล)
      const recent = (await DB.prepare("SELECT status FROM agent_jobs WHERE user_id=? AND id<=? ORDER BY id DESC LIMIT 3").bind(J.user_id, jobId).all()).results;
      if (recent.length === 3 && recent.every(x => x.status === 'failed')) await notify(env, `🤖 Agent ล้มติดกัน 3 งาน (ผู้ใช้ ${u.email}): ${(usageNote || final || '').slice(0, 150)}`).catch(() => {});
    }
    const label = { done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิตเต็ม', failed: 'ไม่สำเร็จ', timeout: 'หยุดเพราะใช้เวลานานเกินกำหนด' }[status] || status;
    await mail(env, u.email, `AstraCode Agent ${label}: ${J.prompt.slice(0, 50)}`, mailBox(`Agent ${label}`, esc((final || usageNote || '').slice(0, 2500)).replace(/\n/g, '<br>') + (changedAll.size ? `<br><br>ไฟล์ที่เปลี่ยน: ${esc([...changedAll].join(', '))}` : ''), 'เปิดโปรเจกต์', `${siteUrl(env)}/code?p=${J.project_id}`)).catch(() => {});
  };
  try {
    if (!proj || !m || !(plan?.price > 0)) { status = 'failed'; usageNote = 'ไม่พบโปรเจกต์/โมเดล หรือแพลนไม่รองรับ'; return await finish(); }
    if (J.role === 'lead') { const r = await runLead(env, J, u, plan, m); if (!r) return; status = r.status; usageNote = r.note; return await finish(); } // แบ่งงานสำเร็จ: ทีมทำต่อ (ผู้ตรวจสรุปตอนจบ)
    const files = () => DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=? ORDER BY path').bind(J.project_id).all().then(r => r.results);
    const astra = (await DB.prepare("SELECT content FROM project_files WHERE project_id=? AND path IN ('ASTRA.md','AGENTS.md') ORDER BY path LIMIT 1").bind(J.project_id).first())?.content?.slice(0, 3000) || '';
    const system = SYSTEM_CODE + '\n\n' + (m.code_prompt?.trim() || familyHint(m)) + (proj.instructions ? '\n\nProject-specific instructions (follow them):\n' + proj.instructions.slice(0, 3000) : '') + (astra ? '\n\nFrom the project file ASTRA.md:\n' + astra : '') + (await imagePrompt(env, true)) + '\n\n' + AGENT_NOTE;
    let msgs = [{ role: 'user', content: `${J.prompt}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${(await files()).map(f => `${f.path} (${f.n})`).join('\n').slice(0, 15000)}` }];
    for (; round < AGENT_MAX_ROUNDS; ) {
      if ((await DB.prepare('SELECT status FROM agent_jobs WHERE id=?').bind(jobId).first())?.status === 'stopping' || st.gone) { status = 'stopped'; break; }
      if (Date.now() - t0 > AGENT_MAX_MS) { status = 'timeout'; usageNote = 'ใช้เวลานานเกินกำหนด (12 นาที) หยุดไว้ก่อน'; break; }
      const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) { status = 'limit'; usageNote = 'ลิมิตของแพลนเต็ม หยุดไว้ก่อน (ไฟล์ที่แก้แล้วยังอยู่)'; break; }
      if (cumIn >= AGENT_MAX_IN) { status = 'limit'; usageNote = 'ใช้ token ครบเพดานต่อคำสั่งแล้ว (1.5 ล้าน)'; break; }
      if (lead && await teamOver(env, u, plan, lead)) { status = 'limit'; usageNote = 'ทีมใช้ลิมิตครบเพดานต่องานแล้ว หยุดไว้ก่อน (ไฟล์ที่แก้แล้วยังอยู่)'; break; }
      round++; await setJob(env, jobId, { rounds: round });
      msgs = fitContext(system, msgs, ctxMax(m)).msgs;
      let part = '', usage = null; const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 150e3);
      try { for await (const e of callModel(env, m, msgs, { effort: null, system, userId: u.id, signal: ac.signal })) { if (e.t) part += e.t; if (e.usage) usage = e.usage; } }
      catch (x) { clearTimeout(timer); log.push(`รอบ ${round}: โมเดลตอบไม่ได้ (${String(x.message).slice(0, 80)})`); if (lead && !part) await new Promise(r => setTimeout(r, 4000 * round)); /* ทีมยิงพร้อมกันหลายตัว: รอแล้วลองใหม่ (มักโดน rate limit) */ if (round >= 2 && !part) { status = 'failed'; usageNote = 'โมเดลตอบไม่ได้ตอนนี้'; break; } if (!part) continue; }
      clearTimeout(timer);
      if (usage) { await touchWindows(env, u.id, Date.now(), plan); await logUsage(env, u.id, m, usage, { units: true, plan, job: jobId }); cumIn += usage.fresh + usage.read + usage.write; }
      const reqs = toolReqs(part.replace(/```[\s\S]*?```/g, '')), imgs = imagesOf(part);
      const cur = new Map((await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(J.project_id).all()).results.map(f => [f.path, f.content]));
      const all = changesOf(part, p => cur.has(p) ? cur.get(p) : null), ch = scope ? all.filter(c => scope.includes(c.path)) : all, out = all.filter(c => !ch.includes(c)); // ลูกทีมแก้ได้เฉพาะไฟล์ในขอบเขต
      const res = ch.length ? await applyChanges(env, J.project_id, ch) : { applied: [], problems: [], warnings: [] };
      if (out.length) res.problems.push(...out.map(c => `${c.path}: อยู่นอกขอบเขตงานนี้ ไม่ได้เขียน (แก้ได้เฉพาะ ${scope.join(', ')})`));
      res.applied.forEach(p => changedAll.add(p.replace(/ \(ลบ\)$/, '')));
      log.push(`รอบ ${round}: ${[reqs.length ? doingOf(reqs) : '', imgs.length ? 'สร้างรูป ' + imgs.map(i => i.path).join(', ') : '', res.applied.length ? 'แก้ ' + res.applied.join(', ') : '', res.problems.length ? `มีปัญหา ${res.problems.length} จุด` : '', res.warnings?.length ? `เตือน syntax ${res.warnings.length} ไฟล์` : ''].filter(Boolean).join(' · ') || 'สรุปผล'}`);
      transcript.push(part);
      // รอบที่ไม่ได้ขออ่านและไม่ได้เขียนอะไร = สรุปผลแล้ว (รอบที่เพิ่งเขียนไฟล์ ให้อีกรอบเพื่อตรวจทาน/สรุป)
      if (!reqs.length && !imgs.length && !res.problems.length && !res.applied.length) { final = part.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim() || part.trim(); break; }
      const imgRes = imgs.length ? await makeImages(env, u, plan, J.project_id, imgs) : '';
      imgs.forEach(i => { if (imgRes.includes('สร้างแล้ว: ' + i.path)) changedAll.add(i.path); });
      const tool = reqs.length ? await runTools(env, J.project_id, reqs) : '';
      msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: [tool, imgRes, res.problems.length ? `[ผลการเขียนไฟล์]\nมีบางไฟล์เขียนไม่ได้ แก้แล้วส่งใหม่ (ส่วนที่เหลือถูกเขียนแล้ว):\n- ${res.problems.join('\n- ')}` : '', res.warnings?.length ? `[ตัวตรวจวงเล็บอัตโนมัติ] ไฟล์ที่เขียนไปน่าจะมี syntax ผิด (ตรวจแบบเดา อาจเตือนผิดได้ ให้ READ ไฟล์ตรวจแล้วแก้ถ้าผิดจริง):\n- ${res.warnings.join('\n- ')}` : '', res.applied.length ? `[เขียนแล้ว] ${res.applied.join(', ')}\nตรวจทานงานด้วย READ ถ้าจำเป็น แล้วสรุปผล (ไม่ต้องส่งไฟล์ซ้ำ)` : ''].filter(Boolean).join('\n\n') }];
    }
    if (status === 'done' && !final) { final = 'ครบ ' + AGENT_MAX_ROUNDS + ' รอบแล้ว Agent หยุดไว้ก่อน (งานอาจยังไม่ครบ ตรวจไฟล์และสั่งต่อได้)'; }
  } catch (x) { console.log('agent', x.stack); status = 'failed'; usageNote = 'เกิดข้อผิดพลาด: ' + String(x.message).slice(0, 120); }
  await finish();
}

// ---------- API ----------
export async function agentApi(req, env, u, path) {
  await ensureAgentTable(env); const DB = env.DB, M = req.method;
  if (path === '/api/agent' && M === 'GET') {
    const pj = new URL(req.url).searchParams.get('project');
    const list = (await DB.prepare(`SELECT id,project_id,prompt,status,rounds,summary,changed,chat_id,created_at,finished_at,role FROM agent_jobs WHERE user_id=? AND parent_id IS NULL${pj ? ' AND project_id=?' : ''} ORDER BY id DESC LIMIT 10`).bind(...(pj ? [u.id, +pj] : [u.id])).all()).results;
    const leads = list.filter(j => j.role === 'lead').map(j => j.id);
    if (leads.length) { const kids = (await DB.prepare(`SELECT id,parent_id,role,prompt,status,rounds,changed,scope FROM agent_jobs WHERE parent_id IN (${leads.map(() => '?')}) ORDER BY id`).bind(...leads).all()).results; list.forEach(j => { if (j.role === 'lead') j.team = kids.filter(k => k.parent_id === j.id).map(({ prompt, ...k }) => ({ ...k, title: prompt.split('\n')[0].slice(0, 80) })); }); }
    return json(list);
  }
  if (path === '/api/agent' && M === 'POST') {
    const plan = await planOf(env, u); if (!(plan?.price > 0)) return err('Agent เบื้องหลังใช้ได้กับแพลนที่ชำระเงิน', 403);
    const b = await req.json(), prompt = String(b.prompt || '').trim().slice(0, 4000);
    if (prompt.length < 10) return err('อธิบายงานให้ละเอียดขึ้นอีกหน่อย (อย่างน้อย 10 ตัวอักษร)');
    if (!await DB.prepare('SELECT 1 FROM projects WHERE id=? AND user_id=?').bind(+b.project_id, u.id).first()) return err('ไม่พบโปรเจกต์', 404);
    const model = (await allowedModels(env, plan.id)).find(x => x.id === +b.model_id && !['image', 'embedding'].includes(x.provider)); if (!model) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
    const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) return err('ลิมิตเต็มแล้ว', 429);
    if (await DB.prepare("SELECT 1 FROM agent_jobs WHERE user_id=? AND ((status IN ('queued','running','stopping') AND COALESCE(started_at,created_at)>?) OR status IN ('waiting','team','reviewing'))").bind(u.id, Date.now() - 20 * 60e3).first()) return err('มีงาน Agent ที่กำลังทำอยู่ รอให้เสร็จหรือกดหยุดก่อน', 409);
    if (await limited(env, 'agent:' + u.id, 12, DAY)) return err('สั่ง Agent วันนี้ครบแล้ว (12 งานต่อวัน)', 429);
    const job = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,role) VALUES (?,?,?,?,'queued',?,?) RETURNING id").bind(u.id, +b.project_id, model.id, prompt, Date.now(), b.team ? 'lead' : null).first();
    await launch(env, job.id); // ทำต่อใน Durable Object แม้ผู้ใช้ปิดแอป
    return json({ id: job.id });
  }
  const r = path.match(/^\/api\/agent\/(\d+)\/stop$/);
  if (r && M === 'POST') {
    const id = +r[1], stopDo = i => env.CHATRUN?.get(env.CHATRUN.idFromName('agent:' + i)).fetch('https://run/stop', { method: 'POST' }).catch(() => {});
    if ((await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=?, summary=COALESCE(summary,'หยุดทั้งทีมแล้ว (ไฟล์ที่แก้แล้วยังอยู่)') WHERE id=? AND user_id=? AND status IN ('team','reviewing')").bind(Date.now(), id, u.id).run()).meta.changes) { // หยุดทั้งทีม
      await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=? WHERE parent_id=? AND status='waiting'").bind(Date.now(), id).run();
      const run = (await DB.prepare("UPDATE agent_jobs SET status='stopping' WHERE parent_id=? AND status IN ('queued','running') RETURNING id").bind(id).all()).results;
      await Promise.all(run.map(x => stopDo(x.id))); return json({ ok: true });
    }
    const ch = await DB.prepare("UPDATE agent_jobs SET status='stopping' WHERE id=? AND user_id=? AND status IN ('queued','running')").bind(id, u.id).run();
    if (ch.meta.changes) await stopDo(id);
    return json({ ok: !!ch.meta.changes });
  }
  return err('not found', 404);
}
