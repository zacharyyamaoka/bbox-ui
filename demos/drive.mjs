#!/usr/bin/env node
/**
 * Drive both demos in headless Chrome over raw CDP (Node 22's native
 * WebSocket — no puppeteer). For each demo: navigate, wait for the blocks
 * to paint, run in-page assertions, collect console errors, screenshot to
 * demos/screenshots/. Exits non-zero if anything fails.
 *
 * Usage: node demos/drive.mjs <name> <url>
 *   e.g. node demos/drive.mjs reactflow http://127.0.0.1:5183
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , name, url] = process.argv;
if (!name || !url) {
  console.error("usage: node demos/drive.mjs <name> <url>");
  process.exit(2);
}

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

const { targetId } = await send(
  "Target.createTarget",
  { url: "about:blank" },
  false,
);
({ sessionId } = await send(
  "Target.attachToTarget",
  { targetId, flatten: true },
  false,
));

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

// Wait until the blocks have painted (both hosts render [data-slot=block]).
const deadline = Date.now() + 30000;
let blockCount = 0;
while (Date.now() < deadline) {
  blockCount = await evaluate(
    `document.querySelectorAll('[data-slot="block"]').length`,
  );
  if (blockCount >= 5) break;
  await new Promise((r) => setTimeout(r, 250));
}

// Give fonts/emoji/canvas one settling beat before the screenshot.
await new Promise((r) => setTimeout(r, 1500));

const summary = await evaluate(`(() => {
  const text = (selector) =>
    [...document.querySelectorAll(selector)].map((el) => el.textContent.trim());
  const dotStates = [...document.querySelectorAll('[data-slot="port-dot"]')]
    .map((el) => el.dataset.state);
  const handleStates = [...document.querySelectorAll('.react-flow__handle')]
    .map((el) => el.dataset.state);
  return {
    blocks: document.querySelectorAll('[data-slot="block"]').length,
    titles: text('[data-slot="block-title"]'),
    types: text('[data-slot="block-type"]'),
    descriptions: text('[data-slot="block-description"]'),
    glyphs: document.querySelectorAll('[data-slot="block-glyph"]').length,
    chips: text('[data-slot="block-chip"]'),
    dotStates,
    handleStates,
    edges: document.querySelectorAll('.react-flow__edge').length,
    canvas: document.querySelectorAll('.tl-container, .react-flow').length,
  };
})()`);

const { data } = await send("Page.captureScreenshot", { format: "png" });
const shotPath = path.join(shotDir, `${name}.png`);
writeFileSync(shotPath, Buffer.from(data, "base64"));

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

const failures = [];
if (summary.blocks < 5) failures.push(`expected 5 blocks, got ${summary.blocks}`);
for (const title of [
  "Camera",
  "Detect",
  "Track",
  "cm_clock",
  // The over-long title arrives in full via textContent even when the paint
  // ellipsizes it — truncation is presentation-only, never a data edit.
  "Detect Objects In Frame",
]) {
  if (!summary.titles.includes(title)) failures.push(`missing title ${title}`);
}
for (const type of ["Source", "dataflow", "Clock"]) {
  if (!summary.types.includes(type)) failures.push(`missing type ${type}`);
}
if (!summary.descriptions.includes("blackbox modelling")) {
  failures.push("missing description");
}
if (summary.glyphs < 3) failures.push(`expected >=3 glyphs, got ${summary.glyphs}`);
if (!summary.chips.includes("Draft 1")) failures.push("missing Draft 1 chip");
if (!summary.chips.includes("Draft 2")) failures.push("missing Draft 2 chip");
const states = [...summary.dotStates, ...summary.handleStates];
for (const state of ["empty", "default", "wired", "received"]) {
  if (!states.includes(state)) failures.push(`no port in state ${state}`);
}
if (name === "reactflow" && summary.edges < 2) {
  failures.push(`expected 2 edges, got ${summary.edges}`);
}
if (summary.canvas < 1) failures.push("host canvas not mounted");
if (consoleErrors.length > 0) {
  failures.push(`console errors: ${consoleErrors.join(" | ")}`);
}

console.log(JSON.stringify({ name, url, shotPath, summary, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL ${name}: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`PASS ${name}`);
