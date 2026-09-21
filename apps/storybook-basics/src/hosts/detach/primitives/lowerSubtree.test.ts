/**
 * src/hosts/detach/primitives/lowerSubtree.test.ts — the RULING 5 property,
 * stated as a test: a composite gets a primitive for free.
 *
 * "Free" is made mechanical here rather than argued: every case below walks
 * the SAME element tree twice, changing only the REGISTRY, and asserts that
 * what gets lowered changes. Nothing that stands for a composite is edited
 * between the two walks — which is the whole claim ("by making it work on
 * the basic components a primitive so then it comes for free for the higher
 * level things"). A per-composite implementation cannot pass this file; the
 * old `definitions/block.ts` would have needed a code change to lower a new
 * part, and a registry swap would have changed nothing.
 *
 * WHY fake elements and not jsdom: this is the `unit` project
 * (`vitest.config.ts`, `environment: "node"`) and the walk itself touches
 * exactly two DOM methods — `getAttribute` and `children`. Measuring real
 * boxes is `../stockShapes.ts`'s job and is covered where it belongs, in
 * the browser stories (`../DetachToPrimitive.stories.tsx`). Keeping the
 * DISPATCH rule testable in milliseconds, with no browser, is the reason
 * `lowerSubtree` takes an `Element` read surface and never a live editor.
 */
import { describe, expect, it } from "vitest";
import type { TLShapeId, TLShapePartial } from "tldraw";

import { registryOf, type DetachablePrimitive, type PrimitiveContext } from "./detachablePrimitive";
import { lowerSubtree } from "./lowerSubtree";

/* ---------------------------------------------------------------- */
/* A minimal stand-in for painted DOM                                 */
/* ---------------------------------------------------------------- */

function el(slot: string | null, ...children: Element[]): Element {
  return {
    getAttribute: (name: string) => (name === "data-slot" ? slot : null),
    children,
  } as unknown as Element;
}

const CONTEXT = {
  editor: {} as PrimitiveContext["editor"],
  origin: el(null),
  measureRendered: () => 0,
} satisfies PrimitiveContext;

/** A primitive that paints one identifiable shape per element it meets. */
function painter(slot: string, options: { descend?: boolean; groupsSubtree?: boolean } = {}): DetachablePrimitive {
  let count = 0;
  return {
    slot,
    descend: options.descend ?? false,
    groupsSubtree: options.groupsSubtree ?? false,
    emit: () => {
      count += 1;
      return [{ id: `shape:${slot}-${count}` as TLShapeId, type: "geo" } satisfies TLShapePartial];
    },
  };
}

/** A structural primitive: paints nothing, groups what is inside it. */
function grouper(slot: string): DetachablePrimitive {
  return { slot, descend: true, groupsSubtree: true, emit: () => [] };
}

const idsOf = (shapes: TLShapePartial[]) => shapes.map((shape) => shape.id);

describe("lowerSubtree — a composite enumerates nothing", () => {
  it("lowers a part the composite never mentions, purely by registering it", () => {
    // One composite tree, standing for a Block that renders a card, a
    // header and a footer. The composite is IDENTICAL across both walks.
    const composite = el(null, el("block", el("block-header"), el("block-footer")));

    const withoutFooter = lowerSubtree(CONTEXT, composite, registryOf([painter("block", { descend: true }), painter("block-header")]));
    const withFooter = lowerSubtree(
      CONTEXT,
      composite,
      registryOf([painter("block", { descend: true }), painter("block-header"), painter("block-footer")]),
    );

    expect(idsOf(withoutFooter.shapes)).toEqual(["shape:block-1", "shape:block-header-1"]);
    // The footer appears with no change anywhere but the registry — this is
    // the exact bug-by-omission the enumerated `lowerNode` had.
    expect(idsOf(withFooter.shapes)).toEqual(["shape:block-1", "shape:block-header-1", "shape:block-footer-1"]);
  });

  it("passes straight through un-modelled chrome, at any depth", () => {
    // A rail, a flex row and a dnd boundary are all unregistered wrappers —
    // the port dot inside them still lowers.
    const composite = el(null, el("block-port-rail", el(null, el("some-dnd-boundary", el("port-dot")))));
    const lowered = lowerSubtree(CONTEXT, composite, registryOf([painter("port-dot")]));
    expect(idsOf(lowered.shapes)).toEqual(["shape:port-dot-1"]);
  });

  it("lowers a composite nested inside itself through the same primitive", () => {
    // A Block rendered as a MEMBER of a Block. One registration, two cards,
    // and no member-specific rule anywhere.
    const composite = el(null, el("block", el("block-members", el("block-member", el("block", el("block-header"))))));
    const lowered = lowerSubtree(CONTEXT, composite, registryOf([painter("block", { descend: true }), painter("block-header")]));
    expect(idsOf(lowered.shapes)).toEqual(["shape:block-1", "shape:block-2", "shape:block-header-1"]);
  });

  it("emits a container's own box before its contents, so paint order survives", () => {
    const composite = el(null, el("block", el("block-header")));
    const lowered = lowerSubtree(CONTEXT, composite, registryOf([painter("block", { descend: true }), painter("block-header")]));
    // The card is index 0 — `lowerShared.ts` stamps `shapes[0]` as the
    // rebuild anchor, so this ordering is load-bearing, not cosmetic.
    expect(lowered.shapes[0].id).toBe("shape:block-1");
  });

  it("does not walk into a leaf primitive's subtree", () => {
    // A text run accounts for its own glyphs via `textContent`; descending
    // would paint a registered child twice.
    const composite = el(null, el("block-header", el("port-dot")));
    const lowered = lowerSubtree(CONTEXT, composite, registryOf([painter("block-header"), painter("port-dot")]));
    expect(idsOf(lowered.shapes)).toEqual(["shape:block-header-1"]);
  });
});

describe("lowerSubtree — grouping", () => {
  it("groups a row that holds more than one part", () => {
    const composite = el(null, el("block-port-item", el("port-dot"), el("port-label-display")));
    const lowered = lowerSubtree(
      CONTEXT,
      composite,
      registryOf([grouper("block-port-item"), painter("port-dot"), painter("port-label-display")]),
    );
    expect(lowered.nestedRows).toEqual([{ shapeIds: ["shape:port-dot-1", "shape:port-label-display-1"] }]);
  });

  it("asks for no group when a row holds a single part", () => {
    // The collapsed (simple-view) branch: a bare dot with no label. tldraw
    // refuses a one-child group, so the row must not request one.
    const composite = el(null, el("block-port-item", el("port-dot")));
    const lowered = lowerSubtree(CONTEXT, composite, registryOf([grouper("block-port-item"), painter("port-dot")]));
    expect(lowered.nestedRows).toEqual([]);
    expect(idsOf(lowered.shapes)).toEqual(["shape:port-dot-1"]);
  });

  it("keeps the INNER row when rows nest, because grouping is one level deep", () => {
    // The documented limit in `lowerSubtree.ts`: `lowerShared.ts` executes
    // rows against live shape ids, so an outer row whose members were
    // already absorbed into an inner group would name ids that no longer
    // sit where it thinks. The guard prefers the finest unit that must move
    // together — the port row — over the coarser one.
    const composite = el(null, el("outer-row", el("block-port-item", el("port-dot"), el("port-label-display"))));
    const lowered = lowerSubtree(
      CONTEXT,
      composite,
      registryOf([grouper("outer-row"), grouper("block-port-item"), painter("port-dot"), painter("port-label-display")]),
    );
    expect(lowered.nestedRows).toHaveLength(1);
    expect(lowered.nestedRows[0].shapeIds).toEqual(["shape:port-dot-1", "shape:port-label-display-1"]);
  });

  it("groups each row separately when two rows are siblings", () => {
    const composite = el(
      null,
      el("block-port-item", el("port-dot"), el("port-label-display")),
      el("block-port-item", el("port-dot"), el("port-label-display")),
    );
    const lowered = lowerSubtree(
      CONTEXT,
      composite,
      registryOf([grouper("block-port-item"), painter("port-dot"), painter("port-label-display")]),
    );
    expect(lowered.nestedRows).toEqual([
      { shapeIds: ["shape:port-dot-1", "shape:port-label-display-1"] },
      { shapeIds: ["shape:port-dot-2", "shape:port-label-display-2"] },
    ]);
  });
});

describe("registryOf", () => {
  it("refuses two rules for one data-slot", () => {
    // Two rules for one slot is a registration bug that would otherwise
    // show up as a part quietly changing shape.
    expect(() => registryOf([painter("block"), painter("block")])).toThrow(/duplicate detach primitive/);
  });
});
