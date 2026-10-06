"use client";

// src/editor/problemsPanel.tsx — the Problems panel body
// (docs/menus/screenshots/07: "175 problems / Derived locally from this
// board", a red ×/amber ! count pair, an All/Errors/Warnings segmented
// filter, a sticky "BOARD" group header, then severity-icon rows) plus the
// status-strip badge that reuses its warning glyph.
//
// Ported from /home/bam/systemsketch/src/diagnostics/BoardDiagnosticsPanel.tsx
// (`BoardDiagnosticsView`) — the header/counts/filters/row layout, the row
// a11y string (`${severity}: ${message}. ${detail}`), the fixed reveal
// `title` ("Select and fit the affected board objects"), and the
// clear-vs-filtered empty-state copy split. `diagnosticsModel.ts`'s actual
// analyzer (`getBoardDiagnosticsModel`, the graph-cycle/duplicate-port/
// unsatisfied-input rules) is NOT ported — that logic walks a live tldraw
// `Editor` end to end, which is host-adapter code by CLAUDE.md's "the core
// imports no canvas engine" rule; this file only knows how to RENDER
// `Diagnostic`/`DiagnosticGroup` data someone else derived.
//
// Design decision #5 (docs/menus/MENU-KIT-DESIGN.md §8): "Problems `info`
// severity... severities become config; the demo config mirrors
// SystemSketch (error/warning chips, info counted only)". The donor
// hardcoded exactly three severities with only two exposed as filter chips
// (`FILTERS` never lists `info` — `diagnosticsModel.ts`'s own comment: "a
// note is not a mark, and painting every informational finding is how a
// board loses the ability to look calm"). `severities` below is what makes
// that a HOST decision instead of a hardcoded union: a severity absent from
// the array still shows in the "All" total (via `counts`) but gets neither
// its own segmented chip nor its own icon styling — it falls back to a
// plain muted dot, the same "flatten to normal" idea restated as a
// rendering fallback instead of a fixed enum case.
//
// Design decision #6: "render the group's own `label`" — fixing the
// donor's hardcoded `<span>Board</span>` (`BoardDiagnosticsPanel.tsx:155`)
// into `DiagnosticGroup.label`, host data instead of a literal.
import { Crosshair, TriangleAlert } from "lucide-react";

import { Badge } from "../components/badge";
import { cn } from "../lib/utils";
import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface Severity {
  id: string;
  label: string;
  /** A single glyph drawn inside the row's circle — the donor's `×`/`!`. */
  glyph: string;
  /** A semantic tone key — `"error"` / `"warning"` resolve to real color;
   *  anything else falls back to a plain muted circle (see `TONE_CLASS`). */
  tone: string;
}

export interface Diagnostic {
  id: string;
  code: string;
  severity: string;
  message: string;
  detail: string;
}

export interface DiagnosticGroup {
  id: string;
  label: string;
  diagnostics: readonly Diagnostic[];
}

export interface ProblemsPanelEmptyCopy {
  /** [heading, body] when the board has zero problems outright. */
  clear: readonly [string, string];
  /** [heading, body] when problems exist but the active filter hides all of them. */
  filtered: readonly [string, string];
}

export interface ProblemsPanelProps {
  groups: readonly DiagnosticGroup[];
  /** Keyed by severity id, plus `"all"` for the unfiltered total. */
  counts: Readonly<Record<string, number>>;
  severities: readonly Severity[];
  filter: string;
  onFilterChange(next: string): void;
  onActivate(diagnostic: Diagnostic): void;
  emptyCopy?: ProblemsPanelEmptyCopy;
  testIdPrefix?: string;
}

const DEFAULT_EMPTY_COPY: ProblemsPanelEmptyCopy = {
  clear: ["Board checks are clear", "Add and connect Blocks; this view updates as the board changes."],
  filtered: ["No problems", "Choose another severity filter to see the remaining problems."],
};

/* ------------------------------------------------------------------ */
/* Tone → color. No `--warning`/`--danger` token exists yet in this
   trunk's CSS variables (only `--destructive` does — same gap
   draftBar.tsx's `ConflictBanner` already documents), so "warning" reaches
   for literal `amber-*` Tailwind swatches, the same as that file. */
/* ------------------------------------------------------------------ */

const TONE_CLASS: Record<string, { text: string; border: string }> = {
  error: { text: "text-destructive", border: "border-destructive" },
  warning: { text: "text-amber-600 dark:text-amber-400", border: "border-amber-500 dark:border-amber-400" },
};

const DEFAULT_TONE = { text: "text-muted-foreground", border: "border-muted-foreground/40" };

function toneClass(tone: string) {
  return TONE_CLASS[tone] ?? DEFAULT_TONE;
}

/* ------------------------------------------------------------------ */
/* ProblemsBadge — the warning-triangle status-strip glyph, "99+" clamp */
/* ------------------------------------------------------------------ */

/**
 * The compound icon `StatusStrip` mounts for the Problems launcher
 * (docs/menus/screenshots/06/07's bottom-right cluster: a warning triangle
 * with a red "99+" chip riding its top-right corner). Ported from
 * `SystemSketchUtilities.tsx:684-693`'s `problemCount > 99 ? '99+' :
 * problemCount` clamp — the triangle itself is the donor's inline
 * `ProblemsIcon` SVG, restated as lucide's `TriangleAlert` (stock-part
 * rule: "Icons in menus/bars... lucide-react named exports").
 */
export function ProblemsBadge({ count }: { count: number }) {
  return (
    <span className="relative inline-flex">
      <TriangleAlert className="size-4" aria-hidden="true" />
      {count > 0 ? (
        <Badge
          variant="destructive"
          size="sm"
          shape="pill"
          className="absolute -top-2 -right-2.5 h-[15px] min-w-[15px] px-1 text-[9px] leading-none"
        >
          {count > 99 ? "99+" : count}
        </Badge>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                  */
/* ------------------------------------------------------------------ */

function SeverityGlyph({ diagnostic, severities }: { diagnostic: Diagnostic; severities: readonly Severity[] }) {
  const severity = severities.find((candidate) => candidate.id === diagnostic.severity);
  const tone = toneClass(severity?.tone ?? "");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full border text-[11px] font-bold",
        tone.text,
        tone.border,
      )}
    >
      {severity?.glyph ?? "•"}
    </span>
  );
}

function DiagnosticRow({
  diagnostic,
  severities,
  onActivate,
}: {
  diagnostic: Diagnostic;
  severities: readonly Severity[];
  onActivate(diagnostic: Diagnostic): void;
}) {
  const severity = severities.find((candidate) => candidate.id === diagnostic.severity);
  const severityLabel = severity?.label ?? diagnostic.severity;
  return (
    <li data-slot="problems-panel-item">
      <button
        type="button"
        data-slot="problems-panel-row"
        data-diagnostic-id={diagnostic.id}
        data-diagnostic-code={diagnostic.code}
        data-severity={diagnostic.severity}
        aria-label={`${severityLabel}: ${diagnostic.message}. ${diagnostic.detail}`}
        title="Select and fit the affected board objects"
        onClick={() => onActivate(diagnostic)}
        // WHY `group` here (foldingChevron.tsx's own reveal idiom, reused):
        // the crosshair action button is invisible until the row is
        // hovered/focused — a Problems list this long (175 rows in the
        // screenshot) would otherwise put a second interactive glyph on
        // every single row at all times.
        className="group flex w-full items-start gap-2.5 rounded-md px-3.5 py-2.5 text-left outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <SeverityGlyph diagnostic={diagnostic} severities={severities} />
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-foreground">{diagnostic.message}</strong>
          <span className="mt-0.5 block text-sm text-muted-foreground">{diagnostic.detail}</span>
          <code className="mt-1 block font-mono text-xs text-muted-foreground/70">{diagnostic.code}</code>
        </span>
        <Crosshair
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* ProblemsPanel                                                       */
/* ------------------------------------------------------------------ */

function visibleDiagnostics(groups: readonly DiagnosticGroup[], filter: string): DiagnosticGroup[] {
  if (filter === "all") return [...groups];
  return groups
    .map((group) => ({ ...group, diagnostics: group.diagnostics.filter((d) => d.severity === filter) }))
    .filter((group) => group.diagnostics.length > 0);
}

export function ProblemsPanel({
  groups,
  counts,
  severities,
  filter,
  onFilterChange,
  onActivate,
  emptyCopy = DEFAULT_EMPTY_COPY,
  testIdPrefix = "bbox",
}: ProblemsPanelProps) {
  const total = counts.all ?? groups.reduce((sum, group) => sum + group.diagnostics.length, 0);
  const visible = visibleDiagnostics(groups, filter);
  const visibleCount = visible.reduce((sum, group) => sum + group.diagnostics.length, 0);

  return (
    <div
      data-slot="problems-panel"
      data-testid={`${testIdPrefix}-problems-panel`}
      // `isolate`: the sticky group headings below use z-10, which escaped
      // into the host's stacking context whenever this panel was rendered
      // OUTSIDE a PanelShell (the shell has its own boundary, standalone has
      // none) — a host overlay at z-5 lost to a heading. Judge sweep,
      // 2026-09-18, the same omission as FramesPanel.
      className="isolate flex flex-col"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-3.5 py-3.5">
        <div className="min-w-0">
          <strong className="block text-base font-semibold text-foreground">
            {total === 0 ? "No problems" : `${total} problem${total === 1 ? "" : "s"}`}
          </strong>
          <span className="text-sm text-muted-foreground">Derived locally from this board</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5 text-sm font-semibold tabular-nums">
          <span className={cn("flex items-center gap-1", TONE_CLASS.error.text)}>
            <b aria-hidden="true">×</b>
            {counts.error ?? 0}
          </span>
          <span className={cn("flex items-center gap-1", TONE_CLASS.warning.text)}>
            <b aria-hidden="true">!</b>
            {counts.warning ?? 0}
          </span>
        </div>
      </header>

      {total > 0 ? (
        <div className="border-b border-border px-3.5 py-2.5">
          <ToggleGroup
            value={[filter]}
            onValueChange={(next) => {
              // Base UI's ToggleGroup allows deselecting to `[]` even in
              // single-select mode (clicking the already-pressed item) —
              // a filter row must always have exactly one active tab, so an
              // empty next value is ignored rather than left with nothing
              // pressed.
              if (next.length > 0) onFilterChange(String(next[0]));
            }}
            className="gap-1.5"
          >
            <ToggleGroupItem
              value="all"
              variant="outline"
              className="gap-1.5 border-0 border-l-2 border-l-transparent bg-transparent px-3 font-semibold text-muted-foreground aria-pressed:border-l-primary aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              All
              <span className="text-muted-foreground">{total}</span>
            </ToggleGroupItem>
            {severities.map((severity) => (
              <ToggleGroupItem
                key={severity.id}
                value={severity.id}
                variant="outline"
                className="gap-1.5 border-0 border-l-2 border-l-transparent bg-transparent px-3 font-semibold text-muted-foreground aria-pressed:border-l-primary aria-pressed:bg-muted aria-pressed:text-foreground"
              >
                {severity.label}
                {/* WHY the plural label ("Errors"/"Warnings") is spelled by
                    the host in `severity.label`, not derived here: this
                    component has no linguistic rule for pluralizing an
                    arbitrary config id, and the donor's own two labels
                    aren't a mechanical `${label}s` transform of anything
                    ("Error" the glyph tooltip vs "Errors" the tab). */}
                <span className="text-muted-foreground">{counts[severity.id] ?? 0}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}

      <div data-slot="problems-panel-body">
        {visibleCount === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center" role="status">
            <strong className="text-sm text-foreground">
              {total === 0 ? emptyCopy.clear[0] : emptyCopy.filtered[0]}
            </strong>
            <p className="text-xs text-muted-foreground">{total === 0 ? emptyCopy.clear[1] : emptyCopy.filtered[1]}</p>
          </div>
        ) : (
          visible.map((group) => (
            <section key={group.id} aria-label={group.label}>
              {/* WHY `sticky top-0`, not a plain header: `PanelShell`'s body
                  is the nearest scrolling ancestor (`overflow-y-auto`), so
                  this sticks to the TOP of that scroll region as the list
                  of 175 rows scrolls underneath it — the donor's own visual
                  (docs/menus/screenshots/07's "BOARD  175" bar staying put
                  while rows scroll past). An opaque background is required
                  or rows would show through while stuck. */}
              <h3 className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-popover px-3.5 py-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                <span>{group.label}</span>
                <b className="tabular-nums text-foreground">{group.diagnostics.length}</b>
              </h3>
              <ul aria-label={`${group.label} problems`}>
                {group.diagnostics.map((diagnostic) => (
                  <DiagnosticRow
                    key={diagnostic.id}
                    diagnostic={diagnostic}
                    severities={severities}
                    onActivate={onActivate}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
