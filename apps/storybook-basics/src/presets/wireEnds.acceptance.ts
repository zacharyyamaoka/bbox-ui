// src/presets/wireEnds.acceptance.ts — how far a wire's painted end stands
// back from the CENTRE of the dot it lands on, measured off the pixels.
//
// WHY this exists: since 2026-09-22 a host ends every wire ON its dot's
// painted ring (Zach: "make the trace end exactly at the port … right now
// there is this spacing which is not desirable!"), so the pull-back is no
// longer the one constant `TRACE_TERMINAL_GAP` the wiring stories used to
// undo — it is each dot's own radius. The stories that reconstruct a
// wire's TRUE terminal (endpoint + pull-back, run backwards) read it here.
//
// WHY measured and not asked of `portDotRingRadiusPx`: that is the function
// `WireLayer` places the end with. A reconstruction that borrowed it would
// move its ruler with any bug in it — the trap `TracePolarity.stories.tsx`
// records finding by mutation. Here the ring is the dot's rendered box plus
// its OUTERMOST computed `box-shadow` spread (the rings are box-shadow
// layers outside the box), and the cap is the line's computed stroke.

/** The painted dot for a resolved end: the `[data-slot="port-dot"]` inside a
 *  labelled rail item, or the element itself. */
function paintedDot(el: Element): Element {
  return el.matches('[data-slot="port-dot"]') ? el : (el.querySelector('[data-slot="port-dot"]') ?? el);
}

function outerSpreadPx(el: Element): number {
  const shadow = getComputedStyle(el).boxShadow;
  if (!shadow || shadow === "none") return 0;
  let max = 0;
  for (const match of shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)) {
    max = Math.max(max, Number(match[4]));
  }
  return max;
}

/** Centre-to-endpoint distance the wire should stand back from `dot`: the
 *  painted ring's radius plus the line's round-cap reach. */
export function paintedPullBackPx(dot: Element, line: SVGPathElement): number {
  const painted = paintedDot(dot);
  const style = getComputedStyle(line);
  // Round and square caps both reach half a stroke past the path's end; a
  // butt cap reaches nothing — the ink stops exactly at the endpoint.
  const cap = style.strokeLinecap === "round" || style.strokeLinecap === "square" ? Number.parseFloat(style.strokeWidth) / 2 : 0;
  return painted.getBoundingClientRect().width / 2 + outerSpreadPx(painted) + cap;
}

/** Same, for a wire asserted against a POINT (a wall midpoint) rather than
 *  a dot element: the painted dot whose centre is nearest `at` decides. */
export function paintedPullBackAtPx(root: ParentNode, at: { x: number; y: number }, line: SVGPathElement): number {
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const dot of root.querySelectorAll('[data-slot="port-dot"]')) {
    const rect = dot.getBoundingClientRect();
    const distance = Math.hypot(rect.left + rect.width / 2 - at.x, rect.top + rect.height / 2 - at.y);
    if (distance < bestDistance) {
      best = dot;
      bestDistance = distance;
    }
  }
  if (!best) throw new Error("no painted port dot to measure a pull-back from");
  return paintedPullBackPx(best, line);
}
