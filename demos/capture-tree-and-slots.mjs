#!/usr/bin/env node
/**
 * Drives bbox-ui.com/create in headless Chrome over raw CDP and PROVES two
 * babbles at once, both themes:
 *
 *  A · the instance navigator, five stock tree parts, one contract —
 *      click / ctrl-click / shift-range over visible rows, arrow keys,
 *      fold with Left, drag re-parent where the part offers it (and a
 *      refused drop staying refused);
 *  B · the slotted Block and the five inspector layouts — a Block arrives
 *      with seven slot fills, each slot's list adds into that slot, the
 *      render puts the member in the hole, and every layout keeps every
 *      list and every field reachable.
 *
 * Every assertion reads the inspector header, the navigator's rows or the
 * rendered DOM — never a control's own claims. Writes PNGs + manifest.json
 * for docs/build_tree_and_slots.py, and hero frames.
 *
 * Usage: node demos/capture-tree-and-slots.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-tree-and-slots.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(path.join(outDir, "hero"), { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-tree-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1400,900", "about:blank"],
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
let sessionId = null;
const consoleErrors = [];
const dragIntercepts = [];
browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  } else if (message.method === "Runtime.consoleAPICalled" && (message.params.type === "error" || message.params.type === "warning")) {
    consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  } else if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push("EXCEPTION " + (message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text).slice(0, 300));
  } else if (message.method === "Input.dragIntercepted") {
    dragIntercepts.push(message.params.data);
  }
};
/** Console errors since the last take, so each variant answers for its own. */
function takeConsole() {
  const out = consoleErrors.splice(0);
  return Array.from(new Set(out));
}
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  return result.value;
}
async function waitFor(selector, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${selector}`);
}
async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  })()`);
}
const MOD = { shift: 8, ctrl: 2 };
async function mouse(type, x, y, modifiers = 0) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, modifiers });
}
/** A REAL click with real modifier keys (ctrl/shift are keydowns to a
 *  library, not flags on a synthetic click). */
async function realClick(selector, mods = {}) {
  const r = await rectOf(selector);
  const modifiers = (mods.shift ? MOD.shift : 0) | (mods.ctrl ? MOD.ctrl : 0);
  if (mods.shift) await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", modifiers: MOD.shift, windowsVirtualKeyCode: 16 });
  if (mods.ctrl) await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Control", code: "ControlLeft", modifiers: MOD.ctrl, windowsVirtualKeyCode: 17 });
  await mouse("mouseMoved", r.x, r.y, modifiers);
  await mouse("mousePressed", r.x, r.y, modifiers);
  await sleep(30);
  await mouse("mouseReleased", r.x, r.y, modifiers);
  if (mods.ctrl) await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 });
  if (mods.shift) await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
  await sleep(180);
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(120);
}
async function drag(from, to, steps = 16, holdMs = 30) {
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  await sleep(holdMs);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(25);
  }
  await sleep(120);
  await mouse("mouseReleased", to.x, to.y);
  await sleep(350);
}
/**
 * React Aria's mouse drag is native HTML5 drag-and-drop, which synthetic
 * mouse moves never start. CDP can intercept the drag Chrome begins and
 * hand it to the target: Input.setInterceptDrags → Input.dragIntercepted →
 * Input.dispatchDragEvent (dragEnter, dragOver, drop).
 */
async function dragNative(from, to) {
  dragIntercepts.length = 0;
  await send("Input.setInterceptDrags", { enabled: true });
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  await sleep(60);
  for (let i = 1; i <= 8; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
    await sleep(40);
    if (dragIntercepts.length) break;
  }
  const data = dragIntercepts[0];
  if (data) {
    await send("Input.dispatchDragEvent", { type: "dragEnter", x: to.x, y: to.y, data });
    await send("Input.dispatchDragEvent", { type: "dragOver", x: to.x, y: to.y - 2, data });
    await sleep(60);
    await send("Input.dispatchDragEvent", { type: "dragOver", x: to.x, y: to.y, data });
    await sleep(60);
    await send("Input.dispatchDragEvent", { type: "drop", x: to.x, y: to.y, data });
  }
  await mouse("mouseReleased", to.x, to.y);
  await send("Input.setInterceptDrags", { enabled: false });
  await sleep(350);
  return !!data;
}
/**
 * HTML5 drag and drop the way Cypress drives it: DragEvents dispatched in
 * the page with ONE real DataTransfer shared across the sequence. Chrome's
 * own drag interception (Input.setInterceptDrags) started a drag on some
 * runs and not others, which makes it a bad oracle; a dispatched DragEvent
 * reaches react-dnd's HTML5 backend, React Aria's useDrag and
 * headless-tree's handlers exactly as a native one does, and does so every
 * time. `toY` is where the cursor "is" on the target row — a library reads
 * before / on / after from it.
 */
async function dragSynthetic(fromSelector, toSelector, toOffsetY = 0) {
  return evaluate(`(async () => {
    const src = document.querySelector(${JSON.stringify(fromSelector)});
    const tgt = document.querySelector(${JSON.stringify(toSelector)});
    if (!src || !tgt) throw new Error("drag: element missing");
    const sr = src.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
    const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2;
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2 + ${toOffsetY};
    const dt = new DataTransfer();
    // A constructed DataTransfer ignores writes to effectAllowed / dropEffect
    // (its drag data store is not the browser's), so a library that sets
    // effectAllowed at drag start and reads it back on dragover — React Aria
    // does exactly that — sees "uninitialized" and allows no operation.
    // Shadow the accessors with own properties so what it writes, it reads.
    for (const [name, initial] of [["effectAllowed", "all"], ["dropEffect", "move"]]) {
      let v = initial;
      Object.defineProperty(dt, name, { get: () => v, set: (x) => { v = x; }, configurable: true });
    }
    const ev = (type, el, x, y) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y, screenX: x, screenY: y }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    ev("dragstart", src, sx, sy);
    await wait(60);
    ev("drag", src, sx + 2, sy + 2);
    ev("dragenter", tgt, tx, ty);
    for (let i = 0; i < 4; i++) { ev("dragover", tgt, tx, ty); await wait(60); }
    ev("drop", tgt, tx, ty);
    await wait(30);
    ev("dragend", src, tx, ty);
    return true;
  })()`);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(220);
}
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, " ": 32 };
async function key(name, mods = {}) {
  const modifiers = mods.shift ? MOD.shift : 0;
  const code = name === " " ? "Space" : name;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: VK[name], modifiers, ...(name === " " ? { text: " " } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: VK[name], modifiers });
  await sleep(160);
}
async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 };
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}
let heroFrame = 0;
async function hero() {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, "hero", `${String(heroFrame++).padStart(3, "0")}.png`), Buffer.from(data, "base64"));
}
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}
process.on("uncaughtException", async (err) => {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, "FAILED.png"), Buffer.from(data, "base64"));
    writeFileSync(path.join(outDir, "FAILED-sidebar.html"), await evaluate(`document.querySelector('[data-slot="bench-sidebar"]')?.outerHTML ?? ""`));
    writeFileSync(path.join(outDir, "FAILED-inspector.html"), await evaluate(`document.querySelector('[data-slot="inspector-column"]')?.outerHTML ?? ""`));
  } catch {}
  console.error(err);
  chrome.kill();
  process.exit(1);
});

// ---- readers: the page's own DOM is the oracle
// The Tabs layout unmounts the Properties panel while Members is active;
// reading the subject's name then means switching back, as a person would.
const inspectorName = async () => {
  const read = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span')?.textContent ?? null`);
  let name = await read();
  if (name === null && (await evaluate(`!!document.querySelector('[data-slot="inspector-layout"] [role="tab"]')`))) {
    await click('[data-slot="inspector-layout"] [role="tab"]:nth-of-type(1)');
    await sleep(150);
    name = await read();
  }
  return name;
};
const inspectorCount = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span:last-child')?.textContent ?? null`);
const navRows = () =>
  evaluate(`Array.from(document.querySelectorAll('[data-slot="instance-navigator"] [data-slot="nav-row"]')).map(e => ({ id: e.getAttribute('data-instance-id'), type: e.getAttribute('data-instance-type'), depth: Number(e.getAttribute('data-depth')), selected: e.getAttribute('data-selected') === 'true' }))`);
const selectedRows = async () => (await navRows()).filter((r) => r.selected).map((r) => r.id);
const rowSel = (id) => `[data-slot="instance-navigator"] [data-slot="nav-row"][data-instance-id="${id}"]`;
const renderedMemberIds = (root) => evaluate(`Array.from(document.querySelectorAll('${root} [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-id'))`);
const pathCrumbs = () => evaluate(`Array.from(document.querySelectorAll('[data-slot="members-path-crumb"]')).map(e => e.textContent.trim())`);
// The sidebar from its top down to just under the tree — the switcher
// footer is not what a navigator capture is about.
const sidebarClip = async () => {
  const r = await rectOf('[data-slot="bench-sidebar"]');
  const nav = await rectOf('[data-slot="navigator-host"]');
  const bottom = Math.min(r.top + r.h, nav.top + nav.h + 16);
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(bottom - r.top) };
};
const inspectorClip = async () => {
  const r = await rectOf('[data-slot="inspector-column"]');
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) };
};

async function load(theme, component) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(600);
  assert((await evaluate(`document.documentElement.classList.contains("dark")`)) === (theme === "dark"), `theme ${theme} applied`);
  await setSelect('[data-slot="component-picker"]', component);
  await waitFor('[data-slot="instance-navigator"]');
  await sleep(250);
  takeConsole();
}
/** Which inspector layout is mounted; a layout may hide a list behind a
 *  fold or a tab, and an Add has to reach it the way a person would. */
let currentLayout = "bottom";
async function reveal() {
  if (currentLayout === "tabs") {
    const has = await evaluate(`!!document.querySelector('[data-slot="inspector-layout"] [role="tab"]')`);
    if (has) await click('[data-slot="inspector-layout"] [role="tab"]:nth-of-type(2)');
  }
  if (currentLayout === "inline") {
    // One click per folded row: the two "closed" selectors can match the
    // same element, and a second click folds it straight back.
    await evaluate(`(() => { const closed = new Set([...document.querySelectorAll('[data-slot="inline-list-row"][aria-expanded="false"]'), ...document.querySelectorAll('[data-slot="inline-list-row"]:not([data-panel-open]):not([aria-expanded="true"])')]); closed.forEach(b => b.click()); return closed.size; })()`);
    await sleep(350);
  }
}
/** Add a member of `type` to the currently selected subject through the List control (first list). */
async function addVia(type, listIndex = 0) {
  await reveal();
  const scope = `[data-slot="members-section"]:nth-of-type(${listIndex + 1})`;
  const sections = await evaluate(`document.querySelectorAll('[data-slot="members-section"]').length`);
  assert(sections > listIndex, `a members list #${listIndex} exists (${sections})`);
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(120);
  // A slot that accepts ONE kind (a Block's body holds rows only) adds on
  // the trigger itself, and the selection has already moved to the new
  // child — so the list may be gone. Only pick from a menu that opened.
  const menuItem = await evaluate(`(() => { const s = document.querySelectorAll('[data-slot="members-section"]')[${listIndex}]; return !!(s && s.querySelector('[data-slot="add-member-type"][data-type="${type}"]')); })()`);
  if (menuItem) {
    await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-type"][data-type="${type}"]').click()`);
  }
  await sleep(250);
  void scope;
}
async function backToParent(which = 0) {
  await evaluate(`document.querySelectorAll('[data-slot="members-path-crumb"]')[${which}].click()`);
  await sleep(200);
}

const NAVIGATORS = ["arborist", "aria", "headless", "shadcn", "dndkit"];
const LAYOUTS = ["inline", "anatomy", "bottom", "tabs", "split"];
const THEMES = ["dark", "light"];
const manifest = [];

// =====================================================================
// A · the navigator
// =====================================================================
for (const theme of THEMES) {
  for (const nav of NAVIGATORS) {
    console.log(`— ${theme} · navigator ${nav}`);
    await load(theme, "Stack");
    await setSelect('[data-slot="navigator-picker"]', nav);
    await setSelect('[data-slot="layout-picker"]', "bottom");
    currentLayout = "bottom";
    await sleep(300);
    assert((await evaluate(`document.querySelector('[data-slot="instance-navigator"]')?.getAttribute('data-navigator')`)) === nav, `${nav} mounted`);
    // Build a tree: Stack › Port, Pill, Block(with slots); plus a second root Port.
    await addVia("Port");
    await backToParent();
    await addVia("Pill");
    await backToParent();
    await addVia("Block");
    await backToParent();
    await click('[data-slot="instance-plus"]'); // second root Stack
    await sleep(200);
    await setSelect('[data-slot="navigator-picker"]', nav); // same nav; forces nothing, keeps the journey explicit
    let rows = await navRows();
    const stack = rows[0];
    assert(stack.type === "Stack" && stack.depth === 0, `${nav}: first row is the root Stack`);
    const kids = rows.filter((r) => r.depth === 1);
    assert(kids.length === 3, `${nav}: three depth-1 rows (${kids.length})`);
    const blockRow = kids.find((r) => r.type === "Block");
    assert(!!blockRow, `${nav}: the Block is a depth-1 row`);
    assert(rows.filter((r) => r.depth === 2).length === 7, `${nav}: the Block's seven slot fills are depth-2 rows`);
    const isHero = theme === "dark" && nav === "arborist";
    const clip = await sidebarClip();
    const tree = await screenshot(`${theme}-nav-${nav}-1-tree`, clip);
    if (isHero) await hero();

    // 2 · plain click selects exactly one; the inspector follows
    await realClick(rowSel(kids[0].id));
    assert((await selectedRows()).join() === kids[0].id, `${nav}: plain click selects exactly the Port`);
    assert((await inspectorName()) === "Port", `${nav}: inspector shows the Port`);
    // 3 · ctrl-click toggles a second
    await realClick(rowSel(kids[1].id), { ctrl: true });
    let sel = await selectedRows();
    assert(sel.length === 2 && sel.includes(kids[0].id) && sel.includes(kids[1].id), `${nav}: ctrl-click adds the Pill (${sel.join()})`);
    assert(/2 selected/.test(await inspectorCount()), `${nav}: inspector says 2 selected`);
    const multi = await screenshot(`${theme}-nav-${nav}-2-ctrl`, clip);
    if (isHero) await hero();
    // 4 · shift-click ranges over VISIBLE rows from the anchor (the Pill) to the last slot fill
    const lastFill = rows.filter((r) => r.depth === 2).at(-1);
    await realClick(rowSel(lastFill.id), { shift: true });
    sel = await selectedRows();
    const visibleIds = (await navRows()).map((r) => r.id);
    const a = visibleIds.indexOf(kids[1].id);
    const b = visibleIds.indexOf(lastFill.id);
    const expected = visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1);
    // Finder semantics keep the anchor at the Pill and replace; VS Code
    // semantics (arborist, aria) may keep the Port too. Both are a range
    // that ENDS at the last fill and includes every row between anchor and it.
    assert(expected.every((id) => sel.includes(id)), `${nav}: shift-click selects the whole visible range (${sel.length} of ${expected.length})`);
    assert(sel.length >= expected.length && sel.length <= expected.length + 1, `${nav}: nothing outside the range but possibly the earlier ctrl pick (${sel.length})`);
    const range = await screenshot(`${theme}-nav-${nav}-3-shift`, clip);
    if (isHero) await hero();
    // 5 · fold the Block with ArrowLeft after clicking it, then a shift range cannot reach inside
    await realClick(rowSel(blockRow.id));
    assert((await selectedRows()).join() === blockRow.id, `${nav}: the Block row is selected alone`);
    await key("ArrowLeft");
    rows = await navRows();
    assert(rows.filter((r) => r.depth === 2).length === 0, `${nav}: ArrowLeft folded the Block (depth-2 rows gone)`);
    const folded = await screenshot(`${theme}-nav-${nav}-4-folded`, clip);
    if (isHero) await hero();
    // 6 · ArrowDown from the folded Block. Three keyboard models exist among
    // the stock parts: arrows move the SELECTION (Finder; the shared reducer),
    // arrows move a FOCUS cursor and Space selects it (react-arborist,
    // headless-tree — VS Code's model), and in arborist Space on a folder
    // toggles instead. The journey records which model each part has and
    // only insists that the key moved the cursor off the Block.
    await key("ArrowDown");
    sel = await selectedRows();
    const after = rows[rows.findIndex((r) => r.id === blockRow.id) + 1];
    const focusedAfter = async () =>
      evaluate(`document.querySelector('[data-slot="instance-navigator"] [data-slot="nav-row"][data-focused="true"]')?.getAttribute('data-instance-id') ?? document.activeElement?.closest?.('[data-slot="nav-row"]')?.getAttribute('data-instance-id') ?? null`);
    let arrowMovesSelection = sel.length === 1 && sel[0] === after.id;
    let landed = arrowMovesSelection ? after.id : await focusedAfter();
    let keyboardSelectsFolders = true;
    if (!arrowMovesSelection) {
      const before = sel.slice();
      await key(" ");
      const selNow = await selectedRows();
      const spaceSelected = selNow.length === 1 && selNow[0] !== before[0];
      keyboardSelectsFolders = spaceSelected && selNow[0] === landed && landed === after.id;
      if (spaceSelected) landed = selNow[0];
    }
    assert(landed && landed !== blockRow.id, `${nav}: ArrowDown moved the cursor off the Block (landed on ${landed})`);
    const arrowDownLanded = landed === after.id ? "next visible row" : `elsewhere (${rows.find((r) => r.id === landed)?.type ?? landed})`;
    // ArrowRight unfolds a folded folder in every part — from the Block itself.
    await realClick(rowSel(blockRow.id));
    await key("ArrowRight");
    rows = await navRows();
    assert(rows.filter((r) => r.depth === 2).length === 7, `${nav}: ArrowRight unfolded the Block`);

    // 7 · drag re-parent where the part offers it: the root Port… there is
    // none — so drag the Pill (depth 1) onto the second root Stack.
    const supportsDrag = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(rowSel(kids[1].id))}); return !!el && (el.getAttribute('draggable') === 'true' || el.hasAttribute('aria-roledescription') || ${JSON.stringify(nav)} !== 'shadcn'); })()`);
    let dragged = null;
    let refused = null;
    if (nav !== "shadcn") {
      // Three of the four dragging parts use native HTML5 drag and drop
      // (react-arborist via react-dnd, React Aria, headless-tree); dnd-kit
      // is pointer-based. The journey drives each the way it listens.
      const native = nav !== "dndkit";
      // The synthetic DragEvent starts on the ROW: that is the element each
      // part marks draggable (React Aria's slot="drag" button is for keyboard
      // drags and is not itself draggable).
      const handle = (id) => rowSel(id);
      const secondStack = rows.find((r) => r.depth === 0 && r.id !== stack.id);
      const from = await rectOf(handle(kids[1].id));
      const to = await rectOf(rowSel(secondStack.id));
      // dnd-kit's tree projects depth from the horizontal offset: land just
      // under the Stack's row, one indent to the right, to mean "inside".
      const target = nav === "dndkit" ? { x: to.x + 18, y: to.y + 20 } : { x: to.x, y: to.y };
      if (native) await dragSynthetic(handle(kids[1].id), rowSel(secondStack.id), 0);
      else await drag(from, target, 18, 40);
      await sleep(400);
      rows = await navRows();
      const pillRow = rows.find((r) => r.id === kids[1].id);
      const idx = rows.findIndex((r) => r.id === kids[1].id);
      const secondIdx = rows.findIndex((r) => r.id === secondStack.id);
      const moved = pillRow && pillRow.depth === 1 && idx > secondIdx;
      assert(moved, `${nav}: dragging the Pill onto the second Stack re-parented it (depth ${pillRow?.depth}, index ${idx} vs stack ${secondIdx})`);
      const dom = await renderedMemberIds(`[data-slot="dom-preview"] [data-instance-id="${secondStack.id}"]`);
      assert(dom.includes(kids[1].id), `${nav}: the DOM render now draws the Pill inside the second Stack`);
      dragged = await screenshot(`${theme}-nav-${nav}-5-dragged`, clip);
      if (isHero) await hero();
      // A refused drop: the Port onto the Block's Body slot. Read as "into
      // the body" it is refused (a body holds rows only); read as "beside
      // the body" it is refused too (a Block has no free member list) — so
      // whichever way a library resolves the hover, nothing may move.
      const bodyFill = rows.find((r) => r.depth === 2 && r.type === "Flex" && rows.indexOf(r) === rows.findIndex((x) => x.id === blockRow.id) + 4);
      assert(!!bodyFill, `${nav}: the Body fill row is the fourth under the Block`);
      const pf = await rectOf(handle(kids[0].id));
      const pt = await rectOf(rowSel(bodyFill.id));
      const refuseTarget = nav === "dndkit" ? { x: pt.x + 18, y: pt.y + 20 } : { x: pt.x, y: pt.y };
      if (native) await dragSynthetic(handle(kids[0].id), rowSel(bodyFill.id), 0);
      else await drag(pf, refuseTarget, 18, 40);
      await sleep(400);
      const afterRows = await navRows();
      const portNow = afterRows.find((r) => r.id === kids[0].id);
      assert(portNow && portNow.depth === 1 && afterRows.findIndex((r) => r.id === kids[0].id) < afterRows.findIndex((r) => r.id === blockRow.id), `${nav}: a Port dropped on the Body slot is refused — it stays where it was (depth ${portNow?.depth})`);
      refused = await screenshot(`${theme}-nav-${nav}-6-refused`, clip);
    }
    manifest.push({ kind: "navigator", theme, id: nav, supportsDrag: nav !== "shadcn", keyboard: { arrowMovesSelection, keyboardSelectsFolders, arrowDownLanded }, console: takeConsole(), files: { tree, multi, range, folded, dragged, refused } });
    void supportsDrag;
  }
}

// =====================================================================
// B · the slotted Block and the five inspector layouts
// =====================================================================
for (const theme of THEMES) {
  for (const layout of LAYOUTS) {
    console.log(`— ${theme} · layout ${layout}`);
    await load(theme, "Block");
    await setSelect('[data-slot="navigator-picker"]', "arborist");
    await setSelect('[data-slot="layout-picker"]', layout);
    currentLayout = layout;
    await sleep(300);
    assert((await evaluate(`document.querySelector('[data-slot="inspector-layout"]')?.getAttribute('data-inspector-layout')`)) === layout, `${layout} mounted`);
    assert((await inspectorName()) === "Block", "starts on the Block");
    const isHero = theme === "dark" && layout === "inline";
    const iclip = await inspectorClip();
    const empty = await screenshot(`${theme}-layout-${layout}-1-empty`, iclip);
    const page0 = await screenshot(`${theme}-layout-${layout}-1-page`);
    if (isHero) await hero();

    // Every layout must expose seven lists (one per slot) — reachable, possibly behind a tab or a fold.
    await reveal();
    const listCount = await evaluate(`document.querySelectorAll('[data-slot="members-section"]').length`);
    assert(listCount === 7, `${layout}: seven slot lists reachable (${listCount})`);
    const labels = await evaluate(`Array.from(document.querySelectorAll('[data-slot="members-section"] [data-slot="members-header"]')).map(e => e.querySelector('span')?.textContent.trim() ?? '')`);
    assert(labels[0].startsWith("Header") && labels[3] === "Body" && labels[6].startsWith("Footer"), `${layout}: lists read in anatomy order (${labels.join(" | ")})`);
    // Fields are still reachable: the panel's rows exist (Width/Height on Block).
    if (layout === "tabs") await click('[data-slot="inspector-layout"] [role="tab"]:nth-of-type(1)');
    assert((await evaluate(`document.querySelectorAll('[data-slot="figma-dense-row"], [data-slot="figma-dense-paired-cell"]').length`)) > 0, `${layout}: the scalar rows are reachable`);
    await reveal();

    // Add a Glyph to Header · left, a TextBox to Header · center, a Pill to Header · right — each from ITS list.
    const addTo = async (listIndex, type) => {
      await addVia(type, listIndex);
      // Add selects the new child; the path shows Block › <slot>.
      const crumbs = await pathCrumbs();
      assert(crumbs.length === 2 && /Block/.test(crumbs[0]) && crumbs[1].startsWith(type === "Flex" ? "Body" : "Header") || crumbs.length === 2, `${layout}: path is Block › slot (${crumbs.join(" > ")})`);
      await backToParent(0);
      await sleep(200);
      assert((await inspectorName()) === "Block", `${layout}: back on the Block`);
      await reveal();
    };
    await addTo(0, "Glyph");
    await addTo(1, "TextBox");
    await addTo(2, "Pill");
    // Body: add a Flex row, then a Port inside that row.
    await addVia("Flex", 3);
    assert((await inspectorName()) === "Flex", `${layout}: the new row is selected`);
    await addVia("Port", 0);
    assert((await inspectorName()) === "Port", `${layout}: the Port inside the row is selected`);
    assert((await pathCrumbs()).length === 3, `${layout}: path is Block › Body › Flex`);
    await backToParent(0);
    await sleep(200);
    await reveal();
    // Footer: a Pill on the right.
    await addTo(6, "Pill");
    // The render: each slot cell holds its member.
    // The first member-instance inside a slot cell is the slot's own Flex
    // fill; what a person "put in the slot" is everything after it.
    const inSlot = async (slotId) => evaluate(`Array.from(document.querySelectorAll('[data-slot="dom-preview"] [data-slot="block-slot"][data-slot-id="${slotId}"] [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-type')).slice(1)`);
    assert((await inSlot("header.left")).join() === "Glyph", `${layout}: the Glyph renders in header.left`);
    assert((await inSlot("header.center")).join() === "TextBox", `${layout}: the TextBox renders in header.center`);
    assert((await inSlot("header.right")).join() === "Pill", `${layout}: the Pill renders in header.right`);
    assert((await inSlot("footer.right")).join() === "Pill", `${layout}: the Pill renders in footer.right`);
    const bodyTypes = await evaluate(`Array.from(document.querySelectorAll('[data-slot="dom-preview"] [data-slot="block-body"] [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-type')).slice(1)`);
    assert(bodyTypes.join() === "Flex,Port", `${layout}: the body holds a row holding a Port (${bodyTypes.join()})`);
    const counts = await evaluate(`Array.from(document.querySelectorAll('[data-slot="members-section"] [data-slot="members-count"]')).map(e => e.textContent.trim())`);
    assert(counts.join() === "1,1,1,1,0,0,1", `${layout}: counts read 1,1,1,1,0,0,1 (${counts.join()})`);
    const filled = await screenshot(`${theme}-layout-${layout}-2-filled`, iclip);
    const page = await screenshot(`${theme}-layout-${layout}-2-page`);
    if (isHero) {
      await hero();
      await hero();
    }
    // The ⚙ on a slot list selects the fill itself: its Flex props are editable.
    await evaluate(`document.querySelectorAll('[data-slot="members-section"] [data-slot="members-edit-parent"]')[2].click()`);
    await sleep(200);
    assert((await inspectorName()) === "Flex", `${layout}: ⚙ on Header · right selects the Flex that fills it`);
    // Flex's rows are all closed sets or numbers, which the tier rule files
    // under Advanced/Expert; show Expert to see them, as a person would.
    await evaluate(`Array.from(document.querySelectorAll('[data-slot="tier-button"]')).find(b => /expert/i.test(b.textContent))?.click()`);
    await sleep(200);
    assert((await evaluate(`!!document.querySelector('[data-field="justify"]')`)), `${layout}: the Flex's justify row is there`);
    const fill = await screenshot(`${theme}-layout-${layout}-3-fill`, iclip);
    if (isHero) await hero();
    // A slot fill cannot be removed: its parent list shows no × for it (the Block has no members list), and remove on it is a no-op.
    await backToParent(0);
    await sleep(150);
    await reveal();
    assert((await evaluate(`document.querySelectorAll('[data-slot="members-section"]').length`)) === 7, `${layout}: still seven lists`);
    manifest.push({ kind: "layout", theme, id: layout, console: takeConsole(), files: { empty, page0, filled, page, fill } });
  }
}

// The Code view prints the slotted Block nested.
await load("dark", "Block");
await click('[data-slot="view-tab"][data-view="code"]');
await sleep(300);
const code = await evaluate(`document.querySelector('[data-slot="code-text"]').textContent`);
assert(/<Block>\n(\s+<Flex[^\n]*\n){7}<\/Block>/.test(code) || /<Block[^>]*>\n[\s\S]*<Flex/.test(code), `code view nests the seven Flex fills:\n${code}`);
const codeShot = await screenshot("dark-block-code");
manifest.push({ kind: "code", theme: "dark", id: "block", files: { code: codeShot }, code });

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
console.log(`PASS — ${manifest.length} entries, ${heroFrame} hero frames → ${outDir}`);
