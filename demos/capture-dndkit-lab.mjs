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

async function emptySpotInRow(containerSelector) {
  // Right-clicking "empty container space" needs a point that isn't sitting
  // on a card — the container's own geometric center can land on a middle
  // card once an odd number remain (as happened here after stage 3's earlier
  // cross-container drag left only 3 in the top row). Use the padding strip
  // after the rightmost card instead, which stays empty at any card count
  // this demo produces.
  return evaluate(`(() => {
    const container = document.querySelector(${JSON.stringify(containerSelector)});
    const rect = container.getBoundingClientRect();
    const cards = [...container.children]
      .filter((el) => el.classList.contains("card"))
      .map((el) => el.getBoundingClientRect());
    const rightmost = cards.length ? Math.max(...cards.map((r) => r.right)) : rect.left;
    const x = rightmost + 20 < rect.right - 10 ? (rightmost + rect.right - 10) / 2 : rect.left + 10;
    return { x, y: rect.top + rect.height / 2 };
  })()`);
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
  // The label lives in a nested <span class="card__label"> (the arrow is a
  // sibling <svg>), so match the label text and walk up to the card div.
  return `//span[contains(@class,"card__label") and normalize-space(text())=${JSON.stringify(label)}]/parent::div`;
}

function chipSelector(text) {
  // A collapsed group's chip carries the group id — used to grab a merged
  // card by which group it represents (e.g. "Core").
  return `//span[contains(@class,"card__chip") and normalize-space(text())=${JSON.stringify(text)}]/parent::div`;
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
    if (count === 4) return;
    await sleep(150);
  }
  throw new Error("app did not render its tabs in time");
}

async function clickByText(tag, text) {
  const xpath = `//${tag}[normalize-space(text())=${JSON.stringify(text)}]`;
  await evaluate(`(() => {
    const xpath = ${JSON.stringify(xpath)};
    const el = document.evaluate(xpath, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) throw new Error("not found: " + xpath);
    el.click();
  })()`);
  await sleep(80);
}

async function rightClick(point) {
  await mouseMove(point.x, point.y);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "right",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "right",
    clickCount: 1,
  });
  await sleep(120);
}

async function pressKey(key) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, text: key });
  await sleep(80);
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
await click('input[type="checkbox"]'); // back to Auto for the rest of stage 3
await sleep(150);

// --- Stage 3: right-click to add / delete a card ---
const topContainerGap = await emptySpotInRow(".board__top .container");
await rightClick(topContainerGap);
await sleep(120);
await screenshot("08-board-context-menu-add");

await clickByText("button", "Add card");
await sleep(150);
await screenshot("09-board-card-added");

const p11 = await rectOfXPath(cardSelector("P11"));
await rightClick(p11);
await sleep(120);
await screenshot("10-board-context-menu-delete");

await clickByText("button", "Delete");
await sleep(150);

// --- Stage 3: the arrow tool — draw near an edge to spawn a port there ---
await pressKey("a");
await sleep(100);
const rightContainerCenter = await rectOf(".board__right .container");
const arrowStart = { x: rightContainerCenter.x - 180, y: rightContainerCenter.y - 40 };
const arrowMid = { x: rightContainerCenter.x - 60, y: rightContainerCenter.y - 20 };
await mouseMove(arrowStart.x, arrowStart.y);
await send("Input.dispatchMouseEvent", {
  type: "mousePressed",
  x: arrowStart.x,
  y: arrowStart.y,
  button: "left",
  clickCount: 1,
});
await mouseMove(arrowMid.x, arrowMid.y);
await sleep(60);
await screenshot("11-board-arrow-tool-drawing");

await mouseMove(rightContainerCenter.x, rightContainerCenter.y);
await sleep(60);
await send("Input.dispatchMouseEvent", {
  type: "mouseReleased",
  x: rightContainerCenter.x,
  y: rightContainerCenter.y,
  button: "left",
  clickCount: 1,
});
await sleep(150);
await screenshot("12-board-arrow-tool-port-created");

// --- Stage 4: grouping ---
await click(".tabs__tab:nth-of-type(4)");
await sleep(200);
await screenshot("13-grouping-pairs-grouped");

await clickByText("button", "Collapsed");
await sleep(150);
await screenshot("14-grouping-pairs-collapsed");

await clickByText("button", "By source");
await sleep(150);
await clickByText("button", "Collapsed");
await sleep(150);
await screenshot("15-grouping-source-collapsed");

const coreChip = await rectOfXPath(chipSelector("Core"));
await drag(coreChip, { x: coreChip.x + 340, y: coreChip.y });
await screenshot("16-grouping-source-rigid-move");

await clickByText("button", "Three-way split");
await sleep(150);
await screenshot("17-grouping-threeway-grouped");

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

console.log(`Wrote screenshots to ${outDir}`);
