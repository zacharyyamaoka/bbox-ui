#!/usr/bin/env node
/**
 * Capture every skin in every host, and MEASURE the invariant that makes a
 * skin safe on a canvas: switching one never moves anything.
 *
 * Same raw-CDP idiom as demos/drive.mjs (Node's native WebSocket, no
 * puppeteer, throwaway Chrome profile). For each host × each skin it clicks
 * the real in-app picker — not a synthetic attribute write — so what is
 * measured is the path a person takes.
 *
 * WHY it measures port-dot centres with getBoundingClientRect rather than
 * asserting the DOM still contains the dots: "the skin did not move
 * anything" is a SPATIAL claim, and a DOM-presence assertion cannot fail
 * when a port slides four pixels out from under the host's edge endpoint —
 * which is exactly the failure a stroke-width token would cause (see
 * skin.css's note on --bbox-skin-stroke-width).
 *
 * Usage: node demos/capture-skins.mjs <name> <url>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , name, url] = process.argv;
if (!name || !url) {
  console.error("usage: node demos/capture-skins.mjs <name> <url>");
  process.exit(2);
}

const SKINS = ["default", "plain", "sketch"];

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, "screenshots", "skins");
mkdirSync(shotDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-skin-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    "--force-device-scale-factor=2",
    "--window-size=1600,1000",
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
const consoleErrors = [];
let sessionId = null;

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
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
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
await send("Page.navigate", { url });

async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.value;
}

const deadline = Date.now() + 40000;
let blockCount = 0;
while (Date.now() < deadline) {
  blockCount = await evaluate(`document.querySelectorAll('[data-slot="block"]').length`);
  if (blockCount >= 5) break;
  await new Promise((r) => setTimeout(r, 250));
}
if (blockCount < 5) {
  console.error(`${name}: only ${blockCount} blocks painted`);
  process.exit(1);
}
// Let the webfont land before the first screenshot, or "default" is
// captured mid-swap and every later diff is against a stale baseline.
await evaluate(`document.fonts.ready.then(() => true)`);
await new Promise((r) => setTimeout(r, 1200));

/**
 * The geometry fingerprint: every port dot's centre in page coordinates,
 * plus every block's box, rounded to whole device pixels. Two skins with
 * the same fingerprint have moved nothing.
 */
const FINGERPRINT = `(() => {
  const round = (n) => Math.round(n * 100) / 100;
  const centres = [...document.querySelectorAll('[data-slot="port-dot"]')].map((el) => {
    const r = el.getBoundingClientRect();
    return [round(r.left + r.width / 2), round(r.top + r.height / 2)];
  });
  const blocks = [...document.querySelectorAll('[data-slot="block"]')].map((el) => {
    const r = el.getBoundingClientRect();
    return [round(r.left), round(r.top), round(r.width), round(r.height)];
  });
  const sample = document.querySelector('[data-slot="block"]');
  const cs = sample ? getComputedStyle(sample) : null;
  return {
    portCount: centres.length,
    blockCount: blocks.length,
    centres, blocks,
    paint: cs && {
      borderRadius: cs.borderTopLeftRadius + " / " + cs.borderBottomRightRadius,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderTopColor,
      background: cs.backgroundColor,
      fontFamily: cs.fontFamily.split(",")[0],
    },
  };
})()`;

const results = {};
for (const skin of SKINS) {
  const found = await evaluate(
    `(() => {
       const b = document.querySelector('[data-skin-option="${skin}"]');
       if (!b) return false;
       b.click();
       return true;
     })()`,
  );
  if (!found) {
    console.error(`${name}/${skin}: no in-app picker button for this skin`);
    process.exit(1);
  }
  // Poll rather than read straight back: the picker is a React component,
  // so the attribute lands in an effect after the click's render, not
  // synchronously inside dispatchEvent. Reading immediately passed only for
  // whichever skin happened to be mounted first, which is a green test that
  // proves nothing.
  const applyDeadline = Date.now() + 5000;
  let applied = false;
  while (Date.now() < applyDeadline) {
    applied = await evaluate(
      `document.documentElement.getAttribute("data-bbox-skin") === "${skin}"`,
    );
    if (applied) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!applied) {
    console.error(`${name}/${skin}: the in-app picker did not apply the skin`);
    process.exit(1);
  }
  await evaluate(`document.fonts.ready.then(() => true)`);
  await new Promise((r) => setTimeout(r, 700));

  results[skin] = await evaluate(FINGERPRINT);

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(shotDir, `${name}-${skin}.png`), Buffer.from(data, "base64"));
}

// ---- the invariant ----
const base = results.default;
let moved = 0;
const drift = [];
for (const skin of SKINS.slice(1)) {
  const other = results[skin];
  if (other.portCount !== base.portCount || other.blockCount !== base.blockCount) {
    drift.push(`${skin}: element count changed`);
    moved++;
    continue;
  }
  for (let i = 0; i < base.centres.length; i++) {
    const [ax, ay] = base.centres[i];
    const [bx, by] = other.centres[i];
    if (ax !== bx || ay !== by) {
      drift.push(`${skin}: port ${i} moved ${(bx - ax).toFixed(2)},${(by - ay).toFixed(2)}`);
      moved++;
    }
  }
  for (let i = 0; i < base.blocks.length; i++) {
    if (base.blocks[i].join() !== other.blocks[i].join()) {
      drift.push(`${skin}: block ${i} box ${base.blocks[i]} -> ${other.blocks[i]}`);
      moved++;
    }
  }
}

const report = {
  host: name,
  url,
  ports: base.portCount,
  blocks: base.blockCount,
  paint: Object.fromEntries(SKINS.map((s) => [s, results[s].paint])),
  geometryIdentical: moved === 0,
  drift,
  consoleErrors,
};
writeFileSync(path.join(shotDir, `${name}-report.json`), JSON.stringify(report, null, 2));

console.log(`\n${name}: ${base.portCount} port dots, ${base.blockCount} blocks`);
for (const skin of SKINS) {
  console.log(`  ${skin.padEnd(8)}`, JSON.stringify(results[skin].paint));
}
console.log(`  geometry identical across skins: ${moved === 0 ? "YES" : "NO"}`);
if (drift.length) console.log("  drift:", drift.slice(0, 8).join(" | "));
if (consoleErrors.length) console.log("  console errors:", consoleErrors.slice(0, 3));

chrome.kill();
// Give Chrome a beat to unlink its own lock files before removing the
// profile: rmSync raced it and threw ENOTEMPTY *after* every measurement
// and screenshot had already succeeded, turning a passing run into a
// non-zero exit for a reason that has nothing to do with the result.
await new Promise((r) => setTimeout(r, 500));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* a leftover throwaway profile in $TMPDIR is not a failed capture */
}
process.exit(moved === 0 && consoleErrors.length === 0 ? 0 : 1);
