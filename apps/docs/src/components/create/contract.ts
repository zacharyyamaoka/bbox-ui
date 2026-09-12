import type { ComponentEntry, Instance } from "@bbox-ui/panel";
import type { PortEdgeId } from "@bbox-ui/core";

/**
 * The seam between the create page's shell and its viewport.
 *
 * WHY a written contract rather than one big component: the shell (sidebar,
 * inspector column, theme) and the four viewport tabs are built separately,
 * and the one thing that must not diverge is who owns state. The page owns
 * ALL of it — instances, selection, canvas positions. Every tab is a view
 * over the same arrays, which is the whole point: move a node in React Flow,
 * switch to tldraw, and it is the same node in the same place.
 *
 * A tab that kept its own copy of the selection would make the tabs four
 * different apps that happen to share a header.
 */
/**
 * Two axes, not one strip. Zach, 2026-09-11: "3 different renders (DOM,
 * React Flow, tldraw) on the left side; 2 different views (preview, code) on
 * the right side — that way you get 6 different views in total."
 *
 * WHY that matters beyond layout: Code was a sibling of DOM Preview, which
 * made it read as "the DOM's code". It is a VIEW of whichever render is
 * chosen — the JSX for the DOM, the node array for React Flow, the shape
 * records for tldraw — so it lives on its own axis and applies to all three.
 */
export type Render = "dom" | "reactflow" | "tldraw";
export type View = "preview" | "code";

export const RENDERS: { id: Render; label: string; canMove: boolean }[] = [
  { id: "dom", label: "DOM", canMove: false },
  { id: "reactflow", label: "React Flow", canMove: true },
  { id: "tldraw", label: "tldraw", canMove: true },
];

export const VIEWS: { id: View; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "code", label: "Code" },
];

/** Where an instance sits on a canvas. Kept OUT of `Instance.props`: position
 *  is a fact about a host, not a property of the component, and putting it in
 *  props would put an x/y row in the inspector for every component. */
export interface CanvasPosition {
  x: number;
  y: number;
}

export interface ViewportProps {
  /** The component registry, for rendering an instance by its type. */
  entries: ComponentEntry[];
  /** Every instance on the bench, members included. */
  instances: Instance[];
  /** The instances no other instance holds — what a render draws. Members
   *  are drawn inside their parent by `renderInstance`, never as nodes. */
  roots: Instance[];
  /** Select one instance by id from inside a rendered parent (a member
   *  click); `additive` extends the selection. */
  onSelectInstance: (id: string, additive: boolean) => void;
  selectedIds: string[];
  positions: Record<string, CanvasPosition>;
  /** Replaces the whole selection. A canvas that supports marquee or
   *  shift-click reports the resulting set, never a delta. */
  onSelectionChange: (ids: string[]) => void;
  onPositionsChange: (next: Record<string, CanvasPosition>) => void;
  /** Which render and which view are showing. The page owns both so the
   *  choice can be persisted and so a deep link can open on a canvas. */
  render: Render;
  view: View;
  onRenderChange: (render: Render) => void;
  onViewChange: (view: View) => void;
  /** dnd-kit owns every Port drag (Zach, 2026-09-12) — see port-dnd.tsx.
   *  The DOM render and tldraw are wired for it; React Flow simply never
   *  receives this and renders its Ports undraggable. */
  onMovePort?: (blockId: string, portId: string, edge: PortEdgeId, target: { index: number } | { t: number }) => void;
}

/** Default position for an instance that has never been placed. Laid out in a
 *  column so a fresh bench is legible on a canvas without auto-layout. */
export function defaultPosition(index: number): CanvasPosition {
  return { x: 80 + (index % 3) * 220, y: 80 + Math.floor(index / 3) * 140 };
}
