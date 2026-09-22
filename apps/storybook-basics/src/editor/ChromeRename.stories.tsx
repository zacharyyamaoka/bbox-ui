import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ChromeBar, type ChromeBarProps } from "./chromeBar";
import { InlineRename } from "../components/inlineRename";

/**
 * Rename in place — the field takes EXACTLY the box the title had, and no
 * control hint appears under it.
 *
 * ACCEPTANCE committed by the planning lane of
 * docs/CHROME-FILES-SETTINGS-PLAN.md before any builder; off-limits to lane
 * `chrome-rename-burger`. Zach, 2026-09-19, on screenshot
 * `Pasted image 20260919135024.png` (the field in edit mode, "Press Enter to
 * rename, Escape to cancel" beneath it, the field lifted to make room): "I
 * don't like how this textbox moves up when I click it and the hint displays
 * benith it. please don't show the control hints".
 *
 * Measured, never presence-asserted: every rect below is
 * `getBoundingClientRect()`, compared at ±1px.
 */
const PREFIX = "rename-bar";

const meta = {
  title: "Editor/Menus & Bars/ChromeBar/Rename In Place",
  tags: ["object:chrome", "lane:chrome-files-settings"],
  component: ChromeBar,
  // Every story renders its own stateful harness; these args exist only so
  // `StoryObj<typeof meta>` does not demand a full prop set per story.
  args: {
    menu: { id: "app", label: "SystemSketch", groups: [] },
    history: { canGoBack: false, canGoForward: false, onBack: fn(), onForward: fn() },
    identity: { title: "Untitled board", statusTone: "ok", statusLabel: "All changes saved" },
    rename: { active: false, onBegin: fn(), onCommit: fn(), onCancel: fn() },
    crumbs: [],
    depth: 0,
    onReturnToRoot: fn(),
    onJumpToLevel: fn(),
    fileActions: [],
    testIdPrefix: PREFIX,
  },
} satisfies Meta<typeof ChromeBar>;

export default meta;
type Story = StoryObj<typeof meta>;

function RenameInPlace({ initial }: { initial: string }) {
  const [title, setTitle] = useState(initial);
  const [active, setActive] = useState(false);
  const props: ChromeBarProps = {
    menu: { id: "app", label: "SystemSketch", groups: [{ id: "g", items: [{ id: "noop", label: "Nothing", run: fn() }] }] },
    history: { canGoBack: false, canGoForward: false, onBack: fn(), onForward: fn() },
    identity: { title, statusTone: "ok", statusLabel: "All changes saved" },
    rename: {
      active,
      onBegin: () => setActive(true),
      onCommit: (next) => {
        setTitle(next);
        setActive(false);
      },
      onCancel: () => setActive(false),
    },
    crumbs: [],
    depth: 0,
    onReturnToRoot: fn(),
    onJumpToLevel: fn(),
    fileActions: [{ id: "rename", label: "Rename", shortcut: "F2", run: () => setActive(true) }],
    testIdPrefix: PREFIX,
  };
  return (
    <div className="p-6">
      <ChromeBar {...props} />
    </div>
  );
}

type Rect = Pick<DOMRect, "left" | "top" | "width" | "height">;
const rectOf = (element: Element): Rect => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

async function expectSameBox(actual: Rect, expected: Rect, what: string) {
  for (const key of ["left", "top", "width", "height"] as const) {
    await expect(Math.abs(actual[key] - expected[key]), `${what}: ${key} ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(1);
  }
}

const HINT = /Press Enter|Escape to cancel/;

/** Double-click the title: the field lands on the title's own box, the bar
 *  does not move or resize, and no hint text exists anywhere. */
export const FieldTakesTheTitlesBox: Story = {
  render: () => <RenameInPlace initial="Untitled board" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = await canvas.findByTestId(`${PREFIX}-title`);
    const bar = canvas.getByTestId(PREFIX);
    const titleBox = rectOf(title);
    const barBox = rectOf(bar);

    await userEvent.dblClick(title);
    const input = await canvas.findByRole("textbox", { name: "Rename Untitled board" });
    await expect(input).toHaveFocus();
    await expectSameBox(rectOf(input), titleBox, "the field vs the title it replaced");
    await expectSameBox(rectOf(bar), barBox, "the bar before vs during the rename");
    await expect(document.body.textContent ?? "").not.toMatch(HINT);

    await userEvent.clear(input);
    await userEvent.type(input, "Robot arm{Enter}");
    await waitFor(() => expect(canvas.getByTestId(`${PREFIX}-title`)).toHaveTextContent("Robot arm"));
  },
};

/** A refused name still says why — but out of flow: nothing shifts. */
export const AnErrorDoesNotMoveAnything: Story = {
  render: () => <RenameInPlace initial="Untitled board" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = await canvas.findByTestId(`${PREFIX}-title`);
    const bar = canvas.getByTestId(PREFIX);
    const titleBox = rectOf(title);
    const barBox = rectOf(bar);

    await userEvent.dblClick(title);
    const input = await canvas.findByRole("textbox", { name: "Rename Untitled board" });
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    const alert = await within(document.body).findByRole("alert");
    await expect((alert.textContent ?? "").trim().length).toBeGreaterThan(0);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expectSameBox(rectOf(input), titleBox, "the field with an error showing");
    await expectSameBox(rectOf(bar), barBox, "the bar with an error showing");
    await expect(document.body.textContent ?? "").not.toMatch(HINT);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.getByTestId(`${PREFIX}-title`)).toHaveTextContent("Untitled board"));
  },
};

/** The same rule for the field on its own (frames rows, the branch chip):
 *  its box is the input's box — nothing rendered below it. */
export const StandaloneFieldIsJustTheField: Story = {
  render: () => (
    <div className="p-6">
      <InlineRename value="Draft 1" size="bar" onCommit={fn()} onCancel={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox");
    const root = canvasElement.querySelector('[data-slot="inline-rename"]')!;
    await expectSameBox(rectOf(root), rectOf(input), "the field's root vs its input");
    await expect(canvasElement.textContent ?? "").not.toMatch(HINT);
  },
};
