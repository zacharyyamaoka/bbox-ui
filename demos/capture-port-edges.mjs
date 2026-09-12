#!/usr/bin/env node
/**
 * The living regression for Zach's 2026-09-12 Arrangement/Placement model
 * (packages/bbox-ui/src/portPlacement.ts): a Block owns its Ports, a Block
 * has n Arrangements (states, minimum one "default"), each Arrangement has
 * a mode (auto | custom), a set of live edges, and an optional grouping
 * set; each Port stores, PER ARRANGEMENT, a Placement { edge, order, t,
 * group?, groupOrder? }.
 *
 * Drives headless Chrome over raw CDP, both themes; every assertion reads
 * the page's own DOM. Writes PNGs + manifest.json for the ROUND4 section of
 * docs/build_tree_and_slots.py.
 *
 * Usage: node demos/capture-port-edges.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-port-edges.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-portedges-"));
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
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(220);
}
async function setInputValue(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event("input", { bubbles: true }));
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

/* ------------------------------------------------------------------ */
/* Members / inspector helpers                                         */
/* ------------------------------------------------------------------ */
async function memberIdByTitle(title) {
  const id = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('[data-slot="member-row"]'));
    const row = rows.find((r) => r.querySelector('[data-slot="member-title"]')?.textContent.trim() === ${JSON.stringify(title)});
    return row ? row.getAttribute("data-member-id") : null;
  })()`);
  assert(id, `no member row titled "${title}"`);
  return id;
}
/** The Block currently under test, set once per theme — lets `selectMember`
 *  recover the Ports list (see below) without every call site threading it
 *  through. */
let currentBlockId = null;
async function selectMember(id) {
  // A Port's OWN member row lives in the Block's Ports list, which only
  // renders while the BLOCK is the inspector's subject — and pressing a
  // Port (a plain click, or the start of a drag) just made THAT Port the
  // subject, per render-instance.tsx's combined pointerdown handler. So a
  // second click, from a member row that no longer exists, is expected
  // after every prior selection: reselect the Block first, once.
  const found = await evaluate(`!!document.querySelector('[data-slot="member-row"][data-member-id="${id}"] [data-slot="member-select"]')`);
  if (!found && currentBlockId) await selectBlock(currentBlockId);
  await evaluate(`(() => {
    const row = document.querySelector('[data-slot="member-row"][data-member-id="${id}"] [data-slot="member-select"]');
    if (!row) throw new Error("member row not found: ${id}");
    row.click();
  })()`);
  await sleep(200);
}
/** Reselects the Block ITSELF (a root instance, not a member row) — via
 *  the breadcrumb back to it when the subject is presently one of its
 *  members, else the DOM canvas' own root wrapper. Needed because a press
 *  on a Port also selects it (render-instance.tsx's combined pointerdown
 *  handler fires on every press, drag or not), which knocks the Block out
 *  of the inspector along with its member lists. */
async function selectBlock(id) {
  await evaluate(`(() => {
    const crumb = document.querySelector('[data-slot="members-path-crumb"][data-instance-id="${id}"]');
    if (crumb) { crumb.click(); return; }
    const domInst = document.querySelector('[data-slot="dom-instance"][data-instance-id="${id}"]');
    if (domInst) { domInst.click(); return; }
    throw new Error("cannot select the Block: no breadcrumb or dom-instance for ${id}");
  })()`);
  await sleep(200);
}
/** Reads the Placement section for `id` (selecting it first). */
async function placementOf(id) {
  await selectMember(id);
  return evaluate(`(() => {
    const edgeSel = document.querySelector('[data-slot="placement-edge"]');
    const orderInp = document.querySelector('[data-slot="placement-order"]');
    const tInp = document.querySelector('[data-slot="placement-t"]');
    if (!edgeSel || !orderInp || !tInp) throw new Error("placement section not visible");
    return { edge: edgeSel.value, order: Number(orderInp.value), t: Number(tInp.value) };
  })()`);
}
/** `Add` a member through the Nth member list (the Ports list, per
 *  members-section.tsx's own doc, is appended LAST — index 7 on a fresh
 *  slotted Block: header L/C/R, body, footer L/C/R, then Ports). */
async function addVia(type, listIndex) {
  // shared.tsx's AddMemberMenu adds directly, with no menu, when the list
  // accepts exactly one type (the Block's Ports list, per MEMBER_SPECS.Block
  // = {accepts:["Port"]}) — so the type row only exists to click when a menu
  // actually opened.
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(150);
  const menuRow = await evaluate(`(() => { const s = document.querySelectorAll('[data-slot="members-section"]')[${listIndex}]; return !!(s && s.querySelector('[data-slot="add-member-type"][data-type="${type}"]')); })()`);
  if (menuRow) await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-type"][data-type="${type}"]').click()`);
  await sleep(250);
}

/* ------------------------------------------------------------------ */
/* Lane / dot geometry                                                  */
/* ------------------------------------------------------------------ */
const HORIZONTAL = (edge) => edge === "top" || edge === "bottom";
/** Every rendered card on `edge`'s lane, sorted along the lane's own axis —
 *  reads `[data-port-id]` (`port-group`'s own head marker, see bench.tsx),
 *  never the model, so this proves what actually PAINTED. */
async function laneInfo(edge) {
  return evaluate(`(() => {
    const laneRoot = document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="${edge}"]');
    if (!laneRoot) throw new Error("no lane for edge ${edge}");
    const container = laneRoot.querySelector('[data-slot="port-edge"]') || laneRoot;
    const rect = container.getBoundingClientRect();
    const horizontal = ${HORIZONTAL(edge)};
    const cards = Array.from(laneRoot.querySelectorAll('[data-port-id]'));
    const items = cards.map((el) => {
      const box = el.getBoundingClientRect();
      const dot = el.querySelector('[data-slot="port-dot"]');
      const dotRect = (dot || el).getBoundingClientRect();
      return {
        portId: el.getAttribute("data-port-id"),
        groupSize: Number(el.getAttribute("data-group-size") || "1"),
        // The flex ITEM's own box edges — what "justify-evenly" actually
        // spaces — not the dot's center, which sits at a fixed offset
        // INSIDE that box (the dot + its label) and so measures a
        // different (and item-size-dependent) gap pattern.
        boxStart: horizontal ? box.left : box.top,
        boxEnd: horizontal ? box.right : box.bottom,
        center: horizontal ? dotRect.left + dotRect.width / 2 : dotRect.top + dotRect.height / 2,
      };
    }).sort((a, b) => a.boxStart - b.boxStart);
    return { start: horizontal ? rect.left : rect.top, end: horizontal ? rect.right : rect.bottom, items };
  })()`);
}
/** A point at `fraction` (0..1) along `edge`'s lane, for a real-mouse drop. */
async function laneDropPoint(edge, fraction) {
  return evaluate(`(() => {
    const laneRoot = document.querySelector('[data-slot="viewport-well"] [data-slot="port-lane"][data-edge="${edge}"]');
    if (!laneRoot) throw new Error("no lane for edge ${edge}");
    const container = laneRoot.querySelector('[data-slot="port-edge"]') || laneRoot;
    const r = container.getBoundingClientRect();
    const horizontal = ${HORIZONTAL(edge)};
    return {
      x: horizontal ? r.left + r.width * ${fraction} : r.left + r.width / 2,
      y: horizontal ? r.top + r.height / 2 : r.top + r.height * ${fraction},
    };
  })()`);
}
async function dotCenter(portId) {
  return evaluate(`(() => {
    const wrap = document.querySelector('[data-port-id="${portId}"]') || document.querySelector('[data-slot="port-locked"] [data-instance-id="${portId}"]');
    if (!wrap) throw new Error("dot wrapper not found for ${portId}");
    const dot = wrap.querySelector('[data-slot="port-dot"]') || wrap;
    const r = dot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}
/** justify-evenly puts EQUAL space before the first item, between every
 *  pair, and after the last — so every one of the N+1 gaps from lane-start
 *  to lane-end must agree within `tol` px. */
function assertEvenGaps(info, label, tol = 2) {
  if (info.items.length === 0) return;
  const gaps = [info.items[0].boxStart - info.start];
  for (let i = 1; i < info.items.length; i++) gaps.push(info.items[i].boxStart - info.items[i - 1].boxEnd);
  gaps.push(info.end - info.items[info.items.length - 1].boxEnd);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  gaps.forEach((g, i) => assert(Math.abs(g - avg) <= tol, `${label}: gap[${i}]=${g.toFixed(2)}px vs avg ${avg.toFixed(2)}px (gaps ${gaps.map((x) => x.toFixed(1)).join(",")})`));
}
/** custom mode's own invariant: order = rank(t) — whichever port has the
 *  smaller t must have the smaller order, for every port passed in. */
function assertRankMatchesT(entries, label) {
  const byT = [...entries].sort((a, b) => a.t - b.t);
  byT.forEach((e, i) => assert(e.order === i, `${label}: ${e.name} expected order ${i} for t=${e.t.toFixed(3)}, got order ${e.order}`));
}

/** A real mouse drag over CDP: press, several intermediate moves (past
 *  dnd-kit's PointerSensor 4px activation distance), release. */
async function realDrag(from, to, steps = 8) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await sleep(20);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 1 });
    await sleep(25);
  }
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left" });
  await sleep(300);
}

const inspectorClip = async () => {
  const r = await rectOf('[data-slot="inspector-column"]');
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) };
};
const wellClip = async () => {
  const r = await rectOf('[data-slot="viewport-well"]');
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) };
};

const manifest = [];
for (const theme of ["dark", "light"]) {
  console.log(`— ${theme}`);
  await load(theme, "Block");
  const files = {};
  const blockId = await evaluate(`document.querySelector('[data-slot="dom-instance"]')?.getAttribute("data-instance-id")`);
  assert(blockId, "the Block bench opens with a root Block instance");
  currentBlockId = blockId;
  const inId = await memberIdByTitle("in");
  const cfgId = await memberIdByTitle("cfg");
  const outId = await memberIdByTitle("out");

  /* 1 · three seeded ports, two left one right, even spacing */
  const well = await wellClip();
  files.initial = await screenshot(`${theme}-1-initial`, well);
  const left0 = await laneInfo("left");
  const right0 = await laneInfo("right");
  assert(left0.items.map((i) => i.portId).join(",") === [inId, cfgId].join(","), `left lane holds in,cfg in seed order (${left0.items.map((i) => i.portId).join(",")})`);
  assert(right0.items.map((i) => i.portId).join(",") === [outId].join(","), `right lane holds out (${right0.items.map((i) => i.portId).join(",")})`);
  assertEvenGaps(left0, "left lane, seed");
  assertEvenGaps(right0, "right lane, seed");

  /* 2 · DOM, auto mode: drag "in" from left to top; assert the lane change
   *     and that BOTH lanes re-even around what is left / what arrived. */
  const inDot = await dotCenter(inId);
  const topDrop = await laneDropPoint("top", 0.5);
  await realDrag(inDot, topDrop);
  const leftAfterDrag = await laneInfo("left");
  const topAfterDrag = await laneInfo("top");
  assert(leftAfterDrag.items.map((i) => i.portId).join(",") === cfgId, `left now holds only cfg (${leftAfterDrag.items.map((i) => i.portId).join(",")})`);
  assert(topAfterDrag.items.map((i) => i.portId).join(",") === inId, `top now holds in (${topAfterDrag.items.map((i) => i.portId).join(",")})`);
  assertEvenGaps(leftAfterDrag, "left lane, after the drag (re-evened)");
  assertEvenGaps(topAfterDrag, "top lane, after the drag (re-evened)");
  files.draggedTop = await screenshot(`${theme}-2-dragged-to-top`, well);

  /* 3 · add a 4th port ("Port A") — parks on top (the first live edge),
   *     appended after "in". A press on a Port also SELECTS it (the
   *     combined pointerdown handler fires on every press, drag or not),
   *     so the subject is "in" here — reselect the Block first, whose
   *     Ports list is section index 7 on a slotted Block: header L/C/R,
   *     body, footer L/C/R, Ports (members-section.tsx). */
  await selectBlock(blockId);
  await addVia("Port", 7);
  const portAId = await memberIdByTitle("Port A");
  const topWithTwo = await laneInfo("top");
  assert(topWithTwo.items.map((i) => i.portId).sort().join(",") === [inId, portAId].sort().join(","), `top now holds in + Port A (${topWithTwo.items.map((i) => i.portId).join(",")})`);

  /* 3.5 · regression for inspector-column.tsx:91 — Port A has no
   *       `placements` entry yet (bare `makeInstance`, no refresh() was
   *       triggered by add or by selecting it), so its Placement section
   *       computes `defaultPlacement` on the fly from whatever `ports`
   *       list it's handed. Selecting it must show the SAME Order the
   *       canvas already painted (appended after "in", which the drag in
   *       step 2 gave a real stored placement) — a single-port `ports`
   *       list instead computes Order 0, diverging from the canvas. */
  const paintedTopOrder = Object.fromEntries(topWithTwo.items.map((item, i) => [item.portId, i]));
  const portAInspectorPlacement = await placementOf(portAId);
  assert(portAInspectorPlacement.edge === "top", `Port A inspector shows edge top (${portAInspectorPlacement.edge})`);
  assert(
    portAInspectorPlacement.order === paintedTopOrder[portAId],
    `Port A inspector Order matches the canvas' painted order (inspector ${portAInspectorPlacement.order}, canvas ${paintedTopOrder[portAId]})`,
  );

  /* 4 · switch the Arrangement to custom via the inspector */
  await selectBlock(blockId);
  await click('[data-slot="arrangement-mode"] button[data-mode="custom"]');
  assert((await evaluate(`document.querySelector('[data-slot="arrangement-mode"] button[data-mode="custom"]')?.getAttribute("aria-pressed")`)) === "true", "custom mode is active");
  files.customMode = await screenshot(`${theme}-3-custom-mode`, await inspectorClip());

  /* 5 · custom mode: drag Port A across the top lane; t is stored and
   *     order = rank(t) for both ports sharing that lane. */
  const portADot = await dotCenter(portAId);
  const pastMiddle = await laneDropPoint("top", 0.62);
  await realDrag(portADot, pastMiddle);
  const portAPlacement = await placementOf(portAId);
  const inPlacement = await placementOf(inId);
  assert(portAPlacement.edge === "top" && inPlacement.edge === "top", "both stay on top");
  assert(portAPlacement.t > 0.05, `Port A's t moved off its parked 0 (${portAPlacement.t})`);
  assertRankMatchesT([{ name: "in", ...inPlacement }, { name: "Port A", ...portAPlacement }], "top lane, custom mode");
  files.reorderedInspector = await screenshot(`${theme}-4-reordered-inspector`, await inspectorClip());
  files.reordered = await screenshot(`${theme}-4-reordered`, well);

  /* 6 · a second Arrangement: change a port's edge there, switch back to
   *     default, and the default's own placements are exactly as before. */
  await selectBlock(blockId);
  const before = {};
  for (const id of [inId, cfgId, outId, portAId]) before[id] = await placementOf(id);

  await selectBlock(blockId);
  await click('[data-slot="arrangement-add"]');
  const arrangement2 = await evaluate(`document.querySelector('[data-slot="arrangement-picker"]')?.value`);
  assert(arrangement2 && arrangement2 !== "default", `a new Arrangement is active (${arrangement2})`);

  await selectMember(cfgId);
  await setSelect('[data-slot="placement-edge"]', "bottom");
  const cfgInArrangement2 = await placementOf(cfgId);
  assert(cfgInArrangement2.edge === "bottom", "cfg's edge changed in the NEW arrangement");
  const bottomInArrangement2 = await laneInfo("bottom");
  assert(bottomInArrangement2.items.some((i) => i.portId === cfgId), "cfg now paints on the bottom lane in the new arrangement");
  files.secondArrangement = await screenshot(`${theme}-5-second-arrangement`, well);

  await selectBlock(blockId);
  await setSelect('[data-slot="arrangement-picker"]', "default");
  const after = {};
  for (const id of [inId, cfgId, outId, portAId]) after[id] = await placementOf(id);
  for (const id of [inId, cfgId, outId, portAId]) {
    assert(
      before[id].edge === after[id].edge && before[id].order === after[id].order && before[id].t === after[id].t,
      `default's placement for ${id} unchanged: before ${JSON.stringify(before[id])} after ${JSON.stringify(after[id])}`,
    );
  }
  files.backToDefault = await screenshot(`${theme}-6-back-to-default`, well);

  /* 7 · toggle the left edge off: cfg is drawn parked on the nearest live
   *     edge walking clockwise (top); toggle back on, it returns. */
  await selectBlock(blockId);
  await click('[data-slot="arrangement-edge"][data-edge="left"]');
  const leftOff = await laneInfo("left");
  const topWhileLeftOff = await laneInfo("top");
  assert(leftOff.items.length === 0, `left lane painted empty while off (${leftOff.items.map((i) => i.portId).join(",")})`);
  assert(topWhileLeftOff.items.some((i) => i.portId === cfgId), `cfg parks on top, the nearest live edge (${topWhileLeftOff.items.map((i) => i.portId).join(",")})`);
  files.edgeOffParked = await screenshot(`${theme}-7-left-off-parked`, well);

  /* 7b · the Placement inspector's Edge <select> must show cfg's TRUE
   *      stored edge ("left") while it's parked on top, not silently fall
   *      back to a live edge — the arrangement-section.tsx regression:
   *      the select's controlled `value` must resolve to one of its own
   *      `<option>`s, so the parked edge has to be injected as an option
   *      even though it's off the live set. */
  await selectMember(cfgId);
  const parkedEdgeSelect = await evaluate(`(() => {
    const sel = document.querySelector('[data-slot="placement-edge"]');
    if (!sel) throw new Error("no placement-edge select while cfg is parked");
    return { value: sel.value, options: Array.from(sel.options).map((o) => o.value) };
  })()`);
  assert(
    parkedEdgeSelect.value === "left",
    `cfg's Edge <select> must show its true stored edge "left" while parked, not a live-edge fallback (value=${parkedEdgeSelect.value}, options=${parkedEdgeSelect.options.join(",")})`,
  );
  assert(
    parkedEdgeSelect.options.includes("left"),
    `cfg's Edge <select> options must include the true parked edge "left" so the controlled value actually resolves (options=${parkedEdgeSelect.options.join(",")})`,
  );
  await selectBlock(blockId);

  await click('[data-slot="arrangement-edge"][data-edge="left"]');
  const leftBackOn = await laneInfo("left");
  assert(leftBackOn.items.some((i) => i.portId === cfgId), `cfg is back on left (${leftBackOn.items.map((i) => i.portId).join(",")})`);
  files.edgeOnRestored = await screenshot(`${theme}-8-left-restored`, well);

  /* 8 · group "in" and "Port A" (both on top): a collapsed set renders one
   *     card. */
  await selectBlock(blockId);
  await setSelect('[data-slot="arrangement-grouping"]', "__new__");
  await selectMember(inId);
  await setInputValue('[data-slot="placement-group"]', "g1");
  await selectMember(portAId);
  await setInputValue('[data-slot="placement-group"]', "g1");
  const topGrouped = await laneInfo("top");
  assert(topGrouped.items.length === 1, `top lane collapses in+Port A into one card (${topGrouped.items.length} cards)`);
  assert(topGrouped.items[0].groupSize === 2, `the card's group-size is 2 (${topGrouped.items[0].groupSize})`);
  files.grouped = await screenshot(`${theme}-9-grouped`, well);

  /* 9 · lock "out": pinned at the header-left corner; a drag leaves it in
   *     place. */
  await selectMember(outId);
  await click('[data-slot="placement-locked"]');
  assert(await evaluate(`!!document.querySelector('[data-slot="port-locked"] [data-instance-id="${outId}"]')`), "out is pinned at the corner marker");
  const rightAfterLock = await laneInfo("right");
  assert(rightAfterLock.items.length === 0, `right lane is empty once out is locked (${rightAfterLock.items.map((i) => i.portId).join(",")})`);
  files.locked = await screenshot(`${theme}-10-locked`, well);

  const lockedBefore = await evaluate(`document.querySelector('[data-slot="port-locked"] [data-instance-id="${outId}"]').getBoundingClientRect().toJSON()`);
  const lockedDot = await dotCenter(outId);
  await realDrag(lockedDot, { x: lockedDot.x + 120, y: lockedDot.y + 80 });
  const lockedAfter = await evaluate(`document.querySelector('[data-slot="port-locked"] [data-instance-id="${outId}"]').getBoundingClientRect().toJSON()`);
  assert(Math.abs(lockedBefore.x - lockedAfter.x) < 1 && Math.abs(lockedBefore.y - lockedAfter.y) < 1, `the locked port did not move (before ${JSON.stringify(lockedBefore)} after ${JSON.stringify(lockedAfter)})`);

  /* 10 · React Flow: a port drag never moves the node. */
  await click('[data-slot="render-tab"][data-render="reactflow"]');
  await waitFor('[data-slot="reactflow-canvas"]');
  await waitFor(`.react-flow__node[data-id="${blockId}"]`);
  await sleep(400);
  const rfTransform = () => evaluate(`document.querySelector('.react-flow__node[data-id="${blockId}"]')?.style.transform`);
  const rfBefore = await rfTransform();
  const cfgDotRf = await dotCenter(cfgId);
  await realDrag(cfgDotRf, { x: cfgDotRf.x, y: cfgDotRf.y + 40 });
  const rfAfter = await rfTransform();
  assert(rfBefore === rfAfter, `the React Flow node's transform is unchanged by a port drag (before "${rfBefore}" after "${rfAfter}")`);
  files.reactflow = await screenshot(`${theme}-11-reactflow`, await rectOf('[data-slot="viewport-well"]').then((r) => ({ left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) })));

  /* 11 · tldraw: a port drag never moves the shape (or enters the
   *      select tool's own shape-pointing/translating states). */
  await click('[data-slot="render-tab"][data-render="tldraw"]');
  await waitFor('[data-slot="tldraw-canvas"]');
  await waitFor('[data-slot="tl-instance"]');
  await sleep(500);
  const shapeXY = () => evaluate(`(() => {
    const editor = window.__bboxEditor;
    const shape = editor.getCurrentPageShapes().find((s) => s.props?.instanceId === "${blockId}");
    return shape ? { x: shape.x, y: shape.y } : null;
  })()`);
  const tlBefore = await shapeXY();
  assert(tlBefore, "the Block's tldraw shape exists");
  const cfgDotTl = await dotCenter(cfgId);
  const target = { x: cfgDotTl.x, y: cfgDotTl.y + 40 };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cfgDotTl.x, y: cfgDotTl.y, buttons: 0 });
  await sleep(20);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: cfgDotTl.x, y: cfgDotTl.y, button: "left", clickCount: 1 });
  await sleep(40);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x, y: target.y, buttons: 1 });
  await sleep(60);
  const pathMidDrag = await evaluate(`window.__bboxEditorPath ? window.__bboxEditorPath() : null`);
  await sleep(60);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left" });
  await sleep(300);
  const tlAfter = await shapeXY();
  assert(Math.abs(tlBefore.x - tlAfter.x) < 0.5 && Math.abs(tlBefore.y - tlAfter.y) < 0.5, `the tldraw shape's x/y is unchanged by a port drag (before ${JSON.stringify(tlBefore)} after ${JSON.stringify(tlAfter)})`);
  if (pathMidDrag) assert(!/pointing_shape|translating/.test(pathMidDrag), `the select tool never entered a shape-drag state (path: ${pathMidDrag})`);
  files.tldraw = await screenshot(`${theme}-12-tldraw`, await rectOf('[data-slot="viewport-well"]').then((r) => ({ left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) })));

  manifest.push({ theme, console: Array.from(new Set(consoleErrors)), files });
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
console.log(`PASS — ${manifest.length} entries → ${outDir}`);
