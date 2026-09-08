#!/usr/bin/env node
/**
 * Drive the playground's merged styling-lab chrome in headless Chrome over
 * raw CDP. The journey proves the inspector/menu merge:
 *
 *   1. the Figma-shaped inspector mounts (drawer tab + control cluster) and
 *      the native style panel sits at y:8 — the Compare button no longer
 *      rides `components.SharePanel`, which as a flow sibling pushed the
 *      panel down (the lab measured y:8 -> y:34 for exactly this bug);
 *   2. the Compare button lives INSIDE the inspector's control cluster and
 *      still opens the compare view;
 *   3. opening the drawer on a selected rectangle shows real fields, and
 *      drag-scrubbing the middle of the W field changes the shape;
 *   4. the Theme tab mounts ThemePanel;
 *   5. the board name beside the hamburger edits in place;
 *   6. the main menu opens with the lab's V3 content (File + Settings…),
 *      and Settings… opens the real dialog;
 *   7. right-clicking a styled rectangle offers "Show as stock" (the lab's
 *      renamed detach-to-primitive) alongside bbox-ui's own items, and
 *      selecting it strips meta.primitiveOverride.
 *
 * Usage: node demos/drive-playground-inspector.mjs [url]   (default http://127.0.0.1:5193)
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
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`element not found: ${selector}`);
  return rect;
}

async function click(x, y, button = "left") {
  const buttons = button === "right" ? 2 : 1;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button, buttons, clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 300));
}

// A real scrub: press, eight interpolated moves, release — the same gesture
// the lab's own inspector smoke drives, because ScrubNumber's 2px threshold
// and pointer capture only engage on genuine pointer movement.
async function drag(from, to) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1,
  });
  for (let step = 1; step <= 8; step += 1) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + ((to.x - from.x) * step) / 8,
      y: from.y + ((to.y - from.y) * step) / 8,
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 25));
  }
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0,
  });
  await new Promise((r) => setTimeout(r, 300));
}

async function typeText(text) {
  for (const character of text) {
    await send("Input.insertText", { text: character });
    await new Promise((r) => setTimeout(r, 30));
  }
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

await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && document.querySelector('[data-testid="inspector-drawer-tab"]')`,
  "playground with inspector chrome",
);
await new Promise((r) => setTimeout(r, 1500));

// 1. The SharePanel fix, measured the way the lab's judge measured the bug:
// the native style panel's wrapper must sit at tldraw's own y:8, because
// nothing (Compare button included) is stacked above it in the top-right
// flow column any more.
const styleY = await evaluate(
  `document.querySelector('.tlui-style-panel__wrapper')?.getBoundingClientRect().top ?? null`,
);
assert(styleY === 8, `style panel sits at y:8 (measured y:${styleY})`);

// 2. Compare rides the inspector's fixed control cluster, not a flow slot.
assert(
  await evaluate(
    `!!document.querySelector('[data-testid="inspector-control-cluster"] [data-testid="playground-compare"]')`,
  ),
  "Compare button lives inside the inspector control cluster",
);
assert(
  await evaluate(`!document.querySelector('.tlui-share-zone [data-testid="playground-compare"]')`),
  "Compare button is out of tldraw's share zone",
);

// 3. A rectangle to inspect, created through the real editor and selected.
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.createShape({ id: 'shape:probe-rect', type: 'geo', x: 420, y: 320, props: { w: 200, h: 120 } });
  editor.select('shape:probe-rect');
  return editor.getOnlySelectedShape()?.id;
})()`);

const drawerTab = await centerOf('[data-testid="inspector-drawer-tab"]');
await click(drawerTab.x, drawerTab.y);
await waitFor(
  `document.querySelector('[data-testid="inspector-field-w"]')`,
  "inspector fields after opening the drawer",
);
const inspectorShot = await screenshot("playground-inspector-open.png");

// 4. Whole-field scrub: drag the MIDDLE of the W field, the shape follows.
const wBefore = await evaluate(`window.playgroundEditor.getShape('shape:probe-rect').props.w`);
const wField = await centerOf('[data-testid="inspector-field-w"]');
await drag(wField, { x: wField.x + 60, y: wField.y });
const wAfter = await evaluate(`window.playgroundEditor.getShape('shape:probe-rect').props.w`);
assert(wAfter !== wBefore, `scrubbing the W field resized the shape (${wBefore} -> ${wAfter})`);

// 5. The Theme tab mounts ThemePanel.
const themeTab = await centerOf('[data-testid="inspector-tab-theme"]');
await click(themeTab.x, themeTab.y);
assert(
  await evaluate(`!!document.querySelector('[data-testid="theme-panel"]')`),
  "the Theme tab mounts ThemePanel",
);
const themeShot = await screenshot("playground-inspector-theme.png");

// 6. The board name beside the hamburger edits in place.
assert(
  await evaluate(`!!document.querySelector('.tlui-menu-zone [data-testid="document-name"]')`),
  "board name renders in the menu zone beside the hamburger",
);
const nameButton = await centerOf('[data-testid="document-name"]');
await click(nameButton.x, nameButton.y);
await waitFor(`document.querySelector('[data-testid="document-name-input"]')`, "rename input");
await evaluate(`(() => { const i = document.querySelector('[data-testid="document-name-input"]'); i.select(); return true })()`);
await typeText("Merged board");
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await new Promise((r) => setTimeout(r, 300));
assert(
  (await evaluate(`document.querySelector('[data-testid="document-name"]')?.textContent`))?.includes("Merged board"),
  "renaming through the app-bar name sticks",
);

// 7. The main menu opens with V3's content: File and Settings…, and the
// Settings item opens the real dialog.
const menuButton = await centerOf('[data-testid="main-menu.button"]');
await click(menuButton.x, menuButton.y);
await waitFor(`[...document.querySelectorAll('.tlui-menu button, .tlui-menu [role="menuitem"]')].length > 0`, "main menu content");
const menuLabels = await evaluate(
  `[...document.querySelectorAll('.tlui-menu [role="menuitem"], .tlui-menu button')].map((el) => el.textContent.trim())`,
);
assert(
  menuLabels.some((label) => label.startsWith("File")),
  `main menu offers File (items: ${JSON.stringify(menuLabels.slice(0, 6))})`,
);
const settingsItem = menuLabels.find((label) => label.startsWith("Settings"));
assert(settingsItem !== undefined, "main menu offers Settings…");
const menuShot = await screenshot("playground-mainmenu-open.png");
const settingsCenter = await evaluate(`(() => {
  const item = [...document.querySelectorAll('.tlui-menu [role="menuitem"], .tlui-menu button')]
    .find((el) => el.textContent.trim().startsWith('Settings'));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (settingsCenter) {
  await click(settingsCenter.x, settingsCenter.y);
  await waitFor(`document.querySelector('[data-testid="settings-pan-speed"]')`, "settings dialog");
  assert(
    await evaluate(`!!document.querySelector('[data-testid="settings-wheelDown"]')`),
    "Settings dialog shows the wheel bindings",
  );
  const settingsShot = await screenshot("playground-settings-dialog.png");
  console.log(`  shot: ${settingsShot}`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await new Promise((r) => setTimeout(r, 300));
}

// 8. "Show as stock": give the rect an exact-colour override through the
// inspector's own meta contract, then strip it from the context menu.
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.updateShape({ id: 'shape:probe-rect', type: 'geo', meta: { primitiveOverride: { strokeColor: '#ff0066' } } });
  editor.select('shape:probe-rect');
  return true;
})()`);
const shapeCenter = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const bounds = editor.getShapePageBounds('shape:probe-rect');
  const screen = editor.pageToViewport({ x: bounds.midX, y: bounds.midY });
  return { x: screen.x, y: screen.y };
})()`);
await click(shapeCenter.x, shapeCenter.y, "right");
await waitFor(`document.querySelector('[data-testid="context-menu"]')`, "context menu");
const contextLabels = await evaluate(
  `[...document.querySelectorAll('[data-testid="context-menu"] [role="menuitem"]')].map((el) => el.textContent.trim())`,
);
assert(
  contextLabels.some((label) => label === "Show as stock"),
  `context menu offers Show as stock (items: ${JSON.stringify(contextLabels.slice(0, 8))})`,
);
const contextShot = await screenshot("playground-show-as-stock.png");
const showAsStock = await evaluate(`(() => {
  const item = [...document.querySelectorAll('[data-testid="context-menu"] [role="menuitem"]')]
    .find((el) => el.textContent.trim() === 'Show as stock');
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (showAsStock) {
  await click(showAsStock.x, showAsStock.y);
  const metaAfter = await evaluate(
    `window.playgroundEditor.getShape('shape:probe-rect').meta.primitiveOverride ?? null`,
  );
  assert(metaAfter === null, "Show as stock stripped meta.primitiveOverride");
}

// 9. A bbox-ui Block selected while the drawer is open: the inspector has no
// rows for a shape type it never modelled, and that must degrade gracefully
// (no crash, dock still mounted), because the playground's whole point is
// both shape families on one board.
const errorsBeforeBlock = consoleErrors.length;
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.createShape({ id: 'shape:probe-block', type: 'bbox-block', x: 800, y: 320 });
  editor.select('shape:probe-block');
  return true;
})()`);
await new Promise((r) => setTimeout(r, 800));
assert(
  await evaluate(`!!document.querySelector('[data-testid="inspector"]')`),
  "inspector dock survives a bbox-block selection",
);
assert(
  consoleErrors.length === errorsBeforeBlock,
  `no new console errors from a bbox-block selection (got ${consoleErrors.length - errorsBeforeBlock})`,
);

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(" | ")}`);
console.log(JSON.stringify({ url, styleY, inspectorShot, themeShot, menuShot, contextShot, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL playground-inspector: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS playground-inspector");
