# Phase 4 · the multi-line lane, specified (2026-09-16)

Addendum to `PORT-EDGE-PLAN.md`, which sketched Phase 4 in eleven lines and
deferred the rest. This is that rest. It supersedes nothing in the parent
plan; where it contradicts the parent, the contradiction is called out
inline and the parent's line number cited, because two of the parent's
stated reasons turn out to be wrong for the right conclusion.

**Headline:** Phases 1-3 have landed — `apps/storybook-basics/src/components/`
now holds `port.tsx`, `labeledPort.tsx`, `portEdge.tsx`, `portEdge.layout.ts`
and a full `codeEditor.tsx` (the sibling lane's CodeField port, with
`multiline` and `lineHeightPx` live and asserted). What is left for Phase 4
is **three files and one measurement**: a ported `portLane.ts` (~70 lines,
pure, unit-testable), an `editing` binding on `PortEdge` (~120 lines), and a
`MultiLineEditing` story. The single hard part is not the reconcile and not
the CodeEditor — both are solved problems being copied. It is that **nothing
in this repo knows the port pitch**, because the lane's pitch is the distance
between two rendered dots and the core is barred from measuring itself. That
decision (D8) is the one that has to be made before any of this compiles.

Line numbers into `apps/storybook-basics/` are against the 2026-09-16 12:44
snapshot; three agents are writing there and they will drift. Everything
cited in `packages/bbox-ui/` and `/home/bam/systemsketch/` is committed and
stable.

---

### 1 · Exists versus net-new — the estimate, bluntly

| Piece | State | Where | Work left |
|---|---|---|---|
| Multi-line CodeMirror field | **Shipped in this app.** `CodeEditor` with `multiline`, `lineHeightPx` (pins `.cm-line` `lineHeight` AND `height`), `align`, `autoFocus`/`cursorAt`/`selectRange`, `onEnter`/`onEscape`, `onViewReady`, a `CodeEditorHandle.setCaret(offset)`, live write policy, document-capture outside-pointerdown, unmount commit. | `codeEditor.tsx:85-142,160-190,220-221,265-296,371,405-432` | **None.** Consume it. |
| IDE hotkeys | **Shipped.** `Ctrl-ArrowUp/Down` → `moveLineUp`/`moveLineDown`, `Ctrl-Shift-Arrow` → `copyLineUp`/`copyLineDown` (`:288-293`), plus `defaultKeymap` carrying the Alt forms, plus `historyKeymap` + `history()`. | `codeEditor.tsx:33-50,288-296` | **None.** |
| Enter mints a line | **Shipped and unshadowed.** `:273-278` returns `false` for a bare Enter when `multiline`, letting `insertNewlineAndIndent` run. Critically, this port **dropped `grammar` and the completion popup entirely** — in `packages/bbox-ui/src/codeField.tsx:353` a live completion popup is tested *before* the multiline branch, so there Enter accepts a completion instead of inserting a line. That trap does not exist here, and must not be re-introduced (see §9). | `codeEditor.tsx:18-29,273-278` | **None.** |
| `PortEdge` with `items`/`onItemsChange` | **Shipped.** Controlled item list, `distribution`, `mode` + `freeOffsets`, `groups` + `groupMode`, `showPorts`, `showContainer`/`showCenterLine`, `size`, `renderItem`, `PortEdgeDndProvider` scope detection. | `portEdge.tsx:77-141,315-395` | **None.** |
| Lines→ports identity (`reconcilePortLane`) | **Does not exist in bbox-ui in any form.** Donor is `systemsketch/src/blocks/portLane.ts:102-176`, entangled with `BlockShapeProps`: six imports from `blockModel`, plus `canonicalizeInputPortLinks`, `normalizeBlockPortRows`, `reconcileEffectPorts`, `portInHeader`, `isEffectPort`, `withBlockPortSection`, `parsePortSignature`, and an `in_N`/`out_N` id scheme. **All seven concerns are dropped** — bbox-ui has no header ports, no effect ports, no rows/branches, no link groups and (per the parent plan, `:338-340`) no signature grammar. | net-new | **~70 lines.** `commonLines` (LCS, 25 lines) + the two-tier match (16) + a build loop (20) + `formatPortLane` (1). |
| The port record itself | **Already there, and it is enough.** `PortEdgeItem {id, label, state?}` is exactly the `{id, label}` the reconcile needs; `id` is the identity, `label` IS the line. The donor's `{name, type, defaultValue}` triple has no counterpart and needs none. | `portEdge.tsx:77-81` | **None.** The parent plan's worry that "there is no port record" is stale. |
| Id minter | Donor's `nextLaneId` reads `^in_(\d+)$`/`^out_(\d+)$` off every port on the side. bbox-ui item ids are free-form story strings. | net-new | **~8 lines**, host-owned (D9). |
| Pitch provenance | **Nothing knows it.** `PORT_ROW_PITCH_PX = 44` and `portRowCentre()` exist in `packages/bbox-ui/src/port.layout.ts:50-63` and are exported from the index — with **zero call sites anywhere**, and the reset copy at `apps/storybook-basics/src/components/port.layout.ts` dropped them. The real pitch is label-height-driven, not constant. | `port.layout.ts:50-63` | **The decision, D8.** ~20 lines of `ResizeObserver` either way. |
| `editing` binding | net-new | — | **~120 lines**, one file. |
| Unit tests for the reconcile | net-new; donor's `portLane.test.ts` is 90 lines and does **not** cover the cases §2 says matter | `systemsketch/src/blocks/portLane.test.ts` | **~15 cases.** |

**Estimate:** one lane-day for the reconcile + tests, one for the binding and
the pitch measurement, one for the story and its measured play functions.
Nothing here is research; the only unknown is D8.

**Two donor hygiene traps.** (a) There is a *second* `reconcilePortLane` at
`systemsketch/src/blocks/babble/portTextShared.ts:186` with a completely
different contract (exact-name match, then ordinal fallback) — a babble
prototype with zero importers outside `src/blocks/babble/`. Porting the wrong
namesake silently changes the identity contract. The shipped one is
`portLane.ts:102`, imported at `BlockInlineEditor.tsx:15`. (b) `portInLane`
(`portLane.ts:47-49`) has no consumers at all, not even a test. Do not port
it.

---

### 2 · The identity contract — which port survives which edit

Three tiers, evaluated in this order. Stated precisely enough that every row
in the table below is a unit test.

1. **LCS over the two line lists, byte-identical only.** `commonLines(before,
   after)` (`portLane.ts:62-86`) is a standard DP + forward optimal backtrack
   keyed on strict string equality. A line that appears in the common
   subsequence keeps **the same item object**, by reference. Tie-break is
   `table[i+1][j] >= table[i][j+1]`, which is what makes a two-line swap
   resolve the way a human expects.
2. **The leftovers on each side are zipped positionally.** `spareBefore` and
   `spareAfter` are the ascending index lists of unmatched lines;
   `keep.set(spareAfter[k], spareBefore[k])` for `k < min(len, len)`
   (`portLane.ts:123-127`). Pairing is by **rank among leftovers**, not by
   content. This is what makes an in-place rename keep its id — the common
   case, and the donor documents it in the comment directly above, at
   `portLane.ts:120-122`.
3. **Anything still unmatched mints a fresh id.** The `taken` set **grows
   during the loop** (`portLane.ts:153`), so two new lines in one edit get
   two consecutive ids, not the same one twice. Getting this wrong is the
   single easiest bug to write here.

Two edge behaviours from the donor, both deliberate and both tested there,
both of which must port:

- `text === ""` short-circuits to zero lines (`portLane.ts:105-107`) — select
  all + Delete empties the lane.
- A trailing `\n` is **not** trimmed, so `"a\n".split("\n") === ["a", ""]`
  produces a real port with an empty label. That is not a bug; **Enter is how
  you add a port**, and the blank line is the new port before you type into
  it (`portLane.test.ts:48-54`).

| Edit (one reconcile call) | Result | Tier | Test it |
|---|---|---|---|
| Type a character into line 1 of 3 | line 1 keeps its id; lines 0, 2 keep theirs by reference | 1 + 2 | `["a","b","c"] → ["a","bX","c"]` ⇒ `[id1,id2,id3]` |
| Rename two lines at once | both keep their ids | 2 | `["a","b","c"] → ["a2","b2","c"]` ⇒ `[id1,id2,id3]` |
| Alt+↓ on line 0 (adjacent swap) | ids travel with the lines | 1 | `["a","b"] → ["b","a"]` ⇒ `[id2,id1]` |
| Three-line rotate | ids travel | 1 | `["a","b","c"] → ["c","a","b"]` ⇒ `[id3,id1,id2]` |
| Enter at the end | new port, fresh id, appended | 3 | `["a"] → ["a",""]` ⇒ `[id1,NEW]` |
| Enter twice in one transaction | **two distinct** new ids | 3 | `["a"] → ["a","",""]` ⇒ `[id1,NEW1,NEW2]` |
| Delete line 1 of 3 | lines 0, 2 keep ids; id2 is gone | 1 | `["a","b","c"] → ["a","c"]` ⇒ `[id1,id3]` |
| Delete line 0 **and** rename line 1, in one transaction | ⚠️ the renamed line inherits the **deleted** line's id; the renamed line's own id is destroyed | 2 | `["pose","frame","gain"] → ["frames","gain"]` ⇒ `[id1,id3]` |
| Reverse four lines in one transaction | ⚠️ three of four ids land on the wrong line | 2 | `["a","b","c","d"] → ["d","c","b","a"]` ⇒ `[id4,id1,id2,id3]` |
| Select-all + paste a whole new lane | ids reused positionally, surplus dropped / deficit minted | 2 + 3 | `["pose","frame","gain"] → ["a","b"]` ⇒ `[id1,id2]` |
| Three identical lines, delete any one | the id that dies is always the **last** identical line | 1 | `["x","x","x"] → ["x","x"]` ⇒ `[id1,id2]` |
| Insert a fourth identical line anywhere | the **bottom** line is the new port | 1 + 3 | `["x","x"] → ["x","x","x"]` ⇒ `[id1,id2,NEW]` |
| Select all + Delete | empty lane, zero items | — | `["a","b"] → ""` ⇒ `[]` |

**The two ⚠️ rows are the contract, not bugs to fix.** Tier 2 is index-based,
so it is wrong exactly when both spare lists are non-trivial *and* their
positional order contradicts intent. It is **correct** for many multi-line
batches (rows 2, 4 and 7 above are all multi-line and all right); the claim
"any multi-line edit swaps identities" is false and should not be written
into a comment. Nor is this behaviour undocumented in the donor — it is
stated at `portLane.ts:120-122` and again at `:13-15`.

**Why it almost never bites in practice, and where it does.** The write
policy is live: `onWrite` fires once per doc-changing transaction
(`codeEditor.tsx:311-317`), so ordinary typing reconciles one keystroke at a
time and never presents a two-line delta. Select-all-then-type collapses the
lane to *one* line on the first keystroke (killing the other ports outright)
and mints fresh ids on each subsequent Enter — so a human retype does not hit
the positional-reuse path at all. The paths that **do** deliver a multi-line
delta in a single transaction are: **paste over a selection**, **Ctrl+Z /
Ctrl+Y** (CodeMirror's own `history()` groups a gesture into one undo step),
**Alt+↑/↓ on a multi-line selection**, and any programmatic `value` set —
i.e. exactly what a Storybook play function does. Test those four
deliberately; the donor's own 629-line acceptance journey covers none of
them.

**Purity.** The donor is pure — `lanePorts` filters into a new array, matched
ports are pushed **by reference**, edits go through `{...port}` first, and it
returns the *same* props object on a no-op. Keep all of that: the port must
return the same `items` array identity when the text already spells the lane,
or `onItemsChange` will re-render the edge on every keystroke. It is **not**
referentially idempotent in the donor only because `formatPortSignature`
re-canonicalises spacing; with `label` as the raw line (D10) that failure
mode disappears and the port becomes genuinely idempotent.

**The one real corruption risk, and it is not a paste.** `value =
items.map(l => l.label).join("\n")` and `text.split("\n")` are not escaped. A
keyboard user cannot produce a `\n` inside a label — in multiline the newline
stays a real line break and becomes a separate port, and in the single-line
label field both `EditorView.inputHandler` and `singleLineGuard` strip it.
But **story code or an import can**, and then one item silently becomes two
ports on the next open. systemsketch carries the identical exposure. Guard it
at the reconcile boundary: reject or `\n`→`␊` any label containing a newline,
with a `WHY:` naming the join/split round trip.

---

### 3 · The geometry contract — what must pin to what

The promise is *line i's text sits on port i's row*. That decomposes into
exactly three numbers, and the parent plan named only one of them.

**(a) Pitch.** `lineHeightPx` emits one `EditorView.theme` rule —
`.cm-line { lineHeight: Npx; height: Npx }` (`codeEditor.tsx:220-221`) — for
**every** line. So the lane requires a *uniform* pitch, and the pitch must
equal the distance between consecutive rendered dot centres.

**It cannot be computed in this repo.** The card is
`[data-slot="port-edge-card"]` → a `flex column` → `[data-slot="port-edge-member"]`
→ `LabeledPort`, whose main-axis extent is **label-driven** (the parent plan
dropped `anchored`, `PORT-EDGE-PLAN.md:63`, so the card root is the flex
pairing, not `diameterPx`). Distribution then spaces cards by
`justify-content` (`portEdge.layout.ts:122-126`) with the browser doing the
arithmetic. systemsketch solves this by **measuring** — `pitch = placed[1].y -
placed[0].y`, with `PORT_LANE_DEFAULT_PITCH_PX = 44` when fewer than two
ports are placed (`inlineBlockEditing.ts:180,198`). bbox-ui's core may not
measure itself (CLAUDE.md's one rule), but `apps/storybook-basics` is an app,
not the core. See D8.

**(b) Origin.** `laneTop = firstDotCentreY - pitch/2 - frameInset`, where
`frameInset` is the CodeEditor frame's own top border + padding. Today that
is **5px**: `.bbox-code-editor { box-sizing: border-box; padding: 4px 6px;
border: 1px solid }` (`codeEditor.css:18-20`). This term is not optional and
it is not cosmetic — **systemsketch omits it and its lane text sits ~2px
below every dot**, because `.BlockNode-inlineEditor` carries a 2px accent
border that the lane rule overrides the padding of but never the border
(`block-canvas.css:81-90,149-155`). No test there compares a line centre to a
dot centre, so nobody noticed. Do not inherit the defect: either subtract the
inset or zero it in the lane's own class, and assert it (§7).

**(c) Overflow.** `.bbox-code-editor` and `.cm-scroller` are both
`overflow: hidden` (`codeEditor.css:25,59-60`). A lane taller than its frame
clips with no scrollbar. systemsketch sets both to `visible` plus
`width: max-content` (`block-canvas.css:149-166`); do the same via the lane's
`className`. The CodeEditor exposes an `overflow` prop but its values govern
`.cm-scroller`, not the frame — hence D11's "settable from outside" clause.

**What must NOT be on:** `wrap`. Soft-wrap lets one logical line occupy
several visual rows while `lineHeightPx` pins `.cm-line` to one pitch — every
port below a wrapped line desynchronises. `align: "left"` for both sides:
systemsketch explicitly declined right-alignment for its outputs lane ("a
right-aligned editor feels reverse") and parks the lane outside the right
edge left-aligned instead (`inlineBlockEditing.ts:200-215`).

**Correction to the parent plan.** `PORT-EDGE-PLAN.md:198-200` declines
`custom` mode on the ground that "CodeMirror cannot vary per-line height that
way." That justification is false — `Decoration.line` accepts
`spec.attributes`, so an inline per-line `style` beats the theme and
CodeMirror re-measures through its height oracle. It is nonetheless
*unreachable here*, because the landed `CodeEditor` exposes only
`language?: LanguageSupport` (`codeEditor.tsx:91`), not the raw `Extension`
slot `packages/bbox-ui`'s `CodeFieldGrammar.language` has. Decline `custom`
for the reasons in §5 (order is ill-defined, not pitch), and drop the wrong
technical reason from the record.

---

### 4 · The CodeEditor prop contract Phase 4 binds to

Held against `apps/storybook-basics/src/components/codeEditor.tsx` as it
stands. **Everything in the first block already exists** — this is a list the
sibling lane can be held to if it refactors, not a list of asks.

| Need | Prop / member | Present? | Why it is load-bearing |
|---|---|---|---|
| Lane text in | `value: string` | ✅ `:84` | — |
| Live write out | `onWrite(value)` | ✅ `:85` | one call per doc-changing transaction; the reconcile runs here |
| One undo step per gesture | `beginEdit?()` | ✅ `:87` | lazily on the first real change |
| Commit boundary | `onEditEnd?(value, startValue)` | ✅ `:89` | fires on blur, Enter/Escape, outside-pointerdown **and unmount** (`:432`) — the unmount path is why tearing the lane down mid-edit is content-lossless |
| Lane dialect | `multiline: boolean` | ✅ `:98` | must relax **all three** switches — keydown branch, transaction guard, and input handler. A CodeEditor that only relaxes the keydown branch will still have pasted newlines eaten by the filter |
| Row pinning | `lineHeightPx: number` | ✅ `:114` | must pin **both** `lineHeight` and `height` (`:220-221`) |
| Side | `align: "left" \| "right"` | ✅ `:115` | lane uses `left` on both sides (§3) |
| Click-to-caret | `autoFocus`, `cursorAt`, `selectRange` | ✅ `:125-129` | opening the lane from a click on port *i* puts the caret on line *i* |
| Imperative re-caret | `CodeEditorHandle.setCaret(offset)` | ✅ `:141-142` | must dispatch `scrollIntoView`, not just a selection; used when the host moves the caret without remounting |
| Host-owned exits | `onEnter?()`, `onEscape?()` | ✅ `:136-137` | the component stops both natively; Escape must **not** revert — every keystroke already wrote |
| Raw view | `onViewReady?(view)` | ✅ `:138` | the only handle on the live `EditorView` |
| Frame overrides | `className`, `style` | ✅ `:121-123` | zeroing `padding`/`border`/`overflow` per §3 |

| Genuinely missing | Ask | Fallback if declined |
|---|---|---|
| **Caret-line observation** | `onCaretLine?(line: number)`, or widen `language` to `Extension` so an `updateListener` can be smuggled in | Poll `view.state.selection.main.head` from an `onViewReady`-captured view on every `onWrite`. Works; misses pure cursor moves. **Only needed for the "highlight the port under the caret" nicety, not for the core lane** — defer it rather than block on it. |
| **`extensions?: Extension[]`** | the escape hatch systemsketch's own CodeField has (`BlockInlineEditor.tsx:419` passes `extensions={laneExtensions}`) and this one does not | Nothing in Phase 4's acceptance list needs it. Ask for it; do not gate on it. |

**Explicitly not needed, do not ask for:** `grammar`/completion (the parent
plan already excludes the signature grammar, `:338-340` — and its absence is
what keeps bare Enter minting ports, §1), `mode`/rendered rows (`lineHeightPx`
is not forwarded to `CodeFieldRows` in the upstream field and the rows branch
has a hard-coded 1.6 line-height — a lane that flips to rendered mode loses
alignment silently), `wrap`, `lineNumbers`, `columns`, `trailing`. The
absence of `trailing` is load-bearing in a way worth stating: it means a port
card can never be a DOM descendant of the field host, which is what closes
the focus hazard in §5.

---

### 5 · Mode matrix

`PortEdge`'s state space is nine axes, not the three the brief named. The
lane's enablement depends on four of them.

| Axis | Value | Lane? | Why |
|---|---|---|---|
| `edge` | `left`, `right` | ✅ | a CodeMirror document's lines stack vertically; a vertical edge is the only one a vertical stack can pin to |
| | `top`, `bottom` | ❌ | the line↔port **bijection survives** in a row edge (line *i* ↔ port *i* is still well defined) — what is impossible is the **geometry**. Say that in the disable reason ("a lane needs a vertical edge"), not "no bijection". systemsketch reaches the same rule mechanically, filtering placements to `edge === 'left' \|\| 'right'` (`inlineBlockEditing.ts:194-198`) |
| `mode` | `auto` | ✅ | `order` is truth; line order is port order |
| | `custom` | ❌ | in the landed component, custom mode drops `SortableContext` for free `useDraggable` offsets (`portEdge.tsx:363-375`) and a drop writes only `freeOffsets` — visual order and `items` order diverge arbitrarily, so line order would be **meaningless**, not merely mis-pitched. (`packages/bbox-ui/src/portPlacement.ts:197-212`'s `laneOrder` sorts by `t` and would keep a defined order; the app does not use that model. The parent plan's stated reason — non-uniform pitch — is the smaller half.) |
| `distribution` | `{mode:"aligned", anchor:"start"}` | ✅ **preferred** | constant pitch = card height + `gap`, independent of count; the first card does not move when a port is added. The only distribution stable under Enter |
| | `{mode:"aligned", anchor:"end"}` | ⚠️ allowed | constant pitch, but the pack grows **upward**: every existing port shifts one pitch per Enter, so the lane must re-derive its origin each frame |
| | `{mode:"distribute", …}` | ⚠️ allowed | pitch is a function of count *and* track height (`mainAxisPositions`, `portEdge.layout.ts:87-109`) — pressing Enter re-pitches every existing line in the same frame as the new character, so the text visibly jumps under the caret. Correct, but ugly; the story defaults to aligned/start for this reason |
| `groupMode` | `off` | ✅ | one slot per port |
| | `grouped` | ❌ **when any group has ≥2 members** | The landed component conflates grouped with collapsed for slotting — `clustered = groupMode !== "off"` (`portEdge.tsx:338`) — so a grouped family becomes **one slot** holding N members, rendered in a nested `flexDirection:"column", gap:4` (`:240-241`). The ports do **not** collapse onto one y (they still stack), so it *looks* fine — but the intra-group pitch is `cardHeight + 4` while the inter-slot pitch is the distribution pitch. **Two pitches, one `lineHeightPx`.** Lines drift progressively with no error |
| | `collapsed` | ❌ **when any group has ≥2 members** | a `×3` chip is one row for three ports; no bijection. Zach pre-conceded this |
| `showPorts` | `false` | ✅ but see D12 | bijection intact, but `SlotBody` renders a bare label span instead of a `LabeledPort` (`portEdge.tsx:255-259`) — there is no dot. Hiding the label then leaves an empty box: text floating over nothing |
| `showContainer` / `showCenterLine` / `size` | any | ✅ | dev guides; no effect on pitch or order |

**The predicate is over the computed slots, never over the flag.**

```ts
const laneable =
  AXIS_FOR_EDGE[edge] === "column" &&
  mode === "auto" &&
  slots.every(s => s.members.length === 1);
```

That one test is honest in both directions: it blocks `grouped` and
`collapsed` when a real family exists (both break pitch, for different
reasons), and it **allows** either when the groups text names no family with
two members — which the flag test would over-block, since `computeSlots`
already returns singletons in that case (`portEdge.layout.ts:186-204`).

**Mid-edit mode switch — handled, not hand-waved.**

The one option that must be ruled out is a silent no-op: leaving the lane
mounted in a mode it cannot express. The asymmetry that makes this dangerous
is real — `lineHeightPx` is reconfigured **live** through a compartment on
every change (`codeEditor.tsx:397`), while the document is **frozen** while
the field has focus (`:371`, `if (gesture.isEditing && view.hasFocus)
return`). So the geometry keeps re-pinning to whatever pitch the host passes
while the content stops tracking reality: lines drift off their dots
progressively, with no error, no warning and no exception. Invisible drift is
a worse failure than a disabled control.

So: **close the lane, do not block the control.** The mode intent is
explicit; the open editor is incidental. Closing is provably content-lossless
— live write policy means every keystroke is already in `items`, and there is
an explicit unmount commit (`codeEditor.tsx:432`) precisely because no `blur`
fires for a focused element removed from the DOM. What *is* lost, and should
be said in the `WHY:`: the CodeMirror undo stack (the mount cleanup destroys
the view), the caret, and an in-flight IME composition that never reached
`docChanged`. Close through the **same explicit exit path Ctrl+Enter uses**,
so it is one announced transition and the single-line labels return in the
same frame — never by letting a render condition go false.

When the lane is not available, **disable the enable control with a stated
reason** ("a lane needs a vertical edge", "ungroup to edit as lines") — never
hide it. These are all togglable args the user can flip back; hiding makes a
present feature look absent, and a silent no-op violates truthful rendering
outright.

**Drag and the lane are exclusive, structurally — and it is not luck.** A
document **capture-phase** `pointerdown` listener runs before any card's
handler and before focus moves; while `view.hasFocus` is still true it calls
`leave(view)` → blur + `gesture.commit()`, which sets `editing = false`
(`codeEditor.tsx:410-420`). So the freeze's first conjunct is already false by
the time any reorder write lands, and the store holds every keystroke. Two
things follow that are easy to get wrong:

- Do **not** "fix" this with `useSortable({ disabled: true })`. dnd-kit nulls
  only `listeners` when disabled; `attributes` — including `role:"button"`
  and `tabIndex: 0` — is still returned and still spread onto the card, so
  nothing about focus changes. And it never reaches custom mode's
  `useDraggable` at all.
- Do **not** claim "nothing is lost, Alt+↑/↓ replaces drag". Moving a line
  *with its port id* is a property of the reconcile (§2 tier 1), not of the
  keymap. Until `portLane.ts` lands, disabling reorder during editing removes
  reordering rather than replacing it.

The one arrangement that would re-arm the freeze bug is a port card rendered
**inside** the field host, because the capture listener early-returns on
`host.contains(event.target)` (`codeEditor.tsx:414`). The CodeEditor exposes
no `trailing` slot, so that arrangement is currently unbuildable. Keep it
that way; if `trailing` is ever added, this is the note that explains why the
lane must not use it.

**Edge parking is a tenth axis, and it is *not* a Phase 4 hazard — yet.**
`packages/bbox-ui/src/portPlacement.ts:177-193`'s `drawnEdge` walks clockwise
to the nearest live edge when an edge is toggled off, so turning off *any*
edge re-homes its ports onto another one. That would change an open lane's
port set without a text edit, and the freeze would then delete those ports on
the next keystroke. But the landed `PortEdge` takes a per-edge `items` array
and knows nothing of `Placements`/`Arrangement` — the parent plan
deliberately keeps that model out of the stories (`PORT-EDGE-PLAN.md:344`).
Record it as the first thing to handle when a real `Block` adopts this model:
**the lane must close on any change to the arrangement's live-edge set.**

---

### 6 · Stock parts, element by element

| Element | Today | Off-the-shelf part (exact name) | Behaviour that must survive |
|---|---|---|---|
| Line move / duplicate | systemsketch lane keymap | `moveLineUp`, `moveLineDown`, `copyLineUp`, `copyLineDown` (`@codemirror/commands`) | Alt+↑/↓ **and** the Ctrl forms for window managers that eat Alt; the moved line carries its port id (which is §2 tier 1's job, not the command's) |
| Undo / redo inside the lane | systemsketch lane | `history`, `historyKeymap` (`@codemirror/commands`) | one undo step per gesture, not per character — and a multi-line undo delta must survive §2's tier-2 table, which is why it is tested there |
| Enter = new port | systemsketch lane | `insertNewlineAndIndent` via `defaultKeymap` (`@codemirror/commands`) | reached only because the keydown handler returns `false` for a bare Enter in multiline; a completion popup would shadow it |
| Line↔row pinning | systemsketch `lineHeightPx={placement.linePitch}` | `EditorView.theme` (`@codemirror/view`), already wrapped as `CodeEditor`'s `lineHeightPx` | pins **both** `lineHeight` and `height`; uniform across every line by construction |
| Typed/pasted newline policy | systemsketch `CodeField` | `EditorView.inputHandler` + `EditorState.transactionFilter` (`@codemirror/state`) via the app's own `singleLineGuard` | multiline relaxes all three switches; the single-line label field still strips `\n` even from a programmatic `externalSync` write |
| Echo suppression | systemsketch `CodeField` | `Annotation.define` (`@codemirror/state`) via the app's `externalSync` | a host writing `value` back never reads it out as if typed; must be re-applied by name when a transaction is rebuilt |
| Caret offset from line/column | net-new here | `lineStartOffset` (`packages/bbox-ui/src/caretGeometry.ts:9-14`) | already exists and is unit-tested — **do not re-derive it**; click port *i* → caret on line *i* |
| Reorder within the edge | landed `SortableSlotCard` | `useSortable`, `SortableContext`, `arrayMove`, `verticalListSortingStrategy` (`@dnd-kit/sortable`) | drag and lane are exclusive; the capture-phase pointerdown, not a `disabled` flag, is what enforces it |
| Even spacing / pitch | landed `distributionStyle` | CSS `justify-content` + `gap` (browser) | `aligned` gives the only count-independent pitch; the lane measures, never assumes |
| Pitch observation | net-new | `ResizeObserver` (browser) | app-level only — the core stays props-in/DOM-out |
| Lines→ports identity | systemsketch `reconcilePortLane` | ported donor algorithm (LCS) — **not a package** | §2's whole table |
| Story assertions | `Bar.stories.tsx` / `PortEdge.stories.tsx` pattern | `expect` from `storybook/test`, play functions, `getBoundingClientRect` | spatial claims are measured, never asserted by DOM presence |
| `CodeEditor` itself | `apps/storybook-basics/src/components/codeEditor.tsx` | **unchanged (stock seam)** — consumed as-is, extended only by the two asks in §4 | the sibling lane owns that file; Phase 4 adds no props to it unilaterally |
| `PortEdge` slotting, grouping, distribution, dnd | `apps/storybook-basics/src/components/portEdge.tsx`, `portEdge.layout.ts` | **unchanged (stock seam)** — Phase 4 adds one `editing` binding and reads `slots`; it does not restructure them | Phase 3's landed behaviour is not renegotiated by Phase 4 |
| `Port`, `LabeledPort`, `port.layout.ts` | landed Phase 1-2 | **unchanged (stock seam)** | the lane hides the label slot with `labelSlot={null}` — an existing seam (`packages/bbox-ui/src/port.tsx:1032-1043` tests `!== undefined`, deliberately not `??`), so the dot, slot geometry and lift all survive with nothing inside. **No new prop needed** |
| `packages/bbox-ui`, `demos/dndkit-lab`, `claude/dndkit-lab`, `apps/storybook`, all of systemsketch | — | **unchanged (stock seam)** | the donor stays the reference; nothing here edits it |

---

### 7 · Acceptance — measured in a browser, not asserted in the DOM

Zach's bar: a play function that asserts an element exists proves nothing
about where it is. Every spatial claim below reads boxes.

Helpers each story defines once:

```ts
const centreY = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
const dots  = () => [...canvas.querySelectorAll('[data-slot="port-dot"]')];
const lines = () => [...canvas.querySelectorAll('.cm-line')];
```

| # | Claim | Assertion |
|---|---|---|
| A1 | **Every line sits on its dot.** | `dots().length === lines().length`, and for every *i*, `Math.abs(centreY(lines()[i]) - centreY(dots()[i])) <= 1`. This is the assertion systemsketch never wrote, and the reason its lane is ~2px low |
| A2 | **Pitch is uniform and equals the port pitch.** | consecutive `centreY(dots())` deltas all within 1px of each other, and within 1px of consecutive `centreY(lines())` deltas |
| A3 | **Nothing clips.** | `lines().length === items.length` and the last line's `bottom` is inside the lane frame's `bottom` — catches the `overflow: hidden` trap (§3c) directly |
| A4 | **Enter makes a port at the new row.** | count dots → `userEvent.keyboard("{Enter}")` → dots + 1; the new dot's `centreY` is within 1px of the new line's; re-run A1 |
| A5 | **Alt+↓ moves the port, with its identity.** | give item 0 `state: "wired"`, item 1 `state: "empty"`; caret on line 0; `{Alt>}{ArrowDown}{/Alt}` → the dot at row 1 now has `[data-state="wired"]` and its `centreY` moved down by exactly one pitch (±1px). **Colour proves the id travelled**; position proves the geometry followed |
| A6 | **An in-place rename keeps the port.** | wired port on line 1; type a character into line 1 → still wired, still row 1, `onItemsChange`'s item 1 keeps its original `id` |
| A7 | **Select-all + Delete empties the edge.** | `dots().length === 0`, `onItemsChange` last called with `[]` |
| A8 | **Closing restores the labels, edited.** | Ctrl+Enter → `.cm-editor` gone, `[data-slot="port-label"]` count back to *N*, and the *i*-th label's text equals the *i*-th line's former text |
| A9 | **The single-line fields are absent while the lane is open, not transparent.** | `canvas.queryAllByTestId(/port-label/).length === 0` while editing (the existing `labelSlot={null}` seam renders the positioned span with nothing inside, so also assert the dot count is unchanged) |
| A10 | **The enable control is disabled, with a reason, in every non-laneable mode.** | one loop over `{edge:"top"}`, `{mode:"custom"}`, `{groupMode:"collapsed", groups:"a, b"}`, `{groupMode:"grouped", groups:"a, b"}` → control has `disabled` and a non-empty `title`. The fourth case is the one §5 adds |
| A11 | **A grouped set with no real family stays enabled.** | `{groupMode:"grouped", groups:"zzz"}` (an id nobody has) → control enabled, A1 still passes. Proves the predicate is over slots, not the flag |
| A12 | **A mid-edit mode switch closes the lane and loses nothing.** | open lane, type a character, flip `mode` to `custom` → `.cm-editor` gone, the mode control **accepted** the change, and the typed character is present in the rendered label |
| A13 | **The four multi-line-delta paths behave as §2 says.** | unit tests on the pure reconcile, not the story: paste-over-selection, undo replay, multi-line Alt+↓, programmatic `value` set. Each of the ⚠️ rows is asserted as the **current** contract, so a future change to tier 2 fails loudly rather than silently re-pointing cables |

A1-A3 are the ones that cannot be faked, and they are the ones that catch the
two defects this repo would otherwise inherit from the donor (the frame inset
and the two-pitch grouped case). If only three land, land those.

---

### 8 · Open decisions — each with the reversible default taken on silence

- **D8 · Pitch provenance: measure in the app, with a prop override.**
  `useLayoutEffect` + `ResizeObserver` over `[data-slot="port-dot"]` inside
  the edge, `pitch = centreY(dot[1]) - centreY(dot[0])`, falling back to
  `PORT_ROW_PITCH_PX` (44) below two dots — exactly systemsketch's shape, and
  legal because this is an app. Also accept `linePitchPx?: number` on the
  story args so a play function can pin a known pitch and assert against it
  without racing the observer. The alternative (compute it closed-form from
  `mainAxisPositions` + a constant card height) is a lie the moment a label
  wraps or a font loads. **Default: measure, with the override prop.**
- **D9 · Id minting is host-owned, and ids are opaque.** The donor's
  `in_N`/`out_N` scheme exists because systemsketch ids encode side. Here the
  reconcile takes a `mintId: () => string` and the story passes a counter
  (`p7`, `p8`, …). Keeps `portLane.ts` pure and side-agnostic, and means two
  edges in one story cannot collide. **Default: injected minter.**
- **D10 · `label` is the raw line, with no grammar and no canonicalisation.**
  The donor re-parses an edited line through `parsePortSignature` and
  re-derives `value` through `formatPortSignature`, so typing `a:B` stores
  `a: B` — and because the value-sync effect is frozen during the gesture
  (`codeEditor.tsx:371`), the document and the store then silently diverge
  until blur. The donor's own protection (never re-parse a line that still
  reads exactly as the port was spelled, `portLane.ts:138-145`) exists for a
  different problem and would not cover this. With `label === line` the
  round trip is exact by construction and the whole class of bug is gone.
  **Default: raw line; no grammar (matching `PORT-EDGE-PLAN.md:338-340`).**
- **D11 · Frame geometry is overridden from the lane's own class, not by new
  props.** `.port-edge-lane { padding: 0 6px; border: 0; overflow: visible;
  width: max-content }` passed via `className`, with a `WHY:` naming the
  +5px inset it cancels. Asking the sibling lane for `padding`/`border` props
  would be re-deriving CSS in TypeScript. **Default: className override, and
  A1 is what proves it worked.**
- **D12 · With `showPorts` off, the lane stays enabled but the labels stay
  visible.** There is no dot to align to, so hiding the single-line labels
  would leave text over nothing. Not a correctness break, so it does not
  belong in the disable predicate — but the *label-hiding* half of "the lane
  IS the labels" is conditioned on there being a dot. The alternative is to
  force `showPorts` on for the lane's duration, which overrides an explicit
  user toggle. **Default: lane enabled, labels not hidden, no forcing.**
- **D13 · The lane closes on drag start, rather than the sortable being
  disabled.** §5 explains why `disabled: true` does not do what it looks
  like. A `onDragStart` → close is one line, covers custom mode's
  `useDraggable` too, and makes the exclusivity legible instead of
  emergent. **Default: close on drag start.**
- **D14 · Caret-line highlight is deferred, not designed around.** It is the
  only thing that wants a caret observer, and the CodeEditor has no seam for
  one (§4). Ship Phase 4 without it; ask for `onCaretLine` and add it later.
  **Default: defer.**
- **D15 · One lane per edge, mounted by the story, not by `PortEdge`.**
  Symmetric with D6 (the four-edge arrangement is story-owned): `PortEdge`
  takes `editing?: boolean` and `onEditingChange?`, and the story owns which
  edge is open. Two lanes open at once is not forbidden by anything here, but
  no story does it. **Default: `editing` is a controlled prop; the story
  owns it.**

---

### 9 · What Phase 4 deliberately does not do

- **No grammar, no completion popup, no diagnostics.** Beyond the parent
  plan's cost argument, there is now a mechanical reason: with a completion
  source mounted, CodeMirror's `completionKeymap` binds Enter at
  `Prec.highest` and `acceptCompletion` runs *before* the multiline newline —
  so a bare Enter with the popup open would stop minting ports. If the lane
  ever gets autocomplete, that interaction has to be designed, not
  discovered.
- **No `row`-orientation lane, and no `custom`-mode lane.** Both are a
  different editor, not a flag (`PORT-EDGE-PLAN.md:320-323`, D5 — unchanged,
  with §3's corrected reasoning substituted for the CodeMirror claim).
- **No `Placements`/`Arrangement` model, so no edge parking.** Named in §5 as
  the first integration hazard, deliberately out of scope here.
- **No changes to `codeEditor.tsx` or `portEdge.tsx` beyond one `editing`
  binding.** Three agents are writing in that directory; Phase 4 adds files
  (`portLane.ts`, `portLane.test.ts`, the story) and makes one surgical,
  exact-match edit per existing file.
- **No `Block` integration and no persistence** — unchanged from the parent
  plan.
- **Nothing in `packages/bbox-ui`, `demos/`, `claude/dndkit-lab`,
  `apps/storybook` or systemsketch is touched.**
