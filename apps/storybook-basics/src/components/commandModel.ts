// src/components/commandModel.ts — the quick switcher's matching rule and its
// keyboard-opening rule, ported from SystemSketch's command palette:
//   /home/bam/systemsketch/src/commands/commandModel.ts:20-53
//     (`filterCommandPaletteActions`, `actionRank`, `actionSearchText`)
//   /home/bam/systemsketch/src/chrome/SystemSketchChrome.tsx:1038-1048
//     (the window-level capture-phase keydown that opens it)
//   /home/bam/systemsketch/src/workspace/LocalWorkspace.tsx:1115-1121,1484-1489
//     and /home/bam/systemsketch/src/blocks/ui/HitAreaOverlay.tsx:57-62
//     (the "a text field owns this keystroke" guard, in all three of the
//     donor's spellings)
//
// Engine-free by rule (CLAUDE.md, "The core imports no canvas engine"): the
// donor's `Editor` argument is gone from every signature. An item's `run()`
// takes nothing and the host closes over whatever it needs; `disabled` keeps
// the donor's lazy form as a zero-argument thunk so live state can still be
// read at render time without the model knowing what it is reading.
import type { ReactNode } from "react";

/** One row of the switcher. `group` is the heading it files under. */
export interface QuickSwitcherItem {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  shortcut?: string;
  /** Right-aligned secondary text — a path, a page name, a type. */
  detail?: string;
  /** Heading this row sits under. Rows with no group render first, ungrouped. */
  group?: string;
  icon?: ReactNode;
  disabled?: boolean | (() => boolean);
  /** Keep the switcher open after a successful run. Defaults to false. */
  keepOpen?: boolean;
  run(): void | Promise<void>;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function itemSearchText(item: QuickSwitcherItem): string {
  return [item.label, item.description, item.detail, item.shortcut, item.group, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function itemRank(item: QuickSwitcherItem, query: string): number {
  const label = item.label.toLocaleLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return 3;
}

/**
 * Token-aware, stable filtering; all query words must be represented.
 *
 * WHY this and not cmdk's own scorer: cmdk filters on one `value` string per
 * item, so a query that matches a row's SHORTCUT or one of its keywords (the
 * donor's `ctrl f` → "Find and replace" case) scores zero there. The stock
 * part is mounted with `shouldFilter={false}` and handed this list instead —
 * the rule stays one pure function with its own unit tests, and cmdk keeps
 * owning selection, roving focus and scroll-into-view.
 */
export function filterQuickSwitcherItems(
  items: readonly QuickSwitcherItem[],
  query: string,
): QuickSwitcherItem[] {
  const tokens = normalized(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...items];
  return items
    .map((item, index) => ({ item, index, haystack: itemSearchText(item) }))
    .filter(({ haystack }) => tokens.every((token) => haystack.includes(token)))
    .sort((a, b) => itemRank(a.item, tokens[0]) - itemRank(b.item, tokens[0]) || a.index - b.index)
    .map(({ item }) => item);
}

export function quickSwitcherItemDisabled(item: QuickSwitcherItem): boolean {
  return typeof item.disabled === "function" ? item.disabled() : Boolean(item.disabled);
}

/** Items bucketed by `group`, each group in first-appearance order. */
export function groupQuickSwitcherItems(
  items: readonly QuickSwitcherItem[],
): Array<{ group: string | undefined; items: QuickSwitcherItem[] }> {
  const buckets: Array<{ group: string | undefined; items: QuickSwitcherItem[] }> = [];
  for (const item of items) {
    const existing = buckets.find((bucket) => bucket.group === item.group);
    if (existing) existing.items.push(item);
    else buckets.push({ group: item.group, items: [item] });
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Opening it: the bare-letter rule
// ---------------------------------------------------------------------------

/**
 * The subset of `KeyboardEvent` the rule reads. A real `KeyboardEvent` is
 * assignable to this.
 *
 * WHY a structural type rather than the DOM's `KeyboardEvent`: this rule is
 * the one part of the switcher that MUST be exercised for every way it can be
 * wrong, and a `node` test has no DOM to construct an event in. Typing it
 * structurally is what lets `commandModel.test.ts` assert all nine outcomes
 * below without a browser.
 */
export interface QuickSwitcherKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: unknown;
}

/** A `document`-shaped probe. The real `document` satisfies it. */
export interface QuickSwitcherLayerRoot {
  querySelector(selectors: string): unknown;
}

export interface QuickSwitcherKeyEnvironment {
  /** The switcher is already open — a second `S` is someone typing into it. */
  open?: boolean;
  /**
   * Where to look for an already-open menu/dialog/popover. Defaults to the
   * ambient `document` when one exists, and to "no layer" when one does not.
   */
  root?: QuickSwitcherLayerRoot | null;
}

export type QuickSwitcherKeyOutcome =
  | { open: true; source: "letter" | "chord" }
  | {
      open: false;
      reason:
        | "not-a-binding"
        | "modifier"
        | "repeat"
        | "composing"
        | "default-prevented"
        | "typing"
        | "layer-open"
        | "already-open";
    };

/**
 * Every layer that, while it is up, owns the keyboard. Both spellings are
 * listed on purpose: the `data-slot` values are this trunk's own menu kit,
 * and the ARIA roles catch a host's menus (tldraw's `.tlui-menu` is
 * `role="menu"`, its modals `role="dialog"`) without this file importing or
 * knowing anything about that host.
 */
const OPEN_LAYER_SELECTOR = [
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dialog-content"]',
  '[role="menu"]',
  '[role="dialog"]',
]
  // WHY every one of them is qualified `:not([data-closed])`: Base UI keeps a
  // popup MOUNTED through its exit transition and swaps `data-open` for
  // `data-closed` while it fades. Without this, the sequence that a jump
  // surface gets used in — S, Escape, S — refuses the second S, because the
  // dialog that just closed is still in the DOM for another 100ms. The
  // S · Escape · S sequence is driven end to end in QuickSwitcher.stories.tsx
  // (`ReopensAfterEscape`), which is what holds this line.
  .map((selector) => `${selector}:not([data-closed])`)
  .join(", ");

// WHY not `[data-open]`, the attribute every Base UI popup carries while it is
// up: Base UI puts it on an expanded Collapsible panel too, so any block with
// its members section unfolded would read as "a menu is open" and kill the
// bare letter for the rest of the session. The same goes for `[role="listbox"]`
// — a static list is not a layer. Naming the four popup slots and the two
// modal roles is narrower and does not have that failure mode.

/** True when a menu, dialog or popover is already on screen. */
export function quickSwitcherLayerIsOpen(root?: QuickSwitcherLayerRoot | null): boolean {
  const probe = root ?? (typeof document === "undefined" ? null : (document as unknown as QuickSwitcherLayerRoot));
  if (!probe) return false;
  try {
    return probe.querySelector(OPEN_LAYER_SELECTOR) != null;
  } catch {
    // A host may hand us a root whose querySelector rejects this selector
    // (an old engine, a shadow root polyfill). Refusing to open is the
    // conservative half of the trade — the chord still works.
    return true;
  }
}

/**
 * True when a text field, textarea, select or contenteditable owns the
 * keystroke — including tldraw's shape-text editor, which is a contenteditable.
 *
 * WHY duck-typed instead of the donor's `target instanceof HTMLElement`
 * (LocalWorkspace.tsx:1118): `instanceof` is false across realms, so the same
 * `<input>` inside a portal into another document — or inside Storybook's own
 * preview iframe — reads as "not typing" and a bare `S` eats the character.
 * It is also unconstructable in a `node` test, which would push the one rule
 * that must not be wrong into the untested half. Reading the three facts
 * directly is true in more places AND testable in all of them.
 */
export function isQuickSwitcherTypingTarget(target: unknown): boolean {
  if (target == null || typeof target !== "object") return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    contentEditable?: unknown;
    readOnly?: unknown;
  };
  if (element.isContentEditable === true) return true;
  if (element.contentEditable === "true" || element.contentEditable === "plaintext-only") return true;
  const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  // WHY a read-only input still counts: it is focusable and selectable, the
  // caret is visible in it, and a letter that vanishes into a command palette
  // from a field that LOOKS like a text field is the same surprise either way.
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

/**
 * Should this keystroke open the quick switcher?
 *
 * Two bindings, and they are deliberately not equivalent:
 *
 * - **bare `S`** — Zach's ask (`PROJECT - System Sketch.md`, 2026-09-19). `s`
 *   is free in tldraw: its single-letter tool bindings are `a e f g h k l n q
 *   t v`. A bare letter is one keystroke away from being a typed character,
 *   so it is refused whenever anything else could reasonably want it —
 *   typing, an open layer, a held Ctrl/Cmd/Alt, an autorepeat, an IME
 *   composition, or an event a nearer handler already claimed.
 * - **Ctrl/Cmd+K** — universal muscle memory, and NOT a character, so it is
 *   allowed to fire while a text field has focus. That is the donor's own
 *   behaviour (SystemSketchChrome.tsx:1039-1043, which guards on modifiers
 *   only and never looks at the target) and it is why VS Code's palette opens
 *   from inside the editor.
 *
 * `Shift` is allowed on the letter: `Shift+S` arrives as `key === "S"` and
 * nothing else is bound to it, so treating the two the same costs nothing.
 * `Alt` is not, because `Alt+S` is a menu mnemonic on Windows and Linux.
 */
export function quickSwitcherKeyDecision(
  event: QuickSwitcherKeyEvent,
  environment: QuickSwitcherKeyEnvironment = {},
): QuickSwitcherKeyOutcome {
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  const chord = (event.ctrlKey === true || event.metaKey === true) && event.altKey !== true && key === "k";
  const letter = key === "s" && event.ctrlKey !== true && event.metaKey !== true && event.altKey !== true;

  if (!chord && !letter) {
    // Name the near-miss so a host can tell "S with Ctrl held" (a different
    // command) apart from a key nobody bound.
    if (key === "s" || key === "k") return { open: false, reason: "modifier" };
    return { open: false, reason: "not-a-binding" };
  }
  if (event.defaultPrevented === true) return { open: false, reason: "default-prevented" };
  if (event.isComposing === true) return { open: false, reason: "composing" };
  if (event.repeat === true) return { open: false, reason: "repeat" };
  if (environment.open === true) return { open: false, reason: "already-open" };
  if (letter && isQuickSwitcherTypingTarget(event.target)) return { open: false, reason: "typing" };
  if (quickSwitcherLayerIsOpen(environment.root)) return { open: false, reason: "layer-open" };
  return { open: true, source: chord ? "chord" : "letter" };
}

/** The boolean form, for a host that does not care why it was refused. */
export function shouldOpenQuickSwitcher(
  event: QuickSwitcherKeyEvent,
  environment: QuickSwitcherKeyEnvironment = {},
): boolean {
  return quickSwitcherKeyDecision(event, environment).open;
}
