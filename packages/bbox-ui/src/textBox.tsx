import type {
  ChangeEvent,
  ComponentProps,
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "./lib/utils";
import {
  TEXT_BOX_FONT_STACKS,
  textBoxAlignItems,
  textBoxFontPx,
  textBoxJustifyContent,
  type TextBoxFont,
  type TextBoxHorizontalAlign,
  type TextBoxSize,
  type TextBoxVerticalAlign,
} from "./textBox.layout";

// WHY `Omit<..., "onChange">`: `ComponentProps<"div">` types `onChange` as a
// generic `ChangeEventHandler<HTMLDivElement>` (React's DOMAttributes types
// it on every element, though a plain div never actually fires one) — the
// contract's `onChange` is a value-carrying write-through callback, an
// incompatible shape. A div was never going to receive a real `onChange`
// event handler anyway, so overriding it costs nothing real.
export interface TextBoxProps extends Omit<ComponentProps<"div">, "onChange"> {
  size?: TextBoxSize;
  /** Font-size in px when `size === "custom"`; ignored otherwise. */
  sizePx?: number;
  paddingTop?: number;
  paddingBot?: number;
  paddingLeft?: number;
  paddingRight?: number;
  font?: TextBoxFont;
  align?: TextBoxVerticalAlign;
  justify?: TextBoxHorizontalAlign;
  /** Single ellipsized run, or a wrapping block. See `textBox.layout.ts`. */
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
  /** Fires on Enter (single), Ctrl/Cmd+Enter (multi), or blur. */
  onCommit?: (value: string) => void;
  /** Fires on Escape. The host decides what reverting means. */
  onCancel?: () => void;
  /** Shown on the control, and at rest (muted, `data-placeholder`) when the text is empty. */
  placeholder?: string;
  /** The host may still pass `editing` while `readOnly` — the control just refuses input. */
  readOnly?: boolean;
  maxLength?: number;
}

type ControlElement = HTMLInputElement | HTMLTextAreaElement;

// WHY the box's own typography is inherited onto the control rather than
// recomputed: the whole point of an in-flow editing control (as opposed to
// an overlay) is that the text must not move — §4's journey measures the
// control's bounding box against the resting text's within 1px. Recomputing
// font-size/line-height/color/text-align independently would only coincide
// with the box's own values by luck the day someone changes one of them.
const CONTROL_TYPOGRAPHY_STYLE: CSSProperties = {
  font: "inherit",
  fontSize: "inherit",
  lineHeight: "inherit",
  color: "inherit",
  textAlign: "inherit",
  background: "transparent",
  margin: 0,
  padding: 0,
  border: 0,
  borderRadius: 0,
  // `fieldSizing` (Chromium 123+) is not yet in React's/TS's CSSProperties —
  // the cast is deliberate, not a typo. `min-width: 4ch` on the input (below)
  // and `rows={1}` on the textarea are the declared fallback for engines
  // that don't support it yet.
  ...({ fieldSizing: "content" } as CSSProperties),
};

/**
 * The editing control — a real `<input>`/`<textarea>` living IN-FLOW inside
 * the same box the resting text occupies (never an overlay). A fresh mount
 * every time the host flips `editing` to `true` (the element TYPE changes
 * from a span of text to a form control, so React remounts it for us) is
 * what makes the on-mount focus/selection effect below correct with an
 * empty dependency array — it is "on mount", not a missed dependency.
 */
function TextBoxControl({
  lines,
  value,
  placeholder,
  readOnly,
  maxLength,
  onChange,
  onCommit,
  onCancel,
}: {
  lines: "single" | "multi";
  value: string;
  placeholder?: string;
  readOnly: boolean;
  maxLength?: number;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
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
    el.focus();
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
      onCommit?.(event.currentTarget.value);
    }
    // Plain Enter on multi falls through untouched — the textarea's own
    // native newline, exactly as the contract asks. Escape is handled
    // entirely by `handleEscapeCapture`, above, and never reaches here.
  };

  const handleBlur = (event: FocusEvent<ControlElement>) => {
    setFocused(false);
    onCommit?.(event.currentTarget.value);
  };

  // WHY these four stop their OWN propagation rather than being gated by a
  // host listener: a right-click must still open the browser's native
  // cut/copy/paste menu (so contextmenu is stopped, never prevented), and a
  // caret click must not re-run whatever pointer-down selection logic the
  // page around this box owns. The control is refusing to be mistaken for
  // the box that contains it — the two-click-to-edit rule itself is host
  // wiring one layer up (docs/TEXTBOX-EDITING-SPEC.md §3), not this file's job.
  const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation();

  const style: CSSProperties = {
    ...CONTROL_TYPOGRAPHY_STYLE,
    // The shadcn focus-ring idiom: no chrome at all until focused, then a
    // ring — never a border/background sitting on the control at rest,
    // which is the whole point of an in-flow control that reads as the text
    // it replaces.
    outline: focused ? "2px solid var(--bbox-ring, currentColor)" : "none",
    outlineOffset: focused ? 2 : undefined,
    ...(focused ? { borderRadius: 4 } : {}),
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
    "data-slot": "text-box-input" as const,
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
      style={{ ...style, minWidth: "4ch" }}
      {...shared}
    />
  );
}

/**
 * TextBox = one run of text, sized to its own content plus its own
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
export function TextBox({
  size = "md",
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
  className,
  style,
  children,
  ...props
}: TextBoxProps) {
  // WHY this is checked here rather than left to the caller: "editing is
  // ignored when children is not a string" is the contract's own escape
  // hatch for a TextBox someone hands non-text `children` — there is no
  // control to type into a ReactNode, so the box just renders rest.
  const isEditingNow = editing && typeof children === "string";
  const isEmptyText = children === undefined || children === "";

  const boxStyle: CSSProperties = {
    fontSize: textBoxFontPx(size, sizePx),
    fontFamily: TEXT_BOX_FONT_STACKS[font],
    alignItems: textBoxAlignItems(align),
    justifyContent: textBoxJustifyContent(justify),
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
    // `Flex` wrapper shrunk to that 107px correctly, and TextBox's ROOT
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
    // `text-box-content` span below, which is `display: "block"` — a real
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
  const title = !isEditingNow && lines === "single" && typeof children === "string" ? children : undefined;

  let content: ReactNode;
  if (isEditingNow) {
    content = (
      <TextBoxControl
        lines={lines}
        value={children as string}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
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
        data-slot="text-box-content"
        style={
          lines === "single"
            ? { display: "block", minWidth: 0, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
            : { display: "block", minWidth: 0, maxWidth: "100%", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
        }
      >
        {rest}
      </span>
    );
  }

  return (
    <div
      data-slot="text-box"
      data-size={size}
      data-font={font}
      data-align={align}
      data-justify={justify}
      data-lines={lines}
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
