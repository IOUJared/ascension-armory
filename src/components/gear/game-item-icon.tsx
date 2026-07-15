"use client";

import Image from "next/image";
import { SLOT_ICON } from "@/data/demo-items";
import { ascensionIconUrl } from "@/lib/icons";
import type { EquipmentSlot, GearItem } from "@/types/gear";

interface GameItemIconProps {
  item?: GearItem;
  slot?: EquipmentSlot;
  className?: string;
  showEnchant?: boolean;
}

export function GameItemIcon({ item, slot = item?.slot ?? "HEAD", className = "", showEnchant = true }: GameItemIconProps) {
  const iconUrl = ascensionIconUrl(item?.icon);
  return (
    <div className={className}>
      <span className="slot-fallback" aria-hidden="true">{SLOT_ICON[slot]}</span>
      {iconUrl ? <Image className="game-icon-image" src={iconUrl} alt="" fill sizes="64px" unoptimized onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
      {showEnchant && item?.enhancements?.length ? <i className="re-pip">RE</i> : null}
    </div>
  );
}
