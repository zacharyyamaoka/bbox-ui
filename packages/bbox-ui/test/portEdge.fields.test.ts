import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { defaultArgs, toArgTypes } from "@bbox-ui/schema";

import { PORT_EDGE_FIELDS, PORT_EDGE_PRESETS } from "../src/portEdge.fields";
import { PortEdge } from "../src/portEdge";
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
  const el = portEdgeElement({ ...props, children: createElement("span", childProps) });
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
