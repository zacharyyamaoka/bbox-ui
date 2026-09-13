#!/usr/bin/env node
/**
 * demos/capture-port-edge-v5.mjs
 *
 * The living regression for the five port-edge implementations
 * (packages/panel/src/portEdges/), driven in a real headless Chrome over raw
 * CDP with real Input.dispatchMouseEvent gestures, both themes.
 *
 * Zach, 2026-09-12: "The ports are buggy when you move them though —
 * stretching to strange dimensions. I think before we integrate this into the
 * block, let's please get the 'port edge' component working." So the gate
 * this file exists for is THE STRETCH GATE: at every drag, in every variant,
 * on all three hosts, the element that moves under the cursor is measured
 * against the live card it was grabbed from. A variant that scales its ghost
 * to a lane fails here, loudly, with the two rects printed.
 *
 * Everything it asserts is read from the page's own DOM or the host's own
 * editor object — never from the model it is testing.
 *
 * Usage: node demos/capture-port-edge-v5.mjs <url> <outDir> [variantId ...]
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg, ...only] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-port-edge-v5.mjs <url> <outDir> [variantId ...]");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

// `spacing` is the variant's own declared auto-mode scheme, and it selects
// which "the lane re-evened" assertion applies — flex evens card BOXES,
// t-placement evens port CENTRES. See `assertEvenCentres`.
const VARIANTS = [
  { id: "v1-lane-sortable", label: "V1 · Lane Sortable", spacing: "flex" },
  { id: "v2-lane-math", label: "V2 · Lane Math", spacing: "flex" },
  { id: "v3-slot-droppables", label: "V3 · Slot Droppables", spacing: "flex" },
  { id: "v4-rubber-band", label: "V4 · Rubber Band", spacing: "flex" },
  { id: "v5-page-space", label: "V5 · Page Space", spacing: "t" },
].filter((v) => only.length === 0 || only.includes(v.id));

const profile = mkdtempSync(path.join(tmpdir(), "bbox-portedge5-"));
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
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
});
const browser = new WebSocket(wsUrl);
await new Promise((resolve) => (browser.onopen = resolve));
let nextId = 0;
const pending = new Map();
let sessionId = null;
let consoleErrors = [];
browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
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
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}
let currentLabel = "start";
process.on("uncaughtException", async (err) => {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, `FAILED-${currentLabel}.png`), Buffer.from(data, "base64"));
  } catch {}
  console.error(`FAILED at ${currentLabel}\n`, err);
  chrome.kill();
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/* Page control                                                         */
/* ------------------------------------------------------------------ */

async function load(theme, variantId, component) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => {
    localStorage.clear();
    localStorage.setItem("theme", ${JSON.stringify(theme)});
    localStorage.setItem("bbox-ui.create.portEdgeVariant", ${JSON.stringify(variantId)});
  })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(700);
  assert((await evaluate(`document.documentElement.classList.contains("dark")`)) === (theme === "dark"), `theme ${theme} applied`);
  await evaluate(`(() => {
    const el = document.querySelector('[data-slot="component-picker"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(component)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor('[data-slot="instance-navigator"]');
  await sleep(500);
  // The switcher is the product surface, not the storage key: assert the
  // page actually shows the variant we asked for before believing anything
  // else this run measures.
  const shown = await evaluate(`document.querySelector('[data-slot="port-edge-picker"]')?.value`);
  assert(shown === variantId, `the bottom-right switcher shows ${variantId} (got ${shown})`);
  consoleErrors = [];
}

/** Sets one schema field on the CURRENT inspector subject, whichever control
 *  the panel design chose for it — a segmented strip, a named dropdown or a
 *  checkbox. Reading the rendered control rather than assuming one is what
 *  keeps this journey independent of the panel-variant lane. */
async function setField(fieldId, optionLabel, depth = 0) {
  assert(depth < 2, `field "${fieldId}" is reachable in the inspector`);
  const kind = await evaluate(`(() => {
    const row = document.querySelector('[data-field="${fieldId}"]');
    if (!row) return "missing";
    if (row.querySelector('input[type="checkbox"]')) return "toggle";
    if (row.querySelector('[data-slot="named-dropdown-trigger"]')) return "dropdown";
    if (row.querySelector("button")) return "segments";
    return "unknown";
  })()`);
  if (kind === "missing") {
    // The three lab controls classify as "advanced" (an ungoverned field with
    // a real labelled option set — fieldTiers.ts), and the panel opens on
    // Simple. Raise the detail level through the panel's own control rather
    // than reclassifying the fields, which would move rows for every other
    // component too.
    await evaluate(`document.querySelector('[data-slot="tier-button"][data-tier="expert"]').click()`);
    await sleep(300);
    return setField(fieldId, optionLabel, depth + 1);
  }
  assert(kind !== "unknown", `field "${fieldId}" has a control in the inspector (${kind})`);
  if (kind === "toggle") {
    await evaluate(`(() => {
      const box = document.querySelector('[data-field="${fieldId}"] input[type="checkbox"]');
      if (String(box.checked) !== ${JSON.stringify(String(optionLabel === "on"))}) box.click();
    })()`);
  } else if (kind === "segments") {
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-field="${fieldId}"] button'))
        .find((b) => b.textContent.trim() === ${JSON.stringify(optionLabel)});
      if (!btn) throw new Error("no segment " + ${JSON.stringify(optionLabel)} + " for ${fieldId}");
      btn.click();
    })()`);
  } else {
    await evaluate(`document.querySelector('[data-field="${fieldId}"] [data-slot="named-dropdown-trigger"]').click()`);
    await sleep(160);
    await evaluate(`(() => {
      const row = Array.from(document.querySelectorAll('[data-field="${fieldId}"] button, [role="option"], [data-slot="named-dropdown-row"]'))
        .find((b) => b.textContent.trim().startsWith(${JSON.stringify(optionLabel)}));
      if (!row) throw new Error("no dropdown row " + ${JSON.stringify(optionLabel)} + " for ${fieldId}");
      row.click();
    })()`);
  }
  await sleep(320);
}

/** Puts the port HOST (the PortEdges instance or the Block) back in the
 *  inspector — a press on a port selects that port, which swaps the subject
 *  and takes the host's own fields off screen. */
async function selectHost(hostId) {
  await evaluate(`(() => {
    const crumb = document.querySelector('[data-slot="members-path-crumb"][data-instance-id="${hostId}"]');
    if (crumb) { crumb.click(); return; }
    const dom = document.querySelector('[data-slot="dom-instance"][data-instance-id="${hostId}"]');
    if (dom) { dom.click(); return; }
    const row = document.querySelector('[data-slot="navigator-row"][data-instance-id="${hostId}"], [data-instance-id="${hostId}"]');
    if (row) { row.click(); return; }
    throw new Error("cannot reselect the host ${hostId}");
  })()`);
  await sleep(260);
}

/* ------------------------------------------------------------------ */
/* Lane geometry, read from what PAINTED                                */
/* ------------------------------------------------------------------ */

const HORIZONTAL = (edge) => edge === "top" || edge === "bottom";

async function laneInfo(edge) {
  return evaluate(`(() => {
    const laneRoot = document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="${edge}"]');
    if (!laneRoot) throw new Error("no lane for edge ${edge}");
    const track = laneRoot.querySelector('[data-slot="port-edge"]') || laneRoot;
    const rect = track.getBoundingClientRect();
    const horizontal = ${HORIZONTAL(edge)};
    const items = Array.from(laneRoot.querySelectorAll('[data-port-id]')).map((el) => {
      const box = el.getBoundingClientRect();
      const dot = el.querySelector('[data-slot="port-dot"]') || el;
      const d = dot.getBoundingClientRect();
      return {
        portId: el.getAttribute("data-port-id"),
        groupSize: Number(el.getAttribute("data-group-size") || "1"),
        groupKey: el.getAttribute("data-group-key") || null,
        boxStart: horizontal ? box.left : box.top,
        boxEnd: horizontal ? box.right : box.bottom,
        w: box.width, h: box.height,
        center: horizontal ? d.left + d.width / 2 : d.top + d.height / 2,
      };
    }).sort((a, b) => a.boxStart - b.boxStart);
    return { start: horizontal ? rect.left : rect.top, end: horizontal ? rect.right : rect.bottom, length: horizontal ? rect.width : rect.height, items };
  })()`);
}
async function laneIds(edge) {
  return (await laneInfo(edge)).items.map((i) => i.portId);
}
async function laneDropPoint(edge, fraction) {
  return evaluate(`(() => {
    const laneRoot = document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="${edge}"]');
    const track = laneRoot.querySelector('[data-slot="port-edge"]') || laneRoot;
    const r = track.getBoundingClientRect();
    const horizontal = ${HORIZONTAL(edge)};
    return {
      x: horizontal ? r.left + r.width * ${fraction} : r.left + r.width / 2,
      y: horizontal ? r.top + r.height / 2 : r.top + r.height * ${fraction},
    };
  })()`);
}
async function dotCenter(portId) {
  return evaluate(`(() => {
    const wrap = document.querySelector('[data-port-id="${portId}"]');
    if (!wrap) throw new Error("no card for ${portId}");
    const dot = wrap.querySelector('[data-slot="port-dot"]') || wrap;
    const r = dot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}
async function cardSize(portId) {
  return evaluate(`(() => {
    const el = document.querySelector('[data-port-id="${portId}"]');
    if (!el) throw new Error("no card for ${portId}");
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, edge: el.closest('[data-slot="port-lane"]')?.getAttribute("data-edge") ?? null };
  })()`);
}
/** Every gap from lane start to lane end must agree — that is what a lane
 *  "re-evening" after a port left or arrived actually means on screen. */
function assertEvenGaps(info, label, tol = 2.2) {
  if (info.items.length < 2) return;
  const gaps = [info.items[0].boxStart - info.start];
  for (let i = 1; i < info.items.length; i++) gaps.push(info.items[i].boxStart - info.items[i - 1].boxEnd);
  gaps.push(info.end - info.items[info.items.length - 1].boxEnd);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  gaps.forEach((g, i) => assert(Math.abs(g - avg) <= tol, `${label}: gap[${i}]=${g.toFixed(2)} vs avg ${avg.toFixed(2)} (${gaps.map((x) => x.toFixed(1)).join(",")})`));
}
/**
 * The same claim in the CENTRE metric, for a variant that places from `t`.
 *
 * `evenT(n, "evenly")` is `(i + 1) / (n + 1)` (portPlacement.ts:121), so a
 * t-placed lane evens the distances between port CENTRES — start-to-c0,
 * c0-to-c1, …, cLast-to-end all equal — while flex evens the distances
 * between card BOXES. With unequal label widths the two genuinely disagree,
 * and V5's DECISION 1 names that as the thing to judge rather than an
 * implementation detail. So each variant is measured against the scheme it
 * claims: neither is exempted, and this is the same structure and the same
 * tolerance as `assertEvenGaps`, just on centres.
 */
function assertEvenCentres(info, label, tol = 2.2) {
  if (info.items.length < 2) return;
  const steps = [info.items[0].center - info.start];
  for (let i = 1; i < info.items.length; i++) steps.push(info.items[i].center - info.items[i - 1].center);
  steps.push(info.end - info.items[info.items.length - 1].center);
  const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
  steps.forEach((s, i) => assert(Math.abs(s - avg) <= tol, `${label}: centre step[${i}]=${s.toFixed(2)} vs avg ${avg.toFixed(2)} (${steps.map((x) => x.toFixed(1)).join(",")})`));
}

/** Auto mode with a NON-uniform spacing scheme, or a variant that places from
 *  `t` instead of from flex, still has to put its cards in monotonically
 *  increasing order along the lane — the weaker claim that holds for all. */
function assertMonotonic(info, label) {
  for (let i = 1; i < info.items.length; i++) {
    assert(info.items[i].center > info.items[i - 1].center, `${label}: card ${i} paints before card ${i - 1}`);
  }
}

/* ------------------------------------------------------------------ */
/* The gate: the moving element never changes size                      */
/* ------------------------------------------------------------------ */

/**
 * Mid-drag, measure whatever is following the pointer — a DragOverlay ghost
 * for the variants that portal one, otherwise the live card itself — and
 * compare it to the card's size before the press.
 *
 * THIS is the assertion Zach's screenshots would have failed: the old
 * implementation passed `adjustScale` to DragOverlay, which let dnd-kit's own
 * `scaleX = over.rect.width / activeNodeRect.width` (core.esm.js:2997/:515)
 * through, and scaled the ghost to whichever LANE the pointer was over.
 */
async function measureMoving(portId) {
  return evaluate(`(() => {
    const lanes = Array.from(document.querySelectorAll('[data-slot="viewport-well"] [data-slot="port-lane"]'))
      .map((l) => { const r = l.getBoundingClientRect(); return { edge: l.getAttribute("data-edge"), w: r.width, h: r.height }; });
    const siblings = Array.from(document.querySelectorAll('[data-slot="viewport-well"] [data-port-id]'))
      .filter((el) => el.getAttribute("data-port-id") !== ${JSON.stringify(portId)})
      .map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, edge: el.closest('[data-slot="port-lane"]')?.getAttribute("data-edge") ?? null }; });
    const ghostRoot = Array.from(document.body.children).find(
      (n) => n.nodeType === 1 && getComputedStyle(n).position === "fixed" && n.querySelector('[data-slot="port-ghost"]'),
    );
    if (ghostRoot) {
      const inner = ghostRoot.querySelector('[data-slot="port-ghost"]');
      const r = inner.getBoundingClientRect();
      return { kind: "overlay", w: r.width, h: r.height,
               wrapperTransform: getComputedStyle(ghostRoot).transform,
               innerTransform: getComputedStyle(inner).transform,
               lanes, siblings };
    }
    const live = document.querySelector('[data-port-id="${portId}"]');
    if (!live) return null;
    const r = live.getBoundingClientRect();
    return { kind: "live", w: r.width, h: r.height,
             wrapperTransform: getComputedStyle(live).transform,
             innerTransform: "none",
             edge: live.closest('[data-slot="port-lane"]')?.getAttribute("data-edge") ?? null,
             lanes, siblings };
  })()`);
}

/** `matrix(a, b, c, d, tx, ty)` -> { a, d } — the two scale terms. */
function scaleOf(transform) {
  if (!transform || transform === "none") return { a: 1, d: 1 };
  const nums = transform.replace(/^matrix(3d)?\(/, "").replace(/\)$/, "").split(",").map((n) => Number(n.trim()));
  if (transform.startsWith("matrix3d")) return { a: nums[0], d: nums[5] };
  return { a: nums[0], d: nums[3] };
}

/** A real mouse drag. `onMid` runs while the button is still down. */
async function realDrag(from, to, onMid, steps = 8) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await sleep(20);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 1 });
    await sleep(28);
  }
  await sleep(90);
  let mid = null;
  if (onMid) mid = await onMid();
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left" });
  await sleep(340);
  return mid;
}

/** The gate, applied. `zoom` is what the host scales this subtree by, so the
 *  ghost — drawn outside every scaled ancestor and scaled back by us — must
 *  match the live card's ALREADY-zoomed rect 1:1. */
function assertNoStretch(before, mid, label, zoom = 1, tol = 2) {
  assert(mid, `${label}: something was following the pointer mid-drag`);

  // (1) THE GATE, stated exactly where the bug lived. dnd-kit's DndContext
  //     bakes `scaleX = over.rect.width / activeNodeRect.width` into the
  //     transform every draggable reads (core.esm.js:2997 -> adjustScale,
  //     :515) and `<DragOverlay adjustScale>` is the flag that lets it reach
  //     the overlay WRAPPER (:3657). Measured on the old code at zoom 1:
  //     the wrapper carried matrix(10.9217, 0, 0, 1.08333, …) over the
  //     364x26 top lane. So: the WRAPPER dnd-kit owns must carry NO scale at
  //     all, and the camera's zoom must be applied by us, on the inner div.
  const outer = scaleOf(mid.wrapperTransform);
  const inner = scaleOf(mid.innerTransform);
  assert(
    Math.abs(outer.a - 1) < 0.02 && Math.abs(outer.d - 1) < 0.02,
    `${label}: dnd-kit's own wrapper carries scale(${outer.a.toFixed(4)}, ${outer.d.toFixed(4)}) — that is the lane ratio leaking through (transform ${mid.wrapperTransform})`,
  );
  if (mid.kind === "overlay") {
    // The ghost is drawn at document.body, outside every scaled ancestor, so
    // the camera's zoom is ours to reapply — and it must be EXACTLY the
    // camera's, never a rect ratio.
    assert(
      Math.abs(inner.a - zoom) < 0.03 && Math.abs(inner.d - zoom) < 0.03,
      `${label}: the ghost is scaled by (${inner.a.toFixed(4)}, ${inner.d.toFixed(4)}) but the host camera is at ${zoom}`,
    );
  }

  // (2) …and it is a PORT-shaped box, not a LANE-shaped one. The old ghost
  //     painted exactly the lane's rect; this catches that even if a future
  //     variant achieves it with width/height instead of a transform.
  for (const lane of mid.lanes ?? []) {
    assert(
      !(Math.abs(mid.w - lane.w) < 3 && Math.abs(mid.h - lane.h) < 3),
      `${label}: the moving element is exactly the ${lane.edge} lane's box (${mid.w.toFixed(1)}x${mid.h.toFixed(1)}) — that is the stretch`,
    );
  }
  //     …compared against cards of the SAME ORIENTATION. A port card is
  //     shaped by the wall it sits on: on top/bottom the dot stacks above
  //     the label (narrow, tall), on left/right it sits beside it (wide,
  //     short) — visible in any seed capture. So the sibling set is filtered
  //     to lanes sharing the moving element's axis, which makes the bound
  //     TIGHTER than an all-siblings max wherever both orientations exist,
  //     and meaningful rather than arbitrary where only one does. For a
  //     ghost the axis is the SOURCE card's, since a ghost is a copy of it.
  //     WHY this is not a loosened gate: the same re-orientation exemption
  //     is already stated for check (3) below — a no-ghost variant's live
  //     card genuinely transposes when it crosses to a wall whose labels
  //     face a different way. It was simply never carried into this bound,
  //     so V4 (the only variant that moves the real card) was measured 30x95
  //     on the top lane against left-lane siblings 95.8x45 and failed by
  //     1.5px for having the correct shape.
  const axisOf = (edge) => (edge === "top" || edge === "bottom" ? "h" : "v");
  const movingAxis = axisOf(mid.kind === "overlay" ? before.edge : mid.edge);
  const sameAxis = (mid.siblings ?? []).filter((s2) => s2.edge && axisOf(s2.edge) === movingAxis);
  if (sameAxis.length > 0) {
    const widest = Math.max(1, ...sameAxis.map((s2) => s2.w));
    const tallest = Math.max(1, ...sameAxis.map((s2) => s2.h));
    assert(
      mid.w <= widest * 1.9 + 8 && mid.h <= tallest * 1.9 + 8,
      `${label}: the moving element (${mid.w.toFixed(1)}x${mid.h.toFixed(1)}) is far bigger than every live ${movingAxis === "h" ? "top/bottom" : "left/right"} port card (widest ${widest.toFixed(1)}, tallest ${tallest.toFixed(1)})`,
    );
  }
  //     …and ALWAYS against the card's own pre-drag size. A re-orientation
  //     transposes a card, it never inflates one, so neither axis may exceed
  //     the card's own longest dimension by the same factor — a bound that
  //     needs no sibling at all and still rejects the lane-shaped ghost
  //     (364 wide against a 95.8 source card) that started this.
  const longest = Math.max(1, before.w, before.h);
  assert(
    mid.w <= longest * 1.9 + 8 && mid.h <= longest * 1.9 + 8,
    `${label}: the moving element (${mid.w.toFixed(1)}x${mid.h.toFixed(1)}) outgrew the card it was grabbed from (${before.w.toFixed(1)}x${before.h.toFixed(1)}, longest side ${longest.toFixed(1)})`,
  );

  // (3) A variant that draws a GHOST owes an exact match to the card it was
  //     grabbed from — it is a copy, and a copy that is a different size is
  //     a different picture. A variant with no ghost is exempt from this one
  //     BY DESIGN: the live card it moves genuinely re-orients when it
  //     crosses to a wall whose labels face a different way, and punishing
  //     that would be punishing the variant for its own thesis.
  if (mid.kind === "overlay") {
    assert(
      Math.abs(mid.w - before.w) <= tol && Math.abs(mid.h - before.h) <= tol,
      `${label}: the ghost is ${mid.w.toFixed(1)}x${mid.h.toFixed(1)} but the card it was grabbed from is ${before.w.toFixed(1)}x${before.h.toFixed(1)}`,
    );
  }
  return {
    kind: mid.kind,
    edge: mid.kind === "overlay" ? before.edge : mid.edge,
    wrapperScaleX: Number(outer.a.toFixed(4)),
    wrapperScaleY: Number(outer.d.toFixed(4)),
    ghostScale: Number(inner.a.toFixed(4)),
    zoom,
    moving: { w: Number(mid.w.toFixed(1)), h: Number(mid.h.toFixed(1)) },
    source: { w: Number(before.w.toFixed(1)), h: Number(before.h.toFixed(1)) },
    lanes: (mid.lanes ?? []).map((l) => ({ edge: l.edge, w: Number(l.w.toFixed(1)), h: Number(l.h.toFixed(1)) })),
  };
}

async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 };
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}
const wellClip = async () =>
  evaluate(`(() => { const r = document.querySelector('[data-slot="viewport-well"]').getBoundingClientRect();
    return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.width), h: Math.ceil(r.height) }; })()`);

/* ================================================================== */
/* The run                                                             */
/* ================================================================== */

const manifest = [];
/**
 * A red variant is a RESULT, not the end of the run.
 *
 * Five candidates are being compared, so stopping at the first failed gate
 * would leave the other four unmeasured and the comparison unmakeable — and
 * would quietly tempt the next person to soften the gate to get their report
 * built. So a failure is caught, screenshotted, recorded in the manifest as
 * a `failed` entry, and the sweep moves on. Nothing is relaxed: the same
 * assertions throw at the same thresholds, and the exit code is still
 * non-zero if anything failed, so this cannot be mistaken for a green run.
 */
const failures = [];

for (const variant of VARIANTS) {
  for (const theme of ["dark", "light"]) {
    const tag = `${variant.id}-${theme}`;
    const files = {};
    const measures = {};
    console.log(`— ${variant.label} · ${theme}`);
    try {

    /* ---------- the standalone PortEdges bench ---------- */
    currentLabel = `${tag}-seed`;
    await load(theme, variant.id, "PortEdges");
    const hostId = await evaluate(`document.querySelector('[data-slot="dom-instance"]')?.getAttribute("data-instance-id")`);
    assert(hostId, "the PortEdges bench opens with a root instance");
    const well = await wellClip();
    files.seed = await screenshot(`${tag}-1-seed`, well);

    const top0 = await laneInfo("top");
    assert(top0.items.length === 4, `the top lane seeds four ports (${top0.items.length})`);
    assert((await laneIds("left")).length === 1, "the left lane seeds one port");
    assert((await laneIds("right")).length === 2, "the right lane seeds two ports");
    assert((await laneIds("bottom")).length === 1, "the bottom lane seeds one port");
    assertMonotonic(top0, "top lane, seed");
    const P = { p1: top0.items[0].portId, p2: top0.items[1].portId, p3: top0.items[2].portId, p4: top0.items[3].portId };
    P.p5 = (await laneIds("left"))[0];
    P.p8 = (await laneIds("bottom"))[0];

    /* ---------- 1 · AUTO, cross-edge, both lanes re-even ---------- */
    currentLabel = `${tag}-auto-cross-edge`;
    const beforeCard = await cardSize(P.p1);
    const fromP1 = await dotCenter(P.p1);
    const toLeft = await laneDropPoint("left", 0.3);
    measures.autoStretch = assertNoStretch(
      beforeCard,
      await realDrag(fromP1, toLeft, async () => {
        files.autoMidDrag = await screenshot(`${tag}-2-auto-mid-drag`, well);
        return measureMoving(P.p1);
      }),
      `${variant.label} · auto cross-edge`,
    );
    const topAfter = await laneInfo("top");
    const leftAfter = await laneInfo("left");
    assert(!topAfter.items.some((i) => i.portId === P.p1), `P1 left the top lane (${topAfter.items.map((i) => i.portId).join(",")})`);
    assert(leftAfter.items.some((i) => i.portId === P.p1), `P1 arrived on the left lane (${leftAfter.items.map((i) => i.portId).join(",")})`);
    assert(topAfter.items.length === 3 && leftAfter.items.length === 2, `three left on top, two now on left (${topAfter.items.length}/${leftAfter.items.length})`);
    // Each variant against the spacing scheme it actually claims — see
    // `assertEvenCentres`. Both are the same assertion in different metrics;
    // neither variant is let off one.
    const assertEvened = variant.spacing === "t" ? assertEvenCentres : assertEvenGaps;
    assertEvened(topAfter, `${variant.label}: the top lane re-evened after P1 left`);
    assertEvened(leftAfter, `${variant.label}: the left lane re-evened around P1`);
    files.autoAfter = await screenshot(`${tag}-3-auto-after`, well);
    measures.autoGaps = { top: topAfter.items.length, left: leftAfter.items.length };

    /* ---------- 2 · CUSTOM, the drop stays where you put it ---------- */
    currentLabel = `${tag}-custom`;
    await selectHost(hostId);
    await setField("custom", "on");
    const topCustom = await laneInfo("top");
    assert(topCustom.items.length === 3, "custom mode still draws the top lane's three ports");
    const beforeCustomCard = await cardSize(P.p4);
    const fromP4 = await dotCenter(P.p4);
    const target = await laneDropPoint("top", 0.78);
    measures.customStretch = assertNoStretch(
      beforeCustomCard,
      await realDrag(fromP4, target, () => measureMoving(P.p4)),
      `${variant.label} · custom drag`,
    );
    const topDropped = await laneInfo("top");
    const landed = topDropped.items.find((i) => i.portId === P.p4);
    assert(landed, `P4 is still on the top lane after a custom drag (${topDropped.items.map((i) => i.portId).join(",")})`);
    const landedT = (landed.center - topDropped.start) / topDropped.length;
    assert(Math.abs(landedT - 0.78) < 0.10, `${variant.label}: the custom drop STAYED at t≈0.78 (painted t=${landedT.toFixed(3)})`);
    assertMonotonic(topDropped, `${variant.label}: custom lane order = rank(t)`);
    measures.customT = Number(landedT.toFixed(3));
    files.custom = await screenshot(`${tag}-4-custom`, well);

    /* ---------- 3 · GROUPING, a pair moves as a rigid body ---------- */
    currentLabel = `${tag}-grouped`;
    await selectHost(hostId);
    await setField("custom", "off");
    await setField("grouping", "Grouped");
    const grouped = await laneInfo("top");
    const pair = grouped.items.filter((i) => i.groupKey);
    assert(pair.length === 2, `the grouping set marks two cards as one family (${pair.length})`);
    files.grouped = await screenshot(`${tag}-5-grouped`, well);

    const beforeGroupCard = await cardSize(P.p2);
    const fromP2 = await dotCenter(P.p2);
    const toBottom = await laneDropPoint("bottom", 0.5);
    measures.groupStretch = assertNoStretch(
      beforeGroupCard,
      await realDrag(fromP2, toBottom, () => measureMoving(P.p2)),
      `${variant.label} · group drag`,
    );
    const bottomIds = await laneIds("bottom");
    assert(bottomIds.includes(P.p2) && bottomIds.includes(P.p3),
      `${variant.label}: dragging one member of the pair carried BOTH to the bottom lane (${bottomIds.join(",")})`);
    files.groupMoved = await screenshot(`${tag}-6-group-moved`, well);

    /* ---------- 4 · COLLAPSE, one card at the first member ---------- */
    currentLabel = `${tag}-collapsed`;
    await selectHost(hostId);
    await setField("grouping", "Collapsed");
    const bottomCollapsed = await laneInfo("bottom");
    const card = bottomCollapsed.items.find((i) => i.groupSize === 2);
    assert(card, `${variant.label}: the collapsed set draws ONE card carrying both ports (sizes ${bottomCollapsed.items.map((i) => i.groupSize).join(",")})`);
    assert(!bottomCollapsed.items.some((i) => i.portId === P.p3),
      `${variant.label}: the second member is folded into the first's card, not drawn beside it`);
    files.collapsed = await screenshot(`${tag}-7-collapsed`, well);
    await selectHost(hostId);
    await setField("grouping", "Off");

    manifest.push({ variant: variant.id, label: variant.label, theme, host: "dom", files, measures, console: Array.from(new Set(consoleErrors)) });

    /* ---------- 5 · the two canvas hosts, at a real camera zoom ------ */
    for (const host of [
      { render: "reactflow", zoom: 1.5 },
      { render: "tldraw", zoom: 2.5 },
    ]) {
      currentLabel = `${tag}-${host.render}`;
      const hostFiles = {};
      const hostMeasures = {};
      await load(theme, variant.id, "Block");
      const blockId = await evaluate(`document.querySelector('[data-slot="dom-instance"]')?.getAttribute("data-instance-id")`);
      await evaluate(`document.querySelector('[data-slot="render-tab"][data-render="${host.render}"]').click()`);
      await waitFor(`[data-slot="${host.render}-canvas"]`);
      await sleep(700);

      // Put the camera at a zoom other than 1 — the whole point of this half
      // of the journey, since every geometry bug in a scaled host is
      // invisible at zoom 1.
      if (host.render === "reactflow") {
        await waitFor(`.react-flow__node[data-id="${blockId}"]`);
        await evaluate(`window.__bboxReactFlow.zoomTo(${host.zoom}, { duration: 0 })`);
      } else {
        await waitFor('[data-slot="tl-instance"]');
        await evaluate(`(() => { const e = window.__bboxEditor; e.setCamera({ ...e.getCamera(), z: ${host.zoom} }, { immediate: true }); })()`);
      }
      await sleep(700);
      // A camera move re-renders the host, and the Block's lanes come back a
      // frame or two later. Wait for a real painted card rather than sleeping
      // long enough and hoping.
      await waitFor('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="left"] [data-port-id]');
      await sleep(250);
      const liveZoom = await evaluate(
        host.render === "reactflow"
          ? `window.__bboxReactFlow.getZoom()`
          : `window.__bboxEditor.getZoomLevel()`,
      );
      assert(Math.abs(liveZoom - host.zoom) < 0.05, `${host.render} camera is at ${host.zoom} (got ${liveZoom})`);
      hostMeasures.zoom = liveZoom;

      const anchorBefore = await evaluate(
        host.render === "reactflow"
          ? `document.querySelector('.react-flow__node[data-id="${blockId}"]').style.transform`
          : `(() => { const s = window.__bboxEditor.getCurrentPageShapes().find((s) => s.props?.instanceId === "${blockId}"); return s ? JSON.stringify({x: s.x, y: s.y}) : null; })()`,
      );
      assert(anchorBefore, `${host.render}: the Block's node/shape exists`);

      const leftIds = await laneIds("left");
      const dragId = leftIds[0];
      assert(dragId, `${host.render}: the Block has a port to drag`);
      const beforeHostCard = await cardSize(dragId);
      const fromHost = await dotCenter(dragId);
      const toHost = await laneDropPoint("top", 0.5);
      hostMeasures.stretch = assertNoStretch(
        beforeHostCard,
        await realDrag(fromHost, toHost, async () => {
          hostFiles.midDrag = await screenshot(`${tag}-${host.render}-mid-drag`, await wellClip());
          return measureMoving(dragId);
        }),
        `${variant.label} · ${host.render} @ ${host.zoom}`,
        liveZoom,
        3,
      );
      const anchorAfter = await evaluate(
        host.render === "reactflow"
          ? `document.querySelector('.react-flow__node[data-id="${blockId}"]').style.transform`
          : `(() => { const s = window.__bboxEditor.getCurrentPageShapes().find((s) => s.props?.instanceId === "${blockId}"); return s ? JSON.stringify({x: s.x, y: s.y}) : null; })()`,
      );
      assert(anchorBefore === anchorAfter,
        `${variant.label} · ${host.render}: the host never moved the node/shape during a port drag (before ${anchorBefore} after ${anchorAfter})`);
      hostMeasures.anchor = anchorBefore;
      const movedTop = await laneIds("top");
      hostMeasures.landedOnTop = movedTop.includes(dragId);
      hostFiles.after = await screenshot(`${tag}-${host.render}-after`, await wellClip());
      manifest.push({ variant: variant.id, label: variant.label, theme, host: host.render, files: hostFiles, measures: hostMeasures, console: Array.from(new Set(consoleErrors)) });
    }
    } catch (err) {
      const message = String(err && err.message ? err.message : err).replace(/^ASSERT:\s*/, "");
      let shot = null;
      try {
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        shot = `FAILED-${currentLabel}.png`;
        writeFileSync(path.join(outDir, shot), Buffer.from(data, "base64"));
      } catch {}
      console.error(`  ✗ FAILED at ${currentLabel}: ${message}`);
      failures.push({ variant: variant.id, theme, at: currentLabel, message });
      manifest.push({ variant: variant.id, label: variant.label, theme, host: "dom", files, measures,
                      failed: { at: currentLabel, message, shot },
                      console: Array.from(new Set(consoleErrors)) });
    }
  }
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(outDir, "failures.json"), JSON.stringify(failures, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
if (failures.length > 0) {
  console.error(`RED — ${failures.length} failed gate(s), ${manifest.length} entries → ${outDir}`);
  for (const f of failures) console.error(`  ${f.at}: ${f.message}`);
  process.exit(1);
}
console.log(`PASS — ${manifest.length} entries → ${outDir}`);
