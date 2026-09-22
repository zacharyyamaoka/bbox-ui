// src/scene/portList.test.ts — P-056's pure half, in the `unit` project.
// The BROWSER half — that a real click on a real port dot opens a real lane
// and that typing into it reaches the document — is
// `apps/systemsketch/src/portLane.smoke.test.tsx`.
import { describe, expect, it } from "vitest";

import { portsFromLineItems, uniquePortId, type DeclaredPort } from "./portList";

interface Port extends DeclaredPort {
  id: string;
  declaration: string;
}

const ports: Port[] = [
  { id: "in", declaration: "gain_x: float" },
  { id: "aux", declaration: "aux" },
  { id: "pose", declaration: "pose:  Pose " },
];

/** A host minter: one fresh id per new line, unique against everything the
 *  block already holds AND against anything minted earlier in the same call. */
function minter(existing: readonly Port[]) {
  const taken = new Set(existing.map((port) => port.id));
  return (declaration: string): Port => {
    const id = uniquePortId(declaration, taken);
    taken.add(id);
    return { id, declaration };
  };
}

const rail = (id: string, label: string) => ({ id, label });
/** What the app reports while the LANE is the surface: label is the rail's
 *  name half, `laneLine` is the whole declaration. */
const lane = (id: string, laneLine: string, label = laneLine.split(":")[0]) => ({ id, label, laneLine });

describe("P-056 — a line added is a port added", () => {
  it("an id the block does not own MINTS a port declared by its line", () => {
    const { ports: next, removed } = portsFromLineItems(ports, [...ports.map((p) => lane(p.id, p.declaration)), lane("lane-0", "speed: float")], minter(ports));
    expect(next.map((p) => p.declaration)).toEqual(["gain_x: float", "aux", "pose:  Pose ", "speed: float"]);
    expect(next[3].id).toBe("speed");
    expect(removed).toEqual([]);
  });

  it("the new port's whole line is kept — the annotation is NOT dropped on the way in", () => {
    const { ports: next } = portsFromLineItems([], [lane("lane-0", "items: dict[str, int]")], minter([]));
    expect(next[0].declaration).toBe("items: dict[str, int]");
  });

  it("two new lines in one report mint two DISTINCT ids, even with the same name", () => {
    const { ports: next } = portsFromLineItems([], [lane("lane-0", "x: int"), lane("lane-1", "x: int")], minter([]));
    expect(next.map((p) => p.id)).toEqual(["x", "x-2"]);
  });

  it("a surface with no lane at all (a bare rail) mints from the label", () => {
    const { ports: next } = portsFromLineItems(ports, [...ports.map((p) => rail(p.id, p.declaration.split(":")[0])), rail("new", "extra")], minter(ports));
    expect(next[3]).toEqual({ id: "extra", declaration: "extra" });
  });
});

describe("P-056 — a line removed is a port removed, and it says which", () => {
  it("a port whose line is gone is dropped AND reported in `removed`", () => {
    const { ports: next, removed } = portsFromLineItems(ports, [lane("in", "gain_x: float"), lane("pose", "pose:  Pose ")], minter(ports));
    expect(next.map((p) => p.id)).toEqual(["in", "pose"]);
    // The whole point of the second half: the caller needs the PORT, not just
    // its id, to find what was plugged into it.
    expect(removed).toEqual([{ id: "aux", declaration: "aux" }]);
  });

  it("emptying the lane removes every port and reports every one of them", () => {
    const { ports: next, removed } = portsFromLineItems(ports, [], minter(ports));
    expect(next).toEqual([]);
    expect(removed.map((p) => p.id)).toEqual(["in", "aux", "pose"]);
  });

  it("a remove and an add in the same report are BOTH applied", () => {
    const { ports: next, removed } = portsFromLineItems(ports, [lane("in", "gain_x: float"), lane("lane-9", "trigger: bool")], minter(ports));
    expect(next.map((p) => p.id)).toEqual(["in", "trigger"]);
    expect(removed.map((p) => p.id)).toEqual(["aux", "pose"]);
  });
});

describe("P-056 — a changed lane line RE-DECLARES the port; the rail still renames it", () => {
  it("the lane writes the whole declaration, annotation and all — this is `retype it`", () => {
    const { ports: next } = portsFromLineItems(ports, [lane("in", "gain_x: int"), lane("aux", "aux"), lane("pose", "pose:  Pose ")], minter(ports));
    expect(next[0].declaration).toBe("gain_x: int");
    expect(next[0].id).toBe("in");
  });

  it("clearing the annotation in the lane really clears it — a whole line is a whole line", () => {
    const { ports: next } = portsFromLineItems(ports, [lane("in", "gain_x"), lane("aux", "aux"), lane("pose", "pose:  Pose ")], minter(ports));
    expect(next[0].declaration).toBe("gain_x");
  });

  it("a RAIL rename still splices the name half and keeps the hidden annotation verbatim (P-037, unchanged)", () => {
    // The app feeds `laneLine` on every render whether a lane is open or not,
    // so a rail rename arrives with an UNCHANGED laneLine beside a changed
    // label. That must read as a rename, not as a re-declaration.
    const items = [
      { id: "in", label: "gain_y", laneLine: "gain_x: float" },
      { id: "aux", label: "aux", laneLine: "aux" },
      { id: "pose", label: "posture", laneLine: "pose:  Pose " },
    ];
    const { ports: next } = portsFromLineItems(ports, items, minter(ports));
    expect(next.map((p) => p.declaration)).toEqual(["gain_y: float", "aux", "posture:  Pose "]);
  });

  it("a colon typed into the RAIL is still lossless, never a re-annotation", () => {
    const { ports: next } = portsFromLineItems(ports, [rail("in", "a:b"), rail("aux", "aux"), rail("pose", "pose")], minter(ports));
    expect(next[0].declaration).toBe("a:b: float");
  });
});

describe("P-056 — referential stability", () => {
  it("a pure reorder returns the SAME port objects and the SAME `removed` emptiness", () => {
    const { ports: next, removed } = portsFromLineItems(ports, [lane("pose", "pose:  Pose "), lane("in", "gain_x: float"), lane("aux", "aux")], minter(ports));
    expect(next[0]).toBe(ports[2]);
    expect(next[1]).toBe(ports[0]);
    expect(next[2]).toBe(ports[1]);
    expect(removed).toEqual([]);
  });

  it("a report that changes nothing returns the SAME ARRAY — a keystroke on another rail must not write", () => {
    const { ports: next } = portsFromLineItems(ports, ports.map((p) => lane(p.id, p.declaration)), minter(ports));
    expect(next).toBe(ports);
  });
});

describe("uniquePortId", () => {
  it("is the declaration's NAME half, trimmed", () => {
    expect(uniquePortId("speed: float", new Set())).toBe("speed");
    expect(uniquePortId(" speed : float", new Set())).toBe("speed");
    expect(uniquePortId("bare", new Set())).toBe("bare");
  });

  it("falls back to `port` when the line names nothing", () => {
    expect(uniquePortId("", new Set())).toBe("port");
    expect(uniquePortId(": float", new Set())).toBe("port");
  });

  it("counts up past every id already taken, across the WHOLE block", () => {
    expect(uniquePortId("x: int", new Set(["x"]))).toBe("x-2");
    expect(uniquePortId("x: int", new Set(["x", "x-2", "x-3"]))).toBe("x-4");
  });
});
