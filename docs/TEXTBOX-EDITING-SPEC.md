# TextBox editing half — frozen contract (2026-09-11)

Zach's plan (vault: `PROJECT - Black Box UI.md`, comment
`ai-comment:black-box-ui-editable-text-2026-09-11`) chose **option B**: the
existing `TextBox` grows an editing half. At rest it stays a real `<span>`-like
box; when the host says `editing`, the same box swaps its text for a native
control wearing the same font, and the host owns *when*. Nothing here is a new
component. This file is the contract every builder codes against; do not widen
or reinterpret it — if it is wrong, stop and say so in your return value.

**Definition of done, in Zach's words:** "make sure that I can add this
component to the slots in the block in the /create page." Concretely, on
`/create`: pick a Block's slot fill (e.g. *Header · left*) in the navigator,
use the Members control to add a `TextBox`, and it appears *bare* in that slot
(no dashed placeholder frame); click it → the inspector shows the TextBox;
click it again (it is already the selected instance) → it is editing in place;
type; Enter → the slot shows the new text and the instance's `children` prop
holds it. This must hold in all three renders (DOM, React Flow, tldraw), and a
drag that starts on the resting text on React Flow / tldraw still moves the
node instead of selecting characters.

Worktree: `/home/bam/bbox-ui/.claude/worktrees/text-box-editing`, branch
`claude/text-box-editing`, cut from `388195d` (members-control tip). Baseline
verified green there: `pnpm -r run typecheck` and `pnpm -r run test` (448
tests). A Next dev server for a *peer* worktree is on port 4100 — never use or
kill it; this lane's dev server runs on **4177**.

## 1. `TextBox` (packages/bbox-ui/src/textBox.tsx, .fields.ts, .layout.ts)

Existing props stay exactly as they are (`size`, padding four, `font`,
`align`, `justify`, `children`, `className`, `style`, rest `div` props). Add:

| prop | type | default | rule |
|---|---|---|---|
| `lines` | `"single" \| "multi"` | `"single"` | rest: single = `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` and a `title` attribute carrying the full text (truthful truncation); multi = `white-space: pre-wrap; overflow-wrap: anywhere`. Editing: single → `<input type="text">`, multi → `<textarea>`. |
| `editing` | `boolean` | `false` | **controlled; the host owns it.** When true and `children` is a string, the box renders the control instead of the text. When `children` is not a string, `editing` is ignored (render rest). |
| `onChange` | `(value: string) => void` | — | every keystroke (write-through, like SystemSketch's `writeField`). |
| `onCommit` | `(value: string) => void` | — | Enter (single), Ctrl/Cmd+Enter (multi), blur. |
| `onCancel` | `() => void` | — | Escape. The host decides what reverting means. |
| `placeholder` | `string` | — | on the control and, at rest when text is empty, painted muted with `data-placeholder`. |
| `readOnly` | `boolean` | `false` | when true the host may still pass `editing` but the control is `readOnly`. |
| `maxLength` | `number` | — | passed to the control. |
| `size` | adds `"custom"` | `"md"` | `sizePx` (number, default `24`) is the font px when `size === "custom"`; ignored otherwise. Implement as `textBoxFontPx(size, sizePx)` in `textBox.layout.ts`; `TEXT_BOX_SIZES` keeps its four rungs, `TextBoxSize` widens to include `"custom"`. |

The text prop is `children` (string). There is no `value` prop — one flat
property space, and the inspector's existing *Text* field is the same value.

**The editing control** (single `<input>` / multi `<textarea>`), rendered
in-flow inside the same box (not an overlay), must:

- carry `data-slot="text-box-input"`, `data-bbox-interactive=""` **and** the
  class `bbox-interactive` (the host-neutral marker; React Flow gates by class
  name, tldraw by attribute — the core emits both and owns nothing else);
- inherit the box's typography exactly: `font: inherit; font-size: inherit;
  line-height: inherit; color: inherit; text-align: inherit`, `background:
  transparent`, `margin: 0`, `padding: 0`, `border: 0`; the only chrome is an
  outline ring: `outline: 2px solid var(--bbox-ring, currentColor);
  outline-offset: 2px; border-radius: 4px` (the shadcn focus-ring idiom; at
  rest there is no outline at all — that is the whole point);
- grow with content: inline style `fieldSizing: "content"` (Chromium 123+ —
  cast the style object, TS may not know the property) plus `rows={1}` on the
  textarea and `min-width: 4ch` on the input as the fallback;
- `autoFocus`; on mount, single-line selects all, multi-line puts the caret at
  the end;
- keys (skip when `event.nativeEvent.isComposing`): Escape → `preventDefault`,
  `onCancel()`; Enter on single, or Ctrl/Cmd+Enter on multi → `preventDefault`,
  `onCommit(current)`; plain Enter on multi → newline (native); blur →
  `onCommit(current)`;
- stop propagation of `pointerdown`, `click`, `dblclick` and `contextmenu` on
  the control itself (a right-click must give the browser's cut/copy/paste
  menu; a caret click must not re-run the host's selection). This is the
  control owning its own pointer, not a host gate.

The root keeps `data-slot="text-box"` and gains `data-lines` and
`data-editing="true|false"`.

**Fields** (`textBox.fields.ts`): add `lines` (segments, `single`/`multi`,
default `single`), `placeholder` (text, default `""`), `sizePx` (number,
default 24, min 8, step 1, unit px, group `size`, meant to sit beside `size`
— find how `/create` declares side-by-side pairing and use it), and change the
existing `children` field's kind to the new `"textarea"` kind (§2). Do **not**
add `editing`/`onChange`/`onCommit`/`onCancel`/`readOnly`/`maxLength` as
fields — they are host wiring, not properties a person sets. Every default in
the field table must equal the prop's real destructured default;
`test/textBox.fields.test.ts` pins that, extend it. `registrySnapshot.test.ts`
will need its snapshot updated deliberately.

**Stories** (`apps/storybook/src/stories/TextBox.stories.tsx`): add stories
for rest × editing × single × multi, plus a `custom` size one. The editing
story wires `editing` to a local `useState` so the Storybook control can flip
it live. The text must not shift by a pixel between rest and editing at the
same size/font — measure it in the browser journey (§4).

## 2. Schema: a `textarea` field kind (packages/schema/src/field.ts)

`FieldKind` gains `"textarea"`: a multi-line text control whose value is a
string. Every consumer that switches on `FieldKind` must handle it — find them
all (`grep -rn '"text"' packages apps --include=*.ts --include=*.tsx`), at
least: the panel's control renderer (`FieldTraceRow.tsx` / wherever `"text"`
renders an input), `bench.tsx`'s `randomValue`, the schema's Storybook
`toArgTypes` (map to Storybook's `text` control), and any exhaustive/`never`
check. The inspector control for it is a `<textarea rows={1}>` with
`fieldSizing: "content"` so a single-line value looks like an input and a
multi-line one grows. Add a unit test that a `textarea` field reads/resolves
like `text`.

## 3. Panel + /create wiring (packages/panel, apps/docs)

**`ComponentEntry`** (`packages/panel/src/registerComponent.ts`) gains
`inlineEdit?: { field: string }` — the prop the in-place editor writes.
`TextBox`'s entry declares `inlineEdit: { field: "children" }`. No other
component declares it.

**`RenderContext`** gains:

```ts
/** True when this instance is drawn INSIDE a parent (a member or a slot fill),
 *  so a render can drop bench-only chrome such as a placeholder frame. */
nested?: boolean;
/** Present for an entry that declares `inlineEdit`. */
edit?: {
  editing: boolean;               // this instance is the one being edited
  onChange: (value: string) => void;   // write-through to inlineEdit.field
  onCommit: (value: string) => void;   // ends editing, keeps the value
  onCancel: () => void;                // ends editing, restores the value at edit start
};
```

`bench.tsx`'s `TextBox` entry: when `ctx?.nested` render the bare `<TextBox>`
(no dashed 220px div — the frame is bench chrome for a top-level specimen only);
always pass `editing`, `onChange`, `onCommit`, `onCancel` from `ctx.edit`.

**`ViewportProps`** (`apps/docs/src/components/create/contract.ts`) gains:

```ts
editingId: string | null;
onRequestEdit: (id: string) => void;
onEditEnd: () => void;
/** Writes ONE instance's prop — not the selection's. */
onInstancePropChange: (id: string, fieldId: string, value: FieldValue) => void;
```

The page (`workbench.tsx`) owns `editingId` and the value snapshot taken when
editing began (for cancel). Rules: selecting a different instance commits and
ends editing; `onRequestEdit` on an instance whose entry has no `inlineEdit`
is a no-op; a prop written through `onInstancePropChange` is an ordinary
override (shows in the inspector like any other).

**`renderInstance`** (`render-instance.tsx`) takes the edit bundle and applies
the **two-click rule** in its member wrapper (and `dom-preview.tsx`'s root
wrapper applies the same rule for a top-level instance — share one helper):
pointer-down on an instance that is *already the sole selected id* and whose
entry declares `inlineEdit` → `onRequestEdit(id)`; otherwise select as today.
Double-click → `onRequestEdit(id)` directly. While an instance is editing, its
wrapper must not re-select on pointer-down inside the control (the control
already stops propagation; keep it that way).

**Hosts:**

- *DOM preview*: pass-through only.
- *React Flow* (`reactflow-canvas.tsx`): set `noDragClassName`,
  `noPanClassName` and `noWheelClassName` on `<ReactFlow>` to
  `"bbox-interactive"` — verify these props exist in the installed
  `@xyflow/react` types before relying on them; if any is missing, wrap the
  editing control's ancestor with the stock `nodrag nopan nowheel` classes
  inside `BenchFlowNode` instead and say which you did. The node root keeps
  its drag.
- *tldraw* (`tldraw-canvas.tsx`): `BenchShapeUtil.canEdit()` stays/returns
  `false` (the page owns editing, not tldraw's editing state). Add to the
  page's CSS: `.tl-container[data-state='select.idle'] [data-bbox-interactive]
  { pointer-events: all }` and, on the shape's `HTMLContainer`, call
  `editor.markEventAsHandled(e)` for a pointer-down whose target is inside
  `[data-bbox-interactive]` so tldraw starts no gesture. `editingId` must reach
  the shape's render the same way `selectedIds` does today.

## 4. Proof (demos/capture-text-box-editing.mjs + report)

A CDP journey modelled on `demos/capture-tree-and-slots.mjs`, starting the
docs app on port **4177** (`pnpm --filter @bbox-ui/docs exec next dev --port
4177`, or whatever that script's own launch idiom is), headless, never on the
desktop display. For **each** render (dom, reactflow, tldraw):

1. open `/create`, pick a bench that has a Block (or add one), select the
   *Header · left* slot fill via the navigator, add a `TextBox` through the
   Members control;
2. assert the new TextBox renders inside `[data-slot="block-header"]` with no
   dashed frame (`border-style` of its wrapper is not `dashed`);
3. click it → assert it is the selected instance; click again → assert
   `[data-slot="text-box-input"]` exists, is `document.activeElement`, and its
   bounding box top/left/height match the resting text's within 1px;
4. type `Hello slot`, press Enter → assert the input is gone, the resting text
   reads `Hello slot`, and the inspector's Text field reads `Hello slot`;
5. click again, type `zzz`, Escape → assert the text is still `Hello slot`;
6. set `lines` to `multi` in the inspector, click to edit, type `a`, Enter,
   `b` → assert the textarea value contains a newline; Ctrl+Enter → assert
   committed and rendered on two lines;
7. on reactflow and tldraw only: press on the resting text and drag 80px →
   assert the node moved and `window.getSelection().toString()` is empty.

Capture a PNG at each assertion into `reports/media/text-box-editing/`, then
build `reports/media/text-box-editing-2026-09-11.html` with a builder script
`docs/build_text_box_editing.py` (inline the PNGs as data URIs; the report
lands in the gitignored media half because it carries captures). Also record a
short hero clip or GIF of steps 3–4 if the existing capture tooling can; do not
fabricate an animation.

## 5. House rules that apply here

- Work only in the worktree above, by absolute path. Never `git add -A`; stage
  explicit paths and read `git diff --cached --name-only` before each commit.
  Commit your own step with a real message; do not push, merge or rebase.
- Never type the headless browser binary's name into a Bash command (a hook
  rejects it); launch it from Node the way the existing capture scripts do.
- Leave `WHY:` comments at the seams where this contract makes a non-obvious
  call: the marker being both a class and an attribute; the two-click rule;
  `canEdit() → false`; the bare render when nested.
- `pnpm -r run typecheck` and `pnpm -r run test` must be green at the end of
  every step. Report the numbers, not "green".
