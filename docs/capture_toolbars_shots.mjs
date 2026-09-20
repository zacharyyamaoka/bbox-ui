import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// WHY createRequire and not a bare `import "playwright"` — the same reason
// docs/capture_storybook_shots.mjs:30 gives: ESM resolves a bare specifier
// from the SCRIPT's directory, and in this pnpm workspace playwright is
// installed under apps/storybook-basics, not at the root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const OUT = "/home/bam/bbox-ui/reports/media/toolbars-2026-09-20";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://127.0.0.1:4390/", { waitUntil: "networkidle" });
await page.waitForSelector(".tl-canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.editor, { timeout: 30000 });
await page.waitForTimeout(1200);

async function shot(name, clip) {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log("shot:", name);
}

// ---- 1. A geo rectangle: the tldraw STYLE bar ----
await page.evaluate(() => {
  const e = window.editor;
  e.selectNone();
  e.getCurrentPageShapes().forEach((s) => e.deleteShape(s.id));
  const id = "shape:" + crypto.randomUUID();
  e.createShape({ id, type: "geo", x: 480, y: 420, props: { w: 320, h: 200, geo: "rectangle" } });
  e.setCamera({ x: 0, y: 0, z: 1 });
  e.select(id);
});
await page.waitForSelector('[data-slot="floating-toolbar"][data-visible="true"]', { timeout: 15000 });
await page.waitForTimeout(700);
await shot("01-style-bar-on-geo");

// the colour panel open
await page.click('[data-testid="ss-style-color"]');
await page.waitForSelector('[data-testid="ss-style-color-panel"]', { timeout: 10000 });
await page.waitForTimeout(500);
await shot("02-colour-panel-open");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// ---- 2. Three blocks: ARRANGE with align + distribute ----
await page.evaluate(() => {
  const e = window.editor;
  e.selectNone();
  e.getCurrentPageShapes().forEach((s) => e.deleteShape(s.id));
  const mk = (name, x, y) => {
    const id = "shape:" + crypto.randomUUID();
    e.createShape({ id, type: "ss-block", x, y, props: { name, view: "port", ports: { left: [{ id: "in", name: "in", type: "" }], right: [{ id: "out", name: "out", type: "" }], top: [], bottom: [] } } });
    return id;
  };
  const a = mk("ingest()", 240, 300);
  const b = mk("classify()", 620, 460);
  const c = mk("sort()", 1000, 380);
  e.setCamera({ x: 0, y: 0, z: 1 });
  e.select(a, b, c);
});
await page.waitForSelector('[data-slot="floating-toolbar"][data-visible="true"]', { timeout: 15000 });
await page.waitForTimeout(700);
await shot("03-pill-on-three-blocks");

await page.click('[data-testid="ss-selection-arrange"]');
await page.waitForSelector('[data-testid="ss-arrange-panel"]', { timeout: 10000 });
await page.waitForTimeout(500);
await shot("04-arrange-panel-open");

// prove align works, visibly
const before = await page.evaluate(() => window.editor.getSelectedShapes().map((s) => Math.round(s.x)));
await page.click('[data-testid="ss-arrange-left"]');
await page.waitForTimeout(700);
const after = await page.evaluate(() => window.editor.getSelectedShapes().map((s) => Math.round(s.x)));
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await shot("05-after-align-left");
console.log("align-left x before:", JSON.stringify(before), "after:", JSON.stringify(after));

// ---- 3. Region drawings: for/while vs branch under v9 ----
// Drive the app's OWN variant switch rather than poking the DOM attribute.
// WHY it matters for a capture that is going in a report: setting
// `document.documentElement.dataset` directly does change the paint (the
// component reads the attribute), but it leaves the switch widget still
// reading "Regions v1" in the same screenshot — so the picture contradicts
// itself and the measurement looks staged. Clicking the real control makes
// the caption and the pixels agree.
await page.click('[data-testid="ss-variant-region"]');
await page.waitForSelector('[data-testid="ss-variant-region-v9"]', { timeout: 10000 });
await page.click('[data-testid="ss-variant-region-v9"]');
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.evaluate(() => {
  const e = window.editor;
  e.selectNone();
  e.getCurrentPageShapes().forEach((s) => e.deleteShape(s.id));
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const e = window.editor;
  const region = (kind, name, x, y, arms) => {
    const id = "shape:" + crypto.randomUUID();
    e.createShape({ id, type: "ss-region", x, y, props: { kind, name, w: 520, h: 360, arms } });
    return id;
  };
  region("for", "For Loop", 120, 220, []);
  region("branch", "Branch", 720, 220, [
    { id: "if", title: "if depth == 1:", open: true, h: 140 },
    { id: "else", title: "else:", open: true, h: 140 },
  ]);
  e.setCamera({ x: 0, y: 0, z: 1 });
  e.selectNone();
});
await page.waitForTimeout(1800);
await shot("06-region-v9-for-vs-branch");

// measure the rules, in the real app
const rules = await page.evaluate(() => {
  const out = [];
  for (const frame of document.querySelectorAll('[data-slot="region-frame"]')) {
    const root = frame.closest('[data-region-kind]');
    const rule = frame.querySelector(':scope > [data-slot="region-header-rule"]');
    out.push({
      kind: root?.getAttribute("data-region-kind") ?? "?",
      headerRuleDisplay: rule ? getComputedStyle(rule).display : "absent",
      armHeaders: frame.querySelectorAll('[data-slot="region-arm-header"]').length,
    });
  }
  return out;
});
console.log("REGION RULES:", JSON.stringify(rules, null, 1));

// ---- 4. the dock + status strip ----
await shot("07-full-app", { x: 0, y: 0, width: 1400, height: 900 });

console.log("PAGE ERRORS:", errors.length ? JSON.stringify(errors.slice(0, 5), null, 1) : "none");
await browser.close();
