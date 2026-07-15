"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Gem, Search, Sparkles, X } from "lucide-react";
import { scoreItem, statDelta, type WeightProfile } from "@/lib/ep";
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
  profileLabel?: string;
  onEquip: (item: GearItem) => void;
  onClose: () => void;
}

function ItemIcon({ item, size = "md" }: { item?: GearItem; size?: "md" | "lg" }) {
  return <GameItemIcon item={item} className={`item-icon ${size === "lg" ? "h-16 w-16 text-3xl" : "h-12 w-12 text-xl"} ${item?.quality === "LEGENDARY" ? "legendary" : ""}`} />;
}

function StatLines({ item, compareTo }: { item: ScoredItem; compareTo?: ScoredItem }) {
  const delta = compareTo ? statDelta(item, compareTo) : {};
  return (
    <div className="space-y-1.5 text-sm">
      {(Object.entries(item.resolvedStats) as Array<[StatKey, number]>).map(([key, value]) => {
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
    </div>
  );
}

export function ItemPickerModal({ slot, equipped, candidates, loading = false, level, profile, profileLabel, onEquip, onClose }: ItemPickerModalProps) {
  const [search, setSearch] = useState("");
  const equippedScore = equipped ? scoreItem(equipped, level, profile) : undefined;
  const ranked = useMemo(() => candidates
    .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    .map((item) => scoreItem(item, level, profile))
    .sort((a, b) => b.ep - a.ep), [candidates, level, profile, search]);
  const [selectedId, setSelectedId] = useState<string | undefined>(ranked[0]?.id);
  const selected = ranked.find((item) => item.id === selectedId) ?? ranked[0];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={`Choose ${slot.toLowerCase()} item`}>
        <header className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Equipment vault</p>
              <h2 className="mt-1 font-display text-2xl text-stone-100">Choose {slot.replace("_", " ").toLowerCase()}</h2>
              <p className="mt-1 text-sm text-stone-500">Ranked for {profileLabel ?? "your live EP weights"} · Level {level}</p>
            </div>
            <button className="icon-button" onClick={onClose} aria-label="Close item picker"><X size={18} /></button>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this slot..." autoFocus />
            <kbd>{ranked.length} items</kbd>
          </label>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.35fr)]">
          <div className="item-results custom-scrollbar">
            {ranked.map((item, index) => {
              const delta = item.ep - (equippedScore?.ep ?? 0);
              return (
                <button className={`result-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}>
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <ItemIcon item={item} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-sm font-semibold ${qualityClass[item.quality]}`}>{item.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                      <span>iLvl {item.itemLevel}</span>
                      {item.worldforged ? <span className="worldforged-badge">Worldforged</span> : <span>· {item.source}</span>}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-lg text-amber-300">{item.ep.toFixed(1)}</span>
                    <span className={`block text-xs ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)} EP</span>
                  </span>
                </button>
              );
            })}
            {loading ? <div className="p-10 text-center text-sm text-stone-500">Querying the equipment vault…</div> : null}
            {!loading && !ranked.length ? <div className="p-10 text-center text-sm text-stone-500">No matching items.</div> : null}
          </div>

          {selected ? (
            <div className="comparison-pane custom-scrollbar">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <article className="compare-card muted-card">
                  <p className="eyebrow">Currently equipped</p>
                  {equippedScore ? <>
                    <div className="mt-4 flex items-center gap-3"><ItemIcon item={equippedScore} size="lg" /><div><h3 className={`font-semibold ${qualityClass[equippedScore.quality]}`}>{equippedScore.name}</h3><p className="text-xs text-stone-500">Item level {equippedScore.itemLevel}</p></div></div>
                    <div className="my-4 h-px bg-white/7" /><StatLines item={equippedScore} />
                  </> : <p className="mt-4 text-sm text-stone-500">Empty slot</p>}
                </article>
                <div className="hidden pt-16 text-amber-500 sm:block"><ArrowRight size={20} /></div>
                <article className="compare-card candidate-card">
                  <p className="eyebrow text-amber-400">Potential upgrade</p>
                  <div className="mt-4 flex items-center gap-3"><ItemIcon item={selected} size="lg" /><div><h3 className={`font-semibold ${qualityClass[selected.quality]}`}>{selected.name}</h3><p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">Item level {selected.itemLevel}{selected.worldforged ? <span className="worldforged-badge">Worldforged</span> : null}</p></div></div>
                  <div className="my-4 h-px bg-white/7" /><StatLines item={selected} compareTo={equippedScore} />
                </article>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="mechanic-tile"><Sparkles size={16} /><div><p>Mystic Enchant</p><span>{selected.enhancements?.[0]?.name ?? "No RE inserted"}</span></div></div>
                {selected.worldforged
                  ? <div className="mechanic-tile worldforged-tile"><Sparkles size={16} /><div><p>Worldforged upgrade path</p><span>Level 60 · Dungeon · ZG · T1 · T2 · AQ · T3. Score shown uses verified current-tier stats.</span></div></div>
                  : <div className="mechanic-tile"><Gem size={16} /><div><p>Custom sockets</p><span>{selected.socketCount ? `${selected.socketCount} socket available` : "No sockets"}</span></div></div>}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4">
                <div><p className="text-xs uppercase tracking-[.2em] text-stone-500">Projected change</p><p className={`mt-1 font-display text-2xl ${(selected.ep - (equippedScore?.ep ?? 0)) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{(selected.ep - (equippedScore?.ep ?? 0)) >= 0 ? "+" : ""}{(selected.ep - (equippedScore?.ep ?? 0)).toFixed(1)} EP</p></div>
                <button className="primary-button" onClick={() => { onEquip(selected); onClose(); }}><Check size={16} /> Equip item</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
