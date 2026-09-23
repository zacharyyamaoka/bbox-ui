/**
 * src/scene/armProjection.test.ts — an arm's operand survives the trip from
 * the FACTORY to the HOST vocabulary.
 *
 * This file exists because the trip broke silently once. `armNode` wrote the
 * test's port ID onto `data.ports.left` (all a wire needs) and dropped
 * `test.default` — the inline expression a reader sees when nothing is
 * wired. `hosts/nodeViews.tsx` then had nothing to project, so every canvas
 * host drew an arm with no dot and no condition, while direct `<BlockRegion>`
 * callers looked perfect. That asymmetry is what made it easy to miss: the
 * component was right, the scene was right, and only the seam between them
 * lost the value.
 *
 * Which is the same failure the whole split exists to end — a condition
 * living somewhere the drawing cannot show — reintroduced one layer down.
 * So the contract is pinned here, in the pure `unit` project, where it costs
 * nothing to run and cannot be skipped by a story that was not written.
 */
import { describe, expect, it } from "vitest";

import { branchNode, ifElifElseArms, matchCaseArms, matchNode } from "./region.branch";
import { armsOf } from "./controlFlow";
import type { HostNodeData } from "../hosts/hostScene";
import type { SceneNode } from "./scene";

const AT = { x: 0, y: 0 };

/** The scene an `if`/`elif`/`else` with two real conditions produces. */
function ladder(): SceneNode<HostNodeData>[] {
  return branchNode({ id: "br", position: AT, arms: ifElifElseArms(['mode == "fast"', "count > 0"]) });
}

describe("an arm's test survives into the host vocabulary", () => {
  it("writes the port id on the wall, for the wire", () => {
    const [, ifArm] = ladder();
    expect(ifArm.data.ports?.left).toEqual(["if"]);
  });

  it("ALSO writes the test itself, for the reader", () => {
    const [, ifArm] = ladder();
    expect(ifArm.data.arm?.test).toEqual({ id: "if", default: 'mode == "fast"' });
  });

  it("keeps the expression verbatim — quotes, spaces and all", () => {
    const nodes = branchNode({ id: "br", position: AT, arms: ifElifElseArms(['  mode == "fast"  ']) });
    expect(nodes[1].data.arm?.test?.default).toBe('  mode == "fast"  ');
  });

  it("gives `else` no test and no wall", () => {
    const nodes = ladder();
    const elseArm = nodes.find((n) => n.id === "else")!;
    expect(elseArm.data.arm?.test).toBeUndefined();
    expect(elseArm.data.ports?.left).toBeUndefined();
  });

  it("puts one test on EVERY non-else arm, not just the first", () => {
    const nodes = ladder();
    const arms = nodes.filter((n) => n.type === "arm");
    expect(arms.map((a) => a.data.arm?.test?.default)).toEqual(['mode == "fast"', "count > 0", undefined]);
  });
});

describe("a match arm's captures survive the same trip", () => {
  const scene = () =>
    matchNode({
      id: "m",
      position: AT,
      subject: "pt",
      arms: matchCaseArms(["Point(x=0, y=y)", "Point()"]).map((arm, i) =>
        i === 0 ? { ...arm, captures: ["y"] } : arm,
      ),
    });

  it("writes the captures on the RIGHT wall — a value the header produces", () => {
    const [, first] = scene();
    expect(first.data.ports?.right).toEqual(["y"]);
  });

  it("ALSO writes them on the arm, for the projection", () => {
    const [, first] = scene();
    expect(first.data.arm?.captures).toEqual(["y"]);
  });

  it("leaves an arm that binds nothing with neither", () => {
    const nodes = scene();
    const second = nodes.find((n) => n.id === "case-2")!;
    expect(second.data.arm?.captures).toBeUndefined();
    expect(second.data.ports?.right).toBeUndefined();
  });

  it("puts the subject on the REGION, never on an arm", () => {
    const [region, ...rest] = scene();
    expect(region.data.ports?.left).toEqual(["pt"]);
    for (const arm of rest) expect(arm.data.arm?.test).toBeUndefined();
  });
});

describe("the two carriers agree — neither may drift from the other", () => {
  it("every arm with a left wall has a test whose id IS that port", () => {
    const nodes = ladder();
    for (const arm of armsOf({ nodes }, "br")) {
      const wall = arm.data.ports?.left;
      if (wall === undefined) {
        expect(arm.data.arm?.test, `arm ${arm.id} has a test but no wall`).toBeUndefined();
        continue;
      }
      expect(wall).toEqual([arm.data.arm?.test?.id]);
    }
  });

  it("every arm with a right wall has captures equal to it", () => {
    const nodes = matchNode({
      id: "m",
      position: AT,
      subject: "pt",
      arms: matchCaseArms(["A", "B"]).map((arm, i) => (i === 0 ? { ...arm, captures: ["x", "y"] } : arm)),
    });
    for (const arm of armsOf({ nodes }, "m")) {
      const wall = arm.data.ports?.right;
      if (wall === undefined) {
        expect(arm.data.arm?.captures).toBeUndefined();
        continue;
      }
      expect(wall).toEqual([...(arm.data.arm?.captures ?? [])]);
    }
  });
});
