// src/components/draftModel.ts — the draft view's bookkeeping half: which
// drafts and pinned versions exist for one document, and where their content
// lives. Pure data; no React, no canvas engine, no diffing.
//
// PORTED from the read-only donor /home/bam/systemsketch (the archived app),
// `src/drafts/draftModel.ts:1-326` — every reducer, key builder, digest and
// naming rule below is that file's, verbatim in behaviour. That file is
// itself the committed successor (commit `baa501eb`, "Add document draft
// branching: Drafts, Compare, Merge, Rebase") to the earlier survivor
// prototype at /home/bam/systemsketch-track-draft-icepanel-quiet/src/drafts/
// draftModel.ts:1-259, which is the same module before `rebaseDraft`, before
// injectable storage, and with a `currentVersionLabel` that never produces
// "v1.0" (see the WHY on that function). The newer file wins, per the
// standing "use the most recent version" rule; the older one is named here
// because it is the prototype Zach did not reject and the one the porting
// brief pointed at.
//
// WHY this module is in the trunk at all, when docs/menus/MENU-KIT-DESIGN.md
// §7 ("Deliberately left out") says "`draftModel.ts` state reducers … are
// SystemSketch's localStorage branching bookkeeping. The kit ships the
// `DraftSummary` prop shape only": that ruling is reversed here by a newer
// and more specific one. Zach, 2026-09-19 (`.claude/feedback.md`): "all of
// the feedback regarding the chrome should be made in bbox-ui
// editor-components, not in system sketch, system sketch should just be
// kinda like importing these stock menus and doing a light bit of
// configuration." `branchChip.tsx` and `draftBar.tsx` already live here, and
// they are controlled components — every one of their props is derived from
// exactly this state machine. Leaving it out does not keep the kit pure; it
// just means each host re-derives "which draft is active, what is the next
// free name, what happens on merge" by hand, and the first one to get it
// subtly wrong inherits nothing from the fix. §7's actual concern — that a
// git-backed host would never want localStorage — is answered instead by
// `DraftStorage` below: the reducers are storage-free, and the five
// functions that do touch storage take the adapter as a required argument.
//
// WHAT CHANGED in the port (two things, both narrowings):
//   1. `DraftStorage` is a REQUIRED parameter, not `= window.localStorage`.
//      The donor could default to a global because it only ever ran inside
//      one app; here a default would reach a global the trunk does not own
//      (§7's "Persistence of any kind" line) AND would throw outright in the
//      `unit` vitest project, which runs in node with no `window`.
//   2. The Tailwind/shadcn house formatting of this directory (double
//      quotes, semicolons, two-space indent) replaces the donor's tabs. No
//      logic moved.
//
// NOT ported, deliberately: `applySerializedBoard.ts` and `draftSnapshot.ts`
// from the same donor directory. Both import `tldraw` (`loadSnapshot`,
// `Editor`, `TLStoreSnapshot`) plus four SystemSketch-internal modules, and
// `src/engineFree.test.ts` walls `components/` off from every canvas engine
// by design. Turning a stored source string into a live board is the host
// adapter's job in every host; only the bookkeeping travels.

/**
 * The slice of `Storage` this module uses. A host passes
 * `window.localStorage`; a test passes a `Map`-backed stub; a git-backed
 * host passes something that is not storage at all.
 */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Slot name for Main's own head snapshot — never a draft id. */
export const MAIN_SNAPSHOT_SLOT = "current";

export interface DraftRecord {
  readonly id: string;
  readonly name: string;
  /** Human label for Main's head at fork time, e.g. "v0.1". */
  readonly baseLabel: string;
  /** Fingerprint of Main's snapshot at fork time; null when Main has no file yet. */
  readonly baseDigest: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface VersionRecord {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly createdAt: number;
  readonly note?: string;
}

export interface DocumentDraftState {
  readonly version: 1;
  readonly activeDraftId: string | null;
  readonly drafts: readonly DraftRecord[];
  readonly versions: readonly VersionRecord[];
}

export const EMPTY_DRAFT_STATE: DocumentDraftState = {
  version: 1,
  activeDraftId: null,
  drafts: [],
  versions: [],
};

// WHY the key namespace still says "systemsketch" in a host-agnostic kit:
// these exact strings are what the archived app already wrote into real
// browsers, and a host that opens the same document should find the drafts
// it left there. The namespace is data the host inherits, not a claim that
// this module is SystemSketch-only — a host with no such history simply
// never reads a key it did not write.
export function draftStateKey(documentPath: string): string {
  return `systemsketch.drafts.v1:${documentPath}`;
}

export function draftSnapshotKey(documentPath: string, slot: string): string {
  return `systemsketch.draftSnapshot.v1:${documentPath}:${slot}`;
}

/** The immutable Main snapshot a draft forked from. */
export function draftBaseSlot(draftId: string): string {
  return `${draftId}:base`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.baseLabel === "string" &&
    (value.baseDigest === null || typeof value.baseDigest === "string") &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isVersionRecord(value: unknown): value is VersionRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "number" &&
    (value.note === undefined || typeof value.note === "string")
  );
}

/**
 * Read the draft/version bookkeeping for one document.
 *
 * WHY every read here is defensive and a failure returns empty state rather
 * than throwing (ported, donor `draftModel.ts:24-30`): a corrupt or blocked
 * record must never stop the canvas from drawing. A malformed INDIVIDUAL
 * record is dropped while its well-formed siblings survive — losing one
 * draft's row is recoverable, losing the whole list is not.
 */
export function parseDraftState(
  documentPath: string,
  storage: DraftStorage,
): DocumentDraftState {
  try {
    const raw = storage.getItem(draftStateKey(documentPath));
    if (!raw) return EMPTY_DRAFT_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return EMPTY_DRAFT_STATE;
    return {
      version: 1,
      activeDraftId: typeof parsed.activeDraftId === "string" ? parsed.activeDraftId : null,
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts.filter(isDraftRecord) : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions.filter(isVersionRecord) : [],
    };
  } catch {
    return EMPTY_DRAFT_STATE;
  }
}

export function saveDraftState(
  documentPath: string,
  state: DocumentDraftState,
  storage: DraftStorage,
): void {
  try {
    storage.setItem(draftStateKey(documentPath), JSON.stringify(state));
  } catch {
    // Storage full or disabled — the canvas keeps working; the next
    // successful write catches persisted state back up.
  }
}

export function readDraftSnapshot(
  documentPath: string,
  slot: string,
  storage: DraftStorage,
): string | null {
  try {
    return storage.getItem(draftSnapshotKey(documentPath, slot));
  } catch {
    return null;
  }
}

export function writeDraftSnapshot(
  documentPath: string,
  slot: string,
  snapshot: string,
  storage: DraftStorage,
): void {
  try {
    storage.setItem(draftSnapshotKey(documentPath, slot), snapshot);
  } catch {
    // ignore, same convention as saveDraftState above
  }
}

export function deleteDraftSnapshot(
  documentPath: string,
  slot: string,
  storage: DraftStorage,
): void {
  try {
    storage.removeItem(draftSnapshotKey(documentPath, slot));
  } catch {
    // ignore
  }
}

/**
 * A stable fingerprint for a serialized board: length plus a djb2 hash, so
 * two snapshots sharing a long prefix still disagree once the tail differs.
 * Not cryptographic — this only ever gates a same-process conflict check
 * (has Main moved since a draft's fork point?), never anything adversarial.
 */
export function snapshotDigest(snapshot: string | null): string | null {
  if (snapshot === null) return null;
  let hash = 5381;
  for (let i = 0; i < snapshot.length; i++) {
    hash = ((hash << 5) + hash) ^ snapshot.charCodeAt(i);
  }
  return `${snapshot.length}:${(hash >>> 0).toString(16)}`;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** "Draft 1", "Draft 2", … — reuses a name a discarded or merged draft freed. */
export function nextDraftName(state: DocumentDraftState): string {
  const used = new Set(state.drafts.map((draft) => draft.name));
  let n = 1;
  while (used.has(`Draft ${n}`)) n++;
  return `Draft ${n}`;
}

/**
 * "v0.1" … "v0.9", "v1.0" … — derived from how many versions are pinned so
 * far rather than stored on its own, so the label can never drift from the
 * count that produces it.
 *
 * WHY the first row is split out instead of one `floor`/`%` over the whole
 * count (ported, donor `draftModel.ts:224-233`): the 0.x row is 9-wide (0.1
 * … 0.9, no "0.0") because a version label is also read before anything has
 * ever been pinned, while every row from 1.x on is the ordinary 10-wide
 * count (#.0 … #.9). The single-expression version the earlier prototype
 * shipped (`v${floor(n/9)}.${(n%9)+1}`, icepanel-quiet
 * `draftModel.ts:164-167`) has to be 9-wide throughout, which lands on
 * "v1.1" straight after "v0.9" and never produces "v1.0" at all.
 */
export function currentVersionLabel(state: DocumentDraftState): string {
  const n = state.versions.length;
  if (n < 9) return `v0.${n + 1}`;
  const rest = n - 9;
  return `v${1 + Math.floor(rest / 10)}.${rest % 10}`;
}

export function createDraft(
  state: DocumentDraftState,
  name: string,
  baseLabel: string,
  baseDigest: string | null,
): { state: DocumentDraftState; draft: DraftRecord } {
  const now = Date.now();
  const draft: DraftRecord = {
    id: generateId(),
    name,
    baseLabel,
    baseDigest,
    createdAt: now,
    updatedAt: now,
  };
  return {
    state: { ...state, activeDraftId: draft.id, drafts: [...state.drafts, draft] },
    draft,
  };
}

/** Enter, resume, or (with `null`) leave a draft. One path for all three. */
export function activateDraft(
  state: DocumentDraftState,
  draftId: string | null,
): DocumentDraftState {
  return { ...state, activeDraftId: draftId };
}

export function renameDraft(
  state: DocumentDraftState,
  draftId: string,
  name: string,
): DocumentDraftState {
  return {
    ...state,
    drafts: state.drafts.map((draft) =>
      draft.id === draftId ? { ...draft, name, updatedAt: Date.now() } : draft,
    ),
  };
}

/**
 * Move a draft's fork point forward after a successful Rebase: Main's
 * current state becomes the draft's new base, so a later Merge or Rebase
 * conflict-checks against it instead of the stale original fork.
 *
 * Bookkeeping only, same as `mergeDraft` below — writing the new base/head
 * content into their storage slots is the host's job, not this module's.
 */
export function rebaseDraft(
  state: DocumentDraftState,
  draftId: string,
  baseLabel: string,
  baseDigest: string | null,
): DocumentDraftState {
  return {
    ...state,
    drafts: state.drafts.map((draft) =>
      draft.id === draftId
        ? { ...draft, baseLabel, baseDigest, updatedAt: Date.now() }
        : draft,
    ),
  };
}

export function discardDraft(
  state: DocumentDraftState,
  draftId: string,
): DocumentDraftState {
  return {
    ...state,
    activeDraftId: state.activeDraftId === draftId ? null : state.activeDraftId,
    drafts: state.drafts.filter((draft) => draft.id !== draftId),
  };
}

export function pinVersion(
  state: DocumentDraftState,
  name: string,
): { state: DocumentDraftState; version: VersionRecord } {
  const version: VersionRecord = {
    id: generateId(),
    label: currentVersionLabel(state),
    name,
    createdAt: Date.now(),
  };
  return { state: { ...state, versions: [...state.versions, version] }, version };
}

/**
 * Merge a draft into Main: drop it from the draft list, clear it as active,
 * and pin a version recording the merge.
 *
 * Bookkeeping only. Writing the draft's content into Main's own snapshot
 * slot and saving the file are the host's job — this module never reads or
 * writes a snapshot itself.
 */
export function mergeDraft(
  state: DocumentDraftState,
  draftId: string,
): DocumentDraftState {
  const draft = state.drafts.find((d) => d.id === draftId);
  if (!draft) return state;
  const version: VersionRecord = {
    id: generateId(),
    label: currentVersionLabel(state),
    name: `Merged ${draft.name}`,
    createdAt: Date.now(),
  };
  return {
    ...state,
    activeDraftId: null,
    drafts: state.drafts.filter((d) => d.id !== draftId),
    versions: [...state.versions, version],
  };
}

/** Convenience lookup — the record `activeDraftId` points at, or null. */
export function activeDraftOf(state: DocumentDraftState): DraftRecord | null {
  return state.drafts.find((draft) => draft.id === state.activeDraftId) ?? null;
}

/**
 * Project the stored state into the `DraftSummary[]` `BranchChip` takes.
 *
 * WHY this projection lives here rather than being re-derived by each host,
 * and why the secondary label is conditional: `branchChip.tsx`'s own
 * `DraftSummary.secondaryLabel` comment names the exact bug it refused to
 * inherit — "the donor's own `baseLabel` is fabricated the moment no version
 * has ever been pinned (every draft read 'based on v0.1' whether or not that
 * meant anything); this kit refuses to guess and takes the finished string
 * instead." That left the guess for the host to get right, which is how the
 * same bug travels. So the rule is decided once, here: a draft says "based
 * on <label>" ONLY when a version carrying that label is genuinely on
 * record; otherwise it says `forkedLabel` ("Forked from Main" by default),
 * which is true whether or not anything has ever been pinned.
 *
 * This is the truthful-rendering rule applied to a derived string: a label
 * may be omitted, never invented.
 */
export function draftSummaries(
  state: DocumentDraftState,
  options: { readonly forkedLabel?: string } = {},
): { id: string; name: string; secondaryLabel: string }[] {
  const forkedLabel = options.forkedLabel ?? "Forked from Main";
  const pinned = new Set(state.versions.map((version) => version.label));
  return state.drafts.map((draft) => ({
    id: draft.id,
    name: draft.name,
    secondaryLabel: pinned.has(draft.baseLabel)
      ? `based on ${draft.baseLabel}`
      : forkedLabel,
  }));
}
