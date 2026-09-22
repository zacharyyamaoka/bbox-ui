// src/editor/gestureSettings.ts — the wheel/pointer gesture model,
// ported from the archived SystemSketch app.
//
// Ported and GENERALIZED-DOWN from
// /home/bam/systemsketch/src/settings/gestureSettings.ts (212 lines) and the
// COMMAND_ORDER/GESTURE_ORDER constants in
// /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:1115-1118. Line
// ranges on every ported routine below point at the donor file as it exists
// on disk today (per `.claude/feedback.md`, "algorithm provenance" — a
// citation must name a file that exists, not a remembered shape).
//
// WHY the storage key, defaults, ranges, step and parse semantics travel
// character for character: `systemsketch.gestures.v1` is the key the OLD app
// already wrote into Zach's browser. Keeping it byte-for-byte means whatever
// he already tuned (a custom binding, a scroll speed) survives the move to
// this app instead of silently resetting to the factory defaults on day one.
//
// NOTHING from React travels. Dropped on purpose: the donor's
// `useSyncExternalStore` import, its module-level `snapshot`/`hydrated`/
// `listeners` singleton, `hydrate`, `getGestureSettings`,
// `updateGestureSettings`, `subscribeGestureSettings`, and
// `useGestureSettings`. This repo's rule (`CLAUDE.md`, "The core imports no
// canvas engine" — the same boundary `toolPreferences.ts`'s header spells out
// for its own donor) is that host-owned persistence and subscription do not
// travel: a host wires its own store/effect around `readGestureSettings` and
// `writeGestureSettings` and decides for itself when to re-render.

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:3
 *
 * The old app's key, unchanged — see the file header for why.
 */
export const GESTURE_SETTINGS_STORAGE_KEY = "systemsketch.gestures.v1";

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:14-23
 *
 * What a wheel gesture can be bound to. Deliberately small — every entry has
 * to be implementable with tldraw's own public editor API, no engine forks.
 *
 * WHY no `next-page`/`prev-page`, unlike the tldraw_styling_lab this shipped
 * from: SystemSketch pinned `maxPages: 1` (`canvasCamera.ts`) — structural
 * depth replaced pages there, so a page-turn command would have been a
 * permanent, confusing no-op. The donor's own repair semantics for a value
 * like this (a command this product no longer offers) are carried across in
 * `parseStoredGestureSettings` below, not just the type.
 */
export type WheelCommand =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-up"
  | "pan-down"
  | "pan-left"
  | "pan-right"
  | "undo"
  | "redo";

/** Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:25-35 — the donor's exact label strings. */
export const WHEEL_COMMAND_LABELS: Record<WheelCommand, string> = {
  "none": "Nothing",
  "zoom-in": "Zoom in",
  "zoom-out": "Zoom out",
  "pan-up": "Pan up",
  "pan-down": "Pan down",
  "pan-left": "Pan left",
  "pan-right": "Pan right",
  "undo": "Undo",
  "redo": "Redo",
};

/**
 * Ported from /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:1117-1118
 * (`COMMAND_ORDER`) — the order the donor's binding `<select>` listed
 * commands in, not object-key order, so a menu built off this array matches
 * what Zach already saw there.
 */
export const WHEEL_COMMANDS_IN_MENU_ORDER: readonly WheelCommand[] = [
  "none", "pan-up", "pan-down", "pan-left", "pan-right", "zoom-in", "zoom-out", "undo", "redo",
];

/** Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:38 — the four wheel gestures Settings → Canvas can rebind. */
export type WheelGesture = "wheelDown" | "wheelUp" | "ctrlWheelDown" | "ctrlWheelUp";

/** Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:40-45 — the donor's exact label strings. */
export const WHEEL_GESTURE_LABELS: Record<WheelGesture, string> = {
  wheelDown: "Scroll wheel down",
  wheelUp: "Scroll wheel up",
  ctrlWheelDown: "Ctrl + scroll wheel down",
  ctrlWheelUp: "Ctrl + scroll wheel up",
};

/**
 * Ported from /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:1116
 * (`GESTURE_ORDER`) — the order the donor's Settings → Canvas panel listed
 * the four rebindable gestures in.
 */
export const WHEEL_GESTURES_IN_ORDER: readonly WheelGesture[] = ["wheelDown", "wheelUp", "ctrlWheelDown", "ctrlWheelUp"];

/** Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:47-64. */
export interface GestureSettings {
  /**
   * Paste (and duplicate) at the pointer rather than at the viewport centre.
   * The donor applied this through tldraw's own `isPasteAtCursorMode` user
   * preference, never a hand-rolled paste listener — this trunk's host is
   * expected to do the same.
   */
  pasteUnderCursor: boolean;
  bindings: Record<WheelGesture, WheelCommand>;
  /**
   * Pan and zoom speed as a PERCENTAGE of tldraw's own stock speed, meant to
   * be applied through `editor.setCameraOptions({ panSpeed, zoomSpeed })`. A
   * percentage of the stock value, not a raw multiplier, keeps 100 the
   * obvious reset point.
   */
  panSpeedPercent: number;
  zoomSpeedPercent: number;
}

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:69-71
 *
 * WHY clamped rather than free: 0 would freeze the canvas with no obvious way
 * back, and past ~400% a single wheel notch crosses the whole board. This is
 * Zach's stated range, not a placeholder — don't widen it without asking.
 */
export const MIN_SPEED_PERCENT = 5;
export const MAX_SPEED_PERCENT = 400;
export const SPEED_PERCENT_STEP = 5;

/** Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:73-76. */
export function clampSpeedPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(MAX_SPEED_PERCENT, Math.max(MIN_SPEED_PERCENT, Math.round(value)));
}

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:78-97
 *
 * WHY these particular defaults: they are what tldraw — and the donor's own
 * stock navigation contract (`canvasCamera.ts`) — already did, so a fresh
 * load behaves exactly like before and the feature only ever shows up once
 * someone opts into a change. Plain wheel pans the canvas vertically, Ctrl/
 * Cmd + wheel zooms — the same convention the donor's `wheel_zoom_smoke.mjs`
 * pinned as the product's first-run contract. `pasteUnderCursor` is on
 * because that is what the donor's `pasteAtCursor.ts` already,
 * unconditionally, did.
 *
 * Frozen at both levels (`bindings` too) so nobody can mutate the shared
 * default in place — callers that need a mutable copy go through
 * `parseStoredGestureSettings`, which never hands this object back directly.
 */
export const DEFAULT_GESTURE_SETTINGS: GestureSettings = Object.freeze({
  pasteUnderCursor: true,
  bindings: Object.freeze({
    wheelDown: "pan-down",
    wheelUp: "pan-up",
    ctrlWheelDown: "zoom-out",
    ctrlWheelUp: "zoom-in",
  }),
  panSpeedPercent: 100,
  zoomSpeedPercent: 100,
});

/** A fresh, unfrozen deep copy of the defaults — never the frozen singleton itself. */
function cloneDefaultGestureSettings(): GestureSettings {
  return {
    ...DEFAULT_GESTURE_SETTINGS,
    bindings: { ...DEFAULT_GESTURE_SETTINGS.bindings },
  };
}

interface StoredGestureSettings extends GestureSettings {
  version: 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommand(value: unknown): value is WheelCommand {
  return typeof value === "string" && value in WHEEL_COMMAND_LABELS;
}

function isSpeedPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= MIN_SPEED_PERCENT && value <= MAX_SPEED_PERCENT;
}

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:116-155
 *
 * Read persisted settings, repairing anything unrecognised back to the
 * default — one field at a time. The donor's own comment explains why: a
 * binding added in a later version, or one hand-edited to nonsense, should
 * cost the user that one binding, not silently reset the whole record. A
 * top-level field that is PRESENT but the wrong type is different — that is
 * evidence the whole record is corrupt or from an incompatible version, so it
 * resets everything, same as an unrecognised `version`.
 *
 * Unlike the donor, this never returns the frozen `DEFAULT_GESTURE_SETTINGS`
 * singleton (or its frozen `bindings`) — every path here returns a fresh,
 * mutable object, matching this trunk's `appSettings.ts` convention.
 */
export function parseStoredGestureSettings(value: unknown): GestureSettings {
  if (!isRecord(value) || value.version !== 1) return cloneDefaultGestureSettings();
  const { pasteUnderCursor, bindings, panSpeedPercent, zoomSpeedPercent } = value;

  if (
    (pasteUnderCursor !== undefined && typeof pasteUnderCursor !== "boolean")
    || (bindings !== undefined && !isRecord(bindings))
    || (panSpeedPercent !== undefined && !isSpeedPercent(panSpeedPercent))
    || (zoomSpeedPercent !== undefined && !isSpeedPercent(zoomSpeedPercent))
  ) {
    return cloneDefaultGestureSettings();
  }

  const repairedBindings: Record<WheelGesture, WheelCommand> = { ...DEFAULT_GESTURE_SETTINGS.bindings };
  if (isRecord(bindings)) {
    for (const gesture of Object.keys(repairedBindings) as WheelGesture[]) {
      const candidate = bindings[gesture];
      if (isCommand(candidate)) repairedBindings[gesture] = candidate;
    }
  }

  return {
    pasteUnderCursor: typeof pasteUnderCursor === "boolean"
      ? pasteUnderCursor
      : DEFAULT_GESTURE_SETTINGS.pasteUnderCursor,
    bindings: repairedBindings,
    panSpeedPercent: isSpeedPercent(panSpeedPercent)
      ? clampSpeedPercent(panSpeedPercent)
      : DEFAULT_GESTURE_SETTINGS.panSpeedPercent,
    zoomSpeedPercent: isSpeedPercent(zoomSpeedPercent)
      ? clampSpeedPercent(zoomSpeedPercent)
      : DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
  };
}

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:157-166,
 * adapted to this trunk's storage-adapter convention (`appSettings.ts`'s
 * `readAppSettings`) instead of the donor's `window.localStorage` default
 * parameter — see the file header for why the default-parameter form doesn't
 * travel. A null storage, a throwing `getItem` (private window, blocked site
 * data) or corrupt JSON all fall back to the defaults. Never throws.
 */
export function readGestureSettings(storage: Pick<Storage, "getItem"> | null): GestureSettings {
  if (!storage) return DEFAULT_GESTURE_SETTINGS;
  try {
    const stored = storage.getItem(GESTURE_SETTINGS_STORAGE_KEY);
    return stored === null ? DEFAULT_GESTURE_SETTINGS : parseStoredGestureSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_GESTURE_SETTINGS;
  }
}

/**
 * Ported from /home/bam/systemsketch/src/settings/gestureSettings.ts:168-180,
 * adapted to this trunk's storage-adapter convention: `(storage, settings)`
 * argument order and a `void` return, matching `appSettings.ts`'s
 * `writeAppSettings` rather than the donor's `(settings, storage)` and its
 * return-the-settings-back shape (host-owned persistence does not need to
 * hand anything back — see the file header). A null storage or a throwing
 * `setItem` (private mode, quota, a blocked origin) is swallowed — none of
 * that should stop the setting working for THIS session. Never throws.
 */
export function writeGestureSettings(storage: Pick<Storage, "setItem"> | null, settings: GestureSettings): void {
  if (!storage) return;
  const stored: StoredGestureSettings = { version: 1, ...settings };
  try {
    storage.setItem(GESTURE_SETTINGS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Swallowed on purpose — see the doc comment above.
  }
}

/**
 * Ported from /home/bam/systemsketch/src/settings/InterfaceSettings.tsx:984-991
 *
 * The predicate the donor inlined directly on its Reset button's `disabled`.
 * Lifted here so a view can drive the same "is there anything to reset"
 * question without recreating the inline `&&` chain — and so the two can
 * never drift apart.
 */
export function gestureSettingsAreDefault(settings: GestureSettings): boolean {
  return (
    settings.panSpeedPercent === DEFAULT_GESTURE_SETTINGS.panSpeedPercent
    && settings.zoomSpeedPercent === DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent
    && settings.pasteUnderCursor === DEFAULT_GESTURE_SETTINGS.pasteUnderCursor
    && WHEEL_GESTURES_IN_ORDER.every((gesture) => settings.bindings[gesture] === DEFAULT_GESTURE_SETTINGS.bindings[gesture])
  );
}
