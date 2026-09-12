#!/usr/bin/env node
/**
 * Drive the /create page's Members control in headless Chrome over raw CDP
 * (same pattern as demos/capture-dndkit-lab.mjs, no puppeteer) and PROVE the
 * contract for every one of the five controls, in both themes:
 *
 *   add is typed → the new member is selected → the inspector shows the
 *   CHILD → the path climbs back to the parent → a member row selects →
 *   clicking a member on the DOM / React Flow / tldraw render selects it →
 *   reorder moves the rendered order → remove removes.
 *
 * Every assertion reads the inspector header and the rendered DOM, not the
 * control's own claims. Writes named PNGs + manifest.json for the report
 * builder, and hero frames for the clip.
 *
 * Usage: node demos/capture-members-control.mjs <url> <outDir>
 *   e.g. node demos/capture-members-control.mjs http://localhost:4110/create reports/media/members-control-2026-09-11
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , url, outDirArg] = process.argv;
if (!url || !outDirArg) {
  console.error("usage: node demos/capture-members-control.mjs <url> <outDir>");
  process.exit(2);
}
const outDir = path.resolve(outDirArg);
mkdirSync(path.join(outDir, "hero"), { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-members-"));
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
async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
  })()`);
}
async function mouse(type, x, y, extra = {}) {
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
}
/** A REAL click: pointerdown/up at the element's centre, the way a person does it. */
async function realClick(selector) {
  const r = await rectOf(selector);
  await mouse("mouseMoved", r.x, r.y);
  await mouse("mousePressed", r.x, r.y);
  await sleep(30);
  await mouse("mouseReleased", r.x, r.y);
  await sleep(150);
}
async function click(selector) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("not found: " + ${JSON.stringify(selector)}); el.click(); })()`);
  await sleep(120);
}
async function drag(from, to, steps = 14) {
  await mouse("mouseMoved", from.x, from.y);
  await mouse("mousePressed", from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(25);
  }
  await mouse("mouseReleased", to.x, to.y);
  await sleep(250);
}
async function setSelect(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("not found: " + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await sleep(200);
}
async function key(keyName, code) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode: keyName === "ArrowRight" ? 39 : 37 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode: keyName === "ArrowRight" ? 39 : 37 });
  await sleep(150);
}
async function screenshot(name, clip) {
  const params = { format: "png" };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.w, height: clip.h, scale: 1 };
  const { data } = await send("Page.captureScreenshot", params);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}
let heroFrame = 0;
async function hero() {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, "hero", `${String(heroFrame++).padStart(3, "0")}.png`), Buffer.from(data, "base64"));
}
let lastFailure = null;
function assert(cond, msg) {
  if (!cond) {
    lastFailure = msg;
    throw new Error("ASSERT: " + msg);
  }
}
process.on("uncaughtException", async (err) => {
  // On any failure leave the evidence behind: the page as it was, and the
  // inspector's DOM, so the fix is reasoned from the artifact and not guessed.
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(outDir, "FAILED.png"), Buffer.from(data, "base64"));
    const html = await evaluate(`document.querySelector('[data-slot="inspector-column"]')?.outerHTML ?? "(no inspector)"`);
    writeFileSync(path.join(outDir, "FAILED-inspector.html"), html);
    const side = await evaluate(`document.querySelector('[data-slot="bench-sidebar"]')?.innerText ?? "(no sidebar)"`);
    writeFileSync(path.join(outDir, "FAILED-sidebar.txt"), side);
  } catch {}
  console.error(err);
  chrome.kill();
  process.exit(1);
});

// --- page state readers: the oracle is the DOM the page paints, never the control's own state.
const inspectorName = () => evaluate(`document.querySelector('[data-slot="figma-dense-header"] span')?.textContent ?? null`);
const memberIdsInControl = () =>
  evaluate(`Array.from(document.querySelectorAll('[data-slot="members-control"] [data-member-id]')).map(e => e.getAttribute('data-member-id')).filter((v, i, a) => a.indexOf(v) === i)`);
const renderedMemberIds = (root) =>
  evaluate(`Array.from(document.querySelectorAll('${root} [data-slot="member-instance"]')).map(e => e.getAttribute('data-instance-id'))`);
const pathCrumbs = () => evaluate(`Array.from(document.querySelectorAll('[data-slot="members-path-crumb"]')).map(e => e.textContent.trim())`);
const selectedInstanceIds = () =>
  evaluate(`Array.from(document.querySelectorAll('[data-slot="subject-checkbox"]:checked')).map(e => e.closest('[data-subject-id]').getAttribute('data-subject-id'))`);
const controlHeight = () => evaluate(`document.querySelector('[data-slot="members-control"]')?.getBoundingClientRect().height ?? 0`);

async function load(theme) {
  await send("Page.navigate", { url });
  await waitFor('[data-slot="create-workbench"]');
  await evaluate(`(() => { localStorage.clear(); localStorage.setItem("theme", ${JSON.stringify(theme)}); })()`);
  await send("Page.navigate", { url });
  await waitFor('[data-slot="component-picker"]');
  await sleep(600);
  const isDark = await evaluate(`document.documentElement.classList.contains("dark")`);
  assert(isDark === (theme === "dark"), `theme ${theme} applied`);
  await setSelect('[data-slot="component-picker"]', "Stack");
  await waitFor('[data-slot="members-section"]');
  await sleep(200);
}

/** How each control adds a member of `type`. */
async function addVia(control, type) {
  switch (control) {
    case "list":
    case "outline":
      await click('[data-slot="members-control"] [data-slot="add-member-trigger"]');
      await click(`[data-slot="members-control"] [data-slot="add-member-type"][data-type="${type}"]`);
      break;
    case "chips": {
      const direct = await evaluate(`!!document.querySelector('[data-slot="members-control"] [data-slot="add-member-type"][data-type="${type}"]')`);
      if (!direct) await click('[data-slot="members-control"] [data-slot="add-member-trigger"]');
      await click(`[data-slot="members-control"] [data-slot="add-member-type"][data-type="${type}"]`);
      break;
    }
    case "grouped":
      await click(`[data-slot="members-control"] [data-slot="add-member-type"][data-type="${type}"]`);
      break;
    case "stepper":
      await setSelect('[data-slot="members-control"] [data-slot="add-member-kind"]', type);
      await click('[data-slot="members-control"] [data-slot="member-plus"]');
      break;
  }
  await sleep(250);
}
async function backToParent() {
  await click('[data-slot="members-path-crumb"]');
  await waitFor('[data-slot="members-section"]');
  await sleep(150);
}
/** Move the FIRST member one step down, in whatever way the control offers. */
async function reorderFirstDown(control, ids) {
  switch (control) {
    case "list": {
      const from = await rectOf(`[data-slot="member-row"][data-member-id="${ids[0]}"] [data-slot="member-grip"]`);
      const to = await rectOf(`[data-slot="member-row"][data-member-id="${ids[1]}"] [data-slot="member-grip"]`);
      await drag(from, { x: to.x, y: to.y + 8 });
      break;
    }
    case "chips": {
      const from = await rectOf(`[data-slot="member-chip"][data-member-id="${ids[0]}"] [data-slot="member-select"]`);
      const to = await rectOf(`[data-slot="member-chip"][data-member-id="${ids[1]}"] [data-slot="member-select"]`);
      await drag(from, { x: to.x + to.w / 2 + 6, y: to.y });
      break;
    }
    case "outline":
    case "grouped":
      await click(`[data-slot="member-row"][data-member-id="${ids[0]}"] [data-slot="member-down"]`);
      break;
    case "stepper":
      await evaluate(`document.querySelector('[data-slot="member-select"][data-member-id="${ids[0]}"]').focus()`);
      await key("ArrowRight", "ArrowRight");
      break;
  }
  await sleep(300);
}
async function removeOne(control, id) {
  if (control === "stepper") await click('[data-slot="members-control"] [data-slot="member-minus"]');
  else await click(`[data-slot="members-control"] [data-member-id="${id}"] [data-slot="member-remove"]`);
  await sleep(250);
}

// Only List remains (Zach's pick, 2026-09-11); the per-control branches
// below are the record of how the other four were driven at 9d365e2.
const CONTROLS = ["list"];
const THEMES = ["dark", "light"];
const manifest = [];
const inspectorClip = async () => {
  const r = await rectOf('[data-slot="inspector-column"]');
  return { left: Math.floor(r.left), top: Math.floor(r.top), w: Math.ceil(r.w), h: Math.ceil(r.h) };
};

for (const theme of THEMES) {
  for (const control of CONTROLS) {
    console.log(`— ${theme} · ${control}`);
    await load(theme);
    const label = "List";
    assert((await evaluate(`document.querySelector('[data-slot="members-control"]')?.getAttribute('data-members-control')`)) === control, `${control} mounted`);
    assert((await inspectorName()) === "Stack", "starts on the Stack");
    const isHero = theme === "dark" && control === "list";

    // 1 · empty
    const clip = await inspectorClip();
    const empty = await screenshot(`${theme}-${control}-1-empty`, clip);
    if (isHero) await hero();

    // 2 · add a Port: typed add, and the inspector jumps to the child
    await addVia(control, "Port");
    assert((await inspectorName()) === "Port", `${control}: after Add the inspector shows the new Port`);
    const crumbs = await pathCrumbs();
    assert(crumbs.length === 1 && /Stack/.test(crumbs[0]), `${control}: path says it is inside the Stack (${crumbs.join(">")})`);
    const child = await screenshot(`${theme}-${control}-2-child`, clip);
    if (isHero) {
      await hero();
      await hero();
    }

    // 3 · back to the parent, add two more (a Pill and a Block)
    await backToParent();
    assert((await inspectorName()) === "Stack", `${control}: the crumb climbs back to the Stack`);
    if (isHero) await hero();
    await addVia(control, "Pill");
    await backToParent();
    await addVia(control, "Port");
    await backToParent();
    let ids = await memberIdsInControl();
    assert(ids.length === 3, `${control}: three members listed (${ids.length})`);
    const rendered = await renderedMemberIds('[data-slot="dom-preview"]');
    // Grouped lists by kind, so only the SET must agree there; every other
    // control lists in bench order, which is also the render order.
    if (control === "grouped") assert([...rendered].sort().join() === [...ids].sort().join(), `${control}: DOM render nests the same three`);
    else assert(rendered.join() === ids.join(), `${control}: DOM render nests the same three in the same order`);
    const height = await controlHeight();
    const filled = await screenshot(`${theme}-${control}-3-three`, clip);
    const page = await screenshot(`${theme}-${control}-3-page`);
    if (isHero) {
      await hero();
      await hero();
    }

    // 4 · click a member row → the inspector shows that member (its type is
    // read off the row, so the assertion does not assume a listing order)
    const rowType = await evaluate(`document.querySelector('[data-slot="members-control"] [data-member-id="${ids[1]}"]').getAttribute('data-member-type')`);
    // Stepper's square IS the select button; every other control nests it.
    await click(`[data-slot="members-control"] [data-member-id="${ids[1]}"][data-slot="member-select"], [data-slot="members-control"] [data-member-id="${ids[1]}"] [data-slot="member-select"]`);
    await sleep(200);
    assert((await inspectorName()) === rowType, `${control}: clicking a ${rowType}'s row shows the ${rowType}`);
    const clicked = await screenshot(`${theme}-${control}-4-row-click`, clip);
    if (isHero) {
      await hero();
      await hero();
    }
    await backToParent();

    // 5 · reorder: the first member moves down one, and the render follows
    await reorderFirstDown(control, ids);
    const after = await memberIdsInControl();
    assert(after[1] === ids[0] && after[0] === ids[1], `${control}: first member moved down (${ids.join()} → ${after.join()})`);
    const dom = await renderedMemberIds('[data-slot="dom-preview"]');
    assert(dom.indexOf(ids[1]) < dom.indexOf(ids[0]), `${control}: DOM render shows the swapped pair swapped (${dom.join()})`);
    if (control !== "grouped") assert(dom.join() === after.join(), `${control}: DOM render order matches the list`);
    const reordered = await screenshot(`${theme}-${control}-5-reordered`, clip);
    if (isHero) {
      await hero();
      await hero();
    }
    ids = after;

    // 6 · remove one
    await removeOne(control, ids[2]);
    const left = await memberIdsInControl();
    assert(left.length === 2, `${control}: remove leaves two (${left.length})`);
    assert((await inspectorName()) === "Stack", `${control}: still on the Stack after a remove`);
    const removed = await screenshot(`${theme}-${control}-6-removed`, clip);
    if (isHero) await hero();

    manifest.push({ theme, control, label, height: Math.round(height), files: { empty, child, filled, page, clicked, reordered, removed } });
  }

  // --- member click on each RENDER: DOM, React Flow, tldraw (List control, once per theme)
  await load(theme);
  await addVia("list", "Port");
  await backToParent();
  await addVia("list", "Pill");
  await backToParent();
  const ids = await memberIdsInControl();
  const renderProof = {};
  for (const [render, root] of [["dom", '[data-slot="dom-preview"]'], ["reactflow", '[data-slot="reactflow-canvas"]'], ["tldraw", '[data-slot="tldraw-canvas"]']]) {
    await click(`[data-slot="render-tab"][data-render="${render}"]`);
    await waitFor(`${root} [data-slot="member-instance"][data-instance-id="${ids[1]}"]`, 30000);
    await sleep(render === "dom" ? 200 : 900);
    // Select the parent first so the click is the thing that changes it.
    await click(`[data-subject-id] [data-slot="subject-checkbox"]`);
    await sleep(100);
    await evaluate(`(() => { const boxes = document.querySelectorAll('[data-slot="subject-checkbox"]'); if (!boxes[0].checked) boxes[0].click(); Array.from(boxes).slice(1).forEach(b => { if (b.checked) b.click(); }); })()`);
    await sleep(200);
    assert((await inspectorName()) === "Stack", `${render}: starts on the Stack`);
    await realClick(`${root} [data-slot="member-instance"][data-instance-id="${ids[1]}"] > *`);
    await sleep(300);
    const name = await inspectorName();
    assert(name === "Pill", `${render}: clicking the Pill inside the Stack on the ${render} render shows the Pill (got ${name})`);
    const sel = await selectedInstanceIds();
    assert(sel.length === 1 && sel[0] === ids[1], `${render}: exactly the Pill is selected`);
    renderProof[render] = await screenshot(`${theme}-render-${render}-member-click`);
    if (theme === "dark") await hero();
  }
  manifest.push({ theme, control: "renders", files: renderProof });
}

// --- Code view prints members nested
await load("dark");
await addVia("list", "Port");
await backToParent();
await click('[data-slot="view-tab"][data-view="code"]');
await sleep(300);
const code = await evaluate(`document.querySelector('[data-slot="code-text"]').textContent`);
assert(/<Stack[^>]*>\n\s+<Port[^\n]*\n<\/Stack>/.test(code), `code view nests the Port inside the Stack:\n${code}`);
const codeShot = await screenshot("dark-code-nested");
manifest.push({ theme: "dark", control: "code", files: { code: codeShot }, code });

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* a straggling helper may hold the profile */
}
console.log(`PASS — ${manifest.length} entries, ${heroFrame} hero frames → ${outDir}`);
