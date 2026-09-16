import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, lineNumbers, type DecorationSet } from "@codemirror/view";

import { innerNewlines, pythonUnits, unitNumberAt, type UnitsFn } from "./codeBlockUnits";

/**
 * `flatten` — the display-only fold Zach approved on 2026-09-15 ("that is
 * exactly what we want ... I like how you are using the newline character,
 * that is basically how it looks anyway").
 *
 * Every physical newline INSIDE a unit (`codeBlockUnits.ts`) is replaced by
 * a small `⏎` widget, so the unit paints as one row: the source stays
 * byte-identical, undo untouched, the caret walks across the glyph, and
 * Enter inside a unit still inserts a real newline — it just shows up as
 * another `⏎` on the same row. WHY an inline REPLACE decoration and not a
 * value transform or the rendered rows: a transform lies about the source
 * (and every consumer must undo it), and a rendered row cannot hold a
 * caret. This is the same mechanism CodeMirror's own code folding uses
 * (an inline replace across a line break), which is why the joined lines
 * behave like one line for selection and cursor motion.
 *
 * Two of Zach's defaults, both here: the caret's own unit STAYS flat while
 * editing (no unfold-under-caret — the larger view is where real lines
 * live), and the gutter counts units, not physical lines.
 */
class NewlineWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "bbox-code-block-newline";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "⏎";
    return span;
  }
  /** Let a click on the glyph place the caret beside it, like any text. */
  override ignoreEvent(): boolean {
    return false;
  }
}

/** The fold itself: one replace decoration per inner newline. */
export function flattenDecorations(units: UnitsFn = pythonUnits): Extension {
  return EditorView.decorations.compute(["doc"], (state): DecorationSet => {
    const text = state.doc.toString();
    const builder = new RangeSetBuilder<Decoration>();
    for (const offset of innerNewlines(text, units(text))) {
      builder.add(offset, offset + 1, Decoration.replace({ widget: new NewlineWidget() }));
    }
    return builder.finish();
  });
}

/**
 * A line-number gutter that prints the UNIT number of each visible row.
 * Lines folded into a unit never get a gutter element of their own (they
 * are part of the first line's visual block), so the only numbers shown
 * are the unit starts — 1, 2, 3 — rather than 1, 5, 6.
 */
export function flattenLineNumbers(units: UnitsFn = pythonUnits): Extension {
  return lineNumbers({
    formatNumber: (lineNo, state) => {
      const line = state.doc.line(Math.min(lineNo, state.doc.lines));
      return String(unitNumberAt(units(state.doc.toString()), line.from));
    },
  });
}
