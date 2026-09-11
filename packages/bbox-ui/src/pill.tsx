import type { ComponentProps, ReactNode } from "react";
import { governedFieldIds, resolveField } from "@bbox-ui/schema";

import { cn } from "./lib/utils";
import { toneOverride, type AppearanceState, type Lens, type Tone } from "./appearance";
import {
  PILL_PAINT_FIELDS,
  type PaintToken,
  type PillFillStyle,
  type PillLineStyle,
  type PillLineThickness,
} from "./pill.fields";
import { PILL_PRESETS } from "./pill.presets";

const PAINT_FIELD_BY_ID = Object.fromEntries(PILL_PAINT_FIELDS.map((f) => [f.id, f])) as Record<
  "lineStyle" | "lineColor" | "lineThickness" | "lineOpacity" | "fillStyle" | "fillColor" | "fillOpacity",
  (typeof PILL_PAINT_FIELDS)[number]
>;

/** The four fields a preset can ever reach — always exactly
 * `["lineStyle", "lineColor", "fillStyle", "fillColor"]` (PILL_PRESETS'
 * own `governs`), computed once so `pill.fields.test.ts` reads it off the
 * same real data instead of a re-typed literal. */
const GOVERNED_PAINT_FIELD_IDS = governedFieldIds(PILL_PRESETS);

/**
 * DEVIATION from appearance.ts's own illustrative one-liner
 * (`toneOverride(tone, governedFieldIds)`, T1-SPEC.md §2.2), reported per
 * the lane brief: that pattern is correct for `Port`, whose only "governed"
 * concepts are two COLOUR slots (ring/fill) computed by hand. Pill's
 * `governs` set mixes two colour fields (`lineColor`/`fillColor`) with two
 * STYLE-ENUM fields (`lineStyle`/`fillStyle`, whose legal values are
 * `"solid"|"dashed"|…` and `"none"|"semi"|"solid"`, never a token name).
 * Feeding all four through `toneOverride` stuffs a token string like
 * `"bbox-danger"` into `fillStyle`, which resolves to nothing in
 * `FILL_STYLE_ALPHA` (a real `NaN`-producing bug, caught by
 * `pill.fields.test.ts`). A tone therefore overrides only the two colour
 * fields; the current state's own `lineStyle`/`fillStyle` — solid outline
 * only, or outline-plus-fill — still decides the SHAPE of the paint, and
 * the tone decides its hue.
 */
const PILL_TONE_COLOR_FIELD_IDS = ["lineColor", "fillColor"];

/**
 * The subject a Pill's paint is resolved against — raw props with `tone`
 * folded in as an override.
 *
 * WHY this is EXPORTED rather than inlined in the component: `tone` is sugar
 * that writes the override layer (appearance.ts's own contract), never a
 * second preset family, since two families claiming the same paint fields is
 * what `assertDisjointPresets` forbids. Anything that wants to know what a
 * Pill will paint has to apply the same transform, and the product inspector
 * did not: it resolved raw props, so with any tone set its trace reported the
 * state preset winning with `primary` while the pill painted the tone's
 * colour, and the Line Color control sat live but inert, claiming an override
 * that was not on screen. One exported function is what stops the panel and
 * the pixels drifting apart again.
 */
export function pillResolutionSubject(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const tone = (props.tone as Tone | undefined) ?? "neutral";
  return { ...props, ...toneOverride(tone, PILL_TONE_COLOR_FIELD_IDS) };
}

/** Border width per rung — `med` (2px) matches the existing `border-2`
 * convention `Block`'s container and `Port`'s ring already use, so a
 * `state:"empty"` Pill reads as the same weight of line as everything
 * else on the board, not a fourth, unrelated stroke width. */
const LINE_THICKNESS_PX: Record<PillLineThickness, number> = {
  thin: 1,
  med: 2,
  thick: 3,
};

/**
 * `fillStyle`'s baked-in coverage before the freely-editable `fillOpacity`
 * further scales it — WHY two separate knobs: `fillStyle` is the governed,
 * semantic choice ("does this carry a value" — §3's colour grammar), while
 * `fillOpacity` is the ungoverned escape hatch nothing ever takes away.
 * Collapsing them into one field would let a preset silently fight a
 * numeric override instead of the two composing cleanly.
 */
const FILL_STYLE_ALPHA: Record<PillFillStyle, number> = { none: 0, semi: 0.35, solid: 1 };

/** A resolved `PaintToken` → a real CSS colour, honouring `alpha` (0-1)
 * via `color-mix` rather than the element's own `opacity` (which would
 * also fade the label text and border together). `"transparent"` is a
 * real token (§4.3), never treated as "no value". */
function paintColor(token: PaintToken, alpha: number): string {
  if (token === "transparent" || alpha <= 0) return "transparent";
  const value = `var(--${token})`;
  return alpha >= 1 ? value : `color-mix(in oklch, ${value} ${Math.round(alpha * 100)}%, transparent)`;
}

export interface PillProps extends Omit<ComponentProps<"span">, "children"> {
  state?: AppearanceState;
  tone?: Tone;
  lens?: Lens;
  lensBefore?: string;
  lineStyle?: PillLineStyle;
  lineColor?: PaintToken;
  lineThickness?: PillLineThickness;
  lineOpacity?: number;
  fillStyle?: PillFillStyle;
  fillColor?: PaintToken;
  fillOpacity?: number;
  children?: ReactNode;
}

/**
 * Pill = a rounded-outline text slot whose look is driven primarily by
 * `state` (the shared `APPEARANCE_FIELDS` bundle), with `lineStyle` /
 * `lineColor` / `fillStyle` / `fillColor` as a closed, preset-governed
 * escape hatch (docs/T1-SPEC.md §4.3).
 *
 * WHY those four are destructured WITHOUT a JS default, unlike everything
 * else here: an explicit value is exactly what makes a subject's OVERRIDE
 * candidate present (`resolve.ts`'s `resolveField`). Giving them a
 * `= "..."` default would make every Pill's raw props carry a value on
 * these fields, so the cascade would report `winner: "override"` even when
 * nobody reached past the preset — the §1.4 worked example (a Pill that
 * stores `{state:"wired"}` and nothing else) would be impossible to render
 * correctly. `lineThickness` / `lineOpacity` / `fillOpacity` DO take real
 * JS defaults: no preset ever governs them (`PILL_PRESETS`'s own `governs`
 * list omits them), so their cascade default and component default are
 * the same fact, and a plain destructured default is honest.
 *
 * WHY this render function calls `resolveField` (the schema's cascade)
 * instead of a hand-written lookup like `Port`'s `portDotStyle`: Pill has
 * real presets to resolve through, so the pixels it paints must be
 * produced by the SAME computation the product inspector's trace panel
 * reads — otherwise the trace would be a second, informal description of
 * paint this render never actually did (`resolve.ts`'s own doc comment).
 */
export function Pill({
  state = "empty",
  tone = "neutral",
  lens = "normal",
  // `lensBefore` has no visual mapping on Pill yet (no donor evidence for a
  // diff-lens rendering here) — destructured only so it never leaks onto
  // the DOM span as an unrecognized attribute.
  lensBefore: _lensBefore = "",
  lineStyle,
  lineColor,
  lineThickness = "med",
  lineOpacity = 1,
  fillStyle,
  fillColor,
  fillOpacity = 1,
  className,
  style,
  children,
  ...props
}: PillProps) {
  const subject = pillResolutionSubject({ state, tone, lineStyle, lineColor, fillStyle, fillColor });

  const lineStyleResolved = resolveField(PAINT_FIELD_BY_ID.lineStyle, subject, PILL_PRESETS)
    .resolved as PillLineStyle;
  const lineColorResolved = resolveField(PAINT_FIELD_BY_ID.lineColor, subject, PILL_PRESETS)
    .resolved as PaintToken;
  const fillStyleResolved = resolveField(PAINT_FIELD_BY_ID.fillStyle, subject, PILL_PRESETS)
    .resolved as PillFillStyle;
  const fillColorResolved = resolveField(PAINT_FIELD_BY_ID.fillColor, subject, PILL_PRESETS)
    .resolved as PaintToken;

  const hollow = lineStyleResolved === "none";

  return (
    <span
      data-slot="pill"
      data-state={state}
      data-tone={tone}
      data-lens={lens}
      data-line-style={lineStyleResolved}
      data-fill-style={fillStyleResolved}
      className={cn(
        "box-border inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-3 py-0.5 text-center leading-tight text-foreground",
        className,
      )}
      style={{
        borderStyle: hollow ? "none" : lineStyleResolved,
        borderWidth: hollow ? 0 : LINE_THICKNESS_PX[lineThickness],
        borderColor: paintColor(lineColorResolved, lineOpacity),
        background: paintColor(fillColorResolved, FILL_STYLE_ALPHA[fillStyleResolved] * fillOpacity),
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
