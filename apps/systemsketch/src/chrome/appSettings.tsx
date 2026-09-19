// src/chrome/appSettings.tsx — Settings, configured.
//
// Zach, 2026-09-19: "Please add the setting page. We want the option wether we
// see settings as a [dialog or a page]. You can reference the one in old
// system sketch" and "in settings you can have a toggle wether for file
// navigation to use native or our app one".
//
// Everything about how this LOOKS — the left nav, the right pane, the radio
// rows, the dialog-vs-page container — is `@trunk/components/settingsView`.
// What lives here is the two lines of configuration that are genuinely this
// app's: WHICH settings exist, and what each one is bound to. That split is
// the 2026-09-19 feedback rule (`.claude/feedback.md`), and it is why adding
// a third setting later is a data edit in this file rather than a component.
//
// WHY the storage adapter is here and the parser is in the trunk: `localStorage`
// is a per-viewer browser fact that can throw outright in a private window or
// with site data blocked — "preferences are helpful feedback, never a reason
// to block drawing" (the archive's rule, already this app's in
// `./preferences.ts`). The trunk's `readAppSettings`/`writeAppSettings` already
// swallow a throwing `getItem`/`setItem`; this file only decides that
// `window.localStorage` is the storage, and answers `null` when even REACHING
// it throws (Chrome does that for a blocked third-party context, before any
// method is called).
import { useCallback, useMemo, useState } from "react";
import { Info, SlidersHorizontal } from "lucide-react";

import {
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  writeAppSettings,
  type AppSettings,
  type FileNavigationMode,
} from "@trunk/components/appSettings";
import { isNativeFileAccessSupported } from "@trunk/files/nativeFiles";
import { SettingsView, type SettingsCategory, type SettingsPresentation } from "@trunk/components/settingsView";

/** The browser's own storage, or `null` when even touching it throws. */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface AppSettingsState {
  settings: AppSettings;
  update(patch: Partial<AppSettings>): void;
}

/**
 * The app's settings, read once per mount and written on every change.
 *
 * WHY read once at mount rather than subscribing to `storage` events: the
 * value steers which FILE HOST a window talks to and which pickers it opens.
 * A second window flipping the toggle mid-session and silently swapping this
 * window's Open… out from under an in-flight save is a worse failure than the
 * reload it costs to pick that change up — and the same reason
 * `src/settings.smoke.test.tsx` proves the choice "survives a remount" rather
 * than propagating live.
 */
export function useAppSettings(): AppSettingsState {
  const [settings, setSettings] = useState<AppSettings>(() => readAppSettings(viewerStorage()));
  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeAppSettings(viewerStorage(), next);
      return next;
    });
  }, []);
  return useMemo(() => ({ settings, update }), [settings, update]);
}

export interface SystemSketchSettingsProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  settings: AppSettings;
  update(patch: Partial<AppSettings>): void;
}

export function SystemSketchSettings({ open, onOpenChange, settings, update }: SystemSketchSettingsProps) {
  // Support is a fact about THIS browser, read once: `showOpenFilePicker` /
  // `showSaveFilePicker` exist only on a secure context in Chromium-family
  // browsers. It is reported as a description rather than used to DISABLE the
  // option, deliberately: this app ships in a dock window whose browser does
  // have the API, a greyed row teaches nothing, and the failure — if it ever
  // happens — arrives as an error naming the missing API rather than as a
  // silent dead end.
  const nativeSupported = useMemo(() => isNativeFileAccessSupported(window), []);

  const categories = useMemo<SettingsCategory[]>(
    () => [
      {
        id: "general",
        label: "General",
        icon: <SlidersHorizontal aria-hidden="true" />,
        sections: [
          {
            id: "file-navigation",
            title: "File navigation",
            description: "Which dialog Open… and Save As… use.",
            control: {
              kind: "radio",
              value: settings.fileNavigation,
              options: [
                {
                  value: "app",
                  label: "SystemSketch file browser",
                  description: "Places, Recent, folders and a filter — over the boards in your workspace.",
                },
                {
                  value: "native",
                  label: "System file dialog",
                  description: nativeSupported
                    ? "Your browser's own Open and Save dialogs. No recent list, no rename, no Show in Files."
                    : "This browser has no File System Access API, so Open… and Save As… will report an error.",
                },
              ],
              onValueChange: (value) => update({ fileNavigation: value as FileNavigationMode }),
            },
          },
          {
            id: "settings-presentation",
            title: "Settings presentation",
            description: "Where this window opens.",
            control: {
              kind: "radio",
              value: settings.settingsPresentation,
              options: [
                { value: "dialog", label: "Dialog", description: "A centred panel over the board." },
                { value: "page", label: "Page", description: "The whole window, like a preferences screen." },
              ],
              onValueChange: (value) => update({ settingsPresentation: value as SettingsPresentation }),
            },
          },
        ],
      },
      {
        id: "about",
        label: "About",
        icon: <Info aria-hidden="true" />,
        sections: [
          {
            id: "about",
            title: "SystemSketch",
            description: "bbox-ui components on stock tldraw. Boards are plain .tldr files.",
            control: {
              kind: "custom",
              render: (
                <p className="text-sm text-muted-foreground">
                  Settings are remembered in this browser only. Defaults: {DEFAULT_APP_SETTINGS.fileNavigation} file
                  navigation, settings as a {DEFAULT_APP_SETTINGS.settingsPresentation}.
                </p>
              ),
            },
          },
        ],
      },
    ],
    [nativeSupported, settings.fileNavigation, settings.settingsPresentation, update],
  );

  return (
    <SettingsView
      open={open}
      onOpenChange={onOpenChange}
      presentation={settings.settingsPresentation}
      categories={categories}
      testIdPrefix="ss-settings"
    />
  );
}
