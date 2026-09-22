// src/editor/appSettings.ts — the two settings Zach asked for on
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
import { parsePreferences, type PreferenceRegistry } from "./toolPreferences";
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

// WHY the registry, not a hand-written ladder: `parsePreferences` already
// generalizes exactly this shape (field-independent fallback, never throws,
// never hands back the frozen default for a caller to mutate) — writing a
// second ladder here would just be `toolPreferences.ts`'s bug surface twice.
const APP_SETTINGS_REGISTRY: PreferenceRegistry<AppSettings> = {
  fileNavigation: { values: ["app", "native"], default: DEFAULT_APP_SETTINGS.fileNavigation },
  settingsPresentation: { values: ["dialog", "page"], default: DEFAULT_APP_SETTINGS.settingsPresentation },
};

/**
 * Total and field-independent: each field that is not one of its own legal
 * values falls back to ITS default without invalidating its sibling (the rule
 * `toolPreferences.ts`'s `parsePreferences` already generalizes). Any
 * non-object (null, array, string, a future version's shape) → the defaults.
 * Never throws.
 */
export function parseAppSettings(raw: unknown): AppSettings {
  return parsePreferences(APP_SETTINGS_REGISTRY, raw);
}

/** The inverse: `parseAppSettings(JSON.parse(serializeAppSettings(s)))`
 *  deep-equals `s` for every valid `s`. */
export function serializeAppSettings(settings: AppSettings): string {
  return JSON.stringify(settings);
}

/** Reads `APP_SETTINGS_STORAGE_KEY` through `parseAppSettings`. A null
 *  storage, a throwing `getItem` (private window, blocked site data) or
 *  corrupt JSON → the defaults. Never throws. */
export function readAppSettings(storage: Pick<Storage, "getItem"> | null): AppSettings {
  if (!storage) return DEFAULT_APP_SETTINGS;
  try {
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY);
    return raw === null ? DEFAULT_APP_SETTINGS : parseAppSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

/** Writes `serializeAppSettings(settings)` under the key. A null storage or a
 *  throwing `setItem` is swallowed — "preferences are helpful feedback, never
 *  a reason to block drawing" (the archive's rule, `src/chrome/preferences.ts`).
 *  Never throws. */
export function writeAppSettings(storage: Pick<Storage, "setItem"> | null, settings: AppSettings): void {
  if (!storage) return;
  try {
    storage.setItem(APP_SETTINGS_STORAGE_KEY, serializeAppSettings(settings));
  } catch {
    // Swallowed on purpose — see the doc comment above.
  }
}
