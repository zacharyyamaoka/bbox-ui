// src/editor/interfaceScale.ts — pure model for SystemSketch's UI-scale
// preference (the "Saved on this computer" slider that resizes the whole
// interface — distinct from tldraw's own canvas zoom, which this file never
// touches).
//
// Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:4-106.
// Storage key, min/max/step/default and parse semantics are the donor's,
// CHARACTER FOR CHARACTER. WHY: keeping "systemsketch.interface-scale.v1"
// means a browser that already saved this preference keeps it after the
// move to this app; a new key would silently reset everyone back to 100%.
//
// NOTHING FROM REACT TRAVELS. Per this repo's host-contract law (CLAUDE.md,
// "The core imports no canvas engine") and the precedent already written
// out in this directory's `toolPreferences.ts` header, host-owned
// persistence and subscription do not travel with a ported model. Dropped:
// `useSyncExternalStore`, the module-level `snapshot`/`hydrated`/`listeners`
// singleton, `subscribe`, and `getInterfaceScale`/`updateInterfaceScale`/
// `useInterfaceScale`. A host that wants a live, subscribable value writes
// its own store around `readInterfaceScale`/`writeInterfaceScale`.
//
// Also DROPPED: the donor's `markPromotedPreferenceDirty` call inside
// `writeInterfaceScale` (donor :54-57). That call is SystemSketch's own
// server-promotion handshake — see
// /home/bam/systemsketch/src/promotedWorkspaceState.ts — marking a locally
// edited preference so a later promotion from the server does not clobber
// it. This app has no promotion pipeline, so the call has no target here.
//
// `readInterfaceScale`/`writeInterfaceScale` never throw: a null storage or
// a throwing `getItem`/`setItem` (private window, blocked site data) falls
// back to the default / becomes a no-op, matching this directory's
// `appSettings.ts`.

export const INTERFACE_SCALE_STORAGE_KEY = "systemsketch.interface-scale.v1";
export const MIN_INTERFACE_SCALE = 80;
export const MAX_INTERFACE_SCALE = 160;
export const INTERFACE_SCALE_STEP = 5;
export const DEFAULT_INTERFACE_SCALE = 100;

/** The slider's quick-pick chevron values. Ported from donor :9. */
export const INTERFACE_SCALE_PRESETS: readonly number[] = [90, 100, 110, 125, 150];

// Ported from donor :16-18.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Clamps to [MIN_INTERFACE_SCALE, MAX_INTERFACE_SCALE] and snaps to the
 * nearest INTERFACE_SCALE_STEP. Non-finite or non-number input (a corrupt
 * stored value, a stray NaN off a slider) falls back to the default rather
 * than clamping garbage into range.
 * Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:20-24.
 */
export function normalizeInterfaceScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_INTERFACE_SCALE;
  const stepped = Math.round(value / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP;
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, stepped));
}

/**
 * Accepts only `{ version: 1, percent: number }`; anything else (an older
 * schema, a corrupt record, a bare number, a non-record) resets to the
 * default. A valid `percent` still runs through `normalizeInterfaceScale`
 * so a hand-edited localStorage value can't smuggle an out-of-range or
 * off-step scale in.
 * Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:26-31.
 */
export function parseStoredInterfaceScale(value: unknown): number {
  if (!isRecord(value) || value.version !== 1 || typeof value.percent !== "number") {
    return DEFAULT_INTERFACE_SCALE;
  }
  return normalizeInterfaceScale(value.percent);
}

/**
 * Reads INTERFACE_SCALE_STORAGE_KEY through `parseStoredInterfaceScale`. A
 * null storage, a throwing `getItem` (private window, blocked site data) or
 * corrupt JSON all fall back to DEFAULT_INTERFACE_SCALE. Never throws.
 * Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:33-44.
 */
export function readInterfaceScale(storage: Pick<Storage, "getItem"> | null): number {
  if (!storage) return DEFAULT_INTERFACE_SCALE;
  try {
    const stored = storage.getItem(INTERFACE_SCALE_STORAGE_KEY);
    return stored === null ? DEFAULT_INTERFACE_SCALE : parseStoredInterfaceScale(JSON.parse(stored));
  } catch {
    return DEFAULT_INTERFACE_SCALE;
  }
}

/**
 * Normalizes `percent` and writes it under INTERFACE_SCALE_STORAGE_KEY,
 * returning the normalized value actually stored so a caller can reconcile
 * its own state with what was clamped/snapped. A null storage or a
 * throwing `setItem` (quota, blocked site data) is swallowed — interface
 * scale is a convenience preference, never a reason to block drawing.
 * Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:46-62
 * (the donor's `markPromotedPreferenceDirty` call, :54-57, is dropped —
 * see header).
 */
export function writeInterfaceScale(storage: Pick<Storage, "setItem"> | null, percent: number): number {
  const normalized = normalizeInterfaceScale(percent);
  if (!storage) return normalized;
  try {
    storage.setItem(INTERFACE_SCALE_STORAGE_KEY, JSON.stringify({ version: 1, percent: normalized }));
  } catch {
    // Swallowed on purpose — see the doc comment above.
  }
  return normalized;
}

/**
 * The scale factor and its inverse as CSS custom-property strings: `scale`
 * multiplies the interface up, `inverse` un-scales anything that must stay
 * physically sized (e.g. a fixed-width sidebar) inside a scaled ancestor.
 * Ported from /home/bam/systemsketch/src/settings/interfaceScale.ts:97-106.
 */
export function interfaceScaleCssValues(percent: number): { scale: string; inverse: string } {
  const normalized = normalizeInterfaceScale(percent);
  return {
    scale: String(normalized / 100),
    inverse: String(100 / normalized),
  };
}
