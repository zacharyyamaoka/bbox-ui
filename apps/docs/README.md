# @bbox-ui/docs

The public site for bbox-ui — **bbox-ui.com**. Fumadocs + Next.js, statically
exported (`output: "export"`), deployed to Cloudflare Pages.

```bash
pnpm docs:dev      # http://localhost:4100
pnpm docs:build    # -> apps/docs/out/
```

## Where things live

| You want to change | Edit |
|---|---|
| Site name, tagline, nav, GitHub link | `src/lib/config.ts` |
| The logo mark | `src/components/icons.tsx` (`Icons.logo`) |
| The landing page | `src/app/(home)/page.tsx` |
| A component's catalog page | `content/docs/components/<name>.mdx` |
| A live demo rendered by `<ComponentPreview>` | `src/registry/new-york-v4/examples/<name>.tsx` |
| Which demos exist | `src/registry/registry-examples.ts` |

## Adding a component page

Three edits, no site code:

1. Write the demo in `src/registry/new-york-v4/examples/<name>-demo.tsx`,
   importing from `@bbox-ui/core` so it can never drift from the component.
2. Register it in `src/registry/registry-examples.ts`.
3. Write `content/docs/components/<name>.mdx`. Copy `port.mdx` — it is the
   canonical shape: hero preview, install tabs, features, usage, examples,
   props table.

The sidebar, the catalog list, search, OG images and `llms.txt` pick it up on
their own. `<ComponentSource src="../../packages/bbox-ui/src/<name>.tsx" />`
reads the real source at build time, so the code block cannot go stale.

## Reference sites — study these before inventing anything

This site is deliberately unoriginal. When you are unsure how something should
look or behave, copy one of these rather than designing it fresh.

| Site | Use it for | Source |
|---|---|---|
| **Kibo UI** — kibo-ui.com | The canonical component page: hero preview, Preview/Code tabs, install command, features, then per-variant examples. Our `port.mdx` follows its shape. | `shadcnblocks/kibo`, MIT, `apps/docs` |
| **ReUI** — reui.io | Landing-page craft, and a clean branding seam (`lib/config.ts` + an isolated `logo.tsx`). | `keenthemes/reui`, MIT |
| **React Flow UI** — reactflow.dev/ui | The canvas-component pattern: it does **not** inline canvas previews, it iframes a separate app on its own subdomain. Do the same for anything hosting tldraw or React Flow. | Closed source — imitate, cannot copy |
| **shadcn/ui** — ui.shadcn.com | The registry contract itself (`registry.json`, `shadcn build`, `/r/*.json`). | `shadcn-ui/ui`, MIT, `apps/v4` |
| **Fumadocs** — fumadocs.dev | The framework under this app. Check its docs before hand-rolling a docs feature. | `fuma-nama/fumadocs`, MIT |

Two rules that came out of studying them:

- **Kibo's Preview/Code tabs are hand-rolled app code, not a stock Fumadocs
  feature** — about 90 lines of Server Component that `readFile`s the example
  and the real package source. Ours is the template's equivalent. Do not go
  looking for a Fumadocs component that does it.
- **Canvas components get an iframe, not an inline preview.** tldraw and
  `@xyflow/react` ship global CSS that will fight the docs page. React Flow UI
  learned this; we inherit the lesson for free.
