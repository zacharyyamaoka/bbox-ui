// src/components/paintOrder.test.ts — Card 04 (z-order), the pure/textual
// half. The MEASURED half — isolation, real overlap, real hit-testing —
// lives in src/components/PaintOrder.stories.tsx (a real DOM, run via
// `pnpm test-stories`; this file runs in the "unit" Vitest project, plain
// Node, same reasoning layering.test.ts's own header already gives for
// why an import-wall / textual scan belongs there and not here).
//
// (a) THE GREP GUARD — modeled on layering.test.ts's import-wall
// mechanism (a textual scan of every `src/components/*.{ts,tsx}` source
// file, deliberately not a module-graph walk): asserts no file in this
// directory writes a raw numeric `zIndex` literal any more. This is what
// stops the magic numbers paintOrder.ts replaced from growing back.
//
// Verified to actually fail before this file existed in its current
// form: temporarily reverting one call site (blockPort.tsx's
// `BlockFunctionPort`) from `zIndex: paintTier("portDot")` back to
// `zIndex: 1` and re-running this suite — fails, naming that exact file —
// then restoring it. Not part of this commit.
//
// (b) THE LADDER'S OWN INVARIANTS — `PAINT_TIER_ORDER` is closed (every
// name has a value, no stray/extra names) and non-empty; `paintTier`
// returns a distinct, stable number per name it is asked for.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ISOLATED_ROOT_STYLE, PAINT_TIER_ORDER, paintTier, type PaintTierName } from "./paintOrder";

const COMPONENTS_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Every KIT SOURCE file under `src/components/`, recursively, as a path
 * relative to this directory.
 *
 * WHY it recurses (changed 2026-09-21, the kit refactor): it used to be a
 * flat `readdirSync`, which meant `components/elbow/` — 2,500 lines of
 * routing math — was never scanned at all, and the refactor was about to add
 * `components/hitRegions/` beside it. A wall that silently stops at depth 1
 * reports green for code it never read, which is the same false-pass class
 * `vitest.config.ts`'s own header is about. Recursing makes it strictly
 * stronger: it now covers files it always should have.
 *
 * WHY `.stories.tsx` / `.fixture.tsx` are exempt: the wall polices the KIT,
 * not its consumers. `ARCHITECTURE.md`'s load-bearing line is "components
 * never imports scene" — a claim about what a Block needs in order to paint,
 * which is what lets the same Block be driven by a story literal, a React
 * Flow node or a tldraw shape. A story is the DRIVER, not the driven: it is
 * one of the consumers that line exists to keep possible, and
 * `BlockWiring.stories.tsx` has to build a scene in order to prove
 * `wireLayer.tsx` wires one. Exempting stories is what lets a story live
 * beside the component it documents (Zach, 2026-09-21) without either
 * loosening the rule for component source or exiling the story from its
 * subject. `.test.ts`/`.test.tsx` were already exempt for the same reason —
 * this file imports the scene kit itself, two lines up.
 */
function componentSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (at: string, prefix: string) => {
    for (const name of readdirSync(at).sort()) {
      const full = join(at, name);
      if (statSync(full).isDirectory()) {
        walk(full, prefix + name + "/");
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.(test|stories|fixture)\.tsx?$/.test(name)) continue;
      out.push(prefix + name);
    }
  };
  walk(COMPONENTS_DIR, "");
  return out.sort();
}

/**
 * A raw numeric `zIndex` literal in CODE, not in prose. Comments in this
 * codebase referencing the pre-refactor numbers (e.g. blockPort.tsx's own
 * module doc, "`zIndex: 1` is doing real work") are expected to keep
 * existing as historical record — this guard only rejects a line whose
 * FIRST non-whitespace characters are not a comment marker (`*` for a
 * JSDoc continuation line, `//` for a line comment) and which still
 * contains a literal `zIndex: <number>`.
 */
const RAW_ZINDEX_PATTERN = /zIndex\s*:\s*-?\d/;

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("*") || trimmed.startsWith("//");
}

describe("paintOrder — the grep guard (no raw zIndex literal survives)", () => {
  it("scans at least the files this lane itself touched, so the guard cannot silently scan zero files", () => {
    const files = componentSourceFiles();
    for (const expected of ["block.tsx", "blockPort.tsx", "portEdge.tsx", "paintOrder.ts", "elbow/elbowRouter.ts"]) {
      expect(files).toContain(expected);
    }
  });

  it("no src/components/*.{ts,tsx} CODE line writes a raw numeric zIndex — only paintTier(...) may produce one", () => {
    const offenders: { file: string; line: number; text: string }[] = [];
    for (const file of componentSourceFiles()) {
      // paintOrder.ts itself is the one legitimate place raw integers are
      // assigned to tier names — it is the source of truth the guard is
      // protecting, not a file the guard should scan for violations of
      // its own rule.
      if (file === "paintOrder.ts") continue;
      const lines = readFileSync(join(COMPONENTS_DIR, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        if (isCommentLine(line)) return;
        if (RAW_ZINDEX_PATTERN.test(line)) {
          offenders.push({ file, line: index + 1, text: line.trim() });
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("a future violation would be CAUGHT (regression guard for the guard's own sensitivity): a raw literal on a real code line is flagged", () => {
    const offendingSource = 'const style = { position: "absolute", zIndex: 7 };';
    expect(isCommentLine(offendingSource)).toBe(false);
    expect(RAW_ZINDEX_PATTERN.test(offendingSource)).toBe(true);
  });

  it("a comment mentioning the pre-refactor numbers is NOT flagged (this guard targets code, not the historical record in prose)", () => {
    const commentSource = " * `zIndex: -1` (the donor's posture) turns it red. So `zIndex: 1` is doing";
    expect(isCommentLine(commentSource)).toBe(true);
  });
});

describe("paintOrder — the ladder itself", () => {
  it("PAINT_TIER_ORDER is closed: every name paintTier() is ever asked for is a real entry, non-empty, no duplicates", () => {
    expect(PAINT_TIER_ORDER.length).toBeGreaterThan(0);
    expect(new Set(PAINT_TIER_ORDER).size).toBe(PAINT_TIER_ORDER.length);
  });

  it("every tier name resolves to a finite integer, and the same name always resolves to the same value (stable, not re-derived per call)", () => {
    for (const name of PAINT_TIER_ORDER) {
      const value = paintTier(name);
      expect(Number.isInteger(value)).toBe(true);
      expect(paintTier(name)).toBe(value);
    }
  });

  it("reproduces today's five pre-existing raw literals exactly — the no-op half of the refactor (docs/provenance/z-order.md carries the file:line citations)", () => {
    const known: Record<PaintTierName, number> = {
      // NEW 2026-09-22 (side-effect ports), not a pre-existing literal —
      // the mutation line's below-content tier; see paintOrder.ts.
      underlay: -1,
      surface: 0,
      memberContent: 1,
      memberOverflow: 1,
      wire: 1,
      headerChrome: 2,
      portDot: 1,
      flagBadge: 1,
      laneOverlay: 5,
      dragActive: 10,
      diagnosticHalo: 1,
    };
    // blockPort.tsx:412,538 (`zIndex: 1`) and block.tsx:334 (`zIndex: 1`)
    expect(paintTier("portDot")).toBe(1);
    expect(paintTier("flagBadge")).toBe(1);
    // portEdge.tsx:846 (`zIndex: isDragging ? 10 : 1`)
    expect(paintTier("memberContent")).toBe(1);
    expect(paintTier("dragActive")).toBe(10);
    // portEdge.tsx:1003 (`zIndex: 5`)
    expect(paintTier("laneOverlay")).toBe(5);
    for (const name of PAINT_TIER_ORDER) expect(paintTier(name)).toBe(known[name]);
  });

  it("ISOLATED_ROOT_STYLE is exactly `{ isolation: 'isolate' }' — the one structural half of the ruling every emitting root must spread", () => {
    expect(ISOLATED_ROOT_STYLE).toEqual({ isolation: "isolate" });
  });
});
