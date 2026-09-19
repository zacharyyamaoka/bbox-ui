# Lane scv:scv-origin-on-app-shape — origin on the NEW app's code shape, host resolution, the badge, the backend switch, and the source context-menu group

_Stream plan: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` (read it) · repo: **bbox-ui** · dispatcher-resolved dependencies: ['ss:L1', 'scv:scv-rung-a-scene', 'scv:scv-origin-and-actions', 'pb:app-backend-wiring'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `apps/systemsketch/src/<code shape model + util files as stream 2 named them> (add origin prop/type/default; migration only if a pre-origin version shipped)`
- `apps/systemsketch/src/source/originResolution.ts (new)`
- `apps/systemsketch/src/source/sourceContextMenu.tsx (new)`
- `apps/systemsketch/src/source/backendSwitch.tsx (new)`
- `apps/systemsketch/src/source/*.test.ts (new, the app's own test style)`

## Do not touch
- apps/storybook-basics/** (the trunk — import through the app's alias, never copy)
- packages/**
- /home/bam/systemsketch (the archive)
- apps/systemsketch files owned by other stream-2 lanes beyond the code shape's model/util and the shape component's header slot

## Acceptance (assertions you cannot edit)
- First deliverable: a one-paragraph ground report naming the real code-shape file paths and whether the app holds a trunk BlockScene (if not, land only the prop + badge and say the context-menu handlers are blocked on a shapes→scene projection)
- The app's `pnpm typecheck` and `pnpm test` green
- Unit test: getDefaultProps().origin === null validates; a populated origin validates; an extra key inside origin is rejected by the validator; if a migration was added, up adds origin: null and down strips it
- Driven smoke (headless, the app's existing style, on a free port — never :4321 :4325 :5421 :5193 :5199 :4599): right-click a two-shape selection with the bottom-right switch on `none` → no `bbox-source` group; switch to `pyblocks (stub)` → "Convert to code" present; run it → exactly one code shape replaces the selection; a bound code shape (origin set, no backend) shows the Orphaned badge; a pseudo shape shows the Pseudo badge
- Nothing added to the trunk's CodeEditor for value semantics (rule 12); the badge is rendered from codeOriginState in the shape's header
- Handoff carries the real file paths edited, the route Zach opens, and one relaunch line

Acceptance test files (committed before you existed; read them, never edit them):
- (none committed; the acceptance list above is the bar)

## Builder brief (verbatim from the planner)

You are adding the `origin` binding, its badge, and the pyblocks-gated context-menu group to the NEW SystemSketch app, `apps/systemsketch` in the bbox-ui monorepo, after stream 2's code-shape lane, Lane A (`scv-rung-a-scene`) and Lane C (`scv-origin-and-actions`) have landed on your base commit. First verify the ground: `ls apps/systemsketch/src` and find the code shape's model and shape-util files and the app's document model — does it hold a trunk `BlockScene` and project shapes from it, as `apps/storybook-basics/src/hosts/tldrawHost.tsx` lines 197-215 and 328 onward do with `BboxNodeShapeUtil` + `nodeId`? or are tldraw shapes the document? Report what you found in one paragraph before writing code; if the app has no `BlockScene`, the context-menu wiring below still lands as chrome but its handlers must first project the selection into a scene — say so, land the prop and the badge, and stop there. Read: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §5.1, §7 Lane D, §10; `apps/storybook-basics/src/scene/codeOrigin.ts` (the contract; import it through the app's trunk alias, never copy it), `src/scene/codeCell.ts`, `src/editor/sourceActions.ts`, `src/components/originBadge.tsx`; the archive's `/home/bam/systemsketch/src/code/codeModel.ts` lines 106-131 (the old shape's props block and the `declare module '@tldraw/tlschema'` twin that must stay in sync with the validator) and `CodeShapeUtil.tsx` lines 53-74 (the `createShapePropsMigrationSequence` precedent) — read-only, for the pattern; `apps/storybook-basics/src/detach/rebuildContextMenu.tsx` (all 76 lines — the composed `DefaultContextMenu` + `DefaultContextMenuContent` + conditional `TldrawUiMenuGroup` whose shape you copy); the feedback rule "prototype switch in app" (bottom-right drop-down, remembers the choice, never a URL flag).

Write set: the code shape's model + util files as stream 2 named them (add `origin: T.nullable(T.object({ uri: T.string, anchor: T.string, contentHash: T.string }))` to the props validator, `origin: CodeOrigin | null` to the `TLGlobalShapePropsMap` entry, `origin: null` to `getDefaultProps()`, and — only if a version without `origin` already shipped — one migration `AddOrigin` whose `up` sets `origin: null` and `down` deletes it, with a `WHY:` that the down is lossy on purpose so old builds open new docs); new `src/source/originResolution.ts` (host glue: given the board's directory and a `CodeOrigin`, read the file through whatever file access the app has, locate the anchor by asking the backend for the definitions view when `backend.kind === "pyblocks"` — `view.definitions.find(d => d.anchor === origin.anchor)` — and hash its `text` with `crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))` rendered as `sha256:<lower-hex>`; return a `CodeOriginResolution`; with no backend return `undefined`, which `codeOriginState` reads as orphaned — a `WHY:` says why: without a backend a bound cell cannot be verified and pretending it is synced is the one lie this design forbids); new `src/source/sourceContextMenu.tsx` (the composed context menu with a `TldrawUiMenuGroup id="bbox-source"` rendered only when `sourceActionsFor(backend, selection, handlers)` is non-empty, one `TldrawUiMenuItem` per row with `id={row.id}` and `label={row.label}` and `onSelect={row.run}`; handlers call `collapseToCode` / `expandCode` on the app's scene and write it back; `expand` confirms when `textWasEdited`; every stock item stays); new `src/source/backendSwitch.tsx` (a bottom-right drop-down "Backend: none / pyblocks (stub)" persisted in `localStorage` under `bbox.sourceBackend`, every read/write wrapped in try/catch, yielding `{ kind: "none" } | { kind: "pyblocks" }` until stream 3's real backend object replaces the stub; a `WHY:` names the replacement seam and cites the feedback rule); the code shape's component renders `<OriginBadge state={codeOriginState(props.origin, resolution)} />` in its header when `props.origin !== null && resolution !== undefined`, and `<OriginBadge state="pseudo" />` when `props.origin === null` (a pseudo cell is visibly unbound); while a bound cell's resolution is still pending render no badge. Nothing enters the trunk's `CodeEditor` for this (plan rule 12). Tests beside each file in the app's own test style.

Do not touch `apps/storybook-basics/**`, `packages/**`, `/home/bam/systemsketch`, or files other stream-2 lanes own beyond the code shape's model/util and its component's header slot. Never bind :4321 :4325 :5421 :5193 :5199 :4599; use the app's own dev-port override and check `ss -ltnp` first.

Acceptance: the app's `pnpm typecheck` and `pnpm test` green; a unit test proves `getDefaultProps().origin === null` validates, a populated origin validates, an extra key inside `origin` is rejected by the validator, and (if present) the migration up/down pair; a driven smoke (the app's existing headless style) right-clicks a two-shape selection with the switch on `none` and asserts no `bbox-source` group, then on `pyblocks (stub)` and asserts "Convert to code" present, runs it, and asserts one code shape replaced the selection; a shape with `origin` set and no backend shows the Orphaned badge and a pseudo shape shows the Pseudo badge. Report the real file paths you edited (stream 2's names), the route Zach opens, and the one relaunch line. FAIL with the exact output is a valid deliverable. Explicit pathspecs only; never `git add -A`.

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
