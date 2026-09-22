import { useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { AlignLeft, PaintBucket, Slash, Type } from "lucide-react";

import { FloatingToolbar } from "./floatingToolbar";
import {
  placeFloatingToolbar,
  SELECTION_MENU_MARGIN,
  SELECTION_OVERLAY_INSET,
  type Rect,
  type SelectionMenuPlacement,
  type SelectionMenuSide,
  type Size,
} from "./floatingToolbar.placement";
import { ToolbarButton, ToolbarGroup, ToolbarSeparator } from "./toolbar";

/**
 * `floatingToolbar.tsx` is the positioned shell only — it has no opinion
 * about WHERE it goes, because that opinion lives entirely in
 * `floatingToolbar.placement.ts`'s `placeFloatingToolbar` (pure, host-owned)
 * per docs/menus/MENU-KIT-DESIGN.md §3.3/§4. So this gallery does not fake
 * the placement, only the HOST loop that would normally surround it: each
 * `Stage` below measures its own rendered `FloatingToolbar` with
 * `getBoundingClientRect` — exactly step 1 of the host contract — then
 * calls the REAL `placeFloatingToolbar` with a scripted selection rect, and
 * paints whatever it returns. Nothing here re-implements or approximates
 * the above/pinned/below policy or either clamp; every case is the
 * production math running against a drawn-to-scale stage, matching this
 * repo's rule that spatial claims are measured
 * (`getBoundingClientRect`), never asserted in prose or DOM-presence only.
 *
 * Every stage shares one 560×360 viewport and one 20px margin
 * (`SELECTION_MENU_MARGIN`) — the same fixture-promised "every cell gets
 * the same scale" this repo's elbow-routing galleries already settled on —
 * so only the scripted selection (and, for the last case, a bottom
 * obstacle) differs between cases, never the stage itself.
 */

const VIEWPORT: Size = { w: 560, h: 360 };

interface StageCase {
  id: string;
  title: string;
  note: string;
  selection: Rect;
  bottomObstacleTop?: number;
  /** What the real placement is expected to land on, asserted in `play`. */
  expectSide: SelectionMenuSide;
}

const CASES: StageCase[] = [
  {
    id: "comfortable-above",
    title: "Comfortable above",
    note: "Plenty of room above the selection — the default FigJam position.",
    selection: { x: 200, y: 180, w: 160, h: 100 },
    expectSide: "above",
  },
  {
    id: "flipped-below",
    title: "Flipped below",
    note: "Selection sits too close to the top for the pill (plus its gap) to fit above, so it flips below instead of clamping down onto the selection the way stock tldraw's toolbar would.",
    selection: { x: 200, y: 30, w: 160, h: 80 },
    expectSide: "below",
  },
  {
    id: "pinned-at-top",
    title: "Pinned at top",
    note: "The selection's own top edge is off-screen (scrolled inside a taller region) — there is no \"above\" to flip to, so the pill pins near the top margin instead of falling through to \"below\", which would otherwise land it far from the only sliver of selection actually in view.",
    selection: { x: 200, y: -80, w: 160, h: 200 },
    expectSide: "pinned",
  },
  {
    id: "clamped-left",
    title: "Clamped left",
    note: "Selection hugs the left edge — the pill would centre off the left of the viewport, so its x is clamped into the margin instead.",
    selection: { x: 0, y: 150, w: 60, h: 90 },
    expectSide: "above",
  },
  {
    id: "clamped-right",
    title: "Clamped right",
    note: "Same clamp, the other edge.",
    selection: { x: 500, y: 150, w: 60, h: 90 },
    expectSide: "above",
  },
  {
    id: "floored-above-obstacle",
    title: "Floored above a bottom obstacle",
    note: "A tall selection leaves no room above, so the pill flips below — but a host-supplied bottom obstacle (a bottom tool dock, screenshot 04) sits in the way, so the obstacle floor wins over the natural below-selection position.",
    selection: { x: 200, y: 20, w: 160, h: 300 },
    bottomObstacleTop: 300,
    expectSide: "below",
  },
];

/**
 * The representative pill contents used by every stage below. `ControlStrip`
 * (a later lane, MENU-KIT-DESIGN.md §3.3) is the real thing this becomes —
 * this story only needs a realistically-sized cluster so the placement math
 * runs against the pill's actual measured width, not a stand-in constant.
 */
function DemoPillContents() {
  return (
    <>
      <ToolbarGroup>
        <ToolbarButton aria-label="Fill">
          <PaintBucket className="size-4" />
        </ToolbarButton>
        <ToolbarButton aria-label="No stroke">
          <Slash className="size-4" />
        </ToolbarButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarButton aria-label="Text">
        <Type className="size-4" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton aria-label="Align">
        <AlignLeft className="size-4" />
      </ToolbarButton>
    </>
  );
}

/**
 * One scripted case: draws the stage (viewport, selection, optional
 * obstacle) to scale, measures its own `FloatingToolbar` on mount, calls
 * the real `placeFloatingToolbar`, and renders the result. This IS the
 * host's own step 1-3 loop (MENU-KIT-DESIGN.md §4) minus the parts that
 * only matter once, on a live canvas: the manipulation gate (step 4), the
 * monotonic pass counter guarding a slow/reordered resolution (step 5, real
 * here too since `computePosition` is genuinely async, but a story with one
 * static selection per case never re-runs mid-flight), and the
 * camera/scale re-run loop (step 6) — none of which a still-image gallery
 * exercises.
 */
function Stage({ id, title, note, selection, bottomObstacleTop }: StageCase) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<SelectionMenuPlacement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const menu = element.getBoundingClientRect();
    placeFloatingToolbar({
      selection,
      menu: { w: menu.width, h: menu.height },
      viewport: VIEWPORT,
      bottomObstacleTop,
      overlayInset: SELECTION_OVERLAY_INSET,
    }).then((result) => {
      if (!cancelled) setPlacement(result);
    });
    return () => {
      cancelled = true;
    };
    // Each case's inputs are static for the lifetime of this story — no
    // dependency array footgun, this runs exactly once per mounted Stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="text-sm font-medium text-foreground">{title}</figcaption>
      <p className="m-0 max-w-sm text-xs text-muted-foreground">{note}</p>
      <div
        data-testid={`stage-${id}`}
        className="relative overflow-hidden rounded-md border border-dashed border-border bg-muted/30"
        style={{ width: VIEWPORT.w, height: VIEWPORT.h }}
      >
        <div
          data-testid="selection"
          className="absolute rounded-sm border-2 border-blue-500 bg-blue-500/10"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        />
        {bottomObstacleTop !== undefined && (
          <div
            data-testid="bottom-obstacle"
            className="absolute inset-x-0 bottom-0 border-t border-foreground/30 bg-foreground/10"
            style={{ top: bottomObstacleTop }}
          >
            <span className="px-2 text-[10px] text-muted-foreground">bottom obstacle</span>
          </div>
        )}
        <FloatingToolbar
          ref={ref}
          aria-label={`${title} controls`}
          x={placement?.x ?? 0}
          y={placement?.y ?? 0}
          side={placement?.side ?? "above"}
          visible={placement !== null}
        >
          <DemoPillContents />
        </FloatingToolbar>
      </div>
      <p data-testid={`readout-${id}`} className="m-0 font-mono text-xs text-muted-foreground">
        {placement ? `side=${placement.side} · x=${placement.x} · y=${placement.y}` : "computing…"}
      </p>
    </figure>
  );
}

const meta = {
  title: "Editor/Menus & Bars/FloatingToolbar",
  tags: ["object:chrome"],
  component: FloatingToolbar,
  // WHY base `args`: every required `FloatingToolbarProps` field (x/y/side/
  // visible/aria-label/children) has no sensible default, so CSF3 typegen
  // requires them here. Every story below supplies its own real values via
  // `render`'s closure instead of reading `args` — this fixture only exists
  // to satisfy the required-args contract at the type level.
  args: {
    x: 0,
    y: 0,
    side: "above",
    visible: true,
    "aria-label": "Floating toolbar",
    children: null,
  },
} satisfies Meta<typeof FloatingToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every scripted case side by side: comfortable-above, flipped-below,
 * pinned-at-top, both viewport-margin clamps, and floored above a bottom
 * obstacle. `play` waits for each stage's async placement to resolve, then
 * measures the real rendered pill against the real stage rect — the
 * `data-side` the policy chose, and (for the clamp/floor cases) that the
 * pill's edge actually sits at the margin/obstacle boundary rather than
 * merely somewhere on-screen.
 */
export const Gallery: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-8 p-4 md:grid-cols-2">
      {CASES.map((c) => (
        <Stage key={c.id} {...c} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const testCase of CASES) {
      const stage = canvas.getByTestId(`stage-${testCase.id}`);

      await waitFor(() => {
        expect(canvas.getByTestId(`readout-${testCase.id}`).textContent).not.toBe("computing…");
      });

      const toolbar = within(stage).getByRole("toolbar", { name: `${testCase.title} controls` });
      await expect(toolbar).toHaveAttribute("data-side", testCase.expectSide);
      await expect(toolbar).toHaveAttribute("data-visible", "true");

      // WHY subtract the stage's own border (fixed 2026-09-18): `Stage`
      // draws itself with `border border-dashed` as a purely visual frame
      // (so a reader can see the viewport edge), but `getBoundingClientRect`
      // reports the BORDER box while `position: relative` on this same
      // element establishes its containing block at the PADDING box —
      // exactly where `placeFloatingToolbar`'s `x`/`y` (and the sibling
      // `selection` div's own `left`/`top`) are actually measured FROM.
      // Without this, every local measurement here ran 1px high/left of
      // the real placement — off by exactly the border width, never
      // "roughly right" — which is what `pinned-at-top`'s exact `toBe`
      // check (no tolerance, unlike the obstacle-floor check below) caught.
      const stageStyle = getComputedStyle(stage);
      const borderLeft = parseFloat(stageStyle.borderLeftWidth) || 0;
      const borderTop = parseFloat(stageStyle.borderTopWidth) || 0;
      const stageRect = stage.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const localX = Math.round(toolbarRect.left - stageRect.left - borderLeft);
      const localY = Math.round(toolbarRect.top - stageRect.top - borderTop);

      if (testCase.id === "clamped-left") {
        // The pill's left edge sits exactly at the margin rather than at
        // wherever centring on a selection this close to the edge would
        // otherwise put it (which would run negative, off the stage).
        await expect(localX).toBe(SELECTION_MENU_MARGIN);
      }
      if (testCase.id === "clamped-right") {
        const expectedRight = VIEWPORT.w - SELECTION_MENU_MARGIN;
        await expect(Math.round(localX + toolbarRect.width)).toBe(expectedRight);
      }
      if (testCase.id === "pinned-at-top") {
        await expect(localY).toBe(SELECTION_MENU_MARGIN);
      }
      if (testCase.id === "floored-above-obstacle" && testCase.bottomObstacleTop !== undefined) {
        // The natural "below the selection" position would run the pill
        // under the obstacle entirely — assert `y` landed at the FLOOR
        // (`clampToObstacleFloor`'s own formula), not merely somewhere
        // above it, which a weaker "is it above the obstacle" check alone
        // would also pass by accident if the flip-below logic were broken.
        const floor = testCase.bottomObstacleTop - SELECTION_MENU_MARGIN - toolbarRect.height;
        await expect(Math.abs(localY - Math.round(floor))).toBeLessThanOrEqual(1);
        await expect(localY + toolbarRect.height).toBeLessThanOrEqual(testCase.bottomObstacleTop);
      }
    }
  },
};

/**
 * A single case at a larger scale, `visible={false}` shown alongside
 * `visible={true}` — the pill is present in both (never unmounted, see
 * `floatingToolbar.tsx`'s own WHY), only opacity and pointer-events differ.
 */
export const VisibilityToggle: Story = {
  render: () => (
    <div className="relative flex h-24 items-center gap-16 p-8">
      <div className="relative h-16 w-64 rounded-md border border-dashed border-border">
        <span className="absolute -top-5 left-0 text-xs text-muted-foreground">visible=false</span>
        <FloatingToolbar aria-label="Hidden example" x={12} y={12} side="above" visible={false}>
          <DemoPillContents />
        </FloatingToolbar>
      </div>
      <div className="relative h-16 w-64 rounded-md border border-dashed border-border">
        <span className="absolute -top-5 left-0 text-xs text-muted-foreground">visible=true</span>
        <FloatingToolbar aria-label="Visible example" x={12} y={12} side="above" visible>
          <DemoPillContents />
        </FloatingToolbar>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const hidden = canvas.getByRole("toolbar", { name: "Hidden example" });
    const visible = canvas.getByRole("toolbar", { name: "Visible example" });

    await expect(hidden).toHaveAttribute("data-visible", "false");
    await expect(getComputedStyle(hidden).opacity).toBe("0");
    await expect(getComputedStyle(hidden).pointerEvents).toBe("none");

    await expect(visible).toHaveAttribute("data-visible", "true");
    await expect(getComputedStyle(visible).opacity).toBe("1");
  },
};
