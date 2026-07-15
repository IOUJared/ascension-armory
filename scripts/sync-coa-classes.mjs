import { writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://ascensionsidekick.com/data.js";
const PREFIX = "window.ASC = ";

const response = await fetch(SOURCE_URL, {
  headers: { "user-agent": "ConquestGearPlanner/0.1 class-data sync" },
});
if (!response.ok) throw new Error(`Sidekick data request failed: ${response.status}`);

let sourceText = (await response.text()).trim();
if (!sourceText.startsWith(PREFIX)) throw new Error("Unexpected Sidekick data format");
sourceText = sourceText.slice(PREFIX.length);
if (sourceText.endsWith(";")) sourceText = sourceText.slice(0, -1);
const source = JSON.parse(sourceText);

const classes = source.coaClasses.classes.map((classInfo) => ({
  id: classInfo.id,
  name: classInfo.name,
  slug: classInfo.slug,
  summary: classInfo.summary,
  theme: classInfo.theme,
  faction: classInfo.faction,
  icon: source.coaIcons.class[classInfo.name],
  color: source.coaClassColors[classInfo.name]?.hex ?? "#a88a55",
  specs: classInfo.specs.map((specInfo) => {
    const key = `${classInfo.name}|${specInfo.n}`;
    const analysis = source.coaAnalysis[classInfo.name]?.[specInfo.n] ?? {};
    const role = source.coaSpecRoles[key] ?? {};
    const weapon = source.coaWeapons[classInfo.name]?.[specInfo.n] ?? {};
    return {
      name: specInfo.n,
      description: specInfo.d ?? analysis.how ?? "",
      icon: source.coaIcons.spec[key] ?? source.coaIcons.class[classInfo.name],
      role: analysis.role ?? role.roles?.[0] ?? "Damage",
      roles: role.roles ?? analysis.roles ?? [],
      complexity: role.complexity ?? "Normal",
      primaryStats: role.primaryStats ?? [],
      resource: role.resource ?? classInfo.resource,
      playstyle: analysis.how ?? "",
      statPriority: {
        pve: analysis.statPriority?.pve ?? "",
        pvp: analysis.statPriority?.pvp ?? "",
        note: analysis.statPriority?.note ?? "",
      },
      weapon: {
        style: weapon.style ?? "Flexible",
        main: weapon.main ?? "Any allowed weapon",
        off: weapon.off ?? "—",
        note: weapon.note ?? "",
      },
    };
  }),
}));

const output = {
  source: SOURCE_URL,
  sourceBuild: source.prov?.build?.id ?? "unknown",
  sourceDate: source.prov?.build?.date ?? new Date().toISOString().slice(0, 10),
  disclaimer: "Community-maintained planning heuristic; verify against your current in-game tooltips and character sheet.",
  classes,
};

const destination = path.resolve("src/data/coa-classes.json");
await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote ${classes.length} classes and ${classes.reduce((sum, item) => sum + item.specs.length, 0)} specs to ${destination}`);
