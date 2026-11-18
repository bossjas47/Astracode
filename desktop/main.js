// AstraCode Desktop: หน้าต่างแอป + ตั้งค่า + ล็อกอินผ่านเบราว์เซอร์ + สั่งงาน agent
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { runAgent } = require('./agent');
const { LOCAL_TOOLS, NEEDS_OK, localTool } = require('./tools');
const { startMcp } = require('./mcp');

const SITE = 'https://astracode.panderx.xyz';
const SYS = 'You are AstraCode Desktop, an AI agent working on the user\'s computer. Reply in the user\'s language. Use the tools to look at files and run commands instead of guessing. Work inside the chosen workspace folder. Before risky or destructive commands, explain what they do. When finished, summarize what you changed.';
let win, settings, history = [], ctrl = null, mcp = null;
const setFile = () => path.join(app.getPath('userData'), 'settings.json');
const load = () => { try { return JSON.parse(fs.readFileSync(setFile(), 'utf8')); } catch { return {}; } };
const save = () => fs.writeFileSync(setFile(), JSON.stringify(settings, null, 2));
const send = (ch, d) => win?.webContents.send(ch, d);

const pending = new Map(); // คำขออนุญาตที่รอผู้ใช้ตอบ
const askOk = (name, args) => new Promise(ok => { const id = crypto.randomUUID(); pending.set(id, ok); send('approve', { id, name, args }); });
ipcMain.on('approve:reply', (_, { id, ok }) => { pending.get(id)?.(!!ok); pending.delete(id); });

ipcMain.handle('settings:get', () => ({ ...settings, key: settings.key ? settings.key.slice(0, 14) + '…' : '' }));
ipcMain.handle('settings:set', async (_, s) => {
  for (const k of ['model', 'autoWrite', 'autoRun']) if (k in s) settings[k] = s[k];
  if ('mcp' in s) { JSON.parse(s.mcp || '{}'); settings.mcp = s.mcp; await mcp?.close(); mcp = null; } // JSON ผิด = โยน error กลับหน้าแอป
  if ('key' in s) settings.key = String(s.key).trim();
  save(); return true;
});
ipcMain.handle('folder:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (!r.canceled && r.filePaths[0]) { settings.workspace = r.filePaths[0]; save(); }
  return settings.workspace || '';
});
ipcMain.handle('models', async () => {
  if (!settings.key) return [];
  const r = await fetch(SITE + '/v1/models', { headers: { authorization: 'Bearer ' + settings.key } });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message_th || d.error?.message || 'HTTP ' + r.status);
  return (d.data || []).map(m => m.id);
});
// ล็อกอิน: เปิดเว็บหน้าอนุญาต เว็บส่ง key กลับมาที่ 127.0.0.1 ของเครื่องนี้ (state กันคำตอบปลอม)
ipcMain.handle('login', () => new Promise((ok, no) => {
  const state = crypto.randomBytes(16).toString('hex');
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/cb') { res.writeHead(404); return res.end(); }
    const good = u.searchParams.get('state') === state && /^sk-astra-[0-9a-f]+$/.test(u.searchParams.get('key') || '');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(good ? '<h2 style="font-family:sans-serif">เชื่อมต่อแล้ว กลับไปที่แอป AstraCode Desktop ได้เลย</h2>' : '<h2>ข้อมูลไม่ถูกต้อง ลองใหม่จากในแอป</h2>');
    if (!good) return;
    settings.key = u.searchParams.get('key'); save(); srv.close(); clearTimeout(t); ok(true);
  });
  const t = setTimeout(() => { srv.close(); no(new Error('หมดเวลา ลองกดเข้าสู่ระบบใหม่')); }, 5 * 60e3);
  srv.listen(0, '127.0.0.1', () => shell.openExternal(`${SITE}/desktop-auth?port=${srv.address().port}&state=${state}`));
}));
ipcMain.handle('new', () => { history = []; return true; });
ipcMain.handle('stop', () => { ctrl?.abort(); return true; });
ipcMain.handle('run', async (_, text) => {
  if (!settings.key) throw new Error('เข้าสู่ระบบก่อน');
  if (!settings.workspace) throw new Error('เลือกโฟลเดอร์งานก่อน');
  if (!mcp && settings.mcp) mcp = await startMcp(JSON.parse(settings.mcp), m => send('event', { type: 'info', text: m }));
  if (!history.length) history.push({ role: 'system', content: SYS + `\nWorkspace folder: ${settings.workspace}\nOS: ${process.platform}` });
  history.push({ role: 'user', content: String(text) });
  ctrl = new AbortController();
  const callTool = async (name, args) => {
    if (mcp?.has(name)) return await mcp.call(name, args);
    if (NEEDS_OK.has(name) && !(name === 'write_file' ? settings.autoWrite : settings.autoRun) && !await askOk(name, args)) return 'Error: ผู้ใช้ไม่อนุญาต';
    return await localTool(settings.workspace, name, args);
  };
  try {
    await runAgent({ base: SITE + '/v1', key: settings.key, model: settings.model || 'claude-sonnet-5.5-eco', messages: history, tools: [...LOCAL_TOOLS, ...(mcp?.tools || [])], callTool, onEvent: e => send('event', e), signal: ctrl.signal });
  } finally { ctrl = null; send('event', { type: 'done' }); }
  return true;
});

app.whenReady().then(() => {
  settings = load();
  win = new BrowserWindow({ width: 1100, height: 760, title: 'AstraCode Desktop', backgroundColor: '#111111', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', async () => { await mcp?.close(); app.quit(); });
