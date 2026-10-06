// src/document/schemaV2Pixels.smoke.test.tsx — B-SCHEMA's pixel gate
// (docs/lanes/finish-B-SCHEMA.md, lanes.json B-SCHEMA acceptance line 3):
// "pixel-identical screenshot of a fixture board before/after
// (subtract-the-images, zero diff)".
//
// ACCEPTANCE — committed by the acceptance author before any builder existed,
// off-limits to the builder, together with the two fixtures it reads:
//
//   src/document/fixtures/legacy-v1.bbox  — a board SAVED BY THIS APP at BASE,
//       before schema v2: the real `serializeBoard` bytes of the board
//       `buildLegacyBoard` below draws, at sequences ss-block 4 · ss-port 2 ·
//       ss-wire 2 · ss-code 0 · ss-region 0.
//   src/document/fixtures/legacy-v1.png   — what that board looked like when
//       the app at BASE opened it through its own File ▸ Open path
//       (`loadBoardText`), clipped to the board's own bounds.
//
// Both were written ONCE, at BASE, by the gated `capture` block at the bottom
// of this file (`VITE_BSCHEMA_CAPTURE=1`). `schemaV2Migration.test.ts` pins
// both files by SHA-256, so neither can be regenerated after the build without
// turning a unit test red — the ruler is frozen, the way
// feedback_independent_oracle asks.
//
// WHAT THE GATE MEANS. Schema v2 adds every new prop at a default that must
// paint exactly today's pixels ("every default renders exactly today's
// pixels; props only, no behaviour" — lanes.json). The only honest "before"
// for that claim is a capture made by the code that existed before v2, so the
// baseline is a committed image, and the "after" is the same board opened by
// the code under test. The comparison is a literal subtraction: every RGBA
// byte of both captures, decoded without colour management, and the count of
// pixels where any byte differs must be ZERO. No threshold, no anti-alias
// forgiveness — a default that moved one pixel is a default that is wrong.
//
// WHY THE ORDER INSIDE THE CHECK (pixels first, then "was this v2?"): at BASE
// the pixel half passes — which is the proof that the capture is reproducible
// and the gate is not flaky — and the v2 half fails, because nothing migrated.
// That is the red this file is committed with, and the right reason for it.
//
// LIFETIME, said out loud because it is a golden: this pins TODAY's paint. A
// later lane that changes block, port, wire, code or region paint ON PURPOSE
// (a footer, a crossing halo, a value view…) will turn it red, correctly. That
// lane's acceptance author re-captures the baseline in its own acceptance
// commit and names it in LEDGER.md — never the builder, and never silently.
import { createShapeId, type Editor } from "tldraw";
import { commands, page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { loadBoardText, serializeBoard } from "../chrome/FileMenu/fileActions";
import { createCornerBlock } from "../shapes/region";
import { createWire } from "../shapes/wire/createWire";
import { BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "../shapes/types";
import { mountApp, nextFrame, waitFor, type MountedApp } from "../testing/harness";

/** Paths for vitest's `commands.*`, which resolve against the PROJECT root
 *  (`apps/systemsketch`), not this file (@vitest/browser `readFile`). */
const FIXTURE_PATH = "src/document/fixtures/legacy-v1.bbox";
const BASELINE_PATH = "src/document/fixtures/legacy-v1.png";

/** `VITE_BSCHEMA_CAPTURE=1 pnpm exec vitest --project=smoke run src/document/schemaV2Pixels.smoke.test.tsx`
 *  — run once, at BASE, by the acceptance author. Never by a builder. */
const CAPTURE = import.meta.env.VITE_BSCHEMA_CAPTURE === "1";

/** The schema sequences schema v2 must reach: ONE new step per shape kind
 *  (lanes.json: "every new prop in ONE migration"). */
const V2_SEQUENCES = {
  "com.tldraw.shape.ss-block": 5,
  "com.tldraw.shape.ss-port": 3,
  "com.tldraw.shape.ss-wire": 3,
  "com.tldraw.shape.ss-code": 1,
  "com.tldraw.shape.ss-region": 1,
};

/** Space kept around the board's own bounds in the capture, px. */
const CLIP_PAD_PX = 16;

let app: MountedApp | null = null;
const probes: HTMLElement[] = [];
afterEach(() => {
  for (const probe of probes.splice(0)) probe.remove();
  app?.unmount();
  app = null;
});

/* ------------------------------------------------------------------ */
/* The board                                                          */
/* ------------------------------------------------------------------ */

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };
const id = (name: string) => createShapeId(`legacy-${name}`);

/**
 * The legacy board: every `ss-*` kind, every view a block has today, a member
 * inside an expanded block, both region kinds with their corner cards, a free
 * port, a code cell, and cables in every variant with every authored prop the
 * pre-v2 schema carries (diff marks, colour, pins, tunnel + layer). Built
 * through the app's own constructors (`createShape` with partial props,
 * `createCornerBlock`, `createWire`) so the saved bytes are what a person's
 * board looks like, not a hand-assembled record set.
 */
function buildLegacyBoard(editor: Editor): void {
  editor.run(() => {
    editor.createShape({
      id: id("camera"),
      type: BLOCK_SHAPE_TYPE,
      x: 0,
      y: 40,
      props: { name: "camera", view: "simple", glyph: "lucide:camera", ports: { ...NO_PORTS, right: [{ id: "image", declaration: "image: Image" }] } },
    } as never);
    editor.createShape({
      id: id("estimate"),
      type: BLOCK_SHAPE_TYPE,
      x: 240,
      y: 0,
      props: {
        name: "estimate()",
        view: "port",
        w: 220,
        h: 110,
        description: "Estimates  pose from a frame.",
        glyph: "lucide:rocket",
        diff: "modified",
        ports: {
          ...NO_PORTS,
          left: [
            { id: "frame", declaration: "frame: Frame" },
            { id: "gain", declaration: "gain: float" },
          ],
          right: [{ id: "pose", declaration: "pose: Pose" }],
        },
      },
    } as never);
    editor.createShape({
      id: id("gain"),
      type: PORT_SHAPE_TYPE,
      x: 30,
      y: 200,
      props: { declaration: "gain: float", direction: "out", diff: "removed" },
    } as never);
    editor.createShape({
      id: id("pipeline"),
      type: BLOCK_SHAPE_TYPE,
      x: 500,
      y: 0,
      props: {
        name: "Pipeline",
        view: "expanded",
        w: 380,
        h: 250,
        ports: { ...NO_PORTS, left: [{ id: "frames", declaration: "frames: Iterable" }], right: [{ id: "poses", declaration: "poses" }] },
      },
    } as never);
    editor.createShape({
      id: id("decode"),
      type: BLOCK_SHAPE_TYPE,
      parentId: id("pipeline"),
      x: 20,
      y: 56,
      props: { name: "decode()", view: "port", w: 170, h: 76, ports: { ...NO_PORTS, left: [{ id: "raw", declaration: "raw: bytes" }], right: [{ id: "frame", declaration: "frame: Frame" }] } },
    } as never);
    editor.createShape({
      id: id("cell"),
      type: CODE_SHAPE_TYPE,
      parentId: id("pipeline"),
      x: 20,
      y: 150,
      props: { code: "y = clamp(x * k, 0, 1)\n", language: "python", w: 240, h: 60 },
    } as never);
    editor.createShape({
      id: id("loop"),
      type: REGION_SHAPE_TYPE,
      x: 0,
      y: 300,
      props: { kind: "for", name: "for", w: 400, h: 250, arms: [] },
    } as never);
    createCornerBlock(editor, id("loop"), "for");
    editor.createShape({
      id: id("step"),
      type: BLOCK_SHAPE_TYPE,
      parentId: id("loop"),
      x: 210,
      y: 130,
      props: { name: "step()", view: "port", w: 160, h: 80, ports: { ...NO_PORTS, left: [{ id: "i", declaration: "i: int" }], right: [{ id: "out", declaration: "out" }] } },
    } as never);
    editor.createShape({
      id: id("branch"),
      type: REGION_SHAPE_TYPE,
      x: 460,
      y: 290,
      props: {
        kind: "branch",
        name: "branch",
        w: 440,
        h: 300,
        arms: [
          { id: "if", title: "if fast:", open: true, h: 90 },
          { id: "else", title: "else", open: true, h: 70 },
        ],
      },
    } as never);
    createCornerBlock(editor, id("branch"), "branch");
  });

  const camera = id("camera");
  const estimate = id("estimate");
  const pipeline = id("pipeline");
  const step = id("step");
  createWire(editor, { from: { nodeId: camera, portId: "image" }, to: { nodeId: estimate, portId: "frame" } });
  createWire(editor, { from: { nodeId: id("gain"), portId: "port" }, to: { nodeId: estimate, portId: "gain" }, variant: "async", color: "#2563eb" });
  const delayed = createWire(editor, { from: { nodeId: estimate, portId: "pose" }, to: { nodeId: pipeline, portId: "frames" }, variant: "delayed" });
  const authored = createWire(editor, { from: { nodeId: camera, portId: "image" }, to: { nodeId: step, portId: "i" } });
  const tunnelled = createWire(editor, { from: { nodeId: estimate, portId: "pose" }, to: { nodeId: step, portId: "i" }, routing: "curved" });
  editor.run(() => {
    if (delayed) editor.updateShape({ id: delayed, type: WIRE_SHAPE_TYPE, props: { diff: "added" } } as never);
    if (authored) editor.updateShape({ id: authored, type: WIRE_SHAPE_TYPE, props: { pins: [{ index: 1, axis: "y", t: 0.5, offset: 24 }] } } as never);
    if (tunnelled) editor.updateShape({ id: tunnelled, type: WIRE_SHAPE_TYPE, props: { tunnel: true, layer: "telemetry" } } as never);
  });
}

/* ------------------------------------------------------------------ */
/* Rendering it the same way twice                                    */
/* ------------------------------------------------------------------ */

/** Every node and cable as the store holds it — the thing that must stop
 *  changing before a capture means anything. */
function boardState(editor: Editor): string {
  return JSON.stringify(
    editor
      .getCurrentPageShapesSorted()
      .map((shape) => [shape.id, shape.parentId, Math.round(shape.x * 100), Math.round(shape.y * 100), shape.props]),
  );
}

/** Fonts loaded, then the measurement pass (`shared/measure.ts`) and the
 *  region kit's reconciles quiet for a run of frames. */
async function settle(editor: Editor): Promise<void> {
  await document.fonts.ready;
  let previous = "";
  let quiet = 0;
  for (let frame = 0; quiet < 12; frame++) {
    if (frame > 900) throw new Error("the board never stopped re-measuring (900 frames)");
    await nextFrame();
    const now = boardState(editor);
    quiet = now === previous ? quiet + 1 : 0;
    previous = now;
  }
}

/** Open the committed legacy file through the app's own File ▸ Open path. */
async function openLegacyBoard(): Promise<{ editor: Editor; root: HTMLElement }> {
  app = await mountApp();
  const text = await commands.readFile(FIXTURE_PATH);
  const result = loadBoardText(app.editor, text);
  expect(result, "the legacy .bbox opens through loadBoardText").toEqual({ ok: true });
  app.editor.selectNone();
  app.editor.setHoveredShape(null);
  await settle(app.editor);
  return { editor: app.editor, root: app.root };
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A transparent, pointer-transparent box over the board's own bounds — the
 *  element Playwright crops its screenshot to. Client px of this document. */
function clipProbe(editor: Editor): HTMLElement {
  const bounds = editor.getCurrentPageBounds();
  if (!bounds) throw new Error("the board is empty");
  const topLeft = editor.pageToScreen({ x: bounds.minX, y: bounds.minY });
  const bottomRight = editor.pageToScreen({ x: bounds.maxX, y: bounds.maxY });
  const probe = document.createElement("div");
  probe.setAttribute("data-testid", "bschema-clip");
  const left = Math.floor(topLeft.x - CLIP_PAD_PX);
  const top = Math.floor(topLeft.y - CLIP_PAD_PX);
  Object.assign(probe.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${Math.ceil(bottomRight.x + CLIP_PAD_PX) - left}px`,
    height: `${Math.ceil(bottomRight.y + CLIP_PAD_PX) - top}px`,
    pointerEvents: "none",
    background: "transparent",
  });
  document.body.appendChild(probe);
  probes.push(probe);
  return probe;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The app's chrome must not sit inside the clip: it carries text that changes
 * with things this gate is not about (a branch name, a build stamp, a channel
 * status). Measured, never assumed — every element of the app that is not the
 * canvas, its shapes or tldraw's own layers is checked against the clip.
 */
/**
 * The shell's three LAYOUT layers (`apps/storybook-basics/src/shell/BboxShell.tsx`):
 * full-viewport boxes the windows are seated in, not chrome. B-SHELL-P1 mounted
 * them in tldraw's `InFrontOfTheCanvas` after this gate was written, so they
 * cover every clip by construction; each window inside them carries its own
 * `data-slot` and is still checked below. Merge repair at the B-SHELL-P1 merge
 * (integrator, LEDGER.md): skipped only after proving each one paints nothing
 * itself — so a layer that ever grew a fill or its own text would fail here.
 */
const SHELL_LAYER_SLOTS = new Set(["bbox-shell", "bbox-shell-canvas", "bbox-shell-windows"]);

function expectPaintsNothingItself(element: HTMLElement): void {
  const style = getComputedStyle(element);
  const ownText = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
  // Border WIDTHS, not style: Tailwind's preflight gives every element
  // `border: 0 solid`, so the style reads "solid" on a box that draws no line.
  const border = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
  expect(
    { background: style.backgroundColor, image: style.backgroundImage, border, outline: style.outlineStyle, shadow: style.boxShadow, ownText },
    `shell layer ${element.getAttribute("data-slot")} paints nothing itself`,
  ).toEqual({ background: "rgba(0, 0, 0, 0)", image: "none", border: ["0px", "0px", "0px", "0px"], outline: "none", shadow: "none", ownText: false });
}

function expectChromeOutside(root: HTMLElement, clip: HTMLElement): void {
  const clipRect = clip.getBoundingClientRect();
  const canvas = root.querySelector(".tl-canvas");
  const offenders: string[] = [];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-slot]"))) {
    if (canvas?.contains(element)) continue;
    if (SHELL_LAYER_SLOTS.has(element.getAttribute("data-slot") ?? "")) {
      expectPaintsNothingItself(element);
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (getComputedStyle(element).visibility === "hidden") continue;
    if (intersects(rect, clipRect)) offenders.push(`${element.getAttribute("data-slot")} ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
  }
  expect(offenders, "no chrome overlaps the captured board").toEqual([]);
}

/** One PNG of the clip, base64 — retaken until two consecutive captures are
 *  byte-identical, so a frame still painting can never become the evidence. */
async function stableCapture(clip: HTMLElement): Promise<string> {
  let previous = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const shot = (await page.screenshot({ element: clip, save: false, base64: true, animations: "disabled", caret: "hide" } as never)) as unknown as string;
    if (shot === previous) return shot;
    previous = shot;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("the board never produced two identical captures in a row");
}

interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Decode a PNG to raw RGBA bytes — no colour management, no premultiply, so
 *  the bytes compared are the bytes that were captured. */
async function pixelsOf(base64: string): Promise<Pixels> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d context");
  context.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

/** Subtract the images: how many pixels differ in ANY channel, and where. */
function subtract(before: Pixels, after: Pixels): { differing: number; box: Rect | null } {
  if (before.width !== after.width || before.height !== after.height) {
    return { differing: Math.max(before.width * before.height, after.width * after.height), box: { left: 0, top: 0, right: Math.max(before.width, after.width), bottom: Math.max(before.height, after.height) } };
  }
  let differing = 0;
  let box: Rect | null = null;
  for (let index = 0; index < before.data.length; index += 4) {
    if (
      before.data[index] !== after.data[index] ||
      before.data[index + 1] !== after.data[index + 1] ||
      before.data[index + 2] !== after.data[index + 2] ||
      before.data[index + 3] !== after.data[index + 3]
    ) {
      differing += 1;
      const x = (index / 4) % before.width;
      const y = Math.floor(index / 4 / before.width);
      box = box ? { left: Math.min(box.left, x), top: Math.min(box.top, y), right: Math.max(box.right, x + 1), bottom: Math.max(box.bottom, y + 1) } : { left: x, top: y, right: x + 1, bottom: y + 1 };
    }
  }
  return { differing, box };
}

/* ------------------------------------------------------------------ */
/* The gate                                                           */
/* ------------------------------------------------------------------ */

describe.skipIf(CAPTURE)("B-SCHEMA — the legacy board paints exactly as it did before schema v2", () => {
  it("B-SCHEMA-pixels: opened through File ▸ Open, it subtracts to ZERO differing pixels against the BASE capture, and it was opened through schema v2", async () => {
    const { editor, root } = await openLegacyBoard();
    const clip = clipProbe(editor);
    expectChromeOutside(root, clip);

    const baseline = await pixelsOf(await commands.readFile(BASELINE_PATH, "base64"));
    const now = await pixelsOf(await stableCapture(clip));
    expect({ width: now.width, height: now.height }, "the capture covers the same board at the same size").toEqual({ width: baseline.width, height: baseline.height });
    const diff = subtract(baseline, now);
    expect(diff, "every new prop defaults to today's pixels — zero differing pixels").toEqual({ differing: 0, box: null });

    // The half that is red at BASE: the board on screen must be the MIGRATED
    // one, or the zero above proves nothing about schema v2.
    const sequences = editor.store.schema.serialize().sequences;
    const reached = Object.fromEntries(Object.keys(V2_SEQUENCES).map((key) => [key, sequences[key]]));
    expect(reached, "the board was opened through schema v2 (one new migration step per ss-* kind)").toEqual(V2_SEQUENCES);
  });
});

/* ------------------------------------------------------------------ */
/* Capture — run ONCE at BASE by the acceptance author                 */
/* ------------------------------------------------------------------ */

describe.runIf(CAPTURE)("B-SCHEMA capture (BASE only)", () => {
  it("saves the legacy board through the app's own serializer", async () => {
    app = await mountApp();
    buildLegacyBoard(app.editor);
    app.editor.selectNone();
    await settle(app.editor);
    const census = app.editor.getCurrentPageShapesSorted().map((shape) => shape.type);
    for (const type of [BLOCK_SHAPE_TYPE, CODE_SHAPE_TYPE, PORT_SHAPE_TYPE, REGION_SHAPE_TYPE, WIRE_SHAPE_TYPE]) {
      expect(census, `the legacy board carries an ${type}`).toContain(type);
    }
    await commands.writeFile(FIXTURE_PATH, await serializeBoard(app.editor));
  });

  it("captures the BASE pixels of that board, opened the way the gate opens it", async () => {
    const { editor, root } = await openLegacyBoard();
    await waitFor(() => editor.getCurrentPageShapes().length > 0, { what: "the legacy board's shapes" });
    const clip = clipProbe(editor);
    expectChromeOutside(root, clip);
    const shot = await stableCapture(clip);
    // Reproducible at BASE before it is trusted: a second, independent
    // capture of the same open must subtract to zero.
    const again = await stableCapture(clip);
    expect(subtract(await pixelsOf(shot), await pixelsOf(again)).differing).toBe(0);
    await commands.writeFile(BASELINE_PATH, shot, "base64");
  });
});
