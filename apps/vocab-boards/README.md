# vocab-boards

The eleven industry visual languages, implemented as real React Flow node and
edge types — and the browser over them. 57 Python scenarios, 235 mechanisms,
705 boards, each one drawn from the tool's own documentation with the citation
beside it.

There is no static report any more (Zach, 2026-09-23: *"Instead of a report,
just make a live server please!"*). **This app is the deliverable.**

`src/boards.json` and `src/site.json` are the input and do not change here —
both are written by `docs/build_vocab_site_data.py`, which is the contract.

```bash
pnpm --filter vocab-boards dev        # the browser on :5471 (VOCAB_PORT overrides)
pnpm --filter vocab-boards typecheck
pnpm --filter vocab-boards test       # the endpoint grammar, the sizing port, the hash state
pnpm --filter vocab-boards build:css  # dist/board.css — verify.mjs needs this
pnpm --filter vocab-boards verify     # the real gate; needs the dev server up
```

## Two entry points, and the split is load-bearing

| address | what it is |
|---|---|
| `?board=<id>` (the **search** query) | one board alone, every interaction off, `document.body.dataset.boardReady` set when it has settled. The machine contract: `scripts/verify.mjs` drives it for all 705, and `main.tsx`'s `__BOARD_*` hooks read it back. `App.tsx` checks it before it looks at the hash, so no routing change can move it. |
| `#/…` (the **hash**) | the browser a human navigates. Every filter lives in the hash query, so Back restores the exact list and a filtered view is a shareable link. |

Routes: `#/` (dashboard + filter bar + 705-card gallery) · `#/sc/<id>` (one
scenario in full, `?b=<n>` anchors a mechanism) · `#/board/<id>` (one board,
pan and zoom) · `#/vocab/<key>` (one language's 26-construct grammar sheet).

The chrome is a clone of the pyblocks goldens viewer's conventions
(`/home/bam/pyblocks/src/goldens/`) — same hash-query state module, same
native-listener search box, same `auto-fill` gallery floor that drops a column
rather than shrinking a card, same collapsible dashboard. Zero relearning.

**705 React Flow instances never mount at once, and never accumulate.** Each
card mounts its board on intersect and UNMOUNTS it again on the way out
(`LazyBoard.tsx`) — measured on an unfiltered gallery at 1680x1000: 8 live at
the top, 56 in the middle, 21 at the bottom.

## What the capture contract consumes

Three things, and nothing else:

| | |
|---|---|
| `dist/board.css` | inlined ONCE for all 705 boards. Generated — run `build:css`. Depends on no JavaScript. |
| `window.__BOARD_HTML__()` | the `.react-flow__viewport` outerHTML of the board currently rendered |
| `window.__BOARD_SIZE__()` | `{width, height}` for the wrapper |

Drive it one board at a time:

```js
await page.goto(`${base}/?board=${encodeURIComponent(id)}`);
await page.waitForFunction((w) => document.body.dataset.boardReady === w, id);
const { html, size } = await page.evaluate(() => ({
  html: window.__BOARD_HTML__(),
  size: window.__BOARD_SIZE__(),
}));
```

and wrap the markup exactly like this — the class and the explicit size are both
load-bearing, because the captured element is absolutely positioned and has no
intrinsic size of its own:

```html
<div class="vb-board" style="width:${size.width}px;height:${size.height}px">${html}</div>
```

`scripts/verify.mjs`'s `standalone` section does precisely that and pixel-diffs
the result against the app. It is currently 0 differing pixels on 5 of the 6
sample boards and 3 pixels (0.0004%, text antialiasing) on the sixth.

Markers are per-board (`vb-<boardId>-wA`…) and live inside the viewport, so 705
inlined boards cannot collide on a marker id. `spec.cap` is NOT rendered into
the markup — the gallery shows it for browsing, the report draws its own.

Also available for diagnostics: `__BOARD_IDS__()`, `__BOARD_ERRORS__(id?)` —
unresolvable endpoints, currently zero across all 705 — and `__BOARD_MODEL__(id)`,
the analytic layout, which is what `verify.mjs` checks the painted wires against.

## The three things that broke the previous renderer

1. **`n.xin` must parse as side `xin`.** The alternation in `layout.ts`'s
   `ENDPOINT` regex puts the longest alternative first; a naive
   `(in|out|x|xin|…)` matches `x` and resolves every execution-input wire to the
   node's RIGHT wall. Pinned by `layout.test.ts`, mutation-tested red.
2. **An accented `tb` node with no ports must still show its accent.** `vtb`
   tints the whole box at 0.13 and strokes it in the accent, not just the nubs —
   otherwise `accent:"err"` renders identical to grey, and a whole bucket of
   this report claims that failure IS a repaint.
3. **A frame title and tag that do not both fit put the tag BELOW the box**, and
   the board grows 16px to make room. `layout.test.ts` checks the height delta.

## Where this differs from docs/vocab_board.py

The Python is the oracle — `verify.mjs`'s `oracle` section compares every
board's computed width and height against it, and `layout.ts` is a line-for-line
port of `_size`, `layout` and `anchor`. Three deliberate differences:

- **Wire curvature.** Forward wires use React Flow's `getBezierPath` (control
  offset `0.5·dx`) where the Python used `max(22, |dx|·0.45)`. Same endpoints,
  very slightly different belly. Feedback arcs and `tb` verticals are ported
  exactly.
- **`dash: true` is honoured.** The Python interpolated Python's `None` into the
  attribute, so `stroke-dasharray="None"` was discarded by the browser and 17
  wires authored dashed drew solid — including `"back up the canvas"`,
  `"no data"` and `"▼ back in next iteration"`, where the dash is the point. To
  go back to the Python's behaviour, drop the `data?.dash` branch in
  `edge.tsx`'s `dash` const.
- **Paint order is set by z-index, not array order.** Frames 0, edges 1, nodes
  2 — the Python's frames → wires → nodes. Putting frames and edges on the same
  layer (as "frames 0, nodes 1" would) makes an opaque `subsystem` frame swallow
  every wire inside it.
