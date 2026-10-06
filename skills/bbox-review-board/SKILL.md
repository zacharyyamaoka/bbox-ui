---
name: bbox-review-board
description: Seed a review board for a bbox-ui host app so it is never blank — the real objects placed at the interaction, numbered cue cards and orange arrows in the host's stock annotation shapes, and a green PASS WHEN card, saved as a file the reviewer opens. Use after any change to a host app's canvas behaviour, or to a trunk component that renders on a canvas, before the handoff. tldraw is implemented (apps/systemsketch, being renamed apps/bbox-tldraw); React Flow is not decided yet.
---

# Review board

After a change, hand Zach a board he can act on immediately, not an empty canvas.

> Zach, 2026-09-19: *"please don't create a board that is blank because then I have to myself build the changes to see them."*

The board is a review aid. It puts the right objects on the canvas and says the gesture and the pass condition **on the canvas itself**. It supplements the real-browser proof of the change; it never replaces it.

## Which host

| Host | Status | Annotations | Generator |
|---|---|---|---|
| **tldraw** — `apps/systemsketch`, being renamed `apps/bbox-tldraw` | implemented | tldraw's **stock** shapes: `geo` cue cards, `arrow` connectors | `scripts/create_review_board.mjs` |
| **React Flow** — `apps/bbox-reactflow`, not created yet | **TBD** (Zach, 2026-09-19: *"for reactflow, still TBD"*) | undecided | none |

For React Flow: do not improvise. Say "no seeded board for React Flow yet — annotation approach undecided", hand over the change without one, and flag it. Inventing a second annotation vocabulary now is what a later decision would have to undo.

What *is* host-neutral, so a React Flow generator can reuse it when the decision is made: the recipe format (real **subject** objects separate from **cues**) and `scripts/layout_quality.mjs`, which validates a recipe's geometry without an editor. The generator is the only tldraw-specific part.

## Refresh what you know first

This standing request will not repeat the feature you just built. Recover the exact interaction from the task history, the diff, the source and the regression test. If [references/recipe.md](references/recipe.md) does not cover a shape, port, binding, state or gesture the change introduced, add the narrow guidance or example to it **before** generating. Do not guess from the standing request, and do not turn one feature into a universal rule.

## Build it

1. **Pick a slug** and target `<tldraw app>/review/<slug>.tldr` (today `apps/systemsketch/review/`). Never a board in `~/SystemSketch` — those are Zach's real boards, the app autosaves into whatever it has open, and the generator refuses that path.
2. **Write a recipe** from [assets/example-review-recipe.json](assets/example-review-recipe.json); the format is in [references/recipe.md](references/recipe.md). Seed the **minimum real objects** needed to reach the interaction, and prefer an already-interesting state over making Zach perform setup.
3. **Real things stay real.** A cable is a `connections` entry, built by the app's own constructor — never a stock arrow imitating one. Orange cue arrows are decorative annotations and nothing else.
4. **A shape inside a container must say so with `parentId`.** Placing it at coordinates inside a frame, an expanded Block or a region is not membership: `createShapes` performs no adoption, so the board looks right and drag-the-container leaves the children behind. Once a shape has a `parentId` its `x`/`y` are **parent-local**. The generator fails the build if it finds one that is inside without belonging.
5. **Cue cards.** Numbered, one physical action each, stating the literal gesture ("Drag estimate() 120 px down"). One orange arrow per targeted step; one separate green `PASS WHEN` card stating the **visible** result. Layout: cards at least 340×100, at least 48 apart, at least **80 from any object on the board** (measured from real bounds — the generator enforces it), each card outside the edge it names, and aligned so its arrow is one straight segment (`dx`/`dy` slide the target point along the edge). Never cover a port, handle, label or drop target.
6. **Generate:**

   ```bash
   node skills/bbox-review-board/scripts/create_review_board.mjs \
     --recipe skills/bbox-review-board/assets/example-review-recipe.json \
     --output apps/systemsketch/review/<slug>.tldr
   ```

   It serves the app on a free port, builds the board in a headless browser through the real editor, saves it with the app's own serializer, then **cold-reopens the saved file through the app's own Open** in a fresh browser context and re-checks it. It writes a PNG to `reports/media/review-boards/` (gitignored) and refuses to overwrite without `--force`. It needs `pnpm install --filter systemsketch...` done in the tree you run it from.
7. **Look at the PNG yourself.** Check clipped text, card overlap, cropped content, arrows crossing cards or labels. The generator proves structure; only your eyes prove it reads well.
8. **Read the "Problems badge" line** in its output. The board's Problems chip is derived lint of the real board. A fixture *about* duplicate or fan-in cables should show one; anything else showing one is noise you introduced.
9. **Commit the `.tldr`** with the change — it is small text, and it pins the board to the commit it was built for.

## What a green run proves

The board reopens through the product's own Open with the same shapes; every promised object exists; every cable is one `ss-wire` plus two bindings and is actually **painted**; no shape sits inside a container without belonging to it; each cue arrow is bound to its card, its tip lands on the named edge point, and its last segment is square to that edge; no card crowds the subject; the camera covers the whole board; no browser console errors. Three deliberately broken recipes (orphaned child, cable to a non-bindable shape, crowded card) each fail with their own message and write nothing.

## Cue arrows do not follow a moved target — by design

In this app a stock arrow **cannot bind to a Block, Port, Code or Region**: their `canBind` accepts only the wire binding ("Nothing else binds", `BlockShapeUtil`). `editor.createBindings` does not throw on a refused binding — it **drops it silently**. So a cue arrow is bound to its **card** and its tip is a fixed point on the target's edge. Consequences:

- Word steps so they read correctly against the **starting** state. After Zach drags the target, the arrow points where it was; that is expected, not a bug.
- Do not "fix" it by making Blocks arrow-bindable. It is a product rule, and a decorative cue must never be able to pass for a cable.
- The generator binds an end only when the target accepts it (a stock shape), asserts the bindings it asked for actually exist, and reports `cueTips.fixed` / `.bound`.

## Hand it over

bbox-ui uses Zach's global handoff — the **Open it** table with one fenced button per row, the report opened through `/home/bam/.local/bin/open` — **not** the archived SystemSketch's `## Review ·` + `review_runtime.py` form (that was local to `/home/bam/systemsketch`). Two facts about the board row, stated plainly:

- The app has to be serving the tree you changed. `pnpm --dir <abs tree> --filter systemsketch dev` serves :4340 with `--strictPort`; Zach often has one running (`ss -ltnp | grep 4340`), so check before assuming it is yours, and never stop a server you did not start.
- **Hand over ONE link, never a file chooser.** `?board=<absolute path>` opens the board directly: `main.tsx` boots file-backed on it and the document session reads it (`apps/systemsketch/src/files/launchConfig.ts` `initialBoard`, `src/files/session.tsx`) and loads the file through the app's file host. **The generator prints the exact link when it writes the board**, and returns it as `openUrl` — copy that line; do not assemble one by hand. It is built by the app's own `boardLinkFor` (launchConfig.ts), which keeps the `=` and every `/` literal. It points at :4340, or at `--url`'s origin when the generator attached to a running app; swap only the origin if the app is served elsewhere, never re-encode the path.

  ```
  http://127.0.0.1:4340/?board=/abs/path/apps/systemsketch/review/<slug>.tldr
  ```

  Three rules on that link, each of which has already broken once:

  - **Paste it as a bare URL or a code span — never a markdown `[text](url)` link.** A chat client escapes the `=` to `%3D`; `URLSearchParams` then reads one key named `board=/abs/path`, there is no `board` param at all, and the app boots its scratch board as though no link were given.
  - **The board must sit inside the file host's fence.** The app reads it through `scripts/systemsketch_files.py`, which refuses any board outside its files root (`_resolve_inside_root`) — `$HOME` for both `pnpm dev` on :4340 (`devFileHost.ts`) and the dock's Stable on :4341, unless `SYSTEMSKETCH_FILES_ROOT` narrows it. A board under a worktree's `apps/systemsketch/review/` is inside it: measured 2026-09-30, a cold open of the printed link for a board under `.claude/worktrees/…/apps/systemsketch/review/` put all 12 shapes on the canvas and left the file byte-identical. Never under `~/SystemSketch` — those are Zach's real boards, the app autosaves into whatever board it has open, and the generator refuses to write there.
  - **Open it yourself before handing it over.** Cold-navigate a real browser to the link, on an app served from the tree that made the board (its shapes must match that code), and check the board is on the canvas.

  Zach, 2026-09-19, rating the handoff that made him open the board by hand **Bad**: *"you should make it so I can open this file directly."*

## Invariants

- Generate through the helper; never hand-edit tldraw schema versions or full records. This app registers custom shapes and bindings validated by `T.*`, and a record that drifts either fails to load or loads wrong.
- Containment is a tree fact, never a geometric one. Every relationship a reviewer can *act on* — parentage, a binding — is a record, not an arrangement that happens to look right.
- Keep one primary interaction per board; split unrelated ones. Keep the board small enough that the fitted camera leaves labels legible.
- Never point a generator, smoke test or launched review at Zach's real board.
- The generator reaches the app through five named seams (top of `create_review_board.mjs`): `window.editor` (dev only), `serializeBoard`, `loadBoardText` (or the older `openBoard`), `createWire`, `boardLinkFor`. If a lane moves one, the run fails naming it — update the seam, do not work around it.
- The tldraw app is `apps/systemsketch` today and `apps/bbox-tldraw` after the rename. `--app` is the only place the generator names it, so the rename is one flag and one default.

## Not ported from the archived skill, on purpose

`create_layout_sweep.mjs` (a calibration harness for the *generator's* layout — port it when the generator's geometry is next changed); `review_runtime.py` and the retained-review contract (bbox-ui already has its own report + launcher handoff); the seventeen recipes for the archived app's Blocks, Behavior Trees and Callouts; the `.systemsketch` envelope (this app's file is a plain `.tldr`).

## Provenance

Ported from the archived skill at `/home/bam/systemsketch/skills/systemsketch-review-fixture` (read-only), whose planning, layout and visual self-check ideas were adapted from the MIT-licensed [Agents365 tldraw skill](https://github.com/Agents365-ai/tldraw-skill). File creation follows the stronger custom-schema rule from [tldraw's own serializer](https://tldraw.dev/reference/tldraw/serializeTldrawJson) and the version-aware [r0b0tlab tldraw skill](https://github.com/r0b0tlab/tldraw-skill): author through the registered editor and schema, then round-trip the result.
