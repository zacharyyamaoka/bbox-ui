// src/components/elbow/provenance.test.ts — NET-NEW, not a port.
//
// Zach's rule for this whole directory: "whenever possible just copy pasted
// code from those libraries. make sure to keep that documentation with the
// functions." A rule that lives only in a comment is a rule that a tidy-up
// silently deletes, so it lives here instead, as something that can FAIL.
//
// docs/TRACE-PLAN.md names the gate explicitly ("`grep -c "@ported"` in the
// copy equals the donor's count") — this is that grep, runnable, plus the
// licence and provenance checks the plan's D9 added.
//
// It reads the source files as TEXT on purpose. Importing them would prove
// the code still runs, which the 104 ported donor tests beside this file
// already do; only reading the bytes can prove the ATTRIBUTION still travels.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");

/**
 * Comment text with the block-comment furniture removed and whitespace
 * collapsed, so a prose assertion survives re-wrapping of the header.
 *
 * WHY it strips line-leading `*` with a `^...$` multiline anchor rather than
 * `\n\s*\*`: in the latter, `\s*` happily eats the NEWLINE of a blank ` *`
 * line, so one match swallows two lines and every other `*` survives —
 * leaving "MIT License * Copyright (c) 2020 Excalidraw *" and a test that
 * fails for a reason that has nothing to do with the licence. Found by
 * running it.
 */
const flatten = (source: string) => source.replace(/^\s*\*\s?/gm, "").replace(/\s+/g, " ");

describe("Excalidraw attribution travels with the code", () => {
  const router = read("elbowRouter.ts");

  it("keeps all eight @ported tags, with their upstream function names", () => {
    const tags = [...router.matchAll(/@ported Excalidraw `([^`]+)`/g)].map((match) => match[1]);
    // The donor's count and the donor's names. A refactor that renames or
    // absorbs one of these functions has to consciously update this list.
    expect(tags).toEqual([
      "calculateGrid",
      "pointToGridNode",
      "estimateSegmentCount",
      "astar",
      "pathTo",
      "generateDynamicAABBs",
      "getDonglePosition",
      "getElbowArrowCornerPoints",
    ]);
  });

  it("names the upstream file and the exact pinned revision", () => {
    expect(router).toContain("e1bb9ff8f8931e783c11d104abb8967ac6605c9a");
    expect(router).toContain("github.com/excalidraw/excalidraw");
  });

  it("carries the full MIT permission notice inline (TRACE-PLAN D9)", () => {
    // The notice is checked as ONE CONTIGUOUS BLOCK, flattened, rather than
    // as four independent `toContain`s.
    //
    // WHY, found by mutation testing (2026-09-17): the four-`toContain`
    // version stayed GREEN when the `Copyright (c) 2020 Excalidraw` line was
    // deleted from inside the notice — because the same words also appear in
    // the prose sentence above it ("ported from Excalidraw, MIT licensed,
    // Copyright (c) 2020 Excalidraw"). Loose substring checks over a file
    // that legitimately repeats its key phrases are not a licence check;
    // adjacency is what makes this one.
    const flat = flatten(router);
    expect(flat).toContain(
      "MIT License Copyright (c) 2020 Excalidraw Permission is hereby granted, "
      + "free of charge, to any person obtaining a copy of this software and "
      + "associated documentation files",
    );
    expect(flat).toContain(
      "The above copyright notice and this permission notice shall be included "
      + "in all copies or substantial portions of the Software.",
    );
    expect(flat).toContain(
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS '
      + "OR IMPLIED",
    );
    expect(flat).toContain("ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE");
  });

  it("does not inherit the donor's dangling THIRD_PARTY_NOTICES.md promise", () => {
    // The donor's header promises that file "travels with this repository".
    // It does not exist anywhere in /home/bam/systemsketch (verified by
    // `find`, 2026-09-17). Copying that sentence forward would have imported
    // a broken promise.
    //
    // The assertion is on the PROMISE, not on the filename — the filename is
    // still mentioned, and should be: hiding the donor's claim would make the
    // correction unverifiable. What must be true is that the sentence appears
    // EXACTLY ONCE and only as a quotation of what the donor said, with the
    // correction attached. The comment-prefix strip is what lets a check like
    // this survive re-wrapping of the header.
    const flat = flatten(router);
    const promises = flat.split("travels with this repository in").length - 1;
    expect(promises).toBe(1);
    expect(flat).toContain('The donor said "the full MIT permission notice travels with this repository in');
    expect(flat).toContain("does not exist anywhere in");
  });
});

describe("the donor's own provenance sections travel too", () => {
  it("nudge.ts keeps its full PROVENANCE section, licences included", () => {
    const nudge = read("nudge.ts");
    expect(nudge).toContain("PROVENANCE");
    // The lineage, by name. These are not decoration: they are the record of
    // what was read and under which licence.
    expect(nudge).toContain("Hashimoto & Stevens");
    expect(nudge).toContain("OrthogonalRoutingGenerator");
    expect(nudge).toContain("CombinatorialNudger");
    expect(nudge).toContain("orthogonalRouter");
    expect(nudge).toContain("Pupyrev");
    // Legal posture, not trivia: LGPL is not an attribution licence, so a
    // comment could not discharge it and the code was deliberately NOT read.
    expect(nudge).toContain("libavoid");
    expect(nudge).toContain("LGPL");
    expect(nudge).toContain("so neither was read");
  });

  it("elbowPins.ts keeps the why-not-fixedSegments argument and Zach's quote", () => {
    const pins = read("elbowPins.ts");
    expect(pins).toContain("fixedSegments");
    expect(pins).toContain("Dragging the box should drag everything inside frozen in place");
    // The frame maths the whole design rests on.
    expect(pins).toContain("mid + (t - 0.5) * span + offset");
  });

  it("geometry.ts keeps the dependency-free promise that makes the port legal-free", () => {
    expect(read("geometry.ts")).toContain("must stay importable from");
  });
});

describe("the port is a copy, and says so", () => {
  const PORTED = [
    "geometry.ts",
    "binaryHeap.ts",
    "elbowPins.ts",
    "elbowRouter.ts",
    "elbowPath.ts",
    "softClearance.ts",
    "nudge.ts",
    "boundaryCrossing.ts",
    "index.ts",
    "collisionRouting.ts",
    "elbowRouter.test.ts",
    "elbowPins.test.ts",
    "elbowPath.test.ts",
    "nudge.test.ts",
    "boundaryCrossing.test.ts",
    "collisionRouting.test.ts",
  ];

  it.each(PORTED)("%s names its donor file and the date it was copied", (name) => {
    const source = read(name);
    expect(source.startsWith("// =====")).toBe(true);
    expect(source).toContain("PORTED VERBATIM from SystemSketch");
    expect(source).toContain("/home/bam/systemsketch/src/blocks/");
  });

  it("no ported file imports a host engine, React, or anything off this folder", () => {
    // The rule bbox-ui's own CLAUDE.md puts first: "The core imports no canvas
    // engine." The elbow port is the largest block of code in this app, so it
    // is the one most able to break that rule by accident.
    for (const name of PORTED) {
      // WHY the line anchor and the `[^*/]` guard rather than a bare
      // /from ['"]...['"]/: the donor's own prose contains the sentence
      // `so callers can tell "nothing happened" from "here is an identical
      // list"`, which the naive pattern reads as an import of
      // `here is an identical list`. Found by running it. Only real import
      // lines — which never begin with a comment marker — are considered.
      const specifiers = [...read(name).matchAll(/^[^*/\n]*\bfrom\s+['"]([^'"]+)['"]/gm)]
        .map((match) => match[1]);
      for (const specifier of specifiers) {
        if (specifier === "vitest" || specifier === "node:fs" || specifier === "node:url") continue;
        expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\/[A-Za-z]/);
      }
    }
  });
});
