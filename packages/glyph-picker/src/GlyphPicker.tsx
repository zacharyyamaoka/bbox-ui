import { useState, type ReactNode } from "react";
import { Glyph, type GlyphSize } from "@bbox-ui/core";

/**
 * packages/glyph-picker/src/GlyphPicker.tsx — SKELETON (docs/GLYPH-PLAN.md
 * phase 3 fills in the real Icons/Emoji/Upload panel, ported from
 * SystemSketch's `BlockIconPicker.tsx` by value). This file exists now so
 * the FROZEN INTERFACE below is real, importable, and typechecked before
 * any adapter or the `/create` page is built against it — phase 4/5 wire
 * to these exact prop names and never rename them.
 *
 * WHY the interface is frozen ahead of the implementation: three lanes
 * (adapter-tldraw's `bbox-glyph` shape util, adapter-reactflow's
 * `bboxGlyph` node, and `/create`'s canvases) all need to render "a Glyph
 * that opens a picker on click" in parallel, and a moving picker contract
 * would make every one of them a moving target too — the exact hazard
 * `docs/GLYPH-PLAN.md`'s own phase list is structured to avoid.
 */
export interface GlyphPickerProps {
  /** The encoded content — `@bbox-ui/glyph-content`'s grammar. Same value
   *  `Glyph.content` reads. */
  value: string;
  onChange(next: string): void;
  /** How the trigger glyph paints — mirrors `GlyphProps`' own size cascade
   *  (`sizePreset` the preset layer, `size` the override, in px). */
  size?: number;
  padding?: number;
  sizePreset?: GlyphSize;
  /** Controlled open state. Omit both to let the picker manage its own
   *  (uncontrolled) open flag — a canvas host that wants to close the
   *  picker on, say, a tool change passes both instead. */
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /** Where the popover mounts — tldraw's own container element, so the
   *  picker paints above the canvas rather than under it. `undefined`
   *  mounts in the ambient DOM position (the DOM render, Storybook). */
  portalContainer?: HTMLElement | null;
  disabled?: boolean;
  /** A custom trigger. Omitting it renders the default trigger: a `Glyph`
   *  painted with `value` at the given size/padding/sizePreset. */
  children?: ReactNode;
  className?: string;
}

/**
 * Uncontrolled-with-controlled-escape-hatch, the same shape every other
 * open/close surface in this repo's donor libraries uses (Base UI's own
 * components, Radix before it). `open !== undefined` is the controlled
 * check — not truthiness — so a host that controls the picker and is
 * currently holding it closed (`open={false}`) is still "controlled",
 * never silently demoted to the internal flag.
 */
function useOpenState(
  open: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (next: boolean) => void] {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return [resolvedOpen, setOpen];
}

/**
 * STUB — renders the default trigger (a plain `<button>` wrapping the
 * live `Glyph`) and, on click, a placeholder panel instead of the real
 * Icons/Emoji/Upload UI. `onChange` is accepted (the frozen interface)
 * but never called here; nothing in this file resolves an icon.
 */
export function GlyphPicker({
  value,
  size,
  padding,
  sizePreset,
  open,
  onOpenChange,
  disabled,
  children,
  className,
}: GlyphPickerProps) {
  const [isOpen, setOpen] = useOpenState(open, onOpenChange);

  return (
    <span data-slot="glyph-picker" className={className}>
      <button
        type="button"
        data-slot="glyph-picker-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
      >
        {children ?? <Glyph content={value} size={size} padding={padding} sizePreset={sizePreset} />}
      </button>
      {isOpen && (
        <div data-slot="glyph-picker-panel" role="dialog" aria-label="Glyph picker">
          Picker lands in phase 3
        </div>
      )}
    </span>
  );
}
