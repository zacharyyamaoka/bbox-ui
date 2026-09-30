// apps/bbox-no-host/scripts/smoke.mjs — A0.4 of
// docs/WORK-ORDER-HOST-LESS-SHELL.md: the app mounts in a REAL headless
// Chromium with no console errors and the shell container present.
//
// WHY a real browser and not jsdom: `useSyncExternalStore`'s "The result of
// getSnapshot should be cached to avoid an infinite loop" is a React runtime
// warning, and the port's whole stability rule (HOST-PORT.md constraint 7)
// exists to prevent it. A DOM shim that never renders twice cannot surface it.
// This script fails on that warning specifically, not just on errors.
//
// It starts and stops its own dev server on its own port, so it can never
// collide with the port Zach has open.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = Number(process.env.NO_HOST_PORT ?? 4360);
const APP_URL = `http://127.0.0.1:${PORT}/`;

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const stop = () => {
  try {
    server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
};
process.on("exit", stop);

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
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

const problems = [];

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.locator('[data-slot="bbox-shell"]').waitFor({ timeout: 10_000 });

  // The shell mounted with a host, and reports it.
  const hasCanvas = await page.locator('[data-slot="bbox-shell"]').getAttribute("data-has-canvas");
  if (hasCanvas !== "true") problems.push(`data-has-canvas is ${hasCanvas}, expected "true"`);

  for (const slot of ["bbox-shell-canvas", "bbox-shell-windows"]) {
    if ((await page.locator(`[data-slot="${slot}"]`).count()) !== 1) problems.push(`missing [data-slot="${slot}"]`);
  }

  // The container is really the size of its box — a zero-height shell renders
  // nothing and still passes a presence check. Measured, not inferred.
  const box = await page.locator('[data-slot="bbox-shell"]').boundingBox();
  if (!box || box.width < 400 || box.height < 200) {
    problems.push(`shell container measured ${JSON.stringify(box)} — too small to be laid out`);
  }

  // Disconnecting the host is a real state, not an error.
  await page.getByText("host connected").locator("input").uncheck();
  await page.locator('[data-slot="bbox-shell"][data-has-canvas="false"]').waitFor({ timeout: 5_000 });
  await page.getByText("host connected").locator("input").check();

  // Toggling a capability re-creates the host; a re-render storm would show
  // up here as the getSnapshot warning above.
  await page.locator('[data-capability="history"]').uncheck();
  await page.locator('[data-capability="history"]').check();
  await sleep(400);

  await page.screenshot({ path: new URL("../../../docs/assets/no-host-shell.png", import.meta.url).pathname });
  await browser.close();
} catch (error) {
  problems.push(`threw: ${error.message}`);
} finally {
  stop();
}

if (problems.length > 0) {
  console.error(`A0.4 FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log("A0.4 OK — bbox-no-host mounts in headless Chromium with no console errors or warnings");
