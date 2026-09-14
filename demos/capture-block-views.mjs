#!/usr/bin/env node
/**
 * Drive the /create page's Block view switching in headless Chrome over raw
 * CDP (same pattern as demos/capture-members-control.mjs) and PROVE the P2
 * contract, in both themes:
 *
 *   the Block bench opens in Expanded (band header, wall lanes, body shown)
 *   → two Port members are added → the preset pill switches S → P → E → S
 *   → every port member stays in the DOM in every view (anonymous = mounted
 *   + visibility:hidden; rows = a body list; walls = the lanes) → the box
 *   follows each preset's governed width/height → the same bench renders on
 *   the React Flow and tldraw canvases → Region composes a REAL Block in
 *   Port view in its corner.
 *
 * Every assertion reads the DOM the page paints, never a control's claims.
 * Writes named PNGs + manifest.json.
 *
 * Usage: node demos/capture-block-views.mjs <url> <outDir>
 *   e.g. node demos/capture-block-views.mjs http://localhost:4157/create demos/screenshots/block-views
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-block-views.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-views-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1600,1000", "about:blank"],
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
  await sleep(200);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(300);
}
const shots = [];
async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  shots.push(`${name}.png`);
  return `${name}.png`;
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
    const html = await evaluate(`document.querySelector('[data-slot="inspector-column"]')?.outerHTML ?? "(no inspector)"`);
    writeFileSync(path.join(outDir, "FAILED-inspector.html"), html);
  } catch {}
  console.error(err);
  chrome.kill();
  process.exit(1);
});

// ---- page state readers: the oracle is the painted DOM.
const blockState = () =>
  evaluate(`(() => {
    const el = document.querySelector('[data-slot="viewport"] [data-slot="block"][data-view]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { view: el.getAttribute("data-view"), header: el.getAttribute("data-header"), ports: el.getAttribute("data-ports"), members: el.getAttribute("data-members"), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
// Every rendered port-member node under the canvas Block, however the mode
// paints it (lanes, rows, hidden wrappers) — plus each one's effective
// CSS visibility so "anonymous = mounted but invisible" is measurable.
const canvasPortMembers = () =>
  evaluate(`(() => {
    const block = document.querySelector('[data-slot="viewport"] [data-slot="block"][data-view]');
    if (!block) return [];
    const seen = new Map();
    for (const el of block.querySelectorAll('[data-instance-id], [data-member-id]')) {
      const id = el.getAttribute('data-instance-id') ?? el.getAttribute('data-member-id');
      if (!id.startsWith('port-')) continue;
      const visibility = getComputedStyle(el).visibility;
      if (!seen.has(id) || visibility !== 'hidden') seen.set(id, visibility);
    }
    return [...seen.entries()].map(([id, visibility]) => ({ id, visibility }));
  })()`);
const inspectorTitle = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span')?.textContent ?? null`);

async function load(theme) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); localStorage.setItem("bbox-ui.create.render", "dom"); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(700);
  const isDark = await evaluate(`document.documentElement.classList.contains("dark")`);
  assert(isDark === (theme === "dark"), `theme ${theme} applied`);
}

async function switchView(view) {
  await click(`[data-slot="preset-button"][data-preset="${view}"]`);
  await sleep(350);
}

async function runTheme(theme) {
  const t = (name) => `${theme}-${name}`;
  await load(theme);

  // ---- Block bench: opens on the expanded seed.
  await setSelect('[data-slot="component-picker"]', "Block");
  await waitFor('[data-slot="viewport"] [data-slot="block"][data-view]');
  let state = await blockState();
  assert(state.view === "expanded", `Block bench seeds view=expanded, got ${state.view}`);
  assert(state.header === "band" && state.ports === "walls" && state.members === "shown", `expanded face fields, got ${JSON.stringify(state)}`);

  // ---- the Block bench seeds three real Ports ("in", "cfg", "out" —
  // bench.tsx's seedBlockPorts, Zach's 2026-09-12 port-lane fixture); those
  // are the survival fixture, no adds needed.
  await waitFor('[data-slot="members-control"]');
  assert((await inspectorTitle())?.includes("Block"), "inspector shows the Block");
  const expandedPorts = await canvasPortMembers();
  assert(expandedPorts.length === 3, `3 seeded port members on the expanded canvas, got ${expandedPorts.length}`);
  assert(expandedPorts.every((p) => p.visibility === "visible"), `walls ports visible, got ${JSON.stringify(expandedPorts)}`);
  const portIds = expandedPorts.map((p) => p.id).sort();
  await screenshot(t("block-expanded"));

  // ---- S -> P -> E -> S, asserting survival + governed sizes each step.
  const expectations = {
    simple: { header: "centered", ports: "anonymous", members: "hidden", w: 384, h: 258 },
    port: { header: "band", ports: "rows", members: "hidden", w: 384, h: 346 },
    expanded: { header: "band", ports: "walls", members: "shown", w: 707, h: 452 },
  };
  for (const view of ["simple", "port", "expanded", "simple"]) {
    await switchView(view);
    state = await blockState();
    const want = expectations[view];
    assert(state.view === view, `data-view ${view}, got ${state.view}`);
    assert(state.header === want.header && state.ports === want.ports && state.members === want.members, `${view} face fields, got ${JSON.stringify(state)}`);
    assert(Math.abs(state.w - want.w) <= 2 && Math.abs(state.h - want.h) <= 2, `${view} box ${want.w}x${want.h}, got ${state.w}x${state.h}`);
    const ports = await canvasPortMembers();
    assert(ports.map((p) => p.id).sort().join() === portIds.join(), `${view}: port ids survive, got ${JSON.stringify(ports)}`);
    if (want.ports === "anonymous") {
      assert(ports.every((p) => p.visibility === "hidden"), `${view}: anonymous ports mounted but hidden, got ${JSON.stringify(ports)}`);
    } else {
      assert(ports.every((p) => p.visibility === "visible"), `${view}: ${want.ports} ports visible, got ${JSON.stringify(ports)}`);
    }
    if (view === "port") {
      const rows = await evaluate(`document.querySelectorAll('[data-slot="block-port-rows-bench"] [data-member-id]').length`);
      assert(rows === 3, `port view renders 3 rows, got ${rows}`);
      const footer = await evaluate(`!!document.querySelector('[data-slot="viewport"] [data-slot="bar"][data-edge="top"]')`);
      assert(footer, "port view mounts the footer bar");
    }
    if (view === "simple") {
      const centered = await evaluate(`!!document.querySelector('[data-slot="block-centered-header"]')`);
      assert(centered, "simple view renders the centered demo header");
    }
    await screenshot(t(`block-${view}${view === "simple" && state ? "" : ""}`));
  }

  // ---- the same instance on the React Flow and tldraw canvases.
  await switchView("port");
  for (const render of ["reactflow", "tldraw"]) {
    await click(`[data-slot="render-tab"][data-render="${render}"]`);
    await waitFor('[data-slot="viewport"] [data-slot="block"][data-view]', 45000);
    await sleep(1200);
    state = await blockState();
    assert(state.view === "port" && state.ports === "rows", `${render} canvas paints the port face, got ${JSON.stringify(state)}`);
    await screenshot(t(`block-port-${render}`));
  }
  await click('[data-slot="render-tab"][data-render="dom"]');
  await sleep(400);

  // ---- Region: a real Block{view:"port"} in the corner.
  await setSelect('[data-slot="component-picker"]', "Region");
  await waitFor('[data-slot="viewport"] [data-slot="region"]');
  const region = await evaluate(`(() => {
    const region = document.querySelector('[data-slot="viewport"] [data-slot="region"]');
    const corner = region?.querySelector('[data-slot="block"][data-view]');
    return region ? { kind: region.getAttribute("data-kind"), cornerView: corner?.getAttribute("data-view") ?? null } : null;
  })()`);
  assert(region?.kind === "for", `region kind for, got ${JSON.stringify(region)}`);
  assert(region?.cornerView === "port", `region corner is a REAL Block in port view, got ${JSON.stringify(region)}`);
  await screenshot(t("region"));
}

await runTheme("light");
await runTheme("dark");

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ url, shots, finished: new Date().toISOString() }, null, 2));
console.log(`PASS — ${shots.length} screenshots in ${outDir}`);
chrome.kill();
process.exit(0);
