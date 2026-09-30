#!/usr/bin/env node
/**
 * Capture the menu kit's own story galleries, for the review report.
 *
 * Same reasoning as capture_storybook_shots.mjs: a report's evidence has to be
 * re-takeable at a known size after the stories change. Ad-hoc screenshots
 * drift the moment anything moves, and evidence that cannot be regenerated
 * stops being evidence.
 *
 * Hits each story's `iframe.html` directly so no Storybook chrome lands in the
 * frame — the component is the subject.
 *
 *   node docs/capture_menu_kit_shots.mjs --port 5431 --out reports/media/menu-kit-shots
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fb) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fb; };
const PORT = argOf("--port", "5431");
const OUT = path.resolve(argOf("--out", "reports/media/menu-kit-shots"));
const BASE = `http://localhost:${PORT}/iframe.html`;

// `surface` ties a shot back to the screenshot it reproduces, so the report can
// put the SystemSketch original and the bbox-ui rebuild side by side.
const SHOTS = [
  { name: "control-strip-layouts", id: "editor-menus-bars-controlstrip--layout-gallery", w: 1180, h: 900, surface: "01" },
  { name: "control-strip-fill", id: "editor-menus-bars-controlstrip--fill-popover", w: 900, h: 640, surface: "01" },
  { name: "control-strip-triggers", id: "editor-menus-bars-controlstrip--trigger-gallery", w: 1100, h: 560, surface: "01" },
  { name: "control-strip-fontsize", id: "editor-menus-bars-controlstrip--font-size-list", w: 820, h: 620, surface: "03" },
  // Surface 02 had no capture at all until now — the story existed and the
  // report still illustrated that screenshot with nothing.
  { name: "block-title-bar", id: "editor-menus-bars-controlstrip--block-title-bar", w: 900, h: 260, surface: "02" },
  { name: "screenshot-one-pill", id: "editor-menus-bars-floatingtoolbar--screenshot-one-pill", w: 900, h: 300, surface: "01" },
  { name: "control-strip-mixed", id: "editor-menus-bars-controlstrip--mixed-and-automatic-states", w: 1000, h: 480, surface: "01" },
  { name: "control-lab", id: "editor-menus-bars-controllab--lab", w: 1320, h: 1000, surface: "01" },
  { name: "floating-toolbar", id: "editor-menus-bars-floatingtoolbar--gallery", w: 1240, h: 900, surface: "01" },
  // WHY ScreenshotOrder and not Default: `Default` renders every simple tool
  // before every family, which is NOT the order screenshot 04 draws. The
  // report was illustrating surface 04 with a picture that contradicted it.
  { name: "tool-dock", id: "editor-menus-bars-tooldock--screenshot-order", w: 900, h: 340, surface: "04" },
  // The popout LEFT OPEN — `family-popouts-expanded` closes each menu after
  // checking it, so pointing the camera there photographed a closed dock.
  { name: "tool-dock-popouts", id: "editor-menus-bars-tooldock--popout-open-for-capture", w: 1100, h: 700, surface: "04" },
  { name: "chrome-bar", id: "editor-menus-bars-chromebar--main-branch-at-root", w: 1100, h: 340, surface: "05" },
  { name: "chrome-bar-tones", id: "editor-menus-bars-chromebar--status-tones", w: 1100, h: 560, surface: "05" },
  { name: "chrome-bar-drafts", id: "editor-menus-bars-chromebar--branch-chip-main-vs-draft-mode", w: 1100, h: 500, surface: "05" },
  { name: "panel-shell", id: "editor-panels-dialogs-panelshell--right-panels", w: 1180, h: 820, surface: "06" },
  { name: "frames-panel", id: "editor-panels-dialogs-framespanel--default", w: 760, h: 960, surface: "06" },
  { name: "problems-panel", id: "editor-panels-dialogs-problemspanel--default", w: 760, h: 900, surface: "07" },
  { name: "problems-filter", id: "editor-panels-dialogs-problemspanel--filter-by-severity", w: 820, h: 760, surface: "07" },
  { name: "status-strip", id: "editor-menus-bars-statusstrip--indicators-and-badges", w: 900, h: 340, surface: "07" },
  { name: "compare-review", id: "editor-panels-dialogs-comparereview--side-by-side-vs-overlay", w: 1760, h: 950, surface: "08" },
  { name: "compare-states", id: "editor-panels-dialogs-comparereview--no-snapshot-loaded", w: 1760, h: 820, surface: "08" },
  { name: "property-table", id: "editor-panels-dialogs-propertytable--flat-table-word-diff-toggle", w: 1100, h: 760, surface: "08" },
  { name: "history-list", id: "editor-panels-dialogs-historylist--tone-and-density-reference", w: 900, h: 700, surface: "08" },
  { name: "draft-bar", id: "editor-panels-dialogs-draftbar--all-states", w: 1200, h: 620, surface: "09" },
  { name: "split-button", id: "editor-menus-bars-splitbutton--all-states", w: 900, h: 420, surface: "09" },
  { name: "inline-rename", id: "components-text-marks-inlinerename--sizes", w: 820, h: 420, surface: "05" },
];

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const manifest = [];

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.w, height: shot.h },
    deviceScaleFactor: 2, // retina — the report is read on a high-dpi screen
    colorScheme: "dark",
  });
  const url = `${BASE}?id=${shot.id}&viewMode=story`;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(
      () => { const r = document.querySelector("#storybook-root"); return r && r.children.length > 0; },
      { timeout: 20_000 },
    );
    await page.waitForTimeout(500);
    const file = path.join(OUT, `${shot.name}.png`);
    // WHY a measured union of the root's CHILDREN and not `root.screenshot()`:
    // #storybook-root is a block element, so it is as tall as the viewport
    // whatever it contains — clipping to it dragged a huge band of dead
    // background into every shot. Measuring the children's union gives the
    // real ink extent. Popovers portal to <body>, so those are measured too,
    // and the result is clamped back inside the viewport because a clip
    // rectangle that escapes it makes Playwright throw.
    const box = await page.evaluate(() => {
      // WHY every top-level body child and not a portal SELECTOR: an open
      // popover is portaled out of #storybook-root, and guessing the portal's
      // markup got it wrong — Base UI's wrapper matched neither
      // [role=presentation] nor [data-base-ui-portal], so the fill-popover
      // shot clipped to the bare strip and cut the popover off entirely.
      // Measuring whatever is actually in <body> cannot be wrong about that.
      // #storybook-root itself is skipped (it is always viewport-tall however
      // little it holds, which is the reason this measuring exists at all) in
      // favour of its children.
      // Union over every element that actually paints, anywhere in <body>.
      //
      // WHY not just body's top-level children: a portaled popover hangs off a
      // WRAPPER whose own box is 0x0, so a children-only pass skipped it and
      // the fill-popover shot clipped to the bare strip with the popover
      // sheared off. WHY not a portal selector either: guessing Base UI's
      // markup was what produced that wrapper miss in the first place.
      //
      // Full-viewport elements are excluded because they are layout scaffold,
      // not ink — #storybook-root is always viewport-tall however little it
      // holds, which is the whole reason this measurement exists.
      const nodes = [...document.body.querySelectorAll("*")].filter((n) => {
        if (/^sb-/.test(n.className || "")) return false;
        const q = n.getBoundingClientRect();
        if (q.width === 0 || q.height === 0) return false;
        // Viewport-TALL is the scaffold tell on its own: a story's ink is
        // never exactly as tall as the window, but every layout wrapper is.
        // Requiring full width too let a tall narrow wrapper through and
        // padded shots with several hundred px of dead background.
        if (q.height >= innerHeight * 0.98) return false;
        return q.width < innerWidth * 0.98 || q.height < innerHeight * 0.5;
      });
      if (!nodes.length) return null;
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const n of nodes) {
        const q = n.getBoundingClientRect();
        if (q.width === 0 || q.height === 0) continue;
        l = Math.min(l, q.left); t = Math.min(t, q.top);
        r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      }
      return Number.isFinite(l) ? { l, t, r, b, vw: innerWidth, vh: innerHeight } : null;
    });
    const PAD = 16;
    const clip = box && {
      x: Math.max(0, box.l - PAD),
      y: Math.max(0, box.t - PAD),
      width: Math.min(box.vw, box.r + PAD) - Math.max(0, box.l - PAD),
      height: Math.min(box.vh, box.b + PAD) - Math.max(0, box.t - PAD),
    };
    await page.screenshot({ path: file, ...(clip && clip.width > 0 && clip.height > 0 ? { clip } : {}) });
    manifest.push({ ...shot, file: path.relative(repoRoot, file) });
    console.log(`ok    ${shot.name}`);
  } catch (err) {
    console.log(`FAIL  ${shot.name}: ${String(err).split("\n")[0]}`);
  }
  await page.close();
}

await browser.close();

// WHY a non-zero exit on ANY miss, and why the manifest is written last:
// the loop above catches per-shot failures so one bad story cannot abort the
// run — which is right — but the script then exited 0 regardless. Point it
// at a dead port and it reported "0/26 captured", wrote an empty manifest,
// left every stale PNG in place, and succeeded. The old images stay on disk
// and keep being served as evidence of current behaviour, which is exactly
// how the dock shot came to show Text third for two rounds after that was
// fixed. A capture job that cannot fail is a capture job that silently
// preserves whatever was there before (judge fault injection, 2026-09-18).
if (manifest.length !== SHOTS.length) {
  const missing = SHOTS.filter((shot) => !manifest.some((entry) => entry.name === shot.name));
  console.error(
    `\nFAILED: ${manifest.length}/${SHOTS.length} captured. Missing: ${missing.map((s) => s.name).join(", ")}\n` +
      "Existing PNGs were left untouched and are now of UNKNOWN freshness — do not publish a report from them.",
  );
  process.exit(1);
}

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length}/${SHOTS.length} captured -> ${OUT}`);
