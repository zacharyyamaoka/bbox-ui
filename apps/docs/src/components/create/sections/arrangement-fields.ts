import { ALL_EDGES, type Arrangement, type ArrangementMode, type Placement, type PortEdgeId } from "@bbox-ui/core";
import type { FieldSpec, FieldValue } from "@bbox-ui/schema";
import type { Instance } from "@bbox-ui/panel";

/**
 * Arrangement and Placement, expressed as ORDINARY FieldSpecs.
 *
 * WHY this file replaces `arrangement-section.tsx`'s hand-drawn controls:
 * Zach, 2026-09-12, of the ARRANGEMENT block (Active ▾ · ＋new state ·
 * Auto|Custom · T R B L · Grouping ▾) — "I don't like how with the header
 * you are kinda doing this very custom control interface. Same thing with
 * ports… all controls should kinda be from a standard control list so we
 * are getting consistency across the entire application."
 *
 * Nothing about an Arrangement needed a custom control. It needed a
 * DECLARATION, which is what a FieldSpec is: `mode` is two named options,
 * `grouping` is a picker, `t` is a bounded number, `edge` is one of four.
 * Only the live-edge SET had no matching control — so `FieldKind` grew
 * `flags` once, in the standard list, instead of this file growing four
 * toggle buttons of its own.
 *
 * These fields are synthetic in one precise sense: their values do not live
 * in `instance.props`, they live in `instance.arrangements` / the Block's
 * `placements` map. The section builder therefore hands the row a synthetic
 * prop bag alongside a writer that routes each id back to the real
 * workbench op. Everything downstream — the row, the control, the
 * provenance dot, Mixed — is the same code every other field uses.
 */

export const ARRANGEMENT_ACTIVE = "arrangement:active";
export const ARRANGEMENT_MODE = "arrangement:mode";
export const ARRANGEMENT_EDGES = "arrangement:edges";
export const ARRANGEMENT_GROUPING = "arrangement:grouping";

export const PLACEMENT_EDGE = "placement:edge";
export const PLACEMENT_ORDER = "placement:order";
export const PLACEMENT_T = "placement:t";
export const PLACEMENT_GROUP = "placement:group";
export const PLACEMENT_LOCKED = "placement:locked";

const EDGE_LABEL: Record<PortEdgeId, string> = { top: "T", right: "R", bottom: "B", left: "L" };

/** The Block's own arrangement rows. */
export function arrangementFields(block: Instance, arrangement: Arrangement): FieldSpec[] {
  const arrangements = block.arrangements ?? [arrangement];
  const grouping = arrangement.grouping;
  return [
    {
      // WHY "Active" and not "State": his word for these is "states", but
      // the Block's appearance `state` field draws its own State row a few
      // sections up the same column. Two rows reading State with different
      // pickers is the trap; this keeps his word without the collision.
      id: ARRANGEMENT_ACTIVE,
      label: "Active",
      kind: "segments",
      defaultValue: arrangement.id,
      options: arrangements.map((a) => ({ value: a.id, label: a.label })),
      hint: "Which arrangement state the Block is showing. Duplicate it with ⧉ on this section's title.",
    },
    {
      id: ARRANGEMENT_MODE,
      label: "Mode",
      kind: "segments",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Auto" },
        { value: "custom", label: "Custom" },
      ],
      hint: "Auto spaces the ports evenly along each edge; Custom keeps the t you set.",
    },
    {
      id: ARRANGEMENT_EDGES,
      label: "Edges",
      kind: "flags",
      defaultValue: ALL_EDGES.join(","),
      options: ALL_EDGES.map((edge) => ({ value: edge, label: EDGE_LABEL[edge] })),
      hint: "Which edges are live in this state. A port on an edge switched off is parked, never lost.",
    },
    {
      id: ARRANGEMENT_GROUPING,
      label: "Grouping",
      kind: "segments",
      defaultValue: "",
      options: [
        { value: "", label: "None" },
        ...(grouping ? [{ value: grouping.id, label: grouping.label }] : []),
        { value: "__new__", label: "+ New grouping set" },
      ],
    },
  ];
}

export function arrangementProps(arrangement: Arrangement): Record<string, unknown> {
  return {
    [ARRANGEMENT_ACTIVE]: arrangement.id,
    [ARRANGEMENT_MODE]: arrangement.mode,
    [ARRANGEMENT_EDGES]: arrangement.edges.join(","),
    [ARRANGEMENT_GROUPING]: arrangement.grouping?.id ?? "",
  };
}

export interface ArrangementWriters {
  onSetArrangement: (blockId: string, id: string) => void;
  onSetArrangementMode: (blockId: string, mode: ArrangementMode) => void;
  onToggleArrangementEdge: (blockId: string, edge: PortEdgeId, on: boolean) => void;
  onSetArrangementGrouping: (blockId: string, setId: string | null) => void;
}

/** Routes one synthetic field id back to the real op. */
export function writeArrangement(
  blockId: string,
  arrangement: Arrangement,
  writers: ArrangementWriters,
  fieldId: string,
  value: FieldValue,
): void {
  if (fieldId === ARRANGEMENT_ACTIVE) return writers.onSetArrangement(blockId, String(value));
  if (fieldId === ARRANGEMENT_MODE) return writers.onSetArrangementMode(blockId, String(value) as ArrangementMode);
  if (fieldId === ARRANGEMENT_GROUPING) {
    const next = String(value);
    return writers.onSetArrangementGrouping(blockId, next === "" ? null : next);
  }
  if (fieldId === ARRANGEMENT_EDGES) {
    // The flags control hands back the whole set; `toggleEdge` is per-edge,
    // so the diff against what is live now is computed here rather than
    // widening the model's op for one caller.
    const next = new Set(String(value).split(",").filter(Boolean) as PortEdgeId[]);
    for (const edge of ALL_EDGES) {
      const was = arrangement.edges.includes(edge);
      const now = next.has(edge);
      if (was !== now) writers.onToggleArrangementEdge(blockId, edge, now);
    }
  }
}

/** One selected Port's placement inside the Block's active arrangement. */
export function placementFields(arrangement: Arrangement, placement: Placement): FieldSpec[] {
  const auto = arrangement.mode === "auto";
  const edgeOptions = [
    // A parked port's stored edge sits outside the live set; injecting it
    // keeps `value` truthful so re-picking what LOOKS selected is a no-op
    // rather than a silent overwrite (the same trap the old select had).
    ...(arrangement.edges.includes(placement.edge) ? [] : [{ value: placement.edge, label: `${placement.edge} (parked)` }]),
    ...arrangement.edges.map((edge) => ({ value: edge, label: edge })),
  ];
  return [
    { id: PLACEMENT_EDGE, label: "Edge", kind: "segments", defaultValue: placement.edge, options: edgeOptions },
    { id: PLACEMENT_ORDER, label: "Order", kind: "number", defaultValue: 0, min: 0, step: 1, group: "along" },
    {
      id: PLACEMENT_T,
      label: "t",
      kind: "number",
      defaultValue: 0,
      min: 0,
      max: 1,
      step: 0.01,
      group: "along",
      // WHY the reason rides on `hint` (the label's tooltip) and not on a
      // visible note under the row: every rendered sentence in this panel
      // is one Zach asked to delete. A disabled control that explains
      // itself on hover costs no line.
      hint: auto
        ? "Derived from even spacing while this state is Auto. Switch Mode to Custom to set it."
        : "Position along the edge, 0 to 1.",
    },
    { id: PLACEMENT_GROUP, label: "Group", kind: "text", defaultValue: "" },
    {
      id: PLACEMENT_LOCKED,
      label: "Function port",
      kind: "toggle",
      defaultValue: false,
      hint: "Pins this port to the header-left corner, outside every lane. At most one per Block.",
    },
  ];
}

export function placementProps(port: Instance, placement: Placement): Record<string, unknown> {
  return {
    [PLACEMENT_EDGE]: placement.edge,
    [PLACEMENT_ORDER]: placement.order,
    [PLACEMENT_T]: Math.round(placement.t * 100) / 100,
    [PLACEMENT_GROUP]: placement.group ?? "",
    [PLACEMENT_LOCKED]: port.locked === true,
  };
}

export function writePlacement(
  portId: string,
  onSetPortPlacement: (portId: string, patch: Partial<Placement> & { locked?: boolean }) => void,
  fieldId: string,
  value: FieldValue,
): void {
  if (fieldId === PLACEMENT_EDGE) return onSetPortPlacement(portId, { edge: String(value) as PortEdgeId });
  if (fieldId === PLACEMENT_ORDER) return onSetPortPlacement(portId, { order: Math.max(0, Math.round(Number(value) || 0)) });
  if (fieldId === PLACEMENT_T) return onSetPortPlacement(portId, { t: Math.min(1, Math.max(0, Number(value) || 0)) });
  if (fieldId === PLACEMENT_GROUP) return onSetPortPlacement(portId, { group: String(value) === "" ? undefined : String(value) });
  if (fieldId === PLACEMENT_LOCKED) return onSetPortPlacement(portId, { locked: value === true });
}

/** True for every id this module owns — the section builder uses it to keep
 *  synthetic rows out of the ordinary props path. */
export function isSyntheticFieldId(id: string): boolean {
  return id.startsWith("arrangement:") || id.startsWith("placement:");
}
