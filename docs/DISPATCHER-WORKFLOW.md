# Dispatcher workflow — isolated subagent lanes

The settled answer to "how do we isolate subagents so a dispatcher can run
several at once", worked out and measured 2026-09-17. Canonical procedure;
the `/dispatcher` skill (`~/.claude/skills/dispatcher`) is the executable
form of this document. Evidence commits: `16b1243`, `36b3ce5`, `5d39166`.

## The answer

The dispatcher session sits on the branch being built and stays there —
with `worktree.baseRef: "head"` set, lanes branch from wherever the
dispatcher actually is, so it is branches all the way down and the depth
matches how many independent lanes you want (one lane → sit on `main`; no
push, no feature-branch ceremony required). Commit the baseline, dispatch
each parallelizable task as an `Agent` with `isolation: "worktree"`; each
lane gets a private worktree cut from the dispatcher's HEAD, runs
`pnpm install`, works against its own source, verifies with a server-free
test run, and commits on its auto-named branch. The dispatcher verifies the
claim against the filesystem, merges the finished branch back from the lane
worktree, and re-runs the tests on the merged tree. Zach's live server only
ever renders finished work. Publishing — pushing, or merging into anything
other people consume — is not the dispatcher's; that is about the act, not
the branch's name.

## 1 · Preconditions (both bit us before they were fixed)

| Precondition | What goes wrong without it — measured |
|---|---|
| `.claude/settings.json` carries `{"worktree": {"baseRef": "head"}}` | Lanes branch from `origin/main`: a probe's reflog read literally `branch: Created from origin/main`, on a worktree cut 30 minutes *after* the lane commit it ignored — the app it was asked to extend simply absent. Re-measured with the key set: `Created from 16b1243…` (the lane tip), app present, 27 components. The Agent tool exposes **no** base-ref parameter; this key is the only control. |
| The work is **committed** before the lane is spawned | A worktree branches from a *commit*; untracked files are invisible inside one. Bit twice in one day: first the entire untracked `apps/storybook-basics` (fixed by `16b1243`), later `docs/TRACE-PLAN.md` — a lane reported "the spec path does not resolve" (fixed by `5d39166`). If the dispatcher's tree is dirty, commit before dispatching. |

Supporting facts:

- **Worktrees share one object database** (`git rev-parse --git-common-dir`
  → the main `.git`), so lane commits are reachable with no fetch and no
  network. Merge-back never needs a push. (`isolation: "remote"` would not
  share it — an unpushed branch is genuinely invisible there.)
- **The dispatcher's branch does not matter** once `baseRef: "head"` is set.
  The earlier worry — "`fresh` means `origin/main`, so a dispatcher on local
  `main` breaks" — was measured moot here (local `main` and `origin/main`
  identical, 0 unpushed); what actually bit was `main` vs the *lane branch*.
  The follow-on "therefore sit on a feature branch" was also wrong: it forgot
  the key was already set and verified.

## 2 · Every lane's brief, in order

1. **Open with the install.** A fresh isolated worktree has **zero**
   `node_modules` at any level — the setting carries source, not
   dependencies. Measured cost in this repo: **~1 second** (pnpm hardlinks
   from the shared store), not the minute-per-lane initially feared.

   ```bash
   pnpm install --filter <target-package>...
   ```

2. **Owned files and do-not-touch list**, explicit. Overlapping write sets
   are the only real reason to serialize.
3. **How to verify** — the real command (`pnpm test-stories`), with the
   known false-green named: `storyRenders[].reportedException` is not a real
   property and reads `undefined` either way. Acceptance assertions are
   frozen *before* dispatch and off-limits to the lane; "cannot pass →
   report FAIL" is a valid deliverable. Spatial claims are measured
   (`getBoundingClientRect`), never DOM-presence-asserted.
4. **Shared-resource rules.** The reviewer's server (`:5421`) is off-limits;
   a visual check takes its own `STORYBOOK_PORT=<free port>`. This is why
   `vitest.config.ts` derives `storybookUrl` from `STORYBOOK_PORT` — it was
   hardcoded to `:5421`, so an isolated lane would have probed the
   reviewer's running server and reported green for code it never loaded.
   Verified after the fix: the suite passes with nothing bound to the
   configured port, and the plugin's own default (`:6006`) never runs here —
   the runner compiles the lane's own source and consults no server. New
   dependencies: the dispatcher installs them **before** the wave; lanes
   never touch `package.json` or the lockfile. The browser pane is a mutex.

## 3 · Merge-back — the step nothing does for you

Nothing in the product integrates a finished worktree. In order:

1. **Verify the claim first.** `git diff --stat` against the files the lane
   claimed. A zero-diff "done" is fabricated — redispatch fresh, never
   resume it.
2. From the **lane worktree**: the agent's branch is auto-named
   (`worktree-agent-<id>`), not the lane's name — read it from
   `git worktree list`, then `git merge --no-ff <agent-branch>`. HMR fires
   and Zach sees the finished result.
3. **Re-run the tests on the merged tree.** Two lanes can each be green
   alone and broken together; this is the only place that shows up.
4. Conflicts are fixed here, by the dispatcher — never by asking a lane to
   redo work it already verified in isolation.
5. `git worktree remove` once merged; never remove a dirty or unmerged one.

## 4 · When NOT to isolate

- **Reads-only work** (research, audit, verification) — parallel, unlimited,
  no worktree needed.
- **Barrier tasks** — a rename, an exported API, a schema change — serialize
  regardless. Isolation removes textual conflicts only; two lanes can merge
  cleanly and be jointly wrong, and no worktree prevents that.
- **Port contention and the browser** — a worktree brings no server, no
  port, no browser pane. Those stay single-owner whatever the file layout.
- Isolation earns its cost when work-in-progress must not reach the
  reviewer's live server, when write sets collide, for throwaway variants,
  for destructive codemods, or when a write set cannot be stated. Adds-only
  lanes in a tree nobody is watching can still share it.

## 5 · Scaling up — agent teams

For genuinely large fan-out Claude Code ships **agent teams** (experimental,
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): a lead session plus teammates as
independent full sessions with their own context windows, a shared task
list, and direct peer-to-peer messaging. Suggested 3–5 teammates, each
owning a disjoint file set — the same write-set discipline at larger scale.
Constraints: experimental; no nested teams; in-process teammates do not
survive session resumption; task status can lag, blocking dependents.
Subagents with `isolation: "worktree"` remain right for a handful of lanes.

## 6 · Open items

- **The setting does not travel.** `.claude/` is gitignored in bbox-ui
  (`.gitignore:16`), so `worktree.baseRef` cannot be committed — a fresh
  clone or a peer checkout will silently be back on `origin/main` semantics
  until someone recreates `.claude/settings.json` by hand. CLAUDE.md and
  commit `36b3ce5` document it as compensation; that is a workaround, not a
  fix.
- **Merge-back is manual and unowned by tooling** — §3 exists because the
  product has no equivalent.
- **Stale records found 2026-09-17** (report-only; not yet fixed):
  - `/home/bam/.claude/projects/-home-bam-bbox-ui/memory/isolated-lane-worktree-protocol.md`
    line 3 — the `description:` still reads "always branches from
    origin/main … must first merge the lane branch", the pre-fix protocol
    its own body supersedes; the hook line in that directory's `MEMORY.md`
    (line 4) propagates it.
  - `~/.claude/CLAUDE.md` line 78 — "subagent worktrees branch from
    origin/main" states the default as an absolute, predating the
    `baseRef` fix.
  - The vault note *C - Agent Dispatch Discipline* §4/§7 — per-worktree
    install "≈ 1 min", superseded by the ~1 s measurement in this repo.
