# Work order — continue bbox studio, 2026-09-21

Everything below is on `main` at `a18c906` (128 commits). Typecheck clean across
20 packages, 2,063 unit tests green, 107 python tests green, tree clean,
verified in main's own checkout.

**Read `ARCHITECTURE.md` and `README.md` first.** They are current and normative.

---

## 0. The bridge branch — PORTED 2026-09-21, nothing is off main now

`worktree-bridge-cse_017xqRi8VPYSzshszPLmYuKu` held the dock-icon feature
(`a81f155`). **It is now on main as `a18c906`** — ported by hand, not merged,
and the branch is deliberately left unmerged so nobody merges it later.

**Read that commit message before you touch a stale branch here.** It is the
worked example of the hazard: `git merge-tree` reported ZERO conflicts, and a
merge would still have been wrong, because the branch predates two renames
(`chrome/chromeBar.tsx` → `chrome/TitleBar/chromeBar.tsx`, `src/stories/` →
colocated). The merge writes the OLD path; you get two chromeBar files, the app
importing one and the feature in the other, and both compile. Its
`launch_systemsketch.py` was worse — it predates the file host, the workspace
API and the recorder, so taking it whole would have silently deleted all three.
Only the four additive Storybook hunks were grafted.

What landed: `chrome/sites.ts` (flat, beside its sibling `legacyApp.ts` — it is
a pure function of the hostname and renders nothing, so it is not TitleBar's to
own) + its unit and smoke tests, the `siteGroups` memo in chromeBar, the
Storybook hunks in the launcher, and `assets/bbox-ui.desktop` — byte-identical
to the copy already installed at `~/.local/share/applications/`.

> **Stable may still be serving `a81f155`.** `scripts/launch_systemsketch.py
> --status` tells you which build the dock is on; `--update` rebuilds it from
> this checkout's HEAD. `--update` refuses a dirty app or trunk, by design.

There are 29 other branches with unmerged commits. All predate this session and
none are known to be wanted; do not merge them speculatively — and if one ever
is wanted, port it the way `a18c906` did.

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
- **The architecture conclusions were never filed in Obsidian.** He asked for
  "notes on this in obsidan" alongside the report and the README; the report
  (`reports/media/architecture-settled-2026-09-21.html`) and `ARCHITECTURE.md`
  both landed, the vault note did not — `zach_brain/Projects/bbox-ui/` was last
  touched 2026-09-20. Filing it needs the second linking pass
  ([[feedback_second_linking_pass]]): link to the REAL existing notes, stub only
  what genuinely has none.
- His stated preference is to migrate everything and switch off what he does not
  want, rather than triage up front. That still stands.

## Run it

```bash
pnpm --dir /home/bam/bbox-ui/apps/systemsketch dev
```
