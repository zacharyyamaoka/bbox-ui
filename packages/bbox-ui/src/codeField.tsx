import { completionStatus } from "@codemirror/autocomplete";
import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  history,
  historyKeymap,
  moveLineDown,
  moveLineUp,
} from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  tooltips,
} from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import { grammarExtensions, type CodeFieldGrammar } from "./codeGrammar";
import { CodeFieldRows } from "./codeFieldRows";
import { FieldGesture } from "./fieldGesture";

/** Marks the field's own imperative doc swaps so the change listener never echoes them back as typing. */
const externalSync = Annotation.define<boolean>();

export interface CodeFieldProps {
  /** The value. The field follows it whenever nobody is editing. */
  value: string;
  /** Write, per keystroke — the field's one write policy (see `fieldGesture.ts` for why `live` is the only mode offered here). */
  onWrite(value: string): void;
  /** Open one undo step so an edit is one Ctrl+Z, not one per character. */
  beginEdit?(): void;
  /** The commit boundary — one call per gesture, however the field was left. */
  onEditEnd?(value: string, startValue: string): void;
  /**
   * What makes this field know its grammar: slot decorations, a completion
   * source, a language. Omit it and you get the plain code text box.
   */
  grammar?: CodeFieldGrammar;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  className?: string;
  testId?: string;
  style?: CSSProperties;
  /** Take focus on mount; `'select'` also selects the whole line. */
  autoFocus?: boolean | "select";
  /** With `autoFocus`, put the caret here instead of selecting everything. */
  cursorAt?: number;
  /** With `autoFocus`, select exactly this range — the slot that was clicked, not the whole line. */
  selectRange?: { from: number; to: number };
  /**
   * A lane: several lines, one per thing. Enter inserts a line, Alt+↑/↓
   * move one, Shift+Alt+↓ copies one (all CodeMirror's default keymap);
   * Ctrl/Cmd+Enter is the exit that Enter is for a single line.
   */
  multiline?: boolean;
  /** Pin every line to this height so lines can sit on a host's own rows. */
  lineHeightPx?: number;
  align?: "left" | "right";
  /** Soft-wrap long lines (a viewer), instead of letting them run. */
  wrap?: boolean;
  /** Extra chrome rendered inside the field's frame, positioned by the host's CSS. */
  trailing?: ReactNode;
  /**
   * Enter and Escape both end the gesture by leaving the field (the value is
   * never discarded — Ctrl+Z is the retract). A host that owns its own
   * editing session supplies its own exits instead of the default `leave`.
   */
  onEnter?(): void;
  onEscape?(): void;
  onViewReady?(view: EditorView): void;
  /**
   * Controlled two-way toggle between the pretty RENDERED tree
   * (`grammar.lines`) and the live SOURCE document (CodeMirror) — the "code
   * block overlay" idea: rendered by default, source under the caret. Omit
   * entirely for a field that is always source (the original, and still
   * the right choice for a plain port row with nothing worth a read view).
   * The host owns the state; `CodeField` never flips it on its own.
   */
  mode?: "rendered" | "source";
  /** Used by the optional `CodeFieldModeToggle` sub-component; `CodeField` itself never calls this. */
  onModeChange?(mode: "rendered" | "source"): void;
  /**
   * A rendered row (or the blank space below the last one) was clicked.
   * Only meaningful with `mode` set — the host typically responds by
   * setting `mode="source"` and computing `cursorAt` from `line`/`column`
   * (see `caretGeometry.ts`'s `lineStartOffset`).
   */
  onOpenSource?(line: number, column: number): void;
}

/**
 * The code text box: one line (or a multi-line lane) of text that knows
 * what it is.
 *
 * It is a real CodeMirror document, so highlighting, the completion
 * tooltip, IME, undo and the caret all come from one mature engine rather
 * than a mirror-div. What the field does NOT know is any grammar — that
 * arrives through `grammar`, so a port line, a type alias and a plain label
 * are the same component with different grammars plugged in. Commit
 * semantics are `FieldGesture`'s, unchanged: a field never stops existing
 * with an uncommitted edit.
 *
 * With `mode` set, this is a thin dispatcher: `"rendered"` mounts
 * `CodeFieldRows` over `grammar.lines(value)` and CodeMirror never mounts at
 * all; `"source"` (or `mode` omitted) mounts the live document below. The
 * two never coexist — leaving rendered mode unmounts the row tree exactly
 * as `CodeFieldSourceView` unmounts when rendered mode takes over — so a
 * grammar with no `lines()` still works fine as an always-source field.
 */
export function CodeField(props: CodeFieldProps) {
  const { mode, grammar, value, onOpenSource, ariaLabel, className, testId } = props;
  if (mode === "rendered") {
    return (
      <CodeFieldRows
        lines={grammar?.lines?.(value) ?? []}
        resolveReference={grammar?.resolveReference}
        onOpenSource={onOpenSource}
        className={className}
        testId={testId}
      />
    );
  }
  return <CodeFieldSourceView {...props} ariaLabel={ariaLabel} />;
}

/** Two-button `[Rendered | Source]` switch — the chrome `CodeField`'s `mode` toggle needs, matching how it looks on the field this was extracted from. Entirely optional: a host may drive `mode` from its own UI instead. */
export function CodeFieldModeToggle({
  mode,
  onModeChange,
  labels = { rendered: "UI", source: "Source" },
}: {
  mode: "rendered" | "source";
  onModeChange(mode: "rendered" | "source"): void;
  labels?: { rendered: string; source: string };
}) {
  return (
    <div className="bbox-code-field-toggle" data-slot="code-field-mode-toggle">
      <button type="button" data-active={mode === "rendered" || undefined} onClick={() => onModeChange("rendered")}>
        {labels.rendered}
      </button>
      <button type="button" data-active={mode === "source" || undefined} onClick={() => onModeChange("source")}>
        {labels.source}
      </button>
    </div>
  );
}

function CodeFieldSourceView({
  value,
  onWrite,
  beginEdit,
  onEditEnd,
  grammar,
  disabled = false,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  className,
  testId,
  style,
  autoFocus = false,
  cursorAt,
  selectRange,
  multiline = false,
  lineHeightPx,
  align = "left",
  wrap = false,
  trailing,
  onEnter,
  onEscape,
  onViewReady,
}: CodeFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const grammarCompartment = useRef(new Compartment());
  const editableCompartment = useRef(new Compartment());
  const placeholderCompartment = useRef(new Compartment());
  const metricsCompartment = useRef(new Compartment());

  const latest = useRef({
    onWrite,
    beginEdit,
    onEditEnd,
    onEnter,
    onEscape,
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

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Enter and Escape are the field's exits, handled on the raw event
          // so the keystroke can be STOPPED: once the field closes, the same
          // keydown would otherwise reach a host's own document listener
          // with nothing focused — a canvas host that re-enters editing on
          // Enter, or clears a selection on Escape, would immediately undo
          // the exit. A completion popup gets first refusal — its own
          // keymap runs at a higher precedence and reports when it consumed
          // the key.
          Prec.high(
            EditorView.domEventHandlers({
              keydown: (event, target) => {
                if (event.isComposing) return false;
                if (event.key !== "Enter" && event.key !== "Escape") return false;
                if (completionStatus(target.state) === "active") return false;
                // In a lane a bare Enter is a new line; only the modifier form exits.
                if (
                  event.key === "Enter" &&
                  latest.current.multiline &&
                  !event.ctrlKey &&
                  !event.metaKey
                ) {
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
          // A lane is a small IDE buffer, so the line keys people reach for
          // all work: CodeMirror's own Alt+↑/↓ and Shift+Alt+↑/↓, plus the
          // Ctrl forms for anyone whose window manager eats Alt+arrows.
          keymap.of([
            { key: "Ctrl-ArrowUp", run: moveLineUp },
            { key: "Ctrl-ArrowDown", run: moveLineDown },
            { key: "Ctrl-Shift-ArrowUp", run: copyLineUp },
            { key: "Ctrl-Shift-ArrowDown", run: copyLineDown },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          syntaxHighlighting(classHighlighter),
          grammarCompartment.current.of(grammar ? grammarExtensions(grammar) : []),
          editableCompartment.current.of(EditorView.editable.of(!disabled)),
          placeholderCompartment.current.of(placeholder ? placeholderExtension(placeholder) : []),
          metricsCompartment.current.of(metrics()),
          // The completion popup is parented to the nearest declared tooltip
          // host (a modal, a canvas layer — anything that must keep the
          // popup inside its own stacking context), else the document body.
          // WHY only `[data-tooltip-host]` and not a specific engine's
          // container class: the field stays host-agnostic — a host opts in
          // by putting the attribute on its own wrapper rather than the
          // field special-casing a canvas library by name.
          tooltips({
            position: "absolute",
            parent: host.closest<HTMLElement>("[data-tooltip-host]") ?? document.body,
          }),
          // One line: a typed or pasted newline is dropped rather than
          // growing the field. A lane keeps its newlines — they are its rows.
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
            // A CodeMirror `contentDOM` can flicker focus during its own
            // mount work; a synchronous commit on the first flicker would
            // end the gesture the instant it began. Believed only once it
            // survives a macrotask.
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
    // Focus now and again on the next frame: a host that is mid-transition
    // (a canvas entering its own editing state) can take focus back after
    // the first attempt, and a field that opened without focus is a dead
    // field.
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
    // One mount for the field's lifetime; content, grammar and editability
    // flow through compartments and dispatches so a re-render never tears
    // the document down mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The document follows the store whenever nobody is typing in it. Every
  // keystroke round-trips back through `value` (the field's one write
  // policy is `live`), so the equality guard is what keeps this from
  // re-fighting the caret.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    if (gesture.isEditing && view.hasFocus) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalSync.of(true),
    });
  }, [value, gesture]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: grammarCompartment.current.reconfigure(grammar ? grammarExtensions(grammar) : []),
    });
  }, [grammar]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: metricsCompartment.current.reconfigure(metrics()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineHeightPx, align, wrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        placeholder ? placeholderExtension(placeholder) : [],
      ),
    });
  }, [placeholder]);

  // A canvas host typically calls `preventDefault()` on its own pointerdown,
  // so clicking the canvas never fires this field's native blur. A
  // capture-phase listener on `document` is the one place "clicked outside
  // the field" is observable regardless of what swallowed the native event.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const host = hostRef.current;
      const view = viewRef.current;
      if (!host || !view || !view.hasFocus) return;
      if (event.target instanceof Node && host.contains(event.target)) return;
      const element =
        event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (element?.closest(".cm-tooltip")) return;
      leave(view);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount is an end boundary like any other — the one the browser refuses
  // to report, since no blur fires for a focused element removed from the DOM.
  useEffect(() => () => gesture.commit(), [gesture]);

  return (
    <div
      data-slot="code-field"
      className={`bbox-code-field bbox-code-tokens${className ? ` ${className}` : ""}`}
      ref={hostRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      data-testid={testId}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {trailing}
    </div>
  );
}
