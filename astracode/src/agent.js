// Agent เบื้องหลัง: ทำงานแก้โค้ดบนเซิร์ฟเวอร์ทั้งชุดโดยผู้ใช้ไม่ต้องเปิดหน้าค้างไว้ (รันใน Durable Object ของ ChatRun)
// วนรอบ: ให้โมเดลคิด → อ่านไฟล์ที่ขอ (READ/GREP/LIST) → เขียนไฟล์ที่แก้ลงโปรเจกต์ → ส่งผลกลับให้โมเดล จนไม่มีอะไรต้องทำ
// ข้อจำกัด: เซิร์ฟเวอร์รันโค้ดและจับภาพหน้าจอไม่ได้ Agent จึงตรวจงานด้วยการอ่านไฟล์กลับ ผู้ใช้ควรเปิดดูผลเองตอนจบ
import { DAY, SYSTEM_CODE, allowedModels, ctxMax, err, esc, fitContext, flat, json, limMult, limited, planOf, touchWindows, usageStatus } from './core.js';
import { callModel, doingOf, familyHint, imagePrompt, logUsage, runTools, toolReqs, webSearch } from './ai.js';
import { b64 } from './projects.js';
import { sendPush } from './push.js';
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
  for (const c of ['parent_id INTEGER', 'role TEXT', 'scope TEXT', 'started_at INTEGER', 'cost REAL', 'effort TEXT', 'doing TEXT', 'worker_model_id INTEGER', 'tin INTEGER', 'tout INTEGER', 'ctx_peak INTEGER']) try { await env.DB.prepare('ALTER TABLE agent_jobs ADD COLUMN ' + c).run(); } catch { /* มีแล้ว */ }
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
  const now = Date.now(), gone = (await env.DB.prepare("UPDATE agent_jobs SET status='failed', summary='งานถูกตัดกลางทาง (ระบบรีสตาร์ต) ไฟล์ที่แก้แล้วยังอยู่ สั่งต่อได้', finished_at=?1 WHERE (status IN ('queued','running','stopping') AND COALESCE(started_at,created_at)<?2) OR (status IN ('waiting','team','reviewing') AND COALESCE(started_at,created_at)<?3) RETURNING parent_id").bind(now, now - 20 * 60e3, now - 3 * 3600e3).all()).results;
  const exp = (await env.DB.prepare("UPDATE agent_jobs SET status='stopped', summary='แผนไม่ได้รับการยืนยันภายใน 24 ชม. ยกเลิกแล้ว', finished_at=?1 WHERE status='plan' AND created_at<?2 RETURNING id").bind(now, now - DAY).all()).results;
  gone.push(...exp.map(x => ({ parent_id: x.id })));
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
export const launch = async (env, id) => {
  if (env.CHATRUN) await env.CHATRUN.get(env.CHATRUN.idFromName('agent:' + id)).fetch('https://run/start', { method: 'POST', body: JSON.stringify({ agent_id: id }) }); // แต่ละตัวมี Durable Object ของตัวเอง = ทำงานพร้อมกันจริง
  else await runAgent(env, id); // ไม่มี Durable Object (ทดสอบ): ทำในคำขอนี้
};
// ให้ทีมเดินต่อ: เริ่มลูกทีมที่ไฟล์ไม่ชนกับตัวที่กำลังทำ (ตามลำดับ ตัวก่อนหน้าที่รออยู่ก็กันไฟล์ไว้) · หมดแล้วเริ่มผู้ตรวจครั้งเดียว
export async function teamAdvance(env, leadId) {
  const DB = env.DB, lead = await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(leadId).first(); if (!lead) return;
  const kids = (await DB.prepare('SELECT id,status,scope,role FROM agent_jobs WHERE parent_id=? ORDER BY id').bind(leadId).all()).results;
  if (lead.status !== 'team') { if (!['reviewing'].includes(lead.status)) await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=? WHERE parent_id=? AND status IN ('waiting','planned')").bind(Date.now(), leadId).run(); return; }
  const files = k => { try { return JSON.parse(k.scope || '[]'); } catch { return []; } };
  const active = kids.filter(k => ['queued', 'running', 'stopping'].includes(k.status)), blocked = new Set(active.flatMap(files)), start = [];
  for (const w of kids.filter(k => k.status === 'waiting')) { const fs = files(w); if (!fs.some(f => blocked.has(f))) start.push(w); fs.forEach(f => blocked.add(f)); }
  const go = [];
  for (const w of start) if ((await DB.prepare("UPDATE agent_jobs SET status='queued', started_at=? WHERE id=? AND status='waiting'").bind(Date.now(), w.id).run()).meta.changes) go.push(w.id); // จองแบบ atomic: สองตัวจบพร้อมกันก็เริ่มงานเดียวกันซ้ำไม่ได้
  if (!go.length && !active.length && !kids.some(k => k.status === 'waiting') && (await DB.prepare("UPDATE agent_jobs SET status='reviewing' WHERE id=? AND status='team'").bind(leadId).run()).meta.changes) {
    const res = kids.filter(k => k.role === 'worker'), rows = (await DB.prepare(`SELECT prompt,status,summary,changed FROM agent_jobs WHERE parent_id=? AND role='worker' ORDER BY id`).bind(leadId).all()).results;
    const changed = [...new Set(rows.flatMap(r => { try { return JSON.parse(r.changed || '[]'); } catch { return []; } }))];
    const prompt = `[งานของผู้ใช้]\n${lead.prompt}\n\n[ผลของลูกทีม ${res.length} ตัว]\n${rows.map((r, i) => `${i + 1}. ${r.prompt.split('\n')[0]} → ${r.status}: ${(r.summary || '').slice(0, 600)}`).join('\n')}\n\n[ไฟล์ที่ถูกแก้]\n${changed.join('\n') || '(ไม่มี)'}\n\nตรวจว่าทุกส่วนทำงานร่วมกันได้และครบตามงานของผู้ใช้ แก้เฉพาะที่ผิดจริง แล้วสรุปให้ผู้ใช้`;
    const rv = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,parent_id,role,started_at,effort) VALUES (?,?,?,?,'queued',?,?,'review',?,?) RETURNING id").bind(lead.user_id, lead.project_id, lead.model_id, prompt, Date.now(), leadId, Date.now(), lead.effort || null).first();
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
const workerPrompt = (t, goal) => `${t.title || t.prompt.slice(0, 60)}\n\n${t.prompt}\n\n[งานรวมของทีม (ส่วนอื่นมีลูกทีมคนอื่นทำ)]\n${goal}\n\n[ขอบเขต] แก้หรือสร้างได้เฉพาะไฟล์: ${t.files.join(', ')} · อ่านไฟล์อื่นได้แต่ห้ามแก้`;
// หัวหน้า: อ่านโปรเจกต์ (ไม่เกิน 3 รอบ) แล้วตอบแผน JSON → สร้างลูกทีม → เริ่มทีม
async function runLead(env, J, u, plan, m) {
  const DB = env.DB, files = (await DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=? ORDER BY path').bind(J.project_id).all()).results;
  let msgs = [{ role: 'user', content: `${J.prompt}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${files.map(f => `${f.path} (${f.n})`).join('\n').slice(0, 15000)}` }], tasks = null, note = '';
  for (let round = 1; round <= 4 && !tasks; round++) {
    if ((await DB.prepare('SELECT status FROM agent_jobs WHERE id=?').bind(J.id).first())?.status === 'stopping') return { status: 'stopped', note: 'หยุดก่อนแบ่งงาน' };
    let part = '', usage = null; await setJob(env, J.id, { doing: round === 1 ? 'หัวหน้ากำลังอ่านโปรเจกต์' : 'หัวหน้ากำลังวางแผน' });
    try { for await (const e of callModel(env, m, fitContext(LEAD_NOTE, msgs, ctxMax(m)).msgs, { effort: J.effort || null, system: SYSTEM_CODE + '\n\n' + LEAD_NOTE, userId: u.id, signal: AbortSignal.timeout(150e3) })) { if (e.t) part += e.t; if (e.usage) usage = e.usage; } }
    catch (x) { note = 'หัวหน้าตอบไม่ได้: ' + String(x.message).slice(0, 80); await new Promise(r => setTimeout(r, 3000)); continue; }
    if (usage) { await touchWindows(env, u.id, Date.now(), plan); await logUsage(env, u.id, m, usage, { units: true, plan, job: J.id }); }
    await setJob(env, J.id, { rounds: round, doing: 'กำลังแบ่งงานให้ลูกทีม' });
    tasks = parsePlan(part); if (tasks) break;
    const reqs = toolReqs(part);
    msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: reqs.length && round < 4 ? await runTools(env, J.project_id, reqs) : 'ตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น {"tasks":[...]} ทุกงานต้องมี files อย่างน้อย 1 ไฟล์' }];
    note = 'หัวหน้าส่งแผนไม่ถูกรูปแบบ';
  }
  if (!tasks) return { status: 'failed', note: note || 'หัวหน้าแบ่งงานไม่สำเร็จ' };
  const wm = await workerModel(env, plan, J.worker_model_id), goal = J.prompt.slice(0, 1500), now = Date.now(), confirm = J.scope === 'confirm'; // scope ของงานหัวหน้า = 'confirm' → รอผู้ใช้ยืนยันแผน
  await DB.batch(tasks.map(t => DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,parent_id,role,scope,summary) VALUES (?,?,?,?,?,?,?,'worker',?,?)")
    .bind(J.user_id, J.project_id, (wm || m).id, workerPrompt(t, goal), confirm ? 'planned' : 'waiting', now, J.id, JSON.stringify(t.files), confirm ? JSON.stringify({ title: t.title, prompt: t.prompt }) : null)));
  await setJob(env, J.id, { status: confirm ? 'plan' : 'team', log: `แบ่งงาน ${tasks.length} ชิ้น (ลูกทีมใช้ ${(wm || m).name})\n` + tasks.map((t, i) => `${i + 1}. ${t.title} → ${t.files.join(', ')}`).join('\n') });
  if (confirm) await sendPush(env, u.id, { title: 'ทีม Agent: แผนพร้อมแล้ว', body: 'แตะเพื่อตรวจแผนและกดเริ่ม', url: '/code?p=' + J.project_id });
  if (confirm) { await mail(env, u.email, 'AstraCode ทีม Agent: แผนพร้อมแล้ว รอคุณยืนยัน', mailBox('แผนงานพร้อมแล้ว', `หัวหน้าทีมแบ่งงานเป็น ${tasks.length} ชิ้น ตรวจ แก้ หรือตัดงานย่อยได้ แล้วกด "เริ่มทีม" (แผนหมดอายุใน 24 ชม.)`, 'ดูแผน', `${siteUrl(env)}/code?p=${J.project_id}`)).catch(() => {}); return null; }
  await teamAdvance(env, J.id);
  return null;
}
// ---------- Deep research: หัวหน้าแบ่งหัวข้อ → ค้นเว็บทุกหัวข้อพร้อมกัน → ลูกทีมสรุปแต่ละหัวข้อ (พร้อมกัน) → หัวหน้าเขียนรายงานพร้อมอ้างอิง → แชตใหม่ + อีเมล ----------
const RESEARCH_PLAN = 'Split the user\'s research question into 2-5 sub-topics that together answer it. For each, write 1-2 web search queries (in the language most likely to find good sources). Reply with ONLY one JSON object: {"topics":[{"title":"short title","queries":["query 1","query 2"]}]}';
const RESEARCH_NOTES = 'You are a research assistant. From the numbered web results only, write concise factual notes for the sub-topic: key facts, numbers, dates, disagreements between sources. Cite every fact with the source number like [3]. If the results do not cover something, say so. No introduction.';
const RESEARCH_REPORT = 'Write a well-structured research report in the user\'s language from the team\'s notes: a short summary first, then sections with headings, then a short conclusion. Keep every citation number [n] exactly as in the notes; never invent sources or numbers. Point out where sources disagree or information is missing.';
async function ask(env, u, plan, m, jobId, system, content, maxTokens, effort = null) { // เรียกโมเดลครั้งเดียว (ไม่สตรีมให้ใคร) + บันทึกการใช้
  let out = '', usage = null;
  for await (const e of callModel(env, m, [{ role: 'user', content }], { effort, system, maxTokens, userId: u.id, signal: AbortSignal.timeout(150e3) })) { if (e.t) out += e.t; if (e.usage) usage = e.usage; }
  if (usage) { await touchWindows(env, u.id, Date.now(), plan); await logUsage(env, u.id, m, usage, { units: true, plan, job: jobId }); }
  return out.trim();
}
async function runResearch(env, J, u, plan, m) {
  const DB = env.DB, log = []; let status = 'done', report = '', sources = [];
  const stop = async () => (await DB.prepare('SELECT status FROM agent_jobs WHERE id=?').bind(J.id).first())?.status === 'stopping';
  const full = async () => { const l = await usageStatus(env, u, plan); return l.pct4h >= 100 || l.pctWeek >= 100 || await teamOver(env, u, plan, J); };
  try {
    if (!m || !(plan?.price > 0)) throw new Error('ไม่พบโมเดล หรือแพลนไม่รองรับ');
    let topics = null;
    try { const d = JSON.parse((s => { const f = /```(?:json)?\s*([\s\S]*?)```/i.exec(s); return f ? f[1] : s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1); })(await ask(env, u, plan, m, J.id, RESEARCH_PLAN, J.prompt, 600, J.effort))); topics = (d.topics || []).slice(0, TEAM_MAX).map(t => ({ title: String(t.title || '').slice(0, 100), queries: (Array.isArray(t.queries) ? t.queries : []).map(q => String(q).slice(0, 200)).filter(Boolean).slice(0, 2) })).filter(t => t.title && t.queries.length); } catch { /* ใช้คำถามเดิมเป็นหัวข้อเดียว */ }
    if (!topics?.length) topics = [{ title: J.prompt.slice(0, 100), queries: [J.prompt.slice(0, 200)] }];
    log.push(`แบ่ง ${topics.length} หัวข้อ: ${topics.map(t => t.title).join(' · ')}`); await setJob(env, J.id, { rounds: 1, log: log.join('\n') });
    const seen = new Map(); // url → เลขอ้างอิงรวม (หัวข้อต่างกันเจอเว็บเดียวกันใช้เลขเดียวกัน)
    const found = await Promise.all(topics.map(async t => (await Promise.all(t.queries.map(q => webSearch(env, q)))).flat()));
    const per = found.map(list => { const mine = []; for (const r of list) { if (!seen.has(r.url)) { seen.set(r.url, sources.length + 1); sources.push({ title: r.title, url: r.url, content: r.content }); } const n = seen.get(r.url); if (!mine.includes(n) && mine.length < 6) mine.push(n); } return mine; });
    if (!sources.length) throw new Error('ค้นเว็บไม่เจอข้อมูล (หรือระบบค้นเว็บใช้ไม่ได้ตอนนี้)');
    if (await stop()) { status = 'stopped'; throw new Error('หยุดแล้ว'); }
    if (await full()) { status = 'limit'; throw new Error('ลิมิตเต็ม หยุดก่อนสรุป'); }
    const wm = (await workerModel(env, plan)) || m;
    const notes = await Promise.all(topics.map(async (t, i) => { // ลูกทีมสรุปทุกหัวข้อพร้อมกัน
      const src = per[i].map(n => `[${n}] ${sources[n - 1].title} (${sources[n - 1].url})\n${String(sources[n - 1].content || '').slice(0, 2500)}`).join('\n\n');
      try { return src ? await ask(env, u, plan, wm, J.id, RESEARCH_NOTES, `คำถามหลัก: ${J.prompt}\nหัวข้อย่อย: ${t.title}\n\n[ผลค้นเว็บ]\n${src}`, 1200) : '(ไม่พบผลค้นหา)'; }
      catch (x) { await new Promise(r => setTimeout(r, 4000)); try { return await ask(env, u, plan, wm, J.id, RESEARCH_NOTES, `หัวข้อย่อย: ${t.title}\n\n[ผลค้นเว็บ]\n${src}`, 1200); } catch { return `(สรุปหัวข้อนี้ไม่สำเร็จ: ${String(x.message).slice(0, 80)})`; } }
    }));
    log.push(`ค้นได้ ${sources.length} แหล่ง · ${wm.name} สรุป ${topics.length} หัวข้อ`); await setJob(env, J.id, { rounds: 2, log: log.join('\n') });
    if (await stop()) { status = 'stopped'; throw new Error('หยุดแล้ว'); }
    if (await full()) { status = 'limit'; report = topics.map((t, i) => `## ${t.title}\n\n${notes[i]}`).join('\n\n'); throw new Error('ลิมิตเต็ม ส่งบันทึกของแต่ละหัวข้อแทนรายงาน'); }
    report = await ask(env, u, plan, m, J.id, RESEARCH_REPORT, `[คำถาม]\n${J.prompt}\n\n${topics.map((t, i) => `[บันทึกหัวข้อ: ${t.title}]\n${notes[i]}`).join('\n\n')}`, 4000, J.effort);
    log.push('เขียนรายงานแล้ว');
  } catch (x) { if (status === 'done') status = 'failed'; log.push(String(x.message).slice(0, 200)); }
  const body = (report || `ทำรายงานไม่สำเร็จ: ${log.at(-1)}`) + (sources.length ? `\n\n**แหล่งที่มา**\n${sources.map((x, i) => `[${i + 1}] [${x.title.replace(/[[\]]/g, '')}](${x.url})`).join('\n')}` : '');
  const chat = await DB.prepare('INSERT INTO chats (user_id,title,created_at) VALUES (?,?,?) RETURNING id').bind(J.user_id, ('🔎 ' + J.prompt).slice(0, 40), Date.now()).first();
  await DB.batch([DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'user', J.prompt, J.model_id, Date.now()),
    DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at,sources) VALUES (?,?,?,?,?,?)').bind(chat.id, 'assistant', body, J.model_id, Date.now() + 1, sources.length ? JSON.stringify(sources.map(({ title, url }) => ({ title, url }))) : null)]);
  await setJob(env, J.id, { status, rounds: 3, log: log.join('\n').slice(0, 8000), summary: (report || log.at(-1) || '').slice(0, 600), chat_id: chat.id, finished_at: Date.now() });
  await sendPush(env, u.id, { title: `Deep research ${status === 'done' ? 'เสร็จแล้ว' : 'ไม่ครบ'}`, body: J.prompt.slice(0, 120), url: '/chat?id=' + chat.id });
  await mail(env, u.email, `AstraCode Deep research ${status === 'done' ? 'เสร็จแล้ว' : 'ไม่ครบ'}: ${J.prompt.slice(0, 50)}`, mailBox('รายงานพร้อมแล้ว', esc((report || log.at(-1) || '').slice(0, 1500)).replace(/\n/g, '<br>'), 'เปิดรายงาน', `${siteUrl(env)}/chat?id=${chat.id}`)).catch(() => {});
}
// โมเดลลูกทีม: ตั้งใน team_worker_model (id) ไม่งั้นใช้ DeepSeek 4.1 Flash ถ้าแพลนมี สุดท้ายใช้ตัวที่ตัวคูณต่ำสุด
export async function workerModel(env, plan, chosen = null) { // chosen = ผู้ใช้เลือกเอง (ต้องอยู่ในแพลน) · ไม่งั้นค่าที่แอดมินตั้ง → DeepSeek Flash → ถูกสุด
  const ms = (await allowedModels(env, plan.id)).filter(x => !['image', 'embedding'].includes(x.provider)), set = +(await getSetting(env, 'team_worker_model'));
  const pick = (chosen && ms.find(x => x.id === +chosen)) || ms.find(x => x.id === set) || ms.find(x => /deepseek.*4\.1.*flash/i.test(x.name)) || [...ms].sort((a, b) => a.multiplier - b.multiplier)[0];
  return pick && env.DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(pick.id).first();
}
export async function runAgent(env, jobId, st = { gone: false }) {
  const DB = env.DB, J = await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(jobId).first(); if (!J || J.status !== 'queued') return;
  await setJob(env, jobId, { status: 'running', started_at: Date.now() });
  const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(J.user_id).first(), plan = await planOf(env, u);
  const proj = await DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(J.project_id, J.user_id).first();
  const m = await DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(J.model_id).first();
  const log = [], changedAll = new Set(); let usageNote = '', final = '', status = 'done', cumIn = 0, round = 0; const t0 = Date.now(), transcript = [];
  const lead = J.parent_id ? await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(J.parent_id).first() : null, scope = J.role === 'worker' && J.scope ? JSON.parse(J.scope) : null;
  const finish = async () => {
    if (J.role === 'worker') { // ลูกทีม: ไม่สร้างแชต ไม่ส่งอีเมล (ผู้ตรวจสรุปรวมทีเดียว) แล้วให้ทีมเดินต่อ
      await setJob(env, jobId, { doing: null, status, rounds: round, log: log.join('\n').slice(0, 8000), summary: (final || usageNote).slice(0, 4000), changed: JSON.stringify([...changedAll]), finished_at: Date.now() });
      return teamAdvance(env, J.parent_id);
    }
    if (J.role === 'review' && lead) (await DB.prepare('SELECT changed FROM agent_jobs WHERE parent_id=?').bind(lead.id).all()).results.forEach(r => { try { JSON.parse(r.changed || '[]').forEach(x => changedAll.add(x)); } catch { /* ข้าม */ } }); // ผู้ตรวจสรุปทั้งทีม
    const stats = await diffStats(env, J.project_id, [...changedAll], (lead?.started_at || lead?.created_at || t0) - 1).catch(() => [...changedAll]);
    const chat = await DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id) VALUES (?,?,?,?) RETURNING id').bind(J.user_id, ('🤖 ' + J.prompt).slice(0, 40), Date.now(), J.project_id).first();
    const body = (final || '(Agent ไม่ได้ส่งสรุป)') + (changedAll.size ? `\n\n**ไฟล์ที่เปลี่ยน:**\n${stats.map(x => '- ' + x).join('\n')}` : '') + (usageNote ? `\n\n_${usageNote}_` : '') + `\n\n<details><summary>ขั้นตอน</summary>\n\n${log.join('\n')}\n\n</details>`;
    await DB.batch([DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'user', J.prompt, J.model_id, Date.now()), DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'assistant', body, J.model_id, Date.now() + 1)]);
    await setJob(env, jobId, { status, rounds: round, log: log.join('\n').slice(0, 8000), summary: (final || usageNote).slice(0, 4000), changed: JSON.stringify([...changedAll]), chat_id: chat.id, finished_at: Date.now() });
    if (J.role === 'review' && lead) { // ผู้ตรวจจบ = ทั้งทีมจบ: สรุปและไฟล์ที่เปลี่ยนทั้งหมดไปอยู่ที่งานหัวหน้า
      await DB.prepare("UPDATE agent_jobs SET status=?, summary=?, changed=?, chat_id=?, finished_at=? WHERE id=? AND status='reviewing'").bind(status === 'done' ? 'done' : status, (final || usageNote).slice(0, 4000), JSON.stringify([...changedAll]), chat.id, Date.now(), lead.id).run();
    }
    if (status === 'failed') { // Agent ล้มติดกัน 3 งานของผู้ใช้เดียวกัน: เตือนแอดมิน (น่าจะมีปัญหาคีย์/โมเดล)
      const recent = (await DB.prepare("SELECT status FROM agent_jobs WHERE user_id=? AND id<=? ORDER BY id DESC LIMIT 3").bind(J.user_id, jobId).all()).results;
      if (recent.length === 3 && recent.every(x => x.status === 'failed')) await notify(env, `🤖 Agent ล้มติดกัน 3 งาน (ผู้ใช้ ${u.email}): ${(usageNote || final || '').slice(0, 150)}`).catch(() => {});
    }
    const label = { done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิตเต็ม', failed: 'ไม่สำเร็จ', timeout: 'หยุดเพราะใช้เวลานานเกินกำหนด' }[status] || status;
    await sendPush(env, u.id, { title: `Agent ${label}`, body: J.prompt.slice(0, 120) + (changedAll.size ? ` · ${changedAll.size} ไฟล์` : ''), url: '/code?p=' + J.project_id });
    await mail(env, u.email, `AstraCode Agent ${label}: ${J.prompt.slice(0, 50)}`, mailBox(`Agent ${label}`, esc((final || usageNote || '').slice(0, 2500)).replace(/\n/g, '<br>') + (changedAll.size ? `<br><br>ไฟล์ที่เปลี่ยน: ${esc([...changedAll].join(', '))}` : ''), 'เปิดโปรเจกต์', `${siteUrl(env)}/code?p=${J.project_id}`)).catch(() => {});
  };
  try {
    if (J.role === 'research') return await runResearch(env, J, u, plan, m);
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
      round++; await setJob(env, jobId, { rounds: round, doing: round === 1 ? 'กำลังอ่านงานและวางแผน' : 'กำลังดูผลรอบก่อนแล้วทำต่อ' }); const fcache = {};
      msgs = fitContext(system, msgs, ctxMax(m)).msgs;
      let part = '', usage = null; const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 150e3);
      let lastDo = 0; const fileOf = async f => (fcache[f] ??= (await DB.prepare('SELECT content FROM project_files WHERE project_id=? AND path=?').bind(J.project_id, f).first())?.content || '');
      try { for await (const e of callModel(env, m, msgs, { effort: J.effort || null, system, userId: u.id, signal: ac.signal })) { if (e.t) { part += e.t; if (Date.now() - lastDo > 2500) { lastDo = Date.now(); const d = doingNow(part); setJob(env, jobId, { doing: d.file && d.search ? doingLine(d, await fileOf(d.file)) : d.text }).catch(() => {}); } } if (e.usage) usage = e.usage; } }
      catch (x) { clearTimeout(timer); log.push(`รอบ ${round}: โมเดลตอบไม่ได้ (${String(x.message).slice(0, 80)})`); await event(env, 'error', m.id, 'agent: ' + String(x.message).slice(0, 280)).catch(() => {}); if (lead && !part) await new Promise(r => setTimeout(r, 4000 * round)); /* ทีมยิงพร้อมกันหลายตัว: รอแล้วลองใหม่ (มักโดน rate limit) */ if (round >= 2 && !part) { status = 'failed'; usageNote = 'โมเดลตอบไม่ได้ตอนนี้'; break; } if (!part) continue; }
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
      if (!reqs.length && !imgs.length && !res.problems.length && !res.applied.length && scope && scope.some(f => !changedAll.has(f))) {
        // ลูกทีม (โมเดลถูก) ชอบส่งโค้ดเป็นบล็อกธรรมดาไม่มี path= → ไฟล์ไม่ถูกบันทึก: เตือนให้เขียนใหม่ 1 ครั้ง ครั้งที่ 2 เดาไฟล์จากนามสกุลแล้วบันทึกให้
        const miss = scope.filter(f => !changedAll.has(f));
        if (!J._nudged) { J._nudged = true; log.push(`รอบ ${round}: ยังไม่ได้บันทึก ${miss.join(', ')} ขอให้เขียนใหม่`); msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: `You have NOT saved these files yet: ${miss.join(', ')}. Code blocks without path= are NOT saved. Output each file now as one complete fenced block whose opening line is \`\`\`<lang> path=<file>, then a one-line summary.` }]; continue; }
        const g = guessFiles(part, miss);
        if (g.length) { const r2 = await applyChanges(env, J.project_id, g); r2.applied.forEach(p2 => changedAll.add(p2)); if (r2.applied.length) log.push(`รอบ ${round}: บันทึกโค้ดที่ไม่มี path= ลง ${r2.applied.join(', ')}`); }
      }
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

// จำนวนบรรทัดที่เพิ่ม/ลบต่อไฟล์ เทียบกับเวอร์ชันก่อนงานเริ่ม (file_versions แรกหลัง since) · ไฟล์ใหม่ = ลบ 0
// shortcut: นับแบบไม่สนลำดับบรรทัด และถ้าเวอร์ชันเก่าถูกตัดทิ้งไปแล้วจะเทียบกับเวอร์ชันกลางทาง พอสำหรับสรุป ถ้าต้องดู diff จริงให้ใช้ประวัติไฟล์
export const lineDiff = (a, b) => { const m = new Map(); for (const l of a.split('\n')) m.set(l, (m.get(l) || 0) + 1); let add = 0; for (const l of b.split('\n')) { const n = m.get(l); if (n) m.set(l, n - 1); else add++; } let del = 0; for (const n of m.values()) del += n; return [add, a ? del : 0]; };
async function diffStats(env, pid, paths, since) {
  return Promise.all(paths.slice(0, 40).map(async p => {
    const old = await env.DB.prepare('SELECT content FROM file_versions WHERE project_id=? AND path=? AND created_at>=? ORDER BY id LIMIT 1').bind(pid, p, since).first();
    const cur = (await env.DB.prepare('SELECT content FROM project_files WHERE project_id=? AND path=?').bind(pid, p).first())?.content;
    if (cur == null) return `${p} (ลบ)`; if (cur.startsWith('data:')) return `${p} (รูป)`;
    const [a, d] = lineDiff(old?.content || '', cur); return `${p} (+${a} −${d})${old ? '' : ' ใหม่'}`;
  }));
}
// ประเมินต้นทุนงาน Agent เป็น % ของลิมิตสัปดาห์: token ≈ ตัวอักษร/3 · ช่วงต่ำ = รอบน้อย+แคชเยอะ · ช่วงสูง = รอบมาก ไม่มีแคช
// shortcut: สูตรหยาบจากพฤติกรรมเฉลี่ย ไม่ได้ดูความยากของงาน ถ้าจะแม่นขึ้นให้เก็บสถิติงานจริง (tin/tout ต่องาน) มาเทียบ
export function estimateAgent(lead, wm, chars, files, limitWeek) {
  const proj = Math.min(chars / 3, 60000), sys = 3500 + files * 12;
  const calls = (m, n, inTok, out, cache) => (flat(m) ? m.req_cost * n : n * (inTok * ((1 - cache) * m.cost_in + cache * (m.cost_cache || m.cost_in)) + out * m.cost_out) / 1e6) * limMult(m);
  const one = (hi) => {
    const k = hi ? 1 : 0, cache = hi ? 0 : 0.5;
    if (!wm) return calls(lead, hi ? 10 : 4, sys + proj * (hi ? 0.8 : 0.4), hi ? 5000 : 2500, cache);
    const n = hi ? 5 : 3;
    return calls(lead, 2 + k, sys + proj * 0.3, 1500, cache) + calls(wm, n * (hi ? 5 : 3), sys + proj * 0.3, hi ? 5000 : 3000, cache) + calls(lead, hi ? 4 : 2, sys + proj * 0.6, 2500, cache);
  };
  const pct = x => Math.max(0.1, Math.round(x / limitWeek * 1000) / 10);
  return { low: pct(one(false)), high: pct(one(true)) };
}
// สถานะสดของ Agent ระหว่างที่โมเดลกำลังเขียน: ดูจากข้อความที่ได้มาแล้ว (บล็อกโค้ดที่ยังไม่ปิด / READ / GREP)
export function doingNow(part) {
  const fences = [...part.matchAll(/```([^\n]*)\n/g)];
  if (fences.length % 2 === 1) { // อยู่ในบล็อกโค้ดที่ยังไม่ปิด
    const f = fences.at(-1), file = /path=([^\s`]+)/.exec(f[1])?.[1], body = part.slice(f.index + f[0].length);
    if (!file) return { text: 'กำลังเขียนตัวอย่างโค้ด' };
    const s = body.lastIndexOf('<<<<<<< SEARCH');
    if (s >= 0) return { file, search: body.slice(s + 15).split('\n=======')[0].split('\n').find(l => l.trim().length > 3) || '', text: `กำลังแก้ ${file}` };
    return { file, text: `กำลังเขียน ${file} บรรทัดที่ ${body.split('\n').length}` };
  }
  const tool = [...part.replace(/```[\s\S]*?```/g, '').matchAll(/^[ \t]*(READ|GREP|LIST)[ \t]+(?:path=)?(.+)$/gm)].at(-1);
  if (tool) return { text: { READ: 'กำลังอ่าน ', GREP: 'กำลังค้นหา ', LIST: 'กำลังดูโฟลเดอร์ ' }[tool[1]] + tool[2].trim().slice(0, 60) };
  const last = part.trim().split('\n').filter(l => l.trim() && !/^[`#>*-]/.test(l.trim())).at(-1) || '';
  return { text: last ? 'กำลังคิด: ' + last.trim().slice(0, 70) : 'กำลังคิด…' };
}
export const doingLine = (d, content) => { const i = d.search ? content.split('\n').findIndex(l => l.includes(d.search.trim())) : -1; return i >= 0 ? `${d.text} บรรทัดที่ ${i + 1}` : d.text; };

// บล็อกโค้ดที่ไม่มี path=: จับคู่กับไฟล์ที่ยังขาดตามนามสกุล (ไม่ชัด = ข้าม) · ไฟล์ละบล็อกที่ยาวที่สุด
const EXT = { js: 'js', javascript: 'js', mjs: 'mjs', ts: 'ts', css: 'css', html: 'html', json: 'json', md: 'md', markdown: 'md', py: 'py', python: 'py', svg: 'svg', txt: 'txt' };
export function guessFiles(text, miss) {
  const out = new Map();
  for (const b of String(text).matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g)) {
    if (/path=/.test(b[0].split('\n')[0]) || b[2].trim().length < 20) continue;
    const e = EXT[b[1].toLowerCase()], c = miss.filter(f => e ? f.endsWith('.' + e) : miss.length === 1);
    if (c.length === 1 && (out.get(c[0])?.length || 0) < b[2].length) out.set(c[0], b[2]);
  }
  return [...out].map(([path, content]) => ({ path, content }));
}

// ---------- API ----------
export async function agentApi(req, env, u, path) {
  await ensureAgentTable(env); const DB = env.DB, M = req.method;
  if (path === '/api/agent' && M === 'GET') {
    const pj = new URL(req.url).searchParams.get('project');
    const list = (await DB.prepare(`SELECT id,project_id,prompt,status,rounds,summary,changed,chat_id,created_at,finished_at,role,doing,model_id,worker_model_id,tin,tout,ctx_peak FROM agent_jobs WHERE user_id=? AND parent_id IS NULL${pj ? ' AND project_id=?' : ''}${new URL(req.url).searchParams.get('research') ? " AND role='research'" : ''} ORDER BY id DESC LIMIT 10`).bind(...(pj ? [u.id, +pj] : [u.id])).all()).results;
    const leads = list.filter(j => j.role === 'lead').map(j => j.id);
    if (leads.length) { const kids = (await DB.prepare(`SELECT id,parent_id,role,prompt,status,rounds,changed,scope,doing,model_id,tin,tout,ctx_peak,CASE WHEN status='planned' THEN summary END plan FROM agent_jobs WHERE parent_id IN (${leads.map(() => '?')}) ORDER BY id`).bind(...leads).all()).results; list.forEach(j => { if (j.role === 'lead') j.team = kids.filter(k => k.parent_id === j.id).map(({ prompt, ...k }) => ({ ...k, title: prompt.split('\n')[0].slice(0, 80) })); }); }
    return json(list);
  }
  if (path === '/api/agent' && M === 'POST') {
    const plan = await planOf(env, u); if (!(plan?.price > 0)) return err('Agent เบื้องหลังใช้ได้กับแพลนที่ชำระเงิน', 403);
    const b = await req.json(), prompt = String(b.prompt || '').trim().slice(0, 4000);
    if (prompt.length < 10) return err('อธิบายงานให้ละเอียดขึ้นอีกหน่อย (อย่างน้อย 10 ตัวอักษร)');
    if (b.research && !(env.TAVILY_KEY && (await getSetting(env, 'search_enabled')) !== '0')) return err('ระบบค้นเว็บยังไม่เปิดใช้', 503);
    if (!b.research && !await DB.prepare('SELECT 1 FROM projects WHERE id=? AND user_id=?').bind(+b.project_id, u.id).first()) return err('ไม่พบโปรเจกต์', 404);
    const model = (await allowedModels(env, plan.id)).find(x => x.id === +b.model_id && !['image', 'embedding'].includes(x.provider)); if (!model) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
    const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) return err('ลิมิตเต็มแล้ว', 429);
    if (await DB.prepare("SELECT 1 FROM agent_jobs WHERE user_id=? AND ((status IN ('queued','running','stopping') AND COALESCE(started_at,created_at)>?) OR status IN ('waiting','team','reviewing','plan'))").bind(u.id, Date.now() - 20 * 60e3).first()) return err('มีงาน Agent ที่กำลังทำอยู่ รอให้เสร็จหรือกดหยุดก่อน', 409);
    if (await limited(env, 'agent:' + u.id, 12, DAY)) return err('สั่ง Agent วันนี้ครบแล้ว (12 งานต่อวัน)', 429);
    const effort = model.effort && model.effort !== 'none' && ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'on'].includes(b.effort) ? b.effort : null; // ระดับการคิดที่เลือกในหน้าเว็บ (ลูกทีมใช้ค่าเริ่มต้นของโมเดล)
    const job = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at,role,scope,effort,worker_model_id) VALUES (?,?,?,?,'queued',?,?,?,?,?) RETURNING id").bind(u.id, b.research ? 0 : +b.project_id, model.id, prompt, Date.now(), b.research ? 'research' : b.team ? 'lead' : null, b.team && !b.research && b.confirm !== false ? 'confirm' : null, effort, b.team && +b.worker_model_id > 0 ? +b.worker_model_id : null).first();
    await launch(env, job.id); // ทำต่อใน Durable Object แม้ผู้ใช้ปิดแอป
    return json({ id: job.id });
  }
  if (path === '/api/agent/estimate' && M === 'POST') { // ประเมินว่างานนี้น่าจะใช้ลิมิตสัปดาห์กี่ % (ช่วงต่ำ–สูง)
    const plan = await planOf(env, u), b = await req.json().catch(() => ({})), ms = await allowedModels(env, plan.id);
    const lead = ms.find(x => x.id === +b.model_id), wm = b.team ? (await workerModel(env, plan, +b.worker_model_id || null)) || lead : null;
    if (!lead || !(plan.limit_week > 0)) return json({ ok: false });
    const sz = (await DB.prepare('SELECT COALESCE(SUM(length(content)),0) n, COUNT(*) c FROM project_files WHERE project_id=? AND project_id IN (SELECT id FROM projects WHERE user_id=?)').bind(+b.project_id, u.id).first());
    return json({ ok: true, ...estimateAgent(lead, wm, sz.n, sz.c, plan.limit_week) });
  }
  const rs = path.match(/^\/api\/agent\/(\d+)\/resume$/);
  if (rs && M === 'POST') { // ทำต่อจากงานที่หยุด: สั่งงานใหม่ (Agent เดี่ยว โมเดลเดิม) พร้อมสรุปของรอบก่อน
    const J = await DB.prepare("SELECT * FROM agent_jobs WHERE id=? AND user_id=? AND parent_id IS NULL AND role IS NOT 'research' AND status IN ('stopped','limit','timeout','failed')").bind(+rs[1], u.id).first();
    if (!J) return err('ไม่พบงานที่ทำต่อได้', 404);
    const prompt = `${J.prompt.slice(0, 2500)}\n\n[ทำต่อจากงานก่อนหน้าที่หยุดไว้ (${J.status})]\n${(J.summary || '').slice(0, 900)}\nไฟล์ที่แก้ไปแล้ว: ${(JSON.parse(J.changed || '[]')).join(', ') || '-'}\nอ่านไฟล์ที่แก้แล้วก่อน แล้วทำส่วนที่ยังไม่เสร็จต่อ อย่าทำซ้ำส่วนที่เสร็จแล้ว`;
    return agentApi(new Request(new URL('/api/agent', req.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project_id: J.project_id, model_id: J.model_id, effort: J.effort || '', prompt: prompt.slice(0, 4000) }) }), env, u, '/api/agent');
  }
  const st = path.match(/^\/api\/agent\/(\d+)\/start$/);
  if (st && M === 'POST') { // ผู้ใช้ยืนยันแผน (แก้ชื่อ/คำสั่ง/ไฟล์ หรือตัดงานย่อยทิ้งได้) แล้วเริ่มทีม
    const L = await DB.prepare("SELECT * FROM agent_jobs WHERE id=? AND user_id=? AND status='plan'").bind(+st[1], u.id).first(); if (!L) return err('ไม่พบแผนที่รอยืนยัน', 404);
    const kids = (await DB.prepare("SELECT id FROM agent_jobs WHERE parent_id=? AND status='planned'").bind(L.id).all()).results.map(k => k.id), b = await req.json().catch(() => ({}));
    const keep = (Array.isArray(b.tasks) ? b.tasks : []).filter(t => kids.includes(+t.id)).map(t => ({ id: +t.id, title: String(t.title || '').trim().slice(0, 80), prompt: String(t.prompt || '').trim().slice(0, 4000), files: [...new Set((Array.isArray(t.files) ? t.files : String(t.files || '').split(',')).map(f => String(f).trim().replace(/^\.?\//, '')).filter(f => PATH_RE.test(f)))].slice(0, 15) }));
    if (!keep.length || keep.some(t => !t.prompt || !t.files.length)) return err('ต้องเหลืออย่างน้อย 1 งาน และทุกงานต้องมีคำสั่งกับไฟล์อย่างน้อย 1 ไฟล์');
    if (!(await DB.prepare("UPDATE agent_jobs SET status='team' WHERE id=? AND status='plan'").bind(L.id).run()).meta.changes) return err('แผนนี้ถูกเริ่มหรือยกเลิกไปแล้ว', 409);
    await DB.batch([...keep.map(t => DB.prepare("UPDATE agent_jobs SET prompt=?, scope=?, summary=NULL, status='waiting' WHERE id=?").bind(workerPrompt(t, L.prompt.slice(0, 1500)), JSON.stringify(t.files), t.id)),
      DB.prepare(`DELETE FROM agent_jobs WHERE parent_id=? AND status='planned'`).bind(L.id)]);
    await teamAdvance(env, L.id);
    return json({ ok: true, tasks: keep.length });
  }
  const r = path.match(/^\/api\/agent\/(\d+)\/stop$/);
  if (r && M === 'POST') {
    const id = +r[1], stopDo = i => env.CHATRUN?.get(env.CHATRUN.idFromName('agent:' + i)).fetch('https://run/stop', { method: 'POST' }).catch(() => {});
    if ((await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=?, summary=COALESCE(summary,'หยุดทั้งทีมแล้ว (ไฟล์ที่แก้แล้วยังอยู่)') WHERE id=? AND user_id=? AND status IN ('team','reviewing','plan')").bind(Date.now(), id, u.id).run()).meta.changes) { // หยุดทั้งทีม / ยกเลิกแผน
      await DB.prepare("UPDATE agent_jobs SET status='stopped', finished_at=? WHERE parent_id=? AND status IN ('waiting','planned')").bind(Date.now(), id).run();
      const run = (await DB.prepare("UPDATE agent_jobs SET status='stopping' WHERE parent_id=? AND status IN ('queued','running') RETURNING id").bind(id).all()).results;
      await Promise.all(run.map(x => stopDo(x.id))); return json({ ok: true });
    }
    const ch = await DB.prepare("UPDATE agent_jobs SET status='stopping' WHERE id=? AND user_id=? AND status IN ('queued','running')").bind(id, u.id).run();
    if (ch.meta.changes) await stopDo(id);
    return json({ ok: !!ch.meta.changes });
  }
  return err('not found', 404);
}
