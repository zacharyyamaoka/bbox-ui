import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { MembersControl, MembersControlProps } from "./contract";
import { addableTypes } from "./model";
import { TypeGlyph, acceptsSentence, hintStyle, iconButtonStyle, sectionStyle } from "./shared";

/**
 * V5 · Stepper — the Storybook Controls framing: the one thing this
 * control lets you dial is HOW MANY, like a numeric arg's − / value / +.
 * A member's own fields are never here (selecting it opens them, same as
 * every other control) — this row only grows or shrinks the list and
 * says what kind grows it. The square strip below is reorder-by-keyboard
 * and select, not a second editor.
 */
function StepperControl(p: MembersControlProps) {
  const types = addableTypes(p.spec, p.entries, 0);
  const atMax = p.spec.max !== undefined && p.members.length >= p.spec.max;
  const [kind, setKind] = useState<string>(types[0] ?? "");
  const selectedKind = types.includes(kind) ? kind : (types[0] ?? "");
  const last = p.members[p.members.length - 1];

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const squareRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (focusedId) squareRefs.current.get(focusedId)?.focus();
  }, [focusedId, p.members]);

  const handleArrow = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const to = e.key === "ArrowLeft" ? i - 1 : i + 1;
    if (to < 0 || to >= p.members.length) return;
    setFocusedId(p.members[i]!.id);
    p.onMove(i, to);
  };

  return (
    <section data-slot="members-control" data-members-control="stepper" style={sectionStyle}>
      <div style={rowStyle}>
        <span style={labelStyle}>{p.spec.label ?? "Members"}</span>
        <div style={controlCellStyle}>
          <button
            type="button"
            data-slot="member-minus"
            aria-label="Remove last member"
            title="Remove last"
            disabled={!last}
            onClick={() => last && p.onRemove(last.id)}
            style={stepButtonStyle(!last)}
          >
            −
          </button>
          <span data-slot="member-count" style={countStyle}>
            {p.members.length}
          </span>
          <button
            type="button"
            data-slot="member-plus"
            aria-label={selectedKind ? `Add ${selectedKind}` : "Add member"}
            title={atMax ? `At most ${p.spec.max} here` : selectedKind ? `Add ${selectedKind}` : "Add member"}
            disabled={atMax || !selectedKind}
            onClick={() => selectedKind && p.onAdd(selectedKind)}
            style={stepButtonStyle(atMax || !selectedKind)}
          >
            +
          </button>
          <select
            data-slot="add-member-kind"
            value={selectedKind}
            onChange={(e) => setKind(e.target.value)}
            style={selectStyle}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {p.members.length === 0 ? (
        <p data-slot="members-empty" style={hintStyle}>
          {acceptsSentence(p)}
        </p>
      ) : (
        <div data-slot="members-strip" style={stripStyle}>
          {p.members.map((m, i) => (
            <button
              key={m.id}
              type="button"
              ref={(el) => {
                if (el) squareRefs.current.set(m.id, el);
                else squareRefs.current.delete(m.id);
              }}
              data-slot="member-select"
              data-member-id={m.id}
              data-member-type={m.type}
              title={m.title}
              onClick={() => p.onSelect(m.id)}
              onKeyDown={(e) => handleArrow(e, i)}
              style={squareStyle}
            >
              <TypeGlyph type={m.type} />
              <sup style={indexStyle}>{i + 1}</sup>
            </button>
          ))}
        </div>
      )}
      {p.members.length > 0 && (
        <p style={hintStyle}>
          Count first, like a Storybook arg. Click a square to edit that member; ←→ on a focused square reorders.
        </p>
      )}
    </section>
  );
}

export const STEPPER: MembersControl = {
  id: "stepper",
  label: "Stepper",
  blurb: "A Storybook-Controls count stepper for how many members, plus a square strip for keyboard reorder and select.",
  Control: StepperControl,
};

const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 24 };
const labelStyle: CSSProperties = { width: 92, flexShrink: 0, fontSize: 10.5, color: "var(--bbox-panel-fg-muted, #6a6a75)" };
const controlCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 };
const countStyle: CSSProperties = { minWidth: 20, textAlign: "center", fontSize: 12, color: "var(--bbox-panel-fg, #222)", flexShrink: 0 };
function stepButtonStyle(disabled: boolean): CSSProperties {
  return { ...iconButtonStyle, border: "1px solid var(--bbox-panel-border, #d6d6de)", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" };
}
const selectStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 20,
  fontSize: 11,
  padding: "0 4px",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 4,
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
};
const stripStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 3, paddingTop: 6 };
const squareStyle: CSSProperties = {
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--bbox-panel-border, #d6d6de)",
  borderRadius: 4,
  background: "var(--bbox-panel-surface, #fff)",
  color: "var(--bbox-panel-fg, #222)",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};
const indexStyle: CSSProperties = { fontSize: 7, lineHeight: 1, color: "var(--bbox-panel-fg-faint, #9a9aa5)" };
