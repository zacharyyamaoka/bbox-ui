#!/usr/bin/env node
/**
 * Headless-Chrome smoke test for `CodeFieldDemo` (the floating panel) AND
 * the in-host mounts (`CodeFieldHostNode` in React Flow, `CodeFieldHostShapeUtil`
 * in tldraw) — same raw-CDP pattern as `demos/drive.mjs`, kept as a separate
 * script rather than folded into it: that script's assertions are about the
 * shared Block/Port scene and would need to know nothing about a component
 * with no `demos/scene` presence.
 *
 * Usage: node demos/drive-code-field.mjs <name> <url>
 *   e.g. node demos/drive-code-field.mjs reactflow http://127.0.0.1:5183
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , name, url] = process.argv;
if (!name || !url) {
  console.error("usage: node demos/drive-code-field.mjs <name> <url>");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "screenshots");
mkdirSync(shotDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-code-field-chrome-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1600,1000",
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
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
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
await send("Page.navigate", { url });

async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(expression);
    if (last) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for: ${expression} (last=${JSON.stringify(last)})`);
}

async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  })()`);
}

async function click(selector) {
  const rect = await rectOf(selector);
  if (!rect) throw new Error(`click target not found: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: rect.cx, y: rect.cy, button: "left", clickCount: 1 });
  }
  return rect;
}

/** Click the first element matching `selector` whose own textContent equals `text` — for the toggle's plain `<button>`s, which carry no stable class per state. */
async function clickByText(selector, text) {
  const rect = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`click target not found: ${selector} with text "${text}"`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
}

/** Click the Nth (0-based) element matching `selector`. */
async function clickNth(selector, index) {
  const rect = await evaluate(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`click target not found: ${selector}[${index}]`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
}

const MODIFIER = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

async function pressKey(key, { ctrl = false, code = key, windowsVirtualKeyCode } = {}) {
  const modifiers = ctrl ? MODIFIER.ctrl : 0;
  const base = { key, code, modifiers, windowsVirtualKeyCode };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function insertText(text) {
  await send("Input.insertText", { text });
}

/** Which `.cm-line` (0-based) the real DOM selection currently sits in, inside `fieldSelector`'s CodeMirror content — proves WHERE the caret landed, not just that source mode opened. */
async function caretLineIndex(fieldSelector) {
  return evaluate(`(() => {
    const content = document.querySelector(${JSON.stringify(fieldSelector)} + ' .cm-content');
    if (!content) return -1;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    let node = sel.anchorNode;
    while (node && node.parentElement && node.parentElement !== content) node = node.parentElement;
    const lines = [...content.querySelectorAll(':scope > .cm-line')];
    return lines.indexOf(node);
  })()`);
}

async function wheel(selector, deltaY) {
  const rect = await rectOf(selector);
  if (!rect) throw new Error(`wheel target not found: ${selector}`);
  await send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: rect.cx,
    y: rect.cy,
    deltaX: 0,
    deltaY,
  });
}

/** mousedown inside `selector`, drag by (dx, dy), mouseup — a text-drag gesture, not a click. */
async function dragFrom(selector, dx, dy) {
  const rect = await rectOf(selector);
  if (!rect) throw new Error(`drag target not found: ${selector}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.cx, y: rect.cy, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.cx + dx, y: rect.cy + dy, buttons: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.cx + dx, y: rect.cy + dy, button: "left" });
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

// ---------------------------------------------------------------------
// The floating demo panel
// ---------------------------------------------------------------------

await waitFor(`document.querySelector('[data-testid="code-field-demo"]') != null`);
await waitFor(`document.querySelector('[data-testid="code-field-attrs"] [data-slot="code-field-row"]') != null`);

const rowText = await evaluate(`document.querySelector('[data-testid="code-field-row"]').textContent`);
check(rowText.includes("pose") && rowText.includes("Pose") && rowText.includes("None"), `port row missing content: ${rowText}`);

const laneText = await evaluate(`document.querySelector('[data-testid="code-field-lane"]').textContent`);
check(laneText.includes("pose"), `port lane missing first line: ${laneText}`);
check(laneText.includes("window"), `port lane missing second line: ${laneText}`);

// Starts in rendered mode: a tree of rows, no live CodeMirror document.
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"][data-slot="code-field-rows"]') != null`),
  "attribute field did not start in rendered mode",
);
const renderedText = await evaluate(`document.querySelector('[data-testid="code-field-attrs"]').textContent`);
check(renderedText.includes("origin"), `rendered tree missing a row: ${renderedText}`);
check(renderedText.includes("Pose"), `rendered tree missing the reference segment: ${renderedText}`);

// The reference segment resolves ("Pose" is in the demo's known-type map,
// with an onJump) — it renders as a click target, not plain text.
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .bbox-code-ref[role="button"]') != null`),
  "resolved type reference did not render as a link",
);

// Clicking the reference itself fires `resolveReference(...).onJump`.
await click('[data-testid="code-field-attrs"] .bbox-code-ref[role="button"]');
await new Promise((r) => setTimeout(r, 150));
check(
  (await evaluate(`document.querySelector('[data-testid="code-field-jumped-to"]')?.textContent ?? ""`)).includes("Pose"),
  "clicking the resolved reference did not fire onJump",
);

// --- finding 2: expansion survives a Source -> UI round trip -----------

await click('[data-testid="code-field-attrs"] .bbox-code-field-chevron[role="button"]');
await new Promise((r) => setTimeout(r, 150));
check(
  await evaluate(`document.querySelectorAll('[data-testid="code-field-attrs"] .bbox-code-field-preview .bbox-code-field-row').length`) === 3,
  "chevron click did not expand Pose's three fields in place",
);

await clickByText(".bbox-code-field-toggle button", "Source");
await new Promise((r) => setTimeout(r, 200));
await clickByText(".bbox-code-field-toggle button", "UI");
await new Promise((r) => setTimeout(r, 200));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .bbox-code-field-preview') != null`),
  "expansion collapsed after a Source -> UI round trip (finding 2)",
);

// --- finding 1: a foreign row opens ITS OWNER's source, at ITS line ----

// The nested rows are Pose's own x / y / theta, in that order; click theta
// (index 2) — its OWNER is Pose, not this field's own `attrs` document.
await clickNth('[data-testid="code-field-attrs"] .bbox-code-field-preview .bbox-code-field-row-content', 2);
await new Promise((r) => setTimeout(r, 200));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-pose"] .cm-editor') != null`),
  "clicking a foreign (Pose) row did not open the Pose field's own source",
);
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"][data-slot="code-field-rows"]') != null`),
  "clicking a foreign row incorrectly flipped THIS field (attrs) into source mode",
);
const poseCaretLine = await caretLineIndex('[data-testid="code-field-pose"]');
check(poseCaretLine === 2, `foreign-row click landed on Pose's line ${poseCaretLine}, expected line 2 (theta) — the donor's rule is owner AND line`);

await clickByText('[data-testid="code-field-demo"] section:nth-of-type(4) .bbox-code-field-toggle button', "UI");
await new Promise((r) => setTimeout(r, 150));

// A TOP-LEVEL row (this field's own — owner undefined) still opens ITS OWN
// source at its own line: "samples: int = 10" is line 1.
await click('[data-testid="code-field-attrs"] > .bbox-code-field-row:nth-of-type(2) > .bbox-code-field-row-content');
await new Promise((r) => setTimeout(r, 200));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .cm-editor') != null`),
  "a top-level row click did not open this field's own source",
);
const attrsCaretLine = await caretLineIndex('[data-testid="code-field-attrs"]');
check(attrsCaretLine === 1, `own-row click landed on line ${attrsCaretLine}, expected line 1 (samples)`);
await clickByText('[data-testid="code-field-demo"] section:nth-of-type(3) .bbox-code-field-toggle button', "UI");

// --- finding 3: Ctrl+Enter with a completion popup open never leaves a
// newline in a single-line field, even after accepting the popup --------

await click('[data-testid="code-field-row"] .cm-content');
await pressKey("a", { ctrl: true, code: "KeyA", windowsVirtualKeyCode: 65 });
await pressKey("Backspace", { code: "Backspace", windowsVirtualKeyCode: 8 });
await insertText("t: Po");
await waitFor(`document.querySelectorAll('.cm-tooltip').length > 0`, 5000);
await pressKey("Enter", { ctrl: true, code: "Enter", windowsVirtualKeyCode: 13 });
await new Promise((r) => setTimeout(r, 150));
const rowLineCount = await evaluate(`document.querySelectorAll('[data-testid="code-field-row"] .cm-content > .cm-line').length`);
const rowFinalText = await evaluate(`document.querySelector('[data-testid="code-field-row"] .cm-content').textContent`);
check(rowLineCount === 1, `Ctrl+Enter with the popup open left ${rowLineCount} lines in a single-line field (text: ${JSON.stringify(rowFinalText)})`);
check(!/[\r\n]/.test(rowFinalText), `single-line field's text contains a newline: ${JSON.stringify(rowFinalText)}`);
check(rowFinalText.startsWith("t: Pose") || rowFinalText === "t: Po", `unexpected accept result: ${JSON.stringify(rowFinalText)}`);

// ---------------------------------------------------------------------
// In-host mount (finding 6): completion z-index, Escape focus retention,
// wheel not panning/zooming, drag not moving the node/shape
// ---------------------------------------------------------------------

if (name === "reactflow") {
  const hostSelector = '[data-testid="code-field-in-rf-node"]';
  await waitFor(`document.querySelector('${hostSelector} .cm-content') != null`);
  const viewportBefore = await evaluate(`document.querySelector('.react-flow__viewport')?.style.transform`);

  await click(`${hostSelector} .cm-content`);
  await pressKey("End", { code: "End" });
  await insertText("o");
  await waitFor(`document.querySelectorAll('.cm-tooltip').length > 0`, 5000);

  // z-index: a point inside BOTH the popup and the later "cover" node must
  // resolve (via the browser's own hit-testing) to the popup, not the node
  // painted after it in the RF pane.
  const popupRect = await rectOf(".cm-tooltip");
  const coverRect = await rectOf('[data-id="code-field-cover"]');
  if (popupRect && coverRect) {
    const overlapX = Math.max(popupRect.x, coverRect.x) + 4;
    const overlapY = Math.max(popupRect.y, coverRect.y) + 4;
    const topElement = await evaluate(
      `(() => { const el = document.elementFromPoint(${overlapX}, ${overlapY}); return el ? (el.closest('.cm-tooltip') ? 'popup' : (el.closest('[data-id="code-field-cover"]') ? 'cover' : el.className)) : 'none'; })()`,
    );
    check(topElement === "popup", `completion popup did not paint above the later RF node — topmost was "${topElement}"`);
  } else {
    failures.push(`could not measure popup/cover overlap for the z-index check (popup=${!!popupRect}, cover=${!!coverRect})`);
  }

  // Escape closes the popup but keeps focus in the field (RF has no
  // document-level Escape handler of its own, so this mainly guards
  // against a regression in CodeField's own handling).
  await pressKey("Escape", { code: "Escape" });
  await new Promise((r) => setTimeout(r, 150));
  check(await evaluate(`document.querySelector('.cm-tooltip') == null`), "Escape did not close the completion popup");
  check(await evaluate(`document.activeElement?.closest('${hostSelector}') != null`), "focus left the field after Escape");

  // Wheel over the focused field must not zoom the RF canvas.
  await wheel(hostSelector, 120);
  await new Promise((r) => setTimeout(r, 150));
  const viewportAfter = await evaluate(`document.querySelector('.react-flow__viewport')?.style.transform`);
  check(viewportAfter === viewportBefore, `wheel over the field zoomed/panned React Flow: ${viewportBefore} -> ${viewportAfter}`);

  // A drag starting inside the field's text must not move the node.
  const nodeStyleBefore = await evaluate(`document.querySelector('[data-id="code-field-host"]')?.style.transform`);
  await dragFrom(`${hostSelector} .cm-content`, 60, 40);
  await new Promise((r) => setTimeout(r, 150));
  const nodeStyleAfter = await evaluate(`document.querySelector('[data-id="code-field-host"]')?.style.transform`);
  check(nodeStyleAfter === nodeStyleBefore, `a drag inside the field moved the RF node: ${nodeStyleBefore} -> ${nodeStyleAfter}`);
}

if (name === "tldraw") {
  const hostSelector = '[data-testid="code-field-in-tldraw-shape"]';
  await waitFor(`document.querySelector('${hostSelector} .cm-content') != null`);
  const cameraBefore = await evaluate(`JSON.stringify(window.editor.getCamera())`);

  await click(`${hostSelector} .cm-content`);
  await pressKey("End", { code: "End" });
  await insertText("o");
  await waitFor(`document.querySelectorAll('.cm-tooltip').length > 0`, 5000);

  const popupRect = await rectOf(".cm-tooltip");
  const coverShapeId = await evaluate(
    `window.editor.getCurrentPageShapes().find((s) => s.type === 'geo' && s.x === 40)?.id ?? null`,
  );
  if (popupRect && coverShapeId) {
    // The cover geo shape's screen-space bounding box, from tldraw's own
    // camera — independent of any DOM selector for a stock shape.
    const coverPageBounds = await evaluate(`(() => {
      const b = window.editor.getShapePageBounds(${JSON.stringify(coverShapeId)});
      return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null;
    })()`);
    const coverScreen = coverPageBounds
      ? await evaluate(`(() => {
          const p1 = window.editor.pageToViewport({ x: ${coverPageBounds.x}, y: ${coverPageBounds.y} });
          return p1;
        })()`)
      : null;
    if (coverScreen) {
      const overlapX = Math.max(popupRect.x, coverScreen.x) + 4;
      const overlapY = Math.max(popupRect.y, coverScreen.y) + 4;
      const topElement = await evaluate(
        `(() => { const el = document.elementFromPoint(${overlapX}, ${overlapY}); return el ? (el.closest('.cm-tooltip') ? 'popup' : el.className) : 'none'; })()`,
      );
      check(topElement === "popup", `completion popup did not paint above the later tldraw shape — topmost was "${topElement}"`);
    } else {
      failures.push("could not project the cover shape's page bounds to screen space for the z-index check");
    }
  } else {
    failures.push(`could not locate the popup/cover shape for the z-index check (popup=${!!popupRect}, coverShapeId=${coverShapeId})`);
  }

  await pressKey("Escape", { code: "Escape" });
  await new Promise((r) => setTimeout(r, 150));
  check(await evaluate(`document.querySelector('.cm-tooltip') == null`), "Escape did not close the completion popup");
  check(await evaluate(`document.activeElement?.closest('${hostSelector}') != null`), "focus left the field after Escape (tldraw's own cancel() likely fired)");
  check(
    await evaluate(`window.editor.getEditingShapeId() == null`),
    "tldraw entered its own shape-editing state from the field's Escape",
  );

  await wheel(hostSelector, 120);
  await new Promise((r) => setTimeout(r, 150));
  const cameraAfter = await evaluate(`JSON.stringify(window.editor.getCamera())`);
  check(cameraAfter === cameraBefore, `wheel over the field panned/zoomed the tldraw camera: ${cameraBefore} -> ${cameraAfter}`);

  const shapeId = await evaluate(`window.editor.getCurrentPageShapes().find((s) => s.type === 'code-field-host')?.id ?? null`);
  const shapeBefore = shapeId ? await evaluate(`JSON.stringify(window.editor.getShape(${JSON.stringify(shapeId)}))`) : null;
  await dragFrom(`${hostSelector} .cm-content`, 60, 40);
  await new Promise((r) => setTimeout(r, 150));
  const shapeAfter = shapeId ? await evaluate(`JSON.stringify(window.editor.getShape(${JSON.stringify(shapeId)}))`) : null;
  check(shapeAfter === shapeBefore, `a drag inside the field moved the tldraw shape`);
}

await new Promise((r) => setTimeout(r, 300));
const { data } = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(shotDir, `code-field-${name}.png`), Buffer.from(data, "base64"));

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(" | ")}`);

if (failures.length > 0) {
  console.error(`FAIL ${name}: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`PASS ${name}`);
