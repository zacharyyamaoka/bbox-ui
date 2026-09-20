// src/chrome/statusStrip.tsx — the bottom-right cluster: the two panel
// launchers and the zoom readout.
//
// `@trunk/components/statusStrip` takes a flat `StatusStripItem[]` plus one
// `children` readout and stamps `data-slot="status-strip"`; the host decides
// what the launchers ARE and what "active" means. This file is that decision
// for SystemSketch: exactly two surfaces, because exactly two panels exist.
import type { ReactNode } from "react";
import { Code2, Frame } from "lucide-react";
import { useEditor, useValue } from "tldraw";

import { ProblemsBadge } from "@trunk/components/problemsPanel";
import { StatusStrip, type StatusStripItem } from "@trunk/components/statusStrip";

/** Which right-hand panel is open. One at a time, or none. */
export type ChromePanel = "frames" | "problems";

export interface SystemSketchStatusStripProps {
  open: ChromePanel | null;
  onToggle(panel: ChromePanel): void;
  /** Rides the Problems triangle as its count chip. */
  problemCount: number;
  /** The panel element's own id, for `aria-controls`/`aria-expanded`. */
  panelId: string;
  /**
   * WHY this is its own boolean rather than a third `ChromePanel`: the dev
   * panel (`chrome/devtools.tsx`) is `@trunk/components/devPanel`'s own
   * dialog, not another member of `./panels.tsx`'s one-at-a-time right-rail
   * `SystemSketchPanel` — pressing it must not close Frames or Problems, and
   * pressing Frames must not close it. Overloading `ChromePanel` would make
   * those two genuinely different toggle policies look like one. The
   * overlay owns the boolean; this file only renders the button that flips
   * it.
   */
  devPanelOpen: boolean;
  onToggleDevPanel(): void;
}

/**
 * WHY the test id sits on a WRAPPER around each item's icon rather than on
 * the button itself: `statusStrip.tsx`'s `StripButton` stamps `aria-label`,
 * `aria-pressed`, `aria-expanded`, `aria-controls` and `title` — and no
 * `data-testid` at all (read it: lines 93-122; `StatusStripItem` has no
 * `testIdPrefix` field either). The kit's own universal rule is
 * "`testIdPrefix?: string` — no test id derived from display text", which
 * this surface simply has not grown yet. A wrapper inside the button carries
 * the id onto a real element the acceptance suite can click, and the click
 * bubbles to the button that owns the behaviour — no fork of the kit, no
 * second button.
 *
 * OWED UPSTREAM: `StatusStripProps.testIdPrefix`, stamping
 * `${prefix}-${item.id}` on each `StripButton`. At that point this wrapper
 * comes out and `testIdPrefix="ss-status"` goes in.
 */
function idTag(testId: string, icon: ReactNode) {
  return (
    <span data-testid={testId} className="inline-flex items-center justify-center">
      {icon}
    </span>
  );
}

export function SystemSketchStatusStrip({
  open,
  onToggle,
  problemCount,
  panelId,
  devPanelOpen,
  onToggleDevPanel,
}: SystemSketchStatusStripProps) {
  const editor = useEditor();
  const zoom = useValue("ss zoom", () => Math.round(editor.getZoomLevel() * 100), [editor]);

  const items: StatusStripItem[] = [
    {
      id: "frames",
      label: "Frames",
      icon: idTag("ss-status-frames", <Frame className="size-4" aria-hidden="true" />),
      active: open === "frames",
      onSelect: () => onToggle("frames"),
      controlsId: panelId,
    },
    {
      id: "problems",
      // The count belongs to the compound icon, not to `badge` — the kit
      // splits those two on purpose (`StatusStripItem.badge`'s own doc).
      label: problemCount === 1 ? "1 problem" : `${problemCount} problems`,
      icon: idTag("ss-status-problems", <ProblemsBadge count={problemCount} />),
      active: open === "problems",
      onSelect: () => onToggle("problems"),
      controlsId: panelId,
    },
    {
      id: "dev",
      label: "Dev",
      icon: idTag("ss-status-dev", <Code2 className="size-4" aria-hidden="true" />),
      active: devPanelOpen,
      onSelect: onToggleDevPanel,
      // No `controlsId`: the dev panel is a modal dialog, not an inline
      // disclosure this button expands in place, so `aria-controls` /
      // `aria-expanded` (which only fire when `controlsId` is set — this
      // kit's own `StripButton`) would claim a relationship that is not
      // there.
    },
  ];

  return (
    <StatusStrip items={items}>
      {/* The readout slot. A zoom MENU is stock tldraw's `ZoomMenu`, which
          this app leaves mounted nowhere — the dock owns tools, the pill owns
          the selection, and the camera is driven by the frames panel and the
          usual gestures. So this is a readout, honestly labelled, and not a
          trigger dressed up as one. */}
      <span aria-label={`Zoom ${zoom} percent`}>{zoom}%</span>
    </StatusStrip>
  );
}
