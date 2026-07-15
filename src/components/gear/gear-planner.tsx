"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { Check, ChevronDown, EyeOff, RotateCcw, Save, Settings2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { resolveCoAProfile } from "@/lib/coa";
import { contextualPower, scoreItem, STAT_LABELS, type EquipmentSlot, type GearItem, type WeightProfile } from "@/domain/gear";
import { findStaticItemsForSlot } from "@/lib/items/static-catalog";
import { applyRecommendedEnchant, findEnchantsForItem } from "@/lib/enchants";
import type { CoASelection } from "@/types/coa";
import { FALLBACK_WEIGHTS, LEFT_EQUIPMENT_SLOTS, RIGHT_EQUIPMENT_SLOTS } from "@/features/planner/planner.constants";
import { createInitialPlannerState, plannerReducer } from "@/features/planner/planner.reducer";
import { selectActiveWeightKeys, selectEditableWeightKeys, selectHasGearEnchants, selectLoadoutTotals, selectSummaryKeys } from "@/features/planner/planner.selectors";
import { useBuildStorage } from "@/features/planner/hooks/use-build-storage";
import { usePlannerShortcuts } from "@/features/planner/hooks/use-planner-shortcuts";
import { ItemPickerModal } from "./item-picker-modal";
import { GameItemIcon } from "./game-item-icon";
import { GearImportModal } from "./gear-import-modal";
import { ClassicCharacterPaperDoll } from "./classic-character-paper-doll";
import { CoAClassSelector } from "./coa-class-selector";
import { EnchantEditorModal } from "./enchant-editor-modal";

const qualityBorder: Partial<Record<GearItem["quality"], string>> = { LEGENDARY: "legendary", EPIC: "epic", RARE: "rare" };
const levelTicks = Array.from({ length: 12 }, (_, index) => (index + 1) * 5);

function labelSlot(slot: EquipmentSlot): string {
  return slot.replace("_1", " I").replace("_2", " II").replaceAll("_", " ");
}

function SlotCard({ slot, item, level, profile, side, onClick, onClear, onEnchant }: { slot: EquipmentSlot; item?: GearItem; level: number; profile: WeightProfile; side: "left" | "right"; onClick: () => void; onClear: () => void; onEnchant: () => void }) {
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

function LevelSlider({ level, onChange }: { level: number; onChange: (level: number) => void }) {
  const setLevel = (value: number) => onChange(Math.max(1, Math.min(60, Math.round(value))));
  return (
    <section className="level-selector" aria-labelledby="character-level-label">
      <div className="level-selector-heading">
        <div><span id="character-level-label">Character level</span><small>Every level selectable · major stops every 5</small></div>
        <label className="level-number"><span className="sr-only">Exact character level</span><input type="number" min={1} max={60} value={level} onChange={(event) => setLevel(Number(event.target.value))} /></label>
      </div>
      <div className="level-range-wrap">
        <input
          className="level-range"
          type="range"
          min={1}
          max={60}
          step={1}
          value={level}
          aria-labelledby="character-level-label"
          aria-valuetext={`Level ${level}`}
          onChange={(event) => setLevel(Number(event.target.value))}
        />
        <div className="level-ticks">
          {levelTicks.map((tick) => (
            <button
              type="button"
              key={tick}
              className={level === tick ? "active" : ""}
              style={{ left: `${((tick - 1) / 59) * 100}%` }}
              onClick={() => setLevel(tick)}
              aria-label={`Set character level to ${tick}`}
            ><i /><span>{tick}</span></button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GearPlanner() {
  const [state, dispatch] = useReducer(plannerReducer, createInitialPlannerState());
  const { activeDialog, level, loadout, selection, weights } = state;
  const selectorOpen = activeDialog?.type === "class";
  const importerOpen = activeDialog?.type === "import";
  const activeSlot = activeDialog?.type === "item" ? activeDialog.slot : null;
  const activeEnchantSlot = activeDialog?.type === "enchant" ? activeDialog.slot : null;
  const [candidates, setCandidates] = useState<GearItem[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const selectedProfile = useMemo(() => selection ? resolveCoAProfile(selection) : undefined, [selection]);
  const profileName = selectedProfile ? `${selectedProfile.classInfo.name} / ${selectedProfile.spec.name}` : "Choose a class";
  const profile = useMemo<WeightProfile>(() => ({ weights, context: selectedProfile?.context }), [selectedProfile?.context, weights]);
  const activeWeightKeys = useMemo(() => selectActiveWeightKeys(weights), [weights]);
  const editableWeightKeys = useMemo(() => selectEditableWeightKeys(weights, selectedProfile?.weights), [selectedProfile?.weights, weights]);
  const loadoutTotals = useMemo(() => selectLoadoutTotals(loadout, level, profile), [level, loadout, profile]);
  const allStats = loadoutTotals.stats;
  const totalEp = loadoutTotals.ep;
  const summaryKeys = useMemo(() => selectSummaryKeys(activeWeightKeys, allStats), [activeWeightKeys, allStats]);
  const pvePower = allStats.pve_power ?? 0;
  const pvpPower = allStats.pvp_power ?? 0;
  const activePower = contextualPower(allStats, level, selectedProfile?.context);
  const hasGearEnchants = useMemo(() => selectHasGearEnchants(loadout), [loadout]);
  const { saveBuildNow, saveConfirmed, storageReady } = useBuildStorage(state, dispatch);
  usePlannerShortcuts({ activeDialog, dispatch, saveBuildNow });

  useEffect(() => {
    if (!activeSlot) return;
    let cancelled = false;
    findStaticItemsForSlot(activeSlot, level)
      .then((items) => { if (!cancelled) setCandidates(items); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
  }, [activeSlot, level]);

  function openSlot(slot: EquipmentSlot): void {
    setCandidates([]);
    setLoadingCandidates(true);
    dispatch({ type: "OPEN_DIALOG", dialog: { type: "item", slot } });
  }

  function clearSlot(slot: EquipmentSlot): void {
    dispatch({ type: "CLEAR_SLOT", slot });
  }

  function chooseClass(nextSelection: CoASelection): void {
    const resolved = resolveCoAProfile(nextSelection);
    if (!resolved) return;
    dispatch({ type: "SELECT_PROFILE", selection: nextSelection, weights: resolved.weights });
  }

  function autoEnchantGear(): void {
    dispatch({
      type: "SET_LOADOUT",
      loadout: Object.fromEntries(Object.entries(loadout)
        .map(([slot, item]) => [slot, applyRecommendedEnchant(item, profile, true)])),
    });
  }

  function clearGearEnchants(): void {
    dispatch({ type: "CLEAR_ENCHANTS" });
  }

  return (
    <main className="min-h-screen">
      <nav className="topbar">
        <div className="brand-mark"><span>A</span></div>
        <div><p className="font-display text-lg leading-none text-stone-100">Ascension Armory</p><p className="mt-1 text-[10px] uppercase tracking-[.24em] text-amber-500/80">Conquest Gear Lab</p></div>
        <div className="ml-auto hidden items-center gap-6 text-sm text-stone-500 md:flex"><a className="text-amber-300" href="#planner">Planner</a><a href="#weights">EP Weights</a><a href="#about">Mechanics</a></div>
        <div className="keyboard-hints" aria-label="Keyboard shortcuts"><span><kbd>Esc</kbd> Close</span><span><kbd>C</kbd> Class</span><span><kbd>I</kbd> Import</span><span><kbd>Ctrl S</kbd> Save</span></div>
        <button className="secondary-button ml-4" onClick={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "import" } })}><Upload size={15} /> Import gear</button>
        <button className="secondary-button ml-2" onClick={saveBuildNow} aria-live="polite">
          {saveConfirmed ? <Check size={15} /> : <Save size={15} />} {saveConfirmed ? "Build saved" : "Save build"}
        </button>
      </nav>

      <div className="mx-auto max-w-[1540px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Conquest of Azeroth / Gear planner</p><h1 className="mt-2 font-display text-3xl text-stone-100 sm:text-4xl">Find the right gear for your path.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Choose your class and specialization, then compare every slot against its recommended stat priority.</p></div>
          <div className="flex flex-wrap gap-3">
            <button className="secondary-button md:hidden" onClick={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "import" } })}><Upload size={15} /> Import gear</button>
            <button className="field-control class-profile-control min-w-60" onClick={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "class" } })}><span>Class & specialization</span><strong>{profileName}</strong><small>{selectedProfile ? `${selectedProfile.spec.role} · ${selectedProfile.context.toUpperCase()}` : "Select profile"}</small></button>
            <LevelSlider level={level} onChange={(nextLevel) => dispatch({ type: "SET_LEVEL", level: nextLevel })} />
          </div>
        </header>

        <div className="planner-layout" id="planner">
          <section className="armory-panel">
            <div className="panel-heading"><div><p className="eyebrow">Paper doll</p><h2>Equipped loadout</h2></div><div className="panel-heading-actions"><button type="button" className="auto-enchant-button" disabled={Object.keys(loadout).length === 0} onClick={autoEnchantGear}><Sparkles size={13} /> Auto-enchant gear</button><button type="button" className="clear-enchants-button" disabled={!hasGearEnchants} onClick={clearGearEnchants}><X size={13} /> Clear enchants</button><button type="button" className="clear-loadout-button" disabled={Object.keys(loadout).length === 0} onClick={() => dispatch({ type: "CLEAR_LOADOUT" })}><Trash2 size={13} /> Clear all gear</button><div className="total-ep"><span>Total score</span><strong>{totalEp.toFixed(1)} <small>EP</small></strong></div></div></div>
            <div className="paper-doll-grid">
              <div className="slot-column">{LEFT_EQUIPMENT_SLOTS.map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="left" onClick={() => openSlot(slot)} onClear={() => clearSlot(slot)} onEnchant={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "enchant", slot } })} />)}</div>
              <div className="character-stage">
                <div className="model-nameplate"><span>Level {level}</span><strong>{selectedProfile ? `${selectedProfile.spec.name} ${selectedProfile.classInfo.name}` : "Azerothian Hero"}</strong></div>
                <div className="character-glow" />
                <ClassicCharacterPaperDoll loadout={loadout} />
                <div className="model-vignette" />
                <div className="model-turn-control"><small>Equipped appearance</small></div>
                <div className="realm-chip"><span /> Conquest of Azeroth</div>
              </div>
              <div className="slot-column">{RIGHT_EQUIPMENT_SLOTS.map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="right" onClick={() => openSlot(slot)} onClear={() => clearSlot(slot)} onEnchant={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "enchant", slot } })} />)}</div>
            </div>
            <div className="mobile-slot-grid">{[...LEFT_EQUIPMENT_SLOTS, ...RIGHT_EQUIPMENT_SLOTS].map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="left" onClick={() => openSlot(slot)} onClear={() => clearSlot(slot)} onEnchant={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "enchant", slot } })} />)}</div>
          </section>

          <aside className="weights-panel" id="weights">
            <div className="panel-heading compact"><div><p className="eyebrow">Scoring model</p><h2>EP stat weights</h2></div><Settings2 className="text-amber-500" size={19} /></div>
            <button className="profile-select w-[calc(100%-30px)] text-left" onClick={() => dispatch({ type: "OPEN_DIALOG", dialog: { type: "class" } })}><div><span>Active class profile</span><strong>{profileName}</strong></div><ChevronDown size={16} /></button>
            {selectedProfile ? <div className="stat-priority-card"><span>{selectedProfile.context.toUpperCase()} stat priority</span><p>{selectedProfile.priority}</p><small>{selectedProfile.spec.weapon.style} · {selectedProfile.spec.primaryStats.join(" / ") || "Flexible primary stat"}</small></div> : null}
            <div className="weight-table">
              <div className="weight-header"><span>Attribute</span><span>Weight</span></div>
              {editableWeightKeys.map((key) => <label className="weight-row" key={key}><span>{STAT_LABELS[key]}</span><input type="number" step="0.01" value={weights[key] ?? 0} onChange={(event) => dispatch({ type: "SET_WEIGHT", stat: key, value: Number(event.target.value) })} /></label>)}
            </div>
            <button className="reset-button" onClick={() => dispatch({ type: "RESET_WEIGHTS", weights: selectedProfile?.weights ?? FALLBACK_WEIGHTS })}><RotateCcw size={14} /> Reset class priority</button>
            <div className="hybrid-callout"><Sparkles size={18} /><div><p>Class priority active</p><span>Gear results are ranked automatically using the selected specialization’s ordered {selectedProfile?.context.toUpperCase() ?? "PvE"} stats.</span></div></div>
            <div className="system-power-card">
              <div className="system-power-heading"><EyeOff size={16} /><div><p>Hidden Ascension power</p><span>Reported by the live CoA client, separate from EP</span></div></div>
              <div className="system-power-totals">
                <div className={level >= 60 && selectedProfile?.context === "pve" ? "active" : ""}><span>PvE Power</span><strong>{Math.round(pvePower)}</strong></div>
                <div className={level >= 60 && selectedProfile?.context === "pvp" ? "active" : ""}><span>PvP Power</span><strong>{Math.round(pvpPower)}</strong></div>
              </div>
              <small>{level < 60
                ? "Recorded for reference; inactive in rankings below level 60."
                : selectedProfile
                  ? `${selectedProfile.context.toUpperCase()} ranking uses ${Math.round(activePower)} matching Power first, then EP to break ties.`
                  : "Choose a class profile to activate the matching max-level Power."}</small>
            </div>
            <div className="summary-card">
              <p className="eyebrow">Loadout totals</p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">{summaryKeys.map((key) => <div className="summary-stat" key={key}><span>{STAT_LABELS[key]}</span><strong>{Math.round(allStats[key] ?? 0)}</strong></div>)}</div>
            </div>
          </aside>
        </div>
      </div>

      {activeSlot ? <ItemPickerModal
        slot={activeSlot}
        equipped={loadout[activeSlot]}
        candidates={candidates}
        loading={loadingCandidates}
        level={level}
        profile={profile}
        context={selectedProfile?.context}
        profileLabel={profileName}
        allowedWeaponTypes={activeSlot === "RANGED" ? selectedProfile?.spec.weapon.allowedTypes : undefined}
        onEquip={(item) => dispatch({ type: "EQUIP_ITEM", slot: activeSlot, item })}
        onClose={() => dispatch({ type: "CLOSE_DIALOG" })}
      /> : null}
      {activeEnchantSlot && loadout[activeEnchantSlot] ? <EnchantEditorModal
        item={loadout[activeEnchantSlot]}
        profile={profile}
        onApply={(enchant) => dispatch({ type: "APPLY_ENCHANT", slot: activeEnchantSlot, enchant })}
        onRemove={() => dispatch({ type: "REMOVE_ENCHANT", slot: activeEnchantSlot })}
        onClose={() => dispatch({ type: "CLOSE_DIALOG" })}
      /> : null}
      {importerOpen ? <GearImportModal
        onImport={(importedLevel, importedLoadout) => dispatch({ type: "IMPORT_LOADOUT", level: importedLevel, loadout: Object.fromEntries(Object.entries(importedLoadout).map(([slot, item]) => [slot, applyRecommendedEnchant(item, profile)])) })}
        onClose={() => dispatch({ type: "CLOSE_DIALOG" })}
      /> : null}
      {storageReady && selectorOpen ? <CoAClassSelector current={selection} onSelect={chooseClass} onClose={selection ? () => dispatch({ type: "CLOSE_DIALOG" }) : undefined} /> : null}
    </main>
  );
}
