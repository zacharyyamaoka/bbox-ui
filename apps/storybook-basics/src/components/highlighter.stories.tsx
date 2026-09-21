import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "./button";
import {
  DIAGNOSTIC_FLAG_SIZE_PX,
  DIAGNOSTIC_SEVERITIES,
  DiagnosticFlag,
  DiagnosticTooltip,
  diagnosticUnderlineStyle,
  highlighterMaskFrameStyle,
  highlighterStrokeOutlineStyle,
  maxDiagnosticSeverity,
  type Diagnostic,
} from "./highlighter";

/**
 * src/components/highlighter.stories.tsx — the highlighter MODULE's own
 * surfaces: `DiagnosticFlag` (the anchored corner chip and its popover),
 * `DiagnosticTooltip` (the hover half), and the three style recipes every
 * mark-bearing component paints with.
 *
 * WHY beside `Styles/Diagnostics`: that file is the AXIS — one gallery per
 * marked component (Port, Block, Trace, EditableText, …), showing what a
 * diagnostic looks like on each of them. It never renders `DiagnosticFlag`
 * or `DiagnosticTooltip` directly, because a host never does either: they
 * arrive through `Block`'s corner and `LabeledPort`'s slot. This file is
 * the other half — the composition on its own, at the sizes and severities
 * it publishes, plus the two geometry helpers (`stroke`/`mask`) whose
 * correctness is a measurable offset rather than a look.
 *
 * Every assertion below reads the module's own exports as its oracle:
 * `DIAGNOSTIC_SEVERITIES` for the closed set, `maxDiagnosticSeverity` for
 * which one wins, `DIAGNOSTIC_FLAG_SIZE_PX` for the chip's diameter, and
 * `diagnosticUnderlineStyle` for the wavy/dotted split — never a literal.
 */

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-testid={`panel-${label}`}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}
    >
      {children}
      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</span>
    </div>
  );
}

function one(severity: Diagnostic["severity"]): Diagnostic[] {
  return [{ id: `one-${severity}`, severity, message: `A single ${severity}`, code: `X${severity.length}` }];
}

/** Deliberately out of severity order, and info-first, so a flag that read
 *  `diagnostics[0]` instead of the worst would visibly pick the wrong one. */
const MIXED: Diagnostic[] = [
  { id: "mx1", severity: "info", message: "Renamed from `frame_in`", code: "I100" },
  { id: "mx2", severity: "error", message: "Type mismatch: expected number, got string", code: "TS2322" },
  { id: "mx3", severity: "warning", message: "Unused output", code: "W041" },
];

const STROKE_OFFSET_PX = 6;
const MASK_OFFSET_PX = 6;
const MASK_BASE_RADIUS_CSS = "8px";

const meta = {
  title: "Styles/Highlighter",
  tags: ["area:styles", "lane:floating-toolbars-2026-09-20"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * One flag per member of the closed severity set — the row is built from
 * `DIAGNOSTIC_SEVERITIES` itself, so a fourth severity would appear here
 * without this file changing.
 */
export const SeverityFlags: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 28 }}>
      {DIAGNOSTIC_SEVERITIES.map((severity) => (
        <Panel key={severity} label={severity}>
          <DiagnosticFlag diagnostics={one(severity)} />
        </Panel>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const borders = new Set<string>();

    for (const severity of DIAGNOSTIC_SEVERITIES) {
      const panel = canvas.getByTestId(`panel-${severity}`);
      const flag = panel.querySelector('[data-slot="diagnostic-flag"]');
      if (!(flag instanceof HTMLElement)) throw new Error(`expected a flag for ${severity}`);

      await expect(flag.getAttribute("data-severity")).toBe(severity);
      // One finding = no count chip, which is the pre-list single-mark read.
      await expect(flag.getAttribute("data-count")).toBeNull();
      await expect(flag.querySelector('[data-slot="diagnostic-flag-count"]')).toBeNull();
      // The label a screen reader gets, singular for one finding.
      await expect(flag.getAttribute("aria-label")).toBe(`1 ${severity} diagnostic`);

      // The published diameter, measured — a chip that drifted off
      // `DIAGNOSTIC_FLAG_SIZE_PX` would no longer straddle a Block's corner
      // the way every caller positions it.
      const box = flag.getBoundingClientRect();
      await expect(Math.abs(box.width - DIAGNOSTIC_FLAG_SIZE_PX)).toBeLessThan(0.5);
      await expect(Math.abs(box.height - DIAGNOSTIC_FLAG_SIZE_PX)).toBeLessThan(0.5);

      // `diagnosticColorVar`'s var() chain must actually RESOLVE — an
      // unported token would silently compute to currentcolor and every
      // severity would paint the same.
      borders.add(getComputedStyle(flag).borderTopColor);
    }

    await expect(borders.size).toBe(DIAGNOSTIC_SEVERITIES.length);
  },
};

/**
 * "One mark, N messages": the chrome is painted once at the WORST severity
 * present, and the count chip — the one piece of chrome a scalar
 * `diagnostic` could never have rendered — reports how many are hiding
 * behind it.
 */
export const WorstSeverityWins: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 28 }}>
      <Panel label="mixed">
        <DiagnosticFlag diagnostics={MIXED} />
      </Panel>
      <Panel label="two-infos">
        <DiagnosticFlag
          diagnostics={[
            { id: "i1", severity: "info", message: "Renamed" },
            { id: "i2", severity: "info", message: "Deprecated alias" },
          ]}
        />
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const flag = canvas.getByTestId("panel-mixed").querySelector('[data-slot="diagnostic-flag"]');
    if (!(flag instanceof HTMLElement)) throw new Error("expected the mixed flag");

    // The oracle is the exported reducer, not a hand-picked answer — and
    // deliberately not `MIXED[0]`, which is an info.
    const worst = maxDiagnosticSeverity(MIXED);
    await expect(worst).not.toBe(MIXED[0].severity);
    await expect(flag.getAttribute("data-severity")).toBe(worst);
    await expect(flag.getAttribute("aria-label")).toBe(`${MIXED.length} ${worst} diagnostics`);

    // Count chip present, and reading the real length.
    await expect(flag.getAttribute("data-count")).toBe(String(MIXED.length));
    const count = flag.querySelector('[data-slot="diagnostic-flag-count"]');
    await expect(count?.textContent).toBe(String(MIXED.length));

    // A list of equals still resolves to that severity, not to "worse
    // because there are more of them".
    const infos = canvas.getByTestId("panel-two-infos").querySelector('[data-slot="diagnostic-flag"]');
    await expect(infos?.getAttribute("data-severity")).toBe("info");
    await expect(infos?.getAttribute("data-count")).toBe("2");

    // An empty list has no worst severity at all — the contract that lets a
    // mark-bearing component render no flag rather than a neutral one.
    await expect(maxDiagnosticSeverity([])).toBeUndefined();
    await expect(maxDiagnosticSeverity(undefined)).toBeUndefined();
  },
};

/**
 * The click half of the interaction contract: the full anatomy — one row
 * per diagnostic, each with its message and code chip, plus the host's own
 * actions and footer. The popover can only show what the flag was handed,
 * which is the whole reason `diagnostics` is a list.
 */
export const FlagPopoverAnatomy: Story = {
  render: () => (
    <Panel label="anatomy">
      <DiagnosticFlag
        diagnostics={MIXED}
        actions={<Button size="sm">Quick fix</Button>}
        footer={<span>View problem</span>}
      />
    </Panel>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /diagnostics$/ });

    await expect(document.body.querySelector('[data-slot="diagnostic-flag-content"]')).toBeNull();
    await userEvent.click(trigger);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="diagnostic-flag-content"]')).not.toBeNull();
    });

    const content = document.body.querySelector('[data-slot="diagnostic-flag-content"]');
    if (!(content instanceof HTMLElement)) throw new Error("expected the flag popover");
    const body = within(content);

    // Every finding survives to the popover — message AND code — including
    // the two the chip's own single severity had to drop.
    for (const diagnostic of MIXED) {
      await expect(body.getByText(diagnostic.message ?? "")).toBeInTheDocument();
      await expect(body.getByText(diagnostic.code ?? "")).toBeInTheDocument();
    }
    // Each code rides a Badge, not bare text.
    await expect(content.querySelectorAll('[data-slot="badge"]')).toHaveLength(MIXED.length);

    // The host's own slots, in their own rows.
    await expect(content.querySelector('[data-slot="diagnostic-flag-actions"]')?.textContent).toBe("Quick fix");
    await expect(content.querySelector('[data-slot="diagnostic-flag-footer"]')?.textContent).toBe("View problem");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="diagnostic-flag-content"]')).toBeNull();
    });
  },
};

/**
 * `DiagnosticTooltip` is a thin wrapper, not a new visual: an absent or
 * empty list renders `children` completely untouched, so a mark-bearing
 * component pays zero DOM cost at rest.
 */
export const TooltipOnlyWhenMarked: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 28 }}>
      <Panel label="clean">
        <DiagnosticTooltip diagnostics={[]}>
          <span data-testid="clean-text">frame_in</span>
        </DiagnosticTooltip>
      </Panel>
      <Panel label="marked">
        <DiagnosticTooltip diagnostics={MIXED}>
          <span data-testid="marked-text" style={diagnosticUnderlineStyle("error")}>
            frame_in
          </span>
        </DiagnosticTooltip>
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Rest: no trigger, no provider, nothing wrapped around the child.
    const clean = canvas.getByTestId("panel-clean");
    await expect(clean.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
    await expect(canvas.getByTestId("clean-text").parentElement).toBe(clean);

    // Marked: the child ITSELF becomes the trigger (Base UI's `render`
    // merge), rather than being wrapped in an extra element.
    const marked = canvas.getByTestId("marked-text");
    await expect(marked.getAttribute("data-slot")).toBe("tooltip-trigger");

    await expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    await userEvent.hover(marked);
    await waitFor(
      () => {
        expect(document.body.querySelector('[data-slot="tooltip-content"]')).not.toBeNull();
      },
      { timeout: 3000 },
    );

    const content = document.body.querySelector('[data-slot="tooltip-content"]');
    if (!(content instanceof HTMLElement)) throw new Error("expected the tooltip content");
    // The hover half shows the same full list the popover does — one row
    // per diagnostic, message and code, and no action controls.
    await expect(content.querySelectorAll('[data-slot="diagnostic-tooltip-body"] > div')).toHaveLength(
      MIXED.length,
    );
    for (const diagnostic of MIXED) {
      await expect(content.textContent).toContain(diagnostic.message);
      await expect(content.textContent).toContain(diagnostic.code);
    }
    await expect(content.querySelector("button")).toBeNull();

    await userEvent.unhover(marked);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    });
  },
};

/**
 * The underline every text-bearing mark wears: wavy for `error`/`warning`,
 * dotted for `info` — the same split §5 draws between a halo and nothing,
 * restated in the underline's own vocabulary.
 */
export const Underlines: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 28, fontSize: 16 }}>
      {DIAGNOSTIC_SEVERITIES.map((severity) => (
        <Panel key={severity} label={severity}>
          <span data-testid={`underline-${severity}`} style={diagnosticUnderlineStyle(severity)}>
            frame_in
          </span>
        </Panel>
      ))}
      <Panel label="plain">
        <span data-testid="underline-plain">frame_in</span>
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const colors = new Set<string>();

    for (const severity of DIAGNOSTIC_SEVERITIES) {
      const text = canvas.getByTestId(`underline-${severity}`);
      const style = getComputedStyle(text);

      await expect(style.textDecorationLine).toBe("underline");
      // The RULE, stated independently of the helper that implements it:
      // info is the dotted one, the other two are wavy.
      await expect(style.textDecorationStyle).toBe(severity === "info" ? "dotted" : "wavy");
      colors.add(style.textDecorationColor);
    }

    // Three severities, three resolved colours — and none of them the
    // inherited text colour, which is what an unresolved token would give.
    await expect(colors.size).toBe(DIAGNOSTIC_SEVERITIES.length);
    const plain = getComputedStyle(canvas.getByTestId("underline-plain"));
    await expect(plain.textDecorationLine).toBe("none");
    await expect(colors.has(plain.color)).toBe(false);
  },
};

/**
 * The two rectangle recipes, on the same box at the same offset.
 * `stroke` is a plain CSS `outline` (cheap, but its corners follow the
 * element's OWN radius, so it stops being equidistant); `mask` is a sibling
 * frame grown by `offsetPx` on every side, with its radius grown to match —
 * the thing `outline-offset` cannot do.
 */
export const StrokeAndMaskGeometry: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 40, padding: 16 }}>
      <Panel label="stroke">
        <div
          data-testid="stroke-box"
          style={{
            width: 120,
            height: 56,
            borderRadius: MASK_BASE_RADIUS_CSS,
            background: "var(--muted)",
            ...highlighterStrokeOutlineStyle("var(--bbox-danger, var(--destructive))", STROKE_OFFSET_PX),
          }}
        />
      </Panel>
      <Panel label="mask">
        <div
          data-testid="mask-box"
          style={{
            position: "relative",
            width: 120,
            height: 56,
            borderRadius: MASK_BASE_RADIUS_CSS,
            background: "var(--muted)",
          }}
        >
          <div
            data-testid="mask-frame"
            style={highlighterMaskFrameStyle(
              "var(--bbox-danger, var(--destructive))",
              MASK_OFFSET_PX,
              MASK_BASE_RADIUS_CSS,
            )}
          />
        </div>
      </Panel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const stroke = getComputedStyle(canvas.getByTestId("stroke-box"));
    await expect(stroke.outlineStyle).toBe("solid");
    await expect(stroke.outlineOffset).toBe(`${STROKE_OFFSET_PX}px`);
    await expect(stroke.outlineWidth).toBe("2px");

    const box = canvas.getByTestId("mask-box");
    const frame = canvas.getByTestId("mask-frame");
    const boxRect = box.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    // Measured, all four sides: the frame is exactly `offsetPx` outside the
    // marked box — equidistant, which is the whole point of `mask`.
    await expect(Math.abs(boxRect.left - frameRect.left - MASK_OFFSET_PX)).toBeLessThan(0.5);
    await expect(Math.abs(boxRect.top - frameRect.top - MASK_OFFSET_PX)).toBeLessThan(0.5);
    await expect(Math.abs(frameRect.right - boxRect.right - MASK_OFFSET_PX)).toBeLessThan(0.5);
    await expect(Math.abs(frameRect.bottom - boxRect.bottom - MASK_OFFSET_PX)).toBeLessThan(0.5);

    // …and its radius is the box's own, grown by the same offset, so the
    // gap stays constant around the corners too.
    const frameStyle = getComputedStyle(frame);
    const expectedRadius = Number.parseFloat(MASK_BASE_RADIUS_CSS) + MASK_OFFSET_PX;
    await expect(Math.abs(Number.parseFloat(frameStyle.borderTopLeftRadius) - expectedRadius)).toBeLessThan(0.5);
    await expect(Math.abs(Number.parseFloat(getComputedStyle(box).borderTopLeftRadius) - expectedRadius)).toBeGreaterThan(
      0.5,
    );

    // The frame never affects the marked element's own layout box, and
    // never eats a pointer event aimed at it.
    await expect(frameStyle.position).toBe("absolute");
    await expect(frameStyle.pointerEvents).toBe("none");
  },
};
