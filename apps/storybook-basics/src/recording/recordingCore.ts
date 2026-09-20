// src/recording/recordingCore.ts — the recording state machine, PURE.
//
// PORTED from the archive: /home/bam/systemsketch/src/recorder/
// recorderStore.ts:1-404 (read on disk 2026-09-19). Every transition, every
// piece of copy and the ordering of every side effect are the donor's; the
// line references below name where each one came from.
//
// WHY this file exists at all, when the donor did the same job in 404 lines:
// Zach, 2026-09-19 — *"the functions for that should be a seperate pure
// functoin. Its interface is that button and then the pop up that appears. we
// should have flexibility to kinda change the locaiton of the button or even
// what the itnerface looks like in the future."* The donor could not give him
// that. It was a module-level singleton holding a live `Editor`, reading
// `window.localStorage`, calling `navigator.clipboard`, `document.
// execCommand`, `fetch` and `setTimeout` directly, and publishing through a
// React `useSyncExternalStore` — so "change what the interface looks like"
// meant editing the same file that owns the 60-second safety limit, and
// nothing in it could be driven without a browser and a canvas.
//
// So the boundary moved, not the behaviour. THIS file owns:
//   * the state machine (idle | take), and the state every surface renders;
//   * the 60-second limit and its cancel-without-saving rule;
//   * packet assembly order — collect, then frames, then save, then copy.
// It owns NO clock, NO clipboard, NO canvas, NO network and NO DOM. Those
// nine capabilities arrive as `RecordingEffects` (recordingEffects.ts), which
// is what lets recordingCore.test.ts drive a whole take, including the
// one-minute timeout, in node with a fake clock and zero real waiting.
//
// The wall the comment above describes is asserted mechanically by
// recordingPurity.test.ts — this module imports no React, no tldraw and
// touches no global browser object.

/* ---------------------------------------------------------------------- */
/* The buffer, kept engine-agnostic                                        */
/* ---------------------------------------------------------------------- */

/**
 * What a collector hands over. Structurally `RecordingPayload`
 * (flightRecorder.ts:114-121), restated here WITHOUT importing it.
 *
 * WHY restate it: `RecordingPayload` names `TLStoreSnapshot`, so importing it
 * would give this module a compile-time tie to tldraw even though `import
 * type` erases at runtime. The core only ever reads `header.durationMs` off
 * the buffer; everything else it forwards untouched. `recordingEffects.ts`
 * holds a `satisfies`-style check that the real payload still fits this
 * shape, so the looseness cannot silently drift.
 */
export interface RecordingBufferHeader {
  durationMs: number;
}

export interface RecordingBuffer {
  header: RecordingBufferHeader;
}

/** Ported: recorderClient.ts:12 / :19-30, restated engine-free. */
export type RecordingFramesSource = "screencast" | "canvas" | "none";

export interface RecordingHostStatus {
  screencast: boolean;
  reason: string;
}

export interface SavedRecordingInfo {
  path: string;
  packet: string;
  savedAt: string;
  frames: number;
  framesSource: RecordingFramesSource;
}

export interface RecordingFrame {
  t: number;
  png: string;
}

/** Ported: recorderStore.ts:33-37 — what a saved packet is stamped with. */
export interface RecordingChannelInfo {
  channel: string;
  build: string;
  version: string;
}

/* ---------------------------------------------------------------------- */
/* The collector seam                                                      */
/* ---------------------------------------------------------------------- */

/**
 * The in-page aggregator, seen from the state machine: exactly the six
 * members `recorderStore.ts` used on a `FlightRecorder`
 * (flightRecorder.ts:339-885). `FlightRecorder` satisfies this as written.
 */
export interface RecordingCollector {
  readonly running: boolean;
  readonly isTaking: boolean;
  start(): void;
  stop(): void;
  beginTake(): void;
  mark(text: string): void;
  collect(mode: "last" | "take", note?: string): RecordingBuffer;
}

/** A cancellable one-shot timer. The core never sees `setTimeout`. */
export interface RecordingTimer {
  cancel(): void;
}

/* ---------------------------------------------------------------------- */
/* The injected capabilities                                               */
/* ---------------------------------------------------------------------- */

/**
 * Everything the recorder needs from the world outside arithmetic, in one
 * object. `recordingEffects.ts` holds the browser implementation and
 * `fakeRecordingEffects.ts` a deterministic one.
 *
 * WHY an interface and not nine constructor arguments: a host swapping ONE
 * capability (a Storybook story wanting real timers but a scripted host, a
 * VS Code webview with no `navigator.clipboard`) spreads an object; it does
 * not re-thread an argument list through every call site.
 */
export interface RecordingEffects {
  /**
   * Build a collector over whatever canvas is attached, or null when none is
   * — the donor's `startRecorder` guarded on `editorRef` the same way
   * (recorderStore.ts:141-146).
   */
  createCollector(windowMs: number): RecordingCollector | null;
  /** Ported: recorderStore.ts:122-136 (`syncHost`) — arm/disarm the frame sidecar. */
  armHost(enabled: boolean): Promise<RecordingHostStatus>;
  /** Ported: recorderClient.ts:60-69 — hand the buffer to the host. */
  save(
    buffer: RecordingBuffer,
    extras: RecordingChannelInfo & { canvasFrames: RecordingFrame[] },
  ): Promise<SavedRecordingInfo>;
  /** Ported: recorderClient.ts:71-76. */
  readLast(): Promise<SavedRecordingInfo | null>;
  /**
   * Ported: recorderStore.ts:189-215 (`canvasFrame`) — the bounded
   * shapes-only fallback frame, when no screencast can see the page. null
   * when there is nothing to draw or the export failed.
   */
  captureFrame(t: number): Promise<RecordingFrame | null>;
  /** Ported: recorderStore.ts:322-350 — true only if the text really landed. */
  copyText(text: string): Promise<boolean>;
  /** The wall clock. Donor: `Date.now()` at recorderStore.ts:167. */
  now(): number;
  /** Donor: `setTimeout(cancelTake, EXPLICIT_RECORDING_LIMIT_MS)` at :186. */
  startTimer(ms: number, fire: () => void): RecordingTimer;
}

/* ---------------------------------------------------------------------- */
/* The state a surface renders                                             */
/* ---------------------------------------------------------------------- */

/** Ported verbatim: recorderStore.ts:39-58 (`RecorderUiState`). */
export interface RecordingState {
  /** The recorder exists on this page at all (never in an embedded host). */
  installed: boolean;
  enabled: boolean;
  windowMs: number;
  mode: "idle" | "take";
  takeStartedAt: number | null;
  saving: boolean;
  last: SavedRecordingInfo | null;
  error: string | null;
  notice: string | null;
  clipboard: "copied" | "failed" | null;
  framesSource: RecordingFramesSource | "unknown";
  framesReason: string;
}

/**
 * Ported verbatim: recorderStore.ts:31.
 *
 * WHY sixty seconds and why it CANCELS rather than saves — the donor's own
 * rule, kept (recorderStore.ts:20-25, :265): "A forgotten recording is
 * discarded rather than silently saved as evidence." Stop is the only thing
 * that writes a folder.
 */
export const EXPLICIT_RECORDING_LIMIT_MS = 60_000;

/** Ported verbatim: recorderStore.ts:277 — the copy shown after an auto-cancel. */
export const RECORDING_CANCELLED_NOTICE = "Cancelled at the 1 min safety limit · nothing saved";

/** Ported verbatim: recorderStore.ts:299 / :313. */
export const RECORDER_OFF_ERROR = "The recorder is off. Turn it on to record.";
export const NOTHING_SAVED_ERROR = "No recording has been saved yet.";

/** Ported verbatim: recorderStore.ts:60-73 (`INITIAL`). */
export const INITIAL_RECORDING_STATE: RecordingState = {
  installed: false,
  enabled: false,
  windowMs: EXPLICIT_RECORDING_LIMIT_MS,
  mode: "idle",
  takeStartedAt: null,
  saving: false,
  last: null,
  error: null,
  notice: null,
  clipboard: null,
  framesSource: "unknown",
  framesReason: "",
};

/* ---------------------------------------------------------------------- */
/* The machine                                                             */
/* ---------------------------------------------------------------------- */

export interface RecordingCore {
  getState(): RecordingState;
  subscribe(listener: () => void): () => void;
  /** Ported: recorderStore.ts:154-176 (`installFlightRecorder`). Returns the disposer. */
  install(): () => void;
  setChannel(info: Partial<RecordingChannelInfo>): void;
  /** Ported: recorderStore.ts:218-244 (`startTake`). */
  start(): Promise<void>;
  /** Ported: recorderStore.ts:246-249 (`stopTake`). Stop saves AND copies. */
  stop(note?: string): Promise<SavedRecordingInfo | null>;
  /** Ported: recorderStore.ts:252-270 (`cancelTake`). */
  cancel(): void;
  /** Ported: recorderStore.ts:305-320 (`copyLastRecording`). */
  copyLast(): Promise<boolean>;
  /** Ported: recorderStore.ts:352-354 (`addRecorderMark`). */
  mark(text: string): void;
}

export function createRecordingCore(effects: RecordingEffects): RecordingCore {
  let state: RecordingState = INITIAL_RECORDING_STATE;
  let collector: RecordingCollector | null = null;
  let channelInfo: RecordingChannelInfo = { channel: "unknown", build: "unknown", version: "" };
  let takeTimer: RecordingTimer | null = null;
  let takeStartFrame: RecordingFrame | null = null;
  let takeStartFramePromise: Promise<RecordingFrame | null> | null = null;
  let takeHostStatus: Promise<RecordingHostStatus> | null = null;
  let hostSyncGeneration = 0;
  const listeners = new Set<() => void>();

  // Ported verbatim: recorderStore.ts:83-86.
  function emit(next: Partial<RecordingState>): void {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }

  // Ported verbatim: recorderStore.ts:122-136. The generation counter is the
  // donor's: a stale arm/disarm reply must not overwrite a newer one.
  async function syncHost(enabled: boolean): Promise<RecordingHostStatus> {
    const generation = ++hostSyncGeneration;
    try {
      const status = await effects.armHost(enabled);
      if (generation === hostSyncGeneration) {
        emit({ framesSource: status.screencast ? "screencast" : "canvas", framesReason: status.reason });
      }
      return status;
    } catch (cause) {
      const fallback = { screencast: false, reason: cause instanceof Error ? cause.message : String(cause) };
      if (generation === hostSyncGeneration) emit({ framesSource: "canvas", framesReason: fallback.reason });
      return fallback;
    }
  }

  // Ported: recorderStore.ts:138-146.
  function startCollector(windowMs = state.windowMs): void {
    if (collector?.running) return;
    collector?.stop();
    collector = effects.createCollector(windowMs);
    collector?.start();
  }

  // Ported: recorderStore.ts:148-157.
  function stopCollector(): void {
    clearTakeTimer();
    collector?.stop();
    collector = null;
    takeHostStatus = null;
    takeStartFramePromise = null;
    takeStartFrame = null;
    emit({ mode: "idle", takeStartedAt: null });
  }

  function clearTakeTimer(): void {
    takeTimer?.cancel();
    takeTimer = null;
  }

  // Ported verbatim: recorderStore.ts:252-270.
  function cancel(): void {
    if (state.mode !== "take") return;
    clearTakeTimer();
    takeStartFrame = null;
    takeStartFramePromise = null;
    takeHostStatus = null;
    collector?.stop();
    collector = null;
    void syncHost(false);
    emit({
      mode: "idle",
      takeStartedAt: null,
      saving: false,
      error: null,
      clipboard: null,
      notice: RECORDING_CANCELLED_NOTICE,
    });
  }

  /**
   * Ported verbatim: recorderStore.ts:322-350 (`copyToClipboard`).
   *
   * WHY the result is reported rather than assumed — the donor's own comment,
   * kept: "A failed clipboard write is reported as a failure, never as
   * success — the copy-for-claude template learned that the hard way." The
   * two-step fallback (async clipboard, then a hidden textarea) lives in
   * `effects.copyText`; the honesty rule lives here.
   */
  async function copyToClipboard(text: string): Promise<boolean> {
    const copied = await effects.copyText(text);
    emit({ clipboard: copied ? "copied" : "failed" });
    return copied;
  }

  // Ported verbatim: recorderStore.ts:288-303 + :279-283 (`saveNow`).
  async function saveNow(mode: "last" | "take", note: string): Promise<SavedRecordingInfo | null> {
    if (!collector?.running) {
      emit({ error: RECORDER_OFF_ERROR });
      return null;
    }
    if (state.saving) return null;
    clearTakeTimer();
    emit({ saving: true, error: null, notice: null, clipboard: null });
    try {
      const buffer = collector.collect(mode, note);
      const hostStatus = mode === "take" && takeHostStatus ? await takeHostStatus : null;
      const needsCanvasFallback = hostStatus?.screencast !== true;
      const canvasFrames: RecordingFrame[] = [];
      if (needsCanvasFallback) {
        if (mode === "take" && takeStartFramePromise) await takeStartFramePromise;
        if (mode === "take" && takeStartFrame) canvasFrames.push(takeStartFrame);
        const end = await effects.captureFrame(Number(buffer.header.durationMs) || 0);
        if (end) canvasFrames.push(end);
      }
      takeStartFrame = null;
      const saved = await effects.save(buffer, { ...channelInfo, canvasFrames });
      stopCollector();
      void syncHost(false);
      emit({ last: saved, mode: "idle", takeStartedAt: null, saving: false });
      // Stop saves AND copies — the one thing the popover's policy line
      // promises (recorderStore.ts:336).
      await copyToClipboard(saved.packet);
      return saved;
    } catch (cause) {
      takeStartFrame = null;
      stopCollector();
      void syncHost(false);
      emit({
        saving: false,
        mode: "idle",
        takeStartedAt: null,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return null;
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Ported: recorderStore.ts:154-176. The donor's retrospective ("last N
    // seconds") path stays parked exactly as it left it: nothing listens
    // until Start is pressed, so `syncHost(false)` on install is right.
    install() {
      emit({
        installed: true,
        enabled: true,
        windowMs: EXPLICIT_RECORDING_LIMIT_MS,
        error: null,
        notice: null,
      });
      void syncHost(false);
      void effects
        .readLast()
        .then((last) => {
          if (last) emit({ last });
        })
        .catch(() => undefined);
      return () => {
        stopCollector();
        void syncHost(false);
        emit({ installed: false });
      };
    },

    // Ported: recorderStore.ts:178-180.
    setChannel(info) {
      channelInfo = { ...channelInfo, ...info };
    },

    // Ported verbatim: recorderStore.ts:218-244.
    async start() {
      if (state.mode === "take") return;
      startCollector(EXPLICIT_RECORDING_LIMIT_MS);
      if (!collector?.running) return;
      collector.beginTake();
      takeStartFrame = null;
      takeStartFramePromise = null;
      emit({
        mode: "take",
        takeStartedAt: effects.now(),
        windowMs: EXPLICIT_RECORDING_LIMIT_MS,
        error: null,
        notice: null,
        clipboard: null,
      });
      takeHostStatus = syncHost(true);
      // WHY the fallback frame waits on the host's answer instead of firing
      // immediately — the donor's comment, kept (recorderStore.ts:231-232):
      // "Do not compete with an available screencast. The canvas path mounts
      // an export tree and rasterises every page shape, so it is
      // fallback-only."
      void takeHostStatus.then((status) => {
        if (status.screencast || state.mode !== "take" || !collector?.isTaking) return;
        takeStartFramePromise = effects.captureFrame(0);
        void takeStartFramePromise.then((frame) => {
          if (state.mode === "take" && collector?.isTaking) takeStartFrame = frame;
        });
      });
      clearTakeTimer();
      takeTimer = effects.startTimer(EXPLICIT_RECORDING_LIMIT_MS, cancel);
    },

    // Ported verbatim: recorderStore.ts:246-249.
    async stop(note = "") {
      if (state.mode !== "take") return null;
      return saveNow("take", note);
    },

    cancel,

    // Ported verbatim: recorderStore.ts:305-320.
    async copyLast() {
      let last = state.last;
      if (!last) {
        try {
          last = await effects.readLast();
          if (last) emit({ last });
        } catch (cause) {
          emit({ error: cause instanceof Error ? cause.message : String(cause) });
          return false;
        }
      }
      if (!last) {
        emit({ error: NOTHING_SAVED_ERROR });
        return false;
      }
      return copyToClipboard(last.packet);
    },

    // Ported verbatim: recorderStore.ts:352-354.
    mark(text) {
      collector?.mark(text);
    },
  };
}
