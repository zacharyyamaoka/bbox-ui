import { describe, expect, it } from "vitest";
import { assertDisjointPresets } from "@bbox-ui/schema";
import { REGION_FIELDS, REGION_KINDS } from "../src/region.fields";
import { REGION_PRESETS } from "../src/region.presets";

function field(id: string) {
  const found = REGION_FIELDS.find((f) => f.id === id);
  if (!found) throw new Error(`no REGION_FIELDS entry for "${id}"`);
  return found;
}

describe("REGION_FIELDS", () => {
  it("kind's default is 'for' and its options are exactly REGION_KINDS, in order", () => {
    expect(field("kind").defaultValue).toBe("for");
    expect(field("kind").options?.map((o) => o.value)).toEqual(REGION_KINDS);
  });

  it("width/height/radius pin the declared defaults", () => {
    expect(field("width").defaultValue).toBe(560);
    expect(field("height").defaultValue).toBe(360);
    expect(field("radius").defaultValue).toBe(8);
    expect(field("radius").min).toBe(0);
    expect(field("radius").max).toBe(32);
  });

  it("width/height share one group — the region's box is one value, not two adjacent numbers", () => {
    expect(field("width").group).toBe("layout");
    expect(field("height").group).toBe("layout");
    expect(field("radius").group).toBeUndefined();
  });
});

describe("REGION_PRESETS", () => {
  it("is empty — a Region has no view selector; it composes a Block instead", () => {
    expect(REGION_PRESETS).toEqual([]);
  });

  it("assertDisjointPresets(REGION_PRESETS) does not throw", () => {
    expect(() => assertDisjointPresets(REGION_PRESETS)).not.toThrow();
  });
});
