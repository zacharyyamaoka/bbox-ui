// src/editor/sourceActions.ts — the PURE half of the pyblocks-gated source
// actions: which of "Convert to code" / "Expand to blocks" a selection
// earns, given whether a source backend is connected. The chrome that
// renders them (a `ContextMenuItem` group, a `FloatingToolbar` cluster) is
// the host's; this file returns `MenuAction`-shaped rows so ONE list feeds
// the dropdown AND the context menu and they cannot drift
// (docs/menus/MENU-KIT-DESIGN.md §5, the right-click row). Types FROZEN by
// docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §7; body filled by lane
// `scv-origin-and-actions`. Tests: ./sourceActions.test.ts (off-limits).
//
// Same split as `nodeCatalog.ts` + `edgeDropMenu.tsx` (card 14): pure
// predicate here, no React, no DOM; lives in `src/editor/` because it
// filters a host-authored action set, not a `BlockScene`.
//
// THE GATE (Zach, item 4 of the 2026-09-18 ask: "add the menu items… that
// could appear if pyblocks is enabled"): with no backend the actions are
// ABSENT — never rendered disabled. Same rule `edgeDropMenu.tsx` states for
// its judge: "an entry the judge refuses is never rendered, not merely
// disabled" — an always-present item that no-ops is worse than no item.
// The flag is `backend.kind === PYBLOCKS_BACKEND_KIND` — the contract with
// the pyblocks-backend stream, which owns the backend object; this file
// reads ONE string off it and nothing else.

import type { MenuAction } from "../components/chromeBar";

/** The literal the pyblocks-backend stream's backend object must carry as
 *  `kind` for these actions to appear. */
export const PYBLOCKS_BACKEND_KIND = "pyblocks" as const;

/** The only thing this kit reads off a backend. A host's real backend
 *  object (with its request functions) satisfies this structurally. */
export interface SourceBackendRef {
  readonly kind: string;
}

export const SOURCE_ACTION_IDS = Object.freeze({
  convertToCode: "convert-to-code",
  expandToBlocks: "expand-to-blocks",
} as const);

export type SourceActionId = (typeof SOURCE_ACTION_IDS)[keyof typeof SOURCE_ACTION_IDS];

export const SOURCE_ACTION_LABELS: Readonly<Record<SourceActionId, string>> = Object.freeze({
  "convert-to-code": "Convert to code",
  "expand-to-blocks": "Expand to blocks",
});

export interface SourceActionSelection {
  /** Selected scene node ids, in selection order. */
  nodeIds: readonly string[];
  /** `scene/codeCell.ts`'s `isCodeCell`, pre-bound to the scene by the host. */
  isCodeCell: (nodeId: string) => boolean;
}

export interface SourceActionHandlers {
  convertToCode(nodeIds: readonly string[]): void;
  expandToBlocks(cellId: string): void;
}

export interface SourceAction extends MenuAction {
  id: SourceActionId;
}

/**
 * Rules, exhaustively:
 *   backend null/undefined or `kind !== "pyblocks"`  → `[]` (ABSENT)
 *   `convert-to-code`  present iff ≥1 selected node AND at least one of
 *                      them is NOT a code cell; `run` → `convertToCode(nodeIds)`
 *   `expand-to-blocks` present iff EXACTLY one selected node AND it IS a
 *                      code cell; `run` → `expandToBlocks(thatId)`
 * Order: convert before expand. `label` from `SOURCE_ACTION_LABELS`.
 * `disabled` is never set — an action that does not apply is absent.
 */
export function sourceActionsFor(
  backend: SourceBackendRef | null | undefined,
  selection: SourceActionSelection,
  handlers: SourceActionHandlers,
): SourceAction[] {
  void backend;
  void selection;
  void handlers;
  throw new Error("scv: not implemented — lane scv-origin-and-actions fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}
