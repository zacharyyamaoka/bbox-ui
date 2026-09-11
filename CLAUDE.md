# bbox-ui — working notes for agents

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

## The registry is the product

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

After editing `registry.json`:

```bash
npx shadcn@latest build
```

Then **install it into a throwaway project and type-check it**. `npx shadcn add`
exiting 0 proves nothing — this repo already shipped a registry that installed
cleanly and then failed to compile.

**The two adapters cannot be installed by anyone.** `block-node-reactflow` and
`block-shape-tldraw` import `@bbox-ui/core`, which is `private: true` and has
never been published. Retargeting cannot fix it; it needs the package on npm or
a source change. That is Zach's call — do not paper over it.

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
