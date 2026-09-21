// src/scene/portDeclaration.ts — a port's declaration line, and the type you
// can read out of it. Pure: no React, no DOM, no canvas engine, no imports at
// all.
//
// THERE IS NO SEPARATE TYPE. Zach, 2026-09-21, ruling 8: "right now we just
// support by default only a single line CodeEditor, we don't have this cnocept
// of Type as a seperate thing.. You can parse it from the CodeEditor though
// for what follows the : it just python".
//
// So a port stores ONE string — the line its CodeEditor edits, `gain_x: float`
// — and its type is whatever follows the first `:`, derived on read. What that
// rejects is the shape this kit shipped until today: a second stored field
// beside the name (`{id, name, type}` in the app's `PortSpecV`,
// `props.name`/`props.type` on `ss-port`) which no editing surface in the app
// could ever write, so every type on a board arrived from a fixture or a
// backend and could not be changed by the person looking at it.
//
// WHY the parse lives in `scene/` rather than inside the CodeEditor: it is
// pure and it is read by more than one component — the two faces that paint a
// port, the projection that feeds `lint.ts`'s `type-mismatch`, and the wire
// gesture that asks a loose end what it wants. That is exactly the placement
// rule (README: "pure, and reused across components → scene/, domain
// vocabulary and all"). `components/` never imports this; a component is
// handed the two runs already split.
//
// EVERY AUTHORED CHARACTER SURVIVES. `parsePortDeclaration` slices, it never
// trims, normalizes or substitutes — `name` + (`":"` + `type`) reassembles the
// input byte for byte (`feedback_truthful_property_rendering`: "Names,
// literals, labels … retain every authored character"). Trimming happens in
// exactly one place, `portTypeOfDeclaration`, because a VOCABULARY value has
// to compare equal across `float` and ` float`; the rendered runs never go
// through it.

/**
 * One declaration line, split at the first `:` — both halves VERBATIM.
 *
 * `annotated` is the field that keeps the split lossless: `"x"` and `"x:"`
 * both have an empty `type`, and without this flag re-assembling them would
 * collapse two different authored lines into one.
 */
export interface PortDeclaration {
  /** Everything before the first `:`, or the whole line when there is none. */
  readonly name: string;
  /** Everything after the first `:` — leading space included. `""` when the
   *  line carries no colon, and also when it ends in one. */
  readonly type: string;
  /** Did the line actually carry a `:`? */
  readonly annotated: boolean;
}

/**
 * Split a declaration line. Total: every string is a declaration, including
 * `""` (an unnamed, untyped port — the honest reading of an empty field).
 *
 * The FIRST colon splits, and only the first: `items: dict[str, int]` is a
 * name and one type, not three fragments. A Python default (`x: int = 3`)
 * therefore lands wholly in `type`, which is the honest answer for a single
 * line this module does not pretend to fully parse — see this file's header.
 */
export function parsePortDeclaration(line: string): PortDeclaration {
  const colon = line.indexOf(":");
  if (colon < 0) return { name: line, type: "", annotated: false };
  return { name: line.slice(0, colon), type: line.slice(colon + 1), annotated: true };
}

/**
 * The port's declared type as a VOCABULARY value — trimmed, and `undefined`
 * when the line states none.
 *
 * `undefined` rather than `""` on purpose: it is the kit-wide "unknown, no
 * judgement" convention that `lint.ts`'s `PortsOf`/`PortTypeOf` document, and
 * `type-mismatch` skips an edge whose end resolves nothing. Returning `""`
 * would turn "no type stated" into a type name that matches nothing, which is
 * a judgement this function has no grounds to make. A bare `"x:"` is
 * deliberately in the same bucket as `"x"` — a colon with nothing after it
 * states no type.
 */
export function portTypeOfDeclaration(line: string): string | undefined {
  const type = parsePortDeclaration(line).type.trim();
  return type === "" ? undefined : type;
}

/**
 * Build a line from a name and a type — a CONSTRUCTOR, not the inverse of
 * `parsePortDeclaration`. It mints the canonical spelling (`name: type`,
 * one space) because its callers hold two values that were never a line in
 * the first place: a schema migration folding the old `{name, type}` pair,
 * and a backend that reports a port's name and annotation separately.
 *
 * An empty or whitespace-only `type` produces a bare name, never a trailing
 * colon — "no type stated" is the absence of the annotation, not an empty one.
 */
export function formatPortDeclaration(name: string, type: string): string {
  const stated = type.trim();
  return stated === "" ? name : `${name}: ${stated}`;
}

/**
 * Rename the port, leaving its annotation exactly as authored.
 *
 * WHY it splices instead of `formatPortDeclaration(name, parse(line).type)`:
 * the type segment comes back through verbatim, so a programmatic rename
 * (a backend applying authored port names over minted ids) cannot quietly
 * re-space someone's line.
 */
export function withPortDeclarationName(line: string, name: string): string {
  const { type, annotated } = parsePortDeclaration(line);
  return annotated ? `${name}:${type}` : name;
}

/**
 * Re-annotate the port, leaving its name exactly as authored. Clearing the
 * type (an empty or whitespace-only `type`) removes the colon with it.
 */
export function withPortDeclarationType(line: string, type: string): string {
  return formatPortDeclaration(parsePortDeclaration(line).name, type);
}
