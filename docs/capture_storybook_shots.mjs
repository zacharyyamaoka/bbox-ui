#!/usr/bin/env node
/**
 * Capture real Storybook story frames as PNGs, for embedding in a report.
 *
 * WHY a script and not ad-hoc browser screenshots: a report's captures have
 * to be re-takeable after the stories change, at a known size, cropped to
 * the story rather than to whatever the reviewer's window happened to be.
 * Ad-hoc shots drift the moment anything moves, and a report whose evidence
 * cannot be regenerated stops being evidence.
 *
 * Hits the story's own `iframe.html` URL directly, so no Storybook chrome
 * (sidebar, addon panel) lands in the frame — the component is the subject.
 *
 *   node docs/capture_storybook_shots.mjs [--port 5421] [--out reports/media/shots]
 *   node docs/capture_storybook_shots.mjs --port 5463 --out DIR --shots shots.json
 *
 * `--shots <file>` (added for docs/build_lane_report.py, 2026-09-17): a JSON
 * file holding an array shaped like SHOTS below, REPLACING it for this run.
 * Every other lane report needs its OWN story list against its OWN
 * STORYBOOK_PORT, never against :5421 or against this file's hardcoded set
 * — without this flag a lane could only ever recapture what this script
 * already knew about. Omit it and behaviour is unchanged: this file's own
 * SHOTS list, as every existing caller already assumes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// WHY createRequire and not a bare `import "playwright"`: ESM resolves a
// bare specifier from the SCRIPT's directory, and `docs/` has no
// node_modules — playwright lives in the workspace that actually tests with
// it. Resolving from `apps/storybook-basics` keeps the script in docs/ (the
// repo's convention for report builders) without vendoring a dependency
// there or forcing a cwd.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = argOf("--port", "5421");
const OUT = path.resolve(argOf("--out", "reports/media/shots"));
const BASE = `http://localhost:${PORT}/iframe.html`;

/** id → the story's Storybook id, plus the viewport it reads best at. */
const SHOTS = [
  { id: "blocks-blockwiring--wiring-scenarios", w: 1200, h: 900, name: "wiring" },
  { id: "blocks-asyncregion--communication-patterns", w: 1250, h: 900, name: "async" },
  { id: "blocks-blockport--four-edges", w: 760, h: 620, name: "fouredges" },
  { id: "ports-portedge--edge-distribution-controls", w: 760, h: 900, name: "distribution" },
  { id: "trace-tidy--tidy-direction-matrix", w: 1250, h: 900, name: "tidymatrix" },
  { id: "trace-interactive--straight-with-bends", w: 900, h: 420, name: "trace-interactive" },
  { id: "trace-interactive--many-bends", w: 900, h: 420, name: "trace-many-bends" },
  { id: "trace-polarity--routing-kinds", w: 1000, h: 700, name: "trace-routing-kinds" },
  { id: "trace-tidy--tidy-shared-corridor", w: 1100, h: 700, name: "trace-tidy" },
  { id: "blocks-block-layouts--simple-view", w: 1150, h: 480, name: "block-layouts-simple" },
  { id: "blocks-block-layouts--behaviour-tree-nodes", w: 1100, h: 520, name: "block-layouts-bt" },
  { id: "blocks-block-layouts--header-sizes", w: 1100, h: 400, name: "block-layouts-headers" },
  { id: "blocks-block--show-cards-and-members", w: 900, h: 560, name: "card-overlay" },
  { id: "ports-portedge--around-a-box", w: 900, h: 620, name: "portedge-around" },
  { id: "blocks-blockport--function-port", w: 760, h: 440, name: "blockport-function" },
  { id: "basics-codeeditor--syntax-themes", w: 1000, h: 560, name: "code-themes" },
  { id: "basics-editabletext--placeholder", w: 760, h: 380, name: "editable-placeholder" },
  { id: "presets-value--literals", w: 1000, h: 420, name: "value-literals" },
  { id: "presets-value--pill-geometry", w: 1100, h: 380, name: "value-pill-geometry" },
  { id: "presets-value--collapsed-vs-expanded", w: 1000, h: 480, name: "value-collapsed-expanded" },
  { id: "presets-value--wired", w: 1250, h: 900, name: "value-wired" },
  { id: "presets-value--editing", w: 760, h: 380, name: "value-editing" },
];

const shotsFile = argOf("--shots", null);
const shots = shotsFile ? JSON.parse(await readFile(path.resolve(shotsFile), "utf8")) : SHOTS;

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const manifest = [];

for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.w, height: shot.h },
    deviceScaleFactor: 2, // retina — the report is read on a high-dpi screen
    colorScheme: "dark",
  });
  const url = `${BASE}?id=${shot.id}&viewMode=story`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // Storybook mounts asynchronously; #storybook-root having children is
    // the honest "the story rendered" signal, not a fixed sleep.
    await page.waitForFunction(
      () => (document.querySelector("#storybook-root")?.childElementCount ?? 0) > 0,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(450); // fonts + any layout effect settling
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
if (failed.length) {
  console.log("failed:", failed.map((f) => f.name).join(", "));
  process.exitCode = 1;
}
