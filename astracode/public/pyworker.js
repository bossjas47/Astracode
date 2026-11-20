// AstraCode: รัน Python ด้วย Pyodide ใน Web Worker (หยุดได้ด้วย terminate)
const INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
importScripts(INDEX + 'pyodide.js');
let py = null;
onmessage = async e => {
  const { files, main } = e.data;
  try {
    if (!py) {
      postMessage({ status: 'กำลังโหลด Python (ครั้งแรกประมาณ 10MB)...' });
      py = await loadPyodide({ indexURL: INDEX, stdout: s => postMessage({ out: s }), stderr: s => postMessage({ err: s }) });
    }
    const root = '/home/pyodide/project';
    for (const f of files) { // เขียนไฟล์โปรเจกต์ลงระบบไฟล์จำลอง ให้ import กันได้
      const full = f.path.startsWith('/') ? f.path : root + '/' + f.path; // พาธเต็ม (เช่น /data/ไฟล์แนบ) หรือพาธในโปรเจกต์
      const parts = full.split('/'); parts.pop();
      let d = ''; for (const x of parts.filter(Boolean)) { d += '/' + x; try { py.FS.mkdir(d); } catch {} }
      py.FS.writeFile(full, f.content);
    }
    const code = files.find(f => f.path === main).content;
    py.runPython(`import os, sys\nos.chdir(${JSON.stringify(root)})\nif ${JSON.stringify(root)} not in sys.path: sys.path.insert(0, ${JSON.stringify(root)})`);
    postMessage({ status: 'กำลังรัน ' + main });
    await py.loadPackagesFromImports(code);
    if (/matplotlib|pandas.*\.plot|seaborn/.test(code)) py.runPython("import matplotlib\nmatplotlib.use('AGG')");
    await py.runPythonAsync(code, { filename: main });
    if (/matplotlib|seaborn|\.plot\(/.test(code)) { // กราฟ: ส่งเป็นรูป PNG (base64) ให้หน้าเว็บแสดง
      const imgs = py.runPython("import base64, io, sys\nout=[]\nif 'matplotlib.pyplot' in sys.modules:\n  import matplotlib.pyplot as plt\n  for n in plt.get_fignums():\n    b=io.BytesIO(); plt.figure(n).savefig(b, format='png', dpi=110, bbox_inches='tight'); out.append(base64.b64encode(b.getvalue()).decode())\n  plt.close('all')\nout").toJs();
      for (const img of imgs) postMessage({ img });
    }
    postMessage({ done: true });
  } catch (x) { postMessage({ err: String(x.message || x), done: true }); }
};
