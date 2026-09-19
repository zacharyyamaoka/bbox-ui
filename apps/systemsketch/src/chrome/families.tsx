// src/chrome/families.tsx — the ROWS behind the dock's families.
//
// The app's own family (System design) is built from the kit registry and is
// declared next to the dock that mounts it (src/chrome/dock.tsx). What lives
// here is the other half: the rows that wrap tldraw's OWN stock tools, so
// adding "star" to the shape popout is a data edit and never a component one —
// the whole point of `@trunk/components/toolDock`'s `FamilyDeclaration`, whose
// donor hand-edited six places per family.
import type { ReactNode } from "react";
import {
  Circle,
  Diamond,
  Frame,
  Hand,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Slash,
  Square,
  Triangle,
  Type,
} from "lucide-react";

import type { ToolItem } from "@trunk/components/toolDock";

/**
 * tldraw's `geo` tool NAMES a family of shapes; WHICH one it draws lives in a
 * separate live style (`GeoShapeGeoStyle`). So these ids are geo STYLE values
 * doubling as dock row ids, and picking one sets the style before arming
 * `geo` — `resolveCurrentTool`'s case 2, and the reason `GEO_VARIANT_IDS`
 * below is exported rather than inferred from "everything in this family"
 * (line and arrow are in the same family and are real tool ids).
 */
export const GEO_VARIANTS: readonly ToolItem[] = [
  { id: "rectangle", label: "Rectangle", icon: <Square />, shortcutHint: "R" },
  { id: "ellipse", label: "Ellipse", icon: <Circle />, shortcutHint: "O" },
  { id: "triangle", label: "Triangle", icon: <Triangle /> },
  { id: "diamond", label: "Diamond", icon: <Diamond /> },
];

export const GEO_VARIANT_IDS: ReadonlySet<string> = new Set(GEO_VARIANTS.map((variant) => variant.id));

export const LINE_TOOLS: readonly ToolItem[] = [
  { id: "line", label: "Line", icon: <Slash />, shortcutHint: "L" },
  { id: "arrow", label: "Arrow", icon: <MoveUpRight />, shortcutHint: "A" },
];

export const DRAW_TOOLS: readonly ToolItem[] = [
  { id: "draw", label: "Draw", icon: <Pencil />, shortcutHint: "D" },
  { id: "highlight", label: "Highlight", icon: <Highlighter />, shortcutHint: "⇧D" },
];

/** The cells with no popout at all — tldraw tools that name exactly one thing. */
export const SIMPLE_TOOLS: readonly { id: string; label: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 /> },
  { id: "hand", label: "Hand", icon: <Hand /> },
  { id: "frame", label: "Frame", icon: <Frame /> },
  { id: "text", label: "Text", icon: <Type /> },
];
