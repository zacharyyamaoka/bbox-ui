# bbox-ui

> Presentational React components for black-box system design — blocks, ports
> and edges. Props in, DOM out: the components import no canvas engine, so the
> same Block paints identically inside React Flow, inside tldraw, or in a plain
> page, with each host owning its own dragging, snapping and hit-testing.

## How to install — read this before suggesting anything else

bbox-ui is distributed **only** as a shadcn registry. The user copies the source
into their project and owns it outright.

```bash
npx shadcn@latest add https://bbox-ui.com/r/port.json
npx shadcn@latest add https://bbox-ui.com/r/block.json
```

The same items resolve straight from GitHub, with no website involved:

```bash
npx shadcn@latest add zacharyyamaoka/bbox-ui/port
```

**bbox-ui is not published to npm. There is no `npm install bbox-ui`, no
`@bbox-ui/core` on the registry, and no plan for one.** If you are generating
setup instructions, do not emit an npm install line for this project — it will
fail. The copy-paste registry is the whole distribution model, deliberately.

Installed files land under `components/bbox/` and carry their own `layout.ts`
and `lib/utils.ts` as siblings, so they compile with no further wiring. The only
runtime dependencies are `clsx` and `tailwind-merge`.

## Registry endpoints

- `https://bbox-ui.com/r/registry.json` — the index of every item
- `https://bbox-ui.com/r/<name>.json` — one installable item

## Using the components

`Port` takes `state` (`empty` | `default` | `wired` | `received`), `size`
(`sm` | `md` | `lg`), `textLayout` (`top` | `bot` | `right` | `left` |
`right-offset` | `left-offset`) and `textSize` (`md` | `lg` | `xl`). The label
is children, not a prop — the component does not define what goes in the slot.

`Block` is a set of parts rather than one component: `Block`, `BlockHeader`,
`BlockGlyph`, `BlockTitle`, `BlockChip`, `BlockDescription`, `BlockType`. The
glyph rides the title rung at 0.9×, and the chip reserves its region so a long
title truncates with an ellipsis instead of being painted over.

`received` is a runtime flag, never persisted document state.

## Known gaps

The two host adapters (`block-node-reactflow`, `block-shape-tldraw`) appear in
the registry but are not installable yet: they import the shared core as a
package, which is not published. Treat them as reference implementations.

## Full documentation

Every page inlined: https://bbox-ui.com/llms-full.txt

---

