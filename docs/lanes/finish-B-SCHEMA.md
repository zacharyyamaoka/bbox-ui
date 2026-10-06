# Lane finish:B-SCHEMA: shape schema v2, every new prop in ONE migration

_Plan: `docs/finish-2026-09-29/WORK-ORDER.md` + `lanes.json` (lane `B-SCHEMA`, wave W2; `lanes.json` wins over prose) · repo: **bbox-ui** · branch target: `claude/finish-2026-09-29` (never main) · BASE `75991ce` · depends on: G-FLAKE (queued at dispatch), G-STALE (merged `74c79c1`) · model: opus · size L · **barrier: yes.** It merges alone, and after it the schema is frozen._

Acceptance author: Claude Opus 5.5, 2026-10-06, in an isolated worktree cut at BASE.
`APP` = `apps/systemsketch`, `TRUNK` = `apps/storybook-basics/src`.

**Read first:** `docs/finish-2026-09-29/schema-inventory.md`. It names every prop,
its type, its default, the item that needs it and the lane that reads it, plus
what was deliberately left out and why. This brief is the build order. The
inventory is the contract, and the tests below pin it.

## What is true on BASE (measured 2026-10-06, not inherited)

- Sequences today: `ss-block` 4, `ss-port` 2, `ss-wire` 2, `ss-code` 0 (an empty,
  declared sequence), `ss-region` 0 (the same).
- **Widening the app's `BlockView` with `"value"` breaks `tsc` in exactly three
  places.** The trunk's `BlockView` (`TRUNK/components/blockPort.layout.ts:45`) has
  three values. The places are `APP/src/shapes/block/BlockFace.tsx:712`,
  `APP/src/document/sceneFromStore.ts:107` and `APP/src/shapes/wire/dropMenu.tsx:93`.
  This was measured by applying a throwaway reference implementation and running
  `tsc -p apps/systemsketch/tsconfig.json`. No other prop added here breaks `tsc`
  anywhere, because rail-port options are a block-level map. `PortSpecV` and every
  port literal in the app stay as they are.
- **One existing test pinned "no `ss-code` migration"**:
  `APP/src/source/originResolution.test.ts` asserted `sequence` `toEqual([])`. Its
  own comment says "a future hand that adds a sequence entry has to come back here
  and say why". The acceptance commit amended it to say why: `ss-code/1` exists, and
  it leaves `origin` byte-identical.
- **No other test pins a whole props bag.** The reference run checked
  `diffMarkMigration`, `portDeclarationMigration` and every other unit file: 366/366
  green. These smoke files were green against the reference too: `viewHotkeys`,
  `diffMark`, `code`, `port`, `tunnel`, `edgeDropCatalog` (27/27).
- **The acceptance is satisfiable, proven before commit.** The throwaway reference
  implementation turned every acceptance test below green: unit 366/366, `tsc`
  clean, and the pixel gate 1/1 (zero differing pixels, and v2 reached). It was then
  removed. `git status` before the acceptance commit showed only the acceptance
  files.

## Item table

`lanes.json` gives B-SCHEMA `items: []` and `clusters: []`. Its work is the
STORAGE half of other lanes' items, named in its `extra`. Every id is re-verified
against BASE. **build** = B-SCHEMA adds the stored state, and the feature itself
stays with the lane named in the inventory. **follow-up** = not built here; the
inventory gives the reason.

| id | status | stored as (BASE has none of these; `BlockShapeUtil.tsx:47-107`, `WireShapeUtil.tsx:47-101`, `PortShapeUtil.tsx:66-75`, `CodeShapeUtil.tsx:72-78`, `RegionShapeUtil.tsx:92-99`) |
|---|---|---|
| P-059 | build | `ss-block.view` += `"value"` |
| P-015, P-212 | build | `ss-block.viewSizes` |
| P-141 | build | `ss-block.sizeMode` |
| P-166 | follow-up | no state: Fit-to-content is a COMMAND (Q-P166), owned by L-BLOCK-VIEWS |
| P-107 | build | `ss-block.portLayout` |
| P-118 | build | `ss-block.rails[side].mode` + `.freeOffsets` |
| P-134 | build | `ss-block.functionPort` |
| P-133 | build | `ss-block.showHeader` / `showHeaderDivider` / `showFooter` / `showFooterDivider` |
| P-130 | build | `ss-block.showCard` |
| P-177 | build (size + font) | `ss-block.titleSizePx`, `titleFont`. align, bold and colour are follow-up (inventory §3) |
| P-188, P-226 | build | `membersLayout`, `memberInset`, `memberWidth`, `memberGap`, `memberGutter`, `insetBackground`, `expandedWeights`, `blockType` |
| P-074, P-109 | build | `ss-block.definitionId`, `draftOrdinal`. `definitionKey` is derived, not stored (`TRUNK/scene/linking.ts:52-56`) |
| P-119 | build | `ss-block.portOptions[id].labelOrigin` / `secondaryOrigin`; `ss-port.labelOrigin` / `secondaryOrigin` |
| P-201, P-208 | build | `ss-port.slots` |
| P-194 | follow-up | deferred, inventory §3: two answers to one question with `showHeader` / `showFooter` / `showDescription` / `glyph` |
| P-156, P-171 | build | `ss-wire.label`, `labelFraction` |
| P-096 | build | `ss-wire.startMarker`, `endMarker` |
| P-121 | build | `ss-wire.animated`. "Red" is the existing `color` (done-already) |
| P-137, P-187 (residual) | build | `ss-wire.delayValue` (+ `labelFraction`, `animated`) |
| P-081 (residual) | build | `ss-wire.bend` |
| P-127 | build | `ss-code.lineNumbers`, `fontSizePx` |
| P-183 | build | `ss-region.view` |
| cluster 7 (P-399, P-408) | build | `ss-port.fill`, `hidden`; rail ports `portOptions[id].fill` / `hidden`. A free port's "not selectable" is stock `isLocked` |
| cluster 8 (P-356, P-269, P-358, P-433) | build | `rails[side].enabled` / `spacing`; `portOptions[id].hidden` / `frozen`. P-270 and P-395 are follow-up (inventory §3) |
| cluster 10 P-434 | follow-up | `arc` deferred: no lane this run can draw it, and widening an enum needs no migration |
| cluster 11 P-364 | build | `ss-wire.strokeWidth` |
| cluster 14 P-255 | build | `ss-block.cornerRadius`. P-246 is follow-up (it changes an existing default, not new state) |
| cluster 15 | build | `titleSizePx` / `titleFont` carry its size ladder and typeface vocabulary |
| cluster 18 (P-264, P-278, P-431) | follow-up | block `origin` (per `lanes.json` `deferredOther`), flatten, and the grow-truncated overflow (inventory §3) |
| cluster 20 P-276 | follow-up | saved views are page meta, not a shape prop, and need his yes |
| P-213 | follow-up | `ss-glyph` is L-GLYPH's new shape kind; its sequence starts at 0 |

## Write set (RE-ISSUED against BASE per `rules.writeSets`; the ONLY paths you may create or edit)

- `APP/src/shapes/shared/props.ts`: the new shared validators (slot origin, view
  size, rail, rail-port options, slot member). Nothing existing changes.
- `APP/src/shapes/block/BlockShapeUtil.tsx`: **only** these parts:
  - the `BlockView` type (+ `"value"`)
  - `BlockShapeProps`
  - `static override props`
  - `static override migrations` (APPEND step `/5`; steps `/1`–`/4` are frozen)
  - `getDefaultProps`
  - ONE new exported helper that maps `BlockView` onto the trunk's three views
    (`value` → `port`), with a WHY.

  No method changes: `onResize`, `canResizeChildren` and `canEdit` are
  L-BLOCK-VIEWS'; `onDragShapesIn`/`Out` are L-MEMBERS'.
- `APP/src/shapes/port/PortShapeUtil.tsx`: props interface, `props`, `migrations`
  (append `/3`), `getDefaultProps`.
- `APP/src/shapes/wire/WireShapeUtil.tsx`: props interface, `props`, `migrations`
  (append `/3`), `getDefaultProps`. Leave `routing` as it is, with no `arc`.
- `APP/src/shapes/code/CodeShapeUtil.tsx`: props interface, `props`, `migrations`
  (its first step, `/1`), `getDefaultProps`.
- `APP/src/shapes/region/RegionShapeUtil.tsx`: props interface, `props`,
  `migrations` (its first step, `/1`), `getDefaultProps`.
- **Type plumbing only, one expression plus its import in each:**
  - `APP/src/shapes/block/BlockFace.tsx:712` (`view={…}`)
  - `APP/src/document/sceneFromStore.ts:107` (`view: …`)
  - `APP/src/shapes/wire/dropMenu.tsx:93` (`view: …`)

  Each routes through the helper above. Nothing else in those three files; they
  belong to L-BLOCK-VIEWS / L-PORTS-RAIL / L-MEMBERS, L-LINKING and
  L-WIRE-GESTURE respectively.
- `APP/src/shapes/shared/props.test.ts` (NEW, optional, builder-owned): unit cases
  for the new validators, if you want them.

## Do not touch

- The acceptance files below, including both fixtures: their SHA-256 is pinned.
- Every existing migration step (`ss-block/1`–`/4`, `ss-port/1`–`/2`,
  `ss-wire/1`–`/2`). A shipped migration is frozen (`BlockShapeUtil.tsx`'s `/1`
  WHY).
- Guards that must stay green, never edited:
  - `APP/src/document/diffMarkMigration.test.ts`
  - `APP/src/document/portDeclarationMigration.test.ts`
  - `APP/src/document/stockBoundary.test.ts`
  - `APP/src/review/__fixtures__/**`
  - `APP/review/**`
- `APP/src/shapes/types.ts`, `APP/src/shapes/registry.ts`: L-GLYPH's. No new
  constant lands there; vocabularies live in `shared/props.ts`.
- Every `*Face.tsx`, `measure.ts`, `wireGeometry.ts`, `chrome/**`, `TRUNK/**`
  (except the one line in each of the three plumbing files). **No rendering, no
  control, no command reads a new prop in this lane.** "Props only, no
  behaviour" (`lanes.json`).
- `package.json`, `pnpm-lock.yaml`, `APP/vitest.config.ts`, `APP/vite.config.ts`,
  `APP/src/testing/**`.
- `rules.peerOwned`: `APP/stable-preview.json`, `scripts/launch_systemsketch.py`,
  `scripts/tests/*launch*`, `assets/bbox-ui.desktop`,
  `APP/src/chrome/{sites,legacyApp,siteStatus}.ts`, `APP/devFileHost.ts`,
  `scripts/dock_icon.py`, `scripts/launch_bboxui.py`.
- `docs/finish-2026-09-29/**` (the dispatcher's, the inventory included),
  `/home/bam/systemsketch`, `/home/bam/pyblocks`, `/home/bam/zach_brain`.

## Acceptance (assertions you cannot edit)

From `lanes.json` → B-SCHEMA `acceptance`:

- A legacy `.bbox` saved before v2 (fixture committed first) opens, round-trips,
  and re-saves with only the new defaulted props added.
- `documentModel.test` pins the new defaults exactly.
- A pixel-identical screenshot of a fixture board before and after
  (subtract-the-images, zero diff).
- A WHY comment at each migration naming the P-028 empty-migration incident.

Acceptance files (committed before you existed; read them, never edit them):

- `APP/src/document/fixtures/legacy-v1.bbox`: a board **saved by this app at
  BASE**, through its own `serializeBoard`. It holds every `ss-*` kind:
  - a block in each of today's three views, and a member block inside the
    expanded one
  - a code cell
  - a free port
  - a for-loop and a branch, each with its corner card
  - cables in all three variants: one pinned, one tunnelled on a layer, with diff
    marks and a colour.

  Its SHA-256 is pinned.
- `APP/src/document/fixtures/legacy-v1.png`: that board as BASE painted it,
  opened through File ▸ Open (`loadBoardText`) and clipped to its own bounds. Its
  SHA-256 is pinned. It was captured twice from the same open and the two captures
  subtracted to zero.
- `APP/src/document/schemaV2Migration.test.ts` (unit, node):
  - `B-SCHEMA-fixture`: both fixtures are the committed bytes; the board was saved
    at the pre-v2 sequences, and its census holds.
  - `B-SCHEMA-open`: every `ss-*` shape opens with EXACTLY its saved props plus the
    v2 defaults; every other document record is byte-identical; nothing new
    appears.
  - `B-SCHEMA-resave`: the re-saved file declares `ss-*` at 5/3/3/1/1 with every
    other sequence unchanged; each record is itself plus the v2 defaults, and the
    added key set is exactly the v2 list; the re-saved file re-opens unchanged.
  - `B-SCHEMA-fill`: a pre-v2 board that already carries some v2 props keeps them
    (`??=`, never `=`) and gets the rest.
  - `B-SCHEMA-why`: each kind's v2 step is its LAST step at the expected version.
    Its source text, parsed with the TypeScript compiler (so the comment may sit
    above the step or inside it, but a neighbour's comment cannot answer for it),
    names `P-028`.
- `APP/src/document/schemaV2Pixels.smoke.test.tsx` (real headless Chromium):
  - `B-SCHEMA-pixels`: the legacy board, opened through `loadBoardText`, is
    clipped to its bounds. Before capturing, the test checks with
    `getBoundingClientRect` that no chrome overlaps the clip. The capture is
    subtracted byte for byte from `legacy-v1.png` and must give **0** differing
    pixels. Then the store's schema must be at the v2 sequences.
  - The `capture` block is gated by `VITE_BSCHEMA_CAPTURE=1` and is **never yours
    to run**.
- `APP/src/document/documentModel.test.ts` (amended): exact `toEqual` default bags
  for all five kinds.
  - The fully-populated cases carry every v2 prop at a NON-default value, so a
    value must survive a round trip, not just a default. They include a port whose
    default slot member was deleted and whose label slot holds three child shapes.
  - Each closed vocabulary has an accept-then-refuse case.
- `APP/src/source/originResolution.test.ts` (amended): `ss-code`'s sequence is
  exactly `["com.tldraw.shape.ss-code/1"]`, and that step leaves a saved `origin`
  byte-identical.

### Red now, for the right reason (BASE `75991ce`, 2026-10-06)

- `cd apps/systemsketch && pnpm exec vitest --project=unit run` →
  **18 failed / 348 passed** (34 files, 3 failed). The 18 are exactly the
  acceptance above, and every one fails because the v2 props or steps do not
  exist:
  - `documentModel` ×13: the default bags lack the v2 keys
    (`expected {…(7)} to deeply equal {…}`), and the explicit records are refused
    with `ValidationError: … props.viewSizes: Unexpected property` (and the same
    for `lineNumbers`, `fill`, `label`, `view`). The block vocabulary case fails
    with `props.view: Expected "simple" or "port" or "expanded", got value`.
  - `schemaV2Migration` ×4: `open` and `resave` find the 8 legacy wire props where
    16 are expected, and the sequences at 4/2/2/0/0; `fill` gets
    `a pre-v2 board carrying v2 props still opens: expected false to be true`;
    `why` gets `expected 'com.tldraw.shape.ss-block/4' to be '…/5'`.
  - `originResolution` ×1: `expected [] to deeply equal [ 'com.tldraw.shape.ss-code/1' ]`.

  `B-SCHEMA-fixture` is green: it is the ruler's own guard.
- `cd apps/systemsketch && pnpm exec vitest --project=smoke run src/document/schemaV2Pixels.smoke.test.tsx`
  → 1 failed, 2 skipped (the gated capture). **The pixel half passed (0 differing
  pixels from a fresh mount)**, and the failure is the v2 half:
  `the board was opened through schema v2 …: expected { ss-block: 4, ss-code: 0, ss-port: 2, ss-region: 0, ss-wire: 2 } to deeply equal { 5, 1, 3, 1, 3 }`.
- `pnpm exec tsc -p apps/systemsketch/tsconfig.json` → exit 0. The acceptance
  files type-check at BASE.

## Builder brief

Work in `apps/systemsketch` only.

- Run `pnpm install --frozen-lockfile` once.
- Run git only as plain `git …` from your worktree root (`rules.isolatedGit`).
- Never `git add -A`: stage explicit pathspecs, and read
  `git diff --cached --name-only` before committing.
- The acceptance files are read-only. If one cannot pass, return FAIL with the
  one-line fix.
- No audits (`rules.noAudits`).
- Browser tests share port 63315 across worktrees. Run only the files named here;
  if the port is busy, wait for the holder to exit and retry. Never kill another
  process. Stop every process you start.

**The defaults are decided. Do not re-decide them.** Every value is in the
inventory §1 and pinned by `documentModel.test.ts`. The `WORK-ORDER.md` §6
defaults behind them:

- Q-P166: Fit-to-content is a command, never automatic. That is why `sizeMode` is
  `"fixed"` and `hug` is opt-in.
- Q-P130: Show card is a toggle, so `showCard` is stored.
- Q-P146: the footer menu is built, so `showFooter: true`. This is a call that
  needs Zach (inventory §5 Q1); do not change it.
- Q-P123: block-port direction is derived, so nothing is stored.
- Q-P060 / P120 / P124 are dropped: no row/branch, fold or per-port group props.
- Q-P069 / D10 are out: no semantic wire kind, no per-port size.
- Q-IMPORTER: nothing for `.systemsketch`.

**Copy types from these, do not invent:**

| prop group | source |
|---|---|
| `SlotOrigin` | `TRUNK/components/port.layout.ts:250` |
| `spacing` | `SpacingScheme`, `TRUNK/components/portEdge.layout.ts:118` |
| rail `mode` | `PortEdgeArrangeMode`, `TRUNK/components/portEdge.tsx:122` |
| `portLayout` | `BlockPortLayout`, `TRUNK/components/blockPort.layout.ts:55` |
| member types | `TRUNK/components/blockMembers.tsx:64-73` |
| markers | `TRUNK/components/trace.layout.ts:91` |
| `delayValue`, `bend` | donor `/home/bam/systemsketch/src/blocks/connections/ConnectionShapeUtil.tsx:298-304` (`curve` → `bend`) |
| title, member and weight fields | donor `/home/bam/systemsketch/src/blocks/blockModel.ts:420-421,487-522` |

The house pattern for a migration step is the four that already exist.
`BlockShapeUtil.tsx`'s `/4` and `WireShapeUtil.tsx`'s `/1` both record the P-028
incident in their WHY.

### Build in this order

1. **`shared/props.ts`.** Add the shared validators, each with a one-line WHY
   naming its trunk source.
2. **Each `*ShapeUtil.tsx`.** Do four things:
   - extend the props interface and `static override props`;
   - set `getDefaultProps` to the exact values `documentModel.test.ts` pins;
   - append ONE migration step that fills every new prop with `??=`;
   - write that step's values out as literals. Never call `getDefaultProps` or any
     live constructor from a migration: a shipped migration is frozen, and wiring
     it to a live default would let a later edit rewrite the past (`/1`'s WHY).

   Each new step carries a WHY comment naming the **P-028** incident: P-028 added
   `props.pins` with an empty sequence, every saved board refused to open, and the
   committed fixture `two-blocks.tldr` went down with it. Say what this step fills
   and that the default paints today's pixels.
3. **The `value` plumbing.** Export one helper from `BlockShapeUtil.tsx` (for
   example, `trunkBlockViewOf(view)`: `value` → `port`) with a WHY. The trunk has
   no `value` face until L-BLOCK-VIEWS mounts `TRUNK/components/block.value.tsx`
   (P-059), and `port` keeps a value's outlet wireable. Route the three call sites
   through it.
4. **Gates, in this order:**
   - `pnpm exec tsc -p tsconfig.json` (in `apps/systemsketch`) exits 0.
   - `pnpm exec vitest --project=unit run` is all green: 366+ tests, including the
     18 acceptance tests.
   - `pnpm exec vitest --project=smoke run src/document/schemaV2Pixels.smoke.test.tsx`
     is green: 0 differing pixels, and v2 reached.
   - `pnpm exec vitest --project=smoke run src/viewHotkeys.smoke.test.tsx src/diffMark.smoke.test.tsx src/code.smoke.test.tsx src/port.smoke.test.tsx src/tunnel.smoke.test.tsx src/edgeDropCatalog.smoke.test.tsx src/region.smoke.test.tsx src/wiring.smoke.test.tsx`
     is green.

   The dispatcher runs the full suites at merge.
5. **Mutation-test the rulers, and put it in the commit message.** For each case,
   go red, then restore and go green:
   - change one default (for example `sizeMode: "hug"`): `documentModel` and
     `B-SCHEMA-open` go red;
   - turn one `??=` into `=`: `B-SCHEMA-fill` goes red;
   - delete one step's P-028 comment: `B-SCHEMA-why` goes red.

**Name the user action.** None: this lane is storage only. Say so in the
ledger line, and cite where the first reader of each prop will be from the
inventory's "reads / writes" column.

**Out of scope.** Everything in inventory §3 and §4. Any rendering of a new prop:
that is each lane's own acceptance. `ss-glyph`. And `arc`.

## WHY comments to leave

- Each of the five new migration steps: the P-028 incident, and "fills, never
  resets".
- The `value` helper: why `port`, and that it disappears when L-BLOCK-VIEWS
  renders a real value face.
- `portOptions`: why rail-port options are a block-level map keyed by port id
  rather than fields on `PortSpecV`. Rail ports are not shapes. Every port literal
  in the app (`railLabel.ts`, `cornerBlock.ts`, `edgeDropCatalog.ts`, pyblocks)
  stays valid. It is the same keyed pattern as the trunk's `freeOffsets`.
- `ss-port.slots`: what a `builtin` and a `shape` member are, and that a deleted
  default stays deleted because it is absent from the list.
- The absence of `frozen` on `ss-port`: stock `isLocked` already answers it.
