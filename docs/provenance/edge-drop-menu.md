# Algorithm provenance — the edge-drop menu (card 14)

Scope: `apps/storybook-basics/src/editor/nodeCatalog.ts` and
`apps/storybook-basics/src/editor/edgeDropMenu.tsx`. Held to the same rule
as `docs/ALGORITHM-PROVENANCE.md` (not edited here — this is a new,
separate file for a lane whose write set excludes it): a citation earns its
place only if it is a path and line range that exists on this disk and was
opened, or a URL fetched while writing this, with the relied-on behaviour
quoted or paraphrased right beside it. Nothing below is cited from memory.

Zach, on this card: *"agree this is nice. Let's please add this to
editor-components. We already have the implementation in SystemSketch."*
And on the judge, card 23's rule this file's mechanism has to satisfy:
route the convenience gesture through the same gate the raw press uses.

## Classification

- **(a) Ported** — a donor exists on this disk; the code is a copy or
  near-copy.
- **(b) Re-expressed** — the donor's *behaviour* survives; the code does
  not, because the donor's plumbing (a live `tldraw` editor, a reactive
  atom) has no equivalent in an engine-agnostic file.
- **(c) Ours** — invented here, no prior art claimed beyond what is noted.

| Piece | Class | Donor | Verified how |
|---|---|---|---|
| `nodeCatalog.ts`'s `NodeCatalogEntry` shape | (b) | SystemSketch `src/blocks/connections/blockPicker.ts:23-33` (`BlockPickerPreset`) | Opened in full 2026-09-18 |
| `nodeCatalog.ts`'s `catalogFor` | (b) | SystemSketch `blockPicker.ts:58-63` (`blockPickerPresetsFor`) | Opened; quoted below |
| `nodeCatalog.ts`'s type-compatibility axis | (b), composed from an existing (a) | This kit's own `scene/lint.ts` `TypeCompatible`/`typesIntersect`, itself Blockly `ConnectionChecker.doTypeChecks` (Apache-2.0) — see `lint.ts`'s own header for that citation; not re-verified here, only reused | `typesIntersect` imported, not reimplemented |
| `edgeDropMenu.tsx`'s `placeEdgeDropMenu` (flip-then-clamp) | (b) | SystemSketch `src/blocks/ui/OnCanvasBlockPicker.tsx:107-121` | Opened in full 2026-09-18; quoted below |
| `edgeDropMenu.tsx`'s first-item/first-action focus on open | (b) | `OnCanvasBlockPicker.tsx:165-171` | Opened; re-expressed without the `requestAnimationFrame`-guarded ref pattern change |
| `edgeDropMenu.tsx`'s outside-press declines | (b) | `OnCanvasBlockPicker.tsx:173-186` | Opened |
| `edgeDropMenu.tsx`'s Escape/Undo-key dismiss | (b) | `OnCanvasBlockPicker.tsx:144-160` | Opened |
| `edgeDropMenu.tsx`'s arrow-key menu navigation | (b) | `OnCanvasBlockPicker.tsx:209-222` (`onMenuKeyDown`) | Opened |
| `edgeDropMenu.tsx`'s judge-gates-the-offer mechanism (card 23) | (c), motivated by a documented ANTI-pattern | JointJS `joint-core` — see "The JointJS anti-pattern" below | Fetched from the JointJS GitHub repo 2026-09-18; both ranges quoted below |
| Upstream idea: a type-filtered search box on a released link | (a)-adjacent, cited as prior art only | litegraph.js — see "litegraph's own mechanism" below | Read from `/tmp/litegraph.js` (fetched into this session's scratch area for the prior-art report), 2026-09-18 |
| `edgeDropMenu.tsx`'s CSS (Tailwind utility classes, no separate stylesheet) | (c) | — | Matches `focusControls.tsx`'s own inline-class convention, not the donor's `.OnCanvasBlockPicker.css` |
| The demo catalog/scene in `EdgeDropMenu.stories.tsx` | (c) | — | This lane's own fixture; explicitly NOT SystemSketch's `BLOCK_PICKER_PRESETS` domain vocabulary (Call/Transform/Branch/Store/…), which the brief says stays out of the kit |

## What did NOT travel, and why

- **`useEditor`/`useValue`/`useQuickReactor`/`useAtom`** (all `tldraw`,
  `OnCanvasBlockPicker.tsx:10-19`) — the donor tracks a live cable shape
  through a reactive editor-scoped atom and re-measures on every camera
  change. `src/editor/README.md`'s own rule ("no canvas engine import")
  rules this out categorically; `EdgeDropMenu` instead takes `anchor`/
  `viewport` as plain props a host's own drag handler updates on move,
  the same division of labour `focusControls.tsx` already uses.
- **`.OnCanvasBlockPicker.css`, the "Quick insert" / "Other Blocks" preset
  grouping, `BlockIconGlyph`** — the grouping is SystemSketch's own preset
  table (`stockBlocks.ts`, not opened for this lane — out of scope), not a
  kit concept. `EdgeDropMenu` renders `entries` as one flat list.
- **`pickerCreationMarks`/`bailToMark`/history-mark bridging** — tldraw's
  own undo-mark plumbing. This is exactly the line cards 21-26 draw: the
  kit hands a host a history CONTRACT; it does not carry a host's own undo
  stack. Out of this lane's scope entirely.
- **`stockBlockPresetProps`/`BlockShapeProps`/`PROJECTION_BLOCK_TYPE`** —
  SystemSketch's own Block/shape model. `NodeCatalogEntry` carries `kind`
  as an opaque host tag instead; the kit never branches on it.

## The verified prior art, in full

### 1. `blockPickerPresetsFor` → `catalogFor`

SystemSketch `src/blocks/connections/blockPicker.ts:58-63` (opened
2026-09-18):

```ts
/** The presets that can actually answer the cable: a producer needs an output, a consumer an input. */
export function blockPickerPresetsFor(wantsProducer: boolean): BlockPickerPreset[] {
	return BLOCK_PICKER_PRESETS.filter((preset) => (
		wantsProducer ? preset.outputs > 0 : preset.inputs > 0
	))
}
```

Re-expressed in `nodeCatalog.ts` as:

```ts
export function catalogFor(
  catalog: readonly NodeCatalogEntry[],
  want: NodeCatalogWant,
  compatible: TypeCompatible = typesIntersect,
): NodeCatalogEntry[] {
  return catalog.filter((entry) => {
    const suppliesNeededPolarity = want.direction === "source" ? entry.outputs > 0 : entry.inputs > 0;
    if (!suppliesNeededPolarity) return false;
    if (want.types === undefined || entry.types === undefined) return true;
    return compatible(entry.types, want.types);
  });
}
```

The donor's `wantsProducer: boolean` becomes `want.direction: PortDirection`
(`"source" | "sink"`, this kit's own `scene/lint.ts` vocabulary) — same
rule (`direction === "source"` ⇔ donor's `wantsProducer === true`, both
meaning "the candidate must supply an output"), no boolean reinvented. The
type-axis clause has no donor counterpart: SystemSketch's presets carry no
port-type vocabulary at all (grepped `BlockPickerPreset`'s own field list,
quoted above — `id`/`label`/`icon`/`blockType`/`view`/`inputs`/`outputs`/
`stockPreset`/`group`, no `types`). Added because this kit already has one
and cards 09/14 both want it.

### 2. Flip-then-clamp placement

SystemSketch `src/blocks/ui/OnCanvasBlockPicker.tsx:107-121` (opened
2026-09-18):

```ts
// Prefer the flow-facing side, then flip and finally clamp. Quick access
// has to remain quick at the bottom and right edges too; otherwise the
// newly promoted second and third choices can be outside the viewport.
const leftOfCable = viewport.x - width
const rightOfCable = viewport.x
const preferred = state.wantsProducer
	? (leftOfCable >= margin ? leftOfCable : rightOfCable)
	: (rightOfCable + width <= viewportBounds.w - margin ? rightOfCable : leftOfCable)
const x = Math.min(Math.max(preferred, margin), Math.max(margin, viewportBounds.w - width - margin))
const idealY = viewport.y - anchor
const y = Math.min(Math.max(idealY, margin), Math.max(margin, viewportBounds.h - height - margin))
```

Re-expressed in `edgeDropMenu.tsx`'s `placeEdgeDropMenu` — same three-step
shape (prefer a side → fall back to the other → clamp both axes into the
viewport with an 8px margin), as a **pure function of an already-measured
size** rather than a live `useQuickReactor` reading a tldraw editor's
`getViewportScreenBounds()`. `wantsProducer` becomes the caller-supplied
`preferSide: "start" | "end"` (a pure geometry parameter now — which
polarity maps to which side is the *host's* call, made once, outside this
function, via `NodeCatalogWant`).

**One deliberate simplification, stated rather than left implicit:** the
donor's vertical anchor (`idealY = viewport.y - anchor`, where `anchor` is
the *first rendered item's own* vertical center, `:107`) keeps the
"Quick insert" group at eye level with the cable — a grouping concept this
kit's flat list does not have. `placeEdgeDropMenu` instead centers the
*whole menu* vertically on the anchor (`idealY = anchor.y - size.height /
2`). Verified as intentional, not an oversight: `edgeDropMenu.test.ts`'s
"clamps y symmetrically" test asserts this exact formula, and the case for
it is fairness — with no privileged first row, centering the menu itself
is the equivalent default rather than picking a row to privilege.

### 3. First-item focus, Escape/Undo dismiss, outside-press decline, arrow navigation

All four re-expressed from `OnCanvasBlockPicker.tsx`, same file, opened in
full 2026-09-18:

- Focus-first-item on open — `:165-171` (`requestAnimationFrame` +
  `container.querySelector('.OnCanvasBlockPicker-item')?.focus()`).
  `edgeDropMenu.tsx` does the identical rAF-guarded query/focus against its
  own `[data-slot='edge-drop-menu-item']` selector.
- Escape/Undo dismiss — `:144-160` (`event.key === 'Escape' ||
  ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')`,
  attached to `editor.getContainer().ownerDocument` with `capture: true`).
  `edgeDropMenu.tsx`'s `cancelsOffer` is the identical predicate, attached
  to `container.ownerDocument` (this kit has no `editor` handle to read a
  container from).
- Outside press declines — `:173-186` (`pointerdown` on the owner
  document, `container?.contains(event.target)` check). Ported verbatim as
  a mechanism, same condition, same event, same phase.
- Arrow/Home/End menu navigation — `:209-222` (`onMenuKeyDown`). Ported
  verbatim as a mechanism: same four keys, same wrap-around modulo
  arithmetic, same "no focused item → jump to an end" fallback.

**What did NOT come along with any of the four:** the donor's per-instance
history-mark bridging (`pickerCreationMarks`, `bailToMark`) that runs
*inside* several of these same handlers in the donor file — that is
tldraw's own undo mechanism, host-owned, and out of scope here (see "What
did NOT travel" above).

## Card 23's rule: the judge is the only gate

### The JointJS anti-pattern this rule is a direct reaction to

Fetched from `github.com/clientIO/joint` (JointJS, `joint-core`) 2026-09-18,
both ranges opened on their respective files:

`src/dia/ElementView.mjs:785-802` (the raw pointer-drag path) calls
`this.paper.options.validateMagnet` before allowing a connection to be
initiated from a magnet at all:

```js
} else if (this.paper.options.validateMagnet(this, magnetEl, evt)) {
    this.model.trigger('link:pointerdown', ...
```

`src/cellTools/Connect.mjs:60-68` (the same paper's "convenience" Connect
tool — a draggable handle a user can grab without ever touching a raw
magnet) starts a link directly, with no equivalent call to
`validateMagnet` anywhere in the file:

```js
dragstart: function(evt) {
    ...
    const link = new (this.options.LinkClass)(linkAttributes);
    ...
    view.startArrowheadMove(evt, ARROWHEAD_END, options);
},
```

Same paper, same eventual link-creation path, two different gates: the raw
gesture is validated, the convenience tool is not. That is precisely the
shape this card's rule forbids — "one gate, no second entry point" — and
`edgeDropMenu.tsx`'s `judge` prop is built so the SAME `validateConnection`
call a host's raw drag-drop handler already runs is what an entry has to
pass to be rendered at all (see `EdgeDropMenu.stories.tsx`'s `judgeVerdict`,
literally the "one line" fix `scene/batchWireJudge.ts`'s own header already
quotes Zach asking for: `const judge = (c) => validateConnection(scene, c)`).
No second filtering pass exists anywhere in `edgeDropMenu.tsx` — `offered`
is `entries.filter(judge)`, full stop, verified red under mutation (see
below).

### litegraph's own mechanism (upstream idea, cited as prior art only)

Read from `/tmp/litegraph.js` (a copy already fetched into this session's
scratch area while building the earlier node-editor prior-art report;
re-opened directly for this citation rather than trusted from that
report's memory) 2026-09-18. The brief for this lane named line `:139` for
`type_filter_in` and `:6878-6893` for the release handler — on the actual
copy read here those do not match (`:139` is an unrelated config comment);
the real occurrences, grepped and opened:

`:6879-6893` — releasing a link over empty space opens a type-filtered
search box, one direction or the other depending on which end was loose:

```js
if(this.connecting_output){
    this.showSearchBox(e,{node_from: this.connecting_node, slot_from: this.connecting_output, type_filter_in: this.connecting_output.type});
}else if(this.connecting_input){
    this.showSearchBox(e,{node_to: this.connecting_node, slot_from: this.connecting_input, type_filter_out: this.connecting_input.type});
}
```

`:11670-11710` — `showSearchBox`'s own filtering loop, comparing each
candidate node's slot type string against `options.type_filter_in` /
`options.type_filter_out` (case-insensitively) before offering it. This is
the upstream idea `edgeDropMenu.tsx` and `nodeCatalog.ts` both draw on — a
released link on nothing opens a search filtered by the missing polarity's
type — cited here only as prior art for the IDEA; no litegraph code was
copied (its filtering runs inline inside a jQuery-era search-box widget
with no equivalent shape to borrow).

### Verified by mutation

- Removing the judge filter (`entries.filter((entry) => judge(entry))` →
  `entries.filter(() => true)`) in `edgeDropMenu.tsx` and re-running
  `EdgeDropMenu.stories.tsx`'s `Default` story made the deliberately
  type-incompatible `string-sink` entry render (a real `<button
  data-testid="edge-drop-menu-item-string-sink">` appeared in the DOM),
  failing the "ABSENT from the DOM" assertion with exactly that entry.
  Reverted; the story is green again.
- Breaking the flip branch (`side = fits ? "end" : "start"` → always
  `"end"`) in `placeEdgeDropMenu` and re-running `OpensNearViewportEdge`
  failed with `expected 'end' to be 'start'` — the measured anchor test
  going red at a viewport edge, exactly as the acceptance criteria
  predicted. Reverted; the story is green again.
