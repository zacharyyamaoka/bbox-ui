// src/scene/bubble.test.ts — fold bubbling, tested in the node project (no
// DOM): `pnpm exec vitest --project=unit run`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { sceneSurfaceModel, surfaceFindings, visibilityFromHides, type HidesOf, type SurfaceModel, type SurfacedFinding, type VisibilityOf } from "./bubble";
import type { LintFinding, LintSubject } from "./lint";
import { subjectKey } from "./lint";
import type { Diagnostic } from "../components/highlighter";

function finding(id: string, subject: LintSubject, overrides: Partial<LintFinding> = {}): LintFinding {
  return { id, severity: "error", message: `finding ${id}`, code: "test-rule", ruleId: "self-connection", subject, ...overrides };
}

/* ------------------------------------------------------------------ */
/* No view-mode name anywhere in bubble.ts itself — R3a                */
/* ------------------------------------------------------------------ */

// The view-name literals bubble.ts's CODE must never contain. Its header
// comment legitimately quotes Zach saying "simple" and "expanded" (that's
// prose about the rule, not the rule itself), so the check below strips
// comments first — a raw-text grep would false-alarm on that quote.
const FORBIDDEN_VIEW_NAMES = ['"simple"', "'simple'", "`simple`", '"expanded"', "'expanded'", "`expanded`"];

/**
 * Strip `/* ... *‍/` block comments (including the `/** ... *‍/` header) and
 * `// ...` line comments from a TypeScript source string, leaving only code.
 *
 * WHY this exact order and NOT a single combined regex: block comments can
 * span lines and must go first, or a `//` that happens to sit inside one
 * (this file's header has several, e.g. inside backtick-quoted identifiers)
 * would truncate the block-comment match early. What this does NOT handle:
 * a `//` or `/*` occurring inside a real string/template literal would be
 * misread as a comment start. Checked against bubble.ts (see grep above
 * this test file's own history) — it has no string or template literal
 * containing `//` or `/*`, so the simple stripper is safe for the file it
 * actually checks, not a general-purpose TS comment stripper.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const bubbleSource = readFileSync(fileURLToPath(new URL("./bubble.ts", import.meta.url)), "utf8");
const bubbleCode = stripComments(bubbleSource);

describe("bubble.ts names no view mode", () => {
  test("no quoted view-mode literal appears in bubble.ts's CODE (comments stripped first)", () => {
    // The real, mechanical check: read the actual file off disk, strip
    // comments (the header quotes Zach saying "simple"/"expanded" as prose
    // about the rule — that's allowed), and grep what's left. This fails
    // loudly the moment a view-name string literal lands in the code.
    for (const literal of FORBIDDEN_VIEW_NAMES) {
      expect(bubbleCode).not.toContain(literal);
    }
  });

  test("secondary check: the exported vocabulary (HidesOf/VisibilityOf) stays view-name-free too", () => {
    // Not the primary proof (this asserts a literal the test itself wrote,
    // not bubble.ts's actual contents) — kept as a documented contract on
    // the exported shape, on top of the real file-read check above.
    const hidesOf: HidesOf = () => ({ members: true, ports: true });
    expect(Object.keys(hidesOf("x") ?? {}).sort()).toEqual(["members", "ports"]);
  });
});

/* ------------------------------------------------------------------ */
/* sceneSurfaceModel                                                    */
/* ------------------------------------------------------------------ */

describe("sceneSurfaceModel", () => {
  const model = sceneSurfaceModel({
    nodes: [{ id: "root" }, { id: "mid", parentId: "root" }, { id: "leaf", parentId: "mid" }],
    edges: [{ id: "e1", source: "leaf", target: "mid", sourceHandle: "out", targetHandle: "in" }],
  });

  test("parentOf reads SceneNode.parentId, undefined at the root", () => {
    expect(model.parentOf("leaf")).toBe("mid");
    expect(model.parentOf("mid")).toBe("root");
    expect(model.parentOf("root")).toBeUndefined();
  });

  test("nodeOfPort resolves a port key built from an edge end, undefined for a port never named by any edge", () => {
    expect(model.nodeOfPort("leaf/out")).toBe("leaf");
    expect(model.nodeOfPort("mid/in")).toBe("mid");
    expect(model.nodeOfPort("mid/never-wired")).toBeUndefined();
  });

  test("endsOf returns the edge's own ends, undefined for an unknown id", () => {
    expect(model.endsOf("e1")).toEqual({ id: "e1", source: "leaf", target: "mid", sourceHandle: "out", targetHandle: "in" });
    expect(model.endsOf("no-such-edge")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* visibilityFromHides                                                  */
/* ------------------------------------------------------------------ */

describe("visibilityFromHides", () => {
  // root -> mid -> leaf, with leaf/out and mid/in wired by e1.
  const model = sceneSurfaceModel({
    nodes: [{ id: "root" }, { id: "mid", parentId: "root" }, { id: "leaf", parentId: "mid" }],
    edges: [{ id: "e1", source: "leaf", target: "mid", sourceHandle: "out", targetHandle: "in" }],
  });

  test("a node with no ancestor hiding members is visible", () => {
    const isVisible = visibilityFromHides(model, () => undefined);
    expect(isVisible({ kind: "node", id: "leaf" })).toBe(true);
  });

  test("a node whose PARENT hides members is invisible; the parent hiding it is itself unaffected", () => {
    const hidesOf: HidesOf = (id) => (id === "mid" ? { members: true, ports: false } : undefined);
    const isVisible = visibilityFromHides(model, hidesOf);
    expect(isVisible({ kind: "node", id: "leaf" })).toBe(false);
    expect(isVisible({ kind: "node", id: "mid" })).toBe(true);
  });

  test("a node whose GRANDPARENT hides members is also invisible (climbs every proper ancestor, not just the immediate parent)", () => {
    const hidesOf: HidesOf = (id) => (id === "root" ? { members: true, ports: false } : undefined);
    const isVisible = visibilityFromHides(model, hidesOf);
    expect(isVisible({ kind: "node", id: "leaf" })).toBe(false);
  });

  test("a port is invisible when its OWN node hides ports, even though the node itself is visible", () => {
    const hidesOf: HidesOf = (id) => (id === "mid" ? { members: false, ports: true } : undefined);
    const isVisible = visibilityFromHides(model, hidesOf);
    expect(isVisible({ kind: "node", id: "mid" })).toBe(true);
    expect(isVisible({ kind: "port", id: "mid/in" })).toBe(false);
  });

  test("a port is invisible when its node is invisible, independent of that node's own `ports` flag", () => {
    const hidesOf: HidesOf = (id) => (id === "root" ? { members: true, ports: false } : undefined);
    const isVisible = visibilityFromHides(model, hidesOf);
    expect(isVisible({ kind: "node", id: "mid" })).toBe(false);
    expect(isVisible({ kind: "port", id: "mid/in" })).toBe(false);
  });

  test("an edge is visible iff BOTH ends are visible", () => {
    const isVisible = visibilityFromHides(model, () => undefined);
    expect(isVisible({ kind: "edge", id: "e1" })).toBe(true);
  });

  test("an edge with one hidden end is not visible", () => {
    const hidesOf: HidesOf = (id) => (id === "mid" ? { members: false, ports: true } : undefined);
    const isVisible = visibilityFromHides(model, hidesOf);
    expect(isVisible({ kind: "edge", id: "e1" })).toBe(false);
  });

  test("a port/edge this model has never seen defaults to visible — absence of a fact is not evidence of hiding", () => {
    const isVisible = visibilityFromHides(model, () => undefined);
    expect(isVisible({ kind: "port", id: "root/never-wired" })).toBe(true);
    expect(isVisible({ kind: "edge", id: "no-such-edge" })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* surfaceFindings                                                      */
/* ------------------------------------------------------------------ */

describe("surfaceFindings", () => {
  test("nothing hidden → every finding surfaces in place, hops 0, carrier === subject", () => {
    const model: SurfaceModel = { parentOf: () => undefined, nodeOfPort: () => undefined, endsOf: () => undefined };
    const isVisible: VisibilityOf = () => true;
    const f = finding("f-node", { kind: "node", id: "n1" });
    const { byCarrier, unanchored } = surfaceFindings([f], { isVisible, model });
    expect(unanchored).toEqual([]);
    const bucket = byCarrier.get(subjectKey({ kind: "node", id: "n1" }))!;
    expect(bucket).toHaveLength(1);
    expect(bucket[0].hops).toBe(0);
    expect(bucket[0].carrier).toEqual({ kind: "node", id: "n1" });
  });

  test("a hidden port anchors to its node — hops 1", () => {
    const model = sceneSurfaceModel({
      nodes: [{ id: "x" }, { id: "box" }],
      edges: [{ id: "e1", source: "x", target: "box", sourceHandle: "out", targetHandle: "in" }],
    });
    const isVisible: VisibilityOf = (s) => !(s.kind === "port" && s.id === "box/in");
    const f = finding("f-port", { kind: "port", id: "box/in" });
    const { byCarrier } = surfaceFindings([f], { isVisible, model });
    const bucket = byCarrier.get(subjectKey({ kind: "node", id: "box" }))!;
    expect(bucket).toHaveLength(1);
    expect(bucket[0].hops).toBe(1);
    expect(bucket[0].carrier).toEqual({ kind: "node", id: "box" });
  });

  test("a node hidden two levels deep climbs to the first VISIBLE ancestor — hops 2", () => {
    const model = sceneSurfaceModel({
      nodes: [{ id: "root" }, { id: "mid", parentId: "root" }, { id: "leaf", parentId: "mid" }],
      edges: [],
    });
    const isVisible: VisibilityOf = (s) => s.kind === "node" && (s.id === "leaf" || s.id === "mid") ? false : true;
    const f = finding("f-leaf", { kind: "node", id: "leaf" });
    const { byCarrier } = surfaceFindings([f], { isVisible, model });
    const bucket = byCarrier.get(subjectKey({ kind: "node", id: "root" }))!;
    expect(bucket).toHaveLength(1);
    expect(bucket[0].hops).toBe(2);
    expect(bucket[0].carrier).toEqual({ kind: "node", id: "root" });
  });

  test("an edge with both ends hidden under DIFFERENT parents surfaces on up to two carriers", () => {
    const model = sceneSurfaceModel({
      nodes: [{ id: "p1" }, { id: "p2" }, { id: "n1", parentId: "p1" }, { id: "n2", parentId: "p2" }],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    const isVisible: VisibilityOf = (s) => {
      if (s.kind === "edge" && s.id === "e1") return false;
      if (s.kind === "node" && (s.id === "n1" || s.id === "n2")) return false;
      return true; // p1, p2 (and everything else) visible
    };
    const f = finding("f-edge", { kind: "edge", id: "e1" });
    const { byCarrier, unanchored } = surfaceFindings([f], { isVisible, model });
    expect(unanchored).toEqual([]);
    const atP1 = byCarrier.get(subjectKey({ kind: "node", id: "p1" }))!;
    const atP2 = byCarrier.get(subjectKey({ kind: "node", id: "p2" }))!;
    expect(atP1).toHaveLength(1);
    expect(atP2).toHaveLength(1);
    expect(atP1[0].id).toBe("f-edge");
    expect(atP2[0].id).toBe("f-edge");
  });

  test("an edge with both ends hidden under the SAME parent surfaces once — deduped per carrier, not duplicated", () => {
    const model = sceneSurfaceModel({
      nodes: [{ id: "p" }, { id: "n1", parentId: "p" }, { id: "n2", parentId: "p" }],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    const isVisible: VisibilityOf = (s) => {
      if (s.kind === "edge" && s.id === "e1") return false;
      if (s.kind === "node" && (s.id === "n1" || s.id === "n2")) return false;
      return true; // p visible
    };
    const f = finding("f-edge", { kind: "edge", id: "e1" });
    const { byCarrier } = surfaceFindings([f], { isVisible, model });
    const atP = byCarrier.get(subjectKey({ kind: "node", id: "p" }))!;
    expect(atP).toHaveLength(1); // not two, even though BOTH ends climbed to p
  });

  test("an edge with only ONE end hidden surfaces on that one carrier", () => {
    const model = sceneSurfaceModel({
      nodes: [{ id: "p" }, { id: "n1", parentId: "p" }, { id: "n2" }],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    });
    const isVisible: VisibilityOf = (s) => {
      if (s.kind === "edge" && s.id === "e1") return false;
      if (s.kind === "node" && s.id === "n1") return false;
      return true; // n2 and p are visible
    };
    const f = finding("f-edge", { kind: "edge", id: "e1" });
    const { byCarrier } = surfaceFindings([f], { isVisible, model });
    expect(byCarrier.size).toBe(1);
    const atP = byCarrier.get(subjectKey({ kind: "node", id: "p" }))!;
    expect(atP).toHaveLength(1);
  });

  test("a finding whose entire ancestor chain is hidden lands in `unanchored`, never dropped", () => {
    const model: SurfaceModel = { parentOf: () => undefined, nodeOfPort: () => undefined, endsOf: () => undefined };
    const isVisible: VisibilityOf = () => false; // pathological: nothing is ever visible, not even the root
    const f = finding("f-lost", { kind: "node", id: "solo" });
    const { byCarrier, unanchored } = surfaceFindings([f], { isVisible, model });
    expect(byCarrier.size).toBe(0);
    expect(unanchored).toHaveLength(1);
    expect(unanchored[0].id).toBe("f-lost");
  });

  test("findings pass through with their stable id and every original field intact", () => {
    const model: SurfaceModel = { parentOf: () => undefined, nodeOfPort: () => undefined, endsOf: () => undefined };
    const isVisible: VisibilityOf = () => true;
    const f = finding("f1", { kind: "node", id: "n1" }, { message: "custom message", code: "self-connection" });
    const { byCarrier } = surfaceFindings([f], { isVisible, model });
    const [surfaced] = byCarrier.get(subjectKey({ kind: "node", id: "n1" }))!;
    expect(surfaced.id).toBe("f1");
    expect(surfaced.message).toBe("custom message");
    expect(surfaced.code).toBe("self-connection");
    expect(surfaced.ruleId).toBe("self-connection");
  });
});

/* ------------------------------------------------------------------ */
/* R3c (compile-level half; the DOM half belongs to the story lane):   */
/* SurfacedFinding[] assigns straight into a Diagnostic[]-shaped prop  */
/* with ZERO mapping.                                                   */
/* ------------------------------------------------------------------ */

test("SurfacedFinding[] is structurally assignable to Diagnostic[] with no mapping", () => {
  const surfaced: SurfacedFinding[] = [
    { id: "f1", severity: "error", message: "m", code: "c", ruleId: "self-connection", subject: { kind: "node", id: "n1" }, carrier: { kind: "node", id: "n1" }, hops: 0 },
  ];
  const asDiagnostics: Diagnostic[] = surfaced; // compiles iff structurally a superset — no .map() anywhere
  expect(asDiagnostics).toBe(surfaced);
});
