// src/editor/settingsInventory.test.ts — the full list of settings this kit
// offers, pinned.
//
// WHY this exists: the 2026-09-22 layout pass (Zach: "Generally I feel the
// entire settings thing is really unprofessionally done") rebuilt the SHELL —
// the window's size rules, the nav, the scrollers and the row — around the
// same data. The one way a layout pass silently causes damage is by dropping
// a row: a section that stops rendering looks exactly like a section that was
// never there, and no visual review catches the absence of something.
//
// So the list is written down. It is derived from `buildSettingsCategories`
// itself, not retyped from the source, so it cannot drift from what a host
// actually gets — and any future change to WHICH settings exist has to come
// here and say so out loud.
//
// This is deliberately NOT an FR mirror (`.claude/feedback.md`: the code is
// the living specification). It records one fact the code cannot state about
// itself — "nothing disappeared" — and nothing else. It asserts ids, not
// labels or descriptions, so re-wording a setting stays a one-file change.
import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE_PREFERENCES } from "./appearancePreferences";
import { DEFAULT_EDGE_POLICY, edgePolicyPreset, type EdgePolicyPresetId } from "./edgePolicy";
import { DEFAULT_GESTURE_SETTINGS } from "./gestureSettings";
import { DEFAULT_INTERFACE_SCALE } from "./interfaceScale";
import { SETTINGS_CATEGORY_IDS, buildSettingsCategories, type SettingsCategoriesInput } from "./settingsCategories";
import { EMPTY_TOOL_ALIASES } from "./toolAliases";

const noop = () => {};

function input(overrides: Partial<SettingsCategoriesInput> = {}): SettingsCategoriesInput {
  return {
    fileNavigation: "app",
    onFileNavigationChange: noop,
    settingsPresentation: "dialog",
    onSettingsPresentationChange: noop,
    allowAnyPath: true,
    onAllowAnyPathChange: noop,
    interfaceScalePercent: DEFAULT_INTERFACE_SCALE,
    onInterfaceScaleChange: noop,
    appearance: { ...DEFAULT_APPEARANCE_PREFERENCES },
    onAppearanceChange: noop,
    gestures: { ...DEFAULT_GESTURE_SETTINGS, bindings: { ...DEFAULT_GESTURE_SETTINGS.bindings } },
    onGesturesChange: noop,
    edgePolicy: { ...DEFAULT_EDGE_POLICY },
    onEdgePolicyChange: noop,
    onEdgePolicyPreset: (_id: EdgePolicyPresetId) => {},
    validationSummary: "At structural, 4 of 7 checks mark up a board at rest.",
    hotkeys: [
      { id: "new", label: "New", chord: "mod+n" },
      { id: "save-as", label: "Save As…", chord: "mod+shift+s" },
    ],
    shortcutPlatform: "other",
    aliasItems: [{ id: "block", label: "Block", detail: "Toolbar tool" }],
    aliases: EMPTY_TOOL_ALIASES,
    onAliasesChange: noop,
    about: {
      id: "about",
      label: "About",
      sections: [{ id: "build", title: "SystemSketch", control: { kind: "custom", render: "bbox-ui + stock tldraw" } }],
    },
    ...overrides,
  };
}

/** Every section id a host gets, category by category, as `<cat>/<section>`. */
function inventory(over: Partial<SettingsCategoriesInput> = {}): string[] {
  return buildSettingsCategories(input(over)).flatMap((cat) => cat.sections.map((s) => `${cat.id}/${s.id}`));
}

/**
 * The `directWheelZoom: false` branch — the one in Zach's screenshot, and the
 * default. 29 settings.
 */
const WHEEL_BINDINGS_BRANCH = [
  "general/file-navigation",
  "general/settings-presentation",
  "general/allow-any-path",
  "appearance/interface-scale",
  "appearance/zoom-buttons",
  "appearance/appearance-storage",
  "pointer/paste-under-cursor",
  "pointer/direct-wheel-zoom",
  "pointer/wheel-binding-wheelDown",
  "pointer/wheel-binding-wheelUp",
  "pointer/wheel-binding-ctrlWheelDown",
  "pointer/wheel-binding-ctrlWheelUp",
  "pointer/pan-speed",
  "pointer/zoom-speed",
  "connections/edge-policy-preset",
  "connections/allowSamePolarity",
  "connections/allowCycles",
  "connections/allowSelfConnection",
  "connections/allowCrossBoundary",
  "connections/allowHiddenPorts",
  "connections/allowFanIn",
  "connections/allowFanOut",
  "connections/allowDuplicates",
  "connections/type-matching",
  "connections/connections-storage",
  "hotkeys/hotkeys",
  "hotkeys/tool-aliases",
  "hotkeys/aliases-storage",
  "about/build",
];

/** The other half of the archive's gate: direct wheel zoom replaces the four
 *  binding rows and the two speed sliders with its own three. */
const DIRECT_ZOOM_BRANCH = [
  "pointer/scroll-down-zooms-in",
  "pointer/modifier-wheel-zooms-oppositely",
  "pointer/wheel-zoom-sensitivity",
];

describe("the settings a host gets", () => {
  it("is exactly this list, in this order, on the default wheel branch", () => {
    expect(inventory()).toEqual(WHEEL_BINDINGS_BRANCH);
  });

  it("swaps only the wheel half when direct wheel zoom is on", () => {
    const direct = inventory({
      appearance: { ...DEFAULT_APPEARANCE_PREFERENCES, directWheelZoom: true },
    });
    // Everything outside the pointer category is untouched by the gate.
    const outside = (list: string[]) => list.filter((id) => !id.startsWith("pointer/"));
    expect(outside(direct)).toEqual(outside(WHEEL_BINDINGS_BRANCH));
    expect(direct.filter((id) => id.startsWith("pointer/"))).toEqual([
      "pointer/paste-under-cursor",
      "pointer/direct-wheel-zoom",
      ...DIRECT_ZOOM_BRANCH,
    ]);
  });

  it("counts 29 rows on the default branch and 26 on the direct-zoom one", () => {
    // 29 - 6 + 3: the gate removes the four wheel-binding selects and the two
    // speed sliders, and adds its own three.
    expect(inventory()).toHaveLength(29);
    expect(inventory({ appearance: { ...DEFAULT_APPEARANCE_PREFERENCES, directWheelZoom: true } })).toHaveLength(26);
  });

  it("drops only the rows whose host support is absent", () => {
    // `allowAnyPath` omitted → no fence, so no row. The archive's dispatcher
    // reading: a host with no such feature gets no disabled control.
    const withoutFence = inventory({ allowAnyPath: undefined, onAllowAnyPathChange: undefined });
    expect(withoutFence).not.toContain("general/allow-any-path");
    expect(withoutFence).toHaveLength(WHEEL_BINDINGS_BRANCH.length - 1);

    // No hotkeys passed → the read-only chord list is absent, aliases stay.
    const withoutHotkeys = inventory({ hotkeys: [] });
    expect(withoutHotkeys).not.toContain("hotkeys/hotkeys");
    expect(withoutHotkeys).toContain("hotkeys/tool-aliases");

    // No About passed → the host's own category is absent, the five remain.
    const withoutAbout = buildSettingsCategories(input({ about: undefined }));
    expect(withoutAbout.map((c) => c.id)).toEqual([
      SETTINGS_CATEGORY_IDS.general,
      SETTINGS_CATEGORY_IDS.appearance,
      SETTINGS_CATEGORY_IDS.pointer,
      SETTINGS_CATEGORY_IDS.connections,
      SETTINGS_CATEGORY_IDS.hotkeys,
    ]);
  });

  it("gives every category an icon and a nav group", () => {
    // Zach, 2026-09-22: "All the section son the left navigator should have
    // icons". The prop existed before this date and every category ignored it,
    // which is the whole of that complaint — so it is pinned here rather than
    // left to a visual check that already passed once while 0 of 6 had one.
    for (const cat of buildSettingsCategories(input())) {
      expect(cat.icon, `${cat.id} has no icon`).toBeTruthy();
      expect(cat.group, `${cat.id} has no nav group`).toBeTruthy();
    }
    expect(buildSettingsCategories(input()).map((c) => c.group)).toEqual([
      "Options", "Options", "Options", "Options", "Options", "App",
    ]);
  });

  it("lets a host keep its own About icon and heading", () => {
    const categories = buildSettingsCategories(
      input({
        about: {
          id: "about",
          label: "About",
          group: "Product",
          icon: "★",
          sections: [{ id: "build", title: "X", control: { kind: "custom", render: "x" } }],
        },
      }),
    );
    const about = categories.at(-1)!;
    expect(about.group).toBe("Product");
    expect(about.icon).toBe("★");
  });

  it("every control kind in the list is one the shell can render", () => {
    const kinds = new Set(
      buildSettingsCategories(input()).flatMap((c) => c.sections.map((s) => s.control.kind)),
    );
    expect([...kinds].sort()).toEqual(["custom", "radio", "select", "slider", "switch"]);
  });

  it("the interface-scale slider still writes on release, not during the drag", () => {
    // Zach, 2026-09-21 — the single easiest thing to break by accident in a
    // layout pass, because it is a property of the DATA, not of the shell.
    const appearance = buildSettingsCategories(input()).find((c) => c.id === "appearance")!;
    const scale = appearance.sections.find((s) => s.id === "interface-scale")!;
    expect(scale.control.kind).toBe("slider");
    expect(scale.control.kind === "slider" && scale.control.commit).toBe("exit");
  });

  it("a preset still replaces the whole policy", () => {
    // Guards the one `custom` section the layout pass touches the container of.
    expect(edgePolicyPreset("whiteboard").policy).toBeTruthy();
  });
});
