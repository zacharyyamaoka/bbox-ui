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
//
// THE GAP RULING 3 LEFT, AND WHERE IT WAS CLOSED (2026-09-21). The first
// version of this file could only answer with one of the four NAMED rungs, so
// it asked `matchingEdgePolicyPreset` which button the nine switches are and
// fell back to `DEFAULT_VALIDATION_LEVEL` when the answer was "none". It said
// so in its own doc comment rather than hiding it. The consequence, measured:
// flip ONE switch off `strict` and every cable on the board was judged at
// `guided` — looser on six of the nine questions than the person had just
// asked for — while the settings row read "Custom". The four buttons governed
// the board; the nine switches governed a sentence in a dialog.
//
// It is closed by the fifth rung the old comment named:
// `@trunk/scene/validationLevel`'s `customValidationLevel`. `validationLevelOf`
// now returns a NAME when the switches are a button and a SPEC when they are
// not, and `customValidationLevelFor` below is the one place the nine switches
// are read into that spec. The division of labour is unchanged and deliberate:
// the kit owns what a rung MEANS, the host owns what its own controls add up
// to — which is why the reading lives here and not in `scene/`, whose files
// may not import a component's vocabulary.
import { useSyncExternalStore } from "react";

import {
  EDGE_POLICY_STORAGE_KEY,
  DEFAULT_EDGE_POLICY,
  edgePolicyPreset,
  matchingEdgePolicyPreset,
  readEdgePolicy,
  writeEdgePolicy,
  type EdgePolicy,
  type EdgePolicyPresetId,
} from "@trunk/editor/edgePolicy";
import type { ConnectionPolicy } from "@trunk/scene/edgeValidation";
import type { LintRuleId } from "@trunk/scene/lint";
import {
  customValidationLevel,
  isValidationLevel,
  type CustomValidationLevel,
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
 * Which of `lint.ts`'s rules these nine switches ask for AT REST.
 *
 * A permission being OFF is exactly what makes the matching rule worth
 * reporting: if the board will not let you DRAW a loop, a loop already on the
 * board is worth a mark; if loops are fine, marking them up is noise. That is
 * the same relationship the four named rungs already encode field by field
 * (`scene/validationLevel.ts`'s `GUIDED`/`TYPED`/`STRICT`), and
 * `./validationLevelHost.test.ts` pins it by deriving each preset's rung from
 * its own switches and demanding the same verdicts as the named rung.
 *
 * `dangling-edge` is deliberately absent: it runs at every level and
 * `customValidationLevel` adds it back, which is where that rule belongs
 * (nine switches cannot turn it off because no button can either).
 */
function lintRulesOf(policy: EdgePolicy): LintRuleId[] {
  const rules: LintRuleId[] = [];
  if (!policy.allowSamePolarity) rules.push("polarity");
  if (!policy.allowCycles) rules.push("cycle");
  if (!policy.allowDuplicates) rules.push("duplicate-edge");
  if (!policy.allowFanIn) rules.push("many-to-one");
  if (!policy.allowSelfConnection) rules.push("self-connection");
  if (policy.typeMatching !== "off") rules.push("type-mismatch");
  return rules;
}

/**
 * The nine switches as the gates `edgeValidation.ts` understands.
 *
 * SIX of the nine reach the board: `allowCycles`, `allowDuplicates`,
 * `allowSelfConnection`, `allowFanIn`, `allowCrossBoundary` and `typeMatching`.
 * Each was confirmed by a real drag that is refused before the flip and lands
 * after it, or the reverse. The judge's
 * `allowCrossScope` IS the stored `allowCrossBoundary` — one question ("may a
 * cable leave its parent?") under this kit's name and the donor's, an
 * equivalence `scene/validationLevel.test.ts` already pins for the four rungs.
 *
 * THE THREE THAT DO NOT, stated rather than hidden — this is the part of the
 * problem still open after this change.
 *
 * `allowHiddenPorts` and `allowFanOut` have no gate in `edgeValidation.ts` and
 * no rule in `lint.ts`, so flipping either moves nothing on the board.
 *
 * `allowSamePolarity` is the third, and it was missed when this comment was
 * first written — corrected here after a verification pass measured it. It
 * DOES cross into `ConnectionPolicy` structurally, which is why it looked like
 * one of the crossing set, but it decides nothing: out -> out lands at preset
 * `strict` with no switch flipped at all. The reason is written out twice
 * elsewhere in this repo and neither place was reconciled with this comment —
 * `chrome/problems.ts:275-280` ("`polarity` STILL contributes nothing... it
 * needs a `directionOf`, and this document model only states a direction for a
 * FLOATING `ss-port`") and `shapes/wire/wireGesture.ts:410-412` ("Today no
 * port declares a direction so the judge answers `by: \"gesture\"`"). A
 * Block's ports carry no direction field at all — `PortSpecV` is
 * `{id, declaration}`. So this one needs schema vocabulary, not a gate. That is NOT a regression and not new
 * here: the four named rungs have always ignored them too (`ConnectionPolicy`
 * has six fields, not eight), and today's behaviour for those two switches is
 * unchanged. What changes is that it is now honest — the row that reads
 * "Custom" because you flipped `allowFanOut` now behaves like the rung you
 * flipped it off, instead of silently dropping to `guided`. Giving those two
 * an engine means a new gate and a new lint rule, which is its own work.
 */
function connectionPolicyOf(policy: EdgePolicy): ConnectionPolicy {
  return {
    allowSamePolarity: policy.allowSamePolarity,
    allowSelfConnection: policy.allowSelfConnection,
    allowFanIn: policy.allowFanIn,
    allowDuplicates: policy.allowDuplicates,
    allowCycles: policy.allowCycles,
    allowCrossScope: policy.allowCrossBoundary,
  };
}

/**
 * The nine switches as a rung of their own — the fifth, caller-supplied rung,
 * with this host as the caller.
 *
 * Exported so a test can grade it against the four named rungs directly: read
 * a PRESET's own switches through here and the resulting rung must judge every
 * candidate exactly as the named rung does, because the fifth rung is a
 * GENERALISATION of the four and not a second opinion beside them.
 */
export function customValidationLevelFor(policy: EdgePolicy): CustomValidationLevel {
  return customValidationLevel({
    rules: lintRulesOf(policy),
    policy: connectionPolicyOf(policy),
    // `TypeMatching` and `TypeStrictness` are the same three words in the two
    // kits' vocabularies ("off" | "lenient" | "strict"); the structural type
    // check is what keeps them that way.
    types: policy.typeMatching,
  });
}

// One-entry memo, keyed by the stored snapshot's IDENTITY. `getEdgePolicy`
// hands back the same object between writes, so every reader in a render pass
// gets the same rung object — which matters because `useProblems` and
// `dropMenu` both put the level in a `useMemo` dependency list, and a fresh
// object per render would re-lint the whole board on every tick. A caller that
// passes a fresh policy object still gets a correct answer, just not a shared
// one.
let customFor: EdgePolicy | null = null;
let customLevel: CustomValidationLevel | null = null;

/**
 * Which rung the nine switches ARE — a NAME when they are one of the four
 * buttons, and a rung built from the switches themselves when they are not.
 *
 * WHY the four still answer by name rather than everything going through
 * `customValidationLevelFor`: the named rungs are the ones with a story, a
 * 221-line test and a person relying on them, and `===` against a string is
 * what every existing caller, readout and test already does. The custom rung
 * is an addition, not a replacement — so a preset's switches take the exact
 * path they took before this change, and the equality is pinned by test.
 */
export function validationLevelOf(policy: EdgePolicy): ValidationLevel {
  const preset = matchingEdgePolicyPreset(policy);
  if (preset !== null && isValidationLevel(preset)) return preset;
  if (customFor === policy && customLevel !== null) return customLevel;
  const level = customValidationLevelFor(policy);
  customFor = policy;
  customLevel = level;
  return level;
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
export function setValidationLevel(level: EdgePolicyPresetId): EdgePolicy {
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
  customFor = null;
  customLevel = null;
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
