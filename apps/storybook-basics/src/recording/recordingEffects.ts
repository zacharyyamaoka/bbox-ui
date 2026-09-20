// src/recording/recordingEffects.ts — the browser half, and the only half.
//
// This is where every capability `recordingCore.ts` refuses to own actually
// lives: tldraw's `Editor`, `editor.toImage()`, `navigator.clipboard`,
// `document.execCommand`, `setTimeout`, and the HTTP client. Each one is
// PORTED from the archive's `recorderStore.ts`, with the donor line range on
// the function that carries it:
//
//   createCollector  <- /home/bam/systemsketch/src/recorder/recorderStore.ts:138-146
//   captureFrame     <- recorderStore.ts:188-215  (`canvasFrame`)
//   copyText         <- recorderStore.ts:322-350  (`copyToClipboard`)
//   armHost/save/readLast <- recorderStore.ts:122-136 over recorderClient.ts
//
// WHY the split is drawn HERE and not one function further in either
// direction: everything above this line can be decided with arithmetic and a
// clock, so it belongs in the core where a node test can drive it; everything
// below needs a real canvas, a real clipboard, or a real socket, so it can
// only ever be proved in a browser. `fakeRecordingEffects.ts` is the same
// interface with none of that, which is what makes the 60-second limit
// testable without waiting 60 seconds.

import { Box, type Editor } from "tldraw";

import { canvasFrameScale } from "./frameFallback";
import type { RecordingPayload } from "./flightRecorder";
import { FlightRecorder } from "./flightRecorder";
import { createRecordingClient, type RecordingClient } from "./recordingClient";
import type {
  RecordingBuffer,
  RecordingCollector,
  RecordingEffects,
  RecordingFrame,
  RecordingTimer,
} from "./recordingCore";

/**
 * The core keeps the buffer opaque (recordingCore.ts, `RecordingBuffer`) so
 * it has no tie to tldraw's types. This is the compile-time proof that the
 * looseness is safe: if `RecordingPayload` ever stops fitting — say
 * `header.durationMs` is renamed — this line goes red here, in the one file
 * that already imports both.
 */
const _payloadFitsBuffer = (payload: RecordingPayload): RecordingBuffer => payload;
void _payloadFitsBuffer;

/** `FlightRecorder` already satisfies `RecordingCollector`; proved, not assumed. */
const _recorderIsACollector = (recorder: FlightRecorder): RecordingCollector => recorder;
void _recorderIsACollector;

export interface BrowserRecordingEffectsOptions {
  /** The live canvas. `null` (an embedded host with no editor) disables capture. */
  editor: Editor | null;
  /** Defaults to a client over the global `fetch`, same origin. */
  client?: RecordingClient;
}

/**
 * PORTED VERBATIM: recorderStore.ts:188-215 (`canvasFrame`).
 *
 * The bounded shapes-only fallback frame, when no screencast can see the
 * page. `pixelRatio: 1` is paired with `canvasFrameScale` at this call site —
 * otherwise tldraw's default DPR would silently double each dimension
 * (frameFallback.ts:12-15, the donor's own note).
 */
async function canvasFrame(editor: Editor | null, t: number): Promise<RecordingFrame | null> {
  if (!editor) return null;
  try {
    const ids = [...editor.getCurrentPageShapeIds()];
    if (ids.length === 0) return null;
    const shapeBounds = ids.flatMap((id) => {
      const bounds = editor.getShapePageBounds(id);
      return bounds ? [bounds] : [];
    });
    const bounds = Box.Common(shapeBounds);
    if (!bounds) return null;
    const { blob } = await editor.toImage(ids, {
      format: "png",
      bounds,
      padding: 0,
      scale: canvasFrameScale(bounds.width, bounds.height),
      pixelRatio: 1,
      background: true,
    });
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let index = 0; index < buffer.length; index += 1) binary += String.fromCharCode(buffer[index]);
    return { t, png: btoa(binary) };
  } catch {
    return null;
  }
}

/**
 * PORTED VERBATIM: recorderStore.ts:322-350 (`copyToClipboard`), minus the
 * `emit` calls — reporting the result is the core's job now, putting the text
 * somewhere is this one's.
 *
 * The donor's comment, kept: `execCommand` is the fallback for a document
 * that has lost focus; if both refuse, the row says so and "Copy last
 * recording" is the retry.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function createBrowserRecordingEffects(options: BrowserRecordingEffectsOptions): RecordingEffects {
  const client = options.client ?? createRecordingClient();
  const editor = options.editor;

  return {
    // Ported: recorderStore.ts:141-145. A host with no editor yields no
    // collector, and the core then refuses to start — the donor's own
    // `if (!editorRef …) return` guard, expressed through the seam.
    createCollector(windowMs) {
      if (!editor) return null;
      return new FlightRecorder(editor, { windowMs });
    },

    // Ported: recorderStore.ts:126 — the page's own URL is what the sidecar
    // matches its Chrome targets against.
    armHost(enabled) {
      return client.arm(enabled, typeof location === "undefined" ? "" : location.href);
    },

    save(buffer, extras) {
      return client.save(buffer as unknown as RecordingPayload, extras);
    },

    readLast() {
      return client.readLast();
    },

    captureFrame(t) {
      return canvasFrame(editor, t);
    },

    copyText: copyTextToClipboard,

    now: () => Date.now(),

    startTimer(ms, fire): RecordingTimer {
      const handle = setTimeout(fire, ms);
      return { cancel: () => clearTimeout(handle) };
    },
  };
}
