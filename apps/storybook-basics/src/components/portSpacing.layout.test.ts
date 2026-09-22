// src/components/portSpacing.layout.test.ts — the pure half of Custom port
// spacing (Zach, 2026-09-22: "in custom: You just need to respect the
// ordering of ports — and there is a minimum spacing requirement as well").
//
// Plain Node, no DOM. The measured half — a real pointer drag on a real
// expanded block, read back with `getBoundingClientRect` — is
// `ExpandedPortSpacing.stories.tsx`.

import { describe, expect, it } from "vitest";

import { PORT_EDGE_SLOT_MIN_PX } from "./blockPort.layout";
import { mainAxisPositions } from "./portEdge.layout";
import {
  MIN_PORT_GAP_PX,
  autoSlotOffsets,
  constrainPortPositions,
  customOffsetsValid,
  resolveCustomOffsets,
  revalidateCustomOffsets,
  type PortSpacingOptions,
} from "./portSpacing.layout";

const SLOT = 24;
const GAP = MIN_PORT_GAP_PX;
const ORDER = ["a", "b", "c", "d"];

function options(overrides: Partial<PortSpacingOptions> = {}): PortSpacingOptions {
  return { order: ORDER, minGap: GAP, span: 300, slotSize: SLOT, mode: "stop", ...overrides };
}

/** Every rule at once, for any result: order, min gap, span. */
function expectRulesHold(offsets: Record<string, number>, opts: PortSpacingOptions) {
  const values = opts.order.map((id) => offsets[id]);
  for (let i = 1; i < values.length; i++) {
    const prevSize = opts.sizes?.[opts.order[i - 1]] ?? opts.slotSize;
    expect(values[i] - values[i - 1]).toBeGreaterThanOrEqual(prevSize - opts.slotSize + opts.minGap - 1e-9);
  }
  values.forEach((value, i) => {
    const size = opts.sizes?.[opts.order[i]] ?? opts.slotSize;
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(opts.span - size + 1e-9);
  });
}

describe("MIN_PORT_GAP_PX", () => {
  it("is the rail's own slot footprint, so two ports at the minimum touch and never overlap", () => {
    expect(MIN_PORT_GAP_PX).toBe(PORT_EDGE_SLOT_MIN_PX);
  });
});

describe("constrainPortPositions — validation (no drag)", () => {
  it("leaves an already-valid layout untouched", () => {
    const layout = { a: 0, b: 60, c: 200, d: 276 };
    expect(constrainPortPositions(layout, options()).offsets).toEqual(layout);
  });

  it("preserves the ORDER array even when the numbers disagree with it", () => {
    const { offsets } = constrainPortPositions({ a: 200, b: 10, c: 100, d: 0 }, options());
    expect(offsets.a).toBeLessThan(offsets.b);
    expect(offsets.b).toBeLessThan(offsets.c);
    expect(offsets.c).toBeLessThan(offsets.d);
    expectRulesHold(offsets, options());
  });

  it("opens two ports that are closer than the minimum gap", () => {
    const { offsets, tightPairs } = constrainPortPositions({ a: 0, b: 5, c: 150, d: 250 }, options());
    expect(offsets.b - offsets.a).toBe(GAP);
    expect(tightPairs).toEqual([["a", "b"]]);
  });

  it("clamps into the span at both ends, leaving room for the neighbours after", () => {
    const opts = options();
    const { offsets } = constrainPortPositions({ a: -50, b: 100, c: 150, d: 999 }, opts);
    expect(offsets.a).toBe(0);
    expect(offsets.d).toBe(opts.span - SLOT);
    expectRulesHold(offsets, opts);
  });

  it("keeps a grouped slot's LAST port a minimum gap from the next slot's first", () => {
    // `b` is a group of three: 3*24 + 2*18 = 108px long.
    const opts = options({ sizes: { b: 108 } });
    const { offsets } = constrainPortPositions({ a: 0, b: 30, c: 60, d: 250 }, opts);
    const bLastCentre = offsets.b + 108 - SLOT / 2;
    const cFirstCentre = offsets.c + SLOT / 2;
    expect(cFirstCentre - bLastCentre).toBe(GAP);
    expectRulesHold(offsets, opts);
  });
});

describe("constrainPortPositions — a drag", () => {
  const settled = { a: 0, b: 60, c: 200, d: 276 };

  it("moves only the dragged port while it is clear of its neighbours", () => {
    const { offsets } = constrainPortPositions({ ...settled, c: 150 }, options({ active: "c" }));
    expect(offsets).toEqual({ ...settled, c: 150 });
  });

  it("stop: the dragged port clamps one minimum gap short of the neighbour it runs into", () => {
    const { offsets, tightPairs } = constrainPortPositions({ ...settled, c: 10 }, options({ active: "c", mode: "stop" }));
    expect(offsets).toEqual({ ...settled, c: settled.b + GAP });
    expect(tightPairs).toContainEqual(["b", "c"]);
  });

  it("stop: dragging past a neighbour can never swap the order", () => {
    const { offsets } = constrainPortPositions({ ...settled, a: 280 }, options({ active: "a", mode: "stop" }));
    expect(offsets.a).toBe(settled.b - GAP);
    expect(offsets.b).toBe(settled.b);
  });

  it("push: neighbours move ahead of the dragged port, order and gaps intact", () => {
    const { offsets, tightPairs } = constrainPortPositions({ ...settled, b: 190 }, options({ active: "b", mode: "push" }));
    expect(offsets.a).toBe(0);
    expect(offsets.b).toBe(190);
    expect(offsets.c).toBe(190 + GAP);
    expect(offsets.d).toBe(276);
    expect(tightPairs).toEqual([["b", "c"]]);
    expectRulesHold(offsets, options());
  });

  it("push: pushes backwards too, and stops when the pushed ports reach the span end", () => {
    const opts = options({ active: "d", mode: "push" });
    const { offsets } = constrainPortPositions({ ...settled, d: -500 }, opts);
    expect(offsets).toEqual({ a: 0, b: GAP, c: 2 * GAP, d: 3 * GAP });
    expectRulesHold(offsets, opts);
  });

  it("stop and push agree while nothing is touched", () => {
    const requested = { ...settled, b: 100 };
    expect(constrainPortPositions(requested, options({ active: "b", mode: "stop" })).offsets).toEqual(
      constrainPortPositions(requested, options({ active: "b", mode: "push" })).offsets,
    );
  });

  it("stop: a stale baseline that already broke a rule is repaired, not trusted", () => {
    const opts = options({ active: "b", mode: "stop" });
    const { offsets } = constrainPortPositions({ a: 0, b: 50, c: 5, d: 6 }, opts);
    expectRulesHold(offsets, opts);
  });
});

describe("constrainPortPositions — too many ports for the span (the degenerate rule)", () => {
  // 6 ports at the minimum pitch need 5*24 + 24 = 144px; the span is 100.
  const many = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const opts = options({ order: many, span: 100 });

  it("keeps order and the minimum gap, packing from the start and overflowing the far end", () => {
    const { offsets, overflow } = constrainPortPositions({ p1: 50, p2: 0, p3: 90, p4: 10, p5: 70, p6: 20 }, opts);
    expect(overflow).toBe(true);
    expect(many.map((id) => offsets[id])).toEqual([0, 24, 48, 72, 96, 120]);
  });

  it("pins every port — a drag, stop or push, moves nothing", () => {
    const packed = { p1: 0, p2: 24, p3: 48, p4: 72, p5: 96, p6: 120 };
    for (const mode of ["stop", "push"] as const) {
      expect(constrainPortPositions({ ...packed, p3: 400 }, { ...opts, active: "p3", mode }).offsets).toEqual(packed);
    }
  });

  it("does not report overflow when the ports fit exactly", () => {
    expect(constrainPortPositions({}, options({ order: many, span: 144 })).overflow).toBe(false);
  });

  it("an empty edge is valid and empty", () => {
    expect(constrainPortPositions({}, options({ order: [] }))).toEqual({ offsets: {}, overflow: false, tightPairs: [] });
  });
});

describe("re-validation after the edge changes (rule 5)", () => {
  const auto = { a: 30, b: 100, c: 170, d: 240, e: 260 };

  it("an ADDED port starts at its Auto position and the rules settle around it", () => {
    const order = ["a", "b", "c", "d", "e"];
    const stored = { a: 0, b: 24, c: 200, d: 250 };
    const opts = options({ order });
    const next = revalidateCustomOffsets(stored, auto, opts);
    expectRulesHold(next, opts);
    expect(Object.keys(next).sort()).toEqual(order);
    expect(next.a).toBe(0);
    expect(next.b).toBe(24);
  });

  it("a REMOVED port drops out and the survivors keep their heights", () => {
    const opts = options({ order: ["a", "c", "d"] });
    expect(revalidateCustomOffsets({ a: 0, b: 24, c: 200, d: 250 }, auto, opts)).toEqual({ a: 0, c: 200, d: 250 });
  });

  it("a REORDER makes two ports trade places rather than shoving one down the wall", () => {
    const opts = options({ order: ["b", "a", "c", "d"] });
    expect(revalidateCustomOffsets({ a: 0, b: 60, c: 200, d: 276 }, auto, opts)).toEqual({ b: 0, a: 60, c: 200, d: 276 });
  });

  it("a shrunken span pulls the stored layout back inside it", () => {
    const opts = options({ span: 200 });
    const next = revalidateCustomOffsets({ a: 0, b: 60, c: 200, d: 276 }, auto, opts);
    expectRulesHold(next, opts);
  });
});

describe("mode switching (rule 4)", () => {
  const auto = { a: 30, b: 100, c: 170, d: 240 };

  it("Auto -> Custom with nothing stored starts from the Auto positions — nothing jumps", () => {
    expect(resolveCustomOffsets({}, auto, options(), true)).toEqual(auto);
  });

  it("Custom -> Auto -> Custom restores a layout that is still valid", () => {
    const stored = { a: 0, b: 24, c: 230, d: 276 };
    expect(resolveCustomOffsets(stored, auto, options(), true)).toEqual(stored);
  });

  it("…and starts from Auto when the count changed while in Auto", () => {
    const stored = { a: 0, b: 24, c: 230 };
    expect(resolveCustomOffsets(stored, auto, options(), true)).toEqual(auto);
  });

  it("…and starts from Auto when the order changed while in Auto", () => {
    expect(resolveCustomOffsets({ a: 60, b: 0, c: 230, d: 276 }, auto, options(), true)).toEqual(auto);
  });

  it("already in Custom, the same invalid layout is re-validated instead of reset", () => {
    const stored = { a: 0, b: 24, c: 230 };
    const next = resolveCustomOffsets(stored, auto, options(), false);
    expect(next.a).toBe(0);
    expect(next.b).toBe(24);
    expect(customOffsetsValid(next, options())).toBe(true);
  });

  it("customOffsetsValid refuses a stale extra id", () => {
    expect(customOffsetsValid({ a: 0, b: 60, c: 200, d: 276, gone: 5 }, options())).toBe(false);
  });
});

describe("autoSlotOffsets", () => {
  const uniform = { a: SLOT, b: SLOT, c: SLOT, d: SLOT };

  it("matches mainAxisPositions exactly for uniform slots, every scheme", () => {
    for (const scheme of ["space-between", "space-evenly", "space-around"] as const) {
      const expected = mainAxisPositions(4, 300, SLOT, scheme);
      const offsets = autoSlotOffsets(ORDER, uniform, 300, { mode: "distribute", scheme });
      expect(ORDER.map((id) => offsets[id])).toEqual(expected);
    }
  });

  it("packs an aligned rail from its anchor, after the edge padding", () => {
    const start = autoSlotOffsets(ORDER, uniform, 300, { mode: "aligned", anchor: "start", gap: 18, edgePadding: 10 });
    expect(ORDER.map((id) => start[id])).toEqual([10, 52, 94, 136]);
    const end = autoSlotOffsets(ORDER, uniform, 300, { mode: "aligned", anchor: "end", gap: 18, edgePadding: 0 });
    expect(end.d).toBe(300 - SLOT);
  });
});
