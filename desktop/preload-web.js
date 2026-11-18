// สะพานให้หน้าเว็บ AstraCode ทำงานกับเครื่องนี้ · main ตรวจว่าเรียกจาก astracode.panderx.xyz เท่านั้น
// หน้าเว็บอ้างโฟลเดอร์ด้วยชื่อช่อง (p:<id> / chat) ที่ผู้ใช้เลือกเองผ่านหน้าต่าง Windows · รันคำสั่งและตั้งค่า MCP ต้องกดอนุญาตในหน้าต่าง Windows
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const outs = new Map();
ipcRenderer.on('desk:out', (_, d) => outs.get(d.id)?.(d));
contextBridge.exposeInMainWorld('astraDesktop', {
  version: () => inv('desk:version'),
  notify: (title, body) => inv('desk:notify', String(title || ''), String(body || '')),
  fs: {
    link: k => inv('desk:link', k), linked: k => inv('desk:linked', k), unlink: k => inv('desk:unlink', k), autoOff: k => inv('desk:autoOff', k),
    scan: k => inv('desk:scan', k), write: (k, files) => inv('desk:write', k, files), remove: (k, p) => inv('desk:remove', k, p),
    rename: (k, a, b) => inv('desk:rename', k, a, b), read: (k, p) => inv('desk:read', k, p), list: (k, p) => inv('desk:list', k, p), open: k => inv('desk:open', k),
    // onOut(d): d.out / d.err = ผลระหว่างทาง
    run: async (k, cmd, onOut) => { const id = Math.random().toString(36).slice(2); if (onOut) outs.set(id, onOut); try { return await inv('desk:run', k, String(cmd), id); } finally { outs.delete(id); } },
    kill: () => { for (const id of outs.keys()) inv('desk:kill', id); },
  },
  mcp: { get: () => inv('desk:mcpGet'), set: t => inv('desk:mcpSet', String(t ?? '')), tools: () => inv('desk:mcpTools'), call: (n, a) => inv('desk:mcpCall', n, a) },
});
