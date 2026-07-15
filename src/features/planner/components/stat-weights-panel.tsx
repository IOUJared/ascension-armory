import { ChevronDown, EyeOff, RotateCcw, Settings2, Sparkles } from "lucide-react";
import { STAT_LABELS, type StatKey, type StatMap } from "@/domain/gear";
import type { CoAProfile } from "@/types/coa";

interface StatWeightsPanelProps {
  activePower: number;
  allStats: StatMap;
  editableWeightKeys: StatKey[];
  level: number;
  profile?: CoAProfile;
  profileName: string;
  pvePower: number;
  pvpPower: number;
  summaryKeys: StatKey[];
  weights: StatMap;
  onChangeWeight: (stat: StatKey, value: number) => void;
  onOpenProfile: () => void;
  onResetWeights: () => void;
}

export function StatWeightsPanel({ activePower, allStats, editableWeightKeys, level, profile, profileName, pvePower, pvpPower, summaryKeys, weights, onChangeWeight, onOpenProfile, onResetWeights }: StatWeightsPanelProps) {
  return (
    <aside className="weights-panel" id="weights">
      <div className="panel-heading compact"><div><p className="eyebrow">Scoring model</p><h2>EP stat weights</h2></div><Settings2 className="text-amber-500" size={19} /></div>
      <button className="profile-select w-[calc(100%-30px)] text-left" onClick={onOpenProfile}><div><span>Active class profile</span><strong>{profileName}</strong></div><ChevronDown size={16} /></button>
      {profile ? <div className="stat-priority-card"><span>{profile.context.toUpperCase()} stat priority</span><p>{profile.priority}</p><small>{profile.spec.weapon.style} · {profile.spec.primaryStats.join(" / ") || "Flexible primary stat"}</small></div> : null}
      <div className="weight-table">
        <div className="weight-header"><span>Attribute</span><span>Weight</span></div>
        {editableWeightKeys.map((key) => <label className="weight-row" key={key}><span>{STAT_LABELS[key]}</span><input type="number" step="0.01" value={weights[key] ?? 0} onChange={(event) => onChangeWeight(key, Number(event.target.value))} /></label>)}
      </div>
      <button className="reset-button" onClick={onResetWeights}><RotateCcw size={14} /> Reset class priority</button>
      <div className="hybrid-callout"><Sparkles size={18} /><div><p>Class priority active</p><span>Gear results are ranked automatically using the selected specialization’s ordered {profile?.context.toUpperCase() ?? "PvE"} stats.</span></div></div>
      <div className="system-power-card">
        <div className="system-power-heading"><EyeOff size={16} /><div><p>Hidden Ascension power</p><span>Reported by the live CoA client, separate from EP</span></div></div>
        <div className="system-power-totals">
          <div className={level >= 60 && profile?.context === "pve" ? "active" : ""}><span>PvE Power</span><strong>{Math.round(pvePower)}</strong></div>
          <div className={level >= 60 && profile?.context === "pvp" ? "active" : ""}><span>PvP Power</span><strong>{Math.round(pvpPower)}</strong></div>
        </div>
        <small>{level < 60
          ? "Recorded for reference; inactive in rankings below level 60."
          : profile
            ? `${profile.context.toUpperCase()} ranking uses ${Math.round(activePower)} matching Power first, then EP to break ties.`
            : "Choose a class profile to activate the matching max-level Power."}</small>
      </div>
      <div className="summary-card">
        <p className="eyebrow">Loadout totals</p>
        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3">{summaryKeys.map((key) => <div className="summary-stat" key={key}><span>{STAT_LABELS[key]}</span><strong>{Math.round(allStats[key] ?? 0)}</strong></div>)}</div>
      </div>
    </aside>
  );
}
