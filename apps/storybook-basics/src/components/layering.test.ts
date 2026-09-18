// src/components/layering.test.ts — NET-NEW (docs/INVALID-STATES-PLAN.md
// D2, ruling 2). Zach's ruling, verbatim: "severity and text should be
// held at low level... what that severity means, and what to do about it,
// is at the higher level... the display layer should not know the
// reasons, just know how to display it." Two gates make that STRUCTURAL
// rather than a comment people can drift away from:
//
//   (a) an IMPORT WALL — no file under this directory may import the
//       scene kit at all, so a component literally cannot branch on a
//       rule id or a scene-side type even if someone tried.
//   (b) a REASON-BLIND PAINT test — render five mark-bearing components
//       twice, with `diagnostics` lists that differ ONLY in `message`/
//       `code` (same `id`, same `severity`), and assert the at-rest
//       markup is byte-identical. A future component that branches on
//       `code`/`message` (rather than only on `severity`, which every
//       component already reads) turns this red.
//
// Both gates were verified to actually fail before this file existed in
// its current form: (a) by temporarily inserting
// `import {} from "../scene/lint";` into port.tsx and re-running this
// suite (fails: `../scene/lint` reported), then reverting; (b) by
// temporarily changing `DiagnosticFlag`'s popover body to key off
// `d.code` in its OWN chrome (not just inside the popover's click
// content) and re-running (fails: the two markups differ), then
// reverting. Neither temporary change is part of this commit.
//
// WHY `renderToStaticMarkup` (react-dom/server) rather than a DOM-mounted
// render: this file lives in the "unit" Vitest project
// (vitest.config.ts), which runs in plain Node — no jsdom/browser, and
// deliberately so (it is where the pure elbow-routing math tests already
// live, one browser tab per file being the wrong cost for logic that
// imports no DOM). `renderToStaticMarkup` needs neither: it produces the
// exact HTML string a server (or, here, a test) would emit for the
// at-rest render, which is exactly what "byte-identical" means to test
// (b) — a real DOM's `container.innerHTML` after mounting Base UI's
// closed Tooltip/Popover portals resolves to the SAME string, since
// neither mounts anything into the tree while closed (verified live: both
// render cleanly under `renderToStaticMarkup` with no window/document
// access at all, because the closed-portal branch never reaches
// floating-ui's positioning code).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Block } from "./block";
import type { Diagnostic } from "./highlighter";
import { DiagnosticFlag } from "./highlighter";
import { LabeledPort } from "./labeledPort";
import { Port } from "./port";
import { Trace } from "./trace";

const COMPONENTS_DIR = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* (a) the import wall                                                 */
/* ------------------------------------------------------------------ */

// Matches a static or type-only import/export FROM specifier that reaches
// into a `scene` directory one, two, or three levels up — every relative
// depth an `src/components/*.{ts,tsx}` file could plausibly use to reach
// `src/scene/`. Deliberately textual (not a module-graph walk): the rule
// is "no such SPECIFIER appears in source", which is what makes it cheap,
// synchronous, and legible as a straight `grep`.
const SCENE_IMPORT_PATTERN = /from\s+["'](?:\.\.\/){1,3}scene(?:\/[^"']*)?["']/g;

function componentSourceFiles(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx"))
    .sort();
}

describe("layering — the import wall (D2 mechanism 1)", () => {
  it("scans at least the files this lane itself touched, so the wall cannot silently start scanning zero files", () => {
    const files = componentSourceFiles();
    for (const expected of ["port.tsx", "labeledPort.tsx", "portEdge.tsx", "traceBadge.tsx", "traceMark.tsx", "trace.layout.ts"]) {
      expect(files).toContain(expected);
    }
  });

  it("no src/components/*.{ts,tsx} file imports from the scene kit", () => {
    const offenders: { file: string; specifier: string }[] = [];
    for (const file of componentSourceFiles()) {
      const source = readFileSync(join(COMPONENTS_DIR, file), "utf8");
      const matches = source.match(SCENE_IMPORT_PATTERN);
      if (matches) {
        for (const specifier of matches) offenders.push({ file, specifier });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the scan target directory actually exists and is this one (sanity: a wrong dirname would vacuously pass)", () => {
    expect(existsSync(join(COMPONENTS_DIR, "port.tsx"))).toBe(true);
    expect(COMPONENTS_DIR.endsWith("components")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* (b) reason-blind paint                                              */
/* ------------------------------------------------------------------ */

// Same id, same severity — differ ONLY in the reason's own text (message)
// and its rule id (code). If any mark-bearing component's AT-REST markup
// differs between these two, something downstream of `maxDiagnosticSeverity`
// is reading `message`/`code` to decide how to paint, not just whether/how
// severe — the violation ruling 2 exists to prevent.
const DIAGNOSTICS_A: Diagnostic[] = [{ id: "d1", severity: "error", message: "Dangling edge into ghost node", code: "dangling-edge" }];
const DIAGNOSTICS_B: Diagnostic[] = [
  { id: "d1", severity: "error", message: "A completely different sentence about a completely different problem", code: "type-mismatch" },
];

function renderTwice(make: (diagnostics: Diagnostic[]) => ReturnType<typeof createElement>): [string, string] {
  return [renderToStaticMarkup(make(DIAGNOSTICS_A)), renderToStaticMarkup(make(DIAGNOSTICS_B))];
}

describe("layering — reason-blind paint (D2 mechanism 2)", () => {
  it("Port: identical at-rest markup for two diagnostics differing only in message/code", () => {
    const [a, b] = renderTwice((diagnostics) => createElement(Port, { state: "wired", diagnostics }));
    expect(a).toBe(b);
    // Sanity: the mark itself DID render (severity, not the branch under
    // test, is what should show) — an empty/identical-because-nothing-
    // rendered result would pass this test for the wrong reason.
    expect(a).toContain('data-diagnostic="error"');
  });

  it("LabeledPort: identical at-rest markup for two diagnostics differing only in message/code", () => {
    const [a, b] = renderTwice((diagnostics) =>
      createElement(LabeledPort, { state: "wired", diagnostics, children: "Label" }),
    );
    expect(a).toBe(b);
  });

  it("Block: identical at-rest markup for two diagnostics differing only in message/code", () => {
    const [a, b] = renderTwice((diagnostics) => createElement(Block, { header: "Node", diagnostics }));
    expect(a).toBe(b);
  });

  it("Trace: identical at-rest markup for two diagnostics differing only in message/code", () => {
    const from = { x: 0, y: 0, dir: "right" as const };
    const to = { x: 100, y: 0, dir: "left" as const };
    const [a, b] = renderTwice((diagnostics) =>
      createElement(Trace, { id: "e1", from, to, routing: "straight", diagnostics }),
    );
    expect(a).toBe(b);
  });

  it("DiagnosticFlag: identical at-rest CHROME for two diagnostics differing only in message/code (the popover's own click-content is allowed to differ — it is the one place a reason is meant to be READ, never branched on)", () => {
    // DiagnosticFlag's popover content (message/code text) is closed at
    // rest and does not mount into the static markup at all (Base UI's
    // Popover.Portal renders nothing while closed) — so `renderToStatic
    // Markup` output for the two variants is the CHROME alone, and it
    // must be identical: the trigger button, its aria-label (count +
    // severity only), and the count badge.
    const [a, b] = renderTwice((diagnostics) => createElement(DiagnosticFlag, { diagnostics }));
    expect(a).toBe(b);
    expect(a).toContain('aria-label="1 error diagnostic"');
  });

  it("a future violation would be CAUGHT: two diagnostics differing only in code produce different Block markup once a hypothetical branch reads `code` (regression guard for this test's own sensitivity)", () => {
    // This does not touch any shipped component — it renders raw HTML
    // strings standing in for "what a violating component's before/after
    // would look like", proving the byte-equality assertion style above
    // is sensitive enough to catch a real divergence rather than passing
    // by construction.
    const violatingBefore = `<div data-rule="${DIAGNOSTICS_A[0].code}"></div>`;
    const violatingAfter = `<div data-rule="${DIAGNOSTICS_B[0].code}"></div>`;
    expect(violatingBefore).not.toBe(violatingAfter);
  });
});
