local ADDON_PREFIX = "|cfff0ce78Ascension Armory:|r "
local REQUEST_DELAY = 0.25
local CACHED_DELAY = 0.01
local MAX_ATTEMPTS = 4

local scanner = CreateFrame("Frame", "AscensionArmoryScaleScannerFrame")
local tooltip = CreateFrame("GameTooltip", "AscensionArmoryScaleScanTooltip", UIParent, "GameTooltipTemplate")
tooltip:SetOwner(UIParent, "ANCHOR_NONE")
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

local function HasScaleRecord(key)
  return (AscensionArmoryCatalogDB.scaleExports and AscensionArmoryCatalogDB.scaleExports[key])
    or (AscensionArmoryCatalogDB.scaleRecords and AscensionArmoryCatalogDB.scaleRecords[key])
end

local function Enqueue(itemID, effectiveLevel, force)
  local key = ScaleKey(itemID, effectiveLevel)
  if queued[key] or (HasScaleRecord(key) and not force) then return end
  queued[key] = true
  table.insert(queue, { id = itemID, level = effectiveLevel, key = key, attempts = 0 })
end


local function TooltipLines(link)
  tooltip:ClearLines()
  local ok = pcall(tooltip.SetHyperlink, tooltip, link)
  if not ok then return nil end
  tooltip:Show()
  local lines = {}
  for index = 1, tooltip:NumLines() do
    local left = _G["AscensionArmoryScaleScanTooltipTextLeft" .. index]
    local right = _G["AscensionArmoryScaleScanTooltipTextRight" .. index]
    table.insert(lines, { left = left and left:GetText(), right = right and right:GetText() })
  end
  tooltip:Hide()
  return lines
end

local function TooltipArmor(lines)
  for _, line in ipairs(lines or {}) do
    for _, text in ipairs({ line.left, line.right }) do
      if text then
        local clean = string.gsub(string.gsub(text, "|c%x%x%x%x%x%x%x%x", ""), "|r", "")
        local armor = string.match(clean, "^%s*(%d+)%s+[Aa]rmor%s*$")
        if armor then return tonumber(armor) end
      end
    end
  end
  return nil
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
  local tooltipLines = TooltipLines(query)
  if stats.RESISTANCE0_NAME and (not tooltipLines or #tooltipLines == 0) then return nil end
  local tooltipArmor = TooltipArmor(tooltipLines)
  if tooltipArmor then stats.RESISTANCE0_NAME = tooltipArmor end
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
  AscensionArmoryCatalogDB.scaleExports[candidate.key] = table.concat({
    "AAS1", tostring(candidate.id), tostring(candidate.level), Encode(snapshot.link),
    tostring(snapshot.itemLevel or 0), tostring(snapshot.requiredLevel or 0),
    tostring(snapshot.playerLevel or 0), table.concat(statParts, ","),
    Encode(snapshot.sourceRealm), tostring(snapshot.quality or 1),
    Encode(IconName(snapshot.icon)), Encode(snapshot.name),
  }, "~")
  AscensionArmoryCatalogDB.scaleRecords[candidate.key] = nil
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
  for key in pairs(AscensionArmoryCatalogDB.scaleRecords) do
    if AscensionArmoryCatalogDB.scaleExports[key] then
      AscensionArmoryCatalogDB.scaleRecords[key] = nil
    end
  end
end)

local function Start(items, minimumLevel, maximumLevel, force)
  queue, queueHead, queued, current = {}, 1, {}, nil
  for _, itemID in ipairs(items) do
    for effectiveLevel = minimumLevel, maximumLevel do Enqueue(itemID, effectiveLevel, force) end
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
  if lowered == "all" then Start(AscensionArmoryScalingCandidates or {}, 1, 60); return end
  if lowered == "refresh" then Start(AscensionArmoryScalingCandidates or {}, 1, 60, true); return end
  -- 7691 is the fixed original dungeon item, 408609 its generated Normal
  -- dungeon version, and 1642943 a known ScalingStatDistribution control.
  if lowered == "test" then Start({ 7691, 408609, 1642943 }, 1, 60); return end

  local itemID = tonumber(string.match(command, "item:(%d+)")) or tonumber(string.match(command, "^(%d+)"))
  if not itemID then
    Message("Use /aascale all, /aascale refresh, /aascale test, or /aascale ITEM_ID [MIN_LEVEL] [MAX_LEVEL].")
    return
  end
  local _, _, rawMinimum, rawMaximum = string.find(command, "^%d+%s+(%d+)%s*(%d*)")
  local minimumLevel = math.max(1, math.min(60, tonumber(rawMinimum) or 1))
  local maximumLevel = math.max(minimumLevel, math.min(60, tonumber(rawMaximum) or 60))
  Start({ itemID }, minimumLevel, maximumLevel)
end
