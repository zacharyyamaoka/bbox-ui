#!/usr/bin/env node
/**
 * Drives bbox-ui.com/create in headless Chrome over raw CDP and proves
 * `CodeBlock` end to end (packages/bbox-ui/src/codeBlock.tsx — the one
 * primitive for both the canvas Code block and the one-line code field),
 * for each of the three renders (DOM, React Flow, tldraw):
 *
 *  1. pick the Block bench, select the Header's Left slot fill via the
 *     navigator, add a CodeBlock to it through the Members control; it
 *     renders inside the header Bar with `data-look="block"`, a real
 *     `.cm-gutters` child, and at rest `data-editing="false"` with no
 *     `bbox-interactive` class;
 *  2. click it → selected; click again → editing: `data-editing="true"`,
 *     `bbox-interactive` class present, `document.activeElement` inside
 *     the block's own `.cm-content`;
 *  3. type "x = 1", Ctrl+Enter (this block is `lines="multi"` by default —
 *     the `look="block"` preset — so only the modifier form commits) →
 *     `data-editing="false"`, the committed text contains "x = 1" both on
 *     the resting block AND the inspector's own Code field;
 *  4. click again, type "zzz", Escape → the text no longer contains "zzz"
 *     (cancel restores the step-3 committed value) and `data-editing`
 *     is back to "false";
 *  5. in the inspector, flip Look → field → `data-look="field"` and the
 *     `.cm-gutters` child is gone;
 *  6. reactflow/tldraw only: press the resting (non-editing) block and
 *     drag 80px → the node moved, no text got selected.
 *
 * Every assertion reads the real DOM (getBoundingClientRect, textContent,
 * a control's own attributes, document.activeElement) — never a
 * screenshot's own claim. Screenshots are additional evidence. Never types
 * the headless browser binary's name directly in a Bash command — this
 * file is invoked from Node, same idiom as demos/capture-text-box-editing.mjs.
 *
 * Usage: node demos/capture-code-block.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-code-block.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(outDir, "hero"), { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-cb-"));
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
async function drag(from, to, steps = 20, holdMs = 60) {
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
// action when the event carries a `text` payload (capture-text-box-editing.mjs's
// own finding, confirmed empirically again here for Ctrl+Enter — omitting it
// produced a keydown CodeMirror's own handler never saw as a real commit).
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
 *  Input.insertText per key — fires a genuine `input` event, same idiom
 *  demos/capture-text-box-editing.mjs's `typeText` uses. */
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
let heroFrame = 0;
async function hero() {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, "hero", `${String(heroFrame++).padStart(3, "0")}.png`), Buffer.from(data, "base64"));
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

async function load(theme, component) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(500);
  await setSelect('[data-slot="component-picker"]', component);
  // A shorter timeout than `waitFor`'s own 30s default: if the bench
  // crashed on mount (see the known pre-existing bug this journey's own
  // report documents — packages/bbox-ui/src/portEdge.tsx's `cascadeInto`
  // corrupting a string `children` via `Children.map`/`cloneElement`,
  // triggered by a Port's label now being a plain string), Next's dev
  // overlay replaces the whole page and `instance-navigator` never
  // appears — no reason to burn 30s finding that out on every render.
  await waitFor('[data-slot="instance-navigator"]', 8000);
  await sleep(300);
  takeConsole();
}
const CANVAS_READY_SEL = { dom: '[data-slot="dom-instance"]', reactflow: '[data-slot="rf-instance"]', tldraw: '[data-slot="tl-instance"]' };
async function switchRender(id) {
  await click(`[data-slot="render-tab"][data-render="${id}"]`);
  await waitFor(CANVAS_READY_SEL[id]);
  await sleep(id === "dom" ? 150 : 700);
}
/** Selects a slot fill by walking a path of titles down the navigator's own
 *  flattened, pre-order rows — same idiom as
 *  demos/capture-text-box-editing.mjs's `selectByPath`. */
async function selectByPath(...titles) {
  const rows = await navRows();
  let scopeStart = 1;
  let scopeEnd = rows.length;
  let match = null;
  for (const title of titles) {
    const childDepth = rows[scopeStart]?.depth;
    match = null;
    for (let i = scopeStart; i < scopeEnd; i++) {
      const r = rows[i];
      if (r.depth < childDepth) break;
      if (r.depth === childDepth && r.title === title) {
        match = r;
        break;
      }
    }
    if (!match) {
      const already = titles.slice(0, titles.indexOf(title)).join(" > ") || "root";
      throw new Error(`no nav row titled "${title}" directly under [${already}] (have: ${rows.map((r) => `${"  ".repeat(r.depth)}${r.title}`).join(" | ")})`);
    }
    const matchIdx = rows.indexOf(match);
    let nextEnd = matchIdx + 1;
    while (nextEnd < scopeEnd && rows[nextEnd].depth > match.depth) nextEnd++;
    scopeStart = matchIdx + 1;
    scopeEnd = nextEnd;
  }
  await press(rowSel(match.id));
  return match.id;
}
async function allInstanceIds() {
  return (await navRows()).map((r) => r.id);
}
/** WHY the selector changed from `[data-slot="inline-list-row"]` (the
 *  demos/capture-text-box-editing.mjs-era "inline" inspector layout,
 *  apps/docs/src/components/create/inspector-layout/InlineRows.tsx — now
 *  dead code on the live page; inspector-column.tsx's own doc, 2026-09-12:
 *  "no inspector design picker at the foot of this column any more...
 *  Zach picked P1"): a bare Flex slot fill with nothing but a members list
 *  gets ONE top-level SECTION titled "Members" (`packages/panel/src/
 *  sections/shared.tsx`'s `SectionBlock`, `emphasis="section"`), not a
 *  `ListBlock` row nested under a scalar-fields section — confirmed live,
 *  `data-slot="inspector-section" data-section="members"` wraps a
 *  `[data-slot="fold-toggle"]` that starts `aria-expanded="false"`, and the
 *  add-member control only mounts once that SECTION opens (unlike
 *  `ListBlock`'s own count-0 "never folded" rule, which applies to a list
 *  ROW inside an already-open section, not a section that is itself the
 *  members list). */
async function reveal() {
  await evaluate(`(() => { const closed = document.querySelectorAll('[data-slot="fold-toggle"][aria-expanded="false"]'); closed.forEach(b => b.click()); return closed.length; })()`);
  await sleep(300);
}
/** Add `type` to the currently-selected subject's (only) members list via
 *  the Members control's own `[data-slot="add-member-trigger"]` — same
 *  idiom as capture-text-box-editing.mjs's `addTextBox`, generalized to any
 *  member type, updated for the current section-level fold (see `reveal`'s
 *  own WHY, just above). */
async function addMember(type) {
  const hasTrigger = await evaluate(`!!document.querySelector('[data-slot="add-member-trigger"]')`);
  if (!hasTrigger) throw new Error("no add-member-trigger for the selected slot fill");
  await evaluate(`document.querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(150);
  const sel = `[data-slot="add-member-type"][data-type="${type}"]`;
  const hasMenuItem = await evaluate(`!!document.querySelector(${JSON.stringify(sel)})`);
  if (hasMenuItem) await evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
  await sleep(250);
}
async function addMemberAndGetId(type) {
  const before = new Set(await allInstanceIds());
  await addMember(type);
  const after = await navRows();
  const created = after.filter((r) => !before.has(r.id));
  if (created.length !== 1) throw new Error(`expected exactly one new nav row after addMember(${type}), got ${JSON.stringify(created)}`);
  return created[0];
}

/** The instance the resting block currently shows, however it is nested —
 *  member-instance wraps every non-root instance, `display: contents`, so
 *  its own rect is meaningless; the box under it is the real element. */
const codeBlockSel = (id) => `[data-slot="member-instance"][data-instance-id="${id}"] [data-slot="code-block"]`;
const cmContentSel = (id) => `${codeBlockSel(id)} .cm-content`;
const restingText = (id) => evaluate(`document.querySelector(${JSON.stringify(cmContentSel(id))})?.textContent ?? null`);
const isEditingAttr = (id) => evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(id))})?.getAttribute('data-editing') ?? null`);
const hasInteractiveClass = (id) => evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(id))})?.classList.contains('bbox-interactive') ?? null`);

/** Best-effort opens whatever affordance the current inspector variant
 *  hides a tier-gated field behind, then reports whether the field's own
 *  row is now visible — capture-text-box-editing.mjs's `revealChildrenControl`,
 *  generalized to any field id (this journey's own "value" field is tier
 *  "simple" and should never actually need this, but the spec asks for the
 *  same defensive reveal in case a tier gate ever hides it). */
async function revealField(fieldId) {
  let visible = await evaluate(`!!document.querySelector('[data-field="${fieldId}"]')`);
  if (visible) return true;
  await evaluate(`Array.from(document.querySelectorAll('[data-slot="tier-button"]')).find(b => /expert/i.test(b.textContent))?.click()`);
  await sleep(150);
  visible = await evaluate(`!!document.querySelector('[data-field="${fieldId}"]')`);
  if (!visible) {
    await evaluate(`document.querySelector('[data-field="${fieldId}"] button')?.click()`);
    await sleep(200);
    visible = await evaluate(`!!document.querySelector('[data-field="${fieldId}"]')`);
  }
  return visible;
}
/** Clicks the segmented-control option with the given visible label inside
 *  `[data-field="<fieldId>"]` — the panel's own segments control renders
 *  `option.label` as the button's text (FieldTraceRow.tsx), never the raw
 *  value token, unlike TextBox's `lines` field. */
async function clickSegmentOption(fieldId, label) {
  await evaluate(`(() => {
    const row = document.querySelector('[data-field="${fieldId}"]');
    if (!row) throw new Error("no ${fieldId} field");
    const btn = Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!btn) throw new Error("no ${fieldId} option labelled ${label}");
    btn.click();
  })()`);
  await sleep(250);
}

const RENDERS = ["dom", "reactflow", "tldraw"];
const manifest = { renders: {} };

for (const renderId of RENDERS) {
  currentRender = renderId;
  console.log(`\n=== ${renderId} ===`);
  try {
  await load("dark", "Block");
  await switchRender(renderId);

  // ---- step 1: add a CodeBlock to the Header's Left slot -----------------
  const flexId = await selectByPath("Header", "Left");
  assertStep(1, "selected the Header's Left slot fill", (await selectedRows()).join() === flexId, flexId);
  await reveal();
  const newRow = await addMemberAndGetId("CodeBlock");
  const codeBlockId = newRow.id;
  assertStep(1, "adding a CodeBlock creates exactly one new instance", !!newRow, codeBlockId);
  assertStep(1, "the new instance is a CodeBlock", newRow.type === "CodeBlock", newRow.type);
  const selAfterAdd = await selectedRows();
  assertStep(1, "adding a member leaves the slot fill selected ('Add stays put' policy), not the new child", selAfterAdd.join() === flexId, selAfterAdd.join());

  const HEADER_BAR_SEL = '[data-slot="bar"][data-edge="bottom"]';
  const inHeaderSelector = `${HEADER_BAR_SEL} ${codeBlockSel(codeBlockId)}`;
  await waitFor(inHeaderSelector);
  const inHeader = await evaluate(`!!document.querySelector(${JSON.stringify(inHeaderSelector)})`);
  assertStep(1, "CodeBlock renders inside the header Bar [data-slot=bar][data-edge=bottom]", inHeader, inHeader);
  const dataLook = await evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))})?.getAttribute('data-look')`);
  assertStep(1, "default look is 'block'", dataLook === "block", dataLook);
  const hasGutters = await evaluate(`!!document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-gutters")})`);
  assertStep(1, "the 'block' look renders a real .cm-gutters child", hasGutters, hasGutters);
  const restEditingAttr = await isEditingAttr(codeBlockId);
  assertStep(1, "at rest, data-editing is 'false'", restEditingAttr === "false", restEditingAttr);
  const restInteractive = await hasInteractiveClass(codeBlockId);
  assertStep(1, "at rest, the block does NOT carry class bbox-interactive", restInteractive === false, restInteractive);
  const headerClip = await rectOf(HEADER_BAR_SEL);
  await screenshot(`${renderId}-1-added`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 40 });

  // ---- step 2: click selects, click again edits ---------------------------
  const isHero = renderId === "tldraw";
  if (isHero) await hero(); // frame: resting, not yet selected

  await press(codeBlockSel(codeBlockId));
  const selAfter1 = await selectedRows();
  assertStep(2, "first click selects the CodeBlock", selAfter1.join() === codeBlockId, selAfter1.join());
  if (isHero) await hero(); // frame: selected, not yet editing

  await press(codeBlockSel(codeBlockId));
  await sleep(150);
  const editingAfter2 = await isEditingAttr(codeBlockId);
  assertStep(2, "second click enters editing: data-editing is 'true'", editingAfter2 === "true", editingAfter2);
  const interactiveAfter2 = await hasInteractiveClass(codeBlockId);
  assertStep(2, "second click adds class bbox-interactive", interactiveAfter2 === true, interactiveAfter2);
  const activeInContent = await evaluate(`(() => {
    const content = document.querySelector(${JSON.stringify(cmContentSel(codeBlockId))});
    return !!content && document.activeElement === content;
  })()`);
  assertStep(2, "document.activeElement is the block's own .cm-content", activeInContent, activeInContent);
  await screenshot(`${renderId}-2-editing`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 40 });
  if (isHero) {
    await hero(); // frame: second click just landed, editing, focused, still the default value
    await hero(); // held a beat longer so the GIF doesn't blink past "editing started"
  }

  // ---- step 3: type, Ctrl+Enter commits, both surfaces read it ------------
  if (isHero) {
    for (const ch of "x = 1") {
      await send("Input.insertText", { text: ch });
      await sleep(35);
      await hero();
    }
  } else {
    await typeText("x = 1");
  }
  const midText = await restingText(codeBlockId);
  assertStep(3, "onWrite write-through: the live document reads the typed text", typeof midText === "string" && midText.includes("x = 1"), midText);
  if (isHero) await hero(); // frame: fully typed, still editing, held before Ctrl+Enter
  await key("Enter", { ctrl: true });
  await sleep(250);
  const editingAfterCommit = await isEditingAttr(codeBlockId);
  assertStep(3, "Ctrl+Enter committed: data-editing is back to 'false'", editingAfterCommit === "false", editingAfterCommit);
  if (isHero) {
    await hero(); // frame: committed, resting block reads x = 1
    await hero();
    await hero(); // held longest — the clip's resting end state
  }
  const restingAfterCommit = await restingText(codeBlockId);
  assertStep(3, "resting block's .cm-content contains 'x = 1'", typeof restingAfterCommit === "string" && restingAfterCommit.includes("x = 1"), restingAfterCommit);
  const inspectorValueField = await revealField("value");
  assertStep(3, "inspector's Code field ([data-field=value]) is visible", inspectorValueField, inspectorValueField);
  const inspectorValueAfterCommit = await evaluate(`document.querySelector('[data-field="value"] textarea')?.value ?? null`);
  assertStep(3, "inspector's Code field contains 'x = 1'", typeof inspectorValueAfterCommit === "string" && inspectorValueAfterCommit.includes("x = 1"), inspectorValueAfterCommit);
  await screenshot(`${renderId}-3-committed`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 40 });

  // ---- step 4: click again, Escape cancels ---------------------------------
  await press(codeBlockSel(codeBlockId)); // already sole-selected + inlineEdit -> this ONE press requests editing
  await sleep(150);
  const editingAfter4click = await isEditingAttr(codeBlockId);
  assertStep(4, "click again re-enters editing", editingAfter4click === "true", editingAfter4click);
  await typeText("zzz");
  const midText4 = await restingText(codeBlockId);
  assertStep(4, "typed zzz is live in the document", typeof midText4 === "string" && midText4.includes("zzz"), midText4);
  await key("Escape");
  await sleep(250);
  const editingAfterCancel = await isEditingAttr(codeBlockId);
  assertStep(4, "Escape ends editing: data-editing is 'false'", editingAfterCancel === "false", editingAfterCancel);
  const restingAfterCancel = await restingText(codeBlockId);
  assertStep(
    4,
    "Escape cancels: the text no longer contains zzz (restored to the step-3 committed value)",
    typeof restingAfterCancel === "string" && !restingAfterCancel.includes("zzz"),
    restingAfterCancel,
  );
  await screenshot(`${renderId}-4-cancelled`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 40 });

  // ---- step 5: inspector Look -> field -------------------------------------
  const lookFieldVisible = await revealField("look");
  assertStep(5, "the Look field is visible in the inspector", lookFieldVisible, lookFieldVisible);
  await clickSegmentOption("look", "Field");
  await sleep(250);
  const lookAfter = await evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))})?.getAttribute('data-look')`);
  assertStep(5, "data-look switched to 'field'", lookAfter === "field", lookAfter);
  const guttersAfter = await evaluate(`!!document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-gutters")})`);
  assertStep(5, ".cm-gutters is gone once look is 'field'", !guttersAfter, guttersAfter);
  const fieldClip = await rectOf(HEADER_BAR_SEL);
  await screenshot(`${renderId}-5-look-field`, { left: Math.floor(fieldClip.left) - 10, top: Math.floor(fieldClip.top) - 10, w: Math.ceil(fieldClip.w) + 20, h: Math.ceil(fieldClip.h) + 40 });

  // ---- step 6: reactflow/tldraw only — drag the resting block moves the node
  if (renderId !== "dom") {
    const nodeSel = renderId === "reactflow" ? `[data-slot="rf-instance"]` : `[data-slot="tl-instance"]`;
    const restingEditing = await isEditingAttr(codeBlockId);
    assertStep(6, "the block is at rest (not editing) before the drag", restingEditing === "false", restingEditing);
    const nodeBefore = await rectOf(nodeSel);
    const blockRect = await rectOf(codeBlockSel(codeBlockId));
    await evaluate(`window.getSelection().removeAllRanges()`);
    await drag({ x: blockRect.x, y: blockRect.y }, { x: blockRect.x + 80, y: blockRect.y }, 20, 60);
    const nodeAfter = await rectOf(nodeSel);
    const dx = nodeAfter.left - nodeBefore.left;
    assertStep(6, "dragging the resting block moved the node (>= 60px)", Math.abs(dx) >= 60, `dx=${dx.toFixed(1)}`);
    const selectionText = await evaluate(`window.getSelection().toString()`);
    assertStep(6, "no text got selected by the drag", selectionText === "", JSON.stringify(selectionText));
    await screenshot(`${renderId}-6-dragged`);
  }

  manifest.renders[renderId] = { console: takeConsole() };
  } catch (err) {
    // A crash on THIS render (e.g. the page's own error overlay replacing
    // the DOM — see the pre-existing `cascadeInto` bug this journey's own
    // report documents) must not take down the other two renders' runs.
    // Record it as one failing step, with the real page console/exception
    // text (already captured by the Runtime listener above) as the detail,
    // screenshot whatever is on screen, and move on.
    const consoleAtCrash = takeConsole();
    assertStep(0, "render crashed before the journey could run", false, `${err.message} | console: ${consoleAtCrash.join(" || ") || "(none captured)"}`);
    try {
      await screenshot(`${renderId}-CRASHED`);
    } catch {}
    manifest.renders[renderId] = { console: consoleAtCrash, crashed: String(err) };
  }
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ results, renders: manifest.renders }, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} assertions across ${RENDERS.length} renders, ${heroFrame} hero frames → ${outDir}`);
if (failed.length) {
  console.log("Failures:");
  for (const f of failed) console.log(`  [${f.render}] step ${f.step} — ${f.name}: ${f.detail}`);
}
process.exit(failed.length === 0 ? 0 : 1);
