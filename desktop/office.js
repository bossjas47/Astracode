// ไฟล์ออฟฟิศสำหรับ Agent (แบบ Cowork): สร้าง Word / Excel / PowerPoint / PDF จากโครงสร้าง JSON และอ่านข้อความจาก docx / xlsx / pdf
// PDF สร้างผ่านตัวแปลง HTML → PDF ที่ main ส่งมา (ใช้ฟอนต์ไทยของเครื่องได้เลย) · ไลบรารีโหลดเมื่อใช้ครั้งแรก
const fs = require('fs/promises');
const path = require('path');

const S = d => ({ type: 'string', description: d });
const BLOCKS = { type: 'array', description: 'Content blocks in order', items: { type: 'object', properties: { type: { type: 'string', enum: ['heading', 'paragraph', 'bullets', 'numbered', 'table', 'pagebreak'] }, text: S('heading/paragraph text (use **bold**)'), level: { type: 'number', description: 'heading level 1-3' }, items: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', description: 'table rows; first row is the header', items: { type: 'array', items: { type: 'string' } } } }, required: ['type'] } };
const OFFICE_TOOLS = [
  { type: 'function', function: { name: 'make_document', description: 'Create a real Office/PDF file in the working folder. docx/pdf use "blocks"; xlsx uses "sheets" (cells starting with = are formulas, numbers stay numbers); pptx uses "slides". Overwrites the file.', parameters: { type: 'object', properties: {
    path: S('Output path, e.g. reports/sales.xlsx (extension decides the format: .docx .xlsx .pptx .pdf)'), title: S('Document title'), blocks: BLOCKS,
    sheets: { type: 'array', items: { type: 'object', properties: { name: S('Sheet name'), rows: { type: 'array', items: { type: 'array', items: {} } }, widths: { type: 'array', items: { type: 'number' } } }, required: ['name', 'rows'] } },
    slides: { type: 'array', items: { type: 'object', properties: { title: S('Slide title'), bullets: { type: 'array', items: { type: 'string' } }, notes: S('Speaker notes') }, required: ['title'] } },
  }, required: ['path'] } } },
  { type: 'function', function: { name: 'read_document', description: 'Read the text of a .docx, .xlsx (as CSV per sheet) or .pdf file.', parameters: { type: 'object', properties: { path: S('File path') }, required: ['path'] } } },
];

const runs = (docx, t) => String(t ?? '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p => /^\*\*.*\*\*$/.test(p) ? new docx.TextRun({ text: p.slice(2, -2), bold: true }) : new docx.TextRun(p));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const boldHtml = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

function blocksHtml(title, blocks = []) {
  const body = blocks.map(b => b.type === 'heading' ? `<h${Math.min(3, Math.max(1, b.level || 1)) + 1}>${boldHtml(b.text)}</h${Math.min(3, Math.max(1, b.level || 1)) + 1}>` : b.type === 'paragraph' ? `<p>${boldHtml(b.text)}</p>` : b.type === 'bullets' ? `<ul>${(b.items || []).map(i => `<li>${boldHtml(i)}</li>`).join('')}</ul>` : b.type === 'numbered' ? `<ol>${(b.items || []).map(i => `<li>${boldHtml(i)}</li>`).join('')}</ol>` : b.type === 'table' ? `<table>${(b.rows || []).map((r, i) => `<tr>${r.map(c => i ? `<td>${boldHtml(c)}</td>` : `<th>${boldHtml(c)}</th>`).join('')}</tr>`).join('')}</table>` : b.type === 'pagebreak' ? '<div style="page-break-after:always"></div>' : '').join('\n');
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:"Sarabun","Leelawadee UI","Tahoma",sans-serif;font-size:14px;line-height:1.6;margin:40px;color:#111}h1{font-size:24px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #999;padding:4px 8px;text-align:left}th{background:#eee}</style>${title ? `<h1>${esc(title)}</h1>` : ''}${body}`;
}

async function makeDocument(abs, a, { pdf } = {}) {
  const ext = path.extname(abs).toLowerCase(); await fs.mkdir(path.dirname(abs), { recursive: true });
  if (ext === '.docx') {
    const docx = require('docx'), kids = [];
    if (a.title) kids.push(new docx.Paragraph({ heading: docx.HeadingLevel.TITLE, children: [new docx.TextRun(String(a.title))] }));
    for (const b of a.blocks || []) {
      if (b.type === 'heading') kids.push(new docx.Paragraph({ heading: [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3][Math.min(2, Math.max(0, (b.level || 1) - 1))], children: runs(docx, b.text) }));
      else if (b.type === 'paragraph') kids.push(new docx.Paragraph({ children: runs(docx, b.text) }));
      else if (b.type === 'bullets' || b.type === 'numbered') for (const it of b.items || []) kids.push(new docx.Paragraph({ children: runs(docx, (b.type === 'numbered' ? '' : '• ') + it), ...(b.type === 'numbered' ? { numbering: { reference: 'num', level: 0 } } : {}) }));
      else if (b.type === 'table' && b.rows?.length) kids.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: b.rows.map((r, i) => new docx.TableRow({ children: r.map(c => new docx.TableCell({ children: [new docx.Paragraph({ children: i ? runs(docx, c) : [new docx.TextRun({ text: String(c ?? ''), bold: true })] })] })) })) }));
      else if (b.type === 'pagebreak') kids.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
    }
    const doc = new docx.Document({ numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: docx.LevelFormat.DECIMAL, text: '%1.', alignment: docx.AlignmentType.START }] }] }, styles: { default: { document: { run: { font: 'Sarabun', size: 24 } } } }, sections: [{ children: kids }] });
    await fs.writeFile(abs, await docx.Packer.toBuffer(doc));
  } else if (ext === '.xlsx') {
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook();
    for (const sh of (a.sheets || []).slice(0, 20)) {
      const ws = wb.addWorksheet(String(sh.name || 'Sheet').slice(0, 31));
      (sh.rows || []).slice(0, 20000).forEach((r, i) => { const row = ws.addRow((r || []).map(v => typeof v === 'string' && v.startsWith('=') ? { formula: v.slice(1) } : typeof v === 'string' && v.trim() !== '' && !isNaN(v) && !/^0\d/.test(v.trim()) ? +v : v)); if (i === 0) row.font = { bold: true }; });
      (sh.widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = +w || 12; });
      if (!sh.widths) ws.columns.forEach(c => { let m = 8; c.eachCell?.(x => { m = Math.max(m, String(x.value?.formula ? '0000000000' : x.value ?? '').length + 2); }); c.width = Math.min(60, m); });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    if (!wb.worksheets.length) wb.addWorksheet('Sheet1');
    await wb.xlsx.writeFile(abs);
  } else if (ext === '.pptx') {
    const Pptx = require('pptxgenjs'), p = new Pptx(); p.layout = 'LAYOUT_WIDE';
    if (a.title) { const s = p.addSlide(); s.addText(String(a.title), { x: 0.6, y: 2.6, w: 12, h: 1.5, fontSize: 40, bold: true, fontFace: 'Sarabun' }); }
    for (const sl of (a.slides || []).slice(0, 100)) {
      const s = p.addSlide(); s.addText(String(sl.title || ''), { x: 0.6, y: 0.4, w: 12, h: 1, fontSize: 30, bold: true, fontFace: 'Sarabun' });
      if (sl.bullets?.length) s.addText(sl.bullets.map(t => ({ text: String(t), options: { bullet: true } })), { x: 0.8, y: 1.6, w: 11.6, h: 5.2, fontSize: 20, fontFace: 'Sarabun', valign: 'top' });
      if (sl.notes) s.addNotes(String(sl.notes));
    }
    await p.writeFile({ fileName: abs });
  } else if (ext === '.pdf') {
    if (!pdf) throw new Error('สร้าง PDF ได้เฉพาะในแอป');
    await fs.writeFile(abs, await pdf(blocksHtml(a.title, a.blocks)));
  } else throw new Error('รองรับ .docx .xlsx .pptx .pdf');
  const st = await fs.stat(abs); return `สร้าง ${path.basename(abs)} แล้ว (${Math.round(st.size / 1024)} KB)`;
}

async function readDocument(abs) {
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.docx') return (await require('mammoth').extractRawText({ path: abs })).value.slice(0, 200000);
  if (ext === '.xlsx') {
    const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(abs); const out = [];
    wb.eachSheet(ws => { out.push(`# ${ws.name}`); ws.eachRow({ includeEmpty: false }, r => { out.push(r.values.slice(1).map(v => { const x = v?.result ?? v?.text ?? (v?.formula ? '=' + v.formula : v); return x == null ? '' : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x); }).join(',')); }); });
    return out.join('\n').slice(0, 200000);
  }
  if (ext === '.pdf') { const d = await require('pdf-parse/lib/pdf-parse.js')(await fs.readFile(abs)); return `(${d.numpages} หน้า)\n${d.text}`.slice(0, 200000); }
  throw new Error('อ่านได้เฉพาะ .docx .xlsx .pdf (ไฟล์ข้อความใช้ read_file)');
}

module.exports = { OFFICE_TOOLS, makeDocument, readDocument, blocksHtml };
