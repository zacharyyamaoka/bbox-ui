# CodeBlock renderers — how "a rendering on top" gets built (plan, 2026-09-15)

Zach's ask: *"make a plan for how we add different types of renderings on top [of CodeBlock] — for example this nested type rendering."* The screenshot is SystemSketch's Type block **Grasp**: an ATTRIBUTES heading with a `UI | SOURCE` toggle; in UI mode `▾ pose: Pose` expanded to Pose's own `x: float = 0`, `y: float = 0` indented beneath, then `width: float = 0`, type names as blue underlined links; in SOURCE mode the same text in a bordered code box. His standing rule (2026-09-14, PEP 0017): *"the codefield is the same, all that changes is the renderer that you put on top."*

Every claim below about existing code was checked by reading the file at the cited line. Nothing was run.

## 1. Frame

After the CodeBlock refactor, "a rendering on top" is not one thing but three, and the word "renderer" hides the split. **(1) The grammar** — a pure `CodeBlockGrammar` object (`packages/bbox-ui/src/codeGrammar.ts:132-198`): `lines()` turns the source into role-tagged rows, `resolveReference()` says what a name is and what it expands to (`:83-113`), `decorate`/`slotAt`/`complete`/`completionBadge` colour and complete the SOURCE side. **(2) The row painter** — `CodeBlockRows` (`codeBlockRows.tsx:109-263`): chevrons, nested `expandLines()` previews, underlined jump links, `${line}:${name}` expansion keys, caret mapping back to source. It is already generic; nothing in it knows what a "type" is. **(3) The chrome and host wiring** — the heading, the `UI | SOURCE` toggle (`CodeBlockModeToggle`, `codeBlock.tsx:297-317`), who owns `mode` (`:173-182`: *"the host owns the state; CodeBlock never flips it"*), where a blue link jumps, where the type table comes from. `CodeBlock` itself is a thin dispatcher (`:259-295`): `mode="rendered"` mounts the painter over `grammar.lines(value)`, anything else mounts CodeMirror, and expansion state lives on the dispatcher so it survives the round trip (`:235-241`).

**Challenge to the brief.** The tempting reading is "renderer = a thing CodeBlock selects by name", which makes the core know every rendering. In this codebase a renderer is **a grammar module plus a thin sibling that owns its chrome**; the painter is shared and never varies per renderer. The second overloaded word is *"UI vs Source"*: on `/create` that is not a new state at all — it is the page's existing editing session (`RenderContext.edit.editing`, `packages/panel/src/registerComponent.ts:47-56`) wearing the donor's labels.

## 2. Criteria (weighted)

| # | Criterion | Weight | What it means here |
|---|---|---|---|
| C1 | Zero-relearning vs the screenshot | 30 | Clone TypeBabbleV1's conventions: leading always-reserved chevron (`TypeBabbleV1.tsx:302-318`), muted-rail guide, link = plain blue underline and unknown = muted, never danger (`type-babble.css:36-52`), select-then-click drops into Source *at the click* (`TypeBabbleV1.tsx:271-295`), foreign rows jump to their owner (`:288-293`), expansion survives the UI/Source round trip (`:88-100`). |
| C2 | The core rule | 20 | No engine imports; every file a registry item ships imports only siblings and never `@bbox-ui/schema` (`codeBlock.presets.ts:22-29`; root `CLAUDE.md`). Throwaway install + `tsc` is the proof, not `shadcn add` exit 0. |
| C3 | "The codefield is the same" | 20 | No new value semantics on `CodeBlock`; `mode`/`grammar` stay host wiring, not fields (`codeBlock.fields.ts:11-13`); the two-names-for-one-property-space trap (`codeBlock.tsx:218-220`) stays closed. |
| C4 | Truthful rendering | 10 | A rendered row's segments concatenate back to the raw line (that is what makes `caretOffsetFromPoint` exact, `caretGeometry.ts:16-23`); no authored character is dropped, an unparsable line stays a raw row (`typeBabbleShared.ts:70`). |
| C5 | Works in all three `/create` hosts | 10 | DOM, React Flow, tldraw: the rest-vs-editing pointer seam (`codeBlock.tsx:820-828`) and the `bbox-interactive` gates keep working; the existing journey's `[data-slot="code-block"]` queries keep finding something. |
| C6 | Cost to bring the NEXT renderer | 10 | Type Mapping, port signature and the expression field are queued (§3). The second renderer must be mostly a grammar file. |

## 3. Inventory — what SystemSketch already renders on its four CodeMirror mounts

| Renderer (donor file) | Grammar hooks it needs | Painter features | Host wiring | Covered by bbox-ui today? |
|---|---|---|---|---|
| **Type attributes, UI mode** (`TypeBabbleV1.tsx`, parse in `typeBabbleShared.ts:43-72`) | `lines` (flat `name: Type = value` rows, ids `${line}:${name}` `typeBabbleShared.ts:69`), `resolveReference` → `{kind: primitive/known/unknown, onJump, expandLines, owner}` (donor: `resolveName` `:22-26`, nested `parseFlatAttributes(resolved.block…)` `:337-357`, mapping alias preview `:359,370-384`) | chevron/expand to any depth incl. self-reference, jump link, role colours, caret-at-click, empty-space click = end of source (`:198-205`) | `[UI\|Source]` toggle (`:122-125`), lifted `expandedPaths` (`:94-100`), reactive type index (`typeReferenceIndex.ts:20-56`), jump via `navigateViewport` (`:109-115`), foreign-row jump via `typeSourceJump.ts:15-32` | **Painter yes**: chevron/expand/link/keys/caret/empty-space (`codeBlockRows.tsx:130-159,179-262`), prune (`:51-63`), owner tokens (`codeGrammar.ts:96-112`). **Grammar no**: no type grammar exists (the `Rendered` story's `demoLines` is a 40-line stand-in, `CodeBlock.stories.tsx:291-327`). **Chrome partial**: `CodeBlockModeToggle` exists with labels `UI`/`Source` (`codeBlock.tsx:301`); mode ownership, table, jump are unwired. |
| **Type attributes, SOURCE mode** (`SourceCodeEditor.tsx`, spans `sourceHighlight.ts:27-55`) | `decorate` (same judgement as the rows, `:1-10`), `slotAt`+`complete` (`findTypeSlot`, `typeNameAutocompleteLogic.ts:140-166`; registry `:60-87`; badge `KIND_LABEL :25-29`), no parser (`NO_LANGUAGE`, `SourceCodeEditor.tsx:27,159`) | — | outside-click commit (`useSourceToggleEditor.ts:65-77`), Escape = cancel, StrictMode guard (`SourceCodeEditor.tsx:196-217`) | `decorate`/`slotAt`/`complete`/`completionBadge` all exist (`codeGrammar.ts:136-149,186-188,200-266`). The "show every type on this board" toggle row (`typeNameCompletion.ts:107-137`) needs `apply` on a completion, which `CodeBlockCompletion` lacks (`codeGrammar.ts:30-35`) — a small gap, not needed for the screenshot. |
| **Type Mapping** (`TypeMappingV1.tsx:15-31,58-106`; `typeMappingShared.ts:42-54`) | `lines` (`Name = expr`, tokens via `tokenizeTypeExpr`), `resolveReference` with `onJump` only — an alias has no fields to expand (`:21-24`), `slotAt` = `findExpressionTypeSlot` (`typeNameAutocompleteLogic.ts:178-193`) | jump link, role colours, caret-at-click; **no chevron** | same toggle/commit shell (`useSourceToggleEditor`) | Painter yes (a reference with no `expandLines` paints no chevron, `codeBlockRows.tsx:183,211`). Grammar no. A **second grammar file**, same wrapper. |
| **Port signature** (`PortSignatureField.tsx`) | `slotAt` (`portSignature.ts:160-187`), `decorate` (`:30-47`), `complete` by slot with kind pills (`:178-233`), fold (`laneEllipsis :139-154`), **plus two raw CodeMirror pieces**: squiggle diagnostics `StateField` driven by effects (`:49-74`) and the `⇢ value` resolved widget (`:76-114`) | none — SOURCE-only today; the chip is a `Decoration.widget`, not a rendered row | evaluator round trip (`useDebouncedExpressionEval`), warning glyph frame | `slotAt`/`decorate`/`complete`/badge/fold exist (`codeGrammar.ts:311-330`, and `grow-truncated` mounts the same fold, `codeBlock.tsx:467-475`). **Gap**: `decorate` only emits `Decoration.mark` (`codeGrammar.ts:200-212`); a widget/StateField must ride in `grammar.language`, which silently drops the base parser (`codeBlock.tsx:480`) — see seam S4. `PortLabel` is still grammar-free (`port.tsx:497-501`). |
| **Expression field** (`ExpandingExpressionField.tsx:74-92,186-205`) | none — the collapsed/expanded split is a `value` swap on the wrapper, no grammar | none | evaluator; `disabled` until activated | PEP 0017 chose the value swap over a `mode` prop (`0017:49-55`). In bbox-ui this is `mode="rendered"` with a one-row `lines()` showing the evaluated repr — or the same value swap. Wrapper-only. |
| **Code block** (`CodeBlockCanvas.tsx`) | language only | none | ⤢ larger view (bench, `bench.tsx:581-720`) | Done — this *is* `CodeBlock look="block"`. |

## 4. Three options

### A — grammar-only: one `typeGrammar` object into the existing CodeBlock, host writes the chrome

```tsx
import { CodeBlock, CodeBlockModeToggle, lineStartOffset } from "@bbox-ui/core";
import { typeGrammar, staticTypeTable } from "./typeGrammar";

const table = staticTypeTable({ Pose: "x: float = 0\ny: float = 0" });
const grammar = typeGrammar({ resolve: (name) => table.get(name) ?? null });

function TypeBody({ value, onWrite }: { value: string; onWrite(v: string): void }) {
  const [mode, setMode] = useState<"rendered" | "source">("rendered");
  const [caret, setCaret] = useState<number>();
  return (
    <>
      <CodeBlockModeToggle mode={mode} onModeChange={setMode} />
      <CodeBlock value={value} onWrite={onWrite} grammar={grammar} mode={mode}
        language="plaintext" look="block" lineNumbers={false} lines="multi"
        autoFocus cursorAt={caret}
        onOpenSource={(line, col, owner) => {
          if (owner) return;                       // a foreign row: the host's jump, not ours
          setCaret(lineStartOffset(value, line) + col); setMode("source");
        }}
        onEscape={() => setMode("rendered")} onEnter={() => setMode("rendered")} />
    </>
  );
}
```

Zero core changes beyond the seams in §5. But the 15 lines of chrome above get re-typed in Storybook, in `bench.tsx`, in SystemSketch's rebuild and by every registry consumer — and each copy will drift on the StrictMode/caret details in §7.

### B — a `renderer` name on CodeBlock selecting a painter+grammar pair

```tsx
// codeBlock.tsx grows a registry; codeBlock.fields.ts grows a "renderer" segments field
const RENDERERS = { "type-attributes": typeGrammar, "type-mapping": mappingGrammar, "port-signature": signatureGrammar };
<CodeBlock renderer="type-attributes" rendererOptions={{ resolve }} value={v} onWrite={w} />
```

**The tempting-but-wrong choice.** It looks like what `/create`'s inspector wants (a string a person can pick). But the painter does not vary per renderer, so the registry only selects a grammar; a grammar needs live options (a type table, a jump target) that no `FieldValue` can hold (`packages/schema/src/field.ts:28`); the name set is closed inside a copy-paste kit, so a consumer's own grammar means editing the copied core; and it breaks C3 — `grammar` was deliberately kept out of the fields (`codeBlock.fields.ts:11-13`). The inspector's need for a *name* is real, and it is answered at the component-entry level (a `TypeAttributes` entry in the Members list), not inside the core.

### C — sibling components that WRAP CodeBlock (the `PortLabel` pattern, `port.tsx:512-580`), grammar module beside them

```tsx
// packages/bbox-ui/src/typeAttributes.tsx
export function TypeAttributes({ value, onWrite, resolve, onJump, mode, onModeChange,
  heading = "attributes", ...rest }: TypeAttributesProps) {
  const [own, setOwn] = useState<Mode>("rendered");
  const current = mode ?? own, setMode = onModeChange ?? setOwn;   // controlled or not
  const grammar = useMemo(() => typeGrammar({ resolve, onJump }), [resolve, onJump]);
  const caret = useRef<number | undefined>(undefined);              // captured on pointerdown, §7.2
  return (
    <div data-slot="type-attributes" data-mode={current}
      onPointerDown={(e) => { caret.current = caretFromRowPointer(e, value); }}>
      <div className="bbox-type-attributes-heading">
        <span>{heading}</span><CodeBlockModeToggle mode={current} onModeChange={setMode} />
      </div>
      <CodeBlock {...rest} value={value} onWrite={onWrite} grammar={grammar} mode={current}
        language="plaintext" look="block" lineNumbers={false} lines="multi"
        autoFocus cursorAt={caret.current}
        onOpenSource={(line, col, owner) => owner
          ? onJump?.(owner, line, col)
          : (caret.current = lineStartOffset(value, line) + col, setMode("source"))}
        onEscape={() => setMode("rendered")} onEnter={() => setMode("rendered")} />
    </div>
  );
}
// consumer: <TypeAttributes value={src} onWrite={setSrc} resolve={(n) => table.get(n) ?? null} />
```

### Scores (out of the weight)

| | C1 30 | C2 20 | C3 20 | C4 10 | C5 10 | C6 10 | Total |
|---|---|---|---|---|---|---|---|
| A grammar-only | 22 — conventions live in the grammar, but the chrome (toggle placement, caret capture, outside-click) is each host's to get right | 20 | 20 | 10 | 8 — every host re-wires the two-click/caret race | 5 — next renderer = grammar + N host rewires | **85** |
| B name registry | 24 | 12 — closed set in a copied file | 6 | 10 | 8 | 6 | **66** |
| C thin wrapper + grammar | 28 — the donor's chrome ships once, pixel-cloned | 20 — wrapper imports only siblings | 18 — thin by rule: forwards `CodeBlockProps`, adds only chrome props | 10 | 10 — one place carries the host gates | 8 — next renderer = grammar file + ~60-line wrapper (Type Mapping reuses this one with a flag) | **94** |

## 5. Recommendation — C, with A as its subset

Ship **`typeGrammar.ts` as the unit of reuse** (usable exactly as option A) and **`TypeAttributes` as the thin sibling that carries the chrome** (option C). Never B. The wrapper's discipline, enforced by its props type and a WHY comment at the seam: it takes `CodeBlockProps` minus `grammar`/`mode`/`onOpenSource` and forwards them; its own props are chrome only (`resolve`, `onJump`, `mode`/`onModeChange`, `heading`, `toggle`); it never reinterprets `value`. That is what keeps it a `PortLabel`, not a second CodeField.

**Files created** (all under `packages/bbox-ui/src/` unless noted):

| File | Exports | Imports (must be registry siblings) |
|---|---|---|
| `typeGrammar.ts` | `parseAttributeLines(text): AttributeLine[]` (donor `parseFlatAttributes`, ids kept as `role:"name"` so `rowIdentity` yields `${line}:${name}`), `typeSlotAt`, `KNOWN_PRIMITIVES`, `TypeSource = { owner: unknown; source: string; kind: "type" \| "alias" }`, `typeGrammar({ resolve, onJump }): CodeBlockGrammar` — `lines`, `decorate`, `slotAt`, `complete`, `completionBadge`, `resolveReference` (`primitive` → `{kind}`, board type → `{kind:"known", onJump, expandLines: () => lines(source), owner}`, else `{kind:"unknown"}`), `staticTypeTable(record)` | `./codeGrammar` (types), `./codeBlockUnits` (`pythonUnits`, so a row is a unit, not a `\n`) |
| `typeAttributes.tsx` | `TypeAttributes`, `TypeAttributesProps`, `caretFromRowPointer` | `./codeBlock`, `./typeGrammar`, `./caretGeometry` |
| `typeAttributes.fields.ts` | `TYPE_ATTRIBUTES_FIELDS` = `CODE_BLOCK_FIELDS` minus `language`/`lineNumbers`/`lines`/`flatten` (the wrapper fixes those), `value` default `"pose: Pose\nwidth: float = 0"` | `@bbox-ui/schema` types — **not shipped**, same line `codeBlock.fields.ts` draws |
| `codeBlock.css` (append) | `.bbox-type-attributes-heading` (donor `type-babble.css:101-112`), ref kinds (S2), `[data-mode="rendered"]` frame (S1) | ships already via the package export |
| `index.ts` | the three modules | |
| `test/typeGrammar.test.ts` | parse ids/raw rows, `slotAt` bounds, `lines` segments concatenate to raw, `resolveReference` kinds, `expandLines` rows carry the owner's line indices, `decorate` offsets, `complete` options + badges | |
| `apps/storybook/src/stories/TypeAttributes.stories.tsx` | `Primary` (+ play), `Expanded`, `SourceMode` | |
| `registry.json` → `type-attributes` item | `typeAttributes.tsx`, `typeGrammar.ts` **plus the code-block files inlined** the way `port` does (`registry.json:41-99`), all targeted into `components/bbox/`; same `dependencies` as `code-block` (`:186-200`). `registryDependencies` is unproven in this repo — inline first, then `npx shadcn@latest build`, `pnpm registry:build` (snapshot test `test/registrySnapshot.test.ts`), throwaway install + `tsc`. | |

**Seam changes to the core** (each small, each with its WHY):

- **S1 — the rendered branch keeps the frame.** `codeBlock.tsx:281-293` returns bare `CodeBlockRows`; wrap it in the same root `div[data-slot="code-block"]` with `data-mode="rendered"`, the resolved `fontSize`/padding inline (`:830-847`), `data-editing`, and the ⤢ button (`:877-897`, today source-only). CSS: `[data-mode="rendered"]` → transparent border/background (UI mode has no box in the screenshot; source has one), and `.bbox-code-block-rows` `font-size: inherit` instead of the fixed 11px (`codeBlock.css:385`). WHY: the UI/Source round trip must not shift a pixel (the donor spent a CSS section on exactly this, `type-babble.css:366-370`); the three-host verifier and the `/create` journey key on `[data-slot="code-block"]` (`verify-hosts.mjs:99`) and find nothing in rendered mode today; ⤢ must exist in both modes.
- **S2 — reference kinds get the donor's colours.** `.bbox-code-ref--known { color: var(--bbox-accent) }`, `--primitive` = 68% accent mix, `--unknown` = muted. Today `--unknown` is danger (`codeBlock.css:448-450`), which the donor explicitly rejected (`type-babble.css:47-52`). CSS only.
- **S3 — rows carry `data-line`.** `codeBlockRows.tsx:199` stamps only `data-depth`; add `data-line={line.line}` so a host can map a pointer-down to a row without re-deriving DOM order (needed by §7.2).
- **S4 — deferred, port-signature only:** `CodeBlockGrammar.extensions?: Extension[]` mounted by `grammarExtensions` (`codeGrammar.ts:333-342`), so a StateField/widget stops riding in `language` and killing the parser (`codeBlock.tsx:480`). Not needed for the screenshot.

**UI/SOURCE ↔ `mode`, and who owns it.** `UI` = `mode="rendered"`, `SOURCE` = `mode="source"` — `CodeBlockModeToggle`'s default labels already say so (`codeBlock.tsx:301`). Ownership: `CodeBlock` never (unchanged, `:178`). Standalone (Storybook, a registry consumer): the wrapper's own `useState`, uncontrolled default. On `/create`: **derived from the page's editing session** — `mode = ctx.edit.editing ? "source" : "rendered"`. Second click on the selected instance already requests editing (`render-instance.tsx:118-139`); the SOURCE button and a row click need one new hook, `RenderContext.edit.onRequest(): void` (`registerComponent.ts:47-56`, wired at `render-instance.tsx:159` to `edit.onRequestEdit(inst.id)`); the UI button, Escape, Ctrl+Enter and an outside click end it through `onCommit`/`onCancel` as `BenchCodeBlock` does today (`bench.tsx:632-634`). No page-level state is added.

**Where the type table lives on `/create`.** `/create` has no Type block yet, so the honest first source is a **static table** passed by the bench entry (`Pose`, `Frame`, `Grasp` seeds) — the same fixture the screenshot itself implies (no Pose card is visible in it). Second slice: derive it from the bench. A "Type" on `/create` is Zach's own composition (vault `PROJECT - Black Box UI.md:3347-3350`: a Block whose member block has a code field in its body): title = the TextBox in the Block's `header.left` fill, source = the `TypeAttributes` in its body fill. `render-instance.tsx:180` already has every instance in hand; add `RenderContext.bench?: { instances: Instance[]; select(id): void }` built there, and a `typeTable(instances)` helper beside `members/model.ts`'s `parentOf`/`subtree`. `owner` for an expanded row is then the referenced Block's instance id.

**How blue links jump.** `resolveReference(name).onJump` → the wrapper's `onJump(owner)` → on `/create` `ctx.bench.select(ownerId)` → the page's `selectInstance` (`workbench.tsx:730`): the inspector switches and the outline moves on all three renders. Camera moves (the donor's `navigateViewport`, `TypeBabbleV1.tsx:109-115`) are a canvas concern and stay out.

**How flatten / grow-truncated / expand compose.** `flatten` is a source-mode replace decoration (`codeBlockFlatten.ts:44-53`); the rendered equivalent is `lines()` iterating `grammar.units ?? pythonUnits`, so a multi-line default is one row in both modes (the donor splits on `\n`, `typeBabbleShared.ts:47`, and would break there); the segment keeps the raw `\n` (truthful) and paints as a break inside the row — a `⏎` glyph in rendered rows is a later painter option. `grow-truncated` is a caret-relative fold (`codeGrammar.ts:311-330`); rendered rows never fold and are clipped by the frame like `clip`. ⤢ after S1 paints in both modes; the bench's larger view opens the SOURCE editor over the same value — correct, the larger view "is where the real lines live" (`codeBlockFlatten.ts:22-24`).

## 6. Tracer bullet — the screenshot on `/create`

1. **`typeGrammar.ts` + `test/typeGrammar.test.ts`.** Proof: vitest green on the cases in §5, including `lines(text).map(rowText).join("\n") === text` (C4) and `rowIdentity(lines(...)[0]) === "0:pose"`.
2. **Seams S1–S3.** Proof: `codeBlockRows.test.ts`, the `Rendered`/`Primary` CodeBlock stories and `verify-hosts.mjs` stay green; the `Rendered` story's play gains `[data-slot="code-block"][data-mode="rendered"]`.
3. **`typeAttributes.tsx`, CSS, exports, `TypeAttributes.stories.tsx`, `COMPONENT_CHECKS` entry** (`verify-hosts.mjs:97-104`: `{ slot: "type-attributes", attr: "data-size", fieldId: "size" }`). Proof, in the play: rows paint `pose`/`Pose`/`width`; the chevron on `pose` is `role=button`, click → two rows at `data-depth="1"` reading `x: float = 0`, `y: float = 0`; `Pose` is `.bbox-code-ref--known[role=button]`, `float` is `--primitive` with no button; the toggle flips `data-mode` and `.cm-content` takes focus; a pointer-down at the `w` of `width` then release → source with `view.state.selection.main.head === lineStartOffset(value, 1)`; Escape → rendered; the `pose` expansion is still open after a UI→Source→UI round trip. Then `verify-hosts.mjs` in all three hosts.
4. **`/create`.** `LEAVES` gains `TypeAttributes` (`bench.tsx:85` — the file's own comment says widening is a one-line edit); a `registerComponent` entry (`inlineEdit: { field: "value" }`, static table, `ctx.edit.onRequest`, `ctx.bench.select`); one seed. Proof: extend `demos/capture-code-block.mjs` (921 lines, steps 1–9) with a step 10 per render: navigator → Body → its Flex → Add `TypeAttributes`; screenshot; assert the same DOM facts as step 3 plus: second click → `data-editing="true"` with the caret at the pressed column; type `\nquality: float`, Ctrl+Enter → a third row; Escape after typing `zzz` restores; drag at rest on React Flow/tldraw moves the node with an empty selection; ⤢ opens the larger view in source. Numbers reported, not "green".
5. **Registry.** `type-attributes` item, `npx shadcn@latest build`, `pnpm registry:build`, snapshot test, throwaway install + `tsc` exit 0.
6. **Report.** Extend `docs/build_code_block_primitive.py` with a "Renderers" section (captures from step 4, the stock-part table: *Today → part → behaviour that must survive*, with `CodeBlockRows` and `CodeBlockModeToggle` as the unchanged stock seams) → `/home/bam/bbox-ui/reports/media/`.

**Deliberately left out:** Type Mapping (second grammar file + a `expandable:false` flag on the same wrapper, next); port signature (needs S4); the expression field (needs an evaluator host); the bench-derived table and cross-instance source jump (`typeSourceJump.ts`'s atom has no `/create` equivalent yet); camera navigation; the "browse every type" completion row; `⏎` in rendered rows; a third `look` preset (`attributes`) — an explicit override is the documented escape (`codeBlock.presets.ts:9-16`) until a third consumer wants the same values; a bbox-ui.com page.

## 7. Risks and traps

1. **StrictMode kills a gated source view (PEP 0017, `0017:66-80`).** `apps/docs/next.config.mjs:13` has `reactStrictMode: true`. `CodeBlock` commits on unmount (`codeBlock.tsx:818`), `FieldGesture.commit` fires `end` even when nothing changed (`fieldGesture.ts:94-105`), and `autoFocus` opens the gesture on mount (`:629-632`,`:655-673`) — so the StrictMode rehearsal unmount fires `onEditEnd`. Any state that decides whether the source view renders and listens to `onEditEnd` flips back before the real remount. **Rule for the wrapper: never gate `mode` on `onEditEnd`.** Exits are explicit — `onEscape`, `onEnter`, the UI button, and an own capture-phase outside-click listener (the donor's `useSourceToggleEditor.ts:65-77`, treating `.cm-tooltip` as inside, `codeBlock.tsx:791`). If a host must wire `onEditEnd` (the bench's commit-on-blur), use the donor's macrotask + view-identity guard through `onViewReady` (`SourceCodeEditor.tsx:196-217`). Storybook has no StrictMode (`apps/storybook/.storybook/main.ts` sets none), so this only shows on the channel Zach reviews — test it there.
2. **The two-click race eats the caret.** Edit-on-release fires on a document `pointerup` (`twoClickEdit.ts:170`); React flushes, the rows unmount, and the `click` that would have fired `onOpenSource` (`codeBlockRows.tsx:186-190`) never lands. Capture the caret on **pointer-down** over `[data-line]` (S3) with `caretOffsetFromPoint` (`caretGeometry.ts:25`); the chevron and link already stop pointer-down themselves (`codeBlockRows.tsx:208,225`), so they never capture one. `data-caret-ignore` on the chevron keeps the column honest (`caretGeometry.ts:50-55`).
3. **Expansion keys.** `${line}:${name}` (`codeBlockRows.tsx:29-32`) with pruning (`:51-63`); the same-name-insert collision is known and documented in `codeBlockRows.test.ts:64-76`, identical in the donor — accept it.
4. **Tooltip parenting / z-index.** The popup goes to `tooltipParent` → `[data-tooltip-host]` → body (`codeBlock.tsx:593-609`); `.cm-tooltip.bbox-code-completion` at `2147483647 !important` (`codeBlock.css:78-80`) already beats the bench overlay's `2147483000`; keep `tooltipClass` unconditional (`codeGrammar.ts:236-248`).
5. **Object identity.** A new `grammar` object reconfigures CodeMirror every render (`codeBlock.tsx:699-703`) and `resolveReference` runs per visible row per render (`codeBlockRows.tsx:179-182`): `useMemo` the grammar and the table; a bench-derived table must be keyed on the instances' `children`/`value` props only.
6. **`grammar.language` replaces the parser** (`codeBlock.tsx:480`). The type renderer passes `language="plaintext"` and colours only through `decorate` (the donor's `NO_LANGUAGE`, `SourceCodeEditor.tsx:27,159`; `PortLabel` does the same, `port.tsx:544-551`), so the `.tok-*` palette (`codeBlock.css:222-293`, specificity 0,3,0) never fights the `.bbox-code-seg--*` roles (0,1,0).
7. **Truthful rows.** Segments must be slices of the raw line (`sourceHighlight.ts:37-52` uses `indexOf`; the donor's `AttributeSpans` re-spaces `": "`/`" = "`, `TypeBabbleParts.tsx:48-53` — do not copy that); a docstring/`class` line the parser skips (`typeBabbleShared.ts:50-63`) must still be a `role:"raw"` row, never dropped.
8. **Registry closure.** Every relative import a shipped file makes must land as a sibling; no `@bbox-ui/schema` in shipped files (`codeBlock.presets.ts:22-29`); `test/registrySnapshot.test.ts` is red until `pnpm registry:build`; `shadcn add` exit 0 proves nothing (root `CLAUDE.md`).
9. **Members gate.** `LEAVES` (`bench.tsx:85`) decides what the Members control can add; the Block body accepts only a Flex (`:123`), so the leaf goes into the body's Flex fill — the journey must navigate there.
10. **Rest vs editing on a canvas.** In rendered mode the frame carries no `bbox-interactive` and stops no pointer (same as `editing=false`), so a drag on a resting row moves the node — correct — while a chevron/link press neither drags nor arms an edit. On tldraw the `HTMLContainer` gate keys off `[data-bbox-interactive]` (`tldraw-canvas.tsx:200-205`), which S1 must keep stamping only while `editing`.

**Durable decision.** "A renderer is a grammar module plus a thin sibling; the core never selects renderers by name" is a genuine fork a future rewrite could silently re-litigate (option B will look attractive again the first time someone wants a dropdown). bbox-ui has no `docs/peps/`; when this merges, record it beside `ARCHITECTURE.md`'s "The line" section and link it from the WHY comment at the top of `typeAttributes.tsx`.
