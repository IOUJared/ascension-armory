import type { StatMap } from "@/domain/gear";

export type GearContext = "pve" | "pvp";

export interface CoASpec {
  name: string;
  description: string;
  icon: string;
  role: string;
  roles: string[];
  complexity: string;
  primaryStats: string[];
  resource: string;
  playstyle: string;
  statPriority: { pve: string; pvp: string; note: string };
  weapon: { style: string; main: string; off: string; note: string; allowedTypes?: string[] };
}

export interface CoAClass {
  id: number;
  name: string;
  slug: string;
  summary: string;
  theme: string;
  faction: string;
  icon: string;
  color: string;
  specs: CoASpec[];
}

export interface CoASelection {
  classSlug: string;
  specName: string;
  context: GearContext;
}

export interface CoAProfile {
  classInfo: CoAClass;
  spec: CoASpec;
  context: GearContext;
  priority: string;
  weights: StatMap;
}
