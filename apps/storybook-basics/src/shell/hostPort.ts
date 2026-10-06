// src/shell/hostPort.ts — the one contract the shell talks to a canvas
// through. Design note, with the evidence behind every choice: ./HOST-PORT.md.
//
// PROVENANCE: the surface is derived from the 58 `editor.*` call sites over 34
// distinct methods in /home/bam/bbox-ui/apps/systemsketch/src/chrome/ (measured
// 2026-09-19 with comments stripped), grouped as
// docs/WORK-ORDER-HOST-LESS-SHELL.md §4.3 groups them. Files cited by name
// below exist on disk; nothing here is recalled.
//
// WHY engine-free naming (no `shape`, `page`, `store`, `editor`): a port that
// speaks tldraw cannot be implemented over React Flow without lying, and the
// whole point of two hosts is that one host cannot falsify a contract but two
// can (ARCHITECTURE.md, "Why two engine hosts rather than one").

import type { BlockScene } from "../scene/scene";
import type { Rect, Size } from "../editor/floatingToolbar.placement";

export type { Rect, Size };

/** A node's identity, as the HOST mints it. Opaque to the shell — never
 *  parsed, never constructed, never compared to anything but another id. */
export type NodeId = string;

/**
 * What a host can do beyond the baseline. The shell HIDES an affordance a
 * host lacks rather than erroring, which is what lets the React Flow host
 * arrive one capability at a time (D2, D4).
 *
 * WHY only four, when the work order sketched five: a capability that gates
 * no affordance cannot satisfy its own acceptance case ("a host lacking a
 * capability does not get the affordance" — A0.1), so it is a vacuous flag.
 * `nextStyle` was dropped because §4.2 already rules the next-shape-style
 * machinery stays in the tldraw adapter — the shell can never call it, and
 * `dock.tsx:190-215` shows the real mechanism is a tool VARIANT id, which
 * `tools`/`setTool` already carry. `resize` was dropped because nothing in
 * chrome/'s 2,803 lines resizes, and resizing is interaction geometry, which
 * this repo's line says is host-owned and never travels. Both are one array
 * element away the day an affordance needs them. Full argument: HOST-PORT.md.
 */
export type HostCapability = "history" | "tools" | "duplicate" | "documentIo";

export const HOST_CAPABILITIES: readonly HostCapability[] = ["history", "tools", "duplicate", "documentIo"];

/** What the pointer is doing right now, in words every engine can answer.
 *  Replaces the four `editor.isIn("select.translating"|"resizing"|"brushing")`
 *  reads at `chrome/floatingToolbar.tsx:123`, which is the one place the shell
 *  needs to know — the pill hides mid-gesture. */
export type InteractionPhase = "idle" | "moving" | "resizing" | "selecting";

/** One entry in the host's tool catalogue. A VARIANT is just an id — see the
 *  `nextStyle` note above; `dock.tsx`'s `arrowPresetFromToolId` and
 *  `GEO_VARIANT_IDS` become the adapter's business, not a second concept. */
export interface ToolDescriptor {
  id: string;
  label: string;
  /** Single-key accelerator, if the host binds one. Display only — the shell
   *  never synthesises a keystroke from it. */
  kbd?: string;
  /** Groups variants under one face in the dock (`arrow`, `geo`, …). */
  family?: string;
}

/** A write to one node. `data` is merged, not replaced — the shell only ever
 *  knows the keys it set. */
export interface NodePatch {
  id: NodeId;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
}

export type ViewAction =
  | { kind: "fit"; ids?: readonly NodeId[] }
  | { kind: "zoomTo"; zoom: number };

export type NodeAction =
  | { kind: "update"; patches: readonly NodePatch[] }
  | { kind: "delete"; ids: readonly NodeId[] }
  | { kind: "duplicate"; ids: readonly NodeId[] };

export type LoadResult = { ok: true } | { ok: false; reason: string };

/**
 * The contract. Read through `subscribe` + pulled getters; write through
 * commands only. The shell never mutates host state and never stores a copy
 * of the document (D1).
 *
 * THE STABILITY RULE, which is easy to miss and loud when broken: every
 * getter below MUST return a referentially identical value when called twice
 * with no intervening `subscribe` notification. The shell reads through
 * `useSyncExternalStore`, which throws "The result of getSnapshot should be
 * cached to avoid an infinite loop" otherwise — and `scene()` is DERIVED, so
 * the obvious implementation allocates a fresh `BlockScene` per call and
 * spins the app. A host memoises its own derivation and invalidates on
 * notify. That is the host caching its own work, not the shell keeping a
 * second document, so D1 is intact. `hostContract.ts` checks it.
 */
export interface HostPort {
  readonly capabilities: ReadonlySet<HostCapability>;

  /* -------- read: one subscription, pulled getters -------- */

  /** Fires after any observable change. Returns its own unsubscribe. */
  subscribe(onChange: () => void): () => void;

  /** The scene, DERIVED from the host's own document — never a second copy,
   *  and never containing the host's free-floating helper records (React
   *  Flow's invisible `anchor` nodes are filtered here, not downstream). */
  scene(): BlockScene;

  selection(): { ids: readonly NodeId[]; screenBounds: Rect | null };

  /** `screenBounds` is the canvas container's own box, in container-relative
   *  screen pixels (constraint 6 — there is no `getContainer`). */
  viewport(): { zoom: number; screenBounds: Rect };

  interaction(): InteractionPhase;

  /** `active` is the VARIANT id when the host has variants, so the dock's
   *  face and the engine can never disagree. */
  tools(): { catalogue: readonly ToolDescriptor[]; active: string };

  history(): { canUndo: boolean; canRedo: boolean };

  documentName(): string;

  /* -------- write: commands only -------- */

  select(ids: readonly NodeId[]): void;
  setTool(id: string): void;
  view(action: ViewAction): void;
  nodes(action: NodeAction): void;
  undo(): void;
  redo(): void;

  /** One gesture = one undo step. `undoable: false` is the history-ignoring
   *  write `chrome/variantSwitch.tsx:152` needs (it passes tldraw's
   *  `{ history: "ignore" }`); that call's `ignoreShapeLock` is tldraw-only
   *  and stays in the adapter, which is the stop rule working. */
  transact<T>(label: string, fn: () => T, opts?: { undoable?: boolean }): T;

  setDocumentName(name: string): void;

  /* -------- document: the host's own format (constraint 5) -------- */

  /** Async because the engine's is: `serializeBoard` returns a promise
   *  (`chrome/fileActions.ts:68`, over `serializeTldrawJsonBlob`). */
  serialize(): Promise<string>;

  /** Synchronous because the engine's is: `openBoard` calls
   *  `parseTldrawJsonFile` without awaiting (`chrome/fileActions.ts:167`).
   *  Performs its own history reset and camera fit (`:179-190`). */
  load(text: string): LoadResult;
}

/* ------------------------------------------------------------------ */
/* Affordances — capabilities, resolved into what the shell shows.     */
/* ------------------------------------------------------------------ */

/**
 * Every window the shell can show that a host might not support. The ids are
 * the vocabulary P1's windows are wired with.
 *
 * WHY this is a pure function and not a rendering detail: A0.1 must prove "a
 * host lacking a capability does not get the affordance" in P0, where I3 says
 * the shell has no windows yet. As a function from capabilities to ids it is
 * assertable now; P1's windows consume the SAME function, so A1.5 renders
 * exactly what P0 proved rather than a second, parallel rule.
 */
export const SHELL_AFFORDANCES = {
  "chrome.undoRedo": "history",
  "dock.tools": "tools",
  "dock.preferences": "tools",
  "selection.duplicate": "duplicate",
  "file.open": "documentIo",
  "file.save": "documentIo",
} as const satisfies Record<string, HostCapability>;

export type ShellAffordance = keyof typeof SHELL_AFFORDANCES;

export const ALWAYS_ON_AFFORDANCES = [
  "chrome.boardName",
  "selection.delete",
  "panel.frames",
  "panel.problems",
  "status.zoom",
] as const;

export type AlwaysOnAffordance = (typeof ALWAYS_ON_AFFORDANCES)[number];

/** The affordance ids a given host earns. Unconditional ones are always in. */
export function affordancesFor(port: Pick<HostPort, "capabilities">): ReadonlySet<ShellAffordance | AlwaysOnAffordance> {
  const out = new Set<ShellAffordance | AlwaysOnAffordance>(ALWAYS_ON_AFFORDANCES);
  for (const [affordance, needed] of Object.entries(SHELL_AFFORDANCES) as [ShellAffordance, HostCapability][]) {
    if (port.capabilities.has(needed)) out.add(affordance);
  }
  return out;
}

/** `null` port = "no canvas yet", which is a real state the no-host runner
 *  starts in — not an error. */
export function affordancesForMaybe(port: HostPort | null): ReadonlySet<ShellAffordance | AlwaysOnAffordance> {
  return port ? affordancesFor(port) : new Set();
}
