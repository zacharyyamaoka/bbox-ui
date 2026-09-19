import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, within } from "storybook/test";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs";

/**
 * The Properties/Code detail tabs (`compare/CompareDialog.tsx:43` in the
 * donor, which pulled a 1629-line `block-inspector.css` for 40 lines of
 * actual behavior). MENU-KIT-DESIGN.md §5's whole ask for this row is
 * "consistent with what tabs look like" — satisfied by this one kit
 * primitive everywhere a tabbed detail panel appears, not a bespoke look
 * per panel.
 */
const meta = {
  title: "Basics/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The `default` variant — a filled pill track, the active tab raised on a
 *  card-colored chip. This is the Properties/Code split itself. */
export const PropertiesCode: Story = {
  render: () => (
    <Tabs defaultValue="properties" className="w-72">
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="p-2">
        Block properties go here.
      </TabsContent>
      <TabsContent value="code" className="p-2">
        Generated code goes here.
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Block properties go here.")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Code" }));
    await expect(canvas.getByText("Generated code goes here.")).toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Code" })).toHaveAttribute("data-active");
  },
};

/** The `line` variant — transparent track, an underline indicator instead
 *  of a raised chip. A second look this same primitive supports without a
 *  second component. */
export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="properties" className="w-72">
      <TabsList variant="line">
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="p-2">
        Block properties go here.
      </TabsContent>
      <TabsContent value="code" className="p-2">
        Generated code goes here.
      </TabsContent>
      <TabsContent value="history" className="p-2">
        Edit history goes here.
      </TabsContent>
    </Tabs>
  ),
};

/** Vertical orientation — the list stacks into a left rail, panels sit
 *  beside it rather than below it. */
export const Vertical: Story = {
  render: () => (
    <Tabs defaultValue="properties" orientation="vertical" className="w-80">
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="p-2">
        Block properties go here.
      </TabsContent>
      <TabsContent value="code" className="p-2">
        Generated code goes here.
      </TabsContent>
    </Tabs>
  ),
};

/** A disabled tab never activates on click and is skipped by keyboard
 *  navigation. */
export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="properties" className="w-72">
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="code" disabled>
          Code
        </TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="p-2">
        Block properties go here.
      </TabsContent>
      <TabsContent value="code" className="p-2">
        Generated code goes here.
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const codeTab = canvas.getByRole("tab", { name: "Code" });
    await expect(codeTab).toHaveAttribute("aria-disabled", "true");
    // `aria-disabled:pointer-events-none` makes this genuinely unclickable —
    // a real user's click can never reach it, so `userEvent.click` (which
    // performs the same actionability check a real pointer would) correctly
    // refuses. `fireEvent.click` bypasses that check to prove the SECOND
    // line of defense: even a forced click event is a no-op, because Base
    // UI's own Tab ignores activation while `disabled`.
    fireEvent.click(codeTab);
    await expect(canvas.getByText("Block properties go here.")).toBeInTheDocument();
  },
};

/** Arrow-key navigation between tabs — the roving-tabindex contract Base
 *  UI's `Tabs.List` provides for free. */
export const KeyboardNavigation: Story = {
  render: () => (
    <Tabs defaultValue="a" className="w-72">
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
        <TabsTrigger value="c">C</TabsTrigger>
      </TabsList>
      <TabsContent value="a" className="p-2">
        Panel A
      </TabsContent>
      <TabsContent value="b" className="p-2">
        Panel B
      </TabsContent>
      <TabsContent value="c" className="p-2">
        Panel C
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const a = canvas.getByRole("tab", { name: "A" });
    a.focus();
    await expect(a).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "B" })).toHaveFocus();
  },
};
