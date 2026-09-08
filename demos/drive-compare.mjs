#!/usr/bin/env node
/**
 * Drive the compare harness (demos/compare) in headless Chrome over raw
 * CDP: load it, walk all four modes through the real mode buttons,
 * screenshot each to demos/screenshots/compare-<mode>.png, exercise the
 * live linked cameras with REAL gestures (drag to pan and scroll to zoom,
 * in each pane, asserting the other pane followed through the bridge), and
 * read the app's own numeric divergence readout (window.__bboxCompare) at
 * several zoom levels and after a pan, failing if the two hosts disagree
 * by more than half a pixel at any of them.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- real gestures ---------------------------------------------------- */

async function mouse(type, x, y, extra = {}) {
  await send("Input.dispatchMouseEvent", { type, x, y, pointerType: "mouse", ...extra });
}

/** Left-drag from (x, y) by (dx, dy) in real steps — a pan in either host. */
async function drag(x, y, dx, dy) {
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", x + (dx * i) / steps, y + (dy * i) / steps, { buttons: 1 });
    await sleep(20);
  }
  // Hold still before releasing: tldraw's hand tool turns release velocity
  // into an inertia glide, and a mid-glide reading catches React Flow one
  // frame behind the camera it is following.
  await sleep(200);
  await mouse("mouseReleased", x + dx, y + dy, { button: "left", buttons: 0 });
  await sleep(400);
}

/** Wheel at (x, y) — zooms in both hosts (deltaY < 0 zooms in). */
async function wheel(x, y, deltaY) {
  await mouse("mouseWheel", x, y, { deltaX: 0, deltaY });
  await sleep(300);
}

/** Both hosts' cameras plus how far apart the bridge says they are. */
const cameraAgreement = () =>
  evaluate(`(() => {
    const cam = window.editor.getCamera();
    const vp = window.reactFlow.getViewport();
    const want = window.__bboxBridge.tldrawToReactFlow(cam);
    return {
      cam, vp,
      dx: vp.x - want.x,
      dy: vp.y - want.y,
      dzoom: vp.zoom - want.zoom,
    };
  })()`);

const failures = [];
const results = {};

function assertLinked(label, agreement) {
  for (const axis of ["dx", "dy", "dzoom"]) {
    if (Math.abs(agreement[axis]) > 0.01) {
      failures.push(
        `${label}: cameras diverged (${axis} = ${agreement[axis].toFixed(4)})`,
      );
    }
  }
}

// Both panes render the same 4-block scene → 8 blocks in the DOM.
await waitFor(
  `document.querySelectorAll('[data-slot="block"]').length >= 8`,
  "both panes to paint",
);
await waitFor(
  `window.editor != null && window.reactFlow != null && window.__bboxBridge != null`,
  "both hosts to hand over their handles",
);
await sleep(1500);

const paneState = () =>
  evaluate(`(() => {
    // Hidden panes use visibility, not display — display:none would hand
    // tldraw a 0×0 container and detour the linked cameras (see App.tsx).
    const visible = (id) => {
      const pane = document.getElementById(id);
      return pane != null && getComputedStyle(pane).visibility !== "hidden";
    };
    const blocksIn = (id) =>
      document.getElementById(id)?.querySelectorAll('[data-slot="block"]').length ?? 0;
    return {
      rfVisible: visible("pane-reactflow"),
      tlVisible: visible("pane-tldraw"),
      rfBlocks: blocksIn("pane-reactflow"),
      tlBlocks: blocksIn("pane-tldraw"),
      panel: document.querySelector("[data-compare-panel]") != null,
      blendSlider: document.querySelector('[data-testid="compare-blend"]') != null,
      tlBlendMode: getComputedStyle(document.getElementById("pane-tldraw")).mixBlendMode,
      tlOpacity: Number(getComputedStyle(document.getElementById("pane-tldraw")).opacity),
    };
  })()`);

for (const mode of ["split", "reactflow", "tldraw", "overlay"]) {
  // Walk modes through the real control, like a user would.
  await evaluate(`document.querySelector('[data-testid="compare-mode-${mode}"]').click()`);
  await sleep(800);
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
    // Crossfade is the default: slider present, no difference blending,
    // and blend=100 shows the top (tldraw) pane at full opacity.
    if (!state.blendSlider) failures.push("overlay: blend slider missing");
    if (state.tlBlendMode !== "normal")
      failures.push(`overlay: default blend mode ${state.tlBlendMode}`);
    if (state.tlOpacity !== 1)
      failures.push(`overlay: default top opacity ${state.tlOpacity}`);

    // Scrub the crossfade to 50% through the real slider.
    await evaluate(`(() => {
      const slider = document.querySelector('[data-testid="compare-blend"]');
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, "value").set;
      setValue.call(slider, "50");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const blended = await paneState();
    if (Math.abs(blended.tlOpacity - 0.5) > 0.001)
      failures.push(`overlay: blend 50 gave top opacity ${blended.tlOpacity}`);
    const blendLabel = await evaluate(
      `document.querySelector('[data-testid="compare-blend-value"]').textContent`,
    );
    if (blendLabel !== "50%")
      failures.push(`overlay: blend readout ${blendLabel}`);
    results.overlayBlend50Shot = await screenshot("compare-overlay-blend50");

    // The difference blend is still one toggle away — it proves convergence.
    await evaluate(`document.querySelector("[data-blend-toggle]").click()`);
    await sleep(300);
    const diff = await paneState();
    if (diff.tlBlendMode !== "difference")
      failures.push(`overlay: toggled blend mode ${diff.tlBlendMode}`);
    if (diff.blendSlider)
      failures.push("overlay: slider still present in difference mode");
    results.overlayDifferenceShot = await screenshot("compare-overlay-difference");
    await evaluate(`document.querySelector("[data-blend-toggle]").click()`);
    await sleep(200);

    // Divergence at several zoom levels and after a pan — the calibration
    // must hold across the whole range now that the cameras are live.
    // Each framing keeps real blocks on screen — tldraw culls shapes fully
    // outside the viewport, and a culled block is dropped from the reading,
    // so a framing showing nothing would measure nothing. `minBlocks` is
    // the honest denominator: how many of the 4 blocks the reading must
    // actually have compared.
    const framings = [
      ["zoom 0.25", { x: 50, y: 90, zoom: 0.25 }, 4],
      ["zoom 0.45", { x: 50, y: 90, zoom: 0.45 }, 4],
      ["zoom 1.00", { x: 50, y: 90, zoom: 1 }, 4],
      // Zoomed to 2× onto the Detect/cm_clock column (world x 560); Camera
      // and Track land offscreen and are culled out of the comparison.
      ["zoom 2.00", { x: -320, y: 60, zoom: 2 }, 2],
      ["panned @ zoom 1", { x: -260, y: -180, zoom: 1 }, 3],
    ];
    results.divergenceByZoom = {};
    for (const [label, viewport, minBlocks] of framings) {
      await evaluate(`(() => {
        window.editor.setCamera(
          window.__bboxBridge.reactFlowToTldraw(${JSON.stringify(viewport)}),
          { immediate: true },
        );
        return true;
      })()`);
      await sleep(400);
      const agreement = await cameraAgreement();
      assertLinked(`overlay ${label}`, agreement);
      const divergence = await evaluate(`window.__bboxMeasureNow()`);
      results.divergenceByZoom[label] = divergence
        ? { maxAbs: divergence.maxAbs, zoom: divergence.zoom, blocks: divergence.rows.length }
        : null;
      if (divergence == null) {
        failures.push(`overlay ${label}: no divergence measurement`);
      } else {
        if (divergence.maxAbs > 0.5) {
          failures.push(
            `overlay ${label}: hosts diverge by ${divergence.maxAbs.toFixed(2)}px`,
          );
        }
        if (divergence.rows.length < minBlocks) {
          failures.push(
            `overlay ${label}: only ${divergence.rows.length}/${minBlocks} blocks measurable`,
          );
        }
      }
    }
    // Leave the original framing for the mode screenshot.
    await evaluate(`(() => {
      window.editor.setCamera(
        window.__bboxBridge.reactFlowToTldraw({ x: 50, y: 90, zoom: 0.45 }),
        { immediate: true },
      );
      return true;
    })()`);
    await sleep(400);
    results.divergence = await evaluate(`window.__bboxMeasureNow()`);
    if (results.divergence == null) {
      failures.push("overlay: no divergence measurement");
    } else if (results.divergence.maxAbs > 0.5) {
      failures.push(
        `overlay: hosts diverge by ${results.divergence.maxAbs.toFixed(2)}px`,
      );
    }
  }

  results[`${mode}Shot`] = await screenshot(`compare-${mode}`);
}

/* ---- live linked cameras, driven by real gestures ---------------------- */
// Split mode: React Flow owns the left half, tldraw the right. Gesture in
// each pane, in both directions, and assert the OTHER pane followed. The
// gesture points sit low in each pane, clear of blocks, badges and the
// mode control.

await evaluate(`document.querySelector('[data-testid="compare-mode-split"]').click()`);
await sleep(800);

const before = await cameraAgreement();

// 1. Drag in the React Flow pane → tldraw follows.
await drag(700, 850, -120, -80);
const afterRfDrag = await cameraAgreement();
results.rfDrag = afterRfDrag;
if (Math.abs(afterRfDrag.vp.x - before.vp.x) < 60)
  failures.push(`rf drag: viewport barely moved (${before.vp.x} → ${afterRfDrag.vp.x})`);
assertLinked("rf drag", afterRfDrag);

// 2. Scroll in the React Flow pane → tldraw follows the zoom.
await wheel(700, 850, -240);
const afterRfWheel = await cameraAgreement();
results.rfWheel = afterRfWheel;
if (Math.abs(afterRfWheel.vp.zoom - afterRfDrag.vp.zoom) < 0.01)
  failures.push(`rf wheel: zoom did not change (${afterRfWheel.vp.zoom})`);
assertLinked("rf wheel", afterRfWheel);
results.splitZoomedShot = await screenshot("compare-split-zoomed");

// 3. Drag in the tldraw pane → React Flow follows.
await drag(1500, 850, -140, 60);
const afterTlDrag = await cameraAgreement();
results.tlDrag = afterTlDrag;
if (Math.abs(afterTlDrag.cam.x - afterRfWheel.cam.x) < 60 / afterTlDrag.cam.z)
  failures.push(`tl drag: camera barely moved (${afterRfWheel.cam.x} → ${afterTlDrag.cam.x})`);
assertLinked("tl drag", afterTlDrag);
results.splitPannedShot = await screenshot("compare-split-panned");

// 4. Scroll in the tldraw pane → React Flow follows the zoom.
await wheel(1500, 850, 240);
const afterTlWheel = await cameraAgreement();
results.tlWheel = afterTlWheel;
if (Math.abs(afterTlWheel.cam.z - afterTlDrag.cam.z) < 0.01)
  failures.push(`tl wheel: zoom did not change (${afterTlWheel.cam.z})`);
assertLinked("tl wheel", afterTlWheel);

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
