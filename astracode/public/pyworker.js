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
      const parts = (root + '/' + f.path).split('/'); parts.pop();
      let d = ''; for (const x of parts.filter(Boolean)) { d += '/' + x; try { py.FS.mkdir(d); } catch {} }
      py.FS.writeFile(root + '/' + f.path, f.content);
    }
    const code = files.find(f => f.path === main).content;
    py.runPython(`import os, sys\nos.chdir(${JSON.stringify(root)})\nif ${JSON.stringify(root)} not in sys.path: sys.path.insert(0, ${JSON.stringify(root)})`);
    postMessage({ status: 'กำลังรัน ' + main });
    await py.loadPackagesFromImports(code);
    await py.runPythonAsync(code, { filename: main });
    postMessage({ done: true });
  } catch (x) { postMessage({ err: String(x.message || x), done: true }); }
};
