#!/usr/bin/env node
/**
 * Headless-Chrome smoke test for `CodeFieldDemo` (the floating panel each
 * host demo mounts) — same raw-CDP pattern as `demos/drive.mjs`, kept as a
 * separate script rather than folded into it: that script's assertions are
 * about the shared Block/Port scene and would need to know nothing about a
 * component with no `demos/scene` presence.
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

async function click(selector) {
  const rect = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!rect) throw new Error(`click target not found: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  }
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

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

// The panel and its three sections paint at all.
await waitFor(`document.querySelector('[data-testid="code-field-demo"]') != null`);
await waitFor(`document.querySelector('[data-testid="code-field-attrs"] [data-slot="code-field-row"]') != null`);

const rowText = await evaluate(
  `document.querySelector('[data-testid="code-field-row"]').textContent`,
);
check(rowText.includes("pose") && rowText.includes("Pose") && rowText.includes("None"), `port row missing content: ${rowText}`);

const laneText = await evaluate(
  `document.querySelector('[data-testid="code-field-lane"]').textContent`,
);
check(laneText.includes("pose"), `port lane missing first line: ${laneText}`);
check(laneText.includes("window"), `port lane missing second line: ${laneText}`);

// Starts in rendered mode: a tree of rows, no live CodeMirror document.
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"][data-slot="code-field-rows"]') != null`),
  "attribute field did not start in rendered mode",
);
const renderedText = await evaluate(
  `document.querySelector('[data-testid="code-field-attrs"]').textContent`,
);
check(renderedText.includes("origin"), `rendered tree missing a row: ${renderedText}`);
check(renderedText.includes("Pose"), `rendered tree missing the reference segment: ${renderedText}`);

// The reference segment resolves ("Pose" is in the demo's tiny known-type
// map, with an onJump) — it renders as a click target, not plain text.
check(
  await evaluate(
    `document.querySelector('[data-testid="code-field-attrs"] .bbox-code-ref[role="button"]') != null`,
  ),
  "resolved type reference did not render as a link",
);

// Clicking the reference itself fires `resolveReference(...).onJump`.
await click('[data-testid="code-field-attrs"] .bbox-code-ref[role="button"]');
await new Promise((r) => setTimeout(r, 150));
check(
  (await evaluate(`document.querySelector('[data-testid="code-field-jumped-to"]')?.textContent ?? ""`)).includes(
    "Pose",
  ),
  "clicking the resolved reference did not fire onJump",
);

// Clicking the chevron on the resolved row expands it in place — no mode
// change, the same row tree gains nested children.
await click('[data-testid="code-field-attrs"] .bbox-code-field-chevron[role="button"]');
await new Promise((r) => setTimeout(r, 150));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .bbox-code-field-preview') != null`),
  "chevron click did not expand the reference in place",
);

// The [UI | Source] toggle actually flips the field's own mode: clicking
// "Source" mounts a real CodeMirror document where the row tree was.
await clickByText(".bbox-code-field-toggle button", "Source");
await new Promise((r) => setTimeout(r, 200));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .cm-editor') != null`),
  "Source toggle did not mount CodeMirror",
);
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"][data-slot="code-field-rows"]') == null`),
  "the rendered row tree stayed mounted alongside the live document",
);

// A rendered-row click (before the toggle above) drives `onOpenSource`,
// which the demo wires to flip `mode` to "source" itself — verified
// separately since clicking a row is the more realistic entry path than
// the toolbar toggle. Reset to rendered mode first.
await clickByText(".bbox-code-field-toggle button", "UI");
await new Promise((r) => setTimeout(r, 150));
await click('[data-testid="code-field-attrs"] .bbox-code-field-row-content');
await new Promise((r) => setTimeout(r, 200));
check(
  await evaluate(`document.querySelector('[data-testid="code-field-attrs"] .cm-editor') != null`),
  "clicking a rendered row did not open source mode via onOpenSource",
);
check(
  await evaluate(`document.activeElement?.closest('[data-testid="code-field-attrs"]') != null`),
  "source mode did not take focus after a rendered-row click",
);

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
