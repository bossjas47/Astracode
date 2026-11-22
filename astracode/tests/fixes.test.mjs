import test from 'node:test';
import assert from 'node:assert/strict';

test('derToRaw: rejects non-DER and oversized (>32 byte) integers safely', async () => {
  const { derToRaw } = await import('../src/passkey.js');
  assert.equal(derToRaw(new Uint8Array([0x00, 0x01])), null);
  assert.equal(derToRaw(new Uint8Array([0x30, 0x24, 0x02, 0x22, ...Array(34).fill(1)])), null);
  const r = new Uint8Array(32).fill(7), s = new Uint8Array(32).fill(9);
  const valid = new Uint8Array([0x30, 68, 0x02, 32, ...r, 0x02, 32, ...s]);
  const raw = derToRaw(valid);
  assert.equal(raw?.length, 64);
  assert.equal(raw[0], 7);
  assert.equal(raw[32], 9);
});

test('anthropicToChat + callModel: preserves system blocks and places up to 4 cache_control breakpoints', async () => {
  const { anthropicToChat } = await import('../src/api.js');
  const { callModel } = await import('../src/ai.js');
  const chat = anthropicToChat({
    model: 'claude-opus-5.5-eco',
    system: [
      { type: 'text', text: 'Static rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Dynamic clock: 15:46' },
    ],
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.equal(chat._sys_blocks?.length, 2);
  assert.ok(chat._sys_blocks[0].cache_control);
  assert.equal(chat._sys_blocks[1].cache_control, undefined);

  const origFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_u, init) => {
    sent = JSON.parse(init.body);
    return new Response('data: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_read_input_tokens":500,"cache_creation_input_tokens":0}}}\n\ndata: {"type":"message_stop"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const m = { provider: 'anthropic', api_model: 'claude-opus-5.5-eco', base_url: 'https://mock.local', key_name: 'K' };
    const msgs = [
      { role: 'user', content: 'm1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'm2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: [{ type: 'text', text: 'm3' }, { type: 'text', text: '   ' }] },
    ];
    const tools = [{ type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object' } } }];
    for await (const _ of callModel({ K: 'k' }, m, msgs, { system: 'Static\nDynamic', systemBlocks: chat._sys_blocks, tools, cacheTtl: '1h' })) {}
  } finally { globalThis.fetch = origFetch; }

  const countCc = o => !o || typeof o !== 'object' ? 0 : (o.cache_control ? 1 : 0) + Object.values(o).reduce((a, v) => a + countCc(v), 0);
  assert.equal(countCc(sent), 4);
  assert.equal(sent.tools[0].cache_control?.ttl, '1h');
  assert.ok(sent.system[0].cache_control);
  assert.equal(sent.system[1].cache_control, undefined);
  assert.ok(sent.messages[2].content[0].cache_control);
  assert.ok(sent.messages[4].content[0].cache_control, 'skips trailing whitespace-only text block');
  assert.equal(sent.messages[4].content[1].cache_control, undefined);
});
