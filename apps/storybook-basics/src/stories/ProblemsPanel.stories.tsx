import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  ProblemsBadge,
  ProblemsPanel,
  type Diagnostic,
  type DiagnosticGroup,
  type Severity,
} from "../components/problemsPanel";
import { PanelShell } from "../components/panelShell";

const meta = {
  title: "Basics/ProblemsPanel",
  component: ProblemsPanel,
  // WHY base `args`: `groups`/`counts`/`severities`/`filter`/`onFilterChange`/
  // `onActivate` have no sensible default, so CSF3 typegen requires them
  // here. Every story below supplies its own real data via `render`'s
  // closure instead of reading `args` — this fixture only exists to
  // satisfy the required-args contract.
  args: {
    groups: [],
    counts: { all: 0 },
    severities: [],
    filter: "all",
    onFilterChange: fn(),
    onActivate: fn(),
  },
} satisfies Meta<typeof ProblemsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Design decision #5 (docs/menus/MENU-KIT-DESIGN.md §8): the demo config
 * mirrors SystemSketch exactly — two severities get a segmented chip
 * (error/warning); `info` never appears here at all, the same as the
 * donor's own `FILTERS` array.
 */
const SEVERITIES: Severity[] = [
  { id: "error", label: "Errors", glyph: "×", tone: "error" },
  { id: "warning", label: "Warnings", glyph: "!", tone: "warning" },
];

/** The screenshot's own two diagnostic codes (docs/menus/screenshots/07), generated to its own count. */
function screenshotDiagnostics(): Diagnostic[] {
  const titleless = Array.from({ length: 7 }, (_, i) => ({
    id: `block-title-${i}`,
    code: "block-title.blank",
    severity: "warning",
    message: "Block has no title",
    detail: "Name this Block so the board and its diagnostics can identify it.",
  }));
  const ports = ["len() · obj", "encode() · pose", "run() · raws", "run() · gain", "run() · others"];
  const unresolved = ports.map((label, i) => ({
    id: `input-unresolved-${i}`,
    code: "input.unresolved",
    severity: "warning",
    message: `${label} has no value`,
    detail: "Connect an incoming source or give this input a default value.",
  }));
  const filler = Array.from({ length: 163 }, (_, i) => ({
    id: `input-unresolved-filler-${i}`,
    code: "input.unresolved",
    severity: "warning",
    message: `run_05_fan_out_rejoin() · port_${i} has no value`,
    detail: "Connect an incoming source or give this input a default value.",
  }));
  return [...titleless, ...unresolved, ...filler];
}

const SCREENSHOT_GROUPS: DiagnosticGroup[] = [{ id: "board", label: "Board", diagnostics: screenshotDiagnostics() }];
const SCREENSHOT_COUNTS = { all: 175, error: 0, warning: 175 };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ height: 560, width: 320 }}>
      <PanelShell eyebrow="RIGHT PANEL" title="Problems" onClose={fn()}>
        {children}
      </PanelShell>
    </div>
  );
}

/** The exact screenshot 07 composition — 175 warnings, 0 errors, a sticky "Board" group header. */
export const Default: Story = {
  render: function Render() {
    const [filter, setFilter] = useState("all");
    return (
      <Shell>
        <ProblemsPanel
          groups={SCREENSHOT_GROUPS}
          counts={SCREENSHOT_COUNTS}
          severities={SEVERITIES}
          filter={filter}
          onFilterChange={setFilter}
          onActivate={fn()}
        />
      </Shell>
    );
  },
};

/** Clicking a segmented tab filters the visible rows; "All" always stays selectable to return. */
export const FilterBySeverity: Story = {
  render: function Render() {
    const [filter, setFilter] = useState("all");
    const groups: DiagnosticGroup[] = [
      {
        id: "board",
        label: "Board",
        diagnostics: [
          { id: "e1", code: "graph.cycle", severity: "error", message: "Imported dataflow cycle across 3 Blocks", detail: "run() → verify() → run() forms a loop." },
          { id: "e2", code: "port-id.duplicate", severity: "error", message: "decode() reuses port id raw", detail: "A port id is durable identity. It appears 2 times." },
          { id: "w1", code: "block-title.blank", severity: "warning", message: "Block has no title", detail: "Name this Block so the board and its diagnostics can identify it." },
        ],
      },
    ];
    return (
      <Shell>
        <ProblemsPanel
          groups={groups}
          counts={{ all: 3, error: 2, warning: 1 }}
          severities={SEVERITIES}
          filter={filter}
          onFilterChange={setFilter}
          onActivate={fn()}
        />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // WHY scoped to the filter `ToggleGroup` (fixed 2026-09-18): each
    // diagnostic ROW is itself a `<button>` with an `aria-label` that
    // STARTS WITH its severity ("Errors: Imported dataflow cycle…" —
    // `problemsPanel.tsx`'s own severity-label prefix), so
    // `canvas.getByRole("button", { name: /Errors/ })` matched both the
    // filter tab AND that row and threw "found multiple elements". The
    // filter row is the one `role="group"` region in this panel (Base
    // UI's `ToggleGroup` default), so scoping to it is precise without
    // narrowing the regex into something that would just as easily
    // collide with a future diagnostic message.
    const filters = within(canvas.getByRole("group"));
    await expect(canvas.getAllByRole("listitem").length).toBe(3);
    await userEvent.click(filters.getByRole("button", { name: /Errors/ }));
    await expect(canvas.getAllByRole("listitem").length).toBe(2);
    await userEvent.click(filters.getByRole("button", { name: /Warnings/ }));
    await expect(canvas.getAllByRole("listitem").length).toBe(1);
    await userEvent.click(filters.getByRole("button", { name: /^All/ }));
    await expect(canvas.getAllByRole("listitem").length).toBe(3);
  },
};

/** Zero problems — the "clear" empty state, no filter row at all (matches the donor: filters only render when `total > 0`). */
export const Clear: Story = {
  render: () => (
    <Shell>
      <ProblemsPanel groups={[]} counts={{ all: 0, error: 0, warning: 0 }} severities={SEVERITIES} filter="all" onFilterChange={fn()} onActivate={fn()} />
    </Shell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No problems")).toBeInTheDocument();
    await expect(canvas.getByText("Board checks are clear")).toBeInTheDocument();
  },
};

/** Problems exist, but the active filter hides every one of them — the "filtered" empty copy, distinct from "clear". */
export const FilteredToNothing: Story = {
  render: () => {
    const groups: DiagnosticGroup[] = [
      { id: "board", label: "Board", diagnostics: [{ id: "w1", code: "block-title.blank", severity: "warning", message: "Block has no title", detail: "Name this Block." }] },
    ];
    return (
      <Shell>
        <ProblemsPanel groups={groups} counts={{ all: 1, error: 0, warning: 1 }} severities={SEVERITIES} filter="error" onFilterChange={fn()} onActivate={fn()} />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No problems")).toBeInTheDocument();
    await expect(canvas.getByText("Choose another severity filter to see the remaining problems.")).toBeInTheDocument();
  },
};

/** Multiple groups, each with its own sticky header and count. */
export const MultipleGroups: Story = {
  render: () => {
    const groups: DiagnosticGroup[] = [
      { id: "board", label: "Board", diagnostics: [{ id: "w1", code: "block-title.blank", severity: "warning", message: "Block has no title", detail: "Name this Block." }] },
      {
        id: "branch-a",
        label: "Branch A",
        diagnostics: [
          { id: "e1", code: "graph.cycle", severity: "error", message: "Imported dataflow cycle across 2 Blocks", detail: "run() → run() forms a loop." },
        ],
      },
    ];
    return (
      <Shell>
        <ProblemsPanel groups={groups} counts={{ all: 2, error: 1, warning: 1 }} severities={SEVERITIES} filter="all" onFilterChange={fn()} onActivate={fn()} />
      </Shell>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Board")).toBeInTheDocument();
    await expect(canvas.getByText("Branch A")).toBeInTheDocument();
  },
};

/** Clicking a row calls `onActivate` with that exact diagnostic — "select and fit the affected board objects". */
export const ActivateRow: Story = {
  args: { onActivate: fn() },
  render: function Render(args) {
    // See PanelShell.CloseFires: a spy created in the render closure is
    // unreachable from `play`, so this story clicked a diagnostic and
    // asserted nothing. `args` is what makes the assertion possible.
    const groups: DiagnosticGroup[] = [
      { id: "board", label: "Board", diagnostics: [{ id: "w1", code: "block-title.blank", severity: "warning", message: "Block has no title", detail: "Name this Block." }] },
    ];
    return (
      <Shell>
        <ProblemsPanel groups={groups} counts={{ all: 1, error: 0, warning: 1 }} severities={SEVERITIES} filter="all" onFilterChange={fn()} onActivate={args.onActivate} />
      </Shell>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Block has no title"));
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};

/**
 * A severity absent from `severities` — no segmented chip, no icon color of
 * its own (falls back to a plain muted dot), but its diagnostic still
 * counts toward "All". This is what "info counted only" (design decision
 * #5) means as a rendering fallback rather than a hardcoded third case.
 */
export const SeverityNotInConfig: Story = {
  render: () => {
    const groups: DiagnosticGroup[] = [
      { id: "board", label: "Board", diagnostics: [{ id: "i1", code: "port.unused", severity: "info", message: "Output port unused", detail: "No cable reads this output." }] },
    ];
    return (
      <Shell>
        <ProblemsPanel groups={groups} counts={{ all: 1, error: 0, warning: 0 }} severities={SEVERITIES} filter="all" onFilterChange={fn()} onActivate={fn()} />
      </Shell>
    );
  },
};

/** `ProblemsBadge` — the status-strip compound icon, the "99+" clamp, and the zero-count (no chip) case. */
export const Badge: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} data-testid="badge-zero">
        <ProblemsBadge count={0} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>count: 0</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} data-testid="badge-seven">
        <ProblemsBadge count={7} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>count: 7</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} data-testid="badge-clamped">
        <ProblemsBadge count={175} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>count: 175, shown as 99+</span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("99+")).toBeInTheDocument();
    await expect(within(canvas.getByTestId("badge-seven")).getByText("7")).toBeInTheDocument();
    // count={0} renders the triangle with no chip riding it at all.
    await expect(canvas.getByTestId("badge-zero").querySelector('[data-slot="badge"]')).not.toBeInTheDocument();
  },
};
