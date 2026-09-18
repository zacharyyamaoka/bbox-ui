// src/editor/nodeCatalog.ts — the PURE half of the edge-drop menu (card
// 14): given a catalog of nodes a host could insert and what polarity/type
// the loose cable end needs, which entries can actually answer it.
//
// Lives in `src/editor/`, not `src/scene/`, on purpose: this filters a
// CATALOG — a list of things a host is willing to create — not a
// `BlockScene`. The scene kit's own rule (`lint.ts`'s header) is "no
// canvas engine, no React"; this file keeps that half (still zero React,
// zero DOM) but its subject is host-authored catalog data, never a
// document. See `src/editor/README.md`'s "what belongs here" for the line.
//
// Re-expression of SystemSketch's `src/blocks/connections/blockPicker.ts`
// (read in full 2026-09-18, donor is READ-ONLY, never edited):
//   - `BlockPickerPreset` (:23-33) → `NodeCatalogEntry` below. The shape
//     survives (`id`, `label`, `icon`, port counts); `blockType`/`view`/
//     `stockPreset`/`group` do not — those are SystemSketch's own Block
//     model and its "quick insert" grouping UI, a product decision this
//     kit has no opinion on. `kind` replaces them as an opaque
//     host-defined tag the kit never branches on, per this lane's brief
//     ("do NOT ship SystemSketch's domain preset table... injected by the
//     host").
//   - `blockPickerPresetsFor(wantsProducer)` (:58-63, "a producer needs an
//     output, a consumer an input") → `catalogFor` below. Re-expressed in
//     the KIT'S OWN vocabulary rather than the donor's boolean: `want` is
//     a `PortDirection` (`"source" | "sink"`, `lint.ts`), naming the
//     polarity the picked entry must SUPPLY to answer the loose end —
//     `"source"` when the cable needs a producer (donor's
//     `wantsProducer: true`, filtering `outputs > 0`), `"sink"` when it
//     needs a consumer (donor's `wantsProducer: false`, filtering
//     `inputs > 0`). Same rule, our words: no boolean flag reinvented.
//   - Type filtering is NOT in the donor at all — SystemSketch's presets
//     carry no port-type vocabulary. Added here because this kit already
//     has one (`lint.ts`'s `TypeCompatible`/`typesIntersect`, Blockly
//     `ConnectionChecker.doTypeChecks`-derived, see that file's header)
//     and card 09/14 both want the SAME notion of "compatible" — reusing
//     `typesIntersect` as the default keeps one type vocabulary across
//     the containment, connection-validation and catalog-filtering call
//     sites rather than three.
//
// `instantiate`-style id-minting (card 13's flat definition table) is
// deliberately NOT here — this file answers "which entries qualify", not
// "make one real". That is the caller's job (see `edgeDropMenu.tsx`'s
// `onPick`, which hands the picked `NodeCatalogEntry` back unmodified).

import type { PortDirection, TypeCompatible } from "../scene/lint";
import { typesIntersect } from "../scene/lint";

/**
 * One thing a host is willing to create from the edge-drop menu. Host-
 * authored and host-owned — this kit ships no catalog of its own (the
 * brief: "do NOT ship SystemSketch's domain preset table... that is its
 * product vocabulary, not the kit's").
 */
export interface NodeCatalogEntry {
  /** Stable id for this catalog entry — NOT a scene node id; the host
   *  mints a fresh node id when an entry is picked (`instantiate`, card
   *  13, is the sibling of that minting; this file has no opinion on it). */
  readonly id: string;
  readonly label: string;
  /** `@bbox-ui/glyph-content` grammar (`"lucide:box"`, `"emoji:🧱"`, …).
   *  Optional — `EdgeDropMenu` renders an empty `Glyph` slot without it. */
  readonly icon?: string;
  /** Opaque host vocabulary (a category, a group heading key, …). The kit
   *  never branches on it — same "undefined/opaque = no kit opinion"
   *  convention `lint.ts`'s `PortsOf`/`PortTypeOf` already use for other
   *  fields. */
  readonly kind: string;
  /** How many sink (input) ports this entry exposes once created. */
  readonly inputs: number;
  /** How many source (output) ports this entry exposes once created. */
  readonly outputs: number;
  /** This entry's own port-type vocabulary. `undefined` = unconstrained —
   *  the same convention `lint.ts`'s `PortTypeOf` documents: an entry with
   *  no declared types is compatible with any want. */
  readonly types?: readonly string[];
}

/** What the loose cable end is asking the catalog to answer. */
export interface NodeCatalogWant {
  /** The polarity a qualifying entry must be able to SUPPLY — `"source"`
   *  when the cable needs a producer, `"sink"` when it needs a consumer.
   *  This is the donor's `needed` (`ConnectionShapeUtil.tsx`'s
   *  `offerBlockForLooseTerminal`: `needed =
   *  oppositePolarity(anchoredPolarity)`), not the anchored end's own
   *  direction — the caller resolves that opposite-of-anchor step before
   *  calling in, same as the donor does. */
  readonly direction: PortDirection;
  /** The anchored port's accepted type tags. `undefined` — or an entry
   *  with `types` itself `undefined` — means unconstrained, so every
   *  polarity-qualifying entry passes. */
  readonly types?: readonly string[];
}

/**
 * Which catalog entries can answer `want`: re-expression of
 * `blockPickerPresetsFor` extended with the type axis the donor's
 * presets never carried. Total and order-preserving — entries qualify or
 * they don't, and the catalog's own order survives into the result
 * (matches `blockPickerPresetsFor`'s plain `.filter`).
 */
export function catalogFor(
  catalog: readonly NodeCatalogEntry[],
  want: NodeCatalogWant,
  compatible: TypeCompatible = typesIntersect,
): NodeCatalogEntry[] {
  return catalog.filter((entry) => {
    const suppliesNeededPolarity = want.direction === "source" ? entry.outputs > 0 : entry.inputs > 0;
    if (!suppliesNeededPolarity) return false;
    if (want.types === undefined || entry.types === undefined) return true;
    return compatible(entry.types, want.types);
  });
}
