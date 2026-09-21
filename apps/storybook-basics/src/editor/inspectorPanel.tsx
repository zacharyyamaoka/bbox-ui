"use client";

// src/editor/inspectorPanel.tsx — RULING 9's chrome half: the right-hand
// inspector, and the eye that decides whether a block's description paints.
//
// Zach, ruling 9: "the eye visibility control for this is in the right hand
// inspector menu."
//
// That sentence is a PLACEMENT ruling, so this file exists to honour the
// placement, not merely the capability. The split, the same shape
// `portOverflowChip.tsx` already draws for ruling 7:
//
//   what a description IS, and when it paints  ->  components/blockDescription.tsx
//                                                  (`BLOCK_DESCRIPTION_FONT_PX`,
//                                                  `blockDescriptionIsPainted`)
//   the CONTROL that flips it                  ->  here
//
// Deliberately NOT on the shape, and not in the selection pill: an eye that
// rides the block it hides is a control that disappears with its own effect,
// and ruling 9 names the inspector by name.
//
// Engine-agnostic per `src/editor/README.md`: plain values and callbacks in,
// no `Editor`, no `useValue`, no store. The whiteboard wires it to
// `ss-block`'s props in `apps/systemsketch/src/chrome/panels.tsx`; a React
// Flow host or a story wires it to whatever it has.
import { Eye, EyeOff } from "lucide-react";

import { cn } from "../lib/utils";
import { Label } from "../components/label";
import { Textarea } from "../components/textarea";
import { Toggle } from "../components/toggle";

export interface InspectorPanelProps {
  /**
   * What is being inspected — a block's name. `null` means "nothing is
   * selected", which is a real state with its own copy, not an empty panel:
   * `panelShell.tsx`'s own ported lesson is that a subject with no body
   * "left a cable, an ordinary shape and an empty selection in a headerless
   * column with no pointer way out".
   */
  subject: string | null;
  /** The stored string, verbatim. Never trimmed for display. */
  description: string;
  /** `ss-block`'s `showDescription` — the donor field's `defaultValue: true`. */
  descriptionVisible: boolean;
  onDescriptionChange(next: string): void;
  onDescriptionVisibleChange(next: boolean): void;
  /** `${prefix}-description-eye` / `-description-text`. The kit's universal
   *  rule: no test id derived from display text. */
  testIdPrefix?: string;
  className?: string;
}

export function InspectorPanel({
  subject,
  description,
  descriptionVisible,
  onDescriptionChange,
  onDescriptionVisibleChange,
  testIdPrefix,
  className,
}: InspectorPanelProps) {
  const testId = (suffix: string) => (testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined);

  if (subject === null) {
    return (
      <div data-slot="inspector-panel" data-testid={testId("empty")} className={cn("p-3.5 text-sm text-muted-foreground", className)}>
        Select a block to edit its description.
      </div>
    );
  }

  return (
    <div data-slot="inspector-panel" className={cn("flex flex-col gap-3 p-3.5", className)}>
      <div className="min-w-0">
        <span className="block text-[8px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase">Selected</span>
        {/* `title` carries the raw name for the same reason `PanelShell`'s
            heading does — a truncating label must keep the whole value one
            hover away. */}
        <span data-slot="inspector-subject" className="mt-0.5 block truncate text-sm font-medium text-foreground" title={subject}>
          {subject}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="inspector-description">Description</Label>
          {/*
           * THE EYE. `pressed` means SHOWN, so `aria-pressed` reads as the
           * state of the thing rather than of the hiding.
           *
           * WHY the icon swaps rather than staying an `Eye` that merely dims
           * (Zach's own stated taste, `feedback_truthful_property_rendering`
           * applied to a control): the toggle's background tint is the only
           * other signal, and a tint is invisible against this panel at a
           * glance. `EyeOff` says "hidden" without the user having to
           * remember which way the highlight means.
           */}
          <Toggle
            id="inspector-description-eye"
            data-testid={testId("description-eye")}
            variant="outline"
            size="sm"
            pressed={descriptionVisible}
            onPressedChange={onDescriptionVisibleChange}
            aria-label="Show description"
            title={descriptionVisible ? "Description is shown on the block" : "Description is hidden on the block"}
          >
            {descriptionVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </Toggle>
        </div>
        <Textarea
          id="inspector-description"
          data-testid={testId("description-text")}
          rows={3}
          value={description}
          placeholder="What does this block do?"
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
        {/*
         * WHY the text stays editable while the eye is off, and why this line
         * is here at all: hiding is not deleting (see `BlockProps.showDescription`),
         * so the author can keep writing a description that is not on the
         * board yet. Without this line the panel looks broken — you type and
         * nothing happens out on the canvas.
         */}
        {descriptionVisible ? null : (
          <span data-slot="inspector-description-hidden-note" className="text-xs text-muted-foreground">
            Hidden on the block. The text is kept.
          </span>
        )}
      </div>
    </div>
  );
}
