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

import { parsePyblocksScene, type PyblocksSceneDocument } from "../scene/pyblocksScene";
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
const HEALTH_ROUTE = "/api/health";
const SCENE_ROUTE = "/api/systemsketch/scene";
const EVENTS_ROUTE = "/api/systemsketch/events";

/** What `pyblocks/server.py`'s `/api/health` calls itself. A server that
 *  does not say this is something else answering on the port. */
const PYBLOCKS_ANALYZER = "pyblocks-blockview-v1";

/** The server always answers `{"error": …}` (`server.py:167-183`); anything
 *  else falls back to the status line rather than inventing a sentence. */
function errorTextOf(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A reply body, or `undefined` when it is not JSON at all — a non-2xx page
 *  from something that is not pyblocks must still produce an error a person
 *  can read, not a parse exception from inside the client. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function createPyblocksClient(url: string, fetchImpl: FetchLike = fetch): PyblocksClient {
  // One trailing slash is what a person pastes out of a browser bar; every
  // route below is written with its own leading slash, so the origin keeps
  // none.
  const origin = url.replace(/\/+$/, "");

  async function post(route: string, payload: unknown): Promise<unknown> {
    const response = await fetchImpl(`${origin}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (!response.ok) throw new PyblocksRequestError(errorTextOf(body, response.statusText), response.status, route);
    return body;
  }

  return {
    url: origin,

    async health() {
      // WHY health never throws: its whole job is to fill a settings pill,
      // and "the server is down" is the most ordinary answer it has. A
      // throw here would make every caller wrap it, and the one that
      // forgot would take the app down over a backend the person opted
      // into and can turn off again.
      try {
        const response = await fetchImpl(`${origin}${HEALTH_ROUTE}`);
        if (!response.ok) return { ok: false, reason: `${HEALTH_ROUTE} answered ${response.status} ${response.statusText}`.trim() };
        const body = await readJson(response);
        if (typeof body !== "object" || body === null) return { ok: false, reason: `${HEALTH_ROUTE} did not answer JSON` };
        const health = body as PyblocksHealth;
        if (typeof health.analyzer !== "string") {
          return { ok: false, reason: `${origin} answered, but it is not pyblocks (no analyzer; expected ${PYBLOCKS_ANALYZER})` };
        }
        return {
          ok: true,
          health,
          // The capability keys are the server's own version marker: an
          // older pyblocks is reachable and says nothing here, so the two
          // routes below stay hidden rather than 404ing in the person's face.
          capabilities: { scene: health.systemsketch?.scene === 1, events: health.systemsketch?.events === 1 },
        };
      } catch (error) {
        return { ok: false, reason: reasonOf(error) };
      }
    },

    async scene(request) {
      // Validated, never trusted: a 200 from the right port is still just
      // bytes, and `parsePyblocksScene` is the only thing that decides they
      // are a document.
      return parsePyblocksScene(await post(SCENE_ROUTE, request));
    },

    async events(batches) {
      // WHY an empty list never reaches the network: the bridge publishes
      // per gesture and a gesture that changed nothing derives `[]` — a
      // POST for it would be pure noise in the server's log, which is the
      // one place tonight's "applied: 0" contract is actually readable.
      if (batches.length === 0) return { accepted: 0, applied: 0, classified: [] };
      return (await post(EVENTS_ROUTE, { batches })) as PyblocksEventsEcho;
    },
  };
}
