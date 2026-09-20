// src/recording/recordingClient.ts — PORTED from the archive:
// /home/bam/systemsketch/src/recorder/recorderClient.ts:1-75 (read on disk
// 2026-09-19). Every route, every payload shape and `expectJson`'s exact
// error wording are the donor's, character for character.
//
// ONE seam added, and it is the reason this file is not a straight `cat`:
// the donor called the global `fetch` four times at module scope, so nothing
// below the network could be driven without a browser. Here the transport is
// injected (`createRecordingClient({ fetch })`), defaulting to the global —
// so the same module serves the real app, a Storybook story with a scripted
// host, and a node unit test, and `recordingCore.ts` never has to know which
// it is talking to.
//
// WHY a client object rather than four free functions: `RecordingEffects`
// (recordingEffects.ts) takes ONE of these, which is what lets a fake host be
// a single object literal instead of four module mocks.

import type { RecordingPayload } from "./flightRecorder";

/** Ported: recorderClient.ts:12 — where a recording's frames came from. */
export type FramesSource = "screencast" | "canvas" | "none";

/** Ported: recorderClient.ts:14-17. */
export interface RecorderHostStatus {
  screencast: boolean;
  reason: string;
}

/** Ported: recorderClient.ts:19-25. */
export interface SavedRecording {
  path: string;
  packet: string;
  savedAt: string;
  frames: number;
  framesSource: FramesSource;
}

/** Ported: recorderClient.ts:27-30 — one fallback frame, PNG as base64. */
export interface CanvasFrame {
  t: number;
  png: string;
}

/** Ported: recorderClient.ts:65-69 — what `saveRecording` adds to the buffer. */
export interface SaveExtras {
  channel: string;
  build: string;
  version: string;
  canvasFrames?: CanvasFrame[];
}

/**
 * NOT ported — new, and deliberately so. The archive's viewer was a file the
 * host WROTE (`playback_html()`, scripts/recording_store.py:605-630): a
 * self-contained page next to the frames. Zach, 2026-09-19: *"please give the
 * option to 'view last recording' — that should open the viewer in a modal in
 * the app"*. A modal cannot open a folder on disk, so the same three inputs
 * that page interpolated (`__FRAMES__`, `__ROWS__`, `__DETAILS__`, plus the
 * packet and the header it reads the aspect ratio from) come back over one
 * route instead: `GET /api/recordings/bundle`. The shape is the page's own
 * variables, renamed nowhere.
 */
export interface RecordingBundle {
  path: string;
  header: Record<string, unknown>;
  rows: Record<string, unknown>[];
  details: { id: string; [key: string]: unknown }[];
  /** `file` is a `data:` URL here, where the written page used a relative path. */
  frames: { t: number; file: string; bytes?: number }[];
  packet: string;
  /** True when the host capped what it sent; the lanes are still authoritative on disk. */
  truncated?: boolean;
}

export interface RecordingClient {
  arm(enabled: boolean, url: string): Promise<RecorderHostStatus>;
  status(): Promise<RecorderHostStatus>;
  save(payload: RecordingPayload, extras: SaveExtras): Promise<SavedRecording>;
  readLast(): Promise<SavedRecording | null>;
  readBundle(path?: string): Promise<RecordingBundle | null>;
}

export interface RecordingClientOptions {
  /** Defaults to the global `fetch`. A test or a story passes its own. */
  fetch?: typeof globalThis.fetch;
  /** Defaults to `""` (same origin), matching the donor's absolute `/api/...`. */
  baseUrl?: string;
}

/** Ported verbatim: recorderClient.ts:32-46. */
async function expectJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`the local SystemSketch controller returned non-JSON (${response.status})`);
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : `recording request failed (${response.status})`);
  }
  return payload as T;
}

export function createRecordingClient(options: RecordingClientOptions = {}): RecordingClient {
  // WHY `.call(globalThis, …)` and not a bare `globalThis.fetch(…)`: an
  // unbound `fetch` throws "Illegal invocation" in a browser, and
  // recordingPurity.test.ts asserts this module names no browser global as a
  // CALL — the default is resolved lazily, so importing it in node with no
  // `fetch` at all still works as long as nothing goes over the wire.
  const call: typeof globalThis.fetch =
    options.fetch ?? ((input, init) => globalThis.fetch.call(globalThis, input, init));
  const at = (route: string) => `${options.baseUrl ?? ""}${route}`;

  return {
    // Ported: recorderClient.ts:48-54.
    async arm(enabled, url) {
      return expectJson(
        await call(at("/api/recordings/arm"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, url }),
        }),
      );
    },
    // Ported: recorderClient.ts:56-58.
    async status() {
      return expectJson(await call(at("/api/recordings/status"), { cache: "no-store" }));
    },
    // Ported: recorderClient.ts:60-69.
    async save(payload, extras) {
      return expectJson(
        await call(at("/api/recordings"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, ...extras }),
        }),
      );
    },
    // Ported: recorderClient.ts:71-76.
    async readLast() {
      const payload = await expectJson<{ recording: SavedRecording | null }>(
        await call(at("/api/recordings/last"), { cache: "no-store" }),
      );
      return payload.recording ?? null;
    },
    // New — see `RecordingBundle` above.
    async readBundle(path) {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const payload = await expectJson<{ recording: RecordingBundle | null }>(
        await call(at(`/api/recordings/bundle${query}`), { cache: "no-store" }),
      );
      return payload.recording ?? null;
    },
  };
}
