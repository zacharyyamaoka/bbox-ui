# Lane scv:scv-rung-a-scene — Rung A in the trunk: collapseToCode/expandCode, definitions→scene adapter, code-cell face, origin badge, stories

_Stream plan: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: none (day-0) · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/scene/codeCell.ts (fill bodies only; signatures frozen)`
- `apps/storybook-basics/src/scene/definitionsToScene.ts (fill body only)`
- `apps/storybook-basics/src/components/originBadge.tsx (new)`
- `apps/storybook-basics/src/components/codeCellFace.tsx (new)`
- `apps/storybook-basics/src/stories/CodeCell.stories.tsx (new)`

## Do not touch
- apps/storybook-basics/src/scene/collapse.ts
- apps/storybook-basics/src/scene/boundary.ts
- apps/storybook-basics/src/scene/region.ts
- apps/storybook-basics/src/scene/scene.ts
- apps/storybook-basics/src/scene/linking.ts
- apps/storybook-basics/src/scene/codeOrigin.ts
- apps/storybook-basics/src/components/codeEditor.tsx
- apps/storybook-basics/src/components/block.tsx
- apps/storybook-basics/src/components/badge.tsx
- apps/storybook-basics/src/hosts/** (control-flow stream owns region rendering there)
- apps/storybook-basics/src/editor/**
- every *.test.ts
- apps/storybook-basics/vitest.config.ts
- packages/**
- docs/acceptance/**

## Acceptance (assertions you cannot edit)
- From apps/storybook-basics: `pnpm typecheck` exits 0
- `pnpm test-unit`: src/scene/codeCell.test.ts fully green (13 tests) and src/scene/definitionsToScene.test.ts fully green (11 tests); no other file newly red (codeOrigin.test.ts and editor/sourceActions.test.ts stay red until Lane C — expected)
- `pnpm test`: every story in src/stories/CodeCell.stories.tsx green (RoundTrip, OpaqueAndExpanded, OriginBadgeStates, DefinitionsFromStereo), each play function's first testing-library call is findBy*
- collapseToCode's regionId/ports/conflicts/hidden/edges deep-equal a parallel collapseToRegion run with the same mintId counter (asserted by the test); expandCode restores the original scene with toEqual and reports discardedText/textWasEdited
- definitionsToScene(<module>) on the frozen stereo fixture yields 6 region nodes (Pipeline holding __init__ and run), 4 node-level `reference` edges with no handles, ids id1..id6 then id7..id10, findDanglingEdges === []
- Provenance/WHY comments present at: codeCellHeader (annotation not code), expandCode (returns what it discards), the reference-edge seam (third lane), the opaque/expanded toggle (Proposal 5)

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/scene/codeCell.test.ts`
- `apps/storybook-basics/src/scene/definitionsToScene.test.ts`
- `docs/acceptance/pyblocks/stereo_definitions.expected.json`

## Builder brief (verbatim from the planner)

You are building Rung A of bbox-ui's source-code view in the trunk, `apps/storybook-basics`, plus the pure adapter from pyblocks' definitions view to a scene. Work in your own worktree off `claude/plan-source-code-view-2026-09-18` (commit b0dd1cc; `.claude/settings.json` carries `worktree.baseRef: "head"`); run `pnpm install --filter bbox-storybook-basics...` first (about 1 s). Read, in this order: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §1–§6; `src/scene/collapse.ts` (all 444 lines — your two functions are thin wrappers over `collapseToRegion` lines 175-284 and `dissolveRegion` lines 335-414); `src/scene/region.ts` (`REGION_NODE_TYPE`, `isRegion`, `descendantsOf` 95-110, `selectionRoots` 122-129); `src/scene/codeCell.ts`, `src/scene/definitionsToScene.ts`, `src/scene/codeOrigin.ts` (the frozen contracts — every type, constant and doc comment binds; fill the throwing bodies, never move a signature); the acceptance tests `src/scene/codeCell.test.ts` and `src/scene/definitionsToScene.test.ts` (off-limits to you — they define done); `docs/acceptance/pyblocks/stereo_definitions.expected.json` (the fixture the adapter test reads); `src/components/block.tsx`, `blockPort.tsx`, `badge.tsx`, `codeEditor.tsx` (props only); `src/stories/Scene.stories.tsx` lines 77-130 and `src/stories/EdgeDropMenu.stories.tsx` lines 1-60 (the story-owned host-adapter pattern you will copy); `CLAUDE.md` sections "Story tags" and "A play function's first testing-library call should be findBy*".

Write set, exhaustively: `src/scene/codeCell.ts`, `src/scene/definitionsToScene.ts`, `src/components/originBadge.tsx` (new), `src/components/codeCellFace.tsx` (new), `src/stories/CodeCell.stories.tsx` (new). Do NOT touch `collapse.ts`, `boundary.ts`, `region.ts`, `scene.ts`, `codeEditor.tsx`, `block.tsx`, `badge.tsx`, anything under `src/hosts/` (the control-flow stream is adding region rendering there — a story-local adapter avoids the collision), `src/editor/**`, `scene/codeOrigin.ts`, any `*.test.ts`, `vitest.config.ts`, `packages/**`.

`codeCell.ts`: `isCodeCell` = `isRegion(node) && typeof node.data.codeCell === "object" && node.data.codeCell !== null`. `codeCellHeader` produces EXACTLY the two-line string in its doc comment (the test pins singular/plural/zero). `collapseToCode`: compute the root names first — `selectionRoots(scene, descendantsOf(scene, nodeIds))` in scene order, named by `options.nameOf ?? (node => typeof node.data.name === "string" ? node.data.name : node.id)` — then call `collapseToRegion(scene, nodeIds, { ...options, regionData: { ...(options.regionData ?? {}), codeCell: { language: options.language ?? CODE_CELL_LANGUAGE_PLAINTEXT, source: codeCellHeader(names), origin: null } } as N })` and return its result unchanged, refusals included. Do not call `mintId` yourself before the wrapped call — the test asserts your `regionId`, `ports`, `conflicts`, `hidden` and edges deep-equal a parallel `collapseToRegion` run with the same counter. `expandCode`: find the node; if absent return `{ scene, rewired: [], removedStubs: [], orphaned: [], released: [], discardedText: null, textWasEdited: false }` with the SAME `scene` object; otherwise `const dissolved = dissolveRegion(scene, cellId, options)`; `discardedText` = `isCodeCell(node) ? node.data.codeCell.source : null`; `textWasEdited` = `discardedText !== null && discardedText !== codeCellHeader(<names of the cell's direct children in scene order, same nameOf default>)`. Leave a `WHY:` at the header seam (the text is annotation because there is no parser at Rung A; the subgraph in the scene is the truth — plan §1, Q1 default) and a `WHY:` at `expandCode` on why it returns what it discards rather than refusing.

`definitionsToScene.ts`: validate `rootAnchor` exists (else `{ ok: false, refusal: { severity: "error", code: UNKNOWN_ROOT_ANCHOR, message } }`); walk `view.definitions` in order keeping only strict descendants of the root (follow `parent` chains); mint one node id per kept definition in that order, then build nodes `{ id, type: REGION_NODE_TYPE, position, data: { name, codeCell: { language: "python", source: text, origin: { uri: options.uri, anchor, contentHash } }, definition: { kind, signature, parameters, outputs } }, parentId }` where `parentId` = the parent's minted id if the parent was kept, else `options.parentId` if given, else OMIT the key (never an undefined-valued key — the test uses toEqual). `position` = `(options.place ?? ((_, index) => ({ x: 24, y: 24 + index * 160 })))(definition, siblingIndex, depth)` — `siblingIndex` counts among kept definitions sharing the same parent, `depth` is 0 for the root's direct children. Then edges: for each `view.references` in order, if both `from` and `to` were kept push `{ id: mintId(), type: REFERENCE_EDGE_TYPE, source, target, data: { kind, lines: [...lines] } }`; if exactly one was kept push a shallow copy of the reference to `external`; else drop it. Never mutate `view`. `WHY:` at the edge seam: references are a dependency lane, neither data cable nor control line (plan §6).

`originBadge.tsx`: `export function OriginBadge({ state, size }: { state: CodeOriginState; size?: BadgeProps["size"] })` renders `<Badge data-slot="origin-badge" data-state={state} variant={ORIGIN_BADGE[state].variant} size={size} title={ORIGIN_BADGE[state].description}>{ORIGIN_BADGE[state].label}</Badge>`. Nothing else; the four-state data is frozen in `codeOrigin.ts`.

`codeCellFace.tsx`: props in, DOM out. `CodeCellFace({ id, name, cell: CodeCellPayload, originState?: CodeOriginState, view: "opaque" | "expanded", members?: BlockMember[], ports?: <BlockPort's edges prop>, width?, onSourceWrite?(next: string) })`. Renders `BlockPort` around a `Block` whose `header` is a plain row: the name, then `<OriginBadge>` when `originState` is given; `body` (opaque) = `<CodeEditor value={cell.source} multiline lineNumbers language={cell.language === "python" ? python() : undefined} onWrite={onSourceWrite ?? (() => {})} />`; `members` (expanded) = the given members with `membersLayout="stack"`. Put `data-slot="code-cell-face"` and `data-view` on the root. `WHY:` at the view toggle: Zach's Proposal 5 — "when you collapse one of these regions it can look like this honest port view first" — opaque is the default face, expanded is the toggle, both over ONE node.

`CodeCell.stories.tsx`: `title: "Blocks/Scene/Code Cell"`, `tags: ["area:blocks", "lane:scv-rung-a-scene"]`. A story-local host (positioned divs + `WireLayer` + `sceneWires`, the `Scene.stories.tsx` pattern) that renders a small scene where a `region` node with `data.codeCell` paints as `CodeCellFace` and everything else as a `BlockPort`+`Block`. Stories: `RoundTrip` (a "Collapse to code" button runs `collapseToCode` on a fixed selection, an "Expand" button runs `expandCode`; play: await the cell's `[data-slot="code-cell-face"]` with findBy*, assert the collapsed members are no longer top-level, click Expand, assert the scene equals the original via a `data-scene` JSON attribute the story writes on its root), `OpaqueAndExpanded` (a toggle; play asserts `data-view` flips and members appear), `OriginBadgeStates` (four faces, one per state from `CODE_ORIGIN_STATES`; play asserts four `[data-slot="origin-badge"]` with distinct `data-state`), `DefinitionsFromStereo` (static `import view from "../../../../docs/acceptance/pyblocks/stereo_definitions.expected.json"` — resolveJsonModule is on — run `definitionsToScene` from `<module>`, render 6 faces with `Pipeline` holding two members, and 4 dashed reference edges through `WireLayer` by giving `type === "reference"` edges a dashed style in your adapter; play asserts 6 faces and 4 reference wires). Every play function's first testing-library call is findBy*.

Acceptance, exactly: from `apps/storybook-basics`, `pnpm typecheck` exit 0; `pnpm test-unit` shows `src/scene/codeCell.test.ts` and `src/scene/definitionsToScene.test.ts` fully green (13 + 11 tests) and no other file newly red (`codeOrigin.test.ts` and `sourceActions.test.ts` stay red until Lane C — expected); `pnpm test` shows every `CodeCell.stories.tsx` story green. If an assertion cannot be met, report FAIL with the exact output — do not edit the test. Commit with explicit pathspecs only; never `git add -A`; read `git diff --cached --name-only` before committing. Report the story ids (`scene-codecell--round-trip`, `--opaque-and-expanded`, `--origin-badge-states`, `--definitions-from-stereo`) in your handoff.

## Contracts of this stream (for reference; the plan .md has the full context)

### CodeOrigin + codeOriginState (the binding and its four computed states)
_owner: source-code-view (Lane C fills bodies; types frozen at b0dd1cc) · consumers: systemsketch-rebuild (code shape prop), source-code-view Lane A/D, pyblocks-backend (resolution producer), pyblocks (mirror v2, follow-up)_

```
// apps/storybook-basics/src/scene/codeOrigin.ts
export interface CodeOrigin {
  uri: string;          // POSIX path relative to the board document's directory
  anchor: string;       // "<module>" | dotted qualname | "f#1" (ordinal suffix only on duplicates, first bare)
  contentHash: string;  // "sha256:<hex64>" over the anchored span's exact bytes at last sync
}
export type CodeOriginState = "pseudo" | "synced" | "drifted" | "orphaned";
export const CODE_ORIGIN_STATES: readonly CodeOriginState[];
export interface CodeOriginResolution { fileFound: boolean; anchorFound: boolean; spanHash?: string; }
export function codeOriginState(origin: CodeOrigin | null | undefined, resolution: CodeOriginResolution | undefined): CodeOriginState;
//   null origin → "pseudo" (beats any resolution); no resolution / !fileFound / !anchorFound / no spanHash → "orphaned"; spanHash === contentHash (exact string) → "synced"; else "drifted"
export function isCodeOrigin(value: unknown): value is CodeOrigin;  // exact keys {uri, anchor, contentHash}, non-empty, /^sha256:[0-9a-f]{64}$/
export interface OriginBadgeSpec { label: string; variant: "secondary" | "outline" | "warning" | "destructive"; description: string; }
export const ORIGIN_BADGE: Readonly<Record<CodeOriginState, OriginBadgeSpec>>;  // pseudo=secondary "Pseudo", synced=outline "Synced", drifted=warning "Drifted", orphaned=destructive "Orphaned"

// The tldraw prop stream 2 reserves on the NEW app's code shape (Lane D implements):
//   props validator:  origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string })),
//   TLGlobalShapePropsMap entry:  origin: CodeOrigin | null
//   getDefaultProps():  origin: null
```

### CodeCellData + collapseToCode / expandCode (Rung A)
_owner: source-code-view (Lane A) · consumers: source-code-view Lane C/D, systemsketch-rebuild (renders a region with data.codeCell), control-flow (must leave region nodes with data.codeCell alone)_

```
// apps/storybook-basics/src/scene/codeCell.ts
export interface CodeCellPayload { language: string; source: string; origin: CodeOrigin | null; }
export type CodeCellData = SceneData & { codeCell: CodeCellPayload };   // on a node whose type === REGION_NODE_TYPE ("region")
export const CODE_CELL_LANGUAGE_PLAINTEXT = "plaintext";
export function isCodeCell(node: SceneNode<SceneData>): node is SceneNode<CodeCellData>;   // isRegion(node) && data.codeCell is an object
export function codeCellHeader(memberNames: readonly string[]): string;
//   "# code cell — 3 blocks: A, B, C\n# annotation only until a backend is connected; expand restores the blocks\n"  ("1 block: A"; "0 blocks")
export interface CollapseToCodeOptions<N extends SceneData = SceneData, E extends SceneData = SceneData> extends CollapseOptions<N, E> {
  language?: string;                          // default CODE_CELL_LANGUAGE_PLAINTEXT
  nameOf?: (node: SceneNode<N>) => string;    // default: data.name if string else node.id; only selectionRoots are named
}
export function collapseToCode<N extends SceneData, E extends SceneData>(scene: BlockScene<N, E>, nodeIds: readonly string[], options: CollapseToCodeOptions<N, E>): CollapseResult<N, E>;
//   === collapseToRegion(scene, nodeIds, { ...options, regionData: { ...regionData, codeCell: { language, source: codeCellHeader(rootNames), origin: null } } })
export interface ExpandCodeResult<N extends SceneData, E extends SceneData> extends DissolveResult<N, E> { discardedText: string | null; textWasEdited: boolean; }
export function expandCode<N extends SceneData, E extends SceneData>(scene: BlockScene<N, E>, cellId: string, options?: DissolveOptions): ExpandCodeResult<N, E>;
//   === dissolveRegion(...) + { discardedText: cell.codeCell.source | null, textWasEdited: discardedText !== codeCellHeader(childNames) }; unknown id → SAME scene object
```

### DefinitionsView (pyblocks `analyze --view-kind definitions` JSON) + definitionsToScene adapter
_owner: pyblocks (Lane B emits the JSON; `pyblocks.definition_graph.definitions_view(source, filename) -> dict`) — the TS types and the adapter are source-code-view Lane A · consumers: source-code-view Lane A (adapter), Lane D (Rung B follow-up), pyblocks-backend (must expose viewKind 'definitions' through its bridge)_

```
// FROZEN fixture: docs/acceptance/pyblocks/stereo_definitions.expected.json (read by BOTH repos' tests)
// TS mirror: apps/storybook-basics/src/scene/definitionsToScene.ts
export interface DefinitionSpan { startLine: number; startColumn: number; endLine: number; endColumn: number; columnEncoding: "utf8-bytes"; }  // 1-based lines, 0-based UTF-8 byte cols, end exclusive
export type DefinitionKind = "module" | "class" | "function" | "async-function";
export interface DefinitionParameter { name: string; annotation: string | null; }   // posonly, args, *vararg, kwonly, **kwarg order
export interface DefinitionOutput { name: string; dataType: string | null; }         // PB1 named outputs (dialect.output_ports_by_qualname)
export interface SourceDefinition {
  anchor: string;            // "<module>" | qualname | "f#1"
  name: string;              // bare name; "<module>"
  kind: DefinitionKind;
  parent: string | null;     // parent's anchor; null only for the module
  ordinal: number;           // 0 normally; n for the n-th duplicate
  span: DefinitionSpan;      // start = first decorator line (or def/class line) at column 0; end = AST end; module = (1,0,len(split('\n')),utf8len(last))
  signature: string;         // "module" | "class Pipeline" | "def Pipeline.run(self, left, right)" | "async def …" (pyblocks' own spelling)
  parameters: DefinitionParameter[];
  outputs: DefinitionOutput[];
  contentHash: string;       // "sha256:<hex64>" of `text`; module's == "sha256:" + source.sha256
  text: string;              // exact span bytes as UTF-8
}
export type ReferenceKind = "call" | "name" | "attribute";
export interface SourceReference { from: string; to: string; kind: ReferenceKind; lines: number[]; }  // sorted (from idx, to idx, call<name<attribute); lines ascending unique
export interface DefinitionsDiagnostic { severity: "info" | "warning" | "error"; code: string; message: string; anchor: string | null; }  // "duplicate-definition", "syntax-error"
export interface DefinitionsView {
  schemaVersion: 1; kind: "definitions";
  source: { name: string; lineCount: number; sha256: string };
  definitions: SourceDefinition[];   // source order, module first, parent before children; JSON key order exactly as listed here
  references: SourceReference[];
  diagnostics: DefinitionsDiagnostic[];
}
// Resolution rules: bare Name → enclosing FUNCTION scopes then module, class scopes skipped; self.x/cls.x → sibling method Class.x ("attribute"); header parts attributed to the decorated def; self-references and non-definitions dropped; syntax error → module record + error diagnostic (total); duplicates → both records + warning on the later one.

export const REFERENCE_EDGE_TYPE = "reference";
export interface ReferenceEdgeData extends Record<string, unknown> { kind: ReferenceKind; lines: number[]; }
export type DefinitionNodeData = CodeCellData & { name: string; definition: { kind: DefinitionKind; signature: string; parameters: DefinitionParameter[]; outputs: DefinitionOutput[] } };
export interface DefinitionsToSceneOptions { rootAnchor: string; mintId: () => string; uri: string; parentId?: string; place?: (definition: SourceDefinition, index: number, depth: number) => ScenePosition; }
export interface DefinitionsToSceneSuccess { ok: true; scene: BlockScene<DefinitionNodeData, ReferenceEdgeData>; nodeIdByAnchor: Record<string, string>; external: SourceReference[]; }
export type DefinitionsToSceneResult = DefinitionsToSceneSuccess | { ok: false; refusal: ConnectionMessage };
export const UNKNOWN_ROOT_ANCHOR = "unknown-root-anchor";
export function definitionsToScene(view: DefinitionsView, options: DefinitionsToSceneOptions): DefinitionsToSceneResult;
//   one `region` node per strict descendant of rootAnchor (data = { name, codeCell: { language: "python", source: text, origin: { uri, anchor, contentHash } }, definition }), parentId = parent's node id | options.parentId | omitted;
//   one node-level `reference` edge (no handles) per reference with BOTH endpoints produced; single-ended → `external`; ids minted nodes-first then edges

// CLI: python3 -m pyblocks analyze --view-kind {blockview,definitions} <file>   (default blockview, byte-identical to today)
```

### SourceBackendRef + sourceActionsFor (the pyblocks gate and the two menu rows)
_owner: source-code-view (Lane C) · consumers: pyblocks-backend (its backend object MUST carry kind: 'pyblocks'), source-code-view Lane D, systemsketch-rebuild (context-menu slot)_

```
// apps/storybook-basics/src/editor/sourceActions.ts
export const PYBLOCKS_BACKEND_KIND = "pyblocks" as const;
export interface SourceBackendRef { readonly kind: string; }          // the ONLY field the kit reads off a backend
export const SOURCE_ACTION_IDS = { convertToCode: "convert-to-code", expandToBlocks: "expand-to-blocks" } as const;
export type SourceActionId = "convert-to-code" | "expand-to-blocks";
export const SOURCE_ACTION_LABELS: Readonly<Record<SourceActionId, string>>;   // "Convert to code", "Expand to blocks"
export interface SourceActionSelection { nodeIds: readonly string[]; isCodeCell: (nodeId: string) => boolean; }
export interface SourceActionHandlers { convertToCode(nodeIds: readonly string[]): void; expandToBlocks(cellId: string): void; }
export interface SourceAction extends MenuAction { id: SourceActionId; }   // MenuAction from components/chromeBar.tsx: { id, label, icon?, shortcut?, disabled?, destructive?, run() }
export function sourceActionsFor(backend: SourceBackendRef | null | undefined, selection: SourceActionSelection, handlers: SourceActionHandlers): SourceAction[];
//   backend?.kind !== "pyblocks" → []  (ABSENT, never disabled)
//   convert-to-code  iff nodeIds.length >= 1 && some id is NOT a code cell → run: convertToCode([...nodeIds])
//   expand-to-blocks iff nodeIds.length === 1 && isCodeCell(nodeIds[0])    → run: expandToBlocks(nodeIds[0])
//   order: convert before expand; `disabled` never set
```
