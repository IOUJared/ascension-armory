"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { contextualPower, type EquipmentSlot, type GearItem, type WeightProfile } from "@/domain/gear";
import { applyRecommendedEnchant } from "@/lib/enchants";
import { resolveCoAProfile } from "@/lib/coa";
import { findStaticItemsForSlot } from "@/lib/items/static-catalog";
import type { CoASelection } from "@/types/coa";
import { FALLBACK_WEIGHTS } from "../planner.constants";
import { createInitialPlannerState, plannerReducer } from "../planner.reducer";
import { selectActiveWeightKeys, selectEditableWeightKeys, selectHasGearEnchants, selectLoadoutTotals, selectSummaryKeys } from "../planner.selectors";
import { useBuildStorage } from "../hooks/use-build-storage";
import { usePlannerShortcuts } from "../hooks/use-planner-shortcuts";
import { AppTopbar } from "./app-topbar";
import { CharacterSettings } from "./character-settings";
import { PaperDollPanel } from "./paper-doll-panel";
import { PlannerDialogs } from "./planner-dialogs";
import { StatWeightsPanel } from "./stat-weights-panel";

export function GearPlanner() {
  const [state, dispatch] = useReducer(plannerReducer, createInitialPlannerState());
  const { activeDialog, level, loadout, selection, weights } = state;
  const activeSlot = activeDialog?.type === "item" ? activeDialog.slot : null;
  const [candidates, setCandidates] = useState<GearItem[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const selectedProfile = useMemo(() => selection ? resolveCoAProfile(selection) : undefined, [selection]);
  const profileName = selectedProfile ? `${selectedProfile.classInfo.name} / ${selectedProfile.spec.name}` : "Choose a class";
  const profile = useMemo<WeightProfile>(() => ({ weights, context: selectedProfile?.context }), [selectedProfile?.context, weights]);
  const activeWeightKeys = useMemo(() => selectActiveWeightKeys(weights), [weights]);
  const editableWeightKeys = useMemo(() => selectEditableWeightKeys(weights, selectedProfile?.weights), [selectedProfile?.weights, weights]);
  const loadoutTotals = useMemo(() => selectLoadoutTotals(loadout, level, profile), [level, loadout, profile]);
  const summaryKeys = useMemo(() => selectSummaryKeys(activeWeightKeys, loadoutTotals.stats), [activeWeightKeys, loadoutTotals.stats]);
  const pvePower = loadoutTotals.stats.pve_power ?? 0;
  const pvpPower = loadoutTotals.stats.pvp_power ?? 0;
  const activePower = contextualPower(loadoutTotals.stats, level, selectedProfile?.context);
  const hasGearEnchants = useMemo(() => selectHasGearEnchants(loadout), [loadout]);
  const { saveBuildNow, saveConfirmed, storageReady } = useBuildStorage(state, dispatch);
  usePlannerShortcuts({ activeDialog, dispatch, saveBuildNow });

  useEffect(() => {
    if (!activeSlot) return;
    let cancelled = false;
    findStaticItemsForSlot(activeSlot, level)
      .then((items) => { if (!cancelled) setCandidates(items); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
  }, [activeSlot, level]);

  function openSlot(slot: EquipmentSlot): void {
    setCandidates([]);
    setLoadingCandidates(true);
    dispatch({ type: "OPEN_DIALOG", dialog: { type: "item", slot } });
  }

  function chooseClass(nextSelection: CoASelection): void {
    const resolved = resolveCoAProfile(nextSelection);
    if (resolved) dispatch({ type: "SELECT_PROFILE", selection: nextSelection, weights: resolved.weights });
  }

  function autoEnchantGear(): void {
    dispatch({
      type: "SET_LOADOUT",
      loadout: Object.fromEntries(Object.entries(loadout)
        .map(([slot, item]) => [slot, applyRecommendedEnchant(item, profile, true)])),
    });
  }

  const openImport = () => dispatch({ type: "OPEN_DIALOG", dialog: { type: "import" } });
  const openProfile = () => dispatch({ type: "OPEN_DIALOG", dialog: { type: "class" } });
  const closeDialog = () => dispatch({ type: "CLOSE_DIALOG" });

  return (
    <main className="min-h-screen">
      <AppTopbar saveConfirmed={saveConfirmed} onImport={openImport} onSave={saveBuildNow} />
      <div className="mx-auto max-w-[1540px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <CharacterSettings
          level={level}
          profile={selectedProfile}
          profileName={profileName}
          onChangeLevel={(nextLevel) => dispatch({ type: "SET_LEVEL", level: nextLevel })}
          onImport={openImport}
          onSelectProfile={openProfile}
        />
        <div className="planner-layout" id="planner">
          <PaperDollPanel
            characterName={selectedProfile ? `${selectedProfile.spec.name} ${selectedProfile.classInfo.name}` : "Azerothian Hero"}
            hasGearEnchants={hasGearEnchants}
            level={level}
            loadout={loadout}
            profile={profile}
            totalEp={loadoutTotals.ep}
            onAutoEnchant={autoEnchantGear}
            onClearEnchants={() => dispatch({ type: "CLEAR_ENCHANTS" })}
            onClearLoadout={() => dispatch({ type: "CLEAR_LOADOUT" })}
            onClearSlot={(slot) => dispatch({ type: "CLEAR_SLOT", slot })}
            onOpenEnchant={(slot) => dispatch({ type: "OPEN_DIALOG", dialog: { type: "enchant", slot } })}
            onOpenSlot={openSlot}
          />
          <StatWeightsPanel
            activePower={activePower}
            allStats={loadoutTotals.stats}
            editableWeightKeys={editableWeightKeys}
            level={level}
            profile={selectedProfile}
            profileName={profileName}
            pvePower={pvePower}
            pvpPower={pvpPower}
            summaryKeys={summaryKeys}
            weights={weights}
            onChangeWeight={(stat, value) => dispatch({ type: "SET_WEIGHT", stat, value })}
            onOpenProfile={openProfile}
            onResetWeights={() => dispatch({ type: "RESET_WEIGHTS", weights: selectedProfile?.weights ?? FALLBACK_WEIGHTS })}
          />
        </div>
      </div>
      <PlannerDialogs
        activeDialog={activeDialog}
        candidates={candidates}
        level={level}
        loadout={loadout}
        loadingCandidates={loadingCandidates}
        profile={profile}
        profileInfo={selectedProfile}
        profileName={profileName}
        selection={selection}
        storageReady={storageReady}
        onApplyEnchant={(slot, enchant) => dispatch({ type: "APPLY_ENCHANT", slot, enchant })}
        onClose={closeDialog}
        onEquip={(slot, item) => dispatch({ type: "EQUIP_ITEM", slot, item })}
        onImport={(importedLevel, importedLoadout) => dispatch({
          type: "IMPORT_LOADOUT",
          level: importedLevel,
          loadout: Object.fromEntries(Object.entries(importedLoadout)
            .map(([slot, item]) => [slot, applyRecommendedEnchant(item, profile)])),
        })}
        onRemoveEnchant={(slot) => dispatch({ type: "REMOVE_ENCHANT", slot })}
        onSelectProfile={chooseClass}
      />
    </main>
  );
}
