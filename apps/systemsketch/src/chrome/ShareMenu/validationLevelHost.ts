// src/chrome/ShareMenu/validationLevelHost.ts — the live, subscribable half of
// the connection-validation setting, and the one place the stored record
// becomes a `ValidationLevel` the rest of the app can obey.
//
// Zach, ruling 3: "have the connection validation setting in the settings panel
// so you can switch between what level of linting you want from whiteboard,
// where anything goes to like evalid code, etc."
//
// WHAT WAS ALREADY THERE, and is NOT rebuilt here: the four rungs and what each
// one means (`@trunk/scene/validationLevel`, with its 221-line test and its
// story), the nine switches underneath them (`@trunk/components/edgePolicy`,
// key `systemsketch.edgePolicy.v1`), and the settings rows that render both
// (`@trunk/components/settingsCategories`). What did NOT exist is the READ
// side. Measured 2026-09-21, before this file: `lintSceneAtLevel` and
// `validateConnectionAtLevel` had ZERO callers outside their own test and
// story, `chrome/problems.ts:234` called `lintScene` with no rules at all, and
// `shapes/wire/wireGesture.ts:236` hardcoded `{ allowFanIn: true }`. So the
// level was a sentence in a dialog and the board never heard about it — the
// same shape as the interface-scale bug of 2026-09-20 and the wheel-convention
// bug of 2026-09-21, and this file is the same answer those two got.
//
// WHY a module store rather than React state, and why in the host: the
// two-surface problem `./interfaceScaleHost.tsx` and `./cameraGestureHost.tsx`
// already solve this way. The Settings dialog WRITES and unmounts; the Problems
// panel and the wire gesture READ and never unmount; they share no subtree. The
// trunk models drop React on purpose ("A host that wants a live, subscribable
// value writes its own store around read/write"), so the store belongs here.
// `./appSettings.tsx`'s `usePersistedRecord` — which is what held the edge
// policy until this file — keeps its value in local `useState`, invisible to
// anything that is not that dialog, which is precisely the bug being closed.
//
// WHY the LEVEL is derived from the nine switches rather than persisted beside
// them: the switches are the source of truth (`settingsCategories.tsx`'s own
// rule at `edge-policy-preset` — "a preset is a shortcut into the same nine
// switches, never a second source of truth"). Storing the level too would let
// the two disagree, and the settings row already knows how to say "Custom".
import { useSyncExternalStore } from "react";

import {
  EDGE_POLICY_STORAGE_KEY,
  DEFAULT_EDGE_POLICY,
  edgePolicyPreset,
  matchingEdgePolicyPreset,
  readEdgePolicy,
  writeEdgePolicy,
  type EdgePolicy,
} from "@trunk/components/edgePolicy";
import {
  DEFAULT_VALIDATION_LEVEL,
  isValidationLevel,
  type ValidationLevel,
} from "@trunk/scene/validationLevel";

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

let snapshot: EdgePolicy | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

/** The stored nine switches. Cached so `useSyncExternalStore` sees a stable
 *  reference between writes — a fresh object every read would re-render the
 *  Problems panel on every tick. */
export function getEdgePolicy(): EdgePolicy {
  if (snapshot === null) snapshot = readEdgePolicy(viewerStorage());
  return snapshot;
}

/** Merge a patch into the stored record and tell every subscriber. Returns what
 *  was actually stored. */
export function patchEdgePolicy(patch: Partial<EdgePolicy>): EdgePolicy {
  const next = { ...getEdgePolicy(), ...patch };
  writeEdgePolicy(viewerStorage(), next);
  snapshot = next;
  announce();
  return next;
}

/**
 * Which rung the nine switches ARE.
 *
 * WHY "Custom" falls back to the shipped default rather than refusing to
 * answer: both consumers need a level on every call — the linter cannot lint
 * "nothing" and the gate cannot judge "nothing" — and this is the reading the
 * settings dialog has already been printing to the user in that case ("Custom —
 * linting follows the nearest level it can"). Stated once, here, so the
 * sentence in the dialog and the behaviour on the board cannot disagree.
 *
 * KNOWN GAP, stated rather than hidden: a custom combination of the nine
 * switches therefore governs the settings ROW and not the board. Closing it
 * means giving `ValidationLevel` a fifth, caller-supplied rung, which is a
 * change to the trunk's vocabulary and not this lane's call to make.
 */
export function validationLevelOf(policy: EdgePolicy): ValidationLevel {
  const preset = matchingEdgePolicyPreset(policy);
  return preset !== null && isValidationLevel(preset) ? preset : DEFAULT_VALIDATION_LEVEL;
}

/** The level the board is meant to be obeying right now, for an imperative
 *  reader — the wire gesture, which is asked at pointer-up and has no render
 *  pass to hang a hook on. The counterpart of
 *  `./cameraGestureHost.tsx`'s `currentCameraGesturePlan`. */
export function currentValidationLevel(): ValidationLevel {
  return validationLevelOf(getEdgePolicy());
}

/** Set the level by writing the rung's nine switches — the exact call the
 *  settings row's preset buttons make (`appSettings.tsx`'s
 *  `onEdgePolicyPreset`), exported so a test can put the app on a level the
 *  same way a person does rather than by poking storage. */
export function setValidationLevel(level: ValidationLevel): EdgePolicy {
  return patchEdgePolicy(edgePolicyPreset(level).policy);
}

/**
 * Drop the snapshot so the next read comes off storage again.
 *
 * WHY exported rather than test-only-by-convention: a module store outlives a
 * React unmount, so a suite that mounts the app twice with different stored
 * policies would otherwise judge the second mount against the first one's
 * cached record. `./cameraGestureHost.tsx` has the same seam for the same
 * reason.
 */
export function resetValidationLevelCache(): void {
  snapshot = null;
  announce();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-TAB writes only: `storage` never fires in the tab that wrote it, so
  // this is not the same-tab path (that is `patchEdgePolicy` above). It is here
  // so a second window of the same board does not keep refusing a cable the
  // user has just legalised in another one.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) {
      resetValidationLevelCache();
      return;
    }
    if (event.key !== EDGE_POLICY_STORAGE_KEY) return;
    snapshot = readEdgePolicy(viewerStorage());
    announce();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored nine switches, live, with their writer — what the Settings
 *  dialog binds its rows to. */
export function useEdgePolicy(): [EdgePolicy, (patch: Partial<EdgePolicy>) => void] {
  const value = useSyncExternalStore(subscribe, getEdgePolicy, () => DEFAULT_EDGE_POLICY);
  return [value, patchEdgePolicy];
}

/** The level, live — what a rendering reader (the Problems panel) binds to, so
 *  changing the setting re-lints the board without a reload. */
export function useValidationLevel(): ValidationLevel {
  return validationLevelOf(useEdgePolicy()[0]);
}
