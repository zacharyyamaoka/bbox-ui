"use client"

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { ArrowRight, Box, Circle, Frame, Shapes, Square, Type, Waypoints, type LucideIcon } from "lucide-react"

import { cn } from "../lib/utils"
import { wordDiff, type DiffToken } from "./wordDiff"
import type { CompareChange, SubjectKind } from "./compareModel"
import {
  elementSummaries,
  orderChanges,
  propertyRowsOf,
  rowCurrent,
  rowPrevious,
  rowSupportsWordDiff,
  ELEMENT_STATUS_LABEL,
  STATE_LABEL,
  type ElementSummary,
  type PropertyRow,
} from "./propertyRows"
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group"

/**
 * src/editor/propertyTable.tsx — the Compare dialog's Properties view:
 * the "By element"/"Flat table" layout switch, the word-diff toggle, and
 * the table itself (docs/menus/screenshots/08-compare-changes.png).
 *
 * Ported from /home/bam/systemsketch/src/compare/PropertyTable.tsx:1-583,
 * itself ported from the omnibox variant's `src/review/DiffReviewModal.tsx`
 * (`TokenRun`/`ValueCell` verbatim, down to the visual language — "I like
 * the property table in omnibox" is why the class-name provenance is kept
 * as a namespace split in the donor's `review-table.css`, restated below as
 * a comment rather than a second stylesheet namespace since Tailwind has no
 * such split to make).
 *
 * ONE deliberate shape change from the donor, called out because it moves a
 * seam: the donor's `CompareDialog.tsx:848-869` mounted the word-diff
 * checkbox and the layout segmented control OUTSIDE `PropertyTable`, in the
 * dialog shell, and only ever passed `gitHighlight`/`layout` down as
 * read-only props. Per this kit's brief ("propertyTable.tsx — the right
 * rail's Properties view"), both controls move IN: `PropertyTable` now owns
 * its own header and is handed `onGitHighlightChange`/`onLayoutChange`
 * callbacks so the host (`compareReview.tsx`) still owns the state — same
 * host contract, one fewer thing every host has to hand-wire to get "the
 * Properties view" on screen.
 *
 * The three-state colour law travels unparaphrased from `review-table.css`:
 * Added/Removed are GitHub's green/red; the third state is blue, not amber,
 * because
 *
 *   "Blue is much clearer than orange. […] for colors those are very
 *    orthogonal in space RGB right, so blue is natural for a third color."
 *
 * — red, green and blue are the orthogonal axes, and amber sat close enough
 * to red to read as a weak deletion. This app's stock shadcn theme carries
 * no bespoke success/accent-third-state tokens (checked: only
 * `--destructive` exists), so the three states are plain Tailwind
 * green-600/red-600/blue-600 (light) and their -400 dark counterparts,
 * following the same direct-palette convention `packages/inspector`'s
 * `StockCheckReport.tsx` already uses for its own tri-state banners — not a
 * new bbox-specific colour token.
 */

export type TableLayout = "columns" | "figma"

/**
 * The element-list column's width, in the `figma` layout.
 *
 * `DEFAULT` is wide enough to read an ordinary single name ("Controller",
 * "Button 001") without ellipsising, matching Figma's own Layers panel —
 * the reference this layout is deliberately copied from. A compound name
 * like the donor's own `"Plannerv2.plan → Controller.plan"` still won't fit
 * and still ellipsises; that is expected, and Figma's own panel does the
 * same for a name that long.
 *
 * `MIN` is the point below which the row's fixed furniture (icon, count,
 * status chip, and the button's own padding) already eats ~110px, leaving
 * too little for any name to be worth showing at all. `MAX` is the point
 * past which the property table's own Previous/Current columns — the
 * values a reviewer is actually there to read — would be squeezed for the
 * sake of an index list.
 */
const DEFAULT_LIST_WIDTH = 220
const MIN_LIST_WIDTH = 150
const MAX_LIST_WIDTH = 440

/**
 * Which glyph stands for a change's underlying record.
 *
 * Zach's complaint was that a Block, a cable and a stock shape all read as
 * the same anonymous row — "it wasn't clear to me that one was like an
 * edge, one was a node, one was like a rectangle primitive". A
 * `block`/`cable`/`port` subject already says enough on its own; a `shape`
 * subject is this kit's catch-all for every other primitive, so it has to
 * look one level deeper — at the record's own `.type` — to tell a
 * rectangle from a text box from a frame. `Shapes` is the fallback for a
 * stock type this table has no specific glyph for yet, not for "unknown"
 * in general.
 */
function elementIcon(subject: SubjectKind, record: unknown): LucideIcon {
  if (subject === "block") return Box
  if (subject === "cable") return Waypoints
  if (subject === "port") return Circle
  const shapeType = record && typeof record === "object" ? (record as { type?: unknown }).type : undefined
  switch (shapeType) {
    case "text":
      return Type
    case "frame":
      return Frame
    case "arrow":
      return ArrowRight
    case "geo":
      return Square
    default:
      return Shapes
  }
}

/** The record `elementIcon` should read for one flattened property row. */
function rowIcon(change: CompareChange): LucideIcon {
  return elementIcon(change.subject, change.recordAfter ?? change.recordBefore)
}

/**
 * The record `elementIcon` should read for a Figma-list element entry.
 *
 * An element's own change (its id matches the element id) carries the
 * record that actually says what kind of thing it is; a Block that only
 * gained a port has no such change, but `Box` is right for it regardless
 * because `subject` is already `"block"` in that case (`elementSummaries`
 * computes it the same way).
 */
function summaryIcon(element: ElementSummary): LucideIcon {
  const own = element.changes.find((change) => change.id === element.id) ?? element.changes[0]
  return elementIcon(element.subject, own?.recordAfter ?? own?.recordBefore)
}

/** Small, muted — the icon states WHAT changed; the badge states HOW. */
function ElementIcon({ Icon }: { Icon: LucideIcon }) {
  return <Icon className="size-[13px] shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
}

function TokenRun({ tokens }: { tokens: readonly DiffToken[] }) {
  return (
    <>
      {tokens.map((token, index) =>
        token.kind === "same" ? (
          <span key={index}>{token.text}</span>
        ) : (
          <mark
            key={index}
            data-token={token.kind}
            className={cn(
              "rounded-[3px] px-px py-px font-extrabold text-foreground",
              // Highlight, never strikethrough — the substring that
              // actually differs takes a stronger fill; the cell itself is
              // NOT recoloured (GitHub's own word-diff rule).
              token.kind === "removed" && "bg-red-100 shadow-[inset_0_-2px_var(--color-red-600)] dark:bg-red-950 dark:shadow-[inset_0_-2px_var(--color-red-400)]",
              token.kind === "added" && "bg-green-100 shadow-[inset_0_-2px_var(--color-green-600)] dark:bg-green-950 dark:shadow-[inset_0_-2px_var(--color-green-400)]",
            )}
          >
            {token.text}
          </mark>
        ),
      )}
    </>
  )
}

/**
 * One cell of the Previous/Current pair.
 *
 * Word-level highlight fires only where both sides exist — a `modified`
 * row. On an `added` or `removed` row the other side is genuinely absent,
 * and the cell says so with an explicit absence mark rather than going
 * blank: empty reads as "unknown", and absence is the entire claim the row
 * is making.
 */
function ValueCell({ row, side, gitHighlight }: { row: PropertyRow; side: "previous" | "current"; gitHighlight: boolean }) {
  const value = side === "previous" ? rowPrevious(row) : rowCurrent(row)
  if (value === null) {
    return (
      <td
        className="bg-[repeating-linear-gradient(-45deg,transparent,transparent_5px,var(--color-muted)_5px,var(--color-muted)_10px)] p-2 align-top break-words"
        data-absent="true"
      >
        <span className="font-bold text-muted-foreground/70" aria-label="not present">
          —
        </span>
      </td>
    )
  }
  const sideWash = gitHighlight
    ? side === "previous"
      ? "bg-red-600/10"
      : "bg-green-600/10"
    : undefined
  if (rowSupportsWordDiff(row)) {
    const diff = wordDiff(row.previous, row.current)
    return (
      <td className={cn("p-2 align-top break-words", sideWash)} data-side={side}>
        <code className="font-mono text-[11px] break-words text-foreground">
          <TokenRun tokens={side === "previous" ? diff.before : diff.after} />
        </code>
      </td>
    )
  }
  return (
    <td className={cn("p-2 align-top break-words", sideWash)} data-side={side}>
      <code className="font-mono text-[11px] break-words text-foreground">{value}</code>
    </td>
  )
}

const STATE_COLORS: Record<PropertyRow["state"], string> = {
  added: "border-green-600 bg-green-100 dark:border-green-400 dark:bg-green-950",
  removed: "border-red-600 bg-red-100 dark:border-red-400 dark:bg-red-950",
  modified: "border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-950",
}

const ROW_RAIL_COLORS: Record<PropertyRow["state"], string> = {
  added: "shadow-[inset_3px_0_var(--color-green-600)] dark:shadow-[inset_3px_0_var(--color-green-400)]",
  removed: "shadow-[inset_3px_0_var(--color-red-600)] dark:shadow-[inset_3px_0_var(--color-red-400)]",
  modified: "shadow-[inset_3px_0_var(--color-blue-600)] dark:shadow-[inset_3px_0_var(--color-blue-400)]",
}

/** The state badge, in the Layer/Property cell. */
function StateBadge({ state }: { state: PropertyRow["state"] }) {
  return (
    <span
      data-state={state}
      className={cn(
        "shrink-0 rounded-[5px] border px-[7px] py-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-foreground uppercase",
        STATE_COLORS[state],
      )}
    >
      {STATE_LABEL[state]}
    </span>
  )
}

/**
 * The accept/reject affordance, present ONLY when the dialog was opened to
 * apply something (Merge, Rebase). A plain review passes nothing and this
 * table renders no checkbox at all — not a disabled one, not a hidden one.
 *
 * The unit is the ELEMENT, not the property row: a Block whose title and
 * two ports all changed is one thing a reviewer decides about, not three.
 */
export interface ElementReview {
  isAccepted(elementId: string): boolean
  onToggle(elementId: string, accepted: boolean): void
}

/** The checkbox itself, shared by both layouts so they cannot drift apart. */
function AcceptBox({
  review,
  elementId,
  elementName,
  testid,
  className,
}: {
  review: ElementReview
  elementId: string
  elementName: string
  testid: string
  className?: string
}) {
  const accepted = review.isAccepted(elementId)
  return (
    <input
      type="checkbox"
      className={cn("size-[13px] shrink-0 accent-primary", className)}
      data-testid={testid}
      checked={accepted}
      aria-label={`Include ${elementName}`}
      // The row underneath is a select-this-element control; a click on
      // the box must decide inclusion WITHOUT also moving the boards, or
      // every tick would drag the camera somewhere the reviewer did not
      // ask to go.
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => review.onToggle(elementId, event.target.checked)}
    />
  )
}

interface RowProps {
  change: CompareChange
  row: PropertyRow
  selected: boolean
  onSelect: (changeId: string) => void
  gitHighlight: boolean
  /** `columns` prints the element beside the property; `figma` does not. */
  showElement: boolean
  /** Action mode only, and only ever rendered in the element cell. */
  review?: ElementReview
}

function ValueRow({ change, row, selected, onSelect, gitHighlight, showElement, review }: RowProps) {
  return (
    <tr
      data-state={row.state}
      data-testid={`compare-row-${row.key}`}
      data-change-id={change.id}
      data-element-id={row.elementId}
      data-selected={selected || undefined}
      tabIndex={0}
      role="button"
      aria-label={`${STATE_LABEL[row.state]} · ${row.element} · ${row.property}`}
      className={cn(
        "cursor-pointer",
        ROW_RAIL_COLORS[row.state],
        selected ? "bg-blue-600/10 outline outline-1 -outline-offset-1 outline-blue-600 dark:outline-blue-400" : "hover:bg-muted/60",
      )}
      onClick={() => onSelect(change.id)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onSelect(change.id)
      }}
    >
      {showElement ? (
        <th scope="row" className="flex items-center gap-1.5 p-2 align-top font-semibold break-words">
          <ElementIcon Icon={rowIcon(change)} />
          <span className="min-w-0 flex-1 overflow-hidden text-[11px] font-[650] text-ellipsis whitespace-nowrap text-foreground" title={row.element}>
            {row.element}
          </span>
          <StateBadge state={row.state} />
          {review ? (
            <AcceptBox review={review} elementId={row.elementId} elementName={row.element} testid={`compare-accept-row-${row.key}`} />
          ) : null}
        </th>
      ) : null}
      <td className="p-2 align-top break-words">
        {/*
         * Figma puts the state to the RIGHT of the name, on the same line —
         * not stacked above it. The inner flex `<div>` is deliberate: a
         * `<td>` given `display:flex` drops out of the table's column
         * layout and the browser wraps it in an anonymous cell, silently
         * moving this text under the wrong header. The `<td>` stays a real
         * table cell; only its content is a flex row.
         */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-nowrap text-foreground" title={row.property}>
            {row.property}
          </span>
          {/* With no Element column the badge has nowhere else to live, and
           *  dropping it would take the row's state with it. */}
          {showElement ? null : <StateBadge state={row.state} />}
        </div>
      </td>
      <ValueCell row={row} side="previous" gitHighlight={gitHighlight} />
      <ValueCell row={row} side="current" gitHighlight={gitHighlight} />
    </tr>
  )
}

export interface PropertyTableProps {
  changes: readonly CompareChange[]
  selectedId: string | null
  onSelect: (changeId: string) => void
  /** Whether the two-layer git-style ink is painted. */
  gitHighlight: boolean
  onGitHighlightChange: (next: boolean) => void
  layout: TableLayout
  onLayoutChange: (next: TableLayout) => void
  /** `figma` only: which element's properties the right-hand table shows. */
  selectedElementId: string | null
  onSelectElement: (elementId: string | null) => void
  /** Present only when the dialog was opened to APPLY something. */
  review?: ElementReview
}

/**
 * The header row above the table: the word-diff toggle and the "By
 * element"/"Flat table" switch. Donor: `CompareDialog.tsx:958-993`, moved
 * here per this file's header note.
 */
function PropertyTableOptions({
  gitHighlight,
  onGitHighlightChange,
  layout,
  onLayoutChange,
}: Pick<PropertyTableProps, "gitHighlight" | "onGitHighlightChange" | "layout" | "onLayoutChange">) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2">
      <label
        className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted-foreground select-none hover:text-foreground"
        data-testid="compare-highlight-toggle"
      >
        <input
          type="checkbox"
          className="accent-primary"
          checked={gitHighlight}
          data-testid="compare-highlight-checkbox"
          onChange={(event) => onGitHighlightChange(event.target.checked)}
        />
        Word-level diff highlighting
        <small className="ml-auto text-[10px] font-medium text-muted-foreground/70">
          {gitHighlight ? "on" : "off · like Figma"}
        </small>
      </label>
      {/* Two real layouts over the same rows, switchable in place — the
       *  point is to be able to judge them against each other without
       *  leaving the board. */}
      <ToggleGroup
        value={[layout]}
        onValueChange={(next) => {
          const value = next[0]
          if (value) onLayoutChange(value as TableLayout)
        }}
        aria-label="Table layout"
        className="ml-auto"
      >
        <ToggleGroupItem value="figma" variant="outline" size="sm" data-testid="compare-layout-figma">
          By element
        </ToggleGroupItem>
        <ToggleGroupItem value="columns" variant="outline" size="sm" data-testid="compare-layout-columns">
          Flat table
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

export function PropertyTable({
  changes,
  selectedId,
  onSelect,
  gitHighlight,
  onGitHighlightChange,
  layout,
  onLayoutChange,
  selectedElementId,
  onSelectElement,
  review,
}: PropertyTableProps) {
  const ordered = orderChanges(changes)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="compare-property-table-view">
      <PropertyTableOptions
        gitHighlight={gitHighlight}
        onGitHighlightChange={onGitHighlightChange}
        layout={layout}
        onLayoutChange={onLayoutChange}
      />
      {layout === "figma" ? (
        <FigmaLayout
          changes={changes}
          selectedId={selectedId}
          onSelect={onSelect}
          gitHighlight={gitHighlight}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          review={review}
        />
      ) : (
        <div className="isolate min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-xs" data-testid="compare-property-table" data-layout="columns">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {["Element", "Property", "Previous", "Current"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border p-2 text-left font-mono text-[9px] font-bold tracking-[0.09em] text-muted-foreground/80 uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.flatMap((change) =>
                propertyRowsOf(change).map((row) => (
                  <ValueRow
                    key={row.key}
                    change={change}
                    row={row}
                    selected={change.id === selectedId}
                    onSelect={onSelect}
                    gitHighlight={gitHighlight}
                    showElement
                    review={review}
                  />
                )),
              )}
              {changes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-7 text-center text-muted-foreground" data-testid="compare-no-changes">
                    These two versions are identical.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * Figma's layout, copied rather than approximated.
 *
 * A left list of the elements that changed, each badged; the right side is
 * the property comparison for exactly one of them. The empty-state
 * sentence is Figma's own wording, which is the point — this view exists to
 * be judged against the tool it came from, so paraphrasing it would blur
 * the comparison.
 */
function FigmaLayout({
  changes,
  selectedId,
  onSelect,
  gitHighlight,
  selectedElementId,
  onSelectElement,
  review,
}: Omit<PropertyTableProps, "layout" | "onLayoutChange" | "onGitHighlightChange">) {
  const elements = elementSummaries(changes)
  const active = elements.find((element) => element.id === selectedElementId) ?? null

  // WHY: session-only, not persisted. Nothing else a host remembers about
  // this dialog (mode, dock, layout, gitHighlight) survives a reopen either
  // — they are all plain state on the host — so this control doesn't get to
  // be the first exception.
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{ pointerX: number; startWidth: number } | null>(null)

  const clampListWidth = (width: number) => Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, width))

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragOrigin.current = { pointerX: event.clientX, startWidth: listWidth }
      setDragging(true)
    },
    [listWidth],
  )

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current
    if (!origin) return
    const delta = event.clientX - origin.pointerX
    setListWidth(clampListWidth(origin.startWidth + delta))
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragOrigin.current = null
    setDragging(false)
  }, [])

  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden"
      data-testid="compare-figma-layout"
      style={{ gridTemplateColumns: `${listWidth}px 6px minmax(0, 1fr)` } as CSSProperties}
    >
      <ul
        className="m-0 list-none overflow-y-auto border-r border-border bg-muted/40 p-1.5"
        data-testid="compare-element-list"
        data-review={review ? "on" : undefined}
      >
        {elements.map((element) => (
          <li key={element.id} className={cn("mb-[3px]", review && "flex items-center gap-1")}>
            <button
              type="button"
              data-testid={`compare-element-${element.id}`}
              data-status={element.status}
              data-selected={element.id === selectedElementId || undefined}
              aria-pressed={element.id === selectedElementId}
              // A cable's name is both endpoints, which will not fit an
              // index column. It ellipsises, so the complete value has to
              // stay one hover away — a clipped name must never be the
              // only copy.
              title={element.name}
              className={cn(
                "flex w-full min-w-0 items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 py-1.5 text-left text-[11px] text-foreground hover:bg-muted",
                review && "flex-1",
                element.id === selectedElementId && "border-blue-600 bg-blue-600/10 dark:border-blue-400",
              )}
              onClick={() => onSelectElement(element.id === selectedElementId ? null : element.id)}
            >
              <ElementIcon Icon={summaryIcon(element)} />
              <span className="min-w-0 flex-1 overflow-hidden font-[650] text-ellipsis whitespace-nowrap">{element.name}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">{element.rowCount}</span>
              <span
                data-status={element.status}
                className={cn(
                  "shrink-0 rounded-[5px] border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-foreground uppercase",
                  element.status === "added" && "border-green-600 bg-green-100 dark:border-green-400 dark:bg-green-950",
                  element.status === "removed" && "border-red-600 bg-red-100 dark:border-red-400 dark:bg-red-950",
                  element.status === "edited" && "border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-950",
                )}
              >
                {ELEMENT_STATUS_LABEL[element.status]}
              </span>
            </button>
            {/*
             * TRAILING, and a sibling of the row button rather than a
             * child. A child is invalid HTML — an `<input>` inside a
             * `<button>` — and the browser would route one click to both,
             * so ticking the box would also select (or DESELECT) the
             * element. Trailing because the row already opens with a 13px
             * kind glyph — a leading checkbox beside it reads as two
             * checkboxes, one mysteriously unticked.
             */}
            {review ? (
              <AcceptBox review={review} elementId={element.id} elementName={element.name} testid={`compare-accept-${element.id}`} />
            ) : null}
          </li>
        ))}
        {elements.length === 0 ? (
          <li className="p-7 text-center text-muted-foreground" data-testid="compare-no-changes">
            These two versions are identical.
          </li>
        ) : null}
      </ul>

      {/*
       * `onPointerDown` captures the pointer so the drag keeps tracking
       * even once the cursor leaves this 6px strip — without capture, a
       * fast drag outside the handle's own bounding box would silently
       * stop updating. Double-click resets to the default width. This is
       * panel-internal geometry (it measures only its own drag track), the
       * one exception the brief carves out of "no self-measurement".
       */}
      <div
        className="group/resize relative h-full cursor-col-resize touch-none bg-transparent"
        data-testid="compare-element-list-resize"
        data-dragging={dragging || undefined}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the element list"
        aria-valuenow={listWidth}
        aria-valuemin={MIN_LIST_WIDTH}
        aria-valuemax={MAX_LIST_WIDTH}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)}
      >
        <span
          className={cn(
            "absolute top-0 bottom-0 left-0.5 w-0.5 rounded-sm bg-transparent group-hover/resize:bg-blue-600/60 dark:group-hover/resize:bg-blue-400/60",
            dragging && "bg-blue-600 dark:bg-blue-400",
          )}
        />
      </div>

      {active ? (
        <div className="isolate min-h-0 overflow-auto">
          <table className="w-full table-fixed border-collapse text-xs" data-testid="compare-property-table" data-layout="figma">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                {["Property", "Previous", "Current"].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border p-2 text-left font-mono text-[9px] font-bold tracking-[0.09em] text-muted-foreground/80 uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* No `review` here on purpose: this table is already scoped
               *  to ONE element, whose box lives on its row in the list to
               *  the left. Repeating it per property would imply a
               *  property-level decision that no action can honour. */}
              {active.changes.flatMap((change) =>
                propertyRowsOf(change).map((row) => (
                  <ValueRow
                    key={row.key}
                    change={change}
                    row={row}
                    selected={change.id === selectedId}
                    onSelect={onSelect}
                    gitHighlight={gitHighlight}
                    showElement={false}
                  />
                )),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 grid content-center justify-items-center p-6 text-center text-xs text-muted-foreground" data-testid="compare-figma-empty">
          Select an edited element to compare changes
        </p>
      )}
    </div>
  )
}
