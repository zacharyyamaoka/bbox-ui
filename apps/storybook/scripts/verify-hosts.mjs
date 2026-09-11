#!/usr/bin/env node
/**
 * T0 Lane V — verify-hosts.mjs
 *
 * Definition of done, §11 (docs/T0-SPEC.md): for each of the three hosts
 * (dom / reactflow / tldraw) a `[data-slot="port-dot"]` actually paints with
 * `data-state` matching the story's `state` arg; changing that arg — via the
 * SAME Controls addon a human would click, not a URL reload — repaints the
 * same element without a navigation; tldraw shows real chrome
 * (`.tl-container`/`.tlui-toolbar`), reactflow shows a real `.react-flow`
 * canvas. Nothing here is a blank stub.
 *
 * CDP plumbing (spawn headless Chrome, raw `Target`/`Page`/`Runtime` domains,
 * no puppeteer) is copied from the proven .spike/drive-story.mjs. The one
 * addition: that spike drove `iframe.html` directly with a `state` baked
 * into the URL, which only proves "args drawn from a URL param render
 * correctly" — it does NOT prove "the Controls addon UI drives the real
 * component," which is the actual claim in the story's docblock (the exact
 * SAME PORT_FIELDS array drives Storybook's Controls addon and the product
 * inspector — see §6). So this script drives the full manager UI
 * (`/?path=/story/...`) and flips the real `<select id="control-state">`
 * the Controls panel renders, then reads the change back out of the nested
 * preview iframe. That is "measured, not assumed."
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const STORYBOOK_DIR = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.SB_VERIFY_PORT ?? 5430);
const STORY_ID = "t0-spike-port--primary";
const SCREENSHOT_DIR = process.env.SB_VERIFY_SCREENSHOT_DIR ?? path.join(tmpdir(), "bbox-verify-hosts");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const HOSTS = [
  { name: "dom", expectHostAttr: "dom" },
  { name: "reactflow", expectHostAttr: "reactflow" },
  { name: "tldraw", expectHostAttr: "tldraw" },
];

// ---- tiny CDP client (same technique as .spike/drive-story.mjs) ----------

async function launchChrome() {
  const profile = mkdtempSync(path.join(tmpdir(), "bbox-verify-chrome-"));
  const chrome = spawn(
    "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--window-size=1400,900",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("chrome did not start")), 15000);
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const browser = new WebSocket(wsUrl);
  await new Promise((resolve) => (browser.onopen = resolve));

  let nextId = 0;
  const pending = new Map();
  let sessionId = null;
  const consoleErrors = [];

  browser.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(
        message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text,
      );
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    }
  };

  function send(method, params = {}, useSession = true) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (useSession && sessionId) payload.sessionId = sessionId;
      browser.send(JSON.stringify(payload));
    });
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  ({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));
  await send("Runtime.enable");
  await send("Page.enable");

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? JSON.stringify(exceptionDetails));
    }
    return result.value;
  }

  async function screenshot(filePath) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(filePath, Buffer.from(data, "base64"));
  }

  async function close() {
    chrome.kill();
    await new Promise((resolve) => chrome.once("exit", resolve));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // best effort
    }
  }

  return { send, evaluate, screenshot, close, consoleErrors };
}

async function waitFor(fn, { timeoutMs = 20000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

// Read facts out of the story's live preview iframe (nested inside the
// Storybook manager document; same-origin, so contentDocument reaches in).
const readPreview = `(() => {
  const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
  if (!doc) return null;
  const dot = doc.querySelector('[data-slot="port-dot"]');
  if (!dot) return null;
  return {
    dotState: dot.getAttribute('data-state'),
    labelText: doc.querySelector('[data-slot="port-label"]')?.textContent ?? null,
    hostAttr: doc.querySelector('[data-host]')?.getAttribute('data-host') ?? null,
    reactFlowCanvas: doc.querySelectorAll('.react-flow').length,
    tlContainer: doc.querySelectorAll('.tl-container').length,
    tlToolbar: doc.querySelectorAll('.tlui-toolbar').length,
  };
})()`;

async function verifyHost(host, { screenshotDir }) {
  const failures = [];
  const url = `http://127.0.0.1:${PORT}/?path=/story/${STORY_ID}&globals=host:${host.name}&viewMode=story`;
  const client = await launchChrome();
  try {
    await client.send("Page.navigate", { url });

    const ready = await waitFor(async () => (await client.evaluate(readPreview)) ?? false);
    if (!ready) {
      failures.push(`${host.name}: port-dot never painted (timed out waiting for [data-slot="port-dot"])`);
      await client.screenshot(path.join(screenshotDir, `${host.name}-TIMEOUT.png`));
      return { host: host.name, failures, before: null, after: null };
    }

    // Settle beat: fonts, canvas paint, tldraw's own layout pass (matches
    // the spike's own 1.5s settle).
    await new Promise((r) => setTimeout(r, 1200));
    const before = await client.evaluate(readPreview);

    // --- real DOM facts, before touching any control ---
    if (before.dotState !== "empty") {
      failures.push(`${host.name}: expected default dot state "empty", got "${before.dotState}"`);
    }
    if (before.labelText !== "Port") {
      failures.push(`${host.name}: expected default label text "Port", got "${before.labelText}"`);
    }
    if (before.hostAttr !== host.expectHostAttr) {
      failures.push(`${host.name}: expected data-host="${host.expectHostAttr}", got "${before.hostAttr}"`);
    }
    if (host.name === "reactflow" && before.reactFlowCanvas < 1) {
      failures.push(`${host.name}: no .react-flow canvas mounted — blank stub`);
    }
    if (host.name === "tldraw" && (before.tlContainer < 1 || before.tlToolbar < 1)) {
      failures.push(
        `${host.name}: missing real tldraw chrome (.tl-container=${before.tlContainer}, .tlui-toolbar=${before.tlToolbar}) — blank stub`,
      );
    }
    if (host.name === "dom" && (before.reactFlowCanvas > 0 || before.tlContainer > 0)) {
      failures.push(`${host.name}: unexpected react-flow/tldraw chrome present in the plain DOM host`);
    }

    await client.screenshot(path.join(screenshotDir, `${host.name}-before.png`));

    // --- the actual claim under test: Controls addon drives the real
    // component. Flip the real <select id="control-state"> the Controls
    // panel renders (see §2/§4 — its options come straight from
    // PORT_FIELDS), the same element a human clicks. A native React
    // <select> listens for a real "change" event bubbling from the DOM, so
    // the value setter + dispatchEvent pair below is a faithful simulation
    // of a user picking an option — not a call into Storybook's internals.
    const TARGET_STATE = "wired";
    const flip = await client.evaluate(`(() => {
      const sel = document.querySelector('#control-state');
      if (!sel) return { ok: false, reason: 'no #control-state select found in the Controls panel' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, ${JSON.stringify(TARGET_STATE)});
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, newVal: sel.value };
    })()`);
    if (!flip.ok) {
      failures.push(`${host.name}: could not find/operate the State control — ${flip.reason}`);
    } else {
      const after = await waitFor(async () => {
        const reading = await client.evaluate(readPreview);
        return reading && reading.dotState === TARGET_STATE ? reading : null;
      });
      await client.screenshot(path.join(screenshotDir, `${host.name}-after.png`));
      if (!after) {
        const stuck = await client.evaluate(readPreview);
        failures.push(
          `${host.name}: Control switched to "${TARGET_STATE}" but the rendered dot never followed ` +
            `(still data-state="${stuck?.dotState}") — Controls is NOT driving the real component`,
        );
      }
      return { host: host.name, failures, before, after: after ?? null };
    }
    return { host: host.name, failures, before, after: null };
  } finally {
    if (client.consoleErrors.length > 0) {
      failures.push(`${host.name}: console errors: ${client.consoleErrors.join(" | ")}`);
    }
    await client.close();
  }
}

// ---- Storybook server lifecycle ------------------------------------------

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log(`[verify-hosts] starting Storybook on :${PORT} (${STORYBOOK_DIR})`);
  const storybookBin = path.join(STORYBOOK_DIR, "node_modules", ".bin", "storybook");
  const server = spawn(storybookBin, ["dev", "-p", String(PORT), "--ci"], {
    cwd: STORYBOOK_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  const results = [];
  try {
    const up = await waitForHttp(`http://127.0.0.1:${PORT}/`, 60000);
    if (!up) {
      console.error("[verify-hosts] Storybook never came up:\n" + serverLog);
      process.exitCode = 1;
      return;
    }
    console.log(`[verify-hosts] Storybook is up. Screenshots -> ${SCREENSHOT_DIR}`);

    for (const host of HOSTS) {
      console.log(`[verify-hosts] === host: ${host.name} ===`);
      const result = await verifyHost(host, { screenshotDir: SCREENSHOT_DIR });
      results.push(result);
      if (result.failures.length === 0) {
        console.log(`[verify-hosts] PASS ${host.name} (empty -> wired: ${JSON.stringify(result.after?.dotState)})`);
      } else {
        console.error(`[verify-hosts] FAIL ${host.name}:\n  - ${result.failures.join("\n  - ")}`);
      }
    }
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
    console.log("[verify-hosts] Storybook server stopped.");
  }

  const allFailures = results.flatMap((r) => r.failures);
  console.log(JSON.stringify({ results, allFailures }, null, 2));
  if (allFailures.length > 0) {
    console.error(`\n[verify-hosts] FAIL: ${allFailures.length} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log(`\n[verify-hosts] PASS: all ${HOSTS.length} hosts painted the real dot and Controls drove it live.`);
  }
}

await main();
