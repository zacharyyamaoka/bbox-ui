// src/shapes/block/railLabel.test.ts — P-037's rail rule in the `unit`
// project. The BROWSER half — that a double-click on a real rail label reaches
// this function at all — is `src/railLabel.smoke.test.tsx`.
import { describe, expect, it } from "vitest";

import type { BlockPortSpec } from "./BlockShapeUtil";
import { portsFromRailItems } from "./railLabel";

const ports: BlockPortSpec[] = [
  { id: "in", declaration: "gain_x: float" },
  { id: "aux", declaration: "aux" },
  { id: "pose", declaration: "pose:  Pose " },
];
const item = (id: string, label: string) => ({ id, label });

describe("P-037 — a label typed on the rail reaches the stored declaration", () => {
  it("an edited label becomes the port's NAME and the annotation survives verbatim", () => {
    const next = portsFromRailItems(ports, [item("in", "gain_y"), item("aux", "aux"), item("pose", "pose")]);
    expect(next.map((port) => port.declaration)).toEqual(["gain_y: float", "aux", "pose:  Pose "]);
  });

  it("an authored annotation keeps its exact spacing through a rename", () => {
    const next = portsFromRailItems(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "posture")]);
    expect(next[2].declaration).toBe("posture:  Pose ");
  });

  it("a port with no annotation takes the typed text whole", () => {
    const next = portsFromRailItems(ports, [item("in", "gain_x"), item("aux", "auxiliary"), item("pose", "pose")]);
    expect(next[1].declaration).toBe("auxiliary");
  });

  it("a colon typed into the rail is LOSSLESS, not a re-annotation — the hidden `: float` is never destroyed", () => {
    const next = portsFromRailItems(ports, [item("in", "a:b"), item("aux", "aux"), item("pose", "pose")]);
    expect(next[0].declaration).toBe("a:b: float");
    expect(next[0].declaration).toContain(": float");
  });

  it("a pure reorder returns the SAME objects — a drag must not look like an edit", () => {
    const next = portsFromRailItems(ports, [item("pose", "pose"), item("in", "gain_x"), item("aux", "aux")]);
    expect(next.map((port) => port.id)).toEqual(["pose", "in", "aux"]);
    expect(next[0]).toBe(ports[2]);
    expect(next[1]).toBe(ports[0]);
    expect(next[2]).toBe(ports[1]);
  });

  it("reorder and rename in the same report are both applied", () => {
    const next = portsFromRailItems(ports, [item("aux", "aux"), item("in", "gain_z"), item("pose", "pose")]);
    expect(next.map((port) => [port.id, port.declaration])).toEqual([
      ["aux", "aux"],
      ["in", "gain_z: float"],
      ["pose", "pose:  Pose "],
    ]);
  });

  it("an item naming a port the block no longer has is dropped, never minted", () => {
    const next = portsFromRailItems(ports, [item("in", "gain_x"), item("ghost", "ghost")]);
    expect(next.map((port) => port.id)).toEqual(["in"]);
  });

  it("emptying the label empties the NAME and still keeps the annotation", () => {
    const next = portsFromRailItems(ports, [item("in", "")]);
    expect(next[0].declaration).toBe(": float");
  });
});
