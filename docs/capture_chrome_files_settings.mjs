#!/usr/bin/env node
/**
 * Record the chrome / files / settings round (docs/CHROME-FILES-SETTINGS-PLAN.md)
 * from the REAL running app, for docs/build_chrome_files_settings.py.
 *
 * Same reasoning as docs/capture_storybook_shots.mjs and
 * docs/capture_menu_kit_shots.mjs: a report's evidence has to be re-takeable
 * after the code changes, at a known size. What is different here is the
 * subject — not a Storybook story but `pnpm --filter systemsketch dev` itself,
 * with its Vite dev server, its `devFileHostPlugin`, and the real
 * `scripts/systemsketch_files.py` behind `/api/workspace/*`. Zach's ask was
 * "we need to be able to save real files to the system", so the evidence has
 * to be real bytes landing on a real disk, not a mocked handle.
 *
 *   node docs/capture_chrome_files_settings.mjs --out reports/media/chrome-files-settings-2026-09-19 [--port 4788]
 *
 * TWO SAFETY RULES, both mechanical rather than remembered:
 *
 *  1. The files root is a fresh `mkdtemp`, passed as `SYSTEMSKETCH_FILES_ROOT`
 *     so `resolveDevFileHostRoots` (apps/systemsketch/devFileHost.ts) never
 *     reaches its `HOME` default. Zach's real boards live in
 *     /home/bam/SystemSketch and this script asserts, out loud, that its root
 *     is neither that folder nor anywhere near it before it starts a server.
 *  2. The port is checked free and is never one of the reserved ones
 *     (4321/4322/4323/4325/4340/4341/5421 — the archived app, its API, the
 *     dock, the new app's own dev server, Storybook).
 *
 * Output: `stills/*.png`, `hero.webm` (Playwright) → `hero.mp4` + `hero.gif`
 * (ffmpeg), and `measurements.json` — every number the report quotes about the
 * running app is read HERE, from the live DOM and the live filesystem, and the
 * builder refuses to run without it.
 */
import { spawn, execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "apps/storybook-basics/package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = path.resolve(argOf("--out", "reports/media/chrome-files-settings-2026-09-19"));
const STILLS = path.join(OUT, "stills");
const PORT = Number(argOf("--port", "4788"));
const RESERVED = new Set([4321, 4322, 4323, 4325, 4340, 4341, 5421]);

const VIEW = { width: 1400, height: 900 };
// The hero records at the viewport size; 1280×820 keeps the h264 small enough
// that the whole page stays under the desktop preview's 2 MB encoded ceiling.
const HERO_VIEW = { width: 1280, height: 820 };

/* ----------------------------------------------------------- preflight */

if (RESERVED.has(PORT)) throw new Error(`port ${PORT} is reserved (archived app / dock / dev server / storybook)`);
const free = await new Promise((resolve) => {
  const probe = net.createServer();
  probe.once("error", () => resolve(false));
  probe.once("listening", () => probe.close(() => resolve(true)));
  probe.listen(PORT, "127.0.0.1");
});
if (!free) throw new Error(`port ${PORT} is already in use — pass --port`);

const filesRoot = await mkdtemp(path.join(os.tmpdir(), "ss-capture-"));
const REAL_BOARDS = path.join(os.homedir(), "SystemSketch");
// Belt and braces: the env var above is what keeps us off Zach's boards, so
// prove it rather than trust it.
if (filesRoot === REAL_BOARDS || REAL_BOARDS.startsWith(filesRoot + path.sep) || filesRoot.startsWith(REAL_BOARDS + path.sep)) {
  throw new Error(`refusing to serve a root that touches ${REAL_BOARDS}`);
}
const workspace = path.join(filesRoot, "SystemSketch");
await mkdir(workspace, { recursive: true });
await mkdir(STILLS, { recursive: true });

console.log(`files root   ${filesRoot}`);
console.log(`workspace    ${workspace}`);
console.log(`dev server   http://localhost:${PORT}/`);

/* ------------------------------------------------------- the dev server */

const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], {
  cwd: path.join(repoRoot, "apps/systemsketch"),
  env: {
    ...process.env,
    SYSTEMSKETCH_FILES_ROOT: filesRoot,
    SYSTEMSKETCH_LOCK_ROOT: path.join(filesRoot, "locks"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let viteLog = "";
for (const stream of [vite.stdout, vite.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => (viteLog += chunk));
}
await new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (/Local:\s+http/.test(viteLog)) {
      clearInterval(timer);
      resolve();
    } else if (Date.now() - started > 90_000) {
      clearInterval(timer);
      reject(new Error(`vite never printed its Local: line\n${viteLog}`));
    }
  }, 200);
});

const measurements = { filesRoot, workspace, port: PORT, capturedAt: new Date().toISOString(), viewport: VIEW, heroViewport: HERO_VIEW };
const shutdown = async () => {
  vite.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1200));
  vite.kill("SIGKILL");
};

/* ------------------------------------------------------------- helpers */

const URL_APP = `http://localhost:${PORT}/`;

/** A rendered pointer, moved to exactly the coordinates we then click.
 *  Playwright's video has no OS cursor, so without this the hero looks like
 *  the app operating itself. The dot is never clicked THROUGH — it is
 *  pointer-events:none and the click below is a real Input event at the same
 *  point. */
const CURSOR = `
(() => {
  if (window.__ssCursor) return;
  const dot = document.createElement("div");
  dot.id = "__ss-capture-cursor";
  dot.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;" +
    "border-radius:50%;background:rgba(240,136,62,.30);border:2px solid #f0883e;z-index:2147483647;" +
    "pointer-events:none;transition:transform .28s cubic-bezier(.22,.61,.36,1);opacity:0";
  document.body.appendChild(dot);
  window.__ssCursor = (x, y, down) => {
    dot.style.opacity = "1";
    dot.style.transform = "translate(" + x + "px," + y + "px) scale(" + (down ? 0.62 : 1) + ")";
  };
})();`;

async function installCursor(page) {
  await page.evaluate(CURSOR);
}

async function boxOf(page, selector) {
  const handle = await page.waitForSelector(selector, { state: "visible", timeout: 30_000 });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { handle, box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Move the rendered pointer, pause so the motion reads, then really click. */
async function click(page, selector, { animate = false, dbl = false } = {}) {
  const { x, y } = await boxOf(page, selector);
  if (animate) {
    await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, false), [x, y]);
    await page.waitForTimeout(340);
    await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, true), [x, y]);
  }
  if (dbl) await page.mouse.dblclick(x, y);
  else await page.mouse.click(x, y);
  if (animate) {
    await page.waitForTimeout(90);
    await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, false), [x, y]);
  }
}

/** A menu row by its visible label, inside the last-opened popup of `kind`. */
function rowSelector(label) {
  return { label };
}

async function clickMenuRow(page, label, { animate = false } = {}) {
  const point = await page.evaluate((wanted) => {
    const popups = Array.from(document.querySelectorAll('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]'));
    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const rows = Array.from(popups[i].querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]'));
      const hit = rows.find((row) => {
        const shortcut = row.querySelector('[data-slot="dropdown-menu-shortcut"]');
        const text = (shortcut ? (row.textContent || "").replace(shortcut.textContent || "", "") : row.textContent || "").trim();
        return text === wanted;
      });
      if (hit) {
        const r = hit.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, label);
  if (!point) throw new Error(`no menu row labelled "${label}"`);
  if (animate) {
    await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, false), [point.x, point.y]);
    await page.waitForTimeout(300);
    await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, true), [point.x, point.y]);
  }
  await page.mouse.click(point.x, point.y);
  if (animate) await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, false), [point.x, point.y]);
}

/** Read every row of the deepest open popup — label, shortcut, enabled. */
async function readMenu(page) {
  return page.evaluate(() => {
    const popups = Array.from(document.querySelectorAll('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]'));
    return popups.map((popup) => ({
      slot: popup.getAttribute("data-slot"),
      separators: popup.querySelectorAll('[role="separator"]').length,
      rows: Array.from(popup.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')).map((row) => {
        const shortcut = row.querySelector('[data-slot="dropdown-menu-shortcut"]');
        const label = (shortcut ? (row.textContent || "").replace(shortcut.textContent || "", "") : row.textContent || "").trim();
        return {
          label,
          shortcut: shortcut ? shortcut.textContent.trim() : "",
          role: row.getAttribute("role"),
          disabled: row.getAttribute("data-disabled") !== null || row.getAttribute("aria-disabled") === "true",
          submenu: row.getAttribute("aria-haspopup") === "menu",
        };
      }),
    }));
  });
}

/** Draw one Block with the dock's own System tool and a real canvas drag. */
async function drawBlock(page, from, to, { animate = false } = {}) {
  await click(page, '[data-testid="ss-dock-family-system"]', { animate });
  await page.waitForTimeout(220);
  if (animate) await page.evaluate(([x, y]) => window.__ssCursor?.(x, y, false), [from.x, from.y]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (animate) await page.evaluate(([x, y]) => window.__ssCursor?.(x, y, true), [from.x, from.y]);
  const steps = 14;
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await page.mouse.move(x, y);
    if (animate) await page.evaluate(([px, py]) => window.__ssCursor?.(px, py, true), [x, y]);
    await page.waitForTimeout(animate ? 14 : 4);
  }
  await page.mouse.up();
  if (animate) await page.evaluate(([x, y]) => window.__ssCursor?.(x, y, false), [to.x, to.y]);
  await page.waitForTimeout(260);
  await page.keyboard.press("Escape");
}

/** Crop helper: clip a screenshot to a measured DOM rect, with padding. */
async function shotRect(page, file, selector, pad = 14) {
  const { box } = await boxOf(page, selector);
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  await page.screenshot({ path: path.join(STILLS, file), clip });
}

/** Crop to the union of several measured rects (a menu plus its submenu). */
async function shotUnion(page, file, selectors, pad = 16) {
  const clip = await page.evaluate(
    ([sels, p]) => {
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          l = Math.min(l, rect.left); t = Math.min(t, rect.top);
          r = Math.max(r, rect.right); b = Math.max(b, rect.bottom);
        }
      }
      if (l === Infinity) return null;
      l = Math.max(0, l - p); t = Math.max(0, t - p);
      r = Math.min(window.innerWidth, r + p); b = Math.min(window.innerHeight, b + p);
      return { x: l, y: t, width: r - l, height: b - t };
    },
    [selectors, pad],
  );
  if (!clip) throw new Error(`nothing visible for ${selectors.join(", ")}`);
  await page.screenshot({ path: path.join(STILLS, file), clip });
}

const settingsOption = (section, value) =>
  `[data-testid="ss-settings"] [data-slot="settings-section"][data-section-id="${section}"] [role="radio"][data-option-value="${value}"]`;

async function openApp(context, { board = null } = {}) {
  const page = await context.newPage();
  await page.goto(board ? `${URL_APP}?board=${encodeURIComponent(board)}` : URL_APP, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".tl-canvas", { timeout: 60_000 });
  await page.waitForSelector('[data-testid="ss-chrome-burger"]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await installCursor(page);
  return page;
}

/* =================================================== PASS 1 — the stills */

const browser = await chromium.launch();
try {
  const stillCtx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await openApp(stillCtx);

  // -- 0. the whole window at boot: no undo/redo pill anywhere in the chrome.
  await page.screenshot({ path: path.join(STILLS, "boot.png") });
  measurements.chromeTestIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id && id.startsWith("ss-chrome")),
  );
  measurements.undoRedoPill = await page.evaluate(() => ({
    undoTestId: document.querySelector('[data-testid="ss-chrome-undo"]') !== null,
    redoTestId: document.querySelector('[data-testid="ss-chrome-redo"]') !== null,
    tldrawHistoryGroup: document.querySelector('[aria-label="Document history"]') !== null,
  }));

  // -- 1. the rename field: the title's own box, before and after.
  await drawBlock(page, { x: 430, y: 330 }, { x: 640, y: 450 });
  // Deselect first: a live selection floats the toolbar OVER the chrome bar,
  // and a before/after pair whose "before" carries a stray overlay is not a
  // comparison of the thing being compared.
  await page.mouse.click(1150, 720);
  await page.waitForTimeout(350);
  await shotRect(page, "rename-before.png", '[data-testid="ss-chrome"]');
  measurements.titleBeforeSave = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="ss-chrome-title"]');
    return {
      text: title.textContent.trim(),
      tone: title.querySelector('[data-slot="chrome-bar-status-dot"]')?.getAttribute("data-tone") ?? null,
    };
  });
  const titleRect = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="ss-chrome-title"]').getBoundingClientRect();
    const bar = document.querySelector('[data-testid="ss-chrome"]').getBoundingClientRect();
    return { title: { left: t.left, top: t.top, width: t.width, height: t.height }, bar: { left: bar.left, top: bar.top, width: bar.width, height: bar.height } };
  });
  await click(page, '[data-testid="ss-chrome-title"]', { dbl: true });
  await page.waitForSelector('[data-slot="inline-rename-input"]', { timeout: 15_000 });
  await page.waitForTimeout(300);
  await shotRect(page, "rename-after.png", '[data-testid="ss-chrome"]');
  const fieldRect = await page.evaluate(() => {
    const i = document.querySelector('[data-slot="inline-rename-input"]').getBoundingClientRect();
    const bar = document.querySelector('[data-testid="ss-chrome"]').getBoundingClientRect();
    const root = document.querySelector('[data-slot="inline-rename"]');
    const rootRect = root ? root.getBoundingClientRect() : null;
    return {
      field: { left: i.left, top: i.top, width: i.width, height: i.height },
      bar: { left: bar.left, top: bar.top, width: bar.width, height: bar.height },
      root: rootRect ? { height: rootRect.height } : null,
      hintInDocument: /Press Enter|Escape to cancel/.test(document.body.textContent || ""),
    };
  });
  measurements.rename = {
    ...titleRect,
    ...fieldRect,
    delta: {
      left: Math.abs(fieldRect.field.left - titleRect.title.left),
      top: Math.abs(fieldRect.field.top - titleRect.title.top),
      width: Math.abs(fieldRect.field.width - titleRect.title.width),
      height: Math.abs(fieldRect.field.height - titleRect.title.height),
    },
    barDelta: {
      left: Math.abs(fieldRect.bar.left - titleRect.bar.left),
      top: Math.abs(fieldRect.bar.top - titleRect.bar.top),
      width: Math.abs(fieldRect.bar.width - titleRect.bar.width),
      height: Math.abs(fieldRect.bar.height - titleRect.bar.height),
    },
  };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  // -- 2. the burger, open, with the File submenu beside it.
  await click(page, '[data-testid="ss-chrome-burger"]');
  await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await page.waitForTimeout(350);
  measurements.burgerRoot = (await readMenu(page))[0];
  await shotUnion(page, "burger-root.png", ['[data-slot="dropdown-menu-content"]']);
  await clickMenuRow(page, "File");
  await page.waitForSelector('[data-slot="dropdown-menu-sub-content"]', { timeout: 15_000 });
  await page.waitForTimeout(400);
  const menus = await readMenu(page);
  measurements.fileMenu = menus.find((m) => m.slot === "dropdown-menu-sub-content");
  measurements.burgerAll = menus;
  await shotUnion(page, "burger-file.png", ['[data-slot="dropdown-menu-content"]', '[data-slot="dropdown-menu-sub-content"]']);

  // -- 3. Save As… → the navigator, then a real file on a real disk.
  await clickMenuRow(page, "Save As…");
  await page.waitForSelector('[data-testid="ss-file-navigator"][data-mode="saveAs"]', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await shotUnion(page, "navigator-saveas.png", ['[data-testid="ss-file-navigator"]']);
  const nameField = '[data-testid="ss-file-navigator-name"]';
  await click(page, nameField);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Pose pipeline");
  await page.waitForTimeout(200);
  await click(page, '[data-testid="ss-file-navigator-confirm"]');
  const savedPath = path.join(workspace, "Pose pipeline.tldr");
  for (let i = 0; i < 100; i += 1) {
    try { await stat(savedPath); break; } catch { await page.waitForTimeout(200); }
  }
  const savedStat = await stat(savedPath);
  const savedBytes = await readFile(savedPath, "utf8");
  measurements.saved = {
    path: savedPath,
    bytes: savedStat.size,
    records: JSON.parse(savedBytes).records.length,
    blocks: JSON.parse(savedBytes).records.filter((r) => r.typeName === "shape" && r.type === "ss-block").length,
    head: savedBytes.slice(0, 220),
  };
  await page.waitForTimeout(900);
  await shotRect(page, "title-saved.png", '[data-testid="ss-chrome"]');
  measurements.titleAfterSave = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="ss-chrome-title"]');
    return {
      text: title.textContent.trim(),
      tone: title.querySelector('[data-slot="chrome-bar-status-dot"]')?.getAttribute("data-tone") ?? null,
    };
  });

  // -- seed siblings so the Open… navigator shows a real folder, not one row.
  await cp(savedPath, path.join(workspace, "Gripper cell.tldr"));
  await cp(savedPath, path.join(workspace, "Sorting line.tldr"));
  await mkdir(path.join(workspace, "Archive"), { recursive: true });
  await cp(savedPath, path.join(workspace, "Archive", "Sorter v1.tldr"));
  // A `.systemsketch` row is listed and hands off to the archived app, which
  // owns that envelope — this app never writes one (plan §6).
  await writeFile(path.join(workspace, "legacy pipeline.systemsketch"), JSON.stringify({ schemaVersion: 1, note: "placeholder envelope, created by docs/capture_chrome_files_settings.mjs" }, null, 2));

  // -- 4. Open… → the navigator over that folder.
  await click(page, '[data-testid="ss-chrome-burger"]');
  await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await clickMenuRow(page, "File");
  await page.waitForSelector('[data-slot="dropdown-menu-sub-content"]', { timeout: 15_000 });
  await page.waitForTimeout(250);
  await clickMenuRow(page, "Open…");
  await page.waitForSelector('[data-testid="ss-file-navigator"][data-mode="open"]', { timeout: 20_000 });
  await page.waitForTimeout(900);
  await shotUnion(page, "navigator-open.png", ['[data-testid="ss-file-navigator"]']);
  measurements.navigator = await page.evaluate(() => {
    const dialog = document.querySelector('[data-testid="ss-file-navigator"]');
    const rows = Array.from(dialog.querySelectorAll('[data-testid="ss-file-navigator-row"]'));
    return {
      mode: dialog.getAttribute("data-mode"),
      places: Array.from(dialog.querySelectorAll('[data-testid="ss-file-navigator-place"]')).map((e) => e.textContent.trim()),
      columns: Array.from(dialog.querySelectorAll('[data-testid^="ss-file-navigator-sort-"]')).map((e) => e.textContent.trim()),
      rows: rows.map((row) => ({ path: row.getAttribute("data-path"), text: row.textContent.trim().slice(0, 80), kind: row.getAttribute("data-kind") })),
      hasFilter: dialog.querySelector('[data-testid="ss-file-navigator-filter"]') !== null,
      hasNewFolder: dialog.querySelector('[data-testid="ss-file-navigator-new-folder"]') !== null,
      hasOpenInNewWindow: dialog.querySelector('[data-testid="ss-file-navigator-open-in-new-window"]') !== null,
    };
  });
  await click(page, '[data-testid="ss-file-navigator-cancel"]');
  await page.waitForTimeout(400);

  // -- 5. Settings: the dialog, then the page — the same view, re-presented.
  await click(page, '[data-testid="ss-chrome-burger"]');
  await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await clickMenuRow(page, "Settings");
  await page.waitForSelector('[data-testid="ss-settings"]', { timeout: 20_000 });
  await page.waitForTimeout(700);
  await shotUnion(page, "settings-dialog.png", ['[data-testid="ss-settings"]']);
  measurements.settings = await page.evaluate(() => {
    const view = document.querySelector('[data-testid="ss-settings"]');
    const rect = view.getBoundingClientRect();
    return {
      presentation: view.getAttribute("data-presentation"),
      role: view.getAttribute("role"),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      nav: Array.from(view.querySelectorAll('[data-slot="settings-nav"] a, [data-slot="settings-nav"] button')).map((e) => e.textContent.trim()),
      sections: Array.from(view.querySelectorAll('[data-slot="settings-section"]')).map((section) => ({
        id: section.getAttribute("data-section-id"),
        options: Array.from(section.querySelectorAll('[role="radio"]')).map((r) => ({
          value: r.getAttribute("data-option-value"),
          checked: r.getAttribute("aria-checked") === "true",
          disabled: r.getAttribute("aria-disabled") === "true" || r.hasAttribute("data-disabled"),
          text: (r.closest("label") || r.parentElement)?.textContent.trim().slice(0, 120),
        })),
      })),
    };
  });
  await click(page, settingsOption("settings-presentation", "page"));
  await page.waitForFunction(() => document.querySelector('[data-testid="ss-settings"]')?.getAttribute("data-presentation") === "page", { timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(STILLS, "settings-page.png") });
  measurements.settingsPage = await page.evaluate(() => {
    const view = document.querySelector('[data-testid="ss-settings"]');
    const rect = view.getBoundingClientRect();
    return {
      presentation: view.getAttribute("data-presentation"),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  // -- 6. native mode: the File menu offers only what a picker can honour.
  await click(page, settingsOption("settings-presentation", "dialog"));
  await page.waitForTimeout(400);
  await click(page, settingsOption("file-navigation", "native"));
  await page.waitForTimeout(500);
  measurements.nativeSelected = await page.evaluate(
    () => document.querySelector('[data-slot="settings-section"][data-section-id="file-navigation"] [role="radio"][data-option-value="native"]')?.getAttribute("aria-checked"),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tl-canvas", { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await installCursor(page);
  await click(page, '[data-testid="ss-chrome-burger"]');
  await page.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await clickMenuRow(page, "File");
  await page.waitForSelector('[data-slot="dropdown-menu-sub-content"]', { timeout: 15_000 });
  await page.waitForTimeout(400);
  measurements.fileMenuNative = (await readMenu(page)).find((m) => m.slot === "dropdown-menu-sub-content");
  await shotUnion(page, "burger-file-native.png", ['[data-slot="dropdown-menu-content"]', '[data-slot="dropdown-menu-sub-content"]']);
  await page.keyboard.press("Escape");

  await stillCtx.close();

  /* ================================================ PASS 2 — the hero take */

  const videoDir = path.join(OUT, "video-raw");
  await rm(videoDir, { recursive: true, force: true });
  const heroCtx = await browser.newContext({
    viewport: HERO_VIEW,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: HERO_VIEW },
  });
  const hero = await openApp(heroCtx);
  await hero.waitForTimeout(400);

  //  1 — a Block, drawn with the dock's own tool.
  await drawBlock(hero, { x: 430, y: 330 }, { x: 660, y: 460 }, { animate: true });
  await hero.waitForTimeout(350);

  //  2 — rename in the title's own box (no shift, no hint).
  await click(hero, '[data-testid="ss-chrome-title"]', { animate: true, dbl: true });
  await hero.waitForSelector('[data-slot="inline-rename-input"]', { timeout: 15_000 });
  await hero.waitForTimeout(350);
  await hero.keyboard.press("ControlOrMeta+a");
  await hero.keyboard.type("Sorter v2", { delay: 50 });
  await hero.waitForTimeout(350);
  await hero.keyboard.press("Enter");
  await hero.waitForTimeout(400);

  //  3 — the burger, File, and its shortcuts.
  await click(hero, '[data-testid="ss-chrome-burger"]', { animate: true });
  await hero.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await hero.waitForTimeout(450);
  await clickMenuRow(hero, "File", { animate: true });
  await hero.waitForSelector('[data-slot="dropdown-menu-sub-content"]', { timeout: 15_000 });
  await hero.waitForTimeout(700);

  //  4 — Save As… → the navigator → a real .tldr on disk.
  await clickMenuRow(hero, "Save As…", { animate: true });
  await hero.waitForSelector('[data-testid="ss-file-navigator"][data-mode="saveAs"]', { timeout: 20_000 });
  await hero.waitForTimeout(450);
  await click(hero, '[data-testid="ss-file-navigator-name"]', { animate: true });
  await hero.keyboard.press("ControlOrMeta+a");
  await hero.keyboard.type("Sorter v2", { delay: 45 });
  await hero.waitForTimeout(350);
  await click(hero, '[data-testid="ss-file-navigator-confirm"]', { animate: true });
  const heroPath = path.join(workspace, "Sorter v2.tldr");
  for (let i = 0; i < 100; i += 1) {
    try { await stat(heroPath); break; } catch { await hero.waitForTimeout(200); }
  }
  await hero.waitForTimeout(800);

  //  5 — Open…: the file that was just written, listed beside the others.
  await click(hero, '[data-testid="ss-chrome-burger"]', { animate: true });
  await hero.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await hero.waitForTimeout(400);
  await clickMenuRow(hero, "File", { animate: true });
  await hero.waitForSelector('[data-slot="dropdown-menu-sub-content"]', { timeout: 15_000 });
  await hero.waitForTimeout(350);
  await clickMenuRow(hero, "Open…", { animate: true });
  await hero.waitForSelector('[data-testid="ss-file-navigator"][data-mode="open"]', { timeout: 20_000 });
  await hero.waitForTimeout(1000);
  await click(hero, '[data-testid="ss-file-navigator-cancel"]', { animate: true });
  await hero.waitForTimeout(400);

  //  6 — Settings, as a dialog, then as a page.
  await click(hero, '[data-testid="ss-chrome-burger"]', { animate: true });
  await hero.waitForSelector('[data-slot="dropdown-menu-content"]', { timeout: 15_000 });
  await hero.waitForTimeout(400);
  await clickMenuRow(hero, "Settings", { animate: true });
  await hero.waitForSelector('[data-testid="ss-settings"]', { timeout: 20_000 });
  await hero.waitForTimeout(950);
  await click(hero, settingsOption("settings-presentation", "page"), { animate: true });
  await hero.waitForFunction(() => document.querySelector('[data-testid="ss-settings"]')?.getAttribute("data-presentation") === "page", { timeout: 15_000 });
  await hero.waitForTimeout(950);

  const video = hero.video();
  await heroCtx.close();
  const rawPath = await video.path();
  measurements.hero = { raw: rawPath, size: HERO_VIEW };

  // -- the workspace as it stands on disk once BOTH passes have written to it.
  const listing = async (dir) =>
    Promise.all(
      (await readdir(dir, { withFileTypes: true }))
        .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
        .map(async (entry) => ({
          name: entry.name,
          dir: entry.isDirectory(),
          bytes: entry.isDirectory() ? null : (await stat(path.join(dir, entry.name))).size,
        })),
    );
  measurements.workspaceOnDisk = await listing(workspace);
  measurements.heroSavedBytes = (await stat(heroPath)).size;

  /* -------------------------------------------------- mp4 + gif fallback */

  const mp4 = path.join(OUT, "hero.mp4");
  const gif = path.join(OUT, "hero.gif");
  const palette = path.join(OUT, "palette.png");
  execFileSync("ffmpeg", ["-y", "-i", rawPath, "-an", "-vcodec", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-preset", "veryslow", "-crf", "33", "-movflags", "+faststart", "-vf", "scale=1120:-2", mp4], { stdio: "ignore" });
  // The GIF is a fallback, not a second hero — it renders only where the
  // <video> will not. 480px / 5fps / 48 colours, measured against the
  // alternatives on this very take: 560px·6fps·64c = 604 KB, 520·5·56 = 488 KB,
  // 480·5·48 = 428 KB. The mp4 above is 1120px and smaller than all three,
  // which is the whole reason the GIF is second.
  execFileSync("ffmpeg", ["-y", "-i", rawPath, "-vf", "fps=5,scale=480:-1:flags=lanczos,palettegen=max_colors=48", palette], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-i", rawPath, "-i", palette, "-lavfi",
    "fps=5,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3", "-loop", "0", gif], { stdio: "ignore" });
  await rm(palette, { force: true });

  const durationOf = (file) =>
    Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).toString().trim());
  measurements.heroMp4 = { path: mp4, bytes: (await stat(mp4)).size, seconds: durationOf(mp4) };
  measurements.heroGif = { path: gif, bytes: (await stat(gif)).size };

  const stillFiles = await readdir(STILLS);
  measurements.stills = {};
  for (const file of stillFiles.sort()) measurements.stills[file] = (await stat(path.join(STILLS, file))).size;

  await writeFile(path.join(OUT, "measurements.json"), JSON.stringify(measurements, null, 2));
  console.log(`\nstills      ${stillFiles.length} -> ${STILLS}`);
  console.log(`hero        ${(measurements.heroMp4.bytes / 1024).toFixed(0)} KB mp4 / ${(measurements.heroGif.bytes / 1024).toFixed(0)} KB gif / ${measurements.heroMp4.seconds.toFixed(1)}s`);
  console.log(`measured    ${path.join(OUT, "measurements.json")}`);
} finally {
  await browser.close().catch(() => {});
  await shutdown();
}
