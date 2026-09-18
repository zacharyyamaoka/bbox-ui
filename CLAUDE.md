# bbox-ui — working notes for agents

@.claude/feedback.md

Presentational components for black-box system design: blocks, ports, edges.
Copy-paste components people own, not a library they depend on.

`README.md` describes the components and `ARCHITECTURE.md` the core/adapter
split — read those for *what* things are. This file carries what only matters
when you are **changing** the repo.

## The one rule the design rests on

**The core imports no canvas engine.** `packages/bbox-ui` is props in, DOM out —
zero imports of tldraw, zero of React Flow, no pointer listeners, no
self-measurement, no z-index. Layout geometry is portable and lives in the core;
interaction geometry (hit-testing, snapping, drag, z-order) is host-owned and
never travels.

An adapter may import the core and its own engine — never the other engine,
never the other adapter. That rule is what keeps a third host a ~150-line
afternoon instead of a fork.

## The trunk is `apps/storybook-basics`

Full context and the verified evidence: `ARCHITECTURE.md`, "The trunk — one
canonical lineage, three consumers." The checkable version:

- **New design work happens in `apps/storybook-basics/src/components/`.**
  Not `packages/bbox-ui`, not `systemsketch/src/bboxUi/`.
- **`packages/bbox-ui` is frozen v1.** Keep publishing it as-is; never edit
  it to chase a trunk change. Regenerating it from the trunk is its own
  project (P7-class work), not a drive-by fix.
- **`systemsketch/src/bboxUi/` is a vendored consumer, not a co-author.** A
  fix made there gets a `// owed upstream: <what>` comment; it does not
  silently become the trunk's behavior just because it shipped first.
- **Same component in two places, disagreeing → the trunk wins.** Port the
  trunk's version forward. Never average the two, and never keep both "for
  now" — that is exactly how the vendored copy above started to diverge.

## The registry is the product

**There is exactly one distribution channel, and npm is not it.** Every
`packages/*` is `private: true` on purpose. Never add an `npm install` line for
bbox-ui to docs, llms.txt, or a component page — it would be a lie. If
publishing ever becomes the right call it is Zach's decision, not a convenience
fix for the adapters.

`registry.json` at the root is how people consume this. `npx shadcn@latest add
zacharyyamaoka/bbox-ui/port` works today with no website at all — shadcn takes a
GitHub repo as a registry directly.

**`shadcn add` copies source verbatim.** It rewrites only the `@/` alias prefix
against the consumer's `components.json`. It never rewrites relative specifiers,
because it cannot know where one was meant to point after `target:` remapping.

So every file a component imports relatively must land as its **sibling**. That
is why `port` and `block` each ship `layout.ts` and `lib/utils.ts` targeted into
`components/bbox/`. Change a `target:` and you can silently break the install
while every build stays green.

**The sibling rule depends on which relative path the source actually
wrote, not just which folder it's in.** `packages/bbox-ui/src/port.tsx`
imports `./lib/utils` (utils nested one level *below* the component), so its
registry item can flatten straight into `components/bbox/` and target
`lib/utils.ts` at `components/bbox/lib/utils.ts` — that keeps `./lib/utils`
resolving. The trunk (`apps/storybook-basics/src/`) is laid out differently:
`components/` and `lib/` are **siblings**, so every trunk component imports
`../lib/utils` (up-and-over, not down-and-in). Flattening `components/*` into
`components/bbox/*` moves every file down one level, so `lib/utils.ts` has to
land at `components/lib/utils.ts` — a sibling of `bbox/`, *not* nested inside
it — for `../lib/utils` to still resolve after the move. Landing it at
`components/bbox/lib/utils.ts` instead (right for `packages/bbox-ui`, wrong
here) is the exact "build stays green, install breaks" trap this section
already warned about: it shipped that way once, `npx shadcn@latest build`
exited 0, and a throwaway `tsc` caught it as `TS2307` on all twelve trunk
files that import `cn` — the check below is what caught it, not the build.

After editing `registry.json`:

```bash
npx shadcn@latest build
```

Then **install it into a throwaway project and type-check it**. `npx shadcn add`
exiting 0 proves nothing — this repo already shipped a registry that installed
cleanly and then failed to compile.

**The two adapters cannot be installed by anyone.** `block-node-reactflow` and
`block-shape-tldraw` import `@bbox-ui/core`, which is `private: true` and
unpublished. Retargeting cannot fix it — shadcn copies source verbatim, so the
import has to already say something a consumer can resolve.

With npm ruled out, the only remaining fix is a **source change**: have the
adapters import the copied siblings (`./block`) rather than the workspace
package, and declare `block` as a `registryDependency` so it lands beside them.
That needs the repo to resolve the same specifier, so it is real work, not a
registry.json tweak. Until then they are reference implementations, and the docs
say so. Do not paper over it.

**Sixteen items now publish the trunk directly** (`badge`, `bar`, `text`,
`editable-text`, `folding-chevron`, `block-card`, `port-dot`, `code-editor`,
`labeled-port`, `port-edge`, `block-port`, `trace`, `trace-badge`,
`trace-editor`, `trace-tidy`, `wire-layer`) — sourced from
`apps/storybook-basics/src/`, each self-contained the same way `port`/`block`
are (no `registryDependencies` between bbox items; a shared file like
`elbow/*` or `lib/utils.ts` is simply re-listed, with its own `target`, by
every item that needs it).

**Naming principle (Zach, 2026-09-17): bbox-ui's own names are descriptive
and precise; shorthand belongs to the consumer.** SystemSketch calls its
primitive a "port" and has no reason to know it's assembled from several
bbox-ui components — that shorthand is SystemSketch's to use, not ours to
bake into the registry. `block-card`/`port-dot` replace this pass's original
`block-v2`/`port-v2` names, which encoded history (a naming collision with
the v1 lineage below) instead of what the items are. `port.tsx` is the dot
alone — geometry, no label, no slot — and the code already names it that way
(`data-slot="port-dot"`, `portDotClass`); `labeled-port`/`port-edge` are what
add the label and the rail around it. `block.tsx` is header/body/footer
chrome painted with shadcn's own `bg-card`/`text-card-foreground` tokens and
its own doc comment calls it "a card with a header, a body, a footer" —
`block-card` names that directly, and `block-port` is the wrapper that mounts
ports on its walls.

`port`/`block` (no suffix) stay exactly as they are on purpose — still
pointing at the frozen `packages/bbox-ui` lineage. Renaming them would
silently break `apps/docs`'s live preview (which still imports
`@bbox-ui/core`) against its own install tab. The short names sitting on the
legacy lineage rather than the descriptive trunk items is deliberate and
self-correcting — it resolves itself the day `apps/docs` migrates to the
trunk, not something to "fix" by renaming `port`/`block` now.

Two things the reset shipped are deliberately **not** registry items:
- **`glyph.tsx`** — imports `@bbox-ui/glyph-content`, `private: true` and
  unpublished, the same blocker class as the two adapters above. Fixing it
  needs the same source change (copy the package's ~110 lines as a sibling)
  and is out of scope here for the same reason.
- **`button`, `toggle`, `dropdown-menu`, `tooltip`, `collapsible`** — each
  file says so in its own header comment: copied verbatim from
  `apps/docs/src/registry/new-york-v4/ui/*` (or, for `toggle`,
  `packages/inspector`), the stock shadcn `new-york` / Base UI primitives,
  vendored only so this app's own demo stories have controls to put inside a
  `Bar`. None of the reset's own design work lives in them. A consumer that
  wants them gets them from the stock shadcn registry
  (`npx shadcn add button`, etc.), not from bbox-ui.

## Storybook is opt-in, not default

`apps/storybook` (`bbox-storybook`, a T0 spike: one story rendered across three
hosts — plain DOM, a React Flow node, a tldraw shape) and
`packages/schema/src/storybook.ts` exist and work, but Zach isn't using them
much right now. Don't add or update stories, touch `.storybook/`, wire a new
component into Storybook, or run `storybook` / `build-storybook` as part of
routine work on this repo — only touch this surface when he explicitly asks
for Storybook work.

## Verifying story play functions — never trust `storyRenders`

`window.__STORYBOOK_PREVIEW__.storyRenders[0].reportedException` is **not a
real property** — it reads `undefined` whether or not the play function
threw, so `phase === "finished" && !reportedException` always looks green.
Two stories silently failed for hours behind that check (2026-09-17). In
`apps/storybook-basics`, run `pnpm test-stories` instead — it runs every
story as a real Vitest/Playwright test via `@storybook/addon-vitest`, with a
real process exit code. See `apps/storybook-basics/vitest.config.ts`.

## Isolated agent lanes — the two lines every one of them needs

Zach reviews a long-running Storybook on **:5421**. A work-in-progress edit
made directly in his worktree breaks the thing he is watching, so
implementation agents get `isolation: "worktree"` and merge back when done.

**`.claude/settings.json` must carry `{"worktree": {"baseRef": "head"}}`.**
Without it worktrees branch from `origin/main` and an isolated agent asked to
extend `apps/storybook-basics` finds no such directory — measured 2026-09-17,
the reflog reading literally `branch: Created from origin/main` on a worktree
cut 30 minutes *after* the lane commit it ignored. With it, re-measured on the
same day: `branch: Created from 16b1243…`, the lane tip, `apps/` containing
`storybook-basics`, 27 components present. The Agent tool has no base-ref
parameter; this setting is the only control.

Note the lane branch itself is not checked out — the worktree gets an
auto-named branch pointing at the same commit. That is fine for working and
merging back; it just means `git rev-parse --abbrev-ref HEAD` will not say
the lane's name.

**`pnpm install` is still required.** A fresh isolated worktree has **zero**
`node_modules` at any level — the setting carries source, not dependencies.
That install is the real per-lane cost; disk is nearly free because pnpm
hardlinks into a shared store.

```bash
pnpm install --filter <target-package>...
```

**Verification does not need a server.** `pnpm test-stories` compiles the
lane's own source through Vitest's Vite pipeline; it does not fetch stories
from `storybookUrl` (the plugin's own default is `:6006`, which never runs
here, and the suite passes with nothing bound to the configured port). So a
lane's tests test the lane's code, and :5421 is never consulted. For a
*visual* check a lane may start its own Storybook — set `STORYBOOK_PORT` to a
free port so it cannot collide with Zach's.

**Merging back** is the dispatcher's job, from the lane worktree, after the
lane's tests pass: `git merge <agent-branch>`. Vite HMR then shows Zach
finished work, and only finished work. Landing on `main` remains a separate
decision that is his, not the dispatcher's.

## The website — apps/docs

`apps/docs` is bbox-ui.com. Fumadocs + Next, statically exported, deployed to a
Cloudflare **Worker** (not Pages) on push to `main`.

Deliberately unoriginal. Its whole job is to make the install command obvious
and show each component working. Not a place to be creative.

### Never push without preflight

```bash
pnpm preflight          # before pushing
pnpm preflight --live   # after deploying
```

It runs the exact sequence Cloudflare runs, in order, failing the same way.
**Cloudflare posts no commit status and no check-run back to GitHub** —
verified, `check-runs.total_count` is 0 — so there is nothing to poll and no log
to read from here. Local reproduction is the only feedback loop that exists.

`--live` asserts on the response **body, never the status code**. An
unconfigured Worker answers `200 Hello world` on *every* path, including paths
that cannot exist. That is exactly how the first deploy looked healthy while
serving the default scaffold.

### Adding a component page

Three edits, no site code. The sidebar, catalog list, search, OG images and
`llms.txt` follow the page tree on their own.

1. `apps/docs/src/registry/new-york-v4/examples/<name>-demo.tsx` — the live
   demo. Import from `@bbox-ui/core`; never copy component source into a demo.
2. `apps/docs/src/registry/registry-examples.ts` — register it.
3. `apps/docs/content/docs/components/<name>.mdx` — copy `port.mdx`, the
   canonical shape: hero preview → install tabs → features → usage → examples →
   props table.

Use `<ComponentSource src="../../packages/bbox-ui/src/<name>.tsx" />` rather
than pasting code; it reads the real file at build time and cannot go stale.

The example path prefix `src/registry/new-york-v4/` is hardcoded in
`apps/docs/src/scripts/build-registry.mts`. Demos must live there despite the
name meaning nothing here.

| Change | File |
|---|---|
| Site name, tagline, nav, links | `apps/docs/src/lib/config.ts` |
| Logo mark | `apps/docs/src/components/icons.tsx` (`Icons.logo`) |
| Landing page | `apps/docs/src/app/(home)/page.tsx` |
| Cache / CORS headers | `apps/docs/public/_headers` |
| Deploy target, assets dir | `wrangler.jsonc` |

### Reference sites — copy these, do not invent

| Site | Take from it |
|---|---|
| [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) · `shadcnblocks/kibo` (MIT) | The component-page shape. `port.mdx` follows it. |
| [ReUI](https://reui.io) · `keenthemes/reui` (MIT) | Landing-page craft, clean branding seams. |
| [React Flow UI](https://reactflow.dev/ui) (closed source) | The canvas rule below. Imitate; it cannot be copied. |
| [shadcn/ui](https://ui.shadcn.com) · `shadcn-ui/ui` (MIT, `apps/v4`) | The registry contract. |
| [Fumadocs](https://fumadocs.dev) (MIT) | The framework. Check its docs before hand-rolling a docs feature. |

Kibo's Preview/Code tabs are **hand-rolled app code**, ~90 lines of Server
Component — not a stock Fumadocs feature. Do not hunt for a built-in.

## Traps that have already cost time here

- **Tailwind v4 only scans the app's own sources.** A utility used *only* by a
  sibling workspace package is never generated — `border-foreground` on an empty
  `Port` rendered invisible. `apps/docs/src/app/global.css` carries an `@source`
  for `packages/bbox-ui/src`. A new source directory needs its own.
- **Canvas components get an iframe, not an inline preview.** `tldraw` and
  `@xyflow/react` ship global CSS that fights the docs page. React Flow UI
  iframes a separate app on its own subdomain; do the same.
- **tldraw cannot go on a public page without a licence key.** Its licence
  forbids production use, enforced mechanically with a watermark and a render
  cutoff. Localhost is carved out forever, and the MIT adapter is fine because
  it only peer-deps. `@xyflow/react` is plain MIT — lead public canvas surfaces
  with React Flow.
- **Do not pin the build to a Node version.** The build image resolved Node 24
  while `.node-version` asked for 22. Node strips TypeScript by default from
  22.18 onward, so the build uses plain `node` with no flag and survives either.

## Several agent sessions edit this tree at once

Peers write here in real time — `packages/inspector` especially. This is the
normal case, not an edge case.

- Never `git add -A`. Stage explicit pathspecs and read
  `git diff --cached --name-only` before every commit.
- `ls --time-style=full-iso` a file before rewriting it. A recent mtime means a
  peer is mid-run; leave it, or make a surgical exact-match edit that fails
  loudly rather than a rewrite.
- Never `pkill -f` a pattern that matches your own command line — it kills the
  shell running it, and your cwd silently resets. This has happened twice.
- **Implementing is not integrating.** Commit to a branch and report. Do not
  merge to `main`, push, or deploy unless Zach asks in those words.

@.claude/feedback.md
