// src/blockHitTest.smoke.test.tsx — acceptance for Zach's 2026-09-20 report:
//
//   "in expanded view I can only select it by hovering over the edge … if I
//    hover over the header and other parts it should also become selected!!!"
//
// The "edge" he could hit is tldraw's 3px `hitTestMargin` ring around the box
// outline — the only thing an expanded block's geometry answered, because
// `BlockShapeUtil.getGeometry` handed back a `Group2d` with ONE child and no
// label children. The frame-like branch of `Editor.getShapeAtPoint`
// (Editor.js:4325-4344) returns the shape for a point inside an `isLabel`
// child's bounds, for a point within the margin of the outline, and for
// nothing else inside the frame. So the header band has to BE a label child.
//
// Everything spatial here is MEASURED off the running app — the header band is
// read back from the rendered `[data-slot="block-header"]` with
// `getBoundingClientRect` and projected into page space with the editor's own
// camera math — and every selection claim is read from the engine
// (`getShapeAtPoint`, `getSelectedShapeIds`), never from DOM presence.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { Group2d, Rectangle2d, createShapeId, type TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };

function makeBlock(name: string, x: number, y: number, props: Record<string, unknown>): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, ports: NO_PORTS, ...props } } as never);
  return id;
}

/** The block's own face wrapper. `data-ss-node` is stamped per SHAPE
 *  (shapes/shared/nodeShapeComponent.tsx), so this never resolves to a member's
 *  face the way a bare `[data-slot="block"]` inside a frame would. */
async function faceOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"]`), { what: `the face of ${id}` });
}

/** The block's OWN header band, `:scope >` for the reason blockPort.tsx:230-233
 *  records: a member of an expanded block is itself a `BlockPort` with its own
 *  `block-header`, and an unscoped query measures the child's band. */
async function headerOf(id: TLShapeId): Promise<HTMLElement> {
  const face = await faceOf(id);
  return waitFor(() => {
    const block = face.querySelector<HTMLElement>('[data-slot="block"]');
    return block?.querySelector<HTMLElement>(':scope > [data-slot="block-header"]') ?? null;
  }, { what: `the header of ${id}` });
}

/** Screen px -> page px, through the editor's own camera. */
function pageAt(screen: { x: number; y: number }) {
  return app!.editor.screenToPage(screen);
}

/**
 * A real press at an exact VIEWPORT point.
 *
 * `userEvent.click(el)` alone presses the element's centre, and
 * `{ position }` is measured from the element's own top-left — so a press
 * aimed at a block's body by handing `elementFromPoint`'s result a literal
 * `{x:1,y:1}` lands in the top-left corner of whatever it found, i.e. in the
 * HEADER. (That is exactly how the first cut of this test reported a body
 * press selecting the block; the geometry was innocent.) Resolve the element
 * under the point, then offset back to the point.
 */
async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${screen.x}, ${screen.y})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

/** Exactly what the hover path asks (`updateHoveredShapeId` passes
 *  `hitLabels: false`, and the label loop runs anyway — that is what makes a
 *  label band light the hover indicator as well as answer a press). */
function shapeAt(page: { x: number; y: number }): string | null {
  return app!.editor.getShapeAtPoint(page, { hitLabels: false })?.id ?? null;
}

function pageBoundsOf(id: TLShapeId) {
  const b = app!.editor.getShapePageBounds(id)!;
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/** Settled = the measurement pass (shapes/shared/measure.ts) has written the
 *  rendered box back into props and stopped moving it. */
async function settled(id: TLShapeId, w: number, h: number) {
  await waitFor(() => {
    const s = app!.editor.getShape(id) as { props: { w: number; h: number } } | undefined;
    return s && Math.abs(s.props.w - w) < 1 && Math.abs(s.props.h - h) < 1 ? true : null;
  }, { what: `${id} measured to ${w}x${h}` });
}

describe("an expanded block answers a press on its HEADER, and stays hollow everywhere else", () => {
  it("the whole header band selects the block — not just the 3px edge ring", async () => {
    app = await mountApp();
    const parent = makeBlock("process()", 120, 160, { view: "expanded", w: 320, h: 240 });
    await settled(parent, 320, 240);
    const header = await headerOf(parent);

    // MEASURED: where the band actually is on screen, at camera z=1.
    const rect = header.getBoundingClientRect();
    expect(rect.height, "a header that did not render has nothing to claim").toBeGreaterThan(10);

    // The geometry's label band must cover the band the user sees. Read the
    // engine's own child, do not trust the constant.
    const geometry = app.editor.getShapeGeometry(parent);
    expect(geometry).toBeInstanceOf(Group2d);
    const labels = (geometry as Group2d).children.filter((child) => child.isLabel);
    expect(labels, "exactly one chrome band: the header. The interior is deliberately not chrome").toHaveLength(1);
    expect(Math.abs(labels[0].bounds.h - rect.height), `geometry band ${labels[0].bounds.h}px vs rendered header ${rect.height}px`).toBeLessThanOrEqual(1);
    expect(labels[0].bounds.y).toBe(0);
    expect(labels[0].bounds.w).toBeGreaterThanOrEqual(rect.width);

    // Five points ACROSS the band, every one ≥ 6px clear of the box outline so
    // a pass cannot be tldraw's `hitTestMargin` ring in disguise — that ring is
    // the "edge" Zach was reduced to.
    const ys = [rect.top + rect.height / 2];
    const xs = [0.2, 0.35, 0.5, 0.65, 0.8].map((t) => rect.left + rect.width * t);
    for (const x of xs) {
      for (const y of ys) {
        const point = pageAt({ x, y });
        expect(shapeAt(point), `header point (${Math.round(x)}, ${Math.round(y)}) must answer the block`).toBe(parent);
      }
    }

    // And a REAL press on the rendered header selects it. `contentOwnsPress`
    // lets a header press through to tldraw only when the header's own
    // `data-block-id` is this shape (pointerOwnership.ts:42-45), so this also
    // proves the two gates agree.
    app.editor.selectNone();
    await userEvent.click(header);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection after pressing the header" });
    expect(app.editor.getSelectedShapeIds()).toEqual([parent]);
  });

  it("a CHILD block inside the frame takes its own press; the frame never steals it", async () => {
    app = await mountApp();
    const parent = makeBlock("process()", 120, 160, { view: "expanded", w: 360, h: 260 });
    await settled(parent, 360, 260);
    const kid = makeBlock("kid", 160, 320, { view: "port", w: 160, h: 100 });
    app.editor.reparentShapes([kid], parent);
    await settled(kid, 160, 100);
    expect(app.editor.getShape(kid)!.parentId, "the kid must really be a member, or this proves nothing").toBe(parent);

    const kidHeader = await headerOf(kid);
    const rect = kidHeader.getBoundingClientRect();
    const point = pageAt({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    // z-order, not geometry: `pushShapeWithDescendants` puts a child at a
    // higher index than its parent and `getShapeAtPoint` iterates backwards,
    // so the child is tested first and returns before the parent's label loop
    // is ever reached.
    expect(shapeAt(point)).toBe(kid);

    app.editor.selectNone();
    await userEvent.click(kidHeader);
    await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection after pressing the member" });
    expect(app.editor.getSelectedShapeIds()).toEqual([kid]);
  });

  it("the empty interior selects nothing — the donor's answer, kept on purpose", async () => {
    // WHY nothing, rather than "the frame": the interior must keep answering
    // step (3) of the frame-like branch — `getShapeAtPoint` reaches it, returns
    // `undefined` and STOPS the search. That same predicate is what
    // `getDraggingOverShape` asks (`isPointInShape(…, {hitInside: true})`), so
    // a frame whose interior claimed the point would stop adopting dropped
    // blocks, and every wire painted underneath would stop being clickable —
    // "a container ceasing to be one" (systemsketch 93c84177). In bbox-ui the
    // same point is independently swallowed at the DOM by `contentOwnsPress`,
    // and the two mechanisms agreeing is the cross-check that this fix
    // disturbed neither.
    app = await mountApp();
    const parent = makeBlock("process()", 120, 160, { view: "expanded", w: 320, h: 240 });
    await settled(parent, 320, 240);
    const header = await headerOf(parent);
    const headerRect = header.getBoundingClientRect();
    const bounds = pageBoundsOf(parent);

    // Well below the band and well inside the outline — 60px clear of both.
    const belowHeader = pageAt({ x: headerRect.left + headerRect.width / 2, y: headerRect.bottom + 60 });
    expect(belowHeader.y).toBeLessThan(bounds.y + bounds.h - 10);
    expect(shapeAt(belowHeader), "the interior must stay see-through").toBeNull();

    app.editor.selectNone();
    await clickAtScreen(app.editor.pageToScreen(belowHeader));
    expect(app.editor.getSelectedShapeIds(), "a body press selects nothing: the geometry is hollow AND contentOwnsPress hides it").toEqual([]);

    // And the band above it still answers from the very same run — so the
    // hollow interior is a property of WHERE the press landed, not of a test
    // that stopped being able to select anything at all.
    await clickAtScreen({ x: headerRect.left + headerRect.width / 2, y: headerRect.top + headerRect.height / 2 });
    expect(app.editor.getSelectedShapeIds()).toEqual([parent]);
  });

  it("the band is out of the shape's bounds: identical page bounds before and after the geometry gains it", async () => {
    // BEFORE = the same record in `port` view, whose geometry is a bare
    // `Rectangle2d` and has never had a band. AFTER = `expanded`, which is the
    // only view this change touches. `excludeFromShapeBounds` is what keeps
    // these equal; without it a laid-out band widens `geometry.bounds` and a
    // 1x1 drag-create placeholder snaps to its own layout on the first move.
    app = await mountApp();
    const id = makeBlock("process()", 120, 160, { view: "port", w: 320, h: 240 });
    await settled(id, 320, 240);
    const before = pageBoundsOf(id);
    const beforeGeometry = app.editor.getShapeGeometry(id);
    expect(beforeGeometry).toBeInstanceOf(Rectangle2d);
    expect(beforeGeometry.isFilled, "the two non-container views are unchanged by this lane").toBe(true);

    app.editor.updateShape({ id, type: BLOCK_SHAPE_TYPE, props: { view: "expanded" } } as never);
    await waitFor(() => (app!.editor.getShapeGeometry(id) instanceof Group2d ? true : null), { what: "frame-like geometry" });
    await settled(id, 320, 240);

    expect(pageBoundsOf(id)).toEqual(before);
    const geometry = app.editor.getShapeGeometry(id) as Group2d;
    expect({ x: geometry.bounds.x, y: geometry.bounds.y, w: geometry.bounds.w, h: geometry.bounds.h }).toEqual({ x: 0, y: 0, w: 320, h: 240 });
    expect(geometry.children.filter((child) => child.isLabel).every((child) => child.excludeFromShapeBounds)).toBe(true);
  });

  it("the simple and port views keep their bare, unlabelled rectangle", async () => {
    app = await mountApp();
    const simple = makeBlock("s", 120, 120, { view: "simple", w: 160, h: 60 });
    const port = makeBlock("p", 420, 120, { view: "port", w: 160, h: 100 });
    await waitFor(() => (app!.editor.getShape(simple) && app!.editor.getShape(port) ? true : null), { what: "both blocks" });
    for (const id of [simple, port]) {
      const geometry = app.editor.getShapeGeometry(id);
      expect(geometry, `${id} must not become frame-like`).toBeInstanceOf(Rectangle2d);
      expect(geometry.isLabel).toBe(false);
      expect(geometry.isFilled).toBe(true);
    }
  });
});
