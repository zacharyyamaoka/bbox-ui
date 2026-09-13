"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { decodeGlyphContent } from "@bbox-ui/glyph-content";

import { cn } from "./lib/utils";
import { glyphFootprint, type GlyphSize } from "./glyph.layout";

/**
 * packages/bbox-ui/src/glyph.tsx — Glyph v2 (docs/GLYPH-PLAN.md's contract).
 *
 * A square icon **slot** — like `Port`'s `PortLabel`, it renders whatever
 * `content` resolves to and never itself owns "what a Lucide name looks
 * like" or "how an upload got here." Generalizes the already-shipped
 * `BlockGlyph` (`block.tsx`) without touching it — that component keeps its
 * own `TextSize`-derived `ICON_RATIO` sizing (22/32/40); this one has its
 * own standalone ladder (`./glyph.layout.ts`).
 *
 * WHY lucide resolution is a REACT CONTEXT and not a core dependency: the
 * plan's dependency-free-core rule (Zach's standing `bam_ws` ruling, carried
 * here) means `@bbox-ui/core` may gain zero new runtime deps beyond the
 * workspace-only `@bbox-ui/glyph-content`. `lucide-react` (1,818 icons, one
 * lazy JSON chunk per D6) lives in `@bbox-ui/glyph-picker` instead, and
 * hands core a single function — `renderLucide(name) => ReactNode` — through
 * `GlyphResolverProvider`. Any host that never mounts a picker (a bare
 * Storybook story, a unit test) still renders every other content kind with
 * zero extra bytes; only a host that DOES want Lucide icons pays for them,
 * and pays once, through the provider it already needs for the picker.
 */

export interface GlyphResolverContextValue {
  /** Resolve a Lucide kebab name ("circle-check-big") to its icon element.
   *  Absent (no provider mounted) means "not resolved yet" — NOT an error;
   *  see `data-unresolved` below. */
  renderLucide?: (name: string) => ReactNode;
}

const GlyphResolverContext = createContext<GlyphResolverContextValue>({});

/** Mount once, near the root of whatever renders Glyphs with Lucide content
 *  (a canvas host, a Storybook decorator, `/create`'s page shell). */
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
  /** The size cascade's PRESET layer. Default `"sm"` — D1: Zach's table
   *  says small; the pre-plan component defaulted to `xl`. */
  sizePreset?: GlyphSize;
  /**
   * The size cascade's OVERRIDE layer, in px — set by a canvas resize
   * handle or the inspector's own number box, never by `sizePreset`
   * itself. Checked with `!== undefined`, not `??`/truthiness: an explicit
   * `size={0}` is a real override a drag can legally reach, and must not
   * silently fall back to the preset. Absent (the common case) means the
   * preset alone decides — see `./glyph.layout.ts`'s `glyphFootprint`, the
   * one place this rule is implemented.
   */
  size?: number;
  /** Equal padding on all four sides, in px. The outer rendered footprint
   *  (`size + 2*padding`) is plain CSS box-model arithmetic, not a fourth
   *  field — same rule Glyph v1 already carried. */
  padding?: number;
}

export function Glyph({
  content = "",
  sizePreset = "sm",
  size,
  padding = 0,
  className,
  style,
  children,
  ...props
}: GlyphProps) {
  const footprint = glyphFootprint({ sizePreset, size, padding });
  const decoded = decodeGlyphContent(content);
  const { renderLucide } = useGlyphResolver();

  // `children` is the pre-existing, backwards-compatible slot: it paints
  // only while `content` itself is empty, so a consumer that has already
  // migrated to `content` can never have the old prop silently override it.
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
      // than its box at 1em (SystemSketch's `iconRef` sizing, ported by
      // value — see docs/GLYPH-PLAN.md's stock-part table).
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
      // could not find the name (`resolveLucideName`'s day-one stub, or a
      // real resolver on an unknown icon) returns `null`, same as no
      // provider at all — "not resolved" is one case, not two, so both take
      // the `data-unresolved` diagnostic path rather than one of them
      // painting a blank square with nothing to grep for.
      if (rendered == null) unresolvedLucideName = decoded.name;
      body = rendered ?? null;
      break;
    }
  }

  return (
    <span
      data-slot="glyph"
      data-size={footprint.size}
      data-size-preset={sizePreset}
      data-content-kind={decoded.kind}
      data-empty={isEmptySlot ? "true" : undefined}
      data-unresolved={unresolvedLucideName}
      className={cn(
        "box-content inline-flex shrink-0 items-center justify-center leading-none [&>svg]:h-full [&>svg]:w-full",
        // The dashed, 40%-opacity square Notion shows for "add icon" — an
        // empty slot only, never layered under real content. Border-color
        // opacity (not element opacity) so a filled slot is never dimmed.
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
