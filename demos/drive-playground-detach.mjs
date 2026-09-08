#!/usr/bin/env node
/**
 * Drive detach-to-primitives in the real playground over raw CDP — the
 * round-trip proof, against the live app rather than a stub:
 *
 *   1. seed one Block (icon, chip, description, type, two ports) and one
 *      standalone wired Port;
 *   2. right-click the selection and pick "Detach … to primitives" from the
 *      real context menu (the UI seam, not a direct function call);
 *   3. assert the page holds ONLY stock tldraw shape types, that the Block
 *      became a group with one nested group per port (dot + label move as
 *      one unit — Zach's unpeel-from-the-top-down), and that the groups
 *      remember their records in meta;
 *   4. screenshot before/after at the same camera for visual comparison;
 *   5. right-click again, pick "Rebuild … Blocks/Ports", and assert the
 *      restored shapes' props deep-equal the originals — a detach you
 *      cannot undo is a one-way door.
 *
 * Usage: node demos/drive-playground-detach.mjs [url]  (default http://127.0.0.1:5193)
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
// A Block exercising every anatomy part, plus a standalone wired Port.
const original = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.run(() => {
    editor.deleteShapes(editor.getCurrentPageShapes().map((s) => s.id));
  });
  editor.createShape({
    id: "shape:detach_block",
    type: "bbox-block",
    x: 160,
    y: 140,
    props: {
      w: 384, h: 258,
      title: "Detect", titleSize: "xl",
      blockType: "dataflow", description: "blackbox modelling",
      icon: "🔍", tag: "Draft 1", orientation: "horizontal",
      ports: [
        { id: "image", direction: "input", state: "wired", size: "md",
          label: "image", textLayout: "right", side: "left", t: 0.35 },
        { id: "boxes", direction: "output", state: "empty", size: "md",
          label: "boxes", textLayout: "left", side: "right", t: 0.5 },
      ],
    },
  });
  editor.createShape({
    id: "shape:detach_port",
    type: "bbox-port",
    x: 700, y: 210,
    props: { w: 25, h: 25, state: "wired", size: "md", label: "tick", textLayout: "right" },
  });
  editor.setCamera({ x: 120, y: 120, z: 1 });
  const snap = (id) => {
    const s = editor.getShape(id);
    return { type: s.type, x: s.x, y: s.y, props: s.props };
  };
  return { block: snap("shape:detach_block"), port: snap("shape:detach_port") };
})()`);
assert(original.block.type === "bbox-block", "fixture Block created");
assert(original.port.type === "bbox-port", "fixture Port created");
const beforeShot = await screenshot("playground-detach-before.png");

// ----------------------------------------------------------------- detach --
// Select both, then go through the real right-click surface.
await evaluate(`(() => {
  const editor = window.playgroundEditor;
  editor.setCurrentTool("select");
  editor.setSelectedShapes(["shape:detach_block", "shape:detach_port"]);
  return editor.getSelectedShapeIds().length;
})()`);

// Right-click inside the Block (page 300,250 → screen via camera z=1, cam 120,120).
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
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.textContent.trim() };
})()`);
assert(detachItem !== null, "context menu offers Detach");
if (detachItem) {
  assert(
    detachItem.text.includes("2"),
    `menu names both shapes (got "${detachItem.text}")`,
  );
  await click(detachItem.x, detachItem.y);
}

// -------------------------------------------------- stock-only assertions --
const detached = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const shapes = editor.getCurrentPageShapes();
  const types = [...new Set(shapes.map((s) => s.type))].sort();
  const record = (s) => (s.meta && s.meta.bboxUi) || null;
  const groups = shapes.filter((s) => s.type === "group");
  const blockGroup = groups.find((s) => record(s)?.kind === "block") ?? null;
  const portGroup = groups.find((s) => record(s)?.kind === "port") ?? null;
  const describe = (id) => {
    const children = editor.getSortedChildIdsForParent(id).map((childId) => {
      const child = editor.getShape(childId);
      return {
        type: child.type,
        anchor: record(child)?.kind ?? null,
        children: child.type === "group"
          ? editor.getSortedChildIdsForParent(childId).map(
              (grandId) => editor.getShape(grandId).type,
            )
          : [],
      };
    });
    return children;
  };
  return {
    types,
    bboxCount: shapes.filter((s) => s.type.startsWith("bbox-")).length,
    blockGroup: blockGroup && {
      version: record(blockGroup).version,
      children: describe(blockGroup.id),
    },
    portGroup: portGroup && {
      version: record(portGroup).version,
      children: describe(portGroup.id),
    },
    selection: editor.getSelectedShapeIds().length,
  };
})()`);

assert(detached.bboxCount === 0, "no bbox-* shapes remain after detach");
assert(
  detached.types.every((t) => ["geo", "text", "group"].includes(t)),
  `only stock types on the page (got ${JSON.stringify(detached.types)})`,
);
assert(detached.blockGroup !== null, "Block became a group remembering kind: block");
assert(detached.portGroup !== null, "Port became a group remembering kind: port");
if (detached.blockGroup) {
  const nested = detached.blockGroup.children.filter((c) => c.type === "group");
  assert(
    nested.length === 2,
    `Block group nests one group per port (got ${nested.length})`,
  );
  for (const row of nested) {
    assert(
      row.children.includes("geo") && row.children.includes("text"),
      `port row group holds dot + label (got ${JSON.stringify(row.children)})`,
    );
  }
  assert(
    detached.blockGroup.children.some((c) => c.anchor === "block-card"),
    "the card is marked as the rebuild anchor",
  );
}
if (detached.portGroup) {
  const types = detached.portGroup.children.map((c) => c.type).sort();
  assert(
    JSON.stringify(types) === JSON.stringify(["geo", "geo", "text"]),
    `standalone Port group = ring + accent core + label (got ${JSON.stringify(types)})`,
  );
}
assert(detached.selection === 2, "the replacements are selected");
const afterShot = await screenshot("playground-detach-after.png");

// ---------------------------------------------------------------- rebuild --
await click(blockScreen.x, blockScreen.y, "right");
const rebuildItem = await evaluate(`(() => {
  const item = [...document.querySelectorAll('[data-testid="context-menu"] .tlui-button, .tlui-menu button')]
    .find((el) => el.textContent.includes("Rebuild"));
  if (!item) return null;
  const r = item.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: item.textContent.trim() };
})()`);
assert(rebuildItem !== null, "context menu offers Rebuild on the detached groups");
if (rebuildItem) await click(rebuildItem.x, rebuildItem.y);

const rebuilt = await evaluate(`(() => {
  const editor = window.playgroundEditor;
  const shapes = editor.getCurrentPageShapes();
  const block = shapes.find((s) => s.type === "bbox-block") ?? null;
  const port = shapes.find((s) => s.type === "bbox-port") ?? null;
  return {
    count: shapes.length,
    block: block && { type: block.type, x: block.x, y: block.y, props: block.props },
    port: port && { type: port.type, x: port.x, y: port.y, props: port.props },
  };
})()`);
assert(rebuilt.count === 2, `rebuild leaves exactly the two shapes (got ${rebuilt.count})`);
assert(
  JSON.stringify(rebuilt.block?.props) === JSON.stringify(original.block.props),
  "rebuilt Block props deep-equal the original",
);
assert(
  JSON.stringify(rebuilt.port?.props) === JSON.stringify(original.port.props),
  "rebuilt Port props deep-equal the original",
);
assert(
  rebuilt.block?.x === original.block.x && rebuilt.block?.y === original.block.y,
  "rebuilt Block stands where the original stood",
);
assert(
  rebuilt.port?.x === original.port.x && rebuilt.port?.y === original.port.y,
  "rebuilt Port stands where the original stood",
);
const rebuiltShot = await screenshot("playground-detach-rebuilt.png");

const journeyErrors = consoleErrors.filter(
  (line) => !line.includes("License") && !line.includes("watermark"),
);
assert(journeyErrors.length === 0, `no console errors (${JSON.stringify(journeyErrors.slice(0, 3))})`);

console.log(`\nscreenshots: ${beforeShot}\n             ${afterShot}\n             ${rebuiltShot}`);

chrome.kill();
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall detach round-trip assertions passed");
