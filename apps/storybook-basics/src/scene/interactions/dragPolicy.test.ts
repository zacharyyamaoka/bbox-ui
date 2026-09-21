/**
 * Unit cover for the policy predicates. Pure — no DOM, no React, runs in
 * the `unit` project (`pnpm exec vitest --project=unit run`).
 *
 * The DOM half (`grabChain.ts`) is covered by a story play function
 * instead, because a walk over real elements is exactly the thing a
 * synthetic fixture would get wrong.
 */

import { describe, expect, it } from "vitest";

import {
  CANVAS_DRAG_INTENT_COARSE_PX,
  CANVAS_DRAG_INTENT_PX,
  DRAG_DECLARATIONS,
  INNER_CLAIM_PX,
  narrowRole,
  POLICY_TABLE,
  resolveClick,
  resolveGrab,
  UNDECLARED_ROLE,
  type GrabChainLink,
} from "./dragPolicy";

const link = (partial: Partial<GrabChainLink>): GrabChainLink => ({ ...partial });

describe("narrowRole — a parent may only narrow", () => {
  it("lets a parent reduce a grab surface to inert", () => {
    expect(narrowRole("grab", "inert")).toBe("inert");
  });
  it("lets a parent reduce anything to owns-pointer", () => {
    expect(narrowRole("grab", "owns-pointer")).toBe("owns-pointer");
    expect(narrowRole("inert", "owns-pointer")).toBe("owns-pointer");
  });
  it("REFUSES to widen — the whole point of the lattice", () => {
    expect(narrowRole("owns-pointer", "grab")).toBe("owns-pointer");
    expect(narrowRole("owns-pointer", "inert")).toBe("owns-pointer");
    expect(narrowRole("inert", "grab")).toBe("inert");
  });
  it("is identity with no override", () => {
    expect(narrowRole("grab", undefined)).toBe("grab");
  });
});

describe("resolveGrab — nearest declaration wins", () => {
  it("reads a named part off the declaration that owns it", () => {
    const r = resolveGrab([link({ slot: "block-header" }), link({ declares: "block:expanded" })]);
    expect(r.role).toBe("grab");
    expect(r.via).toBe("block-header");
  });

  it("falls back to `face` for an unnamed part", () => {
    const r = resolveGrab([link({ slot: "some-unlisted-thing" }), link({ declares: "block:expanded" })]);
    expect(r.role).toBe("inert");
    expect(r.via).toBe("face");
  });

  it("makes an expanded Block's interior inert but a solid Block's face grabbable", () => {
    expect(resolveGrab([link({}), link({ declares: "block:expanded" })]).role).toBe("inert");
    expect(resolveGrab([link({}), link({ declares: "block:solid" })]).role).toBe("grab");
  });

  /**
   * The measured React Flow bug, as a regression test. With
   * `dragHandle: '[data-slot="block-header"]'`, `hasSelector` walks to the
   * node root and matches the child's header, so the PARENT drags
   * (measured: `kid`'s header moved `proc` 40.8px). Here the member's own
   * declaration stops the walk first.
   */
  it("stops at a member's own declaration, so a child's header never drags the parent", () => {
    const chain = [
      link({ slot: "block-header" }),
      link({ declares: "block:solid" }), // the member declares itself
      link({ slot: "block-member" }),
      link({ declares: "block:expanded" }), // the parent never gets asked
    ];
    const r = resolveGrab(chain);
    expect(r.owner).toBe(DRAG_DECLARATIONS["block:solid"].component);
    expect(r.owner).not.toBe(DRAG_DECLARATIONS["block:expanded"].component);
  });

  it("keeps a port dot out of the host's hands on every block view", () => {
    for (const key of ["block:expanded", "block:solid", "value", "port"] as const) {
      expect(resolveGrab([link({ slot: "port-dot" }), link({ declares: key })]).role).toBe("owns-pointer");
    }
  });

  /** Zach's own rule, `Components/DP - Port.md:190`: the text is a grab
   *  target, the dot stays the cable handle. */
  it("makes a port's TEXT grabbable while its DOT is not", () => {
    expect(resolveGrab([link({ slot: "port-label-display" }), link({ declares: "port" })]).role).toBe("grab");
    expect(resolveGrab([link({ slot: "port-dot" }), link({ declares: "port" })]).role).toBe("owns-pointer");
  });

  it("applies a parent narrowing collected on the way out", () => {
    const r = resolveGrab([link({ slot: "block-header" }), link({ narrow: "inert" }), link({ declares: "block:expanded" })]);
    expect(r.role).toBe("inert");
  });

  it("cannot be widened by a parent narrowing", () => {
    const r = resolveGrab([link({ slot: "code-editor" }), link({ narrow: "grab" }), link({ declares: "block:expanded" })]);
    expect(r.role).toBe("owns-pointer");
  });

  it("defaults an undeclared surface to inert, never to grab", () => {
    const r = resolveGrab([link({ slot: "mystery" }), link({})]);
    expect(r.role).toBe(UNDECLARED_ROLE);
    expect(r.role).not.toBe("grab");
    expect(r.owner).toBeNull();
  });

  it("treats a Bar as a grab band whose controls own their own press", () => {
    expect(resolveGrab([link({ slot: "bar" }), link({ declares: "bar" })]).role).toBe("grab");
    expect(resolveGrab([link({ slot: "button" }), link({ declares: "bar" })]).role).toBe("owns-pointer");
    expect(resolveGrab([link({ slot: "toggle" }), link({ declares: "bar" })]).role).toBe("owns-pointer");
  });

  /** Donor: a drag across text moves the Block; only the OPEN field owns
   *  the pointer (blockClickToEdit.ts:131-135, BlockInlineEditor:516-518). */
  it("makes editable text a grab surface at rest and pointer-owning while open", () => {
    expect(resolveGrab([link({}), link({ declares: "editable-text" })]).role).toBe("grab");
    expect(resolveGrab([link({}), link({ declares: "editable-text:editing" })]).role).toBe("owns-pointer");
  });

  it("flips a folded Block back to a solid face", () => {
    expect(resolveGrab([link({}), link({ declares: "block:folded" })]).role).toBe("grab");
  });
});

describe("resolveClick — the donor's one rule", () => {
  const expanded = DRAG_DECLARATIONS["block:expanded"];
  const grabHeader = resolveGrab([link({ slot: "block-header" }), link({ declares: "block:expanded" })]);
  const inertBody = resolveGrab([link({}), link({ declares: "block:expanded" })]);

  it("activates and does nothing else on the first click", () => {
    expect(resolveClick(grabHeader, { wasActive: false, declaration: expanded })).toEqual({ kind: "activate" });
  });

  it("edits the part under the pointer once already active", () => {
    expect(resolveClick(grabHeader, { wasActive: true, declaration: expanded })).toEqual({ kind: "edit", part: "block-header" });
  });

  /** "A miss stays a miss" — inlineBlockEditing.ts:362-368. */
  it("keeps a miss a miss: an active block clicked on a non-editable part opens nothing", () => {
    expect(resolveClick(inertBody, { wasActive: true, declaration: expanded })).toEqual({ kind: "keep-active" });
  });

  it("never involves the host on a pointer-owning surface", () => {
    const owned = resolveGrab([link({ slot: "code-editor" }), link({ declares: "block:expanded" })]);
    expect(resolveClick(owned, { wasActive: false, declaration: expanded })).toEqual({ kind: "not-ours" });
    expect(resolveClick(owned, { wasActive: true, declaration: expanded })).toEqual({ kind: "not-ours" });
  });
});

describe("thresholds carry their provenance and their ordering", () => {
  /** tldraw's `dragDistanceSquared: 16` → 4px, read on disk at
   *  @tldraw/editor 5.3.2 options.js:36. */
  it("uses tldraw's own 4px for the canvas", () => {
    expect(CANVAS_DRAG_INTENT_PX).toBe(4);
    expect(CANVAS_DRAG_INTENT_PX * CANVAS_DRAG_INTENT_PX).toBe(16);
  });

  /** `coarseDragDistanceSquared: 36` → 6px, options.js:34. */
  it("uses tldraw's own 6px for a coarse pointer", () => {
    expect(CANVAS_DRAG_INTENT_COARSE_PX).toBe(6);
    expect(CANVAS_DRAG_INTENT_COARSE_PX * CANVAS_DRAG_INTENT_COARSE_PX).toBe(36);
  });

  /**
   * The ordering is the load-bearing part, not the values: the inner,
   * more specific owner must arm STRICTLY FIRST or the canvas claims every
   * contested press. Donor's own words at memberStackDnd.tsx:89-94.
   * bbox-ui currently has this INVERTED (React Flow's default
   * nodeDragThreshold is 1 while its dnd-kit rails arm at 4).
   */
  it("arms the inner owner strictly before the canvas", () => {
    expect(INNER_CLAIM_PX).toBeLessThan(CANVAS_DRAG_INTENT_PX);
    expect(INNER_CLAIM_PX).toBeLessThan(CANVAS_DRAG_INTENT_COARSE_PX);
  });
});

describe("the story table is the same source the predicates read", () => {
  it("covers every gesture Zach named in the ask", () => {
    const text = POLICY_TABLE.map((row) => row.gesture).join(" | ").toLowerCase();
    for (const needle of ["hover", "past the threshold", "already active", "second press-and-drag", "double click"]) {
      expect(text).toContain(needle);
    }
  });

  it("states the cold-drag requirement in the row that carries it", () => {
    const cold = POLICY_TABLE.find((row) => row.gesture.includes("cold"));
    expect(cold).toBeDefined();
    expect(cold!.onGrab).toMatch(/no prior selection/i);
  });
});
