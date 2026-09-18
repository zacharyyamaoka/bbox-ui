"use client";

// src/components/highlighter.tsx — NET NEW (docs/INVALID-STATES-PLAN.md §1,
// §4, §5), renamed from diagnostic.tsx per Zach's mid-run feedback on the
// proposal report: "I do wonder if visual language wise if we should just
// borrow from jointjs and do the highlighting... I think we can basically
// just copy it as well... Perhaps we can just borrow their terminology.
// Highlighters I think is right." The DATA stays named `Diagnostic` — a
// diagnostic is the finding, a highlighter is how it gets drawn, and that
// split is worth keeping distinct in the names. This file carries: the
// closed severity set, the `Diagnostic` shape (a LIST with a stable id —
// see this file's own history for why), the severity->token map, the
// three `HighlighterKind`s JointJS's own docs page catalogues (`stroke`,
// `mask`, and this kit's own pre-existing `halo`/glow treatment — Appendix
// A's own table maps JointJS's five highlighter types onto this plan's
// equivalents), the wavy/dotted underline helper every text-bearing mark
// uses, and the one genuinely new interactive composition —
// `DiagnosticFlag`.
//
// WHY `diagnostics` is a LIST with a stable `id`, not the scalar the plan's
// §1 first drafted: a producer that pre-merges N findings into one has
// already destroyed the rest before this file ever sees them, and §5
// promises a Popover with "the full anatomy" — it can only show what it's
// handed. Zach's own ruling overturned the scalar mid-implementation
// (verbatim: "a peer session that read the same docs reached the same
// conclusion... the deciding detail is the count: Vyuh's status badges and
// maxGraph's containsValidationErrors both show an error count on the
// badge, and you cannot render a count from a scalar"), and the plan doc
// was amended to match. Confirmed again in the SAME mid-run feedback that
// renamed this file: "this idea to support multiple marks... super true in
// case we need to indicate various problems! love that." The CHROME still
// reads only `max(severity)` (see `maxDiagnosticSeverity` below) — one
// highlighter, one underline — so the "visual calm" argument for a scalar
// is preserved at the paint layer; only identity and the popover's list
// are plural.
//
// WHY `stroke` is the DEFAULT `HighlighterKind`, with `mask` and `halo`
// kept as siblings rather than one replacing another: Zach's own words on
// the report were a QUESTION, not a ruling — "perhaps that's clearer than
// the shadow drop..?" — so this is a variants-with-a-recommended-default
// delivery (his own standing preference), not a swap. See
// `HighlighterKind`'s own doc below for what each kind means and where it
// is implemented.

import { Info, OctagonX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

/* ------------------------------------------------------------------ */
/* The vocabulary — §1                                                 */
/* ------------------------------------------------------------------ */

/** The closed set. Three members, like the skin table's fixed 13 tokens
 *  (skin.ts:89) — an open-ended set of marks degenerates into a pile of
 *  per-callsite overrides. */
export type DiagnosticSeverity = "error" | "warning" | "info";

export const DIAGNOSTIC_SEVERITIES: DiagnosticSeverity[] = ["error", "warning", "info"];

export interface Diagnostic {
  /**
   * Stable, producer-owned. Appendix B records the cost of not having one:
   * maxGraph's `setCellWarning(cell, null)` deletes EVERY overlay on the
   * cell, and per-item identity is what prevents that. It is also what
   * lets a host diff the list per item instead of rebuilding it (JointJS's
   * `list` highlighter skips `createListItem` for unchanged entries).
   */
  id: string;
  severity: DiagnosticSeverity;
  /** One-line human explanation — the FR's "text explanation for what the
   *  issue is". Optional: a mark can render before its prose exists. */
  message?: string;
  /** Rule id — VS Code's `Ruff(F407)` slot. */
  code?: string;
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * One mark, N messages: every mark-bearing component's CHROME (the halo,
 * the glow, the underline, the backdrop) is painted once at the worst
 * severity present — never a fifth `state`, never a per-finding stack of
 * paint layers. `undefined` for an absent or empty list, never persisted —
 * the same contract as `received` (appearance.ts) and `dimmed`/`hinting`
 * (host-computed, re-derived every render).
 */
export function maxDiagnosticSeverity(diagnostics?: readonly Diagnostic[]): DiagnosticSeverity | undefined {
  if (!diagnostics || diagnostics.length === 0) return undefined;
  return diagnostics.reduce<DiagnosticSeverity>(
    (worst, d) => (SEVERITY_RANK[d.severity] < SEVERITY_RANK[worst] ? d.severity : worst),
    diagnostics[0].severity,
  );
}

/* ------------------------------------------------------------------ */
/* Tokens — §2. Ported, not invented: packages/bbox-ui/src/theme.css:28-31 */
/* / :79-89 — see src/globals.css's own port of these three.            */
/* ------------------------------------------------------------------ */

/**
 * severity -> CSS colour. `error` alone carries a fallback (`--destructive`
 * — every shadcn theme defines it), per §2's own table; `warning`/`info`
 * need none because this kit always ports the two tokens that back them
 * (src/globals.css).
 */
export function diagnosticColorVar(severity: DiagnosticSeverity): string {
  switch (severity) {
    case "error":
      return "var(--bbox-danger, var(--destructive))";
    case "warning":
      return "var(--bbox-warning)";
    case "info":
      return "var(--bbox-accent)";
  }
}

/* ------------------------------------------------------------------ */
/* HighlighterKind — Appendix A's JointJS table, Zach's mid-run ask:     */
/* "borrow their terminology... they have both the stroke and also the  */
/* mask... we can support both!"                                        */
/* ------------------------------------------------------------------ */

/**
 * How a highlighter draws itself, per JointJS's own vocabulary
 * (docs/INVALID-STATES-PLAN.md Appendix A's table — `dia.HighlighterView`'s
 * five types, of which this kit implements the three that apply to marking
 * an already-drawn element rather than restyling its own fill/class):
 *
 * - `"stroke"` — a crisp outline traced at a fixed offset from the
 *   element's own silhouette. JointJS's own docs call this "the same
 *   outline, cheaper and less precise" than `mask`: on a shape with
 *   corners, an offset outline drawn at the ORIGINAL corner radius is not
 *   truly equidistant at the corners (the offset silhouette should grow
 *   its OWN radius by the offset amount, and a cheap implementation
 *   usually does not bother). The DEFAULT kind — Zach, reacting to the
 *   report's drop-shadow halo: "I do wonder if visual language wise if we
 *   should just borrow from jointjs and do the highlighting.. perhaps
 *   that's clearer than the shadow drop..?" — a question, not a ruling,
 *   which is why `halo` below is kept, not deleted.
 * - `"mask"` — the equidistant version: JointJS reaches for real SVG
 *   masking to get a genuinely parallel outline around an arbitrary
 *   silhouette, at a real performance cost, which is exactly why they
 *   document it as the pricier alternative to `stroke`. Appendix B's own
 *   finding is the load-bearing citation for how this kit implements it:
 *   "`mask` with `deep: true` falls back to `getBoundingClientRect()` when
 *   the target is HTML inside a `foreignObject`" — every component this
 *   axis marks is plain HTML, not an SVG silhouette, so this kit's `mask`
 *   is ALWAYS a bounding-rect technique, never a pixel-traced one, matching
 *   JointJS's own documented HTML fallback rather than overbuilding a
 *   silhouette tracer nothing here needs. Concretely: for a rounded
 *   rectangle (`Block`), the equidistant offset of a rounded rect by `d` is
 *   exactly a rounded rect with the SAME straight edges offset by `d` and
 *   the corner radius increased by `d` (the Minkowski sum of a rounded
 *   rectangle and a disc) — `highlighterMaskFrameStyle` below is that
 *   arithmetic, not a literal `<mask>` element, because the bounding-rect
 *   case never needs one. For a shape with no corners at all (`Port`'s
 *   circle), the equidistant offset of a circle is trivially a larger
 *   circle — `stroke` and `mask` are the IDENTICAL geometry there, and
 *   `Port` says so rather than drawing two indistinguishable rings.
 * - `"halo"` — this kit's own pre-existing treatment (a soft box-shadow
 *   ring on `Port`, a glow prepended to `Block`'s shadow list, a
 *   translucent backdrop under `Trace`): what the proposal report showed
 *   Zach before this feedback. Not JointJS vocabulary — kept as the third
 *   sibling because he questioned it, he did not reject it.
 */
export type HighlighterKind = "stroke" | "mask" | "halo";

export const HIGHLIGHTER_KINDS: HighlighterKind[] = ["stroke", "mask", "halo"];

/** Zach's own lean, from the report feedback (see `HighlighterKind`'s own
 *  doc) — every mark-bearing component defaults here unless a story is
 *  deliberately demonstrating a different kind. */
export const DEFAULT_HIGHLIGHTER_KIND: HighlighterKind = "stroke";

/**
 * The `stroke` kind for a DOM rectangle (`Block`): a plain CSS `outline`,
 * offset outward from the border box. Cheap and browser-native — modern
 * Chromium/Firefox already clip an `outline`'s corners to follow the
 * element's OWN `border-radius`, but at the SAME radius the box itself
 * has, which is exactly JointJS's "less precise" than `mask`: the outline
 * stops being truly equidistant the moment the box has any radius at all.
 * `offsetPx` is the gap between the box's own border and the drawn line.
 */
export function highlighterStrokeOutlineStyle(color: string, offsetPx: number, widthPx = 2): CSSProperties {
  return {
    outline: `${widthPx}px solid ${color}`,
    outlineOffset: offsetPx,
  };
}

/**
 * The `mask` kind for a DOM rectangle — see `HighlighterKind`'s own doc
 * for the Minkowski-sum reasoning. A sibling frame, sized `offsetPx`
 * larger on every side (`inset: -offsetPx`) so it never affects the
 * marked element's own layout box, with `radiusCss` (the SAME
 * `var(--bbox-skin-radius, ...)` chain the element's own corner reads)
 * grown by exactly `offsetPx` — `outline-offset` cannot do this (it
 * cannot touch `border-radius`), which is the whole reason this needs a
 * second element rather than one CSS property on the original.
 */
export function highlighterMaskFrameStyle(color: string, offsetPx: number, radiusCss: string, widthPx = 2): CSSProperties {
  return {
    position: "absolute",
    inset: -offsetPx,
    borderRadius: `calc(${radiusCss} + ${offsetPx}px)`,
    border: `${widthPx}px solid ${color}`,
    pointerEvents: "none",
  };
}

/* ------------------------------------------------------------------ */
/* The underline helper — §5's EditableText/LabeledPort/ValueCapsule row */
/* ------------------------------------------------------------------ */

/**
 * The one shared recipe behind "wavy underline, resting text" (§7's stock-
 * parts table: plain CSS `text-decoration`, no library). `error`/`warning`
 * wear a wavy line; `info` a dotted one — the same split §5 draws between a
 * halo and nothing, restated in the underline's own vocabulary.
 */
export function diagnosticUnderlineStyle(severity: DiagnosticSeverity): CSSProperties {
  return {
    textDecorationLine: "underline",
    textDecorationStyle: severity === "info" ? "dotted" : "wavy",
    textDecorationColor: diagnosticColorVar(severity),
    // Thickened slightly so the mark reads as deliberate at body-text sizes
    // rather than as a stray browser-default decoration.
    textDecorationThickness: "1.5px",
    textUnderlineOffset: "2px",
  };
}

/* ------------------------------------------------------------------ */
/* DiagnosticTooltip — the hover half of §5's interaction contract:    */
/* "hover any marked text/dot -> Tooltip with message + code (no       */
/* actions)". A thin wrapper, not a new visual: absent/empty           */
/* `diagnostics` renders `children` completely untouched, so a mark-   */
/* bearing component pays zero DOM cost at rest (same contract as      */
/* `Port`'s own `showHitRegion`/`hinting` — geometry identical on or   */
/* off).                                                                */
/* ------------------------------------------------------------------ */

export interface DiagnosticTooltipProps {
  diagnostics?: readonly Diagnostic[];
  /** The marked element itself — becomes the Tooltip's trigger via Base
   *  UI's `render` merge (the same pattern `Tooltip.stories.tsx`'s
   *  `OnIconButton` story already uses for a real button). */
  children: ReactElement;
}

export function DiagnosticTooltip({ diagnostics, children }: DiagnosticTooltipProps): ReactElement {
  if (!diagnostics || diagnostics.length === 0) return children;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent side="top">
          <div data-slot="diagnostic-tooltip-body" className="flex flex-col gap-1">
            {diagnostics.map((d) => (
              <div key={d.id} className="flex items-center gap-1.5">
                {d.code ? <span className="opacity-70">{d.code}</span> : null}
                <span>{d.message ?? d.severity}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* DiagnosticFlag — §4's one genuinely-new interactive composition:    */
/* the anchored corner chip, wired as a Popover trigger. Message/code/ */
/* actions/footer is the click half of §5's contract; the hover half   */
/* lives on whatever it is attached to, via `DiagnosticTooltip` above. */
/* ------------------------------------------------------------------ */

const SEVERITY_ICON: Record<DiagnosticSeverity, LucideIcon> = {
  error: OctagonX,
  warning: TriangleAlert,
  info: Info,
};

/** The chip's own diameter, px — small enough to straddle a Block's corner
 *  or ride a LabeledPort's secondary slot without dominating either. */
export const DIAGNOSTIC_FLAG_SIZE_PX = 18;

export interface DiagnosticFlagProps {
  /** Non-empty — a caller renders no flag at all when the list is empty;
   *  "nothing" is the mark-bearing component's own job (§5's own table),
   *  not this component's. */
  diagnostics: Diagnostic[];
  /** The host's own follow-up controls, inside the popover body — VS
   *  Code's action button. Absent renders none, same present-beats-absent
   *  contract `LabeledPort`'s slots use. */
  actions?: ReactNode;
  /** Footer links — VS Code's View Problem / Quick Fix row. */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// WHY lucide-react is imported DIRECTLY here rather than through
// `./glyph`'s resolver-context pattern (§7's stock-parts table names "via
// Glyph"): `glyph.tsx` imports `@bbox-ui/glyph-content`, `private: true`
// and unpublished — the same blocker class CLAUDE.md already names for the
// two canvas adapters, and the exact reason `glyph.tsx` itself is
// deliberately NOT a registry item. `DiagnosticFlag` IS meant to ship as a
// registry item (this axis's one new interactive component), and this
// kit's registry items never take a `registryDependency` on each other —
// so it cannot depend on a component that cannot itself be installed.
// `dropdown-menu.tsx` already sets the precedent of importing lucide-react
// icons straight from the package for exactly this reason.
export function DiagnosticFlag({ diagnostics, actions, footer, className, style }: DiagnosticFlagProps) {
  const severity = maxDiagnosticSeverity(diagnostics) ?? "info";
  const Icon = SEVERITY_ICON[severity];
  const color = diagnosticColorVar(severity);
  const count = diagnostics.length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-slot="diagnostic-flag"
            data-severity={severity}
            data-count={count > 1 ? count : undefined}
            aria-label={`${count} ${severity} diagnostic${count === 1 ? "" : "s"}`}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-2",
              className,
            )}
            style={{
              width: DIAGNOSTIC_FLAG_SIZE_PX,
              height: DIAGNOSTIC_FLAG_SIZE_PX,
              background: "var(--card)",
              borderColor: color,
              color,
              ...style,
            }}
          >
            <Icon aria-hidden style={{ width: "70%", height: "70%" }} />
            {/* The badge's own COUNT (Appendix B item 3 / convergence
                table: Vyuh's status badges, maxGraph's
                `containsValidationErrors`) — the one piece of chrome a
                scalar `diagnostic` could never have rendered, and the
                deciding reason §1 was amended to a list. One finding = no
                count, same read as today's single-mark design. */}
            {count > 1 && (
              <span
                data-slot="diagnostic-flag-count"
                aria-hidden
                className="absolute -bottom-1 -right-1 inline-flex min-w-[14px] items-center justify-center rounded-full px-[3px] text-[9px] leading-[14px] font-semibold text-white"
                style={{ background: color }}
              >
                {count}
              </span>
            )}
          </button>
        }
      />
      {/* Click: the full anatomy — message · code chip · host actions ·
          host footer, one block per diagnostic (VS Code's own hover, which
          is Zach's reference screenshot). */}
      <PopoverContent data-slot="diagnostic-flag-content">
        <div className="flex flex-col gap-2">
          {diagnostics.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <span style={{ color: diagnosticColorVar(d.severity) }}>{d.message ?? d.severity}</span>
              {d.code ? (
                <Badge variant="outline" size="sm">
                  {d.code}
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
        {actions ? (
          <div data-slot="diagnostic-flag-actions" className="mt-2 flex gap-2">
            {actions}
          </div>
        ) : null}
        {footer ? (
          <div data-slot="diagnostic-flag-footer" className="mt-2 flex gap-3 text-xs text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
