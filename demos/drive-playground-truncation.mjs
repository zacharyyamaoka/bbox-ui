#!/usr/bin/env node
/**
 * The truncation oracle: prove the detached title's ellipsis against the
 * BROWSER's own rendering, not against the formula that produced it.
 *
 * WHY this journey exists: the unit tests measure text with the same
 * deterministic fallback the truncation itself uses, so they cannot
 * disagree by construction. Here the ruler is independent — a live Block
 * rendered by the real playground, its title slot measured off the DOM, and
 * a DOM probe (same computed font, nowrap) that re-derives where the
 * ellipsis boundary belongs. The journey then detaches through the real
 * context menu and compares the emitted stock text — its string AND its
 * rendered box — against what the browser measured.
 *
 *   1. seed a Block whose title carries a ZWJ emoji family and outgrows the
 *      chip-constrained slot; read the live title's box and computed font;
 *   2. with a DOM probe, find the longest grapheme prefix whose "prefix…"
 *      the browser renders within the slot — the oracle boundary;
 *   3. detach via the context menu; find the emitted title text shape;
 *   4. assert the emitted string is a clean grapheme cut at the oracle
 *      boundary (±1 grapheme of measurement slack, never a dangling ZWJ),
 *      fits the slot per the browser, and its rendered box stands where the
 *      live title stood — and REPORT every measured number.
 *
 * Usage: node demos/drive-playground-truncation.mjs [url]  (default http://127.0.0.1:5193)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://127.0.0.1:5193";

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

async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression: `JSON.stringify((() => (${expression}))() ?? null)`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return JSON.parse(result.value);
}

async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(`!!(${expression})`)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function click(x, y, button = "left") {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button, buttons: button === "left" ? 1 : 2, clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1,
  });
  await new Promise((r) => setTimeout(r, 350));
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const shotPath = path.join(shotDir, name);
  writeFileSync(shotPath, Buffer.from(data, "base64"));
  return shotPath;
}

const failures = [];
function assert(condition, label) {
  if (condition) {
    console.log(`  ok: ${label}`);
  } else {
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

await send("Page.navigate", { url });
await waitFor(
  `document.querySelector('.tl-container') && window.playgroundEditor`,
  "playground editor",
);
await new Promise((r) => setTimeout(r, 1200));

// ---------------------------------------------------------------- fixture --
// The judge's reproducer: a ZWJ emoji family early in a title that outgrows
// the chip-constrained slot.
const TITLE = "A👩‍❤️‍💋‍👩 followed by a long title";
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.run(() => {
    editor.deleteShapes(editor.getCurrentPageShapes().map((s) => s.id));
  });
  editor.createShape({
    id: "shape:trunc_block",
    type: "bbox-block",
    x: 160,
    y: 140,
    props: {
      w: 384, h: 258,
      title: ${JSON.stringify(TITLE)}, titleSize: "xl",
      blockType: "dataflow", description: "blackbox modelling",
      icon: "", tag: "Draft 1", orientation: "horizontal",
      ports: [],
    },
  });
  editor.setCamera({ x: 120, y: 120, z: 1 });
  return editor.getShape("shape:trunc_block").props.title;
})()`);
await new Promise((r) => setTimeout(r, 600));

// The live title, measured off the real DOM — box, font, overflow.
const live = await evaluate(`(() => {
  const el = document.querySelector('[data-block-id="shape:trunc_block"] [data-slot=block-title]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    font: style.font,
    text: el.textContent,
  };
})()`);
assert(live !== null, "live title element found");
assert(live.text === TITLE, "live DOM keeps the complete authored title");
assert(
  live.scrollWidth > live.clientWidth,
  `live title actually overflows its slot (scroll ${live?.scrollWidth} > client ${live?.clientWidth})`,
);
const beforeShot = await screenshot("playground-truncation-live.png");

// -------------------------------------------------------- browser oracle --
// A DOM probe with the live title's computed font re-derives, by rendering,
// the longest grapheme prefix whose "prefix…" fits the slot. This is the
// independent ruler: no canvas measureText, no 0.55 fallback ratio.
const oracle = await evaluate(`(() => {
  const el = document.querySelector('[data-block-id="shape:trunc_block"] [data-slot=block-title]');
  const slotW = el.clientWidth;
  const probe = document.createElement("span");
  probe.style.font = getComputedStyle(el).font;
  probe.style.whiteSpace = "nowrap";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const width = (text) => {
    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  };
  const title = ${JSON.stringify(TITLE)};
  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(title),
    (part) => part.segment,
  );
  let prefix = "";
  let boundary = "";
  for (const grapheme of graphemes) {
    const candidate = prefix + grapheme;
    if (width(candidate + "…") > slotW) break;
    prefix = candidate;
  }
  boundary = prefix + "…";
  const result = {
    slotW,
    graphemes,
    expected: boundary,
    expectedW: width(boundary),
  };
  probe.remove();
  return result;
})()`);

// ----------------------------------------------------------------- detach --
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.setCurrentTool("select");
  editor.setSelectedShapes(["shape:trunc_block"]);
  return editor.getSelectedShapeIds().length;
})()`);
const blockScreen = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const p = editor.pageToViewport({ x: 300, y: 250 });
  return { x: p.x, y: p.y };
})()`);
await click(blockScreen.x, blockScreen.y, "right");
const detachItem = await evaluate(`(() => {
  const item = [...document.querySelectorAll('[data-testid="context-menu"] .tlui-button, .tlui-menu button')]
    .find((el) => el.textContent.includes("Detach"));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
assert(detachItem !== null, "context menu offers Detach");
if (detachItem) await click(detachItem.x, detachItem.y);

// The emitted title: the text shape whose content ends with the ellipsis.
const emitted = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const collectText = (node) => {
    if (typeof node !== "object" || node === null) return "";
    const own = typeof node.text === "string" ? node.text : "";
    const children = Array.isArray(node.content)
      ? node.content.map(collectText).join("")
      : "";
    return own + children;
  };
  const texts = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === "text")
    .map((s) => ({ id: s.id, text: collectText(s.props.richText) }));
  const title = texts.find((t) => t.text.endsWith("…"));
  if (!title) return { texts: texts.map((t) => t.text) };
  const bounds = editor.getShapePageBounds(title.id);
  const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
  const bottomRight = editor.pageToViewport({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
  return {
    text: title.text,
    box: {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    },
  };
})()`);
assert(typeof emitted.text === "string", `an ellipsized title text shape exists (${JSON.stringify(emitted.texts ?? emitted.text)})`);
const afterShot = await screenshot("playground-truncation-detached.png");

// ------------------------------------------------------------ the verdict --
if (typeof emitted.text === "string") {
  const emittedPrefix = emitted.text.slice(0, -1);
  // Clean grapheme cut, judged by the browser's own segmenter.
  const clean = await evaluate(`(() => {
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(${JSON.stringify(TITLE)}),
      (part) => part.segment,
    );
    let assembled = "";
    const prefix = ${JSON.stringify(emitted.text)}.slice(0, -1);
    if (prefix === "") return true;
    for (const grapheme of graphemes) {
      assembled += grapheme;
      if (assembled === prefix) return true;
      if (assembled.length > prefix.length) return false;
    }
    return false;
  })()`);
  assert(clean, "emitted prefix is a whole-grapheme cut of the title");
  assert(!emittedPrefix.endsWith("‍"), "no dangling ZWJ before the ellipsis");

  // The browser probe re-measures the emitted string and its extension by
  // one more grapheme — the boundary the DOM establishes.
  const probeCheck = await evaluate(`(() => {
    const el = document.createElement("span");
    el.style.font = ${JSON.stringify(live.font)};
    el.style.whiteSpace = "nowrap";
    el.style.position = "fixed";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const width = (text) => {
      el.textContent = text;
      return el.getBoundingClientRect().width;
    };
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(${JSON.stringify(TITLE)}),
      (part) => part.segment,
    );
    const prefix = ${JSON.stringify(emittedPrefix)};
    let count = 0;
    let assembled = "";
    for (const grapheme of graphemes) {
      if (assembled.length >= prefix.length) break;
      assembled += grapheme;
      count += 1;
    }
    const oneMore = graphemes.slice(0, count + 1).join("");
    const result = {
      emittedW: width(prefix + "…"),
      oneMoreW: width(oneMore + "…"),
      graphemeCount: count,
      totalGraphemes: graphemes.length,
    };
    el.remove();
    return result;
  })()`);

  const slack = 1.5; // sub-pixel disagreement between canvas metrics and DOM rects
  assert(
    probeCheck.emittedW <= oracle.slotW + slack,
    `emitted "…" string fits the ${oracle.slotW}px slot per the DOM (${probeCheck.emittedW.toFixed(1)}px)`,
  );
  assert(
    probeCheck.graphemeCount >= oracle.graphemes.length ||
      probeCheck.oneMoreW > oracle.slotW - slack,
    `one more grapheme would overflow the slot (${probeCheck.oneMoreW.toFixed(1)}px vs ${oracle.slotW}px)`,
  );
  // Grapheme-count distance between the emitted boundary and the oracle's
  // boundary — canvas metrics and DOM rects can disagree by sub-pixels, so
  // one grapheme of slack is honest; more is a real divergence.
  const oraclePrefix = oracle.expected.slice(0, -1);
  let oracleCount = 0;
  {
    let assembled = "";
    for (const grapheme of oracle.graphemes) {
      if (assembled.length >= oraclePrefix.length) break;
      assembled += grapheme;
      oracleCount += 1;
    }
  }
  assert(
    Math.abs(probeCheck.graphemeCount - oracleCount) <= 1,
    `emitted boundary within one grapheme of the DOM oracle (emitted ${probeCheck.graphemeCount}, oracle ${oracleCount} graphemes; emitted ${JSON.stringify(emitted.text)}, oracle ${JSON.stringify(oracle.expected)})`,
  );

  // The rendered box: the detached title must stand where the live title
  // stood (textAt widens the box by up to 8px of wrap slack, centered).
  const liveCenterX = live.rect.x + live.rect.w / 2;
  const emittedCenterX = emitted.box.x + emitted.box.w / 2;
  const liveCenterY = live.rect.y + live.rect.h / 2;
  const emittedCenterY = emitted.box.y + emitted.box.h / 2;
  assert(
    Math.abs(emittedCenterX - liveCenterX) <= 8,
    `detached title box centers where the live title did (Δx ${(emittedCenterX - liveCenterX).toFixed(1)}px)`,
  );
  assert(
    Math.abs(emittedCenterY - liveCenterY) <= 8,
    `detached title box rides the live line box (Δy ${(emittedCenterY - liveCenterY).toFixed(1)}px)`,
  );
  assert(
    emitted.box.w <= live.rect.w + 16,
    `detached title box never outgrows the slot (${emitted.box.w.toFixed(1)}px vs slot ${live.rect.w.toFixed(1)}px + slack)`,
  );

  console.log("\nmeasured live vs detached title:");
  console.log(`  title slot (live clientWidth):   ${oracle.slotW}px`);
  console.log(`  live full-title scrollWidth:     ${live.scrollWidth}px`);
  console.log(`  live title rect:                 x ${live.rect.x.toFixed(1)}, y ${live.rect.y.toFixed(1)}, w ${live.rect.w.toFixed(1)}, h ${live.rect.h.toFixed(1)}`);
  console.log(`  detached title box (viewport):   x ${emitted.box.x.toFixed(1)}, y ${emitted.box.y.toFixed(1)}, w ${emitted.box.w.toFixed(1)}, h ${emitted.box.h.toFixed(1)}`);
  console.log(`  emitted string:                  ${JSON.stringify(emitted.text)}`);
  console.log(`  DOM-oracle string:               ${JSON.stringify(oracle.expected)}`);
  console.log(`  emitted+… DOM width:             ${probeCheck.emittedW.toFixed(1)}px`);
  console.log(`  one-more-grapheme DOM width:     ${probeCheck.oneMoreW.toFixed(1)}px`);
  console.log(`  graphemes kept:                  ${probeCheck.graphemeCount} of ${probeCheck.totalGraphemes}`);
}

const journeyErrors = consoleErrors.filter(
  (line) => !line.includes("License") && !line.includes("watermark"),
);
assert(journeyErrors.length === 0, `no console errors (${JSON.stringify(journeyErrors.slice(0, 3))})`);

console.log(`\nscreenshots: ${beforeShot}\n             ${afterShot}`);

chrome.kill();
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall truncation-oracle assertions passed");
