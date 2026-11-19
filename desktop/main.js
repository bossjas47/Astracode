// AstraCode Desktop: เปิดเว็บ AstraCode ตัวจริงในหน้าต่างแอป + สะพานให้เว็บทำงานกับไฟล์ คำสั่ง และ MCP ในเครื่อง
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, Tray, nativeImage, clipboard, desktopCapturer, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { localTool, runCmd, isDanger, isServer, portOf } = require('./tools');
const { execFile } = require('child_process');
const { scanFolder, writeRel, removeRel, renameRel, grepRel, editRel } = require('./localfs');
const { startMcp } = require('./mcp');
const { runAgent } = require('./agent');
const { OFFICE_TOOLS, makeDocument, readDocument } = require('./office');
const { AGENT_TOOLS, READ_ONLY, SUB_TOOLS, Workspace, agentSystem, projectRules, projectHooks, projectCommands, cleanPlugin } = require('./agenttools');

const SITE = 'https://astracode.panderx.xyz';
let settings, mcp = null;
const setFile = () => path.join(app.getPath('userData'), 'settings.json');
const load = () => { try { return JSON.parse(fs.readFileSync(setFile(), 'utf8')); } catch { return {}; } };
const save = () => fs.writeFileSync(setFile(), JSON.stringify(settings, null, 2));

// หน้าต่างแอป = เว็บ AstraCode ตัวจริง (แชต สตรีม ประวัติ ลิมิต เหมือนเว็บทุกอย่าง อัปเดตตามเว็บเอง)
const AUTH_HOSTS = /^(astracode\.panderx\.xyz|accounts\.google\.com|[\w-]+\.firebaseapp\.com|access\.line\.me|challenges\.cloudflare\.com)$/; // หน้าเว็บ + หน้าล็อกอินที่ต้องเปิดในหน้าต่างแอป
let web, tray = null, quitting = false;
// หน้าออฟไลน์: เน็ตหลุด/เว็บล่ม แทนจอขาว ลองใหม่เองทุก 10 วินาที
const OFFLINE = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#ddd;font:15px system-ui,sans-serif;text-align:center"><div><h2 style="margin:0 0 8px">ต่ออินเทอร์เน็ตไม่ได้</h2><p style="color:#999;margin:0 0 16px">เช็กเน็ตแล้วลองใหม่ · แอปจะลองเองทุก 10 วินาที</p><button onclick="location.href='${SITE}/chat'" style="padding:10px 18px;border-radius:10px;border:0;background:#c25b3a;color:#fff;font:inherit;cursor:pointer">ลองใหม่</button><script>setTimeout(()=>location.href='${SITE}/chat',10000)</script></div>`);
function openWeb() {
  const b = settings.bounds || {};
  web = new BrowserWindow({ width: b.width || 1200, height: b.height || 820, x: b.x, y: b.y, title: 'AstraCode', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#111111', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload-web.js'), partition: 'persist:astra', contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  if (b.max) web.maximize();
  const keep = () => { if (!web.isMinimized()) settings.bounds = { ...(web.isMaximized() ? settings.bounds : web.getNormalBounds()), max: web.isMaximized() }; };
  web.on('resize', keep); web.on('move', keep);
  web.on('close', e => { keep(); save(); if (!quitting && tray) { e.preventDefault(); web.hide(); if (!settings.trayTold) { settings.trayTold = true; save(); tray.displayBalloon?.({ title: 'AstraCode ยังทำงานอยู่', content: 'แอปย่ออยู่ที่ถาดมุมขวาล่าง คลิกขวาที่ไอคอน → ออก เพื่อปิดจริง' }); } } });
  const inApp = u => { try { const x = new URL(u); return x.protocol === 'https:' && AUTH_HOSTS.test(x.hostname); } catch { return false; } };
  web.webContents.on('will-navigate', (e, u) => { if (!inApp(u) && !u.startsWith('data:text/html')) { e.preventDefault(); if (/^https?:\/\//.test(u)) shell.openExternal(u); } });
  web.webContents.setWindowOpenHandler(({ url }) => { if (inApp(url)) return { action: 'allow' }; if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; }); // ป๊อปอัปล็อกอิน Google ให้เปิดในแอป
  web.webContents.on('did-fail-load', (e, code, desc, url, main) => { if (main && code !== -3 && !url.startsWith('data:')) web.loadURL(OFFLINE); });
  // คลิกขวา: ตัด/คัดลอก/วาง (Electron ไม่มีเมนูนี้ให้เอง)
  web.webContents.on('context-menu', (e, p) => {
    const t = [];
    if (p.linkURL && /^https?:/.test(p.linkURL)) t.push({ label: 'เปิดลิงก์ในเบราว์เซอร์', click: () => shell.openExternal(p.linkURL) }, { label: 'คัดลอกลิงก์', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.mediaType === 'image' && p.srcURL) t.push({ label: 'คัดลอกรูป', click: () => web.webContents.copyImageAt(p.x, p.y) }, { type: 'separator' });
    if (p.isEditable) t.push({ role: 'undo', label: 'ย้อนกลับ' }, { role: 'redo', label: 'ทำซ้ำ' }, { type: 'separator' }, { role: 'cut', label: 'ตัด', enabled: p.editFlags.canCut }, { role: 'copy', label: 'คัดลอก', enabled: p.editFlags.canCopy }, { role: 'paste', label: 'วาง', enabled: p.editFlags.canPaste }, { role: 'selectAll', label: 'เลือกทั้งหมด' });
    else if (p.selectionText) t.push({ role: 'copy', label: 'คัดลอก' });
    else t.push({ label: 'ย้อนกลับ', enabled: web.webContents.canGoBack(), click: () => web.webContents.goBack() }, { role: 'reload', label: 'รีเฟรช' });
    Menu.buildFromTemplate(t).popup({ window: web });
  });
  web.loadURL(SITE + (settings.openPath || '/chat')); settings.openPath = null;
}
// ปุ่มลัด (เมนูซ่อนอยู่ แต่ปุ่มลัดยังทำงาน): Ctrl+R รีเฟรช · Ctrl+F ค้นในหน้า · Ctrl +/-/0 ซูม · F11 เต็มจอ
function appMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'แก้ไข', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { label: 'ค้นหาในหน้า', accelerator: 'CmdOrCtrl+F', click: () => web?.webContents.send('desk:find') }] },
    { label: 'มุมมอง', submenu: [{ role: 'reload', label: 'รีเฟรช' }, { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' }, { type: 'separator' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus', visible: false }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'ย้อนกลับ', accelerator: 'Alt+Left', click: () => web?.webContents.goBack() }] },
    { label: 'หน้าต่าง', submenu: [{ role: 'minimize' }, { label: 'ออกจากแอป', accelerator: 'CmdOrCtrl+Q', click: quit }] },
  ]));
}
ipcMain.on('desk:findq', (e, q) => { if (e.sender !== web?.webContents) return; if (q?.text) web.webContents.findInPage(String(q.text), { findNext: !!q.next, forward: !q.back }); else web.webContents.stopFindInPage('clearSelection'); });
const quit = () => { quitting = true; app.quit(); };
const show = () => { if (!web) return; if (web.isMinimized()) web.restore(); web.show(); web.focus(); };
// ไอคอนที่ถาด: ปิดหน้าต่างแล้วยังทำงานต่อ (เซิร์ฟเวอร์ dev / งานยาว) · เปิดพร้อม Windows ได้
function makeTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }));
    const menu = () => Menu.buildFromTemplate([{ label: 'เปิด AstraCode', click: show }, { label: 'เปิดพร้อมเครื่อง', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) }, { type: 'separator' }, { label: 'หยุดให้ AI คุมเมาส์/คีย์บอร์ด', click: () => { screenOk = false; } }, { label: 'ออกจากแอป', click: quit }]);
    tray.setToolTip('AstraCode'); tray.setContextMenu(menu()); tray.on('click', show); tray.on('right-click', () => tray.setContextMenu(menu()));
  } catch { tray = null; } // บาง Linux ไม่มีถาด: ปิดหน้าต่าง = ออกจากแอป
}
// ลิงก์ astracode://open?path=/code?p=12 จากเว็บ/อีเมล เปิดแอปที่หน้านั้น (ใช้ได้เฉพาะพาธในเว็บเรา)
const deepPath = argv => { const u = argv.find(a => /^astracode:\/\//i.test(a)); if (!u) return null; try { const p = new URL(u).searchParams.get('path') || '/chat'; return /^\/(?!\/)[\w\-./?=&%]*$/.test(p) ? p : '/chat'; } catch { return '/chat'; } };

// ทุกช่องทางที่หน้าเว็บเรียกได้ต้องมาจาก astracode.panderx.xyz เท่านั้น (หน้าล็อกอิน Google/LINE ที่เปิดในหน้าต่างเดียวกันเรียกไม่ได้)
const fromSite = e => { try { return new URL(e.senderFrame?.url || '').origin === SITE; } catch { return false; } };
const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromSite(e)) throw new Error('ไม่อนุญาต'); return fn(e, ...a); });

// โฟลเดอร์ในเครื่อง: เว็บอ้างถึงด้วยชื่อช่อง (p:<id โปรเจกต์> หรือ chat) ไม่เคยส่งพาธเต็มมาเอง · ผู้ใช้เลือกโฟลเดอร์ผ่านหน้าต่างของ Windows เท่านั้น
const slot = k => { if (!/^(p:\d{1,12}|chat)$/.test(String(k))) throw new Error('ช่องโฟลเดอร์ไม่ถูกต้อง'); return String(k); };
const rootOf = k => { const r = (settings.links || {})[slot(k)]; if (!r || !fs.existsSync(r)) throw new Error('ยังไม่ได้เชื่อมโฟลเดอร์ในเครื่อง หรือโฟลเดอร์ถูกย้าย/ลบไปแล้ว'); return r; };
const info = r => ({ name: path.basename(r), path: r, auto: !!settings.autoRun?.[r] });
h('desk:link', async (_, k) => {
  const r = await dialog.showOpenDialog(web, { title: 'เลือกโฟลเดอร์ที่ให้ AstraCode ทำงาน', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  if (path.dirname(dir) === dir || dir === app.getPath('home')) { await dialog.showMessageBox(web, { type: 'warning', message: 'เลือกทั้งไดรฟ์หรือโฟลเดอร์ผู้ใช้ทั้งหมดไม่ได้', detail: 'สร้างหรือเลือกโฟลเดอร์ของงานนี้โดยเฉพาะ' }); return null; }
  settings.links = { ...settings.links, [slot(k)]: dir }; save(); return info(dir);
});
h('desk:linked', (_, k) => { const r = (settings.links || {})[slot(k)]; return r && fs.existsSync(r) ? info(r) : null; });
h('desk:autoOff', (_, k) => { const r = (settings.links || {})[slot(k)]; if (r && settings.autoRun) { delete settings.autoRun[r]; save(); } return true; }); // ปิดได้จากหน้าเว็บ (ปลอดภัยขึ้นเท่านั้น) · เปิดได้จากหน้าต่าง Windows เท่านั้น
h('desk:unlink', (_, k) => { if (settings.links) { delete settings.links[slot(k)]; save(); } return true; });
h('desk:scan', (_, k) => scanFolder(rootOf(k)));
h('desk:write', async (_, k, files) => { const r = rootOf(k); let n = 0; for (const f of [].concat(files).slice(0, 300)) if (await writeRel(r, f.path, f.content)) n++; return n; });
h('desk:remove', (_, k, p) => removeRel(rootOf(k), p));
h('desk:rename', (_, k, a, b) => renameRel(rootOf(k), a, b));
h('desk:read', (_, k, p) => localTool(rootOf(k), 'read_file', { path: p }));
h('desk:list', (_, k, p) => localTool(rootOf(k), 'list_dir', { path: p || '.' }));
h('desk:open', (_, k) => shell.openPath(rootOf(k)));

// รันคำสั่ง: ถามด้วยหน้าต่างของ Windows (หน้าเว็บกดแทนไม่ได้) · เลือก "รันอัตโนมัติ" ได้ต่อโฟลเดอร์ (จำถาวร) แต่คำสั่งอันตรายยังถามทุกครั้ง
const jobs = new Map();
const ask = async (r, cmd, auto) => (await dialog.showMessageBox(web, { type: auto ? 'warning' : 'question', title: 'อนุญาตให้รันคำสั่ง?', message: auto ? 'คำสั่งนี้อาจลบหรือเปลี่ยนแปลงข้อมูล ตรวจก่อนอนุญาต' : 'AstraCode ขอรันคำสั่งนี้ในเครื่องของคุณ', detail: `โฟลเดอร์: ${r}\n\n${cmd.slice(0, 1500)}`, buttons: auto ? ['อนุญาตครั้งนี้', 'ไม่อนุญาต'] : ['อนุญาต', 'รันอัตโนมัติในโฟลเดอร์นี้ (ยกเว้นคำสั่งอันตราย)', 'ไม่อนุญาต'], defaultId: auto ? 1 : 0, cancelId: auto ? 1 : 2, noLink: true })).response;
// ขออนุญาตรันคำสั่ง → null = อนุญาต, ไม่งั้นคืนผลแบบถูกปฏิเสธ
async function allow(r, cmd) {
  const auto = !!settings.autoRun?.[r];
  if (auto && !isDanger(cmd)) return null;
  const a = await ask(r, cmd, auto);
  if (auto ? a === 1 : a === 2) return { code: 1, stdout: '', stderr: 'ผู้ใช้ไม่อนุญาตให้รันคำสั่งนี้', denied: true };
  if (!auto && a === 1) { settings.autoRun = { ...settings.autoRun, [r]: true }; save(); }
  return null;
}
h('desk:run', async (e, k, cmd, id) => {
  const r = rootOf(k); cmd = String(cmd || '').trim(); if (!cmd) throw new Error('คำสั่งว่าง');
  const no = await allow(r, cmd); if (no) return no;
  const ac = new AbortController(); jobs.set(String(id), ac);
  try { return await runCmd(r, cmd, { signal: ac.signal, onOut: (t, s) => { if (!e.sender.isDestroyed()) e.sender.send('desk:out', { id, [t]: s }); } }); }
  finally { jobs.delete(String(id)); }
});
// dev server: รันค้างเบื้องหลัง (ช่องละ 1 ตัว) ส่งผลลัพธ์และพอร์ตให้หน้าเว็บ · ปิดแอปแล้วหยุดให้เอง
const servers = new Map();
h('desk:isServer', (_, cmd) => isServer(cmd));
h('desk:serve', async (e, k, cmd) => {
  const key = slot(k), r = rootOf(k); cmd = String(cmd || '').trim(); if (!cmd) throw new Error('คำสั่งว่าง');
  const no = await allow(r, cmd); if (no) return no;
  servers.get(key)?.kill();
  const ac = new AbortController(), sv = { cmd, port: null, done: false, kill: () => ac.abort() }; servers.set(key, sv);
  const tell = d => { if (!e.sender.isDestroyed()) e.sender.send('desk:serveOut', { k: key, ...d }); };
  runCmd(r, cmd, { timeout: 0, signal: ac.signal, onOut: (t, s) => { tell({ [t]: s }); if (!sv.port && (sv.port = portOf(s))) tell({ port: sv.port }); } })
    .then(x => { sv.done = true; if (servers.get(key) === sv) servers.delete(key); tell({ exit: x.code }); });
  for (let i = 0; i < 40 && !sv.port && !sv.done; i++) await new Promise(ok => setTimeout(ok, 500)); // รอพอร์ตสูงสุด 20 วินาที
  return { code: sv.done ? 1 : 0, port: sv.port, running: !sv.done };
});
h('desk:serveStop', (_, k) => { servers.get(slot(k))?.kill(); return true; });
h('desk:serveInfo', (_, k) => { const sv = servers.get(slot(k)); return sv ? { cmd: sv.cmd, port: sv.port } : null; });
// พรีวิวเว็บที่รันในเครื่อง: หน้าต่างแยก เปิดได้เฉพาะ localhost (ไม่มีสะพานเข้าเครื่อง)
h('desk:preview', (_, port) => {
  port = +port; if (!(port > 0 && port < 65536)) throw new Error('พอร์ตไม่ถูกต้อง');
  const w = new BrowserWindow({ width: 1100, height: 760, title: 'พรีวิว localhost:' + port, autoHideMenuBar: true, webPreferences: { partition: 'preview', contextIsolation: true, sandbox: true } });
  const local = u => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
  w.webContents.on('will-navigate', (ev, u) => { if (!local(u)) { ev.preventDefault(); if (/^https?:/.test(u)) shell.openExternal(u); } });
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.loadURL('http://localhost:' + port); return true;
});
// ไฟล์ในโฟลเดอร์เปลี่ยน (แก้ด้วยโปรแกรมอื่น / คำสั่ง build) → บอกหน้าเว็บให้ซิงก์ทันที
const watchers = new Map();
h('desk:watch', (e, k) => {
  const key = slot(k), r = rootOf(k); watchers.get(key)?.close(); let t;
  try {
    const w = fs.watch(r, { recursive: true }, (ev, f) => { if (f && /(^|[\\/])(node_modules|\.git|dist|build|out|\.next|coverage|__pycache__)([\\/]|$)/.test(f)) return; clearTimeout(t); t = setTimeout(() => { if (!e.sender.isDestroyed()) e.sender.send('desk:changed', key); }, 800); });
    w.on('error', () => watchers.delete(key)); watchers.set(key, w); return true;
  } catch { return false; } // บางระบบไม่รองรับ: ยังซิงก์ตอนกลับมาที่หน้าต่างได้
});
h('desk:unwatch', (_, k) => { watchers.get(slot(k))?.close(); watchers.delete(slot(k)); return true; });
h('desk:grep', (_, k, q) => grepRel(rootOf(k), q));
h('desk:edit', (_, k, p, edits) => editRel(rootOf(k), p, Array.isArray(edits) ? edits.slice(0, 20).map(x => ({ search: String(x.search ?? ''), replace: String(x.replace ?? '') })) : []));

// ให้ AI ดูหน้าจอและคุมเมาส์/คีย์บอร์ด (computer use): เปิดได้ด้วยหน้าต่างยืนยันของ Windows เท่านั้น จนปิดแอป · หยุดทันที: Ctrl+Alt+Esc หรือเมนูที่ถาด
let screenOk = false;
h('desk:screenOn', async () => {
  if (process.platform !== 'win32') throw new Error('คุมเมาส์/คีย์บอร์ดใช้ได้เฉพาะ Windows ตอนนี้');
  const a = await dialog.showMessageBox(web, { type: 'warning', title: 'ให้ AI ควบคุมคอมพิวเตอร์?', message: 'AI จะเห็นหน้าจอ และคลิก/พิมพ์แทนคุณได้ จนกว่าจะปิดแอป', detail: 'ระหว่างนั้นอย่าเปิดหน้าธนาคาร รหัสผ่าน หรือข้อมูลลับไว้บนจอ\nหยุดทันที: กด Ctrl+Alt+Esc หรือคลิกขวาไอคอนที่ถาด → หยุดให้ AI คุมเมาส์/คีย์บอร์ด', buttons: ['อนุญาต', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
  screenOk = a.response === 0; return screenOk;
});
h('desk:screenOff', () => { screenOk = false; return true; });
h('desk:screenState', () => screenOk);
const ps = script => new Promise((ok, no) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout: 20e3 }, (e, so, se) => e ? no(new Error((se || e.message).slice(0, 300))) : ok(so)));
const U32 = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class U{[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr e);}';[U]::SetProcessDPIAware()|Out-Null;`;
const sendKeys = s => String(s).replace(/[+^%~(){}[\]]/g, c => '{' + c + '}');
const KEYMAP = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ', f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f11: '{F11}', f12: '{F12}' };
const keyCombo = k => { const parts = String(k).toLowerCase().split('+').map(x => x.trim()), key = parts.pop(); const mod = parts.map(m => ({ ctrl: '^', control: '^', shift: '+', alt: '%' })[m] || '').join(''); const base = KEYMAP[key] || (key.length === 1 ? sendKeys(key) : null); if (!base) throw new Error('ไม่รู้จักปุ่ม ' + k); return mod + (mod && base.length > 1 && !base.startsWith('{') ? '(' + base + ')' : base); };
async function shot() {
  const d = screen.getPrimaryDisplay(), w = Math.min(1280, d.size.width), h = Math.round(d.size.height * w / d.size.width);
  const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } }))[0]; if (!src) throw new Error('จับภาพหน้าจอไม่ได้');
  return { image: 'data:image/jpeg;base64,' + src.thumbnail.toJPEG(70).toString('base64'), w, h, sx: d.size.width * d.scaleFactor / w, sy: d.size.height * d.scaleFactor / h };
}
// ทำทีละชุด: ย่อหน้าต่างแอปไม่ให้บังจอ → ทำตามลำดับ → รอจอนิ่ง → จับภาพส่งกลับให้ AI → เปิดหน้าต่างแอปคืน
h('desk:screenBatch', (_, acts) => screenRun(acts));
async function screenRun(acts) {
  if (!screenOk) throw new Error('ยังไม่ได้อนุญาตให้ AI ควบคุมคอมพิวเตอร์ (หรือถูกหยุดแล้ว)');
  const log = []; let s = await shot(); const minimized = web.isMinimized(); web.minimize(); await new Promise(ok => setTimeout(ok, 400));
  try {
    for (const a of [].concat(acts).slice(0, 10)) {
      if (!screenOk) { log.push('หยุดแล้ว (ผู้ใช้กดหยุด)'); break; }
      const [k, ...r] = a, X = n => Math.round(+r[n] * s.sx), Y = n => Math.round(+r[n] * s.sy);
      if (['CLICK', 'DOUBLE', 'RIGHT', 'SCROLL'].includes(k) && !(isFinite(r[0]) && isFinite(r[1]))) { log.push(`${k}: ต้องมีพิกัด x y`); continue; }
      if (k === 'CLICK') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`);
      else if (k === 'DOUBLE') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;1..2|%{[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -m 60}`);
      else if (k === 'RIGHT') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(16,0,0,0,[UIntPtr]::Zero)`);
      else if (k === 'SCROLL') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(0x800,0,0,${-Math.round((+r[2] || 3) * 120)},[UIntPtr]::Zero)`);
      else if (k === 'TYPE') await ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(sendKeys(r.join(' ')), 'utf8').toString('base64')}')))`);
      else if (k === 'KEY') await ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${keyCombo(r.join('')).replace(/'/g, "''")}')`);
      else if (k === 'WAIT') await new Promise(ok => setTimeout(ok, Math.min(10e3, +r[0] || 1000)));
      else if (k !== 'SCREEN') { log.push('ไม่รู้จักคำสั่ง ' + k); continue; }
      log.push(`${k} ${r.join(' ')}`.trim() + ' ✓'); await new Promise(ok => setTimeout(ok, 250));
    }
  } catch (x) { log.push('Error: ' + x.message); }
  await new Promise(ok => setTimeout(ok, 600)); s = await shot();
  if (!minimized) { web.restore(); }
  return { image: s.image, w: s.w, h: s.h, log };
}
// เครื่องมือ computer ของ Agent: ใช้ได้เมื่อผู้ใช้เปิด "ให้ AI ดูหน้าจอและคุมเมาส์" (ยืนยันด้วยหน้าต่าง Windows) · พิกัด = พิกเซลของภาพหน้าจอล่าสุด
const COMPUTER_TOOL = { type: 'function', function: { name: 'computer', description: 'See and control the whole screen of the user\'s computer (any program: Excel, Blender, browsers, games). Give a list of actions; a fresh screenshot comes back after them. Start with [{"action":"screenshot"}]. Coordinates are pixels of the latest screenshot. Never type passwords or payment details, and never send messages or buy things unless the user asked in this task.', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { action: { type: 'string', enum: ['screenshot', 'click', 'double_click', 'right_click', 'type', 'key', 'scroll', 'wait'] }, x: { type: 'number' }, y: { type: 'number' }, text: { type: 'string', description: 'for type' }, keys: { type: 'string', description: 'for key, e.g. ctrl+s, enter, alt+tab' }, amount: { type: 'number', description: 'scroll notches, negative = up' }, ms: { type: 'number' } }, required: ['action'] } } }, required: ['actions'] } } };
async function computerTool(a) {
  const map = { screenshot: 'SCREEN', click: 'CLICK', double_click: 'DOUBLE', right_click: 'RIGHT', type: 'TYPE', key: 'KEY', scroll: 'SCROLL', wait: 'WAIT' };
  const acts = (Array.isArray(a.actions) ? a.actions : []).slice(0, 10).map(x => { const k = map[x?.action]; if (!k) return ['?']; if (k === 'TYPE') return [k, String(x.text ?? '')]; if (k === 'KEY') return [k, String(x.keys ?? '')]; if (k === 'WAIT') return [k, x.ms ?? 1000]; if (k === 'SCROLL') return [k, x.x, x.y, x.amount ?? 3]; return [k, x.x, x.y]; });
  const r = await screenRun(acts.length ? acts : [['SCREEN']]);
  return { text: `หน้าจอ ${r.w}x${r.h} พิกเซล (ภาพล่าสุดแนบด้านล่าง)\n${r.log.join('\n')}`, images: [r.image] };
}
h('desk:kill', (_, id) => { jobs.get(String(id))?.abort(); return true; });

// MCP ในเครื่อง (Blender ฯลฯ): หน้าเว็บตั้งค่าได้ แต่ต้องยืนยันด้วยหน้าต่างของ Windows เพราะค่า MCP คือคำสั่งที่จะรันในเครื่อง
const mcpLog = [];
// MCP ที่ใช้จริง = ที่ผู้ใช้ตั้งเอง + ของปลั๊กอินที่ติดตั้ง (ชื่อ server นำหน้าด้วยชื่อปลั๊กอิน)
const mcpConfig = () => { let own = {}; try { own = JSON.parse(settings.mcp || '{}').mcpServers || {}; } catch { /* ค่าเสีย */ } const all = { ...own }; for (const p of Object.values(settings.plugins || {})) for (const [n, c] of Object.entries(p.mcpServers || {})) all[`${p.name}-${n}`] = { ...c, env: { ...(c.env || {}), ...(p.envValues || {}) } }; return { mcpServers: all }; };
const hasMcp = () => Object.keys(mcpConfig().mcpServers).length > 0;
const mcpUp = async () => mcp ||= await startMcp(mcpConfig(), m => { mcpLog.push(m); mcpLog.splice(0, mcpLog.length - 20); });
h('desk:mcpGet', () => ({ config: settings.mcp || '', log: mcpLog }));
h('desk:mcpSet', async (_, text) => {
  const cfg = JSON.parse(text || '{}'), list = Object.entries(cfg.mcpServers || {}).map(([n, c]) => `• ${n}: ${c.command} ${(c.args || []).join(' ')}`).join('\n');
  if (list) { const a = await dialog.showMessageBox(web, { type: 'warning', title: 'ยืนยันการตั้งค่า MCP', message: 'แอปจะรันโปรแกรมเหล่านี้ในเครื่องของคุณ', detail: list.slice(0, 2000), buttons: ['บันทึก', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true }); if (a.response !== 0) return false; }
  settings.mcp = text ? JSON.stringify(cfg, null, 2) : ''; save(); await mcp?.close(); mcp = null; mcpLog.length = 0; return true;
});
h('desk:mcpTools', async () => hasMcp() ? (await mcpUp()).tools.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) : []);
h('desk:mcpCall', async (_, name, args) => (await mcpUp()).call(String(name), args && typeof args === 'object' ? args : {}));

// ---------- Agent แบบ Claude Code: วนทำงานในเครื่องนี้ด้วย tool calling ผ่าน /v1 (หักลิมิต/Wallet ตามจริง) ----------
// key: หน้าเว็บที่ล็อกอินอยู่สร้าง API key ชื่อ "Desktop Agent" ส่งมาครั้งแรก
// โหมด: plan = วางแผนอย่างเดียว (อ่านได้ แก้/รันไม่ได้) · ask = ถามทุกครั้ง · edits = แก้ไฟล์เอง ถามก่อนรันคำสั่ง · auto = ทำเองทั้งหมด (คำสั่งอันตราย/นอกโฟลเดอร์ยังถาม)
const agents = new Map(); // sid → { messages, ws, ac, mode, okMode, inbox, cost, remote }
const MODES = ['plan', 'ask', 'edits', 'auto', 'yolo']; // yolo = ไม่ถามอะไรเลย (ผู้ใช้ยืนยันในกล่องเตือนก่อนเปิด)
const agentFile = sid => path.join(app.getPath('userData'), 'agents', sid.replace(/[^\w-]/g, '_') + '.json');
const agentSave = a => { try { fs.mkdirSync(path.dirname(agentFile(a.sid)), { recursive: true }); fs.writeFileSync(agentFile(a.sid), JSON.stringify({ root: a.ws.root, messages: a.messages.slice(-400) })); } catch { /* ดิสก์เต็ม/สิทธิ์: ยังทำงานต่อได้ แค่ไม่จำหลังปิดแอป */ } };
const agentLoad = sid => { try { return JSON.parse(fs.readFileSync(agentFile(sid), 'utf8')); } catch { return null; } };
h('desk:agentNeedKey', () => !settings.key);
h('desk:agentSetKey', (_, key) => { if (!/^sk-astra-[0-9a-f]+$/.test(String(key))) return false; settings.key = String(key); save(); return true; });
h('desk:agentStop', (_, sid) => { const a = agents.get(String(sid)); a?.ac?.abort(); a?.ws?.stopAll(); return true; });
h('desk:agentSteer', (_, sid, text) => { const a = agents.get(String(sid)); if (!a?.ac) return false; a.inbox.push('[ผู้ใช้พิมพ์แทรกระหว่างทำงาน] ' + String(text).slice(0, 20000)); return true; });
h('desk:agentUndo', async (_, sid, step) => { const a = agents.get(String(sid)); return a?.ws ? await (step != null ? a.ws.undoTo(+step) : a.ws.undo()) : []; });
h('desk:agentAnswer', (_, sid, id, text) => { const a = agents.get(String(sid)), f = a?.asks?.get(String(id)); if (!f) return false; a.asks.delete(String(id)); f(String(text ?? '').slice(0, 4000)); return true; });
// เปิดไฟล์ผลลัพธ์ที่ Agent ทำ (เฉพาะในโฟลเดอร์งาน) ด้วยโปรแกรมของเครื่อง
h('desk:agentOpen', async (_, k, p) => { const r = rootOf(k || 'chat'), f = path.resolve(r, String(p || '.')); if (f !== r && !f.startsWith(r + path.sep)) throw new Error('ไฟล์อยู่นอกโฟลเดอร์งาน'); const e = await shell.openPath(f); if (e) throw new Error(e); return true; });
h('desk:agentReset', (_, sid) => { const a = agents.get(String(sid)); a?.ws?.stopAll(); agents.delete(String(sid)); try { fs.rmSync(agentFile(String(sid)), { force: true }); } catch { /* ไม่มีไฟล์ */ } return true; });
h('desk:agentCommands', async (_, k) => [...await projectCommands(rootOf(k || 'chat')), ...Object.values(settings.plugins || {}).flatMap(p => p.commands || [])]);
// ---------- ปลั๊กอิน (แบบ Claude Code): ชุด MCP server + คำสั่งลัด + กติกา + hook ติดตั้งจากแคตตาล็อกของเว็บหรือลิงก์ manifest ----------
h('desk:plugins', () => Object.values(settings.plugins || {}).map(p => ({ name: p.name, title: p.title, description: p.description, version: p.version, mcp: Object.keys(p.mcpServers), commands: p.commands.map(c => c.name), hasRules: !!p.rules, hook: p.hooks?.after_edit || null })));
h('desk:pluginInstall', async (_, src, envValues = {}) => {
  let m = src;
  if (typeof src === 'string') { if (!/^https:\/\//.test(src)) throw new Error('ต้องเป็นลิงก์ https ของไฟล์ manifest (.json)'); const r = await fetch(src, { signal: AbortSignal.timeout(15e3) }); if (!r.ok) throw new Error('โหลด manifest ไม่ได้ HTTP ' + r.status); m = await r.json(); }
  const p = cleanPlugin(m);
  const what = [...Object.entries(p.mcpServers).map(([n, c]) => `• MCP ${n}: ${c.command} ${c.args.join(' ')}`), p.hooks ? `• รันหลังแก้ไฟล์ทุกครั้ง: ${p.hooks.after_edit}` : '', p.commands.length ? `• คำสั่งลัด: ${p.commands.map(c => '/' + c.name).join(' ')}` : '', p.rules ? '• เพิ่มกติกาให้ Agent' : ''].filter(Boolean).join('\n');
  const r = await dialog.showMessageBox(web, { type: Object.keys(p.mcpServers).length || p.hooks ? 'warning' : 'question', title: 'ติดตั้งปลั๊กอิน', message: `ติดตั้ง "${p.title}"?`, detail: `${p.description}\n\n${what}\n\nโปรแกรมด้านบนจะรันในเครื่องคุณเมื่อ Agent ทำงาน ติดตั้งเฉพาะปลั๊กอินที่เชื่อถือได้`, buttons: ['ติดตั้ง', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
  if (r.response !== 0) return false;
  p.envValues = Object.fromEntries(p.envAsk.map(k => [k, String(envValues?.[k] ?? '').slice(0, 500)]));
  settings.plugins = { ...settings.plugins, [p.name]: p }; save(); await mcp?.close(); mcp = null; return true;
});
h('desk:pluginRemove', async (_, name) => { if (settings.plugins?.[name]) { delete settings.plugins[name]; save(); await mcp?.close(); mcp = null; } return true; });
// Git ของโฟลเดอร์งาน: ดูสถานะ / diff / commit (ปุ่มในแชต)
h('desk:agentGit', async (_, k, action, msg) => {
  const r = rootOf(k || 'chat'), q = s => process.platform === 'win32' ? '"' + s.replace(/"/g, '""') + '"' : "'" + s.replace(/'/g, "'\\''") + "'";
  const cmd = action === 'diff' ? 'git diff --stat && git diff' : action === 'commit' ? `git add -A && git commit -m ${q(String(msg || 'AstraCode Agent').slice(0, 500))}` : 'git status --short --branch';
  const x = await runCmd(r, cmd, { timeout: 60e3 }); return { code: x.code, out: (x.stdout + (x.stderr ? '\n' + x.stderr : '')).slice(0, 150000) };
});
async function approve(a, req) {
  if (a.mode === 'yolo') return true;
  const auto = a.mode === 'auto', edits = a.mode === 'edits' || auto;
  if (req.kind === 'read' || req.kind === 'net' || req.kind === 'none') { if (!req.outside) return true; }
  else if (!req.outside && !req.danger && ((req.kind === 'edit' && edits) || (req.kind === 'bash' && auto))) return true;
  if (a.allowAll?.has(req.kind) && !req.outside && !req.danger) return true;
  const what = req.kind === 'bash' ? `รันคำสั่ง (ใน ${req.cwd}):\n\n${String(req.args.command).slice(0, 1500)}` : `${req.name} ${req.args.path || req.args.url || ''}${req.diff ? '\n\n' + req.diff.split('\n').slice(0, 40).join('\n') : ''}`;
  const r = await askUser(a, { title: req.outside ? 'Agent ขอแตะไฟล์นอกโฟลเดอร์งาน' : req.danger ? 'คำสั่งนี้อาจลบหรือเปลี่ยนแปลงข้อมูล ตรวจก่อนอนุญาต' : 'Agent ขออนุญาต', detail: `โฟลเดอร์งาน: ${a.ws.root}\n\n${what}`, warn: req.danger || req.outside, allowAllLabel: req.danger || req.outside ? null : `อนุญาต${req.kind === 'bash' ? 'ทุกคำสั่ง' : 'ทุกการแก้ไฟล์'}ในงานนี้` });
  if (r === 'all') (a.allowAll ||= new Set()).add(req.kind);
  return r === 'yes' || r === 'all';
}
// ถามผู้ใช้: หน้าต่างของ Windows · ถ้าเปิดสั่งจากมือถือไว้ ส่งคำถามไปให้กดจากมือถือได้ด้วย (ใครตอบก่อนใช้คำตอบนั้น)
async function askUser(a, { title, detail, warn, allowAllLabel }) {
  const ac = new AbortController(), buttons = ['อนุญาต', ...(allowAllLabel ? [allowAllLabel] : []), 'ไม่อนุญาต'];
  const local = dialog.showMessageBox(web, { type: warn ? 'warning' : 'question', title: 'AstraCode Agent', message: title, detail, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true, signal: ac.signal })
    .then(r => r.response === 0 ? 'yes' : allowAllLabel && r.response === 1 ? 'all' : 'no');
  const remote = a.remote ? a.remote.ask({ title, detail: detail.slice(0, 3000), allowAll: !!allowAllLabel }) : new Promise(() => {});
  const ans = await Promise.race([local, remote]); ac.abort(); a.remote?.cancelAsk(); return ans;
}
// HTML → PDF ด้วย Chromium ของแอป (ฟอนต์ไทยของเครื่องใช้ได้เลย)
async function htmlToPdf(html) {
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'preview', sandbox: true, javascript: false } });
  try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } }); } finally { w.destroy(); }
}
// Connector ออนไลน์ (Remote MCP ที่เชื่อมบนเว็บ) ผ่านเซิร์ฟเวอร์: token อยู่ที่เซิร์ฟเวอร์ ไม่ลงเครื่อง
let rmcpCache = { at: 0, tools: [] };
async function remoteTools() {
  if (Date.now() - rmcpCache.at < 5 * 60e3) return rmcpCache.tools;
  const r = await fetch(SITE + '/v1/mcp/tools', { headers: { authorization: 'Bearer ' + settings.key } }).catch(() => null), d = r?.ok ? await r.json().catch(() => ({})) : {};
  rmcpCache = { at: Date.now(), tools: (d.tools || []).slice(0, 60).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }; return rmcpCache.tools;
}
const remoteCall = async (name, args) => { const r = await fetch(SITE + '/v1/mcp/call', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ name, args }) }); const d = await r.json().catch(() => ({})); return d.text ?? ('Error: ' + (d.error?.message_th || d.error?.message || 'HTTP ' + r.status)); };
const ASK_TOOL = { type: 'function', function: { name: 'ask_user', description: 'Ask the user ONE question when the task is unclear or a decision is theirs (which file, which option, missing info). Prefer 2-4 short options. Waits for the answer. Do not ask about things you can find out yourself.', parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] } } };
// จับภาพหน้าเว็บ (เช่น dev server) ในหน้าต่างซ่อน ให้ Agent ตรวจ UI ด้วยตา
async function shotUrl(url, width) {
  const w = new BrowserWindow({ show: false, width, height: 900, webPreferences: { partition: 'preview', sandbox: true, contextIsolation: true, offscreen: true } });
  const logs = []; w.webContents.on('console-message', (e, level, message, line, src) => { if (level >= 2 && logs.length < 30) logs.push(`[${level === 3 ? 'error' : 'warn'}] ${String(message).slice(0, 300)}${src ? ` (${String(src).split('/').pop()}:${line})` : ''}`); }); // error/warning ในหน้าเว็บ ให้ Agent เห็นโดยไม่ต้องให้ผู้ใช้แคป
  try { const res = w.loadURL(url).catch(x => logs.push('[load] ' + x.message)); await Promise.race([res, new Promise((_, no) => setTimeout(() => no(new Error('โหลดหน้าเว็บไม่ทันใน 20 วินาที')), 20e3))]); await new Promise(ok => setTimeout(ok, 1500)); const img = await w.webContents.capturePage(); return { image: 'data:image/jpeg;base64,' + img.resize({ width: Math.min(width, 1280) }).toJPEG(75).toString('base64'), logs }; }
  finally { w.destroy(); }
}
h('desk:agentRun', (e, o = {}) => runTask(o, e.sender));
async function runTask(o = {}, sender) {
  if (!settings.key) throw new Error('ยังไม่ได้เชื่อม API key ของแอป');
  const sid = String(o.sid || '').slice(0, 80), mode = MODES.includes(o.mode) ? o.mode : 'ask', model = String(o.model || '').slice(0, 120), root = rootOf(o.slot || 'chat');
  if (!sid || !model) throw new Error('ข้อมูลไม่ครบ');
  let a = agents.get(sid);
  if (a && a.ac) throw new Error('Agent กำลังทำงานอยู่ในแชตนี้');
  // เปิดโหมดทำเองครั้งแรกของงาน: ยืนยันด้วยหน้าต่าง Windows (หน้าเว็บสั่งเองไม่ได้)
  if (['edits', 'auto', 'yolo'].includes(mode) && a?.okMode !== mode && !o.preApproved) {
    const r = await dialog.showMessageBox(web, { type: 'warning', title: 'เปิดโหมดทำงานเอง?', message: mode === 'yolo' ? '⚠ Agent จะทำทุกอย่างโดยไม่ถามเลย' : mode === 'auto' ? 'Agent จะแก้ไฟล์และรันคำสั่งได้เองโดยไม่ถาม' : 'Agent จะแก้ไฟล์ได้เองโดยไม่ถาม (ยังถามก่อนรันคำสั่ง)', detail: mode === 'yolo' ? `รวมคำสั่งลบไฟล์ ติดตั้งโปรแกรม git push และไฟล์นอกโฟลเดอร์ ${root} (ทั้งเครื่อง)\nถ้า AI เข้าใจผิด ข้อมูลอาจหายถาวรและย้อนไม่ได้ ควรใช้กับโฟลเดอร์ที่สำรองไว้แล้ว · หยุดได้ทุกเมื่อด้วยปุ่มหยุด` : `เฉพาะในโฟลเดอร์ ${root}\nคำสั่งอันตรายและไฟล์นอกโฟลเดอร์ยังถามทุกครั้ง · ย้อนไฟล์ที่ Agent แก้ได้จากปุ่มในแชต`, buttons: ['เปิดโหมดนี้', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
    if (r.response !== 0) throw new Error('ยกเลิกแล้ว');
  }
  const tell = d => { if (sender && !sender.isDestroyed()) sender.send('desk:agentEv', { sid, ...d }); a?.remote?.push({ sid, ...d }); };
  if (!a || a.ws.root !== path.resolve(root)) {
    const saved = agentLoad(sid);
    a = { sid, messages: saved && path.resolve(saved.root) === path.resolve(root) ? saved.messages : [], mode, inbox: [] };
    // hooks ในโฟลเดอร์ (.astra/hooks.json) = คำสั่งที่จะรันเองหลังแก้ไฟล์ → ต้องยืนยันครั้งแรกต่อโฟลเดอร์/เนื้อหา
    let hooks = await projectHooks(root) || Object.values(settings.plugins || {}).find(p => p.hooks)?.hooks || null; // hook ของปลั๊กอินยืนยันแล้วตอนติดตั้ง
    if (hooks && !Object.values(settings.plugins || {}).some(p => p.hooks?.after_edit === hooks.after_edit) && settings.trustedHooks?.[path.resolve(root)] !== hooks.after_edit) {
      const r = await dialog.showMessageBox(web, { type: 'warning', title: 'โปรเจกต์นี้มี hook', message: 'ให้รันคำสั่งนี้เองทุกครั้งหลัง Agent แก้ไฟล์?', detail: hooks.after_edit, buttons: ['อนุญาต', 'ไม่ใช้ hook'], defaultId: 1, cancelId: 1, noLink: true });
      if (r.response === 0) { settings.trustedHooks = { ...settings.trustedHooks, [path.resolve(root)]: hooks.after_edit }; save(); } else hooks = null;
    }
    a.ws = new Workspace(root, { hooks, ask: req => approve(a, req), onTodos: t => tell({ type: 'todos', todos: t }), shot: shotUrl,
      search: async q => { const r = await fetch(SITE + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ query: q }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message_th || d.error?.message || 'ค้นเว็บไม่ได้'); return d.results || []; },
      // ผู้ช่วยค้น: บทสนทนาแยก เครื่องมืออ่านอย่างเดียว ใช้โมเดลประหยัดถ้าหน้าเว็บส่งมา
      subagent: async (title, prompt) => {
        const sub = [{ role: 'system', content: agentSystem({ root: a.ws.root, os: process.platform, rules: '' }) + '\n\nYou are a helper agent doing ONE research sub-task for the main agent. You can only read and search. Finish with a concise report of findings (file paths, line numbers, facts).' }, { role: 'user', content: prompt }];
        await runAgent({ base: SITE + '/v1', key: settings.key, model: a.subModel || a.model, messages: sub, tools: AGENT_TOOLS.filter(t => SUB_TOOLS.has(t.function.name)), callTool: (n, x) => SUB_TOOLS.has(n) ? a.ws.call(n, x) : 'Error: ผู้ช่วยใช้ได้แค่อ่าน/ค้น', onEvent: d => { if (d.type === 'tool') tell({ type: 'sub', title, name: d.name, args: d.args }); if (d.type === 'usage') tell(d); }, signal: a.ac?.signal, maxRounds: 25 });
        return sub.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '(ผู้ช่วยไม่ได้รายงานอะไร)';
      } });
    if (!a.messages.length) {
      a.messages.push({ role: 'system', content: agentSystem({ root: a.ws.root, os: `${process.platform} ${require('os').release()}`, rules: [await projectRules(a.ws.root), ...Object.values(settings.plugins || {}).filter(p => p.rules).map(p => `(ปลั๊กอิน ${p.title})\n${p.rules}`)].filter(Boolean).join('\n\n') }) });
      for (const m of (Array.isArray(o.history) ? o.history : []).slice(-10)) if (['user', 'assistant'].includes(m?.role) && typeof m.content === 'string') a.messages.push({ role: m.role, content: m.content.slice(0, 8000) }); // แชตเดิมที่ยังไม่เคยมีไฟล์ session
    }
    agents.set(sid, a);
  }
  a.mode = mode; if (mode !== 'plan' && mode !== 'ask') a.okMode = mode; a.allowAll = null; a.inbox = []; a.model = model; a.subModel = String(o.subModel || '').slice(0, 120) || null;
  a.ws.runFrom = a.ws.step + 1; a.cost = { charge: 0, pct: 0 };
  // ข้อความผู้ใช้: แนบรูป (ภาพหน้าจอ) และเนื้อหาไฟล์ที่อ้างด้วย @พาธ (เฉพาะในโฟลเดอร์งาน สูงสุด 5 ไฟล์)
  let text = String(o.text || '').slice(0, 100000);
  const refs = [...new Set([...text.matchAll(/(?:^|\s)@([\w./\\-]+)/g)].map(m => m[1]))].slice(0, 5);
  for (const p of refs) { const f = path.resolve(a.ws.root, p); if (f.startsWith(a.ws.root) && fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 300e3) text += `\n\n[ไฟล์ ${p}]\n${fs.readFileSync(f, 'utf8').slice(0, 30000)}`; }
  if (o.style === 'work') text += '\n\n[โหมดงานทั่วไป] ผู้ใช้ไม่ใช่โปรแกรมเมอร์: อธิบายด้วยภาษาง่าย ไม่โชว์โค้ดถ้าไม่จำเป็น ทำผลลัพธ์เป็นไฟล์ที่เปิดใช้ได้เลย (Word/Excel/PowerPoint/PDF ด้วย make_document) บอกชื่อไฟล์ที่ได้ตอนจบ ถามด้วย ask_user เมื่อข้อมูลไม่พอ';
  if (mode === 'plan') text += '\n\n[โหมดวางแผน] ห้ามแก้ไฟล์หรือรันคำสั่ง: สำรวจโค้ดด้วยเครื่องมืออ่าน แล้วเขียนแผนเป็นขั้นตอนชัดเจน (ไฟล์ที่จะแก้ แก้อะไร ตรวจผลอย่างไร) ให้ผู้ใช้อนุมัติก่อนลงมือ';
  const imgs = (Array.isArray(o.images) ? o.images : []).filter(x => typeof x === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(x) && x.length < 4e6).slice(0, 4);
  a.messages.push({ role: 'user', content: imgs.length ? [{ type: 'text', text }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))] : text });
  const ac = a.ac = new AbortController(); a.ws.signal = ac.signal;
  if (o.remote && !a.remote) a.remote = await remoteStart(a, o.chatId).catch(x => { tell({ type: 'info', text: 'สั่งจากมือถือ: ' + x.message }); return null; });
  const rtools = await remoteTools().catch(() => []);
  let tools = mode === 'plan' ? [...AGENT_TOOLS.filter(t => READ_ONLY.has(t.function.name)), OFFICE_TOOLS[1], ASK_TOOL] : [...AGENT_TOOLS, ...OFFICE_TOOLS, ASK_TOOL, ...rtools, ...(screenOk && process.platform === 'win32' ? [COMPUTER_TOOL] : [])];
  if (hasMcp() && mode !== 'plan') { try { await mcpUp(); tools = [...tools, ...mcp.tools]; } catch (x) { tell({ type: 'info', text: 'MCP: ' + x.message }); } }
  a.asks = new Map(); a.outputs = new Set();
  const callTool = async (name, args) => {
    if (name === 'computer') return computerTool(args);
    if (name === 'ask_user') { const id = 'q' + Date.now(); tell({ type: 'ask', id, question: String(args.question || '').slice(0, 1000), options: (Array.isArray(args.options) ? args.options : []).map(String).slice(0, 6) }); const ans = await new Promise((ok, no) => { a.asks.set(id, ok); ac.signal.addEventListener('abort', () => no(new Error('หยุดแล้ว'))); }); tell({ type: 'answered', id, text: ans }); return 'คำตอบของผู้ใช้: ' + ans; }
    if (name === 'make_document' || name === 'read_document') {
      const f = a.ws.abs(args.path), out = !a.ws.inside(f), kind = name === 'make_document' ? 'edit' : 'read';
      if (mode === 'plan' && kind === 'edit') return 'Error: โหมดวางแผน สร้างไฟล์ไม่ได้';
      if (!await approve(a, { name, kind, args, outside: out, danger: false, cwd: a.ws.cwd })) return 'Error: ผู้ใช้ไม่อนุญาต';
      if (kind === 'read') return readDocument(f);
      await a.ws.keep(f); const r = await makeDocument(f, args, { pdf: htmlToPdf }); a.outputs.add(a.ws.rel(f)); return r;
    }
    if (name.startsWith('rmcp_')) return remoteCall(name, args);
    if (mcp?.has(name)) return mcp.call(name, args);
    if (mode === 'plan' && !READ_ONLY.has(name)) return 'Error: โหมดวางแผน แก้ไฟล์/รันคำสั่งไม่ได้';
    return a.ws.call(name, args);
  };
  const budget = +o.budget > 0 ? +o.budget : 0, t0 = Date.now(), stat = { rounds: 0, tools: 0 };
  const onEvent = d => {
    if (d.type === 'usage') stat.rounds++; if (d.type === 'tool') stat.tools++;
    if (d.type === 'usage' && d.usage?.astra) { a.cost.charge += d.usage.astra.charge_thb || 0; a.cost.pct += d.usage.astra.week_pct || 0; tell({ type: 'cost', ...a.cost }); if (budget && a.cost.charge >= budget && !ac.signal.aborted) { tell({ type: 'info', text: `ถึงเพดานงานนี้ ฿${budget} แล้ว หยุดให้ก่อน (สั่ง "ทำต่อ" ได้)` }); ac.abort(); } }
    tell(d);
  };
  try {
    await runAgent({ base: SITE + '/v1', key: settings.key, model, messages: a.messages, tools, callTool, onEvent, signal: ac.signal, maxRounds: Math.min(200, Math.max(5, +o.maxRounds || 80)), effort: ['low', 'medium', 'high', 'xhigh', 'max', 'minimal', 'on'].includes(o.effort) ? o.effort : null, inbox: () => a.inbox.splice(0), onStep: () => ++a.ws.step });
    tell({ type: 'done', changed: a.ws.changed(), outputs: [...new Set([...a.outputs, ...a.ws.changed()])].filter(p => !/\.(js|ts|py|css|json|lock|map)$/i.test(p) || a.outputs.has(p)).slice(0, 20), runFrom: a.ws.runFrom, final: String(a.messages.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '').slice(0, 4000) });
  } catch (x) {
    tell({ type: 'error', text: ac.signal.aborted ? 'หยุดแล้ว' : x.message, changed: a.ws.changed(), runFrom: a.ws.runFrom });
    if (!ac.signal.aborted) { stat.error = String(x.message).slice(0, 300); if (!/HTTP 4\d\d|ยอดเงิน|ลิมิต|API key/i.test(x.message)) report('agent', x); }
    if (/API key/i.test(x.message) && /ไม่ถูกต้อง|invalid/i.test(x.message)) { settings.key = ''; save(); } // key ถูกลบที่เว็บ: ให้สร้างใหม่รอบหน้า
  } finally {
    a.ac = null; agentSave(a); a.remote?.flush();
    const err = stat.error; // สถิติไม่มีเนื้อหางาน: ใช้ดูว่าโมเดลไหนทำงาน Agent ได้ดี
    fetch(SITE + '/v1/agent/stat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ model, mode, rounds: stat.rounds, tools: stat.tools, ok: !err, ms: Date.now() - t0, charge: a.cost.charge, pct: a.cost.pct, error: err, version: app.getVersion(), os: process.platform }) }).catch(() => {});
  }
  return true;
}
// ---------- งานตั้งเวลาบนเครื่อง (แบบ Cowork): แอปอยู่ที่ถาดแล้วรัน Agent เองตามเวลา บันทึกผลลงแชตใหม่ แจ้งเตือนเมื่อเสร็จ ----------
h('desk:schedules', () => settings.schedules || []);
h('desk:setSchedules', async (_, list) => {
  const clean = (Array.isArray(list) ? list : []).slice(0, 20).map(x => ({ id: String(x.id || Math.random().toString(36).slice(2, 8)).slice(0, 20), name: String(x.name || '').slice(0, 60), time: /^\d{2}:\d{2}$/.test(x.time) ? x.time : '08:00', days: (Array.isArray(x.days) ? x.days : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter(d => d >= 0 && d <= 6), text: String(x.text || '').slice(0, 4000), model: String(x.model || '').slice(0, 120), mode: ['ask', 'edits', 'auto'].includes(x.mode) ? x.mode : 'edits', style: x.style === 'code' ? 'code' : 'work', on: x.on !== false }));
  const risky = clean.filter(x => x.on && x.mode !== 'ask' && !(settings.schedules || []).some(y => y.id === x.id && y.mode === x.mode && y.text === x.text));
  if (risky.length) { const r = await dialog.showMessageBox(web, { type: 'warning', title: 'งานตั้งเวลา', message: 'ให้ Agent ทำงานเองตามเวลาโดยไม่ถาม?', detail: risky.map(x => `• ${x.time} ${x.name || x.text.slice(0, 60)} (${x.mode === 'auto' ? 'ทำเองทั้งหมด' : 'แก้ไฟล์เอง'})`).join('\n') + '\n\nทำในโฟลเดอร์ที่เลือกไว้ในแชต · คำสั่งอันตรายยังถาม', buttons: ['อนุญาต', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true }); if (r.response !== 0) return false; }
  settings.schedules = clean; save(); return true;
});
setInterval(async () => {
  const now = new Date(), hm = now.toTimeString().slice(0, 5), day = now.toDateString();
  for (const x of settings?.schedules || []) {
    if (!x.on || x.time !== hm || !x.days.includes(now.getDay()) || x.last === day || !settings.key || !(settings.links || {}).chat) continue;
    x.last = day; save();
    const ses = web.webContents.session, post = (u, body) => ses.fetch(SITE + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({}));
    const c = await post('/api/chats/append', { title: '⏰ ' + (x.name || x.text), messages: [{ role: 'user', content: x.text }] });
    const sid = 'c' + (c.chat_id || 'sched-' + x.id), t0 = Date.now();
    try { await runTask({ sid, chatId: c.chat_id, text: x.text, model: x.model || 'claude-sonnet-5.5-eco', mode: x.mode, style: x.style, slot: 'chat', preApproved: true, maxRounds: 80 }, web?.webContents); } catch (e) { report('schedule', e); }
    const a = agents.get(sid), final = a?.messages.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '(ไม่มีข้อความ)';
    if (c.chat_id) await post('/api/chats/append', { chat_id: c.chat_id, messages: [{ role: 'assistant', content: final }] });
    const n = new Notification({ title: '⏰ ' + (x.name || 'งานตั้งเวลา') + ' เสร็จแล้ว', body: String(final).replace(/[#*`>]/g, '').slice(0, 160) }); n.on('click', () => { show(); if (c.chat_id) web.loadURL(SITE + '/chat?id=' + c.chat_id); }); n.show(); void t0;
  }
}, 30e3);
// ---------- สั่ง/อนุญาตจากมือถือ: แอปส่งความคืบหน้าขึ้นเซิร์ฟเวอร์ (ผูกกับแชต) มือถือเปิดแชตเดียวกันเห็นสด กดอนุญาต/พิมพ์แทรกได้ ----------
async function remoteStart(a, chatId) {
  if (!(+chatId > 0)) throw new Error('ต้องมีแชตก่อน');
  const r = await dialog.showMessageBox(web, { type: 'warning', title: 'สั่งจากมือถือ', message: 'ให้กดอนุญาตและสั่งงาน Agent จากมือถือ (บัญชีเดียวกัน) ได้?', detail: 'ความคืบหน้าจะถูกส่งขึ้นเซิร์ฟเวอร์ AstraCode เพื่อแสดงในแชตนี้บนมือถือ · ปิดได้เมื่อปิดแอป', buttons: ['อนุญาต', 'ไม่'], defaultId: 1, cancelId: 1, noLink: true });
  if (r.response !== 0) throw new Error('ไม่ได้เปิด');
  const api = async (p, body) => { const x = await fetch(SITE + '/v1/remote/' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify(body) }); return x.json().catch(() => ({})); };
  let buf = [], t = null, waiting = null, askId = 0;
  const flush = async () => { clearTimeout(t); t = null; const ev = buf.splice(0); const d = await api('push', { chat_id: +chatId, events: ev, ask: waiting?.q || null, running: !!a.ac }).catch(() => ({})); for (const m of d.inbox || []) if (a.ac) a.inbox.push('[ผู้ใช้พิมพ์จากมือถือ] ' + String(m).slice(0, 20000)); if (waiting && d.answer?.id === waiting.q.id) { const w = waiting; waiting = null; w.ok(d.answer.v); } };
  const poll = setInterval(() => { if (a.ac || waiting) flush(); }, 3000); // ระหว่างทำงาน: ดึงคำตอบ/ข้อความจากมือถือทุก 3 วินาที
  app.on('before-quit', () => clearInterval(poll));
  return {
    push: d => { if (['delta', 'think'].includes(d.type)) return; buf.push({ ...d, preview: d.preview?.slice(0, 1500), t: Date.now() }); if (!t) t = setTimeout(flush, 1200); },
    ask: q => new Promise(ok => { waiting = { q: { id: ++askId, ...q }, ok: v => ok(['yes', 'all', 'no'].includes(v) ? v : 'no') }; flush(); }),
    cancelAsk: () => { if (waiting) { waiting = null; flush(); } },
    flush,
  };
}

h('desk:notify', (_, title, body) => {
  if (web.isFocused()) return false;
  const n = new Notification({ title: String(title).slice(0, 80), body: String(body || '').slice(0, 200) }); n.on('click', () => { web.show(); web.focus(); }); n.show(); web.flashFrame(true); return true;
});
h('desk:version', () => app.getVersion());

// อัปเดตอัตโนมัติจาก GitHub Release (desktop-latest): โหลดเบื้องหลัง ติดตั้งตอนปิดแอปครั้งถัดไป
function autoUpdate() {
  if (!app.isPackaged) return;
  try { const { autoUpdater } = require('electron-updater'); autoUpdater.checkForUpdatesAndNotify().catch(() => {}); setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 3600e3); } catch { /* ไม่มีโมดูล: ข้าม */ }
}

// ส่ง error ของแอปให้หลังบ้าน (ไม่มีเนื้อหางาน · ตัดชื่อผู้ใช้ในพาธออก) ไม่เกิน 20 ครั้งต่อการเปิดแอป
let reported = 0;
function report(where, e) {
  if (reported++ > 20) return; const home = require('os').homedir(), clean = s => String(s || '').split(home).join('~').slice(0, 600);
  fetch(SITE + '/api/clienterr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: `desktop ${app.getVersion()} ${process.platform}`, msg: clean(e?.message || e), src: clean(where + ' ' + (e?.stack || '').split('\n').slice(1, 3).join(' ')) }) }).catch(() => {});
}
process.on('uncaughtException', e => report('main', e)); process.on('unhandledRejection', e => report('promise', e));
app.on('render-process-gone', (_, wc, d) => report('renderer', new Error('หน้าเว็บในแอปปิดตัว: ' + d.reason)));
app.setAppUserModelId('xyz.panderx.astracode.desktop'); // Windows: ให้แจ้งเตือนขึ้นในชื่อแอป
if (!app.requestSingleInstanceLock()) app.quit(); // เปิดซ้ำ = กลับไปหน้าต่างเดิม (และรับลิงก์ astracode://)
else {
  app.setAsDefaultProtocolClient('astracode');
  app.on('second-instance', (_, argv) => { const p = deepPath(argv); if (p && web) web.loadURL(SITE + p); show(); });
  app.on('open-url', (e, u) => { e.preventDefault(); const p = deepPath([u]); if (web && p) { web.loadURL(SITE + p); show(); } else settings.openPath = p; }); // macOS
  app.whenReady().then(() => {
    settings = { ...load(), openPath: deepPath(process.argv) };
    appMenu(); makeTray(); openWeb(); if (process.argv.includes('--hidden') && tray) web.hide(); autoUpdate();
    globalShortcut.register('CommandOrControl+Alt+Escape', () => { if (screenOk) { screenOk = false; new Notification({ title: 'AstraCode', body: 'หยุดให้ AI คุมเมาส์/คีย์บอร์ดแล้ว' }).show(); } }); // ปุ่มฉุกเฉิน
  });
}
app.on('before-quit', () => { quitting = true; for (const s of servers.values()) s.kill(); });
app.on('window-all-closed', async () => { await mcp?.close(); app.quit(); });
