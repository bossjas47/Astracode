// AstraCode Desktop: เปิดเว็บ AstraCode ตัวจริงในหน้าต่างแอป + สะพานให้เว็บทำงานกับไฟล์ คำสั่ง และ MCP ในเครื่อง
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { localTool, runCmd } = require('./tools');
const { scanFolder, writeRel, removeRel, renameRel } = require('./localfs');
const { startMcp } = require('./mcp');

const SITE = 'https://astracode.panderx.xyz';
let settings, mcp = null;
const setFile = () => path.join(app.getPath('userData'), 'settings.json');
const load = () => { try { return JSON.parse(fs.readFileSync(setFile(), 'utf8')); } catch { return {}; } };
const save = () => fs.writeFileSync(setFile(), JSON.stringify(settings, null, 2));

// หน้าต่างแอป = เว็บ AstraCode ตัวจริง (แชต สตรีม ประวัติ ลิมิต เหมือนเว็บทุกอย่าง อัปเดตตามเว็บเอง)
const AUTH_HOSTS = /^(astracode\.panderx\.xyz|accounts\.google\.com|[\w-]+\.firebaseapp\.com|access\.line\.me|challenges\.cloudflare\.com)$/; // หน้าเว็บ + หน้าล็อกอินที่ต้องเปิดในหน้าต่างแอป
let web;
function openWeb() {
  web = new BrowserWindow({ width: 1200, height: 820, title: 'AstraCode', backgroundColor: '#111111', webPreferences: { preload: path.join(__dirname, 'preload-web.js'), partition: 'persist:astra', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  web.setMenuBarVisibility(false);
  const inApp = u => { try { const x = new URL(u); return x.protocol === 'https:' && AUTH_HOSTS.test(x.hostname); } catch { return false; } };
  web.webContents.on('will-navigate', (e, u) => { if (!inApp(u)) { e.preventDefault(); if (/^https?:\/\//.test(u)) shell.openExternal(u); } });
  web.webContents.setWindowOpenHandler(({ url }) => { if (inApp(url)) return { action: 'allow' }; if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; }); // ป๊อปอัปล็อกอิน Google ให้เปิดในแอป
  web.loadURL(SITE + '/chat');
}
// ทุกช่องทางที่หน้าเว็บเรียกได้ต้องมาจาก astracode.panderx.xyz เท่านั้น (หน้าล็อกอิน Google/LINE ที่เปิดในหน้าต่างเดียวกันเรียกไม่ได้)
const fromSite = e => { try { return new URL(e.senderFrame?.url || '').origin === SITE; } catch { return false; } };
const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromSite(e)) throw new Error('ไม่อนุญาต'); return fn(e, ...a); });

// โฟลเดอร์ในเครื่อง: เว็บอ้างถึงด้วยชื่อช่อง (p:<id โปรเจกต์> หรือ chat) ไม่เคยส่งพาธเต็มมาเอง · ผู้ใช้เลือกโฟลเดอร์ผ่านหน้าต่างของ Windows เท่านั้น
const slot = k => { if (!/^(p:\d{1,12}|chat)$/.test(String(k))) throw new Error('ช่องโฟลเดอร์ไม่ถูกต้อง'); return String(k); };
const rootOf = k => { const r = (settings.links || {})[slot(k)]; if (!r || !fs.existsSync(r)) throw new Error('ยังไม่ได้เชื่อมโฟลเดอร์ในเครื่อง หรือโฟลเดอร์ถูกย้าย/ลบไปแล้ว'); return r; };
const info = r => ({ name: path.basename(r), path: r });
h('desk:link', async (_, k) => {
  const r = await dialog.showOpenDialog(web, { title: 'เลือกโฟลเดอร์ที่ให้ AstraCode ทำงาน', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  if (path.dirname(dir) === dir || dir === app.getPath('home')) { await dialog.showMessageBox(web, { type: 'warning', message: 'เลือกทั้งไดรฟ์หรือโฟลเดอร์ผู้ใช้ทั้งหมดไม่ได้', detail: 'สร้างหรือเลือกโฟลเดอร์ของงานนี้โดยเฉพาะ' }); return null; }
  settings.links = { ...settings.links, [slot(k)]: dir }; save(); return info(dir);
});
h('desk:linked', (_, k) => { const r = (settings.links || {})[slot(k)]; return r && fs.existsSync(r) ? info(r) : null; });
h('desk:unlink', (_, k) => { if (settings.links) { delete settings.links[slot(k)]; save(); } return true; });
h('desk:scan', (_, k) => scanFolder(rootOf(k)));
h('desk:write', async (_, k, files) => { const r = rootOf(k); let n = 0; for (const f of [].concat(files).slice(0, 300)) if (await writeRel(r, f.path, f.content)) n++; return n; });
h('desk:remove', (_, k, p) => removeRel(rootOf(k), p));
h('desk:rename', (_, k, a, b) => renameRel(rootOf(k), a, b));
h('desk:read', (_, k, p) => localTool(rootOf(k), 'read_file', { path: p }));
h('desk:list', (_, k, p) => localTool(rootOf(k), 'list_dir', { path: p || '.' }));
h('desk:open', (_, k) => shell.openPath(rootOf(k)));

// รันคำสั่ง: ถามด้วยหน้าต่างของ Windows ทุกครั้ง (หน้าเว็บกดแทนไม่ได้) · เลือก "อนุญาตทุกคำสั่ง" ได้ต่อโฟลเดอร์จนปิดแอป
const runOk = new Set(), jobs = new Map();
h('desk:run', async (e, k, cmd, id) => {
  const r = rootOf(k); cmd = String(cmd || '').trim(); if (!cmd) throw new Error('คำสั่งว่าง');
  if (!runOk.has(r)) {
    const a = await dialog.showMessageBox(web, { type: 'question', title: 'อนุญาตให้รันคำสั่ง?', message: 'AstraCode ขอรันคำสั่งนี้ในเครื่องของคุณ', detail: `โฟลเดอร์: ${r}\n\n${cmd.slice(0, 1500)}`, buttons: ['อนุญาต', 'อนุญาตทุกคำสั่งในโฟลเดอร์นี้ (จนปิดแอป)', 'ไม่อนุญาต'], defaultId: 0, cancelId: 2, noLink: true });
    if (a.response === 2) return { code: 1, stdout: '', stderr: 'ผู้ใช้ไม่อนุญาตให้รันคำสั่งนี้', denied: true };
    if (a.response === 1) runOk.add(r);
  }
  const ac = new AbortController(); jobs.set(String(id), ac);
  try { return await runCmd(r, cmd, { signal: ac.signal, onOut: (t, s) => { if (!e.sender.isDestroyed()) e.sender.send('desk:out', { id, [t]: s }); } }); }
  finally { jobs.delete(String(id)); }
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
app.whenReady().then(() => { settings = load(); openWeb(); autoUpdate(); });
app.on('window-all-closed', async () => { await mcp?.close(); app.quit(); });
