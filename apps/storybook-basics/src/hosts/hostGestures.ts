// src/hosts/hostGestures.ts — the drag a HOST story simulates.
//
// The established recipe (PortEdge.stories.tsx's `dragCard`) fires
// PointerEvents only, which is exactly right for a bench where dnd-kit is
// the sole listener. Inside a canvas host it would be QUIETLY WRONG: React
// Flow's node drag and pan/zoom run on d3-drag/d3-zoom, which listen for
// MOUSE events — real browser input fires the compatibility mousedown/
// mousemove right after each pointerdown/pointermove, so a real finger or
// mouse reaches BOTH systems, and the pointer-only recipe reaches only
// dnd-kit. A "the host didn't steal the gesture" assertion driven
// pointer-only is therefore vacuous: the host never even saw the gesture
// it is being cleared of stealing. This helper dispatches both families in
// the browser's own order, so the fight H4 adjudicates actually happens.
//
// `isPrimary: true` stays load-bearing (dnd-kit's PointerSensor bails on
// its absence — the donor recipe's own finding), and the mouse events
// carry `view: window` because d3-drag registers its move/up listeners on
// `event.view`, not on the document.

function fireBoth(el: Element, kind: "down" | "move" | "up", x: number, y: number) {
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: kind === "up" ? 0 : 1, view: window } as const;
  el.dispatchEvent(
    new PointerEvent(`pointer${kind}`, { ...base, pointerId: 1, isPrimary: true, pointerType: "mouse" }),
  );
  el.dispatchEvent(new MouseEvent(`mouse${kind}`, base));
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Press on `from`'s centre (or `pressAt`), clear both activation
 * thresholds (dnd-kit's 4px `activationConstraint`, React Flow's 1px
 * `nodeDragThreshold`), glide to the target, release. `to` is an element
 * centre or an absolute viewport point — the latter is what a
 * node-reposition drag wants.
 */
export async function dragFrom(
  from: Element,
  to: Element | { x: number; y: number },
  options?: { pressAt?: { x: number; y: number } },
): Promise<void> {
  const pressAt = options?.pressAt ?? centreOf(from);
  const startX = pressAt.x;
  const startY = pressAt.y;
  const end = "getBoundingClientRect" in to ? centreOf(to as Element) : (to as { x: number; y: number });
  fireBoth(from, "down", startX, startY);
  await tick(30);
  fireBoth(from, "move", startX + 2, startY + 8);
  await tick(30);
  fireBoth(from, "move", end.x, end.y);
  await tick(30);
  fireBoth(from, "up", end.x, end.y);
  await tick(100);
}

function centreOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * `dragFrom`'s same press/glide/release, but with an `onStep` callback
 * after EVERY intermediate move — for a story that needs to measure
 * something DURING the gesture, not only its start and end. `dragFrom`
 * itself glides through one waypoint before the target; this samples
 * `steps` evenly-spaced points along the same straight line so a mid-drag
 * assertion (host-fixes lane, defect 5: does the box move before release,
 * when it should not) has real points to check, not just "before" and
 * "after".
 */
export async function dragSteps(
  from: Element,
  to: { x: number; y: number },
  options: { pressAt?: { x: number; y: number }; steps?: number; onStep?: (at: { x: number; y: number }) => void | Promise<void> },
): Promise<void> {
  const start = options.pressAt ?? centreOf(from);
  const steps = options.steps ?? 4;
  fireBoth(from, "down", start.x, start.y);
  await tick(30);
  for (let i = 1; i <= steps; i++) {
    const at = { x: start.x + ((to.x - start.x) * i) / steps, y: start.y + ((to.y - start.y) * i) / steps };
    fireBoth(from, "move", at.x, at.y);
    await tick(30);
    await options.onStep?.(at);
  }
  fireBoth(from, "up", to.x, to.y);
  await tick(100);
}
