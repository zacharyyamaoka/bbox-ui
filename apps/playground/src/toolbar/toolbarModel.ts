import { useSyncExternalStore } from "react";

import { BBOX_BLOCK_TOOL_ID, BBOX_PORT_TOOL_ID } from "@bbox-ui/adapter-tldraw";

export type ShapeFamilyTool =
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line"
  | "arrow";

export type DrawFamilyTool = "draw" | "highlight";

/** The bbox-ui family under the Black box slot. This list grows every iteration. */
export type BlackBoxFamilyTool =
  | typeof BBOX_BLOCK_TOOL_ID
  | typeof BBOX_PORT_TOOL_ID;

export interface ToolbarPreferences {
  version: 1;
  lastShapeTool: ShapeFamilyTool;
  lastDrawTool: DrawFamilyTool;
  lastBlackBoxTool: BlackBoxFamilyTool;
}

export const DEFAULT_TOOLBAR_PREFERENCES: ToolbarPreferences = {
  version: 1,
  lastShapeTool: "rectangle",
  lastDrawTool: "draw",
  lastBlackBoxTool: BBOX_BLOCK_TOOL_ID,
};

const STORAGE_KEY = "bbox-playground.toolbar-preferences.v1";
const SHAPE_TOOLS: readonly ShapeFamilyTool[] = [
  "rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "line",
  "arrow",
];
const DRAW_TOOLS: readonly DrawFamilyTool[] = ["draw", "highlight"];
const BLACK_BOX_TOOLS: readonly BlackBoxFamilyTool[] = [
  BBOX_BLOCK_TOOL_ID,
  BBOX_PORT_TOOL_ID,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/** Defensive parse — anything malformed falls back to the defaults, field by field. */
export function parseToolbarPreferences(value: unknown): ToolbarPreferences {
  if (!isRecord(value)) return DEFAULT_TOOLBAR_PREFERENCES;
  return {
    version: 1,
    lastShapeTool: includes(SHAPE_TOOLS, value.lastShapeTool)
      ? value.lastShapeTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastShapeTool,
    lastDrawTool: includes(DRAW_TOOLS, value.lastDrawTool)
      ? value.lastDrawTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastDrawTool,
    lastBlackBoxTool: includes(BLACK_BOX_TOOLS, value.lastBlackBoxTool)
      ? value.lastBlackBoxTool
      : DEFAULT_TOOLBAR_PREFERENCES.lastBlackBoxTool,
  };
}

let snapshot = DEFAULT_TOOLBAR_PREFERENCES;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) snapshot = parseToolbarPreferences(JSON.parse(saved));
  } catch {
    snapshot = DEFAULT_TOOLBAR_PREFERENCES;
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Preferences are helpful feedback, never a reason to block drawing.
  }
}

export function getToolbarPreferences(): ToolbarPreferences {
  hydrate();
  return snapshot;
}

export function updateToolbarPreferences(
  update: Partial<Omit<ToolbarPreferences, "version">>,
): ToolbarPreferences {
  hydrate();
  const next = { ...snapshot, ...update, version: 1 as const };
  if (
    next.lastShapeTool === snapshot.lastShapeTool &&
    next.lastDrawTool === snapshot.lastDrawTool &&
    next.lastBlackBoxTool === snapshot.lastBlackBoxTool
  ) {
    return snapshot;
  }
  snapshot = next;
  persist();
  listeners.forEach((listener) => listener());
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToolbarPreferences(): ToolbarPreferences {
  return useSyncExternalStore(
    subscribe,
    getToolbarPreferences,
    () => DEFAULT_TOOLBAR_PREFERENCES,
  );
}
