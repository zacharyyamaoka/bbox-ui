import { describe, expect, it } from "vitest";
import { assertDisjointPresets } from "@bbox-ui/schema";
import { BAR_FIELDS, BAR_PRESETS, BAR_SIZE_FIELD } from "../src/bar.fields";
import { Bar, BAR_MIN_HEIGHT, BAR_SIZES } from "../src/bar";
import { PILL_PRESETS } from "../src/pill.presets";

/** Bar uses no hooks: calling it returns the element it would render, with
 *  every default already applied — the port.fields pattern. */
function barElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Bar as any)(props);
}
const field = (id: string) => {
  const f = BAR_FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(`no BAR_FIELDS entry for "${id}"`);
  return f;
};

describe("BAR_FIELDS", () => {
  it("leads with hidden, line, size, padding, then the appearance bundle and the four line rows", () => {
    expect(BAR_FIELDS.map((f) => f.id)).toEqual([
      "hidden",
      "line",
      "size",
      "padding",
      "state",
      "tone",
      "lens",
      "lineStyle",
      "lineColor",
      "lineThickness",
      "lineOpacity",
    ]);
  });
  it("defaults match the component: visible, lined, medium, 6px", () => {
    const bare = barElement();
    expect(field("hidden").defaultValue).toBe(false);
    expect(field("line").defaultValue).toBe(true);
    expect(field("size").defaultValue).toBe(bare.props["data-size"]);
    expect(field("padding").defaultValue).toBe(6);
    expect(bare.props.style.minHeight).toBe(BAR_MIN_HEIGHT.md);
  });
  it("size is the cascading rung with the four shared names", () => {
    expect(BAR_SIZE_FIELD.cascades).toBe(true);
    expect(BAR_SIZE_FIELD.options!.map((o) => o.value)).toEqual([...BAR_SIZES]);
  });
  it("the line follows the edge: a header's at the bottom, a footer's at the top", () => {
    expect(barElement({ edge: "bottom" }).props.style.borderBottomWidth).toBe(2);
    expect(barElement({ edge: "top" }).props.style.borderTopWidth).toBe(2);
    expect(barElement({ line: false }).props.style.borderBottomWidth).toBe(0);
    expect(barElement({ lineThickness: "thick" }).props.style.borderBottomWidth).toBe(3);
  });
  it("hidden renders nothing but a marker", () => {
    const el = barElement({ hidden: true });
    expect(el.props["data-hidden"]).toBe("true");
    expect(el.props.hidden).toBe(true);
  });
  it("its line presets are Pill's state ladder narrowed to the two line fields, and disjoint", () => {
    expect(BAR_PRESETS.map((p) => p.id)).toEqual(PILL_PRESETS.map((p) => p.id));
    for (const p of BAR_PRESETS) {
      expect(p.governs).toEqual(["lineStyle", "lineColor"]);
      expect(Object.keys(p.values).sort()).toEqual(["lineColor", "lineStyle"]);
    }
    expect(() => assertDisjointPresets(BAR_PRESETS)).not.toThrow();
  });
  it("a state paints the line through the cascade; an explicit prop wins", () => {
    const wired = barElement({ state: "wired" });
    const explicit = barElement({ state: "wired", lineStyle: "dashed" });
    expect(wired.props.style.borderBottomStyle).toBe(PILL_PRESETS.find((p) => p.id === "wired")!.values.lineStyle);
    expect(explicit.props.style.borderBottomStyle).toBe("dashed");
  });
});
