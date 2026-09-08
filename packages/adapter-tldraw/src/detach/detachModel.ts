/**
 * What a detached group remembers about the bbox-ui shape it used to be.
 *
 * Detach transfers authority: a `bbox-port` / `bbox-block` stops being a
 * custom shape only this adapter can render and becomes ordinary tldraw
 * primitives that stock tldraw owns. The one thing that must survive the
 * transfer is the *semantics* — the complete shape props — because a picture
 * of a Block is not a Block, and a `.tldr` full of pictures is a one-way door.
 *
 * So the replacement group carries the record in `meta`. `meta` is tldraw's
 * own per-shape JSON bag: it survives save, load, copy, paste and duplicate
 * untouched, and stock tldraw neither reads nor validates it. A `.tldr`
 * opened on tldraw.com shows plain shapes; the same file opened here can put
 * the primitive back.
 *
 * Everything here is pure: values in, values out, no editor and no tldraw
 * runtime. What the record means is decided here; who writes it is decided
 * in `portDetachable.ts` / `blockDetachable.ts`.
 */
import type { JsonObject } from "tldraw";

import type { BBoxBlockShapeProps } from "../block-shape-util";
import type { BBoxPortShapeProps } from "../port-shape-util";

/** The single key bbox-ui claims inside any shape's `meta`. */
export const BBOX_UI_META_KEY = "bboxUi";

/**
 * Bumped only when an older record can no longer be read as written. A
 * reader that meets a NEWER version declines rather than guessing — a
 * half-understood record rebuilt wrong is worse than one left as primitives.
 */
export const DETACH_FORMAT_VERSION = 1;

export interface DetachedPortRecord {
  kind: "port";
  version: number;
  /** The complete `bbox-port` props — already JSON, never a class. */
  props: BBoxPortShapeProps;
}

export interface DetachedBlockRecord {
  kind: "block";
  version: number;
  /** The complete `bbox-block` props, ports array included. */
  props: BBoxBlockShapeProps;
}

/**
 * The primitive inside a detached group that stands where the original
 * shape's own origin stood — the Block's card rectangle, the Port's ring.
 * Marked with a record rather than a remembered id: ids are re-minted by
 * copy, paste and duplicate, and `meta` is not.
 */
export interface DetachedAnchorRecord {
  kind: "block-card" | "port-dot";
  version: number;
}

export type DetachedRecord =
  | DetachedPortRecord
  | DetachedBlockRecord
  | DetachedAnchorRecord;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The same value with every present-but-`undefined` key removed.
 *
 * WHY: `meta` is validated by `T.jsonValue`, which rejects `undefined`
 * anywhere in the tree — and reports the failure at the top of `meta`, not
 * at the offending key. Props copied into meta therefore restate what
 * "absent" means, here, once; a try/catch around the store write would turn
 * a whole detach into a silent no-op instead.
 */
export function toJsonSafe<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) {
    // JSON has no hole: an undefined element becomes null so later indices
    // keep their position.
    return value.map((entry) => {
      const next = sanitize(entry);
      return next === undefined ? null : next;
    });
  }
  if (isObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitize(entry);
      if (sanitized === undefined) continue;
      next[key] = sanitized;
    }
    return next;
  }
  const kind = typeof value;
  if (
    kind === "undefined" ||
    kind === "function" ||
    kind === "symbol" ||
    kind === "bigint"
  ) {
    return undefined;
  }
  return value;
}

/** Wrap a record for the `meta` field of the shape that will carry it. */
export function detachMeta(record: DetachedRecord): JsonObject {
  return { [BBOX_UI_META_KEY]: toJsonSafe(record) as unknown as JsonObject };
}

/**
 * Read a record back, or `null`.
 *
 * Deliberately strict about what a rebuild would otherwise guess at, and
 * deliberately silent about everything else: another tool's key inside
 * `meta` is none of bbox-ui's business, and a shape with no record at all
 * is the overwhelmingly common case, not an error.
 */
export function readDetachedRecord(meta: unknown): DetachedRecord | null {
  if (!isObject(meta)) return null;
  const record = meta[BBOX_UI_META_KEY];
  if (!isObject(record)) return null;
  if (
    typeof record.version !== "number" ||
    record.version > DETACH_FORMAT_VERSION
  ) {
    return null;
  }
  if (record.kind === "block-card" || record.kind === "port-dot") {
    return { kind: record.kind, version: record.version };
  }
  if (record.kind === "port") {
    return isObject(record.props)
      ? {
          kind: "port",
          version: record.version,
          props: record.props as unknown as BBoxPortShapeProps,
        }
      : null;
  }
  if (record.kind === "block") {
    return isObject(record.props)
      ? {
          kind: "block",
          version: record.version,
          props: record.props as unknown as BBoxBlockShapeProps,
        }
      : null;
  }
  return null;
}

/** The Port record a shape carries, if it carries one. */
export function readDetachedPort(meta: unknown): DetachedPortRecord | null {
  const record = readDetachedRecord(meta);
  return record?.kind === "port" ? record : null;
}

/** The Block record a shape carries, if it carries one. */
export function readDetachedBlock(meta: unknown): DetachedBlockRecord | null {
  const record = readDetachedRecord(meta);
  return record?.kind === "block" ? record : null;
}

/** A rebuildable record of either kind (what the Rebuild menu item scans for). */
export function readRebuildableRecord(
  meta: unknown,
): DetachedPortRecord | DetachedBlockRecord | null {
  const record = readDetachedRecord(meta);
  return record?.kind === "port" || record?.kind === "block" ? record : null;
}

export function isDetachedAnchor(meta: unknown): boolean {
  const record = readDetachedRecord(meta);
  return record?.kind === "block-card" || record?.kind === "port-dot";
}
