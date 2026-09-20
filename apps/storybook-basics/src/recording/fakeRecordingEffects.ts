// src/recording/fakeRecordingEffects.ts — the same nine capabilities, with
// none of the world behind them.
//
// This is test support, and it is also the whole argument for the split. The
// archive could not prove its own hardest rule — "the 1 min limit cancels
// without saving" — without a browser, a canvas, a local host and sixty real
// seconds, so it never did: `recorderStore.ts` has no test file beside it.
// Here the same rule is one `clock.advance(60_000)` in node
// (recordingCore.test.ts).
//
// It is NOT a mock framework and deliberately records everything: what was
// armed, what was saved, what reached the clipboard. A story asserts against
// those arrays; so does a unit test.

import type {
  RecordingBuffer,
  RecordingChannelInfo,
  RecordingCollector,
  RecordingEffects,
  RecordingFrame,
  RecordingHostStatus,
  RecordingTimer,
  SavedRecordingInfo,
} from "./recordingCore";

/** A manually advanced clock. Nothing here ever calls `setTimeout`. */
export interface FakeClock {
  now(): number;
  /** Move time forward, firing every timer whose deadline it passes, in order. */
  advance(ms: number): void;
  readonly pending: number;
}

export interface FakeCollectorLog {
  started: number;
  stopped: number;
  takesBegun: number;
  marks: string[];
  collected: { mode: "last" | "take"; note: string }[];
}

export interface FakeRecordingEffects extends RecordingEffects {
  clock: FakeClock;
  /** Every `armHost` call, in order — `true` arms the frame sidecar. */
  armed: boolean[];
  /** Every buffer that reached the host, with the frames that rode along. */
  saved: { buffer: RecordingBuffer; extras: RecordingChannelInfo & { canvasFrames: RecordingFrame[] } }[];
  /** Every string that reached the clipboard (only the successful writes). */
  clipboard: string[];
  /** Every `captureFrame(t)` the core asked for, whether or not one came back. */
  frameRequests: number[];
  collectorLog: FakeCollectorLog;
  /** The last recording the host would report; assignable mid-test. */
  last: SavedRecordingInfo | null;
  /** Swap the host's answer to `armHost` — the screencast/canvas fork. */
  setHostStatus(status: RecordingHostStatus): void;
  /** Make the next `captureFrame` return this, or null for "nothing to draw". */
  setFrame(frame: RecordingFrame | null): void;
  /** Make the next `save` reject — the packet-never-written path. */
  failNextSave(message: string): void;
  /** Make every clipboard write fail — the "Clipboard write failed" row. */
  failClipboard(failing: boolean): void;
  /** Drop the collector, as a host with no editor attached would. */
  detachCollector(): void;
}

export interface FakeRecordingEffectsOptions {
  /**
   * Wall-clock origin, defaulting to the real `Date.now()`.
   *
   * WHY it must track real time by default, found by LOOKING at a capture:
   * the core's clock is injected but `useRecordingElapsed`
   * (src/recording/useRecording.ts) is a display hook reading the real one,
   * because that is the clock the person watching the button lives on. With
   * a fixed 2026-09-19 origin the running label rendered
   * `REC · 27166.1 / 1 min` — the gap between the fixture and now. Pass a
   * fixed value only when the test itself reads `savedAt`.
   */
  startedAt?: number;
  host?: RecordingHostStatus;
  last?: SavedRecordingInfo | null;
  /** What a collected buffer reports as its duration. */
  durationMs?: number;
}

function createFakeClock(startedAt: number): FakeClock & { schedule(ms: number, fire: () => void): RecordingTimer } {
  let current = startedAt;
  let sequence = 0;
  const timers = new Map<number, { at: number; fire: () => void }>();
  return {
    now: () => current,
    get pending() {
      return timers.size;
    },
    advance(ms: number) {
      const target = current + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        current = timer.at;
        timer.fire();
      }
      current = target;
    },
    schedule(ms: number, fire: () => void): RecordingTimer {
      const id = ++sequence;
      timers.set(id, { at: current + ms, fire });
      return {
        cancel: () => {
          timers.delete(id);
        },
      };
    },
  };
}

/**
 * A collector with the six members the core uses (recordingCore.ts,
 * `RecordingCollector`) and none of tldraw behind them. The buffer it hands
 * back is the smallest thing shaped like `RecordingPayload`
 * (flightRecorder.ts:114-121) — the core only reads `header.durationMs`, and
 * the host is the thing that validates the rest.
 */
function createFakeCollector(log: FakeCollectorLog, durationMs: number): RecordingCollector {
  let running = false;
  let taking = false;
  return {
    get running() {
      return running;
    },
    get isTaking() {
      return taking;
    },
    start() {
      running = true;
      log.started += 1;
    },
    stop() {
      running = false;
      taking = false;
      log.stopped += 1;
    },
    beginTake() {
      taking = true;
      log.takesBegun += 1;
    },
    mark(text) {
      log.marks.push(text);
    },
    collect(mode, note = "") {
      log.collected.push({ mode, note });
      // WHY a named local and not a literal in the return position: the extra
      // keys ARE the point (the host validates `rows`/`storeDiffs`), and a
      // fresh literal returned against `RecordingBuffer` would trip TypeScript's
      // excess-property check on exactly the fields that make it realistic.
      const buffer = {
        header: { durationMs, mode, note },
        rows: [{ t: 0, lane: "mark", text: "take started" }],
        details: [] as unknown[],
        storeDiffs: [] as unknown[],
        startSnapshot: {},
        endSnapshot: {},
      };
      return buffer;
    },
  };
}

export function createFakeRecordingEffects(options: FakeRecordingEffectsOptions = {}): FakeRecordingEffects {
  const clock = createFakeClock(options.startedAt ?? Date.now());
  const collectorLog: FakeCollectorLog = { started: 0, stopped: 0, takesBegun: 0, marks: [], collected: [] };
  const durationMs = options.durationMs ?? 8_400;

  let collector: RecordingCollector | null = createFakeCollector(collectorLog, durationMs);
  let host: RecordingHostStatus = options.host ?? { screencast: false, reason: "no debugging port on this channel" };
  let frame: RecordingFrame | null = { t: 0, png: "iVBORw0KGgo=" };
  let saveFailure: string | null = null;
  let clipboardFails = false;
  let savedCount = 0;

  const effects: FakeRecordingEffects = {
    clock,
    armed: [],
    saved: [],
    clipboard: [],
    frameRequests: [],
    collectorLog,
    last: options.last ?? null,

    setHostStatus(next) {
      host = next;
    },
    setFrame(next) {
      frame = next;
    },
    failNextSave(message) {
      saveFailure = message;
    },
    failClipboard(failing) {
      clipboardFails = failing;
    },
    detachCollector() {
      collector = null;
    },

    createCollector() {
      if (!collector) return null;
      return collector;
    },

    async armHost(enabled) {
      effects.armed.push(enabled);
      return host;
    },

    async save(buffer, extras) {
      if (saveFailure) {
        const message = saveFailure;
        saveFailure = null;
        throw new Error(message);
      }
      effects.saved.push({ buffer, extras });
      savedCount += 1;
      const saved: SavedRecordingInfo = {
        path: `/home/tester/SystemSketch/recordings/2026-09-19_18-24-45-take${savedCount > 1 ? `-${savedCount}` : ""}`,
        packet: `SystemSketch interaction recording — take ${savedCount}\n`,
        savedAt: new Date(clock.now()).toISOString(),
        frames: extras.canvasFrames.length,
        framesSource: extras.canvasFrames.length ? "canvas" : "none",
      };
      effects.last = saved;
      return saved;
    },

    async readLast() {
      return effects.last;
    },

    async captureFrame(t) {
      effects.frameRequests.push(t);
      return frame === null ? null : { ...frame, t };
    },

    async copyText(text) {
      if (clipboardFails) return false;
      effects.clipboard.push(text);
      return true;
    },

    now: () => clock.now(),

    startTimer: (ms, fire) => clock.schedule(ms, fire),
  };

  return effects;
}
