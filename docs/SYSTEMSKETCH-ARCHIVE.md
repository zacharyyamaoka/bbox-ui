# SYSTEMSKETCH-ARCHIVE — `/home/bam/systemsketch` is frozen; here is what moved where

`/home/bam/systemsketch` is no longer where SystemSketch is built. Zach's ASK of
2026-09-18 (item 2, `docs/ASK-2026-09-18-CONTROL-FLOW-AND-SYSTEMSKETCH-REBUILD.md:23-37`)
settled it in his own words: *"Honestly I actually don't consider this a refactor.
Lets archive this old system sketch. still keep the source code there in case we
want to run it, etc. but now lets start again from scratch."* The rebuild is
`apps/systemsketch` in this repo — plain stock tldraw plus the bbox-ui trunk, so
that "systemsketch will just be bbox-ui + tldraw stock" is a checkable property
rather than an aspiration. This file is the map between the two trees: it exists
because the archive's vendored `src/bboxUi/` copy provably diverged from the trunk
(`ARCHITECTURE.md:24-107` measures 20 commits of its own fixes on 2026-09-15 that
live in no bbox-ui lineage), and a frozen tree with no map is a tree people
silently re-fork.

---

## Running the archive

It still runs, unchanged. Two release channels, both already built; Preview is a
release channel, not a git branch.

```bash
cd ~/systemsketch && npm run dev
```

| | port | what it is |
|---|---|---|
| Stable | 4321 | the immutable build Zach trusts |
| Preview | 4322 | the candidate he is judging — `npm run dev` serves here |
| Preview API | 4323 | the Python host behind it |

`npm run dev` is pinned with `--strictPort`, and **Zach usually has
Stable + Preview already running**. Check `ss -ltnp | grep 432` before assuming a
port is yours; if you need a second server, override `SYSTEMSKETCH_DEV_PORT` /
`SYSTEMSKETCH_API_PORT` rather than killing his. Verbatim from
`/home/bam/systemsketch/CLAUDE.md:21-37`.

The rebuild serves on **4340** (`pnpm --filter systemsketch dev`), deliberately
clear of 4321/4322/4323 so both trees can run at once.

---

## What moved where

Archive paths are relative to `/home/bam/systemsketch`; bbox-ui paths are relative
to `/home/bam/bbox-ui`. A cell marked *planned — L0*, *planned — L3* and so on does
not exist on this branch yet; that lane of `docs/SYSTEMSKETCH-REBUILD-PLAN.md`
creates it.

| Archive path | Status | Where it lives now (bbox-ui) | Notes |
|---|---|---|---|
| `src/bboxUi/core/` | SUPERSEDED | `apps/storybook-basics/src/components/` (the trunk) | The vendored snapshot diverged (`ARCHITECTURE.md:24-107`). The trunk wins the design; nothing is ported back out of the archive. |
| `src/bboxUi/adapter/block-shape-util.tsx`, `src/bboxUi/adapter/port-shape-util.tsx` | SUPERSEDED | `apps/systemsketch/src/shapes/block/` (planned — L0), `apps/systemsketch/src/shapes/port/` (planned — L2) | Same seam, rewritten against `apps/storybook-basics/src/hosts/tldrawHost.tsx` as the donor pattern rather than copied. |
| `src/bboxUi/adapter/glyph-shape-util.tsx` | ARCHIVE ONLY | — | Glyph needs `@bbox-ui/glyph-content`, which is `private: true` and unpublished. Follow-up (plan §11). |
| `src/toolbar/SystemSketchToolbar.tsx`, `src/toolbar/toolbarModel.ts` | PORTED | `apps/storybook-basics/src/components/toolDock.tsx`, `apps/storybook-basics/src/components/toolPreferences.ts`; wired in `apps/systemsketch/src/chrome/dock.tsx` (planned — L0) | Two family slots collapse to **one** system slot — the ASK's "get rid of both of those and instead lets just have the 1 icon". Elbow stays the routing datum (`src/toolbar/toolbarModel.ts:38-46`). |
| `src/chrome/TitleBar.tsx` | PORTED | `apps/storybook-basics/src/components/chromeBar.tsx` | One `MenuSpec` list feeds both the burger dropdown and the context menu, as it did here. |
| `src/chrome/SelectionContextualMenu.tsx` | PORTED (shell + placement) | `apps/storybook-basics/src/components/floatingToolbar.tsx`, `apps/storybook-basics/src/components/floatingToolbar.placement.ts` | Shell and placement travel; the archive's per-shape control contents do not — they are re-derived per shape kind. |
| `src/chrome/BoardOverview.tsx` | PORTED | `apps/storybook-basics/src/components/framesPanel.tsx` | Clicking a row selects and zooms via stock `editor.zoomToBounds`. |
| `src/diagnostics/BoardDiagnosticsPanel.tsx` | PORTED | `apps/storybook-basics/src/components/problemsPanel.tsx` | Problems stay **derived**, never stored — computed over the projected scene, not a second model. |
| `src/contextualMenus/` | PORTED | `apps/storybook-basics/src/components/controlRegistry.ts`, `apps/storybook-basics/src/components/controlStrip.tsx`, `apps/storybook-basics/src/components/controlPanel.tsx` | The registry-of-controls idea survives; the archive's tldraw-coupled surface registry does not travel (host-owned by the engine-free rule). |
| `src/blocks/connections/` (`ConnectionShapeUtil.tsx`, `ConnectionBindingUtil.ts`, `blockPorts.ts`) | REBUILT | `apps/systemsketch/src/shapes/wire/` (planned — L3) | `ss-wire` + `ss-wire-binding` over stock bindings; painted with `apps/storybook-basics/src/components/trace.tsx`. Dot positions come from measured anchors, not the archive's closed form. |
| `src/blocks/ui/OnCanvasBlockPicker.tsx` | PORTED | `apps/storybook-basics/src/editor/edgeDropMenu.tsx` | An entry the judge refuses is never rendered. |
| `src/blocks/definitions/definitionLinking.ts` | PORTED (not wired) | `apps/storybook-basics/src/scene/linking.ts` | Exists in the trunk; **not yet wired into the app** — follow-up (plan §11). |
| `src/loop/`, `src/branch/` | REBUILT | `apps/systemsketch/src/shapes/region/` (planned — L5) | Corner-block design per `/home/bam/zach_brain/Pasted image 20260918150916.png`: the region's header contract IS a real `ss-block` child, not ports on the region. |
| `src/code/CodeShapeUtil.tsx`, `src/code/codeClickToEdit.ts` | REBUILT | `apps/systemsketch/src/shapes/code/` (planned — L1) + `apps/storybook-basics/src/components/codeEditor.tsx` | Second click / double-click enters the **same** document (`src/code/codeClickToEdit.ts:23-29`); the 10px grab ring still moves the shape. |
| `src/workspace/` (`src/workspace/systemSketchFile.ts`, Python host, autosave) | NOT PORTED | — | Phase 1 is a whiteboard: stock `persistenceKey` + plain `.tldr`. The `.systemsketch` envelope and its host are a follow-up (plan §8.3, §11). |
| `src/drafts/`, `src/compare/` | ARCHIVE ONLY | — | Draft hold and the compare dialog have no phase-1 consumer. |
| `src/releaseClient.ts`, `src/releaseModel.ts`, `src/releaseRefresh.ts` | ARCHIVE ONLY | — | Stable/Preview channels are the archive's deployment story, not the rebuild's. |
| `vscode-systemsketch/` | ARCHIVE ONLY | — | The IDE plugins live in the archive (`/home/bam/systemsketch/CLAUDE.md:51-75`) and still ship a *build* of the archive app. Untouched. |
| `src/table/`, `src/behaviorTree/`, `src/callout/`, `src/icon/`, `src/asyncRegion/` | ARCHIVE ONLY | — | Later primitives, none of them phase 1. Each needs a design Zach has not re-seen. |
| `src/excalidrawInterop.ts` | ARCHIVE ONLY | — | Paste interop; no phase-1 consumer. |

Archive boards are **not** openable in the new app — the shape vocabulary is
different on purpose (`ss-*`). A one-way importer is a follow-up, not built
(plan §8.4). That is the honest cost of "start again from scratch", and it is why
the archive stays runnable instead of being deleted.

---

## Behaviours the rebuild keeps, and where each is asserted

| Behaviour | Asserted by |
|---|---|
| tldraw stays stock — `5.3.2` pinned, everything added through supported component / shape / tool / binding / mount seams (`/home/bam/systemsketch/CLAUDE.md:9-16`; the archive's own `tests/test_stock_boundary.py`) | `apps/systemsketch/src/document/stockBoundary.test.ts` |
| The view / scene / editor kits import no canvas engine — only `apps/systemsketch/**` and the trunk's `hosts/` may touch tldraw | `apps/storybook-basics/src/engineFree.test.ts` |
| The document model — the tldraw store IS the document; shape props are the persisted state, so `.tldr` round-trips with no backend | `apps/systemsketch/src/document/documentModel.test.ts` |
| Containment is never an edge, and a wire binding refuses a region — control flow reads from structure, never from a cable | `apps/systemsketch/src/document/documentModel.test.ts`, `apps/systemsketch/src/document/editEvents.test.ts` |

---

## The banner

**Banner for /home/bam/systemsketch/README.md**

```markdown
> **ARCHIVED 2026-09-18** — this app is frozen; it still runs (`cd ~/systemsketch && npm run dev`, Preview on :4322) but no new work lands here.
> The rebuild is `/home/bam/bbox-ui/apps/systemsketch` ("bbox-ui + stock tldraw"); the map of what moved where is `/home/bam/bbox-ui/docs/SYSTEMSKETCH-ARCHIVE.md`.
```

Those two lines go at the top of `/home/bam/systemsketch/README.md`, directly
under its `# SystemSketch` heading. **The dispatcher applies them — never an agent
writing into the archive.** The archive is read-only to every lane of this
rebuild by rule (`docs/SYSTEMSKETCH-REBUILD-PLAN.md` §5, §10), and the one edit
it will ever receive from this work is a two-line banner applied deliberately, by
hand, after the rebuild is real.
