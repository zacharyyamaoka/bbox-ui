import { python } from "@codemirror/lang-python";
import type { Extension } from "@codemirror/state";

import type {
  CodeFieldCompletion,
  CodeFieldCompletionResult,
  CodeFieldDecorationRange,
  CodeFieldGrammar,
  CodeFieldLine,
  CodeFieldReference,
  CodeFieldSegment,
  CodeFieldSlotAt,
} from "./codeGrammar";
import { parseSignatureLines, signatureSlotAt } from "./signature";

export interface SignatureCompletionItem {
  label: string;
  detail?: string;
  /** CodeMirror's completion `type`, and the `completionBadge` lookup key (see `kindLabels`). Omit for no badge. */
  kind?: string;
}

export interface SignatureGrammarOptions {
  /** Offered after `:`, narrowed by CodeMirror's own match-as-you-type against what follows. */
  types?: readonly SignatureCompletionItem[];
  /** Offered after `=`. */
  values?: readonly SignatureCompletionItem[];
  /**
   * The language mounted for the default slot's own tokens (numbers,
   * strings, operators) — everything the three `bbox-sig-*` marks below
   * don't already colour. Pass `null` to mount none.
   */
  language?: Extension | null;
  /** See `CodeFieldGrammar.foldInactiveLinesAfter` — only meaningful on a multi-line lane. */
  foldInactiveLinesAfter?: number;
  /**
   * What a type name resolves to in the RENDERED tree: a click target
   * (`onJump`) and/or fields to show in place (`expandLines`). Omit to
   * render every type name as plain accent text with no reference
   * behaviour — the common case for a port line, which has nothing to
   * expand into.
   */
  resolveReference?(name: string): CodeFieldReference | null;
  /** Badge label per `SignatureCompletionItem.kind` (e.g. `{ "board-type": "board type" }`). Omit for no completion badges. */
  kindLabels?: Record<string, string>;
}

function decorate(text: string): CodeFieldDecorationRange[] {
  const ranges: CodeFieldDecorationRange[] = [];
  // One signature is one line; a lane is several — this walks every line so
  // the same grammar works whether `CodeField` is single-line or `multiline`.
  for (const { spans } of parseSignatureLines(text)) {
    if (spans.name.end > spans.name.start) {
      ranges.push({ from: spans.name.start, to: spans.name.end, className: "bbox-sig-name" });
    }
    if (spans.colon !== null) {
      ranges.push({ from: spans.colon, to: spans.colon + 1, className: "bbox-sig-punct" });
    }
    if (spans.type && spans.type.end > spans.type.start) {
      ranges.push({ from: spans.type.start, to: spans.type.end, className: "bbox-sig-type" });
    }
    if (spans.equals !== null) {
      ranges.push({ from: spans.equals, to: spans.equals + 1, className: "bbox-sig-punct" });
    }
    if (spans.default && spans.default.end > spans.default.start) {
      ranges.push({ from: spans.default.start, to: spans.default.end, className: "bbox-sig-default" });
    }
  }
  return ranges;
}

/**
 * The RENDERED-mode rows: one per line, split into the same three roles
 * `decorate` marks in source mode. Segments are sliced straight out of the
 * source (never a fabricated `": "` literal) so whatever spacing was
 * authored survives untouched — the gaps between captured spans (the
 * colon, the equals sign, any surrounding whitespace) become their own
 * `"punct"` segment rather than being silently dropped or normalised.
 */
function lines(text: string): CodeFieldLine[] {
  return parseSignatureLines(text).map((parsed, index) => {
    const { spans, lineStart, lineEnd } = parsed;
    const captured: Array<{ start: number; end: number; role: string; isReference?: boolean }> = [];
    if (spans.name.end > spans.name.start) {
      captured.push({ start: spans.name.start, end: spans.name.end, role: "name" });
    }
    if (spans.type && spans.type.end > spans.type.start) {
      captured.push({ start: spans.type.start, end: spans.type.end, role: "type", isReference: true });
    }
    if (spans.default && spans.default.end > spans.default.start) {
      captured.push({ start: spans.default.start, end: spans.default.end, role: "default" });
    }
    captured.sort((a, b) => a.start - b.start);
    const segments: CodeFieldSegment[] = [];
    let cursor = lineStart;
    for (const span of captured) {
      if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), role: "punct" });
      segments.push({ text: text.slice(span.start, span.end), role: span.role, isReference: span.isReference });
      cursor = span.end;
    }
    if (cursor < lineEnd) segments.push({ text: text.slice(cursor, lineEnd), role: "punct" });
    return { line: index, lineStart, indent: 0, segments };
  });
}

/** The identifier immediately before `pos` — where a value completion replaces from. */
function wordBefore(text: string, pos: number): { from: number; query: string } {
  let start = pos;
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1]!)) start -= 1;
  return { from: start, query: text.slice(start, pos) };
}

function toCompletions(items: readonly SignatureCompletionItem[]): CodeFieldCompletion[] {
  return items.map((item) => ({ label: item.label, detail: item.detail, type: item.kind }));
}

/**
 * One completion source, dispatched by slot. A name gets nothing — typing a
 * label must never be interrupted, and free text is a legal name. A `:`
 * offers `types`, narrowed as you type; an `=` offers `values`.
 *
 * WHY no completion for `name`: Zach's rule, carried over from the grammar
 * this was extracted from — a port (or any labelled slot) is a label
 * first, and a completion popup over ordinary prose reads as the field
 * correcting you.
 */
function complete(
  types: readonly SignatureCompletionItem[],
  values: readonly SignatureCompletionItem[],
) {
  return (
    slot: CodeFieldSlotAt | null,
    _query: string,
    ctx: { text: string; pos: number; explicit: boolean },
  ): CodeFieldCompletionResult | null => {
    if (!slot || slot.slot === "name") return null;
    if (slot.slot === "type") {
      if (types.length === 0) return null;
      return { from: slot.start, to: ctx.pos, options: toCompletions(types) };
    }
    if (values.length === 0) return null;
    const { from } = wordBefore(ctx.text, ctx.pos);
    return { from, to: ctx.pos, options: toCompletions(values) };
  };
}

/**
 * The `signature` grammar: `name: Type = default`. Ships with `CodeField`
 * as its first grammar — plug in `types`/`values` and you have a port row
 * or lane; add `resolveReference` and the same grammar drives a rendered
 * tree (a Type's own attribute body, say) with clickable/expandable type
 * names. The same `decorate`/`complete`/`lines`/`slotAt` work whether the
 * field holds one line or many.
 */
export function signatureGrammar(options: SignatureGrammarOptions = {}): CodeFieldGrammar {
  const {
    types = [],
    values = [],
    language,
    foldInactiveLinesAfter,
    resolveReference,
    kindLabels,
  } = options;
  return {
    language: language === null ? undefined : language ?? python(),
    slotAt: signatureSlotAt,
    decorate,
    complete: complete(types, values),
    foldInactiveLinesAfter,
    lines,
    resolveReference,
    completionBadge: kindLabels ? (type) => kindLabels[type] : undefined,
  };
}
