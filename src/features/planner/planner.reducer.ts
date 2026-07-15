import type { EquipmentSlot, GearEnhancement, GearItem, StatKey, StatMap } from "@/domain/gear";
import type { CoASelection } from "@/types/coa";
import { FALLBACK_WEIGHTS } from "./planner.constants";

export type PlannerLoadout = Record<string, GearItem>;

export type PlannerDialog =
  | { type: "class" }
  | { type: "import" }
  | { type: "item"; slot: EquipmentSlot }
  | { type: "enchant"; slot: EquipmentSlot };

export interface PlannerSnapshot {
  level: number;
  selection?: CoASelection;
  weights: StatMap;
  loadout: PlannerLoadout;
}

export interface PlannerState extends PlannerSnapshot {
  activeDialog: PlannerDialog | null;
}

export type PlannerAction =
  | { type: "HYDRATE"; snapshot?: PlannerSnapshot }
  | { type: "SET_LEVEL"; level: number }
  | { type: "SELECT_PROFILE"; selection: CoASelection; weights: StatMap }
  | { type: "SET_WEIGHT"; stat: StatKey; value: number }
  | { type: "RESET_WEIGHTS"; weights: StatMap }
  | { type: "OPEN_DIALOG"; dialog: PlannerDialog }
  | { type: "TOGGLE_DIALOG"; dialog: "class" | "import" }
  | { type: "CLOSE_DIALOG" }
  | { type: "EQUIP_ITEM"; slot: EquipmentSlot; item: GearItem }
  | { type: "CLEAR_SLOT"; slot: EquipmentSlot }
  | { type: "SET_LOADOUT"; loadout: PlannerLoadout }
  | { type: "IMPORT_LOADOUT"; level: number; loadout: PlannerLoadout }
  | { type: "CLEAR_LOADOUT" }
  | { type: "APPLY_ENCHANT"; slot: EquipmentSlot; enchant: GearEnhancement }
  | { type: "REMOVE_ENCHANT"; slot: EquipmentSlot }
  | { type: "CLEAR_ENCHANTS" };

function clampLevel(level: number): number {
  return Math.max(1, Math.min(60, Math.round(level)));
}

function withoutEnchant(item: GearItem): GearItem {
  const enhancements = (item.enhancements ?? []).filter((enhancement) => enhancement.kind !== "ENCHANT");
  return { ...item, enhancements: enhancements.length ? enhancements : undefined };
}

export function createInitialPlannerState(): PlannerState {
  return {
    level: 60,
    weights: { ...FALLBACK_WEIGHTS },
    loadout: {},
    activeDialog: null,
  };
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "HYDRATE": {
      const snapshot = action.snapshot ?? createInitialPlannerState();
      return {
        ...state,
        level: clampLevel(snapshot.level),
        selection: snapshot.selection,
        weights: snapshot.weights,
        loadout: snapshot.loadout,
        activeDialog: snapshot.selection ? null : { type: "class" },
      };
    }
    case "SET_LEVEL":
      return { ...state, level: clampLevel(action.level) };
    case "SELECT_PROFILE":
      return { ...state, selection: action.selection, weights: action.weights, activeDialog: null };
    case "SET_WEIGHT":
      return { ...state, weights: { ...state.weights, [action.stat]: action.value } };
    case "RESET_WEIGHTS":
      return { ...state, weights: action.weights };
    case "OPEN_DIALOG":
      return { ...state, activeDialog: action.dialog };
    case "TOGGLE_DIALOG":
      if (state.activeDialog?.type === action.dialog) {
        if (action.dialog === "class" && !state.selection) return state;
        return { ...state, activeDialog: null };
      }
      if (state.activeDialog) return state;
      return { ...state, activeDialog: { type: action.dialog } };
    case "CLOSE_DIALOG":
      if (state.activeDialog?.type === "class" && !state.selection) return state;
      return { ...state, activeDialog: null };
    case "EQUIP_ITEM":
      return { ...state, loadout: { ...state.loadout, [action.slot]: action.item } };
    case "CLEAR_SLOT": {
      if (!state.loadout[action.slot]) return state;
      const loadout = { ...state.loadout };
      delete loadout[action.slot];
      const activeDialog = state.activeDialog?.type === "enchant" && state.activeDialog.slot === action.slot
        ? null
        : state.activeDialog;
      return { ...state, loadout, activeDialog };
    }
    case "SET_LOADOUT":
      return { ...state, loadout: action.loadout };
    case "IMPORT_LOADOUT":
      return { ...state, level: clampLevel(action.level), loadout: action.loadout };
    case "CLEAR_LOADOUT":
      return {
        ...state,
        loadout: {},
        activeDialog: state.activeDialog?.type === "enchant" ? null : state.activeDialog,
      };
    case "APPLY_ENCHANT": {
      const item = state.loadout[action.slot];
      if (!item) return state;
      const enhancements = [
        ...(item.enhancements ?? []).filter((enhancement) => enhancement.kind !== "ENCHANT"),
        action.enchant,
      ];
      return { ...state, loadout: { ...state.loadout, [action.slot]: { ...item, enhancements } } };
    }
    case "REMOVE_ENCHANT": {
      const item = state.loadout[action.slot];
      if (!item) return state;
      return { ...state, loadout: { ...state.loadout, [action.slot]: withoutEnchant(item) } };
    }
    case "CLEAR_ENCHANTS":
      return {
        ...state,
        loadout: Object.fromEntries(Object.entries(state.loadout).map(([slot, item]) => [slot, withoutEnchant(item)])),
        activeDialog: state.activeDialog?.type === "enchant" ? null : state.activeDialog,
      };
  }
}
