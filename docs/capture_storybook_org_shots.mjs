#!/usr/bin/env node
/**
 * Capture the Storybook SIDEBAR of today's Storybook and of each organisation
 * proposal (apps/storybook-basics/.storybook-org/{a,b,c}), in the same three
 * states, plus a short video of the in-app proposal switch.
 *
 *   node docs/capture_storybook_org_shots.mjs --out DIR
 *
 * Expects today's Storybook on :5421 and the proposals on :5423/:5424/:5425.
 *
 * WHY the same three states for every tree: the proposals differ only in the
 * sidebar, so the fair comparison is identical expansion rules applied to
 * each — "roots" (every section collapsed), "glance" (sections open, nothing
 * else — what you scan first), "outline" (sections and groups open, component
 * nodes closed — where every component sits). A fresh browser context per
 * shot means no remembered expansion state leaks between trees.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const OUT = path.resolve(args[args.indexOf("--out") + 1] ?? "reports/media/storybook-org");
const TREES = [
  { key: "today", port: 5421 },
  { key: "a", port: 5423 },
  { key: "b", port: 5424 },
  { key: "c", port: 5425 },
];
const ANCHOR = { importPath: "./src/components/PortEdge.stories.tsx", exportName: "AroundABox" };

async function anchorId(port) {
  const index = await (await fetch(`http://localhost:${port}/index.json`)).json();
  const entry = Object.values(index.entries).find(
    (e) => e.importPath === ANCHOR.importPath && e.exportName === ANCHOR.exportName,
  );
  if (!entry) throw new Error(`:${port} has no ${ANCHOR.exportName}`);
  return entry.id;
}

/** Click every matching toggle until none is left — nested nodes appear as parents open. */
async function settle(page, selector) {
  for (let pass = 0; pass < 20; pass += 1) {
    const clicked = await page.evaluate((sel) => {
      const buttons = [...document.querySelectorAll(sel)];
      // deepest first, so collapsing a parent never hides a child we still meant to click
      buttons.reverse().forEach((b) => b.click());
      return buttons.length;
    }, selector);
    if (!clicked) return;
    await page.waitForTimeout(150);
  }
}

const COLLAPSE_COMPONENTS = '[data-nodetype="component"] > button[aria-expanded="true"]';
const COLLAPSE_GROUPS = '[data-nodetype="group"] > button[aria-expanded="true"]';
const EXPAND_GROUPS = '[data-nodetype="group"] > button[aria-expanded="false"]';
const COLLAPSE_ROOTS = 'button[data-action="collapse-root"][aria-expanded="true"]';

const STATES = {
  async roots(page) {
    await settle(page, COLLAPSE_ROOTS);
  },
  async glance(page) {
    await settle(page, COLLAPSE_COMPONENTS);
    await settle(page, COLLAPSE_GROUPS);
  },
  async outline(page) {
    await settle(page, EXPAND_GROUPS);
    await settle(page, COLLAPSE_COMPONENTS);
  },
};

async function shoot(browser, tree, id) {
  const shots = {};
  for (const [state, apply] of Object.entries(STATES)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 5200 }, colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto(`http://localhost:${tree.port}/?path=/story/${id}`, { waitUntil: "networkidle" });
    await page.waitForSelector("#storybook-explorer-tree [data-nodetype]");
    await page.waitForTimeout(800);
    await apply(page);
    await page.waitForTimeout(300);
    const file = path.join(OUT, `${tree.key}-${state}.png`);
    await page.locator("#storybook-explorer-tree").screenshot({ path: file });
    const rows = await page.$$eval("#storybook-explorer-tree [data-nodetype]", (nodes) => nodes.length);
    shots[state] = { file: path.relative(repoRoot, file), visibleRows: rows };
    await context.close();
  }
  return shots;
}

/** Scroll the sidebar's own scroll container top to bottom, at reading pace. */
async function scanSidebar(page) {
  await page.evaluate(async () => {
    let el = document.querySelector("#storybook-explorer-tree");
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    if (!el) return;
    el.scrollTop = 0;
    const distance = el.scrollHeight - el.clientHeight;
    const steps = Math.max(1, Math.round(distance / 60));
    for (let i = 1; i <= steps; i += 1) {
      el.scrollTop = (distance * i) / steps;
      await new Promise((r) => setTimeout(r, 40));
    }
  });
}

/**
 * The hero: the same scan in each tree — first-glance state, sidebar scrolled
 * top to bottom. Today -> A is a navigation (today's Storybook has no switch);
 * A -> B -> C goes through the real in-app switch.
 */
async function recordJourney(browser, ids) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    colorScheme: "dark",
    recordVideo: { dir: OUT, size: { width: 1100, height: 720 } },
  });
  const page = await context.newPage();
  const scan = async () => {
    await page.waitForSelector("#storybook-explorer-tree [data-nodetype]");
    await page.waitForTimeout(900);
    await STATES.glance(page);
    await page.waitForTimeout(700);
    await scanSidebar(page);
    await page.waitForTimeout(900);
  };
  await page.goto(`http://localhost:5421/?path=/story/${ids.today}`, { waitUntil: "networkidle" });
  await scan();
  await page.goto(`http://localhost:5423/?path=/story/${ids.a}`, { waitUntil: "networkidle" });
  await scan();
  for (const [next, port] of [["b", 5424], ["c", 5425]]) {
    const select = page.locator('select[aria-label="Sidebar organisation proposal"]');
    await Promise.all([page.waitForURL(new RegExp(`:${port}/`)), select.selectOption(next)]);
    await scan();
  }
  const video = page.video();
  await context.close();
  return video ? path.relative(repoRoot, await video.path()) : null;
}

/**
 * After B landed (2026-09-22): the real sidebar, from this worktree's own
 * `.storybook` on :5422 — the same three states, then the hero: scan the
 * sidebar, open the tag filter, tick `host:tldraw`, scan what is left.
 */
async function captureLanded(browser) {
  const tree = { key: "landed", port: 5422 };
  const id = await anchorId(tree.port);
  const shots = await shoot(browser, tree, id);
  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    colorScheme: "dark",
    recordVideo: { dir: OUT, size: { width: 1100, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${tree.port}/?path=/story/${id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#storybook-explorer-tree [data-nodetype]");
  await page.waitForTimeout(900);
  await STATES.glance(page);
  await page.waitForTimeout(700);
  await scanSidebar(page);
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Tag filters" }).click();
  await page.waitForTimeout(900);
  await page.getByText("host:tldraw", { exact: true }).click();
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  // WHY: the cursor is left over the sidebar by the filter click, and Storybook
  // opens an item's hover menu under it — park it on the canvas.
  await page.mouse.move(900, 450);
  await page.waitForTimeout(600);
  await settle(page, EXPAND_GROUPS);
  await page.waitForTimeout(500);
  await scanSidebar(page);
  await page.waitForTimeout(1500);
  const video = page.video();
  await context.close();
  return { shots, anchorId: id, video: video ? path.relative(repoRoot, await video.path()) : null };
}

/**
 * Round 3 (2026-09-22): Region under Blocks with its presets, Labeled Group,
 * and the Editor's three families. Stills: the Region folder as the sidebar
 * draws it, and two Labeled Group stories rendered alone (iframe). Hero: open
 * Region, walk its Labeled Group and Branch presets, then open the Editor.
 */
async function captureRound3(browser) {
  const port = 5422;
  const index = await (await fetch(`http://localhost:${port}/index.json`)).json();
  const id = (title, name) =>
    Object.values(index.entries).find((e) => e.title === title && e.name === name)?.id ??
    Object.values(index.entries).find((e) => e.title === title)?.id;
  const lgDefault = id("Components/Blocks/Region/Labeled Group", "Default");
  const lgSame = id("Components/Blocks/Region/Labeled Group", "Same Frame");
  const branch = id("Components/Blocks/Region/Branch");
  const out = { stills: {} };

  for (const [name, storyId, w, h] of [["r3-lg-default", lgDefault, 620, 400], ["r3-lg-sameframe", lgSame, 1000, 380]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: "dark" });
    await page.goto(`http://localhost:${port}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-slot="labeled-group-label"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    out.stills[name] = storyId;
    await page.close();
  }

  const tree = await browser.newContext({ viewport: { width: 1280, height: 3200 }, colorScheme: "dark" });
  const tp = await tree.newPage();
  await tp.goto(`http://localhost:${port}/?path=/story/${lgDefault}`, { waitUntil: "networkidle" });
  await tp.waitForSelector("#storybook-explorer-tree [data-nodetype]");
  await tp.waitForTimeout(900);
  const box = await tp.evaluate(() => {
    const blocks = document.querySelector('[data-item-id="components-blocks"]');
    const items = [...document.querySelectorAll('#storybook-explorer-tree [data-item-id^="components-blocks"]')];
    const rects = [blocks, ...items].filter(Boolean).map((n) => n.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    const tree = document.querySelector("#storybook-explorer-tree").getBoundingClientRect();
    return { x: tree.left, y: top - 4, width: tree.width, height: bottom - top + 8 };
  });
  await tp.screenshot({ path: path.join(OUT, "r3-blocks-region.png"), clip: box });
  await tree.close();

  const context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    colorScheme: "dark",
    recordVideo: { dir: OUT, size: { width: 1100, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/?path=/story/${lgDefault}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#storybook-explorer-tree [data-nodetype]");
  await page.evaluate(() => document.querySelector('[data-item-id="components-blocks-region"]')?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(2200);
  await page.goto(`http://localhost:${port}/?path=/story/${lgSame}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector('[data-item-id="components-blocks-region"]')?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(2600);
  await page.goto(`http://localhost:${port}/?path=/story/${branch}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector('[data-item-id="components-blocks-region"]')?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(2600);
  await page.evaluate(() => document.querySelector('[data-item-id="editor"]')?.scrollIntoView({ block: "start" }));
  await page.mouse.move(900, 450);
  await page.waitForTimeout(2400);
  const video = page.video();
  await context.close();
  out.video = video ? path.relative(repoRoot, await video.path()) : null;
  return out;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
if (args.includes("--round3")) {
  const r3 = await captureRound3(browser);
  await browser.close();
  await writeFile(path.join(OUT, "manifest-round3.json"), JSON.stringify(r3, null, 1));
  console.log(JSON.stringify(r3));
  process.exit(0);
}
if (args.includes("--landed")) {
  const landed = await captureLanded(browser);
  await browser.close();
  await writeFile(path.join(OUT, "manifest-landed.json"), JSON.stringify(landed, null, 1));
  console.log(JSON.stringify(landed));
  process.exit(0);
}
const ids = {};
const manifest = { anchor: ANCHOR, trees: {} };
for (const tree of TREES) {
  ids[tree.key] = await anchorId(tree.port);
  manifest.trees[tree.key] = { port: tree.port, anchorId: ids[tree.key], shots: await shoot(browser, tree, ids[tree.key]) };
  console.log(tree.key, JSON.stringify(manifest.trees[tree.key].shots));
}
manifest.video = await recordJourney(browser, ids);
await browser.close();
await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log("video", manifest.video);
