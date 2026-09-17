import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EllipsisVertical } from "lucide-react";

import { Badge } from "../components/badge";
import { Bar } from "../components/bar";
import { Block } from "../components/block";
import { EMPTY_CARD_MIN_PX, type BlockMember, type BlockMembersLayout } from "../components/blockMembers";
import { Button } from "../components/button";
import { CodeEditor } from "../components/codeEditor";
import { Text } from "../components/text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";
import { FoldingChevron } from "../components/foldingChevron";
import { Glyph } from "../components/glyph";
import { EditableText } from "../components/editableText";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip";

const meta = {
  title: "Blocks/Block",
  component: Block,
  args: {
    header: "Header",
    body: "Body",
    footer: "Footer",
    // Explicit, because `Block` no longer defaults a height — these stories
    // are showing off the fixed-size box, so they state the size they want
    // rather than leaning on a default that would make hugging impossible.
    height: 240,
  },
} satisfies Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Plain text in every slot — no composition yet. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="block"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="block"]');
    await expect(el.querySelector('[data-slot="block-header"]')).not.toBeNull();
    await expect(el.querySelector('[data-slot="block-body"]')).not.toBeNull();
    await expect(el.querySelector('[data-slot="block-footer"]')).not.toBeNull();
  },
};

/** A Block with no footer — header/body only. Proves the slot is omitted, not just emptied. */
export const HeaderOnly: Story = {
  args: { footer: undefined },
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-slot="block"]');
    if (!(el instanceof HTMLElement)) throw new Error('expected a [data-slot="block"]');
    await expect(el.querySelector('[data-slot="block-footer"]')).toBeNull();
  },
};

/**
 * The composition the reset is actually about: Bar filling Block's header
 * AND footer slots. Two different Bars (a title bar up top, a smaller
 * status bar below) — proving Block doesn't care what's in the slot, and
 * Bar doesn't care which slot it's in.
 */
export const ComposedWithBar: Story = {
  args: {
    header: <Bar left="◆" center="Title" right="●" />,
    body: "Body content",
    footer: <Bar size="sm" center="Footer status" />,
  },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector('[data-slot="block-header"] [data-slot="bar"]');
    const footer = canvasElement.querySelector('[data-slot="block-footer"] [data-slot="bar"]');
    await expect(header).not.toBeNull();
    await expect(footer).not.toBeNull();
  },
};

/**
 * "Block with different bars" — several Blocks, each with a genuinely
 * different Bar-shaped header, body/footer left plain. Reuses a handful of
 * the Bar.stories.tsx `HeaderLayouts` combinations directly.
 */
export const DifferentBars: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Block
        width={260}
        height={160}
        header={
          <Bar
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Glyph content="lucide:rocket" />
                <EditableText size="sm">Title</EditableText>
                <EditableText size="sm" className="text-muted-foreground" style={{ fontSize: 12 }}>
                  Type
                </EditableText>
              </div>
            }
          />
        }
        body="Plain body"
      />
      <Block
        width={260}
        height={160}
        header={
          <Bar
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Glyph content="lucide:anchor" />
                <EditableText size="sm">Title</EditableText>
                <Badge variant="secondary">Draft 1</Badge>
              </div>
            }
          />
        }
        body="Plain body"
      />
      <Block
        width={260}
        height={160}
        header={
          <Bar
            center={
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Glyph content="lucide:circle" />
                <EditableText size="sm">Title</EditableText>
              </div>
            }
          />
        }
        body="Plain body"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const blocks = canvasElement.querySelectorAll('[data-slot="block"]');
    await expect(blocks).toHaveLength(3);
    const bars = canvasElement.querySelectorAll('[data-slot="block-header"] [data-slot="bar"]');
    await expect(bars).toHaveLength(3);
  },
};

/**
 * Zach's explicit functional requirement: "For the folding chevron, make
 * sure that it hides the body and footer when you click it." A Bar with a
 * `FoldingChevron` in its header, wired via local `useState` — `Block`'s
 * `body`/`footer` props are `open ? <content> : undefined`, reusing the
 * existing "an undefined header/footer is omitted entirely" behavior for
 * free. No `Block` prop change: this is entirely story-level wiring.
 */
function CollapsibleBlock() {
  const [open, setOpen] = useState(true);
  return (
    <Block
      width={280}
      // Open: a real box. Collapsed: no height at all, so the Block hugs the
      // header that remains — this is what makes the fold visible rather than
      // leaving an empty well where the body used to be.
      height={open ? 180 : undefined}
      header={
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <FoldingChevron open={open} onClick={() => setOpen((v) => !v)} />
              <Glyph content="lucide:rocket" />
              <EditableText size="sm">Title</EditableText>
            </div>
          }
        />
      }
      body={open ? "Body content" : undefined}
      footer={open ? <Bar size="sm" center="Footer status" /> : undefined}
    />
  );
}

export const CollapsibleHeader: Story = {
  render: () => <CollapsibleBlock />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chevron = canvasElement.querySelector('[data-slot="folding-chevron"]');
    if (!(chevron instanceof HTMLElement)) throw new Error('expected a [data-slot="folding-chevron"]');

    const block = canvasElement.querySelector('[data-slot="block"]');
    if (!(block instanceof HTMLElement)) throw new Error('expected a [data-slot="block"]');

    // Starts open: body and footer regions both present.
    await expect(canvas.getByText("Body content")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="block-body"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-slot="block-footer"]')).not.toBeNull();
    await expect(chevron.getAttribute("aria-expanded")).toBe("true");
    const openHeight = block.getBoundingClientRect().height;

    // Click: both regions leave the DOM entirely — not merely emptied.
    await userEvent.click(chevron);
    await waitFor(() => {
      expect(canvas.queryByText("Body content")).toBeNull();
      expect(canvasElement.querySelector('[data-slot="block-body"]')).toBeNull();
      expect(canvasElement.querySelector('[data-slot="block-footer"]')).toBeNull();
    });
    // WHY the height is asserted and not just the DOM: the first cut of this
    // story passed its DOM checks while the Block stayed exactly 180px tall
    // with an empty well under the header — the content had gone but nothing
    // had folded. Measuring the box is the only assertion that can tell those
    // two apart, and folding is the thing actually being asked for.
    await expect(block.getBoundingClientRect().height).toBeLessThan(openHeight);
    await expect(chevron.getAttribute("aria-expanded")).toBe("false");
    // The header itself stays — only body/footer fold away.
    await expect(canvasElement.querySelector('[data-slot="block-header"]')).not.toBeNull();
    await expect(canvas.getByText("Title")).toBeInTheDocument();

    // Click again: back to open.
    await userEvent.click(chevron);
    await waitFor(() => {
      expect(canvas.getByText("Body content")).toBeInTheDocument();
      expect(canvasElement.querySelector('[data-slot="block-footer"]')).not.toBeNull();
    });
    await expect(chevron.getAttribute("aria-expanded")).toBe("true");
  },
};

/**
 * Zach's reference screenshot puts the kebab in the Block's FOOTER, not its
 * header — SystemSketch's own `BlockFooterMenu` does the same. Composes the
 * two new primitives (DropdownMenu, Tooltip) through the existing slots only
 * — no Block/Bar prop change: a header Bar (the Glyph + EditableText title
 * cluster from `DifferentBars`, above) and a footer Bar whose `right` slot
 * holds the kebab, wrapped in a Tooltip reading "More options".
 */
function FooterMenuBlock() {
  return (
    <Block
      width={280}
      height={180}
      header={
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Glyph content="lucide:rocket" />
              <EditableText size="sm">Title</EditableText>
            </div>
          }
        />
      }
      body="Plain body"
      footer={
        <Bar
          size="sm"
          right={
            <TooltipProvider>
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label="More options">
                            <EllipsisVertical />
                          </Button>
                        }
                      />
                    }
                  />
                  <TooltipContent>More options</TooltipContent>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Block</DropdownMenuLabel>
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>Step into</DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Tooltip>
            </TooltipProvider>
          }
        />
      }
    />
  );
}

export const FooterMenu: Story = {
  render: () => <FooterMenuBlock />,
  play: async ({ canvasElement }) => {
    const footer = canvasElement.querySelector('[data-slot="block-footer"]');
    if (!(footer instanceof HTMLElement)) throw new Error('expected a [data-slot="block-footer"]');

    // WHY not `[data-slot="dropdown-menu-trigger"]`: Base UI's render-prop
    // cloning merges TooltipTrigger's own `data-slot="tooltip-trigger"` onto
    // the SAME <button> as DropdownMenuTrigger's `data-slot`, and the later
    // prop-spread in dropdown-menu.tsx's own
    // `<MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />`
    // wins — the rendered button ends up carrying only `tooltip-trigger`
    // (confirmed live: `footer.querySelector('[data-slot="dropdown-menu-trigger"]')`
    // is null once Tooltip wraps it). `aria-haspopup="menu"` survives that
    // merge because Menu.Trigger sets it directly, not via a `data-slot`
    // literal another wrapper can clobber — a stable way to find "the kebab"
    // without caring which data-slot string won.
    const trigger = footer.querySelector('button[aria-haspopup="menu"]');
    if (!(trigger instanceof HTMLElement)) {
      throw new Error('expected a button[aria-haspopup="menu"] (the kebab) inside the block footer');
    }

    await expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull();
    });
    await expect(within(document.body).getByText("Duplicate")).toBeInTheDocument();
  },
};

/* ------------------------------------------------------------------ */
/* Membership — free vs stack over ONE member list ("boxes all the way  */
/* down"). Story-local controls follow PortEdge.stories.tsx's idiom:    */
/* Segmented/Checkbox as plain inline UI, not a schema.                 */
/* ------------------------------------------------------------------ */

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", width: "max-content" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "none",
            cursor: "pointer",
            background: value === opt.value ? "var(--accent)" : "transparent",
            color: value === opt.value ? "var(--accent-foreground)" : "var(--foreground)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, color: "var(--muted-foreground)", maxWidth: 300 }}>{children}</span>;
}

/** A simple visible band member — labeled, measurable, no chrome of its own. */
function band(label: string, width?: number) {
  return (
    <div
      className="rounded-md bg-accent text-accent-foreground"
      style={{ height: 32, width, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 12, boxSizing: "border-box" }}
    >
      {label}
    </div>
  );
}

/**
 * PortEdge.stories.tsx's `dragCard`, reused by value: a genuine
 * `PointerSensor` drag. `isPrimary: true` is load-bearing — dnd-kit's
 * activator silently no-ops without it — and the first small move clears
 * the 4px activationConstraint. This variant also measures the dragged
 * element's rect MID-gesture, for the size-stability assertion.
 */
async function dragMemberMeasuring(from: Element, to: Element): Promise<{ before: DOMRect; mid: DOMRect; after: DOMRect }> {
  const fire = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: "mouse", clientX: x, clientY: y }),
    );
  const before = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const startX = before.left + before.width / 2;
  const startY = before.top + before.height / 2;
  const endX = toRect.left + toRect.width / 2;
  const endY = toRect.top + toRect.height / 2;
  fire(from, "pointerdown", startX, startY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", startX, startY + 10); // clears activationConstraint.distance
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointermove", (startX + endX) / 2, (startY + endY) / 2);
  await new Promise((r) => setTimeout(r, 30));
  const mid = from.getBoundingClientRect();
  fire(from, "pointermove", endX, endY);
  await new Promise((r) => setTimeout(r, 30));
  fire(from, "pointerup", endX, endY);
  await new Promise((r) => setTimeout(r, 100));
  const after = from.getBoundingClientRect();
  return { before, mid, after };
}

/** Every consecutive vertical gap (next.top − prev.bottom) between slots. */
function consecutiveGaps(slots: Element[]): number[] {
  const rects = slots.map((s) => s.getBoundingClientRect());
  return rects.slice(1).map((rect, i) => rect.top - rects[i].bottom);
}

/* ------------------------------------------------------------------ */
/* FreeVsStack — the first sketch, literally: same three members, one    */
/* Block free (scattered where placed), one stacked (ordered column).   */
/* The free Block's layout is toggleable so the free→stack→free round   */
/* trip is drivable: free positions live on the member and are never    */
/* rewritten by stacking.                                               */
/* ------------------------------------------------------------------ */

const SKETCH_POSITIONS: Record<string, { x: number; y: number }> = {
  alpha: { x: 16, y: 10 },
  beta: { x: 120, y: 68 },
  gamma: { x: 44, y: 136 },
};

const SKETCH_MEMBERS: BlockMember[] = Object.entries(SKETCH_POSITIONS).map(([id, pos]) => ({
  id,
  ...pos,
  width: "own",
  content: <Block width={120} header={id} />,
}));

function FreeVsStackDemo() {
  const [layout, setLayout] = useState<BlockMembersLayout>("free");
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="free-panel">
        <Segmented
          options={[
            { value: "free", label: "Free" },
            { value: "stack", label: "Stack" },
          ]}
          value={layout}
          onChange={setLayout}
        />
        <Block width={280} height={280} header="free_frame" members={SKETCH_MEMBERS} membersLayout={layout} />
        <Caption>free — a frame inside: members sit exactly where they were placed</Caption>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 33 }} data-testid="stack-panel">
        <Block width={280} height={280} header="stack" members={SKETCH_MEMBERS} membersLayout="stack" />
        <Caption>stack — the SAME member list, laid out as an ordered column</Caption>
      </div>
    </div>
  );
}

export const FreeVsStack: Story = {
  render: () => <FreeVsStackDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const freePanel = canvasElement.querySelector('[data-testid="free-panel"]');
    const stackPanel = canvasElement.querySelector('[data-testid="stack-panel"]');
    if (!(freePanel instanceof HTMLElement) || !(stackPanel instanceof HTMLElement)) throw new Error("expected both panels");

    const measureFreePositions = () => {
      const region = freePanel.querySelector('[data-slot="block-members"]');
      if (!(region instanceof HTMLElement)) throw new Error("expected a members region in the free panel");
      const regionRect = region.getBoundingClientRect();
      return Object.fromEntries(
        Object.keys(SKETCH_POSITIONS).map((id) => {
          const slot = region.querySelector(`[data-member-id="${id}"]`);
          if (!(slot instanceof HTMLElement)) throw new Error(`expected member slot ${id}`);
          const rect = slot.getBoundingClientRect();
          return [id, { x: rect.left - regionRect.left, y: rect.top - regionRect.top }];
        }),
      );
    };

    // N2 (first half): each free member sits within 1px of its authored position.
    const initial = measureFreePositions();
    for (const [id, pos] of Object.entries(SKETCH_POSITIONS)) {
      await expect(Math.abs(initial[id].x - pos.x)).toBeLessThanOrEqual(1);
      await expect(Math.abs(initial[id].y - pos.y)).toBeLessThanOrEqual(1);
    }

    // N1: the stack panel renders members in list order, top to bottom,
    // with every consecutive gap equal within 1px.
    const stackRegion = stackPanel.querySelector('[data-slot="block-members"][data-layout="stack"]');
    if (!(stackRegion instanceof HTMLElement)) throw new Error("expected a stack members region");
    const stackSlots = Array.from(stackRegion.querySelectorAll('[data-slot="block-member"]'));
    await expect(stackSlots.map((s) => s.getAttribute("data-member-id"))).toEqual(["alpha", "beta", "gamma"]);
    const tops = stackSlots.map((s) => s.getBoundingClientRect().top);
    for (let i = 1; i < tops.length; i++) await expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    const gaps = consecutiveGaps(stackSlots);
    for (const gap of gaps) await expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1);

    // N2 (round trip): free → stack → free restores the authored positions.
    await userEvent.click(canvas.getByRole("button", { name: "Stack" }));
    await waitFor(() => {
      expect(freePanel.querySelector('[data-slot="block-members"]')?.getAttribute("data-layout")).toBe("stack");
    });
    // While stacked, the toggled block really stacks: order, not positions.
    const toggledSlots = Array.from(freePanel.querySelectorAll('[data-slot="block-member"]'));
    await expect(toggledSlots.map((s) => s.getAttribute("data-member-id"))).toEqual(["alpha", "beta", "gamma"]);
    await userEvent.click(canvas.getByRole("button", { name: "Free" }));
    await waitFor(() => {
      expect(freePanel.querySelector('[data-slot="block-members"]')?.getAttribute("data-layout")).toBe("free");
    });
    const restored = measureFreePositions();
    for (const [id, pos] of Object.entries(initial)) {
      await expect(Math.abs(restored[id].x - pos.x)).toBeLessThanOrEqual(1);
      await expect(Math.abs(restored[id].y - pos.y)).toBeLessThanOrEqual(1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* MemberOptions — the per-member delta from SystemSketch, visible at a  */
/* glance: inset vs edge-to-edge and fill vs own IN THE SAME BLOCK,      */
/* plus the block-level inset background and a hidden-primitive member.  */
/* ------------------------------------------------------------------ */

const INSET_VS_EDGE_MEMBERS: BlockMember[] = [
  { id: "m-inset", inset: "inset", content: band("inset") },
  { id: "m-edge", inset: "edge-to-edge", content: band("edge-to-edge") },
];

// The full 2×2: {inset, edge-to-edge} × {fill, own} in ONE Block. The odd
// square is edge-to-edge + own — a member cannot be flush with BOTH sides
// AND keep an intrinsic narrower width, so what actually happens is flush
// LEFT at its own width (gutter margin dropped, width kept). Shown and
// labelled honestly rather than omitted.
const FILL_VS_OWN_MEMBERS: BlockMember[] = [
  { id: "w-inset-fill", inset: "inset", width: "fill", content: band("inset + fill") },
  { id: "w-inset-own", inset: "inset", width: "own", content: band("inset + own · 140px", 140) },
  { id: "w-edge-fill", inset: "edge-to-edge", width: "fill", content: band("edge-to-edge + fill") },
  { id: "w-edge-own", inset: "edge-to-edge", width: "own", content: band("edge + own · 140px (flush left only)", 140) },
];

const BACKGROUND_MEMBERS: BlockMember[] = [
  { id: "bg-a", content: band("member a") },
  { id: "bg-b", content: band("member b") },
];

const PRIMITIVE_MEMBERS: BlockMember[] = [
  { id: "keep", content: band("stackable member") },
  {
    id: "rect",
    // A rectangle CAN be a member but makes no sense stacked: it keeps its
    // membership (it stays in this list) with visibility off by default.
    visible: false,
    content: <svg width={80} height={48} aria-label="rectangle"><rect width={80} height={48} fill="none" stroke="currentColor" /></svg>,
  },
];

export const MemberOptions: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="panel-inset">
        <Block width={300} header="inset vs edge-to-edge" members={INSET_VS_EDGE_MEMBERS} membersLayout="stack" />
        <Caption>per member: one inset, one edge-to-edge — same Block</Caption>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="panel-width">
        <Block width={300} header="fill vs own × inset vs edge" members={FILL_VS_OWN_MEMBERS} membersLayout="stack" />
        <Caption>
          the full 2×2 — fill follows its inset mode (inner−gutters vs full inner width); own keeps 140px either way.
          edge-to-edge + own is the odd one: flush with both sides AND own width is impossible, so it renders flush left
          at its own width
        </Caption>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="panel-bg-none">
        <Block width={240} header="background: none" members={BACKGROUND_MEMBERS} membersLayout="stack" insetBackground="none" />
        <Caption>inset background — no change</Caption>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="panel-bg-soft">
        <Block width={240} header="background: soft gray" members={BACKGROUND_MEMBERS} membersLayout="stack" insetBackground="soft-gray" />
        <Caption>inset background — soft gray translucent, just differentiates it a bit</Caption>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="panel-primitive">
        <Block width={240} header="hidden primitive" members={PRIMITIVE_MEMBERS} membersLayout="stack" />
        <Caption>a rectangle member keeps its membership, visibility off by default in a stack</Caption>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const innerWidthOf = (block: HTMLElement) => {
      const style = getComputedStyle(block);
      return block.getBoundingClientRect().width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    };
    const slotIn = (panelId: string, memberId: string) => {
      const slot = canvasElement.querySelector(`[data-testid="${panelId}"] [data-member-id="${memberId}"]`);
      if (!(slot instanceof HTMLElement)) throw new Error(`expected member ${memberId} in ${panelId}`);
      return slot;
    };

    // N3: in the SAME Block, edge-to-edge spans the full inner width and
    // inset spans inner − 2×gutter (default 12px each side).
    const insetBlock = canvasElement.querySelector('[data-testid="panel-inset"] [data-slot="block"]');
    if (!(insetBlock instanceof HTMLElement)) throw new Error("expected the inset panel block");
    const insetInner = innerWidthOf(insetBlock);
    await expect(Math.abs(slotIn("panel-inset", "m-edge").getBoundingClientRect().width - insetInner)).toBeLessThanOrEqual(1);
    await expect(Math.abs(slotIn("panel-inset", "m-inset").getBoundingClientRect().width - (insetInner - 24))).toBeLessThanOrEqual(1);

    // M1: an edge-to-edge member's outermost box squares off (radius 0) so
    // it reads as part of the parent; the inset member in the SAME Block
    // keeps its own radius (it is a separate card). Numeric, not class
    // presence — the computed style is what actually paints.
    const edgeChild = slotIn("panel-inset", "m-edge").firstElementChild;
    const insetChild = slotIn("panel-inset", "m-inset").firstElementChild;
    if (!(edgeChild instanceof HTMLElement) || !(insetChild instanceof HTMLElement)) throw new Error("expected member content in both slots");
    await expect(parseFloat(getComputedStyle(edgeChild).borderTopLeftRadius)).toBe(0);
    await expect(parseFloat(getComputedStyle(edgeChild).borderBottomRightRadius)).toBe(0);
    await expect(parseFloat(getComputedStyle(insetChild).borderTopLeftRadius)).toBeGreaterThan(0);

    // N4 + M2: the full {inset, edge-to-edge} × {fill, own} cross in ONE
    // Block. fill follows its inset mode; own keeps 140px in both modes
    // (edge + own = the impossible square — flush left at own width).
    const widthBlock = canvasElement.querySelector('[data-testid="panel-width"] [data-slot="block"]');
    if (!(widthBlock instanceof HTMLElement)) throw new Error("expected the width panel block");
    const widthInner = innerWidthOf(widthBlock);
    await expect(Math.abs(slotIn("panel-width", "w-inset-fill").getBoundingClientRect().width - (widthInner - 24))).toBeLessThanOrEqual(1);
    await expect(Math.abs(slotIn("panel-width", "w-edge-fill").getBoundingClientRect().width - widthInner)).toBeLessThanOrEqual(1);
    await expect(Math.abs(slotIn("panel-width", "w-inset-own").getBoundingClientRect().width - 140)).toBeLessThanOrEqual(1);
    await expect(Math.abs(slotIn("panel-width", "w-edge-own").getBoundingClientRect().width - 140)).toBeLessThanOrEqual(1);
    // The two horizontal anchors that make the 2×2 legible: an inset-own
    // member starts one gutter in; the edge-own member starts flush left.
    const widthBlockLeft = widthBlock.getBoundingClientRect().left + parseFloat(getComputedStyle(widthBlock).borderLeftWidth);
    await expect(Math.abs(slotIn("panel-width", "w-inset-own").getBoundingClientRect().left - (widthBlockLeft + 12))).toBeLessThanOrEqual(1);
    await expect(Math.abs(slotIn("panel-width", "w-edge-own").getBoundingClientRect().left - widthBlockLeft)).toBeLessThanOrEqual(1);

    // Inset background: the soft-gray region paints, the none region doesn't.
    const bgNone = canvasElement.querySelector('[data-testid="panel-bg-none"] [data-slot="block-members"]');
    const bgSoft = canvasElement.querySelector('[data-testid="panel-bg-soft"] [data-slot="block-members"]');
    if (!(bgNone instanceof HTMLElement) || !(bgSoft instanceof HTMLElement)) throw new Error("expected both background regions");
    await expect(getComputedStyle(bgNone).backgroundColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    await expect(getComputedStyle(bgSoft).backgroundColor).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // The invisible rectangle member renders nothing; its sibling renders.
    const primitiveSlots = canvasElement.querySelectorAll('[data-testid="panel-primitive"] [data-slot="block-member"]');
    await expect(primitiveSlots).toHaveLength(1);
    await expect(primitiveSlots[0].getAttribute("data-member-id")).toBe("keep");
  },
};

/* ------------------------------------------------------------------ */
/* ShowCardsAndMembers — PortEdge's two-toggle idiom on members: show    */
/* members gates the CONTENT (out of the DOM, not opacity 0), show cards */
/* gates a translucent red overlay drawn OVER each member — never a      */
/* wrapper, so showing it can't reflow the member it describes           */
/* (docs/FEEDBACK-2026-09-17b-PLAN.md, Lane B).                          */
/* ------------------------------------------------------------------ */

function visibilityMembers(): BlockMember[] {
  return [
    { id: "v-a", content: band("member a") },
    { id: "v-b", content: band("member b") },
  ];
}

function MembersVisibilityPanel({ showMembers, showCards, caption }: { showMembers: boolean; showCards: boolean; caption: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Block width={220} header="combo" members={visibilityMembers()} membersLayout="stack" showMembers={showMembers} showCards={showCards} />
      <Caption>{caption}</Caption>
    </div>
  );
}

function ShowCardsAndMembersDemo() {
  const [showMembers, setShowMembers] = useState(true);
  const [showCards, setShowCards] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="interactive">
        <div style={{ display: "flex", gap: 16 }}>
          <Checkbox label="Show members" checked={showMembers} onChange={setShowMembers} />
          <Checkbox label="Show cards" checked={showCards} onChange={setShowCards} />
        </div>
        <Block width={260} header="toggle me" members={visibilityMembers()} membersLayout="stack" showMembers={showMembers} showCards={showCards} />
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }} data-testid="combos">
        <MembersVisibilityPanel showMembers={true} showCards={false} caption="members on, cards off — bare members (default)" />
        <MembersVisibilityPanel showMembers={true} showCards={true} caption="members on, cards on — a red overlay traces each member, unchanged underneath" />
        <MembersVisibilityPanel showMembers={false} showCards={true} caption="members off, cards on — overlay still draws on the reserved footprint" />
        <MembersVisibilityPanel showMembers={false} showCards={false} caption="members off, cards off — nothing member-related renders" />
      </div>
    </div>
  );
}

export const ShowCardsAndMembers: Story = {
  render: () => <ShowCardsAndMembersDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const interactive = canvasElement.querySelector('[data-testid="interactive"]');
    if (!(interactive instanceof HTMLElement)) throw new Error("expected the interactive panel");

    // Starts with both members visible.
    await expect(interactive.querySelectorAll('[data-slot="block-member"]')).toHaveLength(2);
    await expect(within(interactive).getByText("member a")).toBeInTheDocument();

    // N6: showMembers=false removes members from the DOM entirely — no
    // slots, no content, not an opacity trick — while the Block itself
    // still renders.
    await userEvent.click(canvas.getByLabelText("Show members"));
    await waitFor(() => {
      expect(interactive.querySelectorAll('[data-slot="block-member"]')).toHaveLength(0);
      expect(within(interactive).queryByText("member a")).toBeNull();
    });
    await expect(interactive.querySelector('[data-slot="block"]')).not.toBeNull();

    // The toggle restores them.
    await userEvent.click(canvas.getByLabelText("Show members"));
    await waitFor(() => {
      expect(interactive.querySelectorAll('[data-slot="block-member"]')).toHaveLength(2);
      expect(within(interactive).getByText("member a")).toBeInTheDocument();
    });

    // B1 — Zach's complaint, measured (docs/FEEDBACK-2026-09-17b-PLAN.md,
    // Lane B: "the members seem to shrink a bit to fit inside the card").
    // Every member's own content box, before turning cards on vs after,
    // must be IDENTICAL — width/height/x/y, tolerance 0. DOM presence
    // proves nothing here; only the numbers do.
    const memberContentRects = () =>
      Array.from(interactive.querySelectorAll('[data-slot="block-member"]')).map((slot) => {
        const content = Array.from(slot.children).find((child) => child.getAttribute("data-slot") !== "block-member-card");
        if (!content) throw new Error("expected a member content element");
        return content.getBoundingClientRect();
      });
    const beforeCards = memberContentRects();
    await expect(beforeCards).toHaveLength(2);

    // Cards: on, each member gets an overlay.
    await userEvent.click(canvas.getByLabelText("Show cards"));
    await waitFor(() => {
      expect(interactive.querySelectorAll('[data-slot="block-member-card"]')).toHaveLength(2);
    });
    const afterCards = memberContentRects();
    beforeCards.forEach((before, i) => {
      const after = afterCards[i];
      expect(after.width).toBe(before.width);
      expect(after.height).toBe(before.height);
      expect(after.x).toBe(before.x);
      expect(after.y).toBe(before.y);
    });

    // B3: the overlay is absolutely positioned (contributes nothing to the
    // slot's size) and inert to the pointer (can't steal a member drag).
    const overlays = Array.from(interactive.querySelectorAll('[data-slot="block-member-card"]'));
    for (const overlay of overlays) {
      const style = getComputedStyle(overlay);
      await expect(style.position).toBe("absolute");
      await expect(style.pointerEvents).toBe("none");
    }

    // ...and absent again once the toggle goes back off (B3's other half).
    await userEvent.click(canvas.getByLabelText("Show cards"));
    await waitFor(() => {
      expect(interactive.querySelectorAll('[data-slot="block-member-card"]')).toHaveLength(0);
    });

    // Static combos: members off + cards on = empty cards (no content);
    // both off = nothing member-related at all.
    const combos = canvasElement.querySelector('[data-testid="combos"]');
    if (!(combos instanceof HTMLElement)) throw new Error("expected the combos panel");
    const panels = Array.from(combos.children) as HTMLElement[];
    await expect(panels[2].querySelectorAll('[data-slot="block-member-card"]')).toHaveLength(2);
    await expect(within(panels[2]).queryByText("member a")).toBeNull();
    await expect(panels[3].querySelectorAll('[data-slot="block-member"]')).toHaveLength(0);
    await expect(panels[3].querySelector('[data-slot="block"]')).not.toBeNull();

    // B4: members off + cards on still reserves the empty-card footprint —
    // the one place the overlay is allowed to affect geometry, since there
    // is no content box left to preserve.
    const emptySlots = Array.from(panels[2].querySelectorAll('[data-slot="block-member"]')) as HTMLElement[];
    await expect(emptySlots.length).toBeGreaterThan(0);
    for (const slot of emptySlots) {
      await expect(slot.getBoundingClientRect().height).toBeGreaterThanOrEqual(EMPTY_CARD_MIN_PX);
    }
  },
};

/* ------------------------------------------------------------------ */
/* ReorderMembers — drag a stacked member like a kanban card. The play   */
/* function drives a REAL PointerSensor drag and measures the dragged    */
/* element's box mid-gesture: reordering must never resize a member.     */
/* ------------------------------------------------------------------ */

function ReorderDemo() {
  const [members, setMembers] = useState<BlockMember[]>(() =>
    ["one", "two", "three"].map((id) => ({
      id,
      content: <Block style={{ width: "100%" }} header={`card_${id}`} />,
    })),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Block width={300} header="drag to reorder" members={members} membersLayout="stack" onMembersChange={setMembers} />
      <Caption>drag any member past another — order commits on drop, like kanban cards</Caption>
    </div>
  );
}

export const ReorderMembers: Story = {
  render: () => <ReorderDemo />,
  play: async ({ canvasElement }) => {
    const slotIds = () =>
      Array.from(canvasElement.querySelectorAll('[data-slot="block-member"]')).map((s) => s.getAttribute("data-member-id"));
    await expect(slotIds()).toEqual(["one", "two", "three"]);

    const slotOne = canvasElement.querySelector('[data-member-id="one"]');
    const slotThree = canvasElement.querySelector('[data-member-id="three"]');
    if (!(slotOne instanceof HTMLElement) || !(slotThree instanceof HTMLElement)) throw new Error("expected member slots one and three");

    // N5: a real pointer drag reorders, and the dragged element's box stays
    // within 1px of its pre-drag size throughout the gesture.
    const { before, mid, after } = await dragMemberMeasuring(slotOne, slotThree);
    await expect(Math.abs(mid.width - before.width)).toBeLessThanOrEqual(1);
    await expect(Math.abs(mid.height - before.height)).toBeLessThanOrEqual(1);
    await expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    await expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    await waitFor(() => {
      expect(slotIds()).toEqual(["two", "three", "one"]);
    });
  },
};

/* ------------------------------------------------------------------ */
/* ClassExample — the one Zach cares most about: the class is the outer  */
/* block and the methods are the inner blocks, stacked.                  */
/* ------------------------------------------------------------------ */

const METHOD_NAMES = ["__init__()", "__call__()", "in_1_cb()", "in_2_cb()", "in_3_cb()"];

const METHOD_MEMBERS: BlockMember[] = METHOD_NAMES.map((name) => ({
  id: name,
  content: (
    <Block
      style={{ width: "100%" }}
      header={
        <Bar
          size="sm"
          left={
            <span className="font-mono" style={{ fontSize: 12 }}>
              {name}
            </span>
          }
        />
      }
    />
  ),
}));

export const ClassExample: Story = {
  render: () => (
    <Block
      width={320}
      header={
        <Bar
          left={
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Glyph content="lucide:box" />
              <EditableText size="sm">Component</EditableText>
            </div>
          }
          // WHY the badge sits in the Bar's own `right` slot, not beside the
          // title: Bar's grid is `1fr auto 1fr`, so the left cell caps at
          // half the width — title + badge together truncated the class
          // name to "Com…" at width 320 (measured live).
          right={<Badge variant="secondary">class</Badge>}
        />
      }
      members={METHOD_MEMBERS}
      membersLayout="stack"
      insetBackground="soft-gray"
      footer={<Bar size="sm" center={`${METHOD_NAMES.length} methods`} />}
    />
  ),
  play: async ({ canvasElement }) => {
    // N7: real nesting — a [data-slot="block"] inside another one.
    const outer = canvasElement.querySelector('[data-slot="block"]');
    if (!(outer instanceof HTMLElement)) throw new Error("expected the outer block");
    const innerBlocks = outer.querySelectorAll('[data-slot="block-members"] [data-slot="block"]');
    await expect(innerBlocks).toHaveLength(METHOD_NAMES.length);

    // The methods stack in authored order…
    const slots = Array.from(outer.querySelectorAll('[data-slot="block-member"]'));
    await expect(slots.map((s) => s.getAttribute("data-member-id"))).toEqual(METHOD_NAMES);

    // …and N1 again, with more members: EVERY consecutive gap equal within 1px.
    const gaps = consecutiveGaps(slots);
    await expect(gaps).toHaveLength(METHOD_NAMES.length - 1);
    for (const gap of gaps) await expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1);
  },
};

/* ------------------------------------------------------------------ */
/* CodeInsideBlock — boxes all the way down: a CodeEditor is a member of  */
/* an "Attributes" Block (line numbers off, small header, no footer),    */
/* and that whole Block is itself a member of a parent Block.            */
/* ------------------------------------------------------------------ */

function AttributesCard({
  headerSize = "sm",
  withFooter = false,
  showHeaderDivider = true,
}: {
  headerSize?: "sm" | "md" | "lg";
  withFooter?: boolean;
  showHeaderDivider?: boolean;
}) {
  const [code, setCode] = useState("pose: Pose\nquality: float");
  return (
    <Block
      style={{ width: "100%" }}
      header={<Bar size={headerSize} left={<Text style={{ fontSize: headerSize === "lg" ? 14 : 12 }}>Attributes</Text>} />}
      // Footer visibility is the EXISTING contract: omit the prop and the
      // region is omitted entirely — no new Block surface needed for it.
      footer={withFooter ? <Bar size="sm" center="2 attributes" /> : undefined}
      showHeaderDivider={showHeaderDivider}
      members={[{ id: "code", content: <CodeEditor value={code} onWrite={setCode} multiline ariaLabel="attributes" /> }]}
      membersLayout="stack"
    />
  );
}

function ExampleNodePanel({ testId, caption, children }: { testId: string; caption: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid={testId}>
      <Block
        width={360}
        header={
          <Bar
            left={
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Glyph content="lucide:rocket" />
                <EditableText size="sm">ExampleNode</EditableText>
              </div>
            }
          />
        }
        members={[
          // C-4 (docs/FEEDBACK-2026-09-17b-PLAN.md, Lane C): Zach wants the
          // Attributes card flush with the parent — `inset: "edge-to-edge"`
          // is the existing per-member knob (blockMembers.tsx), not a new
          // one; `slotClassName` there already squares its corners.
          { id: "attributes", content: children, inset: "edge-to-edge" },
          { id: "note", content: <Text tone="muted" style={{ fontSize: 12 }}>any other member sits beside it</Text> },
        ]}
        membersLayout="stack"
        insetBackground="soft-gray"
      />
      <Caption>{caption}</Caption>
    </div>
  );
}

/** The gallery: the same nested Attributes card under three chrome recipes. */
function CodeInsideBlockDemo() {
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <ExampleNodePanel testId="variant-default" caption="default — small header, divider shown, no footer">
        <AttributesCard />
      </ExampleNodePanel>
      <ExampleNodePanel testId="variant-large-footer" caption="large header, footer showing">
        <AttributesCard headerSize="lg" withFooter />
      </ExampleNodePanel>
      <ExampleNodePanel testId="variant-minimal" caption="header divider hidden, smaller header, footer hidden">
        <AttributesCard headerSize="sm" showHeaderDivider={false} />
      </ExampleNodePanel>
    </div>
  );
}

export const CodeInsideBlock: Story = {
  render: () => <CodeInsideBlockDemo />,
  play: async ({ canvasElement }) => {
    const outerIn = (panelId: string) => {
      const outer = canvasElement.querySelector(`[data-testid="${panelId}"] [data-slot="block"]`);
      if (!(outer instanceof HTMLElement)) throw new Error(`expected the outer block in ${panelId}`);
      return outer;
    };
    const nestedIn = (panelId: string) => {
      const outer = outerIn(panelId);
      const nested = outer.querySelector('[data-slot="block-members"] [data-slot="block"]');
      if (!(nested instanceof HTMLElement)) throw new Error(`expected a nested block member in ${panelId}`);
      return nested;
    };
    const headerOf = (nested: HTMLElement) => {
      const header = nested.querySelector('[data-slot="block-header"]');
      if (!(header instanceof HTMLElement)) throw new Error("expected a nested block header");
      return header;
    };

    // N7 (unchanged, on the default panel): two real nesting levels, the
    // CodeEditor a member OF the nested block, line numbers off.
    const nestedDefault = nestedIn("variant-default");
    const editor = nestedDefault.querySelector('[data-slot="block-members"] [data-slot="code-editor"]');
    await expect(editor).not.toBeNull();
    await expect(within(nestedDefault).getByText("pose: Pose")).toBeInTheDocument();
    await expect(nestedDefault.querySelector(".cm-gutters")).toBeNull();
    await expect(nestedDefault.querySelector('[data-slot="block-footer"]')).toBeNull();

    // C3 (docs/FEEDBACK-2026-09-17b-PLAN.md, Lane C): the Attributes card
    // is `inset: "edge-to-edge"` — its rendered box must be FLUSH with the
    // outer Block's inner edge, measured, not a prop/class assertion. The
    // outer Block's own 1px border is the only slack allowed.
    const outerDefault = outerIn("variant-default");
    const outerStyle = getComputedStyle(outerDefault);
    const outerRect = outerDefault.getBoundingClientRect();
    const outerInnerLeft = outerRect.left + parseFloat(outerStyle.borderLeftWidth);
    const outerInnerRight = outerRect.right - parseFloat(outerStyle.borderRightWidth);
    const attributesRect = nestedDefault.getBoundingClientRect();
    await expect(Math.abs(attributesRect.left - outerInnerLeft)).toBeLessThanOrEqual(1);
    await expect(Math.abs(attributesRect.right - outerInnerRight)).toBeLessThanOrEqual(1);

    // M5: no divider prop passed → the divider still renders. Measured,
    // not class-sniffed: the wrapper's real painted border width.
    await expect(getComputedStyle(headerOf(nestedDefault)).borderBottomWidth).toBe("1px");

    // M3 — variant A: large header (Bar data-size "lg", larger than the
    // "md" default) AND a footer region present.
    const nestedLarge = nestedIn("variant-large-footer");
    await expect(headerOf(nestedLarge).querySelector('[data-slot="bar"]')?.getAttribute("data-size")).toBe("lg");
    await expect(nestedLarge.querySelector('[data-slot="block-footer"]')).not.toBeNull();

    // M4 — variant B: smaller header ("sm"), no footer, and the header
    // wrapper paints NO divider — border-bottom-width computes to 0px.
    const nestedMinimal = nestedIn("variant-minimal");
    await expect(headerOf(nestedMinimal).querySelector('[data-slot="bar"]')?.getAttribute("data-size")).toBe("sm");
    await expect(nestedMinimal.querySelector('[data-slot="block-footer"]')).toBeNull();
    await expect(getComputedStyle(headerOf(nestedMinimal)).borderBottomWidth).toBe("0px");
  },
};
