local ADDON_NAME = "AscensionArmoryExporter"

local EQUIPMENT = {
  { "HEAD", 1 },
  { "NECK", 2 },
  { "SHOULDERS", 3 },
  { "BACK", 15 },
  { "CHEST", 5 },
  { "WRISTS", 9 },
  { "HANDS", 10 },
  { "WAIST", 6 },
  { "LEGS", 7 },
  { "FEET", 8 },
  { "FINGER_1", 11 },
  { "FINGER_2", 12 },
  { "TRINKET_1", 13 },
  { "TRINKET_2", 14 },
  { "MAIN_HAND", 16 },
  { "OFF_HAND", 17 },
  { "RANGED", 18 },
}

local function Encode(value)
  return string.gsub(tostring(value or ""), "([^%w%-%._])", function(character)
    return string.format("%%%02X", string.byte(character))
  end)
end

local function IconName(texture)
  return texture and (string.match(texture, "([^\\/]+)$") or texture) or ""
end

local function BuildItemSnapshot(link)
  local itemString = string.match(link, "item:([^|]+)")
  if not itemString then return nil end
  local name, _, quality, itemLevel, requiredLevel, _, _, _, _, texture = GetItemInfo(link)
  name = name or string.match(link, "%[(.-)%]") or ("Item " .. string.match(itemString, "^(%d+)") )
  local statParts = {}
  for key, value in pairs(GetItemStats(link) or {}) do
    if type(key) == "string" and type(value) == "number" then
      table.insert(statParts, key .. ":" .. tostring(value))
    end
  end
  table.sort(statParts)
  return table.concat({
    itemString,
    tostring(quality or 1),
    tostring(itemLevel or 0),
    tostring(requiredLevel or 0),
    Encode(IconName(texture)),
    Encode(name),
    table.concat(statParts, ","),
  }, "~")
end

local function BuildExport()
  local gear = {}
  for _, entry in ipairs(EQUIPMENT) do
    local slotName, inventorySlot = entry[1], entry[2]
    local link = GetInventoryItemLink("player", inventorySlot)
    local snapshot = link and BuildItemSnapshot(link)
    if snapshot then table.insert(gear, slotName .. "=" .. snapshot) end
  end
  return "AA2|" .. tostring(UnitLevel("player")) .. "|" .. table.concat(gear, ";")
end

local frame = CreateFrame("Frame", ADDON_NAME .. "Frame", UIParent)
frame:SetWidth(620)
frame:SetHeight(190)
frame:SetPoint("CENTER")
frame:SetFrameStrata("DIALOG")
frame:SetMovable(true)
frame:EnableMouse(true)
frame:RegisterForDrag("LeftButton")
frame:SetScript("OnDragStart", function(self) self:StartMoving() end)
frame:SetScript("OnDragStop", function(self) self:StopMovingOrSizing() end)
frame:SetBackdrop({ bgFile = "Interface/Tooltips/UI-Tooltip-Background", edgeFile = "Interface/Tooltips/UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
frame:SetBackdropColor(0.04, 0.04, 0.05, 0.98)
frame:Hide()

local title = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
title:SetPoint("TOPLEFT", 18, -16)
title:SetText("Ascension Armory Gear Export")

local help = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
help:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -7)
help:SetText("Press Ctrl+C to copy the highlighted text, then paste it into Ascension Armory.")

local editBox = CreateFrame("EditBox", ADDON_NAME .. "EditBox", frame)
editBox:SetPoint("TOPLEFT", 18, -68)
editBox:SetPoint("TOPRIGHT", -18, -68)
editBox:SetHeight(46)
editBox:SetMultiLine(true)
editBox:SetAutoFocus(false)
editBox:SetFontObject(ChatFontNormal)
editBox:SetTextInsets(8, 8, 8, 8)
editBox:SetBackdrop({ bgFile = "Interface/Tooltips/UI-Tooltip-Background", edgeFile = "Interface/Tooltips/UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 } })
editBox:SetBackdropColor(0, 0, 0, 0.9)
editBox:SetScript("OnEscapePressed", function(self) self:ClearFocus(); frame:Hide() end)

local refresh = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
refresh:SetWidth(110)
refresh:SetHeight(24)
refresh:SetPoint("BOTTOMLEFT", 18, 17)
refresh:SetText("Refresh gear")
refresh:SetScript("OnClick", function()
  editBox:SetText(BuildExport())
  editBox:SetFocus()
  editBox:HighlightText()
end)

local close = CreateFrame("Button", nil, frame, "UIPanelButtonTemplate")
close:SetWidth(90)
close:SetHeight(24)
close:SetPoint("BOTTOMRIGHT", -18, 17)
close:SetText("Close")
close:SetScript("OnClick", function() frame:Hide() end)

local function ShowExporter()
  editBox:SetText(BuildExport())
  frame:Show()
  editBox:SetFocus()
  editBox:HighlightText()
  DEFAULT_CHAT_FRAME:AddMessage("|cfff0ce78Ascension Armory:|r Export ready. Press Ctrl+C, then paste it into the website.")
end

SLASH_ASCENSIONARMORYEXPORTER1 = "/aaexport"
SLASH_ASCENSIONARMORYEXPORTER2 = "/ascensionarmory"
SlashCmdList.ASCENSIONARMORYEXPORTER = ShowExporter

table.insert(UISpecialFrames, ADDON_NAME .. "Frame")
