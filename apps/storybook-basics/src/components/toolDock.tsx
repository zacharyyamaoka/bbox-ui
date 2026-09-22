"use client";

/**
 * src/components/toolDock.tsx — `ToolDock`: the bottom Figma-style tool bar
 * (docs/menus/screenshots/04-bottom-tool-toolbar.png).
 *
 * Ported behavior — resolution rule, split-press arming, the
 * press-tile-then-draw hook — from
 * /home/bam/systemsketch/src/toolbar/SystemSketchToolbar.tsx:245-469
 * (`FamilyToolSlot` + its four call sites: `ShapeFamilySlot`,
 * `SystemFamilySlot`, `BboxFamilySlot`, `DrawFamilySlot`) and
 * /home/bam/systemsketch/src/toolbar/toolbarModel.ts (the preferences shape
 * those four slots read). Markup and every DOM primitive underneath is NEW:
 * the donor composes tldraw's `TldrawUiToolbarButton` +
 * `TldrawUiDropdownMenu*` (Radix-backed, editor-owned chrome); this composes
 * the kit's own `Toolbar`/`ToolbarButton` (toolbar.tsx, over
 * `@base-ui/react/toolbar`) and `DropdownMenu*` (dropdown-menu.tsx, over
 * `@base-ui/react/menu`) — no tldraw import, no editor.
 *
 * The design's key move (docs/menus/MENU-KIT-DESIGN.md §3.3): the donor
 * hand-edits SIX places to add a family (a `*FamilyTool` union + validation
 * array in toolbarModel.ts, a `*_MENU_ITEMS` table, a `*FamilySlot`
 * component with its own bespoke "what's current" ternary chain, an entry
 * in `SystemSketchFigmaToolbar`'s JSX, a `select*FamilyTool` integration
 * function, and a `remember*Tools`/`overrideTools` preference-writing
 * wrapper) — a host here declares ONE `FamilyDeclaration` object per family
 * and `resolveCurrentTool`/`isFamilyActive` below replace every one of the
 * four bespoke ternary chains with a single generalized rule, run per
 * family, testable with no rendering at all.
 */

import type { ReactNode } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "./toolbar";

/**
 * The dock's tool-cell height, px — the one number behind Zach's 4K
 * complaint, 2026-09-20: "All of the scalling of everyhing feel just a bit
 * off right now... Compare the chrome size though to the same screen in
 * exali draw or tldraw... Feels like by default needs to be bigger."
 *
 * MEASURED from his own three screenshots, same window, CSS px: tldraw.com's
 * active tool cell is 44 x 44, Excalidraw's is 40 x 40, this dock's was
 * 36 x 32 — 73% of tldraw and 80% of Excalidraw. FigJam's live trace
 * (/home/bam/systemsketch/docs/assets/figjam-chrome-traced.json) says every
 * real FigJam cell is 40px tall. Two of the three references say 40, so 40
 * is the cell, and `devicePixelRatio` was 1 throughout — this was a DEFAULT,
 * never a DPI bug.
 *
 * WHY the size is spelled here rather than by raising the `Bar` cascade:
 * `ToolDock` mounts a bare `<Toolbar>` with no `BarSizeProvider` above it, so
 * `useBarSize()` returns `undefined` and every cell falls through to
 * `ToolbarButton`'s "default" rung — `h-8` = 32px (toolbar.tsx:81,:91).
 * VERIFIED live in the running app before this change: every dock cell
 * rendered `data-size="default"` at 36 x 32 with a 16px glyph. The cascade
 * cannot express 40 either way — its top rung `xl` clamps down to `lg` = 36px
 * (barSize.tsx:79-84) — and growing that ladder moves every Bar consumer in
 * the trunk at once, which is its own unit of work, not this one.
 *
 * WHY the cell grows TALLER but not WIDER (36px wide, unchanged): the host
 * seats the bottom-right cluster (variant pill + status strip) between this
 * dock's right edge and tldraw's licence watermark
 * (apps/systemsketch/src/chrome/overlay.tsx, `placeCornerCluster`), and
 * MEASURED in the running app at 1400 x 900 there are exactly 13.89px of
 * clear canvas between dock right (870.5) and cluster left (884.39). A
 * 40-wide cell widens the dock by 32px — 16 of them on the right — which
 * pushes that row out of `beside-licence` into the `above-licence` fallback,
 * the placement Zach already rejected ("please move the right corner menu to
 * be truly in the right corner"). FigJam's own plain icon button is 32 x 40,
 * a cell taller than it is wide, so this is the donor's shape and not a
 * compromise invented to dodge the watermark.
 */
export const TOOL_DOCK_CELL_HEIGHT = 40;

/**
 * Applied to every cell in the dock — tools, family faces and the library
 * trigger alike — so the row has ONE height and one glyph size. `h-10`/`w-9`
 * override `ToolbarButton`'s own `h-8 px-2.5` through `cn`'s `twMerge`
 * (className is merged last), which is why this does not need the button to
 * grow a fourth rung.
 *
 * WHY the glyph moves with the height (16px -> 18px, tldraw's own icon size
 * inside its 40px chip): height and icon size are coupled. A 16px lucide
 * stroke adrift in a 40px box reads WORSE than today's 32px cell — it is the
 * "feels like tldraw stock" tell the parity spec calls out. `px-0` because
 * the width is now fixed; the glyph is centred by the button's own
 * `justify-center`.
 */
const TOOL_CELL_CLASS = "h-10 w-9 px-0 [&_svg:not([class*='size-'])]:size-[18px]";

/** One row inside a family's popout, or one always-visible dock cell. */
export interface ToolItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Display only — the kit renders it as a `kbd`-style hint; the HOST owns
      the real keybinding (MENU-KIT-DESIGN.md §4: "actual keybindings ...
      this split is documented so they cannot silently drift"). */
  shortcutHint?: string;
}

/** A named run of rows inside a family's popout (the donor's "Shapes" /
    "Arrows · repeat A to cycle" two-heading split under one Shape family). */
export interface ToolSection {
  heading?: string;
  items: readonly ToolItem[];
}

/**
 * One family, declared as data. Everything a `*FamilySlot` in the donor
 * hand-wrote per family — its member list, its "is this tool mine" check,
 * its "what's the shape-tool's live sub-variant" special case, its trailing
 * "Add leader to selected Callout" row — is a field here instead.
 */
export interface FamilyDeclaration {
  id: string;
  label: string;
  sections: readonly ToolSection[];
  /** Which key in `ToolDockProps.preferences` remembers this family's
      last-used member (toolbarModel.ts's `lastShapeTool` / `lastSystemTool` /
      `lastBboxTool` / `lastDrawTool`, generalized to a string key so the
      kit never hand-codes a family's name). */
  prefKey: string;
  /** Is this tool id one of MY members outright — i.e. does showing it
      as-is (no further resolution) correctly represent "the family's
      current tool"? True for `'block'`, `'line'`, `'draw'`; false for
      `'geo'` and `'arrow'`, which only ever name a FAMILY of shapes, never
      one shape. Feeds both `resolveCurrentTool` (case 1) and
      `isFamilyActive`. */
  isMember(toolId: string): boolean;
  /**
   * The donor's `ShapeFamilySlot` special case, generalized: some tools
   * (tldraw's `'geo'`) are a family in themselves, whose active MEMBER lives
   * in a separate live value (`GeoShapeGeoStyle`) rather than in the tool id
   * itself. Given the dock's `activeToolId` and `activeVariant`, return the
   * resolved member id, or `undefined` if this tool id isn't one this
   * family resolves through a variant at all. A family with no such tool
   * (Block, Draw) simply omits this hook.
   *
   * WHY the host may need to close over its OWN state here rather than this
   * being a pure lookup: the donor's arrow case
   * (SystemSketchToolbar.tsx:307, `if (activeToolId === 'arrow') current =
   * arrow-${preferences.lastArrowPreset}`) has no live "current arrow
   * preset" to read the way geo does — tldraw exposes no such style — so it
   * falls back to a REMEMBERED preset instead. A host with that same shape
   * closes over its own preferences object when building this function; the
   * kit does not need to know there are two different kinds of "variant".
   */
  variantOf?(activeToolId: string, activeVariant: string | undefined): string | undefined;
  /** The donor's "Add leader to selected Callout" row
      (SystemSketchToolbar.tsx:416-430) — content appended after a separator
      at the foot of this family's popout, entirely host-owned (it depends
      on canvas selection state the kit never sees). */
  footer?: ReactNode;
}

export interface SimpleToolItem extends ToolItem {
  active: boolean;
  disabled?: boolean;
  /** Shown instead of `label` while `disabled` (donor:
      `` `${title} is unavailable` `` default). */
  disabledTitle?: string;
  onSelect(): void;
}

export interface LibrarySlotProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export interface ToolDockProps {
  /** The engine's real current tool id (`editor.getCurrentToolId()` in the
      donor) — the ONE thing every family's resolution is driven by. */
  activeToolId: string;
  /** The live sub-variant of whichever tool is active, if it has one
      (donor: `GeoShapeGeoStyle`'s value while the geo tool is active).
      Meaningless for every family whose active tool isn't currently
      showing a variant-bearing id — those families' `variantOf` simply
      never returns anything for it. */
  activeVariant?: string;
  families: readonly FamilyDeclaration[];
  /** Cells with no popout at all (Cursor, Frame, Text in screenshot 04). */
  simpleTools: readonly SimpleToolItem[];
  /** `prefKey → remembered member id`, one entry per family. Controlled:
      the kit never reads or writes storage (MENU-KIT-DESIGN.md §7, "no
      persistence of any kind"); it only ever merges one key into what the
      host already gave it and hands the WHOLE object back. */
  preferences: Readonly<Record<string, string>>;
  onPreferencesChange(next: Record<string, string>): void;
  /** Fired the instant a family's face is pressed, with the tool
      `resolveCurrentTool` says that face is showing right now — "arm the
      remembered member" (MENU-KIT-DESIGN.md §9: "press-arms-then-menu-
      keeps-focus"). Never fired for a `simpleTools` row — those call their
      own `onSelect` directly. */
  onArm(toolId: string): void;
  /** Fired when a specific row inside a family's popout is picked. The kit
      already knows which `prefKey` that means for `onPreferencesChange`;
      the host only has to switch tools. */
  onSelectItem(toolId: string): void;
  /** The trailing "+" (screenshot 04's library trigger). Omitted entirely
      when the host has no library surface to show. */
  librarySlot?: LibrarySlotProps;
  testIdPrefix?: string;
}

/**
 * The resolution rule behind every family face, generalized from four
 * bespoke ternary chains (SystemFamilySlot's alone a 27-line if/else-if
 * ladder, SystemSketchToolbar.tsx:355-381) into one:
 *
 * 1. The active tool IS one of this family's own members
 *    (`family.isMember`) — show it as-is. Covers Block, Branch, Line, Draw,
 *    Highlight: every tool whose id already names exactly one shape.
 * 2. The active tool only NAMES a family of shapes and resolves through a
 *    separate live variant (`family.variantOf`) — show what that resolves
 *    to. Covers geo (`'geo'` + `GeoShapeGeoStyle`) and, if a host chooses to
 *    express it this way, arrow (`'arrow'` + a remembered preset the host's
 *    own `variantOf` closes over).
 * 3. Neither: this family isn't the active one at all — show the
 *    REMEMBERED last-used member, so the face still has a correct tool to
 *    arm on the next press.
 *
 * Pure and host-shape-agnostic: it knows nothing about tldraw, geo styles,
 * or arrow presets — every donor-specific fact lives inside the
 * `FamilyDeclaration` a host supplies, which is what makes this testable
 * with plain objects and no rendering.
 */
export function resolveCurrentTool(
  family: FamilyDeclaration,
  activeToolId: string,
  activeVariant: string | undefined,
  remembered: string | undefined,
): string {
  if (family.isMember(activeToolId)) return activeToolId;
  const variant = family.variantOf?.(activeToolId, activeVariant);
  if (variant !== undefined) return variant;
  return remembered ?? family.sections[0]?.items[0]?.id ?? activeToolId;
}

/**
 * Whether the LIVE tool belongs to this family at all — the face's
 * `aria-pressed` state. Split from `resolveCurrentTool` on purpose: that
 * function must always answer (a face keeps showing its last-used member
 * even while inactive), this one is only true while the engine's actual
 * current tool is this family's — direct member OR a variant-bearing id
 * this family resolves (`'geo'` while a valid geo style is set, `'arrow'`
 * while a host's `variantOf` recognizes it).
 */
export function isFamilyActive(
  family: FamilyDeclaration,
  activeToolId: string,
  activeVariant: string | undefined,
): boolean {
  return family.isMember(activeToolId) || family.variantOf?.(activeToolId, activeVariant) !== undefined;
}

function itemById(family: FamilyDeclaration, id: string): ToolItem | undefined {
  for (const section of family.sections) {
    const found = section.items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
}

function FamilyCell({
  family,
  activeToolId,
  activeVariant,
  remembered,
  onArm,
  onSelectItem,
  testIdPrefix,
}: {
  family: FamilyDeclaration;
  activeToolId: string;
  activeVariant: string | undefined;
  remembered: string | undefined;
  onArm(toolId: string): void;
  onSelectItem(toolId: string): void;
  testIdPrefix?: string;
}) {
  const current = resolveCurrentTool(family, activeToolId, activeVariant, remembered);
  const active = isFamilyActive(family, activeToolId, activeVariant);
  const currentItem = itemById(family, current);

  return (
    <DropdownMenu>
      {/* WHY `ToolbarButton render={<DropdownMenuTrigger/>}` and not the
          reverse (Popover.stories.tsx's `FontSizePopoverDemo` already
          established this direction for the pill's own font-size trigger):
          the TOOLBAR ITEM has to be the outer element so `Toolbar.Root` can
          find and manage it — roving tabindex, the arrow-key stop — and the
          menu-trigger behavior (onClick-to-open, `aria-haspopup`) merges
          onto that same button via Base UI's `render` prop instead. */}
      <ToolbarButton
        // WHY `group`: the chevron glyph below is a plain absolutely
        // positioned span (pointer-events: none, ported verbatim from
        // systemsketch-toolbar.css:77-88 — see its own comment below) and
        // reads its color off THIS button's own pressed/open state rather
        // than carrying any state of its own.
        className={cn(TOOL_CELL_CLASS, "group relative")}
        aria-label={`${currentItem?.label ?? family.label} — open ${family.label} tools`}
        aria-pressed={active}
        data-slot="tool-dock-family"
        data-family={family.id}
        data-testid={testIdPrefix ? `${testIdPrefix}-family-${family.id}` : undefined}
        title={`${currentItem?.label ?? family.label} · Open ${family.label} tools`}
        // WHY onArm fires from BOTH pointerdown(button 0) and click
        // (detail 0) — ported verbatim, SystemSketchToolbar.tsx:273-280:
        // "Pointer activation already happened before [the menu] opened,
        // which lets the menu keep focus and preserve one-press Escape."
        // `onPointerDown` covers a real mouse/touch press (which also
        // opens this same trigger's popout, both firing off the one press
        // — the "split-press" this file is named for: one region, two
        // effects); `detail === 0` on click covers keyboard activation
        // (Enter/Space), which never fires a pointerdown at all.
        onPointerDown={(event) => {
          if (event.button === 0) onArm(current);
        }}
        onClick={(event) => {
          if (event.detail === 0) onArm(current);
        }}
        render={<DropdownMenuTrigger />}
      >
        {currentItem?.icon}
        {/*
          Ported verbatim from systemsketch-toolbar.css:77-101
          (`.systemsketch-family-tool__chevron`): absolutely positioned,
          `pointer-events: none` — the chevron is a pure affordance, NOT a
          second hit target. There is no click region that opens "just the
          picker" without also arming the face; the whole cell is one press
          with two effects, which is the actual "split-press" this
          component pins (docs/menus/screenshots/04's "small chevron
          beneath" is what that press LOOKS like, not a second button).
        */}
        <span
          aria-hidden="true"
          data-slot="tool-dock-family-chevron"
          className={cn(
            "pointer-events-none absolute right-0.5 bottom-0.5 text-muted-foreground",
            "group-hover:text-foreground group-data-popup-open:text-foreground",
            "group-aria-pressed:text-primary-foreground",
          )}
        >
          <ChevronDown className="size-2.5" />
        </span>
      </ToolbarButton>
      {/* WHY `w-56`, matching the donor's `.systemsketch-tool-menu { width:
          220px }` (systemsketch-toolbar.css:114-121): `DropdownMenuContent`'s
          own default width is `w-(--anchor-width)` (chromeBar.tsx's burger
          trigger and branchChip.tsx's drafts trigger already override this
          the same way) — tied to the TRIGGER's own width, which for a
          36 x 40 icon-only family cell would squeeze a real label + shortcut
          + check-mark row down to nothing. */}
      <DropdownMenuContent side="top" align="center" sideOffset={11} collisionPadding={12} className="w-56">
        {family.sections.map((section, index) => (
          <DropdownMenuGroup key={section.heading ?? index}>
            {section.heading ? <DropdownMenuLabel>{section.heading}</DropdownMenuLabel> : null}
            {section.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                // WHY a persistent tint replaces the trailing check (Zach,
                // 2026-09-21): a check glued to the end of the row shared the
                // shortcut column's `ml-auto` slot, so on the current row `R`
                // landed one glyph short of where every OTHER row's shortcut
                // sits — the row itself is now the indicator, so the
                // shortcut's `ml-auto` is never contested and every row's
                // hint lands on the same right edge. Ported from the
                // archived app's `.systemsketch-tool-menu__item[data-isactive
                // ='true']` (systemsketch-toolbar.css:149-152, `background:
                // var(--ss-accent-soft)`) rather than invented, using the
                // trunk's OWN existing token for the same idea
                // (branchChip.tsx's `data-current:bg-primary/15` current-row
                // rows) instead of introducing a second one. Deliberately a
                // different token from `focus:bg-accent` just below (the
                // item's own hover/keyboard-highlight style) so "the tool
                // you're on" and "the row Enter would run" stay two visibly
                // different things even while the pointer sits elsewhere.
                data-current={current === item.id || undefined}
                className="data-current:bg-primary/15"
                onClick={() => {
                  onSelectItem(item.id);
                }}
              >
                <span aria-hidden="true" className="[&_svg]:size-4">
                  {item.icon}
                </span>
                {item.label}
                {item.shortcutHint ? <DropdownMenuShortcut>{item.shortcutHint}</DropdownMenuShortcut> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
        {family.footer ? (
          <>
            <DropdownMenuSeparator />
            {family.footer}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LibraryCell({ slot, testIdPrefix }: { slot: LibrarySlotProps; testIdPrefix?: string }) {
  return (
    <Popover open={slot.open} onOpenChange={slot.onOpenChange}>
      {/* Same outer-toolbar-item direction as the family cells above. */}
      <ToolbarButton
        aria-label="Library"
        aria-pressed={slot.open}
        data-slot="tool-dock-library"
        data-testid={testIdPrefix ? `${testIdPrefix}-library` : undefined}
        className={TOOL_CELL_CLASS}
        title="Library"
        render={<PopoverTrigger />}
      >
        <Plus />
      </ToolbarButton>
      <PopoverContent side="top" align="end" sideOffset={12} collisionPadding={12} className="w-80">
        <header className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {slot.eyebrow ? (
              <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {slot.eyebrow}
              </div>
            ) : null}
            <h2 className="truncate text-sm font-semibold">{slot.title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close library"
            onClick={() => slot.onOpenChange(false)}
          >
            <X />
          </Button>
        </header>
        {slot.children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * `ToolDock` — screenshot 04. A `Toolbar` (roving-focus row) of plain tool
 * cells, family cells (split-press over a `FamilyDeclaration`), a
 * separator, and an optional trailing library trigger — wrapped in the
 * kit's own rounded floating shell (the donor's chrome is tldraw's
 * `DefaultToolbar`; this kit imports no canvas engine, so the shell is
 * plain markup instead). No measured overflow (MENU-KIT-DESIGN.md §7): the
 * row simply wraps if a host's family/tool count outgrows one line.
 */
export function ToolDock({
  activeToolId,
  activeVariant,
  families,
  simpleTools,
  preferences,
  onPreferencesChange,
  onArm,
  onSelectItem,
  librarySlot,
  testIdPrefix,
}: ToolDockProps) {
  return (
    <div
      data-slot="tool-dock"
      className={cn(
        "bg-popover text-popover-foreground ring-foreground/10 inline-flex flex-wrap items-center",
        "gap-1 rounded-2xl p-1.5 shadow-lg ring-1",
      )}
    >
      <Toolbar aria-label="Tools">
        {simpleTools.map((tool) => (
          <ToolbarButton
            key={tool.id}
            aria-label={tool.label}
            aria-pressed={tool.active}
            disabled={tool.disabled}
            title={tool.disabled ? (tool.disabledTitle ?? `${tool.label} is unavailable`) : tool.label}
            className={TOOL_CELL_CLASS}
            data-testid={testIdPrefix ? `${testIdPrefix}-tool-${tool.id}` : undefined}
            onClick={tool.onSelect}
          >
            {tool.icon}
          </ToolbarButton>
        ))}
        {families.map((family) => (
          <FamilyCell
            key={family.id}
            family={family}
            activeToolId={activeToolId}
            activeVariant={activeVariant}
            remembered={preferences[family.prefKey]}
            testIdPrefix={testIdPrefix}
            onArm={onArm}
            onSelectItem={(toolId) => {
              // The kit owns "which prefKey this family remembers"; the
              // host only ever gets told the tool to switch to.
              onPreferencesChange({ ...preferences, [family.prefKey]: toolId });
              onSelectItem(toolId);
            }}
          />
        ))}
        {librarySlot ? (
          <>
            <ToolbarSeparator />
            <LibraryCell slot={librarySlot} testIdPrefix={testIdPrefix} />
          </>
        ) : null}
      </Toolbar>
    </div>
  );
}
