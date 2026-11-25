// Kyber: หน้า API นักพัฒนา, ติดต่อเรา, บล็อก, สถานะระบบ, ใบเสร็จ
const pre = code => `<div class="code"><div class="code-h"><span>${code[0]}</span><button class="cp-code">Copy</button></div><pre><code>${esc(code[1])}</code></pre></div>`;
const bindCopy = () => app.querySelectorAll('.cp-code').forEach(b => b.onclick = () => copy(b.closest('.code').querySelector('code').textContent, b));

// ---------- API สำหรับนักพัฒนา ----------
PAGES.developers = async () => {
  const [pr, keys, kstats] = await Promise.all([api('/pricing'), me ? api('/keys') : null, me ? api('/keys/stats').catch(() => []) : []]);
  const base = location.origin + '/v1', slug = n => n.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
  const first = pr.models[0] ? slug(pr.models[0].name) : 'model-name';
  // โมเดลที่ใช้ได้จริงของผู้ใช้ (ล็อกอิน) · wallet = หักเงิน Wallet ไม่ใช้ลิมิตแพลน (โมเดลนอกแพลน / Uncen)
  const cms = (me ? me.models.filter(m => !m.locked && !['image', 'embedding'].includes(m.provider)) : pr.models).map(m => ({ name: m.name, slug: slug(m.name), wallet: !!m.wallet || /uncen/i.test(m.name) }));
  const planMs = cms.filter(m => !m.wallet), pick0 = (planMs.find(m => /sonnet 5\.5 eco/i.test(m.name)) || planMs[0] || cms[0])?.slug || first;
  let tab = me ? 'keys' : 'connect', ctool = 'Codex', cmodel = pick0, cos = /Win/i.test(navigator.platform || navigator.userAgent) ? 'win' : 'unix', setupRes = null;
  const canUse = !!me && (me.plan.paid || me.balance >= 1);
  const fld = (label, val, id = '') => `<label>${label}</label><div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(val)}" ${id ? `id="${id}"` : ''} data-select><button type="button" class="btn out sm" data-cp="${esc(val)}">Copy</button></div>`;
  const TOOLS = { // วิธีใส่ค่าในแต่ละโปรแกรม: k = key (หรือ placeholder), m = model id
    'Cline / Roo': (k, m) => ['ตั้งค่าใน VS Code', `API Provider: OpenAI Compatible\nBase URL: ${base}\nAPI Key: ${k}\nModel ID: ${m}`],
    'Cursor': (k, m) => ['Settings → Models', `เปิด "Override OpenAI Base URL" ใส่: ${base}\nOpenAI API Key: ${k}\nกด "+ Add model" ใส่: ${m}`],
    'Claude Code': (k, m) => ['terminal', `export ANTHROPIC_BASE_URL=${location.origin}\nexport ANTHROPIC_AUTH_TOKEN=${k}\nexport ANTHROPIC_MODEL=${m}\nclaude`],
    'Codex': (k, m) => ['~/.codex/config.toml (Windows: C:\\Users\\ชื่อ\\.codex\\config.toml) · ใส่ key ตรงๆ ไม่ต้องตั้งตัวแปร · แก้แล้วปิด Codex ให้หมดแล้วเปิดใหม่', `model = "${m}"\nmodel_provider = "astra"\n\n[model_providers.astra]\nname = "Kyber"\nbase_url = "${base}"\nexperimental_bearer_token = "${k}"\nwire_api = "responses"\n\n# สลับโมเดล: codex --profile opus (หรือ sonnet / gpt) · ใช้ชื่อโมเดลอื่นได้จาก /v1/models\n[profiles.opus]\nmodel = "claude-opus-5.5-eco"\nmodel_provider = "astra"\n\n[profiles.sonnet]\nmodel = "claude-sonnet-5.5-eco"\nmodel_provider = "astra"\n\n[profiles.gpt]\nmodel = "chatgpt-6.1-sol"\nmodel_provider = "astra"`],
    'OpenCode': (k, m) => ['opencode.json', `{\n  "provider": {\n    "astra": {\n      "npm": "@ai-sdk/openai-compatible",\n      "options": { "baseURL": "${base}", "apiKey": "${k}" },\n      "models": { "${m}": { "limit": { "context": 1050000, "output": 128000 } } }\n    }\n  }\n}`],
    'Python': (k, m) => ['python (pip install openai)', `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="${k}")\nr = client.chat.completions.create(\n    model="${m}",\n    messages=[{"role": "user", "content": "สวัสดี"}],\n)\nprint(r.choices[0].message.content)`],
    'JavaScript': (k, m) => ['node (npm i openai)', `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${base}", apiKey: "${k}" });\nconst r = await client.chat.completions.create({\n  model: "${m}",\n  messages: [{ role: "user", content: "สวัสดี" }],\n});\nconsole.log(r.choices[0].message.content);`],
    'curl': (k, m) => ['curl', `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${m}","messages":[{"role":"user","content":"สวัสดี"}]}'`],
  };
  const draw = (newKey = '') => {
    page(nav() + `<div class="wrap" style="max-width:820px"><section class="hero" style="padding:56px 0 24px"><div class="name">Kyber API</div><h1>API สำหรับนักพัฒนา</h1><p class="muted" style="margin-top:-4px">สร้างโดย Hypatia</p>
      <p>เรียกทุกโมเดลผ่าน API แบบ OpenAI ใช้กับ SDK และเครื่องมือที่รองรับ OpenAI ได้ทันที จ่ายตามจริงจาก Wallet</p></section>
      <div class="seg devtabs" role="tablist">${[['keys', 'API Key ของฉัน'], ['connect', 'เชื่อมต่อโปรแกรม'], ['docs', 'คู่มือและราคา']].map(([k, l]) => `<button type="button" role="tab" data-dt="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div data-pane="keys" ${tab === 'keys' ? '' : 'hidden'}>${me ? `
        <div class="card dv-status ${canUse ? 'ok' : 'warn'}">${h3k(canUse ? '✓ พร้อมใช้ API' : 'ยังใช้ API ไม่ได้')}
          <p style="margin:0">${me.plan.api_limit ? `หักจาก<b>ลิมิตแพลน ${esc(me.plan.name)}</b> ก่อน (4 ชม. ${me.usage.pct4h}% · สัปดาห์ ${me.usage.pctWeek}%) ลิมิตเต็มแล้วตัดจาก Wallet` : `ตัดเงินจาก <b>Wallet</b> ตามที่ใช้จริง`} · Wallet คงเหลือ <b>฿${baht(me.balance)}</b></p>
          ${canUse ? '' : '<p style="margin:8px 0 0">เติม Wallet อย่างน้อย ฿1 หรือสมัครแพลนที่รองรับ API ก่อน</p>'}<div class="row" style="margin-top:10px"><a class="btn out sm" href="/plans?topup=1">เติม Wallet</a></div></div>
        <div class="card">${h3k('💻 Kyber Desktop (Windows)')}<p class="muted" style="margin:0 0 10px">เว็บนี้ในหน้าต่างแอป ล็อกอินบัญชีเดียวกัน แล้วให้ AI แก้ไฟล์จริงในเครื่อง (โหมด Code → โฟลเดอร์ในเครื่อง) รันคำสั่ง และคุมโปรแกรมอย่าง Blender ผ่าน MCP (แชต → + → ใช้คอมเครื่องนี้)</p><a class="btn blue sm" href="/download/desktop">Windows (.exe)</a> <a class="btn out sm" href="/download/desktop?os=mac">Mac (.dmg)</a> <a class="btn out sm" href="/download/desktop?os=linux">Linux (.AppImage)</a> <a class="btn out sm" href="/download/cli">CLI (เทอร์มินัล / VS Code)</a><p class="muted" style="font-size:12.5px;margin:8px 0 0">ยังไม่เซ็นรับรอง · Windows เตือน: More info → Run anyway · Mac: คลิกขวาที่แอป → Open (ถ้าขึ้นว่าไฟล์เสีย รัน <code>xattr -cr /Applications/Kyber\ Desktop.app</code>) · Linux: chmod +x แล้วเปิด · ติดตั้งแล้วอัปเดตเอง (Mac ต้องโหลดใหม่เอง) · เปิดแอปแล้วกด <a href="astracode://open?path=/chat">เปิดในแอป</a> ได้</p></div>
        ${newKey ? `<div class="card dv-new">${h3k('🔑 API Key ใหม่ของคุณ')}<p class="warn" style="margin:0 0 8px">คัดลอกเก็บไว้ตอนนี้ ระบบจะไม่แสดงอีก</p>
          ${fld('API Key', newKey, 'nk')}${fld('Base URL', base)}<p class="muted" style="font-size:13px;margin:6px 0 0">ใส่ 2 ค่านี้ในโปรแกรมที่ใช้ แล้วเลือกโมเดล · ดูวิธีใส่ในแต่ละโปรแกรมที่แท็บ <a href="#" data-goto="connect">เชื่อมต่อโปรแกรม</a></p></div>` : ''}
        <div class="card">${h3k('API Key ของฉัน')}
          ${canUse ? `<form id="kf" class="row stack-m" style="flex-wrap:nowrap;margin-bottom:6px"><input name="name" placeholder="ตั้งชื่อ key เช่น cline, my-app" maxlength="40"><button class="btn blue">+ สร้าง API Key</button></form>
            <details class="muted" style="font-size:13px;margin-bottom:10px"><summary>ตัวเลือกเพิ่ม</summary><label style="margin-top:6px">อายุ key</label><select name="days" form="kf" style="width:auto"><option value="0">ไม่หมดอายุ</option><option value="7">7 วัน</option><option value="30">30 วัน</option><option value="90">90 วัน</option></select></details><div class="err" id="ke"></div>` : ''}
          ${keys.length ? `<div class="klist">${keys.map(k => `<div class="krow"><div class="kinfo"><b>${esc(k.name)}</b><code>${esc(k.prefix)}…</code><span class="muted">เดือนนี้ ฿${money(k.spent)}${k.budget != null ? ` / งบ ฿${baht(k.budget)}` : ''} · ใช้ล่าสุด ${k.last_used ? when(k.last_used) : 'ยังไม่เคยใช้'}</span></div>
            <div class="kbtn"><button type="button" class="btn out sm" data-ks="${k.id}">ตั้งค่า</button><button type="button" class="btn out sm" data-lg="${k.id}">ประวัติ</button><button type="button" class="btn out sm danger" data-rk="${k.id}" aria-label="ลบ key ${esc(k.name)}">ลบ</button></div></div>`).join('')}</div>` : '<p class="muted">ยังไม่มี key กดสร้างด้านบนได้เลย</p>'}
        </div>
            ${me ? `<div class="card">${h3k('ทดสอบ API (Playground)')}
        <form id="pg" class="form2">
          <div><label>API Key</label><input id="pgk" placeholder="sk-astra-..." value="${esc(newKey)}" required></div>
          <div><label>โมเดล</label><select id="pgm">${pr.models.map(m => `<option value="${esc(slug(m.name))}">${esc(m.name)} (${esc(slug(m.name))})</option>`).join('')}</select></div>
        </form>
        <label for="pgt">ข้อความทดสอบ</label><div class="row" style="flex-wrap:nowrap"><input id="pgt" value="สวัสดี ตอบสั้นๆ 1 ประโยค"><button type="button" class="btn blue sm" id="pgrun">Test</button></div>
        <div id="pgo" class="muted" style="margin-top:10px;font-size:13px"></div></div>` : ''}
      ${me && kstats.length ? `<div class="card">${h3k('ยอดใช้ API 14 วันล่าสุด')}<div class="ubars">${kstats.map(r => { const mx = Math.max(...kstats.map(x => x.n), 1); return `<div class="ubar" title="${r.d}: ${r.n} ครั้ง · ฿${baht(r.spent)}"><i style="height:${Math.max(4, Math.round(r.n / mx * 100))}%"></i><span>${r.d.slice(8)}</span></div>`; }).join('')}</div></div>` : ''}
        <details class="card"><summary>${h3k('แจ้งเตือนผ่าน Webhook (ไม่บังคับ)')}</summary><form id="whf" class="row stack-m" style="flex-wrap:nowrap;margin-top:10px"><input name="webhook_url" type="url" value="${esc(me.webhook_url || '')}" placeholder="https://... แจ้งเมื่อ key ใช้งบถึง 80% และ 100%"><button class="btn out sm">Save</button></form></details>`
        : `<div class="card" style="text-align:center"><p>เข้าสู่ระบบเพื่อสร้าง API key</p><a class="btn blue" href="/login?next=/developers">Log in</a></div>`}</div>
      <div data-pane="connect" ${tab === 'connect' ? '' : 'hidden'}><div class="card">${h3k('เชื่อมต่อโปรแกรมใน 3 ขั้น')}
        <div class="cstep"><b>1</b><span>เลือกโปรแกรม</span></div>
        <div class="vchips" id="ctools">${Object.keys(TOOLS).map(t => `<button type="button" data-ct="${t}" class="${t === ctool ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="cstep"><b>2</b><span>เลือกโมเดลหลัก</span></div>
        <select id="cm">${planMs.length ? `<optgroup label="ใช้ลิมิตแพลน">${planMs.map(m => `<option value="${esc(m.slug)}" ${m.slug === cmodel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>` : ''}${cms.some(m => m.wallet) ? `<optgroup label="หักเงิน Wallet (นอกแพลน / Uncen)">${cms.filter(m => m.wallet).map(m => `<option value="${esc(m.slug)}" ${m.slug === cmodel ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>` : ''}</select>
        <div id="cmwarn"></div>
        <div class="cstep"><b>3</b><span>ติดตั้ง</span></div>
        <div id="csnip"></div></div></div>
      <div data-pane="docs" ${tab === 'docs' ? '' : 'hidden'}>
      <div class="band"><h2>เริ่มใช้</h2>
        <p class="muted">Base URL: <code>${esc(base)}</code> · ส่ง key ใน header <code>Authorization: Bearer sk-astra-...</code></p>
        ${pre(['curl', `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $ASTRA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${first}","messages":[{"role":"user","content":"สวัสดี"}]}'`])}
        ${pre(['python', `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="sk-astra-...")\nr = client.chat.completions.create(\n    model="${first}",\n    messages=[{"role": "user", "content": "สวัสดี"}],\n    stream=True,\n)\nfor chunk in r:\n    print(chunk.choices[0].delta.content or "", end="")`])}
        ${pre(['javascript', `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${base}", apiKey: process.env.ASTRA_KEY });\nconst r = await client.chat.completions.create({\n  model: "${first}",\n  messages: [{ role: "user", content: "สวัสดี" }],\n});\nconsole.log(r.choices[0].message.content);`])}
      </div>
      <div class="band"><h2>โมเดลและราคา</h2><p class="muted">ราคาเป็นบาทต่อ 1M token · ส่ง <code>reasoning_effort</code> = low / high / max เพื่อให้โมเดลที่รองรับคิดก่อนตอบ</p>
        <div class="tw"><table class="tbl"><tr><th>model</th><th>Input</th><th>Output</th><th>Cache</th></tr>${pr.models.map(m => `<tr><td><code>${esc(slug(m.name))}</code>${m.promo ? ` <span class="pill sale">-${m.promo.pct}%</span>` : ''}${m.long ? `<br><small class="muted">input ตั้งแต่ ${m.long.k}K token ต่อคำขอ: Input/Cache ×${m.long.in} · Output ×${m.long.out}</small>` : ''}</td>${['in', 'out', 'cache'].map(k => `<td>${m.promo ? `<s class="muted">฿${money(m.promo[k])}</s> ` : ''}฿${money(m[k])}</td>`).join('')}</tr>`).join('')}</table></div></div>
      <div class="band"><h2>ตัวอย่างอื่นๆ</h2>
        <p class="muted">สร้างรูป (<code>POST /v1/images/generations</code>): ใช้ได้กับโมเดลประเภทสร้างรูปเท่านั้น คิดเงินต่อรูป ตอบกลับเป็น <code>b64_json</code> (หรือ <code>url</code> ถ้าผู้ให้บริการส่งลิงก์มา) รองรับ <code>n=1</code>, <code>size</code>, <code>quality</code></p>
        ${pre(['curl', `curl ${base}/images/generations \\\n  -H "Authorization: Bearer $ASTRA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"IMAGE_MODEL","prompt":"a red fox in the snow","size":"1024x1024"}'`])}
        <p class="muted">JSON mode, tools และพารามิเตอร์ที่รองรับ: <code>temperature</code> (0–2), <code>top_p</code> (0–1), <code>presence_penalty</code> / <code>frequency_penalty</code> (-2–2), <code>seed</code>, <code>stop</code> (สูงสุด 4), <code>max_tokens</code>, <code>response_format</code> (<code>json_object</code> / <code>json_schema</code>), <code>tools</code> + <code>tool_choice</code>, <code>reasoning_effort</code>, <code>stream</code> (usage อยู่ใน chunk สุดท้ายเสมอ) · โมเดลที่กำลังคิด (ใส่ <code>reasoning_effort</code>) จะไม่รับ <code>temperature</code>/<code>top_p</code>/<code>stop</code> และโมเดลที่ไม่รองรับ JSON mode โดยตรงจะได้คำสั่งให้ตอบเป็น JSON แทน ค่าผิดรูปแบบตอบ 400</p>
        ${pre(['python', `r = client.chat.completions.create(\n    model="${first}",\n    messages=[{"role": "user", "content": "List 3 fruits as JSON"}],\n    response_format={"type": "json_object"},\n    temperature=0.2,\n    seed=7,\n)\nprint(r.choices[0].message.content)`])}
      </div>
      <div class="band"><h2>เครื่องมือที่ใช้ได้เลย</h2>
        <p class="muted">นอกจาก <code>/v1/chat/completions</code> ยังรองรับ <code>POST /v1/responses</code> (OpenAI Responses API), <code>POST /v1/messages</code> + <code>/v1/messages/count_tokens</code> (Anthropic Messages API ใช้กับ Claude Code และ SDK ของ Anthropic ได้ ส่ง key ทาง <code>x-api-key</code> หรือ <code>Authorization</code>), <code>POST /v1/embeddings</code> (เมื่อแอดมินเปิดโมเดลเวกเตอร์) และ <code>GET /v1/usage?days=30</code> (ประวัติรายวันและแยกโมเดล)</p>
        ${pre(['claude code', `export ANTHROPIC_BASE_URL=${location.origin}\nexport ANTHROPIC_AUTH_TOKEN=sk-astra-...\nexport ANTHROPIC_MODEL=${first}`])}
        ${pre(['python', `import anthropic\nc = anthropic.Anthropic(base_url="${location.origin}", api_key="sk-astra-...")\nm = c.messages.create(model="${first}", max_tokens=512, messages=[{"role": "user", "content": "สวัสดี"}])\nprint(m.content[0].text)`])}
      </div>
      <div class="band" id="agents"><h2>ใช้กับ Agent บนคอมพิวเตอร์</h2><p class="muted">ให้ AI แก้โค้ดในเครื่อง รันคำสั่ง และคุมโปรแกรมอื่นผ่าน MCP โดยใช้โมเดลและ Wallet ของ Kyber · แนะนำให้สร้าง key แยกและตั้งงบรายเดือนของ key ไว้ เพราะ Agent ใช้ token มาก</p>
        <p><b>Cline / Roo Code / Kilo Code (VS Code)</b>: Settings → API Provider = <code>OpenAI Compatible</code> · Base URL = <code>${base}</code> · API Key = <code>sk-astra-...</code> · Model ID = <code>${first}</code></p>
        ${pre(['codex ~/.codex/config.toml', `model = "${first}"\nmodel_provider = "astra"\n\n[model_providers.astra]\nname = "Kyber"\nbase_url = "${base}"\nexperimental_bearer_token = "sk-astra-..."\nwire_api = "responses"`])}
        ${pre(['opencode opencode.json', `{\n  "provider": {\n    "astra": {\n      "npm": "@ai-sdk/openai-compatible",\n      "options": { "baseURL": "${base}", "apiKey": "{env:ASTRA_KEY}" },\n      "models": { "${first}": { "limit": { "context": 1050000, "output": 128000 } } }\n    }\n  }\n}`])}
        <p><b>Claude Code</b>: ตั้ง <code>ANTHROPIC_BASE_URL</code> ตามตัวอย่างด้านบน แล้วเพิ่ม MCP ได้ตามปกติ</p>
        ${pre(['MCP: Blender / Unity', `# Blender: ลง add-on blender-mcp ใน Blender แล้วกด Connect\nclaude mcp add blender -- uvx blender-mcp\n\n# Unity: ลงแพ็กเกจ Unity MCP ผ่าน Package Manager แล้วเพิ่ม server ตามคู่มือของแพ็กเกจ`])}
        <p class="muted" style="font-size:13px">เลือกโมเดลที่เรียก tool เก่ง (เช่นรุ่นใหญ่ของ Claude/ChatGPT) งานที่ส่งภาพหน้าจอ เช่น Blender ต้องใช้โมเดลที่อ่านรูปได้ · ถ้าเครื่องมือไหนต่อไม่ได้ แจ้งเราที่หน้า <a href="/support">ติดต่อเรา</a></p>
      </div>
      <div class="band"><h2>รหัสข้อผิดพลาด</h2><p class="muted">รูปแบบ <code>{"error": {"message": "...", "message_th": "...", "type": "..."}}</code> · <code>message</code> เป็นภาษาอังกฤษ ส่วน <code>message_th</code> เป็นไทย</p>
        <div class="tw"><table class="tbl"><tr><th>HTTP</th><th>type</th><th>ความหมาย</th></tr>
          <tr><td>400</td><td><code>invalid_request_error</code></td><td>พารามิเตอร์ผิด เช่น temperature เกินช่วง, messages ว่าง, ส่งรูปให้โมเดลที่ไม่รองรับ</td></tr>
          <tr><td>401</td><td><code>invalid_api_key</code></td><td>key ผิด ถูกเพิกถอน หรือบัญชีถูกระงับ</td></tr>
          <tr><td>402</td><td><code>insufficient_quota</code></td><td>ยอด Wallet ไม่พอ</td></tr>
          <tr><td>404</td><td><code>invalid_request_error</code></td><td>ไม่พบโมเดล หรือ key นี้ไม่ได้รับอนุญาตให้ใช้โมเดลนี้</td></tr>
          <tr><td>413</td><td><code>invalid_request_error</code></td><td>คำขอยาวเกินไป</td></tr>
          <tr><td>403</td><td><code>permission_error</code></td><td>IP นี้ไม่อยู่ในรายการที่อนุญาตของ key</td></tr>
          <tr><td>429</td><td><code>rate_limit_error</code></td><td>เกิน 60 ครั้ง/นาที หรือมีคำขอ Wallet ค้างอยู่ — ดู <code>retry-after</code></td></tr>
          <tr><td>429</td><td><code>insufficient_quota</code></td><td>งบรายเดือนของ key หมด หรือลิมิตแพลนเต็ม (ไม่มี retry-after)</td></tr>
          <tr><td>502</td><td><code>api_error</code></td><td>โมเดลต้นทางตอบไม่ได้ (ระบบลองโมเดลสำรองให้แล้ว)</td></tr></table></div>
        <p class="muted">ทุกคำตอบของ <code>/v1/chat/completions</code> / <code>/v1/images/generations</code> : <code>x-ratelimit-limit-requests</code>, <code>x-ratelimit-remaining-requests</code>, <code>x-ratelimit-reset-requests</code>, <code>x-astracode-billing</code> (plan / wallet · ชื่อใหม่ <code>x-kyber-billing</code> ค่าเดียวกัน)</p>
      </div>
      <div class="band"><h2>ข้อจำกัด</h2><ul class="muted"><li>60 คำขอต่อนาทีต่อ key</li><li>Wallet ต้องมียอดมากกว่า 0 ก่อนเรียก (คำขอสุดท้ายอาจทำให้ยอดติดลบเล็กน้อย)</li><li>ตั้งงบต่อเดือนและจำกัดโมเดลแยกแต่ละ key ได้ (เกินงบ = ตอบ 429)</li><li>รองรับ <code>/v1/models</code>, <code>/v1/usage</code> (เช็ก % ลิมิตและยอด Wallet), <code>/v1/chat/completions</code> (ข้อความ, รูปภาพ, tools, stream), <code>/v1/images/generations</code></li></ul></div>
      </div>
      ${footer()}</div>`);
    bindCopy();
    $('#pgrun')?.addEventListener('click', async () => {
      const k = $('#pgk').value.trim(), mdl = $('#pgm').value, msg = $('#pgt').value.trim(), out = $('#pgo');
      if (!k || !msg) return toast('ใส่ API Key และข้อความก่อน', 'bad');
      out.textContent = 'กำลังส่งคำขอ...'; const t0 = performance.now();
      try {
        const r = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k }, body: JSON.stringify({ model: mdl, messages: [{ role: 'user', content: msg }] }) });
        const d = await r.json(), ms = Math.round(performance.now() - t0), bill = r.headers.get('x-astracode-billing') || '-';
        if (!r.ok) { out.innerHTML = `<span class="bad">${esc(d.error?.message || 'HTTP ' + r.status)}</span>`; return; }
        const ans = d.choices?.[0]?.message?.content || '';
        out.innerHTML = `<div class="ok" style="margin-bottom:6px">HTTP 200 · ${ms} ms · หักจาก: <b>${esc(bill)}</b> · ${d.usage ? `${d.usage.total_tokens} tokens` : ''}</div><div class="code" style="padding:12px">${esc(ans)}</div>`;
      } catch (x) { out.innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    });
    $('#cpk')?.addEventListener('click', e => copy($('#nk').value, e.target));
    $('#whf')?.addEventListener('submit', async e => { e.preventDefault(); try { await api('/me', { method: 'PUT', body: { webhook_url: new FormData(e.target).get('webhook_url') } }); await loadMe(); toast('บันทึก Webhook แล้ว', 'ok'); } catch (x) { toast(x.message, 'bad'); } });
    $('#kf')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('/keys', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); keys.splice(0, keys.length, ...await api('/keys')); draw(r.key); }
      catch (x) { $('#ke').textContent = x.message; }
    });
    const setTab = t => { tab = t; app.querySelectorAll('[data-dt]').forEach(x => x.classList.toggle('on', x.dataset.dt === t)); app.querySelectorAll('[data-pane]').forEach(x => x.hidden = x.dataset.pane !== t); };
    app.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => setTab(b.dataset.dt));
    app.querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.preventDefault(); setTab(b.dataset.goto); scrollTo(0, 0); });
    app.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp, b));
    const ONE = ['Codex', 'Claude Code', 'OpenCode'], isWallet = s => cms.find(m => m.slug === s)?.wallet;
    const warn = () => { const w = $('#cmwarn'); if (w) w.innerHTML = isWallet(cmodel) ? `<p class="cwarn">${ic('alert', 'sm')} โมเดลนี้<b>หักเงินจาก Wallet</b> ตามราคา ไม่ใช้ลิมิตแพลน · ถ้าจะใช้ลิมิตแพลน เลือกโมเดลในกลุ่ม "ใช้ลิมิตแพลน"</p>` : ''; };
    const manual = k => { const [t, code] = TOOLS[ctool](k || 'sk-astra-...', cmodel); return pre([t, code]); };
    const snip = () => { const box = $('#csnip'); if (!box) return; warn();
      if (!me) { box.innerHTML = `<p class="muted">เข้าสู่ระบบเพื่อสร้างคำสั่งติดตั้งพร้อม key ของคุณ</p><a class="btn blue" href="/login?next=/developers">เข้าสู่ระบบ</a>${manual('')}`; bindCopy(); return; }
      if (ONE.includes(ctool)) {
        const cmd = setupRes && setupRes.tool === ctool && setupRes.model === cmodel ? (cos === 'win' ? setupRes.windows : setupRes.unix) : '';
        box.innerHTML = `<div class="seg" style="margin:0 0 10px" role="group" aria-label="ระบบ"><button type="button" data-os="win" class="${cos === 'win' ? 'on' : ''}">Windows</button><button type="button" data-os="unix" class="${cos === 'unix' ? 'on' : ''}">Mac / Linux</button></div>
          ${cmd ? `${pre([cos === 'win' ? 'PowerShell · วางแล้วกด Enter' : 'Terminal · วางแล้วกด Enter', cmd])}<p class="muted" style="font-size:13px;margin:6px 0 0">คำสั่งนี้มี key ของคุณ ใช้ได้ภายใน 15 นาที · ตั้งค่าโมเดลในแพลนให้ครบ${ctool === 'Codex' ? ' (สลับด้วย <code>codex --profile astra-ชื่อโมเดล</code>)' : ctool === 'OpenCode' ? ' (สลับด้วย /models)' : ''} · สำรองไฟล์เดิมเป็น .bak · เสร็จแล้วปิดโปรแกรมแล้วเปิดใหม่</p>`
            : `<button type="button" class="btn blue" id="mkcmd">${ic('terminal', 'sm')} สร้างคำสั่งติดตั้ง ${esc(ctool)}</button><p class="muted" style="font-size:13px;margin:6px 0 0">ระบบสร้าง API key ใหม่และใส่ให้ในคำสั่ง ต้องติดตั้ง ${esc(ctool)} ไว้ก่อน (มี Node.js มาด้วยอยู่แล้ว)</p>`}
          <details style="margin-top:12px"><summary class="muted">ตั้งค่าเองแบบเดิม (คัดลอกไฟล์ตั้งค่า)</summary>${manual(setupRes?.key || newKey)}</details>`;
        box.querySelectorAll('[data-os]').forEach(b => b.onclick = () => { cos = b.dataset.os; snip(); });
        box.querySelector('#mkcmd')?.addEventListener('click', async e => { e.target.disabled = true;
          try { const r = await api('/setup-cmd', { method: 'POST', body: { tool: ctool, model: cmodel, models: planMs.map(m => m.slug).slice(0, 40) } }); setupRes = { ...r, tool: ctool, model: cmodel }; snip(); toast('สร้างคำสั่งแล้ว กด Copy แล้ววางใน ' + (cos === 'win' ? 'PowerShell' : 'Terminal'), 'ok'); }
          catch (x) { toast(x.message, 'bad'); e.target.disabled = false; } });
      } else {
        box.innerHTML = `${newKey ? '' : `<button type="button" class="btn blue" id="mkkey">${ic('plus', 'sm')} สร้าง key และใส่ให้ในตัวอย่าง</button>`}${manual(newKey)}`;
        box.querySelector('#mkkey')?.addEventListener('click', async e => { e.target.disabled = true; try { newKey = (await api('/keys', { method: 'POST', body: { name: ctool } })).key; snip(); toast('สร้าง key แล้ว คัดลอกเก็บไว้ ระบบจะไม่แสดงอีก', 'ok'); } catch (x) { toast(x.message, 'bad'); e.target.disabled = false; } });
      }
      bindCopy(); };
    $('#cm')?.addEventListener('change', e => { cmodel = e.target.value; snip(); });
    app.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { ctool = b.dataset.ct; app.querySelectorAll('[data-ct]').forEach(x => x.classList.toggle('on', x === b)); snip(); });
    snip();
    app.querySelectorAll('[data-ks]').forEach(b => b.onclick = () => { // ตั้งค่า key (งบ / โมเดล / IP) ในหน้าต่างแยก ไม่รกหน้าหลัก
      const k = keys.find(x => x.id === +b.dataset.ks); if (!k) return;
      sheet('ตั้งค่า ' + esc(k.name), `<form class="kset sheet-form"><label>งบต่อเดือน (บาท) เว้นว่าง = ไม่จำกัด</label><input name="budget" type="number" min="0" step="any" value="${k.budget ?? ''}" placeholder="ไม่จำกัด">
        <label class="sw-row"><span class="sw"><input type="checkbox" name="use_plan" ${k.use_plan !== 0 ? 'checked' : ''}><span></span></span>หักจากลิมิตแพลนก่อน (ถ้าแพลนรองรับ)</label>
        <label>โมเดลที่ key นี้ใช้ได้ (ไม่เลือก = ทุกโมเดล)</label><div class="chips-sel">${pr.models.map(m => `<label><input type="checkbox" name="m" value="${slug(m.name)}" ${k.models?.split(',').includes(slug(m.name)) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>
        <details style="margin-top:10px"><summary class="muted">จำกัด IP (สำหรับเซิร์ฟเวอร์)</summary><input name="ip_allow" value="${esc(k.ip_allow || '')}" placeholder="203.0.113.7, 198.51.100.0/24" style="margin-top:6px"></details>
        <button class="btn blue" style="margin-top:14px">บันทึก</button></form>`, (d, close) => d.querySelector('form').onsubmit = async e => {
        e.preventDefault(); const fd = new FormData(e.target);
        try { await api('/keys/' + k.id, { method: 'PUT', body: { budget: fd.get('budget'), models: fd.getAll('m'), use_plan: fd.get('use_plan') ? 1 : 0, ip_allow: fd.get('ip_allow') } }); keys.splice(0, keys.length, ...await api('/keys')); close(); toast('บันทึกแล้ว', 'ok'); draw(); }
        catch (x) { toast(x.message, 'bad'); }
      });
    });
    app.querySelectorAll('[data-lg]').forEach(b => b.onclick = async () => { // คำขอล่าสุดของ key
      try { const rows = await api('/keys/' + b.dataset.lg + '/log'); sheet('ประวัติคำขอล่าสุด', rows.length ? `<div class="tw"><table class="tbl"><tr><th>เวลา</th><th>endpoint</th><th>model</th><th>status</th><th>in/out</th><th>cache</th><th>TTFT</th><th>฿</th><th>ms</th></tr>${rows.map(r => { const cp = r.tin > 0 && r.tcr > 0 ? Math.round(r.tcr / r.tin * 100) : 0; return `<tr><td>${new Date(r.created_at).toLocaleString(LOC)}</td><td><code>${esc(r.path)}</code></td><td>${esc(r.model || '-')}</td><td class="${r.status < 400 ? 'ok' : 'bad'}" title="${esc(r.err || '')}">${r.status}</td><td>${r.tin}/${r.tout}</td><td class="${cp >= 50 ? 'ok' : 'muted'}" title="${r.tcr ? r.tcr.toLocaleString() + ' tokens' : ''}">${cp ? cp + '%' : '-'}</td><td class="muted">${r.ttft ? r.ttft + 'ms' : '-'}</td><td>${r.charge}</td><td>${r.ms}</td></tr>`; }).join('')}</table></div>` : 'ยังไม่มีคำขอ (เก็บ 30 วัน)'); }
      catch (x) { toast(x.message, 'bad'); }
    });
    app.querySelectorAll('[data-rk]').forEach(b => b.onclick = async () => {
      if (!await confirmSheet('ยกเลิก API key นี้? แอปที่ใช้อยู่จะเรียกไม่ได้ทันที', { title: 'ยกเลิก API key', ok: 'Revoke key', danger: true })) return;
      await api('/keys/' + b.dataset.rk, { method: 'DELETE' }); keys.splice(0, keys.length, ...await api('/keys')); draw();
    });
  };
  draw();
};
const h3k = t => `<div style="font:600 19px var(--display);margin-bottom:8px">${t}</div>`;

// ---------- อนุญาตแอป Kyber Desktop: สร้าง key ชื่อ Desktop แล้วส่งกลับไปที่ 127.0.0.1 ของเครื่องผู้ใช้ ----------
PAGES['desktop-auth'] = async () => {
  const q = qs(), port = +q.get('port'), state = q.get('state') || '';
  const ok = port >= 1024 && port <= 65535 && /^[0-9a-f]{32}$/.test(state);
  const box = body => page(nav() + `<div class="wrap" style="max-width:560px"><section class="hero" style="padding:56px 0 20px"><h1>เชื่อมต่อ Kyber Desktop</h1></section><div class="card">${body}</div>${footer()}</div>`);
  if (!ok) return box('<p>ลิงก์ไม่ถูกต้อง กลับไปกด "เข้าสู่ระบบ" ในแอปอีกครั้ง</p>');
  if (!me) return box(`<p>เข้าสู่ระบบก่อน แล้วกลับมาที่หน้านี้</p><a class="btn blue" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Log in</a>`);
  box(`<p>อนุญาตให้แอป <b>Kyber Desktop</b> ในเครื่องนี้ใช้บัญชี <b>${esc(me.email)}</b>?</p>
    <p class="muted" style="font-size:13.5px">ระบบจะสร้าง API key ชื่อ "Desktop" ให้แอป ค่าใช้งานหักจากแพลนหรือ Wallet ของคุณ ลบ key ได้ทุกเมื่อที่หน้า <a href="/developers">API</a></p>
    <div class="row" style="margin-top:12px"><button class="btn blue" id="dok">อนุญาต</button><a class="btn out" href="/">ยกเลิก</a></div><div class="err" id="derr"></div>`);
  $('#dok').onclick = async e => {
    e.target.disabled = true;
    try { const r = await api('/keys', { method: 'POST', body: { name: 'Desktop' } }); location.href = `http://127.0.0.1:${port}/cb?key=${encodeURIComponent(r.key)}&state=${state}`; }
    catch (x) { $('#derr').textContent = x.message; e.target.disabled = false; }
  };
};

// ---------- ติดต่อเรา (ticket) ----------
const TK = { open: '<span class="warn">รอตอบ</span>', answered: '<span class="ok">ตอบแล้ว</span>', closed: '<span class="muted">ปิดแล้ว</span>' };
PAGES.support = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const id = qs().get('id');
  if (id) {
    const t = await api('/tickets/' + id);
    page(nav() + `<div class="wrap" style="max-width:680px"><p style="margin-top:24px"><a href="/support">← เรื่องทั้งหมด</a></p><h1 style="font:600 28px var(--display)">${esc(t.subject)}</h1><p>${TK[t.status] || ''}</p>
      <div class="thread">${t.msgs.map(m => `<div class="tmsg ${m.admin ? 'adm' : ''}"><div class="muted" style="font-size:12px">${m.admin ? 'ทีมงาน Kyber' : 'คุณ'} · ${when(m.created_at)}</div><div>${esc(m.body).replace(/\n/g, '<br>')}</div></div>`).join('')}</div>
      <form class="card" id="rf"><textarea name="body" rows="3" maxlength="5000" placeholder="พิมพ์ข้อความ" required></textarea><div class="err" id="e"></div><button class="btn blue">Send</button></form>${footer()}</div>`);
    $('#rf').onsubmit = async e => { e.preventDefault(); e.submitter.disabled = true; try { await api('/tickets/' + id, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); boot(); } catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; } };
    return;
  }
  const list = await api('/tickets');
  page(nav() + `<div class="wrap" style="max-width:680px"><section class="hero" style="padding:48px 0 16px"><h1>ติดต่อเรา</h1><a class="btn blue fb-admin" href="${FB_PAGE}" target="_blank" rel="noopener">${ic('msg', 'sm')} แชตกับแอดมินทางเพจ Facebook</a><p class="muted" style="margin:8px 0 0;font-size:13px">ตอบเร็วที่สุด · หรือส่งเรื่องด้านล่าง</p><p>ปัญหาการใช้งาน การชำระเงิน หรือข้อเสนอแนะ ทีมงานจะตอบกลับที่นี่${me.email_verified ? ' และทางอีเมล' : ''}</p></section>
    <form class="card" id="nf"><label>หัวข้อ</label><input name="subject" maxlength="120" required><label>รายละเอียด</label><textarea name="body" rows="4" maxlength="5000" required></textarea>
      <div class="err" id="e"></div><button class="btn blue">Submit</button></form>
    ${list.length ? `<div class="card">${h3k('เรื่องของคุณ')}${list.map(t => `<a class="row tk" href="/support?id=${t.id}"><span>${esc(t.subject)}</span><span class="sp"></span>${TK[t.status] || ''}<span class="muted">${when(t.updated_at)}</span></a>`).join('')}</div>` : ''}${footer()}</div>`);
  $('#nf').onsubmit = async e => { e.preventDefault(); e.submitter.disabled = true; try { const r = await api('/tickets', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); go('/support?id=' + r.id); } catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; } };
};

// ---------- บล็อก: /blog = รายการ, /blog/<slug> = บทความ ----------
PAGES.security = async () => { // หน้าความปลอดภัยสำหรับองค์กร: เขียนเฉพาะสิ่งที่ระบบทำจริง
  const S = (t, items) => `<section class="sec-b"><h2>${t}</h2><ul>${items.map(x => `<li>${x}</li>`).join('')}</ul></section>`;
  page(nav() + `<div class="wrap sec" style="max-width:760px"><section class="hero" style="padding:48px 0 16px"><h1>ความปลอดภัยของข้อมูล</h1><p>สรุปสั้น ๆ ว่าเราเก็บ ใช้ และลบข้อมูลของคุณอย่างไร สำหรับคนทำงานและทีม · Kyber สร้างโดย Hypatia</p></section>
    ${S('ข้อมูลของคุณถูกใช้อย่างไร', ['Kyber <b>ไม่นำแชตหรือไฟล์ของคุณไปเทรนโมเดล</b> และไม่ขายหรือแชร์ให้บุคคลอื่นเพื่อการตลาด', 'ข้อความและไฟล์ที่คุณส่ง ถูกส่งต่อไปยังผู้ให้บริการโมเดลที่คุณเลือก (เช่น Claude, ChatGPT, Gemini, DeepSeek) เพื่อประมวลผลคำตอบเท่านั้น การเก็บข้อมูลฝั่งผู้ให้บริการเป็นไปตามนโยบายของผู้ให้บริการนั้น', 'งานที่เป็นความลับสูง แนะนำให้ตัดข้อมูลส่วนบุคคล (เลขบัตร รหัสผ่าน ข้อมูลลูกค้า) ออกก่อนส่ง'])}
    ${S('การเก็บและการลบ', ['แชตเก็บไว้จนกว่าคุณจะลบ · แชตที่ลบอยู่ในถังขยะ 30 วัน แล้วถูกลบถาวร', 'รูปที่ AI สร้างในแชตถูกลบอัตโนมัติหลัง 30 วัน (ดาวน์โหลดเก็บไว้ได้)', 'ระบบสำรองข้อมูลวันละครั้ง และเก็บไฟล์สำรองย้อนหลัง 14 วัน', 'ต้องการลบบัญชีและข้อมูลทั้งหมด ติดต่อแอดมินได้ที่หน้า <a href="/support">ติดต่อเรา</a>'])}
    ${S('การเข้ารหัสและบัญชี', ['เชื่อมต่อผ่าน HTTPS ทุกหน้า', 'โทเคนที่คุณเชื่อมต่อ (เช่น GitHub, Connector) ถูกเข้ารหัสด้วย AES-GCM ก่อนเก็บ', 'รหัสผ่านไม่ถูกเก็บในระบบของเรา (ใช้ระบบยืนยันตัวตนของ Firebase) · รองรับยืนยันตัวตน 2 ขั้น (แอป Authenticator) และ Passkey', 'ดูอุปกรณ์ที่ล็อกอินอยู่และสั่งออกจากระบบทุกเครื่องได้ที่หน้าบัญชี'])}
    ${S('สำหรับทีมและบริษัท', ['หัวหน้าทีมเห็นสัดส่วนการใช้งานของสมาชิก ส่งออกเป็น Excel ได้ และตั้งเพดานการใช้รายคนได้', 'หัวหน้าทีมปิดสิทธิ์ใช้ API ของสมาชิก และเพิกถอน API key ได้ทันที', 'มีประวัติการจัดการทีม (เพิ่ม/ลบสมาชิก เปลี่ยนสิทธิ์) ให้หัวหน้าทีมตรวจสอบ', 'หัวหน้าทีมและสมาชิก<b>ไม่เห็นแชตส่วนตัวของกันและกัน</b> · แชร์เฉพาะ Workspace ที่เลือกแชร์ให้ทีม'])}
    ${S('หน้าเว็บที่ AI สร้าง (Artifact)', ['เป็นส่วนตัวจนกว่าเจ้าของกดแชร์ · ปิดแชร์แล้วลิงก์ใช้ไม่ได้ทันที', 'โค้ดในหน้านั้นรันแยกจากบัญชีของคุณ (sandbox) อ่าน cookie หรือเรียกบัญชีของคุณไม่ได้', 'เว็บที่เผยแพร่ด้วย Kyber Sites (/s/...) รันแบบ sandbox เหมือนกัน คนเข้าชมไม่เสี่ยงโดนขโมยบัญชี Kyber · เว็บที่มีช่องรหัสผ่านเผยแพร่ไม่ได้ · ทุกเว็บมีปุ่มรายงาน'])}
    <p class="muted" style="font-size:13px">มีคำถามเรื่องความปลอดภัยหรือต้องการเอกสารสำหรับฝ่ายจัดซื้อ <a href="${FB_PAGE}" target="_blank" rel="noopener">แชตกับแอดมิน</a> หรือ <a href="/support">ส่งเรื่อง</a></p>${footer()}</div>`);
};
PAGES.gallery = async () => { // แกลเลอรีสาธารณะ: Artifact ที่เจ้าของเลือกโชว์
  const list = await api('/gallery').catch(() => []);
  page(nav() + `<div class="wrap"><section class="hero" style="padding:48px 0 16px"><h1>แกลเลอรีผลงาน AI</h1><p>หน้าเว็บ แอป และเกม ที่ผู้ใช้สร้างด้วยการพิมพ์บอก AI · แตะเพื่อเปิดลองใช้</p>
    <a class="btn blue" href="${me ? '/chat' : '/login?next=/chat'}">${ic('sparkles', 'sm')} สร้างของคุณเอง</a></section>
    ${list.length ? `<div class="gal">${list.map(a => `<a class="gal-card" href="/a/${encodeURIComponent(a.token)}" target="_blank" rel="noopener"><span class="gal-ic">${ic('code')}</span><b>${esc(a.title)}</b><small class="muted">${when(a.updated_at)}</small></a>`).join('')}</div>` : '<p class="muted" style="text-align:center">ยังไม่มีผลงานในแกลเลอรี · สร้าง Artifact ในแชตแล้วเลือก "แสดงในแกลเลอรี" ตอนแชร์</p>'}${footer()}</div>`);
};
PAGES.blog = async () => {
  const slugQ = decodeURIComponent(curl().pathname.split('/')[2] || '');
  if (slugQ) {
    const p = await api('/blog/' + encodeURIComponent(slugQ));
    document.title = p.title + ' · Kyber';
    page(nav() + `<article class="wrap post-body" style="max-width:720px"><p style="margin-top:24px"><a href="/blog">← บทความทั้งหมด</a></p>
      <h1>${esc(p.title)}</h1><p class="muted">${when(p.created_at)}</p>${p.cover?.startsWith('/') ? `<img class="cover" src="${esc(p.cover)}" alt="">` : ''}
      <div class="msg ai"><div class="b">${md(p.body)}</div></div><p style="margin:32px 0"><a class="btn blue" href="/login">Try Kyber free</a></p></article>${footer()}`);
    bindCopy(); return;
  }
  if (qs().get('c')) { // มีอะไรใหม่: โพสต์ที่ติ๊ก changelog เรียงใหม่สุดก่อน เปิดแล้วถือว่าเห็นแล้ว (ลบจุดแดง)
    const [list, rm] = await Promise.all([api('/changelog').catch(() => []), api('/roadmap').catch(() => [])]);
    try { localStorage.setItem('clSeen', String(list[0]?.created_at || Date.now())); } catch { /* ไม่มีที่เก็บ */ }
    page(nav() + `<div class="wrap" style="max-width:760px"><section class="hero" style="padding:48px 0 16px"><h1>มีอะไรใหม่</h1><p>ฟีเจอร์และการปรับปรุงล่าสุดของ Kyber</p></section>
      ${rm.length ? `<h2 style="margin:8px 0 6px">กำลังจะมา · โหวตได้</h2><p class="muted" style="margin:0 0 10px">กดโหวตฟีเจอร์ที่อยากได้ ทีมจะทำตามเสียงส่วนใหญ่ก่อน</p>${rm.map(r => `<div class="card row" style="margin-bottom:8px;justify-content:space-between;gap:10px;flex-wrap:nowrap"><span style="min-width:0"><b>${esc(r.title)}</b> <span class="pill">${{ idea: 'ไอเดีย', planned: 'วางแผนแล้ว', doing: 'กำลังทำ', done: 'เสร็จแล้ว' }[r.status] || ''}</span>${r.body ? `<br><small class="muted">${esc(r.body)}</small>` : ''}</span><button type="button" class="btn ${r.mine ? 'blue' : 'out'} sm" data-rv="${r.id}" data-on="${r.mine ? 1 : 0}" ${r.status === 'done' ? 'disabled' : ''} aria-pressed="${r.mine}">${ic('up', 'sm')} ${r.votes}</button></div>`).join('')}<h2 style="margin:24px 0 10px">อัปเดตล่าสุด</h2>` : ''}
      ${list.map(p => `<article class="card" style="margin-bottom:14px"><p class="muted" style="margin:0">${when(p.created_at)}</p><h2 style="margin:4px 0 8px">${esc(p.title)}</h2><div class="msg ai"><div class="b">${md(p.body || p.summary || '')}</div></div></article>`).join('') || '<p class="muted">ยังไม่มีอัปเดต</p>'}</div>${footer()}`);
    app.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => { if (!me) return go('/login?next=' + encodeURIComponent(here())); try { await api(`/roadmap/${b.dataset.rv}/vote`, { method: 'POST', body: { on: b.dataset.on !== '1' } }); PAGES.blog(); } catch (x) { toast(x.message, 'bad'); } });
    bindCopy(); return;
  }
  const posts = await api('/blog');
  page(nav() + `<div class="wrap"><section class="hero" style="padding:56px 0 24px"><h1>บล็อก</h1><p>ข่าวสาร วิธีใช้ และเทคนิคการใช้ AI</p></section>
    ${posts.length ? `<div class="grid">${posts.map(postTile).join('')}</div>` : '<p class="muted" style="text-align:center">ยังไม่มีบทความ</p>'}${footer()}</div>`);
};

// ---------- สถานะระบบ ----------
PAGES.status = async () => {
  const d = await api('/status'), down = d.models.filter(m => m.down);
  page(nav() + `<div class="wrap" style="max-width:820px"><section class="hero" style="padding:56px 0 24px"><h1>สถานะระบบ</h1>
    <p class="${down.length ? 'warn' : 'ok'}" style="font-size:19px">${down.length ? `${ic('alert', 'sm')} บางโมเดลมีปัญหา: ` + down.map(m => esc(m.name)).join(', ') : '● ระบบทำงานปกติ'}</p>
    <p class="muted">อัปเดต ${when(d.updated)}</p></section>
    ${d.models.map(m => `<div class="card st"><div class="row"><b>${esc(m.name)}</b><span class="sp"></span><span class="${m.state === 'down' ? 'bad' : m.down ? 'warn' : 'ok'}">${m.state === 'down' ? `${ic('alert', 'sm')} ล่ม · สลับโมเดลสำรองอัตโนมัติ` : m.down ? `${ic('alert', 'sm')} ไม่เสถียร` : '● ปกติ'}</span><span class="muted">${m.uptime}% ใน 30 วัน</span></div>
      <div class="bars">${m.days.map(x => { const t = x.ok + x.err, r = t ? x.err / t : 0; return `<i class="${!t ? 'none' : r > 0.2 ? 'bad' : r > 0 ? 'mid' : 'good'}" title="${new Date(x.d).toLocaleDateString(LOC)} · สำเร็จ ${x.ok} · ผิดพลาด ${x.err}"></i>`; }).join('')}</div>
      <div class="row muted" style="font-size:12px"><span>30 วันก่อน</span><span class="sp"></span><span>วันนี้</span></div></div>`).join('')}
    <p class="muted" style="text-align:center">สีเทา = ไม่มีการใช้งานวันนั้น · มีปัญหา? <a href="/support">แจ้งเรา</a></p>${footer()}</div>`);
};

// ---------- ใบเสร็จ (พิมพ์ / บันทึกเป็น PDF) ----------
PAGES.receipt = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const r = await api('/receipt/' + (+qs().get('id') || 0)), b = r.business;
  page(`<div class="receipt"><div class="row no-print" style="margin-bottom:16px"><a href="/plans">← กลับ</a><span class="sp"></span><button class="btn blue sm" id="pr">Print / Save PDF</button></div>
    <div class="paper"><div class="row"><div><h1>${esc(b.business_name || 'Kyber')}</h1>${b.business_address ? `<p>${esc(b.business_address).replace(/\n/g, '<br>')}</p>` : ''}${b.business_tax_id ? `<p>เลขประจำตัวผู้เสียภาษี ${esc(b.business_tax_id)}</p>` : ''}</div>
      <span class="sp"></span><div style="text-align:right"><h2>ใบเสร็จรับเงิน</h2><p>เลขที่ ${esc(r.no)}<br>วันที่ ${new Date(r.date).toLocaleDateString(LOC, { dateStyle: 'long' })}</p></div></div>
      <p><b>ลูกค้า</b> ${r.buyer?.name ? `${esc(r.buyer.name)}<br>${r.buyer.address ? esc(r.buyer.address).replace(/\n/g, '<br>') + '<br>' : ''}${r.buyer.tax_id ? 'เลขประจำตัวผู้เสียภาษี ' + esc(r.buyer.tax_id) + '<br>' : ''}<span class="muted">${esc(r.email)}</span>` : esc(r.email)}</p>
      <table><tr><th>รายการ</th><th style="text-align:right">จำนวนเงิน</th></tr>
        <tr><td>${esc(r.item)}</td><td style="text-align:right">฿${baht(r.amount + (r.discount || 0))}</td></tr>
        ${r.discount ? `<tr><td>ส่วนลด${r.coupon ? ` (${esc(r.coupon)})` : ''}</td><td style="text-align:right">-฿${baht(r.discount)}</td></tr>` : ''}
        <tr class="tot"><td>รวมทั้งสิ้น</td><td style="text-align:right">฿${baht(r.amount)}</td></tr></table>
      <p class="muted">ชำระแล้ว · ขอบคุณที่ใช้บริการ</p><p class="muted" style="font-size:12px">Kyber สร้างโดย Hypatia · © 2026 Hypatia</p></div>
    ${r.mine ? `<details class="card no-print" style="margin-top:16px"><summary><b>ออกในนามบริษัท</b> <span class="muted">ใส่ชื่อ ที่อยู่ และเลขผู้เสียภาษีของผู้ซื้อ (ใช้กับใบเสร็จทุกใบ)</span></summary>
      <form id="bif" class="sheet-form" style="margin-top:10px"><input name="name" maxlength="120" placeholder="ชื่อบริษัท / ผู้ซื้อ" value="${esc(r.buyer?.name || '')}"><textarea name="address" rows="2" maxlength="400" placeholder="ที่อยู่">${esc(r.buyer?.address || '')}</textarea><input name="tax_id" inputmode="numeric" maxlength="20" placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก" value="${esc(r.buyer?.tax_id || '')}"><button class="btn blue sm">บันทึก</button></form>
      <p class="muted" style="font-size:12.5px">เอกสารนี้เป็นใบเสร็จรับเงิน ไม่ใช่ใบกำกับภาษี</p></details>` : ''}</div>`);
  $('#pr').onclick = () => print();
  $('#bif')?.addEventListener('submit', async e => { e.preventDefault(); try { await api('/bill-info', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('บันทึกแล้ว', 'ok'); PAGES.receipt(); } catch (x) { toast(x.message, 'bad'); } });
};

// ---------- Kyber Sites: เว็บของฉัน ----------
PAGES.sites = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const d = await api('/sites'), link = s => location.origin + '/s/' + s.slug + '/';
  const ST = { live: ['ok', 'ออนไลน์'], off: ['muted', 'ปิดอยู่'], banned: ['bad', 'ถูกระงับ'] };
  const card = s => `<article class="card site-card" data-site="${s.id}">
    <div class="site-top"><span class="site-ic">${ic('globe')}</span><div class="site-name"><b>${esc(s.title)}</b><a href="${esc(link(s))}" target="_blank" rel="noopener">${esc(location.host)}/s/${esc(s.slug)}/</a></div><span class="pill ${ST[s.status]?.[0] || ''}">${ST[s.status]?.[1] || esc(s.status)}</span></div>
    <div class="site-meta muted"><span>v${s.live}${s.live !== s.ver ? ` (ล่าสุด v${s.ver})` : ''}</span><span>${ic('eye', 'sm')} ${Number(s.views).toLocaleString(LOC)} ครั้ง</span><span>อัปเดต ${when(s.updated_at)}</span><span>จาก${s.src === 'project' ? 'โปรเจกต์ Code' : ' Artifact'}</span></div>
    <div class="site-act"><button type="button" class="btn out sm" data-cp="${esc(link(s))}">${ic('copy', 'sm')} คัดลอกลิงก์</button><button type="button" class="btn out sm" data-pub="${s.id}" ${s.status === 'banned' ? 'disabled' : ''}>${ic('refresh', 'sm')} อัปเดตจากต้นทาง</button><button type="button" class="btn out sm" data-inbox="${s.id}">${ic('inbox', 'sm')} ข้อความ${s.unread ? ` <span class="site-badge">${s.unread}</span>` : ''}</button><button type="button" class="btn out sm" data-man="${s.id}">${ic('settings', 'sm')} จัดการ</button></div></article>`;
  page(nav() + `<div class="wrap sites-wrap"><header class="shop-hero"><h1>เว็บของฉัน</h1><p class="muted">เว็บที่คุณเผยแพร่จากหน้า Code หรือ Artifact · ใครมีลิงก์ก็เปิดได้</p>
    ${d.paid ? `<p class="site-quota">ใช้ไป <b>${d.sites.length}</b> จาก <b>${d.quota}</b> เว็บ</p>` : ''}</header>
    ${!d.paid ? `<div class="card"><p>เผยแพร่เว็บใช้ได้กับแพลนที่ชำระเงิน</p><a class="btn blue" href="/plans">ดูแพลน</a></div>`
      : d.sites.length ? d.sites.map(card).join('')
      : `<div class="card site-empty"><h2>ยังไม่มีเว็บ</h2><p class="muted">ให้ AI ทำเว็บก่อน แล้วกดปุ่ม <b>เผยแพร่</b> ที่หน้า Code หรือปุ่มแชร์ของ Artifact ในแชต</p><div class="row"><a class="btn blue" href="/code">${ic('code', 'sm')} ไปหน้า Code</a><a class="btn out" href="/chat">${ic('sparkles', 'sm')} สร้างในแชต</a></div></div>`}
    <details class="card site-help"><summary><b>ฟอร์มติดต่อทำยังไง</b></summary><p class="muted">ฟอร์มในเว็บที่ส่งไปที่ <code>__form</code> จะเข้ากล่องข้อความของเว็บนั้น เช่น</p><pre><code>${esc('<form method="post" action="__form">\n  <input name="email" type="email" required>\n  <textarea name="message"></textarea>\n  <input name="_gotcha" style="display:none">\n  <input type="hidden" name="_next" value="thanks.html">\n  <button>ส่ง</button>\n</form>')}</code></pre><p class="muted">บอก AI ว่า "ทำฟอร์มติดต่อส่งไปที่ __form" ก็ได้ · เว็บรันแยกจากบัญชี Kyber (sandbox) ข้อมูลที่เก็บใน localStorage / cookie จึงหายเมื่อปิดหน้า และห้ามมีช่องรหัสผ่าน</p></details>
    ${footer()}</div>`);
  const find = id => d.sites.find(s => s.id === +id);
  app.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp, b));
  app.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await api(`/sites/${b.dataset.pub}/publish`, { method: 'POST' }); toast(`อัปเดตแล้ว v${r.ver} · ${r.files} ไฟล์`, 'ok'); PAGES.sites(); } catch (x) { b.disabled = false; toast(x.message, 'bad'); } });
  app.querySelectorAll('[data-inbox]').forEach(b => b.onclick = async () => {
    const s = find(b.dataset.inbox); let list; try { list = await api(`/sites/${s.id}/forms`); } catch (x) { return toast(x.message, 'bad'); }
    sheet('ข้อความจาก ' + s.title, list.length ? `<div class="site-inbox">${list.map(f => `<div class="card site-msg${f.seen ? '' : ' new'}" data-f="${f.id}"><div class="row"><small class="muted">${when(f.created_at)}</small><span class="sp"></span><button type="button" class="icon-btn sm ghost" data-fdel="${f.id}" aria-label="ลบข้อความ">${ic('trash', 'sm')}</button></div>${Object.entries(f.data).map(([k, v]) => `<p><b>${esc(k)}</b> ${esc(v)}</p>`).join('')}</div>`).join('')}</div>` : '<p class="muted">ยังไม่มีข้อความ · ฟอร์มที่ส่งไป <code>__form</code> จะมาอยู่ที่นี่</p>', dd => {
      dd.querySelectorAll('[data-fdel]').forEach(x => x.onclick = async () => { try { await api(`/sites/${s.id}/forms/${x.dataset.fdel}`, { method: 'DELETE' }); x.closest('.site-msg').remove(); } catch (e) { toast(e.message, 'bad'); } });
    });
    if (s.unread) { await api(`/sites/${s.id}/forms/seen`, { method: 'POST' }).catch(() => {}); s.unread = 0; b.querySelector('.site-badge')?.remove(); }
  });
  app.querySelectorAll('[data-man]').forEach(b => b.onclick = async () => {
    const s = find(b.dataset.man); let x; try { x = await api('/sites/' + s.id); } catch (e) { return toast(e.message, 'bad'); }
    const max = Math.max(1, ...x.days.map(v => v.n)), days = x.days.slice().reverse();
    sheet('จัดการเว็บ', `<div class="sheet-form"><label>ชื่อที่แสดง<input id="smt" maxlength="80" value="${esc(s.title)}"></label><button type="button" class="btn out sm" id="sms">บันทึกชื่อ</button>
      ${s.status !== 'banned' ? `<label class="sw-row"><span class="sw"><input type="checkbox" id="smo" ${s.status === 'live' ? 'checked' : ''}><span></span></span> เปิดให้คนเข้าชม</label>` : '<p class="bad">เว็บนี้ถูกผู้ดูแลระงับ ติดต่อ <a href="/support">ฝ่ายช่วยเหลือ</a></p>'}
      <b>คนเข้าชม 14 วันล่าสุด</b>${days.length ? `<div class="site-chart" role="img" aria-label="ยอดเข้าชมรายวัน">${days.map(v => `<i style="height:${Math.max(4, v.n / max * 100)}%" title="${esc(v.day)} · ${v.n} ครั้ง"></i>`).join('')}</div>` : '<small class="muted">ยังไม่มีคนเข้าชม</small>'}
      <b>เวอร์ชัน</b><div class="site-vers">${x.versions.map(v => `<div class="row"><span>v${v.ver}</span><small class="muted">${when(v.created_at)} · ${Math.max(1, Math.round(v.size / 1024))}KB</small><span class="sp"></span><button type="button" class="btn out sm" data-rb="${v.ver}">ใช้เวอร์ชันนี้</button></div>`).join('')}</div>
      <button type="button" class="btn red" id="smd">${ic('trash', 'sm')} ลบเว็บนี้</button></div>`, (dd, close) => {
      dd.querySelector('#sms').onclick = async () => { try { await api('/sites/' + s.id, { method: 'PATCH', body: { title: dd.querySelector('#smt').value } }); toast('บันทึกแล้ว', 'ok'); close(); PAGES.sites(); } catch (e) { toast(e.message, 'bad'); } };
      const o = dd.querySelector('#smo'); if (o) o.onchange = async () => { try { await api('/sites/' + s.id, { method: 'PATCH', body: { status: o.checked ? 'live' : 'off' } }); toast(o.checked ? 'เปิดเว็บแล้ว' : 'ปิดเว็บแล้ว · ลิงก์ยังเก็บไว้', 'ok'); PAGES.sites(); } catch (e) { o.checked = !o.checked; toast(e.message, 'bad'); } };
      dd.querySelectorAll('[data-rb]').forEach(r => r.onclick = async () => { try { await api(`/sites/${s.id}/rollback`, { method: 'POST', body: { ver: +r.dataset.rb } }); toast(`เว็บแสดง v${r.dataset.rb} แล้ว`, 'ok'); close(); } catch (e) { toast(e.message, 'bad'); } });
      dd.querySelector('#smd').onclick = async () => { if (!confirm(`ลบเว็บ ${s.slug} ถาวร? ลิงก์จะใช้ไม่ได้ทันที และข้อความในฟอร์มจะหายด้วย`)) return; try { await api('/sites/' + s.id, { method: 'DELETE' }); toast('ลบเว็บแล้ว', 'ok'); close(); PAGES.sites(); } catch (e) { toast(e.message, 'bad'); } };
    });
  });
};

// ---------- AI ประชุม ----------
const meetT = t => { t = Math.floor(t || 0); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const meetDur = t => { t = Math.round(t || 0); return t >= 3600 ? `${Math.floor(t / 3600)} ชม. ${Math.round(t % 3600 / 60)} นาที` : t >= 60 ? `${Math.round(t / 60)} นาที` : `${t} วินาที`; };
const MEET_ST = { recording: ['warn', 'กำลังอัด'], processing: ['', 'กำลังถอดเสียง'], summarizing: ['', 'กำลังสรุป'], done: ['ok', 'เสร็จแล้ว'] };
let meetRec = null;
PAGES.meetings = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const id = +qs().get('id');
  if (id) return meetDetail(id);
  const d = await api('/meetings');
  const row = m => `<a class="card meet-row" href="/meetings?id=${m.id}"><span class="site-ic">${ic('mic')}</span><span class="meet-name"><b>${esc(m.title)}</b><small class="muted">${when(m.created_at)} · ${meetDur(m.dur)}</small></span><span class="pill ${MEET_ST[m.status]?.[0] || ''}">${MEET_ST[m.status]?.[1] || esc(m.status)}</span></a>`;
  page(nav() + `<div class="wrap sites-wrap"><header class="shop-hero"><h1>AI ประชุม</h1><p class="muted">อัดเสียงหรืออัปไฟล์ประชุม ได้บทถอดความแยกคนพูด สรุป ข้อตกลง และงานที่ต้องทำ</p></header>
    ${d.ready === false ? '<div class="card"><p class="muted">ยังไม่เปิดใช้ AI ประชุม (รอผู้ดูแลตั้งค่า)</p></div>' : `<div class="meet-start">
      <button type="button" class="btn blue meet-big" id="mrec">${ic('mic')} เริ่มอัดประชุม</button>
      <label class="btn out meet-big">${ic('clip')} อัปไฟล์เสียง/วิดีโอ<input type="file" id="mfile" accept="audio/*,video/mp4,video/quicktime,.m4a,.mp3,.wav" hidden></label>
      <input id="mtitle" maxlength="100" placeholder="ชื่อการประชุม (ไม่ใส่ก็ได้ AI ตั้งให้)" aria-label="ชื่อการประชุม"></div>
      <div id="mrecbox"></div>`}
    <div class="row meet-search"><input type="search" id="mq" placeholder="ค้นหาในทุกการประชุม เช่น ชื่อคน หัวข้อ" aria-label="ค้นหาการประชุม"></div>
    <div id="mlist">${d.items.length ? d.items.map(row).join('') : '<p class="muted" style="text-align:center;margin:24px 0">ยังไม่มีการประชุม</p>'}</div>
    <p class="muted meet-note">หักลิมิตแพลนตามความยาวเสียง · ไฟล์เสียงเก็บ 30 วัน บทถอดความเก็บจนกว่าคุณจะลบ</p>${footer()}</div>`);
  let tq; $('#mq').oninput = e => { clearTimeout(tq); tq = setTimeout(async () => { const q = e.target.value.trim(); const r = q ? await api('/meetings?q=' + encodeURIComponent(q)) : d; $('#mlist').innerHTML = r.items.map(row).join('') || '<p class="muted" style="text-align:center">ไม่พบ</p>'; }, 300); };
  if (d.ready === false) return;
  $('#mfile').onchange = e => { const f = e.target.files[0]; if (f) meetFileSheet(f); e.target.value = ''; };
  $('#mrec').onclick = () => meetStartRec();
  if (qs().get('rec') === '1') history.replaceState(null, '', '/meetings');
};
async function meetStartRec() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('เบราว์เซอร์นี้อัดเสียงไม่ได้ ลองอัปไฟล์แทน', 'bad');
  let m; try { m = await api('/meetings', { method: 'POST', body: { title: $('#mtitle')?.value || '' } }); } catch (x) { return toast(x.message, 'bad'); }
  const box = $('#mrecbox'); $('.meet-start').hidden = true;
  box.innerHTML = `<div class="card meet-live"><div class="meet-dot" aria-hidden="true"></div><div class="meet-clock" id="mclock" aria-live="off">0:00</div><div class="meet-lvl"><i id="mlvl"></i></div>
    <small class="muted" id="mst" aria-live="polite">กำลังอัด · ส่งเสียงขึ้นทุก 3 นาที</small><div class="row" style="justify-content:center;gap:8px"><button type="button" class="btn out" id="mpause">หยุดชั่วคราว</button><button type="button" class="btn red" id="mstop">${ic('stop', 'sm')} จบและสรุป</button></div>
    <small class="muted">วางมือถือใกล้คนพูด อย่าล็อกจอหรือสลับแอปนานระหว่างอัด</small></div>`;
  try { meetRec = await meetRecorder(m.id, { onLevel: v => { const l = $('#mlvl'); if (l) l.style.width = Math.min(100, v * 160) + '%'; }, onState: s => { const e = $('#mst'); if (e && !s.idle) e.textContent = `ส่งแล้ว ${s.sent} ช่วง${s.left ? ` · รอส่ง ${s.left}` : ''}${s.failed ? ` · ส่งไม่สำเร็จ ${s.failed}` : ''}`; } }); }
  catch { box.innerHTML = ''; $('.meet-start').hidden = false; await api('/meetings/' + m.id, { method: 'DELETE' }).catch(() => {}); return toast('เปิดไมค์ไม่ได้ อนุญาตไมค์ในเบราว์เซอร์ก่อน', 'bad'); }
  const tick = setInterval(() => { const c = $('#mclock'); if (!c || !meetRec) return clearInterval(tick); c.textContent = meetT(meetRec.seconds); }, 500);
  const guard = e => { e.preventDefault(); e.returnValue = ''; }; addEventListener('beforeunload', guard);
  let paused = false; $('#mpause').onclick = e => { paused = !paused; meetRec.pause(paused); e.target.textContent = paused ? 'อัดต่อ' : 'หยุดชั่วคราว'; box.querySelector('.meet-live').classList.toggle('paused', paused); };
  $('#mstop').onclick = async e => {
    e.target.disabled = true; $('#mpause').disabled = true; $('#mst').textContent = 'กำลังส่งเสียงช่วงสุดท้าย…';
    await meetRec.stop(); meetRec = null; clearInterval(tick); removeEventListener('beforeunload', guard);
    $('#mst').textContent = 'กำลังถอดเสียงและสรุป… (ปิดหน้านี้ได้ ระบบทำต่อให้)';
    api(`/meetings/${m.id}/finish`, { method: 'POST' }).catch(() => {}).finally(() => go('/meetings?id=' + m.id));
  };
}
async function meetDetail(id) {
  let m; try { m = await api('/meetings/' + id); } catch (x) { return page(nav() + `<div class="wrap"><p class="bad">${esc(x.message)}</p><a href="/meetings">← การประชุมทั้งหมด</a></div>`); }
  const sp = m.speakers || {}, name = s => sp[s] || s, sum = m.summary, busy = ['processing', 'summarizing', 'recording'].includes(m.status);
  const spk = [...new Set(m.lines.map(l => l.s))], hue = s => (spk.indexOf(s) * 67 + 200) % 360;
  const failed = m.seg_list.filter(s => s.status === 'error'), done = m.seg_list.filter(s => s.status === 'done').length;
  const sumHTML = sum ? `<section class="card meet-sum"><h2>สรุป</h2><div class="msg ai"><div class="b">${md(sum.summary || '')}</div></div>
    ${sum.decisions?.length ? `<h3>ข้อตกลง</h3><ul>${sum.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${sum.actions?.length ? `<h3>งานที่ต้องทำ</h3><div class="tw"><table class="tbl meet-act"><tr><th>ใคร</th><th>ทำอะไร</th><th>ภายใน</th></tr>${sum.actions.map(a => `<tr><td>${esc(name(a.who))}</td><td>${esc(a.what)}</td><td>${esc(a.when || '-')}</td></tr>`).join('')}</table></div>` : ''}</section>` : '';
  page(nav() + `<div class="wrap sites-wrap meet-detail"><p><a href="/meetings">← การประชุมทั้งหมด</a></p>
    <header class="meet-h"><h1 id="mt" title="แตะเพื่อแก้ชื่อ">${esc(m.title)}</h1><p class="muted">${when(m.created_at)} · ${meetDur(m.dur)} · ${spk.length} คนพูด <span class="pill ${MEET_ST[m.status]?.[0] || ''}">${MEET_ST[m.status]?.[1] || ''}</span></p></header>
    ${busy ? `<div class="card meet-prog"><div class="meter"><div class="fill" style="width:${m.status === 'summarizing' ? 92 : Math.round(done / Math.max(1, m.seg_list.length) * 85)}%"></div></div><small class="muted">${m.status === 'recording' ? 'ยังอัดอยู่ หรือปิดหน้าไประหว่างอัด · ' : ''}ถอดแล้ว ${done}/${m.seg_list.length} ช่วง · หน้านี้อัปเดตเอง</small>${m.status === 'recording' ? '<button type="button" class="btn out sm" id="mfin">จบการอัดและสรุปเลย</button>' : ''}</div>` : ''}
    ${m.error ? `<p class="bad">${esc(m.error)}</p>` : ''}${failed.length ? `<div class="card"><p class="bad">ถอดไม่สำเร็จ ${failed.length} ช่วง: ${esc(failed[0].error || '')}</p><button type="button" class="btn out sm" id="mretry">${ic('refresh', 'sm')} ลองใหม่</button></div>` : ''}
    <div class="site-act meet-tools">${sum ? `<button type="button" class="btn blue sm" id="mchat">${ic('msg', 'sm')} ถามเกี่ยวกับประชุมนี้</button>` : ''}<button type="button" class="btn out sm" id="mdoc">${ic('download', 'sm')} Word</button><button type="button" class="btn out sm" id="mcopy">${ic('copy', 'sm')} คัดลอกสรุป</button><button type="button" class="btn out sm" id="mspk">${ic('users', 'sm')} ตั้งชื่อคนพูด</button><button type="button" class="btn ghost sm" id="mdel">${ic('trash', 'sm')} ลบ</button></div>
    ${sumHTML}
    <section class="card meet-tr"><h2>บทถอดความ</h2>${m.audio ? '<audio id="maud" controls preload="none" hidden></audio>' : '<p class="muted">ไฟล์เสียงถูกลบแล้ว (เก็บ 30 วัน)</p>'}
      ${m.lines.length ? m.lines.map(l => `<p class="meet-line"><button type="button" class="meet-ts" data-n="${l.n}" data-o="${l.o}" ${m.audio ? '' : 'disabled'} aria-label="เล่นจาก ${meetT(l.t)}">${meetT(l.t)}</button><b style="--h:${hue(l.s)}">${esc(name(l.s))}</b><span>${esc(l.x)}</span></p>`).join('') : '<p class="muted">ยังไม่มีข้อความ</p>'}</section>${footer()}</div>`);
  const aud = $('#maud');
  app.querySelectorAll('.meet-ts').forEach(b => b.onclick = () => { if (!aud) return; const src = `/api/meetings/${id}/audio/${b.dataset.n}`; aud.hidden = false; const seek = () => { aud.currentTime = +b.dataset.o; aud.play().catch(() => {}); }; if (!aud.src.endsWith(src)) { aud.src = src; aud.addEventListener('loadedmetadata', seek, { once: true }); aud.load(); } else seek(); app.querySelectorAll('.meet-line.on').forEach(x => x.classList.remove('on')); b.parentElement.classList.add('on'); });
  const text = () => `${m.title}\n${when(m.created_at)} · ${meetDur(m.dur)}\n\n${sum ? `สรุป\n${(sum.summary || '').replace(/[*#_`]/g, '')}\n\n${sum.decisions?.length ? 'ข้อตกลง\n' + sum.decisions.map(x => '• ' + x).join('\n') + '\n\n' : ''}${sum.actions?.length ? 'งานที่ต้องทำ\n' + sum.actions.map(a => `• ${name(a.who)}: ${a.what}${a.when ? ' (ภายใน ' + a.when + ')' : ''}`).join('\n') : ''}` : ''}`;
  $('#mcopy').onclick = e => copy(text(), e.target);
  $('#mdoc').onclick = () => { // Word เปิดไฟล์ HTML นามสกุล .doc ได้ตรงๆ
    const h = `<html><head><meta charset="utf-8"><title>${esc(m.title)}</title></head><body style="font-family:Tahoma,sans-serif"><h1>${esc(m.title)}</h1><p>${when(m.created_at)} · ${meetDur(m.dur)}</p>${sum ? `<h2>สรุป</h2>${md(sum.summary || '')}${sum.decisions?.length ? `<h2>ข้อตกลง</h2><ul>${sum.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${sum.actions?.length ? `<h2>งานที่ต้องทำ</h2><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>ใคร</th><th>ทำอะไร</th><th>ภายใน</th></tr>${sum.actions.map(a => `<tr><td>${esc(name(a.who))}</td><td>${esc(a.what)}</td><td>${esc(a.when || '-')}</td></tr>`).join('')}</table>` : ''}` : ''}<h2>บทถอดความ</h2>${m.lines.map(l => `<p><b>[${meetT(l.t)}] ${esc(name(l.s))}:</b> ${esc(l.x)}</p>`).join('')}</body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + h], { type: 'application/msword' })); a.download = m.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.doc'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $('#mchat')?.addEventListener('click', async e => { e.target.disabled = true; try { const r = await api(`/meetings/${id}/chat`, { method: 'POST' }); go('/chat?id=' + r.chat_id); } catch (x) { e.target.disabled = false; toast(x.message, 'bad'); } });
  $('#mt').onclick = () => sheet('แก้ชื่อการประชุม', `<div class="sheet-form"><input id="mtn" maxlength="100" value="${esc(m.title)}"><button type="button" class="btn blue" id="mts">บันทึก</button></div>`, (dd, close) => { dd.querySelector('#mts').onclick = async () => { await api('/meetings/' + id, { method: 'PATCH', body: { title: dd.querySelector('#mtn').value } }); close(); meetDetail(id); }; });
  $('#mspk').onclick = () => sheet('ตั้งชื่อคนพูด', spk.length ? `<div class="sheet-form">${spk.map(s => `<label>${esc(s)}<input data-sp="${esc(s)}" maxlength="40" value="${esc(sp[s] || '')}" placeholder="ชื่อจริง"></label>`).join('')}<button type="button" class="btn blue" id="msps">บันทึก</button></div>` : '<p class="muted">ยังไม่มีคนพูด</p>', (dd, close) => {
    dd.querySelector('#msps')?.addEventListener('click', async () => { const o = {}; dd.querySelectorAll('[data-sp]').forEach(i => { o[i.dataset.sp] = i.value; }); await api('/meetings/' + id, { method: 'PATCH', body: { speakers: o } }); close(); meetDetail(id); });
  });
  $('#mdel').onclick = async () => { if (!confirm('ลบการประชุมนี้ถาวร? ทั้งเสียงและบทถอดความจะหาย')) return; await api('/meetings/' + id, { method: 'DELETE' }); go('/meetings'); };
  $('#mretry')?.addEventListener('click', async e => { e.target.disabled = true; e.target.textContent = 'กำลังถอดใหม่…'; await api(`/meetings/${id}/retry`, { method: 'POST' }).catch(x => toast(x.message, 'bad')); meetDetail(id); });
  $('#mfin')?.addEventListener('click', async e => { e.target.disabled = true; await api(`/meetings/${id}/finish`, { method: 'POST' }).catch(x => toast(x.message, 'bad')); meetDetail(id); });
  if (busy) setTimeout(() => { if (+qs().get('id') === id && document.body.dataset.page === 'meetings' && !document.querySelector('.sheet-bg')) meetDetail(id); }, 6000);
}
