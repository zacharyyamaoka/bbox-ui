import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A structural gate, not a behavioural one.
 *
 * Six files each re-derived the field-resolution model and gave four different
 * answers to one question; three carried a defect that had already been fixed
 * in the fourth. Behavioural tests cannot catch that — each copy passes its
 * own tests. Only "there is exactly one implementation" can.
 *
 * If a panel genuinely needs something `readFieldRow` does not return, widen
 * the model. Do not resolve again here.
 */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function panelFiles(): string[] {
  const variants = readdirSync(path.join(SRC, "variants"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join("variants", f));
  return [...variants, "FieldTraceRow.tsx", "ComponentInspector.tsx"];
}

/** Strip block and line comments so a file DISCUSSING resolveField in a WHY
 *  comment is not mistaken for one calling it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("one resolution model", () => {
  it("finds panels to check at all", () => {
    // Without this, a bad glob would make every assertion below vacuous.
    const files = panelFiles();
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(files).toContain("FieldTraceRow.tsx");
    expect(files.some((f) => f.includes("FigmaDense"))).toBe(true);
  });

  it("no panel calls resolveField directly", () => {
    const offenders = panelFiles().filter((rel) =>
      /\bresolveField\s*\(/.test(code(readFileSync(path.join(SRC, rel), "utf8"))),
    );
    expect(offenders).toEqual([]);
  });

  it("no panel re-derives the single-subject gate", () => {
    // The literal shape of the defect: picking ONE subject out of the
    // selection and resolving against it.
    //
    // Deliberately narrow. A first cut matched any `subjects.length === 1 ?`
    // and flagged `subjects.length === 1 ? "1 selected" : …` in a header,
    // which is a correct English plural and not this defect at all. A
    // structural gate that cries wolf gets deleted, so it only matches the
    // ternary REACHING FOR A SUBJECT.
    const offenders = panelFiles().filter((rel) => {
      const text = code(readFileSync(path.join(SRC, rel), "utf8"));
      return (
        /subjects\.length\s*===\s*1\s*\?\s*subjects\[0\]/.test(text) ||
        /\b(?:const|let)\s+\w+\s*=\s*subjects\[0\]\s*;/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("that gate check actually fires on the defect it names", () => {
    // Mutation-testing the gate itself, inline: the two shapes above must be
    // matched, and the header plural must not. Without this the assertion
    // could be vacuous and nobody would know.
    const defectA = "const single = subjects.length === 1 ? subjects[0] : null;";
    const defectB = "const representative = subjects[0];";
    const innocent = '{subjects.length === 1 ? "1 selected" : `${subjects.length} selected`}';
    const gate = (text: string) =>
      /subjects\.length\s*===\s*1\s*\?\s*subjects\[0\]/.test(text) ||
      /\b(?:const|let)\s+\w+\s*=\s*subjects\[0\]\s*;/.test(text);
    expect(gate(defectA)).toBe(true);
    expect(gate(defectB)).toBe(true);
    expect(gate(innocent)).toBe(false);
  });

  it("no panel re-implements the tier rule", () => {
    // The same failure shape, one level up: FigmaDense now carries the
    // Simple/Advanced/Expert switch that Tiered introduced, because Zach's
    // call was that tiering helps "regardless of whatever you're doing". Two
    // classifiers would disagree the first time a field's tier was
    // reconsidered.
    const offenders = panelFiles().filter((rel) => {
      const text = code(readFileSync(path.join(SRC, rel), "utf8"));
      return /function\s+classifyField\s*\(/.test(text) || /TIER_RANK\s*[:=]\s*\{/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("the shared model is the only place the two resolutions are computed", () => {
    const model = readFileSync(path.join(SRC, "fieldModel.ts"), "utf8");
    const calls = code(model).match(/\bresolveField\s*\(/g) ?? [];
    // Exactly two: the stored resolution and the painted one. A third means
    // someone added a question without deciding which of those it belongs to.
    expect(calls.length).toBe(2);
  });
});
