"use client";

import { useEffect, type Dispatch } from "react";
import type { PlannerAction, PlannerDialog } from "../planner.reducer";

export type PlannerShortcut = "close" | "save" | "toggle-class" | "toggle-import";

interface ShortcutInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  editing?: boolean;
  activeDialog: PlannerDialog | null;
}

export function resolvePlannerShortcut(input: ShortcutInput): PlannerShortcut | undefined {
  const key = input.key.toLowerCase();
  if (input.key === "Escape" && input.activeDialog) return "close";
  if ((input.ctrlKey || input.metaKey) && key === "s") return "save";
  if (input.editing || input.ctrlKey || input.metaKey || input.altKey) return undefined;
  if (key === "i" && (!input.activeDialog || input.activeDialog.type === "import")) return "toggle-import";
  if (key === "c" && (!input.activeDialog || input.activeDialog.type === "class")) return "toggle-class";
  return undefined;
}

interface PlannerShortcutOptions {
  activeDialog: PlannerDialog | null;
  dispatch: Dispatch<PlannerAction>;
  saveBuildNow: () => void;
}

export function usePlannerShortcuts({ activeDialog, dispatch, saveBuildNow }: PlannerShortcutOptions): void {
  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const shortcut = resolvePlannerShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editing: target?.matches("input, textarea, select, [contenteditable='true']") ?? false,
        activeDialog,
      });
      if (!shortcut) return;

      if (shortcut === "save") {
        event.preventDefault();
        saveBuildNow();
      } else if (shortcut === "close") {
        dispatch({ type: "CLOSE_DIALOG" });
      } else if (shortcut === "toggle-import") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_DIALOG", dialog: "import" });
      } else if (shortcut === "toggle-class") {
        event.preventDefault();
        dispatch({ type: "TOGGLE_DIALOG", dialog: "class" });
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [activeDialog, dispatch, saveBuildNow]);
}
