/**
 * Blocks/Fit To Content — the three cases Zach named (PROJECT - Black Box
 * UI.md, "### Fit to content", 2026-09-18), plus the bug he remembered.
 *
 *   • port view     — "dynamically resizes as you add more ports"
 *   • expanded view — "dynamically resizes as you drag the members children
 *                      around"
 *   • auto fit      — "useful when resizing a parent expanded block to fit
 *                      the children inside"
 *   • and: "even in manual mode I think it would make sense actually if it
 *          resizes.. a minimum height for blocks based on the number of
 *          ports they have"
 *
 * ───────────────────────────────────────────────────────────────────────
 * WHY NO COMPONENT WAS CHANGED TO BUILD THIS
 *
 * `Block` already takes `height?: number` ("Omit to hug the rendered
 * regions", block.tsx:73). Fit-to-content was never a missing component
 * capability — it was a missing NUMBER. Every block below is a stock
 * `Block`/`BlockPort` whose `height` prop is whatever `src/layout/
 * fitToContent.ts` computed. That is the load-bearing claim of this file,
 * and it is why the feature can ship as pure math plus wiring rather than
 * as a component rewrite.
 *
 * The one thing a caller still has to do by hand is measure the Block's
 * chrome (`useBlockChrome` below), because `BlockPort` measures the very
 * same bands internally and does not hand them back. That is the single
 * owed-wiring item this lane could not close from outside `src/components`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor } from "storybook/test";

import { Block } from "./block";
import { BLOCK_MEMBER_INSET_PX, type BlockMember } from "./blockMembers";
import { BlockPort, railPitches } from "./blockPort";
import { PORT_EDGE_SLOT_MIN_PX, RAIL_GAP_PX, type BlockPortLayout } from "./blockPort.layout";
import type { PortEdgeItem } from "./portEdge";
import type { Distribution } from "./portEdge.layout";
import { Text } from "./text";
import {
  DEFAULT_MEMBER_INSET_PX,
  blockExpandedFitHeight,
  blockPortViewMinHeight,
  railBandHeightForSlots,
  railPitchForBand,
  resolveBlockHeight,
  type MemberRect,
} from "../scene/fitToContent";

const meta = {
  title: "Blocks/Fit To Content",
  tags: ["area:blocks", "lane:fit-to-content"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The pitch a correctly-sized rail holds: one slot box plus one gap. */
const FULL_PITCH_PX = PORT_EDGE_SLOT_MIN_PX + RAIL_GAP_PX;

/** What a Block was given before this lane: a number somebody typed. */
const MANUAL_HEIGHT_PX = 150;

/** `AddPortsLive`'s own, deliberately lower manual box — see its demo. */
const LIVE_MANUAL_HEIGHT_PX = 110;

/* ------------------------------------------------------------------ */
/* Measuring the chrome                                                */
/* ------------------------------------------------------------------ */

interface BlockChrome {
  /** Block border-box top → the content band's top. Includes the top
   *  border, so `blockHeight = chromeTopPx + band + chromeBottomPx` holds
   *  exactly rather than off by a border width. */
  chromeTopPx: number;
  /** The content band's bottom → Block border-box bottom. */
  chromeBottomPx: number;
}

const NO_CHROME: BlockChrome = { chromeTopPx: 0, chromeBottomPx: 0 };

/**
 * Reads the header/footer chrome out of a rendered Block.
 *
 * WHY this cannot loop even though it feeds the height it measures from:
 * a header's own height does not depend on the Block's height (the header
 * is a natural-height flex child; only the body/members region is
 * `flex: 1`). So the measurement is a FIXED POINT after one pass, and the
 * change guard below stops the state update once it stops moving.
 *
 * WHY the numbers are measured from the BLOCK's border box rather than
 * taken as the header element's own `height`: `BlockBands` defines
 * `bodyTop` as the header's BOTTOM in wrapper-local px
 * (blockPort.tsx:242), which folds the Block's own border into the number.
 * Measuring the header's bare height instead leaves the fit 2px short on
 * every Block — exactly the sort of quiet off-by-a-border that makes a
 * resize feature feel "very buggy".
 */
function useBlockChrome(ref: React.RefObject<HTMLElement | null>): BlockChrome {
  const [chrome, setChrome] = useState<BlockChrome>(NO_CHROME);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const measure = () => {
      const block = root.querySelector<HTMLElement>('[data-slot="block"]');
      if (!block) return;
      const blockRect = block.getBoundingClientRect();
      const header = block.querySelector<HTMLElement>(':scope > [data-slot="block-header"]');
      const footer = block.querySelector<HTMLElement>(':scope > [data-slot="block-footer"]');
      const next: BlockChrome = {
        chromeTopPx: header ? header.getBoundingClientRect().bottom - blockRect.top : 0,
        chromeBottomPx: footer ? blockRect.bottom - footer.getBoundingClientRect().top : 0,
      };
      setChrome((prev) =>
        Math.abs(prev.chromeTopPx - next.chromeTopPx) < 0.5 && Math.abs(prev.chromeBottomPx - next.chromeBottomPx) < 0.5
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [ref]);

  return chrome;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PORT_NAMES = ["gain", "reset", "pose", "twist", "limit", "seed", "mode", "phase"];

function portItems(count: number, prefix: string): PortEdgeItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    label: PORT_NAMES[i % PORT_NAMES.length],
    state: "empty" as const,
  }));
}

function Stage({ children, width = 640 }: { children: ReactNode; width?: number }) {
  return <div style={{ padding: 48, width, boxSizing: "content-box" }}>{children}</div>;
}

function Row({ children, gap = 56 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: "flex", gap, alignItems: "flex-start", flexWrap: "wrap" }}>{children}</div>;
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, maxWidth: 220 }}>
      {children}
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 20, fontSize: 13 }}>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Button({ children, onClick, testId }: { children: ReactNode; onClick(): void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        padding: "3px 10px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--card)",
        color: "var(--card-foreground)",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 1 · Port count drives height                                        */
/* ------------------------------------------------------------------ */

function PortCard({
  count,
  fit,
  portLayout = "inline",
  testId,
}: {
  count: number;
  fit: boolean;
  portLayout?: BlockPortLayout;
  testId: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chrome = useBlockChrome(ref);
  const left = useMemo(() => portItems(count, "in"), [count]);

  // The whole feature, in three lines: how many slots, what floor that
  // implies, and what height the Block is therefore given.
  const minHeightPx = blockPortViewMinHeight({
    leftCount: count,
    rightCount: 0,
    portLayout,
    headerPx: chrome.chromeTopPx,
    footerPx: chrome.chromeBottomPx,
  });
  const height = resolveBlockHeight({
    manualHeightPx: MANUAL_HEIGHT_PX,
    autoFit: false,
    // WHY the floor is passed even with `autoFit: false`: this IS Zach's
    // "even in manual mode ... it resizes". The manual 150px survives
    // untouched while it is big enough and is raised only once the ports
    // genuinely stop fitting — floored, never overridden.
    minHeightPx: fit ? minHeightPx : 0,
  });

  // WHY the caption sits ABOVE the block and the column has a fixed width:
  // with no floor the dots overflow DOWNWARD out of the bottom wall, and a
  // caption underneath would be overprinted by them — the capture of the
  // bug has to be readable, and a rail is `position: absolute` so it will
  // happily paint over anything in its way.
  return (
    <div ref={ref} data-testid={testId} data-port-count={count} data-fit={fit ? "on" : "off"} style={{ width: 250 }}>
      <Caption>
        {count} ports · height {height ?? "hug"}
      </Caption>
      <BlockPort id={testId} view="port" portLayout={portLayout} edges={{ left: { items: left } }}>
        <Block width={190} height={height} header={<Text>planner</Text>} />
      </BlockPort>
    </div>
  );
}

const LADDER_COUNTS = [2, 4, 6, 8];

function PortCountLadderDemo() {
  const [fit, setFit] = useState(true);
  return (
    <Stage width={1180}>
      <Toolbar>
        <Checkbox label="Minimum height from port count" checked={fit} onChange={setFit} />
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)" }}>
          off = today&apos;s behaviour: a typed {MANUAL_HEIGHT_PX}px box, whatever the port count
        </span>
      </Toolbar>
      <Row gap={40}>
        {LADDER_COUNTS.map((n) => (
          <PortCard key={n} count={n} fit={fit} testId={`ladder-${n}`} />
        ))}
      </Row>
    </Stage>
  );
}

export const PortCountLadder: Story = {
  render: () => <PortCountLadderDemo />,
  play: async ({ canvasElement }) => {
    const counts = LADDER_COUNTS;

    const railOf = (n: number) => {
      const card = canvasElement.querySelector(`[data-testid="ladder-${n}"]`);
      if (!card) throw new Error(`no card for ${n}`);
      const rail = card.querySelector('[data-slot="port-edge"]');
      if (!rail) throw new Error(`no rail for ${n}`);
      return rail;
    };
    const blockBox = (n: number) => {
      const card = canvasElement.querySelector(`[data-testid="ladder-${n}"]`);
      const block = card?.querySelector('[data-slot="block"]');
      if (!(block instanceof HTMLElement)) throw new Error(`no block for ${n}`);
      return block.getBoundingClientRect();
    };

    await waitFor(() => expect(railPitches(railOf(8), "column")).toHaveLength(7));

    // (a) The Block GREW with the port count. This is the feature.
    const heights = counts.map((n) => blockBox(n).height);
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }

    // (b) Every existing row kept its pitch — the assertion that catches
    // the squeeze. Measured over EVERY consecutive pair, not a sample:
    // two pitches cannot tell a uniform rail from a drifting one.
    for (const n of counts) {
      const pitches = railPitches(railOf(n), "column");
      expect(pitches).toHaveLength(n - 1);
      for (const p of pitches) expect(p).toBeCloseTo(FULL_PITCH_PX, 0);
    }

    // (c) Every port is INSIDE its Block — no overflow past the bottom
    // wall. This is what fails today on a fixed-height box.
    for (const n of counts) {
      const box = blockBox(n);
      const dots = Array.from(railOf(n).querySelectorAll('[data-slot="port-dot"]'));
      expect(dots).toHaveLength(n);
      for (const dot of dots) {
        const r = dot.getBoundingClientRect();
        expect(r.top).toBeGreaterThanOrEqual(box.top - 1);
        expect(r.bottom).toBeLessThanOrEqual(box.bottom + 1);
      }
    }

    // (d) The measured height IS `max(manual, chrome + band)` — which pins
    // the closed form and "floored, never overridden" in one line. At n=2
    // the floor does NOT bind and the typed 150px survives untouched; from
    // n=4 on the floor takes over. A test that assumed the floor always
    // wins would have hidden exactly the property that makes this safe.
    let floorBoundAtLeastOnce = false;
    let manualWonAtLeastOnce = false;
    for (const n of counts) {
      const box = blockBox(n);
      const card = canvasElement.querySelector(`[data-testid="ladder-${n}"]`)!;
      const header = card.querySelector('[data-slot="block-header"]')!.getBoundingClientRect();
      const chromeTop = header.bottom - box.top;
      const floor = chromeTop + railBandHeightForSlots(n);
      expect(box.height).toBeCloseTo(Math.max(MANUAL_HEIGHT_PX, floor), 0);
      if (floor > MANUAL_HEIGHT_PX) floorBoundAtLeastOnce = true;
      else manualWonAtLeastOnce = true;
    }
    // Both regimes are actually exercised by this ladder — otherwise the
    // assertion above is only testing one branch of the Math.max.
    expect(floorBoundAtLeastOnce).toBe(true);
    expect(manualWonAtLeastOnce).toBe(true);
  },
};

/* ------------------------------------------------------------------ */
/* 2 · The bug: a fixed box, more ports                                */
/* ------------------------------------------------------------------ */

function SqueezeDemo() {
  return (
    <Stage width={1180}>
      <Toolbar>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)" }}>
          a typed {MANUAL_HEIGHT_PX}px box. BlockPort floors it (`minBlockHeightFor`): the box grows, no dot walks out of the bottom wall.
        </span>
      </Toolbar>
      <Row gap={40}>
        {LADDER_COUNTS.map((n) => (
          <PortCard key={n} count={n} fit={false} testId={`squeeze-${n}`} />
        ))}
      </Row>
    </Stage>
  );
}

export const OverflowWithoutAFloor: Story = {
  render: () => <SqueezeDemo />,
  play: async ({ canvasElement }) => {
    const box = (n: number) => {
      const block = canvasElement.querySelector(`[data-testid="squeeze-${n}"] [data-slot="block"]`);
      if (!(block instanceof HTMLElement)) throw new Error(`no block for ${n}`);
      return block.getBoundingClientRect();
    };
    const dots = (n: number) =>
      Array.from(canvasElement.querySelectorAll(`[data-testid="squeeze-${n}"] [data-slot="port-dot"]`));

    await waitFor(() => expect(dots(8)).toHaveLength(8));

    // 2026-09-22 — this story used to MEASURE the bug: every box the same
    // typed height and the eighth dot below the bottom wall. Zach: "Please
    // enforce a minimum height on the blocks … You should never have a
    // rendering issue like this", and `BlockPort` now floors every Block at
    // `minBlockHeightFor`, so the same typed height renders clamped UP
    // wherever the ports need it and is left alone where they do not.
    //
    // Per card, the exact height it must render at, from an oracle written
    // out here rather than asked of `minBlockHeightFor`: the typed box
    // WHEREVER the ports fit in it (untouched — a floor, not a resize), and
    // otherwise exactly the MEASURED header + footer plus the rail's own
    // length, n·slot + (n−1)·gap. A clamp that grew every block, or grew the
    // ones that need it by the wrong amount, fails the ±0.5px here.
    // Chrome as the rails define their band (blockPort.tsx's `useBlockBands`):
    // block border-box top -> header bottom, and footer top -> border-box
    // bottom. So the top border counts, and with no footer nothing does.
    const chromeOf = (n: number) => {
      const block = canvasElement.querySelector(`[data-testid="squeeze-${n}"] [data-slot="block"]`)!;
      const rect = block.getBoundingClientRect();
      const header = block.querySelector(':scope > [data-slot="block-header"]')?.getBoundingClientRect();
      const footer = block.querySelector(':scope > [data-slot="block-footer"]')?.getBoundingClientRect();
      return (header ? header.bottom - rect.top : 0) + (footer ? rect.bottom - footer.top : 0);
    };
    let grew = 0;
    for (const n of LADDER_COUNTS) {
      const needed = chromeOf(n) + n * PORT_EDGE_SLOT_MIN_PX + (n - 1) * RAIL_GAP_PX;
      const want = Math.max(MANUAL_HEIGHT_PX, needed);
      if (needed > MANUAL_HEIGHT_PX) grew += 1;
      expect(Math.abs(box(n).height - want), `${n} ports: rendered ${box(n).height}px, want ${want}px`).toBeLessThanOrEqual(0.5);
    }
    // Both regimes are really exercised: 2 ports fit the typed box, 8 do not.
    expect(box(2).height, "two ports fit — the typed box is left alone").toBeCloseTo(MANUAL_HEIGHT_PX, 0);
    expect(box(8).height, "eight ports need more than the typed box").toBeGreaterThan(MANUAL_HEIGHT_PX);
    expect(grew).toBeGreaterThan(0);
    expect(grew).toBeLessThan(LADDER_COUNTS.length);

    // `aligned` keeps its pitch (portEdge.tsx:490 is `flexShrink: 0`), so
    // the failure used to be OVERFLOW: at 8 ports the last dot hung below
    // the Block's bottom wall. Now every dot of every card is inside it.
    for (const n of LADDER_COUNTS) {
      const bottom = box(n).bottom;
      for (const d of dots(n)) expect(d.getBoundingClientRect().bottom, `${n} ports`).toBeLessThanOrEqual(bottom + 1);
    }

    // ...and at 2 ports nothing is wrong, which is why this is easy to
    // ship and hard to notice.
    const two = box(2);
    for (const d of dots(2)) {
      expect(d.getBoundingClientRect().bottom).toBeLessThanOrEqual(two.bottom + 1);
    }
  },
};

/* ------------------------------------------------------------------ */
/* 3 · Adding a port live                                              */
/* ------------------------------------------------------------------ */

function AddPortsDemo() {
  const [count, setCount] = useState(3);
  const [fit, setFit] = useState(true);
  const [portLayout, setPortLayout] = useState<BlockPortLayout>("inline");
  const ref = useRef<HTMLDivElement | null>(null);
  const chrome = useBlockChrome(ref);

  const left = useMemo(() => portItems(count, "in"), [count]);
  const right = useMemo(() => portItems(2, "out"), []);

  const minHeightPx = blockPortViewMinHeight({
    leftCount: count,
    rightCount: 2,
    portLayout,
    headerPx: chrome.chromeTopPx,
    footerPx: chrome.chromeBottomPx,
  });
  // WHY a smaller manual box than the ladder's: this story is about what
  // happens once the floor is ALREADY binding, so each click can be
  // asserted to cost exactly one pitch. Starting under a manual height that
  // still wins would make the first click cost less than a pitch — true,
  // but it is the ladder's point, not this one's.
  const height = resolveBlockHeight({
    manualHeightPx: LIVE_MANUAL_HEIGHT_PX,
    autoFit: false,
    minHeightPx: fit ? minHeightPx : 0,
  });

  return (
    <Stage width={520}>
      <Toolbar>
        <Button testId="add-port" onClick={() => setCount((c) => Math.min(8, c + 1))}>
          + port
        </Button>
        <Button testId="remove-port" onClick={() => setCount((c) => Math.max(1, c - 1))}>
          − port
        </Button>
        <Checkbox label="minimum height from ports" checked={fit} onChange={setFit} />
        <Checkbox
          label="offset lanes"
          checked={portLayout === "offset"}
          onChange={(on) => setPortLayout(on ? "offset" : "inline")}
        />
      </Toolbar>
      <div ref={ref} data-testid="live-card">
        <BlockPort
          id="live"
          view="port"
          portLayout={portLayout}
          edges={{ left: { items: left }, right: { items: right } }}
        >
          <Block width={220} height={height} header={<Text>controller</Text>} body={<Text tone="muted">live</Text>} />
        </BlockPort>
      </div>
      <div data-testid="readout" style={{ fontFamily: "monospace", fontSize: 11, marginTop: 14, color: "var(--muted-foreground)" }}>
        {count} in · 2 out · {portLayout} · floor {Math.round(minHeightPx)}px · height {height ?? "hug"}
      </div>
    </Stage>
  );
}

export const AddPortsLive: Story = {
  render: () => <AddPortsDemo />,
  play: async ({ canvasElement }) => {
    const block = () => {
      const el = canvasElement.querySelector('[data-testid="live-card"] [data-slot="block"]');
      if (!(el instanceof HTMLElement)) throw new Error("no block");
      return el.getBoundingClientRect();
    };
    const dots = () => canvasElement.querySelectorAll('[data-testid="live-card"] [data-slot="port-dot"]');
    const add = canvasElement.querySelector('[data-testid="add-port"]')!;

    await waitFor(() => expect(dots()).toHaveLength(5)); // 3 in + 2 out

    // Zach's literal ask: "dynamically resizes as you add more ports."
    // Measured as a delta, not asserted as a presence.
    const before = block().height;
    fireEvent.click(add);
    await waitFor(() => expect(dots()).toHaveLength(6));
    await waitFor(() => expect(block().height).toBeGreaterThan(before));

    const after = block().height;
    // One port costs exactly one pitch — no more, no less.
    expect(after - before).toBeCloseTo(FULL_PITCH_PX, 0);

    // Two more, and the growth stays linear.
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(dots()).toHaveLength(8));
    expect(block().height - after).toBeCloseTo(2 * FULL_PITCH_PX, 0);

    // Removing gives it back — the floor tracks down as well as up.
    const remove = canvasElement.querySelector('[data-testid="remove-port"]')!;
    const peak = block().height;
    fireEvent.click(remove);
    await waitFor(() => expect(block().height).toBeLessThan(peak));
  },
};

/* ------------------------------------------------------------------ */
/* 4 · Members drive height (expanded view)                            */
/* ------------------------------------------------------------------ */

function childBlock(label: string) {
  return <Block width={120} header={<Text>{label}</Text>} showHeaderDivider={false} />;
}

const CHILD_H = 37; // measured at runtime by the play function; only a seed.

/**
 * One expanded-view Block over a shared member list.
 *
 * WHY no rails on these two: the members fill the body band, and a rail's
 * labels point INWARD — they would print straight across "encoder" and
 * "filter". Expanded view's fit is about members; ports get their own
 * stories above. Noted rather than hidden.
 */
function MemberCard({
  label,
  dropY,
  autoFit,
  testId,
}: {
  label: string;
  dropY: number;
  autoFit: boolean;
  testId: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chrome = useBlockChrome(ref);
  const [childRects, setChildRects] = useState<MemberRect[]>([]);

  const members: BlockMember[] = useMemo(
    () => [
      { id: "a", x: 16, y: 16, width: "own", content: childBlock("encoder") },
      { id: "b", x: 150, y: dropY, width: "own", content: childBlock("filter") },
    ],
    [dropY],
  );

  // Measure the children's real boxes relative to the members region —
  // "dynamically resizes as you drag the members children around" needs
  // the children's ACTUAL extents, and a member renders at `max-content`,
  // so its size is not knowable from props.
  const measureChildren = useCallback(() => {
    const region = ref.current?.querySelector<HTMLElement>('[data-slot="block-members"]');
    if (!region) return;
    const origin = region.getBoundingClientRect();
    const next = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-slot="block-member"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
    });
    setChildRects((prev) =>
      prev.length === next.length && prev.every((p, i) => Math.abs(p.y - next[i].y) < 0.5 && Math.abs(p.height - next[i].height) < 0.5)
        ? prev
        : next,
    );
  }, []);

  useEffect(measureChildren, [measureChildren, dropY]);

  const fitHeightPx = blockExpandedFitHeight({
    members: childRects.length > 0 ? childRects : [{ x: 16, y: 16, width: 120, height: CHILD_H }],
    headerPx: chrome.chromeTopPx,
    footerPx: chrome.chromeBottomPx,
  });
  const height = resolveBlockHeight({ manualHeightPx: MEMBERS_MANUAL_HEIGHT_PX, autoFit, fitHeightPx });

  return (
    <div ref={ref} data-testid={testId} style={{ width: 330 }}>
      <Caption>
        {label} · height {height ?? "hug"}
      </Caption>
      <Block width={300} height={height} header={<Text>pipeline</Text>} members={members} membersLayout="free" />
    </div>
  );
}

/** Deliberately too short for a dragged-down member — that is the point. */
const MEMBERS_MANUAL_HEIGHT_PX = 160;

function MembersDemo() {
  const [dropY, setDropY] = useState(90);
  return (
    <Stage width={760}>
      <Toolbar>
        <Button testId="drag-down" onClick={() => setDropY((y) => y + 60)}>
          drag &quot;filter&quot; down
        </Button>
        <Button testId="drag-up" onClick={() => setDropY((y) => Math.max(30, y - 60))}>
          drag it back up
        </Button>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted-foreground)" }}>
          member y = {dropY}
        </span>
      </Toolbar>
      <Row gap={40}>
        <MemberCard label={`manual ${MEMBERS_MANUAL_HEIGHT_PX}px`} dropY={dropY} autoFit={false} testId="members-manual" />
        <MemberCard label="auto fit to members" dropY={dropY} autoFit testId="members-fitted" />
      </Row>
    </Stage>
  );
}

export const MembersDriveHeight: Story = {
  render: () => <MembersDemo />,
  play: async ({ canvasElement }) => {
    const blockBox = (which: string) => {
      const el = canvasElement.querySelector(`[data-testid="members-${which}"] [data-slot="block"]`);
      if (!(el instanceof HTMLElement)) throw new Error(`no ${which} block`);
      return el.getBoundingClientRect();
    };
    const memberBoxes = (which: string) =>
      Array.from(
        canvasElement.querySelectorAll<HTMLElement>(
          `[data-testid="members-${which}"] [data-slot="block-members"] > [data-slot="block-member"]`,
        ),
      ).map((el) => el.getBoundingClientRect());
    const lowest = (which: string) => memberBoxes(which).reduce((a, b) => (a.bottom > b.bottom ? a : b));

    await waitFor(() => expect(memberBoxes("fitted")).toHaveLength(2));

    // The constant this lane re-declared must equal the component's own.
    // Checked here rather than in the node unit test because
    // blockMembers.tsx is a React module — this is the browser project.
    expect(DEFAULT_MEMBER_INSET_PX).toBe(BLOCK_MEMBER_INSET_PX);

    // The manual box is too short and its lowest child is laid out BELOW
    // the Block's bottom wall. Note this is not a visible overflow the way
    // an overhanging port is: Block's root is `overflow: clip`
    // (block.tsx:265), so the child is simply PAINTED NOWHERE. A rect that
    // exists outside a box that clips it is the worst of the three failure
    // modes — nothing to see, nothing to warn on.
    expect(blockBox("manual").height).toBeCloseTo(MEMBERS_MANUAL_HEIGHT_PX, 0);
    expect(lowest("manual").bottom).toBeGreaterThan(blockBox("manual").bottom);

    // The fitted one contains every child, with the gutter underneath
    // rather than flush against the wall.
    for (const m of memberBoxes("fitted")) expect(m.bottom).toBeLessThanOrEqual(blockBox("fitted").bottom + 1);
    expect(blockBox("fitted").bottom - lowest("fitted").bottom).toBeCloseTo(BLOCK_MEMBER_INSET_PX, 0);

    // "dynamically resizes as you drag the members children around"
    const startHeight = blockBox("fitted").height;
    fireEvent.click(canvasElement.querySelector('[data-testid="drag-down"]')!);
    await waitFor(() => expect(blockBox("fitted").height).toBeGreaterThan(startHeight));
    // Exactly the drag distance — no more, no less.
    expect(blockBox("fitted").height - startHeight).toBeCloseTo(60, 0);
    // ...while the manual box did not move at all.
    expect(blockBox("manual").height).toBeCloseTo(MEMBERS_MANUAL_HEIGHT_PX, 0);
    // ...and containment survived the growth.
    expect(blockBox("fitted").bottom - lowest("fitted").bottom).toBeCloseTo(BLOCK_MEMBER_INSET_PX, 0);

    // Dragging back up gives the space back.
    fireEvent.click(canvasElement.querySelector('[data-testid="drag-up"]')!);
    await waitFor(() => expect(blockBox("fitted").height).toBeCloseTo(startHeight, 0));
  },
};

/* ------------------------------------------------------------------ */
/* 5 · A parent fitted to its children, on demand                      */
/* ------------------------------------------------------------------ */

/** A parent whose three children run past a deliberately short manual box. */
const PARENT_MANUAL_HEIGHT_PX = 170;

function ParentCard({ label, fitted, testId }: { label: string; fitted: boolean; testId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chrome = useBlockChrome(ref);
  const [childRects, setChildRects] = useState<MemberRect[]>([]);

  const members: BlockMember[] = useMemo(
    () => [
      { id: "a", x: 18, y: 14, width: "own", content: childBlock("ingest") },
      { id: "b", x: 18, y: 96, width: "own", content: childBlock("classify") },
      { id: "c", x: 160, y: 178, width: "own", content: childBlock("place") },
    ],
    [],
  );

  const measure = useCallback(() => {
    const region = ref.current?.querySelector<HTMLElement>('[data-slot="block-members"]');
    if (!region) return;
    const origin = region.getBoundingClientRect();
    setChildRects((prev) => {
      const next = Array.from(region.querySelectorAll<HTMLElement>(':scope > [data-slot="block-member"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
      });
      return prev.length === next.length && prev.every((p, i) => Math.abs(p.y - next[i].y) < 0.5) ? prev : next;
    });
  }, []);
  useEffect(measure, [measure]);

  const fitHeightPx = blockExpandedFitHeight({
    members: childRects,
    headerPx: chrome.chromeTopPx,
    footerPx: chrome.chromeBottomPx,
  });
  const height = resolveBlockHeight({ manualHeightPx: PARENT_MANUAL_HEIGHT_PX, autoFit: fitted, fitHeightPx });

  return (
    <div ref={ref} data-testid={testId} style={{ width: 350 }}>
      <Caption>
        {label} · height {height ?? "hug"} · fit {fitHeightPx == null ? "—" : Math.round(fitHeightPx)}px
      </Caption>
      <Block width={320} height={height} header={<Text>sorter</Text>} members={members} membersLayout="free" />
    </div>
  );
}

function ParentFitsDemo() {
  const [fitted, setFitted] = useState(false);
  return (
    <Stage width={800}>
      <Toolbar>
        <Button testId="fit-parent" onClick={() => setFitted(true)}>
          fit the left one to its children
        </Button>
        <Button testId="unfit-parent" onClick={() => setFitted(false)}>
          back to the manual box
        </Button>
      </Toolbar>
      <Row gap={40}>
        <ParentCard label={fitted ? "fitted" : `manual ${PARENT_MANUAL_HEIGHT_PX}px`} fitted={fitted} testId="parent-card" />
        <ParentCard label="always auto fit" fitted testId="parent-reference" />
      </Row>
      <div style={{ fontFamily: "monospace", fontSize: 11, marginTop: 20, color: "var(--muted-foreground)", maxWidth: 700 }}>
        &ldquo;place&rdquo; is missing from the left card, not overflowing it — Block&apos;s root is{" "}
        <code>overflow: clip</code>, so a member past the wall is painted nowhere at all. Its rect is still there
        (the play function measures it); there is simply nothing to see.
      </div>
    </Stage>
  );
}

export const ParentFitsChildren: Story = {
  render: () => <ParentFitsDemo />,
  play: async ({ canvasElement }) => {
    const parentBox = (which = "parent-card") => {
      const el = canvasElement.querySelector(`[data-testid="${which}"] [data-slot="block"]`);
      if (!(el instanceof HTMLElement)) throw new Error(`no ${which}`);
      return el.getBoundingClientRect();
    };
    const children = (which = "parent-card") =>
      Array.from(
        canvasElement.querySelectorAll<HTMLElement>(`[data-testid="${which}"] [data-slot="block-members"] > [data-slot="block-member"]`),
      ).map((el) => el.getBoundingClientRect());

    await waitFor(() => expect(children()).toHaveLength(3));
    await waitFor(() => expect(parentBox("parent-reference").height).toBeGreaterThan(PARENT_MANUAL_HEIGHT_PX));

    // Before: the manual box is too short and a child is laid out past the
    // bottom wall — where `overflow: clip` means it is drawn NOT AT ALL.
    const spillBefore = children().filter((c) => c.bottom > parentBox().bottom + 1);
    expect(spillBefore.length).toBeGreaterThan(0);

    fireEvent.click(canvasElement.querySelector('[data-testid="fit-parent"]')!);

    // After: every child is contained, and the parent is no bigger than it
    // has to be — containment ALONE would be satisfied by an absurdly tall
    // box, so the tightness assertion is what makes this a fit.
    await waitFor(() => {
      for (const c of children()) expect(c.bottom).toBeLessThanOrEqual(parentBox().bottom + 1);
    });
    const lowest = children().reduce((a, b) => (a.bottom > b.bottom ? a : b));
    expect(parentBox().bottom - lowest.bottom).toBeCloseTo(BLOCK_MEMBER_INSET_PX, 0);

    // The fitted card and the always-fitted reference agree exactly — the
    // computation is a function of the members, not of how it was reached.
    expect(parentBox().height).toBeCloseTo(parentBox("parent-reference").height, 0);

    // ...and it is reversible: the manual box comes straight back.
    fireEvent.click(canvasElement.querySelector('[data-testid="unfit-parent"]')!);
    await waitFor(() => expect(parentBox().height).toBeCloseTo(PARENT_MANUAL_HEIGHT_PX, 0));
  },
};

/* ------------------------------------------------------------------ */
/* 6 · The floor a distribution asks for is NOT the same number        */
/* ------------------------------------------------------------------ */

const DISTRIBUTIONS: { label: string; value: Distribution }[] = [
  { label: "aligned", value: { mode: "aligned", anchor: "start", gap: RAIL_GAP_PX, edgePadding: 0 } },
  { label: "space-between", value: { mode: "distribute", scheme: "space-between" } },
  { label: "space-around", value: { mode: "distribute", scheme: "space-around" } },
  { label: "space-evenly", value: { mode: "distribute", scheme: "space-evenly" } },
];

const DIST_PORTS = 4;

function DistributionFloorCard({ label, distribution, sized }: { label: string; distribution: Distribution; sized: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chrome = useBlockChrome(ref);
  // `sized` off = one band height for everybody (the `aligned` one), which
  // is the tempting simplification. On = each distribution gets the band IT
  // needs.
  const band = railBandHeightForSlots(DIST_PORTS, sized ? { distribution } : {});
  const height = chrome.chromeTopPx + band + chrome.chromeBottomPx;
  const testId = `dist-${sized ? "sized" : "unsized"}-${label}`;

  return (
    <div ref={ref} data-testid={testId} data-dist={label} style={{ width: 240 }}>
      <Caption>
        band {Math.round(band)}px · pitch {Math.round(railPitchForBand(band, DIST_PORTS, distribution))}px
      </Caption>
      <BlockPort id={testId} view="port" edges={{ left: { items: portItems(DIST_PORTS, "in"), distribution } }}>
        <Block width={180} height={height} header={<Text>{label}</Text>} />
      </BlockPort>
    </div>
  );
}

function DistributionFloorDemo() {
  return (
    <Stage width={1120}>
      <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
        One band height for all four — the tempting simplification
      </div>
      <Row gap={32}>
        {DISTRIBUTIONS.map((d) => (
          <DistributionFloorCard key={d.label} label={d.label} distribution={d.value} sized={false} />
        ))}
      </Row>
      <div style={{ margin: "48px 0 10px", fontSize: 13, fontWeight: 600 }}>
        Each band sized for ITS OWN distribution — all four back on 42px
      </div>
      <Row gap={32}>
        {DISTRIBUTIONS.map((d) => (
          <DistributionFloorCard key={d.label} label={d.label} distribution={d.value} sized />
        ))}
      </Row>
    </Stage>
  );
}

export const DistributionChangesTheFloor: Story = {
  render: () => <DistributionFloorDemo />,
  play: async ({ canvasElement }) => {
    const pitchesOf = (row: "sized" | "unsized", label: string) => {
      const rail = canvasElement.querySelector(`[data-testid="dist-${row}-${label}"] [data-slot="port-edge"]`);
      if (!rail) throw new Error(`no rail for ${row}/${label}`);
      return railPitches(rail, "column");
    };

    await waitFor(() => expect(pitchesOf("sized", "space-evenly")).toHaveLength(DIST_PORTS - 1));

    // Top row — one band for all. This row used to come up short for the
    // two schemes that spend gap on the ENDS (the second bug of the
    // family). Since 2026-09-22 `BlockPort` floors every Block at
    // `minBlockHeightFor`, which sizes the band for the rail's OWN
    // distribution — so the tempting one-size height is clamped up and all
    // four hold the full pitch here too (Zach: "Please enforce a minimum
    // height on the blocks … that can be calculated from the minimum port
    // spacing").
    for (const { label } of DISTRIBUTIONS) {
      expect(pitchesOf("unsized", label)[0], `unsized ${label}`).toBeCloseTo(FULL_PITCH_PX, 0);
    }

    // Bottom row — sized per distribution: all four land on the same pitch,
    // every consecutive pair, not just the first.
    for (const { label } of DISTRIBUTIONS) {
      const pitches = pitchesOf("sized", label);
      expect(pitches).toHaveLength(DIST_PORTS - 1);
      for (const p of pitches) expect(p).toBeCloseTo(FULL_PITCH_PX, 0);
    }
  },
};
