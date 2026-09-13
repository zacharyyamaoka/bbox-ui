import { SPACING_SCHEMES, type SpacingScheme } from "./types";

export function SpacingControl({
  value,
  onChange,
  disabled,
}: {
  value: SpacingScheme;
  onChange: (next: SpacingScheme) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`spacing-control${disabled ? " is-disabled" : ""}`}>
      <span className="spacing-control__label">Spacing</span>
      <div className="segmented">
        {SPACING_SCHEMES.map((scheme) => (
          <button
            key={scheme.value}
            type="button"
            className={`segmented__option${value === scheme.value ? " is-active" : ""}`}
            onClick={() => onChange(scheme.value)}
            disabled={disabled}
            title={scheme.hint}
          >
            {scheme.label}
          </button>
        ))}
      </div>
      {disabled ? <span className="spacing-control__note">only applies in Auto mode</span> : null}
    </div>
  );
}
