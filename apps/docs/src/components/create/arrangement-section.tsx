"use client";

import type { CSSProperties } from "react";
import { ALL_EDGES, type Arrangement, type ArrangementMode, type Placement, type PortEdgeId } from "@bbox-ui/core";
import type { Instance } from "@bbox-ui/panel";
import { activeArrangement } from "@bbox-ui/panel";
import type { MemberListActions } from "./members-section";

/** What `PlacementSection` needs — one op, not the whole
 *  `MemberListActions` (it isn't reached through a member list, see
 *  `inspector-column.tsx`, so there is no full actions object at hand). */
export interface PlacementActions {
  onSetPortPlacement: MemberListActions["onSetPortPlacement"];
}

/**
 * Zach's 2026-09-12 ruling gave a Block "n Arrangements (states)" and gave
 * each Port a placement PER arrangement — two inspector surfaces, one file:
 * `ArrangementSection` (the Block's own states — which one is active, its
 * mode, its live edges, its grouping set) and `PlacementSection` (one
 * selected Port's placement WITHIN the active arrangement). Kept together
 * because they read from and write through the same handful of workbench
 * ops (see `MemberListActions`) and neither makes sense without the other's
 * vocabulary in view.
 *
 * Both keep the Inline rows grammar already established by
 * `inspector-layout/InlineRows.tsx`: a 92px label cell, ~11px type, a
 * transparent-background control row — so these read as siblings of the
 * scalar field rows above them, not a second inspector bolted on.
 */

const rowStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "center",
  gap: 6,
  minHeight: 22,
  padding: "1px 2px",
};
const labelCellStyle: CSSProperties = {
  width: 92,
  flexShrink: 0,
  fontSize: 11,
  color: "var(--bbox-panel-fg, #444)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const controlWrapStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 };
const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 22,
  fontSize: 11,
  borderRadius: 4,
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
  padding: "0 4px",
};
const numberStyle: CSSProperties = { ...selectStyle, flex: "0 0 64px" };
const segmentWrapStyle: CSSProperties = {
  display: "flex",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 999,
  overflow: "hidden",
  flex: 1,
};
function segmentButtonStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    height: 20,
    fontSize: 10.5,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: active ? "var(--bbox-panel-surface, #fff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
  };
}
function edgeButtonStyle(active: boolean): CSSProperties {
  return {
    width: 22,
    height: 20,
    fontSize: 9.5,
    borderRadius: 4,
    border: "1px solid var(--bbox-panel-border, #d6d6de)",
    cursor: "pointer",
    background: active ? "var(--bbox-panel-fg, #222)" : "transparent",
    color: active ? "var(--bbox-panel-surface, #fff)" : "var(--bbox-panel-fg-muted, #5c5c66)",
  };
}
const sectionCaptionStyle: CSSProperties = {
  padding: "6px 2px 2px",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
};
const iconButtonStyle: CSSProperties = {
  height: 20,
  padding: "0 8px",
  fontSize: 11,
  borderRadius: 999,
  border: "1px dashed var(--bbox-panel-border, #d6d6de)",
  background: "transparent",
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
  cursor: "pointer",
};

const EDGE_LABEL: Record<PortEdgeId, string> = { top: "T", right: "R", bottom: "B", left: "L" };

/** The Block's own Arrangement controls — active state, mode, live edges,
 *  grouping. Sits above the Ports member list (wired as that list's
 *  `regionHeader`, see `members-section.tsx`'s `memberListsFor`). */
export function ArrangementSection({ block, actions }: { block: Instance; actions: MemberListActions }) {
  const arrangement = activeArrangement(block);
  const arrangements = block.arrangements ?? [arrangement];
  const grouping = arrangement.grouping;

  return (
    <div data-slot="arrangement-section" style={{ padding: "4px 2px 6px" }}>
      <div style={sectionCaptionStyle}>Arrangement</div>
      <div style={rowStyle}>
        {/* WHY "Active" and not "State": Zach's word for these is "states"
         *  ("a list of potential states"), and the section caption already
         *  says Arrangement — but the Block's appearance `state` field
         *  (empty · wired · …) draws its own "State" row a few rows above
         *  this one in the same column. Two rows reading "State" with
         *  different pickers is a trap; the button keeps his word. */}
        <span style={labelCellStyle}>Active</span>
        <div style={controlWrapStyle}>
          <select
            data-slot="arrangement-picker"
            value={arrangement.id}
            onChange={(e) => actions.onSetArrangement(block.id, e.target.value)}
            style={selectStyle}
          >
            {arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-slot="arrangement-add"
            title="Add a new state, copied from the active one"
            onClick={() => actions.onAddArrangement(block.id)}
            style={iconButtonStyle}
          >
            ＋ new state
          </button>
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Mode</span>
        <div data-slot="arrangement-mode" style={segmentWrapStyle}>
          {(["auto", "custom"] as ArrangementMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              data-mode={mode}
              aria-pressed={arrangement.mode === mode}
              onClick={() => actions.onSetArrangementMode(block.id, mode)}
              style={segmentButtonStyle(arrangement.mode === mode)}
            >
              {mode === "auto" ? "Auto" : "Custom"}
            </button>
          ))}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Edges</span>
        <div style={{ ...controlWrapStyle, gap: 3 }}>
          {ALL_EDGES.map((edge) => {
            const on = arrangement.edges.includes(edge);
            return (
              <button
                key={edge}
                type="button"
                data-slot="arrangement-edge"
                data-edge={edge}
                aria-pressed={on}
                title={edge}
                onClick={() => actions.onToggleArrangementEdge(block.id, edge, !on)}
                style={edgeButtonStyle(on)}
              >
                {EDGE_LABEL[edge]}
              </button>
            );
          })}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Grouping</span>
        <div style={controlWrapStyle}>
          <select
            data-slot="arrangement-grouping"
            value={grouping?.id ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              actions.onSetArrangementGrouping(block.id, value === "" ? null : value);
            }}
            style={selectStyle}
          >
            <option value="">None</option>
            {grouping && <option value={grouping.id}>{grouping.label}</option>}
            <option value="__new__">+ New grouping set</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * One selected Port's placement WITHIN the Block's active Arrangement:
 * which live edge it's on, its order, its `t` (custom mode only — auto
 * derives it, so the field is read-only there), its group, and whether it
 * is the Block's one locked function port. Rendered as a dedicated section
 * in `inspector-column.tsx` (not wired through a member list — a Port has
 * none of its own).
 */
export function PlacementSection({
  port,
  block,
  arrangement,
  placement,
  actions,
}: {
  port: Instance;
  block: Instance;
  arrangement: Arrangement;
  placement: Placement;
  actions: PlacementActions;
}) {
  const patch = (next: Partial<Placement> & { locked?: boolean }) => actions.onSetPortPlacement(port.id, next);
  return (
    <div data-slot="placement-section" style={{ padding: "4px 2px 6px" }}>
      <div style={sectionCaptionStyle}>Placement · {arrangement.label}</div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Edge</span>
        <div style={controlWrapStyle}>
          <select
            data-slot="placement-edge"
            value={placement.edge}
            onChange={(e) => patch({ edge: e.target.value as PortEdgeId })}
            style={selectStyle}
          >
            {/* WHY: an edge toggled off keeps every placement stored on it (parked,
             *  drawn on the nearest live edge — portPlacement.ts's own drawnEdge/
             *  refresh never touch `.edge`). `arrangement.edges` alone can't
             *  represent that: a parked port's true stored edge sits outside the
             *  option list, so the browser (really React's controlled-<select>
             *  fallback) shows some live edge as selected instead — and because
             *  this control is wired straight to onSetPortPlacement, merely
             *  opening the picker and reselecting what LOOKS already-selected
             *  overwrites the real stored edge. Injecting the stored edge as its
             *  own option — even when it's not live — keeps `value` truthful and
             *  makes re-picking it a no-op instead of a silent overwrite. */}
            {!arrangement.edges.includes(placement.edge) && (
              <option key={placement.edge} value={placement.edge}>
                {placement.edge} (parked)
              </option>
            )}
            {arrangement.edges.map((edge) => (
              <option key={edge} value={edge}>
                {edge}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Order</span>
        <div style={controlWrapStyle}>
          <input
            data-slot="placement-order"
            type="number"
            min={0}
            step={1}
            value={placement.order}
            onChange={(e) => patch({ order: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            style={numberStyle}
          />
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>t</span>
        <div style={controlWrapStyle}>
          <input
            data-slot="placement-t"
            type="number"
            min={0}
            max={1}
            step={0.01}
            disabled={arrangement.mode === "auto"}
            value={Math.round(placement.t * 100) / 100}
            onChange={(e) => patch({ t: clampUnit(Number(e.target.value)) })}
            title={arrangement.mode === "auto" ? "Derived from even spacing while this state is Auto" : undefined}
            style={{ ...numberStyle, opacity: arrangement.mode === "auto" ? 0.5 : 1 }}
          />
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Group</span>
        <div style={controlWrapStyle}>
          <input
            data-slot="placement-group"
            type="text"
            value={placement.group ?? ""}
            onChange={(e) => patch({ group: e.target.value === "" ? undefined : e.target.value })}
            style={selectStyle}
          />
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelCellStyle}>Locked</span>
        <div style={controlWrapStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--bbox-panel-fg-muted, #5c5c66)" }}>
            <input
              data-slot="placement-locked"
              type="checkbox"
              checked={port.locked === true}
              onChange={(e) => patch({ locked: e.target.checked })}
              className="accent-foreground"
            />
            function port (header-left corner, at most one per Block)
          </label>
        </div>
      </div>
      <p style={{ fontSize: 10, color: "var(--bbox-panel-fg-faint, #999)", padding: "2px 2px 0" }}>
        In {block.type} “{block.id}”. Order/`t` are both stored; only one is truth in {arrangement.mode} mode — the other refreshes to match.
      </p>
    </div>
  );
}
