// src/chrome/ShareMenu/appSettings.tsx — Settings, configured.
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
import { Info } from "lucide-react";

import {
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  writeAppSettings,
  type AppSettings,
  type FileNavigationMode,
} from "@trunk/components/appSettings";
import { FILE_MENU_ROWS } from "@trunk/components/appMenu";
import { readAppearancePreferences, writeAppearancePreferences, type AppearancePreferences } from "@trunk/components/appearancePreferences";
import { readEdgePolicy, writeEdgePolicy, edgePolicyPreset, type EdgePolicy, type EdgePolicyPresetId } from "@trunk/components/edgePolicy";
import { readGestureSettings, writeGestureSettings, type GestureSettings } from "@trunk/components/gestureSettings";
import { readToolAliases, writeToolAliases, type ToolAliasItem, type ToolAliases } from "@trunk/components/toolAliases";
import { buildSettingsCategories, type SettingsHotkey } from "@trunk/components/settingsCategories";
import { isNativeFileAccessSupported } from "@trunk/files/nativeFiles";
import { SettingsView, type SettingsPresentation } from "@trunk/components/settingsView";

import { DRAW_TOOLS, GEO_VARIANTS, LINE_TOOLS, SIMPLE_TOOLS } from "../families";
import { setInterfaceScalePercent, useInterfaceScalePercent } from "./interfaceScaleHost";
import { shortcutPlatform } from "../FileMenu";
import { SYSTEM_FAMILY_ITEMS } from "../../shapes/registry";

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

/**
 * One persisted record, read once at mount and written on every patch.
 *
 * WHY a local factory rather than a shared hook in the trunk: the trunk's
 * settings models are deliberately pure — the archive's module-level
 * `useSyncExternalStore` stores did NOT travel (see each model's header, and
 * `toolPreferences.ts`'s statement of the rule). Owning the store is the
 * host's job, and this is the whole of it: four lines, the same
 * read-once-write-through shape `useAppSettings` above already uses and for
 * the same reason.
 */
function usePersistedRecord<T>(
  read: (storage: Storage | null) => T,
  write: (storage: Storage | null, value: T) => void,
): [T, (patch: Partial<T>) => void] {
  const [value, setValue] = useState<T>(() => read(viewerStorage()));
  const patch = useCallback(
    (update: Partial<T>) => {
      setValue((current) => {
        const next = { ...current, ...update };
        write(viewerStorage(), next);
        return next;
      });
    },
    [read, write],
  );
  return [value, patch];
}

/** The same, for a setting that is one value rather than a record. */
function usePersistedValue<T>(
  read: (storage: Storage | null) => T,
  write: (storage: Storage | null, value: T) => unknown,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read(viewerStorage()));
  const set = useCallback(
    (next: T) => {
      write(viewerStorage(), next);
      // Re-read so the stored, NORMALIZED value is what the control shows —
      // `writeInterfaceScale` clamps and snaps to a 5% step, so echoing the
      // raw request would let the slider and the disk disagree by up to 2%.
      setValue(read(viewerStorage()));
    },
    [read, write],
  );
  return [value, set];
}

/**
 * Every tool in this app, as something an alias can be attached to.
 *
 * The trunk never names a tool (`toolAliases.ts`' own rule); this list is the
 * host's side of that contract, assembled from the SAME arrays the dock
 * renders so a tool cannot appear in one and not the other.
 */
const ALIAS_ITEMS: readonly ToolAliasItem[] = [
  ...SIMPLE_TOOLS.map((tool) => ({ id: tool.id, label: tool.label, detail: "Toolbar tool" })),
  ...SYSTEM_FAMILY_ITEMS.map((tool) => ({ id: tool.id, label: tool.label, detail: "System design" })),
  ...GEO_VARIANTS.map((tool) => ({ id: tool.id, label: tool.label, detail: "Shape" })),
  ...LINE_TOOLS.map((tool) => ({ id: tool.id, label: tool.label, detail: "Line" })),
  ...DRAW_TOOLS.map((tool) => ({ id: tool.id, label: tool.label, detail: "Draw" })),
];

/**
 * The app's REAL chords, taken from the burger's own row spec rather than
 * retyped — `FILE_MENU_ROWS` is what `buildAppMenu` prints in the menu's
 * shortcut column, so the Hotkeys list and the menu cannot drift apart. Rows
 * without a chord (Open recent, Export to tldraw…) are not hotkeys and are
 * dropped.
 *
 * Canvas keys (tldraw's own) are deliberately NOT duplicated here: the burger
 * already opens tldraw's keyboard-shortcuts dialog, which is generated from
 * the live action table, and a second hand-kept copy is a copy that rots.
 */
const HOTKEYS: readonly SettingsHotkey[] = FILE_MENU_ROWS.filter((row) => row.chord !== undefined).map((row) => ({
  id: row.id,
  label: row.label,
  chord: row.chord as string,
}));

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

  const [appearance, patchAppearance] = usePersistedRecord<AppearancePreferences>(
    readAppearancePreferences,
    writeAppearancePreferences,
  );
  const [gestures, patchGestures] = usePersistedRecord<GestureSettings>(readGestureSettings, writeGestureSettings);
  const [edgePolicy, patchEdgePolicy] = usePersistedRecord<EdgePolicy>(readEdgePolicy, writeEdgePolicy);
  // WHY this one setting does NOT use `usePersistedValue` like its neighbours:
  // its value has a second reader outside this dialog. `usePersistedValue`
  // keeps the value in local `useState`, which is invisible to `App.tsx` — so
  // the slider wrote localStorage and the interface never changed, which is
  // exactly the bug Zach reported on 2026-09-20. `./interfaceScaleHost` is the
  // same module-store shape `./preferences.ts` already uses for the other
  // two-surface value, and it normalizes on write for the same reason the
  // comment in `usePersistedValue` gives.
  const interfaceScalePercent = useInterfaceScalePercent();
  const setInterfaceScale = setInterfaceScalePercent;
  const [aliases, setAliases] = usePersistedValue<ToolAliases>(readToolAliases, writeToolAliases);

  // WHY the whole list is rebuilt in the trunk from values + callbacks rather
  // than assembled here: Zach, 2026-09-19 — "system sketch should just be
  // kinda like importing these stock menus and doing a light bit of
  // configuration". Everything below is binding, not authoring.
  const categories = useMemo(
    () =>
      buildSettingsCategories({
        fileNavigation: settings.fileNavigation,
        onFileNavigationChange: (mode: FileNavigationMode) => update({ fileNavigation: mode }),
        nativeFileAccessSupported: nativeSupported,
        settingsPresentation: settings.settingsPresentation,
        onSettingsPresentationChange: (presentation: SettingsPresentation) =>
          update({ settingsPresentation: presentation }),
        // `allowAnyPath` is deliberately NOT passed: the archive's file fence
        // lives on its Python workspace server (`workspace_store.py`), and
        // this app has no such server or endpoint. A switch over a fence that
        // does not exist would be a control that lies, so the row is absent —
        // the same "never a disabled row for a feature that does not exist"
        // rule the burger already follows.
        interfaceScalePercent,
        onInterfaceScaleChange: setInterfaceScale,
        appearance,
        onAppearanceChange: patchAppearance,
        gestures,
        onGesturesChange: patchGestures,
        edgePolicy,
        onEdgePolicyChange: patchEdgePolicy,
        onEdgePolicyPreset: (id: EdgePolicyPresetId) => patchEdgePolicy(edgePolicyPreset(id).policy),
        hotkeys: HOTKEYS,
        shortcutPlatform: shortcutPlatform(),
        aliasItems: ALIAS_ITEMS,
        aliases,
        onAliasesChange: setAliases,
        // Unchanged from before this port: Zach asked for five categories and
        // for nothing to be removed, so About is handed over exactly as it
        // already read, title and all.
        about: {
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
                  <p className="text-muted-foreground text-sm">
                    Settings are remembered in this browser only. Defaults: {DEFAULT_APP_SETTINGS.fileNavigation} file
                    navigation, settings as a {DEFAULT_APP_SETTINGS.settingsPresentation}.
                  </p>
                ),
              },
            },
          ],
        },
      }),
    [
      aliases,
      appearance,
      edgePolicy,
      gestures,
      interfaceScalePercent,
      nativeSupported,
      patchAppearance,
      patchEdgePolicy,
      patchGestures,
      setAliases,
      setInterfaceScale,
      settings.fileNavigation,
      settings.settingsPresentation,
      update,
    ],
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
