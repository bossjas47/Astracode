// ตั้งค่าโปรแกรมเขียนโค้ดอื่นให้ใช้ AstraCode อัตโนมัติ (ลูกค้าไม่ต้องแก้ไฟล์เอง) · สำรองไฟล์เดิมเป็น .bak ก่อนเขียน
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const tomlStr = s => JSON.stringify(String(s)); // สตริง TOML แบบ basic ใช้ escape เดียวกับ JSON ได้
// Codex: แทนค่า model/model_provider ระดับบนสุด และบล็อก [model_providers.astra] เดิม · ส่วนอื่นของไฟล์คงไว้
function codexToml(old, { site, key, model }) {
  const lines = String(old || '').split(/\r?\n/), out = []; let top = true, skip = false;
  for (const l of lines) {
    if (/^\s*\[/.test(l)) { top = false; skip = /^\s*\[model_providers\.astra\]\s*$/.test(l); }
    if (skip) continue;
    if (top && /^\s*(model|model_provider)\s*=/.test(l)) continue;
    out.push(l);
  }
  const head = `model = ${tomlStr(model)}\nmodel_provider = "astra"\n`;
  const block = `\n[model_providers.astra]\nname = "AstraCode"\nbase_url = ${tomlStr(site + '/v1')}\nexperimental_bearer_token = ${tomlStr(key)}\nwire_api = "responses"\n`;
  return head + out.join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n') + block;
}
async function backupWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const old = await fs.readFile(file, 'utf8').catch(() => null);
  if (old != null) await fs.writeFile(file + '.bak', old);
  await fs.writeFile(file, text); return old;
}
async function setupTool(tool, { site, key, model, home = os.homedir() }) {
  if (tool === 'Codex') {
    const f = path.join(home, '.codex', 'config.toml'), old = await fs.readFile(f, 'utf8').catch(() => '');
    await backupWrite(f, codexToml(old, { site, key, model })); return f;
  }
  if (tool === 'Claude Code') {
    const f = path.join(home, '.claude', 'settings.json'); let j = {}; try { j = JSON.parse(await fs.readFile(f, 'utf8')); } catch { /* ไม่มี/เสีย: เริ่มใหม่ */ }
    j.env = { ...(j.env || {}), ANTHROPIC_BASE_URL: site, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: model };
    await backupWrite(f, JSON.stringify(j, null, 2) + '\n'); return f;
  }
  if (tool === 'OpenCode') {
    const f = path.join(home, '.config', 'opencode', 'opencode.json'); let j = {}; try { j = JSON.parse(await fs.readFile(f, 'utf8')); } catch { /* ไม่มี/เสีย */ }
    j.provider = { ...(j.provider || {}), astra: { npm: '@ai-sdk/openai-compatible', name: 'AstraCode', options: { baseURL: site + '/v1', apiKey: key }, models: { [model]: { limit: { context: 1050000, output: 128000 } } } } }; // บอกขนาด context จริง ไม่งั้น OpenCode ตัดที่ 200K
    j.model = 'astra/' + model;
    await backupWrite(f, JSON.stringify(j, null, 2) + '\n'); return f;
  }
  throw new Error('ยังตั้งค่าอัตโนมัติให้ ' + tool + ' ไม่ได้');
}
module.exports = { setupTool, codexToml, SETUP_TOOLS: ['Codex', 'Claude Code', 'OpenCode'] };
