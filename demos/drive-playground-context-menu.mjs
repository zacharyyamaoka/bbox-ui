#!/usr/bin/env node
/**
 * Reliability journey for the playground's right-click menu, against the
 * live app over raw CDP. Reproduces the stock tldraw 5.3.2 failure that
 * ReliableContextMenu exists to fix — "works once, then every later
 * right-click is ignored" — and proves it stays fixed:
 *
 *   1. seed one Block, then run FIVE open/dismiss cycles: right-click the
 *      Block (menu must appear), left-click empty canvas (menu must close).
 *      Under the stock DefaultContextMenu the canvas pointer-down desyncs
 *      Radix from the editor's menu registry and cycle 2 never opens;
 *   2. assert Escape closes an open menu and returns focus to the editor
 *      container;
 *   3. after the cycles, invoke "Detach to primitives" from the menu and
 *      assert it still fires (shapes become stock groups), then more cycles,
 *      then "Rebuild Block/Port" and assert the Block is restored;
 *   4. assert <Canvas /> was never remounted across all of the above — the
 *      DOM node tagged before cycle 1 must be the same object at the end
 *      (a remount is the regression this design exists to prevent: it
 *      destroys active Tiptap editor views);
 *   5. screenshot the open menu for human inspection.
 *
 * Usage: node demos/drive-playground-context-menu.mjs [url]
 *        (default http://127.0.0.1:5193)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
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

async function click(x, y, button = "left") {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button, buttons: button === "left" ? 1 : 2, clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 350));
}

async function pressEscape() {
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await new Promise((r) => setTimeout(r, 350));
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

const menuOpen = () =>
  evaluate(`!!document.querySelector('[data-testid="context-menu"]')`);

await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && window.playgroundEditor`,
  "playground editor",
);
await new Promise((r) => setTimeout(r, 1200));

// ---------------------------------------------------------------- fixture --
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.run(() => {
    editor.deleteShapes(editor.getCurrentPageShapes().map((s) => s.id));
  });
  editor.createShape({
    id: "shape:menu_block",
    type: "bbox-block",
    x: 200, y: 180,
    props: {
      w: 384, h: 258,
      title: "Detect", titleSize: "xl",
      blockType: "dataflow", description: "blackbox modelling",
      icon: "🔍", tag: "Draft 1", orientation: "horizontal",
      ports: [
        { id: "image", direction: "input", state: "wired", size: "md",
          label: "image", textLayout: "right", side: "left", t: 0.35 },
      ],
    },
  });
  editor.setCamera({ x: 0, y: 0, z: 1 });
  editor.setCurrentTool("select");
  return true;
})()`);

// Tag the live Canvas DOM node BEFORE any menu interaction; identity must
// survive every open/close cycle below, or Canvas was remounted.
const probed = await evaluate(`(() => {
  const canvas = document.querySelector('.tl-canvas');
  if (!canvas) return false;
  window.__bboxCanvasProbe = canvas;
  return true;
})()`);
assert(probed, "canvas element found and tagged for remount detection");

// Screen point inside the Block, and an empty-canvas point, via the camera.
const points = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const inBlock = editor.pageToViewport({ x: 390, y: 300 });
  const empty = editor.pageToViewport({ x: 900, y: 620 });
  return { inBlock: { x: inBlock.x, y: inBlock.y }, empty: { x: empty.x, y: empty.y } };
})()`);

// ----------------------------------- open / dismiss-by-canvas-click × 5 ----
// The stock bug is "works once, then never": the canvas pointer-down that
// dismisses the menu is exactly what desyncs the stock component.
for (let cycle = 1; cycle <= 5; cycle++) {
  await click(points.inBlock.x, points.inBlock.y, "right");
  assert(await menuOpen(), `cycle ${cycle}: right-click opens the menu`);
  if (cycle === 1) {
    const shot = await screenshot("playground-context-menu-open.png");
    console.log(`  screenshot: ${shot}`);
  }
  await click(points.empty.x, points.empty.y, "left");
  assert(!(await menuOpen()), `cycle ${cycle}: canvas click dismisses the menu`);
}

// ----------------------------------------------------- Escape close/focus --
await click(points.inBlock.x, points.inBlock.y, "right");
assert(await menuOpen(), "Escape test: right-click opens the menu");
await pressEscape();
assert(!(await menuOpen()), "Escape closes the menu");
const focusInEditor = await evaluate(`(() => {
  const container = window.playgroundEditor.getContainer();
  return container === document.activeElement || container.contains(document.activeElement);
})()`);
assert(focusInEditor, "Escape returns focus to the editor container");

// And the menu still opens after an Escape dismissal.
await click(points.inBlock.x, points.inBlock.y, "right");
assert(await menuOpen(), "menu opens again after Escape");
await click(points.empty.x, points.empty.y, "left");

// ------------------------------------- Detach still invokes after cycles --
await click(points.inBlock.x, points.inBlock.y, "right");
const detachItem = await evaluate(`(() => {
  const item = [...document.querySelectorAll('[data-testid="context-menu"] .tlui-button, .tlui-menu button')]
    .find((el) => el.textContent.includes("Detach"));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
assert(detachItem !== null, "menu still offers Detach after the cycles");
if (detachItem) await click(detachItem.x, detachItem.y);
const detachedState = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const shapes = editor.getCurrentPageShapes();
  return {
    hasBBox: shapes.some((s) => s.type.startsWith("bbox-")),
    hasBlockGroup: shapes.some(
      (s) => s.type === "group" && s.meta?.bboxUi?.kind === "block",
    ),
  };
})()`);
assert(
  !detachedState.hasBBox && detachedState.hasBlockGroup,
  "Detach invoked correctly (Block lowered to a stock group)",
);

// A few more cycles on the detached board, then Rebuild.
for (let cycle = 1; cycle <= 3; cycle++) {
  await click(points.inBlock.x, points.inBlock.y, "right");
  assert(await menuOpen(), `post-detach cycle ${cycle}: menu opens`);
  await click(points.empty.x, points.empty.y, "left");
  assert(!(await menuOpen()), `post-detach cycle ${cycle}: menu dismisses`);
}

await click(points.inBlock.x, points.inBlock.y, "right");
const rebuildItem = await evaluate(`(() => {
  const item = [...document.querySelectorAll('[data-testid="context-menu"] .tlui-button, .tlui-menu button')]
    .find((el) => el.textContent.includes("Rebuild"));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
assert(rebuildItem !== null, "menu offers Rebuild after detach + cycles");
if (rebuildItem) await click(rebuildItem.x, rebuildItem.y);
const rebuilt = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const shapes = editor.getCurrentPageShapes();
  return shapes.some((s) => s.type === "bbox-block");
})()`);
assert(rebuilt, "Rebuild invoked correctly (Block restored)");

// ------------------------------------------------- Canvas never remounted --
const sameCanvas = await evaluate(`(() => {
  const canvas = document.querySelector('.tl-canvas');
  return !!canvas && canvas === window.__bboxCanvasProbe;
})()`);
assert(sameCanvas, "Canvas DOM node identity unchanged — never remounted");

// -------------------------------------------------------------- verdict ---
const pageErrors = consoleErrors.filter(
  (e) => !e.includes("favicon") && !e.includes("License"),
);
assert(pageErrors.length === 0, `no page errors (got ${pageErrors.length})`);
if (pageErrors.length) console.error(pageErrors.join("\n"));

chrome.kill();
if (failures.length) {
  console.error(`\nFAILED: ${failures.length} assertion(s)`);
  process.exit(1);
}
console.log("\nPASS: context menu survives dismissal, Escape, and repeated use");
