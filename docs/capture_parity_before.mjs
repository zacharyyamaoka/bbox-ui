#!/usr/bin/env node
/**
 * Capture the CURRENT bbox-ui chrome — column 2 of the parity report.
 *
 * WHY it never touches ports 4321/4341/4383: those serve the archived
 * SystemSketch, which autosaves into whatever board it has open, and that is
 * Zach's 31 real boards. Column 1 of the report uses HIS OWN screenshots of
 * the donor from the vault instead — safe, and literally the images he pointed
 * at.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const OUT = "/home/bam/bbox-ui/reports/media/parity-2026-09-20";
const STAGE = process.argv[2] || "before";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
// DARK, because that is what Zach runs. The pill is `bg-foreground`, which
// INVERTS with the theme: dark ink on a light bar in light mode, and a
// near-white bar in dark mode. Capturing in the headless default (light)
// produced a dark pill Zach has never seen, and would have made the whole
// comparison dishonest.
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:4340/", { waitUntil: "networkidle" });
await page.waitForSelector(".tl-canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.editor, { timeout: 30000 });
await page.waitForTimeout(1000);

const clear = () => page.evaluate(() => {
  const e = window.editor;
  e.getCurrentPageShapes().forEach((s) => e.deleteShape(s.id));
  e.setCamera({ x: 0, y: 0, z: 1 });
  e.selectNone();
});
async function closeUp(name, selector, pad = 14) {
  const el = await page.waitForSelector(selector, { timeout: 15000 });
  const b = await el.boundingBox();
  if (!b) return console.log("no box:", selector);
  await page.screenshot({ path: `${OUT}/${STAGE}-${name}.png`, clip: {
    x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad),
    width: Math.min(1400 - Math.max(0, b.x - pad), b.width + pad * 2),
    height: Math.min(900 - Math.max(0, b.y - pad), b.height + pad * 2) } });
  console.log("shot:", `${STAGE}-${name}`);
}

// 1. the pill over a tldraw primitive (the style bar)
await clear();
await page.evaluate(() => {
  const e = window.editor; const id = "shape:" + crypto.randomUUID();
  e.createShape({ id, type: "geo", x: 460, y: 420, props: { w: 300, h: 180, geo: "rectangle" } });
  e.select(id);
});
await page.waitForSelector('[data-slot="floating-toolbar"][data-visible="true"]');
await page.waitForTimeout(700);
await closeUp("pill-style", '[data-slot="floating-toolbar"][data-visible="true"]');

// 2. the arrange panel open under it — the surface-mismatch Zach can see
await page.click('[data-testid="ss-selection-arrange"]');
await page.waitForSelector('[data-testid="ss-arrange-panel"]');
await page.waitForTimeout(500);
{
  const pill = await (await page.$('[data-slot="floating-toolbar"]')).boundingBox();
  const panel = await (await page.$('[data-testid="ss-arrange-panel"]')).boundingBox();
  const x = Math.min(pill.x, panel.x) - 14, y = Math.min(pill.y, panel.y) - 14;
  await page.screenshot({ path: `${OUT}/${STAGE}-pill-with-panel.png`, clip: {
    x: Math.max(0, x), y: Math.max(0, y),
    width: Math.min(1400 - Math.max(0, x), Math.max(pill.x + pill.width, panel.x + panel.width) - x + 14),
    height: Math.min(900 - Math.max(0, y), Math.max(pill.y + pill.height, panel.y + panel.height) - y + 14) } });
  console.log("shot:", `${STAGE}-pill-with-panel`);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 3. the dock — the size comparison
await closeUp("dock", '[data-slot="tool-dock"]', 12);
// 4. the status strip
await closeUp("status-strip", '[data-slot="status-strip"]', 12);

// 5. an EXPANDED block with a child, unselected then selected
await clear();
await page.evaluate(() => {
  const e = window.editor;
  const parent = "shape:" + crypto.randomUUID();
  e.createShape({ id: parent, type: "ss-block", x: 360, y: 200,
    props: { name: "block", view: "expanded", w: 620, h: 430, ports: { left: [], right: [], top: [], bottom: [] } } });
  const child = "shape:" + crypto.randomUUID();
  e.createShape({ id: child, type: "ss-block", x: 620, y: 380,
    props: { name: "block", view: "expanded", w: 180, h: 150, ports: { left: [], right: [], top: [], bottom: [] } } });
  e.selectNone();
});
await page.waitForTimeout(900);
await closeUp("expanded-unselected", '[data-shape-id]', 24);

// Re-select the geo so the measurement sees the FULL style bar — the first
// draft measured after `selectNone()` and reported a 2-button pill.
await clear();
await page.evaluate(() => {
  const e = window.editor; const id = "shape:" + crypto.randomUUID();
  e.createShape({ id, type: "geo", x: 460, y: 420, props: { w: 300, h: 180, geo: "rectangle" } });
  e.select(id);
});
await page.waitForSelector('[data-slot="floating-toolbar"][data-visible="true"]');
await page.waitForTimeout(700);

const measured = await page.evaluate(() => {
  const box = (s) => { const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const pill = document.querySelector('[data-slot="floating-toolbar"]');
  const pillBox = pill && pill.getBoundingClientRect();
  const centres = pill ? [...pill.querySelectorAll("button")].map((el) => {
    const kid = el.querySelector("svg, span"); if (!kid) return null;
    const k = kid.getBoundingClientRect();
    return { tid: el.getAttribute("data-testid"), centreY: Math.round((k.top + k.bottom) / 2 - pillBox.top),
             contentH: Math.round(k.height * 10) / 10, buttonH: Math.round(el.getBoundingClientRect().height * 10) / 10 };
  }).filter(Boolean) : [];
  const dockBtn = document.querySelector('[data-slot="tool-dock"] button');
  return {
    dpr: devicePixelRatio, rootFont: getComputedStyle(document.documentElement).fontSize,
    dock: box('[data-slot="tool-dock"]'),
    dockButton: dockBtn ? { w: Math.round(dockBtn.getBoundingClientRect().width), h: Math.round(dockBtn.getBoundingClientRect().height) } : null,
    pill: box('[data-slot="floating-toolbar"]'),
    pillRadius: pill ? getComputedStyle(pill).borderRadius : null,
    pillBg: pill ? getComputedStyle(pill).backgroundColor : null,
    statusStrip: box('[data-slot="status-strip"]'),
    distinctBaselines: [...new Set(centres.map((c) => c.centreY))].sort((a, b) => a - b),
    distinctButtonHeights: [...new Set(centres.map((c) => c.buttonH))].sort((a, b) => a - b),
    centres,
  };
});
console.log("MEASURED " + STAGE + ":", JSON.stringify(measured, null, 1));
console.log("PAGE ERRORS:", errors.length ? JSON.stringify(errors.slice(0, 4)) : "none");
await browser.close();
