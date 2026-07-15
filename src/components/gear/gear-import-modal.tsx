"use client";

import { useState } from "react";
import { Check, ClipboardPaste, Download, LoaderCircle, Upload, X } from "lucide-react";
import { parseGearImport } from "@/lib/gear-import";
import { findStaticItemsById } from "@/lib/items/static-catalog";
import type { GearItem } from "@/types/gear";

interface GearImportModalProps {
  onImport: (level: number, loadout: Record<string, GearItem>) => void;
  onClose: () => void;
}

interface ImportResult {
  imported: number;
  requested: number;
  missing: Array<{ slot: string; itemId: string }>;
}

const addonUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/downloads/AscensionArmoryExporter.zip`;

export function GearImportModal({ onImport, onClose }: GearImportModalProps) {
  const [exportText, setExportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult>();

  async function importGear(): Promise<void> {
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    try {
      const parsed = parseGearImport(exportText);
      const matches = await findStaticItemsById(parsed.gear.map((entry) => entry.itemId));
      const loadout: Record<string, GearItem> = {};
      const missing: ImportResult["missing"] = [];
      for (const entry of parsed.gear) {
        const item = matches.get(entry.itemId);
        if (item) loadout[entry.slot] = { ...item, slot: entry.slot };
        else missing.push({ slot: entry.slot, itemId: entry.itemId });
      }
      onImport(parsed.level, loadout);
      setResult({ imported: Object.keys(loadout).length, requested: parsed.gear.length, missing });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The gear export could not be imported.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-panel" role="dialog" aria-modal="true" aria-label="Import equipped gear">
        <header className="import-header">
          <div><p className="eyebrow">In-game character bridge</p><h2>Import your current gear</h2><p>Bring your character level and equipped items into the planner in one paste.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close gear importer"><X size={18} /></button>
        </header>

        <div className="import-content custom-scrollbar">
          <ol className="import-steps">
            <li><span>1</span><div><strong>Install the exporter addon</strong><p>Extract its folder into the game’s <code>Interface/AddOns</code> directory, then restart the game or reload the UI.</p><a className="secondary-button" href={addonUrl} download><Download size={14} /> Download exporter addon</a></div></li>
            <li><span>2</span><div><strong>Export in game</strong><p>Log into the character, type <code>/aaexport</code>, then press <kbd>Ctrl+C</kbd> in the highlighted export box.</p></div></li>
            <li><span>3</span><div><strong>Paste and import</strong><p>The string contains only character level and equipped item-link data—no account credentials.</p></div></li>
          </ol>

          <label className="import-textarea">
            <span><ClipboardPaste size={15} /> Ascension Armory export string</span>
            <textarea value={exportText} onChange={(event) => setExportText(event.target.value)} placeholder="AA1|60|HEAD=410036:0:0:0...;NECK=515303:0:0:0..." autoFocus spellCheck={false} />
          </label>

          {error ? <div className="import-message error">{error}</div> : null}
          {result ? <div className={`import-message ${result.missing.length ? "warning" : "success"}`}>
            <Check size={16} />
            <div><strong>Imported {result.imported} of {result.requested} equipped items.</strong>{result.missing.length ? <p>Not yet in the verified catalog: {result.missing.map((item) => `${item.slot.replaceAll("_", " ")} #${item.itemId}`).join(", ")}.</p> : <p>Your level and complete recognized loadout are now active.</p>}</div>
          </div> : null}
        </div>

        <footer className="import-footer">
          <small>Empty slots are cleared when an export is applied.</small>
          <div><button className="secondary-button" onClick={onClose}>{result ? "View build" : "Cancel"}</button><button className="primary-button" onClick={importGear} disabled={loading || !exportText.trim()}>{loading ? <LoaderCircle className="animate-spin" size={15} /> : <Upload size={15} />} Import gear</button></div>
        </footer>
      </section>
    </div>
  );
}
