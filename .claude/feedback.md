# Feedback ledger

Ratings Zach has given on work done in this repo. Loaded into every session here
via the `@.claude/feedback.md` line in `CLAUDE.md`. Newest first. This is a live
rule set, not an archive — prune superseded entries, consolidate past ~60 lines.
The full replay record lives in the vault; these entries must stand alone.

- **2026-09-17 · VERY BAD · reports (repeat, 1h later)** — Two mechanical gates,
  because remembering the rule below was not enough: it was encoded and then
  violated an hour later in the same session. **(1) A subagent brief that
  produces a document for Zach names the HTML report as the deliverable, not the
  `.md`** — state both; the `.md` is the lane-readable input (isolated worktrees
  read plans from a commit), the report is what he reads. **(2) A `docs/*.md` is
  NOT relayable to him until a report exists** — if you are about to type "here
  is the plan, N lines, committed at `<sha>`" and no `file://` follows, stop and
  build the report. The failure point is not the handoff, it is the brief: for
  delegated work the output format is chosen long before the handoff rule fires.
  <sub>rate note: `rate - Sep 17 2026, 6.11.40PM.md` · builders: `docs/build_remaining_report.py`, `docs/capture_storybook_shots.mjs`</sub>

- **2026-09-17 · Bad · reports** — Any substantive review, proposal set, research
  answer or implementation writeup ships as a **rich-media self-contained HTML
  report**, not a markdown file and not a chat table — whatever verb the ask used.
  The trigger is the artifact, not the phrasing: if Zach will review and decide
  from it, it is a visual deliverable. **A proposal for something that does not
  exist yet owes a rendered MOCK of the proposed UI**, precisely because there is
  nothing to screenshot. A committed `.md` plan is a different artifact (input for
  subagent lanes) and does not discharge this. In this repo: build it with a
  script in `docs/`, capture stories with `docs/capture_storybook_shots.mjs`
  (Playwright against each story's `iframe.html?id=…`, so no sidebar chrome lands
  in frame), write to `/home/bam/bbox-ui/reports/` by absolute path, render it
  headlessly and look at it, then verify the `file://` with `gio info` before
  handing it over. Captures inline as base64, so such a page belongs in the
  gitignored `reports/media/` half. Example: `docs/build_proposals_report.py`.
  <sub>rate note: `rate - Sep 17 2026, 5.02.14PM.md` · full rule is GLOBAL, in the vault's `Settings/Memory/feedback_show_dont_tell.md` and its `MEMORY.md` hook</sub>

- **2026-09-17 · Direction · algorithm provenance** — Every file implementing real
  math cites where it came from. Porting is fine, writing our own is fine;
  shipping either unattributed is not. Zach: *"If we are writing ourself thats ok,
  but like you should be referencing the specific source code lines you are
  reading for the math, etc. we wanted references for all of these algorithms."*
  A citation must point at a file that exists on disk (donor repo + line range) or
  a source actually fetched and quotable — **never from memory**. A plausible
  paper title nobody opened is worse than an honest "ours, ad hoc", because it
  survives review. See `docs/ALGORITHM-PROVENANCE.md` for the per-file
  classification. Note `elbow/nudge.ts:63-68`: libavoid and its TS port are LGPL,
  so they are deliberately NOT read — the rule was derived from geometry and
  checked against EPL/MIT implementations instead.

- **2026-09-17 · Bad · /merge-ready integrator reporting** — The `# MERGED ONTO MAIN — NO
  FURTHER WORK REQUIRED` headline goes in the **source session only**, never in the
  integrator's own chat: its job is to make it obvious, while triaging other sessions,
  that *that* session's work landed and it can be closed. The integrator's own chat
  instead reports a **table** of queue state (Candidate | Branch | Status | Merge) ending
  in a one-line tally `N ready · N claimed · N merged · N superseded`; on a quiet tick the
  tally alone is the whole report. Full rule lives in the `merge-ready` skill
  (`Settings/Skills/merge-ready/SKILL.md`, "What the integrator's OWN chat reports").
  <sub>rate note: `rate - Sep 17 2026, 7.05.58PM.md` · [open](obsidian://advanced-uri?vault=zach_brain&filepath=Settings%2FFeedback%2Frate%2Frate%20-%20Sep%2017%202026%2C%207.05.58PM.md&openmode=true)</sub>
