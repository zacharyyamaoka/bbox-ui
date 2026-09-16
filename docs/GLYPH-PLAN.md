# Glyph finish-line plan (2026-09-11)

Source of truth for the `claude/glyph-finish` lane. Mirrors the AI comment in the vault note `PROJECT - Black Box UI.md` (marker `ai-comment:bbox-ui-glyph-finish-plan-2026-09-11`). Zach's rulings: size default `sm`, rotation is a host fact, uploads are data URLs, x-box for Block's glyph slot too, single click opens, one lazy Lucide chunk.

**Headline:** the primitive is done, the picker exists twice (a Storybook toy here, the full Notion clone in SystemSketch), and nothing on `/create` is clickable, resizable or rotatable because every non-Port instance rides a generic 180×80 bench node. The finish line is not "more Glyph" — it is giving Glyph what Port has (a `bbox-glyph` shape util, a `bboxGlyph` node) and routing the three renders through them. Nothing below is built; branch `claude/create-page` is untouched.

### Where it actually stands — measured in the tree, not from memory

| Piece | State | Where |
|---|---|---|
| Glyph primitive | **Shipped.** `size` sm/md/lg/xl = 18/24/36/44 px, `padding` 0–24, `children` text with the documented "🔍" placeholder deviation. Inert slot by design (T1-SPEC §4.1). On the `/create` bench with 3 seeds. | `claude/create-page` · `packages/bbox-ui/src/glyph.{tsx,fields.ts,layout.ts}` |
| Click → picker | **Prototype, Storybook only.** ~100 curated icons, Icons/Emoji tabs, filter, Radix popover, one play-function test. Never wired to the create page; no canvas trigger. | `claude/glyph-picker-demo` — one commit `cf8cf47` off `50f1fcd`, touches only `apps/storybook/` |
| Full Notion picker | **Exists, in the wrong repo.** 856-line `BlockIconPicker.tsx` + all of Lucide (1,818 icons, tag search, 637 KB lazy JSON) + 1,914 emoji (269 KB) + paste/drop/URL upload with 256 px downscale + windowed grid + tests. Only two tldraw imports (portal container, asset store) — portable. | [BlockIconPicker.tsx](obsidian://external-file?mount=home&path=systemsketch%2Fsrc%2Fblocks%2Fui%2FiconPicker%2FBlockIconPicker.tsx&view=source) · [iconRef.ts](obsidian://external-file?mount=home&path=systemsketch%2Fsrc%2Fblocks%2Fui%2FiconPicker%2FiconRef.ts&view=source) · [uploadIcon.ts](obsidian://external-file?mount=home&path=systemsketch%2Fsrc%2Fblocks%2Fui%2FiconPicker%2FuploadIcon.ts&view=source) |
| `/create` canvases | **Generic.** Every non-Port instance is a fixed 180×80 `bbox-bench` shape / `bench` node, `canResize()` false, no rotation, no size — the selection box lies about a 44 px glyph. Position is the only host fact the page owns. | `apps/docs/src/components/create/viewport/{tldraw-canvas,reactflow-canvas,dom-preview}.tsx` |
| Inspector | **One section.** No idea of a renderer-owned row; position is deliberately kept out of props (`contract.ts`). Tier rule, Mixed, provenance and clear all live in `@bbox-ui/panel` and are reusable. | `packages/panel/src/{fieldModel,fieldTiers}.ts` |
| Detach | **Exists for Block and Port**, not Glyph. Block's glyph slot detaches to a *text* shape holding the icon string — fine for "◆", but once content can be a Lucide name it would print "rocket" as words. No x-box anywhere. | `packages/adapter-tldraw/src/detach/blockPrimitives.ts:98` |
| Journeys | **None committed for `/create`.** A grep for the 4100 port hits only `package.json`; only the Python report builder is in the tree. The Sep 11 note's "three journeys ported to the site" is not something I can find or run. | `docs/build_create_page.py` |
| Popover stack | The site is **Base UI** (`@base-ui/react`, shadcn v4), not Radix — SystemSketch's picker cannot be pasted; the positioner-owns-the-z-index trap from the inspector lab applies. | `apps/docs/package.json` |

### The contract — this is the part that is yours

**Props — one flat space, per [[appearance-is-just-properties]]:**

| name | type | default | control | who else writes it |
|---|---|---|---|---|
| `content` | `string` encoded like SystemSketch's iconRef: `""` · `lucide:<name>` · `emoji:<char>` · `data:image/…` · `text:<chars>` | `""` — empty renders the dashed square, Notion's "add icon" affordance (kills the "🔍" deviation) | **new `FieldKind: "glyph"`** — the inspector row *is* the picker trigger | the picker, from any of its three triggers |
| `sizePreset` | `sm · md · lg · xl` (the preset selector) | `sm` — your table says small; today it is `xl` | segments | — |
| `size` | `number` px, min 8, max 512 | 18, *driven by* `sm` | number; reads "driven by Small" or "custom · ↺" exactly as the trace UI already does | tldraw's resize handle · React Flow's `NodeResizer` |
| `padding` | `number` px ≥ 0 | 0 | number | — |

`GLYPH_PRESETS` becomes four entries, `selector: "sizePreset"`, each `governs: ["size"]` — the three-layer cascade you already settled ([[bbox-ui-three-layer-cascade]]), so a handle-drag writes a `size` override and the panel explains it with no new UI. Size is the one property both you and the board edit; your DP table says exactly that.

**Not props — host facts, one bag per instance beside `positions`:** `x`, `y`, `rotation` (degrees). `w`/`h` are derived = `size + 2·padding`, shown read-only. This is your "Board control: position, rotation" row, kept out of the component's state vector on purpose, same reason position already is.

**Inspector — two sections, one engine:**
- **Properties** — the existing panel over `GLYPH_FIELDS`. Governed and overridden rows already say who won.
- **Renderer · tldraw / React Flow / DOM** — a second `FieldSpec[]` (`HOST_FIELDS`: x, y, rotation, w, h) read through the same `readFieldRow`, so Mixed, clear and provenance come free. Each row carries who writes it ("tldraw writes this when you drag / rotate"). Editable on every render because the page owns the value; on DOM the section says there are no handles here. This is your "props we can really edit, and the ones the renderer is editing" — literally two headers.

**Click behaviour:** single click on the glyph opens the picker in all three renders (Notion). A drag still moves — both canvases suppress `click` after the drag threshold — and the journey asserts that, not the prose. The click also selects, so the inspector follows.

**Glyph Menu = one component, three triggers:** the on-canvas glyph (DOM / React Flow / tldraw), the inspector's `glyph` row, and later `BlockGlyph` inside a Block header. Your Sep 11 quote asked to unify — this is the unification: there is one `GlyphPicker`, and the demo branch's private copy is retired.

### Stock parts, element by element

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Size via drag, tldraw | not possible (`canResize` false) | `ShapeUtil.onResize` → `resizeBox`, `isAspectRatioLocked` → `true` | square stays square; the handle writes `size`, never `w`/`h` |
| Size via drag, React Flow | not possible | `NodeResizer` from `@xyflow/react` with `keepAspectRatio`, `minWidth` | same `size` override, same panel row |
| Rotation, tldraw | none | stock rotate handle → `shape.rotation` | syncs to the page's `rotation`; the inspector row turns the shape |
| Rotation, React Flow / DOM | none | none stock (xyflow has only a d3-drag example) → inspector row + CSS `rotate` on the node | same number everywhere; switching render never changes the picture |
| Picker surface | Radix `Popover` (demo branch) | `@base-ui/react` `Popover` via the vendored shadcn `popover.tsx` | Notion chrome, filter focus on open, Esc closes |
| Icon search | `name.includes(query)` over ~100 | Lucide's own `tags.json` (14,885 keywords) — SystemSketch's `lucideLibrary.ts`, one lazy JSON chunk | "search" finds `magnifying-glass`; 1,818 icons paint in one frame via the windowed grid |
| Emoji | 60 hand-listed | SystemSketch's `emojiLibrary.ts` (1,914, Notion order) | Emoji tab, no search yet |
| Upload | none | SystemSketch's `uploadIcon.ts` (paste · drop · URL, 256 px downscale) | Ctrl+V a screenshot onto the open picker |
| Detach placeholder | text shape of the icon string | tldraw geo `x-box`, `w = h = size` (no padding), `meta.bboxUi` for rebuild | round-trips through the existing `detachRoundTrip` test |
| Mixed / provenance / clear | — | `readFieldRow`, `FieldTraceRow`, `MIXED` | **unchanged (stock seam)** |
| Glyph core slot | inert `<span>` slot | **unchanged (stock seam)** — resolution of `content` stays in the picker package, core only gains the `content` prop and a resolver context | zero deps in core, per your dependency-free-core rule |

### Phases — each is one lane, each ends green

1. **Prep** (dispatcher, small). Cut `claude/glyph-finish` from `claude/create-page` tip `185f786`. Write and commit the missing `/create` CDP journey for what exists today (three renders, selection round-trip) so phase 5 extends a baseline instead of inventing one. Retire the demo branch's picker; keep its play-function story as the Storybook acceptance pattern.
2. **Contract** (reasoner, then `pnpm test`). `FieldKind` gains `"glyph"`; `packages/glyph-content` (zero deps): encode/decode/`same` for `content`, mutation-tested; `glyph.fields.ts` v2 with `sizePreset` selector + governed `size` + `padding` + `content`; `GLYPH_PRESETS` four entries with closed `governs`; `HOST_FIELDS`. Fields test pins defaults = component defaults, as `port.fields.test.ts` does.
3. **Picker package** (builder). `packages/glyph-picker` = SystemSketch's `iconPicker/` ported: the two tldraw hooks become props (`portalContainer`, `onUpload`), Radix → Base UI popover, panel palette tokens instead of SystemSketch CSS. Storybook story with the click→pick play function. Uploads stored as a data URL in `content` — one representation for three renders, no tldraw asset record (D3).
4. **Adapters** (two builders in parallel, disjoint files). `packages/adapter-tldraw`: `bbox-glyph` shape util — geometry = footprint, `onResize` writes `size`, `isAspectRatioLocked`, rotation stock, `getIndicatorPath` square, `glyphDetachable` → x-box + rebuild. `packages/adapter-reactflow`: `bboxGlyph` node with `NodeResizer keepAspectRatio`, CSS rotate from data. Both render the same `GlyphPicker`-wrapped `Glyph`.
5. **Create page** (builder). Canvases route Glyph to its adapters the way Port already is; two-way prop sync (resize → `size` override, rotate → host `rotation`, inspector → shape); `transforms` state beside `positions`; the Renderer section; the `glyph` row; DOM render wraps in the picker; Code view prints the real `bbox-glyph` shape / `bboxGlyph` node instead of the generic bench.
6. **Proof** (journey + auditor on a different model + judge loop). Report by `docs/build_create_glyph.py` → `reports/media/create-glyph-<date>.html` with a hero video of click → pick → resize → rotate in each render.

### Definition of done — one journey, asserted in the real page, all three renders

- click the glyph → picker opens; filter "rocket" → pick → the glyph shows it **in this render and in the other two after switching**; Emoji tab pick; Ctrl+V a PNG → the glyph shows the image ≤ 256 px
- drag the glyph → it moves, the picker did **not** open
- tldraw: drag a corner handle → `size` row reads "custom · 52 px", DOM render shows a 52 px glyph; drag the rotate handle → the Renderer row reads the angle, React Flow's node is rotated the same
- type a rotation in the inspector → the tldraw shape turns
- clear the `size` override → back to "driven by Small", the shape snaps to 18 px
- detach → one geo `x-box`, `w = h = size`, no padding, rebuild restores the glyph
- Code view prints `<Glyph content="lucide:rocket" size={52} />` and the real adapter node/shape records
- `pnpm test` green: fields defaults, content encode/decode, presets' `governs` closed and non-overlapping, detach round trip

### Decisions — each with the default I take if you say nothing

- **D1 · size default `sm`** (your table) vs today's `xl`. Default: `sm`.
- **D2 · rotation is a host fact**, not a Glyph property; DOM applies it too so tabs agree. Default: yes.
- **D3 · uploads are a data URL in `content`**, ≤ 256 px, no tldraw asset record. Default: yes; SystemSketch's `assetId` trap only returns if we ever register assets.
- **D4 · x-box replaces the text shape for Block's glyph slot too**, not only standalone Glyph. Default: yes — a text shape cannot stand in for a Lucide icon once Block's glyph can hold one.
- **D5 · single click opens the picker on canvases** (Notion) vs open-only-when-already-selected (Figma). Default: single click.
- **D6 · full Lucide via one lazy JSON chunk** (SystemSketch's proven path) vs `lucide-react/dynamic`, which emits 1,818 chunk files. Default: one chunk.

### What I did not do

- Did not build any of it, touch `claude/create-page`, or rebase `claude/glyph-picker-demo` — you asked for a plan. Say "go" and phase 1 starts on `claude/glyph-finish`.
- Did not reconcile T1-SPEC §4.1's "content resolution is not a prop" with your DP table; the table wins (your spec, AI's spec), and the split above — `content` prop in core, resolution in the picker package — keeps both honest.
- Did not put a copy of this plan in the repo; the create-page worktree belongs to a live lane. It lands as `docs/GLYPH-PLAN.md` in phase 1.

Related: [[bbox-ui-create-page]] · [[bbox-ui-three-layer-cascade]] · [[appearance-is-just-properties]] · [[feedback_stock_part_mapping_table]] · [[feedback_verify_ui_in_real_app]] · [[C - Progressive Disclosure]]
