// WHY the import is untyped and cast here rather than checked by tsc:
// src/boards.json is 705 board specs and ~780 KB. With resolveJsonModule on,
// tsc infers a literal type for every node, port and wire in the file — minutes
// of typechecking for a type nothing reads. The hand-written Spec types in
// types.ts are the contract that actually matters, and this is the single seam
// where the JSON becomes them.
// @ts-expect-error -- resolveJsonModule is deliberately off; see tsconfig.json
import raw from "./boards.json";
import type { BoardEntry } from "./types";

export const BOARDS = raw as unknown as BoardEntry[];

export const BOARD_BY_ID = new Map(BOARDS.map((b) => [b.id, b]));

/**
 * Node captions the board deliberately does not draw.
 *
 * `_size` reserves vertical room for a `tag` only on box / round / tb nodes, so a
 * caption on a pill, badge, terminal, note or diamond would be painted over
 * whatever sits below it. Rather than clip authored text, the renderer skips it
 * and the page prints it here — the complete value, still attached to its node.
 */
const SHAPES_WITHOUT_TAG_ROOM = new Set(["pill", "badge", "terminal", "note", "diamond"]);

export function droppedTags(spec: { nodes: Array<{ t?: string; tag?: string; shape?: string }> }) {
  return spec.nodes
    .filter((n) => n.tag && SHAPES_WITHOUT_TAG_ROOM.has(n.shape ?? "box"))
    .map((n) => ({ node: n.t ?? "", tag: n.tag as string }));
}
