"use client";

import { useCallback, useEffect, useState, type Dispatch } from "react";
import { BUILD_STORAGE_KEY, makePlannerBuild, readPlannerSnapshot } from "../planner-storage";
import type { PlannerAction, PlannerState } from "../planner.reducer";

export interface BuildStorageState {
  storageReady: boolean;
  saveConfirmed: boolean;
  saveBuildNow: () => void;
}

export function useBuildStorage(state: PlannerState, dispatch: Dispatch<PlannerAction>): BuildStorageState {
  const [storageReady, setStorageReady] = useState(false);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const { level, loadout, selection, weights } = state;

  const saveBuildNow = useCallback((): void => {
    try {
      localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(makePlannerBuild(level, selection, weights, loadout)));
      setSaveConfirmed(true);
    } catch {
      setSaveConfirmed(false);
    }
  }, [level, loadout, selection, weights]);

  useEffect(() => {
    const restoreBuild = window.setTimeout(() => {
      try {
        dispatch({ type: "HYDRATE", snapshot: readPlannerSnapshot(localStorage) });
      } catch {
        dispatch({ type: "HYDRATE" });
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreBuild);
  }, [dispatch]);

  useEffect(() => {
    if (!storageReady) return;
    const saveBuild = window.setTimeout(() => {
      try {
        localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(makePlannerBuild(level, selection, weights, loadout)));
      } catch { /* storage can be unavailable in locked-down browser contexts */ }
    }, 250);
    return () => window.clearTimeout(saveBuild);
  }, [level, loadout, selection, storageReady, weights]);

  useEffect(() => {
    if (!saveConfirmed) return;
    const resetConfirmation = window.setTimeout(() => setSaveConfirmed(false), 1800);
    return () => window.clearTimeout(resetConfirmation);
  }, [saveConfirmed]);

  return { storageReady, saveConfirmed, saveBuildNow };
}
