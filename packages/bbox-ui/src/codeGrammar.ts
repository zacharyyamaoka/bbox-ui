import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

/** Which named region the caret sits in, and the text CodeMirror would replace on completion. */
export interface CodeFieldSlotAt {
  slot: string;
  start: number;
  end: number;
  query: string;
}

/** One highlighted span, expressed as a CSS class rather than a CodeMirror type. */
export interface CodeFieldDecorationRange {
  from: number;
  to: number;
  className: string;
}

export interface CodeFieldCompletion {
  label: string;
  detail?: string;
  /** CodeMirror's completion `type` — drives the built-in icon set, purely cosmetic. */
  type?: string;
}

export interface CodeFieldCompletionContext {
  text: string;
  pos: number;
  explicit: boolean;
}

export interface CodeFieldCompletionResult {
  /** Where the accepted completion starts replacing text. */
  from: number;
  /** Defaults to the caret. */
  to?: number;
  options: CodeFieldCompletion[];
}

/** One role-tagged run of text within a rendered row — a name, a type, a bit of punctuation. */
export interface CodeFieldSegment {
  text: string;
  /** A CSS-class hook (e.g. `"name"` → `.bbox-code-seg--name`); omit for unstyled text. */
  role?: string;
  /**
   * This segment names something `grammar.resolveReference` can look up.
   * The renderer asks only for segments actually on screen — resolution
   * never runs during `lines()` itself, so a grammar's parse stays cheap
   * even when resolution means a board-wide scan.
   */
  isReference?: boolean;
}

/** One row of the RENDERED-mode tree — `grammar.lines`' unit of output. */
export interface CodeFieldLine {
  /** 0-based index into the SOURCE this line came from — the field's own `value` for a top-level row, or the reference's own text for a row from `expandLines()`. This is what a `CodeFieldRows` click reports as `onOpenSource`'s `line` argument. */
  line: number;
  /**
   * Absolute character offset of the line's own start, within that SAME
   * source. NOT what `onOpenSource` reports (it reports `line`, the index,
   * so the host can place it against whichever source `owner` names) —
   * this is metadata on the row itself, e.g. for a grammar that wants to
   * report offsets without re-deriving them from `line` and the source text.
   */
  lineStart: number;
  /** Nesting depth. 0 for every row `lines()` returns directly; a reference's `expandLines()` returns its own rows at `parentDepth + 1`, applied by the renderer, not stamped here. */
  indent: number;
  segments: CodeFieldSegment[];
}

/** What a reference segment resolves to: a click target, and/or more rows to show in place. */
export interface CodeFieldReference {
  /** A grammar-defined vocabulary word (e.g. `"known"` / `"unknown"` / `"primitive"`) — a styling and behaviour hook, not interpreted by the field itself. */
  kind: string;
  /** Present when clicking the reference should navigate elsewhere instead of (or in addition to) expanding. */
  onJump?(): void;
  /**
   * Present when this reference can expand in place — e.g. a record type's
   * own fields, one level deeper. Called lazily, only while the row is
   * open, and only re-called when the row is toggled shut and open again —
   * so an expensive lookup (a live board scan) runs once per look, not
   * once per keystroke anywhere on the field.
   */
  expandLines?(): CodeFieldLine[] | null;
  /**
   * Identifies this reference as the owner of every row `expandLines()`
   * returns — an opaque token the grammar defines (a block id, a type
   * name, anything `onOpenSource`'s caller can recognise). A row inside an
   * expansion is NOT part of the field's own document — it's a preview of
   * something else's — so clicking one must report that it belongs to a
   * different source, not silently misapply its line number against the
   * top-level `value` (the donor's rule: a foreign row jumps to its real
   * owner and opens SOURCE there, at that row's own line — never "this
   * field's source at some unrelated line").
   *
   * Defaults to the resolved segment's own text (e.g. `"Pose"`) when
   * omitted, so `expandLines` alone is already enough to mark its rows as
   * foreign; set this explicitly for a richer token (an actual block
   * reference) a host can act on directly.
   */
  owner?: unknown;
}

/**
 * What makes a `CodeField` know its grammar. Every hook is optional — the
 * empty grammar `{}` is the plain code text box: a real CodeMirror document,
 * no slots, no completions, no marks. `slotAt` is the one function this
 * whole design rests on: a port line, a `Name = expr` alias, a nested
 * attribute tree are each a new `slotAt` plus a `decorate`/`complete` pair,
 * never a new editor.
 *
 * WHY a declarative object instead of a raw CodeMirror `Extension[]` (what
 * the field this was extracted from originally took): a grammar author
 * should not have to learn `RangeSetBuilder`, `StateField` and the
 * `autocompletion` API just to say "these are my three roles, this is what
 * completes after a colon". `grammarExtensions` below is the one place that
 * translation happens; a grammar that genuinely needs raw CodeMirror machinery
 * (a `StateField`, a widget) can still pass it through `CodeFieldGrammar.language`
 * alongside these hooks — `language` is any `Extension`, not just a lezer parser.
 */
export interface CodeFieldGrammar {
  /** A CodeMirror language/parser extension (e.g. `python()`), or any other raw extension the grammar needs mounted. */
  language?: Extension;
  /** Which slot the caret sits in. Drives `complete`; also useful to a host that wants to know what's under the cursor. */
  slotAt?(text: string, caret: number): CodeFieldSlotAt | null;
  /** Marks to paint over the raw text, recomputed on every document change. */
  decorate?(text: string): CodeFieldDecorationRange[];
  /**
   * One completion source, dispatched by slot. Return `null` (or an empty
   * `options` list) to offer nothing — that is the grammar's call, not the
   * field's: `signatureGrammar` refuses to complete the `name` slot so a
   * free-text label is never interrupted while it is typed.
   */
  complete?(
    slot: CodeFieldSlotAt | null,
    query: string,
    ctx: CodeFieldCompletionContext,
  ): CodeFieldCompletionResult | null;
  /**
   * Live-preview style folding for a lane: a line the caret is NOT on shows
   * at most this many characters, then an ellipsis; the caret's own line
   * always shows in full, and moving onto a folded line unfolds it (the
   * decoration recomputes from the selection). Omit for no folding. Has no
   * visible effect on a single-line field — there is only ever one line,
   * and it always holds the caret.
   */
  foldInactiveLinesAfter?: number;
  /**
   * The RENDERED-mode tree: the source parsed into rows of role-tagged
   * segments (bold name, accent type, muted default…), the "code block
   * overlay" — rendered by default, source only under the caret. Required
   * for `CodeField`'s `mode="rendered"`; a grammar that has no rendered
   * view (the plain code text box) simply omits it, and `mode` has nothing
   * to switch to.
   *
   * Nesting is a grammar concern, not a component one: `lines()` itself
   * only ever returns flat, `indent: 0` rows for the source's own lines —
   * a row that names a known reference nests DEEPER rows by resolving it
   * (`resolveReference(name).expandLines()`), not by the source text's own
   * indentation. That is what lets an attribute tree, a flat port lane and
   * a self-referencing type all share one renderer.
   */
  lines?(text: string): CodeFieldLine[];
  /**
   * What a segment marked `isReference` resolves to. Omit to render every
   * reference as plain text with no click target — the grammar's call, not
   * a default the field guesses at (a "known" judgement usually means a
   * live scan of something outside the field, e.g. a host's own registry).
   */
  resolveReference?(name: string): CodeFieldReference | null;
  /**
   * A short label for the completion badge/pill shown beside an option
   * whose `type` (`CodeFieldCompletion.type`) matches — the kind-pill
   * pattern from the grammar this was extracted from. Return `null`/
   * `undefined` for a type with no badge.
   */
  completionBadge?(type: string): string | null | undefined;
}

function decorationExtension(decorate: NonNullable<CodeFieldGrammar["decorate"]>): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const ranges = decorate(state.doc.toString())
      .filter((range) => range.to > range.from)
      .slice()
      .sort((a, b) => a.from - b.from || a.to - b.to);
    const builder = new RangeSetBuilder<Decoration>();
    for (const range of ranges) {
      builder.add(range.from, range.to, Decoration.mark({ class: range.className }));
    }
    return builder.finish();
  });
}

function completionExtension(grammar: CodeFieldGrammar): Extension {
  const complete = grammar.complete!;
  const slotAt = grammar.slotAt;
  const source = (context: CompletionContext): CompletionResult | null => {
    const text = context.state.doc.toString();
    const slot = slotAt ? slotAt(text, context.pos) : null;
    const result = complete(slot, slot?.query ?? "", {
      text,
      pos: context.pos,
      explicit: context.explicit,
    });
    if (!result || result.options.length === 0) return null;
    return {
      from: result.from,
      to: result.to ?? context.pos,
      options: result.options.map((option) => ({
        label: option.label,
        detail: option.detail,
        type: option.type,
      })),
    };
  };
  if (!grammar.completionBadge) return autocompletion({ override: [source], icons: false });
  const badge = grammar.completionBadge;
  return autocompletion({
    override: [source],
    icons: false,
    tooltipClass: () => "bbox-code-completion",
    addToOptions: [
      {
        position: 20,
        render: (completion) => {
          const label = completion.type ? badge(completion.type) : null;
          if (!label) return null;
          const pill = document.createElement("span");
          pill.className = "bbox-code-completion-pill";
          pill.dataset.kind = completion.type;
          pill.textContent = label;
          return pill;
        },
      },
    ],
  });
}

class CodeFieldEllipsisWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "bbox-code-field-ellipsis";
    span.textContent = "…";
    return span;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

/**
 * The UTF-16 offset `maxCodePoints` *code points* into `text` — never
 * inside a surrogate pair. `for...of` (and the spread below) iterates by
 * code point, so a two-unit character (most emoji) always counts as one
 * and is never split; a naive `text.slice(0, maxChars)` on code UNITS can
 * land between a high and low surrogate, leaving a lone unpaired
 * surrogate on screen (renders as a replacement glyph, sometimes worse).
 */
function codePointOffset(text: string, maxCodePoints: number): number {
  let count = 0;
  let offset = 0;
  for (const char of text) {
    if (count >= maxCodePoints) break;
    offset += char.length;
    count += 1;
  }
  return offset;
}

function foldExtension(maxChars: number): Extension {
  return EditorView.decorations.compute(["doc", "selection"], (state): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    const active = new Set<number>();
    for (const range of state.selection.ranges) {
      active.add(state.doc.lineAt(range.head).number);
      active.add(state.doc.lineAt(range.anchor).number);
    }
    for (let number = 1; number <= state.doc.lines; number += 1) {
      const line = state.doc.line(number);
      if (active.has(number) || [...line.text].length <= maxChars) continue;
      builder.add(
        line.from + codePointOffset(line.text, maxChars),
        line.to,
        Decoration.replace({ widget: new CodeFieldEllipsisWidget() }),
      );
    }
    return builder.finish();
  });
}

/** Translates a declarative `CodeFieldGrammar` into the CodeMirror extensions `CodeField` mounts. */
export function grammarExtensions(grammar: CodeFieldGrammar): Extension[] {
  const extensions: Extension[] = [];
  if (grammar.language) extensions.push(grammar.language);
  if (grammar.decorate) extensions.push(decorationExtension(grammar.decorate));
  if (grammar.complete) extensions.push(completionExtension(grammar));
  if (grammar.foldInactiveLinesAfter != null) {
    extensions.push(foldExtension(grammar.foldInactiveLinesAfter));
  }
  return extensions;
}
