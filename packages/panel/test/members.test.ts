import { describe, expect, it } from "vitest";
import type { Instance } from "../src/bench";
import { INITIAL_BENCHES, MEMBER_SPECS, REGISTRY } from "../src/bench";
import {
  addMemberTo,
  addableTypes,
  ancestry,
  depthOf,
  moveIndex,
  moveMember,
  parentMap,
  removeMember,
  subtreeIds,
  summarize,
  topLevel,
  wouldCycle,
} from "../src/members/model";
import { MEMBERS_CONTROLS, MEMBERS_CONTRACT } from "../src/members";

const inst = (id: string, type: string, props: Record<string, unknown> = {}, members?: string[]): Instance => ({
  id,
  type,
  props,
  ...(members ? { members } : {}),
});

/** A Stack holding a Block and a Port; the Block holds a Pill. */
const bench: Instance[] = [
  inst("stack-1", "Stack", {}, ["block-2", "port-3"]),
  inst("block-2", "Block", {}, ["pill-4"]),
  inst("port-3", "Port", { children: "goal", state: "wired" }),
  inst("pill-4", "Pill", { children: "" }),
  inst("port-9", "Port", { children: "loose" }),
];

describe("the member tree is derived from the parent's list alone", () => {
  it("knows every child's parent and which instances are roots", () => {
    expect(Object.fromEntries(parentMap(bench))).toEqual({ "block-2": "stack-1", "port-3": "stack-1", "pill-4": "block-2" });
    expect(topLevel(bench).map((i) => i.id)).toEqual(["stack-1", "port-9"]);
  });
  it("walks a subtree depth first in member order, and climbs an ancestry", () => {
    expect(subtreeIds(bench, "stack-1")).toEqual(["stack-1", "block-2", "pill-4", "port-3"]);
    expect(ancestry(bench, "pill-4")).toEqual(["stack-1", "block-2"]);
    expect(depthOf(bench, "pill-4")).toBe(2);
    expect(depthOf(bench, "port-9")).toBe(0);
  });
});

describe("summarize gives a control the little it may show", () => {
  it("uses the child's own text as its title, else Type n among same-type siblings", () => {
    expect(summarize(bench, "port-3")).toMatchObject({ title: "goal", untitled: false, badge: "wired", type: "Port" });
    // An empty string is not a title.
    expect(summarize(bench, "pill-4")).toMatchObject({ title: "Pill 1", untitled: true, badge: null });
    expect(summarize(bench, "block-2")).toMatchObject({ title: "Block 1", memberIds: ["pill-4"] });
  });
  it("numbers untitled siblings of the same type apart", () => {
    const two = [inst("s", "Stack", {}, ["a", "b"]), inst("a", "Pill"), inst("b", "Pill")];
    expect(summarize(two, "a")?.title).toBe("Pill 1");
    expect(summarize(two, "b")?.title).toBe("Pill 2");
  });
});

describe("the bench operations", () => {
  it("add appends to the parent's list and the bench; remove takes the subtree and unlinks", () => {
    const added = addMemberTo(bench, "stack-1", inst("glyph-5", "Glyph"));
    expect(added.find((i) => i.id === "stack-1")?.members).toEqual(["block-2", "port-3", "glyph-5"]);
    expect(added.some((i) => i.id === "glyph-5")).toBe(true);

    const removed = removeMember(added, "block-2");
    expect(removed.map((i) => i.id)).toEqual(["stack-1", "port-3", "port-9", "glyph-5"]);
    expect(removed.find((i) => i.id === "stack-1")?.members).toEqual(["port-3", "glyph-5"]);
  });
  it("move reorders the parent's list and nothing else", () => {
    const moved = moveMember(bench, "stack-1", 0, 1);
    expect(moved.find((i) => i.id === "stack-1")?.members).toEqual(["port-3", "block-2"]);
    expect(moved.filter((i) => i.id !== "stack-1")).toEqual(bench.filter((i) => i.id !== "stack-1"));
    expect(moveIndex([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveIndex([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it("refuses to make a cycle", () => {
    expect(wouldCycle(bench, "block-2", "stack-1")).toBe(true);
    expect(wouldCycle(bench, "stack-1", "port-9")).toBe(false);
  });
});

describe("what a parent may add is declared, closed and capped", () => {
  it("offers only the accepted types, in the declared order", () => {
    expect(addableTypes(MEMBER_SPECS.PortEdge, REGISTRY, 0)).toEqual(["Port"]);
    expect(addableTypes(MEMBER_SPECS.Stack, REGISTRY, 0)[0]).toBe("Block");
  });
  it("offers nothing at max, and everything registered when accepts is open", () => {
    expect(addableTypes({ accepts: ["Port"], max: 2 }, REGISTRY, 2)).toEqual([]);
    expect(addableTypes({ accepts: [] }, REGISTRY, 0)).toEqual(REGISTRY.map((e) => e.name));
  });
  it("every accepted type is a registered component, and every declaring entry carries its spec", () => {
    const names = new Set(REGISTRY.map((e) => e.name));
    for (const [parent, spec] of Object.entries(MEMBER_SPECS)) {
      expect(names.has(parent), parent).toBe(true);
      for (const t of spec.accepts) expect(names.has(t), `${parent} accepts ${t}`).toBe(true);
      expect(REGISTRY.find((e) => e.name === parent)?.members).toBe(spec);
    }
    // A component that holds nothing declares nothing — a leaf must not
    // grow a Members section by accident.
    for (const e of REGISTRY) if (!(e.name in MEMBER_SPECS)) expect(e.members).toBeUndefined();
  });
  it("a fresh bench has no members, so every seed is a root", () => {
    for (const list of Object.values(INITIAL_BENCHES)) expect(topLevel(list)).toEqual(list);
  });
});

describe("the five controls", () => {
  it("are five, distinct by id, with List first as the default", () => {
    expect(MEMBERS_CONTROLS.map((c) => c.id)).toEqual(["list", "chips", "outline", "grouped", "stepper"]);
    expect(new Set(MEMBERS_CONTROLS.map((c) => c.label)).size).toBe(5);
  });
  it("each states what it optimises for", () => {
    for (const c of MEMBERS_CONTROLS) expect(c.blurb.length, c.id).toBeGreaterThan(20);
    expect(MEMBERS_CONTRACT).toHaveLength(6);
  });
});
