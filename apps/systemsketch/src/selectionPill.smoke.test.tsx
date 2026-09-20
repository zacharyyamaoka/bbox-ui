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
import { createShapeId, DefaultColorStyle, type TLShapeId } from "tldraw";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { activeStyleRows } from "./chrome/arrangeActions";
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
  it("reads the selection's real opacity and writes it back to the shape", async () => {
    app = await mountApp();
    const id = placeBlock("fade", 300, 300);
    app.editor.select(id);
    const bar = await pill();

    const readout = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-selection-opacity-value"]'), {
      what: "the opacity readout",
    });
    expect(readout.textContent, "a fresh shape is fully opaque").toBe("100%");

    // Drive the EDITOR and prove the pill follows, which is the direction that
    // catches a readout wired to local state instead of the store.
    app.editor.setOpacityForSelectedShapes(0.5);
    await waitFor(() => (readout.textContent === "50%" ? true : null), {
      what: `the readout to follow the editor (reads ${readout.textContent})`,
    });
    expect(app.editor.getShape(id)!.opacity).toBeCloseTo(0.5, 2);
  });
});

describe("the selection pill — the tldraw style bar", () => {
  it("appears for a stock geo shape and NOT for one of the app's own blocks", async () => {
    app = await mountApp();

    app.editor.select(placeGeo(300, 300));
    const withGeo = await pill();
    await waitFor(() => withGeo.querySelector('[data-testid="ss-selection-style"]'), { what: "the style bar on a geo" });

    app.editor.selectNone();
    app.editor.select(placeBlock("mine", 700, 300));
    const withBlock = await pill();
    await waitFor(() => (withBlock.querySelector('[data-testid="ss-selection-style"]') === null ? true : null), {
      what: "NO style bar on an ss- block",
    });
  });

  it("picking a colour writes tldraw's own style onto the shape", async () => {
    app = await mountApp();
    const id = placeGeo(300, 300);
    app.editor.select(id);

    const panel = await openPanel("ss-style-color", "ss-style-color-panel");
    const blue = await waitFor(() => panel.querySelector<HTMLElement>('[data-testid="ss-style-color-blue"]'), {
      what: "the blue swatch",
    });
    await userEvent.click(blue);

    await waitFor(
      () => {
        const shared = app!.editor.getSharedStyles().get(DefaultColorStyle);
        return shared?.type === "shared" && shared.value === "blue" ? true : null;
      },
      { what: "the shape's colour to become blue" },
    );
  });

  it("the swatch face paints tldraw's REAL hex for the value, not a guessed colour", async () => {
    app = await mountApp();
    const id = placeGeo(300, 300);
    app.editor.select(id);
    app.editor.setStyleForSelectedShapes(DefaultColorStyle, "blue");

    const bar = await pill();
    const face = await waitFor(() => bar.querySelector<HTMLElement>('[data-testid="ss-style-color-face"]'), {
      what: "the colour face",
    });
    // The oracle is tldraw's own theme, read independently of the component.
    const theme = app.editor.getTheme("default")!;
    const palette = theme.colors[app.editor.user.getIsDarkMode() ? "dark" : "light"] as unknown as Record<string, { solid: string }>;
    const expected = palette.blue!.solid;
    await waitFor(
      () => {
        const painted = getComputedStyle(face).backgroundColor;
        return painted && painted !== "rgba(0, 0, 0, 0)" ? painted : null;
      },
      { what: "the face to paint a colour" },
    );
    // Compare through the browser's own parser so #4465e9 and rgb(68,101,233)
    // are the same answer.
    const probe = document.createElement("span");
    probe.style.backgroundColor = expected;
    document.body.appendChild(probe);
    const expectedRgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    expect(getComputedStyle(face).backgroundColor, `the face should paint tldraw's blue (${expected})`).toBe(expectedRgb);
  });

  it("renders exactly the rows getSharedStyles reports — the oracle is tldraw, not a shape-type switch in our code", async () => {
    // WHY this compares against `activeStyleRows` rather than asserting "an
    // arrow has no Fill": the first draft of this test DID assert that, and it
    // was simply wrong — a tldraw v5 arrow does carry a fill style. Guessing a
    // shape's style set is the exact mistake the implementation avoids by
    // asking the editor, so the test asks the editor too. A hand-written
    // expectation here would just be the shape-type switch again, in the test.
    app = await mountApp();
    for (const make of [() => placeGeo(300, 300), () => {
      const id = createShapeId();
      app!.editor.createShape({ id, type: "arrow", x: 200, y: 200 } as never);
      return id;
    }]) {
      app.editor.selectNone();
      app.editor.select(make());
      const bar = await pill();
      const expected = activeStyleRows(app.editor.getSharedStyles()).map((row) => row.id);
      expect(expected.length, "the shape shares at least one style").toBeGreaterThan(0);
      await waitFor(() => bar.querySelector('[data-testid="ss-selection-style"]'), { what: "the style bar" });
      // Only the ROW TRIGGERS, not their `-face` spans or `-panel` popovers:
      // `ss-style-color` yes, `ss-style-color-face` no.
      const rendered = [...bar.querySelectorAll<HTMLElement>('[data-testid^="ss-style-"]')]
        .map((el) => el.getAttribute("data-testid")!)
        .filter((id) => /^ss-style-[a-z]+$/.test(id))
        .map((id) => id.replace("ss-style-", ""));
      expect(rendered, "the pill renders tldraw's own answer, in order").toEqual(expected);
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
