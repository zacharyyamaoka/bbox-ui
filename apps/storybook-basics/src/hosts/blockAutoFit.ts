// src/hosts/blockAutoFit.ts — measures a `Block`'s own header/footer chrome
// plus its free-layout members' real rects, and turns that into the height
// `fitToContent.ts`'s `blockExpandedFitHeight` says the Block should be.
//
// Ported by pattern, not by code, from `FitToContent.stories.tsx`'s own
// `useBlockChrome` (that lane's story-local hook, written before this one
// existed) — same measurement targets (`[data-slot="block"]`,
// `[data-slot="block-header"]`/`[data-slot="block-footer"]`), same
// equality-guarded `ResizeObserver`. What THIS module adds is the member
// side (that story only ever measured chrome; its member rects were
// measured ad hoc per-story) and the reentrancy latch below, because here —
// unlike a story's own click handler — the fit height is recomputed from a
// LIVE drag, continuously, which is exactly the shape of gesture that has
// already produced a real feedback bug once in this repo
// (`reactFlowHost.tsx`'s `NodeResizer`, see its own `onResizeEnd` comment).
//
// WHY a `useRef` mirror instead of comparing against React state directly:
// `measure()` runs inside a `ResizeObserver` callback, which must decide
// "did anything actually change" synchronously and BEFORE calling
// `setState`, so the reentrancy latch can be armed before React's own
// re-render (and the layout it causes) has even started. A stale closure
// over `useState`'s own value cannot do that; a ref written at the same
// moment as the state can.
import { useLayoutEffect, useRef, useState } from "react";

import { blockExpandedFitHeight, type MemberFitInsets, type MemberRect } from "../layout/fitToContent";

interface FitResult {
  chromeTopPx: number;
  chromeBottomPx: number;
  fitHeightPx: number | null;
}

const RESTING: FitResult = { chromeTopPx: 0, chromeBottomPx: 0, fitHeightPx: null };

function sameResult(a: FitResult, b: FitResult): boolean {
  const heightsMatch = a.fitHeightPx == null ? b.fitHeightPx == null : b.fitHeightPx != null && Math.abs(a.fitHeightPx - b.fitHeightPx) < 0.5;
  return Math.abs(a.chromeTopPx - b.chromeTopPx) < 0.5 && Math.abs(a.chromeBottomPx - b.chromeBottomPx) < 0.5 && heightsMatch;
}

export interface UseAutoFitHeightOptions {
  /** The Block's own outer wrapper — the same element `data-slot="block"`
   *  and `data-slot="block-members"` are queried inside of. */
  rootRef: React.RefObject<HTMLElement | null>;
  /** `false` = the hook does nothing and returns `null` — the byte-
   *  identical-when-unset contract every call site relies on. */
  enabled: boolean;
  insets?: MemberFitInsets;
  /**
   * Force an immediate re-measure whenever this changes — typically each
   * free member's live `"id:x:y"` joined into one string.
   *
   * WHY this is load-bearing and not merely an optimization: a live drag
   * changes a member's `left`/`top` CSS, which is a POSITION change on a
   * descendant, not a SIZE change on the observed root — `ResizeObserver`
   * is defined to fire on the latter only. Dragging a member therefore
   * moves it on screen without ever waking the observer below, and the
   * fit height would only catch up once something ELSE happened to
   * resize the root (a browser reflow from an unrelated cause) — see
   * `FitToContentHosts.stories.tsx`'s "the parent tracks the child while
   * the gesture is still in flight" assertion, which is what this key
   * exists to make pass continuously rather than only at release.
   */
  measureKey?: string | number;
}

/**
 * `null` while `enabled` is false or there is nothing to fit to (an empty
 * members region) — the same "absence, not a guessed number" contract
 * `blockExpandedFitHeight` itself keeps.
 *
 * ── THE REENTRANCY LATCH ──
 *
 * Named for what it does, not for drama: `applyingRef`, set the instant a
 * change is about to be applied and cleared one animation frame later. Its
 * job is the one Vyuh Flow's own `_isMovingGroupNodes` /
 * `shouldSkipUpdates` pair name for the identical class of bug (this
 * lane's own prior-art report, card 6): a write that changes the very box
 * a `ResizeObserver` is watching WILL re-trigger that observer, and the
 * question is only whether the re-entrant call is allowed to run.
 *
 * Concretely here: this hook's `ResizeObserver` watches the Block's own
 * root, and `setResult` changes the Block's `height` (via
 * `resolveBlockHeight` downstream), which changes the free-layout members
 * region's own box (it is `flex: 1`) — the SAME root the observer is
 * watching. So the observer WILL fire again as a direct result of this
 * hook's own write, every time, not as an edge case.
 *
 * WHY this repo does not already have a live example of that loop running
 * away: free-layout members are `position: absolute` measured from the
 * region's own top-left, and the Block only ever grows DOWNWARD (the
 * header sits above the region at a fixed offset that a members-region
 * height change cannot move) — so re-measuring after the write finds the
 * IDENTICAL member rects, `sameResult` is true on the second pass, and the
 * loop would stop itself after exactly one extra measurement even with the
 * latch deleted. That was verified directly, not assumed: this lane
 * temporarily removed the `if (applyingRef.current) return` line, drove
 * the same live-drag story, and it still converged — the geometry here
 * does not manufacture a NEW value for the observer to chase, unlike
 * XYResizer's own gesture math, which measures a box mid-transit and
 * derives a genuinely different, wrong number from it. So the latch is
 * verified-inert insurance in THIS geometry, not the fix for an observed
 * bug — it is kept, named, and documented anyway, because "this
 * computation happens not to feed itself, today" is exactly the kind of
 * fact a future change (a header whose height depends on the Block's own
 * height, say, or a members region that grows upward) would silently
 * invalidate, and the reactFlowHost.tsx defect this repo already shipped
 * once is the cost of finding that out by shipping it again instead of by
 * reading a comment.
 */
export function useAutoFitHeight({ rootRef, enabled, insets, measureKey }: UseAutoFitHeightOptions): number | null {
  const [result, setResult] = useState<FitResult>(RESTING);
  const lastAppliedRef = useRef<FitResult>(RESTING);
  const applyingRef = useRef(false);

  useLayoutEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      // The latch: a re-entrant call caused by THIS hook's own write is
      // dropped rather than trusted to converge — see this function's own
      // doc for why that is currently redundant AND why it stays.
      if (applyingRef.current) return;

      const block = root.querySelector<HTMLElement>('[data-slot="block"]');
      const region = root.querySelector<HTMLElement>('[data-slot="block-members"]');
      if (!block) return;

      const blockRect = block.getBoundingClientRect();
      const header = block.querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
      const footer = block.querySelector<HTMLElement>(':scope > [data-slot="block-footer"]');
      const chromeTopPx = header ? header.getBoundingClientRect().bottom - blockRect.top : 0;
      const chromeBottomPx = footer ? blockRect.bottom - footer.getBoundingClientRect().top : 0;

      let members: MemberRect[] = [];
      if (region) {
        const origin = region.getBoundingClientRect();
        members = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-slot="block-member"]')).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
        });
      }
      const fitHeightPx = blockExpandedFitHeight({ members, headerPx: chromeTopPx, footerPx: chromeBottomPx, insets });

      const next: FitResult = { chromeTopPx, chromeBottomPx, fitHeightPx };
      if (sameResult(lastAppliedRef.current, next)) return;

      applyingRef.current = true;
      lastAppliedRef.current = next;
      setResult(next);
      // Released after the write's own layout has settled — one frame is
      // enough because the write is a plain style height, not an animation.
      requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
    // `measureKey` deliberately drives this effect — see its own doc: a
    // live drag has to force `measure()` to run again, and re-running the
    // WHOLE effect (not just calling `measure()` bare) is what a plain
    // dependency array buys for free, with no separate effect to keep in
    // sync with this one's mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rootRef, measureKey]);

  return enabled ? result.fitHeightPx : null;
}
