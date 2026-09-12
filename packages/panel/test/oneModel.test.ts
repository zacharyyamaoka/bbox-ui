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

/** Every <input …> tag, scanned brace-aware so a `>` inside an attribute
 *  expression (an arrow function, a ternary) does not end the tag early. */
function inputTags(text: string): string[] {
  const out: string[] = [];
  let i = text.indexOf("<input");
  while (i !== -1) {
    let depth = 0;
    let j = i;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push(text.slice(i, j + 1));
    i = text.indexOf("<input", j + 1);
  }
  return out;
}

function controlledNumber(tag: string): boolean {
  return /type\s*=\s*(?:"number"|'number'|\{\s*"number"\s*\}|\{\s*'number'\s*\})/.test(tag) && /(?:^|\s)value\s*=/.test(tag);
}

/** A DECLARATION of hasOwnOverride from anything but the shared model. A JSX
 *  prop `hasOwnOverride={…}` is passing the model's answer along, not
 *  re-deriving it, so only `const/let/var hasOwnOverride =` counts. */
function rederivesOverride(text: string): boolean {
  // `=(?!\s*row…)` and not `=\s*(?!row…)`: with the whitespace outside the
  // lookahead, \s* backtracks to zero and the lookahead is tested at a space,
  // so the innocent `= row.hasOwnOverride` matched too.
  return /\b(?:const|let|var)\s+hasOwnOverride\s*=(?!\s*row\.hasOwnOverride\b)/.test(text);
}

/** A clear button conditioned on "governed" in either order. */
function governedGate(text: string): boolean {
  return /(?:isGoverned|governed(?:\.has\([^)]*\))?)\s*&&\s*[\w.]*hasOwnOverride/.test(text) ||
    /[\w.]*hasOwnOverride\s*&&\s*(?:isGoverned|governed(?:\.has\([^)]*\))?)/.test(text);
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

  it("no panel gates the clear-override button on the field being governed", () => {
    // Round 3 of the first loop fixed this in FieldTraceRow and left the
    // gate standing in FigmaDense and IconStrip: 61 of 65 rows could enter
    // the override layer and never leave it, in the chosen default panel.
    // Order-independent: `governed && hasOwnOverride` and the reverse are the
    // same defect (round 2 showed the first regex missed the reverse).
    const offenders = panelFiles().filter((rel) => governedGate(code(readFileSync(path.join(SRC, rel), "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("no panel re-derives hasOwnOverride from anything but the shared model", () => {
    // Row Popover computed it from the WINNER, which is null for a Mixed
    // selection, so an override became unclearable the moment a second
    // instance was selected. The model already answers "is something stored".
    const offenders = panelFiles().filter((rel) => {
      const text = code(readFileSync(path.join(SRC, rel), "utf8"));
      return rederivesOverride(text);
    });
    expect(offenders).toEqual([]);
  });

  it("no panel owns a controlled number input; NumberInput is the only one", () => {
    // The padding-box fix reached two of three copies. A controlled
    // type="number" with a value= prop is the shape of the defect; the
    // uncontrolled "Custom" rows (defaultValue=) are a different control and
    // are allowed. Tags are scanned brace-aware: the first regex stopped at
    // the `>` inside an arrow function and missed a reordered defect.
    const offenders: string[] = [];
    for (const rel of panelFiles()) {
      for (const tag of inputTags(code(readFileSync(path.join(SRC, rel), "utf8")))) {
        if (controlledNumber(tag)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("those two gates fire on the shapes round 2 showed slipping past", () => {
    const reordered = `<input\n  type="number"\n  onChange={(e) => onChange(Number(e.target.value))}\n  value={value === undefined ? "" : Number(value)}\n/>`;
    const singleQuoted = `<input type='number' value={draft} />`;
    const braced = `<input type={"number"} style={{ w: n > 2 ? 40 : 20 }} value={draft} />`;
    const uncontrolled = `<input type="number" defaultValue={custom.value ?? ""} onBlur={(e) => go(e)} />`;
    expect(inputTags(reordered).some(controlledNumber)).toBe(true);
    expect(inputTags(singleQuoted).some(controlledNumber)).toBe(true);
    expect(inputTags(braced).some(controlledNumber)).toBe(true);
    expect(inputTags(uncontrolled).some(controlledNumber)).toBe(false);
    expect(governedGate("{isGoverned && data.hasOwnOverride && (")).toBe(true);
    expect(governedGate("{data.hasOwnOverride && isGoverned && (")).toBe(true);
    expect(governedGate("{governed.has(field.id) && r.hasOwnOverride && (")).toBe(true);
    expect(governedGate("{r.hasOwnOverride && (")).toBe(false);
    // Round 2's Row Popover defect, verbatim, and the two innocent shapes.
    expect(rederivesOverride('const hasOwnOverride = state.winner === "override";')).toBe(true);
    expect(rederivesOverride("const hasOwnOverride = row.hasOwnOverride;")).toBe(false);
    expect(rederivesOverride("<Shell hasOwnOverride={r.hasOwnOverride} />")).toBe(false);
  });

  it("the shared model is the only place the two resolutions are computed", () => {
    const model = readFileSync(path.join(SRC, "fieldModel.ts"), "utf8");
    const calls = code(model).match(/\bresolveField\s*\(/g) ?? [];
    // Exactly two: the stored resolution and the painted one. A third means
    // someone added a question without deciding which of those it belongs to.
    expect(calls.length).toBe(2);
  });
});
