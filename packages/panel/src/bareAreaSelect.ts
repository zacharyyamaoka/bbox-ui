/**
 * packages/panel/src/bareAreaSelect.ts
 *
 * verify-round-4, F1 (tldraw) and F2 (React Flow): "a press on a parent's
 * own bare area, with one of its members selected, selects the parent
 * alone." Both hosts got this wrong the SAME way, for the same underlying
 * reason, so it is fixed here once rather than twice.
 *
 * WHY both bugs are one bug: `render-instance.tsx`'s member wrapper selects
 * a member by calling `onSelect`/`onSelectionChange` DIRECTLY on
 * pointer-down — bypassing the host engine entirely, because tldraw has no
 * shape and React Flow has no node for a member (only a root gets one).
 * That direct call can leave the PAGE's selection pointing at ids the host
 * engine's own selection state has never heard of. Every root-level press
 * in tldraw and React Flow, by contrast, was still left to the host
 * engine's OWN native click machinery, echoed back to the page by a
 * listener that only fires when the engine's own store actually changes
 * (tldraw) or that folds the engine's reported delta into a UNION with
 * whatever the page's selection already was (React Flow). Both designs
 * silently assume the engine's remembered selection and the page's own
 * `selectedIds` agree on ROOTS at all times — an assumption a member
 * selection breaks the moment it makes the page's selection something the
 * engine has no shape/node for:
 *
 *  - tldraw (F1): the page → editor sync effect skips writing the engine's
 *    OWN selection while `editor.inputs.getIsPointing()` is true (a
 *    necessary guard — see tldraw-canvas.tsx's own comment on it, which
 *    protects a drag that starts on a member with nothing selected). A
 *    member press can leave that write permanently deferred with nothing
 *    left to re-trigger it, so the engine's shape selection goes stale
 *    (still the block, say) while the page's selection has moved to a
 *    member. The NEXT press on the block's own bare padding then lands on
 *    a shape tldraw already (per its own stale memory) considers selected
 *    — which produces NO store change at all, so the echo listener that
 *    would tell the page never fires.
 *  - React Flow (F2): a member selection changes the page's `selectedIds`
 *    to include a member id no `node.selected` flag was ever derived from.
 *    The next bare-padding click makes React Flow report `{selected: true}`
 *    for the ROOT's own node id; `onNodesChange` folds that into
 *    `new Set(p.selectedIds)` — a UNION, not a replacement — so the stale
 *    member id survives alongside the freshly-clicked root, and the
 *    inspector shows a two-instance mixed selection instead of the root
 *    alone.
 *
 * The fix in both files is the same shape: a root-level press must stop
 * trusting the host engine's own notion of "what was already selected" and
 * instead fold the press into ONLY the ids that ids the engine itself still
 * recognizes (`isKnownRoot` — "has a shape" for tldraw, "is one of the
 * roots React Flow was handed a node for" for React Flow). Once every
 * leftover member id is filtered out before folding in the new press,
 * neither bug has anywhere left to hide: tldraw's fix additionally calls
 * this directly on pointer-down (the same architecture render-instance.tsx
 * already uses for members) instead of waiting on the engine's own store
 * diff, since that diff is exactly the mechanism F1 showed can go silent.
 */

/**
 * `selectedIds` with every id the host engine does not currently recognize
 * as one of its own root elements dropped — the base to fold a fresh
 * engine-reported (or directly observed) root press into, so a leftover
 * MEMBER id never survives a union with it.
 */
export function priorSelectionForRootPress(selectedIds: readonly string[], isKnownRoot: (id: string) => boolean): string[] {
  return selectedIds.filter(isKnownRoot);
}

export interface RootPress {
  /** The root instance a bare-area press landed on. */
  rootId: string;
  /** A shift/cmd/ctrl press extends the selection; a plain press replaces it. */
  additive: boolean;
  /** The page's selection as it stood the moment the pointer went down. */
  selectedIds: readonly string[];
  /** True for any id the host engine still has a shape/node for. */
  isKnownRoot: (id: string) => boolean;
}

/**
 * The FULL next selection for one discrete root-level press — tldraw's own
 * use (a single synthetic pointer-down, not a stream of deltas; React
 * Flow's own `onNodesChange` instead folds each of its reported deltas into
 * `priorSelectionForRootPress`'s result directly, since a single physical
 * click can arrive as more than one change there).
 */
export function nextSelectionForRootPress(press: RootPress): string[] {
  const kept = priorSelectionForRootPress(press.selectedIds, press.isKnownRoot);
  if (!press.additive) return [press.rootId];
  return kept.includes(press.rootId) ? kept.filter((id) => id !== press.rootId) : [...kept, press.rootId];
}
