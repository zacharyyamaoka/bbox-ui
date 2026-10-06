// src/chrome/panels.tsx — the right rail: one `PanelShell` hosting either the
// Frames panel or the Problems panel, never both.
//
// The open/close policy is the HOST's (docs/menus/MENU-KIT-DESIGN.md §4,
// "Panels": "open/close state (the donor's `reduceChromeState` LRU reducer is
// offered as a recipe in the docs, not a kit export)"). This app's policy is
// the smallest one that is still honest: one at a time, Escape closes, the
// launcher toggles, and a click on a block opens the Inspector
// (`./inspectorFollowsSelection.ts`). The state itself lives in `./overlay.tsx`, which is the
// one component that both the strip and this panel are rendered from.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, GitBranch, Repeat, RotateCw, Square } from "lucide-react";
import { useEditor, useValue, type Editor } from "tldraw";

import type { FramesPanelProps } from "@trunk/editor/framesPanel";
import { InspectorPanel } from "@trunk/editor/inspectorPanel";
import { ShellPanelRail, type ShellFramesContent, type ShellProblemsContent } from "@trunk/shell/shellPanelRail";

import { createGestureMark, type GestureMark } from "../document/gestureHistory";
import { BLOCK_SHAPE_TYPE } from "../shapes/types";
import type { BlockShape } from "../shapes/block/BlockShapeUtil";

import { EXPANDED_BLOCK_KIND, useFrames } from "./frames";
import { inspectorSubjectOf } from "./inspectorFollowsSelection";
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
 * WHY the description WRITE is per keystroke and its undo ENTRY is not
 * (P-014): nothing typed here is ever pending, which is P-030's contract, but
 * one Ctrl+Z has to take the whole typing run back. This paragraph used to
 * argue the opposite and it was wrong twice over — `update` carried no
 * history mark at all, so the first keystroke of a description, a glyph pick
 * and a visibility toggle each merged into whatever store transaction came
 * before them. Measured on the canvas door of the SAME picker, 2026-09-21:
 * pick a glyph on a freshly placed block, press Ctrl+Z, and the block was
 * deleted.
 */
function InspectorSurface({ editor }: { editor: Editor }) {
  const block = useValue<BlockShape | null>(
    "ss inspector subject",
    // A region with a corner card is inspected through the card, and every
    // write below lands on the CARD — `inspectorSubjectOf` carries the WHY.
    () => inspectorSubjectOf(editor, editor.getOnlySelectedShape()),
    [editor],
  );

  // P-014. The panel's undo claim, and it has to distinguish two kinds of
  // write: a pick and a toggle are DISCRETE (mark every time), typing is a
  // RUN (mark once). `document/gestureHistory.ts` carries the mechanism.
  //
  // The key names the block, so selecting another one starts a new entry.
  // What it cannot see — the same residual `railGestureKey` records — is two
  // separate typing runs on the SAME block's description with no other marked
  // edit between them; they share an entry. Closing it needs a blur signal
  // from `@trunk/editor/inspectorPanel`, which forwards none today.
  const gesture = useRef<GestureMark | null>(null);
  if (!gesture.current) gesture.current = createGestureMark();

  const update = useCallback(
    (props: Partial<BlockShape["props"]>) => {
      if (!block) return;
      editor.updateShape({ id: block.id, type: BLOCK_SHAPE_TYPE, props } as never);
    },
    [editor, block],
  );

  /** A write that is its own edit: mark now, and end any open typing run. */
  const discrete = useCallback(
    (name: string, props: Partial<BlockShape["props"]>) => {
      gesture.current!.end();
      editor.markHistoryStoppingPoint(name);
      update(props);
    },
    [editor, update],
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
      onGlyphChange={block ? (glyph) => discrete("set glyph", { glyph }) : undefined}
      glyphPortalContainer={editor.getContainer()}
      description={block?.props.description ?? ""}
      descriptionVisible={block?.props.showDescription ?? true}
      onDescriptionChange={(description) => {
        gesture.current!.begin(editor, `description/${block?.id ?? ""}`, "edit description");
        update({ description });
      }}
      onDescriptionVisibleChange={(showDescription) => discrete("show description", { showDescription })}
      // `ss` — the same prefix every other acceptance target in this app
      // carries (`statusStrip.tsx`'s `idTag`).
      testIdPrefix="ss-inspector"
    />
  );
}

/** Same 8px `CORNER_INSET` the bottom-right cluster keeps off tldraw's own
 *  furniture (`../chrome/overlay.tsx`) — the gap this rail's own top keeps
 *  below whatever sits in tldraw's `SharePanel` slot. */
const RAIL_TOP_GAP = 8;
const RAIL_TOP_FLOOR = 8;

/** tldraw's stock top-right seat, mounted with `PyblocksBackendPanel`
 *  (`src/backend/BackendSettings.tsx`, `App.tsx`'s `SharePanel:` line) — the
 *  ONE control this app puts there, and it always renders at least the
 *  closed `Backend: none` trigger (BackendSettings.tsx's own WHY), so the
 *  selector is always findable once the app has mounted. */
const BACKEND_PANEL = '[data-testid="ss-backend"]';

/**
 * Where the rail's own top has to start to clear tldraw's `SharePanel` slot
 * — MEASURED, not a guessed pixel constant, because the widget there is not
 * fixed height: `BackendSettings.tsx` grows it from a one-line `Backend:
 * none` trigger to a health pill plus an `Open Python file…` menu once a
 * pyblocks backend connects (its own header, points 1-4). A rail that only
 * cleared the closed height would go back to intercepting the chip's clicks
 * the moment someone connects a backend.
 *
 * Bug: measured 2026-09-22 at 1400x900 and again at 720x900 (both widths —
 * the chip's own `items-end` layout keeps it flush right either way), the
 * rail opened at `top-2` (8px) while `ss-backend` occupied y 0-42 — the
 * rail's own ✕ (`PanelShell`'s close button) landed at y 21-51, squarely
 * inside the chip, and `elementFromPoint` at the ✕'s centre returned the
 * chip's own trigger button, not the close button.
 *
 * WHY the rail makes room rather than the chip moving: `SharePanel` is
 * tldraw's own documented slot (`App.tsx`'s WHY beside `SharePanel:`), and
 * the rail is this app's own chrome free to sit wherever clears the board —
 * moving tldraw's stock seat would fight the framework's own layout for no
 * reason the chip's contents give.
 */
function useRailTop(railOpen: boolean): number {
  const editor = useEditor();
  const [top, setTop] = useState(RAIL_TOP_FLOOR);

  useLayoutEffect(() => {
    // WHY only while the rail is open (Codex re-judge, 2026-09-22): the
    // MutationObserver below watches the whole canvas subtree, so leaving it
    // armed with the rail closed charged every drag and every culled shape a
    // querySelector for a measurement nothing was using. Re-arming on open
    // re-measures before paint (`useLayoutEffect`), so the rail never opens
    // under the chip.
    if (!railOpen) return;
    const container = editor.getContainer();
    let backend: Element | null = null;

    const measure = () => {
      const rect = backend?.getBoundingClientRect();
      const next = rect ? Math.max(RAIL_TOP_FLOOR, rect.bottom - container.getBoundingClientRect().top + RAIL_TOP_GAP) : RAIL_TOP_FLOOR;
      setTop((current) => (current === next ? current : next));
    };

    const sizes = new ResizeObserver(measure);

    // WHY tracked rather than measured once: `PyblocksBackendPanel` mounts
    // into `SharePanel` on the SAME `onMount` pass as this rail (both are
    // `TLComponents` slots tldraw fills together), so its element may not
    // exist on this hook's first layout pass — and its own box changes
    // later anyway, on connect/disconnect and on the health pill's own
    // content, neither of which is a resize of the CONTAINER this hook
    // would otherwise have to poll for.
    const track = () => {
      const next = container.querySelector(BACKEND_PANEL);
      if (next === backend) return false;
      // `disconnect` drops EVERY target, the container included, so it is
      // re-observed here — otherwise a re-mounted chip would silently stop
      // this hook hearing container resizes.
      sizes.disconnect();
      sizes.observe(container);
      backend = next;
      if (backend) sizes.observe(backend);
      return true;
    };

    const arrivals = new MutationObserver(() => {
      if (track()) measure();
    });
    arrivals.observe(container, { childList: true, subtree: true });

    if (!track()) sizes.observe(container);
    measure();

    return () => {
      arrivals.disconnect();
      sizes.disconnect();
    };
  }, [editor, railOpen]);

  return top;
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

/** The Frames surface's content: this document's regions and expanded
 *  blocks (`./frames.ts`). A hook the shell calls only while Frames is the
 *  showing surface — `useFrames` re-derives on every store change. */
function useStudioFrames(): ShellFramesContent {
  const editor = useEditor();
  const frames = useFrames(editor);
  return useMemo<ShellFramesContent>(
    () => ({
      items: frames.items,
      kinds: FRAME_KINDS,
      onFocus: frames.focus,
      onRename: frames.rename,
      onDelete: frames.remove,
      notices: ["Ordered as the page orders its shapes. Saved camera views are not part of this document yet."],
    }),
    [frames.items, frames.focus, frames.rename, frames.remove],
  );
}

/**
 * The rail's HOST half. Since B-SHELL-P1 the rail itself — `PanelShell`, one
 * surface at a time, the Frames · Problems · Inspector switch (its WHY moved
 * with it), Escape to close, `FramesPanel` and `ProblemsPanel` — is the
 * shell's (`@trunk/shell/shellPanelRail`, lifted from this file at 75991ce).
 * What this app supplies is what speaks its vocabulary: the frames (regions
 * and expanded blocks, `./frames.ts`), the problems findings (`./problems.ts`),
 * the Inspector surface (until L-INSPECTOR) and where the rail's top clears
 * tldraw's `SharePanel` seat.
 */
export function SystemSketchPanel({ open, onClose, onSurfaceChange, problems, id }: SystemSketchPanelProps) {
  const editor = useEditor();
  const top = useRailTop(open !== null);
  const problemsContent = useMemo<ShellProblemsContent>(
    () => ({
      groups: problems.groups,
      counts: problems.counts,
      severities: PROBLEM_SEVERITIES,
      onActivate: problems.reveal,
      testIdPrefix: "ss",
      emptyCopy: {
        clear: ["No problems", "Add and connect Blocks; this view updates as the board changes."],
        filtered: ["No problems", "Choose another severity filter to see the remaining problems."],
      },
    }),
    [problems.groups, problems.counts, problems.reveal],
  );

  return (
    <ShellPanelRail
      open={open}
      onClose={onClose}
      onSurfaceChange={onSurfaceChange}
      id={id}
      top={top}
      frames={useStudioFrames}
      problems={problemsContent}
      inspector={<InspectorSurface editor={editor} />}
      testIdPrefix="ss-panel"
    />
  );
}
