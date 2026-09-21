// src/chrome/panels.tsx — the right rail: one `PanelShell` hosting either the
// Frames panel or the Problems panel, never both.
//
// The open/close policy is the HOST's (docs/menus/MENU-KIT-DESIGN.md §4,
// "Panels": "open/close state (the donor's `reduceChromeState` LRU reducer is
// offered as a recipe in the docs, not a kit export)"). This app's policy is
// the smallest one that is still honest: one at a time, Escape closes, the
// launcher toggles. The state itself lives in `./overlay.tsx`, which is the
// one component that both the strip and this panel are rendered from.
import { useCallback, useEffect, useState } from "react";
import { Box, Frame, GitBranch, Repeat, RotateCw, SlidersHorizontal, Square, TriangleAlert } from "lucide-react";
import { useEditor, useValue, type Editor } from "tldraw";

import { FramesPanel, type FramesPanelMode, type FramesPanelProps } from "@trunk/components/framesPanel";
import { PanelShell } from "@trunk/components/panelShell";
import { ToggleGroup, ToggleGroupItem } from "@trunk/components/toggle-group";
import { ProblemsPanel } from "@trunk/components/problemsPanel";
import { InspectorPanel } from "@trunk/editor/inspectorPanel";

import { BLOCK_SHAPE_TYPE } from "../shapes/types";
import type { BlockShape } from "../shapes/block/BlockShapeUtil";

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
  inspector: "Inspector",
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

/**
 * RULING 9's host half — the right-hand inspector, wired to the ONE selected
 * block. Zach: "the eye visibility control for this is in the right hand
 * inspector menu."
 *
 * `@trunk/editor/inspectorPanel` is engine-agnostic by its kit's own rule
 * (`src/editor/README.md`: no `Editor`, no `useValue`), so THIS file is where
 * tldraw enters: it reads the selection live and turns each callback into an
 * `editor.updateShape`.
 *
 * WHY only a single selection gets a subject, rather than editing the first
 * of many: a description belongs to one block, and a panel that silently
 * edited whichever block happened to be first in a marquee is the kind of
 * multi-target write that is hard to notice and hard to undo. Zero or many
 * selected lands on the panel's own empty state.
 *
 * WHY the description write is NOT squashed into one history entry the way
 * the measured writes in `shapes/shared/measure.ts` are: typing a description
 * is a real edit, and `editor.updateShape` per keystroke is the same
 * granularity the rail-reorder in `shapes/block/BlockFace.tsx` already uses
 * for a real edit.
 */
function InspectorSurface({ editor }: { editor: Editor }) {
  const block = useValue<BlockShape | null>(
    "ss inspector subject",
    () => {
      const only = editor.getOnlySelectedShape();
      return only && only.type === BLOCK_SHAPE_TYPE ? (only as BlockShape) : null;
    },
    [editor],
  );

  const update = useCallback(
    (props: Partial<BlockShape["props"]>) => {
      if (!block) return;
      editor.updateShape({ id: block.id, type: BLOCK_SHAPE_TYPE, props } as never);
    },
    [editor, block],
  );

  return (
    <InspectorPanel
      subject={block ? block.props.name : null}
      // P-043's second door. The picker this opens IS the one the block's own
      // glyph opens (shapes/block/BlockFace.tsx's `BlockGlyph`) — same
      // component, same encoded string, same store write — so a pick made
      // here and a pick made out on the canvas cannot drift apart.
      //
      // `portalContainer` is tldraw's container for the same reason it is
      // there: this panel renders inside `components.InFrontOfTheCanvas`, and
      // a Base UI popup left to default into `document.body` lands outside
      // the board's stacking context.
      glyph={block?.props.glyph ?? ""}
      onGlyphChange={block ? (glyph) => update({ glyph }) : undefined}
      glyphPortalContainer={editor.getContainer()}
      description={block?.props.description ?? ""}
      descriptionVisible={block?.props.showDescription ?? true}
      onDescriptionChange={(description) => update({ description })}
      onDescriptionVisibleChange={(showDescription) => update({ showDescription })}
      // `ss` — the same prefix every other acceptance target in this app
      // carries (`statusStrip.tsx`'s `idTag`).
      testIdPrefix="ss-inspector"
    />
  );
}

/**
 * The rail's own surface switcher — Frames · Problems · Inspector, inside the
 * panel rather than out in the status strip.
 *
 * WHY it is here and not a sixth launcher beside Frames and Problems, which
 * is where the other two live and is the obvious seat for a third: MEASURED
 * in the running app at 1400x900, keyless, 2026-09-21. A sixth strip cell
 * takes the strip from 301.7px to 339.7px wide, and the bottom-right corner
 * row has ~7px of slack between the dock (right edge 870.5) and tldraw's
 * licence watermark (left edge 1296). With the cell added, `placeCornerCluster`
 * (chrome/overlay.tsx) reported `above-licence` and the whole cluster lifted
 * off the corner row — clearance -31.1px. That is the placement Zach rejected
 * by name on 2026-09-19, and `src/corner.smoke.test.tsx` /
 * `src/chromeSize.smoke.test.tsx` are the committed acceptance for it.
 *
 * So the third surface costs the corner nothing. What it costs instead, said
 * plainly: opening the Inspector takes two presses (a launcher, then this
 * row), and while the Inspector is showing neither strip launcher is lit.
 * The panel's own header says "Inspector", which is the signal that replaces
 * the lit button.
 */
function SurfaceSwitch({ open, onSurfaceChange }: { open: ChromePanel; onSurfaceChange(panel: ChromePanel): void }) {
  return (
    <div
      data-slot="ss-panel-surfaces"
      // Sticky, because `PanelShell`'s body is the scroll region: a Frames
      // list long enough to scroll must not carry the switcher off the top.
      className="sticky top-0 z-10 border-b border-border bg-popover px-3.5 py-2"
    >
      <ToggleGroup
        value={[open]}
        onValueChange={(value: string[]) => {
          // Single-select semantics on a `multiple`-shaped primitive
          // (ToggleGroup.stories.tsx's own note): pressing the active item
          // hands back an empty array, and the rail always shows SOMETHING,
          // so an empty change is a no-op rather than a fourth state.
          const next = value[0];
          if (next) onSurfaceChange(next as ChromePanel);
        }}
        spacing={0}
        aria-label="Panel surface"
      >
        <ToggleGroupItem value="frames" variant="outline" aria-label="Frames" data-testid="ss-panel-surface-frames">
          <Frame />
        </ToggleGroupItem>
        <ToggleGroupItem value="problems" variant="outline" aria-label="Problems" data-testid="ss-panel-surface-problems">
          <TriangleAlert />
        </ToggleGroupItem>
        <ToggleGroupItem value="inspector" variant="outline" aria-label="Inspector" data-testid="ss-panel-surface-inspector">
          <SlidersHorizontal />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export interface SystemSketchPanelProps {
  open: ChromePanel | null;
  onClose(): void;
  /** Switch which surface the open rail shows. The strip's own launchers set
   *  this too — pressing Frames while the Inspector is showing swaps it. */
  onSurfaceChange(panel: ChromePanel): void;
  problems: BoardProblems;
  id: string;
}

export function SystemSketchPanel({ open, onClose, onSurfaceChange, problems, id }: SystemSketchPanelProps) {
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
        <SurfaceSwitch open={open} onSurfaceChange={onSurfaceChange} />
        {open === "frames" ? (
          <FramesSurface editor={editor} />
        ) : open === "problems" ? (
          <ProblemsSurface problems={problems} />
        ) : (
          <InspectorSurface editor={editor} />
        )}
      </PanelShell>
    </div>
  );
}
