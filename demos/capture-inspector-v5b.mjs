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
 *   G10 a member list's header is drawn as a PROPERTY ROW — same ink, type,
 *       weight and left edge as a real field row in the same section body,
 *       and no taller ("I don't like how its greyed out and tab indented, I
 *       do like how its more compact now though")
 *   G11 the shipped default never marks a folded header; the flag that does
 *       is opt-in and off ("leave it off by default, I prefer simplicity")
 *   G13 a section that stands for a SLOT says so — "Left Slot", never the
 *       bare "Left" that is also a Justify value one row below it — and the
 *       member list inside it does not repeat its section's name
 *   G14 the ↺ reset appears on EVERY overridden row, whatever control kind
 *       draws it ("when you edit a value away from default you get a little
 *       reset icon that appears to put it back")
 *   G15 a component whose members ARE its content (a Flex) gets ONE section,
 *       with the list as its last property — "within a flex object you can
 *       get rid of the members header. members should just be a property of
 *       the flex directly" — while a Block, whose Header/Body/Footer each
 *       hold their own fields AND lists, is untouched
 *   G12 an open dropdown is never cut off by the panel's own scroll box —
 *       every row painted and hittable, nothing off-screen ("I did a drop
 *       down on the state property, and instead of showing me the drop down
 *       menu, its cut off with a scroll wheel")
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

/**
 * One panel, no picker.
 *
 * Round 2 drove four: the pre-sections panel plus P1/P2/P3, switched through
 * `[data-slot="inspector-design-picker"]`. Zach shipped P1 on 2026-09-12 and
 * round 3 removed the rivals and the switcher with them, so every gate below
 * now runs against the one thing `/create` renders. The comparison captures
 * live in the round-2 report and in git.
 */
const DESIGN = "sections";

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
  // column is full height whatever it holds, so a clip on the column ends
  // hundreds of empty pixels below the last row and a report builder's trim
  // has nothing to find.
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

/**
 * Add a member through the app's OWN Add menu. Seeding behind the app's back
 * would prove nothing about the app.
 *
 * WHY it targets `section-list` and not `members-section`: the Add menu is a
 * verb on the list's ONE header, which the section layer draws — it is a
 * sibling of the control, not inside it. It used to be reachable inside
 * `members-section` because the fixture ran in the pre-sections design, where
 * every list drew its own header; that design is gone.
 *
 * An EMPTY list shows its + at rest (`FoldRow`: a list with nothing in it is
 * not foldable, and a non-foldable header keeps its verbs), which is exactly
 * the state a fixture seeds from.
 */
async function addVia(listIndex, type) {
  await evaluate(`(() => {
    const list = document.querySelectorAll('[data-slot="section-list"]')[${listIndex}];
    if (!list) throw new Error("no members list at index ${listIndex}");
    const trigger = list.querySelector('[data-slot="add-member-trigger"]');
    if (!trigger) throw new Error("list " + ${listIndex} + " shows no Add trigger");
    trigger.click();
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
    localStorage.setItem("bbox-ui.create.inspectorDensity", "comfortable");
    localStorage.setItem("bbox-ui.create.render", "tldraw");
  })()`).catch(() => {});
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(700);
  await setSelect('[data-slot="component-picker"]', "Block");
  await waitFor('[data-slot="section-list"]');
  await sleep(400);
  // Header Slot's Left is list 0 and its Right is list 2 — a Block's Bar has
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
    const reset = row.querySelector('[data-slot="field-clear-override"]');
    return {
      text: t && t.textContent.trim(),
      tag: t && t.getAttribute("data-tag"),
      reset: !!reset,
      resetsTo: reset && reset.getAttribute("data-resets-to"),
      resetTitle: reset && reset.getAttribute("title"),
      value: row.querySelector("input").value,
    };
  })()`);
  assert(inSections.text === "override", `${label}: G7 an overridden row grows main's plain-word OVERRIDE tag inside the section chrome (“${inSections.text}”)`);
  assert(inSections.tag === "override", `${label}: G7 it carries the tag's own data-tag, not a dot`);
  assert(inSections.value === "17", `${label}: G7 the value the row shows is the one that was typed`);

  // G14 — and it offers the way back.
  //
  // THIS ASSERTION IS INVERTED FROM ROUND 2, deliberately. It used to read
  // "no ↺ on a row whose only fallback is its own default — main's rule,
  // unchanged", which described what main did rather than what Zach asked
  // for: "when you edit a value away from default you get a little reset icon
  // that appears to put it back." Radius is governed by no preset and
  // inherits from nothing, so under the old rule it was exactly the row that
  // never got one. `resolve.ts` guarantees a default always exists, so there
  // is always somewhere to go back to.
  assert(inSections.reset === true, `${label}: G14 an overridden row offers its ↺, even with only a default under it`);
  assert(inSections.resetsTo === "default", `${label}: G14 and says which layer it lands on (“${inSections.resetsTo}”)`);
  assert(
    inSections.resetTitle === "Reset to the default",
    `${label}: G14 the tooltip names that layer rather than claiming a preset that is not there (“${inSections.resetTitle}”)`,
  );

  // Clicking it really puts the value back — a button that renders is not a
  // button that works.
  await click(`${PANEL} [data-slot="standard-row"][data-field="radius"] [data-slot="field-clear-override"]`);
  await sleep(320);
  const afterReset = await evaluate(`(() => {
    const row = document.querySelector('${PANEL} [data-slot="standard-row"][data-field="radius"]');
    return { value: row.querySelector("input").value, tag: !!row.querySelector('[data-slot="field-provenance-tag"]'), reset: !!row.querySelector('[data-slot="field-clear-override"]') };
  })()`);
  assert(afterReset.value !== "17", `${label}: G14 the ↺ actually restores the value (still “${afterReset.value}”)`);
  assert(afterReset.tag === false, `${label}: G14 and the OVERRIDE tag goes with it`);
  assert(afterReset.reset === false, `${label}: G14 and the button retires, having nothing left to clear`);

  // Put it back so the override capture below has an override in it.
  await evaluate(`(() => {
    const row = document.querySelector('${PANEL} [data-slot="standard-row"][data-field="radius"]');
    const input = row.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "17");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  })()`);
  await sleep(360);

  // The shipped default keeps `foldedOverrideMark: false` — "leave it off by
  // default, I prefer simplicity". Folding Layout with a stored override must
  // therefore still produce a bare header.
  await click(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="fold-toggle"]`);
  assert(
    (await count(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="section-title"] [data-slot="field-provenance-tag"]`)) === 0,
    `${label}: G11 the shipped default marks nothing on a folded header, override or not`,
  );
  await click(`${PANEL} [data-slot="inspector-section"][data-section="layout"] [data-slot="fold-toggle"]`);
  const overrideShot = await shotInspector(`${theme}-override`);
  return { overrideShot };
}

/**
 * G14 — the ↺ is a property of having an override, not of which control
 * happens to draw the row.
 *
 * Zach's screenshot showed an overridden Justify (a dropdown) with no reset
 * beside it, while an overridden Diameter (a segmented/dropdown rung) had
 * one. The apparent split was by control kind; the real split was by cascade
 * — Diameter is preset-governed, Justify is not. So this drives EVERY control
 * kind the panel can draw and asserts each one, having been written, offers
 * the way back.
 */
async function gateResetOnEveryControlKind(label) {
  const report = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('${PANEL} [data-slot="standard-row"]'));
    return rows.map((r) => ({
      field: r.getAttribute("data-field"),
      kind: r.querySelector("[data-standard-control]")?.getAttribute("data-standard-control"),
      disabled: r.getAttribute("data-disabled") === "true",
      overridden: r.querySelector('[data-slot="field-provenance-tag"][data-tag="override"]') !== null,
      reset: r.querySelector('[data-slot="field-clear-override"]') !== null,
    }));
  })()`);
  const kinds = Array.from(new Set(report.filter((r) => !r.disabled).map((r) => r.kind)));
  assert(kinds.length >= 3, `${label}: G14 the panel draws enough control kinds to be worth checking (${kinds.join(", ")})`);
  for (const row of report) {
    if (row.disabled) continue;
    assert(
      row.overridden === row.reset,
      `${label}: G14 ${row.field} (${row.kind}) — an override and a ↺ go together, always (override ${row.overridden}, reset ${row.reset})`,
    );
  }
  const withReset = report.filter((r) => r.reset);
  return { rows: report.length, kinds, withReset: withReset.map((r) => `${r.field}:${r.kind}`) };
}

/**
 * G13 — a section that stands for a SLOT says "Slot".
 *
 * Zach, 2026-09-12, of a Flex cell headed bare "Left" above Size / Direction
 * / Justify / Align / Wrap, with a member list under it also called "Left":
 * Left, Center and Right are already VALUES in that same panel — Justify's,
 * Align's, Port's Edge — so the bare word as a title cannot be told from the
 * word as a thing to pick. And a list that repeats the heading directly above
 * it spends a row saying nothing.
 */
async function gateSlotNaming(label) {
  const sections = await evaluate(`(() => {
    return Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"]')).map((s) => ({
      id: s.getAttribute("data-section"),
      title: s.querySelector('[data-slot="section-title"] [data-slot="header-label"]')?.textContent.trim(),
      lists: Array.from(s.querySelectorAll('[data-slot="section-list"] [data-slot="list-header"] [data-slot="header-label"]')).map((l) => l.textContent.trim()),
    }));
  })()`);
  const SLOT_REGIONS = ["header", "body", "footer", "left", "center", "right"];
  const slotSections = sections.filter((s) => SLOT_REGIONS.includes(s.id));
  assert(slotSections.length > 0, `${label}: G13 the subject has slot sections to name (${sections.map((s) => s.id).join(", ")})`);
  for (const section of slotSections) {
    assert(/ Slot$/.test(section.title ?? ""), `${label}: G13 the ${section.id} section is named as a slot (“${section.title}”)`);
    for (const list of section.lists) {
      assert(list !== section.title, `${label}: G13 the list under ${section.title} does not repeat it (“${list}”)`);
      // The bare ambiguous word is the thing being removed, at BOTH levels.
      assert(
        !["Left", "Center", "Right"].includes(list),
        `${label}: G13 no list is titled with a bare Justify/Align value (“${list}”)`,
      );
    }
  }
  const allTitles = sections.map((s) => s.title);
  for (const bare of ["Left", "Center", "Right"]) {
    assert(!allTitles.includes(bare), `${label}: G13 no section is titled bare “${bare}”`);
  }
  return { sections: sections.map((s) => ({ id: s.id, title: s.title, lists: s.lists })) };
}

/**
 * G10 — a member list's header is drawn as a PROPERTY ROW, not as a demoted
 * caption.
 *
 * Zach, 2026-09-12, of a Body section's "Body · empty" sitting a tab right
 * of the "Wrap" row above it: "I don't like how its greyed out and tab
 * indented, I do like how its more compact now though." So this measures the
 * three demotions against a real sibling row in the SAME section body —
 * ink, type and left edge — rather than against a remembered constant, and
 * it keeps the height check that stops a fix from undoing the compactness he
 * liked.
 */
async function gateListRowReadsAsAProperty(label) {
  const cmp = await evaluate(`(() => {
    const body = Array.from(document.querySelectorAll('${PANEL} [data-slot="section-body"]'))
      .find((b) => b.querySelector('[data-slot="list-header"]') && b.querySelector('[data-slot="standard-row"]'));
    if (!body) throw new Error("no section holds both a property row and a member list");
    const listLabel = body.querySelector('[data-slot="list-header"] [data-slot="header-label"]');
    const fieldLabel = body.querySelector('[data-slot="standard-row"] [data-slot="field-label"]');
    const read = (el) => {
      const cs = getComputedStyle(el);
      return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, left: Math.round(el.getBoundingClientRect().left) };
    };
    const listRow = body.querySelector('[data-slot="list-header"]');
    const fieldRow = body.querySelector('[data-slot="standard-row"]');
    return {
      list: read(listLabel),
      field: read(fieldLabel),
      listHeight: Math.round(listRow.getBoundingClientRect().height),
      fieldHeight: Math.round(fieldRow.getBoundingClientRect().height),
      summaryLeft: Math.round((listRow.querySelector('[data-slot="header-label"]').parentElement.getBoundingClientRect().right)),
    };
  })()`);
  assert(cmp.list.left === cmp.field.left, `${label}: G10 a list header starts on the same left edge as a property row — no tab indent (${cmp.list.left} vs ${cmp.field.left})`);
  assert(cmp.list.color === cmp.field.color, `${label}: G10 it is painted in the same ink, not greyed out (${cmp.list.color} vs ${cmp.field.color})`);
  assert(cmp.list.size === cmp.field.size, `${label}: G10 and at the same type size (${cmp.list.size} vs ${cmp.field.size})`);
  assert(cmp.list.weight === cmp.field.weight, `${label}: G10 and the same weight (${cmp.list.weight} vs ${cmp.field.weight})`);
  assert(Math.abs(cmp.listHeight - cmp.fieldHeight) <= 2, `${label}: G10 and it stays as compact as the row beside it (${cmp.listHeight} vs ${cmp.fieldHeight})`);
}

/**
 * G12 — an open dropdown is never cut off by the panel's own scrollbar.
 *
 * Zach, 2026-09-12, on Port's State row: "I did a drop down on the state
 * property, and instead of showing me the drop down menu, its cut off with a
 * scroll wheel." Reproduced before the fix at 22px of a six-row menu sheared
 * off at `[data-slot="inspector-scroll"]`'s edge.
 *
 * WHY the assertion is `elementFromPoint` on the LAST row and not a
 * rectangle comparison: the menu is `position: fixed` now, so it is SUPPOSED
 * to extend past the scroller's box — a rect test would fail on the fixed
 * version and pass on a clipped one that happened to fit. What matters is
 * whether the last row is actually painted and clickable, which is the
 * question a person is asking when they open a menu.
 */
async function gateDropdownEscapesTheScroller(label) {
  // Bottom of the scroller is where the old bug lived.
  await evaluate(`(() => { const sc = document.querySelector('[data-slot="inspector-scroll"]'); sc.scrollTop = sc.scrollHeight; })()`);
  await sleep(280);
  const opened = await evaluate(`(() => {
    const sc = document.querySelector('[data-slot="inspector-scroll"]');
    const top = sc.getBoundingClientRect().top;
    const triggers = Array.from(document.querySelectorAll('${PANEL} [data-slot="named-dropdown-trigger"]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.top > top)
      .sort((a, b) => b.r.top - a.r.top);
    if (triggers.length === 0) return null;
    triggers[0].el.click();
    return { field: triggers[0].el.closest("[data-field]")?.getAttribute("data-field") ?? "?" };
  })()`);
  assert(opened !== null, `${label}: G12 the panel has a dropdown near the foot of its scroller to test`);
  await sleep(260);
  const menu = await evaluate(`(() => {
    const menu = document.querySelector('[data-slot="named-dropdown-menu"]');
    if (!menu) return null;
    const rows = Array.from(menu.querySelectorAll('[data-slot="named-dropdown-row"]'));
    const hit = (el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return menu.contains(at);
    };
    const m = menu.getBoundingClientRect();
    return {
      rows: rows.length,
      reachable: rows.filter(hit).length,
      placement: menu.getAttribute("data-placement"),
      position: getComputedStyle(menu).position,
      offViewport: Math.round(Math.max(0, m.bottom - innerHeight) + Math.max(0, -m.top)),
      insideScroller: document.querySelector('[data-slot="inspector-scroll"]').contains(menu),
    };
  })()`);
  assert(menu !== null, `${label}: G12 the menu opened`);
  assert(menu.position === "fixed", `${label}: G12 it is placed against the viewport, not inside the scroller's box (${menu.position})`);
  assert(menu.rows > 0, `${label}: G12 it has rows (${menu.rows})`);
  assert(menu.reachable === menu.rows, `${label}: G12 every row is painted and hittable — none sheared off (${menu.reachable} of ${menu.rows})`);
  assert(menu.offViewport === 0, `${label}: G12 and none of it falls off the screen instead (${menu.offViewport}px)`);
  assert(menu.insideScroller, `${label}: G12 while still a DOM descendant of the scroller, so outside-click still knows its own menu`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(160);
  assert((await count('[data-slot="named-dropdown-menu"]')) === 0, `${label}: G12 Escape closes it`);
  await evaluate(`(() => { const sc = document.querySelector('[data-slot="inspector-scroll"]'); sc.scrollTop = 0; })()`);
  await sleep(200);
  return opened.field;
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

/**
 * G15 — when the members ARE the content, they are a property, not a section.
 *
 * Zach, 2026-09-12, of a Flex panel: "within a flex object you can get rid of
 * the members header. members should just be a property of the flex directly."
 * What he screenshotted was the word "Members" twice, four pixels apart — once
 * as a bold section title with its own fold chevron, once as the list's own
 * row directly under it — because `buildSections` pushed the list into a
 * section of its own whenever a component had no slots.
 *
 * The distinction this gate protects is NOT "never head a member list". A
 * Block's Header / Body / Footer each hold their own fields AND their own
 * lists, so there a heading says which region a list belongs to. A Flex has no
 * siblings for a heading to distinguish it from. So the gate is two-sided:
 * Flex collapses to one section, and Block must come out completely unchanged.
 */
async function gateMembersIsAProperty(label) {
  const shapeOf = async () =>
    evaluate(`(() => {
      const panel = document.querySelector('${PANEL}');
      return {
        sections: Array.from(panel.querySelectorAll('[data-slot="inspector-section"]')).map((s) => ({
          id: s.getAttribute("data-section"),
          title: s.querySelector('[data-slot="header-label"]')?.textContent ?? null,
          lists: Array.from(s.querySelectorAll('[data-slot="section-list"]')).map((l) => ({
            id: l.getAttribute("data-list-id"),
            count: Number(l.getAttribute("data-count")),
            label: l.querySelector('[data-slot="header-label"]')?.textContent ?? null,
            headers: l.querySelectorAll('[data-slot="list-header"]').length,
            add: !!l.querySelector('[data-slot="add-member-trigger"]'),
          })),
        })),
        membersSections: panel.querySelectorAll('[data-slot="inspector-section"][data-section="members"]').length,
        membersLabels: Array.from(panel.querySelectorAll('[data-slot="header-label"]')).filter((el) => el.textContent === "Members").length,
      };
    })()`);

  /* ---- the component whose members are its whole content ---------- */
  await setSelect('[data-slot="component-picker"]', "Flex");
  await waitFor(`${PANEL} [data-slot="standard-row"]`);
  await sleep(500);
  const flex = await shapeOf();
  const flexIds = flex.sections.map((s) => s.id);

  assert(flex.membersSections === 0, `${label}: G15 a Flex grows NO section of its own for its members (${flex.membersSections})`);
  assert(
    JSON.stringify(flexIds) === JSON.stringify(["self", "renderer"]),
    `${label}: G15 a Flex's panel is its own section and the host's, nothing between (${flexIds.join(" → ")})`,
  );
  // The literal complaint, as a number: the word appeared twice.
  assert(flex.membersLabels === 1, `${label}: G15 the word "Members" appears ONCE in the panel, not as a title above its own row (${flex.membersLabels})`);

  const own = flex.sections.find((s) => s.id === "self");
  // How many scalar rows the one section holds, so the report can say what
  // "its fields and its list are the whole panel" actually amounts to rather
  // than rounding it to "a handful".
  const flexFields = await evaluate(
    `document.querySelectorAll('${PANEL} [data-slot="inspector-section"][data-section="self"] [data-slot="standard-row"]').length`,
  );
  assert(flexFields > 0, `${label}: G15 the one section holds the component's own fields (${flexFields})`);
  assert(own.title === "Flex", `${label}: G15 the one section is the component's own (“${own.title}”)`);
  assert(own.lists.length === 1, `${label}: G15 and the member list is INSIDE it (${own.lists.length})`);
  assert(own.lists[0].label === "Members", `${label}: G15 the list keeps its own row label (“${own.lists[0].label}”)`);
  assert(own.lists[0].headers === 1, `${label}: G15 that row is still the list's ONE header (${own.lists[0].headers})`);
  // The + is the only way to add a member, and `FoldRow` shows it at rest
  // exactly while the list is empty (`showActions`: `!foldable`). That is the
  // state a fresh Flex is in — and the state in which the old layout hid it
  // behind a section that `isEffectivelyEmpty` folded shut by default.
  assert(own.lists[0].count === 0, `${label}: G15 a fresh Flex starts with no members (${own.lists[0].count})`);
  assert(own.lists[0].add, `${label}: G15 and its + is in the panel at rest, not behind a section folded shut for being empty`);

  // The list must read as the last PROPERTY of the section, not as something
  // parked after it: same left edge as the field row above it.
  const edges = await evaluate(`(() => {
    const body = document.querySelector('${PANEL} [data-slot="inspector-section"][data-section="self"] [data-slot="section-body"]');
    const field = body.querySelector('[data-slot="standard-row"]');
    const list = body.querySelector('[data-slot="section-list"] [data-slot="list-header"]');
    if (!field || !list) return null;
    return { field: Math.round(field.getBoundingClientRect().left), list: Math.round(list.getBoundingClientRect().left), after: list.getBoundingClientRect().top > field.getBoundingClientRect().top };
  })()`);
  assert(edges !== null, `${label}: G15 the section body holds both a field row and the list`);
  assert(edges.field === edges.list, `${label}: G15 the list row starts on the same left edge as a field row (${edges.list} vs ${edges.field})`);
  assert(edges.after, `${label}: G15 and sits after the scalars, as the section's last property`);

  const emptyShot = await shotInspector(`${label.split("/")[0]}-flex-members-empty`);

  /* ---- adding one still must not spawn a section ------------------- */
  // Increment, not an absolute: the create page may carry instances across a
  // reload, so "is now 1" would be a fixture assumption rather than a fact
  // about the +.
  const before = own.lists[0].count;
  await addVia(0, "Port");
  const filled = await shapeOf();
  const filledOwn = filled.sections.find((s) => s.id === "self");
  assert(filledOwn.lists[0].count === before + 1, `${label}: G15 the + really adds through the app's own menu (${before} → ${filledOwn.lists[0].count})`);
  assert(filled.membersSections === 0, `${label}: G15 and a populated list still spawns no section of its own`);
  assert(filled.membersLabels === 1, `${label}: G15 the word is still said once, with a member in the list (${filled.membersLabels})`);
  assert(filledOwn.lists[0].headers === 1, `${label}: G15 and the list still has exactly one header, expanded (${filledOwn.lists[0].headers})`);
  const filledShot = await shotInspector(`${label.split("/")[0]}-flex-members-one`);

  // What the section wrapper took with it must be NOTHING. The count and the
  // + are the row-level controls — the + is the only way to add a member —
  // and on a populated list they ride the same reveal every other header in
  // this panel uses (`FoldRow.showActions`: `actionsAtRest || revealed`), not
  // a rule of their own.
  const LIST_HEADER = `${PANEL} [data-slot="inspector-section"][data-section="self"] [data-slot="list-header"]`;
  await hover(LIST_HEADER);
  const shown = await evaluate(`(() => {
    const h = document.querySelector('${LIST_HEADER}');
    return {
      revealed: h.getAttribute("data-revealed"),
      add: !!h.querySelector('[data-slot="add-member-trigger"]'),
      count: h.querySelector('[data-slot="header-count"]')?.textContent ?? null,
    };
  })()`);
  await unhover();
  assert(shown.revealed === "true", `${label}: G15 the inlined list header still takes a real pointer (${shown.revealed})`);
  assert(shown.add, `${label}: G15 and reveals its + — the only way to add a member — exactly as a section header would`);
  assert(/1/.test(shown.count ?? ""), `${label}: G15 and its member count (“${shown.count}”)`);

  /* ---- and the component that DOES have regions is untouched ------- */
  await setSelect('[data-slot="component-picker"]', "Block");
  await waitFor(`${PANEL} [data-slot="section-list"]`);
  await sleep(500);
  const block = await shapeOf();
  const blockIds = block.sections.map((s) => s.id);
  assert(
    JSON.stringify(blockIds) === JSON.stringify(["layout", "appearance", "header", "body", "footer", "renderer"]),
    `${label}: G15 a Block's sections are exactly as they were (${blockIds.join(" → ")})`,
  );
  for (const id of ["header", "body", "footer"]) {
    const region = block.sections.find((s) => s.id === id);
    assert(region.lists.length > 0, `${label}: G15 the ${id} region keeps its own list(s) under its own heading (${region.lists.length})`);
    assert(/ Slot$/.test(region.title ?? ""), `${label}: G15 and keeps its slot title (“${region.title}”)`);
  }
  assert(block.membersSections === 0, `${label}: G15 a Block never had a members section and still does not`);
  const blockShot = await shotInspector(`${label.split("/")[0]}-block-unchanged`);

  return { flexIds, blockIds, flexFields, flexLists: filledOwn.lists, emptyShot, filledShot, blockShot };
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

    const label = `${theme}/${DESIGN}`;
    const files = {};
    await waitFor(PANEL);
    files.hero = await shotInspector(`${theme}-hero`);

    await gateNoHelperText(label);
    await gateStandardControls(label);
    await gateFullBleed(label);
    await gateOneHeaderPerList(label);
    await gateHoverChevron(label);
    await gateGroupRow(label);
    await gateListRowReadsAsAProperty(label);
    await gateDropdownEscapesTheScroller(label);
    const naming = await gateSlotNaming(label);
    const resets = await gateResetOnEveryControlKind(label);

    // The switcher and the pre-sections panel are gone with the decision.
    assert(
      (await count('[data-slot="inspector-design-picker"]')) === 0,
      `${label}: the settled design picker is gone from the column`,
    );
    assert((await count('[data-slot="variant-picker"]')) === 0, `${label}: and so is the settled panel-design picker in the sidebar`);
    assert((await count('[data-slot="members-header"]')) === 0, `${label}: no control-owned list header survives anywhere on the page`);
    assert((await count('[data-slot="stratum-rule"]')) === 0, `${label}: P3's rule went with P3`);

    // Hover capture: the chevron, revealed, on a real pointer.
    await hover('[data-slot="inspector-section"][data-open="true"] [data-slot="section-title"]');
    files.hover = await shotInspector(`${theme}-hover`);
    await unhover();

    await gateCompactFold(label);

    // Everything folded — the compact reading of the whole panel.
    const sectionIds = await evaluate(`Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"]')).map((s) => s.getAttribute("data-section"))`);
    for (const id of sectionIds) {
      const open = await attr(`${PANEL} [data-slot="inspector-section"][data-section="${id}"]`, "data-open");
      if (open === "true") await click(`${PANEL} [data-slot="inspector-section"][data-section="${id}"] [data-slot="fold-toggle"]`);
    }
    const foldedHeight = await evaluate(`Math.round(document.querySelector('${PANEL}').getBoundingClientRect().height)`);
    files.folded = await shotInspector(`${theme}-folded`);
    assert((await count(`${PANEL} [data-slot="section-body"]`)) === 0, `${label}: every section folds — no body survives`);
    for (const id of sectionIds) {
      await click(`${PANEL} [data-slot="inspector-section"][data-section="${id}"] [data-slot="fold-toggle"]`);
    }
    const openHeight = await evaluate(`Math.round(document.querySelector('${PANEL}').getBoundingClientRect().height)`);
    assert(foldedHeight < openHeight, `${label}: folded is shorter than open (${foldedHeight} < ${openHeight})`);

    // Density — one switch in the control bar, which is where it stayed.
    const roomy = await rectOf(`${PANEL} [data-slot="section-title"]`);
    await click('[data-slot="density-button"][data-density="compact"]');
    const compact = await rectOf(`${PANEL} [data-slot="section-title"]`);
    assert(compact.h < roomy.h, `${label}: Compact shortens a section header (${Math.round(compact.h)} < ${Math.round(roomy.h)})`);
    files.compact = await shotInspector(`${theme}-compact`);
    await click('[data-slot="density-button"][data-density="comfortable"]');

    // The host-owned section is built from the SUBJECT, not from a design —
    // it stopped being P3's feature on 2026-09-12 ("its just another header
    // and fields") and survives P3's removal untouched.
    const hasRenderer = (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"]`)) > 0;
    assert(hasRenderer, `${label}: the Renderer section is built from the subject's host facts`);
    const rendererLabelHere = await text(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="header-label"]`);
    assert(rendererLabelHere === "Renderer · tldraw", `${label}: and it names the live surface (“${rendererLabelHere}”)`);
    assert(
      (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="field-provenance-tag"]`)) === 0,
      `${label}: a host fact never reads as an override — it has no default to override`,
    );
    assert(
      (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="field-clear-override"]`)) === 0,
      `${label}: and never grows a ↺ either — there is no layer under the canvas`,
    );
    const order = await evaluate(`Array.from(document.querySelectorAll('${PANEL} [data-slot="inspector-section"]')).map((s) => s.getAttribute("data-section"))`);
    assert(order[order.length - 1] === "renderer", `${label}: the host section sits last by build order (${order.join(" → ")})`);
    // X and Y are a declared `group`, so they land as a pair — the same
    // mechanism a component's width/height uses, on rows that are not a
    // component's at all.
    assert(
      (await count(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="standard-pair"]`)) === 1,
      `${label}: the host's X and Y share one row through FieldSpec.group`,
    );
    const note = await text(`${PANEL} [data-slot="inspector-section"][data-section="renderer"] [data-slot="field-note"]`);
    assert(/tldraw writes this/.test(note ?? ""), `${label}: each host row says who writes it (“${note}”)`);
    files.renderer = await shotInspector(`${theme}-renderer`);

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

    // The DOM render has no canvas: `RENDERS.canMove === false` alone must
    // disable the rows and mute the section — no special case.
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
    files.rendererDom = await shotInspector(`${theme}-renderer-dom`);
    await click('[data-slot="render-tab"][data-render="tldraw"]');
    await sleep(420);

    entry.designs[DESIGN] = { files, foldedHeight, openHeight, naming, resets };

    const provenance = await gateProvenanceParity(theme);
    entry.provenance = provenance;

    // His actual report was Port's State row, not a Block's — a Port carries
    // far more fields, so its panel scrolls harder and the menu sat lower.
    // Drive the exact component he was on.
    await setSelect('[data-slot="component-picker"]', "Port");
    await waitFor(`${PANEL} [data-slot="standard-row"]`);
    await sleep(500);
    const portField = await gateDropdownEscapesTheScroller(`${theme}/port`);
    await evaluate(`(() => { const sc = document.querySelector('[data-slot="inspector-scroll"]'); sc.scrollTop = sc.scrollHeight; })()`);
    await sleep(260);
    await evaluate(`(() => {
      const sc = document.querySelector('[data-slot="inspector-scroll"]');
      const top = sc.getBoundingClientRect().top;
      const t = Array.from(document.querySelectorAll('${PANEL} [data-slot="named-dropdown-trigger"]'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.top > top)
        .sort((a, b) => b.r.top - a.r.top)[0];
      if (t) t.el.click();
    })()`);
    await sleep(300);
    const { data: portShot } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, `${theme}-port-dropdown.png`), Buffer.from(portShot, "base64"));
    entry.portDropdown = { file: `${theme}-port-dropdown.png`, field: portField };
    await evaluate(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
    await sleep(200);
    await setSelect('[data-slot="component-picker"]', "Block");
    await sleep(500);

    // G15 runs last because it drives the picker itself — Flex, then back to
    // Block — and it leaves Block selected, the state everything above assumes.
    entry.membersProperty = await gateMembersIsAProperty(`${theme}/${DESIGN}`);

    assert(consoleErrors.length === 0, `${theme}: G9 no console error anywhere in the run (${consoleErrors.slice(0, 2).join(" | ")})`);
    entry.console = consoleErrors.slice();
    manifest.push(entry);
  }

  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ manifest, checks }, null, 2));
  console.log(`\n${checks.length} assertions passed across ${manifest.length} themes.`);
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
