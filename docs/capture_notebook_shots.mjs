#!/usr/bin/env node
/**
 * Capture the real trunk components a canvas notebook cell would be built
 * from, for the "Jupyter on a canvas" proposals report.
 *
 * Same contract as docs/capture_storybook_shots.mjs (which this copies its
 * playwright-resolution trick and its render gate from) — hits iframe.html
 * so no Storybook chrome lands in the frame, and waits on #storybook-root
 * having children rather than on a fixed sleep.
 *
 * Light colour scheme on purpose: the report's palette is light, and
 * Zach's own Jupyter reference screenshot next to these is light too, so a
 * dark capture would read as a different product rather than the same one.
 *
 *   node docs/capture_notebook_shots.mjs [--port 5421]
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
const PORT = argOf("--port", "5421");
const OUT = path.resolve(argOf("--out", "reports/media/shots-notebook"));
const BASE = `http://localhost:${PORT}/iframe.html`;

const SHOTS = [
  { id: "basics-codeeditor--multi-line", w: 720, h: 320, name: "code-multiline" },
  { id: "blocks-block--code-inside-block", w: 900, h: 560, name: "code-in-block" },
  { id: "basics-codeeditor-in-a-host--code-dom-canvas", w: 1000, h: 620, name: "code-on-canvas" },
  { id: "basics-codeeditor--gallery", w: 1000, h: 640, name: "code-gallery" },
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const manifest = [];

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.w, height: shot.h },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  try {
    await page.goto(`${BASE}?id=${shot.id}&viewMode=story`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(
      () => (document.querySelector("#storybook-root")?.childElementCount ?? 0) > 0,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(500);
    const file = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file });
    manifest.push({ ...shot, file, ok: true });
    console.log(`ok   ${shot.name}  <- ${shot.id}`);
  } catch (error) {
    manifest.push({ ...shot, ok: false, error: String(error).split("\n")[0] });
    console.log(`FAIL ${shot.name}  <- ${shot.id}  (${String(error).split("\n")[0]})`);
  } finally {
    await page.close();
  }
}

await browser.close();
await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
const failed = manifest.filter((m) => !m.ok);
console.log(`\n${manifest.length - failed.length}/${manifest.length} captured -> ${OUT}`);
if (failed.length) process.exitCode = 1;
