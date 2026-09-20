// src/recording/useRecording.ts — the entire React binding, and nothing else.
//
// PORTED from the archive: /home/bam/systemsketch/src/recorder/
// recorderStore.ts:95-97 (`useRecorderState`). The donor's hook read a
// module-level singleton; this one reads whichever core it is handed, which
// is what lets a story mount two independent recorders side by side and a
// test mount none at all.
//
// WHY it is its OWN file, twelve lines long, rather than a named export off
// the core or off the control: it is the seam where React enters, and
// `recordingPurity.test.ts` asserts a list of modules that must never import
// it. Folding it into `recordingCore.ts` would make the core unimportable
// from node; folding it into `recordingControl.tsx` would give the control a
// subscription to own, and Zach asked for a control that owns nothing
// (2026-09-19: "we should have flexibility to kinda change the locaiton of
// the button or even what the itnerface looks like in the future").

import { useEffect, useState, useSyncExternalStore } from "react";

import { INITIAL_RECORDING_STATE, type RecordingCore, type RecordingState } from "./recordingCore";

export function useRecordingState(core: RecordingCore): RecordingState {
  return useSyncExternalStore(core.subscribe, core.getState, () => INITIAL_RECORDING_STATE);
}

/**
 * Milliseconds since the take started, ticking five times a second.
 *
 * PORTED VERBATIM: /home/bam/systemsketch/src/recorder/RecorderControls.tsx:
 * 24-33 (`useElapsed`) — including the 200 ms period, which is what makes the
 * donor's one-decimal clock (`REC · 3.4 / 1 min`) move smoothly without a
 * frame loop.
 *
 * WHY it lives here and not inside `recordingControl.tsx`, where the donor
 * had it: a control that owns a running interval is a control a host cannot
 * freely relocate or replace, which is the one thing Zach asked for. The
 * control takes `elapsedMs` as a prop; this is the five lines that produce it.
 */
export function useRecordingElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, now - since);
}
