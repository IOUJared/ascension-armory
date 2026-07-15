"use client";

import Image from "next/image";
import { ascensionIconUrl } from "@/lib/icons";
import type { EquipmentSlot, GearItem } from "@/domain/gear";

const wearableLayers: Array<{ slot: EquipmentSlot; placement: string }> = [
  { slot: "BACK", placement: "cloak" },
  { slot: "LEGS", placement: "leg-left" },
  { slot: "LEGS", placement: "leg-right" },
  { slot: "FEET", placement: "boot-left" },
  { slot: "FEET", placement: "boot-right" },
  { slot: "CHEST", placement: "chest" },
  { slot: "WAIST", placement: "belt" },
  { slot: "SHOULDERS", placement: "shoulder-left" },
  { slot: "SHOULDERS", placement: "shoulder-right" },
  { slot: "WRISTS", placement: "wrist-left" },
  { slot: "WRISTS", placement: "wrist-right" },
  { slot: "HANDS", placement: "hand-left" },
  { slot: "HANDS", placement: "hand-right" },
  { slot: "HEAD", placement: "head" },
  { slot: "MAIN_HAND", placement: "main-hand" },
  { slot: "OFF_HAND", placement: "off-hand" },
];

export function ClassicCharacterPaperDoll({ loadout }: { loadout: Record<string, GearItem> }) {
  return (
    <div className="classic-paper-doll" aria-label="Classic fantasy character wearing the selected equipment">
      <div className="paper-doll-aura" />
      <div className="wearable-layer-stack">
        <Image
          className="classic-character-base"
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/classic-human-base.png`}
          alt="Classic fantasy human character"
          width={1122}
          height={1402}
          priority
        />
        {wearableLayers.map(({ slot, placement }) => {
          const item = loadout[slot];
          const icon = ascensionIconUrl(item?.icon, "large");
          if (!item || !icon) return null;
          return (
            <span
              key={`${slot}-${placement}`}
              className={`wearable-layer ${placement} quality-${item.quality.toLowerCase()}`}
              style={{ backgroundImage: `url("${icon}")` }}
              title={`${slot.replaceAll("_", " ")}: ${item.name}`}
            />
          );
        })}
      </div>
    </div>
  );
}
