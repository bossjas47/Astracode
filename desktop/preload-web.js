// สะพานเล็กที่สุดให้หน้าเว็บ (โค้ดจากอินเทอร์เน็ต) เปิดหน้าต่างทำงานในเครื่องได้ ไม่ให้สิทธิ์ไฟล์หรือคำสั่งกับหน้าเว็บโดยตรง
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('astraDesktop', {
  needKey: () => ipcRenderer.invoke('desk:needKey'),
  openAgent: key => ipcRenderer.invoke('desk:openAgent', typeof key === 'string' ? key : ''),
});
