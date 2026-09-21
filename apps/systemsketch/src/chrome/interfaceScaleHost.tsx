// src/chrome/interfaceScaleHost.tsx — the live, subscribable half of the
// interface-scale preference, and the props that stamp it on the app root.
//
// Zach, 2026-09-20: "As I move the interface scale I would expect for it to
// resize but its not... also I want that interface scale setting to persist."
//
// The persistence half was already done and is NOT rebuilt here:
// `@trunk/components/interfaceScale` is a character-for-character port of the
// donor model (key `systemsketch.interface-scale.v1`, 80-160 in 5% steps,
// default 100), and `./appSettings.tsx` already writes through it on every
// slider move. What was missing is the READ side: the trunk model drops React
// on purpose (its header: "NOTHING FROM REACT TRAVELS... A host that wants a
// live, subscribable value writes its own store around
// `readInterfaceScale`/`writeInterfaceScale`"), and the only reader was a
// `useState` inside the Settings dialog, invisible to `App.tsx`. So the value
// persisted and nothing ever applied it.
//
// WHY a module store (subscribe + snapshot) and not React state, and why here:
// exactly the two-surface problem `./preferences.ts` already solves the same
// way. The Settings slider WRITES (chrome/appSettings.tsx, a dialog that
// unmounts); `App.tsx`'s `<main>` READS to carry the CSS variables (a root
// that never unmounts). They share no subtree, so the value has to live
// outside both. The donor kept its own singleton in the model file
// (/home/bam/systemsketch/src/settings/interfaceScale.ts:64-92,
// `useSyncExternalStore`); this repo's host-contract law puts that half in the
// host, which is this file.
import { useLayoutEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_STORAGE_KEY,
  interfaceScaleCssValues,
  readInterfaceScale,
  writeInterfaceScale,
} from "@trunk/components/interfaceScale";

/** The browser's own storage, or `null` when even touching it throws —
 *  the same adapter `./appSettings.tsx` and `./preferences.ts` use, for the
 *  same reason: a preference is helpful feedback, never a reason to block
 *  drawing. */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let snapshot: number | null = null;
const listeners = new Set<() => void>();

function publish(next: number): void {
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getInterfaceScalePercent(): number {
  if (snapshot === null) snapshot = readInterfaceScale(viewerStorage());
  return snapshot;
}

/**
 * Writes the preference and tells every subscriber. Returns the NORMALIZED
 * value actually stored (clamped to 80-160, snapped to 5) — `writeInterfaceScale`
 * is the only thing that decides that, and echoing the raw request instead
 * would let the slider and the disk disagree by up to 2%.
 */
export function setInterfaceScalePercent(percent: number): number {
  const next = writeInterfaceScale(viewerStorage(), percent);
  publish(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-TAB writes only: `storage` never fires in the tab that wrote it, so
  // this is not the same-tab path (that is `setInterfaceScalePercent` above).
  // It is here so a second window of the same board does not sit at a stale
  // scale until reload — the donor's singleton has the same listener.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== INTERFACE_SCALE_STORAGE_KEY) return;
    publish(readInterfaceScale(viewerStorage()));
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored percent (80-160), live. */
export function useInterfaceScalePercent(): number {
  return useSyncExternalStore(subscribe, getInterfaceScalePercent, () => DEFAULT_INTERFACE_SCALE);
}

/** The FACTOR (1 = 100%) — what CSS and the placement loops actually want. */
export function useInterfaceScale(): number {
  return useInterfaceScalePercent() / 100;
}

/**
 * What `App.tsx` spreads onto its `<main>`: the `data-interface-scale`
 * attribute. The two CSS custom properties are written to the DOCUMENT
 * ELEMENT by the same hook, as a side effect.
 *
 * WHY `document.documentElement` and not the `<main>` the donor uses
 * (`App.tsx:312-319`): every trunk menu, popover and dialog is a Base UI
 * portal to `document.body` (`dropdown-menu.tsx:65`), which is a SIBLING of
 * this app's root, not a descendant — so a variable written on `<main>` does
 * not reach it and `zoom: var(--ss-interface-scale)` on a popup silently
 * resolves to the `:root` fallback of 1. MEASURED at 4340 before this moved:
 * the dock grew to 66px at 150% while the popout it opened stayed 224x148 with
 * a computed `zoom` of exactly "1". The donor never hit this because its own
 * menus portal INSIDE `.tl-container`, under its variable carrier.
 *
 * WHY nothing is zoomed HERE: the document element contains the canvas.
 * Zooming it would scale board geometry and the camera along with the chrome,
 * which is the one thing this feature must not do. The zoom goes on tldraw's
 * two interface layers, which are siblings of `.tl-canvas` — see
 * `src/interface-scale.css`.
 *
 * WHY the attribute stays on the app root: `@trunk/recording/flightRecorder`
 * already reads `document.querySelector('[data-interface-scale]')
 * ?.dataset.interfaceScale` to stamp the scale into a recording. That selector
 * matched nothing until this element carried it.
 */
export function useInterfaceScaleRootProps(): { "data-interface-scale": number } {
  const percent = useInterfaceScalePercent();

  useLayoutEffect(() => {
    const css = interfaceScaleCssValues(percent);
    const root = document.documentElement;
    root.style.setProperty("--ss-interface-scale", css.scale);
    root.style.setProperty("--ss-interface-scale-inverse", css.inverse);
    return () => {
      // Unmount puts the document back exactly as it was found — a test that
      // mounts and unmounts the App must not leave the next one at 150%.
      root.style.removeProperty("--ss-interface-scale");
      root.style.removeProperty("--ss-interface-scale-inverse");
    };
  }, [percent]);

  return { "data-interface-scale": percent };
}
