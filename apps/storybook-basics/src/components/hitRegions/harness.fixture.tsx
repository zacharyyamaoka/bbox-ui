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

import { useLayoutEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { HIT_POLICY_LABELS, ZOOM_LEVELS, type HitPolicy } from "../../scene/hitPolicy";
import { DRAG_DECLARATIONS, resolveGrab, type DragDeclaration } from "../../scene/interactions/dragPolicy";
import { OWNER_ATTR, declareDrag, grabChainFrom } from "../../hosts/grabChain";

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
/* Per-component targets                                               */
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

/* ------------------------------------------------------------------ */
/* Who owns the pointer — the host outline (2026-09-22)                 */
/* ------------------------------------------------------------------ */

/*
 * Zach, 2026-09-22: "Particularly the region/expanded views are important
 * because its like what will go through to the children and what will stay
 * on top? Also I think perhaps in this hit testing, when it is hit you can
 * like draw the outline... or something of what outline will draw inside
 * the hosts when its hit?"
 *
 * WHY the outline is DERIVED and never looked up per story: the answer to
 * "what does a press here select" already has one owner in this repo — the
 * declarations in `scene/interactions/dragPolicy.ts`, walked by
 * `hosts/grabChain.ts`'s nearest-declaration rule. A per-story map of
 * "this slot outlines that box" would be a second copy of that rule, and it
 * would keep drawing the old answer the day the policy changes. So the
 * outline below takes the browser's own `elementFromPoint` (the element a
 * click would really land on), runs the SAME walk a host runs, and paints
 * whatever that walk says:
 *
 *   grab          -> the declaring node's whole box (what a host selects)
 *   owns-pointer  -> no node outline; the part that keeps the press is
 *                    dashed instead (a dot's cable, a toggle, a chevron)
 *   inert         -> nothing: the press passes through to what is beneath
 *
 * Both imports are engine-free (grabChain imports only dragPolicy), so no
 * story that uses this reaches React Flow or tldraw — `host:` stays empty.
 *
 * WHAT IT IS NOT, stated so nobody reads it as a capture: this is the
 * DECLARED policy (`DRAG_DECLARATIONS`), and on this base neither canvas
 * host implements it yet. tldraw hides every press on a block that is not
 * its own header from the editor (`contentOwnsPress`, tldrawHost.tsx:210),
 * and React Flow starts a node drag only from the stamped own header
 * (`DRAG_HANDLE_FOR_TYPE`, reactFlowHost.tsx:423-434). So "a block body
 * press outlines the block" is the policy's answer, not either host's
 * today. A per-host answer needs the host's own node DOM (its `nodrag`
 * member handles, its header marker), which a bare component stage does
 * not carry — owed as its own piece of work, not faked here.
 */

/** tldraw's own selection stroke, `--tl-color-selection-stroke:
 *  hsl(214, 84%, 56%)` (tldraw@5.3.2 `tldraw.css:170` light, `:225` dark —
 *  the same value in both). Copied as a literal, never imported: loading
 *  tldraw's stylesheet into a component story is the engine reach the core
 *  rule forbids. */
export const HOST_SELECTION_BLUE = "hsl(214, 84%, 56%)";

/** A pseudo-slot for a press that lands ON a region frame's own border
 *  rather than inside it — see `onFrameBorder`. */
export const FRAME_BORDER_SLOT = "region-frame-border";

/**
 * The declarations the outline resolves against: `DRAG_DECLARATIONS`
 * verbatim, plus the two BlockRegion needs and dragPolicy.ts does not have
 * yet.
 *
 * WHY the region rows live HERE and not in `DRAG_DECLARATIONS`: every row
 * there is the donor's, cited, and no donor row exists for a region. These
 * two are this lane's reading of BlockRegion's own documented rules, owed
 * upstream into dragPolicy.ts once Zach accepts them — kept in ONE place so
 * that move is one cut-and-paste, not a hunt through stories.
 *
 * The expanded region is the container case, the same shape as
 * `block:expanded`: its interior (the free body, every arm's body) is child
 * canvas and passes presses through, while its chrome stays on top.
 *   - The CORNER card grabs the WHOLE region, not itself. Zach, 2026-09-22:
 *     "when you hover on the corner block its the entire out frame that
 *     should become highlighted". Structurally that is BlockRegion's own
 *     header rule: a region is ONE node, and the corner card is how that
 *     node renders its interface (blockRegion.tsx, "ONE NODE, TWO PIECES OF
 *     PAINT"). So the corner is a PART of the region's declaration and never
 *     a declaring node of its own — the tempting alternative, declaring the
 *     corner Block as `block:solid`, would make nearest-declaration-wins
 *     outline the card alone.
 *   - An arm's header grabs the region for the same reason: an arm is a
 *     row of the region, not a node the canvas moves on its own.
 *   - The frame's own border grabs the region (`FRAME_BORDER_SLOT`).
 *   - The Blackbox toggle, the arm fold chevrons and every port dot own
 *     their press — the same `owns-pointer` role `bar` gives its controls.
 */
export const HIT_DECLARATIONS: Readonly<Record<string, DragDeclaration>> = {
  ...DRAG_DECLARATIONS,
  "region:expanded": {
    component: "BlockRegion (view=expanded)",
    face: "inert",
    parts: {
      "region-corner": "grab",
      "region-arm-header": "grab",
      [FRAME_BORDER_SLOT]: "grab",
      "region-body": "inert",
      "region-arm-body": "inert",
      "block-members": "inert",
      "block-member": "inert",
      "region-blackbox-toggle": "owns-pointer",
      "folding-chevron": "owns-pointer",
      "port-dot": "owns-pointer",
      "port-dot-halo": "owns-pointer",
      "block-port-rail": "owns-pointer",
    },
  },
  /** Port view and Expanded Opaque: the inside is hidden, so the face is
   *  solid — `block:solid`'s rows plus the one control this face adds. */
  "region:opaque": {
    component: "BlockRegion (view=port | expanded opaque)",
    face: "grab",
    parts: {
      "region-blackbox-toggle": "owns-pointer",
      "port-dot": "owns-pointer",
      "port-dot-halo": "owns-pointer",
      "block-port-rail": "owns-pointer",
      "port-label": "grab",
      "port-label-display": "grab",
    },
  },
};

/** Spread onto the element that IS one canvas node — the way a story
 *  wrapper declares itself until the component emits it (grabChain.ts's
 *  `declareDrag` doc). A block box that hugs its content, so the node's box
 *  is the component's box. */
export function nodeRoot(key: string, style?: CSSProperties): ReturnType<typeof declareDrag> & { style: CSSProperties } {
  return { ...declareDrag(key), style: { width: "max-content", ...style } };
}

/**
 * The extra style a node root needs around an INLINE component (Port,
 * LabeledPort — both `inline-flex`). WHY: as a plain block the wrapper is a
 * LINE BOX, 24px tall from the inherited strut, so the node's box would be
 * taller than the dot it declares (measured: 12×24 around a 12×12 dot —
 * blockPort.tsx's function-port holder hit the same thing). A flex wrapper
 * is exactly the child's box; `alignSelf` stops a flex parent stretching it.
 */
export const INLINE_NODE: CSSProperties = { display: "flex", alignSelf: "center" };

export type HostOutline =
  /** A host would select this node and paint its box. */
  | { kind: "node"; element: HTMLElement; owner: string; via: string }
  /** The subtree keeps the press; `element` is the part that owns it. */
  | { kind: "part"; element: HTMLElement; owner: string | null; via: string }
  /** Nothing is selected — the press falls through to what is beneath. */
  | { kind: "pass-through"; owner: string | null; via: string };

/**
 * Is (x, y) on a region frame's BORDER rather than inside it? The DOM hit
 * test cannot tell — the frame element answers for both — so this is the
 * one piece of host geometry the harness adds: outside the padding box but
 * inside the border box. The exact border width, no margin (a canvas host
 * adds its own hit margin on top; tldraw's is screen-space).
 */
function onFrameBorder(element: Element, x: number, y: number): boolean {
  if (element.getAttribute("data-slot") !== "region-frame" || !(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  // The zoom transform scales the border too; clientLeft/Top are in the
  // element's own (unscaled) px.
  const scale = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const left = rect.left + element.clientLeft * scale;
  const top = rect.top + element.clientTop * scale;
  const right = left + element.clientWidth * scale;
  const bottom = top + element.clientHeight * scale;
  return x < left || x >= right || y < top || y >= bottom;
}

/**
 * The outline a host would paint for a press at (x, y) inside `stage`.
 * `null` only when the point is not on the stage at all.
 */
export function hostOutlineAt(x: number, y: number, stage: Element): HostOutline | null {
  const top = document.elementFromPoint(x, y);
  if (!top || !stage.contains(top)) return null;
  const ownerElement = top.closest<HTMLElement>(`[${OWNER_ATTR}]`);
  if (!ownerElement || !stage.contains(ownerElement)) {
    // dragPolicy's own UNDECLARED_ROLE: an undeclared surface is inert.
    return { kind: "pass-through", owner: null, via: "undeclared" };
  }
  const chain = grabChainFrom(top, ownerElement);
  if (onFrameBorder(top, x, y)) chain.unshift({ slot: FRAME_BORDER_SLOT });
  const resolution = resolveGrab(chain, HIT_DECLARATIONS);
  if (resolution.role === "grab") {
    return { kind: "node", element: ownerElement, owner: resolution.owner ?? "", via: resolution.via };
  }
  if (resolution.role === "owns-pointer") {
    const part =
      resolution.via === "face" ? ownerElement : (top.closest<HTMLElement>(`[data-slot="${resolution.via}"]`) ?? ownerElement);
    return { kind: "part", element: part, owner: resolution.owner, via: resolution.via };
  }
  return { kind: "pass-through", owner: resolution.owner, via: resolution.via };
}

/** One line of prose per outcome — the readout and the captions share it,
 *  so the same result is never worded two ways. */
export function describeHostOutline(outline: HostOutline | null): string {
  if (outline == null) return "host outline: move the pointer over the stage";
  switch (outline.kind) {
    case "node":
      return `declared policy → outline the whole ${outline.owner} (pressed ${outline.via}; stays on top)`;
    case "part":
      return `no node outline — ${outline.via} owns the pointer; the host stays out (dashed)`;
    case "pass-through":
      return outline.owner == null
        ? "no outline — nothing declared here; the press reaches the canvas"
        : `no outline — ${outline.via} passes through to what is beneath`;
  }
}

/* ------------------------------------------------------------------ */
/* The role map — "Show hit regions" for a composite                    */
/* ------------------------------------------------------------------ */

/**
 * Paint per outcome. Orange is the existing hit-region hue (the press lands
 * on a node); violet is a part that keeps its own press; grey is a
 * pass-through. Blue is kept for the host outline alone, so the two
 * overlays never read as one.
 */
export const OUTCOME_PAINT: Record<HostOutline["kind"], { fill: string; label: string }> = {
  node: { fill: "color-mix(in srgb, var(--bbox-primary, #f0883e) 30%, transparent)", label: "stays on top — selects the node" },
  part: { fill: "color-mix(in srgb, oklch(0.6 0.2 300) 45%, transparent)", label: "owns its press (dot, toggle, chevron)" },
  "pass-through": { fill: "color-mix(in srgb, currentColor 16%, transparent)", label: "passes through to what is beneath" },
};

/**
 * WHY a SAMPLED map and not paint on each declared element: a composite's
 * answer is not one element's box — a corner card sits over the frame, a
 * member sits inside a pass-through body, a rail straddles a wall. Asking
 * the real resolver every few screen pixels paints exactly what a press
 * there would do, overlaps included, and it cannot drift from the outline
 * because it IS the outline's function. The per-component stories keep the
 * component-painted `showHitRegion`; this is for the composites.
 */
function RoleMap({ stage, mapKey }: { stage: HTMLElement | null; mapKey: string }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    if (!stage || !canvas) return;
    let frame = 0;
    const paint = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      // A 4× stage stays at a bounded number of probes.
      const step = Math.max(3, Math.ceil(Math.sqrt((rect.width * rect.height) / 60000)));
      // WHY resolve through the canvas's own computed `color`: a 2D context
      // cannot read `var(--…)` or `currentColor`, and an unparseable
      // `fillStyle` is silently IGNORED — the previous colour keeps painting
      // (measured: every outcome came out violet). Computed style resolves
      // both, in the theme actually in force.
      const paintFor = {} as Record<HostOutline["kind"], string>;
      for (const kind of Object.keys(OUTCOME_PAINT) as HostOutline["kind"][]) {
        canvas.style.color = OUTCOME_PAINT[kind].fill;
        paintFor[kind] = getComputedStyle(canvas).color;
      }
      canvas.style.color = "";
      for (let y = 0; y < rect.height; y += step) {
        for (let x = 0; x < rect.width; x += step) {
          const outline = hostOutlineAt(rect.left + x + step / 2, rect.top + y + step / 2, stage);
          if (!outline || (outline.kind === "pass-through" && outline.owner == null)) continue;
          context.fillStyle = paintFor[outline.kind];
          context.fillRect(x, y, step, step);
        }
      }
      canvas.setAttribute("data-painted", mapKey);
    };
    // Two frames: BlockPort measures its bands in a layout effect and mounts
    // its rails on the NEXT render, so one frame paints a map with no rails.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(paint);
    });
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    observer.observe(stage);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [stage, canvas, mapKey]);
  return (
    <canvas
      ref={setCanvas}
      data-slot="hit-role-map"
      aria-hidden
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    />
  );
}

/** The legend: one swatch per outcome, plus the outline. */
export function RoleMapLegend() {
  return (
    <span style={{ display: "inline-flex", gap: 14, flexWrap: "wrap", fontSize: 11 }}>
      {(Object.keys(OUTCOME_PAINT) as HostOutline["kind"][]).map((kind) => (
        <span key={kind} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: OUTCOME_PAINT[kind].fill, outline: "1px solid var(--border)" }} />
          {OUTCOME_PAINT[kind].label}
        </span>
      ))}
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 2, outline: `2px solid ${HOST_SELECTION_BLUE}` }} />
        host outline
      </span>
    </span>
  );
}

/**
 * One declaration as a caption — generated from `HIT_DECLARATIONS`, the
 * same data the outline resolves with, so the words cannot disagree with
 * the behaviour. (policyStage.tsx's `DeclarationTable` is the long form; it
 * cannot be reused here because that module imports the React Flow host.)
 */
export function DeclarationLegend({ declarationKey }: { declarationKey: string }) {
  const declaration = HIT_DECLARATIONS[declarationKey];
  if (!declaration) return null;
  const roleWord = { grab: "stays on top", inert: "passes through", "owns-pointer": "owns its press" } as const;
  return (
    <div data-testid="declaration-legend" style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)", maxWidth: 760 }}>
      <span style={{ color: "var(--foreground)" }}>{declaration.component}</span> · face {roleWord[declaration.face]} ·{" "}
      {Object.entries(declaration.parts)
        .map(([slot, role]) => `${slot}: ${roleWord[role]}`)
        .join(" · ")}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The live probe                                                      */
/* ------------------------------------------------------------------ */

/**
 * Wraps a stage and reports, live, whether the pointer is on a real hit
 * target — the donor gallery's "move the pointer inside a pane and it
 * tells you whether you would have hit", answered by the browser's hit
 * test instead of a re-implementation.
 *
 * `targets` is the per-component probe the first six stories use; omit it
 * and the HIT line reports the resolver's outcome instead (the composites).
 * `hostOutline` draws what a host would outline for the element that owns
 * the pointer; `roleMap` paints the sampled outcome under every pixel.
 */
export function HitProbe({
  targets,
  hostOutline = false,
  roleMap = false,
  mapKey = "",
  children,
  style,
}: {
  targets?: readonly HitTarget[];
  hostOutline?: boolean;
  roleMap?: boolean;
  /** Anything that can move the map (zoom, view) — a change repaints it. */
  mapKey?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [reading, setReading] = useState<{ label: string | null; x: number; y: number } | null>(null);
  const [outline, setOutline] = useState<HostOutline | null>(null);
  // Where the last read was taken, published on the readout so a play
  // function can wait for ITS point rather than a fixed number of frames.
  const [readAt, setReadAt] = useState("");
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);

  const read = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const resolved = hostOutlineAt(event.clientX, event.clientY, event.currentTarget);
    setOutline(resolved);
    setReadAt(`${event.clientX},${event.clientY}`);
    const label = targets
      ? (hitTargetAt(event.clientX, event.clientY, targets)?.label ?? null)
      : resolved == null || (resolved.kind === "pass-through" && resolved.owner == null)
        ? null
        : `${resolved.via} · ${OUTCOME_PAINT[resolved.kind].label}`;
    setReading({ label, x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) });
  };

  // The outline's box in the frame's (unscaled) coordinates, measured off
  // the real element at render — zoom and layout come for free.
  const box =
    hostOutline && outline && outline.kind !== "pass-through" && frame
      ? (() => {
          const target = outline.element.getBoundingClientRect();
          const origin = frame.getBoundingClientRect();
          return { left: target.left - origin.left, top: target.top - origin.top, width: target.width, height: target.height };
        })()
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", ...style }}>
      <div ref={setFrame} style={{ position: "relative" }}>
        <div
          ref={setStage}
          data-slot="hit-probe-stage"
          style={{ cursor: "crosshair" }}
          onPointerMove={read}
          onPointerDown={read}
          onPointerLeave={() => {
            setReading(null);
            setOutline(null);
            setReadAt("");
          }}
        >
          {children}
        </div>
        {roleMap && <RoleMap stage={stage} mapKey={mapKey} />}
        {box && outline && outline.kind !== "pass-through" && (
          <div
            data-slot="host-outline"
            data-outline-kind={outline.kind}
            data-outline-via={outline.via}
            aria-hidden
            style={{
              position: "absolute",
              ...box,
              pointerEvents: "none",
              // `outline`, not `border`: it paints outside the box and adds
              // nothing to it, so this div's rect IS the target's rect.
              outline: `2px ${outline.kind === "node" ? "solid" : "dashed"} ${HOST_SELECTION_BLUE}`,
            }}
          />
        )}
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
      {hostOutline && (
        <div
          data-slot="host-outline-readout"
          data-kind={outline?.kind ?? "none"}
          data-via={outline?.via ?? ""}
          data-owner={outline?.owner ?? ""}
          data-read-at={readAt}
          style={{ fontFamily: "monospace", fontSize: 12, minHeight: 18, color: outline?.kind === "node" ? HOST_SELECTION_BLUE : "var(--muted-foreground)" }}
        >
          {describeHostOutline(outline)}
        </div>
      )}
    </div>
  );
}

/**
 * For play functions: move the pointer to (x, y) over the stage the way a
 * user would, and return what the browser puts there, the readout, and the
 * drawn outline (if any). `stage` is `[data-slot="hit-probe-stage"]`.
 */
export async function probeHost(
  stage: HTMLElement,
  x: number,
  y: number,
): Promise<{ top: Element | null; kind: string; via: string; owner: string; outline: DOMRect | null; outlineKind: string | null }> {
  stage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerType: "mouse" }));
  const probe = stage.parentElement?.parentElement ?? stage;
  const readout = () => probe.querySelector<HTMLElement>('[data-slot="host-outline-readout"]');
  // WHY poll for this point's own read instead of waiting one frame: a
  // pointermove update is not guaranteed to commit before the next frame
  // under load, and a stale readout silently answers for the PREVIOUS point.
  for (let frame = 0; frame < 60 && readout()?.getAttribute("data-read-at") !== `${x},${y}`; frame++) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  const read = readout();
  if (read?.getAttribute("data-read-at") !== `${x},${y}`) throw new Error(`the probe never read ${x},${y}`);
  const drawn = probe.querySelector<HTMLElement>('[data-slot="host-outline"]');
  return {
    top: document.elementFromPoint(x, y),
    kind: read.getAttribute("data-kind") ?? "",
    via: read.getAttribute("data-via") ?? "",
    owner: read.getAttribute("data-owner") ?? "",
    outline: drawn ? drawn.getBoundingClientRect() : null,
    outlineKind: drawn?.getAttribute("data-outline-kind") ?? null,
  };
}

/** For play functions: tick "Show host outline" (it is off by default) and
 *  wait for its readout to mount. */
export async function turnOnHostOutline(root: HTMLElement): Promise<void> {
  const box = Array.from(root.querySelectorAll("label")).find((label) => label.textContent?.trim() === "Show host outline")?.querySelector("input");
  if (!box) throw new Error('expected the "Show host outline" checkbox');
  if (!box.checked) box.click();
  for (let frame = 0; frame < 60 && !root.querySelector('[data-slot="host-outline-readout"]'); frame++) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
  if (!root.querySelector('[data-slot="host-outline-readout"]')) throw new Error("the host-outline readout never mounted");
}

/**
 * A point at fraction (fx, fy) of `element`'s box, scrolled into view first.
 * WHY the scroll: `elementFromPoint` answers `null` outside the viewport,
 * and the test browser's viewport is narrower than these stages — a point
 * off-screen would read as "nothing here" and fail for the wrong reason.
 */
export function pointIn(element: Element, fx = 0.5, fy = 0.5, inline: ScrollLogicalPosition = "center"): { x: number; y: number } {
  element.scrollIntoView({ block: "center", inline });
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
}

/** Two boxes equal within `tolerance` px on all four edges. */
export function sameBox(a: DOMRect, b: DOMRect, tolerance = 1): boolean {
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.right - b.right) <= tolerance &&
    Math.abs(a.bottom - b.bottom) <= tolerance
  );
}

