// ช่องทางเดียวที่หน้าแอปคุยกับ main (หน้าแอปไม่มีสิทธิ์ node โดยตรง)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('astra', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: s => ipcRenderer.invoke('settings:set', s),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  models: () => ipcRenderer.invoke('models'),
  login: () => ipcRenderer.invoke('login'),
  run: t => ipcRenderer.invoke('run', t),
  stop: () => ipcRenderer.invoke('stop'),
  reset: () => ipcRenderer.invoke('new'),
  onEvent: f => ipcRenderer.on('event', (_, e) => f(e)),
  onApprove: f => ipcRenderer.on('approve', (_, a) => f(a)),
  reply: (id, ok) => ipcRenderer.send('approve:reply', { id, ok }),
});
