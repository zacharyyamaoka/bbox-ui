"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BarSize } from "./bar";
import type { EditableTextSize } from "./editableText.layout";
import type { GlyphSize } from "./glyph.layout";

/**
 * src/components/barSize.tsx — the size CASCADE from `Bar` down to its own
 * contents. Zach: "various things inside of the bar will size themselves
 * correctly... with a 'large bar' vs small bar you don't need to hand tune
 * each element inside." A React context, mirroring `glyph.tsx`'s own
 * resolver-context pattern (provider + `use*` hook), not a new prop
 * threaded through every layer in between — `Bar` already owns a `size`
 * prop (bar.tsx); this only makes that value reach descendants.
 *
 * The mapping from Bar's four rungs (sm/md/lg/xl) onto each consumer's OWN
 * size scale lives HERE, in one place, rather than scattered per component.
 * `Glyph`/`EditableText` already share Bar's exact four-rung ladder, so
 * their mapping is the identity — still spelled out below so all five
 * mappings are visible in one lookup. `Badge`/`Button`/`Toggle` each carry
 * a differently-shaped scale of their own.
 *
 * An explicit size prop on any child ALWAYS wins — every consumer only
 * calls into this context as the fallback when its own prop is
 * `undefined`, same "explicit beats derived" rule `glyphFootprint` already
 * applies to its own size/sizePreset pair.
 */

const BarSizeContext = createContext<BarSize | undefined>(undefined);

/** Mounted by `Bar` itself (bar.tsx) — not meant to be reached for by callers. */
export function BarSizeProvider({ size, children }: { size: BarSize; children?: ReactNode }) {
  return <BarSizeContext.Provider value={size}>{children}</BarSizeContext.Provider>;
}

/** `undefined` outside any `Bar` — "not inside a cascade," not an error;
 *  same shape as `useGlyphResolver`'s "no provider mounted" case. */
export function useBarSize(): BarSize | undefined {
  return useContext(BarSizeContext);
}

/** Glyph's own ladder (glyph.layout.ts's `GLYPH_SIZES`) is identical to
 *  Bar's four rungs, so the cascade is the identity. */
export const BAR_SIZE_TO_GLYPH_PRESET: Record<BarSize, GlyphSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

/** EditableText's own ladder (editableText.layout.ts's `EDITABLE_TEXT_SIZES`)
 *  is the same four-rung ladder too — see that file's own comment on why
 *  Glyph/EditableText/Port each keep an independent ladder rather than
 *  sharing one, even though the VALUES line up. */
export const BAR_SIZE_TO_EDITABLE_TEXT_SIZE: Record<BarSize, EditableTextSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

/** Badge has no size scale of its own yet (badge.tsx was a plain stock
 *  shadcn Badge, one size only) — this cascade is what gives it one,
 *  matching Bar's own four rungs directly. */
export type BadgeSize = "sm" | "md" | "lg" | "xl";
export const BAR_SIZE_TO_BADGE_SIZE: Record<BarSize, BadgeSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
};

/** Button and Toggle each already ship a THREE-rung size scale
 *  (sm/default/lg — no "xl"), so Bar's `xl` clamps down to their largest
 *  rung rather than this cascade inventing a fourth one they don't have. */
export type ButtonToggleSize = "sm" | "default" | "lg";
export const BAR_SIZE_TO_BUTTON_SIZE: Record<BarSize, ButtonToggleSize> = {
  sm: "sm",
  md: "default",
  lg: "lg",
  xl: "lg",
};
export const BAR_SIZE_TO_TOGGLE_SIZE: Record<BarSize, ButtonToggleSize> = BAR_SIZE_TO_BUTTON_SIZE;
