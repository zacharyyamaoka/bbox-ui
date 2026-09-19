// src/components/appSettings.ts — the two settings Zach asked for on
// 2026-09-19, as a pure model.
//
// CONTRACT committed by the planning lane (docs/CHROME-FILES-SETTINGS-PLAN.md);
// the functions THROW until lane `settings-kit` fills them in.
// `appSettings.test.ts` is the acceptance and is off-limits to the builder.
//
// Zach, verbatim: "in settings you can have a toggle wether for file
// navigation to use native or our app one" and "We want the option wether we
// see settings as a [dialog or a page]". Nothing else is a setting yet — a
// setting nobody asked for is a control to maintain and a question in front
// of him every time the page opens.
//
// WHY this lives in the trunk: the same reason `backend/backendSetting.ts`
// does — its shape, parser and storage key are what any host of these menus
// would share; the app owns only the React that shows it and the storage
// adapter's try/catch.
//
// Storage is a per-viewer convenience (`localStorage`), never shared state:
// which dialog a person prefers is a fact about that person's browser.
import type { SettingsPresentation } from "./settingsView";

/** `app` = SystemSketch's own navigator over the local file host (the old
 *  app's "LOCAL WORKSPACE" dialog, ported); `native` = the browser's File
 *  System Access pickers (the OS dialog, no server). */
export type FileNavigationMode = "app" | "native";

export interface AppSettings {
  fileNavigation: FileNavigationMode;
  settingsPresentation: SettingsPresentation;
}

export const APP_SETTINGS_STORAGE_KEY = "systemsketch.settings.v1";

/**
 * WHY `app` is the default navigator: Zach — "copy over the code from system
 * sketch for the file navigator here. its working good enough for now". The
 * ported navigator is the thing he already uses daily; native is the opt-in.
 * WHY `dialog` is the default presentation: the old app's settings were a
 * dialog (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:164`),
 * so zero relearning until he flips it.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = Object.freeze({
  fileNavigation: "app",
  settingsPresentation: "dialog",
});

/**
 * Total and field-independent: each field that is not one of its own legal
 * values falls back to ITS default without invalidating its sibling (the rule
 * `toolPreferences.ts`'s `parsePreferences` already generalizes). Any
 * non-object (null, array, string, a future version's shape) → the defaults.
 * Never throws.
 */
export function parseAppSettings(raw: unknown): AppSettings {
  void raw;
  throw new Error("parseAppSettings: not implemented (lane settings-kit)");
}

/** The inverse: `parseAppSettings(JSON.parse(serializeAppSettings(s)))`
 *  deep-equals `s` for every valid `s`. */
export function serializeAppSettings(settings: AppSettings): string {
  void settings;
  throw new Error("serializeAppSettings: not implemented (lane settings-kit)");
}

/** Reads `APP_SETTINGS_STORAGE_KEY` through `parseAppSettings`. A null
 *  storage, a throwing `getItem` (private window, blocked site data) or
 *  corrupt JSON → the defaults. Never throws. */
export function readAppSettings(storage: Pick<Storage, "getItem"> | null): AppSettings {
  void storage;
  throw new Error("readAppSettings: not implemented (lane settings-kit)");
}

/** Writes `serializeAppSettings(settings)` under the key. A null storage or a
 *  throwing `setItem` is swallowed — "preferences are helpful feedback, never
 *  a reason to block drawing" (the archive's rule, `src/chrome/preferences.ts`).
 *  Never throws. */
export function writeAppSettings(storage: Pick<Storage, "setItem"> | null, settings: AppSettings): void {
  void storage;
  void settings;
  throw new Error("writeAppSettings: not implemented (lane settings-kit)");
}
