import { Check, Save, Upload } from "lucide-react";

interface AppTopbarProps {
  saveConfirmed: boolean;
  onImport: () => void;
  onSave: () => void;
}

export function AppTopbar({ saveConfirmed, onImport, onSave }: AppTopbarProps) {
  return (
    <nav className="topbar">
      <div className="brand-mark"><span>A</span></div>
      <div><p className="font-display text-lg leading-none text-stone-100">Ascension Armory</p><p className="mt-1 text-[10px] uppercase tracking-[.24em] text-amber-500/80">Conquest Gear Lab</p></div>
      <div className="ml-auto hidden items-center gap-6 text-sm text-stone-500 md:flex"><a className="text-amber-300" href="#planner">Planner</a><a href="#weights">EP Weights</a><a href="#about">Mechanics</a></div>
      <div className="keyboard-hints" aria-label="Keyboard shortcuts"><span><kbd>Esc</kbd> Close</span><span><kbd>C</kbd> Class</span><span><kbd>I</kbd> Import</span><span><kbd>Ctrl S</kbd> Save</span></div>
      <button className="secondary-button ml-4" onClick={onImport}><Upload size={15} /> Import gear</button>
      <button className="secondary-button ml-2" onClick={onSave} aria-live="polite">
        {saveConfirmed ? <Check size={15} /> : <Save size={15} />} {saveConfirmed ? "Build saved" : "Save build"}
      </button>
    </nav>
  );
}
