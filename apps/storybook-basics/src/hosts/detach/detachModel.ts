/**
 * src/hosts/detach/detachModel.ts — what a detached group remembers about the
 * scene node it used to be.
 *
 * DONOR: packages/adapter-tldraw/src/hosts/detach/detachModel.ts (read in full,
 * 2026-09-18) — the record shape, `toJsonSafe`/`sanitize`, `detachMeta`,
 * `readDetachedRecord` and their doc comments are ported near-verbatim from
 * that file (the donor's own header: "Everything here is pure: values in,
 * values out, no editor and no tldraw runtime"). What differs, because this
 * app's architecture differs (see `./index.ts`'s own header for the split):
 * the donor recorded a native shape's OWN persisted props (`BBoxBlockShapeProps`
 * etc.); this app's `bbox-node` shape carries almost no persisted state at all
 * (`{w, h, nodeId}` — see `../hosts/tldrawHost.tsx`'s file header, rule 1) —
 * the actual semantics live in the HOST'S `HostScene.nodes[].data`. So the
 * record here is the scene node's `{type, id, parentId, data}`, not a shape's
 * props, and rebuild has to recreate BOTH the scene-node entry and the
 * `bbox-node` shape (see `./rebuild.ts`'s own header).
 */
import type { JsonObject } from "tldraw";

import type { HostNodeData } from "../hostScene";

/** The single key bbox-ui's detach kit claims inside any shape's `meta`. */
export const BBOX_UI_META_KEY = "bboxUiDetach";

/**
 * Bumped only when an older record can no longer be read as written. A
 * reader that meets a NEWER version declines rather than guessing — a
 * half-understood record rebuilt wrong is worse than one left as primitives.
 * (Donor's own rule, `detachModel.ts:31-34`.)
 */
export const DETACH_FORMAT_VERSION = 1;

/** The complete scene node this shape used to render — everything `rebuild`
 *  needs to hand back to the host's `onSceneChange`. `nodeId` is the
 *  ORIGINAL scene node id, reused verbatim on rebuild so edges that name it
 *  (`sceneWires`) keep resolving across a detach → rebuild round trip. */
export interface DetachedNodeRecord {
  kind: "scene-node";
  version: number;
  nodeType: string;
  nodeId: string;
  parentId?: string;
  data: HostNodeData;
}

/**
 * The primitive inside a detached group that stands where the original
 * shape's own origin stood — donor's own device (`detachModel.ts:62-70`),
 * ported because rebuild needs the exact same "find the anchor, not a
 * remembered id" technique (ids are re-minted by copy/paste/duplicate;
 * `meta` is not).
 */
export interface DetachedAnchorRecord {
  kind: "bbox-node-anchor";
  version: number;
}

export type DetachedRecord = DetachedNodeRecord | DetachedAnchorRecord;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The same value with every present-but-`undefined` key removed — ported
 * verbatim from the donor (`detachModel.ts:91-124`): `meta` is validated by
 * `T.jsonValue`, which rejects `undefined` anywhere in the tree, and reports
 * the failure at the top of `meta` rather than at the offending key.
 */
export function toJsonSafe<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) {
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
  if (kind === "undefined" || kind === "function" || kind === "symbol" || kind === "bigint") {
    return undefined;
  }
  return value;
}

/** Wrap a record for the `meta` field of the shape that will carry it. */
export function detachMeta(record: DetachedRecord): JsonObject {
  return { [BBOX_UI_META_KEY]: toJsonSafe(record) as unknown as JsonObject };
}

/**
 * Read a record back, or `null`. Deliberately strict about what a rebuild
 * would otherwise guess at, and deliberately silent about everything else —
 * donor's own rule (`detachModel.ts:131-138`).
 */
export function readDetachedRecord(meta: unknown): DetachedRecord | null {
  if (!isObject(meta)) return null;
  const record = meta[BBOX_UI_META_KEY];
  if (!isObject(record)) return null;
  if (typeof record.version !== "number" || record.version > DETACH_FORMAT_VERSION) {
    return null;
  }
  if (record.kind === "bbox-node-anchor") {
    return { kind: "bbox-node-anchor", version: record.version };
  }
  if (record.kind === "scene-node") {
    if (typeof record.nodeType !== "string" || typeof record.nodeId !== "string" || !isObject(record.data)) {
      return null;
    }
    return {
      kind: "scene-node",
      version: record.version,
      nodeType: record.nodeType,
      nodeId: record.nodeId,
      parentId: typeof record.parentId === "string" ? record.parentId : undefined,
      data: record.data as unknown as HostNodeData,
    };
  }
  return null;
}

/** The scene-node record a shape carries, if it carries one. */
export function readDetachedNode(meta: unknown): DetachedNodeRecord | null {
  const record = readDetachedRecord(meta);
  return record?.kind === "scene-node" ? record : null;
}

export function isDetachedAnchor(meta: unknown): boolean {
  return readDetachedRecord(meta)?.kind === "bbox-node-anchor";
}
