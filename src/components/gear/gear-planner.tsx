"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, EyeOff, RotateCcw, Save, Settings2, Sparkles, Upload } from "lucide-react";
import { isCoASelection, resolveCoAProfile } from "@/lib/coa";
import { calculateEp, isSystemPowerKey, resolveItemStats, scoreItem, withoutSystemPowerWeights, type WeightProfile } from "@/lib/ep";
import { findStaticItemsForSlot } from "@/lib/items/static-catalog";
import { BUILD_STORAGE_KEY, LEGACY_BUILD_STORAGE_KEY, LEGACY_PROFILE_STORAGE_KEY, makePlannerBuild, parsePlannerBuild } from "@/lib/planner-storage";
import type { CoASelection } from "@/types/coa";
import { STAT_LABELS, type EquipmentSlot, type GearItem, type StatKey, type StatMap } from "@/types/gear";
import { ItemPickerModal } from "./item-picker-modal";
import { GameItemIcon } from "./game-item-icon";
import { GearImportModal } from "./gear-import-modal";
import { ClassicCharacterPaperDoll } from "./classic-character-paper-doll";
import { CoAClassSelector } from "./coa-class-selector";

const leftSlots: EquipmentSlot[] = ["HEAD", "NECK", "SHOULDERS", "BACK", "CHEST", "WRISTS", "MAIN_HAND", "RANGED"];
const rightSlots: EquipmentSlot[] = ["HANDS", "WAIST", "LEGS", "FEET", "FINGER_1", "FINGER_2", "TRINKET_1", "TRINKET_2", "OFF_HAND"];
const qualityBorder: Partial<Record<GearItem["quality"], string>> = { LEGENDARY: "legendary", EPIC: "epic", RARE: "rare" };
const fallbackWeights: StatMap = { strength: 1, attack_power: 0.48, crit_rating: 0.72, haste_rating: 0.64, hit_rating: 0.86, weapon_dps: 2.4 };

function labelSlot(slot: EquipmentSlot): string {
  return slot.replace("_1", " I").replace("_2", " II").replaceAll("_", " ");
}

function SlotCard({ slot, item, level, profile, side, onClick }: { slot: EquipmentSlot; item?: GearItem; level: number; profile: WeightProfile; side: "left" | "right"; onClick: () => void }) {
  const ep = item ? scoreItem(item, level, profile).ep : 0;
  return (
    <button className={`gear-slot ${side} group`} onClick={onClick} aria-label={`Choose item for ${labelSlot(slot)}`}>
      <GameItemIcon item={item} slot={slot} className={`slot-icon ${qualityBorder[item?.quality ?? "COMMON"] ?? ""}`} />
      <div className={`min-w-0 flex-1 ${side === "right" ? "text-right" : "text-left"}`}>
        <span className="slot-label">{labelSlot(slot)}</span>
        <span className="item-name">{item?.name ?? "Empty slot"}</span>
      </div>
      <span className="slot-ep">{ep.toFixed(0)}</span>
    </button>
  );
}

export function GearPlanner() {
  const [level, setLevel] = useState(60);
  const [selection, setSelection] = useState<CoASelection>();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [weights, setWeights] = useState<StatMap>(fallbackWeights);
  const [loadout, setLoadout] = useState<Record<string, GearItem>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<EquipmentSlot | null>(null);
  const [candidates, setCandidates] = useState<GearItem[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const selectedProfile = useMemo(() => selection ? resolveCoAProfile(selection) : undefined, [selection]);
  const profileName = selectedProfile ? `${selectedProfile.classInfo.name} / ${selectedProfile.spec.name}` : "Choose a class";
  const profile = useMemo<WeightProfile>(() => ({ weights, context: selectedProfile?.context }), [selectedProfile?.context, weights]);
  const activeWeightKeys = useMemo(() => (Object.entries(weights) as Array<[StatKey, number]>)
    .filter(([key, value]) => value > 0 && !isSystemPowerKey(key))
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key), [weights]);
  const totalEp = useMemo(() => Object.values(loadout).reduce((sum, item) => sum + calculateEp(resolveItemStats(item, level, profile.hybridRules), profile), 0), [level, loadout, profile]);
  const allStats = useMemo(() => Object.values(loadout).reduce<StatMap>((sum, item) => {
    for (const [key, value] of Object.entries(resolveItemStats(item, level, profile.hybridRules)) as Array<[StatKey, number]>) sum[key] = (sum[key] ?? 0) + value;
    return sum;
  }, {}), [level, loadout, profile]);
  const summaryKeys = useMemo(() => activeWeightKeys
    .filter((key) => key !== "weapon_dps" && (allStats[key] ?? 0) > 0)
    .slice(0, 6), [activeWeightKeys, allStats]);
  const pvePower = allStats.pve_power ?? 0;
  const pvpPower = allStats.pvp_power ?? 0;
  const activePower = level >= 60 && selectedProfile
    ? (selectedProfile.context === "pve" ? pvePower : pvpPower)
    : 0;

  useEffect(() => {
    const restoreBuild = window.setTimeout(() => {
      try {
        const savedBuild = parsePlannerBuild(localStorage.getItem(BUILD_STORAGE_KEY))
          ?? parsePlannerBuild(localStorage.getItem(LEGACY_BUILD_STORAGE_KEY));
        if (savedBuild) {
          setLevel(savedBuild.level);
          setLoadout(savedBuild.loadout);
          if (savedBuild.selection) {
            const resolved = resolveCoAProfile(savedBuild.selection);
            setSelection(savedBuild.selection);
            setWeights(withoutSystemPowerWeights(Object.keys(savedBuild.weights).length ? savedBuild.weights : resolved?.weights ?? fallbackWeights));
            setSelectorOpen(false);
          } else {
            setWeights(withoutSystemPowerWeights(Object.keys(savedBuild.weights).length ? savedBuild.weights : fallbackWeights));
            setSelectorOpen(true);
          }
          return;
        }

        const legacyProfile = JSON.parse(localStorage.getItem(LEGACY_PROFILE_STORAGE_KEY) ?? "null") as unknown;
        if (isCoASelection(legacyProfile)) {
          const resolved = resolveCoAProfile(legacyProfile);
          setSelection(legacyProfile);
          setWeights(resolved?.weights ?? fallbackWeights);
          setSelectorOpen(false);
        } else {
          setSelectorOpen(true);
        }
      } catch {
        setSelectorOpen(true);
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreBuild);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const saveBuild = window.setTimeout(() => {
      try {
        localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(makePlannerBuild(level, selection, weights, loadout)));
      } catch { /* storage can be unavailable in locked-down browser contexts */ }
    }, 250);
    return () => window.clearTimeout(saveBuild);
  }, [level, loadout, selection, storageReady, weights]);

  useEffect(() => {
    if (!saveConfirmed) return;
    const resetConfirmation = window.setTimeout(() => setSaveConfirmed(false), 1800);
    return () => window.clearTimeout(resetConfirmation);
  }, [saveConfirmed]);

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
    setActiveSlot(slot);
  }

  function chooseClass(nextSelection: CoASelection): void {
    const resolved = resolveCoAProfile(nextSelection);
    if (!resolved) return;
    setSelection(nextSelection);
    setWeights(resolved.weights);
    setSelectorOpen(false);
  }

  function saveBuildNow(): void {
    try {
      localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(makePlannerBuild(level, selection, weights, loadout)));
      setSaveConfirmed(true);
    } catch {
      setSaveConfirmed(false);
    }
  }

  return (
    <main className="min-h-screen">
      <nav className="topbar">
        <div className="brand-mark"><span>A</span></div>
        <div><p className="font-display text-lg leading-none text-stone-100">Ascension Armory</p><p className="mt-1 text-[10px] uppercase tracking-[.24em] text-amber-500/80">Conquest Gear Lab</p></div>
        <div className="ml-auto hidden items-center gap-6 text-sm text-stone-500 md:flex"><a className="text-amber-300" href="#planner">Planner</a><a href="#weights">EP Weights</a><a href="#about">Mechanics</a></div>
        <button className="secondary-button ml-4" onClick={() => setImporterOpen(true)}><Upload size={15} /> Import gear</button>
        <button className="secondary-button ml-2" onClick={saveBuildNow} aria-live="polite">
          {saveConfirmed ? <Check size={15} /> : <Save size={15} />} {saveConfirmed ? "Build saved" : "Save build"}
        </button>
      </nav>

      <div className="mx-auto max-w-[1540px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="eyebrow">Conquest of Azeroth / Gear planner</p><h1 className="mt-2 font-display text-3xl text-stone-100 sm:text-4xl">Find the right gear for your path.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Choose your class and specialization, then compare every slot against its recommended stat priority.</p></div>
          <div className="flex flex-wrap gap-3">
            <button className="secondary-button md:hidden" onClick={() => setImporterOpen(true)}><Upload size={15} /> Import gear</button>
            <button className="field-control class-profile-control min-w-60" onClick={() => setSelectorOpen(true)}><span>Class & specialization</span><strong>{profileName}</strong><small>{selectedProfile ? `${selectedProfile.spec.role} · ${selectedProfile.context.toUpperCase()}` : "Select profile"}</small></button>
            <label className="field-control w-28"><span>Level</span><input type="number" min={1} max={60} value={level} onChange={(event) => setLevel(Math.max(1, Math.min(60, Number(event.target.value))))} /></label>
          </div>
        </header>

        <div className="planner-layout" id="planner">
          <section className="armory-panel">
            <div className="panel-heading"><div><p className="eyebrow">Paper doll</p><h2>Equipped loadout</h2></div><div className="total-ep"><span>Total score</span><strong>{totalEp.toFixed(1)} <small>EP</small></strong></div></div>
            <div className="paper-doll-grid">
              <div className="slot-column">{leftSlots.map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="left" onClick={() => openSlot(slot)} />)}</div>
              <div className="character-stage">
                <div className="model-nameplate"><span>Level {level}</span><strong>{selectedProfile ? `${selectedProfile.spec.name} ${selectedProfile.classInfo.name}` : "Azerothian Hero"}</strong></div>
                <div className="character-glow" />
                <ClassicCharacterPaperDoll loadout={loadout} />
                <div className="model-vignette" />
                <div className="model-turn-control"><small>Equipped appearance</small></div>
                <div className="realm-chip"><span /> Conquest of Azeroth</div>
              </div>
              <div className="slot-column">{rightSlots.map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="right" onClick={() => openSlot(slot)} />)}</div>
            </div>
            <div className="mobile-slot-grid">{[...leftSlots, ...rightSlots].map((slot) => <SlotCard key={slot} slot={slot} item={loadout[slot]} level={level} profile={profile} side="left" onClick={() => openSlot(slot)} />)}</div>
          </section>

          <aside className="weights-panel" id="weights">
            <div className="panel-heading compact"><div><p className="eyebrow">Scoring model</p><h2>EP stat weights</h2></div><Settings2 className="text-amber-500" size={19} /></div>
            <button className="profile-select w-[calc(100%-30px)] text-left" onClick={() => setSelectorOpen(true)}><div><span>Active class profile</span><strong>{profileName}</strong></div><ChevronDown size={16} /></button>
            {selectedProfile ? <div className="stat-priority-card"><span>{selectedProfile.context.toUpperCase()} stat priority</span><p>{selectedProfile.priority}</p><small>{selectedProfile.spec.weapon.style} · {selectedProfile.spec.primaryStats.join(" / ") || "Flexible primary stat"}</small></div> : null}
            <div className="weight-table">
              <div className="weight-header"><span>Attribute</span><span>Weight</span></div>
              {activeWeightKeys.map((key) => <label className="weight-row" key={key}><span>{STAT_LABELS[key]}</span><input type="number" step="0.01" value={weights[key] ?? 0} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
            </div>
            <button className="reset-button" onClick={() => setWeights(selectedProfile?.weights ?? fallbackWeights)}><RotateCcw size={14} /> Reset class priority</button>
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
        onEquip={(item) => setLoadout((current) => ({ ...current, [activeSlot]: item }))}
        onClose={() => setActiveSlot(null)}
      /> : null}
      {importerOpen ? <GearImportModal
        onImport={(importedLevel, importedLoadout) => { setLevel(importedLevel); setLoadout(importedLoadout); setActiveSlot(null); }}
        onClose={() => setImporterOpen(false)}
      /> : null}
      {storageReady && selectorOpen ? <CoAClassSelector current={selection} onSelect={chooseClass} onClose={selection ? () => setSelectorOpen(false) : undefined} /> : null}
    </main>
  );
}
