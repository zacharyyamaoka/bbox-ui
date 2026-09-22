import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Check, ChevronDown, PaintBucket, Slash } from "lucide-react";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "../editor/toolbar";

/**
 * `popover.tsx` over Base UI's Popover — the popup engine behind the
 * appearance pill's fill panel (docs/menus/screenshots/01), the font-size
 * list (03), and any control panel that must open off a canvas point rather
 * than a DOM trigger (the whole reason `anchor`/`container`/`autoFocus` got
 * added to the stock shadcn copy's `Pick`, see the file's own header
 * comment). Content below is placeholder markup shaped like the real
 * screenshots — the real ported control-panel body (`controlPanel.tsx`,
 * MENU-KIT-DESIGN.md §3.3) is a later lane's job; this story exists to
 * prove the POSITIONING primitive, not the control vocabulary.
 */
const meta = {
  title: "Components/Stock/Popover",
  tags: ["object:stock"],
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Plain trigger + content, default `side="bottom"`/`align="center"`. */
export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline">Open popover</Button>} />
      <PopoverContent>
        <p style={{ margin: 0 }}>Popover content.</p>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open popover" });

    await expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    });

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
    });
  },
};

/**
 * docs/menus/screenshots/03-font-size-popover.png opening off
 * screenshots/02-rich-text-toolbar.png's "Large 36" cell — the composition
 * `ControlStrip`/`ControlPanel` will later formalize: a `ToolbarButton`
 * trigger, a `Popover` list with a check beside the selected row.
 */
function FontSizePopoverDemo() {
  const sizes = [
    { label: "Small", px: 18 },
    { label: "Medium", px: 24 },
    { label: "Large", px: 36 },
    { label: "Extra large", px: 44 },
  ];
  const [selected, setSelected] = useState("Large");
  const current = sizes.find((s) => s.label === selected)!;
  return (
    <Popover>
      <Toolbar aria-label="Text formatting">
        {/* WHY `ToolbarButton render={<PopoverTrigger/>}` and not the
            reverse: the TOOLBAR ITEM (roving tabindex, arrow-key stop) has
            to be the outer element so `Toolbar.Root` can find and manage
            it — the trigger behavior (onClick/aria-haspopup) merges onto
            that same button via Base UI's `render` prop, same direction
            Base UI's own toolbar+menu composition uses. */}
        <ToolbarButton aria-label="Font size" render={<PopoverTrigger />}>
          {current.label} {current.px}
          <ChevronDown className="size-3.5" />
        </ToolbarButton>
        <ToolbarSeparator />
        <ToolbarButton aria-label="Bold">B</ToolbarButton>
      </Toolbar>
      <PopoverContent align="start" className="w-48 p-1">
        {sizes.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSelected(s.label)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <span className="flex items-center gap-1.5">
              <Check className={s.label === selected ? "size-4" : "size-4 invisible"} />
              {s.label}
            </span>
            <span className="text-muted-foreground text-xs">{s.px}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export const FontSizePopover: Story = {
  render: () => <FontSizePopoverDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /Font size/ });

    await userEvent.click(trigger);
    const body = within(document.body);
    await waitFor(() => expect(body.getByText("Extra large")).toBeInTheDocument());

    await userEvent.click(body.getByText("Extra large"));
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: /Font size/ }).textContent).toContain("Extra large");
    });
  },
};

/**
 * docs/menus/screenshots/01-floating-toolbar-fill-popover.png — the swatch
 * grid opened above the pill. `align="start"` keeps the panel's left edge
 * flush with the trigger cell, matching the screenshot rather than
 * `Default`'s centered placement.
 */
export const FillPopover: Story = {
  render: () => {
    const swatches = [
      "#e5e5e5", "#9ca3af", "#ea580c", "#f97316", "#eab308",
      "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
    ];
    return (
      <Popover defaultOpen>
        <Toolbar aria-label="Shape style">
          <ToolbarButton aria-label="Fill" render={<PopoverTrigger />}>
            <PaintBucket className="size-4" />
          </ToolbarButton>
          <ToolbarButton aria-label="No fill" aria-pressed>
            <Slash className="size-4" />
          </ToolbarButton>
        </Toolbar>
        <PopoverContent align="start" side="top" className="w-auto">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6 }}>
            {swatches.map((hex) => (
              <span
                key={hex}
                style={{ background: hex, width: 24, height: 24, borderRadius: 999 }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
};

/**
 * The whole reason `dropdown-menu.tsx`/`tooltip.tsx`/`popover.tsx` had
 * `anchor` added to their Positioner `Pick`: a canvas-anchored popup has no
 * DOM element to open FROM — no `PopoverTrigger` is rendered at all here,
 * `open` is externally controlled and `anchor` is a plain
 * `{ getBoundingClientRect }` Floating UI `VirtualElement` pointing at an
 * arbitrary rect the "canvas" reports (a selection's screen-space bounds,
 * in the real host). Moving the rect and re-opening proves the popup
 * actually re-tracks it rather than caching the first position.
 */
export const CanvasAnchored: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      const [x, setX] = useState(40);
      const anchor = useRef({
        getBoundingClientRect: () => new DOMRect(x, 80, 1, 1),
      });
      anchor.current = { getBoundingClientRect: () => new DOMRect(x, 80, 1, 1) };
      return (
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setX((prev) => (prev === 40 ? 220 : 40));
              setOpen(true);
            }}
          >
            Open at point ({x}, 80)
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverContent anchor={anchor.current} side="right" align="start">
              Anchored to a point, not a trigger.
            </PopoverContent>
          </Popover>
        </div>
      );
    }
    return <Demo />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button");

    await userEvent.click(button);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    });
    await expect(document.body.querySelector('[data-slot="popover-content"]')?.textContent).toBe(
      "Anchored to a point, not a trigger.",
    );
  },
};

/**
 * `autoFocus={false}` (menuLabModel.ts's `popoverMode` concept, ported as a
 * boolean — see popover.tsx's own header comment): a live text field keeps
 * ITS OWN focus while the popover next to it is open, instead of the
 * popup's default "move focus into me on open" stealing the caret out of
 * an in-progress edit.
 */
export const AutoFocusFalseKeepsEditorFocus: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Native `autoFocus`, mounted in the SAME render as the already-open
          popover below — this is the deterministic way to prove the claim:
          `autoFocus={false}` on `PopoverContent` means Base UI's own
          initial-focus effect is a no-op, so it can never race with or
          override whatever else claimed focus on mount. */}
      <input
        aria-label="Renaming"
        defaultValue="draft-42"
        autoFocus
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
      />
      <Popover defaultOpen>
        <PopoverTrigger render={<Button variant="outline">Options</Button>} />
        <PopoverContent autoFocus={false}>
          <p style={{ margin: 0 }}>Focus stays on the rename field.</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Renaming" });

    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    });
    // The popup opened (`defaultOpen`), but `autoFocus={false}` means it
    // never pulled focus away from the field the user was already editing.
    await expect(input).toHaveFocus();
  },
};
