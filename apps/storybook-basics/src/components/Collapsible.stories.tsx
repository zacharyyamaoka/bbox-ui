import { useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Bar } from "../components/bar";
import { Collapsible, CollapsibleContent } from "../components/collapsible";
import { EditableText } from "../components/editableText";
import { FoldingChevron } from "../components/foldingChevron";

/**
 * `FoldingChevron` as its own standalone, story-able unit — the trigger
 * `Block`'s real header wiring (src/stories/Block.stories.tsx's
 * `CollapsibleHeader`) reuses. Wired here to `Collapsible` so the chevron's
 * rotation and a real hide/show panel are both demoed together.
 */
function FoldableDemo() {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <FoldingChevron open={open} onClick={() => setOpen((v) => !v)} />
        <span>Section title</span>
      </div>
      <CollapsibleContent>
        <div style={{ padding: "8px 0 0 30px", color: "var(--muted-foreground)" }}>
          Collapsible content, hidden when folded.
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const meta = {
  title: "Basics/FoldingChevron",
  tags: ["area:basics", "lane:baseline"],
  component: FoldingChevron,
  args: { open: true, onClick: () => {} },
} satisfies Meta<typeof FoldingChevron>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bare chevron, folded (▶) vs open (▼) — no Collapsible involved. */
export const States: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <FoldingChevron open={false} onClick={() => {}} />
      <FoldingChevron open={true} onClick={() => {}} />
    </div>
  ),
};

/**
 * Wired to a real `Collapsible`: click flips `open` AND rotates the
 * chevron AND shows/hides the panel — a play function clicks it and
 * asserts both the rotation (`aria-expanded`) and the content's presence.
 */
export const Interactive: Story = {
  render: () => <FoldableDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chevron = canvasElement.querySelector('[data-slot="folding-chevron"]');
    if (!(chevron instanceof HTMLElement)) throw new Error('expected a [data-slot="folding-chevron"]');

    await expect(chevron.getAttribute("aria-expanded")).toBe("true");
    await expect(canvas.getByText("Collapsible content, hidden when folded.")).toBeInTheDocument();

    await userEvent.click(chevron);
    await expect(chevron.getAttribute("aria-expanded")).toBe("false");
    await expect(canvas.queryByText("Collapsible content, hidden when folded.")).toBeNull();

    await userEvent.click(chevron);
    await expect(chevron.getAttribute("aria-expanded")).toBe("true");
    await expect(canvas.getByText("Collapsible content, hidden when folded.")).toBeInTheDocument();
  },
};

// WHY a dashed swatch + caption here rather than importing Bar.stories.tsx's
// (unexported) `BarSwatch`/`HeaderLayout`: same device, kept local — this
// file demonstrates `FoldingChevron`, not `Bar`'s own story surface.
function RevealSwatch({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{caption}</span>
      <div style={{ width: 200, border: "1px dashed var(--border)", borderRadius: 4 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Zach's ask, answered directly: `reveal="hover"` borderless + hidden until
 * you hover the Bar (not the 24px chevron itself — the real `Bar` component
 * is used here on purpose, since it's the literal "surrounding region" the
 * ask names, and it's the thing that carries the `group` class `reveal`
 * hooks into), collapsed always shows regardless, and `reveal="always"`
 * (the default, every existing caller) sits alongside for comparison — one
 * gallery, three columns, matching how `Bar.stories.tsx`'s `HeaderLayouts`
 * already answers this kind of "show me the variants" ask.
 *
 * The play function only pins what it can prove WITHOUT a real hover — a
 * synthetic `userEvent.hover` does not make Chromium's `:hover` engine
 * engage (it drives pointer events, not the browser's tracked cursor
 * position), so it would be lying about what it tested. What a click CAN
 * prove deterministically, on the exact same node: the hover-reveal
 * column starts at `opacity: 0` (hidden at rest), and toggling it to
 * collapsed flips the SAME button to forced-visible (the override) with NO
 * shift in the title's x-position — the layout-space-reserved claim this
 * story exists to demonstrate. Real cursor-driven reveal is verified
 * separately, live, with the browser tool's own `hover` action.
 */
function RevealGallery() {
  const [hoverOpen, setHoverOpen] = useState(true);
  const [alwaysOpen, setAlwaysOpen] = useState(true);
  const [collapsedOpen, setCollapsedOpen] = useState(false);

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <RevealSwatch caption='reveal="always" (default, for comparison)'>
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <FoldingChevron
                reveal="always"
                open={alwaysOpen}
                onClick={() => setAlwaysOpen((v) => !v)}
                data-testid="chevron-always"
              />
              <EditableText size="sm">Always visible</EditableText>
            </div>
          }
        />
      </RevealSwatch>

      <RevealSwatch caption='reveal="hover", expanded — hidden at rest, hover the Bar'>
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <FoldingChevron
                reveal="hover"
                open={hoverOpen}
                onClick={() => setHoverOpen((v) => !v)}
                data-testid="chevron-hover-expanded"
              />
              <EditableText size="sm">Hover to reveal</EditableText>
            </div>
          }
        />
      </RevealSwatch>

      <RevealSwatch caption='reveal="hover", collapsed — override, always shown'>
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <FoldingChevron
                reveal="hover"
                open={collapsedOpen}
                onClick={() => setCollapsedOpen((v) => !v)}
                data-testid="chevron-hover-collapsed"
              />
              <EditableText size="sm">Collapsed = shown</EditableText>
            </div>
          }
        />
      </RevealSwatch>
    </div>
  );
}

export const Reveal: Story = {
  render: () => <RevealGallery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Column 1 — "always": unaffected by the new prop, visible at rest.
    const alwaysChevron = canvas.getByTestId("chevron-always");
    await expect(getComputedStyle(alwaysChevron).opacity).toBe("1");

    // Column 3 — "hover" + collapsed: the override, always visible, no
    // hover needed.
    const collapsedChevron = canvas.getByTestId("chevron-hover-collapsed");
    await expect(collapsedChevron.getAttribute("aria-expanded")).toBe("false");
    await expect(getComputedStyle(collapsedChevron).opacity).toBe("1");

    // Column 2 — "hover" + expanded: hidden at rest (opacity 0, not merely
    // a transparent color) with its layout box still reserved (title's own
    // rect is unaffected either way).
    const hoverChevron = canvas.getByTestId("chevron-hover-expanded");
    const hoverBar = hoverChevron.closest('[data-slot="bar"]');
    if (!(hoverBar instanceof HTMLElement)) throw new Error('expected a [data-slot="bar"]');
    const hoverTitle = within(hoverBar).getByText("Hover to reveal");

    await expect(hoverChevron.getAttribute("aria-expanded")).toBe("true");
    await expect(getComputedStyle(hoverChevron).opacity).toBe("0");
    // WHY relative to the BAR's own left, not a raw viewport-absolute
    // `getBoundingClientRect().left`: found live (2026-09-17, via the real
    // per-call interactions oracle, not the vacuous `phase:"finished"`
    // check) — this 3-column gallery overflows the narrow Storybook
    // MANAGER preview pane, so the earlier `userEvent.click`s on the OTHER
    // two columns' chevrons can trigger the browser's native
    // scroll-into-view and shift every absolute rect that follows, even
    // though nothing in THIS bar actually moved (reconfirmed with real
    // cursor hovers). Scrolling moves the bar and its children together, so
    // `title.left - bar.left` cancels it out and only trips on a REAL
    // internal reflow.
    const titleOffsetWhileHidden = hoverTitle.getBoundingClientRect().left - hoverBar.getBoundingClientRect().left;

    // Click the (present-but-invisible) trigger itself — this is the SAME
    // button, so toggling it to collapsed proves the override actually
    // reaches this instance, without depending on a synthetic hover that
    // Chromium wouldn't honor as real `:hover` anyway.
    await userEvent.click(hoverChevron);
    await expect(hoverChevron.getAttribute("aria-expanded")).toBe("false");
    await expect(getComputedStyle(hoverChevron).opacity).toBe("1");

    // A5: the title did not move a pixel between hidden and forced-visible.
    const titleOffsetWhileVisible = hoverTitle.getBoundingClientRect().left - hoverBar.getBoundingClientRect().left;
    await expect(titleOffsetWhileVisible).toBe(titleOffsetWhileHidden);

    // Click back to expanded, leaving the gallery as it started.
    await userEvent.click(hoverChevron);
    await expect(hoverChevron.getAttribute("aria-expanded")).toBe("true");
    // The click just left REAL focus on the button, and `group-focus-within`
    // keeps a focused hover-reveal chevron visible ON PURPOSE (the keyboard
    // path to an invisible control). So while focused it must read 1 —
    // asserting 0 here was self-defeating and had never actually passed
    // (found 2026-09-16 when a real `playFunctionThrewException` listener
    // replaced `phase:"finished"` as the oracle; the phase reads "finished"
    // even when play throws). Hidden-at-rest is asserted AFTER blurring,
    // which is the state "at rest" actually means.
    await expect(getComputedStyle(hoverChevron).opacity).toBe("1");
    hoverChevron.blur();
    await waitFor(() => {
      expect(getComputedStyle(hoverChevron).opacity).toBe("0");
    });
  },
};
