// สะพานให้หน้าเว็บ AstraCode ทำงานกับเครื่องนี้ · main ตรวจว่าเรียกจาก astracode.panderx.xyz เท่านั้น
// หน้าเว็บอ้างโฟลเดอร์ด้วยชื่อช่อง (p:<id> / chat) ที่ผู้ใช้เลือกเองผ่านหน้าต่าง Windows · รันคำสั่ง, ตั้งค่า MCP, ให้ AI คุมจอ ต้องกดอนุญาตในหน้าต่าง Windows
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const outs = new Map(), subs = { changed: new Set(), serve: new Set(), agent: new Set() };
ipcRenderer.on('desk:out', (_, d) => outs.get(d.id)?.(d));
ipcRenderer.on('desk:changed', (_, k) => subs.changed.forEach(f => f(k)));
ipcRenderer.on('desk:serveOut', (_, d) => subs.serve.forEach(f => f(d)));
ipcRenderer.on('desk:agentEv', (_, d) => subs.agent.forEach(f => f(d)));
const on = (set, f) => { set.add(f); return () => set.delete(f); };
contextBridge.exposeInMainWorld('astraDesktop', {
  version: () => inv('desk:version'),
  notify: (title, body) => inv('desk:notify', String(title || ''), String(body || '')),
  fs: {
    link: k => inv('desk:link', k), linked: k => inv('desk:linked', k), unlink: k => inv('desk:unlink', k), autoOff: k => inv('desk:autoOff', k),
    scan: k => inv('desk:scan', k), write: (k, files) => inv('desk:write', k, files), remove: (k, p) => inv('desk:remove', k, p),
    rename: (k, a, b) => inv('desk:rename', k, a, b), read: (k, p) => inv('desk:read', k, p), list: (k, p) => inv('desk:list', k, p), open: k => inv('desk:open', k),
    grep: (k, q) => inv('desk:grep', k, String(q)), edit: (k, p, edits) => inv('desk:edit', k, p, edits),
    watch: k => inv('desk:watch', k), unwatch: k => inv('desk:unwatch', k), onChanged: f => on(subs.changed, f),
    // onOut(d): d.out / d.err = ผลระหว่างทาง
    run: async (k, cmd, onOut) => { const id = Math.random().toString(36).slice(2); if (onOut) outs.set(id, onOut); try { return await inv('desk:run', k, String(cmd), id); } finally { outs.delete(id); } },
    kill: () => { for (const id of outs.keys()) inv('desk:kill', id); },
    // dev server เบื้องหลัง: onServe(d) ได้ { k, out | err | port | exit }
    isServer: cmd => inv('desk:isServer', String(cmd)), serve: (k, cmd) => inv('desk:serve', k, String(cmd)), serveStop: k => inv('desk:serveStop', k), serveInfo: k => inv('desk:serveInfo', k), onServe: f => on(subs.serve, f),
    preview: port => inv('desk:preview', port),
  },
  // Agent แบบ Claude Code: run({ sid, text, model, mode, maxRounds, slot, history }) · เหตุการณ์มาทาง onEvent
  setupTool: (tool, key, model) => inv('desk:setupTool', String(tool), String(key), String(model)),
  agent: { needKey: () => inv('desk:agentNeedKey'), setKey: k => inv('desk:agentSetKey', String(k)), run: o => inv('desk:agentRun', o), stop: sid => inv('desk:agentStop', sid), steer: (sid, t) => inv('desk:agentSteer', sid, String(t)), undo: (sid, step) => inv('desk:agentUndo', sid, step ?? null), reset: sid => inv('desk:agentReset', sid), commands: k => inv('desk:agentCommands', k), git: (k, action, msg) => inv('desk:agentGit', k, action, msg), answer: (sid, id, t) => inv('desk:agentAnswer', sid, id, String(t)), open: (k, p) => inv('desk:agentOpen', k, String(p)), schedules: () => inv('desk:schedules'), setSchedules: list => inv('desk:setSchedules', list), onEvent: f => on(subs.agent, f) },
  screen: { on: () => inv('desk:screenOn'), off: () => inv('desk:screenOff'), state: () => inv('desk:screenState'), batch: acts => inv('desk:screenBatch', acts) },
  plugins: { list: () => inv('desk:plugins'), install: (src, env) => inv('desk:pluginInstall', src, env || {}), remove: n => inv('desk:pluginRemove', String(n)) },
  roblox: { state: () => inv('desk:robloxState'), install: () => inv('desk:robloxInstall') },
  mcp: { get: () => inv('desk:mcpGet'), set: t => inv('desk:mcpSet', String(t ?? '')), tools: () => inv('desk:mcpTools'), call: (n, a) => inv('desk:mcpCall', n, a) },
});

// Ctrl+F: แถบค้นหาในหน้า (สร้างในโลกแยกของ preload หน้าเว็บแตะไม่ได้)
ipcRenderer.on('desk:find', () => {
  let bar = document.getElementById('__desk_find');
  if (!bar) {
    bar = document.createElement('div'); bar.id = '__desk_find';
    bar.style.cssText = 'position:fixed;top:10px;right:16px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:#222;border:1px solid #444;border-radius:10px;padding:6px 8px;box-shadow:0 6px 24px rgba(0,0,0,.4);font:13px system-ui,sans-serif';
    const i = document.createElement('input'); i.placeholder = 'ค้นหาในหน้า'; i.style.cssText = 'background:#111;color:#eee;border:1px solid #444;border-radius:6px;padding:5px 8px;width:200px;font:inherit';
    const x = document.createElement('button'); x.textContent = '✕'; x.style.cssText = 'background:none;border:0;color:#aaa;cursor:pointer;font-size:14px';
    const close = () => { ipcRenderer.send('desk:findq', {}); bar.remove(); };
    i.oninput = () => ipcRenderer.send('desk:findq', { text: i.value });
    i.onkeydown = e => { if (e.key === 'Enter') ipcRenderer.send('desk:findq', { text: i.value, next: true, back: e.shiftKey }); if (e.key === 'Escape') close(); };
    x.onclick = close; bar.append(i, x); document.body.append(bar);
  }
  bar.querySelector('input').focus(); bar.querySelector('input').select();
});
