import { DEFAULT_ALIGN_GAP, SPACING_SCHEMES, type AlignAnchor, type Distribution } from "./types";

const ANCHORS: { value: AlignAnchor; label: string }[] = [
  { value: "start", label: "Start" },
  { value: "end", label: "End" },
];

/**
 * Picks how a port edge lays its cards out: `Distribute` is the existing
 * space-between/evenly/around schemes (stage 3); `Aligned to edge` packs from
 * one end with an explicit Gap, plus an Edge padding push-in — the mechanism
 * behind the Inline/Offset board layouts.
 */
export function AlignmentControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Distribution;
  onChange: (next: Distribution) => void;
}) {
  return (
    <div className="alignment-control">
      <span className="spacing-control__label">{label}</span>
      <div className="segmented">
        <button
          type="button"
          className={`segmented__option${value.mode === "distribute" ? " is-active" : ""}`}
          onClick={() => onChange({ mode: "distribute", scheme: "space-between" })}
        >
          Distribute
        </button>
        <button
          type="button"
          className={`segmented__option${value.mode === "aligned" ? " is-active" : ""}`}
          onClick={() =>
            onChange({ mode: "aligned", anchor: "start", gap: DEFAULT_ALIGN_GAP, edgePadding: 0 })
          }
        >
          Aligned to edge
        </button>
      </div>

      {value.mode === "distribute" ? (
        <div className="segmented">
          {SPACING_SCHEMES.map((scheme) => (
            <button
              key={scheme.value}
              type="button"
              className={`segmented__option${value.scheme === scheme.value ? " is-active" : ""}`}
              onClick={() => onChange({ mode: "distribute", scheme: scheme.value })}
              title={scheme.hint}
            >
              {scheme.label}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="segmented">
            {ANCHORS.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`segmented__option${value.anchor === a.value ? " is-active" : ""}`}
                onClick={() => onChange({ ...value, anchor: a.value })}
              >
                {a.label}
              </button>
            ))}
          </div>
          <label className="number-field">
            Gap
            <input
              type="number"
              min={0}
              value={value.gap}
              onChange={(e) => onChange({ ...value, gap: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="number-field">
            Edge padding
            <input
              type="number"
              min={0}
              value={value.edgePadding}
              onChange={(e) =>
                onChange({ ...value, edgePadding: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>
        </>
      )}
    </div>
  );
}
