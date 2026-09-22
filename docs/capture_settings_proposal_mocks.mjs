// Screenshot each proposal mock at a real window size, both themes.
//
// SPIKE for the 2026-09-22 settings-panel proposal report. Reads the
// standalone pages the builder wrote, opens each at the viewport encoded in
// its filename, and captures the whole window — so the capture shows how the
// modal SITS in that window (its gutters, whether it fills the height), not
// just a crop of the modal.
//
//   node docs/capture_settings_proposal_mocks.mjs <dir>
//
// Also asserts the thing a screenshot cannot: that the content pane's computed
// overflow-x is `hidden`, that nothing overflows it sideways, and that the
// popup is inside the viewport. A mock that fails those is not evidence.
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// WHY resolved from the CWD rather than `import "playwright"`: an ESM
// specifier resolves against THIS FILE's directory, and `docs/` has no
// node_modules — only `apps/storybook-basics` installs playwright. Run this
// from the app dir (or any dir that can see it) and the require walks up from
// there. A bare import fails with ERR_MODULE_NOT_FOUND no matter the cwd.
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");

const dir = process.argv[2];
if (!dir) { console.error("usage: node capture_settings_proposal_mocks.mjs <dir>"); process.exit(1); }

const pages = readdirSync(dir).filter((f) => /^mock-.*\.html$/.test(f)).sort();
const browser = await chromium.launch();
const checks = [];

for (const file of pages) {
  const m = /^mock-(\w+)-(\w+)-(light|dark)-(\d+)x(\d+)\.html$/.exec(file);
  if (!m) { console.error(`skipping unparseable ${file}`); continue; }
  const [, id, cat, theme, W, H] = m;
  const width = +W, height = +H;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (c) => { if (c.type() === "error") errors.push(c.text()); });
  await page.goto("file://" + path.resolve(dir, file), { waitUntil: "networkidle" });
  await page.waitForSelector(".mk-pane", { timeout: 15000 });
  await page.waitForTimeout(260);

  const measured = await page.evaluate(() => {
    const pane = document.querySelector(".mk-pane");
    const popup = document.querySelector(".mk-popup");
    const nav = document.querySelector(".mk-nav");
    const cs = getComputedStyle(pane);
    const pr = pane.getBoundingClientRect();
    let worst = 0, who = null;
    for (const el of pane.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const over = r.right - pr.right;
      if (over > worst) { worst = over; who = el.className + " | " + (el.textContent || "").trim().slice(0, 30); }
    }
    const popupR = popup.getBoundingClientRect();
    return {
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      paneClientW: pane.clientWidth,
      paneScrollW: pane.scrollWidth,
      hOverflow: pane.scrollWidth - pane.clientWidth,
      worstOverhangPx: +worst.toFixed(1),
      worstOverhangWho: who,
      // A classic scrollbar steals layout; an overlay one does not.
      gutterPx: pane.offsetWidth - pane.clientWidth,
      popup: { w: +popupR.width.toFixed(1), h: +popupR.height.toFixed(1) },
      popupInsideViewport:
        popupR.left >= -1 && popupR.top >= -1 &&
        popupR.right <= innerWidth + 1 && popupR.bottom <= innerHeight + 1,
      navW: +nav.getBoundingClientRect().width.toFixed(1),
      rows: document.querySelectorAll(".mk-row").length,
      navIcons: document.querySelectorAll(".mk-navbtn svg").length,
      navRows: document.querySelectorAll(".mk-navbtn").length,
      contentTallerThanPane: pane.scrollHeight > pane.clientHeight,
    };
  });

  const out = path.join(dir, file.replace(/\.html$/, ".png"));
  await page.screenshot({ path: out });
  const ok =
    measured.overflowX === "hidden" &&
    measured.hOverflow === 0 &&
    measured.popupInsideViewport &&
    measured.navIcons === measured.navRows &&
    errors.length === 0;
  checks.push({ file, id, cat, theme, width, height, ok, errors, ...measured });
  console.log(
    `${ok ? "OK  " : "FAIL"} ${file.padEnd(34)} popup=${measured.popup.w}x${measured.popup.h} ` +
    `pane ${measured.paneClientW}->${measured.paneScrollW} overflow-x=${measured.overflowX} ` +
    `gutter=${measured.gutterPx}px icons=${measured.navIcons}/${measured.navRows}` +
    (errors.length ? `  ERRORS: ${errors.join(" | ")}` : ""),
  );
}

await browser.close();
writeFileSync(path.join(dir, "mock-checks.json"), JSON.stringify(checks, null, 2));
const bad = checks.filter((c) => !c.ok);
console.log(`\n${checks.length} captures, ${bad.length} failing`);
if (bad.length) process.exit(1);
