// src/editor/settingsCategories.tsx — the five settings categories the
// archived SystemSketch had, as data for `settingsView.tsx`'s shell.
//
// Zach, 2026-09-19, verbatim (`Projects/SystemSketch/PROJECT - System
// Sketch.md`):
//
//     Port over settin pages:
//     1. GEneral
//     2. Apperance
//        1. Put interface scale in here
//     3. Canvas, Lets rename it though to like Mouse and Keyboard or
//        something more clear
//     4. Connections
//     5. Tool Alias
//        1. Mabye we call this hotkeys and aliases?
//
//     If I didn't list it here don't port it.
//
// That last line is why the archive's `Interface`, `Menu lab` and `Pill lab`
// categories are absent, and why the interface SCALE — the only part of
// `Interface` he kept — moves into Appearance rather than travelling with its
// old category. `About` is untouched: it already exists in this app and he
// asked for nothing to be removed.
//
// WHY the labels and groupings live in the trunk rather than in
// apps/systemsketch: Zach, same day — "all of the feedback regarding the
// chrome should be made in bbox-ui editor-components, not in system sketch,
// system sketch should just be kinda like importing these stock menus and
// doing a light bit of configuration" (`.claude/feedback.md`). WHICH settings
// a host can honour is configuration and stays with the host (it passes the
// values and the callbacks); what each one is CALLED, how it is explained and
// which group it teaches under is chrome, and belongs here so the next host
// inherits it.
//
// WHY every input is a value plus a callback and nothing here reaches for a
// canvas: the repo's one rule (`CLAUDE.md`, "The core imports no canvas
// engine"). A category that read tldraw's camera would make this file
// unusable by the plain-DOM and React Flow hosts it is meant to serve.
//
// ── The two renames, and the reasoning they rest on ───────────────────────
//
// **Canvas → "Mouse and scrolling"**, not "Mouse and Keyboard". He asked for
// "Mouse and Keyboard or something more clear", and the honest answer is that
// there is no keyboard in here. Read what the archive's Canvas panel actually
// contains (`/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:857-1114`):
// where a paste lands relative to the POINTER, what each WHEEL gesture does,
// how far one wheel notch moves the board, and whether the wheel zooms
// directly. The only keys involved are Ctrl/Cmd qualifying a wheel gesture.
// Calling the category "Keyboard" would advertise a shortcut editor that does
// not exist — and this app already has a real keyboard-shortcuts surface,
// reached from the burger's own "Keyboard shortcuts" row (`appMenu.ts:411-413`).
//
// **Tool aliases → "Hotkeys and aliases"**, his own suggestion, taken. It is
// honest here because the category carries real hotkeys: the host hands in
// its actual chords (`hotkeys`) and they are printed through the trunk's own
// `formatShortcut`, so what is on screen is the key that really runs the
// command rather than a hand-typed table that can rot. Rebinding is NOT in
// it, and the section says so out loud rather than leaving a dead control.
import type { ReactNode } from "react";
import { Cable, Info, Keyboard, MousePointer2, Palette, SlidersHorizontal } from "lucide-react";

import { formatShortcut, type KeyChord, type ShortcutPlatform } from "./appMenu";
import {
  MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  WHEEL_ZOOM_SENSITIVITY_STEP,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  type AppearancePreferences,
} from "./appearancePreferences";
import {
  EDGE_POLICY_PRESETS,
  EDGE_POLICY_RULE_COUNT,
  TYPE_MATCHING_MODES,
  edgePolicyPreset,
  enforcedRuleCount,
  matchingEdgePolicyPreset,
  type EdgePolicy,
  type EdgePolicyPresetId,
  type TypeMatching,
} from "./edgePolicy";
import { Button } from "../components/button";
import { FieldDescription } from "../components/field";
import {
  DEFAULT_GESTURE_SETTINGS,
  MAX_SPEED_PERCENT,
  MIN_SPEED_PERCENT,
  SPEED_PERCENT_STEP,
  WHEEL_COMMANDS_IN_MENU_ORDER,
  WHEEL_COMMAND_LABELS,
  WHEEL_GESTURES_IN_ORDER,
  WHEEL_GESTURE_LABELS,
  type GestureSettings,
  type WheelGesture,
} from "./gestureSettings";
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_PRESETS,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
} from "./interfaceScale";
import type { SettingsCategory, SettingsPresentation, SettingsSection } from "./settingsView";
import { ToolAliasEditor } from "./toolAliasEditor";
import type { ToolAliasItem, ToolAliases } from "./toolAliases";
import type { FileNavigationMode } from "./appSettings";
import {
  WHEEL_CONVENTIONS_IN_ORDER,
  WHEEL_CONVENTION_DESCRIPTIONS,
  WHEEL_CONVENTION_LABELS,
  appearanceForWheelConvention,
  wheelConventionOf,
  type WheelConvention,
} from "./cameraGestures";

/** The five category ids, stable for a host that wants to open one directly. */
export const SETTINGS_CATEGORY_IDS = Object.freeze({
  general: "general",
  appearance: "appearance",
  pointer: "pointer",
  connections: "connections",
  hotkeys: "hotkeys",
} as const);

/** One real key chord the host binds, printed read-only under Hotkeys. */
export interface SettingsHotkey {
  id: string;
  label: string;
  chord: KeyChord;
}

export interface SettingsCategoriesInput {
  // ── General ───────────────────────────────────────────────────────────
  fileNavigation: FileNavigationMode;
  onFileNavigationChange(mode: FileNavigationMode): void;
  /** Reported, never used to disable the row — see the app's own WHY. */
  nativeFileAccessSupported?: boolean;
  settingsPresentation: SettingsPresentation;
  onSettingsPresentationChange(presentation: SettingsPresentation): void;
  /** Omitted → the row is absent. A host with no file fence has no setting;
   *  the archive's dispatcher reading, never a disabled row for a feature
   *  that does not exist (`appMenu.ts`'s own header states the same rule). */
  allowAnyPath?: boolean;
  onAllowAnyPathChange?(next: boolean): void;

  // ── Appearance ────────────────────────────────────────────────────────
  interfaceScalePercent: number;
  onInterfaceScaleChange(percent: number): void;

  // ── Appearance + Mouse and scrolling (one archived record, two homes) ──
  appearance: AppearancePreferences;
  onAppearanceChange(patch: Partial<AppearancePreferences>): void;

  // ── Mouse and scrolling ───────────────────────────────────────────────
  gestures: GestureSettings;
  onGesturesChange(patch: Partial<GestureSettings>): void;

  // ── Connections ───────────────────────────────────────────────────────
  edgePolicy: EdgePolicy;
  onEdgePolicyChange(patch: Partial<EdgePolicy>): void;
  onEdgePolicyPreset(id: EdgePolicyPresetId): void;
  /**
   * One line, computed by the HOST, saying how much LINTING the chosen level
   * runs — e.g. "4 of 7 lint rules on at this level". Omitted → the line is
   * absent, and every existing caller renders exactly what it did before.
   *
   * WHY the host computes it instead of this file: the answer lives in
   * `src/scene/validationLevel.ts`, and `components/layering.test.ts`'s import
   * wall means no file in this directory may import the scene kit — the rule
   * that lets a `Block` be driven by a story literal, a React Flow node or a
   * tldraw shape. So the level's MEANING crosses as a string, the same way
   * `aliasItems` crosses as data because "the trunk never names a tool".
   */
  validationSummary?: string;

  // ── Hotkeys and aliases ───────────────────────────────────────────────
  /** The host's REAL chords. Empty → the Hotkeys group is omitted rather
   *  than printing an empty table that implies there are none. */
  hotkeys?: readonly SettingsHotkey[];
  shortcutPlatform?: ShortcutPlatform;
  aliasItems: readonly ToolAliasItem[];
  aliases: ToolAliases;
  onAliasesChange(next: ToolAliases): void;

  // ── About ─────────────────────────────────────────────────────────────
  /**
   * Appended verbatim as a sixth category when given — the WHOLE category,
   * not a body this file wraps.
   *
   * WHY the host hands over a `SettingsCategory` rather than a `ReactNode`:
   * About is the one category whose title, description and content are all
   * the product's own ("SystemSketch — bbox-ui components on stock tldraw").
   * Wrapping a body in a section this file titles would quietly rename the
   * host's own block, which is exactly what happened the first time this was
   * typed as a `ReactNode`.
   */
  about?: SettingsCategory;
}

/**
 * The nav heading the five settings categories sit under, mirroring Obsidian's
 * own grouped nav (Options / Core plugins / Community plugins). The host's
 * About block gets "App" in `buildSettingsCategories` below.
 *
 * Zach, 2026-09-22: "All the section son the left navigator should have icons"
 * plus Obsidian named as the reference. The `icon` field on each category
 * answers the first half; this answers the grouping the reference also has.
 */
const OPTIONS_GROUP = "Options";

/** "Saved on this computer" — the archive's own footer, one line, per
 *  category that persists to the browser (`InterfaceSettings.tsx:337-344`). */
function savedHere(detail: string): ReactNode {
  return <FieldDescription>{detail}</FieldDescription>;
}

// ───────────────────────────── General ──────────────────────────────────

function generalCategory(input: SettingsCategoriesInput): SettingsCategory {
  const sections: SettingsSection[] = [
    {
      id: "file-navigation",
      title: "File navigation",
      description: "Which dialog Open… and Save As… use.",
      control: {
        kind: "radio",
        value: input.fileNavigation,
        options: [
          {
            value: "app",
            label: "SystemSketch file browser",
            description: "Places, Recent, folders and a filter — over the boards in your workspace.",
          },
          {
            value: "native",
            label: "System file dialog",
            description:
              input.nativeFileAccessSupported === false
                ? "This browser has no File System Access API, so Open… and Save As… will report an error."
                : "Your browser's own Open and Save dialogs. No recent list, no rename, no Show in Files.",
          },
        ],
        onValueChange: (value) => input.onFileNavigationChange(value as FileNavigationMode),
      },
    },
    {
      id: "settings-presentation",
      title: "Settings presentation",
      description: "Where this window opens.",
      control: {
        kind: "radio",
        value: input.settingsPresentation,
        options: [
          { value: "dialog", label: "Dialog", description: "A centred panel over the board." },
          { value: "page", label: "Page", description: "The whole window, like a preferences screen." },
        ],
        onValueChange: (value) => input.onSettingsPresentationChange(value as SettingsPresentation),
      },
    },
  ];

  // Ported from `/home/bam/systemsketch/src/settings/InterfaceSettings.tsx:405-435`.
  // WHY the wording is this long: the archive deliberately EXPLAINS this one
  // rather than burying it — off, it restores the fence that confines every
  // open/save/rename to the workspace root, which is the same fence a hostile
  // page would have to escape. A one-word label would make a security
  // boundary look like a convenience.
  if (input.allowAnyPath !== undefined && input.onAllowAnyPathChange) {
    const onAllowAnyPathChange = input.onAllowAnyPathChange;
    sections.push({
      id: "allow-any-path",
      title: "Allow opening files anywhere",
      description:
        "Lets a board link, Save As, or Rename reach any path on this computer — not just your workspace folder. On by default, since boards routinely come from an agent worktree or another drive. Turn this off to confine the app to your workspace folder only.",
      control: {
        kind: "switch",
        checked: input.allowAnyPath,
        onCheckedChange: onAllowAnyPathChange,
      },
    });
  }

  return { id: SETTINGS_CATEGORY_IDS.general, label: "General", group: OPTIONS_GROUP, icon: <SlidersHorizontal />, sections };
}

// ──────────────────────────── Appearance ────────────────────────────────

function appearanceCategory(input: SettingsCategoriesInput): SettingsCategory {
  return {
    id: SETTINGS_CATEGORY_IDS.appearance,
    label: "Appearance",
    group: OPTIONS_GROUP,
    icon: <Palette />,
    sections: [
      {
        // Ported from `InterfaceSettings.tsx:794-855` (the archive's whole
        // `Interface` category, which Zach folded in here).
        id: "interface-scale",
        title: "Interface scale",
        description: "Make menus, panels and the toolbar easier to see on high-resolution displays. This changes the app interface only — canvas zoom and board files stay unchanged.",
        control: {
          kind: "slider",
          value: input.interfaceScalePercent,
          min: MIN_INTERFACE_SCALE,
          max: MAX_INTERFACE_SCALE,
          step: INTERFACE_SCALE_STEP,
          // WHY this is the ONE slider in the app that writes on release.
          //
          // Zach, 2026-09-21: "the scrolling appearance slider still doesn't
          // work. it should only update when I release my finger from the
          // drag, but its updating as the slider moves".
          //
          // Every other slider here writes a number something else reads
          // later — a wheel multiplier, a pan speed. This one re-lays-out the
          // interface, and the interface INCLUDES the dialog the slider is
          // in: writing live makes the row physically move and resize under
          // the pointer mid-drag, so the thumb you are holding is no longer
          // where your finger is. That is a property of what this setting
          // MEANS, which is why the mode is declared here beside its label and
          // its description rather than by the host that supplies the value.
          //
          // The thumb, the track fill and the `%` readout still move live; see
          // `SettingsCommitMode` in ./settingsView. Presets and Reset below are
          // discrete and stay immediate — there is no release to wait for.
          commit: "exit",
          format: (value) => `${value}%`,
          // The archive's small-A / large-A pair (:809, :820) — the size of
          // the glyph IS the legend, which is why they are `aria-hidden` in
          // the shell and the readout carries the number.
          minLabel: "A",
          maxLabel: "A",
          presets: INTERFACE_SCALE_PRESETS,
          resetTo: DEFAULT_INTERFACE_SCALE,
          resetLabel: "Reset to 100%",
          onValueChange: input.onInterfaceScaleChange,
        },
      },
      {
        // Ported from `InterfaceSettings.tsx:1093-1112`, MOVED here from the
        // archive's Canvas panel.
        //
        // WHY moved: the category it used to sit in is now "Mouse and
        // scrolling", which is about what the pointer and wheel DO. Whether
        // two buttons are painted on the navigation strip is not an input
        // behaviour — it is what the app looks like, which is this category.
        id: "zoom-buttons",
        title: "Show zoom −/+ buttons",
        description: "The zoom percentage stays available when these step buttons are hidden.",
        control: {
          kind: "switch",
          checked: input.appearance.showZoomButtons,
          onCheckedChange: (checked) => input.onAppearanceChange({ showZoomButtons: checked }),
        },
      },
      {
        id: "appearance-storage",
        title: "Saved on this computer",
        control: {
          kind: "custom",
          render: savedHere("Appearance is a per-viewer preference, never board content — everyone who opens a board keeps their own."),
        },
      },
    ],
  };
}

// ───────────────────── Mouse and scrolling (was Canvas) ─────────────────

function pointerCategory(input: SettingsCategoriesInput): SettingsCategory {
  const { gestures, appearance } = input;
  const sections: SettingsSection[] = [
    {
      // Ported from `InterfaceSettings.tsx:878-899`.
      id: "paste-under-cursor",
      title: "Copy/paste under cursor",
      description: "On: paste and duplicate land at the pointer. Off: they land at the viewport centre.",
      group: "Pointer",
      groupDescription: "Where a paste or duplicate lands.",
      control: {
        kind: "switch",
        checked: gestures.pasteUnderCursor,
        onCheckedChange: (checked) => input.onGesturesChange({ pasteUnderCursor: checked }),
      },
    },
    {
      // Ported from `InterfaceSettings.tsx:922-943` as a SWITCH; shown as a
      // two-option radio since 2026-09-21 (ruling 2).
      //
      // WHY a radio and not the archive's toggle: Zach asked for both
      // conventions to be OFFERED — "wheel = zoom (Figma-ish) vs wheel = pan,
      // ctrl+wheel = zoom (Excalidraw/tldraw)... its about giving the user
      // flexibility to do what they want". A switch labelled after one of them
      // frames the other as the default and this one as the deviation; a radio
      // that names both, with the app each comes from, is the same stored
      // boolean presented as the choice it actually is. Same control kind the
      // other two either/or rows in this file already use (`file-navigation`,
      // `settings-presentation`), so it is this page's own idiom, not a new one.
      //
      // The STORAGE is unchanged: still `directWheelZoom` in
      // `systemsketch.appearance.v1`, read and written through
      // `cameraGestures.ts`'s pair of pure translators, so a browser that had
      // already chosen keeps its choice.
      id: "direct-wheel-zoom",
      title: "What the scroll wheel does",
      group: "Wheel behaviour",
      groupDescription: "Pick the convention you already have muscle memory for. Everything below follows it.",
      control: {
        kind: "radio",
        value: wheelConventionOf(appearance),
        options: WHEEL_CONVENTIONS_IN_ORDER.map((convention) => ({
          value: convention,
          label: WHEEL_CONVENTION_LABELS[convention],
          description: WHEEL_CONVENTION_DESCRIPTIONS[convention],
        })),
        onValueChange: (value) => input.onAppearanceChange(appearanceForWheelConvention(value as WheelConvention)),
      },
    },
  ];

  // The archive gates these two halves on `directWheelZoom`, and the gate is
  // load-bearing rather than tidiness (`InterfaceSettings.tsx:944-951`):
  // direct wheel zoom is a DIFFERENT input contract with its own sensitivity,
  // so showing both sets of controls at once leaves it unclear which one is
  // live. Hiding the half that is not in charge keeps the page honest.
  if (!appearance.directWheelZoom) {
    for (const gesture of WHEEL_GESTURES_IN_ORDER) {
      sections.push({
        // Ported from `InterfaceSettings.tsx:953-968` + `GestureBindingRow`
        // (:1122-1141).
        id: `wheel-binding-${gesture}`,
        title: WHEEL_GESTURE_LABELS[gesture],
        group: "Wheel gestures",
        groupDescription:
          "What each wheel gesture does. Leaving a row on its stock command lets the canvas handle it natively.",
        control: {
          kind: "select",
          value: gestures.bindings[gesture],
          options: WHEEL_COMMANDS_IN_MENU_ORDER.map((command) => ({
            value: command,
            label: WHEEL_COMMAND_LABELS[command],
          })),
          onValueChange: (value) =>
            input.onGesturesChange({
              bindings: { ...gestures.bindings, [gesture]: value as GestureSettings["bindings"][WheelGesture] },
            }),
        },
      });
    }

    // Ported from `InterfaceSettings.tsx:970-1016` + `GestureSpeedRow`
    // (:1153-1193). `exactEntry` is Zach's own ask, recorded in the donor's
    // comment at :1145-1152 — a drag cannot hit 137%.
    sections.push(
      {
        id: "pan-speed",
        title: "Scroll speed",
        group: "Sensitivity",
        groupDescription: "How far one wheel notch moves the board. 100% matches the standard feel.",
        control: {
          kind: "slider",
          value: gestures.panSpeedPercent,
          min: MIN_SPEED_PERCENT,
          max: MAX_SPEED_PERCENT,
          step: SPEED_PERCENT_STEP,
          format: (value) => `${value}%`,
          exactEntry: true,
          resetTo: DEFAULT_GESTURE_SETTINGS.panSpeedPercent,
          resetLabel: "Reset to 100%",
          onValueChange: (value) => input.onGesturesChange({ panSpeedPercent: value }),
        },
      },
      {
        id: "zoom-speed",
        title: "Zoom speed",
        group: "Sensitivity",
        control: {
          kind: "slider",
          value: gestures.zoomSpeedPercent,
          min: MIN_SPEED_PERCENT,
          max: MAX_SPEED_PERCENT,
          step: SPEED_PERCENT_STEP,
          format: (value) => `${value}%`,
          exactEntry: true,
          resetTo: DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
          resetLabel: "Reset to 100%",
          onValueChange: (value) => input.onGesturesChange({ zoomSpeedPercent: value }),
        },
      },
    );
  } else {
    // Ported from `InterfaceSettings.tsx:1019-1089`.
    sections.push(
      {
        id: "scroll-down-zooms-in",
        title: "Scroll down to zoom in",
        description: "Turn this off if you prefer scrolling up to zoom in.",
        group: "Direct wheel zoom",
        groupDescription:
          "Choose which direction moves closer, whether Ctrl/Cmd reverses zoom, and how much each scroll step changes scale.",
        control: {
          kind: "switch",
          checked: appearance.scrollDownZoomsIn,
          onCheckedChange: (checked) => input.onAppearanceChange({ scrollDownZoomsIn: checked }),
        },
      },
      {
        id: "modifier-wheel-zooms-oppositely",
        title: "Ctrl/Cmd + scroll zooms the opposite way",
        description:
          "When direct zoom is on, Ctrl/Cmd + scroll zooms instead of panning and reverses the plain wheel direction.",
        group: "Direct wheel zoom",
        control: {
          kind: "switch",
          checked: appearance.modifierWheelZoomsOppositely,
          onCheckedChange: (checked) => input.onAppearanceChange({ modifierWheelZoomsOppositely: checked }),
        },
      },
      {
        id: "wheel-zoom-sensitivity",
        title: "Wheel zoom sensitivity",
        description: "100% matches the standard feel. The −/+ buttons keep their normal steps.",
        group: "Direct wheel zoom",
        control: {
          kind: "slider",
          value: appearance.wheelZoomSensitivityPercent,
          min: MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT,
          max: MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT,
          step: WHEEL_ZOOM_SENSITIVITY_STEP,
          format: (value) => `${value}%`,
          minLabel: "Slower",
          maxLabel: "Faster",
          resetTo: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
          resetLabel: "Reset to standard",
          onValueChange: (value) => input.onAppearanceChange({ wheelZoomSensitivityPercent: value }),
        },
      },
    );
  }

  return { id: SETTINGS_CATEGORY_IDS.pointer, label: "Mouse and scrolling", group: OPTIONS_GROUP, icon: <MousePointer2 />, sections };
}

// ──────────────────────────── Connections ───────────────────────────────

/** Every permission, in the archive's own four teaching groups
 *  (`InterfaceSettings.tsx:658-768`). `refuses` is the concrete thing that
 *  stops being drawable when the switch goes off. */
const EDGE_POLICY_ROWS: readonly {
  key: Exclude<keyof EdgePolicy, "typeMatching">;
  group: string;
  /** Present only on the row that OPENS the group — the archive's own `<p>`
   *  under each `<h3>`. */
  groupDescription?: string;
  title: string;
  detail: string;
  refuses: string;
}[] = Object.freeze([
  {
    key: "allowSamePolarity",
    group: "Direction",
    groupDescription: "Which way data is allowed to run, and whether it may come back around.",
    title: "Wire two outputs, or two inputs",
    detail:
      "Off, a cable must join something that emits to something that receives — the arrowhead follows from the ports, not from which way you dragged.",
    refuses: "output → output",
  },
  {
    key: "allowCycles",
    group: "Direction",
    title: "Close a feedback loop",
    detail:
      "Off, a cable may not land on anything already upstream of where it started. Use a Loop region for deliberate feedback.",
    refuses: "A → B → A",
  },
  {
    key: "allowSelfConnection",
    group: "Direction",
    title: "Wire a Block to itself",
    detail: "A cable that leaves a Block's outlet and turns straight back into its own inlet.",
    refuses: "A → A",
  },
  {
    key: "allowCrossBoundary",
    group: "Boundaries",
    groupDescription: "Whether a Block is a black box — reachable only through the ports it shows you.",
    title: "Wire straight through a Block's wall",
    detail:
      "Off, a Block inside a box can only reach the outside through that box's own ports, so the picture on screen is the whole contract. On, any dot reaches any other and the cable takes the nearest frame that holds both ends.",
    refuses: "child of A → sibling of A",
  },
  {
    key: "allowHiddenPorts",
    group: "Boundaries",
    title: "Wire a hidden port",
    detail:
      "A port hidden in the current view keeps its identity and its anchor, but is normally not a landing target.",
    refuses: "a port you cannot see",
  },
  {
    key: "allowFanIn",
    group: "How many cables meet at one port",
    groupDescription:
      "One value read by two consumers is ordinary. Two producers writing one input is a question the picture cannot answer.",
    title: "Several cables into one input",
    detail:
      "Off, an input takes a single producer. Branch and Loop regions still choose between arms — that is not fan-in.",
    refuses: "A → C, B → C",
  },
  {
    key: "allowFanOut",
    group: "How many cables meet at one port",
    title: "Several cables out of one output",
    detail:
      "Off, an output feeds exactly one consumer, which forces an explicit copy or tee wherever a value is used twice.",
    refuses: "A → B, A → C",
  },
  {
    key: "allowDuplicates",
    group: "How many cables meet at one port",
    title: "A second copy of the same cable",
    detail: "Two cables joining the exact same pair of ports. There is nothing on screen that tells them apart.",
    refuses: "A.out → B.in, twice",
  },
]);

/** Ported from `InterfaceSettings.tsx:587-591`. */
const TYPE_MATCHING_LABELS: Readonly<Record<TypeMatching, { label: string; detail: string }>> = Object.freeze({
  off: { label: "Off", detail: "Types are documentation. Any port may meet any other." },
  lenient: { label: "Lenient", detail: "Declared types must agree. A port with no type is a wildcard." },
  strict: { label: "Strict", detail: "Both ends must declare a type, and the two must agree." },
});

function connectionsCategory(input: SettingsCategoriesInput): SettingsCategory {
  const { edgePolicy } = input;
  const preset = matchingEdgePolicyPreset(edgePolicy);
  const enforced = enforcedRuleCount(edgePolicy);

  const sections: SettingsSection[] = [
    {
      // Ported from `InterfaceSettings.tsx:616-656`.
      //
      // WHY the presets sit ABOVE the switches and the active one is DERIVED
      // rather than stored: the archive's own rule — a preset is a shortcut
      // into the same nine switches, never a second source of truth. Flip one
      // switch and the row honestly reads Custom instead of lying about which
      // preset is on. `matchingEdgePolicyPreset` is that derivation.
      // Ruling 3 (Zach, 2026-09-21): "have the connection validation setting in
      // the settings panel so you can switch between what level of linting you
      // want from whiteboard, where anything goes to like evalid code, etc."
      //
      // The four rungs, their labels and their summaries were already here —
      // this row has BEEN the scale since the port. What changed is that the
      // scale now means something at rest too: `src/scene/validationLevel.ts`
      // maps the same four ids onto which of the linter's rules run, and
      // `validationSummary` is the host reporting that back. So the row is
      // renamed from "Edge creation policy" (prevention only) to what it
      // actually governs — and no id, preset or stored key moves, because the
      // persisted record is unchanged.
      id: "edge-policy-preset",
      title: "Validation level",
      description:
        "How much the board checks your work — what it will let you wire, and how much it marks up at rest. Slide it all the way down for a plain whiteboard — any port to any port, nothing flagged — or all the way up so only edges that could exist in the running program are drawable at all.",
      control: {
        kind: "custom",
        render: (
          <div data-slot="edge-policy-presets" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Edge policy presets">
              {EDGE_POLICY_PRESETS.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant={item.id === preset ? "secondary" : "ghost"}
                  aria-pressed={item.id === preset}
                  data-slot="edge-policy-preset"
                  data-preset-id={item.id}
                  title={item.summary}
                  className="font-normal"
                  onClick={() => input.onEdgePolicyPreset(item.id)}
                >
                  {item.label}
                </Button>
              ))}
              <output
                data-slot="edge-policy-count"
                aria-label={`Enforcing ${enforced} of ${EDGE_POLICY_RULE_COUNT} rules`}
                className="text-muted-foreground ml-auto text-sm tabular-nums"
              >
                {enforced}/{EDGE_POLICY_RULE_COUNT}
              </output>
            </div>
            <p data-slot="edge-policy-summary" className="text-muted-foreground text-sm">
              {preset
                ? edgePolicyPreset(preset).summary
                : "Custom — these rules do not match a level. Pick one above to start over."}
            </p>
            {input.validationSummary === undefined ? null : (
              <p data-slot="validation-lint-summary" className="text-muted-foreground text-sm">
                {input.validationSummary}
              </p>
            )}
          </div>
        ),
      },
    },
  ];

  for (const row of EDGE_POLICY_ROWS) {
    const allowed = edgePolicy[row.key];
    sections.push({
      id: row.key,
      title: row.title,
      group: row.group,
      groupDescription: row.groupDescription,
      // The archive prints the live verdict under every switch
      // (`PolicyToggle`, `InterfaceSettings.tsx:577-580`): "Allowed", or the
      // concrete shape that is refused. Keeping it means the nine rows can be
      // read as a picture of what the board will accept, not as nine
      // independent yes/no questions.
      description: `${row.detail} ${allowed ? "Currently allowed." : `Currently refused: ${row.refuses}.`}`,
      control: {
        kind: "switch",
        checked: allowed,
        onCheckedChange: (checked) => input.onEdgePolicyChange({ [row.key]: checked } as Partial<EdgePolicy>),
      },
    });
  }

  sections.push({
    // Ported from `InterfaceSettings.tsx:712-737`.
    id: "type-matching",
    title: "Data types",
    group: "Data types",
    description:
      "Ports carry free text today — Pose, bytes, or nothing. Case and surrounding space are ignored, and any, object and * meet anything.",
    control: {
      kind: "radio",
      value: edgePolicy.typeMatching,
      options: TYPE_MATCHING_MODES.map((mode) => ({
        value: mode,
        label: TYPE_MATCHING_LABELS[mode].label,
        description: TYPE_MATCHING_LABELS[mode].detail,
      })),
      onValueChange: (value) => input.onEdgePolicyChange({ typeMatching: value as TypeMatching }),
    },
  });

  sections.push({
    id: "connections-storage",
    title: "Saved on this computer",
    control: {
      kind: "custom",
      render: savedHere(
        "This governs what you can draw from now on. Cables already on a board are never re-judged, so tightening the policy cannot break a board someone else authored.",
      ),
    },
  });

  return { id: SETTINGS_CATEGORY_IDS.connections, label: "Connections", group: OPTIONS_GROUP, icon: <Cable />, sections };
}

// ─────────────────── Hotkeys and aliases (was Tool aliases) ─────────────

function hotkeysCategory(input: SettingsCategoriesInput): SettingsCategory {
  const platform = input.shortcutPlatform ?? "other";
  const hotkeys = input.hotkeys ?? [];
  const sections: SettingsSection[] = [];

  if (hotkeys.length > 0) {
    sections.push({
      id: "hotkeys",
      title: "Keyboard shortcuts",
      group: "Hotkeys",
      // Said out loud rather than shipping a control that looks rebindable
      // and is not. The archive had no rebinding either; the difference is
      // that this page now admits it instead of being silent.
      description: "The keys this app binds. They are fixed — rebinding is not available yet.",
      control: {
        kind: "custom",
        render: (
          <dl data-slot="hotkey-list" className="flex flex-col gap-1">
            {hotkeys.map((hotkey) => (
              <div key={hotkey.id} data-slot="hotkey-row" data-hotkey-id={hotkey.id} className="flex items-baseline justify-between gap-4 text-sm">
                <dt>{hotkey.label}</dt>
                {/* Printed through the trunk's own `formatShortcut`, the same
                    routine the burger's shortcut column uses (`appMenu.ts:110`),
                    so this list cannot drift from the menu beside it. */}
                <dd className="text-muted-foreground shrink-0 font-mono text-xs">
                  {formatShortcut(hotkey.chord, platform)}
                </dd>
              </div>
            ))}
          </dl>
        ),
      },
    });
  }

  sections.push({
    // Ported from `InterfaceSettings.tsx:298-346`.
    id: "tool-aliases",
    title: "Tool aliases",
    group: "Aliases",
    description:
      "Give any searchable tool the names you use. An alias like @datatype opens Text without changing the tool's canonical name.",
    control: {
      kind: "custom",
      render: (
        <ToolAliasEditor items={input.aliasItems} aliases={input.aliases} onAliasesChange={input.onAliasesChange} />
      ),
    },
  });

  sections.push({
    id: "aliases-storage",
    title: "Saved on this computer",
    control: {
      kind: "custom",
      render: savedHere("Aliases are personal vocabulary, not board content — they enrich search for you only."),
    },
  });

  return { id: SETTINGS_CATEGORY_IDS.hotkeys, label: "Hotkeys and aliases", group: OPTIONS_GROUP, icon: <Keyboard />, sections };
}

/**
 * The five categories Zach asked for, in his order, plus the host's own
 * About block when it passes one.
 *
 * Pure: same input, same data. Nothing here reads storage, the DOM or a
 * canvas — a host holds the values and hands back the patches.
 */
export function buildSettingsCategories(input: SettingsCategoriesInput): SettingsCategory[] {
  const categories: SettingsCategory[] = [
    generalCategory(input),
    appearanceCategory(input),
    pointerCategory(input),
    connectionsCategory(input),
    hotkeysCategory(input),
  ];
  if (input.about !== undefined) {
    // WHY the defaults are applied here rather than demanded of the host: the
    // host owns About's CONTENT (its own product name and build string — see
    // the `about` field's doc comment, which is why it is a whole category and
    // not a ReactNode). Which nav heading it sits under and which glyph sits
    // beside it are chrome, and chrome belongs in the trunk. `??` not
    // overwrite: a host that genuinely wants its own icon or heading keeps it.
    categories.push({ icon: <Info />, ...input.about, group: input.about.group ?? "App" });
  }
  return categories;
}
