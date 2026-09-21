import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "./field";
import { Input } from "./input";
import { Switch } from "./switch";

/**
 * Stock shadcn `base-nova` Field kit (components/field.tsx) — the
 * label/description/control grouping settingsView.tsx (settings-kit) uses
 * for every row in the ported General/Appearance/About categories, per
 * docs/CHROME-FILES-SETTINGS-PLAN.md §3.
 */
const meta = {
  title: "Basics/Field",
  tags: ["area:basics", "lane:baseline"],
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SettingsRows: Story = {
  render: () => (
    <FieldGroup style={{ width: 320 }}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="autosave">Autosave</FieldLabel>
          <FieldDescription>Save changes to disk as you work.</FieldDescription>
        </FieldContent>
        <Switch id="autosave" defaultChecked />
      </Field>
      <FieldSeparator />
      <Field>
        <FieldLabel htmlFor="workspace-root">Workspace folder</FieldLabel>
        <Input id="workspace-root" defaultValue="~/SystemSketch" />
        <FieldDescription>Where boards and files are saved.</FieldDescription>
      </Field>
    </FieldGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("switch", { name: "Autosave" })).toBeChecked();
    await expect(canvas.getByLabelText("Workspace folder")).toHaveValue("~/SystemSketch");
  },
};
