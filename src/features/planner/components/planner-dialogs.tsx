import type { EquipmentSlot, GearEnhancement, GearItem, WeightProfile } from "@/domain/gear";
import type { CoAProfile, CoASelection } from "@/types/coa";
import { CoAClassSelector } from "@/components/gear/coa-class-selector";
import { EnchantEditorModal } from "@/components/gear/enchant-editor-modal";
import { GearImportModal } from "@/components/gear/gear-import-modal";
import { ItemPickerModal } from "@/components/gear/item-picker-modal";
import type { PlannerDialog, PlannerLoadout } from "../planner.reducer";

interface PlannerDialogsProps {
  activeDialog: PlannerDialog | null;
  candidates: GearItem[];
  level: number;
  loadout: PlannerLoadout;
  loadingCandidates: boolean;
  profile: WeightProfile;
  profileInfo?: CoAProfile;
  profileName: string;
  selection?: CoASelection;
  storageReady: boolean;
  onApplyEnchant: (slot: EquipmentSlot, enchant: GearEnhancement) => void;
  onClose: () => void;
  onEquip: (slot: EquipmentSlot, item: GearItem) => void;
  onImport: (level: number, loadout: PlannerLoadout) => void;
  onRemoveEnchant: (slot: EquipmentSlot) => void;
  onSelectProfile: (selection: CoASelection) => void;
}

export function PlannerDialogs({ activeDialog, candidates, level, loadout, loadingCandidates, profile, profileInfo, profileName, selection, storageReady, onApplyEnchant, onClose, onEquip, onImport, onRemoveEnchant, onSelectProfile }: PlannerDialogsProps) {
  const activeSlot = activeDialog?.type === "item" ? activeDialog.slot : null;
  const activeEnchantSlot = activeDialog?.type === "enchant" ? activeDialog.slot : null;
  return <>
    {activeSlot ? <ItemPickerModal
      slot={activeSlot}
      equipped={loadout[activeSlot]}
      candidates={candidates}
      loading={loadingCandidates}
      level={level}
      profile={profile}
      context={profileInfo?.context}
      profileLabel={profileName}
      allowedWeaponTypes={activeSlot === "RANGED" ? profileInfo?.spec.weapon.allowedTypes : undefined}
      onEquip={(item) => onEquip(activeSlot, item)}
      onClose={onClose}
    /> : null}
    {activeEnchantSlot && loadout[activeEnchantSlot] ? <EnchantEditorModal
      item={loadout[activeEnchantSlot]}
      profile={profile}
      onApply={(enchant) => onApplyEnchant(activeEnchantSlot, enchant)}
      onRemove={() => onRemoveEnchant(activeEnchantSlot)}
      onClose={onClose}
    /> : null}
    {activeDialog?.type === "import" ? <GearImportModal onImport={onImport} onClose={onClose} /> : null}
    {storageReady && activeDialog?.type === "class" ? <CoAClassSelector current={selection} onSelect={onSelectProfile} onClose={selection ? onClose : undefined} /> : null}
  </>;
}
