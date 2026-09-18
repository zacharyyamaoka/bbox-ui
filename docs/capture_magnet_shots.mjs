#!/usr/bin/env node
/**
 * Capture the magnet-proposal stories MID-GESTURE, driven by a REAL mouse.
 *
 * WHY this exists beside docs/capture_storybook_shots.mjs rather than
 * reusing it: that script navigates and screenshots, which is exactly right
 * for a story whose interesting state is its resting state. A magnet
 * proposal only exists WHILE a pointer is down and moving — screenshot a
 * released story and you photograph an empty canvas. So this script presses,
 * glides, and screenshots without lifting.
 *
 * It uses `page.mouse` (real CDP input, real `pointerdown`/`pointermove`,
 * real pointer capture), NOT a synthetic `dispatchEvent`. That makes these
 * captures independent evidence: the play functions dispatch events by hand,
 * and this drives the feature the way Zach will.
 *
 * Every shot also reports the DOM facts it observed at the moment of capture
 * (`data-magnet-proposals`, `-to`, `-distance`, `-refusals`) into
 * manifest.json beside the PNGs, so a capture cannot silently become a
 * picture of nothing.
 *
 *   node docs/capture_magnet_shots.mjs --port 5499 --out reports/media/magnet
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = argOf("--port", "5499");
const OUT = path.resolve(argOf("--out", "reports/media/magnet"));
const BASE = `http://localhost:${PORT}/iframe.html`;

const STORY = "blocks-scene-magnet-proposals";

/**
 * Each shot: which story, how big, where to press (a node's header), the
 * glide path in px, and any control clicks to make first.
 */
const SHOTS = [
  {
    name: "type-decides",
    id: `${STORY}--type-decides`,
    w: 780,
    h: 470,
    node: "src",
    path: [[40, 8], [90, 20], [120, 26]],
    note: "R4 — the wrong-type sink is nearer; the dotted proposal still goes to poseSink/in",
  },
  {
    name: "in-range",
    id: `${STORY}--tracks-and-vanishes`,
    w: 820,
    h: 440,
    node: "src",
    path: [[60, 0], [110, 0], [160, 0]],
    note: "R3 — in range: the dotted proposal is drawn and tracks the drag",
  },
  {
    name: "out-of-range",
    id: `${STORY}--tracks-and-vanishes`,
    w: 820,
    h: 440,
    node: "src",
    path: [[200, 0], [200, -150], [120, -170]],
    note: "R3 — out of range: the proposal disappears, mid-drag, with the pointer still down",
  },
  {
    name: "nearest-wins",
    id: `${STORY}--nearest-wins`,
    w: 820,
    h: 500,
    node: "src",
    path: [[40, 0], [100, 0], [140, 0]],
    note: "R5 — every legal candidate ranked; the exact tie resolves to the smaller port key",
  },
  {
    name: "radius-overlay",
    id: `${STORY}--radius-and-toggle`,
    w: 780,
    h: 470,
    node: "src",
    path: [[40, 0], [140, 0], [200, 0]],
    note: "R1 — the two magnet circles drawn: only `big` (120u) reaches the parked port, `small` (40u) does not",
  },
  {
    name: "refusal",
    id: `${STORY}--refusal-preview`,
    w: 780,
    h: 450,
    node: "src",
    path: [[40, 0], [100, 0], [140, 0]],
    note: "R2 — in range and type-correct, but `many-to-one` from the landed validateConnection: no proposal, and the reason is stamped",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 2 });
    let ok = false;
    let facts = null;
    let error = null;
    try {
      await page.goto(`${BASE}?id=${shot.id}&viewMode=story`, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="magnet-bench"]', { timeout: 15000 });
      // The story's own play function AUTOPLAYS on load, and several of
      // them finish with the node committed somewhere else (and one with
      // magnets switched off). Reloading just replays it, so the only way
      // back to the resting bench is the bench's own Reset control — which
      // this script's first run is what forced into existence, after it
      // photographed four empty canvases.
      await sleep(2500);
      await page.click('[data-testid="magnet-reset"]');
      await sleep(250);

      const header = page.locator(`[data-node-id="${shot.node}"] [data-slot="block-header"]`).first();
      const box = await header.boundingBox();
      if (!box) throw new Error(`no header box for ${shot.node}`);
      const x0 = Math.round(box.x + box.width / 2);
      const y0 = Math.round(box.y + box.height / 2);
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (const [dx, dy] of shot.path) {
        await page.mouse.move(x0 + dx, y0 + dy);
        await sleep(90);
      }
      // Read the DOM at the exact moment of capture — pointer still down.
      facts = await page.evaluate(() => {
        const layer = document.querySelector('[data-slot="magnet-layer"]');
        const gs = [...document.querySelectorAll("[data-magnet-proposal]")];
        return {
          enabled: layer?.getAttribute("data-magnet-enabled") ?? null,
          proposals: layer?.getAttribute("data-magnet-proposals") ?? null,
          refusals: layer?.getAttribute("data-magnet-refusals") ?? null,
          drawn: gs.map((g) => ({
            to: g.getAttribute("data-magnet-to"),
            from: g.getAttribute("data-magnet-from"),
            distance: g.getAttribute("data-magnet-distance"),
            fromAt: g.getAttribute("data-magnet-from-at"),
            toAt: g.getAttribute("data-magnet-to-at"),
            dash: getComputedStyle(g.querySelector('[data-slot="trace"] path')).strokeDasharray,
          })),
        };
      });
      await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
      await page.mouse.up();
      ok = true;
    } catch (cause) {
      error = String(cause);
    }
    results.push({ ...shot, ok, facts, error });
    console.log(`${ok ? "ok  " : "FAIL"} ${shot.name} ${ok ? JSON.stringify(facts) : error}`);
    await page.close();
  }
  await browser.close();
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(results, null, 2)}\n`);
  if (results.some((r) => !r.ok)) process.exit(1);
};

run();
