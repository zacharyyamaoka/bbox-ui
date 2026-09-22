"use client"

import { useCallback, useState, type ReactNode } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "../lib/utils"
import { Badge } from "../components/badge"
import { Button } from "../components/button"
import { DialogClose, DialogOverlay, DialogPortal } from "../components/dialog"
import { CHANGE_KINDS, SUBJECT_KINDS, type BoardCompare, type ChangeKind, type CompareChange } from "./compareModel"
import {
  CompareReview,
  type CompareDock,
  type CompareMode,
  type CompareReviewAction,
  type CompareReviewSelection,
  type CompareTab,
} from "./compareReview"
import type { HistoryRecord } from "./historyList"
import type { TableLayout } from "./propertyTable"

/**
 * src/editor/compareDialog.tsx — the THIN host modal `compareReview.tsx`
 * says it needs ("No `Dialog`, no fixed positioning, no z-index —
 * MENU-KIT-DESIGN.md §3.3 is explicit that 'a thin host modal wraps it'"),
 * plus the titlebar that lives on the modal rather than inside the review.
 *
 * Ported from /home/bam/systemsketch/src/compare/CompareDialog.tsx — only the
 * two ends of that file, because everything between them is already in this
 * kit as `compareReview.tsx`:
 *
 *   - The dialog frame: donor :653-679 (`Dialog.Root` → `Dialog.Portal` →
 *     `Dialog.Overlay` → `Dialog.Content`) and its closing :1120-1126.
 *   - The titlebar: donor :680-714 — the verb-derived heading, the per-kind
 *     tally badges, and the close button.
 *
 * Rebuilt on this kit's stock parts rather than carried across as markup:
 * the donor's hand-rolled `.systemsketch-compare__scrim` / `__titlebar` /
 * `__badge` / `__close` CSS classes are `dialog.tsx`'s `DialogOverlay` /
 * `DialogPortal` / `DialogClose`, `badge.tsx`'s `Badge`, and `button.tsx`'s
 * `Button` — the same substitution `settingsView.tsx` already made for the
 * same reason (Zach, 2026-09-19: "as always please be using stock shadcn as
 * much as possible"). `DialogPrimitive.Popup` is used directly rather than
 * `dialog.tsx`'s `DialogContent` wrapper for one reason: `DialogContent`
 * hardcodes `sm:max-w-sm` and its own padding, and this dialog is a
 * near-fullscreen stage — `settingsView.tsx:229` reaches past the wrapper
 * for exactly the same reason, so this is the established seam, not a new
 * one.
 *
 * The donor's `themeRoot()` DOM query (:1118-1126) does NOT travel: every
 * popup in this kit takes the universal `container` prop instead (design
 * doc §4), so a host names its own portal target rather than this component
 * guessing at a class name only one app has.
 *
 * Deliberately left behind, because they are host concerns the donor could
 * afford to keep on one 1,127-line component and this kit cannot:
 * snapshot/version discovery (that algebra is `compareSource.ts`), the
 * `BoardRender` camera linking (donor :354-397), and `recordsOfSnapshot`.
 */

/** The badge order in the titlebar. Donor :51 verbatim. */
const KIND_ORDER: readonly ChangeKind[] = CHANGE_KINDS

/** Tints the three counts the way the rest of the kit tints a state. */
const KIND_BADGE: Readonly<Record<ChangeKind, "default" | "secondary" | "destructive" | "outline">> = {
  added: "secondary",
  removed: "destructive",
  modified: "outline",
}

/** Every subject's count of one kind — donor :688-694, summed the same way. */
export function tallyOf(comparison: BoardCompare | null, kind: ChangeKind): number {
  if (!comparison) return 0
  return SUBJECT_KINDS.reduce((total, subject) => total + (comparison.tally[subject]?.[kind] ?? 0), 0)
}

export interface CompareDialogProps {
  /** Controlled open state. The modal never opens itself. */
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void

  /** The measured diff, or null when no `before` has been loaded yet. */
  readonly comparison: BoardCompare | null

  /** The history rail's rows — `compareSource.ts`'s `versionRecords` builds these. */
  readonly versions?: readonly HistoryRecord[]
  readonly selectedVersionId?: string | null
  readonly onSelectVersion?: (id: string) => void
  /** An explicit before/after pair with no history to page through. */
  readonly sourceNote?: { beforeLabel: string; afterLabel: string }
  /** The amber notice — `compareSource.ts`'s `historyProblem` result. */
  readonly problem?: string | null

  /** The two board panes. See the seam note below. */
  renderBefore(slot: { highlight: CompareChange | null; label: string }): ReactNode
  renderAfter(slot: { highlight: CompareChange | null; label: string }): ReactNode
  /** Host cameras — fired when the framed change changes. */
  readonly onFrameChange?: (change: CompareChange | null) => void
  /** Overlay needs linked cameras; a host that cannot link them gates the option. */
  readonly canOverlay?: boolean

  /** Turns the review into review-and-apply. Absent → a plain review, and the heading stays "Compare changes". */
  readonly action?: CompareReviewAction
  readonly review?: CompareReviewSelection

  /** Seeds for the detail rail. The review owns them from there. */
  readonly layout?: TableLayout
  readonly gitHighlight?: boolean

  /** Each is omitted → uncontrolled, the same contract `settingsView.tsx` uses. */
  readonly mode?: CompareMode
  readonly onModeChange?: (mode: CompareMode) => void
  readonly tab?: CompareTab
  readonly onTabChange?: (tab: CompareTab) => void
  readonly dock?: CompareDock
  readonly onDockChange?: (dock: CompareDock) => void
  readonly fullscreen?: boolean
  readonly onFullscreenChange?: (next: boolean) => void
  readonly selectedChangeId?: string | null
  readonly onSelectChange?: (id: string | null) => void
  readonly onStageShapeChange?: (shape: string) => void

  /** Portal target. Omitted → the document body, Base UI's own default. */
  readonly container?: HTMLElement | null
  readonly popupClassName?: string
  readonly testIdPrefix?: string
}

/**
 * THE BOARD-RENDER SEAM.
 *
 * `renderBefore` / `renderAfter` are `ReactNode` slots, and that is the
 * whole answer: the donor's `BoardRender.tsx` mounts a real tldraw editor
 * per pane and links their cameras, so carrying it into this kit would put
 * the engine inside the core — the one rule this repo rests on (CLAUDE.md,
 * "The core imports no canvas engine"). A slot keeps every board-shaped
 * decision (which parser reads the file, whether the two cameras are
 * linked, what a pane shows while it loads) on the side that already owns
 * an engine, and lets a non-tldraw host — React Flow, a DOM canvas, a PNG
 * — mount this same dialog with no adapter at all.
 *
 * The cost is stated rather than hidden: overlay blending is a real visual
 * comparison only when the two panes share a camera, and this component
 * cannot check that. `canOverlay` is how a host says so, and the Overlay
 * option disables rather than lying when it is false.
 */
export function CompareDialog({
  open,
  onOpenChange,
  comparison,
  versions,
  selectedVersionId = null,
  onSelectVersion,
  sourceNote,
  problem,
  renderBefore,
  renderAfter,
  onFrameChange,
  canOverlay,
  action,
  review,
  layout = "figma",
  gitHighlight = false,
  mode,
  onModeChange,
  tab,
  onTabChange,
  dock,
  onDockChange,
  fullscreen,
  onFullscreenChange,
  selectedChangeId,
  onSelectChange,
  onStageShapeChange,
  container,
  popupClassName,
  testIdPrefix,
}: CompareDialogProps) {
  const prefix = testIdPrefix ?? "compare"

  /*
   * Uncontrolled fallbacks. `compareReview.tsx` is fully controlled by
   * design — every one of these has a required setter there — but a host
   * mounting a MODAL should not have to hold six pieces of state that
   * nothing outside the modal reads. So each prop here is
   * omitted → uncontrolled, and a host that does care (a wiring lane
   * persisting the dock, say) passes the pair and gets the donor's exact
   * controlled behaviour back.
   */
  const [modeState, setModeState] = useState<CompareMode>("side-by-side")
  const [tabState, setTabState] = useState<CompareTab>("properties")
  const [dockState, setDockState] = useState<CompareDock>("right")
  const [fullscreenState, setFullscreenState] = useState(false)
  const [selectedChangeState, setSelectedChangeState] = useState<string | null>(null)
  // Blend has no controlled prop at all: it is a slider position inside
  // one mode of one bar, and no host has ever needed to read it.
  const [blend, setBlend] = useState(50)

  const activeMode = mode ?? modeState
  const activeTab = tab ?? tabState
  const activeDock = dock ?? dockState
  const activeFullscreen = fullscreen ?? fullscreenState
  const activeChangeId = selectedChangeId !== undefined ? selectedChangeId : selectedChangeState

  const changeMode = useCallback(
    (next: CompareMode) => {
      onModeChange?.(next)
      if (mode === undefined) setModeState(next)
    },
    [mode, onModeChange],
  )
  const changeTab = useCallback(
    (next: CompareTab) => {
      onTabChange?.(next)
      if (tab === undefined) setTabState(next)
    },
    [tab, onTabChange],
  )
  const changeDock = useCallback(
    (next: CompareDock) => {
      onDockChange?.(next)
      if (dock === undefined) setDockState(next)
    },
    [dock, onDockChange],
  )
  const changeFullscreen = useCallback(
    (next: boolean) => {
      onFullscreenChange?.(next)
      if (fullscreen === undefined) setFullscreenState(next)
    },
    [fullscreen, onFullscreenChange],
  )
  const changeSelected = useCallback(
    (next: string | null) => {
      onSelectChange?.(next)
      if (selectedChangeId === undefined) setSelectedChangeState(next)
    },
    [selectedChangeId, onSelectChange],
  )

  /*
   * Donor :666-676, ported with its WHY intact: Escape unwinds ONE layer
   * at a time. Fullscreen is a place a reviewer got to deliberately, and
   * dropping them straight out of the whole review from there would
   * discard a selection and a camera they spent time on — so the first
   * Escape brings the chrome back and only the second closes.
   *
   * The seam moved with the primitive: the donor intercepted Radix's
   * `onEscapeKeyDown` on the CONTENT, and Base UI has no such prop — it
   * routes every dismissal through the root's `onOpenChange` with a
   * `reason`, and `eventDetails.cancel()` is how a consumer refuses one.
   * Same behaviour, and strictly better: this now covers the platform's
   * CloseWatcher (Android back) too, which `onEscapeKeyDown` never saw.
   */
  const handleOpenChange = useCallback(
    (next: boolean, eventDetails: DialogPrimitive.Root.ChangeEventDetails) => {
      if (!next && activeFullscreen && eventDetails.reason === "escape-key") {
        eventDetails.cancel()
        changeFullscreen(false)
        return
      }
      onOpenChange(next)
    },
    [activeFullscreen, changeFullscreen, onOpenChange],
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPortal container={container ?? undefined}>
        <DialogOverlay data-testid={`${prefix}-scrim`} />
        <DialogPrimitive.Popup
          data-slot="compare-dialog"
          data-testid={`${prefix}-dialog`}
          data-fullscreen={activeFullscreen || undefined}
          data-action={action?.label.toLowerCase() ?? undefined}
          aria-describedby={undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl",
            "bg-background text-foreground ring-1 ring-foreground/10 shadow-lg duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            // Near-fullscreen, the way the screenshot shows it: a stage
            // this size is the point of the surface, and a `max-w-sm`
            // dialog would leave the two board panes unreadable.
            "h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-[1600px]",
            popupClassName,
          )}
        >
          <header
            data-slot="compare-titlebar"
            className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5"
          >
            {/* IcePanel titles the same panel by the verb that opened it —
             *  "Merge changes" — which is the only thing telling a reviewer
             *  whether this window is going to DO something when they are two
             *  clicks deep into a diff. Donor :684-687, verbatim. */}
            <DialogPrimitive.Title className="cn-font-heading m-0 text-base leading-none font-medium">
              {action ? `${action.label} changes` : "Compare changes"}
            </DialogPrimitive.Title>
            {comparison ? (
              <p className="m-0 flex min-w-0 items-center gap-1.5" data-testid={`${prefix}-summary`}>
                {KIND_ORDER.map((kind) => (
                  <Badge key={kind} variant={KIND_BADGE[kind]} size="sm" data-kind={kind} data-testid={`${prefix}-badge-${kind}`}>
                    {tallyOf(comparison, kind)} {kind}
                  </Badge>
                ))}
              </p>
            ) : null}
            <DialogClose
              className="ml-auto"
              data-testid={`${prefix}-close`}
              render={<Button variant="ghost" size="icon-sm" aria-label="Close compare" />}
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </header>

          <div className="flex min-h-0 flex-1">
            <CompareReview
              comparison={comparison}
              versions={versions}
              selectedVersionId={selectedVersionId}
              onSelectVersion={onSelectVersion}
              sourceNote={sourceNote}
              problem={problem}
              renderBefore={renderBefore}
              renderAfter={renderAfter}
              selectedChangeId={activeChangeId}
              onSelectChange={changeSelected}
              onFrameChange={onFrameChange}
              mode={activeMode}
              onModeChange={changeMode}
              blend={blend}
              onBlendChange={setBlend}
              canOverlay={canOverlay}
              fullscreen={activeFullscreen}
              onFullscreenChange={changeFullscreen}
              onStageShapeChange={onStageShapeChange}
              dock={activeDock}
              onDockChange={changeDock}
              tab={activeTab}
              onTabChange={changeTab}
              layout={layout}
              gitHighlight={gitHighlight}
              action={action}
              review={review}
              container={container}
              testIdPrefix={prefix}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
