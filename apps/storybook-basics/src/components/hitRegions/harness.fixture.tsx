/**
 * src/components/hitRegions/harness.fixture.tsx — the shared stage every `Hit Regions/*`
 * story stands on: zoom control, policy control, per-constant slider, and
 * the live hit probe.
 *
 * The format is copied from pyblocks' hit-constants gallery
 * (docs/hit-constants-gallery-2026-08-27.html) at Zach's instruction —
 * "I think you can actually directly copy the format that was used in
 * those HTML reports": a zoom segment (0.5× · 1× · 2× · 4×), live
 * HIT/MISS feedback under the pointer, and a slider per constant that
 * starts on the default.
 *
 * ONE deliberate improvement over the donor: the donor re-implemented
 * every region in canvas 2D and hit-tested its own math. Here the probe
 * asks the BROWSER (`document.elementsFromPoint`) whether the real hit
 * element is under the pointer — the same hit test a real click takes —
 * so the readout cannot disagree with the component's actual behaviour.
 * A drawn region that does not correspond to real hit-testing is the
 * failure mode this whole exercise exists to avoid.
 *
 * WHY this lives in `src/hitRegions/` and not `src/components/`: it is a
 * story/dev harness that IMPORTS components (a consumer), not an atom a
 * scene is drawn with. The paint tokens the components themselves need
 * live on the component side (`src/components/hitRegion.ts`); the split
 * is the same core/consumer line the repo already draws.
 */
/* WHY the `.fixture` suffix (2026-09-21, the kit refactor): this file is a
 * STORY harness, not kit source — it exists only so the six `HitRegions*`
 * stories beside it share one bench. It imports `scene/hitPolicy`, which
 * `layering.test.ts`'s import wall forbids to anything under `components/`,
 * and rightly so: the wall's rule is "a component cannot reach into the
 * scene kit". Naming it by the convention `elbow/elbowDirections.fixture.tsx`
 * already set is what lets that wall stay a stated rule (source vs. story
 * support) instead of growing a hand-maintained allowlist of exceptions. */

import { useState, type CSSProperties, type ReactNode } from "react";

import { HIT_POLICY_LABELS, ZOOM_LEVELS, type HitPolicy } from "../../scene/hitPolicy";

/* ------------------------------------------------------------------ */
/* Small controls — same local-control idiom the existing story files  */
/* (Block, PortEdge, BlockPort) each carry; shared here because six    */
/* hit-region stories reuse all of them.                               */
/* ------------------------------------------------------------------ */

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  ariaLabel?: string;
}) {
  return (
    <span
      role="group"
      aria-label={ariaLabel}
      style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          style={{
            appearance: "none",
            border: "none",
            borderLeft: option === options[0] ? "none" : "1px solid var(--border)",
            background: option.value === value ? "var(--bbox-primary, var(--primary))" : "transparent",
            color: option.value === value ? "var(--background)" : "var(--foreground)",
            font: "inherit",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
            padding: "4px 12px",
            cursor: "pointer",
          }}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

export function ZoomControl({ zoom, onChange }: { zoom: number; onChange(zoom: number): void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>Zoom</span>
      <Segmented
        ariaLabel="Zoom"
        options={ZOOM_LEVELS.map((z) => ({ value: String(z), label: `${z}×` }))}
        value={String(zoom)}
        onChange={(v) => onChange(Number(v))}
      />
    </span>
  );
}

export function PolicyControl({ policy, onChange }: { policy: HitPolicy; onChange(policy: HitPolicy): void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>Hit size</span>
      <Segmented
        ariaLabel="Hit size policy"
        options={(Object.keys(HIT_POLICY_LABELS) as HitPolicy[]).map((p) => ({ value: p, label: HIT_POLICY_LABELS[p] }))}
        value={policy}
        onChange={onChange}
      />
    </span>
  );
}

/**
 * One slider per hit constant — "it starts on default, but having the
 * control to change it myself is very cool" (Zach, verbatim brief). The
 * label carries the constant's NAME and its source, so the slider always
 * says which number in which file it is standing in for.
 */
export function ConstantSlider({
  name,
  source,
  value,
  defaultValue,
  min,
  max,
  onChange,
}: {
  /** The constant's exported name, e.g. "PORT_HIT_PX". */
  name: string;
  /** file:line it lives at, e.g. "port.layout.ts:58". */
  source: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
      <span style={{ fontFamily: "monospace", minWidth: 260 }}>
        {name}
        <span style={{ color: "var(--muted-foreground)" }}> · {source}</span>
      </span>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 180 }}
      />
      <span style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", minWidth: 130 }}>
        {value}px{value === defaultValue ? " (default)" : ` (default ${defaultValue})`}
      </span>
      {value !== defaultValue && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          style={{ font: "inherit", fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
        >
          reset
        </button>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* The zoomed stage                                                    */
/* ------------------------------------------------------------------ */

/**
 * A real viewport transform — CSS `scale(zoom)`, which the browser's own
 * hit testing follows — over a fixed scene-space box. The outer box takes
 * the SCALED footprint so page layout tracks the zoom instead of
 * overlapping the readout below.
 */
export function ZoomStage({
  zoom,
  width,
  height,
  children,
  ...rest
}: {
  zoom: number;
  width: number;
  height: number;
  children: ReactNode;
} & Record<`data-${string}`, string | number | undefined>) {
  return (
    <div style={{ width: width * zoom, height: height * zoom }} {...rest}>
      <div
        data-slot="hit-zoom-stage"
        style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "top left" }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The live probe                                                      */
/* ------------------------------------------------------------------ */

export interface HitTarget {
  /** Human name for the readout, e.g. "port halo". */
  label: string;
  /** Matched with `Element.closest` against the real element stack under
   * the pointer — so the region a target claims IS the region the browser
   * would deliver a click to. */
  selector: string;
}

/** The browser's own answer for a point: the first target whose selector
 * matches anything in `document.elementsFromPoint`'s stack. Exposed for
 * play functions, which probe exact coordinates instead of moving a
 * pointer. */
export function hitTargetAt(x: number, y: number, targets: readonly HitTarget[]): HitTarget | null {
  const stack = document.elementsFromPoint(x, y);
  for (const target of targets) {
    if (stack.some((el) => el.closest(target.selector) != null)) return target;
  }
  return null;
}

/**
 * Wraps a stage and reports, live, whether the pointer is on a real hit
 * target — the donor gallery's "move the pointer inside a pane and it
 * tells you whether you would have hit", answered by the browser's hit
 * test instead of a re-implementation.
 */
export function HitProbe({
  targets,
  children,
  style,
}: {
  targets: readonly HitTarget[];
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [reading, setReading] = useState<{ label: string | null; x: number; y: number } | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", ...style }}>
      <div
        data-slot="hit-probe-stage"
        style={{ cursor: "crosshair" }}
        onPointerMove={(event) => {
          const hit = hitTargetAt(event.clientX, event.clientY, targets);
          const rect = event.currentTarget.getBoundingClientRect();
          setReading({
            label: hit ? hit.label : null,
            x: Math.round(event.clientX - rect.left),
            y: Math.round(event.clientY - rect.top),
          });
        }}
        onPointerLeave={() => setReading(null)}
      >
        {children}
      </div>
      <div
        data-slot="hit-probe-readout"
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          minHeight: 18,
          color: reading == null ? "var(--muted-foreground)" : reading.label ? "var(--bbox-received, #3fb950)" : "var(--destructive, #e5534b)",
        }}
      >
        {reading == null
          ? "move the pointer over the stage"
          : `${reading.label ? `HIT — ${reading.label}` : "MISS"} · ${reading.x},${reading.y}`}
      </div>
    </div>
  );
}
