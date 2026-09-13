import type { ReactNode } from "react";
import type { InstanceNode } from "@bbox-ui/panel";

/**
 * The instance navigator: the left column's list of what is on the bench.
 *
 * WHY it is a contract with five implementations: the list became a tree
 * the moment a Stack could hold a Port, and Zach's feedback (2026-09-11)
 * was exact — "its actually basically turning into a tree", "instead of
 * check boxes … more ergonomic shift multi select", "to show selected now
 * you highlight the rows", "we definitely don't need to reinvent the wheel
 * here". So each variant is built on a DIFFERENT stock tree part and the
 * comparison is about what each part gives for free, not about styling.
 *
 * Every variant receives the same tree (`instanceTree`) and the same
 * selection, and reports the same things back. The page owns all state.
 */
export interface NavigatorProps {
  roots: InstanceNode[];
  selectedIds: string[];
  /** Replaces the whole selection. A variant that computes ranges itself
   *  reports the resulting set; one that uses `clickSelect` does the same. */
  onSelectionChange: (ids: string[]) => void;
  /**
   * Re-parent / reorder by drag: `id` lands in `parentId`'s members at
   * `index` (null parent = the top level). Wired only by variants whose
   * stock part ships drag and drop; the others leave drag out rather than
   * hand-roll it — that is the whole "don't reinvent the wheel" point.
   */
  onMove?: (id: string, parentId: string | null, index: number) => void;
  /** Ask before every drop: may `parentId` (null = top level) hold `id`? */
  canDrop?: (id: string, parentId: string | null) => boolean;
  /** One glyph per component type, from @bbox-ui/panel's `typeGlyph`. */
  glyph: (type: string) => string;
}

export interface NavigatorVariant {
  id: string;
  label: string;
  /** One sentence on what this design is optimising for. */
  blurb: string;
  /** The exact exported stock part it is built on — "none (vendored shadcn
   *  Sidebar)" for the zero-dependency one. */
  stockPart: string;
  Navigator: (props: NavigatorProps) => ReactNode;
}

/**
 * What every navigator owes the user. Five agents build these against
 * five different libraries; without the list each would drop a different
 * one and call it a library limitation.
 *
 * 1. Every instance is a row; members sit indented under their parent
 *    behind a disclosure that folds.
 * 2. Click selects exactly that row; ctrl/cmd-click toggles; shift-click
 *    ranges over the VISIBLE rows (a folded subtree is not in the range).
 * 3. Selected rows are highlighted. No checkboxes anywhere.
 * 4. Arrow keys move the selection; Left folds, Right unfolds.
 * 5. A row shows the type glyph, the title, and the type in a fainter hand.
 * 6. Where the stock part offers drag and drop, dragging re-parents and
 *    reorders, and a drop the parent cannot accept is refused visibly.
 */
export const NAVIGATOR_CONTRACT = [
  "tree with folding disclosures",
  "click / ctrl-click / shift-click over visible rows",
  "highlighted rows, no checkboxes",
  "arrow keys move, left/right fold",
  "glyph + title + faint type per row",
  "drag re-parents where the part offers it, refusing bad drops",
] as const;
