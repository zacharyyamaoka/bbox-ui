// src/eligiblePorts.smoke.test.tsx — P-005's acceptance: "the legal dots light
// the moment a cable starts moving; illegal ones dim."
//
// THE STRONG CLAIM, and the one worth testing, is not that something lights up
// — it is that WHAT LIGHTS AGREES WITH WHAT THE DROP WILL ACCEPT. A preview
// computed by a second, nearly-identical rule is a preview that eventually
// lies while looking authoritative. So the board below is arranged so that one
// target is legal and another is NOT, at the app's shipped default level
// (`guided`, whose policy has `allowDuplicates: false`): a cable already runs
// A.out -> B.in, so a second cable to B.in is a duplicate and refused, while
// B.alt is free. The test then requires the two dots to paint DIFFERENTLY, and
// requires the refused one to really be refused.
//
// WHY RAW PointerEvents INSTEAD OF `userEvent.dragAndDrop`, which every other
// wiring test uses (the harness's own "fallback only" rule asks for this
// sentence): the fact under test exists ONLY BETWEEN pointerdown and pointerup
// — that is the whole feature — and `dragAndDrop` has no pause in the middle.
// Nothing else is synthesized: these events go to the real listeners
// `installWireGesture` registered on the real container and document, and the
// paint is read back off the real rendered dots with `getComputedStyle`.
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { EDGE_POLICY_STORAGE_KEY } from "@trunk/components/edgePolicy";

import { resetValidationLevelCache, setValidationLevel } from "./chrome/ShareMenu/validationLevelHost";
import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
  window.localStorage.removeItem(EDGE_POLICY_STORAGE_KEY);
  resetValidationLevelCache();
});

const PORTS_OUT = { left: [], right: [{ id: "out", declaration: "out: Pose" }], top: [], bottom: [] };
const PORTS_IN = { left: [{ id: "in", declaration: "in: Pose" }, { id: "alt", declaration: "alt: Pose" }], right: [], top: [], bottom: [] };

function block(name: string, x: number, y: number, ports: unknown): TLShapeId {
  const id = createShapeId();
  app!.editor.createShape({ id, type: BLOCK_SHAPE_TYPE, x, y, props: { name, view: "port", ports } } as never);
  return id;
}

async function dotOf(id: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(() => {
    const wrap = app!.root.querySelector<HTMLElement>(`[data-shape-id="${id}"] [data-block-id="${id}"]`);
    return wrap?.querySelector<HTMLElement>(`[data-port-id="${portId}"] [data-slot="port-dot"]`) ?? null;
  }, { what: `${id}/${portId} dot` });
}

async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length === count ? true : null), { what: `${count} anchors on ${id}` });
}

function wireCount(): number {
  return app!.editor.getCurrentPageShapes().filter((s) => s.type === WIRE_SHAPE_TYPE).length;
}

function centre(el: Element) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** The three facts `Port` paints `availability` with (port.tsx's
 *  `portDotStyle`): `"available"` scales 1.18 and adds a 9px halo layer;
 *  `"unavailable"` fades to 0.45; neither is true at rest. */
function paintOf(dot: Element) {
  const style = getComputedStyle(dot);
  return {
    opacity: Number(style.opacity),
    // The X scale, read out of the computed matrix rather than compared to
    // the string "none": the dot carries `transition-transform`
    // (`portDotClass`), so at rest Chromium reports the IDENTITY matrix, not
    // `none`, and a "is there a transform" predicate is true of every dot on
    // the board. The number is what `portDotStyle` writes — 1.18 for a dot
    // wearing the drag preview, 1 otherwise.
    scale: scaleXOf(style.transform),
    boxShadow: style.boxShadow,
  };
}

const DRAG_SCALE = 1.18;

/**
 * Above this, the dot is wearing the drag ring; below it, it is not.
 *
 * WHY a threshold and not `=== 1`: the dot animates
 * (`transition-transform duration-[50ms]`, `portDotClass`), so an unmarked
 * dot a few ms after a gesture reports 1.014, not 1. Measured. 1.05 is well
 * clear of both ends — the marked value is 1.18 — and it is the same
 * predicate used to wait for the ring as to assert its absence, so the two
 * can never disagree about what "marked" means.
 */
const RINGED_ABOVE = 1.05;

function scaleXOf(transform: string): number {
  const parsed = /matrix\(([^,]+),/.exec(transform);
  return parsed ? Number(parsed[1]) : 1;
}

function pointer(name: string, at: { x: number; y: number }): PointerEvent {
  return new PointerEvent(name, { bubbles: true, cancelable: true, composed: true, pointerId: 1, button: 0, buttons: 1, clientX: at.x, clientY: at.y });
}

describe("P-005 — the legal dots light while a cable is in flight", () => {
  it("a legal dot lights, an illegal one dims, and both go back at rest", async () => {
    app = await mountApp();
    setValidationLevel("guided");
    const a = block("estimate()", 60, 140, PORTS_OUT);
    const b = block("encode()", 460, 160, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);

    // The cable that makes a SECOND one to `in` a duplicate — drawn with a
    // real drag, so the fixture itself is the product's own gesture.
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => (wireCount() === 1 ? true : null), { what: "the first cable" });

    const source = await dotOf(a, "out");
    const taken = await dotOf(b, "in");
    const free = await dotOf(b, "alt");

    // AT REST: nothing is marked. If this is not true the rest proves nothing,
    // because "marked" would be the board's normal appearance.
    //
    // WHY this settles rather than reading once: the dot animates back
    // (`transition-transform duration-[50ms]`, `portDotClass`), and the drag
    // that built this fixture ended microseconds ago — a single read here
    // catches the ring on its way out and reports 1.18 for a dot that is in
    // fact already unmarked. Measured, not feared: that is exactly what this
    // assertion did before it waited.
    await waitFor(() => (paintOf(free).scale < RINGED_ABOVE ? true : null), { what: "the fixture drag's own marks to clear" });
    expect(paintOf(taken).opacity, "at rest a wired dot is not dimmed").toBe(1);
    expect(paintOf(free).opacity, "at rest a free dot is not dimmed").toBe(1);
    expect(paintOf(free).scale, "at rest no dot wears the drag ring").toBeLessThan(RINGED_ABOVE);

    // IN FLIGHT.
    source.dispatchEvent(pointer("pointerdown", centre(source)));
    document.dispatchEvent(pointer("pointermove", { x: centre(source).x + 60, y: centre(source).y + 20 }));

    const marked = await waitFor(() => {
      const legal = paintOf(free);
      const illegal = paintOf(taken);
      return legal.scale > RINGED_ABOVE && illegal.opacity < 1 ? { legal, illegal } : null;
    }, { what: "the eligible ring on `alt` and the dim on the already-wired `in`" });

    expect(marked.legal.opacity, "an available dot is not faded").toBe(1);
    // The scale is read while it is still ANIMATING towards its target (50ms),
    // so the honest assertion is the interval, not the endpoint: past the
    // threshold, and never beyond the exact value `portDotStyle` writes.
    // Measured: a single read here lands anywhere from 1.171 to 1.18.
    expect(marked.legal.scale).toBeGreaterThan(RINGED_ABOVE);
    expect(marked.legal.scale, "`portDotStyle`'s drag scale is the ceiling — nothing else may add to it").toBeLessThanOrEqual(DRAG_SCALE + 0.001);
    expect(marked.legal.boxShadow, "an available dot wears the 9px halo `hinting` paints").toContain("9px");
    expect(marked.illegal.opacity, "`dimmed` is 0.45 in port.tsx").toBeCloseTo(0.45, 2);
    expect(marked.illegal.scale, "an unavailable dot must not also wear the ring").toBeLessThan(RINGED_ABOVE);
    // The dot the cable is LEAVING is deliberately unmarked — it is not a
    // target, and `connectionAvailability` omits it.
    expect(paintOf(source).opacity, "the source dot keeps its at-rest paint").toBe(1);

    // AT REST AGAIN. A marked set that outlived its gesture would be a
    // permanent decoration claiming to be a live answer.
    document.dispatchEvent(pointer("pointercancel", centre(free)));
    await waitFor(() => (paintOf(taken).opacity === 1 && paintOf(free).scale < RINGED_ABOVE ? true : null), { what: "the marks to clear with the gesture" });
    expect(wireCount(), "a cancelled drag writes nothing").toBe(1);
  });

  it("the mark predicts the drop: the dimmed dot really refuses, the lit one really takes it", async () => {
    app = await mountApp();
    setValidationLevel("guided");
    const a = block("estimate()", 60, 140, PORTS_OUT);
    const b = block("encode()", 460, 160, PORTS_IN);
    await anchorsMeasured(a, 1);
    await anchorsMeasured(b, 2);
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await waitFor(() => (wireCount() === 1 ? true : null), { what: "the first cable" });

    // The dot the preview DIMS refuses the cable...
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "in"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(wireCount(), "`guided` has allowDuplicates: false — and that is what the dim said").toBe(1);

    // ...and the dot it RINGS accepts it.
    await userEvent.dragAndDrop(await dotOf(a, "out"), await dotOf(b, "alt"));
    await waitFor(() => (wireCount() === 2 ? true : null), { what: "the cable the ring promised" });
  });

  it("a floating ss-port dot is marked too, not only a block's rails", async () => {
    app = await mountApp();
    setValidationLevel("guided");
    const a = block("estimate()", 60, 140, PORTS_OUT);
    await anchorsMeasured(a, 1);
    const floating = createShapeId();
    app.editor.createShape({ id: floating, type: "ss-port", x: 460, y: 180, props: { declaration: "sink: Pose", direction: "in" } } as never);
    await anchorsMeasured(floating, 1);

    const source = await dotOf(a, "out");
    const target = await dotOf(floating, "port");
    expect(paintOf(target).scale, "at rest the floating dot wears no ring").toBeLessThan(RINGED_ABOVE);

    source.dispatchEvent(pointer("pointerdown", centre(source)));
    document.dispatchEvent(pointer("pointermove", { x: centre(source).x + 60, y: centre(source).y + 20 }));
    await waitFor(() => (paintOf(target).scale > RINGED_ABOVE ? true : null), { what: "the eligible ring on the floating port" });

    document.dispatchEvent(pointer("pointercancel", centre(target)));
    await waitFor(() => (paintOf(target).scale < RINGED_ABOVE ? true : null), { what: "the ring to clear" });
  });
});
