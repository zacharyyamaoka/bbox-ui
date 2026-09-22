// src/editor/appearancePreferences.ts — pure model for SystemSketch's
// wheel/zoom input preferences.
//
// MISNOMER, KEPT ON PURPOSE: despite the name and the "appearance" storage
// key, every field here is wheel/zoom INPUT behaviour, not visual
// appearance — the donor renders all of it in its *Canvas* panel
// (/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:857-1114,
// `CanvasPanel`'s "Wheel behavior" / "Wheel gestures" / "Sensitivity"
// sections), never its Appearance panel. The name survives only because the
// storage key "systemsketch.appearance.v1" survives — renaming either would
// either lose a browser's already-saved preference or fork the model from
// its own key.
//
// Ported from /home/bam/systemsketch/src/settings/appearancePreferences.ts:
// 4-124. Storage key, defaults, ranges, step and parse semantics are the
// donor's, CHARACTER FOR CHARACTER. WHY: keeping "systemsketch.appearance.v1"
// means a browser that already chose, say, direct wheel zoom keeps that
// choice after the move to this app.
//
// THE PER-FIELD VS WHOLE-RECORD FALLBACK IS PRESERVED EXACTLY. Donor's own
// comment (:65-68): a field the stored record predates is `undefined`, not
// wrong, and should fall back to its own default without discarding a real
// value already set for every other field; a field that is PRESENT with the
// wrong type means the record is corrupt and the whole thing resets. Same
// for `version !== 1`. Ported unchanged in `parseStoredAppearancePreferences`
// below.
//
// NOTHING FROM REACT TRAVELS. Per this repo's host-contract law (CLAUDE.md,
// "The core imports no canvas engine") and the precedent in this directory's
// `toolPreferences.ts` header, host-owned persistence and subscription do
// not travel with a ported model. Dropped: `useSyncExternalStore`, the
// module-level `snapshot`/`hydrated`/`listeners` singleton,
// `subscribeAppearancePreferences`, and `getAppearancePreferences`/
// `updateAppearancePreferences`/`useAppearancePreferences`. A host that
// wants a live, subscribable value writes its own store around
// `readAppearancePreferences`/`writeAppearancePreferences`.
//
// Also DROPPED: the donor's `markPromotedPreferenceDirty` calls (donor
// :57 of interfaceScale's sibling pattern, here :117-119). That call is
// SystemSketch's own server-promotion handshake — see
// /home/bam/systemsketch/src/promotedWorkspaceState.ts — marking a locally
// edited preference so a later promotion from the server does not clobber
// it. This app has no promotion pipeline, so the call has no target here.
//
// `readAppearancePreferences`/`writeAppearancePreferences` never throw: a
// null storage or a throwing `getItem`/`setItem` (private window, blocked
// site data) falls back to the defaults / becomes a no-op, matching this
// directory's `appSettings.ts`. Unlike the donor, a fallback branch never
// hands back the literal frozen `DEFAULT_APPEARANCE_PREFERENCES` reference
// — matching `appSettings.ts`'s `parseAppSettings` — so every return is a
// fresh, unfrozen copy a caller cannot corrupt the shared default by
// mutating.

export const APPEARANCE_PREFERENCES_STORAGE_KEY = "systemsketch.appearance.v1";
export const DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT = 100;
export const MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT = 50;
export const MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT = 150;
export const WHEEL_ZOOM_SENSITIVITY_STEP = 5;

export interface AppearancePreferences {
  showZoomButtons: boolean;
  /** Start from tldraw's ordinary whiteboard contract: wheel pans, while
   *  Ctrl/Cmd + wheel zooms. Direct wheel zoom is an explicit opt-in for the
   *  spatial convention SystemSketch briefly made universal. */
  directWheelZoom: boolean;
  /** When direct wheel zoom is enabled, moving the wheel down moves closer
   *  to the board. Keep the opposite convention reachable without changing
   *  the board or replacing tldraw's camera behavior. */
  scrollDownZoomsIn: boolean;
  /** In direct mode, keep Ctrl/Cmd + wheel available as an intentionally
   *  opposite zoom gesture instead of tldraw's usual temporary pan. This
   *  lets CAD and stock-whiteboard muscle memory coexist without changing
   *  the unmodified wheel's chosen direction. */
  modifierWheelZoomsOppositely: boolean;
  /** A percentage of tldraw's stock `zoomSpeed: 1`. Keeping the persisted
   *  value in product language makes 100 the obvious, durable reset point. */
  wheelZoomSensitivityPercent: number;
}

/**
 * Ported from /home/bam/systemsketch/src/settings/appearancePreferences.ts:30-36,
 * the donor's literal values.
 */
export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = Object.freeze({
  showZoomButtons: false,
  directWheelZoom: false,
  scrollDownZoomsIn: true,
  modifierWheelZoomsOppositely: false,
  wheelZoomSensitivityPercent: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
});

interface StoredAppearancePreferences extends AppearancePreferences {
  version: 1;
}

// Ported from donor :42-44.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Ported from donor :46-52.
function isWheelZoomSensitivityPercent(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT
    && value <= MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT
    && value % WHEEL_ZOOM_SENSITIVITY_STEP === 0;
}

/**
 * Accepts only `{ version: 1, ...}`; any other version or a non-record
 * resets to the defaults. A field the stored record predates is
 * `undefined`, not wrong — that falls back to ITS OWN default without
 * discarding a real value already set for every other field. A field that
 * is PRESENT with the wrong type means the record is corrupt and the WHOLE
 * record resets. An unrecognized extra key (a retired preference) is
 * silently ignored.
 * Ported from /home/bam/systemsketch/src/settings/appearancePreferences.ts:54-95.
 */
export function parseStoredAppearancePreferences(value: unknown): AppearancePreferences {
  if (!isRecord(value) || value.version !== 1) {
    return { ...DEFAULT_APPEARANCE_PREFERENCES };
  }
  const {
    showZoomButtons,
    directWheelZoom,
    scrollDownZoomsIn,
    modifierWheelZoomsOppositely,
    wheelZoomSensitivityPercent,
  } = value;
  // Ported from donor :65-68, unchanged — see header.
  if (
    (showZoomButtons !== undefined && typeof showZoomButtons !== "boolean")
    || (directWheelZoom !== undefined && typeof directWheelZoom !== "boolean")
    || (scrollDownZoomsIn !== undefined && typeof scrollDownZoomsIn !== "boolean")
    || (modifierWheelZoomsOppositely !== undefined && typeof modifierWheelZoomsOppositely !== "boolean")
    || (wheelZoomSensitivityPercent !== undefined && !isWheelZoomSensitivityPercent(wheelZoomSensitivityPercent))
  ) {
    return { ...DEFAULT_APPEARANCE_PREFERENCES };
  }
  return {
    showZoomButtons: typeof showZoomButtons === "boolean"
      ? showZoomButtons
      : DEFAULT_APPEARANCE_PREFERENCES.showZoomButtons,
    directWheelZoom: typeof directWheelZoom === "boolean"
      ? directWheelZoom
      : DEFAULT_APPEARANCE_PREFERENCES.directWheelZoom,
    scrollDownZoomsIn: typeof scrollDownZoomsIn === "boolean"
      ? scrollDownZoomsIn
      : DEFAULT_APPEARANCE_PREFERENCES.scrollDownZoomsIn,
    modifierWheelZoomsOppositely: typeof modifierWheelZoomsOppositely === "boolean"
      ? modifierWheelZoomsOppositely
      : DEFAULT_APPEARANCE_PREFERENCES.modifierWheelZoomsOppositely,
    wheelZoomSensitivityPercent: isWheelZoomSensitivityPercent(wheelZoomSensitivityPercent)
      ? wheelZoomSensitivityPercent
      : DEFAULT_APPEARANCE_PREFERENCES.wheelZoomSensitivityPercent,
  };
}

/**
 * Reads APPEARANCE_PREFERENCES_STORAGE_KEY through
 * `parseStoredAppearancePreferences`. A null storage, a throwing `getItem`
 * (private window, blocked site data) or corrupt JSON all fall back to a
 * fresh copy of DEFAULT_APPEARANCE_PREFERENCES. Never throws.
 * Ported from /home/bam/systemsketch/src/settings/appearancePreferences.ts:97-108.
 */
export function readAppearancePreferences(storage: Pick<Storage, "getItem"> | null): AppearancePreferences {
  if (!storage) return { ...DEFAULT_APPEARANCE_PREFERENCES };
  try {
    const stored = storage.getItem(APPEARANCE_PREFERENCES_STORAGE_KEY);
    return stored === null
      ? { ...DEFAULT_APPEARANCE_PREFERENCES }
      : parseStoredAppearancePreferences(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_APPEARANCE_PREFERENCES };
  }
}

/**
 * Writes `preferences` under APPEARANCE_PREFERENCES_STORAGE_KEY. A null
 * storage or a throwing `setItem` (quota, blocked site data) is swallowed —
 * these are convenience preferences, never a reason to block drawing.
 * Ported from /home/bam/systemsketch/src/settings/appearancePreferences.ts:110-124
 * (the donor's `markPromotedPreferenceDirty` call, :117-119, is dropped —
 * see header). Unlike the donor, returns void: a caller already holds
 * `preferences`, so handing it back added nothing.
 */
export function writeAppearancePreferences(storage: Pick<Storage, "setItem"> | null, preferences: AppearancePreferences): void {
  if (!storage) return;
  const stored: StoredAppearancePreferences = { version: 1, ...preferences };
  try {
    storage.setItem(APPEARANCE_PREFERENCES_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Swallowed on purpose — see the doc comment above.
  }
}
