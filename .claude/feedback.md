# Feedback ledger

Ratings Zach has given on work done in this repo. Loaded into every session here
via the `@.claude/feedback.md` line in `CLAUDE.md`. Newest first. This is a live
rule set, not an archive — prune superseded entries, consolidate past ~60 lines.
The full replay record lives in the vault; these entries must stand alone.

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
