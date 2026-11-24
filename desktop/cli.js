#!/usr/bin/env node
// astra: Agent ของ AstraCode ในเทอร์มินัล (ใช้ใน VS Code / terminal ไหนก็ได้) · เครื่องมือชุดเดียวกับแอป Desktop
// ใช้: ASTRA_KEY=sk-astra-... node cli.js "แก้บั๊กใน src/app.js" [--mode ask|edits|auto|plan] [--model claude-sonnet-5.5-eco] [--dir .]
// ไม่ใส่คำสั่ง = โหมดคุยต่อเนื่อง · คีย์สร้างที่ https://astracode.panderx.xyz/developers (หักลิมิต/Wallet ตามจริง)
const readline = require('readline');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { runAgent } = require('./agent');
const { AGENT_TOOLS, READ_ONLY, Workspace, agentSystem, projectRules, projectHooks } = require('./agenttools');

const SITE = process.env.ASTRA_SITE || 'https://astracode.panderx.xyz';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const keyFile = path.join(os.homedir(), '.astra', 'key');
let key = process.env.ASTRA_KEY || arg('key') || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '');
let mode = ['ask', 'edits', 'auto', 'plan', 'yolo'].includes(arg('mode')) ? arg('mode') : 'ask';
const model = arg('model', 'claude-sonnet-5.5-eco'), root = path.resolve(arg('dir', '.'));
const flags = new Set(['--mode', '--model', '--dir', '--key']), task = process.argv.slice(2).filter((x, i, a) => !flags.has(x) && !flags.has(a[i - 1])).join(' ').trim();
const c = (n, s) => process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s, dim = s => c(2, s), red = s => c(31, s), green = s => c(32, s), yellow = s => c(33, s);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const q = s => new Promise(ok => rl.question(s, ok));

(async () => {
  if (!key) { key = (await q('ใส่ API key (สร้างที่ ' + SITE + '/developers): ')).trim(); if (!/^sk-(astra|kyber)-/.test(key)) { console.log(red('key ไม่ถูกต้อง')); process.exit(1); } fs.mkdirSync(path.dirname(keyFile), { recursive: true }); fs.writeFileSync(keyFile, key, { mode: 0o600 }); }
  const allow = new Set();
  const ask = async r => {
    if (mode === 'yolo') return true; // --mode yolo: ไม่ถามอะไรเลย
    const auto = mode === 'auto', edits = mode === 'edits' || auto;
    if (['read', 'net', 'none'].includes(r.kind) && !r.outside) return true;
    if (!r.outside && !r.danger && ((r.kind === 'edit' && edits) || (r.kind === 'bash' && auto) || allow.has(r.kind))) return true;
    console.log(yellow(`\n${r.danger ? '⚠ คำสั่งอันตราย ' : r.outside ? '⚠ นอกโฟลเดอร์งาน ' : ''}ขออนุญาต: ${r.name} ${r.args.command || r.args.path || r.args.url || ''}`));
    if (r.diff) console.log(r.diff.split('\n').slice(0, 40).map(l => l.startsWith('+ ') ? green(l) : l.startsWith('- ') ? red(l) : dim(l)).join('\n'));
    const a = (await q(r.danger || r.outside ? '[y]อนุญาต / [n]ไม่: ' : '[y]อนุญาต / [a]ทั้งงานนี้ / [n]ไม่: ')).trim().toLowerCase();
    if (a === 'a' && !r.danger && !r.outside) allow.add(r.kind);
    return a === 'y' || a === 'a';
  };
  const ws = new Workspace(root, { ask, hooks: await projectHooks(root), onTodos: t => console.log(dim(t.map(x => (x.status === 'completed' ? '☑ ' : x.status === 'in_progress' ? '▶ ' : '☐ ') + x.content).join('\n'))),
    search: async query => { const r = await fetch(SITE + '/v1/web_search', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ query }) }); return (await r.json()).results || []; } });
  if (ws.hooks) { const a = (await q(yellow(`โปรเจกต์นี้มี hook หลังแก้ไฟล์: ${ws.hooks.after_edit}\nอนุญาตให้รันเอง? [y/n]: `))).trim(); if (a !== 'y') ws.hooks = null; }
  const messages = [{ role: 'system', content: agentSystem({ root, os: `${process.platform} ${os.release()}`, rules: await projectRules(root) }) }];
  let ac = null; process.on('SIGINT', () => { if (ac) { ac.abort(); ws.stopAll(); console.log(red('\n(หยุดแล้ว)')); } else process.exit(0); });
  const run = async text => {
    if (/^\/mode\s+(ask|edits|auto|plan|yolo)$/.test(text)) { mode = text.split(/\s+/)[1]; return console.log(dim('โหมด: ' + mode)); }
    if (text === '/undo') return console.log(dim('ย้อน: ' + ((await ws.undo()).join(', ') || 'ไม่มี')));
    messages.push({ role: 'user', content: text + (mode === 'plan' ? '\n\n[โหมดวางแผน] ห้ามแก้ไฟล์หรือรันคำสั่ง เขียนแผนให้อนุมัติก่อน' : '') });
    ws.runFrom = ws.step + 1; ac = new AbortController(); ws.signal = ac.signal; let cost = 0;
    try {
      await runAgent({ base: SITE + '/v1', key, model, messages, tools: mode === 'plan' ? AGENT_TOOLS.filter(t => READ_ONLY.has(t.function.name)) : AGENT_TOOLS.filter(t => !['screenshot_url', 'task'].includes(t.function.name)), signal: ac.signal, onStep: () => ++ws.step, spill: (t, i) => ws.spill(t, i),
        callTool: (n, a) => ws.call(n, a),
        onEvent: e => {
          if (e.type === 'delta') process.stdout.write(e.text);
          if (e.type === 'text_end') process.stdout.write('\n');
          if (e.type === 'tool') console.log(dim(`\n⚙ ${e.name} ${e.args.command || e.args.path || e.args.pattern || e.args.url || e.args.query || ''}`));
          if (e.type === 'tool_result') console.log(e.ok ? dim('  ' + e.preview.split('\n').slice(0, 6).join('\n  ')) : red('  ' + e.preview.slice(0, 300)));
          if (e.type === 'usage' && e.usage.astra) cost += e.usage.astra.charge_thb || 0;
          if (e.type === 'info') console.log(dim(e.text));
        } });
      const ch = ws.changed(); console.log(dim(`\n— เสร็จ${ch.length ? ' · แก้ ' + ch.join(', ') + ' (/undo เพื่อย้อน)' : ''}${cost ? ` · ฿${cost.toFixed(2)}` : ''}`));
    } catch (x) { console.log(red('\n' + x.message)); } finally { ac = null; }
  };
  console.log(dim(`Kyber Agent · ${root} · โหมด ${mode} · ${model} · Ctrl+C = หยุด · /mode auto|edits|ask|plan · /undo`));
  if (task) { await run(task); rl.close(); return; }
  for (;;) { const t = (await q(green('\n> '))).trim(); if (t === 'exit' || t === 'quit') break; if (t) await run(t); }
  rl.close();
})();
