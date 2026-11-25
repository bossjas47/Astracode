// ไฟล์ออฟฟิศสำหรับ Agent (แบบ Cowork): สร้าง Word / Excel / PowerPoint / PDF จากโครงสร้าง JSON และอ่านข้อความจาก docx / xlsx / pdf
// PDF สร้างผ่านตัวแปลง HTML → PDF ที่ main ส่งมา (ใช้ฟอนต์ไทยของเครื่องได้เลย) · ไลบรารีโหลดเมื่อใช้ครั้งแรก
const fs = require('fs/promises');
const path = require('path');

const S = d => ({ type: 'string', description: d });
const BLOCKS = { type: 'array', description: 'Content blocks in order', items: { type: 'object', properties: { type: { type: 'string', enum: ['heading', 'paragraph', 'bullets', 'numbered', 'table', 'image', 'note', 'pagebreak'] }, text: S('heading/paragraph/note text (use **bold**); for image: caption'), path: S('image: PNG/JPG file in the working folder (e.g. a chart you made with python)'), widths: { type: 'array', items: { type: 'number' }, description: 'table: optional relative column widths, e.g. [2,1,3]' }, level: { type: 'number', description: 'heading level 1-3' }, items: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', description: 'table rows; first row is the header', items: { type: 'array', items: { type: 'string' } } } }, required: ['type'] } };
const OFFICE_TOOLS = [
  { type: 'function', function: { name: 'make_document', description: 'Create a real Office/PDF file in the working folder. docx/pdf use "blocks" (heading, paragraph, bullets, numbered, table with optional widths, image = a PNG/JPG chart from the folder, note = highlighted box, pagebreak); xlsx uses "sheets" (cells starting with = are formulas, numbers stay numbers); pptx uses "slides". Overwrites the file.', parameters: { type: 'object', properties: {
    path: S('Output path, e.g. reports/sales.xlsx (extension decides the format: .docx .xlsx .pptx .pdf)'), title: S('Document title'), blocks: BLOCKS,
    sheets: { type: 'array', items: { type: 'object', properties: { name: S('Sheet name'), rows: { type: 'array', items: { type: 'array', items: {} } }, widths: { type: 'array', items: { type: 'number' } } }, required: ['name', 'rows'] } },
    theme: { type: 'string', enum: ['clean', 'midnight', 'ocean', 'sunset', 'forest', 'mono'], description: 'pptx look: clean (white, indigo), midnight (dark navy), ocean (teal/blue), sunset (warm coral), forest (green), mono (black & white). Pick one that fits the topic.' },
    color: S('pptx: optional brand accent color as hex, e.g. #E4002B (overrides the theme accent)'),
    subtitle: S('pptx: subtitle on the title slide (e.g. presenter, date)'),
    slides: { type: 'array', description: 'pptx slides. Vary layouts: a deck of only "bullets" looks dull. Keep 3-6 short bullets per slide; put details in notes.', items: { type: 'object', properties: {
      layout: { type: 'string', enum: ['bullets', 'section', 'two', 'stat', 'image', 'table', 'quote'], description: 'bullets (default) · section (big divider title) · two (left/right columns) · stat (big numbers: stats) · image (picture + bullets) · table (rows) · quote (big quote + text as source)' },
      title: S('Slide title'), bullets: { type: 'array', items: { type: 'string' } }, notes: S('Speaker notes'),
      left: { type: 'array', items: { type: 'string' }, description: 'two: left column bullets' }, right: { type: 'array', items: { type: 'string' }, description: 'two: right column bullets' }, left_title: S('two: left heading'), right_title: S('two: right heading'),
      stats: { type: 'array', items: { type: 'object', properties: { value: S('e.g. 12%'), label: S('what it means') } }, description: 'stat: 1-4 big numbers' },
      image: S('image: PNG/JPG path in the folder (chart or picture)'), rows: { type: 'array', items: { type: 'array', items: {} }, description: 'table: first row = header' },
      text: S('quote: the quote / section: subtitle'),
    }, required: ['title'] } },
  }, required: ['path'] } } },
  { type: 'function', function: { name: 'read_document', description: 'Read the text of a .docx, .xlsx (as CSV per sheet) or .pdf file.', parameters: { type: 'object', properties: { path: S('File path') }, required: ['path'] } } },
];

const runs = (docx, t) => String(t ?? '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p => /^\*\*.*\*\*$/.test(p) ? new docx.TextRun({ text: p.slice(2, -2), bold: true }) : new docx.TextRun(p));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const boldHtml = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

function blocksHtml(title, blocks = []) {
  const body = blocks.map(b => b.type === 'heading' ? `<h${Math.min(3, Math.max(1, b.level || 1)) + 1}>${boldHtml(b.text)}</h${Math.min(3, Math.max(1, b.level || 1)) + 1}>` : b.type === 'paragraph' ? `<p>${boldHtml(b.text)}</p>` : b.type === 'bullets' ? `<ul>${(b.items || []).map(i => `<li>${boldHtml(i)}</li>`).join('')}</ul>` : b.type === 'numbered' ? `<ol>${(b.items || []).map(i => `<li>${boldHtml(i)}</li>`).join('')}</ol>` : b.type === 'table' ? `<table>${(b.rows || []).map((r, i) => `<tr>${r.map(c => i ? `<td>${boldHtml(c)}</td>` : `<th>${boldHtml(c)}</th>`).join('')}</tr>`).join('')}</table>` : b.type === 'note' ? `<p style="background:#f4efe8;border-left:4px solid #d97757;padding:8px 12px">${boldHtml(b.text)}</p>` : b.type === 'image' && b.src ? `<figure style="text-align:center;margin:12px 0"><img src="${b.src}" style="max-width:100%">${b.text ? `<figcaption style="color:#666;font-size:12px">${esc(b.text)}</figcaption>` : ''}</figure>` : b.type === 'pagebreak' ? '<div style="page-break-after:always"></div>' : '').join('\n');
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:"Sarabun","Leelawadee UI","Tahoma",sans-serif;font-size:14px;line-height:1.6;margin:40px;color:#111}h1{font-size:24px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #999;padding:4px 8px;text-align:left}th{background:#eee}</style>${title ? `<h1>${esc(title)}</h1>` : ''}${body}`;
}

async function makeDocument(abs, a, { pdf, root } = {}) {
  const ext = path.extname(abs).toLowerCase(); await fs.mkdir(path.dirname(abs), { recursive: true });
  if (ext === '.docx') {
    const docx = require('docx'), kids = [], PAGE = 9360; // ความกว้างพื้นที่พิมพ์ A4/Letter (DXA) หลังขอบกระดาษ 1 นิ้ว
    const blocks = [...(a.blocks || [])];
    if (a.title && blocks[0]?.type === 'heading' && String(blocks[0].text).trim() === String(a.title).trim()) blocks.shift(); // ไม่ให้หัวเรื่องซ้ำ
    if (a.title) kids.push(new docx.Paragraph({ heading: docx.HeadingLevel.TITLE, spacing: { after: 240 }, children: [new docx.TextRun(String(a.title))] }));
    const line = { style: docx.BorderStyle.SINGLE, size: 4, color: 'C9C2B8' };
    for (const b of blocks) {
      if (b.type === 'heading') kids.push(new docx.Paragraph({ heading: [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3][Math.min(2, Math.max(0, (b.level || 1) - 1))], spacing: { before: 280, after: 120 }, children: runs(docx, b.text) }));
      else if (b.type === 'paragraph') kids.push(new docx.Paragraph({ spacing: { after: 140, line: 320 }, children: runs(docx, b.text) }));
      else if (b.type === 'note') kids.push(new docx.Paragraph({ spacing: { before: 120, after: 160 }, shading: { type: docx.ShadingType.CLEAR, fill: 'F4EFE8' }, border: { left: { style: docx.BorderStyle.SINGLE, size: 18, color: 'D97757' } }, indent: { left: 200 }, children: runs(docx, b.text) }));
      else if (b.type === 'bullets' || b.type === 'numbered') for (const it of b.items || []) kids.push(new docx.Paragraph({ spacing: { after: 80 }, children: runs(docx, it), ...(b.type === 'numbered' ? { numbering: { reference: 'num', level: 0 } } : { bullet: { level: 0 } }) }));
      else if (b.type === 'table' && b.rows?.length) {
        // ความกว้างคอลัมน์: ตามที่ AI ระบุ หรือตามความยาวข้อความ (ขั้นต่ำ 12%) · เดิมไม่กำหนด ทำให้บางโปรแกรมบีบคอลัมน์จนอ่านไม่ได้
        const n = Math.max(...b.rows.map(r => r.length)), len = c => Math.min(60, Math.max(4, ...b.rows.map(r => String(r[c] ?? '').length)));
        let w = Array.isArray(b.widths) && b.widths.length === n ? b.widths.map(x => Math.max(0.1, +x || 1)) : Array.from({ length: n }, (_, c) => len(c));
        const sum = w.reduce((s, x) => s + x, 0); w = w.map(x => Math.max(PAGE * 0.12, PAGE * x / sum)); const k = PAGE / w.reduce((s, x) => s + x, 0); w = w.map(x => Math.round(x * k));
        kids.push(new docx.Table({ width: { size: PAGE, type: docx.WidthType.DXA }, columnWidths: w, layout: docx.TableLayoutType.FIXED,
          rows: b.rows.map((r, i) => new docx.TableRow({ tableHeader: i === 0, children: Array.from({ length: n }, (_, c) => new docx.TableCell({ width: { size: w[c], type: docx.WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: line, bottom: line, left: line, right: line }, ...(i === 0 ? { shading: { type: docx.ShadingType.CLEAR, fill: 'EFE6DA' } } : {}), children: [new docx.Paragraph({ children: i ? runs(docx, r[c]) : [new docx.TextRun({ text: String(r[c] ?? ''), bold: true })] })] })) })) }));
        kids.push(new docx.Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      else if (b.type === 'image' && b.path) { // กราฟ/รูปในรายงาน (เช่น PNG จาก matplotlib)
        try {
          const data = await fs.readFile(path.resolve(root || path.dirname(abs), String(b.path))), png = data[0] === 0x89, wpx = png ? data.readUInt32BE(16) : 1200, hpx = png ? data.readUInt32BE(20) : 800, W = 600, H = Math.round(W * hpx / Math.max(1, wpx));
          kids.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new docx.ImageRun({ data, type: png ? 'png' : 'jpg', transformation: { width: W, height: H } })] }));
          if (b.text) kids.push(new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, spacing: { after: 160 }, children: [new docx.TextRun({ text: String(b.text), italics: true, size: 20, color: '6A6256' })] }));
        } catch { kids.push(new docx.Paragraph({ children: [new docx.TextRun({ text: '[ไม่พบรูป ' + b.path + ']', italics: true })] })); }
      }
      else if (b.type === 'pagebreak') kids.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
    }
    const doc = new docx.Document({ numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: docx.LevelFormat.DECIMAL, text: '%1.', alignment: docx.AlignmentType.START }] }] },
      styles: { default: { document: { run: { font: 'Sarabun', size: 24 } }, heading1: { run: { size: 34, bold: true, color: 'B5502F' } }, heading2: { run: { size: 28, bold: true, color: '1D1A16' } }, heading3: { run: { size: 25, bold: true } }, title: { run: { size: 44, bold: true, color: '1D1A16' } } } },
      sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: kids }] });
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
    await makePptx(a, abs, root);
  } else if (ext === '.pdf') {
    if (!pdf) throw new Error('สร้าง PDF ได้เฉพาะในแอป');
    const blocks = []; for (const b of a.blocks || []) { if (b.type === 'image' && b.path) { try { const d = await fs.readFile(path.resolve(root || path.dirname(abs), String(b.path))); blocks.push({ ...b, src: `data:image/${d[0] === 0x89 ? 'png' : 'jpeg'};base64,${d.toString('base64')}` }); } catch { /* ไม่พบรูป: ข้าม */ } } else blocks.push(b); }
    const blocks2 = a.title && blocks[0]?.type === 'heading' && String(blocks[0].text).trim() === String(a.title).trim() ? blocks.slice(1) : blocks;
    await fs.writeFile(abs, await pdf(blocksHtml(a.title, blocks2)));
  } else throw new Error('รองรับ .docx .xlsx .pptx .pdf');
  const st = await fs.stat(abs); return `สร้าง ${path.basename(abs)} แล้ว (${Math.round(st.size / 1024)} KB)`;
}

// ธีมสไลด์: พื้น · ตัวหนังสือ · สีรอง · สีเน้น · พื้นการ์ด
const THEMES = {
  clean: { bg: 'FFFFFF', ink: '0E1116', mute: '5B6170', acc: '4B4FE0', card: 'F3F4F8', dark: false },
  midnight: { bg: '0E1424', ink: 'F2F4FA', mute: 'A3ABBD', acc: '8B8FFF', card: '1A2238', dark: true },
  ocean: { bg: 'F3F9FB', ink: '0B2733', mute: '4F6B76', acc: '0E8FB0', card: 'E1F1F6', dark: false },
  sunset: { bg: 'FFF8F3', ink: '2B1A14', mute: '7A5D52', acc: 'E8603C', card: 'FDEADF', dark: false },
  forest: { bg: 'F4F8F3', ink: '15261A', mute: '56705C', acc: '2E8B57', card: 'E3EFE4', dark: false },
  mono: { bg: 'FFFFFF', ink: '111111', mute: '666666', acc: '111111', card: 'F2F2F2', dark: false },
};
async function makePptx(a, abs, root) {
  const Pptx = require('pptxgenjs'), p = new Pptx(); p.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 นิ้ว
  const T = { ...(THEMES[a.theme] || THEMES.clean) }; if (/^#?[0-9a-f]{6}$/i.test(a.color || '')) T.acc = a.color.replace('#', '').toUpperCase();
  const F = 'Sarabun', W = 13.33, base = { fontFace: F, color: T.ink };
  const slides = (a.slides || []).slice(0, 100), total = slides.length;
  const frame = (s, n) => { s.background = { color: T.bg }; s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: T.acc }, line: { color: T.acc } }); if (n) s.addText(`${n} / ${total}`, { x: W - 1.6, y: 6.95, w: 1.2, h: 0.35, fontSize: 11, fontFace: F, color: T.mute, align: 'right' }); };
  const head = (s, t) => { s.addText(String(t || ''), { ...base, x: 0.7, y: 0.45, w: W - 1.4, h: 0.9, fontSize: 30, bold: true, valign: 'top', fit: 'shrink' }); s.addShape(p.ShapeType.rect, { x: 0.72, y: 1.35, w: 1.1, h: 0.07, fill: { color: T.acc }, line: { color: T.acc } }); };
  const list = (s, items, o) => { const xs = (items || []).map(String).filter(Boolean); if (xs.length) s.addText(xs.map(t => ({ text: t, options: { bullet: { indent: 18 }, paraSpaceAfter: 10 } })), { ...base, fontSize: xs.length > 5 ? 18 : 20, valign: 'top', fit: 'shrink', ...o }); };
  const img = async rel => { try { const d = await fs.readFile(path.resolve(root || path.dirname(abs), String(rel))); const ext = path.extname(String(rel)).slice(1).toLowerCase().replace('jpg', 'jpeg'); return `image/${ext};base64,${d.toString('base64')}`; } catch { return null; } };
  // ปก
  if (a.title) {
    const s = p.addSlide(); s.background = { color: T.dark ? T.bg : T.ink === '111111' ? 'FFFFFF' : T.bg };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 7.5, fill: { color: T.dark ? T.bg : T.card }, line: { color: T.dark ? T.bg : T.card } });
    s.addShape(p.ShapeType.rect, { x: 0.8, y: 2.35, w: 1.4, h: 0.1, fill: { color: T.acc }, line: { color: T.acc } });
    s.addText(String(a.title), { ...base, x: 0.8, y: 2.6, w: W - 1.6, h: 1.8, fontSize: 44, bold: true, valign: 'top', fit: 'shrink' });
    if (a.subtitle) s.addText(String(a.subtitle), { fontFace: F, color: T.mute, x: 0.8, y: 4.5, w: W - 1.6, h: 0.8, fontSize: 20 });
  }
  let n = 0;
  for (const sl of slides) {
    const s = p.addSlide(), L = sl.layout || (sl.stats?.length ? 'stat' : sl.left || sl.right ? 'two' : sl.rows ? 'table' : sl.image ? 'image' : 'bullets'); n++;
    if (L === 'section') {
      s.background = { color: T.acc }; s.addText(String(sl.title || ''), { fontFace: F, color: 'FFFFFF', x: 0.9, y: 2.5, w: W - 1.8, h: 1.6, fontSize: 40, bold: true, fit: 'shrink' });
      if (sl.text) s.addText(String(sl.text), { fontFace: F, color: 'FFFFFF', x: 0.9, y: 4.1, w: W - 1.8, h: 0.9, fontSize: 20, transparency: 15 });
    } else if (L === 'quote') {
      frame(s, n); s.addText('“', { fontFace: 'Georgia', color: T.acc, x: 0.8, y: 0.6, w: 1.5, h: 1.5, fontSize: 110, bold: true });
      s.addText(String(sl.title || ''), { ...base, x: 1.3, y: 1.9, w: W - 2.6, h: 2.8, fontSize: 30, italic: true, valign: 'top', fit: 'shrink' });
      if (sl.text) s.addText('— ' + String(sl.text), { fontFace: F, color: T.mute, x: 1.3, y: 5, w: W - 2.6, h: 0.6, fontSize: 18 });
    } else {
      frame(s, n); head(s, sl.title);
      if (L === 'two') {
        const col = (x, t, items) => { s.addShape(p.ShapeType.roundRect, { x, y: 1.75, w: 5.8, h: 4.9, fill: { color: T.card }, line: { color: T.card }, rectRadius: 0.15 }); if (t) s.addText(String(t), { ...base, x: x + 0.3, y: 1.95, w: 5.2, h: 0.6, fontSize: 20, bold: true, color: T.acc }); list(s, items, { x: x + 0.3, y: t ? 2.6 : 2.0, w: 5.2, h: t ? 3.9 : 4.5 }); };
        col(0.7, sl.left_title, sl.left); col(6.85, sl.right_title, sl.right);
      } else if (L === 'stat') {
        const st = (sl.stats || []).slice(0, 4), cw = (W - 1.4 - (st.length - 1) * 0.3) / Math.max(1, st.length);
        st.forEach((x, i) => { const cx = 0.7 + i * (cw + 0.3); s.addShape(p.ShapeType.roundRect, { x: cx, y: 1.9, w: cw, h: 3.2, fill: { color: T.card }, line: { color: T.card }, rectRadius: 0.15 }); s.addText(String(x.value ?? ''), { fontFace: F, color: T.acc, x: cx + 0.2, y: 2.2, w: cw - 0.4, h: 1.5, fontSize: st.length > 3 ? 40 : 54, bold: true, align: 'center', fit: 'shrink' }); s.addText(String(x.label ?? ''), { fontFace: F, color: T.mute, x: cx + 0.2, y: 3.7, w: cw - 0.4, h: 1.2, fontSize: 16, align: 'center', valign: 'top', fit: 'shrink' }); });
        list(s, sl.bullets, { x: 0.7, y: 5.35, w: W - 1.4, h: 1.5 });
      } else if (L === 'image') {
        const d = sl.image && await img(sl.image);
        if (d) s.addImage({ data: d, x: 6.6, y: 1.75, w: 6.1, h: 4.9, sizing: { type: 'contain', w: 6.1, h: 4.9 } });
        list(s, sl.bullets, { x: 0.7, y: 1.75, w: d ? 5.6 : W - 1.4, h: 4.9 });
      } else if (L === 'table' && sl.rows?.length) {
        const rows = sl.rows.slice(0, 14).map((r, i) => (r || []).slice(0, 8).map(c => ({ text: String(c ?? ''), options: i === 0 ? { bold: true, color: 'FFFFFF', fill: { color: T.acc } } : { color: T.ink, fill: { color: i % 2 ? T.bg : T.card } } })));
        s.addTable(rows, { x: 0.7, y: 1.75, w: W - 1.4, fontFace: F, fontSize: rows.length > 8 ? 14 : 18, rowH: rows.length > 8 ? 0.38 : 0.55, valign: 'middle', margin: 0.08, border: { type: 'solid', pt: 0.5, color: T.dark ? '2C3342' : 'E3E6EE' }, autoPage: false });
      } else list(s, sl.bullets, { x: 0.7, y: 1.75, w: W - 1.4, h: 5 });
    }
    if (sl.notes) s.addNotes(String(sl.notes));
  }
  await p.writeFile({ fileName: abs });
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
