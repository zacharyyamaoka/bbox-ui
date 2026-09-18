import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

/**
 * src/components/text.tsx — "just normal text", for displaying plain
 * information (title/type labels that aren't editable, a status line, a
 * caption). Deliberately tiny: a `data-slot` span plus a `tone` for the
 * default/muted distinction a header commonly needs — nothing else.
 */
export type TextTone = "default" | "muted";

export interface TextProps extends ComponentProps<"span"> {
  tone?: TextTone;
}

const TONE_CLASS: Record<TextTone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
};

export function Text({ tone = "default", className, ...props }: TextProps) {
  return (
    <span data-slot="text" data-tone={tone} className={cn(TONE_CLASS[tone], className)} {...props} />
  );
}
