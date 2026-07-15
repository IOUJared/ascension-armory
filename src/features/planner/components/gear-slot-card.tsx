import { Sparkles, X } from "lucide-react";
import { scoreItem, type EquipmentSlot, type GearItem, type WeightProfile } from "@/domain/gear";
import { findEnchantsForItem } from "@/lib/enchants";
import { GameItemIcon } from "@/components/gear/game-item-icon";

const qualityBorder: Partial<Record<GearItem["quality"], string>> = {
  LEGENDARY: "legendary",
  EPIC: "epic",
  RARE: "rare",
};

function labelSlot(slot: EquipmentSlot): string {
  return slot.replace("_1", " I").replace("_2", " II").replaceAll("_", " ");
}

interface GearSlotCardProps {
  slot: EquipmentSlot;
  item?: GearItem;
  level: number;
  profile: WeightProfile;
  side: "left" | "right";
  onClick: () => void;
  onClear: () => void;
  onEnchant: () => void;
}

export function GearSlotCard({ slot, item, level, profile, side, onClick, onClear, onEnchant }: GearSlotCardProps) {
  const ep = item ? scoreItem(item, level, profile).ep : 0;
  const enchant = item?.enhancements?.find((enhancement) => enhancement.kind === "ENCHANT");
  const enchantable = item ? findEnchantsForItem(item).length > 0 : false;
  return (
    <div className="gear-slot-wrap">
      <button className={`gear-slot ${side} group ${item && (enchantable || enchant) ? "with-enchant" : ""}`} onClick={onClick} aria-label={`Choose item for ${labelSlot(slot)}`}>
        <GameItemIcon item={item} slot={slot} className={`slot-icon ${qualityBorder[item?.quality ?? "COMMON"] ?? ""}`} />
        <div className={`min-w-0 flex-1 ${side === "right" ? "text-right" : "text-left"}`}>
          <span className="slot-label">{labelSlot(slot)}</span>
          <span className="item-name">{item?.name ?? "Empty slot"}</span>
        </div>
        <span className="slot-ep">{ep.toFixed(0)}</span>
      </button>
      {item && (enchantable || enchant) ? <button type="button" className={`slot-enchant ${side} ${enchant ? "active" : ""}`} onClick={onEnchant} aria-label={`${enchant ? "Edit" : "Add"} enchant for ${item.name}`} title={enchant?.name ?? "Add recommended enchant"}><Sparkles size={10} /><span>{enchant?.name ?? "Add recommended enchant"}</span></button> : null}
      {item ? <button type="button" className={`slot-clear ${side}`} onClick={onClear} aria-label={`Unequip ${item.name} from ${labelSlot(slot)}`} title={`Unequip ${item.name}`}><X size={12} /></button> : null}
    </div>
  );
}
