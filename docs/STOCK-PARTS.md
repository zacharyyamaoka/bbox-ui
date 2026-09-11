# Stock parts for the SystemSketch primitives — verified inventory
**Compiled 2026-09-11. Every component name below was fetched from a primary source (the library's own registry JSON, `llms.txt`, or the installed `node_modules`), never recalled. Claims I could not verify are marked UNVERIFIED.**

---

## 0. The headline, before the detail

1. **Zach's mental model is right on the stacking order and wrong on the reimplementation.** shadcn does *not* reimplement Base UI's primitives — for 30 of its 63 components it literally `import`s them and adds Tailwind classes 3,5. It is a **copy-paste styling layer**, and it is one of **three interchangeable** styling layers.
2. **shadcn is no longer Radix-only, and Base UI is now its default.** `shadcn init --defaults` resolves to `--preset=base-nova` 6. The primitive engine is chosen by a **prefix on `components.json`'s `style` field** (`base-*` / `radix-*` / `aria-*`, 8 style names each) 4, and per-invocation by `shadcn add -b <base>` where base is `base | radix | aria` 6.
3. **He already owns all of this.** `@base-ui/react@1.8.0`, `radix-ui@1.6.7`, `shadcn@4.21.0`, `tailwindcss@4.3.3`, `lucide-react@1.43.0`, `class-variance-authority`, `cn` are already dependencies of SystemSketch, and **24 shadcn components are already vendored** at `src/components/ui/` 7,8,9. Adding a stock part for any of his primitives costs **zero new dependencies**.
4. **The cheapest correct answer for three of his six primitives is "no component."** Text Box (display), Row Container, and Port are CSS/SVG, not library parts.

---

## 1. Base UI — what it actually ships

- Package: **`@base-ui/react`**, version **1.8.0** (released 2026-09-04) 1,2.
- Maintainer: **the MUI team** — `"author": "MUI Team"`, repo `github.com/mui/base-ui` 2. (A WebFetch summarizer claimed the docs credit "Anthropic's Claude Agent SDK"; that is summarizer contamination, contradicted by the package manifest. Disregarded.)
- Self-description from the manifest: *"a library of headless ('unstyled') React components and low-level hooks. You gain complete control over your app's CSS and accessibility features."* 2 — **it ships no CSS at all**.
- Version history is real and recent: v1.0.0 2025-12-11 → v1.8.0 2026-09-04 1.

### The 37 components (verbatim, from `base-ui.com/llms.txt`) 1

Accordion · Alert Dialog · Autocomplete · Avatar · Button · Checkbox · Checkbox Group · Collapsible · Combobox · Context Menu · Dialog · Drawer · Field · Fieldset · Form · Input · Menu · Menubar · Meter · Navigation Menu · Number Field · OTP Field · Popover · Preview Card · Progress · Radio · Scroll Area · Select · Separator · Slider · Switch · Tabs · Toast · Toggle · Toggle Group · Toolbar · Tooltip

Plus 4 utilities: **CSP Provider · Direction Provider · `mergeProps` · `useRender`** 1.

### The parts API, for the ones that matter here 10

Base UI components are **either** a single element **or** a dotted parts namespace. This is not uniform and guessing it is the main way to be wrong:

| Component | Anatomy |
|---|---|
| `Toggle` | **single part.** `import { Toggle } from '@base-ui/react/toggle'` → `<Toggle />`. No `Toggle.Root`. 10 |
| `ToggleGroup` | **single part** root; children are `Toggle`s. `<ToggleGroup />` 10 |
| `Button` | **single part.** `<Button />` 10 |
| `Input` | **single part.** `<Input />` 10 |
| `Separator` | **single part.** `<Separator />` 10 |
| `Collapsible` | `Collapsible.Root` · `Collapsible.Trigger` · `Collapsible.Panel` 10 |
| `Accordion` | `Accordion.Root` · `.Item` · `.Header` · `.Trigger` · `.Panel` 10 |
| `Select` | `.Root` `.Trigger` `.Value` `.Icon` `.Portal` `.Backdrop` `.Positioner` `.Popup` `.Arrow` `.List` `.Item` `.ItemText` `.ItemIndicator` `.Group` `.GroupLabel` `.Label` `.Separator` `.ScrollUpArrow` `.ScrollDownArrow` 10 |
| `Menu` | `.Root` `.Trigger` `.Portal` `.Backdrop` `.Positioner` `.Popup` `.Arrow` `.Viewport` `.Item` `.LinkItem` `.CheckboxItem` `.CheckboxItemIndicator` `.RadioGroup` `.RadioItem` `.RadioItemIndicator` `.Group` `.GroupLabel` `.Separator` `.SubmenuRoot` `.SubmenuTrigger` 10 |
| `Field` | `.Root` `.Label` `.Control` `.Description` `.Error` `.Item` `.Validity` 10 |
| `Toolbar` | `.Root` `.Button` `.Group` `.Input` `.Link` `.Separator` 10 |
| `NumberField` | `.Root` `.Group` `.Input` `.Increment` `.Decrement` `.ScrubArea` `.ScrubAreaCursor` 10 |
| `Avatar` | `.Root` `.Image` `.Fallback` 10 |

> **`NumberField.ScrubArea` / `.ScrubAreaCursor` confirms the earlier auto-memory finding** (`figma-scrub-field.md`): Base UI is the only one of the three engines that ships drag-to-scrub as a primitive part.

---

## 2. shadcn/ui — what it actually ships

Primary source is the machine registry `https://ui.shadcn.com/r/index.json` 3 — **63 `registry:ui` items**, every one carrying `meta.links` for `base`, `aria` and `radix`.

### The 63 installable items 3

accordion · alert · alert-dialog · aspect-ratio · attachment · avatar · badge · breadcrumb · bubble · button · button-group · calendar · card · carousel · chart · checkbox · collapsible · combobox · command · context-menu · dialog · direction · drawer · dropdown-menu · empty · field · form · hover-card · input · input-group · input-otp · item · kbd · label · marker · menubar · message · message-scroller · native-select · navigation-menu · pagination · popover · progress · questionnaire · radio-group · resizable · scroll-area · select · separator · sheet · sidebar · skeleton · slider · sonner · spinner · switch · table · tabs · textarea · toast · toggle · toggle-group · tooltip

**Three names on the docs sidebar are NOT installable registry items — `Typography`, `Data Table`, `Date Picker`** (absent from `/r/index.json`) 3. They are documentation recipes composed from other items. Conversely `form` and `sonner` are registry items that the components index page does not list 3.

**Not all 63 exist for all three engines** 3:
- `aria`-only (no Base UI, no Radix build): **attachment, bubble, marker, message, message-scroller**
- `base` + `radix` only (no React Aria): **menubar, navigation-menu**
- `base`-only: **toast**
- `form` carries **no** engine links at all.

---

## 3. THE RELATIONSHIP — verify or correct

> Zach: *"raw CSS/HTML at the bottom, then Base UI, then shadcn on top; shadcn basically provides lightweight styling on top of the Base UI things, so it's strictly on top; it seems shadcn reimplements all of the Base UI primitives but just more opinionated."*

**Verdict: the layering is correct. "Reimplements" is wrong. "Strictly on top" is wrong in two specific ways.**

### ✅ Correct: the stack, and "lightweight styling on top"
`src/components/ui/button.tsx` in his own tree is the proof — it is 40 lines of `cva` Tailwind variants wrapped around `import { Button as ButtonPrimitive } from "@base-ui/react/button"` 9. Same shape for collapsible, toggle, select, separator, input, dropdown-menu 9. shadcn adds **classes and a `data-slot` attribute**, and re-exports. That is the whole contribution for those components.

### ❌ Wrong #1: shadcn does not *reimplement* the primitives — it imports them
30 of 63 items import a real Base UI primitive by name 5:

> accordion(`/accordion`) · alert-dialog(`/alert-dialog`) · avatar(`/avatar`) · button(`/button`) · checkbox(`/checkbox`) · collapsible(`/collapsible`) · combobox(`@base-ui/react`) · context-menu(`/context-menu`) · dialog(`/dialog`) · direction(`/direction-provider`) · drawer(`/drawer`) · **dropdown-menu(`/menu`)** · **hover-card(`/preview-card`)** · input(`/input`) · **menubar(`/menu`,`/menubar`)** · navigation-menu(`/navigation-menu`) · popover(`/popover`) · progress(`/progress`) · radio-group(`/radio`,`/radio-group`) · scroll-area(`/scroll-area`) · select(`/select`) · separator(`/separator`) · **sheet(`/dialog`)** · slider(`/slider`) · switch(`/switch`) · tabs(`/tabs`) · toast(`/toast`) · toggle(`/toggle`) · toggle-group(`/toggle`,`/toggle-group`) · tooltip(`/tooltip`)

Note the renames in bold: shadcn's `dropdown-menu` **is** Base UI's `Menu`; `hover-card` **is** `PreviewCard`; `sheet` **is** `Dialog` with different Tailwind.

### ❌ Wrong #2: shadcn is not *only* on top of Base UI — it is on top of any of three
The engine is a **project-level setting with a per-command override**:

- `components.json` `"style"` enum (from the official schema) 4:
  `default` · `new-york` · `radix-{vega,nova,maia,lyra,mira,luma,sera,rhea}` · `base-{…same 8…}` · `aria-{…same 8…}` — **26 values = 2 legacy + 3 engines × 8 skins.** The prefix picks the engine; the suffix picks the visual skin.
- CLI, read verbatim out of the installed binary 6:
  - `shadcn init … -b, --base <base>` → *"the component library to use. (base, radix, aria)"*
  - `shadcn add … -b, --base <base>` → *"the base to use: base, radix, or aria. defaults to project base."*
  - `shadcn init --defaults` → *"use default configuration: --template=next **--preset=base-nova**"* ← **Base UI is the default engine today.**
- Docs are per-engine paths, all live (HTTP 200 checked) 16: `/docs/components/base/badge`, `/docs/components/radix/badge`, `/docs/components/aria/badge`. Those are the three tabs in the screenshot.
- Registry JSON is per-engine-skin: `https://ui.shadcn.com/r/styles/<style>/<name>.json`, e.g. `…/base-nova/toggle.json` 5.
- Each item's `meta.links.<engine>.api` points at the upstream doc — `base` → `https://base-ui.com/react/components/toggle.md`, `aria` → `https://react-aria.adobe.com/ToggleButton#api`, `radix` → `https://www.radix-ui.com/docs/primitives/components/toggle.md` 3.

*UNVERIFIED:* the CLI has a `migrate` command (*"run a migration."*) and carries the warning string *"Components outside the `ui` directory that depend on … primitives may need manual updates"* 6, which strongly implies an engine-swap migration exists. I confirmed a **base-colour** migration path in the binary but did **not** confirm the exact subcommand name for swapping Radix→Base UI. Zach's own vault note records `shadcn migrate radix` as real 13 — that was true for shadcn 3.x; I did not re-verify it against 4.21.0.

### ❌ Wrong #3: "strictly on top" — 25 of 63 have no headless layer beneath them at all
**Zero `@base-ui/react` import — pure markup + Tailwind (25)** 5:
> alert · aspect-ratio · **calendar** · **card** · carousel · chart · command · empty · **field** · form · **input-group** · input-otp · **kbd** · **label** · message · message-scroller · **native-select** · pagination · questionnaire · resizable · **skeleton** · sonner · **spinner** · **table** · **textarea**

**A middle tier worth naming (8)** — these import *only* the Base UI **utilities** `mergeProps` and `useRender`, never a primitive 5:
> attachment · **badge** · breadcrumb · bubble · **button-group** · **item** · marker · sidebar

So **Badge is not literally zero-dependency**: `badge.tsx` imports `@base-ui/react/merge-props` and `@base-ui/react/use-render` purely to support its `render` prop (render-as-`<a>`) 5,9. No popup, no focus management, no state machine. Functionally it is markup + Tailwind; strictly, deleting Base UI would break its `render` prop.

**Where the library buys him nothing:** for the 25 pure items, "adopting shadcn" is adopting *a Tailwind class string and a `data-slot` name*. That is a real but small purchase — it is a design-system convention, not behaviour.

---

## 4. Gaps both ways 1,3,5

**Base UI ships, shadcn has no wrapper for (6 real gaps):**
`Autocomplete` · `CheckboxGroup` · `Fieldset` *(shadcn's `field` does export `FieldSet`/`FieldLegend`, but hand-rolled, not Base UI's)* · `Meter` · **`NumberField`** *(incl. `ScrubArea` — the drag-scrub primitive)* · **`Toolbar`**
Also `OTPField`: shadcn's `input-otp` exists but is built on the third-party `input-otp` npm package, **not** Base UI's `OTPField` 5.

**shadcn ships, Base UI has nothing equivalent (the "pure" list above, plus):**
`Card` · `Table` · `Chart` (recharts) · `Calendar` (react-day-picker + date-fns) · `Carousel` (embla) · `Command` (cmdk) · `Sidebar` · `Resizable` (react-resizable-panels) · `Sonner` · `Kbd` · `Empty` · `Item` · `Skeleton` · `Spinner` · `AspectRatio` · `Pagination` · `Textarea` · `Label` · `NativeSelect` · `Badge` · `Alert` · `Breadcrumb` · `ButtonGroup` · `InputGroup` — i.e. **everything that is layout, typography, tabular or third-party-wrapped.** Base UI is deliberately only the interactive/a11y-hard set.

---

## 5. What he already pays for — the delta

### SystemSketch `/home/bam/systemsketch` 7,8,9

| Already a dependency | Version | Evidence |
|---|---|---|
| `@base-ui/react` | **1.8.0** | package.json 7 · node_modules manifest 2 |
| `radix-ui` | **1.6.7** | package.json 7 — **a second headless engine, live in 9 files** (`BlockIconPicker`, `BtInsertMenu`, `ReliableContextMenu`, `CompareDialog`, `LocalWorkspace`, `ContextualControls`, `DraftModeBar`, `DraftsControl`) 9 |
| `shadcn` (CLI) | **4.21.0** | package.json 7 |
| `tailwindcss` + `@tailwindcss/vite` | **4.3.3** | package.json 7 · `src/theme/tailwind.css` 9 |
| `lucide-react` / `lucide-static` | **1.43.0** | package.json 7 |
| `class-variance-authority` · `cn` · `tw-animate-css` | 0.7.1 / 0.2.6 / 1.4.0 | package.json 7 |
| `codemirror` 6 + 8 `@codemirror/*` | — | package.json 7 |

`components.json`: `"style": "base-nova"`, `"iconLibrary": "lucide"`, `"ui": "@/components/ui"`, `"registries": {}` 8. **So SystemSketch is already configured as a Base UI-engine shadcn project.**

**Already vendored (24 of 63)** at `src/components/ui/` 9:
badge · breadcrumb · button · button-group · collapsible · context-menu · dropdown-menu · field · input · input-group · item · kbd · label · popover · scroll-area · select · separator · slider · switch · tabs · textarea · toggle · toggle-group · tooltip

**Not yet vendored (39):** accordion · alert · alert-dialog · aspect-ratio · attachment · avatar · bubble · calendar · card · carousel · chart · checkbox · combobox · command · dialog · direction · drawer · empty · form · hover-card · input-otp · marker · menubar · message · message-scroller · native-select · navigation-menu · pagination · progress · questionnaire · radio-group · resizable · sheet · sidebar · skeleton · sonner · spinner · table · toast 3,9

> **Every primitive in the mapping below is served by something already in that vendored 24.** The delta for this whole exercise is **zero new npm packages and zero new registry items.**

### bbox-ui `/home/bam/bbox-ui` 12,14,15

- Root devDeps: `shadcn@^3.0.0` (CLI only), `typescript` 12. It is itself **a shadcn registry** — `registry.json` publishes `bbox-layout`, `port`, `block`, `block-node-reactflow`, `block-shape-tldraw` 14.
- `@bbox-ui/core` runtime deps: **`clsx` + `tailwind-merge` only.** No Base UI, no Radix, no shadcn runtime 12. Deliberately dependency-free presentational core.
- `@bbox-ui/inspector` **does** carry `@base-ui/react@1.8.0`, `shadcn@^4.21.0`, `cva`, `cn`, `lucide-react`, `tw-animate-css` 12 — the ported tldraw-styling-lab inspector.
- The CodeField lives on branch `claude/code-field` and is published as registry items `code-field` / `code-field-signature`, exporting **`CodeField`, `CodeFieldHandle`, `CodeFieldModeToggle`, `CodeFieldRows`, `CodeFieldGrammar`, `grammarExtensions`** over `@codemirror/*` + `@lezer/highlight`, with `registryDependencies: ["utils"]` — **no Base UI, no Radix** 15.

---

## 6. THE MAPPING

| Element | What he has today | Off-the-shelf part, by its exact exported name | Which layer it lives in | Behaviour that must survive |
|---|---|---|---|---|
| **Text Box — display surface** (block title, type label, port name) | Hand-rolled DOM inside the tldraw `HTMLContainer`; text size / per-side padding / sans·sketch·mono / vertical align / horizontal justify are his own props | **Nothing. Do not adopt a component.** Closest stock things: shadcn's **`Typography`** is a *docs page only, not a registry item* 3; Base UI ships no text primitive 1. The real stock parts are Tailwind utilities — `text-*`, `px/py/pt/pr/pb/pl-*`, `font-sans/font-mono`, `items-start/center/end`, `justify-start/center/end` | **CSS** (Tailwind v4, already installed 7) | All five of his axes are already 1:1 CSS. Sketch font is a custom `@font-face` no library ships. A component here would *add* a wrapper without removing a decision. |
| **Text Box — editable, single-line plain** | tldraw's own text editing / hand-rolled inputs | **`Input`** — shadcn `input`, which wraps Base UI's single-part `Input` 5,10 | **shadcn** (already vendored at `src/components/ui/input.tsx` 9) | Enter must `stopPropagation` or tldraw re-enters shape editing (auto-memory `port-is-one-line-of-code`). Base UI's `Input` is a single part — there is no `Input.Root`. |
| **Text Box — editable, multi-line plain** | — | **`Textarea`** — and note it is a **plain `<textarea>` + Tailwind, zero Base UI** 5 | **shadcn** (vendored 9) | Answering his question directly: *"seems its called a textarea?"* — yes, but `Textarea` is the **multi-line form input**, not his display surface. shadcn has no component named "text box". |
| **Text Box — editable, code** ⟵ *solved* | **`CodeField`** (CodeMirror 6) 15 | **Keep `CodeField`.** Nothing stock competes: Base UI has no editor, shadcn has no editor. Optional stock neighbours: **`Field` / `FieldLabel` / `FieldError`** for the labelled wrapper (pure markup, no Base UI) 5 | **other** (CodeMirror 6) | Single-line guard, `externalSync`, grammar autocompletion, one `autocompletion()` per state. Already registry-published as `code-field` 15. |
| **Glyph** ("a button with an icon… because we want to be able to change it") | Hand-rolled icon slots; `BlockIconPicker` over the whole Lucide + emoji library 17 | **`Button`** with `size="icon"` + a **`lucide-react`** icon element. `Button` wraps Base UI's single-part `Button`, and exposes `buttonVariants` for a bare/ghost glyph 5,9 | **shadcn** `button` (vendored) over **Base UI** `Button`; icons are **other** (`lucide-react@1.43.0`, already installed 7) | It is a *button*, so focus ring, `disabled`, `aria-pressed` and keyboard activation come free. Base UI's `Button` adds "focusable when disabled" and render-as-another-tag 10 — both things a hand-rolled `<div onClick>` loses. |
| **Glyph — the picker it opens** | `BlockIconPicker` on **Radix** `Popover`, portalled through tldraw's `useContainerIfExists()` 17 | **`Popover` / `PopoverTrigger` / `PopoverContent`** (shadcn, over Base UI `Popover`) 5, **or** **`DropdownMenu` / `DropdownMenuTrigger` / `DropdownMenuContent`** (over Base UI `Menu`) 5 | **shadcn** over **Base UI** — but he is currently on **Radix** here | **Leave it on Radix for now.** The WHY comment at `BlockIconPicker.tsx:7-16` records that portalling through tldraw's own container is what keeps the panel above the Block cards 17. Auto-memory `base-ui-positioner-owns-the-z-index` says the Base UI `Positioner` owns z-index differently — a migration is a real, testable change, not a rename. |
| **Row Container / Stack** ("I guess its basically like a flexbox") | Hand-rolled flex rows in `blocks/memberLayout.ts` and the Block canvas | **Nothing — this is CSS, and he should not adopt one.** Neither Base UI nor shadcn ships a `Stack`/`Flex`/`Box` 1,3. (Chakra/MUI/Radix-Themes do; adopting one means adopting that whole design system.) The stock parts are `flex`, `flex-col`, `gap-*`, `items-*`, `justify-*` — plus **`ItemGroup` / `Item` / `ItemMedia` / `ItemContent` / `ItemActions`** 5 if he wants a *named, styled* row idiom rather than a layout engine | **CSS** | His rows carry canvas-specific facts a generic `Stack` cannot: port anchoring geometry, `row`/`branch` assignment, fold-aware autosize. A `<Stack>` would be a rename of `<div className="flex">` that also hides the gap value. **Verdict: keep the flexbox.** |
| **Folding toggle** (collapse the black box) | Hand-rolled fold control + `blockShape` state | **Two different parts, and he wants the *first*:** (a) the **control** → **`Toggle`** (`toggleVariants` for the bare look) over Base UI's single-part `Toggle` 5,10; (b) the **section that folds** → **`Collapsible` / `CollapsibleTrigger` / `CollapsibleContent`** over Base UI `Collapsible.Root/.Trigger/.Panel` 5,10 | **shadcn** over **Base UI** (both vendored 9) | **Do not reach for `Collapsible` on the canvas.** `Collapsible` animates a DOM panel's height and owns the open state; his fold changes **shape geometry** and must round-trip through autosize (`test:block-fold-autosize`). What he wants from stock is the *button*: `Toggle`'s pressed state, `aria-pressed`, keyboard. `Collapsible` is the right part for the **inspector panels**, not for the block. |
| **Black-box toggle** (show/hide innards) | Hand-rolled | **`Toggle`** — or **`ToggleGroup` / `ToggleGroupItem`** if the view ladder is ever ≥3 states rather than on/off 5,10 | **shadcn** over **Base UI** | Single-select `ToggleGroup` is the honest part for a *ladder*; `Toggle` is the honest part for a *binary*. Base UI's `ToggleGroup` is a single-part root — `<ToggleGroup>` with `Toggle` children, no `.Root` 10. |
| **Pill / Badge** ("we can use shadcn badge here") | Hand-rolled pills (literal-argument pill, `z⁻¹` chip, type pills) | **`Badge`** + **`badgeVariants`** — variants `default · secondary · destructive · outline · ghost` 5 | **shadcn**, vendored at `src/components/ui/badge.tsx` 9 | **Confirmed, with one correction: it is not headless-free.** It imports `@base-ui/react/merge-props` and `@base-ui/react/use-render` — utilities only, no primitive, purely to support the `render` prop 5,9. Behaviourally it is markup + Tailwind. His pills carry semantics (temporal `z⁻¹`, opacity `?`) that live in *his* props, not in `variant`. |
| **Dropdown — "pick one of N values"** | Hand-rolled selects in inspectors | **`Select` · `SelectTrigger` · `SelectValue` · `SelectContent` · `SelectItem` · `SelectGroup` · `SelectLabel` · `SelectSeparator` · `SelectScrollUpButton` · `SelectScrollDownButton`** 5 — over Base UI `Select.Root/.Trigger/.Value/.Icon/.Portal/.Positioner/.Popup/.List/.Item/.ItemText/.ItemIndicator/…` 10. Plain native alternative: **`NativeSelect` · `NativeSelectOption` · `NativeSelectOptGroup`** (zero Base UI) 5 | **shadcn** over **Base UI** (vendored 9) | This is the **value picker** — it has a *value*, and its trigger shows the current one. Base UI's `Positioner` owns the z-index, which is the trap when mounting inside tldraw (auto-memory `base-ui-positioner-owns-the-z-index`). |
| **Dropdown — "menu of actions"** | `BtInsertMenu`, `ReliableContextMenu` on Radix 9 | **`DropdownMenu` · `DropdownMenuTrigger` · `DropdownMenuContent` · `DropdownMenuItem` · `DropdownMenuCheckboxItem` · `DropdownMenuRadioGroup` · `DropdownMenuRadioItem` · `DropdownMenuLabel` · `DropdownMenuSeparator` · `DropdownMenuShortcut` · `DropdownMenuSub` · `DropdownMenuSubTrigger` · `DropdownMenuSubContent` · `DropdownMenuGroup` · `DropdownMenuPortal`** 5 — over Base UI's **`Menu`** (not "DropdownMenu") 5,10. Right-click flavour: **`ContextMenu*`** (15 exports) 5 | **shadcn** over **Base UI** (both vendored 9) | The distinction he asked for: **`Select` has a value, `DropdownMenu` fires commands.** A "semantic name for something that is really a toggle" is `Select` when the chosen name persists, `ToggleGroup` when it is ≤3 and always visible. Shortcuts are off while a menu is open (auto-memory `tldraw-shortcuts-off-while-menu-open`). |
| **Port** (a circle) | `PortDot.tsx` — a `.Port` element whose class drives a capture listener that turns a press into a cable 9 | **Nothing stock applies.** Base UI: nothing. shadcn: nothing. **React Flow UI** (`https://ui.reactflow.dev/registry/<name>.json` 11) is the adjacent ecosystem and ships: **`BaseHandle`** · **`LabeledHandle`** · **`ButtonHandle`** · **`BaseNode` / `BaseNodeHeader` / `BaseNodeHeaderTitle` / `BaseNodeContent` / `BaseNodeFooter`** · `NodeAppendix` · `NodeTooltip`/`NodeTooltipTrigger`/`NodeTooltipContent` · `NodeStatusIndicator` · `GroupNode`/`GroupNodeLabel` · `PlaceholderNode` · `DatabaseSchemaNode` · `NodeSearch` · `ZoomSlider` · `ZoomSelect` · `ButtonEdge` · `DataEdge` · `AnimatedSvgEdge` · `DevTools` 11. **Correction to a common guess: there is no `NodeHeader` item — `/registry/node-header.json` returns 404; the header is `BaseNodeHeader`, exported from `base-node`** 11 | **other** (React Flow UI) — and **unusable here as-is** | Every React Flow UI part hard-depends on `@xyflow/react` and emits a `<Handle>` DOM element 11. tldraw port anchors are **geometry points, not DOM** — his own note records exactly this: *"a DOM component is simply not a shape there… adding one means six registries across five files"* 13. Keep `PortDot`. It is already published as his own registry item `port` in `bbox-ui` 14, which is the right answer: he is the vendor for this one. |
| **unchanged (stock seam) — keep hand-rolled** | `PortDot` · `CodeField` · row/member layout (`memberLayout.ts`) · the tldraw `ShapeUtil` layer (drag, hit-test, snapping, z-order) · the Radix-mounted canvas popovers (`BlockIconPicker`, `BtInsertMenu`, `ReliableContextMenu`) · block fold/autosize · text display surfaces | — | — | Four independent reasons, in priority order: **(1)** tldraw already owns drag/resize/snap/z-order and the repo's one rule is *"tldraw stays stock"* — writing that logic is the failure mode, adopting a second library that also wants it is the same failure with extra steps. **(2)** Canvas ports are geometry, not DOM; no DOM component set can express them. **(3)** The Radix popovers portal through `useContainerIfExists()`, a tldraw-specific mount that is the reason they sit above Block cards 17 — swapping engines there is a behaviour change to be tested, not a rename. **(4)** Display text and flex rows are CSS; wrapping them in a component adds a name and removes no decision. |

---

## 7. Two things worth deciding, not re-deciding

- **He already decided the direction.** `PROJECT - Black Box UI.md` records it: *"Radix→Base UI swaps one DOM primitive library for another — same rendering model, so the components survive. React Flow→tldraw swaps the rendering model itself… late binding is clean for the presentational layer and lossy for the interaction layer"* 13. And: *"the durable artifact is the component's markup and API, not what renders it"* 13. This inventory is consistent with both; nothing here reopens them.
- **The one genuinely open item is the two-engine state.** SystemSketch runs Base UI (22 files, via the vendored shadcn `ui/`) **and** Radix (9 files, hand-written) side by side 9. That is not wrong — it is how the bridge landed — but it is the only place where "which layer" currently has two answers. Consolidating is a real piece of work with a real z-index/portal trap, not a find-and-replace.

---

## Source Index

1. `https://base-ui.com/llms.txt` — Base UI's own machine-readable docs index. Fetched 2026-09-11; component list, utility list, release dates through v1.8.0 (2026-09-04).
2. `/home/bam/systemsketch/node_modules/@base-ui/react/package.json:1-10` — name `@base-ui/react`, version `1.8.0`, `"author": "MUI Team"`, repo `git+https://github.com/mui/base-ui.git`, the "headless ('unstyled')" self-description.
3. `https://ui.shadcn.com/r/index.json` — shadcn's machine registry index. 63 `registry:ui` items; per-item `meta.links.{base,aria,radix}.{docs,examples,api}`. Fetched 2026-09-11.
4. `https://ui.shadcn.com/schema.json` — official `components.json` schema; the `style` enum (26 values), `menuColor`, `menuAccent`, `rtl`, `registries`.
5. `https://ui.shadcn.com/r/styles/base-nova/<name>.json` — all 63 items downloaded and parsed 2026-09-11; exported names and `import … from` lines read out of each item's `files[].content`.
6. `/home/bam/systemsketch/node_modules/shadcn/dist/*.js` (shadcn CLI **4.21.0**) — literal option strings: `-b, --base <base>` on both `init` and `add`; `--defaults` → `--preset=base-nova`; subcommand descriptions incl. `migrate` → *"run a migration."*
7. `/home/bam/systemsketch/package.json` — dependency versions.
8. `/home/bam/systemsketch/components.json` — `"style": "base-nova"`, `"iconLibrary": "lucide"`, aliases, empty `registries`.
9. `/home/bam/systemsketch/src/components/ui/` (24 `.tsx`) + `grep -rl` over `src/` for `@base-ui/react` (22 files) and `radix-ui` (9 files); `src/blocks/ui/PortDot.tsx:1-20`; `src/theme/tailwind.css`.
10. `https://base-ui.com/react/components/{toggle,toggle-group,collapsible,accordion,select,menu,input,field,separator,toolbar,button,avatar,number-field}.md` — Anatomy + API-reference sections, fetched 2026-09-11.
11. `https://ui.reactflow.dev/registry/<name>.json` — 17 items downloaded and parsed; exports extracted from `files[].content`. `node-header` → **HTTP 404**.
12. `/home/bam/bbox-ui/package.json`, `packages/{bbox-ui,inspector,adapter-reactflow,adapter-tldraw}/package.json`.
13. `/home/bam/zach_brain/PROJECT - Black Box UI.md:328-342, 403-412, 469-472, 483-485` — React Flow UI as a shadcn registry; the DOM-vs-geometry line; late binding of the primitive engine.
14. `/home/bam/bbox-ui/registry.json` — items `bbox-layout`, `port`, `block`, `block-node-reactflow`, `block-shape-tldraw`.
15. `/home/bam/bbox-ui/.claude/worktrees/code-field/public/r/code-field.json` — CodeField registry item exports and dependencies.
16. `https://ui.shadcn.com/docs/components/{base,radix,aria}/badge` — all HTTP 200, verified 2026-09-11 (the three tabs).
17. `/home/bam/systemsketch/src/blocks/ui/iconPicker/BlockIconPicker.tsx:1-25` — the Radix `Popover` + `useContainerIfExists()` WHY comment.
18. `https://reactflow.dev/llms.txt` — React Flow's own docs index; confirms React Flow UI is "a library of shadcn UI components".

### Explicitly unverified
- The exact subcommand for swapping an existing project's primitive engine (Radix→Base UI). `migrate` exists; I confirmed a base-**colour** migration in the 4.21.0 binary and did not confirm an engine migration. Source 13 records `shadcn migrate radix` as real at shadcn 3.x.
- The shadcn *docs sidebar* list (64 entries) came from a rendered-page fetch, not a machine source. The **63-item registry list in §2 is primary**; the docs/registry diff (`Typography`, `Data Table`, `Date Picker` have no registry item; `form` and `sonner` are not on the docs list) is derived from that softer list against the hard one.
- Whether React Aria–engine shadcn components would work inside tldraw's container: not tested. Only the Base UI and Radix engines are in his tree.
