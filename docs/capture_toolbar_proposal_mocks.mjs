// Drive the five toolbar proposal mocks in a real browser, capture them, and
// assert the things a screenshot cannot show.
//
//   node docs/capture_toolbar_proposal_mocks.mjs <mocks-dir> <out-dir>
//
// Every claim the report makes about a mock comes from `mock-checks.json`,
// written here while the page was actually driven — never retyped. The four
// assertions below are the round's four complaints turned into gates, and each
// one has been mutation-tested red (see the report's "can it fail" note):
//
//   1. text size ⊥ stroke width  — set XL, read the rect's stroke-width
//   2. stroke follows fill until set — set fill, read the rect's stroke
//   3. opacity is not on the bar    — no range input, no "100%" in the pill
//   4. the menu shows what it does  — every line-style option carries an <svg>
//
// Plus one measured differentiator per proposal: pill width, and how much of
// the shape its open popover covers (P5's whole point is that it covers none).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// WHY resolved from an explicit package rather than a bare import: `docs/` has
// no node_modules, and an ESM specifier resolves against THIS FILE's directory.
const require = createRequire(path.join(process.cwd(), "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const [mocksDir, outDir] = process.argv.slice(2);
if (!mocksDir || !outDir) {
  console.error("usage: node capture_toolbar_proposal_mocks.mjs <mocks-dir> <out-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const PROPOSALS = ["p1", "p2", "p3", "p4", "p5"];
// Which trigger each proposal uses for the three things we photograph.
const OPENERS = {
  p1: { inside: "fill", edge: "stroke", edgeColour: "stroke", text: "size" },
  p2: { inside: "inside", edge: "edge", edgeColour: "edge", text: "text" },
  p3: { inside: "appearance", edge: "appearance", edgeColour: "appearance", text: "appearance" },
  p4: { inside: "pair", edge: "line", edgeColour: "pair", text: "size4" },
  p5: { inside: "inside", edge: "edge", edgeColour: "edge", text: "text" },
};

const browser = await chromium.launch();
const results = {};

/** Read the painted rect + label straight off the SVG the page drew. */
const readShape = (page) =>
  page.evaluate(() => {
    const rect = document.querySelector('[data-role="shape"]');
    const label = document.querySelector('[data-role="label"]');
    return {
      strokeWidth: Number(rect.getAttribute("stroke-width")),
      stroke: rect.getAttribute("stroke"),
      fill: rect.getAttribute("fill"),
      fillOpacity: Number(rect.getAttribute("fill-opacity")),
      strokeOpacity: Number(rect.getAttribute("stroke-opacity")),
      fontPx: Number.parseFloat(getComputedStyle(label).fontSize),
      labelFill: label.getAttribute("fill"),
    };
  });

/** Click a trigger by the id the mock stamps on it. */
/** Click an option, scrolling the (possibly tall, see P3) panel to it first. */
const pick = async (page, sel) => {
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.click(sel);
  await page.waitForTimeout(90);
};

const openPop = async (page, id) => {
  const sel = `[data-pop="${id}"], [data-tray="${id}"]`;
  const already = await page.evaluate(
    (s) => document.querySelector(s)?.getAttribute("aria-expanded") === "true", sel);
  if (!already) {
    await page.click(sel);
    await page.waitForTimeout(90);
  }
};

const closeAll = async (page) => {
  await page.mouse.click(40, 620);
  await page.waitForTimeout(80);
};

for (const pid of PROPOSALS) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 700 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  console.error(`  driving ${pid}…`);
  await page.goto("file://" + path.resolve(mocksDir, `mock-${pid}.html`));
  await page.waitForSelector('[data-role="shape"]');
  const o = OPENERS[pid];
  const r = (results[pid] = { errors });

  // ── the pill at rest ────────────────────────────────────────────────────
  r.pillWidth = Math.round(
    await page.evaluate(() => document.querySelector(".pill").getBoundingClientRect().width),
  );
  r.triggerCount = await page.evaluate(
    () => document.querySelectorAll(".pill [data-pop], .pill [data-tray]").length,
  );
  await page.screenshot({ path: path.join(outDir, `${pid}-1-pill.png`), clip: await clipOf(page, ".pill", 24) });
  await page.screenshot({ path: path.join(outDir, `${pid}-0-board.png`) });

  // ── gate 3: opacity is NOT on the bar ───────────────────────────────────
  r.barHasRange = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.pill input[type="range"]'))
      .some((n) => !n.closest(".pop, #tray")),
  );
  r.barShowsPercent = await page.evaluate(() => {
    const pill = document.querySelector(".pill");
    const own = Array.from(pill.querySelectorAll("*")).filter((n) => !n.closest(".pop, #tray"));
    return own.some((n) => /^\s*\d+\s*%\s*$/.test(n.textContent || ""));
  });

  // ── the inside popover ──────────────────────────────────────────────────
  await openPop(page, o.inside);
  r.insideHasOpacity = await page.evaluate(
    () => !!document.querySelector('.pop[data-open="true"] input[type="range"], #tray[data-open="true"] input[type="range"]'),
  );
  r.insideHasFillAndColour = await page.evaluate(() => {
    const scope = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
    return !!scope.querySelector('[data-act="fillStyle"]') && !!scope.querySelector('[data-act="colour"]');
  });
  r.popoverCoversShape = await coverage(page);
  await page.screenshot({ path: path.join(outDir, `${pid}-2-inside.png`), clip: await clipOf(page, ".pill", 24, true) });
  await closeAll(page);

  // ── the edge popover: gate 4, every line style draws itself ─────────────
  await openPop(page, o.edge);
  r.lineStyleOptions = await page.evaluate(() => {
    const scope = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
    return Array.from(scope.querySelectorAll('[data-act="dash"]')).map((b) => ({
      value: b.dataset.value,
      hasGlyph: !!b.querySelector("svg"),
      label: (b.textContent || "").trim(),
    }));
  });
  r.thicknessOptions = await page.evaluate(() => {
    const scope = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
    return Array.from(scope.querySelectorAll('[data-act="strokeWidth"]')).map((b) => ({
      value: b.dataset.value,
      drawnAt: Number(b.querySelector("path")?.getAttribute("stroke-width")),
    }));
  });
  await page.screenshot({ path: path.join(outDir, `${pid}-3-edge.png`), clip: await clipOf(page, ".pill", 24, true) });
  await closeAll(page);

  // ── the text popover: gate 1 ────────────────────────────────────────────
  await openPop(page, o.text);
  r.sizeRowsDrawnAtOwnSize = await page.evaluate(() => {
    const scope = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
    return Array.from(scope.querySelectorAll('[data-act="size"]')).map((b) => ({
      value: b.dataset.value,
      rowPx: Number.parseFloat(getComputedStyle(b.querySelector(".grow")).fontSize),
      printedPx: (b.querySelector(".px")?.textContent || "").trim(),
    }));
  });
  r.hasCustomPx = await page.evaluate(
    () => !!document.querySelector('[data-act="customPx"]'),
  );

  const before = await readShape(page);
  await pick(page, '[data-act="size"][data-value="xl"]');
  const afterPreset = await readShape(page);
  r.decoupling = {
    before: { fontPx: before.fontPx, strokeWidth: before.strokeWidth },
    afterXL: { fontPx: afterPreset.fontPx, strokeWidth: afterPreset.strokeWidth },
    fontChanged: afterPreset.fontPx !== before.fontPx,
    strokeHeld: afterPreset.strokeWidth === before.strokeWidth,
  };
  await page.screenshot({ path: path.join(outDir, `${pid}-4-text.png`), clip: await clipOf(page, ".pill", 24, true) });

  // custom px, same gate
  await page.locator('[data-act="customPx"]').scrollIntoViewIfNeeded();
  await page.fill('[data-act="customPx"]', "47");
  await page.press('[data-act="customPx"]', "Enter");
  await page.waitForTimeout(120);
  const afterCustom = await readShape(page);
  r.decoupling.afterCustom47 = { fontPx: afterCustom.fontPx, strokeWidth: afterCustom.strokeWidth };
  r.decoupling.customHeldStroke = afterCustom.strokeWidth === before.strokeWidth;
  await closeAll(page);

  // ── gate 2: stroke follows fill, until you set it ───────────────────────
  await openPop(page, o.inside);
  await pick(page, '[data-act="colour"][data-target="fill"][data-value="red"]');
  const linked = await readShape(page);

  await openPop(page, o.edgeColour);
  await pick(page, '[data-act="colour"][data-target="stroke"][data-value="blue"]');
  const unlinkedEdge = await readShape(page);

  await openPop(page, o.inside);
  await pick(page, '[data-act="colour"][data-target="fill"][data-value="yellow"]');
  const independent = await readShape(page);

  r.link = {
    afterFillRed: { fill: linked.fill, stroke: linked.stroke, followed: linked.stroke === linked.fill },
    afterEdgeBlue: { fill: unlinkedEdge.fill, stroke: unlinkedEdge.stroke },
    afterFillYellow: {
      fill: independent.fill, stroke: independent.stroke,
      stayedIndependent: independent.stroke === unlinkedEdge.stroke && independent.fill !== independent.stroke,
    },
  };
  await page.screenshot({ path: path.join(outDir, `${pid}-5-unlinked.png`), clip: await clipOf(page, ".pill", 24, true) });
  await closeAll(page);
  await page.screenshot({ path: path.join(outDir, `${pid}-6-result.png`) });

  await page.close();
}

await browser.close();
writeFileSync(path.join(outDir, "mock-checks.json"), JSON.stringify(results, null, 2));

// ── report + fail loudly ───────────────────────────────────────────────────
let bad = 0;
for (const [pid, r] of Object.entries(results)) {
  const fails = [];
  if (r.errors.length) fails.push(`page errors: ${r.errors[0]}`);
  if (!r.decoupling.fontChanged) fails.push("XL did not change the text size");
  if (!r.decoupling.strokeHeld) fails.push("XL moved the stroke width");
  if (!r.decoupling.customHeldStroke) fails.push("custom px moved the stroke width");
  if (!r.link.afterFillRed.followed) fails.push("stroke did not follow the fill");
  if (!r.link.afterFillYellow.stayedIndependent) fails.push("stroke re-followed after being set");
  if (r.barHasRange || r.barShowsPercent) fails.push("opacity is still on the bar");
  if (!r.insideHasOpacity) fails.push("no opacity inside the fill popover");
  if (!r.lineStyleOptions.length || r.lineStyleOptions.some((o) => !o.hasGlyph))
    fails.push("a line-style option has no preview glyph");
  if (!r.hasCustomPx) fails.push("no custom px field");
  const mark = fails.length ? "FAIL" : "ok  ";
  console.log(
    `${mark} ${pid}  pill ${String(r.pillWidth).padStart(4)}px · ${r.triggerCount} triggers · ` +
    `text ${r.decoupling.before.fontPx}→${r.decoupling.afterXL.fontPx}px while stroke held at ` +
    `${r.decoupling.afterXL.strokeWidth}px · covers ${r.popoverCoversShape}% of the shape`,
  );
  for (const f of fails) { console.log(`     ↳ ${f}`); bad++; }
}
process.exit(bad ? 1 : 0);

// ── helpers ────────────────────────────────────────────────────────────────

/** A clip box around the pill (and, optionally, whatever it has open). */
async function clipOf(page, selector, pad, withPopover) {
  return page.evaluate(
    ([sel, p, wp]) => {
      const boxes = [document.querySelector(sel).getBoundingClientRect()];
      if (wp) {
        const open = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
        if (open) boxes.push(open.getBoundingClientRect());
      }
      const x = Math.min(...boxes.map((b) => b.left)) - p;
      const y = Math.min(...boxes.map((b) => b.top)) - p;
      const r = Math.max(...boxes.map((b) => b.right)) + p;
      const bo = Math.max(...boxes.map((b) => b.bottom)) + p;
      return { x: Math.max(0, x), y: Math.max(0, y), width: r - Math.max(0, x), height: bo - Math.max(0, y) };
    },
    [selector, pad, !!withPopover],
  );
}

/**
 * How much of the shape the open surface hides, as a percentage of the shape's
 * own area. P5's claim ("never covers the shape") is only worth printing if the
 * other four produce a non-zero number here.
 */
async function coverage(page) {
  return page.evaluate(() => {
    const open = document.querySelector('.pop[data-open="true"], #tray[data-open="true"]');
    const shape = document.querySelector('[data-role="shape"]');
    if (!open || !shape) return 0;
    const a = open.getBoundingClientRect();
    const b = shape.getBoundingClientRect();
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return Math.round(((w * h) / (b.width * b.height)) * 100);
  });
}
