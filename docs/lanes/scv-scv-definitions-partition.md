# Lane scv:scv-definitions-partition — The grain-1 definitions view in pyblocks: definition_graph.py + `analyze --view-kind definitions` + frozen fixture

_Stream plan: `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` (read it) · repo: **pyblocks** · dispatcher-resolved dependencies: ['pb:pyblocks-scene-projection'] · barrier: False_

## Write set (the ONLY paths you may create or edit)
- `pyblocks/definition_graph.py (new)`
- `pyblocks/__main__.py (add --view-kind {blockview,definitions} to `analyze`, default blockview, lines ~233-238 and the handler at ~340-343)`
- `examples/systemsketch_goldens/** (ONE new definitions-view case only if goldens.py admits it without harness edits; else skip and say so)`

## Do not touch
- pyblocks/analyzer.py
- pyblocks/python_adapter.py
- pyblocks/blockview.py
- pyblocks/symbols.py
- pyblocks/commands.py
- pyblocks/systemsketch.py
- pyblocks/identity.py
- pyblocks/dialect.py
- pyblocks/goldens.py
- every existing test under tests/
- tests/test_definition_graph.py and tests/fixtures/definition_graph/* (acceptance, copied in by the dispatcher)
- vscode-pyblocks/**, vscode-systemsketch/**
- /home/bam/pyblocks root checkout (dirty peer work)
- /home/bam/pyblocks/.claude/worktrees/pyblocks-viewer-library-40c1f2 (live P1 lane)

## Acceptance (assertions you cannot edit)
- Dispatcher pre-step: copy docs/acceptance/pyblocks/test_definition_graph.py → tests/test_definition_graph.py, stereo_fixture.py → tests/fixtures/definition_graph/stereo.py, stereo_definitions.expected.json → tests/fixtures/definition_graph/stereo_definitions.expected.json, byte for byte, and commit them on the lane branch before dispatch
- `python3 -m unittest tests.test_definition_graph -v` — 17 tests green, including test_matches_the_frozen_expected_json_exactly (dict equality against the fixture) and both CLI tests (`--view-kind definitions` output equals the fixture after replacing source.name; `--view module` output still has `views` and no `kind`)
- `python3 -m unittest discover -s tests -v` — no new failures versus main 6a64e0c
- definition_graph.py header cites marimo 0.24.2 `marimo/_ast/visitor.py:<lines actually read>` with the Apache-2.0 notice, or states "ours, ad hoc" — never a citation from memory; ryvencore not read
- Static only: the module never imports or executes the analyzed source (analyzer.py's founding rule)
- WHY comments at: the class-scope skip, header-part attribution, ordinal-not-line:col anchor, the report-never-refuse total path

Acceptance test files (committed before you existed; read them, never edit them):
- `docs/acceptance/pyblocks/test_definition_graph.py`
- `docs/acceptance/pyblocks/stereo_fixture.py`
- `docs/acceptance/pyblocks/stereo_definitions.expected.json`
- `docs/acceptance/pyblocks/README.md`

## Builder brief (verbatim from the planner)

You are building pyblocks' definitions view — the grain-1 partition: one record per definition (module, class, def, nested def, recursively) with exact spans, hashes, signatures, ports, and the references between definitions. It is the one genuinely new algorithm in the source-code view, and its JSON is a frozen cross-repo contract. Work in a fresh worktree off `main`: `git -C /home/bam/pyblocks worktree add /home/bam/pyblocks/.claude/worktrees/scv-definitions-2026-09-18 -b claude/scv-definitions-2026-09-18 main`. Never touch the root checkout (a peer's staged work is there) or `.claude/worktrees/pyblocks-viewer-library-40c1f2` (a live lane). The dispatcher has committed three files on your branch before you start — `tests/test_definition_graph.py`, `tests/fixtures/definition_graph/stereo.py`, `tests/fixtures/definition_graph/stereo_definitions.expected.json` — they are the acceptance and you may not edit them. Read them FIRST, in full; every rule below has a test there. (If they are missing, stop and report — do not author them yourself.)

Then read: `pyblocks/analyzer.py` lines 1-40 (the founding rule: never import or execute analyzed source), 113-133 (`_source_lines` — `split("\n")` keeps the final blank line; `_span`), 211-236 (`_DefinitionIndex` — the lexical qualname walk you extend to record parents and ordinals), 321-371 (`_FunctionCollector` — REUSE its span policy at 350-355 verbatim: `decorated_line = min([node.lineno, *(d.lineno for d in node.decorator_list)])`, start column 0, end from the AST; and its signature string at 358-366), 1923-1975 (`analyze_source` — how the CLI's blockview path is built; you add a sibling path, you do not change this one); `pyblocks/dialect.py` 191-196 (`output_ports_by_qualname` — the PB1 named outputs; use it for `outputs`, spelled `[{"name", "dataType"}]`); `pyblocks/blockview.py` 37-45 (`SourceSpan` — 1-based lines, 0-based UTF-8 byte columns, end exclusive; your `span` objects are that shape plus `"columnEncoding": "utf8-bytes"`); `pyblocks/__main__.py` 226-240 and 340-343 (the `analyze` subcommand and its handler); `tests/test_commands.py` 1-40 (house style: plain `unittest`). Read the plan `docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md` §5.3 in bbox-ui (`/home/bam/bbox-ui/.claude/worktrees/plan-source-code-view-2026-09-18/docs/`) for the schema and rules — the test file restates them.

Write set: `pyblocks/definition_graph.py` (new), `pyblocks/__main__.py` (add `--view-kind {blockview,definitions}` to `analyze`, default `blockview`; when `definitions`, print `json.dumps(definitions_view(source, str(args.file)), ensure_ascii=False, indent=None if args.compact else 2)` and return; the blockview path stays byte-identical — `test_default_view_kind_is_unchanged` checks it). Optionally ONE golden case under `examples/systemsketch_goldens/` if `goldens.py` admits a definitions-view case without editing the harness; if it cannot, skip it and say so. Do not touch `analyzer.py`, `python_adapter.py`, `blockview.py`, `symbols.py`, `commands.py`, `systemsketch.py`, `identity.py`, `dialect.py`, `goldens.py`, any existing test, or `vscode-*`.

`definitions_view(source: str, filename: str) -> dict` — plain dict, JSON-ready, key order exactly `schemaVersion, kind, source, definitions, references, diagnostics` and per record `anchor, name, kind, parent, ordinal, span, signature, parameters, outputs, contentHash, text`. Algorithm: `lines = source.split("\n")`; try `ast.parse(source, filename=filename)`; on `SyntaxError` return the total view (module record only: span `(1, 0, len(lines), utf8len(lines[-1]))`, `text = source`, `contentHash = "sha256:" + sha256(source)`, one `error`/`syntax-error` diagnostic with anchor `<module>`; `source.sha256` still set). Otherwise walk `tree.body` recursively for `FunctionDef`/`AsyncFunctionDef`/`ClassDef` (statement bodies only — never descend into expressions for definitions), recording lexical qualname, parent anchor, kind (`class` / `function` / `async-function`), and an ordinal per qualname in file order; anchor = qualname, plus `#<ordinal>` when ordinal >= 1 (first occurrence bare), plus a `warning`/`duplicate-definition` diagnostic anchored at the later occurrence. Spans: the `_visit_function` policy above, applied to classes too. `text` = the exact bytes from `(startLine, 0)` to `(endLine, endColumn)` — slice line bytes with `.encode("utf-8")[:endColumn]`, join with `"\n"`, decode. `contentHash = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()`. `signature`: functions exactly as `_FunctionCollector._visit_function` builds them (copy those lines, cite them), classes `f"class {qualname}"`, module `"module"`. `parameters`: posonly, args, `*vararg`, kwonly, `**kwarg` in that order, `annotation` = `ast.unparse(annotation)` or `None`. `outputs` from `dialect.output_ports_by_qualname(tree).get(qualname, ())` as `{"name", "dataType"}` (the fixture expects `[{"name": "depth", "dataType": "Depth"}, {"name": "confidence", "dataType": "float"}]` for `estimate_pair`).

References: for each definition, visit its header parts (decorators, bases and keywords for a class; annotations, defaults, `returns` for a def) and its body statements, WITHOUT descending into nested definitions (they are their own records). A `Name` load resolves through the enclosing scope chain — module, then each enclosing def — SKIPPING class scopes (Python's rule; `test_class_scope_is_skipped_for_names_inside_methods`), to the FIRST definition with that bare name in that scope; kind `call` when the name is the `func` of an `ast.Call`, else `name`. `self.<x>` / `cls.<x>` inside a method resolves to the enclosing class's child definition `<Class>.<x>` when it exists, kind `attribute`. Header parts are attributed to the decorated definition itself, deliberately (a `WHY:` in the file: the view answers "which definition talks about which", not "which frame evaluates which"). Drop self-references and names that resolve to nothing (imports, module-level assignments, builtins). Group by `(from, to, kind)`, `lines` sorted unique, output sorted by `(from's index, to's index, kind order call/name/attribute)`. The module's own references come from its non-definition top-level statements (`test_module_remainder_references_definitions`). Provenance: port the ref-stack-per-scope technique from marimo 0.24.2's `marimo/_ast/visitor.py` (`ScopedVisitor`) if you read it — fetch it (`pip download marimo==0.24.2 --no-deps -d /tmp/marimo` then unzip, or `uvx --from marimo==0.24.2 python -c "import marimo,os;print(os.path.dirname(marimo.__file__))"`), read the actual file, and cite `path:line-range` in the module docstring with the Apache-2.0 notice; if you write it yourself say "ours, ad hoc" — never a citation from memory. Do NOT read ryvencore (LGPL). Static only; never import or execute the analyzed source. `WHY:` comments at: the class-scope skip, the header attribution, the ordinal-not-line:col anchor, the "report never refuse" total path.

Acceptance: from the worktree root, `python3 -m unittest tests.test_definition_graph -v` — 17 tests green, including `test_matches_the_frozen_expected_json_exactly` (dict `==` against the fixture) and both CLI tests; `python3 -m unittest discover -s tests -v` — no new failures versus `main`. If a rule as tested cannot be met, report FAIL with the exact assertion — do not edit the tests or the fixture. Commit with explicit pathspecs; never `git add -A`; check `git diff --cached --name-only` first. Report the exact output of `python3 -m pyblocks analyze --view-kind definitions tests/fixtures/definition_graph/stereo.py | head -40` in your handoff.

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
