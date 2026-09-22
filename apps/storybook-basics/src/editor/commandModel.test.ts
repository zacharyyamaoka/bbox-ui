// src/editor/commandModel.test.ts — the matching rule and, mostly, the
// rule that decides whether a BARE LETTER may open the switcher.
//
// The filtering cases are ported from the donor's own suite
// (/home/bam/systemsketch/src/commands/commandModel.test.ts:18-40), which is
// an independent oracle in the sense that matters: it was written against the
// donor, before this repo existed, so it cannot have been shaped to whatever
// this port happens to do.
//
// The keyboard cases are NOT ported — the donor never needed them, because
// `Ctrl/Cmd+P` and `Ctrl/Cmd+K` cannot be mistaken for someone typing. A bare
// `S` can, in six different ways, and each of them gets a case here.
import { describe, expect, it } from "vitest";

import {
  filterQuickSwitcherItems,
  groupQuickSwitcherItems,
  isQuickSwitcherTypingTarget,
  quickSwitcherItemDisabled,
  quickSwitcherKeyDecision,
  quickSwitcherLayerIsOpen,
  shouldOpenQuickSwitcher,
  type QuickSwitcherItem,
} from "./commandModel";

const items: QuickSwitcherItem[] = [
  { id: "fit", label: "Zoom to fit", description: "Show the whole board", keywords: ["camera"], shortcut: "Shift+1", group: "Commands", run() {} },
  { id: "find", label: "Find and replace", description: "Search every page", keywords: ["text"], shortcut: "Ctrl+F", group: "Commands", run() {} },
  { id: "select", label: "Select all", description: "Select visible shapes", shortcut: "Ctrl+A", group: "Commands", run() {} },
];

describe("quick switcher matching", () => {
  it("filters across labels, descriptions, keywords, and shortcuts with stable relevance", () => {
    expect(filterQuickSwitcherItems(items, "").map((item) => item.id)).toEqual(["fit", "find", "select"]);
    expect(filterQuickSwitcherItems(items, "find").map((item) => item.id)).toEqual(["find"]);
    expect(filterQuickSwitcherItems(items, "whole board").map((item) => item.id)).toEqual(["fit"]);
    expect(filterQuickSwitcherItems(items, "camera").map((item) => item.id)).toEqual(["fit"]);
    expect(filterQuickSwitcherItems(items, "ctrl f").map((item) => item.id)).toEqual(["find"]);
  });

  it("ranks an exact label, then a prefix, then a word prefix, then anywhere", () => {
    const ranked: QuickSwitcherItem[] = [
      { id: "anywhere", label: "Deselect all", run() {} },
      { id: "word", label: "Close select panel", run() {} },
      { id: "prefix", label: "Select all", run() {} },
      { id: "exact", label: "select", run() {} },
    ];
    expect(filterQuickSwitcherItems(ranked, "select").map((item) => item.id)).toEqual([
      "exact",
      "prefix",
      "word",
      "anywhere",
    ]);
  });

  it("also matches a row's detail and its group heading", () => {
    const files: QuickSwitcherItem[] = [
      { id: "a", label: "Gripper", detail: "~/boards/arm.systemsketch", group: "Boards", run() {} },
      { id: "b", label: "Conveyor", detail: "~/scratch/belt.systemsketch", group: "Boards", run() {} },
    ];
    expect(filterQuickSwitcherItems(files, "scratch").map((item) => item.id)).toEqual(["b"]);
    expect(filterQuickSwitcherItems(files, "boards gripper").map((item) => item.id)).toEqual(["a"]);
  });

  it("supports static and lazily-read disabled states", () => {
    expect(quickSwitcherItemDisabled({ ...items[0], disabled: true })).toBe(true);
    expect(quickSwitcherItemDisabled({ ...items[0], disabled: false })).toBe(false);
    expect(quickSwitcherItemDisabled({ ...items[0] })).toBe(false);
    let live = false;
    const item = { ...items[0], disabled: () => live };
    expect(quickSwitcherItemDisabled(item)).toBe(false);
    live = true;
    expect(quickSwitcherItemDisabled(item)).toBe(true);
  });

  it("buckets by group in first-appearance order, ungrouped rows first", () => {
    const mixed: QuickSwitcherItem[] = [
      { id: "1", label: "Recent board", run() {} },
      { id: "2", label: "Gripper", group: "Boards", run() {} },
      { id: "3", label: "Zoom to fit", group: "Commands", run() {} },
      { id: "4", label: "Conveyor", group: "Boards", run() {} },
    ];
    expect(groupQuickSwitcherItems(mixed).map((bucket) => [bucket.group, bucket.items.map((item) => item.id)])).toEqual([
      [undefined, ["1"]],
      ["Boards", ["2", "4"]],
      ["Commands", ["3"]],
    ]);
  });
});

describe("what counts as typing", () => {
  it.each([
    ["an input", { tagName: "INPUT" }],
    ["a lowercase tagName", { tagName: "input" }],
    ["a textarea", { tagName: "TEXTAREA" }],
    ["a select", { tagName: "SELECT" }],
    ["a contenteditable (tldraw's shape text editor)", { tagName: "DIV", isContentEditable: true }],
    ["contentEditable as a string", { tagName: "DIV", contentEditable: "true" }],
    ["contentEditable plaintext-only", { tagName: "DIV", contentEditable: "plaintext-only" }],
    ["a read-only input, which still shows a caret", { tagName: "INPUT", readOnly: true }],
  ])("%s owns the keystroke", (_name, target) => {
    expect(isQuickSwitcherTypingTarget(target)).toBe(true);
  });

  it.each([
    ["the canvas", { tagName: "CANVAS" }],
    ["a button", { tagName: "BUTTON" }],
    ["a plain div", { tagName: "DIV", isContentEditable: false }],
    ["an explicitly non-editable div", { tagName: "DIV", contentEditable: "false" }],
    ["nothing at all", null],
    ["undefined", undefined],
    ["a string", "INPUT"],
  ])("%s does not", (_name, target) => {
    expect(isQuickSwitcherTypingTarget(target)).toBe(false);
  });
});

describe("what counts as an open layer", () => {
  const rootWith = (present: string[]) => ({
    querySelector(selectors: string) {
      return present.some((selector) => selectors.includes(selector)) ? {} : null;
    },
  });

  it.each([
    '[data-slot="dropdown-menu-content"]',
    '[data-slot="context-menu-content"]',
    '[data-slot="popover-content"]',
    '[data-slot="select-content"]',
    '[data-slot="dialog-content"]',
    '[role="menu"]',
    '[role="dialog"]',
  ])("%s means a layer is up", (selector) => {
    expect(quickSwitcherLayerIsOpen(rootWith([selector]))).toBe(true);
  });

  it("reads nothing as no layer, including a missing document", () => {
    expect(quickSwitcherLayerIsOpen(rootWith([]))).toBe(false);
    expect(quickSwitcherLayerIsOpen(null)).toBe(false);
    // No `root` and no ambient `document` (this suite runs in the node
    // project) must not throw and must not block the key.
    expect(quickSwitcherLayerIsOpen()).toBe(false);
  });

  it("does NOT treat an expanded collapsible or a static listbox as a layer", () => {
    // The regression this guards: `[data-open]` is on every Base UI popup,
    // but also on an expanded Collapsible panel, so including it would kill
    // the bare letter for anyone with a Members section unfolded.
    const openCollapsible = {
      querySelector(selectors: string) {
        return selectors.includes("[data-open]") || selectors.includes('[role="listbox"]') ? {} : null;
      },
    };
    expect(quickSwitcherLayerIsOpen(openCollapsible)).toBe(false);
  });

  it("ignores a popup that is mid-exit-transition, so S · Escape · S reopens", () => {
    // Base UI keeps a closing popup mounted and stamps `data-closed` on it.
    const closing = {
      querySelector(selectors: string) {
        return selectors.includes(":not([data-closed])") ? null : {};
      },
    };
    expect(quickSwitcherLayerIsOpen(closing)).toBe(false);
  });

  it("refuses rather than throws when a root rejects the selector", () => {
    expect(
      quickSwitcherLayerIsOpen({
        querySelector() {
          throw new SyntaxError("unsupported selector");
        },
      }),
    ).toBe(true);
  });
});

describe("the bare-letter rule", () => {
  const noLayer = { root: { querySelector: () => null } };

  it("opens on a bare S over the canvas", () => {
    expect(quickSwitcherKeyDecision({ key: "s", target: { tagName: "CANVAS" } }, noLayer)).toEqual({
      open: true,
      source: "letter",
      mode: "go-to",
    });
    expect(shouldOpenQuickSwitcher({ key: "s", target: { tagName: "CANVAS" } }, noLayer)).toBe(true);
  });

  it("accepts Shift+S, which arrives as an uppercase key", () => {
    expect(quickSwitcherKeyDecision({ key: "S", shiftKey: true }, noLayer)).toEqual({
      open: true,
      source: "letter",
      mode: "go-to",
    });
  });

  it.each([
    ["ctrl", { key: "s", ctrlKey: true }],
    ["cmd", { key: "s", metaKey: true }],
    ["alt", { key: "s", altKey: true }],
  ])("refuses a bare S with %s held — that is a different command", (_name, event) => {
    expect(quickSwitcherKeyDecision(event, noLayer)).toEqual({ open: false, reason: "modifier" });
  });

  it.each([
    ["an input", { tagName: "INPUT" }],
    ["a textarea", { tagName: "TEXTAREA" }],
    ["tldraw's shape text editor", { tagName: "DIV", isContentEditable: true }],
    ["the chrome bar's rename field", { tagName: "INPUT", "data-testid": "chrome-bar-title-input" }],
  ])("refuses a bare S while %s has focus", (_name, target) => {
    expect(quickSwitcherKeyDecision({ key: "s", target }, noLayer)).toEqual({ open: false, reason: "typing" });
  });

  it("refuses a bare S while a menu, dialog or popover is already open", () => {
    const burgerOpen = { root: { querySelector: () => ({}) } };
    expect(quickSwitcherKeyDecision({ key: "s", target: { tagName: "CANVAS" } }, burgerOpen)).toEqual({
      open: false,
      reason: "layer-open",
    });
  });

  it("refuses when the switcher itself is already open", () => {
    expect(quickSwitcherKeyDecision({ key: "s" }, { ...noLayer, open: true })).toEqual({
      open: false,
      reason: "already-open",
    });
  });

  it("refuses an autorepeat, so holding S does not reopen it every tick", () => {
    expect(quickSwitcherKeyDecision({ key: "s", repeat: true }, noLayer)).toEqual({ open: false, reason: "repeat" });
  });

  it("refuses mid-IME-composition", () => {
    expect(quickSwitcherKeyDecision({ key: "s", isComposing: true }, noLayer)).toEqual({
      open: false,
      reason: "composing",
    });
  });

  it("refuses an event a nearer handler already claimed", () => {
    expect(quickSwitcherKeyDecision({ key: "s", defaultPrevented: true }, noLayer)).toEqual({
      open: false,
      reason: "default-prevented",
    });
  });

  it.each(["a", "e", "f", "g", "h", "k", "l", "n", "q", "t", "v"])(
    "leaves tldraw's own single-letter binding %s alone",
    (key) => {
      expect(quickSwitcherKeyDecision({ key }, noLayer).open).toBe(false);
    },
  );
});

describe("the chord", () => {
  const noLayer = { root: { querySelector: () => null } };

  it.each([
    ["ctrl", { key: "k", ctrlKey: true }],
    ["cmd", { key: "k", metaKey: true }],
  ])("opens on %s+K", (_name, event) => {
    expect(quickSwitcherKeyDecision(event, noLayer)).toEqual({ open: true, source: "chord", mode: "go-to" });
  });

  it("opens on Ctrl+K even from inside a text field — it is not a character", () => {
    // Donor behaviour: SystemSketchChrome.tsx:1039-1043 guards on modifiers
    // only and never looks at the target. It is why VS Code's palette opens
    // from inside the editor.
    expect(
      quickSwitcherKeyDecision({ key: "k", ctrlKey: true, target: { tagName: "INPUT" } }, noLayer),
    ).toEqual({ open: true, source: "chord", mode: "go-to" });
  });

  it("refuses Ctrl+Alt+K, which is somebody else's chord", () => {
    expect(quickSwitcherKeyDecision({ key: "k", ctrlKey: true, altKey: true }, noLayer)).toEqual({
      open: false,
      reason: "modifier",
    });
  });

  it("refuses a bare K — that is tldraw's laser tool", () => {
    expect(quickSwitcherKeyDecision({ key: "k" }, noLayer)).toEqual({ open: false, reason: "modifier" });
  });

  /* ---------------------------------------------------------------- */
  /* Ctrl/Cmd+F — the same surface, opened on Find (parity item P-024)  */
  /* ---------------------------------------------------------------- */

  it.each([
    ["ctrl", { key: "f", ctrlKey: true }],
    ["cmd", { key: "f", metaKey: true }],
  ])("opens on %s+F, and asks for the FIND half", (_name, event) => {
    expect(quickSwitcherKeyDecision(event, noLayer)).toEqual({ open: true, source: "chord", mode: "find" });
  });

  it("opens Find from inside a text field — Ctrl+F is not a character either", () => {
    expect(
      quickSwitcherKeyDecision({ key: "f", ctrlKey: true, target: { tagName: "INPUT" } }, noLayer),
    ).toEqual({ open: true, source: "chord", mode: "find" });
  });

  it("refuses a BARE f — that is tldraw's frame tool — and names it a near-miss", () => {
    expect(quickSwitcherKeyDecision({ key: "f" }, noLayer)).toEqual({ open: false, reason: "modifier" });
  });

  it("refuses Ctrl+Alt+F, which is somebody else's chord", () => {
    expect(quickSwitcherKeyDecision({ key: "f", ctrlKey: true, altKey: true }, noLayer)).toEqual({
      open: false,
      reason: "modifier",
    });
  });

  it("obeys the same guards as every other binding", () => {
    expect(quickSwitcherKeyDecision({ key: "f", ctrlKey: true, repeat: true }, noLayer)).toEqual({
      open: false,
      reason: "repeat",
    });
    expect(quickSwitcherKeyDecision({ key: "f", ctrlKey: true }, { ...noLayer, open: true })).toEqual({
      open: false,
      reason: "already-open",
    });
    expect(
      quickSwitcherKeyDecision({ key: "f", ctrlKey: true }, { root: { querySelector: () => ({}) } }),
    ).toEqual({ open: false, reason: "layer-open" });
  });

  it("names an unbound key as such rather than as a modifier miss", () => {
    expect(quickSwitcherKeyDecision({ key: "z", ctrlKey: true }, noLayer)).toEqual({
      open: false,
      reason: "not-a-binding",
    });
    expect(quickSwitcherKeyDecision({ key: "" }, noLayer)).toEqual({ open: false, reason: "not-a-binding" });
  });
});
