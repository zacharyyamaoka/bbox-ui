// src/shapes/block/railLabel.test.ts — P-037's rail rule in the `unit`
// project. The BROWSER half — that a double-click on a real rail label reaches
// this function at all — is `src/railLabel.smoke.test.tsx`.
import { describe, expect, it } from "vitest";

import type { BlockPortSpec } from "./BlockShapeUtil";
import { portsFromRailItems, railGesture } from "./railLabel";

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
/** The TYPING key these cases were originally written against.
 *  `railGesture` answers with a classification now, because the two
 *  structural cases (a line added, a line taken) need more than "not typing"
 *  — but every assertion below is the one it was committed with: a key, or
 *  `null` for "mark now". */
const keyOf = (stored: readonly BlockPortSpec[], items: { id: string; label: string; laneLine?: string }[]): string | null => {
  const gesture = railGesture(stored, items);
  return gesture.kind === "typing" ? `label:${gesture.port}` : null;
};

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
    expect(keyOf(ports, [item("in", "gain_y"), item("aux", "aux"), item("pose", "pose")])).toBe("label:in");
    expect(keyOf(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "posture")])).toBe("label:pose");
  });

  it("consecutive keystrokes on one port share the key — which is what makes them one undo step", () => {
    const keys = ["g", "ga", "gai"].map((typed) => keyOf(ports, [item("in", typed), item("aux", "aux"), item("pose", "pose")]));
    expect(new Set(keys).size).toBe(1);
  });

  it("the key is read against the NAME half, so an unedited annotated port is not mistaken for a rename", () => {
    // `pose:  Pose ` paints as `pose`; an items array echoing what the rail
    // shows is NO change, and must not open an entry.
    expect(keyOf(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "pose")])).toBeNull();
  });

  it("a reorder is its own edit — null, i.e. mark now", () => {
    expect(keyOf(ports, [item("aux", "aux"), item("in", "gain_x"), item("pose", "pose")])).toBeNull();
  });

  it("two labels at once cannot be a keystroke, so it takes its own entry", () => {
    expect(keyOf(ports, [item("in", "a"), item("aux", "b"), item("pose", "pose")])).toBeNull();
  });

  it("the LANE's own field counts too — one changed declaration is a typing run", () => {
    // P-056's multi-line lane reports the WHOLE declaration as `laneLine`
    // while `label` stays the name half the rail paints. Before this was
    // read, re-typing one line in the lane cost thirteen Ctrl+Z.
    const typing = [
      { id: "in", label: "gain_x", laneLine: "gain_x: floa" },
      { id: "aux", label: "aux", laneLine: "aux" },
      { id: "pose", label: "pose", laneLine: "pose:  Pose " },
    ];
    expect(keyOf(ports, typing)).toBe("label:in");
    // ...and the next keystroke shares the key, which is what makes the run
    // one undo step.
    expect(keyOf(ports, typing.map((item) => (item.id === "in" ? { ...item, laneLine: "gain_x: float " } : item)))).toBe("label:in");
  });

  it("one port whose name AND declaration both moved is counted once, not twice", () => {
    expect(
      keyOf(ports, [
        { id: "in", label: "gain_y", laneLine: "gain_y: float" },
        { id: "aux", label: "aux", laneLine: "aux" },
        { id: "pose", label: "pose", laneLine: "pose:  Pose " },
      ]),
    ).toBe("label:in");
  });

  it("an item with no `laneLine` is a surface that HAS no lane, never a cleared declaration", () => {
    expect(keyOf(ports, [item("in", "gain_x"), item("aux", "aux"), item("pose", "pose")])).toBeNull();
  });

  it("two ports changed through the lane at once is not a keystroke", () => {
    expect(
      keyOf(ports, [
        { id: "in", label: "gain_x", laneLine: "gain_x: int" },
        { id: "aux", label: "aux", laneLine: "aux: int" },
        { id: "pose", label: "pose", laneLine: "pose:  Pose " },
      ]),
    ).toBeNull();
  });

  it("a report that drops or adds a port is not a typing run", () => {
    // Both also CHANGE `in`, so neither is a clean structural edit either —
    // see the `discrete` cases in the next block.
    expect(keyOf(ports, [item("in", "gain_y"), item("aux", "aux")])).toBeNull();
    expect(keyOf(ports, [item("in", "gain_y"), item("aux", "aux"), item("ghost", "ghost")])).toBeNull();
  });
});

describe("P-014 — a line ADDED and a line TAKEN are gestures too", () => {
  const lane = (id: string, label: string, laneLine: string) => ({ id, label, laneLine });
  const echo = [lane("in", "gain_x", "gain_x: float"), lane("aux", "aux", "aux"), lane("pose", "pose", "pose:  Pose ")];

  it("one new line and nothing else is an ADD — the Enter that mints a port", () => {
    // What the lane really reports: a provisional id, an EMPTY line, and the
    // three ports that were already there, untouched.
    expect(railGesture(ports, [...echo, { id: "lane-0", label: "" }])).toEqual({ kind: "add" });
    // ...and it is an add wherever the line lands, not only at the end.
    expect(railGesture(ports, [echo[0], { id: "lane-1", label: "" }, echo[1], echo[2]])).toEqual({ kind: "add" });
  });

  it("an add that ALSO moves an existing line is discrete — splitting a line in two is not an add", () => {
    // Enter in the MIDDLE of `gain_x: float` leaves `gain_` on the old port
    // and mints the rest. Two things moved, so it takes its own entry.
    expect(railGesture(ports, [lane("in", "gain_", "gain_"), { id: "lane-0", label: "x: float" }, echo[1], echo[2]])).toEqual({ kind: "discrete" });
  });

  it("two new lines at once is discrete — a paste is one edit, not the start of a typing run", () => {
    expect(railGesture(ports, [...echo, { id: "lane-0", label: "" }, { id: "lane-1", label: "" }])).toEqual({ kind: "discrete" });
  });

  it("one line gone and nothing else is a REMOVE, naming the port so its run can be joined", () => {
    expect(railGesture(ports, [echo[0], echo[2]])).toEqual({ kind: "remove", port: "aux", emptied: false });
  });

  it("`emptied` is the two-stroke delete: the line was BLANK when it went", () => {
    // Stroke one blanks `aux`'s line — a typing run on `aux`.
    const blanked: BlockPortSpec[] = [ports[0], { id: "aux", declaration: "" }, ports[2]];
    expect(railGesture(ports, [echo[0], lane("aux", "", ""), echo[2]])).toEqual({ kind: "typing", port: "aux" });
    // Stroke two takes the newline. `emptied` is what tells the caller this
    // closes the run stroke one opened, instead of opening a second entry.
    expect(railGesture(blanked, [echo[0], echo[2]])).toEqual({ kind: "remove", port: "aux", emptied: true });
  });

  it("a remove that ALSO moves a neighbour is discrete — backspacing a NON-empty line into the one above it", () => {
    expect(railGesture(ports, [lane("in", "gain_xaux", "gain_xaux: float"), echo[2]])).toEqual({ kind: "discrete" });
  });

  it("emptying the WHOLE lane is discrete — select-all + Delete is one edit, and nothing survives to be typed into", () => {
    expect(railGesture(ports, [])).toEqual({ kind: "discrete" });
  });

  it("a reorder is still discrete, and a rename is still a typing run", () => {
    expect(railGesture(ports, [echo[1], echo[0], echo[2]])).toEqual({ kind: "discrete" });
    expect(railGesture(ports, [lane("in", "gain_y", "gain_y: float"), echo[1], echo[2]])).toEqual({ kind: "typing", port: "in" });
  });
});
