import { useState, type CSSProperties, type ReactNode } from "react";
import {
  governedFieldIds,
  MIXED,
  readFields,
  type FieldSpec,
  type FieldTrace,
  type FieldValue,
} from "@bbox-ui/schema";
import { STATE_TOKENS, TONE_TOKENS, type AppearanceState, type Tone } from "@bbox-ui/core";
import { NumberInput } from "../NumberInput";
import { readFieldRow } from "../fieldModel";
import type { PanelVariant, PanelVariantProps } from "./contract";

/**
 * demos/inspector/src/variants/IconStrip.tsx
 *
 * The one variant in this set that is NOT a label+control form. Words are
 * what eats vertical space in `ComponentInspector`/`FieldTraceRow` — every
 * row spends a full line on `field.label` before the control even starts.
 * This variant instead reads as a canvas toolbar (tldraw/Figma's style
 * panel): related fields collapse into ONE horizontal strip of icon
 * toggles, numbers become tiny steppers several to a row, and a field only
 * keeps a text label when no icon can honestly stand in for it.
 *
 * WHY the icons are drawn as inline path data rather than imported from
 * `packages/inspector/src/inspector/variants/tldrawIcons.tsx` or
 * `glyphs.ts`: both belong to `@bbox-ui/inspector`, a different package
 * this demo does not depend on (`demos/inspector/package.json` lists only
 * `@bbox-ui/core`/`@bbox-ui/schema`/react) — pulling them in would be a new
 * dependency the brief explicitly rules out, and `tldrawIcons.tsx`'s own
 * icons come from `@tldraw/assets`, a dependency of yet another package.
 * What IS reused is the visual GRAMMAR those two files already established
 * in this codebase — a literal solid/dashed/dotted line for a dash style, a
 * filled/half/empty square for a fill style, a circle sized to the value it
 * represents — redrawn here as free-standing SVG so this file stays
 * self-contained.
 *
 * WHY `state` and `tone` are drawn from `STATE_TOKENS`/`TONE_TOKENS`
 * instead of a hand-picked icon: those two fields don't need an invented
 * glyph at all — the ring/fill pair a state or tone resolves to (see
 * `appearance.ts`) IS what the component paints. A miniature circle
 * rendered with that exact ring+fill is not a symbol for the state, it is
 * the state, at 14px — the most honest icon available, and it stays true
 * automatically if the token values ever change.
 */

/* ------------------------------------------------------------------ */
/* Resolution — the same stored-vs-painted split `FieldTraceRow` uses  */
/* ------------------------------------------------------------------ */

/**
 * Ported rather than imported: `FieldTraceRow` computes this inline as
 * part of one big row component, and there is no exported helper to call
 * instead. See that file's own WHY block for the full rationale (two
 * resolutions because two different questions — what does the STORE hold
 * vs what does the SCREEN show — are being asked; MIXED is decided on
 * resolved values so an override-driven agreement still reads as agreeing).
 * This copy is intentionally the same logic, condensed.
 */
interface Resolution {
  trace: FieldTrace | null;
  isMixed: boolean;
  hasOwnOverride: boolean;
  collapsed: FieldValue | undefined;
  paintedElsewhere: FieldValue | null;
}

// WHY: shared field-resolution model (../fieldModel.ts) — this strip used to
// gate the painted-elsewhere ring on exactly one subject selected, going
// silent on a real multi-selection while the active glyph kept ringing a
// value nothing painted.
function resolve(field: FieldSpec, panel: PanelVariantProps): Resolution {
  const { subjects, presets, toSubject } = panel;
  const row = readFieldRow(field, subjects, presets, toSubject);
  return {
    trace: row.trace,
    isMixed: row.isMixed,
    hasOwnOverride: row.hasOwnOverride,
    collapsed: row.collapsedValue,
    paintedElsewhere: row.paintedElsewhere,
  };
}

type Winner = "override" | "preset" | "default";

/** Same palette `FieldTraceRow`'s winner badge uses — an active icon's
 * ring borrows it instead of a separate badge, since there is no label
 * line here to put a badge on. */
const WINNER_COLOR: Record<Winner, { ring: string; bg: string }> = {
  override: { ring: "var(--bbox-panel-override, #6d28d9)", bg: "var(--bbox-panel-override-bg, #ede9fe)" },
  preset: { ring: "var(--bbox-panel-preset, #1d4ed8)", bg: "var(--bbox-panel-preset-bg, #dbeafe)" },
  default: { ring: "var(--bbox-panel-fg-muted, #52525b)", bg: "var(--bbox-panel-surface-2, #f4f4f5)" },
};

/**
 * AMENDMENT (mid-build, Zach): "driven / overridden / default" has to read
 * in one glance, cheaply. The ring colour on the active glyph already IS
 * that mark (point 2) — this adds the one piece a colour alone can't carry:
 * WHICH preset is driving it, in the hover text, so "why is this ring blue"
 * has an answer without opening the cascade popover. This is this variant's
 * answer to the amendment's point 1 ("Wired · primary" on one line): a strip
 * has no line to put that text on at rest, so the name+value pairing moves
 * into the title/aria-label instead of the pixels. Said plainly in the
 * report, not hidden as equivalent to the real thing.
 */
function layerNote(r: Resolution, presets: PanelVariantProps["presets"]): string {
  if (!r.trace) return "";
  if (r.trace.winner === "preset") {
    const preset = presets.find((p) => p.id === r.trace!.winningPresetId);
    return ` — driven by ${preset?.label ?? r.trace.winningPresetId}`;
  }
  if (r.trace.winner === "override") return " — overridden";
  return " — default";
}

/* ------------------------------------------------------------------ */
/* ClusterShell — every field's wrapper: mixed / override / cascade    */
/* ------------------------------------------------------------------ */

/**
 * What every cluster owes the contract, drawn as pixels instead of words:
 * - Mixed: a dashed amber outline + a small dot badge (title carries the
 *   word "Mixed" for anyone who hovers or reads with a screen reader).
 * - A stored override on a governed field: a small red "x" badge, clickable
 *   to clear it — same affordance as `FieldTraceRow`'s "x override" button,
 *   shrunk to a dot because there is no room for the word.
 * - Painted-elsewhere: a small teal dot, same honesty rule as
 *   `FieldTraceRow` — say when the pixels disagree with the store rather
 *   than silently showing one or the other.
 * - Cascade: a caret, present only when exactly one subject is selected
 *   (the trace answers "which layer won for THIS subject" — not an
 *   aggregable question across N, per T1-SPEC.md §7.2), opening a compact
 *   3-row popover instead of `FieldTraceRow`'s inline expansion.
 */
function ClusterShell({
  field,
  r,
  isGoverned,
  onClearOverride,
  children,
}: {
  field: FieldSpec;
  r: Resolution;
  isGoverned: boolean;
  onClearOverride: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-slot="icon-strip-cluster" data-field={field.id} data-mixed={r.isMixed} style={clusterWrapStyle}>
      <div style={mixedRingStyle(r.isMixed)}>
        <div style={clusterRowStyle}>{children}</div>
        {r.trace && (
          <button
            type="button"
            data-slot="icon-strip-disclosure"
            title={`${field.label}: show override / preset / default`}
            aria-label={`${field.label}: show cascade`}
            onClick={() => setOpen((v) => !v)}
            style={caretStyle(open)}
          >
            ⌄
          </button>
        )}
      </div>
      {r.isMixed && (
        <span
          data-slot="icon-strip-mixed"
          title={`${field.label}: Mixed across the selection`}
          aria-label={`${field.label}: Mixed`}
          style={mixedDotStyle}
        />
      )}
      {r.paintedElsewhere !== null && (
        <span
          data-slot="icon-strip-painted-elsewhere"
          title={`${field.label}: painting ${String(r.paintedElsewhere)} — not from a stored layer`}
          aria-label={`${field.label}: painted elsewhere`}
          style={paintedDotStyle}
        />
      )}
      {r.hasOwnOverride && (
        <button
          type="button"
          data-slot="icon-strip-clear-override"
          title={`Clear ${field.label} override — fall back to the preset`}
          aria-label={`Clear ${field.label} override`}
          onClick={onClearOverride}
          style={clearDotStyle}
        >
          ×
        </button>
      )}
      {open && r.trace && (
        <div data-slot="icon-strip-chain" style={chainPopoverStyle}>
          <div style={chainLabelStyle}>{field.label}</div>
          {r.trace.candidates.map((c) => (
            <div key={c.layer} data-slot="icon-strip-chain-row" style={chainRowStyle(c.layer === r.trace!.winner)}>
              <span style={chainLayerStyle}>{c.layer}</span>
              <span style={chainValueStyle}>{c.value === undefined ? "—" : String(c.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  active,
  winner,
  title,
  onClick,
  children,
  size = 24,
}: {
  active: boolean;
  winner: Winner | undefined;
  title: string;
  onClick: () => void;
  children: ReactNode;
  size?: number;
}) {
  const palette = active ? WINNER_COLOR[winner ?? "default"] : undefined;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-selected={active}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1.5px solid ${palette ? palette.ring : "var(--bbox-panel-border, #d4d4d8)"}`,
        borderRadius: 6,
        background: palette ? palette.bg : "var(--bbox-panel-surface, white)",
        color: palette ? palette.ring : "var(--bbox-panel-fg, #3f3f46)",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Field renderers — one per control shape                             */
/* ------------------------------------------------------------------ */

/** Segmented field, one icon per option — state/tone/lens/edge/textLayout/
 * direction/diameter/textSize/reveal/lineStyle/lineThickness/fillStyle/
 * lineColor/fillColor all go through this. */
function FieldIconGroup({
  field,
  panel,
  governed,
  icon,
  size = 24,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
  icon: (value: string) => ReactNode;
  size?: number;
}) {
  const r = resolve(field, panel);
  return (
    <ClusterShell field={field} r={r} isGoverned={governed.has(field.id)} onClearOverride={() => panel.onClearOverride(field.id)}>
      {(field.options ?? []).map((opt) => {
        const active = !r.isMixed && r.collapsed !== undefined && String(r.collapsed) === opt.value;
        return (
          <IconBtn
            key={opt.value}
            size={size}
            active={active}
            winner={r.trace?.winner}
            title={`${field.label}: ${opt.label}${active ? layerNote(r, panel.presets) : ""}`}
            onClick={() => panel.onChange(field.id, opt.value)}
          >
            {icon(opt.value)}
          </IconBtn>
        );
      })}
    </ClusterShell>
  );
}

/**
 * AMENDMENT Case A — "a size dropdown listing Small 18 / Medium 24 / Large
 * 36 / Extra large 44, a tick on the active one." `diameter`/`textSize` are
 * exactly that shape: named stops on a real px scale, and
 * `port.fields.ts`'s own `DIAMETER_OPTIONS`/`TEXT_SIZE_OPTIONS` already bake
 * the resolved number into `option.label` ("Medium · 12px") — nothing here
 * invents that pairing.
 *
 * The icon row stays (a dot/letter cluster is still the fastest way to pick
 * one of 3-4 values without opening anything), and the SAME caret that
 * every other cluster uses for the cascade instead opens this field's named
 * list — tick on the active stop, each row showing its px value, so the
 * exact number the amendment wants is one click away rather than zero. No
 * "Custom [ ] px" row: `port.fields.ts` says outright there is no free-
 * numeric branch for these two fields yet ("no FieldKind combines
 * segments+number today, see docs/T1-SPEC.md §10") — adding one here would
 * write a value the schema has no slot for, so the honest thing is to leave
 * it out rather than fake an input that goes nowhere.
 */
function FieldScaleDropdown({
  field,
  panel,
  governed,
  icon,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
  icon: (value: string) => ReactNode;
}) {
  const r = resolve(field, panel);
  const [open, setOpen] = useState(false);
  const isGoverned = governed.has(field.id);
  return (
    <div data-slot="icon-strip-cluster" data-field={field.id} data-mixed={r.isMixed} style={clusterWrapStyle}>
      <div style={mixedRingStyle(r.isMixed)}>
        <div style={clusterRowStyle}>
          {(field.options ?? []).map((opt) => {
            const active = !r.isMixed && r.collapsed !== undefined && String(r.collapsed) === opt.value;
            return (
              <IconBtn
                key={opt.value}
                active={active}
                winner={r.trace?.winner}
                title={`${field.label}: ${opt.label}${active ? layerNote(r, panel.presets) : ""}`}
                onClick={() => panel.onChange(field.id, opt.value)}
              >
                {icon(opt.value)}
              </IconBtn>
            );
          })}
        </div>
        <button
          type="button"
          data-slot="icon-strip-scale-disclosure"
          title={`${field.label}: named stops and their resolved value`}
          aria-label={`${field.label}: show scale`}
          onClick={() => setOpen((v) => !v)}
          style={caretStyle(open)}
        >
          ⌄
        </button>
      </div>
      {r.isMixed && (
        <span title={`${field.label}: Mixed across the selection`} aria-label={`${field.label}: Mixed`} style={mixedDotStyle} />
      )}
      {r.paintedElsewhere !== null && (
        <span
          title={`${field.label}: painting ${String(r.paintedElsewhere)} — not from a stored layer`}
          aria-label={`${field.label}: painted elsewhere`}
          style={paintedDotStyle}
        />
      )}
      {r.hasOwnOverride && (
        <button
          type="button"
          data-slot="icon-strip-clear-override"
          title={`Clear ${field.label} override — fall back to the preset`}
          aria-label={`Clear ${field.label} override`}
          onClick={() => panel.onClearOverride(field.id)}
          style={clearDotStyle}
        >
          ×
        </button>
      )}
      {open && (
        <div data-slot="icon-strip-scale-menu" style={chainPopoverStyle}>
          <div style={chainLabelStyle}>{field.label}</div>
          {(field.options ?? []).map((opt) => {
            const active = !r.isMixed && r.collapsed !== undefined && String(r.collapsed) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-slot="icon-strip-scale-row"
                data-selected={active}
                onClick={() => panel.onChange(field.id, opt.value)}
                style={scaleMenuRowStyle(active)}
              >
                <span style={scaleMenuTickStyle}>{active ? "✓" : ""}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Segmented field with no honest icon
 * fallback for any field this variant doesn't specifically know. Still
 * compact: short chips, full option label on hover. */
function FieldWords({
  field,
  panel,
  governed,
  display,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
  display?: (value: string, label: string) => string;
}) {
  const r = resolve(field, panel);
  return (
    <ClusterShell field={field} r={r} isGoverned={governed.has(field.id)} onClearOverride={() => panel.onClearOverride(field.id)}>
      {(field.options ?? []).map((opt) => {
        const active = !r.isMixed && r.collapsed !== undefined && String(r.collapsed) === opt.value;
        const palette = active ? WINNER_COLOR[r.trace?.winner ?? "default"] : undefined;
        return (
          <button
            key={opt.value}
            type="button"
            title={`${field.label}: ${opt.label}${active ? layerNote(r, panel.presets) : ""}`}
            aria-label={`${field.label}: ${opt.label}`}
            data-selected={active}
            onClick={() => panel.onChange(field.id, opt.value)}
            style={wordChipStyle(active, palette)}
          >
            {display ? display(opt.value, opt.label) : opt.label}
          </button>
        );
      })}
    </ClusterShell>
  );
}

/** Boolean field as one icon toggle — eligible/hinting/dragging, and the
 * generic fallback for an unknown toggle field. */
function FieldToggleIcon({
  field,
  panel,
  governed,
  icon,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
  icon: ReactNode;
}) {
  const r = resolve(field, panel);
  const current = r.collapsed === true;
  return (
    <ClusterShell field={field} r={r} isGoverned={governed.has(field.id)} onClearOverride={() => panel.onClearOverride(field.id)}>
      <IconBtn
        active={!r.isMixed && current}
        winner={r.trace?.winner}
        title={`${field.label}: ${r.isMixed ? "Mixed" : current ? "on" : "off"}${!r.isMixed && current ? layerNote(r, panel.presets) : ""}`}
        onClick={() => panel.onChange(field.id, !current)}
      >
        {icon}
      </IconBtn>
    </ClusterShell>
  );
}

/** Number field as a tiny stepper — lineOpacity/fillOpacity/producers, and
 * the generic fallback for an unknown number field. */
function FieldStepper({
  field,
  panel,
  governed,
  glyph,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
  glyph: ReactNode;
}) {
  const r = resolve(field, panel);
  const step = field.step ?? 1;
  const current = r.collapsed === undefined ? (field.defaultValue as number) : Number(r.collapsed);
  function nudge(delta: number) {
    const next = current + delta;
    const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, next));
    panel.onChange(field.id, Math.round(clamped * 1000) / 1000);
  }
  return (
    <ClusterShell field={field} r={r} isGoverned={governed.has(field.id)} onClearOverride={() => panel.onClearOverride(field.id)}>
      <div style={stepperStyle} title={`${field.label}${r.collapsed !== undefined ? layerNote(r, panel.presets) : ""}`} aria-label={field.label}>
        {glyph}
        <button
          type="button"
          title={`Decrease ${field.label}`}
          aria-label={`Decrease ${field.label}`}
          onClick={() => nudge(-step)}
          style={stepperBtnStyle}
        >
          −
        </button>
        {/* WHY a box beside the arrows: setting padding to 24 was 24 clicks.
            The arrows stay for nudging; the box is the same shared NumberInput
            every other panel uses, so it empties, clamps and clears the same
            way. */}
        <NumberInput
          data-slot="icon-strip-number"
          value={r.isMixed || r.collapsed === undefined ? undefined : Number(r.collapsed)}
          defaultValue={field.defaultValue as number}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={r.isMixed ? "Mix" : undefined}
          onCommit={(n) => panel.onChange(field.id, n)}
          onClear={() => panel.onClearOverride(field.id)}
          style={stepperValueStyle}
        />
        <button
          type="button"
          title={`Increase ${field.label}`}
          aria-label={`Increase ${field.label}`}
          onClick={() => nudge(step)}
          style={stepperBtnStyle}
        >
          +
        </button>
      </div>
    </ClusterShell>
  );
}

/** Text field — name/type/defaultValue/children/lensBefore, and the generic
 * fallback for any unknown text field. The one control shape where a word
 * label is not a compromise: the content itself is arbitrary text, so a
 * caption naming the field is the only honest option. */
function FieldText({
  field,
  panel,
  governed,
}: {
  field: FieldSpec;
  panel: PanelVariantProps;
  governed: Set<string>;
}) {
  const r = resolve(field, panel);
  const value = r.isMixed ? "" : ((r.collapsed as string | undefined) ?? "");
  return (
    <ClusterShell field={field} r={r} isGoverned={governed.has(field.id)} onClearOverride={() => panel.onClearOverride(field.id)}>
      <label style={textFieldWrapStyle}>
        <span style={textFieldLabelStyle}>{field.label}</span>
        <input
          type="text"
          value={value}
          placeholder={r.isMixed ? "Mixed" : undefined}
          onChange={(e) => panel.onChange(field.id, e.target.value)}
          aria-label={field.label}
          title={field.label}
          style={textFieldInputStyle}
        />
      </label>
    </ClusterShell>
  );
}

/** Any field this variant doesn't specifically know about — a future field
 * on Pill/Port, or a field from another registered component reusing this
 * Panel. Never dropped (contract point 7): routed by `kind` to the closest
 * generic control, words rather than a guessed icon. */
function GenericFallback({ field, panel, governed }: { field: FieldSpec; panel: PanelVariantProps; governed: Set<string> }) {
  if (field.kind === "text") return <FieldText field={field} panel={panel} governed={governed} />;
  if (field.kind === "number") return <FieldStepper field={field} panel={panel} governed={governed} glyph={<GenericGlyph />} />;
  if (field.kind === "toggle") return <FieldToggleIcon field={field} panel={panel} governed={governed} icon={<GenericGlyph />} />;
  return <FieldWords field={field} panel={panel} governed={governed} />;
}

/* ------------------------------------------------------------------ */
/* Icons — inline paths, 16x16 viewBox, currentColor                   */
/* ------------------------------------------------------------------ */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      {children}
    </svg>
  );
}

function GenericGlyph() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </Svg>
  );
}

function NoneSwatchIcon() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
      <line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.65" />
    </Svg>
  );
}

/** A curated paint token — `lineColor`/`fillColor`'s option value IS the
 * CSS custom property name (minus `--`), so this reads the real live theme
 * colour rather than a hardcoded hex; `"transparent"` gets the same
 * none-glyph as everything else that means "no paint". */
function TokenSwatchIcon({ token }: { token: string }) {
  if (token === "transparent") return <NoneSwatchIcon />;
  return (
    <span
      style={{
        display: "block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: `var(--${token})`,
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    />
  );
}

/** `tone`'s icon: the exact token `toneOverride` would write, or the
 * none-glyph for `neutral` (which writes nothing — "let state drive"). */
function ToneSwatchIcon({ value }: { value: string }) {
  const token = TONE_TOKENS[value as Tone];
  if (!token) return <NoneSwatchIcon />;
  return (
    <span
      style={{
        display: "block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: `var(--${token})`,
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    />
  );
}

/** `state`'s icon: the literal ring+fill pair that state resolves to
 * (`STATE_TOKENS`) — this is what the component paints, at 14px, not a
 * symbol standing in for it. `hidden` has neither a ring nor a fill, so it
 * gets a faint dashed circle instead of an empty box. */
function StateSwatchIcon({ value }: { value: string }) {
  const t = STATE_TOKENS[value as AppearanceState];
  if (!t || (t.ring === null && t.fill === null)) {
    return (
      <span
        style={{
          display: "block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "1.5px dashed currentColor",
          opacity: 0.4,
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: "block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: `2px solid var(--${t.ring})`,
        background: t.fill ? `var(--${t.fill})` : "transparent",
        boxSizing: "border-box",
      }}
    />
  );
}

/** Diff/lint vocabulary for `lens` — the shortest notation that is still
 * universally read: git's own `+`/`-`, `~` for a change, `!` for
 * error/warning (coloured to tell those two apart), a plain dot for
 * "normal". These are characters, not pictures — flagged as such in the
 * handoff rather than claimed as a drawn icon. */
function LensGlyph({ value }: { value: string }) {
  const spec: Record<string, { char: string; color: string }> = {
    normal: { char: "•", color: "var(--bbox-panel-fg-muted, #71717a)" },
    added: { char: "+", color: "var(--bbox-success)" },
    removed: { char: "−", color: "var(--bbox-danger)" },
    changed: { char: "~", color: "var(--bbox-accent)" },
    error: { char: "!", color: "var(--bbox-danger)" },
    warning: { char: "!", color: "var(--bbox-warning)" },
  };
  const s = spec[value] ?? { char: "?", color: "currentColor" };
  return (
    <Svg>
      <text x="8" y="11.5" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight={700} textAnchor="middle" fill={s.color}>
        {s.char}
      </text>
    </Svg>
  );
}

function EdgeIcon({ side }: { side: string }) {
  return (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.2" />
      {side === "left" && <line x1="2.5" y1="1.8" x2="2.5" y2="14.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />}
      {side === "right" && <line x1="13.5" y1="1.8" x2="13.5" y2="14.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />}
      {side === "top" && <line x1="1.8" y1="2.5" x2="14.2" y2="2.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />}
      {side === "bottom" && <line x1="1.8" y1="13.5" x2="14.2" y2="13.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />}
    </Svg>
  );
}

function TextLayoutIcon({ layout }: { layout: string }) {
  const dot = <circle cx="8" cy="8" r="2" fill="currentColor" />;
  const chip = (x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} rx="1" fill="currentColor" fillOpacity="0.4" />
  );
  return (
    <Svg>
      {layout === "top" && (
        <>
          {chip(5, 1, 6, 3)}
          {dot}
        </>
      )}
      {layout === "bot" && (
        <>
          {dot}
          {chip(5, 12, 6, 3)}
        </>
      )}
      {layout === "left" && (
        <>
          {chip(1, 6.5, 6, 3)}
          {dot}
        </>
      )}
      {layout === "right" && (
        <>
          {dot}
          {chip(9, 6.5, 6, 3)}
        </>
      )}
    </Svg>
  );
}

function DirectionIcon({ direction }: { direction: string }) {
  return (
    <Svg>
      {direction === "input" ? (
        <>
          <line x1="1.5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.6" />
          <polyline points="6.3,5 9,8 6.3,11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12.5" y1="2.5" x2="12.5" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1="3.5" y1="2.5" x2="3.5" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="7" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.6" />
          <polyline points="11.7,5 14.5,8 11.7,11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

function DiameterIcon({ r }: { r: number }) {
  return (
    <Svg>
      <circle cx="8" cy="8" r={r} fill="currentColor" />
    </Svg>
  );
}

function TextSizeIcon({ px }: { px: number }) {
  return (
    <Svg>
      <text x="8" y="12" fontSize={px} fontFamily="sans-serif" fontWeight={600} textAnchor="middle" fill="currentColor">
        A
      </text>
    </Svg>
  );
}

function RevealIcon({ always }: { always: boolean }) {
  return (
    <Svg>
      <path
        d="M1.3 8C2.9 4.7 5.3 3.1 8 3.1s5.1 1.6 6.7 4.9C13.1 11.3 10.7 12.9 8 12.9S2.9 11.3 1.3 8Z"
        fill={always ? "currentColor" : "none"}
        fillOpacity={always ? 0.85 : 1}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {!always && <circle cx="8" cy="8" r="1.4" fill="currentColor" />}
      {!always && (
        <path d="M11 11l3.2 3.2M14.2 14.2v-2.7h-2.7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

function LineStyleIcon({ style }: { style: string }) {
  if (style === "none") {
    return (
      <Svg>
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.35" />
        <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </Svg>
    );
  }
  const dash = style === "dashed" ? "3.4 2.4" : style === "dotted" ? "0.2 2.6" : undefined;
  return (
    <Svg>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </Svg>
  );
}

function ThicknessIcon({ weight }: { weight: number }) {
  return (
    <Svg>
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" />
    </Svg>
  );
}

function FillStyleIcon({ style }: { style: string }) {
  return (
    <Svg>
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="1.5"
        fill={style === "none" ? "none" : "currentColor"}
        fillOpacity={style === "solid" ? 1 : style === "semi" ? 0.35 : 1}
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </Svg>
  );
}

function TargetIcon() {
  return (
    <Svg>
      <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" />
    </Svg>
  );
}

function BulbIcon() {
  return (
    <Svg>
      <path
        d="M8 2.5a4 4 0 0 0-2.2 7.3c.5.35.7.8.7 1.3v.4h3v-.4c0-.5.2-.95.7-1.3A4 4 0 0 0 8 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <line x1="6.5" y1="13.5" x2="9.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function GripIcon() {
  const dots: [number, number][] = [
    [6, 4],
    [10, 4],
    [6, 8],
    [10, 8],
    [6, 12],
    [10, 12],
  ];
  return (
    <Svg>
      {dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" fill="currentColor" />
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

function IconStripPanel(props: PanelVariantProps) {
  const { componentName, fields, presets, subjects } = props;
  const governed = new Set(governedFieldIds(presets));
  const byId = new Map(fields.map((f) => [f.id, f]));
  const used = new Set<string>();
  function take(id: string): FieldSpec | undefined {
    const f = byId.get(id);
    if (f) used.add(id);
    return f;
  }

  // Behaviour 1 — presets first. Same selector-picker logic as
  // ComponentInspector, including the real-field-over-synthetic-fallback
  // fix documented there (a synthetic `defaultValue: ""` would make an
  // unset selector read as no preset active while the component paints its
  // default preset happily).
  const selectors = Array.from(new Set(presets.map((p) => p.selector)));

  const stateField = take("state");
  const toneField = take("tone");
  const lensField = take("lens");
  const lensBeforeField = take("lensBefore");
  const edgeField = take("edge");
  const textLayoutField = take("textLayout");
  const directionField = take("direction");
  const diameterField = take("diameter");
  const textSizeField = take("textSize");
  const revealField = take("reveal");
  const lineStyleField = take("lineStyle");
  const lineThicknessField = take("lineThickness");
  const lineOpacityField = take("lineOpacity");
  const lineColorField = take("lineColor");
  const fillStyleField = take("fillStyle");
  const fillOpacityField = take("fillOpacity");
  const fillColorField = take("fillColor");
  const eligibleField = take("eligible");
  const hintingField = take("hinting");
  const draggingField = take("dragging");
  const producersField = take("producers");
  const roleField = take("role");
  const decorationField = take("decoration");
  const nameField = take("name");
  const typeField = take("type");
  const defaultValueField = take("defaultValue");
  const childrenField = take("children");
  const leftover = fields.filter((f) => !used.has(f.id));

  return (
    <div data-slot="icon-strip-panel" style={panelStyle}>
      <div data-slot="icon-strip-header" style={headerStyle}>
        {componentName} — {subjects.length === 0 ? "no subject selected" : `${subjects.length} selected`}
      </div>
      <div data-slot="icon-strip-legend" style={legendStyle}>
        Hover any control for its name and which layer set it · ring = override / preset / default · <span style={legendMixedDotStyle} /> mixed ·{" "}
        <span style={legendClearDotStyle}>×</span> clears an override · a preset's <span style={legendModifiedInlineStyle}>+N ↺</span> clears everything it drives
      </div>

      {selectors.map((selector) => {
        const presetsForSelector = presets.filter((p) => p.selector === selector);
        const selectorField = byId.get(selector) ?? { id: selector, label: selector, kind: "segments" as const, defaultValue: "" };
        const reading = readFields([selectorField], subjects.map((s) => s.props))[0];
        const current = reading.value === MIXED ? undefined : String(reading.value);
        return (
          <div key={selector} data-slot="preset-picker" data-selector={selector} style={presetSectionStyle}>
            <div style={presetRowStyle}>
              {presetsForSelector.map((preset) => {
                const isActive = current === preset.id;
                // AMENDMENT point 3 — "is this still Wired?" answered at the
                // preset chip itself: which of THIS preset's own governed
                // fields has a stored override on any selected subject.
                // Figma's "modified instance" idea, sized for a chip.
                const modified = isActive ? preset.governs.filter((fid) => subjects.some((s) => s.props[fid] !== undefined)) : [];
                return (
                  <span key={preset.id} style={presetChipWrapStyle}>
                    <button
                      type="button"
                      data-slot="preset-button"
                      data-preset={preset.id}
                      data-selected={isActive}
                      data-modified={modified.length > 0}
                      title={
                        modified.length > 0
                          ? `${preset.label} — modified (${modified.length} field${modified.length > 1 ? "s" : ""} overridden)`
                          : preset.label
                      }
                      onClick={() => props.onChange(selector, preset.id)}
                      style={presetButtonStyle(isActive)}
                    >
                      {preset.label}
                      {modified.length > 0 && <span style={presetModifiedTagStyle}>+{modified.length}</span>}
                    </button>
                    {modified.length > 0 && (
                      <button
                        type="button"
                        data-slot="preset-reset"
                        title={`Reset to ${preset.label} — clear ${modified.length} override${modified.length > 1 ? "s" : ""}`}
                        aria-label={`Reset ${preset.label}`}
                        onClick={() => modified.forEach((fid) => props.onClearOverride(fid))}
                        style={presetResetBtnStyle}
                      >
                        ↺
                      </button>
                    )}
                  </span>
                );
              })}
              {reading.value === MIXED && (
                <span title={`${selectorField.label}: Mixed`} aria-label={`${selectorField.label}: Mixed`} style={legendMixedDotStyle} />
              )}
            </div>
          </div>
        );
      })}

      <div data-slot="icon-strip-rows" style={rowsStyle}>
        {(stateField || toneField || lensField) && (
          <div style={rowStyle}>
            {stateField && <FieldIconGroup field={stateField} panel={props} governed={governed} icon={(v) => <StateSwatchIcon value={v} />} />}
            {toneField && <FieldIconGroup field={toneField} panel={props} governed={governed} icon={(v) => <ToneSwatchIcon value={v} />} />}
            {lensField && <FieldIconGroup field={lensField} panel={props} governed={governed} icon={(v) => <LensGlyph value={v} />} />}
          </div>
        )}

        {(edgeField || textLayoutField) && (
          <div style={rowStyle}>
            {edgeField && <FieldIconGroup field={edgeField} panel={props} governed={governed} icon={(v) => <EdgeIcon side={v} />} />}
            {textLayoutField && <FieldIconGroup field={textLayoutField} panel={props} governed={governed} icon={(v) => <TextLayoutIcon layout={v} />} />}
          </div>
        )}

        {(directionField || diameterField || textSizeField || revealField) && (
          <div style={rowStyle}>
            {directionField && <FieldIconGroup field={directionField} panel={props} governed={governed} icon={(v) => <DirectionIcon direction={v} />} />}
            {diameterField && (
              <FieldScaleDropdown
                field={diameterField}
                panel={props}
                governed={governed}
                icon={(v) => <DiameterIcon r={v === "sm" ? 2 : v === "md" ? 3.2 : 4.6} />}
              />
            )}
            {textSizeField && (
              <FieldScaleDropdown
                field={textSizeField}
                panel={props}
                governed={governed}
                icon={(v) => <TextSizeIcon px={v === "sm" ? 8 : v === "md" ? 10 : v === "lg" ? 12 : 14} />}
              />
            )}
            {revealField && <FieldIconGroup field={revealField} panel={props} governed={governed} icon={(v) => <RevealIcon always={v === "always"} />} />}
          </div>
        )}

        {(lineStyleField || lineThicknessField || lineOpacityField) && (
          <div style={rowStyle}>
            {lineStyleField && <FieldIconGroup field={lineStyleField} panel={props} governed={governed} icon={(v) => <LineStyleIcon style={v} />} />}
            {lineThicknessField && (
              <FieldIconGroup
                field={lineThicknessField}
                panel={props}
                governed={governed}
                icon={(v) => <ThicknessIcon weight={v === "thin" ? 1.5 : v === "med" ? 3 : 5.5} />}
              />
            )}
            {lineOpacityField && <FieldStepper field={lineOpacityField} panel={props} governed={governed} glyph={<LineStyleIcon style="solid" />} />}
          </div>
        )}
        {lineColorField && (
          <div style={rowStyle}>
            <FieldIconGroup field={lineColorField} panel={props} governed={governed} icon={(v) => <TokenSwatchIcon token={v} />} size={20} />
          </div>
        )}

        {(fillStyleField || fillOpacityField) && (
          <div style={rowStyle}>
            {fillStyleField && <FieldIconGroup field={fillStyleField} panel={props} governed={governed} icon={(v) => <FillStyleIcon style={v} />} />}
            {fillOpacityField && <FieldStepper field={fillOpacityField} panel={props} governed={governed} glyph={<FillStyleIcon style="solid" />} />}
          </div>
        )}
        {fillColorField && (
          <div style={rowStyle}>
            <FieldIconGroup field={fillColorField} panel={props} governed={governed} icon={(v) => <TokenSwatchIcon token={v} />} size={20} />
          </div>
        )}

        {(eligibleField || hintingField || draggingField || producersField) && (
          <div style={rowStyle}>
            {eligibleField && <FieldToggleIcon field={eligibleField} panel={props} governed={governed} icon={<TargetIcon />} />}
            {hintingField && <FieldToggleIcon field={hintingField} panel={props} governed={governed} icon={<BulbIcon />} />}
            {draggingField && <FieldToggleIcon field={draggingField} panel={props} governed={governed} icon={<GripIcon />} />}
            {producersField && <FieldStepper field={producersField} panel={props} governed={governed} glyph={<GripIcon />} />}
          </div>
        )}

        {(roleField || decorationField) && (
          <div style={rowStyle}>
            {roleField && (
              <FieldWords field={roleField} panel={props} governed={governed} display={(_v, label) => (label === "Configuration" ? "Config" : label)} />
            )}
            {decorationField && (
              <FieldWords
                field={decorationField}
                panel={props}
                governed={governed}
                display={(v) =>
                  v === "variadic-positional" ? "*args" : v === "variadic-keyword" ? "**kwargs" : v === "variadic-bundled" ? "Bundle" : v === "mutates" ? "Mutates" : "None"
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Words go last — no honest icon exists for arbitrary text or for
          role/decoration's more jargon-y members (see the report). */}
      <div data-slot="icon-strip-text-section" style={textSectionStyle}>
        {nameField && <FieldText field={nameField} panel={props} governed={governed} />}
        {typeField && <FieldText field={typeField} panel={props} governed={governed} />}
        {defaultValueField && <FieldText field={defaultValueField} panel={props} governed={governed} />}
        {childrenField && <FieldText field={childrenField} panel={props} governed={governed} />}
        {lensBeforeField && <FieldText field={lensBeforeField} panel={props} governed={governed} />}
        {leftover.map((f) => (
          <GenericFallback key={f.id} field={f} panel={props} governed={governed} />
        ))}
      </div>
    </div>
  );
}

export const ICON_STRIP: PanelVariant = {
  id: "icon-strip",
  label: "Icon Strip",
  blurb:
    "Canvas-toolbar density (tldraw/Figma, not a settings form): related fields collapse into rows of icon toggles and tiny steppers, with a word label only where no glyph is honest.",
  Panel: IconStripPanel,
};

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const panelStyle: CSSProperties = {
  width: 320,
  padding: 14,
  border: "1px solid var(--bbox-panel-border, #ddd)",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontFamily: "sans-serif",
  fontSize: 13,
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
};
const headerStyle: CSSProperties = { fontWeight: 600, color: "var(--bbox-panel-fg-muted, #666)" };
const legendStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--bbox-panel-fg-faint, #9ca3af)",
  lineHeight: 1.4,
  paddingBottom: 4,
  borderBottom: "1px solid var(--bbox-panel-surface-2, #f0f0f0)",
};
const legendMixedDotStyle: CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--bbox-panel-warn-soft, #f59e0b)",
  verticalAlign: "middle",
};
const legendModifiedInlineStyle: CSSProperties = { fontWeight: 700, color: "var(--bbox-panel-warn, #92400e)" };
const legendClearDotStyle: CSSProperties = {
  display: "inline-flex",
  width: 12,
  height: 12,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "var(--bbox-panel-danger-bg, #fee2e2)",
  color: "var(--bbox-panel-danger, #b91c1c)",
  fontSize: 9,
  verticalAlign: "middle",
};

const presetSectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const presetRowStyle: CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" };
function presetButtonStyle(selected: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: selected ? "1px solid var(--bbox-panel-override, #6d28d9)" : "1px solid var(--bbox-panel-override-ring, #c4b5fd)",
    background: selected ? "var(--bbox-panel-override, #6d28d9)" : "var(--bbox-panel-surface, white)",
    color: selected ? "var(--bbox-panel-surface, white)" : "var(--bbox-panel-override, #6d28d9)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
const presetChipWrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 2 };
/** The "+N" on a modified preset chip — amber, not the chip's own purple,
 * so "modified" reads as a distinct fact from "active". */
const presetModifiedTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--bbox-panel-warn-ring, #fde68a)",
};
const presetResetBtnStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--bbox-panel-warn-ring, #fcd34d)",
  borderRadius: "50%",
  background: "var(--bbox-panel-warn-bg, #fffbeb)",
  color: "var(--bbox-panel-warn, #92400e)",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
};

const rowsStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
  padding: "4px 0",
  borderBottom: "1px solid var(--bbox-panel-surface-2, #f4f4f5)",
};

const clusterWrapStyle: CSSProperties = { position: "relative", display: "inline-flex", flexDirection: "column" };
function mixedRingStyle(mixed: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    border: mixed ? "1.5px dashed var(--bbox-panel-warn-soft, #f59e0b)" : "1.5px solid transparent",
  };
}
const clusterRowStyle: CSSProperties = { display: "flex", gap: 3, flexWrap: "wrap" };

function caretStyle(open: boolean): CSSProperties {
  return {
    border: "none",
    background: "none",
    color: open ? "var(--bbox-panel-fg, #111)" : "var(--bbox-panel-fg-faint, #a1a1aa)",
    fontSize: 10,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  };
}

const mixedDotStyle: CSSProperties = {
  position: "absolute",
  top: -3,
  right: -3,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--bbox-panel-warn-soft, #f59e0b)",
  border: "1.5px solid white",
};
const paintedDotStyle: CSSProperties = {
  position: "absolute",
  bottom: -3,
  left: -3,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--bbox-panel-accent, #0d9488)",
  border: "1.5px solid white",
};
const clearDotStyle: CSSProperties = {
  position: "absolute",
  bottom: -5,
  right: -5,
  width: 15,
  height: 15,
  borderRadius: "50%",
  border: "1px solid var(--bbox-panel-danger-ring, #fca5a5)",
  background: "var(--bbox-panel-danger-bg, #fee2e2)",
  color: "var(--bbox-panel-danger, #b91c1c)",
  fontSize: 10,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const chainPopoverStyle: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "4px 8px",
  background: "var(--bbox-panel-surface, white)",
  border: "1px solid var(--bbox-panel-border-soft, #e4e4e7)",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  minWidth: 150,
};
const chainLabelStyle: CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--bbox-panel-fg-muted, #71717a)", textTransform: "uppercase", letterSpacing: 0.3 };
function chainRowStyle(winner: boolean): CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 11,
    fontWeight: winner ? 700 : 400,
    color: winner ? "var(--bbox-panel-fg, #111)" : "var(--bbox-panel-fg-faint, #a1a1aa)",
    whiteSpace: "nowrap",
  };
}
const chainLayerStyle: CSSProperties = {};
const chainValueStyle: CSSProperties = { fontFamily: "monospace" };

function scaleMenuRowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "none",
    background: active ? "var(--bbox-panel-surface-2, #f4f4f5)" : "transparent",
    borderRadius: 4,
    padding: "3px 4px",
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    color: active ? "var(--bbox-panel-fg, #111)" : "var(--bbox-panel-fg-muted, #52525b)",
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
}
const scaleMenuTickStyle: CSSProperties = { width: 11, color: "var(--bbox-panel-override, #6d28d9)", fontSize: 11, flexShrink: 0 };

function wordChipStyle(active: boolean, palette: { ring: string; bg: string } | undefined): CSSProperties {
  return {
    padding: "3px 7px",
    borderRadius: 5,
    fontSize: 11,
    border: `1px solid ${active && palette ? palette.ring : "var(--bbox-panel-border, #d4d4d8)"}`,
    background: active && palette ? palette.bg : "var(--bbox-panel-surface, white)",
    color: active && palette ? palette.ring : "var(--bbox-panel-fg-muted, #52525b)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const stepperStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  border: "1px solid var(--bbox-panel-border, #d4d4d8)",
  borderRadius: 6,
  padding: "1px 3px",
  height: 24,
  boxSizing: "border-box",
};
const stepperBtnStyle: CSSProperties = {
  border: "none",
  background: "none",
  color: "var(--bbox-panel-fg-muted, #52525b)",
  fontSize: 12,
  width: 14,
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
};
const stepperValueStyle: CSSProperties = { fontSize: 10, fontFamily: "monospace", minWidth: 22, textAlign: "center", color: "var(--bbox-panel-fg, #111)" };

const textFieldWrapStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 1, minWidth: 88 };
const textFieldLabelStyle: CSSProperties = { fontSize: 9, color: "var(--bbox-panel-fg-faint, #a1a1aa)", textTransform: "uppercase", letterSpacing: 0.3 };
const textFieldInputStyle: CSSProperties = {
  padding: "3px 6px",
  border: "1px solid var(--bbox-panel-border, #d4d4d8)",
  borderRadius: 5,
  fontSize: 12,
  color: "var(--bbox-panel-fg, #111)",
  width: "100%",
  boxSizing: "border-box",
};
const textSectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 };
