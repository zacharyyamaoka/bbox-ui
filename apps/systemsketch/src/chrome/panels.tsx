// src/chrome/panels.tsx — the right rail: one `PanelShell` hosting either the
// Frames panel or the Problems panel, never both.
//
// The open/close policy is the HOST's (docs/menus/MENU-KIT-DESIGN.md §4,
// "Panels": "open/close state (the donor's `reduceChromeState` LRU reducer is
// offered as a recipe in the docs, not a kit export)"). This app's policy is
// the smallest one that is still honest: one at a time, Escape closes, the
// launcher toggles. The state itself lives in `./overlay.tsx`, which is the
// one component that both the strip and this panel are rendered from.
import { useEffect, useState } from "react";
import { Box, GitBranch, Repeat, RotateCw, Square } from "lucide-react";
import { useEditor, type Editor } from "tldraw";

import { FramesPanel, type FramesPanelMode, type FramesPanelProps } from "@trunk/components/framesPanel";
import { PanelShell } from "@trunk/components/panelShell";
import { ProblemsPanel } from "@trunk/components/problemsPanel";

import { EXPANDED_BLOCK_KIND, useFrames } from "./frames";
import { PROBLEM_SEVERITIES, type BoardProblems } from "./problems";
import type { ChromePanel } from "./statusStrip";

/**
 * `FramesItem.kind` → icon + caption.
 *
 * WHY the region's own `kind` prop supplies four of the five rows rather than
 * one flat "region": the kit's `kinds` table exists precisely to fix the
 * donor's raw `"EXPANDED-BLOCK"` caption into real words (framesPanel.tsx's
 * design note), and this document already distinguishes a `for` from a
 * `while` from a `branch` in the schema. Collapsing them here would throw
 * away a distinction the document actually makes.
 */
const FRAME_KINDS: FramesPanelProps["kinds"] = {
  for: { icon: <Repeat />, caption: "For region" },
  while: { icon: <RotateCw />, caption: "While region" },
  branch: { icon: <GitBranch />, caption: "Branch region" },
  plain: { icon: <Square />, caption: "Region" },
  [EXPANDED_BLOCK_KIND]: { icon: <Box />, caption: "Expanded block" },
};

const PANEL_TITLE: Record<ChromePanel, string> = {
  frames: "Frames",
  problems: "Problems",
};

function FramesSurface({ editor }: { editor: Editor }) {
  const frames = useFrames(editor);
  const [mode, setMode] = useState<FramesPanelMode>("cards");
  return (
    <FramesPanel
      items={frames.items}
      kinds={FRAME_KINDS}
      mode={mode}
      onModeChange={setMode}
      onFocus={frames.focus}
      onRename={frames.rename}
      onDelete={frames.remove}
      // No `saveView` and no `reorder`, and both absences are the document
      // model talking rather than a shortcut: a saved camera view would be a
      // new persisted concept, and a stored row order would be new persisted
      // metadata — the plan's document-model contract (§3) has neither, and
      // this lane does not get to mint a persisted field from a panel. The
      // order shown is the page's own shape order.
      notices={["Ordered as the page orders its shapes. Saved camera views are not part of this document yet."]}
    />
  );
}

function ProblemsSurface({ problems }: { problems: BoardProblems }) {
  const [filter, setFilter] = useState("all");
  return (
    <ProblemsPanel
      groups={problems.groups}
      counts={problems.counts}
      severities={PROBLEM_SEVERITIES}
      filter={filter}
      onFilterChange={setFilter}
      onActivate={problems.reveal}
      // `ss` → the kit stamps `ss-problems-panel` on its root
      // (problemsPanel.tsx:234), which is the id the acceptance suite names.
      testIdPrefix="ss"
      emptyCopy={{
        clear: ["No problems", "Add and connect Blocks; this view updates as the board changes."],
        filtered: ["No problems", "Choose another severity filter to see the remaining problems."],
      }}
    />
  );
}

export interface SystemSketchPanelProps {
  open: ChromePanel | null;
  onClose(): void;
  problems: BoardProblems;
  id: string;
}

export function SystemSketchPanel({ open, onClose, problems, id }: SystemSketchPanelProps) {
  const editor = useEditor();

  // WHY the listener is on the window and capture-free, and WHY it is only
  // mounted while a panel is open: tldraw's own Escape handling cancels the
  // current tool/selection, and stealing every Escape from the canvas to
  // close a panel that is not open is exactly the kind of global the archive
  // paid for. Mounted only while there is something to close, and it does
  // not stop propagation — closing the panel and cancelling the gesture at
  // the same time is the behaviour both stock tldraw and the donor have.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      id={id}
      // The rail's own geometry. `PanelShell` "fills its given box" by
      // contract and positions nothing itself, so the box is this div.
      className="pointer-events-auto absolute top-2 right-2 bottom-[6.5rem] w-[340px] max-w-[calc(100%-1rem)]"
    >
      <PanelShell eyebrow="Right panel" title={PANEL_TITLE[open]} onClose={onClose} data-surface={open}>
        {open === "frames" ? <FramesSurface editor={editor} /> : <ProblemsSurface problems={problems} />}
      </PanelShell>
    </div>
  );
}
