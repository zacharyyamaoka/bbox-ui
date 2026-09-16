import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionStatus,
  currentCompletions,
  insertCompletionText,
  pickedCompletion,
  selectedCompletionIndex,
  setSelectedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { cursorLineDown, cursorLineUp } from "@codemirror/commands";
import { Prec, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  getTooltip,
  keymap,
  showTooltip,
  type Command,
  type Rect,
  type TooltipView,
} from "@codemirror/view";

/**
 * The autocomplete menu: one CodeMirror extension any field can mount.
 *
 * It is CodeMirror's own completion tooltip — its DOM, ARIA, mouse accept,
 * vertical flip (sticky for the session) and horizontal clamp are all
 * reused untouched — plus the parts the stock popup does not have: a
 * configurable anchor, a configurable end-of-list rule, a second-invocation
 * "widen" mode with a footer strip, Tab-vs-Enter replacement, a kind-badge
 * column and a "No matches" row.
 *
 * A field plugs it in through anything that takes an `Extension`. Today's
 * `CodeField` needs no change at all — a grammar passes the menu as its
 * `language` and leaves `complete` unset:
 *
 * ```ts
 * const grammar: CodeFieldGrammar = {
 *   language: [python(), completionMenu({ source, badge, footer })],
 * };
 * ```
 *
 * The later swap inside `codeGrammar.ts`'s `completionExtension` is
 * this, replacing its `autocompletion({...})` call:
 *
 * ```ts
 * return completionMenu({
 *   source: ({ text, pos, explicit }) => {
 *     const slot = grammar.slotAt?.(text, pos) ?? null;
 *     return grammar.complete!(slot, slot?.query ?? "", { text, pos, explicit });
 *   },
 *   badge: grammar.completionBadge,
 * });
 * ```
 *
 * (`complete`'s own `from`/`to` are then superseded by the menu's word
 * detection — pass `wordChar` when a grammar's slot is not an identifier run.)
 *
 * Never mount it beside a second `autocompletion()` in the same editor —
 * CodeMirror cannot merge two `override` lists and throws.
 */

/** Where the popup's left edge is pinned. See `CompletionMenuOptions.anchor`. */
export type CompletionMenuAnchor = "cursor" | "word" | "field";

/** What ↑ on the first item / ↓ on the last item does. See `CompletionMenuOptions.atEnds`. */
export type CompletionMenuAtEnds = "wrap" | "caret";

/** One row of the menu. Pure data — the menu owns every DOM and keyboard concern. */
export interface CompletionMenuItem {
  label: string;
  /** Right-aligned, and the first thing to truncate when the row is tight. */
  detail?: string;
  /** A kind tag. Drives `badge` and lands on the pill as `data-kind`, never interpreted otherwise. */
  type?: string;
  /** Struck through and dimmed, but still selectable. */
  deprecated?: boolean;
}

/** The identifier run around the caret: `[from, to)` is the whole word, `query` the part before the caret. */
export interface CompletionMenuWord {
  from: number;
  to: number;
  query: string;
}

export interface CompletionMenuContext {
  /** The whole document. */
  text: string;
  /** The caret. */
  pos: number;
  /** Opened by Ctrl+Space rather than by typing. */
  explicit: boolean;
  /**
   * Ctrl+Space was pressed again while the menu was open (JetBrains'
   * "second invocation") — offer the wider vocabulary. Pressing it once
   * more narrows back. Resets to `false` whenever the word being completed
   * changes, on Escape and on accept.
   */
  widened: boolean;
  word: CompletionMenuWord;
}

export interface CompletionMenuFooter {
  /** Beside the `Ctrl Space` key cap while narrow, e.g. `"every type on this board"`. */
  hint: string;
  /** Shown while widened instead of `hint`, e.g. `"back to likely matches"`. Defaults to `hint`. */
  widenedHint?: string;
  /** Told after every widen/narrow flip, whether it came from the key or a click on the footer. */
  onToggle?(widened: boolean): void;
}

export interface CompletionMenuOptions {
  /**
   * Return `null` to refuse outright (the menu stays closed, even on
   * Ctrl+Space — e.g. a free-text slot). Return `{ options: [] }` for
   * "nothing matched": closed while typing, a muted `No matches for “x”`
   * row when opened with Ctrl+Space. Never called while typing an empty
   * word, so a source never sees the keystroke that typed a space.
   *
   * Runs synchronously, on every keystroke, inside CodeMirror's state
   * update — keep it a pure function of its context; never dispatch.
   */
  source(ctx: CompletionMenuContext): { options: CompletionMenuItem[] } | null;
  /**
   * - `"cursor"` — the left edge follows the caret on every keystroke (VS Code).
   * - `"word"` — pinned to the start of the word being completed; typing
   *   inside the word does not slide it (IntelliJ, CodeMirror's default).
   * - `"field"` — pinned to the start of the line, i.e. the start of a
   *   single-line box (tight spaces).
   *
   * In every mode the popup prefers below, flips above only when below
   * does not fit and above has more room, stays on that side until it
   * closes, and slides sideways to stay on screen — never flips sideways.
   *
   * @default "word"
   */
  anchor?: CompletionMenuAnchor;
  /**
   * - `"wrap"` — ↓ on the last item goes to the first, ↑ on the first to the last.
   * - `"caret"` — ↓ on the last item closes the menu and moves the caret
   *   down a line; ↑ on the first closes it and moves the caret up. With a
   *   single item this is VS Code's behaviour.
   *
   * PageUp/PageDown always clamp at the ends.
   *
   * @default "wrap"
   */
  atEnds?: CompletionMenuAtEnds;
  /** Visible rows before the list scrolls. @default 10 */
  maxRows?: number;
  /** The kind pill for an item's `type`. Configuring it reserves a fixed-width column so every label lines up, pill or not. */
  badge?(type: string): string | null | undefined;
  /** A non-selectable strip under the list that toggles widen/narrow. Omit for no footer. */
  footer?: CompletionMenuFooter;
  /**
   * Matches ONE identifier character; the word is the maximal run of them
   * around the caret. Global/sticky flags are ignored.
   *
   * @default DEFAULT_WORD_CHAR (letters, digits, `_`, `$`)
   */
  wordChar?: RegExp;
}

// WHY both are options with defaults, not a decision baked in (Zach,
// 2026-09-14: "don't choose, support the different types, adjustable to
// people's preferences later"): cursor-following vs word-pinned and
// wrap vs fall-through-to-caret are each a real, shipped convention with
// its own users (VS Code vs IntelliJ). The defaults are only the reversible
// starting point; nothing below assumes either one.
const DEFAULT_ANCHOR: CompletionMenuAnchor = "word";
const DEFAULT_AT_ENDS: CompletionMenuAtEnds = "wrap";
const DEFAULT_MAX_ROWS = 10;

export const DEFAULT_WORD_CHAR = /[\p{L}\p{N}_$]/u;

function singleCharTester(wordChar: RegExp): (char: string) => boolean {
  // A `g`/`y` regex carries `lastIndex` between `test` calls and would
  // silently skip characters — strip those flags once, up front.
  const tester = new RegExp(wordChar.source, wordChar.flags.replace(/[gy]/g, ""));
  return (char) => tester.test(char);
}

/** The code point ending at UTF-16 offset `end` (never half a surrogate pair). */
function charBefore(text: string, end: number): string {
  const low = text.charCodeAt(end - 1);
  if (end >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(end - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(end - 2, end);
  }
  return text.slice(end - 1, end);
}

/** The code point starting at UTF-16 offset `start`. */
function charAt(text: string, start: number): string {
  return String.fromCodePoint(text.codePointAt(start)!);
}

/**
 * The identifier run around `pos`: scans left and right while characters
 * match `wordChar`. A caret between two non-word characters yields an
 * empty word at `pos`.
 */
export function wordAt(text: string, pos: number, wordChar: RegExp = DEFAULT_WORD_CHAR): CompletionMenuWord {
  const isWordChar = singleCharTester(wordChar);
  let from = pos;
  while (from > 0) {
    const char = charBefore(text, from);
    if (!isWordChar(char)) break;
    from -= char.length;
  }
  let to = pos;
  while (to < text.length) {
    const char = charAt(text, to);
    if (!isWordChar(char)) break;
    to += char.length;
  }
  return { from, to, query: text.slice(from, pos) };
}

/**
 * The document range an accepted `label` replaces.
 *
 * - `"tab"` replaces the whole identifier, both sides of the caret.
 * - `"enter"` replaces up to the caret, and also eats the text after the
 *   caret only when that text is a suffix of the pick — so `Ty|pe` → `Type`
 *   (not `Typepe`), while `Pos|xx` → `Posexx` keeps an unrelated tail.
 */
export function acceptRange(
  mode: "tab" | "enter",
  word: CompletionMenuWord,
  pos: number,
  text: string,
  label: string,
): { from: number; to: number } {
  if (mode === "tab") return { from: word.from, to: word.to };
  const after = text.slice(pos, word.to);
  return { from: word.from, to: label.endsWith(after) ? word.to : pos };
}

/** Either the next selected index, or "leave the list" in a direction. */
export type CompletionMenuStep = { index: number } | { exit: "up" | "down" };

/**
 * Where ↑/↓/PageUp/PageDown take the selection. `current` is `-1` when
 * nothing is selected; `count` is the number of SELECTABLE rows (0 for
 * the "No matches" row). `pageSize` > 1 means a page move, which clamps
 * at the ends regardless of `atEnds`.
 */
export function stepSelection(
  current: number,
  count: number,
  direction: "up" | "down",
  atEnds: CompletionMenuAtEnds,
  pageSize = 1,
): CompletionMenuStep {
  const paging = pageSize > 1;
  if (count <= 0) return atEnds === "caret" && !paging ? { exit: direction } : { index: current };
  if (current < 0) return { index: direction === "down" ? 0 : count - 1 };
  const next = current + (direction === "down" ? pageSize : -pageSize);
  if (paging) return { index: Math.max(0, Math.min(count - 1, next)) };
  if (next >= count) return atEnds === "wrap" ? { index: 0 } : { exit: "down" };
  if (next < 0) return atEnds === "wrap" ? { index: count - 1 } : { exit: "up" };
  return { index: next };
}

/**
 * The label runs to embolden for `query`: the first case-insensitive
 * occurrence (a prefix whenever there is one), as CodeMirror's flat
 * `[from, to, from, to…]` list. Compared slice by slice so a character
 * whose lower-case form has a different length cannot skew the offsets.
 */
export function matchRanges(label: string, query: string): number[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  for (let index = 0; index + query.length <= label.length; index += 1) {
    if (label.slice(index, index + query.length).toLowerCase() === needle) {
      return [index, index + query.length];
    }
  }
  return [];
}

/** Per-word widen state. `wordFrom` is where the word under the caret starts. */
export interface CompletionMenuWidenState {
  widened: boolean;
  wordFrom: number;
}

/**
 * The widen reducer. An explicit set wins; otherwise moving to a
 * different word narrows back — "every type on this board" is a mode of
 * one word's conversation, not a sticky preference (the donor's
 * `broadenField` rule, systemsketch `typeNameCompletion.ts`).
 */
export function nextWidenState(
  previous: CompletionMenuWidenState,
  wordFrom: number,
  set?: boolean,
): CompletionMenuWidenState {
  if (set !== undefined) return { widened: set, wordFrom };
  if (wordFrom !== previous.wordFrom) return { widened: false, wordFrom };
  return previous;
}

const NO_MATCH_CLASS = "bbox-completion-menu__empty";

function wordAtState(state: EditorState, pos: number, wordChar: RegExp): CompletionMenuWord {
  // Words never span a newline, so scanning the caret's line is enough and
  // keeps this O(line) on every keystroke instead of O(document).
  const line = state.doc.lineAt(pos);
  const local = wordAt(line.text, pos - line.from, wordChar);
  return { from: local.from + line.from, to: local.to + line.from, query: local.query };
}

/** The completion popup's own tooltip view in `view`, if it is on screen. */
function menuTooltipView(view: EditorView): TooltipView | null {
  for (const tooltip of view.state.facet(showTooltip)) {
    if (!tooltip) continue;
    const tooltipView = getTooltip(view, tooltip);
    if (tooltipView?.dom.classList.contains("cm-tooltip-autocomplete")) return tooltipView;
  }
  return null;
}

/** Rows that fit in the list right now, minus one — the page step, as CodeMirror computes it. */
function pageStep(dom: HTMLElement): number {
  const list = dom.querySelector("ul");
  const row = list?.querySelector("li");
  if (!list || !row || row.offsetHeight === 0) return 1;
  return Math.max(1, Math.floor(list.clientHeight / row.offsetHeight) - 1);
}

export function completionMenu(options: CompletionMenuOptions): Extension {
  const anchor = options.anchor ?? DEFAULT_ANCHOR;
  const atEnds = options.atEnds ?? DEFAULT_AT_ENDS;
  const maxRows = Math.max(1, Math.floor(options.maxRows ?? DEFAULT_MAX_ROWS));
  const wordChar = options.wordChar ?? DEFAULT_WORD_CHAR;
  const { badge, footer } = options;

  const setWidened = StateEffect.define<boolean>();
  const widenField = StateField.define<CompletionMenuWidenState>({
    create: (state) => ({ widened: false, wordFrom: wordAtState(state, state.selection.main.head, wordChar).from }),
    update(value, tr) {
      let set: boolean | undefined;
      for (const effect of tr.effects) if (effect.is(setWidened)) set = effect.value;
      if (set === undefined && !tr.docChanged && !tr.selection) return value;
      const wordFrom = wordAtState(tr.state, tr.state.selection.main.head, wordChar).from;
      return nextWidenState(value, wordFrom, set);
    },
  });

  // The rows the menu rendered, keyed by CodeMirror's own completion
  // object — so `optionClass`/`addToOptions` can style a row from the
  // source's data without widening CodeMirror's `Completion` type.
  const rows = new WeakMap<Completion, CompletionMenuItem | "no-match">();
  let acceptMode: "tab" | "enter" = "enter";

  // WHY one `apply` for every row, reading the accept mode from a closure
  // rather than CodeMirror's `from`/`to`: Tab and Enter replace DIFFERENT
  // ranges (`acceptRange`), and CodeMirror's `apply` has no idea which key
  // fired it. Routing both keys through `acceptCompletion` (not a
  // hand-rolled insert) keeps its guards — read-only, a list mid-refresh,
  // the 75 ms "just opened" interaction delay. A mouse click arrives here
  // with the default, Enter's semantics.
  const apply = (view: EditorView, completion: Completion) => {
    const { state } = view;
    const pos = state.selection.main.head;
    const word = wordAtState(state, pos, wordChar);
    const range = acceptRange(acceptMode, word, pos, state.doc.toString(), completion.label);
    view.dispatch({
      ...insertCompletionText(state, completion.label, range.from, range.to),
      annotations: pickedCompletion.of(completion),
      effects: setWidened.of(false),
    });
  };
  // The "No matches" row is a statement, not a candidate: a click on it does
  // nothing (Enter/Tab on it close the menu instead — see `accept` — so
  // neither key is silently swallowed).
  const inert = () => {};

  const compute = (state: EditorState, pos: number, explicit: boolean): CompletionResult | null => {
    const word = wordAtState(state, pos, wordChar);
    if (!explicit && word.query === "") return null;
    const { widened } = state.field(widenField);
    const result = options.source({ text: state.doc.toString(), pos, explicit, widened, word });
    if (!result) return null;
    let completions: Completion[];
    if (result.options.length > 0) {
      completions = result.options.map((item) => {
        const completion: Completion = { label: item.label, detail: item.detail, type: item.type, apply };
        rows.set(completion, item);
        return completion;
      });
    } else if (explicit) {
      const completion: Completion = { label: `No matches for “${word.query}”`, apply: inert };
      rows.set(completion, "no-match");
      completions = [completion];
    } else {
      return null;
    }
    return {
      from: word.from,
      to: pos,
      options: completions,
      // The source already ranked its answer; CodeMirror's fuzzy filter
      // would impose a second, disagreeing opinion (the donor's own call).
      filter: false,
      getMatch: (completion) => (rows.get(completion) === "no-match" ? [] : matchRanges(completion.label, word.query)),
      // Recompute synchronously on each keystroke rather than waiting out
      // CodeMirror's re-query debounce — the list and (for `anchor:
      // "cursor"`) the popup's position then change in the same frame as
      // the typed letter. An empty list closes at once instead of lingering
      // disabled for a debounce. `explicit` carries over from the query
      // that opened this session, as CodeMirror's own result state does.
      update: (_current, from, _to, context) =>
        compute(context.state, context.pos, explicit) ?? { from, options: [] },
    };
  };
  const source = (context: CompletionContext) => compute(context.state, context.pos, context.explicit);

  const isNoMatch = (completions: readonly Completion[]) =>
    completions.length === 1 && rows.get(completions[0]!) === "no-match";

  const toggleWidened = (view: EditorView) => {
    const next = !view.state.field(widenField).widened;
    view.dispatch({ effects: setWidened.of(next) });
    startCompletion(view);
    footer?.onToggle?.(next);
  };

  const move =
    (direction: "up" | "down", paging: boolean): Command =>
    (view) => {
      if (completionStatus(view.state) === null) return false;
      const tooltip = menuTooltipView(view);
      // Nothing on screen yet (the first query is still pending): the key
      // belongs to the caret, exactly as if the menu were closed.
      if (!tooltip) return false;
      const completions = currentCompletions(view.state);
      // A list mid-refresh (Ctrl+Space re-querying) is still on screen;
      // swallow the key rather than let it move the caret under it.
      if (completions.length === 0) return true;
      const count = isNoMatch(completions) ? 0 : completions.length;
      const current = selectedCompletionIndex(view.state) ?? -1;
      const step = stepSelection(current, count, direction, atEnds, paging ? Math.max(2, pageStep(tooltip.dom)) : 1);
      if ("exit" in step) {
        closeCompletion(view);
        (step.exit === "down" ? cursorLineDown : cursorLineUp)(view);
        return true;
      }
      if (step.index !== current && step.index >= 0) view.dispatch({ effects: setSelectedCompletion(step.index) });
      return true;
    };

  const accept =
    (mode: "tab" | "enter"): Command =>
    (view) => {
      if (completionStatus(view.state) === null || !menuTooltipView(view)) return false;
      const completions = currentCompletions(view.state);
      if (completions.length === 0) return mode === "tab";
      if (isNoMatch(completions)) {
        closeCompletion(view);
        return true;
      }
      acceptMode = mode;
      try {
        const accepted = acceptCompletion(view);
        // Tab with a visible menu never falls through to the browser's
        // focus move, even inside the just-opened interaction delay.
        return accepted || mode === "tab";
      } finally {
        acceptMode = "enter";
      }
    };

  const invoke: Command = (view) => {
    if (completionStatus(view.state) !== null && menuTooltipView(view)) {
      toggleWidened(view);
    } else {
      // A fresh explicit open always starts narrow.
      if (view.state.field(widenField).widened) view.dispatch({ effects: setWidened.of(false) });
      startCompletion(view);
    }
    return true;
  };

  const menuKeymap = Prec.highest(
    keymap.of([
      { key: "Ctrl-Space", run: invoke },
      // CodeMirror's own macOS alternates (Ctrl-Space is the input-source
      // switch there), kept so switching to this menu drops no binding.
      { mac: "Alt-`", run: invoke },
      { mac: "Alt-i", run: invoke },
      {
        key: "Escape",
        run: (view) => {
          if (!closeCompletion(view)) return false;
          if (view.state.field(widenField).widened) view.dispatch({ effects: setWidened.of(false) });
          return true;
        },
      },
      { key: "ArrowDown", run: move("down", false) },
      { key: "ArrowUp", run: move("up", false) },
      { key: "PageDown", run: move("down", true) },
      { key: "PageUp", run: move("up", true) },
      { key: "Tab", run: accept("tab") },
      { key: "Enter", run: accept("enter") },
    ]),
  );

  // WHY the popup is moved through the tooltip view's `getCoords`, not by
  // returning a different `from` (the obvious route — CodeMirror places the
  // popup at the result's `from`): `from` is also CodeMirror's bookkeeping
  // for the completed range, and its Backspace rule closes the popup
  // whenever the caret was sitting exactly at `from`. With `from` = caret
  // (the "cursor" anchor) EVERY Backspace would close the menu. `getCoords`
  // is `TooltipView`'s documented hook for "the view finds its own screen
  // position"; everything downstream of it — flip-and-stay, horizontal
  // clamp, the hide-when-scrolled-away check — is still CodeMirror's.
  const anchorCoords =
    anchor === "word"
      ? null
      : (view: EditorView) => (): Rect => {
          const head = view.state.selection.main.head;
          const pos = anchor === "cursor" ? head : view.state.doc.lineAt(head).from;
          // A null (position scrolled out of the DOM) is what CodeMirror's
          // own `coordsAtPos` fallback returns too; its measure hides the
          // tooltip for it.
          return view.coordsAtPos(pos) as Rect;
        };

  const footerFor = new WeakMap<HTMLElement, HTMLElement>();
  const patched = new WeakSet<TooltipView>();

  // WHY the footer is a strip of its own and not a final list option (what
  // the donor shipped: a "show every type on this board" row at the foot
  // of the list): as an option, ↓ from the last real item lands on it, Enter
  // on it toggles instead of inserting, and in `atEnds: "caret"` it would
  // stand between the last item and the caret leaving the list. It is
  // chrome that explains a key, not a candidate — so it lives outside the
  // `<ul>`, where CodeMirror's selection cannot reach it at all.
  const renderFooter = (view: EditorView, dom: HTMLElement) => {
    if (!footer) return;
    let strip = footerFor.get(dom);
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "bbox-completion-menu__footer";
      const key = strip.appendChild(document.createElement("kbd"));
      key.textContent = "Ctrl Space";
      strip.appendChild(document.createElement("span"));
      // mousedown: keep focus in the editor (a focus move would close the
      // popup via CodeMirror's blur rule). click: do what the key does.
      strip.addEventListener("mousedown", (event) => event.preventDefault());
      strip.addEventListener("click", (event) => {
        event.preventDefault();
        toggleWidened(view);
      });
      footerFor.set(dom, strip);
    }
    const { widened } = view.state.field(widenField);
    const text = widened ? (footer.widenedHint ?? footer.hint) : footer.hint;
    const label = strip.lastElementChild!;
    if (label.textContent !== text) label.textContent = text;
    strip.dataset.widened = widened ? "true" : "false";
    // CodeMirror re-creates its `<ul>` with `appendChild` whenever the
    // option list changes, which would land the new list AFTER the strip;
    // re-appending keeps the strip last in DOM order too (the CSS `order`
    // already keeps it last on screen).
    if (dom.lastElementChild !== strip) dom.appendChild(strip);
  };

  // Runs after every update, once every plugin (the tooltip plugin
  // included) has updated and before the next measure — so a freshly
  // created popup has its anchor hook, row cap and footer in place before
  // it is first positioned or painted.
  const decorateTooltip = EditorView.updateListener.of((update) => {
    const tooltipView = menuTooltipView(update.view);
    if (!tooltipView) return;
    const { dom } = tooltipView;
    if (!patched.has(tooltipView)) {
      patched.add(tooltipView);
      if (anchorCoords) tooltipView.getCoords = anchorCoords(update.view);
      dom.style.setProperty("--bbox-completion-rows", String(maxRows));
      dom.dataset.anchor = anchor;
    }
    dom.classList.toggle("bbox-completion-menu--has-footer", !!footer);
    renderFooter(update.view, dom);
  });

  return [
    widenField,
    // Ahead of `autocompletion()` so it outranks anything at the same
    // precedence; CodeMirror's own completion keymap is switched off below
    // (`defaultKeymap: false`) so no key has two owners.
    menuKeymap,
    decorateTooltip,
    autocompletion({
      override: [source],
      defaultKeymap: false,
      icons: false,
      // `bbox-code-completion` is the class codeField.css's z-index floor
      // targets, so the menu stacks exactly like CodeField's own popup.
      tooltipClass: () => "bbox-code-completion bbox-completion-menu",
      optionClass: (completion) => {
        const row = rows.get(completion);
        if (row === "no-match") return NO_MATCH_CLASS;
        return row?.deprecated ? "bbox-completion-menu__deprecated" : "";
      },
      addToOptions: badge
        ? [
            {
              position: 20,
              render: (completion) => {
                const row = rows.get(completion);
                if (row === "no-match") return null;
                // The cell renders even with no pill in it, so every label
                // starts at the same x — a ragged label column is what makes
                // a kind pill harder to scan than no pill at all.
                const cell = document.createElement("span");
                cell.className = "bbox-completion-menu__badge-cell";
                const text = row?.type ? badge(row.type) : null;
                if (text) {
                  const pill = cell.appendChild(document.createElement("span"));
                  pill.className = "bbox-completion-menu__badge";
                  pill.dataset.kind = row!.type;
                  pill.textContent = text;
                }
                return cell;
              },
            },
          ]
        : [],
    }),
  ];
}
