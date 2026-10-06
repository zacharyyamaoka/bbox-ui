// docs/capture_grammar_field_boards.mjs — pull the FIELD boards the visual-
// grammar proposal shows straight out of the vocab-boards app (React Flow
// node/edge types over the bucket data), as the self-contained viewport
// markup its capture contract emits. Nothing is redrawn: what the report
// inlines is byte-for-byte what apps/vocab-boards paints for that board id.
//
//   node docs/capture_grammar_field_boards.mjs --base http://127.0.0.1:5471 \
//        --out <scratch>/fieldboards.json  B1__b0__ex1 C1__b1__ex1 ...
//
// WHY through the app and not docs/vocab_board.py: Zach looked at these 705
// boards all day in THIS renderer; a proposal whose field column is the same
// markup reads as one hand with what he has already calibrated on. The
// contract consumed here is the one README.md documents: `?board=<id>`,
// `document.body.dataset.boardReady`, `__BOARD_HTML__()`, `__BOARD_SIZE__()`.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire("/home/bam/bbox-ui/apps/storybook-basics/package.json");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const base = opt("--base", "http://127.0.0.1:5471");
const out = opt("--out", "fieldboards.json");
const ids = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const result = {};
const missing = [];
for (const id of ids) {
  await page.goto(`${base}/?board=${encodeURIComponent(id)}`);
  try {
    await page.waitForFunction((w) => document.body.dataset.boardReady === w || document.body.dataset.boardError === w, id, { timeout: 20000 });
  } catch {
    missing.push(id);
    continue;
  }
  const r = await page.evaluate(() => ({
    ready: document.body.dataset.boardReady ?? null,
    html: window.__BOARD_HTML__(),
    size: window.__BOARD_SIZE__(),
    errors: window.__BOARD_ERRORS__(new URLSearchParams(location.search).get("board")),
  }));
  if (!r.ready || !r.html || r.size.width === 0) {
    missing.push(id);
    continue;
  }
  result[id] = { html: r.html, width: r.size.width, height: r.size.height, errors: r.errors };
  process.stdout.write(`${id}\t${r.size.width}x${r.size.height}\t${r.html.length} chars${r.errors.length ? "\t" + r.errors.join("; ") : ""}\n`);
}
await browser.close();
writeFileSync(out, JSON.stringify(result));
if (missing.length) {
  console.error(`MISSING: ${missing.join(" ")}`);
  process.exit(2);
}
