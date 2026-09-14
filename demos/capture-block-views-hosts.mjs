#!/usr/bin/env node
/**
 * Drive the two standalone host demos (demos/reactflow on 5183, demos/tldraw
 * on 5189) through their dev view switchers and PROVE the adapters' half of
 * P2 in a real browser:
 *
 *   the scene loads LEGACY (no view — pixels untouched) → Port and Expanded
 *   faces paint on real host canvases → on React Flow, a REAL NodeResizer
 *   drag in Expanded, a switch to Port and back, and the exact dragged box
 *   returns (parkViewSize, driven end to end through applyBlockNodeView).
 *
 * Usage: node demos/capture-block-views-hosts.mjs <rfUrl> <tlUrl> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , rfUrl, tlUrl, outDirArg] = process.argv;
if (!rfUrl || !tlUrl || !outDirArg) {
  console.error("usage: node demos/capture-block-views-hosts.mjs <rfUrl> <tlUrl> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-hosts-"));
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
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(300);
}
async function mouse(type, x, y, extra = {}) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
}
async function drag(from, to, steps = 12) {
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(20);
  }
  await mouse("mouseReleased", to.x, to.y);
  await sleep(400);
}
const shots = [];
async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  shots.push(`${name}.png`);
}
let lastFailure = null;
function assert(cond, msg) {
  if (!cond) {
    lastFailure = msg;
    throw new Error("ASSERT: " + msg);
  }
}
process.on("uncaughtException", async (err) => {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, "FAILED.png"), Buffer.from(data, "base64"));
  } catch {}
  console.error(err);
  chrome.kill();
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/* React Flow demo                                                     */
/* ------------------------------------------------------------------ */
await send("Page.navigate", { url: rfUrl });
await waitFor(".react-flow__node [data-slot=\"block\"]", 45000);
await sleep(1200);

// Legacy first: no bbox block carries data-view before any button press.
let legacyViews = await evaluate(`[...document.querySelectorAll('.react-flow__node [data-slot="block"]')].map((el) => el.getAttribute('data-view'))`);
assert(legacyViews.length > 0 && legacyViews.every((v) => v === null), `legacy scene has no data-view, got ${JSON.stringify(legacyViews)}`);
await screenshot("rf-legacy");

// The node wrapper's inline style is the un-zoomed truth (fitView scales
// the canvas, so bounding rects would measure the zoom, not the box).
const nodeBox = (which = 0) =>
  evaluate(`(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].filter((n) => n.querySelector('[data-slot="block"]'));
    const node = nodes[${which}];
    return { id: node.getAttribute('data-id'), w: parseFloat(node.style.width), h: parseFloat(node.style.height) };
  })()`);
const faceStates = () =>
  evaluate(`[...document.querySelectorAll('.react-flow__node [data-slot="block"]')].map((el) => ({ view: el.getAttribute('data-view'), ports: el.getAttribute('data-ports') }))`);

await click('[data-view-button="port"]');
let faces = await faceStates();
assert(faces.every((f) => f.view === "port" && f.ports === "rows"), `RF port face on every block, got ${JSON.stringify(faces)}`);
let box = await nodeBox();
assert(box.w === 384 && box.h === 346, `RF port box 384x346, got ${box.w}x${box.h}`);
// Edges must survive: React Flow keeps an edge only while both handles exist.
const edgeCount = await evaluate(`document.querySelectorAll('.react-flow__edge').length`);
assert(edgeCount > 0, "edges still mounted in port view");
await screenshot("rf-port");

await click('[data-view-button="expanded"]');
faces = await faceStates();
assert(faces.every((f) => f.view === "expanded" && f.ports === "walls"), `RF expanded face, got ${JSON.stringify(faces)}`);
box = await nodeBox();
assert(box.w === 707 && box.h === 452, `RF expanded box 707x452, got ${box.w}x${box.h}`);
await screenshot("rf-expanded");

// ---- the park proof, with a REAL NodeResizer drag.
// Select the first block so its resize controls mount.
const blockRect = await evaluate(`(() => {
  const el = [...document.querySelectorAll('.react-flow__node')].find((n) => n.querySelector('[data-slot="block"]'));
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
await mouse("mouseMoved", blockRect.x, blockRect.y);
await mouse("mousePressed", blockRect.x, blockRect.y);
await sleep(50);
await mouse("mouseReleased", blockRect.x, blockRect.y);
await sleep(500);
const handle = await evaluate(`(() => {
  const el = document.querySelector('.react-flow__resize-control.bottom.right');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
assert(handle, "NodeResizer bottom-right handle mounted on the selected block");
await drag(handle, { x: handle.x + 60, y: handle.y + 40 });
const dragged = await nodeBox();
assert(dragged.w > 707 && dragged.h > 452, `drag grew the expanded box, got ${dragged.w}x${dragged.h}`);
await screenshot("rf-expanded-resized");

await click('[data-view-button="port"]');
box = await nodeBox();
assert(box.w === 384 && box.h === 346, `back in port at its parked box, got ${box.w}x${box.h}`);
await click('[data-view-button="expanded"]');
box = await nodeBox();
assert(box.w === dragged.w && box.h === dragged.h, `parkViewSize returned the DRAGGED expanded box ${dragged.w}x${dragged.h}, got ${box.w}x${box.h}`);
await screenshot("rf-expanded-park-returned");

/* ------------------------------------------------------------------ */
/* tldraw demo                                                         */
/* ------------------------------------------------------------------ */
await send("Page.navigate", { url: tlUrl });
await waitFor('[data-view-button="port"]', 45000);
await waitFor('.tl-container [data-slot="block"]', 45000);
await sleep(1500);

const shapeStates = () =>
  evaluate(`window.editor.getCurrentPageShapes().filter((s) => s.type === "bbox-block").map((s) => ({ view: s.props.view, w: s.props.w, h: s.props.h }))`);
let states = await shapeStates();
assert(states.length > 0 && states.every((s) => s.view === null), `tldraw scene loads legacy (view null), got ${JSON.stringify(states)}`);
await screenshot("tl-legacy");

await click('[data-view-button="port"]');
await sleep(500);
states = await shapeStates();
assert(states.every((s) => s.view === "port" && s.w === 384 && s.h === 346), `tldraw port face 384x346, got ${JSON.stringify(states)}`);
const paintedPort = await evaluate(`[...document.querySelectorAll('.tl-container [data-slot="block"][data-view="port"]')].length`);
assert(paintedPort === states.length, `every tldraw block PAINTS the port face, got ${paintedPort}/${states.length}`);
await screenshot("tl-port");

await click('[data-view-button="expanded"]');
await sleep(500);
states = await shapeStates();
assert(states.every((s) => s.view === "expanded" && s.w === 707 && s.h === 452), `tldraw expanded face 707x452, got ${JSON.stringify(states)}`);
await screenshot("tl-expanded");

// Park proof through the editor's own resize path (onResize writes
// views[view]): resize one shape, switch away and back.
await evaluate(`(() => {
  const shape = window.editor.getCurrentPageShapes().find((s) => s.type === "bbox-block");
  window.editor.resizeShape(shape.id, { x: 1.2, y: 1.25 });
})()`);
await sleep(300);
const resized = (await shapeStates())[0];
assert(resized.w > 707, `editor resize grew the box, got ${JSON.stringify(resized)}`);
await click('[data-view-button="port"]');
await sleep(400);
await click('[data-view-button="expanded"]');
await sleep(400);
const returned = (await shapeStates())[0];
assert(Math.round(returned.w) === Math.round(resized.w) && Math.round(returned.h) === Math.round(resized.h), `tldraw parked box returns, wanted ${resized.w}x${resized.h}, got ${returned.w}x${returned.h}`);
await screenshot("tl-expanded-park-returned");

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ rfUrl, tlUrl, shots, finished: new Date().toISOString() }, null, 2));
console.log(`PASS — ${shots.length} screenshots in ${outDir}`);
chrome.kill();
process.exit(0);
