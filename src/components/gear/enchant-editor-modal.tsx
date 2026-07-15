"use client";

import { useMemo, useState } from "react";
import { Check, Search, Sparkles, Trash2, X } from "lucide-react";
import { enchantEnhancement, enchantEp, findEnchantsForItem, recommendEnchant, type CoAEnchant } from "@/lib/enchants";
import type { GearEnhancement, GearItem } from "@/types/gear";
import type { WeightProfile } from "@/lib/ep";

interface EnchantEditorModalProps {
  item: GearItem;
  profile: WeightProfile;
  onApply: (enchant: GearEnhancement) => void;
  onRemove: () => void;
  onClose: () => void;
}

function EnchantStats({ enchant }: { enchant: CoAEnchant }) {
  return <span>{enchant.description}{enchant.minimumItemLevel > 0 ? ` · Requires item level ${enchant.minimumItemLevel}` : ""}</span>;
}

export function EnchantEditorModal({ item, profile, onApply, onRemove, onClose }: EnchantEditorModalProps) {
  const current = item.enhancements?.find((enhancement) => enhancement.kind === "ENCHANT");
  const recommendation = useMemo(() => recommendEnchant(item, profile), [item, profile]);
  const available = useMemo(() => findEnchantsForItem(item), [item]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(current?.id ?? recommendation?.id ?? available[0]?.id);
  const ranked = useMemo(() => available
    .filter((enchant) => `${enchant.name} ${enchant.description}`.toLowerCase().includes(search.toLowerCase()))
    .map((enchant) => ({ enchant, ep: enchantEp(enchant, profile) }))
    .sort((left, right) => Number(right.enchant.id === recommendation?.id) - Number(left.enchant.id === recommendation?.id)
      || right.ep - left.ep
      || right.enchant.minimumItemLevel - left.enchant.minimumItemLevel), [available, profile, recommendation?.id, search]);
  const selected = available.find((enchant) => enchant.id === selectedId) ?? recommendation ?? available[0];

  function apply(enchant = selected): void {
    if (!enchant) return;
    onApply(enchantEnhancement(enchant));
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="enchant-panel" role="dialog" aria-modal="true" aria-label={`Choose enchant for ${item.name}`}>
        <header className="import-header">
          <div><p className="eyebrow">In-game enchanting</p><h2>Choose an enchant</h2><p>{item.name} · Item level {item.itemLevel}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close enchant picker"><X size={18} /></button>
        </header>

        {recommendation ? <button type="button" className="recommended-enchant" onClick={() => apply(recommendation)}>
          <span className="recommended-enchant-icon"><Sparkles size={17} /></span>
          <span><small>Recommended for your EP weights</small><strong>{recommendation.name}</strong><EnchantStats enchant={recommendation} /></span>
          <b>Apply <em>{enchantEp(recommendation, profile).toFixed(1)} EP</em></b>
        </button> : null}

        <div className="enchant-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search in-game enchants…" autoFocus /></div>
        <div className="enchant-catalog custom-scrollbar">
          {ranked.map(({ enchant, ep }) => <button type="button" key={enchant.id} className={`enchant-option ${selected?.id === enchant.id ? "selected" : ""}`} onClick={() => setSelectedId(enchant.id)}>
            <span className="enchant-option-check">{selected?.id === enchant.id ? <Check size={13} /> : null}</span>
            <span><strong>{enchant.name}</strong><EnchantStats enchant={enchant} /></span>
            <span className="enchant-option-score">{enchant.modeled ? <><b>{ep.toFixed(1)}</b><small>EP</small></> : <small>Effect not EP-modeled</small>}</span>
            {recommendation?.id === enchant.id ? <i>Recommended</i> : null}
          </button>)}
          {!ranked.length ? <div className="enchant-empty">No compatible in-game enchants match that search.</div> : null}
        </div>

        <div className="enchant-help"><Sparkles size={16} /><p>Names, effects, compatibility, and item-level requirements come from the installed CoA AtlasLoot module and current client DBC files. Proc-only effects remain selectable but are not assigned a guessed EP value.</p></div>

        <footer className="import-footer">
          <div>{current ? <button className="remove-enchant-button" onClick={() => { onRemove(); onClose(); }}><Trash2 size={14} /> Remove enchant</button> : <small>No enchant currently applied</small>}</div>
          <div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!selected} onClick={() => apply()}><Sparkles size={14} /> Apply selected</button></div>
        </footer>
      </section>
    </div>
  );
}
