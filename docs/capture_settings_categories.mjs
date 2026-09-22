#!/usr/bin/env node
/**
 * Capture each ported Settings category as a PNG.
 *
 * WHY this and not `docs/capture_storybook_shots.mjs`: that script shoots a
 * story at REST, and every settings category lives behind a click on the left
 * nav of the SAME story. Shooting the settings story five times would produce
 * five copies of General. This one drives the nav, exactly as a reviewer
 * would, and waits for the section pane to change before each shot.
 *
 *   node docs/capture_settings_categories.mjs --port 5507 --out reports/media/settings-pages
 *
 * Point `--port` at a Storybook you started yourself on a FREE port. Never
 * :5421 — that is the long-running one Zach reviews.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Same reason as the sibling script's own header: `docs/` has no
// node_modules, so playwright is resolved from the workspace that tests with
// it rather than vendored here.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = argOf("--port", "5507");
const OUT = path.resolve(repoRoot, argOf("--out", "reports/media/settings-pages"));
const BASE = `http://localhost:${PORT}/iframe.html`;

const DIALOG_STORY = "components-panels-dialogs-settingscategories--all-five-categories";
const PAGE_STORY = "components-panels-dialogs-settingscategories--as-a-page";

/** Zach's five, in his order, plus the About this app already had. */
const CATEGORIES = [
  { label: "General", name: "01-general" },
  { label: "Appearance", name: "02-appearance" },
  { label: "Mouse and scrolling", name: "03-mouse-and-scrolling" },
  { label: "Connections", name: "04-connections" },
  { label: "Hotkeys and aliases", name: "05-hotkeys-and-aliases" },
  { label: "About", name: "06-about" },
];

async function settingsPopup(page) {
  const popup = page.locator('[data-slot="settings-view"]');
  await popup.waitFor({ state: "visible", timeout: 20000 });
  return popup;
}

async function openCategory(page, label) {
  await page.locator(`[data-slot="settings-nav"] button:text-is("${label}")`).click();
  // The nav marks the open category — wait for THAT rather than a sleep, so a
  // slow frame cannot produce a capture of the previous category.
  await page.locator(`[data-slot="settings-nav"] [aria-current="page"]:text-is("${label}")`).waitFor({ timeout: 10000 });
  await page.waitForTimeout(150);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const written = [];

  // A desktop frame: the settings dialog is `sm:max-w-lg`, so a phone-width
  // viewport would capture the narrow fallback rather than what Zach sees.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto(`${BASE}?id=${DIALOG_STORY}&viewMode=story`, { waitUntil: "load" });
  const popup = await settingsPopup(page);
  for (const category of CATEGORIES) {
    await openCategory(page, category.label);
    const file = path.join(OUT, `${category.name}.png`);
    await popup.screenshot({ path: file });
    written.push(file);
  }

  // The same categories as a full-window page — the other half of the
  // presentation contract.
  //
  // WHY the presentation is switched HERE rather than by shooting the
  // `AsAPage` story: Storybook runs a story's play function on direct
  // navigation, and that story's play deliberately ends by switching BACK to
  // a dialog (it proves the round trip). Shooting it produced a capture
  // labelled "as a page" showing a centred dialog — a caption that lies about
  // its own evidence. Flipping the real radio is what a reviewer would do.
  await page.goto(`${BASE}?id=${PAGE_STORY}&viewMode=story`, { waitUntil: "load" });
  await settingsPopup(page);
  await openCategory(page, "General");
  await page
    .locator('[data-slot="settings-section"][data-section-id="settings-presentation"] [role="radio"][data-option-value="page"]')
    .click();
  await page.locator('[data-slot="settings-view"][data-presentation="page"]').waitFor({ timeout: 10000 });
  await openCategory(page, "Connections");
  const pageFile = path.join(OUT, "07-connections-as-a-page.png");
  await page.screenshot({ path: pageFile });
  written.push(pageFile);

  await browser.close();
  for (const file of written) console.log(file);
}

await main();
