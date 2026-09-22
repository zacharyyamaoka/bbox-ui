# Work order — continue bbox studio, 2026-09-21

Everything below is on `main` at merge `68f5d19` (127 commits). Typecheck clean,
2,063 unit tests green, tree clean, verified in main's own checkout.

**Read `ARCHITECTURE.md` and `README.md` first.** They are current and normative.

---

## 0. The one thing that is NOT on main, and why

`worktree-bridge-cse_017xqRi8VPYSzshszPLmYuKu` holds two commits from 2026-09-21
that implement something Zach explicitly asked for:

- `a81f155` — the bbox-ui dock icon opens the whiteboard, and ☰ opens the two sites
- `d3dda75` — the report builder for it

**It must be PORTED, not merged.** `git merge-tree` reports zero conflicts and
that is a lie of the kind this repo's CLAUDE.md warns about:

| | chromeBar lives at |
|---|---|
| `main` | `apps/systemsketch/src/chrome/TitleBar/chromeBar.tsx` |
| that branch | `apps/systemsketch/src/chrome/chromeBar.tsx` |

The branch predates the chrome regroup (`d2bc44c`, one folder per editor
component). A merge writes the OLD path, leaving two chromeBar files with the
app importing one and the feature's edits sitting in the other. Same for
`ChromeBar.stories.tsx`, which moved from `src/stories/` to `src/components/`
when stories were colocated.

What the branch adds that main genuinely lacks — verified absent:
`apps/systemsketch/src/chrome/sites.ts` (78 lines) + `sites.test.ts` +
`sites.smoke.test.tsx`, plus `assets/bbox-ui.desktop` and additions to
`scripts/launch_systemsketch.py`.

**Do:** cherry-pick the *content*, re-homing `chromeBar.tsx` onto
`chrome/TitleBar/` and deciding where `sites.ts` belongs under the placement
rule (it is pure — it probably belongs in `scene/` or beside TitleBar, not loose
in `chrome/`). Then run its own two test files.

There are 29 other branches with unmerged commits. All predate this session and
none are known to be wanted; do not merge them speculatively.

---

## 1. What landed, so you do not rebuild it

**The architecture is settled and documented.** Six names — `components`,
`scene`, `editor`, `hosts`, **studio** (the app, "bbox studio"), **site**
(bbox-ui.com). Placement rule: *does it render?* If it paints or measures →
`components/` or `editor/`. Pure and reused → `scene/`, **domain vocabulary and
all**. Pure and used by one component → that component. Applied on top with the
component unaware → `skin/`. A configuration of existing components →
`presets/`.

> **The trap that cost me a whole mis-dispatch: `scene/` IS the domain model.**
> A pure file naming ports and blocks eighty times still belongs there. Purity
> decides, not vocabulary. I used domain-noun counts to place files and
> mis-sorted `dragPolicy.ts` (592 lines, 87 domain nouns, entirely pure).

**Zach's 12 rulings: 11 done, R12 (region add-arm) on hold by his own call.**
`.bbox` file type (old `.systemsketch` still opens), wheel/zoom as a setting,
validation as a level, `B` unbound from the pencil, detach on the primitives,
five edge-drop presets, `+X more` from portEdge with chrome in editor, no
separate Type (parsed after the `:`), description + inspector eye-toggle,
Compare view, multi-line port editor as default.

**Backlog wave 1: 38 of 38.**

**Six bugs found that nobody reported**, all fixed: `applyScene` deleting the
board on re-open, the nine-switch validation gap, P-028's empty migration
(board-breaking, shipped), text lost when a panel closed, style rows that never
armed the next shape, Escape mid-drag silently discarding the interface scale.

---

## 2. What to do next

**`docs/parity-backlog-triage-2026-09-21.md` is the scope document.** Every
wave-2/3/4 item at noticeability 5 and 4, read against the code and classified.
Its quality was independently sampled at 22 entries with **zero errors in the
expensive direction**. Scope from it, not from `parity-backlog.json`.

| verdict | count |
|---|---|
| ABSENT — real work | **110** |
| DUPLICATE-OF — another id covers it | 49 |
| PREMISE-FALSE — describes a codebase that no longer exists | 27 |
| ALREADY-DONE | 14 |

**44% of the backlog is undispatchable as written.** `proofMissing` is a grep,
the greps were written against a tree that has moved, and no item was re-read
after work landed. 229 lower-noticeability items are still untriaged.

Known residuals, each named in its own commit rather than hidden:
- P-030: text commit on unmount is fixed for the one buffered field that had the
  bug; the general contract is still "Enter / Ctrl+Enter / blur".
- Three of nine validation switches gate nothing (`allowSamePolarity` needs port
  direction in the schema; `allowHiddenPorts` and `allowFanOut` have no gate).
- The rail card edits a port's NAME half only; the annotation after `:` has no
  on-card surface.
- `useDocumentScene` returns a new object per store tick, so the burger
  re-renders continuously while open. Not causing a known failure; wasteful.

---

## 3. How to work here — earned the hard way

**Nine tests on main fail ON PURPOSE.** `draft.smoke` (7), `corner.smoke` (1),
and `menus.smoke`'s Export case (1) are acceptance committed *before* their
features; one commit message even records the failure count it was creating. Do
not silence them — they are a to-do list. **Check `git log` on a failing test
before assuming you broke it.** I spent four experiments on a wrong hypothesis
that one `git log` would have settled.

**A mechanism nothing consumes is not done.** Four commits in this session
claimed a feature "governs the board" when the control changed a sentence in a
dialog and nothing else. Before reporting success, name the `file:line` in
`apps/systemsketch/src` where a REAL USER ACTION reaches your work.

**Mutation-test the guard, not just the feature.** Break what you claim is read,
prove the test goes red, restore, prove green. The best lane went further and
implemented the *tempting wrong fix* to prove its guard caught it.

**Adding a shape prop requires a migration, tested against a legacy fixture.**
P-028 shipped a validator with an empty migration and every board saved before
it failed to open. Its own tests were green. See
`shapes/wire/WireShapeUtil.tsx:297` and `document/diffMarkMigration.test.ts`.

**The `smoke` project runs in REAL HEADLESS CHROMIUM** via
`@vitest/browser-playwright` — browser evidence is real. Only `unit` is node.
`--browser.api.port` does **not** propagate into a `projects:` config, so
parallel runs contend on 63315; expect to wait rather than kill.

**The test iframe is scaled 0.8×, not offset.** A CDP move at page (700,450)
arrives at client (875,562). `interfaceScaleCommit.smoke.test.tsx` derives a
two-point affine map at runtime and self-checks it — reuse that for any
pointer-level test.

**Run an adversarial verify pass on every wave.** It changed the conclusion —
not merely confirmed it — on most waves: a feature with zero callers, a
premise-false verdict that was itself false, a board-breaking migration, and
three of my own false claims.

---

## 4. Open questions for Zach

- Nine deliberately-red tests now sit on `main`. Keep them red, or skip them
  with a reason so the suite reads green?
- The logo does not invert with the theme (literal `#1E1E1E`/white, as
  supplied), and its square is not vertically centred in its own viewBox
  (y=25..421 of 0..500). Both may be deliberate.
- 229 untriaged backlog items at noticeability 1–3 — triage or ignore?
- His stated preference is to migrate everything and switch off what he does not
  want, rather than triage up front. That still stands.

## Run it

```bash
pnpm --dir /home/bam/bbox-ui/apps/systemsketch dev
```
