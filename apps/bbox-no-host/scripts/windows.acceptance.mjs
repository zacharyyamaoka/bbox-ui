// apps/bbox-no-host/scripts/windows.acceptance.mjs — B-SHELL-P1 acceptance
// SHELL-P1/no-host-windows: docs/WORK-ORDER-HOST-LESS-SHELL.md A1.5 and
// lanes.json B-SHELL-P1 acceptance line 4, "apps/bbox-no-host renders every
// window on the fake host (headless screenshot)".
//
// Committed RED by the lane's acceptance author before any builder existed
// (docs/lanes/finish-B-SHELL-P1.md). OFF-LIMITS to the builder: it lives under
// the lane's write set (`apps/bbox-no-host/**`) and is excepted from it by name.
//
// Run:  node apps/bbox-no-host/scripts/windows.acceptance.mjs
// Exit 0 = every check passed; exit 1 = the failing checks are printed, each
// with what was measured. The screenshot path is printed either way.
//
// WHY a real browser against the real runner, like `smoke.mjs` (A0.4) beside
// it: the claim is that the windows are HOST-SHAPED — buildable, drivable and
// reviewable with an in-memory fake behind them and no canvas at all. jsdom
// cannot measure a window, and a story would test the kit, not the app Zach
// opens. WHY every spatial claim is a measured rectangle: a window with zero
// height, or one painted off-screen, passes every presence check there is.
//
// It starts and stops its OWN dev server on its own port (never 4360, the
// app's default, which Zach may have open), and writes nothing into the repo.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = Number(process.env.NO_HOST_ACCEPTANCE_PORT ?? 4362);
const APP_URL = `http://127.0.0.1:${PORT}/`;
const SHOT = process.env.NO_HOST_SHOT ?? path.join(os.tmpdir(), `bbox-no-host-windows-${Date.now()}.png`);
const APP_DIR = new URL("..", import.meta.url).pathname;
const VITE = new URL("../node_modules/.bin/vite", import.meta.url).pathname;

const server = spawn(VITE, ["--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: APP_DIR,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stopServer = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
};
process.on("exit", stopServer);

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`dev server never answered on ${APP_URL}\n${serverLog}`);
}

/* ------------------------------------------------------------------ */
/* Checks — each named after what it pins; all are run, all reported.  */
/* ------------------------------------------------------------------ */

const results = [];
async function check(name, body) {
  try {
    await body();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SELECTORS = {
  shell: '[data-slot="bbox-shell"]',
  windows: '[data-slot="bbox-shell-windows"]',
  chromeBar: '[role="toolbar"][aria-label="Board and depth navigation"]',
  dock: '[data-slot="tool-dock"]',
  strip: '[data-slot="status-strip"]',
  readout: '[data-slot="status-strip-readout"]',
  rail: '[data-slot="panel-shell"]',
  pill: '[data-slot="floating-toolbar"][data-visible="true"]',
};

/** Rectangles of whichever selectors match, measured in the page. */
async function measure(page, selectors) {
  return page.evaluate((list) => {
    const out = {};
    const windows = document.querySelector('[data-slot="bbox-shell-windows"]');
    for (const [name, selector] of Object.entries(list)) {
      const el = document.querySelector(selector);
      if (!el) {
        out[name] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[name] = {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        insideWindows: windows ? windows.contains(el) : false,
      };
    }
    return { rects: out, viewport: { w: innerWidth, h: innerHeight } };
  }, selectors);
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The port the app is running on, through its dev handle. */
async function portCall(page, script, arg) {
  return page.evaluate(
    ([source, value]) => {
      const port = window.bboxNoHost?.port;
      if (!port) throw new Error("window.bboxNoHost.port is not set");
      // eslint-disable-next-line no-new-func
      return new Function("port", "value", source)(port, value);
    },
    [script, arg],
  );
}

async function sceneIds(page) {
  return portCall(page, "return port.scene().nodes.map((n) => n.id);");
}

async function closeMenus(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await page.locator('[data-slot="dropdown-menu-content"]').count()) === 0) return;
    await page.keyboard.press("Escape");
    await sleep(150);
  }
}

/** Labels of the rows directly inside the newest open popup (shortcut column excluded). */
async function popupLabels(page, slot) {
  return page.evaluate((selector) => {
    const popups = [...document.querySelectorAll(selector)];
    const popup = popups[popups.length - 1];
    if (!popup) return null;
    const rows = [...popup.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')].filter(
      (row) => row.closest('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]') === popup,
    );
    return rows.map((row) => {
      const shortcut = row.querySelector('[data-slot="dropdown-menu-shortcut"]');
      let text = "";
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (shortcut && shortcut.contains(node)) continue;
        text += node.nodeValue ?? "";
      }
      return text.trim();
    });
  }, `[data-slot="${slot}"]`);
}

/** Open the burger; resolve its root labels. */
async function openBurger(page) {
  await closeMenus(page);
  await page.locator(`${SELECTORS.chromeBar} [aria-haspopup="menu"]`).first().click();
  await page.locator('[data-slot="dropdown-menu-content"] [role="menuitem"]').first().waitFor({ timeout: 5_000 });
  return popupLabels(page, "dropdown-menu-content");
}

/** Labels inside the burger's `label` submenu, or null when there is no such submenu. */
async function submenuLabels(page, label) {
  const root = await openBurger(page);
  if (!root.includes(label)) {
    await closeMenus(page);
    return null;
  }
  await page.locator('[data-slot="dropdown-menu-content"]').getByRole("menuitem", { name: label, exact: true }).click();
  await page.locator('[data-slot="dropdown-menu-sub-content"] [role="menuitem"]').first().waitFor({ timeout: 5_000 });
  const labels = await popupLabels(page, "dropdown-menu-sub-content");
  return labels;
}

async function setCapability(page, capability, on) {
  const box = page.locator(`[data-capability="${capability}"]`);
  if ((await box.isChecked()) !== on) await box.click();
  await sleep(150);
}

/* ------------------------------------------------------------------ */

const problems = [];
let browser = null;

try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // Every window here is local and in-memory; 5 s is generous, and a red run
  // should not cost thirty seconds per missing window.
  page.setDefaultTimeout(5_000);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator(`${SELECTORS.shell}[data-has-canvas="true"]`).waitFor({ timeout: 10_000 });

  await check("the dev handle: window.bboxNoHost.port is the live HostPort (like the studio's window.editor, main.tsx)", async () => {
    const ids = await sceneIds(page);
    assert(Array.isArray(ids) && ids.length >= 3, `scene() read ${JSON.stringify(ids)}`);
  });

  await check("every window is on screen, inside the shell's windows layer, and clear of the others", async () => {
    await page.locator(SELECTORS.chromeBar).waitFor({ timeout: 5_000 });
    const { rects, viewport } = await measure(page, { chromeBar: SELECTORS.chromeBar, dock: SELECTORS.dock, strip: SELECTORS.strip });
    const bad = [];
    for (const [name, rect] of Object.entries(rects)) {
      if (!rect) {
        bad.push(`${name}: not rendered`);
        continue;
      }
      if (rect.width <= 0 || rect.height <= 0) bad.push(`${name}: ${rect.width}×${rect.height}`);
      if (rect.left < 0 || rect.top < 0 || rect.right > viewport.w || rect.bottom > viewport.h) bad.push(`${name}: off screen ${JSON.stringify(rect)}`);
      if (!rect.insideWindows) bad.push(`${name}: not inside [data-slot=bbox-shell-windows]`);
    }
    const names = Object.keys(rects).filter((name) => rects[name]);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        if (overlaps(rects[names[i]], rects[names[j]])) bad.push(`${names[i]} overlaps ${names[j]}`);
      }
    }
    assert(bad.length === 0, bad.join("; "));
  });

  await check("the zoom readout reads viewport().zoom: 100% → zoomTo(2) → 200%", async () => {
    const readout = page.locator(`${SELECTORS.strip} ${SELECTORS.readout}`);
    await readout.waitFor({ timeout: 5_000 });
    const before = (await readout.textContent()) ?? "";
    assert(/100\s*%/.test(before), `readout reads "${before}" at zoom 1`);
    await portCall(page, 'port.view({ kind: "zoomTo", zoom: 2 });');
    await page.waitForFunction((selector) => /200\s*%/.test(document.querySelector(selector)?.textContent ?? ""), `${SELECTORS.strip} ${SELECTORS.readout}`, {
      timeout: 3_000,
    });
    await portCall(page, 'port.view({ kind: "zoomTo", zoom: 1 });');
  });

  await check("the strip opens the right rail on Frames, swaps it to Problems, and closes it", async () => {
    await page.locator(`${SELECTORS.strip} button[aria-label="Frames"]`).click();
    await page.locator(`${SELECTORS.rail} [data-slot="frames-panel"]`).waitFor({ timeout: 3_000 });
    const { rects } = await measure(page, { rail: SELECTORS.rail });
    assert(rects.rail && rects.rail.width > 0 && rects.rail.height > 0 && rects.rail.insideWindows, `rail measured ${JSON.stringify(rects.rail)}`);
    await page.locator(`${SELECTORS.strip} button[aria-label$="problems"], ${SELECTORS.strip} button[aria-label$="problem"]`).first().click();
    await page.locator(`${SELECTORS.rail} [data-slot="problems-panel"]`).waitFor({ timeout: 3_000 });
    await page.locator(`${SELECTORS.strip} button[aria-label$="problems"], ${SELECTORS.strip} button[aria-label$="problem"]`).first().click();
    await page.locator(SELECTORS.rail).waitFor({ state: "detached", timeout: 3_000 });
  });

  await check("a selection shows the floating toolbar centred on selection().screenBounds (≤ 2 px), clear of the selection", async () => {
    await portCall(page, 'port.nodes({ kind: "update", patches: [{ id: "n2", position: { x: 560, y: 360 } }] }); port.select(["n2"]);');
    await page.locator(SELECTORS.pill).waitFor({ timeout: 3_000 });
    // Placement settles in a microtask and a frame; give it two.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bounds = await portCall(page, "return port.selection().screenBounds;");
    const { rects } = await measure(page, { pill: SELECTORS.pill, windows: SELECTORS.windows });
    assert(bounds && rects.pill && rects.windows, `bounds ${JSON.stringify(bounds)}, pill ${JSON.stringify(rects.pill)}`);
    const selection = {
      left: rects.windows.left + bounds.x,
      top: rects.windows.top + bounds.y,
      right: rects.windows.left + bounds.x + bounds.w,
      bottom: rects.windows.top + bounds.y + bounds.h,
    };
    const pillCentre = (rects.pill.left + rects.pill.right) / 2;
    const selectionCentre = (selection.left + selection.right) / 2;
    assert(Math.abs(pillCentre - selectionCentre) <= 2, `pill centre x ${pillCentre.toFixed(1)} vs selection centre x ${selectionCentre.toFixed(1)}`);
    assert(!overlaps(rects.pill, selection), `the pill ${JSON.stringify(rects.pill)} covers the selection ${JSON.stringify(selection)}`);
  });

  await check("the pill's Duplicate and Delete act through the port", async () => {
    const before = await sceneIds(page);
    await page.locator(`${SELECTORS.pill} button[aria-label="Duplicate"]`).click();
    await page.waitForFunction((count) => window.bboxNoHost.port.scene().nodes.length === count, before.length + 1, { timeout: 3_000 });
    await portCall(page, 'port.select(["n2"]);');
    await page.locator(`${SELECTORS.pill} button[aria-label="Delete"]`).click();
    await page.waitForFunction(() => !window.bboxNoHost.port.scene().nodes.some((n) => n.id === "n2"), null, { timeout: 3_000 });
  });

  await check("Edit ▸ Undo and Redo are in the burger and drive the port's history", async () => {
    const labels = await submenuLabels(page, "Edit");
    assert(labels && labels.includes("Undo") && labels.includes("Redo"), `Edit ▸ reads ${JSON.stringify(labels)}`);
    await page.locator('[data-slot="dropdown-menu-sub-content"]').getByRole("menuitem", { name: "Undo", exact: true }).click();
    await page.waitForFunction(() => window.bboxNoHost.port.scene().nodes.some((n) => n.id === "n2"), null, { timeout: 3_000 });
    await closeMenus(page);
  });

  await check("File ▸ Open… and Save are in the burger (documentIo, over serialize/load)", async () => {
    const labels = await submenuLabels(page, "File");
    assert(labels && labels.includes("Open…") && labels.includes("Save"), `File ▸ reads ${JSON.stringify(labels)}`);
    await closeMenus(page);
  });

  // Screenshot with every window up: rail open, a selection, the pill showing.
  await page.locator(`${SELECTORS.strip} button[aria-label="Frames"]`).click().catch(() => {});
  await portCall(page, 'port.select(["n3"]);').catch(() => {});
  await sleep(300);
  await page.screenshot({ path: SHOT });
  await page.locator(`${SELECTORS.strip} button[aria-label="Frames"]`).click().catch(() => {});

  /* ---------- capability gating: the shell HIDES what a host lacks (constraint 4) ---------- */

  await check("tools off → no tool dock; on → the dock is back", async () => {
    await setCapability(page, "tools", false);
    assert((await page.locator(SELECTORS.dock).count()) === 0, "the dock is still rendered without the tools capability");
    await setCapability(page, "tools", true);
    await page.locator(SELECTORS.dock).waitFor({ timeout: 3_000 });
  });

  await check("duplicate off → the pill has Delete but no Duplicate", async () => {
    await setCapability(page, "duplicate", false);
    await portCall(page, 'port.select(["n1"]);');
    await page.locator(SELECTORS.pill).waitFor({ timeout: 3_000 });
    assert((await page.locator(`${SELECTORS.pill} button[aria-label="Delete"]`).count()) === 1, "no Delete on the pill");
    assert((await page.locator(`${SELECTORS.pill} button[aria-label="Duplicate"]`).count()) === 0, "Duplicate shown without the duplicate capability");
    await setCapability(page, "duplicate", true);
  });

  await check("history off → no Undo or Redo anywhere in the burger", async () => {
    await setCapability(page, "history", false);
    const root = await openBurger(page);
    await closeMenus(page);
    const edit = await submenuLabels(page, "Edit");
    await closeMenus(page);
    const all = [...(root ?? []), ...(edit ?? [])];
    assert(!all.includes("Undo") && !all.includes("Redo"), `the burger still offers ${JSON.stringify(all.filter((l) => l === "Undo" || l === "Redo"))}`);
    await setCapability(page, "history", true);
  });

  await check("documentIo off → no Open… or Save anywhere in the burger", async () => {
    await setCapability(page, "documentIo", false);
    const root = await openBurger(page);
    await closeMenus(page);
    const file = await submenuLabels(page, "File");
    await closeMenus(page);
    const all = [...(root ?? []), ...(file ?? [])];
    assert(!all.includes("Open…") && !all.includes("Save"), `the burger still offers ${JSON.stringify(all.filter((l) => l === "Open…" || l === "Save"))}`);
    await setCapability(page, "documentIo", true);
  });

  await check("no host connected → the shell says so and shows no dock and no pill", async () => {
    await page.getByText("host connected").locator("input").uncheck();
    await page.locator(`${SELECTORS.shell}[data-has-canvas="false"]`).waitFor({ timeout: 3_000 });
    assert((await page.locator(SELECTORS.dock).count()) === 0, "a dock with no host behind it");
    assert((await page.locator(SELECTORS.pill).count()) === 0, "a selection pill with no host behind it");
    await page.getByText("host connected").locator("input").check();
  });

  await check("no console error or warning, and no page error, for the whole run", async () => {
    assert(problems.length === 0, problems.join(" | "));
  });
} catch (error) {
  results.push({ name: "the run itself", ok: false, detail: error instanceof Error ? error.message : String(error) });
} finally {
  await browser?.close().catch(() => {});
  stopServer();
}

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "  ✓" : "  ✗"} ${result.name}${result.ok ? "" : `\n      ${result.detail}`}`);
}
console.log(`screenshot: ${SHOT}`);
if (failed.length > 0) {
  console.error(`SHELL-P1/no-host-windows FAILED — ${failed.length} of ${results.length} checks`);
  process.exit(1);
}
console.log(`SHELL-P1/no-host-windows OK — ${results.length} checks`);
