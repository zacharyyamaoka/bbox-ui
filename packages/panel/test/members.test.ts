import { describe, expect, it } from "vitest";
import type { Instance } from "../src/bench";
import { BLOCK_SLOTS, INITIAL_BENCHES, MEMBER_SPECS, MIXED_BENCH, REGISTRY, makeInstanceWithSlots } from "../src/bench";
import {
  addMemberTo,
  addableTypes,
  ancestry,
  depthOf,
  instanceTree,
  isSlotFill,
  memberSpecFor,
  moveIndex,
  moveMember,
  reparent,
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
  it("reparent moves an id between lists, to a root, or into a list at an index — never into its own subtree", () => {
    const out = reparent(bench, "port-3", "block-2", 0);
    expect(out.find((i) => i.id === "stack-1")?.members).toEqual(["block-2"]);
    expect(out.find((i) => i.id === "block-2")?.members).toEqual(["port-3", "pill-4"]);
    const rooted = reparent(bench, "pill-4", null, 0);
    expect(rooted.find((i) => i.id === "block-2")?.members).toEqual([]);
    expect(topLevel(rooted).map((i) => i.id)).toContain("pill-4");
    const adopted = reparent(bench, "port-9", "stack-1", 1);
    expect(adopted.find((i) => i.id === "stack-1")?.members).toEqual(["block-2", "port-9", "port-3"]);
    expect(reparent(bench, "stack-1", "block-2", 0)).toBe(bench);
    expect(reparent(bench, "stack-1", "stack-1", 0)).toBe(bench);
  });
  it("instanceTree marks containers by what the registry says they can hold, not by emptiness", () => {
    const tree = instanceTree([inst("s", "Stack"), inst("p", "Port"), inst("b", "Block", {}, ["f"]), inst("f", "Flex", {}, [])], REGISTRY);
    expect(tree.map((n) => [n.type, n.container])).toEqual([
      ["Stack", true],
      ["Port", false],
      ["Block", false],
    ]);
    expect(tree[2]!.children[0]).toMatchObject({ type: "Flex", container: true });
  });
  it("instanceTree nests members under their roots with titles", () => {
    const tree = instanceTree(bench);
    expect(tree.map((n) => n.id)).toEqual(["stack-1", "port-9"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["block-2", "port-3"]);
    expect(tree[0]!.children[0]!.children[0]).toMatchObject({ id: "pill-4", title: "Pill 1", untitled: true });
    expect(tree[0]!.children[1]).toMatchObject({ title: "goal", badge: "wired" });
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
  it("a fresh bench holds one root (two on the mixed bench); anything else is a slot fill", () => {
    for (const [name, list] of Object.entries(INITIAL_BENCHES)) {
      expect(topLevel(list).length, name).toBe(name === MIXED_BENCH ? 2 : 1);
      for (const inst of list) if (!topLevel(list).includes(inst)) expect(isSlotFill(inst), inst.id).toBe(true);
    }
  });
});

describe("slots — a Block arrives with its anatomy filled", () => {
  it("makes the instance plus one Flex per slot, in slot order, with the slot's starting props", () => {
    const made = makeInstanceWithSlots("Block", 0, 10);
    expect(made).toHaveLength(1 + BLOCK_SLOTS.length);
    expect(made[0]!.members).toEqual(made.slice(1).map((f) => f.id));
    expect(made.slice(1).map((f) => f.slot?.id)).toEqual(BLOCK_SLOTS.map((s) => s.id));
    expect(made.slice(1).every((f) => f.type === "Flex")).toBe(true);
    const right = made.find((f) => f.slot?.id === "header.right")!;
    expect(right.props.justify).toBe("end");
    const body = made.find((f) => f.slot?.id === "body")!;
    expect(body.props.direction).toBe("column");
    // Ids are drawn from uid upward, so the caller advances uid by the length.
    expect(new Set(made.map((m) => m.id)).size).toBe(made.length);
  });
  it("a leaf makes just itself", () => {
    expect(makeInstanceWithSlots("Port", 0, 3)).toHaveLength(1);
  });
  it("a slot narrows what its fill accepts; the fill is named after the slot", () => {
    const made = makeInstanceWithSlots("Block", 0, 0);
    const flex = REGISTRY.find((e) => e.name === "Flex")!;
    const body = made.find((f) => f.slot?.id === "body")!;
    const left = made.find((f) => f.slot?.id === "header.left")!;
    expect(memberSpecFor(flex, body)?.accepts).toEqual(["Flex"]);
    expect(memberSpecFor(flex, left)?.accepts).toEqual(MEMBER_SPECS.Flex.accepts);
    expect(summarize(made, left.id)?.title).toBe("Header · left");
  });
  it("Block declares slots and no members list of its own; Flex declares members", () => {
    expect(REGISTRY.find((e) => e.name === "Block")?.slots).toBe(BLOCK_SLOTS);
    expect(REGISTRY.find((e) => e.name === "Block")?.members).toBeUndefined();
    expect(REGISTRY.find((e) => e.name === "Flex")?.members).toBe(MEMBER_SPECS.Flex);
  });
});

describe("the control", () => {
  it("is List, and only List — Zach's pick of the five babbled on 2026-09-11", () => {
    expect(MEMBERS_CONTROLS.map((c) => c.id)).toEqual(["list"]);
    expect(MEMBERS_CONTRACT).toHaveLength(6);
  });
});
