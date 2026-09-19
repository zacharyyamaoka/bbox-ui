// src/backend/backendSetting.ts — the "Backend: none | pyblocks @ url"
// setting, as a pure model. SKELETON committed by the planning lane
// (docs/PYBLOCKS-BACKEND-PLAN.md, lane `trunk-loader-events`); the
// functions throw until the builder fills them in. `backendSetting.test.ts`
// is the acceptance and is off-limits to the builder.
//
// WHY this lives in the trunk and not in apps/systemsketch: the rebuilt
// app is "bbox-ui + stock tldraw" and imports the trunk through one alias
// (ASK doc, dispatcher's location decision). Anything two apps could share
// — a setting's shape, its parser, its storage key — belongs here, and the
// app owns only the React that shows it.
//
// WHY `none` is the default and the whole feature is invisible under it:
// Zach — "System sketch should be able to be used with no real backend,
// then its truly like a whiteboard." When `kind === "none"` nothing about
// pyblocks renders: no menu item, no status pill, no fetch.
//
// Storage is a per-viewer convenience (`localStorage`, wrapped in
// try/catch by the app), never shared state — the URL is a machine-local
// fact.

export type BackendSetting = { kind: "none" } | { kind: "pyblocks"; url: string };

export const BACKEND_SETTING_STORAGE_KEY = "systemsketch.backend.v1";

/** `npm run backend` in pyblocks binds 4177 (`package.json` "backend":
 *  `python3 -m pyblocks serve --no-browser --port 4177`); the desktop icon
 *  runs the same port. `serve`'s own default is 0 (ephemeral), so a fixed
 *  default here is the only way a fresh install finds anything. */
export const DEFAULT_PYBLOCKS_URL = "http://127.0.0.1:4177";

export const NO_BACKEND: BackendSetting = Object.freeze({ kind: "none" });

/**
 * `http://host[:port]` or `https://…`, origin only (any path, query or
 * trailing slash is dropped), or `null` when the text is not a URL the
 * client could call. Pure.
 */
export function normalizePyblocksUrl(_text: string): string | null {
  throw new Error("normalizePyblocksUrl: not implemented (lane trunk-loader-events)");
}

/**
 * Total: any value that is not exactly `{kind:"none"}` or
 * `{kind:"pyblocks", url:<normalizable>}` parses to `NO_BACKEND`. A stored
 * value from a future version never turns the feature on by accident.
 */
export function parseBackendSetting(_raw: unknown): BackendSetting {
  throw new Error("parseBackendSetting: not implemented (lane trunk-loader-events)");
}

/** The inverse; `parseBackendSetting(JSON.parse(serializeBackendSetting(s)))`
 *  equals `s` for every valid setting. */
export function serializeBackendSetting(_setting: BackendSetting): string {
  throw new Error("serializeBackendSetting: not implemented (lane trunk-loader-events)");
}
