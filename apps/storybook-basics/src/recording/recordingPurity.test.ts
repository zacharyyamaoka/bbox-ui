// src/recording/recordingPurity.test.ts — the inner wall, stated as a test.
//
// `src/engineFree.test.ts` walls components/, scene/, editor/, presets/ and
// layout/ off from tldraw and React Flow. `recording/` sits OUTSIDE that wall
// on purpose: `flightRecorder.ts` reads tldraw through its public seams, and
// that is exactly its job. So the wall that matters for this feature is one
// level in, and only a test can see it.
//
// Zach, 2026-09-19: "the functions for that should be a seperate pure
// functoin. Its interface is that button and then the pop up that appears. we
// should have flexibility to kinda change the locaiton of the button or even
// what the itnerface looks like in the future."
//
// Two claims, and neither is provable by running the feature — a recorder
// that quietly reached `window.localStorage` or imported `react` would still
// record perfectly in a browser and pass every story:
//
//   1. the PURE modules import no React, no canvas engine, and touch no
//      global browser object — so a node test can drive the whole machine;
//   2. the CONTROL owns no recording logic — it never imports the core's
//      behaviour, only its types, so moving it or replacing it cannot change
//      what recording does.
//
// Deliberately textual, like engineFree.test.ts and trunkOwnership.test.ts:
// the rule is "no such specifier / no such global appears in this source".

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RECORDING = dirname(fileURLToPath(import.meta.url));
const EDITOR = join(RECORDING, "..", "editor");

/** The modules that must run in node with nothing around them. */
const PURE = [
  "recordingCore.ts",
  "recordingClient.ts",
  "fakeRecordingEffects.ts",
  "frameFallback.ts",
  "recordingDiagnostics.ts",
] as const;

/** The two that are allowed the world, and are the ONLY two. */
const IMPURE = ["recordingEffects.ts", "useRecording.ts"] as const;

const ENGINE_IMPORT = /from\s+["'](?:tldraw|@tldraw\/[^"']+|@xyflow\/[^"']+)["']/;
const REACT_IMPORT = /from\s+["']react(?:-dom)?(?:\/[^"']+)?["']/;
/** Globals only a browser has. Word-bounded so `documentation` is not a hit. */
const BROWSER_GLOBALS = [
  "\\bwindow\\.",
  "\\bdocument\\.",
  "\\bnavigator\\.",
  "\\blocalStorage\\b",
  "\\bsessionStorage\\b",
  "\\bsetTimeout\\(",
  "\\bsetInterval\\(",
  "\\brequestAnimationFrame\\(",
  "\\bfetch\\(",
];

/** Comments are prose — the same device as engineFree.test.ts:33-37. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?:^|\n)[ \t]*\/\/.*(?=\n|$)/g, "");
}

function read(file: string): string {
  expect(existsSync(file), `${file} exists`).toBe(true);
  return readFileSync(file, "utf8");
}

describe("the pure half is genuinely pure", () => {
  it.each(PURE)("%s imports no canvas engine and no React", (name) => {
    const code = withoutComments(read(join(RECORDING, name)));
    expect(code.match(ENGINE_IMPORT), "engine import").toBeNull();
    expect(code.match(REACT_IMPORT), "react import").toBeNull();
  });

  it.each(PURE)("%s touches no browser global", (name) => {
    const code = withoutComments(read(join(RECORDING, name)));
    const found = BROWSER_GLOBALS.filter((pattern) => new RegExp(pattern).test(code));
    expect(found).toEqual([]);
  });

  it("the core reaches the recorder only through the effects seam", () => {
    const code = withoutComments(read(join(RECORDING, "recordingCore.ts")));
    // Not even a type import: `RecordingPayload` names `TLStoreSnapshot`, so
    // the core restates the buffer's shape instead (RecordingBuffer).
    expect(code).not.toMatch(/from\s+["']\.\/flightRecorder["']/);
    expect(code).not.toMatch(/from\s+["']\.\/recordingEffects["']/);
    expect(code).toMatch(/export interface RecordingEffects/);
  });

  it("the patterns have teeth (regression guard for this test itself)", () => {
    expect('import { Box } from "tldraw";'.match(ENGINE_IMPORT)).not.toBeNull();
    expect('import { useState } from "react";'.match(REACT_IMPORT)).not.toBeNull();
    expect('import { createPortal } from "react-dom";'.match(REACT_IMPORT)).not.toBeNull();
    expect(new RegExp("\\bsetTimeout\\(").test("const h = setTimeout(fire, ms);")).toBe(true);
    // …and the real impure modules would fail the pure checks, which is what
    // makes a green run above meaningful rather than vacuous.
    const effects = withoutComments(read(join(RECORDING, IMPURE[0])));
    expect(effects.match(ENGINE_IMPORT), "recordingEffects.ts does import tldraw").not.toBeNull();
    const hook = withoutComments(read(join(RECORDING, IMPURE[1])));
    expect(hook.match(REACT_IMPORT), "useRecording.ts does import react").not.toBeNull();
  });
});

describe("the control is one interface onto the core, not its owner", () => {
  const control = () => withoutComments(read(join(EDITOR, "recordingControl.tsx")));

  it("imports the core for TYPES only — never its behaviour", () => {
    const code = control();
    const coreImports = [...code.matchAll(/import\s+(type\s+)?\{[^}]*\}\s+from\s+["']\.\.\/recording\/[^"']+["']/g)];
    expect(coreImports.length, "it does reference the recording types").toBeGreaterThan(0);
    for (const match of coreImports) {
      expect(match[1], `type-only: ${match[0].replace(/\s+/g, " ")}`).toBeDefined();
    }
  });

  it("holds none of the machine: no limit, no timer, no clipboard, no network", () => {
    const code = control();
    for (const forbidden of [
      "EXPLICIT_RECORDING_LIMIT_MS =",
      "createRecordingCore",
      "60_000",
      "navigator.clipboard",
      "setTimeout(",
      "fetch(",
      "FlightRecorder",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it("is driven entirely by props — state in, callbacks out", () => {
    const code = control();
    expect(code).toMatch(/state:\s*RecordingState/);
    for (const callback of ["onStart", "onStop", "onCopyLast", "onViewLast"]) {
      expect(code, callback).toContain(callback);
    }
  });

  it("the viewer is a modal over the stock Dialog, and reads a bundle it is given", () => {
    const viewer = withoutComments(read(join(EDITOR, "recordingViewer.tsx")));
    expect(viewer).toMatch(/from\s+["']\.\.\/components\/dialog["']/);
    expect(viewer.match(ENGINE_IMPORT), "engine import").toBeNull();
    expect(viewer).not.toContain("fetch(");
  });
});
