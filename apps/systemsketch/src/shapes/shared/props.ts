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

/** One declared port. The triple is the whole vocabulary a writer needs:
 *  `id` is what a wire binding names, `name` is what the rail renders, and
 *  `type` is the datatype label beside it. */
export const PortSpecV = T.object({
  id: T.string,
  name: T.string,
  type: T.string,
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
