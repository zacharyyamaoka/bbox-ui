#!/usr/bin/env node
/**
 * Drive the AutocompleteMenu story (apps/storybook) in headless Chrome over
 * raw CDP, with REAL key events — the same keydown/keypress/input sequence a
 * keyboard produces, never a synthetic `dispatchEvent` and never a call into
 * CodeMirror. Each story arg is switched through Storybook's own URL
 * (`iframe.html?id=…&args=anchor:cursor;atEnds:caret`).
 *
 * The journey proves the menu's contract:
 *
 *   1. anchor — `cursor` slides right with every letter (and survives a
 *      Backspace), `word` stays at the word's start, `field` sits at the
 *      line's start;
 *   2. ↑/↓ — `wrap` wraps at both ends; `caret` closes on the last item and
 *      moves the caret to the next line (and up from the first);
 *      PageDown/PageUp clamp;
 *   3. Ctrl+Space twice widens, a third time narrows, the footer follows;
 *   4. Enter eats only a matching suffix (Ty|pe → Type, Pos|xx → Posexx),
 *      Tab replaces the whole identifier (Pos|xx → Pose);
 *   5. zero matches while typing → closed; explicit Ctrl+Space → the muted
 *      "No matches" row + footer; Esc closes; a click on a row accepts;
 *   6. the footer is never selected; the popup flips above near the
 *      viewport bottom and stays there; no page errors.
 *
 * Screenshots (light and dark) land in reports/media/autocomplete-menu-impl/.
 *
 * Usage: node demos/drive-autocomplete-menu.mjs [storybook-url]
 *        (default http://127.0.0.1:5436)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const origin = process.argv[2] ?? "http://127.0.0.1:5436";
const storyUrl = (args) =>
  `${origin}/iframe.html?id=components-autocompletemenu--playground&viewMode=story${args ? `&args=${args}` : ""}`;

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "..", "reports", "media", "autocomplete-menu-impl");
mkdirSync(shotDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1400,900",
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const wsUrl = await new Promise((resolve, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("chrome did not start")), 15000);
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk;
    const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
});

const browser = new WebSocket(wsUrl);
await new Promise((resolve) => (browser.onopen = resolve));

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
let sessionId = null;

browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    );
  }
  if (
    message.method === "Runtime.consoleAPICalled" &&
    message.params.type === "error"
  ) {
    consoleErrors.push(
      message.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
    );
  }
};

function send(method, params = {}, useSession = true) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const payload = { id, method, params };
    if (useSession && sessionId) payload.sessionId = sessionId;
    browser.send(JSON.stringify(payload));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));

await send("Runtime.enable");
await send("Page.enable");
// Headless Chrome inherits the host's colour-scheme preference; pin light
// so the "light-*" captures really are light (dark is pinned in step 8).
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });

async function evaluate(expression) {
  // Serialize in-page: the wire always carries one plain string, so a result
  // that happens to reference DOM/editor internals can never trip CDP's
  // returnByValue serializer ("Object reference chain is too long").
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression: `JSON.stringify((() => (${expression}))() ?? null)`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return JSON.parse(result.value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(`!!(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// Real pointer gestures — the same events a person's mouse produces.
async function click(x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
  });
  await sleep(200);
}

const KEYS = {
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  PageDown: { code: "PageDown", keyCode: 34 },
  PageUp: { code: "PageUp", keyCode: 33 },
  Home: { code: "Home", keyCode: 36 },
  End: { code: "End", keyCode: 35 },
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Tab: { code: "Tab", keyCode: 9 },
  Escape: { code: "Escape", keyCode: 27 },
  Backspace: { code: "Backspace", keyCode: 8 },
  " ": { code: "Space", keyCode: 32 },
};

/** A real key press. `ctrl` sends no text, exactly like a keyboard chord. */
async function press(key, { ctrl = false } = {}) {
  const spec = KEYS[key];
  const modifiers = ctrl ? 2 : 0;
  const text = ctrl ? undefined : spec.text;
  await send("Input.dispatchKeyEvent", {
    type: text ? "keyDown" : "rawKeyDown",
    key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, modifiers,
    ...(text ? { text, unmodifiedText: text } : {}),
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, modifiers,
  });
  await sleep(ctrl && key === " " ? 250 : 120);
}

/** Types printable text one real key at a time. */
async function type(text) {
  for (const char of text) {
    const upper = char.toUpperCase();
    const code = /[a-z]/i.test(char) ? `Key${upper}` : char === " " ? "Space" : "";
    const keyCode = /[a-z0-9 ]/i.test(char) ? upper.charCodeAt(0) : 0;
    await send("Input.dispatchKeyEvent", {
      type: "keyDown", key: char, code, text: char, unmodifiedText: char, windowsVirtualKeyCode: keyCode,
    });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: char, code, windowsVirtualKeyCode: keyCode });
    await sleep(60);
  }
  // Past CodeMirror's 100 ms activate-on-typing debounce and its 75 ms
  // "just opened" interaction delay, plus a measure frame.
  await sleep(260);
}

async function screenshot(name) {
  const clip = await evaluate(`(() => {
    const root = document.querySelector('[data-testid="autocomplete-instructions"]').parentElement.getBoundingClientRect();
    const tip = document.querySelector('.cm-tooltip-autocomplete');
    const r = tip && tip.style.top !== '-10000px' ? tip.getBoundingClientRect() : root;
    const x = Math.max(0, Math.min(root.left, r.left) - 12);
    const y = Math.max(0, Math.min(root.top, r.top) - 12);
    const right = Math.max(root.right, r.right) + 12;
    const bottom = Math.max(root.top + 330, r.bottom) + 12;
    return { x, y, width: right - x, height: bottom - y, scale: 1 };
  })()`);
  const { data } = await send("Page.captureScreenshot", { format: "png", clip });
  const shotPath = path.join(shotDir, name);
  writeFileSync(shotPath, Buffer.from(data, "base64"));
  return shotPath;
}

const failures = [];
const results = [];
function assert(condition, label, detail = "") {
  results.push({ ok: !!condition, label, detail });
  if (condition) {
    console.log(`  ok: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const LANE = '[data-testid="autocomplete-multiline"]';
const SINGLE = '[data-testid="autocomplete-single"]';

/** Everything the assertions read, in one round trip. */
const menu = () =>
  evaluate(`(() => {
    const tip = document.querySelector('.cm-tooltip-autocomplete');
    if (!tip || tip.style.top === '-10000px') return { open: false };
    const items = [...tip.querySelectorAll(':scope > ul > li')];
    const selected = items.findIndex((li) => li.hasAttribute('aria-selected'));
    const footer = tip.querySelector('.bbox-completion-menu__footer');
    const content = document.activeElement?.closest('.cm-content') ?? document.activeElement;
    return {
      open: true,
      labels: items.map((li) => li.querySelector('.cm-completionLabel')?.textContent ?? ''),
      selected,
      selectedIsListOption: [...document.querySelectorAll('[aria-selected]')].every((el) => el.tagName === 'LI' && el.parentElement.getAttribute('role') === 'listbox'),
      selectedCount: document.querySelectorAll('.cm-tooltip-autocomplete [aria-selected]').length,
      activeDescendantMatches: !!items[selected] && content?.getAttribute?.('aria-activedescendant') === items[selected].id,
      footer: footer ? footer.textContent : null,
      footerSelected: footer ? footer.hasAttribute('aria-selected') || footer.matches('[aria-selected] *') : false,
      footerLast: footer ? tip.lastElementChild === footer : null,
      // offsetHeight, not the \`hidden\` property: a display rule can override [hidden].
      footerHeight: footer ? footer.offsetHeight : 0,
      anySelected: tip.querySelectorAll('[aria-selected]').length,
      activeDescendant: content?.getAttribute?.('aria-activedescendant') ?? null,
      expanded: content?.getAttribute?.('aria-expanded') ?? null,
      left: tip.getBoundingClientRect().left,
      top: tip.getBoundingClientRect().top,
      width: tip.getBoundingClientRect().width,
      side: tip.classList.contains('cm-tooltip-above') ? 'above' : 'below',
      emptyRow: items.length === 1 && items[0].classList.contains('bbox-completion-menu__empty'),
    };
  })()`);

const lines = (field) =>
  evaluate(`[...document.querySelectorAll('${field} .cm-line')].map((line) => line.textContent)`);

/** Screen x of column `col` on line `index` of `field` (a real text Range). */
const columnX = (field, index, col) =>
  evaluate(`(() => {
    const line = document.querySelectorAll('${field} .cm-line')[${index}];
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let offset = ${col}, node;
    while ((node = walker.nextNode())) {
      if (offset <= node.length) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, Math.min(node.length, offset + 1));
        return range.getBoundingClientRect().left;
      }
      offset -= node.length;
    }
    return line.getBoundingClientRect().left;
  })()`);

// CodeField draws the NATIVE caret (no drawSelection), so the caret is the
// collapsed DOM selection itself.
const caretX = () =>
  evaluate(`(() => { const s = getSelection(); return s.rangeCount ? s.getRangeAt(0).getBoundingClientRect().left : null; })()`);

/** Esc only when the menu is up: a bare Esc on a closed menu is CodeField's own exit (it leaves the field). */
async function closeMenu() {
  if ((await menu()).open) await press("Escape");
}

async function openStory(args) {
  await send("Page.navigate", { url: storyUrl(args) });
  await waitFor(`document.querySelector('${LANE} .cm-content') && document.querySelector('${SINGLE} .cm-content')`, `story (${args})`);
  await sleep(400);
}

/** Focus the lane and put the caret at the end of the document (the empty last line). */
async function focusLaneEnd() {
  const box = await evaluate(`(() => { const r = document.querySelector('${LANE} .cm-content').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 8 }; })()`);
  await click(box.x, box.y);
  await press("End", { ctrl: true });
}

// ---------------------------------------------------------------------------
// 1. Anchor: cursor / word / field.
// ---------------------------------------------------------------------------
for (const anchor of ["cursor", "word", "field"]) {
  console.log(`anchor: ${anchor}`);
  await openStory(`anchor:${anchor}`);
  await focusLaneEnd();
  await type("x = p");
  const first = await menu();
  await type("r");
  const second = await menu();
  await type("i");
  const third = await menu();
  const lineIndex = (await lines(LANE)).length - 1;
  const lineLeft = await columnX(LANE, lineIndex, 0);
  const wordLeft = await columnX(LANE, lineIndex, 4);
  const caret = await caretX();
  assert(first.open && second.open && third.open, `[${anchor}] typing 'x = p', 'r', 'i' keeps the menu open`,
    `labels after 'pri': ${JSON.stringify(third.labels)}`);
  const lefts = `lefts ${first.left?.toFixed(1)} → ${second.left?.toFixed(1)} → ${third.left?.toFixed(1)}`;
  if (anchor === "cursor") {
    assert(second.left > first.left + 3 && third.left > second.left + 3, "[cursor] left edge moves right with every letter", lefts);
    assert(Math.abs(third.left - caret) <= 2, "[cursor] left edge sits at the caret", `tooltip ${third.left.toFixed(1)} vs caret ${caret?.toFixed(1)}`);
    await press("Backspace");
    await sleep(150);
    const afterBackspace = await menu();
    assert(afterBackspace.open && afterBackspace.left < third.left - 3,
      "[cursor] Backspace keeps the menu open and it slides back left",
      `open=${afterBackspace.open} left ${afterBackspace.left?.toFixed(1)}`);
  } else if (anchor === "word") {
    assert(Math.abs(first.left - second.left) <= 1 && Math.abs(second.left - third.left) <= 1, "[word] left edge stays put while typing", lefts);
    assert(Math.abs(third.left - wordLeft) <= 2, "[word] left edge sits at the word's start", `tooltip ${third.left.toFixed(1)} vs word start ${wordLeft.toFixed(1)}`);
  } else {
    assert(Math.abs(first.left - second.left) <= 1 && Math.abs(second.left - third.left) <= 1, "[field] left edge stays put while typing", lefts);
    assert(Math.abs(third.left - lineLeft) <= 2, "[field] left edge sits at the line's start", `tooltip ${third.left.toFixed(1)} vs line start ${lineLeft.toFixed(1)}`);
  }
  assert(third.side === "below", `[${anchor}] prefers below`, third.side);
  await screenshot(`anchor-${anchor}.png`);
  await press("Escape");
}

// ---------------------------------------------------------------------------
// 2. ↑/↓ in wrap mode, the footer never selected, PageDown/PageUp clamp.
// ---------------------------------------------------------------------------
console.log("atEnds: wrap");
await openStory("anchor:word;atEnds:wrap");
await focusLaneEnd();
await type("pri");
let state = await menu();
assert(state.open, "typing 'pri' opens the menu", JSON.stringify(state.labels));
assert(JSON.stringify(state.labels) === JSON.stringify(["print", "print_exception"]), "'pri' lists print, print_exception", JSON.stringify(state.labels));
assert(state.selected === 0, "the first item is selected on open", `sel=${state.selected}`);
await screenshot("light-pri.png");
const walk = [];
for (const key of ["ArrowDown", "ArrowDown", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowDown"]) {
  await press(key);
  state = await menu();
  walk.push(state.selected);
  if (!state.selectedIsListOption || state.selectedCount !== 1 || state.footerSelected || !state.activeDescendantMatches) {
    assert(false, `after ${key}: exactly one selected row, a list option, never the footer`, JSON.stringify(state));
  }
}
assert(JSON.stringify(walk) === JSON.stringify([1, 0, 1, 0, 1, 0]), "[wrap] ↓ past the last wraps to the first, ↑ past the first wraps to the last",
  `selection walk ${JSON.stringify(walk)}`);
assert(state.footer?.includes("every type on this board") && state.footerLast, "the footer strip sits last, outside the list", state.footer ?? "no footer");
assert(!state.footerSelected, "↓ never lands on the footer");
await press("Escape");
assert(!(await menu()).open, "Esc closes the menu");

// PageDown / PageUp on the full list (explicit open on an empty word).
await press("Enter");
await press(" ", { ctrl: true });
state = await menu();
const total = state.labels?.length ?? 0;
assert(state.open && total >= 20, "Ctrl+Space on an empty word opens the full list", `${total} items`);
await press("PageDown");
const afterOnePage = (await menu()).selected;
await press("PageDown");
await press("PageDown");
await press("PageDown");
const afterFourPages = (await menu()).selected;
await press("PageUp");
const afterPageUp = (await menu()).selected;
assert(afterOnePage === 9, "PageDown moves by visible rows − 1 (10 rows → 9)", `sel=${afterOnePage}`);
assert(afterFourPages === total - 1, "PageDown clamps at the last item (no wrap)", `sel=${afterFourPages} of ${total}`);
assert(afterPageUp === total - 10, "PageUp moves back one page", `sel=${afterPageUp}`);
await press("Escape");

// ---------------------------------------------------------------------------
// 3. Ctrl+Space twice widens, again narrows.
// ---------------------------------------------------------------------------
await type("Ty");
const narrow = await menu();
await press(" ", { ctrl: true });
const widened = await menu();
await screenshot("light-widened.png");
await press(" ", { ctrl: true });
const narrowAgain = await menu();
assert(narrow.open && narrow.labels.length === 3, "'Ty' → likely matches only", JSON.stringify(narrow.labels));
assert(widened.open && widened.labels.length === total && widened.footer.includes("back to likely matches"),
  "Ctrl+Space while open → every item, footer says 'back to likely matches'", `${widened.labels?.length} items, footer "${widened.footer}"`);
assert(narrowAgain.open && JSON.stringify(narrowAgain.labels) === JSON.stringify(narrow.labels) && narrowAgain.footer.includes("every type on this board"),
  "Ctrl+Space again → back to likely matches", `${narrowAgain.labels?.length} items, footer "${narrowAgain.footer}"`);
await press("Escape");

// ---------------------------------------------------------------------------
// 4. Enter vs Tab replacement.
// ---------------------------------------------------------------------------
async function acceptInside(word, caretBack, key) {
  await press("End");
  await press("Enter");
  await type(word);
  await closeMenu();
  for (let i = 0; i < caretBack; i += 1) await press("ArrowLeft");
  await press(" ", { ctrl: true });
  const opened = await menu();
  await press(key);
  const all = await lines(LANE);
  return { opened, line: all[all.length - 1] ?? "", closed: !(await menu()).open, all };
}
let accepted = await acceptInside("Type", 2, "Enter");
assert(accepted.opened.labels?.[0] === "Type" && accepted.line === "Type" && accepted.closed,
  "Enter on Ty|pe → 'Type', not 'Typepe'", `line "${accepted.line}"`);
accepted = await acceptInside("Posxx", 2, "Enter");
assert(accepted.opened.labels?.[0] === "Pose" && accepted.line === "Posexx", "Enter on Pos|xx → 'Posexx' (unrelated suffix kept)", `line "${accepted.line}"`);
accepted = await acceptInside("Posxx", 2, "Tab");
assert(accepted.line === "Pose" && accepted.closed, "Tab on Pos|xx → 'Pose' (whole identifier replaced)", `line "${accepted.line}"`);
assert(await evaluate(`!!document.activeElement?.closest('${LANE}')`), "Tab kept focus in the field");

let all;
// ---------------------------------------------------------------------------
// 5. Zero matches, the No-matches row, click-to-accept.
// ---------------------------------------------------------------------------
await press("End");
await press("Enter");
await type("Zq");
assert(!(await menu()).open, "zero matches while typing → closed");
await press(" ", { ctrl: true });
state = await menu();
assert(state.open && state.emptyRow && state.labels[0] === "No matches for “Zq”" && state.footer?.includes("every type on this board"),
  "explicit Ctrl+Space with zero matches → a 'No matches for “Zq”' row + footer", `${JSON.stringify(state.labels)} footer "${state.footer}"`);
await screenshot("light-no-match.png");
await press("ArrowDown");
state = await menu();
assert(state.open && state.emptyRow && !state.footerSelected, "↓ on the No-matches row selects nothing new (footer untouched)");
const emptyRow = await evaluate(`(() => { const r = document.querySelector('.cm-tooltip-autocomplete > ul > li').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await click(emptyRow.x, emptyRow.y);
all = await lines(LANE);
state = await menu();
assert(state.open && state.emptyRow && all[all.length - 1] === "Zq", "a click on the No-matches row does nothing (not selectable, inserts nothing)", `line "${all[all.length - 1]}"`);
await press("Escape");
assert(!(await menu()).open, "Esc closes the No-matches row");

await press("End");
await press("Enter");
await type("Pos");
state = await menu();
const rowCenter = await evaluate(`(() => {
  const li = document.querySelectorAll('.cm-tooltip-autocomplete > ul > li')[2];
  const r = li.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: li.querySelector('.cm-completionLabel').textContent };
})()`);
await screenshot("light-deprecated.png");
await click(rowCenter.x, rowCenter.y);
all = await lines(LANE);
assert(all[all.length - 1] === rowCenter.label && !(await menu()).open, "a click on the 3rd row accepts it", `clicked "${rowCenter.label}", line "${all[all.length - 1]}"`);

// ---------------------------------------------------------------------------
// 6. atEnds: caret.
// ---------------------------------------------------------------------------
console.log("atEnds: caret");
await openStory("anchor:word;atEnds:caret");
const box = await evaluate(`(() => { const r = document.querySelector('${LANE} .cm-content').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 8 }; })()`);
await click(box.x, box.y);
await press("Home", { ctrl: true });
await press("End");
await press("Enter");
await type("pri");
state = await menu();
assert(state.open && state.selected === 0, "[caret] 'pri' opens on the first item", JSON.stringify(state.labels));
await press("ArrowDown");
assert((await menu()).selected === 1, "[caret] ↓ inside the list moves one row");
await press("ArrowDown");
const closedDown = !(await menu()).open;
await type("@");
all = await lines(LANE);
assert(closedDown && all[1] === "pri" && all[2].includes("@"),
  "[caret] ↓ on the last item closes the menu and moves the caret to the next line", `closed=${closedDown} lines[1..2]=${JSON.stringify(all.slice(1, 3))}`);
await press("Backspace");
await press("ArrowUp");
await press("End");
await type("n");
state = await menu();
assert(state.open && state.selected === 0, "[caret] 'prin' reopens on the first item", JSON.stringify(state.labels));
await press("ArrowUp");
const closedUp = !(await menu()).open;
await type("@");
all = await lines(LANE);
assert(closedUp && all[1] === "prin" && all[0].includes("@"),
  "[caret] ↑ on the first item closes the menu and moves the caret up a line", `closed=${closedUp} lines[0..1]=${JSON.stringify(all.slice(0, 2))}`);

// Single-line field: one item, Enter accepts without leaving the field.
const single = await evaluate(`(() => { const r = document.querySelector('${SINGLE} .cm-content').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
await click(single.x, single.y);
await press("End");
await press(" ", { ctrl: true });
state = await menu();
assert(state.open && JSON.stringify(state.labels) === JSON.stringify(["Frame"]), "single-line: Ctrl+Space after 'Fr' offers Frame", JSON.stringify(state.labels));
await press("Enter");
const singleText = (await lines(SINGLE))[0];
assert(singleText === "frame: Frame" && (await evaluate(`!!document.activeElement?.closest('${SINGLE}')`)),
  "single-line: Enter accepts and stays in the field", `"${singleText}"`);

// ---------------------------------------------------------------------------
// 7. Flip above near the viewport bottom, and stay there.
// ---------------------------------------------------------------------------
console.log("flip");
await openStory("anchor:cursor;atEnds:wrap");
await focusLaneEnd();
// Shrink the viewport to end just under the caret's line: no room below,
// more room above — CodeMirror's own flip rule, reached through the menu's
// `getCoords` anchor hook.
const lastLineBottom = await evaluate(`[...document.querySelectorAll('${LANE} .cm-line')].at(-1).getBoundingClientRect().bottom`);
await send("Emulation.setDeviceMetricsOverride", {
  width: 1400, height: Math.round(lastLineBottom + 48), deviceScaleFactor: 1, mobile: false,
});
await sleep(300);
await type("p");
const flipped = await menu();
await type("ri");
const stillFlipped = await menu();
assert(flipped.open && flipped.side === "above", "near the viewport bottom → flips above", flipped.side);
assert(stillFlipped.open && stillFlipped.side === "above" && stillFlipped.labels.length < flipped.labels.length,
  "stays above while the list shrinks", `${stillFlipped.side}, ${flipped.labels?.length} → ${stillFlipped.labels?.length} items`);
const gap = await evaluate(`(() => {
  const tip = document.querySelector('.cm-tooltip-autocomplete');
  const card = [...tip.children].filter((el) => getComputedStyle(el).pointerEvents !== 'none');
  const cardBottom = Math.max(...card.map((el) => el.getBoundingClientRect().bottom));
  const lineTop = [...document.querySelectorAll('${LANE} .cm-line')].at(-1).getBoundingClientRect().top;
  return lineTop - cardBottom;
})()`);
assert(Math.abs(gap) <= 6, "the shrunken card still hugs the caret line (no stale-height gap)", `gap ${gap.toFixed(1)}px`);
const { data: flippedShot } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(shotDir, "light-flipped.png"), Buffer.from(flippedShot, "base64"));
await press("Escape");
await send("Emulation.clearDeviceMetricsOverride");

// ---------------------------------------------------------------------------
// 9. The judge's four findings (+ aria-expanded) — each written to fail on
//    e96f031 and pass after the fix.
// ---------------------------------------------------------------------------
console.log("judge findings");
await openStory("anchor:word;atEnds:wrap");
await focusLaneEnd();
const expandedOf = (field) => evaluate(`document.querySelector('${field} .cm-content').getAttribute('aria-expanded')`);

// Finding 1 — widened must reset when the menu closes for ANY reason.
await type("pri");
await press(" ", { ctrl: true });
state = await menu();
assert(state.open && state.labels.length === total, "[F1] Ctrl+Space while open on 'pri' widens", `${state.labels?.length} items`);
const instructions = await evaluate(`(() => { const r = document.querySelector('[data-testid="autocomplete-instructions"]').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
await click(instructions.x, instructions.y);
await sleep(150);
const blurred = !(await menu()).open && !(await evaluate(`!!document.activeElement?.closest('${LANE}')`));
const lastLine = await evaluate(`(() => { const r = [...document.querySelectorAll('${LANE} .cm-line')].at(-1).getBoundingClientRect(); return { x: r.right - 4, y: r.top + r.height / 2 }; })()`);
await click(lastLine.x, lastLine.y);
await type("n");
state = await menu();
assert(blurred && state.open && JSON.stringify(state.labels) === JSON.stringify(["print", "print_exception"]) && state.footer?.includes("every type on this board"),
  "[F1] blur-close, refocus the same word, type → the list is narrow again", `blurred=${blurred} ${JSON.stringify(state.labels)} footer "${state.footer}"`);
await press(" ", { ctrl: true });
const rewidened = (await menu()).labels?.length;
await press("ArrowLeft");
const closedByCaret = !(await menu()).open;
await press("ArrowRight");
await type("t");
state = await menu();
assert(rewidened === total && closedByCaret && JSON.stringify(state.labels) === JSON.stringify(["print", "print_exception"]),
  "[F1] caret leaving the word closes, and the next letter reopens narrow", `widened ${rewidened}, closed=${closedByCaret}, then ${JSON.stringify(state.labels)}`);
await closeMenu();

// Finding 2 — on an empty word the second Ctrl+Space is a no-op and the footer is gone.
await press("End");
await press("Enter");
await press(" ", { ctrl: true });
const emptyFirst = await menu();
await press(" ", { ctrl: true });
const emptySecond = await menu();
await screenshot("light-empty-word.png");
assert(emptyFirst.open && emptyFirst.labels.length === total && emptyFirst.footerHeight === 0,
  "[F2] Ctrl+Space on an empty word lists everything, footer not on screen", `${emptyFirst.labels?.length} items, footer ${emptyFirst.footerHeight}px`);
assert(emptySecond.open && emptySecond.labels.length === total && emptySecond.footerHeight === 0,
  "[F2] a second Ctrl+Space on the empty word changes nothing", `${emptySecond.labels?.length} items, footer ${emptySecond.footerHeight}px "${emptySecond.footer}"`);
await type("p");
state = await menu();
assert(state.open && state.labels.length < total && state.footerHeight > 0 && state.footer?.includes("every type on this board"),
  "[F2] typing a letter after it gives the narrow list, footer back", `${state.labels?.length} items, footer ${state.footerHeight}px "${state.footer}"`);
await closeMenu();

// Finding 3 — the No-matches row is never the selected option.
await press("End");
await press("Enter");
await type("Zq");
await press(" ", { ctrl: true });
const noMatchOpen = await menu();
const noMatchLabel = noMatchOpen.labels?.[0];
const clean = (m) => m.open && m.emptyRow && m.anySelected === 0 && !m.activeDescendant;
const afterDown = (await press("ArrowDown"), await menu());
const afterUp = (await press("ArrowUp"), await menu());
assert(clean(noMatchOpen) && clean(afterDown) && clean(afterUp),
  "[F3] the No-matches row carries no aria-selected / activedescendant, before or after ↑/↓",
  JSON.stringify([noMatchOpen, afterDown, afterUp].map((m) => ({ sel: m.anySelected, ad: m.activeDescendant }))));
const linesBefore = await lines(LANE);
await press("Enter");
const afterEnter = await menu();
const linesAfterEnter = await lines(LANE);
// Enter closed the menu, so re-open it before testing Tab — otherwise Tab is
// an ordinary Tab and moves focus out of the editor, which is not what this
// assertion is about.
await press(" ", { ctrl: true });
await press("Tab");
const afterTab = await menu();
const linesAfterTab = await lines(LANE);
assert(!afterEnter.open && !afterTab.open
  && JSON.stringify(linesAfterEnter) === JSON.stringify(linesBefore) && JSON.stringify(linesAfterTab) === JSON.stringify(linesBefore)
  && (await evaluate(`!!document.activeElement?.closest('${LANE}')`)),
  "[F3] Enter and Tab on the No-matches row insert nothing and close the menu (never a dead key)",
  `label "${noMatchLabel}", open after Enter=${afterEnter.open} Tab=${afterTab.open}, last line "${linesAfterTab.at(-1)}"`);
await closeMenu();

// Finding 4 — ↓ on a CLOSED single-line field opens the list; a lane keeps ↓ for the caret.
const singleBox = await evaluate(`(() => { const r = document.querySelector('${SINGLE} .cm-content').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
await click(singleBox.x, singleBox.y);
await press("End");
const singleClosedExpanded = await expandedOf(SINGLE);
await press("ArrowDown");
state = await menu();
assert(state.open && JSON.stringify(state.labels) === JSON.stringify(["Frame"]),
  "[F4] ↓ in a closed single-line field opens the list", JSON.stringify(state.labels));
assert(singleClosedExpanded === "false" && (await expandedOf(SINGLE)) === "true",
  "[aria] aria-expanded on the field: false closed, true open", `${singleClosedExpanded} → ${await expandedOf(SINGLE)}`);
await press("Escape");
assert((await expandedOf(SINGLE)) === "false", "[aria] aria-expanded back to false after Esc", String(await expandedOf(SINGLE)));
await click(lastLine.x - 200, lastLine.y);
await press("Home", { ctrl: true });
await press("ArrowDown");
const laneAfterDown = await menu();
await type("@");
const laneLines = await lines(LANE);
assert(!laneAfterDown.open && laneLines[1].startsWith("@"), "[F4] ↓ in a closed multi-line lane still moves the caret (nothing opens)",
  `open=${laneAfterDown.open} line 2 "${laneLines[1]}"`);

// ---------------------------------------------------------------------------
// 8. Dark mode captures.
// ---------------------------------------------------------------------------
console.log("dark");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await openStory("anchor:word;atEnds:wrap");
await focusLaneEnd();
await type("Pos");
await screenshot("dark-deprecated.png");
await press(" ", { ctrl: true });
await screenshot("dark-widened.png");
await press("Escape");
await press("Enter");
await type("Zq");
await press(" ", { ctrl: true });
await screenshot("dark-no-match.png");
await press("Escape");
await press("Enter");
await press(" ", { ctrl: true });
await screenshot("dark-empty-word.png");
await press("Escape");
await type("pri");
const darkPri = await menu();
assert(darkPri.open && darkPri.width >= 359 && darkPri.width <= 461, "menu width stays within 360–460px", `${darkPri.width}px`);
await screenshot("dark-pri.png");

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

assert(consoleErrors.length === 0, "no page errors", consoleErrors.join(" | "));
writeFileSync(path.join(shotDir, "results.json"), JSON.stringify({ origin, results, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL autocomplete-menu: ${failures.length} of ${results.length} — ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`PASS autocomplete-menu: ${results.length} assertions`);
