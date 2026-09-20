// src/chrome/preferences.ts — which member each tool family last used, and
// which arrow preset A lands on next.
//
// `@trunk/components/toolDock` is controlled and stores nothing itself
// (MENU-KIT-DESIGN.md §7, "no persistence of any kind"), and
// `@trunk/components/toolPreferences` is the model only — its header says a
// host "writes its own adapter around `parsePreferences`/`mergePreferences`".
// This is that adapter, and it is deliberately tiny.
//
// WHY every access is wrapped: the archive's own rule — "Preferences are
// helpful feedback, never a reason to block drawing". A private window, a
// blocked-cookies profile or a corrupt entry must cost the user the memory of
// their last tool, never the toolbar.
//
// WHY a module store (subscribe + snapshot) and not React state in the dock:
// two surfaces write it — the dock's own presses AND the `A` key, which
// arrives through tldraw's `overrides.tools` seam (./dock.tsx
// `withArrowPresetCycle`) with no React tree of its own. The archive solved
// the same two-writer problem the same way (toolbarModel.ts:157-214,
// `useSyncExternalStore`).
import { useSyncExternalStore } from "react";

import {
  DEFAULT_TOOLBAR_PREFERENCES,
  mergePreferences,
  parseToolbarPreferences,
  type ArrowPreset,
} from "@trunk/components/toolPreferences";

import { BLOCK_TOOL_ID } from "../shapes/types";

export const PREFERENCES_KEY = "systemsketch.dock-preferences.v1";

export type DockPreferences = Record<string, string>;

export const DEFAULT_PREFERENCES: DockPreferences = {
  lastSystemTool: BLOCK_TOOL_ID,
  lastShapeTool: "rectangle",
  lastDrawTool: "draw",
  // Elbow — Zach, 2026-09-19: "by default elbow arrows should always be
  // used". The trunk owns that datum; this only reads it.
  lastArrowPreset: DEFAULT_TOOLBAR_PREFERENCES.lastArrowPreset,
};

export function loadPreferences(): DockPreferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFERENCES };
    const stored: DockPreferences = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      // A corrupt field falls back to ITS OWN default without invalidating its
      // siblings — the same field-independent rule
      // `@trunk/components/toolPreferences`'s `parsePreferences` generalizes.
      if (typeof value === "string") stored[key] = value;
    }
    return {
      ...DEFAULT_PREFERENCES,
      ...stored,
      // The one field with a closed vocabulary goes through the trunk's own
      // registry, so "sideways" cannot survive a reload.
      lastArrowPreset: parseToolbarPreferences(parsed).lastArrowPreset,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(next: DockPreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Ignored on purpose — see this file's header.
  }
}

/** The validated preset, whatever the record holds. */
export function arrowPresetOf(preferences: DockPreferences): ArrowPreset {
  return parseToolbarPreferences(preferences).lastArrowPreset;
}

let snapshot: DockPreferences | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function getDockPreferences(): DockPreferences {
  snapshot ??= loadPreferences();
  return snapshot;
}

/**
 * Re-read storage. Called once per editor mount (./dock.tsx
 * `installArrowPresets`) so a reload — or a test's remount — reads what was
 * actually persisted rather than a copy this module cached earlier.
 */
export function rehydrateDockPreferences(): void {
  snapshot = loadPreferences();
  notify();
}

/** Merge, persist, notify — and do none of it when nothing changed
 *  (`mergePreferences` keeps the same reference for a no-op). */
export function updateDockPreferences(update: DockPreferences): DockPreferences {
  const current = getDockPreferences();
  const next = mergePreferences(current, update);
  if (next === current) return current;
  snapshot = next;
  savePreferences(next);
  notify();
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDockPreferences(): DockPreferences {
  return useSyncExternalStore(subscribe, getDockPreferences, getDockPreferences);
}
