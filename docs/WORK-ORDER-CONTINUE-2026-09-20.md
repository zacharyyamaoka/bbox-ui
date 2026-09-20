# WORK ORDER — continue the 2026-09-19/20 session

**Written by:** Claude Opus 5, handing over at context limit, 2026-09-20 ~01:30.
**You have no memory of the session that produced this.** Everything is here.
**`main` is at `11be1c7`.** Nothing below is merged unless it says so.

Zach was awake and iterating when this was written. He is mid-review on two
running servers. **Read §1 before touching anything** — five of his decisions
are open and one of them gates a lot of work.

---

## 0. The one habit this session kept getting wrong

**Four times** a lane was briefed to build something that already existed on
`main` or a sibling branch, and had to refuse. Before writing any brief or any
code:

```bash
git -C /home/bam/bbox-ui ls-tree -r --name-only main apps/storybook-basics/src | grep -i <thing>
git -C /home/bam/bbox-ui branch --format='%(refname:short)' | xargs -I{} sh -c 'git grep -l <thing> {} -- apps 2>/dev/null | head -1'
```

Known instances: `d04dab3` already ported `branchChip`, `draftBar`,
`compareReview`, `compareModel/propertyRows/lineDiff/wordDiff`; `?board=`
existed **four** times; `allowAnyPath` was already in the trunk unwired;
`documentHref` was already ported. See the memory note
`bbox-ui-menu-kit-already-ported`.

---

## 1. NEEDS ZACH — open decisions, each with the default taken on silence

| | Question | Recommendation / default |
|---|---|---|
| **Z1** | **Region drawing: should `v9` *become* `v8`?** v9 = v8 + `corner.integration: "ruled"`, which adds the rule above the first arm he asked for. | **Default: leave as v9** so v8 stays comparable. Promoting is one token in `regionVariants.css`. |
| **Z2** | **`v10 Header band`: should the corner card's width follow the variant?** Today the board authors a 480px card; making it automatic needs an app rule in `nodeViews.tsx` + `cornerBlock.ts` (`props.w` is persisted). | **Default: no app rule.** A drawing driving persisted geometry fights `resizeBox`. Judge the look first. |
| **Z3** | **Merge `claude/chrome-files-settings-2026-09-19`?** Round-2 Codex judge was still running when this was written — **check its verdict before merging** (see §4). | **Default: do not merge until the judge passes.** |
| **Z4** | **Which `?board=` implementation wins?** Two branches conflict on `boardParam.ts` + `main.tsx`. `claude/board-url-2026-09-20` is the correct one (absolute filesystem paths, `allowAnyPath` ON by default); `e4cfbc8` on `region-drawings` is a stopgap that cannot open a filesystem path. | **Default: board-url wins; delete the stopgap on merge.** |
| **Z5** | **Declare any of the five chrome lanes dead** so the host-less shell's P1 can start? | **Default: P1 waits.** See §4. |

Plus six numbered decisions inside the host-less-shell report (§4) and the
verdict buttons in each report in §6.

---

## 2. Running right now — do not kill what you did not start

| port | what | owner |
|---|---|---|
| **4321** | old SystemSketch Stable | Zach's |
| **4341** | new SystemSketch dock build, serving `main` @ `013728d` | Zach's |
| 4342 | chrome/files/settings preview (sandbox files root) | this session |
| **4372** | `bbox-ui-region-drawings` — **Zach started this himself and is reviewing on it** | Zach's |
| **4383** | `bbox-ui-region-top-rule` — v9/v10 board | this session |
| 4877 | `bbox-ui-board-url` — `?board=` by absolute path | this session |

`4325` is a Chrome debug port. The 5xxx range is peers' Storybooks.

**Never `pkill -f`** a pattern that can match your own command line — it kills
the shell running it and exits 144. This bit three times today. Kill by PID:
`kill $(ss -ltnp | grep :<port> | grep -oP 'pid=\K[0-9]+' | head -1)`.

Out-of-tree worktrees (deliberately outside `.claude/worktrees/` so a sweep
cannot delete them): `/home/bam/bbox-ui-region-drawings`,
`/home/bam/bbox-ui-region-top-rule`, `/home/bam/bbox-ui-board-url`.

---

## 3. What landed on `main` this session

- `013728d` — the corner card's top-right and bottom-left junctions are square
  where they meet the frame, for **every** region kind that has a card
  (branch/for/while). `plain` has none, asserted separately. Zach approved Q1/Q2
  and asked for the generalisation; the dock build was rebuilt onto it.
- `90adef9` — `CLAUDE.md`: hand a board over as a **link**, never a file chooser.
- `11be1c7` — corrected that rule: the **`=`** must stay literal, the `/` need
  not (`URLSearchParams.set` always escapes it; both parse the same).

---

## 4. Unmerged branches — state and what each still needs

| branch | +commits | state |
|---|---|---|
| `chrome-files-settings-2026-09-19` | 19 | Built: burger, Settings, real files. All nine Codex-judge P1/P2 findings fixed with acceptance red-first. Gates: trunk unit 1301/1301, storybook 515/515, app 164/165, python 65/65. **A round-2 Codex judge was mid-run at handover** — read `/tmp/claude-1000/judge2-out.txt` for its verdict before merging (grep for `VERDICT:`). The one known red is the deliberate `closeParentOnEsc` decision. |
| `devtools-2026-09-19` | 23 | Quick switcher on `S` (stock shadcn `Command`), data-driven dev panel shell, recording port (pure core + control + `playback_html` viewer as a modal). **Trunk-only — nothing is mounted in the app.** Needs a wiring lane. |
| `settings-pages-2026-09-19` | 21 | Five settings categories. Canvas → "Mouse and scrolling", Tool aliases → "Hotkeys and aliases". Adds a first-class `slider` kind. `allowAnyPath` shipped but unwired here — `board-url` now provides the fence it binds to. |
| `draft-compare-2026-09-19` | 21 | Draft engine (`draftModel`/`draftChanges`, 63 tests) + the Compare modal shell. Chrome halves were already on `main`. |
| `host-less-shell-2026-09-19` | 14 | **P0 and P2 done.** `HostPort` contract + fake host + 44/44 contract tests incl. four broken-fake meta-tests; whiteboard opened as a library (30 tests, 1,380 lines vs a 2,000 stop rule, **unpushed** — public repo). **P1 is GATED.** |
| `region-drawings-2026-09-19` | 6 | v6/v7/v8 drawings + nesting measurements + a seeded board. Carries the `?board=` **stopgap** (`e4cfbc8`) that Z4 deletes. |
| `board-url-2026-09-20` | 7 | `?board=<absolute path>`, `allowAnyPath` ON by default, read-only host, write verbs all 405. App suite 153 → 250. |
| `region-top-rule-2026-09-20` | 7 | v9 (the rule above the first arm) and v10 (Header band). v1–v8 proven pixel-identical. |
| `library-vs-host-rule-2026-09-19` | 6 | The host-less-shell work order + the host rule. Docs only; merges cleanly (that was N3). |
| `review-board-skill-2026-09-19` | 1 | The `bbox-review-board` generator. Additive, touches no chrome. |
| `review-boards-2026-09-19` | 13 | The same-origin `?board=`; **superseded by board-url on addressing**, but its boot policy was kept. |

### The P1 gate (host-less shell)

`scripts/chrome_gate.sh` on the host-less-shell branch. It currently prints
**5 TOUCHES · GATE CLOSED** — `chrome-files-settings`, `devtools`,
`draft-compare`, `review-boards`, `settings-pages`. P1 may start only when it
prints nothing, or Zach names the remainder dead (Z5). Do **not** use the
original one-liner in the older work order: it reports `git diff` *failures*
(unrelated history) as hits.

---

## 5. Traps measured today — do not rediscover

- **Storybook load-flakes are a population, not one test.** `BlockPortHosts`,
  `FramesPanel`, `DraftBar`, `SceneHosts`, `Select`, `FitToContentHosts` each
  fail roughly one full run in three and pass alone; one was reproduced at a
  base commit predating the session. **Re-run before calling any single
  storybook failure a regression.**
- **Baselines moved repeatedly.** Record your own on your base commit. Numbers
  in any doc, including this one, are stale the moment a lane lands.
- `docs/capture_storybook_shots.mjs` **cannot capture a portalled dialog** — it
  waits for `#storybook-root` to have children and a Base UI popup leaves it
  empty forever. Use a per-shot ready selector.
- **`tsc -b`, not `tsc --noEmit -p`** at the repo root — the root tsconfig is
  `files: []`.
- A fresh worktree has **no `node_modules`**; `pnpm install` in it.
  `.claude/settings.json` sets `worktree.baseRef: head`.
- **Never touch `/home/bam/SystemSketch`** — 31 real boards, and the app
  autosaves into whatever it has open. Review boards live under the app's own
  `review/`.
- `git stash -u` in a shared checkout takes peers' untracked files. A subagent
  reached for it today; it recovered, but commit instead.

---

## 6. Reports Zach has not answered yet

Each has verdict buttons and a Copy button that emits markdown naming each item.

```
file:///home/bam/bbox-ui/reports/media/chrome-files-settings-2026-09-19.html
file:///home/bam/bbox-ui/reports/media/settings-pages-2026-09-19.html
file:///home/bam/bbox-ui/reports/media/region-drawings-2026-09-19.html
file:///home/bam/bbox-ui/reports/media/branch-arm-drawings-2026-09-19.html   (the babble gallery)
file:///home/bam/bbox-ui/reports/media/board-url-2026-09-20.html
file:///home/bam/bbox-ui/reports/host-less-shell-p0-p2-2026-09-19.html
file:///home/bam/bbox-ui/reports/media/port-and-region-proposals-2026-09-19.html
```

---

## 7. Suggested order

1. Read the round-2 judge verdict (§4) and report it — it gates Z3 and a lot else.
2. Put Z1–Z5 in front of Zach as one packet. Nothing below needs him first.
3. **The wiring lane** — mount `devtools` (quick switcher, dev panel, recording),
   `settings-pages` and `draft-compare` into `apps/systemsketch`. All three are
   trunk-only by design so five agents could not collide on the app's mount
   point; until this runs, pressing `S` does nothing and there is no `</>`
   button. This is the single highest-value unit of work outstanding.
4. Then P1 of the host-less shell, once its gate opens.

## 8. Standing rules for the handover

Read `/home/bam/bbox-ui/CLAUDE.md` (it imports `.claude/feedback.md`) and
`~/.claude/CLAUDE.md`. The ones that bit hardest today:

- **Implementing is not integrating.** Branches only; merge only when Zach says
  so in those words. He did say so once today, for the region corners.
- **Every handoff ends with an Open-it table**, a rich-media report, and the
  one-line command that starts the runnable surface. A board is handed over as
  a **URL**, never a file chooser — that earned a Bad rating today.
- **Verify, do not relay.** Several agents' headline claims were right but
  imprecise, and two were wrong in ways that mattered. Check `git diff --stat`
  against claimed files, re-run claimed gates, and read a report before linking
  it.
