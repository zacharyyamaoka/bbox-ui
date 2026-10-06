// src/selectionPill.smoke.test.tsx — acceptance for the RICH selection pill,
// against the real mounted app.
//
// Zach, 2026-09-20, captioning a screenshot of the old two-button pill
// "Current : BAD" and the archived SystemSketch's "Desired": "1. floating
// tool bars that provide useful fucntions on the components / 2. FLoating
// toolbar over the tldraw primatives for styling".
//
// EVERY ASSERTION HERE MEASURES AN EFFECT ON THE EDITOR, never the presence
// of a button. A pill full of controls that are wired to nothing would pass a
// DOM-presence suite completely, and that is the exact failure this round is
// most likely to ship: the controls are the easy half, the wiring is not.
//
// THE SELECTORS MOVED, 2026-09-24, and only the selectors. The six
// per-tldraw-style rows (`ss-style-<style>` / `ss-style-<style>-panel` /
// `ss-style-<style>-<value>`) are gone; the bar is now four triggers — shape ·
// inside · edge · text — plus the app's diff, rendered by the trunk's
// `ControlStrip` over the vocabulary in `chrome/ContextualPopupMenu/
// appearanceModel.ts`. The DOM contract is that component's, with
// `testIdPrefix="ss"`:
//
//   trigger   [data-testid="ss-control-<id>"], id ∈ geo|inside|edge|text|diff
//   panel     [data-testid="ss-control-panel-<id>"]   (portalled out of the bar)
//   option    [data-control="<id>"][data-value="<value>"]  — it has NO testid
//   opacity   [data-testid="control-continuous-input"], inside the inside AND
//             edge panels, with an <output> sibling carrying the percentage
//
// Every claim below is the one that was here before; each says where its
// selector moved.
import {
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  type StyleProp,
  type TLShapeId,
} from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { DiffMarkStyle } from "./shapes/shared/diffMark";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

function placeBlock(name: string, x: number, y: number): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({
    id,
    type: BLOCK_SHAPE_TYPE,
    x,
    y,
    props: { name, view: "port", ports: { left: [], right: [], top: [], bottom: [] } },
  } as never);
  return id;
}

/** A stock tldraw geo box — the "primitive" half of Zach's ask. */
function placeGeo(x: number, y: number, w = 120, h = 80): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: "geo", x, y, props: { w, h, geo: "rectangle" } } as never);
  return id;
}

async function pill(): Promise<HTMLElement> {
  return waitFor(() => app!.root.querySelector<HTMLElement>('[data-slot="floating-toolbar"][data-visible="true"]'), {
    what: "the floating toolbar visible",
  });
}

async function openPanel(triggerTestId: string, panelTestId: string): Promise<HTMLElement> {
  const bar = await pill();
  const trigger = await waitFor(() => bar.querySelector<HTMLElement>(`[data-testid="${triggerTestId}"]`), {
    what: `the ${triggerTestId} trigger`,
  });
  await userEvent.click(trigger);
  // The panel PORTALS to document.body, so it is not inside `bar`.
  return waitFor(() => document.querySelector<HTMLElement>(`[data-testid="${panelTestId}"]`), { what: panelTestId });
}

function xOf(id: TLShapeId): number {
  return app!.editor.getShape(id)!.x;
}

/**
 * The appearance bar's trigger ids, in the order it draws them.
 *
 * WHY `[data-control]` rather than a `[data-testid^="ss-control-"]` prefix
 * match: `ss-control-panel-<id>` shares that prefix, so the old
 * filter-by-regex dance (`/^ss-style-[a-z]+$/`, to exclude `-face` and
 * `-panel`) would have to be re-invented. A trigger is the only thing inside
 * the BAR carrying `data-control`; the option buttons carry it too, but their
 * panel portals to `document.body`, so scoping the query to the cluster leaves
 * exactly the triggers with no filtering at all.
 */
async function appearanceTriggers(): Promise<string[]> {
  const bar = await pill();
  const cluster = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-selection-appearance"]'), {
    what: "the appearance cluster",
  });
  return [...cluster.querySelectorAll<HTMLElement>("[data-control]")].map(
    (element) => element.getAttribute("data-control")!,
  );
}

describe("the selection pill — Arrange", () => {
  it("offers z-order for ONE shape and no align rows: there is nothing to align a single shape to", async () => {
    app = await mountApp();
    app.editor.select(placeBlock("solo", 300, 300));
    const panel = await openPanel("ss-selection-arrange", "ss-arrange-panel");
    expect(panel.querySelector('[data-testid="ss-arrange-sendToBack"]'), "z-order is offered").not.toBeNull();
    expect(panel.querySelector('[data-testid="ss-arrange-left"]'), "align is NOT offered for one shape").toBeNull();
    expect(panel.querySelector('[data-testid="ss-arrange-distribute-horizontal"]')).toBeNull();
  });

  it("align left MOVES the shapes — the measured x of both ends up equal, and it is one undo", async () => {
    app = await mountApp();
    const a = placeBlock("a", 200, 200);
    const b = placeBlock("b", 640, 380);
    app.editor.select(a, b);

    const panel = await openPanel("ss-selection-arrange", "ss-arrange-panel");
    const left = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="ss-arrange-left"]'), {
      what: "align left (two shapes selected)",
    });
    expect(xOf(a)).not.toBe(xOf(b));
    await userEvent.click(left);

    await waitFor(() => (Math.abs(xOf(a) - xOf(b)) < 0.5 ? true : null), {
      what: `both x equal after align (a=${xOf(a)} b=${xOf(b)})`,
    });

    // ONE undo puts it back — the `markHistoryStoppingPoint("arrange")` in
    // runArrange is what makes this true, and without it the align coalesces
    // with the shape creation above.
    app.editor.undo();
    await waitFor(() => (Math.abs(xOf(a) - xOf(b)) > 1 ? true : null), { what: "one undo restores the offset" });
  });

  it("distribute appears only at THREE shapes, and actually moves the middle one", async () => {
    app = await mountApp();
    const a = placeBlock("a", 100, 300);
    const b = placeBlock("b", 300, 300);
    const c = placeBlock("c", 900, 300);

    app.editor.select(a, b);
    let panel = await openPanel("ss-selection-arrange", "ss-arrange-panel");
    expect(panel.querySelector('[data-testid="ss-arrange-distribute-horizontal"]'), "not at two").toBeNull();
    await userEvent.keyboard("{Escape}");

    app.editor.select(a, b, c);
    panel = await openPanel("ss-selection-arrange", "ss-arrange-panel");
    const distribute = await waitFor(
      () => panel.querySelector<HTMLElement>('[data-testid="ss-arrange-distribute-horizontal"]'),
      { what: "distribute at three" },
    );
    const before = xOf(b);
    await userEvent.click(distribute);
    await waitFor(() => (Math.abs(xOf(b) - before) > 1 ? true : null), {
      what: `the middle shape to move (was ${before}, now ${xOf(b)})`,
    });
  });

  it("send to back really reorders: the shape's index drops below its sibling's", async () => {
    app = await mountApp();
    const under = placeBlock("under", 200, 200);
    const over = placeBlock("over", 240, 240);
    expect(app.editor.getShape(over)!.index > app.editor.getShape(under)!.index).toBe(true);

    app.editor.select(over);
    const panel = await openPanel("ss-selection-arrange", "ss-arrange-panel");
    await userEvent.click(panel.querySelector<HTMLElement>('[data-testid="ss-arrange-sendToBack"]')!);
    await waitFor(() => (app!.editor.getShape(over)!.index < app!.editor.getShape(under)!.index ? true : null), {
      what: "the index to drop below its sibling",
    });
  });
});

describe("the selection pill — opacity", () => {
  // SELECTOR MOVED: the opacity readout was `ss-selection-opacity-value`, a
  // cell sitting loose on the bar. Zach, 2026-09-24: "I also don't like the
  // opacity slider on the tool bar ... that is something that relates to the
  // fill and stroke." So it is now a `ContinuousRow` INSIDE both paint panels
  // (`control-continuous-input` plus its `<output>`), and the test opens the
  // Inside panel first. The claim itself is untouched.
  //
  // AMENDED: the shape is a geo, not an `ss-block`. The panel that carries
  // opacity is bound only when the selection shares a colour AND a fill, which
  // an `ss-block` does not — `appearanceModel.ts` drops a control with no
  // candidate rather than drawing an empty one. That is the same rule this file
  // asserts two describes below, so the fixture follows it instead of fighting
  // it.
  it("reads the selection's real opacity and writes it back to the shape", async () => {
    app = await mountApp();
    const id = placeGeo(300, 300);
    app.editor.select(id);

    const panel = await openPanel("ss-control-inside", "ss-control-panel-inside");
    const readoutText = () =>
      panel.querySelector<HTMLElement>('[data-slot="control-continuous"] output')?.textContent ?? null;
    await waitFor(() => (readoutText() !== null ? true : null), { what: "the opacity readout in the Inside panel" });
    expect(readoutText(), "a fresh shape is fully opaque").toBe("100%");

    // Drive the EDITOR and prove the pill follows, which is the direction that
    // catches a readout wired to local state instead of the store. It is the
    // whole point of the case, and the new renderer makes it MORE worth
    // asserting, not less: `ContinuousRow` keeps a local `draft` for the drag,
    // so "follows the editor" now means that draft re-syncs rather than
    // shadowing the store.
    app.editor.setOpacityForSelectedShapes(0.5);
    await waitFor(() => (readoutText() === "50%" ? true : null), {
      what: `the readout to follow the editor (reads ${readoutText()})`,
    });
    expect(app.editor.getShape(id)!.opacity).toBeCloseTo(0.5, 2);
  });
});

describe("the selection pill — the appearance bar", () => {
  // AMENDED BY P-035, and the amendment SHARPENS the claim rather than
  // relaxing it.
  //
  // This case used to assert "the style bar appears for a geo and NOT for one
  // of the app's own blocks", at CLUSTER granularity. That passed only while
  // no `ss-*` shape declared a `StyleProp` at all, so the cluster was empty
  // for a block by arithmetic. P-035 gives `ss-block`/`ss-port`/`ss-wire` a
  // real style of their own (`ss:diff`), so the cluster now renders for a
  // block — carrying exactly one row.
  //
  // The thing the original case was protecting is NOT that cluster's absence.
  // `isNativeTldrawSelection`'s own note says what it is: never "silently hand
  // a new app shape the style bar and let a user set a `dash` on it". So the
  // assertion moves to ROW granularity, where that danger actually lives, and
  // is now two-way: tldraw's six rows must never reach a block, and the app's
  // Diff row must never reach a geo. Measured before the amendment, at the
  // commit that added the prop: the old cluster-level line timed out at 10s
  // with the pill showing the Diff trigger beside the block-view toggle.
  //
  // SELECTOR MOVED, 2026-09-24: a "row" used to be its own `ss-style-<style>`
  // trigger on the bar. The bar is now four triggers and a row is either one of
  // them or a section stacked inside one's panel, so the assertion reads
  // `data-control` off the appearance cluster. What that costs and what it does
  // not: `dash` and `fill` are no longer trigger ids, so "never a dash on one of
  // ours" is now carried by the absence of the Edge and Inside triggers, which
  // are the ONLY places a dash or a fill can be reached from. An `ss-` block
  // whose bar is exactly `["diff"]` has no path to either — the claim is intact,
  // and the selector is the one the renderer actually emits.
  it("gives a geo tldraw's OWN controls and none of the app's, and an ss- block the app's control and none of tldraw's", async () => {
    app = await mountApp();

    app.editor.select(placeGeo(300, 300));
    const onGeo = await appearanceTriggers();
    expect(onGeo, "a geo carries tldraw's paint controls").toContain("inside");
    expect(onGeo, "…and its edge, which is where dash lives").toContain("edge");
    expect(onGeo, "a geo must NEVER be offered the app's diff mark").not.toContain("diff");

    app.editor.selectNone();
    app.editor.select(placeBlock("mine", 700, 300));
    const onBlock = await appearanceTriggers();
    // The whole point of the original case, kept verbatim in force: no `dash`,
    // no `fill`, no `font` on one of ours — and now, mechanically, no trigger
    // from which any of the three could be opened.
    expect(onBlock, "an ss- block gets ONLY its own control — never a dash or a fill").toEqual(["diff"]);
  });

  // SELECTOR MOVED: the colour swatches used to be `ss-style-color-<value>`
  // inside `ss-style-color-panel`. They are now the Inside panel's own option
  // buttons, which carry no test id at all — `[data-control][data-value]` is
  // the kit's contract (`controlPanel.tsx`'s `ControlOptionButton`).
  it("picking a colour writes tldraw's own style onto the shape", async () => {
    app = await mountApp();
    const id = placeGeo(300, 300);
    app.editor.select(id);

    const panel = await openPanel("ss-control-inside", "ss-control-panel-inside");
    const blue = await waitFor(() => panel.querySelector<HTMLElement>('[data-control="inside"][data-value="blue"]'), {
      what: "the blue swatch in the Inside panel",
    });
    await userEvent.click(blue);

    // Still read back through tldraw's OWN style map, not through the app's
    // `applyFillColor`: the claim is that the press reaches `DefaultColorStyle`,
    // and asking the thing that wrote it would prove nothing.
    await waitFor(
      () => {
        const shared = app!.editor.getSharedStyles().get(DefaultColorStyle);
        return shared?.type === "shared" && shared.value === "blue" ? true : null;
      },
      { what: "the shape's colour to become blue" },
    );
  });

  // SELECTOR AND MECHANISM MOVED: the face was a `<span>` with a
  // `backgroundColor`, at `ss-style-color-face`. It is now an inline
  // `<svg class="bbox-control-glyph">` inside the Inside trigger, and the
  // colour lives on a painted `<rect>`'s `fill` — so the read is
  // `getComputedStyle(rect).fill`. The ORACLE is unchanged and is the point of
  // the case: tldraw's own theme, read independently of the component.
  it("the swatch face paints tldraw's REAL hex for the value, not a guessed colour", async () => {
    app = await mountApp();
    const id = placeGeo(300, 300);
    app.editor.select(id);
    // WHY the fill treatment is set too, and why it is a precondition rather
    // than a second claim: `PaintFace` deliberately draws NO body for
    // `fill: "none"` (the keyline alone — an empty face, which is the honest
    // picture of an unfilled shape), and a stock geo is born unfilled. Without
    // this line the test would be asserting a hex on a rect that correctly does
    // not exist.
    app.editor.setStyleForSelectedShapes(DefaultFillStyle, "solid");
    app.editor.setStyleForSelectedShapes(DefaultColorStyle, "blue");

    const bar = await pill();
    const trigger = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-control-inside"]'), {
      what: "the Inside trigger",
    });
    // The painted rect is the one that is not the keyline; the keyline is
    // `fill="none"` by construction and carries no `data-role` to key off, so
    // the computed fill IS the discriminator.
    const paintedRect = () =>
      [...trigger.querySelectorAll<SVGRectElement>("svg.bbox-control-glyph rect")].find(
        (rect) => getComputedStyle(rect).fill !== "none",
      ) ?? null;

    // The oracle is tldraw's own theme, read independently of the component.
    const theme = app.editor.getTheme("default")!;
    const palette = theme.colors[app.editor.user.getIsDarkMode() ? "dark" : "light"] as unknown as Record<string, { solid: string }>;
    const expected = palette.blue!.solid;
    const face = await waitFor(paintedRect, { what: "the face to paint a colour" });

    // Compare through the browser's own parser so #4465e9 and rgb(68,101,233)
    // are the same answer. The probe is a real SVG rect rather than the old
    // `<span>`: `fill` is an SVG presentation property, and resolving it on the
    // element type that actually carries it is what keeps the two sides of this
    // comparison the same computation.
    const probeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    probeSvg.appendChild(probe);
    document.body.appendChild(probeSvg);
    probe.style.fill = expected;
    const expectedFill = getComputedStyle(probe).fill;
    probeSvg.remove();
    expect(getComputedStyle(face).fill, `the face should paint tldraw's blue (${expected})`).toBe(expectedFill);
  });

  it("renders exactly the triggers getSharedStyles supports — the oracle is tldraw, not a shape-type switch in our code", async () => {
    // WHY this is a map from trigger to REQUIRED STYLES rather than a
    // hand-written list of triggers per shape kind: the first draft of the old
    // version of this case asserted "an arrow has no Fill", and it was simply
    // wrong — a tldraw v5 arrow does carry a fill style. Guessing a shape's
    // style set is the exact mistake the implementation avoids by asking the
    // editor, so the test asks the editor too. A hand-written expectation here
    // would just be the shape-type switch again, in the test.
    //
    // AMENDED, and this is the honest shape of it: the old case compared the
    // rendered rows against `activeStyleRows(getSharedStyles())` — one of our
    // own functions — so the assertion was really "the bar renders what that
    // function says", and the tldraw-is-the-oracle part came along for free
    // because the function was a thin pass over the map. `appearanceModel.ts`
    // is not thin: four triggers over eleven styles, some of them stacked
    // sections. So the two halves are separated deliberately:
    //
    //   THE MAP BELOW IS THE SPEC — a declaration of which styles each trigger
    //   requires, written once, here, where a reviewer can read it.
    //   THE SHARED-NESS COMES FROM `editor.getSharedStyles()` — never from a
    //   list of shape kinds, and never from `appearanceModel.ts` itself, which
    //   is the code under test.
    //
    // A regression that made a trigger appear for a shape that cannot carry its
    // style still fails here, which is the thing the original was protecting.
    const TRIGGER_STYLES: ReadonlyArray<readonly [string, readonly StyleProp<string>[]]> = [
      ["geo", [GeoShapeGeoStyle as unknown as StyleProp<string>]],
      // Inside paints a fill TREATMENT in the colour, so it needs both.
      ["inside", [DefaultColorStyle, DefaultFillStyle]],
      ["edge", [DefaultDashStyle]],
      ["text", [DefaultSizeStyle]],
      ["diff", [DiffMarkStyle as unknown as StyleProp<string>]],
    ];

    app = await mountApp();
    for (const make of [() => placeGeo(300, 300), () => {
      const id = createShapeId();
      app!.editor.createShape({ id, type: "arrow", x: 200, y: 200 } as never);
      return id;
    }]) {
      app.editor.selectNone();
      app.editor.select(make());
      const shared = app.editor.getSharedStyles();
      const expected = TRIGGER_STYLES.filter(([, styles]) => styles.every((style) => shared.get(style) !== undefined)).map(
        ([id]) => id,
      );
      expect(expected.length, "the shape shares at least one control's styles").toBeGreaterThan(0);
      const rendered = await appearanceTriggers();
      expect(rendered, "the pill renders tldraw's own answer, in the recipe's order").toEqual(expected);
    }
  });
});

describe("the selection pill — Focus", () => {
  it("zooms the camera onto the selection: the zoom level changes and the shape ends up near the viewport centre", async () => {
    app = await mountApp();
    // ON SCREEN deliberately. The first draft placed this at (1800,1400) and
    // the pill never appeared — correctly: `isSelectionOnScreen` hides it for
    // an off-screen selection. Zooming out instead keeps the shape visible
    // while leaving `zoomToSelection` a real distance to travel.
    const id = placeBlock("focus me", 300, 300);
    app.editor.setCamera({ x: 0, y: 0, z: 0.4 });
    app.editor.select(id);
    const before = app.editor.getZoomLevel();

    const bar = await pill();
    await userEvent.click(bar.querySelector<HTMLElement>('[data-testid="ss-selection-focus"]')!);

    await waitFor(() => (Math.abs(app!.editor.getZoomLevel() - before) > 0.01 ? true : null), {
      what: `the zoom level to move (was ${before})`,
      timeout: 4000,
    });
  });
});
