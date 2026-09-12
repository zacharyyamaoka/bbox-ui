import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./lib/utils";
import {
  TEXT_BOX_FONT_STACKS,
  TEXT_BOX_SIZES,
  textBoxAlignItems,
  textBoxJustifyContent,
  type TextBoxFont,
  type TextBoxHorizontalAlign,
  type TextBoxSize,
  type TextBoxVerticalAlign,
} from "./textBox.layout";

export interface TextBoxProps extends ComponentProps<"div"> {
  size?: TextBoxSize;
  paddingTop?: number;
  paddingBot?: number;
  paddingLeft?: number;
  paddingRight?: number;
  font?: TextBoxFont;
  align?: TextBoxVerticalAlign;
  justify?: TextBoxHorizontalAlign;
}

/**
 * TextBox = one run of text, sized to its own content plus its own
 * padding. No `w`/`h` prop — a fixed box is whatever the consumer wraps
 * it in (docs/T1-SPEC.md §4.2's "Not a prop" list). `align`/`justify`
 * are real flex properties on this box's own container, so they only
 * become visible once a consumer gives the box an explicit width/height
 * (via `className`/`style`) — exactly the same "declared even though it
 * does nothing until the host opts in" shape as `Port`'s `textLayout`.
 *
 * `children` is intentionally destructured with NO default (see
 * `textBox.fields.ts`'s own comment): omitting it renders a truly empty
 * box, not the placeholder string a panel needs to stay demoable.
 */
export function TextBox({
  size = "md",
  paddingTop = 0,
  paddingBot = 0,
  paddingLeft = 0,
  paddingRight = 0,
  font = "sans",
  align = "middle",
  justify = "middle",
  className,
  style,
  children,
  ...props
}: TextBoxProps) {
  const boxStyle: CSSProperties = {
    fontSize: TEXT_BOX_SIZES[size],
    fontFamily: TEXT_BOX_FONT_STACKS[font],
    alignItems: textBoxAlignItems(align),
    justifyContent: textBoxJustifyContent(justify),
    paddingTop,
    paddingBottom: paddingBot,
    paddingLeft,
    paddingRight,
  };
  return (
    <div
      data-slot="text-box"
      data-size={size}
      data-font={font}
      data-align={align}
      data-justify={justify}
      className={cn("inline-flex w-fit leading-tight", className)}
      style={{ ...boxStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
