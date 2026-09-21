import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ChevronDown, Circle, SlidersHorizontal, Zap } from "lucide-react";

import { Button } from "../components/button";
import { ButtonGroup } from "../components/button-group";
import { DevPanel, type DevPanelSection } from "../components/devPanel";

/**
 * The developer panel — the archived app's `</>` surface
 * (`/home/bam/systemsketch/src/SystemSketchUtilities.tsx:428-639`), rebuilt
 * as a SHELL that knows nothing about what it is showing.
 *
 * Zach, 2026-09-19: "THe actual layout is a mess you can please simplify it
 * and redo with shadcn … LIke the dev panel it self. should just use
 * placeholders for things. it shouldn't it self kinda hold any of the actual
 * things."
 *
 * So everything below — the words "Cable presentation", the two lettered
 * boards, the recording bar — is written HERE, by the host, as a
 * `DevPanelSection[]`. The panel renders rows; it has never heard of any of
 * it. `Recording` is the proof: it is a `slot` row holding a control this
 * story builds out of stock `ButtonGroup` + `Button`, which is exactly how a
 * peer lane's real recorder will arrive.
 */
const meta = {
  title: "Basics/DevPanel",
  tags: ["area:basics", "lane:devtools-2026-09-19"],
  component: DevPanel,
  parameters: { layout: "fullscreen" },
  // Each story renders its own stateful harness; these args exist only so
  // `StoryObj<typeof meta>` does not demand a full prop set per story.
  args: { open: false, onOpenChange: fn(), sections: [] },
} satisfies Meta<typeof DevPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const PREFIX = "dev-panel";

/**
 * A host-built control dropped into a `slot` row. Stands in for the recorder
 * a peer lane is building right now — the panel's side of that contract is
 * `{ kind: "slot", content }` and nothing else.
 */
function RecordingPlaceholder({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <ButtonGroup className="w-full">
      {/* The accent tint is the HOST's choice, made here in the story — the
          panel neither supplies it nor knows about it. */}
      <Button
        className="flex-1 gap-2 bg-[var(--bbox-accent)] text-white hover:bg-[var(--bbox-accent)]/85"
        onClick={() => onSelect("start-recording")}
      >
        <Circle className="size-3 fill-current" />
        Start recording
      </Button>
      <Button
        size="icon"
        aria-label="Recording options"
        className="bg-[var(--bbox-accent)] text-white hover:bg-[var(--bbox-accent)]/85"
        onClick={() => onSelect("recording-options")}
      >
        <ChevronDown />
      </Button>
    </ButtonGroup>
  );
}

interface HostState {
  toggles: Record<string, boolean>;
  prototype: string;
  detailsOpen: boolean;
}

/**
 * The host's configuration — one array, read top to bottom exactly as the
 * screenshot reads. Every callback funnels into ONE spy, so a story can
 * prove the panel identified the row rather than a closure remembering it.
 */
function sectionsFor(
  state: HostState,
  onRow: (id: string, value?: boolean | string) => void,
  extra?: { hideCableToggle?: boolean },
): DevPanelSection[] {
  const toggle = (id: string, title: string, description: string) =>
    ({
      kind: "toggle" as const,
      id,
      title,
      description,
      checked: state.toggles[id] ?? false,
      onCheckedChange: (checked: boolean, rowId: string) => onRow(rowId, checked),
    });

  return [
    {
      id: "channel",
      rows: [
        {
          kind: "status",
          id: "stable",
          title: "Stable",
          detail: "Verified 0.1.0 · working document",
          status: "Current",
          tone: "positive",
        },
        {
          kind: "action",
          id: "open-latest-preview",
          icon: <Zap />,
          eyebrow: "New preview available",
          title: "Open Latest Preview",
          subtitle: "Live working tree · full product · duplicate this board",
          onSelect: onRow,
        },
      ],
    },
    {
      id: "cables",
      title: "Cable presentation",
      caption: "This browser, live",
      rows: [
        {
          ...toggle("solid-before-pill", "Solid before the z⁻¹ pill", "Delayed cables: solid up to the pill, dotted after it"),
          hidden: extra?.hideCableToggle,
        },
      ],
    },
    {
      id: "behavior-tree",
      title: "Behavior tree",
      caption: "This browser, live",
      rows: [
        toggle(
          "tree-drag-model",
          "Show the Tree drag model",
          "Auto-layout drag containers, column zones and virtual card slots — live while dragging",
        ),
        {
          kind: "action",
          id: "drag-model-tuner",
          icon: <SlidersHorizontal />,
          eyebrow: "Live knobs · measured swap costs",
          title: "Drag Model Tuner",
          subtitle: "Layers, thresholds, copy-for-chat export",
          onSelect: onRow,
        },
      ],
    },
    {
      id: "type-attributes",
      title: "Type attributes",
      caption: "This browser, live",
      rows: [
        toggle(
          "chevrons-in-gutter",
          "Chevrons in code gutter",
          "Fold controls: align left in a fixed column instead of beside the text",
        ),
      ],
    },
    {
      id: "isolated-boards",
      title: "Isolated presets",
      caption: "Independent boards",
      rows: [
        {
          kind: "avatar",
          id: "block-dev",
          initial: "B",
          title: "Block Dev",
          subtitle: "Stock tldraw + Block · Independent browser-local board",
          onSelect: onRow,
        },
        {
          kind: "avatar",
          id: "stock-baseline",
          initial: "T",
          title: "Stock tldraw",
          subtitle: "Pinned stock baseline · Independent browser-local board",
          onSelect: onRow,
        },
      ],
    },
    {
      id: "recording",
      title: "Recording",
      caption: "Saved · packet copied",
      rows: [{ kind: "slot", id: "recorder", content: <RecordingPlaceholder onSelect={onRow} /> }],
    },
    {
      id: "release",
      rows: [
        {
          kind: "link",
          id: "version-and-updates",
          title: "Version & updates",
          detail: "0.1.0 · Preview ready",
          expanded: state.detailsOpen,
          onSelect: onRow,
        },
        {
          kind: "select",
          id: "prototype",
          label: "Prototype",
          value: state.prototype,
          options: [
            { value: "one-line", label: "Port editor · single line per port" },
            { value: "lanes", label: "Port editor · multi-line lanes, one solid box" },
            { value: "lanes-ragged", label: "Port editor · multi-line lanes, ragged lines" },
          ],
          onValueChange: (value: string, rowId: string) => onRow(rowId, value),
        },
      ],
    },
  ];
}

function Harness({
  onRow = fn(),
  hideCableToggle,
  footer = "7 sections · every row supplied by the host",
}: {
  onRow?: (id: string, value?: boolean | string) => void;
  hideCableToggle?: boolean;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [state, setState] = useState<HostState>({ toggles: {}, prototype: "lanes", detailsOpen: false });

  // The host owns the state the panel displays — which is the point.
  const handleRow = (id: string, value?: boolean | string) => {
    onRow(id, value);
    if (typeof value === "boolean") setState((s) => ({ ...s, toggles: { ...s.toggles, [id]: value } }));
    if (id === "prototype" && typeof value === "string") setState((s) => ({ ...s, prototype: value }));
    if (id === "version-and-updates") setState((s) => ({ ...s, detailsOpen: !s.detailsOpen }));
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Button variant="outline" size="sm" className="m-4" onClick={() => setOpen(true)}>
        Open dev panel
      </Button>
      <DevPanel
        open={open}
        onOpenChange={setOpen}
        eyebrow="SystemSketch"
        title="Dev"
        sections={sectionsFor(state, handleRow, { hideCableToggle })}
        footer={footer}
        testIdPrefix={PREFIX}
      />
    </div>
  );
}

const body = () => within(document.body);
const panel = () => document.querySelector<HTMLElement>(`[data-testid="${PREFIX}"][data-slot="dev-panel"]`);
const row = (id: string) => document.querySelector<HTMLElement>(`[data-slot="dev-panel-row"][data-row-id="${id}"]`);
const sectionIds = () =>
  [...document.querySelectorAll("[data-slot='dev-panel-section']")].map((node) => node.getAttribute("data-section-id"));

/**
 * Open the select in a row and commit one option.
 *
 * WHY the option is resolved by `data-slot` + text rather than
 * `getByRole("option", { name })`: that query filters by accessibility
 * VISIBILITY, and stock Select aligns its popup so the CURRENT item sits
 * over the trigger — with this row at the bottom of the panel, the later
 * options land past the viewport edge and the query stops seeing them.
 * Measured: the story passed run alone and failed in a full suite run, purely
 * on how much room the runner's window had. Scrolling the item in and
 * clicking it drives the same stock control with no geometry dependency, and
 * the `role="option"` assertion below keeps the semantics honest.
 */
async function chooseOption(rowId: string, label: string) {
  await userEvent.click(row(rowId)!.querySelector<HTMLElement>("[role='combobox']")!);
  const option = await waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>("[data-slot='select-item']")].find(
      (node) => node.textContent?.trim() === label,
    );
    expect(found, `option “${label}” in the open popup`).toBeTruthy();
    return found!;
  });
  await expect(option).toHaveAttribute("role", "option");
  option.scrollIntoView({ block: "nearest" });
  await userEvent.click(option);
}

/**
 * The panel as Zach's screenshot has it — this is the story the capture is
 * taken from. Its play function only reads; nothing here closes the panel.
 */
export const DeveloperPanel: Story = {
  render: () => <Harness />,
  play: async () => {
    const dialog = await body().findByRole("dialog");
    await expect(dialog).toHaveAttribute("data-slot", "dev-panel");
    await expect(panel()).not.toBeNull();

    // Sections, in the host's order — including the two with no title.
    await expect(sectionIds()).toEqual([
      "channel",
      "cables",
      "behavior-tree",
      "type-attributes",
      "isolated-boards",
      "recording",
      "release",
    ]);

    // The scope caption sits beside its title, not under the rows.
    const captions = [...document.querySelectorAll("[data-dev-panel-caption]")].map((node) => node.textContent);
    await expect(captions).toEqual([
      "This browser, live",
      "This browser, live",
      "This browser, live",
      "Independent boards",
      "Saved · packet copied",
    ]);

    // Every row kind the shell can paint is on screen at once.
    const kinds = new Set(
      [...document.querySelectorAll("[data-slot='dev-panel-row']")].map((node) => node.getAttribute("data-row-kind")),
    );
    await expect([...kinds].sort()).toEqual(["action", "avatar", "link", "select", "slot", "status", "toggle"]);

    // The stock parts, in the rows that claim them.
    await expect(row("solid-before-pill")?.querySelector("[role='switch']")).not.toBeNull();
    await expect(row("prototype")?.querySelector("[role='combobox']")).not.toBeNull();
    await expect(row("stable")?.textContent).toContain("Verified 0.1.0 · working document");

    // The slot row holds the HOST's element and nothing the panel invented.
    const recorder = row("recorder");
    await expect(recorder?.textContent).toContain("Start recording");

    // The dark surface: the panel re-declares the theme tokens on its own
    // root, so it is dark whatever the page around it is.
    await expect(getComputedStyle(dialog).getPropertyValue("--popover").trim()).toBe("oklch(0.205 0 0)");
  },
};

/** Every interactive row reaches the host and the host's state comes back. */
export const Interactions: Story = {
  render: () => <Harness />,
  play: async () => {
    await body().findByRole("dialog");

    // 1. A toggle: the panel names the row, the host flips it.
    const solid = row("solid-before-pill")!.querySelector<HTMLElement>("[role='switch']")!;
    await expect(solid).toHaveAttribute("aria-checked", "false");
    await userEvent.click(solid);
    await waitFor(() => expect(solid).toHaveAttribute("aria-checked", "true"));

    // A second, different toggle proves the id is the ROW's, not a constant.
    const tree = row("tree-drag-model")!.querySelector<HTMLElement>("[role='switch']")!;
    await userEvent.click(tree);
    await waitFor(() => expect(tree).toHaveAttribute("aria-checked", "true"));
    await expect(solid).toHaveAttribute("aria-checked", "true");

    // 2. The select opens and commits a new value through the row's id.
    const trigger = row("prototype")!.querySelector<HTMLElement>("[role='combobox']")!;
    await expect(trigger.textContent).toContain("multi-line lanes, one solid box");
    await chooseOption("prototype", "Port editor · single line per port");
    await waitFor(() => expect(trigger.textContent).toContain("single line per port"));

    // 3. An action card, and the link row's disclosure state.
    const link = row("version-and-updates")!.querySelector<HTMLElement>("button")!;
    await expect(link).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(link);
    await waitFor(() => expect(link).toHaveAttribute("aria-expanded", "true"));

    const tuner = row("drag-model-tuner")!.querySelector<HTMLElement>("button")!;
    await userEvent.click(tuner);
    // The action fires and the panel stays open — opening a tool is the
    // host's business, not a reason for the shell to dismiss itself.
    await expect(panel()).not.toBeNull();
  },
};

/**
 * Each callback carries its OWN row id — one handler, five different rows.
 *
 * WHY this is the load-bearing story: it is the difference between a shell
 * that renders data and one whose host got lucky with closures. The handler
 * below is a single function that knows nothing; every entry it records was
 * identified by the panel.
 */
const recorded: Array<[string, boolean | string | undefined]> = [];

export const CallbacksCarryTheRowId: Story = {
  render: () => <Harness onRow={(id, value) => recorded.push([id, value])} />,
  play: async () => {
    await body().findByRole("dialog");
    // Cleared here, not in `render`: React may render more than once, and
    // nothing has been clicked yet at this point.
    recorded.length = 0;

    await userEvent.click(row("chevrons-in-gutter")!.querySelector<HTMLElement>("[role='switch']")!);
    await waitFor(() => expect(recorded).toContainEqual(["chevrons-in-gutter", true]));

    await userEvent.click(row("open-latest-preview")!.querySelector<HTMLElement>("button")!);
    await waitFor(() => expect(recorded).toContainEqual(["open-latest-preview", undefined]));

    await userEvent.click(row("block-dev")!.querySelector<HTMLElement>("button")!);
    await waitFor(() => expect(recorded).toContainEqual(["block-dev", undefined]));

    await userEvent.click(row("recorder")!.querySelector<HTMLElement>("button")!);
    await waitFor(() => expect(recorded).toContainEqual(["start-recording", undefined]));

    await chooseOption("prototype", "Port editor · multi-line lanes, ragged lines");
    await waitFor(() => expect(recorded).toContainEqual(["prototype", "lanes-ragged"]));

    // Five rows, five distinct ids — no id was ever a constant.
    await expect(new Set(recorded.map(([id]) => id)).size).toBe(5);
  },
};

/** The X and Escape both close it, and it reopens unchanged. */
export const ClosesTwoWays: Story = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    await body().findByRole("dialog");

    const close = document.querySelector<HTMLElement>("[data-dev-panel-close]")!;
    await expect(close).toHaveAttribute("aria-label", "Close Dev");
    await userEvent.click(close);
    await waitFor(() => expect(panel()).toBeNull());

    // WHY the reopen button is only looked up HERE: while the panel is open
    // the stock Dialog marks everything behind it `aria-hidden` +
    // `data-base-ui-inert`, so `getByRole` cannot see it — which is the
    // modal behaviour working, not a missing button. Querying it up front
    // fails, and that failure is the assertion passing.
    const reopen = within(canvasElement).getByRole("button", { name: "Open dev panel" });
    await userEvent.click(reopen);
    await waitFor(() => expect(panel()).not.toBeNull());

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(panel()).toBeNull());
  },
};

/**
 * Hiding the last row of a section takes its heading and scope caption with
 * it — the shell has no idea what "Cable presentation" means, so it cannot
 * be the one keeping the header honest.
 */
export const AnEmptiedSectionTakesItsHeaderWithIt: Story = {
  render: () => <Harness hideCableToggle />,
  play: async () => {
    await body().findByRole("dialog");
    await expect(sectionIds()).not.toContain("cables");
    await expect(body().queryByText("Cable presentation")).not.toBeInTheDocument();
    // The sibling sections, and their identical caption, are untouched.
    await expect(sectionIds()).toContain("behavior-tree");
    await expect([...document.querySelectorAll("[data-dev-panel-caption]")].length).toBe(4);
  },
};
