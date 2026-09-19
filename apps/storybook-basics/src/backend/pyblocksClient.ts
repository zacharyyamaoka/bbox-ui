// src/backend/pyblocksClient.ts — the app's whole pyblocks contract, as
// three calls over the routes `pyblocks/server.py` serves. SKELETON
// committed by the planning lane (docs/PYBLOCKS-BACKEND-PLAN.md, lane
// `trunk-loader-events`); the factory throws until the builder fills it in.
// `pyblocksClient.test.ts` is the acceptance and is off-limits to the
// builder.
//
// Shape borrowed from the notebook lab's `labClient.ts` (branch
// claude/canvas-jupyter-execution-871b9c, apps/notebook-lab/src/labClient.ts):
// plain `fetch` + JSON, no websocket, no protocol layer — "Four routes, no
// websocket, no protocol". The one addition is injectable `fetch`, so the
// acceptance runs with a fake and the app passes the real one.
//
// Routes (pyblocks `server.py`; CORS already admits any localhost origin,
// `LOCAL_ORIGIN_HOSTS` at server.py:59, `_origin_allowed` at :676):
//   GET  /api/health                     — existing; gains `systemsketch: {scene: 1, events: 1}`
//   POST /api/systemsketch/scene         — NEW: {source, filename, viewId?} → PyblocksSceneDocument
//   POST /api/systemsketch/events        — NEW: {batches: SceneEventBatch[]} → PyblocksEventsEcho
// `/api/analyze` (BlockView) stays as it is; the app never calls it.

import type { PyblocksSceneDocument } from "../scene/pyblocksScene";
import type { SceneEventBatch } from "../scene/sceneEvents";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PyblocksHealth {
  status: string;
  analyzer: string;
  mode?: string;
  build?: string;
  systemsketch?: { scene?: number; events?: number };
}

export type PyblocksHealthResult =
  | { ok: true; health: PyblocksHealth; capabilities: { scene: boolean; events: boolean } }
  /** Unreachable, non-JSON, or not a pyblocks server — a REASON, never a
   *  throw: the settings pill renders it. */
  | { ok: false; reason: string };

export interface PyblocksSceneRequest {
  source: string;
  filename: string;
  viewId?: string | null;
}

export type SceneEventClass = "semantic" | "presentation" | "unknown";

export interface PyblocksEventsEcho {
  /** Batches accepted. */
  accepted: number;
  /** Events written back to source — `0` tonight, by contract. */
  applied: number;
  classified: {
    batchId: string;
    events: { eventIndex: number; type: string; class: SceneEventClass; reason: string }[];
  }[];
}

export class PyblocksRequestError extends Error {
  override readonly name = "PyblocksRequestError";
  constructor(
    message: string,
    readonly status: number,
    readonly route: string,
  ) {
    super(message);
  }
}

export interface PyblocksClient {
  readonly url: string;
  health(): Promise<PyblocksHealthResult>;
  /** POSTs and returns the document AFTER `parsePyblocksScene` — a
   *  malformed server reply throws `PyblocksSceneError`, never leaks. */
  scene(request: PyblocksSceneRequest): Promise<PyblocksSceneDocument>;
  events(batches: SceneEventBatch[]): Promise<PyblocksEventsEcho>;
}

/** `url` is an origin as `normalizePyblocksUrl` returns it. A non-2xx
 *  reply on `scene`/`events` throws `PyblocksRequestError` carrying the
 *  server's own `error` text (server.py always answers `{"error": …}`). */
export function createPyblocksClient(_url: string, _fetchImpl: FetchLike = fetch): PyblocksClient {
  throw new Error("createPyblocksClient: not implemented (lane trunk-loader-events)");
}
