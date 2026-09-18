// src/magnet/magnetPortTypes.test.ts — A4: the type gate, table-driven
// against the DONOR'S OWN table.
//
// These are not cases invented to match the port; they are the branches
// `/home/bam/systemsketch/src/blocks/connections/connectionModel.ts:138-153`
// actually has, one test per branch, plus the wildcard set at :158 and the
// normalization at :164 enumerated explicitly.

import { describe, expect, it } from "vitest";

import { arePortTypesCompatible, normalizePortType, WILDCARD_PORT_TYPES, type PortTypeMatching, type PortTypeVerdict } from "./magnetPortTypes";

describe("normalizePortType — donor connectionModel.ts:164-166", () => {
  it("trims and lowercases, and nothing else", () => {
    expect(normalizePortType("  Pose ")).toBe("pose");
    expect(normalizePortType("BYTES")).toBe("bytes");
    expect(normalizePortType("")).toBe("");
    // Interior whitespace is NOT collapsed — the donor trims, it does not
    // re-space. Pinned so a "tidy-up" cannot widen it silently.
    expect(normalizePortType("Point Cloud")).toBe("point cloud");
  });
});

describe("WILDCARD_PORT_TYPES — donor connectionModel.ts:158", () => {
  it("is exactly {any, *, object}", () => {
    expect([...WILDCARD_PORT_TYPES].sort()).toEqual(["*", "any", "object"]);
  });
});

describe("arePortTypesCompatible — donor connectionModel.ts:138-153", () => {
  const rows: { source: string; sink: string; mode: PortTypeMatching; want: PortTypeVerdict; why: string }[] = [
    // `off` is the donor's default and short-circuits before anything else.
    { source: "Pose", sink: "bytes", mode: "off", want: "ok", why: "mode off never refuses" },
    { source: "", sink: "", mode: "off", want: "ok", why: "mode off ignores undeclared types too" },

    // Case- and whitespace-insensitive, for the donor's stated reason.
    { source: "Pose", sink: "pose", mode: "lenient", want: "ok", why: "case-insensitive" },
    { source: " Pose ", sink: "Pose", mode: "strict", want: "ok", why: "whitespace-insensitive" },

    // Wildcards never refuse a landing, from either side.
    { source: "any", sink: "Pose", mode: "strict", want: "ok", why: "wildcard source" },
    { source: "Pose", sink: "*", mode: "strict", want: "ok", why: "wildcard sink" },
    { source: "object", sink: "bytes", mode: "strict", want: "ok", why: "wildcard object" },

    // The undeclared split — the whole reason the verdict is three-valued.
    { source: "", sink: "Pose", mode: "lenient", want: "ok", why: "lenient reads undeclared as 'not saying'" },
    { source: "", sink: "Pose", mode: "strict", want: "untyped", why: "strict reads undeclared as a gap to fill" },
    { source: "Pose", sink: "", mode: "strict", want: "untyped", why: "either side undeclared" },

    // A genuine disagreement.
    { source: "Pose", sink: "bytes", mode: "lenient", want: "mismatch", why: "declared and different" },
    { source: "Pose", sink: "bytes", mode: "strict", want: "mismatch", why: "strict agrees" },
    { source: "Pose", sink: "Pose", mode: "strict", want: "ok", why: "declared and equal" },
  ];

  for (const row of rows) {
    it(`${row.mode}: "${row.source}" -> "${row.sink}" = ${row.want} (${row.why})`, () => {
      expect(arePortTypesCompatible(row.source, row.sink, row.mode)).toBe(row.want);
    });
  }

  it("defaults to the donor's own default, `off`", () => {
    expect(arePortTypesCompatible("Pose", "bytes")).toBe("ok");
  });

  // A wildcard is checked AFTER the undeclared branch, which is the donor's
  // order. A wildcard against an undeclared type under `strict` is therefore
  // `untyped`, not `ok` — an order-sensitive case worth pinning, because
  // swapping the two branches passes every other row above.
  it("keeps the donor's branch ORDER: undeclared is checked before wildcard", () => {
    expect(arePortTypesCompatible("any", "", "strict")).toBe("untyped");
    expect(arePortTypesCompatible("any", "", "lenient")).toBe("ok");
  });
});
