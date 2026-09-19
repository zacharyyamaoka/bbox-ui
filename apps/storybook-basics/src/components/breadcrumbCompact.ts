/**
 * src/components/breadcrumbCompact.ts — the compact-path elision rule behind
 * the depth breadcrumb (docs/menus/screenshots/05, the SystemSketch TitleBar's
 * `…` disclosure).
 *
 * `compactDepthBreadcrumbs` is ported verbatim from
 * /home/bam/systemsketch/src/depth/depthBreadcrumbs.ts:1-58 (zero imports,
 * already generic over `{id,name,isCurrent}`). `segmentBreadcrumbs` below is
 * a generalized port of the same file's `segmentBreadcrumbs` helper at
 * /home/bam/systemsketch/src/chrome/TitleBar.tsx:130-160: the donor hardcodes
 * `DepthPathEntry` (which carries a tldraw `TLShapeId`); here it is generic
 * over any `Entry extends DepthBreadcrumbItem`, which is what lets this file
 * import zero canvas-engine types while still recovering the elided run for
 * each `…` disclosure menu, the way `TitleBar.tsx` needs to.
 */

export interface DepthBreadcrumbItem {
  kind?: never
  id: string
  name: string
  isCurrent: boolean
}

export type CompactDepthBreadcrumbItem<Entry extends DepthBreadcrumbItem = DepthBreadcrumbItem> =
  | Entry
  | { kind: "elision"; hiddenCount: number }

const CHARACTER_BUDGET = 150
const SEPARATOR_LENGTH = 3 // ` › `

function pathLength(rootName: string, entries: readonly DepthBreadcrumbItem[]) {
  return rootName.length + entries.reduce((total, entry) => total + SEPARATOR_LENGTH + entry.name.length, 0)
}

/**
 * Keeps the compact chrome useful as a location cue, rather than turning it
 * into a left- or right-truncated filename. The root, immediate parent, and
 * current scope orient a reader; levels immediately after the root are the
 * least useful first removals, while the disclosure retains every ancestor as
 * a jump target.
 */
export function compactDepthBreadcrumbs<Entry extends DepthBreadcrumbItem>(
  rootName: string,
  entries: readonly Entry[],
  budget = CHARACTER_BUDGET,
): CompactDepthBreadcrumbItem<Entry>[] {
  if (pathLength(rootName, entries) <= budget || entries.length < 3) return [...entries]

  const visible = new Set(entries.map((entry) => entry.id))
  // WHY: Keep the root plus immediate local context legible. When space runs
  // out, the earliest descendant is the least actionable location cue, so
  // delete from level 1 forward rather than surprising the reader by hiding a
  // nearer parent.
  for (const entry of entries.slice(0, -2)) {
    if (pathLength(rootName, entries.filter((candidate) => visible.has(candidate.id))) <= budget) break
    visible.delete(entry.id)
  }

  const compacted = entries.filter((entry) => visible.has(entry.id))
  if (compacted.length === entries.length) return compacted

  const result: CompactDepthBreadcrumbItem<Entry>[] = []
  let hiddenCount = 0
  for (const entry of entries) {
    if (visible.has(entry.id)) {
      if (hiddenCount) {
        result.push({ kind: "elision", hiddenCount })
        hiddenCount = 0
      }
      result.push(entry)
    } else {
      hiddenCount += 1
    }
  }
  return result
}

function isElision<Entry extends DepthBreadcrumbItem>(
  entry: CompactDepthBreadcrumbItem<Entry>,
): entry is { kind: "elision"; hiddenCount: number } {
  return typeof entry === "object" && entry !== null && "kind" in entry && entry.kind === "elision"
}

export type CrumbSegment<Entry extends DepthBreadcrumbItem = DepthBreadcrumbItem> =
  | { kind: "entry"; entry: Entry }
  | { kind: "elision"; hidden: Entry[] }

/**
 * `compactDepthBreadcrumbs` reports only how MANY levels it dropped, because
 * the shipped pill draws a dead `…` and sends people to the depth popover for
 * the rest. The Kibo pattern makes that ellipsis a real menu, so the hidden
 * levels have to be recovered — the compacted list keeps source order, so each
 * elision's `hiddenCount` names exactly the next run of skipped entries.
 */
export function segmentBreadcrumbs<Entry extends DepthBreadcrumbItem>(
  rootName: string,
  entries: readonly Entry[],
): CrumbSegment<Entry>[] {
  const segments: CrumbSegment<Entry>[] = []
  let cursor = 0
  for (const item of compactDepthBreadcrumbs(rootName, entries)) {
    if (isElision(item)) {
      segments.push({ kind: "elision", hidden: entries.slice(cursor, cursor + item.hiddenCount) })
      cursor += item.hiddenCount
    } else {
      segments.push({ kind: "entry", entry: item })
      cursor += 1
    }
  }
  return segments
}
