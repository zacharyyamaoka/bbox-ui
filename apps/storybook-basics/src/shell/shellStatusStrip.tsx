// src/shell/shellStatusStrip.tsx — the shell's status strip window: the
// Frames/Problems launchers, the zoom readout over `viewport().zoom`, and the
// stacked form's column count.
//
// PROVENANCE: lifted from apps/systemsketch/src/chrome/statusStrip.tsx at
// 75991ce (B-SHELL-P1 §4.2 row 3). The host keeps what speaks its engine: the
// grid toggle (a tldraw preference), the dev and help cells, and the zoom
// menu's rows (tldraw's stock `view-zoom` actions) — handed in as `leading`,
// `trailing` and `readout`, in the order the strip always showed them:
// grid · frames · problems | zoom | dev · help.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Frame } from "lucide-react";

import { ProblemsBadge } from "../editor/problemsPanel";
import { StatusStrip, type StatusStripItem } from "../editor/statusStrip";

import { useAffordance, useHostPort, useHostValue } from "./BboxShell";
import type { ShellPanel } from "./shellPanelRail";

export interface ShellStatusStripProps {
  /** Which rail surface is open — the launchers' `aria-pressed`. */
  panel: ShellPanel | null;
  onTogglePanel(panel: ShellPanel): void;
  /** The rail's own element id, for `aria-controls`. */
  panelId: string;
  /** Rides the Problems triangle as its count chip. */
  problemCount: number;
  /** Host cells BEFORE Frames (the studio's grid toggle). */
  leading?: readonly StatusStripItem[];
  /** Host cells AFTER Problems (the studio's dev and help). */
  trailing?: readonly StatusStripItem[];
  /** The readout slot, given the rounded zoom percentage. Absent → the
   *  percentage as text. */
  readout?(zoomPercent: number): ReactNode;
  /** Stamps `${prefix}-frames` / `${prefix}-problems` on each launcher. */
  testIdPrefix?: string;
}

/**
 * WHY the test id sits on a WRAPPER around each item's icon rather than on
 * the button itself (kept from statusStrip.tsx at 75991ce): the trunk's
 * `StripButton` stamps `aria-label`, `aria-pressed`, `aria-expanded`,
 * `aria-controls` and `title` — and no `data-testid` at all. A wrapper inside
 * the button carries the id onto a real element a test can click, and the
 * click bubbles to the button that owns the behaviour. OWED UPSTREAM:
 * `StatusStripProps.testIdPrefix`.
 */
export function stripIcon(testId: string | undefined, icon: ReactNode): ReactNode {
  return (
    <span data-testid={testId} className="inline-flex items-center justify-center">
      {icon}
    </span>
  );
}

export function ShellStatusStrip({
  panel,
  onTogglePanel,
  panelId,
  problemCount,
  leading = [],
  trailing = [],
  readout,
  testIdPrefix,
}: ShellStatusStripProps) {
  const port = useHostPort();
  const showFrames = useAffordance("panel.frames");
  const showProblems = useAffordance("panel.problems");
  const showZoom = useAffordance("status.zoom");
  const zoom = useHostValue((p) => Math.round(p.viewport().zoom * 100), 100);

  const items = useMemo(() => {
    const own: StatusStripItem[] = [];
    if (showFrames) {
      own.push({
        id: "frames",
        label: "Frames",
        icon: stripIcon(testIdPrefix && `${testIdPrefix}-frames`, <Frame className="size-4" aria-hidden="true" />),
        active: panel === "frames",
        onSelect: () => onTogglePanel("frames"),
        controlsId: panelId,
      });
    }
    if (showProblems) {
      own.push({
        id: "problems",
        label: problemCount === 1 ? "1 problem" : `${problemCount} problems`,
        icon: stripIcon(testIdPrefix && `${testIdPrefix}-problems`, <ProblemsBadge count={problemCount} />),
        active: panel === "problems",
        onSelect: () => onTogglePanel("problems"),
        controlsId: panelId,
      });
    }
    return [...leading, ...own, ...trailing];
  }, [leading, trailing, showFrames, showProblems, panel, onTogglePanel, panelId, problemCount, testIdPrefix]);

  if (!port) return null;

  /**
   * The stacked form's column count, from the SAME array the row renders:
   * the leading cells over the readout and the trailing cells (G-STALE's
   * narrow corner, `corner.smoke.test.tsx:116`). A host's stacking CSS reads
   * `--shell-strip-columns`; a new cell updates one place.
   */
  const leadingCount = Math.ceil(items.length / 2);
  const stackedColumns = Math.max(1, 2 * leadingCount - 1, 2 * (items.length - leadingCount) + 1);

  return (
    <div className="contents" style={{ "--shell-strip-columns": stackedColumns } as CSSProperties}>
      <StatusStrip items={items}>{showZoom ? (readout ? readout(zoom) : `${zoom}%`) : null}</StatusStrip>
    </div>
  );
}
