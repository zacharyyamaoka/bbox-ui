#!/usr/bin/env node
/**
 * Drive the editable playground (apps/playground) in headless Chrome over
 * raw CDP. The journey proves the toolbar contract:
 *
 *   1. clicking the Black box family button both selects the family's
 *      current tool AND opens its menu (the SystemSketch select-and-open
 *      interaction);
 *   2. picking Port from the menu switches the tool and the family button's
 *      icon follows (asserted via data-current-tool);
 *   3. pressing B activates the Block tool through tldraw's own shortcut
 *      mechanism;
 *   4. clicking the canvas creates a real shape that reads back from the
 *      editor;
 *   5. after a reload the family button remembers the last-used tool.
 *
 * Usage: node demos/drive-playground.mjs [url]   (default http://127.0.0.1:5193)
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

const FAMILY = '[data-testid="bbox-tool-blackbox"]';

await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && document.querySelector(${JSON.stringify(FAMILY)})`,
  "playground toolbar",
);
await new Promise((r) => setTimeout(r, 1500));

// A fresh profile: the family button must show the default (Block).
assert(
  (await evaluate(`document.querySelector(${JSON.stringify(FAMILY)}).dataset.currentTool`)) ===
    "bbox-block",
  "family button defaults to Block",
);
const closedShot = await screenshot("playground.png");

// 1. Click the family button: selects the current tool AND opens the menu.
const familyCenter = await centerOf(FAMILY);
await click(familyCenter.x, familyCenter.y);
assert(
  (await evaluate(`window.editor.getCurrentToolId()`)) === "bbox-block",
  "family click selected the Block tool",
);
assert(
  await evaluate(`!!document.querySelector('.bbox-tool-menu')`),
  "family click opened the menu",
);
assert(
  (await evaluate(`document.querySelector(${JSON.stringify(FAMILY)}).dataset.state`)) === "open",
  "family button reports data-state=open",
);
const menuShot = await screenshot("playground-menu.png");

// 2. Pick Port from the menu: tool changes and the button's icon follows.
const menuText = await evaluate(
  `[...document.querySelectorAll('.bbox-tool-menu__item')].map((el) => el.textContent.trim())`,
);
assert(
  await evaluate(
    `[...document.querySelectorAll('.bbox-tool-menu__heading')].some((el) => el.textContent === 'Black box')`,
  ),
  "menu heading reads Black box",
);
const portItem = await evaluate(`(() => {
  const item = [...document.querySelectorAll('.bbox-tool-menu__item')]
    .find((el) => el.textContent.includes('Port'));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
assert(portItem !== null, `menu lists Port (items: ${JSON.stringify(menuText)})`);
await click(portItem.x, portItem.y);
assert(
  (await evaluate(`window.editor.getCurrentToolId()`)) === "bbox-port",
  "menu pick switched to the Port tool",
);
assert(
  (await evaluate(`document.querySelector(${JSON.stringify(FAMILY)}).dataset.currentTool`)) ===
    "bbox-port",
  "family button icon followed to Port",
);

// 3. Press B: the Block tool activates through tldraw's shortcut mechanism.
await pressKey("b", "KeyB");
assert(
  (await evaluate(`window.editor.getCurrentToolId()`)) === "bbox-block",
  "pressing B activated the Block tool",
);

// 4. Click the canvas: a real Block shape is created and reads back.
await click(700, 350);
const blockShapes = await evaluate(
  `window.editor.getCurrentPageShapes().filter((s) => s.type === 'bbox-block').length`,
);
assert(blockShapes === 1, `canvas click created one bbox-block (got ${blockShapes})`);

// ...and the same for Port via its own shortcut, which also makes Port the
// remembered family tool for the reload check below.
await pressKey("p", "KeyP");
assert(
  (await evaluate(`window.editor.getCurrentToolId()`)) === "bbox-port",
  "pressing P activated the Port tool",
);
await click(1000, 350);
const portShapes = await evaluate(
  `window.editor.getCurrentPageShapes().filter((s) => s.type === 'bbox-port').length`,
);
assert(portShapes === 1, `canvas click created one bbox-port (got ${portShapes})`);

// 5. Reload: the family button remembered the last-used tool.
await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && document.querySelector(${JSON.stringify(FAMILY)})`,
  "playground toolbar after reload",
);
await new Promise((r) => setTimeout(r, 1000));
assert(
  (await evaluate(`document.querySelector(${JSON.stringify(FAMILY)}).dataset.currentTool`)) ===
    "bbox-port",
  "after reload the family button remembered Port",
);
assert(
  await evaluate(
    `window.editor.getCurrentPageShapes().filter((s) => s.type === 'bbox-block' || s.type === 'bbox-port').length === 2`,
  ),
  "the drawn shapes survived the reload (persistenceKey)",
);

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(" | ")}`);
console.log(JSON.stringify({ url, closedShot, menuShot, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL playground: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS playground");
