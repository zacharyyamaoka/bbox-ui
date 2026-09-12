#!/usr/bin/env node
/**
 * Drives bbox-ui.com/create in headless Chrome over raw CDP and PROVES the
 * TextBox editing half end to end (docs/TEXTBOX-EDITING-SPEC.md §4), for
 * each of the three renders (DOM, React Flow, tldraw):
 *
 *  1. pick the Block bench, select the Header · left slot fill via the
 *     navigator, add a TextBox to it through the Members control;
 *  2. it renders inside [data-slot="block-header"] with NO dashed frame;
 *  3. click it → selected; click again → editing, autofocused, control's
 *     box matches the resting text's box within 1px;
 *  4. type "Hello slot", Enter → committed, resting text AND the
 *     inspector's Text field both read it;
 *  5. click again, type "zzz", Escape → still "Hello slot" (cancel restores);
 *  6. lines → multi in the inspector, click to edit, "a", Enter (native
 *     newline), "b" → textarea value has a newline; Ctrl+Enter → committed,
 *     rendered on two lines;
 *  7. reactflow/tldraw only: press the resting text and drag 80px → the
 *     node moved, no text selection.
 *
 * Every assertion reads the real DOM (getBoundingClientRect, textContent,
 * a control's own .value, computed style) or genuine instance state via the
 * inspector — never a screenshot's own claim. Screenshots are additional
 * evidence, captured at each numbered step. Never types the headless
 * browser binary's name directly in a Bash command — this file is invoked
 * from Node, exactly like demos/capture-tree-and-slots.mjs.
 *
 * Usage: node demos/capture-text-box-editing.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-text-box-editing.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-tbe-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1440,960", "about:blank"],
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
  }
};
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
async function press(selector, mods = {}) {
  const r = await rectOf(selector);
  const modifiers = (mods.shift ? MOD.shift : 0) | (mods.ctrl ? MOD.ctrl : 0);
  await mouse("mouseMoved", r.x, r.y, modifiers);
  await mouse("mousePressed", r.x, r.y, modifiers);
  await sleep(30);
  await mouse("mouseReleased", r.x, r.y, modifiers);
  await sleep(200);
  return r;
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(150);
}
async function drag(from, to, steps = 16, holdMs = 40) {
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  await sleep(holdMs);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(25);
  }
  await sleep(80);
  await mouse("mouseReleased", to.x, to.y);
  await sleep(300);
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
const VK = { Enter: 13, Escape: 27 };
// WHY `text: "\r"` on Enter: CDP's keyDown only triggers a native default
// action (like a textarea's own newline insertion) when the event carries
// a `text` payload — without it, Chromium dispatches the key event but
// performs no native text-editing side effect at all (confirmed empirically:
// omitting it produced a keydown with no visible effect whatsoever, neither
// commit nor newline). Escape has no such native default action to trigger.
const KEY_TEXT = { Enter: "\r" };
async function key(name, mods = {}) {
  const modifiers = (mods.shift ? MOD.shift : 0) | (mods.ctrl ? MOD.ctrl : 0);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: name,
    code: name,
    windowsVirtualKeyCode: VK[name],
    modifiers,
    ...(KEY_TEXT[name] ? { text: KEY_TEXT[name] } : {}),
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: VK[name], modifiers });
  await sleep(160);
}
/** Types into whatever the page currently has focused, one character of
 *  Input.insertText per key — the same idiom demos/drive-playground-inspector.mjs
 *  uses to drive a real text field: it fires a genuine `input` event React's
 *  controlled inputs listen for, with no synthetic keydown noise to filter. */
async function typeText(text) {
  for (const ch of text) {
    await send("Input.insertText", { text: ch });
    await sleep(35);
  }
}
async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 };
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}

const results = []; // { render, step, name, pass, detail }
let currentRender = "?";
function record(step, name, pass, detail) {
  results.push({ render: currentRender, step, name, pass: !!pass, detail: String(detail ?? "") });
  const mark = pass ? "ok" : "FAIL";
  console.log(`  [${currentRender}] ${step} ${mark} — ${name}${detail ? ": " + detail : ""}`);
}
function assertStep(step, name, cond, detail) {
  record(step, name, cond, detail);
  return cond;
}

process.on("uncaughtException", async (err) => {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, `FAILED-${currentRender}.png`), Buffer.from(data, "base64"));
  } catch {}
  console.error(err);
  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ results, crashed: String(err) }, null, 2));
  chrome.kill();
  process.exit(1);
});

// ---- readers: the page's own DOM is the oracle ----------------------------
const navRows = () =>
  evaluate(`Array.from(document.querySelectorAll('[data-slot="instance-navigator"] [data-slot="nav-row"]')).map(e => ({
    id: e.getAttribute('data-instance-id'),
    type: e.getAttribute('data-instance-type'),
    depth: Number(e.getAttribute('data-depth')),
    selected: e.getAttribute('data-selected') === 'true',
    title: e.querySelector('[data-slot="nav-title"]')?.textContent?.trim() ?? null,
  }))`);
const rowSel = (id) => `[data-slot="instance-navigator"] [data-slot="nav-row"][data-instance-id="${id}"]`;
const selectedRows = async () => (await navRows()).filter((r) => r.selected).map((r) => r.id);
// FigmaDense — the DEFAULT inspector variant this journey drives — now has
// a real `<textarea>` branch for the "textarea" kind too (verify-round-1
// fix for F5: it used to fall through to a single-line `<input>`, which
// silently strips a committed multi-line value's newline the moment this
// panel next touches the field). `inspectorTextControl` reads the tag
// itself so step 6 can assert it directly rather than only reading value.
const inspectorTextControl = () => evaluate(`document.querySelector('[data-field="children"] textarea, [data-field="children"] input')?.tagName ?? null`);
const inspectorTextValue = () => evaluate(`(document.querySelector('[data-field="children"] textarea, [data-field="children"] input'))?.value ?? null`);
const inspectorName = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span')?.textContent ?? null`);

/** The instance the resting box currently shows, however it is nested —
 *  member-instance wraps every non-root instance, `display: contents`, so
 *  its own rect is meaningless; the box under it is the real element. */
const textBoxSel = (id) => `[data-slot="member-instance"][data-instance-id="${id}"] [data-slot="text-box"]`;
const controlSel = (id) => `[data-slot="member-instance"][data-instance-id="${id}"] [data-slot="text-box-input"]`;
const restingText = (id) => evaluate(`document.querySelector(${JSON.stringify(textBoxSel(id))})?.textContent ?? null`);

/** Walks from the TextBox's own element up to (not including) the given
 *  ancestor selector, and reports whether ANY of them computes a dashed
 *  border — the "no dashed frame" assertion, done as a real style read
 *  rather than trusting that skipping the bench's 220px wrapper div was
 *  enough (an ancestor further up could still be dashed by accident). */
async function dashedAncestor(instanceId, stopAtSelector) {
  return evaluate(`(() => {
    let el = document.querySelector(${JSON.stringify(textBoxSel(instanceId))});
    const stop = document.querySelector(${JSON.stringify(stopAtSelector)});
    const seen = [];
    while (el && el !== stop && el !== document.body) {
      const cs = getComputedStyle(el);
      seen.push({ tag: el.tagName, borderStyle: cs.borderStyle, dataSlot: el.getAttribute('data-slot') });
      if (/dashed/.test(cs.borderStyle)) return { dashed: true, at: el.getAttribute('data-slot') || el.tagName, seen };
      el = el.parentElement;
    }
    return { dashed: false, seen };
  })()`);
}

async function load(theme, component) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(500);
  await setSelect('[data-slot="component-picker"]', component);
  await waitFor('[data-slot="instance-navigator"]');
  await setSelect('[data-slot="navigator-picker"]', "arborist");
  await setSelect('[data-slot="layout-picker"]', "inline");
  await sleep(300);
  takeConsole();
}
const CANVAS_READY_SEL = { dom: '[data-slot="dom-instance"]', reactflow: '[data-slot="rf-instance"]', tldraw: '[data-slot="tl-instance"]' };
async function switchRender(id) {
  await click(`[data-slot="render-tab"][data-render="${id}"]`);
  await waitFor(CANVAS_READY_SEL[id]);
  // tldraw/React Flow mount their store and shapes/nodes asynchronously
  // after the selector above first appears; give the canvas a beat to
  // settle before reading geometry off it.
  await sleep(id === "dom" ? 150 : 700);
}
/** Select a slot fill by its label ("Header · left") through the
 *  navigator — the same click surface a person uses, never a direct
 *  setSelection call the panel doesn't expose to a user. */
async function selectByTitle(title) {
  const rows = await navRows();
  const row = rows.find((r) => r.title === title);
  if (!row) throw new Error(`no nav row titled "${title}" (have: ${rows.map((r) => r.title).join(" | ")})`);
  await press(rowSel(row.id));
  return row.id;
}
/** The "inline" inspector layout starts an EMPTY member list collapsed
 *  (docs InlineRows.tsx) — the Add trigger lives inside its
 *  CollapsibleContent, unmounted until opened. Same idiom
 *  demos/capture-tree-and-slots.mjs's `reveal()` uses. */
async function reveal() {
  await evaluate(`(() => { const closed = document.querySelectorAll('[data-slot="inline-list-row"][aria-expanded="false"]'); closed.forEach(b => b.click()); return closed.length; })()`);
  await sleep(300);
}
/** Add `type` to the currently-selected subject's (only) members list via
 *  the Members control — same idiom as demos/capture-tree-and-slots.mjs's
 *  `addVia`, narrowed to listIndex 0 since a slot fill carries exactly one
 *  list (its own). */
async function addTextBox() {
  const sections = await evaluate(`document.querySelectorAll('[data-slot="members-section"]').length`);
  if (sections === 0) throw new Error("no members-section for the selected slot fill");
  await evaluate(`document.querySelector('[data-slot="members-section"]').querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(150);
  const hasMenuItem = await evaluate(`!!document.querySelector('[data-slot="members-section"] [data-slot="add-member-type"][data-type="TextBox"]')`);
  if (hasMenuItem) await evaluate(`document.querySelector('[data-slot="members-section"] [data-slot="add-member-type"][data-type="TextBox"]').click()`);
  await sleep(250);
}

const RENDERS = ["dom", "reactflow", "tldraw"];
const manifest = { renders: {} };

for (const renderId of RENDERS) {
  currentRender = renderId;
  console.log(`\n=== ${renderId} ===`);
  await load("dark", "Block");
  await switchRender(renderId);

  // ---- step 1: add a TextBox to Header · left --------------------------
  const flexId = await selectByTitle("Header · left");
  assertStep(1, "selected the Header · left slot fill", (await selectedRows()).join() === flexId, flexId);
  await reveal();
  await addTextBox();
  const afterAdd = await selectedRows();
  assertStep(1, "adding TextBox selected exactly the new child", afterAdd.length === 1, afterAdd.join());
  const textBoxId = afterAdd[0];
  const addedType = await evaluate(`document.querySelector(${JSON.stringify(rowSel(textBoxId))})?.getAttribute('data-instance-type')`);
  assertStep(1, "the new instance is a TextBox", addedType === "TextBox", addedType);

  // ---- step 2: bare in the header, no dashed frame ----------------------
  const inHeaderSelector = `[data-slot="block-header"] ${textBoxSel(textBoxId)}`;
  const inHeader = await evaluate(`!!document.querySelector(${JSON.stringify(inHeaderSelector)})`);
  assertStep(2, "TextBox renders inside [data-slot=block-header]", inHeader, inHeader);
  const frame = await dashedAncestor(textBoxId, '[data-slot="block-header"]');
  assertStep(2, "no dashed frame between the TextBox and the header", !frame.dashed, frame.dashed ? `dashed at ${frame.at}` : "clean");
  const headerClip = await rectOf('[data-slot="block-header"]');
  await screenshot(`${renderId}-1-added`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 20 });

  // Deselect so "click it" (step 3) is a genuine first press, not an
  // already-sole-selected one (adding a member auto-selects it).
  await selectByTitle("Header · left");

  // ---- step 3: click selects, click again edits -------------------------
  const restRect = await rectOf(textBoxSel(textBoxId));
  await press(textBoxSel(textBoxId));
  const selAfter1 = await selectedRows();
  assertStep(3, "first click selects the TextBox", selAfter1.join() === textBoxId, selAfter1.join());
  await press(textBoxSel(textBoxId));
  await sleep(150);
  const hasControl = await evaluate(`!!document.querySelector(${JSON.stringify(controlSel(textBoxId))})`);
  assertStep(3, "second click mounts the editing control", hasControl, hasControl);
  const isActive = await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(controlSel(textBoxId))})`);
  assertStep(3, "the control is document.activeElement", isActive, isActive);
  const controlRect = hasControl ? await rectOf(controlSel(textBoxId)) : null;
  const boxMatch = controlRect && Math.abs(controlRect.top - restRect.top) <= 1 && Math.abs(controlRect.left - restRect.left) <= 1 && Math.abs(controlRect.h - restRect.h) <= 1;
  assertStep(
    3,
    "control's box matches the resting text's within 1px",
    boxMatch,
    controlRect ? `rest(${restRect.left.toFixed(1)},${restRect.top.toFixed(1)},h${restRect.h.toFixed(1)}) vs control(${controlRect.left.toFixed(1)},${controlRect.top.toFixed(1)},h${controlRect.h.toFixed(1)})` : "no control",
  );
  await screenshot(`${renderId}-2-editing`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 20 });

  // ---- step 4: type, commit, both surfaces read it -----------------------
  await typeText("Hello slot");
  const midValue = await evaluate(`document.querySelector(${JSON.stringify(controlSel(textBoxId))})?.value ?? null`);
  assertStep(4, "onChange write-through: control reads the typed value", midValue === "Hello slot", midValue);
  await key("Enter");
  await sleep(250);
  const controlGoneAfterCommit = !(await evaluate(`!!document.querySelector(${JSON.stringify(controlSel(textBoxId))})`));
  assertStep(4, "Enter committed: the input is gone", controlGoneAfterCommit, controlGoneAfterCommit);
  const restingAfterCommit = await restingText(textBoxId);
  assertStep(4, "resting text reads Hello slot", restingAfterCommit === "Hello slot", restingAfterCommit);
  const inspectorAfterCommit = await inspectorTextValue();
  assertStep(4, "inspector's Text field reads Hello slot", inspectorAfterCommit === "Hello slot", inspectorAfterCommit);
  await screenshot(`${renderId}-3-committed`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 20 });

  // ---- step 5: edit again, escape cancels ---------------------------------
  await press(textBoxSel(textBoxId)); // already sole-selected + inlineEdit -> this ONE press requests editing
  await sleep(150);
  const hasControl5 = await evaluate(`!!document.querySelector(${JSON.stringify(controlSel(textBoxId))})`);
  assertStep(5, "click again re-enters editing", hasControl5, hasControl5);
  // WHY "zzz" REPLACES "Hello slot" rather than appending: the spec's own
  // mount rule for a single-line control is select-all (the shadcn/OS
  // rename idiom) — typing over a fresh edit is meant to replace a short
  // label, not append to it. Escape must still restore the PRE-edit value.
  await typeText("zzz");
  const mid5 = await evaluate(`document.querySelector(${JSON.stringify(controlSel(textBoxId))})?.value ?? null`);
  assertStep(5, "single-line mount selects all: typing zzz replaces Hello slot", mid5 === "zzz", mid5);
  await key("Escape");
  await sleep(250);
  const restingAfterCancel = await restingText(textBoxId);
  assertStep(5, "Escape cancels: text is still Hello slot", restingAfterCancel === "Hello slot", restingAfterCancel);
  await screenshot(`${renderId}-4-cancelled`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 20 });

  // ---- step 6: lines -> multi, newline, ctrl+enter commits, two lines ----
  // Selection is still solely the TextBox (cancel ends editing, keeps
  // selection) — the inspector shows its scalar fields with no member-list
  // reveal needed (a leaf has no lists to fold). `lines`'s two options are
  // both raw tokens (value === label), which the panel's tier rule files
  // under Expert (same rule the tree-and-slots journey hits on Flex's
  // `justify`) — show Expert to reach it, as a person would.
  await evaluate(`Array.from(document.querySelectorAll('[data-slot="tier-button"]')).find(b => /expert/i.test(b.textContent))?.click()`);
  await sleep(200);
  const linesFieldVisible = await evaluate(`!!document.querySelector('[data-field="lines"]')`);
  assertStep(6, "Expert tier reveals the lines field", linesFieldVisible, linesFieldVisible);
  await evaluate(`(() => {
    const row = document.querySelector('[data-field="lines"]');
    if (!row) throw new Error("no lines field");
    const btn = Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === 'multi');
    if (!btn) throw new Error("no multi option");
    btn.click();
  })()`);
  await sleep(250);
  const linesNow = await evaluate(`document.querySelector(${JSON.stringify(textBoxSel(textBoxId))})?.getAttribute('data-lines')`);
  assertStep(6, "lines switched to multi", linesNow === "multi", linesNow);
  await press(textBoxSel(textBoxId)); // sole-selected + inlineEdit -> edits directly
  await sleep(150);
  const hasTextarea = await evaluate(`document.querySelector(${JSON.stringify(controlSel(textBoxId))})?.tagName`);
  assertStep(6, "editing control is now a textarea", hasTextarea === "TEXTAREA", hasTextarea);
  await typeText("a");
  await key("Enter"); // plain Enter on multi: native newline, not commit
  await typeText("b");
  const multiValue = await evaluate(`document.querySelector(${JSON.stringify(controlSel(textBoxId))})?.value ?? null`);
  assertStep(6, "plain Enter inserted a newline (textarea value has one)", typeof multiValue === "string" && multiValue.includes("\n"), JSON.stringify(multiValue));
  const controlStillThere = await evaluate(`!!document.querySelector(${JSON.stringify(controlSel(textBoxId))})`);
  assertStep(6, "plain Enter did not commit — still editing", controlStillThere, controlStillThere);
  const singleLineHeight = restRect.h;
  await key("Enter", { ctrl: true });
  await sleep(250);
  const controlGoneAfterCtrlEnter = !(await evaluate(`!!document.querySelector(${JSON.stringify(controlSel(textBoxId))})`));
  assertStep(6, "Ctrl+Enter committed: the textarea is gone", controlGoneAfterCtrlEnter, controlGoneAfterCtrlEnter);
  const restingMulti = await restingText(textBoxId);
  assertStep(6, "rendered text contains the newline", typeof restingMulti === "string" && restingMulti.includes("\n"), JSON.stringify(restingMulti));
  const multiRect = await rectOf(textBoxSel(textBoxId));
  assertStep(6, "rendered on two lines (taller than the single-line box)", multiRect.h > singleLineHeight + 4, `single ${singleLineHeight.toFixed(1)} vs now ${multiRect.h.toFixed(1)}`);
  await screenshot(`${renderId}-5-multiline`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(multiRect.top + multiRect.h - headerClip.top) + 20 });

  // ---- step 6b (verify round 1, F5): the DEFAULT inspector's own Text
  // field must be a real <textarea> for a "textarea" field, and a further
  // keystroke made THROUGH that control must not silently drop the
  // newline the canvas is currently showing (Zach's truthful-rendering
  // rule; the panel's `<input>` fallback used to sanitize it away). ------
  const inspectorTag = await inspectorTextControl();
  assertStep(6, "the Text field's control for kind=textarea is a TEXTAREA (spec §2)", inspectorTag === "TEXTAREA", inspectorTag);
  const inspectorMultiValue = await inspectorTextValue();
  assertStep(6, "inspector's Text field shows the newline", typeof inspectorMultiValue === "string" && inspectorMultiValue.includes("\n"), JSON.stringify(inspectorMultiValue));
  await click('[data-field="children"] textarea');
  await evaluate(`(() => { const el = document.querySelector('[data-field="children"] textarea'); el.setSelectionRange(el.value.length, el.value.length); })()`);
  await typeText("!");
  await sleep(200);
  const restingAfterInspectorKeystroke = await restingText(textBoxId);
  assertStep(
    6,
    "ONE keystroke in the inspector keeps the newline in the instance",
    typeof restingAfterInspectorKeystroke === "string" && restingAfterInspectorKeystroke.includes("\n"),
    JSON.stringify(restingAfterInspectorKeystroke),
  );

  // ---- step 7: reactflow/tldraw only — drag the resting text moves the node
  if (renderId !== "dom") {
    const nodeSel = renderId === "reactflow" ? `[data-slot="rf-instance"]` : `[data-slot="tl-instance"]`;

    // verify-round-1, F2's own repro (React Flow only — this is the
    // `noDragClassName`/`noPanClassName` class-collision bug, which has no
    // tldraw equivalent since tldraw's own gesture recognizer never gates
    // on those classes; tldraw's node geometry also isn't a reliable place
    // to find truly bare pixels, since its shape is a fixed 180×80
    // container around Block content that is natively larger and centers
    // past its edges): a drag starting on the node's BARE padding (no
    // member at all under the pointer) must still move the node — this is
    // what isolated the collision from anything member-specific, and it
    // must never regress silently back to "every drag is refused" the way
    // this file's ORIGINAL member-only check could not have caught on its
    // own (that check was ALSO broken by F3, a completely different bug,
    // at the same time — a false pass by accident of two bugs cancelling
    // out was never possible here only because both happened to point the
    // same way, not because either check was actually independent).
    if (renderId === "reactflow") {
      const nodeRectForPadding = await rectOf(nodeSel);
      const paddingPoint = { x: nodeRectForPadding.left + 6, y: nodeRectForPadding.top + 6 };
      await drag(paddingPoint, { x: paddingPoint.x + 80, y: paddingPoint.y }, 16, 60);
      const nodeAfterPaddingDrag = await rectOf(nodeSel);
      const paddingDx = nodeAfterPaddingDrag.left - nodeRectForPadding.left;
      assertStep(7, "dragging the node's own bare padding (no member) moved it ~80px", Math.abs(paddingDx - 80) <= 12, `dx=${paddingDx.toFixed(1)}`);
    }

    const nodeBefore = await rectOf(nodeSel);
    const textRect = await rectOf(textBoxSel(textBoxId));
    await evaluate(`window.getSelection().removeAllRanges()`);
    await drag({ x: textRect.x, y: textRect.y }, { x: textRect.x + 80, y: textRect.y }, 20, 60);
    const nodeAfter = await rectOf(nodeSel);
    const dx = nodeAfter.left - nodeBefore.left;
    assertStep(7, "dragging the resting text moved the node ~80px", Math.abs(dx - 80) <= 12, `dx=${dx.toFixed(1)}`);
    const selectionText = await evaluate(`window.getSelection().toString()`);
    assertStep(7, "no text got selected by the drag", selectionText === "", JSON.stringify(selectionText));
    await screenshot(`${renderId}-6-dragged`);

    // verify-round-1, F3's own repro: a drag starting on a DIFFERENT,
    // NON-editable member (the still-empty "Header · center" slot's own
    // Flex placeholder) must ALSO move the node — F3's confirmed root
    // cause (the member wrapper's own `stopPropagation()`) was never
    // TextBox-specific, so a check scoped to only the editable member
    // could not have caught it, and could not catch its return either.
    const centerPlaceholderSel = `${nodeSel} [data-slot-label="Header · center"] [data-slot="flex-placeholder"]`;
    await waitFor(centerPlaceholderSel);
    const nodeBeforeMember = await rectOf(nodeSel);
    const placeholderRect = await rectOf(centerPlaceholderSel);
    await drag({ x: placeholderRect.x, y: placeholderRect.y }, { x: placeholderRect.x + 80, y: placeholderRect.y }, 16, 60);
    const nodeAfterMember = await rectOf(nodeSel);
    const memberDx = nodeAfterMember.left - nodeBeforeMember.left;
    assertStep(7, "dragging a DIFFERENT, non-editable member (Header · center placeholder) moved the node ~80px", Math.abs(memberDx - 80) <= 12, `dx=${memberDx.toFixed(1)}`);
  }

  manifest.renders[renderId] = { console: takeConsole() };
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ results, renders: manifest.renders }, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} assertions across ${RENDERS.length} renders → ${outDir}`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  [${f.render}] step ${f.step} — ${f.name}: ${f.detail}`);
}
process.exit(failed.length === 0 ? 0 : 1);
