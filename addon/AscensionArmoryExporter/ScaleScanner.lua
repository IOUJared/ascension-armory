local ADDON_PREFIX = "|cfff0ce78Ascension Armory:|r "
local REQUEST_DELAY = 0.25
local CACHED_DELAY = 0.01
local MAX_ATTEMPTS = 4

local scanner = CreateFrame("Frame", "AscensionArmoryScaleScannerFrame")
local queue = {}
local queueHead = 1
local queued = {}
local current = nil
local running = false
local elapsed = 0

local function Message(text)
  DEFAULT_CHAT_FRAME:AddMessage(ADDON_PREFIX .. text)
end

local function Encode(value)
  return string.gsub(tostring(value or ""), "([^%w%-%._])", function(character)
    return string.format("%%%02X", string.byte(character))
  end)
end

local function IconName(texture)
  return texture and (string.match(texture, "([^\\/]+)$") or texture) or ""
end

local function ScaleKey(itemID, effectiveLevel)
  return tostring(itemID) .. ":" .. tostring(effectiveLevel)
end

local function ScaleLink(itemID, effectiveLevel)
  return "item:" .. tostring(itemID) .. ":0:0:0:0:0:0:0:" .. tostring(effectiveLevel)
end

local function Enqueue(itemID, effectiveLevel)
  local key = ScaleKey(itemID, effectiveLevel)
  if queued[key] or AscensionArmoryCatalogDB.scaleRecords[key] then return end
  queued[key] = true
  table.insert(queue, { id = itemID, level = effectiveLevel, key = key, attempts = 0 })
end

local function Remaining()
  return math.max(0, #queue - queueHead + 1)
end

local function Request(candidate)
  if C_AssetQueryService and C_AssetQueryService.TryCacheItem then
    return pcall(C_AssetQueryService.TryCacheItem, candidate.id)
  elseif TryCacheItem then
    return pcall(TryCacheItem, candidate.id)
  end
  return false
end

local function Snapshot(candidate)
  local query = ScaleLink(candidate.id, candidate.level)
  local name, link, quality, itemLevel, requiredLevel, _, _, _, _, icon = GetItemInfo(query)
  if not name or not link then return nil end
  local stats = {}
  for key, value in pairs(GetItemStats(query) or GetItemStats(link) or {}) do
    if type(key) == "string" and type(value) == "number" then stats[key] = value end
  end
  return {
    link = link,
    name = name,
    quality = quality,
    itemLevel = itemLevel,
    requiredLevel = requiredLevel,
    icon = icon,
    stats = stats,
    playerLevel = UnitLevel("player"),
    sourceRealm = GetRealmName(),
    capturedAt = time(),
  }
end

local function Store(candidate, snapshot)
  local statParts = {}
  for key, value in pairs(snapshot.stats or {}) do
    table.insert(statParts, key .. ":" .. tostring(value))
  end
  table.sort(statParts)
  AscensionArmoryCatalogDB.scaleRecords[candidate.key] = {
    itemID = candidate.id,
    effectiveLevel = candidate.level,
    itemLevel = snapshot.itemLevel,
    requiredLevel = snapshot.requiredLevel,
    stats = snapshot.stats,
    capturedPlayerLevel = snapshot.playerLevel,
    capturedAt = snapshot.capturedAt,
  }
  AscensionArmoryCatalogDB.scaleExports[candidate.key] = table.concat({
    "AAS1", tostring(candidate.id), tostring(candidate.level), Encode(snapshot.link),
    tostring(snapshot.itemLevel or 0), tostring(snapshot.requiredLevel or 0),
    tostring(snapshot.playerLevel or 0), table.concat(statParts, ","),
    Encode(snapshot.sourceRealm), tostring(snapshot.quality or 1),
    Encode(IconName(snapshot.icon)), Encode(snapshot.name),
  }, "~")
  AscensionArmoryCatalogDB.scaleFailures[candidate.key] = nil
  AscensionArmoryCatalogDB.scaleCompleted = (AscensionArmoryCatalogDB.scaleCompleted or 0) + 1
end

local function Status()
  local failures = 0
  for _ in pairs(AscensionArmoryCatalogDB.scaleFailures) do failures = failures + 1 end
  Message(string.format("Scaling scan: %d captured, %d queued, %d unresolved%s.",
    AscensionArmoryCatalogDB.scaleCompleted or 0, Remaining(), failures, running and " (scanning)" or ""))
end

local function FinishCurrent()
  if not current then return CACHED_DELAY end
  local snapshot = Snapshot(current)
  if snapshot then
    Store(current, snapshot)
    current = nil
    return CACHED_DELAY
  end
  if current.attempts < MAX_ATTEMPTS then
    current.attempts = current.attempts + 1
    Request(current)
    return REQUEST_DELAY
  end
  AscensionArmoryCatalogDB.scaleFailures[current.key] = { attempts = current.attempts, checkedAt = time() }
  current = nil
  return CACHED_DELAY
end

local function Pump()
  local delay = FinishCurrent()
  if current then return delay end
  current = queue[queueHead]
  queueHead = queueHead + 1
  if not current then
    running = false
    Status()
    Message("Scaling scan complete. Type /reload to save its snapshots.")
    return nil
  end
  return delay
end

scanner:SetScript("OnUpdate", function(_, delta)
  if not running then return end
  elapsed = elapsed + delta
  if elapsed < 0.01 then return end
  local delay = Pump()
  elapsed = delay and -delay or 0
end)

scanner:RegisterEvent("ADDON_LOADED")
scanner:SetScript("OnEvent", function(_, event, addonName)
  if event ~= "ADDON_LOADED" or addonName ~= "AscensionArmoryExporter" then return end
  AscensionArmoryCatalogDB = AscensionArmoryCatalogDB or {}
  AscensionArmoryCatalogDB.scaleRecords = AscensionArmoryCatalogDB.scaleRecords or {}
  AscensionArmoryCatalogDB.scaleExports = AscensionArmoryCatalogDB.scaleExports or {}
  AscensionArmoryCatalogDB.scaleFailures = AscensionArmoryCatalogDB.scaleFailures or {}
  AscensionArmoryCatalogDB.scaleCompleted = AscensionArmoryCatalogDB.scaleCompleted or 0
end)

local function Start(items, minimumLevel, maximumLevel)
  queue, queueHead, queued, current = {}, 1, {}, nil
  for _, itemID in ipairs(items) do
    for effectiveLevel = minimumLevel, maximumLevel do Enqueue(itemID, effectiveLevel) end
  end
  if #queue == 0 then
    Message("All requested scaling snapshots have already been captured.")
    return
  end
  running = true
  elapsed = 0
  Message(string.format("Scanning %d exact item/level snapshots (%d-%d).", #queue, minimumLevel, maximumLevel))
end

SLASH_ASCENSIONARMORYSCALE1 = "/aascale"
SlashCmdList.ASCENSIONARMORYSCALE = function(command)
  command = (command or ""):match("^%s*(.-)%s*$")
  local lowered = string.lower(command)
  if lowered == "stop" then running = false; Message("Scaling scan paused."); return end
  if lowered == "status" then Status(); return end
  if lowered == "test" then Start({ 7691, 1642943 }, 1, 60); return end

  local itemID = tonumber(string.match(command, "item:(%d+)")) or tonumber(string.match(command, "^(%d+)"))
  if not itemID then
    Message("Use /aascale test or /aascale ITEM_ID [MIN_LEVEL] [MAX_LEVEL].")
    return
  end
  local _, _, rawMinimum, rawMaximum = string.find(command, "^%d+%s+(%d+)%s*(%d*)")
  local minimumLevel = math.max(1, math.min(60, tonumber(rawMinimum) or 1))
  local maximumLevel = math.max(minimumLevel, math.min(60, tonumber(rawMaximum) or 60))
  Start({ itemID }, minimumLevel, maximumLevel)
end
