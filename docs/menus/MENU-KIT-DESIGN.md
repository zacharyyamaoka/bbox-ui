# bbox-ui Menu Kit — Design

Status: proposal (2026-09-18). Author: Fable 5 lane, from the 8-surface SystemSketch
survey + 4-area reference research. This is the lane-readable input; the reviewed
deliverable is the HTML report built from it.

---

## 1. The verdict — where bbox-ui sits on the registry ↔ compound axis

**Ship both layers, asymmetrically, with the boundary drawn between two different
animals that SystemSketch currently conflates:**

1. **Command-shaped surfaces** (file menu, context menu, tool dock, panels, draft
   bar, status strip — anything whose items are *verbs*) are **compound
   components, JSX all the way down**. In a copy-paste registry the consumer owns
   the placement file, so "contribute an item without editing the file" has no
   customer: editing the file IS the extension mechanism. A VS Code-style command
   registry (`when`/`group@order`) is deliberately **not** shipped in v1 — it is a
   reversible ~150-line add on top of the same compound parts if a plugin-shaped
   host ever appears.

2. **Value-bound controls** (the appearance pill, the Block-title formatting menu
   — anything whose items carry a `value`, a `mixed` state, and an options
   vocabulary) keep SystemSketch's **registry + recipe + resolver + one renderer**
   architecture, ported nearly verbatim as pure data. This is a *property editor*,
   not a menu (Tweakpane/Blender shape, not VS Code shape). The vocabulary law —
   *"One vocabulary for every contextual control. Surfaces bind values and
   commands; they do not re-declare labels, options, previews, or layouts."*
   (contextualControlRegistry.ts:256-259) — is the single best idea in the donor
   and it survives intact. Two changes only: the registry becomes a **factory**
   (so palettes and domain vocabularies are injected, never imported), and the
   glyph dispatch table becomes a **host-extendable `Record`** instead of a closed
   union.

**Where the boundary falls:** a host touches **JSX** for menus and **data** for
controls. The control renderer (`controlStrip`/`controlPanel`) is itself built
from the compound parts (`popover.tsx`, `toolbar.tsx`), so there is exactly one
popup engine, one focus model, one styling idiom underneath both layers.

**Why not registry-everywhere:** SystemSketch's own scar tissue argues against
it — `composeContextualControls`'s silent drop lost `lineShape` for every
connector twice; the six-places-to-declare-a-family toolbar is the failure mode
of data-driven placement without a schema owner. **Why not JSX-everywhere:** the
pill's 16 controls × 5 layouts × 4 triggers × stacked modes is exactly the
combinatorial surface a vocabulary table tames, and 387 lines of pure ported
tests prove the data layer works before any rendering exists.

---

## 2. Layer diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│ L0  STOCK (npm, public, MIT — legal registry `dependencies`)              │
│     @base-ui/react (menu, toolbar, context-menu, popover, toggle-group,   │
│     tabs, use-render, merge-props) · @floating-ui/core · lucide-react ·   │
│     class-variance-authority · clsx · tailwind-merge                      │
│     imports: nothing of ours                                              │
├───────────────────────────────────────────────────────────────────────────┤
│ L1  PARTS (components/, styled stock wrappers, shadcn shape)              │
│     EXISTING: button bar barSize badge toggle tooltip dropdown-menu       │
│               collapsible editableText text foldingChevron               │
│     NEW:      toolbar.tsx popover.tsx context-menu.tsx toggle-group.tsx   │
│               button-group.tsx breadcrumb.tsx separator.tsx tabs.tsx      │
│               splitButton.tsx inlineRename.tsx                            │
│     may import: L0, ../lib/utils, sibling L1 parts (the shadcn            │
│     "menubar imports the COPIED dropdown-menu" rule)                      │
├───────────────────────────────────────────────────────────────────────────┤
│ L2  MODELS (components/*.ts — pure TS, ported near-verbatim, tests ride   │
│     along). Zero React except controlGlyphs.tsx (pure fn → ReactNode).    │
│     controlValue.ts controlRegistry.ts controlGlyphs.tsx                  │
│     floatingToolbar.placement.ts breadcrumbCompact.ts toolPreferences.ts  │
│     framesOrder.ts historyTime.ts wordDiff.ts lineDiff.ts propertyRows.ts │
│     compareModel.ts                                                       │
│     may import: nothing of ours; @floating-ui/core in placement only      │
├───────────────────────────────────────────────────────────────────────────┤
│ L3  SURFACES (components/, the screenshot parts; props in, DOM out)       │
│     controlStrip.tsx controlPanel.tsx floatingToolbar.tsx toolDock.tsx    │
│     chromeBar.tsx branchChip.tsx panelShell.tsx framesPanel.tsx           │
│     problemsPanel.tsx statusStrip.tsx historyList.tsx propertyTable.tsx   │
│     codeView.tsx compareReview.tsx draftBar.tsx                           │
│     may import: L0–L2, L1 parts.                                          │
│     may NOT: canvas engines, window/document queries, z-index,            │
│     self-measurement, localStorage, global listeners                      │
├───────────────────────────────────────────────────────────────────────────┤
│ HOST ADAPTERS (never in the kit — the contract in §4)                     │
│     editor bindings · placement runners (measure + placeFloatingToolbar)  │
│     persistence · global keybindings (F2, Shift+D, mouse 3/4) · portal    │
│     containers · z-order/stacking · wheel pass-through · camera framing   │
└───────────────────────────────────────────────────────────────────────────┘
```

Import law restated for this kit: **an L3 surface may import parts and models;
a part may import parts; a model imports nothing.** Interaction geometry
(hit-testing, drag, z-order, measurement) never travels — layout geometry
(placement math, thumbnail fit math, breadcrumb budgets) lives in L2 because the
trunk's own rule says layout geometry is portable.

One shared-file mechanical note: the trunk lays `components/` and `lib/` out as
siblings, so components import `../lib/utils`, and after `shadcn add` flattening
`lib/utils.ts` must target `components/lib/utils.ts` (a sibling of `bbox/`).
Every L2 model lives in `components/` as a sibling `.ts` precisely so its `./`
import survives registry flattening.

---

## 3. Component inventory

File names follow the trunk convention: stock shadcn copies keep kebab-case;
bbox-authored files are camelCase (`blockPort.tsx` precedent).

### 3.1 New L1 parts

**`toolbar.tsx`** — the one genuinely missing wrapper (shadcn has no toolbar item
in any style; verified 404 twice). Renders: the roving-focus container of the
pill, the bottom dock, and the top-left bar.

```ts
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
export function Toolbar(props: ToolbarPrimitive.Root.Props) {...}       // orientation, loopFocus
export function ToolbarGroup(props: ToolbarPrimitive.Group.Props) {...}
export function ToolbarButton(props: ToolbarPrimitive.Button.Props) {...} // render={<Button/>} etc.
export function ToolbarSeparator(props: ToolbarPrimitive.Separator.Props) {...}
export function ToolbarLink(props: ToolbarPrimitive.Link.Props) {...}
```

Size-cascade aware (`useBarSize()` like `button.tsx`). Extension point is the
`render` seam, never a per-control variant prop.

**`popover.tsx`** — Base UI popover with the positioner surface exposed,
including `anchor` (Element | VirtualElement) and `container`. Renders: control
panels, library panel, drafts popover.

```ts
export function Popover(props: PopoverPrimitive.Root.Props) {...}
export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {...}
export interface PopoverContentProps extends PopoverPrimitive.Popup.Props,
  Pick<PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor" | "collisionPadding"> {
  container?: PopoverPrimitive.Portal.Props["container"];
  /** WHY (ported): a live text editor must keep focus while the menu is used. */
  autoFocus?: boolean;               // default true; pill/editing surfaces pass false
}
export function PopoverContent(props: PopoverContentProps) {...}
```

**Modification to existing `dropdown-menu.tsx` and `tooltip.tsx`** — widen the
positioner `Pick` with `"anchor" | "container" | "collisionPadding"`. One-word
change each; today's omission is the only thing blocking a canvas-anchored menu.
Adds-only; every current consumer unaffected. This edits shared contract files,
so it lands in wave 0, alone.

**`context-menu.tsx`** — shadcn base-nova copy over `@base-ui/react/context-menu`
with the two documented copy traps fixed (`cn` from `../lib/utils`, no
`icon-placeholder` import). Renders: right-click file menu. Carries forward the
measured Base UI rules as comments: every `*MenuLabel` needs a `*MenuGroup`
above it (GroupLabel throws otherwise), and composing ContextMenuTrigger with
DropdownMenuTrigger on one element needs the `display:contents` nesting
(TitleBar.tsx:267-276).

**`toggle-group.tsx`** — port of `packages/inspector/src/components/ui/toggle-group.tsx`
(already Base UI, has the `spacing` prop), `cn` repointed. Renders: Side-by-side |
Overlay segmented, severity filter, table-layout segmented, density toggle.

**`button-group.tsx`**, **`breadcrumb.tsx`**, **`separator.tsx`**, **`tabs.tsx`**
— stock shadcn base-nova copies (same fix-ups). Render: back/forward pair, the
path, bar dividers, the Properties/Code detail tabs.

**`splitButton.tsx`** — bbox-authored; composes `Button` + `DropdownMenu`.
Renders: Merge ▾.

```ts
export interface SplitButtonProps {
  label: string;
  onPrimary(): void;
  items: { id: string; label: string; onSelect(): void }[];
  /** disabled greys both segments; blocked greys the primary but keeps the
      chevron accented — WHY (ported, drafts.css:632-655): when merge is blocked
      the chevron must still point at Rebase. */
  state?: "normal" | "disabled" | "blocked";
  size?: ButtonToggleSize;
}
export function SplitButton(props: SplitButtonProps): ReactNode;
```

**`inlineRename.tsx`** — one component replacing the two duplicated editors
(DraftModeBar.tsx:394-423, DraftsControl.tsx:46-115), with a `size` for the two
scales. Renders: draft rename (bar + row), frames-panel rename, file rename
(via `editableText` internally where richer editing is needed).

```ts
export interface InlineRenameProps {
  value: string;
  onCommit(next: string): void;
  onCancel(): void;
  /** returns an error message or null; default rejects empty with
      "Give this draft a name." — validation POLICY is host-swappable. */
  validate?: (next: string) => string | null;
  error?: string | null;                    // controlled error (async commits)
  size?: "bar" | "row";
  /** WHY (ported, DraftsControl.tsx:22-28,59-71): Enter commits, Escape cancels
      AND stops propagation so a popup's dismissable layer stays open; blur
      commits; a mousedown within 400ms of mount is preventDefault-ed so a
      habitual double-click's second click cannot collapse the selection. */
}
```

### 3.2 L2 models (pure, ported, tests ride along)

**`controlValue.ts`** — severs the one load-bearing borrowed type.

```ts
export type ControlValue<T> = { type: "shared"; value: T } | { type: "mixed" };
export function sharedValueAcross<T>(values: readonly (T | undefined)[],
  equals?: (a: T, b: T) => boolean): ControlValue<T> | undefined;
export function combineControlValues<T>(readings: readonly (ControlValue<T> | undefined)[],
  equals?: (a: T, b: T) => boolean): ControlValue<T> | undefined;
// Ported verbatim from systemsketch src/contextualMenus/sharedValues.ts:19-46,
// with its WHY: four hand-rolled copies of this fold used to disagree.
// `undefined` = abstention, never disagreement; all-abstain folds to undefined.
```

**`controlRegistry.ts`** — the donor's architecture, generic and injected.

```ts
export type ControlLayout = "swatches" | "row" | "chips" | "list" | "library";
export type ControlTrigger = "value" | "icon" | "text" | "toggle" | "action";
export interface ControlOption { value: string; label: string }
export interface ControlDefinition<K extends string = string> {
  kind: K; label: string; options: readonly ControlOption[];
  layout: ControlLayout; trigger: ControlTrigger;
  glyph?: string;                 // family key into a GlyphFamilies record
  columns?: number; custom?: boolean;
  /** opaque host tag replacing SystemSketch's meta?: StrokeMetaField — the
      binder may branch on it; the kit never reads it. */
  hostTag?: string;
  /** replaces the hardcoded isCustomColor escape hatch (donor :456). */
  isCustomValue?: (value: string) => boolean;
  customValueLabel?: (value: string) => string;
}
export interface CustomSizeBinding {   // plain VALUES, not thunks — no signals
  sharedPx: number | "mixed" | null; onPresetRungs: boolean;
  applyPx(px: number): void; minPx: number; maxPx: number;
}
export interface ControlBinding {
  id: string;
  value: ControlValue<string> | null;
  onSelect(value?: string, opts?: { continuous?: boolean }): void;
  automaticOption?: ControlOption;
  customColorOpacity?: number;
  customSize?: CustomSizeBinding;
  rungPxByValue?: Readonly<Record<string, number | null>>; // replaces rungPx() thunk
  modeControl?: BoundControl; modePlacement?: "above" | "beside";
}
export type BoundControl<K extends string = string> =
  ControlDefinition<K> & ControlBinding & { kind: K };
export interface ControlRecipe<K extends string = string> {
  id: string;
  groups: readonly { id: string; items: readonly K[] }[];
}
export interface ControlComposition<K extends string = string> {
  id: string; groups: readonly { id: string; controls: readonly BoundControl<K>[] }[];
}
export function createControlRegistry<K extends string>(
  definitions: Readonly<Record<K, ControlDefinition<K>>>,
): {
  bindControl(kind: K, binding: ControlBinding): BoundControl<K>;   // kind re-pinned last
  composeControls(recipe: ControlRecipe<K>, candidates: readonly BoundControl<K>[],
    opts?: { onDangling?: (kinds: K[]) => void }): ControlComposition<K>;
  controlIds(c: ControlComposition<K>): string[];
  danglingControls(recipe: ControlRecipe<K>, candidates: readonly BoundControl<K>[]): K[];
};
export function selectedControlOption(c: BoundControl): ControlOption | null;
export function isAutomaticSelection(c: BoundControl): boolean;  // the A-badge guard, WHY kept
export function controlTriggerLabel(c: BoundControl): string;
export function stackModes(c: BoundControl): BoundControl[];     // the lab's general fold
export const MIXED_LABEL = "Mixed"; export const CUSTOM_LABEL = "Custom";
```

Ported WHYs kept verbatim in the file: the vocabulary law (:256-259); the
`isAutomaticSelection` `undefined === undefined` bug story (:462-472); the
`bindControl` trailing-`kind` re-pin (a binding can never overwrite its
identity); silent-drop + empty-group elision (with the new `onDangling` dev
warning — the lab's `labDangling` proved this is computable). The registry is a
**factory** so palettes, code languages, and any domain vocabulary arrive as
construction input — CONTEXTUAL_CONTROL_REGISTRY's module-const form is what
made injection impossible.

**`controlGlyphs.tsx`** — the drawn glyph functions, editor severed.

```ts
export type GlyphRenderer = (value: string | undefined) => ReactNode;
export type GlyphFamilies = Readonly<Record<string, GlyphRenderer>>;
export const DEFAULT_GLYPH_FAMILIES: GlyphFamilies; // fill dash size strokeWidth font align
                                                    // verticalAlign routing arrowhead
export function swatchGlyph(hexFor: (name: string) => string | undefined): GlyphRenderer;
// FillGlyph/DashGlyph/SizeGlyph/… ported from AppearanceGlyph.tsx:330-506 — the
// only editor-coupled family was swatch (live-theme hex resolution), now injected.
// Hosts extend by spreading: { ...DEFAULT_GLYPH_FAMILIES, myKind: myRenderer }.
```

**`floatingToolbar.placement.ts`** — verbatim port of
`systemsketch/src/chrome/floatingToolbarPlacement.ts:1-343` (already zero tldraw;
only dep `@floating-ui/core`), WITH its 4,608-case differential test against the
frozen hand-rolled oracle. Provenance header cites the donor file:lines.
Exports `placeFloatingToolbar`, `isSelectionOnScreen` (intersection, NOT
midpoint — the WHY about a viewport-filling Expanded Block travels),
`floatingToolbarMaxWidth(viewport, scale)` (the `/scale`-on-the-whole-max
detail), `SelectionMenuSide`, the four constants. `overlayInset` loses its
engine-measured default of 5 — the host must state it.

**`breadcrumbCompact.ts`** — `compactDepthBreadcrumbs` (donor
depthBreadcrumbs.ts:1-58, zero imports, generic over `{id,name,isCurrent}`) +
`segmentBreadcrumbs` rehydration (TitleBar.tsx:130-160) + tests.

**`toolPreferences.ts`** — the generalized preference algebra:
`parsePreferences(registry, value)` (field-independent fallback, donor
toolbarModel.ts:85-105 + test), the identity-preserving merge reducer
(:187-205), and the arrow-preset algebra as an example of derived hints
(`pressCount` derived from the cycle so the hint cannot drift). NO storage —
"Preferences are helpful feedback, never a reason to block drawing" moves into
the doc comment of the host's storage adapter recipe.

**`framesOrder.ts`** — `moveItemKey(currentKeys, sourceKey, targetKey, position)`
(donor framesPanelModel.ts:86-102), `ordered(items, keys)` (unknown keys append),
`readOrder(meta)` (versioned, refuse-unknown → "protected"), `intersects`,
`clip`. Pure; tests ride along.

**`historyTime.ts`** — `relativeTime(ts, now)` / `absoluteTime` (donor
historyModel.ts:75-103, injectable clock, the deliberate
no-`Intl.RelativeTimeFormat` WHY kept).

**`wordDiff.ts`**, **`lineDiff.ts`**, **`propertyRows.ts`**, **`compareModel.ts`**
— byte-for-byte ports (donor cited per file: `src/diff/wordDiff.ts:1-197`,
`src/compare/lineDiff.ts:1-163`, `src/compare/propertyRows.ts:1-247`,
`src/compare/compareModel.ts:47-496`) with one edit: `BlockPort` inlined as a
four-field structural type, severing the last tldraw-transitive type import.
`recordsOfSnapshot` does NOT come — it is the tldraw adapter. Tests port with
their subjects (`compareModel.test.ts`, `wordDiff.test.ts`).

### 3.3 L3 surfaces

**`controlStrip.tsx`** — the pill contents (screenshot: floating toolbar cells,
Block-title pill). Port of ContextualControls.tsx's trigger half.

```ts
export interface ControlStripProps<K extends string = string> {
  composition: ControlComposition<K>;
  glyphs: GlyphFamilies;
  /** popover plumbing for every ControlPanel this strip opens */
  container?: HTMLElement | null;
  autoFocus?: boolean;                        // false while a text editor is live
  onPanelPointerDownCapture?: React.PointerEventHandler; // markEventAsHandled seam
  testIdPrefix?: string;                      // default "bbox"
}
export function ControlStrip<K extends string>(props: ControlStripProps<K>): ReactNode;
```

Keeps: four trigger shapes chosen by `trigger`, never per-kind conditionals;
the A-badge; the muted px readout beside the rung name; `data-contextual-recipe`
→ `data-control-recipe`; group separators only between non-empty groups;
**flex-wrap at every level, never overflow-x** (the wrap survives even though
`usePassThroughWheelEvents` does not — a host with a similar hook needs it, and
the max-width cap mirrors `floatingToolbarMaxWidth`).

**`controlPanel.tsx`** — the popover body (screenshot: swatch grid + Solid/…
mode row, font-size list with checks, Custom px row). Port of the panel half.
`data-layout` × 5, stacked modes outermost-last via `stackModes`, beside-mode
divider, `CustomColorCell` reduced to a **slot** (`customColorSlot?: ReactNode`
— the picker itself is a separate project), `CustomFontSizeCell` rendered only
when the binding supplies `customSize` (absence is meaningful: presets-only,
no dead cell). **`closeOnSelect={false}` is the explicit default** — WHY
(SystemSketchChrome.tsx:460-464): align-then-distribute is the normal two-step;
staying open is policy, not an accident of which library we wrapped.

**`floatingToolbar.tsx`** — the positioned shell (screenshot: the dark pill bar).

```ts
export interface FloatingToolbarProps {
  x: number; y: number;                 // computed by the HOST via placeFloatingToolbar
  side: "above" | "below" | "pinned";
  visible: boolean;
  maxWidth?: number;                    // host passes floatingToolbarMaxWidth(...)
  "aria-label": string;
  children: ReactNode;                  // ControlStrip, OpacitySlider, ArrangeSlot, …
  ref?: React.Ref<HTMLDivElement>;      // host measures THIS for placement + wheel hooks
}
```

Renders position as inline transform + `data-side`/`data-visible`; **no
z-index, no self-measurement, no reactor** — the whole state machine
(ResizeObserver, scale epochs, manipulating gate, monotonic placementPass) stays
host-side, documented in §4.

**`toolDock.tsx`** — the bottom toolbar (screenshot: Figma-style dock).

```ts
export interface ToolItem { id: string; label: string; icon: ReactNode;
  shortcutHint?: string; }              // hint is DISPLAY ONLY; binding is host's
export interface ToolSection { heading?: string; items: readonly ToolItem[] }
export interface FamilyDeclaration {
  id: string; label: string;
  sections: readonly ToolSection[];     // covers Shapes/Arrows two-heading case
  prefKey: string;                      // which remembered-member field
  isMember(toolId: string): boolean;    // ONE predicate feeds current + active
  /** geo-style tool+variant resolution hook (the only family whose members
      aren't 1:1 with tool ids). */
  variantOf?(activeToolId: string, activeVariant: string | undefined): string | undefined;
  footer?: ReactNode;                   // the Callout-leader row — host-owned content
}
export interface ToolDockProps {
  activeToolId: string; activeVariant?: string;
  families: readonly FamilyDeclaration[];
  simpleTools: readonly (ToolItem & { active: boolean; disabled?: boolean;
    disabledTitle?: string; onSelect(): void })[];
  preferences: Readonly<Record<string, string>>;          // prefKey → remembered id
  onPreferencesChange(next: Record<string, string>): void; // controlled; storage host-side
  onArm(toolId: string): void;          // press arms the remembered member
  onSelectItem(toolId: string): void;   // row click
  librarySlot?: { title: string; eyebrow?: string; children: ReactNode;
    open: boolean; onOpenChange(open: boolean): void };
  testIdPrefix?: string;
}
export function ToolDock(props: ToolDockProps): ReactNode;
export function resolveCurrentTool(family: FamilyDeclaration, activeToolId: string,
  activeVariant: string | undefined, remembered: string | undefined): string;
```

One family declaration replaces the donor's six disjoint edit sites; the
BboxFamilySlot one-predicate form is the template, the 27-line ternary chain is
the failure mode not carried over. Split-press contract preserved verbatim:
`onArm` fires from pointerdown (button 0) and from click (detail 0) so
"pointer activation already happened before the menu opened, which lets the
menu keep focus and preserve one-press Escape." The
press-tile-then-draw-immediately promise ships as a documented hook only: the
trigger exposes stable `data-state="open"` + `data-bbox-family-open`; the
capture-layer CSS is the host's, with the donor WHY quoted in the docs. No
measured overflow — a plain wrapping row (see §7).

**`chromeBar.tsx`** — the top-left bar (screenshot: burger · back/forward ·
breadcrumb · draft chip · depth badge).

```ts
export interface Crumb { id: string; name: string; isCurrent: boolean;
  canFocus: boolean; depth: number }
export interface MenuAction { id: string; label: string; icon?: ReactNode;
  shortcut?: string; disabled?: boolean; destructive?: boolean; run(): void }
export interface MenuGroupSpec { id: string; label?: string;
  items: readonly (MenuAction | { submenu: MenuSpec })[] }
export interface MenuSpec { id: string; label: string; groups: readonly MenuGroupSpec[] }
export type StatusTone = "ok" | "pending" | "error";
export interface ChromeBarProps {
  menu: MenuSpec;                                   // burger, declarative
  history: { canGoBack: boolean; canGoForward: boolean;
    onBack(): void; onForward(): void };
  identity: { title: string; statusTone: StatusTone; statusLabel: string;
    path?: string };
  rename: { active: boolean; onBegin(): void; onCommit(next: string): void;
    onCancel(): void; error?: string | null; busy?: boolean };
  crumbs: readonly Crumb[]; depth: number;
  onReturnToRoot(): void; onJumpToLevel(id: string): void;
  fileActions: readonly MenuAction[];               // ONE list → dropdown AND context menu
  draftChip?: ReactNode;                            // <BranchChip/> slot
  container?: HTMLElement | null; popupClassName?: string;
  testIdPrefix?: string;
}
export function ChromeBar(props: ChromeBarProps): ReactNode;
export function StatusDot(props: { tone: StatusTone; label: string }): ReactNode;
```

`FileAction`-shape (donor TitleBar.tsx:163-181) generalized to nest; one list
renders both menus so they cannot drift. `data-active` on the chip stays a
**presence test** (`isDraftMode || undefined`, never `"false"`). Breadcrumb
truncation keeps the raw name on `title` (truthful rendering — every label goes
through the ported `storedTextOr` idiom).

**`branchChip.tsx`** — the draft selector (screenshot: GitBranch + "Draft 1" +
badge + chevron; popover with Main row, rows, New draft).

```ts
export interface DraftSummary { id: string; name: string; secondaryLabel: string }
export interface BranchChipProps {
  isDraftMode: boolean; draftCount: number; activeDraftName: string | null;
  drafts: readonly DraftSummary[]; activeDraftId: string | null;
  onSwitchTo(id: string | null): void; onCreate(): void;
  onRename(id: string, name: string): void; onDiscard(id: string): void;
  renderTrigger?: (state: { isDraftMode: boolean; draftCount: number;
    activeDraftName: string | null }) => ReactElement;   // the proven re-skin seam
  container?: HTMLElement | null;
}
```

Keeps: two-step "Discard?" confirm resetting on blur; hover-revealed row
actions; the explicit `aria-label={`${name}, ${secondary}`}`; `secondaryLabel`
computed host-side (the baseLabel-fabrication guard is drafts semantics).

**`panelShell.tsx`** — the right-panel frame (screenshot: RIGHT PANEL / Frames /
×). `{ eyebrow?: string; title: string; onClose(): void; hideHeader?: boolean;
children; "data-surface"?: string }`. Fills its given box; header ownership is a
prop, not a stylesheet-sniffed attribute (the inspector's headerless-column
lesson, SystemSketchChrome.tsx:1156-1164, kept as the prop's WHY).

**`framesPanel.tsx`** — panel content (screenshot: Frames list, thumbnails,
grip, ⋯ menu, Save view form).

```ts
export interface PanelPreviewBox { x: number; y: number; w: number; h: number }
export interface FramesItem { key: string; kind: string; label: string;
  preview?: { viewport: PanelPreviewBox; shapes: PanelPreviewBox[] };
  caption: string }
export interface FramesPanelProps {
  items: readonly FramesItem[];
  kinds: Readonly<Record<string, { icon: ReactNode; caption: string }>>; // fixes "EXPANDED-BLOCK"
  mode: "cards" | "list"; onModeChange(mode: "cards" | "list"): void;
  readOnly?: boolean; reorderLocked?: boolean; landmarksLocked?: boolean;
  notices?: readonly string[];
  onFocus(key: string): void;
  onRename(key: string, next: string): Promise<{ ok: boolean; reason?: string }> |
    { ok: boolean; reason?: string };            // reasons travel as data
  onDelete?(key: string): void;
  saveView?: { suggestedName: string; onSave(name: string):
    { ok: boolean; reason?: string } };
  reorder?: { onMove(sourceKey: string, targetKey: string,
    position: "before" | "after"): void;
    dragging?: string | null; dropTarget?: { key: string; position: "before" | "after" } | null;
    dragHandleProps?(key: string): React.HTMLAttributes<HTMLElement> };  // host bolts on DnD
}
```

`PanelPreview` (the SVG thumbnail with its fit math, min-2px shape rule, and
circle-plus empty mark) ships as its own export — it was already props-in.
Native `<details>` ⋯ menu and the hand-rolled view menu are replaced by
`DropdownMenu` (dismissal for free). Rendered one-statement-per-line density
does not port — re-expressed readably.

**`problemsPanel.tsx`** — panel content (screenshot: Problems, filters, rows) +
the badge.

```ts
export interface Severity { id: string; label: string; glyph: string; tone: string }
export interface Diagnostic { id: string; code: string; severity: string;
  message: string; detail: string }
export interface DiagnosticGroup { id: string; label: string;
  diagnostics: readonly Diagnostic[] }
export interface ProblemsPanelProps {
  groups: readonly DiagnosticGroup[];
  counts: Readonly<Record<string, number>>;
  severities: readonly Severity[];             // config, not hardcoded 3
  filter: string; onFilterChange(next: string): void;
  onActivate(d: Diagnostic): void;
  emptyCopy?: { clear: [string, string]; filtered: [string, string] };
  testIdPrefix?: string;
}
export function ProblemsPanel(props: ProblemsPanelProps): ReactNode;
export function ProblemsBadge(props: { count: number }): ReactNode; // 99+ clamp
```

`BoardDiagnosticsView` was already the pure surface — this is a widen-and-rename
(codes → `string`, group label rendered from data instead of the hardcoded
"Board"). Row a11y strings pinned by the ported test
(`${severity}: ${message}. ${detail}`; fixed reveal `title`). The pressed filter
keeps the inset accent BAR (accent-on-soft copy is ink, never accent text —
the measured 2.6-4.3:1 contrast rule travels as a comment).

**`statusStrip.tsx`** — bottom-right cluster (screenshot: frames / ⚠ 99+ /
zoom / dev / help segments).

```ts
export interface StatusStripItem { id: string; icon: ReactNode; label: string;
  badge?: string | number; indicator?: "success" | "warning" | "danger";
  active?: boolean; onSelect(): void; controlsId?: string }
export function StatusStrip(props: { items: readonly StatusStripItem[];
  children?: ReactNode /* readout slot, e.g. host zoom menu */ }): ReactNode;
```

Segmented hairline treatment, first/last rounding, `overflow: visible` for the
badge/indicator — all in the component's own CSS, no `.tlui-*` selectors.

**`historyList.tsx`** — the compare rail + inspector History (donor
HistoryList.tsx was already props-in/DOM-out; port with `testidPrefix` kept and
`import './history.css'` re-expressed in Tailwind).

**`propertyTable.tsx`**, **`codeView.tsx`** — the Compare detail bodies. Ports
of the already-pure components; the element-list resize handle keeps its
pointer-capture drag (it measures only its own track — panel-internal, allowed)
with DEFAULT/MIN/MAX widths and their measured WHYs.

**`compareReview.tsx`** — the headless compare body (screenshot: Compare changes
modal minus the modal).

```ts
export interface CompareReviewProps {
  comparison: BoardCompare | null;
  versions?: readonly HistoryRecord[]; selectedVersionId?: string | null;
  onSelectVersion?(id: string): void;
  sourceNote?: { beforeLabel: string; afterLabel: string }; // explicit-source form
  problem?: string | null;                                  // the amber notice, as data
  renderBefore(slot: { highlight: CompareChange | null; label: string }): ReactNode;
  renderAfter(slot: { highlight: CompareChange | null; label: string }): ReactNode;
  selectedChangeId: string | null; onSelectChange(id: string | null): void;
  onFrameChange?(change: CompareChange | null): void;  // host cameras; ONE rule
  mode: "side-by-side" | "overlay"; onModeChange(m: CompareReviewProps["mode"]): void;
  blend: number; onBlendChange(pct: number): void;
  canOverlay?: boolean;            // overlay only means anything with linked cameras
  fullscreen: boolean; onFullscreenChange(next: boolean): void; // host promotes; data-attr only
  onStageShapeChange?(shape: string): void;  // replaces the 140/420ms timers — WHY kept
  dock: "right" | "bottom"; onDockChange(d: "right" | "bottom"): void;
  tab: "properties" | "code"; onTabChange(t: CompareReviewProps["tab"]): void;
  layout: "figma" | "columns"; gitHighlight: boolean;   // both live A/Bs travel
  action?: { label: string; confirmLabel(n: number): string;
    onConfirm(): Promise<{ ok: boolean; reason?: string }>; blockedReason?: string };
  review?: { rejectedIds: ReadonlySet<string>; onToggleReject(id: string): void;
    noteFor?(rejectedCount: number): string };
  container?: HTMLElement | null; testIdPrefix?: string;
}
```

No Dialog, no fixed positioning, no z-index — a thin host modal wraps it. The
tab strip uses the trunk's own `tabs.tsx` ("Very important that we are
consistent with what tabs look like" — satisfied by reusing the kit primitive,
not by vendoring 40 lines of another stylesheet).

**`draftBar.tsx`** — the draft-mode title bar (screenshot: ← Exit | Draft 2 ···
⚠ banner | Compare 0 Changes | Merge ▾).

```ts
export interface DraftBarProps {
  draftName: string;
  onExit(): void;
  rename: { onCommit(next: string): void; validate?(n: string): string | null };
  overflowItems: readonly MenuAction[];        // Discard lives here; slot, not hardcoded
  conflict?: string | null;                    // banner text; truncation contract built in
  status?: string | null;                      // controlled; host owns the 5s expiry
  changeCount: number; onCompare?(): void;     // undefined disables the button
  canMerge: boolean;                           // DELIBERATELY separate from changeCount —
                                               // compareBoards can't see a pure move
  onMerge(): void;
  mergeState?: "normal" | "disabled" | "blocked";
  mergeMenuItems: readonly { id: string; label: string; onSelect(): void }[]; // Rebase
}
```

### 3.4 Stories (the review surface)

One variant-gallery story per surface, plus **`controlLab.stories.tsx`**: the
menuLab ports as a Storybook story — `menuLabModel.ts` (388 pure lines, its only
import is the registry) becomes the story's model verbatim, driving levers ×
live composed pill × recipe-literal readout (`labRecipeSource`) × dangling
warning. The standalone `?menu-lab` route and Settings embedding do not travel;
the story is the single entry point. `LabState.popoverMode` collapses to the
popover `autoFocus`/`container` props.

---

## 4. The host contract

Everything a host must supply, per surface. This is the complete list — if a
future host can satisfy it, "any host" is true.

**Universal (every popup-bearing component):**
- `container?: HTMLElement | null` — portal target inside the host's token
  scope. Replaces both `document.querySelector('.systemsketch-theme-root')`
  sites. Omitted → document body.
- `popupClassName?` / host CSS on `[data-slot=…]` — stacking/z-order. The kit
  ships **zero z-index**; the host owns layering (the drafts-bar
  `--systemsketch-layer-modal` lesson is the doc example).
- `autoFocus?: boolean` on popover-bearing surfaces — pass `false` while a live
  text editor must keep focus (the pill's editing mode).
- `onPanelPointerDownCapture?` — the "this pointer event is mine" seam
  (tldraw's `editor.markEventAsHandled`, or nothing).
- Theme: the kit styles against trunk Tailwind tokens; the 13
  `--systemsketch-pill-*` names survive as optional `--bbox-pill-*` overrides
  scoped at the host root (popovers portal out of the pill's subtree — the
  app-root scoping requirement is documented).
- `testIdPrefix?: string` — no test id derived from display text.

**Floating toolbar:** host runs the loop the kit refuses to own:
1. measure the rendered toolbar (`ref` → ResizeObserver / getBoundingClientRect),
2. read selection + viewport rects in screen space from its engine,
3. call `placeFloatingToolbar({selection, menu, viewport, bottomObstacleTop?,
   overlayInset})` — overlayInset now REQUIRED (its 5px default was measured
   against tldraw's handles),
4. gate on its own `isManipulating` (translating/resizing/brushing → hide),
5. guard async placement with a monotonic pass counter (the donor's
   `placementPass` — an async computePosition can resolve out of order onto a
   detached node; WHY documented),
6. re-run on camera change, size epoch, interface-scale change; pass
   `maxWidth = floatingToolbarMaxWidth(viewport, scale)` and mirror the same
   scale into its CSS (two-place invariant, kept unit-testable),
7. attach wheel pass-through to the `ref` if its engine needs it (the kit wraps,
   never scrolls, so redispatch hooks stay safe).

**Control kit:** host writes the binder — `bindControl(kind, {id, value,
onSelect, …})` per candidate, values **recomputed per render** (no signals: the
kit takes data, not thunks); `resolveSwatchHex`/palette hexes; recipes as app
data; `restructureForV1Cluster`-style candidate preconditions stay host-side and
must be expressed next to the recipe that requires them (the donor's
recorded-lost-`lineShape` lesson). `hostTag` branching (how to WRITE a value)
lives entirely in the binder.

**Tool dock:** `activeToolId`/`activeVariant` from the engine;
`families`/`simpleTools` data with `icon: ReactNode` (no string icon registry);
`preferences` + `onPreferencesChange` with storage host-side (localStorage,
file, nothing); actual keybindings (the hints are display-only and this split
is documented so they cannot silently drift — except arrow-style derived hints,
which stay derived); the click-capture escape hatch CSS; the family `footer`
content and its selection predicate.

**Chrome bar:** `crumbs`/`depth`/`canGoBack`/`canGoForward` as plain data;
`onBack`/`onForward`/`onReturnToRoot`/`onJumpToLevel`; global gestures (F2,
mouse buttons 3/4, BrowserBack/Forward keys) wired host-side onto the same
callbacks — with the donor's measured note that only `mouseup` reliably cancels
button navigation in Chrome; identity data + rename/save/copy/reveal/trash
callbacks (confirm dialogs and toasts are host's); clipboard.

**Panels:** models as props (`items`+`previews`, `groups`+`counts`); every
mutation as a callback returning `{ok, reason}` so validation feedback travels
as data; drag gesture (dnd-kit, HTML5, or nothing) bolted onto
`dragHandleProps`/`dragging`/`dropTarget`; open/close state (the donor's
`reduceChromeState` LRU reducer is offered as a **recipe in the docs**, not a
kit export — it is 60 pure lines a host copies, with the Escape-exemption
policy as its parameter).

**Compare:** `comparison` computed host-side (via the ported pure
`compareBoards` over structural records, or any other diff), snapshots and
version discovery host-side; both pane renderers; camera framing + linking
(overlay blend only means anything with linked cameras — `canOverlay` gates
it); the modal wrapper, Escape policy, and fullscreen promotion (kit emits
`data-fullscreen` and `onStageShapeChange`; host restyles and re-frames —
no timers in the kit).

**Draft bar:** all nine props above; the Compare/Merge/Rebase orchestration
(~130 donor lines) is host code; status expiry is host's.

**Status strip:** item list with active flags + callbacks; the zoom readout as
`children`; panel-open bookkeeping.

---

## 5. Stock-part mapping table

| Element | Today in SystemSketch | Off-the-shelf part (exact exported name) | Behaviour that must survive |
|---|---|---|---|
| Popout/dropdown menus (file menu, family popouts, ⋯ menus, Merge▾ menu) | `toolbar/SystemSketchToolbar.tsx:245-300` (Radix + TldrawUi dropdown), `drafts/DraftModeBar.tsx:63-99` (hand-rolled) | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuShortcut`, `DropdownMenuSub*` (trunk `dropdown-menu.tsx`, existing) | One-press Escape; menu keeps focus after pointer-arm; check column; kbd hints as display data; Group above every GroupLabel (crash guard) |
| Roving-focus bar container (pill, bottom dock, top-left bar) | `chrome/SelectionContextualMenu.tsx:214` (`TldrawUiToolbar`), `chrome/TitleBar.tsx:391-399` (Base UI `Toolbar.Root` already) | `Toolbar.Root`, `Toolbar.Group`, `Toolbar.Button`, `Toolbar.Separator` from `@base-ui/react/toolbar` via new `toolbar.tsx` | Roving tabindex + arrow keys + `loopFocus`; ArrangeControls' plain buttons regain roving focus by living inside the kit Toolbar; `orientation` |
| Popover positioning incl. canvas-anchored | `contextualMenus/ContextualControls.tsx:514-573` (dual tldraw/Radix), `chrome/floatingToolbarPlacement.ts` consumers | `Popover.Root/Trigger/Portal/Positioner/Popup` from `@base-ui/react/popover` via new `popover.tsx`; `anchor` accepts Floating UI `VirtualElement` | `side`/`align`/`sideOffset`/`collisionPadding` per surface; no first-button autofocus in editing mode; portal into host token scope; **one** popup engine replaces two |
| Canvas-anchored dropdown/tooltip | not possible today in trunk (`dropdown-menu.tsx:34` Pick omits `anchor`) | widen existing `DropdownMenuContent`/`TooltipContent` Picks with `"anchor" | "container" | "collisionPadding"` | Adds-only: all current consumers unchanged |
| Right-click menu | `chrome/TitleBar.tsx:275-338` (`components/ui/context-menu.tsx`, app-local) | `ContextMenu*` from `@base-ui/react/context-menu` via new `context-menu.tsx` (shadcn base-nova copy) | Rename hoisted to top; one `MenuAction[]` feeds dropdown AND context menu so they cannot drift; `display:contents` dual-trigger nesting |
| Segmented toggles (view mode, filters, density, table layout) | `compare/CompareDialog.tsx:848-869`, `diagnostics/BoardDiagnosticsPanel.tsx:119-137` (hand-rolled `role=group`) | `ToggleGroup`, `ToggleGroupItem` (port of `packages/inspector/src/components/ui/toggle-group.tsx`, Base UI, keeps `spacing`) | `aria-pressed`; selected = accent BAR/tint, copy stays ink (contrast rule) |
| Back/forward pair | `chrome/TitleBar.tsx:411-438` (shadcn ButtonGroup, app-local) | `ButtonGroup`, `ButtonGroupSeparator` (shadcn base-nova copy) | disabled from `canGoBack`/`canGoForward`; destination-named tooltips |
| Breadcrumb path | `chrome/TitleBar.tsx:443-570` (shadcn, app-local) + `depth/depthBreadcrumbs.ts` | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator` (base-nova copy) + ported `compactDepthBreadcrumbs` | Character-budget elision never dropping the last two; `…` is a real menu of hidden levels; ellipsis on inner span; full name on `title` (truthful rendering) |
| Detail tabs (Properties/Code) | `compare/CompareDialog.tsx:43` importing 1629-line `block-inspector.css` for 40 lines | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@base-ui/react/tabs` via new `tabs.tsx` | "Consistent with what tabs look like" — satisfied by one kit tab primitive everywhere |
| Split button (Merge ▾) | `drafts/DraftModeBar.tsx:123-180` hand-rolled | new `SplitButton` composing existing `Button` + `DropdownMenu` | Three states: normal / `data-disabled` / `data-blocked` (chevron keeps accent to point at Rebase); two independent targets in one pill |
| Bold toggle ("B"), tool-pressed states | `contextualMenus/ContextualControls.tsx:100-116` | `Toggle` (trunk `toggle.tsx`, existing) | `aria-pressed`; accent fill when pressed |
| Count badges (drafts, depth, problems 99+) | `chrome/TitleBar.tsx:463-499, 572-623`, `SystemSketchUtilities.tsx:687-691` | `Badge` (trunk `badge.tsx`, existing) | tabular-nums; render only when count > 0; `count > 99 ? "99+"` clamp |
| Tooltips | tldraw `title` attrs + app tooltip | `Tooltip`, `TooltipTrigger`, `TooltipContent` (trunk, existing; Pick widened) | Dock toggle names the DESTINATION, not the state |
| Icons in menus/bars | tldraw string icon names + vendored excalidraw/figjam sets | `lucide-react` named exports; every `icon` prop is `ReactNode` | No string→asset registry; a host passes elements |
| Control-preview glyphs (fill, dash, size, font, align, routing, arrowhead) | `appearance/AppearanceGlyph.tsx:330-506` (drawn, already editor-free except swatch) | **ours, ported** into `controlGlyphs.tsx` — no stock part draws these | `GLYPH_FAMILIES` is a Record lookup, never an if-chain; swatch hex resolution injected; host extends by spreading |
| Floating-pill placement math | `chrome/floatingToolbarPlacement.ts:1-343` | **unchanged (ours over stock)** — ports verbatim; only dep `computePosition`/`offset` from `@floating-ui/core` | Flip-not-clamp; `isSelectionOnScreen` = intersection not midpoint; `/scale` on the whole max; 4,608-case differential test rides along |
| Popup positioning engine | Base UI's vendored Floating UI | **unchanged (stock seam)** — reached only through Positioner props, never imported raw | — |
| Size cascade | n/a (bbox invention) | **unchanged (stock seam)**: `BarSizeProvider`, `useBarSize`, `BAR_SIZE_TO_*` maps (trunk `barSize.tsx`) | One `size` on `Bar` drives buttons/toggles/badges in every new bar |
| Three-slot bar layout | n/a (bbox invention) | **unchanged (stock seam)**: `Bar` (trunk `bar.tsx`) | `Toolbar` composes INSIDE a Bar slot, never replaces it — the computed grid template rationale stands |
| Existing trunk parts (`button`, `collapsible`, `editableText`, `text`, `foldingChevron`, `dropdown-menu` body, `tooltip` body) | trunk | **unchanged (stock seam)** apart from the two one-word Pick widenings | All current stories/consumers untouched |
| Control registry / recipe / resolver / folds / lab model | `contextualMenus/contextualControlRegistry.ts`, `sharedValues.ts`, `prototypes/menuLab/menuLabModel.ts` | **ours, ported** (`controlRegistry.ts`, `controlValue.ts`, story model) — prior art cited (VS Code menus contribution; Tweakpane accept-chain), no installable equivalent exists | Vocabulary law; silent-drop + empty-group elision (+ new dev `onDangling` warning); binding cannot overwrite `kind`; A-badge `undefined===undefined` guard; recipe-only composition pinned by ported tests |
| Diff engines (word, line, object) | `diff/wordDiff.ts`, `compare/lineDiff.ts`, `compare/compareModel.ts` | **ours, ported byte-for-byte** with donor file:line provenance headers; `BlockPort` inlined structurally | "No React, no DOM and no colour"; `added` rows have no `previous` KEY at all; stableJson ordering; token/context/elision constants |
| Inline rename fields | `chrome/SystemSketchUiInput.tsx` (wraps `TldrawUiInput`), two hand-rolled editors | kit `InlineRename` over native input + existing `editableText.tsx` where rich editing is needed | Enter/Escape(+stopPropagation)/blur contract; 400ms double-click guard; empty → "Give this draft a name."; focus returns to trigger |
| Panel scroll regions | `overflow-y: auto` + `overscroll-behavior: contain` CSS | plain CSS (**deliberately not** shadcn `scroll-area`) | overscroll containment; no wheel leak to canvas is the HOST's listener |

---

## 6. Build order

Write sets are relative to `apps/storybook-basics/src/`. Rules applied:
adds-only lanes with disjoint files run parallel; a lane editing a file others
import is a barrier; `registry.json` has one owner (the orchestrator).

**Wave 0 — barrier (contract files everything imports; land first, alone).**
- **Lane A** — write set: `components/toolbar.tsx`, `components/popover.tsx`,
  `components/separator.tsx`, EDITS to `components/dropdown-menu.tsx` and
  `components/tooltip.tsx` (Pick widening only). Rationale: every later lane
  imports these; the two edits touch shared contracts.

**Wave 1 — parallel, adds-only, disjoint.**
- **Lane B (primitives batch)** — `components/context-menu.tsx`,
  `components/button-group.tsx`, `components/breadcrumb.tsx`,
  `components/toggle-group.tsx`, `components/tabs.tsx`,
  `components/splitButton.tsx`, `components/inlineRename.tsx` + one story each.
- **Lane C (control data)** — `components/controlValue.ts`,
  `components/controlRegistry.ts`, `components/controlGlyphs.tsx`,
  `components/controlValue.test.ts`, `components/controlRegistry.test.ts`
  (ported acceptance: 387 donor test lines commit BEFORE rendering exists).
- **Lane D (placement)** — `components/floatingToolbar.placement.ts`,
  `components/floatingToolbar.placement.test.ts` (the 4,608-case differential
  suite; declares `@floating-ui/core` — orchestrator batch-installs).
- **Lane E (pure models)** — `components/breadcrumbCompact.ts`(+test),
  `components/toolPreferences.ts`(+test), `components/framesOrder.ts`(+test),
  `components/historyTime.ts`, `components/wordDiff.ts`(+test),
  `components/lineDiff.ts`, `components/propertyRows.ts`,
  `components/compareModel.ts`(+test).

**Wave 2 — parallel surfaces (import waves 0-1; disjoint files).**
- **Lane F (control renderer)** — `components/controlStrip.tsx`,
  `components/controlPanel.tsx`, `stories/controlStrip.stories.tsx`,
  `stories/controlLab.stories.tsx` (menuLab model verbatim as the story).
- **Lane G (floating shell)** — `components/floatingToolbar.tsx`,
  `stories/floatingToolbar.stories.tsx` (fake host: scripted selection rects
  driving the pure placement).
- **Lane H (tool dock)** — `components/toolDock.tsx`,
  `stories/toolDock.stories.tsx`.
- **Lane I (chrome bar)** — `components/chromeBar.tsx`,
  `components/branchChip.tsx`, `stories/chromeBar.stories.tsx`.
- **Lane J (panels + strip)** — `components/panelShell.tsx`,
  `components/framesPanel.tsx`, `components/problemsPanel.tsx`,
  `components/statusStrip.tsx`, + stories.
- **Lane K (compare bodies)** — `components/historyList.tsx`,
  `components/propertyTable.tsx`, `components/codeView.tsx`, + stories.
- **Lane L (draft bar)** — `components/draftBar.tsx`, story.

**Wave 3 — dependents + the shared-file barrier.**
- **Lane M (compare assembly)** — `components/compareReview.tsx`,
  `stories/compareReview.stories.tsx` (imports K + tabs + toggle-group).
- **Lane N (registry, orchestrator-owned, last, alone)** — EDIT `registry.json`
  (one item per component, sibling-rule targets: `components/bbox/*`,
  `lib/utils.ts` → `components/lib/utils.ts`), run `npx shadcn@latest build`,
  then throwaway-install + `tsc` (the check that caught TS2307 last time —
  build exit 0 proves nothing).

Verification per lane: `pnpm test-stories` (never `storyRenders`), plus the
lane's own vitest files. Spatial claims measured, not DOM-presence-asserted.

---

## 7. Deliberately left out

- **A VS Code-style command registry** (`CommandDef` + `MenuItemDef` +
  `when`/`group@order` + `resolveMenu`). In a copy-paste kit the consumer owns
  the JSX file; nothing today needs contribute-without-editing. Reversible:
  ~150 lines on top of the same compound parts, plus the unquoted-when-literal
  unit check, the day a plugin-shaped host exists.
- **Measured overflow toolbar** (tldraw's `OverflowingToolbar`: children
  rendered twice, ResizeObserver + MutationObserver whose `attributeFilter`
  broke twice upstream). Self-measurement is banned anyway. Ship wrapping bars;
  revisit only when a real surface overflows.
- **`CustomColorPicker`** — a separate port project (history stopping points,
  undo keybindings, retire-as-you-drag registration). `controlPanel` exposes
  `customColorSlot` so it can land later without touching the panel.
- **A rich-text toolbar component** — none exists in SystemSketch (55 lines of
  CSS over tldraw's own toolbar, deliberately). Building one is a product
  decision, not a port. The `ControlStrip` could be re-aimed at rich-text
  commands later; noted, not built.
- **`Menubar`** — no surface in the screenshots is a horizontal menubar; the
  burger is a `DropdownMenu`. shadcn's menubar recipe (parts typed as
  `ComponentProps<typeof DropdownMenu*>`) makes this a cheap later add.
- **FigJam palette, FigJam traced icons, vendored Excalidraw icons as kit
  data** — palette/language vocabularies are injected by design; the traced
  assets carry unresolved provenance questions and are SystemSketch product
  taste. Stories use a small demo palette.
- **`draftModel.ts` state reducers** — pure and tested, but they are
  SystemSketch's localStorage branching bookkeeping. The kit ships the
  `DraftSummary` prop shape only; a git-backed host would never use the model.
- **Persistence of any kind** (toolbar preferences, density toggle, pill
  presentation). Everything is controlled props; storage is a documented
  host-adapter recipe carrying "Preferences are helpful feedback, never a
  reason to block drawing."
- **The modal/dialog wrapper for Compare** and all `position:fixed` /
  `z-index` — host-owned by the trunk's law.
- **Virtualization** in ProblemsPanel/FramesPanel — 175 plain rows today;
  add a windowing slot only when a real board hurts.
- **`chromeState` reducer as a kit export** — offered as a documented 60-line
  recipe instead (it is host chrome policy: LRU Escape order, exemptions).
- **cmdk command palette** — future surface; composes inside a kit Popover when
  wanted.
- **`compareSource.ts`** — superseded in the donor; confirmed not ported.

---

## 8. Open decisions (each with the reversible default I will take on silence)

1. **Open vs closed control kinds.** Recommendation: generic
   `createControlRegistry<K extends string>` — the app closes the union, the
   kit stays open; `Record<K, Definition>` keeps exhaustiveness where the app
   wants it. Default: generic factory (an app can pin `K` later at zero cost).
2. **Does the object diff engine ship?** Recommendation: yes — `compareModel.ts`
   is pure over structural `RecordLike` and its fixture tests are the spec;
   a host with a different graph model simply doesn't import it. Default: ship.
3. **Does `mixed` belong in a general kit?** Recommendation: yes —
   `ControlValue<T>` three-state is the essence of multi-selection property
   editing; single-subject hosts just never pass `mixed`. Default: keep.
4. **Which pill recipes travel?** Recommendation: none as kit exports — recipes
   are app data; stories carry demo recipes (V3-segmented as the default story,
   V1-compact as a lab variant, since V3 is the shipped default). Default:
   stories only.
5. **Problems `info` severity.** Recommendation: severities become config; the
   demo config mirrors SystemSketch (error/warning chips, info counted only) so
   the port changes nothing visibly. Default: parity.
6. **Group header label.** Recommendation: render the group's own `label`
   (fixing the hardcoded "Board" and the raw "EXPANDED-BLOCK" caption via the
   `kinds` map). Default: render from data — SystemSketch's adapter can pass
   "Board" to keep parity.
7. **Silent drop in `composeControls`.** Recommendation: keep the drop (it is
   load-bearing for optional slots) and add `onDangling` firing a dev-mode
   `console.warn`. Default: warn in dev, silent in prod.
8. **Thumbnail aspect from current window size** (donor
   `getFramesPanelPreviews` quirk). The kit takes `preview` as data so the
   question stays host-side; flagged for Zach in the adapter notes. Default:
   preserve current behaviour in the SystemSketch adapter.

---

## 9. WHYs preserved — the checklist

Named tastes this design keeps, and where: the vocabulary law
(`controlRegistry.ts` header) · A-badge guard (`isAutomaticSelection`) ·
binding-cannot-overwrite-kind (`bindControl`) · empty-group separator elision
(`composeControls` + strip) · wrap-never-scroll + max-width mirror
(`controlStrip`/`floatingToolbar` + `floatingToolbarMaxWidth`) ·
intersection-not-midpoint (`isSelectionOnScreen`) · flip-not-clamp placement
(the ported module + differential test) · popovers stay open on select
(`closeOnSelect=false` default, `controlPanel`) · press-arms-then-menu-keeps-
focus (`toolDock` `onArm` contract) · press-tile-then-draw hook
(`data-bbox-family-open` + documented host CSS) · derived arrow press-count
hints (`toolPreferences.ts`) · "preferences never block drawing" (host adapter
recipe) · elbow-is-the-datum as a host-stated default (`ToolDockProps.preferences`
initial value) · one FileAction list for both menus (`chromeBar`) ·
`data-active` as presence test (`branchChip`) · truthful rendering / `title`
on every truncation (all bars/panels) · accent-on-soft copy is ink
(`toggle-group`, `problemsPanel`) · "a formatting choice is part of editing"
(`onApplied` seam noted on the title-formatting binder recipe) · header
ownership prop with the headerless-column story (`panelShell.hideHeader`) ·
one-derivation preview projection ("not a subscription per row" — host adapter
doc) · conflict banner truncation contract (`draftBar`) · changeCount ≠
canMerge (two props, `draftBar`) · Escape-exemption-for-the-inspector policy
(chromeState recipe parameter) · monotonic placement pass (host contract §4).
