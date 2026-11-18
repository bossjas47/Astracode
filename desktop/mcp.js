// ต่อ MCP server แบบ stdio ตามค่าที่ผู้ใช้ตั้ง ({ "mcpServers": { "blender": { "command": "uvx", "args": ["blender-mcp"] } } })
async function startMcp(cfg, log = () => {}) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const tools = [], map = new Map(), clients = [];
  for (const [srv, c] of Object.entries(cfg?.mcpServers || {})) {
    try {
      const client = new Client({ name: 'astracode-desktop', version: '0.1.0' }, { capabilities: {} });
      await client.connect(new StdioClientTransport({ command: c.command, args: c.args || [], env: { ...process.env, ...(c.env || {}) } }));
      clients.push(client);
      for (const t of (await client.listTools()).tools || []) {
        const name = `mcp_${srv}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
        map.set(name, { client, name: t.name });
        tools.push({ type: 'function', function: { name, description: `[${srv}] ${t.description || t.name}`.slice(0, 1000), parameters: t.inputSchema || { type: 'object', properties: {} } } });
      }
      log(`ต่อ MCP "${srv}" แล้ว`);
    } catch (e) { log(`ต่อ MCP "${srv}" ไม่ได้: ${e.message}`); }
  }
  const call = async (name, args) => {
    const m = map.get(name); if (!m) throw new Error('ไม่พบเครื่องมือ ' + name);
    const r = await m.client.callTool({ name: m.name, arguments: args });
    const text = (r.content || []).filter(x => x.type !== 'image').map(x => x.text ?? JSON.stringify(x)).join('\n');
    const images = (r.content || []).filter(x => x.type === 'image' && x.data).map(x => `data:${x.mimeType || 'image/png'};base64,${x.data}`);
    return { text: (r.isError ? 'Error: ' : '') + text, images };
  };
  const close = async () => { for (const c of clients) await c.close().catch(() => {}); };
  return { tools, call, has: n => map.has(n), close };
}
module.exports = { startMcp };
