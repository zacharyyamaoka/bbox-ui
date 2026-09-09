/**
 * The `signature` grammar's parse tree: `name: Type = default`, the way
 * Python already spells a parameter —
 *
 *   pose: Pose = None
 *   window: int = 5
 *   temperature sensor readings          ← free text is a name, nothing else
 *
 * WHY one text field and not three boxes: a port on a whiteboard (or any
 * labelled slot) is a label first and a typed parameter second. Three boxes
 * impose the parameter's structure on someone who is only naming a thing,
 * while one line lets the structure appear exactly when it is typed — a `:`
 * makes a type, an `=` makes a default — and disappear when it is deleted.
 *
 * WHY depth-0 splitting: brackets and quotes are respected so
 * `dict[str, int]`, `Callable[[int], str] = f` and `lambda x: x` all land
 * in the slot they belong to, and a name may itself contain a space
 * (`chassis width: float`) without ambiguity — nobody names a slot with a
 * dict literal, so the first depth-0 `:` is unambiguously the type's.
 *
 * This module is pure parsing — no CodeMirror, no host. `signatureGrammar`
 * (in `signatureGrammar.ts`) turns it into a `CodeFieldGrammar`.
 */

export type SignatureSlot = "name" | "type" | "default";

export interface SignatureSpan {
  start: number;
  end: number;
}

export interface SignatureValue {
  name: string;
  type: string;
  defaultValue: string;
}

export interface ParsedSignature extends SignatureValue {
  /** Untrimmed character ranges of each slot in the source text. */
  spans: {
    name: SignatureSpan;
    colon: number | null;
    type: SignatureSpan | null;
    equals: number | null;
    default: SignatureSpan | null;
  };
}

interface SplitPoints {
  colon: number;
  equals: number;
}

/** The first depth-0 `:` (before any `=`) and the first depth-0 assignment `=`. */
function splitPoints(text: string): SplitPoints {
  let depth = 0;
  let quote: string | null = null;
  let colon = -1;
  let equals = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (char === ":" && colon < 0 && text[index + 1] !== "=") {
      colon = index;
      continue;
    }
    if (char === "=") {
      const previous = text[index - 1] ?? "";
      const next = text[index + 1] ?? "";
      // `==`, `!=`, `<=`, `>=` are comparisons, `:=` is a walrus; only a
      // bare `=` is the default's assignment.
      if (next === "=" || "=!<>:".includes(previous)) continue;
      equals = index;
      break;
    }
  }
  return { colon, equals };
}

function trimmedSpan(text: string, start: number, end: number): SignatureSpan {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(text[from]!)) from += 1;
  while (to > from && /\s/.test(text[to - 1]!)) to -= 1;
  return { start: from, end: to };
}

export function parseSignature(text: string): ParsedSignature {
  const { colon, equals } = splitPoints(text);
  const nameEnd = colon >= 0 ? colon : equals >= 0 ? equals : text.length;
  const typeEnd = equals >= 0 ? equals : text.length;
  const name = trimmedSpan(text, 0, nameEnd);
  const type = colon >= 0 ? trimmedSpan(text, colon + 1, typeEnd) : null;
  const defaultSpan = equals >= 0 ? trimmedSpan(text, equals + 1, text.length) : null;
  return {
    name: text.slice(name.start, name.end),
    type: type ? text.slice(type.start, type.end) : "",
    defaultValue: defaultSpan ? text.slice(defaultSpan.start, defaultSpan.end) : "",
    spans: {
      name,
      colon: colon >= 0 ? colon : null,
      type,
      equals: equals >= 0 ? equals : null,
      default: defaultSpan,
    },
  };
}

/** The canonical spelling of a `{ name, type, defaultValue }` triple. */
export function formatSignature(value: SignatureValue): string {
  const type = value.type ? `: ${value.type}` : "";
  const defaultValue = value.defaultValue ? ` = ${value.defaultValue}` : "";
  return `${value.name}${type}${defaultValue}`;
}

export interface SignatureSlotAt {
  slot: SignatureSlot;
  /** Where the slot's text begins — the point a completion replaces from. */
  start: number;
  end: number;
  /** The slot's text from its start to the caret, trimmed. */
  query: string;
}

/**
 * Which slot the caret is in. This is what makes the grammar grammar-aware:
 * the same keystroke offers types after a `:`, values after an `=`, and —
 * deliberately — nothing at all while a name is being typed.
 *
 * One signature is one line. Given a multi-line lane, the grammar is
 * applied to the caret's own line, with every offset reported against the
 * whole text so a completion can splice into the document directly.
 */
export function signatureSlotAt(text: string, caret: number): SignatureSlotAt {
  const at = Math.max(0, Math.min(caret, text.length));
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const nextBreak = text.indexOf("\n", at);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);
  const local = at - lineStart;
  const { colon, equals } = splitPoints(line);
  const shift = (found: SignatureSlotAt): SignatureSlotAt => ({
    ...found,
    start: found.start + lineStart,
    end: found.end + lineStart,
  });
  if (equals >= 0 && local > equals) {
    const start = leadingSpaceEnd(line, equals + 1);
    return shift({ slot: "default", start, end: line.length, query: line.slice(start, local).trim() });
  }
  if (colon >= 0 && local > colon) {
    const start = leadingSpaceEnd(line, colon + 1);
    const end = equals >= 0 ? equals : line.length;
    return shift({ slot: "type", start, end, query: line.slice(start, Math.min(local, end)).trim() });
  }
  const end = colon >= 0 ? colon : equals >= 0 ? equals : line.length;
  return shift({ slot: "name", start: 0, end, query: line.slice(0, Math.min(local, end)).trim() });
}

/**
 * Every line of a lane parsed, with its spans shifted to whole-text
 * offsets. This is the parse the lane's decorations use — one call, all
 * lines — not a reconciler: turning these lines into a list of stored
 * objects (assigning ids, matching an edited line back to the record it
 * came from, handling insert/delete/reorder) is genuinely host-specific
 * and stays out of this package.
 */
export function parseSignatureLines(
  text: string,
): Array<ParsedSignature & { lineStart: number; lineEnd: number }> {
  const lines: Array<ParsedSignature & { lineStart: number; lineEnd: number }> = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const parsed = parseSignature(line);
    const shiftSpan = (span: SignatureSpan | null) =>
      span ? { start: span.start + lineStart, end: span.end + lineStart } : null;
    lines.push({
      ...parsed,
      spans: {
        name: shiftSpan(parsed.spans.name)!,
        colon: parsed.spans.colon === null ? null : parsed.spans.colon + lineStart,
        type: shiftSpan(parsed.spans.type),
        equals: parsed.spans.equals === null ? null : parsed.spans.equals + lineStart,
        default: shiftSpan(parsed.spans.default),
      },
      lineStart,
      lineEnd: lineStart + line.length,
    });
    lineStart += line.length + 1;
  }
  return lines;
}

function leadingSpaceEnd(text: string, from: number): number {
  let index = from;
  while (index < text.length && text[index] === " ") index += 1;
  return index;
}

/**
 * The patch a typed line means for a stored `{ name, type, defaultValue }`
 * triple, or `null` when it already says exactly this. An empty default
 * clears the key rather than storing `''`, so a value that never had one
 * stays byte-identical after a rename. This is the single-record half of
 * the write seam; reconciling several lane lines back into a list of
 * records with stable identity is the host's job (see `parseSignatureLines`).
 */
export function signaturePatch(
  current: SignatureValue,
  text: string,
): Partial<SignatureValue> | null {
  const parsed = parseSignature(text);
  const patch: Partial<SignatureValue> = {};
  if (parsed.name !== current.name) patch.name = parsed.name;
  if (parsed.type !== current.type) patch.type = parsed.type;
  if (parsed.defaultValue !== current.defaultValue) patch.defaultValue = parsed.defaultValue;
  return Object.keys(patch).length === 0 ? null : patch;
}
