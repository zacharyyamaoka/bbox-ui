// src/editor/devPanel.tsx — the developer panel SHELL: a dark modal with
// a header, a scrolling stack of titled sections, and rows it is handed.
//
// Donor (read on disk, ported as BEHAVIOUR and vocabulary, never as markup):
// `/home/bam/systemsketch/src/SystemSketchUtilities.tsx:428-639` — the
// `systemsketch-dev-panel` <section>, its `systemsketch-panel-header`
// (eyebrow "SystemSketch" / <h2>Dev</h2> / ×), its
// `systemsketch-dev-section-label` (title + right-aligned scope caption),
// `systemsketch-dev-toggle`, `systemsketch-dev-latest`,
// `systemsketch-dev-preset`, `systemsketch-version-row`, and its
// `<RecorderControls />` mount — plus the bottom PROTOTYPE drop-down from
// `/home/bam/systemsketch/src/development/PrototypeSwitch.tsx`. Every one of
// those was hand-written JSX in one 211-line wall; here each is a row KIND
// in `devPanel.model.ts` and the host writes an array.
//
// WHY THE PANEL OWNS NO DOMAIN KNOWLEDGE — Zach, 2026-09-19, verbatim:
// "LIke the dev panel it self. should just use placeholders for things. it
// shouldn't it self kinda hold any of the actual things."
// Concretely, this file mentions no cable, behaviour tree, preset, recording
// or release outside this comment, and there is no seam by which one could
// arrive:
//   - it reads no store, no URL flag and no localStorage — every value and
//     every callback arrives as a prop (CLAUDE.md's rule for the whole
//     trunk: `apps/systemsketch` imports and configures, it does not
//     re-implement);
//   - it never branches on a row's id or a section's title, so "CABLE
//     PRESENTATION" is a string like any other;
//   - anything no row kind covers goes in a `slot` row, which is how the
//     donor's `<RecorderControls />` gets in without this file learning what
//     a recording is.
// That rejects the tempting alternative — a `kind: "recording"` row, or a
// `recorder?: RecorderState` prop, "because it's only a few lines". That is
// exactly the move that left the donor mountable by one app only, and it is
// the move this file exists to make impossible.
"use client";

import {
  useEffect,
  useId,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowUpRight, ChevronRight, XIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { DialogClose, DialogOverlay, DialogPortal } from "../components/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "../components/field";
import { Label } from "../components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/select";
import { Separator } from "../components/separator";
import { Switch } from "../components/switch";
import {
  DEV_PANEL_DARK_TOKENS,
  duplicateDevPanelRowIds,
  visibleDevPanelSections,
  type DevPanelRow,
  type DevPanelSection,
  type DevPanelTone,
} from "./devPanel.model";

export type {
  DevPanelOption,
  DevPanelRow,
  DevPanelRowKind,
  DevPanelSection,
  DevPanelTone,
} from "./devPanel.model";
export {
  DEV_PANEL_ROW_KINDS,
  DEV_PANEL_DARK_TOKENS,
  devPanelRowIds,
  duplicateDevPanelRowIds,
  visibleDevPanelSections,
} from "./devPanel.model";

export interface DevPanelProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Small-caps line above the title. Donor: "SystemSketch". */
  eyebrow?: string;
  /** Header text; default "Dev". */
  title?: string;
  sections: readonly DevPanelSection[];
  /** Host content under a separator at the very bottom — the donor's
   *  "N active presets · code-owned compositions" line. A `ReactNode`, not a
   *  string, for the same reason `slot` exists. */
  footer?: ReactNode;
  /** Portal target inside the host's token scope (menu-kit host contract). */
  container?: HTMLElement | null;
  /** Host CSS on the popup — placement and stacking only. */
  popupClassName?: string;
  testIdPrefix?: string;
}

/** One type scale for every small-caps line in the panel: the header
 *  eyebrow, a section title, a scope caption and a select's label are the
 *  SAME rung, because in the donor they had four different hand-written
 *  sizes and that is half of what "the layout is a mess" was about. */
const EYEBROW = "text-[10px] leading-none font-semibold tracking-[0.1em] text-muted-foreground uppercase";

/** `tone` → a STOCK `Badge` variant. `positive` is the one that needs a
 *  token: shadcn ships no success variant, and `--bbox-received`
 *  (src/globals.css:138, the kit's own green) is the colour this repo
 *  already uses for "arrived / good". Tinting a stock Badge is
 *  configuration; writing a second badge component would not be. */
const TONE_BADGE: Record<
  DevPanelTone,
  { variant: "secondary" | "outline" | "warning" | "destructive"; className?: string }
> = {
  neutral: { variant: "secondary" },
  positive: { variant: "outline", className: "border-[var(--bbox-received)]/40 text-[var(--bbox-received)]" },
  warning: { variant: "warning" },
  danger: { variant: "destructive" },
};

/**
 * The card box a non-label row sits in. Its numbers are not invented: they
 * are what stock `FieldLabel` already paints around a `Field`
 * (`has-[>[data-slot=field]]:rounded-lg`, `:border`,
 * `*:data-[slot=field]:p-2.5`), restated for the rows that are not labels so
 * every row in the stack has one gutter and one radius.
 */
const ROW_BOX = "rounded-lg border border-border bg-card p-2.5";

/** Buttons are rows here, not chips: full width, top-aligned, wrapping text.
 *  Stock `Button` is still the control — only its box is re-proportioned. */
const ROW_BUTTON = "h-auto w-full items-start justify-start gap-3 p-2.5 text-left font-normal whitespace-normal";

/** The 36px square in front of an `action`/`avatar` row. */
const ROW_TILE = "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold";

function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn(EYEBROW, className)} {...props} />;
}

/** The trailing affordance on a row that opens something: ↗, or an in-flight
 *  mark while the host is working. `aria-hidden` because the row's own label
 *  already says where it goes. */
function OpensIndicator({ busy }: { busy?: boolean }) {
  return (
    <span aria-hidden="true" data-dev-panel-opens="" className="mt-0.5 shrink-0 text-muted-foreground">
      {busy ? <span className="text-sm leading-none">…</span> : <ArrowUpRight className="size-4" />}
    </span>
  );
}

function renderRow(row: DevPanelRow, controlId: string): ReactNode {
  switch (row.kind) {
    case "status":
      // Not interactive, on purpose. The donor's own comment beside this row:
      // "Where you already are is state, not an offer: no call-out styling."
      return (
        <Field orientation="horizontal" className={ROW_BOX}>
          <FieldContent>
            <FieldTitle>{row.title}</FieldTitle>
            {row.detail ? <FieldDescription className="text-xs">{row.detail}</FieldDescription> : null}
          </FieldContent>
          {row.status ? (
            <Badge
              size="sm"
              variant={TONE_BADGE[row.tone ?? "neutral"].variant}
              className={cn("tracking-[0.08em] uppercase", TONE_BADGE[row.tone ?? "neutral"].className)}
            >
              {row.status}
            </Badge>
          ) : null}
        </Field>
      );

    case "toggle":
      // WHY a `Switch` where the donor drew a checkbox: this repo's stock set
      // has no `checkbox.tsx` and the brief forbids installing one — and
      // `Switch` is the right part anyway for a setting that takes effect the
      // instant it moves, which is every row in this panel ("THIS BROWSER,
      // LIVE"). A checkbox promises a form that gets submitted.
      //
      // WHY no ROW_BOX here: stock `FieldLabel` ALREADY paints the card when
      // its direct child is a `Field` — border, radius, 2.5 padding, the
      // hover tint and the checked tint. Adding our own box would be a
      // second, drifting copy of a look the stock part ships.
      //
      // WHY `border-border` is spelled out: stock FieldLabel's card rule is
      // `has-[>[data-slot=field]]:border`, which sets WIDTH only — the colour
      // falls through to `currentColor`, i.e. the row's own near-white text
      // on this dark scope. Measured: a 1px white cage around every toggle
      // while its neighbours drew the theme hairline. The rest of the card
      // (radius, padding, hover and checked tints) is still stock's.
      return (
        <FieldLabel htmlFor={controlId} className="border-border bg-card">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{row.title}</FieldTitle>
              {row.description ? <FieldDescription className="text-xs">{row.description}</FieldDescription> : null}
            </FieldContent>
            <Switch
              id={controlId}
              checked={row.checked}
              disabled={row.disabled}
              onCheckedChange={(checked) => row.onCheckedChange(checked, row.id)}
            />
          </Field>
        </FieldLabel>
      );

    case "action":
      // WHY `secondary` + an accent TILE rather than the donor's accent-tinted
      // card with accent-coloured eyebrow copy: copy on an accent-soft tint
      // measured 2.6–4.3:1 in every palette here — under AA — so the tint
      // carries a glyph (contrast-exempt) while the words sit on the stock
      // raised surface at full contrast. The card still reads as the one
      // offer in the stack, which is the whole job of the donor's call-out.
      return (
        <Button
          variant={row.emphasis === "quiet" ? "ghost" : "secondary"}
          disabled={row.disabled}
          onClick={() => row.onSelect(row.id)}
          className={ROW_BUTTON}
        >
          {row.icon ? (
            <span aria-hidden="true" className={cn(ROW_TILE, "bg-[var(--bbox-accent)] text-white [&_svg]:size-4")}>
              {row.icon}
            </span>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {row.eyebrow ? <span className={EYEBROW}>{row.eyebrow}</span> : null}
            <span className="text-sm font-medium text-foreground">{row.title}</span>
            {row.subtitle ? <span className="text-xs text-muted-foreground">{row.subtitle}</span> : null}
          </span>
          <OpensIndicator busy={row.busy} />
        </Button>
      );

    case "avatar":
      return (
        <Button
          variant="ghost"
          disabled={row.disabled}
          onClick={() => row.onSelect(row.id)}
          className={cn(ROW_BUTTON, "items-center")}
        >
          {/* WHY the initial is rendered exactly as given, never sliced to one
              character: the truthful-rendering rule — a host that passes "BT"
              gets "BT", not "B". Sizing the tile is ours; editing the host's
              text is not. */}
          <span aria-hidden="true" className={cn(ROW_TILE, "bg-muted text-foreground")}>
            {row.initial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{row.title}</span>
            {row.subtitle ? <span className="text-xs text-muted-foreground">{row.subtitle}</span> : null}
          </span>
          <OpensIndicator busy={row.busy} />
        </Button>
      );

    case "select": {
      // Base UI's Select resolves the trigger's initial label from `items` —
      // the popup's items are not in the DOM until first opened, so without
      // this map the trigger renders empty until something is chosen (the
      // same note settingsView.tsx carries).
      const items = Object.fromEntries(row.options.map((option) => [option.value, option.label]));
      const selectedLabel = row.options.find((option) => option.value === row.value)?.label ?? row.value;
      return (
        <Field orientation="horizontal" className={ROW_BOX}>
          {/* Stock `Label`, deliberately NOT `FieldLabel`: `Field`'s own
              `*:data-[slot=field-label]:flex-auto` would make the caption
              grow and squeeze the drop-down, and beating a parent-child
              selector from the child needs an arbitrary-variant hack. A
              plain Label is the same stock part without that fight. */}
          <Label htmlFor={controlId} className={cn(EYEBROW, "shrink-0")}>
            {row.label}
          </Label>
          <Select
            value={row.value}
            onValueChange={(value) => row.onValueChange(String(value), row.id)}
            items={items}
          >
            {/* WHY `truncate` + `title` and not a wider box: a row's label can
                be a whole sentence (the donor's own options are), and the
                stock trigger is `whitespace-nowrap`, so the overflow was a
                HARD CLIP — "…one solid bo" with no ellipsis and no way to
                read the rest. Truthful rendering: abbreviate visibly, keep
                the complete authored value one hover away.
                `block` is not decoration: stock sets the value element to
                `flex` (so a value can carry an icon), and `text-overflow`
                has no effect on a flex container — measured, `textOverflow:
                "ellipsis"` computed correctly while the text still clipped
                mid-word. A row label here is plain text, so it goes back to
                a block box and the ellipsis lands. */}
            <SelectTrigger
              id={controlId}
              aria-label={row.label}
              title={selectedLabel}
              disabled={row.disabled}
              className="min-w-0 flex-1 *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
            >
              <SelectValue />
            </SelectTrigger>
            {/* WHY the dark tokens are repeated HERE: a Base UI Select popup
                portals to `document.body`, outside this panel's root, so it
                escapes the variable scope declared there and would paint on
                the page's own (light) theme. `SelectContent` forwards
                `style` to its popup, so re-declaring the same frozen token
                map is enough — and this is the only element in the kit that
                leaves the panel's subtree. */}
            <SelectContent style={DEV_PANEL_DARK_TOKENS as CSSProperties}>
              {row.options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
    }

    case "link":
      return (
        <Button
          variant="ghost"
          disabled={row.disabled}
          aria-expanded={row.expanded}
          onClick={() => row.onSelect(row.id)}
          className={cn(ROW_BUTTON, "items-center justify-between")}
        >
          <span className="text-sm font-medium text-foreground">{row.title}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {row.detail}
            <ChevronRight
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", row.expanded ? "rotate-90" : undefined)}
            />
          </span>
        </Button>
      );

    case "slot":
      // No box, no padding, no assumptions: the host's element IS the row.
      return row.content;
  }
}

/**
 * DOM contract (what `stories/DevPanel.stories.tsx` measures):
 *   - the popup is `[data-slot="dev-panel"]`, `role="dialog"`, carrying
 *     `data-testid` = `testIdPrefix` when given;
 *   - `[data-dev-panel-close]` closes it, and so does Escape (stock Dialog
 *     behaviour, not re-implemented here);
 *   - one `[data-slot="dev-panel-section"][data-section-id=<id>]` per VISIBLE
 *     section, its `title` as visible text and its `caption` in
 *     `[data-dev-panel-caption]`;
 *   - one `[data-slot="dev-panel-row"][data-row-kind=<kind>][data-row-id=<id>]`
 *     per visible row, in array order;
 *   - a `toggle` row holds a stock `role="switch"`; `action`/`avatar`/`link`
 *     rows hold a stock `<button>`; a `select` row holds a stock Select
 *     trigger; a `slot` row holds exactly what the host passed;
 *   - every callback is invoked with its own row's `id`.
 */
export function DevPanel({
  open,
  onOpenChange,
  eyebrow,
  title = "Dev",
  sections,
  footer,
  container,
  popupClassName,
  testIdPrefix,
}: DevPanelProps): ReactElement {
  const reactId = useId();
  const visible = visibleDevPanelSections(sections);

  // A duplicate id is silent — both rows still paint — but it makes the
  // host's own `(value, id)` handler ambiguous, which is the one thing the
  // id exists to prevent. Warn rather than throw: a dev panel that refuses
  // to open is worse than one with a muddled callback.
  const duplicates = duplicateDevPanelRowIds(sections).join(", ");
  useEffect(() => {
    if (duplicates) {
      console.warn(`DevPanel: duplicate row ids — callbacks cannot identify them: ${duplicates}`);
    }
  }, [duplicates]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal container={container}>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dev-panel"
          data-testid={testIdPrefix}
          // WHY the theme tokens ride on `style` (see DEV_PANEL_DARK_TOKENS'
          // own note): this app flips theme on `prefers-color-scheme` alone
          // — there is no `.dark` class variant — so re-declaring the
          // variables on this one root is the only way the panel can be dark
          // on a light page while every child stays a STOCK part resolving
          // its own `bg-card`/`bg-input`/`hover:bg-muted` unchanged.
          style={DEV_PANEL_DARK_TOKENS as CSSProperties}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 sm:max-w-[440px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            popupClassName,
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              {eyebrow ? <Eyebrow className="block">{eyebrow}</Eyebrow> : null}
              <DialogPrimitive.Title className="cn-font-heading mt-1.5 truncate text-xl leading-none font-semibold">
                {title}
              </DialogPrimitive.Title>
            </div>
            {/* `data-dev-panel-close`, not `data-slot`: stock `Button`
                spreads incoming props AFTER its own `data-slot="button"`, so
                a `data-slot` here would silently erase the marker that says
                this is the stock part. */}
            <DialogClose
              render={<Button variant="ghost" size="icon-sm" aria-label={`Close ${title}`} data-dev-panel-close="" />}
            >
              <XIcon />
            </DialogClose>
          </header>

          {/* Plain `overflow-y-auto` + `overscroll-contain`, deliberately not
              shadcn's `scroll-area`: containment is the entire job (stop an
              exhausted scroll bleeding into whatever is underneath), and
              that is the same call panelShell.tsx already made here. */}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
            {visible.map((section) => (
              <section
                key={section.id}
                data-slot="dev-panel-section"
                data-section-id={section.id}
                className="flex flex-col gap-2"
              >
                {section.title ? (
                  <div className="flex items-baseline justify-between gap-3 px-0.5">
                    <Eyebrow>{section.title}</Eyebrow>
                    {/* The scope caption: who and what a section's changes
                        reach. Right-aligned against the title, as the donor
                        had it — it answers a question the title raises, so
                        it belongs on the same line, not under the rows. */}
                    {section.caption ? (
                      <Eyebrow data-dev-panel-caption="" className="truncate">
                        {section.caption}
                      </Eyebrow>
                    ) : null}
                  </div>
                ) : null}
                {section.rows.map((row) => (
                  <div key={row.id} data-slot="dev-panel-row" data-row-kind={row.kind} data-row-id={row.id}>
                    {renderRow(row, `${testIdPrefix ?? "dev"}${reactId}-${section.id}-${row.id}`)}
                  </div>
                ))}
              </section>
            ))}
          </div>

          {footer ? (
            <div data-dev-panel-footer="" className="shrink-0">
              <Separator />
              <div className="px-4 py-2.5 text-xs text-muted-foreground">{footer}</div>
            </div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
