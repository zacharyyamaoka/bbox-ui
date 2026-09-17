#!/usr/bin/env node
/**
 * Record the skin switcher being used, from the real running demo.
 *
 * Frames come out of CDP `Page.captureScreenshot` on a fixed cadence while
 * the script clicks the real in-app picker, so the hero clip in the report
 * is the actual interaction rather than an animation of what it might look
 * like. Written to <out>/frame-*.png; ffmpeg assembles them afterwards.
 *
 * Usage: node demos/record-skins.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDir] = process.argv;
if (!url || !outDir) {
  console.error("usage: node demos/record-skins.mjs <url> <outDir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const FPS = 10;
const profile = mkdtempSync(path.join(tmpdir(), "bbox-rec-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0",
    "--window-size=1280,720", "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

const wsUrl = await new Promise((resolve, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("chrome did not start")), 15000);
  chrome.stderr.on("data", (c) => {
    buffer += c;
    const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
});

const browser = new WebSocket(wsUrl);
await new Promise((r) => (browser.onopen = r));
let nextId = 0, sessionId = null;
const pending = new Map();
browser.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id != null && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};
function send(method, params = {}, useSession = true) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const p = { id, method, params };
    if (useSession && sessionId) p.sessionId = sessionId;
    browser.send(JSON.stringify(p));
  });
}
const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });

const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.value;
};

const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  if ((await evaluate(`document.querySelectorAll('[data-slot="block"]').length`)) >= 5) break;
  await new Promise((r) => setTimeout(r, 250));
}
await evaluate(`document.fonts.ready.then(() => true)`);
// Start from a known skin so the clip always opens on the same frame.
await evaluate(`document.querySelector('[data-skin-option="default"]').click()`);
await new Promise((r) => setTimeout(r, 1500));

let frame = 0;
let recording = true;
const capture = (async () => {
  while (recording) {
    const started = Date.now();
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, `frame-${String(frame++).padStart(4, "0")}.png`), Buffer.from(data, "base64"));
    const spent = Date.now() - started;
    if (spent < 1000 / FPS) await new Promise((r) => setTimeout(r, 1000 / FPS - spent));
  }
})();

// hold · switch · hold — the loop reads as a cycle, so the GIF can repeat
// without a visible seam.
for (const skin of ["default", "plain", "sketch", "default"]) {
  await new Promise((r) => setTimeout(r, 1600));
  await evaluate(`document.querySelector('[data-skin-option="${skin}"]').click()`);
}
await new Promise((r) => setTimeout(r, 1600));

recording = false;
await capture;
console.log(`${frame} frames -> ${outDir}`);
chrome.kill();
await new Promise((r) => setTimeout(r, 500));
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
process.exit(0);
