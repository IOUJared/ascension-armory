"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { calculateEp, isSystemPowerKey, type WeightProfile } from "@/lib/ep";
import { STAT_LABELS, type EquipmentSlot, type GearEnhancement, type GearItem, type StatKey, type StatMap } from "@/types/gear";

interface EnchantEditorModalProps {
  slot: EquipmentSlot;
  item: GearItem;
  profile: WeightProfile;
  onApply: (enchant: GearEnhancement) => void;
  onRemove: () => void;
  onClose: () => void;
}

interface StatRow {
  key: StatKey;
  value: number;
}

const statKeys = (Object.keys(STAT_LABELS) as StatKey[]).filter((key) => !isSystemPowerKey(key));

function nextUnusedStat(rows: StatRow[]): StatKey {
  const used = new Set(rows.map((row) => row.key));
  return statKeys.find((key) => !used.has(key)) ?? "custom_power";
}

export function EnchantEditorModal({ slot, item, profile, onApply, onRemove, onClose }: EnchantEditorModalProps) {
  const current = item.enhancements?.find((enhancement) => enhancement.kind === "ENCHANT");
  const [name, setName] = useState(current?.name ?? "");
  const [rows, setRows] = useState<StatRow[]>(() => {
    const saved = Object.entries(current?.stats ?? {}) as Array<[StatKey, number]>;
    return saved.length ? saved.map(([key, value]) => ({ key, value })) : [{ key: "stamina", value: 0 }];
  });
  const stats = useMemo(() => Object.fromEntries(rows
    .filter((row) => Number.isFinite(row.value) && row.value !== 0)
    .map((row) => [row.key, row.value])) as StatMap, [rows]);
  const enchantEp = calculateEp(stats, profile);

  function updateRow(index: number, update: Partial<StatRow>): void {
    setRows((currentRows) => currentRows.map((row, rowIndex) => rowIndex === index ? { ...row, ...update } : row));
  }

  function apply(): void {
    const cleanName = name.trim();
    if (!cleanName) return;
    onApply({ id: `gear-enchant:${slot.toLowerCase()}`, name: cleanName, kind: "ENCHANT", stats });
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="enchant-panel" role="dialog" aria-modal="true" aria-label={`Edit enchant for ${item.name}`}>
        <header className="import-header">
          <div><p className="eyebrow">Gear enhancement</p><h2>{current ? "Edit enchant" : "Add enchant"}</h2><p>{item.name} · {slot.replaceAll("_", " ").toLowerCase()}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close enchant editor"><X size={18} /></button>
        </header>

        <div className="enchant-content">
          <label className="enchant-name-field"><span>Enchant name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Greater Intellect" autoFocus /></label>
          <div className="enchant-stat-heading"><div><span>Stat bonuses</span><small>Add every stat shown by the in-game enchant tooltip.</small></div><strong>{enchantEp >= 0 ? "+" : ""}{enchantEp.toFixed(1)} EP</strong></div>
          <div className="enchant-stat-list">
            {rows.map((row, index) => <div className="enchant-stat-row" key={`${index}-${row.key}`}>
              <select value={row.key} onChange={(event) => updateRow(index, { key: event.target.value as StatKey })}>
                {statKeys.map((key) => <option key={key} value={key}>{STAT_LABELS[key]}</option>)}
              </select>
              <input type="number" step="1" value={row.value} onChange={(event) => updateRow(index, { value: Number(event.target.value) })} aria-label={`${STAT_LABELS[row.key]} amount`} />
              <button type="button" onClick={() => setRows((currentRows) => currentRows.filter((_, rowIndex) => rowIndex !== index))} disabled={rows.length === 1} aria-label={`Remove ${STAT_LABELS[row.key]}`}><X size={14} /></button>
            </div>)}
          </div>
          <button type="button" className="add-enchant-stat" onClick={() => setRows((currentRows) => [...currentRows, { key: nextUnusedStat(currentRows), value: 0 }])}><Plus size={13} /> Add another stat</button>
          <div className="enchant-help"><Sparkles size={16} /><p>This enchant is attached to this equipped item. Its bonuses immediately affect loadout totals, EP scoring, comparisons, and the locally saved build.</p></div>
        </div>

        <footer className="import-footer">
          <div>{current ? <button className="remove-enchant-button" onClick={() => { onRemove(); onClose(); }}><Trash2 size={14} /> Remove enchant</button> : <small>No enchant currently applied</small>}</div>
          <div><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim()} onClick={apply}><Sparkles size={14} /> Apply enchant</button></div>
        </footer>
      </section>
    </div>
  );
}
