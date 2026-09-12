import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { resolveField } from "@bbox-ui/schema";

import type { AppearanceState, Lens, Tone } from "./appearance";
import { paintVar, toneOverride } from "./appearance";
import { BAR_LINE_FIELD_BY_ID, BAR_PRESETS } from "./bar.presets";
import { cn } from "./lib/utils";
import type { PaintToken, PillLineStyle, PillLineThickness } from "./pill.fields";

/**
 * packages/bbox-ui/src/bar.tsx
 *
 * Bar = a Block's header AND its footer. Zach, 2026-09-11: "the header and
 * the footer are basically the exact same on the block... we will fill
 * them differently but they are basically the same." One component, two
 * slots on the Block, filled differently.
 *
 * Three slots of its own (left · center · right) on a 1fr · auto · 1fr
 * grid so the centre is truly centred whatever the sides hold; a dividing
 * line toward the body that can be turned off and that takes the normal
 * appearance cascade for its paint (state · tone · lens, plus the same
 * line style / colour / thickness / opacity rows a Pill's ring has); a
 * `size` rung (sm · md · lg · xl) that sets the bar's own height and is
 * the value its slots inherit; and `hidden`, which the Block honours by
 * drawing nothing for that region.
 *
 * WHY `hidden` and `line` are two toggles and not one opacity: Zach —
 * "instead of overloading that, I do think the actual intent is probably
 * just to hide the line". An opacity slider would be a third way to say
 * off. The line's opacity still exists, as the appearance row it always
 * was, for the times it is on.
 */

export const BAR_SIZES = ["sm", "md", "lg", "xl"] as const;
export type BarSize = (typeof BAR_SIZES)[number];
export const BAR_SIZE_LABELS: Record<BarSize, string> = { sm: "Small", md: "Medium", lg: "Large", xl: "Extra Large" };
/** The bar's own minimum height per rung; its members bring their own scale. */
export const BAR_MIN_HEIGHT: Record<BarSize, number> = { sm: 28, md: 36, lg: 48, xl: 60 };

const LINE_THICKNESS_PX: Record<PillLineThickness, number> = { thin: 1, med: 2, thick: 3 };
const BORDER_STYLE_CSS: Record<PillLineStyle, NonNullable<CSSProperties["borderStyle"]>> = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
  none: "none",
};

export interface BarProps extends Omit<ComponentProps<"div">, "children"> {
  /** Which way the body is: a header's line sits at its bottom, a footer's
   *  at its top. Not a field — it follows from which slot the bar fills. */
  edge?: "bottom" | "top";
  hidden?: boolean;
  line?: boolean;
  size?: BarSize;
  /** px inset of the bar. */
  padding?: number;
  state?: AppearanceState;
  tone?: Tone;
  lens?: Lens;
  lineStyle?: PillLineStyle;
  lineColor?: PaintToken;
  lineThickness?: PillLineThickness;
  lineOpacity?: number;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

export function Bar({
  edge = "bottom",
  hidden = false,
  line = true,
  size = "md",
  padding = 6,
  state = "empty",
  tone = "neutral",
  lens = "normal",
  lineStyle,
  lineColor,
  lineThickness = "med",
  lineOpacity = 1,
  left,
  center,
  right,
  className,
  style,
  ...props
}: BarProps) {
  // The line's paint goes through the same cascade a Pill's ring does:
  // `state` selects a preset that governs lineStyle / lineColor, `tone`
  // folds into the override layer, an explicit prop wins.
  // Tone folds into the override layer for the line colour (a Pill does the
  // same for its ring); an explicit lineColor prop still wins.
  const subject: Record<string, unknown> = { state, ...toneOverride(tone, ["lineColor"]), lineStyle, lineColor };
  for (const k of Object.keys(subject)) if (subject[k] === undefined) delete subject[k];
  void lens;
  const lineStyleResolved = resolveField(BAR_LINE_FIELD_BY_ID.lineStyle, subject, BAR_PRESETS).resolved as PillLineStyle;
  const lineColorResolved = resolveField(BAR_LINE_FIELD_BY_ID.lineColor, subject, BAR_PRESETS).resolved as PaintToken;
  const lineWidth = line && lineStyleResolved !== "none" ? LINE_THICKNESS_PX[lineThickness] : 0;
  const borderStyle = BORDER_STYLE_CSS[lineStyleResolved] as CSSProperties["borderBottomStyle"];
  const lineCss: CSSProperties =
    edge === "bottom" ? { borderBottomWidth: lineWidth, borderBottomStyle: borderStyle } : { borderTopWidth: lineWidth, borderTopStyle: borderStyle };
  if (hidden) return <div data-slot="bar" data-edge={edge} data-hidden="true" hidden />;
  return (
    <div
      data-slot="bar"
      data-edge={edge}
      data-size={size}
      data-line={line}
      data-state={state}
      data-tone={tone}
      className={cn("grid w-full min-w-0 items-center", className)}
      style={{
        gridTemplateColumns: "1fr auto 1fr",
        gap: 8,
        padding: `${padding}px ${padding + 4}px`,
        minHeight: BAR_MIN_HEIGHT[size],
        borderColor: paintVar(lineColorResolved),
        // WHY opacity on the colour and not on the bar: the members keep
        // their own paint; only the line fades.
        ...(lineOpacity < 1 ? { borderColor: `color-mix(in srgb, ${paintVar(lineColorResolved)} ${Math.round(lineOpacity * 100)}%, transparent)` } : {}),
        ...lineCss,
        ...style,
      }}
      {...props}
    >
      <div data-slot="bar-cell" data-cell="left" style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
        {left}
      </div>
      <div data-slot="bar-cell" data-cell="center" style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {center}
      </div>
      <div data-slot="bar-cell" data-cell="right" style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {right}
      </div>
    </div>
  );
}
