import type { ReactNode } from "react";
import type { MemberList } from "../members-section";

/**
 * How the inspector places member lists beside the scalar property rows.
 *
 * WHY this is a contract with five implementations: Zach, 2026-09-11 —
 * "a member list is not a field … it doesn't play as nicely with the
 * compact property list, which mostly is just setting scalars. Please make
 * five variants for how you recommend we reconcile both … note that a
 * block will have multiple member lists related to different slots."
 *
 * The layout receives the FIELDS PANEL already rendered (the chosen Figma
 * Dense design, untouched) and the member lists already rendered (the
 * List control, untouched) and decides only their arrangement. Nothing
 * below may reach into either.
 */
export interface InspectorLayoutProps {
  /** The component's name, for a heading a layout may want. */
  subjectName: string;
  /** The scalar rows: the panel design's output. Always present. */
  panel: ReactNode;
  /** Zero, one or many member lists. A Block has seven, with regions. */
  lists: MemberList[];
  /** True when the subject fills a slot itself — a layout may say so. */
  isSlotFill: boolean;
}

export interface InspectorLayoutVariant {
  id: string;
  label: string;
  blurb: string;
  /** The exact stock part it leans on, or "none". */
  stockPart: string;
  Layout: (props: InspectorLayoutProps) => ReactNode;
}

/**
 * What every layout owes the user.
 * 1. Every list is reachable without leaving the inspector, and every
 *    field is still reachable — hiding is allowed, losing is not.
 * 2. Lists keep their order and, when they have regions, read grouped by
 *    region in anatomy order (header, body, footer).
 * 3. A count is visible for every list even when its rows are not.
 * 4. With zero lists the layout is exactly the panel — no empty chrome.
 * 5. The panel and the List control are rendered as given, never restyled
 *    or re-implemented.
 */
export const INSPECTOR_LAYOUT_CONTRACT = [
  "every list and every field reachable",
  "lists in order, grouped by region",
  "count visible for every list",
  "zero lists = just the panel",
  "panel and List rendered as given",
] as const;
