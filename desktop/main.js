// AstraCode Desktop: เปิดเว็บ AstraCode ตัวจริงในหน้าต่างแอป + สะพานให้เว็บทำงานกับไฟล์ คำสั่ง และ MCP ในเครื่อง
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, Tray, nativeImage, clipboard, desktopCapturer, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { localTool, runCmd, isDanger, isServer, portOf } = require('./tools');
const { execFile } = require('child_process');
const { scanFolder, writeRel, removeRel, renameRel, grepRel, editRel } = require('./localfs');
const { startMcp } = require('./mcp');
const { UIA_PS, parseUia, uiaText, pickEyes, describeScreen } = require('./eyes');
const { ROBLOX_TOOL, ROBLOX_RE, startBridge, robloxTool, installPlugin, pluginDir, newToken } = require('./roblox');
const { runAgent } = require('./agent');
const { OFFICE_TOOLS, makeDocument, readDocument } = require('./office');
const { setupTool, SETUP_TOOLS } = require('./setuptools');
const { builtinSkills, THREE_RE, THREE_SKILL, ROBLOX_SKILL, memoryRead, memoryBlock, memoryLearn, makeAdvisor } = require('./skills');
const { projectMap, makeReviewer, AGENT_TOOLS, ASK_TOOL, READ_ONLY, SUB_TOOLS, Workspace, agentSystem, projectRules, projectHooks, projectCommands, cleanPlugin, wantsAndroid, toolsFor } = require('./agenttools');

const SITE = 'https://kyber.hypatir.dev', OLD_SITE = 'https://astracode.panderx.xyz'; // ย้ายโดเมน 25 พ.ย. 2569 · โดเมนเดิมยังรับ /api และ /v1 ตลอด
// โดเมนที่เชื่อถือ (ช่วงย้ายแบรนด์เป็น Kyber): หน้าจากโดเมนเหล่านี้เท่านั้นที่เรียกสะพานไฟล์/คำสั่งได้ · แอปยังเปิดโดเมนเดิม (SITE) เป็นหลัก
const SITES = [SITE, OLD_SITE]; // เชื่อถือทั้งโดเมนใหม่และเดิม (ช่วงย้าย: หน้าเดิมพาล็อกอินมาที่โดเมนใหม่)
// productName เปลี่ยนเป็น "Kyber Desktop": ใช้โฟลเดอร์ข้อมูลเดิม ("AstraCode Desktop") ถ้ามี ไม่งั้นผู้ใช้เดิมหลุดล็อกอินและการตั้งค่า (key, โฟลเดอร์ที่ผูก, ปลั๊กอิน) หาย
{ const old = path.join(app.getPath('appData'), 'AstraCode Desktop'); try { if (fs.existsSync(old)) app.setPath('userData', old); } catch { /* ใช้โฟลเดอร์ใหม่ */ } }
let settings, mcp = null;
const setFile = () => path.join(app.getPath('userData'), 'settings.json');
const load = () => { try { return JSON.parse(fs.readFileSync(setFile(), 'utf8')); } catch { return {}; } };
const save = () => fs.writeFileSync(setFile(), JSON.stringify(settings, null, 2));

// หน้าต่างแอป = เว็บ AstraCode ตัวจริง (แชต สตรีม ประวัติ ลิมิต เหมือนเว็บทุกอย่าง อัปเดตตามเว็บเอง)
const AUTH_HOSTS = /^(kyber\.hypatir\.dev|astracode\.panderx\.xyz|accounts\.google\.com|[\w-]+\.firebaseapp\.com|access\.line\.me|challenges\.cloudflare\.com)$/; // หน้าเว็บ + หน้าล็อกอินที่ต้องเปิดในหน้าต่างแอป
let web, tray = null, quitting = false;
// หน้าออฟไลน์: เน็ตหลุด/เว็บล่ม แทนจอขาว ลองใหม่เองทุก 10 วินาที
const OFFLINE = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#ddd;font:15px system-ui,sans-serif;text-align:center"><div><h2 style="margin:0 0 8px">ต่ออินเทอร์เน็ตไม่ได้</h2><p style="color:#999;margin:0 0 16px">เช็กเน็ตแล้วลองใหม่ · แอปจะลองเองทุก 10 วินาที</p><button onclick="location.href='${SITE}/chat'" style="padding:10px 18px;border-radius:10px;border:0;background:#c25b3a;color:#fff;font:inherit;cursor:pointer">ลองใหม่</button><script>setTimeout(()=>location.href='${SITE}/chat',10000)</script></div>`);
function openWeb() {
  const b = settings.bounds || {};
  web = new BrowserWindow({ width: b.width || 1200, height: b.height || 820, x: b.x, y: b.y, title: 'Kyber', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#111111', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload-web.js'), partition: 'persist:astra', contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  if (b.max) web.maximize();
  const keep = () => { if (!web.isMinimized()) settings.bounds = { ...(web.isMaximized() ? settings.bounds : web.getNormalBounds()), max: web.isMaximized() }; };
  web.on('resize', keep); web.on('move', keep);
  web.on('close', e => { keep(); save(); if (!quitting && tray) { e.preventDefault(); web.hide(); if (!settings.trayTold) { settings.trayTold = true; save(); tray.displayBalloon?.({ title: 'Kyber ยังทำงานอยู่', content: 'แอปย่ออยู่ที่ถาดมุมขวาล่าง คลิกขวาที่ไอคอน → ออก เพื่อปิดจริง' }); } } });
  const inApp = u => { try { const x = new URL(u); return x.protocol === 'https:' && AUTH_HOSTS.test(x.hostname) && !(SITES.includes(x.origin) && USER_CONTENT.test(x.pathname)); } catch { return false; } }; // หน้าเนื้อหาผู้ใช้เปิดในเบราว์เซอร์ภายนอก
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
  const first = !settings.siteMoved; // เปิดครั้งแรกหลังย้ายโดเมน: ผ่านหน้าเดิมด้วย ?handoff=1 เพื่อพาล็อกอินมาที่โดเมนใหม่ (cookie แยกตามโดเมน)
  // จำว่าย้ายแล้วเมื่อไปถึงโดเมนใหม่จริงเท่านั้น (ถ้าเว็บยังไม่เปิดย้าย หน้าเดิมแสดงตามปกติ แล้วรอบหน้าลองใหม่)
  if (first) web.webContents.on('did-navigate', (e, u) => { if (!settings.siteMoved && u.startsWith(SITE + '/')) { settings.siteMoved = true; save(); } });
  web.loadURL((first ? OLD_SITE : SITE) + (settings.openPath || '/chat') + (first ? ((settings.openPath || '/chat').includes('?') ? '&' : '?') + 'handoff=1' : '')); settings.openPath = null;
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
    const menu = () => Menu.buildFromTemplate([{ label: 'เปิด Kyber', click: show }, { label: 'เปิดพร้อมเครื่อง', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) }, { type: 'separator' }, { label: 'หยุดให้ AI คุมเมาส์/คีย์บอร์ด', click: () => { screenOk = false; settings.screenAlways = false; save(); } }, ...(Object.values(settings.links || {}).some(r => settings.autoRun?.[r] ?? true) ? [{ label: 'ปิดการรันคำสั่งอัตโนมัติ (ทุกโฟลเดอร์)', click: () => { settings.autoRun = Object.fromEntries(Object.values(settings.links || {}).map(r => [r, false])); save(); } }] : []), ...(fs.existsSync(CMD_LOG()) ? [{ label: 'เปิดบันทึกคำสั่งที่รัน', click: () => shell.openPath(CMD_LOG()) }] : []), { label: 'ออกจากแอป', click: quit }]);
    tray.setToolTip('Kyber'); tray.setContextMenu(menu()); tray.on('click', show); tray.on('right-click', () => tray.setContextMenu(menu()));
  } catch { tray = null; } // บาง Linux ไม่มีถาด: ปิดหน้าต่าง = ออกจากแอป
}
// ลิงก์ astracode://open?path=/code?p=12 จากเว็บ/อีเมล เปิดแอปที่หน้านั้น (ใช้ได้เฉพาะพาธในเว็บเรา)
const deepPath = argv => { const u = argv.find(a => /^(astracode|kyber):\/\//i.test(a)); if (!u) return null; try { const p = new URL(u).searchParams.get('path') || '/chat'; return /^\/(?!\/)[\w\-./?=&%]*$/.test(p) ? p : '/chat'; } catch { return '/chat'; } };

// ทุกช่องทางที่หน้าเว็บเรียกได้ต้องมาจาก astracode.panderx.xyz เท่านั้น (หน้าล็อกอิน Google/LINE ที่เปิดในหน้าต่างเดียวกันเรียกไม่ได้)
// หน้าที่แสดงเนื้อหาของผู้ใช้ (Artifact ที่แชร์, พรีวิวโค้ด, เทอร์มินัล Node, ไฟล์ที่แชร์เข้ามา) อยู่โดเมนเดียวกันแต่เป็น sandbox: ห้ามเรียกสะพานเด็ดขาด
const USER_CONTENT = /^\/(a\/|preview(\.html)?$|node-runner(\.html)?$|pyworker\.js$|api\/(shared|img|artifacts|files|cowork|a)\/)/; // ไม่รวม /api/oauth (ล็อกอิน Google/LINE ต้องอยู่ในหน้าต่างแอป)
const fromSite = e => { try { const u = new URL(e.senderFrame?.url || ''); return SITES.includes(u.origin) && !USER_CONTENT.test(u.pathname) && e.senderFrame === e.sender.mainFrame; } catch { return false; } };
const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromSite(e)) throw new Error('ไม่อนุญาต'); return fn(e, ...a); });

// โฟลเดอร์ในเครื่อง: เว็บอ้างถึงด้วยชื่อช่อง (p:<id โปรเจกต์> หรือ chat) ไม่เคยส่งพาธเต็มมาเอง · ผู้ใช้เลือกโฟลเดอร์ผ่านหน้าต่างของ Windows เท่านั้น
const slot = k => { if (!/^(p:\d{1,12}|chat)$/.test(String(k))) throw new Error('ช่องโฟลเดอร์ไม่ถูกต้อง'); return String(k); };
const rootOf = k => { const r = (settings.links || {})[slot(k)]; if (!r || !fs.existsSync(r)) throw new Error('ยังไม่ได้เชื่อมโฟลเดอร์ในเครื่อง หรือโฟลเดอร์ถูกย้าย/ลบไปแล้ว'); return r; };
const info = r => ({ name: path.basename(r), path: r, auto: settings.autoRun?.[r] ?? true }); // false | true (รันเองยกเว้นอันตราย) | 'all' (รันเองทุกคำสั่ง)
h('desk:link', async (_, k) => {
  const r = await dialog.showOpenDialog(web, { title: 'เลือกโฟลเดอร์ที่ให้ Kyber ทำงาน', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  if (path.dirname(dir) === dir || dir === app.getPath('home')) { await dialog.showMessageBox(web, { type: 'warning', message: 'เลือกทั้งไดรฟ์หรือโฟลเดอร์ผู้ใช้ทั้งหมดไม่ได้', detail: 'สร้างหรือเลือกโฟลเดอร์ของงานนี้โดยเฉพาะ' }); return null; }
  settings.links = { ...settings.links, [slot(k)]: dir }; save(); return info(dir);
});
h('desk:linked', (_, k) => { const r = (settings.links || {})[slot(k)]; return r && fs.existsSync(r) ? info(r) : null; });
h('desk:autoOff', (_, k) => { const r = (settings.links || {})[slot(k)]; if (r) { settings.autoRun = { ...settings.autoRun, [r]: false }; save(); } return true; }); // ปิดได้จากหน้าเว็บ (ปลอดภัยขึ้นเท่านั้น) · เปิดได้จากหน้าต่าง Windows เท่านั้น
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
// บันทึกคำสั่งที่รันจากหน้าเว็บ (โหมด Code) ลงไฟล์ข้อความ เพื่อให้ผู้ใช้ย้อนดูได้ โดยเฉพาะโหมดรันเองทุกคำสั่ง · เก็บล่าสุด ~800KB
const CMD_LOG = () => path.join(app.getPath('userData'), 'commands.log');
function logCmd(dir, cmd, auto) {
  const head = `[${new Date().toLocaleString()}] ${auto ? 'รันอัตโนมัติ' : 'ผู้ใช้อนุญาต'}${isDanger(cmd) ? ' ⚠อันตราย' : ''}  ${dir}\n  ${String(cmd).replace(/\s+/g, ' ').slice(0, 800)}`;
  return code => { try { const f = CMD_LOG(); let prev = ''; try { prev = fs.readFileSync(f, 'utf8'); } catch {} let next = prev + head + `\n  \u2192 ${code === 'error' ? 'ผิดพลาด' : 'exit ' + code}\n\n`; if (next.length > 1e6) next = next.slice(-8e5); fs.writeFileSync(f, next); } catch {} };
}
const DENIED = { code: 1, stdout: '', stderr: 'ผู้ใช้ไม่อนุญาตให้รันคำสั่งนี้', denied: true };
// ขออนุญาตรันคำสั่งจากหน้าเว็บ (โหมด Code) → null = รันได้ · จำการตั้งค่าต่อโฟลเดอร์: true = รันเองยกเว้นคำสั่งอันตราย, 'all' = รันเองทุกคำสั่งไม่ต้องถาม
async function allow(r, cmd) {
  const lvl = settings.autoRun?.[r] ?? true; // ค่าเริ่มต้น: รันเองทุกคำสั่งที่ไม่อันตราย (ไม่ต้องกดอนุญาต) · คำสั่งลบ/ล้างข้อมูลยังถามก่อน
  if (lvl === 'all') return null;                       // รันเองทุกคำสั่งแล้ว
  if (lvl && !isDanger(cmd)) return null;               // รันเองยกเว้นคำสั่งอันตราย และคำสั่งนี้ไม่อันตราย
  const setLvl = v => { settings.autoRun = { ...settings.autoRun, [r]: v }; save(); };
  const box = o => dialog.showMessageBox(web, { detail: `โฟลเดอร์: ${r}\n\n${cmd.slice(0, 1500)}`, noLink: true, ...o }).then(x => x.response);
  if (lvl) { // อยู่โหมดรันเองอยู่แล้ว แต่เจอคำสั่งอันตราย → ให้เลือกยกระดับเป็นรันเองทุกคำสั่งได้
    const a = await box({ type: 'warning', title: 'อนุญาตให้รันคำสั่ง?', message: 'คำสั่งนี้อาจลบหรือเปลี่ยนแปลงข้อมูล ตรวจก่อนอนุญาต', buttons: ['อนุญาตครั้งนี้', 'รันเองทุกคำสั่งไม่ต้องถามอีก (รวมคำสั่งอันตราย)', 'ไม่อนุญาต'], defaultId: 0, cancelId: 2 });
    if (a === 2) return DENIED;
    if (a === 1) setLvl('all');
    return null;
  }
  const a = await box({ type: 'question', title: 'อนุญาตให้รันคำสั่ง?', message: 'Kyber ขอรันคำสั่งนี้ในเครื่องของคุณ', buttons: ['อนุญาตครั้งนี้', 'รันเองในโฟลเดอร์นี้ (ยกเว้นคำสั่งอันตราย)', 'รันเองทุกคำสั่ง (รวมคำสั่งอันตราย)', 'ไม่อนุญาต'], defaultId: 0, cancelId: 3 });
  if (a === 3) return DENIED;
  if (a === 1) setLvl(true);
  if (a === 2) { // รันเองทุกคำสั่ง = เสี่ยง ยืนยันอีกชั้นก่อนเปิด
    const c = await dialog.showMessageBox(web, { type: 'warning', title: 'รันทุกคำสั่งเองโดยไม่ถาม?', message: '⚠ Kyber จะรันทุกคำสั่งในโฟลเดอร์นี้เองโดยไม่ถามอีก', detail: `รวมคำสั่งลบไฟล์ ติดตั้งโปรแกรม และ git push ในโฟลเดอร์ ${r}\nถ้า AI เข้าใจผิด ข้อมูลอาจหายถาวรและย้อนไม่ได้ ควรใช้กับโฟลเดอร์ที่สำรองไว้แล้ว · ปิดได้ทุกเมื่อที่ไอคอนถาดมุมจอ → ปิดการรันคำสั่งอัตโนมัติ`, buttons: ['เปิดโหมดนี้', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
    if (c.response !== 0) return DENIED;
    setLvl('all');
  }
  return null;
}
h('desk:run', async (e, k, cmd, id) => {
  const r = rootOf(k); cmd = String(cmd || '').trim(); if (!cmd) throw new Error('คำสั่งว่าง');
  const lvl = settings.autoRun?.[r] ?? true, auto = lvl === 'all' || (lvl && !isDanger(cmd)); // รันโดยไม่ถามครั้งนี้ไหม
  const no = await allow(r, cmd); if (no) return no;
  const done = logCmd(r, cmd, auto);
  const ac = new AbortController(); jobs.set(String(id), ac);
  try { const out = await runCmd(r, cmd, { signal: ac.signal, onOut: (t, s) => { if (!e.sender.isDestroyed()) e.sender.send('desk:out', { id, [t]: s }); } }); done(out.code); return out; }
  catch (err) { done('error'); throw err; }
  finally { jobs.delete(String(id)); }
});
// dev server: รันค้างเบื้องหลัง (ช่องละ 1 ตัว) ส่งผลลัพธ์และพอร์ตให้หน้าเว็บ · ปิดแอปแล้วหยุดให้เอง
const servers = new Map();
h('desk:isServer', (_, cmd) => isServer(cmd));
h('desk:serve', async (e, k, cmd) => {
  const key = slot(k), r = rootOf(k); cmd = String(cmd || '').trim(); if (!cmd) throw new Error('คำสั่งว่าง');
  const no = await allow(r, cmd); if (no) return no;
  { const lvl = settings.autoRun?.[r] ?? true; logCmd(r, cmd, lvl === 'all' || (lvl && !isDanger(cmd)))('server'); }
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
let screenOk = false; // ตั้งค่าเริ่มจาก settings.screenAlways ตอนโหลด settings
const askScreen = async () => {
  if (process.platform !== 'win32') throw new Error('คุมเมาส์/คีย์บอร์ดใช้ได้เฉพาะ Windows ตอนนี้');
  const a = await dialog.showMessageBox(web, { checkboxLabel: 'จำไว้ ไม่ต้องถามอีก (ปิดได้ที่ไอคอนถาด หรือ Ctrl+Alt+Esc)', checkboxChecked: false, type: 'warning', title: 'ให้ AI ควบคุมคอมพิวเตอร์?', message: 'AI จะเห็นหน้าจอ และคลิก/พิมพ์แทนคุณได้ จนกว่าจะปิดแอป', detail: 'ระหว่างนั้นอย่าเปิดหน้าธนาคาร รหัสผ่าน หรือข้อมูลลับไว้บนจอ\nหยุดทันที: กด Ctrl+Alt+Esc หรือคลิกขวาไอคอนที่ถาด → หยุดให้ AI คุมเมาส์/คีย์บอร์ด', buttons: ['อนุญาต', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
  screenOk = a.response === 0; if (screenOk && a.checkboxChecked) { settings.screenAlways = true; save(); } return screenOk;
};
h('desk:screenOn', askScreen);
h('desk:screenOff', () => { screenOk = false; settings.screenAlways = false; save(); return true; });
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
async function screenRun(acts, opts = {}) {
  if (!screenOk) throw new Error('ยังไม่ได้อนุญาตให้ AI ควบคุมคอมพิวเตอร์ (หรือถูกหยุดแล้ว)');
  const log = []; let s = await shot(); const minimized = web.isMinimized(); web.minimize(); await new Promise(ok => setTimeout(ok, 400));
  try {
    for (const a of [].concat(acts).slice(0, 10)) {
      if (!screenOk) { log.push('หยุดแล้ว (ผู้ใช้กดหยุด)'); break; }
      const [k, ...r] = a, X = n => Math.round(+r[n] * s.sx), Y = n => Math.round(+r[n] * s.sy);
      if (['CLICK', 'DOUBLE', 'RIGHT', 'SCROLL', 'MOVE', 'DRAG'].includes(k) && !(isFinite(r[0]) && isFinite(r[1]))) { log.push(`${k}: ต้องมีพิกัด x y`); continue; }
      if (k === 'DRAG' && !(isFinite(r[2]) && isFinite(r[3]))) { log.push('DRAG: ต้องมีพิกัดปลายทาง x2 y2'); continue; }
      if (k === 'CLICK') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`);
      else if (k === 'DOUBLE') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;1..2|%{[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -m 60}`);
      else if (k === 'RIGHT') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[U]::mouse_event(16,0,0,0,[UIntPtr]::Zero)`);
      else if (k === 'SCROLL') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(0x800,0,0,${-Math.round((+r[2] || 3) * 120)},[UIntPtr]::Zero)`);
      else if (k === 'TYPE') await ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(sendKeys(r.join(' ')), 'utf8').toString('base64')}')))`);
      else if (k === 'KEY') await ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${keyCombo(r.join('')).replace(/'/g, "''")}')`);
      else if (k === 'MOVE') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null`);
      else if (k === 'DRAG') await ps(U32 + `[U]::SetCursorPos(${X(0)},${Y(1)})|Out-Null;[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -m 120;1..10|%{[U]::SetCursorPos(${X(0)}+(${X(2)}-${X(0)})*$_/10,${Y(1)}+(${Y(3)}-${Y(1)})*$_/10)|Out-Null;Start-Sleep -m 25};[U]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`);
      else if (k === 'OPEN') { const tgt = String(r[0] || '').trim(); if (!tgt) { log.push('OPEN: ต้องบอกโปรแกรม/ไฟล์/ลิงก์'); continue; } if (/^\\\\|\.(bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|scr|msi|com|hta|reg)$/i.test(tgt) || /^(cmd|powershell|pwsh|wscript|cscript|mshta|regedit)(\.exe)?$/i.test(path.basename(tgt))) { log.push('OPEN: ไม่อนุญาตให้เปิดสคริปต์หรือโปรแกรมระบบนี้'); continue; } await ps(`Start-Process -FilePath '${tgt.replace(/'/g, "''")}'`); await new Promise(ok => setTimeout(ok, 2500)); }
      else if (k === 'WAIT') await new Promise(ok => setTimeout(ok, Math.min(10e3, +r[0] || 1000)));
      else if (k !== 'SCREEN') { log.push('ไม่รู้จักคำสั่ง ' + k); continue; }
      log.push(`${k} ${r.join(' ')}`.trim() + ' ✓'); await new Promise(ok => setTimeout(ok, 250));
    }
  } catch (x) { log.push('Error: ' + x.message); }
  await new Promise(ok => setTimeout(ok, 600)); s = await shot();
  // รายชื่อปุ่ม/ช่องจาก Windows (ก่อนเปิดหน้าต่างแอปคืน ให้หน้าต่างเป้าหมายยังอยู่หน้าสุด)
  const uia = opts.uia ? await ps(UIA_PS).then(o => parseUia(o, s)).catch(x => ({ window: '', items: [], err: x.message })) : null;
  if (!minimized) { web.restore(); }
  return { image: s.image, w: s.w, h: s.h, log, uia };
}
// เครื่องมือ computer ของ Agent: ใช้ได้เมื่อผู้ใช้เปิด "ให้ AI ดูหน้าจอและคุมเมาส์" (ยืนยันด้วยหน้าต่าง Windows) · พิกัด = พิกเซลของภาพหน้าจอล่าสุด
const COMPUTER_TOOL = { type: 'function', function: { name: 'computer', description: 'See and control the whole screen of the user\'s computer (any program: Excel, Blender, browsers, games). Give a list of actions; a fresh screenshot comes back after them. Start with [{"action":"screenshot"}]. Add {"action":"elements"} to also get the buttons/fields/menus Windows reports for the front window with exact center coordinates (most precise way to click in normal apps). Coordinates are pixels of the latest screenshot. Never type passwords or payment details, and never send messages or buy things unless the user asked in this task.', parameters: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { action: { type: 'string', enum: ['screenshot', 'elements', 'click', 'double_click', 'right_click', 'move', 'drag', 'type', 'key', 'scroll', 'wait', 'open'] }, x: { type: 'number' }, y: { type: 'number' }, x2: { type: 'number', description: 'drag end x' }, y2: { type: 'number', description: 'drag end y' }, target: { type: 'string', description: 'for open: program name (notepad, excel, chrome), file path or URL' }, text: { type: 'string', description: 'for type' }, keys: { type: 'string', description: 'for key, e.g. ctrl+s, enter, alt+tab' }, amount: { type: 'number', description: 'scroll notches, negative = up' }, ms: { type: 'number' } }, required: ['action'] } } }, required: ['actions'] } } };
// ctx.seeing=false: โมเดลหลักอ่านรูปไม่ได้ → ส่งรายชื่อปุ่มจาก Windows + คำบรรยายจากตาช่วยเป็นข้อความแทนรูป
async function computerTool(a, ctx = {}) {
  if (!screenOk && !await askScreen().catch(() => false)) return 'Error: ผู้ใช้ไม่อนุญาตให้ควบคุมหน้าจอ (ใช้คำสั่ง bash หรือเครื่องมืออื่นแทน)';
  const map = { screenshot: 'SCREEN', click: 'CLICK', double_click: 'DOUBLE', right_click: 'RIGHT', move: 'MOVE', drag: 'DRAG', type: 'TYPE', key: 'KEY', scroll: 'SCROLL', wait: 'WAIT', open: 'OPEN' };
  const wantUia = ctx.seeing === false || (Array.isArray(a.actions) && a.actions.some(x => x?.action === 'elements'));
  const acts = (Array.isArray(a.actions) ? a.actions : []).filter(x => x?.action !== 'elements').slice(0, 10).map(x => { const k = map[x?.action]; if (!k) return ['?']; if (k === 'TYPE') return [k, String(x.text ?? '')]; if (k === 'KEY') return [k, String(x.keys ?? '')]; if (k === 'WAIT') return [k, x.ms ?? 1000]; if (k === 'SCROLL') return [k, x.x, x.y, x.amount ?? 3]; if (k === 'DRAG') return [k, x.x, x.y, x.x2, x.y2]; if (k === 'OPEN') return [k, String(x.target ?? '')]; return [k, x.x, x.y]; });
  const r = await screenRun(acts.length ? acts : [['SCREEN']], { uia: wantUia });
  const ui = r.uia ? (r.uia.err ? `(อ่านรายชื่อปุ่มจาก Windows ไม่ได้: ${r.uia.err.slice(0, 120)})` : uiaText(r.uia)) : '';
  if (ctx.seeing === false) {
    const seen = await describeScreen({ post: ctx.post, model: ctx.eyes, image: r.image, w: r.w, h: r.h, goal: ctx.goal, uia: ui });
    return `หน้าจอ ${r.w}x${r.h} พิกเซล (โมเดลนี้อ่านรูปไม่ได้: ส่งเป็นข้อความแทน · พิกัดใช้คลิกได้ตรง)\n${r.log.join('\n')}\n\n${ui}${seen ? `\n\nคำบรรยายหน้าจอ (ตาช่วย ${ctx.eyes}):\n${seen}` : ctx.eyes ? '' : '\n\n(แพลนนี้ไม่มีโมเดลที่อ่านรูปได้ จึงไม่มีคำบรรยายภาพ)'}`;
  }
  return { text: `หน้าจอ ${r.w}x${r.h} พิกเซล (ภาพล่าสุดแนบด้านล่าง)\n${r.log.join('\n')}${ui ? '\n\n' + ui : ''}`, images: [r.image] };
}
h('desk:kill', (_, id) => { jobs.get(String(id))?.abort(); return true; });

// MCP ในเครื่อง (Blender ฯลฯ): หน้าเว็บตั้งค่าได้ แต่ต้องยืนยันด้วยหน้าต่างของ Windows เพราะค่า MCP คือคำสั่งที่จะรันในเครื่อง
const mcpLog = [];
// MCP ที่ใช้จริง = ที่ผู้ใช้ตั้งเอง + ของปลั๊กอินที่ติดตั้ง (ชื่อ server นำหน้าด้วยชื่อปลั๊กอิน)
const mcpConfig = () => { let own = {}; try { own = JSON.parse(settings.mcp || '{}').mcpServers || {}; } catch { /* ค่าเสีย */ } const all = { ...own }; for (const p of Object.values(settings.plugins || {})) for (const [n, c] of Object.entries(p.mcpServers || {})) all[`${p.name}-${n}`] = { ...c, env: { ...(c.env || {}), ...(p.envValues || {}) } }; return { mcpServers: all }; };
const hasMcp = () => Object.keys(mcpConfig().mcpServers).length > 0;
const mcpUp = async () => { if (!mcp) await ensureNode(); return mcp ||= await startMcp(mcpConfig(), m => { mcpLog.push(m); mcpLog.splice(0, mcpLog.length - 20); }); };
// ปลั๊กอินส่วนใหญ่รันด้วย npx: เครื่องที่ยังไม่มี Node.js → เสนอติดตั้งให้ (winget บน Windows) แล้วเติม PATH ให้โปรเซสนี้ใช้ได้ทันที
let nodeAsked = false;
async function ensureNode() {
  const needs = Object.values(mcpConfig().mcpServers).some(c => /^(npx|npm|node)$/i.test(c.command)); if (!needs || nodeAsked) return;
  const has = await runCmd(app.getPath('home'), 'node -v', { timeout: 15e3 }).then(x => x.code === 0).catch(() => false); if (has) return;
  nodeAsked = true; if (process.platform !== 'win32') { mcpLog.push('ปลั๊กอินต้องใช้ Node.js: ติดตั้งจาก nodejs.org'); return; }
  const r = await dialog.showMessageBox(web, { type: 'question', title: 'ปลั๊กอินต้องใช้ Node.js', message: 'ติดตั้ง Node.js ให้อัตโนมัติไหม? (ใช้ winget ของ Windows ประมาณ 1-2 นาที)', buttons: ['ติดตั้งเลย', 'ไม่ตอนนี้'], defaultId: 0, cancelId: 1, noLink: true });
  if (r.response !== 0) return;
  const x = await runCmd(app.getPath('home'), 'winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements', { timeout: 600e3 });
  process.env.PATH = `${process.env.PATH};${process.env.ProgramFiles || 'C:\\Program Files'}\\nodejs;${process.env.APPDATA || ''}\\npm`;
  mcpLog.push(x.code === 0 ? 'ติดตั้ง Node.js แล้ว' : 'ติดตั้ง Node.js ไม่สำเร็จ: ' + String(x.stderr || x.stdout).slice(0, 200));
}
// Roblox Studio ในตัว: ติดตั้งปลั๊กอิน Kyber Studio (ไฟล์ .lua ในโฟลเดอร์ปลั๊กอินของ Studio) แล้วเปิดสะพาน 127.0.0.1 · ไม่ต้องตั้ง MCP
let rbx = null;
const rbxUp = () => { if (!rbx && settings.robloxToken) rbx = startBridge({ token: settings.robloxToken, log: m => mcpLog.push(m) }); return rbx; };
h('desk:robloxState', () => { const f = path.join(pluginDir(), 'KyberStudio.lua'); rbxUp(); return { installed: !!settings.robloxToken && fs.existsSync(f), connected: !!rbx?.connected(), place: rbx?.place() || '', file: f }; });
h('desk:robloxInstall', async () => {
  const a = await dialog.showMessageBox(web, { type: 'question', title: 'ติดตั้งปลั๊กอิน Kyber Studio', message: 'ติดตั้งปลั๊กอินให้ Roblox Studio?', detail: `ไฟล์: ${path.join(pluginDir(), 'KyberStudio.lua')}\n\nปลั๊กอินคุยกับแอป Kyber ในเครื่องนี้เท่านั้น (127.0.0.1) ให้ Agent อ่าน/แก้สคริปต์ สร้างชิ้นส่วน และกดทดสอบเกมใน Studio ที่เปิดอยู่ · ทุกการแก้ Ctrl+Z ย้อนได้\n\nหลังติดตั้ง: ปิดแล้วเปิด Studio ใหม่ และกด "Allow" เมื่อ Studio ถามสิทธิ์ให้ปลั๊กอินต่อ 127.0.0.1`, buttons: ['ติดตั้ง', 'ยกเลิก'], defaultId: 0, cancelId: 1 });
  if (a.response !== 0) return null;
  settings.robloxToken ||= newToken(); save(); const file = installPlugin(settings.robloxToken); rbxUp(); return { file };
});
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
h('desk:agentSetKey', (_, key) => { if (!/^sk-(astra|kyber)-[0-9a-f]+$/.test(String(key))) return false; settings.key = String(key); save(); return true; });
h('desk:agentStop', (_, sid) => { const a = agents.get(String(sid)); a?.ac?.abort(); a?.ws?.stopAll(); return true; });
h('desk:agentSteer', (_, sid, text) => { const a = agents.get(String(sid)); if (!a?.ac) return false; a.inbox.push('[ผู้ใช้พิมพ์แทรกระหว่างทำงาน] ' + String(text).slice(0, 20000)); return true; });
h('desk:agentUndo', async (_, sid, step) => { const a = agents.get(String(sid)); return a?.ws ? await (step != null ? a.ws.undoTo(+step) : a.ws.undo()) : []; });
h('desk:agentAnswer', (_, sid, id, text) => { const a = agents.get(String(sid)), f = a?.asks?.get(String(id)); if (!f) return false; a.asks.delete(String(id)); f(String(text ?? '').slice(0, 4000)); return true; });
// เปิดไฟล์ผลลัพธ์ที่ Agent ทำ (เฉพาะในโฟลเดอร์งาน) ด้วยโปรแกรมของเครื่อง
h('desk:agentOpen', async (_, k, p) => { const r = rootOf(k || 'chat'), f = path.resolve(r, String(p || '.')); if (f !== r && !f.startsWith(r + path.sep)) throw new Error('ไฟล์อยู่นอกโฟลเดอร์งาน'); const e = await shell.openPath(f); if (e) throw new Error(e); return true; });
h('desk:agentReset', (_, sid) => { const a = agents.get(String(sid)); a?.ac?.abort(); a?.ws?.stopAll(); a?.remote?.stop(); agents.delete(String(sid)); try { fs.rmSync(agentFile(String(sid)), { force: true }); } catch { /* ไม่มีไฟล์ */ } return true; });
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
// ตั้งค่า Codex / Claude Code / OpenCode ให้ใช้ AstraCode: เขียนไฟล์ config ให้ (ยืนยันด้วยหน้าต่างของแอปก่อน · สำรองไฟล์เดิมเป็น .bak)
h('desk:setupTool', async (_, tool, key, model) => {
  if (!SETUP_TOOLS.includes(tool) || !/^sk-(astra|kyber)-[0-9a-f]+$/.test(String(key)) || !/^[\w.:-]{1,120}$/.test(String(model))) throw new Error('ข้อมูลไม่ถูกต้อง');
  const r = await dialog.showMessageBox(web, { type: 'question', title: 'ตั้งค่า ' + tool, message: `ให้ ${tool} ใช้ Kyber (โมเดล ${model})?`, detail: 'แอปจะแก้ไฟล์ตั้งค่าของโปรแกรมนั้นให้ และสำรองไฟล์เดิมไว้เป็น .bak · ปิดโปรแกรมแล้วเปิดใหม่หลังตั้งค่า', buttons: ['ตั้งค่าเลย', 'ยกเลิก'], defaultId: 0, cancelId: 1, noLink: true });
  if (r.response !== 0) return null;
  return setupTool(tool, { site: SITE, key: String(key), model: String(model) });
});
// Git ของโฟลเดอร์งาน: ดูสถานะ / diff / commit (ปุ่มในแชต)
h('desk:agentGit', async (_, k, action, msg) => {
  const r = rootOf(k || 'chat'), q = s => process.platform === 'win32' ? '"' + s.replace(/"/g, '""') + '"' : "'" + s.replace(/'/g, "'\\''") + "'";
  const cmd = action === 'diff' ? 'git diff --stat && git diff' : action === 'commit' ? `git add -A && git commit -m ${q(String(msg || 'Kyber Agent').slice(0, 500))}` : 'git status --short --branch';
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
  a.ac?.signal.addEventListener('abort', () => ac.abort(), { once: true }); // กดหยุด/งานถูกแทนที่: ปิดหน้าต่างขออนุญาตที่ค้าง (ถือว่าไม่อนุญาต) ไม่ให้งานค้างรอ
  const local = dialog.showMessageBox(web, { type: warn ? 'warning' : 'question', title: 'Kyber Agent', message: title, detail, buttons, defaultId: 0, cancelId: buttons.length - 1, noLink: true, signal: ac.signal })
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
let rmcpCache = { at: 0, tools: [] }, mlist = { at: 0, data: [] };
const modelList = async () => { if (Date.now() - mlist.at < 10 * 60e3 && mlist.data.length) return mlist.data; const r = await fetch(SITE + '/v1/models', { headers: { authorization: 'Bearer ' + settings.key } }); const d = r.ok ? await r.json() : {}; mlist = { at: Date.now(), data: d.data || [] }; return mlist.data; };
async function remoteTools() {
  if (Date.now() - rmcpCache.at < 5 * 60e3) return rmcpCache.tools;
  const r = await fetch(SITE + '/v1/mcp/tools', { headers: { authorization: 'Bearer ' + settings.key } }).catch(() => null), d = r?.ok ? await r.json().catch(() => ({})) : {};
  rmcpCache = { at: Date.now(), tools: (d.tools || []).slice(0, 60).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }; return rmcpCache.tools;
}
const remoteCall = async (name, args) => { const r = await fetch(SITE + '/v1/mcp/call', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ name, args }) }); const d = await r.json().catch(() => ({})); return d.text ?? ('Error: ' + (d.error?.message_th || d.error?.message || 'HTTP ' + r.status)); };
// จับภาพหน้าเว็บ (เช่น dev server) ในหน้าต่างซ่อน ให้ Agent ตรวจ UI ด้วยตา
async function shotUrl(url, width, wait = 1500) {
  const w = new BrowserWindow({ show: false, width, height: 900, webPreferences: { partition: 'preview', sandbox: true, contextIsolation: true, offscreen: true } });
  const logs = []; w.webContents.on('console-message', (e, level, message, line, src) => { if (level >= 2 && logs.length < 30) logs.push(`[${level === 3 ? 'error' : 'warn'}] ${String(message).slice(0, 300)}${src ? ` (${String(src).split('/').pop()}:${line})` : ''}`); }); // error/warning ในหน้าเว็บ ให้ Agent เห็นโดยไม่ต้องให้ผู้ใช้แคป
  try { const res = w.loadURL(url).catch(x => logs.push('[load] ' + x.message)); await Promise.race([res, new Promise((_, no) => setTimeout(() => no(new Error('โหลดหน้าเว็บไม่ทันใน 20 วินาที')), 20e3))]); await new Promise(ok => setTimeout(ok, wait)); const img = await w.webContents.capturePage(), jpg = img.resize({ width: Math.min(width, 1280) }).toJPEG(75); const canvases = await w.webContents.executeJavaScript('document.querySelectorAll("canvas").length').catch(() => null); return { image: 'data:image/jpeg;base64,' + jpg.toString('base64'), logs, bytes: jpg.length, canvases }; }
  finally { w.destroy(); }
}
h('desk:agentRun', (e, o = {}) => runTask(o, e.sender));
async function runTask(o = {}, sender) {
  if (!settings.key) throw new Error('ยังไม่ได้เชื่อม API key ของแอป');
  const sid = String(o.sid || '').slice(0, 80), mode = MODES.includes(o.mode) ? o.mode : 'ask', model = String(o.model || '').slice(0, 120), root = rootOf(o.slot || 'chat');
  if (!sid || !model) throw new Error('ข้อมูลไม่ครบ');
  let a = agents.get(sid);
  // หน้าเว็บส่งงานใหม่ทั้งที่งานเดิมยังวิ่ง = หน้าเว็บไม่รู้ว่างานเดิมยังทำอยู่ (รีเฟรช/เปิดแชตใหม่/งานค้าง) เพราะถ้ารู้ หน้าเว็บจะส่งเป็นข้อความแทรกแทน
  // → หยุดงานเดิมแล้วรอให้จบจริง (ประวัติไม่ชนกัน) แล้วทำงานใหม่ · เดิมตอบ "Agent กำลังทำงานอยู่ในแชตนี้" ทุกข้อความจนต้องปิดแอป
  if (a && a.ac) {
    a.ac.abort(); a.ws?.stopAll();
    await Promise.race([a.running, new Promise(ok => setTimeout(ok, 15e3))]);
    if (a.ac) throw new Error('Agent งานเดิมยังหยุดไม่ได้ กดปุ่มหยุด หรือปิดแอปจากถาดแล้วเปิดใหม่');
  }
  // เปิดโหมดทำเองครั้งแรกของงาน: ยืนยันด้วยหน้าต่าง Windows (หน้าเว็บสั่งเองไม่ได้)
  if (['edits', 'auto', 'yolo'].includes(mode) && a?.okMode !== mode && !o.preApproved) {
    const r = await dialog.showMessageBox(web, { type: 'warning', title: 'เปิดโหมดทำงานเอง?', message: mode === 'yolo' ? '⚠ Agent จะทำทุกอย่างโดยไม่ถามเลย' : mode === 'auto' ? 'Agent จะแก้ไฟล์และรันคำสั่งได้เองโดยไม่ถาม' : 'Agent จะแก้ไฟล์ได้เองโดยไม่ถาม (ยังถามก่อนรันคำสั่ง)', detail: mode === 'yolo' ? `รวมคำสั่งลบไฟล์ ติดตั้งโปรแกรม git push และไฟล์นอกโฟลเดอร์ ${root} (ทั้งเครื่อง)\nถ้า AI เข้าใจผิด ข้อมูลอาจหายถาวรและย้อนไม่ได้ ควรใช้กับโฟลเดอร์ที่สำรองไว้แล้ว · หยุดได้ทุกเมื่อด้วยปุ่มหยุด` : `เฉพาะในโฟลเดอร์ ${root}\nคำสั่งอันตรายและไฟล์นอกโฟลเดอร์ยังถามทุกครั้ง · ย้อนไฟล์ที่ Agent แก้ได้จากปุ่มในแชต`, buttons: ['เปิดโหมดนี้', 'ยกเลิก'], defaultId: 1, cancelId: 1, noLink: true });
    if (r.response !== 0) throw new Error('ยกเลิกแล้ว');
  }
  const rid = String(o.rid || Math.random().toString(36).slice(2, 10)).slice(0, 40); // รหัสงานรอบนี้: หน้าเว็บกรองเหตุการณ์ของงานเดิมที่เพิ่งถูกหยุดออก
  const tell = d => { if (sender && !sender.isDestroyed()) sender.send('desk:agentEv', { sid, rid, ...d }); a?.remote?.push({ sid, ...d }); };
  if (!a || a.ws.root !== path.resolve(root)) {
    const saved = agentLoad(sid);
    a = { sid, messages: saved && path.resolve(saved.root) === path.resolve(root) ? saved.messages : [], mode, inbox: [] };
    // hooks ในโฟลเดอร์ (.astra/hooks.json) = คำสั่งที่จะรันเองหลังแก้ไฟล์ → ต้องยืนยันครั้งแรกต่อโฟลเดอร์/เนื้อหา
    let hooks = await projectHooks(root) || Object.values(settings.plugins || {}).find(p => p.hooks)?.hooks || null; // hook ของปลั๊กอินยืนยันแล้วตอนติดตั้ง
    if (hooks && !Object.values(settings.plugins || {}).some(p => p.hooks?.after_edit === hooks.after_edit) && settings.trustedHooks?.[path.resolve(root)] !== hooks.after_edit) {
      const r = await dialog.showMessageBox(web, { type: 'warning', title: 'โปรเจกต์นี้มี hook', message: 'ให้รันคำสั่งนี้เองทุกครั้งหลัง Agent แก้ไฟล์?', detail: hooks.after_edit, buttons: ['อนุญาต', 'ไม่ใช้ hook'], defaultId: 1, cancelId: 1, noLink: true });
      if (r.response === 0) { settings.trustedHooks = { ...settings.trustedHooks, [path.resolve(root)]: hooks.after_edit }; save(); } else hooks = null;
    }
    a.ws = new Workspace(root, { hooks, ask: req => approve(a, req), onTodos: t => tell({ type: 'todos', todos: t }), shot: shotUrl, pageCheck: (u, wait) => shotUrl(u, 1280, wait), // check_page: เปิดไฟล์ HTML/three.js จริง ดู error + ภาพ
      search: async q => { const r = await fetch(SITE + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ query: q }) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message_th || d.error?.message || 'ค้นเว็บไม่ได้'); return d.results || []; },
      // ผู้ช่วยค้น: บทสนทนาแยก เครื่องมืออ่านอย่างเดียว ใช้โมเดลประหยัดถ้าหน้าเว็บส่งมา
      subagent: async (title, prompt) => {
        const sub = [{ role: 'system', content: agentSystem({ root: a.ws.root, os: process.platform, rules: '' }) + '\n\nYou are a helper agent doing ONE research sub-task for the main agent. You can only read and search. Finish with a concise report of findings (file paths, line numbers, facts).' }, { role: 'user', content: prompt }];
        await runAgent({ base: SITE + '/v1', key: settings.key, model: a.subModel || a.model, messages: sub, tools: AGENT_TOOLS.filter(t => SUB_TOOLS.has(t.function.name)), callTool: (n, x) => SUB_TOOLS.has(n) ? a.ws.call(n, x) : 'Error: ผู้ช่วยใช้ได้แค่อ่าน/ค้น', onEvent: d => { if (d.type === 'tool') tell({ type: 'sub', title, name: d.name, args: d.args }); if (d.type === 'usage') tell(d); }, signal: a.ac?.signal, maxRounds: 25, depth: 1, spill: (t, i) => a.ws.spill(t, i) });
        return sub.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '(ผู้ช่วยไม่ได้รายงานอะไร)';
      } });
    a.map = await projectMap(a.ws.root).catch(() => ({ text: '', checks: [] })); // แผนที่โปรเจกต์ + คำสั่งตรวจงาน (ใส่ใน system ตอนเริ่ม session)
    if (!a.messages.length) {
      const deps = await fs.promises.readFile(path.join(a.ws.root, 'package.json'), 'utf8').catch(() => ''); a.threeOn = /"three"\s*:/.test(deps);
      a.messages.push({ role: 'system', content: agentSystem({ extra: builtinSkills({ text: '', deps, code: o.style !== 'work' }) + memoryBlock(await memoryRead(a.ws.root)), root: a.ws.root, os: `${process.platform} ${require('os').release()}`, map: a.map.text, rules: [await projectRules(a.ws.root), ...Object.values(settings.plugins || {}).filter(p => p.rules).map(p => `(ปลั๊กอิน ${p.title})\n${p.rules}`)].filter(Boolean).join('\n\n') }) });
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
  if (!a.rbxOn && settings.robloxToken && (ROBLOX_RE.test(text) || rbxUp()?.connected())) { a.rbxOn = true; text += `\n\n[Kyber skill]\n${ROBLOX_SKILL}${rbx?.connected() ? `\n(Roblox Studio is connected now: place "${rbx.place()}")` : '\n(Roblox Studio is not connected yet: if the roblox tool says so, ask the user to open Studio with the Kyber Studio plugin and allow 127.0.0.1.)'}`; } // งาน Roblox: ใส่สกิลครั้งแรก
  if (!a.threeOn && THREE_RE.test(text)) { a.threeOn = true; text += '\n\n[Kyber skill]\n' + THREE_SKILL; } // งาน 3D: ใส่สกิล Three.js ครั้งแรกที่เจอ (ไม่ใส่ซ้ำทุกข้อความ)
  if (o.style === 'work') text += '\n\n[โหมดงานทั่วไป] ผู้ใช้ไม่ใช่โปรแกรมเมอร์: อธิบายด้วยภาษาง่าย ไม่โชว์โค้ดถ้าไม่จำเป็น ทำผลลัพธ์เป็นไฟล์ที่เปิดใช้ได้เลย (Word/Excel/PowerPoint/PDF ด้วย make_document) บอกชื่อไฟล์ที่ได้ตอนจบ ถามด้วย ask_user เมื่อข้อมูลไม่พอ';
  if (mode === 'plan') text += '\n\n[โหมดวางแผน] ห้ามแก้ไฟล์หรือรันคำสั่ง: สำรวจโค้ดด้วยเครื่องมืออ่าน แล้วเขียนแผนเป็นขั้นตอนชัดเจน (ไฟล์ที่จะแก้ แก้อะไร ตรวจผลอย่างไร) ให้ผู้ใช้อนุมัติก่อนลงมือ';
  const imgs = (Array.isArray(o.images) ? o.images : []).filter(x => typeof x === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(x) && x.length < 4e6).slice(0, 4);
  a.messages.push({ role: 'user', content: imgs.length ? [{ type: 'text', text }, ...imgs.map(url => ({ type: 'image_url', image_url: { url } }))] : text });
  const ac = a.ac = new AbortController(); a.ws.signal = ac.signal; let ended; a.running = new Promise(ok => { ended = ok; });
  if (o.remote && !a.remote) a.remote = await remoteStart(a, o.chatId).catch(x => { tell({ type: 'info', text: 'สั่งจากมือถือ: ' + x.message }); return null; });
  const rtools = await remoteTools().catch(() => []);
  // ชุดเครื่องมือเดียวกันทุกโหมด (โหมดวางแผนกันไว้ใน callTool แทน) → สลับ วางแผน ↔ ลงมือ แล้ว prompt cache ยังใช้ต่อได้ · android_tools ใส่เมื่องานเกี่ยวกับ Android (เปิดแล้วคงไว้ทั้ง session)
  a.android ||= await wantsAndroid(a.ws.root, text).catch(() => false);
  let tools = [...toolsFor({ android: a.android }), ...OFFICE_TOOLS, ASK_TOOL, ...rtools, ...(process.platform === 'win32' && settings.screenNever !== true ? [COMPUTER_TOOL] : [])];
  if (hasMcp()) { try { await mcpUp(); tools = [...tools, ...mcp.tools]; } catch (x) { tell({ type: 'info', text: 'MCP: ' + x.message }); } }
  if (rbxUp() && (a.rbxOn || rbx.connected() || ROBLOX_RE.test(text))) tools = [...tools, ROBLOX_TOOL]; // Roblox: ใส่เครื่องมือเมื่อ Studio ต่ออยู่หรือคำสั่งพูดถึง Roblox
  a.asks = new Map(); a.outputs = new Set();
  const callTool = async (name, args) => {
    if (mode === 'plan' && !READ_ONLY.has(name) && !['ask_user', 'read_document'].includes(name)) return 'Error: โหมดวางแผน: ใช้ได้เฉพาะเครื่องมืออ่าน/ค้น (ห้ามแก้ไฟล์ รันคำสั่ง หรือเรียกเครื่องมือภายนอก) เขียนแผนให้ผู้ใช้อนุมัติก่อน';
    if (name === 'computer') return computerTool(args, await screenCtx());
    if (name === 'ask_user') { const id = 'q' + Date.now(); tell({ type: 'ask', id, question: String(args.question || '').slice(0, 1000), options: (Array.isArray(args.options) ? args.options : []).map(String).slice(0, 6) }); const ans = await new Promise((ok, no) => { a.asks.set(id, ok); ac.signal.addEventListener('abort', () => no(new Error('หยุดแล้ว'))); }); tell({ type: 'answered', id, text: ans }); return 'คำตอบของผู้ใช้: ' + ans; }
    if (name === 'make_document' || name === 'read_document') {
      const f = a.ws.abs(args.path), out = !a.ws.inside(f), kind = name === 'make_document' ? 'edit' : 'read';
      if (mode === 'plan' && kind === 'edit') return 'Error: โหมดวางแผน สร้างไฟล์ไม่ได้';
      if (!await approve(a, { name, kind, args, outside: out, danger: false, cwd: a.ws.cwd })) return 'Error: ผู้ใช้ไม่อนุญาต';
      if (kind === 'read') return readDocument(f);
      await a.ws.keep(f); const r = await makeDocument(f, args, { pdf: htmlToPdf, root: a.ws.root }); a.outputs.add(a.ws.rel(f)); return r;
    }
    if (name === 'roblox') return robloxTool(rbx, args);
    if (name.startsWith('rmcp_')) return remoteCall(name, args);
    if (mcp?.has(name)) return mcp.call(name, args);
    return a.ws.call(name, args);
  };
  const budget = +o.budget > 0 ? +o.budget : 0, t0 = Date.now(), stat = { rounds: 0, tools: 0 };
  const onEvent = d => {
    if (d.type === 'usage') stat.rounds++; if (d.type === 'tool') stat.tools++;
    if (d.type === 'stats') { const x = d.stats, tt = [...x.ttft].sort((p, q) => p - q); stat.harness = { retries: x.retries, stuck: x.stuck, toolErrors: x.toolErrors, cacheHit: x.cacheHit, ttftMs: tt[tt.length >> 1] || 0, perTool: { ...x.perTool, _gated: { calls: x.gated || 0, errors: 0 }, _reviewed: { calls: x.reviewed || 0, errors: 0 } } }; return; } // สถิติตัวคุมรอบ: ส่งไปกับ agent/stat ไม่ส่งเข้าหน้าเว็บ
    if (d.type === 'usage' && d.usage?.astra) { a.cost.charge += d.usage.astra.charge_thb || 0; a.cost.pct += d.usage.astra.week_pct || 0; tell({ type: 'cost', ...a.cost }); if (budget && a.cost.charge >= budget && !ac.signal.aborted) { tell({ type: 'info', text: `ถึงเพดานงานนี้ ฿${budget} แล้ว หยุดให้ก่อน (สั่ง "ทำต่อ" ได้)` }); ac.abort(); } }
    tell(d);
  };
  const post = body => fetch(SITE + '/v1/chat/completions', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify(body) });
  // โมเดลอ่านรูปได้ไหม (ถามเซิร์ฟเวอร์ครั้งแรกที่ใช้หน้าจอ) · ไม่ได้ = ใช้ตาช่วยที่หักลิมิตน้อยสุด
  let sc = null; const screenCtx = async () => sc ||= await modelList().then(ms => { const me = ms.find(m => m.id === model); const seeing = me ? me.vision !== false : true; return { seeing, eyes: seeing ? null : pickEyes(ms), post, goal: String(o.text || '').slice(0, 600) }; }).catch(() => ({ seeing: true }));
  // ที่ปรึกษาโมเดลแรง (หน้าเว็บส่งชื่อโมเดลมา เมื่อผู้ใช้เปิดไว้และแพลนมีโมเดลนั้น) · ไม่ส่ง = ปิด
  const advisorModel = typeof o.advisor === 'string' && o.advisor && o.advisor !== model && mode !== 'plan' ? o.advisor.slice(0, 120) : null, advisor = advisorModel ? makeAdvisor({ post, model: advisorModel }) : null;
  try {
    const seeImages = (await screenCtx()).seeing !== false;
    await runAgent({ advisor, seeImages, pinned: () => a.ws.pinnedNotes(), base: SITE + '/v1', key: settings.key, model, messages: a.messages, tools, callTool, onEvent, signal: ac.signal, maxRounds: Math.min(200, Math.max(5, +o.maxRounds || 80)), effort: ['low', 'medium', 'high', 'xhigh', 'max', 'minimal', 'on'].includes(o.effort) ? o.effort : null, inbox: () => a.inbox.splice(0), onStep: () => ++a.ws.step,
      maxDurationMs: Math.min(600, Math.max(0, +o.maxMinutes || 0)) * 60e3, spill: (t, i) => a.ws.spill(t, i),
      checks: (a.map ||= await projectMap(a.ws.root).catch(() => ({ checks: [] }))).checks || [], verifyGate: o.verifyGate !== false && mode !== 'plan',
      review: o.review === false || mode === 'plan' ? null : makeReviewer({ ws: a.ws, model: advisorModel || model, task: String(o.text || '').slice(0, 4000), // ผู้ตรวจรอบสองใช้โมเดลเดียวกับงาน (รุ่นเล็กมักเตือนผิด)
        post: body => fetch(SITE + '/v1/chat/completions', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify(body) }) }),
      onCheckpoint: () => { if (Date.now() - (a.savedAt || 0) > 5000) { a.savedAt = Date.now(); agentSave(a); } } }); // บันทึกระหว่างทำ (ทุก ≥5 วินาที): แอปปิด/ค้างกลางงาน เปิดใหม่ทำต่อได้
    if (mode !== 'plan' && mode !== 'ask' && o.memory !== false && a.ws.changed().length) memoryLearn({ post, model, root: a.ws.root, task: String(o.text || ''), messages: a.messages }).then(l => { if (l?.length) tell({ type: 'info', text: `จำบทเรียนของโปรเจกต์ไว้ ${l.length} ข้อ (.kyber/memory.md)` }); }).catch(() => {}); // ความจำโปรเจกต์: จบงานที่แก้ไฟล์ → สรุปบทเรียนเก็บไว้ใช้งานหน้า
    tell({ type: 'done', changed: a.ws.changed(), outputs: [...new Set([...a.outputs, ...a.ws.changed()])].filter(p => !/\.(js|ts|py|css|json|lock|map)$/i.test(p) || a.outputs.has(p)).slice(0, 20), runFrom: a.ws.runFrom, final: String(a.messages.filter(m => m.role === 'assistant' && m.content).at(-1)?.content || '').slice(0, 4000) });
  } catch (x) {
    tell({ type: 'error', text: ac.signal.aborted ? 'หยุดแล้ว' : x.message, changed: a.ws.changed(), runFrom: a.ws.runFrom });
    if (!ac.signal.aborted) { stat.error = String(x.message).slice(0, 300); if (!/HTTP 4\d\d|ยอดเงิน|ลิมิต|API key/i.test(x.message)) report('agent', x); }
    if (/API key/i.test(x.message) && /ไม่ถูกต้อง|invalid/i.test(x.message)) { settings.key = ''; save(); } // key ถูกลบที่เว็บ: ให้สร้างใหม่รอบหน้า
  } finally {
    if (a.ac === ac) a.ac = null; agentSave(a); a.remote?.flush(); ended();
    const err = stat.error; // สถิติไม่มีเนื้อหางาน: ใช้ดูว่าโมเดลไหนทำงาน Agent ได้ดี
    fetch(SITE + '/v1/agent/stat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify({ model, mode, rounds: stat.rounds, tools: stat.tools, ok: !err, ms: Date.now() - t0, charge: a.cost.charge, pct: a.cost.pct, error: err, version: app.getVersion(), os: process.platform, harness: stat.harness || null }) }).catch(() => {});
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
  const r = await dialog.showMessageBox(web, { type: 'warning', title: 'สั่งจากมือถือ', message: 'ให้กดอนุญาตและสั่งงาน Agent จากมือถือ (บัญชีเดียวกัน) ได้?', detail: 'ความคืบหน้าจะถูกส่งขึ้นเซิร์ฟเวอร์ Kyber เพื่อแสดงในแชตนี้บนมือถือ · ปิดได้เมื่อปิดแอป', buttons: ['อนุญาต', 'ไม่'], defaultId: 1, cancelId: 1, noLink: true });
  if (r.response !== 0) throw new Error('ไม่ได้เปิด');
  const api = async (p, body) => { const x = await fetch(SITE + '/v1/remote/' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + settings.key }, body: JSON.stringify(body) }); return x.json().catch(() => ({})); };
  let buf = [], t = null, waiting = null, askId = 0;
  const flush = async () => { clearTimeout(t); t = null; const ev = buf.splice(0); const d = await api('push', { chat_id: +chatId, events: ev, ask: waiting?.q || null, running: !!a.ac }).catch(() => ({})); for (const m of d.inbox || []) if (a.ac) a.inbox.push('[ผู้ใช้พิมพ์จากมือถือ] ' + String(m).slice(0, 20000)); if (waiting && d.answer?.id === waiting.q.id) { const w = waiting; waiting = null; w.ok(d.answer.v); } };
  const poll = setInterval(() => { if (a.ac || waiting) flush(); }, 3000); // ระหว่างทำงาน: ดึงคำตอบ/ข้อความจากมือถือทุก 3 วินาที
  app.on('before-quit', () => clearInterval(poll));
  return {
    stop: () => { clearInterval(poll); clearTimeout(t); }, // ล้างแชต Agent: เลิกดึงข้อมูลจากมือถือ
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
  app.setAsDefaultProtocolClient('astracode'); app.setAsDefaultProtocolClient('kyber'); // ลิงก์ชื่อใหม่ kyber:// และชื่อเดิม astracode://
  app.on('second-instance', (_, argv) => { const p = deepPath(argv); if (p && web) web.loadURL(SITE + p); show(); });
  app.on('open-url', (e, u) => { e.preventDefault(); const p = deepPath([u]); if (web && p) { web.loadURL(SITE + p); show(); } else settings.openPath = p; }); // macOS
  app.whenReady().then(() => {
    settings = { ...load(), openPath: deepPath(process.argv) }; screenOk = process.platform === 'win32' && settings.screenAlways === true;
    if (!settings.links?.chat) { const w = path.join(app.getPath('home'), 'KyberWorkspace'); try { fs.mkdirSync(w, { recursive: true }); } catch { /* สร้างไม่ได้: ใช้โฟลเดอร์ผู้ใช้ */ } settings.links = { ...settings.links, chat: fs.existsSync(w) ? w : app.getPath('home') }; save(); } // ผู้ใช้ใหม่: โฟลเดอร์งานแยก ~/KyberWorkspace (ผู้ใช้เดิมที่ตั้งไว้แล้วไม่เปลี่ยน) // แชตในแอปทำงานในเครื่องได้ทันที (โฟลเดอร์ผู้ใช้ เหมือนเปิด terminal) · เปลี่ยนโฟลเดอร์ได้ในหน้า ใช้คอมเครื่องนี้ // เคยกด "จำไว้" แล้ว: ไม่ต้องขอสิทธิ์คุมจอซ้ำทุกครั้งที่เปิดแอป
    appMenu(); makeTray(); openWeb(); if (process.argv.includes('--hidden') && tray) web.hide(); autoUpdate();
    globalShortcut.register('CommandOrControl+Alt+Escape', () => { const was = screenOk || settings.screenAlways; screenOk = false; if (settings.screenAlways) { settings.screenAlways = false; save(); } if (was) new Notification({ title: 'Kyber', body: 'หยุดให้ AI คุมเมาส์/คีย์บอร์ดแล้ว (ครั้งหน้าจะถามก่อน)' }).show(); }); // ปุ่มฉุกเฉิน: ปิด "จำไว้" ด้วย
  });
}
app.on('before-quit', () => { quitting = true; for (const s of servers.values()) s.kill(); });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* ยังไม่พร้อม */ } });
app.on('window-all-closed', async () => { await mcp?.close(); await rbx?.close(); app.quit(); });
