import type { Size } from "./types";

/** Width/height of a port edge's outer container. */
export function SizeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Size;
  onChange: (next: Size) => void;
}) {
  return (
    <div className="size-control">
      <span className="spacing-control__label">{label}</span>
      <label className="number-field">
        W
        <input
          type="number"
          min={40}
          value={value.width}
          onChange={(e) => onChange({ ...value, width: Math.max(40, Number(e.target.value) || 40) })}
        />
      </label>
      <label className="number-field">
        H
        <input
          type="number"
          min={40}
          value={value.height}
          onChange={(e) => onChange({ ...value, height: Math.max(40, Number(e.target.value) || 40) })}
        />
      </label>
    </div>
  );
}
