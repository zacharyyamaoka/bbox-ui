import { createElement, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { GlyphResolverProvider } from "@bbox-ui/core";

import { LucideNodeSvg, loadLucideLibrary, peekLucideLibrary, subscribeLucideLibrary } from "./lucideLibrary";

/**
 * packages/glyph-picker/src/resolveLucideName.ts
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
 * Mount once near the root of whatever renders Glyphs with Lucide content.
 * Lazy-loads the one JSON chunk (plan D6) the first time ANY consumer
 * needs it — not on mount — and re-renders every `Glyph` beneath it once
 * the chunk resolves, by installing a fresh `renderLucide` reference into
 * `GlyphResolverProvider` (a bare function reference wouldn't do that: the
 * provider's context value has to actually change for its consumers to
 * re-render).
 *
 * WHY the load is kicked off here rather than only from the picker's own
 * open effect: the default trigger (`GlyphPicker.tsx`) wraps its own Glyph
 * in this same resolver so a picked icon paints even if the host never
 * mounted a provider itself — that Glyph can be showing a `lucide:` value
 * with the picker still closed, so waiting for "picker opened" would leave
 * it permanently unresolved.
 */
export function LucideGlyphResolver({ children }: { children?: ReactNode }) {
  const library = useSyncExternalStore(subscribeLucideLibrary, peekLucideLibrary, peekLucideLibrary);
  useEffect(() => {
    // Idempotent — `loadLucideLibrary` checks `loaded`/`loading` before
    // starting the import, so re-running this on every null render only
    // ever starts the one chunk fetch.
    if (!library) void loadLucideLibrary();
  }, [library]);
  const renderLucide = useMemo(() => (library ? resolveLucideName : undefined), [library]);
  return createElement(GlyphResolverProvider, { value: { renderLucide } }, children);
}
