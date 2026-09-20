// src/chrome/selectionClusters.tsx — the CONTENT of the selection pill:
// Arrange, opacity, and the tldraw style bar. `floatingToolbar.tsx` owns
// where the pill goes (seven numbered placement steps against
// docs/menus/MENU-KIT-DESIGN.md §4); this file owns what is inside it, so
// neither job has to be read to change the other.
//
// Zach, 2026-09-20, with a screenshot of the current pill labelled "Current :
// BAD" showing exactly two buttons (duplicate, delete) and the archived
// SystemSketch's pill labelled "Desired": "1. floating tool bars that provide
// useful fucntions on the components / 2. FLoating toolbar over the tldraw
// primatives for styling".
//
// ONE FAMILY, ONE TRIGGER. Arrange collapses ten actions behind a single
// face, and each style row collapses its option list behind one. That is the
// donor pill's own rule and it is Zach's, stated 2026-09-08: "instead of
// being visible on the floating toolbar I want them hidden behind a icon".
// The pill is a bar over the user's drawing — every control spent here is
// canvas taken away.
import { useCallback } from "react";
import { AlignStartVertical, Focus } from "lucide-react";
import { useEditor, useValue } from "tldraw";

import { Button } from "@trunk/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@trunk/components/popover";
import { Slider } from "@trunk/components/slider";
import { ToolbarButton } from "@trunk/components/toolbar";

import {
  activeStyleRows,
  arrangeGroupsFor,
  runArrange,
  selectionOpacityPercent,
  setSelectionOpacityPercent,
  setStyle,
  swatchColorFor,
  faceLabelFor,
  type ActiveStyleRow,
} from "./arrangeActions";

/** The pill is `bg-foreground text-background` — a dark bar. Every control in
 *  it restates its colours for that surface, the same reason the block-view
 *  toggle group already does (see `floatingToolbar.tsx`'s own note: the stock
 *  pressed state assumes a LIGHT surface and goes unreadable here). */
const ON_PILL = "text-background hover:bg-background/20 hover:text-background";

/* ----------------------------------------------------------------- arrange */

export function ArrangeCluster() {
  const editor = useEditor();
  const count = useValue("ss arrange selection count", () => editor.getSelectedShapeIds().length, [editor]);
  const groups = arrangeGroupsFor(count);
  if (groups.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className={ON_PILL} />}
        data-testid="ss-selection-arrange"
        aria-label="Arrange"
        title="Arrange"
      >
        {/* Align-left is the face every tool that COLLAPSES this control uses
            for it; the donor picked it for the same reason and wrote down
            that no upstream "arrange" glyph exists to vendor. */}
        <AlignStartVertical />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1" data-testid="ss-arrange-panel">
        {groups.map((group, index) => (
          <div key={group.id}>
            {/* A rule between families, never above the first. The four groups
                stack inside the panel rather than spreading across the pill's
                row — the donor moved them here and noted "they read better
                than they ever did crammed into the pill's row". */}
            {index > 0 ? <div className="my-1 h-px bg-border" /> : null}
            {group.heading ? (
              <div className="px-2 pt-1 pb-0.5 text-[11px] text-muted-foreground">{group.heading}</div>
            ) : null}
            <div className="flex gap-0.5" role="group" aria-label={group.heading ?? "Order"}>
              {group.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    variant="ghost"
                    size="sm"
                    data-testid={`ss-arrange-${action.id}`}
                    aria-label={action.label}
                    title={action.label}
                    onClick={() => runArrange(editor, action.id)}
                  >
                    <Icon />
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ----------------------------------------------------------------- opacity */

export function OpacityCluster() {
  const editor = useEditor();
  const hasSelection = useValue("ss opacity has selection", () => editor.getSelectedShapeIds().length > 0, [editor]);
  const percent = useValue("ss opacity percent", () => selectionOpacityPercent(editor), [editor]);

  const onChange = useCallback(
    (next: number | readonly number[]) => {
      setSelectionOpacityPercent(editor, Array.isArray(next) ? (next[0] ?? 100) : (next as number));
    },
    [editor],
  );

  if (!hasSelection) return null;

  return (
    // WHY the slider lives in the pill's ROW rather than behind a trigger
    // like Arrange does, when "one family one trigger" is the rule: opacity
    // is one value, not a family, and it is the one control whose CURRENT
    // state is the thing you need to see while you drag it. Hiding it would
    // mean opening a popover to find out what the opacity already is. The
    // donor's pill shows it inline for the same reason (screenshot: a track
    // and "100%").
    <div className="flex items-center gap-2 px-1" data-testid="ss-selection-opacity">
      <Slider
        value={[percent]}
        min={0}
        max={100}
        step={1}
        onValueChange={onChange}
        aria-label="Opacity"
        className="w-24"
      />
      <span className="w-9 text-right text-xs tabular-nums" data-testid="ss-selection-opacity-value">
        {percent}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- style */


/**
 * The row's face in the pill. Identifies the FAMILY, not the value — see
 * `StyleRow.face`'s own note for the measured reason (five raw enum values in
 * a row, with "Draw" appearing twice). The current value stays in the
 * trigger's `title` and `aria-label`, which is where a tooltip and a screen
 * reader look for it anyway.
 */
function StyleFace({ row, swatch }: { row: ActiveStyleRow; swatch: string | null }) {
  const testId = `ss-style-${row.id}-face`;
  if (row.face === "swatch") {
    return (
      <span
        data-testid={testId}
        className="size-4 rounded-full border border-background/40"
        // A null swatch means the theme has no entry for this value, or the
        // selection is mixed — paint nothing rather than guess a colour.
        style={swatch ? { background: swatch } : undefined}
      />
    );
  }
  if (row.face === "glyph" && row.icon) {
    const Icon = row.icon;
    return (
      <span data-testid={testId} className="flex items-center">
        <Icon className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span data-testid={testId} className="text-xs">
      {faceLabelFor(row, row.value)}
    </span>
  );
}

function StyleRowControl({ row }: { row: ActiveStyleRow }) {
  const editor = useEditor();
  const swatch = useValue(
    `ss style swatch ${row.id}`,
    () => (row.paint === "swatch" && row.value ? swatchColorFor(editor, row.value) : null),
    [editor, row.paint, row.value],
  );

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className={ON_PILL} />}
        data-testid={`ss-style-${row.id}`}
        aria-label={`${row.label}${row.value ? `: ${row.value}` : ": mixed"}`}
        title={row.label}
      >
        <StyleFace row={row} swatch={swatch} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1" data-testid={`ss-style-${row.id}-panel`}>
        <div className={row.paint === "swatch" ? "grid grid-cols-6 gap-1" : "flex flex-col"} role="group" aria-label={row.label}>
          {row.values.map((value) => (
            <StyleOption key={value} row={row} value={value} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StyleOption({ row, value }: { row: ActiveStyleRow; value: string }) {
  const editor = useEditor();
  const swatch = useValue(
    `ss style option ${row.id} ${value}`,
    () => (row.paint === "swatch" ? swatchColorFor(editor, value) : null),
    [editor, row.paint, value],
  );
  const selected = row.value === value;

  return (
    <Button
      variant="ghost"
      size="sm"
      // `aria-pressed` rather than a class alone: "which one is currently set"
      // has to reach a screen reader and a test without either reading colour.
      aria-pressed={selected}
      data-testid={`ss-style-${row.id}-${value}`}
      aria-label={value}
      title={value}
      className={selected ? "ring-1 ring-ring" : undefined}
      onClick={() => setStyle(editor, row.style, value)}
    >
      {row.paint === "swatch" ? (
        <span className="size-4 rounded-full border border-border" style={swatch ? { background: swatch } : undefined} />
      ) : (
        <span className="text-xs">{row.valueLabels?.[value] ?? value}</span>
      )}
    </Button>
  );
}

/**
 * The style bar for a NATIVE tldraw selection — Zach's ask 2 on 2026-09-20.
 *
 * Which rows appear is `editor.getSharedStyles()`' answer, not a switch on
 * shape type: select an arrow and there is no Fill row, because an arrow has
 * no fill. See `activeStyleRows`' own note for why re-deriving that per kind
 * would get arrows and text subtly wrong.
 */
export function StyleCluster() {
  const editor = useEditor();
  // `getSharedStyles()` is already reactive; `useValue` re-reads it whenever
  // the selection or any selected shape's style changes.
  const rows = useValue("ss style rows", () => activeStyleRows(editor.getSharedStyles()), [editor]);
  if (rows.length === 0) return null;
  return (
    <div className="flex items-center" data-testid="ss-selection-style">
      {rows.map((row) => (
        <StyleRowControl key={row.id} row={row} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- misc */

/** Zoom the camera onto the selection alone — the donor pill's "Focus". */
export function FocusButton() {
  const editor = useEditor();
  const hasSelection = useValue("ss focus has selection", () => editor.getSelectedShapeIds().length > 0, [editor]);
  if (!hasSelection) return null;
  return (
    <ToolbarButton
      data-testid="ss-selection-focus"
      aria-label="Focus"
      title="Zoom to this selection"
      className="text-background"
      onClick={() => editor.zoomToSelection({ animation: { duration: 220 } })}
    >
      <Focus />
    </ToolbarButton>
  );
}
