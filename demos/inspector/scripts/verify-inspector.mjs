#!/usr/bin/env node
/**
 * T1 Lane V — verify-inspector.mjs (generalized, un-staled)
 *
 * This file used to be pinned to T0's Port-only panel and was left STALE
 * when Integration rebuilt `App.tsx` into a generic, 8-component
 * `ComponentInspector` (T1-SPEC.md §7) — the docblock this replaces says
 * so explicitly. This version drives that real, current DOM
 * (`[data-slot="component-picker"]`, `[data-slot="subject-row"]`,
 * `[data-slot="field-trace-row"]`, `[data-slot="preset-picker"]`, …), read
 * straight off `ComponentInspector.tsx`/`FieldTraceRow.tsx`, not assumed.
 *
 * Two passes:
 *
 * 1. GENERIC, over every component `App.tsx`'s own `REGISTRY` seeds
 *    (read from the live `<select data-slot="component-picker">`, not a
 *    hard-coded list — a 9th component is picked up automatically once
 *    it has an entry in `PREVIEW_CHECKS` below, the one bit of
 *    per-component knowledge this file cannot infer: which DOM attribute
 *    on which slot proves a re-render actually happened):
 *      - select it, assert its seeded instance rows painted
 *      - flip one real field control (a segmented button row inside a
 *        `field-trace-row`) and assert the SELECTED subject's own
 *        rendered preview attribute changed — a real re-render, not an
 *        internal state change nobody can see
 *      - where the seed data gives a component >=2 instances that
 *        genuinely disagree (`MULTI_INSTANCE` below — Port/Pill/Glyph,
 *        the only three `App.tsx` seeds with a second instance): prove
 *        Mixed shows with both selected, disappears with one, editing the
 *        lone selection never touches the deselected sibling, and
 *        writing across a re-formed Mixed selection lands on both.
 *      - the other five components have exactly ONE seeded instance in
 *        `App.tsx` today — Mixed structurally cannot be exercised for
 *        them without a "new instance" control this panel doesn't have.
 *        Reported as a real gap below, not silently skipped and not
 *        fixed (out of scope: never edit another lane's source).
 *
 * 2. THE CASCADE, on Pill (the one component with a real, non-empty
 *    preset family — every other `<NAME>_PRESETS` is `[]` by design):
 *      - picking a preset (clicking `[data-slot="preset-button"]`) moves
 *        the resolved paint (`getComputedStyle(...).borderColor` on the
 *        rendered `[data-slot="pill"]`) with NO override stored on the
 *        governed field (`lineColor`'s own `field-trace-row` still shows
 *        `winner: preset`, no clear-override button)
 *      - setting an override directly on that governed field's own
 *        control wins over the preset (`winner: override`) and moves the
 *        resolved paint again
 *      - the panel visibly names which layer supplied the value (the
 *        winner badge's own text — "override" vs "preset: <label>")
 *      - clearing that override (`[data-slot="field-trace-clear-override"]`)
 *        falls back to the preset's own value, not to the component
 *        default
 *
 * CDP plumbing (spawn headless Chrome, raw `Target`/`Page`/`Runtime`
 * domains, no puppeteer) is the technique proven in the T0 spike.
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

/**
 * Per-component: which slot+attribute on ONE seeded instance's rendered
 * preview proves a field-control edit actually reached the real
 * component. Same convention `apps/storybook/scripts/verify-hosts.mjs`
 * uses for the Storybook side — read off each component's own `.tsx`.
 */
const PREVIEW_CHECKS = {
  Port: { slot: "port", attr: "data-state", fieldId: "state" },
  Pill: { slot: "pill", attr: "data-state", fieldId: "state" },
  Glyph: { slot: "glyph", attr: "data-size", fieldId: "size" },
  TextBox: { slot: "text-box", attr: "data-size", fieldId: "size" },
  Flex: { slot: "flex", attr: "data-justify", fieldId: "justify" },
  Stack: { slot: "stack", attr: "data-member-width", fieldId: "memberWidth" },
  PortEdge: { slot: "port-edge", attr: "data-edge", fieldId: "edge" },
  Block: { slot: "block-chip", attr: "data-state", fieldId: "state" },
};

/** The only three components `App.tsx.seedInstances` gives a SECOND
 * instance that genuinely disagrees with the first — the field id they
 * disagree on, so the Mixed assertions know which row to watch. */
const MULTI_INSTANCE = {
  Port: { fieldId: "state" },
  Pill: { fieldId: "state" },
  Glyph: { fieldId: "size" },
};

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
      "--window-size=1100,800",
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

// ---------------------------------------------------------------------
// Generic page-reading helpers — all plain top-document DOM (this demo
// is a bare Vite/React page, no Storybook-style iframe split).
// ---------------------------------------------------------------------

/** Every seeded subject row for the CURRENTLY selected component, plus
 * this component's own `PREVIEW_CHECKS` attribute read off each one's
 * rendered preview. */
function readSubjectsExpr(slot, attr) {
  return `(() => {
    const rows = Array.from(document.querySelectorAll('[data-slot="subject-row"]'));
    return rows.map((row) => {
      const el = row.querySelector('[data-slot="${slot}"]');
      return {
        id: row.getAttribute('data-subject-id'),
        checked: !!row.querySelector('input[type="checkbox"]')?.checked,
        attrValue: el ? el.getAttribute(${JSON.stringify(attr)}) : null,
        found: !!el,
      };
    });
  })()`;
}

const READ_PANEL = `(() => {
  const header = document.querySelector('[data-slot="component-inspector-header"]')?.textContent ?? null;
  const rows = Array.from(document.querySelectorAll('[data-slot="field-trace-row"]')).map((row) => ({
    field: row.getAttribute('data-field'),
    governed: row.getAttribute('data-governed') === 'true',
    mixed: !!row.querySelector('[data-slot="field-trace-mixed"]'),
    winnerBadgeText: row.querySelector('[data-slot="field-trace-winner-badge"]')?.textContent ?? null,
    hasClearOverride: !!row.querySelector('[data-slot="field-trace-clear-override"]'),
    paintedElsewhere: row.querySelector('[data-slot="field-trace-painted-elsewhere"]')?.textContent ?? null,
    segmentOptions: Array.from(row.querySelectorAll('button[data-selected]')).map((b) => ({
      text: b.textContent,
      selected: b.getAttribute('data-selected') === 'true',
    })),
  }));
  const anyMixed = rows.some((r) => r.mixed);
  return { header, rows, anyMixed };
})()`;

function clickCheckbox(subjectId) {
  return `(() => {
    const cb = document.querySelector('[data-slot="subject-row"][data-subject-id="${subjectId}"] input[type="checkbox"]');
    if (!cb) return { ok: false, reason: 'checkbox not found for ${subjectId}' };
    cb.click();
    return { ok: true };
  })()`;
}

/** Click whichever segmented option button in `fieldId`'s own row is NOT
 * currently selected — generic, no target value hard-coded, matching
 * `apps/storybook/scripts/verify-hosts.mjs`'s "flip to whatever the
 * current value isn't" convention. */
function clickDifferentSegment(fieldId) {
  return `(() => {
    const row = document.querySelector('[data-slot="field-trace-row"][data-field="${fieldId}"]');
    if (!row) return { ok: false, reason: 'no field-trace-row for "${fieldId}"' };
    const buttons = Array.from(row.querySelectorAll('button[data-selected]'));
    if (buttons.length < 2) return { ok: false, reason: 'field "${fieldId}" has fewer than 2 segment options' };
    const target = buttons.find((b) => b.getAttribute('data-selected') !== 'true') ?? buttons[1];
    target.click();
    return { ok: true, label: target.textContent };
  })()`;
}

function clickPreset(selector, presetId) {
  return `(() => {
    const btn = document.querySelector('[data-slot="preset-picker"][data-selector="${selector}"] [data-slot="preset-button"][data-preset="${presetId}"]');
    if (!btn) return { ok: false, reason: 'no preset button "${presetId}" under selector "${selector}"' };
    btn.click();
    return { ok: true };
  })()`;
}

function clickDifferentPreset(selector, notPresetId) {
  return `(() => {
    const buttons = Array.from(document.querySelectorAll('[data-slot="preset-picker"][data-selector="${selector}"] [data-slot="preset-button"]'));
    const target = buttons.find((b) => b.getAttribute('data-preset') !== ${JSON.stringify(notPresetId)});
    if (!target) return { ok: false, reason: 'no alternate preset under selector "${selector}"' };
    target.click();
    return { ok: true, presetId: target.getAttribute('data-preset') };
  })()`;
}

function clickSegmentAtIndex(fieldId, index) {
  return `(() => {
    const row = document.querySelector('[data-slot="field-trace-row"][data-field="${fieldId}"]');
    const buttons = row ? Array.from(row.querySelectorAll('button[data-selected]')) : [];
    const target = buttons[${index}];
    if (!target) return { ok: false, reason: 'no button at index ${index} for "${fieldId}"', count: buttons.length };
    target.click();
    return { ok: true, label: target.textContent, count: buttons.length };
  })()`;
}

/**
 * `FieldControl`'s `data-selected` reflects the field's RAW value
 * (override, else `field.defaultValue` — see `readFields`), never the
 * cascade's RESOLVED value. On a governed field with an active preset and
 * no override, that raw default can differ from what is actually
 * painted, so "click whichever option isn't marked active" can land on
 * an option whose value coincidentally equals the already-resolved
 * paint — a real click that produces no visible change, which is not a
 * bug in the panel. This tries buttons in order until `isChanged()` is
 * true, so the assertion is "does SOME override move the paint" rather
 * than "does this one arbitrary option."
 */
async function clickSegmentUntilChanged(client, fieldId, isChanged) {
  const probe = await client.evaluate(clickSegmentAtIndex(fieldId, 0));
  const count = probe.count ?? 0;
  for (let i = 0; i < count; i++) {
    const click = await client.evaluate(clickSegmentAtIndex(fieldId, i));
    if (!click.ok) continue;
    const changed = await waitFor(async () => ((await isChanged()) ? true : null), { timeoutMs: 2000, intervalMs: 150 });
    if (changed) return { ok: true, label: click.label, triedIndex: i };
  }
  return { ok: false, reason: `tried all ${count} options for "${fieldId}", none changed the observed value` };
}

function clickClearOverride(fieldId) {
  return `(() => {
    const btn = document.querySelector('[data-slot="field-trace-row"][data-field="${fieldId}"] [data-slot="field-trace-clear-override"]');
    if (!btn) return { ok: false, reason: 'no clear-override button on "${fieldId}" — no override stored?' };
    btn.click();
    return { ok: true };
  })()`;
}

function readPillPaintExpr(subjectId) {
  return `(() => {
    const el = document.querySelector('[data-slot="subject-row"][data-subject-id="${subjectId}"] [data-slot="pill"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      state: el.getAttribute('data-state'),
      lineStyle: el.getAttribute('data-line-style'),
      fillStyle: el.getAttribute('data-fill-style'),
      borderColor: cs.borderColor,
      backgroundColor: cs.backgroundColor,
    };
  })()`;
}

function selectComponentExpr(name) {
  return `(() => {
    const sel = document.querySelector('[data-slot="component-picker"]');
    if (!sel) return { ok: false, reason: 'no [data-slot="component-picker"] select' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, ${JSON.stringify(name)});
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`;
}

// ---------------------------------------------------------------------
// Pass 1: generic per-component sweep
// ---------------------------------------------------------------------

async function verifyComponentGeneric(client, name, { screenshotDir }) {
  const failures = [];
  const notes = [];
  const check = PREVIEW_CHECKS[name];
  if (!check) {
    failures.push(`"${name}": no PREVIEW_CHECKS entry — add one before this script can verify it`);
    return { component: name, failures, notes };
  }

  const selRes = await client.evaluate(selectComponentExpr(name));
  if (!selRes.ok) {
    failures.push(`"${name}": ${selRes.reason}`);
    return { component: name, failures, notes };
  }

  const panel0 = await waitFor(async () => {
    const p = await client.evaluate(READ_PANEL);
    return p.header?.startsWith(name) ? p : null;
  });
  if (!panel0) {
    failures.push(`"${name}": inspector header never switched to this component`);
    return { component: name, failures, notes };
  }

  const subjects0 = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
  if (subjects0.length === 0) {
    failures.push(`"${name}": zero seeded instances rendered — App.tsx's seedInstances() returned nothing`);
    return { component: name, failures, notes };
  }
  for (const s of subjects0) {
    if (!s.found) failures.push(`"${name}": instance "${s.id}" has no [data-slot="${check.slot}"] in its preview`);
  }
  await client.screenshot(path.join(screenshotDir, `${name}-00-selected.png`));

  const multi = MULTI_INSTANCE[name];
  if (subjects0.length < 2) {
    notes.push(
      `only ${subjects0.length} seeded instance — multi-select/Mixed cannot be exercised for "${name}" without ` +
        `an "add instance" control this panel does not have (structural gap, not fixed here — see handoff)`,
    );
    if (panel0.anyMixed) {
      failures.push(`"${name}": a single-subject selection shows Mixed on some field — violates the spec invariant`);
    }
  }

  // --- change ONE real field control, assert the selected subject's own
  // rendered preview attribute actually changed (a real re-render).
  //
  // Forced to a SINGLE selection first: with >=2 subjects selected and
  // disagreeing on `check.fieldId`, `readFields` reports MIXED, so
  // FieldControl renders every segment button with `data-selected=false`
  // (its "active" flag needs a real, agreed value) — "click whichever
  // button isn't marked active" then has no way to avoid a button whose
  // OWN value happens to equal one of the two subjects' current value,
  // which reads as "nothing changed" for that subject even though the
  // panel really did apply the click. Single-selection removes that
  // ambiguity; the Mixed-specific behaviour gets its own dedicated
  // assertions below instead of being folded into this one.
  const targetId = subjects0[0].id;
  for (const s of subjects0.slice(1)) {
    if (s.checked) await client.evaluate(clickCheckbox(s.id));
  }
  if (subjects0.length > 1) {
    await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      return rows.every((r) => r.id === targetId || !r.checked) ? true : null;
    });
  }

  const flip = await client.evaluate(clickDifferentSegment(check.fieldId));
  if (!flip.ok) {
    failures.push(`"${name}": ${flip.reason}`);
  } else {
    const before = subjects0.find((s) => s.id === targetId)?.attrValue;
    const after = await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      const row = rows.find((r) => r.id === targetId);
      return row && row.attrValue !== before ? row : null;
    });
    await client.screenshot(path.join(screenshotDir, `${name}-01-after-field-edit.png`));
    if (!after) {
      failures.push(
        `"${name}": clicking "${flip.label}" in the "${check.fieldId}" row did not change ${check.attr} on ` +
          `instance "${targetId}" (still "${before}") — the panel is NOT driving the real component`,
      );
    } else if (subjects0.length > 1) {
      // Editing the sole selected subject must never leak onto an
      // unchecked sibling.
      const untouched = subjects0.filter((s) => s.id !== targetId);
      const afterAll = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      for (const u of untouched) {
        const now = afterAll.find((r) => r.id === u.id)?.attrValue;
        if (now !== u.attrValue) {
          failures.push(`"${name}": editing selected instance also mutated UNselected "${u.id}" (${u.attrValue} -> ${now})`);
        }
      }
    }
  }

  // Restore the original selection (all seeded instances checked) so the
  // Mixed round-trip below starts from App.tsx's own default state.
  if (subjects0.length > 1) {
    for (const s of subjects0.slice(1)) {
      await client.evaluate(clickCheckbox(s.id));
    }
    await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      return rows.every((r) => r.checked) ? true : null;
    });
  }

  // --- the Mixed round-trip, only for the 3 components with a real
  // disagreeing second instance.
  if (multi && subjects0.length >= 2) {
    const [firstId, secondId] = subjects0.map((s) => s.id);
    const fieldRow0 = panel0.rows.find((r) => r.field === multi.fieldId);
    if (!fieldRow0) {
      failures.push(`"${name}": no field-trace-row for "${multi.fieldId}"`);
    } else if (!fieldRow0.mixed) {
      failures.push(
        `"${name}": expected "${multi.fieldId}" to read Mixed with both seeded instances selected and ` +
          `disagreeing, got mixed=false`,
      );
    }

    // Deselect the second -> single selection -> Mixed must vanish
    // everywhere (spec invariant), then editing the sole selection must
    // not touch the deselected sibling (checked above already handles
    // this once re-run below with a single selection).
    const uncheck = await client.evaluate(clickCheckbox(secondId));
    if (!uncheck.ok) failures.push(`"${name}": ${uncheck.reason}`);
    const panel1 = await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      const row = rows.find((r) => r.id === secondId);
      return row && !row.checked ? await client.evaluate(READ_PANEL) : null;
    });
    if (!panel1) {
      failures.push(`"${name}": deselecting "${secondId}" did not update the panel`);
    } else if (panel1.anyMixed) {
      failures.push(`"${name}": a single-subject selection still shows Mixed somewhere after deselecting`);
    }
    await client.screenshot(path.join(screenshotDir, `${name}-02-single-selection.png`));

    // Re-select -> since we flipped the FIRST instance's field above (and
    // possibly again here), assert whatever the current disagreement is,
    // Mixed reads live off real subjects rather than a cached "yes" from
    // step 1 — recheck and confirm re-selecting brings some field back or
    // keeps it away consistent with actual values.
    const recheck = await client.evaluate(clickCheckbox(secondId));
    if (!recheck.ok) failures.push(`"${name}": ${recheck.reason}`);
    await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      return rows.find((r) => r.id === secondId)?.checked ? true : null;
    });

    // Force a real disagreement on multi.fieldId regardless of prior
    // steps' side effects: click a different segment while only the
    // FIRST is selected, confirm Mixed, then click a shared value while
    // BOTH are selected and confirm it converges and Mixed clears.
    await client.evaluate(clickCheckbox(secondId)); // -> first only
    await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
      return rows.find((r) => r.id === secondId)?.checked === false ? true : null;
    });
    const forceDiff = await client.evaluate(clickDifferentSegment(multi.fieldId));
    if (!forceDiff.ok) failures.push(`"${name}": ${forceDiff.reason}`);
    await client.evaluate(clickCheckbox(secondId)); // both selected again
    const mixedAgain = await waitFor(async () => {
      const p = await client.evaluate(READ_PANEL);
      return p.rows.find((r) => r.field === multi.fieldId)?.mixed ? p : null;
    });
    await client.screenshot(path.join(screenshotDir, `${name}-03-remixed.png`));
    if (!mixedAgain) {
      failures.push(`"${name}": expected "${multi.fieldId}" Mixed again after re-selecting a disagreeing sibling`);
    } else {
      // Write across the Mixed selection -> both subjects take it, Mixed clears.
      const writeAcross = await client.evaluate(clickDifferentSegment(multi.fieldId));
      if (!writeAcross.ok) {
        failures.push(`"${name}": ${writeAcross.reason}`);
      } else {
        const converged = await waitFor(async () => {
          const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
          const a = rows.find((r) => r.id === firstId)?.attrValue;
          const b = rows.find((r) => r.id === secondId)?.attrValue;
          return a != null && a === b ? { a, b } : null;
        });
        await client.screenshot(path.join(screenshotDir, `${name}-04-write-across-mixed.png`));
        if (!converged) {
          const rows = await client.evaluate(readSubjectsExpr(check.slot, check.attr));
          failures.push(
            `"${name}": writing "${writeAcross.label}" across the Mixed selection did not land on both ` +
              `(${JSON.stringify(rows.map((r) => [r.id, r.attrValue]))})`,
          );
        } else {
          const panelAfter = await client.evaluate(READ_PANEL);
          if (panelAfter.rows.find((r) => r.field === multi.fieldId)?.mixed) {
            failures.push(`"${name}": Mixed should clear once both selected subjects share a value`);
          }
        }
      }
    }
  }

  return { component: name, failures, notes };
}

// ---------------------------------------------------------------------
// Pass 2: the cascade proof, on Pill
// ---------------------------------------------------------------------

async function verifyCascadeOnPill(client, { screenshotDir }) {
  const failures = [];
  await client.evaluate(selectComponentExpr("Pill"));
  const panel0 = await waitFor(async () => {
    const p = await client.evaluate(READ_PANEL);
    return p.header?.startsWith("Pill") ? p : null;
  });
  if (!panel0) {
    failures.push("cascade/Pill: inspector never switched to Pill");
    return failures;
  }

  // Single-selection only: "which layer won" is a per-subject fact, and
  // the trace disclosure is only enabled for exactly one selected
  // subject (FieldTraceRow's own explicit scope).
  const subjects = await client.evaluate(readSubjectsExpr("pill", "data-state"));
  const [pillA, pillB] = subjects;
  if (pillB?.checked) {
    await client.evaluate(clickCheckbox(pillB.id));
    await waitFor(async () => {
      const rows = await client.evaluate(readSubjectsExpr("pill", "data-state"));
      return rows.find((r) => r.id === pillB.id)?.checked === false ? true : null;
    });
  }

  const lineColorRow0 = (await client.evaluate(READ_PANEL)).rows.find((r) => r.field === "lineColor");
  if (!lineColorRow0) {
    failures.push('cascade/Pill: no field-trace-row for "lineColor"');
    return failures;
  }
  if (!lineColorRow0.governed) {
    failures.push('cascade/Pill: "lineColor" should be governed by PILL_PRESETS (data-governed="true")');
  }
  if (lineColorRow0.hasClearOverride) {
    failures.push('cascade/Pill: "lineColor" already shows a clear-override control before any override was set');
  }
  if (!/^preset/i.test(lineColorRow0.winnerBadgeText ?? "")) {
    failures.push(
      `cascade/Pill: expected "lineColor" to resolve from a preset with no stored override, got winner badge ` +
        `"${lineColorRow0.winnerBadgeText}"`,
    );
  }

  const paintBeforePreset = await client.evaluate(readPillPaintExpr(pillA.id));
  const currentPresetId = pillA.attrValue; // App's seed sets state === the active preset id

  // --- 1. Pick a DIFFERENT preset -> resolved paint changes, no override
  // is ever stored on the governed field.
  const presetClick = await client.evaluate(clickDifferentPreset("state", currentPresetId));
  if (!presetClick.ok) {
    failures.push(`cascade/Pill: ${presetClick.reason}`);
  } else {
    const paintAfterPreset = await waitFor(async () => {
      const p = await client.evaluate(readPillPaintExpr(pillA.id));
      return p && p.borderColor !== paintBeforePreset.borderColor ? p : null;
    });
    await client.screenshot(path.join(screenshotDir, "pill-cascade-01-preset-picked.png"));
    if (!paintAfterPreset) {
      failures.push(
        `cascade/Pill: picking preset "${presetClick.presetId}" did not move resolved paint ` +
          `(borderColor stayed "${paintBeforePreset.borderColor}")`,
      );
    }
    const lineColorRow1 = (await client.evaluate(READ_PANEL)).rows.find((r) => r.field === "lineColor");
    if (lineColorRow1.hasClearOverride) {
      failures.push('cascade/Pill: picking a preset stored an override on "lineColor" — it should not');
    }
    if (!/^preset/i.test(lineColorRow1.winnerBadgeText ?? "")) {
      failures.push(`cascade/Pill: after picking a preset, "lineColor" winner should still be "preset", got "${lineColorRow1.winnerBadgeText}"`);
    }

    // --- 2. Set a direct override on the governed field -> it wins.
    const paintBeforeOverride = await client.evaluate(readPillPaintExpr(pillA.id));
    const overrideClick = await clickSegmentUntilChanged(client, "lineColor", async () => {
      const p = await client.evaluate(readPillPaintExpr(pillA.id));
      return p && p.borderColor !== paintBeforeOverride.borderColor;
    });
    if (!overrideClick.ok) {
      failures.push(`cascade/Pill: ${overrideClick.reason}`);
    } else {
      const afterOverride = await waitFor(async () => {
        const rows = (await client.evaluate(READ_PANEL)).rows;
        const row = rows.find((r) => r.field === "lineColor");
        return row?.winnerBadgeText === "override" ? row : null;
      });
      const paintAfterOverride = await client.evaluate(readPillPaintExpr(pillA.id));
      await client.screenshot(path.join(screenshotDir, "pill-cascade-02-override-wins.png"));
      if (!afterOverride) {
        const stuck = (await client.evaluate(READ_PANEL)).rows.find((r) => r.field === "lineColor");
        failures.push(
          `cascade/Pill: setting an override on "lineColor" did not make it win (winner badge: "${stuck?.winnerBadgeText}")`,
        );
      } else {
        // --- 3. the panel visibly shows which layer supplied the value.
        if (!afterOverride.hasClearOverride) {
          failures.push('cascade/Pill: "lineColor" wins as override but shows no clear-override affordance');
        }
        if (paintAfterOverride.borderColor === paintBeforeOverride.borderColor) {
          failures.push("cascade/Pill: resolved paint did not change when the override was set");
        }

        // --- 4. clearing the override falls back to the PRESET's value,
        // not the component default.
        const clear = await client.evaluate(clickClearOverride("lineColor"));
        if (!clear.ok) {
          failures.push(`cascade/Pill: ${clear.reason}`);
        } else {
          const afterClear = await waitFor(async () => {
            const rows = (await client.evaluate(READ_PANEL)).rows;
            const row = rows.find((r) => r.field === "lineColor");
            return row && row.winnerBadgeText !== "override" ? row : null;
          });
          const paintAfterClear = await client.evaluate(readPillPaintExpr(pillA.id));
          await client.screenshot(path.join(screenshotDir, "pill-cascade-03-cleared-back-to-preset.png"));
          if (!afterClear || !/^preset/i.test(afterClear.winnerBadgeText ?? "")) {
            failures.push(
              `cascade/Pill: clearing the override should fall back to "preset", got "${afterClear?.winnerBadgeText}"`,
            );
          }
          if (paintAfterClear.borderColor !== paintAfterPreset?.borderColor) {
            failures.push(
              `cascade/Pill: after clearing the override, resolved paint ("${paintAfterClear.borderColor}") should ` +
                `match the preset's own paint ("${paintAfterPreset?.borderColor}")`,
            );
          }
        }
      }
    }
  }

  // --- TONE: the check whose absence let the panel contradict the pixels.
  // `tone` is sugar that writes the OVERRIDE layer before resolution, so a
  // non-neutral tone must show up in the trace as an override and the control
  // must name the colour actually on screen. Neither verify script mentioned
  // `tone` at all, and the panel was resolving raw props: with a tone set it
  // reported the state preset winning with `primary` while the pill painted
  // the tone's colour, and the Line Color control sat live but inert.
  const toneRow = (panel) => panel.rows.find((r) => r.field === "tone");
  const lineColorRow = (panel) => panel.rows.find((r) => r.field === "lineColor");
  const panelBeforeTone = await client.evaluate(READ_PANEL);
  if (toneRow(panelBeforeTone)) {
    const paintBeforeTone = await client.evaluate(readPillPaintExpr(pillA.id));
    const toned = await client.evaluate(clickDifferentSegment("tone"));
    if (toned?.ok) {
      await waitFor(async () => true, { timeoutMs: 300, intervalMs: 150 }).catch(() => {});
      const paintAfterTone = await client.evaluate(readPillPaintExpr(pillA.id));
      const panelAfterTone = await client.evaluate(READ_PANEL);
      const row = lineColorRow(panelAfterTone);
      if (paintAfterTone?.borderColor === paintBeforeTone?.borderColor) {
        failures.push(
          `cascade/Pill tone: setting a tone did not change the painted border (${paintAfterTone?.borderColor})`,
        );
      } else if (!row) {
        failures.push('cascade/Pill tone: no field-trace-row for "lineColor" after setting a tone');
      } else if (!row.paintedElsewhere) {
        // WHY this assertion changed: it used to demand the badge read
        // "override" whenever a tone was set, which forced the whole row to
        // describe the PAINTED subject — and that is what made the control
        // and the chain show a value the store did not hold, hiding a real
        // stored override and deleting it invisibly. The row now describes
        // the STORE (so with no stored value the badge correctly reads
        // "preset") and states the deviation separately. What must be true is
        // that the deviation is SAID, not that the badge lies about it.
        failures.push(
          `cascade/Pill tone: a tone is painting ${paintAfterTone?.borderColor} but the "lineColor" row ` +
            `says nothing about it — the badge reads "${row.winnerBadgeText}" (the store's own truth) and ` +
            `there is no "painting …" note. A surface that paints one thing and reports another is the ` +
            `defect this gate exists for.`,
        );
      }
    }
  }

  return failures;
}

// ---------------------------------------------------------------------

async function discoverComponentNames(client) {
  return client.evaluate(`(() => {
    const sel = document.querySelector('[data-slot="component-picker"]');
    return sel ? Array.from(sel.options).map((o) => o.value) : [];
  })()`);
}

async function main() {
  const failures = [];
  console.log(`[verify-inspector] starting demo-inspector on :${PORT} (${APP_DIR})`);
  const viteBin = path.join(APP_DIR, "node_modules", ".bin", "vite");
  const server = spawn(viteBin, ["--port", String(PORT), "--strictPort"], {
    cwd: APP_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  let client;
  const componentResults = [];
  let cascadeFailures = [];
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
      console.error("[verify-inspector] demo-inspector never came up:\n" + serverLog);
      process.exitCode = 1;
      return;
    }
    console.log(`[verify-inspector] demo is up. Screenshots -> ${SCREENSHOT_DIR}`);

    client = await launchChrome();
    await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });

    const names = await waitFor(async () => {
      const opts = await discoverComponentNames(client);
      return opts.length > 0 ? opts : null;
    });
    if (!names) {
      failures.push("component picker never rendered any options");
    } else {
      console.log(`[verify-inspector] discovered ${names.length} registered components: ${names.join(", ")}`);
      for (const name of names) {
        console.log(`[verify-inspector] === ${name} ===`);
        const result = await verifyComponentGeneric(client, name, { screenshotDir: SCREENSHOT_DIR });
        componentResults.push(result);
        if (result.failures.length === 0) {
          console.log(`[verify-inspector] PASS ${name}${result.notes.length ? " (" + result.notes.join("; ") + ")" : ""}`);
        } else {
          console.error(`[verify-inspector] FAIL ${name}:\n  - ${result.failures.join("\n  - ")}`);
        }
      }

      console.log("[verify-inspector] === cascade proof: Pill ===");
      cascadeFailures = await verifyCascadeOnPill(client, { screenshotDir: SCREENSHOT_DIR });
      if (cascadeFailures.length === 0) {
        console.log("[verify-inspector] PASS cascade/Pill");
      } else {
        console.error(`[verify-inspector] FAIL cascade/Pill:\n  - ${cascadeFailures.join("\n  - ")}`);
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

  const allFailures = [...failures, ...componentResults.flatMap((r) => r.failures), ...cascadeFailures];
  const allNotes = componentResults.flatMap((r) => r.notes);
  console.log(JSON.stringify({ componentResults, cascadeFailures, allFailures, allNotes }, null, 2));
  if (allFailures.length > 0) {
    console.error(`\n[verify-inspector] FAIL: ${allFailures.length} failure(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      "\n[verify-inspector] PASS: every registered component re-renders from the panel, Mixed round-trips " +
        "correctly where seed data supports it, and the Pill preset/override/clear cascade resolves and traces " +
        "correctly.",
    );
    if (allNotes.length > 0) {
      console.log(`[verify-inspector] NOTES:\n  - ${allNotes.join("\n  - ")}`);
    }
  }
}

await main();
