// คำสั่งติดตั้ง 1 บรรทัด: สร้าง key + ลิงก์ใช้ได้ 3 ครั้ง/15 นาที · สคริปต์เขียนไฟล์ตั้งค่า Codex/Claude Code/OpenCode โดยคงค่าเดิมของผู้ใช้ไว้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeEnv, addPlan } from './helpers.mjs';

test('setup command: paid user gets a working one-line installer; the script writes each tool config and keeps the user settings', async () => {
  const t = await makeEnv({ K: 'k' }); await t.json('/api/version');
  const u = await t.user(); const p = addPlan(t.DB, { price: 349 }); t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=?, balance=0 WHERE id=?').run(p.id, Date.now() + 864e5, u.id);
  const free = await t.user(); t.DB.raw.prepare('UPDATE users SET balance=0 WHERE id=?').run(free.id);
  assert.equal((await t.json('/api/setup-cmd', { method: 'POST', cookie: free.cookie, body: { tool: 'Codex', model: 'claude-opus-5.5-eco' } })).status, 403);
  const run = async (tool, home) => {
    const r = await t.json('/api/setup-cmd', { method: 'POST', cookie: u.cookie, body: { tool, model: 'claude-opus-5.5-eco', models: ['claude-sonnet-5.5-eco', 'chatgpt-6.1-sol'] } });
    assert.equal(r.status, 200, JSON.stringify(r.data)); assert.match(r.data.unix, /^curl -fsSL https:\/\/t\.test\/setup\/[A-Za-z0-9_-]+ \| node$/); assert.match(r.data.windows, /^irm .+ \| node$/);
    const res = await t.call(new URL(r.data.url).pathname); assert.equal(res.status, 200);
    execFileSync(process.execPath, ['-e', await res.text()], { env: { ...process.env, HOME: home, USERPROFILE: home } });
    return r.data;
  };
  const home = mkdtempSync(join(tmpdir(), 'astra-setup-'));
  mkdirSync(join(home, '.codex')); writeFileSync(join(home, '.codex', 'config.toml'), 'model = "gpt-old"\napproval_policy = "never"\n\n[mcp_servers.x]\ncommand = "y"\n');
  const c = await run('Codex', home), toml = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
  assert.match(toml, /^model = "claude-opus-5\.5-eco"\nmodel_provider = "astra"/); assert.match(toml, /approval_policy = "never"/); assert.match(toml, /\[mcp_servers\.x\]/);
  assert.ok(toml.includes(`experimental_bearer_token = "${c.key}"`)); assert.match(toml, /\[profiles\.astra-claude-sonnet-5-5-eco\]/); assert.ok(!toml.includes('gpt-old')); assert.ok(existsSync(join(home, '.codex', 'config.toml.bak')));
  await run('OpenCode', home); const oc = JSON.parse(readFileSync(join(home, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.equal(oc.model, 'astra/claude-opus-5.5-eco'); assert.equal(Object.keys(oc.provider.astra.models).length, 3); assert.equal(oc.provider.astra.models['chatgpt-6.1-sol'].limit.context, 160000);
  await run('Claude Code', home); const cc = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
  assert.equal(cc.env.ANTHROPIC_BASE_URL, 'https://t.test'); assert.equal(cc.env.ANTHROPIC_MODEL, 'claude-opus-5.5-eco');
  // ลิงก์ใช้ได้ 3 ครั้ง แล้วหมด · key เก่าของโปรแกรมเดียวกันถูกเพิกถอนเมื่อสร้างใหม่
  const again = await t.json('/api/setup-cmd', { method: 'POST', cookie: u.cookie, body: { tool: 'Codex', model: 'claude-opus-5.5-eco' } }), path = new URL(again.data.url).pathname;
  for (let i = 0; i < 3; i++) assert.equal((await t.call(path)).status, 200);
  assert.equal((await t.call(path)).status, 410);
  assert.equal(t.DB.raw.prepare("SELECT COUNT(*) n FROM api_keys WHERE user_id=? AND name='Setup Codex' AND revoked=0").get(u.id).n, 1);
});
