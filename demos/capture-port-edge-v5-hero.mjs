#!/usr/bin/env node
/**
 * demos/capture-port-edge-v5-hero.mjs
 *
 * Records the primary flow — one real cross-edge port drag on the standalone
 * PortEdges bench — as a sequence of PNG frames captured over CDP WHILE the
 * mouse button is down, for the report's hero loop.
 *
 * Real frames from the running app, never a fabricated animation: every frame
 * is `Page.captureScreenshot` of the same viewport well the journey asserts
 * against, taken between two `Input.dispatchMouseEvent` moves of the same
 * gesture. docs/build_port_edge_v5.py assembles them into the animated GIF.
 *
 * Usage: node demos/capture-port-edge-v5-hero.mjs <url> <outDir> [variantId]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg, variantId = "v1-lane-sortable"] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-port-edge-v5-hero.mjs <url> <outDir> [variantId]");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-hero-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1500,950", "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const wsUrl = await new Promise((resolve, reject) => {
  let buffer = "";
  const timer = setTimeout(() => reject(new Error("chrome did not start")), 15000);
  chrome.stderr.on("data", (chunk) => {
    buffer += chunk;
    const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
});
const browser = new WebSocket(wsUrl);
await new Promise((r) => (browser.onopen = r));
let nextId = 0;
const pending = new Map();
let sessionId = null;
browser.onmessage = (event) => {
  const m = JSON.parse(event.data);
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
    const payload = { id, method, params };
    if (useSession && sessionId) payload.sessionId = sessionId;
    browser.send(JSON.stringify(payload));
  });
}
const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));
await send("Runtime.enable");
await send("Page.enable");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  return result.value;
}
async function waitFor(selector, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${selector}`);
}

await send("Page.navigate", { url });
await waitFor('[data-slot="create-workbench"]');
await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme","dark"); localStorage.setItem("bbox-ui.create.portEdgeVariant", ${JSON.stringify(variantId)}); })()`);
await send("Page.navigate", { url });
await waitFor('[data-slot="component-picker"]');
await sleep(800);
await evaluate(`(() => {
  const el = document.querySelector('[data-slot="component-picker"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, "PortEdges");
  el.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
await waitFor('[data-slot="viewport-well"] [data-port-id]');
await sleep(700);

// The capture window: the outline plus a generous margin, so the whole
// gesture stays in frame and the loop is readable at report width.
const clip = await evaluate(`(() => {
  const o = document.querySelector('[data-slot="port-edges-outline"]');
  const r = o.getBoundingClientRect();
  const pad = 46;
  return { x: Math.floor(r.left - pad), y: Math.floor(r.top - pad), width: Math.ceil(r.width + pad * 2), height: Math.ceil(r.height + pad * 2) };
})()`);

const frames = [];
let frameIndex = 0;
async function frame() {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  const name = `hero-${String(frameIndex++).padStart(3, "0")}.png`;
  writeFileSync(path.join(outDir, name), Buffer.from(data, "base64"));
  frames.push(name);
}

async function point(selector, fraction) {
  return evaluate(`(() => {
    const lane = document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="${selector}"]');
    const track = lane.querySelector('[data-slot="port-edge"]') || lane;
    const r = track.getBoundingClientRect();
    const horizontal = ${selector === "top" || selector === "bottom"};
    return { x: horizontal ? r.left + r.width * ${fraction} : r.left + r.width / 2,
             y: horizontal ? r.top + r.height / 2 : r.top + r.height * ${fraction} };
  })()`);
}
const firstTop = await evaluate(`document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="top"] [data-port-id]').getAttribute("data-port-id")`);
const from = await evaluate(`(() => {
  const w = document.querySelector('[data-port-id="${firstTop}"]');
  const d = w.querySelector('[data-slot="port-dot"]') || w;
  const r = d.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
const to = await point("right", 0.32);

await frame(); await frame(); // two still frames so the loop opens on rest
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
await sleep(40);
await frame();
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 });
await sleep(40);
const STEPS = 22;
for (let i = 1; i <= STEPS; i++) {
  // An ease so the loop reads as a hand moving, not a linear sweep.
  const p = i / STEPS;
  const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, buttons: 1 });
  await sleep(26);
  await frame();
}
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left" });
await sleep(90);
await frame();
await sleep(160);
await frame();
await frame();
await frame();

writeFileSync(path.join(outDir, "hero.json"), JSON.stringify({ variantId, frames, clip, from, to, portId: firstTop }, null, 2));
chrome.kill();
await new Promise((r) => chrome.once("exit", r));
try { rmSync(profile, { recursive: true, force: true }); } catch {}
console.log(`HERO — ${frames.length} frames → ${outDir}`);
