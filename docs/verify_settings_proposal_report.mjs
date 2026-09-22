// Render the proposal report headlessly and prove the things a build cannot:
// that the five mocks actually mounted, that they still respond to a click,
// that nothing overflows the page sideways at 390px, and that no media is blank.
//
//   node docs/verify_settings_proposal_report.mjs <report.html> <outdir>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");

const [report, outdir] = process.argv.slice(2);
if (!report || !outdir) { console.error("usage: <report.html> <outdir>"); process.exit(1); }
mkdirSync(outdir, { recursive: true });

const browser = await chromium.launch();
const problems = [];

for (const [name, width, height, scheme] of [
  ["desktop-dark", 1280, 1000, "dark"],
  ["desktop-light", 1280, 1000, "light"],
  ["mobile-dark", 390, 844, "dark"],
  ["mobile-light", 390, 844, "light"],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (c) => { if (c.type() === "error") errors.push(c.text()); });
  await page.goto("file://" + path.resolve(report), { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const m = await page.evaluate(() => {
    const mocks = Array.from(document.querySelectorAll("[data-mock]"));
    // Any element pushing the page sideways?
    const de = document.documentElement;
    const overflowers = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > de.clientWidth + 2) {
        overflowers.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60),
                           right: Math.round(r.right), limit: de.clientWidth });
      }
    }
    // Blank / missing media?
    const imgs = Array.from(document.querySelectorAll("img"));
    const badImgs = imgs.filter((i) => !i.complete || i.naturalWidth < 40 || i.naturalHeight < 40)
      .map((i) => ({ alt: i.alt, nw: i.naturalWidth, nh: i.naturalHeight }));
    return {
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      pageScrollsSideways: de.scrollWidth > de.clientWidth + 2,
      mockCount: mocks.length,
      mocksMounted: mocks.filter((m) => m.querySelector(".mk-pane")).length,
      mockRows: mocks.map((m) => m.querySelectorAll(".mk-row").length),
      mockNavIcons: mocks.map((m) => m.querySelectorAll(".mk-navbtn svg").length),
      imgCount: imgs.length, badImgs,
      overflowers: overflowers.slice(0, 6),
      fbStrips: document.querySelectorAll(".fb").length,
      dock: !!document.querySelector(".dock"),
      tables: document.querySelectorAll("table").length,
      annPins: document.querySelectorAll(".ann .pin").length,
    };
  });

  // Is a mock actually INTERACTIVE? Click a nav row in P1 and a switch, and
  // assert the DOM really changed. A mock that only looks right is a picture.
  let interactive = null;
  if (width > 800) {
    interactive = await page.evaluate(async () => {
      const root = document.querySelector('[data-mock="p1"]');
      if (!root) return { ok: false, why: "no p1" };
      const before = root.querySelector('.mk-navbtn[aria-current="page"]')?.textContent?.trim();
      const target = Array.from(root.querySelectorAll(".mk-navbtn"))
        .find((b) => /Connections/.test(b.textContent));
      target.click();
      await new Promise((r) => setTimeout(r, 120));
      const after = root.querySelector('.mk-navbtn[aria-current="page"]')?.textContent?.trim();
      const sw = root.querySelector('.mk-sw');
      const swBefore = sw?.getAttribute("aria-checked");
      sw?.click();
      await new Promise((r) => setTimeout(r, 120));
      const swAfter = root.querySelector('.mk-sw')?.getAttribute("aria-checked");
      // put it back
      target.parentElement.querySelector(".mk-navbtn").click();
      return { ok: before !== after && swBefore !== swAfter, before, after, swBefore, swAfter };
    });
  }

  await page.screenshot({ path: path.join(outdir, `report-${name}.png`), fullPage: false });
  if (width > 800) {
    // a few deep-scroll frames so I can look at the proposal bodies
    for (const [label, y] of [["baseline", 1200], ["p1", 3000], ["p3", 8200], ["p5", 14500], ["tables", 18000]]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(220);
      await page.screenshot({ path: path.join(outdir, `report-${name}-${label}.png`) });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  const bad = [];
  if (m.pageScrollsSideways) bad.push(`page scrolls sideways (${m.docScrollW} > ${m.docClientW})`);
  if (m.mockCount !== 5) bad.push(`expected 5 mocks, found ${m.mockCount}`);
  if (m.mocksMounted !== m.mockCount) bad.push(`${m.mockCount - m.mocksMounted} mocks did not mount`);
  if (m.mockNavIcons.some((n) => n !== 6)) bad.push(`nav icons per mock: ${m.mockNavIcons.join(",")} (want 6 each)`);
  if (m.badImgs.length) bad.push(`${m.badImgs.length} blank/missing images`);
  if (m.fbStrips !== 5) bad.push(`expected 5 feedback strips, found ${m.fbStrips}`);
  if (!m.dock) bad.push("no copy-out dock");
  if (interactive && !interactive.ok) bad.push(`mock not interactive: ${JSON.stringify(interactive)}`);
  if (errors.length) bad.push(`console errors: ${errors.slice(0, 3).join(" | ")}`);

  console.log(`\n── ${name} (${width}x${height}) ──`);
  console.log(`   mocks ${m.mocksMounted}/${m.mockCount} mounted, rows ${m.mockRows.join("/")}, icons ${m.mockNavIcons.join("/")}`);
  console.log(`   ${m.imgCount} images (${m.badImgs.length} bad) · ${m.tables} tables · ${m.annPins} annotation pins · ${m.fbStrips} fb strips`);
  console.log(`   sideways scroll: ${m.pageScrollsSideways}` + (m.overflowers.length ? `  worst: ${JSON.stringify(m.overflowers[0])}` : ""));
  if (interactive) console.log(`   interactive: ${interactive.ok} (${interactive.before} -> ${interactive.after}, switch ${interactive.swBefore} -> ${interactive.swAfter})`);
  if (bad.length) { console.log(`   FAIL: ${bad.join("; ")}`); problems.push({ name, bad }); }
  else console.log(`   OK`);

  await ctx.close();
}

await browser.close();
writeFileSync(path.join(outdir, "report-checks.json"), JSON.stringify(problems, null, 2));
console.log(problems.length ? `\n${problems.length} viewports failing` : "\nall viewports OK");
if (problems.length) process.exit(1);
