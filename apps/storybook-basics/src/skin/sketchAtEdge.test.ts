// src/skin/sketchAtEdge.test.ts — the byte-identity proof for moving the
// sketch transform out of the core and onto the boundary.
//
// These are node tests (the `unit` project): pure string math, no DOM. The
// DOM half of the pass is proven in `src/skin/SkinAtTheEdges.stories.tsx`,
// where a play function reads the core's OWN live twin out of the rendered
// document and compares it to the boundary's — an independent oracle in the
// strict sense, since the core's twin is the shipped implementation this
// design is replacing, not a re-derivation of it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, beforeEach } from "vitest";

import {
  SKETCH_AT_EDGE_CSS,
  SKETCH_SRC_ATTR,
  SKETCH_TWIN_ATTR,
  TRACE_WOBBLE_PX,
  __clearSketchCache,
  sketchTraceD,
} from "./sketchAtEdge";
import { sketchPathData } from "./sketchPath";

const TRACE_TSX = fileURLToPath(new URL("../components/trace.tsx", import.meta.url));

/** Real trace `d` shapes, one per routing mode the component can emit. */
const SAMPLE_PATHS = {
  straight: "M4 20L156 20",
  slanted: "M4 20L80 64L156 64",
  bezier: "M4 20C60 20 100 64 156 64",
  elbow: "M4 20L60 20L60 64L156 64",
  // Two subpaths in one `d` — what a TUNNELLED cable looks like after
  // `tunnelMouths` shortens it. This is the case the lane's claim was
  // about, so it gets its own sample.
  tunnelled: "M4 20L38 20 M122 64L156 64",
} as const;

beforeEach(() => {
  __clearSketchCache();
});

describe("the sketch geometry no longer lives in the core (migration M1)", () => {
  // WHY read the component off disk instead of importing it: importing
  // `trace.tsx` would make this test — and anything that bundles it — pull
  // React and the whole component graph into a node project. Reading the
  // source as TEXT asserts the same invariant with no dependency at all.
  //
  // This replaces the pre-migration "TRACE_WOBBLE_PX matches the literal in
  // trace.tsx" drift guard: before docs/SKIN-AT-THE-EDGES-MIGRATION.md's M1,
  // TWO copies of this constant existed (trace.tsx's own and this file's)
  // and had to be asserted equal. M1 deleted trace.tsx's copy along with its
  // twin-path rewriter, so this file is now the ONLY declaration — there is
  // nothing left to drift against, only a regression to guard: trace.tsx
  // growing a second copy back.
  it("trace.tsx declares no wobble constant of its own", () => {
    const src = readFileSync(TRACE_TSX, "utf8");
    expect(src).not.toMatch(/TRACE_WOBBLE_PX/);
  });

  it("trace.tsx no longer imports the sketch path generator", () => {
    const src = readFileSync(TRACE_TSX, "utf8");
    expect(src).not.toMatch(/from ["']\.\.\/skin/);
  });
});

describe("relocating the call cannot change the output", () => {
  // This is the whole architectural claim, as an assertion. The boundary
  // calls the same pure function on the same argument; the seed is derived
  // from that argument; therefore the result is byte-identical regardless
  // of where the call site lives.
  it.each(Object.entries(SAMPLE_PATHS))(
    "%s: boundary output === the core's recipe, byte for byte",
    (_name, d) => {
      const core = sketchPathData(d, { seed: d, wobble: TRACE_WOBBLE_PX });
      expect(sketchTraceD(d)).toBe(core);
    },
  );

  it("is deterministic across a cold cache", () => {
    const first = sketchTraceD(SAMPLE_PATHS.elbow);
    __clearSketchCache();
    expect(sketchTraceD(SAMPLE_PATHS.elbow)).toBe(first);
  });

  it("actually transforms — a sketched path is not its input", () => {
    for (const d of Object.values(SAMPLE_PATHS)) {
      expect(sketchTraceD(d)).not.toBe(d);
    }
  });
});

describe("the transform is a pure function of the path string", () => {
  // If this held only by accident, the design would not be safe to move.
  // Nothing but `d` reaches the generator: no DOM, no clock, no ambient
  // skin state. Two calls separated by unrelated work agree.
  it("interleaving other paths does not perturb a result", () => {
    const want = sketchTraceD(SAMPLE_PATHS.bezier);
    for (const d of Object.values(SAMPLE_PATHS)) sketchTraceD(d);
    __clearSketchCache();
    sketchTraceD(SAMPLE_PATHS.straight);
    expect(sketchTraceD(SAMPLE_PATHS.bezier)).toBe(want);
  });
});

describe("endpoints stay pinned — a trace must not detach from its ports", () => {
  // `sketchPathData` protects index 0 and index (length-1) of every run.
  // That is a CORRECTNESS property, not a cosmetic one (the generator's own
  // header calls a wandering endpoint "a correctness bug wearing a style's
  // clothes"), so the boundary has to preserve it too — and it is the
  // property an SVG displacement filter provably cannot preserve, which is
  // the measured reason option 2 was rejected.
  const firstMove = (d: string) => {
    const m = d.match(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  };

  it.each(Object.entries(SAMPLE_PATHS))("%s keeps its start point", (_name, d) => {
    const want = firstMove(d)!;
    const got = firstMove(sketchTraceD(d))!;
    expect(got.x).toBeCloseTo(want.x, 2);
    expect(got.y).toBeCloseTo(want.y, 2);
  });

  it("a tunnelled two-subpath cable keeps BOTH mouths anchored", () => {
    // The lane's claim was that tunnel and sketch must coexist inside the
    // component. They do coexist in the DOM — but sequentially: tunnel
    // decides WHICH geometry is painted, sketch re-draws whatever string
    // came out. `sketchPathData` treats each `M` as its own run and pins
    // that run's two ends, so both stubs stay attached with the boundary
    // knowing nothing whatsoever about tunnelling.
    const out = sketchTraceD(SAMPLE_PATHS.tunnelled);
    const subpaths = out.split(/(?=M)/).filter((s) => s.trim().length > 0);
    expect(subpaths.length).toBeGreaterThanOrEqual(2);
    // Every original anchor still appears as a move-to in the output.
    for (const anchor of ["M4 20", "M122 64"]) {
      expect(out).toContain(anchor);
    }
  });
});

describe("the suppression CSS keys on the core's existing DOM contract", () => {
  // The rules must select on `data-slot`, which the core already emits for
  // its own styling and testing reasons, and on the twin attribute this
  // pass adds. If a rule ever needed a NEW attribute from the core, the
  // design would have failed its own premise.
  it("selects crisp trace lines by data-slot and excludes twins", () => {
    expect(SKETCH_AT_EDGE_CSS).toContain('[data-slot="trace-line"]');
    expect(SKETCH_AT_EDGE_CSS).toContain(`:not([${SKETCH_TWIN_ATTR}])`);
  });

  it("gates suppression on a different attribute than activation", () => {
    // Comparison views run the pass with suppression off, which is what
    // makes a side-by-side capture possible at all.
    expect(SKETCH_AT_EDGE_CSS).toContain("[data-bbox-sketch-suppress]");
    expect(SKETCH_AT_EDGE_CSS).toContain("[data-bbox-sketch-active]");
  });

  it("names no component module — the edge reads DOM, never imports core", () => {
    expect(SKETCH_AT_EDGE_CSS).not.toMatch(/components\//);
  });

  it("exports a source-tracking attribute so a pass can be idempotent", () => {
    expect(SKETCH_SRC_ATTR).toBe("data-bbox-sketch-src");
  });
});

describe("the edge module imports nothing from the core", () => {
  // The governing rule in CLAUDE.md, enforced rather than asserted in
  // prose. `src/skin/` may import `src/skin/`; the moment it reaches into
  // `src/components/` the arrow has reversed and the leak is back, just
  // pointing the other way.
  const EDGE_FILES = ["./sketchAtEdge.ts", "./SketchAtEdge.tsx"] as const;

  it.each(EDGE_FILES)("%s has no import from src/components", (rel) => {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, `${rel} imports ${spec}`).not.toMatch(/components/);
    }
  });
});
