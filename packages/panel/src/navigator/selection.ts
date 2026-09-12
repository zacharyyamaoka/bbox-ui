/**
 * File-manager selection semantics over a flat list of VISIBLE row ids, in
 * display order. Host-neutral: no React, no DOM.
 *
 * WHY one reducer and not per-navigator logic: two of the navigator
 * variants get these semantics from their library (react-arborist,
 * react-aria's Tree); the others do not, and the whole point of comparing
 * five is that shift-click means the same thing in all five. Zach,
 * 2026-09-11: "more ergonomic shift multi select" — the ergonomics are the
 * Finder/VS Code ones, stated here once:
 *
 *   click            → exactly this row, and it becomes the anchor
 *   ctrl / cmd click → toggle this row, it becomes the anchor
 *   shift click      → the range from the anchor to this row over the
 *                      visible order; with ctrl as well, added to what was
 *                      already selected instead of replacing it
 */
export interface ClickModifiers {
  shift?: boolean;
  /** ctrl on Linux/Windows, cmd on a Mac. */
  toggle?: boolean;
}

export interface SelectionState {
  selected: string[];
  /** The row a shift-click ranges from. */
  anchor: string | null;
}

export function clickSelect(visible: string[], state: SelectionState, id: string, mods: ClickModifiers = {}): SelectionState {
  if (mods.shift) {
    const anchor = state.anchor && visible.includes(state.anchor) ? state.anchor : id;
    const a = visible.indexOf(anchor);
    const b = visible.indexOf(id);
    if (a < 0 || b < 0) return { selected: [id], anchor: id };
    const range = visible.slice(Math.min(a, b), Math.max(a, b) + 1);
    const base = mods.toggle ? state.selected.filter((s) => !range.includes(s)) : [];
    // The anchor does not move on a shift-click, so a second shift-click
    // re-ranges from the same place — Finder's behaviour, not VS Code's.
    return { selected: [...base, ...range], anchor };
  }
  if (mods.toggle) {
    const on = state.selected.includes(id);
    return { selected: on ? state.selected.filter((s) => s !== id) : [...state.selected, id], anchor: id };
  }
  return { selected: [id], anchor: id };
}

/** Arrow-key movement: the row `delta` steps from the focused one, clamped. */
export function stepRow(visible: string[], focusedId: string | null, delta: number): string | null {
  if (visible.length === 0) return null;
  const i = focusedId ? visible.indexOf(focusedId) : -1;
  if (i < 0) return delta > 0 ? visible[0]! : visible[visible.length - 1]!;
  return visible[Math.max(0, Math.min(visible.length - 1, i + delta))]!;
}

/**
 * The rows a tree paints, top to bottom, given which nodes are folded. A
 * folded node's descendants are not visible, so a shift-range cannot reach
 * into them — exactly what a person expects from a folded folder.
 */
export function visibleRows<T extends { id: string; children: T[] }>(roots: T[], folded: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const walk = (n: T) => {
    out.push(n.id);
    if (!folded.has(n.id)) n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}
