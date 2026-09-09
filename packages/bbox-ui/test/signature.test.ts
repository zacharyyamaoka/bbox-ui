import { describe, expect, it } from "vitest";

import {
  formatSignature,
  parseSignature,
  parseSignatureLines,
  signaturePatch,
  signatureSlotAt,
} from "../src/signature";

describe("parseSignature / formatSignature round trip", () => {
  it("round-trips a full signature", () => {
    const text = "pose: Pose = None";
    const parsed = parseSignature(text);
    expect(parsed).toMatchObject({ name: "pose", type: "Pose", defaultValue: "None" });
    expect(formatSignature(parsed)).toBe(text);
  });

  it("free text with no colon or equals is a legal name, nothing else", () => {
    const parsed = parseSignature("temperature sensor readings");
    expect(parsed).toEqual(
      expect.objectContaining({ name: "temperature sensor readings", type: "", defaultValue: "" }),
    );
    expect(formatSignature(parsed)).toBe("temperature sensor readings");
  });

  it("a name-only round trip stays byte-identical", () => {
    for (const text of ["window", "  x  ", "quality"]) {
      expect(formatSignature(parseSignature(text))).toBe(parseSignature(text).name);
    }
  });

  it("trims whitespace around each slot but not within it", () => {
    const parsed = parseSignature("  window  :  int  =  5  ");
    expect(parsed).toMatchObject({ name: "window", type: "int", defaultValue: "5" });
  });

  it("a type-only signature (no default) round-trips without a trailing equals", () => {
    expect(formatSignature(parseSignature("window: int"))).toBe("window: int");
  });
});

describe("depth-0 splitting — brackets and quotes respected", () => {
  it("does not split on a colon or equals nested inside brackets", () => {
    const parsed = parseSignature("mapping: dict[str, int] = {}");
    expect(parsed).toMatchObject({ name: "mapping", type: "dict[str, int]", defaultValue: "{}" });
  });

  it("handles a nested Callable type with its own bracketed default call", () => {
    const parsed = parseSignature("estimator: Callable[[Frame, float], Pose] = default_estimator()");
    expect(parsed).toMatchObject({
      name: "estimator",
      type: "Callable[[Frame, float], Pose]",
      defaultValue: "default_estimator()",
    });
  });

  it("does not split on a colon or equals inside a quoted string", () => {
    const parsed = parseSignature('label: str = "a:b=c"');
    expect(parsed).toMatchObject({ name: "label", type: "str", defaultValue: '"a:b=c"' });
  });

  it("a lambda's own colon in the default value does not become the type separator", () => {
    // The default's colon comes after the signature's own `:`, so it must
    // never be mistaken for a second type separator.
    const parsed = parseSignature("transform: Callable = lambda x: x");
    expect(parsed).toMatchObject({ name: "transform", type: "Callable", defaultValue: "lambda x: x" });
  });

  it("does not treat comparison operators or the walrus as the default's assignment", () => {
    expect(parseSignature("flag: bool = a == b").defaultValue).toBe("a == b");
    expect(parseSignature("flag: bool = a != b").defaultValue).toBe("a != b");
    expect(parseSignature("flag: bool = a <= b").defaultValue).toBe("a <= b");
    expect(parseSignature("count: int = (n := 5)").defaultValue).toBe("(n := 5)");
  });

  it("a name may itself contain a space with no ambiguity", () => {
    const parsed = parseSignature("chassis width: float = 4.0");
    expect(parsed).toMatchObject({ name: "chassis width", type: "float", defaultValue: "4.0" });
  });
});

describe("signatureSlotAt — which slot the caret sits in", () => {
  it("reports the name slot before any colon", () => {
    const slot = signatureSlotAt("pose: Pose = None", 2);
    expect(slot).toMatchObject({ slot: "name", start: 0, query: "po" });
  });

  it("reports the type slot right after the colon", () => {
    const text = "pose: Pose = None";
    const slot = signatureSlotAt(text, text.indexOf("Pose"));
    expect(slot.slot).toBe("type");
    expect(slot.query).toBe("");
  });

  it("reports the default slot after the equals sign", () => {
    const text = "pose: Pose = None";
    const slot = signatureSlotAt(text, text.length);
    expect(slot).toMatchObject({ slot: "default", query: "None" });
  });

  it("in a lane, resolves the caret's own line — offsets stay absolute", () => {
    const text = "a: int\nb: float = 1.0";
    const secondLine = text.indexOf("float");
    const slot = signatureSlotAt(text, secondLine);
    expect(slot.slot).toBe("type");
    // `end` marks where a completion stops replacing (right before the next
    // separator) rather than the trimmed span — it includes the space
    // ahead of the `=`, same as `query` (which IS trimmed) does not.
    expect(text.slice(slot.start, slot.end).trim()).toBe("float");
  });
});

describe("parseSignatureLines — a lane, one signature per line", () => {
  it("parses every line and shifts spans to whole-text offsets", () => {
    const text = "a: int = 1\nb: float";
    const lines = parseSignatureLines(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: "a", type: "int", defaultValue: "1", lineStart: 0 });
    expect(lines[1]).toMatchObject({ name: "b", type: "float", defaultValue: "", lineStart: 11 });
    expect(text.slice(lines[1]!.spans.type!.start, lines[1]!.spans.type!.end)).toBe("float");
  });
});

describe("signaturePatch — the single-record write seam", () => {
  it("returns null when the typed line already matches the stored value", () => {
    expect(signaturePatch({ name: "pose", type: "Pose", defaultValue: "None" }, "pose: Pose = None")).toBeNull();
  });

  it("patches only the fields that changed", () => {
    const patch = signaturePatch({ name: "pose", type: "Pose", defaultValue: "" }, "pose: Pose3D");
    expect(patch).toEqual({ type: "Pose3D" });
  });

  it("clears a default rather than storing an empty string", () => {
    const patch = signaturePatch({ name: "x", type: "int", defaultValue: "5" }, "x: int");
    expect(patch).toEqual({ defaultValue: "" });
  });
});
