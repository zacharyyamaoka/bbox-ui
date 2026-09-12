import { describe, expect, it } from "vitest";
import { DEFAULT_ARRANGEMENT, evenT, type Arrangement } from "@bbox-ui/core";
import type { Instance } from "../src/bench";
import { BAR_SLOTS, BLOCK_SLOTS, INITIAL_BENCHES, MEMBER_SPECS, MIXED_BENCH, REGISTRY, makeInstance, makeInstanceWithSlots } from "../src/bench";
import {
  activeArrangement,
  addMemberTo,
  addableTypes,
  ancestry,
  blockPorts,
  depthOf,
  effectiveProps,
  inheritedFor,
  instanceTree,
  isSlotFill,
  memberSpecFor,
  moveIndex,
  moveMember,
  portPlacementsOf,
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
  it("remove also prunes the removed port out of its Block's grouping assignments, leaving the rest", () => {
    const grouped: Arrangement = {
      ...DEFAULT_ARRANGEMENT,
      grouping: {
        id: "variadic-set",
        label: "variadic",
        collapsed: true,
        assignments: { args: { group: "variadic", groupOrder: 1 }, kwargs: { group: "variadic", groupOrder: 2 } },
      },
    };
    const withGroups: Instance[] = [
      { ...inst("block-1", "Block", {}, ["args", "kwargs"]), arrangements: [grouped], arrangement: grouped.id },
      inst("args", "Port"),
      inst("kwargs", "Port"),
    ];
    const removed = removeMember(withGroups, "args");
    expect(removed.find((i) => i.id === "block-1")?.members).toEqual(["kwargs"]);
    // The stale "args" entry must not survive — only "kwargs" remains.
    expect(removed.find((i) => i.id === "block-1")?.arrangements?.[0]?.grouping?.assignments).toEqual({
      kwargs: { group: "variadic", groupOrder: 2 },
    });
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
      // A Block IS a container now (Zach, 2026-09-12): it declares
      // `members` (its Ports) alongside its slots.
      ["Block", true],
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
  it("a fresh bench holds one root (two on the mixed bench); anything else is a slot fill or one of the Block's seeded Ports", () => {
    for (const [name, list] of Object.entries(INITIAL_BENCHES)) {
      expect(topLevel(list).length, name).toBe(name === MIXED_BENCH ? 2 : 1);
      for (const inst of list)
        if (!topLevel(list).includes(inst)) expect(isSlotFill(inst) || inst.type === "Port", inst.id).toBe(true);
    }
  });
});

describe("slots — a Block arrives with its anatomy filled, two levels deep", () => {
  it("makes the Block, a Bar per end, a Flex per Bar cell and the body Flex — ten instances", () => {
    const made = makeInstanceWithSlots("Block", 0, 10);
    expect(made).toHaveLength(10);
    const block = made[0]!;
    const byId = new Map(made.map((m) => [m.id, m]));
    expect(block.members!.map((id) => byId.get(id)!.slot?.id)).toEqual(BLOCK_SLOTS.map((s) => s.id));
    const header = byId.get(block.members![0]!)!;
    const body = byId.get(block.members![1]!)!;
    const footer = byId.get(block.members![2]!)!;
    expect([header.type, body.type, footer.type]).toEqual(["Bar", "Flex", "Bar"]);
    expect(header.members!.map((id) => byId.get(id)!.slot?.id)).toEqual(BAR_SLOTS.map((s) => s.id));
    expect(byId.get(header.members![2]!)!.props.justify).toBe("end");
    expect(body.props.direction).toBe("column");
    expect(new Set(made.map((m) => m.id)).size).toBe(made.length);
  });
  it("a leaf makes just itself", () => {
    expect(makeInstanceWithSlots("Port", 0, 3)).toHaveLength(1);
  });
  it("a slot narrows what its fill accepts; a fill is named after its slot", () => {
    const made = makeInstanceWithSlots("Block", 0, 0);
    const byId = new Map(made.map((m) => [m.id, m]));
    const flex = REGISTRY.find((e) => e.name === "Flex")!;
    const body = made.find((f) => f.slot?.id === "body")!;
    const header = byId.get(made[0]!.members![0]!)!;
    const left = byId.get(header.members![0]!)!;
    expect(memberSpecFor(flex, body)?.accepts).toEqual(["Flex"]);
    expect(memberSpecFor(flex, left)?.accepts).toEqual(MEMBER_SPECS.Flex.accepts);
    expect(summarize(made, header.id)?.title).toBe("Header");
    expect(summarize(made, left.id)?.title).toBe("Left");
  });
  it("Block declares slots AND members (its own Ports); Bar declares slots and no members; Flex declares members", () => {
    expect(REGISTRY.find((e) => e.name === "Block")?.slots).toBe(BLOCK_SLOTS);
    expect(REGISTRY.find((e) => e.name === "Bar")?.slots).toBe(BAR_SLOTS);
    expect(REGISTRY.find((e) => e.name === "Block")?.members).toBe(MEMBER_SPECS.Block);
    expect(REGISTRY.find((e) => e.name === "Bar")?.members).toBeUndefined();
    expect(REGISTRY.find((e) => e.name === "Flex")?.members).toBe(MEMBER_SPECS.Flex);
  });
});

describe("size cascades down the tree", () => {
  const made = makeInstanceWithSlots("Block", 0, 0);
  const byId = new Map(made.map((m) => [m.id, m]));
  const header = byId.get(made[0]!.members![0]!)!;
  const left = byId.get(header.members![0]!)!;
  const glyph = inst("glyph-99", "Glyph", {});
  const bench = [...made.map((m) => (m.id === left.id ? { ...m, members: [glyph.id] } : m)), glyph];

  it("a header set to xl reaches the Glyph two levels down, naming the header", () => {
    const withXl = bench.map((m) => (m.id === header.id ? { ...m, props: { ...m.props, size: "xl" } } : m));
    expect(inheritedFor(withXl, REGISTRY, glyph.id).size).toEqual({ value: "xl", from: header.id, fromLabel: "Header" });
    expect(effectiveProps(withXl, REGISTRY, glyph).size).toBe("xl");
  });
  it("a Flex between them with its own size overrides and relays it", () => {
    const withBoth = bench.map((m) =>
      m.id === header.id ? { ...m, props: { ...m.props, size: "xl" } } : m.id === left.id ? { ...m, props: { ...m.props, size: "sm" } } : m,
    );
    expect(inheritedFor(withBoth, REGISTRY, glyph.id).size).toMatchObject({ value: "sm", from: left.id });
  });
  it("a bar with nothing set relays its default; an own value on the leaf wins in what is drawn", () => {
    expect(inheritedFor(bench, REGISTRY, glyph.id).size).toMatchObject({ value: "md", from: header.id });
    const own = bench.map((m) => (m.id === glyph.id ? { ...m, props: { size: "lg" } } : m));
    expect(effectiveProps(own, REGISTRY, byId.get(glyph.id) ?? own.find((m) => m.id === glyph.id)!).size).toBe("lg");
  });
  it("a field that does not cascade is untouched", () => {
    expect(inheritedFor(bench, REGISTRY, glyph.id).padding).toBeUndefined();
  });
});

describe("a Block's Ports (Zach, 2026-09-12): members, active Arrangement, per-arrangement placements", () => {
  const block: Instance = { ...inst("block-1", "Block", {}, ["bar-h", "flex-b", "bar-f", "port-in", "port-out"]), arrangements: [DEFAULT_ARRANGEMENT], arrangement: "default" };
  const bench: Instance[] = [
    block,
    inst("bar-h", "Bar"),
    inst("flex-b", "Flex"),
    inst("bar-f", "Bar"),
    { ...inst("port-in", "Port", { children: "in" }), placements: { default: { edge: "left", order: 0, t: 0.5 } } },
    inst("port-out", "Port", { children: "out" }),
  ];

  it("blockPorts returns only the Port members, in member order — never the slot fills", () => {
    expect(blockPorts(bench, "block-1").map((p) => p.id)).toEqual(["port-in", "port-out"]);
    expect(blockPorts(bench, "does-not-exist")).toEqual([]);
  });

  it("activeArrangement resolves the Block's own `arrangement` id, and falls back to DEFAULT_ARRANGEMENT", () => {
    expect(activeArrangement(block)).toBe(DEFAULT_ARRANGEMENT);
    const custom: Arrangement = { ...DEFAULT_ARRANGEMENT, id: "hover", label: "Hover" };
    expect(activeArrangement({ ...block, arrangements: [DEFAULT_ARRANGEMENT, custom], arrangement: "hover" })).toBe(custom);
    // A stale/typo'd id falls back to the first arrangement, never throws.
    expect(activeArrangement({ ...block, arrangement: "missing" })).toBe(DEFAULT_ARRANGEMENT);
    expect(activeArrangement({ ...block, arrangements: undefined, arrangement: undefined })).toBe(DEFAULT_ARRANGEMENT);
  });

  it("portPlacementsOf fills in defaultPlacement for a port with nothing stored yet, and never mutates its input", () => {
    const ports = blockPorts(bench, "block-1");
    const before = JSON.stringify(ports.map((p) => p.placements));
    const placements = portPlacementsOf(block, ports, "default");
    expect(placements["port-in"]).toEqual({ edge: "left", order: 0, t: 0.5 });
    // port-out had nothing stored: parked on the arrangement's first live
    // edge (top), appended after port-in (which is on "left", not "top") —
    // so it lands at order 0 on "top", not stacked behind port-in.
    expect(placements["port-out"]).toEqual({ edge: "top", order: 0, t: 0 });
    expect(JSON.stringify(ports.map((p) => p.placements))).toBe(before);
  });

  it("portPlacementsOf must be called with the Block's FULL port list — a truncated `ports` argument silently loses siblings already on the same edge (inspector-column.tsx:91's bug)", () => {
    // port-in is already stored on "top". A brand-new, not-yet-placed
    // sibling (no `placements` entry, matching a fresh `addMember`) must
    // append AFTER it when the caller passes every Port on the Block —
    // exactly what render-instance.tsx does via blockPorts(). Passing
    // only the new port, as inspector-column.tsx wrongly did, hides
    // port-in from `defaultPlacement`'s `out` accumulator entirely, so it
    // computes order 0 instead of 1: the same not-yet-stored port gets a
    // DIFFERENT answer depending only on how much of the list its caller
    // bothered to pass in.
    const onTop: Instance = { ...inst("port-on-top", "Port", { children: "on-top" }), placements: { default: { edge: "top", order: 0, t: 0 } } };
    const fresh: Instance = inst("port-fresh", "Port", { children: "fresh" });
    const fullList = portPlacementsOf(block, [onTop, fresh], "default");
    expect(fullList["port-fresh"]).toEqual({ edge: "top", order: 1, t: expect.any(Number) });
    const truncatedList = portPlacementsOf(block, [fresh], "default");
    expect(truncatedList["port-fresh"]).toEqual({ edge: "top", order: 0, t: 0 });
    // The divergence itself, spelled out: same Block, same arrangement,
    // same not-yet-placed port — different `order` depending only on
    // whether its siblings were included. A caller MUST pass the full
    // list (blockPorts(all, blockId)), never a subset built around one
    // selected port.
    expect(fullList["port-fresh"]!.order).not.toBe(truncatedList["port-fresh"]!.order);
  });

  it("portPlacementsOf gives a locked port its fixed corner placement, ignoring anything stored", () => {
    const lockedPort: Instance = { ...inst("port-fn", "Port"), locked: true, placements: { default: { edge: "bottom", order: 3, t: 0.9 } } };
    expect(portPlacementsOf(block, [lockedPort], "default")).toEqual({ "port-fn": { edge: "top", order: 0, t: 0 } });
  });

  it("a fresh Block (makeInstance) already carries the default Arrangement, active", () => {
    const fresh = makeInstance("Block", 0, 999);
    expect(fresh.arrangements).toEqual([DEFAULT_ARRANGEMENT]);
    expect(fresh.arrangement).toBe("default");
    expect(activeArrangement(fresh)).toBe(DEFAULT_ARRANGEMENT);
  });

  it("the bench's real seed opens with two Ports on the left and one on the right, matching evenT", () => {
    const seeded = INITIAL_BENCHES.Block!;
    const seedBlock = seeded[0]!;
    const ports = blockPorts(seeded, seedBlock.id);
    expect(ports.map((p) => p.props.children)).toEqual(["in", "cfg", "out"]);
    const placements = portPlacementsOf(seedBlock, ports, "default");
    expect(placements[ports[0]!.id]).toEqual({ edge: "left", order: 0, t: evenT(2, "evenly")[0] });
    expect(placements[ports[1]!.id]).toEqual({ edge: "left", order: 1, t: evenT(2, "evenly")[1] });
    expect(placements[ports[2]!.id]).toEqual({ edge: "right", order: 0, t: evenT(1, "evenly")[0] });
  });
});

describe("the control", () => {
  it("is List, and only List — Zach's pick of the five babbled on 2026-09-11", () => {
    expect(MEMBERS_CONTROLS.map((c) => c.id)).toEqual(["list"]);
    expect(MEMBERS_CONTRACT).toHaveLength(6);
  });
});
