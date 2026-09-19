// src/scene/codeOrigin.ts — the `origin` binding on a code cell: WHO OWNS
// THE BYTES. This is the contract docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §3
// freezes (the field the old PEP 0018 would have quoted). Types here are
// FROZEN by the plan commit; the function bodies are filled by lane
// `scv-origin-and-actions`. Tests: ./codeOrigin.test.ts (off-limits to
// builders).
//
// One rule, stated once: whoever the binding points at owns the bytes.
//   origin == null   → the board owns them (a pseudo cell; today's behaviour)
//   origin present   → a real file owns them and `codeCell.source` is a CACHE
//
// WHY a binding and not a setting (Zach's own note, answers report "Pseudo
// vs real"): an ownership declaration (a DO-NOT-EDIT header, a mode flag) is
// advisory and stale by construction — the event that changes ownership is
// exactly the event that does not update the declaration. A pointer you can
// follow plus a hash you can check is not a declaration. The four states
// below are COMPUTED from (origin, what the host resolved right now), never
// stored.
//
// Pure: no React, no DOM, no file IO. A HOST resolves `origin.uri` against
// the board's directory and hashes the span; this file only judges.

/**
 * The binding. Exactly these three keys — a validator (`isCodeOrigin`)
 * rejects extras, the same exact-keys discipline pyblocks'
 * `systemsketch.py:415` (`_is_exact_v1`) applies to its mirror of this record.
 */
export interface CodeOrigin {
  /**
   * POSIX path relative to the board document's directory (retarget plan Q2
   * default — boards travel with their files; absolute paths break on any
   * other machine). Never `file://`, never absolute, never `..`-escaping;
   * pyblocks' viewer backend already refuses the same shapes for its
   * `source_uri` (`viewer_backend.py:273-300`).
   */
  uri: string;
  /**
   * `<module>` for the whole file, else the dotted qualified name of one
   * definition (`Pipeline.run`). A `#<ordinal>` suffix appears ONLY when the
   * same qualname is defined more than once in the file, zero-based in file
   * order, and only on the second occurrence onward (`f`, `f#1`, `f#2`).
   * Ordinal, not line:col — a line:col rots under any edit above the def; an
   * ordinal rots only when same-named defs are reordered (plan §3.3).
   */
  anchor: string;
  /**
   * `sha256:<hex64>` over the EXACT bytes of the anchored definition's span
   * as the definitions view reports them (`text` in
   * ./definitionsToScene.ts's `SourceDefinition`) at last sync. No strip,
   * no newline canonicalisation — the partition emits the span, the hasher
   * consumes the identical slice, and a pyblocks test asserts they agree.
   */
  contentHash: string;
}

/** The four states. All computed; none stored. */
export type CodeOriginState = "pseudo" | "synced" | "drifted" | "orphaned";

export const CODE_ORIGIN_STATES: readonly CodeOriginState[] = Object.freeze(["pseudo", "synced", "drifted", "orphaned"]);

/**
 * What the HOST found when it followed the pointer just now. Produced by
 * host glue (file IO lives there, never here); `spanHash` is the
 * `sha256:<hex64>` of the span the host read, present only when
 * `anchorFound`.
 */
export interface CodeOriginResolution {
  fileFound: boolean;
  anchorFound: boolean;
  spanHash?: string;
}

/**
 * The judge — plan §3.2, one row per state:
 *
 *   origin null                                      → "pseudo"
 *   origin set, resolution missing/undefined         → "orphaned"  (nothing could be resolved)
 *   origin set, !fileFound                           → "orphaned"
 *   origin set, fileFound, !anchorFound              → "orphaned"
 *   origin set, anchorFound, spanHash === contentHash → "synced"
 *   origin set, anchorFound, spanHash !== contentHash → "drifted"
 *
 * `pseudo` wins regardless of `resolution` — a null origin has nothing to
 * resolve, and a host that resolved anyway is answering a question nobody
 * asked. Total: never throws.
 */
export function codeOriginState(
  origin: CodeOrigin | null | undefined,
  resolution: CodeOriginResolution | undefined,
): CodeOriginState {
  void origin;
  void resolution;
  throw new Error("scv: not implemented — lane scv-origin-and-actions fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}

/**
 * Exact-keys validator for a value read off disk or off a wire: an object
 * with exactly `uri`, `anchor`, `contentHash`, all non-empty strings,
 * `contentHash` matching /^sha256:[0-9a-f]{64}$/. Extra keys → false. Total.
 */
export function isCodeOrigin(value: unknown): value is CodeOrigin {
  void value;
  throw new Error("scv: not implemented — lane scv-origin-and-actions fills this body (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md)");
}

/** What the four-state badge paints per state (presentational data; the
 *  component is ../components/originBadge.tsx). `variant` is a `Badge`
 *  variant (../components/badge.tsx). */
export interface OriginBadgeSpec {
  label: string;
  variant: "secondary" | "outline" | "warning" | "destructive";
  /** One sentence for a tooltip/title — the plan's §3.2 "UI behaviour" cell. */
  description: string;
}

/**
 * FROZEN by the plan (design data, not code): quiet for the two calm states,
 * amber for drift, red for orphaned. "Pseudo" gets a badge too — a reader
 * must be able to tell an unbound cell from a bound one at a glance.
 */
export const ORIGIN_BADGE: Readonly<Record<CodeOriginState, OriginBadgeSpec>> = Object.freeze({
  pseudo: Object.freeze({ label: "Pseudo", variant: "secondary", description: "Nothing backs this cell. The board owns the bytes; edit freely." }),
  synced: Object.freeze({ label: "Synced", variant: "outline", description: "A file owns these bytes and this cell is a faithful cache of the anchored span." }),
  drifted: Object.freeze({ label: "Drifted", variant: "warning", description: "The file changed under this cell. Re-read it; never merge silently." }),
  orphaned: Object.freeze({
    label: "Orphaned",
    variant: "destructive",
    description: "The file or the anchored definition cannot be found. Re-bind, or detach to a pseudo cell.",
  }),
});
