// src/chrome/ShareMenu/cornerPlacementHost.ts — the live, subscribable store
// for the opt-in that pins the bottom-right cluster in the literal corner,
// overriding `../overlay.tsx`'s watermark-avoidance rule.
//
// Zach, 2026-09-22 (daily note, verbatim): "Its fursterating that the right
// panel menu is not in the corner, but I agree that for tldraw we should be
// showing the get a license for production thing... My solution: Lets by
// default have it offset like this. but in settings have a toggle that
// allows you to place it correctly in the corner. but with a warning in red
// saying. TLDRAW requires a license in production and for you to show the
// text. Hiding this is agianst their terms and service. Please only do this
// if you are using it for development."
//
// So `placeCornerCluster`'s watermark-avoidance (`../overlay.tsx`) stays the
// DEFAULT — this store defaults to `false` — and this is only the explicit,
// warned opt-out Zach asked for.
//
// WHY a module store (subscribe + snapshot) and not React state, and why
// here: exactly the two-surface problem `./interfaceScaleHost.tsx`'s own
// header comment explains. The Settings dialog WRITES this value
// (`./appSettings.tsx`, a dialog that unmounts); `../overlay.tsx`'s
// `useCornerPlacement` READS it live (a canvas chrome hook that never
// unmounts while a board is open). They share no subtree, so the value has
// to live outside both, in this file — the same shape `interfaceScaleHost.tsx`
// and `preferences.ts` already use for their own two-surface values.
import { useSyncExternalStore } from "react";

export const CORNER_PLACEMENT_STORAGE_KEY = "systemsketch.corner-placement.v1";

/** The browser's own storage, or `null` when even touching it throws — the
 *  same adapter `./interfaceScaleHost.tsx`, `./appSettings.tsx` and
 *  `./preferences.ts` each carry their own copy of (this repo's convention:
 *  one small copy per file, not a shared helper). A preference is helpful
 *  feedback, never a reason to block drawing. */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Pure, so it is testable with a fake `Storage` and no DOM — the same shape
 * `src/backend/pyblocksConsumer.ts`'s `readStoredSetting` uses for its own
 * unit test. Anything that is not the literal string `"true"` (missing,
 * `"false"`, garbage, a hostile value) reads as `false`, the safe default
 * that keeps tldraw's licence notice clear.
 */
export function readForceCornerPlacement(storage: Storage | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(CORNER_PLACEMENT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Pure counterpart of `readForceCornerPlacement`. Silently no-ops on a
 *  throwing storage — this file's own rule, above. */
export function writeForceCornerPlacement(storage: Storage | null | undefined, next: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(CORNER_PLACEMENT_STORAGE_KEY, next ? "true" : "false");
  } catch {
    // Ignored on purpose — see this file's header.
  }
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The stored choice, read fresh on every call.
 *
 * WHY no cached snapshot, unlike `interfaceScaleHost.tsx`'s number (which
 * reads once and trusts its own writes forever after): that cache is safe
 * there because `setInterfaceScalePercent` is the only writer inside a tab,
 * so the cache and storage can never disagree without a `storage` event to
 * catch it. This value does not have that guarantee — `corner.smoke.test.tsx`'s
 * forced-placement case sets `CORNER_PLACEMENT_STORAGE_KEY` directly and THEN
 * mounts the app, sharing one browser page (and so one copy of this module)
 * with the tests that ran before it, exactly the shape a real tab's devtools
 * or another script could also produce — and `storage` never fires in the tab
 * that wrote it. A `localStorage.getItem` is cheap enough that there is
 * nothing worth trading that correctness for.
 */
export function getForceCornerPlacement(): boolean {
  return readForceCornerPlacement(viewerStorage());
}

/** Writes the preference and tells every subscriber to re-check it. */
export function setForceCornerPlacement(next: boolean): void {
  writeForceCornerPlacement(viewerStorage(), next);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-TAB writes only — see `interfaceScaleHost.tsx`'s identical comment:
  // `storage` never fires in the tab that wrote it (that is
  // `setForceCornerPlacement` above), so this is here so a second window of
  // the same board does not sit at the old placement until reload.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CORNER_PLACEMENT_STORAGE_KEY) return;
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether the person has opted into pinning the bottom-right cluster in the
 *  literal corner, live. The default snapshot (`false`, also what a caller
 *  gets before hydration) keeps `placeCornerCluster`'s watermark-avoidance
 *  rule in charge — this is the exception a person turns on, never the
 *  baseline. */
export function useForceCornerPlacement(): boolean {
  return useSyncExternalStore(subscribe, getForceCornerPlacement, () => false);
}
