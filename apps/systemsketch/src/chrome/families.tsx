// src/chrome/families.tsx — the ROWS behind the dock's families.
//
// The app's own family (System design) is built from the kit registry and is
// declared next to the dock that mounts it (src/chrome/Toolbar/dock.tsx). What lives
// here is the other half: the rows that wrap tldraw's OWN stock tools, so
// adding "star" to the shape popout is a data edit and never a component one —
// the whole point of `@trunk/components/toolDock`'s `FamilyDeclaration`, whose
// donor hand-edited six places per family.
// WHY this stays flat rather than moving into `Toolbar/`: `Toolbar/dock.tsx`,
// `DevMenu/devtools.tsx` and `ShareMenu/appSettings.tsx` all read these rows.
// Shared by three components, owned by none — putting it inside any one of
// them would make the other two reach into a sibling's folder. See ./README.md.
import type { ReactNode } from "react";
import {
  Circle,
  CornerDownRight,
  Diamond,
  Frame,
  Hand,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo,
  Slash,
  Square,
  Triangle,
  Type,
} from "lucide-react";

import type { ToolItem, ToolSection } from "@trunk/editor/toolDock";
import { arrowPresetSection, type ArrowPreset } from "@trunk/editor/toolPreferences";

/**
 * tldraw's `geo` tool NAMES a family of shapes; WHICH one it draws lives in a
 * separate live style (`GeoShapeGeoStyle`). So these ids are geo STYLE values
 * doubling as dock row ids, and picking one sets the style before arming
 * `geo` — `resolveCurrentTool`'s case 2, and the reason `GEO_VARIANT_IDS`
 * below is exported rather than inferred from "everything in this family"
 * (line is in the same family and is a real tool id; the arrow rows are
 * presets of the one `arrow` tool).
 */
export const GEO_VARIANTS: readonly ToolItem[] = [
  { id: "rectangle", label: "Rectangle", icon: <Square />, shortcutHint: "R" },
  { id: "ellipse", label: "Ellipse", icon: <Circle />, shortcutHint: "O" },
  { id: "triangle", label: "Triangle", icon: <Triangle /> },
  { id: "diamond", label: "Diamond", icon: <Diamond /> },
];

export const GEO_VARIANT_IDS: ReadonlySet<string> = new Set(GEO_VARIANTS.map((variant) => variant.id));

export const LINE_TOOLS: readonly ToolItem[] = [{ id: "line", label: "Line", icon: <Slash />, shortcutHint: "L" }];

/**
 * The arrows, one row per preset — the trunk builds the rows (order, labels,
 * "A / A × 2 / A × 3" hints, the "Arrows · repeat A to cycle" heading) from
 * the same cycle the `A` key walks, so the menu cannot drift from the key;
 * this app only chooses the glyphs. Row ids are `arrow-<preset>`, which
 * ./dock.tsx turns back into "arm the ONE arrow tool with this preset".
 *
 * Glyphs mirror the archive's tldraw icons (`tool-arrow`, `arrow-arc`,
 * `arrow-elbow`, toolbarIntegration.ts:60-64) in this dock's lucide set.
 */
const ARROW_PRESET_ICONS: Readonly<Record<ArrowPreset, ReactNode>> = {
  straight: <MoveUpRight />,
  curve: <Redo />,
  elbow: <CornerDownRight />,
};

export const ARROW_PRESET_SECTION: ToolSection = arrowPresetSection(ARROW_PRESET_ICONS);

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
