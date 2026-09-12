import { describe, expect, it } from "vitest";
import { FLEX_FIELDS, FLEX_PRESETS } from "../src/flex.fields";
import { Flex, FLEX_ALIGN_VALUES, FLEX_DIRECTIONS, FLEX_JUSTIFY_VALUES } from "../src/flex";

/** Flex uses no hooks: called as a plain function it returns the element
 *  it would render with every default applied — the port.fields pattern. */
function flexElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Flex as any)(props);
}
const field = (id: string) => {
  const f = FLEX_FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(`no FLEX_FIELDS entry for "${id}"`);
  return f;
};
const bare = flexElement();

describe("FLEX_FIELDS", () => {
  it("has exactly Flex's six real props, in panel order", () => {
    expect(FLEX_FIELDS.map((f) => f.id)).toEqual(["direction", "justify", "align", "gap", "padding", "wrap"]);
  });
  it("every default equals the component's own default", () => {
    expect(field("direction").defaultValue).toBe(bare.props["data-direction"]);
    expect(field("justify").defaultValue).toBe(bare.props["data-justify"]);
    expect(field("align").defaultValue).toBe(bare.props["data-align"]);
    expect(field("gap").defaultValue).toBe(bare.props.style.gap);
    expect(field("padding").defaultValue).toBe(bare.props.style.padding);
    expect(field("wrap").defaultValue).toBe(bare.props.style.flexWrap === "wrap");
  });
  it("option sets are the component's own unions, verbatim and in order", () => {
    expect(field("direction").options!.map((o) => o.value)).toEqual([...FLEX_DIRECTIONS]);
    expect(field("justify").options!.map((o) => o.value)).toEqual([...FLEX_JUSTIFY_VALUES]);
    expect(field("align").options!.map((o) => o.value)).toEqual([...FLEX_ALIGN_VALUES]);
  });
  it("gap and padding pair on one row; presets are empty, never absent", () => {
    expect(field("gap").group).toBe("spacing");
    expect(field("padding").group).toBe("spacing");
    expect(FLEX_PRESETS).toEqual([]);
  });
  it("column direction and the three spacing schemes reach the style", () => {
    const el = flexElement({ direction: "column", justify: "evenly", align: "stretch", wrap: true });
    expect(el.props.style.flexDirection).toBe("column");
    expect(el.props.style.justifyContent).toBe("space-evenly");
    expect(el.props.style.alignItems).toBe("stretch");
    expect(el.props.style.flexWrap).toBe("wrap");
  });
});
