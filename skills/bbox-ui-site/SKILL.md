---
name: bbox-ui-site
description: Build, verify and ship bbox-ui.com — the apps/docs Fumadocs site, its component catalog pages, and the shadcn registry it serves. Use when adding or changing a component's catalog page, editing the landing page, touching registry.json or the registry payloads, or deploying to Cloudflare. Covers the preflight gate that replaces reading dashboard logs.
---

# bbox-ui.com

`apps/docs` is the public site. Fumadocs + Next, statically exported, deployed
to a Cloudflare **Worker** (not Pages) on push to `main`.

The site is deliberately unoriginal. Its whole job is to make
`npx shadcn@latest add https://bbox-ui.com/r/<name>.json` obvious and to show
each component working. Nothing here is a place to be creative.

## The gate: never push without preflight

```bash
cd /home/bam/bbox-ui && pnpm preflight
```

This runs the exact sequence Cloudflare runs, in order, failing the same way.
**Cloudflare posts no commit status and no check-run back to GitHub** — verified,
`check-runs.total_count` is 0 — so there is nothing to poll and no log to read
from here. Local reproduction is the only feedback loop that exists. Both early
deploys failed for reasons preflight catches in seconds.

After a deploy:

```bash
cd /home/bam/bbox-ui && pnpm preflight --live
```

**It asserts on the response body, never the status code.** An unconfigured
Worker answers `200 Hello world` on *every* path, including paths that cannot
exist. A 200 is not evidence the site works. The live check requires
`/r/port.json` to carry the real payload *and* an unknown path to 404.

## Adding a component to the catalog

Three edits. No site code changes — the sidebar, catalog list, search, OG images
and `llms.txt` all follow the page tree on their own.

1. `apps/docs/src/registry/new-york-v4/examples/<name>-demo.tsx` — the live demo.
   Import from `@bbox-ui/core`. Never copy component source into the demo; a
   second copy is a second thing to keep in sync.
2. `apps/docs/src/registry/registry-examples.ts` — register the demo so
   `<ComponentPreview name="<name>-demo" />` resolves.
3. `apps/docs/content/docs/components/<name>.mdx` — copy `port.mdx`. It is the
   canonical shape: hero preview → install tabs → features → usage → examples →
   props table.

`<ComponentSource src="../../packages/bbox-ui/src/<name>.tsx" />` reads the real
file at build time, so the code block cannot go stale. Use it rather than pasting.

### The prefix is hardcoded

The build script prefixes every example path with
`src/registry/new-york-v4/`. Demos must live there even though the name is
meaningless for this project. Renaming it means editing
`apps/docs/src/scripts/build-registry.mts`.

## Where things live

| Change | File |
|---|---|
| Site name, tagline, nav, GitHub link | `apps/docs/src/lib/config.ts` |
| Logo mark | `apps/docs/src/components/icons.tsx` (`Icons.logo`) |
| Landing page | `apps/docs/src/app/(home)/page.tsx` |
| Cache/CORS headers | `apps/docs/public/_headers` |
| Deploy target, assets dir | `wrangler.jsonc` |
| What the registry ships | `registry.json` (repo root) |

## Registry rules — these are correctness, not style

**`shadcn add` copies source verbatim.** It rewrites only the `@/` alias prefix
against the consumer's `components.json`. It never rewrites relative specifiers,
because it cannot know where one was meant to point after `target:` remapping.

So every file a component imports relatively must land as its **sibling**. That
is why `port` and `block` each ship `layout.ts` and `lib/utils.ts` targeted into
`components/bbox/`. Change a `target:` and you can silently break the install
while the build stays green.

After editing `registry.json`, rebuild the payloads and prove the result:

```bash
cd /home/bam/bbox-ui && npx shadcn@latest build
```

Then actually install into a throwaway project and type-check it. A registry
that installs but does not compile is the exact bug this repo already shipped
once; `npx shadcn add` exiting 0 proves nothing.

**The two adapters cannot be installed by anyone.** `block-node-reactflow` and
`block-shape-tldraw` import `@bbox-ui/core`, which is `private: true` and has
never been published. Retargeting cannot fix it — it needs the package on npm or
a source change, and that is Zach's call. Do not paper over it.

## Reference sites — copy these, do not invent

| Site | Take from it |
|---|---|
| [Kibo UI](https://www.kibo-ui.com/components/avatar-stack) · `shadcnblocks/kibo` (MIT) | The component-page shape. `port.mdx` follows it. |
| [ReUI](https://reui.io) · `keenthemes/reui` (MIT) | Landing-page craft, clean branding seams. |
| [React Flow UI](https://reactflow.dev/ui) (closed source) | The canvas rule below. Imitate; the site cannot be copied. |
| [shadcn/ui](https://ui.shadcn.com) · `shadcn-ui/ui` (MIT, `apps/v4`) | The registry contract. |
| [Fumadocs](https://fumadocs.dev) (MIT) | The framework. Check its docs before hand-rolling a docs feature. |

Kibo's Preview/Code tabs are **hand-rolled app code**, about 90 lines of Server
Component — not a stock Fumadocs feature. Do not go hunting for a built-in.

## Traps that have already cost time here

- **Tailwind v4 only scans this app's own sources.** A utility used *only* by a
  sibling workspace package is never generated — `border-foreground` on an empty
  `Port` rendered invisible. `apps/docs/src/app/global.css` carries an `@source`
  for `packages/bbox-ui/src`. Any new source directory needs its own.
- **Canvas components get an iframe, not an inline preview.** `tldraw` and
  `@xyflow/react` ship global CSS that fights the docs page. React Flow UI
  iframes a separate app on its own subdomain; do the same.
- **tldraw cannot go on a public page without a licence key.** Its licence
  forbids production use, enforced mechanically with a watermark and a render
  cutoff. Localhost is carved out forever, and the MIT adapter is fine because it
  only peer-deps. `@xyflow/react` is plain MIT — lead public canvas surfaces with
  React Flow.
- **Do not pin the build to a Node version.** The build image resolved Node 24
  while `.node-version` asked for 22. Node strips TypeScript by default from
  22.18 onward, so the build uses plain `node` with no flag and survives either.

## Repo etiquette

Peers edit this tree at once, `packages/inspector` especially.

- Never `git add -A`. Stage explicit pathspecs and read
  `git diff --cached --name-only` before committing.
- `ls --time-style=full-iso` a file before rewriting it. Recent mtime means a
  peer is mid-run; leave it alone.
- Never `pkill -f` a pattern that matches your own command line. It kills the
  shell running it. This has happened twice.
- **Implementing is not integrating.** Commit to a branch and report. Do not
  merge to `main`, push, or deploy unless Zach asks in those words.
