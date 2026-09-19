/**
 * src/components/framesOrder.ts — the reorderable ordering behind the Frames
 * panel drag list (docs/menus/screenshots/06).
 *
 * Ported from /home/bam/systemsketch/src/chrome/framesPanelModel.ts:
 *   - `moveItemKey` <- `moveFramesPanelItemKey` (:86-102), renamed generic —
 *     the donor name is Frames-panel-specific, the algorithm is not.
 *   - `ordered` <- `ordered` (:34-37) verbatim — unknown keys sort to the end
 *     (`Number.MAX_SAFE_INTEGER`) in their original relative order, so an item
 *     that predates a saved order is appended rather than hidden or thrown.
 *   - `readOrder` <- `readOrder` (:23-32), generalized to take the metadata
 *     bag and its key directly instead of a tldraw `TLPage` — the donor read
 *     `page.meta[FRAMES_PANEL_ORDER_META_KEY]`, a single fixed key on a
 *     canvas-engine record; a host-agnostic version has to take both as
 *     arguments, since it has no `TLPage` to reach into and no reason to
 *     assume the host's own storage key. Versioned, refuse-unknown ->
 *     "protected": a page written by an older or newer client shape is left
 *     alone rather than silently reinterpreted or dropped.
 *   - `intersects` <- `intersects` (:59-61) verbatim.
 *
 * `clip` is OURS, ad hoc — not in the donor. `intersects` only answers
 * yes/no; a card that wants to draw just the portion of a shape's box that
 * falls inside its own preview viewport (the Frames-panel-style card
 * thumbnail this ordering exists to support) needs the actual overlapping
 * rectangle, not a boolean, so this adds the natural pure-geometry
 * counterpart rather than leaving every host to reimplement rectangle
 * clipping by hand.
 *
 * Deliberately NOT ported: `getFramesPanelModel`, `getFramesPanelPreviews`,
 * `moveFramesPanelItemKey`'s editor-facing sibling `reorderFramesPanelItems`,
 * and `mergeImportedFramesPanelOrder` (donor :40-57, :68-84, :125-136,
 * :111-122) — every one of those takes tldraw's `Editor`/`TLPage` directly,
 * which is exactly the canvas-engine coupling `CLAUDE.md`'s "the core imports
 * no canvas engine" rules out. Those stay host-adapter code, built on top of
 * the pure primitives below.
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type FramesOrderState = { kind: "ready"; order: string[] } | { kind: "protected" }
export type FramesOrderDropPosition = "before" | "after"

const ORDER_VERSION = 1

/**
 * Read a versioned order out of an arbitrary metadata bag under `key`.
 *
 * Absent means "no order has ever been written" and is `ready` with an empty
 * order (`ordered` below then falls back to natural item order). Anything
 * present but not shaped like `{version, order: string[]}` — a stale schema,
 * a hand-edited file, a future client's shape this one does not understand —
 * comes back `protected` so the caller refuses to silently reinterpret or
 * clobber data it cannot prove it understands.
 */
export function readOrder(meta: Record<string, unknown>, key: string): FramesOrderState {
  const value = meta[key]
  if (value === undefined) return { kind: "ready", order: [] }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "protected" }
  const candidate = value as { version?: unknown; order?: unknown }
  if (
    candidate.version !== ORDER_VERSION ||
    !Array.isArray(candidate.order) ||
    candidate.order.some((k) => typeof k !== "string") ||
    new Set(candidate.order).size !== candidate.order.length
  ) {
    return { kind: "protected" }
  }
  return { kind: "ready", order: candidate.order }
}

/** Sort `items` by `keys`' positions; an item with no entry in `keys` keeps its relative place at the end. */
export function ordered<T extends { key: string }>(items: T[], keys: readonly string[]): T[] {
  const positions = new Map(keys.map((key, index) => [key, index]))
  return [...items].sort(
    (a, b) => (positions.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  )
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * ours, ad hoc — clips `a` to the region it shares with `b`, or `null` when
 * they do not overlap at all. The natural pure-geometry pair to `intersects`
 * (yes/no): a preview card that wants to draw only the sliver of a shape's
 * box visible inside its own viewport needs the actual rectangle.
 */
export function clip(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.w, b.x + b.w)
  const bottom = Math.min(a.y + a.h, b.y + b.h)
  if (right <= x || bottom <= y) return null
  return { x, y, w: right - x, h: bottom - y }
}

/** Return a complete, duplicate-free order, or null when the drag was stale. */
export function moveItemKey(
  currentKeys: readonly string[],
  sourceKey: string,
  targetKey: string,
  position: FramesOrderDropPosition,
): string[] | null {
  if (new Set(currentKeys).size !== currentKeys.length || sourceKey === targetKey) return null
  const source = currentKeys.indexOf(sourceKey)
  const target = currentKeys.indexOf(targetKey)
  if (source < 0 || target < 0) return null
  const next = [...currentKeys]
  next.splice(source, 1)
  const nextTarget = next.indexOf(targetKey)
  next.splice(nextTarget + (position === "after" ? 1 : 0), 0, sourceKey)
  return next
}
