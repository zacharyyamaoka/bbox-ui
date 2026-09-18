/**
 * src/interaction/useDragIntent.ts — the React binding for
 * `dragIntent.ts`. Listener plumbing only; every decision is in the pure
 * reducer, which is where the tests are.
 *
 * WHY this hook exists beside React Flow rather than replacing its drag:
 * React Flow's node drag already satisfies Zach's core requirement. Read
 * from its own source, `getDragItems` admits a node when
 * `node.selected || node.id === nodeId`
 * (`@xyflow/system@0.0.82/dist/esm/index.mjs:2053`) — so a press on a
 * COLD, unselected node drags it, with no prior selection click. Measured
 * in this lane 2026-09-17: every successful drag ran with
 * `selected === false` beforehand. The gap Zach is feeling is therefore
 * NOT missing intent detection in the host; it is the grab AREA, plus the
 * absence of any selected/hovered state to distinguish. This hook is for
 * the surfaces React Flow's own drag cannot reach — a component's internal
 * gesture, and the click/edit half of the policy that no canvas engine
 * owns.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { cancel, IDLE, move, press, release, type IntentOptions, type IntentState, type Point, type ReleaseOutcome } from "./dragIntent";
import type { DragDeclaration } from "./dragPolicy";
import { resolveGrabAt } from "./grabChain";

export interface UseDragIntentOptions extends IntentOptions {
  /** The component's own declaration, for the click→edit half. */
  readonly declaration?: DragDeclaration;
  /** Is the component already active (selected / editing)? The donor's one
   *  rule reads this and nothing else — see `resolveClick`. */
  readonly active?: boolean;
  /** Where the walk stops if no declaration is found (a host node root). */
  readonly boundary?: Element | null;
  onMove?(delta: Point, state: IntentState): void;
  onOutcome?(outcome: ReleaseOutcome): void;
}

export interface DragIntentBinding {
  readonly state: IntentState;
  readonly onPointerDown: (event: React.PointerEvent) => void;
  readonly onPointerMove: (event: React.PointerEvent) => void;
  readonly onPointerUp: (event: React.PointerEvent) => void;
  readonly onKeyDown: (event: React.KeyboardEvent) => void;
}

const pointOf = (event: { clientX: number; clientY: number }): Point => ({ x: event.clientX, y: event.clientY });

export function useDragIntent(options: UseDragIntentOptions = {}): DragIntentBinding {
  const [state, setState] = useState<IntentState>(IDLE);
  // WHY a ref beside the state: pointermove fires faster than React
  // commits, so a reducer chained off `state` would read a stale origin
  // and under-report travel. The ref is the authority during a gesture;
  // the state exists so the component can paint.
  const live = useRef<IntentState>(IDLE);
  const { declaration, active = false, boundary, onMove, onOutcome } = options;
  const intentOptions = useMemo<IntentOptions>(() => ({ owner: options.owner, coarse: options.coarse }), [options.owner, options.coarse]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const resolution = resolveGrabAt(event.target as Element, boundary ?? (event.currentTarget as Element));
      const next = press(pointOf(event), resolution, intentOptions);
      live.current = next;
      setState(next);
      // WHY capture only for a surface we actually claimed: capturing on a
      // press we are going to ignore would steal the gesture from the
      // subtree that declared `owns-pointer`.
      if (next.phase === "pressed") (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    },
    [boundary, intentOptions],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (live.current.phase === "idle") return;
      const next = move(live.current, pointOf(event));
      live.current = next;
      setState(next);
      if (next.phase === "dragging") onMove?.({ x: next.at!.x - next.origin!.x, y: next.at!.y - next.origin!.y }, next);
    },
    [onMove],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (live.current.phase === "idle") return;
      const outcome = release(live.current, { wasActive: active, declaration });
      live.current = IDLE;
      setState(IDLE);
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
      onOutcome?.(outcome);
    },
    [active, declaration, onOutcome],
  );

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || live.current.phase === "idle") return;
    live.current = cancel();
    setState(IDLE);
    onOutcome?.({ kind: "ignored" });
  }, [onOutcome]);

  return { state, onPointerDown, onPointerMove, onPointerUp, onKeyDown };
}
