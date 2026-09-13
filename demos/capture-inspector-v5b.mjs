#!/usr/bin/env node
/**
 * The living regression for Zach's 2026-09-12 inspector picks, and the
 * capture run behind docs/build_inspector_v5b.py.
 *
 * Round 1 (`claude/inspector-panel-v5`) put five section designs on the
 * table; he picked from them, corrected one, named a bug, and asked for
 * three more built on the combination. This journey asserts the SETTLED
 * picks as hard gates — they are no longer up for judgement — and captures
 * the three proposals that vary what is left open.
 *
 *   G1  no helper text anywhere in the inspector
 *   G2  every value-editing control comes from the standard control list
 *   G3  the panel is full bleed — no card, no border, no max-width
 *   G4  EXACTLY ONE HEADER per member list, folded and expanded alike
 *       (the bug: "when you expand it, no need to repeat the header again")
 *   G5  a section's chevron is invisible at rest while it is open, and
 *       appears under a real mouse ("the chevron should appear just on
 *       hover") — driven with Input.dispatchMouseEvent, not a synthetic
 *       React event, because the rule is about a pointer being there
 *   G6  a folded thing is ONE line: label, summary, chevron
 *   G7  the row's OVERRIDE tag still works inside the new section chrome
 *       (main's `RowLabel`, not a copy of it)
 *   G8  two fields sharing FieldSpec.group still render on one row
 *   G9  both themes render with no console error
 *
 * Usage: node demos/capture-inspector-v5b.mjs <url> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-inspector-v5b.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const DESIGNS = [
  { id: "current", name: "Current (before)" },
  { id: "hairline", name: "P1 · Hairline" },
  { id: "ledger", name: "P2 · Ledger" },
  { id: "strata", name: "P3 · Strata" },
];
const PROPOSALS = DESIGNS.filter((d) => d.id !== "current");

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-inspv5b-"));
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
  await sleep(200);
}
async function count(selector) {
  return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}
async function attr(selector, name) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.getAttribute(${JSON.stringify(name)}) : null; })()`);
}
async function text(selector) {
  return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent.trim() : null; })()`);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(360);
}
async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, bottom: r.bottom };
  })()`);
}
/**
 * A REAL pointer over a real element.
 *
 * WHY this and not `el.dispatchEvent(new PointerEvent("pointerenter"))`:
 * the gate is "the chevron appears when the pointer is over the header",
 * and a synthetic event proves only that the handler is wired, not that
 * anything a user does reaches it. Chrome's own hit-testing decides which
 * element a real mousemove lands on; that is the thing under test.
 */
async function hover(selector) {
  const r = await rectOf(selector);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(r.left + 8), y: Math.round(r.y), buttons: 0 });
  await sleep(160);
}
async function unhover() {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(160);
}

const checks = [];
function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  checks.push(msg);
}

async function shotInspector(rawName) {
  const name = rawName.replace(/\//g, "-");
  await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const sc = document.querySelector('[data-slot="inspector-scroll"]');
    col.dataset.shotHeight = col.style.height; sc.dataset.shotOverflow = sc.style.overflow; sc.dataset.shotH = sc.style.height;
    col.style.height = "auto"; sc.style.overflow = "visible"; sc.style.height = "auto";
  })()`);
  await sleep(260);
  // Clip to the BOTTOM OF THE PANEL'S OWN CONTENT, not the column's: the
  // design switcher is pinned to the column's last row, so a clip on the
  // column always ends on a non-background pixel and a report builder's
  // trim can never find where the content really stops.
  const r = await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const panel = document.querySelector('[data-slot="section-panel"]') || document.querySelector('[data-slot="panel-variant-host"]');
    const c = col.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    return { x: c.left, y: c.top, width: c.width, height: Math.max(120, p.bottom - c.top + 12) };
  })()`);
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), scale: 1 },
  });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  await evaluate(`(() => {
    const col = document.querySelector('[data-slot="inspector-column"]');
    const sc = document.querySelector('[data-slot="inspector-scroll"]');
    col.style.height = col.dataset.shotHeight || ""; sc.style.overflow = sc.dataset.shotOverflow || ""; sc.style.height = sc.dataset.shotH || "";
  })()`);
  await sleep(140);
  return `${name}.png`;
}

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

/** Add a member through the app's OWN Add menu, in the "current" design,
 *  where every list renders its own header unconditionally. Seeding behind
 *  the app's back would prove nothing about the app. */
async function addVia(listIndex, type) {
  await evaluate(`(() => {
    const list = document.querySelectorAll('[data-slot="members-section"]')[${listIndex}];
    if (!list) throw new Error("no members list at index ${listIndex}");
    list.querySelector('[data-slot="add-member-trigger"]').click();
  })()`);
  await sleep(200);
  const one = await evaluate(`!document.querySelector('[data-slot="add-member-menu"]')`);
  if (!one) {
    await click(`[data-slot="add-member-menu"] [data-slot="add-member-type"][data-type="${type}"]`);
  }
  await sleep(240);
}

/**
 * Storage is per-ORIGIN, and the tab starts on about:blank — where
 * `localStorage` throws. Land on the real origin once before anything tries
 * to write a preference, or every setting is silently dropped and the run
 * quietly tests the default design instead of the one it names.
 */
async function reachOrigin() {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(500);
}

async function loadFixture(theme) {
  consoleErrors = [];
  await evaluate(`(() => {
    localStorage.setItem("theme", ${JSON.stringify(theme)});
    localStorage.setItem("bbox-ui:inspector-tier", "expert");
    localStorage.setItem("bbox-ui.create.inspectorDesign", "current");
    localStorage.setItem("bbox-ui.create.inspectorDensity", "comfortable");
    localStorage.setItem("bbox-ui.create.render", "tldraw");
  })()`).catch(() => {});
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(700);
  await setSelect('[data-slot="component-picker"]', "Block");
  await waitFor('[data-slot="members-section"]');
  await sleep(400);
  // Header · Left is list 0, Header · Right is list 2 — a Block's Bar has
  // three cells and the header Bar comes first.
  await addVia(0, "Glyph");
  await addVia(2, "Pill");
  return true;
}

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

const PANEL = '[data-slot="section-panel"]';

async function gateNoHelperText(label) {
  const prose = await evaluate(`(() => {
    const panel = document.querySelector('${PANEL}');
    return Array.from(panel.querySelectorAll("p")).map((p) => p.textContent.trim()).filter(Boolean);
  })()`);
  assert(prose.length === 0, `${label}: G1 no helper paragraph in the panel (found ${prose.length})`);
  assert((await count(`${PANEL} [data-slot="members-empty"]`)) === 0, `${label}: G1 no "No members yet" prose`);
}

async function gateStandardControls(label) {
  const stray = await evaluate(`(() => {
    const panel = document.querySelector('${PANEL}');
    return Array.from(panel.querySelectorAll("input, select, textarea"))
      .filter((el) => el.type !== "search")
      .filter((el) => !el.closest("[data-standard-control]"))
      .map((el) => (el.getAttribute("data-slot") || el.tagName) + ":" + el.type);
  })()`);
  assert(stray.length === 0, `${label}: G2 every editing control is a standard control (stray: ${stray.join(", ")})`);
  const kinds = await evaluate(`(() => {
    const all = document.querySelectorAll('${PANEL} [data-standard-control]');
    return Array.from(new Set(Array.from(all).map((el) => el.getAttribute("data-standard-control"))));
  })()`);
  const KNOWN = ["segmented", "dropdown", "number", "toggle", "text"];
  assert(kinds.length > 0, `${label}: G2 the panel names its control kinds (${JSON.stringify(kinds)})`);
  assert(kinds.every((k) => KNOWN.includes(k)), `${label}: G2 every named kind is in STANDARD_CONTROLS (${JSON.stringify(kinds)})`);
}

async function gateFullBleed(label) {
  const box = await evaluate(`(() => {
    const panel = document.querySelector('${PANEL}');
    const cs = getComputedStyle(panel);
    // Against the SCROLLER's content box, not the column's border box: the
    // column paints a 1px left border of its own, which the panel is not
    // supposed to cover and which would otherwise fail this by exactly 1px.
    const scroll = document.querySelector('[data-slot="inspector-scroll"]');
    return {
      border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, maxWidth: cs.maxWidth,
      width: Math.round(panel.getBoundingClientRect().width),
      colWidth: scroll.clientWidth,
    };
  })()`);
  assert(box.border === "0px", `${label}: G3 panel paints no border (${box.border})`);
  assert(box.radius === "0px", `${label}: G3 panel paints no radius (${box.radius})`);
  assert(box.maxWidth === "none", `${label}: G3 panel has no max-width (${box.maxWidth})`);
  assert(box.width === box.colWidth, `${label}: G3 panel spans the column (${box.width} of ${box.colWidth})`);
}

/** THE bug. One header per list, expanded and collapsed alike. */
async function gateOneHeaderPerList(label) {
  const report = await evaluate(`(() => {
    return Array.from(document.querySelectorAll('${PANEL} [data-slot="section-list"]')).map((list) => ({
      id: list.getAttribute("data-list-id"),
      count: Number(list.getAttribute("data-count")),
      open: list.getAttribute("data-open") === "true",
      ownHeaders: list.querySelectorAll('[data-slot="list-header"]').length,
      legacyHeaders: list.querySelectorAll('[data-slot="members-header"]').length,
      chevrons: list.querySelectorAll('[data-slot="fold-chevron"]').length,
    }));
  })()`);
  assert(report.length > 0, `${label}: G4 the panel has member lists to check (${report.length})`);
  for (const list of report) {
    assert(list.ownHeaders === 1, `${label}: G4 list ${list.id} has exactly one header (${list.ownHeaders})`);
    assert(list.legacyHeaders === 0, `${label}: G4 list ${list.id} draws no second, control-owned header`);
    assert(list.chevrons === (list.count > 0 ? 1 : 0), `${label}: G4 list ${list.id} shows a chevron only when it has members (count ${list.count}, chevrons ${list.chevrons})`);
  }
  const expanded = report.filter((l) => l.open && l.count > 0);
  assert(expanded.length > 0, `${label}: G4 at least one list is expanded, where the double header used to appear (${expanded.length})`);
}

/** "The chevron should appear just on hover." */
async function gateHoverChevron(label) {
  await unhover();
  const atRest = await evaluate(`(() => {
    const sec = document.querySelector('${PANEL} [data-slot="inspector-section"][data-open="true"] [data-slot="section-title"]');
    return { visible: sec.getAttribute("data-chevron-visible"), opacity: getComputedStyle(sec.querySelector('[data-slot="fold-chevron"]')).opacity };
  })()`);
  assert(atRest.visible === "false", `${label}: G5 an OPEN section hides its chevron at rest`);
  assert(Number(atRest.opacity) === 0, `${label}: G5 the resting chevron is painted at opacity 0 (${atRest.opacity})`);
  await hover('[data-slot="inspector-section"][data-open="true"] [data-slot="section-title"]');
  const hovered = await evaluate(`(() => {
    const sec = document.querySelector('${PANEL} [data-slot="inspector-section"][data-open="true"] [data-slot="section-title"]');
    return { visible: sec.getAttribute("data-chevron-visible"), opacity: getComputedStyle(sec.querySelector('[data-slot="fold-chevron"]')).opacity };
  })()`);
  assert(hovered.visible === "true", `${label}: G5 a real pointer over the header reveals the chevron`);
  assert(Number(hovered.opacity) === 1, `${label}: G5 the revealed chevron is fully painted (${hovered.opacity})`);
  await unhover();
}

/** "Like you can make it way more compact" — a folded thing is one line. */
async function gateCompactFold(label) {
  const before = await rectOf(`${PANEL} [data-slot="inspector-section"][data-section="header"]`);
  await click(`${PANEL} [data-slot="inspector-section"][data-section="header"] [data-slot="fold-toggle"]`);
  const folded = await evaluate(`(() => {
    const sec = document.querySelector('${PANEL} [data-slot="inspector-section"][data-section="header"]');
    const title = sec.querySelector('[data-slot="section-title"]');
    return {
      open: sec.getAttribute("data-open"),
      height: Math.round(sec.getBoundingClientRect().height),
      titleHeight: Math.round(title.getBoundingClientRect().height),
      bodies: sec.querySelectorAll('[data-slot="section-body"]').length,
      chevron: title.getAttribute("data-chevron-visible"),
      summary: title.textContent.trim(),
    };
  })()`);
  assert(folded.open === "false", `${label}: G6 the section folded`);
  assert(folded.bodies === 0, `${label}: G6 a folded section renders no body`);
  assert(folded.height === folded.titleHeight, `${label}: G6 a folded section IS its one title row (${folded.height} vs ${folded.titleHeight})`);
  assert(folded.height < before.h, `${label}: G6 folding actually shrank it (${folded.height} < ${Math.round(before.h)})`);
  assert(folded.chevron === "true", `${label}: G6 a folded section keeps its chevron at rest — the only tell that content is hidden`);
  assert(/\w/.test(folded.summary), `${label}: G6 a folded section still says something (“${folded.summary}”)`);
  await click(`${PANEL} [data-slot="inspector-section"][data-section="header"] [data-slot="fold-toggle"]`);
  assert((await attr(`${PANEL} [data-slot="inspector-section"][data-section="header"]`, "data-open")) === "true", `${label}: G6 and unfolded again`);
}

/**
 * The row-level provenance tag from `main`, inside the new section chrome
 * — and proved to behave IDENTICALLY in the pre-sections panel beside it.
 *
 * WHY parity and not just "a tag appears": the rebase is the whole reason
 * this gate exists. Round 1's section row was a COPY of FigmaDense's, and
 * between then and now Zach replaced the provenance dot with this tag and
 * the "×" with a reset icon — corrections a copy never receives. The rows
 * here are literally `RowLabel`/`DenseControl` from that file, so the
 * strongest available statement is that both panels answer the same on the
 * same row: the same tag word, and the same decision about whether a ↺ is
 * offered at all.
 *
 * (It is NOT offered for Block's `radius`, and that is main's own rule, not
 * a regression: `FigmaDense` renders the reset only when a preset or an
 * INHERITED value exists to fall back to — `trace.candidates[1]` is the
 * inherited layer — because clearing is "the way back to inherited from
 * Header", and a field whose only other candidate is its own default has
 * nowhere to go back to.)
 */
async function gateProvenanceParity(theme) {
  const label = `${theme}/provenance`;
  await setSelect('[data-slot="inspector-design-picker"]', "hairline");
  await sleep(420);
  await evaluate(`(() => {
    const row = document.querySelector('${PANEL} [data-slot="standard-row"][data-field="radius"]');
    if (!row) throw new Error("no radius row");
    const input = row.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "17");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  })()`);
  await sleep(360);
  const inSections = await evaluate(`(() => {
    const row = document.querySelector('${PANEL} [data-slot="standard-row"][data-field="radius"]');
    const t = row.querySelector('[data-slot="field-provenance-tag"]');
    return { text: t && t.textContent.trim(), tag: t && t.getAttribute("data-tag"), reset: !!row.querySelector('[data-slot="field-clear-override"]'), value: row.querySelector("input").value };
  })()`);
  assert(inSections.text === "override", `${label}: G7 an overridden row grows main's plain-word OVERRIDE tag inside the section chrome (“${inSections.text}”)`);
  assert(inSections.tag === "override", `${label}: G7 it carries the tag's own data-tag, not a dot`);
  assert(inSections.value === "17", `${label}: G7 the value the row shows is the one that was typed`);
  const overrideShot = await shotInspector(`${theme}-hairline-override`);

  await setSelect('[data-slot="inspector-design-picker"]', "current");
  await sleep(420);
  const inCurrent = await evaluate(`(() => {
    const row = document.querySelector('[data-slot="figma-dense-row"][data-field="radius"]');
    if (!row) throw new Error("no radius row in the current design");
    const t = row.querySelector('[data-slot="field-provenance-tag"]');
    return { text: t && t.textContent.trim(), tag: t && t.getAttribute("data-tag"), reset: !!row.querySelector('[data-slot="field-clear-override"]') };
  })()`);
  assert(inCurrent.text === inSections.text, `${label}: G7 the pre-sections panel says the same word (“${inCurrent.text}” vs “${inSections.text}”)`);
  assert(inCurrent.tag === inSections.tag, `${label}: G7 and carries the same data-tag`);
  assert(inCurrent.reset === inSections.reset, `${label}: G7 both agree on whether a ↺ is offered (${inCurrent.reset} vs ${inSections.reset})`);
  assert(inSections.reset === false, `${label}: G7 no ↺ on a row whose only fallback is its own default — main's rule, unchanged`);

  // P2's aggregate: the row's own vocabulary, one level up, and it survives
  // the fold — the whole point of putting it on a header.
  await setSelect('[data-slot="inspector-design-picker"]', "ledger");
  await sleep(420);
  const sectionTag = await text(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="section-title"] [data-slot="field-provenance-tag"]`);
  assert(/override/.test(sectionTag ?? ""), `${label}: P2's Layout header aggregates its rows' tag (“${sectionTag}”)`);
  assert((sectionTag ?? "").startsWith("1 "), `${label}: the aggregate counts the rows, not the sections (“${sectionTag}”)`);
  await click(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="fold-toggle"]`);
  assert(
    (await count(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="field-provenance-tag"]`)) === 1,
    `${label}: folded, P2's header still reports the override — which P1 structurally cannot`,
  );
  assert(
    (await count(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="standard-row"]`)) === 0,
    `${label}: and it reports it with every row gone`,
  );
  const taggedShot = await shotInspector(`${theme}-ledger-tagged-folded`);
  await click(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="fold-toggle"]`);
  return { overrideShot, taggedShot };
}

/** S4, which needed no new work: two fields sharing `group` on one row. */
async function gateGroupRow(label) {
  const pair = await evaluate(`(() => {
    const p = document.querySelector('${PANEL} [data-slot="standard-pair"]');
    if (!p) return null;
    const rows = Array.from(p.querySelectorAll('[data-slot="standard-row"]'));
    const tops = rows.map((r) => Math.round(r.getBoundingClientRect().top));
    return { fields: rows.map((r) => r.getAttribute("data-field")), sameLine: new Set(tops).size === 1 };
  })()`);
  assert(pair !== null, `${label}: G8 a declared group renders as a pair`);
  assert(pair.fields.length === 2, `${label}: G8 the pair holds two fields (${pair.fields.join(", ")})`);
  assert(pair.sameLine, `${label}: G8 both halves sit on ONE line`);
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

const manifest = [];
try {
  await reachOrigin();
  for (const theme of ["dark", "light"]) {
    await loadFixture(theme);
    const entry = { theme, designs: {}, console: [] };

    for (const design of DESIGNS) {
      const label = `${theme}/${design.id}`;
      await setSelect('[data-slot="inspector-design-picker"]', design.id);
      await sleep(420);
      const files = {};
      files.hero = await shotInspector(`${theme}-${design.id}-hero`);

      if (design.id === "current") {
        // The before. It is the reason for the gates, so it is exempt from
        // them — but it must still have the double header the fix removes,
        // or there was nothing to fix.
        const legacy = await count('[data-slot="members-header"]');
        assert(legacy > 0, `${label}: the before design still draws control-owned list headers (${legacy})`);
        entry.designs[design.id] = { files, legacyHeaders: legacy };
        continue;
      }

      await waitFor(PANEL);
      await gateNoHelperText(label);
      await gateStandardControls(label);
      await gateFullBleed(label);
      await gateOneHeaderPerList(label);
      await gateHoverChevron(label);
      await gateGroupRow(label);

      // Hover capture: the chevron, revealed, on a real pointer.
      await hover('[data-slot="inspector-section"][data-open="true"] [data-slot="section-title"]');
      files.hover = await shotInspector(`${theme}-${design.id}-hover`);
      await unhover();

      await gateCompactFold(label);

      // Everything folded — the compact reading of the whole panel.
      const sectionIds = await evaluate(`Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"]')).map((s) => s.getAttribute("data-section"))`);
      for (const id of sectionIds) {
        const open = await attr(`${PANEL} [data-slot="inspector-section"][data-section="${id}"]`, "data-open");
        if (open === "true") await click(`${PANEL} [data-slot="inspector-section"][data-section="${id}"] [data-slot="fold-toggle"]`);
      }
      const foldedHeight = await evaluate(`Math.round(document.querySelector('${PANEL}').getBoundingClientRect().height)`);
      files.folded = await shotInspector(`${theme}-${design.id}-folded`);
      assert(
        (await count(`${PANEL} [data-slot="section-body"]`)) === 0,
        `${label}: every section folds — no body survives`,
      );
      for (const id of sectionIds) {
        await click(`${PANEL} [data-slot="inspector-section"][data-section="${id}"] [data-slot="fold-toggle"]`);
      }
      const openHeight = await evaluate(`Math.round(document.querySelector('${PANEL}').getBoundingClientRect().height)`);
      assert(foldedHeight < openHeight, `${label}: folded is shorter than open (${foldedHeight} < ${openHeight})`);

      // Density — one switch, shared by all three designs.
      const roomy = await rectOf(`${PANEL} [data-slot="section-title"]`);
      await click('[data-slot="density-button"][data-density="compact"]');
      const compact = await rectOf(`${PANEL} [data-slot="section-title"]`);
      assert(compact.h < roomy.h, `${label}: Compact shortens a section header (${Math.round(compact.h)} < ${Math.round(roomy.h)})`);
      files.compact = await shotInspector(`${theme}-${design.id}-compact`);
      await click('[data-slot="density-button"][data-density="comfortable"]');

      // P3's host-owned stratum, and its absence from the other two.
      const hasRenderer = (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"]`)) > 0;
      if (design.id === "strata") {
        assert(hasRenderer, `${label}: P3 builds the Renderer section`);
        assert((await count(`${PANEL} [data-slot="stratum-rule"]`)) === 1, `${label}: exactly one stratum rule separates the two halves`);
        const rendererLabel = await text(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="header-label"]`);
        assert(rendererLabel === "Renderer · tldraw", `${label}: the Renderer section names the live surface (“${rendererLabel}”)`);
        const order = await evaluate(`Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"]')).map((s) => s.getAttribute("data-section"))`);
        assert(order[order.length - 1] === "renderer", `${label}: the host stratum sits last (${order.join(" → ")})`);
        // X and Y are a declared `group`, so they land as a pair — the same
        // mechanism a component's width/height uses, on rows that are not a
        // component's at all.
        assert(
          (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="standard-pair"]`)) === 1,
          `${label}: the host's X and Y share one row through FieldSpec.group`,
        );
        const note = await text(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="field-note"]`);
        assert(/tldraw writes this/.test(note ?? ""), `${label}: each host row says who writes it (“${note}”)`);
        files.renderer = await shotInspector(`${theme}-${design.id}-renderer`);

        // Writing X really moves the node: one code path with a canvas drag.
        const beforeX = await evaluate(`(() => document.querySelector('${PANEL} [data-slot="standard-row"][data-field="x"] input').value)()`);
        await evaluate(`(() => {
          const input = document.querySelector('${PANEL} [data-slot="standard-row"][data-field="x"] input');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(input, "260");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.blur();
        })()`);
        await sleep(420);
        const afterX = await evaluate(`(() => document.querySelector('${PANEL} [data-slot="standard-row"][data-field="x"] input').value)()`);
        assert(afterX === "260" && afterX !== beforeX, `${label}: typing into the host's X writes the canvas position (${beforeX} → ${afterX})`);

        // The DOM render has no canvas: `RENDERS.canMove === false` alone
        // must disable the rows and mute the section — no special case.
        await click('[data-slot="render-tab"][data-render="dom"]');
        await sleep(420);
        const domLabel = await text(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="header-label"]`);
        assert(domLabel === "Renderer · DOM", `${label}: the section renames itself with the surface (“${domLabel}”)`);
        assert(
          (await attr(`${PANEL} [data-slot="inspector-section"][data-section="renderer"]`, "data-muted")) === "true",
          `${label}: a surface with no canvas is muted, not hidden`,
        );
        const disabled = await evaluate(`Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="standard-row"]')).every((r) => r.getAttribute("data-disabled") === "true")`);
        assert(disabled, `${label}: every host row is read-only on the DOM render`);
        files.rendererDom = await shotInspector(`${theme}-${design.id}-renderer-dom`);
        await click('[data-slot="render-tab"][data-render="tldraw"]');
        await sleep(420);
      } else {
        assert(!hasRenderer, `${label}: a design that does not declare renderer:true gets no host section`);
      }

      entry.designs[design.id] = { files, foldedHeight, openHeight };
    }

    const provenance = await gateProvenanceParity(theme);
    entry.provenance = provenance;

    assert(consoleErrors.length === 0, `${theme}: G9 no console error across all four designs (${consoleErrors.slice(0, 2).join(" | ")})`);
    entry.console = consoleErrors.slice();
    manifest.push(entry);
  }

  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ manifest, checks }, null, 2));
  console.log(`\n${checks.length} assertions passed across ${manifest.length} themes and ${DESIGNS.length} designs.`);
  console.log(`captures → ${outDir}`);
} catch (error) {
  console.error("\nFAILED:", error.message);
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(path.join(outDir, "FAILED.png"), Buffer.from(data, "base64"));
    const html = await evaluate(`(() => { const el = document.querySelector('[data-slot="inspector-column"]'); return el ? el.outerHTML : document.body.outerHTML; })()`);
    writeFileSync(path.join(outDir, "FAILED-inspector.html"), html);
  } catch {
    /* the page may be gone */
  }
  console.error(`${checks.length} assertions passed before the failure.`);
  browser.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* Chrome may still be flushing its profile; the temp dir is disposable */
  }
  process.exit(1);
}

browser.close();
chrome.kill();
// Chrome keeps writing its profile for a beat after SIGTERM, so a plain
// rmSync races it and throws ENOTEMPTY on a run that otherwise PASSED —
// a green journey must not exit non-zero over a disposable temp directory.
await new Promise((r) => setTimeout(r, 400));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
} catch {
  /* the OS will reap it */
}
