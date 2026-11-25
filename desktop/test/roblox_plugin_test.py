# ทดสอบปลั๊กอิน Kyber Studio (Lua 5.1 = ฐานของ Luau) กับ Roblox API จำลอง · รัน: python3 -I desktop/test/roblox_plugin_test.py (ต้องมี pip install lupa)
import os, sys
from lupa import lua51

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'roblox-plugin.lua'), encoding='utf8').read().replace('{{PORT}}', '1').replace('{{TOKEN}}', 't')

MOCK = r'''
local function newClass(cls) return cls end
Instances = {}
local Inst = {}
Inst.__index = function(t, k)
  local m = rawget(Inst, k); if m then return m end
  local p = rawget(t, '_p'); if p[k] ~= nil then return p[k] end
  local c = rawget(t, '_c'); for _, ch in ipairs(c) do if ch._p.Name == k then return ch end end
  return nil
end
Inst.__newindex = function(t, k, v)
  if k == 'Parent' then
    local old = t._p.Parent
    if old then for i, ch in ipairs(old._c) do if ch == t then table.remove(old._c, i) break end end end
    t._p.Parent = v; if v then table.insert(v._c, t) end
    return
  end
  if k == 'Bad' then error('read-only') end
  t._p[k] = v
end
local SCRIPTS = { Script = true, LocalScript = true, ModuleScript = true }
function mk(cls, name)
  local o = setmetatable({ _p = { ClassName = cls, Name = name or cls }, _c = {} }, Inst)
  if SCRIPTS[cls] then o._p.Source = '' end
  if cls == 'Part' then o._p.Size = Vector3.new(4, 1, 2); o._p.Position = Vector3.new(0, 0, 0); o._p.Color = Color3.new(1, 1, 1); o._p.Anchored = false; o._p.Material = Enum.Material.Plastic end
  return o
end
function Inst.FindFirstChild(self, n) for _, ch in ipairs(self._c) do if ch._p.Name == n then return ch end end return nil end
function Inst.GetChildren(self) local r = {} for i, c in ipairs(self._c) do r[i] = c end return r end
function Inst.GetDescendants(self) local r = {} local function w(x) for _, c in ipairs(x._c) do table.insert(r, c); w(c) end end w(self) return r end
function Inst.IsA(self, c) if c == 'LuaSourceContainer' then return SCRIPTS[self._p.ClassName] == true end if c == 'BasePart' then return self._p.ClassName == 'Part' end return self._p.ClassName == c end
function Inst.GetFullName(self) local n, p = self._p.Name, self._p.Parent; while p and p ~= game do n = p._p.Name .. '.' .. n; p = p._p.Parent end return n end
function Inst.Destroy(self) self.Parent = nil end
function Inst.GetAttributes(self) return {} end
function Inst.GetService(self, n) local s = self:FindFirstChild(n); if not s then error('no service ' .. n) end return s end

Vector3 = { new = function(x, y, z) return setmetatable({ X = x, Y = y, Z = z }, { __tostring = function(v) return v.X .. ', ' .. v.Y .. ', ' .. v.Z end, __type = 'Vector3' }) end }
Vector2 = { new = function(x, y) return { X = x, Y = y, __t = 'Vector2' } end }
Color3 = { new = function(r, g, b) return setmetatable({ R = r, G = g, B = b }, { __type = 'Color3' }) end }
Color3.fromRGB = function(r, g, b) return Color3.new(r / 255, g / 255, b / 255) end
Color3.fromHex = function(h) local r, g, b = h:match('#?(%x%x)(%x%x)(%x%x)'); return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16)) end
CFrame = { new = function(x, y, z) return { x = x, y = y, z = z } end, Angles = function() return {} end }
UDim2 = { new = function(a, b, c, d) return { a, b, c, d } end }
UDim = { new = function(a, b) return { a, b } end }
BrickColor = { new = function(n) return { name = n } end }
local MatT = {}
Enum = { Material = setmetatable({ Plastic = { Name = 'Plastic', EnumType = nil }, Neon = { Name = 'Neon' } }, {}), MessageType = { MessageError = 'E', MessageWarning = 'W', MessageOutput = 'O' }, FinishRecordingOperation = { Commit = 'C', Cancel = 'X' } }
for _, v in pairs(Enum.Material) do v.EnumType = Enum.Material; v.__isenum = true end
function typeof(v)
  if type(v) ~= 'table' then return type(v) end
  if getmetatable(v) == Inst then return 'Instance' end
  if v.__isenum then return 'EnumItem' end
  local mt = getmetatable(v); if mt and mt.__type then return mt.__type end
  if v.__t then return v.__t end
  return 'table'
end
Instance = { new = function(c) return mk(c) end }
game = mk('DataModel', 'Place1'); game._p.PlaceId = 0
for _, n in ipairs({ 'Workspace', 'ReplicatedStorage', 'ServerScriptService', 'HttpService', 'LogService', 'RunService', 'Selection', 'ChangeHistoryService' }) do mk(n, n).Parent = game end
local RS = game:FindFirstChild('RunService'); rawset(RS, 'IsRunning', function() return false end); rawset(RS, 'IsEdit', function() return true end)
RS._p.ran = 0; rawset(RS, 'Run', function() RS._p.ran = RS._p.ran + 1; K.log('Workspace.Script:3: attempt to index nil', Enum.MessageType.MessageError) end); rawset(RS, 'Stop', function() end)
local SEL = game:FindFirstChild('Selection'); rawset(SEL, 'Get', function() return {} end)
local CH = game:FindFirstChild('ChangeHistoryService'); CHlog = {}
rawset(CH, 'TryBeginRecording', function(_, n) table.insert(CHlog, 'begin ' .. n); return 'rec' end); rawset(CH, 'FinishRecording', function(_, r, op) table.insert(CHlog, 'finish ' .. op) end)
task = { wait = function() end, spawn = function() end }
plugin = nil
'''

L = lua51.LuaRuntime(unpack_returned_tuples=True)
L.execute(MOCK)
K = L.execute('K = (function() ' + SRC + ' end)(); return K')
L.globals().K = K
fails = 0
def check(name, cond, info=''):
    global fails
    print(('ok   ' if cond else 'FAIL ') + name + (('  ' + str(info)) if not cond else ''))
    if not cond: fails += 1
def to_lua(v):
    if isinstance(v, dict): return L.table_from({k: to_lua(x) for k, x in v.items()})
    if isinstance(v, list): return L.table_from([to_lua(x) for x in v])
    return v
def ex(op, **args):
    return K.exec(L.table_from({'op': op, 'args': to_lua(args)}))

ok, r = ex('write', path='ServerScriptService.Main', source='local x = 1\nprint(x)', **{'class': 'Script'})
check('write creates a Script', ok and 'ServerScriptService.Main' in r, r)
ok, r = ex('read', path='ServerScriptService.Main')
check('read shows line numbers', ok and '1\tlocal x = 1' in r and '2\tprint(x)' in r, r)
ok, r = ex('edit', path='ServerScriptService.Main', old='local x = 1', new='local x = 2')
ok2, r2 = ex('read', path='game.ServerScriptService.Main')
check('edit replaces an exact snippet', ok and '1\tlocal x = 2' in r2, r2)
ok, r = ex('edit', path='ServerScriptService.Main', old='nope', new='x')
check('edit with missing text errors', (not ok) and 'ไม่พบ' in r, r)
ok, r = ex('create', parent='Workspace', name='Lava', props={'Size': [10, 1, 10], 'Color': '#ff0000', 'Material': 'Neon', 'Anchored': True})
part = L.eval('game.Workspace.Lava')
check('create sets Vector3 / hex Color3 / enum / bool', ok and part is not None and part.Size.X == 10 and abs(part.Color.R - 1) < 1e-6 and part.Material.Name == 'Neon' and part.Anchored == True, r)
ok, r = ex('set', path='Workspace.Lava', props={'Color': [0, 255, 0], 'Bad': 1})
check('set converts 0-255 colors and reports bad props', ok and abs(L.eval('game.Workspace.Lava').Color.G - 1) < 1e-6 and 'Bad' in r, r)
ok, r = ex('tree', path='', depth=2)
check('tree lists services and children', ok and 'Workspace [Workspace]' in r and 'Lava [Part]' in r and 'Main [Script] (2 บรรทัด)' in r, r)
ok, r = ex('find', query='lav')
check('find by name', ok and 'Workspace.Lava [Part]' in r, r)
ok, r = ex('run', code='for i = 1, 3 do local p = Instance.new("Part"); p.Name = "Step" .. i; p.Parent = workspace or game.Workspace end\nprint("made", 3)\nreturn 42')
check('run executes Luau, captures print and return', ok and 'made 3' in r and '=> 42' in r and L.eval('game.Workspace.Step3') is not None, r)
ok, r = ex('run', code='error("boom")')
check('run reports runtime errors', (not ok) and 'boom' in r, r)
ok, r = ex('run', code='local = 1')
check('run reports syntax errors', (not ok) and 'โค้ดผิด' in r, r)
ok, r = ex('play', seconds=1)
check('play runs and returns Output errors', ok and '[error] Workspace.Script:3' in r, r)
ok, r = ex('delete', path='Workspace.Lava')
check('delete removes', ok and L.eval('game.Workspace.Lava') is None, r)
ok, r = ex('read', path='Workspace.Nope')
check('missing path errors clearly', (not ok) and 'ไม่พบ Nope' in r, r)
ok, r = ex('fly')
check('unknown op errors', (not ok) and 'ไม่รู้จัก' in r, r)
log = list(L.eval('CHlog').values())
check('changes are recorded for undo', 'begin Kyber AI: write' in log and 'finish C' in log and 'finish X' in log, log)
ok, r = ex('info')
check('info returns place', ok and r.place == 'Place1', r)
# วงถาม-ตอบกับแอป: poll ได้คำสั่ง → ทำ → POST ผลพร้อม token
L.execute('''
local HS = game:FindFirstChild('HttpService'); sent = {}
rawset(HS, 'UrlEncode', function(_, s) return s end)
rawset(HS, 'JSONEncode', function(_, t) return 'id=' .. tostring(t.id) .. ';ok=' .. tostring(t.ok) .. ';data=' .. tostring(t.data) end)
rawset(HS, 'JSONDecode', function(_, s) return { id = 'r1', op = 'find', args = { query = 'Step1' } } end)
rawset(HS, 'RequestAsync', function(_, o)
  table.insert(sent, o.Method .. ' ' .. o.Url .. ' ' .. o.Headers['X-Kyber-Token'] .. ' ' .. tostring(o.Body))
  if o.Method == 'GET' then return { Success = true, StatusCode = 200, Body = 'cmd' } end
  return { Success = true, StatusCode = 200, Body = '{}' }
end)
''')
step_ok = K.step(); sent = list(L.eval('sent').values())
check('poll loop: gets a command, runs it, posts the result with the token', step_ok and sent[0].startswith('GET http://127.0.0.1:1/kyber-rbx/poll?place=Place1 t') and 'POST http://127.0.0.1:1/kyber-rbx/result t id=r1;ok=true;data=Workspace.Step1' in sent[1], sent)
print('FAILED %d' % fails if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
