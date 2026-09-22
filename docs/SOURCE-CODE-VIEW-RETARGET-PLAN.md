# SOURCE-CODE-VIEW-RETARGET-PLAN — collapse to code, expand to blocks, aimed at the NEW SystemSketch

**Status:** implementation plan, 2026-09-18 evening (stream 4 of the ASK). Retargets
`docs/SOURCE-CODE-VIEW-PLAN.md` (565 lines, P0–P6) at the from-scratch SystemSketch that
stream 2 is scaffolding as `apps/systemsketch` in this monorepo. Agent-readable: every lane
names its write set, its acceptance files (committed with this plan, off-limits to builders),
and what it may NOT touch. A lane in an isolated worktree reads this from a commit.

**Verified against disk on 2026-09-18 (evening).** bbox-ui: this plan's base is
`claude/control-flow-integration-2026-09-18` at `f80ebbf` (the integration branch moved to
`c166fc0` while planning — one story fix, `ChromeBar.stories.tsx`, no collision with anything
here). pyblocks `main` `6a64e0c`; the live P1 lane `claude/pyblocks-p1-regions` at `c45d8d1`
(`/home/bam/pyblocks/.claude/worktrees/pyblocks-viewer-library-40c1f2`). The archive
`/home/bam/systemsketch` at `1bd0c1e4`. `apps/systemsketch` does not exist in any bbox-ui
worktree yet (checked every entry of `git worktree list`); the sibling plan branches
(`claude/plan-control-flow-…`, `claude/plan-pyblocks-backend-…`, `claude/plan-systemsketch-
rebuild-…`) were all still at `f80ebbf` with nothing committed. Anything downstream of those
is marked **unverified** inline.

**The ask, verbatim (item 4):** *"There are also some functionalities like converting
codeeditor blocks into blocks that we want to get from pyblocks. Please start a fable 5.1
agent to implement this: `reports/source-code-view-plan-2026-09-18.html` … You may need to
wait until pyblocks is integrated first though. You can definitely kinda like add the menu
items, etc. that could appear if pyblocks is enabled to start."*

---

## 1 · One page

**What is being built.** The code cell and the block view are two states of one document. A
user selects N things and collapses them into ONE code cell; expands a cell back. One optional
field on the cell — `origin` — says who owns the bytes: absent → the board (a pseudo cell);
present (uri + anchor + content hash) → a real `.py` file, and the cell's `source` is a cache.
A block is a **definition** (module / class / def / nested def) — grain 1 is a kind, not a
number. pyblocks does the transformation both ways: the **definitions view** (the partition,
the one new algorithm) lowers text to definition blocks; the shipped 8 commands write edits
back as minimal text edits.

**What changed in the retarget, one line per old phase:**

| Old | Was aimed at | Now | Why |
|---|---|---|---|
| P0 PEP 0018 (systemsketch `docs/peps/`) | the archive | **Dropped as a systemsketch PEP.** The contract is frozen as TypeScript in the trunk (`apps/storybook-basics/src/scene/codeOrigin.ts`, committed WITH this plan); a bbox-ui decision record `docs/peps/0004-code-cell-origin-binding.md` lands at merge (bbox-ui `docs/peps/README.md`: records land at merge, not before) | A PEP in an archive records nothing anyone builds against; stream 2 reserves the prop from the trunk file today |
| P1 `origin` on the tldraw shape (`src/code/codeModel.ts`) | the archive | **Lane D** — `origin` on the NEW app's code shape in `apps/systemsketch`, after stream 2's code-shape lane | Same field, new shape; the migration-id-2 precedent only applies if stream 2 ships a v1 without it |
| P2 `origin` + languages in the pyblocks mirror (`systemsketch.py` v2) | pyblocks | **Follow-up**, gated on stream 3 | Whether the new app persists through `pyblocks/systemsketch.py` at all is stream 3's call — **unverified** |
| P3 the partition (`definition_graph.py`) | pyblocks | **Lane B**, day-0, unchanged in substance; its JSON output is now a **frozen fixture** both repos assert against | The cross-repo contract test replaces prose |
| P4 Rung A pure functions + stories | bbox-ui trunk | **Lane A**, day-0, unchanged — plus the pure **definitions → scene adapter** (research D2's thin-adapter default made concrete) | Same builder, same story file, keeps lanes few |
| P5 Rung A wired into old SystemSketch (`detachCode.ts` pattern, `src/bboxUi/` vendoring) | the archive | **Lane C** (pure gated actions + badge, trunk) then **Lane D** (context-menu wiring in the new app) | The new app imports the trunk through one alias — no vendoring, no `// owed upstream` |
| P6 Rung B: definition blocks, four states, first command | all three | **Split:** the adapter is in Lane A now; the host bridge, expand-of-bound-cell, resolution UI and the rename command are **follow-ups** gated on stream 3's backend | Nothing there can be built until a backend object exists to call |

**The order** (⛔ barrier, ∥ parallel, ● day-0):

```
A ● ∥  scv-rung-a-scene          bbox-ui trunk   Rung A + definitions→scene + face + badge + stories
B ● ∥  scv-definitions-partition  pyblocks        the partition, CLI flag, frozen fixture, golden
C   ∥  scv-origin-and-actions     bbox-ui trunk   codeOriginState/isCodeOrigin, sourceActionsFor, menu story   (after A)
D      scv-origin-on-app-shape    apps/systemsketch  origin prop, resolution, badge, context-menu wiring       (after stream 2's code shape, A, C)
```

No lane is a barrier: every contract other lanes import is frozen in THIS commit (types +
stub bodies that throw), so builders fill bodies and never move a signature.

---

## 2 · Criteria before options

Weighted for tonight's situation — the old app is an archive, the new one is being scaffolded
in parallel, Zach is away, and a builder that has never seen this conversation must be able to
land something real.

| Criterion | Weight | Why this weight |
|---|---|---|
| Buildable tonight by fresh Opus builders, in parallel, without a design Zach has not seen | 30% | The whole point of the retarget |
| Reuses what is on disk (`collapse.ts`, `boundary.ts`, `region.ts`, `codeEditor.tsx`, pyblocks' collector/dialect) | 25% | Availability before originality; the old plan's research already settled this |
| Survives stream 2 and stream 3 landing in any order (no lane blocked on an unmerged design) | 20% | Three streams are planning in parallel tonight against the same commit |
| Honest at every boundary (never a silent lossy round trip; absent not disabled; report never refuse) | 15% | Zach's standing rule and the research's one unacceptable failure |
| Keeps "everything is a block" and "never mix data and control lines" literally true in code | 10% | The two load-bearing ideas; a lane that bends either is wrong even if green |

**Options scored (1–5 per column, weighted):**

| Option | tonight | reuse | order-proof | honest | two ideas | total |
|---|---|---|---|---|---|---|
| **O2 — freeze contracts in the trunk now (types + throwing stubs + red tests), pure lanes day-0, app wiring last** | 5 | 5 | 5 | 5 | 5 | **5.00** |
| O1 — keep the old plan's targets, port to the new app after stream 2 lands | 2 | 5 | 2 | 4 | 5 | 3.35 |
| O3 — fold the source-code view into stream 2's app lanes (no trunk work) | 2 | 3 | 1 | 3 | 4 | 2.45 |
| O4 — wait for stream 3's backend before building anything | 1 | 4 | 1 | 5 | 5 | 2.80 |

**Recommendation: O2.** Reversible default if Zach says nothing: build A and B tonight, C when A
lands, D when stream 2's code shape exists. Nothing in A–C touches `apps/systemsketch`, so if
Zach vetoes the app's location every trunk deliverable still stands.

---

## 3 · Settled — carried from the old plan and the ASK, not re-opened

1. **P1 is the gesture** — collapse N selected things into one code cell; expand back.
2. **Text is canonical when a file backs the cell; the board is canonical when nothing does.**
   Both, per cell, via `origin` — a binding, not a setting. Four states, all computed.
3. **Grain 1 is the ceiling and it is a kind, not a number** (17,192 px measured at expression
   grain). The old P5 grain slider is dead.
4. **The backend belongs in pyblocks**, editor components in bbox-ui, the shape and persistence
   in the (new) SystemSketch.
5. **Organise ≠ reuse** (research B1): collapse-to-cell is organise only — never mints a
   `definitionId`; reuse stays behind `linking.ts`'s definition badge.
6. **Regions are nodes and regions are isolated** (`region.ts:4-26`); a code cell IS a region.
7. **Collapse mutates the document; the query projects** (`docs/peps/0003`).
8. **Anchor = qualified name, ordinal tie-break, never guess** (`identity.py:1-31` ladder).
9. **Hash = exact bytes of the span the partition reports; one slicer** (old §3.4).
10. **Port marimo's visitor technique with a pinned citation; never depend; never read
    ryvencore** (research C1/B4; this repo's provenance rule).
11. **Report, never refuse** (research C3): duplicate names are a visible state; syntax errors
    yield a total view.
12. **Nothing enters the editor component for value semantics** — the archive's PEP 0017
    (`/home/bam/systemsketch/docs/peps/0017-one-codefield-not-four.md`, "add to CodeField only
    what a different mount lifecycle requires — never anything for value semantics") travels
    as a rule onto the trunk's `CodeEditor`: `origin` lives on the node/shape, never on
    `codeEditor.tsx`.
13. **Absent, not disabled** — an action that does not apply is not rendered
    (`editor/edgeDropMenu.tsx:42-51`, card 23's one-gate rule).
14. **Prototype switches live in the app** (feedback 2026-09-09): a temporary bottom-right
    drop-down, never a URL flag.

---

## 4 · Stock-part mapping table

| Element | Today | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| Select N → one cell, and back | `scene/collapse.ts` `collapseToRegion` / `dissolveRegion` (444 lines, 27 tests) | **unchanged (stock seam)** — wrapped, not re-implemented, by `collapseToCode` / `expandCode` (`scene/codeCell.ts`) | Exact round trip (`toEqual` on the whole scene); split-edge isolation; ids/data/array index preserved; `remainder` policy |
| The cell's ports | `scene/boundary.ts` `classifyBoundary` / `promoteBoundary` / `PromotedPort` | **unchanged (stock seam)** | Ports derived from crossing edges; `inner`/`outer` recorded; PEP 0003 |
| The node kind | `scene/region.ts` `REGION_NODE_TYPE`, `isRegion`, `regionOf`, `selectionRoots` | **unchanged (stock seam)** — a cell is `type: "region"` + `data.codeCell` | Every region query works on a cell with no special case; no `definitionId` ever |
| The code face's editor | `components/codeEditor.tsx` `CodeEditor` (556 lines) | **unchanged (stock seam)** | Per-keystroke write policy, Enter/Escape exits, `lineNumbers`, three overflow modes, external-value sync; nothing added for value semantics (rule 12) |
| The badge | `components/badge.tsx` `Badge` (`variant`: `secondary` / `outline` / `warning` / `destructive`) | reused inside new `components/originBadge.tsx` `OriginBadge` | cva variants, `size` cascade from `Bar`, `data-slot` discipline |
| A card with header/body/members | `components/block.tsx` `Block`; `components/blockPort.tsx` `BlockPort` | reused inside new `components/codeCellFace.tsx` `CodeCellFace` | Header chrome above members (`paintOrder.ts`), `overflow: clip`, hug-contents height |
| Menu rows | `components/chromeBar.tsx` `MenuAction`; `components/context-menu.tsx` `ContextMenuGroup` / `ContextMenuItem` | reused: `sourceActionsFor` returns `MenuAction`-shaped rows | One list feeds dropdown AND context menu (`docs/menus/MENU-KIT-DESIGN.md` §5) |
| The gating pattern | `editor/edgeDropMenu.tsx` judge (`offered = entries.filter(judge)`) | pattern reused in `editor/sourceActions.ts` | Absent, never disabled |
| A host that paints a scene | `hosts/domCanvas.tsx` `DomCanvas`, `hosts/nodeViews.tsx` `SceneNodeView` | **unchanged (stock seam)** — the code-cell story owns its own host adapter (the `Scene.stories.tsx` / `EdgeDropMenu.stories.tsx` pattern) | `HOST_SCENE` and every existing story byte-identical; `nodeViews.tsx` left to the control-flow stream |
| Definition discovery | `pyblocks/analyzer.py` `_DefinitionIndex` (`:211-236`), `_FunctionCollector._visit_function` span policy (`:344-357`), `dialect.output_ports_by_qualname` (`dialect.py:191`) | reused inside new `pyblocks/definition_graph.py` `definitions_view` | Never imports/executes; spans byte-identical to `views[]`; PB1 outputs |
| Reference resolution between definitions | nothing (measured: `estimate_pair` gets no input port for calling `rectify`) | **ours**, technique ported from marimo `marimo/_ast/visitor.py` `ScopedVisitor` at 0.24.2, cited by path:line actually read | Static; class scope skipped for names inside methods; report never refuse |
| The four states | nothing | **ours**: `scene/codeOrigin.ts` `codeOriginState` | Computed, never stored; `pseudo` beats any resolution |
| Hashing | — | `node:crypto` `createHash("sha256")` (tests), `hashlib.sha256` (pyblocks), `crypto.subtle.digest("SHA-256")` (browser host) | Exact bytes, UTF-8, `sha256:<hex64>` |
| The tldraw shape in the new app | stream 2's code shape (**unverified**, not on disk) | `T.nullable(T.object({...}))` from `tldraw`'s `T` (present in the pinned 5.3.2: `node_modules/@tldraw/validate/dist-cjs/index.d.ts:379`) | Prop reserved as `origin: CodeOrigin \| null`; default `null` |
| Right-click menu in a tldraw app | `detach/rebuildContextMenu.tsx` `RebuildContextMenu` (composes `DefaultContextMenu` + `DefaultContextMenuContent` + one conditional `TldrawUiMenuGroup`) | pattern reused for the source group in the new app | Every stock item stays; the group is a conditional render, never `disabled` |

---

## 5 · The contracts (frozen in this commit)

All four TypeScript files below exist on this branch with their types complete and their
function bodies throwing `scv: not implemented — lane <id> fills this body`. `pnpm typecheck`
is green with them; the acceptance tests beside them are red until the lanes land.

### 5.1 `apps/storybook-basics/src/scene/codeOrigin.ts` — the binding

```ts
export interface CodeOrigin {
  uri: string;          // POSIX path relative to the board document's directory
  anchor: string;       // "<module>" | dotted qualname | "f#1" (ordinal only on duplicates)
  contentHash: string;  // "sha256:<hex64>" over the anchored span's exact bytes at last sync
}
export type CodeOriginState = "pseudo" | "synced" | "drifted" | "orphaned";
export interface CodeOriginResolution { fileFound: boolean; anchorFound: boolean; spanHash?: string; }
export function codeOriginState(origin: CodeOrigin | null | undefined, resolution: CodeOriginResolution | undefined): CodeOriginState;
export function isCodeOrigin(value: unknown): value is CodeOrigin;   // exact keys, /^sha256:[0-9a-f]{64}$/
export const ORIGIN_BADGE: Readonly<Record<CodeOriginState, { label: string; variant: "secondary"|"outline"|"warning"|"destructive"; description: string }>>;
```

State table (also in the file's doc comment): null → `pseudo` (regardless of resolution);
resolution missing / `!fileFound` / `!anchorFound` / `anchorFound` without `spanHash` →
`orphaned`; `spanHash === contentHash` (exact string) → `synced`; else `drifted`.

**The tldraw prop stream 2 reserves** (Lane D implements; the shape is stream 2's):

```ts
// on the new code shape's props validator (tldraw `T`):
origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string })),
// and in its `TLGlobalShapePropsMap` entry:
origin: CodeOrigin | null      // `import type { CodeOrigin } from "<trunk alias>/scene/codeOrigin"`
// getDefaultProps(): origin: null
```

### 5.2 `apps/storybook-basics/src/scene/codeCell.ts` — the cell (Rung A)

```ts
export interface CodeCellPayload { language: string; source: string; origin: CodeOrigin | null; }
export type CodeCellData = SceneData & { codeCell: CodeCellPayload };
export const CODE_CELL_LANGUAGE_PLAINTEXT = "plaintext";
export function isCodeCell(node: SceneNode<SceneData>): node is SceneNode<CodeCellData>;   // region AND has codeCell
export function codeCellHeader(memberNames: readonly string[]): string;
//   "# code cell — 3 blocks: A, B, C\n# annotation only until a backend is connected; expand restores the blocks\n"
export interface CollapseToCodeOptions<N, E> extends CollapseOptions<N, E> { language?: string; nameOf?: (node: SceneNode<N>) => string; }
export function collapseToCode<N, E>(scene: BlockScene<N, E>, nodeIds: readonly string[], options: CollapseToCodeOptions<N, E>): CollapseResult<N, E>;
export interface ExpandCodeResult<N, E> extends DissolveResult<N, E> { discardedText: string | null; textWasEdited: boolean; }
export function expandCode<N, E>(scene: BlockScene<N, E>, cellId: string, options?: DissolveOptions): ExpandCodeResult<N, E>;
```

A code cell is `type: REGION_NODE_TYPE` with `data.codeCell`. `collapseToCode` is
`collapseToRegion` with `regionData` = `{ ...regionData, codeCell: { language, source:
codeCellHeader(rootNames), origin: null } }` and nothing else different (the test deep-equals
`ports`, `conflicts`, `hidden`, `edges` and every non-region node against a parallel
`collapseToRegion` call with the same `mintId` sequence). `expandCode` is `dissolveRegion` plus
`{ discardedText, textWasEdited }`.

### 5.3 The definitions view — cross-repo JSON (pyblocks emits, bbox-ui consumes)

Frozen as TypeScript in `apps/storybook-basics/src/scene/definitionsToScene.ts`
(`DefinitionsView`, `SourceDefinition`, `SourceReference`, `DefinitionsDiagnostic`) and as a
fixture in `docs/acceptance/pyblocks/stereo_definitions.expected.json` (the 32-line stereo
module from the answers report, 7 definitions, 4 references). Both repos' tests read the same
bytes.

```jsonc
{
  "schemaVersion": 1, "kind": "definitions",
  "source": { "name": "stereo.py", "lineCount": 32, "sha256": "<hex64 of the whole text>" },
  "definitions": [            // source order, module first, parent before children
    { "anchor": "<module>", "name": "<module>", "kind": "module", "parent": null, "ordinal": 0,
      "span": { "startLine": 1, "startColumn": 0, "endLine": 32, "endColumn": 0, "columnEncoding": "utf8-bytes" },
      "signature": "module", "parameters": [], "outputs": [], "contentHash": "sha256:<hex64>", "text": "<whole file>" },
    { "anchor": "Pipeline.run", "name": "run", "kind": "function", "parent": "Pipeline", "ordinal": 0,
      "span": { "startLine": 30, "startColumn": 0, "endLine": 31, "endColumn": 41, "columnEncoding": "utf8-bytes" },
      "signature": "def Pipeline.run(self, left, right)",
      "parameters": [ { "name": "self", "annotation": null }, … ], "outputs": [ { "name": "depth", "dataType": "Depth" } ],
      "contentHash": "sha256:<hex64 of text>", "text": "    def run(self, left, right):\n        return estimate_pair(left, right)" }
  ],
  "references": [ { "from": "Pipeline.run", "to": "estimate_pair", "kind": "call", "lines": [31] } ],   // kind: call | name | attribute
  "diagnostics": [ { "severity": "warning", "code": "duplicate-definition", "message": "…", "anchor": "f#1" } ]
}
```

Rules the fixture pins (each has a test in `docs/acceptance/pyblocks/test_definition_graph.py`):

- **Span** = pyblocks' own function policy (`analyzer.py:350-355`): start at the first
  decorator's line (or the `def`/`class` line), **column 0**; end at the AST end. Module =
  `(1, 0, len(source.split("\n")), utf8len(lastLine))` (`analyzer.py:113-116, 329`). Verified:
  the fixture's numbers equal what `python3 -m pyblocks analyze --view module stereo.py`
  reports in `views[]` today (13-17:33, 20-23:82, 27-28:18, 30-31:41, module 1-32:0), and the
  module `contentHash` equals its `source.sha256`.
- **Anchor**: `<module>`; else dotted qualname; `#<n>` only for the n-th duplicate (n ≥ 1),
  first occurrence bare.
- **Signature**: functions exactly as `_visit_function` spells them (`analyzer.py:358-366`,
  `def Pipeline.run(self, left, right)`, `async def …`); classes `class Pipeline`; module `module`.
- **References**: `call` when the name is a `Call`'s `func`; `name` for any other load
  (annotation, base, value); `attribute` for `self.x`/`cls.x` resolving to a sibling method
  `Class.x`. Bare names resolve through enclosing FUNCTION scopes then module — **class
  scopes are skipped** (Python's rule; test `test_class_scope_is_skipped_for_names_inside_
  methods`). Header parts (decorators, bases, annotations, defaults, returns) are attributed
  to the definition they decorate. Self-references are dropped. Sorted by (from index, to
  index, `call` < `name` < `attribute`); `lines` ascending, unique.
- **Total**: syntax error → one module record + an `error`/`syntax-error` diagnostic;
  duplicates → both records + a `warning`/`duplicate-definition` on the later one.
- **Deterministic**: byte-identical JSON on two runs; object key order as listed.

### 5.4 `apps/storybook-basics/src/scene/definitionsToScene.ts` — the adapter

```ts
export const REFERENCE_EDGE_TYPE = "reference";
export function definitionsToScene(view: DefinitionsView, options: { rootAnchor: string; mintId: () => string; uri: string; parentId?: string; place?: (d, index, depth) => ScenePosition }):
  | { ok: true; scene: BlockScene<DefinitionNodeData, ReferenceEdgeData>; nodeIdByAnchor: Record<string,string>; external: SourceReference[] }
  | { ok: false; refusal: ConnectionMessage };   // code UNKNOWN_ROOT_ANCHOR
```

One `region` node per strict descendant of `rootAnchor`, `data = { name, codeCell: {
language: "python", source: text, origin: { uri, anchor, contentHash } }, definition: { kind,
signature, parameters, outputs } }`; one node-level `reference` edge (no handles) per
reference whose both endpoints were produced; single-ended references go to `external`; ids
minted nodes-first then edges.

### 5.5 `apps/storybook-basics/src/editor/sourceActions.ts` — the gated actions

```ts
export const PYBLOCKS_BACKEND_KIND = "pyblocks" as const;
export interface SourceBackendRef { readonly kind: string }        // the ONLY thing read off a backend
export const SOURCE_ACTION_IDS = { convertToCode: "convert-to-code", expandToBlocks: "expand-to-blocks" } as const;
export function sourceActionsFor(backend: SourceBackendRef | null | undefined, selection: { nodeIds: readonly string[]; isCodeCell: (id: string) => boolean }, handlers: { convertToCode(ids): void; expandToBlocks(id): void }): SourceAction[];
```

**Contract with the pyblocks-backend stream (stream 3):** whatever object represents the
connected backend carries `kind: "pyblocks"`. Nothing else is read. With no backend, or any
other `kind`, the actions are ABSENT.

---

## 6 · How each lane honours the two load-bearing ideas

| Lane | Everything is a block | Never mix data and control lines |
|---|---|---|
| A — Rung A + adapter | A code cell is a `region` node (the same `SceneNode`, ports and all); a definition is a region wearing a code face with its parameters/outputs as ports | The cell's ports are exactly the data cables that crossed the selection; references between definitions are a **third lane** (`type: "reference"`, node-level, dashed) — never a port cable, never a region arm |
| B — the partition | One node per definition, recursively; nothing smaller | Emits dependencies only (`references`), no control edges; control flow inside a definition stays held text |
| C — origin + actions | The badge is a fact on a block, painted by the block's own chrome | No lines minted; the actions call the region algebra and nothing else |
| D — app shape | `origin` is one prop on the app's code shape (a node); the badge sits in its header | The context-menu group runs the same pure functions; the app draws no new line kind |

---

## 7 · Lanes

Notation: **W** exhaustive write set (a file not listed is out of bounds), **DNT** do not
touch, **A** acceptance (mechanical; the test files are committed and off-limits), **D**
depends on.

### Lane A — `scv-rung-a-scene` (bbox-ui, day-0, not a barrier)

- **W:** `apps/storybook-basics/src/scene/codeCell.ts` (fill bodies; never change an exported
  signature), `apps/storybook-basics/src/scene/definitionsToScene.ts` (fill body),
  `apps/storybook-basics/src/components/originBadge.tsx` (new), `apps/storybook-basics/src/
  components/codeCellFace.tsx` (new), `apps/storybook-basics/src/stories/CodeCell.stories.tsx`
  (new).
- **DNT:** `scene/collapse.ts`, `scene/boundary.ts`, `scene/region.ts`, `scene/scene.ts`,
  `scene/linking.ts`, `components/codeEditor.tsx`, `components/block.tsx`,
  `components/badge.tsx`, `hosts/**` (the control-flow stream owns region rendering there),
  `scene/codeOrigin.ts`, `editor/**`, every `*.test.ts`, `packages/**`, `vitest.config.ts`.
- **A:** `pnpm test-unit` — `src/scene/codeCell.test.ts` (13 tests) and
  `src/scene/definitionsToScene.test.ts` (11 tests) green; `pnpm typecheck` green; `pnpm test`
  — every story in `CodeCell.stories.tsx` green with a play function whose first
  testing-library call is `findBy*`.
- **D:** none.

### Lane B — `scv-definitions-partition` (pyblocks, day-0, not a barrier)

- **Worktree:** `git -C /home/bam/pyblocks worktree add /home/bam/pyblocks/.claude/worktrees/
  scv-definitions-2026-09-18 -b claude/scv-definitions-2026-09-18 main` — off `main`
  (`6a64e0c`), never the root checkout (dirty with a peer's staged work), never the P1 lane.
- **Before dispatch the DISPATCHER copies** (byte for byte) `docs/acceptance/pyblocks/
  test_definition_graph.py → tests/test_definition_graph.py`, `stereo_fixture.py →
  tests/fixtures/definition_graph/stereo.py`, `stereo_definitions.expected.json →
  tests/fixtures/definition_graph/stereo_definitions.expected.json`, and commits them on
  the lane branch. The builder may not edit them.
- **W:** `pyblocks/definition_graph.py` (new), `pyblocks/__main__.py` (the `--view-kind
  {blockview,definitions}` flag on `analyze`, default `blockview`, at `:233-238` and the
  handler at `:340-343`), `examples/systemsketch_goldens/…` ONE new definitions-view golden
  case only if `goldens.py`'s harness admits one without edits (else skip and say so).
- **DNT:** `pyblocks/analyzer.py`, `python_adapter.py`, `blockview.py`, `symbols.py`,
  `commands.py`, `systemsketch.py`, `identity.py`, `dialect.py`, every existing test, the
  P1 lane worktree, `vscode-*`.
- **A:** `python3 -m unittest tests.test_definition_graph -v` — 17 tests green; `python3 -m
  unittest discover -s tests -v` no new failures; `definition_graph.py` header cites marimo
  0.24.2 `marimo/_ast/visitor.py:<lines actually read>` with the Apache-2.0 notice, or says
  "ours, ad hoc" per rule — never a citation from memory.
- **D:** none.

### Lane C — `scv-origin-and-actions` (bbox-ui, after A, not a barrier)

- **W:** `apps/storybook-basics/src/scene/codeOrigin.ts` (fill `codeOriginState`,
  `isCodeOrigin`; `ORIGIN_BADGE` and every type stay), `apps/storybook-basics/src/editor/
  sourceActions.ts` (fill body), `apps/storybook-basics/src/stories/SourceActions.stories.tsx`
  (new), `apps/storybook-basics/src/editor/README.md` (add one section),
  `docs/peps/0004-code-cell-origin-binding.md` (new; the decision record, `docs/peps/README.md`
  shape).
- **DNT:** everything Lane A wrote except by import; `components/context-menu.tsx`,
  `components/chromeBar.tsx`, `hosts/**`, every `*.test.ts`.
- **A:** `pnpm test-unit` — `src/scene/codeOrigin.test.ts` (13 tests) and
  `src/editor/sourceActions.test.ts` (9 tests) green; `pnpm test` — `SourceActions.stories.tsx`
  play functions green, including one that right-clicks with the backend OFF and asserts the
  source group is absent from `document.body`, then ON and asserts both items present.
- **D:** A.

### Lane D — `scv-origin-on-app-shape` (bbox-ui `apps/systemsketch`, after stream 2's code-shape lane + A + C)

- **W:** the new app's code-shape model/util files as stream 2 names them (**unverified**;
  expected `apps/systemsketch/src/shapes/code/*` — run `ls` first and report the real paths),
  new `apps/systemsketch/src/source/originResolution.ts`, new `apps/systemsketch/src/source/
  sourceContextMenu.tsx`, new `apps/systemsketch/src/source/backendSwitch.tsx` (the
  bottom-right prototype switch), their tests.
- **DNT:** the trunk (`apps/storybook-basics/**`), `packages/**`, `/home/bam/systemsketch`.
- **A:** the app's own `pnpm test`/`pnpm typecheck` green; a vitest test proves a default
  code shape validates with `origin: null`, a populated `origin` round-trips the validator,
  and — only if a pre-`origin` version shipped — the migration `up` adds `null` and `down`
  strips it; a driven test (the app's smoke style) proves the source group is absent with
  the switch on "none" and present on "pyblocks (stub)".
- **D:** `systemsketch-rebuild:<code-shape lane>` (id to be filled by the dispatcher), A, C.

---

## 8 · Builder briefs (handed verbatim to fresh builders — also in the StructuredOutput)

### Brief A — `scv-rung-a-scene`

You are building Rung A of bbox-ui's source-code view in the trunk, `apps/storybook-basics`,
plus the pure adapter from pyblocks' definitions view to a scene. Work in your own worktree off
`claude/plan-source-code-view-2026-09-18` (`.claude/settings.json` carries `worktree.baseRef:
"head"`); run `pnpm install --filter bbox-storybook-basics...` first (≈1 s). Read, in this
order: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §1–§6; `src/scene/collapse.ts` (all 444 lines
— your two functions are thin wrappers over `collapseToRegion` :175-284 and `dissolveRegion`
:335-414); `src/scene/region.ts` (`REGION_NODE_TYPE`, `isRegion`, `selectionRoots` :122-129);
`src/scene/codeCell.ts`, `src/scene/definitionsToScene.ts`, `src/scene/codeOrigin.ts` (the
frozen contracts — every type and doc comment there binds; fill the throwing bodies, never
move a signature); the acceptance tests `src/scene/codeCell.test.ts` and
`src/scene/definitionsToScene.test.ts` (off-limits to you — they define done); `docs/
acceptance/pyblocks/stereo_definitions.expected.json` (the fixture the adapter test reads);
`src/components/block.tsx`, `blockPort.tsx`, `badge.tsx`, `codeEditor.tsx` (props only);
`src/stories/Scene.stories.tsx` :77-130 and `src/stories/EdgeDropMenu.stories.tsx` :1-60 (the
story-owned host-adapter pattern you will copy); `CLAUDE.md` "Story tags" and "A play
function's first testing-library call should be `findBy*`".

Write set, exhaustively: `src/scene/codeCell.ts`, `src/scene/definitionsToScene.ts`,
`src/components/originBadge.tsx` (new), `src/components/codeCellFace.tsx` (new),
`src/stories/CodeCell.stories.tsx` (new). Do NOT touch `collapse.ts`, `boundary.ts`,
`region.ts`, `scene.ts`, `codeEditor.tsx`, `block.tsx`, `badge.tsx`, anything under
`src/hosts/` (the control-flow stream is adding region rendering there — a story-local adapter
avoids the collision), `src/editor/**`, `scene/codeOrigin.ts`, any `*.test.ts`,
`vitest.config.ts`, `packages/**`.

`codeCell.ts`: `isCodeCell` = `isRegion(node) && typeof node.data.codeCell === "object" &&
node.data.codeCell !== null`. `codeCellHeader` produces EXACTLY the two-line string in its
doc comment (test pins singular/plural/zero). `collapseToCode`: compute the root names
first — `selectionRoots(scene, descendantsOf(scene, nodeIds))` in scene order, named by
`options.nameOf ?? (node => typeof node.data.name === "string" ? node.data.name : node.id)`
— then call `collapseToRegion(scene, nodeIds, { ...options, regionData: { ...(options.regionData
?? {}), codeCell: { language: options.language ?? CODE_CELL_LANGUAGE_PLAINTEXT, source:
codeCellHeader(names), origin: null } } as N })` and return its result unchanged (refusals
included). Do not call `mintId` yourself before the wrapped call — the test asserts your
`regionId`, `ports`, `conflicts`, `hidden` and edges deep-equal a parallel `collapseToRegion`
run with the same counter. `expandCode`: find the node; if absent return `{ scene, rewired:
[], removedStubs: [], orphaned: [], released: [], discardedText: null, textWasEdited: false }`
with the SAME `scene` object; else `const dissolved = dissolveRegion(scene, cellId, options)`;
`discardedText` = `isCodeCell(node) ? node.data.codeCell.source : null`; `textWasEdited` =
`discardedText !== null && discardedText !== codeCellHeader(<names of the cell's direct
children in scene order, same nameOf default>)`. Leave a `WHY:` at the header seam: the text
is annotation because there is no parser at Rung A; the subgraph in the scene is the truth
(plan §1, Q1 default), and a `WHY:` at `expandCode` on why it returns what it discards rather
than refusing.

`definitionsToScene.ts`: validate `rootAnchor` exists (else `{ ok: false, refusal: {
severity: "error", code: UNKNOWN_ROOT_ANCHOR, message } }`); walk `view.definitions` in
order keeping only strict descendants of the root (follow `parent` chains); mint a node id
per kept definition in that order, then build nodes: `{ id, type: REGION_NODE_TYPE, position,
data: { name, codeCell: { language: "python", source: text, origin: { uri: options.uri,
anchor, contentHash } }, definition: { kind, signature, parameters, outputs } }, parentId }`
where `parentId` = the parent's minted id if the parent was kept, else `options.parentId` if
given, else omitted (never `undefined`-valued — the test uses `toBeUndefined` on the
property and `toEqual` elsewhere; omit the key). `position` = `(options.place ?? ((_, index)
=> ({ x: 24, y: 24 + index * 160 })))(definition, siblingIndex, depth)` — `siblingIndex`
counts among kept definitions sharing the same parent, `depth` is 0 for the root's direct
children. Then edges: for each `view.references` in order, if both `from` and `to` were kept
push `{ id: mintId(), type: REFERENCE_EDGE_TYPE, source, target, data: { kind, lines:
[...lines] } }`; if exactly one was kept push the reference (a shallow copy) to `external`;
else drop. Never mutate `view`. `WHY:` at the edge seam: references are a dependency lane,
neither data cable nor control line (plan §6).

`originBadge.tsx`: `export function OriginBadge({ state, size }: { state: CodeOriginState;
size?: BadgeProps["size"] })` → `<Badge data-slot="origin-badge" data-state={state}
variant={ORIGIN_BADGE[state].variant} size={size} title={ORIGIN_BADGE[state].description}>
{ORIGIN_BADGE[state].label}</Badge>`. Nothing else; the four-state data is frozen in
`codeOrigin.ts`.

`codeCellFace.tsx`: props-in DOM-out. `CodeCellFace({ id, name, cell: CodeCellPayload,
originState?: CodeOriginState, view: "opaque" | "expanded", members?: BlockMember[], ports?:
BlockPort's `edges`, width?, onSourceWrite?(next: string) })`. Renders `BlockPort` around a
`Block` whose `header` is a `Bar`-free row: the name, then `<OriginBadge>` when
`originState` is given; `body` (opaque) = `<CodeEditor value={cell.source} multiline
lineNumbers language={cell.language === "python" ? python() : undefined} onWrite=… />`;
`members` (expanded) = the given members with `membersLayout="stack"`. `data-slot="code-cell-
face"` and `data-view` on the root. `WHY:` at the view toggle: Zach's Proposal 5 — "when you
collapse one of these regions it can look like this honest port view first" — opaque is the
default face, expanded is the toggle, both over ONE node.

`CodeCell.stories.tsx`: `title: "Blocks/Scene/Code Cell"`, `tags: ["area:blocks",
"lane:scv-rung-a-scene"]`. A story-local host (positioned divs + `WireLayer` + `sceneWires`,
the `Scene.stories.tsx` pattern) that renders a small scene where a `region` node with
`data.codeCell` paints as `CodeCellFace` and everything else as before. Stories: `RoundTrip`
(a "Collapse to code" button runs `collapseToCode` on a fixed selection, an "Expand" button
runs `expandCode`; play: await the cell's `[data-slot="code-cell-face"]` with `findBy*`,
assert the collapsed members are no longer top-level, click Expand, assert the scene equals
the original via a `data-scene` JSON attribute the story writes on its root),
`OpaqueAndExpanded` (a toggle; play asserts `data-view` flips and members appear),
`OriginBadgeStates` (four faces, one per state, from `CODE_ORIGIN_STATES`; play asserts four
`[data-slot="origin-badge"]` with distinct `data-state`), `DefinitionsFromStereo` (reads the
fixture JSON via a static `import … from "../../../../docs/acceptance/pyblocks/
stereo_definitions.expected.json"` — `resolveJsonModule` is on — runs `definitionsToScene` from
`<module>`, renders 6 faces with `Pipeline` holding two members, and 4 dashed reference edges
through `WireLayer` with `data.variant` or a `stroke-dasharray` your host adapter applies to
`type === "reference"` edges; play asserts 6 faces and 4 reference wires). Every play
function's first testing-library call is `findBy*`.

Acceptance, exactly: from `apps/storybook-basics`, `pnpm typecheck` exit 0; `pnpm test-unit`
shows `src/scene/codeCell.test.ts` and `src/scene/definitionsToScene.test.ts` fully green
(13 + 11 tests) and no other file newly red (`codeOrigin.test.ts` and
`sourceActions.test.ts` stay red until Lane C — expected); `pnpm test` shows every
`CodeCell.stories.tsx` story green. If an assertion cannot be met, report FAIL with the exact
output — do not edit the test. Commit with explicit pathspecs only; never `git add -A`. Report
the story ids (`scene-model-diff-codecell--round-trip`, …) in your handoff.

### Brief B — `scv-definitions-partition`

You are building pyblocks' definitions view — the grain-1 partition: one record per
definition (module, class, def, nested def, recursively) with exact spans, hashes, signatures,
ports, and the references between definitions. It is the one genuinely new algorithm in the
source-code view, and its JSON is a frozen cross-repo contract. Work in a fresh worktree off
`main`: `git -C /home/bam/pyblocks worktree add /home/bam/pyblocks/.claude/worktrees/scv-
definitions-2026-09-18 -b claude/scv-definitions-2026-09-18 main`. Never touch the root
checkout (a peer's staged work is there) or `.claude/worktrees/pyblocks-viewer-library-40c1f2`
(a live lane). The dispatcher has committed three files on your branch before you start —
`tests/test_definition_graph.py`, `tests/fixtures/definition_graph/stereo.py`,
`tests/fixtures/definition_graph/stereo_definitions.expected.json` — they are the acceptance
and you may not edit them. Read them FIRST, in full; every rule below has a test there.

Then read: `pyblocks/analyzer.py:1-40` (the founding rule: never import or execute analyzed
source), `:113-133` (`_source_lines` — `split("\n")` keeps the final blank line; `_span`),
`:211-236` (`_DefinitionIndex` — the lexical qualname walk you extend to record parents and
ordinals), `:321-371` (`_FunctionCollector` — REUSE its span policy at :350-355 verbatim:
`decorated_line = min([node.lineno, *(d.lineno for d in node.decorator_list)])`, start column
0, end from the AST; and its signature string at :358-366), `:1923-1975` (`analyze_source` —
how the CLI's blockview path is built; you add a sibling path, you do not change this one);
`pyblocks/dialect.py:191-196` (`output_ports_by_qualname` — the PB1 named outputs; use it for
`outputs`, spelled `[{"name", "dataType"}]`); `pyblocks/blockview.py:37-45` (`SourceSpan` —
1-based lines, 0-based UTF-8 byte columns, end exclusive; your `span` objects are that shape
plus `"columnEncoding": "utf8-bytes"`); `pyblocks/__main__.py:226-240` and `:340-343` (the
`analyze` subcommand and its handler); `tests/test_commands.py:1-40` (house style: plain
`unittest`). Read the plan `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §5.3 in bbox-ui
(`/home/bam/bbox-ui/.claude/worktrees/plan-source-code-view-2026-09-18/docs/`) for the schema
and rules — the test file restates them.

Write set: `pyblocks/definition_graph.py` (new), `pyblocks/__main__.py` (add `--view-kind
{blockview,definitions}` to `analyze`, default `blockview`; when `definitions`, print
`json.dumps(definitions_view(source, str(args.file)), ensure_ascii=False, indent=None if
args.compact else 2)` and return; the blockview path stays byte-identical — the test
`test_default_view_kind_is_unchanged` checks it). Optionally ONE golden case under
`examples/systemsketch_goldens/` if `goldens.py` admits a definitions-view case without
editing the harness; if it cannot, skip it and say so. Do not touch `analyzer.py`,
`python_adapter.py`, `blockview.py`, `symbols.py`, `commands.py`, `systemsketch.py`,
`identity.py`, `dialect.py`, any existing test, or `vscode-*`.

`definitions_view(source: str, filename: str) -> dict` — plain dict, JSON-ready, key order
exactly `schemaVersion, kind, source, definitions, references, diagnostics` and per record
`anchor, name, kind, parent, ordinal, span, signature, parameters, outputs, contentHash, text`.
Algorithm: `lines = source.split("\n")`; try `ast.parse(source, filename=filename)`; on
`SyntaxError` return the total view (module record only: span `(1,0,len(lines),
utf8len(lines[-1]))`, `text = source`, `contentHash = "sha256:" + sha256(source)`, one
`error`/`syntax-error` diagnostic with anchor `<module>`). Otherwise walk `tree.body`
recursively for `FunctionDef`/`AsyncFunctionDef`/`ClassDef` (only statement bodies —
never descend into expressions for definitions), recording lexical qualname, parent, kind
(`class` / `function` / `async-function`), and an ordinal per qualname in file order; anchor
= qualname, plus `#<ordinal>` when ordinal ≥ 1, plus a `warning`/`duplicate-definition`
diagnostic anchored at the later occurrence. Spans: the `_visit_function` policy above,
applied to classes too. `text` = the exact bytes from `(startLine, 0)` to `(endLine,
endColumn)` — slice line bytes with `.encode("utf-8")[:endColumn]`, join with `"\n"`.
`contentHash = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()`. `signature`:
functions exactly as `_FunctionCollector._visit_function` builds them (copy those lines, cite
them), classes `f"class {qualname}"`, module `"module"`. `parameters`: posonly, args, `*vararg`,
kwonly, `**kwarg` in that order, `annotation` = `ast.unparse(annotation)` or `None`. `outputs`
from `dialect.output_ports_by_qualname(tree).get(qualname, ())` as `{"name", "dataType"}`.

References: for each definition, visit its header parts (decorators, bases and keywords for a
class; annotations, defaults, `returns` for a def) and its body statements, WITHOUT descending
into nested definitions (they are their own records). A `Name` load resolves through the
enclosing scope chain — module, then each enclosing def — **skipping class scopes** (Python's
rule; `test_class_scope_is_skipped_for_names_inside_methods`), to the FIRST definition with
that bare name in that scope; kind `call` when the name is the `func` of an `ast.Call`, else
`name`. `self.<x>` / `cls.<x>` inside a method resolves to the enclosing class's child
definition `<Class>.<x>` when it exists, kind `attribute`. Header parts are attributed to the
decorated definition itself, deliberately (a `WHY:` in the file: the view answers "which
definition talks about which", not "which frame evaluates which"). Drop self-references and
names that resolve to nothing (imports, module-level assignments, builtins). Group by `(from,
to, kind)`, `lines` sorted unique, output sorted by `(from's index, to's index, kind order
call/name/attribute)`. The module's own references come from its non-definition top-level
statements. **Provenance:** port the ref-stack-per-scope technique from marimo 0.24.2's
`marimo/_ast/visitor.py` (`ScopedVisitor`) if you read it — fetch it (`uvx --from
marimo==0.24.2 python -c "import marimo,inspect,os;print(os.path.dirname(marimo.__file__))"` or
`pip download marimo==0.24.2`), read the actual file, and cite `path:line-range` in the module
docstring with the Apache-2.0 notice; if you write it yourself say "ours, ad hoc" — never a
citation from memory. Do NOT read ryvencore (LGPL). Static only; never import or execute the
analyzed source. `WHY:` comments at: the class-scope skip, the header attribution, the
ordinal-not-line:col anchor, the "report never refuse" total path.

Acceptance: from the worktree root, `python3 -m unittest tests.test_definition_graph -v` — 17
tests green, including `test_matches_the_frozen_expected_json_exactly` (a byte-level `==`
against the fixture) and both CLI tests; `python3 -m unittest discover -s tests -v` — no new
failures versus `main`. If a rule as tested cannot be met, report FAIL with the exact
assertion — do not edit the tests or the fixture. Commit with explicit pathspecs; never
`git add -A`. Report the exact `python3 -m pyblocks analyze --view-kind definitions
tests/fixtures/definition_graph/stereo.py | head -40` in your handoff.

### Brief C — `scv-origin-and-actions`

You are building the four-state origin judge and the pyblocks-gated source actions in bbox-ui's
trunk, `apps/storybook-basics`, after Lane A (`scv-rung-a-scene`) has landed — branch from
the commit that contains `src/components/codeCellFace.tsx`; `pnpm install --filter
bbox-storybook-basics...` first. Read: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §3, §5.1,
§5.5, §6; `src/scene/codeOrigin.ts` and `src/editor/sourceActions.ts` (frozen contracts —
fill the throwing bodies; every type, constant and doc comment binds); the acceptance tests
`src/scene/codeOrigin.test.ts` and `src/editor/sourceActions.test.ts` (off-limits — they define
done); `src/editor/edgeDropMenu.tsx:42-51, 217-221` (the one-gate rule you mirror);
`src/editor/README.md` (you add a section); `src/components/context-menu.tsx` exports and
`src/stories/ContextMenu.stories.tsx:33-128` (how a right-click menu is driven in a play
function: `fireEvent.contextMenu`, `within(document.body)`, `[data-slot="context-menu-
content"]`); `src/components/chromeBar.tsx:72-83` (`MenuAction`); `src/scene/codeCell.ts` and
`src/components/codeCellFace.tsx` (Lane A's — you call them, you do not edit them);
`docs/peps/README.md` and `docs/peps/0003-collapse-mutates-the-document.md` (the record shape).

Write set: `src/scene/codeOrigin.ts` (bodies of `codeOriginState` and `isCodeOrigin` only),
`src/editor/sourceActions.ts` (body of `sourceActionsFor` only), `src/stories/
SourceActions.stories.tsx` (new), `src/editor/README.md` (one new section), `docs/peps/
0004-code-cell-origin-binding.md` (new). Do not touch anything else — not `context-menu.tsx`,
not `chromeBar.tsx`, not `src/hosts/**`, not Lane A's files, not any `*.test.ts`.

`codeOriginState`: `if (origin == null) return "pseudo"; if (!resolution || !resolution.fileFound
|| !resolution.anchorFound || typeof resolution.spanHash !== "string") return "orphaned";
return resolution.spanHash === origin.contentHash ? "synced" : "drifted";` — total, exact
string compare, no normalisation (tests pin upper-case and prefix-less hashes as `drifted`).
`WHY:` at the null check: pseudo wins over any resolution because a null origin has nothing
to resolve. `isCodeOrigin`: plain object (not array, not null), keys exactly `{uri, anchor,
contentHash}`, all non-empty strings, `contentHash` matching `/^sha256:[0-9a-f]{64}$/`.
`WHY:`: exact keys mirror pyblocks' `_is_exact_v1` so a record that round-trips through the
mirror later cannot carry a key one side ignores.

`sourceActionsFor`: `if (backend?.kind !== PYBLOCKS_BACKEND_KIND) return [];` then, with `ids =
selection.nodeIds`, push `convert-to-code` when `ids.length >= 1 && ids.some(id =>
!selection.isCodeCell(id))` with `run: () => handlers.convertToCode([...ids])` (copy the array;
the test checks the caller's array is not mutated and `toHaveBeenCalledWith` the same ids);
push `expand-to-blocks` when `ids.length === 1 && selection.isCodeCell(ids[0])` with `run: ()
=> handlers.expandToBlocks(ids[0])`. Each row: `{ id, label: SOURCE_ACTION_LABELS[id], run }`
— never set `disabled`. `WHY:` at the gate: absent, not disabled (edgeDropMenu's rule; Zach's
"menu items that could appear if pyblocks is enabled").

`SourceActions.stories.tsx`: `title: "Blocks/Editor/Source Actions"`, `tags: ["area:blocks",
"lane:scv-origin-and-actions"]`. A story-local host: a small scene (three blocks wired in a
chain, rendered with the same story-owned adapter Lane A's `CodeCell.stories.tsx` uses — copy
its adapter code rather than importing from `src/hosts/`), a selection model (click toggles
selection; a "select A,B" button for the play), a `ContextMenu` whose `ContextMenuTrigger`
wraps the canvas, and a bottom-right `<select data-slot="backend-switch">` with options
`none` / `pyblocks` (the "prototype switch in app" rule — cite feedback 2026-09-09 in a
`WHY:`). `ContextMenuContent` renders the stock demo rows and, from `sourceActionsFor(backend,
selection, handlers)`, a `ContextMenuGroup data-slot="source-actions"` with one
`ContextMenuItem data-testid={\`source-action-${id}\`}` per row — rendered only when the
array is non-empty. Handlers: `convertToCode` → `collapseToCode(scene, ids, { mintId,
directionOf })` and set the scene; `expandToBlocks` → `expandCode(scene, id)`, `window.confirm`
only when `textWasEdited` (in the play, stub it). Stories: `BackendOff` (play: `findBy*` the
canvas, right-click, assert `document.body.querySelector('[data-slot="source-actions"]')` is
null while the stock rows ARE present — a vacuous negative is not proof), `BackendOn` (play:
switch to pyblocks, select A,B, right-click, assert `source-action-convert-to-code` present
and `source-action-expand-to-blocks` absent; click convert; right-click the new cell; assert
expand present and convert absent), `ConvertThenExpand` (play: convert, expand, assert the
scene JSON on the root's `data-scene` equals the original).

`docs/peps/0004-code-cell-origin-binding.md`: the `docs/peps/README.md` shape (ruling / what
forced it / options weighed / what we give up / what would reopen it), seam
`apps/storybook-basics/src/scene/codeOrigin.ts:<line of codeOriginState>`; the ruling is the
first semantic field on a code node — a binding, not a setting; options weighed: a mode
flag, a DO-NOT-EDIT header, the line:col anchor; what we give up: an unresolvable anchor is
reported, never re-guessed. Add a `WHY:` line at the seam pointing at the record. `src/editor/
README.md`: a `## sourceActions.ts — the pyblocks-gated source actions` section in the style
of the edge-drop-menu section.

Acceptance: `pnpm typecheck` exit 0; `pnpm test-unit` — `src/scene/codeOrigin.test.ts` (13)
and `src/editor/sourceActions.test.ts` (9) green, nothing else newly red; `pnpm test` — all
three `SourceActions.stories.tsx` stories green, first testing-library call `findBy*`. FAIL
with the exact output is a valid deliverable; editing a test is not. Explicit pathspecs only.

### Brief D — `scv-origin-on-app-shape`

You are adding the `origin` binding, its badge, and the pyblocks-gated context-menu group to
the NEW SystemSketch app, `apps/systemsketch` in the bbox-ui monorepo, after stream 2's
code-shape lane, Lane A and Lane C have landed. First verify the ground: `ls
apps/systemsketch/src` and find the code shape's model and shape-util files and the app's
document model (does it hold a trunk `BlockScene` and project shapes from it, as
`apps/storybook-basics/src/hosts/tldrawHost.tsx:197-215, 328+` does with `BboxNodeShapeUtil` +
`nodeId`? or are tldraw shapes the document?). Report what you found in one paragraph before
writing code; if the app has no `BlockScene`, the context-menu wiring below still lands but
its handlers must first project the selection into a scene — say so and stop at the badge and
the prop if that projection does not exist. Read: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md`
§5.1, §7 Lane D, §9; `apps/storybook-basics/src/scene/codeOrigin.ts` (the contract; import it
through the app's trunk alias, never copy it), `src/scene/codeCell.ts`, `src/editor/
sourceActions.ts`, `src/components/originBadge.tsx`; the archive's `/home/bam/systemsketch/src/
code/codeModel.ts:106-131` (the old shape's props block and the `declare module
'@tldraw/tlschema'` twin that must stay in sync with the validator) and `CodeShapeUtil.tsx:53-
74` (the `createShapePropsMigrationSequence` precedent) — read-only, for the pattern;
`apps/storybook-basics/src/detach/rebuildContextMenu.tsx` (all 76 lines — the composed
`DefaultContextMenu` + `DefaultContextMenuContent` + conditional `TldrawUiMenuGroup` you copy
the shape of).

Write set: the code shape's model + util files as stream 2 named them (add the prop, the
type, the default, and — only if a version without `origin` already shipped — one migration
`AddOrigin` whose `up` sets `origin: null` and `down` deletes it, with a `WHY:` that the down
is lossy on purpose so old builds open new docs); new `src/source/originResolution.ts`
(host glue: given the board's directory and a `CodeOrigin`, read the file through whatever
file access the app has, locate the anchor by asking the backend for the definitions view
when `backend.kind === "pyblocks"` — `definitions.find(d => d.anchor === origin.anchor)` — and
hash its `text` with `crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))` →
`sha256:<hex>`; return a `CodeOriginResolution`; with no backend return `undefined`, which
`codeOriginState` reads as orphaned — a `WHY:` says why: without a backend a bound cell cannot
be verified and pretending it is synced is the one lie this design forbids); new
`src/source/sourceContextMenu.tsx` (the composed context menu with a `TldrawUiMenuGroup
id="bbox-source"` rendered only when `sourceActionsFor(backend, selection, handlers)` is
non-empty; handlers call `collapseToCode` / `expandCode` on the app's scene and write it
back; `expand` confirms when `textWasEdited`); new `src/source/backendSwitch.tsx` (a
bottom-right drop-down "Backend: none / pyblocks (stub)" persisted in `localStorage` under
`bbox.sourceBackend`, wrapped in try/catch — the "prototype switch in app" rule, feedback
2026-09-09 — that yields `{ kind: "none" } | { kind: "pyblocks" }` until stream 3's real
backend object replaces the stub; a `WHY:` names the replacement seam); the code shape's
component renders `<OriginBadge state={codeOriginState(props.origin, resolution)} />` in its
header when `props.origin !== null && resolution !== undefined`, and `<OriginBadge
state="pseudo" />` when `props.origin === null` (a pseudo cell is visibly unbound); nothing
enters the trunk's `CodeEditor` for this (rule 12). Tests beside each file in the app's own
test style.

Do not touch `apps/storybook-basics/**`, `packages/**`, `/home/bam/systemsketch`. Never bind
:4321 :4325 :5421 :5193 :5199 :4599; use the app's own dev-port override and check `ss -ltnp`
first.

Acceptance: the app's `pnpm typecheck` and `pnpm test` green; a unit test proves
`getDefaultProps().origin === null` validates, a populated origin validates, an extra key
inside `origin` is rejected by the validator, and (if present) the migration up/down pair; a
driven smoke (the app's existing smoke style, headless) right-clicks a selection with the
switch on `none` and asserts no `bbox-source` group, then on `pyblocks (stub)` and asserts
"Convert to code" present, runs it, and asserts one code shape replaced the selection. Report
the real file paths you edited (stream 2's names), the story/route Zach opens, and the one
relaunch line. Explicit pathspecs only.

---

## 9 · What Zach will see (for the report builder, after implementation)

Storybook (the lane's own `STORYBOOK_PORT`; captured from :5421 after merge):

- `scene-model-diff-codecell--round-trip` — three wired blocks → "Collapse to code" → one cell with
  the header text and the promoted ports → "Expand" → identical scene. Hero video candidate.
- `scene-model-diff-codecell--opaque-and-expanded` — the Proposal-5 toggle: opaque code face vs
  members visible, one node.
- `scene-model-diff-codecell--origin-badge-states` — Pseudo / Synced / Drifted / Orphaned, side by
  side.
- `scene-model-diff-codecell--definitions-from-stereo` — the 32-line stereo module as 6 grain-1
  cells (`Pipeline` holding `__init__` and `run`) with 4 dashed reference edges.
- `editor-menus-bars-sourceactions--backend-off` / `--backend-on` / `--convert-then-expand` — the
  right-click menu without and with the source group; the live convert → expand loop.

pyblocks: `python3 -m pyblocks analyze --view-kind definitions tests/fixtures/
definition_graph/stereo.py` — the JSON, and the `unittest -v` transcript (17 green).

The new app (Lane D, if it lands tonight): the bottom-right backend switch; right-click with
it on `pyblocks (stub)`; a code shape wearing the badge. One relaunch line from Lane D's handoff.

---

## 10 · Needs Zach — each with the recommendation and the reversible default a silent build takes

1. **Reference edges: a dependency lane, or port-level data cables?** The adapter emits
   `type: "reference"` node-level edges (dashed, a third lane) because a call between
   definitions is neither a data cable nor a control line. Recommendation: keep the third
   lane until grain-1 port semantics are drawn. Default: node-level dependency edges.
2. **Offer "Collapse to code" with NO backend as a pure organise gesture?** It would be a
   second "make composite" beside collapse-to-region. Recommendation: no — gated, absent.
   Default: absent without a backend (the tests pin this).
3. **Anchor ordinal spelling:** first occurrence bare (`f`), later `f#1`, `f#2` — vs all
   suffixed. Recommendation: first bare (a file that later grows a duplicate keeps every
   existing anchor valid). Default: first bare.
4. **`origin.uri`:** POSIX path relative to the board's directory (default) vs the viewer
   backend's `workspace:<path>` form. Recommendation: board-relative; a host converts when
   it calls the backend. Default: board-relative.
5. **Pseudo badge visible?** Default: yes, quiet (`secondary`), so an unbound cell is
   distinguishable at a glance. Reversible by editing `ORIGIN_BADGE` — but the test pins
   four distinct labels.
6. **Header parts (decorators, annotations, bases) attributed to the decorated definition**
   rather than the enclosing scope. Default: as stated; reversible in `definition_graph.py`
   with a fixture change.
7. **"Expand to blocks" on a plaintext pseudo cell** just dissolves it (discarding the note
   after a confirm). Default: offered — it is the inverse gesture; the host confirms only
   when `textWasEdited`.

Not re-asked (already settled): grain 1; text canonical when bound; organise ≠ reuse; port
marimo, never depend; report never refuse; the free-standing board (old Q3).

---

## 11 · Not verified

- **`apps/systemsketch` does not exist** in any bbox-ui worktree at planning time; Lane D's
  paths are expectations, and whether the app holds a `BlockScene` is unknown.
- **Stream 3's backend object** — only `kind: "pyblocks"` is assumed; its plan branch had
  nothing committed. Whether `pyblocks/systemsketch.py` stays on the new app's persistence
  path (old P2) is unknown, so that phase is a follow-up.
- **marimo 0.24.2 `visitor.py` line numbers** — not fetched by the planner; Lane B fetches
  and cites or writes "ours, ad hoc".
- **`hosts/nodeViews.tsx` collision with the control-flow stream** — assumed, not observed;
  Lane A avoids the file regardless.
- **Storybook play functions** — not run by the planner (no browser run tonight); the unit
  acceptance was run: `pnpm typecheck` green, `pnpm test-unit` red in exactly the four new
  files (41 of their 46 tests; the 5 green ones are the fixture guards and the frozen
  `ORIGIN_BADGE` data) and green everywhere else (59 files / 1019 tests before this commit).
- **The Python acceptance test** was validated against the planner's own `ast` oracle in a
  scratch shim (15/17 green; the 2 CLI tests need the real `pyblocks.__main__`), never
  against pyblocks itself.

---

## 12 · Follow-ups (need a design Zach has not seen, or a stream that has not landed)

- **Rung B host bridge:** expand a bound python cell by calling stream 3's backend for the
  definitions view of `origin.uri` and feeding `definitionsToScene` with `rootAnchor =
  origin.anchor`; drifted/orphaned resolution UI (re-bind / detach-to-pseudo).
- **The command write path:** rename on a synced cell through `pyblocks.commands.apply_command`
  (`commands.py:337`, `RenameFunction` `:43`); drifted/orphaned cells refuse with the state
  named.
- **pyblocks mirror v2** (`systemsketch.py`: `CODE_BLOCK_EXTENSION_VERSION 2`, `origin`,
  languages extended to the shape's set) — only if stream 3 keeps that persistence path.
- **Reference edges → ports** (needs Zach, §10.1).
- **Layout memory for expanded cells** (old D3 default: sidecar keyed by anchor; miss = re-layout).
- **Cross-file references** (`symbols.py` is the seam).
- **Registry items** for `code-cell-face` / `origin-badge` via `docs/build_menu_registry_items.py`.

## 13 · House rules every lane restates in its report

Provenance by path:line actually read; `WHY:` at every seam named above; no `git add -A`,
explicit pathspecs, `git diff --cached --name-only` before every commit; implementing is not
integrating — land on the lane branch, report, stop; a FAIL with the exact output is a valid
deliverable, an edited acceptance test is not.
