// สกิลในตัวของหน้า Code บนเว็บ (ฉบับเว็บของ desktop/skills.js: ไม่มีเครื่องมือ check_page/notes ในหน้า Code)
// วินัยเขียนโค้ดใส่ทุกงานโค้ด · Three.js ใส่เมื่อคำสั่งเกี่ยวกับ 3D · ความจำโปรเจกต์อ่านจากไฟล์ .kyber/memory.md ในโปรเจกต์
export const CODING_SKILL_WEB = `## Skill: coding discipline
- Read the files you will change (and their callers) before editing; never guess their content.
- Work in small steps; after each change make sure it still runs (preview / run button / tests). Do not stack unverified changes.
- Read errors fully (first line, file, line number) and fix the root cause. If the same fix failed twice, re-read the code and change approach.
- Keep names, imports, exports and paths consistent (case-sensitive); search for every use when you rename.
- Never invent library APIs; if unsure, check the docs or the library code first.
- Big files: change them with SEARCH/REPLACE edits instead of rewriting the whole file.
- Before saying "done", re-check every part of the request and mention how it was verified.`;

export const THREE_SKILL_WEB = `## Skill: Three.js 3D scenes and animation
- Load three.js as ES modules with an import map on ONE pinned version:
  <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
  then <script type="module"> import * as THREE from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; </script>
- Always renders: WebGLRenderer({ antialias: true }), setPixelRatio(Math.min(devicePixelRatio, 2)), setSize(innerWidth, innerHeight), outputColorSpace = SRGBColorSpace; PerspectiveCamera(50, aspect, 0.1, 1000) placed to SEE the object (position.set(3,2,5); lookAt(0,0,0)); HemisphereLight + DirectionalLight (MeshStandardMaterial is black without light); a background color; renderer.setAnimationLoop with a THREE.Clock delta; resize handler (aspect, updateProjectionMatrix, setSize).
- Animation: move/rotate/scale with delta time; models with clips use AnimationMixer (mixer.clipAction(gltf.animations[0]).play(); mixer.update(delta)).
- Models: GLTFLoader from 'three/addons/loaders/GLTFLoader.js'; center and scale with Box3().setFromObject(model); show loading and catch errors. Export .glb with GLTFExporter ({ binary: true }) and download the ArrayBuffer as a Blob (model/gltf-binary).
- Performance: reuse geometries/materials, InstancedMesh for many copies, few shadow lights, dispose() removed objects. CSS: body{margin:0;overflow:hidden} canvas{display:block;touch-action:none}.
- If the scene is blank: check camera position/lookAt, lights, object scale and that the render loop runs; check the browser console for import errors.`;

export const THREE_RE = /three\.?js|\bthree\b.*\b(scene|mesh)\b|webgl|\b3d\b|\.glb\b|\.gltf\b|gltf|โมเดล\s*3|สามมิติ|แอนิเมชัน\s*3|อนิเมชัน\s*3/i;
export const MEM_PATH = '.kyber/memory.md';
export const webSkills = (text = '', hasThree = false) => '\n\n' + CODING_SKILL_WEB + (THREE_RE.test(text) || hasThree ? '\n\n' + THREE_SKILL_WEB : '');
export const memoryBlockWeb = mem => mem?.trim() ? `\n\nProject memory (${MEM_PATH}: lessons from earlier work in this project; follow it unless the files now say otherwise):\n${mem.trim().slice(-6000)}` : '';
