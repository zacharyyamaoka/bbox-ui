// src/source/backendSwitch.tsx — the one thing the source-code view reads
// off a backend (`kind`), and how it reads it LIVE.
//
// THE DEVIATION THIS FILE IS, stated at the top because a reader will look
// for a drop-down and not find one: the lane brief asked for a NEW
// bottom-right "Backend: none / pyblocks (stub)" drop-down, persisted under
// `bbox.sourceBackend`, "until stream 3's real backend object replaces the
// stub". Stream 3 landed first. `src/backend/BackendSettings.tsx` already
// mounts a real `Backend: none | pyblocks @ url` control — with health, a
// consumer, and its own `localStorage` key — in tldraw's own top-right
// `components.SharePanel` seat. Building the stub anyway would put TWO
// switches on the board, each claiming to say whether a backend is
// connected, disagreeing the moment anyone touched one; and a cell's badge
// would then be answering a different question from the menu's gate. So
// this file ADAPTS the real setting instead of competing with it.
//
// What the brief's rule actually wanted is intact (Zach's "prototype switch
// in app", 2026-09-09: never a URL flag, a control in the app that remembers
// the choice): there IS a switch, it IS in the app, it DOES remember. Only
// the corner and the word "(stub)" are different, and only because the stub
// became real.
//
// The seam for stream 4's own follow-up — the `--view-kind definitions`
// route — is `definitionsFor` below: absent today, one line when it lands.
import { useCallback, useSyncExternalStore } from "react";

import type { BackendSetting } from "@trunk/backend/backendSetting";
import { PYBLOCKS_BACKEND_KIND, type SourceBackendRef } from "@trunk/editor/sourceActions";

import { readStoredSetting } from "../backend/pyblocksConsumer";
import type { DefinitionsLookup } from "./originResolution";

/**
 * What this app hands the source kit. `kind` is the only field
 * `sourceActionsFor` reads (`sourceActions.ts`: "the ONLY field the kit
 * reads off a backend"); the rest is host detail the host reads back.
 */
export interface AppSourceBackend extends SourceBackendRef {
  readonly kind: "none" | typeof PYBLOCKS_BACKEND_KIND;
  /** The backend's origin, when there is one. */
  readonly url?: string;
  /** The directory the board document lives in, for `origin.uri`. Absent
   *  until a board is opened from a real file. */
  readonly boardDir?: string;
  /** How to fetch a file's definitions view. See ./originResolution.ts —
   *  absent until that route exists; its absence is what makes a bound cell
   *  read `Orphaned` rather than a guess. */
  readonly definitionsFor?: DefinitionsLookup;
}

/** The honest empty. Frozen and shared so `useSyncExternalStore` can compare
 *  snapshots by reference. */
export const NO_SOURCE_BACKEND: AppSourceBackend = Object.freeze({ kind: "none" });

/**
 * The app's stored `BackendSetting`, as the source kit's `SourceBackendRef`.
 *
 * Pure, and the ONE place the two vocabularies meet: `BackendSetting`'s
 * `"pyblocks"` and `sourceActions.ts`'s `PYBLOCKS_BACKEND_KIND` are the same
 * string by contract, and this function is where that is asserted rather
 * than assumed.
 */
export function sourceBackendFor(setting: BackendSetting): AppSourceBackend {
  if (setting.kind !== "pyblocks") return NO_SOURCE_BACKEND;
  return { kind: PYBLOCKS_BACKEND_KIND, url: setting.url };
}

/** `localStorage`, or nothing at all — the same wrapped accessor
 *  `src/backend/BackendSettings.tsx` uses, for the same reason (a private
 *  window, blocked site data or a quota error must cost the remembered
 *  setting, never the app). */
function viewerStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** One-shot read, for a caller outside React. */
export function readSourceBackend(): AppSourceBackend {
  return sourceBackendFor(readStoredSetting(viewerStorage()));
}

/**
 * The event a writer may dispatch on `window` to make a change visible
 * immediately instead of on the next poll below. Nothing dispatches it
 * today; it exists so the day `BackendSettings.tsx` wants to, it is one
 * line there and no change here.
 */
export const SOURCE_BACKEND_CHANGED_EVENT = "bbox.sourceBackend";

/**
 * How often the stored setting is re-read, in ms.
 *
 * WHY a poll at all — the ugly part, stated rather than hidden: a same-tab
 * `localStorage.setItem` fires NO `storage` event (that event is for OTHER
 * tabs, by spec), and the writer is `src/backend/BackendSettings.tsx`, which
 * belongs to another lane and holds the setting in its own React state. The
 * alternatives were a React context (needs a provider in `App.tsx`, which
 * this lane does not own either) or module-level state (the thing
 * `history.ts` and `BackendSettings.tsx` both refuse: "each app instance
 * owns its own"). One `getItem` of one key every 400 ms is cheaper than any
 * of them and cannot go stale in a way a reader would misread — and the
 * event above is the door out of it.
 */
const POLL_MS = 400;

/**
 * The live backend, for a component.
 *
 * The snapshot is cached and compared by VALUE so `useSyncExternalStore`
 * gets a stable reference between polls — returning a fresh object every
 * poll would re-render every code shape on the board 2.5 times a second.
 */
let cached: AppSourceBackend = NO_SOURCE_BACKEND;

function currentSnapshot(): AppSourceBackend {
  const next = readSourceBackend();
  if (next.kind === cached.kind && next.url === cached.url) return cached;
  cached = next;
  return cached;
}

export function useSourceBackend(): AppSourceBackend {
  const subscribe = useCallback((onChange: () => void) => {
    const timer = setInterval(onChange, POLL_MS);
    window.addEventListener("storage", onChange);
    window.addEventListener(SOURCE_BACKEND_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onChange);
      window.removeEventListener(SOURCE_BACKEND_CHANGED_EVENT, onChange);
    };
  }, []);
  // `getServerSnapshot` is the same function: there is no server here, and a
  // read that throws is already `NO_BACKEND` (`readStoredSetting`).
  return useSyncExternalStore(subscribe, currentSnapshot, () => NO_SOURCE_BACKEND);
}
