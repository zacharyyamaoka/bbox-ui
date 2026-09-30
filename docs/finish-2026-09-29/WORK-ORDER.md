# WORK ORDER — finish bbox-ui v1 in one run

**Written:** 2026-09-29 by Claude Opus 5.5 (planner) against `main` `705847c`.
**Status:** PLAN — not started. Needs Zach's answers in §6, or silence (every
question carries the default the run takes).
**Executor:** one Opus dispatcher session running the `/dispatcher` skill, with
builders in isolated worktrees. The kickoff prompt is §8.
**You have no memory of the conversation that produced this.** Everything is
here, in `lanes.json` (the lane table — authoritative where this prose and it
disagree), `backlog-verified.json` (the 110 items re-verified on 2026-09-29),
and `untriaged-clusters.md` (the 229 never-triaged items, clustered).

Read first: `CLAUDE.md`, `.claude/feedback.md`, `ARCHITECTURE.md`,
`docs/DISPATCHER-WORKFLOW.md`, `docs/WORK-ORDER-CONTINUE-2026-09-21.md` §3
("How to work here — earned the hard way").

---

## 1. The finish line — six gates, each measured

"Finish the rest" has no end unless it is drawn. This is the line. The run is
done when every gate has a measured evidence line in `LEDGER.md`, not before.

| Gate | Done means | Measured by |
|---|---|---|
| **G1 Nothing wanted is stranded** | Every branch with unmerged commits is merged, ported, or archived as dead with a reason | `git for-each-ref` ahead-of-integration count = 0 for every non-archived branch |
| **G2 Green, honestly** | No red test anywhere except acceptance for a lane still in flight; the flaky set fixed | full studio + storybook-basics suites, **5 consecutive runs**, identical green |
| **G3 The studio replaces the archived app** | All 93 assigned open items done — a REAL user action reaches each, `file:line` cited | per-item line in `LEDGER.md`; lane acceptance green |
| **G4 One shell, two hosts** | Chrome behind `HostPort` (P1); a React Flow host (P3) running the same shell | host contract suite green on fake, tldraw and React Flow hosts |
| **G5 The registry ships** | Every `registry.json` item installs and type-checks in a throwaway project; every item has a docs page with a live demo | `docs/verify_registry_install.py` with an empty pin; `pnpm preflight` |
| **G6 Stable / Preview for the studio** | Dock opens Stable; Preview one click away; the hand-rolled studio channel code deleted | the switcher's journey under scratch `SPS_*` env; the real dock's three rows |

Out of the line, on purpose (§7 lists every item): the visual-language
proposal of 2026-09-24 (awaiting his marks), semantic wire kinds (P-069 and its
four dependents), pyblocks write-back, the library's contents, editor
extensions, and 14 of the 34 low-noticeability clusters.

---

## 2. What the planner measured (do not re-derive)

- **main is not green.** Studio: **10 failed / 672 passed**. Nine are the
  acceptance the 09-21 work order committed before its features — `draft.smoke`
  ×7, `corner.smoke` ×1 (the bottom-right cluster is 28 px over its limit at
  720×900), and `menus.smoke`'s View/Preferences/Export case, which now times
  out at 30 s waiting for rows that do not exist. The tenth, `menus.smoke`'s
  burger order, is stale: the channel rows he asked for landed on 09-22 and the
  pinned order was never updated. storybook-basics: 1 failed / 3,676
  on the health run, and a *different* 1–4 on every re-run — flaky under load
  (DevPanel, FileNavigatorGeometry, FitToContentHosts drag, BlockPortHosts,
  DraftBar focus). Typecheck is clean across all packages.
- **74 commits of finished work sit off main** on twelve branches (§3 W1),
  most of them things he asked for. Every merge candidate is conflict-free
  against main on its own, and ten were also stacked in W1's order as objects
  only (scratch tip `587b950`, since removed; `baseline.md` has the detail):
  **zero conflicts, typecheck clean, studio 10 red = exactly main's 10.** The
  storybook-basics failures on that tip moved between runs — the flaky set,
  not merge damage.
- **The backlog moved.** Of the 110 items the 09-21 triage called ABSENT:
  94 still absent, 12 partial, 2 now done (P-053, P-055), 2 obsolete (P-018,
  P-170). Size of the 106 open: 24 S · 53 M · 29 L. 18 needed a product call;
  §6 gives each a default.
- **The trunk is ahead of the app.** A large share of "absent" items are parts
  already built in `apps/storybook-basics/src` that the studio never mounts:
  `TraceBadge`, `buildBlockMenu` + `ComponentContextMenu`, `ScrubNumber`,
  `fitBoxToMembers`, `tidyTraces`, `reconcileDefinitions`, `blockMembers`,
  `BlockRegionBlackboxToggle`, `draftModel`/`branchChip`, the dividers, the
  magnet kit. A lane's first move is to mount the trunk part, never rebuild it.
- **Peers:** no worktree has a modification newer than 2026-09-23. The
  `merge-ready-integrator-2c63dc` worktree holds an abandoned uncommitted merge
  of `1f9fd45`, which is already on main — dead state, 155 files.
- **Stable/Preview:** `/home/bam/stable_preview_switcher` landed 2026-09-29 and
  its skill forbids hand-rolled channels. The studio is Vite, so adoption is
  one `stable-preview.json`. That supersedes `claude/whiteboard-channels-2026-09-24`.

---

## 3. Waves

The dispatcher sits on **`claude/finish-2026-09-29`** in its own worktree, cut
from `main`. Nothing merges to `main`; the handoff offers it to `/merge-ready`.
`.claude/settings.json` must carry `{"worktree": {"baseRef": "head"}}` so lanes
cut from the dispatcher's HEAD (it does today — re-check; `.claude/` is
gitignored).

```
W0 preflight ─► W1 land ─► W2 G-FLAKE ∥ G-STALE ─► B-RENAME ─► B-SCHEMA ─┬─► W3 canvas lanes (13) ──────────────┐
                    │                                                     └─► B-SHELL-P1 ─► W4 chrome lanes (5) ─┼─► W5 verify
                    └─► L-REG ∥ L-DOCS-COMPONENTS ∥ L-DOCS-EDITOR ─────────────► L-RF-HOST ─► L-DOCS-SCENE-HOSTS ─┘
                                                           B-RENAME ─► L-CHANNELS ────────────────────────────────┘
```

### W0 — Preflight (dispatcher, ~30 min)
1. `git worktree add` a dispatcher worktree on a new `claude/finish-2026-09-29` from `main`.
2. Peer gate: list every worktree with a modification newer than 2h. If any touches a lane's write set, that lane waits.
3. Baseline: `pnpm -r typecheck`; studio suite; storybook-basics suite ×2 (to see the flaky set). Record exact failing test names in `LEDGER.md`.
4. Commit `LEDGER.md` (the resume record, §5) before the first dispatch.

### W1 — Land the stranded work (dispatcher, serial)
Merge with `--no-ff`, in this order, and after **each** run typecheck and both
suites and diff the failure set against the W0 baseline:

1. `claude/rename-and-dead-actions-2026-09-23` — rename saves in native mode; a guard counts dead controls
2. `claude/dead-settings-2026-09-22` — "Copy/paste under cursor" made real (closes P-101: verify it reaches tldraw)
3. `claude/file-navigator-fixes-2026-09-22` — the frame stays in the window, three columns
4. `claude/truthful-branch-viz-e4c8d3` — the truthful branch grammar, the head tab, match vs if/elif
5. `claude/bbox-ui-toolbar-redesign-91949c` — Two Faces (four triggers; the trunk ControlStrip mounted)
6. `claude/visual-language-reports-moc-279480` — `apps/vocab-boards` + reports (lockfile changes: `pnpm install` here)
7. Docs/report-only: `visual-lang-design-issues-1e94f4`, `python-syntax-visualization-b86806`, `native-file-dialog-research-2026-09-22`, `file-navigator-slow-4354e7`, `library-vs-host-rule-2026-09-19`
8. **Port, never merge,** `claude/host-less-shell-2026-09-19` (293 behind main; conflicts in `.gitignore` and `engineFree.test.ts`). Graft `apps/storybook-basics/src/shell/**`, `apps/bbox-no-host/**`, `scripts/chrome_gate.sh`, and the contract suite, the way `a18c906` ported the bridge branch — read that commit message first.
9. In `/home/bam/simple-reactflow-whiteboard`: merge `claude/open-as-library-2026-09-19` into its local `main`. **Never push** (public repo).

**Archive, do not merge** (tag `archive/<name>`, reason in the tag message):
`whiteboard-channels-2026-09-24` (superseded by the switcher),
`review-boards-2026-09-19` (superseded by `skills/bbox-review-board` + `sps dev`;
first confirm `create_fixture.mjs`/`layout_quality.mjs` carry nothing main
lacks), `branch-preset-spike-2026-09-22` (a spike),
`notebook-lab-work-order-472c22` and `canvas-jupyter-execution-871b9c` (the lab
moved to its own repo), `control-flow-integration-2026-09-18` and every
`lane-*` (landed via integration). Everything else is 0 ahead.

### W2 — Green, then two barriers
`G-FLAKE` ∥ `G-STALE` (isolated), merge both; then **`B-RENAME` alone**; then
**`B-SCHEMA` alone**. Barriers are serialized on purpose: every later lane
imports the paths and props they change, and two lanes can each be green and
jointly wrong on a moving contract. The dispatcher also installs every new
dependency here, before any lane exists: `elkjs` (L-ROUTE) in the app,
`react-arborist` (L-INSPECTOR) in storybook-basics. Lanes never touch
`package.json` or the lockfile.

`B-SCHEMA` exists because 23 of the open items write `BlockShapeUtil.tsx`. One
lane adds every new prop in one migration against a legacy fixture, at
defaults that render today's pixels (P-028 shipped an empty migration once
and every saved board failed to open; its tests were green). After it lands
the schema is frozen: feature lanes consume props, they never add them. A lane
that finds it needs a new prop stops and reports — the dispatcher adds it in
a follow-up schema commit, alone.

### W3 — Canvas lanes ∥ the shell lift ∥ the library
`B-SHELL-P1` is a barrier on `chrome/` only. Thirteen canvas lanes do not touch
chrome and run beside it: L-WIRE-GESTURE, L-WIRE-PAINT, L-ROUTE,
L-BLOCK-VIEWS, L-PORTS-RAIL, L-PORTS-SHAPE, L-CODE, L-GLYPH, L-COMPARE,
L-GESTURES, then L-DIAG (after L-WIRE-PAINT), L-MEMBERS (after L-BLOCK-VIEWS),
L-LINKING (after L-MEMBERS). The library lanes L-REG, L-DOCS-COMPONENTS,
L-DOCS-EDITOR have been free to run since W1.

**Hotspot:** `BlockFace.tsx` is written by L-BLOCK-VIEWS (header/size), L-PORTS-RAIL
(rails) and L-MEMBERS (members). They edit different regions; merge in that
order and re-run the **full** studio suite after each.

**Concurrency cap: six lanes in flight.** Browser tests in every worktree
contend for vitest's port 63315 (`--browser.api.port` does not propagate into
a `projects:` config), so lanes run only their own targeted smoke files and the
dispatcher runs the full suites after each merge. Expect to wait; never kill.

### W4 — Chrome on the lifted shell, the second host, channels
After `B-SHELL-P1` merges: L-MENU-CONTEXT, L-PILL, L-INSPECTOR (also after
L-MEMBERS), L-FILES, L-NAV, and L-RF-HOST. L-CHANNELS depends only on
B-RENAME. L-DOCS-SCENE-HOSTS last (it iframes the React Flow host). Chrome is
built **in the trunk shell and editor kit**, and the app only mounts and wires
it (feedback ledger, 2026-09-19): a chrome fix that lives only in the app is a
divergence the React Flow host inherits nothing from.

### W5 — Verify, judge, report, clean up
Full suites twice on the integration tip; registry verify; `pnpm preflight`;
headless journeys on both hosts (hero video); seeded review boards via the
`bbox-review-board` skill for canvas changes; a Codex judge over the whole
integration diff with this file as the spec; the report; cleanup (D8); stop
every server the run started.

---

## 4. Every lane, in the same five steps

1. **Acceptance first, by Opus.** An acceptance author (Opus, not the builder)
   turns the lane's `acceptance` lines in `lanes.json` into tests, re-verifies
   each item against the tree **as it stands at dispatch** (the 09-21 triage
   was 44% stale within a day), writes `docs/lanes/finish-<lane>.md` in the house
   format (write set, do-not-touch, acceptance files, builder brief), commits
   the tests **red**, and marks any item it finds done or obsolete in the ledger
   instead of building it.
2. **Build, by the lane's model** in `lanes.json` (Sonnet 5.5 at `high` unless
   it says `opus`), `isolation: "worktree"`. Brief opens with
   `pnpm install --filter <pkg>...` (~1 s). Acceptance files are off-limits;
   "cannot pass → FAIL plus the one-line fix" is a valid return.
3. **Name the user action.** Before claiming done, the builder cites the
   `file:line` in the app where a real user action reaches the work. A
   mechanism nothing consumes is not done (09-21: four commits claimed features
   that changed a sentence in a dialog and nothing else).
4. **Mutation-test the guard.** Break what the test claims to read, prove red,
   restore, prove green — in the commit message.
5. **Audit by Codex, read-only.** `codex exec --sandbox read-only -m gpt-6-astra
   -c model_reasoning_effort="xhigh"` with a prompt file under
   `/home/bam/bbox-ui/reports/media/audits/`; ≤3 rounds; the builder's model never
   judges its own lane. If the auditor says the *acceptance file* is wrong, the
   dispatcher fixes it (budget one such step per wave — it cost a fifth of fix
   rounds on 09-18) and says so.

Then the dispatcher: `git diff --stat` against the claimed files (a zero-diff
"done" is fabricated — redispatch fresh, never resume), merge `--no-ff` from the
lane's auto-named branch, full suites, ledger line, `git worktree remove`.

Carried rules: `WHY:` comments at every seam that keeps a stated preference;
cite donor `file:line` for any algorithm (`docs/ALGORITHM-PROVENANCE.md`; never
read libavoid, it is LGPL); a new shape prop needs a migration tested against a
legacy fixture; the test iframe is scaled 0.8× (reuse the two-point affine map in
`interfaceScaleCommit.smoke.test.tsx`); never `pkill -f` a pattern in your own
command line; never `git add -A`.

---

## 5. Resume — the run will be interrupted

A usage limit kills every agent on that model mid-run (09-19). So:
- `LEDGER.md` has one row per lane: `status` (queued · acceptance · building ·
  auditing · merged · failed · skipped), branch, tip sha, audit verdict, the
  user-action `file:line`, and one evidence line. The dispatcher updates it
  **and commits it** after every state change.
- A restarted dispatcher reads the ledger, skips `merged`, hands any `building`
  worktree to a fresh builder with a takeover note, and treats a null audit as
  "not audited", never as FAIL.
- Before resuming, kill only the orphaned dev servers the run started (check
  `/proc/<pid>/cwd` first). The harness refuses killing a peer session's process.

---

## 6. Decisions — every one has a default the run takes if Zach is silent

| id | Question | Default (reversible) |
|---|---|---|
| **D1** | Scope | This plan — the six gates. (Smaller: W0–W2 + L-CHANNELS only. Larger: also the §7 list, after his design calls.) |
| **D2** | Where it lands | `claude/finish-2026-09-29`; `main` untouched until he says merge |
| **D3** | Rename `apps/systemsketch` → `apps/bbox-tldraw` | Yes, as barrier B-RENAME, skipped automatically if a live peer is in the app |
| **D4** | The 9 deliberately-red tests | Build what they specify (drafts, the narrow corner, the Export rows); update only the stale burger order |
| **D5** | Studio Stable / Preview | Adopt `stable_preview_switcher`; both channels open the same board file; archive the channels branch |
| **D6** | Deploy bbox-ui.com | No — `preflight` only; deploying is his call |
| **D7** | simple-reactflow-whiteboard | Merge its library branch locally; never push |
| **D8** | Cleanup | Tag `archive/<name>` then delete branches that are merged or declared dead; remove clean worktrees of merged branches; abort the stale integrator merge; dirty worktrees are listed, not touched |
| **D9** | Judge | Codex gpt-6-astra xhigh, read-only, per lane and once over the whole diff |
| **D10** | Visual-language proposal (09-24) and loop/branch grammar clusters 5, 16 | Excluded until he marks the proposal |
| **Q-P013** | Two-click cable drawing — where? | From the wire/arrow tool only; clicking a dot keeps opening the port lane; drag-from-dot unchanged |
| **Q-P056** | How a portless block gets its first port | "Add port ▸ side" in the block right-click menu and the inspector; nothing on hover (he rejected hover-to-add) |
| **Q-P070** | What "enter a block" does | Zoom-to-fit + focus lens dims siblings; crumbs show ancestry; Esc steps out; the document is not rescoped |
| **Q-P123** | Port direction | Derived from the wall (left in, right out, top/bottom neutral); nothing stored |
| **Q-P130** | Show card | A toggle row in the block right-click menu |
| **Q-P166** | Auto-grow | An explicit "Fit to content" command; never automatic (P-212: only explicit commands resize) |
| **Q-P178** | Turn into | Right-click "Turn into ▸ Block / Code / Port" on stock shapes; double-click on empty canvas stays stock |
| **Q-P215** | Mouse 4/5 | Stay on selection history; viewport history on the title-bar arrows and Alt+←/→ |
| **Q-P060 · P120 · P124 · P146** | Row/branch ports · block folding · per-port groups · block footer | Drop all four: regions carry arms; view hotkeys replace folding; edge-owned groups exist; the footer collides with doNotBuild |
| **Q-P069** | The seven semantic wire kinds | Out of this run — needs how each looks, and whether they replace data/async/delayed |
| **Q-P104 · P179 · P232 · P236** | pyblocks write-back surface · drag-policy note · library contents · editor extension | Out of this run; P-236 defaults to a Clank plugin in its own repo |
| **Q-dNB** | P-314 (min size on port view), P-394 (semantic zoom opt-in), P-363 (notes tab) ask for things doNotBuild forbids | Honour doNotBuild; skip |

---

## 7. Deliberately not in this run

13 items (`lanes.json` → `deferred`) and 14 clusters (`deferredClusters`), each
with its reason. Also: anything in `packages/bbox-ui` beyond making registry
items installable (it is the frozen v1 lineage), `apps/storybook` (opt-in),
deploys, pushes, and the vault note on the settled architecture (vault writes
belong to a vault session).

---

## 8. Kickoff

Paste into a fresh Opus 5.5 session whose cwd is `/home/bam/bbox-ui`:

> /dispatcher Execute `docs/finish-2026-09-29/WORK-ORDER.md` end to end, with
> `lanes.json` as the lane table. Take every default in §6 unless this message
> overrides it: [overrides, or "none"]. Work on `claude/finish-2026-09-29`;
> never merge to main, push or deploy. Keep `LEDGER.md` current and committed;
> if you are a resumed session, read it first and skip merged lanes. End with
> the §3 W5 report and the button-bar handoff.
