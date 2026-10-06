// src/settingsAreWired.test.ts — the guard that stops a setting shipping dead.
//
// Zach, 2026-09-22: "there is the toogle but it doesn't seem to work.. perhaps
// you can check if there are other similar bugs as well?" There were. The
// pathology has now happened at least four separate times in this app —
// interface scale (2026-09-20), every wheel preference (2026-09-21),
// `showZoomButtons`, and `pasteUnderCursor` (today) — each time the same shape:
// a control that renders, validates and PERSISTS correctly, read by nobody, so
// the switch moves and the canvas does not. Every one was caught by a human
// noticing, which is the expensive way.
//
// This test is the cheap way. It is deliberately a RATCHET, not a pass/fail on
// perfection: the fields that are dead TODAY are listed below with why, and the
// list can only shrink. A NEW setting cannot join it without saying so out loud.
//
// WHAT A CONSUMER IS, mechanically: a file that (1) imports the setting's own
// model module and (2) names the field in CODE. Both halves are load-bearing and
// both were learned by getting it wrong first:
//
//   - Comments must be stripped, or the test reads the repo's own honest prose
//     about a dead setting as proof it is alive. Measured 2026-09-22: a plain
//     text scan called `modifierWheelZoomsOppositely`, `allowHiddenPorts` and
//     `allowFanOut` all LIVE, matching only the comments that say they are
//     inert. A self-description is not the artifact.
//   - The import must be required, or an unrelated identifier of the same name
//     counts. Same measurement: `bindings` matched `document/editEvents.ts`,
//     which means tldraw's binding utils and has nothing to do with wheel
//     gestures.
//
// WHAT THIS CANNOT SEE, stated rather than implied: it proves a field is READ,
// never that reading it CHANGES anything. `allowSamePolarity` passes as live —
// `validationLevelHost.ts`'s `connectionPolicyOf` really does forward it — while
// deciding nothing, because no port carries a direction for it to compare
// (`chrome/problems.ts`, `shapes/wire/wireGesture.ts`). A field that must be
// proved to MOVE something needs a behavioural test beside this one; the two
// paste/duplicate halves have theirs in `./pasteUnderCursor.smoke.test.tsx`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE_PREFERENCES } from "@trunk/editor/appearancePreferences";
import { DEFAULT_EDGE_POLICY } from "@trunk/editor/edgePolicy";
import { DEFAULT_GESTURE_SETTINGS } from "@trunk/editor/gestureSettings";

/** The three records a host stores, each mapped to the module that declares it.
 *  Field names are read off the DEFAULTS at runtime rather than retyped, so a
 *  field added to a model shows up here without anyone remembering to add it —
 *  that is the whole point of the ratchet. */
const RECORDS = [
  { module: "gestureSettings", fields: Object.keys(DEFAULT_GESTURE_SETTINGS) },
  { module: "appearancePreferences", fields: Object.keys(DEFAULT_APPEARANCE_PREFERENCES) },
  { module: "edgePolicy", fields: Object.keys(DEFAULT_EDGE_POLICY) },
];

/**
 * The writer, the model and the mirror. None of these is a consumer:
 * `settingsCategories.tsx` is the control that writes the value,
 * `appSettings.tsx`/`settingsView.tsx` are the dialog reading its own control
 * back, the model files declare/default/validate/compare, and a test or story
 * asserts on it without any user's canvas changing.
 */
const NOT_A_CONSUMER = new Set([
  "gestureSettings.ts", "appearancePreferences.ts", "edgePolicy.ts", "interfaceScale.ts",
  "toolAliases.ts", "appSettings.ts", "settingsCategories.tsx", "settingsView.tsx", "appSettings.tsx",
]);

/**
 * Dead today, each with what it would actually take — never a silent deletion
 * and never a fake wiring. THIS LIST MAY ONLY SHRINK. A field that gains a
 * consumer must be removed from it (the test below fails if it is not), and a
 * new field may not be added without a reason written here.
 */
const QUARANTINE: Record<string, string> = {
  // Four rows in the panel (one per wheel gesture), one field in the record.
  // Rebinding an arbitrary command to a wheel gesture needs this app to own a
  // wheel LISTENER, which is a hand-rolled gesture engine on top of a stock one
  // — refused by `document/stockBoundary.test.ts` and by App.tsx's own thesis.
  // Already named as not-applied at `chrome/ShareMenu/cameraGestureHost.tsx`.
  bindings: "needs a host-owned wheel listener; deliberately not applied",
  // tldraw 5.3.2 flips pan/zoom on Ctrl unconditionally (Editor.js:8159) and
  // exposes no seam for ALSO reversing the plain wheel's direction.
  modifierWheelZoomsOppositely: "no tldraw seam; would need a host-owned wheel listener",
  // No gate in `scene/edgeValidation.ts` and no rule in `scene/lint.ts`.
  allowHiddenPorts: "needs a new validation gate and lint rule",
  allowFanOut: "needs a new validation gate and lint rule",
};

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry)) continue;
      if (NOT_A_CONSUMER.has(entry)) continue;
      if (/\.(test\.tsx?|stories\.tsx)$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Block comments first, then line comments — prose is not evidence. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^.*?\/\/.*$/gm, (line) => line.replace(/\/\/.*$/, " "));
}

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TREES = [HERE, path.resolve(HERE, "../../storybook-basics/src")];

const FILES = TREES.flatMap(sourceFiles).map((file) => {
  const raw = readFileSync(file, "utf8");
  return { file, raw, code: codeOnly(raw) };
});

/** Files that import the model, so a same-named identifier elsewhere cannot vote. */
function importersOf(module: string) {
  const importsIt = new RegExp(String.raw`from\s+["'][^"']*\b${module}["']`);
  return FILES.filter((f) => importsIt.test(f.raw));
}

function consumersOf(module: string, field: string): string[] {
  const names = new RegExp(String.raw`\b${field}\b`);
  return importersOf(module).filter((f) => names.test(f.code)).map((f) => path.relative(HERE, f.file));
}

describe("every setting a host stores is read by something", () => {
  it.each(RECORDS.flatMap(({ module, fields }) => fields.map((field) => ({ module, field }))))(
    "$module.$field is wired, or quarantined with a reason",
    ({ module, field }) => {
      const consumers = consumersOf(module, field);
      const quarantined = field in QUARANTINE;

      if (quarantined) {
        // The ratchet's teeth: once something reads it, the excuse must go.
        expect(
          consumers,
          `${module}.${field} is quarantined as "${QUARANTINE[field]}" but IS now read by ${consumers.join(", ")} — delete its QUARANTINE entry.`,
        ).toHaveLength(0);
        return;
      }

      expect(
        consumers.length,
        `${module}.${field} renders a control and persists, but NOTHING outside the settings modules reads it — `
        + "this is the bug Zach reported on 2026-09-22. Wire it in apps/systemsketch (interaction geometry is "
        + "host-owned), or add it to QUARANTINE with what it would take.",
      ).toBeGreaterThan(0);
    },
  );

  it("the quarantine list names only fields that exist, so a renamed field cannot hide in it", () => {
    const every = new Set(RECORDS.flatMap((r) => r.fields));
    for (const field of Object.keys(QUARANTINE)) {
      expect(every, `QUARANTINE names "${field}", which is no longer a setting field`).toContain(field);
    }
  });

  it("scans a real corpus — a guard that silently matched no files would pass everything", () => {
    // Without this, a bad path above turns the whole suite vacuous: zero
    // importers means zero consumers means every field looks quarantined-clean.
    expect(FILES.length).toBeGreaterThan(200);
    expect(importersOf("gestureSettings").length).toBeGreaterThan(0);
    expect(importersOf("edgePolicy").length).toBeGreaterThan(0);
  });
});
