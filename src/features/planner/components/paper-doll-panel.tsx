import { Sparkles, Trash2, X } from "lucide-react";
import type { EquipmentSlot, WeightProfile } from "@/domain/gear";
import { ClassicCharacterPaperDoll } from "@/components/gear/classic-character-paper-doll";
import { LEFT_EQUIPMENT_SLOTS, RIGHT_EQUIPMENT_SLOTS } from "../planner.constants";
import type { PlannerLoadout } from "../planner.reducer";
import { GearSlotCard } from "./gear-slot-card";

interface PaperDollPanelProps {
  characterName: string;
  hasGearEnchants: boolean;
  level: number;
  loadout: PlannerLoadout;
  profile: WeightProfile;
  totalEp: number;
  onAutoEnchant: () => void;
  onClearEnchants: () => void;
  onClearLoadout: () => void;
  onClearSlot: (slot: EquipmentSlot) => void;
  onOpenEnchant: (slot: EquipmentSlot) => void;
  onOpenSlot: (slot: EquipmentSlot) => void;
}

export function PaperDollPanel({ characterName, hasGearEnchants, level, loadout, profile, totalEp, onAutoEnchant, onClearEnchants, onClearLoadout, onClearSlot, onOpenEnchant, onOpenSlot }: PaperDollPanelProps) {
  const renderSlot = (slot: EquipmentSlot, side: "left" | "right") => (
    <GearSlotCard
      key={slot}
      slot={slot}
      item={loadout[slot]}
      level={level}
      profile={profile}
      side={side}
      onClick={() => onOpenSlot(slot)}
      onClear={() => onClearSlot(slot)}
      onEnchant={() => onOpenEnchant(slot)}
    />
  );

  return (
    <section className="armory-panel">
      <div className="panel-heading"><div><p className="eyebrow">Paper doll</p><h2>Equipped loadout</h2></div><div className="panel-heading-actions"><button type="button" className="auto-enchant-button" disabled={Object.keys(loadout).length === 0} onClick={onAutoEnchant}><Sparkles size={13} /> Auto-enchant gear</button><button type="button" className="clear-enchants-button" disabled={!hasGearEnchants} onClick={onClearEnchants}><X size={13} /> Clear enchants</button><button type="button" className="clear-loadout-button" disabled={Object.keys(loadout).length === 0} onClick={onClearLoadout}><Trash2 size={13} /> Clear all gear</button><div className="total-ep"><span>Total score</span><strong>{totalEp.toFixed(1)} <small>EP</small></strong></div></div></div>
      <div className="paper-doll-grid">
        <div className="slot-column">{LEFT_EQUIPMENT_SLOTS.map((slot) => renderSlot(slot, "left"))}</div>
        <div className="character-stage">
          <div className="model-nameplate"><span>Level {level}</span><strong>{characterName}</strong></div>
          <div className="character-glow" />
          <ClassicCharacterPaperDoll loadout={loadout} />
          <div className="model-vignette" />
          <div className="model-turn-control"><small>Equipped appearance</small></div>
          <div className="realm-chip"><span /> Conquest of Azeroth</div>
        </div>
        <div className="slot-column">{RIGHT_EQUIPMENT_SLOTS.map((slot) => renderSlot(slot, "right"))}</div>
      </div>
      <div className="mobile-slot-grid">{[...LEFT_EQUIPMENT_SLOTS, ...RIGHT_EQUIPMENT_SLOTS].map((slot) => renderSlot(slot, "left"))}</div>
    </section>
  );
}
