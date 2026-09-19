/**
 * src/magnet/useMagnetDrag.ts — the React binding: drive `scanMagnets` off
 * the drag lane's existing intent reducer, measuring the DOM exactly ONCE
 * per gesture.
 *
 * OURS, ad hoc (class (c)). Nothing here is ported: the composition target
 * (`useDragIntent`) is this repo's own, and the measure-once rule is derived
 * from the measurement recorded in `scanMagnets`' WHY block, not from a
 * donor. What IS borrowed is the transient-drag-state CONVENTION — host-
 * scoped, reset on cancel/end, never written into the document — which
 * `/home/bam/systemsketch/src/blocks/ports/portState.ts` and
 * `/home/bam/systemsketch/src/behaviorTree/treeDragRefusal.ts:1-23`
 * establish independently of each other, which is what makes it a
 * convention here rather than a resemblance.
 *
 * NOTHING IN `dragIntent.ts` IS RE-IMPLEMENTED. In particular:
 *   - the scan runs ONLY while `state.phase === "dragging"`, because
 *     `move()` commits and never uncommits (`dragIntent.ts:106-113`), so a
 *     press that stays a click never flashes a wire;
 *   - the live delta is `useDragIntent`'s own `onMove` delta, which is
 *     `dragDelta` measured FROM THE ORIGIN rather than from the threshold
 *     crossing (`dragIntent.ts:118-137` — React Flow's `startDrag` does the
 *     latter and permanently loses the first move's travel,
 *     `@xyflow/system@0.0.82/dist/esm/index.mjs:2255-2256`). Magnet geometry
 *     inherits that correctness for free;
 *   - `thresholdFor` (`dragIntent.ts:53`) is never re-read or re-tuned;
 *   - Escape / `cancel()` (`dragIntent.ts:159-161`) clears the scan in one
 *     step — one gesture, one rollback.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import type { Point as IntentPoint, IntentOptions, ReleaseOutcome } from "../interaction/dragIntent";
import { useDragIntent, type DragIntentBinding } from "../interaction/useDragIntent";
import {
  EMPTY_MAGNET_SCAN,
  sameMagnetScan,
  scanMagnets,
  topProposal,
  translatePorts,
  type ConnectionJudge,
  type MagnetPort,
  type MagnetProposal,
  type MagnetScan,
} from "./magnetProposals";

export interface MagnetFrame {
  /** Ports on the thing being dragged, at their GRAB-TIME position. */
  moving: readonly MagnetPort[];
  /** Stationary candidates. */
  resting: readonly MagnetPort[];
}

export interface UseMagnetDragOptions {
  /**
   * R1's toggle. DEFAULT FALSE — opt-in, never a default.
   *
   * Precedent in-tree, verbatim: `components/trace.layout.ts:283-287` —
   * "Opt-in, never a default — the 2026-09-14 lesson
   * `connectionPresentation.ts` already recorded: on-by-default proved too
   * loud." Independently matched by maxGraph, whose entire connect gesture
   * is gated by one boolean (`graph.setConnectable` →
   * `ConnectionHandler.setEnabled`).
   */
  enabled?: boolean;
  /**
   * Called ONCE per gesture, on POINTER DOWN. This is the only DOM
   * measurement in the whole feature.
   *
   * WHY on pointer down and not on the transition into `"dragging"`: by the
   * first dragging move the dragged thing has ALREADY been translated by
   * `delta` on screen, so a live measurement then would be
   * `grab + delta`, and `translatePorts(…, delta)` would land it at
   * `grab + 2·delta` — an error of exactly the threshold, which A7's ±1px
   * assertion would (correctly) fail on. Pointer-down is the last moment
   * the DOM is honestly at rest. The cost of measuring a press that never
   * becomes a drag is one `getBoundingClientRect` loop; the cost of getting
   * it wrong is a wire that trails the node forever.
   */
  measure(): MagnetFrame;
  judge?: ConnectionJudge;
  zoom?: number;
  intent?: IntentOptions;
  /** `release()` → `{kind:"moved"}` is the commit point (`dragIntent.ts:142`).
   *  The CALLER writes the scene; this module never does. */
  onCommit?(top: MagnetProposal | null, delta: IntentPoint): void;
}

export interface MagnetDragBinding {
  /** Pass-through of `useDragIntent` — composed, not replaced. Spread its
   *  handlers onto the draggable element exactly as you would without
   *  magnets. */
  drag: DragIntentBinding;
  scan: MagnetScan;
  top: MagnetProposal | null;
}

export function useMagnetDrag(options: UseMagnetDragOptions): MagnetDragBinding {
  const { enabled = false, measure, judge, zoom = 1, intent, onCommit } = options;
  const [scan, setScan] = useState<MagnetScan>(EMPTY_MAGNET_SCAN);

  // WHY refs beside the state, and not state alone: `pointermove` fires
  // faster than React commits, so reading the frame or the previous scan off
  // `scan` would read a stale value mid-gesture — the same reason
  // `useDragIntent` keeps its own `live` ref (useDragIntent.ts:51-55).
  const frameRef = useRef<MagnetFrame | null>(null);
  const liveRef = useRef<MagnetScan>(EMPTY_MAGNET_SCAN);

  const publish = useCallback((next: MagnetScan) => {
    // Reference-stable when nothing meaningful changed, so React skips the
    // commit and the `Trace` below it does not re-layout on every frame.
    const stable = sameMagnetScan(liveRef.current, next) ? liveRef.current : next;
    liveRef.current = stable;
    setScan(stable);
  }, []);

  const onMove = useCallback(
    (delta: IntentPoint) => {
      if (!enabled) return;
      const frame = frameRef.current;
      if (!frame) return;
      publish(scanMagnets({ moving: translatePorts(frame.moving, delta), resting: frame.resting, zoom, judge }));
    },
    [enabled, judge, publish, zoom],
  );

  const onOutcome = useCallback(
    (outcome: ReleaseOutcome) => {
      const top = topProposal(liveRef.current);
      frameRef.current = null;
      liveRef.current = EMPTY_MAGNET_SCAN;
      setScan(EMPTY_MAGNET_SCAN);
      // A cancelled gesture (`{kind:"ignored"}` from Escape) and a click
      // commit nothing — only a real move does.
      if (outcome.kind === "moved") onCommit?.(top, outcome.delta);
    },
    [onCommit],
  );

  const drag = useDragIntent({ ...intent, onMove, onOutcome });

  // The composed pointer-down: measure first, then hand the event to the
  // drag reducer untouched. Wrapping rather than replacing is what keeps
  // `useDragIntent` the single owner of press/threshold/capture.
  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      frameRef.current = enabled ? measure() : null;
      liveRef.current = EMPTY_MAGNET_SCAN;
      setScan(EMPTY_MAGNET_SCAN);
      drag.onPointerDown(event);
    },
    [drag, enabled, measure],
  );

  const composed = useMemo<DragIntentBinding>(() => ({ ...drag, onPointerDown }), [drag, onPointerDown]);

  return { drag: composed, scan, top: topProposal(scan) };
}
