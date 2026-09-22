#!/usr/bin/env node
/**
 * Capture the batch-wiring gesture MID-FLIGHT, one still per moment.
 *
 * WHY a dedicated script rather than `docs/capture_storybook_shots.mjs`:
 * that one screenshots a story as it loads, which is the right thing for a
 * component gallery and useless for an interaction. The evidence this lane
 * owes is a sequence — selection made, armed with the ring up and the rest
 * dimmed, committed with real wires — and those states exist only partway
 * through a pointer sequence. So this script drives the real bench on a
 * real Chromium and shoots between the clicks.
 *
 * Every still is taken from the same `Bench` story a human drives; none of
 * them is a mock, and none is assembled from a play function's end state.
 *
 *   node docs/capture_batch_wiring_shots.mjs [--port 5498] [--out DIR]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Same resolution trick as capture_storybook_shots.mjs: `docs/` has no
// node_modules, so playwright is resolved from the workspace that tests
// with it. Keeps the script in docs/ without vendoring a dependency.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const port = Number(flag("port", "5498"));
const outDir = path.resolve(flag("out", path.join(repoRoot, "reports/media/batch-wiring-shots")));

const STORY = `http://localhost:${port}/iframe.html?id=scene-wiring-batchwiring--bench&viewMode=story`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
const shots = [];

async function shoot(name) {
  // Let the 120ms opacity transition settle — the dim is the whole point of
  // several of these frames, and a shot fired mid-transition shows a value
  // that is not the one the design chose.
  await page.waitForTimeout(320);
  const file = path.join(outDir, `${name}.png`);
  const bench = await page.$('[data-testid="bench"]');
  await bench.screenshot({ path: file });
  shots.push(file);
  console.log("captured", file);
}

async function readout() {
  return {
    available: (await page.textContent('[data-testid="readout-available"]')).trim(),
    wires: (await page.textContent('[data-testid="readout-wires"]')).trim(),
    sentence: (await page.textContent('[data-testid="readout-sentence"]')).trim(),
  };
}

await page.goto(STORY, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="bench"]');

const select = (id) => page.click(`[data-scene-node="${id}"]`);
const dot = (blockId, portId) => page.click(`[data-block-id="${blockId}"] [data-port-id="${portId}"]`);

/* 1 — at rest, nothing armed, nothing painted. */
await page.click('[data-testid="reset"]');
await shoot("01-at-rest");

/* 2 — three sensors selected. Still nothing dimmed: selection is not arming. */
for (const id of ["cam", "lidar", "imu"]) await select(id);
await shoot("02-selected");

/* 3 — ARMED, "Wire into…". The ring is up and every unavailable dot is at
 *     18%. This is the frame that answers Zach's question. */
await page.click('[data-testid="arm"]');
await shoot("03-armed-into");
console.log("armed readout:", JSON.stringify(await readout()));

/* 4 — committed. Real wires, and the sentence reporting the refusals. */
await dot("fuse", "in");
await shoot("04-committed");
console.log("committed readout:", JSON.stringify(await readout()));

/* 5 — "Wire together": same selection, ring narrowed to the group's own
 *     dots. The one line separating the two commands, visible. */
await page.click('[data-testid="reset"]');
for (const id of ["cam", "lidar", "fuse"]) await select(id);
await page.click('[data-testid="intent-together"]');
await page.click('[data-testid="arm"]');
await shoot("05-armed-together");
console.log("together readout:", JSON.stringify(await readout()));

/* 6 — the hub elected; the rest of the group fanned into it. */
await dot("fuse", "cfg");
await shoot("06-hub-committed");
console.log("hub readout:", JSON.stringify(await readout()));

/* 7 — the treatment Zach scored second (Vanish, 0%), same armed state, so
 *     the two can be compared rather than described. */
await page.click('[data-testid="reset"]');
for (const id of ["cam", "lidar", "imu"]) await select(id);
await page.click('[data-testid="arm"]');
await page.click('[data-testid="treatment-vanish"]');
await shoot("07-armed-vanish");

/* 8 — the container shorthand: ONE selected node standing for its members.
 *     Uses the shared host bench, which has a real nesting (`kid` inside
 *     `proc`) that this lane's own fixture deliberately does not. */
await page.goto(`http://localhost:${port}/iframe.html?id=scene-model-diff-scene-in-a-host--scene-dom-canvas&viewMode=story`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(400);

await writeFile(path.join(outDir, "shots.json"), JSON.stringify(shots, null, 2));
await browser.close();
console.log(`\n${shots.length} stills → ${outDir}`);
