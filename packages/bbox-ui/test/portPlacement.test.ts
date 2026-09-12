import { describe, expect, it } from "vitest";

import {
  ALL_EDGES,
  DEFAULT_ARRANGEMENT,
  addArrangement,
  clonePlacements,
  defaultPlacement,
  drawnEdge,
  evenT,
  groupSlots,
  laneOrder,
  lockedPlacement,
  movePort,
  refresh,
  setMode,
  toggleEdge,
  type Arrangement,
  type Placements,
} from "../src/portPlacement";

function arrangement(overrides: Partial<Arrangement> = {}): Arrangement {
  return { ...DEFAULT_ARRANGEMENT, ...overrides };
}

describe("evenT — the three spacing schemes as fractions 0..1", () => {
  it("centers a lone port at 0.5 for every scheme (n=1)", () => {
    expect(evenT(1, "between")).toEqual([0.5]);
    expect(evenT(1, "evenly")).toEqual([0.5]);
    expect(evenT(1, "around")).toEqual([0.5]);
  });

  it("spaces two ports per scheme (n=2)", () => {
    expect(evenT(2, "between")).toEqual([0, 1]);
    expect(evenT(2, "evenly")).toEqual([1 / 3, 2 / 3]);
    expect(evenT(2, "around")).toEqual([0.25, 0.75]);
  });

  it("spaces three ports per scheme (n=3)", () => {
    expect(evenT(3, "between")).toEqual([0, 0.5, 1]);
    expect(evenT(3, "evenly")).toEqual([0.25, 0.5, 0.75]);
    expect(evenT(3, "around")[0]).toBeCloseTo(1 / 6, 10);
    expect(evenT(3, "around")[1]).toBeCloseTo(0.5, 10);
    expect(evenT(3, "around")[2]).toBeCloseTo(5 / 6, 10);
  });

  it("returns an empty array for zero ports", () => {
    expect(evenT(0, "evenly")).toEqual([]);
  });
});

describe("refresh — auto mode assigns t by lane order", () => {
  it("re-evens t from the stored order, leaving order untouched when already contiguous", () => {
    const a = arrangement({ mode: "auto", spacing: "evenly" });
    const placements: Placements = {
      p1: { edge: "top", order: 0, t: 0.9 }, // stale t — refresh must overwrite it
      p2: { edge: "top", order: 1, t: 0.1 },
      p3: { edge: "top", order: 2, t: 0.4 },
    };
    const next = refresh(placements, a);
    expect(next.p1.order).toBe(0);
    expect(next.p2.order).toBe(1);
    expect(next.p3.order).toBe(2);
    const [t0, t1, t2] = evenT(3, "evenly");
    expect(next.p1.t).toBe(t0);
    expect(next.p2.t).toBe(t1);
    expect(next.p3.t).toBe(t2);
  });

  it("is idempotent", () => {
    const a = arrangement({ mode: "auto", spacing: "between" });
    const placements: Placements = {
      p1: { edge: "left", order: 1, t: 0 },
      p2: { edge: "left", order: 0, t: 0 },
    };
    const once = refresh(placements, a);
    const twice = refresh(once, a);
    expect(twice).toEqual(once);
  });
});

describe("refresh — custom mode assigns order by t", () => {
  it("ranks order from t regardless of what order previously held", () => {
    const a = arrangement({ mode: "custom" });
    const placements: Placements = {
      p1: { edge: "bottom", order: 5, t: 0.9 },
      p2: { edge: "bottom", order: 5, t: 0.1 },
      p3: { edge: "bottom", order: 5, t: 0.5 },
    };
    const next = refresh(placements, a);
    expect(next.p2.order).toBe(0); // t=0.1, lowest
    expect(next.p3.order).toBe(1); // t=0.5
    expect(next.p1.order).toBe(2); // t=0.9, highest
    // t itself is untouched in custom mode.
    expect(next.p1.t).toBe(0.9);
    expect(next.p2.t).toBe(0.1);
    expect(next.p3.t).toBe(0.5);
  });
});

describe("movePort — auto mode inserts at index and the lane re-evens", () => {
  it("puts the port at the requested index and re-spaces every t on that edge", () => {
    const a = arrangement({ mode: "auto", spacing: "evenly", edges: ALL_EDGES });
    const seeded: Placements = refresh(
      {
        p1: { edge: "top", order: 0, t: 0 },
        p2: { edge: "top", order: 1, t: 0 },
        p3: { edge: "top", order: 2, t: 0 },
      },
      a,
    );
    const moved = movePort(seeded, a, "p3", "top", { index: 0 });
    expect(laneOrder(moved, a, "top")).toEqual(["p3", "p1", "p2"]);
    const [t0, t1, t2] = evenT(3, "evenly");
    expect(moved.p3.t).toBe(t0);
    expect(moved.p1.t).toBe(t1);
    expect(moved.p2.t).toBe(t2);
  });

  it("moves a port across edges, re-evening both the old and new lane", () => {
    const a = arrangement({ mode: "auto", spacing: "between", edges: ALL_EDGES });
    const seeded: Placements = refresh(
      {
        p1: { edge: "top", order: 0, t: 0 },
        p2: { edge: "top", order: 1, t: 0 },
        p3: { edge: "right", order: 0, t: 0 },
      },
      a,
    );
    const moved = movePort(seeded, a, "p2", "right", { index: 0 });
    expect(laneOrder(moved, a, "top")).toEqual(["p1"]);
    expect(laneOrder(moved, a, "right")).toEqual(["p2", "p3"]);
    expect(moved.p1.t).toBe(evenT(1, "between")[0]);
    const [rt0, rt1] = evenT(2, "between");
    expect(moved.p2.t).toBe(rt0);
    expect(moved.p3.t).toBe(rt1);
  });
});

describe("movePort — custom mode sets t and re-ranks", () => {
  it("clamps t into 0..1 and re-derives order from the new rank", () => {
    const a = arrangement({ mode: "custom" });
    const seeded: Placements = {
      p1: { edge: "left", order: 0, t: 0.2 },
      p2: { edge: "left", order: 1, t: 0.5 },
      p3: { edge: "left", order: 2, t: 0.8 },
    };
    const moved = movePort(seeded, a, "p3", "left", { t: 1.7 }); // out of range
    expect(moved.p3.t).toBe(1); // clamped
    expect(moved.p3.order).toBe(2); // still last by rank
    expect(moved.p1.order).toBe(0);
    expect(moved.p2.order).toBe(1);

    const movedAgain = movePort(moved, a, "p1", "left", { t: 0.9 });
    // p1 jumped past p2 (0.5) and p3 (1) — no, past p2 only; still under p3's 1.
    expect(laneOrder(movedAgain, a, "left")).toEqual(["p2", "p1", "p3"]);
  });
});

describe("setMode — auto to custom to auto round-trips order", () => {
  it("changes nothing on the way into custom, and restores the same order/t coming back", () => {
    const auto = arrangement({ mode: "auto", spacing: "evenly", edges: ALL_EDGES });
    const seeded = refresh(
      {
        p1: { edge: "top", order: 0, t: 0 },
        p2: { edge: "top", order: 1, t: 0 },
        p3: { edge: "top", order: 2, t: 0 },
      },
      auto,
    );

    const toCustom = setMode(seeded, auto, "custom");
    expect(toCustom.arrangement.mode).toBe("custom");
    expect(toCustom.placements).toEqual(seeded); // t already current — nothing moves

    const backToAuto = setMode(toCustom.placements, toCustom.arrangement, "auto");
    expect(backToAuto.arrangement.mode).toBe("auto");
    expect(backToAuto.placements).toEqual(seeded);
  });

  it("excludes a locked port sharing the lane from custom -> auto rank/spacing (regression)", () => {
    // A locked function port sharing "top" with two real ports must not be
    // counted in the lane's rank or evenT spacing when flipping back to
    // auto — it neither consumes a rank slot nor shifts the others' t.
    const custom = arrangement({ mode: "custom", spacing: "evenly", edges: ALL_EDGES });
    const placements: Placements = {
      fn: lockedPlacement(), // edge: "top", order: 0, t: 0
      p1: { edge: "top", order: 5, t: 0.3 },
      p2: { edge: "top", order: 9, t: 0.7 },
    };
    const locked = new Set(["fn"]);

    const backToAuto = setMode(placements, custom, "auto", locked);

    expect(backToAuto.placements.fn).toEqual(lockedPlacement()); // untouched
    // evenT(2, "evenly") = [1/3, 2/3] — NOT evenT(3, "evenly") = [0.5, 0.75],
    // which is what leaking "fn" into the lane's count would produce.
    expect(backToAuto.placements.p1.order).toBe(0);
    expect(backToAuto.placements.p1.t).toBeCloseTo(1 / 3);
    expect(backToAuto.placements.p2.order).toBe(1);
    expect(backToAuto.placements.p2.t).toBeCloseTo(2 / 3);
  });
});

describe("drawnEdge — parks clockwise and restores when the edge returns", () => {
  it("walks top -> right -> bottom -> left from the stored edge to the nearest live one", () => {
    const a = arrangement({ edges: ["top", "right"] });
    // stored "left": one clockwise step (left -> top) lands on a live edge.
    expect(drawnEdge({ edge: "left", order: 0, t: 0 }, a)).toBe("top");
    // stored "bottom": bottom -> left is also off, so it takes two steps to "top".
    expect(drawnEdge({ edge: "bottom", order: 0, t: 0 }, a)).toBe("top");
  });

  it("takes more than one step when the immediate next edge is also off", () => {
    const a = arrangement({ edges: ["left"] });
    // stored "right": right -> bottom (off) -> left (live)
    expect(drawnEdge({ edge: "right", order: 0, t: 0 }, a)).toBe("left");
  });

  it("restores the stored edge exactly once it's live again — nothing was ever written", () => {
    const parked = { edge: "left" as const, order: 3, t: 0.7 };
    const off = arrangement({ edges: ["top", "right"] });
    expect(drawnEdge(parked, off)).toBe("top");
    const on = arrangement({ edges: ALL_EDGES });
    expect(drawnEdge(parked, on)).toBe("left");
    expect(parked.order).toBe(3); // untouched throughout
    expect(parked.t).toBe(0.7);
  });

  it("returns the stored edge unchanged if no edge is live at all", () => {
    const a = arrangement({ edges: [] });
    expect(drawnEdge({ edge: "bottom", order: 0, t: 0 }, a)).toBe("bottom");
  });
});

describe("toggleEdge — refuses to remove the last live edge", () => {
  it("returns the arrangement unchanged rather than emptying edges", () => {
    const a = arrangement({ edges: ["top"] });
    const result = toggleEdge(a, "top", false);
    expect(result).toBe(a); // same reference — a true no-op
    expect(result.edges).toEqual(["top"]);
  });

  it("still allows removing an edge when another stays live", () => {
    const a = arrangement({ edges: ["top", "right"] });
    const result = toggleEdge(a, "top", false);
    expect(result.edges).toEqual(["right"]);
  });

  it("adds an edge back in canonical clockwise order", () => {
    const a = arrangement({ edges: ["right"] });
    const result = toggleEdge(a, "top", true);
    expect(result.edges).toEqual(["top", "right"]);
  });

  it("is a no-op when the edge is already in the requested state", () => {
    const a = arrangement({ edges: ["top", "right"] });
    expect(toggleEdge(a, "top", true)).toBe(a);
    expect(toggleEdge(a, "bottom", false)).toBe(a);
  });
});

describe("groupSlots — clusters consecutive members and collapses to one slot", () => {
  it("collapses a group to one slot at its first member's position", () => {
    const a = arrangement({
      mode: "auto",
      grouping: {
        id: "pairs",
        label: "Pairs",
        collapsed: true,
        assignments: {
          args: { group: "variadic", groupOrder: 1 },
          kwargs: { group: "variadic", groupOrder: 2 },
        },
      },
    });
    const placements: Placements = refresh(
      {
        args: { edge: "top", order: 0, t: 0 },
        kwargs: { edge: "top", order: 1, t: 0 },
        cfg: { edge: "top", order: 2, t: 0 },
      },
      a,
    );
    const slots = groupSlots(placements, a, "top");
    expect(slots).toHaveLength(2); // the "variadic" pair collapses, cfg stands alone
    expect(slots[0].group).toBe("variadic");
    expect(slots[0].portIds).toEqual(["args", "kwargs"]); // sorted by groupOrder
    expect(slots[0].t).toBe(placements.args.t); // first member's position
    expect(slots[1]).toEqual({ group: "cfg", portIds: ["cfg"], t: placements.cfg.t });
  });

  it("expands to one slot per port when the set is not collapsed", () => {
    const a = arrangement({
      grouping: {
        id: "pairs",
        label: "Pairs",
        collapsed: false,
        assignments: { args: { group: "variadic" }, kwargs: { group: "variadic" } },
      },
    });
    const placements: Placements = {
      args: { edge: "top", order: 0, t: 0.1 },
      kwargs: { edge: "top", order: 1, t: 0.9 },
    };
    const slots = groupSlots(placements, a, "top");
    expect(slots).toEqual([
      { group: "args", portIds: ["args"], t: 0.1 },
      { group: "kwargs", portIds: ["kwargs"], t: 0.9 },
    ]);
  });

  it("with no grouping set, every port not in the assignments is its own singleton group", () => {
    const a = arrangement(); // no `grouping` at all
    const placements: Placements = {
      solo: { edge: "top", order: 0, t: 0.5 },
    };
    expect(groupSlots(placements, a, "top")).toEqual([{ group: "solo", portIds: ["solo"], t: 0.5 }]);
  });
});

describe("locked ports are never moved", () => {
  it("movePort returns the exact same placements object for a locked id", () => {
    const a = arrangement({ mode: "auto" });
    const placements: Placements = { fn: lockedPlacement(), p1: { edge: "top", order: 1, t: 0 } };
    const locked = new Set(["fn"]);
    const result = movePort(placements, a, "fn", "right", { index: 0 }, locked);
    expect(result).toBe(placements);
  });

  it("refresh leaves a locked id's placement untouched and excludes it from lane ranking", () => {
    const a = arrangement({ mode: "auto", spacing: "evenly" });
    const placements: Placements = {
      fn: lockedPlacement(),
      p1: { edge: "top", order: 9, t: 0 },
      p2: { edge: "top", order: 4, t: 0 },
    };
    const locked = new Set(["fn"]);
    const next = refresh(placements, a, locked);
    expect(next.fn).toEqual(lockedPlacement()); // byte-identical, never reassigned
    // p1/p2 are ranked among themselves only — 0 and 1, not offset by fn.
    expect(next.p2.order).toBe(0);
    expect(next.p1.order).toBe(1);
  });

  it("movePort reordering a sibling does not corrupt a locked port's own order (regression)", () => {
    // portPlacement.ts:239 — `others` used to come from laneOrder with no
    // locked filter, so a locked port sharing the destination edge was
    // folded into the reorder sequence and had its stored `order`
    // silently overwritten (0 -> 1 here), even though it was never the
    // port being moved.
    const a = arrangement({ mode: "auto", edges: ["top"] });
    const placements: Placements = {
      fn: lockedPlacement(), // edge: "top", order: 0, t: 0
      p1: { edge: "top", order: 1, t: 0 },
      p2: { edge: "top", order: 2, t: 0 },
    };
    const locked = new Set(["fn"]);
    const result = movePort(placements, a, "p2", "top", { index: 0 }, locked);
    expect(result.fn).toEqual(lockedPlacement()); // order stays 0, byte-identical
    expect(result.p2.order).toBe(0);
    expect(result.p1.order).toBe(1);
  });
});

describe("defaultPlacement", () => {
  it("lands on the first live edge in clockwise order and appends after what's already there", () => {
    const a = arrangement({ edges: ["right", "top"] }); // insertion order deliberately not clockwise
    const existing: Placements = { p1: { edge: "top", order: 0, t: 0 } };
    expect(defaultPlacement("p2", a, existing)).toEqual({ edge: "top", order: 1, t: 0 });
  });

  it("starts a fresh edge at order 0", () => {
    const a = arrangement({ edges: ["right"] });
    expect(defaultPlacement("p1", a, {})).toEqual({ edge: "right", order: 0, t: 0 });
  });
});

describe("addArrangement / clonePlacements", () => {
  it("clones an existing arrangement under a new id/label without aliasing its edges or grouping", () => {
    const source: Arrangement = arrangement({
      id: "compact",
      label: "Compact",
      edges: ["top"],
      grouping: { id: "g", label: "G", collapsed: true, assignments: { p1: { group: "x" } } },
    });
    const next = addArrangement([source], "compact", "compact-2", "Compact copy");
    expect(next).toHaveLength(2);
    const clone = next[1];
    expect(clone.id).toBe("compact-2");
    expect(clone.label).toBe("Compact copy");
    expect(clone.edges).toEqual(["top"]);
    expect(clone.edges).not.toBe(source.edges);
    expect(clone.grouping).toEqual(source.grouping);
    expect(clone.grouping).not.toBe(source.grouping);
  });

  it("falls back to DEFAULT_ARRANGEMENT when copyOf does not resolve", () => {
    const next = addArrangement([], "missing", "new-id", "New");
    expect(next[0].edges).toEqual(DEFAULT_ARRANGEMENT.edges);
    expect(next[0].id).toBe("new-id");
  });

  it("deep-copies placements so mutating the clone never leaks into the source", () => {
    const source: Placements = { p1: { edge: "top", order: 0, t: 0.5 } };
    const clone = clonePlacements(source);
    clone.p1.t = 0.9;
    expect(source.p1.t).toBe(0.5);
  });
});
