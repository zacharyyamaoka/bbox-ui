import type { CSSProperties } from "react";
import { MIXED, readFields } from "@bbox-ui/schema";
import { PORT_FIELDS } from "@bbox-ui/core";

export interface PortSubject {
  id: string;
  props: Record<string, unknown>;
}

export interface PortInspectorPanelProps {
  subjects: PortSubject[];
  onChange: (fieldId: string, value: string) => void;
}

/**
 * The "product inspector" half of T0's loop: the SAME `PORT_FIELDS` array
 * Storybook's Controls addon reads (via `toArgTypes`), read here with
 * `readFields` instead — proving the thing Controls structurally cannot
 * show: N subjects at once, with a row reading "Mixed" the instant they
 * disagree.
 */
export function PortInspectorPanel({ subjects, onChange }: PortInspectorPanelProps) {
  const readings = readFields(
    PORT_FIELDS,
    subjects.map((subject) => subject.props),
  );

  return (
    <div data-slot="port-inspector" style={panelStyle}>
      <div data-slot="port-inspector-header" style={headerStyle}>
        {subjects.length === 0
          ? "No port selected"
          : `${subjects.length} port${subjects.length > 1 ? "s" : ""} selected`}
      </div>
      {readings.map((reading) => {
        const isMixed = reading.value === MIXED;
        return (
          <div
            key={reading.field.id}
            data-slot="port-inspector-row"
            data-field={reading.field.id}
            data-mixed={isMixed}
            style={rowStyle}
          >
            <span style={labelStyle}>{reading.field.label}</span>
            {reading.field.kind === "segments" ? (
              <div style={segmentsStyle}>
                {reading.field.options?.map((option) => {
                  const active = !isMixed && reading.value === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-selected={active}
                      onClick={() => onChange(reading.field.id, option.value)}
                      style={segmentButtonStyle(active)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                value={isMixed ? "" : String(reading.value)}
                placeholder={isMixed ? "Mixed" : undefined}
                onChange={(event) => onChange(reading.field.id, event.target.value)}
                style={textInputStyle}
              />
            )}
            {isMixed && (
              <span data-slot="port-inspector-mixed" style={mixedBadgeStyle}>
                Mixed
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const panelStyle: CSSProperties = {
  width: 260,
  padding: 16,
  border: "1px solid #ddd",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  fontFamily: "sans-serif",
  fontSize: 13,
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "#666" };
const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle: CSSProperties = { fontWeight: 500 };
const segmentsStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap" };
const textInputStyle: CSSProperties = { padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 };
const mixedBadgeStyle: CSSProperties = { fontSize: 11, color: "#b45309" };

function segmentButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 8px",
    borderRadius: 4,
    border: selected ? "1px solid #111" : "1px solid #ccc",
    background: selected ? "#111" : "white",
    color: selected ? "white" : "#111",
    cursor: "pointer",
  };
}
