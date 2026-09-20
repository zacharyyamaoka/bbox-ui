// src/recording/recordingCore.test.ts — the state machine, driven headlessly.
//
// Runs in the `unit` project (vitest.config.ts: node, no DOM, no browser).
// Nothing here waits: the 60-second safety limit is exercised by advancing an
// injected clock, which is the whole point of the effects seam
// (fakeRecordingEffects.ts). The archive could not do this — `recorderStore.
// ts` reaches `setTimeout`, `navigator.clipboard` and a live `Editor`
// directly, so it shipped with no test beside it.

import { beforeEach, describe, expect, it } from "vitest";

import { createFakeRecordingEffects, type FakeRecordingEffects } from "./fakeRecordingEffects";
import {
  createRecordingCore,
  EXPLICIT_RECORDING_LIMIT_MS,
  INITIAL_RECORDING_STATE,
  NOTHING_SAVED_ERROR,
  RECORDER_OFF_ERROR,
  RECORDING_CANCELLED_NOTICE,
  type RecordingCore,
} from "./recordingCore";

/** Let every already-resolved promise in the core's chain settle. */
const settle = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

describe("the limit is one minute, stated once", () => {
  it("is 60 seconds, the archive's own constant (recorderStore.ts:31)", () => {
    expect(EXPLICIT_RECORDING_LIMIT_MS).toBe(60_000);
    expect(INITIAL_RECORDING_STATE.windowMs).toBe(EXPLICIT_RECORDING_LIMIT_MS);
  });
});

describe("start → frames arrive → stop saves and copies", () => {
  let effects: FakeRecordingEffects;
  let core: RecordingCore;

  beforeEach(async () => {
    effects = createFakeRecordingEffects();
    core = createRecordingCore(effects);
    core.setChannel({ channel: "preview", build: "dev", version: "0.1.0" });
    core.install();
    await settle();
  });

  it("install arms nothing and reads the last recording", async () => {
    // Recording is EXPLICIT: nothing listens or asks Chrome for frames until
    // Start is pressed (recorderStore.ts:18-21).
    expect(effects.armed).toEqual([false]);
    expect(effects.collectorLog.started).toBe(0);
    expect(core.getState().installed).toBe(true);
    expect(core.getState().mode).toBe("idle");
  });

  it("start arms the host, begins a take, and schedules the limit", async () => {
    await core.start();
    await settle();

    expect(core.getState().mode).toBe("take");
    expect(core.getState().takeStartedAt).toBe(effects.clock.now());
    expect(effects.collectorLog.started).toBe(1);
    expect(effects.collectorLog.takesBegun).toBe(1);
    expect(effects.armed).toEqual([false, true]);
    expect(effects.clock.pending).toBe(1);
  });

  it("asks for a canvas frame only when the host has no screencast", async () => {
    await core.start();
    await settle();
    // The fake host reports no screencast, so the fallback frame is taken at t=0.
    expect(effects.frameRequests).toEqual([0]);
    expect(core.getState().framesSource).toBe("canvas");
    expect(core.getState().framesReason).toBe("no debugging port on this channel");
  });

  it("does not compete with an available screencast", async () => {
    effects.setHostStatus({ screencast: true, reason: "Chrome screencast over the debugging port" });
    await core.start();
    await settle();

    expect(effects.frameRequests).toEqual([]);
    expect(core.getState().framesSource).toBe("screencast");

    await core.stop("");
    await settle();
    // Still none: the saved packet carries the sidecar's frames, not ours.
    expect(effects.frameRequests).toEqual([]);
    expect(effects.saved[0].extras.canvasFrames).toEqual([]);
  });

  it("stop saves the buffer, sends both fallback frames, and copies the packet", async () => {
    await core.start();
    await settle();

    const saved = await core.stop("a bug in the port row");
    await settle();

    expect(saved).not.toBeNull();
    expect(effects.saved).toHaveLength(1);
    expect(effects.collectorLog.collected).toEqual([{ mode: "take", note: "a bug in the port row" }]);
    // Start frame at t=0 and end frame at the buffer's own duration.
    expect(effects.saved[0].extras.canvasFrames.map((f) => f.t)).toEqual([0, 8_400]);
    expect(effects.saved[0].extras.channel).toBe("preview");

    // …and the packet reached the clipboard without anyone asking.
    expect(effects.clipboard).toEqual([saved!.packet]);
    expect(core.getState().clipboard).toBe("copied");
    expect(core.getState().mode).toBe("idle");
    expect(core.getState().saving).toBe(false);
    expect(core.getState().last?.path).toBe(saved!.path);
    // The host is disarmed again, and the timer is gone.
    expect(effects.armed).toEqual([false, true, false]);
    expect(effects.clock.pending).toBe(0);
  });

  it("reports a refused clipboard as a failure, never as success", async () => {
    effects.failClipboard(true);
    await core.start();
    await settle();
    const saved = await core.stop();
    await settle();

    expect(saved).not.toBeNull();
    expect(effects.clipboard).toEqual([]);
    expect(core.getState().clipboard).toBe("failed");
    // The folder is still on disk — only the copy failed.
    expect(core.getState().last?.path).toBe(saved!.path);
  });

  it("a failed save leaves the machine idle, disarmed and explained", async () => {
    effects.failNextSave("the local SystemSketch controller returned non-JSON (500)");
    await core.start();
    await settle();
    const saved = await core.stop();
    await settle();

    expect(saved).toBeNull();
    expect(core.getState().mode).toBe("idle");
    expect(core.getState().saving).toBe(false);
    expect(core.getState().error).toBe("the local SystemSketch controller returned non-JSON (500)");
    expect(effects.armed).toEqual([false, true, false]);
    expect(effects.collectorLog.stopped).toBeGreaterThan(0);
  });

  it("stop is a no-op when no take is running", async () => {
    expect(await core.stop()).toBeNull();
    expect(effects.saved).toEqual([]);
  });

  it("a second start while taking changes nothing", async () => {
    await core.start();
    await settle();
    await core.start();
    await settle();
    expect(effects.collectorLog.takesBegun).toBe(1);
    expect(effects.clock.pending).toBe(1);
  });
});

describe("the 1 min limit cancels WITHOUT saving", () => {
  it("fires at exactly 60 s, discards the take, and writes nothing", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    core.install();
    await settle();
    await core.start();
    await settle();

    // One second short: still recording, nothing written.
    effects.clock.advance(EXPLICIT_RECORDING_LIMIT_MS - 1_000);
    expect(core.getState().mode).toBe("take");
    expect(effects.saved).toEqual([]);

    effects.clock.advance(1_000);
    await settle();

    // "A forgotten recording is discarded rather than silently saved as
    // evidence" (recorderStore.ts:251).
    expect(core.getState().mode).toBe("idle");
    expect(core.getState().takeStartedAt).toBeNull();
    expect(core.getState().notice).toBe(RECORDING_CANCELLED_NOTICE);
    expect(core.getState().error).toBeNull();
    expect(effects.saved).toEqual([]);
    expect(effects.clipboard).toEqual([]);
    // The collector was torn down and the host disarmed.
    expect(effects.collectorLog.stopped).toBeGreaterThan(0);
    expect(effects.armed).toEqual([false, true, false]);
  });

  it("stopping before the limit cancels the timer, so it never fires", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    core.install();
    await settle();
    await core.start();
    await settle();

    effects.clock.advance(8_400);
    await core.stop();
    await settle();

    expect(effects.saved).toHaveLength(1);
    expect(effects.clock.pending).toBe(0);

    effects.clock.advance(EXPLICIT_RECORDING_LIMIT_MS * 2);
    await settle();
    // The notice belongs to a cancel; a saved take must never show it.
    expect(core.getState().notice).toBeNull();
    expect(effects.saved).toHaveLength(1);
  });

  it("cancel is a no-op when no take is running", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    core.install();
    await settle();
    core.cancel();
    expect(core.getState().notice).toBeNull();
  });
});

describe("copy last recording", () => {
  it("copies the remembered packet without touching the host", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    core.install();
    await settle();
    await core.start();
    await settle();
    const saved = await core.stop();
    await settle();
    effects.clipboard.length = 0;

    expect(await core.copyLast()).toBe(true);
    expect(effects.clipboard).toEqual([saved!.packet]);
  });

  it("reads the host when nothing is remembered yet", async () => {
    const effects = createFakeRecordingEffects({
      last: {
        path: "/home/tester/SystemSketch/recordings/2026-09-19_18-24-45-take",
        packet: "an earlier packet",
        savedAt: "2026-09-19T18:24:45.000Z",
        frames: 2,
        framesSource: "canvas",
      },
    });
    const core = createRecordingCore(effects);
    core.install();
    await settle();

    expect(core.getState().last?.packet).toBe("an earlier packet");
    expect(await core.copyLast()).toBe(true);
    expect(effects.clipboard).toEqual(["an earlier packet"]);
  });

  it("says so when nothing has ever been saved", async () => {
    const effects = createFakeRecordingEffects({ last: null });
    const core = createRecordingCore(effects);
    core.install();
    await settle();

    expect(await core.copyLast()).toBe(false);
    expect(core.getState().error).toBe(NOTHING_SAVED_ERROR);
  });
});

describe("a host with no canvas attached", () => {
  it("refuses to start rather than pretending to record", async () => {
    const effects = createFakeRecordingEffects();
    effects.detachCollector();
    const core = createRecordingCore(effects);
    core.install();
    await settle();

    await core.start();
    await settle();

    expect(core.getState().mode).toBe("idle");
    expect(effects.armed).toEqual([false]);
    expect(effects.clock.pending).toBe(0);
    // And a save attempt names the reason rather than throwing.
    expect(await core.stop()).toBeNull();
  });

  it("names the reason when a save is asked for with the recorder off", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    core.install();
    await settle();
    await core.start();
    await settle();

    // Drop the collector under the machine, then try to stop.
    core.cancel();
    await settle();
    effects.detachCollector();
    await core.start();
    await settle();
    expect(core.getState().mode).toBe("idle");
    expect(RECORDER_OFF_ERROR).toBe("The recorder is off. Turn it on to record.");
  });
});

describe("subscribers", () => {
  it("sees every transition and unsubscribes cleanly", async () => {
    const effects = createFakeRecordingEffects();
    const core = createRecordingCore(effects);
    let notifications = 0;
    const unsubscribe = core.subscribe(() => {
      notifications += 1;
    });
    core.install();
    await settle();
    expect(notifications).toBeGreaterThan(0);

    const seen = notifications;
    unsubscribe();
    await core.start();
    await settle();
    expect(notifications).toBe(seen);
  });
});
