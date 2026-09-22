// Capture the REAL rebuilt Settings panel — the shipping component rendering
// the real `buildSettingsCategories` data — at real window sizes, and assert
// the two claims a story in this repo's vitest frame cannot make.
//
//   node docs/capture_settings_panel_real.mjs <storybook-url> <outdir>
//
// WHY this exists beside the play functions rather than instead of them: the
// vitest browser frame is a fixed 1200x900 and does not re-resolve
// viewport-relative sizes after a class change on a live node (measured
// 2026-09-22 — a popup whose className already said `w-screen` kept reporting
// the outgoing dialog's 1040px). Two claims therefore have to be made in a
// real browser at a real window size:
//
//   1. at 1366x720 the dialog is 1040x656, i.e. the height rule SHRINKS it
//      rather than letting a 720px dialog run off a 720px screen;
//   2. switching presentation dialog -> page on an OPEN panel re-presents it
//      at the full window.
//
// Both are asserted here, so they are checked on every capture run rather than
// being claimed in prose.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");

const [url, outdir] = process.argv.slice(2);
if (!url || !outdir) {
  console.error("usage: node docs/capture_settings_panel_real.mjs <storybook-url> <outdir>");
  process.exit(1);
}
mkdirSync(outdir, { recursive: true });

// The story that mounts the REAL five categories + the host's About, through
// `buildSettingsCategories`, with the app's own `searchable` configuration.
const STORY = "editor-panels-dialogs-settingscategories--all-five-categories";
const browser = await chromium.launch();
const results = [];
const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
  console.log(`${cond ? "OK  " : "FAIL"} ${message}`);
}

async function open(width, height, colorScheme) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${url}/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-slot="settings-view"]', { timeout: 25000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

const measure = (page) =>
  page.evaluate(() => {
    const popup = document.querySelector('[data-slot="settings-view"]');
    const pane = document.querySelector('[data-slot="settings-pane"]');
    const viewport = pane.closest('[data-slot="scroll-area"]').querySelector('[data-slot="scroll-area-viewport"]');
    const nav = document.querySelector('[data-slot="settings-sidebar"]');
    const rows = Array.from(document.querySelectorAll('[data-slot="settings-nav"] button[data-slot="button"]'));
    const r = popup.getBoundingClientRect();
    return {
      viewport: { w: innerWidth, h: innerHeight },
      popup: { w: Math.round(r.width), h: Math.round(r.height) },
      popupInsideWindow: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      paneOverflowX: getComputedStyle(viewport).overflowX,
      hOverflow: viewport.scrollWidth - viewport.clientWidth,
      scrollbarGutter: viewport.offsetWidth - viewport.clientWidth,
      contentTaller: viewport.scrollHeight > viewport.clientHeight,
      navW: Math.round(nav.getBoundingClientRect().width),
      navRows: rows.length,
      navIcons: rows.filter((b) => b.querySelector("svg")).length,
      navGroups: Array.from(document.querySelectorAll('[data-slot="settings-nav-group"]')).map((g) => g.textContent),
      hasSearch: !!document.querySelector('[data-slot="settings-search-input"]'),
      // Is the row horizontal where it should be?
      horizontalRows: Array.from(document.querySelectorAll('[data-slot="settings-section"]')).filter((s) =>
        s.querySelector('[data-slot="field"][data-orientation="horizontal"]'),
      ).length,
      sections: document.querySelectorAll('[data-slot="settings-section"]').length,
    };
  });

// ── the size/theme grid, on the category from Zach's own screenshot ────────
for (const [w, h] of [[1280, 800], [1366, 720]]) {
  for (const scheme of ["dark", "light"]) {
    const { ctx, page, errors } = await open(w, h, scheme);
    await page.click('[data-slot="settings-nav"] button:has-text("Mouse and scrolling")');
    await page.waitForTimeout(400);
    const m = await measure(page);
    const name = `real-${w}x${h}-${scheme}`;
    await page.screenshot({ path: path.join(outdir, `${name}.png`) });

    const expectH = Math.min(720, h - 64);
    check(m.popup.w === Math.min(1040, w - 64), `${name}: width ${m.popup.w} === min(1040, ${w}-64)`);
    check(m.popup.h === expectH, `${name}: height ${m.popup.h} === min(720, ${h}-64)`);
    check(m.popupInsideWindow, `${name}: popup fits inside the window`);
    check(m.paneOverflowX === "hidden", `${name}: pane overflow-x is hidden (got ${m.paneOverflowX})`);
    check(m.hOverflow === 0, `${name}: zero horizontal overflow (got ${m.hOverflow})`);
    check(m.scrollbarGutter === 0, `${name}: scrollbar is overlaid, no layout gutter`);
    check(m.navRows === 6 && m.navIcons === 6, `${name}: ${m.navIcons}/${m.navRows} nav rows have an icon`);
    check(m.hasSearch, `${name}: the search box is mounted`);
    check(errors.length === 0, `${name}: no console errors${errors.length ? ` (${errors[0]})` : ""}`);
    results.push({ name, ...m, errors });
    await ctx.close();
  }
}

// ── Connections: the stress case, nine switches with long descriptions ─────
{
  const { ctx, page } = await open(1280, 800, "dark");
  await page.click('[data-slot="settings-nav"] button:has-text("Connections")');
  await page.waitForTimeout(400);
  const m = await measure(page);
  await page.screenshot({ path: path.join(outdir, "real-connections-1280x800-dark.png") });
  check(m.hOverflow === 0, `connections: zero horizontal overflow`);
  check(m.horizontalRows >= 8, `connections: ${m.horizontalRows} rows put the control beside the name`);
  check(m.contentTaller, `connections: content is taller than the pane, so the scrollbar is real`);
  results.push({ name: "real-connections", ...m });
  await ctx.close();
}

// ── search active ─────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(1280, 800, "dark");
  await page.click('[data-slot="settings-search-input"]');
  await page.keyboard.type("wheel");
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-slot="settings-nav"] button[data-slot="button"]'));
    return {
      navRows: rows.map((r) => r.textContent),
      counts: Array.from(document.querySelectorAll('[data-slot="settings-nav-count"]')).map((c) => c.textContent),
      marks: Array.from(document.querySelectorAll('[data-slot="settings-match"]')).map((mk) => mk.textContent),
      markWidths: Array.from(document.querySelectorAll('[data-slot="settings-match"]')).map((mk) =>
        Math.round(mk.getBoundingClientRect().width),
      ),
      sections: document.querySelectorAll('[data-slot="settings-section"]').length,
    };
  });
  await page.screenshot({ path: path.join(outdir, "real-search-wheel-1280x800-dark.png") });
  check(m.navRows.length === 1, `search "wheel": ${m.navRows.length} category left in the nav`);
  check(m.counts.length === 1 && Number(m.counts[0]) > 0, `search "wheel": live count ${m.counts[0]}`);
  check(m.marks.length > 0 && m.markWidths.every((x) => x > 0), `search "wheel": ${m.marks.length} visible highlights`);
  results.push({ name: "real-search", ...m });
  await ctx.close();
}

// ── the two claims the vitest frame cannot make ───────────────────────────
{
  const { ctx, page } = await open(1280, 800, "dark");
  await page.click('[data-slot="settings-nav"] button:has-text("General")');
  await page.waitForSelector('[data-section-id="settings-presentation"]', { timeout: 10000 });
  await page.waitForTimeout(300);
  const before = await measure(page);
  await page.click('[data-section-id="settings-presentation"] [role="radio"][data-option-value="page"]');
  await page.waitForTimeout(700);
  const after = await measure(page);
  await page.screenshot({ path: path.join(outdir, "real-page-presentation-1280x800-dark.png") });
  check(before.popup.w === 1040 && before.popup.h === 720, `switch: starts at 1040x720 (got ${before.popup.w}x${before.popup.h})`);
  check(
    after.popup.w === 1280 && after.popup.h === 800,
    `switch: dialog -> page fills the window (got ${after.popup.w}x${after.popup.h})`,
  );
  check(after.hOverflow === 0, `switch: page presentation still never scrolls sideways`);
  results.push({ name: "real-presentation-switch", before, after });
  await ctx.close();
}

await browser.close();
writeFileSync(path.join(outdir, "real-checks.json"), JSON.stringify({ results, failures }, null, 2));
console.log(`\n${failures.length ? `${failures.length} CHECK(S) FAILED` : "all checks passed"}`);
if (failures.length) process.exit(1);
