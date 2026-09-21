// src/scene/portDeclaration.test.ts — ruling 8's acceptance: a port stores one
// line, and its type is parsed out of it. The load-bearing assertion is the
// round trip: `name` + `":"` + `type` must reassemble the authored line byte
// for byte, because the two runs are what a face paints and a character that
// disappears between them is the exact failure
// `feedback_truthful_property_rendering` forbids.

import { describe, expect, it } from "vitest";

import {
  formatPortDeclaration,
  parsePortDeclaration,
  portTypeOfDeclaration,
  withPortDeclarationName,
  withPortDeclarationType,
} from "./portDeclaration";

/** What a face paints: the two runs, concatenated with the colon between
 *  them. Written once so every case below asserts the same reassembly the
 *  renderer performs. */
const rendered = (line: string): string => {
  const { name, type, annotated } = parsePortDeclaration(line);
  return annotated ? `${name}:${type}` : name;
};

describe("parsePortDeclaration — the first colon splits, both halves verbatim", () => {
  it("splits a plain annotation", () => {
    expect(parsePortDeclaration("gain_x: float")).toEqual({ name: "gain_x", type: " float", annotated: true });
  });

  it("keeps whitespace on both sides — no trimming anywhere", () => {
    expect(parsePortDeclaration("gain_x  : float")).toEqual({ name: "gain_x  ", type: " float", annotated: true });
    expect(parsePortDeclaration("  spaced  ")).toEqual({ name: "  spaced  ", type: "", annotated: false });
  });

  it("only the FIRST colon splits, so a subscripted type survives whole", () => {
    expect(parsePortDeclaration("items: dict[str, int]").type).toBe(" dict[str, int]");
    expect(parsePortDeclaration("a: b: c")).toEqual({ name: "a", type: " b: c", annotated: true });
  });

  it("an unannotated line is all name; an empty line is an empty name", () => {
    expect(parsePortDeclaration("frame")).toEqual({ name: "frame", type: "", annotated: false });
    expect(parsePortDeclaration("")).toEqual({ name: "", type: "", annotated: false });
  });

  it("`annotated` is what keeps `x` and `x:` distinguishable", () => {
    expect(parsePortDeclaration("x").annotated).toBe(false);
    expect(parsePortDeclaration("x:").annotated).toBe(true);
    expect(parsePortDeclaration("x:").type).toBe("");
  });

  it("every authored character survives the split — the round trip is exact", () => {
    for (const line of ["gain_x: float", "gain_x  : float", "  a  :  B  ", "x:", "x", "", ":", "a: b: c", "items: dict[str, int]"]) {
      expect(rendered(line)).toBe(line);
    }
  });
});

describe("portTypeOfDeclaration — the vocabulary value, trimmed, undefined when unstated", () => {
  it("trims, so ` float` and `float` are one type", () => {
    expect(portTypeOfDeclaration("gain_x: float")).toBe("float");
    expect(portTypeOfDeclaration("gain_x:float")).toBe("float");
    expect(portTypeOfDeclaration("gain_x  :   float  ")).toBe("float");
  });

  it("states nothing for a bare name, a bare colon, or whitespace after one", () => {
    expect(portTypeOfDeclaration("frame")).toBeUndefined();
    expect(portTypeOfDeclaration("frame:")).toBeUndefined();
    expect(portTypeOfDeclaration("frame:   ")).toBeUndefined();
    expect(portTypeOfDeclaration("")).toBeUndefined();
  });

  it("keeps a multi-word type whole rather than splitting it into tags", () => {
    expect(portTypeOfDeclaration("items: dict[str, int]")).toBe("dict[str, int]");
  });
});

describe("formatPortDeclaration — the constructor the migration and the backend use", () => {
  it("mints the canonical `name: type`", () => {
    expect(formatPortDeclaration("gain_x", "float")).toBe("gain_x: float");
    expect(formatPortDeclaration("gain_x", "  float  ")).toBe("gain_x: float");
  });

  it("an unstated type produces a bare name, never a trailing colon", () => {
    expect(formatPortDeclaration("frame", "")).toBe("frame");
    expect(formatPortDeclaration("frame", "   ")).toBe("frame");
  });

  it("folds the old stored pair without losing a name's authored spaces", () => {
    // The exact pair `src/port.smoke.test.tsx` has asserted since L2.
    expect(formatPortDeclaration("gain_x  ", "float")).toBe("gain_x  : float");
    expect(portTypeOfDeclaration(formatPortDeclaration("gain_x  ", "float"))).toBe("float");
    expect(parsePortDeclaration(formatPortDeclaration("gain_x  ", "float")).name).toBe("gain_x  ");
  });
});

describe("withPortDeclarationName / withPortDeclarationType — edit one half, leave the other authored", () => {
  it("a rename splices, so the annotation keeps its own spacing", () => {
    expect(withPortDeclarationName("raw:   bytes", "frame")).toBe("frame:   bytes");
    expect(withPortDeclarationName("raw", "frame")).toBe("frame");
    // A line with no colon does not grow one.
    expect(parsePortDeclaration(withPortDeclarationName("raw", "frame")).annotated).toBe(false);
  });

  it("re-annotating keeps the name verbatim, clearing removes the colon", () => {
    expect(withPortDeclarationType("gain_x  : float", "int")).toBe("gain_x  : int");
    expect(withPortDeclarationType("gain_x: float", "")).toBe("gain_x");
    expect(withPortDeclarationType("gain_x", "float")).toBe("gain_x: float");
  });
});
