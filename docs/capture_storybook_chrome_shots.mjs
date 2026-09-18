#!/usr/bin/env node
/**
 * Capture full-app Storybook screenshots — CHROME INCLUDED (sidebar, the
 * tag-filter menu) — as PNGs for a lane report.
 *
 * WHY this is a separate script from docs/capture_storybook_shots.mjs: that
 * one hits the story's own `iframe.html` URL specifically so "no Storybook
 * chrome (sidebar, addon panel) lands in the frame — the component is the
 * subject." This script exists for the opposite case: a lane whose subject
 * IS the chrome (here: the sidebar's tag-filter dropdown, added 2026-09-17
 * so each lane's delivered work is findable by its own `lane:<slug>` tag —
 * see CLAUDE.md's "Story tags" section). Loads the full app shell at `/`
 * (or a given path), optionally drives a short sequence of clicks first
 * (open the filter menu, toggle a checkbox), then screenshots the whole
 * viewport.
 *
 * A step is `{ "click": "<accessible name or aria-label substring>" }` or
 * `{ "shot": "<name>" }`. Steps run in order against ONE page/session per
 * shots file, so "open the menu" -> "shot: menu-open" -> "click a
 * checkbox" -> "shot: filtered" is a single script, not independent pages —
 * that is what lets a "before" and "after" pair be regenerated from a
 * one-line description of the click path instead of hand-narrated.
 *
 *   node docs/capture_storybook_chrome_shots.mjs --port 5493 --out DIR --steps steps.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const PORT = argOf("--port", "5421");
const OUT = path.resolve(argOf("--out", "reports/media/chrome-shots"));
const STEPS_FILE = argOf("--steps", null);
const START_PATH = argOf("--path", "/");
const WIDTH = Number(argOf("--width", "1280"));
const HEIGHT = Number(argOf("--height", "720"));

if (!STEPS_FILE) throw new Error("--steps <file.json> is required");
const steps = JSON.parse(await readFile(path.resolve(STEPS_FILE), "utf8"));

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const manifest = [];
await page.goto(`http://localhost:${PORT}${START_PATH}`, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(600); // sidebar tree + fonts settling

for (const step of steps) {
  try {
    if (step.click) {
      // Tries every accessible-name-based way Playwright has to find a
      // control (button, checkbox, then label text) rather than one
      // role — the tag-filter dialog mixes real <button>s with
      // <label><input type=checkbox>` rows, and a hand-built CSS
      // selector string is the wrong tool for a name containing `:`.
      const candidates = [
        () => page.getByRole("checkbox", { name: step.click }),
        () => page.getByRole("button", { name: step.click }),
        () => page.getByLabel(step.click),
        () => page.getByText(step.click, { exact: false }),
      ];
      let clicked = false;
      for (const make of candidates) {
        try {
          await make().first().click({ timeout: 3000 });
          clicked = true;
          break;
        } catch {
          // try the next strategy
        }
      }
      if (!clicked) throw new Error(`no clickable element matched "${step.click}"`);
      await page.waitForTimeout(300);
      manifest.push({ step: "click", target: step.click, ok: true });
    } else if (step.shot) {
      const file = path.join(OUT, `${step.shot}.png`);
      await page.screenshot({ path: file });
      manifest.push({ step: "shot", name: step.shot, file, ok: true });
      console.log(`ok   shot ${step.shot}`);
    } else if (step.wait_ms) {
      await page.waitForTimeout(step.wait_ms);
    }
  } catch (error) {
    manifest.push({ step: JSON.stringify(step), ok: false, error: String(error).split("\n")[0] });
    console.log(`FAIL ${JSON.stringify(step)} (${String(error).split("\n")[0]})`);
  }
}

await browser.close();
await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
const failed = manifest.filter((m) => !m.ok);
console.log(`\n${manifest.length - failed.length}/${manifest.length} steps ok -> ${OUT}`);
if (failed.length) process.exitCode = 1;
