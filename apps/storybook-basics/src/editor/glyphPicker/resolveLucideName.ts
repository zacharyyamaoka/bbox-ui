import { createElement, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { GlyphResolverProvider } from "../../components/glyph";

import { LucideNodeSvg, loadLucideLibrary, peekLucideLibrary, subscribeLucideLibrary } from "./lucideLibrary";

/**
 * src/editor/glyphPicker/resolveLucideName.ts — the trunk-lineage copy of
 * packages/glyph-picker/src/resolveLucideName.ts (see glyphPicker.tsx's header for why
 * two copies exist). Identical but for its import paths
 *
 * Real implementation (docs/GLYPH-PLAN.md phase 3) of the frozen stub:
 * looks the kebab name up in whatever chunk of the Lucide library has
 * loaded so far (`peekLucideLibrary`, synchronous — never triggers the
 * load itself, see `LucideGlyphResolver` below for that) and draws it with
 * `LucideNodeSvg`. Absent library or absent name both come back `null` —
 * `Glyph`'s own switch already treats "no provider" and "provider found
 * nothing" as the same `data-unresolved` case, so this doesn't need to
 * distinguish them either.
 */
export function resolveLucideName(name: string): ReactNode | null {
  const entry = peekLucideLibrary()?.byKebab.get(name);
  // `size` is nominal — Glyph's own CSS (`[&>svg]:h-full [&>svg]:w-full`)
  // stretches the drawn SVG to fill its span regardless of these width/
  // height attributes; only the `viewBox` LucideNodeSvg sets actually
  // decides the icon's proportions.
  return entry ? createElement(LucideNodeSvg, { node: entry.node, size: 24 }) : null;
}

/**
 * Mount near the root of whatever renders Glyphs with Lucide content and
 * re-renders every `Glyph` beneath it once the chunk resolves, by
 * installing a fresh `renderLucide` reference into `GlyphResolverProvider`
 * (a bare function reference wouldn't do that: the provider's context
 * value has to actually change for its consumers to re-render).
 *
 * `active` decides whether THIS mount is the one that should kick off the
 * ~637 KB fetch — default `true`, so a host that mounts this once near its
 * own root (the doc comment above) still gets the original "load the
 * moment anything needs Lucide" behaviour, and so does
 * `resolver.test.tsx`'s bare `<LucideGlyphResolver><Glyph content="lucide:…" />`.
 * `GlyphPicker`'s own default trigger is the one caller that passes
 * `active={false}` some of the time: it wraps a SINGLE Glyph of known
 * content, so it can tell in advance whether that Glyph needs Lucide at
 * all (`decoded.kind === "lucide"`) or whether the picker itself is open
 * (about to let you pick one) — an emoji glyph, an empty glyph, or a data:
 * upload should never cause this fetch just because it happens to render
 * through the same resolver as every other trigger.
 */
export function LucideGlyphResolver({ children, active = true }: { children?: ReactNode; active?: boolean }) {
  const library = useSyncExternalStore(subscribeLucideLibrary, peekLucideLibrary, peekLucideLibrary);
  useEffect(() => {
    // Idempotent — `loadLucideLibrary` checks `loaded`/`loading` before
    // starting the import, so re-running this on every null render only
    // ever starts the one chunk fetch. Gated on `active` too: an inactive
    // mount must never start the fetch just by existing, even though its
    // `library` is still null.
    if (active && !library) void loadLucideLibrary();
  }, [active, library]);
  const renderLucide = useMemo(() => (library ? resolveLucideName : undefined), [library]);
  return createElement(GlyphResolverProvider, { value: { renderLucide } }, children);
}
