"use client";

// src/editor/focusControls.tsx — the floating toolbar half of the "focus
// view" lens. Ported from SystemSketch's
// `src/propagation/PropagationFocusControls.tsx` (169 lines) as POLICY, not
// as code — that donor is hard-wired to tldraw (`useEditor`, `useValue`,
// `useSyncExternalStore` over an `Editor`-keyed store). None of that
// travels; see `src/editor/README.md` for why this kit takes callbacks and
// plain data instead. What DOES travel: the shape of the control (one
// "Focus" trigger when nothing is focused yet, two independently-bounded
// range inputs plus a "Clear" once it is), and — Zach's own memory of this
// feature, 2026-09-18: "We made the left slider flipped" — the RTL decision
// on the upstream range, quoted below at its original seam.
//
// Zach's other explicit ask this port makes good on: "make sure we are
// using shadcn components." The two range inputs are the vendored
// `../components/slider.tsx` (the stock shadcn `new-york` Slider over
// `@base-ui/react/slider`) instead of the donor's bare `<input type="range">`.
//
// Donor: /home/bam/systemsketch/src/propagation/PropagationFocusControls.tsx,
// read in full 2026-09-18. See docs/ALGORITHM-PROVENANCE.md.
import { DirectionProvider } from "@base-ui/react/direction-provider";

import { Button } from "../components/button";
import { Slider } from "../components/slider";
import type { FocusDirection, FocusStepLimits } from "../scene/focus";

/** What the lens does to everything OUTSIDE the focused set. */
/**
 * WHY both range inputs carry `!` on their width, and `shrink-0`.
 *
 * `slider.tsx` is verbatim stock and its root carries
 * `data-[orientation=horizontal]:w-full`. `cn`/tailwind-merge keeps that
 * variant class ALONGSIDE the plain `w-[clamp(…)]` below — they are different
 * keys to it — and the variant then wins on specificity, because an attribute
 * selector beats none. A `w-full` inside a shrink-to-fit parent is circular,
 * and the browser resolves it to ZERO: measured in the running app
 * (`focusLens.smoke.test.tsx`, 2026-09-21) the track came back
 * `width: 0` inside `apps/systemsketch`'s floating mount, where Playwright
 * then refused to click it as "not visible". It only looked right in the
 * story because the bench around it has a definite width.
 *
 * `!` puts the explicit width back in front, and `shrink-0` keeps the row
 * from taking it away again when the whole control is narrower than its
 * content.
 */

/** What the lens does to everything OUTSIDE the focused set. */
export type FocusLensMode = "dim" | "hide";

export interface FocusControlsProps {
  /** Something is selected that COULD start a focus (donor's
   *  `propagationSeedFromSelection` result) — shows the "Focus" trigger
   *  when a lens isn't running yet. */
  hasSeed: boolean;
  /** A lens is currently running (donor's `focus.seedId !== null`). */
  active: boolean;
  limits: FocusStepLimits;
  upstreamSteps: number;
  downstreamSteps: number;
  onStart: () => void;
  onStepsChange: (direction: FocusDirection, value: number) => void;
  onClear: () => void;
  /**
   * DIM leaves the rest of the board painted faintly; HIDE takes it away.
   *
   * WHY the toggle is OPTIONAL and the control is unchanged without it: the
   * archive's lens only ever dimmed (`propagation-focus.css` is the whole of
   * its paint), so a host that wants exactly the ported behaviour passes
   * neither prop and gets exactly it. Hiding is a real second mode and not a
   * stronger dim — the host has to take the hidden shapes out of hit-testing
   * too, or the board lets you grab what you just put away — so this kit will
   * not offer the choice unless a host says it can honour it.
   */
  mode?: FocusLensMode;
  onModeChange?: (mode: FocusLensMode) => void;
  className?: string;
}

/** The small selection lens: one explicit seed, separately bounded
 *  directions. Donor's own line, `PropagationFocusControls.tsx:22`. */
export function FocusControls({ hasSeed, active, limits, upstreamSteps, downstreamSteps, onStart, onStepsChange, onClear, mode = "dim", onModeChange, className }: FocusControlsProps) {
  if (!hasSeed && !active) return null;
  return (
    <div
      data-slot="focus-controls"
      role="group"
      aria-label="Dataflow focus"
      className={
        "inline-flex min-h-[30px] items-center gap-2.5 rounded-lg bg-popover px-1.5 py-1 text-popover-foreground shadow-md ring-1 ring-foreground/10" +
        (className ? ` ${className}` : "")
      }
    >
      {!active ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="focus-start"
          title="Highlight reachable upstream and downstream graph steps"
          onClick={onStart}
        >
          Focus
        </Button>
      ) : (
        <>
          <label
            data-slot="focus-range"
            data-direction="upstream"
            className="inline-flex min-w-0 items-center gap-1"
            title={limits.upstream === 0 ? "No upstream steps are reachable" : `Upstream: ${upstreamSteps} of ${limits.upstream} reachable steps`}
          >
            <output
              data-testid="focus-upstream-maximum"
              aria-label={`${limits.upstream} maximum upstream steps`}
              className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {limits.upstream}
            </output>
            {/* WHY: the two graph directions read away from the central
                seed — Zach, 2026-09-18: "We made the left slider flipped".
                DirectionProvider (base-ui's own direction context, not a
                bare `dir` attribute — this Slider is a composed control,
                not a native `<input>`) keeps upstream's visual AND
                keyboard direction honest instead of faking it with a
                paint-only flip. Scoped to just this Slider, matching the
                donor's own scope: its `dir="rtl"` sat on the `<input>`
                alone, never on the wrapping `<label>`. */}
            <DirectionProvider direction="rtl">
              <Slider
                data-testid="focus-upstream"
                aria-label="Upstream propagation steps"
                aria-valuetext={limits.upstream === 0 ? "No upstream steps reachable" : `${upstreamSteps} of ${limits.upstream} upstream steps`}
                className="w-[clamp(96px,10vw,150px)]! shrink-0"
                min={limits.upstream === 0 ? 0 : 1}
                max={limits.upstream}
                step={1}
                value={[upstreamSteps]}
                disabled={limits.upstream === 0}
                onValueChange={(value) => onStepsChange("upstream", Array.isArray(value) ? value[0] : value)}
              />
            </DirectionProvider>
            <output
              data-testid="focus-upstream-count"
              aria-label={limits.upstream === 0 ? "No upstream steps reachable" : `${upstreamSteps} upstream steps selected`}
              className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {upstreamSteps}
            </output>
          </label>
          <span className="text-[10px] text-muted-foreground">steps</span>
          <label
            data-slot="focus-range"
            data-direction="downstream"
            className="inline-flex min-w-0 items-center gap-1"
            title={limits.downstream === 0 ? "No downstream steps are reachable" : `Downstream: ${downstreamSteps} of ${limits.downstream} reachable steps`}
          >
            <output
              data-testid="focus-downstream-count"
              aria-label={limits.downstream === 0 ? "No downstream steps reachable" : `${downstreamSteps} downstream steps selected`}
              className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {downstreamSteps}
            </output>
            <Slider
              data-testid="focus-downstream"
              aria-label="Downstream propagation steps"
              aria-valuetext={limits.downstream === 0 ? "No downstream steps reachable" : `${downstreamSteps} of ${limits.downstream} downstream steps`}
              className="w-[clamp(96px,10vw,150px)]! shrink-0"
              min={limits.downstream === 0 ? 0 : 1}
              max={limits.downstream}
              step={1}
              value={[downstreamSteps]}
              disabled={limits.downstream === 0}
              onValueChange={(value) => onStepsChange("downstream", Array.isArray(value) ? value[0] : value)}
            />
            <output
              data-testid="focus-downstream-maximum"
              aria-label={`${limits.downstream} maximum downstream steps`}
              className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {limits.downstream}
            </output>
          </label>
          {onModeChange ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="focus-mode"
              data-mode={mode}
              aria-pressed={mode === "hide"}
              title={mode === "dim" ? "Isolate: hide everything outside the focus" : "Focus: dim everything outside the focus instead of hiding it"}
              onClick={() => onModeChange(mode === "dim" ? "hide" : "dim")}
            >
              {mode === "dim" ? "Isolate" : "Dim"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" data-testid="focus-clear" title="Clear focus" onClick={onClear}>
            Clear
          </Button>
        </>
      )}
    </div>
  );
}
