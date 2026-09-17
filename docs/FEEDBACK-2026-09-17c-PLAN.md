# Feedback continued, 2026-09-17 night — twelve items, six lanes

Source: `zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md:1523` ("Feedback
continued"), with 21 screenshots. Everything below is settled; an implementing
lane types it and measures it, and reports a blocker rather than adjusting a
target it cannot hit.

**Lane split is by WRITE SET.** Lanes H and G touch files nothing else does and
run immediately. Every port-related lane shares `portEdge.tsx` /
`labeledPort.tsx` / `blockPort.tsx` with the still-running Block Layouts lane
(lane C of the previous round) and with each other, so they are sequenced, not
fanned out. That is a real contract overlap, not caution.

| Lane | Items | Owns | Runs |
|---|---|---|---|
| **H** | 8 · 10 · 11 | `TraceTidy.stories.tsx` `Trace.stories.tsx` `TraceBadge.stories.tsx` | now |
| **G** | 9 · 12 | `editableText.tsx` `editableText.layout.ts` `EditableText.stories.tsx` | now |
| **E** | 2 · 3 · 4 | `portEdge.layout.ts` `portEdge.tsx` `PortEdge.stories.tsx` | after C |
| **F** | 1 · 6 | `labeledPort.tsx` `port.layout.ts` `LabeledPort.stories.tsx` | after C |
| **D** | 5 | `blockPort.tsx` `blockPort.layout.ts` `BlockPort.stories.tsx` | after C |
| **I** | 7 | `portEdge.tsx` + the "Show dnd-kit card" rename everywhere | after E and F |

---

# Lane H — traces (runs now)

## H-8 · Delayed split on routings that are not a straight line

> "Showed how displayed split works on lines that are not just straight but also
> multi elbow edges, etc."

`Trace.stories.tsx`'s `DelayedSplit` demonstrates the split on a simple route.
Extend the gallery to cover every routing the kit has — `straight` (with and
without bends, now that a bent straight is a real polyline), `slanted`,
`curved`, `curved` with a control point, and `elbow` with several corners.

The split point is a fraction of arc length. On a multi-corner elbow that
fraction can land ON a corner, which is the case worth showing rather than
avoiding: include one specimen whose split lands within 2px of a vertex and
caption what happens.

## H-10 · Tidy — all sixteen direction pairs

> "Its a great start. but can you please show some harder cases. You need to
> test all possibilities.. there are 4 possible output directions and 4 possible
> input directions."

A 4×4 matrix: `from.dir` ∈ {top,right,bottom,left} × `to.dir` ∈ same. Sixteen
cells, each with its before/after and its own tidy result, in the gallery idiom
this repo already uses (`TraceTidy.stories.tsx`'s existing cards).

Cells that tidy cannot improve must be RENDERED AND LABELLED, never omitted —
the same rule `TracePolarity` follows. A missing cell reads as "handled"; a
labelled no-op reads as the truth.

## H-11 · Say what soft clearance is FOR

> "can you also better explain how the soft clearance works? with soft clearance
> off it seems more tidy with the even cadence? what is the purpose of that soft
> clearance?"

He is reading his own screenshot correctly: with soft clearance OFF the rails
land on an even 14px cadence (432/446/460/474/488) and look tidier. That is a
real observation and the story currently does not answer it.

Read `elbow/softClearance.ts` and `trace.tidy.ts`, then rewrite that story's
prose to state, concretely: what soft clearance optimises for, what it trades
away, and the case where OFF is visibly worse — and BUILD that case as a
specimen. If, having read the code, the honest answer is that soft clearance
does not earn its default in this scenario, **say so in the report**. A
capability that loses on its own demo is a finding, not something to caption
around.

---

# Lane G — EditableText (runs now)

## G-9 · The edges are clipped while typing

> "I don't like when I type the label how the edges of the EditableText it seems
> are being cut off"

His screenshot shows `(label)` with both end characters shaved by the field's
own box. This repo has already fixed exactly this class of bug once, in
`bar.tsx`: `overflow-clip` plus `[overflow-clip-margin:4px]`, because a focus
ring reaches 2px of outline plus 2px of offset. Read that seam before inventing
anything.

Diagnose it properly rather than padding until it looks right. Measure the text
node's `getBoundingClientRect()` against the field's own box while focused, and
assert the text is fully inside. It is also a **truthful rendering** violation
in this repo's terms — authored characters must not disappear — so the fix is
required, not cosmetic.

## G-12 · Placeholders, and a multi-line EditableText

> "I like the idea of maybe it hinting.. regardless just to have that option can
> you please show a story in the blocks of it kinda showing like the placeholders
> for the editable text. and then I can click it and type in what I really want
> it to be?"
>
> "Can you please also show an example of the multi line editable text? that is
> what is required for the description which is like multi line... Show this
> story in the editable text component and then integrate it later into a story
> inside the block."

Note his explicit sequencing: **the EditableText stories first, the Block
integration later.** This lane does the first half only and must not touch
`Block.stories.tsx` — another lane owns it right now.

- `EditableText.stories.tsx` already has a `Placeholder` story. Extend it to the
  shape he described: a Title/Type pair (and a Title/Description/Type triple for
  the simple view) showing placeholder text, clickable straight into editing.
- **Multiline** — a new `Multiline` story. He is right that "it works just like
  a normal text box": wrapping, growing height, Enter inserting a newline rather
  than committing. Check whether `editableText.tsx` already supports a multiline
  mode; if it does not, add one, mirroring `CodeEditor`'s existing `multiline`
  prop semantics (Enter inserts; Ctrl/Cmd+Enter is the exit) so the two
  components do not disagree about what Enter means.
- Do not reinvent wrapping. A `<textarea>` or a contenteditable already wraps;
  say in a `WHY:` comment which stock behaviour is being relied on.

---

# Lane E — distribution and the +X chips (after C)

## E-3 · Spacing defaults, and a control to see them

> "The ports on the top and bottom and right edges are not evenly spacing
> correctly? I would expect them to be evenly spread out? the two ports seem at
> opposing sides?"
>
> "Perhaps next to the edge can you please have a control that allows you to
> change the type of control or something? for the top and bottom we should
> generally do evenly spaced as a default. So Distribute and Around... It doesn't
> make sense to bias the ports on the top or bottom to the left or the right. If
> there is only 1 port it should be in the middle."
>
> "if port edges on all 4 sides. then the edges should all be distribute and
> around. if port edges just on left or right, then it should be aligned to edge
> and to the start. (thats the classic port view of course then in expanded we do
> distribute)"

**The defaults depend on which edges are populated, so they cannot be decided
inside `PortEdge`** — one edge does not know about the others. `BlockPort` is
the component that knows all four, so the rule lives there:

- populated edges include a top or bottom → **every** edge defaults to
  `{ mode: "distribute", scheme: "around" }`
- populated edges are only left and/or right → every edge defaults to
  `{ mode: "aligned", anchor: "start" }`
- an explicit per-edge `distribution` from the caller always wins

`around` already centres a single item, which is his "if there is only 1 port it
should be in the middle" — verify that rather than special-casing n=1.

Add the control he asked for **beside each edge** in the story: a small
segmented control switching that edge's distribution live, so the vocabulary is
visible instead of described. His screenshots 154517 / 154624 show the exact
control shape already used elsewhere in these stories.

## E-2 and E-4 · `+X more` / `+X ports`

> "In simple view perhaps have option to show text here showing +X ports"
> "Please add functionality and create a story to show the +2 more, (more
> generally +X more) ports for when ports are hidden"

One mechanism, two presentations — build it once:

- a `+X more` line in the lane's own text style, under the last visible port
  (screenshot 153213), for when a `maxVisible` cuts the list
- a `+X ports` label on a simple-face block whose wall shows a single dot
  (screenshot 153001)

`PortEdge` already has `renderCollapsed` for the whole-family case; read it
before adding a second seam, and reuse it if it fits. Report it if it does not.

---

# Lane F — the port label and the secondary slot (after C)

## F-1 · Editing is a mode you enter, not an overlay that is always there

> "Instead of when I toggle it and it showing the multi line editor as an
> overlay. I like the toggle but the actual ports should basically look
> identical. The only difference is when you click the port to edit it. either
> only a single line will appear, or the full multi line will appear."
>
> "Also when you are in multi line edit mode, the display text shouldn't show any
> more."
>
> "I also think in multi line edit mode, for simplicity we should be using
> labeled ports that use the CodeEditor single line. Right now you may be having
> difficulties because you are using EditableText in the label slot."

Three separate corrections, all in one model:

1. **Resting state is identical with the toggle on or off.** Screenshot 152541
   is resting; 152559 is after a click. Today the editor is painted over the
   ports permanently (152404), which is the bug.
2. **Editing replaces the display text**, it does not sit on top of it.
3. **The label slot holds a single-line `CodeEditor`**, not an `EditableText` —
   his diagnosis, and it is also why the type sizes disagree.

**Type size.** Screenshots 152624/152634: the displayed label is visibly larger
than the editing text. They must match. Measure it — `getComputedStyle`'s
`fontSize` on the resting label and on the editor's own text must be equal, and
that is the acceptance criterion. Do not eyeball it.

## F-6 · The secondary slot is one line, always

> "Please fix the secondary slot. The idea is that we use it to display for
> example the number of wire connections going into a slot. Show a story with a
> wire drawn so you can visually see that its out of the wires way, in all the
> possible direction N, W, S, E."
>
> "Also if there is like an event pill it should all be in a single text line.
> the slot position may change but its always just a single horizontal text line,
> similar to the primary label slot."
>
> "In a similar way please get rid of this Two line function port. this is not a
> part of our visual language, two lines per port."

Screenshot 154132 shows `Event` wrapping onto a second line above `4` — that is
the defect. A port's secondary slot is **one horizontal line**, whatever its
placement. Same for the primary label: delete the `Two Lines` function-port
story and whatever makes two lines possible.

The wire story is the real deliverable: draw an actual `Trace` into each port
and show the secondary slot clearing it on all four edges. Screenshot 154036 is
the existing `Offset Clears The Wire` idiom — extend that, do not invent a new
one. Assert the clearance by measuring the slot's rect against the wire's path,
not by looking at it.

---

# Lane D — the function port's bar (after C)

## D-5 · Spacing in the header's left slot

> "in the Function Port story in Block port. Please add some more spacing I
> think. to the left slot on the bar... perhaps this is just about putting like a
> padding inside that slot? test the function port out with a couple different
> styles of headers."
>
> "If there is no label then I think the bar content should start where the label
> would start. If there is a label then it should kinda start to the right of the
> label..."

Screenshot 153855 is the specification and it is precise: **CURRENT BAD** has
`Planner` hard against the port dot; **DESIRED** insets the header content; the
third panel draws a red line showing the header content aligning with the port
LABELS below it, not with the dots.

So the rule is not "add padding" — it is **the header content starts on the same
x as a port label would**. Derive that from the existing port-label geometry
(`blockPort.layout.ts` already computes the function port's centre); do not
hardcode a pixel that happens to match at one size. Then prove it: measure the
header content's left edge against a body port's label left edge and assert they
are equal.

Test it against several header shapes — screenshot 153655 shows glyph + title +
badge + type — and with a label present vs absent.

---

# Lane I — dnd-kit cards and grouped dragging (after E and F)

> "The dragging of the grouped ports is not as smooth as I would like it to be.
> also you should add a story showing grouping collapse vs expanded, and in both
> of these cases have the option to draw the card."
>
> "I do wonder what the card looks like when its grouped... technically I would
> imagine that its like one larger card... but how does dnd kit implement it? the
> goal with showing the cards is to show what dnd is using for like the collision
> calculations, etc."
>
> "Lets change it instead of saying show card, lets change it in all the stories
> to say 'Show dnd-kit card'"

The rename is the easy half and is a global sweep: every "Show cards" / "Show
card" label becomes **"Show dnd-kit card"**. The prop names do not change — this
is the visible label only.

The rename also states what the overlay is FOR, which the previous round only
half-answered: it draws dnd-kit's own collision rectangle. So the overlay for a
GROUPED family must be **whatever dnd-kit actually uses**, measured — if that is
one rectangle around the family, draw one; if it is per-item rectangles, draw
those. Read dnd-kit's collision detection and report which it is BEFORE drawing
anything. Drawing a guessed rectangle would make the toggle lie about the exact
thing it exists to reveal.

"Not as smooth as I would like" is a symptom, not a spec. Profile it, name the
cause, and report it with a measurement. Do not guess at an optimisation.

---

## Shared rules for all lanes

- **Stories are the deliverable** — many variants in one view, each captioned
  with what it proves.
- Verify with `pnpm test-stories` and `pnpm exec vitest --project=unit run`.
  **Never** read `window.__STORYBOOK_PREVIEW__.storyRenders[…].reportedException`
  — not a real property, reads `undefined` whether or not a play function threw.
- Spatial and typographic claims are measured (`getBoundingClientRect`,
  `getComputedStyle`). DOM presence is not a layout assertion.
- A `WHY:` comment at any seam preserving a stated product decision.
- Never `git add -A` — peers share this git index.
- A visual check runs on your own `STORYBOOK_PORT`, never the reviewer's 5421.
- Do not touch `src/components/elbow/**` (verbatim third-party port),
  `vitest.config.ts`, `.storybook/**`, `registry.json`, `apps/docs/**`,
  `packages/**`.
