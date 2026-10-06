"use client";

// src/components/codeEditor.tsx — ported by value from packages/bbox-ui's
// CodeMirror field, reconciling two lineages that diverged on main:
//
// - packages/bbox-ui/src/codeField.tsx (592 lines, current on main) is the
//   engine this keeps almost verbatim: the write policy (`onWrite` per
//   keystroke via `codeEditorGesture.ts`'s `FieldGesture`), the single-line
//   guard, the Enter/Escape exit contract, the external-value-sync effect,
//   the wheel/pointerdown host-interop effects.
// - packages/bbox-ui/src/codeBlock.tsx (900 lines, deleted on main by
//   368a524 "CodeBlock becomes CodeField", recovered from
//   claude/code-block-primitive) is where `lineNumbers`, the `columns` →
//   pixel width maths (now `codeEditorLayout.ts`), and the `overflow`
//   clip/wrap/scroll modes came from — main's rename trimmed all three
//   along with the `grammar`/`mode`/rows machinery.
//
// Dropped entirely, on both sides: `grammar` (slot decorations +
// completion — `codeGrammar.ts`/`completionMenu.ts`), the rendered/source
// `mode` toggle and `CodeEditorRows` (`codeFieldRows.tsx`/`codeBlockRows`),
// `flatten`/`codeBlockUnits.ts`'s Python-unit folding, and the `look`
// preset ladder (`codeBlock.presets.ts`) — this app has no FieldSpec /
// appearance-cascade machinery to hang any of that on (see CLAUDE.md).
// `language` survives as its own prop (a raw CodeMirror `LanguageSupport`)
// specifically BECAUSE dropping `grammar` wholesale would also have
// dropped syntax highlighting, which the PseudoCode story plainly needs.
//
// `tooltipParent`/the completion popup's `tooltips()` extension are also
// dropped — nothing here ever opens a tooltip without `grammar`'s
// completion source, so parenting one was dead plumbing.

import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  moveLineDown,
  moveLineUp,
} from "@codemirror/commands";
import { syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { linter as cmLinter, setDiagnostics as cmSetDiagnostics, type Diagnostic as CMDiagnostic } from "@codemirror/lint";
import {
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers as lineNumbersExtension,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";

import "./codeEditor.css";

import { FieldGesture } from "./codeEditorGesture";
import { externalSync, singleLineGuard } from "./codeEditorGuards";
import { codeEditorHighlightStyle } from "./codeEditorHighlight";
import { codeEditorWidthPx } from "./codeEditorLayout";
import { codeEditorThemeVars, type CodeEditorTheme } from "./codeEditorTheme";
import type { DiagnosticSeverity } from "./highlighter";

/** The horizontal padding baked into `.bbox-code-editor` in codeEditor.css —
 * kept as a constant here too so `columns`'s pixel maths (codeEditorLayout.ts)
 * matches what actually renders, rather than guessing the stylesheet's number. */
const PADDING_X = 6;

/** What a line wider than the box does. `clip` (the default — an <input>-like
 * port label: cut at the edge, no bar) and `scroll` (a horizontal scrollbar,
 * CodeMirror's own scroller — the IDE feel Zach's screenshot wants) both keep
 * `columns`' fixed width; `wrap` folds the line onto new rows instead and
 * ignores `columns` for width purposes since the text no longer runs past it. */
export type CodeEditorOverflow = "clip" | "wrap" | "scroll";

/**
 * One diagnostic-marked RANGE (docs/INVALID-STATES-PLAN.md §5's CodeEditor
 * row). This is the one mark-bearing shape in this axis that stays
 * POSITIONAL rather than the shared `Diagnostic` list every other
 * component takes: several squiggles at different character offsets in
 * one field are not competing judgements about a single element, so there
 * is nothing to rank down to a `max(severity)` — every range paints its
 * own severity, independently.
 */
export interface CodeEditorDiagnostic {
  from: number;
  to: number;
  severity: DiagnosticSeverity;
  message?: string;
}

export interface CodeEditorProps {
  /** The document. The field follows it whenever nobody is editing. */
  value: string;
  /** Write, per keystroke — the field's one write policy (see `codeEditorGesture.ts`). */
  onWrite(value: string): void;
  /** Open one undo step so an edit is one Ctrl+Z, not one per character. */
  beginEdit?(): void;
  /** The commit boundary — one call per gesture, however the field was left. */
  onEditEnd?(value: string, startValue: string): void;
  /** The syntax parser, e.g. `python()`/`javascript()`/`json()`. Omit for plain text. */
  language?: LanguageSupport;
  /**
   * A VS Code syntax palette (codeEditorTheme.ts) — an id resolved against
   * `CODE_EDITOR_THEMES`, or a `CodeEditorTheme` object directly. Applied
   * as CSS custom properties on the root, UNDER any caller `style` (a
   * caller override still wins). Omit, or pass an id that doesn't match
   * any known theme, for the ambient default palette — never blanks the
   * editor.
   */
  theme?: CodeEditorTheme | string;
  /**
   * A lane/document: several lines, Enter inserts a line, Alt+↑/↓ move one,
   * Shift+Alt+↓ copies one (CodeMirror's default keymap); Ctrl/Cmd+Enter is
   * the exit that Enter is for a single line. `false` (the default): one
   * line — a typed or pasted newline is dropped rather than growing the box.
   */
  multiline?: boolean;
  /** The line-number gutter. Off by default (a bare port-label line has nothing to number). */
  lineNumbers?: boolean;
  /** What a line wider than the box does. Defaults to `"clip"`. */
  overflow?: CodeEditorOverflow;
  /**
   * Characters across. `> 0` fixes the box's width to that many mono cells
   * plus padding (and the gutter when `lineNumbers` is on) — see
   * `codeEditorLayout.ts`'s `codeEditorWidthPx`. `0` (the default) fills
   * whatever the host gives. Ignored when `overflow === "wrap"` — a
   * wrapped line has no fixed width to overflow.
   */
  columns?: number;
  /** The type size, in px — also what `columns`'s pixel maths is computed against. */
  fontSizePx?: number;
  /** Pin every line to this height so lines can sit on a host's own rows. */
  lineHeightPx?: number;
  align?: "left" | "right";
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /** Forced `true` when any `diagnostics` range is `severity: "error"` —
   *  a whole-field error still sets this existing attribute (§5's own
   *  words); an explicit `true` here is never downgraded by an absent
   *  error range. */
  ariaInvalid?: boolean;
  /**
   * The diagnostic axis's positional shape — see `CodeEditorDiagnostic`'s
   * own doc. Painted with the stock `@codemirror/lint` squiggle
   * (`setDiagnostics`/`linter`, §5's own choice), retinted to this kit's
   * three severity tokens in codeEditor.css rather than CodeMirror's
   * hardcoded reds/oranges. No gutter, no Problems panel — §8 stops this
   * kit at the component-scale mark.
   */
  diagnostics?: CodeEditorDiagnostic[];
  className?: string;
  testId?: string;
  style?: CSSProperties;
  /** Take focus on mount; `'select'` also selects the whole line/document. */
  autoFocus?: boolean | "select";
  /** With `autoFocus`, put the caret here instead of selecting everything. */
  cursorAt?: number;
  /** With `autoFocus`, select exactly this range. */
  selectRange?: { from: number; to: number };
  /**
   * Enter (single-line) / Ctrl+Enter (multi) and Escape both end the
   * gesture by leaving the field (the value is never discarded — Ctrl+Z is
   * the retract). A host that owns its own editing session supplies its
   * own exits instead of the default `leave`.
   */
  onEnter?(): void;
  onEscape?(): void;
  /**
   * A host's own key handling, consulted BEFORE every keymap in this file
   * (`Prec.highest`, above even the Enter/Escape exits). Return `true` to
   * claim the key — it is then prevented and stopped; `false` lets it reach
   * CodeMirror untouched. The seam `keyboardReorder.ts`'s move-this-item
   * chord rides: it has to win over the default keymap's Ctrl+←/→ word-jump
   * on a row, and it must lose to nothing it did not ask for.
   */
  onKeyDown?(event: KeyboardEvent, view: EditorView): boolean;
  onViewReady?(view: EditorView): void;
}

export interface CodeEditorHandle {
  setCaret(offset: number): void;
  focus(): void;
}

/**
 * `CodeEditor` — the code text box: one line (the shape `LabeledPort`'s
 * label needs) or a multi-line lane/document (the shape the multiline port
 * editor needs), the same engine wearing different props. A real CodeMirror
 * document, so highlighting, IME, undo and the caret all come from one
 * mature engine rather than a mirror-div.
 *
 * WHY `CodeEditor` and not `CodeField`/`CodeBlock` (Zach, 2026-09-16: "its
 * clear that refers to the component, CodeMirror is the library"): `Code`
 * alone collides with nothing here, `Field`/`Block` each already carry a
 * different meaning elsewhere in bbox-ui (`Block` is the canvas node this
 * app also ships; `CodeBlock` collides with a real Code node on the
 * SystemSketch canvas) — `Editor` says what it is without borrowing either.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({
  value,
  onWrite,
  beginEdit,
  onEditEnd,
  language,
  theme,
  multiline = false,
  lineNumbers = false,
  overflow = "clip",
  columns = 0,
  fontSizePx = 13,
  lineHeightPx,
  align = "left",
  disabled = false,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  diagnostics,
  className,
  testId,
  style,
  autoFocus = false,
  cursorAt,
  selectRange,
  onEnter,
  onEscape,
  onKeyDown,
  onViewReady,
}, ref) {
  const wrap = overflow === "wrap";
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const gutterCompartment = useRef(new Compartment());
  const editableCompartment = useRef(new Compartment());
  const placeholderCompartment = useRef(new Compartment());
  const metricsCompartment = useRef(new Compartment());

  const latest = useRef({
    onWrite,
    beginEdit,
    onEditEnd,
    onEnter,
    onEscape,
    onKeyDown,
    value,
    disabled,
    multiline,
  });
  latest.current = {
    onWrite,
    beginEdit,
    onEditEnd,
    onEnter,
    onEscape,
    onKeyDown,
    value,
    disabled,
    multiline,
  };

  const metrics = (): Extension => [
    EditorView.theme({
      ...(lineHeightPx
        ? { ".cm-line": { lineHeight: `${lineHeightPx}px`, height: `${lineHeightPx}px` } }
        : {}),
      ...(align === "right" ? { ".cm-content": { textAlign: "right" } } : {}),
    }),
    ...(wrap ? [EditorView.lineWrapping] : []),
  ];

  const gestureRef = useRef<FieldGesture | null>(null);
  if (!gestureRef.current) {
    gestureRef.current = new FieldGesture(
      {
        write: (next) => latest.current.onWrite(next),
        begin: () => latest.current.beginEdit?.(),
        end: (next, start) => latest.current.onEditEnd?.(next, start),
      },
      "live",
    );
  }
  const gesture = gestureRef.current;

  const leave = (view: EditorView) => {
    view.contentDOM.blur();
    gesture.commit();
  };

  useImperativeHandle(ref, () => ({
    setCaret: (offset) => {
      const view = viewRef.current;
      if (!view) return;
      const anchor = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor) });
      view.focus();
    },
    focus: () => viewRef.current?.focus(),
  }), []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          Prec.highest(
            EditorView.domEventHandlers({
              keydown: (event, target) => {
                if (event.isComposing || !latest.current.onKeyDown) return false;
                if (!latest.current.onKeyDown(event, target)) return false;
                event.preventDefault();
                event.stopPropagation();
                return true;
              },
            }),
          ),
          // Enter and Escape are the field's exits, handled on the raw
          // event so the keystroke can be STOPPED — see codeField.tsx's own
          // WHY (unchanged here; there is no completion popup any more to
          // give first refusal to, so that branch is simply gone).
          Prec.high(
            EditorView.domEventHandlers({
              keydown: (event, target) => {
                if (event.isComposing) return false;
                if (event.key !== "Enter" && event.key !== "Escape") return false;
                const modifierEnter = event.key === "Enter" && (event.ctrlKey || event.metaKey);
                if (event.key === "Enter" && latest.current.multiline && !modifierEnter) {
                  return false;
                }
                event.preventDefault();
                event.stopPropagation();
                const exit = event.key === "Enter" ? latest.current.onEnter : latest.current.onEscape;
                if (exit) exit();
                else leave(target);
                return true;
              },
            }),
          ),
          singleLineGuard(() => latest.current.multiline),
          keymap.of([
            { key: "Ctrl-ArrowUp", run: moveLineUp },
            { key: "Ctrl-ArrowDown", run: moveLineDown },
            { key: "Ctrl-Shift-ArrowUp", run: copyLineUp },
            { key: "Ctrl-Shift-ArrowDown", run: copyLineDown },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          languageCompartment.current.of(language ?? []),
          // WHY `codeEditorHighlightStyle` and not the stock `classHighlighter`
          // this used to mount directly: see codeEditorHighlight.ts's own WHY.
          syntaxHighlighting(codeEditorHighlightStyle),
          // WHY `null`, not a no-op `() => []` (measured, not assumed —
          // see this lane's own report for the timeline): `linter()`'s
          // ViewPlugin schedules `source(view)` to run ONCE, UNCONDITIONALLY,
          // `delay`ms (default 750) after every mount/relevant update —
          // it is not "only on a real edit". A `() => []` source WOULD
          // run at that mark and dispatch `setDiagnostics(state, [])`,
          // silently ERASING whatever this file's own sync effect (below)
          // had written — reproduced live: a squiggle painted at t=0
          // vanished at exactly t=750ms in every run. `null` is filtered
          // out of the `sources` facet entirely (lintConfig's own
          // `combine`), so the plugin's scheduled `run()` finds
          // `sources.length === 0` and dispatches NOTHING — this
          // component's diagnostics are pushed in from OUTSIDE (a host/
          // producer), never computed by a live in-editor linter, so
          // there must be no active source at all. The state field and
          // decorations (`lintState`/`lintExtensions`) still mount
          // unconditionally either way, which is all `setDiagnostics`
          // (the sync effect below) needs to have somewhere to write.
          cmLinter(null),
          gutterCompartment.current.of(lineNumbers ? [lineNumbersExtension()] : []),
          editableCompartment.current.of(EditorView.editable.of(!disabled)),
          placeholderCompartment.current.of(placeholder ? placeholderExtension(placeholder) : []),
          metricsCompartment.current.of(metrics()),
          EditorView.inputHandler.of((target, from, to, insertedText) => {
            if (latest.current.multiline || !/[\r\n]/.test(insertedText)) return false;
            const cleaned = insertedText.replace(/[\r\n]+/g, "");
            target.dispatch({
              changes: { from, to, insert: cleaned },
              selection: { anchor: from + cleaned.length },
            });
            return true;
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.every((tr) => tr.annotation(externalSync))) return;
            const text = update.state.doc.toString();
            gesture.focus(latest.current.value);
            gesture.change(text);
          }),
          EditorView.domEventHandlers({
            focus: () => {
              if (latest.current.disabled) return;
              gesture.focus(latest.current.value);
            },
            blur: () => {
              globalThis.setTimeout(() => {
                const current = viewRef.current;
                if (current && !current.hasFocus) gesture.commit();
              }, 0);
            },
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    onViewReady?.(view);
    let frame = 0;
    if (autoFocus) {
      const take = () => {
        if (view.hasFocus || !viewRef.current) return;
        view.focus();
        const length = view.state.doc.length;
        if (selectRange) {
          const anchor = Math.max(0, Math.min(selectRange.from, length));
          const head = Math.max(anchor, Math.min(selectRange.to, length));
          view.dispatch({ selection: { anchor, head } });
        } else if (cursorAt !== undefined) {
          const anchor = Math.max(0, Math.min(cursorAt, length));
          view.dispatch({ selection: { anchor } });
        } else if (autoFocus === "select") {
          view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        }
      };
      take();
      frame = requestAnimationFrame(take);
    }
    return () => {
      cancelAnimationFrame(frame);
      viewRef.current = null;
      view.destroy();
    };
    // One mount for the field's lifetime; content, language, chrome and
    // editability flow through compartments and dispatches so a re-render
    // never tears the document down mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The document follows the store whenever nobody is typing in it.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    if (gesture.isEditing && view.hasFocus) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalSync.of(true),
    });
  }, [value, gesture]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: languageCompartment.current.reconfigure(language ?? []) });
  }, [language]);

  // `setDiagnostics` REPLACES the lint state field wholesale — a plain
  // `Diagnostic[]`, not a compartment reconfigure, because it is data, not
  // an extension. `message` is required by `@codemirror/lint`'s own type
  // (ours is optional, §1's `Diagnostic.message` doc) — falling back to
  // the severity word keeps the squiggle's built-in hover from rendering
  // an empty popup when a producer marks a range before its prose exists.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const mapped: CMDiagnostic[] = (diagnostics ?? []).map((d) => ({
      from: d.from,
      to: d.to,
      severity: d.severity,
      message: d.message ?? d.severity,
    }));
    view.dispatch(cmSetDiagnostics(view.state, mapped));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterCompartment.current.reconfigure(lineNumbers ? [lineNumbersExtension()] : []),
    });
  }, [lineNumbers]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({ effects: metricsCompartment.current.reconfigure(metrics()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineHeightPx, align, wrap]);

  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        placeholder ? placeholderExtension(placeholder) : [],
      ),
    });
  }, [placeholder]);

  // See codeField.tsx's own WHY: a canvas host typically swallows the
  // native pointerdown/wheel a plain blur/scroll would rely on.
  useLayoutEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const host = hostRef.current;
      const view = viewRef.current;
      if (!host || !view || !view.hasFocus) return;
      if (event.target instanceof Node && host.contains(event.target)) return;
      leave(view);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      if (viewRef.current?.hasFocus) event.stopPropagation();
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, []);

  /**
   * The gesture's third boundary: the host tore the field down while it was
   * still being edited. `codeEditorGesture.ts`'s own doc explains why this
   * cannot be left to `blur` — no `blur` fires for a focused element removed
   * from the DOM, so a commit-on-blur field silently loses the last edit.
   *
   * DEFERRED BY A FRAME, AND CANCELLED IF THE EFFECT COMES BACK — which is a
   * fix for a real, reproducible bug, not defensive noise.
   *
   * React StrictMode (development) mounts every effect, cleans it up, and
   * mounts it again. The element is never removed from the document; only the
   * effects are replayed. A synchronous `gesture.commit()` in that cleanup
   * therefore fires `onEditEnd` a millisecond after the editor appears — and
   * `LabeledPort` uses `onEditEnd` to LEAVE edit mode, so clicking a port's
   * label opened an editor that closed itself on the next tick. Measured in
   * the notebook lab (now /home/bam/marimo-canvas; ported from
   * claude/notebook-lab-work-order-472c22 `23ab20e`): `data-editing` flipped
   * true at t and false at t+2ms, and dropping `<StrictMode>` alone made the
   * feature work. It was invisible because nothing wrapped a `CodeEditor`
   * story in StrictMode, and because "does the editor open" reads identically
   * to "does it stay open" in any assertion that does not wait.
   *
   * Deferring to the next frame distinguishes the two cases without guessing:
   * a StrictMode remount re-runs this effect immediately and cancels the
   * pending commit, while a genuine unmount has nothing to cancel it and the
   * commit lands one frame later — on callbacks held in a ref, so a late call
   * is exactly as valid as the synchronous one was. `gesture` is created once
   * per mount (`gestureRef`), so the only re-run this effect ever sees is the
   * StrictMode replay, never a swap that would cancel a different gesture's
   * commit.
   */
  const pendingCommit = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCommit.current !== null) {
      cancelAnimationFrame(pendingCommit.current);
      pendingCommit.current = null;
    }
    return () => {
      pendingCommit.current = requestAnimationFrame(() => {
        pendingCommit.current = null;
        gesture.commit();
      });
    };
  }, [gesture]);

  const width = wrap ? undefined : codeEditorWidthPx(columns, fontSizePx, lineNumbers, PADDING_X, PADDING_X);
  // §5's own words: "whole-field error also sets the existing
  // `ariaInvalid`" — an explicit `true` is never downgraded by an absent
  // error range; an explicit `false`/omitted still turns on the instant
  // ANY range in the list is `severity: "error"`.
  const hasErrorDiagnostic = (diagnostics ?? []).some((d) => d.severity === "error");
  const resolvedAriaInvalid = ariaInvalid || hasErrorDiagnostic;

  const boxStyle: CSSProperties = {
    fontSize: fontSizePx,
    ...(width !== undefined ? { width } : {}),
  };

  return (
    <div
      data-slot="code-editor"
      data-multiline={multiline}
      data-line-numbers={lineNumbers}
      data-overflow={overflow}
      data-language={language ? "set" : undefined}
      data-theme={typeof theme === "string" ? theme : theme?.id}
      className={`bbox-code-editor bbox-code-tokens${className ? ` ${className}` : ""}`}
      ref={hostRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={resolvedAriaInvalid ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      aria-multiline={multiline ? true : undefined}
      data-testid={testId}
      // Theme vars sit BETWEEN boxStyle and the caller's own `style` — a
      // caller override (including a caller's own --bbox-tok-* variable)
      // still wins over the theme, same as it always won over boxStyle.
      style={{ ...boxStyle, ...codeEditorThemeVars(theme), ...style }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
});
