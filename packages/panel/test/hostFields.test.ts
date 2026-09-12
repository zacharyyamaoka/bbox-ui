import { describe, expect, it } from "vitest";
import { HOST_FIELDS } from "../src/hostFields";
import { classifyField } from "../src/fieldTiers";

describe("HOST_FIELDS", () => {
  it("declares x, y, rotation, w, h, in that order", () => {
    expect(HOST_FIELDS.map((f) => f.id)).toEqual(["x", "y", "rotation", "w", "h"]);
  });

  it("every field is marked host: true", () => {
    for (const field of HOST_FIELDS) {
      expect(field.host).toBe(true);
    }
  });

  it("rotation carries the -180..180 degree range", () => {
    const rotation = HOST_FIELDS.find((f) => f.id === "rotation")!;
    expect(rotation.min).toBe(-180);
    expect(rotation.max).toBe(180);
    expect(rotation.unit).toBe("°");
    expect(rotation.defaultValue).toBe(0);
  });

  it("x and y default to 0px, step 1", () => {
    for (const id of ["x", "y"]) {
      const field = HOST_FIELDS.find((f) => f.id === id)!;
      expect(field.defaultValue).toBe(0);
      expect(field.step).toBe(1);
      expect(field.unit).toBe("px");
    }
  });

  it("w and h are readOnly, unlike x/y/rotation", () => {
    for (const id of ["w", "h"]) {
      const field = HOST_FIELDS.find((f) => f.id === id)!;
      expect(field.readOnly).toBe(true);
      expect(field.hint).toMatch(/derived/i);
    }
    for (const id of ["x", "y", "rotation"]) {
      const field = HOST_FIELDS.find((f) => f.id === id)!;
      expect(field.readOnly).toBeUndefined();
    }
  });

  it("classifyField sends every host field to 'advanced', ahead of every other rule", () => {
    for (const field of HOST_FIELDS) {
      // `presets: []`, `governed: new Set()` — a host field's tier must not
      // depend on which component's presets happen to be in scope.
      expect(classifyField(field, [], new Set())).toBe("advanced");
    }
  });

  it("a host field stays 'advanced' even if it coincidentally matches a component's selector or bare-label rule", () => {
    // rotation is `kind: "number"` — ordinarily "expert" by the continuous-
    // number rule below the host check. This proves the host check really
    // runs FIRST, not merely "happens to agree" with the fallback rule.
    const rotation = HOST_FIELDS.find((f) => f.id === "rotation")!;
    expect(classifyField(rotation, [], new Set(["rotation"]))).toBe("advanced");
  });
});
