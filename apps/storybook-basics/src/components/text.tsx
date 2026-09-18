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

export function Text({ tone = "default", className, style, ...props }: TextProps) {
  return (
    <span
      data-slot="text"
      data-tone={tone}
      className={cn(TONE_CLASS[tone], className)}
      // The skin seam (src/skin/skin.ts + skin.css) — the "TextBox/
      // EditableText rung" `--bbox-skin-font-sans` was deferred for
      // (Tranche 2's own DEFERRED_TO_LATER_TRANCHES comment). Set INLINE,
      // beating plain inheritance, because `Text` is meant to be dropped
      // anywhere — a title/type/status label with no guarantee its
      // ancestor is a font-cascaded `Block`. Fallback `inherit` is this
      // span's exact behaviour today (no font-family of its own at all),
      // so a consumer who never imports skin.css is byte-identical.
      style={{ fontFamily: "var(--bbox-skin-font-sans, inherit)", ...style }}
      {...props}
    />
  );
}
