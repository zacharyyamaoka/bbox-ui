import { useState, type CSSProperties, type ReactNode } from "react";
import { LABEL_WIDTH } from "../variants/FigmaDense";
import type { Density, SectionAction } from "./contract";
import { DENSITY } from "./contract";

/**
 * THE header row. One component, two callers: a section's title, and a
 * member list's title.
 *
 * WHY one component and not one per caller — this IS the bug Zach
 * screenshotted on 2026-09-12. Expanding a member list showed its compact
 * summary line ("Right · 1 member ▼") AND the list control's own header
 * ("▼ RIGHT ① ⚙ +") stacked on top of each other, because two layers each
 * believed they owned the list's header and neither could see the other.
 * A shared component cannot reproduce that: there is one place a header is
 * drawn, so "how many headers does a list have" stops being an emergent
 * property of who happened to render what and becomes one call site.
 *
 * His correction, in full: "When you expand it though, no need to repeat
 * the header again etc. … like you can make it way more compact."
 *
 * The row, left to right:
 *
 *     Right   ①   1 member ………………………… ⚙  +   ▾
 *     label  count  summary               actions  chevron
 *
 * Read off his own "Desired" crop: sentence-case label (the outer row's
 * typography), the count chip and the verbs (the inner header's content),
 * chevron last on the right. Nothing else survives the merge.
 */
export function FoldRow({
  label,
  count,
  summary,
  actions,
  density,
  open,
  foldable,
  onToggle,
  mark,
  countAtRest,
  summaryWhenOpen,
  actionsAtRest,
  emphasis = "section",
}: {
  label: string;
  /** Rendered as the chip his Desired crop shows. `undefined` means this
   *  header counts nothing (a field section). */
  count?: number;
  /** "1 member" / "empty" / "3 properties" — the one line a folded thing
   *  still gets to say. */
  summary?: string;
  actions: SectionAction[];
  density: Density;
  open: boolean;
  /** False when there is nothing to fold — an empty member list. Zach,
   *  2026-09-12 (round 1): "I like how the folding option is hidden until
   *  you actually have a member." */
  foldable: boolean;
  onToggle: () => void;
  /** A provenance tag or other standing mark, supplied by the design. */
  mark?: ReactNode;
  countAtRest: boolean;
  summaryWhenOpen: boolean;
  actionsAtRest: boolean;
  /** A member list's header sits INSIDE a section, so it is quieter than
   *  the section title above it — otherwise the panel reads as one flat
   *  run of equally-loud titles and the nesting disappears. */
  emphasis?: "section" | "list";
}) {
  // WHY hover is React state and not a CSS `:hover` rule: this package
  // renders with inline style objects and ships no stylesheet of its own,
  // so `:hover` would mean introducing one — and a data attribute is the
  // only form a browser journey can assert on directly. The chevron's
  // visibility is then a fact in the DOM, not a computed style that has to
  // be re-derived to check.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = hovered || focused;

  // WHY a CLOSED row keeps its chevron at rest, while an OPEN one hides it:
  // an open section shows its content, so the chevron is pure affordance
  // and Zach's "the chevron should appear just on hover" applies exactly.
  // A closed section shows nothing — the chevron is then the only thing on
  // screen saying content is folded away, and hiding it makes a folded
  // section indistinguishable from an empty one. His own S5 capture
  // ("Center · empty ▶") keeps it at rest for the same reason.
  const chevronVisible = foldable && (!open || revealed);
  const showCount = count !== undefined && (countAtRest || !open || revealed);
  const showSummary = summary !== undefined && (!open || summaryWhenOpen);
  const showActions = actions.length > 0 && (actionsAtRest || revealed || !foldable);

  const rung = DENSITY[density];
  const title = open ? `Collapse ${label}` : `Expand ${label}`;

  return (
    <div
      data-slot={emphasis === "list" ? "list-header" : "section-title"}
      data-fold-row={emphasis}
      data-open={open}
      data-foldable={foldable}
      data-revealed={revealed}
      data-chevron-visible={chevronVisible}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      style={rowStyle(rung.titleHeight, rung.gutter, emphasis)}
    >
      {foldable ? (
        <button
          type="button"
          data-slot="fold-toggle"
          aria-expanded={open}
          title={title}
          onClick={onToggle}
          style={triggerStyle(emphasis)}
        >
          <HeaderText label={label} size={rung.titleSize} emphasis={emphasis} />
          {showCount && <CountChip count={count!} />}
          {showSummary && <span style={summaryStyle}>{summary}</span>}
          {mark}
        </button>
      ) : (
        <span style={{ ...triggerStyle(emphasis), cursor: "default" }}>
          <HeaderText label={label} size={rung.titleSize} emphasis={emphasis} />
          {showCount && <CountChip count={count!} />}
          {showSummary && <span style={summaryStyle}>{summary}</span>}
          {mark}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {showActions && <HeaderActions actions={actions} />}
      {/* The chevron keeps its box whether or not it is painted: a row that
          grew 14px wider the instant the pointer touched it would shove the
          verbs beside it sideways, which is a worse tell than the one the
          hover rule is buying. */}
      {foldable && (
        <button
          type="button"
          data-slot="fold-chevron"
          data-visible={chevronVisible}
          aria-expanded={open}
          aria-label={title}
          title={title}
          onClick={onToggle}
          style={chevronButtonStyle(chevronVisible)}
        >
          <span aria-hidden style={chevronGlyphStyle(open)}>
            ▶
          </span>
        </button>
      )}
    </div>
  );
}

function HeaderText({ label, size, emphasis }: { label: string; size: number; emphasis: "section" | "list" }) {
  return (
    <span data-slot="header-label" style={labelStyle(size, emphasis)}>
      {label}
    </span>
  );
}

/** His Desired crop's own ①: a small pill, never a parenthesis. */
function CountChip({ count }: { count: number }) {
  return (
    <span data-slot="header-count" style={countStyle}>
      {count}
    </span>
  );
}

/** Figma's own right-aligned icon verbs. A title carries its actions; a row
 *  never grows a button that creates something. */
export function HeaderActions({ actions }: { actions: SectionAction[] }) {
  return (
    <span data-slot="section-actions" style={actionsWrapStyle}>
      {actions.map((action) =>
        action.node ? (
          // A popover (the typed Add menu) cannot be a one-shot verb, so it
          // arrives already built. `stopPropagation` still applies: the row
          // around it is a fold trigger.
          <span key={action.id} data-slot="section-action" data-action={action.id} onClick={(e) => e.stopPropagation()}>
            {action.node}
          </span>
        ) : (
          <button
            key={action.id}
            type="button"
            data-slot="section-action"
            data-action={action.id}
            title={action.title}
            aria-label={action.title}
            disabled={action.disabled}
            onClick={(e) => {
              e.stopPropagation();
              action.onInvoke?.();
            }}
            style={actionButtonStyle(action.disabled)}
          >
            {action.glyph}
          </button>
        ),
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

function rowStyle(height: number, gutter: number, emphasis: "section" | "list"): CSSProperties {
  // WHY a list header takes NO left padding while a section title takes the
  // gutter: a list header is already inside `SectionBody`, which applies the
  // gutter once. Adding it again is where the tab indent came from — Zach,
  // 2026-09-12, of a Body section's "Body · empty" sitting a tab right of
  // the "Wrap" row above it: "I don't like how its greyed out and tab
  // indented, I do like how its more compact now though." A section title
  // sits OUTSIDE that body and still needs the gutter itself.
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    // 22px is `FigmaDense`'s own `rowGridStyle` height, so a list header and
    // the property rows around it sit on the same rhythm exactly.
    minHeight: emphasis === "list" ? 22 : height,
    paddingLeft: emphasis === "list" ? 0 : gutter,
    paddingRight: emphasis === "list" ? 0 : Math.max(4, gutter - 4),
  };
}
function triggerStyle(emphasis: "section" | "list"): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    // WHY a list header's label cell is the row's own LABEL_WIDTH: it is
    // what puts "empty" / "3 members" and the + in the same column as every
    // other row's CONTROL. Without it the summary crowds the label and the
    // row reads as a caption with something stuck to it rather than as a
    // property with a value. A section title is not in that column at all,
    // so it stays free.
    ...(emphasis === "list" ? { width: LABEL_WIDTH, flexShrink: 0 } : {}),
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  };
}
function labelStyle(size: number, emphasis: "section" | "list"): CSSProperties {
  // WHY a list header is styled as a FIELD label and not as a quieter
  // sub-title: a member list is a property of the thing you are inspecting,
  // and the first version said otherwise in three ways at once — smaller
  // type, muted ink, and an extra indent. Zach, 2026-09-12: "I don't like
  // how its greyed out and tab indented." These are `FigmaDense`'s own
  // `labelTextStyle` values for an ordinary, ungoverned row; the nesting is
  // carried by the section title above it, which is the thing that IS bold.
  if (emphasis === "list") {
    return {
      fontSize: 11,
      fontWeight: 400,
      color: "var(--bbox-panel-fg, #444)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };
  }
  return {
    fontSize: size,
    fontWeight: 650,
    color: "var(--bbox-panel-fg, #111)",
    letterSpacing: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}
const countStyle: CSSProperties = {
  fontSize: 10,
  padding: "0 6px",
  borderRadius: 999,
  background: "var(--bbox-panel-border-soft, #ececf1)",
  color: "var(--bbox-panel-fg-muted, #5c5c66)",
  lineHeight: "15px",
  flexShrink: 0,
};
const summaryStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--bbox-panel-fg-faint, #9a9aa5)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const actionsWrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 };
function actionButtonStyle(disabled?: boolean): CSSProperties {
  return {
    width: 18,
    height: 18,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "var(--bbox-panel-fg-muted, #5c5c66)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 12,
    lineHeight: 1,
    padding: 0,
  };
}
function chevronButtonStyle(visible: boolean): CSSProperties {
  return {
    width: 14,
    height: 18,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    padding: 0,
    flexShrink: 0,
    cursor: "pointer",
    opacity: visible ? 1 : 0,
    // Hidden means unclickable too — a chevron you cannot see but can hit
    // is how a panel gets a phantom control.
    pointerEvents: visible ? "auto" : "none",
    transition: "opacity 100ms ease",
  };
}
function chevronGlyphStyle(open: boolean): CSSProperties {
  return {
    display: "inline-block",
    fontSize: 8,
    lineHeight: 1,
    color: "var(--bbox-panel-fg-faint, #9a9aa5)",
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform 120ms ease",
  };
}

/** The full-bleed hairline BETWEEN sections. Figma's panel is a stack of
 *  these and nothing else — Zach's pick 1: "the section is a title and a
 *  hairline". */
export const sectionDividerStyle: CSSProperties = {
  height: 1,
  background: "var(--bbox-panel-border-soft, #e7e7ec)",
};
