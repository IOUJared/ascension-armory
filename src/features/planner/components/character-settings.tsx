import { Upload } from "lucide-react";
import type { CoAProfile } from "@/types/coa";
import { LevelSelector } from "./level-selector";

interface CharacterSettingsProps {
  level: number;
  profile?: CoAProfile;
  profileName: string;
  onChangeLevel: (level: number) => void;
  onImport: () => void;
  onSelectProfile: () => void;
}

export function CharacterSettings({ level, profile, profileName, onChangeLevel, onImport, onSelectProfile }: CharacterSettingsProps) {
  return (
    <header className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div><p className="eyebrow">Conquest of Azeroth / Gear planner</p><h1 className="mt-2 font-display text-3xl text-stone-100 sm:text-4xl">Find the right gear for your path.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-stone-500">Choose your class and specialization, then compare every slot against its recommended stat priority.</p></div>
      <div className="flex flex-wrap gap-3">
        <button className="secondary-button md:hidden" onClick={onImport}><Upload size={15} /> Import gear</button>
        <button className="field-control class-profile-control min-w-60" onClick={onSelectProfile}><span>Class & specialization</span><strong>{profileName}</strong><small>{profile ? `${profile.spec.role} · ${profile.context.toUpperCase()}` : "Select profile"}</small></button>
        <LevelSelector level={level} onChange={onChangeLevel} />
      </div>
    </header>
  );
}
