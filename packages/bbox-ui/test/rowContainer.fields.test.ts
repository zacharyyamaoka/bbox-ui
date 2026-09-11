import { describe, expect, it } from "vitest";
import { assertDisjointPresets, defaultArgs, toArgTypes } from "@bbox-ui/schema";
import { ROW_CONTAINER_FIELDS, ROW_CONTAINER_PRESETS } from "../src/rowContainer.fields";
import {
  RowContainer,
  READING_DIRECTIONS,
  ROW_ALIGN_VALUES,
  ROW_JUSTIFY_VALUES,
} from "../src/rowContainer";

/**
 * `RowContainer` uses no hooks — calling it directly, as a plain function,
 * returns the exact element tree it would render, with every default
 * already applied by its own `= "..."` destructuring. Reading defaults off
 * THIS (not off a hand-retyped literal) is what makes this file fail the
 * moment `rowContainer.tsx`'s real default changes — T0's own
 * `port.fields.test.ts` pattern.
 */
function rowElement(props: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (RowContainer as any)(props);
}

function field(id: string) {
  const found = ROW_CONTAINER_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no ROW_CONTAINER_FIELDS entry for "${id}"`);
  return found;
}

const bare = rowElement();

describe("ROW_CONTAINER_FIELDS", () => {
  it("has exactly RowContainer's five real props, in panel order", () => {
    expect(ROW_CONTAINER_FIELDS.map((f) => f.id)).toEqual([
      "readingDirection",
      "justify",
      "align",
      "height",
      "gap",
    ]);
  });

  it("readingDirection's declared default equals RowContainer's real default (data-reading-direction)", () => {
    expect(field("readingDirection").defaultValue).toBe(bare.props["data-reading-direction"]);
    expect(bare.props.style.flexDirection).toBe("row");
  });

  it("justify's declared default equals RowContainer's real default (data-justify)", () => {
    expect(field("justify").defaultValue).toBe(bare.props["data-justify"]);
    expect(bare.props.style.justifyContent).toBe("flex-start");
  });

  it("align's declared default equals RowContainer's real default (data-align)", () => {
    expect(field("align").defaultValue).toBe(bare.props["data-align"]);
    expect(bare.props.style.alignItems).toBe("center");
  });

  it("height's declared default (0 = hug contents) renders NO explicit height style", () => {
    expect(field("height").defaultValue).toBe(0);
    expect(bare.props.style.height).toBeUndefined();
  });

  it("a non-zero height renders as an explicit pixel value", () => {
    const tall = rowElement({ height: 120 });
    expect(tall.props.style.height).toBe(120);
  });

  it("gap's declared default equals RowContainer's real rendered gap style", () => {
    expect(field("gap").defaultValue).toBe(bare.props.style.gap);
  });

  it("readingDirection flips flexDirection to row-reverse without ever reordering DOM children", () => {
    const rtl = rowElement({ readingDirection: "rtl", children: ["a", "b"] });
    expect(rtl.props.style.flexDirection).toBe("row-reverse");
    expect(rtl.props.children).toEqual(["a", "b"]);
  });

  it("justify maps every real value to its CSS justify-content equivalent", () => {
    expect(rowElement({ justify: "center" }).props.style.justifyContent).toBe("center");
    expect(rowElement({ justify: "end" }).props.style.justifyContent).toBe("flex-end");
    expect(rowElement({ justify: "between" }).props.style.justifyContent).toBe("space-between");
  });

  it("align maps every real value to its CSS align-items equivalent", () => {
    expect(rowElement({ align: "top" }).props.style.alignItems).toBe("flex-start");
    expect(rowElement({ align: "bottom" }).props.style.alignItems).toBe("flex-end");
  });

  it("readingDirection's options are exactly the real ReadingDirection union", () => {
    expect(field("readingDirection").options?.map((o) => o.value)).toEqual(READING_DIRECTIONS);
  });

  it("justify's options are exactly the real RowJustify union", () => {
    expect(field("justify").options?.map((o) => o.value)).toEqual(ROW_JUSTIFY_VALUES);
  });

  it("align's options are exactly the real RowAlign union", () => {
    expect(field("align").options?.map((o) => o.value)).toEqual(ROW_ALIGN_VALUES);
  });

  it("defaultArgs mirrors every field's own declared defaultValue, one entry per field", () => {
    expect(defaultArgs(ROW_CONTAINER_FIELDS)).toEqual({
      readingDirection: field("readingDirection").defaultValue,
      justify: field("justify").defaultValue,
      align: field("align").defaultValue,
      height: field("height").defaultValue,
      gap: field("gap").defaultValue,
    });
  });

  it("toArgTypes maps every segments field to a select control and number fields to number", () => {
    const argTypes = toArgTypes(ROW_CONTAINER_FIELDS);
    expect(argTypes.readingDirection.control).toBe("select");
    expect(argTypes.justify.control).toBe("select");
    expect(argTypes.align.control).toBe("select");
    expect(argTypes.height.control).toBe("number");
    expect(argTypes.gap.control).toBe("number");
  });

  it("has no `children` entry — it is structural (ReactNode[]), not a FieldValue", () => {
    expect(ROW_CONTAINER_FIELDS.find((f) => f.id === "children")).toBeUndefined();
  });

  it("carries no presets — RowContainer paints nothing of its own (T1-SPEC.md §4.4)", () => {
    expect(ROW_CONTAINER_PRESETS).toEqual([]);
    expect(() => assertDisjointPresets(ROW_CONTAINER_PRESETS)).not.toThrow();
  });
});
