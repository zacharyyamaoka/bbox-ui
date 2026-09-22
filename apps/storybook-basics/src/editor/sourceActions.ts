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

import type { MenuAction } from "./chromeBar";

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
  // WHY an empty list and not a list of `disabled: true` rows — the ONE
  // gate, the same shape `edgeDropMenu.tsx` states for its judge ("an entry
  // the judge refuses is never rendered, full stop, not merely disabled"):
  // a greyed-out "Convert to code" teaches a reader that the gesture exists
  // and then refuses to say why it will not run, and the host has no honest
  // sentence to put in a tooltip because the reason lives in a backend that
  // is not connected. Absent is the truthful rendering of "this board has
  // no source backend". `?.` covers null AND undefined in one read.
  if (backend?.kind !== PYBLOCKS_BACKEND_KIND) return [];

  const ids = selection.nodeIds;
  const actions: SourceAction[] = [];

  // Convert before expand — a fixed order, not selection-dependent, so the
  // same gesture is always in the same place under the pointer.
  if (ids.length >= 1 && ids.some((id) => !selection.isCodeCell(id))) {
    actions.push({
      id: SOURCE_ACTION_IDS.convertToCode,
      label: SOURCE_ACTION_LABELS[SOURCE_ACTION_IDS.convertToCode],
      // WHY the ids are COPIED into the closure: `nodeIds` is the host's
      // live selection array, and a `run` fired after the selection moved
      // would collapse whatever is selected then rather than what the menu
      // was opened over. The copy freezes the promise the row made when it
      // was rendered, and leaves the caller's array untouched.
      run: () => handlers.convertToCode([...ids]),
    });
  }

  if (ids.length === 1 && selection.isCodeCell(ids[0])) {
    actions.push({
      id: SOURCE_ACTION_IDS.expandToBlocks,
      label: SOURCE_ACTION_LABELS[SOURCE_ACTION_IDS.expandToBlocks],
      run: () => handlers.expandToBlocks(ids[0]),
    });
  }

  return actions;
}
