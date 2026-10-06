// src/shell/shellPanelRail.tsx — the shell's right rail: one surface at a time
// (Frames · Problems · an optional host Inspector), the surface switch, and
// Escape to close.
//
// PROVENANCE: lifted from apps/systemsketch/src/chrome/panels.tsx at 75991ce
// (B-SHELL-P1 §4.2 row 4) — `PanelShell`, `FramesPanel`, `ProblemsPanel`, the
// `SurfaceSwitch` and the Escape listener moved here; the CONTENT stayed with
// the host. The frames items and the problems findings are host vocabulary
// (regions and expanded blocks; `PORT_SIDES`, the validation level), and the
// Inspector surface is host-supplied until L-INSPECTOR rebuilds it — so each
// arrives as data or as a node.
//
// WHY one rail with a switch inside it rather than a launcher per surface
// (kept from panels.tsx): MEASURED in the studio at 1400x900, keyless,
// 2026-09-21, a sixth strip cell lifted the whole bottom-right cluster off the
// corner row (clearance -31.1px) — the placement Zach rejected on 2026-09-19
// ("please move the right corner menu to be truly in the right corner"). So a
// third surface costs the corner nothing and is reached from inside the rail.
import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Frame, SlidersHorizontal, TriangleAlert } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "../components/toggle-group";
import { FramesPanel, type FramesPanelMode, type FramesPanelProps } from "../editor/framesPanel";
import { PanelShell } from "../editor/panelShell";
import { ProblemsPanel, type ProblemsPanelProps } from "../editor/problemsPanel";

import { useAffordance, useHostPort } from "./BboxShell";

/** Which rail surface is open. One at a time, or none. */
export type ShellPanel = "frames" | "problems" | "inspector";

const PANEL_TITLE: Record<ShellPanel, string> = {
  frames: "Frames",
  problems: "Problems",
  inspector: "Inspector",
};

export interface ShellPanelState {
  open: ShellPanel | null;
  /** The raw setter, for host policy that opens a surface by itself (the
   *  studio's Inspector follows the selection). Not a user gesture. */
  setOpen: Dispatch<SetStateAction<ShellPanel | null>>;
  /** Pressing the open one closes it, pressing another swaps. */
  toggle(panel: ShellPanel): void;
  /** The rail's own switch: show this surface. */
  switchSurface(panel: ShellPanel): void;
  close(): void;
}

/**
 * The rail's one-at-a-time state. `onUserChange` runs before every change a
 * PERSON made (a launcher, the switch, ✕, Escape) — the hook a host uses to
 * hand the rail back to the user when its own policy had opened it.
 */
export function useShellPanel(options: { onUserChange?(): void } = {}): ShellPanelState {
  const [open, setOpen] = useState<ShellPanel | null>(null);
  const onUserChange = useRef(options.onUserChange);
  onUserChange.current = options.onUserChange;

  const toggle = useCallback((panel: ShellPanel) => {
    // One at a time: the kit's `StatusStripItem.active` is already the
    // toggle's `aria-pressed`, so this is the whole policy.
    onUserChange.current?.();
    setOpen((current) => (current === panel ? null : panel));
  }, []);
  const switchSurface = useCallback((panel: ShellPanel) => {
    onUserChange.current?.();
    setOpen(panel);
  }, []);
  const close = useCallback(() => {
    onUserChange.current?.();
    setOpen(null);
  }, []);
  return { open, setOpen, toggle, switchSurface, close };
}

/** The Frames surface's content, from the host. The view mode is the rail's. */
export type ShellFramesContent = Omit<FramesPanelProps, "mode" | "onModeChange">;

/** The Problems surface's content, from the host. The filter is the rail's. */
export type ShellProblemsContent = Omit<ProblemsPanelProps, "filter" | "onFilterChange">;

export interface ShellPanelRailProps {
  open: ShellPanel | null;
  onClose(): void;
  onSurfaceChange(panel: ShellPanel): void;
  /** The rail element's id — the strip's launchers point `aria-controls` here. */
  id: string;
  /** The Frames content — or a HOOK that returns it, called only while the
   *  Frames surface is showing. WHY a hook is allowed: a host's frames list
   *  is usually a live read of its document (the studio's re-derives on every
   *  store change), and computing it while the rail is closed re-renders the
   *  whole chrome on every pointer move. Before the lift it was read inside
   *  the Frames surface for exactly that reason (panels.tsx at 75991ce). */
  frames: ShellFramesContent | (() => ShellFramesContent);
  problems: ShellProblemsContent;
  /** A host's Inspector surface. Absent → no Inspector in the switch. */
  inspector?: ReactNode;
  /** Where the rail's top starts, container-relative px — a host measures
   *  its own furniture (the studio clears tldraw's `SharePanel` seat). */
  top?: number;
  /** Stamps `${prefix}-surface-<id>` on each surface switch row. */
  testIdPrefix?: string;
}

function FramesSurface({ frames }: { frames: ShellPanelRailProps["frames"] }) {
  const [mode, setMode] = useState<FramesPanelMode>("cards");
  // Same hook every render for a given host (the prop is a module-level
  // function or plain data), so the rules of hooks hold.
  const content = typeof frames === "function" ? frames() : frames;
  return <FramesPanel {...content} mode={mode} onModeChange={setMode} />;
}

function ProblemsSurface({ content }: { content: ShellProblemsContent }) {
  const [filter, setFilter] = useState("all");
  return <ProblemsPanel {...content} filter={filter} onFilterChange={setFilter} />;
}

function SurfaceSwitch({
  open,
  onSurfaceChange,
  withInspector,
  testIdPrefix,
}: {
  open: ShellPanel;
  onSurfaceChange(panel: ShellPanel): void;
  withInspector: boolean;
  testIdPrefix?: string;
}) {
  const testId = (surface: ShellPanel) => (testIdPrefix ? `${testIdPrefix}-surface-${surface}` : undefined);
  return (
    <div data-slot="ss-panel-surfaces" className="sticky top-0 z-10 border-b border-border bg-popover px-3.5 py-2">
      <ToggleGroup
        value={[open]}
        onValueChange={(value: string[]) => {
          const next = value[0];
          if (next) onSurfaceChange(next as ShellPanel);
        }}
        spacing={0}
        aria-label="Panel surface"
      >
        <ToggleGroupItem value="frames" variant="outline" aria-label="Frames" data-testid={testId("frames")}>
          <Frame />
        </ToggleGroupItem>
        <ToggleGroupItem value="problems" variant="outline" aria-label="Problems" data-testid={testId("problems")}>
          <TriangleAlert />
        </ToggleGroupItem>
        {withInspector ? (
          <ToggleGroupItem value="inspector" variant="outline" aria-label="Inspector" data-testid={testId("inspector")}>
            <SlidersHorizontal />
          </ToggleGroupItem>
        ) : null}
      </ToggleGroup>
    </div>
  );
}

const RAIL_TOP_FLOOR = 8;

export function ShellPanelRail({ open, onClose, onSurfaceChange, id, frames, problems, inspector, top = RAIL_TOP_FLOOR, testIdPrefix }: ShellPanelRailProps) {
  const port = useHostPort();
  const showFrames = useAffordance("panel.frames");
  const showProblems = useAffordance("panel.problems");

  // Escape closes the rail — on the window, so it works wherever focus is.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!port || !open) return null;
  if (open === "frames" && !showFrames) return null;
  if (open === "problems" && !showProblems) return null;
  if (open === "inspector" && inspector === undefined) return null;

  return (
    <div id={id} className="pointer-events-auto absolute right-2 bottom-[6.5rem] w-[340px] max-w-[calc(100%-1rem)]" style={{ top }}>
      <PanelShell eyebrow="Right panel" title={PANEL_TITLE[open]} onClose={onClose} data-surface={open}>
        <SurfaceSwitch open={open} onSurfaceChange={onSurfaceChange} withInspector={inspector !== undefined} testIdPrefix={testIdPrefix} />
        {open === "frames" ? (
          <FramesSurface frames={frames} />
        ) : open === "problems" ? (
          <ProblemsSurface content={problems} />
        ) : (
          inspector
        )}
      </PanelShell>
    </div>
  );
}
