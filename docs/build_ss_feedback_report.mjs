#!/usr/bin/env node
// docs/build_ss_feedback_report.mjs — the review report for Zach's 2026-09-21
// SystemSketch feedback (Daily Note - Sep 21 2026, "Feedback on system sketch"):
//   1. the For Loop / Branch corner card is rigidly one object with its frame;
//   2. the tool-dock menu marks the current tool by highlighting its row, not
//      a check that shoves the shortcut letter;
//   3. clicking an object opens the right-hand Inspector.
//
// WHY it drives the REAL app rather than a story: every one of the three is a
// host integration (tldraw selection, the app's own rail, the dock as mounted
// in the app), and "verify UI in the real app" is Zach's standing rule — a
// story render proves the component, not the wiring he actually complained
// about. Every number in the page is measured here, at build time, off the
// running app (editor records + getBoundingClientRect), never typed in.
//
// USAGE
//   node docs/build_ss_feedback_report.mjs [--port 4571] [--out /abs/report.html]
//
// It starts its own Vite on --port (strict; never 4340, a reviewer's port),
// records a hero video + stills with Playwright's bundled Chromium, and writes
// one self-contained HTML (media inlined as data: URIs) — which is why the
// default output is the gitignored `reports/media/` half of the main checkout.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const APP = join(REPO, "apps/systemsketch");
const require = createRequire(join(APP, "package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const PORT = Number(argOf("--port", "4571"));
const DATE = "2026-09-21";
const OUT = argOf("--out", `/home/bam/bbox-ui/reports/media/system-sketch-feedback-${DATE}.html`);
const BEFORE = argOf("--before", null); // a loop-dragged still captured on main, for the before/after pair
const WORK = argOf("--work", join(process.env.TMPDIR ?? "/tmp", `ss-feedback-${process.pid}`));
const VIEW = { width: 1400, height: 900 };
if (PORT === 4340) throw new Error("4340 is the reviewer's port — pick another");
mkdirSync(WORK, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function startVite() {
  const vite = spawn(join(APP, "node_modules/.bin/vite"), ["--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: APP,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  let log = "";
  vite.stdout.on("data", (chunk) => (log += chunk));
  vite.stderr.on("data", (chunk) => (log += chunk));
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok) return vite;
    } catch {}
    if (vite.exitCode !== null) throw new Error(`vite exited:\n${log}`);
    await sleep(250);
  }
  vite.kill("SIGTERM");
  throw new Error(`vite never answered on ${PORT}:\n${log}`);
}

async function openApp(context) {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/?fresh=1`);
  await page.waitForFunction(() => !!window.editor, null, { timeout: 60000 });
  await sleep(800);
  return page;
}

/** Place a region with the REAL tool (a click, so the preset's `pointing`
 *  gate sees it) and return its id + corner card id once the card measured. */
async function placeRegion(page, toolId, at) {
  await page.evaluate((id) => { window.editor.setCurrentTool(id); }, toolId);
  await page.mouse.click(at.x, at.y);
  await sleep(600);
  return page.evaluate(() => {
    const editor = window.editor;
    const regions = editor.getCurrentPageShapes().filter((shape) => shape.type === "ss-region");
    const region = regions[regions.length - 1];
    editor.setCurrentTool("select");
    editor.selectNone();
    return { regionId: region.id, cardId: region.props.cornerBlockId, kind: region.props.kind };
  });
}

async function placeBlock(page, name, x, y) {
  return page.evaluate(
    ({ name, x, y }) => {
      const editor = window.editor;
      const before = new Set(editor.getCurrentPageShapes().map((shape) => shape.id));
      editor.createShape({
        type: "ss-block",
        x,
        y,
        props: {
          name,
          view: "port",
          w: 220,
          h: 120,
          ports: {
            left: [{ id: "frame", declaration: "frame: Image" }],
            right: [{ id: "pose", declaration: "pose: Pose" }],
            top: [],
            bottom: [],
          },
        },
      });
      const created = editor.getCurrentPageShapes().find((shape) => !before.has(shape.id));
      editor.selectNone();
      return created.id;
    },
    { name, x, y },
  );
}

/** Region + card geometry, in page space (records) and screen space (DOM). */
async function regionGeometry(page, ids) {
  return page.evaluate(({ regionId, cardId }) => {
    const editor = window.editor;
    const region = editor.getShape(regionId);
    const card = editor.getShape(cardId);
    const regionBounds = editor.getShapePageBounds(regionId);
    const cardBounds = editor.getShapePageBounds(cardId);
    const face = document.querySelector(`[data-block-id="${cardId}"]`);
    const frame = document.querySelector(`[data-region-id="${regionId}"]`);
    const faceRect = face?.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    const arms = [...(frame?.querySelectorAll('[data-slot="region-arm-header"], [data-slot="region-arm-label"]') ?? [])].map((node) => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent?.trim(), top: rect.top, bottom: rect.bottom };
    });
    return {
      regionPage: { x: regionBounds.x, y: regionBounds.y, w: regionBounds.w, h: regionBounds.h },
      cardLocal: { x: card.x, y: card.y, rotation: card.rotation, parentIsRegion: card.parentId === regionId },
      cardPage: { x: cardBounds.x, y: cardBounds.y, w: cardBounds.w, h: cardBounds.h },
      faceRect: faceRect && { left: faceRect.left, top: faceRect.top, right: faceRect.right, bottom: faceRect.bottom },
      frameRect: frameRect && { left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom },
      arms,
      selected: editor.getSelectedShapeIds(),
      regionId,
      regionXY: { x: region.x, y: region.y },
    };
  }, ids);
}

async function headerCentre(page, blockId) {
  return page.evaluate((id) => {
    const face = document.querySelector(`[data-block-id="${id}"]`);
    const header = face?.querySelector('[data-slot="block-header"]') ?? face;
    const rect = header.getBoundingClientRect();
    // Toward the header's right third: clear of the glyph (its own picker)
    // and of the name text (its own editor), so the press is a GRAB.
    return { x: rect.left + rect.width * 0.8, y: rect.top + rect.height / 2 };
  }, blockId);
}

async function drag(page, from, delta, steps = 18) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps });
  await page.mouse.up();
  await sleep(300);
}

async function shotAround(page, file, rects, pad = 36) {
  const left = Math.max(0, Math.min(...rects.map((rect) => rect.left)) - pad);
  const top = Math.max(0, Math.min(...rects.map((rect) => rect.top)) - pad);
  const right = Math.min(VIEW.width, Math.max(...rects.map((rect) => rect.right)) + pad);
  const bottom = Math.min(VIEW.height, Math.max(...rects.map((rect) => rect.bottom)) + pad);
  await page.screenshot({ path: file, clip: { x: left, y: top, width: right - left, height: bottom - top } });
  return file;
}

async function inspectorState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-surface]');
    const rect = panel?.getBoundingClientRect();
    return {
      open: !!panel,
      surface: panel?.getAttribute("data-surface") ?? null,
      text: panel?.textContent?.replace(/\s+/g, " ").slice(0, 160) ?? null,
      rect: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      activeIsBody: document.activeElement === document.body || !!document.activeElement?.closest(".tl-container"),
    };
  });
}

async function menuState(page) {
  return page.evaluate(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].pop();
    if (!menu) return null;
    const rows = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')].map((row) => {
      const shortcut = row.querySelector('[data-slot="dropdown-menu-shortcut"]');
      return {
        label: row.textContent?.replace(shortcut?.textContent ?? "", "").trim(),
        current: row.getAttribute("data-current") === "true",
        background: getComputedStyle(row).backgroundColor,
        shortcutRight: shortcut ? Math.round(shortcut.getBoundingClientRect().right * 10) / 10 : null,
        hasCheck: !!row.querySelector("svg.lucide-check"),
      };
    });
    const rect = menu.getBoundingClientRect();
    return { rows, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } };
  });
}

// ---------------------------------------------------------------------------
// Stills + measurements
// ---------------------------------------------------------------------------
async function captureStills(browser) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: "dark" });
  const page = await openApp(context);
  const evidence = {};

  // 1 · For Loop — placed, then dragged BY ITS CARD.
  const loop = await placeRegion(page, "ss-loop", { x: 300, y: 330 });
  const loopBefore = await regionGeometry(page, loop);
  evidence.loopPlaced = loopBefore;
  await shotAround(page, join(WORK, "loop-placed.png"), [loopBefore.frameRect, loopBefore.faceRect]);
  const grab = await headerCentre(page, loop.cardId);
  await drag(page, grab, { x: 100, y: 90 });
  const loopAfter = await regionGeometry(page, loop);
  evidence.loopDragged = { ...loopAfter, delta: { x: loopAfter.regionXY.x - loopBefore.regionXY.x, y: loopAfter.regionXY.y - loopBefore.regionXY.y } };
  await shotAround(page, join(WORK, "loop-dragged.png"), [loopAfter.frameRect, loopAfter.faceRect]);
  await page.evaluate(() => { window.editor.selectNone(); });

  // 2 · Branch — the `if` row must start below the card.
  const branch = await placeRegion(page, "ss-branch", { x: 930, y: 330 });
  const branchGeo = await regionGeometry(page, branch);
  evidence.branch = branchGeo;
  await shotAround(page, join(WORK, "branch.png"), [branchGeo.frameRect, branchGeo.faceRect]);

  // 3 · Inspector — click a block, then the loop's card, then empty canvas.
  const block = await placeBlock(page, "Pose estimator", 110, 640);
  await sleep(500);
  const blockGrab = await headerCentre(page, block);
  await page.mouse.click(blockGrab.x, blockGrab.y);
  await sleep(500);
  evidence.inspectorOnBlock = { ...(await inspectorState(page)), selected: await page.evaluate(() => window.editor.getSelectedShapeIds()) };
  await page.screenshot({ path: join(WORK, "inspector-block.png") });
  await page.keyboard.press("ArrowRight");
  evidence.nudgeAfterOpen = await page.evaluate((id) => window.editor.getShape(id).x, block);

  const cardGrab = await headerCentre(page, loop.cardId);
  await page.mouse.click(cardGrab.x, cardGrab.y);
  await sleep(500);
  evidence.inspectorOnRegion = { ...(await inspectorState(page)), selected: await page.evaluate(() => window.editor.getSelectedShapeIds()) };
  await page.screenshot({ path: join(WORK, "inspector-region.png") });

  // Empty canvas: clear of every shape above AND of the dock, which owns the
  // bottom-centre band (x 530-870, y 840-890 at this viewport).
  await page.mouse.click(760, 740);
  await sleep(500);
  evidence.inspectorAfterDeselect = await inspectorState(page);

  // 4 · The Shape family menu with Rectangle current.
  await page.evaluate(() => { window.editor.setCurrentTool("geo"); });
  await page.click('[data-testid="ss-dock-family-shape"]');
  await sleep(500);
  const menu = await menuState(page);
  evidence.menu = menu;
  if (menu) await shotAround(page, join(WORK, "menu.png"), [menu.rect], 16);
  // Hover another row: the current row must keep its tint.
  const hoverTarget = await page.evaluate(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].pop();
    const rows = [...menu.querySelectorAll('[role="menuitem"]')];
    const other = rows.find((row) => row.getAttribute("data-current") !== "true");
    const rect = other.getBoundingClientRect();
    return { x: rect.left + 40, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(hoverTarget.x, hoverTarget.y);
  await sleep(300);
  evidence.menuHovered = await menuState(page);
  if (evidence.menuHovered) await shotAround(page, join(WORK, "menu-hover.png"), [evidence.menuHovered.rect], 16);
  await page.keyboard.press("Escape");

  await context.close();
  return evidence;
}

// ---------------------------------------------------------------------------
// Hero video — the primary flow, recorded off the real app.
// ---------------------------------------------------------------------------
async function captureHero(browser) {
  const videoDir = join(WORK, "video");
  rmSync(videoDir, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, colorScheme: "dark", recordVideo: { dir: videoDir, size: VIEW } });
  const started = Date.now();
  const page = await openApp(context);
  const loop = await placeRegion(page, "ss-loop", { x: 330, y: 300 });
  const block = await placeBlock(page, "Pose estimator", 140, 620);
  await sleep(700);
  const flowStart = (Date.now() - started) / 1000;

  // a) click the block → Inspector opens.
  const blockGrab = await headerCentre(page, block);
  await page.mouse.move(blockGrab.x - 200, blockGrab.y - 80);
  await page.mouse.move(blockGrab.x, blockGrab.y, { steps: 20 });
  await sleep(250);
  await page.mouse.click(blockGrab.x, blockGrab.y);
  await sleep(1400);
  // b) grab the For Loop BY ITS CARD and drag — the whole region travels.
  const cardGrab = await headerCentre(page, loop.cardId);
  await page.mouse.move(cardGrab.x, cardGrab.y, { steps: 20 });
  await sleep(250);
  await page.mouse.down();
  await page.mouse.move(cardGrab.x + 180, cardGrab.y + 60, { steps: 45 });
  await page.mouse.move(cardGrab.x + 120, cardGrab.y + 110, { steps: 30 });
  await page.mouse.up();
  await sleep(1400);
  // c) click empty canvas → the selection-opened Inspector closes.
  await page.mouse.move(760, 720, { steps: 20 });
  await page.mouse.click(760, 720);
  await sleep(1000);
  // d) the Shape family menu: Rectangle's row is highlighted, shortcuts aligned.
  await page.evaluate(() => { window.editor.setCurrentTool("geo"); });
  const trigger = await page.locator('[data-testid="ss-dock-family-shape"]').boundingBox();
  await page.mouse.move(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2, { steps: 20 });
  await page.mouse.click(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
  await sleep(700);
  const rows = await page.evaluate(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].pop();
    return [...menu.querySelectorAll('[role="menuitem"]')].slice(0, 4).map((row) => {
      const rect = row.getBoundingClientRect();
      return { x: rect.left + 60, y: rect.top + rect.height / 2 };
    });
  });
  for (const row of rows) {
    await page.mouse.move(row.x, row.y, { steps: 10 });
    await sleep(350);
  }
  await sleep(900);
  const flowEnd = (Date.now() - started) / 1000;
  const video = page.video();
  await context.close();
  const raw = await video.path();
  const webm = join(WORK, "hero.webm");
  const gif = join(WORK, "hero.gif");
  const duration = (flowEnd - flowStart).toFixed(2);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(flowStart), "-t", duration, "-i", raw, "-vf", "scale=1100:-2", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-an", webm]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(flowStart), "-t", duration, "-i", raw, "-vf", "fps=8,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none", gif]);
  return { webm, gif, seconds: Number(duration) };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const round = (value) => (typeof value === "number" ? Math.round(value * 10) / 10 : value);

function verdictRows(evidence) {
  const rows = [];
  const loopPlaced = evidence.loopPlaced;
  const loopDragged = evidence.loopDragged;
  const flushX = loopPlaced.faceRect && loopPlaced.frameRect ? loopPlaced.faceRect.left - loopPlaced.frameRect.left : null;
  const flushY = loopPlaced.faceRect && loopPlaced.frameRect ? loopPlaced.faceRect.top - loopPlaced.frameRect.top : null;
  rows.push(["For Loop card flush with the frame corner", `card local (${round(loopPlaced.cardLocal.x)}, ${round(loopPlaced.cardLocal.y)}); DOM offset from frame (${round(flushX)}, ${round(flushY)}) px`, loopPlaced.cardLocal.x === 0 && loopPlaced.cardLocal.y === 0]);
  rows.push([
    "Dragging the card moves the whole region",
    `region moved (${round(loopDragged.delta.x)}, ${round(loopDragged.delta.y)}); card still at local (${round(loopDragged.cardLocal.x)}, ${round(loopDragged.cardLocal.y)}); selection = ${loopDragged.selected.length === 1 && loopDragged.selected[0] === loopDragged.regionId ? "the region alone" : JSON.stringify(loopDragged.selected)}`,
    loopDragged.delta.x > 50 && loopDragged.delta.y > 30 && loopDragged.cardLocal.x === 0 && loopDragged.cardLocal.y === 0 && loopDragged.selected.length === 1 && loopDragged.selected[0] === loopDragged.regionId,
  ]);
  const branch = evidence.branch;
  const firstArm = branch.arms[0];
  rows.push([
    "Branch: `if` row starts below the card",
    firstArm ? `card bottom ${round(branch.faceRect.bottom)} px · "${esc(firstArm.text)}" row top ${round(firstArm.top)} px` : "no arm header found in the DOM",
    !!firstArm && firstArm.top >= branch.faceRect.bottom - 0.5 && branch.cardLocal.x === 0 && branch.cardLocal.y === 0,
  ]);
  const onBlock = evidence.inspectorOnBlock;
  rows.push(["Clicking a block opens the Inspector", `surface = ${onBlock.surface}; panel text: “${esc(onBlock.text ?? "")}”`, onBlock.surface === "inspector" && /Pose estimator/.test(onBlock.text ?? "")]);
  const onRegion = evidence.inspectorOnRegion;
  rows.push(["Clicking the For Loop card inspects the region (via its card)", `surface = ${onRegion.surface}; selection ${JSON.stringify(onRegion.selected)}; text “${esc(onRegion.text ?? "")}”`, onRegion.surface === "inspector" && /For Loop/.test(onRegion.text ?? "")]);
  rows.push(["Deselecting closes a selection-opened Inspector", `open after empty-canvas click: ${evidence.inspectorAfterDeselect.open}`, !evidence.inspectorAfterDeselect.open]);
  const menu = evidence.menu;
  if (menu) {
    const rights = menu.rows.map((row) => row.shortcutRight).filter((value) => value !== null);
    const spread = rights.length ? Math.max(...rights) - Math.min(...rights) : null;
    const current = menu.rows.find((row) => row.current);
    const plain = menu.rows.find((row) => !row.current);
    rows.push(["Menu: no check mark on any row", `${menu.rows.filter((row) => row.hasCheck).length} rows carry a check`, menu.rows.every((row) => !row.hasCheck)]);
    rows.push(["Menu: current row is highlighted", current ? `“${esc(current.label)}” ${current.background} vs plain ${plain?.background}` : "no row marked current", !!current && current.background !== plain?.background]);
    rows.push(["Menu: shortcuts share one right edge", `right edges ${JSON.stringify(rights)} → spread ${round(spread)} px`, spread !== null && spread <= 1]);
    const hovered = evidence.menuHovered?.rows.find((row) => row.current);
    rows.push(["Menu: highlight survives hovering another row", hovered ? `current row still ${hovered.background}` : "n/a", !!hovered && hovered.background === current?.background]);
  }
  return rows;
}

function buildHtml(evidence, hero, facts) {
  const img = (name, alt) => (existsSync(join(WORK, name)) ? `<img src="${dataUri(join(WORK, name), "image/png")}" alt="${esc(alt)}">` : `<p class="missing">capture missing: ${esc(name)}</p>`);
  const verdicts = verdictRows(evidence);
  const allPass = verdicts.every((row) => row[2]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch feedback · ${DATE}</title>
<style>
:root{--bg:#fafafa;--fg:#18181b;--muted:#71717a;--card:#fff;--line:#e4e4e7;--ok:#15803d;--bad:#b91c1c;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f10;--fg:#f4f4f5;--muted:#a1a1aa;--card:#18181b;--line:#27272a;--ok:#4ade80;--bad:#f87171;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 80px}h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:40px 0 10px;border-top:1px solid var(--line);padding-top:24px}
.lede{color:var(--muted);margin:0 0 18px}.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:13px}
.pass{background:color-mix(in oklab,var(--ok) 18%,transparent);color:var(--ok)}.fail{background:color-mix(in oklab,var(--bad) 18%,transparent);color:var(--bad)}
figure{margin:14px 0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}figure img,figure video{display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
td,th{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in oklab,var(--fg) 8%,transparent);padding:1px 5px;border-radius:4px}
ul{padding-left:20px}.missing{color:var(--bad)}.small{font-size:13px;color:var(--muted)}
</style></head><body><main>
<h1>SystemSketch feedback — ${DATE}</h1>
<p class="lede">Your three items from the Sep 21 daily note, built in three isolated lanes, merged on <code>${esc(facts.branch)}</code> @ <code>${esc(facts.sha)}</code>. Everything below was measured off the real running app at build time. <span class="pill ${allPass ? "pass" : "fail"}">${verdicts.filter((row) => row[2]).length}/${verdicts.length} checks pass</span></p>

<figure><video autoplay muted loop playsinline controls src="${dataUri(hero.webm, "video/webm")}"><img src="${dataUri(hero.gif, "image/gif")}" alt="hero flow"></video>
<figcaption>${hero.seconds.toFixed(1)} s, real app: click a block → Inspector opens · grab the For Loop by its card → the whole region travels · click empty canvas → Inspector closes · open the Shape menu → Rectangle's row is highlighted, shortcuts aligned.</figcaption></figure>

<h2>Checks (measured, not asserted)</h2>
<table><tr><th>Claim</th><th>Measured</th><th></th></tr>
${verdicts.map(([claim, measured, ok]) => `<tr><td>${claim}</td><td>${measured}</td><td><span class="pill ${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"}</span></td></tr>`).join("\n")}
</table>

<h2>1 · The loop / branch card is one object with its frame</h2>
<p>“You need to rigidly connect the for loop and branch block to the region frame. It should conceptually be one object.”</p>
<div class="grid">
${BEFORE && existsSync(BEFORE) ? `<figure><img src="${dataUri(BEFORE, "image/png")}" alt="Before, on main"><figcaption><strong>Before</strong> (main <code>68f5d19</code>, same script): dragging the card slid it loose inside the frame — your BAD screenshot, reproduced.</figcaption></figure>` : ""}
<figure>${img("loop-placed.png", "For Loop as placed")}<figcaption>Placed with the Loop tool — card flush on the frame's corner.</figcaption></figure>
<figure>${img("loop-dragged.png", "For Loop after dragging its card")}<figcaption>After dragging <em>the card</em> by (100, 90) screen px: the region moved (${round(evidence.loopDragged.delta.x)}, ${round(evidence.loopDragged.delta.y)}); the card sits at local (${round(evidence.loopDragged.cardLocal.x)}, ${round(evidence.loopDragged.cardLocal.y)}).</figcaption></figure>
<figure>${img("branch.png", "Branch")}<figcaption>Branch — the <code>if</code> row starts under the card, no overlap.</figcaption></figure>
</div>
${facts.laneA}

<h2>2 · The current tool is a highlighted row, not a check</h2>
<p>“Instead of showing a check mark and moving the hot key letter please to show it selected just highlight that line.”</p>
<div class="grid">
<figure>${img("menu.png", "Shape menu")}<figcaption>Shape family menu in the app: Rectangle is current — tinted row, no check, <code>R</code> in the same column as every other shortcut.</figcaption></figure>
<figure>${img("menu-hover.png", "Shape menu, hovering another row")}<figcaption>Pointer on another row: the hover highlight and the current-tool tint are different colours, so the two never read as the same thing.</figcaption></figure>
</div>
${facts.laneB}

<h2>3 · Clicking an object opens the Inspector</h2>
<p>“We need the right inspect menu to come up when we click on objects!”</p>
<div class="grid">
<figure>${img("inspector-block.png", "Inspector on a block")}<figcaption>One click on a block's header: the right rail opens on the Inspector, naming it.</figcaption></figure>
<figure>${img("inspector-region.png", "Inspector on the For Loop")}<figcaption>One click on the For Loop's card: the region is selected and the Inspector edits its card, the region's interface.</figcaption></figure>
</div>
${facts.laneC}

<h2>Tests on the merged tree</h2>
${facts.tests}

<p class="small">Built by <code>docs/build_ss_feedback_report.mjs</code> · Vite on :${PORT} (its own, stopped after capture) · Playwright Chromium ${esc(facts.chromium)} · ${new Date().toISOString()}</p>
</main></body></html>`;
}

// ---------------------------------------------------------------------------
const factsFile = argOf("--facts", null);
const facts = {
  branch: execFileSync("git", ["-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"]).toString().trim(),
  sha: execFileSync("git", ["-C", REPO, "rev-parse", "--short", "HEAD"]).toString().trim(),
  laneA: "",
  laneB: "",
  laneC: "",
  tests: "<p class=\"small\">(not supplied)</p>",
  ...(factsFile ? JSON.parse(readFileSync(factsFile, "utf8")) : {}),
};

const vite = await startVite();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  facts.chromium = browser.version();
  const evidence = await captureStills(browser);
  writeFileSync(join(WORK, "evidence.json"), JSON.stringify(evidence, null, 2));
  const hero = await captureHero(browser);
  const html = buildHtml(evidence, hero, facts);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html);
  const encoded = Buffer.byteLength(`data:text/html,${encodeURIComponent(html)}`);
  const ceiling = 2097024;
  console.log(JSON.stringify({ out: OUT, work: WORK, bytes: Buffer.byteLength(html), encoded, previewCeilingPct: Math.round((encoded / ceiling) * 100), checks: verdictRows(evidence).map(([claim, , ok]) => `${ok ? "PASS" : "FAIL"} ${claim}`) }, null, 2));
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}
