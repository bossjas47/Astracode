// Agent เบื้องหลัง: ทำงานแก้โค้ดบนเซิร์ฟเวอร์ทั้งชุดโดยผู้ใช้ไม่ต้องเปิดหน้าค้างไว้ (รันใน Durable Object ของ ChatRun)
// วนรอบ: ให้โมเดลคิด → อ่านไฟล์ที่ขอ (READ/GREP/LIST) → เขียนไฟล์ที่แก้ลงโปรเจกต์ → ส่งผลกลับให้โมเดล จนไม่มีอะไรต้องทำ
// ข้อจำกัด: เซิร์ฟเวอร์รันโค้ดและจับภาพหน้าจอไม่ได้ Agent จึงตรวจงานด้วยการอ่านไฟล์กลับ ผู้ใช้ควรเปิดดูผลเองตอนจบ
import { DAY, SYSTEM_CODE, allowedModels, ctxMax, err, esc, fitContext, json, limited, planOf, touchWindows, usageStatus } from './core.js';
import { callModel, doingOf, familyHint, logUsage, runTools, toolReqs } from './ai.js';
import { mail, mailBox } from './billing.js';
import { FILE_LIMIT, FILES_PER_PROJECT, PATH_RE, PROJECT_LIMIT, snapshot } from './projects.js';
import { changesOf, problemOf } from './edits.js';

export const AGENT_MAX_ROUNDS = 20, AGENT_MAX_IN = 1.5e6, AGENT_MAX_MS = 12 * 60e3;
const AGENT_NOTE = `You are running as an unattended background agent on the server. The user is not watching and cannot answer questions, so never ask: choose sensible defaults and state them in your summary.
You cannot run code, open a browser or see the page, so RUN lines are ignored. Verify your work by re-reading the files you changed.
Work in as few rounds as you can: READ everything you need in one reply, then write all the file changes together. When the task is complete, reply with a short summary (what you changed, what the user should test, any assumption) and NO READ/GREP/LIST lines and no file blocks.`;

export async function ensureAgentTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, project_id INTEGER NOT NULL, model_id INTEGER NOT NULL, prompt TEXT NOT NULL, status TEXT NOT NULL, rounds INTEGER NOT NULL DEFAULT 0, log TEXT NOT NULL DEFAULT \'\', summary TEXT, changed TEXT, chat_id INTEGER, created_at INTEGER NOT NULL, finished_at INTEGER)').run();
}
const setJob = (env, id, f) => { const ks = Object.keys(f); return env.DB.prepare(`UPDATE agent_jobs SET ${ks.map(k => k + '=?').join(',')} WHERE id=?`).bind(...ks.map(k => f[k]), id).run(); };

// เขียนผลลง project_files (เก็บเวอร์ชันเก่าไว้ย้อนได้) · คืน { applied: [path], problems: [ข้อความ] }
async function applyChanges(env, pid, changes) {
  const DB = env.DB, files = (await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(pid).all()).results, cur = new Map(files.map(f => [f.path, f.content]));
  const applied = [], problems = [], writes = [], dels = [];
  for (const c of changes) {
    if (!PATH_RE.test(c.path)) { problems.push(`${c.path}: ชื่อไฟล์ไม่ถูกต้อง`); continue; }
    if (c.error) { problems.push(`${c.path}: ${c.error}`); continue; }
    if (c.del) { if (cur.has(c.path)) { dels.push(c.path); applied.push(c.path + ' (ลบ)'); } continue; }
    if (c.content.length > FILE_LIMIT) { problems.push(`${c.path}: ไฟล์ใหญ่เกิน ${FILE_LIMIT / 1000}KB`); continue; }
    const p = problemOf(c.path, c.content, cur.get(c.path)); if (p) { problems.push(`${c.path}: ${p}`); continue; }
    if (cur.get(c.path) === c.content) continue;
    writes.push({ path: c.path, content: c.content }); applied.push(c.path);
  }
  const sizes = new Map(cur); for (const d of dels) sizes.delete(d); for (const w of writes) sizes.set(w.path, w.content);
  if (sizes.size > FILES_PER_PROJECT || [...sizes.values()].reduce((a, b) => a + b.length, 0) > PROJECT_LIMIT) return { applied: [], problems: ['โปรเจกต์ใหญ่เกินขีดจำกัด (ไฟล์เยอะหรือเกิน 5MB) ไม่ได้เขียนไฟล์รอบนี้'] };
  const now = Date.now();
  await snapshot(env, pid, [...writes, ...dels.map(path => ({ path, content: '' }))], 'agent');
  const ops = [...writes.map(w => DB.prepare('INSERT OR REPLACE INTO project_files (project_id,path,content,updated_at) VALUES (?,?,?,?)').bind(pid, w.path, w.content, now)), ...dels.map(p => DB.prepare('DELETE FROM project_files WHERE project_id=? AND path=?').bind(pid, p))];
  for (let i = 0; i < ops.length; i += 50) await DB.batch(ops.slice(i, i + 50));
  if (ops.length) await DB.prepare('UPDATE projects SET updated_at=? WHERE id=?').bind(now, pid).run();
  return { applied, problems };
}

// งานที่ค้าง 'running' เกิน 20 นาที (Durable Object ถูกตัดกลางทาง) ให้ปิดเป็น failed ไม่ให้ผู้ใช้ติดคิว
export async function reapAgentJobs(env) {
  await ensureAgentTable(env);
  await env.DB.prepare("UPDATE agent_jobs SET status='failed', summary='งานถูกตัดกลางทาง (ระบบรีสตาร์ต) ไฟล์ที่แก้แล้วยังอยู่ สั่งต่อได้', finished_at=? WHERE status IN ('queued','running','stopping') AND created_at<?").bind(Date.now(), Date.now() - 20 * 60e3).run();
}
export async function runAgent(env, jobId, st = { gone: false }) {
  const DB = env.DB, J = await DB.prepare('SELECT * FROM agent_jobs WHERE id=?').bind(jobId).first(); if (!J || J.status !== 'queued') return;
  await setJob(env, jobId, { status: 'running' });
  const u = await DB.prepare('SELECT * FROM users WHERE id=?').bind(J.user_id).first(), plan = await planOf(env, u);
  const proj = await DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(J.project_id, J.user_id).first();
  const m = await DB.prepare('SELECT * FROM models WHERE id=? AND active=1').bind(J.model_id).first();
  const log = [], changedAll = new Set(); let usageNote = '', final = '', status = 'done', cumIn = 0, round = 0; const t0 = Date.now(), transcript = [];
  const finish = async () => {
    const chat = await DB.prepare('INSERT INTO chats (user_id,title,created_at,project_id) VALUES (?,?,?,?) RETURNING id').bind(J.user_id, ('🤖 ' + J.prompt).slice(0, 40), Date.now(), J.project_id).first();
    const body = (final || '(Agent ไม่ได้ส่งสรุป)') + (changedAll.size ? `\n\n**ไฟล์ที่เปลี่ยน:** ${[...changedAll].join(', ')}` : '') + (usageNote ? `\n\n_${usageNote}_` : '') + `\n\n<details><summary>ขั้นตอน</summary>\n\n${log.join('\n')}\n\n</details>`;
    await DB.batch([DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'user', J.prompt, J.model_id, Date.now()), DB.prepare('INSERT INTO messages (chat_id,role,content,model_id,created_at) VALUES (?,?,?,?,?)').bind(chat.id, 'assistant', body, J.model_id, Date.now() + 1)]);
    await setJob(env, jobId, { status, rounds: round, log: log.join('\n').slice(0, 8000), summary: (final || usageNote).slice(0, 4000), changed: JSON.stringify([...changedAll]), chat_id: chat.id, finished_at: Date.now() });
    const label = { done: 'เสร็จแล้ว', stopped: 'หยุดแล้ว', limit: 'หยุดเพราะลิมิตเต็ม', failed: 'ไม่สำเร็จ', timeout: 'หยุดเพราะใช้เวลานานเกินกำหนด' }[status] || status;
    await mail(env, u.email, `AstraCode Agent ${label}: ${J.prompt.slice(0, 50)}`, mailBox(`Agent ${label}`, esc((final || usageNote || '').slice(0, 2500)).replace(/\n/g, '<br>') + (changedAll.size ? `<br><br>ไฟล์ที่เปลี่ยน: ${esc([...changedAll].join(', '))}` : ''), 'เปิดโปรเจกต์', `${env.PUBLIC_URL || 'https://astracode.panderx.xyz'}/code?p=${J.project_id}`)).catch(() => {});
  };
  try {
    if (!proj || !m || !(plan?.price > 0)) { status = 'failed'; usageNote = 'ไม่พบโปรเจกต์/โมเดล หรือแพลนไม่รองรับ'; return await finish(); }
    const files = () => DB.prepare('SELECT path,length(content) n FROM project_files WHERE project_id=? ORDER BY path').bind(J.project_id).all().then(r => r.results);
    const astra = (await DB.prepare("SELECT content FROM project_files WHERE project_id=? AND path IN ('ASTRA.md','AGENTS.md') ORDER BY path LIMIT 1").bind(J.project_id).first())?.content?.slice(0, 3000) || '';
    const system = SYSTEM_CODE + '\n\n' + (m.code_prompt?.trim() || familyHint(m)) + (proj.instructions ? '\n\nProject-specific instructions (follow them):\n' + proj.instructions.slice(0, 3000) : '') + (astra ? '\n\nFrom the project file ASTRA.md:\n' + astra : '') + '\n\n' + AGENT_NOTE;
    let msgs = [{ role: 'user', content: `${J.prompt}\n\n[ไฟล์ทั้งหมดในโปรเจกต์]\n${(await files()).map(f => `${f.path} (${f.n})`).join('\n').slice(0, 15000)}` }];
    for (; round < AGENT_MAX_ROUNDS; ) {
      if ((await DB.prepare('SELECT status FROM agent_jobs WHERE id=?').bind(jobId).first())?.status === 'stopping' || st.gone) { status = 'stopped'; break; }
      if (Date.now() - t0 > AGENT_MAX_MS) { status = 'timeout'; usageNote = 'ใช้เวลานานเกินกำหนด (12 นาที) หยุดไว้ก่อน'; break; }
      const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) { status = 'limit'; usageNote = 'ลิมิตของแพลนเต็ม หยุดไว้ก่อน (ไฟล์ที่แก้แล้วยังอยู่)'; break; }
      if (cumIn >= AGENT_MAX_IN) { status = 'limit'; usageNote = 'ใช้ token ครบเพดานต่อคำสั่งแล้ว (1.5 ล้าน)'; break; }
      round++; await setJob(env, jobId, { rounds: round });
      msgs = fitContext(system, msgs, ctxMax(m)).msgs;
      let part = '', usage = null; const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 150e3);
      try { for await (const e of callModel(env, m, msgs, { effort: null, system, userId: u.id, signal: ac.signal })) { if (e.t) part += e.t; if (e.usage) usage = e.usage; } }
      catch (x) { clearTimeout(timer); log.push(`รอบ ${round}: โมเดลตอบไม่ได้ (${String(x.message).slice(0, 80)})`); if (round >= 2 && !part) { status = 'failed'; usageNote = 'โมเดลตอบไม่ได้ตอนนี้'; break; } if (!part) continue; }
      clearTimeout(timer);
      if (usage) { await touchWindows(env, u.id, Date.now(), plan); await logUsage(env, u.id, m, usage, { units: true, plan }); cumIn += usage.fresh + usage.read + usage.write; }
      const reqs = toolReqs(part.replace(/```[\s\S]*?```/g, ''));
      const cur = new Map((await DB.prepare('SELECT path,content FROM project_files WHERE project_id=?').bind(J.project_id).all()).results.map(f => [f.path, f.content]));
      const ch = changesOf(part, p => cur.has(p) ? cur.get(p) : null), res = ch.length ? await applyChanges(env, J.project_id, ch) : { applied: [], problems: [] };
      res.applied.forEach(p => changedAll.add(p.replace(/ \(ลบ\)$/, '')));
      log.push(`รอบ ${round}: ${[reqs.length ? doingOf(reqs) : '', res.applied.length ? 'แก้ ' + res.applied.join(', ') : '', res.problems.length ? `มีปัญหา ${res.problems.length} จุด` : ''].filter(Boolean).join(' · ') || 'สรุปผล'}`);
      transcript.push(part);
      // รอบที่ไม่ได้ขออ่านและไม่ได้เขียนอะไร = สรุปผลแล้ว (รอบที่เพิ่งเขียนไฟล์ ให้อีกรอบเพื่อตรวจทาน/สรุป)
      if (!reqs.length && !res.problems.length && !res.applied.length) { final = part.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim() || part.trim(); break; }
      const tool = reqs.length ? await runTools(env, J.project_id, reqs) : '';
      msgs = [...msgs, { role: 'assistant', content: part }, { role: 'user', content: [tool, res.problems.length ? `[ผลการเขียนไฟล์]\nมีบางไฟล์เขียนไม่ได้ แก้แล้วส่งใหม่ (ส่วนที่เหลือถูกเขียนแล้ว):\n- ${res.problems.join('\n- ')}` : '', res.applied.length ? `[เขียนแล้ว] ${res.applied.join(', ')}\nตรวจทานงานด้วย READ ถ้าจำเป็น แล้วสรุปผล (ไม่ต้องส่งไฟล์ซ้ำ)` : ''].filter(Boolean).join('\n\n') }];
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
    return json((await DB.prepare(`SELECT id,project_id,prompt,status,rounds,summary,changed,chat_id,created_at,finished_at FROM agent_jobs WHERE user_id=?${pj ? ' AND project_id=?' : ''} ORDER BY id DESC LIMIT 10`).bind(...(pj ? [u.id, +pj] : [u.id])).all()).results);
  }
  if (path === '/api/agent' && M === 'POST') {
    const plan = await planOf(env, u); if (!(plan?.price > 0)) return err('Agent เบื้องหลังใช้ได้กับแพลนที่ชำระเงิน', 403);
    const b = await req.json(), prompt = String(b.prompt || '').trim().slice(0, 4000);
    if (prompt.length < 10) return err('อธิบายงานให้ละเอียดขึ้นอีกหน่อย (อย่างน้อย 10 ตัวอักษร)');
    if (!await DB.prepare('SELECT 1 FROM projects WHERE id=? AND user_id=?').bind(+b.project_id, u.id).first()) return err('ไม่พบโปรเจกต์', 404);
    const model = (await allowedModels(env, plan.id)).find(x => x.id === +b.model_id && !['image', 'embedding'].includes(x.provider)); if (!model) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
    const lim = await usageStatus(env, u, plan); if (lim.pct4h >= 100 || lim.pctWeek >= 100) return err('ลิมิตเต็มแล้ว', 429);
    if (await DB.prepare("SELECT 1 FROM agent_jobs WHERE user_id=? AND status IN ('queued','running','stopping') AND created_at>?").bind(u.id, Date.now() - 20 * 60e3).first()) return err('มีงาน Agent ที่กำลังทำอยู่ รอให้เสร็จหรือกดหยุดก่อน', 409);
    if (await limited(env, 'agent:' + u.id, 12, DAY)) return err('สั่ง Agent วันนี้ครบแล้ว (12 งานต่อวัน)', 429);
    const job = await DB.prepare("INSERT INTO agent_jobs (user_id,project_id,model_id,prompt,status,created_at) VALUES (?,?,?,?,'queued',?) RETURNING id").bind(u.id, +b.project_id, model.id, prompt, Date.now()).first();
    if (env.CHATRUN) await env.CHATRUN.get(env.CHATRUN.idFromName('agent:' + job.id)).fetch('https://run/start', { method: 'POST', body: JSON.stringify({ agent_id: job.id }) }); // ทำต่อใน Durable Object แม้ผู้ใช้ปิดแอป
    else await runAgent(env, job.id); // ไม่มี Durable Object (เช่นรันทดสอบ): ทำให้จบในคำขอนี้เลย
    return json({ id: job.id });
  }
  const r = path.match(/^\/api\/agent\/(\d+)\/stop$/);
  if (r && M === 'POST') {
    const ch = await DB.prepare("UPDATE agent_jobs SET status='stopping' WHERE id=? AND user_id=? AND status IN ('queued','running')").bind(+r[1], u.id).run();
    if (ch.meta.changes) await env.CHATRUN.get(env.CHATRUN.idFromName('agent:' + r[1])).fetch('https://run/stop', { method: 'POST' }).catch(() => {});
    return json({ ok: !!ch.meta.changes });
  }
  return err('not found', 404);
}
