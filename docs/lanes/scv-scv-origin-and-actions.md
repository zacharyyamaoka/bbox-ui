# Lane scv:scv-origin-and-actions — The four-state origin judge, the pyblocks-gated source actions, the right-click story, and the decision record

_Stream plan: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['scv:scv-rung-a-scene'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/storybook-basics/src/scene/codeOrigin.ts (bodies of codeOriginState and isCodeOrigin only)`
- `apps/storybook-basics/src/editor/sourceActions.ts (body of sourceActionsFor only)`
- `apps/storybook-basics/src/stories/SourceActions.stories.tsx (new)`
- `apps/storybook-basics/src/editor/README.md (one new section)`
- `docs/peps/0004-code-cell-origin-binding.md (new)`

## Do not touch
- apps/storybook-basics/src/components/context-menu.tsx
- apps/storybook-basics/src/components/chromeBar.tsx
- apps/storybook-basics/src/hosts/**
- Lane A's files (scene/codeCell.ts, scene/definitionsToScene.ts, components/codeCellFace.tsx, components/originBadge.tsx, stories/CodeCell.stories.tsx) — import only
- every *.test.ts
- packages/**
- docs/acceptance/**

## Acceptance (assertions you cannot edit)
- `pnpm typecheck` exits 0
- `pnpm test-unit`: src/scene/codeOrigin.test.ts fully green (13 tests) and src/editor/sourceActions.test.ts fully green (9 tests); nothing else newly red
- `pnpm test`: SourceActions.stories.tsx stories BackendOff, BackendOn, ConvertThenExpand green; BackendOff asserts the stock rows ARE present and `[data-slot="source-actions"]` is absent from document.body (no vacuous negative); BackendOn asserts source-action-convert-to-code present/expand absent on a two-block selection, then expand present/convert absent on the new cell
- codeOriginState returns pseudo for a null origin regardless of resolution; orphaned for missing resolution/file/anchor/spanHash; synced only on exact string equality; drifted otherwise; never throws
- docs/peps/0004-code-cell-origin-binding.md exists in the docs/peps/README.md shape with the seam line, and codeOrigin.ts carries a WHY pointing at it

Acceptance test files (committed before you existed; read them, never edit them):
- `apps/storybook-basics/src/scene/codeOrigin.test.ts`
- `apps/storybook-basics/src/editor/sourceActions.test.ts`

## Builder brief (verbatim from the planner)

You are building the four-state origin judge and the pyblocks-gated source actions in bbox-ui's trunk, `apps/storybook-basics`, after Lane A (`scv-rung-a-scene`) has landed — branch from the commit that contains `src/components/codeCellFace.tsx` and `src/components/originBadge.tsx`; run `pnpm install --filter bbox-storybook-basics...` first. Read: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §3, §5.1, §5.5, §6; `src/scene/codeOrigin.ts` and `src/editor/sourceActions.ts` (frozen contracts — fill the throwing bodies; every type, constant and doc comment binds); the acceptance tests `src/scene/codeOrigin.test.ts` and `src/editor/sourceActions.test.ts` (off-limits — they define done); `src/editor/edgeDropMenu.tsx` lines 42-51 and 217-221 (the one-gate rule you mirror); `src/editor/README.md` (you add a section); `src/components/context-menu.tsx` exports and `src/stories/ContextMenu.stories.tsx` lines 33-128 (how a right-click menu is driven in a play function: `fireEvent.contextMenu`, `within(document.body)`, `[data-slot="context-menu-content"]`, Escape closes one level at a time); `src/components/chromeBar.tsx` lines 72-83 (`MenuAction`); `src/scene/codeCell.ts` and `src/components/codeCellFace.tsx` (Lane A's — you call them, you do not edit them); `docs/peps/README.md` and `docs/peps/0003-collapse-mutates-the-document.md` (the record shape).

Write set: `src/scene/codeOrigin.ts` (bodies of `codeOriginState` and `isCodeOrigin` only), `src/editor/sourceActions.ts` (body of `sourceActionsFor` only), `src/stories/SourceActions.stories.tsx` (new), `src/editor/README.md` (one new section), `docs/peps/0004-code-cell-origin-binding.md` (new). Do not touch anything else — not `context-menu.tsx`, not `chromeBar.tsx`, not `src/hosts/**`, not Lane A's files, not any `*.test.ts`.

`codeOriginState`: `if (origin == null) return "pseudo"; if (!resolution || !resolution.fileFound || !resolution.anchorFound || typeof resolution.spanHash !== "string") return "orphaned"; return resolution.spanHash === origin.contentHash ? "synced" : "drifted";` — total, exact string compare, no normalisation (the tests pin an upper-cased hash and a prefix-less hash as `drifted`, and `{}` as a resolution as `orphaned`). `WHY:` at the null check: pseudo wins over any resolution because a null origin has nothing to resolve. `isCodeOrigin`: a plain object (not null, not an array) whose own keys are exactly `uri`, `anchor`, `contentHash`, each a non-empty string, `contentHash` matching `/^sha256:[0-9a-f]{64}$/` (lower-case hex only). `WHY:`: exact keys mirror pyblocks' `_is_exact_v1` (`systemsketch.py:415`) so a record that later round-trips through the mirror cannot carry a key one side ignores.

`sourceActionsFor`: `if (backend?.kind !== PYBLOCKS_BACKEND_KIND) return [];` then with `ids = selection.nodeIds`: push `convert-to-code` when `ids.length >= 1 && ids.some(id => !selection.isCodeCell(id))` with `run: () => handlers.convertToCode([...ids])` (copy the array; the test checks the caller's array is not mutated and `toHaveBeenCalledWith` the same ids); push `expand-to-blocks` when `ids.length === 1 && selection.isCodeCell(ids[0])` with `run: () => handlers.expandToBlocks(ids[0])`. Each row is `{ id, label: SOURCE_ACTION_LABELS[id], run }` — never set `disabled`. Convert before expand. `WHY:` at the gate: absent, not disabled (edgeDropMenu's rule; Zach's "menu items that could appear if pyblocks is enabled").

`SourceActions.stories.tsx`: `title: "Blocks/Editor/Source Actions"`, `tags: ["area:blocks", "lane:scv-origin-and-actions"]`. A story-local host: a small scene (three blocks A→B→C wired in a chain, rendered with the same story-owned adapter Lane A's `CodeCell.stories.tsx` uses — copy its adapter code into this file rather than importing from `src/hosts/`), a selection model (click toggles selection; a "Select A, B" button for the play), a `ContextMenu` whose `ContextMenuTrigger` wraps the canvas, and a bottom-right `<select data-slot="backend-switch">` with options `none` / `pyblocks` (the "prototype switch in app" rule — cite feedback 2026-09-09 in a `WHY:`; never a URL flag). `ContextMenuContent` renders two stock demo rows (e.g. "Rename", "Delete") and, from `sourceActionsFor(backend, { nodeIds, isCodeCell: id => isCodeCell(nodeById(id)) }, handlers)`, a `ContextMenuGroup data-slot="source-actions"` with one `ContextMenuItem data-testid={`source-action-${id}`}` per row — the group is rendered only when the array is non-empty. Handlers: `convertToCode` → `collapseToCode(scene, ids, { mintId, directionOf })` and set the scene when `ok`; `expandToBlocks` → `expandCode(scene, id)`, calling `window.confirm` only when `textWasEdited` (stub it in the play). Stories: `BackendOff` (play: findBy* the canvas, `fireEvent.contextMenu`, `waitFor` the content, assert the stock rows ARE present and `document.body.querySelector('[data-slot="source-actions"]')` is null — a vacuous negative is not proof), `BackendOn` (play: select `pyblocks` in the switch, click "Select A, B", right-click, assert `source-action-convert-to-code` present and `source-action-expand-to-blocks` absent; click convert; right-click the new cell's face; assert expand present and convert absent), `ConvertThenExpand` (play: convert, expand, assert the scene JSON on the root's `data-scene` equals the original). Every play function's first testing-library call is findBy*; Base UI portals the popup to `document.body`, so query through `within(document.body)`.

`docs/peps/0004-code-cell-origin-binding.md`: the `docs/peps/README.md` shape (Status/Date/Decided by/Seam header; The ruling / What forced it / Options weighed / What we give up / What would reopen it), seam `apps/storybook-basics/src/scene/codeOrigin.ts:<line of codeOriginState>`; the ruling: the first semantic field on a code node is a binding (pointer + hash), not a setting; options weighed: a board/app mode flag, a DO-NOT-EDIT header, a line:col anchor; what we give up: an unresolvable anchor is reported, never re-guessed, and a down-migration in any host is lossy on purpose. Add a `WHY:` line at the seam pointing at the record. `src/editor/README.md`: a `## sourceActions.ts — the pyblocks-gated source actions` section in the style of the edge-drop-menu section (what it is, the gate, why absent-not-disabled, where the chrome lives).

Acceptance: `pnpm typecheck` exit 0; `pnpm test-unit` — `src/scene/codeOrigin.test.ts` (13) and `src/editor/sourceActions.test.ts` (9) green, nothing else newly red; `pnpm test` — all three `SourceActions.stories.tsx` stories green. FAIL with the exact output is a valid deliverable; editing a test is not. Explicit pathspecs only; never `git add -A`. Report the story ids (`blocks-editor-source-actions--backend-off`, `--backend-on`, `--convert-then-expand`) in your handoff.

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
