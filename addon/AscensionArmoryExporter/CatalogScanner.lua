local ADDON_PREFIX = "|cfff0ce78Ascension Armory:|r "
-- Most item-query responses arrive well below 250 ms. Four attempts preserve
-- a full second for slower responses while avoiding multi-second stalls on
-- IDs that do not exist on the current realm.
local REQUEST_DELAY = 0.25
local CACHED_DELAY = 0.01
local MAX_ATTEMPTS = 4

local scanner = CreateFrame("Frame", "AscensionArmoryCatalogScannerFrame")
local tooltip = CreateFrame("GameTooltip", "AscensionArmoryCatalogScanTooltip", nil, "GameTooltipTemplate")
tooltip:SetOwner(UIParent, "ANCHOR_NONE")
local RETRIEVING_TEXT = "Retrieving item information..."

local queue = {}
local queueHead = 1
local queued = {}
local running = false
local elapsed = 0
local current = nil

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

local function SafeCall(owner, method, ...)
  local callback = owner and owner[method]
  if type(callback) ~= "function" then return nil end
  local ok, value = pcall(callback, ...)
  return ok and value or nil
end

local function InstantValue(method, itemID)
  return SafeCall(C_Item, method, itemID) or SafeCall(_G, method, itemID)
end

local function TooltipLines(link)
  tooltip:SetOwner(UIParent, "ANCHOR_NONE")
  tooltip:ClearLines()
  local ok = pcall(tooltip.SetHyperlink, tooltip, link)
  if not ok then return nil end
  local first = _G["AscensionArmoryCatalogScanTooltipTextLeft1"]
  local firstText = first and first:GetText()
  if not firstText or firstText == RETRIEVING_TEXT then return nil end
  local lines = {}
  for index = 1, tooltip:NumLines() do
    local left = _G["AscensionArmoryCatalogScanTooltipTextLeft" .. index]
    local right = _G["AscensionArmoryCatalogScanTooltipTextRight" .. index]
    local leftText = left and left:GetText()
    local rightText = right and right:GetText()
    if leftText or rightText then
      table.insert(lines, { left = leftText, right = rightText })
    end
  end
  return lines
end

local function TooltipArmor(lines)
  for _, line in ipairs(lines or {}) do
    for _, text in ipairs({ line.left, line.right }) do
      if text then
        local clean = string.gsub(string.gsub(text, "|c%x%x%x%x%x%x%x%x", ""), "|r", "")
        local armor = string.match(clean, "^%s*([%d,]+)%s+[Aa]rmor%s*$")
        if armor then return tonumber((string.gsub(armor, ",", ""))) end
      end
    end
  end
  return nil
end

local function Snapshot(candidate)
  local query = candidate.link or candidate.id
  local name, link, quality, itemLevel, requiredLevel, itemType, itemSubType,
    stackCount, equipLocation, icon = GetItemInfo(query)
  if not name or not link then return nil end

  local stats = {}
  for key, value in pairs(GetItemStats(link) or {}) do
    if type(key) == "string" and type(value) == "number" then stats[key] = value end
  end
  local tooltipLines = TooltipLines(link)
  -- CoA can override the client-template armor shown by GetItemStats. Wait for
  -- the rendered tooltip and use its exact armor line as the live authority.
  local tooltipArmor = TooltipArmor(tooltipLines)
  if stats.RESISTANCE0_NAME and not tooltipArmor then return nil end
  if tooltipArmor then stats.RESISTANCE0_NAME = tooltipArmor end
  return {
    id = candidate.id,
    discoveryLink = candidate.link,
    link = link,
    name = name,
    quality = quality,
    itemLevel = itemLevel,
    requiredLevel = requiredLevel,
    itemType = itemType,
    itemSubType = itemSubType,
    stackCount = stackCount,
    equipLocation = equipLocation,
    icon = icon,
    pvePower = InstantValue("GetItemPvEPower", candidate.id),
    pvpPower = InstantValue("GetItemPvPPower", candidate.id),
    inventoryType = InstantValue("GetItemInventoryType", candidate.id),
    classID = InstantValue("GetItemClassID", candidate.id),
    subClassID = InstantValue("GetItemSubClassID", candidate.id),
    stats = stats,
    tooltip = tooltipLines,
    playerLevel = UnitLevel("player"),
    capturedAt = time(),
    sourceRealm = GetRealmName(),
  }
end

local function HasRecord(itemID)
  local key = tostring(itemID)
  return (AscensionArmoryCatalogDB.exports and AscensionArmoryCatalogDB.exports[key])
    or (AscensionArmoryCatalogDB.records and AscensionArmoryCatalogDB.records[key])
end

local function Enqueue(candidate, force)
  if AscensionArmoryCatalogDB and HasRecord(candidate.id) and not force then return end
  local key = tostring(candidate.id) .. "|" .. tostring(candidate.link or "")
  if queued[key] then return end
  queued[key] = true
  table.insert(queue, { id = candidate.id, link = candidate.link, attempts = 0, key = key, test = candidate.test })
end

local function Remaining()
  return math.max(0, #queue - queueHead + 1)
end

local function Store(candidate, snapshot)
  local statParts = {}
  for key, value in pairs(snapshot.stats or {}) do
    table.insert(statParts, key .. ":" .. tostring(value))
  end
  table.sort(statParts)
  local tooltipParts = {}
  for _, line in ipairs(snapshot.tooltip or {}) do
    table.insert(tooltipParts, tostring(line.left or "") .. "\t" .. tostring(line.right or ""))
  end
  AscensionArmoryCatalogDB.exports[tostring(candidate.id)] = table.concat({
    "AAI1", tostring(candidate.id), Encode(snapshot.link), tostring(snapshot.quality or 1),
    tostring(snapshot.itemLevel or 0), tostring(snapshot.requiredLevel or 0),
    Encode(snapshot.itemType), Encode(snapshot.itemSubType), Encode(snapshot.equipLocation),
    Encode(IconName(snapshot.icon)), Encode(snapshot.name), tostring(snapshot.pvePower or 0),
    tostring(snapshot.pvpPower or 0), tostring(snapshot.playerLevel or 0),
    table.concat(statParts, ","), Encode(table.concat(tooltipParts, "\n")),
    tostring(snapshot.inventoryType or 0), tostring(snapshot.classID or 0),
    tostring(snapshot.subClassID or 0),
  }, "~")
  -- The encoded export contains everything the importer needs. Keeping the
  -- full snapshot as well doubled SavedVariables to tens of megabytes.
  AscensionArmoryCatalogDB.records[tostring(candidate.id)] = nil
  AscensionArmoryCatalogDB.completed = (AscensionArmoryCatalogDB.completed or 0) + 1
  if candidate.test then
    Message(string.format("Armor test captured %s with %d Armor.", snapshot.name or candidate.id,
      snapshot.stats.RESISTANCE0_NAME or 0))
  end
  if GetItemDifficultyID then
    for difficulty = 4, 9 do
      local ok, difficultyID = pcall(GetItemDifficultyID, candidate.id, difficulty)
      if ok and difficultyID and difficultyID ~= candidate.id then Enqueue({ id = difficultyID }) end
    end
  end
end

local function Request(candidate)
  local cacheRequested = false
  if C_AssetQueryService and C_AssetQueryService.TryCacheItem then
    cacheRequested = pcall(C_AssetQueryService.TryCacheItem, candidate.id)
  elseif TryCacheItem then
    cacheRequested = pcall(TryCacheItem, candidate.id)
  end
  tooltip:SetOwner(UIParent, "ANCHOR_NONE")
  tooltip:ClearLines()
  local tooltipRequested = pcall(tooltip.SetHyperlink, tooltip,
    candidate.link or ("item:" .. candidate.id .. ":0:0:0:0:0:0:0"))
  tooltip:Hide()
  return cacheRequested or tooltipRequested
end

local function Status()
  local failures = 0
  for _ in pairs(AscensionArmoryCatalogDB.failures) do failures = failures + 1 end
  Message(string.format("%d captured, %d queued, %d unresolved%s.",
    AscensionArmoryCatalogDB.completed or 0, Remaining(), failures, running and " (scanning)" or ""))
end

local function FinishCurrent()
  if not current then return CACHED_DELAY end
  local snapshot = Snapshot(current)
  if snapshot then
    Store(current, snapshot)
    AscensionArmoryCatalogDB.failures[tostring(current.id)] = nil
    current = nil
    if (AscensionArmoryCatalogDB.completed or 0) % 100 == 0 then Status() end
    return CACHED_DELAY
  end
  if current.attempts < MAX_ATTEMPTS then
    current.attempts = current.attempts + 1
    Request(current)
    return REQUEST_DELAY
  end
  AscensionArmoryCatalogDB.failures[tostring(current.id)] = { attempts = current.attempts, checkedAt = time() }
  if current.test then Message("Armor test failed to read a rendered armor line.") end
  current = nil
  return CACHED_DELAY
end

local function Pump()
  local delay = FinishCurrent()
  if current then return delay end
  -- Advancing a cursor is constant-time. table.remove(queue, 1) shifted every
  -- remaining row on each item and became costly on five-figure scans.
  current = queue[queueHead]
  queueHead = queueHead + 1
  if not current then
    running = false
    Status()
    Message("Scan complete. Type /reload to save the catalog for website import.")
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
  AscensionArmoryCatalogDB.version = 1
  AscensionArmoryCatalogDB.records = AscensionArmoryCatalogDB.records or {}
  AscensionArmoryCatalogDB.exports = AscensionArmoryCatalogDB.exports or {}
  AscensionArmoryCatalogDB.failures = AscensionArmoryCatalogDB.failures or {}
  AscensionArmoryCatalogDB.completed = AscensionArmoryCatalogDB.completed or 0
  for itemID in pairs(AscensionArmoryCatalogDB.records) do
    if AscensionArmoryCatalogDB.exports[itemID] then
      AscensionArmoryCatalogDB.records[itemID] = nil
    end
  end
end)

local function BeginQueue(label)
  if #queue == 0 then
    Message("No " .. label .. " candidates need to be scanned.")
    return
  end
  running = true
  elapsed = 0
  Message(string.format("Scanning %d %s candidates. You can keep playing normally.", #queue, label))
end

local function StartScan()
  queue, queueHead, queued, current = {}, 1, {}, nil
  for _, candidate in ipairs(AscensionArmoryWorldforgedCandidates or {}) do
    if not HasRecord(candidate.id) then Enqueue(candidate) end
  end
  BeginQueue("current CoA")
end

local function RetryFailures()
  queue, queueHead, queued, current = {}, 1, {}, nil
  for itemID in pairs(AscensionArmoryCatalogDB.failures) do
    local numericID = tonumber(itemID)
    if numericID and not HasRecord(itemID) then
      Enqueue({ id = numericID })
    end
  end
  for _, itemID in ipairs(AscensionArmoryRetryCandidates or {}) do
    if not HasRecord(itemID) then Enqueue({ id = itemID }) end
  end
  BeginQueue("previously unresolved")
end

local function RefreshArmor()
  queue, queueHead, queued, current = {}, 1, {}, nil
  for _, itemID in ipairs(AscensionArmoryArmorCandidates or {}) do
    Enqueue({ id = itemID }, true)
  end
  BeginQueue("armor-tooltip refresh")
end

local function TestArmor()
  queue, queueHead, queued, current = {}, 1, {}, nil
  Enqueue({ id = 354178, test = true }, true)
  BeginQueue("armor test")
end

SLASH_ASCENSIONARMORYCATALOG1 = "/aacatalog"
SlashCmdList.ASCENSIONARMORYCATALOG = function(command)
  command = string.lower((command or ""):match("^%s*(.-)%s*$"))
  if command == "stop" then running = false; Message("Catalog scan paused.")
  elseif command == "status" then Status()
  elseif command == "retry" then RetryFailures()
  elseif command == "armor" then RefreshArmor()
  elseif command == "armortest" then TestArmor()
  else StartScan() end
end
