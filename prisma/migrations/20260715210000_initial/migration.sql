-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EquipmentSlot" AS ENUM ('HEAD', 'NECK', 'SHOULDERS', 'BACK', 'CHEST', 'WRISTS', 'HANDS', 'WAIST', 'LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2', 'MAIN_HAND', 'OFF_HAND', 'RANGED');

-- CreateEnum
CREATE TYPE "ItemQuality" AS ENUM ('POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM');

-- CreateEnum
CREATE TYPE "SocketColor" AS ENUM ('META', 'RED', 'YELLOW', 'BLUE', 'PRISMATIC', 'ASCENSION');

-- CreateEnum
CREATE TYPE "EffectKind" AS ENUM ('EQUIP', 'USE', 'PROC', 'SET_BONUS', 'ASCENSION');

-- CreateEnum
CREATE TYPE "StatSource" AS ENUM ('BASE', 'SOCKET_BONUS', 'GEM', 'MYSTIC_ENCHANT', 'CUSTOM_EFFECT');

-- CreateEnum
CREATE TYPE "BuildContext" AS ENUM ('PVE', 'PVP');

-- CreateTable
CREATE TABLE "Item" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "quality" "ItemQuality" NOT NULL,
    "itemLevel" INTEGER NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "slot" "EquipmentSlot",
    "inventoryType" INTEGER,
    "armorType" TEXT,
    "armor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weaponMinDamage" DOUBLE PRECISION,
    "weaponMaxDamage" DOUBLE PRECISION,
    "weaponSpeed" DOUBLE PRECISION,
    "weaponDps" DOUBLE PRECISION,
    "icon" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceRealm" TEXT NOT NULL DEFAULT 'CONQUEST_OF_AZEROTH',
    "rawTooltipHtml" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemScaleSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "itemId" BIGINT NOT NULL,
    "effectiveLevel" INTEGER NOT NULL,
    "itemLevel" INTEGER NOT NULL,
    "requiredLevel" INTEGER NOT NULL,
    "stats" JSONB NOT NULL,
    "armor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weaponDps" DOUBLE PRECISION,
    "sourceLink" TEXT NOT NULL,
    "capturedPlayerLevel" INTEGER NOT NULL,
    "sourceRealm" TEXT,
    "rawStats" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemScaleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatDefinition" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'flat',
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "isWeightable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StatDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ItemStat" (
    "id" BIGSERIAL NOT NULL,
    "itemId" BIGINT NOT NULL,
    "statKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" "StatSource" NOT NULL DEFAULT 'BASE',
    "metadata" JSONB,

    CONSTRAINT "ItemStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemSocket" (
    "id" BIGSERIAL NOT NULL,
    "itemId" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" "SocketColor" NOT NULL,

    CONSTRAINT "ItemSocket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEffect" (
    "id" BIGSERIAL NOT NULL,
    "itemId" BIGINT NOT NULL,
    "kind" "EffectKind" NOT NULL,
    "description" TEXT NOT NULL,
    "spellId" BIGINT,
    "coefficient" DOUBLE PRECISION,
    "procChance" DOUBLE PRECISION,
    "cooldownMs" INTEGER,
    "customData" JSONB,

    CONSTRAINT "ItemEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gem" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "quality" "ItemQuality" NOT NULL,
    "color" "SocketColor" NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "icon" TEXT,
    "customData" JSONB,

    CONSTRAINT "Gem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GemStat" (
    "gemId" BIGINT NOT NULL,
    "statKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GemStat_pkey" PRIMARY KEY ("gemId","statKey")
);

-- CreateTable
CREATE TABLE "MysticEnchant" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "allowedSlots" "EquipmentSlot"[],
    "stackingGroup" TEXT,
    "maxStacks" INTEGER NOT NULL DEFAULT 1,
    "scalingFormula" JSONB,
    "customData" JSONB,

    CONSTRAINT "MysticEnchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysticEnchantStat" (
    "mysticEnchantId" BIGINT NOT NULL,
    "statKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "perLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hybridRule" JSONB,

    CONSTRAINT "MysticEnchantStat_pkey" PRIMARY KEY ("mysticEnchantId","statKey")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 60,
    "realm" TEXT NOT NULL DEFAULT 'CONQUEST_OF_AZEROTH',
    "classKey" TEXT,
    "specializationKey" TEXT,
    "context" "BuildContext" NOT NULL DEFAULT 'PVE',
    "buildNotes" TEXT,
    "hybridScaling" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileStatWeight" (
    "profileId" TEXT NOT NULL,
    "statKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "cap" DOUBLE PRECISION,
    "softCap" DOUBLE PRECISION,

    CONSTRAINT "ProfileStatWeight_pkey" PRIMARY KEY ("profileId","statKey")
);

-- CreateTable
CREATE TABLE "Loadout" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loadout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquippedItem" (
    "id" TEXT NOT NULL,
    "loadoutId" TEXT NOT NULL,
    "itemId" BIGINT NOT NULL,
    "slot" "EquipmentSlot" NOT NULL,
    "randomSuffix" JSONB,
    "customStats" JSONB,

    CONSTRAINT "EquippedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquippedGem" (
    "equippedItemId" TEXT NOT NULL,
    "socketPosition" INTEGER NOT NULL,
    "gemId" BIGINT NOT NULL,

    CONSTRAINT "EquippedGem_pkey" PRIMARY KEY ("equippedItemId","socketPosition")
);

-- CreateTable
CREATE TABLE "EquippedMysticEnchant" (
    "equippedItemId" TEXT NOT NULL,
    "mysticEnchantId" BIGINT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EquippedMysticEnchant_pkey" PRIMARY KEY ("equippedItemId","mysticEnchantId")
);

-- CreateIndex
CREATE INDEX "Item_slot_requiredLevel_itemLevel_idx" ON "Item"("slot", "requiredLevel", "itemLevel");

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE INDEX "ItemScaleSnapshot_effectiveLevel_itemLevel_idx" ON "ItemScaleSnapshot"("effectiveLevel", "itemLevel");

-- CreateIndex
CREATE UNIQUE INDEX "ItemScaleSnapshot_itemId_effectiveLevel_key" ON "ItemScaleSnapshot"("itemId", "effectiveLevel");

-- CreateIndex
CREATE INDEX "ItemStat_statKey_value_idx" ON "ItemStat"("statKey", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ItemStat_itemId_statKey_source_key" ON "ItemStat"("itemId", "statKey", "source");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSocket_itemId_position_key" ON "ItemSocket"("itemId", "position");

-- CreateIndex
CREATE INDEX "ItemEffect_itemId_kind_idx" ON "ItemEffect"("itemId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CharacterProfile_userId_idx" ON "CharacterProfile"("userId");

-- CreateIndex
CREATE INDEX "CharacterProfile_classKey_specializationKey_idx" ON "CharacterProfile"("classKey", "specializationKey");

-- CreateIndex
CREATE INDEX "Loadout_profileId_isActive_idx" ON "Loadout"("profileId", "isActive");

-- CreateIndex
CREATE INDEX "EquippedItem_itemId_idx" ON "EquippedItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "EquippedItem_loadoutId_slot_key" ON "EquippedItem"("loadoutId", "slot");

-- AddForeignKey
ALTER TABLE "ItemScaleSnapshot" ADD CONSTRAINT "ItemScaleSnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStat" ADD CONSTRAINT "ItemStat_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemStat" ADD CONSTRAINT "ItemStat_statKey_fkey" FOREIGN KEY ("statKey") REFERENCES "StatDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSocket" ADD CONSTRAINT "ItemSocket_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEffect" ADD CONSTRAINT "ItemEffect_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GemStat" ADD CONSTRAINT "GemStat_gemId_fkey" FOREIGN KEY ("gemId") REFERENCES "Gem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GemStat" ADD CONSTRAINT "GemStat_statKey_fkey" FOREIGN KEY ("statKey") REFERENCES "StatDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysticEnchantStat" ADD CONSTRAINT "MysticEnchantStat_mysticEnchantId_fkey" FOREIGN KEY ("mysticEnchantId") REFERENCES "MysticEnchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysticEnchantStat" ADD CONSTRAINT "MysticEnchantStat_statKey_fkey" FOREIGN KEY ("statKey") REFERENCES "StatDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterProfile" ADD CONSTRAINT "CharacterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileStatWeight" ADD CONSTRAINT "ProfileStatWeight_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CharacterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileStatWeight" ADD CONSTRAINT "ProfileStatWeight_statKey_fkey" FOREIGN KEY ("statKey") REFERENCES "StatDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loadout" ADD CONSTRAINT "Loadout_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CharacterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedItem" ADD CONSTRAINT "EquippedItem_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "Loadout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedItem" ADD CONSTRAINT "EquippedItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedGem" ADD CONSTRAINT "EquippedGem_equippedItemId_fkey" FOREIGN KEY ("equippedItemId") REFERENCES "EquippedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedGem" ADD CONSTRAINT "EquippedGem_gemId_fkey" FOREIGN KEY ("gemId") REFERENCES "Gem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedMysticEnchant" ADD CONSTRAINT "EquippedMysticEnchant_equippedItemId_fkey" FOREIGN KEY ("equippedItemId") REFERENCES "EquippedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquippedMysticEnchant" ADD CONSTRAINT "EquippedMysticEnchant_mysticEnchantId_fkey" FOREIGN KEY ("mysticEnchantId") REFERENCES "MysticEnchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
