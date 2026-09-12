#!/usr/bin/env node
/**
 * The living regression for Zach's 2026-09-12 inspector feedback, and the
 * capture run behind docs/build_inspector_v5.py.
 *
 * Drives headless Chrome over raw CDP — no Playwright, no puppeteer — in
 * both themes, over the SAME fixture for every design: a Block with its
 * three seeded ports plus a Glyph in header·left and a Pill in
 * header·right, both added through the app's own Add menu rather than
 * seeded behind its back.
 *
 * Per design it screenshots the whole inspector, folds and unfolds a member
 * list by the chevron on its own header, hides and restores the header
 * region through the standard toggle row, switches the arrangement mode
 * through the standard segmented row, drags a port to reorder it with real
 * mouse events, and asserts the five hard gates:
 *
 *   G1  no helper text anywhere in the inspector
 *   G2  every value-editing control comes from the standard control list
 *   G3  the panel is full bleed — no card, no border, no max-width
 *   G4  a fold chevron exists only on a list that HAS members, on that
 *       list's own header, and there is exactly one header per list
 *   G5  both themes render with no console error
 *
 * Usage: node demos/capture-inspector-v5.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-inspector-v5.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

/** Every design the switcher offers, "current" first so the report can show
 *  the before. The five proposals follow in switcher order. */
const DESIGNS = [
  { id: "current", name: "Current (before)" },
  { id: "figma-flat", name: "S1 · Figma flat" },
  { id: "accordion", name: "S2 · Accordion" },
  { id: "rail", name: "S3 · Section rail" },
  { id: "stacked", name: "S4 · Stacked labels" },
  { id: "member-rows", name: "S5 · Members as rows" },
];
/** The five proposals — "current" is captured for contrast and is exempt
 *  from the gates it is the reason for. */
const PROPOSALS = DESIGNS.filter((d) => d.id !== "current");

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-inspv5-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--window-size=1500,2400",
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
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(180);
}
async function exists(selector) {
  return evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(320);
}
async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  })()`);
}
/**
 * The inspector column, whole — scrolling neutralised for the duration of
 * the shot so a 1200px panel is captured in one image rather than cropped
 * at the fold, then restored so the next interaction behaves normally.
 */
async function shotInspector(rawName) {
  // The exercises label themselves "<theme>/<design>" so an assertion
  // message says which run failed; a filename cannot carry the slash.
  const name = rawName.replace(/\//g, "-");
  await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const sc = document.querySelector('[data-slot="inspector-scroll"]');
    col.dataset.shotHeight = col.style.height; sc.dataset.shotOverflow = sc.style.overflow; sc.dataset.shotH = sc.style.height;
    col.style.height = "auto"; sc.style.overflow = "visible"; sc.style.height = "auto";
  })()`);
  await sleep(260);
  // The clip runs from the column's top to the BOTTOM OF THE PANEL'S OWN
  // CONTENT, not to the bottom of the column.
  //
  // WHY: the design switcher is pinned to the column's last row, so a
  // clip on the column's rect always ends on a non-background pixel and a
  // report builder's trim can never find the content's real end — every
  // capture came out with a thousand-pixel empty gap in the middle of it.
  // The panel knows where it stops; ask it.
  const r = await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const panel = document.querySelector('[data-slot="section-panel"], [data-slot="panel-variant-host"]');
    const cb = col.getBoundingClientRect();
    const pb = panel.getBoundingClientRect();
    const bottom = Math.max(pb.bottom, cb.top + 120);
    return { left: Math.floor(cb.left), top: Math.floor(cb.top), w: Math.ceil(cb.width), h: Math.ceil(bottom - cb.top) + 10 };
  })()`);
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: r.left, y: r.top, width: r.w, height: r.h, scale: 1 },
  });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const sc = document.querySelector('[data-slot="inspector-scroll"]');
    col.style.height = col.dataset.shotHeight || ""; sc.style.overflow = sc.dataset.shotOverflow || ""; sc.style.height = sc.dataset.shotH || "";
  })()`);
  await sleep(160);
  return `${name}.png`;
}
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  checks.push(msg);
}
const checks = [];
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

/* ------------------------------------------------------------------ */
/* Navigation helpers that work across all five designs                 */
/* ------------------------------------------------------------------ */

/** S3 renders one section at a time behind a chip; S2 collapses them.
 *  Everything else already shows them. One call covers all three. */
async function revealSection(id) {
  if (await exists(`[data-slot="section-chip"][data-section="${id}"]`)) {
    await click(`[data-slot="section-chip"][data-section="${id}"]`);
  }
  if (await evaluate(`(() => { const el = document.querySelector('[data-slot="inspector-section"][data-section="${id}"]'); return !!el && el.getAttribute("data-open") === "false"; })()`)) {
    await click(`[data-slot="inspector-section"][data-section="${id}"] [data-slot="section-toggle"]`);
  }
  assert(await exists(`[data-slot="inspector-section"][data-section="${id}"]`), `section "${id}" is reachable`);
}

/**
 * Open the list called `label` inside `sectionId`, whichever design is
 * drawing it, and return its parent id.
 *
 * WHY by LABEL and not by id: in S4 a list that has not been opened yet is
 * not mounted at all — there is no `[data-slot="members-section"]` to read
 * an id off. The chip (S4) and the summary row (S5) both carry the label,
 * so the label is the only handle that exists in every design before the
 * list does.
 */
async function revealListByLabel(label, sectionId) {
  const scope = `[data-slot="inspector-section"][data-section="${sectionId}"] `;
  const clickByText = async (slot) =>
    evaluate(`(() => {
      const hits = Array.from(document.querySelectorAll('${scope}[data-slot="${slot}"]'));
      const hit = hits.find((el) => el.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (!hit) return false;
      if (hit.getAttribute("data-open") === "true") return true;
      hit.click();
      return true;
    })()`);
  if (!(await evaluate(`(() => {
    const s = Array.from(document.querySelectorAll('${scope}[data-slot="members-section"]'));
    return s.some((el) => el.querySelector('[data-slot="members-label"]')?.textContent.trim() === ${JSON.stringify(label)});
  })()`))) {
    if (!(await clickByText("list-chip"))) await clickByText("member-row-summary");
    await sleep(260);
  }
  const id = await listIdByLabel(label, sectionId);
  await revealList(id);
  return id;
}

/** S4 puts a list behind a chip at the section head; S5 behind a summary
 *  row. Both must end with the real Members control on screen. */
async function revealList(listId) {
  if (await exists(`[data-slot="list-chip"][data-list-id="${listId}"]`)) {
    if (!(await exists(`[data-slot="members-section"][data-parent-id="${listId}"]`))) {
      await click(`[data-slot="list-chip"][data-list-id="${listId}"]`);
    }
  }
  if (await evaluate(`(() => { const el = document.querySelector('[data-slot="member-row-summary"][data-list-id="${listId}"]'); return !!el && el.getAttribute("data-open") === "false"; })()`)) {
    await click(`[data-slot="member-row-summary"][data-list-id="${listId}"]`);
  }
  // Folded via its own chevron from a previous step? Open it again.
  if (await evaluate(`(() => { const el = document.querySelector('[data-slot="members-section"][data-parent-id="${listId}"] [data-slot="members-control"]'); return !!el && el.getAttribute("data-folded") === "true"; })()`)) {
    await click(`[data-slot="members-section"][data-parent-id="${listId}"] [data-slot="members-fold"]`);
  }
}

async function memberCountIn(listId) {
  return evaluate(`document.querySelectorAll('[data-slot="members-section"][data-parent-id="${listId}"] [data-slot="member-row"]').length`);
}
/**
 * The parent id of the list whose header label is `label`, optionally
 * scoped to one section — a Block has a "Left" list in both its Header and
 * its Footer, so the unscoped form would be ambiguous.
 *
 * Matches `[data-slot="members-label"]`, never the header's textContent:
 * the fold chevron is a child of the same header, so its glyph lands in
 * textContent and "▶Left" does not start with "Left".
 */
async function listIdByLabel(label, sectionId) {
  const scope = sectionId ? `[data-slot="inspector-section"][data-section="${sectionId}"] ` : "";
  const id = await evaluate(`(() => {
    const sections = Array.from(document.querySelectorAll('${scope}[data-slot="members-section"]'));
    const hit = sections.find((s) => s.querySelector('[data-slot="members-label"]')?.textContent.trim() === ${JSON.stringify(label)});
    return hit ? hit.getAttribute("data-parent-id") : null;
  })()`);
  assert(id, `found the "${label}" list${sectionId ? ` in the ${sectionId} section` : ""}`);
  return id;
}

/* ------------------------------------------------------------------ */
/* The fixture — built through the app's own ops                        */
/* ------------------------------------------------------------------ */

async function addVia(listIndex, type) {
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-trigger"]').click()`);
  await sleep(180);
  const hasMenu = await evaluate(`(() => { const s = document.querySelectorAll('[data-slot="members-section"]')[${listIndex}]; return !!(s && s.querySelector('[data-slot="add-member-type"][data-type="${type}"]')); })()`);
  if (hasMenu) await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[${listIndex}].querySelector('[data-slot="add-member-type"][data-type="${type}"]').click()`);
  await sleep(320);
}

async function loadFixture(theme) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); localStorage.setItem("bbox-ui:inspector-tier", "expert"); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(700);
  assert((await evaluate(`document.documentElement.classList.contains("dark")`)) === (theme === "dark"), `theme ${theme} applied`);
  await setSelect('[data-slot="component-picker"]', "Block");
  await waitFor('[data-slot="inspector-design-picker"]');
  await sleep(400);
  // Start from S1 so the fixture is built through the section designs'
  // own member lists, which is what a person would be doing.
  await setSelect('[data-slot="inspector-design-picker"]', "figma-flat");
  await sleep(420);
  // Header · Left is list 0, Header · Right is list 2 (Left, Center, Right,
  // Body, Footer L/C/R, Ports — see build-sections.tsx's slot walk).
  await addVia(0, "Glyph");
  await addVia(2, "Pill");
  await sleep(400);
  const left = await listIdByLabel("Left", "header");
  assert((await memberCountIn(left)) === 1, "fixture: a Glyph sits in header · left");
  const ports = await listIdByLabel("Ports", "members");
  assert((await memberCountIn(ports)) === 3, "fixture: the Block's three seeded ports are in the Ports list");
  consoleErrors = [];
}

/* ------------------------------------------------------------------ */
/* The gates                                                            */
/* ------------------------------------------------------------------ */

async function gateNoHelperText(design) {
  const found = await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const empties = col.querySelectorAll('[data-slot="members-empty"]').length;
    // Any prose paragraph is helper text by construction: nothing in this
    // panel is meant to be a sentence.
    const paragraphs = Array.from(col.querySelectorAll('p')).map((p) => p.textContent.trim()).filter(Boolean);
    return { empties, paragraphs };
  })()`);
  assert(found.empties === 0, `${design}: no "No members yet…" line anywhere`);
  assert(found.paragraphs.length === 0, `${design}: no helper paragraph anywhere (found ${JSON.stringify(found.paragraphs).slice(0, 120)})`);
}

async function gateStandardControls(design) {
  const report = await evaluate(`(() => {
    const scope = document.querySelector('[data-slot="inspector-scroll"]');
    const rows = Array.from(scope.querySelectorAll('[data-slot="standard-row"]'));
    const rowsWithoutControl = rows.filter((r) => r.querySelectorAll('[data-standard-control]').length !== 1).length;
    // Every VALUE-EDITING element must sit inside a standard control. The
    // filter box is panel chrome, not a value; the member rows' own
    // buttons are navigation. Inputs and selects are the exhaustive set of
    // things that hold a value here.
    const strays = Array.from(scope.querySelectorAll('input, select, textarea')).filter(
      (el) => !el.closest('[data-standard-control]') && el.getAttribute('data-slot') !== 'field-filter',
    ).map((el) => el.tagName + ':' + (el.getAttribute('data-slot') ?? el.type ?? ''));
    const kinds = Array.from(new Set(Array.from(scope.querySelectorAll('[data-standard-control]')).map((e) => e.getAttribute('data-standard-control'))));
    return { rows: rows.length, rowsWithoutControl, strays, kinds };
  })()`);
  assert(report.rows > 0, `${design}: the inspector drew standard rows (${report.rows})`);
  assert(report.rowsWithoutControl === 0, `${design}: every standard row holds exactly one standard control`);
  assert(report.strays.length === 0, `${design}: no value-editing control outside the standard list (strays: ${report.strays.join(", ")})`);
  const allowed = ["segmented", "dropdown", "number", "toggle", "text", "flags"];
  assert(report.kinds.every((k) => allowed.includes(k)), `${design}: every control names a member of the standard list (${report.kinds.join(", ")})`);
  return report;
}

async function gateFullBleed(design) {
  const box = await evaluate(`(() => {
    const panel = document.querySelector('[data-slot="section-panel"]');
    const host = document.querySelector('[data-slot="panel-variant-host"]');
    const s = getComputedStyle(panel);
    return {
      borderTop: s.borderTopWidth, borderLeft: s.borderLeftWidth, radius: s.borderTopLeftRadius,
      panelWidth: panel.getBoundingClientRect().width, hostWidth: host.getBoundingClientRect().width,
    };
  })()`);
  assert(box.borderTop === "0px" && box.borderLeft === "0px", `${design}: the panel paints no border (${box.borderTop}/${box.borderLeft})`);
  assert(box.radius === "0px", `${design}: the panel has no rounded card corner (${box.radius})`);
  assert(Math.abs(box.panelWidth - box.hostWidth) < 1, `${design}: the panel spans the full inspector width (${box.panelWidth} vs ${box.hostWidth})`);
}

async function gateFoldChevrons(design) {
  const report = await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const lists = Array.from(col.querySelectorAll('[data-slot="members-control"]'));
    return lists.map((l) => ({
      headers: l.querySelectorAll('[data-slot="members-header"]').length,
      folds: l.querySelectorAll('[data-slot="members-fold"]').length,
      members: l.querySelectorAll('[data-slot="member-row"]').length,
      folded: l.getAttribute("data-folded") === "true",
    }));
  })()`);
  assert(report.length > 0, `${design}: member lists are on screen (${report.length})`);
  assert(report.every((l) => l.headers === 1), `${design}: exactly one header per member list — no second header above it`);
  assert(
    report.every((l) => (l.members > 0 || l.folded ? l.folds === 1 : l.folds === 0)),
    `${design}: a fold chevron appears only on a list that has members`,
  );
  return report;
}

/* ------------------------------------------------------------------ */
/* The interactions                                                     */
/* ------------------------------------------------------------------ */

async function exerciseFold(design) {
  await revealSection("members");
  const ports = await revealListByLabel("Ports", "members");
  const before = await memberCountIn(ports);
  assert(before === 3, `${design}: the Ports list shows its three members before folding`);
  await click(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="members-fold"]`);
  await sleep(240);
  assert((await memberCountIn(ports)) === 0, `${design}: the chevron on the list's own header folds its rows away`);
  const headerStillThere = await evaluate(`document.querySelectorAll('[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="members-header"]').length`);
  assert(headerStillThere === 1, `${design}: a folded list keeps its one header, and gains no second one`);
  const shot = await shotInspector(`${design}-folded`);
  await click(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="members-fold"]`);
  await sleep(240);
  assert((await memberCountIn(ports)) === 3, `${design}: unfolding brings the three members back`);
  return shot;
}

async function exerciseHideHeader(design) {
  await revealSection("header");
  const row = '[data-slot="inspector-section"][data-section="header"] [data-slot="standard-row"][data-field="hidden"]';
  assert(await exists(row), `${design}: the Header region's "hidden" is an ordinary standard row, not a custom caption control`);
  const control = await evaluate(`document.querySelector('${row} [data-standard-control]').getAttribute("data-standard-control")`);
  assert(control === "toggle", `${design}: it draws the standard toggle (got ${control})`);
  await revealListByLabel("Left", "header");
  const listsBefore = await evaluate(`document.querySelectorAll('[data-slot="inspector-section"][data-section="header"] [data-slot="members-control"]').length`);
  await click(`${row} input[type="checkbox"]`);
  await sleep(340);
  await revealSection("header");
  const muted = await evaluate(`document.querySelector('[data-slot="inspector-section"][data-section="header"]').getAttribute("data-muted")`);
  assert(muted === "true", `${design}: hiding the header marks its section muted`);
  const listsAfter = await evaluate(`document.querySelectorAll('[data-slot="inspector-section"][data-section="header"] [data-slot="members-control"]').length`);
  assert(listsBefore > 0 && listsAfter === 0, `${design}: a hidden region folds its member lists away (${listsBefore} → ${listsAfter})`);
  const shot = await shotInspector(`${design}-header-hidden`);
  await click(`${row} input[type="checkbox"]`);
  await sleep(340);
  await revealSection("header");
  await revealListByLabel("Left", "header");
  assert(
    (await evaluate(`document.querySelectorAll('[data-slot="inspector-section"][data-section="header"] [data-slot="members-control"]').length`)) >= listsBefore,
    `${design}: unhiding restores the region's lists`,
  );
  return shot;
}

async function exerciseArrangementMode(design) {
  await revealSection("members");
  const row = '[data-slot="standard-row"][data-field="arrangement:mode"]';
  assert(await exists(row), `${design}: Arrangement mode is an ordinary standard row, not a hand-drawn strip`);
  const kind = await evaluate(`document.querySelector('${row} [data-standard-control]').getAttribute("data-standard-control")`);
  assert(kind === "segmented", `${design}: it draws the standard segmented control (got ${kind})`);
  const wasAuto = await evaluate(`document.querySelector('${row} [data-segment="auto"]').getAttribute("data-selected") === "true"`);
  assert(wasAuto, `${design}: the Block starts in Auto`);
  await click(`${row} [data-segment="custom"]`);
  await sleep(320);
  await revealSection("members");
  assert(
    await evaluate(`document.querySelector('${row} [data-segment="custom"]').getAttribute("data-selected") === "true"`),
    `${design}: the standard row switched the arrangement to Custom`,
  );
  // And the live-edge SET is the new standard `flags` control, not four
  // hand-rolled buttons.
  const edgeKind = await evaluate(`document.querySelector('[data-slot="standard-row"][data-field="arrangement:edges"] [data-standard-control]')?.getAttribute("data-standard-control")`);
  assert(edgeKind === "flags", `${design}: live edges draw the standard flags control (got ${edgeKind})`);
  const shot = await shotInspector(`${design}-arrangement-custom`);
  await click(`${row} [data-segment="auto"]`);
  await sleep(300);
  return shot;
}

async function exerciseDragReorder(design) {
  await revealSection("members");
  const ports = await revealListByLabel("Ports", "members");
  const titles = () =>
    evaluate(`Array.from(document.querySelectorAll('[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-title"]')).map(e => e.textContent.trim()).join(",")`);
  const before = await titles();
  const from = await rectOf(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-row"]:first-child [data-slot="member-grip"]`);
  const to = await rectOf(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-row"]:last-child [data-slot="member-select"]`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await sleep(30);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", clickCount: 1 });
  await sleep(60);
  for (let step = 1; step <= 6; step++) {
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + ((to.x - from.x) * step) / 6,
      y: from.y + ((to.y - from.y) * step) / 6,
      buttons: 1,
    });
    await sleep(40);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left" });
  await sleep(420);
  await revealSection("members");
  await revealListByLabel("Ports", "members");
  const after = await titles();
  assert(after !== before, `${design}: a real mouse drag on the grip reorders the Ports list (${before} → ${after})`);
  const shot = await shotInspector(`${design}-reordered`);
  // Put it back so every design starts from the same fixture.
  const backFrom = await rectOf(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-row"]:last-child [data-slot="member-grip"]`);
  const backTo = await rectOf(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-row"]:first-child [data-slot="member-select"]`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: backFrom.x, y: backFrom.y, buttons: 0 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: backFrom.x, y: backFrom.y, button: "left", clickCount: 1 });
  await sleep(60);
  for (let step = 1; step <= 6; step++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: backFrom.x + ((backTo.x - backFrom.x) * step) / 6, y: backFrom.y + ((backTo.y - backFrom.y) * step) / 6, buttons: 1 });
    await sleep(40);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: backTo.x, y: backTo.y, button: "left" });
  await sleep(400);
  return shot;
}

/**
 * A design that folds its SECTIONS only shows what it bought when some are
 * folded — S2's resting state with everything open is S1 with chevrons.
 * Collapses the two property sections and proves the summaries still say
 * what is inside. No-op for the designs that do not fold sections.
 */
async function exerciseCollapseSections(design) {
  const foldable = await evaluate(`document.querySelectorAll('[data-slot="inspector-section"][data-open]').length`);
  if (foldable === 0) return null;
  for (const id of ["layout", "appearance", "body", "footer"]) {
    if (await evaluate(`(() => { const el = document.querySelector('[data-slot="inspector-section"][data-section="${id}"]'); return !!el && el.getAttribute("data-open") === "true"; })()`)) {
      await click(`[data-slot="inspector-section"][data-section="${id}"] [data-slot="section-toggle"]`);
    }
  }
  await sleep(260);
  const closed = await evaluate(`document.querySelectorAll('[data-slot="inspector-section"][data-open="false"]').length`);
  assert(closed >= 2, `${design}: sections collapse (${closed} closed)`);
  const summaries = await evaluate(`(() => {
    const els = Array.from(document.querySelectorAll('[data-slot="inspector-section"][data-open="false"]'));
    return els.map((e) => e.querySelector('[data-slot="section-title"]')?.textContent.trim() ?? "").join(" | ");
  })()`);
  assert(/\d/.test(summaries), `${design}: a collapsed section still says what is inside it (${summaries.slice(0, 90)})`);
  const shot = await shotInspector(`${design}-collapsed`);
  for (const id of ["layout", "appearance", "body", "footer"]) {
    if (await evaluate(`(() => { const el = document.querySelector('[data-slot="inspector-section"][data-section="${id}"]'); return !!el && el.getAttribute("data-open") === "false"; })()`)) {
      await click(`[data-slot="inspector-section"][data-section="${id}"] [data-slot="section-toggle"]`);
    }
  }
  await sleep(220);
  return shot;
}

async function exercisePlacement(design) {
  // Selecting a Port swaps the subject; its Placement section must be
  // ordinary standard rows too.
  await revealSection("members");
  const ports = await revealListByLabel("Ports", "members");
  await click(`[data-slot="members-section"][data-parent-id="${ports}"] [data-slot="member-row"]:first-child [data-slot="member-select"]`);
  await sleep(420);
  await revealSection("placement");
  const kinds = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('[data-slot="standard-row"]')).filter((r) => (r.getAttribute("data-field") || "").startsWith("placement:"));
    return rows.map((r) => r.getAttribute("data-field") + "=" + (r.querySelector('[data-standard-control]')?.getAttribute("data-standard-control") ?? "NONE")).join(", ");
  })()`);
  assert(/placement:edge=/.test(kinds) && !/=NONE/.test(kinds), `${design}: a Port's Placement is standard rows too (${kinds})`);
  const shot = await shotInspector(`${design}-placement`);
  // Back to the Block, so the next design starts from the same subject.
  await click('[data-slot="members-path-crumb"]');
  await sleep(420);
  await waitFor('[data-slot="inspector-section"][data-section="members"]', 8000).catch(() => {});
  return shot;
}

/* ------------------------------------------------------------------ */
/* Run                                                                  */
/* ------------------------------------------------------------------ */

const manifest = [];
for (const theme of ["dark", "light"]) {
  await loadFixture(theme);
  const entry = { theme, designs: {}, console: [] };
  for (const design of DESIGNS) {
    await setSelect('[data-slot="inspector-design-picker"]', design.id);
    await sleep(500);
    const files = {};
    // AS LANDED — what the design shows the moment a Block is selected,
    // before anything is opened. For S3 (one section at a time) and S4
    // (lists behind a chip strip) this is a different picture from the
    // hero, and the difference is the design.
    files.top = await shotInspector(`${theme}-${design.id}-top`);
    if (design.id !== "current") {
      // Every design is then judged on the SAME content: the Ports
      // section with its arrangement rows and its member list open.
      await revealSection("members");
      await revealListByLabel("Ports", "members");
      await sleep(200);
    }
    files.hero = await shotInspector(`${theme}-${design.id}-hero`);
    if (design.id !== "current") {
      await gateNoHelperText(`${theme}/${design.id}`);
      await gateStandardControls(`${theme}/${design.id}`);
      await gateFullBleed(`${theme}/${design.id}`);
      await gateFoldChevrons(`${theme}/${design.id}`);
      files.folded = await exerciseFold(`${theme}/${design.id}`);
      files.headerHidden = await exerciseHideHeader(`${theme}/${design.id}`);
      files.arrangement = await exerciseArrangementMode(`${theme}/${design.id}`);
      const collapsed = await exerciseCollapseSections(`${theme}/${design.id}`);
      if (collapsed) files.collapsed = collapsed;
      if (theme === "dark") {
        files.reordered = await exerciseDragReorder(`${theme}/${design.id}`);
        files.placement = await exercisePlacement(`${theme}/${design.id}`);
      }
    }
    entry.designs[design.id] = { name: design.name, files };
  }
  entry.console = Array.from(new Set(consoleErrors));
  assert(entry.console.length === 0, `${theme}: no console errors across all six designs (${entry.console.slice(0, 2).join(" | ")})`);
  manifest.push(entry);
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ manifest, checks }, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
console.log(`PASS — ${checks.length} assertions, ${manifest.length} themes × ${DESIGNS.length} designs → ${outDir}`);
