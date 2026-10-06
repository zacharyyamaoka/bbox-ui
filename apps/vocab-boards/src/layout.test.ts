import { describe, expect, it } from "vitest";
import { layout, PORT_H, TITLE_H } from "./layout";
import type { Spec } from "./types";

/**
 * The endpoint parser is the thing that broke the last renderer, so it is
 * checked through the public surface — resolved anchors, not a private regex.
 */
function anchors(spec: Spec) {
  const b = layout(spec);
  return {
    board: b,
    wires: b.wires.map((w) => ({
      a: w.a1,
      b: w.b1,
    })),
  };
}

const twoNodes = (extra: Partial<Spec> = {}): Spec => ({
  nodes: [
    { id: "src", t: "Src", c: 0, r: 0, out: ["v"] },
    { id: "n", t: "N", c: 1, r: 0, in: ["a", "b"], out: ["y"], xin: true, xout: ["True", "False"] },
  ],
  ...extra,
});

describe("endpoint grammar", () => {
  it("parses n.xin as the execution input, NOT side x with port 'in'", () => {
    // The whole failure mode: a naive (in|out|x|xin|...) alternation matches "x"
    // first, resolves the wire to `x` + port "in", and lands the execution
    // cable on the node's RIGHT wall instead of its left.
    const { board, wires } = anchors(
      twoNodes({ wires: [{ a: "src.out.v", b: "n.xin", k: "exec" }] }),
    );
    expect(board.errors).toEqual([]);
    const n = board.nodes.find((q) => q.id === "n")!;
    expect(wires[0].b.handle).toBe("xin");
    // LEFT wall, first port row.
    expect(wires[0].b.abs.x).toBeCloseTo(n.x, 6);
    expect(wires[0].b.abs.y).toBeCloseTo(n.y + TITLE_H + PORT_H / 2, 6);
    expect(wires[0].b.abs.left).toBe(true);
  });

  it("parses n.x.True as an execution OUTPUT below the data outs", () => {
    const { board, wires } = anchors(
      twoNodes({ wires: [{ a: "n.x.True", b: "src.in", k: "exec" }] }),
    );
    expect(board.errors).toEqual([]);
    const n = board.nodes.find((q) => q.id === "n")!;
    expect(wires[0].a.handle).toBe("x:True");
    expect(wires[0].a.abs.x).toBeCloseTo(n.x + n.w, 6);
    // one data out ("y") sits above it
    expect(wires[0].a.abs.y).toBeCloseTo(n.y + TITLE_H + PORT_H * 1 + PORT_H / 2, 6);
    expect(wires[0].a.abs.left).toBe(false);
  });

  it("parses n.x.False as the SECOND execution output", () => {
    const { board, wires } = anchors(
      twoNodes({ wires: [{ a: "n.x.False", b: "src.in", k: "exec" }] }),
    );
    const n = board.nodes.find((q) => q.id === "n")!;
    expect(wires[0].a.abs.y).toBeCloseTo(n.y + TITLE_H + PORT_H * 2 + PORT_H / 2, 6);
  });

  it("parses n.in.b as the second named input row", () => {
    const { board, wires } = anchors(twoNodes({ wires: [{ a: "src.out.v", b: "n.in.b" }] }));
    const n = board.nodes.find((q) => q.id === "n")!;
    expect(wires[0].b.handle).toBe("in:b");
    expect(wires[0].b.abs.y).toBeCloseTo(n.y + TITLE_H + PORT_H * 1 + PORT_H / 2, 6);
  });

  it("parses the unnamed forms n.out and n.in as index 0", () => {
    const spec: Spec = {
      nodes: [
        { id: "a", t: "A", c: 0, r: 0 },
        { id: "b", t: "B", c: 1, r: 0 },
      ],
      wires: [{ a: "a.out", b: "b.in" }],
    };
    const { board, wires } = anchors(spec);
    expect(board.errors).toEqual([]);
    expect(wires[0].a.handle).toBe("out:");
    expect(wires[0].b.handle).toBe("in:");
    const a = board.nodes[0];
    expect(wires[0].a.abs.x).toBeCloseTo(a.x + a.w, 6);
  });

  it("parses f.lt.name and f.rt.name as tunnels on the frame's walls", () => {
    const spec: Spec = {
      nodes: [
        { id: "out", t: "Out", c: 0, r: 0, out: ["v"] },
        { id: "body", t: "Body", c: 1, r: 0, in: ["v"], out: ["w"] },
        { id: "sink", t: "Sink", c: 2, r: 0, in: ["w"] },
      ],
      frames: [
        { id: "case", t: "Case", style: "wall", members: ["body"], ltun: ["v"], rtun: ["w"] },
      ],
      wires: [
        { a: "out.out.v", b: "case.lt.v" },
        { a: "case.lt.v", b: "body.in.v" },
        { a: "body.out.w", b: "case.rt.w" },
        { a: "case.rt.w", b: "sink.in.w" },
      ],
    };
    const { board, wires } = anchors(spec);
    expect(board.errors).toEqual([]);
    const f = board.frames[0]!;
    const [fx, fy, fw, fh] = f.box!;
    expect(wires[1].a.owner).toBe("f:case");
    expect(wires[1].a.handle).toBe("lt:v");
    expect(wires[1].a.abs.x).toBeCloseTo(fx, 6);
    expect(wires[1].a.abs.y).toBeCloseTo(fy + fh / 2, 6);
    expect(wires[2].b.abs.x).toBeCloseTo(fx + fw, 6);
    // A tunnel is declared as both a source and a target — a wire runs in one
    // side and out the other.
    const hs = board.handles.get("f:case")!;
    expect(hs.filter((h) => h.id === "lt:v").map((h) => h.type).sort()).toEqual([
      "source",
      "target",
    ]);
  });

  it("collects an unresolvable endpoint as an error instead of throwing", () => {
    const spec: Spec = {
      nodes: [{ id: "a", t: "A", c: 0, r: 0 }],
      wires: [
        { a: "a.out", b: "ghost.in" },
        { a: "not an endpoint", b: "a.in" },
        { a: "a.out", b: "nosuchframe.lt.x" },
      ],
    };
    const b = layout(spec);
    expect(b.wires).toHaveLength(0);
    expect(b.errors).toEqual([
      'wire to unknown node "ghost"',
      'bad endpoint "not an endpoint"',
      'tunnel on unknown frame "nosuchframe"',
    ]);
  });

  it("falls back to row 0 for a port name the node never declared", () => {
    const { board, wires } = anchors(twoNodes({ wires: [{ a: "src.out.v", b: "n.in.zzz" }] }));
    const n = board.nodes.find((q) => q.id === "n")!;
    expect(wires[0].b.abs.y).toBeCloseTo(n.y + TITLE_H + PORT_H / 2, 6);
  });
});

describe("tb flow", () => {
  const tb: Spec = {
    flow: "tb",
    nodes: [
      { id: "a", t: "loadbang", c: 0, r: 0, out: ["l", "r"] },
      { id: "b", t: "print", c: 0, r: 1, in: ["x"], accent: "err" },
    ],
    wires: [{ a: "a.out.r", b: "b.in.x" }],
  };

  it("anchors on the top and bottom walls", () => {
    const { board, wires } = anchors(tb);
    const a = board.nodes[0];
    const b = board.nodes[1];
    expect(wires[0].a.abs.y).toBeCloseTo(a.y + a.h, 6);
    expect(wires[0].a.abs.x).toBeCloseTo(a.x + (a.w / 3) * 2, 6);
    expect(wires[0].b.abs.y).toBeCloseTo(b.y, 6);
  });

  it("gives a portless accented node no marks to hide behind", () => {
    // accent:"err" on a node with no ports is the case that rendered identical
    // to a grey node when the accent only tinted the nubs.
    const b = layout({ flow: "tb", nodes: [{ id: "z", t: "error", c: 0, r: 0, accent: "err" }] });
    expect(b.handles.get("n:z")).toBeUndefined();
  });
});

describe("frames", () => {
  it("drops the tag below the box when title + tag do not fit", () => {
    const narrow = layout({
      nodes: [{ id: "a", t: "A", c: 0, r: 0 }],
      frames: [
        {
          id: "f",
          t: "Case Structure",
          tag: "a very long case label that cannot possibly fit",
          members: ["a"],
        },
      ],
    });
    const wide = layout({
      nodes: [{ id: "a", t: "A", c: 0, r: 0 }],
      frames: [{ id: "f", t: "F", tag: "x", members: ["a"] }],
    });
    // The extra 16px of board height is the observable side of "tag went below".
    expect(narrow.H).toBe(wide.H + 16);
  });

  it("claims tunnel clearance BEFORE placement so a wall never clips a member", () => {
    const plain = layout({
      nodes: [{ id: "a", t: "A", c: 0, r: 0 }],
      frames: [{ id: "f", members: ["a"] }],
    });
    const tunnelled = layout({
      nodes: [{ id: "a", t: "A", c: 0, r: 0 }],
      frames: [{ id: "f", members: ["a"], ltun: ["v"] }],
    });
    expect(tunnelled.W).toBeGreaterThan(plain.W);
    expect(tunnelled.H).toBeGreaterThan(plain.H);
  });

  it("reports a frame whose members all vanished", () => {
    const b = layout({ nodes: [], frames: [{ id: "f", members: ["gone"] }] });
    expect(b.errors).toEqual(["frame f has no resolvable members"]);
    expect(b.frames[0].box).toBeNull();
  });
});

describe("sizing, against docs/vocab_board.py", () => {
  it("sizes a box from its title, ports and sub-line", () => {
    const b = layout({
      nodes: [{ id: "a", t: "Wide Title Here", sub: "sub", c: 0, r: 0, in: ["alpha"], out: ["beta"] }],
    });
    const n = b.nodes[0];
    // w = max(96, len*11*0.605 + 26, lw + rw + 40)
    expect(n.w).toBeCloseTo(Math.max(96, 15 * 11 * 0.605 + 26, 5 * 10.5 * 0.605 * 2 + 40), 6);
    // h = TITLE_H + rows*PORT_H + 7 + 11 for the sub line
    expect(n.h).toBeCloseTo(TITLE_H + 1 * PORT_H + 7 + 11, 6);
  });

  it("gives a pill capsule sizing whatever the flow", () => {
    for (const flow of ["lr", "tb"] as const) {
      const b = layout({ flow, nodes: [{ id: "p", t: "get x", c: 0, r: 0, shape: "pill" }] });
      expect(b.nodes[0].h).toBe(24);
      expect(b.nodes[0].w).toBeCloseTo(Math.max(54, 5 * 10.5 * 0.605 + 26), 6);
    }
  });

  it("gives a pill inside a tb board no inlet tabs but still anchors top/bottom", () => {
    // draw_node returns on `pill` before it reaches the tb branch; `anchor` puts
    // the tb branch first. Marks follow the drawing, anchors follow anchoring.
    const b = layout({
      flow: "tb",
      nodes: [
        { id: "p", t: "get", c: 0, r: 0, shape: "pill", out: ["v"] },
        { id: "q", t: "print", c: 0, r: 1, in: ["x"] },
      ],
      wires: [{ a: "p.out.v", b: "q.in.x" }],
    });
    const marks = (b.handles.get("n:p") ?? []).filter((h) => h.mark !== null);
    expect(marks).toHaveLength(0);
    const p = b.nodes[0];
    expect(b.wires[0].a1.abs.y).toBeCloseTo(p.y + p.h, 6);
  });
});
