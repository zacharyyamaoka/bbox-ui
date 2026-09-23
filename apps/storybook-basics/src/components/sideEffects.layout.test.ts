/**
 * src/components/sideEffects.layout.test.ts — the pure half of side-effect
 * ports: the model helpers, the top-wall split, and the mutation route.
 * The rendered half is measured in a real browser by
 * `SideEffectPorts.stories.tsx`.
 */
import { describe, expect, it } from "vitest";

import { mainAxisPositions } from "./portEdge.layout";
import {
  MUTATION_ARROW_LENGTH_PX,
  hasSideEffects,
  mutationRoute,
  partitionMutations,
  sideEffectDirectionOf,
  sideEffectWallLayout,
  type BlockSideEffects,
} from "./sideEffects.layout";

const EFFECTS: BlockSideEffects = {
  inputs: [{ id: "in1", label: "in1" }],
  outputs: [
    { id: "out1", label: "out 1" },
    { id: "out2", label: "out 2" },
  ],
};

describe("the model", () => {
  it("reads an effect's direction off the list it is declared in", () => {
    expect(sideEffectDirectionOf(EFFECTS, "in1")).toBe("input");
    expect(sideEffectDirectionOf(EFFECTS, "out2")).toBe("output");
    expect(sideEffectDirectionOf(EFFECTS, "nope")).toBeUndefined();
    expect(sideEffectDirectionOf(undefined, "in1")).toBeUndefined();
  });

  it("has side effects only when at least one is declared", () => {
    expect(hasSideEffects(undefined)).toBe(false);
    expect(hasSideEffects({})).toBe(false);
    expect(hasSideEffects({ inputs: [], outputs: [] })).toBe(false);
    expect(hasSideEffects({ outputs: [{ id: "o" }] })).toBe(true);
  });

  it("resolves a mutation only from an input-wall port to an OUTPUT effect", () => {
    const { resolved, unresolved } = partitionMutations(
      [
        { from: "c", to: "out1" }, // good
        { from: "c", to: "in1" }, // aimed at an INPUT effect
        { from: "zz", to: "out1" }, // not an input port
        { from: "c", to: "gone" }, // no such effect
      ],
      EFFECTS,
      ["a", "b", "c"],
    );
    expect(resolved).toEqual([{ from: "c", to: "out1" }]);
    expect(unresolved.map((link) => `${link.from}>${link.to}`)).toEqual(["c>in1", "zz>out1", "c>gone"]);
  });
});

describe("sideEffectWallLayout — splits the wall down the middle", () => {
  it("puts the divider at the wall's centre", () => {
    expect(sideEffectWallLayout(240, 1, 1).dividerX).toBe(120);
    expect(sideEffectWallLayout(301, 0, 2).dividerX).toBe(150.5);
  });

  it("a lone input sits at the quarter point, a lone output at three quarters", () => {
    const layout = sideEffectWallLayout(240, 1, 1);
    expect(layout.inputXs).toEqual([60]);
    expect(layout.outputXs).toEqual([180]);
  });

  it("outputs only still sit right of the divider ('towards the back end')", () => {
    const layout = sideEffectWallLayout(240, 0, 1);
    expect(layout.inputXs).toEqual([]);
    expect(layout.outputXs[0]).toBeGreaterThan(layout.dividerX);
  });

  it("every input is left of the divider and every output right of it, in authored order", () => {
    for (const [inputs, outputs] of [[1, 0], [0, 1], [2, 2], [3, 1], [1, 4]] as const) {
      const layout = sideEffectWallLayout(260, inputs, outputs);
      expect(layout.inputXs).toHaveLength(inputs);
      expect(layout.outputXs).toHaveLength(outputs);
      for (const x of layout.inputXs) expect(x).toBeLessThan(layout.dividerX);
      for (const x of layout.outputXs) expect(x).toBeGreaterThan(layout.dividerX);
      expect([...layout.inputXs].sort((a, b) => a - b)).toEqual(layout.inputXs);
      expect([...layout.outputXs].sort((a, b) => a - b)).toEqual(layout.outputXs);
    }
  });

  it("each half IS CSS space-evenly over half the wall — the kit's own mainAxisPositions, not a copy", () => {
    const layout = sideEffectWallLayout(300, 2, 3);
    expect(layout.inputXs).toEqual(mainAxisPositions(2, 150, 0, "space-evenly"));
    expect(layout.outputXs).toEqual(mainAxisPositions(3, 150, 0, "space-evenly").map((x) => 150 + x));
  });
});

describe("mutationRoute — horizontal from the port, then vertical to the effect", () => {
  const from = { x: 0, y: 100 };
  const to = { x: 180, y: 0 };

  it("is one bend: start and bend share y, bend and tip share x", () => {
    const { points } = mutationRoute(from, to, 3, 3);
    const [start, bend, tip] = points;
    expect(start.y).toBe(bend.y);
    expect(bend.x).toBe(tip.x);
    expect(bend).toEqual({ x: 180, y: 100 });
  });

  it("starts on the input dot's rim and ends on the effect dot's rim", () => {
    const { points } = mutationRoute(from, to, 3, 4);
    expect(points[0]).toEqual({ x: 3, y: 100 });
    expect(points[2]).toEqual({ x: 180, y: 4 });
  });

  it("the arrowhead's tip is the line's end and it points AT the effect", () => {
    const { points, arrowhead } = mutationRoute(from, to, 3, 3);
    expect(arrowhead[0]).toEqual(points[2]);
    // Travelling up: the base sits BELOW the tip by the arrow's length.
    expect(arrowhead[1].y).toBe(points[2].y + MUTATION_ARROW_LENGTH_PX);
    expect(arrowhead[2].y).toBe(points[2].y + MUTATION_ARROW_LENGTH_PX);
    expect(arrowhead[1].x).toBeLessThan(points[2].x);
    expect(arrowhead[2].x).toBeGreaterThan(points[2].x);
  });

  it("an effect left of the port pulls the start toward it", () => {
    const { points } = mutationRoute({ x: 200, y: 50 }, { x: 40, y: 0 }, 3, 3);
    expect(points[0].x).toBe(197);
  });
});
