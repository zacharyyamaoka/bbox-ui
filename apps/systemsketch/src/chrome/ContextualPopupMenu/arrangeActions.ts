// src/chrome/ContextualPopupMenu/arrangeActions.ts — Arrange, opacity and tldraw style, as plain
// functions over the editor. No React, no JSX: the pill renders these, the
// zoom menu could, a keyboard shortcut could. Same split as
// `selectionActions.ts`, which this file sits beside rather than inside —
// that one is about what a BLOCK is (its view, its language), this one is
// about where shapes sit and what they look like, which is true of every
// shape on the canvas including tldraw's own.
//
// PORTED BY VALUE from the archived SystemSketch's `ArrangeAdapter`
// (/home/bam/systemsketch/src/chrome/SystemSketchChrome.tsx:388-441) and its
// `ARRANGE_*` tables (:343-369). Every operation below is a stock `Editor`
// call — `sendToBack` / `sendBackward` / `bringForward` / `bringToFront` /
// `alignShapes` / `distributeShapes` / `setOpacityForSelectedShapes` /
// `setStyleForSelectedShapes`. There is NO new value model here and there
// must not be one: tldraw already owns z-order, alignment and styling, and a
// second implementation would be a worse one that also has to be kept in
// sync.
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  BringToFront,
  SendToBack,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  type Editor,
  type StyleProp,
  type TLShapeId,
} from "tldraw";


/* ------------------------------------------------------------------ arrange */

export interface ArrangeAction {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface ArrangeGroup {
  id: string;
  /** The group's own heading inside the panel; the z-order group has none
   *  because it is the only group a single-shape selection ever shows. */
  heading?: string;
  actions: readonly ArrangeAction[];
}

export const ARRANGE_Z_ORDER: readonly ArrangeAction[] = [
  { id: "sendToBack", label: "Send to back", icon: SendToBack },
  { id: "sendBackward", label: "Send backward", icon: ArrowDown },
  { id: "bringForward", label: "Bring forward", icon: ArrowUp },
  { id: "bringToFront", label: "Bring to front", icon: BringToFront },
];

// WHY horizontal and vertical are two groups rather than one flat six-icon
// row — carried over verbatim from the donor's own comment, because the
// reasoning is Zach's taste and not an implementation detail: "so the
// segmenting Zach asked for reads the same way Figma's own align panel does:
// two families of the same operation, not one undifferentiated list."
export const ARRANGE_ALIGN_HORIZONTAL: readonly ArrangeAction[] = [
  { id: "left", label: "Align left", icon: AlignStartVertical },
  { id: "center-horizontal", label: "Align horizontal centers", icon: AlignCenterVertical },
  { id: "right", label: "Align right", icon: AlignEndVertical },
];

export const ARRANGE_ALIGN_VERTICAL: readonly ArrangeAction[] = [
  { id: "top", label: "Align top", icon: AlignStartHorizontal },
  { id: "center-vertical", label: "Align vertical centers", icon: AlignCenterHorizontal },
  { id: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
];

export const ARRANGE_DISTRIBUTE: readonly ArrangeAction[] = [
  { id: "distribute-horizontal", label: "Distribute horizontally", icon: AlignHorizontalDistributeCenter },
  { id: "distribute-vertical", label: "Distribute vertically", icon: AlignVerticalDistributeCenter },
];

const ARRANGE_ALIGN_OPS = ["left", "right", "top", "bottom", "center-horizontal", "center-vertical"] as const;
type ArrangeAlignOp = (typeof ARRANGE_ALIGN_OPS)[number];
function isArrangeAlignOp(id: string): id is ArrangeAlignOp {
  return (ARRANGE_ALIGN_OPS as readonly string[]).includes(id);
}

/**
 * Which groups a selection of `count` shapes may use.
 *
 * The thresholds are the donor's and they are not arbitrary: z-order is
 * meaningful for ONE shape (it moves against everything else on the page),
 * aligning needs something to align TO, and distributing needs a shape in the
 * middle to move — with two shapes the ends are already the ends, so
 * "distribute" is a no-op that looks like a bug. Rendering a control that
 * cannot do anything is worse than omitting it, so this returns groups rather
 * than disabled flags.
 */
export function arrangeGroupsFor(count: number): ArrangeGroup[] {
  if (count === 0) return [];
  const groups: ArrangeGroup[] = [{ id: "z-order", actions: ARRANGE_Z_ORDER }];
  if (count >= 2) {
    groups.push(
      { id: "align-horizontal", heading: "Align", actions: ARRANGE_ALIGN_HORIZONTAL },
      { id: "align-vertical", actions: ARRANGE_ALIGN_VERTICAL },
    );
  }
  if (count >= 3) groups.push({ id: "distribute", heading: "Distribute", actions: ARRANGE_DISTRIBUTE });
  return groups;
}

/**
 * Run one arrange action against the current selection.
 *
 * WHY `markHistoryStoppingPoint` first (donor did the same): every branch
 * below is one or more store writes, and without an explicit stopping point
 * tldraw is free to coalesce an align with whatever the user did immediately
 * before it. Ctrl+Z after "align left" must undo the align and nothing else.
 */
export function runArrange(editor: Editor, id: string): void {
  const ids = editor.getSelectedShapeIds();
  if (ids.length === 0) return;
  editor.markHistoryStoppingPoint("arrange");
  switch (id) {
    case "sendToBack":
      editor.sendToBack(ids);
      return;
    case "sendBackward":
      editor.sendBackward(ids);
      return;
    case "bringForward":
      editor.bringForward(ids);
      return;
    case "bringToFront":
      editor.bringToFront(ids);
      return;
    case "distribute-horizontal":
      editor.distributeShapes(ids, "horizontal");
      return;
    case "distribute-vertical":
      editor.distributeShapes(ids, "vertical");
      return;
    default:
      if (isArrangeAlignOp(id)) editor.alignShapes(ids, id);
  }
}

/* ------------------------------------------------------------------ opacity */

/** Opacity as the pill shows it: whole percent, 0-100. */
export function selectionOpacityPercent(editor: Editor): number {
  const shared = editor.getSharedOpacity();
  // `getSharedOpacity()` reports `{type: "mixed"}` when the selection
  // disagrees. The slider is one number and cannot show "mixed", so a mixed
  // selection reads as fully opaque — the value the FIRST drag will then
  // apply to everything, which is what every other tool does here.
  if (shared.type !== "shared") return 100;
  return Math.round(shared.value * 100);
}

export function setSelectionOpacityPercent(
  editor: Editor,
  percent: number,
  opts?: { continuous?: boolean },
): void {
  const clamped = Math.min(100, Math.max(0, percent));
  // WHY the stopping point is marked only on the SETTLING call: a range input
  // fires per pixel, so marking each one would make a single drag cost forty
  // presses of undo. tldraw's own setter handles the ephemeral/committed split
  // for the shapes; the history granularity is ours to choose.
  if (!opts?.continuous) editor.markHistoryStoppingPoint("opacity");
  editor.setOpacityForSelectedShapes(clamped / 100);
}

/* -------------------------------------------------------------------- style */

// THE VOCABULARY MOVED, 2026-09-24. `StyleRow`, `STYLE_ROWS`, `ActiveStyleRow`,
// `activeStyleRows` and `faceLabelFor` lived here and described the six
// per-tldraw-style rows the pill used to render. The pill is now four triggers
// — shape, inside, edge, text — and its vocabulary is declared as kit data in
// `appearanceModel.ts`, rendered by `@trunk/editor/controlStrip`.
//
// Deleted rather than deprecated on purpose. A second, unused description of
// the same controls is exactly what this round was about: the old bar hand-
// rolled a renderer the trunk already had, and printed the word "dashed"
// because the drawn glyph sat in the copy nobody called. Leaving these behind
// would have recreated that, with no test covering them.
//
// What stays below is what the new model still uses: `setStyle` (the two-call
// arming fix), `swatchColorFor`, and the opacity pair.

/**
 * Set a style on the selection AND arm it for the next shape drawn.
 *
 * FIXED BY P-035, and the bug was not P-035's: this function called only
 * `setStyleForSelectedShapes`, so NO row in this pill has ever armed anything.
 * Pick blue with a geo selected, draw a second geo, and it came out black —
 * which is not what tldraw does and not what any design tool does. Measured by
 * `src/diffMark.smoke.test.tsx`'s arming case, which timed out at 10s waiting
 * for `getStyleForNextShape` to report the value that had just been picked.
 *
 * The fix is tldraw's own two lines, in tldraw's own order, inside one
 * `editor.run` — `StylePanelContext.mjs:18-31`, the stock style panel's
 * `onValueChange`. Both calls, because they answer different questions:
 * `setStyleForSelectedShapes` writes the shapes that exist,
 * `setStyleForNextShapes` writes `instanceState.stylesForNextShape`, which
 * `createShapes` folds into the initial props of every shape made afterwards
 * (Editor.mjs:6336-6338). A StyleProp is the pair; one without the other is
 * just a prop with a menu.
 *
 * DELIBERATELY NOT COPIED from the stock handler: its accel-key escape hatch
 * (hold Ctrl to set the selection WITHOUT arming). It reads
 * `editor.inputs.getAccelKey()` through `unsafe__withoutCapture`, which
 * `tldraw`'s package does not re-export, and it is a behaviour with no test
 * here. Named rather than silently dropped, so whoever wants it knows exactly
 * which four lines to lift and from where.
 */
export function setStyle(editor: Editor, style: StyleProp<string>, value: string): void {
  editor.markHistoryStoppingPoint("style");
  editor.run(() => {
    if (editor.isIn("select")) editor.setStyleForSelectedShapes(style, value);
    editor.setStyleForNextShapes(style, value);
  });
}

/* ----------------------------------------------------------------- selection */

/**
 * Is this selection made only of tldraw's OWN shapes — i.e. none of the app's
 * `ss-*` kinds?
 *
 * This is the predicate that decides which pill Zach sees, and it is written
 * as "no ss- shape present" rather than "every shape is a geo/arrow/draw"
 * deliberately: the app adds shape kinds (block, code, port, wire, region,
 * and more later), and a kind added tomorrow must fall on the APP side of
 * this fence by default. Listing tldraw's kinds instead would silently hand a
 * new app shape the style bar and let a user set a `dash` on it.
 */
export function isNativeTldrawSelection(editor: Editor): boolean {
  const shapes = editor.getSelectedShapes();
  if (shapes.length === 0) return false;
  return shapes.every((shape) => !shape.type.startsWith("ss-"));
}

/** The selected shape ids, for a caller that wants them without a second read. */
export function selectedIds(editor: Editor): TLShapeId[] {
  return editor.getSelectedShapeIds();
}

/**
 * The real CSS colour tldraw paints for a named style value (`"blue"` →
 * `"#4465e9"`), so the Color row can show swatches rather than the words
 * "blue" and "light-violet".
 *
 * WHY it is read from `editor.getTheme("default")` at call time rather than
 * written down here as a hex table: a duplicated palette is a second place
 * for the colours to be wrong, it silently ignores a custom theme, and — the
 * part a static table cannot do at all — tldraw ships a DIFFERENT hex for
 * every colour in dark mode, so a hardcoded swatch would be visibly wrong for
 * half of Zach's sessions. `TLTheme.colors` is keyed `{dark, light}` for
 * exactly that reason.
 *
 * Returns null rather than a fallback colour when the theme has no such entry
 * (a custom theme may REMOVE palette colours — `TLRemovedDefaultThemeColors`),
 * and the caller falls back to the value's name. A wrong swatch is worse than
 * an honest label.
 */
export function swatchColorFor(editor: Editor, value: string): string | null {
  const theme = editor.getTheme("default");
  if (!theme) return null;
  const palette = theme.colors[editor.user.getIsDarkMode() ? "dark" : "light"] as Record<string, unknown>;
  const entry = palette?.[value];
  if (entry && typeof entry === "object" && "solid" in entry) {
    const solid = (entry as { solid: unknown }).solid;
    if (typeof solid === "string") return solid;
  }
  return null;
}
