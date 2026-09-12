import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type { MembersControlProps, MemberSummary } from "./contract";
import { addableTypes } from "./model";

/**
 * Bits every Members control shares so five designs disagree about layout,
 * never about what a member is called or how "Add" is typed.
 */

/** One glyph per registered component, so a row can say its type in 1em. */
export const TYPE_GLYPH: Record<string, string> = {
  Port: "●",
  Pill: "▬",
  Glyph: "◆",
  TextBox: "T",
  RowContainer: "⋯",
  Stack: "☰",
  PortEdge: "⋮",
  Block: "▣",
};

export function typeGlyph(type: string): string {
  return TYPE_GLYPH[type] ?? "▢";
}

export function TypeGlyph({ type }: { type: string }) {
  return (
    <span data-slot="member-type-glyph" data-type={type} style={glyphStyle} title={type} aria-hidden>
      {typeGlyph(type)}
    </span>
  );
}

export function MemberBadge({ member }: { member: MemberSummary }) {
  if (!member.badge) return null;
  return (
    <span data-slot="member-badge" style={badgeStyle}>
      {member.badge}
    </span>
  );
}

/**
 * The typed "Add" menu. One trigger, one menu of the types the parent
 * accepts; a single accepted type adds it directly, with no menu to click
 * through. Disabled (and says why) at `max`.
 */
export function AddMemberMenu({
  p,
  label = "+",
  title = "Add member",
  compact = false,
  fullWidth = false,
}: {
  p: MembersControlProps;
  label?: ReactNode;
  title?: string;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const types = addableTypes(p.spec, p.entries, p.members.length);
  const atMax = p.spec.max !== undefined && p.members.length >= p.spec.max;
  const one = types.length === 1 ? types[0] : null;
  return (
    <div data-slot="add-member" style={{ position: "relative", ...(fullWidth ? { width: "100%" } : {}) }}>
      <button
        type="button"
        data-slot="add-member-trigger"
        disabled={atMax}
        title={atMax ? `At most ${p.spec.max} here` : one ? `Add ${one}` : title}
        aria-label={one ? `Add ${one}` : title}
        onClick={() => (one ? p.onAdd(one) : setOpen((v) => !v))}
        style={compact ? addCompactStyle(atMax) : addButtonStyle(atMax, fullWidth)}
      >
        {label}
      </button>
      {open && !one && (
        <div data-slot="add-member-menu" style={menuStyle} onMouseLeave={() => setOpen(false)}>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              data-slot="add-member-type"
              data-type={t}
              onClick={() => {
                setOpen(false);
                p.onAdd(t);
              }}
              style={menuRowStyle}
            >
              <TypeGlyph type={t} />
              <span>{t}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Nothing here yet — add a Port, Pill or Glyph." */
export function acceptsSentence(p: MembersControlProps): string {
  const types = addableTypes(p.spec, p.entries, 0);
  if (types.length === 0) return "Nothing can be added here.";
  if (types.length === 1) return `Add a ${types[0]}.`;
  return `Add a ${types.slice(0, -1).join(", ")} or ${types[types.length - 1]}.`;
}

/** Section title used by every control: caption, count pill, then whatever
 *  the control puts on the right (usually its Add trigger). */
export function SectionHeader({ label, count, right }: { label: string; count: number; right?: ReactNode }) {
  return (
    <div data-slot="members-header" style={headerStyle}>
      <span style={headerLabelStyle}>{label}</span>
      <span data-slot="members-count" style={countStyle}>
        {count}
      </span>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export const sectionStyle: CSSProperties = {
  borderTop: "1px solid var(--bbox-panel-border-soft, #e7e7ec)",
  padding: "6px 8px 8px",
  fontSize: 12,
  color: "var(--bbox-panel-fg, #222)",
};
export const headerStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 24, paddingBottom: 4 };
export const headerLabelStyle: CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--bbox-panel-fg-muted, #5c5c66)" };
export const countStyle: CSSProperties = { fontSize: 10, padding: "0 6px", borderRadius: 999, background: "var(--bbox-panel-border-soft, #ececf1)", color: "var(--bbox-panel-fg-muted, #5c5c66)", lineHeight: "16px" };
export const hintStyle: CSSProperties = { fontSize: 10.5, color: "var(--bbox-panel-fg-muted, #6a6a75)", lineHeight: 1.4, paddingTop: 4 };
const glyphStyle: CSSProperties = { display: "inline-block", width: 14, textAlign: "center", fontSize: 11, color: "var(--bbox-panel-fg-muted, #5c5c66)", flexShrink: 0 };
const badgeStyle: CSSProperties = { fontSize: 9.5, padding: "0 5px", borderRadius: 4, border: "1px solid var(--bbox-panel-border, #d6d6de)", color: "var(--bbox-panel-fg-muted, #5c5c66)", lineHeight: "14px", whiteSpace: "nowrap" };
export const iconButtonStyle: CSSProperties = { width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "var(--bbox-panel-fg-muted, #5c5c66)", borderRadius: 4, cursor: "pointer", fontSize: 12, flexShrink: 0, padding: 0 };
function addButtonStyle(disabled: boolean, fullWidth: boolean): CSSProperties {
  return { ...iconButtonStyle, width: fullWidth ? "100%" : 20, height: fullWidth ? 26 : 20, border: fullWidth ? "1px dashed var(--bbox-panel-border, #d6d6de)" : "none", fontSize: fullWidth ? 11 : 14, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" };
}
function addCompactStyle(disabled: boolean): CSSProperties {
  return { ...iconButtonStyle, width: "auto", padding: "0 6px", border: "1px dashed var(--bbox-panel-border, #d6d6de)", borderRadius: 999, fontSize: 11, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" };
}
const menuStyle: CSSProperties = { position: "absolute", right: 0, top: "100%", zIndex: 20, minWidth: 140, padding: 4, background: "var(--bbox-panel-surface, #fff)", border: "1px solid var(--bbox-panel-border, #d6d6de)", borderRadius: 6, boxShadow: "0 6px 20px rgba(0,0,0,.14)", display: "flex", flexDirection: "column" };
const menuRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "none", background: "transparent", color: "var(--bbox-panel-fg, #222)", textAlign: "left", cursor: "pointer", fontSize: 12, borderRadius: 4 };
