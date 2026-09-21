"use client";

// src/components/editableText.tsx — ported by value from
// packages/bbox-ui/src/textBox.tsx (docs/TEXTBOX-EDITING-SPEC.md's
// contract). The click-to-edit control and the "control must not move the
// text" typography-matching are the already-solved parts this port keeps
// faithfully; only the `cn` import path changed to match this app's
// `src/components/` + `src/lib/utils.ts` layout, and the component/type
// names were renamed EditableText (this app's better name for the same
// control — see CLAUDE.md's ai-comment thread) while the ported package
// stays TextBox, untouched.

import type {
  ChangeEvent,
  ComponentProps,
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { BAR_SIZE_TO_EDITABLE_TEXT_SIZE, useBarSize } from "./barSize";
import { diagnosticUnderlineStyle, maxDiagnosticSeverity, type Diagnostic } from "./highlighter";
import {
  EDITABLE_TEXT_FONT_STACKS,
  editableTextAlignItems,
  editableTextFontPx,
  editableTextJustifyContent,
  type EditableTextFont,
  type EditableTextHorizontalAlign,
  type EditableTextSize,
  type EditableTextVerticalAlign,
} from "./editableText.layout";

// WHY `Omit<..., "onChange">`: `ComponentProps<"div">` types `onChange` as a
// generic `ChangeEventHandler<HTMLDivElement>` (React's DOMAttributes types
// it on every element, though a plain div never actually fires one) — the
// contract's `onChange` is a value-carrying write-through callback, an
// incompatible shape. A div was never going to receive a real `onChange`
// event handler anyway, so overriding it costs nothing real.
export interface EditableTextProps extends Omit<ComponentProps<"div">, "onChange"> {
  /** Falls back to the ambient `Bar` size (barSize.tsx) when omitted and a
   *  `Bar` is an ancestor, then to `"md"`. */
  size?: EditableTextSize;
  /** Font-size in px when `size === "custom"`; ignored otherwise. */
  sizePx?: number;
  paddingTop?: number;
  paddingBot?: number;
  paddingLeft?: number;
  paddingRight?: number;
  font?: EditableTextFont;
  align?: EditableTextVerticalAlign;
  justify?: EditableTextHorizontalAlign;
  /** Single ellipsized run, or a wrapping block. See `editableText.layout.ts`. */
  lines?: "single" | "multi";
  /**
   * Controlled; the host owns it. When true and `children` is a string, the
   * box renders the editing control instead of the text. When `children` is
   * not a string, `editing` is ignored (renders rest) — there is nothing to
   * type into. See docs/TEXTBOX-EDITING-SPEC.md §1.
   */
  editing?: boolean;
  /** Fires on every keystroke — write-through, like SystemSketch's `writeField`. */
  onChange?: (value: string) => void;
  /**
   * Fires on Enter (single), Ctrl/Cmd+Enter (multi), or blur — and SAYS WHICH.
   *
   * THOSE ARE ALL THE ROUTES, AND UNMOUNT IS DELIBERATELY NOT ONE (backlog
   * P-030, "nothing you type is ever lost"). The hazard the item names is
   * real — Chrome fires no `blur` for a focused element removed from the DOM,
   * so a panel closing or a tab switching under a focused field skips a
   * blur-commit entirely. It cannot bite THIS component, because this
   * component never holds the text: the control below is fully controlled
   * (`value={children}`), so a host that did not already have every keystroke
   * could not render a second one. There is nothing buffered here for an exit
   * to deliver, which is why adding an unmount route would be a callback that
   * can only ever re-send a string its host already has.
   *
   * What the hazard CAN bite is a host that buffers — a `useState` draft fed
   * to `children` and written back only in `onCommit`. That is the design to
   * avoid, and it is avoided by writing through in `onChange`, which is what
   * every text surface in bbox studio does (the four are listed in
   * `apps/systemsketch/src/textEditing.smoke.test.tsx`, whose second P-030
   * describe drives a panel closing and a session ending under a focused
   * field and asserts the store per KEYSTROKE, not per commit).
   *
   * WHY `via` exists, and why it is a second argument rather than a second
   * callback: a host that owns an editing SESSION (tldraw's `editingShapeId`,
   * for instance) needs to close that session on the key and NOT on the blur,
   * because the blur is not always the user leaving. Measured in this app,
   * 2026-09-21: opening a block's title editor fires exactly one spurious
   * blur-commit during the double-click that opened it — focus lands on the
   * freshly mounted control inside React's synchronous flush for the
   * pointerdown, and the rest of the gesture takes it away again — so a host
   * that closed on every commit closed the session ~0ms after opening it and
   * the title looked un-editable. `PortFace.tsx` records the same trap from
   * the CodeEditor side, where the answer was to not wire the callback at all.
   * Naming the route keeps the honest exit available instead.
   *
   * Nothing is at risk either way: this component is write-through, so
   * `onChange` has already delivered every keystroke before any commit fires.
   */
  onCommit?: (value: string, via: EditableTextCommitRoute) => void;
  /** Fires on Escape. The host decides what reverting means. */
  onCancel?: () => void;
  /** Shown on the control, and at rest (muted, `data-placeholder`) when the text is empty. */
  placeholder?: string;
  /** The host may still pass `editing` while `readOnly` — the control just refuses input. */
  readOnly?: boolean;
  /**
   * Where the caret goes when the control mounts, as a character offset —
   * INSTEAD of this component's own default (select-all on `single`,
   * caret-end on `multi`). Out-of-range values clamp.
   *
   * WHY the host supplies it rather than this file computing it (backlog
   * P-021, "the caret lands on the character you clicked"): the press that
   * opens an editing session lands on the RESTING text, which this component
   * is about to unmount. By the time the control exists there is nothing left
   * under the pointer to ask about, and this component never sees the pointer
   * event at all — the host owns the gesture that decided to start editing, so
   * the host is the only place that can still answer. `components/
   * caretGeometry.ts` is the shared way to turn that press into this number.
   */
  caretAt?: number;
  maxLength?: number;
  /**
   * The diagnostic axis (docs/INVALID-STATES-PLAN.md §5's EditableText
   * row): a wavy (`error`/`warning`) or dotted (`info`) underline on the
   * rest span, painted at `max(severity)`; the editing control inherits
   * the SAME `text-decoration` so the mark survives across the rest/edit
   * swap rather than vanishing the instant a host clicks in to fix it.
   */
  diagnostics?: Diagnostic[];
}

/** How an edit ended: the commit KEY, or focus leaving the control. */
export type EditableTextCommitRoute = "enter" | "blur";

type ControlElement = HTMLInputElement | HTMLTextAreaElement;

// WHY the box's own typography is inherited onto the control rather than
// recomputed: the whole point of an in-flow editing control (as opposed to
// an overlay) is that the text must not move — §4's journey measures the
// control's bounding box against the resting text's within 1px. Recomputing
// font-size/line-height/color/text-align independently would only coincide
// with the box's own values by luck the day someone changes one of them.
//
// WHY `paddingInline`/`marginInline` are NOT 0 (verify-round-2c G-9, "I don't
// like when I type the label how the edges of the EditableText... are being
// cut off"): a text `<input>`/`<textarea>`'s computed `overflow` is forced to
// `clip` by the browser — measured live, setting `overflowClipMargin`
// directly on the control left its COMPUTED value at `0px`, so bar.tsx's own
// fix for this bug class (`overflow-clip` + `[overflow-clip-margin:4px]`)
// cannot be reused verbatim here; that fix's CSS property does not apply to
// a form control at all. `field-sizing: content` sizes the control to the
// text's ADVANCE width (the metric `ch`-width layout uses), not its ink
// extent — measured live with Canvas `measureText` on the control's own
// value: a leading `(` renders with `actualBoundingBoxLeft` NEGATIVE (e.g.
// "(label)" at 24px: -1px, growing to -3px at this component's "xl" rung),
// meaning the glyph's ink starts outside the box the control sized itself
// to, and the control's forced clip then shaves it at typing time — a
// truthful-rendering violation (repo rule: authored characters must not
// disappear), not a cosmetic one. `CONTROL_INK_MARGIN_PX` of padding paired
// with the same amount of NEGATIVE margin grows the control's own clip
// boundary without moving where the text renders or how wide the host sees
// the control as being: padding pushes the content box in by the margin
// amount, the equal-and-opposite negative margin pulls the whole border box
// back out by the same amount, so the two cancel in both the visible text
// origin AND in `EditableText`'s own `w-fit` root's shrink-to-fit width —
// confirmed live via `getBoundingClientRect` before/after. `4` matches
// bar.tsx's own clip-margin number rather than the 1-3px measured above, so
// headroom holds across every accented/descender-heavy string too.
const CONTROL_INK_MARGIN_PX = 4;
const CONTROL_TYPOGRAPHY_STYLE: CSSProperties = {
  font: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
  color: "inherit",
  textAlign: "inherit",
  background: "transparent",
  marginBlock: 0,
  marginInline: -CONTROL_INK_MARGIN_PX,
  paddingBlock: 0,
  paddingInline: CONTROL_INK_MARGIN_PX,
  border: 0,
  borderRadius: 0,
  boxSizing: "border-box",
  // `fieldSizing` (Chromium 123+) is not yet in React's/TS's CSSProperties —
  // the cast is deliberate, not a typo. `min-width: 4ch` on the input (below)
  // and `rows={1}` on the textarea are the declared fallback for engines
  // that don't support it yet.
  ...({ fieldSizing: "content" } as CSSProperties),
};

// WHY this is computed once, not inlined as a flat `"4ch"` on the input:
// found live (2026-09-16, wiring Title/Type in Bar.stories.tsx to be
// click-to-edit) — `min-width` is a FLOOR that applies on top of
// `field-sizing: content`, not merely a fallback for engines that lack it.
// On an engine that DOES support `field-sizing` (this app's own target;
// confirmed live in Chrome), a short value like "Title" or "Type" renders
// narrower than a flat `4ch` (measured: "Title" at 18px = 36.5px, `4ch` at
// that font = 40.6px) — so the control was ~4px WIDER than the resting text
// it replaces, which is exactly the shift this file's own header comment
// says the in-flow-control design exists to prevent ("the text must not
// move" — verify-round-2 F1 already fixed the horizontal-overflow half of
// this; this is the same contract's width-floor half). Gating the fallback
// behind a feature check keeps the OLD-engine safety net (a value shorter
// than 4 characters not collapsing to an unusably tiny box) exactly where
// it was, while removing it from every engine that never needed it.
const SUPPORTS_FIELD_SIZING =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

/**
 * The editing control — a real `<input>`/`<textarea>` living IN-FLOW inside
 * the same box the resting text occupies (never an overlay). A fresh mount
 * every time the host flips `editing` to `true` (the element TYPE changes
 * from a span of text to a form control, so React remounts it for us) is
 * what makes the on-mount focus/selection effect below correct with an
 * empty dependency array — it is "on mount", not a missed dependency.
 */
function EditableTextControl({
  lines,
  value,
  placeholder,
  readOnly,
  maxLength,
  caretAt,
  diagnostics,
  onChange,
  onCommit,
  onCancel,
}: {
  lines: "single" | "multi";
  value: string;
  placeholder?: string;
  readOnly: boolean;
  maxLength?: number;
  caretAt?: number;
  diagnostics?: Diagnostic[];
  onChange?: (value: string) => void;
  onCommit?: (value: string, via: EditableTextCommitRoute) => void;
  onCancel?: () => void;
}) {
  // Two typed refs rather than one `ControlElement` ref cast onto whichever
  // element actually renders: `<input ref>` and `<textarea ref>` each want
  // their OWN element type, and only one of these two ever mounts per
  // render (`lines` picks the branch below), so the other simply stays null.
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = lines === "single" ? inputRef.current : textareaRef.current;
    if (!el) return;

    const take = () => {
      // Already ours: do nothing. Re-running `focus()` here would also re-run
      // the selection below and yank a caret the person has since moved.
      if (el.ownerDocument.activeElement === el) return;
      el.focus();
      // An explicit `caretAt` beats both defaults below — it is the host
      // saying "the person aimed at this character", which is a stronger
      // statement than either idiom. See the prop's own doc.
      if (caretAt !== undefined) {
        const at = Math.max(0, Math.min(caretAt, el.value.length));
        el.setSelectionRange(at, at);
        return;
      }
      // WHY select-all vs caret-end rather than one rule for both: a single
      // line is almost always a short label a person means to REPLACE (select
      // all is the shadcn/OS-native rename idiom); a multi-line body is almost
      // always something a person means to CONTINUE (caret-end matches
      // clicking into a text area you're already writing in).
      if (lines === "single") {
        el.select();
      } else {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    };

    // WHY TWICE, on mount and again on the next frame — the same two-step
    // `codeEditor.tsx:400-419` already uses, for the same measured reason.
    // A canvas host mounts this control INSIDE the pointer gesture that asked
    // for it (React flushes a discrete pointerdown synchronously), and the
    // rest of that gesture then takes focus back: measured in the app on
    // 2026-09-21, a block's title editor mounted focused, was blurred before
    // the double-click finished, and every keystroke after it went to the
    // canvas — the shape was in an editing session with a control nobody was
    // typing into. One frame later the gesture is over and the focus sticks.
    take();
    const frame = requestAnimationFrame(take);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (event: ChangeEvent<ControlElement>) => onChange?.(event.target.value);

  // WHY Escape is handled in the CAPTURE phase, on its own, and calls
  // `stopPropagation()` — the one key this file stops natively rather than
  // just calling its own callback: tldraw attaches ITS OWN Escape handling
  // with a raw `container.addEventListener("keydown", ...)` on
  // `.tl-container` (installed @tldraw/editor 5.3.2
  // useDocumentEvents.mjs:117-118, :188) — an ANCESTOR of this control in
  // every tldraw render. React defers its OWN (bubble-phase) synthetic
  // dispatch until the native event reaches the root node it delegates
  // from, which is an ancestor of `.tl-container` too — so tldraw's
  // container-level listener ALWAYS runs before this control's bubble
  // `onKeyDown` ever would. tldraw's handler calls `editor.cancel();
  // container.focus()`, and that `focus()` synchronously blurs this
  // control — `handleBlur` below fires `onCommit(current)` — before this
  // control's own Escape branch gets a chance to run, so Escape silently
  // COMMITTED the typed value instead of reverting it
  // (docs/TEXTBOX-EDITING-SPEC.md DoD step 5: "Escape cancels"). A
  // capture-phase handler on THIS element runs during React's simulated
  // CAPTURE pass (root-to-target, dispatched synchronously from the SAME
  // native root listener) before the real DOM's native capture sweep ever
  // reaches `.tl-container`'s bubble-phase listener — calling
  // `stopPropagation()` here removes the keydown from the event loop
  // entirely before tldraw (or anything else upstream) ever sees it, in
  // every host, not only tldraw's.
  const handleEscapeCapture = (event: KeyboardEvent<ControlElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onCancel?.();
  };

  const handleKeyDown = (event: KeyboardEvent<ControlElement>) => {
    if (event.nativeEvent.isComposing) return;
    const isCommitKey =
      lines === "single" ? event.key === "Enter" : event.key === "Enter" && (event.metaKey || event.ctrlKey);
    if (isCommitKey) {
      event.preventDefault();
      onCommit?.(event.currentTarget.value, "enter");
    }
    // Plain Enter on multi falls through untouched — the textarea's own
    // native newline, exactly as the contract asks. Escape is handled
    // entirely by `handleEscapeCapture`, above, and never reaches here.
  };

  const handleBlur = (event: FocusEvent<ControlElement>) => {
    setFocused(false);
    onCommit?.(event.currentTarget.value, "blur");
  };

  // WHY these four stop their OWN propagation rather than being gated by a
  // host listener: a right-click must still open the browser's native
  // cut/copy/paste menu (so contextmenu is stopped, never prevented), and a
  // caret click must not re-run whatever pointer-down selection logic the
  // page around this box owns. The control is refusing to be mistaken for
  // the box that contains it — the two-click-to-edit rule itself is host
  // wiring one layer up (docs/TEXTBOX-EDITING-SPEC.md §3), not this file's job.
  const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation();

  const controlSeverity = maxDiagnosticSeverity(diagnostics);
  const style: CSSProperties = {
    ...CONTROL_TYPOGRAPHY_STYLE,
    // The shadcn focus-ring idiom: no chrome at all until focused, then a
    // ring — never a border/background sitting on the control at rest,
    // which is the whole point of an in-flow control that reads as the text
    // it replaces.
    outline: focused ? "2px solid var(--bbox-ring, currentColor)" : "none",
    outlineOffset: focused ? 2 : undefined,
    ...(focused ? { borderRadius: 4 } : {}),
    // §5: "the editing control inherits it" — the SAME underline the rest
    // span wears, so the mark survives the rest/edit swap.
    ...(controlSeverity ? diagnosticUnderlineStyle(controlSeverity) : null),
  };

  // WHY the marker is BOTH a class and a data-attribute, and the core emits
  // both while owning neither's meaning: React Flow gates dragging/panning/
  // wheel by CLASS NAME (`noDragClassName` etc. take a single string), tldraw
  // gates its own gesture start by reading the DOM under the pointer, which
  // an attribute selector matches more cheaply than a class does against an
  // arbitrary host stylesheet. Emitting one host-neutral marker in each
  // vocabulary means this file never imports React Flow or tldraw, and a
  // third host can pick whichever it already gates by.
  const shared = {
    "data-slot": "editable-text-input" as const,
    "data-bbox-interactive": "" as const,
    className: "bbox-interactive",
    placeholder,
    readOnly,
    maxLength,
    autoFocus: true,
    onChange: handleChange,
    onKeyDownCapture: handleEscapeCapture,
    onKeyDown: handleKeyDown,
    onFocus: () => setFocused(true),
    onBlur: handleBlur,
    onPointerDown: stopPropagation,
    onClick: stopPropagation,
    onDoubleClick: stopPropagation,
    onContextMenu: stopPropagation,
  };

  if (lines === "multi") {
    return <textarea ref={textareaRef} rows={1} value={value} style={style} {...shared} />;
  }
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      style={{ ...style, minWidth: SUPPORTS_FIELD_SIZING ? undefined : "4ch" }}
      {...shared}
    />
  );
}

/**
 * EditableText = one run of text, sized to its own content plus its own
 * padding. No `w`/`h` prop — a fixed box is whatever the consumer wraps
 * it in (docs/T1-SPEC.md §4.2's "Not a prop" list). `align`/`justify`
 * are real flex properties on this box's own container, so they only
 * become visible once a consumer gives the box an explicit width/height
 * (via `className`/`style`) — exactly the same "declared even though it
 * does nothing until the host opts in" shape as `Port`'s `textLayout`.
 *
 * `children` is intentionally destructured with NO default (see
 * `textBox.fields.ts`'s own comment): omitting it renders a truly empty
 * box, not the placeholder string a panel needs to stay demoable.
 *
 * At rest this is a plain box; when the host sets `editing` (and `children`
 * is a string) the SAME box swaps its text for a native control wearing the
 * same font — option B from the frozen contract, docs/TEXTBOX-EDITING-SPEC.md.
 * Nothing here is a new component.
 */
export function EditableText({
  size,
  sizePx = 24,
  paddingTop = 0,
  paddingBot = 0,
  paddingLeft = 0,
  paddingRight = 0,
  font = "sans",
  align = "middle",
  justify = "middle",
  lines = "single",
  editing = false,
  onChange,
  onCommit,
  onCancel,
  placeholder = "",
  readOnly = false,
  maxLength,
  caretAt,
  diagnostics,
  className,
  style,
  children,
  ...props
}: EditableTextProps) {
  // WHY this is checked here rather than left to the caller: "editing is
  // ignored when children is not a string" is the contract's own escape
  // hatch for an EditableText someone hands non-text `children` — there is no
  // control to type into a ReactNode, so the box just renders rest.
  const isEditingNow = editing && typeof children === "string";
  const isEmptyText = children === undefined || children === "";
  const textSeverity = maxDiagnosticSeverity(diagnostics);

  // Explicit `size` wins; the ambient Bar cascade (barSize.tsx) is only the
  // fallback when `size` itself is omitted, and `"md"` (this component's
  // original default) is the floor when there is no Bar ancestor either.
  const barSize = useBarSize();
  const resolvedSize = size ?? (barSize && BAR_SIZE_TO_EDITABLE_TEXT_SIZE[barSize]) ?? "md";

  const boxStyle: CSSProperties = {
    fontSize: editableTextFontPx(resolvedSize, sizePx),
    // The skin seam (src/skin/skin.ts + skin.css). `--bbox-skin-font-sans`
    // is the token deferred here from Tranche 2 — this is the "TextBox/
    // EditableText rung" its own deferred-list comment named. Reached ONLY
    // when `font === "sans"` (the default): `font` is this component's own
    // explicit per-instance choice — a caller who deliberately picked
    // `"sketch"` or `"mono"` made a decision the ambient skin does not own,
    // same as Badge's non-outline variants keeping their own
    // `border-transparent` regardless of skin. `EDITABLE_TEXT_FONT_STACKS.
    // sans` is the exact literal this replaces, so a consumer who never
    // imports skin.css is byte-identical.
    fontFamily: font === "sans" ? `var(--bbox-skin-font-sans, ${EDITABLE_TEXT_FONT_STACKS.sans})` : EDITABLE_TEXT_FONT_STACKS[font],
    alignItems: editableTextAlignItems(align),
    justifyContent: editableTextJustifyContent(justify),
    paddingTop,
    paddingBottom: paddingBot,
    paddingLeft,
    paddingRight,
    // WHY the ROOT itself also needs `minWidth: 0` (verify-round-2 F1's own
    // sweep, found live in `apps/docs`'s real Header · left slot, not just
    // in a synthetic probe): `className` only sets `width: fit-content`
    // (`w-fit`) — it never touches `min-width`, so once THIS box is itself
    // a flex/grid item of a host that tries to squeeze it (a Block header
    // slot's Flex, in the real app), the browser's default automatic
    // minimum size for a flex/grid item is its OWN min-content size, not 0.
    // For a `white-space: nowrap` label that min-content size equals the
    // FULL, untruncated text width — measured live: a Header · left slot
    // held to exactly 107px by a real Block's header grid, the slot's own
    // `Flex` wrapper shrunk to that 107px correctly, and EditableText's ROOT
    // still rendered at 534px, silently overflowing its own 107px parent
    // (parent `overflow: visible`, so nothing even clipped it — the
    // ellipsis fix below had no box narrow enough to ever engage). This is
    // the identical bug class as the inner wrapper's own fix, one level
    // higher: a flex/grid item's min-width doesn't default to 0, `lines`'s
    // whole "single" contract is that this box CAN be squeezed by its host,
    // and nothing else in this file (or its host) is positioned to declare
    // "I am willing to shrink below my own text" on this box's behalf.
    minWidth: 0,
    // WHY the `lines` recipe does NOT live here any more (verify-round-2
    // F1): this root is `inline-flex` (needed so `align`/`justify` can
    // position content once a host gives the box explicit width/height —
    // see this file's own header comment), and CSS `text-overflow` only
    // applies to BLOCK containers, never to a flex container itself — a
    // flex formatting context, not a block one, per the CSS Overflow spec.
    // Chromium silently no-ops it there: measured, a flex root with
    // `justify-content: center` hard-clipped the text at BOTH ends with NO
    // ellipsis glyph at all (docs/TEXTBOX-EDITING-SPEC.md's own "truthful
    // truncation" broken exactly where it mattered most — the default
    // `justify: "middle"`). The recipe now lives on the inner
    // `editable-text-content` span below, which is `display: "block"` — a real
    // block container, so `text-overflow` actually paints. Proven in the
    // browser, not just pinned as a style object: empirically confirmed
    // with a headless-Chrome CDP probe (three `justify` values × a 107px
    // container) that this exact shape ellipsizes correctly at every
    // `justify`, and that `justify` still positions the (untruncated) item
    // normally once it fits — see docs/TEXTBOX-EDITING-SPEC.md §4's
    // `assertTruthfulTruncation` journey step.
  };

  // Truthful truncation (docs/TEXTBOX-EDITING-SPEC.md §1, and Zach's own
  // rendering rule): a single-line box may ellipsize its text visually, but
  // the full, untruncated string stays one hover away rather than vanishing.
  // WHY `children !== ""` too, not just `typeof === "string"`: an empty
  // string IS a string, so without this an empty box got `title=""` — a
  // real (if invisible) attribute, not "no title", which is a different,
  // false claim ("hover here, there's truthfully nothing to see") for a box
  // that in fact has no text at all. Empty text has nothing to truncate, so
  // it earns no title, exactly like a box with no `children` prop at all.
  const title = !isEditingNow && lines === "single" && typeof children === "string" && children !== "" ? children : undefined;

  let content: ReactNode;
  if (isEditingNow) {
    content = (
      <EditableTextControl
        lines={lines}
        value={children as string}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        caretAt={caretAt}
        diagnostics={diagnostics}
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  } else if (isEmptyText && !placeholder) {
    // Truly empty (no text, no placeholder): render nothing at all, not a
    // phantom wrapper span — the box stays exactly as empty as it was
    // before this file grew a truncation wrapper. `textBox.behavior.test.ts`
    // pins this ("no placeholder configured renders truly empty, not a
    // phantom node").
    content = children;
  } else {
    const rest = isEmptyText && placeholder ? (
      <span data-placeholder="" style={{ opacity: 0.5 }}>
        {placeholder}
      </span>
    ) : (
      children
    );
    // WHY this wrapper exists at all (verify-round-2 F1): it is the ONE
    // real block container in the tree, so the `lines` recipe (declared on
    // it, not on the `inline-flex` root above) actually has a block box to
    // clip/wrap against. `minWidth: 0` overrides the flex item's own
    // default `min-width: auto`, which otherwise refuses to shrink the
    // item below its content's intrinsic width no matter how narrow the
    // host's slot is — the OTHER half of why the root's flex children never
    // actually overflowed far enough to need clipping in the first place.
    // `maxWidth: "100%"` is what lets it shrink to fill exactly the root's
    // available width once content is wider than that, which is also what
    // makes `justify` (positioning the item on the root's main axis)
    // correctly become a no-op the instant truncation kicks in — an item
    // clamped to 100% of its container has no spare space left to be
    // positioned within, so it reads flush regardless of `justify`. Ellipsis
    // itself always lands at the text's trailing (end) edge, independent of
    // `justify` — verified empirically (headless-Chrome CDP probe): a real
    // block box with `text-align: left|center|right` painted the identical
    // truncated string in all three, because `text-overflow` clips/marks
    // the inline-end edge of the LINE BOX, not wherever `text-align`
    // happens to have centered the (already-overflowing) text within it.
    content = (
      <span
        data-slot="editable-text-content"
        data-diagnostic={textSeverity}
        style={{
          ...(lines === "single"
            ? { display: "block", minWidth: 0, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
            : { display: "block", minWidth: 0, maxWidth: "100%", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }),
          // §5's EditableText row: wavy (error/warning) or dotted (info)
          // underline on the rest span, painted at `max(severity)`.
          ...(textSeverity ? diagnosticUnderlineStyle(textSeverity) : null),
        }}
      >
        {rest}
      </span>
    );
  }

  return (
    <div
      data-slot="editable-text"
      data-size={resolvedSize}
      data-font={font}
      data-align={align}
      data-justify={justify}
      data-lines={lines}
      // WHY the raw `editing` prop and not `isEditingNow`: `data-editing` is
      // a truthful record of what the HOST asked for, not of what actually
      // rendered — the one case they diverge is `editing=true` with
      // non-string `children`, where the contract says "ignored" (no
      // control mounts) but the host's intent to edit this instance is
      // still real and still worth a probe/CSS hook being able to see.
      // Hiding that behind the derived, effective value would make this
      // attribute lie about what was actually passed in.
      data-editing={editing}
      title={title}
      className={cn("inline-flex w-fit leading-tight", className)}
      style={{ ...boxStyle, ...style }}
      {...props}
    >
      {content}
    </div>
  );
}
