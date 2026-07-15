import classData from "@/data/coa-classes.json";
import type { CoAClass, CoAProfile, CoASelection, CoASpec, GearContext } from "@/types/coa";
import type { StatKey, StatMap } from "@/types/gear";

export const COA_CLASSES = classData.classes as CoAClass[];
export const COA_DATA_SOURCE = classData.source;
export const COA_SOURCE_BUILD = classData.sourceBuild;
export const COA_SOURCE_DATE = classData.sourceDate;
export const COA_DISCLAIMER = classData.disclaimer;

const STAT_PATTERNS: Array<[StatKey, RegExp]> = [
  ["armor_penetration", /armor pen|\barp\b/i],
  ["spell_penetration", /spell pen/i],
  ["healing_power", /healing power|spell healing/i],
  ["spell_power", /spell power/i],
  ["attack_power", /attack power|ranged ap|\brap\b/i],
  ["resilience_rating", /resilience/i],
  ["expertise_rating", /expertise/i],
  ["defense_rating", /defense/i],
  ["dodge_rating", /dodge/i],
  ["parry_rating", /parry/i],
  ["block_value", /block value/i],
  ["block_rating", /\bblock\b/i],
  ["hit_rating", /\bhit\b/i],
  ["crit_rating", /critical strike|\bcrit\b/i],
  ["haste_rating", /haste/i],
  ["strength", /strength/i],
  ["agility", /agility/i],
  ["stamina", /stamina/i],
  ["intellect", /intellect/i],
  ["spirit", /spirit/i],
  ["mp5", /mp5|mana regen/i],
  ["armor", /^armor(?:\s|$)/i],
];

const BUDGET_NORMALIZER: Partial<Record<StatKey, number>> = {
  attack_power: 0.5,
  armor: 0.035,
  block_value: 0.35,
  hp5: 0.2,
  mp5: 0.6,
};

export function weightsFromPriority(priority: string, spec: CoASpec, context: GearContext): StatMap {
  const segments = priority.split(/\s*>\s*/);
  const weights: StatMap = {};
  segments.forEach((segment, index) => {
    const rankWeight = Math.max(0.25, 1 - index * 0.11);
    for (const [key, pattern] of STAT_PATTERNS) {
      if (!pattern.test(segment)) continue;
      weights[key] = Math.max(weights[key] ?? 0, Number((rankWeight * (BUDGET_NORMALIZER[key] ?? 1)).toFixed(2)));
    }
  });

  const physicalWeapon = !/caster|held off-hand/i.test(`${spec.weapon.style} ${spec.weapon.main}`)
    && !spec.roles.every((role) => /healer|support/i.test(role));
  if (physicalWeapon) weights.weapon_dps = 2.4;
  if (context === "pve") weights.pve_power = 0.35;
  else weights.pvp_power = 0.8;
  return weights;
}

export function resolveCoAProfile(selection: CoASelection): CoAProfile | undefined {
  const classInfo = COA_CLASSES.find((item) => item.slug === selection.classSlug);
  const spec = classInfo?.specs.find((item) => item.name === selection.specName);
  if (!classInfo || !spec) return undefined;
  const priority = spec.statPriority[selection.context] || spec.statPriority.pve;
  return { classInfo, spec, context: selection.context, priority, weights: weightsFromPriority(priority, spec, selection.context) };
}

export function isCoASelection(value: unknown): value is CoASelection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CoASelection>;
  if (candidate.context !== "pve" && candidate.context !== "pvp") return false;
  return Boolean(resolveCoAProfile(candidate as CoASelection));
}
