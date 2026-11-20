// Connectors: สารบบ, เชื่อมแบบไม่ล็อกอิน, MCP OAuth (ค้นหา → ลงทะเบียนแอป → PKCE → callback → token → ต่ออายุ), ใช้ในแชตอัตโนมัติ, ขออนุญาตก่อนแก้/ส่งข้อมูล
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, addModel, addPlan, fakeModel, readSSE } from './helpers.mjs';

const toolSSE = (res, calls, text = '') => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (text) res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: calls.map(([name, args], i) => ({ index: i, id: 'call' + i, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] }) + '\n\n');
  res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) + '\n\n'); res.write('data: [DONE]\n\n'); res.end();
};
// ผู้ให้บริการปลอม: MCP ที่ต้องล็อกอิน (mcp.example.com) + auth server (auth.example.com) + MCP ที่ไม่ต้องล็อกอิน (mcp.context7.com)
function fakeProviders() {
  const real = globalThis.fetch, log = { register: 0, token: [], mcp: [] }; let access = 'acc1', fail401 = false;
  const rpc = (body, tools) => { const b = JSON.parse(body); const result = b.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} } : b.method === 'tools/list' ? { tools } : b.method === 'tools/call' ? { content: [{ type: 'text', text: `did ${b.params.name} ${JSON.stringify(b.params.arguments)}` }] } : {}; return Response.json({ jsonrpc: '2.0', id: b.id, result }); };
  globalThis.fetch = async (url, init = {}) => {
    const s = String(url), auth = init.headers?.authorization;
    if (s === 'https://mcp.example.com/mcp') {
      log.mcp.push([JSON.parse(init.body).method, auth]);
      if (auth !== 'Bearer ' + access || fail401) { fail401 = false; return new Response('no', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"' } }); }
      return rpc(init.body, [{ name: 'search_pages', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, annotations: { readOnlyHint: true } }, { name: 'create_page', description: 'Create a page', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }]);
    }
    if (s === 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp') return Response.json({ resource: 'https://mcp.example.com/mcp', authorization_servers: ['https://auth.example.com'] });
    if (s === 'https://auth.example.com/.well-known/oauth-authorization-server') return Response.json({ issuer: 'https://auth.example.com', authorization_endpoint: 'https://auth.example.com/authorize', token_endpoint: 'https://auth.example.com/token', registration_endpoint: 'https://auth.example.com/register' });
    if (s === 'https://auth.example.com/register') { log.register++; const b = JSON.parse(init.body); assert.equal(b.token_endpoint_auth_method, 'none'); return Response.json({ client_id: 'client-1' }); }
    if (s === 'https://auth.example.com/token') { const b = new URLSearchParams(init.body); log.token.push(Object.fromEntries(b)); if (b.get('grant_type') === 'refresh_token') { access = 'acc2'; return Response.json({ access_token: 'acc2', expires_in: 3600 }); } return Response.json({ access_token: 'acc1', refresh_token: 'ref1', expires_in: 3600 }); }
    if (s === 'https://mcp.context7.com/mcp') { log.mcp.push(['c7', auth]); return rpc(init.body, [{ name: 'get-library-docs', description: 'Docs', inputSchema: { type: 'object', properties: {} } }]); }
    if (s.startsWith('https://')) return new Response('', { status: 404 });
    return real(url, init);
  };
  return { log, restore: () => { globalThis.fetch = real; }, expire: () => { access = 'acc-rotated'; } };
}
async function connectOauth(t, u) {
  const go = await t.call('/api/connectors/go?url=' + encodeURIComponent('https://mcp.example.com/mcp') + '&name=Example', { cookie: u.cookie });
  assert.equal(go.status, 302); const loc = new URL(go.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://auth.example.com/authorize');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256'); assert.ok(loc.searchParams.get('code_challenge')?.length >= 43);
  assert.equal(loc.searchParams.get('resource'), 'https://mcp.example.com/mcp'); assert.equal(loc.searchParams.get('client_id'), 'client-1');
  return loc.searchParams.get('state');
}

test('connectors: directory is seeded; a no-login connector connects at once and its tools are listed', async () => {
  const t = await makeEnv({ K: 'k', SECRET_KEY: 'x'.repeat(40) }), u = await t.user(), fp = fakeProviders();
  try {
    const g = (await t.json('/api/connectors', { cookie: u.cookie })).data;
    assert.ok(g.directory.some(c => c.slug === 'notion' && c.auth === 'oauth') && g.directory.some(c => c.slug === 'context7' && c.auth === 'none'));
    assert.equal(g.mine.length, 0);
    const r = await t.json('/api/connectors/add/context7', { method: 'POST', cookie: u.cookie, body: {} }); assert.equal(r.status, 200, JSON.stringify(r.data));
    const mine = (await t.json('/api/connectors', { cookie: u.cookie })).data.mine; assert.equal(mine.length, 1);
    assert.equal(mine[0].connector, 'context7'); assert.equal(mine[0].auto, true); assert.equal(mine[0].tools[0].name, 'get-library-docs'); assert.equal(mine[0].tools[0].perm, 'allow');
    assert.equal((await t.json('/api/connectors/add/notion', { method: 'POST', cookie: u.cookie, body: {} })).status, 400, 'oauth connectors go through the popup');
  } finally { fp.restore(); }
});

test('connectors: MCP OAuth popup — discovery, one app registration per provider, PKCE, callback only for the same user, tokens sealed', async () => {
  const t = await makeEnv({ K: 'k', SECRET_KEY: 'x'.repeat(40) }), u = await t.user(), other = await t.user(), fp = fakeProviders();
  try {
    const state = await connectOauth(t, u);
    const bad = await t.call(`/api/connectors/callback?state=${state}&code=abc`, { cookie: other.cookie });
    assert.match(bad.headers.get('location'), /\/connected\?ok=0/); assert.equal(t.DB.raw.prepare('SELECT COUNT(*) n FROM mcp_servers').get().n, 0);
    const state2 = await connectOauth(t, u);
    assert.equal(fp.log.register, 1, 'the app registration is reused');
    const cb = await t.call(`/api/connectors/callback?state=${state2}&code=abc`, { cookie: u.cookie });
    assert.match(cb.headers.get('location'), /\/connected\?ok=1&id=\d+/);
    const tok = fp.log.token.at(-1); assert.equal(tok.grant_type, 'authorization_code'); assert.ok(tok.code_verifier?.length >= 43); assert.equal(tok.resource, 'https://mcp.example.com/mcp');
    const row = t.DB.raw.prepare('SELECT * FROM mcp_servers').get(); assert.ok(row.oauth_enc && !row.oauth_enc.includes('acc1') && !row.oauth_enc.includes('ref1'), 'tokens are sealed');
    const again = await t.call(`/api/connectors/callback?state=${state2}&code=abc`, { cookie: u.cookie }); assert.match(again.headers.get('location'), /ok=0/, 'state works once');
    const mine = (await t.json('/api/connectors', { cookie: u.cookie })).data.mine[0];
    assert.deepEqual(mine.tools.map(x => [x.name, x.perm]), [['search_pages', 'allow'], ['create_page', 'allow']], 'every tool is allowed by default (no approval needed)');
  } finally { fp.restore(); }
});

test('connectors in chat: used in every chat automatically, read tools run, a tool set to ask waits for approval, approve runs once, refresh on 401, deny and per-chat off hide tools', async () => {
  const fp = fakeProviders(); let step = 0, toolsSeen = [];
  const fm = await fakeModel((q, res, body) => {
    toolsSeen.push((body.tools || []).map(x => x.function.name));
    const id = fm.mcpId, tools = body.messages.filter(x => x.role === 'tool');
    step++;
    if (fm.mode === 'plain') return fm.sse(res, 'ok');
    if (!tools.length) return toolSSE(res, [[`mcp_${id}_search_pages`, { q: 'roadmap' }], [`mcp_${id}_create_page`, { title: 'Plan' }]]);
    return fm.sse(res, 'should not run: the answer stops for approval');
  });
  const t = await makeEnv({ K: 'k', SECRET_KEY: 'x'.repeat(40) }), m = addModel(t.DB, { name: 'M', base_url: fm.url });
  await t.json('/api/version'); t.DB.raw.prepare("UPDATE models SET tools='on' WHERE id=?").run(m.id);
  const plan = addPlan(t.DB, { models: [m.id], limit_4h: 1e6, limit_week: 1e6, price: 0 }), u = await t.user();
  t.DB.raw.prepare('UPDATE users SET plan_id=?, plan_expires=? WHERE id=?').run(plan.id, Date.now() + 864e5, u.id);
  try {
    const state = await connectOauth(t, u); await t.call(`/api/connectors/callback?state=${state}&code=abc`, { cookie: u.cookie });
    const sv = t.DB.raw.prepare('SELECT id FROM mcp_servers').get(); fm.mcpId = sv.id;
    t.DB.raw.prepare(`UPDATE mcp_servers SET perms_json='{"create_page":"ask"}' WHERE id=?`).run(sv.id); // ผู้ใช้ตั้งเครื่องมือนี้เป็น "ถามก่อน" เอง
    fp.expire(); // access token หมุนแล้ว: เรียกครั้งแรกได้ 401 → ต่ออายุ → ลองใหม่
    const ev = await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'สร้างหน้าแผนงาน', model_id: m.id } }));
    assert.ok(toolsSeen[0].includes(`mcp_${sv.id}_search_pages`), 'connector tools offered without picking them');
    assert.equal(fp.log.token.at(-1).grant_type, 'refresh_token');
    const calls = fp.log.mcp.filter(([meth]) => meth === 'tools/call'); assert.equal(calls.length, 1, 'only the read tool ran'); assert.equal(calls[0][1], 'Bearer acc2');
    const text = ev.filter(e => e.t).map(e => e.t).join(''), aid = +text.match(/\[\[approve:(\d+)\|/)[1];
    assert.equal(step, 1, 'the answer stops after asking');
    const view = (await t.json('/api/connectors/approve/' + aid, { cookie: u.cookie })).data; assert.equal(view.tool, 'create_page'); assert.deepEqual(view.args, { title: 'Plan' }); assert.equal(view.status, 'pending');
    const other = await t.user(); assert.equal((await t.json('/api/connectors/approve/' + aid, { method: 'POST', cookie: other.cookie, body: { decision: 'once' } })).status, 404);
    const ok = (await t.json('/api/connectors/approve/' + aid, { method: 'POST', cookie: u.cookie, body: { decision: 'once' } })).data;
    assert.equal(ok.status, 'done'); assert.match(ok.result, /did create_page \{"title":"Plan"\}/);
    assert.equal((await t.json('/api/connectors/approve/' + aid, { method: 'POST', cookie: u.cookie, body: { decision: 'once' } })).status, 409, 'runs once');
    // ห้ามใช้ / ปิดในแชตนี้
    fm.mode = 'plain';
    await t.json(`/api/connectors/mine/${sv.id}`, { method: 'PATCH', cookie: u.cookie, body: { perms: { search_pages: 'deny' } } });
    await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'x', model_id: m.id } }));
    assert.ok(!toolsSeen.at(-1).includes(`mcp_${sv.id}_search_pages`) && toolsSeen.at(-1).includes(`mcp_${sv.id}_create_page`));
    await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'y', model_id: m.id, mcp_off: [sv.id] } }));
    assert.ok(!toolsSeen.at(-1).some(n => n.startsWith(`mcp_${sv.id}_`)), 'off in this chat');
    await t.json(`/api/connectors/mine/${sv.id}`, { method: 'PATCH', cookie: u.cookie, body: { auto: false } });
    await readSSE(await t.call('/api/chat', { method: 'POST', cookie: u.cookie, body: { text: 'z', model_id: m.id } }));
    assert.ok(!toolsSeen.at(-1).some(n => n.startsWith(`mcp_${sv.id}_`)), 'auto off');
  } finally { fp.restore(); fm.close(); }
});

test('plugins: seeded bundles; install adds skills + slash commands and connects no-login connectors; uninstall removes only the plugin items', async () => {
  const t = await makeEnv({ K: 'k', SECRET_KEY: 'x'.repeat(40) }), u = await t.user(), fp = fakeProviders();
  try {
    t.DB.raw.prepare("INSERT INTO skills (user_id,name,description,content,enabled,created_at) VALUES (?, 'mine', '', 'x', 1, 0)").run(u.id);
    const list = (await t.json('/api/plugins', { cookie: u.cookie })).data; const dev = list.find(p => p.slug === 'dev');
    assert.ok(dev && !dev.installed && dev.connectors.some(c => c.slug === 'context7') && dev.commands.some(c => c.name === 'review'));
    // context7 ตอบได้ (ไม่ต้องล็อกอิน) · deepwiki ไม่ตอบ (404) = รายงานว่าเชื่อมไม่สำเร็จ
    const r = (await t.json('/api/plugins/dev', { method: 'POST', cookie: u.cookie })).data;
    assert.equal(r.plugin.installed, true); assert.ok(r.failed.includes('DeepWiki'));
    assert.ok(r.plugin.connectors.find(c => c.slug === 'context7').connected);
    const sk = (await t.json('/api/skills', { cookie: u.cookie })).data.filter(x => x.user_id === u.id);
    assert.ok(sk.some(x => x.name === 'review' && x.as_text === 1) && sk.some(x => x.name === 'dev-rules' && x.as_text === 0));
    await t.json('/api/plugins/dev', { method: 'POST', cookie: u.cookie }); // ติดตั้งซ้ำไม่ซ้ำซ้อน
    assert.equal((await t.json('/api/skills', { cookie: u.cookie })).data.filter(x => x.name === 'review').length, 1);
    await t.json('/api/plugins/dev', { method: 'DELETE', cookie: u.cookie });
    const left = (await t.json('/api/skills', { cookie: u.cookie })).data.filter(x => x.user_id === u.id).map(x => x.name);
    assert.deepEqual(left, ['mine']);
    assert.equal((await t.json('/api/connectors', { cookie: u.cookie })).data.mine.length, 1, 'connectors stay after uninstall');
  } finally { fp.restore(); }
});

test('Google connector is offered when the admin saved a Google client id in settings (not only as a Worker secret)', async () => {
  const t = await makeEnv(), u = await t.user();
  assert.equal((await t.json('/api/connectors', { cookie: u.cookie })).data.google, false);
  t.DB.raw.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('google_client_id','abc.apps.googleusercontent.com')").run();
  assert.equal((await t.json('/api/connectors', { cookie: u.cookie })).data.google, true);
});
