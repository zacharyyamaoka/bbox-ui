# How Langflow builds its nodes — and what bbox-ui should take from it

Read against Langflow **1.12.0**, the closest shipped thing to the bbox-ui thesis:
*one field array per component drives the TypeScript props, Storybook Controls, a product
inspector and the docs.* Langflow has been running that exact idea in production for two
years, across ~197 components. So the useful question is not what it looks like — it is
**which parts of the idea survived contact with reality, and which parts rotted.**

Short version: the *node* architecture is excellent and you should copy it almost exactly.
The *field schema* is where it went wrong, and it went wrong in a specific, avoidable way
that you are currently one design decision away from repeating.

---

## 0. Provenance — what I actually read

This matters, because half the answer was readable as source and half was not.

| corpus | where | status |
|---|---|---|
| **[1]** Backend field schema (Python) | `/home/bam/langflow/.venv/lib/python3.12/site-packages/lfx/` | ✅ full source on disk |
| **[2]** Shipped frontend bundle | `…/langflow/frontend/assets/index-DLYZZeg6.js` (31 MB, minified) | ✅ on disk, **no sourcemaps** |
| **[3]** Live flow data | `/home/bam/langflow/data/langflow.db` (29 flows, 200 nodes, 1,884 fields) | ✅ read-only sqlite |
| **[4]** Frontend TypeScript source | GitHub tag `v1.12.0` (commit `435c0c9`) | ⚠️ **web** — not on disk |

**The install is a Python wheel: there are zero `.tsx` files and zero `.map` files anywhere
under `/home/bam/langflow`.** So every React line number below is web-sourced **[4]**. I did
not take that on trust — every load-bearing frontend claim was re-verified against the
minified bundle actually installed on this box **[2]**, and I flag below where a claim rests
on the web alone. Where the bundle and GitHub agree, the claim is as solid as source.

---

## 1. The custom node — one generic node, and that is the whole trick

**There are exactly two React Flow node types in the entire product.**

Registered at `src/frontend/src/pages/FlowPage/consts.ts:9-12` **[4]**:

```ts
export const nodeTypes = {
  genericNode: GenericNode,
  noteNode: NoteNode,
};
```

Consumed as `nodeTypes={nodeTypes}` at
`src/frontend/src/pages/FlowPage/components/PageComponent/index.tsx:1046` **[4]**.

I confirmed this three independent ways, because it is the single most important structural
fact in the report:

1. **The shipped bundle** contains the literal minified object **[2]**:
   `const Hpo={genericNode:jpo,noteNode:$po}` — two keys, no more.
2. **The live database**: across 29 real flows and 200 real nodes, the set of distinct
   `node.type` values is exactly `{'genericNode', 'noteNode'}` **[3]**.
3. `reactflowUtils.ts:1829` constructs every new node with `type: "genericNode"`
   unconditionally — never varying by component class **[4]**.

So: **~197 shipped component classes, 31 distinct component types in real flows, and ONE
node component renders all of them.** `noteNode` is a sticky note — not a component at all.
The same discipline holds for edges: the sibling `edgeTypes` map in the bundle is
`{default: Eco}` — exactly one edge type **[2]**. And tellingly, React Flow's per-type CSS class
`.react-flow__node-noteNode` exists in the stylesheet while `.react-flow__node-genericNode`
does **not** **[2]** — the generic node carries no type-specific styling, because there is no
type to style against.

`GenericNode/index.tsx` is 808 lines **[4]**, but it does *not* contain the field loop. It
composes six children: `NodeIcon` (`:671`), `NodeName` (`:677`), `RenderInputParameters`
(`:696`, `:757`), `NodeOutputs` (`:704`, `:773`, `:788`), `NodeStatus` (`:719`),
`NodeDescription` (`:737`) **[4]**. The 808 lines are toolbar, hotkeys, banners and output
selection — the data-driven part is delegated one level down.

The field loop lives in `GenericNode/components/RenderInputParameters/index.tsx:25-44` **[4]**:

```
Object.keys(data.node?.template || {})
  .filter(!isInternalField)     // helpers/parameter-filtering.ts:3-5  → name.charAt(0) === "_"
  .sort(sortToolModeFields)
  .filter(isCanvasVisible)      // helpers/parameter-filtering.ts:30-34 → !show || advanced → hidden
```

then `shownTemplateFields.map(...)` → one `<NodeInputField>` per field (`:112-156`) **[4]**.

**Copy this wholesale.** One node component, a declarative field list, and visibility as two
booleans on the field (`show`, `advanced`) rather than as branching in the renderer. It is the
correct shape and it is *why* Langflow can ship 197 components without 197 node components.

---

## 2. The schema that drives it — the part that went wrong

### 2a. How a component declares its fields

Exactly your thesis. `lfx/components/input_output/chat.py:34-70` **[1]**:

```python
class ChatInput(ChatComponent):
    display_name = "Chat Input"
    icon = "MessagesSquare"

    inputs = [
        MultilineInput(name="input_value", display_name="Input Text", info="…", input_types=[]),
        BoolInput(name="should_store_message", display_name="Store Messages", value=True, advanced=True),
        DropdownInput(name="sender", options=[MESSAGE_SENDER_AI, MESSAGE_SENDER_USER], value=…, advanced=True),
        MessageTextInput(name="sender_name", …),
        …
    ]
```

One ordered array of typed field objects. It drives, from that single declaration:

- the rendered node (§1),
- the Python attribute (`self.input_value`),
- **the API schema** — `create_input_schema(inputs: list[InputTypes]) -> type[BaseModel]` at
  `lfx/io/schema.py:325-368` builds a Pydantic model from the array, mapping field type →
  Python type through `_convert_field_type_to_type` at `lfx/io/schema.py:26-38`, promoting
  `options` to a `Literal[...]` at `:339-345` and `is_list` to `list[...]` at `:346` **[1]**,
- **and the reverse** — `schema_to_langflow_inputs(schema)` at `lfx/io/schema.py:295` turns a
  Pydantic model back into field specs **[1]**.

Field **order** is the declaration order, nothing else: `_get_field_order()` at
`lfx/custom/custom_component/component.py:1718-1723` returns `[field.name for field in inputs]`,
applied by `reorder_fields()` at `lfx/custom/utils.py:97-108` **[1]**. Good — order is data,
not layout.

### 2b. The real input type list

`FieldTypes` at `lfx/inputs/input_mixin.py:18-47` **[1]** — **26 distinct wire values**:

```
str  int  float  bool  dict  NestedDict  sortableList  actionPicker  duration  connect
auth  file  prompt  mustache  code  other  table  link  slider  tab  query  tools  mcp
model  data_display  knowledge_backend
```

Above it sit **36 authoring classes** (`InputTypes` union, `lfx/inputs/inputs.py:1064-1102`;
`InputTypesMap` has 37 entries because `DataInput` is re-added as an alias at `:1107`) **[1]**:

`Input · AuthInput · QueryInput · DefaultPromptField · BoolInput · JSONInput · DataInput ·
DictInput · DropdownInput · MultiselectInput · SortableListInput · ConnectionInput · FileInput ·
FloatInput · HandleInput · IntInput · McpInput · ModelInput · MultilineInput ·
MultilineSecretInput · NestedDictInput · ToolsInput · PromptInput · MustachePromptInput ·
CodeInput · SecretStrInput · StrInput · MessageTextInput · MessageInput · TableInput ·
LinkInput · SliderInput · DataFrameInput · TabInput · ActionPickerInput · DurationInput ·
DataDisplayInput`

Attributes come from mixins composed onto `BaseInputMixin` — `DropDownMixin` adds
`options`/`combobox`/`toggle` (`:306-319`), `MultilineMixin` adds `multiline` (`:387-388`),
`RangeMixin` adds `range_spec` (`:290-291`), `SliderMixin` adds the six slider knobs
(`:402-409`), `TableMixin` adds `table_schema` (`:412-418`), `ListableInputMixin` adds
`is_list` (`:230-232`) **[1]**.

### 2c. ⚠️ THE MISTAKE — 36 authoring classes collapse into 26 wire types, and it costs them everywhere

`BaseInputMixin.serialize_model` at `lfx/inputs/input_mixin.py:141-147` **[1]**:

```python
@model_serializer(mode="wrap")
def serialize_model(self, handler):
    dump = handler(self)
    if "field_type" in dump:
        dump["type"] = dump.pop("field_type")
    dump["_input_type"] = self.__class__.__name__
    return dump
```

Two discriminators go on the wire: a **lossy** `type`, and an **exact** `_input_type`. Both are
compromised.

**The lossy one is very lossy.** `FieldTypes.PASSWORD = "str"` at `input_mixin.py:21` carries a
`# noqa: PIE796` — it is a *duplicate enum value*, so in Python `FieldTypes.PASSWORD` **is**
`FieldTypes.TEXT`. I verified it in the installed interpreter **[1]**:

```
>>> FieldTypes.PASSWORD is FieldTypes.TEXT   → True
>>> FieldTypes.PASSWORD.value                → 'str'
```

Five different authoring classes serialize to `type: "str"`, separated only by sibling flags **[1]**:

| class | wire `type` | what actually distinguishes it |
|---|---|---|
| `StrInput` | `"str"` | — |
| `SecretStrInput` | `"str"` | `password: true` |
| `MultilineInput` | `"str"` | `multiline: true` |
| `DropdownInput` | `"str"` | `options: [...]` |
| `MultiselectInput` | `"str"` | `options: [...]` + `list: true` |

**Measured on 1,884 real fields across 200 real nodes [3]:**

```
fields whose wire type is "str": 886  (47% of every field in the product)

one wire type "str" fans out to four controls, decided ONLY by sibling flags:
   610  plain      → InputGlobalComponent
   142  multiline  → TextAreaComponent
   128  options    → DropdownComponent
     6  list       → InputListComponent

…and those same "str" fields carry six different _input_type class names:
   350 MessageTextInput · 141 DropdownInput · 109 MultilineInput
   104 StrInput · 68 SecretStrInput · 58 MessageInput · 56 (none)
```

**Nearly half of all fields in Langflow share one wire type** and must be re-disambiguated, at
render time, by reading flags that the authoring layer already knew.

**And the exact discriminator is not reliable enough to rescue it.** `_input_type` is *absent*
on **234 of 1,884 fields — 12.4%** **[3]**, because `Template.from_dict` falls back to the flat
legacy `Input` class when it is missing (`lfx/template/template/base.py:51-59`) **[1]**:

```
fields WITHOUT _input_type: 234 (12.4%)
   by wire type: code:167, str:56, file:6, prompt:3, bool:2
```

Every `code` field lacks it. So the frontend **cannot** dispatch on `_input_type` — it is forced
onto the lossy `type` plus flags. The design in §3 is not a choice; it is a consequence.

The tax is visible in the shipped bundle. This predicate exists **[2]**:

```js
function iei(e){return e?.type==="SecretStr" || e?.password===!0 && e?.load_from_db===!0}
```

It tests for `type === "SecretStr"` — **a value the backend never emits.** `FieldTypes` has no
`SecretStr` member **[1]**, and across 1,884 real fields it appears zero times **[3]**. Half of
that predicate is dead code, kept alive because nobody can prove the lossy type never carries it.

### 2d. Two field models coexist

`lfx/template/field/base.py:32-104` **[1]** is the older `Input` class: one flat model carrying
`multiline`, `password`, `options`, `file_types`, `range_spec` all on the base, whether or not
they apply. `lfx/inputs/inputs.py` is the newer mixin-composed model. They migrated the
*authoring* API from flat-bag to composed-typed-classes — **but the wire format is still the
flat bag**, the union of every attribute. The migration stopped at the serializer.

> **For bbox-ui:** this is the whole lesson. Langflow's authoring layer is a discriminated
> union; its transport is a flat bag with a lossy tag. Everything downstream — the dispatcher,
> the dead predicate, the 12.4% hole — is a consequence of that one seam. Your FieldSpec `kind`
> must be the *single* discriminator, must round-trip losslessly, and must be exhaustively
> matched with a `never` check. If `kind: 'text'` and `kind: 'select'` both become `"string"`
> anywhere in your pipeline, you have rebuilt this.

---

## 3. The dispatcher — and the silent-vanish default

`src/frontend/src/components/core/parameterRenderComponent/index.tsx`, 400 lines **[4]**.

It is a **hybrid**: a guard clause, then a switch.

- `:100` — `if (TEXT_FIELD_TYPES.includes(templateData.type ?? "")) { … }`
  where `TEXT_FIELD_TYPES = ["str", "SecretStr"]` (`constants/constants.ts:882`) **[4]**.
  Verified present in the shipped bundle as `p7r=["str","SecretStr"]` **[2]**.
- `:140` — `switch (templateData.type) { … }` for everything else.
- `:386-387` — `default: return <EmptyParameterComponent {...baseInputProps} />;`

Full mapping **[4]**:

| wire `type` | control |
|---|---|
| `str`/`SecretStr` + `list`, no `options` | `InputListComponent` (`:104`) |
| `str`/`SecretStr` + `list` + `options` | `MultiselectComponent` (`:114`) |
| `str`/`SecretStr` otherwise | `StrRenderComponent` (`:128`) → sub-dispatch below |
| `NestedDict` | `DictComponent` (`:143`) |
| `dict` | `KeypairListComponent` (`:151`) |
| `bool` | `ToggleShadComponent` (`:159`) |
| `link` | `CustomLinkComponent` (`:167`) |
| `float` | `FloatComponent` (`:176`) |
| `int` | `IntComponent` (`:184`) |
| `file` | `CustomInputFileComponent` (`:193`) |
| `prompt` | `AccordionPromptComponent` / `PromptAreaComponent` (`:204`, `:211`) |
| `mustache` | `AccordionPromptComponent` / `MustachePromptAreaComponent` (`:220`, `:228`) |
| `code` | `CodeAreaComponent` (`:236`) |
| `table` | `TableNodeComponent` (`:239`) |
| `tools` | `ToolsComponent` (`:254`) |
| `slider` | `SliderComponent` (`:264`) |
| `sortableList` | `SortableListComponent` (`:280`) |
| `duration` | `DurationComponent` (`:292`) |
| `actionPicker` | `ActionPickerComponent` (`:302`) |
| `connect` | `CustomConnectionComponent` (`:319`) |
| `tab` | `TabComponent` (`:335`) |
| `query` | `QueryComponent` (`:343`) |
| `mcp` | `McpComponent` (`:353`) |
| `model` | `ModelInputComponent` (`:363`) |
| `knowledge_backend` | `DBProviderInputComponent` (`:372`) |
| `data_display` | `DataDisplayComponent` (`:379`) |
| **anything else** | **`EmptyParameterComponent`** (`:387`) |

The second-level dispatch for `str`, in `components/strRenderComponent/index.tsx` **[4]** —
this is where the §2c flags get read back:

```
has options                  → DropdownComponent      (:72)
no options + multiline       → TextAreaComponent      (:38)
no options + not multiline   → InputGlobalComponent   (:56)
  (+ webhook → WebhookFieldComponent :30, copy_field → CopyFieldAreaComponent :34)
```

Note `other` and `link` are absent from `DIRECT_TYPES` but `other` has no switch arm either —
a `HandleInput` (`type: "other"`, 77 real occurrences **[3]**) is a **connection-only field**:
it renders a port and no control.

### ⚠️ What happens on an unknown type — it silently disappears

`components/emptyParameterComponent/index.tsx`, in full **[4]**:

```tsx
export function EmptyParameterComponent({ id, nodeId, showParameter = true, … }: InputProps) {
  if (!showParameter) return null;
  return <div id={getNodeScopedDomId(id, nodeId)}></div>;
}
```

An unrecognised field type renders **an empty `<div>`, or nothing.** No error, no fallback
control, no console warning. Typo a field type in a custom component and the field vanishes
from the UI while remaining in the data — and because the value is still in the template, the
flow keeps *running* with it. This is the worst possible failure mode and you should not copy it.

**And it is not hypothetical — it is already happening to a shipped type.** `auth` is a real
backend field type: `FieldTypes.AUTH = "auth"` (`input_mixin.py:30`), `AuthInput`
(`inputs.py:855-865`), and it is listed in `DIRECT_TYPES` (`utils/constants.py:83`) **[1]**. The
frontend's own known-types set includes it — recovered from the bundle as
`Gvt = [… "connect","auth","query","mcp","tools","data_display"]` **[2]**. But **there is no
`case "auth"` arm in the dispatch switch.** I grepped the entire shipped bundle: the only
`case"auth"` is in an unrelated modal-sizing switch (`case"auth":t="min-w-[600px]"`) **[2]**.

So a legitimate, declared, first-class field type falls through to `default` and renders
nothing. It has survived because `auth` appears in **zero of the 1,884 fields** in the 29 real
flows **[3]** — the gap is invisible until someone uses it. That is exactly what a silent
default buys you: not a loud bug, a latent one that ships. An exhaustive `never`-checked switch
would have failed the build the day `AuthInput` was added.

### The one prop contract

`parameterRenderComponent/types.ts:13-47` — `BaseInputProps<valueType>`: `id, value, editNode,
handleOnNewValue, disabled, nodeClass?, helperText?, readonly?, placeholder?, isToolMode?,
tooltip?, metadata?, nodeId?, hasRefreshButton?, options?, showParameter?, ariaLabelledBy?` …
and `InputProps<valueType, T, U> = BaseInputProps<valueType> & T & { placeholder?: string }` at
`:50-55`, where `T` is each widget's own extra props **[4]**. The dispatcher assembles
`baseInputProps` once at `index.tsx:80-98` and spreads it into every branch **[4]**.

**Copy this.** One shared prop object built once, widget-specific props as a generic parameter.
It is exactly the contract your Controls/inspector/props triangle needs.

---

## 4. In-place editing — the question you actually asked

**The answer is that Langflow does two different things, and the split is principled.**

### Node NAME — a real element swap, behind an explicit edit button

`GenericNode/components/NodeName/index.tsx:80-92` **[4]**:

```tsx
return editNameDescription ? (
  <div className="w-full">
    <Input onBlur={handleBlur} value={nodeName} autoFocus onChange={onChange}
           onKeyDown={handleKeyDown} className="px-2 py-0" />
  </div>
) : (
  <div className="group my-px flex flex-1 items-center gap-2 overflow-hidden">
    <span className={cn("cursor-grab truncate text-base")} data-testid="node-name">
      {display_name}
    </span>
  </div>
);
```

- **At rest the DOM contains a genuine `<span>`** — not an `<input>` styled as text, not a
  `contenteditable`. Confirmed in the shipped bundle: `data-testid":"node-name` is present **[2]**.
- **Trigger is a pencil button, NOT double-click.** `GenericNode/index.tsx:519-556` **[4]**:
  a `<Button>` whose icon swaps `PencilLine` ↔ `Check`, `data-testid=
  "node-edit-name-description-button"` / `"node-save-name-description-button"` — both strings
  verified present in the shipped bundle **[2]**.
- State is `useAlternate(false)` in the *parent* (`GenericNode/index.tsx:150`), passed down as a
  prop — so **one toggle puts the name and the description into edit mode together** **[4]**.
- Commit: `onBlur` writes via `useFlowStore.setNode` (`:46-62`); `Enter` calls `handleBlur()` then
  exits (`:64-73`); `Escape` reverts to `display_name` without saving **[4]**.
- A `nodoubleclick` class sits on the rest-state wrapper — present in the bundle **[2]**. I
  could not find anything that *reads* it: it appears exactly twice, both times being applied,
  with no `classList.contains`, `.closest()` or attribute selector matching it anywhere in the
  bundle or stylesheet **[2]**. Treat it as an authored marker with no locatable consumer —
  probably vestigial. I am not claiming it suppresses anything.

### Node DESCRIPTION — markdown at rest, textarea when editing

`GenericNode/components/NodeDescription/index.tsx:176-223` **[4]**:

```tsx
{editNameDescription && !readOnly ? (
  <Textarea className={cn("nowheel w-full text-xs …")} autoFocus
            onBlur={handleBlurFn} value={nodeDescription} onKeyDown={handleKeyDownFn} />
) : (
  <div data-testid="generic-node-desc"
       className={cn("nodoubleclick generic-node-desc-text h-full cursor-grab …")}
       onDoubleClick={handleDoubleClickFn}>
    {renderedDescription}
  </div>
)}
```

At rest it is **rendered markdown** (`react-markdown` via `MemoizedMarkdown`, `:80`, `:86-105`)
**[4]**. `generic-node-desc` appears in both the shipped JS *and* the shipped CSS **[2]**.
The `onDoubleClick` at `:219` is gated to `stickyNote` only (`:154-159`) — so double-click-to-edit
works on sticky notes and is **inert on a normal node** **[4]**. Escape reverts; there is no
Enter-to-commit (it is a textarea, Enter inserts a newline).

### A PARAMETER value — no rest state at all

Trace `str` → `StrRenderComponent:56` → `InputGlobalComponent:190-213` → shared `InputComponent`,
which renders a real `<Input>` unconditionally **[4]**. **The `<input>` is in the DOM at all
times.** "Editing" is just focusing it. `editNode` only toggles a CSS class (`input-edit-node`) —
it never changes the element type.

### So the rule Langflow actually follows

| | at rest | edit trigger | mechanism |
|---|---|---|---|
| Node name | `<span>` | pencil button | **element swap** |
| Node description | rendered markdown `<div>` | same pencil button | **element swap** |
| Parameter value | live `<input>` | focus | **no swap — always live** |

**The principle: chrome swaps, data does not.** Identity/prose (name, description) is *display*
that becomes editable on an explicit gesture; a parameter is *a control that happens to be
sitting there*. That is a good rule and I would adopt it verbatim.

### contenteditable — exactly one, and it is the exception that proves the rule

`contentEditable` is **absent** from every ordinary widget and from name/description. It appears
in precisely one file: `parameterRenderComponent/components/accordionPromptComponent/components/
PromptEditableArea.tsx:55` — `contentEditable={!disabled && !readonly}` on a `<div>`, for the
prompt editor's inline `{variable}` highlighting, with manual `innerHTML` and cursor-offset
bookkeeping across `accordionPromptComponent/index.tsx:40-355` **[4]**. They reached for
contenteditable only when they needed **rich inline decoration inside editable text**, and paid
for it with 300 lines of cursor management. Note the IME/paste/undo semantics differ from a
native input.

### Text selection vs canvas drag — `nodrag`, and they use it at two levels

Langflow uses React Flow's opt-out classes, and uses **four** of them: `nodrag`, `nopan`,
`nodelete`, `noflow`. Verified in the shipped bundle as the literal string
`nopan nodelete nodrag noflow` **[2]**. Placement **[4]**:

- **Blanket wrapper** around the whole parameter block — `GenericNode/index.tsx:753`:
  `className="nopan nodelete nodrag noflow relative cursor-auto"`, plus an
  `onMouseDown={(e) => e.stopPropagation()}` immediately below it.
- **Per-widget, not just relying on the wrapper** — `floatComponent/index.tsx:79` and
  `intComponent/index.tsx:106` both carry `"nopan nodelete nodrag noflow primary-input"`.
- **Popovers/dropdowns add `nowheel`** — `inputComponent/components/popover/index.tsx:170`,
  and its content panel at `:403` is `"noflow nowheel nopan nodelete nodrag p-0"`.
- **`nowheel` for scroll containers** — `NodeDescription/index.tsx:171,181` applies it
  conditionally (`hasScroll ? "nowheel" : ""`) and unconditionally on the editing `Textarea`;
  `inputFileComponent/index.tsx:269` uses `"nopan nowheel …"` on its scrollable file list.
- **The slider explains itself** — `sliderComponent/index.tsx:227,285`, with a comment at `:280`
  about stopping propagation "and the nodrag/nopan opt-out" — a deliberate drag-vs-slide fix.
- The node root itself carries **none** of these; every interactive control opts *itself* out.

**`user-select` / `select-none`: zero hits across all 79 non-test component files** — one
`select-none` on the slider handle, which is drag, not text **[4]**. Langflow writes **no
`user-select` rule of its own.** It does not need to, and the shipped CSS shows why **[2]**:

```css
.react-flow__node{position:absolute;user-select:none;pointer-events:all;cursor:default}
```

That is **stock React Flow**, not Langflow — the node shell is already `user-select:none`, and
browsers exempt native form controls from an ancestor's `user-select`, so an `<input>` inside
it stays selectable with no override. Meanwhile `.nodrag`, `.nowheel` and `.nopan` have
**zero CSS rules in the entire 511 KB stylesheet** **[2]** — they are pure JS marker classes
that React Flow reads for pointer gating (`noDragClassName:"nodrag"` etc., recovered from the
bundle **[2]**).

**So the whole mechanism is: stock `user-select:none` on the shell, native inputs exempt by
spec, and `nodrag` on the control for pointer gating.** Three layers, none of them
hand-written CSS. Copy that arrangement exactly — the temptation is to start adding
`user-select` overrides, and you would be fighting a problem the browser already solved.

---

## 5. Handles / ports — colour is derived from declared TYPE (you have ruled otherwise)

`GenericNode/components/handleRenderComponent/index.tsx:494-522` **[4]**, one shared component
for both directions:

```tsx
type={left ? "target" : "source"}
position={left ? Position.Left : Position.Right}
isValidConnection={(c) => isLocked ? false : isValidConnection(c as Connection)}
```

from `@xyflow/react` (`:1`). Inputs render it with `left={true}` (`NodeInputField/index.tsx:118-136`);
outputs at `NodeOutputfield/index.tsx:350-351` with `left={false}` **[4]**.

**Colour comes from the declared data type.** I pulled the table straight out of the shipped
bundle **[2]**:

```
Data:"#dc2626"  JSON:"#dc2626"  Message:"#4f46e5"  Prompt:"#7c3aed"
Embeddings:"#10b981"  LanguageModel:"#c026d3"  Agent:"#903BBE"
Tool:"#00fbfc"  DataFrame:"#ec4899"  Table:"#ec4899"  …  unknown:"#9CA3AF"
```

Two parallel tables — hex (`nodeColors`, `utils/styleUtils.ts:118-166`) and Tailwind names
(`nodeColorsName`, `:171-222`) **[4]**. Resolution order in
`CustomNodes/helpers/get-node-input-colors.ts:1-38` **[4]**: try `nodeColors[input]` for each
`input_types` entry → fall back to the `types[input]` lookup → fall back to `nodeColors[type]` →
fall back to `nodeColors.unknown` (grey).

**Shape never varies** — always `rounded-full`, 10px normally and 6px when muted
(`handleRenderComponent/index.tsx:130-131`); the only structural variation is a
`2px solid hsl(var(--muted))` border for the unconnected-optional case (`:142`, `isNullHandle`) —
which is a **state**, not a type **[4]**.

Connection validity is `utils/reactflowUtils.ts:391` — rejects self-connection (`:397-399`), then
compares the handles' `input_types`/`output_types` via `typeIsCompatibleWith` (`:1195`) and
`typesAreCompatible` (`:1217`), with special-casing for loop inputs (`:430`) and a cycle check
(`findCyclePath`, `:411-428`) that still permits cycles through loop components **[4]**.

### Why your divergence is right, with a number

You have ruled that **port colour comes from STATE, not type**. Langflow is the counter-example,
and measuring it supports you. I extracted the full shipped colour table **[2]**:

```
type keys in nodeColors: 49
distinct colours:        35
```

**Colour is not injective.** Twelve collision groups, including:

```
#dc2626  ← Data, JSON
#ec4899  ← DataFrame, Table
#c026d3  ← BaseLanguageModel, LanguageModel
#903BBE  ← agents, Agent, AgentExecutor
#4F46E5  ← str, Text
```

So a user *cannot* read type off colour — two different types are routinely the same colour, and
anything unrecognised falls to grey, which is also a legitimate-looking colour. Langflow spent its
single most salient visual channel on a signal that does not uniquely decode. **Your ruling keeps
that channel for something that has few enough values to actually be readable.** Keep it.

---

## 6. What to copy, what to avoid

### Copy

1. **One generic node component, driven entirely by a field array.** Two node types total —
   `genericNode` for everything real, one escape hatch for sticky notes. This is the single
   highest-value thing in the codebase and it is proven at 197 components.
   → read `GenericNode/index.tsx`, `RenderInputParameters/index.tsx`, `helpers/parameter-filtering.ts`

2. **One shared prop contract for every control, assembled once and spread.**
   `BaseInputProps` + `InputProps<valueType, T>` with the widget's extra props as a generic.
   The dispatcher builds `baseInputProps` once and spreads it into all 26 branches. This is
   exactly the seam that lets one field array feed Controls *and* an inspector.
   → read `parameterRenderComponent/types.ts:13-55` and `index.tsx:80-98`

3. **"Chrome swaps, data does not."** Name and description swap between a display element and an
   editor on an explicit gesture; parameter controls are always live. And `nodrag` on the
   interactive element is the *whole* answer to drag-vs-selection — Langflow writes zero
   `user-select` rules of its own, relying on stock React Flow's `user-select:none` on the node
   shell plus the browser's exemption for native form controls. Both are cheap, and both are right.
   → read `NodeName/index.tsx:80-92` and `NodeDescription/index.tsx:176-223`

### Avoid

4. **The lossy wire type.** 36 authoring classes → 26 wire values, with `PASSWORD` an actual
   duplicate-valued enum alias for `TEXT`. 47% of all real fields are `"str"`, re-disambiguated
   at render time by flags the authoring layer already knew. The escape-hatch discriminator
   `_input_type` is missing on 12.4% of fields, so it cannot rescue it, and the frontend still
   carries a dead `type === "SecretStr"` branch for a value that is never emitted. **Your `kind`
   union must survive serialization intact.**

5. **`EmptyParameterComponent`.** An unknown field type renders an empty `<div>` and no warning
   — and this already bites a shipped type: **`auth` has no arm in the switch** and silently
   renders nothing (§3). Make yours a `never`-checked exhaustive switch that fails the build,
   and render a loud fallback at runtime.

6. **Runtime schema mutation — the one that would actually break your thesis.**
   `update_build_config(build_config, field_value, field_name)` (`custom_component.py:265-276`)
   lets a component **imperatively rewrite its own field set on the server** in response to a
   field change. **45 of ~197 components implement it** **[1]**. Real example,
   `lfx/components/processing/parser.py:72-93` **[1]** — it adds and removes a whole field:

   ```python
   if field_name == "mode":
       build_config["pattern"]["show"] = self.mode == "Parser"
       build_config["clean_data"] = BoolInput(name="clean_data", …).to_dict()   # or:
       build_config.pop("clean_data", None)
   ```

   This is not theoretical. Measured across the 29 real flows **[3]**, **10 of 32 component types
   have instances whose stored field sets differ from each other**:

   ```
   parser:  2 shapes — the larger has  clean_data, is_refresh   ← exactly the code above
   Prompt:  9 shapes — 4 to 10 fields, extras are prompt variables
                       (current_solutions, expertise_level, goals, pain_points, …)
   Agent / Knowledge / SQLComponent: field set varies by instance
   ```

   `Prompt` synthesises one field per `{variable}` in the prompt text
   (`DefaultPromptField`, `lfx/template/field/prompt.py:8-15`; `add_new_variables_to_template`,
   `lfx/base/prompts/api_utils.py:224`) **[1]**.

   **The field set is therefore a property of the instance, not the component.** You cannot
   generate a static TypeScript prop type from it — which is precisely the thing bbox-ui exists
   to do. If you need conditional fields, make the *condition* declarative data on the field
   (`visibleWhen`), evaluated client-side against the instance's values. Never let a component
   rewrite its own schema; that is the move that makes the array stop being a source of truth.

7. **Do not let the instance embed the definition.** Each node stores a full copy of its template
   *including the component's entire Python source* in a `code` field. Measured **[3]**:

   ```
   200 nodes  →  5,295,900 bytes of node JSON
                 3,636,515 bytes of it (68.7%) is duplicated component source code
   largest single node: 88,652 B, of which 75,410 B is source
   ```

   I checked for actual drift and found none in this corpus (0 of 30 component types had
   divergent embedded source **[3]**) — these are freshly seeded example flows, all from one
   version. So this is a **latent** fork, not an observed one. But it is the mechanism by which
   a saved flow silently pins a stale copy of a component, and it is 69% of the payload.

### The three files to read yourself

If you read nothing else, read these — one per layer, in this order:

1. `.../lfx/inputs/inputs.py` (1,118 lines) — **the FieldSpec analogue.** 36 classes composed
   from mixins. Skim the class list at `:1064-1102`, then read `input_mixin.py:18-147` for the
   enum and the serializer. That is where the lossy seam is, in about 130 lines.
2. `src/frontend/src/components/core/parameterRenderComponent/index.tsx` (400 lines) — **the
   dispatcher.** The switch is the whole file. Read `:80-98` (the prop contract) and `:386-387`
   (the silent default).
3. `src/frontend/src/CustomNodes/GenericNode/components/RenderInputParameters/index.tsx`
   (178 lines) — **the field loop**, and the shortest proof that one node renders everything.

Both frontend files are web-only at tag `v1.12.0` — they are not in the local install **[4]**.

---

## Source Index

1. **Langflow/lfx 1.12.0 backend source, on disk** —
   `/home/bam/langflow/.venv/lib/python3.12/site-packages/lfx/`
   (`inputs/input_mixin.py`, `inputs/inputs.py`, `io/schema.py`, `template/field/base.py`,
   `template/template/base.py`, `custom/custom_component/component.py`,
   `custom/custom_component/custom_component.py`, `custom/utils.py`, `utils/constants.py`,
   `components/input_output/chat.py`, `components/processing/parser.py`,
   `base/prompts/api_utils.py`). Claims also re-checked by executing the installed interpreter.
2. **Shipped minified frontend bundle, on disk** —
   `/home/bam/langflow/.venv/lib/python3.12/site-packages/langflow/frontend/assets/index-DLYZZeg6.js`
   and `index-EI7oBGJ0.css`. 31 MB, 1,873 assets, **no sourcemaps**. Used to verify that the
   web-sourced React claims match the build actually installed here.
3. **Live flow database, read-only** — `/home/bam/langflow/data/langflow.db`
   (`sqlite:…?mode=ro`). 29 flows, 200 nodes, 1,884 template fields. All histograms, drift
   measurements and byte counts above are computed from this.
4. **Langflow frontend TypeScript source, GitHub tag `v1.12.0`** (commit `435c0c9`) —
   `github.com/langflow-ai/langflow/blob/v1.12.0/src/frontend/src/…`. **Web-sourced**, because
   the local install ships no `.tsx` and no `.map`. Every structurally load-bearing claim from
   here was corroborated against [2].

**Known gap:** React Flow is declared twice in `package.json` at this tag — `@xyflow/react ^12.3.6`
(`:86`) and `reactflow ^11.11.3` (`:132`). The node and handle code imports exclusively from
`@xyflow/react`; whether anything still imports the v11 package could not be verified, since
GitHub code search does not pin reliably to a tag. Treat `reactflow@11` as *probably* vestigial,
not confirmed dead.
