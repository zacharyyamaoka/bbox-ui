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
 *  7. (round 2) highlighting: back on `look="block"` holding the pristine
 *     Python default, a real `.tok-definitionKeyword`/`.tok-keyword` span
 *     paints in a different colour than the plain `.cm-content` text, at
 *     font-weight 600 — `codeBlock.css`'s new `tok-*` palette, proven live
 *     on /create (Zach's own report: no colours there).
 *  8. (round 2) overflow: a long single line, then the inspector's
 *     `overflow` field driven through Scroll → Wrap → Grow → Clip —
 *     `data-overflow`, `.cm-scroller` scroll geometry, `.cm-content.cm-
 *     lineWrapping`, and the block's own bounding width each checked
 *     against what that specific mode's own CSS/JS promises.
 *  9. (round 2) expand: the ⤢ button opens `BenchCodeBlock`'s overlay
 *     (`packages/panel/src/bench.tsx`) bound to the SAME instance value;
 *     typing there reaches both the small block and the inspector; Escape
 *     closes it without discarding the edit; a press on the button at rest
 *     never starts a host drag (reactflow/tldraw).
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
/** Polls a selector's presence rather than a single check — used for a
 *  genuinely transient inspector state (round 2: reactflow's own inspector
 *  can sit mid-resync for a beat right after a drag, `[data-field="look"]`
 *  briefly absent even though it is tier "simple" and normally always
 *  present) — never silently proceeds into a click that would throw
 *  "no <field> field" against a DOM that just hadn't settled yet. */
async function waitForField(fieldId, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`!!document.querySelector('[data-field="${fieldId}"]')`)) return true;
    await sleep(150);
  }
  return false;
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
/** Writes directly into a textarea-kind inspector field via the native
 *  value setter + a real `input` event — same idiom `setSelect` uses for a
 *  `<select>`, generalized to `<textarea>` for round 2's step 7/8 (setting
 *  the Code field's value without going through the block's own editing
 *  gesture at all — a real, independent write path a person also has). */
async function setInspectorTextarea(fieldId, text) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-field="${fieldId}"] textarea');
    if (!el) throw new Error("no textarea for ${fieldId}");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await sleep(250);
}
/** Writes an inspector number field (e.g. Width/`columns`) via its own
 *  native value setter + input/change events — round 3's own idiom,
 *  parallel to `setInspectorTextarea`. */
async function setInspectorNumber(fieldId, value) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-field="${fieldId}"] input[type="number"]');
    if (!el) throw new Error("no number input for ${fieldId}");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(250);
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
 *  value token, unlike TextBox's `lines` field.
 *
 *  WHY the two-branch dispatch: `FieldTraceRow.tsx`'s own
 *  `SEGMENT_MENU_THRESHOLD` is 2 — a field with MORE than two options (e.g.
 *  `overflow`'s four: Clip/Wrap/Scroll/Grow) renders as an `OptionMenu`
 *  dropdown (`[data-slot="option-menu-trigger"]` + a `role="listbox"`
 *  popup), not inline buttons; `look`'s two options (Block/Field) stay
 *  inline. Both branches are driven through the real control a person
 *  clicks — never a value set directly. */
async function clickSegmentOption(fieldId, label) {
  // WHY the two-branch dispatch, and WHY `named-dropdown` and not
  // `FieldTraceRow.tsx`'s `OptionMenu` (this journey's own round-1 guess):
  // confirmed live (round 2) that /create's real live panel variant is
  // `packages/panel/src/variants/FigmaDense.tsx` — its own segments-vs-
  // dropdown split is `options.length <= 3 && stripWidth <= SEGMENT_CHAR_
  // BUDGET` inline buttons, else `NamedDropdown` (`[data-slot="named-
  // dropdown-trigger"]` + a `position:fixed`, non-portalled `[data-slot=
  // "named-dropdown-menu"]` of `[data-slot="named-dropdown-row"]` buttons).
  // `look` (2 options) stays inline; `overflow` (4 options) is a dropdown.
  // `FieldTraceRow.tsx`'s `OptionMenu`/`SEGMENT_MENU_THRESHOLD` is dead
  // code on the live page — never actually rendered, confirmed by a live
  // DOM probe finding zero `[data-slot="option-menu"]` anywhere.
  const isDropdown = await evaluate(`!!document.querySelector('[data-field="${fieldId}"] [data-slot="named-dropdown-trigger"]')`);
  if (isDropdown) {
    await evaluate(`document.querySelector('[data-field="${fieldId}"] [data-slot="named-dropdown-trigger"]').click()`);
    await sleep(200);
    await evaluate(`(() => {
      const menu = document.querySelector('[data-field="${fieldId}"] [data-slot="named-dropdown-menu"]');
      if (!menu) throw new Error("no named-dropdown-menu popup for ${fieldId}");
      // WHY replace(/^\\u2713/, "") before startsWith, not a bare includes():
      // the active row's own tick mark ("\\u2713Scrollscroll" — NamedDropdown's
      // label span and lowercase sublabel span render with no separator in
      // textContent) would otherwise need a substring match loose enough to
      // risk one option's sublabel matching a DIFFERENT option's label.
      const btn = Array.from(menu.querySelectorAll('[data-slot="named-dropdown-row"]')).find(b => b.textContent.trim().replace(/^\\u2713/, "").startsWith(${JSON.stringify(label)}));
      if (!btn) throw new Error("no ${fieldId} option labelled ${label}");
      btn.click();
    })()`);
    await sleep(250);
    return;
  }
  await evaluate(`(() => {
    const row = document.querySelector('[data-field="${fieldId}"]');
    if (!row) throw new Error("no ${fieldId} field");
    const btn = Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!btn) throw new Error("no ${fieldId} option labelled ${label}");
    btn.click();
  })()`);
  await sleep(250);
}

// Mirrors codeBlock.fields.ts's own CODE_BLOCK_DEFAULT_VALUE verbatim —
// the pristine specimen step 7's highlighting check resets the value to.
const CODE_BLOCK_DEFAULT_VALUE = `def greet(name: str) -> str:\n    return f"Hello, {name}!"`;
// Round 3 (2026-09-15) samples — mirrors the Storybook stories' own values.
const FLATTEN_SAMPLE = 'pose: Pose = {\n  "x": 1,\n  "y": 2\n}\nsamples: int = 3';
const GROW_TRUNCATED_SAMPLE = [
  "first_line_that_is_genuinely_long_enough_to_need_folding_here = 1",
  "short",
  "third_line_that_is_also_long_enough_to_need_folding_here_too = 3",
].join("\n");

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

    // ---- round-2 finding: on React Flow only, dragging a MEMBER's node
    // reassigns the page's own selection to its PARENT (the Block) — tldraw
    // keeps the member itself selected through the identical gesture. This
    // is a real, measured product difference between the two host
    // adapters, reported here rather than silently worked around — then
    // the CodeBlock is re-selected (an ordinary follow-up click) so steps
    // 7-9 can keep testing the SAME instance on every render alike.
    const selAfterDrag = await selectedRows();
    const keptSelection = selAfterDrag.join() === codeBlockId;
    assertStep(
      6,
      `${renderId}: dragging the member's node preserves ITS OWN selection (not just its parent's)`,
      keptSelection,
      `selected after drag: [${selAfterDrag.join(",")}] (want [${codeBlockId}])`,
    );
    if (!keptSelection) {
      await press(rowSel(codeBlockId));
      await sleep(200);
    }
  }

  // ---- step 7: highlighting — a real tok-* palette, not just class names -
  // A settle beat before touching the inspector again: on reactflow, step
  // 6's drag can leave the inspector mid-resync for a moment (a transient
  // "no look field" was observed here without it) — poll rather than a
  // flat sleep, so this never races a genuinely slow re-render.
  const lookSettled = await waitForField("look");
  assertStep(7, "the Look field settles back after step 6's drag", lookSettled, lookSettled);
  await clickSegmentOption("look", "Block");
  await sleep(200);
  const valueFieldVisible7 = await revealField("value");
  assertStep(7, "inspector Code field is visible", valueFieldVisible7, valueFieldVisible7);
  await setInspectorTextarea("value", CODE_BLOCK_DEFAULT_VALUE);
  const restingDefault = await restingText(codeBlockId);
  assertStep(7, "resting block holds the pristine Python default", typeof restingDefault === "string" && restingDefault.includes("def greet"), restingDefault);
  const highlight = await evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))});
    const kw = box?.querySelector('.tok-definitionKeyword, .tok-keyword');
    const content = box?.querySelector('.cm-content');
    if (!kw || !content) return null;
    const kwStyle = getComputedStyle(kw);
    return { kwColor: kwStyle.color, kwWeight: kwStyle.fontWeight, contentColor: getComputedStyle(content).color };
  })()`);
  assertStep(7, "a keyword span (.tok-definitionKeyword/.tok-keyword) exists in the block", !!highlight, JSON.stringify(highlight));
  assertStep(7, "the keyword's colour differs from the plain .cm-content colour", !!highlight && highlight.kwColor !== highlight.contentColor, JSON.stringify(highlight));
  assertStep(7, "the keyword's font-weight is 600", !!highlight && highlight.kwWeight === "600", highlight?.kwWeight);
  await screenshot(`${renderId}-7-highlighting`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 60 });

  // ---- step 8: overflow — Scroll -> Wrap -> Grow -> Clip -----------------
  const LONG_LINE = "x_very_long_identifier_that_does_not_fit_the_box_at_all_whatsoever = some_long_function_call(a, b, c, d, e)";
  await setInspectorTextarea("value", LONG_LINE);
  const overflowFieldVisible = await revealField("overflow");
  assertStep(8, "the Overflow field is visible in the inspector", overflowFieldVisible, overflowFieldVisible);
  const overflowGeom = () =>
    evaluate(`(() => {
      const box = document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))});
      const scroller = box?.querySelector('.cm-scroller');
      const content = box?.querySelector('.cm-content');
      if (!box || !scroller || !content) return null;
      const cs = getComputedStyle(scroller);
      return {
        dataOverflow: box.getAttribute('data-overflow'),
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        overflowX: cs.overflowX,
        overflow: cs.overflow,
        hasLineWrapping: content.classList.contains('cm-lineWrapping'),
        contentHeight: content.getBoundingClientRect().height,
        lineHeightPx: parseFloat(cs.lineHeight) || 0,
        blockWidth: box.getBoundingClientRect().width,
      };
    })()`);

  await clickSegmentOption("overflow", "Scroll");
  const geomScroll = await overflowGeom();
  assertStep(8, "Scroll: data-overflow is 'scroll'", geomScroll?.dataOverflow === "scroll", JSON.stringify(geomScroll));
  assertStep(8, "Scroll: .cm-scroller scrollWidth > clientWidth", !!geomScroll && geomScroll.scrollWidth > geomScroll.clientWidth, JSON.stringify(geomScroll));
  assertStep(8, "Scroll: computed overflow-x is auto/scroll", !!geomScroll && /auto|scroll/.test(geomScroll.overflowX), geomScroll?.overflowX);
  await screenshot(`${renderId}-8a-overflow-scroll`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 60 });

  await clickSegmentOption("overflow", "Wrap");
  const geomWrap = await overflowGeom();
  assertStep(8, "Wrap: data-overflow is 'wrap'", geomWrap?.dataOverflow === "wrap", JSON.stringify(geomWrap));
  assertStep(8, "Wrap: .cm-content carries class cm-lineWrapping", !!geomWrap && geomWrap.hasLineWrapping, JSON.stringify(geomWrap));
  assertStep(
    8,
    "Wrap: .cm-content is taller than one line (the long line actually wrapped)",
    !!geomWrap && geomWrap.lineHeightPx > 0 && geomWrap.contentHeight > geomWrap.lineHeightPx * 1.4,
    JSON.stringify(geomWrap),
  );
  await screenshot(`${renderId}-8b-overflow-wrap`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil((geomWrap?.contentHeight ?? 40) + headerClip.h) + 60 });

  await clickSegmentOption("overflow", "Grow");
  const geomGrow = await overflowGeom();
  assertStep(8, "Grow: data-overflow is 'grow'", geomGrow?.dataOverflow === "grow", JSON.stringify(geomGrow));
  assertStep(
    8,
    "Grow: the block's own width is wider than it was under Scroll",
    !!geomGrow && !!geomScroll && geomGrow.blockWidth > geomScroll.blockWidth,
    `grow=${geomGrow?.blockWidth} scroll=${geomScroll?.blockWidth}`,
  );
  assertStep(8, "Grow: .cm-scroller no longer needs to scroll (scrollWidth <= clientWidth + 1)", !!geomGrow && geomGrow.scrollWidth <= geomGrow.clientWidth + 1, JSON.stringify(geomGrow));
  await screenshot(`${renderId}-8c-overflow-grow`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(Math.max(headerClip.w, geomGrow?.blockWidth ?? 0)) + 40, h: Math.ceil(headerClip.h) + 60 });

  await clickSegmentOption("overflow", "Clip");
  const geomClip = await overflowGeom();
  assertStep(8, "Clip: data-overflow is 'clip'", geomClip?.dataOverflow === "clip", JSON.stringify(geomClip));
  assertStep(8, "Clip: computed overflow is hidden on .cm-scroller", !!geomClip && /hidden/.test(geomClip.overflow || geomClip.overflowX), JSON.stringify(geomClip));
  await screenshot(`${renderId}-8d-overflow-clip`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 60 });

  // ---- step 9: expand — the ⤢ button opens BenchCodeBlock's overlay ------
  const expandBtnSel = `${codeBlockSel(codeBlockId)} [data-slot="code-block-expand"]`;
  const hasExpandBtn = await evaluate(`!!document.querySelector(${JSON.stringify(expandBtnSel)})`);
  assertStep(9, "the block has an expand (⤤) button", hasExpandBtn, hasExpandBtn);

  let nodeBeforeExpandPress = null;
  const nodeSel9 = renderId === "reactflow" ? `[data-slot="rf-instance"]` : renderId === "tldraw" ? `[data-slot="tl-instance"]` : null;
  if (nodeSel9 && hasExpandBtn) nodeBeforeExpandPress = await rectOf(nodeSel9);

  if (hasExpandBtn) await press(expandBtnSel);
  await sleep(200);

  if (nodeSel9 && nodeBeforeExpandPress) {
    const nodeAfterExpandPress = await rectOf(nodeSel9);
    const nodeDx = Math.abs(nodeAfterExpandPress.left - nodeBeforeExpandPress.left);
    assertStep(9, "pressing the expand button at rest does not start a host drag (node position unchanged)", nodeDx < 2, `dx=${nodeDx.toFixed(1)}`);
  }

  const EXPANDED_SEL = '[data-slot="code-block-expanded"]';
  const EXPANDED_CONTENT_SEL = `${EXPANDED_SEL} .cm-content`;
  const expandedOpen = await evaluate(`!!document.querySelector(${JSON.stringify(EXPANDED_SEL)})`);
  assertStep(9, "clicking expand opens [data-slot=code-block-expanded]", expandedOpen, expandedOpen);
  const expandedHasEditor = await evaluate(`!!document.querySelector('${EXPANDED_SEL} .cm-editor')`);
  assertStep(9, "the expanded overlay contains a real .cm-editor", expandedHasEditor, expandedHasEditor);
  const expandedFocused = await evaluate(`(() => {
    const content = document.querySelector(${JSON.stringify(EXPANDED_CONTENT_SEL)});
    return !!content && (document.activeElement === content || content.contains(document.activeElement));
  })()`);
  assertStep(9, "the overlay's .cm-content is (or contains) document.activeElement", expandedFocused, expandedFocused);

  await typeText(" # big");
  const smallAfterType = await restingText(codeBlockId);
  assertStep(9, "the small block's .cm-content now contains '# big'", typeof smallAfterType === "string" && smallAfterType.includes("# big"), smallAfterType);
  const inspectorAfterType = await evaluate(`document.querySelector('[data-field="value"] textarea')?.value ?? null`);
  assertStep(9, "the inspector's Code field also contains '# big'", typeof inspectorAfterType === "string" && inspectorAfterType.includes("# big"), inspectorAfterType);
  await screenshot(`${renderId}-9a-expanded`);

  await key("Escape");
  await sleep(300);
  const expandedGone = !(await evaluate(`!!document.querySelector(${JSON.stringify(EXPANDED_SEL)})`));
  assertStep(9, "Escape closes the overlay", expandedGone, expandedGone);
  const restingAfterClose = await restingText(codeBlockId);
  assertStep(9, "the value still contains '# big' after closing (not discarded)", typeof restingAfterClose === "string" && restingAfterClose.includes("# big"), restingAfterClose);
  await screenshot(`${renderId}-9b-closed`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 60 });

  // ---- step 10: flatten — one row per semantic unit ------------------------
  await setInspectorTextarea("value", FLATTEN_SAMPLE);
  const flattenFieldVisible = await revealField("flatten");
  assertStep(10, "the Flatten field is visible in the inspector", flattenFieldVisible, flattenFieldVisible);
  await evaluate(`document.querySelector('[data-field="flatten"] input[type="checkbox"]')?.click()`);
  await sleep(300);
  const dataFlattenOn = await evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))})?.getAttribute('data-flatten')`);
  assertStep(10, "data-flatten is 'true'", dataFlattenOn === "true", dataFlattenOn);
  const newlineWidgetsOn = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .bbox-code-block-newline")}).length`);
  assertStep(10, "3 .bbox-code-block-newline widgets (the unit's own inner newlines)", newlineWidgetsOn === 3, newlineWidgetsOn);
  const cmLineCountOn = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-line")}).length`);
  assertStep(10, "2 .cm-line elements (one row per semantic unit)", cmLineCountOn === 2, cmLineCountOn);
  const gutterTextsOn = await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-lineNumbers .cm-gutterElement")})).filter(el => el.offsetHeight > 0).map(el => el.textContent.trim())`);
  assertStep(10, "gutter reads ['1','2'] (unit numbers, not physical lines)", JSON.stringify(gutterTextsOn) === JSON.stringify(["1", "2"]), JSON.stringify(gutterTextsOn));
  await screenshot(`${renderId}-10a-flatten-on`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 60 });

  // Click into the block (already sole-selected -> one press edits), place
  // the caret beside the FIRST ⏎ widget, then Enter: a real newline INSIDE
  // the same unit.
  //
  // WHY widget index 0, and WHY no ArrowLeft (both deviate from a literal
  // "click the first ⏎, ArrowLeft once is fine" reading, per live
  // measurement, not guesswork):
  //  - Widget 1 (the one literally right after `"x": 1,`) sits at x=632.8
  //    against this block's own right edge at x=636 — 3px of margin, right
  //    at the block's overflow-clip boundary (`overflow` isn't set
  //    explicitly yet here, so it's still "block" look's own default,
  //    `scroll`) — a click that close to the clip edge landed
  //    inconsistently (measured: it deselected the whole CodeBlock back to
  //    its parent Block instead of placing a caret). Widget 0 sits safely
  //    inside the box (x=531.9) and is structurally just as good a target —
  //    ANY position inside the one bracket-balanced unit proves the same
  //    thing (Enter inside it adds a real newline without adding a row).
  //  - An ArrowLeft after landing on widget 0 moved the caret PAST the
  //    unit's own opening `{` entirely (measured: the resulting value read
  //    `"pose: Pose = \n{\n..."` — the newline landed BEFORE `{`, at
  //    bracket depth 0, splitting `pythonUnits` into 3 units instead of the
  //    intended 2). Clicking the widget directly (no ArrowLeft) reliably
  //    lands the caret INSIDE the bracketed unit — confirmed live, the
  //    resulting value reads `"pose: Pose = {\n  \n  \"x\": 1,\n..."`.
  await press(codeBlockSel(codeBlockId));
  await sleep(150);
  const widgetRect = await evaluate(`(() => {
    const w = document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .bbox-code-block-newline")})[0];
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (widgetRect) {
    await mouse("mouseMoved", widgetRect.x, widgetRect.y);
    await mouse("mousePressed", widgetRect.x, widgetRect.y);
    await sleep(30);
    await mouse("mouseReleased", widgetRect.x, widgetRect.y);
    await sleep(150);
  }
  await key("Enter");
  await sleep(200);
  const inspectorValueMidEdit = await evaluate(`document.querySelector('[data-field="value"] textarea')?.value ?? null`);
  const newlineCountMidEdit = typeof inspectorValueMidEdit === "string" ? (inspectorValueMidEdit.match(/\n/g) || []).length : -1;
  assertStep(10, "pressing Enter inside the unit adds one newline (inspector Code value has 5 total)", newlineCountMidEdit === 5, `${newlineCountMidEdit} newlines: ${JSON.stringify(inspectorValueMidEdit)}`);
  const cmLineCountMidEdit = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-line")}).length`);
  assertStep(10, "row count is still 2 (the new newline is another folded ⏎, not a new row)", cmLineCountMidEdit === 2, cmLineCountMidEdit);

  await key("Escape");
  await sleep(250);

  await evaluate(`document.querySelector('[data-field="flatten"] input[type="checkbox"]')?.click()`);
  await sleep(300);
  const dataFlattenOff = await evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))})?.getAttribute('data-flatten')`);
  assertStep(10, "data-flatten is back to 'false'", dataFlattenOff === "false", dataFlattenOff);
  const cmLineCountOff = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-line")}).length`);
  assertStep(10, "5 .cm-line elements with flatten off (the real physical lines)", cmLineCountOff === 5, cmLineCountOff);
  const gutterTextsOff = await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-lineNumbers .cm-gutterElement")})).filter(el => el.offsetHeight > 0).map(el => el.textContent.trim())`);
  assertStep(10, "gutter reads ['1'..'5'] with flatten off", JSON.stringify(gutterTextsOff) === JSON.stringify(["1", "2", "3", "4", "5"]), JSON.stringify(gutterTextsOff));
  await screenshot(`${renderId}-10b-flatten-off`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(headerClip.w) + 20, h: Math.ceil(headerClip.h) + 90 });

  // ---- step 11: overflow — grow-truncated -----------------------------------
  await setInspectorTextarea("value", GROW_TRUNCATED_SAMPLE);
  const widthFieldVisible = await revealField("columns");
  assertStep(11, "the Width field is visible in the inspector", widthFieldVisible, widthFieldVisible);
  await setInspectorNumber("columns", 24);
  const columnsNow = await evaluate(`document.querySelector('[data-field="columns"] input[type="number"]')?.value`);
  assertStep(11, "Width is set to 24", columnsNow === "24", columnsNow);

  await revealField("overflow");
  await clickSegmentOption("overflow", "Clip");
  const clipRect = await rectOf(codeBlockSel(codeBlockId));

  await clickSegmentOption("overflow", "Grow truncated");
  await sleep(300);
  const dataOverflowGT = await evaluate(`document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))})?.getAttribute('data-overflow')`);
  assertStep(11, "data-overflow is 'grow-truncated'", dataOverflowGT === "grow-truncated", dataOverflowGT);
  const ellipsisCountRest = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .bbox-code-block-ellipsis")}).length`);
  assertStep(11, "at least 2 .bbox-code-block-ellipsis widgets at rest", ellipsisCountRest >= 2, ellipsisCountRest);
  const growTruncRect = await rectOf(codeBlockSel(codeBlockId));
  assertStep(11, "the block is wider than under Clip", growTruncRect.w > clipRect.w, `grow-truncated=${growTruncRect.w.toFixed(1)} clip=${clipRect.w.toFixed(1)}`);
  await screenshot(`${renderId}-11a-grow-truncated-rest`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(Math.max(headerClip.w, growTruncRect.w)) + 40, h: Math.ceil(headerClip.h) + 90 });

  // Click to edit, then place the caret on line 1 (its own gutter row).
  // WHY a left-edge point, not press()'s own rect-center: under
  // grow-truncated the block's own bounding box (708-1112px measured) is far
  // wider than the header bar that clips it (~273-307px) — `grow`-family
  // overflow only widens the element's own box, it never reflows the host's
  // layout. A click at the geometric center lands outside the header's
  // visible/clipped region and hits whatever sits behind it (measured:
  // elementFromPoint returned an unrelated bare <span>, and the click
  // reselected the PARENT flex slot instead of editing the block). Click
  // near the box's own left edge instead — guaranteed inside the header's
  // clip, same idiom step 10's widget click and this step's own line1Rect
  // already use.
  // WHY the explicit editing+focus check: `foldInactiveLines` now gates its
  // caret exemption on the view being FOCUSED (foldFocusField, codeGrammar.ts),
  // not merely on where the selection sits. A stale "already selected" state
  // from the field interactions above is not enough — one press only edits
  // when the block is ALREADY the sole selection, so confirm it landed in
  // editing with real DOM focus, and press again if it only reselected.
  const editEntryPoint = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(codeBlockSel(codeBlockId))});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + 10, y: r.top + r.height / 2 };
  })()`);
  async function clickEditEntryPoint() {
    await mouse("mouseMoved", editEntryPoint.x, editEntryPoint.y);
    await mouse("mousePressed", editEntryPoint.x, editEntryPoint.y);
    await sleep(30);
    await mouse("mouseReleased", editEntryPoint.x, editEntryPoint.y);
    await sleep(200);
  }
  await clickEditEntryPoint();
  await sleep(150);
  let editingBeforeCaret = await isEditingAttr(codeBlockId);
  let focusedBeforeCaret = await evaluate(`(() => {
    const content = document.querySelector(${JSON.stringify(cmContentSel(codeBlockId))});
    return !!content && document.activeElement === content;
  })()`);
  if (editingBeforeCaret !== "true" || !focusedBeforeCaret) {
    await clickEditEntryPoint();
    await sleep(150);
    editingBeforeCaret = await isEditingAttr(codeBlockId);
    focusedBeforeCaret = await evaluate(`(() => {
      const content = document.querySelector(${JSON.stringify(cmContentSel(codeBlockId))});
      return !!content && document.activeElement === content;
    })()`);
  }
  assertStep(11, "the block is in editing state and focused before placing the caret", editingBeforeCaret === "true" && focusedBeforeCaret, `data-editing=${editingBeforeCaret} focused=${focusedBeforeCaret}`);
  const line1Rect = await evaluate(`(() => {
    const l = document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-line")})[0];
    if (!l) return null;
    const r = l.getBoundingClientRect();
    return { x: r.left + 5, y: r.top + r.height / 2 };
  })()`);
  if (line1Rect) {
    await mouse("mouseMoved", line1Rect.x, line1Rect.y);
    await mouse("mousePressed", line1Rect.x, line1Rect.y);
    await sleep(30);
    await mouse("mouseReleased", line1Rect.x, line1Rect.y);
    await sleep(250);
  }
  const ellipsisCountCaret = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .bbox-code-block-ellipsis")}).length`);
  assertStep(11, "ellipsis count dropped once the caret moved onto a folded line", ellipsisCountCaret < ellipsisCountRest, `rest=${ellipsisCountRest} caret=${ellipsisCountCaret}`);
  const line1Text = await evaluate(`document.querySelectorAll(${JSON.stringify(codeBlockSel(codeBlockId) + " .cm-line")})[0]?.textContent ?? null`);
  assertStep(11, "line 1's .cm-line textContent contains the full unfolded text", typeof line1Text === "string" && line1Text.includes("first_line_that_is_genuinely_long_enough_to_need_folding_here"), line1Text);
  await screenshot(`${renderId}-11b-grow-truncated-caret-line1`, { left: Math.floor(headerClip.left) - 10, top: Math.floor(headerClip.top) - 10, w: Math.ceil(Math.max(headerClip.w, growTruncRect.w)) + 40, h: Math.ceil(headerClip.h) + 90 });
  await key("Escape");
  await sleep(250);

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
