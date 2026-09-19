// apps/systemsketch/tests/pyblocks_backend_smoke.mjs — the SIX acceptance
// assertions of docs/PYBLOCKS-BACKEND-PLAN.md §6 L3, driven end to end
// against the REAL app in a REAL headless Chromium and a REAL
// `python3 -m pyblocks serve`. COMMITTED BEFORE the implementation it
// grades, in its own commit, and never weakened afterwards.
//
// WHY this is a standalone script and not a `*.smoke.test.tsx`: those mount
// `<App/>` inside Vitest's browser runner (`src/testing/harness.tsx`), which
// gives a DOM but no second process — and five of the six assertions here
// are about what crosses the wire to a python server this file starts and
// stops itself. It follows the harness's own posture instead: ports from
// env, a deterministic camera, `waitFor` polling rather than sleeps, and
// spatial claims measured (`getBoundingClientRect` / `pageToScreen`) rather
// than asserted from DOM presence.
//
//   node apps/systemsketch/tests/pyblocks_backend_smoke.mjs
//
// Env (all optional):
//   SS_APP_PORT          the app's vite port            (default: a free one)
//   PYBLOCKS_PORT        the pyblocks port              (default: 0 = the OS picks)
//   PYBLOCKS_WORKTREE    the pyblocks checkout to serve (default: the L1 lane worktree)
//   PYBLOCKS_DIST        the viewer bundle `serve` needs
//   SS_SMOKE_MEDIA       where the screenshots land
//   SS_SMOKE_HEADED=1    watch it run
//
// It never binds 4321, 4322, 4323, 4325, 5421, 5193, 5199, 4599 or 4340:
// every port is either taken from env or asked of the OS.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(APP_DIR, "../..");

const PYBLOCKS_WORKTREE = process.env.PYBLOCKS_WORKTREE ?? "/home/bam/pyblocks/.claude/worktrees/lane-pb-pyblocks-scene-projection-2026-09-18";
const PYBLOCKS_DIST = process.env.PYBLOCKS_DIST ?? "/home/bam/pyblocks/dist";
const MEDIA_DIR = process.env.SS_SMOKE_MEDIA ?? "/home/bam/bbox-ui/reports/media/lanes-2026-09-18/pb-app-backend-wiring";

/** The source the plan's `linear_chain` fixture describes: `run(raw)` calls
 *  `decode(raw)` then `scale(frame, 2.0)`. The `2.0` is the literal that has
 *  to arrive as a value node inside the boundary region. */
const LINEAR_CHAIN_PY = `from dataclasses import dataclass


@dataclass
class Frame:
    gain: float


def decode(raw: bytes) -> Frame:
    """Decode raw bytes into a frame."""
    return Frame(gain=float(len(raw)))


def scale(frame: Frame, gain: float) -> Frame:
    """Scale a frame by a gain."""
    return Frame(gain=frame.gain * gain)


def run(raw: bytes) -> Frame:
    frame = decode(raw)
    scaled = scale(frame, 2.0)
    return scaled
`;

/* ------------------------------------------------------------------ */
/* Tiny harness — the same shape as src/testing/harness.tsx's waitFor  */
/* ------------------------------------------------------------------ */

const checks = [];
let failures = 0;

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitFor(probe, { timeout = 20_000, what = "condition" } = {}) {
  const started = Date.now();
  for (;;) {
    let value = null;
    try {
      value = await probe();
    } catch {
      value = null;
    }
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`waitFor timed out after ${timeout}ms — ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function spawnAndWatch(command, args, options, match, { what }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => reject(new Error(`${what} never printed its address.\n${output}`)), 90_000);
    const read = (chunk) => {
      output += String(chunk);
      const found = match(output);
      if (found) {
        clearTimeout(timer);
        resolve({ child, found, output: () => output });
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${what} exited with ${code}\n${output}`));
    });
  });
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(MEDIA_DIR, { recursive: true });
  const scratch = mkdtempSync(path.join(tmpdir(), "ss-pyblocks-smoke-"));
  const pyFile = path.join(scratch, "linear_chain.py");
  writeFileSync(pyFile, LINEAR_CHAIN_PY, "utf8");

  const appPort = Number(process.env.SS_APP_PORT ?? (await freePort()));
  const deadPort = await freePort(); // nothing will ever listen here — that is the point
  const stops = [];
  let browser = null;

  try {
    /* -- the pyblocks server, on a port it picks itself ------------- */
    const py = await spawnAndWatch(
      "python3",
      ["-m", "pyblocks", "serve", "--no-browser", "--port", String(process.env.PYBLOCKS_PORT ?? 0), "--dist", PYBLOCKS_DIST],
      { cwd: PYBLOCKS_WORKTREE, env: { ...process.env, PYTHONUNBUFFERED: "1" } },
      (text) => text.match(/serving .* at (http:\/\/[^\s]+)/)?.[1] ?? null,
      { what: "pyblocks serve" },
    );
    stops.push(() => py.child.kill("SIGTERM"));
    const pyblocksUrl = py.found.replace(/\/$/, "");
    console.log(`pyblocks → ${pyblocksUrl}`);

    /* -- the app's own vite dev server ------------------------------ */
    const vite = await spawnAndWatch(
      path.join(APP_DIR, "node_modules/.bin/vite"),
      ["--port", String(appPort), "--strictPort"],
      { cwd: APP_DIR, env: { ...process.env, FORCE_COLOR: "0" } },
      (text) => (text.includes("ready in") || text.includes("Local:") ? `http://127.0.0.1:${appPort}` : null),
      { what: "vite" },
    );
    stops.push(() => vite.child.kill("SIGTERM"));
    const appUrl = vite.found;
    console.log(`app      → ${appUrl}`);

    /* -- the browser ------------------------------------------------ */
    browser = await chromium.launch({ headless: process.env.SS_SMOKE_HEADED !== "1" });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    // The fetch spy of assertion (1): every `fetch` the page makes, recorded
    // before any app module has evaluated.
    await page.addInitScript(() => {
      window.__fetches = [];
      const real = window.fetch;
      window.fetch = (input, init) => {
        window.__fetches.push(String(typeof input === "string" ? input : input?.url ?? input));
        return real(input, init);
      };
    });

    // The wire itself, which is what assertions (4) and (5) are really about.
    const eventPosts = [];
    const eventEchoes = [];
    page.on("request", (request) => {
      if (!request.url().includes("/api/systemsketch/events")) return;
      try {
        eventPosts.push(JSON.parse(request.postData() ?? "{}"));
      } catch {
        eventPosts.push({ parseError: request.postData() });
      }
    });
    page.on("response", async (response) => {
      if (!response.url().includes("/api/systemsketch/events")) return;
      try {
        eventEchoes.push(await response.json());
      } catch {
        /* a non-JSON reply is caught by the assertions that read the echo */
      }
    });

    await page.goto(appUrl);
    await page.waitForSelector('[data-testid="systemsketch-app"]');
    await waitFor(() => page.evaluate(() => !!window.editor), { what: "the dev-only window.editor handle" });
    await page.waitForSelector(".tl-canvas");
    await page.evaluate(() => {
      window.editor.user.updateUserPreferences({ animationSpeed: 0 });
      window.editor.setCamera({ x: 0, y: 0, z: 1 });
    });
    await page.waitForTimeout(500);

    /* ================================================================
       (1) Backend: none — the whiteboard promise
       ================================================================ */
    const clean = await page.evaluate(() => {
      const mentions = [];
      for (const element of document.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          if (attribute.name.startsWith("data-") && /pyblocks/i.test(attribute.value)) {
            mentions.push(`${element.tagName}[${attribute.name}="${attribute.value}"]`);
          }
        }
      }
      const text = document.body.innerText ?? "";
      return {
        attributeMentions: mentions,
        textMentions: /pyblocks/i.test(text) ? text.match(/.{0,40}pyblocks.{0,40}/i) : null,
        apiFetches: (window.__fetches ?? []).filter((url) => url.includes("/api/")),
      };
    });
    check("(1) no data-* attribute mentions pyblocks at the default setting", clean.attributeMentions.length === 0, clean.attributeMentions.join(", "));
    check("(1) no rendered text mentions pyblocks at the default setting", clean.textMentions === null, String(clean.textMentions));
    check("(1) the fetch spy recorded zero backend calls", clean.apiFetches.length === 0, clean.apiFetches.join(", "));
    check(
      "(1) the Backend control itself is there, reading `none`",
      (await page.textContent('[data-testid="ss-backend-trigger"]'))?.includes("none") === true,
      await page.textContent('[data-testid="ss-backend-trigger"]'),
    );
    await page.screenshot({ path: path.join(MEDIA_DIR, "01-backend-none.png") });

    /* ================================================================
       (2) pyblocks @ a dead port — the reason, and still no menu item
       ================================================================ */
    await page.click('[data-testid="ss-backend-trigger"]');
    await page.waitForSelector('[data-testid="ss-backend-kind"]');
    await page.selectOption('[data-testid="ss-backend-kind"]', "pyblocks");
    await page.fill('[data-testid="ss-backend-url"]', `http://127.0.0.1:${deadPort}`);
    await page.press('[data-testid="ss-backend-url"]', "Enter");
    await waitFor(async () => (await page.getAttribute('[data-testid="ss-backend-health"]', "data-ok")) === "false", {
      what: "the health pill turning red for a dead port",
    });
    const downReason = (await page.textContent('[data-testid="ss-backend-health"]')) ?? "";
    check("(2) the settings row shows the health reason", downReason.trim().length > 0, downReason.trim());
    check("(2) the Open Python file… item is absent while the server is down", (await page.locator('[data-testid="ss-backend-open-python"]').count()) === 0);
    check("(2) the Python menu is absent while the server is down", (await page.locator('[data-testid="ss-backend-menu"]').count()) === 0);
    await page.screenshot({ path: path.join(MEDIA_DIR, "02-backend-down.png") });

    /* ================================================================
       (3) pyblocks up — the pill, the menu item, and the board
       ================================================================ */
    await page.fill('[data-testid="ss-backend-url"]', pyblocksUrl);
    await page.press('[data-testid="ss-backend-url"]', "Enter");
    await waitFor(async () => (await page.getAttribute('[data-testid="ss-backend-health"]', "data-ok")) === "true", {
      what: "the health pill turning green",
    });
    const okText = ((await page.textContent('[data-testid="ss-backend-health"]')) ?? "").trim();
    check("(3) the health pill reads ok · scene · events", okText === "ok · scene · events", okText);
    await page.keyboard.press("Escape");
    await waitFor(async () => (await page.locator('[data-testid="ss-backend-menu"]').count()) === 1, { what: "the Python menu appearing" });
    await page.click('[data-testid="ss-backend-menu"]');
    await waitFor(async () => (await page.locator('[data-testid="ss-backend-open-python"]').count()) === 1, {
      what: "the Open Python file… item appearing",
    });
    check("(3) the Open Python file… menu item appears once health is ok", true);
    await page.screenshot({ path: path.join(MEDIA_DIR, "03-menu-item.png") });
    await page.keyboard.press("Escape");

    await page.setInputFiles('[data-testid="ss-backend-file"]', pyFile);
    // Four defs in this file, so the view list is the documented path.
    await waitFor(async () => (await page.locator('[data-testid="ss-backend-views"] [data-view-id]').count()) > 1, {
      what: "the view list for a file with more than one view",
    });
    const viewTitles = await page.locator('[data-testid="ss-backend-views"] [data-view-id]').allTextContents();
    check("(3) a file with several views offers a plain list of their titles", viewTitles.length === 4, viewTitles.join(" | "));
    await page.screenshot({ path: path.join(MEDIA_DIR, "04-view-list.png") });
    await page.click('[data-testid="ss-backend-views"] [data-view-id*="run@"]');

    await waitFor(async () => (await page.locator('[data-testid="ss-backend-title"]').count()) === 1, { what: "the board title" });
    const title = ((await page.textContent('[data-testid="ss-backend-title"]')) ?? "").trim();
    check("(3) the board is titled after the file", title === "linear_chain.py", title);

    const board = await waitFor(
      async () => {
        const shot = await page.evaluate(() => {
          const editor = window.editor;
          const shapes = editor.getCurrentPageShapes().map((shape) => ({
            id: shape.id,
            type: shape.type,
            parentId: String(shape.parentId),
            name: String(shape.props?.name ?? ""),
            ports: shape.props?.ports
              ? Object.fromEntries(Object.entries(shape.props.ports).map(([side, rail]) => [side, rail.map((port) => `${port.id}:${port.name}`)]))
              : null,
          }));
          return { shapes };
        });
        return shot.shapes.length > 0 ? shot : null;
      },
      { what: "the pyblocks board reaching the store" },
    );
    const nodes = board.shapes.filter((shape) => shape.type !== "ss-wire");
    const wires = board.shapes.filter((shape) => shape.type === "ss-wire");
    const topLevel = nodes.filter((shape) => shape.parentId.startsWith("page:"));
    check("(3) exactly one top-level node shape, and it is the boundary region", topLevel.length === 1 && topLevel[0].type === "ss-region", JSON.stringify(topLevel.map((s) => `${s.type} ${s.name}`)));
    const names = nodes.map((shape) => shape.name);
    check("(3) decode(), scale() and the 2.0 literal are inside it", ["decode()", "scale()", "2.0"].every((name) => names.includes(name)), names.join(", "));
    const insideRegion = nodes.filter((shape) => shape.parentId === topLevel[0]?.id);
    check("(3) every other node is a member of the region, never a sibling", insideRegion.length === nodes.length - 1, `${insideRegion.length} of ${nodes.length - 1}`);
    check("(3) all four data wires were built", wires.length === 4, `${wires.length} wires`);
    const labelled = nodes.flatMap((shape) => Object.values(shape.ports ?? {}).flat());
    check("(3) a named port keeps its authored label, not its id", labelled.includes("in-raw:raw"), labelled.join(" "));
    await page.evaluate(() => window.editor.zoomToFit());
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(MEDIA_DIR, "05-board.png") });

    /* ================================================================
       (4) a drag → ONE batch, ONE node-moved, echoed `presentation`
       ================================================================ */
    eventPosts.length = 0;
    eventEchoes.length = 0;
    const grab = await page.evaluate(() => {
      const editor = window.editor;
      const shape = editor.getCurrentPageShapes().find((one) => one.props?.name === "decode()");
      const bounds = editor.getShapePageBounds(shape.id);
      const centre = editor.pageToScreen({ x: bounds.x + bounds.w / 2, y: bounds.y + 12 });
      return { id: shape.id, x: centre.x, y: centre.y };
    });
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 40, grab.y + 60, { steps: 12 });
    await page.mouse.move(grab.x + 80, grab.y + 120, { steps: 12 });
    await page.mouse.up();
    await waitFor(() => (eventEchoes.length > 0 ? eventEchoes : null), { what: "an echo for the drag" });
    await page.waitForTimeout(600);
    const dragBatches = eventPosts.flatMap((post) => post.batches ?? []);
    check("(4) a drag publishes exactly one batch", dragBatches.length === 1, JSON.stringify(eventPosts).slice(0, 400));
    check(
      "(4) that batch carries exactly one node-moved event",
      dragBatches[0]?.events?.length === 1 && dragBatches[0]?.events?.[0]?.type === "node-moved",
      JSON.stringify(dragBatches[0]?.events),
    );
    const dragClasses = eventEchoes.flatMap((echo) => (echo.classified ?? []).flatMap((one) => one.events.map((event) => event.class)));
    check("(4) the server classified it `presentation`", dragClasses.length === 1 && dragClasses[0] === "presentation", dragClasses.join(","));
    const status = ((await page.textContent('[data-testid="ss-backend-status"]')) ?? "").trim();
    check("(4) the status line reads 1 batch · 0 semantic · 0 applied", status === "1 batch · 0 semantic · 0 applied", status);
    await page.screenshot({ path: path.join(MEDIA_DIR, "06-drag-echo.png") });

    /* ================================================================
       (5) a rename → ONE node-renamed, echoed `semantic`
       ================================================================ */
    eventPosts.length = 0;
    eventEchoes.length = 0;
    await page.evaluate((id) => {
      window.editor.updateShape({ id, type: "ss-block", props: { name: "parse()" } });
    }, grab.id);
    await waitFor(() => (eventEchoes.length > 0 ? eventEchoes : null), { what: "an echo for the rename" });
    await page.waitForTimeout(600);
    const renameBatches = eventPosts.flatMap((post) => post.batches ?? []);
    check(
      "(5) a rename publishes one batch carrying one node-renamed event",
      renameBatches.length === 1 && renameBatches[0].events.length === 1 && renameBatches[0].events[0].type === "node-renamed",
      JSON.stringify(renameBatches.map((one) => one.events.map((event) => event.type))),
    );
    const renameClasses = eventEchoes.flatMap((echo) => (echo.classified ?? []).flatMap((one) => one.events.map((event) => event.class)));
    check("(5) the server classified it `semantic`", renameClasses.length === 1 && renameClasses[0] === "semantic", renameClasses.join(","));
    const renamedStatus = ((await page.textContent('[data-testid="ss-backend-status"]')) ?? "").trim();
    check("(5) the status line counts it", renamedStatus === "1 batch · 1 semantic · 0 applied", renamedStatus);
    await page.screenshot({ path: path.join(MEDIA_DIR, "07-rename-echo.png") });

    /* ================================================================
       (6) back to none — the consumer detaches, the surfaces go
       ================================================================ */
    await page.click('[data-testid="ss-backend-trigger"]');
    await page.waitForSelector('[data-testid="ss-backend-kind"]');
    await page.selectOption('[data-testid="ss-backend-kind"]', "none");
    await page.keyboard.press("Escape");
    await waitFor(async () => (await page.locator('[data-testid="ss-backend-menu"]').count()) === 0, { what: "the Python menu going away" });
    eventPosts.length = 0;
    await page.evaluate((id) => {
      window.editor.updateShape({ id, type: "ss-block", props: { name: "gone()" } });
    }, grab.id);
    await page.waitForTimeout(1200);
    check("(6) no batch reaches the server once the backend is none", eventPosts.length === 0, JSON.stringify(eventPosts).slice(0, 200));
    const after = await page.evaluate(() => {
      const mentions = [];
      for (const element of document.querySelectorAll("*")) {
        for (const attribute of element.attributes) {
          if (attribute.name.startsWith("data-") && /pyblocks/i.test(attribute.value)) mentions.push(attribute.value);
        }
      }
      return { mentions, text: /pyblocks/i.test(document.body.innerText ?? "") };
    });
    check("(6) every pyblocks element is gone from the DOM", after.mentions.length === 0 && after.text === false, JSON.stringify(after).slice(0, 200));
    await page.screenshot({ path: path.join(MEDIA_DIR, "08-back-to-none.png") });
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const stop of stops.reverse()) {
      try {
        stop();
      } catch {
        /* already gone */
      }
    }
  }

  console.log(`\n${checks.length - failures}/${checks.length} assertions passed · screenshots in ${MEDIA_DIR}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
