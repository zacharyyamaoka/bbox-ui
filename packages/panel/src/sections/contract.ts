import type { ReactNode } from "react";
import type { FieldSpec, FieldValue, PresetSpec } from "@bbox-ui/schema";
import type { Subject } from "../fieldModel";

/**
 * SECTIONS — one panel, five designs, one control vocabulary.
 *
 * WHY this contract exists, in Zach's own words (2026-09-12): "I don't like
 * how with the header you are kinda doing this very custom control
 * interface. Same thing with ports. I think it's great if we want to have
 * different types of controls, but all controls should kinda be from a
 * standard control list so we are getting consistency across the entire
 * application." And: "what would make sense here is to see this panel split
 * in between properties/members related to the block, the header, footer,
 * body, ports. etc grouped together."
 *
 * Both sentences are one architectural fact. The old inspector had TWO
 * escape hatches out of the field engine — `RegionHeader` (a Bar's real
 * fields hand-drawn as hidden ☐ · line ☑ · md ▾ · ⚙) and
 * `ArrangementSection`/`PlacementSection` (synthetic values with no
 * FieldSpec at all) — and both existed for the same reason: there was no
 * way to say "these rows belong under the Header sub-header", so the only
 * way to put a caption above a control was to draw the control by hand.
 *
 * Give the panel sections and both hatches close. A section is a labelled
 * run of STANDARD rows plus the member lists that belong to the same piece
 * of anatomy; a Bar's `hidden`/`line`/`size` are ordinary fields of the Bar
 * rendered in the Header section; Arrangement and Placement are ordinary
 * FieldSpecs over the Block's arrangement model. Nothing in the inspector
 * draws its own control any more.
 */

/* ------------------------------------------------------------------ */
/* The standard control list                                           */
/* ------------------------------------------------------------------ */

/**
 * Every editable control the inspector may draw. This list IS the
 * consistency guarantee: a row renders one of these six and nothing else,
 * every one carries `data-standard-control="<id>"`, and
 * `demos/capture-inspector-v5.mjs` fails the build if any control inside
 * the inspector column lacks that attribute.
 *
 * Adding a value that needs a control not in this list means ADDING IT
 * HERE — once, reused everywhere — never drawing it beside the engine.
 * `flags` is exactly that: the Block's live port edges are a SET, which
 * none of the first five could express, so `FieldKind` grew a sixth member
 * rather than the Arrangement section keeping its four hand-rolled T/R/B/L
 * buttons.
 */
export const STANDARD_CONTROLS = ["segmented", "dropdown", "number", "toggle", "text", "flags"] as const;
export type StandardControl = (typeof STANDARD_CONTROLS)[number];

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/**
 * One field, already bound to the instance it writes.
 *
 * WHY the binding and not a bare FieldSpec: a Block's inspector shows the
 * Bar's `hidden` in its Header section, and that row must write the BAR,
 * not the Block. The old code solved this by giving `RegionHeader` a
 * direct `onSetProp(fill.id, …)`; here the target rides on the row, so the
 * SAME standard renderer serves the subject's own fields and a slot fill's
 * alike and no variant ever learns the difference.
 */
export interface BoundField {
  field: FieldSpec;
  /** The instance this row reads and writes. */
  targetId: string;
  /** Resolution subjects — one per selected instance for the subject's own
   *  fields, exactly one for a foreign target (a slot fill). */
  subjects: Subject[];
  presets: PresetSpec[];
  /** Field ids some preset governs, for the secondary/inherited styling. */
  governed: Set<string>;
  toSubject?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Read-only right now for a model reason, not a permission one — a
   *  Placement's `t` while its Arrangement is in Auto mode. */
  disabled?: boolean;
  /** One quiet line under the row, when the disable needs explaining. */
  note?: string;
  onChange: (fieldId: string, value: FieldValue) => void;
  onClearOverride: (fieldId: string) => void;
}

/** A member list, rendered by the shared Members control, plus what a
 *  section needs to place and fold it. */
export interface SectionList {
  id: string;
  label: string;
  count: number;
  node: ReactNode;
}

export type SectionRow =
  | { kind: "field"; field: BoundField }
  /** Two fields declaring the same `group`, on one line. */
  | { kind: "pair"; fields: [BoundField, BoundField] }
  | { kind: "list"; list: SectionList }
  /** The preset picker for a selector, rendered by the page. */
  | { kind: "node"; id: string; node: ReactNode };

/**
 * An icon action on the section's own title row — Figma's `+` on Fill,
 * Stroke, Effects and Export.
 *
 * WHY actions live on the SECTION and not in a row: "+ new state" and
 * "Add member" create things; they have no value, so they are not fields,
 * and a fake field row for each is how the Arrangement block grew its
 * pill-shaped `＋ new state` button in the first place. Figma already
 * answers this: a section title carries its verbs on the right.
 */
export interface SectionAction {
  id: string;
  /** A single glyph. Sections are titles, not toolbars. */
  glyph: string;
  title: string;
  disabled?: boolean;
  onInvoke: () => void;
}

export interface InspectorSection {
  /** "block" | "layout" | "appearance" | "header" | "body" | "footer" | "ports" | … */
  id: string;
  label: string;
  rows: SectionRow[];
  actions: SectionAction[];
  /** A short live status line a collapsed section can still say something with
   *  ("3 ports", "hidden"). */
  summary?: string;
  /** This section's anatomy is switched off (a hidden Bar): a design may
   *  fold everything but the toggle that brings it back. */
  muted?: boolean;
}

/* ------------------------------------------------------------------ */
/* The variant seam                                                    */
/* ------------------------------------------------------------------ */

export interface SectionPanelProps {
  componentName: string;
  subjectCount: number;
  sections: InspectorSection[];
  /** The tier switch + filter box, already rendered — every design keeps
   *  them, none of them owns them. */
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
  Panel: (props: SectionPanelProps) => ReactNode;
}

/**
 * What every section design owes, restated as a checklist because five are
 * built independently and each would otherwise drop a different one.
 *
 * 1. Full bleed — the panel paints no card, no border, no max-width; the
 *    inspector column is the frame. ("I don't like how this block property
 *    thing is kinda in its own box not spreading the full width.")
 * 2. Every control is one of STANDARD_CONTROLS, tagged with its name.
 * 3. Every section is reachable and every row inside it is reachable.
 * 4. A member list keeps ONE header — the list's own — and its fold
 *    chevron sits to the left of that header's existing label, appearing
 *    only once the list has a member.
 * 5. No helper text. Not under a list, not under a section, nowhere.
 * 6. A section title reads as a title: bold, left, its icon actions right.
 */
export const SECTION_PANEL_CONTRACT = [
  "full bleed, no card",
  "every control from the standard list",
  "every section and row reachable",
  "one header per list, chevron on it, only when filled",
  "no helper text",
  "title left, actions right",
] as const;
