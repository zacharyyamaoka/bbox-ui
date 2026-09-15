#!/usr/bin/env node
/**
 * Captures CodeBlock's Storybook stories, plus Port's own Primary (its
 * label is now a real single-line CodeBlock in the "field" look), straight
 * from the preview iframe — `/iframe.html?id=<story>&viewMode=story&globals=
 * host:<host>` — never the manager UI (this is a screenshot sweep, not a
 * Controls-panel drive; that already happened for the CodeBlock-Primary
 * host flip, captured separately at /home/bam/.claude/jobs/35e54afe/tmp/
 * verify-hosts/CodeBlock-*.png and reused by the report builder).
 *
 * Same raw-CDP plumbing as demos/capture-code-block.mjs.
 *
 * Usage: node demos/capture-code-block-storybook.mjs <baseUrl> <outDir>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , baseUrlArg, outDirArg] = process.argv;
if (!baseUrlArg || !outDirArg) {
  console.error("usage: node demos/capture-code-block-storybook.mjs <baseUrl> <outDir>");
  process.exit(2);
}
const baseUrl = baseUrlArg.replace(/\/$/, "");
const outDir = path.resolve(outDirArg);
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(path.join(tmpdir(), "bbox-chrome-sb-"));
const chrome = spawn(
  "/usr/bin/google-chrome",
  ["--headless=new", "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--window-size=1200,700", "about:blank"],
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
browser.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id != null && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
  return result.value;
}
async function waitFor(selector, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
    await sleep(120);
  }
  return false;
}
/** Polls an arbitrary boolean expression rather than a selector — used
 *  below for "the story root actually has content", which a bare
 *  selector match can't express. */
async function waitForCond(expression, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(150);
  }
  return false;
}
async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, "base64"));
  return `${name}.png`;
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: String(detail ?? "") });
  console.log(`  ${pass ? "ok" : "FAIL"} — ${name}${detail ? ": " + detail : ""}`);
}

/** One iframe story capture, with a real "does the story root exist"
 * assertion (never a screenshot of a blank/errored preview passed off as
 * evidence) — mirrors capture-code-block.mjs's own discipline. */
async function captureStory(storyId, host, filename) {
  const params = new URLSearchParams({ id: storyId, viewMode: "story" });
  if (host) params.set("globals", `host:${host}`);
  const url = `${baseUrl}/iframe.html?${params.toString()}`;
  await send("Page.navigate", { url });
  const gotRoot = await waitFor("#storybook-root");
  record(`${filename}: #storybook-root mounted`, gotRoot, gotRoot ? "" : `timed out loading ${url}`);
  if (gotRoot) {
    // Poll for real content rather than a single fixed sleep: a
    // multi-instance sweep story (all-looks, all-languages — up to 9
    // CodeMirror mounts at once) can take longer to paint than a
    // single-instance one, and a fixed short sleep flaked on exactly
    // those two (content present per direct probe, but not yet by the
    // time a 500ms sleep's single check ran).
    const hasContent = await waitForCond(
      `((document.querySelector('#storybook-root') || {}).textContent || '').length > 0`,
    );
    record(`${filename}: story root has real content`, hasContent, hasContent);
    // One more beat past "content exists" for CodeMirror's own gutter/
    // syntax-highlighting decorations and, for a host story, the canvas
    // engine's own async mount (host stories carry their own settle
    // margin below) — matches capture-code-block.mjs's own margin.
    await sleep(host ? 700 : 300);
  }
  await screenshot(filename);
}

const CODEBLOCK_STORIES = ["all-looks", "all-languages", "all-sizes", "all-overflows", "expandable", "flatten", "grow-truncated", "editing", "rendered", "primary"];
for (const story of CODEBLOCK_STORIES) {
  await captureStory(`components-codeblock--${story}`, null, `story-components-codeblock--${story}-dom`);
}
for (const host of ["reactflow", "tldraw"]) {
  await captureStory("components-codeblock--primary", host, `story-components-codeblock--primary-${host}`);
}
await captureStory("components-port--primary", null, "story-components-port--primary-dom");

writeFileSync(path.join(outDir, "storybook-manifest.json"), JSON.stringify({ results }, null, 2));
chrome.kill();
await new Promise((resolve) => chrome.once("exit", resolve));
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {}
const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} captures → ${outDir}`);
process.exit(failed.length === 0 ? 0 : 1);
