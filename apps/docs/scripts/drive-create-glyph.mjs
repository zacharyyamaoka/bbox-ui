#!/usr/bin/env node
/**
 * apps/docs/scripts/drive-create-glyph.mjs
 *
 * The committed CDP journey for docs/GLYPH-PLAN.md phase 5 — /create routes
 * a Glyph instance through its real adapters in every render. Raw CDP,
 * headless Chrome, real `Input.dispatchMouseEvent` gestures; the caller
 * starts the dev server (this script starts nothing of its own but Chrome).
 *
 * Each step is independent: a failure records FAIL and the script keeps
 * going, so one broken render never hides what the other two prove. Exits 1
 * on any failure.
 *
 * Usage: node scripts/drive-create-glyph.mjs <baseUrl>   (required — this repo
 * runs several dev servers on adjacent ports, so a hardcoded default here
 * has already driven a wholly unrelated app on this box once; see
 * docs/GLYPH-PLAN.md phase 5's proof requirement.)
 */
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("usage: node scripts/drive-create-glyph.mjs <baseUrl>");
  process.exit(1);
}
const url = `${baseUrl.replace(/\/$/, "")}/create`;

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "..", "..", "..", ".scratch", "create-glyph");
mkdirSync(shotDir, { recursive: true });
// Optional capture mode for the review report: BBOX_CAPTURE_DIR=<dir> makes
// the run also record a screencast of the tldraw flow (frame-NNNN.jpg, one
// file per frame, ffmpeg turns them into the hero video) and light-theme
// stills at the end. Assertions are unchanged; the journey stays the oracle.
const captureDir = process.env.BBOX_CAPTURE_DIR ?? null;
if (captureDir) mkdirSync(captureDir, { recursive: true });
let frameIndex = 0;
let casting = false;

const profile = mkdtempSync(path.join(tmpdir(), "bbox-glyph-chrome-"));
let chrome;
const results = [];
const consoleErrors = [];

// WHY the entire drive (spawn through the last step) is one try/finally:
// chrome.kill() and the profile cleanup used to sit as plain statements at
// the bottom of the module, reached only if every await above ran without
// throwing. The FIRST page-load wait, and every helper called BETWEEN
// step()s rather than inside one, is not covered by step()'s own try/catch
// — a dead or wrong dev server threw straight past that cleanup and left a
// headless Chrome plus its tmp profile running (measured: 27 leaked
// processes and 4 leaked /tmp/bbox-glyph-chrome-* dirs across two bad runs).
try {
  chrome = spawn(
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
  let sessionId = null;

  browser.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === "Page.screencastFrame" && captureDir) {
      if (casting) {
        frameIndex += 1;
        writeFileSync(path.join(captureDir, `frame-${String(frameIndex).padStart(4, "0")}.jpg`), Buffer.from(message.params.data, "base64"));
      }
      send("Page.screencastFrameAck", { sessionId: message.params.sessionId }).catch(() => {});
    }
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
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
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
    return JSON.parse(result.value);
  }

  async function waitFor(expression, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(`!!(${expression})`)) return;
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out waiting for ${label}${lastErr ? ` (${lastErr.message})` : ""}`);
  }

  async function rectOf(selector) {
    const rect = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })()`);
    return rect;
  }

  async function centerOf(selector) {
    const rect = await rectOf(selector);
    if (!rect) throw new Error(`element not found: ${selector}`);
    return { x: rect.cx, y: rect.cy };
  }

  async function click(x, y, button = "left") {
    const buttons = button === "right" ? 2 : 1;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 300));
  }

  /** A real press-drag-release, interpolated — the same gesture the repo's
   *  other journeys use, because tldraw/React Flow's own drag threshold and
   *  pointer capture only engage on genuine intermediate movement. */
  async function drag(from, to) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 10; step += 1) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: from.x + ((to.x - from.x) * step) / 10,
        y: from.y + ((to.y - from.y) * step) / 10,
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 25));
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0 });
    await new Promise((r) => setTimeout(r, 300));
  }

  async function typeText(text) {
    for (const character of text) {
      await send("Input.insertText", { text: character });
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  /** Replace whatever a number box holds with `text` and commit it —
   *  `NumberInput` (@bbox-ui/panel) commits on every keystroke that parses,
   *  reading `event.target.value`, so the real, standard way to drive a
   *  React-controlled input from outside the DOM's own key-code semantics is
   *  the native value setter + a real bubbling "input" event, not simulated
   *  keystrokes: Chrome headless's raw `Input.dispatchKeyEvent` for Home/
   *  End/Backspace does not reliably move the caret or select inside a
   *  native `type="number"` box (measured: typing "45" after a Home/
   *  Shift+End/Backspace "clear" left the box reading "31445", the prior
   *  value with "45" appended, not replaced) — the value setter has no such
   *  ambiguity and still exercises the production onChange path. Focusing
   *  first (a real click) keeps this an interaction on the actual control,
   *  not a change to a detached node. */
  async function retypeNumber(selector, text) {
    const c = await centerOf(selector);
    await click(c.x, c.y);
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 200));
  }

  async function screenshot(name) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const shotPath = path.join(shotDir, name);
    writeFileSync(shotPath, Buffer.from(data, "base64"));
    return shotPath;
  }

  async function startCast() {
    if (!captureDir || casting) return;
    casting = true;
    await send("Page.startScreencast", { format: "jpeg", quality: 72, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 2 });
  }
  async function stopCast() {
    if (!captureDir || !casting) return;
    await send("Page.stopScreencast");
    casting = false;
  }

  async function step(label, fn) {
    try {
      await fn();
      results.push({ label, ok: true });
      console.log(`  PASS: ${label}`);
    } catch (err) {
      results.push({ label, ok: false, error: err.message });
      console.error(`  FAIL: ${label} — ${err.message}`);
    }
  }
  function assert(condition, label) {
    if (!condition) throw new Error(`assertion failed: ${label}`);
  }

  const RENDER_SLOT = { dom: "dom-preview", reactflow: "reactflow-canvas", tldraw: "tldraw-canvas" };

  async function selectComponentPicker(name) {
    await evaluate(`(() => {
      const el = document.querySelector('[data-slot="component-picker"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(name)});
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 200));
  }

  async function gotoRender(render) {
    const c = await centerOf(`[data-slot="render-tab"][data-render="${render}"]`);
    await click(c.x, c.y);
    await waitFor(`document.querySelector('[data-slot="${RENDER_SLOT[render]}"]')`, `${render} render mounted`);
  }

  async function gotoView(view) {
    const c = await centerOf(`[data-slot="view-tab"][data-view="${view}"]`);
    await click(c.x, c.y);
  }

  async function glyphContentKind(containerSlot) {
    return evaluate(
      `document.querySelector('[data-slot="${containerSlot}"] [data-slot="glyph"]')?.getAttribute("data-content-kind") ?? null`,
    );
  }

  async function pickerDialogOpen() {
    return evaluate(`!!document.querySelector('[role="dialog"][aria-label="Glyph picker"]')`);
  }

  /** The governed "Size (px)" row defaults to hidden (Simple/Advanced tier)
   *  unless it already carries an override; `[data-slot="hidden-but-set"]`
   *  bumps the whole panel to Expert tier (persisted), which is the only
   *  standing way to reveal it rather than assuming a starting tier. */
  async function revealSizeRow() {
    const revealed = await evaluate(`!!document.querySelector('[data-slot="figma-dense-row"][data-field="size"]')`);
    if (!revealed) {
      const reveal = await centerOf(`[data-slot="hidden-but-set"]`);
      await click(reveal.x, reveal.y);
    }
  }

  async function sizeRowTriggerText() {
    return evaluate(
      `document.querySelector('[data-slot="figma-dense-row"][data-field="size"] [data-slot="named-dropdown-trigger"]')?.textContent ?? null`,
    );
  }

  // ---------------------------------------------------------------------
  await step("load /create", async () => {
    await send("Page.navigate", { url });
    await waitFor(`document.querySelector('[data-slot="create-workbench"]')`, "the /create page");
    await new Promise((r) => setTimeout(r, 800));
  });

  await step("select the Glyph bench", async () => {
    await selectComponentPicker("Glyph");
    await waitFor(`document.querySelectorAll('[data-slot="subject-row"][data-subject-type="Glyph"]').length > 0`, "a Glyph instance on the bench");
  });

  // 1. Click -> picker opens -> filter "rocket" -> pick -> paints here and in
  // the other two renders after switching, for each render in turn.
  for (const render of ["dom", "reactflow", "tldraw"]) {
    if (render === "tldraw") await startCast();
    await step(`${render}: click the glyph opens the picker`, async () => {
      await gotoRender(render);
      const target =
        render === "dom"
          ? await centerOf(`[data-slot="dom-instance"]`)
          : render === "reactflow"
            ? await centerOf(`[data-slot="rf-glyph"]`)
            : await centerOf(`[data-slot="glyph-picker-trigger"]`);
      await click(target.x, target.y);
      await waitFor(`document.querySelector('[role="dialog"][aria-label="Glyph picker"]')`, "the Glyph picker dialog");
    });

    await step(`${render}: filter "rocket" and pick it`, async () => {
      const filter = await centerOf(`[data-testid="glyph-picker-filter"]`);
      await click(filter.x, filter.y);
      await typeText("rocket");
      await waitFor(`document.querySelector('[data-testid="glyph-picker-cell-lucide-rocket"]')`, "a rocket cell in the filtered grid");
      const cell = await centerOf(`[data-testid="glyph-picker-cell-lucide-rocket"]`);
      await click(cell.x, cell.y);
      await new Promise((r) => setTimeout(r, 300));
      assert(!(await pickerDialogOpen()), "picker closed after picking");
      assert((await glyphContentKind(RENDER_SLOT[render])) === "lucide", `${render}'s own glyph paints a lucide svg`);
    });

    await screenshot(`01-${render}-rocket.png`);

    for (const other of ["dom", "reactflow", "tldraw"].filter((r) => r !== render)) {
      await step(`${render} -> ${other}: the same instance shows rocket too`, async () => {
        await gotoRender(other);
        await waitFor(`document.querySelector('[data-slot="${RENDER_SLOT[other]}"] [data-slot="glyph"]')`, `a glyph on ${other}`);
        assert((await glyphContentKind(RENDER_SLOT[other])) === "lucide", `${other} shows the lucide content too`);
      });
    }
  }

  // 2. Emoji tab pick, on DOM.
  await stopCast();

  await step("DOM: Emoji tab pick paints an emoji", async () => {
    await gotoRender("dom");
    const trigger = await centerOf(`[data-slot="dom-instance"] [data-slot="glyph-picker-trigger"]`);
    await click(trigger.x, trigger.y);
    await waitFor(`document.querySelector('[role="dialog"][aria-label="Glyph picker"]')`, "the Glyph picker dialog");
    const emojiTab = await centerOf(`[data-testid="glyph-picker-tab-emoji"]`);
    await click(emojiTab.x, emojiTab.y);
    await waitFor(`document.querySelectorAll('[data-testid^="glyph-picker-cell-emoji-"]').length > 0`, "the emoji grid");
    const firstEmoji = await evaluate(`document.querySelector('[data-testid^="glyph-picker-cell-emoji-"]')?.getAttribute("data-testid") ?? null`);
    assert(firstEmoji, "an emoji cell exists");
    const cell = await centerOf(`[data-testid="${firstEmoji}"]`);
    await click(cell.x, cell.y);
    await new Promise((r) => setTimeout(r, 300));
    assert((await glyphContentKind("dom-preview")) === "emoji", "DOM's glyph now paints an emoji");
  });

  // Put the content back to a Lucide rocket for the rest of the journey — the
  // remaining steps (Code view's own printed snippet, the size/rotation work)
  // are written against "lucide:rocket".
  await step("DOM: pick rocket again for the remaining steps", async () => {
    const trigger = await centerOf(`[data-slot="dom-instance"] [data-slot="glyph-picker-trigger"]`);
    await click(trigger.x, trigger.y);
    await waitFor(`document.querySelector('[role="dialog"][aria-label="Glyph picker"]')`, "the Glyph picker dialog");
    const filter = await centerOf(`[data-testid="glyph-picker-filter"]`);
    await click(filter.x, filter.y);
    await typeText("rocket");
    await waitFor(`document.querySelector('[data-testid="glyph-picker-cell-lucide-rocket"]')`, "a rocket cell");
    const cell = await centerOf(`[data-testid="glyph-picker-cell-lucide-rocket"]`);
    await click(cell.x, cell.y);
  });

  // 3. Press-drag 60px on React Flow and on tldraw: it moved, no dialog opened.
  for (const render of ["reactflow", "tldraw"]) {
    if (render === "tldraw") await startCast();
    await step(`${render}: press-drag 60px moves the glyph without opening the picker`, async () => {
      await gotoRender(render);
      const triggerSelector = render === "reactflow" ? `[data-slot="rf-glyph"] [data-slot="glyph-picker-trigger"]` : `[data-slot="glyph-picker-trigger"]`;
      const before = await rectOf(triggerSelector);
      await drag({ x: before.cx, y: before.cy }, { x: before.cx + 60, y: before.cy });
      const after = await rectOf(triggerSelector);
      assert(!(await pickerDialogOpen()), "the picker did not open from a drag");
      assert(Math.abs(after.cx - before.cx - 60) < 12, `moved ~60px right (measured ${after.cx - before.cx}px)`);
    });
    await screenshot(`02-${render}-dragged.png`);
  }

  // 4. tldraw: drag the resize handle — Size row reads a custom value, DOM
  // shows that px. Resize handles sit ON the shape's corner (tldraw's own
  // selection-foreground overlay draws the interactive hit target centred on
  // that corner), so the corner point itself is a real point to press.
  await step("tldraw: drag the resize handle sets a custom size override", async () => {
    await gotoRender("tldraw");
    const trigger = await centerOf(`[data-slot="glyph-picker-trigger"]`);
    await click(trigger.x, trigger.y - 200); // click empty canvas first: closes any leftover picker without hitting the shape
    await click(trigger.x, trigger.y); // select the glyph shape (plain click, no drag)
    await new Promise((r) => setTimeout(r, 200));
    const box = await rectOf(`[data-slot="glyph-picker-trigger"]`);
    const corner = { x: box.x + box.width, y: box.y + box.height };
    await drag(corner, { x: corner.x + 40, y: corner.y + 40 });
    await new Promise((r) => setTimeout(r, 300));
    await gotoRender("dom");
    const domSize = await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="glyph"]')?.getAttribute("data-size") ?? null`);
    assert(domSize && domSize !== "18", `DOM's glyph grew off the 18px preset (now ${domSize}px)`);
    // The brief's own wording: the Size (px) row itself, not only the DOM
    // attribute, must read the same custom value the handle just wrote --
    // a resize that reached the DOM through some OTHER path (or wrote the
    // wrong number into the panel) would still pass a DOM-only check.
    await revealSizeRow();
    const sizeRowText = await sizeRowTriggerText();
    // startsWith, not ===: the dropdown trigger's own textContent carries a
    // trailing decoration glyph (its disclosure caret) after the number.
    assert(
      sizeRowText?.startsWith(`${domSize}px`),
      `Size (px) row reads the same custom value as the DOM (row="${sizeRowText}", dom=${domSize}px)`,
    );
  });
  await screenshot("03-tldraw-resized.png");

  // 5. tldraw: drag the rotate handle — the Renderer rotation row changes, the
  // React Flow node carries a rotate transform. tldraw's selection handles
  // are drawn on a canvas overlay, not real DOM elements
  // (SelectionForegroundOverlayUtil), so there is no selector to click. The hit
  // region scales with the shape's OWN size (isSmallX/isTinyX), so the offset
  // below is measured empirically on THIS step's actual 58px post-resize
  // shape (a small probe pressed at increasing diagonal offsets from the
  // corner and read `editor.getPath()`: 0-6px is the resize handle, 8-14px
  // is rotate, 16px+ is empty canvas — a miss there starts a marquee that
  // DESELECTS the shape, cascading into every assertion after it, so this
  // value matters more than it looks).
  await step("tldraw: drag the rotate handle turns the shape", async () => {
    await gotoRender("tldraw");
    const box = await rectOf(`[data-slot="glyph-picker-trigger"]`);
    const corner = { x: box.x + box.width, y: box.y + box.height };
    const rotateHandle = { x: corner.x + 10, y: corner.y + 10 };
    await drag(rotateHandle, { x: corner.x + 10, y: corner.y - 30 });
    await new Promise((r) => setTimeout(r, 300));
    const rotation = await evaluate(
      `window.__bboxCreateTldrawEditor?.getCurrentPageShapes().find((s) => s.type === "bbox-glyph")?.rotation ?? null`,
    );
    assert(rotation !== null && Math.abs(rotation) > 0.01, `the shape's own rotation changed (measured ${rotation})`);
  });
  await screenshot("04-tldraw-rotated.png");
  await stopCast();

  await step("the Renderer rotation row reflects the drag", async () => {
    const value = await evaluate(
      `document.querySelector('[data-slot="host-fact-row"][data-field="rotation"] [data-slot="host-fact-input"]')?.value ?? null`,
    );
    assert(value !== null && Number(value) !== 0, `rotation row reads a non-zero angle (${value})`);
  });

  await step("React Flow's node carries the same rotation as a CSS transform", async () => {
    await gotoRender("reactflow");
    const transform = await evaluate(`document.querySelector('[data-slot="rf-glyph"]')?.style.transform ?? ""`);
    assert(transform.includes("rotate("), `rf-glyph's style.transform is a rotate() (got "${transform}")`);
  });

  // 6. Type 45 into the rotation row — the tldraw shape's rotation becomes π/4.
  await step("typing 45 into the rotation row turns the tldraw shape to π/4", async () => {
    // The PREVIOUS step ends on React Flow (to read its rotate transform),
    // which unmounts tldraw's <Tldraw> entirely (only the active render
    // stays mounted, viewport/index.tsx's own Body()) — its editor disposes,
    // and `window.__bboxCreateTldrawEditor` would read a frozen, stale
    // snapshot rather than the live document. Back to tldraw first.
    await gotoRender("tldraw");
    await retypeNumber(`[data-slot="host-fact-row"][data-field="rotation"] [data-slot="host-fact-input"]`, "45");
    const rotation = await evaluate(
      `window.__bboxCreateTldrawEditor?.getCurrentPageShapes().find((s) => s.type === "bbox-glyph")?.rotation ?? null`,
    );
    assert(rotation !== null && Math.abs(rotation - Math.PI / 4) < 0.02, `shape.rotation is π/4 (measured ${rotation})`);
  });

  // 6b. tldraw rotates about the shape's ORIGIN, not its centre — React
  // Flow (and the DOM wrapper) rotate about the box's centre instead, so
  // without a conversion at the tldraw boundary the same instance paints
  // at two different page points once it is rotated (see the WHY at
  // `tldrawOriginFor`/`centrePivotFor` in tldraw-canvas.tsx). Compare each
  // canvas's OWN notion of the glyph's painted centre — not a screen
  // pixel, which would also have to account for each canvas's independent
  // zoom/pan — using the model values each already exposes for tests
  // (`window.__bboxCreateTldrawEditor`, `window.__bboxCreateReactFlowNodes`).
  await step("tldraw and React Flow paint the rotated glyph at the same page-space centre", async () => {
    await gotoRender("tldraw");
    const tldrawCentre = await evaluate(`(() => {
      const shape = window.__bboxCreateTldrawEditor?.getCurrentPageShapes().find((s) => s.type === "bbox-glyph");
      if (!shape) return null;
      const half = (shape.props.size ?? 18) / 2 + (shape.props.padding ?? 0);
      const cos = Math.cos(shape.rotation);
      const sin = Math.sin(shape.rotation);
      return { x: shape.x + (half * cos - half * sin), y: shape.y + (half * sin + half * cos) };
    })()`);
    assert(tldrawCentre, "read the tldraw shape's own geometry");

    await gotoRender("reactflow");
    const rfCentre = await evaluate(`(() => {
      const node = window.__bboxCreateReactFlowNodes?.find((n) => n.type === "bboxGlyph");
      if (!node) return null;
      const half = (node.data.size ?? 18) / 2 + (node.data.padding ?? 0);
      return { x: node.position.x + half, y: node.position.y + half };
    })()`);
    assert(rfCentre, "read the React Flow node's own position");

    assert(
      Math.abs(tldrawCentre.x - rfCentre.x) < 1.5 && Math.abs(tldrawCentre.y - rfCentre.y) < 1.5,
      `same painted centre in both renders (tldraw ${JSON.stringify(tldrawCentre)}, react flow ${JSON.stringify(rfCentre)})`,
    );
  });

  // 7. Clear the size override — back to "driven by", the shape snaps to 18px.
  // `size` is governed and defaults to the Advanced/Expert tier (FigmaDense's
  // own field-tier rule); an override still surfaces the "N hidden fields are
  // set — show Expert" banner, which is the real, stable way to reveal the
  // row rather than assuming a starting tier.
  await step("clearing the size override snaps the glyph back to 18px", async () => {
    await revealSizeRow();
    const clearButton = await centerOf(`[data-slot="figma-dense-row"][data-field="size"] [data-slot="field-clear-override"]`);
    await click(clearButton.x, clearButton.y);
    await new Promise((r) => setTimeout(r, 300));
    // Provenance, not only the number: a clear that dropped the override
    // but re-wrote a hard-coded 18 (instead of actually leaving the
    // cascade to resolve it) would read the same DOM px with nothing else
    // to tell the two apart EXCEPT that the clear button — rendered only
    // `isGoverned && hasOwnOverride` (FigmaDense.tsx's own FieldRow) —
    // would still be there. This bench's own Glyph seed never sets
    // `sizePreset` explicitly (bench.tsx's SEED_VARIANTS), so the size
    // field's resolved value here comes from `field.defaultValue`, not a
    // matched preset (see resolveField's own selector-match rule) — there
    // is no "driven by Small" badge to read for THIS instance, so the
    // clear button's disappearance is the real, honest signal that the
    // override layer is actually gone.
    const stillClearable = await evaluate(
      `!!document.querySelector('[data-slot="figma-dense-row"][data-field="size"] [data-slot="field-clear-override"]')`,
    );
    assert(!stillClearable, "the clear button is gone — no override layer left to clear");
    await gotoRender("dom");
    const domSize = await evaluate(`document.querySelector('[data-slot="dom-preview"] [data-slot="glyph"]')?.getAttribute("data-size") ?? null`);
    assert(domSize === "18", `DOM's glyph is back to the 18px Small preset (measured ${domSize})`);
  });

  // 7b. Setting a Custom size of exactly 18 — the sm preset's own default —
  // must still show up in Code view as a real override, not get stripped
  // to `size: null` by the DOM printer's default-omission rule (that rule
  // is right for DOM's JSX, wrong for tldraw/React Flow's raw records; see
  // the WHY on `glyphRecord` in code-view.tsx). Cleared again at the end so
  // the rest of the journey keeps assuming the unforced 18px preset.
  await step("a Custom size of exactly 18 still prints as a real override in Code view", async () => {
    await gotoRender("tldraw");
    await revealSizeRow();
    const trigger = await centerOf(`[data-slot="figma-dense-row"][data-field="size"] [data-slot="named-dropdown-trigger"]`);
    await click(trigger.x, trigger.y);
    await waitFor(`document.querySelector('[data-slot="named-dropdown-custom-input"]')`, "the Custom size input");
    const input = await centerOf(`[data-slot="named-dropdown-custom-input"]`);
    await click(input.x, input.y);
    await evaluate(`(() => {
      const el = document.querySelector('[data-slot="named-dropdown-custom-input"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "18");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    // The row commits on blur/Enter, reading `event.target.value` — not on
    // the "input" event above (`NumberInput`'s own commit path elsewhere in
    // this file), so a real Enter keydown is what makes the write happen.
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
    await new Promise((r) => setTimeout(r, 300));
    const sizeRowText = await sizeRowTriggerText();
    assert(sizeRowText?.startsWith("18px"), `Size (px) row reads Custom 18 (row="${sizeRowText}")`);

    await gotoView("code");
    await waitFor(`document.querySelector('[data-slot="code-text"]')`, "the code view");
    const tldrawCode = await evaluate(`document.querySelector('[data-slot="code-text"]')?.textContent ?? ""`);
    assert(tldrawCode.includes("size: 18"), `tldraw's code prints the real size: 18 (got: ${JSON.stringify(tldrawCode.match(/size: \S+/)?.[0] ?? null)})`);
    await gotoView("preview");

    await gotoRender("reactflow");
    await gotoView("code");
    await waitFor(`document.querySelector('[data-slot="code-text"]')`, "the code view");
    const rfCode = await evaluate(`document.querySelector('[data-slot="code-text"]')?.textContent ?? ""`);
    assert(rfCode.includes("size: 18"), `React Flow's code prints the real size: 18 (got: ${JSON.stringify(rfCode.match(/size: \S+/)?.[0] ?? null)})`);
    await gotoView("preview");

    await gotoRender("tldraw");
    await revealSizeRow();
    const clearButton = await centerOf(`[data-slot="figma-dense-row"][data-field="size"] [data-slot="field-clear-override"]`);
    await click(clearButton.x, clearButton.y);
    await new Promise((r) => setTimeout(r, 300));
  });

  // 8. Code view, for each render, prints the real record.
  const CODE_SNIPPETS = {
    dom: '<Glyph content="lucide:rocket"',
    reactflow: "bboxGlyph",
    tldraw: "bbox-glyph",
  };
  for (const render of ["dom", "reactflow", "tldraw"]) {
    await step(`${render}: Code view contains the real record`, async () => {
      await gotoRender(render);
      await gotoView("code");
      await waitFor(`document.querySelector('[data-slot="code-text"]')`, "the code view");
      const code = await evaluate(`document.querySelector('[data-slot="code-text"]')?.textContent ?? ""`);
      assert(code.includes(CODE_SNIPPETS[render]), `code includes ${JSON.stringify(CODE_SNIPPETS[render])}`);
    });
    // Captured HERE, while the code view is still on screen — taking it after
    // `gotoView("preview")` below photographed the Preview tab every time,
    // leaving no visual evidence for "Code view prints the real record".
    // Both calls are best-effort: the assertion that matters already ran
    // and was recorded above, so a screenshot or tab-switch failure here
    // (only possible if a PRIOR step already failed and left the page in
    // an unexpected state) must not crash the whole script past the
    // try/finally's own cleanup.
    try {
      await screenshot(`05-code-${render}.png`);
      await gotoView("preview");
    } catch (err) {
      console.error(`  (non-fatal: post-code-view cleanup for ${render} — ${err.message})`);
    }
  }

  // 9. A non-Glyph selection gets no Rotation row at all — nothing on the
  // page reads or writes a bench's rotation today (only `bbox-glyph`'s own
  // shape/node carries one), so a row that claimed a writer here would be
  // lying about what the canvas actually does with it.
  if (captureDir) {
    await step("capture: light-theme stills of the three renders and the open picker", async () => {
      await evaluate(`(localStorage.setItem("theme", "light"), true)`);
      await send("Page.navigate", { url });
      await waitFor(`document.querySelector('[data-slot="create-workbench"]')`, "workbench after reload");
      await waitFor(`document.documentElement.classList.contains("light") || !document.documentElement.classList.contains("dark")`, "light theme applied");
      await selectComponentPicker("Glyph");
      await waitFor(`document.querySelector('[data-slot="glyph-picker-trigger"]')`, "a glyph on the bench");
      await gotoView("preview");
      for (const render of ["dom", "reactflow", "tldraw"]) {
        await gotoRender(render);
        await new Promise((r) => setTimeout(r, 400));
        const shot = await screenshot(`06-light-${render}.png`);
        copyFileSync(shot, path.join(captureDir, `06-light-${render}.png`));
      }
      await gotoRender("dom");
      const trigger = await centerOf(`[data-slot="dom-preview"] [data-slot="glyph-picker-trigger"]`);
      await click(trigger.x, trigger.y);
      await waitFor(`document.querySelector('[role="dialog"][aria-label="Glyph picker"]')`, "picker open in light theme");
      await new Promise((r) => setTimeout(r, 300));
      const filter = await centerOf(`[data-testid="glyph-picker-filter"]`);
      await click(filter.x, filter.y);
      await typeText("rocket");
      await new Promise((r) => setTimeout(r, 500));
      const open = await screenshot("06-light-picker.png");
      copyFileSync(open, path.join(captureDir, "06-light-picker.png"));
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await evaluate(`(localStorage.setItem("theme", "dark"), true)`);
      await send("Page.navigate", { url });
      await waitFor(`document.querySelector('[data-slot="create-workbench"]')`, "workbench back in dark");
      await selectComponentPicker("Glyph");
      await gotoView("preview");
    });
    for (const name of ["01-dom-rocket.png", "01-reactflow-rocket.png", "01-tldraw-rocket.png", "02-tldraw-dragged.png", "03-tldraw-resized.png", "04-tldraw-rotated.png", "05-code-dom.png", "05-code-reactflow.png", "05-code-tldraw.png"]) {
      try { copyFileSync(path.join(shotDir, name), path.join(captureDir, name)); } catch {}
    }
  }

  await step("a non-Glyph selection has no Rotation row (nothing writes it)", async () => {
    await gotoView("preview");
    await gotoRender("tldraw");
    await selectComponentPicker("Pill");
    await waitFor(`document.querySelectorAll('[data-slot="subject-row"][data-subject-type="Pill"]').length > 0`, "a Pill instance on the bench");
    await waitFor(`document.querySelector('[data-slot="host-facts-section"]')`, "the Renderer section for the Pill selection");
    const hasRotationRow = await evaluate(`!!document.querySelector('[data-slot="host-fact-row"][data-field="rotation"]')`);
    assert(!hasRotationRow, "no Rotation row renders for a component no render can turn");
  });

  // 10. A runtime error anywhere in the run must fail it — printing a count
  // without acting on it (the previous state of this file) let all three
  // pivot/gating/code-view defects above pass 27/27 on the same build they
  // reproduce in.
  await step("no console errors were seen during the run", async () => {
    assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);
  });

  // ---------------------------------------------------------------------
} finally {
  if (chrome) {
    chrome.kill();
    await new Promise((resolve) => chrome.once("exit", resolve));
    // The exit event fires for the LAUNCHED process; its renderer/GPU/
    // utility helpers can take a beat longer to actually release the
    // profile directory's file handles (observed: an rmSync right after
    // exit left a stray dir on an otherwise successful run). A short
    // grace period before the retry loop below is cheaper than chasing
    // that race through Chrome's own shutdown internals.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // best effort — a straggling chrome helper may still hold the tmp profile
  }
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`${results.length - failed.length}/${results.length} steps passed. Screenshots: ${shotDir}`);
if (consoleErrors.length > 0) console.log(`console errors seen: ${consoleErrors.length}`);
if (failed.length > 0) {
  console.error(`FAIL create-glyph: ${failed.map((f) => f.label).join("; ")}`);
  process.exit(1);
}
console.log("PASS create-glyph");
