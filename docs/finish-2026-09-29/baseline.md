# Baseline measured by the planner — 2026-09-29, main `705847c`

W0 re-measures this; it is here so the run can tell drift from damage.

## Typecheck

`pnpm -r typecheck` — clean across every package (health scout, and again on
the simulated stack below).

## Studio (`apps/systemsketch`, `pnpm exec vitest run`)

**10 failed / 672 passed** (86 files, 3 failed). Identical on the simulated
stack (771 tests there — the landed branches add 89, all green).

| file | test | why it is red |
|---|---|---|
| `draft.smoke.test.tsx` | 7 tests: chip reads Main; New draft enters draft mode; counts an edit; Compare opens the trunk dialog; Merge promotes; Exit leaves; survives a remount | acceptance committed 09-21 before the draft engine was bound to the board → L-FILES |
| `corner.smoke.test.tsx` | narrow (720×900) — the bottom-right cluster over its limit | acceptance committed before the layout; 28 px over → G-STALE |
| `menus.smoke.test.tsx:130` | View ▸ Zoom to 100% …; Preferences ▸ always-snap …; Export … | acceptance for Export rows; times out at 30 s → L-FILES |
| `menus.smoke.test.tsx:80` | the burger order | stale: `Open bbox-ui.com` / `Open Storybook` rows landed 09-22 on his ask → G-STALE |

## storybook-basics (`pnpm exec vitest run`)

Health run: **1 failed / 3,676** (`DraftBar.stories.tsx:185`, `toHaveFocus`).
Simulated stack: 4 failed / 3,811, a different set. Re-running only the four
files on every intermediate commit of the stack gave a **different failing
subset each time**, including passes on the stack tip's own parent:

| commit | failed |
|---|---|
| main `705847c` | 0 / 13 |
| + rename-and-dead-actions | 0 / 13 |
| + dead-settings | 0 / 13 |
| + file-navigator-fixes | DevPanel "Callbacks Carry The Row Id" (1 / 17) |
| + (channels — since archived) | DevPanel "Interactions" (1 / 17) |
| + truthful-branch-viz | DevPanel, FileNavigatorGeometry (2 / 17) |
| + toolbar-redesign | 0 / 17 |
| + docs/report branches | FileNavigatorGeometry, FitToContentHosts ×2 (3 / 17) |

Flaky under load, not merge damage → G-FLAKE: `DraftBar.stories.tsx`,
`DevPanel.stories.tsx`, `FileNavigatorGeometry.stories.tsx`,
`FitToContentHosts.stories.tsx`, `BlockPortHosts.stories.tsx`.

## The simulated stack

`git merge-tree --write-tree` + `git commit-tree` (objects only, no ref moved),
in W1's order: rename-and-dead-actions → dead-settings → file-navigator-fixes →
whiteboard-channels → truthful-branch-viz → toolbar-redesign →
visual-language-reports-moc → visual-lang-design-issues →
python-syntax-visualization → library-vs-host-rule. **Zero conflicts.**
`host-less-shell-2026-09-19` conflicts in `.gitignore` and
`apps/storybook-basics/src/engineFree.test.ts`; `review-boards-2026-09-19` in
seven files including `.claude/feedback.md` and `apps/systemsketch/src/main.tsx`.

## Peers

No worktree has a modification newer than 2026-09-23. The
`merge-ready-integrator-2c63dc` worktree holds an uncommitted merge of
`1f9fd45` (already on main) — 155 files, dead since 2026-09-22 12:57.
