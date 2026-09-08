#!/usr/bin/env node
/**
 * Drive the playground's compare mode (apps/playground) in headless Chrome
 * over raw CDP. The journey proves the live-board comparison is honest:
 *
 *   1. an EMPTY board entered into compare mode shows an explicit empty
 *      state — never "max |Δ| = 0.00 px" (zero things compared is not
 *      agreement);
 *   2. after placing a Block, a standalone Port and a stock rectangle from
 *      the toolbar, the compare readout states its denominator — comparing
 *      2 of 3 shapes — and names the excluded stock shape type;
 *   3. the divergence on the two bbox shapes is 0.00px (same threshold as
 *      the fixed-scene regression net: < 0.5px, exact value reported);
 *   4. the authoring board is never disturbed: same shapes before, during
 *      and after compare mode, and the compare pane is a separate
 *      read-only editor;
 *   5. Back returns to an editable board.
 *
 * Usage: node demos/drive-playground-compare.mjs [url]  (default http://127.0.0.1:5193)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://127.0.0.1:5193";

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "screenshots");
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

async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(`!!(${expression})`)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function centerOf(selector) {
  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`element not found: ${selector}`);
  return rect;
}

// Real pointer gestures — the same events a person's mouse produces.
async function click(x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function pressKey(key, code) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key, code, text: key,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key, code,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const shotPath = path.join(shotDir, name);
  writeFileSync(shotPath, Buffer.from(data, "base64"));
  return shotPath;
}

const failures = [];
function assert(condition, label) {
  if (condition) {
    console.log(`  ok: ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

const COMPARE_BUTTON = '[data-testid="playground-compare"]';
const EXIT_BUTTON = '[data-testid="compare-exit"]';

async function clickSelector(selector) {
  const center = await centerOf(selector);
  await click(center.x, center.y);
}

await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && document.querySelector(${JSON.stringify(COMPARE_BUTTON)})`,
  "playground with compare button",
);
await new Promise((r) => setTimeout(r, 1500));

/* ---- 1. Empty board: compare must refuse to print a clean number ------- */

await clickSelector(COMPARE_BUTTON);
await waitFor(
  `document.querySelector('.bbox-compare-view')`,
  "compare view (empty board)",
);
await new Promise((r) => setTimeout(r, 1200));
assert(
  await evaluate(`!!document.querySelector('[data-compare-empty]')`),
  "empty board shows the explicit empty state",
);
assert(
  await evaluate(
    `document.querySelector('[data-compare-empty]').textContent.includes('no bbox-ui shapes')`,
  ),
  "empty state names the reason (no bbox-ui shapes)",
);
assert(
  await evaluate(`!document.body.textContent.includes('max |Δ|')`),
  "empty board never prints a max |Δ| number",
);
const emptyShot = await screenshot("playground-compare-empty.png");
await clickSelector(EXIT_BUTTON);
await waitFor(
  `!document.querySelector('.bbox-compare-view')`,
  "compare view closed",
);
assert(
  await evaluate(`window.editor === window.playgroundEditor`),
  "exit hands window.editor back to the authoring board",
);

/* ---- 2. Author a board: Block + Port (ours) + rectangle (stock) -------- */

await pressKey("b", "KeyB");
await click(500, 300);
await pressKey("p", "KeyP");
await click(950, 350);
await pressKey("r", "KeyR");
await click(1250, 650);
const authored = await evaluate(`(() => {
  const shapes = window.playgroundEditor.getCurrentPageShapes();
  return { total: shapes.length, types: shapes.map((s) => s.type).sort() };
})()`);
assert(
  authored.total === 3 &&
    JSON.stringify(authored.types) === JSON.stringify(["bbox-block", "bbox-port", "geo"]),
  `board holds bbox-block + bbox-port + geo (got ${JSON.stringify(authored.types)})`,
);

/* ---- 3. Enter compare: denominator, panes, divergence ------------------ */

await clickSelector(COMPARE_BUTTON);
await waitFor(
  `document.querySelector('.bbox-compare-view')`,
  "compare view (authored board)",
);
// Both panes must paint the derived scene: 1 block + 1 standalone port each.
await waitFor(
  `document.querySelectorAll('#pane-reactflow [data-slot="block"]').length === 1 &&
   document.querySelectorAll('#pane-tldraw [data-slot="block"]').length === 1 &&
   document.querySelectorAll('#pane-reactflow [data-standalone-port-id]').length === 1 &&
   document.querySelectorAll('#pane-tldraw [data-standalone-port-id]').length === 1`,
  "both panes painting 1 block + 1 standalone port",
);
await new Promise((r) => setTimeout(r, 1200));

const summaryText = await evaluate(
  `document.querySelector('[data-compare-summary]')?.textContent ?? ""`,
);
assert(
  summaryText.includes("comparing 2 of 3 shapes"),
  `readout states the denominator (got: ${JSON.stringify(summaryText)})`,
);
assert(
  summaryText.includes("1 stock tldraw shape (geo ×1)"),
  "readout names the excluded stock shape",
);
assert(
  summaryText.includes(
    "1 standalone port compared via a chrome-less React Flow wrapper node",
  ),
  "readout discloses the standalone-port wrapper",
);
assert(
  await evaluate(`!document.querySelector('[data-compare-empty]')`),
  "no empty state once bbox shapes exist",
);
const splitShot = await screenshot("playground-compare-split.png");

// The compare pane is a second, READ-ONLY editor — not the authoring one.
assert(
  await evaluate(
    `window.editor !== window.playgroundEditor &&
     window.editor.getInstanceState().isReadonly === true`,
  ),
  "compare tldraw pane is a separate read-only editor",
);
assert(
  await evaluate(
    `window.editor.getCurrentPageShapes().map((s) => s.type).sort().join() === 'bbox-block,bbox-port'`,
  ),
  "compare pane holds only the derived bbox shapes (stock geo excluded)",
);

// Overlay: the numeric readout over the two bbox shapes.
await clickSelector('[data-testid="compare-mode-overlay"]');
await new Promise((r) => setTimeout(r, 1000));
const divergence = await evaluate(`window.__bboxMeasureNow()`);
assert(divergence != null, "overlay produced a divergence reading");
if (divergence != null) {
  assert(
    divergence.rows.length === 1 && divergence.standalonePorts.length === 1,
    `reading covers 1 block + 1 standalone port (got ${divergence.rows.length}+${divergence.standalonePorts.length})`,
  );
  assert(
    divergence.maxAbs < 0.5,
    `bbox shapes agree across hosts (max |Δ| = ${divergence.maxAbs.toFixed(4)}px)`,
  );
  console.log(`  measured: max |Δ| = ${divergence.maxAbs}px @ zoom ${divergence.zoom}`);
}
const overlayShot = await screenshot("playground-compare-overlay.png");

/* ---- 4. The authoring board was never disturbed ------------------------ */

const afterCompare = await evaluate(`(() => {
  const shapes = window.playgroundEditor.getCurrentPageShapes();
  return { total: shapes.length, types: shapes.map((s) => s.type).sort() };
})()`);
assert(
  JSON.stringify(afterCompare) === JSON.stringify(authored),
  "authoring board unchanged while comparing",
);

/* ---- 5. Back returns to an editable board ------------------------------ */

await clickSelector(EXIT_BUTTON);
await waitFor(
  `!document.querySelector('.bbox-compare-view')`,
  "compare view closed after authoring session",
);
assert(
  await evaluate(
    `window.editor === window.playgroundEditor &&
     window.editor.getInstanceState().isReadonly === false`,
  ),
  "back in the editable authoring board",
);
assert(
  await evaluate(`window.playgroundEditor.getCurrentPageShapes().length === 3`),
  "shapes intact after the round trip",
);

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(" | ")}`);
console.log(JSON.stringify({ url, emptyShot, splitShot, overlayShot, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL playground-compare: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS playground-compare");
