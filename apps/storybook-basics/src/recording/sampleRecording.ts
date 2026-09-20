// src/recording/sampleRecording.ts — one small, realistic recording bundle.
//
// Story and test fixture only; nothing in the product imports it. Every row
// below is shaped exactly as `FlightRecorder` emits it (flightRecorder.ts:
// `push`/`pushDetailed`), so the viewer is driven by the real timeline
// grammar rather than by data invented to suit it: `t` in ms since the take
// started, one `lane` per fact, and a `detail` id pointing into `details`.
//
// The three frames are 16×10 PNGs generated locally — the viewer only needs
// something that loads, and a `data:` URL is what the host really sends
// (`RecordingBundle`, recordingClient.ts).

import type { RecordingBundle } from "./recordingClient";

const FRAME_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAE0lEQVR42mNQsKoiCTGMahiaGgCfjISBOcIMHAAAAABJRU5ErkJggg==";
const FRAME_B =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAE0lEQVR42mOQqgojCTGMahiaGgDbz5JBGvswYAAAAABJRU5ErkJggg==";
const FRAME_C =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAE0lEQVR42mPo0dEhCTGMahiaGgCmYo6B0NzjIgAAAABJRU5ErkJggg==";

export const SAMPLE_RECORDING_PATH = "/home/tester/SystemSketch/recordings/2026-09-19_18-24-45-take";

export const SAMPLE_RECORDING_BUNDLE: RecordingBundle = {
  path: SAMPLE_RECORDING_PATH,
  header: {
    mode: "take",
    startedAt: "2026-09-19T18:24:45.000Z",
    endedAt: "2026-09-19T18:24:53.400Z",
    durationMs: 8_400,
    windowMs: 60_000,
    note: "the port row would not accept a second cable",
    url: "http://127.0.0.1:4340/",
    viewport: { w: 1440, h: 900 },
    pathAtStart: "select.idle",
    pathAtEnd: "select.editing_shape",
    shapeCount: 12,
    framesSource: "canvas",
    frames: 3,
    channel: "preview",
    build: "dev",
  },
  frames: [
    { t: 0, file: FRAME_A, bytes: 78 },
    { t: 3_200, file: FRAME_B, bytes: 78 },
    { t: 8_400, file: FRAME_C, bytes: 78 },
  ],
  rows: [
    { t: 0, lane: "mark", text: "take started" },
    { t: 320, lane: "dom", event: "pointerdown", on: 'button "Add port"', screen: [612, 388], detail: "ui-hit-000001" },
    { t: 340, lane: "input", name: "pointer_down", type: "pointer", screen: [612, 388], target: "shape" },
    { t: 360, lane: "state", from: "select.idle", to: "select.pointing_shape", trigger: "pointer_down" },
    { t: 1_180, lane: "input", name: "pointer_move", type: "pointer", screen: [700, 402] },
    { t: 1_240, lane: "store", source: "user", ops: [{ op: "update", id: "shape:block1", type: "block", delta: { x: 1 } }], detail: "store-000002" },
    { t: 2_050, lane: "menu", open: ["context-menu"], trigger: "pointer_up" },
    { t: 3_200, lane: "action", name: "connect", summary: "connect port started", level: "info" },
    { t: 4_120, lane: "network", name: "fetch", summary: "POST /api/workspace/file → 200 in 14.2 ms", status: 200, level: "info", detail: "fetch-000003" },
    { t: 5_600, lane: "console", level: "error", args: ["judgeConnection refused: row already bound"], detail: "console-000004" },
    { t: 6_400, lane: "perf", name: "long-task", summary: "main thread blocked for 128.0 ms", level: "warn", durationMs: 128 },
    { t: 7_100, lane: "dom", event: "pointerup", on: "div", screen: [700, 402] },
    { t: 7_400, lane: "state", from: "select.pointing_shape", to: "select.editing_shape", trigger: "pointer_up" },
    { t: 8_400, lane: "mark", text: "stopped" },
  ],
  details: [
    {
      id: "ui-hit-000001",
      t: 320,
      lane: "dom",
      kind: "ui-hit",
      data: {
        event: "pointerdown",
        point: { x: 612, y: 388 },
        target: { tag: "button", label: "Add port", rect: { x: 600, y: 380, w: 96, h: 24 } },
        hitStack: [{ tag: "button", label: "Add port" }, { tag: "div", role: "group" }],
      },
    },
    { id: "store-000002", t: 1_240, lane: "store", kind: "store", data: { source: "user", updated: 1 } },
    {
      id: "fetch-000003",
      t: 4_120,
      lane: "network",
      kind: "fetch",
      data: { method: "POST", url: "/api/workspace/file", status: 200, durationMs: 14.2, requestBytes: 2_310 },
    },
    {
      id: "console-000004",
      t: 5_600,
      lane: "console",
      kind: "console",
      data: { level: "error", arguments: ["judgeConnection refused: row already bound"] },
    },
  ],
  packet: [
    "SystemSketch interaction recording — 2026-09-19T18:24:45.000Z · 8.4 s · an explicit take",
    "channel preview · build dev · http://127.0.0.1:4340/",
    "viewport 1440×900 @1x · state path select.idle → select.editing_shape · 12 shapes at the end",
    "",
    "Note from the person recording:",
    "  the port row would not accept a second cable",
    "",
    "Errors during the window (1):",
    "  +5.60s  judgeConnection refused: row already bound",
    "",
  ].join("\n"),
};
