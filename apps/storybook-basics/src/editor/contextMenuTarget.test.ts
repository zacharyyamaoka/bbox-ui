// Pure-function tests for `resolveContextMenuTarget` — no DOM, per this
// file's own header (`vitest.config.ts`'s "unit" project is `environment:
// "node"`). A tiny fake element graph stands in for the real
// `data-slot`/`data-*` tree these components render.

import { describe, expect, it } from "vitest";

import { resolveContextMenuTarget, type ContextMenuHitElement } from "./contextMenuTarget";

/** One node of a hand-built ancestor chain. `attrs` may include `data-slot`
 *  and any id attribute; `parent` is this node's nearest ancestor. */
interface FakeNode {
  attrs: Record<string, string>;
  parent?: FakeNode;
}

function matches(node: FakeNode, selector: string): boolean {
  // Only what this resolver's selectors ever need: a comma list of
  // `[data-slot="x"]` clauses.
  return selector.split(",").some((clause) => {
    const m = clause.trim().match(/^\[data-slot="([^"]+)"\]$/);
    if (m) return node.attrs["data-slot"] === m[1];
    const m2 = clause.trim().match(/^\[([a-z-]+)\]$/);
    if (m2) return m2[1] in node.attrs;
    throw new Error(`fake matches() cannot parse selector clause: ${clause}`);
  });
}

function fakeElement(node: FakeNode): ContextMenuHitElement {
  return {
    closest(selector: string): ContextMenuHitElement | null {
      let cursor: FakeNode | undefined = node;
      while (cursor) {
        if (matches(cursor, selector)) return fakeElement(cursor);
        cursor = cursor.parent;
      }
      return null;
    },
    getAttribute(name: string): string | null {
      return node.attrs[name] ?? null;
    },
  };
}

/** Builds an ancestor chain from outermost to innermost, returning the
 *  innermost element — what a real click's `event.target` would be. */
function chain(...nodes: Record<string, string>[]): ContextMenuHitElement {
  let parent: FakeNode | undefined;
  let current: FakeNode | undefined;
  for (const attrs of nodes) {
    current = { attrs, parent };
    parent = current;
  }
  if (!current) throw new Error("chain() needs at least one node");
  return fakeElement(current);
}

describe("resolveContextMenuTarget", () => {
  it("resolves a port dot as \"port\", even nested inside a rail inside a block", () => {
    const target = resolveContextMenuTarget(
      chain(
        { "data-slot": "region-frame", "data-region-id": "loop-1" },
        { "data-slot": "block", "data-block-id": "amp" },
        { "data-slot": "block-port-rail", "data-edge": "right" },
        { "data-slot": "block-port-item", "data-port-id": "out" },
        { "data-slot": "port-dot" },
      ),
    );
    expect(target?.kind).toBe("port");
    expect(target?.id).toBe("out");
  });

  it("resolves a labeled port's label text as \"labeled-port\", not \"port\"", () => {
    const target = resolveContextMenuTarget(
      chain({ "data-slot": "port", "data-port-id": "value" }, { "data-slot": "port-label" }),
    );
    expect(target?.kind).toBe("labeled-port");
    expect(target?.id).toBe("value");
  });

  it("resolves the rail itself (a press between dots) as \"port-edge\"", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "block-port-rail", "data-edge": "left" }));
    expect(target?.kind).toBe("port-edge");
    expect(target?.id).toBe("left");
  });

  it("resolves a bare PortEdge lane (no Block around it) as \"port-edge\"", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "port-edge-lane" }));
    expect(target?.kind).toBe("port-edge");
    expect(target?.id).toBeNull();
  });

  it("resolves a cable as \"trace\", reading the story-supplied data-trace-id", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "trace", "data-trace-id": "amp-out-to-mix-in" }));
    expect(target?.kind).toBe("trace");
    expect(target?.id).toBe("amp-out-to-mix-in");
  });

  it("resolves the block header as \"block\" — the region a press lands in is not carried onward", () => {
    const target = resolveContextMenuTarget(
      chain({ "data-slot": "block", "data-block-id": "amp" }, { "data-slot": "block-header" }),
    );
    expect(target?.kind).toBe("block");
    expect(target?.id).toBe("amp");
  });

  it("resolves the block body and footer the same way as the header", () => {
    for (const slot of ["block-body", "block-footer"]) {
      const target = resolveContextMenuTarget(
        chain({ "data-slot": "block", "data-block-id": "amp" }, { "data-slot": slot }),
      );
      expect(target?.kind).toBe("block");
    }
  });

  it("resolves a Block INSIDE a region's corner card as \"block\", not \"region-frame\"", () => {
    // The corner card carries data-block-id and no data-region-id — the
    // control-flow rule (CLAUDE.md): "the corner card IS the region's
    // interface... its ports are the region's ports".
    const target = resolveContextMenuTarget(
      chain(
        { "data-slot": "region-frame", "data-region-id": "loop-1" },
        { "data-slot": "region-corner" },
        { "data-slot": "block", "data-block-id": "loop-1" },
        { "data-slot": "block-header" },
      ),
    );
    expect(target?.kind).toBe("block");
    expect(target?.id).toBe("loop-1");
  });

  it("resolves a Block living inside an arm's free body as \"block\", not \"region-arm\"", () => {
    const target = resolveContextMenuTarget(
      chain(
        { "data-slot": "region-arm", "data-arm-id": "if-true" },
        { "data-slot": "block", "data-block-id": "child-1" },
      ),
    );
    expect(target?.kind).toBe("block");
    expect(target?.id).toBe("child-1");
  });

  it("resolves an arm's own chrome (outside any block) as \"region-arm\"", () => {
    const target = resolveContextMenuTarget(
      chain({ "data-slot": "region-arm", "data-arm-id": "if-true" }, { "data-slot": "region-arm-header" }),
    );
    expect(target?.kind).toBe("region-arm");
    expect(target?.id).toBe("if-true");
  });

  it("resolves the region frame's own chrome (outside the corner and any arm) as \"region-frame\"", () => {
    const target = resolveContextMenuTarget(
      chain({ "data-slot": "region-frame", "data-region-id": "loop-1" }, { "data-slot": "region-header-rule" }),
    );
    expect(target?.kind).toBe("region-frame");
    expect(target?.id).toBe("loop-1");
  });

  it("resolves an opaque region (no region-frame element at all) via its data-slot=\"region\" root", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "region", "data-region-id": "opaque-1" }));
    expect(target?.kind).toBe("region-frame");
    expect(target?.id).toBe("opaque-1");
  });

  it("returns null when nothing in KIND_SELECTORS matched", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "hit-probe-stage" }));
    expect(target).toBeNull();
  });

  it("returns id: null when a target kind matched but no id attribute was ever stamped", () => {
    const target = resolveContextMenuTarget(chain({ "data-slot": "trace" }));
    expect(target?.kind).toBe("trace");
    expect(target?.id).toBeNull();
  });
});
