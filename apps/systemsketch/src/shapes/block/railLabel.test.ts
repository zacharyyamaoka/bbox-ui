// src/shapes/block/railLabel.test.ts — P-037's rail rule in the `unit`
// project. The BROWSER half — that a double-click on a real rail label reaches
// this function at all — is `src/railLabel.smoke.test.tsx`.
import { describe, expect, it } from "vitest";

import type { BlockPortSpec } from "./BlockShapeUtil";
import { portsFromRailItems, railGestureKey } from "./railLabel";

const ports: BlockPortSpec[] = [
  { id: "in", declaration: "gain_x: float" },
  { id: "aux", declaration: "aux" },
  { id: "pose", declaration: "pose:  Pose " },
];
const item = (id: string, label: string) => ({ id, label });
/** P-056 gave `portsFromRailItems` a third argument — the ids already in use
 *  on the whole block — and a `{ports, removed}` return. These tests pass the
 *  stored ids and read `.ports`; every ASSERTION about what a rail edit means
 *  is the one it was committed with. */
const taken = new Set(ports.map((port) => port.id));
const railPorts = (stored: readonly BlockPortSpec[], items: { id: string; label: string }[]) => portsFromRailItems(stored, items, taken).ports;

describe("P-037 — a label typed on the rail reaches the stored declaration", () => {
  it("an edited label becomes the port's NAME and the annotation survives verbatim", () => {
    const next = railPorts(ports, [item("in", "gain_y"), item("aux", "aux"), item("pose", "pose")]);
    expect(next.map((port) => port.declaration)).toEqual(["gain_y: float", "aux", "pose:  Pose "]);
  });

  it("an authored annotation keeps its exact spacing through a rename", () => {
    const next = railPorts(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "posture")]);
    expect(next[2].declaration).toBe("posture:  Pose ");
  });

  it("a port with no annotation takes the typed text whole", () => {
    const next = railPorts(ports, [item("in", "gain_x"), item("aux", "auxiliary"), item("pose", "pose")]);
    expect(next[1].declaration).toBe("auxiliary");
  });

  it("a colon typed into the rail is LOSSLESS, not a re-annotation — the hidden `: float` is never destroyed", () => {
    const next = railPorts(ports, [item("in", "a:b"), item("aux", "aux"), item("pose", "pose")]);
    expect(next[0].declaration).toBe("a:b: float");
    expect(next[0].declaration).toContain(": float");
  });

  it("a pure reorder returns the SAME objects — a drag must not look like an edit", () => {
    const next = railPorts(ports, [item("pose", "pose"), item("in", "gain_x"), item("aux", "aux")]);
    expect(next.map((port) => port.id)).toEqual(["pose", "in", "aux"]);
    expect(next[0]).toBe(ports[2]);
    expect(next[1]).toBe(ports[0]);
    expect(next[2]).toBe(ports[1]);
  });

  it("reorder and rename in the same report are both applied", () => {
    const next = railPorts(ports, [item("aux", "aux"), item("in", "gain_z"), item("pose", "pose")]);
    expect(next.map((port) => [port.id, port.declaration])).toEqual([
      ["aux", "aux"],
      ["in", "gain_z: float"],
      ["pose", "pose:  Pose "],
    ]);
  });

  // P-056 INVERTS THIS ONE, deliberately and with the record kept: it used to
  // read "an item naming a port the block no longer has is dropped, never
  // minted". That was the correct rule for a surface that could only rename,
  // and it is exactly the wall that made adding a port impossible — the
  // backlog row for P-056 cites this very line as the proof ("even a
  // trunk-minted port cannot survive the round trip"). An unknown id now MINTS.
  it("an item naming a port the block does not have MINTS one, declared by its line (P-056, was: dropped)", () => {
    const next = railPorts(ports, [item("in", "gain_x"), item("ghost", "ghost")]);
    expect(next.map((port) => port.id)).toEqual(["in", "ghost"]);
    expect(next[1].declaration).toBe("ghost");
  });

  it("the ports that went are reported, so the caller can delete their cables", () => {
    const edit = portsFromRailItems(ports, [item("in", "gain_x")], taken);
    expect(edit.removed.map((port) => port.id)).toEqual(["aux", "pose"]);
  });

  it("emptying the label empties the NAME and still keeps the annotation", () => {
    const next = railPorts(ports, [item("in", "")]);
    expect(next[0].declaration).toBe(": float");
  });
});

describe("P-014 — which gesture a rail report belongs to", () => {
  it("one changed label is a typing run, keyed on the port being typed into", () => {
    expect(railGestureKey(ports, [item("in", "gain_y"), item("aux", "aux"), item("pose", "pose")])).toBe("label:in");
    expect(railGestureKey(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "posture")])).toBe("label:pose");
  });

  it("consecutive keystrokes on one port share the key — which is what makes them one undo step", () => {
    const keys = ["g", "ga", "gai"].map((typed) => railGestureKey(ports, [item("in", typed), item("aux", "aux"), item("pose", "pose")]));
    expect(new Set(keys).size).toBe(1);
  });

  it("the key is read against the NAME half, so an unedited annotated port is not mistaken for a rename", () => {
    // `pose:  Pose ` paints as `pose`; an items array echoing what the rail
    // shows is NO change, and must not open an entry.
    expect(railGestureKey(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "pose")])).toBeNull();
  });

  it("a reorder is its own edit — null, i.e. mark now", () => {
    expect(railGestureKey(ports, [item("aux", "aux"), item("in", "gain_x"), item("pose", "pose")])).toBeNull();
  });

  it("two labels at once cannot be a keystroke, so it takes its own entry", () => {
    expect(railGestureKey(ports, [item("in", "a"), item("aux", "b"), item("pose", "pose")])).toBeNull();
  });

  it("a report that drops or adds a port is not a typing run", () => {
    expect(railGestureKey(ports, [item("in", "gain_y"), item("aux", "aux")])).toBeNull();
    expect(railGestureKey(ports, [item("in", "gain_y"), item("aux", "aux"), item("ghost", "ghost")])).toBeNull();
  });
});
