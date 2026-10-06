// src/chrome/ShareMenu/cameraGestureHost.tsx — the live, subscribable half of the
// wheel preferences, and the one place they are APPLIED to the canvas.
//
// Zach, ruling 2: "Please add the option within settings to do the remapping.
// its about giving the user flexibility to do what they want."
//
// The options and their persistence were already done and are NOT rebuilt here
// — `@trunk/components/appearancePreferences` and
// `@trunk/components/gestureSettings` are character-for-character ports of the
// donor models, and `./appSettings.tsx` has been writing through them since the
// port. What was missing is exactly what was missing for interface scale on
// 2026-09-20 (see `./interfaceScaleHost.tsx`'s header): the READ side. Measured
// 2026-09-21, before this file existed, `apps/systemsketch/src` contained zero
// occurrences of `setCameraOptions` and exactly one of `readGestureSettings` —
// the Settings dialog reading its own control back. So every wheel preference
// saved correctly and moved nothing.
//
// WHY a module store rather than React state, and why in the host: the same
// two-surface problem `./interfaceScaleHost.tsx` and `./preferences.ts` already
// solve this way. The Settings dialog WRITES and unmounts; the editor READS and
// never unmounts; they share no subtree. The trunk models drop React on purpose
// ("A host that wants a live, subscribable value writes its own store around
// read/write"), so the store belongs here.
//
// WHY the applier is an `install(editor)` returning a stop, not a hook: that is
// this app's own seam for anything that touches the editor imperatively
// (`App.tsx`'s `handleMount` composes `kit.install(editor)` and
// `installArrowPresets(editor)` exactly this way), and it keeps the wheel
// preference out of the render path entirely.
import { useSyncExternalStore } from "react";
import type { Editor } from "tldraw";

import {
  APPEARANCE_PREFERENCES_STORAGE_KEY,
  DEFAULT_APPEARANCE_PREFERENCES,
  readAppearancePreferences,
  writeAppearancePreferences,
  type AppearancePreferences,
} from "@trunk/editor/appearancePreferences";
import { cameraGesturePlan, type CameraGesturePlan } from "@trunk/editor/cameraGestures";
import {
  DEFAULT_GESTURE_SETTINGS,
  GESTURE_SETTINGS_STORAGE_KEY,
  readGestureSettings,
  writeGestureSettings,
  type GestureSettings,
} from "@trunk/editor/gestureSettings";

/** The browser's own storage, or `null` when even touching it throws — the same
 *  adapter every other file in this folder uses, for the same reason: a
 *  preference is helpful feedback, never a reason to block drawing. */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let appearanceSnapshot: AppearancePreferences | null = null;
let gestureSnapshot: GestureSettings | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

export function getAppearancePreferences(): AppearancePreferences {
  if (appearanceSnapshot === null) appearanceSnapshot = readAppearancePreferences(viewerStorage());
  return appearanceSnapshot;
}

export function getGestureSettings(): GestureSettings {
  if (gestureSnapshot === null) gestureSnapshot = readGestureSettings(viewerStorage());
  return gestureSnapshot;
}

/** Merge a patch into the stored appearance record and tell every subscriber.
 *  Returns what was actually stored. */
export function patchAppearancePreferences(patch: Partial<AppearancePreferences>): AppearancePreferences {
  const next = { ...getAppearancePreferences(), ...patch };
  writeAppearancePreferences(viewerStorage(), next);
  appearanceSnapshot = next;
  announce();
  return next;
}

/** The same, for the gesture record. */
export function patchGestureSettings(patch: Partial<GestureSettings>): GestureSettings {
  const next = { ...getGestureSettings(), ...patch };
  writeGestureSettings(viewerStorage(), next);
  gestureSnapshot = next;
  announce();
  return next;
}

/**
 * Drop both snapshots so the next read comes off storage again.
 *
 * WHY this is exported rather than test-only-by-convention: a module store
 * outlives a React unmount, so a suite that mounts the app twice with different
 * stored preferences would otherwise judge the second mount against the first
 * one's cached record. `./preferences.ts` has the same seam for the same reason.
 */
export function resetCameraGestureCache(): void {
  appearanceSnapshot = null;
  gestureSnapshot = null;
  announce();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-TAB writes only: `storage` never fires in the tab that wrote it, so
  // this is not the same-tab path (that is the two `patch…` calls above). It is
  // here so a second window of the same board does not sit on a stale wheel
  // convention until reload — the donor's own singleton has the same listener.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) {
      resetCameraGestureCache();
      return;
    }
    if (event.key === APPEARANCE_PREFERENCES_STORAGE_KEY) {
      appearanceSnapshot = readAppearancePreferences(viewerStorage());
      announce();
    } else if (event.key === GESTURE_SETTINGS_STORAGE_KEY) {
      gestureSnapshot = readGestureSettings(viewerStorage());
      announce();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored appearance record, live, with its writer. */
export function useAppearancePreferences(): [AppearancePreferences, (patch: Partial<AppearancePreferences>) => void] {
  const value = useSyncExternalStore(subscribe, getAppearancePreferences, () => DEFAULT_APPEARANCE_PREFERENCES);
  return [value, patchAppearancePreferences];
}

/** The stored gesture record, live, with its writer. */
export function useGestureSettings(): [GestureSettings, (patch: Partial<GestureSettings>) => void] {
  const value = useSyncExternalStore(subscribe, getGestureSettings, () => DEFAULT_GESTURE_SETTINGS);
  return [value, patchGestureSettings];
}

/** The plan the canvas is currently meant to be obeying. Exported so a test can
 *  compare the editor's real state against the preference's own arithmetic
 *  rather than a retyped number. */
export function currentCameraGesturePlan(): CameraGesturePlan {
  return cameraGesturePlan(getAppearancePreferences(), getGestureSettings());
}

function samePlan(a: CameraGesturePlan | null, b: CameraGesturePlan): boolean {
  return (
    a !== null
    && a.wheelBehavior === b.wheelBehavior
    && a.invertZoomDirection === b.invertZoomDirection
    && a.panSpeed === b.panSpeed
    && a.zoomSpeed === b.zoomSpeed
  );
}

/**
 * Apply the wheel preferences to `editor`, and keep applying them whenever they
 * change. Returns the stop function `App.tsx`'s `handleMount` collects.
 *
 * WHY it takes TWO tldraw calls and not one — this is the load-bearing bit, and
 * it is measured off tldraw 5.3.2's own wheel handler
 * (@tldraw/editor/dist-cjs/lib/editor/Editor.js:8142-8194, read 2026-09-21):
 *
 *   const inputMode = this.user.getUserPreferences().inputMode;
 *   if (inputMode !== null) wheelBehavior = inputMode === "trackpad" ? "pan" : "zoom";
 *
 * `inputMode` OVERRIDES `cameraOptions.wheelBehavior` outright. Setting the
 * camera option alone would leave the setting silently dead for anyone who had
 * ever touched tldraw's own input-mode control — a control that lies, which is
 * the whole failure this lane exists to end. So the convention is stated on
 * both, in agreement: the camera option is the answer when nothing overrides
 * it, and `inputMode` is the override saying the same thing.
 *
 * `isZoomDirectionInverted` is on the same line of tldraw's source and carries
 * the same catch — `(isZoomDirectionInverted && inputMode === "mouse") ?? false`
 * (Editor.js:8171). It is live ONLY under `inputMode: "mouse"`, which is
 * exactly the zoom convention, which is exactly when `cameraGesturePlan`
 * reports a non-false value. The two agree by construction, not by luck.
 *
 * NOT APPLIED, and deliberately, because tldraw 5.3.2 has no seam for it:
 * `appearance.modifierWheelZoomsOppositely`. The engine already flips the
 * behaviour unconditionally on Ctrl (`if (info.ctrlKey) behavior =
 * wheelBehavior === "pan" ? "zoom" : "pan"`, Editor.js:8159), and the extra
 * thing that preference promises — that Ctrl ALSO reverses the plain wheel's
 * direction — would need this app to own a wheel listener of its own. That is a
 * hand-rolled gesture engine sitting on top of a stock one, which this app does
 * not do (`App.tsx`'s own thesis, and `document/stockBoundary.test.ts`). Left
 * inert and named here rather than quietly half-wired.
 *
 * The four wheel BINDINGS (`gestures.bindings`, e.g. wheelUp → undo) are
 * likewise not applied: they are a different feature — arbitrary command
 * rebinding — and they need the same host-owned listener. Ruling 2 asked for
 * the two conventions, and the two conventions are what this applies.
 */
/**
 * Apply `gestures.pasteUnderCursor` to tldraw's own paste placement, and keep
 * applying it whenever the preference changes. Returns the stop function
 * `App.tsx`'s `handleMount` collects.
 *
 * WHY this is a SECOND installer rather than two more lines inside
 * `installCameraGestures`: that function early-returns on an unchanged
 * `CameraGesturePlan` (`samePlan`, so an unrelated preference write does not
 * re-commit the camera and stop an animation). A paste write folded in there
 * would be swallowed by exactly the guard that makes the camera cheap — the
 * switch would then work only when a camera field happened to change with it.
 * Paste placement is also not a camera option; it is the same stored record,
 * not the same concern.
 *
 * WHICH tldraw hook this attaches to, and why setting one preference is the
 * WHOLE fix: `isPasteAtCursorMode` is a stock tldraw user preference, and
 * tldraw's own native paste handler is what reads it —
 * `useClipboardEvents.ts:959` (tldraw 5.3.2, read 2026-09-22):
 *
 *     const point = editor.user.getIsPasteAtCursorMode()
 *       ? editor.inputs.getCurrentPagePoint()
 *       : undefined
 *
 * `undefined` is what makes tldraw fall back to the viewport centre, so BOTH
 * sides of this switch are tldraw's own behaviour and neither is hand-rolled
 * here. That handler is mounted because `App.tsx` renders `<Tldraw>` with its
 * UI layer intact (`TldrawUi.tsx:87` calls `useNativeClipboardEvents()`); a
 * `hideUi` host would own its own paste listener and this installer would go
 * quiet, which is why this read belongs in the app and never in the trunk.
 *
 * Ported from /home/bam/systemsketch/src/canvasGestures.ts:144-146
 * (`applyPasteUnderCursor`) — the donor's setting-DRIVEN form. The older
 * /home/bam/systemsketch/src/pasteAtCursor.ts:13 pinned the mode on
 * unconditionally, which is why even the donor's own switch could not turn it
 * back off.
 */
export function installPasteAtCursor(editor: Editor): () => void {
  let applied: boolean | null = null;

  const apply = () => {
    const wanted = getGestureSettings().pasteUnderCursor;
    if (applied === wanted) return;
    applied = wanted;
    editor.user.updateUserPreferences({ isPasteAtCursorMode: wanted });
  };

  apply();
  return subscribe(apply);
}

export function installCameraGestures(editor: Editor): () => void {
  let applied: CameraGesturePlan | null = null;

  const apply = () => {
    const plan = currentCameraGesturePlan();
    // WHY the early return: `setCameraOptions` ends with `setCamera(getCamera())`
    // (Editor.js:2381), so applying an unchanged plan re-commits the camera on
    // every unrelated preference write. Cheap, but it stops an animation.
    if (samePlan(applied, plan)) return;
    applied = plan;
    editor.setCameraOptions({
      wheelBehavior: plan.wheelBehavior,
      panSpeed: plan.panSpeed,
      zoomSpeed: plan.zoomSpeed,
    });
    editor.user.updateUserPreferences({
      inputMode: plan.wheelBehavior === "zoom" ? "mouse" : "trackpad",
      isZoomDirectionInverted: plan.invertZoomDirection,
    });
  };

  apply();
  return subscribe(apply);
}
