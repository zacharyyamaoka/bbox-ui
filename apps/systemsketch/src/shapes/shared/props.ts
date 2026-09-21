// src/shapes/shared/props.ts — the validators every persisted prop shares
// (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3). tldraw's `T.*` is what makes a
// `.tldr` trustworthy: a record that does not validate never enters the
// store, so these three objects are the actual schema streams 3 and 4 write
// against.
//
// WHY the shared file rather than a copy per shape: `ss-block` and `ss-port`
// both carry `anchors`, and the day the anchor shape changes it has to change
// in ONE place or a half-migrated board validates on one shape and throws on
// the other.
import { T } from "tldraw";

/**
 * One declared port. A PAIR, not a triple: `id` is what a wire binding names,
 * and `declaration` is the one line the port's CodeEditor edits — `frame` or
 * `frame: Frame`.
 *
 * WHY there is no third `type` field, which is what this validator carried
 * until 2026-09-21 (ruling 8). Zach: "right now we just support by default
 * only a single line CodeEditor, we don't have this cnocept of Type as a
 * seperate thing.. You can parse it from the CodeEditor though for what
 * follows the : it just python". The type is DERIVED on read
 * (`@trunk/scene/portDeclaration`'s `portTypeOfDeclaration`), never stored
 * beside the name.
 *
 * What that rejects is not hypothetical: with `type` stored separately, the
 * only writer of it in the whole app was a fixture or the pyblocks backend.
 * `PortFace`'s rename session edited `props.name` alone, so a type on a board
 * could be READ by `lintScene` and painted on a free port, and could not be
 * changed by the person looking at it. Folding it into the line gives it an
 * editing surface for free — you type the `: float`.
 */
export const PortSpecV = T.object({
  id: T.string,
  declaration: T.string,
});

/**
 * A MEASURED dot centre, in shape-local px.
 *
 * WHY measured numbers and not a DOM lookup (lifted from
 * hosts/tldrawHost.tsx:19-31): tldraw paints edges in PAGE space, where no
 * DOM element of the shape exists at paint time. So the host sights each dot
 * once per layout change and stores the reading as plain numbers, which
 * survive pan, zoom AND rotation because they are projected through the
 * editor's own camera math rather than a rect ratio.
 *
 * `side` is `null` for a dot outside any rail — honest, rather than guessing
 * a wall for it.
 */
export const PortAnchorV = T.object({
  portId: T.string,
  x: T.number,
  y: T.number,
  side: T.nullable(T.literalEnum("top", "right", "bottom", "left")),
});

export const PointV = T.object({ x: T.number, y: T.number });
