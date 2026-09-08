#!/usr/bin/env node
/**
 * Drive the compare harness (demos/compare) in headless Chrome over raw
 * CDP: load it, walk all four modes through the real mode buttons,
 * screenshot each to demos/screenshots/compare-<mode>.png, and in overlay
 * mode read the app's own numeric divergence readout (window.__bboxCompare)
 * and fail if the two hosts disagree by more than half a pixel.
 *
 * Usage: node demos/drive-compare.mjs [url]   (default http://127.0.0.1:5191)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://127.0.0.1:5191";

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
await send("Page.navigate", { url: `${url}/#split` });

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

async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const shotPath = path.join(shotDir, `${name}.png`);
  writeFileSync(shotPath, Buffer.from(data, "base64"));
  return shotPath;
}

const failures = [];
const results = {};

// Both panes render the same 4-block scene → 8 blocks in the DOM.
await waitFor(
  `document.querySelectorAll('[data-slot="block"]').length >= 8`,
  "both panes to paint",
);
await new Promise((r) => setTimeout(r, 1500));

const paneState = () =>
  evaluate(`(() => {
    const visible = (id) => {
      const pane = document.getElementById(id);
      return pane != null && getComputedStyle(pane).display !== "none";
    };
    const blocksIn = (id) =>
      document.getElementById(id)?.querySelectorAll('[data-slot="block"]').length ?? 0;
    return {
      rfVisible: visible("pane-reactflow"),
      tlVisible: visible("pane-tldraw"),
      rfBlocks: blocksIn("pane-reactflow"),
      tlBlocks: blocksIn("pane-tldraw"),
      panel: document.querySelector("[data-compare-panel]") != null,
    };
  })()`);

for (const mode of ["split", "reactflow", "tldraw", "overlay"]) {
  // Walk modes through the real control, like a user would.
  await evaluate(`document.querySelector('[data-mode="${mode}"]').click()`);
  await new Promise((r) => setTimeout(r, 800));
  const state = await paneState();
  results[mode] = state;
  const expectRf = mode !== "tldraw";
  const expectTl = mode !== "reactflow";
  if (state.rfVisible !== expectRf)
    failures.push(`${mode}: react flow pane visible=${state.rfVisible}`);
  if (state.tlVisible !== expectTl)
    failures.push(`${mode}: tldraw pane visible=${state.tlVisible}`);
  if (state.rfBlocks !== 4) failures.push(`${mode}: rf blocks ${state.rfBlocks}`);
  if (state.tlBlocks !== 4) failures.push(`${mode}: tl blocks ${state.tlBlocks}`);
  if (state.panel !== (mode === "overlay"))
    failures.push(`${mode}: divergence panel shown=${state.panel}`);

  if (mode === "overlay") {
    // Let the 500ms measurement interval produce a fresh reading.
    await new Promise((r) => setTimeout(r, 1200));
    const divergence = await evaluate(`window.__bboxCompare ?? null`);
    results.divergence = divergence;
    if (divergence == null) {
      failures.push("overlay: no divergence measurement");
    } else if (divergence.maxAbs > 0.5) {
      failures.push(`overlay: hosts diverge by ${divergence.maxAbs.toFixed(2)}px`);
    }
  }

  results[`${mode}Shot`] = await screenshot(`compare-${mode}`);
}

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // Best effort — a straggling chrome helper may still hold the tmp profile.
}

if (consoleErrors.length > 0) {
  failures.push(`console errors: ${consoleErrors.join(" | ")}`);
}

console.log(JSON.stringify({ url, results, consoleErrors }, null, 2));
if (failures.length > 0) {
  console.error(`FAIL compare: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS compare");
