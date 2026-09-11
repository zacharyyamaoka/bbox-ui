import { describe, expect, it } from "vitest";
import type { FieldSpec } from "@bbox-ui/schema";
import { groupRows } from "../src/fieldGroups";
import { ROW_CONTAINER_FIELDS, STACK_FIELDS, TEXT_BOX_FIELDS, BLOCK_FIELDS } from "@bbox-ui/core";

const num = (id: string, group?: string): FieldSpec => ({ id, label: id, kind: "number", defaultValue: 0, group });
const text = (id: string): FieldSpec => ({ id, label: id, kind: "text", defaultValue: "" });

const ids = (rows: ReturnType<typeof groupRows>) =>
  rows.map((r) => (Array.isArray(r) ? r.map((f) => f.id) : r.id));

describe("groupRows", () => {
  it("does NOT pair two adjacent numbers that declare no group", () => {
    // The regression that motivated the change. Under the adjacency rule
    // this read [["height","gap"]].
    expect(ids(groupRows([num("height"), num("gap")]))).toEqual(["height", "gap"]);
  });

  it("RowContainer's real height and gap stay on separate rows", () => {
    const rows = ids(groupRows(ROW_CONTAINER_FIELDS));
    expect(rows).toContain("height");
    expect(rows).toContain("gap");
  });

  it("pairs a declared group even when the array separates its members", () => {
    const rows = groupRows([num("width", "size"), text("title"), num("height", "size")]);
    expect(ids(rows)).toEqual([["width", "height"], "title"]);
  });

  it("renders four in a group as two rows of two, in declaration order", () => {
    expect(ids(groupRows(TEXT_BOX_FIELDS)).filter(Array.isArray)).toEqual([
      ["paddingTop", "paddingBot"],
      ["paddingLeft", "paddingRight"],
    ]);
  });

  it("leaves an odd member on its own row after the pairs", () => {
    expect(ids(groupRows([num("a", "g"), num("b", "g"), num("c", "g")]))).toEqual([["a", "b"], "c"]);
  });

  it("never absorbs an ungrouped neighbour into a group", () => {
    expect(ids(groupRows([num("a", "g"), num("stray"), num("b", "g")]))).toEqual([["a", "b"], "stray"]);
  });

  it("the shipped groups are exactly the ones Zach asked about", () => {
    expect(ids(groupRows(STACK_FIELDS)).filter(Array.isArray)).toEqual([["gap", "gutter"]]);
    expect(ids(groupRows(BLOCK_FIELDS)).filter(Array.isArray)).toEqual([["width", "height"]]);
  });
});
