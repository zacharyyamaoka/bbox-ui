#!/usr/bin/env node
/**
 * The living regression for the /create page after Zach's picks of
 * 2026-09-11: react-arborist is the navigator, Inline rows is the inspector
 * layout, Flex replaced RowContainer, and three behaviours he asked for:
 *
 *   1 · Add keeps you on the parent (the new member is a row to click into);
 *   2 · the mouse's back / forward buttons walk the subject history;
 *   3 · an empty member list is never folded — its + is one click away.
 *
 * Drives headless Chrome over raw CDP, both themes; every assertion reads
 * the page's own DOM. Writes PNGs + manifest.json for the "picks applied"
 * section of docs/build_tree_and_slots.py.
 *
 * Usage: node demos/capture-picks-applied.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-picks-applied.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-picks-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1400,900", "about:blank"],
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
const consoleErrors = [];
browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  } else if (message.method === "Runtime.consoleAPICalled" && (message.params.type === "error" || message.params.type === "warning")) {
    consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  } else if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push("EXCEPTION " + (message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text).slice(0, 300));
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
async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  })()`);
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(150);
}
/** A real press of the mouse's side buttons, over the page. */
async function sideButton(which) {
  const r = await rectOf('[data-slot="viewport-well"]');
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: which, clickCount: 1 });
  await sleep(30);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: which, clickCount: 1 });
  await sleep(250);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(220);
}
async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 };
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}
process.on("uncaughtException", async (err) => {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, "FAILED.png"), Buffer.from(data, "base64"));
    writeFileSync(path.join(outDir, "FAILED-inspector.html"), await evaluate(`document.querySelector('[data-slot="inspector-column"]')?.outerHTML ?? ""`));
  } catch {}
  console.error(err);
  chrome.kill();
  process.exit(1);
});

const inspectorName = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span')?.textContent ?? null`);
const pathCrumbs = () => evaluate(`Array.from(document.querySelectorAll('[data-slot="members-path-crumb"]')).map(e => e.textContent.trim())`);
const sectionCount = () => evaluate(`document.querySelectorAll('[data-slot="members-section"]').length`);
const listCounts = () => evaluate(`Array.from(document.querySelectorAll('[data-slot="members-section"] [data-slot="members-count"]')).map(e => e.textContent.trim())`);
const inspectorClip = async () => {
  const r = await rectOf('[data-slot="inspector-column"]');
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) };
};
async function load(theme, component) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(600);
  assert((await evaluate(`document.documentElement.classList.contains("dark")`)) === (theme === "dark"), `theme ${theme} applied`);
  await setSelect('[data-slot="component-picker"]', component);
  await waitFor('[data-slot="instance-navigator"]');
  await sleep(250);
  consoleErrors.length = 0;
}
/** Add `type` through the nth member list; the page keeps the subject. */
async function addVia(type, listIndex = 0) {
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(120);
  const menu = await evaluate(`(() => { const s = document.querySelectorAll('[data-slot="members-section"]')[${listIndex}]; return !!(s && s.querySelector('[data-slot="add-member-type"][data-type="${type}"]')); })()`);
  if (menu) await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-type"][data-type="${type}"]').click()`);
  await sleep(250);
}

const manifest = [];
for (const theme of ["dark", "light"]) {
  console.log(`— ${theme}`);
  // The picks are the only things there: no navigator or layout switcher, arborist and inline rows mounted.
  await load(theme, "Stack");
  assert(!(await evaluate(`!!document.querySelector('[data-slot="navigator-picker"], [data-slot="layout-picker"], [data-slot="members-control-picker"]')`)), "no switcher for navigator, layout or members control remains");
  assert((await evaluate(`document.querySelector('[data-slot="instance-navigator"]')?.getAttribute('data-navigator')`)) === "arborist", "react-arborist is the navigator");
  assert((await evaluate(`document.querySelector('[data-slot="inspector-layout"]')?.getAttribute('data-inspector-layout')`)) === "inline", "inline rows is the inspector layout");
  const options = await evaluate(`Array.from(document.querySelectorAll('[data-slot="component-picker"] option')).map(o => o.value)`);
  assert(options.includes("Flex") && !options.includes("RowContainer"), `Flex is registered and RowContainer is gone (${options.join(",")})`);

  // 3 · an empty list is not folded: the + is right there.
  assert((await sectionCount()) === 1, "the Stack's empty list is rendered, not folded");
  assert(await evaluate(`!!document.querySelector('[data-slot="members-section"] [data-slot="add-member-trigger"]')`), "its + is visible without any unfolding");
  const clip = await inspectorClip();
  const emptyOpen = await screenshot(`${theme}-1-empty-unfolded`, clip);

  // 1 · Add stays on the parent.
  await addVia("Port");
  assert((await inspectorName()) === "Stack", "after Add the inspector is still on the Stack");
  assert((await pathCrumbs()).length === 0, "no path: nothing was entered");
  assert((await listCounts()).join() === "1", "the list now counts one member");
  await addVia("Pill");
  assert((await listCounts()).join() === "2", "and two");
  const stayed = await screenshot(`${theme}-2-add-stays`, clip);

  // 2 · click into the Pill, mouse back returns to the Stack, forward re-enters.
  await click('[data-slot="members-section"] [data-member-id$="-2"], [data-slot="members-section"] [data-slot="member-row"]:nth-child(2) [data-slot="member-select"]');
  await sleep(100);
  if ((await inspectorName()) !== "Pill") await evaluate(`document.querySelectorAll('[data-slot="members-section"] [data-slot="member-select"]')[1].click()`);
  await sleep(200);
  assert((await inspectorName()) === "Pill", "clicking the Pill's row enters the Pill");
  assert((await pathCrumbs()).length === 1, "the path shows the Stack");
  const entered = await screenshot(`${theme}-3-entered`, clip);
  await sideButton("back");
  assert((await inspectorName()) === "Stack", "mouse back returns to the Stack");
  const back = await screenshot(`${theme}-4-mouse-back`, clip);
  await sideButton("forward");
  assert((await inspectorName()) === "Pill", "mouse forward re-enters the Pill");
  await sideButton("back");
  assert((await inspectorName()) === "Stack", "back again");
  // The page is still here: the browser did not navigate away.
  assert(await evaluate(`!!document.querySelector('[data-slot="create-workbench"]')`), "the browser's own back navigation was swallowed");

  // The slotted Block: seven lists visible on a fresh Block with no unfolding; Add stays; ⚙ enters the fill; back returns.
  await load(theme, "Block");
  assert((await sectionCount()) === 7, "a fresh Block shows all seven slot lists without unfolding");
  assert((await evaluate(`document.querySelectorAll('[data-slot="members-section"] [data-slot="add-member-trigger"]').length`)) === 7, "seven + buttons, one click each");
  const blockClip = await inspectorClip();
  const blockFresh = await screenshot(`${theme}-5-block-fresh`, blockClip);
  await addVia("Glyph", 0);
  await addVia("Pill", 2);
  assert((await inspectorName()) === "Block", "adding into a slot keeps the Block");
  assert((await listCounts()).join() === "1,0,1,0,0,0,0", `header left and right count one (${(await listCounts()).join()})`);
  const inSlot = async (slotId) => evaluate(`Array.from(document.querySelectorAll('[data-slot="dom-preview"] [data-slot="block-slot"][data-slot-id="${slotId}"] [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-type')).slice(1)`);
  assert((await inSlot("header.left")).join() === "Glyph" && (await inSlot("header.right")).join() === "Pill", "the render put each member in its hole");
  const blockFilled = await screenshot(`${theme}-6-block-filled`, blockClip);
  const blockPage = await screenshot(`${theme}-6-block-page`);
  // A body row, then a Port in it: two clicks in, two presses back.
  await addVia("Flex", 3);
  assert((await inspectorName()) === "Block", "adding a body row keeps the Block");
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[3].querySelector('[data-slot="member-select"]').click()`);
  await sleep(200);
  assert((await inspectorName()) === "Flex", "clicking the row enters it");
  await addVia("Port", 0);
  assert((await inspectorName()) === "Flex", "adding a Port keeps the row");
  await evaluate(`document.querySelector('[data-slot="members-section"] [data-slot="member-select"]').click()`);
  await sleep(200);
  assert((await inspectorName()) === "Port", "clicking the Port enters it");
  assert((await pathCrumbs()).length === 3, "path: Block › Body › the row");
  await sideButton("back");
  assert((await inspectorName()) === "Flex", "back: the row");
  await sideButton("back");
  assert((await inspectorName()) === "Block", "back: the Block");
  const deep = await screenshot(`${theme}-7-back-twice`, blockClip);
  manifest.push({ theme, console: Array.from(new Set(consoleErrors)), files: { emptyOpen, stayed, entered, back, blockFresh, blockFilled, blockPage, deep } });
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
console.log(`PASS — ${manifest.length} entries → ${outDir}`);
