#!/usr/bin/env node
/**
 * The gate for this app. `pnpm --filter vocab-boards verify` against a running
 * dev server.
 *
 * WHY a harness and not "it looked right": the previous renderer of these 705
 * boards shipped three defects that a screenshot of ONE board could not have
 * caught — an endpoint parser that silently sent every execution wire to the
 * wrong wall, an accent that vanished on a node with no ports, and a frame
 * title colliding with its tag. Each check below is an independent oracle for
 * one class of that:
 *
 *   geometry   every wire, in the real browser, must START and END where
 *              layout.ts says — read off the painted path, not the model.
 *   oracle     layout.ts's numbers must equal docs/vocab_board.py's numbers for
 *              all 705 boards. The Python is the thing the specs were authored
 *              against; if the port drifts, this is what says so.
 *   standalone __BOARD_HTML__() pasted into a bare page beside dist/board.css
 *              must be pixel-identical to the app, with zero scripts. That is
 *              the contract the report consumes.
 *   bleed      and it must stay inside its own box, because 705 of them share
 *              one page.
 *
 * Usage:
 *   node scripts/verify.mjs                 # everything (needs pylayout.json for `oracle`)
 *   node scripts/verify.mjs geometry        # one section
 *   PYLAYOUT=/path/pylayout.json node scripts/verify.mjs oracle
 *
 * Produce pylayout.json with:
 *   python3 -c "import sys,json;sys.path.insert(0,'docs');import vocab_board as V; \
 *     print(json.dumps({b['id']: (lambda x: {'W':round(x.W,4),'H':round(x.H,4)})(V.Board(b['spec']).layout()) \
 *     for b in json.load(open('apps/vocab-boards/src/boards.json'))}))" > pylayout.json
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const PORT = process.env.VOCAB_PORT || "5471";
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = process.env.VERIFY_TMP || resolve(app, ".verify");
mkdirSync(TMP, { recursive: true });

const want = new Set(process.argv.slice(2));
const run = (name) => want.size === 0 || want.has(name);

const boards = JSON.parse(readFileSync(resolve(app, "src/boards.json"), "utf8"));
const ids = boards.map((b) => b.id);
const SAMPLE = ["C1__b1__ex1", "B5__b0__ex1", "B2__b1__ex1", "B7__b4__ex2", "B1__b0__ex2", "V10__b3__ex3"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 2 });
const noise = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") noise.push(m.text()); });
page.on("pageerror", (e) => noise.push(`pageerror ${e}`));

const open = async (id) => {
  await page.goto(`${BASE}/?board=${encodeURIComponent(id)}`, { waitUntil: "load" });
  await page.waitForFunction((w) => document.body.dataset.boardReady === w, id, { timeout: 20000 });
};

const fails = [];
const note = (section, detail) => fails.push({ section, ...detail });

/* ------------------------------------------------------------- geometry */

if (run("geometry")) {
  let wires = 0;
  for (const id of ids) {
    await open(id);
    const r = await page.evaluate(() => {
      const m = window.__BOARD_MODEL__();
      const vp = document.querySelector(".react-flow__viewport");
      const paths = [...vp.querySelectorAll(".react-flow__edge-path")];
      const bad = [];
      m.wires.forEach((w, i) => {
        const p = paths[i];
        if (!p) return bad.push({ wire: w.id, why: "not drawn" });
        const L = p.getTotalLength();
        const s = p.getPointAtLength(0);
        const e = p.getPointAtLength(L);
        const ds = Math.hypot(s.x - w.a.x, s.y - w.a.y);
        const de = Math.hypot(e.x - w.b.x, e.y - w.b.y);
        if (ds > 0.75 || de > 0.75)
          bad.push({ wire: w.id, handles: [w.a.handle, w.b.handle], startOff: +ds.toFixed(2), endOff: +de.toFixed(2) });
      });
      const nan =
        [...vp.querySelectorAll(".react-flow__node")].filter((n) => /NaN|undefined/.test(n.getAttribute("style") || "")).length +
        paths.filter((p) => /NaN|undefined/.test(p.getAttribute("d") || "")).length;
      return { bad, nan, wires: m.wires.length, paths: paths.length, errors: m.errors };
    });
    wires += r.wires;
    if (r.bad.length || r.nan || r.errors.length || r.wires !== r.paths) note("geometry", { id, ...r });
  }
  console.log(`geometry   ${ids.length} boards · ${wires} wires · ${fails.filter((f) => f.section === "geometry").length} bad`);
}

/* --------------------------------------------------------------- oracle */

if (run("oracle")) {
  const pyPath = process.env.PYLAYOUT || resolve(TMP, "pylayout.json");
  if (!existsSync(pyPath)) {
    console.log(`oracle     SKIPPED — no ${pyPath} (see the header for how to make one)`);
  } else {
    const py = JSON.parse(readFileSync(pyPath, "utf8"));
    await page.goto(`${BASE}/?board=__none__`, { waitUntil: "load" });
    const ts = await page.evaluate(
      (list) => Object.fromEntries(list.map((id) => {
        const m = window.__BOARD_MODEL__(id);
        return [id, { W: +m.W.toFixed(4), H: +m.H.toFixed(4) }];
      })),
      Object.keys(py),
    );
    let n = 0;
    for (const [id, p] of Object.entries(py)) {
      for (const k of ["W", "H"]) {
        n++;
        // 1e-3, not exact: Python's round() is half-to-even and JS toFixed is
        // half-away-from-zero, so identical doubles can print 0.0001 apart.
        if (Math.abs(p[k] - ts[id][k]) > 1e-3) note("oracle", { id, what: k, python: p[k], typescript: ts[id][k] });
      }
    }
    console.log(`oracle     ${n} numbers vs docs/vocab_board.py · ${fails.filter((f) => f.section === "oracle").length} disagree`);
  }
}

/* ----------------------------------------------------------- standalone */

if (run("standalone")) {
  writeFileSync(resolve(TMP, "board.css"), readFileSync(resolve(app, "dist/board.css")));
  for (const id of SAMPLE) {
    await open(id);
    const { html, size } = await page.evaluate(() => ({ html: window.__BOARD_HTML__(), size: window.__BOARD_SIZE__() }));
    if (!html) { note("standalone", { id, why: "__BOARD_HTML__() returned nothing" }); continue; }
    await (await page.$(".vb-board")).screenshot({ path: resolve(TMP, `${id}__app.png`) });

    writeFileSync(
      resolve(TMP, `${id}.html`),
      `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./board.css">
<style>html,body{margin:0;background:#0e0f12}</style>
<div class="vb-board" style="width:${size.width}px;height:${size.height}px">${html}</div>`,
    );
    await page.goto(pathToFileURL(resolve(TMP, `${id}.html`)).href, { waitUntil: "load" });
    const scripts = await page.evaluate(() => document.scripts.length);
    if (scripts) note("standalone", { id, why: `bare page ran ${scripts} script(s)` });
    await (await page.$(".vb-board")).screenshot({ path: resolve(TMP, `${id}__bare.png`) });

    const a = PNG.sync.read(readFileSync(resolve(TMP, `${id}__app.png`)));
    const b = PNG.sync.read(readFileSync(resolve(TMP, `${id}__bare.png`)));
    if (a.width !== b.width || a.height !== b.height) { note("standalone", { id, why: "different size" }); continue; }
    let diff = 0;
    for (let i = 0; i < a.data.length; i += 4)
      if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 2) diff++;
    const pct = (100 * diff) / (a.width * a.height);
    // 0.05% absorbs sub-pixel text hinting between two page loads; a real
    // structural difference is orders of magnitude bigger than that.
    if (pct > 0.05) note("standalone", { id, why: `${diff} pixels differ (${pct.toFixed(3)}%)` });
  }
  console.log(`standalone ${SAMPLE.length} boards · ${fails.filter((f) => f.section === "standalone").length} bad`);
}

/* ---------------------------------------------------------------- bleed */

if (run("bleed")) {
  writeFileSync(resolve(TMP, "board.css"), readFileSync(resolve(app, "dist/board.css")));
  // The widest overflow in the corpus: a node tag far wider than its own node.
  for (const id of ["B1__b1__ex1", ...SAMPLE.slice(0, 2)]) {
    await open(id);
    const { html, size } = await page.evaluate(() => ({ html: window.__BOARD_HTML__(), size: window.__BOARD_SIZE__() }));
    writeFileSync(
      resolve(TMP, "bleed.html"),
      `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./board.css">
<style>html,body{margin:0;background:#ff00ff}</style>
<div style="padding:40px;display:inline-block"><div class="vb-board" style="width:${size.width}px;height:${size.height}px">${html}</div></div>`,
    );
    await page.goto(pathToFileURL(resolve(TMP, "bleed.html")).href, { waitUntil: "load" });
    await page.screenshot({ path: resolve(TMP, `${id}__bleed.png`), fullPage: true });
    const png = PNG.sync.read(readFileSync(resolve(TMP, `${id}__bleed.png`)));
    let impure = 0;
    const rows = Math.min(png.height, 40 + size.height + 40);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < 40; x++) {
        const i = (png.width * y + x) << 2;
        if (!(png.data[i] > 250 && png.data[i + 1] < 5 && png.data[i + 2] > 250)) impure++;
      }
    if (impure) note("bleed", { id, why: `${impure} gutter pixels painted over` });
  }
  console.log(`bleed      ${fails.filter((f) => f.section === "bleed").length} bad`);
}

/* ---------------------------------------------------------------- noise */

const uniqueNoise = [...new Set(noise)];
if (uniqueNoise.length) note("console", { messages: uniqueNoise.slice(0, 20) });
console.log(`console    ${uniqueNoise.length} error/warning message(s)`);

await browser.close();
writeFileSync(resolve(TMP, "verify.json"), JSON.stringify(fails, null, 1));
if (fails.length) {
  console.error(`\nFAIL — ${fails.length} problem(s); full detail in ${resolve(TMP, "verify.json")}`);
  console.error(JSON.stringify(fails.slice(0, 8), null, 1));
  process.exit(1);
}
console.log("\nPASS");
