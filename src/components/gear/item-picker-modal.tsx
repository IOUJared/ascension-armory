"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, EyeOff, Gem, MapPin, Search, Sparkles, TrendingUp, X } from "lucide-react";
import { canEquipItemAtLevel, compareScoredItems, contextualPower, isSystemPowerKey, scoreItem, statDelta, type WeightProfile } from "@/lib/ep";
import { applyRecommendedEnchant } from "@/lib/enchants";
import type { GearContext } from "@/types/coa";
import { STAT_LABELS, type EquipmentSlot, type GearItem, type ScoredItem, type StatKey } from "@/types/gear";
import { GameItemIcon } from "./game-item-icon";

const qualityClass: Record<GearItem["quality"], string> = {
  POOR: "text-zinc-400", COMMON: "text-zinc-100", UNCOMMON: "text-emerald-400", RARE: "text-blue-400",
  EPIC: "text-violet-400", LEGENDARY: "text-orange-400", ARTIFACT: "text-amber-300", HEIRLOOM: "text-cyan-300",
};

interface ItemPickerModalProps {
  slot: EquipmentSlot;
  equipped?: GearItem;
  candidates: GearItem[];
  loading?: boolean;
  level: number;
  profile: WeightProfile;
  context?: GearContext;
  profileLabel?: string;
  onEquip: (item: GearItem) => void;
  onClose: () => void;
}

function ItemIcon({ item, size = "md" }: { item?: GearItem; size?: "md" | "lg" }) {
  return <GameItemIcon item={item} className={`item-icon ${size === "lg" ? "h-16 w-16 text-3xl" : "h-12 w-12 text-xl"} ${item?.quality === "LEGENDARY" ? "legendary" : ""}`} />;
}

function SourceBadge({ item }: { item: GearItem }) {
  const label = item.dataSource === "COA_INGAME_SCAN" ? "In-game verified"
    : item.dataSource === "USER_VERIFIED" ? "Tooltip verified"
      : item.dataSource === "PLAYER_IMPORT" ? "Player import"
        : "Cache stats provisional";
  return <span className={`source-badge ${item.dataSource === "COA_INGAME_SCAN" || item.dataSource === "USER_VERIFIED" ? "verified" : item.dataSource === "COA_REALM_CACHE" ? "provisional" : ""}`}>{label}</span>;
}

const acquisitionLabels: Record<NonNullable<GearItem["acquisition"]>["type"], string> = {
  DUNGEON: "Dungeon drop", RAID: "Raid drop", CRAFTING: "Crafting", FACTION: "Faction reward",
  PVP: "PvP reward", WORLD_EVENT: "World event", COLLECTION: "Collection", WORLD_DROP: "World drop",
  WORLDFORGED: "Worldforged",
};

function AcquisitionCard({ item }: { item: GearItem }) {
  const source = item.acquisition;
  return <div className={`acquisition-card ${source ? "known" : "unknown"}`}>
    <MapPin size={18} />
    <div className="min-w-0 flex-1">
      <div className="acquisition-heading"><p>Where to get it</p>{source ? <span>{acquisitionLabels[source.type]}</span> : null}</div>
      {source ? <>
        <strong>{source.name}</strong>
        {source.encounter ? <small>{source.type === "DUNGEON" || source.type === "RAID" ? `Encounter/source: ${source.encounter}` : source.encounter}</small> : null}
        {source.note ? <em>{source.note}</em> : null}
        <em>{source.confidence === "EXACT" ? "Exact AtlasLoot encounter mapping" : "AtlasLoot category mapping"}</em>
      </> : <><strong>Source not yet verified</strong><small>This item is confirmed on CoA, but its acquisition location is not in the current source index.</small></>}
    </div>
  </div>;
}

function StatLines({ item, compareTo, level, context }: { item: ScoredItem; compareTo?: ScoredItem; level: number; context?: GearContext }) {
  const delta = compareTo ? statDelta(item, compareTo) : {};
  const normalStats = (Object.entries(item.resolvedStats) as Array<[StatKey, number]>).filter(([key]) => !isSystemPowerKey(key));
  const systemStats = (Object.entries(item.resolvedStats) as Array<[StatKey, number]>).filter(([key]) => isSystemPowerKey(key));
  return (
    <div className="space-y-1.5 text-sm">
      {normalStats.map(([key, value]) => {
        const change = delta[key];
        return (
          <div className="flex items-center justify-between gap-8" key={key}>
            <span className="text-stone-400">{STAT_LABELS[key] ?? key}</span>
            <span className="font-medium text-stone-100">
              {Number.isInteger(value) ? value : value.toFixed(1)}
              {change ? <span className={change > 0 ? "ml-2 text-emerald-400" : "ml-2 text-rose-400"}>{change > 0 ? "+" : ""}{change.toFixed(1)}</span> : null}
            </span>
          </div>
        );
      })}
      {systemStats.length ? <div className="system-stat-block">
        <div className="system-stat-title"><EyeOff size={13} /><span>Hidden Ascension power</span></div>
        {systemStats.map(([key, value]) => {
          const change = delta[key];
          const matchesContext = level >= 60 && ((context === "pve" && key === "pve_power") || (context === "pvp" && key === "pvp_power"));
          return <div className={`system-stat-row ${matchesContext ? "active" : ""}`} key={key}>
            <span>{key === "pve_power" ? "PvE Power" : "PvP Power"}</span>
            <strong>{Number.isInteger(value) ? value : value.toFixed(1)}{change ? <em className={change > 0 ? "gain" : "loss"}>{change > 0 ? "+" : ""}{change.toFixed(1)}</em> : null}</strong>
          </div>;
        })}
        <small>{level < 60 ? "Not used below level 60" : "Only the matching profile Power affects rank"}</small>
      </div> : null}
    </div>
  );
}

export function ItemPickerModal({ slot, equipped, candidates, loading = false, level, profile, context, profileLabel, onEquip, onClose }: ItemPickerModalProps) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const equippedScore = equipped ? scoreItem(equipped, level, profile) : undefined;
  const powerMode = level >= 60 && Boolean(context);
  const equippedPower = equippedScore ? contextualPower(equippedScore.resolvedStats, level, context) : 0;
  const ranked = useMemo(() => {
    const matchingCandidates = candidates
      .filter((item) => canEquipItemAtLevel(item, level) && item.name.toLowerCase().includes(search.toLowerCase()));
    const includeEquipped = equipped
      && equipped.name.toLowerCase().includes(search.toLowerCase())
      && !matchingCandidates.some((item) => item.id === equipped.id);
    return [...matchingCandidates, ...(includeEquipped ? [equipped] : [])]
      .map((item) => applyRecommendedEnchant(item, profile))
      .map((item) => scoreItem(item, level, profile))
      .sort((a, b) => compareScoredItems(a, b, level, context));
  }, [candidates, context, equipped, level, profile, search]);
  const [selectedId, setSelectedId] = useState<string | undefined>(equipped?.id ?? ranked[0]?.id);
  const selected = ranked.find((item) => item.id === selectedId) ?? ranked[0];
  const selectedPowerDelta = selected ? contextualPower(selected.resolvedStats, level, context) - equippedPower : 0;
  const selectedEpDelta = selected ? selected.ep - (equippedScore?.ep ?? 0) : 0;

  useEffect(() => {
    function handlePickerKeys(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const editingAnotherField = target?.matches("textarea, select, [contenteditable='true']") ?? false;
      if (event.key === "/" && !editingAnotherField && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !editingAnotherField && ranked.length) {
        event.preventDefault();
        const currentIndex = Math.max(0, ranked.findIndex((item) => item.id === selectedId));
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (currentIndex + direction + ranked.length) % ranked.length;
        setSelectedId(ranked[nextIndex].id);
        return;
      }
      if (event.key === "Enter" && selected
        && (document.activeElement === searchRef.current || target?.classList.contains("result-row"))) {
        event.preventDefault();
        onEquip(selected);
        onClose();
      }
    }
    window.addEventListener("keydown", handlePickerKeys);
    return () => window.removeEventListener("keydown", handlePickerKeys);
  }, [onClose, onEquip, ranked, selected, selectedId]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={`Choose ${slot.toLowerCase()} item`}>
        <header className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Equipment vault</p>
              <h2 className="mt-1 font-display text-2xl text-stone-100">Choose {slot.replace("_", " ").toLowerCase()}</h2>
              <p className="mt-1 text-sm text-stone-500">Verified gear first · Ranked for {profileLabel ?? "your live EP weights"} · Level {level}{level >= 60 && context ? ` · ${context.toUpperCase()} Power, then EP` : " · EP"}</p>
              <p className="modal-key-hints"><kbd>Esc</kbd> close <kbd>↑↓</kbd> select <kbd>Enter</kbd> equip <kbd>/</kbd> search</p>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close item picker"><X size={18} /></button>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this slot..." autoFocus />
            <kbd>{ranked.length} items</kbd>
          </label>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.35fr)]">
          <div className="item-results custom-scrollbar">
            {ranked.map((item, index) => {
              const isEquipped = equipped?.id === item.id;
              const delta = item.ep - (equippedScore?.ep ?? 0);
              const power = contextualPower(item.resolvedStats, level, context);
              const powerDelta = power - equippedPower;
              const hasExactScale = item.scaleSnapshots?.some((snapshot) => snapshot.effectiveLevel === level);
              return (
                <button className={`result-row ${selected?.id === item.id ? "selected" : ""} ${isEquipped ? "equipped" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <ItemIcon item={item} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`min-w-0 truncate text-sm font-semibold ${qualityClass[item.quality]}`}>{item.name}</span>
                      {isEquipped ? <span className="equipped-badge"><Check size={10} /> Equipped</span> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      <span>iLvl {item.itemLevel}</span>
                      <span>Requires L{item.requiredLevel}</span>
                      {item.availableAtLevel && item.availableAtLevel > item.requiredLevel ? <span className="dungeon-badge">Available L{item.availableAtLevel}</span> : null}
                      {hasExactScale ? <span className="scaled-badge">Scaled L{level}</span> : null}
                      {item.worldforged ? <span className="worldforged-badge">Worldforged</span> : null}
                      {item.dungeonTier ? <span className="dungeon-badge">{item.dungeonTier} dungeon</span> : null}
                      <SourceBadge item={item} />
                    </span>
                  </span>
                  <span className="text-right">
                    {isEquipped ? <span className="equipped-score"><Check size={13} /> Currently on</span> : <>
                      <span className="block font-display text-lg text-amber-300">{powerMode ? `${power.toFixed(0)} ${context?.toUpperCase()}` : item.ep.toFixed(1)}</span>
                      {powerMode ? <span className={`block text-[10px] ${powerDelta >= 0 ? "text-blue-300" : "text-rose-400"}`}>{powerDelta >= 0 ? "+" : ""}{powerDelta.toFixed(0)} Power</span> : null}
                      {powerMode ? <span className="block text-[10px] text-stone-500">{item.ep.toFixed(1)} EP</span> : null}
                      <span className={`block text-xs ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)} EP</span>
                    </>}
                  </span>
                </button>
              );
            })}
            {loading ? <div className="p-10 text-center text-sm text-stone-500">Querying the equipment vault…</div> : null}
            {!loading && !ranked.length ? <div className="p-10 text-center text-sm text-stone-500">No equippable matching items at level {level}.</div> : null}
          </div>

          {selected ? (
            <div className="comparison-pane custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <article className="compare-card muted-card">
                  <p className="eyebrow">Currently equipped</p>
                  {equippedScore ? <>
                    <div className="mt-4 flex items-center gap-3"><ItemIcon item={equippedScore} size="lg" /><div><h3 className={`font-semibold ${qualityClass[equippedScore.quality]}`}>{equippedScore.name}</h3><p className="text-xs text-stone-500">Item level {equippedScore.itemLevel}</p></div></div>
                    <div className="my-4 h-px bg-white/7" /><StatLines item={equippedScore} level={level} context={context} />
                  </> : <p className="mt-4 text-sm text-stone-500">Empty slot</p>}
                </article>
                <div className="hidden pt-16 text-amber-500 sm:block"><ArrowRight size={20} /></div>
                <article className="compare-card candidate-card">
                  <p className="eyebrow text-amber-400">Potential upgrade</p>
                  <div className="mt-4 flex items-center gap-3"><ItemIcon item={selected} size="lg" /><div><h3 className={`font-semibold ${qualityClass[selected.quality]}`}>{selected.name}</h3><p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">Item level {selected.itemLevel} · Requires level {selected.requiredLevel}{selected.availableAtLevel && selected.availableAtLevel > selected.requiredLevel ? ` · Available from level ${selected.availableAtLevel} content` : ""}{selected.worldforged ? <span className="worldforged-badge">Worldforged</span> : null}{selected.dungeonTier ? <span className="dungeon-badge">{selected.dungeonTier} dungeon</span> : null}<SourceBadge item={selected} /></p></div></div>
                  <div className="my-4 h-px bg-white/7" /><StatLines item={selected} compareTo={equippedScore} level={level} context={context} />
                </article>
              </div>

              <AcquisitionCard item={selected} />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="mechanic-tile"><Sparkles size={16} /><div><p>Mystic Enchant</p><span>{selected.enhancements?.find((enhancement) => enhancement.kind === "MYSTIC_ENCHANT")?.name ?? "No RE inserted"}</span></div></div>
                {selected.dataSource === "COA_REALM_CACHE" ? <div className="mechanic-tile provisional-tile"><EyeOff size={16} /><div><p>Provisional cache stats</p><span>This item is queued for direct in-game validation; its cache values may differ from the current tooltip.</span></div></div> : null}
                {selected.scaleSnapshots?.some((snapshot) => snapshot.effectiveLevel === level)
                  ? <div className="mechanic-tile scaled-tile"><TrendingUp size={16} /><div><p>Exact level scaling</p><span>Stats and item level were captured from the current CoA client at effective level {level}.</span></div></div>
                  : null}
                {selected.worldforged
                  ? <div className="mechanic-tile worldforged-tile"><Sparkles size={16} /><div><p>Worldforged upgrade path</p><span>Level 60 · Dungeon · ZG · T1 · T2 · AQ · T3. Score shown uses verified current-tier stats.</span></div></div>
                  : <div className="mechanic-tile"><Gem size={16} /><div><p>Custom sockets</p><span>{selected.socketCount ? `${selected.socketCount} socket available` : "No sockets"}</span></div></div>}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4">
                <div><p className="text-xs uppercase tracking-[.2em] text-stone-500">Projected change</p>{powerMode ? <>
                  <p className={`mt-1 font-display text-2xl ${selectedPowerDelta >= 0 ? "text-blue-300" : "text-rose-400"}`}>{selectedPowerDelta >= 0 ? "+" : ""}{selectedPowerDelta.toFixed(0)} {context?.toUpperCase()} Power</p>
                  <p className={`mt-1 text-xs ${selectedEpDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{selectedEpDelta >= 0 ? "+" : ""}{selectedEpDelta.toFixed(1)} EP</p>
                </> : <p className={`mt-1 font-display text-2xl ${selectedEpDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{selectedEpDelta >= 0 ? "+" : ""}{selectedEpDelta.toFixed(1)} EP</p>}</div>
                <button className="primary-button" onClick={() => { onEquip(selected); onClose(); }}><Check size={16} /> Equip item</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
