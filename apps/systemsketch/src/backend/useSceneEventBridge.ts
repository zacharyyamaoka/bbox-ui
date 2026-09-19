// src/backend/useSceneEventBridge.ts — the seam Zach described: "system
// sketch should kinda like emit UI edit events, that I guess normally have
// no consumer, but now pyblocks could consume it."
//
// The seam is created once per app instance and is ALWAYS present. This file
// is what fills it: at rest, it diffs the scene the document projects to and
// publishes one `SceneEventBatch` per gesture. With zero subscribers a
// publish is a no-op, so a whiteboard with no backend pays a scene diff per
// settled edit and nothing else.
//
// WHY the events are derived from the PROJECTED SCENE rather than from
// tldraw's `RecordsDiff`, even though this app's document IS the tldraw store
// (`docs/SYSTEMSKETCH-REBUILD-PLAN.md` §1.1-B, and `src/document/editEvents.ts`
// already translates the store diff into this app's OWN event vocabulary):
// the contract the pyblocks side is built against is
// `@trunk/scene/sceneEvents.ts`'s union, whose vocabulary is scene facts
// (`node-renamed`, `ports-reordered`, `wire-rewired`) and whose classifier
// lives in pyblocks keyed on exactly those names. `deriveSceneEvents` takes
// two `HostScene`s, so the projection has to happen first — which is the
// case `sceneEvents.ts`'s own header anticipates ("If the rebuilt app ever
// makes tldraw's store the document instead of the scene, it projects
// store → scene first and calls the same function"). `sceneFromRecords` is
// that projection, already written, already the app's read side; importing
// it is the whole of what this file adds. A second translation from
// `EditEvent` to `SceneEvent` would be a lossy hop through a third
// vocabulary.
//
// WHY at REST and not per store transaction: a drag is one gesture and
// dozens of transactions. Publishing per transaction would hand a consumer
// forty `node-moved` events for one drag and make "exactly one batch per
// gesture" (§6 L3 assertion 4) impossible. The quiet period below, plus the
// host's own "am I mid-gesture" answer, is what turns a stream of writes
// back into the gesture that caused them — the same at-rest posture every
// trunk host takes at its `onSceneChange` seam (`tldrawHost.tsx:523-528`,
// `onTranslateEnd`/`onResizeEnd` at :357-393).
import { useEffect, useMemo, useRef } from "react";
import { useEditor, type Editor } from "tldraw";

import type { HostScene } from "@trunk/hosts/hostScene";
import { deriveSceneEvents, type SceneEventBatch, type SceneEventSeam } from "@trunk/scene/sceneEvents";

import { sceneFromRecords } from "../document/sceneFromStore";
import { BRIDGE_AUTHOR } from "./pyblocksConsumer";

/** How long the document must sit still before its changes count as a
 *  finished gesture. Long enough that a mouse-up's trailing writes land in
 *  the same batch; short enough that the status line answers while the
 *  person is still looking at what they did. */
const DEFAULT_QUIET_MS = 200;

export interface SceneEventBridgeSource {
  /** The document, projected. */
  read(): HostScene;
  /** Whatever fires when the document changes; returns the unsubscribe. */
  subscribe(onChange: () => void): () => void;
  publish(batch: SceneEventBatch): void;
  /** The document these events edit — a pyblocks board's `source.uri` while
   *  one is open, `undefined` for a hand-drawn board. Read at publish time,
   *  not captured, because a board can be opened after the bridge starts. */
  documentUri?(): string | undefined;
  quietMs?: number;
  /** "The person is still mid-gesture" — the timer restarts while this is
   *  true, so a slow drag with a pause in it is still one batch. */
  isBusy?(): boolean;
  newId?(): string;
  now?(): string;
}

export interface SceneEventBridge {
  /** Forget the pending diff and take `read()` as the new baseline, WITHOUT
   *  publishing. */
  rebase(): void;
  /** Derive and publish now, if anything changed. */
  flush(): void;
  stop(): void;
}

/** `crypto.randomUUID` is available in every browser this app runs in
 *  (localhost is a secure context) and in node 19+. The fallback is here so
 *  a batch id can never be the reason a publish throws. */
function randomBatchId(): string {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === "function") return source.randomUUID();
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The bridge, with every edge injected — no React, no tldraw, no clock of
 * its own. `backend.test.ts` drives this directly with fake timers, which is
 * the only way "one batch per gesture" is a checked claim rather than a
 * hopeful comment.
 */
export function createSceneEventBridge(source: SceneEventBridgeSource): SceneEventBridge {
  const quietMs = source.quietMs ?? DEFAULT_QUIET_MS;
  const newId = source.newId ?? randomBatchId;
  const now = source.now ?? (() => new Date().toISOString());

  let previous = source.read();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const flush = () => {
    clear();
    if (stopped) return;
    const next = source.read();
    const events = deriveSceneEvents(previous, next);
    previous = next;
    if (events.length === 0) return;
    const documentUri = source.documentUri?.();
    source.publish({
      id: newId(),
      author: BRIDGE_AUTHOR,
      // The gesture's name, as its first fact — `history.ts`'s own
      // convention for a batch label: what a person would call this.
      label: events[0].type,
      at: now(),
      ...(documentUri ? { documentUri } : {}),
      events,
    });
  };

  const settle = () => {
    // Still dragging? Wait for the gesture, not for the clock.
    if (source.isBusy?.() === true) {
      timer = setTimeout(settle, quietMs);
      return;
    }
    flush();
  };

  const unsubscribe = source.subscribe(() => {
    if (stopped) return;
    clear();
    timer = setTimeout(settle, quietMs);
  });

  return {
    rebase() {
      clear();
      previous = source.read();
    },
    flush,
    stop() {
      stopped = true;
      clear();
      unsubscribe();
    },
  };
}

/**
 * The bridge, wired to this app: the tldraw store as the change source, the
 * store's projection as the read, and the seam as the publish.
 *
 * WHY `scope: "document"` and `source: "all"`: session state — camera,
 * selection, the page you are looking at — is not an edit to anything a
 * consumer could round-trip, and `"all"` keeps the stream honest about
 * writes that did not originate at a pointer (a menu action, a future
 * collaborator). Measurement writes reach this listener too
 * (`shapes/shared/measure.ts` writes `anchors` on every layout settle) and
 * cost one diff each, because the projection does not carry `anchors` — so
 * they derive `[]` and publish nothing, which is the correct answer rather
 * than a filtered one.
 */
export function useSceneEventBridge(seam: SceneEventSeam, documentUri: () => string | undefined): SceneEventBridge {
  const editor = useEditor();
  const bridge = useRef<SceneEventBridge | null>(null);
  const uri = useRef(documentUri);
  uri.current = documentUri;

  useEffect(() => {
    const live = createSceneEventBridge({
      read: () => sceneFromRecords(editor.store.allRecords()),
      subscribe: (onChange) => editor.store.listen(() => onChange(), { source: "all", scope: "document" }),
      publish: (batch) => seam.publish(batch),
      documentUri: () => uri.current(),
      isBusy: () => isMidGesture(editor),
    });
    bridge.current = live;
    return () => {
      live.stop();
      bridge.current = null;
    };
  }, [editor, seam]);

  // A stable facade: `OpenPython` holds this across renders and calls
  // `rebase()` after a board lands, which happens long after the effect ran.
  return useMemo<SceneEventBridge>(
    () => ({
      rebase: () => bridge.current?.rebase(),
      flush: () => bridge.current?.flush(),
      stop: () => bridge.current?.stop(),
    }),
    [],
  );
}

/**
 * Whether the editor is in the middle of something the person has not
 * finished.
 *
 * These are tldraw's own state-node paths, asked through the public
 * `editor.isIn` (`src/document/stockBoundary.test.ts` allows nothing deeper
 * than the `tldraw` entry). Editing counts: an inline rename should publish
 * ONE `node-renamed` when the field commits, not one per keystroke.
 */
function isMidGesture(editor: Editor): boolean {
  return (
    editor.isIn("select.translating") ||
    editor.isIn("select.resizing") ||
    editor.isIn("select.dragging_handle") ||
    editor.isIn("select.editing_shape") ||
    editor.isIn("select.rotating")
  );
}
