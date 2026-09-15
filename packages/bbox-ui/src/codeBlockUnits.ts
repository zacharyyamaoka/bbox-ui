/**
 * Semantic UNITS of a code document — the thing `flatten` paints as one row.
 *
 * Zach, 2026-09-15: "when you are doing the multiline port editor, each
 * line of code semantically should be flattened to a single line, as each
 * line is associated with one port ... in the expanded view you may have a
 * large multiline default value, but in this view it should display flat."
 * A port line is `name: Type = default`, and a default can span lines — a
 * dict literal, a call with one argument per line, a triple-quoted string.
 * What makes those ONE unit is exactly Python's own line-continuation rule:
 * a physical newline only ends a statement when every bracket is closed,
 * no triple-quoted string is open, and the line does not end in `\`. This
 * module is that rule, and nothing more — no parser, no grammar; a grammar
 * that knows better supplies its own `units` (`CodeBlockGrammar.units`).
 *
 * Pure: no React, no CodeMirror, no DOM. Offsets are UTF-16 code units into
 * `text` with `\n` line breaks (CodeMirror normalises `\r\n` on load).
 */

export interface UnitRange {
  /** Offset of the unit's first character (its first line's start). */
  from: number;
  /** Offset just past the unit's last character — the position of the
   * newline that ENDS it (or `text.length` for the last unit). */
  to: number;
}

export type UnitsFn = (text: string) => UnitRange[];

const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);

/**
 * Python's continuation rule, as unit ranges that PARTITION the text's
 * lines: every line belongs to exactly one unit, blank lines included (a
 * blank line at depth 0 is its own unit — it is one lane row, an empty one).
 * A run-away bracket or an unterminated triple quote simply swallows every
 * line to the end, which is what Python itself would do with it.
 */
export function pythonUnits(text: string): UnitRange[] {
  const units: UnitRange[] = [];
  let depth = 0;
  let inTriple: string | null = null; // `'''` or `"""`
  let inString: string | null = null; // `'` or `"` — never survives a newline
  let unitFrom = 0;
  let i = 0;
  const length = text.length;
  while (i < length) {
    const ch = text[i]!;
    if (inTriple) {
      if (text.startsWith(inTriple, i)) {
        inTriple = null;
        i += 3;
        continue;
      }
      if (ch === "\\") {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      else if (ch === "\n") {
        // Python would already have errored; the newline still ends the
        // line here so a typo never glues the rest of the lane together.
        inString = null;
        i -= 1; // re-read the newline as a structural one below
      }
      i += 1;
      continue;
    }
    if (ch === "#") {
      // A comment runs to the end of the line; brackets in it don't count.
      while (i < length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const triple = ch.repeat(3);
      if (text.startsWith(triple, i)) {
        inTriple = triple;
        i += 3;
      } else {
        inString = ch;
        i += 1;
      }
      continue;
    }
    if (OPENERS.has(ch)) depth += 1;
    else if (CLOSERS.has(ch)) depth = Math.max(0, depth - 1);
    else if (ch === "\n") {
      const continued = depth > 0 || text[i - 1] === "\\";
      if (!continued) {
        units.push({ from: unitFrom, to: i });
        unitFrom = i + 1;
      }
    }
    i += 1;
  }
  units.push({ from: unitFrom, to: length });
  return units;
}

/** Offsets of every newline INSIDE a unit — the ones `flatten` folds. */
export function innerNewlines(text: string, units: UnitRange[]): number[] {
  const offsets: number[] = [];
  for (const unit of units) {
    for (let i = unit.from; i < unit.to; i += 1) {
      if (text.charCodeAt(i) === 10) offsets.push(i);
    }
  }
  return offsets;
}

/**
 * 1-based unit number of the unit containing `offset` — what the gutter
 * prints under `flatten` instead of the physical line number, so the rows
 * read 1, 2, 3 (Zach's default: the gutter counts units).
 */
export function unitNumberAt(units: UnitRange[], offset: number): number {
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!;
    if (offset >= unit.from && offset <= unit.to) return index + 1;
  }
  return units.length;
}
