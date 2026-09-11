#!/usr/bin/env node
/**
 * T1 Lane V — verify-hosts.mjs (generalized)
 *
 * Was T0-only (one hard-coded story: `components-port--primary`). Now
 * sweeps EVERY component currently in the library — read straight off
 * Storybook's own `index.json`, not a maintained list, so a 9th component
 * is covered automatically once it has a Storybook `Primary` story and an
 * entry in `COMPONENT_CHECKS` below (the one bit of per-component
 * knowledge this file cannot infer: which DOM attribute is the "did it
 * actually repaint" fact, and which FieldSpec drives it).
 *
 * For each component, in each of the three hosts (dom / reactflow /
 * tldraw):
 *   1. Load the `Primary` story via the full manager UI
 *      (`/?path=/story/...&globals=host:...`), never `iframe.html`
 *      directly — driving `iframe.html` with a `state` baked into the URL
 *      only proves "args from a URL param render correctly," not "the
 *      Controls addon UI drives the real component" (the actual claim
 *      every `*.stories.tsx` docblock makes). This script flips the real
 *      `<select id="control-<fieldId>">` the Controls panel renders.
 *   2. Wait for the component's own marker `[data-slot]` element to
 *      actually paint, assert per-host chrome facts (a real `.react-flow`
 *      canvas, real `.tl-container`/`.tlui-toolbar`, and — this being the
 *      DEFAULT-JS play function running on load — that NO exception was
 *      thrown, i.e. `<Component>.stories.tsx`'s own play function passed
 *      in this host. Storybook's Interactions addon has no headless CLI
 *      here (no `test-storybook`/addon-vitest wired into this repo), so
 *      "the play function passed" is proven the same way Storybook proves
 *      it live in a browser: it renders without a thrown assertion. A
 *      failed `expect()` inside `play()` throws inside the SAME preview
 *      document this script already has `Runtime.enable`d, so it surfaces
 *      through the existing `consoleErrors`/`exceptionThrown` capture —
 *      no separate mechanism needed.
 *   3. Flip ONE real control — the field id in `COMPONENT_CHECKS`, always
 *      a `segments` field so the control is a `<select>` — and assert the
 *      component's own `data-*` attribute actually changed. A component
 *      that renders identically before/after is a FAIL, not a pass with a
 *      caveat.
 *   4. Screenshot before and after.
 *
 * THEN the cascade, the point of the whole T1 build (Pill is the one
 * component with a real, non-empty preset family — every other
 * `<NAME>_PRESETS` is deliberately `[]`, see each component's own
 * `*.presets.ts`/`*.fields.ts`):
 *   - `components-pill--presets` renders one Pill per `PILL_PRESETS`
 *     entry with ZERO stored override on any governed field (`presetArgs`
 *     only sets the selector, `state`) — assert the resolved paint
 *     (`getComputedStyle(...).borderColor`) actually differs between two
 *     presets, proving a preset alone moves resolved paint.
 *   - That same story's `parameters.controls.exclude` drops every
 *     governed field's control from the panel — assert
 *     `#control-lineColor` (etc.) are ABSENT while an ungoverned control
 *     (`#control-lineThickness`) stays present, i.e. "excluded from
 *     Controls" rather than a control that would silently fight the
 *     preset.
 *
 * CDP plumbing (spawn headless Chrome, raw `Target`/`Page`/`Runtime`
 * domains, no puppeteer) is the technique proven in the original T0
 * spike and the T0 version of this file.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const STORYBOOK_DIR = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.SB_VERIFY_PORT ?? 5430);
const SCREENSHOT_DIR = process.env.SB_VERIFY_SCREENSHOT_DIR ?? path.join(tmpdir(), "bbox-verify-hosts");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const HOSTS = [
  { name: "dom", expectHostAttr: "dom" },
  { name: "reactflow", expectHostAttr: "reactflow" },
  { name: "tldraw", expectHostAttr: "tldraw" },
];

/**
 * The one table of per-component knowledge this file cannot infer from
 * Storybook's own index: which marker slot is "the component painted,"
 * which `data-*` attribute proves it, and which `FieldSpec` id (always a
 * `segments` field, i.e. a `<select>` control) is guaranteed to move that
 * attribute. Every value here is read straight off each component's own
 * `.tsx` (the `data-*` attribute names) and `.fields.ts` (which field
 * exists) — see the handoff for the exact grep lines.
 */
const COMPONENT_CHECKS = {
  Port: { slot: "port-dot", attr: "data-state", fieldId: "state" },
  Pill: { slot: "pill", attr: "data-state", fieldId: "state" },
  Glyph: { slot: "glyph", attr: "data-size", fieldId: "size" },
  TextBox: { slot: "text-box", attr: "data-size", fieldId: "size" },
  RowContainer: { slot: "row-container", attr: "data-justify", fieldId: "justify" },
  Stack: { slot: "stack", attr: "data-member-width", fieldId: "memberWidth" },
  PortEdge: { slot: "port-edge", attr: "data-edge", fieldId: "edge" },
  Block: { slot: "block-chip", attr: "data-state", fieldId: "state" },
};

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

function readPreviewExpr(slot, attr) {
  return `(() => {
    const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
    if (!doc) return null;
    const el = doc.querySelector('[data-slot="${slot}"]');
    if (!el) return null;
    return {
      value: el.getAttribute(${JSON.stringify(attr)}),
      hostAttr: doc.querySelector('[data-host]')?.getAttribute('data-host') ?? null,
      reactFlowCanvas: doc.querySelectorAll('.react-flow').length,
      tlContainer: doc.querySelectorAll('.tl-container').length,
      tlToolbar: doc.querySelectorAll('.tlui-toolbar').length,
    };
  })()`;
}

/**
 * Flip the real `<select id="control-<fieldId>">` the Controls addon
 * renders (confirmed live: every `segments` FieldSpec becomes exactly
 * this element — `toArgTypes` maps `"segments"` to Storybook's `"select"`
 * control). Picks whichever `<option>` isn't the CURRENT value, so this
 * works regardless of what a story's own `args` override — no hard-coded
 * target value to go stale the next time a component's default changes.
 */
function flipSelectExpr(fieldId) {
  return `(() => {
    const sel = document.querySelector('#control-${fieldId}');
    if (!sel) return { ok: false, reason: 'no #control-${fieldId} select found in the Controls panel' };
    const current = sel.value;
    // Storybook's "select" control always prepends a placeholder option
    // ("Choose option...", value === its own text) ahead of the real
    // FieldOption values — it is not a legal field value and must never
    // be picked as the flip target (it would "successfully" select it
    // and then correctly observe the component never adopts a value
    // that was never real).
    const options = Array.from(sel.options).map((o) => o.value).filter((v) => v !== "Choose option...");
    const next = options.find((v) => v !== current);
    if (next === undefined) return { ok: false, reason: 'select has no alternate option to flip to' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, next);
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, from: current, to: next };
  })()`;
}

async function verifyComponentOnHost(componentName, storyId, check, host, { screenshotDir }) {
  const failures = [];
  const url = `http://127.0.0.1:${PORT}/?path=/story/${storyId}&globals=host:${host.name}&viewMode=story`;
  const client = await launchChrome();
  const shotPrefix = `${componentName}-${host.name}`;
  try {
    await client.send("Page.navigate", { url });

    const ready = await waitFor(async () => (await client.evaluate(readPreviewExpr(check.slot, check.attr))) ?? false);
    if (!ready || ready.value == null) {
      failures.push(
        `${componentName}/${host.name}: [data-slot="${check.slot}"] never painted with ${check.attr} set (timed out)`,
      );
      await client.screenshot(path.join(screenshotDir, `${shotPrefix}-TIMEOUT.png`));
      return { component: componentName, host: host.name, failures, before: null, after: null };
    }

    // Settle beat: fonts, canvas paint, tldraw's own layout pass.
    await new Promise((r) => setTimeout(r, 1200));
    const before = await client.evaluate(readPreviewExpr(check.slot, check.attr));

    if (before.hostAttr !== host.expectHostAttr) {
      failures.push(`${componentName}/${host.name}: expected data-host="${host.expectHostAttr}", got "${before.hostAttr}"`);
    }
    if (host.name === "reactflow" && before.reactFlowCanvas < 1) {
      failures.push(`${componentName}/${host.name}: no .react-flow canvas mounted — blank stub`);
    }
    if (host.name === "tldraw" && (before.tlContainer < 1 || before.tlToolbar < 1)) {
      failures.push(
        `${componentName}/${host.name}: missing real tldraw chrome (.tl-container=${before.tlContainer}, .tlui-toolbar=${before.tlToolbar}) — blank stub`,
      );
    }
    if (host.name === "dom" && (before.reactFlowCanvas > 0 || before.tlContainer > 0)) {
      failures.push(`${componentName}/${host.name}: unexpected react-flow/tldraw chrome present in the plain DOM host`);
    }

    await client.screenshot(path.join(screenshotDir, `${shotPrefix}-before.png`));

    // --- the actual claim under test: Controls addon drives the real
    // component. Flip the real <select id="control-<fieldId>">.
    const flip = await client.evaluate(flipSelectExpr(check.fieldId));
    let after = null;
    if (!flip.ok) {
      failures.push(`${componentName}/${host.name}: could not flip the "${check.fieldId}" control — ${flip.reason}`);
    } else {
      after = await waitFor(async () => {
        const reading = await client.evaluate(readPreviewExpr(check.slot, check.attr));
        return reading && reading.value === flip.to ? reading : null;
      });
      await client.screenshot(path.join(screenshotDir, `${shotPrefix}-after.png`));
      if (!after) {
        const stuck = await client.evaluate(readPreviewExpr(check.slot, check.attr));
        failures.push(
          `${componentName}/${host.name}: Control "${check.fieldId}" switched "${flip.from}" -> "${flip.to}" but ` +
            `[data-slot="${check.slot}"][${check.attr}] never followed (still "${stuck?.value}") — renders ` +
            `IDENTICALLY before/after, Controls is NOT driving the real component`,
        );
      } else if (before.value === after.value) {
        failures.push(`${componentName}/${host.name}: rendered ${check.attr} did not change ("${before.value}")`);
      }
    }
    return { component: componentName, host: host.name, failures, before, after };
  } finally {
    // Any exception thrown by the story's OWN play() function (run
    // automatically on load, per Storybook's Interactions addon) lands
    // here — this is the headless "did the play function pass" proof,
    // see the file docblock.
    if (client.consoleErrors.length > 0) {
      failures.push(
        `${componentName}/${host.name}: console/play-function errors: ${client.consoleErrors.join(" | ")}`,
      );
    }
    await client.close();
  }
}

/**
 * The cascade proof (T1's whole point): `components-pill--presets`.
 * `Pill` is the only component with a real, non-empty preset family
 * (`PILL_PRESETS`) — every other `<NAME>_PRESETS` is `[]` by design (see
 * each component's own `*.presets.ts`), so this is the one place in the
 * library where "a preset alone moves resolved paint, and a governed
 * field's control disappears from Storybook rather than fighting it" is
 * even a claim to test.
 */
async function verifyCascadePresetsStory({ screenshotDir }) {
  const failures = [];
  const storyId = "components-pill--presets";
  const url = `http://127.0.0.1:${PORT}/?path=/story/${storyId}&globals=host:dom&viewMode=story`;
  const client = await launchChrome();
  try {
    await client.send("Page.navigate", { url });

    const ready = await waitFor(async () =>
      (await client.evaluate(`(() => {
        const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
        return doc ? doc.querySelectorAll('[data-slot="pill"]').length : 0;
      })()`)) || 0,
    );
    if (!ready) {
      failures.push("presets story: no [data-slot=\"pill\"] ever painted");
      return { failures };
    }
    await new Promise((r) => setTimeout(r, 800));

    // --- 1. a preset alone moves resolved paint, with ZERO override
    // stored on any governed field (presetArgs only ever sets `state`).
    const paints = await client.evaluate(`(() => {
      const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
      return Array.from(doc.querySelectorAll('[data-slot="pill"]')).map((el) => ({
        state: el.getAttribute('data-state'),
        lineStyle: el.getAttribute('data-line-style'),
        fillStyle: el.getAttribute('data-fill-style'),
        borderColor: getComputedStyle(el).borderColor,
        backgroundColor: getComputedStyle(el).backgroundColor,
      }));
    })()`);
    await client.screenshot(path.join(screenshotDir, "pill-presets-gallery.png"));

    if (paints.length < 2) {
      failures.push(`presets story: expected >=2 rendered pills (one per preset), got ${paints.length}`);
    } else {
      const distinctBorders = new Set(paints.map((p) => p.borderColor));
      const distinctFills = new Set(paints.map((p) => p.backgroundColor));
      if (distinctBorders.size < 2 && distinctFills.size < 2) {
        failures.push(
          `presets story: every preset resolved to the SAME paint (borders=${JSON.stringify([...distinctBorders])}, ` +
            `fills=${JSON.stringify([...distinctFills])}) — presets are not actually changing resolved paint`,
        );
      }
    }

    // --- 2. governed fields are EXCLUDED from this story's Controls,
    // never left present to silently fight the preset; an ungoverned
    // field (lineThickness) stays a live, present control.
    const controls = await client.evaluate(`(() => {
      const ids = ["lineStyle", "lineColor", "fillStyle", "fillColor", "lineThickness"];
      return Object.fromEntries(ids.map((id) => [id, !!document.querySelector('#control-' + id)]));
    })()`);
    for (const governedId of ["lineStyle", "lineColor", "fillStyle", "fillColor"]) {
      if (controls[governedId]) {
        failures.push(
          `presets story: governed field "${governedId}" still has a live #control-${governedId} — should be ` +
            `excluded from Controls (parameters.controls.exclude), not left to fight the preset`,
        );
      }
    }
    if (!controls.lineThickness) {
      failures.push(
        `presets story: ungoverned field "lineThickness" has NO control — over-broad exclusion, or Controls panel ` +
          `is empty/broken rather than selectively scoped`,
      );
    }

    // --- 2b. An UNGOVERNED control must move every row of the gallery.
    // Reverting this story to build each row from defaults instead of `args`
    // left seven live controls moving nothing, and every other assertion here
    // still passed — the summary line asserted "Controls drove every one of
    // them live" while it was false. Driving one ungoverned control and
    // comparing the painted rows is what makes that claim mean something.
    const borderWidths = async () =>
      JSON.parse(
        await client.evaluate(`(() => {
          const doc = document.querySelector('#storybook-preview-iframe').contentDocument;
          return JSON.stringify(
            Array.from(doc.querySelectorAll('[data-slot="pill"]')).map(
              (el) => doc.defaultView.getComputedStyle(el).borderWidth,
            ),
          );
        })()`),
      );
    const widthsBefore = await borderWidths();
    await client.send("Page.navigate", {
      url: `http://127.0.0.1:${PORT}/?path=/story/${storyId}&globals=host:dom&viewMode=story&args=lineThickness:thick`,
    });
    await waitFor(async () =>
      (await client.evaluate(`(() => {
        const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
        return doc ? doc.querySelectorAll('[data-slot="pill"]').length : 0;
      })()`)) || 0,
    );
    const widthsAfter = await borderWidths();
    const movedRows = widthsAfter.filter((w, i) => w !== widthsBefore[i]).length;
    // The `hidden` preset paints no border at all, so it legitimately cannot
    // move; every other row must.
    if (movedRows < widthsBefore.length - 1) {
      failures.push(
        `presets story: an UNGOVERNED control (lineThickness) moved only ${movedRows} of ` +
          `${widthsBefore.length} rows (${JSON.stringify(widthsBefore)} -> ${JSON.stringify(widthsAfter)}). ` +
          `A gallery must take everything but its swept axis from args; rows built from defaults ` +
          `leave every other control live and inert.`,
      );
    }

    // --- 3. THE CHECK THAT WOULD HAVE CAUGHT THE SHIPPED DEFECT.
    // Everything above passes even when the cascade is dead, because it only
    // compares presets against each other. Until this was added, the story
    // spread each preset's values in as explicit args, so the rows differed
    // by OVERRIDE and deleting every preset left the paint byte-identical.
    // What actually has to be true is that changing ONLY the selector on the
    // plain story repaints it — the user-visible promise ("set State to Wired
    // in Controls and the pill turns orange"), which was false on the
    // published site while every other assertion here stayed green.
    const paintFor = async (stateId) => {
      await client.send("Page.navigate", {
        url: `http://127.0.0.1:${PORT}/?path=/story/components-pill--primary&globals=host:dom&viewMode=story&args=state:${stateId}`,
      });
      const painted = await waitFor(async () =>
        (await client.evaluate(`(() => {
          const doc = document.querySelector('#storybook-preview-iframe')?.contentDocument;
          const el = doc?.querySelector('[data-slot="pill"]');
          return el && el.getAttribute("data-state") === ${JSON.stringify(stateId)} ? 1 : 0;
        })()`)) || 0,
      );
      if (!painted) return null;
      return JSON.parse(
        await client.evaluate(`(() => {
          const doc = document.querySelector('#storybook-preview-iframe').contentDocument;
          const el = doc.querySelector('[data-slot="pill"]');
          const cs = doc.defaultView.getComputedStyle(el);
          return JSON.stringify({
            state: el.getAttribute("data-state"),
            border: cs.borderColor,
            background: cs.backgroundColor,
          });
        })()`),
      );
    };
    const emptyPaint = await paintFor("empty");
    const wiredPaint = await paintFor("wired");
    if (!emptyPaint || !wiredPaint) {
      failures.push("cascade: the pill never painted for one of the two states under test");
    } else if (
      emptyPaint.border === wiredPaint.border &&
      emptyPaint.background === wiredPaint.background
    ) {
      failures.push(
        `cascade: changing ONLY the state selector did not repaint — empty and wired both render ` +
          `border=${wiredPaint.border} background=${wiredPaint.background}. The preset layer is being ` +
          `outranked by a stored override, so the middle layer of the cascade is dead.`,
      );
    }

    if (client.consoleErrors.length > 0) {
      failures.push(`presets story: console errors: ${client.consoleErrors.join(" | ")}`);
    }
    return { failures, paints, controls };
  } finally {
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

/** Every `Primary` story Storybook itself knows about, read from its own
 * `index.json` rather than hand-copied — a 9th component's `Primary`
 * story is picked up automatically the moment it exists, with no edit
 * here beyond adding its row to `COMPONENT_CHECKS` above. */
async function discoverPrimaryStories() {
  const res = await fetch(`http://127.0.0.1:${PORT}/index.json`);
  const index = await res.json();
  const entries = Object.values(index.entries ?? index.stories ?? {});
  return entries
    .filter((e) => e.type === "story" && e.name === "Primary" && e.title?.startsWith("Components/"))
    .map((e) => ({ component: e.title.replace(/^Components\//, ""), storyId: e.id }));
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
  let cascade = null;
  try {
    const up = await waitForHttp(`http://127.0.0.1:${PORT}/`, 60000);
    if (!up) {
      console.error("[verify-hosts] Storybook never came up:\n" + serverLog);
      process.exitCode = 1;
      return;
    }
    console.log(`[verify-hosts] Storybook is up. Screenshots -> ${SCREENSHOT_DIR}`);

    const primaries = await discoverPrimaryStories();
    console.log(`[verify-hosts] discovered ${primaries.length} Primary stories: ${primaries.map((p) => p.component).join(", ")}`);

    const missingChecks = primaries.filter((p) => !COMPONENT_CHECKS[p.component]);
    for (const m of missingChecks) {
      console.error(
        `[verify-hosts] FAIL: "${m.component}" has a Primary story but no COMPONENT_CHECKS entry — add one ` +
          `(slot/attr/fieldId) before this script can verify it.`,
      );
    }

    for (const { component, storyId } of primaries) {
      const check = COMPONENT_CHECKS[component];
      if (!check) continue;
      for (const host of HOSTS) {
        console.log(`[verify-hosts] === ${component} / ${host.name} ===`);
        const result = await verifyComponentOnHost(component, storyId, check, host, {
          screenshotDir: SCREENSHOT_DIR,
        });
        results.push(result);
        if (result.failures.length === 0) {
          console.log(`[verify-hosts] PASS ${component}/${host.name} (${check.attr}: "${result.before?.value}" -> "${result.after?.value}")`);
        } else {
          console.error(`[verify-hosts] FAIL ${component}/${host.name}:\n  - ${result.failures.join("\n  - ")}`);
        }
      }
    }

    console.log("[verify-hosts] === cascade: components-pill--presets ===");
    cascade = await verifyCascadePresetsStory({ screenshotDir: SCREENSHOT_DIR });
    if (cascade.failures.length === 0) {
      console.log("[verify-hosts] PASS cascade/presets-story");
    } else {
      console.error(`[verify-hosts] FAIL cascade/presets-story:\n  - ${cascade.failures.join("\n  - ")}`);
    }

    const allFailures = [
      ...results.flatMap((r) => r.failures),
      ...missingChecks.map((m) => `"${m.component}": no COMPONENT_CHECKS entry`),
      ...cascade.failures,
    ];
    console.log(JSON.stringify({ results, cascade, allFailures }, null, 2));
    if (allFailures.length > 0) {
      console.error(`\n[verify-hosts] FAIL: ${allFailures.length} failure(s).`);
      process.exitCode = 1;
    } else {
      console.log(
        `\n[verify-hosts] PASS: all ${primaries.length} components painted for real in all ${HOSTS.length} hosts, ` +
          `Controls drove every one of them live, and the Pill preset cascade resolves paint with excluded controls.`,
      );
    }
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 5000);
    });
    console.log("[verify-hosts] Storybook server stopped.");
  }
}

await main();
