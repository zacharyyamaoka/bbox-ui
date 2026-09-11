#!/usr/bin/env node
/**
 * T0 SPIKE driver — copies the Chrome/CDP plumbing from demos/drive.mjs
 * (no puppeteer, Node 22 native WebSocket) to drive Storybook's own
 * iframe.html directly, switch the `host` global via the URL, and
 * screenshot each of the three hosts.
 *
 * Usage: node .spike/drive-story.mjs <hostName> <port>
 *   e.g. node .spike/drive-story.mjs tldraw 5420
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , hostName, portArg] = process.argv;
if (!hostName || !portArg) {
  console.error("usage: node .spike/drive-story.mjs <hostName> <port>");
  process.exit(2);
}
const port = Number(portArg);
const storyId = "t0-spike-port--primary";
const url = `http://127.0.0.1:${port}/iframe.html?id=${storyId}&viewMode=story&globals=host:${hostName}`;

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = here;
mkdirSync(shotDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-sb-chrome-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1400,900",
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

// Wait until the story root has painted a port dot.
const deadline = Date.now() + 30000;
let dotCount = 0;
while (Date.now() < deadline) {
  dotCount = await evaluate(`document.querySelectorAll('[data-slot="port-dot"]').length`);
  if (dotCount >= 1) break;
  await new Promise((r) => setTimeout(r, 250));
}

// Settling beat for fonts / canvas paint / tldraw's own layout pass.
await new Promise((r) => setTimeout(r, 1500));

const summary = await evaluate(`(() => {
  const dot = document.querySelector('[data-slot="port-dot"]');
  return {
    hasStorybookRoot: !!document.getElementById('storybook-root'),
    portDots: document.querySelectorAll('[data-slot="port-dot"]').length,
    portLabelText: document.querySelector('[data-slot="port-label"]')?.textContent ?? null,
    dotState: dot?.getAttribute('data-state') ?? null,
    reactFlowCanvas: document.querySelectorAll('.react-flow').length,
    tldrawCanvas: document.querySelectorAll('.tl-container').length,
    storyHostShape: document.querySelectorAll('[data-slot="story-host"]').length,
    domHost: document.querySelectorAll('[data-host="dom"]').length,
    bodyText: document.body.innerText.slice(0, 300),
  };
})()`);

const { data } = await send("Page.captureScreenshot", { format: "png" });
const shotPath = path.join(shotDir, `${hostName}.png`);
writeFileSync(shotPath, Buffer.from(data, "base64"));

chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  // best effort
}

console.log(JSON.stringify({ hostName, url, shotPath, summary, consoleErrors }, null, 2));

const failures = [];
if (summary.portDots < 1) failures.push("no port-dot painted");
if (summary.portLabelText !== "Story Port") failures.push(`unexpected label text: ${summary.portLabelText}`);
if (summary.dotState !== "wired") failures.push(`unexpected dot state: ${summary.dotState}`);
if (hostName === "reactflow" && summary.reactFlowCanvas < 1) failures.push("react-flow canvas not mounted");
if (hostName === "tldraw" && summary.tldrawCanvas < 1) failures.push("tldraw canvas not mounted");
if (hostName === "tldraw" && summary.storyHostShape < 1) failures.push("story-host shape not painted");
if (hostName === "dom" && summary.domHost < 1) failures.push("dom host wrapper not present");
if (consoleErrors.length > 0) failures.push(`console errors: ${consoleErrors.join(" | ")}`);

if (failures.length > 0) {
  console.error(`FAIL ${hostName}: ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`PASS ${hostName}`);
