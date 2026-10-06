"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { decodeGlyphContent } from "./glyph.content";

import { cn } from "../lib/utils";
import { BAR_SIZE_TO_GLYPH_PRESET, useBarSize } from "./barSize";
import { glyphFootprint, type GlyphSize } from "./glyph.layout";

/**
 * src/components/glyph.tsx — ported by value from packages/bbox-ui/src/glyph.tsx
 * (Glyph v2, docs/GLYPH-PLAN.md's contract). A square icon **slot** — it
 * renders whatever `content` resolves to and never itself owns "what a
 * Lucide name looks like" or "how an upload got here."
 *
 * WHY lucide resolution is a REACT CONTEXT and not a direct dependency: same
 * rule as the source file — a bare Storybook story that never mounts a
 * resolver still renders every other content kind with zero extra bytes.
 * Here the resolver is `.storybook/preview.tsx`'s decorator, a handful of
 * statically-imported icons — not the full glyph-picker popover, which is
 * explicitly out of scope for this pass.
 */

export interface GlyphResolverContextValue {
  /** Resolve a Lucide kebab name ("rocket") to its icon element. Absent (no
   *  provider mounted) means "not resolved yet" — NOT an error; see
   *  `data-unresolved` below. */
  renderLucide?: (name: string) => ReactNode;
}

const GlyphResolverContext = createContext<GlyphResolverContextValue>({});

/** Mount once, near the root of whatever renders Glyphs with Lucide content
 *  (this app's Storybook preview decorator). */
export function GlyphResolverProvider({
  value,
  children,
}: {
  value: GlyphResolverContextValue;
  children?: ReactNode;
}) {
  return <GlyphResolverContext.Provider value={value}>{children}</GlyphResolverContext.Provider>;
}

export function useGlyphResolver(): GlyphResolverContextValue {
  return useContext(GlyphResolverContext);
}

export interface GlyphProps extends ComponentProps<"span"> {
  /** Encoded content — `@bbox-ui/glyph-content`'s grammar (`""` ·
   *  `lucide:<name>` · `emoji:<char>` · a `data:`/`http(s):` image URL ·
   *  `text:<chars>`). Default `""` renders the bare, empty slot. */
  content?: string;
  /** The size cascade's PRESET layer. Falls back to the ambient `Bar` size
   *  (barSize.tsx) when omitted and a `Bar` is an ancestor, then to `"sm"`. */
  sizePreset?: GlyphSize;
  /** The size cascade's OVERRIDE layer, in px. Checked with `!== undefined`,
   *  not `??`/truthiness — an explicit `size={0}` is a real override. */
  size?: number;
  /** Equal padding on all four sides, in px. */
  padding?: number;
}

export function Glyph({
  content = "",
  sizePreset,
  size,
  padding = 0,
  className,
  style,
  children,
  ...props
}: GlyphProps) {
  const barSize = useBarSize();
  // Explicit prop wins; the ambient Bar cascade is only the fallback when
  // `sizePreset` itself is omitted, and `"sm"` is the floor when there is
  // no Bar ancestor either — same three-tier shape `Bar`'s own `size` and
  // `EditableText`'s `size` fall back through.
  const resolvedSizePreset = sizePreset ?? (barSize && BAR_SIZE_TO_GLYPH_PRESET[barSize]) ?? "sm";
  const footprint = glyphFootprint({ sizePreset: resolvedSizePreset, size, padding });
  const decoded = decodeGlyphContent(content);
  const { renderLucide } = useGlyphResolver();

  // `children` is the pre-existing, backwards-compatible slot: it paints
  // only while `content` itself is empty.
  const isEmptySlot = decoded.kind === "none" && children === undefined;

  let body: ReactNode = null;
  let unresolvedLucideName: string | undefined;
  switch (decoded.kind) {
    case "none":
      body = children;
      break;
    case "text":
      body = decoded.text;
      break;
    case "emoji":
      // 0.85em, not 1em: an emoji glyph's own metrics run slightly larger
      // than its box at 1em.
      body = <span style={{ fontSize: "0.85em", lineHeight: 1 }}>{decoded.char}</span>;
      break;
    case "image":
      body = (
        <img
          src={decoded.src}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      );
      break;
    case "lucide": {
      const rendered = renderLucide?.(decoded.name);
      // WHY `== null` and not `=== undefined`: a mounted resolver that
      // could not find the name returns `null`, same as no provider at all.
      if (rendered == null) unresolvedLucideName = decoded.name;
      body = rendered ?? null;
      break;
    }
  }

  return (
    <span
      data-slot="glyph"
      data-size={footprint.size}
      data-size-preset={resolvedSizePreset}
      data-content-kind={decoded.kind}
      data-empty={isEmptySlot ? "true" : undefined}
      data-unresolved={unresolvedLucideName}
      className={cn(
        "box-content inline-flex shrink-0 items-center justify-center leading-none [&>svg]:h-full [&>svg]:w-full",
        // The dashed, 40%-opacity square Notion shows for "add icon" — an
        // empty slot only, never layered under real content.
        isEmptySlot && "border border-dashed border-current/40",
        className,
      )}
      style={{
        width: footprint.size,
        height: footprint.size,
        fontSize: footprint.size,
        padding,
        ...style,
      }}
      {...props}
    >
      {body}
    </span>
  );
}
