// src/chrome/preferences.ts — which member each tool family last used.
//
// `@trunk/components/toolDock` is controlled and stores nothing itself
// (MENU-KIT-DESIGN.md §7, "no persistence of any kind"), so the host owns the
// storage adapter. This is that adapter, and it is deliberately tiny.
//
// WHY every access is wrapped: the archive's own rule — "Preferences are
// helpful feedback, never a reason to block drawing". A private window, a
// blocked-cookies profile or a corrupt entry must cost the user the memory of
// their last tool, never the toolbar.
import { BLOCK_TOOL_ID } from "../shapes/types";

export const PREFERENCES_KEY = "systemsketch.dock-preferences.v1";

export type DockPreferences = Record<string, string>;

export const DEFAULT_PREFERENCES: DockPreferences = {
  lastSystemTool: BLOCK_TOOL_ID,
  lastShapeTool: "rectangle",
  lastDrawTool: "draw",
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
    return { ...DEFAULT_PREFERENCES, ...stored };
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
