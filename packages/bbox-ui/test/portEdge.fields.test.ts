import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";

import { PORT_EDGE_FIELDS, PORT_EDGE_PRESETS } from "../src/portEdge.fields";
import { PortEdge } from "../src/portEdge";
// A real Port, not a stand-in span: since 2026-09-12 the cascade stamps only
// component elements (a host element cannot take the prop) and looks
// through hosts by their children.
import { Port } from "../src/port";
import { PORT_TEXT_LAYOUTS } from "../src/port.layout";

/**
 * `PortEdge` uses no hooks — calling it directly, as a plain function,
 * returns the exact React element tree it would render, with every
 * default already applied by its own `= "..."` destructuring. Reading
 * defaults off THIS (not off a hand-retyped literal) is what makes this
 * file fail the moment `portEdge.tsx`'s real default changes — Port's own
 * `port.fields.test.ts` pattern (T0), generalized here.
 */
function portEdgeElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PortEdge as any)(props);
}

function field(id: string) {
  const found = PORT_EDGE_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no PORT_EDGE_FIELDS entry for "${id}"`);
  return found;
}

const bareEdge = portEdgeElement();

// `Children.map` over a real child element (not the default `undefined`)
// so the injected `textLayout` cascade is actually observable — the
// mapped array sits at index 0 of the root `<div>`'s own children, the
// `+N more` row (or `false`) at index 1. See `portEdge.tsx`.
function mappedChild(props: Record<string, unknown> = {}, childProps: Record<string, unknown> = {}) {
  const el = portEdgeElement({ ...props, children: createElement(Port, childProps) });
  const mapped = el.props.children[0] as unknown[];
  return mapped[0] as { props: Record<string, unknown> };
}

describe("PORT_EDGE_FIELDS", () => {
  it("has exactly PortEdge's four real props, in panel order", () => {
    expect(PORT_EDGE_FIELDS.map((f) => f.id)).toEqual([
      "edge",
      "layout",
      "textLayout",
      "hiddenCount",
    ]);
  });

  it("PortEdge has no presets — it paints nothing besides its own +N more text", () => {
    expect(PORT_EDGE_PRESETS).toEqual([]);
  });

  it('edge\'s declared default equals PortEdge\'s real default (portEdge.tsx: edge = "left")', () => {
    expect(field("edge").defaultValue).toBe(bareEdge.props["data-edge"]);
  });

  it("layout's declared default equals PortEdge's real default", () => {
    expect(field("layout").defaultValue).toBe(bareEdge.props["data-layout"]);
  });

  it("edge's options are the four real BlockSide members, left/right/top/bottom", () => {
    expect(field("edge").options?.map((o) => o.value)).toEqual([
      "left",
      "right",
      "top",
      "bottom",
    ]);
  });

  it("layout's options are exactly evenly/custom", () => {
    expect(field("layout").options?.map((o) => o.value)).toEqual(["evenly", "custom"]);
  });

  it("textLayout's options are exactly the real PortTextLayout union (port.layout.ts's own PORT_TEXT_LAYOUTS)", () => {
    expect(field("textLayout").options?.map((o) => o.value)).toEqual(PORT_TEXT_LAYOUTS);
  });

  it('textLayout\'s declared default ("right") is the real cascade value AT this table\'s own default edge ("left") — a child with no textLayout of its own reads it', () => {
    const cloned = mappedChild();
    expect(cloned.props.textLayout).toBe(field("textLayout").defaultValue);
  });

  // The gate that was missing while the bug shipped. Every test above wraps
  // its child directly, which is the one arrangement that worked; BOTH real
  // callers in this repo wrap their ports in a Fragment, and a Fragment
  // satisfies `isValidElement`, so the cascade landed on the Fragment and no
  // Port ever saw it. Driven on the deployed inspector, setting Text Layout
  // to Top, Bot, Right or Left left all three child ports painting "right".
  it("reaches a child wrapped in a Fragment — the arrangement both real callers use", () => {
    const el = portEdgeElement({
      edge: "top",
      children: createElement(Fragment, null, createElement(Port, {}), createElement(Port, {})),
    });
    const mapped = el.props.children[0] as unknown[];
    const flattened = mapped.flat(Infinity) as Array<{ props: Record<string, unknown> }>;
    expect(flattened).toHaveLength(2);
    for (const child of flattened) {
      expect(child.props.textLayout).toBe("bot");
    }
  });

  it("a Fragment-wrapped child that sets its own textLayout still wins", () => {
    const el = portEdgeElement({
      edge: "top",
      children: createElement(Fragment, null, createElement(Port, { textLayout: "left" })),
    });
    const mapped = el.props.children[0] as unknown[];
    const flattened = mapped.flat(Infinity) as Array<{ props: Record<string, unknown> }>;
    expect(flattened[0]!.props.textLayout).toBe("left");
  });

  it("looks THROUGH a host wrapper (span → component → Port) without stamping the host — the /create lane's own shape", () => {
    const Wrapper = ({ children }: { children?: unknown }) => children as never;
    const el = portEdgeElement({
      edge: "top",
      children: createElement("span", { "data-slot": "port-group" }, createElement(Wrapper, null, createElement(Port, {}))),
    });
    const mapped = el.props.children[0] as unknown[];
    const span = mapped[0] as { props: Record<string, unknown> };
    expect(span.props.textLayout).toBeUndefined();
    // `Children.map` hands back an array even for one child, so each cloned
    // level's `children` is a one-element array.
    const one = (x: unknown) => (Array.isArray(x) ? x[0] : x) as { props: Record<string, unknown> };
    const wrapper = one(span.props.children);
    expect(wrapper.props.textLayout).toBe("bot");
    const port = one(wrapper.props.children);
    expect(port.props.textLayout).toBe("bot");
  });

  it("a child that sets its own textLayout always wins over the cascade", () => {
    const cloned = mappedChild({ edge: "top" }, { textLayout: "left" });
    expect(cloned.props.textLayout).toBe("left");
  });

  it("a child with no textLayout of its own tracks whichever edge is actually in force (inwardTextLayout(edge), not a fixed value)", () => {
    expect(mappedChild({ edge: "top" }).props.textLayout).toBe("bot");
    expect(mappedChild({ edge: "bottom" }).props.textLayout).toBe("top");
    expect(mappedChild({ edge: "right" }).props.textLayout).toBe("left");
  });

  it("an explicit textLayout prop on PortEdge itself overrides the edge-derived cascade for children that didn't set their own", () => {
    expect(
      mappedChild({ edge: "left", textLayout: "top" }).props.textLayout,
    ).toBe("top");
  });

  it("hiddenCount defaults to 0, and 0 renders no +N more row", () => {
    expect(field("hiddenCount").defaultValue).toBe(0);
    expect(bareEdge.props.children[1]).toBe(false);
  });

  it("hiddenCount's min is 0 — an integer count can't go negative", () => {
    expect(field("hiddenCount").min).toBe(0);
  });

  it("hiddenCount > 0 appends its own trailing +N more row, never a cloned child", () => {
    const withHidden = portEdgeElement({ hiddenCount: 3 });
    const moreRow = withHidden.props.children[1] as { props: Record<string, unknown> };
    expect(moreRow.props["data-slot"]).toBe("port-edge-more");
    expect((moreRow.props.children as unknown[])[1]).toBe(3);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(PORT_EDGE_FIELDS)).toEqual({
      edge: field("edge").defaultValue,
      layout: field("layout").defaultValue,
      textLayout: field("textLayout").defaultValue,
      hiddenCount: field("hiddenCount").defaultValue,
    });
  });

  it("toArgTypes maps every segments field to a select control and hiddenCount to number", () => {
    const argTypes = toArgTypes(PORT_EDGE_FIELDS);
    expect(argTypes.edge.control).toBe("select");
    expect(argTypes.layout.control).toBe("select");
    expect(argTypes.textLayout.control).toBe("select");
    expect(argTypes.hiddenCount.control).toBe("number");
  });
});
