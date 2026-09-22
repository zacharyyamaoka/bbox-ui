# Feedback ledger

Ratings Zach has given on work done in this repo. Loaded into every session here
via the `@.claude/feedback.md` line in `CLAUDE.md`. Newest first. This is a live
rule set, not an archive — prune superseded entries, consolidate past ~60 lines.
The full replay record lives in the vault; these entries must stand alone.

- **2026-09-20 · Bad · hand over the board as a LINK, not a file chooser** — A
  generated review board is handed over as a URL that opens it, never as "start
  the server, then ☰ › File › Open and pick this path". Zach: *"you should make
  it so I can open this file directly. I was able to do this is system sketch. I
  think perhaps it had like a URI or something?"* The app takes
  `?board=<absolute path>`. The **`=`** must stay literal and the link must
  **never** be wrapped in a markdown `[text](url)`, because a chat client
  rewrites `?board=` to `?board%3D…`, mangling the key. (The `/` in the value
  may be `%2F` — `URLSearchParams.set` always escapes it and both forms parse
  the same; an earlier version of this entry claimed otherwise.) Hand over the
  bare URL or a code span. The Open-it board row is therefore: one fence with the
  server command, and the `?board=` URL in a code span beneath it. The archived
  app is the reference — `/home/bam/systemsketch/src/workspace/workspaceModel.ts:157`
  builds the link, `LocalWorkspace.tsx:367` reads it. Before building any of
  this, `git grep` the branches: `?board=` already had three implementations.
  Generating the board and then making him navigate to it gives back the exact
  saving the board existed to create.
  <sub>rate note: `rate - Sep 20 2026, 12.34.03AM.md` · [open](obsidian://advanced-uri?vault=zach_brain&filepath=Settings%2FFeedback%2Frate%2Frate%20-%20Sep%2020%202026%2C%2012.34.03AM.md&openmode=true)</sub>

- **2026-09-19 · Direction · chrome lives in the editor components** — Zach:
  *"all of the feedback regarding the chrome should be made in bbox-ui
  editor-components, not in system sketch, system sketch should just be kinda
  like importing these stock menus and doing a light bit of configuration."*
  So a change to how a menu, toolbar, dock, panel or status cluster LOOKS or
  BEHAVES lands in the trunk (`apps/storybook-basics/src/editor/*` — since
  2026-09-22 the menu kit lives there too, on his word that menus, bars,
  panels and dialogs "should belong in editor") with a story, and
  `apps/systemsketch` only mounts, positions and wires it (tldraw seams, the
  licence, which part goes in which slot). A chrome fix made only inside the
  app is a divergence the next host inherits nothing from.
  <sub>source: `Projects/SystemSketch/PROJECT - System Sketch.md`, "More feedback", 2026-09-19</sub>

- **2026-09-17 · Bad ×3 same day (consolidated) · reports** — Any substantive
  review, proposal set, research answer, or implementation writeup ships as a
  **rich-media self-contained HTML report** — never a markdown file, never a
  chat table, and never an append into an existing note — whatever verb the
  ask used and wherever the text physically lands. The trigger is the
  artifact, not the phrasing or the write path: if Zach will review and
  decide from it, it is a visual deliverable. **A proposal for something that
  doesn't exist yet owes a rendered MOCK**, precisely because there's nothing
  to screenshot yet. Three mechanical gates, because remembering the rule
  alone failed three times in one day:
  1. **A subagent brief that produces a document for Zach names the HTML
     report as the deliverable, not the `.md`.** State both: the `.md` is
     the lane-readable input (isolated worktrees read plans from a commit),
     the report is what he reads.
  2. **A `docs/*.md` is NOT relayable until a report exists.** If the
     sentence being typed is "here is the plan, committed at `<sha>`" and no
     `file://` follows, stop and build the report first.
  3. **Appending an `[!ai]-` reply — or any content — into an EXISTING note
     is not exempt either.** "I'm just replying inline" reads as low-stakes
     and skips the trigger entirely, but a comparison table, a research
     synthesis, or a proposal is the same deliverable whether it lands in a
     new file, a subagent's return value, or an append to a thread that's
     been running for months.
  In this repo: build with a script in `docs/`, write to
  `/home/bam/bbox-ui/reports/` (or `reports/media/` if it inlines captures),
  render headlessly, `Read` the PNG, verify `file://` with `gio info` before
  handoff. Examples: `docs/build_proposals_report.py`,
  `docs/build_jointjs_comparison_report.py`.
  <sub>rate notes: `rate - Sep 17 2026, 5.02.14PM.md`, `rate - Sep 17 2026,
  6.11.40PM.md`, `rate - Sep 17 2026, 7.15.43PM.md` · full rule is GLOBAL, in
  the vault's `Settings/Memory/feedback_show_dont_tell.md` and its
  `MEMORY.md` hook</sub>

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
