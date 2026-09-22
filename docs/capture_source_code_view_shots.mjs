#!/usr/bin/env node
/**
 * Capture the SHIPPED parts a source-code view would be built out of.
 *
 * The five proposals in `docs/build_source_code_view_report.py` are for
 * something that does not exist yet, so most of that report is rendered
 * mocks. These captures are the other half: the pieces that already run, so
 * a claim like "collapse/dissolve is already an exact inverse" is a
 * screenshot of the real story rather than a sentence.
 *
 * Reads Zach's long-running Storybook on :5421 — read-only, nothing is
 * started or stopped here. Element-cropped to `#storybook-root` so the frame
 * is the story and not the window.
 *
 *   node docs/capture_source_code_view_shots.mjs [--port 5421] [--out reports/media/shots-source-code-view]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve playwright from the workspace that actually depends on it — see the
// same note in docs/capture_storybook_shots.mjs. This worktree may have no
// node_modules, so fall back to the main checkout's copy.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
let require;
try {
  require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
  require.resolve("playwright");
} catch {
  require = createRequire("/home/bam/bbox-ui/apps/storybook-basics/package.json");
}
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = argOf("--port", "5421");
const OUT = path.resolve(argOf("--out", "reports/media/shots-source-code-view"));
const BASE = `http://localhost:${PORT}/iframe.html`;

const SHOTS = [
  // The code cell itself — already a component in the trunk.
  { id: "components-text-marks-codeeditor--pseudo-code", w: 900, h: 460, name: "code-cell" },
  { id: "components-text-marks-codeeditor--syntax-themes", w: 1000, h: 620, name: "code-themes" },
  // A code cell living inside a Block — the P1 shape, already rendered.
  { id: "components-blocks-block--code-inside-block", w: 820, h: 560, name: "code-in-block" },
  // A code cell as a real canvas node, in a host.
  { id: "components-text-marks-codeeditor-in-a-host--code-react-flow", w: 900, h: 560, name: "code-reactflow" },
  // Collapse/dissolve — the exact inverse P1 rides on.
  { id: "scene-layout-drag-grouping--round-trip", w: 1150, h: 760, name: "grouping-roundtrip" },
  { id: "scene-layout-drag-grouping--promoted-ports", w: 1100, h: 700, name: "grouping-ports" },
  { id: "scene-layout-drag-grouping--boundary-classes", w: 1100, h: 700, name: "grouping-boundary" },
  // The diff surfaces a two-buffer design needs for its conflict view.
  { id: "scene-model-diff-scenediff--line-diff-code", w: 900, h: 560, name: "line-diff" },
  { id: "scene-model-diff-scenediff--word-diff-ink", w: 900, h: 460, name: "word-diff" },
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const manifest = [];

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.w, height: shot.h },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const url = `${BASE}?id=${shot.id}&viewMode=story`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(
      () => (document.querySelector("#storybook-root")?.childElementCount ?? 0) > 0,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(500);
    const file = path.join(OUT, `${shot.name}.png`);
    // Crop to the story, not the viewport — a report frame should be the
    // component, with no accidental empty page around it.
    const root = await page.$("#storybook-root");
    await (root ?? page).screenshot({ path: file });
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
