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
 * Round 3 (same evening, plan approved): the Block is Header · Body ·
 * Footer with one Bar primitive at each end; hide, line and radius are
 * fields; a header's `size` cascades to its slots and their members
 * through the resolver's inherited layer, and a local override wins.
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
  // Zach, 2026-09-12: a Block owns its Ports (they are its members) — a
  // fresh Block now seeds three ("in", "cfg", "out") into its own Ports
  // list, appended after the seven slot lists (`seedBlockPorts` in
  // packages/panel/src/bench.tsx), so eight lists render, not seven.
  assert((await sectionCount()) === 8, "a fresh Block shows all seven slot lists plus its own seeded Ports list, without unfolding");
  assert((await evaluate(`document.querySelectorAll('[data-slot="members-section"] [data-slot="add-member-trigger"]').length`)) === 8, "eight + buttons, one click each");
  const blockClip = await inspectorClip();
  const blockFresh = await screenshot(`${theme}-5-block-fresh`, blockClip);
  await addVia("Glyph", 0);
  await addVia("Pill", 2);
  assert((await inspectorName()) === "Block", "adding into a slot keeps the Block");
  // The eighth entry is the Block's own Ports list, already seeded with
  // three ("in", "cfg", "out") — see the WHY above.
  assert((await listCounts()).join() === "1,0,1,0,0,0,0,3", `header left and right count one, ports list carries its seeded three (${(await listCounts()).join()})`);
  // The header is a Bar: its left / center / right are the Bar's cells; the
  // first member-instance inside a cell is the cell's own Flex fill.
  const inCell = async (edge, cell) => evaluate(`Array.from(document.querySelectorAll('[data-slot="dom-preview"] [data-slot="bar"][data-edge="${edge}"] [data-slot="bar-cell"][data-cell="${cell}"] [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-type')).slice(1)`);
  assert((await inCell("bottom", "left")).join() === "Glyph" && (await inCell("bottom", "right")).join() === "Pill", "the render put each member in its hole");
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

  // ---- Round 3 · Bar, hide / line / radius, the size cascade
  await load(theme, "Block");
  // The anatomy: Block › Header (Bar) › Left · Center · Right; Body; Footer (Bar) › …
  const navRows = () => evaluate(`Array.from(document.querySelectorAll('[data-slot="instance-navigator"] [data-slot="nav-row"]')).map(e => [e.getAttribute('data-instance-type'), Number(e.getAttribute('data-depth')), e.querySelector('[data-slot="nav-title"]')?.textContent.trim()])`);
  const rows = await navRows();
  // Thirteen rows: Block + 2 Bars + 7 Flex (as before) + the three seeded
  // Ports ("in", "cfg", "out"), appended at depth 1 after the Footer's
  // cells — a Block's own members render in the tree same as any other.
  assert(rows.length === 13, `thirteen rows: Block + 2 Bars + 7 Flex + 3 seeded Ports (${rows.length})`);
  assert(rows[1][0] === "Bar" && rows[1][1] === 1 && rows[1][2] === "Header", `row 1 is the Header Bar (${rows[1]})`);
  assert(rows[2][0] === "Flex" && rows[2][1] === 2 && rows[2][2] === "Left", `row 2 is the header's Left cell at depth 2 (${rows[2]})`);
  assert(rows[5][2] === "Body" && rows[6][2] === "Footer", `Body then Footer (${rows[5][2]}, ${rows[6][2]})`);
  assert(
    rows[10][0] === "Port" && rows[11][0] === "Port" && rows[12][0] === "Port",
    `the three seeded Ports trail the tree (${JSON.stringify(rows.slice(10))})`,
  );
  // Two region rows with quick controls; seven lists still one click from +.
  assert((await evaluate(`document.querySelectorAll('[data-slot="region-header"]').length`)) === 2, "a region row for Header and for Footer");
  assert((await sectionCount()) === 8, "eight lists: three per bar, the body, and the Block's own seeded Ports list");
  const r3clip = await inspectorClip();
  const r3fresh = await screenshot(`${theme}-8-anatomy`, r3clip);
  const r3page = await screenshot(`${theme}-8-anatomy-page`);
  // Fill the header: Glyph left, TextBox centre, Pill right; a Port in the body row.
  await addVia("Glyph", 0);
  await addVia("TextBox", 1);
  await addVia("Pill", 2);
  assert((await inspectorName()) === "Block", "still on the Block after three adds");
  const inBar = async (edge, cell) => evaluate(`Array.from(document.querySelectorAll('[data-slot="dom-preview"] [data-slot="bar"][data-edge="${edge}"] [data-slot="bar-cell"][data-cell="${cell}"] [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-type')).slice(1)`);
  assert((await inBar("bottom", "left")).join() === "Glyph", "the Glyph is in the header's left cell");
  assert((await inBar("bottom", "center")).join() === "TextBox", "the TextBox is in the header's centre cell");
  assert((await inBar("bottom", "right")).join() === "Pill", "the Pill is in the header's right cell");
  // Size cascade: header → xl reaches the Glyph and the TextBox; Pill too.
  const glyphSize = () => evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="bottom"] [data-slot="glyph"]')?.getAttribute('data-size')`);
  const textSize = () => evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="bottom"] [data-slot="text-box"]')?.getAttribute('data-size')`);
  assert((await glyphSize()) === "md" && (await textSize()) === "md", `before: both md (${await glyphSize()}, ${await textSize()})`);
  await setSelect('[data-slot="region-header"][data-region-fill] [data-slot="region-size"]', "xl");
  await sleep(250);
  assert((await glyphSize()) === "xl", `the header's xl reached the Glyph (${await glyphSize()})`);
  assert((await textSize()) === "xl", `and the TextBox (${await textSize()})`);
  assert((await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="bottom"]')?.getAttribute('data-size')`)) === "xl", "the bar itself is xl");
  assert((await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="top"]')?.getAttribute('data-size')`)) === "md", "the footer stays md");
  const r3xl = await screenshot(`${theme}-9-header-xl`, r3clip);
  const r3xlPage = await screenshot(`${theme}-9-header-xl-page`);
  // A local override on the Glyph wins, and its row says so.
  await evaluate(`document.querySelectorAll('[data-slot="members-section"]')[0].querySelector('[data-slot="member-select"]').click()`);
  await sleep(250);
  assert((await inspectorName()) === "Glyph", "into the Glyph");
  await evaluate(`Array.from(document.querySelectorAll('[data-slot="tier-button"]')).find(b => /expert/i.test(b.textContent))?.click()`);
  await sleep(150);
  // The row's provenance lives on its dot (a title, as the other layers'
  // provenance does), not in the row text.
  const provenance = await evaluate(`document.querySelector('[data-field="size"] [data-slot="field-provenance-dot"]')?.getAttribute('title') ?? ""`);
  assert(/inherited/i.test(provenance) && /Header/.test(provenance), `the Glyph's size dot says inherited from Header (${provenance.slice(0, 80)})`);
  const r3inherited = await screenshot(`${theme}-10-inherited-row`, r3clip);
  // A size row with px labels is Figma Dense's named dropdown: open the
  // trigger, then pick the "Small" row.
  await evaluate(`document.querySelector('[data-field="size"] [data-slot="named-dropdown-trigger"]')?.click()`);
  await sleep(150);
  const picked = await evaluate(`(() => { const row = Array.from(document.querySelectorAll('[data-field="size"] [data-slot="named-dropdown-row"]')).find(b => /small/i.test(b.textContent)); if (row) { row.click(); return true; } const sel = document.querySelector('[data-field="size"] select'); if (sel) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, "sm"); sel.dispatchEvent(new Event("change", { bubbles: true })); return true; } return false; })()`);
  assert(picked, "picked Small on the Glyph's size row");
  await sleep(250);
  assert((await glyphSize()) === "sm", `the Glyph's own sm wins over the header's xl (${await glyphSize()})`);
  assert((await textSize()) === "xl", "the TextBox still inherits xl");
  await evaluate(`document.querySelector('[data-field="size"] [data-slot="field-clear-override"]')?.click()`);
  await sleep(250);
  assert((await glyphSize()) === "xl", `clearing the override returns the Glyph to the inherited xl (${await glyphSize()})`);
  await sideButton("back");
  assert((await inspectorName()) === "Block", "back on the Block");
  // Hide the footer; turn the header's line off.
  await evaluate(`document.querySelectorAll('[data-slot="region-header"]')[1].querySelector('[data-slot="region-hidden"]').click()`);
  await sleep(250);
  assert((await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="top"]')?.getAttribute('data-hidden')`)) === "true", "the footer bar is hidden in the render");
  // Four slot lists (header × 3 + body) plus the Block's own Ports list,
  // which carries `region: null` precisely so the footer's fold never
  // hides it (see members-section.tsx's `memberListsFor`).
  assert((await sectionCount()) === 5, `the footer's lists fold away: five lists remain, four slots plus the Block's own Ports list (${await sectionCount()})`);
  await evaluate(`document.querySelectorAll('[data-slot="region-header"]')[0].querySelector('[data-slot="region-line"]').click()`);
  await sleep(250);
  assert((await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="bottom"]')?.getAttribute('data-line')`)) === "false", "the header's line is off");
  assert((await evaluate(`getComputedStyle(document.querySelector('[data-slot="dom-preview"] [data-slot="bar"][data-edge="bottom"]')).borderBottomWidth`)) === "0px", "no divider painted");
  const r3hidden = await screenshot(`${theme}-11-footer-hidden-line-off`, r3clip);
  const r3hiddenPage = await screenshot(`${theme}-11-footer-hidden-page`);
  // Radius: 0 is edge-to-edge. The number row sits in the Expert tier.
  await evaluate(`Array.from(document.querySelectorAll('[data-slot="tier-button"]')).find(b => /expert/i.test(b.textContent))?.click()`);
  await sleep(150);
  assert(await evaluate(`!!document.querySelector('[data-field="radius"] input')`), "the radius row is there in Expert");
  const before = await evaluate(`getComputedStyle(document.querySelector('[data-slot="dom-preview"] [data-slot="block"]')).borderRadius`);
  assert(before === "8px", `default radius 8 (${before})`);
  await evaluate(`(() => { const input = document.querySelector('[data-field="radius"] input, [data-field="radius"] [data-slot="number-input"] input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "0"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await sleep(250);
  const after = await evaluate(`getComputedStyle(document.querySelector('[data-slot="dom-preview"] [data-slot="block"]')).borderRadius`);
  assert(after === "0px", `radius 0 is square (${after})`);
  const r3square = await screenshot(`${theme}-12-radius-0-page`);
  manifest.push({ theme, console: Array.from(new Set(consoleErrors)), files: { emptyOpen, stayed, entered, back, blockFresh, blockFilled, blockPage, deep, r3fresh, r3page, r3xl, r3xlPage, r3inherited, r3hidden, r3hiddenPage, r3square } });
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
console.log(`PASS — ${manifest.length} entries → ${outDir}`);
