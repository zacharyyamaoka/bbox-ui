#!/usr/bin/env node
// docs/build_sep22_review_report.mjs — ONE review packet for everything
// delivered in bbox-ui on 2026-09-22 that had no report of its own:
//   1. opening a board writes nothing (and the Vite reload loop it caused);
//   2. hovering a region's corner card outlines the whole frame;
//   3. hit-region stories for BlockPort / Port / LabeledPort / PortEdge / BlockRegion;
//   4. BlockRegion views + the Blackbox toggle in three hosts (and its open bug);
//   5. collapsed member regions on a stack-mode block;
//   6. the BlockRegion-as-preset decision (linked; reported elsewhere);
//   7. in-flight placeholders.
//
// WHY one builder drives FIVE servers: each lane lives on its own branch in
// its own worktree, and "verify UI in the real app" (Zach's standing rule)
// means every capture below comes off the lane's own running Storybook or
// the real SystemSketch app — never a mock, never a story rendered from a
// different branch than the one under review. The ports are arguments so a
// re-run can never collide with Zach's :5421 / :4340 / :4572.
//
// Structure copies docs/build_ss_feedback_report.mjs: capture (Playwright's
// bundled Chromium, recordVideo for the heroes, ffmpeg to trim/compress),
// then one self-contained HTML with every still and clip inlined as a data
// URI. Everything numeric in the page is MEASURED here at build time.
//
// USAGE
//   node docs/build_sep22_review_report.mjs --work <dir> --out <file.html> \
//     --sb-feedback 5510 --sb-hit 5520 --sb-toggle 5530 --sb-members 5540 \
//     --app 4610 --board <abs .tldr served by --app> \
//     --app-inroot 4611 --board-inroot <abs .tldr INSIDE apps/systemsketch> \
//     [--vite-log <file>] [--skip-capture]
//
// The servers are started by the caller (see the handoff); this script never
// starts or stops one. `--skip-capture` rebuilds the HTML from <work>/facts.json
// and the media already in <work>.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const require = createRequire(join(REPO, "apps/systemsketch/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const has = (name) => args.includes(name);
const DATE = "2026-09-22";
// The sha a tree is at RIGHT NOW. Stamped into each item's facts at capture
// time, because peers merge into these worktrees while a run is going
// (the feedback branch moved twice during the first build) and a build-time
// sha would label a capture with code it never showed.
const shaOf = (dir) => { try { return dir ? execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"]).toString().trim() : null; } catch { return null; } };
const WT = { hit: argOf("--wt-hit", null), toggle: argOf("--wt-toggle", null), members: argOf("--wt-members", null) };
const WORK = argOf("--work", join(process.env.TMPDIR ?? "/tmp", `sep22-report-${process.pid}`));
const OUT = argOf("--out", join(WORK, `sep22-review-${DATE}.html`));
const PORTS = {
  feedback: Number(argOf("--sb-feedback", "5510")),
  hit: Number(argOf("--sb-hit", "5520")),
  toggle: Number(argOf("--sb-toggle", "5530")),
  toggleBefore: Number(argOf("--sb-toggle-before", "0")), // the pre-fix tree (73d975b), for the bracket before/after
  members: Number(argOf("--sb-members", "5540")),
  app: Number(argOf("--app", "4610")),
  appInRoot: Number(argOf("--app-inroot", "0")),
};
const BOARD = argOf("--board", null);
const BOARD_IN_ROOT = argOf("--board-inroot", null);
const VITE_LOG = argOf("--vite-log", null);
const VITE_LOG_IN_ROOT = argOf("--vite-log-inroot", null);
for (const [name, port] of Object.entries(PORTS)) {
  if ([5421, 4572, 4340, 63315].includes(port)) throw new Error(`${name} on :${port} is a reviewer's port — pick another`);
}
mkdirSync(join(WORK, "cap"), { recursive: true });
mkdirSync(join(WORK, "video"), { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const cap = (name) => join(WORK, "cap", name);
const rectOf = (r) => r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
const JPEG = { type: "jpeg", quality: 72 };

const storyUrl = (port, id, globals) => `http://127.0.0.1:${port}/iframe.html?id=${id}&viewMode=story${globals ? `&globals=${globals}` : ""}`;

/** Wait for the story's PLAY FUNCTION to finish before touching it. The
 *  toggle and views stories press their own toggle and drag their own node
 *  in `play`; measuring mid-play read a pressed toggle nobody had pressed.
 *  `storyRenders[0].phase` is Storybook's real render phase — measured on
 *  this Storybook (9.x): rendering → playing → completing → "finished" —
 *  unlike `reportedException`, which CLAUDE.md warns is not a property at
 *  all. A story that never reaches a terminal phase stops the wait at
 *  `timeout` rather than the capture. */
async function waitForPlay(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const render = window.__STORYBOOK_PREVIEW__?.storyRenders?.[0];
    return !!render && ["finished", "completed", "errored", "aborted"].includes(render.phase);
  }, null, { timeout }).catch(() => {});
}

async function openStory(context, port, id, { globals, ready = "#storybook-root [data-slot]", settle = 700 } = {}) {
  const page = await context.newPage();
  await page.goto(storyUrl(port, id, globals));
  await page.waitForSelector(ready, { timeout: 60000 });
  await waitForPlay(page);
  await sleep(settle);
  return page;
}

/** Clip screenshot around one or more DOM rects (viewport px), as JPEG. */
async function shotAround(page, file, rects, pad = 24, opts = {}) {
  const view = page.viewportSize();
  const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - pad);
  const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - pad);
  const right = Math.min(view.width, Math.max(...rects.map((r) => r.right)) + pad);
  const bottom = Math.min(view.height, Math.max(...rects.map((r) => r.bottom)) + pad);
  await page.screenshot({ path: file, clip: { x: left, y: top, width: right - left, height: bottom - top }, ...(file.endsWith(".png") ? {} : JPEG), ...opts });
  return file;
}

async function elementRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

async function centreOf(page, selector, fx = 0.5, fy = 0.5) {
  const r = await elementRect(page, selector);
  if (!r) throw new Error(`no element for ${selector}`);
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}

/** Trim + compress a Playwright recording into a small VP9 clip. */
function encodeClip(raw, name, start, seconds, width = 900) {
  const webm = join(WORK, "video", `${name}.webm`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(start), "-t", String(seconds), "-i", raw, "-vf", `fps=15,scale=${width}:-2`, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-deadline", "good", "-cpu-used", "2", "-an", webm]);
  return { webm, seconds: Number(seconds.toFixed(1)), bytes: statSync(webm).size };
}

async function recordingContext(browser, { width = 1280, height = 800, colorScheme = "light" } = {}) {
  return browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme, recordVideo: { dir: join(WORK, "video"), size: { width, height } } });
}

// ===========================================================================
// 1 · Opening a board writes nothing; the Vite reload loop
// ===========================================================================
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const fileFacts = (file) => {
  const st = statSync(file);
  let hasPose = null;
  try {
    hasPose = JSON.parse(readFileSync(file, "utf8")).records.some((r) => r.id === "shape:pose");
  } catch {}
  return { bytes: st.size, mtimeMs: st.mtimeMs, mtime: new Date(st.mtimeMs).toISOString().slice(11, 23), sha: sha(file).slice(0, 12), hasPose };
};

async function openBoard(context, port, board, { wait = 40000 } = {}) {
  const page = await context.newPage();
  const counters = { loads: 0, writes: 0, writeUrls: [] };
  page.on("load", () => (counters.loads += 1));
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/workspace/")) {
      counters.writes += 1;
      counters.writeUrls.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.goto(`http://127.0.0.1:${port}/?board=${board}`);
  await page.waitForFunction(() => !!window.editor?.getShape("shape:pose"), null, { timeout: wait });
  await sleep(600);
  return { page, counters };
}

async function captureItem1(browser) {
  const facts = { board: BOARD, boardInRoot: BOARD_IN_ROOT, capturedAt: shaOf(REPO) };
  // a) the idle test: open, wait 20 s, compare the bytes.
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
    const before = fileFacts(BOARD);
    const { page, counters } = await openBoard(context, PORTS.app, BOARD);
    const atOpen = fileFacts(BOARD);
    await shotAround(page, cap("1-board-open-light.jpg"), [{ left: 0, top: 0, right: 1400, bottom: 900 }], 0);
    await sleep(20000);
    const after = fileFacts(BOARD);
    facts.idle = { before, atOpen, after, loads: counters.loads, writes: counters.writes, writeUrls: counters.writeUrls, unchanged: before.sha === after.sha && before.mtimeMs === after.mtimeMs, title: await page.evaluate(() => document.querySelector('[data-testid="ss-chrome-title"]')?.textContent ?? document.title) };
    await context.close();
  }
  // b) the same board opened dark, for the colour comparison.
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
    const { page } = await openBoard(context, PORTS.app, BOARD);
    await shotAround(page, cap("1-board-open-dark.jpg"), [{ left: 0, top: 0, right: 1400, bottom: 900 }], 0);
    await context.close();
  }
  // c) the in-root probe: a board INSIDE apps/systemsketch (what Vite used to
  //    watch). Delete a shape so the app WRITES the file, then count reloads.
  if (PORTS.appInRoot && BOARD_IN_ROOT) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
    const before = fileFacts(BOARD_IN_ROOT);
    const { page, counters } = await openBoard(context, PORTS.appInRoot, BOARD_IN_ROOT);
    const loadsAtOpen = counters.loads;
    const grab = await centreOf(page, '[data-block-id="shape:pose"] [data-slot="block-header"]', 0.8, 0.5);
    await page.mouse.click(grab.x, grab.y);
    await sleep(300);
    await page.keyboard.press("Delete");
    await sleep(2500); // 600 ms debounce + the write
    const afterDelete = fileFacts(BOARD_IN_ROOT);
    await sleep(6000); // long enough for any Vite full reload to land
    facts.inRoot = { before, afterDelete, loadsAtOpen, loadsAfterWrite: counters.loads, writes: counters.writes, writeUrls: counters.writeUrls, shapeGoneInApp: await page.evaluate(() => !window.editor.getShape("shape:pose")) };
    await context.close();
  }
  // d) hero: delete → saved → Ctrl+Z → back on disk, with a disk readout.
  {
    const context = await recordingContext(browser, { colorScheme: "light" });
    const started = Date.now();
    const { page, counters } = await openBoard(context, PORTS.app, BOARD);
    await page.evaluate(() => {
      const hud = document.createElement("div");
      hud.id = "report-disk-hud";
      hud.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#111;color:#e8e8e8;font:13px/1.4 ui-monospace,Menlo,monospace;padding:6px 12px;pointer-events:none;white-space:pre";
      document.body.appendChild(hud);
    });
    let hudTimer = null;
    const timeline = [];
    const hud = async (label) => {
      const f = fileFacts(BOARD);
      const text = `recorder's disk readout (not app UI) — ${basename(BOARD)}\n${f.bytes.toLocaleString("en-US")} bytes · mtime ${f.mtime} · sha ${f.sha} · shape:pose in file: ${f.hasPose ? "YES" : "no"} · writes seen: ${counters.writes} · page loads: ${counters.loads}${label ? `\n${label}` : ""}`;
      try {
        await page.evaluate((t) => { const el = document.getElementById("report-disk-hud"); if (el) el.textContent = t; }, text);
      } catch {}
      return f;
    };
    let label = "opened by ?board= — idle";
    hudTimer = setInterval(() => void hud(label), 200);
    await sleep(2500);
    const flowStart = (Date.now() - started) / 1000;
    const t0 = fileFacts(BOARD);
    const grab = await centreOf(page, '[data-block-id="shape:pose"] [data-slot="block-header"]', 0.8, 0.5);
    await page.mouse.move(grab.x - 240, grab.y + 160);
    await page.mouse.move(grab.x, grab.y, { steps: 18 });
    await sleep(300);
    await page.mouse.click(grab.x, grab.y);
    await sleep(500);
    label = "Delete pressed → the app saves (600 ms debounce)";
    await page.keyboard.press("Delete");
    await sleep(2200);
    const t1 = fileFacts(BOARD);
    timeline.push({ step: "after Delete + save", ...t1, shapeInApp: await page.evaluate(() => !!window.editor.getShape("shape:pose")) });
    label = "Ctrl+Z → undo is a person's edit → saved again";
    await page.keyboard.press("Control+z");
    await sleep(2200);
    const t2 = fileFacts(BOARD);
    timeline.push({ step: "after Ctrl+Z + save", ...t2, shapeInApp: await page.evaluate(() => !!window.editor.getShape("shape:pose")) });
    label = "done — the shape is back on disk";
    await sleep(1400);
    const flowEnd = (Date.now() - started) / 1000;
    clearInterval(hudTimer);
    const video = page.video();
    await context.close();
    const raw = await video.path();
    facts.hero = { ...encodeClip(raw, "hero-1-undo", Math.max(0, flowStart - 0.8), flowEnd - flowStart + 0.8), t0, timeline, writes: counters.writes, loads: counters.loads, writeUrls: counters.writeUrls };
  }
  return facts;
}

// ===========================================================================
// 2 · Hover regions — the real app, then the Host Outline story
// ===========================================================================
/** The box tldraw's overlay canvas PAINTED — regionRigid.smoke.test.tsx's own
 *  ruler (`paintedOverlayBox`): the bounding box of every non-transparent
 *  pixel on `canvas.tl-canvas-overlays`. */
const PAINTED_BOX = `(() => {
  const canvas = document.querySelector("canvas.tl-canvas-overlays");
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return null;
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / canvas.width, sy = rect.height / canvas.height;
  return { left: rect.left + minX * sx, top: rect.top + minY * sy, right: rect.left + (maxX + 1) * sx, bottom: rect.top + (maxY + 1) * sy };
})()`;

const offBy = (a, b) => (a && b ? Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.right - b.right), Math.abs(a.bottom - b.bottom)) : null);

async function hoverGeometry(page, regionId, cardId) {
  return page.evaluate(
    ({ regionId, cardId, PAINTED }) => {
      const painted = eval(PAINTED);
      const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
      return {
        painted,
        frame: r(document.querySelector(`[data-shape-id="${regionId}"]`)),
        card: r(document.querySelector(`[data-block-id="${cardId}"]`)),
        hovered: window.editor.getHoveredShapeId(),
        selected: window.editor.getSelectedShapeIds(),
        editing: window.editor.getEditingShapeId(),
        cardView: window.editor.getShape(cardId)?.props?.view,
      };
    },
    { regionId, cardId, PAINTED: PAINTED_BOX },
  );
}

async function captureItem2(browser) {
  const facts = { app: {}, story: {}, capturedAt: shaOf(REPO) };
  // --- the real app ---
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
    const { page } = await openBoard(context, PORTS.app, BOARD);
    const enter = async (x, y) => {
      await page.mouse.move(2, 2);
      await page.mouse.move(x, y, { steps: 12 });
      await sleep(450);
    };
    // Hover the For Loop card's header → the FRAME is outlined.
    const head = await centreOf(page, '[data-block-id="shape:loop-corner"] [data-slot="block-header"]', 0.8, 0.5);
    await enter(head.x, head.y);
    const onCard = await hoverGeometry(page, "shape:loop", "shape:loop-corner");
    facts.app.hoverCard = { ...onCard, offFrame: offBy(onCard.painted, onCard.frame), offCard: offBy(onCard.painted, onCard.card) };
    await shotAround(page, cap("2-app-hover-card.jpg"), [onCard.frame, onCard.card], 40);
    // Hover the card's BODY (below the header) — still the frame.
    const body = await centreOf(page, '[data-block-id="shape:loop-corner"]', 0.5, 0.8);
    await enter(body.x, body.y);
    const onBody = await hoverGeometry(page, "shape:loop", "shape:loop-corner");
    facts.app.hoverCardBody = { ...onBody, offFrame: offBy(onBody.painted, onBody.frame) };
    // Hover the plain block → only IT is outlined.
    const pose = await centreOf(page, '[data-block-id="shape:pose"] [data-slot="block-header"]', 0.8, 0.5);
    await enter(pose.x, pose.y);
    const onPose = await page.evaluate((PAINTED) => {
      const painted = eval(PAINTED);
      const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
      return { painted, block: r(document.querySelector('[data-shape-id="shape:pose"]')), frame: r(document.querySelector('[data-shape-id="shape:loop"]')), hovered: window.editor.getHoveredShapeId() };
    }, PAINTED_BOX);
    facts.app.hoverPlain = { ...onPose, offBlock: offBy(onPose.painted, onPose.block) };
    await shotAround(page, cap("2-app-hover-plain.jpg"), [onPose.block, onPose.frame], 40);
    // Rename: double-click the title → editing session on the CARD, outline on the FRAME.
    const title = await centreOf(page, '[data-block-id="shape:loop-corner"] [data-slot="block-header"]', 0.35, 0.5);
    await enter(title.x, title.y);
    await page.mouse.dblclick(title.x, title.y);
    await sleep(600);
    const renaming = await hoverGeometry(page, "shape:loop", "shape:loop-corner");
    facts.app.renaming = { ...renaming, offFrame: offBy(renaming.painted, renaming.frame), offCard: offBy(renaming.painted, renaming.card) };
    await shotAround(page, cap("2-app-renaming.jpg"), [renaming.frame, renaming.card], 40);
    await page.keyboard.press("Escape");
    await sleep(300);
    await page.evaluate(() => { window.editor.selectNone(); });
    // Hinted: the public API puts the card in the hint list; paint is the frame.
    await page.mouse.move(2, 2);
    await sleep(200);
    await page.evaluate(() => { window.editor.setHintingShapes(["shape:loop-corner"]); });
    await sleep(400);
    const hinted = await hoverGeometry(page, "shape:loop", "shape:loop-corner");
    facts.app.hinted = { ...hinted, offFrame: offBy(hinted.painted, hinted.frame), offCard: offBy(hinted.painted, hinted.card) };
    await shotAround(page, cap("2-app-hinted.jpg"), [hinted.frame, hinted.card], 40);
    await page.evaluate(() => { window.editor.setHintingShapes([]); });
    // The card always wears Port view: select the region, press 3 (Expanded).
    await page.evaluate(() => { window.editor.select("shape:loop"); });
    await sleep(200);
    await page.keyboard.press("3");
    await sleep(500);
    facts.app.cardViewAfterHotkey3 = await page.evaluate(() => ({ card: window.editor.getShape("shape:loop-corner").props.view, selected: window.editor.getSelectedShapeIds() }));
    await page.evaluate(() => { window.editor.updateShape({ id: "shape:loop-corner", type: "ss-block", props: { view: "expanded" } }); });
    await sleep(300);
    facts.app.cardViewAfterDirectWrite = await page.evaluate(() => window.editor.getShape("shape:loop-corner").props.view);
    await context.close();
  }
  // --- hero: the real app, pointer over the card, then a plain block ---
  {
    const context = await recordingContext(browser, { colorScheme: "light" });
    const started = Date.now();
    const { page } = await openBoard(context, PORTS.app, BOARD);
    await page.evaluate(() => { window.editor.zoomToFit(); window.editor.zoomOut(); window.editor.zoomIn(); });
    await sleep(700);
    const flowStart = (Date.now() - started) / 1000;
    const head = await centreOf(page, '[data-block-id="shape:loop-corner"] [data-slot="block-header"]', 0.8, 0.5);
    const pose = await centreOf(page, '[data-block-id="shape:pose"] [data-slot="block-header"]', 0.8, 0.5);
    const branch = await centreOf(page, '[data-block-id="shape:branch-corner"] [data-slot="block-header"]', 0.8, 0.5);
    await page.mouse.move(head.x - 260, head.y + 220);
    await sleep(300);
    await page.mouse.move(head.x, head.y, { steps: 30 });
    await sleep(1400);
    await page.mouse.move(head.x, head.y + 40, { steps: 10 });
    await sleep(700);
    await page.mouse.move(pose.x, pose.y, { steps: 34 });
    await sleep(1400);
    await page.mouse.move(branch.x, branch.y, { steps: 34 });
    await sleep(1400);
    await page.mouse.move(branch.x + 120, branch.y + 260, { steps: 24 });
    await sleep(900);
    const flowEnd = (Date.now() - started) / 1000;
    const video = page.video();
    await context.close();
    facts.hero = encodeClip(await video.path(), "hero-2-hover", flowStart, flowEnd - flowStart);
  }
  // --- the Host Outline story: three hosts, two probes each ---
  {
    const context = await browser.newContext({ viewport: { width: 1240, height: 860 }, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await openStory(context, PORTS.feedback, "hit-regions-host-outline--playground", { ready: '[data-testid="host-outline-bench"]' });
    const hosts = [
      { id: "react-flow", label: "React Flow bench" },
      { id: "tldraw", label: "tldraw bench" },
      { id: "policy", label: "Policy (dragPolicy)" },
    ];
    facts.story.hosts = {};
    // Where a block's header (and the band under it) sits, from the host's
    // OWN DOM — React Flow positions its nodes a beat after mount, so wait
    // until two reads 300 ms apart agree before trusting the geometry.
    const blockGeometry = () =>
      page.evaluate(() => {
        const root = document.querySelector("[data-host-root]");
        const r = (el) => el && (({ left, top, width, height }) => ({ left, top, width, height }))(el.getBoundingClientRect());
        const of = (id) => {
          const block = root?.querySelector(`[data-block-id="${id}"]`);
          return block ? { block: r(block), header: r(block.querySelector('[data-slot="block-header"]')) } : null;
        };
        return { loop: of("loop"), load: of("load"), bench: r(document.querySelector('[data-testid="host-outline-bench"]')) };
      });
    const settledGeometry = async () => {
      let last = null;
      for (let i = 0; i < 12; i += 1) {
        const now = await blockGeometry();
        if (last && JSON.stringify(now) === JSON.stringify(last) && now.loop?.header && now.load?.header) return now;
        last = now;
        await sleep(300);
      }
      return last;
    };
    for (const host of hosts) {
      await page.getByRole("button", { name: host.label }).click();
      await sleep(host.id === "tldraw" ? 1500 : 900);
      const geometry = await settledGeometry();
      const probe = async (name, target) => {
        const part = geometry?.[target.block];
        if (!part?.header) return { missing: `${target.block} in the ${host.id} host` };
        const at = target.where === "header" ? { x: part.header.left + part.header.width * 0.55, y: part.header.top + part.header.height / 2 } : { x: part.block.left + part.block.width / 2, y: part.header.top + part.header.height + 22 };
        // Approach from INSIDE the bench, so the pointer never leaves it
        // (leaving resets the readout) on the way to the target.
        const bench = geometry.bench;
        await page.mouse.move(bench.left + bench.width / 2, bench.top + bench.height - 30);
        await page.mouse.move(at.x, at.y, { steps: 12 });
        await sleep(450);
        const read = await page.evaluate(() => {
          const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
          return { caption: document.querySelector('[data-testid="host-outline-caption"]')?.textContent?.replace(/\s+/g, " ").trim(), outline: r(document.querySelector('[data-slot="host-outline"]')), bench: r(document.querySelector('[data-testid="host-outline-bench"]')) };
        });
        const benchRect = read.bench;
        const captionRect = await elementRect(page, '[data-testid="host-outline-caption"]');
        await shotAround(page, cap(`2-host-${host.id}-${name}.jpg`), [benchRect, captionRect ?? benchRect], 12);
        return { at, caption: read.caption, outline: read.outline };
      };
      facts.story.hosts[host.id] = {
        cornerHeader: await probe("corner-header", { block: "loop", where: "header" }),
        plainBody: await probe("plain-body", { block: "load", where: "body" }),
      };
    }
    await context.close();
  }
  return facts;
}

// ===========================================================================
// 3 · Hit regions — one still per component, a hero across BlockPort's views
// ===========================================================================
async function ensureHostOutline(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) => /Show host outline/.test(l.textContent ?? ""));
    const input = label?.querySelector("input");
    if (input && !input.checked) input.click();
    return !!input?.checked || !!input;
  });
}

async function readOutline(page) {
  return page.evaluate(() => {
    const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
    const outline = document.querySelector('[data-slot="host-outline"]');
    return { readout: document.querySelector('[data-slot="host-outline-readout"]')?.textContent?.trim() ?? null, outline: r(outline), outlineStyle: outline ? getComputedStyle(outline).outlineStyle : null };
  });
}

const HIT_STORIES = [
  { key: "blockport-simple", id: "components-blocks-blockport-hit-regions--simple", label: "BlockPort · Simple", node: '[data-testid="node"]', probes: [{ name: "header", sel: '[data-testid="node"] [data-slot="block-header"]', fx: 0.7 }, { name: "dot", sel: '[data-testid="node"] [data-slot="port-dot"]' }] },
  { key: "blockport-port", id: "components-blocks-blockport-hit-regions--port", label: "BlockPort · Port", node: '[data-testid="node"]', probes: [{ name: "header", sel: '[data-testid="node"] [data-slot="block-header"]', fx: 0.7 }, { name: "dot", sel: '[data-testid="node"] [data-slot="port-dot"]' }] },
  { key: "blockport-expanded", id: "components-blocks-blockport-hit-regions--expanded", label: "BlockPort · Expanded", node: '[data-testid="node"]', probes: [{ name: "header", sel: '[data-testid="node"] [data-slot="block-header"]', fx: 0.7 }, { name: "member", sel: '[data-testid="member-load"] [data-slot="block-header"]' }, { name: "dot", sel: '[data-testid="node"] [data-slot="port-dot"]' }] },
  { key: "blockport-expanded-opaque", id: "components-blocks-blockport-hit-regions--expanded-opaque", label: "BlockPort · Expanded Opaque", node: '[data-testid="node"]', probes: [{ name: "header", sel: '[data-testid="node"] [data-slot="block-header"]', fx: 0.7 }, { name: "dot", sel: '[data-testid="node"] [data-slot="port-dot"]' }] },
  { key: "port", id: "components-ports-port-hit-regions--playground", label: "Port", node: '[data-testid="port-row"]', probes: [{ name: "dot", sel: '[data-testid="port-row"] [data-slot="port-dot"]' }] },
  { key: "labeledport", id: "components-ports-labeledport-hit-regions--playground", label: "LabeledPort", node: '[data-testid="labeled-row"]', probes: [{ name: "label", sel: '[data-testid="labeled-row"] [data-slot="port-label"]' }, { name: "dot", sel: '[data-testid="labeled-row"] [data-slot="port-dot"]' }] },
  { key: "portedge", id: "components-ports-portedge-hit-regions--playground", label: "PortEdge", node: '[data-slot="port-edge"]', probes: [{ name: "dot", sel: '[data-slot="port-edge"] [data-slot="port-dot"]' }, { name: "label", sel: '[data-slot="port-edge"] [data-slot="port-label"]' }] },
  { key: "blockregion", id: "components-blocks-blockregion-hit-regions--expanded", label: "BlockRegion · Expanded", node: '[data-testid="node-loop"]', probes: [{ name: "corner-header", sel: '[data-testid="node-loop"] [data-slot="block-header"]', fx: 0.7 }, { name: "member", sel: '[data-testid="member-merge"] [data-slot="block-header"]' }] },
];

async function captureItem3(browser) {
  const facts = { stories: {}, capturedAt: shaOf(WT.hit) };
  const context = await browser.newContext({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  for (const story of HIT_STORIES) {
    const page = await openStory(context, PORTS.hit, story.id, { ready: story.node });
    await ensureHostOutline(page);
    await sleep(200);
    const probes = {};
    let first = true;
    for (const probe of story.probes) {
      const at = await centreOf(page, probe.sel, probe.fx ?? 0.5, probe.fy ?? 0.5).catch(() => null);
      if (!at) { probes[probe.name] = { missing: probe.sel }; continue; }
      await page.mouse.move(at.x - 90, at.y + 160);
      await page.mouse.move(at.x, at.y, { steps: 10 });
      await sleep(350);
      probes[probe.name] = { at, ...(await readOutline(page)) };
      if (first) {
        const root = await elementRect(page, "#storybook-root");
        await shotAround(page, cap(`3-${story.key}.jpg`), [root], 0);
        first = false;
      }
    }
    facts.stories[story.key] = { label: story.label, id: story.id, probes };
    await page.close();
  }
  await context.close();
  // hero: sweep the pointer across a BlockPort in each of its four views.
  {
    // 1100 wide keeps the story's control row on one line; the checkbox
    // click can scroll the page, so it is scrolled back before the sweep.
    const rc = await recordingContext(browser, { width: 1100, height: 700, colorScheme: "light" });
    const page = await rc.newPage();
    const started = Date.now();
    let flowStart = null;
    for (const story of HIT_STORIES.slice(0, 4)) {
      await page.goto(storyUrl(PORTS.hit, story.id));
      await page.waitForSelector(story.node, { timeout: 60000 });
      await waitForPlay(page);
      await sleep(500);
      await ensureHostOutline(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(200);
      if (flowStart === null) flowStart = (Date.now() - started) / 1000;
      const points = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="node"]');
        const c = (el, fx = 0.5, fy = 0.5) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }; };
        const dots = [...node.querySelectorAll('[data-slot="port-dot"]')];
        const header = node.querySelector('[data-slot="block-header"]');
        const member = node.querySelector('[data-testid^="member-"] [data-slot="block-header"]');
        const body = node.querySelector('[data-slot="block-body"], [data-slot="block-members"]');
        return [dots[0] && c(dots[0]), header && c(header, 0.6), body && c(body, 0.5, 0.5), member && c(member), dots[dots.length - 1] && c(dots[dots.length - 1])].filter(Boolean);
      });
      if (points.length) await page.mouse.move(points[0].x - 80, points[0].y + 120);
      for (const p of points) {
        await page.mouse.move(p.x, p.y, { steps: 14 });
        await sleep(520);
      }
      await sleep(300);
    }
    const flowEnd = (Date.now() - started) / 1000;
    const video = page.video();
    await rc.close();
    facts.hero = encodeClip(await video.path(), "hero-3-hit", flowStart ?? 0, flowEnd - (flowStart ?? 0), 820);
  }
  return facts;
}

// ===========================================================================
// 4 · BlockRegion views + the Blackbox toggle in three hosts
// ===========================================================================
async function pickSelect(page, triggerSelector, optionName) {
  await page.click(triggerSelector);
  await sleep(250);
  await page.getByRole("option", { name: optionName, exact: true }).click();
  await sleep(500);
}

async function regionFacts(page, root = '[data-slot="region"]') {
  return page.evaluate((rootSel) => {
    // `root` may be the HOST's wrapper (`[data-scene-node]`); the view and
    // the parts live on the region element inside it.
    const rootEl = document.querySelector(rootSel);
    const region = rootEl?.matches('[data-slot="region"]') ? rootEl : (rootEl?.querySelector('[data-slot="region"]') ?? rootEl);
    const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
    const toggle = region?.querySelector('[aria-label="Blackbox toggle"]');
    const frame = region?.querySelector('[data-slot="region-frame"]');
    const opaque = region?.querySelector('[data-slot="region-opaque-face"]');
    const borders = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth, radius: cs.borderTopLeftRadius }; };
    // The stroke a person SEES on the region's box: per side, the widest
    // border with a non-transparent colour among every element that spans
    // the region's rect. WHY not one element's widths: at 885c59f the
    // opaque face paints the bracket while a full-size Block beneath it
    // still carries a 2 px border of transparent colour — width alone
    // would call the fix a bug.
    const alphaOf = (colour) => {
      if (!colour || colour === "transparent") return 0;
      const rgba = colour.match(/^rgba?\([^)]*?,\s*([\d.]+)\)$/);
      if (rgba) return Number(rgba[1]);
      const slash = colour.match(/\/\s*([\d.]+%?)\s*\)$/);
      if (slash) return slash[1].endsWith("%") ? Number(slash[1].slice(0, -1)) / 100 : Number(slash[1]);
      return 1;
    };
    const framePaint = (() => {
      if (!region) return null;
      const box = region.getBoundingClientRect();
      const spans = [region, ...region.querySelectorAll("*")].filter((el) => { const b = el.getBoundingClientRect(); return Math.abs(b.left - box.left) <= 1.5 && Math.abs(b.top - box.top) <= 1.5 && Math.abs(b.width - box.width) <= 1.5 && Math.abs(b.height - box.height) <= 1.5; });
      const paint = { top: 0, right: 0, bottom: 0, left: 0, radius: "0px", by: [] };
      for (const el of spans) {
        const cs = getComputedStyle(el);
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const width = parseFloat(cs[`border${side}Width`]) || 0;
          const visible = alphaOf(cs[`border${side}Color`]) > 0 ? width : 0;
          const key = side.toLowerCase();
          if (visible > paint[key]) { paint[key] = visible; if (!paint.by.includes(el.dataset.slot ?? el.tagName)) paint.by.push(el.dataset.slot ?? el.tagName); }
        }
        if (parseFloat(cs.borderTopLeftRadius) > parseFloat(paint.radius)) paint.radius = cs.borderTopLeftRadius;
      }
      return { top: `${paint.top}px`, right: `${paint.right}px`, bottom: `${paint.bottom}px`, left: `${paint.left}px`, radius: paint.radius, by: paint.by };
    })();
    return {
      view: region?.getAttribute("data-region-view") ?? null,
      region: r(region),
      framePaint,
      frame: r(frame),
      frameBorders: borders(frame),
      opaqueFace: r(opaque),
      opaqueCard: r(opaque?.querySelector('[data-slot="block"]')),
      opaqueCardBorders: borders(opaque?.querySelector('[data-slot="block"]')),
      members: region ? region.querySelectorAll("[data-member-id]").length : 0,
      chevrons: region ? region.querySelectorAll('[data-slot="folding-chevron"]').length : 0,
      toggle: r(toggle),
      togglePressed: toggle?.getAttribute("aria-pressed") ?? null,
      toggleBg: toggle ? getComputedStyle(toggle).backgroundColor : null,
      toggleFill: toggle?.querySelector("svg")?.getAttribute("fill") ?? null,
      select: document.querySelector('[aria-label="View"], [aria-label="Region view"]')?.textContent?.replace(/▼|\s+/g, " ").trim() ?? null,
    };
  }, root);
}

async function captureItem4(browser) {
  const facts = { views: {}, hosts: {}, bug: {}, capturedAt: shaOf(WT.toggle) };
  // --- Views story: each view, light and dark ---
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1, colorScheme: scheme });
    const page = await openStory(context, PORTS.toggle, "components-blocks-blockregion-views--with-members-and-ports", { ready: '[data-slot="region"]' });
    for (const view of ["Expanded", "Expanded Opaque", "Port"]) {
      await pickSelect(page, '[aria-label="View"]', view);
      const f = await regionFacts(page);
      facts.views[`${view}|${scheme}`] = f;
      const sel = await elementRect(page, '[aria-label="View"]');
      await shotAround(page, cap(`4-view-${view.toLowerCase().replace(/ /g, "-")}-${scheme}.jpg`), [f.region, sel ?? f.region], 28);
    }
    if (scheme === "light") {
      const empty = await openStory(context, PORTS.toggle, "components-blocks-blockregion-views--empty", { ready: '[data-slot="region"]' });
      const f = await regionFacts(empty);
      facts.views["Empty|light"] = f;
      const sel = await elementRect(empty, '[aria-label="View"]');
      await shotAround(empty, cap("4-view-empty-light.jpg"), [f.region, sel ?? f.region], 28);
    }
    await context.close();
  }
  // --- the toggle in three hosts ---
  {
    const context = await browser.newContext({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 1, colorScheme: "light" });
    for (const host of [
      { key: "dom-canvas", id: "components-blocks-blockregion-toggle--dom-canvas", label: "DOM canvas" },
      { key: "react-flow", id: "components-blocks-blockregion-toggle--react-flow", label: "React Flow" },
      { key: "tldraw", id: "components-blocks-blockregion-toggle--tldraw", label: "tldraw" },
    ]) {
      const page = await openStory(context, PORTS.toggle, host.id, { ready: '[aria-label="Blackbox toggle"]', settle: host.key === "tldraw" ? 1500 : 800 });
      // The story's own play function ends with the toggle wherever its
      // last step left it (pressed on React Flow and tldraw, measured);
      // start every host from RELEASED so the three rounds compare.
      const wasPressed = await page.evaluate(() => document.querySelector('[data-scene-node="loop"] [aria-label="Blackbox toggle"]')?.getAttribute("aria-pressed") === "true");
      if (wasPressed) {
        await page.click('[data-scene-node="loop"] [aria-label="Blackbox toggle"]');
        await sleep(700);
      }
      const before = await regionFacts(page, '[data-scene-node="loop"]');
      const nodeBefore = await elementRect(page, '[data-scene-node="loop"]');
      await page.click('[data-scene-node="loop"] [aria-label="Blackbox toggle"]');
      await sleep(700);
      const pressed = await regionFacts(page, '[data-scene-node="loop"]');
      const nodePressed = await elementRect(page, '[data-scene-node="loop"]');
      const root = await elementRect(page, "#storybook-root");
      await shotAround(page, cap(`4-host-${host.key}-pressed.jpg`), [root], 0);
      await page.click('[data-scene-node="loop"] [aria-label="Blackbox toggle"]');
      await sleep(700);
      const released = await regionFacts(page, '[data-scene-node="loop"]');
      const nodeReleased = await elementRect(page, '[data-scene-node="loop"]');
      await shotAround(page, cap(`4-host-${host.key}.jpg`), [root], 0);
      facts.hosts[host.key] = { label: host.label, playLeftItPressed: wasPressed, before, pressed, released, nodeBefore, nodePressed, nodeReleased, sameBoxWhilePressed: nodeBefore && nodePressed && Math.abs(nodeBefore.left - nodePressed.left) < 0.5 && Math.abs(nodeBefore.top - nodePressed.top) < 0.5 && Math.abs(nodeBefore.width - nodePressed.width) < 0.5 && Math.abs(nodeBefore.height - nodePressed.height) < 0.5 };
      await page.close();
    }
    await context.close();
  }
  // --- hero on React Flow: toggle → opaque, toggle → expanded, dropdown → Port ---
  {
    const rc = await recordingContext(browser, { width: 1000, height: 560, colorScheme: "light" });
    const page = await rc.newPage();
    const started = Date.now();
    await page.goto(storyUrl(PORTS.toggle, "components-blocks-blockregion-toggle--react-flow"));
    await page.waitForSelector('[aria-label="Blackbox toggle"]', { timeout: 60000 });
    await waitForPlay(page);
    await sleep(900);
    const flowStart = (Date.now() - started) / 1000;
    const toggle = await centreOf(page, '[data-scene-node="loop"] [aria-label="Blackbox toggle"]');
    await page.mouse.move(toggle.x - 200, toggle.y + 220);
    await page.mouse.move(toggle.x, toggle.y, { steps: 24 });
    await sleep(500);
    await page.mouse.click(toggle.x, toggle.y);
    await sleep(1500);
    await page.mouse.click(toggle.x, toggle.y);
    await sleep(1500);
    const sel = await centreOf(page, '[aria-label="Region view"]');
    await page.mouse.move(sel.x, sel.y, { steps: 20 });
    await page.mouse.click(sel.x, sel.y);
    await sleep(600);
    const opt = await page.getByRole("option", { name: "Port", exact: true }).boundingBox();
    await page.mouse.move(opt.x + opt.width / 2, opt.y + opt.height / 2, { steps: 12 });
    await sleep(300);
    await page.mouse.click(opt.x + opt.width / 2, opt.y + opt.height / 2);
    await sleep(1600);
    const flowEnd = (Date.now() - started) / 1000;
    const video = page.video();
    await rc.close();
    facts.hero = encodeClip(await video.path(), "hero-4-toggle", flowStart, flowEnd - flowStart, 820);
  }
  // --- the bracket: v4 + default skin, Expanded → press Blackbox. At 73d975b
  //     the press closed the bracket and thickened the stroke (the bug); at
  //     885c59f one frame paint serves both views. Captured from BOTH trees
  //     when `--sb-toggle-before` names the older one.
  facts.bug = await captureBracketCrops(browser, PORTS.toggle, "4-bug");
  if (PORTS.toggleBefore) facts.bugBefore = await captureBracketCrops(browser, PORTS.toggleBefore, "4-was");
  return facts;
}

/** Bottom-right corner crops (2×) of the v4 bracket in Expanded and after
 *  pressing Blackbox, plus the computed borders of whatever paints the
 *  frame in each view. */
async function captureBracketCrops(browser, port, prefix) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2, colorScheme: "light" });
  const page = await openStory(context, port, "components-blocks-blockregion-views--with-members-and-ports", { ready: '[data-slot="region"]', globals: "regionVariant:v4;skin:default" });
  await pickSelect(page, '[aria-label="View"]', "Expanded");
  const before = await regionFacts(page);
  // The bottom-LEFT corner: v4's 1 px left line runs down and stops with
  // no bottom rule, so an open bracket, a closing box and a thicker stroke
  // all show in one crop (the bottom-right corner is blank whenever the
  // bracket is open — no evidence either way).
  const cropOf = (f) => [{ left: f.region.left - 8, top: f.region.bottom - 150, right: f.region.left + 252, bottom: f.region.bottom + 8 }];
  await shotAround(page, cap(`${prefix}-before.png`), cropOf(before), 0);
  await shotAround(page, cap(`${prefix}-before-full.jpg`), [before.region], 20);
  await page.click('[aria-label="Blackbox toggle"]');
  await sleep(700);
  const after = await regionFacts(page);
  await shotAround(page, cap(`${prefix}-after.png`), cropOf(after), 0);
  await shotAround(page, cap(`${prefix}-after-full.jpg`), [after.region], 20);
  const paint = (f) => f.framePaint ?? null;
  const same = (a, b) => !!a && !!b && ["top", "right", "bottom", "left", "radius"].every((k) => a[k] === b[k]);
  const result = { port, before, after, paintBefore: paint(before), paintAfter: paint(after), paintUnchanged: same(paint(before), paint(after)), boxUnchanged: !!before.region && !!after.region && Math.abs(before.region.width - after.region.width) < 0.5 && Math.abs(before.region.height - after.region.height) < 0.5, variant: await page.evaluate(() => document.documentElement.dataset.bboxRegionVariant), skin: await page.evaluate(() => document.querySelector("[data-bbox-skin]")?.getAttribute("data-bbox-skin")) };
  await context.close();
  return result;
}

// ===========================================================================
// 5 · Collapsed member regions
// ===========================================================================
async function membersCellFacts(page, testid) {
  return page.evaluate((id) => {
    const cell = document.querySelector(`[data-testid="${id}"]`);
    const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
    const members = r(cell.querySelector('[data-slot="block-members"]'));
    const block = r(cell.querySelector('[data-slot="block"]'));
    const bands = [...cell.querySelectorAll('[data-slot="block-member-band"]')].map((b) => r(b));
    return {
      view: cell.querySelector("[data-view]")?.getAttribute("data-view") ?? null,
      headers: cell.querySelector("[data-member-headers]")?.getAttribute("data-member-headers") ?? null,
      dots: cell.querySelectorAll('[data-slot="port-dot"]').length,
      bandCount: bands.length,
      bandHeaders: cell.querySelectorAll('[data-slot="block-member-band-header"]').length,
      memberHeaders: cell.querySelectorAll('[data-slot="block-member-header"]').length,
      bandsEdgeToEdge: bands.length ? bands.every((b) => Math.abs(b.left - block.left) <= 2.5 && Math.abs(b.right - block.right) <= 2.5) : null,
      bandInset: bands.length && block ? { left: Math.round((bands[0].left - block.left) * 10) / 10, right: Math.round((block.right - bands[0].right) * 10) / 10 } : null,
      block,
      members,
      cell: r(cell),
    };
  }, testid);
}

async function captureItem5(browser) {
  const facts = { cells: {}, capturedAt: shaOf(WT.members) };
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme });
    const page = await openStory(context, PORTS.members, "components-blocks-blockportmembers-collapsed-members--grid", { ready: '[data-testid="cell-port-hide"] [data-slot="port-dot"]', settle: 900 });
    for (const cell of ["cell-expanded-show", "cell-expanded-hide", "cell-port-show", "cell-port-hide"]) {
      const f = await membersCellFacts(page, cell);
      facts.cells[`${cell}|${scheme}`] = f;
      await shotAround(page, cap(`5-${cell}-${scheme}.jpg`), [f.cell], 6);
    }
    await context.close();
  }
  // hero: LiveSwitch — headers off, headers on, Port view off (expanded), on again.
  {
    const rc = await recordingContext(browser, { width: 900, height: 620, colorScheme: "light" });
    const page = await rc.newPage();
    const started = Date.now();
    await page.goto(storyUrl(PORTS.members, "components-blocks-blockportmembers-collapsed-members--live-switch"));
    await page.waitForSelector('[data-testid="live"] [data-slot="port-dot"]', { timeout: 60000 });
    await waitForPlay(page);
    await sleep(900);
    const flowStart = (Date.now() - started) / 1000;
    const headers = await page.getByRole("switch", { name: "Member headers" }).boundingBox();
    const portView = await page.getByRole("switch", { name: "Port view" }).boundingBox();
    const c = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    await page.mouse.move(c(headers).x - 200, c(headers).y + 260);
    await page.mouse.move(c(headers).x, c(headers).y, { steps: 22 });
    await sleep(400);
    await page.mouse.click(c(headers).x, c(headers).y);
    await sleep(1500);
    await page.mouse.click(c(headers).x, c(headers).y);
    await sleep(1300);
    await page.mouse.move(c(portView).x, c(portView).y, { steps: 16 });
    await sleep(300);
    await page.mouse.click(c(portView).x, c(portView).y);
    await sleep(1500);
    await page.mouse.click(c(portView).x, c(portView).y);
    await sleep(1400);
    const flowEnd = (Date.now() - started) / 1000;
    const video = page.video();
    await rc.close();
    facts.hero = encodeClip(await video.path(), "hero-5-members", flowStart, flowEnd - flowStart, 760);
  }
  return facts;
}

// ===========================================================================
// HTML
// ===========================================================================
const dataUri = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const round = (v, d = 1) => (typeof v === "number" ? Math.round(v * 10 ** d) / 10 ** d : v);
const px = (v) => (typeof v === "number" ? `${round(v)} px` : "n/a");
// WHY no loading="lazy": the src is an inline data URI, so there is nothing
// to defer — and a lazy image with no intrinsic size lays out 0×0 in a
// headless full-page render, which is exactly the "blank media" a render
// check exists to catch.
const img = (name, alt) => (existsSync(cap(name)) ? `<img src="${dataUri(cap(name), name.endsWith(".png") ? "image/png" : "image/jpeg")}" alt="${esc(alt)}">` : `<p class="missing">capture missing: ${esc(name)}</p>`);
const fig = (name, caption) => `<figure>${img(name, caption.replace(/<[^>]+>/g, ""))}<figcaption>${caption}</figcaption></figure>`;
const video = (clip, caption) => (clip && existsSync(clip.webm) ? `<figure class="hero"><video autoplay muted loop playsinline controls src="${dataUri(clip.webm, "video/webm")}">Your browser cannot play WebM.</video><figcaption>${clip.seconds} s · ${caption}</figcaption></figure>` : `<p class="missing">hero clip missing</p>`);
const pill = (ok, yes = "PASS", no = "FAIL") => `<span class="pill ${ok ? "pass" : "fail"}">${ok ? yes : no}</span>`;
// The pill's colour is the LATEST state in the text: a verdict that ends in
// PASS is green whatever it went through; one still being fixed or
// re-judged is amber; a bare FAIL is red.
const codexPill = (text) => { const cls = /^PASS|PASS\s*$/.test(text) ? "pass" : /fixing|fix round|re-judge|running/.test(text) ? "wait" : /FAIL/.test(text) ? "fail" : "wait"; return `<span class="pill ${cls}">${esc(text)}</span>`; };
const fileLink = (path, label) => `<a href="file://${esc(path)}">${esc(label ?? basename(path))}</a>`;
const checksTable = (rows) => `<table class="checks"><tr><th>Claim</th><th>Measured</th><th></th></tr>${rows.map(([claim, measured, ok]) => `<tr><td>${claim}</td><td>${measured}</td><td>${pill(ok)}</td></tr>`).join("")}</table>`;

const OTHER_REPORTS = [
  ["/home/bam/bbox-ui/reports/media/system-sketch-feedback-2026-09-21.html", "SystemSketch feedback · Sep 21 (sections 1–13)", "the Sep 21 feedback, hotkeys, port spacing, side-effect ports, canonical gallery, region views, trace defaults, rail fix, React Flow parity"],
  ["/home/bam/bbox-ui/reports/dom-canvas-vs-reactflow-2026-09-22.html", "DOM canvas vs React Flow", "the decision writeup"],
  ["/home/bam/bbox-ui/reports/blockregion-as-block-preset-2026-09-22.html", "BlockRegion as a Block preset", "the decision; being extended with the representation question"],
  ["/home/bam/bbox-ui/reports/media/storybook-org-2026-09-22.html", "Storybook organisation", "the reorganised story tree"],
  ["/home/bam/bbox-ui/reports/media/region-wall-crossing-2026-09-22.html", "Region wall crossing", "wires crossing a region's wall"],
  ["/home/bam/bbox-ui/reports/media/dock-icon-2026-09-22.html", "Dock icon", "the dock icon"],
];

function branchMapSvg() {
  // Drawn from `git log --oneline --graph` reads on 2026-09-22 (see the
  // handoff); every sha here is one that command printed. Labels alternate
  // between two rows under the lane so neighbours never collide.
  const W = 1240;
  const lanes = { main: 80, feedback: 200, chain: 330, hit: 440, members: 540 };
  const node = (x, y, sha, label, cls = "", row = 0) => `<g class="n ${cls}"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y - 14}" text-anchor="middle" class="sha">${sha}</text><text x="${x}" y="${y + 26 + row * 15}" text-anchor="middle" class="lbl">${esc(label)}</text></g>`;
  const line = (x1, y1, x2, y2) => `<path class="e" d="M${x1} ${y1} L${x2} ${y2}"/>`;
  const curve = (x1, y1, x2, y2) => `<path class="e" d="M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}"/>`;
  const laneLabel = (y, lines) => lines.map((text, i) => `<text x="12" y="${y + 4 + (i - (lines.length - 1) / 2) * 15}" class="lane">${esc(text)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} 640" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Branch map, 2026-09-22">
<style>
.lane{font:600 12px system-ui;fill:var(--muted)}.sha{font:12px ui-monospace,Menlo,monospace;fill:var(--fg)}.lbl{font:11.5px system-ui;fill:var(--muted)}
.e{fill:none;stroke:var(--line-strong);stroke-width:2}.n circle{fill:var(--card);stroke:var(--accent);stroke-width:2.5}.n.main circle{stroke:var(--ok)}.n.warn circle{stroke:var(--warn)}.n.fix circle{stroke:var(--ok)}
.note{font:12px system-ui;fill:var(--muted)}
</style>
${laneLabel(lanes.main, ["main"])}
${line(330, lanes.main, 1220, lanes.main)}
${node(340, lanes.main, "68f5d19", "merge-base of the feedback branch", "main")}
${node(720, lanes.main, "73d7e07", "merge-base of the four lanes", "main")}
${node(1150, lanes.main, "92c2c22", "main today (dock icon)", "main")}
${laneLabel(lanes.feedback, ["claude/system-sketch-ui-feedback-14bfc3"])}
${curve(340, lanes.main, 420, lanes.feedback)}
${line(420, lanes.feedback, 1180, lanes.feedback)}
${node(420, lanes.feedback, "…", "Sep 21–22 work, 64 commits", "", 0)}
${node(530, lanes.feedback, "782d817", "Vite watch ignore", "", 1)}
${node(640, lanes.feedback, "aca32db", "autosave redo · item 1", "", 0)}
${node(750, lanes.feedback, "ca9289a", "hover regions · item 2", "", 1)}
${node(860, lanes.feedback, "69009d8", "merge · items 1+2 captured here", "", 0)}
${node(970, lanes.feedback, "3709129", "item 1 fix (6192ca5) · PASS", "fix", 1)}
${node(1070, lanes.feedback, "874c589", "item 2 fix (33cac44)", "fix", 0)}
${node(1170, lanes.feedback, "1ae4212", "round 3 · PASS · tip", "warn", 1)}
${laneLabel(lanes.chain, ["claude/storybook-server-launch-e5f2cc", "→ blockregion-views → region-host-toggle"])}
${curve(720, lanes.main, 790, lanes.chain)}
${line(790, lanes.chain, 1180, lanes.chain)}
${node(790, lanes.chain, "c923dfe", "storybook-server-launch", "", 0)}
${node(900, lanes.chain, "069e418", "blockregion-views · item 4a", "", 1)}
${node(995, lanes.chain, "73d975b", "region-host-toggle · item 4b", "", 0)}
${node(1085, lanes.chain, "885c59f", "item 4 fix (bracket)", "fix", 1)}
${node(1170, lanes.chain, "b38dc08", "round 3 · tip", "warn", 0)}
${laneLabel(lanes.hit, ["claude/hit-regions-2026-09-22"])}
${curve(900, lanes.chain, 1000, lanes.hit)}
${line(1000, lanes.hit, 1100, lanes.hit)}
${node(1100, lanes.hit, "f83c075", "hit regions · item 3 · tip, on 069e418", "", 0)}
${laneLabel(lanes.members, ["claude/collapsed-members-2026-09-22"])}
${curve(900, lanes.chain, 1000, lanes.members)}
${line(1000, lanes.members, 1100, lanes.members)}
${node(1100, lanes.members, "e214ede", "collapsed members · item 5 · tip, on 069e418", "", 0)}
<text x="12" y="608" class="note">Nothing here is on main or pushed; integration is Zach's call. Green ring = on main or a Codex-fix commit; amber = a tip that is behind main.</text>
<text x="12" y="626" class="note">The feedback branch is 64 ahead / 21 behind main with 8 known conflicts; the four lanes are 5–7 ahead / 5 behind (git rev-list --count, at 69009d8).</text>
</svg>`;
}

function buildHtml(F) {
  const i1 = F.item1 ?? {};
  const i2 = F.item2 ?? {};
  const i3 = F.item3 ?? {};
  const i4 = F.item4 ?? {};
  const i5 = F.item5 ?? {};

  // ---------------- checks ----------------
  const c1 = [];
  if (i1.idle) {
    c1.push(["Opened by <code>?board=</code>, 20 s idle: bytes and mtime unchanged", `sha <code>${i1.idle.before.sha}</code> → <code>${i1.idle.after.sha}</code>; ${i1.idle.before.bytes.toLocaleString("en-US")} B → ${i1.idle.after.bytes.toLocaleString("en-US")} B; mtime ${i1.idle.before.mtime} → ${i1.idle.after.mtime}`, i1.idle.unchanged]);
    c1.push(["No write request left the page while idle", `${i1.idle.writes} non-GET requests to <code>/api/workspace/*</code>`, i1.idle.writes === 0]);
    c1.push(["No page reload while idle", `${i1.idle.loads} load event (the first one is the open itself)`, i1.idle.loads === 1]);
  }
  if (i1.inRoot) {
    c1.push(["A board INSIDE <code>apps/systemsketch/review/</code>: the app wrote it (Delete), and Vite did not reload the page", `writes ${i1.inRoot.writes} (${esc(i1.inRoot.writeUrls.join(", "))}); file ${i1.inRoot.before.bytes.toLocaleString("en-US")} B → ${i1.inRoot.afterDelete.bytes.toLocaleString("en-US")} B, shape:pose in file ${i1.inRoot.before.hasPose} → ${i1.inRoot.afterDelete.hasPose}; loads ${i1.inRoot.loadsAtOpen} → ${i1.inRoot.loadsAfterWrite} over the next 6 s`, i1.inRoot.writes >= 1 && i1.inRoot.afterDelete.hasPose === false && i1.inRoot.loadsAfterWrite === i1.inRoot.loadsAtOpen]);
  }
  if (i1.hero) {
    const [del, undo] = i1.hero.timeline;
    c1.push(["Delete → the file loses the shape (a person's edit is saved)", `${i1.hero.t0.bytes.toLocaleString("en-US")} B → ${del.bytes.toLocaleString("en-US")} B; shape:pose in file: ${del.hasPose}; in the app: ${del.shapeInApp}`, del.hasPose === false && del.shapeInApp === false]);
    c1.push(["Ctrl+Z → the shape is back ON DISK (undo is saved too)", `${del.bytes.toLocaleString("en-US")} B → ${undo.bytes.toLocaleString("en-US")} B; shape:pose in file: ${undo.hasPose}; in the app: ${undo.shapeInApp}; ${i1.hero.writes} writes, ${i1.hero.loads} page load`, undo.hasPose === true && undo.shapeInApp === true && i1.hero.loads === 1]);
  }
  if (i1.viteReloads !== undefined) c1.push(["Vite's own log shows no board-triggered page reload", `${i1.viteReloads} “page reload” lines naming a .tldr across both dev servers' logs`, i1.viteReloads === 0]);

  const c2 = [];
  const a = i2.app ?? {};
  if (a.hoverCard) c2.push(["Pointer on the For Loop card's header paints the FRAME's box, not the card's", `painted box off the frame by ${px(a.hoverCard.offFrame)} (tolerance 2.5); off the card by ${px(a.hoverCard.offCard)}; hovered record is still <code>${esc(a.hoverCard.hovered)}</code>`, a.hoverCard.offFrame !== null && a.hoverCard.offFrame <= 2.5 && a.hoverCard.offCard > 50]);
  if (a.hoverCardBody) c2.push(["Pointer on the card's body: the frame again", `off the frame by ${px(a.hoverCardBody.offFrame)}`, a.hoverCardBody.offFrame !== null && a.hoverCardBody.offFrame <= 2.5]);
  if (a.hoverPlain) c2.push(["Pointer on a plain block outlines only that block", `off the block by ${px(a.hoverPlain.offBlock)}; hovered <code>${esc(a.hoverPlain.hovered)}</code>`, a.hoverPlain.offBlock !== null && a.hoverPlain.offBlock <= 2.5]);
  if (a.renaming) c2.push(["While renaming (double-click the title): editing session on the CARD, selection on the REGION, outline on the FRAME", `editing <code>${esc(a.renaming.editing)}</code>; selected <code>${esc(JSON.stringify(a.renaming.selected))}</code>; painted off the frame by ${px(a.renaming.offFrame)}, off the card by ${px(a.renaming.offCard)}`, a.renaming.editing === "shape:loop-corner" && JSON.stringify(a.renaming.selected) === JSON.stringify(["shape:loop"]) && a.renaming.offFrame !== null && a.renaming.offFrame <= 2.5]);
  if (a.hinted) c2.push(["A hinted card paints the frame (the hint list is swapped too)", `painted off the frame by ${px(a.hinted.offFrame)}, off the card by ${px(a.hinted.offCard)}`, a.hinted.offFrame !== null && a.hinted.offFrame <= 2.5]);
  if (a.cardViewAfterHotkey3) c2.push(["The corner card always stays in Port view", `after hotkey 3 (Expanded) with the region selected: card view <code>${esc(a.cardViewAfterHotkey3.card)}</code>; after a direct <code>updateShape({view:'expanded'})</code>: <code>${esc(a.cardViewAfterDirectWrite)}</code>`, a.cardViewAfterHotkey3.card === "port" && a.cardViewAfterDirectWrite === "port"]);

  const c3 = [];
  for (const [key, story] of Object.entries(i3.stories ?? {})) {
    for (const [name, probe] of Object.entries(story.probes)) {
      if (probe.missing) { c3.push([`${esc(story.label)} · ${name}`, `probe target missing: <code>${esc(probe.missing)}</code>`, false]); continue; }
      // A header, a member's header or a port LABEL is a grab surface → the
      // whole node outlines (solid); a dot's halo owns its press → dashed.
      const expectNode = /header|member|label/.test(name);
      const ok = probe.readout ? (expectNode ? /outline the whole/.test(probe.readout) && probe.outlineStyle === "solid" : /owns the pointer|passes through|no outline|dashed/.test(probe.readout)) : false;
      c3.push([`${esc(story.label)} · pointer on the ${name}`, `readout: <code>${esc(probe.readout)}</code>${probe.outline ? ` · ring ${round(probe.outline.width)}×${round(probe.outline.height)} px` : ""}`, ok]);
    }
  }

  const c4 = [];
  for (const [key, f] of Object.entries(i4.views ?? {})) {
    const [view, scheme] = key.split("|");
    if (view === "Port") c4.push([`Views · Port (${scheme}): no frame, no members, no toggle`, `data-region-view=<code>${esc(f.view)}</code>; frame ${f.frame ? "present" : "absent"}; members ${f.members}; toggle ${f.toggle ? "present" : "absent"}`, f.view === "port" && !f.frame && f.members === 0 && !f.toggle]);
    if (view === "Expanded") c4.push([`Views · Expanded (${scheme}): frame + members, toggle unpressed (hollow), no chevron`, `view <code>${esc(f.view)}</code>; members ${f.members}; chevrons ${f.chevrons}; aria-pressed ${esc(f.togglePressed)}; svg fill <code>${esc(f.toggleFill)}</code>; toggle bg <code>${esc(f.toggleBg)}</code>`, f.view === "expanded" && f.members > 0 && f.chevrons === 0 && f.togglePressed === "false" && f.toggleFill === "none"]);
    if (view === "Expanded Opaque") c4.push([`Views · Expanded Opaque (${scheme}): members hidden, toggle pressed (filled), no grey background`, `view <code>${esc(f.view)}</code>; members ${f.members}; aria-pressed ${esc(f.togglePressed)}; svg fill <code>${esc(f.toggleFill)}</code>; toggle bg <code>${esc(f.toggleBg)}</code>`, f.view === "opaque" && f.members === 0 && f.togglePressed === "true" && f.toggleFill === "currentColor" && /rgba\(0, 0, 0, 0\)|transparent/.test(f.toggleBg ?? "")]);
  }
  for (const [key, h] of Object.entries(i4.hosts ?? {})) {
    const t = h.before.toggle, fr = h.before.region;
    const topRight = t && fr && t.right <= fr.right + 0.5 && t.right >= fr.right - 40 && t.top >= fr.top - 0.5 && t.top <= fr.top + 40;
    c4.push([`${esc(h.label)} host: toggle sits top-right of the frame, no chevron`, `toggle right edge ${px(t?.right)} vs frame right ${px(fr?.right)}; toggle top ${px(t?.top)} vs frame top ${px(fr?.top)}; chevrons ${h.before.chevrons}`, !!topRight && h.before.chevrons === 0]);
    c4.push([`${esc(h.label)} host: pressing makes it opaque at the SAME box; pressing again restores Expanded`, `box before ${round(h.nodeBefore?.width)}×${round(h.nodeBefore?.height)} @ (${round(h.nodeBefore?.left)}, ${round(h.nodeBefore?.top)}) → pressed ${round(h.nodePressed?.width)}×${round(h.nodePressed?.height)} @ (${round(h.nodePressed?.left)}, ${round(h.nodePressed?.top)}); views ${esc(h.before.view)} → ${esc(h.pressed.view)} → ${esc(h.released.view)}; pressed bg <code>${esc(h.pressed.toggleBg)}</code>`, h.sameBoxWhilePressed && h.pressed.view === "opaque" && h.released.view === "expanded" && /rgba\(0, 0, 0, 0\)|transparent/.test(h.pressed.toggleBg ?? "")]);
  }
  const bordersText = (p) => (p ? `${p.top}/${p.right}/${p.bottom}/${p.left}` : "n/a");
  if (i4.bug?.before) {
    const b = i4.bug;
    c4.push(["v4 Bracket + default skin: pressing Blackbox keeps the bracket open and the stroke at 1 px (the 73d975b bug, fixed at 885c59f)", `visible stroke (t/r/b/l) Expanded ${bordersText(b.paintBefore)} (painted by ${esc((b.paintBefore?.by ?? []).join(", "))}) → Expanded Opaque ${bordersText(b.paintAfter)} (painted by ${esc((b.paintAfter?.by ?? []).join(", "))}); region box ${round(b.before.region?.width)}×${round(b.before.region?.height)} → ${round(b.after.region?.width)}×${round(b.after.region?.height)}`, b.paintUnchanged && b.boxUnchanged]);
  }
  if (i4.bugBefore?.before) {
    const b = i4.bugBefore;
    c4.push(["The same press at 73d975b (the bug, kept for comparison — expected to fail)", `visible stroke Expanded ${bordersText(b.paintBefore)} → Expanded Opaque ${bordersText(b.paintAfter)} (painted by ${esc((b.paintAfter?.by ?? []).join(", "))})`, b.paintUnchanged && b.boxUnchanged]);
  }

  const c5 = [];
  for (const [key, f] of Object.entries(i5.cells ?? {})) {
    const [cell, scheme] = key.split("|");
    if (cell.startsWith("cell-port")) c5.push([`${cell} (${scheme}): members collapse to bands, edge to edge, headers ${f.headers === "show" ? "shown" : "hidden"}`, `${f.bandCount} bands; band inset from the block's edges L ${f.bandInset?.left} / R ${f.bandInset?.right} px; band headers ${f.bandHeaders}; ${f.dots} dots`, f.bandCount === 3 && f.bandsEdgeToEdge === true && (f.headers === "show" ? f.bandHeaders === 3 : f.bandHeaders === 0) && f.dots === 8]);
    else c5.push([`${cell} (${scheme}): expanded members, headers ${f.headers === "show" ? "shown" : "hidden"}`, `member headers ${f.memberHeaders}; bands ${f.bandCount}; ${f.dots} dots`, f.bandCount === 0 && (f.headers === "show" ? f.memberHeaders === 3 : f.memberHeaders === 0) && f.dots === 8]);
  }

  const proofOf = (rows) => `${rows.filter((r) => r[2]).length}/${rows.length} checks`;

  // ---------------- index ----------------
  const shas = F.shas ?? {};
  // [item, branch, sha note, proof, codex, own report]
  const index = [
    ["1 · Reload loop; opening a board writes nothing", "claude/system-sketch-ui-feedback-14bfc3", `782d817 + aca32db · captured at ${i1.capturedAt ?? "69009d8"}, before the fix 6192ca5 (merged 3709129) landed`, `${proofOf(c1)} · hero + stills below`, "FAIL → fixed (6192ca5) → PASS", "this packet"],
    ["2 · Hover regions (frame outline; card always Port)", "claude/system-sketch-ui-feedback-14bfc3", `ca9289a + 69009d8 · fix 33cac44 (merged 874c589) · captured at ${i2.capturedAt ?? shas.feedback ?? "874c589"}`, `${proofOf(c2)} · hero + stills below`, "FAIL → fixed ×2 → PASS", "this packet"],
    ["3 · Hit regions (BlockPort ×4, Port, LabeledPort, PortEdge, BlockRegion)", "claude/hit-regions-2026-09-22", `f83c075${i3.capturedAt && i3.capturedAt !== "f83c075" ? ` · captured at ${i3.capturedAt}` : ""}`, `${proofOf(c3)} · hero + stills below`, "PASS (earlier)", "this packet"],
    ["4 · BlockRegion views + Blackbox toggle ×3 hosts", "claude/region-host-toggle-2026-09-22", `73d975b → fix 885c59f → round 3 b38dc08 (contains blockregion-views @ 069e418) · captured at ${i4.capturedAt ?? "b38dc08"}`, `${proofOf(c4)} · hero + stills; bracket bug before/after`, "069e418: PASS (earlier) · 73d975b: FAIL → fixed ×2 (b38dc08), re-judge running", "this packet"],
    ["5 · Collapsed member regions", "claude/collapsed-members-2026-09-22", `e214ede${i5.capturedAt && i5.capturedAt !== "e214ede" ? ` · captured at ${i5.capturedAt}` : ""}`, `${proofOf(c5)} · hero + stills below`, "PASS (earlier)", "this packet"],
    ["6 · BlockRegion as a Block preset", "decision (no branch)", "", "decided: preset · representation answered: option C (88/100), spike next", "n/a", fileLink("/home/bam/bbox-ui/reports/blockregion-as-block-preset-2026-09-22.html", "blockregion-as-block-preset-2026-09-22.html")],
    ["7 · In flight: frame with four auto port edges; Codex audits", "—", "", "placeholder", "audit running", "own report to follow"],
  ];

  // The story's caption is two stacked lines; `textContent` joins them with
  // no space ("…loop" + "rule: …"), so put the separator back.
  const captionOf = (probe) => esc((probe?.caption ?? "").replace(/(\S)(rule:)/, "$1 · $2"));
  const hostRow = (host, label) => {
    const h = i2.story?.hosts?.[host];
    if (!h) return "";
    return `<figure>${img(`2-host-${host}-corner-header.jpg`, `${label}: pointer on the corner header`)}<figcaption><strong>${esc(label)}</strong> · pointer on the For Loop card's header — ${captionOf(h.cornerHeader)}</figcaption></figure>
<figure>${img(`2-host-${host}-plain-body.jpg`, `${label}: pointer on a plain block body`)}<figcaption><strong>${esc(label)}</strong> · pointer on a plain block's body — ${captionOf(h.plainBody)}</figcaption></figure>`;
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>bbox-ui review · Sep 22</title>
<style>
:root{--bg:#fafafa;--fg:#18181b;--muted:#6b7280;--card:#fff;--line:#e4e4e7;--line-strong:#a1a1aa;--ok:#15803d;--bad:#b91c1c;--warn:#b45309;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f0f10;--fg:#f4f4f5;--muted:#a1a1aa;--card:#18181b;--line:#27272a;--line-strong:#52525b;--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--accent:#60a5fa}}
:root[data-theme="dark"]{--bg:#0f0f10;--fg:#f4f4f5;--muted:#a1a1aa;--card:#18181b;--line:#27272a;--line-strong:#52525b;--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--accent:#60a5fa}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 80px}h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:44px 0 10px;border-top:1px solid var(--line);padding-top:24px}h3{font-size:16px;margin:26px 0 8px}
.lede{color:var(--muted);margin:0 0 18px}.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:12.5px;white-space:nowrap}
.pass{background:color-mix(in oklab,var(--ok) 18%,transparent);color:var(--ok)}.fail{background:color-mix(in oklab,var(--bad) 18%,transparent);color:var(--bad)}.wait{background:color-mix(in oklab,var(--warn) 18%,transparent);color:var(--warn)}
figure{margin:14px 0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;min-width:0}figure img,figure video{display:block;max-width:100%;height:auto;border-radius:6px;margin:0 auto}
figure.hero video{width:100%}figcaption{color:var(--muted);font-size:13px;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.grid figure{margin:0}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
td,th{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}table.index td:first-child{font-weight:600}
table.index{min-width:880px;table-layout:fixed}table.index th:nth-child(1){width:22%}table.index th:nth-child(2){width:30%}table.index th:nth-child(3){width:17%}table.index th:nth-child(4){width:19%}table.index th:nth-child(5){width:12%}
.branch{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in oklab,var(--fg) 8%,transparent);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}table.index .pill{white-space:normal;line-height:1.35}table.checks{min-width:640px}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:color-mix(in oklab,var(--fg) 8%,transparent);padding:1px 5px;border-radius:4px;word-break:break-word}
pre{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#111;color:#e8e8e8;padding:12px 14px;border-radius:8px;overflow-x:auto}
ul{padding-left:20px}a{color:var(--accent)}a:hover{text-decoration:underline}.missing{color:var(--bad)}.small{font-size:13px;color:var(--muted)}
.callout{border-left:4px solid var(--warn);background:color-mix(in oklab,var(--warn) 10%,transparent);padding:10px 14px;border-radius:0 8px 8px 0;margin:14px 0}.callout.bad{border-color:var(--bad);background:color-mix(in oklab,var(--bad) 8%,transparent)}
.callout.ok{border-color:var(--ok);background:color-mix(in oklab,var(--ok) 8%,transparent)}
.map{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px}.map svg{width:100%;height:auto;display:block}
.quote{color:var(--muted);font-style:italic;margin:6px 0 12px}
@media (max-width:640px){h1{font-size:22px}main{padding:20px 16px 60px}.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>bbox-ui — everything delivered on ${DATE}, in one packet</h1>
<p class="lede">Five lanes, one decision and two in-flight items. Every still and clip below was captured at build time from the lane's <em>own</em> running Storybook or from the real SystemSketch app on the feedback branch — never a mock — and every number is measured, not typed. ${F.browserOnly ? `<span class="pill fail">browser-only: over the preview's 2 MB ceiling — open it in Chrome</span>` : ""}</p>

<h2>Index</h2>
<div class="tablewrap"><table class="index"><tr><th>Item</th><th>Where (branch @ sha)</th><th>Proof</th><th>Codex verdict</th><th>Own report</th></tr>
${index.map(([item, branch, note, proof, codex, own]) => `<tr><td>${item}</td><td><span class="branch">${esc(branch)}</span>${note ? `<div class="small">${esc(note)}</div>` : ""}</td><td>${proof}</td><td>${codexPill(codex)}</td><td>${own}</td></tr>`).join("\n")}
</table></div>
<p class="small">“Codex verdict” is the cross-vendor read-only judge. “FAIL → fixing” means a fix round is running on that lane right now; the captures here are of the code as it stands at the sha named, and each item's section says which findings are open.</p>

<h3>The other reports from the last two days (this packet is the single entry point)</h3>
<ul>
${OTHER_REPORTS.map(([path, label, blurb]) => `<li>${fileLink(path, label)} — ${esc(blurb)}</li>`).join("\n")}
</ul>

<h3>Branch map</h3>
<div class="map">${branchMapSvg()}</div>

<!-- ================================================================ -->
<h2>1 · The reload loop, and “opening a board writes nothing”</h2>
<p class="quote">“the page keeps on reloading” — opening a review board by <code>?board=</code> made the app rewrite the file, and Vite, which watched it, reloaded the page, which reopened the board, which rewrote it.</p>
<p><strong>The fix, in four parts:</strong> Vite ignores board files case-insensitively (<code>vite.config.ts</code> <code>server.watch.ignored</code>, 782d817); the app's own repair writes run inside <code>runDerived</code> (<code>src/document/derivedWrites.ts</code>, aca32db) so opening writes nothing; undo/redo and every user edit still save, through tldraw's synchronous history interceptor; native File › Open waits for the pending save.</p>
${video(i1.hero, "the real app on <code>?board=</code>: idle (nothing written) → click the Pose estimator, Delete → the file loses the shape → Ctrl+Z → the shape is back on disk. The dark strip at the top is the recorder's disk readout (bytes, mtime, sha, whether <code>shape:pose</code> is in the file), refreshed every 200 ms from <code>statSync</code>; it is not app UI.")}
<div class="callout ok"><strong>Codex: FAIL (3 findings) → fixed at <code>6192ca5</code>, merged <code>3709129</code> → re-judge PASS, no findings.</strong> Codex confirmed from source that the revision/snapshot boundary is atomic; that local edits and undo/redo can never receive tldraw's “remote” source; that the synchronous digest update preserves conflict detection against an external writer; and that the deferred tests genuinely gate serialisation, file close and Save As adoption. The findings were: <em>P1, an edit lost in a rare race</em> — tldraw's serializer snapshots the board before it awaits external image assets, so on a board with an HTTP-hosted image an edit made while a save is still converting could be marked saved and then lost when you Open another file (the same race in Save As); <em>P2</em> — the native-Open tests never held a save open, so they would have passed an implementation that does not wait; <em>P3, minor</em> — a remote change to a corner card could still schedule one unneeded save. The fix: an edit-revision guard (a save clears dirty only if no edit landed since its snapshot); Open/New retry up to 3 saves, then refuse; Save As keeps late edits; a remote corner-card change saves nothing. 11/11 smoke tests pass; 6 mutants each turn a named test red. <strong>The captures below were taken at ${esc(i1.capturedAt ?? "69009d8")} (08:45–08:47), before that fix landed (08:49:59); the everyday behaviour they show is unchanged by it.</strong></div>
<h3>Checks (measured off the running app)</h3>
<div class="tablewrap">${checksTable(c1)}</div>
${i1.idle ? `<pre>$ open  ?board=${esc(i1.idle.before && BOARD)}
before   ${i1.idle.before.bytes.toLocaleString("en-US")} B  mtime ${i1.idle.before.mtime}  sha256 ${i1.idle.before.sha}…
… 20 s idle (page loads: ${i1.idle.loads}, write requests: ${i1.idle.writes}) …
after    ${i1.idle.after.bytes.toLocaleString("en-US")} B  mtime ${i1.idle.after.mtime}  sha256 ${i1.idle.after.sha}…   → ${i1.idle.unchanged ? "UNCHANGED" : "CHANGED"}${i1.inRoot ? `

$ open  ?board=${esc(BOARD_IN_ROOT)}     (inside apps/systemsketch — the folder Vite used to watch)
Delete the Pose estimator → ${i1.inRoot.writeUrls.map(esc).join(", ")}
file     ${i1.inRoot.before.bytes.toLocaleString("en-US")} B → ${i1.inRoot.afterDelete.bytes.toLocaleString("en-US")} B   shape:pose in file: ${i1.inRoot.before.hasPose} → ${i1.inRoot.afterDelete.hasPose}
page loads over the next 6 s: ${i1.inRoot.loadsAtOpen} → ${i1.inRoot.loadsAfterWrite}   → ${i1.inRoot.loadsAfterWrite === i1.inRoot.loadsAtOpen ? "NO RELOAD" : "RELOADED"}` : ""}${i1.viteReloads !== undefined ? `
vite logs: ${i1.viteReloads} "page reload" lines naming a .tldr` : ""}</pre>` : ""}
<div class="grid">
${fig("1-board-open-light.jpg", "The review board as opened by <code>?board=</code> (light). Twenty seconds later the file on disk is byte-identical.")}
${fig("1-board-open-dark.jpg", "The same board, dark.")}
</div>
<h3>Tests</h3>
<p>7 new smoke tests in <code>src/openWritesNothing.smoke.test.tsx</code>, 3 in <code>src/viteWatch.test.ts</code>:</p>
<ul>
<li><em>opening a ?board= file writes nothing until someone edits it</em> — the committed review board: opened and left alone, its bytes on disk are unchanged · a board whose stored geometry this viewer repairs: the repairs run, nothing is written — and the first real edit saves both</li>
<li><em>undo and redo are a person's edits, always</em> — delete a loaded shape, let it save, Ctrl+Z: the restored shape is saved, and a reopen shows it · redo after undo saves too · an edit made in the same frame as Ctrl+N is written before the window leaves</li>
<li><em>native File ▸ Open never leaves the open file's edits behind</em> — an edit inside the autosave debounce is written to A before B replaces it · a file whose save was REFUSED is not swapped away — Open stays on A</li>
<li><em>vite.config.ts server.watch.ignored</em> — a board saved anywhere under the app, or anything in review/, is invisible to Vite's watcher · a board suffix in any case is invisible too — the app opens <code>.TLDR</code> as readily as <code>.tldr</code> · source under <code>src/review/</code> is still watched — the ignore is the app's review/ folder, not every folder named review</li>
</ul>
<h3>Mutation table (the lane's own kill list)</h3>
<div class="tablewrap"><table><tr><th>Mutation</th><th>Tests that failed</th></tr>
<tr><td>Derived write counted as an edit</td><td>3: untouched board, repaired board, native wait</td></tr>
<tr><td>Undo/redo replay classified as derived</td><td>2: delete→undo→reopen, redo</td></tr>
<tr><td>Native Open without the wait</td><td>2</td></tr>
<tr><td>Dirty marked one frame late</td><td>1</td></tr>
</table></div>
<p class="small">SystemSketch full suite on the merged tree 69009d8: 599 passed, 9 failed — the 9 are pre-existing on main (draft.smoke ×7, menus “Zoom to 100%”, corner “narrow 720×900”). On 874c589 (with the item 1 and item 2 fixes in): 604 passed, 10 failed — the same 9 plus the app.smoke “system face arms” flake, which passes alone (4/4). On 1ae4212 (item 2 round 3): 606 passed, the 9 known failures.</p>

<!-- ================================================================ -->
<h2>2 · Hover regions — the corner card outlines the whole frame</h2>
<p class="quote">“when you hover on the corner block its the entire out frame that should become highlighted in blue.. More like an expanded block”</p>
<p>Hovering a region's corner card outlines the WHOLE region frame in blue — including while renaming (double-click the title) and while hinted — and the corner card always stays in Port view. The records stay the card (tldraw reads <code>hoveredShapeId</code> to route gestures); only the <em>paint</em> is swapped, by a subclass of the stock <code>ShapeIndicatorOverlayUtil</code> (<code>src/shapes/region/regionHoverIndicator.ts</code>).</p>
${video(i2.hero, "the real app: the pointer arrives on the For Loop card — the whole frame outlines; moves to a plain block — only it outlines; then the Branch card — its frame outlines.")}
<div class="callout ok"><strong>Codex: FAIL on re-judge (3 findings) → fixed at <code>33cac44</code>, merged <code>874c589</code> → one more finding → fixed at <code>a5f994e</code> → PASS.</strong> The findings: <em>High</em> — while renaming, tldraw's selection was still the card itself; the frame outline only hid it. <em>Medium</em> — the story's React Flow adapter inferred “content owns the press” from <code>.nodrag</code>, so a port dot read “none”. <em>Low</em> — the React Flow drag predicate ignored the mouse button. Round 2 (33cac44): the corner card is never selected on its own, even mid-rename — tldraw's selection is <code>[regionId]</code> while the card is edited, and typing, Enter, Escape and click-away all still commit (checked against tldraw source); the React Flow bench answers only <em>node</em> or <em>none</em>; the drag check respects the mouse button. <strong>Everything in this section was captured at ${esc(i2.capturedAt ?? (F.shas ?? {}).feedback ?? "874c589")}, i.e. with that fix in.</strong> The renaming row below shows what the selection reads now. Round-2 re-judge: FAIL, 1 HIGH finding — a corner card that was already selected in a persisted session was not redirected at install. Round 3 (<code>a5f994e</code>, merged <code>1ae4212</code>, 09:14): a corner card selected in a restored session is swept to its region when the region kit installs, and Delete removes the whole region. <strong>Codex: PASS after 3 rounds.</strong> Full SystemSketch suite on 1ae4212: 606 passed, 9 known failures. Round 3 landed <em>after</em> these captures (874c589, 09:01) and changes only the restored-session install sweep, which nothing here exercises.</div>
<h3>Checks (the painted box is read off tldraw's overlay canvas pixels — the lane's own ruler, <code>regionRigid.smoke.test.tsx</code> <code>paintedOverlayBox</code>)</h3>
<div class="tablewrap">${checksTable(c2)}</div>
<div class="grid">
${fig("2-app-hover-card.jpg", `Pointer on the For Loop card's header: the blue outline is the frame's box (${a.hoverCard ? `${round(a.hoverCard.frame.width)}×${round(a.hoverCard.frame.height)} px` : ""}), not the card's (${a.hoverCard ? `${round(a.hoverCard.card.width)}×${round(a.hoverCard.card.height)} px` : ""}).`)}
${fig("2-app-hover-plain.jpg", "Pointer on the plain Pose estimator block: only that block outlines.")}
${fig("2-app-renaming.jpg", "Double-click the title: the rename editor runs in the card, the outline stays on the frame.")}
${fig("2-app-hinted.jpg", "The card hinted (<code>editor.setHintingShapes</code>): the hint outline is the frame too.")}
</div>
<p class="small">Mutants the lane killed: the skip-swap-on-rename mutant painted the card box (319 px off vs 2.5 px tolerance); the hinted mutant, 318 px off; removing the view check turned 4 view tests red; the fake tldraw rule went red.</p>
<h3>Hit Regions / Host Outline — what each REAL host outlines</h3>
<p>The story (<code>apps/storybook-basics/src/hosts/HitRegionsHostOutline.stories.tsx</code>) mounts the real React Flow and tldraw hosts and asks each one, through its own exported press rule, what a press at the pointer would grab. They disagree on a plain block's body, and the story says so: React Flow outlines nothing (the body is off its drag handle), tldraw outlines the content, and the declared policy outlines the whole node.</p>
<div class="grid">
${hostRow("react-flow", "React Flow bench")}
${hostRow("tldraw", "tldraw bench")}
${hostRow("policy", "Policy (dragPolicy)")}
</div>

<!-- ================================================================ -->
<h2>3 · Hit regions — what passes through, what stays on top</h2>
<p>One story per component under <em>Hit Regions</em>: BlockPort (Simple / Port / Expanded / Expanded Opaque), Port, LabeledPort, PortEdge and BlockRegion. Each shows which parts pass a press through to their children and which keep it, and — with “Show host outline” on — the ring a host would draw for the pointer's position.</p>
${video(i3.hero, "the pointer crossing a BlockPort in each of its four views, left rail dot → header → body → (member) → right rail dot; the host outline follows: solid ring on the node where the node takes the press, dashed where a dot or rail owns it.")}
<div class="callout ok"><strong>Codex: PASS (earlier).</strong></div>
<h3>Checks (the story's own readout, read after each pointer move)</h3>
<div class="tablewrap">${checksTable(c3)}</div>
<div class="grid">
${HIT_STORIES.map((s) => fig(`3-${s.key}.jpg`, `<strong>${esc(s.label)}</strong> — “Show host outline” on, pointer on the ${esc(s.probes[0].name)}.`)).join("\n")}
</div>

<!-- ================================================================ -->
<h2>4 · BlockRegion views, and the Blackbox toggle in three hosts</h2>
<p class="quote">“regions do not have a simple view. they just have port, expanded and expanded opaque view” · “chevron folds, blackbox makes opaque without folding”</p>
<p>BlockRegion › Views (<code>Empty</code>, <code>With members and ports</code>) switches Port / Expanded / Expanded Opaque from a stock <code>Select</code>; the Blackbox toggle sits top-right of the frame and drives Expanded ⇄ Expanded Opaque at the same size; the host chevron is gone; a pressed toggle has no lighter-grey background. The toggle story runs the same ruling in the DOM canvas, React Flow and tldraw hosts.</p>
${video(i4.hero, "React Flow host: press the Blackbox toggle → Expanded Opaque at the same box → press again → Expanded → open the Region view dropdown → Port.")}
${argOf("--toggle-note", null) ? `<p class="small"><strong>Provenance:</strong> ${esc(argOf("--toggle-note"))}</p>` : ""}
<div class="callout"><strong>Codex on 73d975b: FAIL (4 findings) → fixed at <code>885c59f</code>; re-judge running.</strong> The findings: <em>Major</em> — old scenes with <code>view:"opaque"</code> opened as Expanded Opaque; <em>Major</em> — a region first shown opaque changed height when toggled; <em>Moderate</em> — the opaque face did not follow v4's per-side borders or corner radii (the 1 px → 2 px / closed-bracket bug, before/after below); <em>Moderate</em> — the Port fixture dropped the hidden-count footer check. 885c59f: legacy opaque records read as Port; a region loaded straight into opaque keeps its size; ONE frame paint serves Expanded and Expanded Opaque, so v4's open bracket stays open and the default skin keeps its 1 px stroke; the Port card keeps its “N hidden” footer. Full trunk <code>pnpm test</code>: 270/270 files, 3159/3159 tests. The 069e418 part (views + toggle + Empty story) passed earlier. <strong>Re-judge of 885c59f: FAIL, 2 MEDIUM findings</strong> — <code>setRegionView(opaque)</code> through the old public writer rendered as Port because of the legacy inference; a custom corner loaded opaque with no height still resized. <strong>Round 3 landed as <code>b38dc08</code> (09:21): records render literally, with no legacy inference; the opaque face always measures an id-free copy of the corner. Its Codex re-judge is running.</strong> Full trunk at b38dc08: 3156/3157, the one failure an unrelated editor story that passes alone. <strong>Everything in this section was captured at ${esc(i4.capturedAt ?? "b38dc08")} (09:23), i.e. with round 3 in.</strong></div>
<h3>Checks</h3>
<div class="tablewrap">${checksTable(c4)}</div>
<h3>Each view, light and dark</h3>
<div class="grid">
${["expanded", "expanded-opaque", "port"].flatMap((v) => ["light", "dark"].map((s) => fig(`4-view-${v}-${s}.jpg`, `<strong>${v.replace("-", " ")}</strong> · ${s}`))).join("\n")}
${fig("4-view-empty-light.jpg", "<strong>Empty</strong> · light — a region with no members or ports.")}
</div>
<h3>The toggle in three hosts (Expanded, then pressed)</h3>
<div class="grid">
${["dom-canvas", "react-flow", "tldraw"].flatMap((h) => [fig(`4-host-${h}.jpg`, `<strong>${esc(i4.hosts?.[h]?.label ?? h)}</strong> · Expanded (toggle released)`), fig(`4-host-${h}-pressed.jpg`, `<strong>${esc(i4.hosts?.[h]?.label ?? h)}</strong> · pressed → Expanded Opaque, same box`)]).join("\n")}
</div>
<h3>The bracket bug — at 73d975b, and fixed at 885c59f (measured here at ${esc(i4.capturedAt ?? "b38dc08")}, which contains it)</h3>
<div class="callout ${i4.bug?.paintUnchanged && i4.bug?.boxUnchanged ? "ok" : "bad"}"><strong>${i4.bug?.paintUnchanged && i4.bug?.boxUnchanged ? "Fixed, and re-measured." : "NOT fixed on the tree captured."}</strong> Under region drawing <code>v4</code> (Bracket: a left bracket and a top rule, open right and bottom) with the <code>default</code> skin, pressing Blackbox at 73d975b swapped the frame for a restyled Block: the open bracket closed into a full box and the border went from ${i4.bugBefore ? `<code>${esc(bordersText(i4.bugBefore.paintBefore))}</code> to <code>${esc(bordersText(i4.bugBefore.paintAfter))}</code>` : "1 px on two sides to 2 px all round"} (top/right/bottom/left, computed style). Found by a separate lane; the third Codex finding above. At 885c59f the same press paints ${i4.bug ? `<code>${esc(bordersText(i4.bug.paintBefore))}</code> → <code>${esc(bordersText(i4.bug.paintAfter))}</code>` : "the same frame"}, and the region box stays ${i4.bug ? `${round(i4.bug.before.region?.width)}×${round(i4.bug.before.region?.height)}` : "the same"}.</div>
<div class="grid">
${i4.bugBefore ? fig("4-was-after-full.jpg", "<strong>73d975b — the bug.</strong> The whole region after pressing Blackbox: a closed box, 2 px.") : ""}
${fig("4-bug-after-full.jpg", `<strong>${esc(i4.capturedAt ?? "b38dc08")} — the fix.</strong> The same press: the bracket stays open, 1 px.`)}
${fig("4-bug-before-full.jpg", "For reference: Expanded, before the press (identical on both shas).")}
${i4.bugBefore ? fig("4-was-before.png", "<strong>73d975b · Expanded</strong> (2× crop of the bottom-left corner): the 1 px left line stops; no bottom rule.") : ""}
${i4.bugBefore ? fig("4-was-after.png", "<strong>73d975b · after pressing Blackbox</strong>: the bug — the corner closes into a 2 px box.") : ""}
${fig("4-bug-after.png", `<strong>${esc(i4.capturedAt ?? "b38dc08")} · after pressing Blackbox</strong>: the fix — the same open corner, still 1 px; one frame paint serves both views.`)}
</div>
<p class="small">Trunk <code>pnpm test</code>: 269/269 files, 3150/3150 tests at 73d975b; 270/270 files, 3159/3159 at 885c59f; 3156/3157 at b38dc08 (the one failure an unrelated editor story that passes alone). Mutants killed at 73d975b: the chevron put back goes red in all three hosts; nodrag removed goes red on React Flow and tldraw; a fixed opaque colour goes red.</p>

<!-- ================================================================ -->
<h2>5 · Collapsed member regions</h2>
<p class="quote">“we collapse each of the children members to a port state, and then make them go edge to edge. We can optionally show or hide the header of the children members.”</p>
<p>A stack-mode block (<code>My Component · Class</code> holding Func 3, Func 1, Func 2) in Expanded view and in Port view. In Port view the members collapse to port bands that run edge to edge, and their headers can be shown or hidden. Story: <code>apps/storybook-basics/src/components/BlockPortMembers.stories.tsx</code>.</p>
${video(i5.hero, "Live Switch story: Member headers off → on, then Port view off (Expanded) → on again.")}
<div class="callout ok"><strong>Codex: PASS (earlier).</strong></div>
<h3>Checks</h3>
<div class="tablewrap">${checksTable(c5)}</div>
<div class="grid">
${fig("5-cell-expanded-show-light.jpg", "<strong>Expanded</strong>, member headers shown.")}
${fig("5-cell-port-show-light.jpg", "<strong>Port</strong>, member headers shown — three bands, edge to edge.")}
${fig("5-cell-port-hide-light.jpg", "<strong>Port</strong>, member headers hidden.")}
${fig("5-cell-expanded-hide-light.jpg", "<strong>Expanded</strong>, member headers hidden.")}
${fig("5-cell-port-show-dark.jpg", "<strong>Port</strong>, headers shown · dark.")}
${fig("5-cell-port-hide-dark.jpg", "<strong>Port</strong>, headers hidden · dark.")}
</div>

<!-- ================================================================ -->
<h2>6 · BlockRegion as a Block preset — decided; representation answered</h2>
<div class="callout ok"><strong>Decision (Zach, Daily Note Sep 22 2026 §829): BlockRegion becomes a Block preset.</strong></div>
<ul>
<li>The earlier recommendation in the report — B′, “keep Region a node but draw it only from Block parts” (scores B′ 89, C 70, A 69, A-full 39) — is <strong>superseded</strong> by that decision on the identity question.</li>
<li><strong>How to represent it — answered: option C (88/100).</strong> A thin preset component beside Block, <code>components/block.region.tsx</code>, keeping the <code>BlockRegion</code> name. It composes only Block, the body container (BlockMembers today, Frame later) and BlockPort, and exports <code>REGION_RECIPE</code> as data. Block gains five general props: <code>surface</code> card/frame/none (frame doesn't clip), <code>opaque</code> + <code>onToggleOpaque</code>, root data/slot passthrough, a member <code>height</code>, and band collapse in Port view. The id is on exactly one element per view. Nothing stored migrates (scene <code>type:"region"</code>, app <code>ss-region</code>).</li>
<li>The others: D compound parts 75 · B <code>preset=</code> registry 71 · E data-driven 61 · F CSS tokens 60 · A props bundle 53.</li>
<li>Next: an additive spike, “Spike · Branch preset”, after the region-toggle fix round.</li>
<li>Status: <span class="pill pass">decided: preset · representation: option C</span></li>
<li>Report (updated with a new top section): ${fileLink("/home/bam/bbox-ui/reports/blockregion-as-block-preset-2026-09-22.html", "blockregion-as-block-preset-2026-09-22.html")}</li>
</ul>

<h2>7 · In flight (placeholders)</h2>
<ul>
<li><strong>Frame with four auto port edges</strong> — a Fable lane; its own report will follow.</li>
<li><strong>Codex audits</strong> — fix rounds running on the autosave redo (item 1), the hover fix (item 2) and the region toggle (item 4); their verdicts are in the index.</li>
</ul>

<!-- ================================================================ -->
<h2>Decision surface</h2>
<h3>Done and proved</h3>
<ul>
<li>Opening a board writes nothing: ${i1.idle ? `${i1.idle.writes} writes, ${i1.idle.loads} load, bytes ${i1.idle.unchanged ? "unchanged" : "CHANGED"} over 20 s` : "n/a"}; Delete and Ctrl+Z both reach the disk (item 1 checks: ${proofOf(c1)}).</li>
<li>Hovering the For Loop card paints the frame: off by ${a.hoverCard ? px(a.hoverCard.offFrame) : "n/a"} (tolerance 2.5 px), during rename and hint too; the card stays <code>port</code> against the hotkey and a direct write (item 2: ${proofOf(c2)}).</li>
<li>Hit-region stories for every component, with the host outline following the pointer (item 3: ${proofOf(c3)}).</li>
<li>BlockRegion's three views and the Blackbox toggle in three hosts, same box while pressed; the v4 bracket bug re-measured as fixed at 885c59f, with 73d975b's failure kept beside it (item 4: ${proofOf(c4)}).</li>
<li>Collapsed members: bands edge to edge, headers optional (item 5: ${proofOf(c5)}).</li>
</ul>
<h3>Left</h3>
<ul>
<li><strong>Blocked on Codex:</strong> the re-judge of item 4's round 3 (b38dc08). Items 1 and 2 are PASS.</li>
<li><strong>Next:</strong> a merge-main barrier lane (the feedback branch is 21 behind main with 8 known conflicts); then wiring the <kbd>4</kbd> key plus region Port / Expanded / Opaque / Blackbox into the SystemSketch app after the merge; then the additive “Spike · Branch preset” (item 6) after the region-toggle fix round.</li>
</ul>
<h3>Needs you</h3>
<div class="tablewrap"><table><tr><th>Question</th><th>Recommendation</th><th>Default if you say nothing</th></tr>
<tr><td>Integration order of the branches</td><td>Merge main into the feedback branch first (it carries the app), then the region branches (storybook-server-launch → blockregion-views → region-host-toggle), then hit-regions and collapsed-members (both sit on 069e418).</td><td>That order.</td></tr>
<tr><td><code>addHistoryInterceptor</code> is <code>@internal</code> in tldraw, reached with a cast that throws if it is removed; tldraw is pinned at 5.3.2</td><td>Keep it — it is the only hook that fires synchronously for every write, cascades included — and write a pep at merge naming the pin and the throw.</td><td>Keep it; pep at merge.</td></tr>
<tr><td>Adopt option C (thin preset component, <code>components/block.region.tsx</code>) for the preset's representation?</td><td>Yes, via the additive “Spike · Branch preset”: build the Branch preset from Block + body container + BlockPort and diff it against today's frame before committing the recipe. (B′ was the earlier identity recommendation; your decision superseded it.)</td><td>Yes, via the spike, after the region-toggle fix round.</td></tr>
</table></div>
<h3>Not done, and why</h3>
<ul>
<li>Native-file windows sharing the IndexedDB store — pre-existing; filed as a follow-up.</li>
<li>No durable flush on browser close — pre-existing; filed.</li>
<li>9 SystemSketch tests fail on untouched main (draft.smoke ×7, menus “Zoom to 100%”, corner “narrow 720×900”) — filed.</li>
</ul>

<p class="small">Built by <code>docs/build_sep22_review_report.mjs</code> · Storybooks on :${PORTS.feedback} (feedback branch), :${PORTS.hit} (hit-regions), :${PORTS.toggle} (region-host-toggle), :${PORTS.members} (collapsed-members); the app on :${PORTS.app}${PORTS.appInRoot ? ` and :${PORTS.appInRoot}` : ""} — all this run's own, stopped after capture · Playwright Chromium ${esc(F.chromium ?? "")} · ${new Date().toISOString()}</p>
</main></body></html>`;
}

// ===========================================================================
const factsFile = join(WORK, "facts.json");
let F = existsSync(factsFile) ? JSON.parse(readFileSync(factsFile, "utf8")) : {};
// `--only 2,4` recaptures just those items and keeps the rest of facts.json.
const ONLY = argOf("--only", null)?.split(",").map((n) => Number(n.trim())) ?? [1, 2, 3, 4, 5];
if (!has("--skip-capture")) {
  if (!BOARD) throw new Error("--board <abs .tldr served by --app> is required for capture");
  const browser = await chromium.launch({ headless: true });
  try {
    F.chromium = browser.version();
    const captures = { 1: captureItem1, 2: captureItem2, 3: captureItem3, 4: captureItem4, 5: captureItem5 };
    for (const n of ONLY) {
      F[`item${n}`] = await captures[n](browser);
      writeFileSync(factsFile, JSON.stringify(F, null, 2));
    }
  } finally {
    await browser.close();
  }
}
// The sha each server actually served, read from its worktree at build time
// (`--wt-hit`, `--wt-toggle`, `--wt-members`; the feedback branch is this
// repo). Peers merge into these trees while a capture runs — the index says
// "captured at <sha>" whenever it differs from the sha under review.
F.shas = { feedback: shaOf(REPO), hit: shaOf(WT.hit), toggle: shaOf(WT.toggle), members: shaOf(WT.members), at: new Date().toISOString() };
// Vite's own logs: any "page reload" line that names a board file.
const viteReloads = [VITE_LOG, VITE_LOG_IN_ROOT].filter((f) => f && existsSync(f)).flatMap((f) => readFileSync(f, "utf8").split("\n").filter((line) => /page reload/.test(line) && /\.(tldr|bbox|systemsketch)\b/i.test(line)));
if (F.item1) F.item1.viteReloads = viteReloads.length;
let html = buildHtml(F);
const ceiling = 2097024;
let encoded = Buffer.byteLength(`data:text/html,${encodeURIComponent(html)}`);
F.browserOnly = encoded > ceiling;
if (F.browserOnly) html = buildHtml(F);
writeFileSync(factsFile, JSON.stringify(F, null, 2));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const videos = (html.match(/data:video\/webm/g) ?? []).length;
const stills = (html.match(/data:image\/(jpeg|png)/g) ?? []).length;
console.log(JSON.stringify({ out: OUT, work: WORK, bytes: Buffer.byteLength(html), encoded, previewCeilingPct: Math.round((encoded / ceiling) * 100), browserOnly: F.browserOnly, videos, stills }, null, 2));
