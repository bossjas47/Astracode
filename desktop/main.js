// AstraCode Desktop: เปิดเว็บ AstraCode ตัวจริงในหน้าต่างแอป + สะพานให้เว็บทำงานกับไฟล์ คำสั่ง และ MCP ในเครื่อง
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, Tray, nativeImage, clipboard, desktopCapturer, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { localTool, runCmd, isDanger, isServer, portOf } = require('./tools');
const { execFile } = require('child_process');
const { scanFolder, writeRel, removeRel, renameRel, grepRel, editRel } = require('./localfs');
const { startMcp } = require('./mcp');

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
h('desk:screenBatch', async (_, acts) => {
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
});
h('desk:kill', (_, id) => { jobs.get(String(id))?.abort(); return true; });

// MCP ในเครื่อง (Blender ฯลฯ): หน้าเว็บตั้งค่าได้ แต่ต้องยืนยันด้วยหน้าต่างของ Windows เพราะค่า MCP คือคำสั่งที่จะรันในเครื่อง
const mcpLog = [];
const mcpUp = async () => mcp ||= await startMcp(JSON.parse(settings.mcp || '{}'), m => { mcpLog.push(m); mcpLog.splice(0, mcpLog.length - 20); });
h('desk:mcpGet', () => ({ config: settings.mcp || '', log: mcpLog }));
h('desk:mcpSet', async (_, text) => {
  const cfg = JSON.parse(text || '{}'), list = Object.entries(cfg.mcpServers || {}).map(([n, c]) => `• ${n}: ${c.command} ${(c.args || []).join(' ')}`).join('\n');
  if (list) { const a = await dialog.showMessageBox(web, { type: 'warning', title: 'ยืนยันการตั้งค่า MCP', message: 'แอปจะรันโปรแกรมเหล่านี้ในเครื่องของคุณ', detail: list.slice(0, 2000), buttons: ['บันทึก', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true }); if (a.response !== 0) return false; }
  settings.mcp = text ? JSON.stringify(cfg, null, 2) : ''; save(); await mcp?.close(); mcp = null; mcpLog.length = 0; return true;
});
h('desk:mcpTools', async () => settings.mcp ? (await mcpUp()).tools.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) : []);
h('desk:mcpCall', async (_, name, args) => (await mcpUp()).call(String(name), args && typeof args === 'object' ? args : {}));

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
