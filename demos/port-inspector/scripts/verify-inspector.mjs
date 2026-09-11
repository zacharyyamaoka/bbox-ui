#!/usr/bin/env node
/**
 * T0 Lane V — verify-inspector.mjs
 *
 * Definition of done, §13 (docs/T0-SPEC.md): two subjects with differing
 * `state` selected together render the state row as `Mixed`
 * (`data-mixed="true"`); editing that row writes the new value to BOTH
 * selected subjects' dots; a single selection never shows `Mixed` on any
 * field. Together with verify-hosts.mjs's §11, this is the "Storybook
 * Controls and the demo inspector do the identical thing to the port's
 * state prop, in all three hosts" proof — this script is the multi-subject
 * half Controls structurally cannot represent (§6 of the spec).
 *
 * CDP plumbing is the same technique proven in .spike/drive-story.mjs: spawn
 * headless Chrome, drive it over raw `Target`/`Page`/`Runtime` domains, no
 * puppeteer.
 *
 * Journey (App.tsx's INITIAL data: port "a" starts state=empty, port "b"
 * starts state=wired — they already disagree, which is what makes the
 * default render a live "select both, differing values" case):
 *   1. Load with both ports selected (the app's initial state) and assert
 *      the panel already reads "state" as Mixed — this is the natural
 *      "select BOTH ports with differing values" case, not staged.
 *   2. Deselect port b, leaving ONE port selected. Assert no field row
 *      reads Mixed with a single subject (spec's explicit invariant).
 *      Click "Default Value" in the State row — a value neither port
 *      currently holds — and assert port a's rendered dot actually
 *      re-rendered to data-state="default", while port b (untouched) did
 *      not change. This is the "select one port, change a field through
 *      the panel, assert the port re-rendered" proof.
 *   3. Re-select port b. Because step 2 deliberately picked a value port b
 *      doesn't share, the two ports still disagree (a=default, b=wired) —
 *      assert the panel is back to Mixed on "state".
 *   4. With the mixed selection active, click "Data Recived" (state=
 *      "received") in the same row and assert BOTH ports' dots take it —
 *      the "write a value across the mixed selection" proof.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const APP_DIR = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.INSPECTOR_VERIFY_PORT ?? 5433);
const SCREENSHOT_DIR =
  process.env.INSPECTOR_VERIFY_SCREENSHOT_DIR ?? path.join(tmpdir(), "bbox-verify-inspector");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// State options in PORT_FIELDS/PORT_STATES order (layout.ts): empty, default,
// wired, received. The panel renders one segmented button per option, in
// this order, inside the "state" field row — indexing by position sidesteps
// the board's deliberate "Data Recived" typo as a brittle text match.
const STATE_BUTTON_INDEX = { empty: 0, default: 1, wired: 2, received: 3 };

// ---- tiny CDP client (same technique as .spike/drive-story.mjs) ----------

async function launchChrome() {
  const profile = mkdtempSync(path.join(tmpdir(), "bbox-verify-insp-chrome-"));
  const chrome = spawn(
    "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--window-size=1000,700",
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

async function waitFor(fn, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

// Read facts straight from the top document (this demo has no iframe — it
// is a plain Vite/React page, unlike the Storybook manager+preview split).
const READ_SCENE = `(() => {
  function dotEl(id) {
    const wrap = document.querySelector('[data-slot="port-instance"][data-port-id="' + id + '"]');
    return wrap?.querySelector('[data-slot="port-dot"]') ?? null;
  }
  function portDot(id) {
    return dotEl(id)?.getAttribute('data-state') ?? null;
  }
  // Real DOM fact, not just the attribute: does the dot actually paint a
  // visible ring? A "port-dot" node can exist with the right data-state
  // and still be invisible if the host app never generated the Tailwind
  // utility classes Port relies on (border-2/rounded-full/border-foreground)
  // — exactly the class of bug a data-state-only assertion would miss.
  function dotVisible(id) {
    const el = dotEl(id);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const borderWidth = parseFloat(cs.borderTopWidth) || 0;
    const rect = el.getBoundingClientRect();
    return {
      borderWidth,
      borderColor: cs.borderColor,
      backgroundColor: cs.backgroundColor,
      rectW: rect.width,
      rectH: rect.height,
    };
  }
  function checkbox(id) {
    return document.querySelector('[data-slot="port-instance"][data-port-id="' + id + '"] input[type="checkbox"]');
  }
  const stateRow = document.querySelector('[data-slot="port-inspector-row"][data-field="state"]');
  const header = document.querySelector('[data-slot="port-inspector-header"]')?.textContent ?? null;
  return {
    portA: portDot('a'),
    portB: portDot('b'),
    portAVisible: dotVisible('a'),
    portBVisible: dotVisible('b'),
    checkedA: !!checkbox('a')?.checked,
    checkedB: !!checkbox('b')?.checked,
    header,
    stateMixed: stateRow?.getAttribute('data-mixed') ?? null,
    stateButtons: stateRow
      ? Array.from(stateRow.querySelectorAll('button')).map((b) => ({
          text: b.textContent,
          selected: b.getAttribute('data-selected') === 'true',
        }))
      : null,
    anyRowMixedTrue: Array.from(document.querySelectorAll('[data-slot="port-inspector-row"]')).some(
      (row) => row.getAttribute('data-mixed') === 'true',
    ),
  };
})()`;

function clickCheckbox(portId) {
  return `(() => {
    const cb = document.querySelector('[data-slot="port-instance"][data-port-id="${portId}"] input[type="checkbox"]');
    if (!cb) return { ok: false, reason: 'checkbox not found for ${portId}' };
    cb.click();
    return { ok: true };
  })()`;
}

function clickStateButton(index) {
  return `(() => {
    const row = document.querySelector('[data-slot="port-inspector-row"][data-field="state"]');
    const btn = row?.querySelectorAll('button')[${index}];
    if (!btn) return { ok: false, reason: 'state button[${index}] not found' };
    btn.click();
    return { ok: true, label: btn.textContent };
  })()`;
}

async function main() {
  const failures = [];
  console.log(`[verify-inspector] starting demo-port-inspector on :${PORT} (${APP_DIR})`);
  const viteBin = path.join(APP_DIR, "node_modules", ".bin", "vite");
  const server = spawn(viteBin, ["--port", String(PORT), "--strictPort"], {
    cwd: APP_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  let client;
  try {
    const up = await (async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${PORT}/`);
          if (res.ok) return true;
        } catch {
          // not up yet
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return false;
    })();
    if (!up) {
      console.error("[verify-inspector] demo-port-inspector never came up:\n" + serverLog);
      process.exitCode = 1;
      return;
    }
    console.log(`[verify-inspector] demo is up. Screenshots -> ${SCREENSHOT_DIR}`);

    client = await launchChrome();
    await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });

    const scene0 = await waitFor(async () => {
      const scene = await client.evaluate(READ_SCENE);
      return scene.portA && scene.portB ? scene : null;
    });
    if (!scene0) {
      failures.push("initial render: port dots never painted");
    } else {
      await client.screenshot(path.join(SCREENSHOT_DIR, "01-initial-both-selected.png"));

      // Visible-dot check FIRST, before any behavioural assertions: a
      // [data-slot="port-dot"] with the right data-state is not "the port
      // rendered" if it paints with 0px border on a transparent
      // background — a real-looking DOM fact that is actually a blank
      // stub. See the handoff for the root cause (a missing Tailwind
      // `@source` scan path — this demo's own port dots never receive a
      // visible border or fill).
      for (const [id, visible] of [
        ["a", scene0.portAVisible],
        ["b", scene0.portBVisible],
      ]) {
        if (!visible || visible.borderWidth < 1) {
          failures.push(
            `port ${id}'s dot has [data-slot="port-dot" data-state] in the DOM but renders with borderWidth=` +
              `${visible?.borderWidth}px, background=${visible?.backgroundColor} — it is VISUALLY INVISIBLE, ` +
              `not a real painted dot (see handoff: Tailwind never generated Port's utility classes here)`,
          );
        }
      }

      // --- Step 1: both selected by default, state genuinely differs
      // (a=empty, b=wired per App.tsx's INITIAL). This IS the "select BOTH
      // ports with differing values" case — assert the panel shows Mixed.
      if (scene0.portA !== "empty" || scene0.portB !== "wired") {
        failures.push(
          `initial fixture assumption broken: expected portA=empty portB=wired, got portA=${scene0.portA} portB=${scene0.portB}`,
        );
      }
      if (scene0.header !== "2 ports selected") {
        failures.push(`expected header "2 ports selected", got "${scene0.header}"`);
      }
      if (scene0.stateMixed !== "true") {
        failures.push(`expected the State row to read Mixed with 2 differing subjects, got data-mixed="${scene0.stateMixed}"`);
      }
      if (scene0.stateButtons?.some((b) => b.selected)) {
        failures.push(`expected no State button active while Mixed, but one is: ${JSON.stringify(scene0.stateButtons)}`);
      }

      // --- Step 2: deselect port b -> single selection. No row may read
      // Mixed with exactly one subject (spec's explicit invariant).
      const uncheck = await client.evaluate(clickCheckbox("b"));
      if (!uncheck.ok) failures.push(`step2: ${uncheck.reason}`);
      const scene1 = await waitFor(async () => {
        const scene = await client.evaluate(READ_SCENE);
        return scene.checkedB === false ? scene : null;
      });
      if (!scene1) {
        failures.push("step2: deselecting port b did not update the panel/header");
      } else {
        if (scene1.header !== "1 port selected") {
          failures.push(`step2: expected header "1 port selected", got "${scene1.header}"`);
        }
        if (scene1.anyRowMixedTrue) {
          failures.push("step2: a single-subject selection shows Mixed on some field — violates the spec invariant");
        }
        await client.screenshot(path.join(SCREENSHOT_DIR, "02-single-selection.png"));

        // Click "Default Value" (index 1) in the State row — a value
        // neither port currently holds — and assert port a's DOT actually
        // re-rendered, while untouched port b did not move.
        const click1 = await client.evaluate(clickStateButton(STATE_BUTTON_INDEX.default));
        if (!click1.ok) failures.push(`step2: ${click1.reason}`);
        const scene2 = await waitFor(async () => {
          const scene = await client.evaluate(READ_SCENE);
          return scene.portA === "default" ? scene : null;
        });
        if (!scene2) {
          const stuck = await client.evaluate(READ_SCENE);
          failures.push(
            `step2: clicking "Default Value" in the panel did not repaint port a's dot (still data-state="${stuck.portA}") — the panel is NOT driving the real component`,
          );
        } else {
          if (scene2.portB !== "wired") {
            failures.push(`step2: editing the single selected port a mutated the UNselected port b (now "${scene2.portB}")`);
          }
          await client.screenshot(path.join(SCREENSHOT_DIR, "03-after-single-edit.png"));
        }
      }

      // --- Step 3: re-select port b. a=default, b=wired still disagree,
      // so this must land back on Mixed for "state" — proving Mixed is
      // read live off the actual subjects, not cached from step 1.
      const recheck = await client.evaluate(clickCheckbox("b"));
      if (!recheck.ok) failures.push(`step3: ${recheck.reason}`);
      const scene3 = await waitFor(async () => {
        const scene = await client.evaluate(READ_SCENE);
        return scene.checkedB === true ? scene : null;
      });
      if (!scene3) {
        failures.push("step3: re-selecting port b did not update the panel/header");
      } else {
        if (scene3.header !== "2 ports selected") {
          failures.push(`step3: expected header "2 ports selected", got "${scene3.header}"`);
        }
        if (scene3.stateMixed !== "true") {
          failures.push(
            `step3: expected State row Mixed again (portA=default, portB=wired still disagree), got data-mixed="${scene3.stateMixed}"`,
          );
        }
        await client.screenshot(path.join(SCREENSHOT_DIR, "04-reselected-mixed-again.png"));

        // --- Step 4: with the mixed selection active, click "Data Recived"
        // (received) and assert it lands on BOTH selected subjects.
        const click2 = await client.evaluate(clickStateButton(STATE_BUTTON_INDEX.received));
        if (!click2.ok) failures.push(`step4: ${click2.reason}`);
        const scene4 = await waitFor(async () => {
          const scene = await client.evaluate(READ_SCENE);
          return scene.portA === "received" && scene.portB === "received" ? scene : null;
        });
        if (!scene4) {
          const stuck = await client.evaluate(READ_SCENE);
          failures.push(
            `step4: writing "received" across the mixed selection did not reach both ports ` +
              `(portA="${stuck.portA}", portB="${stuck.portB}") — expected both "received"`,
          );
        } else {
          if (scene4.stateMixed !== "false") {
            failures.push(`step4: after writing a shared value the State row should stop reading Mixed, got data-mixed="${scene4.stateMixed}"`);
          }
          await client.screenshot(path.join(SCREENSHOT_DIR, "05-after-mixed-write-both-took-it.png"));
        }
      }
    }

    if (client.consoleErrors.length > 0) {
      failures.push(`console errors: ${client.consoleErrors.join(" | ")}`);
    }
  } finally {
    if (client) await client.close();
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
    console.log("[verify-inspector] demo server stopped.");
  }

  if (failures.length > 0) {
    console.error(`\n[verify-inspector] FAIL: ${failures.length} failure(s):\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      "\n[verify-inspector] PASS: single-selection edits re-render the real Port, mixed values read Mixed, " +
        "and writing across a mixed selection lands on every selected subject.",
    );
  }
}

await main();
