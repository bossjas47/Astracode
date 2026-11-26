// สกิลในตัวของ Kyber Harness (แอปคอม + เครื่องเสมือนบนคลาวด์ใช้ไฟล์นี้ร่วมกัน · หน้า Code บนเว็บมีสำเนาใน astracode/src/skills.js)
// 1) วินัยการเขียนโค้ด: ให้โมเดลระดับกลางทำงานเป็นขั้นเล็ก ตรวจทุกขั้น พลาดน้อยลง
// 2) Three.js: ฉาก 3D / แอนิเมชัน / โหลด-ส่งออก .glb ที่รันได้จริง + ตรวจภาพเองด้วย check_page
// 3) ที่ปรึกษาโมเดลแรง: วางแผนตอนเริ่ม · ช่วยตอนติด (ผู้ตรวจรอบสองใช้โมเดลนี้ด้วย)
// 4) ความจำโปรเจกต์: .kyber/memory.md บทเรียนจากงานก่อน (อ่านตอนเริ่ม เขียนตอนจบ)
const fs = require('fs/promises');
const path = require('path');

const CODING_SKILL = `## Skill: coding discipline (follow on every coding task)
1. Understand first: read the files you will touch and the code that calls them. Never edit a file you have not read in this task.
2. Plan in small steps (todo_write). One step = one small change you can check.
3. After each change: fix any [syntax error] right away, then run the narrowest check (the related test, a build, node --check, python -m py_compile, or check_page for web pages). Do not stack several unverified changes.
4. Read errors fully: the first error line, file and line number. Fix the root cause, not the symptom. If the same fix failed twice, stop and re-read the code or ask for advice instead of trying it a third time.
5. Keep names consistent: when you rename or add a function, grep for every use. Check imports/exports and paths match exactly (case-sensitive).
6. Do not invent APIs: if unsure a function/option exists, read the library code or docs (web_search/web_fetch) before using it.
7. Big files: write in parts (write_file then write_file append=true), edit existing files with edit_file, never paste a whole huge file twice.
8. Common mistakes to avoid: off-by-one, async without await, missing error handling around network/file calls, forgetting to save/return the result, hard-coded paths, mixing tabs/spaces in Python, leaving debug prints.
9. Before you say "done": run the project's checks, re-read your diff (git_inspect op=diff when in git), and confirm every part of the request is handled.
10. Write important facts you will need later with the notes tool (decisions, file roles, commands that work) so they survive when the conversation is summarized.`;

const THREE_SKILL = `## Skill: Three.js 3D scenes and animation
Use this whenever the task involves 3D, WebGL, three.js, a 3D model (.glb/.gltf) or a 3D animation on a web page.
- Load three.js as ES modules from a pinned CDN with an import map (works with no build step):
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  then <script type="module"> import * as THREE from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; </script>
  Keep every three.js URL on the SAME version. If the project already uses npm/vite with "three", import from 'three' instead.
- Skeleton that always renders: renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(renderer.domElement);
  PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 1000) positioned to SEE the object (e.g. camera.position.set(3, 2, 5); camera.lookAt(0, 0, 0)).
  Light it: HemisphereLight + DirectionalLight (MeshStandardMaterial is black without light). Give the scene a background color.
  Animate with renderer.setAnimationLoop(t => { ...; renderer.render(scene, camera); }) and use a THREE.Clock delta (frame-rate independent).
  Handle resize: update camera.aspect, camera.updateProjectionMatrix(), renderer.setSize.
- Animation: tween position/rotation/scale with delta time; for models with clips use AnimationMixer (mixer.clipAction(gltf.animations[0]).play(); mixer.update(delta)). Respect prefers-reduced-motion (slow or pause).
- 3D models: GLTFLoader from 'three/addons/loaders/GLTFLoader.js' (add DRACOLoader only when the file is Draco-compressed). After loading, center and scale with new THREE.Box3().setFromObject(model) so it fits the camera. Show a loading state and catch load errors.
- Export .glb: GLTFExporter from 'three/addons/exporters/GLTFExporter.js' with { binary: true }, then download the ArrayBuffer as a Blob (model/gltf-binary). Offer a "Download .glb" button when the user wants the model.
- Performance: reuse geometries/materials, limit shadow-casting lights, use InstancedMesh for many copies, dispose() what you remove.
- Mobile: touch works with OrbitControls; set body { margin:0; overflow:hidden } and canvas { display:block; touch-action:none }.
- VERIFY: after writing the page, call check_page on the HTML file. Fix every console error, and if the screenshot is blank/black: check the camera position/lookAt, lights, object scale, and that the render loop runs. Repeat until the scene is visible and correct.`;

const ROBLOX_SKILL = `## Skill: Roblox Studio (Luau) with the roblox tool
- Start with roblox op=info, then op=tree on the parts you need (not the whole game). Use op=find to locate scripts/objects; op=read before you edit a script.
- Edit scripts with op=edit (exact unique snippet) for small changes, op=write for new scripts or full rewrites. Pick the right class: Script (server, ServerScriptService), LocalScript (client, StarterPlayerScripts/StarterGui/StarterCharacterScripts), ModuleScript (shared code, ReplicatedStorage/ServerScriptService).
- Finish in few rounds: group related steps in ONE op=batch (e.g. edit the script, create the parts, then play). Build or change many objects in ONE op=run with a Luau loop (Instance.new, set Anchored/Size/Position/Color/Material, Parent last) instead of many op=create calls. Name things clearly and group them in Folders/Models.
- Luau rules: use task.wait/task.spawn/task.delay (not wait/spawn/delay), game:GetService(...), WaitForChild for objects that load later on the client, :Connect for events and Disconnect when done. Server owns game state; the client sends requests through RemoteEvent/RemoteFunction in ReplicatedStorage and the server validates them (never trust the client for money, damage or items). Use DataStoreService with pcall for saving. Avoid infinite loops without task.wait.
- VERIFY: after script changes run op=play (seconds 5-15) and read the Output; fix every [error] line (it names the script and line), then play again. LocalScript/GUI behaviour needs the user to press Play: say what to check. Use op=output to read errors the user saw.
- Keep the user's work safe: do not delete objects you did not create unless asked; every change can be undone with Ctrl+Z in Studio.`;
const ROBLOX_RE = /roblox|โรบล็อก|โรบลอก|\bluau\b|\brbx/i;

const THREE_RE = /three\.?js|\bthree\b.*\b(scene|mesh)\b|webgl|\b3d\b|\.glb\b|\.gltf\b|gltf|โมเดล\s*3|สามมิติ|แอนิเมชัน\s*3|อนิเมชัน\s*3/i;
// เลือกสกิลที่ใส่ใน prompt: วินัยเขียนโค้ดเสมอ (งานโค้ด) · Three.js เมื่อคำสั่งหรือโปรเจกต์เกี่ยวกับ 3D
function builtinSkills({ text = '', deps = '', code = true, roblox = false } = {}) {
  const out = [];
  if (code) out.push(CODING_SKILL);
  if (THREE_RE.test(text) || /"three"\s*:/.test(deps)) out.push(THREE_SKILL);
  if (roblox || ROBLOX_RE.test(text)) out.push(ROBLOX_SKILL);
  return out.join('\n\n');
}

// ---------- ความจำโปรเจกต์ ----------
const MEM_FILE = path.join('.kyber', 'memory.md'), MEM_MAX = 6000;
async function memoryRead(root) {
  const t = await fs.readFile(path.join(root, MEM_FILE), 'utf8').catch(() => '');
  return t.trim() ? t.slice(-MEM_MAX) : '';
}
const memoryBlock = mem => mem ? `\n\nProject memory (.kyber/memory.md: lessons from earlier tasks in this project; trust it unless the files now say otherwise, and keep following it):\n${mem}` : '';
// จบงาน: ให้โมเดลสรุปบทเรียนที่ใช้ซ้ำได้ (ข้อผิดพลาด+วิธีแก้, ข้อตกลงของโปรเจกต์, คำสั่งที่ใช้ได้) ไม่เกิน 5 ข้อ · ไม่มีอะไรใหม่ = ไม่เขียน
async function memoryLearn({ post, model, root, task = '', messages = [] }) {
  if (!post || !root) return null;
  const old = await memoryRead(root);
  const log = messages.filter(m => m.role !== 'system').slice(-40).map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.tool_calls ?? '')}`.slice(0, 1500)).join('\n').slice(-30000);
  const r = await post({ model, stream: false, max_tokens: 600, messages: [
    { role: 'system', content: 'You keep a short memory file for a coding project. From the work log, write 0-5 NEW lessons that will help future tasks in THIS project: mistakes made and how they were fixed, project conventions, commands that work (test/build/run), file roles, gotchas. One line each, starting with "- ", concrete (paths, commands), no secrets, no task-specific chatter. Do not repeat what the existing memory already says. If nothing new is worth keeping, reply exactly NONE.' },
    { role: 'user', content: `Existing memory:\n${old || '(empty)'}\n\nTask:\n${String(task).slice(0, 2000)}\n\nWork log (latest part):\n${log}` }] }).catch(() => null);
  const d = r && r.ok ? await r.json().catch(() => ({})) : {}, t = String(d.choices?.[0]?.message?.content || '').trim();
  const lines = t.split('\n').map(x => x.trim()).filter(x => /^- \S/.test(x)).slice(0, 5).map(x => x.slice(0, 300).replace(/\b(sk-[\w-]{8,}|ghp_\w+|AKIA\w+)/g, '[secret]'));
  if (!lines.length) return null;
  const day = new Date().toISOString().slice(0, 10), next = ((old ? old.trimEnd() + '\n' : '# Kyber project memory\nบทเรียนจากงานก่อน ๆ (Agent อ่านทุกครั้งก่อนเริ่ม · แก้/ลบได้)\n') + `\n## ${day}\n` + lines.join('\n') + '\n');
  const keep = next.length > MEM_MAX ? next.slice(next.indexOf('\n## ', next.length - MEM_MAX)) : next; // เก็บส่วนล่าสุด
  await fs.mkdir(path.join(root, '.kyber'), { recursive: true }); await fs.writeFile(path.join(root, MEM_FILE), keep, 'utf8');
  return lines;
}

// ---------- ที่ปรึกษาโมเดลแรง ----------
// plan: ตอนเริ่มงาน (ครั้งเดียวต่อคำสั่ง) · unstuck: ตอนวนซ้ำ/พังซ้ำ · คืน null เมื่อเรียกไม่ได้ (เช่นแพลนไม่มีโมเดลนี้) งานเดินต่อตามปกติ
function makeAdvisor({ post, model }) {
  if (!post || !model) return null;
  const ask = async (system, user, max = 1200) => { const r = await post({ model, stream: false, max_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }).catch(() => null); if (!r || !r.ok) return null; const d = await r.json().catch(() => ({})); return String(d.choices?.[0]?.message?.content || '').trim() || null; };
  const ctx = messages => messages.filter(m => m.role !== 'system').slice(-14).map(m => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m.tool_calls ?? '')}`.slice(0, 2500)).join('\n').slice(-24000);
  return {
    model,
    plan: (task, map = '') => ask('You are a senior engineer advising a less experienced coding agent. Write a short, concrete plan for the task: 3-8 numbered steps naming the files/functions to look at or change, the checks to run, and the 2-3 most likely pitfalls for THIS task. No code longer than 3 lines. Under 250 words.', `Task:\n${String(task).slice(0, 6000)}${map ? `\n\nProject map:\n${map.slice(0, 3000)}` : ''}`, 900),
    unstuck: messages => ask('You are a senior engineer. A coding agent is stuck (repeating the same action or the same error). From its recent log, say in under 150 words: the likely root cause, and exactly what to do next (which file to read, which command, which different approach).', ctx(messages), 600),
  };
}

// โมเดลประหยัดสำหรับงานเสริม (ย่อบทสนทนา, เขียนบทเรียนโปรเจกต์, ผู้ช่วยค้น): หักลิมิตน้อยสุดแล้วต้นทุนต่ำสุด · ไม่ใช่โมเดลรูป/เสียง · ไม่มีที่ถูกกว่า = null (ใช้โมเดลหลัก)
function pickHelper(models = [], current = '') {
  // ผู้ช่วย (ย่อบทสนทนา / ผู้ช่วยค้น / จดบทเรียน) ต้องเสถียร: ข้ามโมเดลที่ 7 วันล่าสุดตอบสำเร็จ < 95% (เซิร์ฟเวอร์ส่ง ok มากับ /v1/models) และรุ่น uncen
  // (วัดจริง: ตัวถูกสุดคือ Haiku Eco ตอบว่าง 31% · Luna หมดเวลา 37% → ย่อบทสนทนาล้มเงียบ ๆ และผู้ช่วยค้นพัง)
  const ok = models.filter(m => m.id && !/image|embed|video|tts|whisper|audio/i.test(m.id + ' ' + (m.owned_by || '')) && !/uncen/i.test(m.id) && !(m.ok != null && m.ok < 95));
  const cur = ok.find(m => m.id === current), best = ok.sort((a, b) => (a.multiplier ?? 1) - (b.multiplier ?? 1) || (a.cost ?? 0) - (b.cost ?? 0))[0];
  if (!best || best.id === current) return null;
  return !cur || (best.multiplier ?? 1) < (cur.multiplier ?? 1) || ((best.multiplier ?? 1) === (cur.multiplier ?? 1) && (best.cost ?? 0) < (cur.cost ?? 0)) ? best.id : null;
}

// โมเดลที่เก่งพอสำหรับงานที่ต้องคิด (ผู้ตรวจรอบสอง / สรุปตอนย่อบทสนทนา): ตัวหลักเป็นรุ่นเล็ก/Uncen → ใช้ Sonnet Eco หรือ Sol แทน (ต้องอยู่ในแพลนและเสถียร ≥ 95%)
const WEAK_RE = /flash|uncen|lite|nano|mini|luna|haiku/i, STRONG = ['claude-sonnet-5.5-eco', 'chatgpt-6.2-sol', 'claude-opus-5.5-eco'];
function pickStrong(models = [], current = '', always = false) {
  if (!always && current && !WEAK_RE.test(current)) return current;
  const ok = new Map(models.filter(m => m.id && !(m.ok != null && m.ok < 95)).map(m => [m.id, m]));
  return STRONG.find(id => ok.has(id)) || current || null;
}
module.exports = { pickStrong, pickHelper, CODING_SKILL, THREE_SKILL, THREE_RE, ROBLOX_SKILL, ROBLOX_RE, builtinSkills, memoryRead, memoryBlock, memoryLearn, makeAdvisor, MEM_FILE };
