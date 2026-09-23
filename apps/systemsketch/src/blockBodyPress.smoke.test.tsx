// src/blockBodyPress.smoke.test.tsx — acceptance for parity item P-007,
// "Press a simple/port-view block's BODY to select and drag it", and for the
// real-browser half of P-001, "pointer-events re-enabled for bbox-ui shapes".
//
// THE BUG THIS PINS. `shapes/shared/pointerOwnership.ts` answered
// `contentOwnsPress` for EVERY press that did not land on a
// `[data-slot="block-header"]`, with no reference to the block's view. So a
// press on the body of a simple- or port-view block was marked handled and
// tldraw never saw it: the block could only be grabbed by its header band or
// by the 3px `hitTestMargin` ring around its outline — "expanded view only
// selectable by edge", the same complaint from the other side.
//
// The expanded view is the ONE view where that is correct, and
// `blockHitTest.smoke.test.tsx` holds the reasons: its hollow interior is what
// lets `getDraggingOverShape` keep adopting dropped blocks, and what keeps a
// wire painted underneath clickable. So the rule is view-conditional, and both
// halves are asserted here in the same run.
//
// Everything spatial is MEASURED off the running app and every selection or
// movement claim is read from the engine (`getSelectedShapeIds`,
// `getShapePageBounds`), never from DOM presence. This suite runs in real
// headless Chromium (`vitest.config.ts`'s `smoke` project, playwright
// provider) — which is what makes it, and not a jsdom test, evidence about
// pointer-events at all.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { canvasOf, mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const ONE_PORT_EACH = {
  left: [{ id: "in", declaration: "frame" }],
  right: [{ id: "out", declaration: "pose" }],
  top: [],
  bottom: [],
};

// TWO ports on one wall — 2026-09-22, Codex audit: a single-port rail can
// never actually exercise a reorder (nothing to reorder INTO), so the old
// "a rail drag reorders" fixture proved something weaker than its own name
// by construction, one port short of the thing it claimed to test.
const TWO_PORTS_RIGHT = {
  left: [],
  right: [
    { id: "first", declaration: "first" },
    { id: "second", declaration: "second" },
  ],
  top: [],
  bottom: [],
};

function makeBlock(name: string, x: number, y: number, props: Record<string, unknown>): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, ports: ONE_PORT_EACH, ...props } } as never);
  return id;
}

/** The block CARD — header plus body — inside this shape's own face. */
async function cardOf(id: TLShapeId): Promise<HTMLElement> {
  return waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block"]`), { what: `the card of ${id}` });
}

async function headerOf(id: TLShapeId): Promise<HTMLElement> {
  const card = await cardOf(id);
  return waitFor(() => card.querySelector<HTMLElement>(':scope > [data-slot="block-header"]'), { what: `the header of ${id}` });
}

/**
 * A point in the BODY: horizontally centred (clear of both rails and of every
 * port dot, which ride the walls) and vertically midway between the header's
 * bottom and the card's bottom. Returned in viewport px, measured off the
 * rendered card — never computed from `props.w/h`, which is the number under
 * test's own input.
 */
function bodyPointOf(card: HTMLElement, header: HTMLElement): { x: number; y: number } {
  const cardRect = card.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  return { x: cardRect.left + cardRect.width / 2, y: (headerRect.bottom + cardRect.bottom) / 2 };
}

/** A real press at an exact VIEWPORT point: resolve what is under it, then
 *  offset back to the point (a bare `click(el)` presses the element's centre,
 *  which for a card is not the body). */
async function clickAtScreen(screen: { x: number; y: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.click(element, { position: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) } });
}

/** Drag from an exact viewport point by an exact delta, through Playwright. */
async function dragFromScreen(screen: { x: number; y: number }, by: { dx: number; dy: number }) {
  const element = document.elementFromPoint(screen.x, screen.y);
  if (!element) throw new Error(`nothing under (${Math.round(screen.x)}, ${Math.round(screen.y)})`);
  const rect = element.getBoundingClientRect();
  await userEvent.dragAndDrop(element, canvasOf(app!.root), {
    sourcePosition: { x: Math.round(screen.x - rect.left), y: Math.round(screen.y - rect.top) },
    targetPosition: { x: Math.round(screen.x + by.dx), y: Math.round(screen.y + by.dy) },
  });
}

/**
 * A real pointer-event drag between two exact viewport points, dispatched
 * straight onto `from` — `BlockPort.stories.tsx`'s own `dragElement`, the
 * proven way to trigger a dnd-kit `PointerSensor` reorder (its
 * `activationConstraint: { distance: 4 }` needs a real intermediate move,
 * which is why there is one below). `dragFromScreen`/`userEvent.dragAndDrop`
 * above is target-relative (`canvasOf`'s own box) and tuned for tldraw's own
 * gesture layer — right for a block body drag, but it never proved it could
 * arm a SORTABLE drag, and measured live (2026-09-22) it does not.
 */
async function dragAlongRail(from: Element, start: { x: number; y: number }, end: { x: number; y: number }) {
  const fire = (type: string, x: number, y: number) =>
    from.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  fire("pointerdown", start.x, start.y);
  await new Promise((r) => setTimeout(r, 30));
  fire("pointermove", start.x, start.y + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  fire("pointermove", end.x, end.y);
  await new Promise((r) => setTimeout(r, 30));
  fire("pointerup", end.x, end.y);
  await new Promise((r) => setTimeout(r, 100));
}

/** Settled = the measurement pass (shapes/shared/measure.ts) has written the
 *  rendered box back into props and stopped moving it. */
async function settled(id: TLShapeId, w: number, h: number) {
  await waitFor(() => {
    const s = app!.editor.getShape(id) as { props: { w: number; h: number } } | undefined;
    return s && Math.abs(s.props.w - w) < 1 && Math.abs(s.props.h - h) < 1 ? true : null;
  }, { what: `${id} measured to ${w}x${h}` });
}

describe("P-007 — a simple- or port-view block is grabbed by its BODY", () => {
  // WHY every fixture carries a description: the card's BODY is the region
  // under the header, and `Block` paints nothing there when `description` is
  // "" (the "never written" state, ruling 9). A simple-view block with no
  // description is a header-only card — measured here first, as Playwright
  // refusing the press with "<div class=\"tl-background\"> intercepts pointer
  // events", i.e. the aimed point was off the card entirely. So the fixture
  // gives the block something to say, and the test aims inside what it paints.
  const DESCRIPTION = "reads a frame and answers with a pose";

  for (const view of ["simple", "port"] as const) {
    it(`${view} view: a body press selects the block`, async () => {
      app = await mountApp();
      const id = makeBlock(`${view}()`, 200, 200, { view, w: 220, h: 160, description: DESCRIPTION });
      const card = await cardOf(id);
      const header = await headerOf(id);
      const point = bodyPointOf(card, header);

      // The press really lands in the body, not in the header — proved
      // against the rendered boxes rather than assumed from the arithmetic.
      expect(point.y, "aimed below the header").toBeGreaterThan(header.getBoundingClientRect().bottom + 4);
      expect(point.y, "aimed inside the card").toBeLessThan(card.getBoundingClientRect().bottom - 4);

      // ... and it is ≥ 8px clear of the box outline on every side, so a pass
      // cannot be tldraw's 3px `hitTestMargin` ring — the "edge" this bug
      // reduced the block to.
      const bounds = app.editor.getShapePageBounds(id)!;
      const page = app.editor.screenToPage(point);
      expect(Math.min(page.x - bounds.x, bounds.maxX - page.x, page.y - bounds.y, bounds.maxY - page.y)).toBeGreaterThan(8);

      app.editor.selectNone();
      await clickAtScreen(point);
      await waitFor(() => (app!.editor.getSelectedShapeIds().length > 0 ? true : null), { what: "a selection after pressing the body" });
      expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    });

    it(`${view} view: a body drag MOVES the block, by the distance dragged`, async () => {
      app = await mountApp();
      const id = makeBlock(`${view}()`, 200, 200, { view, w: 220, h: 160, description: DESCRIPTION });
      const card = await cardOf(id);
      const header = await headerOf(id);
      const point = bodyPointOf(card, header);
      const before = app.editor.getShapePageBounds(id)!;

      // Drag from COLD — nothing selected first, which is how a user grabs a
      // block they have not touched.
      app.editor.selectNone();
      await dragFromScreen(point, { dx: 90, dy: 70 });
      await waitFor(() => {
        const now = app!.editor.getShapePageBounds(id)!;
        return now.x !== before.x || now.y !== before.y ? true : null;
      }, { what: "the block moved by a body drag" });

      // MEASURED, not "it moved": camera z is 1 (harness), so screen px are
      // page px and the shape must land where the pointer put it.
      const after = app.editor.getShapePageBounds(id)!;
      expect(Math.abs(after.x - before.x - 90), `moved ${after.x - before.x}px in x, dragged 90`).toBeLessThanOrEqual(4);
      expect(Math.abs(after.y - before.y - 70), `moved ${after.y - before.y}px in y, dragged 70`).toBeLessThanOrEqual(4);
    });
  }

  it("the expanded view keeps its hollow body — a container that still adopts drops", async () => {
    // The deliberate exception, and the reason the rule reads the view at all.
    // Its full reasoning lives in blockHitTest.smoke.test.tsx; this asserts the
    // DOM half of it in the same run as the two views that DID change, so the
    // fix cannot be reported as "bodies are pressable" when what is true is
    // "bodies are pressable except where a body means something else".
    app = await mountApp();
    const id = makeBlock("process()", 200, 200, { view: "expanded", w: 320, h: 240 });
    await settled(id, 320, 240);
    const card = await cardOf(id);
    const header = await headerOf(id);
    const point = bodyPointOf(card, header);

    app.editor.selectNone();
    await clickAtScreen(point);
    expect(app.editor.getSelectedShapeIds(), "an expanded body press selects nothing").toEqual([]);

    // And the header on the very same block still answers, so the empty
    // selection above is a property of WHERE the press landed.
    await clickAtScreen({ x: header.getBoundingClientRect().left + header.getBoundingClientRect().width / 2, y: header.getBoundingClientRect().top + header.getBoundingClientRect().height / 2 });
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
  });

  it("a drag across an expanded interior starts no marquee — today's behaviour, pinned", async () => {
    // THE ASSERTION THAT MAKES THE EXPANDED BRANCH LOAD-BEARING, and it took a
    // measurement to find: the press test above is NOT sensitive to it. An
    // expanded block's geometry is already hollow, so even a press that
    // reaches tldraw hit-tests to nothing and clears the selection — `[]`
    // either way. What the DOM gate actually decides is whether tldraw sees
    // the gesture at all. MEASURED 2026-09-21 on this fixture: with the gate,
    // a drag across the interior leaves `getSelectedShapeIds() === []`;
    // with `bodyIsContent` stubbed to `false`, the same drag becomes a tldraw
    // brush and comes back `[kid]`.
    //
    // OPEN, and deliberately not decided here: stock tldraw DOES brush inside
    // a frame, so "marquee the members of an expanded block" is a reasonable
    // thing to want and this pins the opposite. It is pinned because it is
    // what the app does today and P-007 is about simple and port views; a lane
    // that wants the brush should change this test on purpose, not discover it
    // by accident.
    app = await mountApp();
    const parent = makeBlock("process()", 120, 160, { view: "expanded", w: 420, h: 340 });
    await settled(parent, 420, 340);
    const kid = makeBlock("kid", 220, 300, { view: "port", w: 120, h: 80 });
    app.editor.reparentShapes([kid], parent);
    await settled(kid, 120, 80);
    expect(app.editor.getShape(kid)!.parentId, "the kid must really be a member, or this proves nothing").toBe(parent);

    // A diagonal that sweeps the kid's box, both ends inside the parent and
    // clear of the kid itself.
    const start = app.editor.pageToScreen({ x: 150, y: 480 });
    const end = app.editor.pageToScreen({ x: 400, y: 260 });
    app.editor.selectNone();
    await dragFromScreen(start, { dx: end.x - start.x, dy: end.y - start.y });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(app.editor.getSelectedShapeIds(), "the interior press never reached tldraw, so no brush ran").toEqual([]);
  });

  it("a port rail still owns its own press: a rail drag reorders, it never moves the block", async () => {
    // THE MISDIRECTION THIS REPLACES (Codex audit, 2026-09-22, on the
    // version that pressed the CARD'S CENTRE): with only one port on the
    // rail, that centre coincides with the port DOT — and `wireGesture.ts`
    // (:362-395) captures a dot press and stops propagation before dnd-kit's
    // sortable listener ever sees it. So the old assertion ("the block
    // didn't move") was real, but it proved "a wire-start press doesn't
    // move the block", not "a rail drag reorders and isn't a block drag" —
    // a single-port rail can never exercise a reorder anyway, there being
    // nothing to reorder into. This version presses the LABEL of a rail
    // with two ports, well clear of the dot and its 40px hit halo
    // (`port.tsx`'s `port-dot-halo`, "the REAL hit element" for the dot —
    // its own comment), drags ALONG the rail past the neighbour, and reads
    // the reorder off the shape's own `props.ports.right`, not off the DOM.
    app = await mountApp();
    const id = makeBlock("railed()", 200, 200, { view: "port", w: 220, h: 220, ports: TWO_PORTS_RIGHT });
    const rail = await waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-port-rail"][data-edge="right"]`), { what: "the right rail" });
    const cards = await waitFor(() => {
      const found = Array.from(rail.querySelectorAll<HTMLElement>('[data-slot="port-edge-card"]'));
      return found.length === 2 ? found : null;
    }, { what: "both port cards" });

    const portIds = () => (app!.editor.getShape(id) as { props: { ports: { right: { id: string }[] } } }).props.ports.right.map((p) => p.id);
    expect(portIds(), "the fixture's order before any gesture").toEqual(["first", "second"]);

    // The PORT'S OWN CARD, not the rail's raw bounding box — see
    // `blockPort.tsx`'s rail-wrapper `pointerEvents: "none"` (2026-09-22):
    // the rail's box is `RAIL_CROSS_PX` wide and spans the whole body band,
    // so its geometric centre is not reliably over any port at all —
    // pressing there now falls through to whatever is underneath, by
    // design (that fallthrough is P-003/this file's own fix for the
    // wireGrab bug the same box caused). `[data-slot="port-edge-card"]` is
    // the actual dnd-kit-sortable surface (`portEdge.tsx`'s
    // `SortableSlotCard`), which re-arms `pointerEvents: "auto"`.
    const firstCard = cards[0];
    const label = firstCard.querySelector<HTMLElement>('[data-slot="port-label"]')!;
    const labelRect = label.getBoundingClientRect();
    const point = { x: labelRect.left + labelRect.width / 2, y: labelRect.top + labelRect.height / 2 };

    // Mechanical proof the press really lands on the label — clear of the
    // dot AND its hit halo (`port-dot-halo` is a CHILD of `port-dot`, so
    // `.closest` catches landing on either) — or this proves nothing about
    // a rail reorder.
    const hitAtPress = document.elementFromPoint(point.x, point.y);
    expect(hitAtPress?.closest('[data-slot="port-dot"]'), "the press must not resolve to the dot or its halo").toBeNull();
    expect(firstCard.contains(hitAtPress), "the press must still land inside this port's own card").toBe(true);

    const before = app.editor.getShapePageBounds(id)!;
    const wiresBefore = app.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).length;

    // Drag ALONG the rail (the column axis) onto the second card's own
    // centre — a real dnd-kit reorder gesture, never diagonal or off the
    // rail. Aimed at the CENTRE and not past it: the track itself is also a
    // registered `useDroppable` (`portEdge.tsx:1763`, `id: containerId`), so
    // overshooting past the last card's own box hands `closestCenter` the
    // whole track as the closer droppable instead of the neighbour's own
    // slot — measured live, that resolved `over` to `"right-rail"`, not
    // `"second"`, and the reorder silently no-op'd.
    const secondRect = cards[1].getBoundingClientRect();
    const target = { x: point.x, y: secondRect.top + secondRect.height / 2 };
    await dragAlongRail(firstCard, point, target);
    await waitFor(() => (portIds()[0] === "second" ? true : null), { what: "the rail order to swap" });

    const after = app.editor.getShapePageBounds(id)!;
    const wiresAfter = app.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).length;

    expect(portIds(), "the drag reordered the rail exactly as a swap would").toEqual(["second", "first"]);
    expect({ x: after.x, y: after.y }, "the rail is dnd-kit's, not the host's").toEqual({ x: before.x, y: before.y });
    expect(wiresAfter, "a label drag must never start a wire").toBe(wiresBefore);
  });

  it("GUARD: the rail's empty margin, outside the block's wall and clear of any dot, passes a press through to the canvas", async () => {
    // THE BUG THIS PINS (root cause of `wireGrab.smoke.test.tsx`'s "a press
    // on a CURVED cable..." failure, fixed 2026-09-22 in `blockPort.tsx`'s
    // rail-wrapper style): `railBoxFor` makes a rail's box `RAIL_CROSS_PX`
    // (56px) wide/tall so its CROSS centre lands on the Block's own wall —
    // which means half of it, by construction, sits OUTSIDE the block, over
    // whatever the host paints underneath (a cable, the canvas). Before the
    // fix, that whole box — including the empty margin nobody ever draws a
    // dot or label into — was hit-testable, so `elementFromPoint` there
    // resolved to the rail itself, and every host's `contentOwnsPress` read
    // that as "content owns it", hiding the press from tldraw entirely.
    app = await mountApp();
    const id = makeBlock("railed()", 200, 200, { view: "port", w: 220, h: 160 });
    const card = await cardOf(id);
    const rail = await waitFor(() => document.querySelector<HTMLElement>(`[data-ss-node="${id}"] [data-slot="block-port-rail"][data-edge="right"]`), { what: "the right rail" });
    const dot = await waitFor(() => rail.querySelector<HTMLElement>('[data-slot="port-dot"]'), { what: "the right rail's dot" });

    const cardRect = card.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();

    // A point inside the rail's own box, OUTSIDE the block's wall (clear of
    // the card's right edge) and well clear of the dot's own hit halo — or
    // this proves nothing about the empty margin.
    const point = { x: cardRect.right + 12, y: dotRect.bottom + 40 };
    expect(point.x, "the probe is inside the rail's own box").toBeLessThan(railRect.right);
    expect(point.x, "the probe is outside the block's own wall").toBeGreaterThan(cardRect.right);
    expect(point.y, "the probe is still within the rail's vertical span").toBeLessThanOrEqual(railRect.bottom);
    expect(Math.abs(point.y - (dotRect.top + dotRect.height / 2)), "the probe is clear of the dot's own box").toBeGreaterThan(dotRect.height);

    // Mechanical proof: the DOM hit-test no longer resolves inside the rail.
    const hit = document.elementFromPoint(point.x, point.y);
    expect(hit?.closest('[data-slot="block-port-rail"]'), "the rail's empty margin must not be the hit target").toBeNull();

    // A real tldraw pointer outcome, not just a DOM read: a background press
    // clears the selection. Before the fix the press never reached tldraw at
    // all (`markEventAsHandled`), so the prior selection survived untouched.
    app.editor.select(id);
    expect(app.editor.getSelectedShapeIds()).toEqual([id]);
    await clickAtScreen(point);
    expect(app.editor.getSelectedShapeIds(), "the press reached tldraw's background and cleared the selection").toEqual([]);
  });
});

describe("P-001 — the shape's own HTML takes pointer events at rest", () => {
  it("the block face is not pointer-events:none, and a body point resolves INSIDE it", async () => {
    // tldraw ships `.tl-html-container { pointer-events: none }`
    // (tldraw.css:1029-1039), so a shape's rendered UI is inert until the host
    // re-enables it. `NodeShapeFrame` does that with an inline
    // `pointerEvents: "all"` on the HTMLContainer — a different mechanism from
    // apps/docs' `:has([data-bbox-interactive])` rule, and unconditional
    // rather than scoped to `select.idle`, which is why the gesture boundary
    // is drawn in `contentOwnsPress` instead of in CSS.
    //
    // This assertion is the one that could only ever be made in a real
    // browser: jsdom does not implement pointer-events hit-testing, so
    // `elementFromPoint` there would answer the same either way.
    app = await mountApp();
    const id = makeBlock("live()", 200, 200, { view: "port", w: 220, h: 160, description: "a live face" });
    const card = await cardOf(id);
    const header = await headerOf(id);

    const container = await waitFor(() => document.querySelector<HTMLElement>(`[data-shape-id="${id}"] .tl-html-container`), { what: "the shape's HTML container" });
    expect(getComputedStyle(container).pointerEvents, "an inert container is P-001's bug").not.toBe("none");

    const point = bodyPointOf(card, header);
    const hit = document.elementFromPoint(point.x, point.y);
    expect(hit, "nothing under the block's own body").not.toBeNull();
    expect(card.contains(hit), `the point resolved to <${hit?.tagName.toLowerCase()}> outside the card`).toBe(true);
  });
});

describe("P-044 — a drag that starts on a block's TEXT moves the shape", () => {
  // SCOPE, said plainly: this covers the BLOCK's own text — the title in the
  // header and the description under it. It does NOT cover the `ss-code`
  // face, which is the surface P-044's own evidence points at and where the
  // app ships the opposite ON PURPOSE (`code.smoke.test.tsx:64`, "the grab
  // ring moves the shape; a press inside the editor face does not (the editor
  // owns its pointer)"). Changing that is a different lane and a different
  // conversation; see this lane's report.
  //
  // For a block, the answer turns out to be two independent mechanisms that
  // already agree, and both are measured here rather than assumed:
  //   1. there is no text to select — tldraw's `.tl-container *` carries
  //      `user-select: none` (tldraw.css:283-291), and a block's text is not
  //      `contenteditable`, so the `user-select: text` exception below it
  //      never applies;
  //   2. the press reaches the host — the header always did, and the
  //      description now does, via the P-007 change above.
  it("the title and the description are unselectable, and a drag from either moves the block", async () => {
    app = await mountApp();
    const id = makeBlock("estimate()", 200, 200, { view: "port", w: 240, h: 170, description: "reads a frame and answers with a pose" });
    const card = await cardOf(id);
    const header = await headerOf(id);
    const description = await waitFor(() => card.querySelector<HTMLElement>('[data-slot="block-description"]'), { what: "the description" });

    for (const [what, element] of [["title", header], ["description", description]] as const) {
      expect(getComputedStyle(element).userSelect, `${what} must not be selectable text`).toBe("none");
      expect(element.textContent?.trim().length, `${what} must actually paint characters, or this proves nothing`).toBeGreaterThan(3);

      const rect = element.getBoundingClientRect();
      const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const before = app!.editor.getShapePageBounds(id)!;
      app!.editor.selectNone();
      window.getSelection()?.removeAllRanges();

      await dragFromScreen(from, { dx: 70, dy: 50 });
      await waitFor(() => {
        const now = app!.editor.getShapePageBounds(id)!;
        return now.x !== before.x || now.y !== before.y ? true : null;
      }, { what: `the block moved by a drag from its ${what}` });

      const after = app!.editor.getShapePageBounds(id)!;
      expect(Math.abs(after.x - before.x - 70), `${what}: moved ${after.x - before.x}px in x, dragged 70`).toBeLessThanOrEqual(4);
      expect(Math.abs(after.y - before.y - 50), `${what}: moved ${after.y - before.y}px in y, dragged 50`).toBeLessThanOrEqual(4);
      expect(window.getSelection()?.toString() ?? "", `${what}: the drag selected text instead of moving the shape`).toBe("");
    }
  });
});
