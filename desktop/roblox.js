// Roblox Studio ในตัว (ไม่ต้องตั้ง MCP): แอปเปิดสะพานที่ 127.0.0.1 · ปลั๊กอิน Kyber Studio ถามงาน (long-poll) แล้วส่งผลกลับ
// Agent ได้เครื่องมือ roblox ตัวเดียว (ผลสั้น ประหยัดโทเคนกว่า MCP ทั่วไป) · token สุ่มต่อเครื่อง ฝังในไฟล์ปลั๊กอิน
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const RBX_PORT = 47821, HOLD_MS = 15000, OUT_MAX = 12000;
const OPS = ['info', 'tree', 'find', 'read', 'write', 'edit', 'create', 'set', 'delete', 'run', 'output', 'play', 'focus', 'look'];

const ROBLOX_TOOL = { type: 'function', function: { name: 'roblox', description: 'Work inside the user\'s open Roblox Studio place (through the Kyber Studio plugin). Paths look like "Workspace.Map.Door" or "ServerScriptService.GameLoop". ops: info (place, selection) · tree {path?, depth?} instance tree · find {query?, class?, path?, in_source?} · read {path} script source with line numbers, or an object\'s main properties · write {path, source, class?} create/replace a Script/LocalScript/ModuleScript · edit {path, old, new} replace one exact unique snippet in a script · create {parent, class, name?, props?} new instance · set {path, props} change properties · delete {path} · run {code} run Luau in edit mode (print() output comes back; use it to build/move many parts at once) · output {since?} Output window lines · focus {path} select an object and point the Studio camera at it · look {path?} screenshot of Studio (after focus when path is given) to check how the build looks · play {seconds?} run the game (server scripts) for N seconds and return the Output (errors show as [error]). props use JSON: Vector3/Color3/UDim2 as arrays ([x,y,z], [255,0,0] or "#ff0000", [xs,xo,ys,yo]), enums as names ("Neon"), Parent as a path. Every change can be undone with Ctrl+Z in Studio.', parameters: { type: 'object', properties: {
  op: { type: 'string', enum: OPS }, path: { type: 'string' }, depth: { type: 'number' }, query: { type: 'string' }, class: { type: 'string' }, in_source: { type: 'boolean' },
  source: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' }, parent: { type: 'string' }, name: { type: 'string' }, props: { type: 'object' }, code: { type: 'string' }, since: { type: 'number' }, seconds: { type: 'number' } }, required: ['op'] } } };

function pluginSource(token, port = RBX_PORT) {
  return fs.readFileSync(path.join(__dirname, 'roblox-plugin.lua'), 'utf8').replace('{{PORT}}', String(port)).replace('{{TOKEN}}', token);
}
// โฟลเดอร์ปลั๊กอินของ Studio: Windows %LOCALAPPDATA%\Roblox\Plugins · Mac ~/Documents/Roblox/Plugins
function pluginDir(platform = process.platform, env = process.env, home = os.homedir()) {
  return platform === 'win32' ? path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Roblox', 'Plugins') : path.join(home, 'Documents', 'Roblox', 'Plugins');
}
function installPlugin(token, dir = pluginDir()) {
  fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, 'KyberStudio.lua'); fs.writeFileSync(f, pluginSource(token), 'utf8'); return f;
}

function startBridge({ token, port = RBX_PORT, log = () => {} }) {
  const queue = [], waits = new Map(); let poller = null, seen = 0, place = '', seq = 0;
  const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj == null ? '' : JSON.stringify(obj)); };
  const flush = () => { if (poller && queue.length) { const { res, t } = poller; poller = null; clearTimeout(t); send(res, 200, queue.shift()); } };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith('/kyber-rbx/')) return send(res, 404);
    if (req.headers['x-kyber-token'] !== token) return send(res, 403, { error: 'bad token' }); // ปลั๊กอินจากเครื่องอื่น/ไฟล์เก่า
    seen = Date.now();
    if (u.pathname === '/kyber-rbx/poll') {
      place = (u.searchParams.get('place') || '').slice(0, 100);
      if (poller) { clearTimeout(poller.t); send(poller.res, 204); } // Studio เปิดหลายหน้าต่าง: ใช้ตัวล่าสุด
      if (queue.length) return send(res, 200, queue.shift());
      poller = { res, t: setTimeout(() => { if (poller?.res === res) { poller = null; send(res, 204); } }, HOLD_MS) };
      req.on('close', () => { if (poller?.res === res) { clearTimeout(poller.t); poller = null; } });
      return;
    }
    if (u.pathname === '/kyber-rbx/result' && req.method === 'POST') {
      let b = ''; req.on('data', c => { b += c; if (b.length > 4e6) req.destroy(); });
      req.on('end', () => { let d = {}; try { d = JSON.parse(b); } catch { /* ข้ามผลเสีย */ } const w = waits.get(d.id); if (w) { waits.delete(d.id); clearTimeout(w.t); w.ok(d); } send(res, 200, { ok: true }); });
      return;
    }
    send(res, 404);
  });
  server.on('error', e => log('Roblox: เปิดพอร์ต ' + port + ' ไม่ได้ (' + e.code + ')'));
  server.listen(port, '127.0.0.1');
  const connected = () => Date.now() - seen < HOLD_MS + 8000;
  // ส่งคำสั่งให้ปลั๊กอิน รอผล (play รอนานตามวินาที)
  const call = (op, args = {}, ms = 45000) => new Promise((ok, no) => {
    if (!connected()) return no(new Error('ยังไม่ได้เชื่อม Roblox Studio: เปิด Studio (ที่ติดตั้งปลั๊กอิน Kyber Studio แล้ว) แล้วกดอนุญาตให้ปลั๊กอินต่อ 127.0.0.1'));
    const id = 'r' + (++seq); queue.push({ id, op, args });
    waits.set(id, { ok, t: setTimeout(() => { waits.delete(id); const i = queue.findIndex(q => q.id === id); if (i >= 0) queue.splice(i, 1); no(new Error('Roblox Studio ไม่ตอบ (Studio ค้างหรือปิดปลั๊กอินอยู่)')); }, ms) });
    flush();
  });
  return { call, connected, place: () => place, close: () => new Promise(ok => { if (poller) send(poller.res, 204); server.close(() => ok()); }), port };
}

// เครื่องมือ roblox ของ Agent → คำสั่งปลั๊กอิน → ข้อความสั้น
async function robloxTool(bridge, a = {}) {
  if (!bridge) return 'Error: ระบบ Roblox ยังไม่เปิด (ติดตั้งปลั๊กอินจากเมนู ใช้คอมเครื่องนี้ → Roblox Studio)';
  const op = String(a.op || ''); if (!OPS.includes(op)) return `Error: op ต้องเป็นหนึ่งใน ${OPS.join(', ')}`;
  const args = { ...a }; delete args.op;
  try {
    const r = await bridge.call(op, args, op === 'play' ? (Math.min(+a.seconds || 8, 60) + 30) * 1000 : 45000);
    const d = typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '');
    const out = r.ok ? d : 'Error: ' + d;
    return out.length > OUT_MAX ? out.slice(0, OUT_MAX / 2) + `\n…(ตัดกลาง ${out.length} ตัวอักษร: ใช้ path ที่ลึกขึ้น หรือ find)…\n` + out.slice(-OUT_MAX / 2) : out || '(ไม่มีผล)';
  } catch (e) { return 'Error: ' + e.message; }
}
const newToken = () => crypto.randomBytes(18).toString('base64url');
const ROBLOX_RE = /roblox|โรบล็อก|โรบลอก|\bluau\b|\brbx|studio\s*(game|place)/i;

module.exports = { RBX_PORT, ROBLOX_TOOL, ROBLOX_RE, startBridge, robloxTool, pluginSource, pluginDir, installPlugin, newToken };
