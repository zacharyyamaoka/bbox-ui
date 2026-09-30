#!/usr/bin/env node
/**
 * Thumbnail every artifact the visual-language MOC indexes.
 *
 *   node docs/capture_visual_language_moc_shots.mjs --out DIR
 *
 * Each artifact is opened at its real file:// path in headless chromium and
 * screenshotted at the top of the page. A missing path FAILS the run rather
 * than quietly producing a MOC that links somewhere that is not there.
 *
 * WHY a picture of a report and not just its title: the corpus is 38 documents
 * spread over four trees with names like "many-to-one-2026-09-02.html". Zach
 * recognises these by their shape — the grid of glyphs, the five-board babble,
 * the screenshot wall — not by the slug. The thumbnail is the index key.
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// An isolated lane worktree has no node_modules; resolve playwright from the
// main checkout rather than paying a pnpm install for one screenshot pass.
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const requirePw = () => {
  try { return require("playwright"); }
  catch { return createRequire("/home/bam/bbox-ui/apps/storybook-basics/package.json")("playwright"); }
};
const { chromium } = requirePw();

const args = process.argv.slice(2);
const OUT = path.resolve(args[args.indexOf("--out") + 1] ?? "/tmp/vl-moc-shots");
const MANIFEST = JSON.parse(process.env.VL_MOC_MANIFEST ?? "[]");

const missing = [];
for (const item of MANIFEST) {
  try { await access(item.path); } catch { missing.push(item.path); }
  if (item.shotpath) { try { await access(item.shotpath); } catch { missing.push(item.shotpath); } }
}
if (missing.length) {
  console.error("MISSING ARTIFACTS — refusing to build:\n" + missing.join("\n"));
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const item of MANIFEST) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const target = item.shotpath ?? item.path;
  const file = "file://" + target.split("/").map(encodeURIComponent).join("/");
  try {
    await page.goto(file, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(item.slow ? 2500 : 900);
    const out = path.join(OUT, item.key + ".png");
    await page.screenshot({ path: out });
    results.push({ key: item.key, shot: out });
    console.log("ok   " + item.key);
  } catch (err) {
    console.log("FAIL " + item.key + " — " + err.message.split("\n")[0]);
    results.push({ key: item.key, shot: null });
  }
  await ctx.close();
}
await browser.close();
await writeFile(path.join(OUT, "_shots.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.shot).length}/${results.length} captured -> ${OUT}`);
