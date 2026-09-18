# Feedback round, 2026-09-17 evening — six items, three lanes

Source: `zach_brain/Projects/bbox-ui/PROJECT - Black Box UI.md:1408` ("More
Feedback"), with 15 screenshots. Everything below is settled; an implementing
lane types it and measures it, and reports a blocker rather than adjusting a
target it cannot hit.

**Lane split is by WRITE SET, not by topic.** Lanes A and B touch disjoint
files and run together. Lane C shares two story files with B, so it runs after
B merges. The trace-control-points lane is running concurrently and owns
`trace.*`, `TraceRouting.stories.tsx`, `TracePolarity.stories.tsx` — none of
these lanes may touch those.

| Lane | Items | Owns |
|---|---|---|
| **A** | 1 · 2 · 5 | `badge.tsx` `Badge.stories.tsx` `codeEditor.tsx` `codeEditor.css` `codeEditorTheme.ts`(new) `CodeEditor.stories.tsx` `LabeledPort.stories.tsx` |
| **B** | 3 | `blockMembers.tsx` `portEdge.tsx` `Block.stories.tsx` `PortEdge.stories.tsx` `BlockPortLane.stories.tsx` |
| **C** | 4 · 6 | `BlockLayouts.stories.tsx`(new) `Block.stories.tsx` `BlockPort.stories.tsx` `BlockPortLane.stories.tsx` |

---

# Lane A

## A-1 · Pill badges, and a real-vocabulary example

> "Please show some badges with a more pill shape. Show an example badge with
> the text Draft, z-1, mut, iter"

The screenshot is stock shadcn's own Badge demo with `rounded-full`. `badge.tsx`
today hardcodes `rounded-md` in the cva base.

- Add a **`shape`** variant: `"rounded"` (default, `rounded-md` — every landed
  caller is unchanged) and `"pill"` (`rounded-full`).
  Do NOT flip the default. Zach asked to *show* pill badges, not to replace the
  existing look, and `Bar`'s title badge reads as a chip on purpose.
- `Badge.stories.tsx` gains two stories:
  - **`PillShape`** — the four variants (default/secondary/destructive/outline)
    in both shapes, side by side, so the difference is the only variable.
  - **`SystemVocabulary`** — badges reading exactly `Draft`, `z-1`, `mut`,
    `iter`. These are SystemSketch's real marks, not lorem: `z-1` is a layer,
    `mut` and `iter` are the cable-pill marks from `cablePillLabel`, `Draft` is
    the block state. Show each in both shapes and at all four `size` rungs, so
    the story doubles as the size-cascade check.

## A-2 · VS Code syntax themes on CodeEditor

> "For the code editor I would like the option to use different vscode
> highlighting things. for example I like using dark modern … its important
> that people can set it to what they are used to … can you please create a
> story that shows how you can change the syntax highlighting color for the
> Pseudo Code code editor view?"

**The seam already exists and must be used, not replaced.** `codeEditor.tsx:297`
runs `syntaxHighlighting(classHighlighter)`, which emits stable `tok-*` classes
carrying **no colour**; `codeEditor.css:146+` is the single place those get
coloured, under `.bbox-code-editor.bbox-code-tokens`. So a theme is a **palette
swap**, not a second highlighter and definitely not a CodeMirror `EditorView.theme`
per theme.

Do this:

1. Rewrite the `tok-*` rules in `codeEditor.css` to read CSS custom properties
   with the CURRENT literal as the fallback:
   `color: var(--bbox-tok-keyword, <today's literal>)`. Every existing instance
   must render byte-identically with no theme set — that is the acceptance
   criterion, not an aspiration.
2. New `src/components/codeEditorTheme.ts`:
   ```ts
   export interface CodeEditorTheme {
     id: string;            // "dark-modern"
     label: string;         // "Dark Modern"
     appearance: "dark" | "light";
     /** CSS custom properties, applied inline to the editor root. */
     vars: Record<string, string>;
   }
   export const CODE_EDITOR_THEMES: readonly CodeEditorTheme[];
   export function codeEditorThemeVars(theme?: CodeEditorTheme | string): CSSProperties;
   ```
   Ship **four**, the published token colours from the VS Code themes named at
   <https://code.visualstudio.com/docs/configure/themes>:

   | | Dark Modern | Light Modern | Monokai | Solarized Dark |
   |---|---|---|---|---|
   | background | `#1f1f1f` | `#ffffff` | `#272822` | `#002b36` |
   | foreground | `#cccccc` | `#3b3b3b` | `#f8f8f2` | `#839496` |
   | keyword | `#569cd6` | `#0000ff` | `#f92672` | `#859900` |
   | control keyword | `#c586c0` | `#af00db` | `#f92672` | `#859900` |
   | string | `#ce9178` | `#a31515` | `#e6db74` | `#2aa198` |
   | number | `#b5cea8` | `#098658` | `#ae81ff` | `#d33682` |
   | comment | `#6a9955` | `#008000` | `#75715e` | `#586e75` |
   | type / class | `#4ec9b0` | `#267f99` | `#66d9ef` | `#b58900` |
   | function | `#dcdcaa` | `#795e26` | `#a6e22e` | `#268bd2` |
   | variable | `#9cdcfe` | `#001080` | `#f8f8f2` | `#839496` |
   | operator | `#d4d4d4` | `#000000` | `#f92672` | `#839496` |

   Background and foreground are part of the theme — a Dark Modern editor on a
   light page that keeps the page's card background is not Dark Modern.
3. `CodeEditorProps` gains `theme?: CodeEditorTheme | string` (an id resolves
   against `CODE_EDITOR_THEMES`; unknown id falls back to no theme, silently,
   because a typo must not blank the editor). It applies `codeEditorThemeVars`
   to the root's inline `style`, merged UNDER any caller `style` so a caller
   override still wins.
4. `CodeEditor.stories.tsx` gains **`SyntaxThemes`**: the same pseudo-code
   document rendered once per theme in a gallery, plus a live `<select>` above
   a single larger editor so he can flip it. Use the repo's existing pseudo-code
   sample if one is in that file; otherwise a short Python block exercising
   keyword / control keyword / string / number / comment / type / function /
   variable in that order, so every row of the table above is visible.

## A-5 · A LabeledPort whose label is a single-line CodeEditor

> "Please add a story of the Labeled port that uses a single line code editor
> instead of the editable label. I would expect to see syntax highlighting on
> the label in that story"

`LabeledPort` already has the `labelSlot` seam (`labeledPort.tsx:184`,
present-beats-absent) — that is the whole mechanism; **no component change**.

New story in `LabeledPort.stories.tsx`, `CodeLabel`:
- `labelSlot={<CodeEditor multiline={false} language={python()} value="var: Type = value" … />}`
- The screenshot (`Pasted image 20260917151359.png`) shows `var` in the variable
  colour, `Type` in the type colour, `= value` plain — so syntax highlighting
  MUST be visibly on. Assert it: at least two distinct `tok-*` spans inside the
  slot, with different computed `color` values. A play function that only checks
  the text is present proves nothing about highlighting.
- Show a small gallery: the code label on all four edges, and one row with a
  theme from A-2 applied, since the two features meet here.
- `overflow: "clip"` and a sensible `columns`, so the label behaves like the
  `<input>`-shaped port label it is replacing rather than growing a scrollbar.

---

# Lane B — the card overlay

> "I don't like how when you show the cards it kinda changes the shape of how
> the members look. The members seem to shrink a bit to fit inside the card.
> Showing it shouldn't change the underlying presentation. I think instead lets
> make the cards be just like a red overlay on top. kinda like the chrome
> inspector overlays. This should apply to both the block and also the port
> edges. The idea is that those cards are always 'there' in spirit. and now this
> toggle lets us just kinda like draw them…"

**The defect, precisely.** Two places wrap content in a real, padded, bordered
surface, so turning the toggle on re-flows everything inside it:

- `blockMembers.tsx:147-161` — `memberSlotBody` wraps content in a
  `rounded-lg border bg-card shadow-sm` div with `padding: CARD_PADDING_PX`.
- `portEdge.tsx:336` — `data-slot="port-edge-card-surface"`, same recipe, same
  padding.

**The fix.** The card stops being a container and becomes an **inspector-style
overlay**: absolutely positioned over the slot it describes, translucent red
fill plus a red border, `pointer-events: none`, contributing nothing to layout.
Content renders identically whether the toggle is on or off.

- Keep the `data-slot` names (`block-member-card`, `port-edge-card-surface`).
  Stories and assertions find cards by them, and the thing they name — "where
  the card is" — is still exactly what the element marks.
- The slot wrapper gets `position: relative`; the overlay is `absolute inset-0`.
- Colours: fill `rgb(239 68 68 / 0.18)`, border `1px solid rgb(239 68 68 / 0.7)`,
  radius matching the card idiom (`rounded-lg`), no shadow. Chrome's own overlay
  is a translucent fill plus an edge, and Zach named red.
- **Delete `CARD_PADDING_PX`'s effect on layout** in both files. If the constant
  survives at all it may only position the overlay, never inset content.
- `EMPTY_CARD_MIN_PX` / `EMPTY_SLOT_MIN_PX` behaviour is UNCHANGED: with members
  hidden the slot still reserves its footprint and the overlay draws on it.
  That is the "always there in spirit" case and it is the one place the card may
  affect geometry — because there is no content whose geometry it could change.

**Update the WHY comments at both seams.** Both currently justify the card as a
surface ("each member sits inside a kanban-style card surface", "sits inside a
bordered kanban-style card"). Replace with the overlay rationale and its date:
the card is a view of a structure that is always present, so drawing it must not
move the thing it describes.

Also update the four captions in `Block.stories.tsx:694-697` — "each member in a
kanban card" is no longer what happens.

### Lane B acceptance — the criterion that IS his complaint

**B1 (the one that matters).** In `Block.stories.tsx`'s members-visibility
story, with `showMembers` on, measure every `[data-slot="block-member"] > *`
content box with `getBoundingClientRect()` with `showCards` OFF, then ON. Every
`width`, `height`, `x` and `y` must be **identical** (tolerance 0). Assert on
the numbers; DOM presence proves nothing here, and "roughly the same" is exactly
the bug.

**B2.** Same measurement for `PortEdge`'s slots with `showCard` off vs on.

**B3.** The overlay element exists when the toggle is on, is absent when off,
and has `position: absolute` + `pointer-events: none` (read from
`getComputedStyle`). A card the pointer can hit would steal the drag that
reorders members.

**B4.** With `showMembers` off and cards on, the slot still occupies its
reserved footprint (height ≥ `EMPTY_CARD_MIN_PX`).

**B5.** `pnpm test-stories` and `pnpm exec vitest --project=unit run` green.

Mutation-test B1 and B3: re-introduce the padding, watch B1 go red, paste the
output, revert.

---

# Lane C — realistic blocks (runs AFTER B merges)

## C-4 · `CodeInsideBlock`'s Attributes card goes edge-to-edge

`Block.stories.tsx:864-940`. The nested "Attributes" Block currently sits inset.
Zach wants it flush. `blockMembers` already supports this — pass
`inset: "edge-to-edge"` on that member. The existing `slotClassName` rule then
squares its corners, which is the already-decided behaviour for a flush member.
No component change.

## C-6 · Block Layouts — a gallery of blocks that look like real blocks

> "I don't like how you have 'trajectory here' in the middle of the block …
> Please make all of the blocks look more realistic … We have a story for
> Different Bars and certainly in Bar we have this one for different header
> layouts. Lets do something like that for 'Block Layouts'."

**First, the defect.** `BlockPort.stories.tsx:140` and
`BlockPortLane.stories.tsx:553` both render `<Block header="Planner"
body="trajectory" footer="ready">`. Zach: *"Generally in Port view we wouldn't
show that 'trajectory' title unless it's a bigger block cause the text gets in
the way of the ports."* Drop the body text from those port demos — the blocks
keep their explicit `height`, so the box does not collapse. Leave the header and
footer; it is only the centred body word that fights the ports.

**Then the gallery.** New `src/stories/BlockLayouts.stories.tsx`, title
`Blocks/Block/Layouts`, modelled on `Bar.stories.tsx`'s `HeaderLayouts` — a
labelled column of small captioned specimens, several visible at once. Four
stories, straight off his whiteboard (`Pasted image 20260917151711.png`):

1. **`SimpleView`** — the body variations he says are missing. In order:
   bare Title · w/ type · w/ type & description · w/ type & description & icon ·
   w/ Badge · w/ many Badges · w/ tool items · Icon Centered · Type Centered.
   These are BODY compositions inside one Block chrome, not new components —
   `Text`, `Glyph` and `Badge` are all that is needed.
2. **`PortView`** — the same block with ports, showing why the body stays quiet:
   header + empty body + footer, and beside it the header-only variant with a
   kebab in the footer. Caption states the rule (body text gets in the way of
   the ports).
3. **`HeaderSizes`** — `Pasted image 20260917152002.png`: the same block at
   Medium (h3) / Large (h2) / Extra Large (h1) header scales, plus the baseline.
   Use `Bar`'s existing `size` cascade; do not invent a second scale.
4. **`BehaviourTreeNodes`** — `Pasted image 20260904153130.png`,
   `…151854.png`, `…151904.png`. Blocks standing in for behaviour-tree nodes:
   a glyph + name in the header, the node kind as the type (`Skill`,
   `Condition`, `Sub Tree`), and a large centred glyph in the body. Show
   `MoveToObj` (Sub Tree), `GraspValid` (Condition), `CloseGrip` / `Retract` /
   `Stow` / `ReturnHome` (Skill), `Recover` (Sub Tree), plus the bare
   sequence/selector/parallel operator nodes (`→`, `?`, `↓↓`) which are small
   square header-only Blocks. Lay them out as a tree if the story can do it with
   static positioning; a captioned row of the node types is acceptable if not —
   say which you did.

Realism rule for the whole lane: **no placeholder words in a body**. Every
specimen carries content it would carry in a real diagram — the reference
screenshot `Pasted image 20260917151931.png` (a full "system of systems"
diagram) is the standard.

---

## Shared rules for all three lanes

- **Stories are the deliverable.** Many variants visible in one view, each
  captioned with what it proves. That is Zach's review surface and the reason
  this repo has Storybook at all.
- Verify with `pnpm test-stories` and `pnpm exec vitest --project=unit run`.
  **Never** read `window.__STORYBOOK_PREVIEW__.storyRenders[…].reportedException`
  — it is not a real property, reads `undefined` whether or not a play function
  threw, and has already cost this repo hours.
- Spatial claims are measured with `getBoundingClientRect()` / `getComputedStyle`.
  DOM presence is not a layout assertion.
- A `WHY:` comment at any seam that preserves a stated product decision.
- Never `git add -A` — peers share this git index. Stage explicit pathspecs and
  read `git diff --cached --name-only` before committing.
- Do not touch: `src/components/elbow/**`, `trace.*`, `traceTerminal.tsx`,
  `traceBadge.tsx`, `TraceRouting.stories.tsx`, `TracePolarity.stories.tsx`,
  `Trace*.stories.tsx`, `vitest.config.ts`, `.storybook/**`, `registry.json`,
  `apps/docs/**`, `packages/**`.
