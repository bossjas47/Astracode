-- Kyber Studio: ให้ Kyber Agent (แอปคอม) ทำงานใน Roblox Studio ได้โดยไม่ต้องตั้ง MCP
-- ปลั๊กอินถามงานจากแอป Kyber ในเครื่องเดียวกัน (127.0.0.1 เท่านั้น) ทำใน Studio แล้วส่งผลกลับ
-- ทุกการแก้ไขบันทึกใน Undo (Ctrl+Z ย้อนได้) · ปุ่ม "Kyber" บนแถบเครื่องมือ = เปิด/ปิดการเชื่อมต่อ
local PORT, TOKEN, VERSION = "{{PORT}}", "{{TOKEN}}", "1"
local BASE = "http://127.0.0.1:" .. PORT .. "/kyber-rbx"

local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")
local CHS = game:GetService("ChangeHistoryService")
local okSES, ScriptEditorService = pcall(function() return game:GetService("ScriptEditorService") end)

local K = {}

-- ---------- เส้นทาง: "Workspace.Map.Part" / "game.ServerScriptService.Main" / {"Workspace","ชื่อมี.จุด"} ----------
function K.split(p)
  if type(p) == "table" then return p end
  local out = {}
  for seg in string.gmatch(tostring(p or ""), "[^%.]+") do table.insert(out, seg) end
  if out[1] == "game" then table.remove(out, 1) end
  return out
end
function K.resolve(p)
  local segs = K.split(p)
  if #segs == 0 then return game end
  local cur = game:FindFirstChild(segs[1])
  if not cur then local ok, s = pcall(function() return game:GetService(segs[1]) end); if ok then cur = s end end
  if not cur then return nil, "ไม่พบ " .. segs[1] end
  for i = 2, #segs do
    local nxt = cur:FindFirstChild(segs[i])
    if not nxt then return nil, "ไม่พบ " .. segs[i] .. " ใน " .. cur:GetFullName() end
    cur = nxt
  end
  return cur
end
function K.must(p) local x, e = K.resolve(p); if not x then error(e or ("ไม่พบ " .. tostring(p)), 0) end; return x end
local function isScript(x) return x:IsA("LuaSourceContainer") end

-- ---------- แปลงค่าจาก JSON เป็นชนิดของ Roblox ตามชนิดของคุณสมบัติเดิม ----------
function K.convert(inst, prop, v)
  if prop == "Parent" then return K.must(v) end
  local ok, cur = pcall(function() return inst[prop] end)
  local t = ok and typeof(cur) or nil
  if t == "Vector3" and type(v) == "table" then return Vector3.new(v[1] or 0, v[2] or 0, v[3] or 0) end
  if t == "Vector2" and type(v) == "table" then return Vector2.new(v[1] or 0, v[2] or 0) end
  if t == "CFrame" and type(v) == "table" then
    local c = CFrame.new(v[1] or 0, v[2] or 0, v[3] or 0)
    if v[4] or v[5] or v[6] then c = c * CFrame.Angles(math.rad(v[4] or 0), math.rad(v[5] or 0), math.rad(v[6] or 0)) end
    return c
  end
  if t == "Color3" then
    if type(v) == "string" then return Color3.fromHex(v) end
    if type(v) == "table" then
      if (v[1] or 0) > 1 or (v[2] or 0) > 1 or (v[3] or 0) > 1 then return Color3.fromRGB(v[1] or 0, v[2] or 0, v[3] or 0) end
      return Color3.new(v[1] or 0, v[2] or 0, v[3] or 0)
    end
  end
  if t == "UDim2" and type(v) == "table" then return UDim2.new(v[1] or 0, v[2] or 0, v[3] or 0, v[4] or 0) end
  if t == "UDim" and type(v) == "table" then return UDim.new(v[1] or 0, v[2] or 0) end
  if t == "BrickColor" and type(v) == "string" then return BrickColor.new(v) end
  if t == "EnumItem" and type(v) == "string" then
    local name = string.match(v, "([%w_]+)$")
    return cur.EnumType[name]
  end
  if t == "Instance" and type(v) == "string" then return K.must(v) end
  return v
end
function K.setProps(inst, props)
  local bad = {}
  for prop, v in pairs(props or {}) do
    local ok, e = pcall(function() inst[prop] = K.convert(inst, prop, v) end)
    if not ok then table.insert(bad, prop .. ": " .. tostring(e)) end
  end
  return bad
end

-- ---------- Output: เก็บ 300 บรรทัดล่าสุด ----------
local logBuf, logSeq = {}, 0
function K.log(msg, kind)
  logSeq = logSeq + 1
  local tag = ""
  if kind == Enum.MessageType.MessageError then tag = "[error] " elseif kind == Enum.MessageType.MessageWarning then tag = "[warn] " end
  table.insert(logBuf, { n = logSeq, t = tag .. tostring(msg) })
  if #logBuf > 300 then table.remove(logBuf, 1) end
end
function K.logsSince(n)
  local out = {}
  for _, l in ipairs(logBuf) do if l.n > (n or 0) then table.insert(out, l.t) end end
  return table.concat(out, "\n")
end

-- ---------- คำสั่ง ----------
local OPS = {}
local function lines(src)
  local out, i = {}, 0
  for line in string.gmatch(src .. "\n", "(.-)\n") do i = i + 1; table.insert(out, i .. "\t" .. line) end
  return table.concat(out, "\n")
end
local function setSource(s, src)
  if okSES and ScriptEditorService then
    local ok = pcall(function() ScriptEditorService:UpdateSourceAsync(s, function() return src end) end)
    if ok then return end
  end
  s.Source = src
end

function OPS.info()
  local sel = {}
  for _, x in ipairs(Selection:Get()) do table.insert(sel, x:GetFullName()) end
  return { place = game.Name, placeId = game.PlaceId, running = RunService:IsRunning(), selection = sel, version = VERSION }
end

function OPS.tree(a)
  local root = K.must(a.path or "")
  local depth, max, n, out = tonumber(a.depth) or 2, tonumber(a.max) or 250, 0, {}
  local function walk(x, d, pad)
    if n >= max then return end
    n = n + 1
    local kids = x:GetChildren()
    local extra = ""
    if isScript(x) then local _, c = string.gsub(x.Source, "\n", "\n"); extra = " (" .. (c + 1) .. " บรรทัด)" end
    if d >= depth and #kids > 0 then extra = extra .. " +" .. #kids end
    table.insert(out, pad .. x.Name .. " [" .. x.ClassName .. "]" .. extra)
    if d < depth then for _, k in ipairs(kids) do walk(k, d + 1, pad .. "  ") end end
  end
  if root == game then
    for _, s in ipairs({ "Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPlayer", "StarterPack", "Lighting", "Teams", "SoundService" }) do
      local ok, svc = pcall(function() return game:GetService(s) end)
      if ok and svc then walk(svc, 1, "") end
    end
  else walk(root, 0, "") end
  if n >= max then table.insert(out, "…(แสดง " .. max .. " รายการแรก ใช้ path ลึกลงไปหรือ find)") end
  return table.concat(out, "\n")
end

function OPS.find(a)
  local root, out, max = K.must(a.path or "Workspace"), {}, tonumber(a.max) or 60
  local q = string.lower(tostring(a.query or ""))
  local function hit(x)
    if a.class and not x:IsA(a.class) then return false end
    if q ~= "" then
      if string.find(string.lower(x.Name), q, 1, true) then return true end
      if a.in_source and isScript(x) and string.find(string.lower(x.Source), q, 1, true) then return true end
      return false
    end
    return true
  end
  for _, x in ipairs(root:GetDescendants()) do
    if hit(x) then table.insert(out, x:GetFullName() .. " [" .. x.ClassName .. "]"); if #out >= max then break end end
  end
  return #out > 0 and table.concat(out, "\n") or "ไม่พบ"
end

function OPS.read(a)
  local x = K.must(a.path)
  if isScript(x) then return x:GetFullName() .. " [" .. x.ClassName .. "]\n" .. lines(x.Source) end
  local props, out = { "Name", "ClassName", "Position", "Size", "CFrame", "Color", "Material", "Anchored", "CanCollide", "Transparency", "Text", "Value", "Visible", "Enabled" }, {}
  for _, p in ipairs(props) do local ok, v = pcall(function() return x[p] end); if ok and v ~= nil then table.insert(out, p .. " = " .. tostring(v)) end end
  local attrs = x:GetAttributes()
  for k, v in pairs(attrs) do table.insert(out, "@" .. k .. " = " .. tostring(v)) end
  return x:GetFullName() .. "\n" .. table.concat(out, "\n")
end

function OPS.write(a)
  local x = K.resolve(a.path)
  if not x then
    local segs = K.split(a.path)
    local name = table.remove(segs)
    local parent = K.must(segs)
    x = Instance.new(a.class or "Script")
    x.Name = name
    x.Parent = parent
  end
  if not isScript(x) then error(x:GetFullName() .. " ไม่ใช่สคริปต์", 0) end
  setSource(x, tostring(a.source or ""))
  return "เขียน " .. x:GetFullName() .. " [" .. x.ClassName .. "] แล้ว"
end

function OPS.edit(a)
  local x = K.must(a.path)
  if not isScript(x) then error(x:GetFullName() .. " ไม่ใช่สคริปต์", 0) end
  local src, old = x.Source, tostring(a.old or "")
  if old == "" then error("ต้องใส่ old", 0) end
  local s, e = string.find(src, old, 1, true)
  if not s then error("ไม่พบข้อความ old ในสคริปต์ (อ่านใหม่ด้วย read แล้วคัดลอกให้ตรง)", 0) end
  if string.find(src, old, e + 1, true) then error("old ตรงหลายที่ ใส่ข้อความรอบ ๆ ให้ยาวขึ้น", 0) end
  setSource(x, string.sub(src, 1, s - 1) .. tostring(a.new or "") .. string.sub(src, e + 1))
  return "แก้ " .. x:GetFullName() .. " แล้ว"
end

function OPS.create(a)
  local parent = K.must(a.parent or "Workspace")
  local x = Instance.new(a.class or "Part")
  if a.name then x.Name = a.name end
  local bad = K.setProps(x, a.props)
  x.Parent = parent
  return "สร้าง " .. x:GetFullName() .. " [" .. x.ClassName .. "]" .. (#bad > 0 and ("\nตั้งค่าไม่ได้: " .. table.concat(bad, "; ")) or "")
end

function OPS.set(a)
  local x = K.must(a.path)
  local bad = K.setProps(x, a.props)
  return "ตั้งค่า " .. x:GetFullName() .. " แล้ว" .. (#bad > 0 and ("\nตั้งค่าไม่ได้: " .. table.concat(bad, "; ")) or "")
end

function OPS.delete(a)
  local x = K.must(a.path)
  local name = x:GetFullName()
  x:Destroy()
  return "ลบ " .. name .. " แล้ว (Ctrl+Z ใน Studio ย้อนได้)"
end

function OPS.run(a)
  local code = tostring(a.code or "")
  local fn, err = loadstring(code)
  if not fn then error("โค้ดผิด: " .. tostring(err), 0) end
  local printed = {}
  local function cat(...)
    local t = {}
    for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
    return table.concat(t, " ")
  end
  local env = setmetatable({ print = function(...) table.insert(printed, cat(...)) end, warn = function(...) table.insert(printed, "[warn] " .. cat(...)) end }, { __index = getfenv(0) })
  setfenv(fn, env)
  local res = { pcall(fn) }
  if not res[1] then error(table.concat(printed, "\n") .. (#printed > 0 and "\n" or "") .. "Error: " .. tostring(res[2]), 0) end
  local ret = {}
  for i = 2, #res do table.insert(ret, tostring(res[i])) end
  return table.concat(printed, "\n") .. (#ret > 0 and ("\n=> " .. table.concat(ret, ", ")) or "")
end

function OPS.output(a)
  local s = K.logsSince(tonumber(a.since) or 0)
  return s ~= "" and s or "(ยังไม่มีข้อความใน Output)"
end

-- ทดสอบแบบ Run (เซิร์ฟเวอร์จำลองใน Studio) ตามวินาทีที่กำหนด แล้วหยุด · คืน Output ระหว่างนั้น (error ของสคริปต์ขึ้นเป็น [error])
function OPS.play(a)
  local secs = math.min(tonumber(a.seconds) or 8, 60)
  local from = logSeq
  RunService:Run()
  task.wait(secs)
  pcall(function() RunService:Stop() end)
  task.wait(0.5)
  local s = K.logsSince(from)
  return "ทดสอบ " .. secs .. " วินาที (โหมด Run: สคริปต์ฝั่งเซิร์ฟเวอร์ · LocalScript/GUI ต้องกด Play เอง)\n" .. (s ~= "" and s or "(ไม่มีข้อความใน Output)")
end

local MUTATES = { write = true, edit = true, create = true, set = true, delete = true, run = true }
function K.exec(cmd)
  local f = OPS[cmd.op]
  if not f then return false, "ไม่รู้จักคำสั่ง " .. tostring(cmd.op) end
  local rec
  if MUTATES[cmd.op] then local ok, r = pcall(function() return CHS:TryBeginRecording("Kyber AI: " .. cmd.op) end); if ok then rec = r end end
  local ok, res = pcall(f, cmd.args or {})
  if rec then pcall(function() CHS:FinishRecording(rec, ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel) end) end
  return ok, res
end

-- ---------- เชื่อมกับแอป Kyber ----------
local enabled, connected = true, false
local function req(method, path, body)
  return HttpService:RequestAsync({ Url = BASE .. path, Method = method, Headers = { ["Content-Type"] = "application/json", ["X-Kyber-Token"] = TOKEN }, Body = body })
end
function K.step()
  local ok, r = pcall(req, "GET", "/poll?place=" .. HttpService:UrlEncode(game.Name))
  if not ok or not r.Success then connected = false; return false end
  connected = true
  if r.StatusCode ~= 200 or r.Body == "" then return true end
  local cmd = HttpService:JSONDecode(r.Body)
  local okRun, res = K.exec(cmd)
  local payload = HttpService:JSONEncode({ id = cmd.id, ok = okRun, data = res })
  pcall(req, "POST", "/result", payload)
  return true
end

if plugin then
  LogService.MessageOut:Connect(K.log)
  local toolbar = plugin:CreateToolbar("Kyber")
  local btn = toolbar:CreateButton("Kyber AI", "เปิด/ปิดการเชื่อมต่อกับแอป Kyber (Agent ทำงานใน Studio ได้)", "rbxassetid://4458901886")
  btn:SetActive(true)
  btn.Click:Connect(function() enabled = not enabled; btn:SetActive(enabled); print(enabled and "[Kyber] เชื่อมต่อแล้ว" or "[Kyber] ปิดการเชื่อมต่อ") end)
  task.spawn(function()
    local wasConnected = false
    while true do
      if enabled and RunService:IsEdit() then
        local ok = K.step()
        if ok and not wasConnected then print("[Kyber] เชื่อมกับแอป Kyber แล้ว · สั่ง Agent ให้ทำงานใน Studio ได้เลย") end
        wasConnected = ok
        if not ok then task.wait(3) end
      else task.wait(1) end
    end
  end)
end

return K
