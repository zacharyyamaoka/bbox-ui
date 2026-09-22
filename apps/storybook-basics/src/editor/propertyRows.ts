/**
 * src/editor/propertyRows.ts — the row model behind the Compare dialog's
 * Properties table (docs/menus/screenshots/08).
 *
 * Byte-for-byte port of
 * /home/bam/systemsketch/src/compare/propertyRows.ts:1-247. Only its
 * `import type { CompareChange } from './compareModel'` resolves differently
 * here — it points at this directory's own `compareModel.ts` (see that
 * file's header for the one edit it carries: `BlockPort` inlined
 * structurally). Nothing in propertyRows.ts itself changed.
 */

/**
 * The row model behind the property table, ported from the omnibox variant.
 *
 * The `PropertyRow` union below, and the three accessors under it, are that
 * variant's `src/review/boardDiff.ts` verbatim — it is the model Zach picked
 * when he compared the five, and the discriminated union is the load-bearing
 * part: `added` has no `previous` KEY AT ALL, so "the value it used to have"
 * cannot be typed, let alone rendered. The three-state model enforced by the
 * compiler instead of by a convention.
 *
 * WHY the union is copied but its producer is not: omnibox computes these rows
 * from a hardcoded fixture (`reviewFixture.ts` — a demo with canned versions).
 * This track diffs REAL boards read off disk through `compareSource.ts`.
 * Importing omnibox's producer would have swapped live evidence for a mock, so
 * only the row SHAPE crossed over and `propertyRowsOf` below is the adapter
 * that feeds it from this tree's real `CompareChange`. The praised table and
 * the real data both survive; neither one had to win.
 */

import type { CompareChange } from "./compareModel"

/**
 * One row of the property comparison table.
 *
 * A discriminated union, on purpose. `added` has no `previous` key at all, so
 * "the value it used to have" cannot be typed, let alone rendered.
 */
export type PropertyRow =
  | {
      readonly key: string
      readonly state: "added"
      /** The element this row belongs to — a Block or a cable, never a port. */
      readonly element: string
      readonly elementId: string
      /** What changed inside that element: a port, a field, or `port · field`. */
      readonly property: string
      readonly current: string
    }
  | {
      readonly key: string
      readonly state: "removed"
      readonly element: string
      readonly elementId: string
      readonly property: string
      readonly previous: string
    }
  | {
      readonly key: string
      readonly state: "modified"
      readonly element: string
      readonly elementId: string
      readonly property: string
      readonly previous: string
      readonly current: string
    }

/** Read a row's previous value, or `null` where the row asserts absence. */
export function rowPrevious(row: PropertyRow): string | null {
  return row.state === "added" ? null : row.previous
}

/** Read a row's current value, or `null` where the row asserts absence. */
export function rowCurrent(row: PropertyRow): string | null {
  return row.state === "removed" ? null : row.current
}

/**
 * Only a `modified` row has two values to compare, so only a `modified` row can
 * carry a word-level highlight. GitHub's asymmetry rule, one level up: a pure
 * addition has no "green nothing" on the other side to diff against.
 */
export function rowSupportsWordDiff(row: PropertyRow): row is Extract<PropertyRow, { state: "modified" }> {
  return row.state === "modified"
}

/** The state badge's copy, matching the omnibox variant's `OPERATION_LABEL`. */
export const STATE_LABEL: Readonly<Record<PropertyRow["state"], string>> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
}

/**
 * Sort order for the flattened table: added, then removed, then modified.
 *
 * Ported from omnibox's `STATE_ORDER`. Insertions and deletions are the coarse
 * findings a reviewer wants first; a modification is the one they have to read
 * a value to understand, so it reads last.
 */
const STATE_ORDER: Readonly<Record<string, number>> = {
  added: 0,
  removed: 1,
  modified: 2,
}

/** What a whole-object insertion or deletion says in its one populated cell. */
function describeWhole(change: CompareChange, side: "before" | "after"): string {
  const record = side === "before" ? change.recordBefore : change.recordAfter
  if (!record || typeof record !== "object") return change.name
  const props = (record as { props?: Record<string, unknown> }).props ?? record
  const bag = props as Record<string, unknown>
  const parts: string[] = []
  for (const key of ["name", "title", "type", "blockType", "defaultValue"]) {
    const value = bag[key]
    if (typeof value !== "string" || value === "") continue
    parts.push(key === "defaultValue" ? `= ${value}` : value)
  }
  return parts.join(" · ") || change.name
}

/**
 * What a port change is called INSIDE its element.
 *
 * Sliced by the element's own length rather than split on the first `.`, so a
 * Block legitimately named `run.predict` still yields its port name and not the
 * tail of its own title.
 */
function withinElement(change: CompareChange): string | null {
  if (change.subject !== "port") return null
  const prefix = `${change.element}.`
  return change.name.startsWith(prefix) ? change.name.slice(prefix.length) : change.name
}

/**
 * The `Property` column — what changed inside the element.
 *
 * A port and a field are different depths of the same address, so they compose:
 * a retitled Block is `title`, a renamed port is `image`, and a port whose type
 * changed is `image · type`. A whole-object insertion has no property under it
 * at all, and says so with the noun rather than inventing a field name.
 */
function propertyOf(change: CompareChange, path: string | null): string {
  const within = withinElement(change)
  if (path && within) return `${within} · ${path}`
  if (path) return path
  if (within) return within
  return change.subject
}

/** Every row one change contributes, in the omnibox row shape. */
export function propertyRowsOf(change: CompareChange): PropertyRow[] {
  const at = { element: change.element, elementId: change.elementId }
  if (change.kind === "added") {
    return [
      {
        key: change.id,
        state: "added",
        ...at,
        property: propertyOf(change, null),
        current: describeWhole(change, "after"),
      },
    ]
  }
  if (change.kind === "removed") {
    return [
      {
        key: change.id,
        state: "removed",
        ...at,
        property: propertyOf(change, null),
        previous: describeWhole(change, "before"),
      },
    ]
  }
  // A `modified` change with no field pairs cannot say what changed, so it
  // falls back to its whole-object description on both sides rather than
  // rendering an empty pair — which would read as "both sides are blank".
  if (change.fields.length === 0) {
    return [
      {
        key: change.id,
        state: "modified",
        ...at,
        property: propertyOf(change, null),
        previous: describeWhole(change, "before"),
        current: describeWhole(change, "after"),
      },
    ]
  }
  return change.fields.map((field) => ({
    key: `${change.id}:${field.path}`,
    state: "modified" as const,
    ...at,
    property: propertyOf(change, field.path),
    previous: field.before,
    current: field.after,
  }))
}

/**
 * One entry in the Figma-style element list.
 *
 * `status` is deliberately Figma's vocabulary — Added · Edited · Removed — and
 * NOT the table's Added/Removed/Modified. They are different claims at
 * different altitudes: a Block that only gained a port was not itself modified,
 * but it WAS edited, and "Edited" is the word that covers "something under this
 * changed" without asserting the element's own fields moved. The property rows
 * underneath keep the precise three-state vocabulary.
 */
export interface ElementSummary {
  readonly id: string
  readonly name: string
  readonly subject: CompareChange["subject"]
  readonly status: "added" | "edited" | "removed"
  readonly changes: readonly CompareChange[]
  readonly rowCount: number
}

export const ELEMENT_STATUS_LABEL: Readonly<Record<ElementSummary["status"], string>> = {
  added: "Added",
  edited: "Edited",
  removed: "Removed",
}

/**
 * Aggregate the flat change list into the elements a person actually points at.
 *
 * Insertion order follows `orderChanges`, so the list reads added → removed →
 * edited the same way the flat table does; an element is placed by the first
 * change that mentions it.
 */
export function elementSummaries(changes: readonly CompareChange[]): ElementSummary[] {
  const byElement = new Map<string, CompareChange[]>()
  for (const change of orderChanges(changes)) {
    const list = byElement.get(change.elementId) ?? []
    list.push(change)
    byElement.set(change.elementId, list)
  }
  const summaries: ElementSummary[] = []
  for (const [id, group] of byElement) {
    // The element's OWN change, if it has one. A Block that only gained a
    // port contributes no such change, and is `edited` by its children.
    const own = group.find((change) => change.id === id)
    const status: ElementSummary["status"] =
      own?.kind === "added" ? "added" : own?.kind === "removed" ? "removed" : "edited"
    summaries.push({
      id,
      name: group[0].element,
      subject: own?.subject ?? group[0].subject,
      status,
      changes: group,
      rowCount: group.reduce((total, change) => total + propertyRowsOf(change).length, 0),
    })
  }
  return summaries
}

/** The changes, ordered the way the ported table lists them. */
export function orderChanges(changes: readonly CompareChange[]): CompareChange[] {
  return [...changes].sort((a, b) => (STATE_ORDER[a.kind] ?? 9) - (STATE_ORDER[b.kind] ?? 9))
}
