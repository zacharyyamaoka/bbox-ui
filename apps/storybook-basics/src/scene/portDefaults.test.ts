/**
 * src/scene/portDefaults.test.ts — an unwired port that OWNS a default says
 * so, and a cable always wins.
 *
 * `withWiredState` only ever promoted a port to `"wired"`; there was no way
 * for a scene to say "nothing is wired here, but a value is in force
 * anyway". So a `for` loop's `Iterable` showing `range(10)` was drawable
 * only by mounting `<BlockRegion>` by hand — the scene pipeline could not
 * express it, and the loop stories had to bypass the scene to show it
 * (measured 2026-09-22).
 *
 * That is the same failure as the arm one in `armProjection.test.ts`, one
 * layer out: a value that really exists, with nowhere in the drawing to say
 * so. The precedence is the part worth pinning — a default is what you get
 * in the ABSENCE of a value, never instead of one, so a cable overwrites it.
 */
import { describe, expect, it } from "vitest";

import { portKey } from "./scene";
import { edgeSpecsOf } from "../hosts/nodeViews";
import type { HostNodeData, HostScene } from "../hosts/hostScene";
import type { PortEdgeItem } from "../components/portEdge";
import type { SceneNode } from "./scene";

// `portKey` and `edgeSpecsOf` are both IMPORTED, never re-spelled here. The
// first draft of this file wrote its own `${nodeId}:${portId}` and its own
// copy of the label/state rule; the key was wrong (the real separator is
// `/`, scene.ts:66) and the copy could not have caught a change to the real
// one. A test that re-derives the thing it checks is testing itself.

/** One node's left wall, as the REAL projection builds it. */
function itemsFor(
  portIds: readonly string[],
  data: Partial<HostNodeData>,
  wired: ReadonlySet<string> = new Set(),
): PortEdgeItem[] {
  const node: SceneNode<HostNodeData> = {
    id: "loop",
    type: "block",
    position: { x: 0, y: 0 },
    data: { name: "loop", ports: { left: [...portIds] }, ...data },
  };
  const scene: HostScene = { nodes: [node], edges: [] };
  return edgeSpecsOf(scene, node, wired, undefined, undefined, undefined).left!.items;
}

describe("a port that owns a default", () => {
  it("reads as valueSet, not empty", () => {
    const [iterable] = itemsFor(["Iterable"], { portDefaults: { Iterable: "range(10)" } });
    expect(iterable.state).toBe("valueSet");
  });

  it("shows the default AS its label", () => {
    const [iterable] = itemsFor(["Iterable"], { portDefaults: { Iterable: "range(10)" } });
    expect(iterable.label).toBe("range(10)");
  });

  it("keeps the expression verbatim — spaces and quotes intact", () => {
    const [bool] = itemsFor(["Bool"], { portDefaults: { Bool: '  last_error != ""  ' } });
    expect(bool.label).toBe('  last_error != ""  ');
  });

  it("beats an authored label, because it is the more specific fact", () => {
    const [p] = itemsFor(["Bool"], { portDefaults: { Bool: "True" }, portLabels: { Bool: "condition" } });
    expect(p.label).toBe("True");
  });
});

describe("a port with no default is untouched", () => {
  it("has no state at all", () => {
    const [p] = itemsFor(["Iterable"], {});
    expect(p.state).toBeUndefined();
  });

  it("still falls back to its authored label, then its id", () => {
    expect(itemsFor(["Iter"], { portLabels: { Iter: "item" } })[0].label).toBe("item");
    expect(itemsFor(["Iter"], {})[0].label).toBe("Iter");
  });

  it("does not leak a sibling's default", () => {
    const [a, b] = itemsFor(["Iterable", "Iter"], { portDefaults: { Iterable: "range(10)" } });
    expect(a.state).toBe("valueSet");
    expect(b.state).toBeUndefined();
  });
});

describe("a cable always wins", () => {
  it("overwrites valueSet with wired", () => {
    const wired = itemsFor(["Iterable"], { portDefaults: { Iterable: "range(10)" } }, new Set([portKey("loop", "Iterable")]));
    expect(wired[0].state).toBe("wired");
  });

  it("leaves an unwired sibling on valueSet", () => {
    const wired = itemsFor(["Iterable", "Bool"], { portDefaults: { Iterable: "r", Bool: "b" } }, new Set([portKey("loop", "Iterable")]));
    expect(wired.map((i) => i.state)).toEqual(["wired", "valueSet"]);
  });

  it("does not invent a state for a port that never had one", () => {
    expect(itemsFor(["Iter"], {}, new Set())[0].state).toBeUndefined();
  });
});
