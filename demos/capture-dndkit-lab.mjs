#!/usr/bin/env node
/**
 * Drive the dnd-kit lab (demos/dndkit-lab) in headless Chrome over raw CDP —
 * no puppeteer, same pattern as demos/drive.mjs. Walks all three stages,
 * performs real mouse-driven drags (dnd-kit needs actual pointer movement,
 * not a synthetic .click()), and writes named screenshots for the report
 * builder to inline.
 *
 * Usage: node demos/capture-dndkit-lab.mjs <url> <outDir>
 *   e.g. node demos/capture-dndkit-lab.mjs http://127.0.0.1:5195 reports/media/dndkit-lab
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-dndkit-lab.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-dndkit-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1300,1300",
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
let sessionId = null;

browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mouseMove(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
}

async function drag(from, to, steps = 12) {
  await mouseMove(from.x, from.y);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: from.x,
    y: from.y,
    button: "left",
    clickCount: 1,
  });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await mouseMove(x, y);
    await sleep(20);
  }
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(150);
}

async function rectOf(selector) {
  return evaluate(`(() => {
    const selector = ${JSON.stringify(selector)};
    const el = document.querySelector(selector);
    if (!el) throw new Error("not found: " + selector);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}

async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await sleep(80);
}

function cardSelector(label) {
  return `//div[contains(@class,"card") and normalize-space(text())=${JSON.stringify(label)}]`;
}

async function rectOfXPath(xpath) {
  return evaluate(`(() => {
    const xpath = ${JSON.stringify(xpath)};
    const el = document.evaluate(xpath, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) throw new Error("not found: " + xpath);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
}

async function waitForTabs() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const count = await evaluate(`document.querySelectorAll('.tabs__tab').length`);
    if (count === 3) return;
    await sleep(150);
  }
  throw new Error("app did not render its tabs in time");
}

await waitForTabs();
await sleep(300);

// --- Stage 1: single sortable row ---
await screenshot("01-row");
const a1 = await rectOfXPath(cardSelector("A1"));
const a5 = await rectOfXPath(cardSelector("A5"));
await drag(a1, { x: a5.x + 40, y: a5.y });
await click('button[title*="space-evenly"]');
await screenshot("02-row-reordered-including-edge");

// --- Stage 2: single sortable column ---
await click(".tabs__tab:nth-of-type(2)");
await sleep(200);
await screenshot("03-column");
const b1 = await rectOfXPath(cardSelector("B1"));
const b3 = await rectOfXPath(cardSelector("B3"));
await drag(b1, { x: b3.x, y: b3.y + 40 });
await screenshot("04-column-reordered");

// --- Stage 3: combined board, auto mode ---
await click(".tabs__tab:nth-of-type(3)");
await sleep(200);
await screenshot("05-board-auto");

const p1 = await rectOfXPath(cardSelector("P1"));
const leftContainer = await rectOf(".board__left .container");
await drag(p1, { x: leftContainer.x, y: leftContainer.y });
await screenshot("06-board-cross-container-orientation-flip");

// --- Stage 3: custom (freeform) mode ---
await click('input[type="checkbox"]');
await sleep(150);
const p3 = await rectOfXPath(cardSelector("P3"));
const p4 = await rectOfXPath(cardSelector("P4"));
await drag(p3, { x: (p3.x + p4.x) / 2, y: p3.y - 25 });
await screenshot("07-board-custom-freeform");

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

console.log(`Wrote screenshots to ${outDir}`);
