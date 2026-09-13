import type { ReactNode } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { Subject } from "../fieldModel";

/**
 * SECTIONS — one panel, one section chrome, three readings of what a
 * section header is FOR.
 *
 * Round 1 (branch `claude/inspector-panel-v5`) put five section designs on
 * the table. Zach picked from them on 2026-09-12 and the picks are settled,
 * so they are not variants any more — they are this file's premises:
 *
 *   1. "The section is a title and a hairline"  (S1)
 *   2. "Lets add the folding … the chevron should appear just on hover" (S2)
 *   3. "S3 don't take anything from this"       (dropped entirely)
 *   4. "we can support stacked labels … via the group in the schema" (S4 —
 *      already true on main: `FieldSpec.group` + `groupRows`, no new work)
 *   5. "I like how this looks collapses it more compact"  (S5's one-line row)
 *   6. "When you expand it though, no need to repeat the header again"
 *
 * WHY the contract still exists after the picks: the reason it was written
 * has not gone away. Zach, 2026-09-12: "I don't like how with the header you
 * are kinda doing this very custom control interface. Same thing with ports.
 * I think it's great if we want to have different types of controls, but all
 * controls should kinda be from a standard control list so we are getting
 * consistency across the entire application." And: "what would make sense
 * here is to see this panel split in between properties/members related to
 * the block, the header, footer, body, ports. etc grouped together."
 *
 * Both sentences are one architectural fact. The old inspector had an escape
 * hatch out of the field engine — `RegionHeader` in `members-section.tsx`,
 * a Bar's real fields hand-drawn as hidden ☐ · line ☑ · md ▾ · ⚙ — and it
 * existed because there was no way to say "these rows belong under the
 * Header sub-header", so the only way to put a caption above a control was
 * to draw the control by hand. Give the panel sections and the hatch closes.
 */

/* ------------------------------------------------------------------ */
/* The standard control list                                           */
/* ------------------------------------------------------------------ */

/**
 * Every editable control the inspector may draw. This list IS the
 * consistency guarantee: a row renders one of these five and nothing else,
 * every one carries `data-standard-control="<id>"`, and
 * `demos/capture-inspector-v5b.mjs` fails the build if any control inside
 * the inspector column lacks that attribute.
 *
 * Adding a value that needs a control not in this list means ADDING IT
 * HERE — once, reused everywhere — never drawing it beside the engine.
 *
 * WHY there is no `flags` here, though round 1 shipped one: its only caller
 * was the Arrangement section's live port-edge SET, and that model
 * (`claude/members-control`'s Arrangements/Placements work) never landed on
 * `main`. A sixth control with zero call sites is a speculative widening of
 * the very list that exists to stay small; it comes back with its caller.
 */
export const STANDARD_CONTROLS = ["segmented", "dropdown", "number", "toggle", "text"] as const;
export type StandardControl = (typeof STANDARD_CONTROLS)[number];

/* ------------------------------------------------------------------ */
/* Density                                                             */
/* ------------------------------------------------------------------ */

/**
 * How much air the panel spends. Zach, 2026-09-12: "like you can make it
 * way more compact".
 *
 * WHY this is one shared control and not a per-design decision: density and
 * "what does a section header carry" are independent questions, and three
 * designs that each also picked their own row height would confound both —
 * he could not tell whether he preferred P2 or preferred 20px rows. One
 * switch, applied to all three, keeps the comparison about the axis the
 * designs actually differ on.
 */
export type Density = "comfortable" | "compact";

export interface DensityRung {
  /** Section title row height. */
  titleHeight: number;
  /** Left/right gutter of a section body. */
  gutter: number;
  /** Vertical padding under a section's last row. */
  bodyBottom: number;
  /** Section title type size. */
  titleSize: number;
}

export const DENSITY: Record<Density, DensityRung> = {
  comfortable: { titleHeight: 30, gutter: 12, bodyBottom: 10, titleSize: 11.5 },
  // Measured, not guessed: 22px is the row height `FigmaDense`'s own
  // `rowGridStyle` already uses, so a 24px title row is the smallest one
  // that still reads as taller than the rows it heads.
  compact: { titleHeight: 24, gutter: 10, bodyBottom: 4, titleSize: 11 },
};

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/**
 * One field, already bound to the instance it writes.
 *
 * WHY the binding and not a bare FieldSpec: a Block's inspector shows the
 * Bar's `hidden` in its Header section, and that row must write the BAR,
 * not the Block. The old code solved this by giving `RegionHeader` a direct
 * `onSetProp(fill.id, …)`; here the target rides on the row, so the SAME
 * standard renderer serves the subject's own fields, a slot fill's, and a
 * render surface's X/Y alike, and no design ever learns the difference.
 */
export interface BoundField {
  field: FieldSpec;
  /** The instance this row reads and writes. */
  targetId: string;
  /** Resolution subjects — one per selected instance for the subject's own
   *  fields, exactly one for a foreign target (a slot fill, a host fact). */
  subjects: Subject[];
  presets: PresetSpec[];
  /** Field ids some preset governs, for the secondary/inherited styling. */
  governed: Set<string>;
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Read-only right now for a model reason, not a permission one — a host
   *  fact on a render surface with no drag handles. */
  disabled?: boolean;
  /** One quiet line under the row, when the row needs to say who writes it
   *  ("tldraw writes this when you drag") or why it cannot be written. */
  note?: string;
  /**
   * `"none"` for a row with ONE layer and no cascade behind it — a render
   * surface's X. It suppresses the OVERRIDE tag and the trace disclosure,
   * which exist to explain which of several layers won.
   *
   * WHY it is on the BINDING and not on the FieldSpec: the same declaration
   * could in principle be bound to a subject that does have a cascade; what
   * decides is where this row's value comes from, which is exactly what a
   * binding says. Default `"cascade"`.
   */
  provenance?: "cascade" | "none";
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}

/** A member list, rendered by the shared Members control, plus what a
 *  section needs to place, head and fold it. */
export interface SectionList {
  id: string;
  label: string;
  count: number;
  /** The list's ROWS only — never its own header. See `SectionRow`'s
   *  "list" case for why. */
  node: ReactNode;
  /** What the one header carries on its right: the list's typed Add menu,
   *  and ⚙ where the list's parent is openable. */
  actions: SectionAction[];
}

export type SectionRow =
  | { kind: "field"; field: BoundField }
  /** Two fields declaring the same `group`, on one line. */
  | { kind: "pair"; fields: [BoundField, BoundField] }
  /**
   * A member list.
   *
   * WHY the list arrives here WITHOUT a header of its own: the bug Zach
   * screenshotted on 2026-09-12 — expanding "Right · 1 member ▼" showed the
   * compact summary line AND the list's own "▼ RIGHT ① ⚙ +" stacked on top
   * of each other. Two components each believed they owned the list's
   * header. Only one may: the section layer draws exactly one `FoldRow`
   * per list, and `members/List.tsx` renders headerless (`chrome: "none"`).
   * The list's verbs ride up to that one row as `actions`.
   */
  | { kind: "list"; list: SectionList };

/**
 * An icon action on a header row — Figma's `+` on Fill, Stroke, Effects
 * and Export.
 *
 * WHY actions live on the HEADER and not in a row: "+ new member" creates
 * things; it has no value, so it is not a field, and a fake field row for
 * each is how a panel grows hand-drawn buttons. Figma already answers this:
 * a title carries its verbs on the right.
 */
export interface SectionAction {
  id: string;
  /** A single glyph. Headers are titles, not toolbars. */
  glyph?: string;
  /** A ready-made control to render INSTEAD of a glyph button — the typed
   *  Add menu is a popover, not a one-shot verb, so it cannot be expressed
   *  as `glyph` + `onInvoke`. */
  node?: ReactNode;
  title: string;
  disabled?: boolean;
  onInvoke?: () => void;
}

export interface InspectorSection {
  /** "self" | "layout" | "appearance" | "header" | "body" | "footer" |
   *  "members" | "renderer" */
  id: string;
  label: string;
  rows: SectionRow[];
  actions: SectionAction[];
  /** A short live status line a collapsed section can still say something
   *  with ("3 ports", "hidden"). */
  summary?: string;
  /** This section's anatomy is switched off (a hidden Bar, a render surface
   *  with no canvas): a design may dim it and fold it, never disable it. */
  muted?: boolean;
  /**
   * True for a region the RENDER SURFACE owns rather than the component —
   * the canvas's X and Y. Every design renders it; this says which side of
   * the line it falls on, for the one design that draws that line.
   *
   * WHY it is a label and not a mechanism: the section itself is ordinary
   * (ordinary rows, ordinary fields, bound to a different subject, placed
   * last by build order). Without this bit a design wanting to mark the
   * boundary would have to match on the literal id "renderer", which is a
   * string comparison standing in for a fact the builder already knew.
   */
  hostOwned?: boolean;
}

/* ------------------------------------------------------------------ */
/* The variant seam                                                    */
/* ------------------------------------------------------------------ */

/**
 * Who is folded, for sections and member lists alike.
 *
 * WHY the HOST owns it and not each design: three designs owning three
 * copies is how this repo previously ended up with six implementations of
 * one provenance model and four answers. It also means switching design in
 * the picker keeps your folds — the panel is the same panel, drawn
 * differently — and that a section which gains its first member re-derives
 * its default instead of being stuck wherever it landed on mount.
 *
 * Ids are namespaced by the caller: `section:<id>`, `list:<instanceId>`.
 */
export interface FoldState {
  isOpen(id: string, defaultOpen: boolean): boolean;
  toggle(id: string, defaultOpen: boolean): void;
}

export interface SectionPanelProps {
  componentName: string;
  subjectCount: number;
  sections: InspectorSection[];
  density: Density;
  fold: FoldState;
  /** The tier switch, the density switch and the filter box, already
   *  rendered — every design keeps them, none of them owns them. */
  controlBar: ReactNode;
  /** Non-empty when a filter or tier is hiding rows, so a design can say so
   *  rather than silently showing four rows of thirty. */
  notice: ReactNode;
}

export interface SectionPanelVariant {
  id: string;
  label: string;
  blurb: string;
  /** The one axis this design differs from the others on. */
  axis: string;
  /**
   * WHY there is no `renderer` flag here any more: it used to gate whether
   * the host-owned "Renderer · <surface>" section was built at all, which
   * made a region of the panel a property of the DESIGN rather than of the
   * subject. Zach, 2026-09-12: "for p3 renderer section I don't think we
   * need a new thing to the model, we can probably just support it within
   * the existing model... its just another header and fields." It is built
   * whenever the subject has host facts, and every design renders it,
   * because there was never anything design-specific about it.
   */
  Panel: (props: SectionPanelProps) => ReactNode;
}

/**
 * What every section design owes — the settled picks, restated as a
 * checklist because three designs are built independently and each would
 * otherwise drop a different one. `demos/capture-inspector-v5b.mjs`
 * asserts every line of it in a real browser.
 *
 * 1. Full bleed — the panel paints no card, no border, no max-width; the
 *    inspector column is the frame.
 * 2. Every control is one of STANDARD_CONTROLS, tagged with its name.
 * 3. A section is a title and a hairline. No box, no fill. (S1)
 * 4. Every section folds, and its chevron is invisible at rest while the
 *    section is open — hover or keyboard focus reveals it. (S2, corrected)
 * 5. A folded thing is ONE line: label, muted summary, chevron. (S5)
 * 6. Exactly one header per member list, expanded or collapsed. (the bug)
 * 7. No helper text. Not under a list, not under a section, nowhere.
 * 8. A row's provenance is `FigmaDense`'s own OVERRIDE / MIXED tag —
 *    literally that component, never a copy of it.
 */
export const SECTION_PANEL_CONTRACT = [
  "full bleed, no card",
  "every control from the standard list",
  "a section is a title and a hairline",
  "chevron on hover, not at rest",
  "folded is one compact line",
  "one header per list",
  "no helper text",
  "one row renderer, tag and all",
] as const;
