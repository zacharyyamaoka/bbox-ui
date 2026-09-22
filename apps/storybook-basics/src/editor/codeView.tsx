import { useMemo } from "react"

import { cn } from "../lib/utils"
import { collapseContext, lineDiff, stableJson, ELISION, type LineKind } from "./lineDiff"
import type { CompareChange } from "./compareModel"

/**
 * src/editor/codeView.tsx — the Compare dialog's Code tab
 * (docs/menus/screenshots/08-compare-changes.png shows the Properties tab
 * selected; this is its sibling).
 *
 * Ported from /home/bam/systemsketch/src/compare/CodeView.tsx:1-69 — a thin
 * render over Lane E's `lineDiff.ts`. Nothing computational changed; the
 * donor's `compare.css` rules (`.systemsketch-compare__code*`) are
 * re-expressed as Tailwind utilities below.
 *
 * This exists for exactly one reason, and it is Zach's: *"helpful to make
 * sure it's parsing correctly."* The Properties table is an
 * INTERPRETATION — it says a port was inserted, a title was renamed. The
 * Code tab is the evidence that interpretation was computed from, in the
 * form every engineer already audits without being taught: red line
 * removed, green line added, unchanged lines as context. If the table and
 * the code ever disagree, the code is right and the projector has a bug.
 *
 * Figma's own Compare panel does the same thing one level up — its Code tab
 * shows the selected layer's CSS with `- background: #FDBEAD;` above
 * `+ background: #FDCAAD;` — and Camunda ships an XML text view beside its
 * visual diff for the same purpose. Raw evidence one click below the
 * meaning, never merged into it.
 */

export interface CodeViewProps {
  change: CompareChange | null
}

const LINE_BACKGROUND: Partial<Record<LineKind, string>> = {
  removed: "bg-red-600/10",
  added: "bg-green-600/10",
}

const BADGE_COLORS: Record<CompareChange["kind"], string> = {
  added: "border-green-600 bg-green-100 dark:border-green-400 dark:bg-green-950",
  removed: "border-red-600 bg-red-100 dark:border-red-400 dark:bg-red-950",
  modified: "border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-950",
}

export function CodeView({ change }: CodeViewProps) {
  const lines = useMemo(() => {
    if (!change) return []
    return collapseContext(lineDiff(stableJson(change.recordBefore), stableJson(change.recordAfter)))
  }, [change])

  if (!change) {
    return (
      <p className="m-0 p-4 text-xs text-muted-foreground" data-testid="compare-code-empty">
        Select a row to see the record it was computed from.
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-col" data-testid="compare-code-view">
      <header className="flex flex-wrap items-baseline gap-2 border-b border-border p-3">
        <span
          data-kind={change.kind}
          className={cn("mb-[3px] inline-block rounded-full border px-[7px] py-px text-[10px] font-semibold text-foreground capitalize", BADGE_COLORS[change.kind])}
        >
          {change.kind}
        </span>
        <span className="font-semibold break-words text-foreground">{change.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {change.subject}
          {change.portId ? ` · ${change.portId}` : ""}
        </span>
      </header>
      <pre className="m-0 overflow-x-auto py-2 font-mono text-[11.5px] leading-[1.55]">
        {lines.map((line, index) => (
          <code
            key={index}
            data-kind={line.kind}
            data-testid={line.kind === "context" ? undefined : `compare-code-${line.kind}`}
            className={cn("flex gap-0 whitespace-pre", LINE_BACKGROUND[line.kind])}
          >
            <span className="w-[34px] shrink-0 pr-1.5 text-right text-muted-foreground/60 select-none">
              {line.text === ELISION ? "" : (line.beforeNumber ?? "")}
            </span>
            <span className="w-[34px] shrink-0 pr-1.5 text-right text-muted-foreground/60 select-none">
              {line.text === ELISION ? "" : (line.afterNumber ?? "")}
            </span>
            <span className="w-4 shrink-0 text-center text-muted-foreground select-none">
              {line.kind === "removed" ? "-" : line.kind === "added" ? "+" : " "}
            </span>
            <span className="flex-1 pr-3 text-foreground">{line.text}</span>
          </code>
        ))}
      </pre>
    </div>
  )
}
