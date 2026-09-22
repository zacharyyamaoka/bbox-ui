import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import {
  buildSettingsCategories,
  SETTINGS_CATEGORY_IDS,
  type SettingsHotkey,
} from "./settingsCategories";
import { SettingsView, type SettingsPresentation } from "./settingsView";
import { DEFAULT_APPEARANCE_PREFERENCES, type AppearancePreferences } from "./appearancePreferences";
import { DEFAULT_GESTURE_SETTINGS, type GestureSettings } from "./gestureSettings";
import {
  DEFAULT_EDGE_POLICY,
  edgePolicyPreset,
  matchingEdgePolicyPreset,
  type EdgePolicy,
  type EdgePolicyPresetId,
} from "./edgePolicy";
// A story is a CONSUMER of the kits, not part of the components kit — which is
// why `components/layering.test.ts`'s import wall exempts `.stories.tsx` by
// name. Reaching into `scene/` here is the point: this harness stands in for
// `apps/systemsketch`, and a host is the layer that owns both kits.
import {
  LINT_RULE_TOTAL,
  enabledRuleCount,
  isValidationLevel,
  validationLevelSpec,
} from "../scene/validationLevel";
import { DEFAULT_INTERFACE_SCALE } from "./interfaceScale";
import { EMPTY_TOOL_ALIASES, type ToolAliasItem, type ToolAliases } from "./toolAliases";
import type { FileNavigationMode } from "./appSettings";

/**
 * The five settings categories Zach asked to port from the archived app on
 * 2026-09-19 — General, Appearance, Mouse and scrolling (was Canvas),
 * Connections, Hotkeys and aliases (was Tool aliases) — driven for real.
 *
 * ACCEPTANCE for lane `settings-pages`. `SettingsView.stories.tsx` and
 * `SettingsViewStockParts.stories.tsx` stay untouched: they pin the SHELL,
 * this file pins the CATEGORIES the shell is now given.
 */
const meta = {
  title: "Editor/Panels & Dialogs/SettingsCategories",
  tags: ["object:chrome", "lane:settings-pages"],
  component: SettingsView,
  args: { open: false, onOpenChange: fn(), presentation: "dialog" as const, categories: [] },
} satisfies Meta<typeof SettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

const PREFIX = "cat-settings";

/** A host's own tools — the kit never names one (`toolAliases.ts`). */
const TOOLS: readonly ToolAliasItem[] = [
  { id: "block", label: "Block", detail: "Toolbar tool" },
  { id: "text", label: "Text", detail: "Toolbar tool" },
  { id: "arrow-elbow", label: "Elbow arrow", detail: "Toolbar tool" },
];

/** A host's own chords — the same shape `appMenu.ts`'s File rows carry. */
const HOTKEYS: readonly SettingsHotkey[] = [
  { id: "new", label: "New", chord: "mod+n" },
  { id: "save-as", label: "Save As…", chord: "mod+shift+s" },
  { id: "rename", label: "Rename", chord: "f2" },
];

interface Spies {
  onFileNavigationChange?: (mode: FileNavigationMode) => void;
  onEdgePolicyChange?: (patch: Partial<EdgePolicy>) => void;
  onInterfaceScaleChange?: (percent: number) => void;
  onGesturesChange?: (patch: Partial<GestureSettings>) => void;
  onAliasesChange?: (next: ToolAliases) => void;
}

/** What the host reports back about the chosen level — the linter half of
 *  ruling 3, which `scene/validationLevel.ts` owns and this file only prints. */
function validationLintSummary(policy: EdgePolicy): string {
  const level = matchingEdgePolicyPreset(policy);
  if (level === null || !isValidationLevel(level)) return "Custom — these switches match no level.";
  const spec = validationLevelSpec(level);
  return `At ${spec.label.toLowerCase()}, ${enabledRuleCount(level)} of ${LINT_RULE_TOTAL} checks mark up a board at rest.`;
}

/**
 * A real host: it owns every value, applies every patch, and passes the
 * result straight back in — exactly what `apps/systemsketch` does around its
 * own storage. A story that kept the values frozen would prove the labels
 * render and nothing about whether a change lands.
 */
function Harness({ initial = "dialog", spies = {} }: { initial?: SettingsPresentation; spies?: Spies }) {
  const [open, setOpen] = useState(true);
  const [fileNavigation, setFileNavigation] = useState<FileNavigationMode>("app");
  const [presentation, setPresentation] = useState<SettingsPresentation>(initial);
  const [allowAnyPath, setAllowAnyPath] = useState(true);
  const [interfaceScalePercent, setInterfaceScalePercent] = useState(DEFAULT_INTERFACE_SCALE);
  const [appearance, setAppearance] = useState<AppearancePreferences>({ ...DEFAULT_APPEARANCE_PREFERENCES });
  const [gestures, setGestures] = useState<GestureSettings>({
    ...DEFAULT_GESTURE_SETTINGS,
    bindings: { ...DEFAULT_GESTURE_SETTINGS.bindings },
  });
  const [edgePolicy, setEdgePolicy] = useState<EdgePolicy>({ ...DEFAULT_EDGE_POLICY });
  const [aliases, setAliases] = useState<ToolAliases>(EMPTY_TOOL_ALIASES);

  const categories = buildSettingsCategories({
    fileNavigation,
    onFileNavigationChange: (mode) => {
      spies.onFileNavigationChange?.(mode);
      setFileNavigation(mode);
    },
    settingsPresentation: presentation,
    onSettingsPresentationChange: setPresentation,
    allowAnyPath,
    onAllowAnyPathChange: setAllowAnyPath,
    interfaceScalePercent,
    onInterfaceScaleChange: (percent) => {
      spies.onInterfaceScaleChange?.(percent);
      setInterfaceScalePercent(percent);
    },
    appearance,
    onAppearanceChange: (patch) => setAppearance((current) => ({ ...current, ...patch })),
    gestures,
    onGesturesChange: (patch) => {
      spies.onGesturesChange?.(patch);
      setGestures((current) => ({ ...current, ...patch }));
    },
    edgePolicy,
    onEdgePolicyChange: (patch) => {
      spies.onEdgePolicyChange?.(patch);
      setEdgePolicy((current) => ({ ...current, ...patch }));
    },
    onEdgePolicyPreset: (id: EdgePolicyPresetId) => setEdgePolicy({ ...edgePolicyPreset(id).policy }),
    // The same one line `apps/systemsketch/src/chrome/ShareMenu/appSettings.tsx`
    // computes — the level's MEANING crossing from `scene/` as a string,
    // because a component may not import the scene kit.
    validationSummary: validationLintSummary(edgePolicy),
    hotkeys: HOTKEYS,
    shortcutPlatform: "other",
    aliasItems: TOOLS,
    aliases,
    onAliasesChange: (next) => {
      spies.onAliasesChange?.(next);
      setAliases(next);
    },
    about: {
      id: "about",
      label: "About",
      sections: [{ id: "build", title: "SystemSketch", control: { kind: "custom", render: <p>bbox-ui + stock tldraw</p> } }],
    },
  });

  return (
    <SettingsView
      open={open}
      onOpenChange={setOpen}
      presentation={presentation}
      categories={categories}
      // What `apps/systemsketch` mounts since 2026-09-22 — this harness exists
      // to be the real host, so it takes the real host's one line of
      // configuration. With an empty query the tree is identical to before, so
      // every assertion below is unaffected; it is the CAPTURES that need this,
      // because a screenshot of a settings panel without the search box is not
      // a screenshot of the thing that ships.
      searchable
      testIdPrefix={PREFIX}
    />
  );
}

const body = () => within(document.body);
const view = () => document.querySelector<HTMLElement>(`[data-testid="${PREFIX}"][data-slot="settings-view"]`);
const nav = () => view()!.querySelector<HTMLElement>('[data-slot="settings-nav"]')!;
const section = (id: string) => view()!.querySelector<HTMLElement>(`[data-slot="settings-section"][data-section-id="${id}"]`);

async function openCategory(label: string) {
  await userEvent.click(within(nav()).getByRole("button", { name: label }));
  await waitFor(() => expect(nav().querySelector('[aria-current="page"]')).toHaveTextContent(label));
}

/** Every category is reachable from the nav and carries its own settings. */
export const AllFiveCategories: Story = {
  render: () => <Harness />,
  play: async () => {
    const dialog = await body().findByRole("dialog");
    await expect(dialog).toHaveAttribute("data-slot", "settings-view");

    // Zach's five, in his order, plus the About this app already had.
    const labels = [...nav().querySelectorAll("button")].map((button) => button.textContent);
    await expect(labels).toEqual([
      "General",
      "Appearance",
      "Mouse and scrolling",
      "Connections",
      "Hotkeys and aliases",
      "About",
    ]);
    // "If I didn't list it here don't port it" — the archive's three other
    // open categories must NOT have come along.
    for (const gone of ["Interface", "Menu lab", "Pill lab"]) {
      await expect(within(nav()).queryByRole("button", { name: gone })).toBeNull();
    }

    // General keeps the two settings this app already had, and gains the
    // archive's own file-fence switch.
    await expect(section("file-navigation")).not.toBeNull();
    await expect(section("settings-presentation")).not.toBeNull();
    await expect(section("allow-any-path")).not.toBeNull();

    await openCategory("Appearance");
    await expect(section("interface-scale")).not.toBeNull();
    await expect(section("zoom-buttons")).not.toBeNull();

    await openCategory("Mouse and scrolling");
    await expect(section("paste-under-cursor")).not.toBeNull();
    await expect(section("direct-wheel-zoom")).not.toBeNull();
    await expect(section("wheel-binding-ctrlWheelUp")).not.toBeNull();
    await expect(section("pan-speed")).not.toBeNull();

    await openCategory("Connections");
    await expect(section("edge-policy-preset")).not.toBeNull();
    await expect(section("allowFanIn")).not.toBeNull();
    await expect(section("type-matching")).not.toBeNull();
    // The archive's four teaching groups survive the port.
    const groups = [...view()!.querySelectorAll('[data-slot="settings-group"]')].map((node) => node.textContent);
    await expect(groups).toEqual(["Direction", "Boundaries", "How many cables meet at one port", "Data types"]);

    await openCategory("Hotkeys and aliases");
    await expect(section("hotkeys")).not.toBeNull();
    await expect(section("tool-aliases")).not.toBeNull();
    // The name is honest: real chords, printed through the same routine the
    // burger's shortcut column uses.
    await expect(within(section("hotkeys")!).getByText("Ctrl + ⇧ + S")).toBeInTheDocument();
    await expect(within(section("hotkeys")!).getByText("F2")).toBeInTheDocument();
  },
};

/** Connections: a switch reaches the host by its own key, and the derived
 *  preset row stops claiming a preset the moment one rule is flipped. */
export const FlippingAPermissionReachesTheHost: Story = {
  render: () => {
    const onEdgePolicyChange = fn();
    return <Harness spies={{ onEdgePolicyChange }} />;
  },
  play: async ({ canvasElement: _canvasElement }) => {
    await body().findByRole("dialog");
    await openCategory("Connections");

    const presets = section("edge-policy-preset")!;
    await expect(within(presets).getByRole("button", { pressed: true })).toHaveTextContent("Guided");
    await expect(presets.querySelector('[data-slot="edge-policy-count"]')).toHaveTextContent("5/9");

    const fanIn = section("allowFanIn")!;
    const toggle = within(fanIn).getByRole("switch");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(fanIn).toHaveTextContent("Currently allowed.");

    await userEvent.click(toggle);
    await waitFor(() => expect(within(section("allowFanIn")!).getByRole("switch")).toHaveAttribute("aria-checked", "false"));
    // The live verdict follows the switch — the archive's own "Refused: …".
    await expect(section("allowFanIn")).toHaveTextContent("Currently refused: A → C, B → C.");
    // One more rule enforced, and no preset matches any more.
    await expect(section("edge-policy-preset")!.querySelector('[data-slot="edge-policy-count"]')).toHaveTextContent("6/9");
    await expect(section("edge-policy-preset")).toHaveTextContent("Custom —");
    await expect(within(section("edge-policy-preset")!).queryByRole("button", { pressed: true })).toBeNull();

    // A preset puts every switch back in one click.
    await userEvent.click(within(section("edge-policy-preset")!).getByRole("button", { name: "Whiteboard" }));
    await waitFor(() =>
      expect(section("edge-policy-preset")!.querySelector('[data-slot="edge-policy-count"]')).toHaveTextContent("0/9"),
    );
    await expect(within(section("allowFanIn")!).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  },
};

/**
 * Connections: the level is a SCALE, and moving it changes how much the board
 * is linted at rest — not only what may be drawn.
 *
 * Zach, ruling 3: "have the connection validation setting in the settings panel
 * so you can switch between what level of linting you want from whiteboard,
 * where anything goes to like evalid code, etc." Every number asserted below
 * comes from `scene/validationLevel.ts`'s own exports, never typed in.
 */
export const ValidationLevelDrivesTheLinterToo: Story = {
  render: () => <Harness />,
  play: async () => {
    await body().findByRole("dialog");
    await openCategory("Connections");

    const row = () => section("edge-policy-preset")!;
    await expect(row()).toHaveTextContent("Validation level");

    // The shipped default rung, and the linting it runs.
    await expect(within(row()).getByRole("button", { pressed: true })).toHaveTextContent("Guided");
    await expect(row().querySelector('[data-slot="validation-lint-summary"]')).toHaveTextContent(
      `${enabledRuleCount("guided")} of ${LINT_RULE_TOTAL} checks`,
    );

    // All the way down: anything goes, and the linter follows it down.
    await userEvent.click(within(row()).getByRole("button", { name: "Whiteboard" }));
    await waitFor(() =>
      expect(row().querySelector('[data-slot="validation-lint-summary"]')).toHaveTextContent(
        `${enabledRuleCount("whiteboard")} of ${LINT_RULE_TOTAL} checks`,
      ),
    );
    await expect(row().querySelector('[data-slot="edge-policy-count"]')).toHaveTextContent("0/9");

    // All the way up: every check on, proved against the level's own spec.
    await userEvent.click(within(row()).getByRole("button", { name: "Strict" }));
    await waitFor(() =>
      expect(row().querySelector('[data-slot="validation-lint-summary"]')).toHaveTextContent(
        `${enabledRuleCount("strict")} of ${LINT_RULE_TOTAL} checks`,
      ),
    );
    expect(enabledRuleCount("strict")).toBe(LINT_RULE_TOTAL);
    expect(enabledRuleCount("whiteboard")).toBeLessThan(enabledRuleCount("guided"));

    // Hand-flipping one switch leaves no level — and the linting line says so
    // rather than claiming a rung that is no longer selected.
    await userEvent.click(within(section("allowFanOut")!).getByRole("switch"));
    await waitFor(() => expect(row()).toHaveTextContent("Custom —"));
    await expect(row().querySelector('[data-slot="validation-lint-summary"]')).toHaveTextContent("match no level");
  },
};

/** Appearance: the interface scale Zach asked to move here, driven three
 *  ways — the slider itself, a preset, and the reset. */
export const InterfaceScaleLivesInAppearance: Story = {
  render: () => {
    const onInterfaceScaleChange = fn();
    return <Harness spies={{ onInterfaceScaleChange }} />;
  },
  play: async () => {
    await body().findByRole("dialog");
    await openCategory("Appearance");

    const scale = section("interface-scale")!;
    const readout = scale.querySelector('[data-slot="settings-slider-value"]')!;
    await expect(readout).toHaveTextContent("100%");
    // Nothing to reset to while it is already the default.
    await expect(scale.querySelector('[data-slot="settings-slider-reset"]')).toBeDisabled();

    // The stock Slider's own control: Base UI puts a real `input[type=range]`
    // inside the thumb, so a keyboard step is the honest gesture to drive.
    // `findBy*` first: Base UI keeps a thumb `visibility: hidden` — and so
    // out of the accessibility tree — until it has measured the track.
    const range = await within(scale).findByRole("slider");
    range.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(scale.querySelector('[data-slot="settings-slider-value"]')).toHaveTextContent("105%"));

    // A preset is one click, and reads as pressed rather than as a radio.
    await userEvent.click(scale.querySelector('[data-preset-value="125"]')!);
    await waitFor(() => expect(scale.querySelector('[data-slot="settings-slider-value"]')).toHaveTextContent("125%"));
    await expect(scale.querySelector('[data-preset-value="125"]')).toHaveAttribute("aria-pressed", "true");
    await expect(scale.querySelector('[data-preset-value="100"]')).toHaveAttribute("aria-pressed", "false");

    const reset = scale.querySelector<HTMLButtonElement>('[data-slot="settings-slider-reset"]')!;
    await expect(reset).toBeEnabled();
    await expect(reset).toHaveTextContent("Reset to 100%");
    await userEvent.click(reset);
    await waitFor(() => expect(scale.querySelector('[data-slot="settings-slider-value"]')).toHaveTextContent("100%"));
  },
};

/** Mouse and scrolling: the wheel half that is not in charge is hidden, not
 *  merely greyed — the archive's own gate, and the reason the category is
 *  named for the pointer rather than for a keyboard it does not have. */
export const DirectWheelZoomSwapsTheLiveHalf: Story = {
  render: () => <Harness />,
  play: async () => {
    await body().findByRole("dialog");
    await openCategory("Mouse and scrolling");

    // Stock contract first: four rebindable wheel gestures and two speeds.
    await expect(section("wheel-binding-wheelDown")).not.toBeNull();
    await expect(section("pan-speed")).not.toBeNull();
    await expect(section("wheel-zoom-sensitivity")).toBeNull();

    // The exact-value box Zach asked for — a drag cannot hit 137%.
    const exact = section("pan-speed")!.querySelector<HTMLInputElement>('[data-slot="settings-slider-input"]')!;
    await userEvent.clear(exact);
    await userEvent.type(exact, "137{Enter}");
    await waitFor(() =>
      expect(section("pan-speed")!.querySelector('[data-slot="settings-slider-value"]')).toHaveTextContent("137%"),
    );

    // BOTH conventions are offered by name (ruling 2, 2026-09-21) — this row
    // was a bare toggle until then, and a toggle frames one convention as the
    // default and the other as the deviation. Addressed the same way the
    // `settings-presentation` radio already is, by its option value.
    const wheel = section("direct-wheel-zoom")!;
    await expect(wheel.querySelectorAll('[role="radio"]')).toHaveLength(2);
    await expect(wheel.querySelector('[role="radio"][data-option-value="pan"]')).not.toBeNull();
    await expect(wheel.querySelector('[role="radio"][data-option-value="zoom"]')).not.toBeNull();

    await userEvent.click(wheel.querySelector('[role="radio"][data-option-value="zoom"]')!);
    await waitFor(() => expect(section("wheel-zoom-sensitivity")).not.toBeNull());
    // The half that no longer owns the wheel is gone, not inert.
    await expect(section("wheel-binding-wheelDown")).toBeNull();
    await expect(section("pan-speed")).toBeNull();
    await expect(section("scroll-down-zooms-in")).not.toBeNull();
    await expect(section("modifier-wheel-zooms-oppositely")).not.toBeNull();

    // And back — the choice is a scale you can walk either way, not a latch.
    await userEvent.click(section("direct-wheel-zoom")!.querySelector('[role="radio"][data-option-value="pan"]')!);
    await waitFor(() => expect(section("wheel-binding-wheelDown")).not.toBeNull());
    await expect(section("wheel-zoom-sensitivity")).toBeNull();
  },
};

/** Hotkeys and aliases: the alias half, added, refused and removed. */
export const AliasesAddRefuseAndRemove: Story = {
  render: () => {
    const onAliasesChange = fn();
    return <Harness spies={{ onAliasesChange }} />;
  },
  play: async () => {
    await body().findByRole("dialog");
    await openCategory("Hotkeys and aliases");

    const editor = section("tool-aliases")!;
    const row = editor.querySelector<HTMLElement>('[data-tool-id="text"]')!;
    await expect(row).toHaveTextContent("No custom aliases");

    const input = row.querySelector<HTMLInputElement>('[data-slot="tool-alias-input"]')!;
    await userEvent.type(input, "@datatype");
    await userEvent.click(row.querySelector('[data-slot="tool-alias-add"]')!);
    await waitFor(() =>
      expect(editor.querySelector('[data-tool-id="text"] [data-alias="@datatype"]')).toBeInTheDocument(),
    );
    // The handle is kept intact — no case folding, no stripped punctuation.
    await expect(editor.querySelector('[data-tool-id="text"] [data-alias="@datatype"]')).toHaveTextContent("@datatype");

    // A case-insensitive duplicate is refused, and says which rule refused it.
    const again = editor.querySelector<HTMLInputElement>('[data-tool-id="text"] [data-slot="tool-alias-input"]')!;
    await userEvent.type(again, "@DataType");
    await userEvent.click(editor.querySelector('[data-tool-id="text"] [data-slot="tool-alias-add"]')!);
    const message = await within(editor).findByRole("status");
    await expect(message).toHaveTextContent("@DataType is already an alias for Text.");
    await expect(editor.querySelectorAll('[data-tool-id="text"] [data-slot="tool-alias-chip"]')).toHaveLength(1);

    // The search matches a tool's own name OR an alias already on it.
    const search = editor.querySelector<HTMLInputElement>('[data-slot="tool-alias-search"]')!;
    await userEvent.type(search, "datatype");
    await waitFor(() => expect(editor.querySelectorAll('[data-slot="tool-alias-row"]')).toHaveLength(1));
    await expect(editor.querySelector('[data-slot="tool-alias-row"]')).toHaveAttribute("data-tool-id", "text");

    await userEvent.clear(search);
    await waitFor(() => expect(editor.querySelectorAll('[data-slot="tool-alias-row"]')).toHaveLength(3));

    await userEvent.click(within(editor).getByRole("button", { name: "Remove @datatype from Text" }));
    await waitFor(() => expect(editor.querySelector('[data-tool-id="text"] [data-alias="@datatype"]')).toBeNull());
  },
};

/** The same five categories as a full-window page, still switchable. */
export const AsAPage: Story = {
  render: () => <Harness initial="page" />,
  play: async () => {
    const page = await body().findByRole("dialog");
    await expect(page).toHaveAttribute("data-presentation", "page");
    const rect = page.getBoundingClientRect();
    await expect(Math.abs(rect.width - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(Math.abs(rect.height - window.innerHeight)).toBeLessThanOrEqual(1);

    // Every category still resolves in the page container, not just in the
    // dialog one — the nav and the section pane are the same tree.
    await openCategory("Connections");
    await expect(section("allowCycles")).not.toBeNull();
    await openCategory("Appearance");
    await expect(section("interface-scale")).not.toBeNull();

    // Switching back to a dialog re-presents the SAME open category.
    await openCategory("General");
    await userEvent.click(
      section("settings-presentation")!.querySelector('[role="radio"][data-option-value="dialog"]')!,
    );
    await waitFor(() => expect(view()).toHaveAttribute("data-presentation", "dialog"));
    await expect(nav().querySelector('[aria-current="page"]')).toHaveTextContent("General");
    await expect(view()!.getBoundingClientRect().width).toBeLessThan(window.innerWidth);
  },
};

/** `SETTINGS_CATEGORY_IDS` is the stable handle a host opens a category by. */
export const CategoryIdsAreStable: Story = {
  render: () => <Harness />,
  play: async () => {
    await body().findByRole("dialog");
    await expect(Object.values(SETTINGS_CATEGORY_IDS)).toEqual([
      "general",
      "appearance",
      "pointer",
      "connections",
      "hotkeys",
    ]);
  },
};
